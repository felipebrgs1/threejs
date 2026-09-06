import * as THREE from 'three';
import { WORLD } from '../world/world.js';
import { WEAPONS } from '../weapons/Weapon.js';

// Corpo compacto legível em iso. Vida/dash/munição = meshes no corpo, zero HUD.
const CYAN = 0x59d6ff, DIM = 0x1a2733, RED = 0xff3b30, GOLD = 0xffc857;

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.vel = new THREE.Vector3();
    this.speed = 4.4;
    this.hp = 3; this.maxHp = 3;
    this.iframes = 0;
    this.mag = 3; this.magSize = 3;
    this.weaponId = 'dardo'; this.reloadTime = 1.6;
    this.overcharge = false; this.overchargeMax = 1; this.overchargeShots = 1;
    this.nucleos = 0; // moeda da run (Q = recarga pesada, loja = compra)
    this.speedMul = 1; this.dashPenalty = 0; this.dashCdBase = 2.0;
    this.magnet = false; this.chargeGlow = 0;
    this.maxHp = 3;
    this.reloading = 0; this.reloadTime = 1.6;
    this.fireCd = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3(1, 0, 0);
    this.recoil = 0; // decai, empurra arma+corpo
    this.aimAngle = 0;
    this.markT = 0; // hitmarker na mira

    // humano: moletom + cabeça + pernas que andam
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x27606e, roughness: 0.8, metalness: 0.05 });
    this.bodyMat = bodyMat;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.4), bodyMat);
    this.body.position.y = 0.85; this.body.castShadow = true;
    this.group.add(this.body);
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skin);
    this.head.position.y = 1.32; this.head.castShadow = true;
    this.group.add(this.head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }));
    hair.scale.set(1, 0.65, 1); hair.position.y = 1.4;
    this.group.add(hair);
    const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
    legGeo.translate(0, -0.25, 0); // pivô no quadril
    const pants = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.85 });
    this.legL = new THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.14, 0.52, 0); this.legL.castShadow = true;
    this.group.add(this.legL);
    this.legR = new THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.14, 0.52, 0); this.legR.castShadow = true;
    this.group.add(this.legR);
    this.walkPhase = 0;

    // (cabeça no lugar do núcleo — i-frame pisca o corpo todo)

    // placa dorsal = vida (3 segmentos que racham/apagam)
    this.plates = [];
    const plateGeo = new THREE.BoxGeometry(0.22, 0.5, 0.08);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
        color: CYAN, emissive: CYAN, emissiveIntensity: 0.9, roughness: 0.4
      }));
      m.position.set(-0.28 + i * 0.28, 1.1, 0.26);
      m.rotation.x = -0.12;
      this.group.add(m); this.plates.push(m);
    }

    // anel do tornozelo = dash cooldown
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06;
    this.group.add(this.ring);

    // orbes no ombro = munição
    this.orbs = [];
    const orbGeo = new THREE.SphereGeometry(0.09, 12, 10);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
        color: GOLD, emissive: GOLD, emissiveIntensity: 1.4
      }));
      m.position.set(0.34, 1.3 - i * 0.2, 0.1);
      this.group.add(m); this.orbs.push(m);
    }
    // gemas de NÚCLEO no ombro oposto: moeda da run, visível no corpo
    this.gems = [];
    const gemGeo = new THREE.OctahedronGeometry(0.11);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({
        color: GOLD, emissive: GOLD, emissiveIntensity: 1.8
      }));
      m.position.set(-0.34, 1.3 - i * 0.24, 0.1);
      m.visible = false;
      this.group.add(m); this.gems.push(m);
    }

    // braço direito segura a arma e mira; esquerdo fica junto ao corpo
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x1d4a56, roughness: 0.8 });
    this.armR = new THREE.Group();
    this.armR.position.set(0.3, 1.0, 0.1);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), sleeve);
    armMesh.position.x = 0.25; armMesh.castShadow = true;
    this.armR.add(armMesh);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), sleeve);
    armL.position.set(-0.36, 0.85, 0.05); armL.castShadow = true;
    this.group.add(armL);
    // arma: caixa pesada que chuta pra trás
    this.gun = new THREE.Group();
    this.gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.4, metalness: 0.7 })
    );
    this.gunMesh.castShadow = true;
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.8 })
    );
    tip.position.x = 0.38;
    this.tipMat = tip.material;
    this.gun.add(this.gunMesh, tip);
    this.gun.position.set(0.35, 0.02, 0.1);
    this.armR.add(this.gun);
    this.group.add(this.armR);

    // mira no chão: anel achatado + haste curta
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 28),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    scene.add(this.aimRing);

    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  tryDash() {
    if (this.dashCd > 0 || this.dashT > 0) return false;
    const v = this.vel.clone(); v.y = 0;
    this.dashDir.copy(v.lengthSq() > 0.1 ? v.normalize() : new THREE.Vector3(Math.cos(this.aimAngle), 0, Math.sin(this.aimAngle)));
    this.dashT = 0.16; this.dashCd = this.dashCdBase + this.dashPenalty;
    return true;
  }
  startReload() {
    if (this.reloading <= 0 && this.mag < this.magSize) this.reloading = this.reloadTime;
  }
  canFire() { return this.fireCd <= 0 && this.reloading <= 0 && this.mag > 0 && this.dashT <= 0; }
  onFired(kick, cd = 0.42) {
    this.mag--; this.fireCd = cd; this.recoil = 1;
    // recuo empurra o corpo (massa)
    this.vel.addScaledVector(new THREE.Vector3(Math.cos(this.aimAngle), 0, Math.sin(this.aimAngle)), -kick);
  }

  onDryFire() { this.recoil = Math.max(this.recoil, 0.45); } // clique seco: arma "morde" e recarrega

  setMagSize(n) {
    this.magSize = n; this.mag = n;
    for (const o of this.orbs) this.group.remove(o);
    this.orbs = [];
    const orbGeo = new THREE.SphereGeometry(0.09, 12, 10);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
        color: GOLD, emissive: GOLD, emissiveIntensity: 1.4
      }));
      m.position.set(0.34, 1.3 - i * 0.2, 0.1);
      this.group.add(m); this.orbs.push(m);
    }
  }
  consumeNucleo() { // Q: recarga pesada + overcharge, direto do bolso
    if (this.nucleos <= 0 || this.overcharge) return false;
    this.nucleos--;
    this.mag = this.magSize; this.reloading = 0;
    this.overcharge = true; this.overchargeShots = this.overchargeMax;
    return true;
  }
  setWeapon(id) { // draft/shop trocam a fantasia inteira: pente, recarga e silhueta
    this.weaponId = id;
    const w = WEAPONS[id];
    this.reloadTime = w.reload;
    this.reloading = 0;
    this.setMagSize(w.mag);
    const dims = { dardo: [1, 1, 1], sucata: [0.75, 1.5, 1.5], estilete: [1.4, 0.6, 0.6], canhao: [1.1, 1.6, 1.6] }[id];
    this.gunMesh.scale.set(dims[0], dims[1], dims[2]);
    this.gun.children[1].position.x = 0.42 * dims[0];
  }
  setMaxHp(n) { // Remendo: reconstrói a fileira de placas e cura 1
    this.maxHp = n;
    this.hp = Math.min(this.hp + 1, n);
    for (const p of this.plates) this.group.remove(p);
    this.plates = [];
    const plateGeo = new THREE.BoxGeometry(0.22, 0.5, 0.08);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
        color: 0x59d6ff, emissive: 0x59d6ff, emissiveIntensity: 0.9, roughness: 0.4
      }));
      m.position.set((i - (n - 1) / 2) * 0.28, 1.1, 0.26);
      m.rotation.x = -0.12;
      this.group.add(m); this.plates.push(m);
    }
  }
  reset() {
    this.pos.set(0, 0, 0); this.vel.set(0, 0, 0);
    this.speed = 4.4;
    this.setMaxHp(3); this.hp = 3; this.iframes = 0;
    this.setWeapon('dardo');
    this.reloading = 0;
    this.fireCd = 0; this.dashT = 0; this.dashCd = 0; this.recoil = 0;
    this.overcharge = false; this.overchargeMax = 1; this.overchargeShots = 1;
    this.nucleos = 0; this.markT = 0; this.chargeGlow = 0;
    this.speedMul = 1; this.dashPenalty = 0; this.dashCdBase = 2.0;
    this.magnet = false;
  }

  damage() {
    if (this.hp <= 0 || this.iframes > 0 || this.dashT > 0) return false;
    this.hp--; this.iframes = 0.9;
    return true;
  }

  update(dt, input, aimPoint) {
    // aim
    const dx = aimPoint.x - this.pos.x, dz = aimPoint.z - this.pos.z;
    this.aimAngle = Math.atan2(dz, dx);
    // só o braço armado gira com a mira — o corpo fica fixo p/ câmera ler colete/orbes
    this.armR.rotation.y = -this.aimAngle;

    // movimento com inércia leve (input já vem em espaço do mundo)
    const slow = this.reloading > 0 ? 0.7 : 1;
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        // fim do dash: devolve velocidade normal, sem resíduo dos 34 m/s
        this.vel.copy(this.dashDir).multiplyScalar(this.speed * slow);
      } else {
        // 4m em 0.16s = 25 m/s durante o dash (nerf: dash é recurso, não passe livre)
        this.vel.copy(this.dashDir).multiplyScalar(4.0 / 0.16);
      }
    } else {
      this.vel.x = THREE.MathUtils.damp(this.vel.x, input.x * this.speed * slow * this.speedMul, 10, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, input.z * this.speed * slow * this.speedMul, 10, dt);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // arena 10x10
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -WORLD.half, WORLD.half);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -WORLD.half, WORLD.half);

    this.fireCd -= dt; this.dashCd -= dt; this.iframes -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.mag = this.magSize;
    }

    // --- visuais no corpo ---
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.gun.position.x = 0.35 - this.recoil * 0.22;
    this.body.position.x = -this.recoil * 0.06;
    // inclina o corpo na direção do movimento — leitura de velocidade em iso
    this.body.rotation.z = THREE.MathUtils.clamp(-this.vel.x * 0.03, -0.18, 0.18) - this.recoil * 0.06;
    this.body.rotation.x = THREE.MathUtils.clamp(this.vel.z * 0.03, -0.18, 0.18);
    // pernas alternam com a velocidade
    this.walkPhase += dt * this.vel.length() * 2.6;
    const swing = Math.min(1, this.vel.length() / 3) * 0.55;
    this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;

    // i-frame: corpo todo pisca (flicker clássico de humano)
    this.group.visible = this.iframes > 0 ? (Math.sin(performance.now() * 0.06) > -0.2) : true;
    this.bodyMat.color.setHex(this.iframes > 0 ? 0x5a6b7d : 0x27606e);

    // placas de vida: apagadas conforme perde
    this.plates.forEach((p, i) => {
      const alive = i < this.hp;
      p.material.emissiveIntensity = alive ? 0.9 : 0.05;
      p.material.color.setHex(alive ? CYAN : 0x222a32);
      p.rotation.z = alive ? 0 : 0.5; // quebrada tomba
    });
    // anel dash: some durante cooldown
    const ready = this.dashCd <= 0;
    this.ring.material.opacity = ready ? 0.9 : 0.18;
    this.ring.scale.setScalar(ready ? 1 : 0.8);
    // orbes munição: apaga + mostra reload varrendo
    this.orbs.forEach((o, i) => {
      const has = i < this.mag;
      o.visible = true;
      o.material.emissiveIntensity = has ? 1.4 : 0.05;
      o.material.color.setHex(has ? GOLD : 0x2a2f36);
      if (this.reloading > 0) {
        const p = 1 - this.reloading / this.reloadTime;
        o.scale.setScalar(has ? 1 : (i === this.mag ? 0.4 + p * 0.6 : 0.6));
      } else o.scale.setScalar(1);
    });
    this.gems.forEach((g, i) => { g.visible = i < this.nucleos; g.rotation.y += dt * 3; });
    // ponta da arma: branca em overcharge, laranja carregando o canhão
    this.tipMat.emissiveIntensity = this.overcharge
      ? 2.2 + Math.sin(performance.now() * 0.015)
      : 0.8 + this.chargeGlow * 3;
    this.tipMat.color.setHex(this.overcharge ? 0xffffff : this.chargeGlow > 0.05 ? 0xffb36b : GOLD);
    // mira no chão — pisca branca no acerto (hitmarker, zero número)
    this.aimRing.position.set(aimPoint.x, 0.03, aimPoint.z);
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.06;
    if (this.markT > 0) {
      this.markT -= dt;
      this.aimRing.material.color.setHex(0xffffff);
      this.aimRing.scale.setScalar(pulse * 1.6);
    } else {
      this.aimRing.material.color.setHex(CYAN);
      this.aimRing.scale.setScalar(pulse);
    }
  }
}

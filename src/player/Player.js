import * as THREE from 'three';
import { WORLD } from '../world/world.js';

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
    this.overcharge = false; // ★ do NÚCLEO: próximo tiro com dano 2
    this.nucleos = 0; // moeda da run (Q = recarga pesada, loja = compra)
    this.speedMul = 1; this.dashPenalty = 0; this.dashCdBase = 1.6;
    this.reloading = 0; this.reloadTime = 1.6;
    this.fireCd = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3(1, 0, 0);
    this.recoil = 0; // decai, empurra arma+corpo
    this.aimAngle = 0;
    this.markT = 0; // hitmarker na mira

    // corpo: cápsula
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b3d4f, roughness: 0.55, metalness: 0.35 });
    this.bodyMat = bodyMat;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 12), bodyMat);
    this.body.position.y = 0.85; this.body.castShadow = true;
    this.group.add(this.body);

    // núcleo do peito (pisca no i-frame)
    this.core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.6 })
    );
    this.core.position.set(0, 1.05, 0);
    this.group.add(this.core);

    // placa dorsal = vida (3 segmentos que racham/apagam)
    this.plates = [];
    const plateGeo = new THREE.BoxGeometry(0.22, 0.5, 0.08);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
        color: CYAN, emissive: CYAN, emissiveIntensity: 0.9, roughness: 0.4
      }));
      m.position.set(-0.28 + i * 0.28, 1.15, 0.38);
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
      m.position.set(0.42, 1.35 - i * 0.2, 0.1);
      this.group.add(m); this.orbs.push(m);
    }
    // gemas de NÚCLEO no ombro oposto: moeda da run, visível no corpo
    this.gems = [];
    const gemGeo = new THREE.OctahedronGeometry(0.11);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({
        color: GOLD, emissive: GOLD, emissiveIntensity: 1.8
      }));
      m.position.set(-0.42, 1.35 - i * 0.24, 0.1);
      m.visible = false;
      this.group.add(m); this.gems.push(m);
    }

    // arma: caixa pesada que chuta pra trás
    this.gun = new THREE.Group();
    const gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.4, metalness: 0.7 })
    );
    gunMesh.castShadow = true;
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.8 })
    );
    tip.position.x = 0.38;
    this.tipMat = tip.material;
    this.gun.add(gunMesh, tip);
    this.gun.position.set(0.3, 0.95, 0.25);
    this.group.add(this.gun);

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
  onFired(kick) {
    this.mag--; this.fireCd = 0.42; this.recoil = 1;
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
      m.position.set(0.42, 1.35 - i * 0.2, 0.1);
      this.group.add(m); this.orbs.push(m);
    }
  }
  consumeNucleo() { // Q: recarga pesada + overcharge, direto do bolso
    if (this.nucleos <= 0 || this.overcharge) return false;
    this.nucleos--;
    this.mag = this.magSize; this.reloading = 0; this.overcharge = true;
    return true;
  }
  reset() {
    this.pos.set(0, 0, 0); this.vel.set(0, 0, 0);
    this.hp = 3; this.iframes = 0;
    this.setMagSize(3); this.reloading = 0;
    this.fireCd = 0; this.dashT = 0; this.dashCd = 0; this.recoil = 0;
    this.overcharge = false; this.nucleos = 0; this.markT = 0;
    this.speedMul = 1; this.dashPenalty = 0; this.dashCdBase = 1.6;
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
    // só a arma gira com a mira — o corpo fica fixo p/ câmera ler placa/orbes
    this.gun.rotation.y = -this.aimAngle;

    // movimento com inércia leve (input já vem em espaço do mundo)
    const slow = this.reloading > 0 ? 0.7 : 1;
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        // fim do dash: devolve velocidade normal, sem resíduo dos 34 m/s
        this.vel.copy(this.dashDir).multiplyScalar(this.speed * slow);
      } else {
        // 5.5m em 0.16s = 34.4 m/s durante o dash
        this.vel.copy(this.dashDir).multiplyScalar(5.5 / 0.16);
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
    this.gun.position.x = 0.3 - this.recoil * 0.22;
    this.body.position.x = -this.recoil * 0.06;
    // inclina o corpo na direção do movimento — leitura de velocidade em iso
    this.body.rotation.z = THREE.MathUtils.clamp(-this.vel.x * 0.03, -0.18, 0.18) - this.recoil * 0.06;
    this.body.rotation.x = THREE.MathUtils.clamp(this.vel.z * 0.03, -0.18, 0.18);

    // i-frame: pisca núcleo
    this.core.material.emissiveIntensity = this.iframes > 0
      ? (Math.sin(performance.now() * 0.05) > 0 ? 2.5 : 0.2) : 1.6;
    this.bodyMat.color.setHex(this.iframes > 0 ? 0x5a6b7d : 0x2b3d4f);

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
    // ponta da arma acende branca em overcharge
    this.tipMat.emissiveIntensity = this.overcharge ? 2.2 + Math.sin(performance.now() * 0.015) : 0.8;
    this.tipMat.color.setHex(this.overcharge ? 0xffffff : GOLD);
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

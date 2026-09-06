import * as THREE from 'three';
import { collideWorld, WORLD } from '../world/world.js';
import { sfx } from '../audio/sfx.js';

// Sentinela-placa: escudo frontal destacável + canhão + corpo.
// Com placa: cone telegrafado, fan 3. Sem placa: mais rápido, frágil, sem cone.
const RED = 0xff3b30, DARK = 0x3a2320;

export class Sentinel {
  constructor(scene, telegraph, x, z) {
    this.scene = scene; this.telegraph = telegraph;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.kind = 'sentinel';
    this.hp = 3; this.dead = false;
    this.lobCd = 5; // anti-camp: granada quando o player para
    this.hasPlate = true;
    this.state = 'chase'; this.t = 1.2;
    this.flash = 0;
    this.speed = 1.7;
    this.fireCd = 2.0;

    const armor = new THREE.MeshStandardMaterial({ color: 0x5a6b4a, roughness: 0.85, metalness: 0.05 }); // pele doente
    this.armorMat = armor;

    // corpo
    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), armor);
    this.bodyMesh.position.y = 0.85; this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh);
    // cabeça + pernas que arrastam
    const zskin = new THREE.MeshStandardMaterial({ color: 0x9aa07a, roughness: 0.9 });
    this.zhead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), zskin);
    this.zhead.position.y = 1.65; this.zhead.castShadow = true;
    this.group.add(this.zhead);
    const zpants = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.9 });
    this.zlegL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), zpants);
    this.zlegL.position.set(-0.22, 0.28, 0);
    this.group.add(this.zlegL);
    this.zlegR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), zpants);
    this.zlegR.position.set(0.22, 0.28, 0);
    this.group.add(this.zlegR);
    this.zphase = Math.random() * 10;
    // núcleo (ponto fraco traseiro)
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22),
      new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 1.8 }));
    this.core.position.set(0, 1.0, -0.55);
    this.group.add(this.core);
    // canhão lateral
    this.cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.8, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.6, metalness: 0.4 }));
    this.cannon.rotation.z = Math.PI / 2; this.cannon.position.set(0.35, 0.9, 0.3);
    this.group.add(this.cannon);
    // PLACA frontal destacável (o módulo)
    this.plate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.4, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.2, emissive: RED, emissiveIntensity: 0.05 }));
    this.plate.position.set(0, 0.95, 0.55); this.plate.castShadow = true;
    this.group.add(this.plate);
    // alça da porta de geladeira (filha — voa junto no detach)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.5 }));
    handle.position.set(0.38, 0, 0.12);
    this.plate.add(handle);
    // sombra blob
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18),
      new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);

    scene.add(this.group);
    this.tele = null;
  }

  get pos() { return this.group.position; }
  faceAngle() { return this.group.rotation.y; }

  // teste de acerto: retorna 'plate' | 'body' | null
  hitTest(p, r) {
    if (this.dead) return null;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    if (dx * dx + dz * dz > (1.0 + r) * (1.0 + r) || p.y > 1.9) return null;
    if (this.hasPlate) {
      // placa cobre cone frontal de ±60° na direção que olha
      const fwd = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
      const d = new THREE.Vector3(dx, 0, dz).normalize();
      // balas vêm de trás do vetor direção? placa bloqueia se tiro chega de frente
      const dot = fwd.dot(d.clone().negate());
      if (dot > 0.35) return 'plate';
    }
    return 'body';
  }

  detachPlate(shards, hitDir, fx) {
    if (!this.hasPlate) return;
    this.hasPlate = false;
    this.group.remove(this.plate);
    shards.spawn(this.plate, new THREE.Vector3(this.pos.x, 1.0, this.pos.z), hitDir);
    this.speed = 2.6; // mais rápido e burro
    this.fireCd = Math.min(this.fireCd, 0.6);
    sfx('crunch');
    fx.hitstop(0.09); fx.shake(0.16);
  }

  damage(n, fx) {
    this.hp -= n; this.flash = 1;
    if (this.hp <= 0) this.die(fx);
    else { sfx('hit'); fx.hitstop(0.05); fx.shake(0.08); }
  }

  die(fx) {
    if (this.dead) return;
    this.dead = true;
    if (this.tele) { this.telegraph.clear(this.tele); this.tele = null; }
    // desmonte: corpo + canhão + (placa se ainda tiver) viram shards
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    fx.shards.spawn(this.bodyMesh, this.pos.clone().setY(0.9), dir);
    fx.shards.spawn(this.cannon, this.pos.clone().setY(0.9), dir.clone().negate());
    if (this.hasPlate) fx.shards.spawn(this.plate, this.pos.clone().setY(1), dir.clone());
    fx.shards.spawn(this.core, this.pos.clone().setY(1), new THREE.Vector3(0, 0, 1));
    if (fx.pickups) {
      if (Math.random() < 0.22) fx.pickups.dropNucleo(this.pos); // NÚCLEO raro
      else { fx.pickups.dropSucata(this.pos); fx.pickups.dropSucata(this.pos); }
    }
    sfx('crunch');
    fx.blood?.splatter(this.pos.x, this.pos.z, 1.2);
    this.scene.remove(this.group);
    fx.hitstop(0.12); fx.shake(0.2);
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armorMat.emissive = new THREE.Color(RED);
    this.armorMat.emissiveIntensity = this.flash * 0.9;
    this.fireCd -= dt; this.lobCd -= dt;

    const toP = new THREE.Vector3().subVectors(player.pos, this.pos); toP.y = 0;
    const dist = toP.length();
    const wantAngle = Math.atan2(toP.x, toP.z);
    // gira com inércia
    let cur = this.group.rotation.y;
    let diff = ((wantAngle - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.group.rotation.y = cur + THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);

    if (this.state === 'chase') {
      if (dist > 5.5) {
        this.pos.addScaledVector(toP.normalize(), this.speed * dt);
      } else if (dist < 3.2) {
        this.pos.addScaledVector(toP.normalize(), -this.speed * 0.7 * dt);
      } else {
        // strafe lento — guarda posição
        this.pos.x += Math.cos(performance.now() * 0.0006) * dt * 0.8;
      }
      if (this.fireCd <= 0 && dist < 11 && Math.abs(diff) < 0.4) {
        this.state = 'telegraph';
        this.t = (this.hasPlate ? 0.55 : 0.35) * (fx.mods?.telegraphMul ?? 1); // Olho Claro alonga
        const arc = this.hasPlate ? Math.PI / 3 : 0.25;
        this.tele = this.telegraph.sector(this.pos, -wantAngle + Math.PI / 2, arc, 8, this.t);
        // anel de aviso sob o player também (lane justo)
      }
    } else if (this.state === 'telegraph') {
      this.t -= dt;
      // trava mira no player (lento) — dá pra sair do cone andando
      if (this.t <= 0) {
        this.state = 'chase';
        this.fireCd = (this.hasPlate ? 2.2 : 1.3) * (fx.mods?.enemyFireMul ?? 1); // Director acelera com as ondas
        // dispara fan de 3 (ou tiro reto sem placa)
        const base = Math.atan2(toP.x, toP.z);
        const spread = this.hasPlate ? [-0.16, 0, 0.16] : [0];
        for (const s of spread) {
          const d = new THREE.Vector3(Math.sin(base + s), 0, Math.cos(base + s));
          bullets.fire(this.pos.clone().addScaledVector(d, 0.8), d, 7.5, true, 1.0);
        }
        sfx('foeShoot');
        fx.shake(0.06);
      }
    }
    // anti-camp: player parado há 3.5s leva granada lobada por cima da cobertura
    if (fx.grenades && fx.still && this.state === 'chase' && this.lobCd <= 0 && fx.still.t > 3.5 && dist < 10.5) {
      const tgt = player.pos.clone().addScaledVector(player.vel, 0.35);
      tgt.x = THREE.MathUtils.clamp(tgt.x, -WORLD.half, WORLD.half); tgt.z = THREE.MathUtils.clamp(tgt.z, -WORLD.half, WORLD.half);
      fx.grenades.throw(this.pos.clone().setY(1.2), tgt);
      sfx('lob');
      this.lobCd = 8; fx.still.t = 0;
    }
    if (fx.room) collideWorld(fx.room, this.pos, 0.55);
    // bob + arrastar de pernas para ler volume em iso
    this.zphase += dt * 3;
    this.bodyMesh.position.y = 0.85 + Math.sin(this.zphase) * 0.04;
    this.zhead.position.y = 1.65 + Math.sin(this.zphase + 1) * 0.05;
    this.zhead.rotation.z = Math.sin(this.zphase * 0.6) * 0.15; // cabeça pendida
    this.zlegL.rotation.x = Math.sin(this.zphase) * 0.45;
    this.zlegR.rotation.x = -Math.sin(this.zphase) * 0.45;
  }
}

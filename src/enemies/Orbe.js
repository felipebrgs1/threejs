import * as THREE from 'three';
import { collideWorld } from '../world/world.js';
import { sfx } from '../audio/sfx.js';

// Orbe-partícula (sacrificial): flutua até perto, infla 0.6s com disco crescente
// no piso e explode em 6 shards FÍSICOS que queimam. Atirar no anel primeiro
// diminui a explosão — atirar no núcleo detona na hora (inclusive perto de você).
const RED = 0xff3b30;

export class Orbe {
  constructor(scene, telegraph, x, z) {
    this.kind = 'orbe';
    this.scene = scene; this.telegraph = telegraph;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.dead = false;
    this.hasRing = true;
    this.blastR = 2.4; this.fuseDur = 0.6;
    this.state = 'chase'; this.t = 0;
    this.speed = 2.3;
    this.phase = Math.random() * 10;

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x6b4a3a, emissive: RED, emissiveIntensity: 1.2, roughness: 0.6 })
    );
    this.core.position.y = 1.0; this.core.castShadow = true;
    this.group.add(this.core);
    // cabecinha + bracinhos atrofiados no barrigão
    const zskin = new THREE.MeshStandardMaterial({ color: 0x9aa07a, roughness: 0.9 });
    const zhead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), zskin);
    zhead.position.y = 1.5;
    this.group.add(zhead);
    [-0.45, 0.45].forEach(x => {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), zskin);
      arm.position.set(x, 1.0, 0.1);
      this.group.add(arm);
    });

    this.ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.09, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0x8a2a22, emissive: RED, emissiveIntensity: 0.7, roughness: 0.5 })
    );
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 1.0; this.ringMesh.castShadow = true;
    this.group.add(this.ringMesh);

    // disco de inflação: cresce 0 → blastR durante o fuse
    this.fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.fill.rotation.x = -Math.PI / 2; this.fill.position.y = 0.035;
    this.group.add(this.fill);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);

    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  hitTest(p, r) {
    if (this.dead) return null;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const rr = (this.hasRing ? 0.95 : 0.55) + r;
    if (dx * dx + dz * dz > rr * rr || p.y > 1.9) return null;
    return this.hasRing ? 'ring' : 'core';
  }

  detachRing(shards, dir, fx) {
    if (!this.hasRing) return;
    this.hasRing = false;
    this.group.remove(this.ringMesh);
    shards.spawn(this.ringMesh, new THREE.Vector3(this.pos.x, 1.0, this.pos.z), dir);
    this.blastR = 1.3; this.fuseDur = 0.35; // sem anel: explode rápido mas pequeno
    if (this.state === 'inflate') this.t = Math.min(this.t, 0.35);
    sfx('crunch');
    fx.hitstop(0.09); fx.shake(0.16);
  }

  detonate(fx, player) {
    if (this.dead) return;
    this.dead = true;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2),
        new THREE.MeshStandardMaterial({ color: 0x7a1a1a, emissive: RED, emissiveIntensity: 1.2, roughness: 0.5 })
      );
      fx.shards.spawn(m, new THREE.Vector3(this.pos.x, 1.0, this.pos.z),
        new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), { hot: true, hotT: 1.2 });
    }
    this.telegraph.ring(new THREE.Vector3(this.pos.x, 0, this.pos.z), this.blastR, 0.3);
    fx.blood?.splatter(this.pos.x, this.pos.z, 1.6);
    // dano no player (respeita i-frame/dash) + knockback
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < this.blastR + 0.3) {
      if (player.damage()) { fx.hitstop(0.08); fx.shake(0.2); }
      if (d > 0.01) player.vel.addScaledVector(new THREE.Vector3(dx / d, 0, dz / d), 6);
    }
    // fogo amigo: tudo na área sofre — sentinela toma 2, parasita morre, útero racha
    for (const e of fx.foes()) {
      if (e === this || e.dead || e.kind === 'orbe') continue;
      const ex = e.pos.x - this.pos.x, ez = e.pos.z - this.pos.z;
      const ed = Math.hypot(ex, ez);
      if (ed < this.blastR + (e.kind === 'utero' ? 1.2 : 0.6)) {
        e.damage(e.kind === 'parasita' ? 1 : 2, fx);
        if (e.kind === 'sentinel' && ed > 0.01) e.pos.addScaledVector(new THREE.Vector3(ex / ed, 0, ez / ed), 0.6);
      }
    }
    if (fx.room) for (const cov of fx.room.covers) {
      if (!cov.dead && Math.hypot(cov.group.position.x - this.pos.x, cov.group.position.z - this.pos.z) < this.blastR + 1) {
        cov.hit(new THREE.Vector3(1, 0, 0));
      }
    }
    if (fx.pickups) { fx.pickups.dropSucata(this.pos); fx.pickups.dropSucata(this.pos); }
    sfx('boom');
    this.scene.remove(this.group);
    fx.hitstop(0.1); fx.shake(0.22);
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.phase += dt * 3;
    const toP = new THREE.Vector3().subVectors(player.pos, this.pos); toP.y = 0;
    const dist = toP.length();
    if (this.state === 'chase') {
      if (dist > 2.6) {
        this.pos.addScaledVector(toP.normalize(), this.speed * dt);
      } else {
        this.state = 'inflate';
        const dur = this.fuseDur * (fx.mods?.telegraphMul ?? 1); // Olho Claro alonga
        this.t = dur;
        sfx('inflate');
        this.telegraph.ring(new THREE.Vector3(this.pos.x, 0, this.pos.z), this.blastR, dur);
      }
    } else {
      this.t -= dt;
      const k = 1 - Math.max(0, this.t) / this.fuseDur;
      this.fill.material.opacity = 0.1 + k * 0.3;
      this.fill.scale.setScalar(Math.max(0.01, this.blastR * k));
      this.core.scale.setScalar(1 + k * 0.45 + Math.sin(this.phase * 6) * 0.05);
      this.core.material.emissiveIntensity = 1.6 + k * 2;
      if (dist > 1.2) this.pos.addScaledVector(toP.normalize(), this.speed * 0.25 * dt);
      if (this.t <= 0) this.detonate(fx, player);
    }
    if (fx.room) collideWorld(fx.room, this.pos, 0.45);
    this.core.position.y = 1.0 + Math.sin(this.phase) * 0.08;
    if (this.hasRing) this.ringMesh.position.y = this.core.position.y;
  }
}

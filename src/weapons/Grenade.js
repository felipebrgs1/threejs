import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';

// Granada lobada: arco por cima da cobertura baixa, sombra que CRESCE ao descer,
// anel no piso desde o arremesso (lane justo), explosão em área.
export class GrenadePool {
  constructor(scene, max = 6) {
    this.scene = scene;
    this.items = [];
    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x14181d, emissive: 0xff3b30, emissiveIntensity: 0.6, roughness: 0.5 })
      );
      mesh.visible = false; mesh.castShadow = true;
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 12),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2; shadow.visible = false;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.05, 2.3, 40),
        new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2; ring.visible = false;
      scene.add(mesh, shadow, ring);
      this.items.push({ mesh, shadow, ring, active: false, vel: new THREE.Vector3(), phase: 'fly', t: 0, fuse: 0, fuseMax: 1, blastR: 2.3 });
    }
    this.flashes = [];
  }
  throw(from, target) {
    const g = this.items.find(i => !i.active);
    if (!g) return;
    const T = 0.85, GRAV = 12;
    g.active = true; g.phase = 'fly'; g.t = T;
    g.fuse = T + 0.75; g.fuseMax = g.fuse;
    g.mesh.visible = g.shadow.visible = g.ring.visible = true;
    g.mesh.position.copy(from);
    g.vel.set(
      (target.x - from.x) / T,
      (0.15 - from.y + 0.5 * GRAV * T * T) / T,
      (target.z - from.z) / T
    );
    g.ring.position.set(target.x, 0.04, target.z);
    g.ring.material.opacity = 0.3;
  }
  explode(g, player, room, fx) {
    const cx = g.mesh.position.x, cz = g.mesh.position.z;
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.85, depthWrite: false })
    );
    f.position.set(cx, 0.5, cz);
    this.scene.add(f);
    this.flashes.push({ mesh: f, t: 0.16 });
    const dx = player.pos.x - cx, dz = player.pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < g.blastR + 0.3) {
      if (player.damage()) { fx.hitstop(0.08); fx.shake(0.2); }
      if (d > 0.01) player.vel.addScaledVector(new THREE.Vector3(dx / d, 0, dz / d), 5);
    }
    if (room) for (const cov of room.covers) {
      if (!cov.dead && Math.hypot(cov.group.position.x - cx, cov.group.position.z - cz) < g.blastR + 1) {
        cov.hit(new THREE.Vector3(dx, 0, dz));
      }
    }
    if (room) for (const crate of room.loot || []) {
      if (!crate.dead && Math.hypot(crate.group.position.x - cx, crate.group.position.z - cz) < g.blastR + 1) {
        crate.hit(new THREE.Vector3(dx, 0, dz));
      }
    }
    sfx('boom');
    fx.hitstop(0.09); fx.shake(0.24);
    g.active = false;
    g.mesh.visible = g.shadow.visible = g.ring.visible = false;
  }
  update(dt, player, room, fx) {
    for (const g of this.items) {
      if (!g.active) continue;
      g.fuse -= dt;
      const urgency = 1 - Math.max(0, g.fuse) / g.fuseMax;
      const blink = 0.5 + 0.5 * Math.sin(performance.now() * 0.02 * (1 + urgency * 3));
      g.mesh.material.emissiveIntensity = 0.6 + urgency * 3 * blink;
      g.ring.material.opacity = 0.3 + urgency * 0.55;
      if (g.phase === 'fly') {
        g.t -= dt;
        g.vel.y -= 12 * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        const p = g.mesh.position;
        if (p.y <= 0.15 || g.t <= 0) { p.y = 0.15; g.phase = 'armed'; fx.shake(0.04, 0.05); }
      } else {
        g.mesh.position.y = 0.15;
        g.mesh.rotation.y += dt * 4;
      }
      const p = g.mesh.position;
      g.shadow.position.set(p.x, 0.025, p.z);
      // sombra crescente: granada descendo = sombra maior e mais escura
      g.shadow.scale.setScalar(THREE.MathUtils.clamp(1.15 - p.y * 0.25, 0.45, 1.15));
      if (g.fuse <= 0) this.explode(g, player, room, fx);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t -= dt;
      fl.mesh.scale.setScalar(0.5 + (0.16 - Math.max(0, fl.t)) * 14);
      fl.mesh.material.opacity = Math.max(0, fl.t) / 0.16 * 0.85;
      if (fl.t <= 0) {
        this.scene.remove(fl.mesh);
        fl.mesh.geometry.dispose(); fl.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
  deactivateAll() {
    for (const g of this.items) {
      g.active = false;
      g.mesh.visible = g.shadow.visible = g.ring.visible = false;
    }
    for (const f of this.flashes) this.scene.remove(f.mesh);
    this.flashes.length = 0;
  }
}

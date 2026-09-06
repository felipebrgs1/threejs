import * as THREE from 'three';
import { collideWorld } from '../world/world.js';
import { sfx } from '../audio/sfx.js';

// Parasita-losango: persegue, GRUDA no player (slow + dash mais caro) e só sai
// no dash — que o arremessa como projétil contra outros inimigos.
const ORANGE = 0xff7a1a;

export class Parasita {
  constructor(scene, x, z) {
    this.kind = 'parasita';
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.dead = false;
    this.attached = false;
    this.attachA = Math.random() * Math.PI * 2;
    this.flying = false; this.flyT = 0;
    this.flyVel = new THREE.Vector3();
    this.speed = 3.4;
    this.phase = Math.random() * 10;

    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, emissive: ORANGE, emissiveIntensity: 0.7, roughness: 0.8 })
    );
    this.mesh.position.y = 0.7; this.mesh.castShadow = true;
    this.group.add(this.mesh);
    // cabeça + bracinhos que se arrastam (filhos — clonam junto no shard)
    const zskin = new THREE.MeshStandardMaterial({ color: 0x9aa07a, roughness: 0.9 });
    const phead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), zskin);
    phead.position.set(0, 0.08, 0.28);
    this.mesh.add(phead);
    [-0.2, 0.2].forEach(x => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), zskin);
      arm.position.set(x, -0.05, 0.15);
      this.mesh.add(arm);
    });
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);
    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  center(player) {
    return this.attached ? player.pos : this.pos;
  }

  hitTest(p, r) {
    if (this.dead || this.flying) return null;
    if (this.attached) return null; // grudado só sai no dash — regra limpa
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const rr = 0.35 + r;
    if (dx * dx + dz * dz > rr * rr || p.y > 1.5) return null;
    return 'body';
  }

  damage(n, fx) {
    if (this.dead) return;
    this.dead = true;
    sfx('hit');
    fx.shards.spawn(this.mesh, new THREE.Vector3(this.pos.x, 0.7, this.pos.z),
      new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5));
    fx.blood?.splatter(this.pos.x, this.pos.z, 0.6);
    this.scene.remove(this.group);
  }

  // dash arranca grudados e os transforma em projéteis (dano 1, detona orbe)
  fling(dirH, fx) {
    this.attached = false;
    this.flying = true; this.flyT = 0.55;
    this.flyVel.copy(dirH).multiplyScalar(14);
    this.mesh.position.y = 0.9;
    fx.shake(0.06, 0.06);
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.phase += dt * 5;
    if (this.flying) {
      this.flyT -= dt;
      this.pos.addScaledVector(this.flyVel, dt);
      this.mesh.rotation.y += dt * 14;
      // acerta o primeiro inimigo no caminho
      for (const e of fx.foes()) {
        if (e === this || e.dead) continue;
        const er = e.kind === 'utero' ? 1.2 : 0.7;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        if (dx * dx + dz * dz < er * er) {
          if (e.kind === 'orbe') e.detonate(fx, player);
          else e.damage(1, fx);
          this.damage(1, fx); // se consome no impacto
          return;
        }
      }
      if (this.flyT <= 0) { this.flying = false; this.mesh.position.y = 0.7; }
      return;
    }
    if (this.attached) {
      this.attachA += dt * 1.5;
      this.pos.set(
        player.pos.x + Math.cos(this.attachA) * 0.55, 0,
        player.pos.z + Math.sin(this.attachA) * 0.55
      );
      this.mesh.position.y = 1.0 + Math.sin(this.phase) * 0.06;
      this.mesh.rotation.y += dt * 6;
      return;
    }
    // persegue com leve zigue-zague
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) {
      this.attached = true;
      sfx('stick');
      this.attachA = Math.atan2(this.pos.z - player.pos.z, this.pos.x - player.pos.x);
      fx.shake(0.06, 0.06);
      return;
    }
    if (d > 0.01) {
      const wob = Math.sin(this.phase) * 0.5;
      const nx = dx / d, nz = dz / d;
      this.pos.x += (nx + -nz * wob * 0.4) * this.speed * dt;
      this.pos.z += (nz + nx * wob * 0.4) * this.speed * dt;
    }
    if (fx.room) collideWorld(fx.room, this.pos, 0.25);
    this.mesh.position.y = 0.7 + Math.abs(Math.sin(this.phase)) * 0.15;
    this.mesh.rotation.y += dt * 3;
  }
}

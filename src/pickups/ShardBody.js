import * as THREE from 'three';
import { WORLD } from '../world/world.js';

// Peça arrancada = mesh com física própria (gravidade, quique, atrito).
// Bloqueia 1 bala por 0.5s após soltar, depois vira sucata.
export class ShardField {
  constructor(scene) {
    this.scene = scene;
    this.shards = [];
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  }
  spawn(mesh, pos, dir, opts = {}) {
    // clona aparência, dá corpo
    const m = mesh.clone();
    m.material = mesh.material.clone();
    m.position.copy(pos); m.castShadow = true;
    this.scene.add(m);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), this.shadowMat.clone());
    shadow.rotation.x = -Math.PI / 2; this.scene.add(shadow);
    const hot = !!opts.hot;
    this.shards.push({
      mesh: m, shadow,
      vel: new THREE.Vector3(dir.x * (4 + Math.random() * 4), 3.5 + Math.random() * 2.5, dir.z * (4 + Math.random() * 4)),
      ang: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
      life: 6, blockT: 0.5, r: 0.4,
      hot, hotT: hot ? (opts.hotT ?? 1.2) : 0
    });
    if (hot) { m.material.emissive = new THREE.Color(0xff3b30); m.material.emissiveIntensity = 1.6; }
  }
  // retorna shard que bloqueou o ponto (para ProjectilePool/world)
  blocksAt(x, z) {
    return this.shards.find(s => s.blockT > 0 && s.mesh.position.y < 1.4 &&
      (s.mesh.position.x - x) ** 2 + (s.mesh.position.z - z) ** 2 < s.r * s.r);
  }
  update(dt) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt; s.blockT -= dt;
      // shard quente queima por ~1.2s e depois esfria (vira sucata inerte)
      if (s.hotT > 0) {
        s.hotT -= dt;
        s.mesh.material.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.02) * 0.8;
        if (s.hotT <= 0) s.mesh.material.emissiveIntensity = 0.15;
      }
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.ang.x * dt; s.mesh.rotation.y += s.ang.y * dt;
      const p = s.mesh.position;
      if (p.y < 0.15) { p.y = 0.15; s.vel.y *= -0.42; s.vel.x *= 0.7; s.vel.z *= 0.7; s.ang.multiplyScalar(0.6); }
      if (Math.abs(p.x) > WORLD.half + 0.5) { p.x = Math.sign(p.x) * (WORLD.half + 0.5); s.vel.x *= -0.5; }
      if (Math.abs(p.z) > WORLD.half + 0.5) { p.z = Math.sign(p.z) * (WORLD.half + 0.5); s.vel.z *= -0.5; }
      s.shadow.position.set(p.x, 0.025, p.z);
      s.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - p.y * 0.2, 0.4, 1));
      // pisca antes de virar sucata fria
      if (s.life < 1.2) s.mesh.material.emissiveIntensity = Math.max(0, (s.life - 0.2)) * 0.8;
      if (s.life <= 0) {
        // vira sucata estática (fica no chão, sem colisão)
        s.mesh.rotation.set(0, s.mesh.rotation.y, 0); s.mesh.position.y = 0.1;
        this.scene.remove(s.shadow);
        this.shards.splice(i, 1);
      }
    }
  }
  clear() {
    for (const s of this.shards) { this.scene.remove(s.mesh); this.scene.remove(s.shadow); }
    this.shards.length = 0;
  }
}

import * as THREE from 'three';
import { WORLD } from '../world/world.js';

// Pool único: slugs do player (caixas pesadas) + balas inimigas (octaedros).
// Cada tiro = mesh + sombra blob no chão + tempo de voo legível.
export class ProjectilePool {
  constructor(scene, max = 64) {
    this.scene = scene;
    this.items = [];
    this.shadowGeo = new THREE.CircleGeometry(0.16, 14);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
    const slugGeo = new THREE.BoxGeometry(0.55, 0.14, 0.14);
    const foeGeo = new THREE.OctahedronGeometry(0.2);
    for (let i = 0; i < max; i++) {
      const isFoe = i >= 24; // 24 player, resto inimigo
      const mesh = new THREE.Mesh(
        isFoe ? foeGeo : slugGeo,
        new THREE.MeshStandardMaterial({
          color: isFoe ? 0xff3b30 : 0xffc857,
          emissive: isFoe ? 0xff3b30 : 0xffc857, emissiveIntensity: 1.8,
          roughness: 0.35
        })
      );
      mesh.visible = false; mesh.castShadow = !isFoe;
      const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat.clone());
      shadow.rotation.x = -Math.PI / 2; shadow.visible = false;
      // rastro curto: barra esticada atrás
      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: isFoe ? 0xff3b30 : 0xffc857, transparent: true, opacity: 0.35 })
      );
      trail.visible = false;
      scene.add(mesh, shadow, trail);
      this.items.push({ mesh, shadow, trail, active: false, foe: isFoe, vel: new THREE.Vector3(), life: 0, r: isFoe ? 0.3 : 0.35, dmg: 1, hitSet: new Set() });
    }
  }
  fire(pos, dir, speed, foe = false, y = 1.0) {
    const s = this.items.find(i => !i.active && i.foe === foe);
    if (!s) return null;
    s.active = true; s.life = 2.2; s.dmg = 1; s.hitSet.clear();
    s.mesh.scale.setScalar(1);
    s.mesh.visible = s.shadow.visible = s.trail.visible = true;
    s.mesh.position.set(pos.x, y, pos.z);
    s.vel.copy(dir).multiplyScalar(speed);
    if (!foe) {
      // alinha caixa ao voo
      s.mesh.rotation.y = -Math.atan2(dir.z, dir.x);
      s.trail.rotation.y = s.mesh.rotation.y;
    }
    return s;
  }
  kill(s) { s.active = false; s.mesh.visible = s.shadow.visible = s.trail.visible = false; }
  update(dt, world) {
    for (const s of this.items) {
      if (!s.active) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;
      // sombra no chão acompanha (leitura iso)
      s.shadow.position.set(p.x, 0.02, p.z);
      const h = THREE.MathUtils.clamp(p.y, 0, 3);
      s.shadow.scale.setScalar(1 - h * 0.18);
      s.shadow.material.opacity = 0.42 - h * 0.09;
      // rastro atrás
      s.trail.position.copy(p).addScaledVector(s.vel.clone().normalize(), -0.55);
      let dead = s.life <= 0 || Math.abs(p.x) > WORLD.half + 2 || Math.abs(p.z) > WORLD.half + 2;
      // colisão com cobertura / paredes
      if (!dead && world) {
        const hit = world.collidePoint(p.x, p.z, s.r);
        if (hit) { dead = true; world.onBulletHitWall?.(hit, s); }
      }
      if (dead) this.kill(s);
    }
  }
  deactivateAll() { for (const s of this.items) if (s.active) this.kill(s); }
}

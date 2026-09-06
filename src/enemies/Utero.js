import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';

// Pilar-útero (swarm-core): estrutura estática que cospe parasitas.
// Tampa destacável → derrama 4 de uma vez e expõe o núcleo (1 hit).
const RED = 0xff3b30;

export class Utero {
  constructor(scene, x, z) {
    this.kind = 'utero';
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.dead = false;
    this.hasLid = true;
    this.coreHp = 2;
    this.spitT = 5; // primeira ninhada cedo pra apresentar a mecânica
    this.pulse = 0;

    this.base = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a2226, roughness: 0.9 })
    );
    this.base.scale.y = 0.6;
    this.base.position.y = 0.5; this.base.castShadow = this.base.receiveShadow = true;
    this.group.add(this.base);
    // embalagens grudadas no ninho
    [[0.8, 0.3, 0xc0392b], [-0.7, 0.5, 0x2980b9], [0.1, -0.85, 0xf39c12]].forEach(([x, z, c]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.3),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
      b.position.set(x, 0.25, z); b.rotation.y = Math.random() * 3;
      this.group.add(b);
    });

    this.sac = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a1f28, emissive: RED, emissiveIntensity: 0.8, roughness: 0.5, transparent: true, opacity: 0.92 })
    );
    this.sac.scale.y = 0.8; this.sac.position.y = 0.95; this.sac.castShadow = true;
    this.group.add(this.sac);

    this.lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.25, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.4, metalness: 0.2, emissive: RED, emissiveIntensity: 0.08 })
    );
    this.lid.position.y = 1.35; this.lid.castShadow = true;
    this.group.add(this.lid);
    // puxador do freezer (filho — voa junto)
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.5 }));
    pull.position.set(0, 0.16, 0.4);
    this.lid.add(pull);

    this.core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2 })
    );
    this.core.position.y = 1.0; this.core.visible = false; // escondido sob a tampa
    this.group.add(this.core);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);

    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  hitTest(p, r) {
    if (this.dead) return null;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const rr = 1.15 + r;
    if (dx * dx + dz * dz > rr * rr || p.y > 2.3) return null;
    return this.hasLid ? 'lid' : 'core';
  }

  detachLid(shards, dir, fx) {
    if (!this.hasLid) return;
    this.hasLid = false;
    this.group.remove(this.lid);
    shards.spawn(this.lid, new THREE.Vector3(this.pos.x, 1.5, this.pos.z), dir);
    this.core.visible = true;
    this.coreHp = Math.min(this.coreHp, 1); // exposto: 1 hit
    // derrama tudo de uma vez (respeita teto de 6 pra não inundar)
    const live = fx.foes().filter(e => e.kind === 'parasita' && !e.dead).length;
    for (let i = 0; i < 4 && live + i < 6; i++) this.spitOne(fx);
    this.spitT = 6;
    sfx('crunch');
    fx.hitstop(0.09); fx.shake(0.16);
  }

  spitOne(fx) {
    const a = Math.random() * Math.PI * 2;
    fx.spawn('parasita', this.pos.x + Math.cos(a) * 1.4, this.pos.z + Math.sin(a) * 1.4);
    this.pulse = 1;
    sfx('spit');
  }

  damage(n, fx) {
    if (this.dead || this.hasLid) return;
    this.coreHp -= n;
    if (this.coreHp <= 0) {
      this.dead = true;
      const c = new THREE.Vector3(this.pos.x, 0, this.pos.z);
      fx.shards.spawn(this.base, c.clone().setY(0.6), new THREE.Vector3(1, 0, 0));
      fx.shards.spawn(this.sac, c.clone().setY(1), new THREE.Vector3(-1, 0, 0.5));
      fx.shards.spawn(this.core, c.clone().setY(1), new THREE.Vector3(0, 0, -1));
      if (fx.pickups) { fx.pickups.dropNucleo(this.pos); fx.pickups.dropSucata(this.pos); }
      sfx('boom');
      fx.blood?.splatter(this.pos.x, this.pos.z, 1.8);
      this.scene.remove(this.group);
      fx.hitstop(0.12); fx.shake(0.22);
    } else {
      sfx('hit');
      fx.hitstop(0.05); fx.shake(0.08);
    }
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const breathe = 1 + Math.sin(performance.now() * 0.003) * 0.05 + this.pulse * 0.3;
    this.sac.scale.set(breathe, 0.8 * breathe, breathe);
    this.sac.material.emissiveIntensity = 0.8 + this.pulse * 1.5;
    if (this.core.visible) this.core.rotation.y += dt * 2;

    this.spitT -= dt;
    if (this.spitT <= 0) {
      const live = fx.foes().filter(e => e.kind === 'parasita' && !e.dead).length;
      if (live < 4) {
        const n = this.hasLid ? 2 : 4;
        for (let i = 0; i < n && live + i < 6; i++) this.spitOne(fx);
        this.spitT = this.hasLid ? 8 : 6;
      } else {
        this.spitT = 2; // teto de swarm: tenta de novo em 2s
      }
    }
  }
}

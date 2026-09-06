import * as THREE from 'three';

// Mundo: arena 30x30 legível. Metade jogável = 14, muros em ~14.4.
export const WORLD = { half: 14, wall: 14.4 };

// Telegraph desenhado NO PISO: setor / anel / linha / retângulo.
// 0.3–0.7s, sempre com lane justo.
export class TelegraphDecal {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
  }
  sector(origin, dirAngle, arc, range, dur, color = 0xff3b30) {
    const g = new THREE.CircleGeometry(range, 24, -arc / 2, arc);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -dirAngle;
    m.position.set(origin.x, 0.03, origin.z);
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(range - 0.12, range, 24, 1, -arc / 2, arc),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    edge.rotation.x = -Math.PI / 2; edge.rotation.z = -dirAngle;
    edge.position.copy(m.position).y = 0.035;
    this.scene.add(m, edge);
    const t = { m, edge, t: dur, dur };
    this.meshes.push(t);
    return t;
  }
  ring(pos, r, dur, color = 0xff3b30) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.18, r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.035, pos.z);
    this.scene.add(m);
    const t = { m, edge: null, t: dur, dur };
    this.meshes.push(t);
    return t;
  }
  // faixa reta: dash do caçador. angle = atan2(dz,dx) da direção.
  line(origin, angle, length, width, dur, color = 0xff3b30) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2; m.rotation.z = -angle;
    m.position.set(origin.x + Math.cos(angle) * length / 2, 0.03, origin.z + Math.sin(angle) * length / 2);
    this.scene.add(m);
    const t = { m, edge: null, t: dur, dur };
    this.meshes.push(t);
    return t;
  }
  clear(t) {
    this.scene.remove(t.m); if (t.edge) this.scene.remove(t.edge);
    t.m.geometry.dispose(); t.m.material.dispose();
    this.meshes.splice(this.meshes.indexOf(t), 1);
  }
  clearAll() { for (const t of [...this.meshes]) this.clear(t); }
  update(dt) {
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const t = this.meshes[i];
      t.t -= dt;
      const k = 1 - t.t / t.dur;
      t.m.material.opacity = 0.22 + k * 0.3;
      if (t.t <= 0) this.clear(t);
    }
  }
}

const PROP_KINDS = {
  mesa: { w: 2.4, d: 1.1, h: 1.1, hp: 2, rubbleHp: 2, color: 0x39434e, top: true },
  balcao: { w: 3.6, d: 0.9, h: 1.15, hp: 3, rubbleHp: 2, color: 0x3a3f4a, top: true },
  pilar: { w: 0.9, d: 0.9, h: 2.6, hp: 3, rubbleHp: 3, color: 0x2c3642, top: false },
};

// Móvel destrutível em 2 estágios: intacto (trava corpo + bala) → entulho
// (trava bala, dá pra passar por cima) → poeira. Pilar racha antes de cair.
export class Prop {
  constructor(scene, shards, kind, x, z) {
    const k = PROP_KINDS[kind];
    this.kind = kind; this.w = k.w; this.d = k.d;
    this.hp = k.hp; this.rubbleHp = k.rubbleHp;
    this.solid = true; this.dead = false;
    this.scene = scene; this.shards = shards;
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(k.w, k.h, k.d),
      new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.8, metalness: 0.15 })
    );
    this.mesh.position.y = k.h / 2;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.top = null;
    if (k.top) {
      // filete claro = "isso é cobertura"
      this.top = new THREE.Mesh(
        new THREE.BoxGeometry(k.w, 0.06, k.d + 0.04),
        new THREE.MeshStandardMaterial({ color: 0x59d6ff, emissive: 0x59d6ff, emissiveIntensity: 0.25 })
      );
      this.top.position.y = k.h + 0.02;
      this.group.add(this.top);
    }
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }
  contains(x, z) {
    const dx = x - this.group.position.x, dz = z - this.group.position.z;
    return Math.abs(dx) < this.w / 2 && Math.abs(dz) < this.d / 2;
  }
  hit(dir) {
    if (this.dead) return;
    this.hp--;
    this.mesh.position.x += (Math.random() - 0.5) * 0.07;
    if (this.kind === 'pilar') { // racha: escurece e entorta
      this.mesh.material.color.multiplyScalar(0.82);
      this.mesh.rotation.z += 0.025;
    } else if (this.top) {
      this.top.material.emissiveIntensity = 0.08 + Math.max(0, this.hp) * 0.1;
    }
    if (this.hp > 0) return;
    if (this.solid) {
      // vira entulho: baixo, atravessável, ainda segura bala
      this.solid = false; this.hp = this.rubbleHp;
      const old = this.mesh;
      this.group.remove(old); if (this.top) this.group.remove(this.top);
      this.top = null;
      this.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(this.w, 0.35, this.d),
        new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.95 })
      );
      this.mesh.position.y = 0.17; this.mesh.receiveShadow = true;
      this.group.add(this.mesh);
      this.shards.spawn(old, this.group.position.clone().setY(0.7), dir);
    } else {
      this.dead = true;
      this.scene.remove(this.group);
      this.shards.spawn(this.mesh, this.group.position.clone().setY(0.4), dir);
      this.shards.spawn(this.mesh, this.group.position.clone().setY(0.4), dir.clone().negate());
    }
  }
}

// Sala 30x30 com muros altos ao norte/oeste (fundo PZ) e muretas ao sul/leste.
export class Room {
  constructor(scene, shards) {
    this.covers = [];
    this.shards = shards;
    const H = WORLD.half, W = WORLD.wall;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2 + 2, 0.2, H * 2 + 2),
      new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.95 })
    );
    floor.position.y = -0.1; floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(H * 2, H * 2, 0x1c2836, 0x121a24);
    grid.position.y = 0.01; scene.add(grid);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x232c37, roughness: 0.85 });
    const mkWall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    };
    mkWall(H * 2 + 2, 2.4, 0.4, 0, 1.2, -W - 0.2);
    mkWall(0.4, 2.4, H * 2 + 2, -W - 0.2, 1.2, 0);
    mkWall(H * 2 + 2, 0.5, 0.3, 0, 0.25, W + 0.15);
    mkWall(0.3, 0.5, H * 2 + 2, W + 0.15, 0.25, 0);
    // mobília: mesas, balcão e pilares rachados espalhados
    this.covers.push(new Prop(scene, shards, 'mesa', -4.5, 2.5));
    this.covers.push(new Prop(scene, shards, 'mesa', 5.5, -4.5));
    this.covers.push(new Prop(scene, shards, 'mesa', -8.5, 8.5));
    this.covers.push(new Prop(scene, shards, 'balcao', -0.5, -8.5));
    this.covers.push(new Prop(scene, shards, 'pilar', -8.5, -3.5));
    this.covers.push(new Prop(scene, shards, 'pilar', 8.5, 5));
    // pilar estrutural central (indestrutível, âncora da arena)
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x2c3642, roughness: 0.7 }));
    pillar.position.set(2.5, 1.3, 2.5); pillar.castShadow = true; scene.add(pillar);
    this.pillar = { x: 2.5, z: 2.5, r: 0.8 };
  }
  collidePoint(x, z) {
    for (const c of this.covers) {
      if (!c.dead && c.contains(x, z)) return c;
    }
    const dx = x - this.pillar.x, dz = z - this.pillar.z;
    if (dx * dx + dz * dz < this.pillar.r * this.pillar.r) return this.pillar;
    return null;
  }
  onBulletHitWall(hit, slug) {
    if (hit && typeof hit.hit === 'function') hit.hit(slug.vel.clone().normalize());
    return true; // pilar estrutural/parede só consome
  }
}

// Pushout círculo-vs-mundo (só o sólido trava corpo; entulho é atravessável).
export function collideWorld(room, pos, r) {
  for (const c of room.covers) {
    if (c.dead || !c.solid) continue;
    const cx = THREE.MathUtils.clamp(pos.x, c.group.position.x - c.w / 2, c.group.position.x + c.w / 2);
    const cz = THREE.MathUtils.clamp(pos.z, c.group.position.z - c.d / 2, c.group.position.z + c.d / 2);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + dx / d * r; pos.z = cz + dz / d * r;
      } else {
        pos.x = c.group.position.x + c.w / 2 + r;
      }
    }
  }
  const px = pos.x - room.pillar.x, pz = pos.z - room.pillar.z;
  const pr = room.pillar.r + r, pd2 = px * px + pz * pz;
  if (pd2 < pr * pr && pd2 > 1e-6) {
    const d = Math.sqrt(pd2);
    pos.x = room.pillar.x + px / d * pr; pos.z = room.pillar.z + pz / d * pr;
  }
}

// Sólido no ponto? (dash do caçador quebra o que atinge)
export function pointBlocked(room, x, z) {
  for (const c of room.covers) {
    if (!c.dead && c.solid && c.contains(x, z)) return c;
  }
  const dx = x - room.pillar.x, dz = z - room.pillar.z;
  if (dx * dx + dz * dz < room.pillar.r * room.pillar.r) return room.pillar;
  return null;
}

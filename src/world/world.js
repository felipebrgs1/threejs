import * as THREE from 'three';
import { floorTex, wallTex, tileTex, shelfTex, checkoutTex, fridgeTex, signTex, posterTex } from './textures.js';

// Mundo: arena 30x30 legível. Metade jogável = 14, muros em ~14.4.
export const WORLD = { half: 14, wall: 14.4 };

// Telegraph desenhado NO PISO: setor / anel / linha. Sempre com lane justo.
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
  gondola: { w: 2.4, d: 1.1, h: 1.1, hp: 2, rubbleHp: 2, color: 0x39434e, top: true },
  caixa: { w: 3.6, d: 0.9, h: 1.15, hp: 3, rubbleHp: 2, color: 0x3a3f4a, top: true },
  coluna: { w: 0.9, d: 0.9, h: 2.6, hp: 3, rubbleHp: 3, color: 0x2c3642, top: false },
};

// Móvel do mercado em 2 estágios: intacto (trava corpo + bala) → entulho de
// produtos (trava bala, dá pra passar por cima) → poeira. Coluna racha antes.
export class Prop {
  constructor(scene, shards, kind, x, z, opts = {}) {
    const k = PROP_KINDS[kind];
    this.kind = kind; this.w = k.w; this.d = k.d;
    this.hp = k.hp; this.rubbleHp = k.rubbleHp;
    this.solid = true; this.dead = false;
    this.scene = scene; this.shards = shards;
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(k.w, k.h, k.d),
      new THREE.MeshStandardMaterial({ color: opts.map ? 0xffffff : k.color, map: opts.map || null, roughness: 0.8, metalness: 0.12 })
    );
    this.mesh.position.y = k.h / 2;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.top = null;
    if (k.top) {
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
    if (this.kind === 'coluna') {
      this.mesh.material.color.multiplyScalar(0.82);
      this.mesh.rotation.z += 0.025;
    } else if (this.top) {
      this.top.material.emissiveIntensity = 0.08 + Math.max(0, this.hp) * 0.1;
    }
    if (this.hp > 0) return;
    if (this.solid) {
      this.solid = false; this.hp = this.rubbleHp;
      const old = this.mesh;
      this.group.remove(old); if (this.top) this.group.remove(this.top);
      this.top = null;
      this.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(this.w, 0.35, this.d),
        new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 }) // entulho: caixas amassadas
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

// Manchas de sangue persistentes (reuso das mais antigas).
export class BloodPool {
  constructor(scene, max = 60) {
    this.scene = scene; this.items = []; this.max = max;
    this.geo = new THREE.CircleGeometry(0.5, 10);
  }
  splatter(x, z, size = 1) {
    let m;
    if (this.items.length >= this.max) m = this.items.shift();
    else {
      m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: 0x5e0d0d, transparent: true, opacity: 0.85, depthWrite: false
      }));
      this.scene.add(m);
    }
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI * 2;
    const s = size * (0.7 + Math.random() * 0.7);
    m.scale.set(s, s * (0.7 + Math.random() * 0.5), 1);
    m.position.set(x + (Math.random() - 0.5) * 0.6, 0.015 + Math.random() * 0.004, z + (Math.random() - 0.5) * 0.6);
    m.visible = true;
    this.items.push(m);
  }
}

// MERCADÃO — primeiro mapa: piso quadriculado, geladeiras ao fundo,
// gôndolas como cobertura, caixas no sul, placas de corredor.
export class Room {
  constructor(scene, shards) {
    this.covers = [];
    this.shards = shards;
    const H = WORLD.half, W = WORLD.wall;
    const dark = new THREE.MeshStandardMaterial({ color: 0x232c37, roughness: 0.85 });

    const floorMap = floorTex(); floorMap.repeat.set(15, 15);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2 + 2, 0.2, H * 2 + 2),
      new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.9 })
    );
    floor.position.y = -0.1; floor.receiveShadow = true;
    scene.add(floor);

    const mkWall = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || dark);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m);
      return m;
    };
    mkWall(H * 2 + 2, 2.4, 0.4, 0, 1.2, -W - 0.2); // norte (fundo)
    mkWall(0.4, 2.4, H * 2 + 2, -W - 0.2, 1.2, 0); // oeste
    mkWall(H * 2 + 2, 0.5, 0.3, 0, 0.25, W + 0.15); // muretas sul/leste
    mkWall(0.3, 0.5, H * 2 + 2, W + 0.15, 0.25, 0);

    // geladeiras cobrindo o fundo norte
    const fridgeMap = fridgeTex(); fridgeMap.repeat.set(7, 1);
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 2.0, 0.6),
      new THREE.MeshStandardMaterial({ map: fridgeMap, roughness: 0.35, metalness: 0.15 }));
    fridge.position.set(0, 1.0, -W + 0.35);
    fridge.receiveShadow = true; scene.add(fridge);

    // parede oeste de azulejo + cartazes de oferta
    const wtMap = wallTex(); wtMap.repeat.set(8, 1);
    const wt = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, 2.4),
      new THREE.MeshStandardMaterial({ map: wtMap, roughness: 0.85 }));
    wt.rotation.y = Math.PI / 2; wt.position.set(-W + 0.01, 1.2, 0);
    scene.add(wt);
    [[-4, 0], [3, 1]].forEach(([z, pi]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9),
        new THREE.MeshStandardMaterial({ map: posterTex(pi), roughness: 0.7 }));
      p.rotation.y = Math.PI / 2; p.position.set(-W + 0.04, 1.3, z);
      scene.add(p);
    });

    // gôndolas (cobertura) com produtos
    const shelfMaps = [shelfTex(0), shelfTex(1), shelfTex(2)];
    this.covers.push(new Prop(scene, shards, 'gondola', -4.5, 2.5, { map: shelfMaps[0] }));
    this.covers.push(new Prop(scene, shards, 'gondola', 5.5, -4.5, { map: shelfMaps[1] }));
    this.covers.push(new Prop(scene, shards, 'gondola', -8.5, 8.5, { map: shelfMaps[2] }));
    this.covers.push(new Prop(scene, shards, 'caixa', -0.5, -8.5, { map: checkoutTex('1') }));
    this.covers.push(new Prop(scene, shards, 'coluna', -8.5, -3.5, { map: tileTex() }));
    this.covers.push(new Prop(scene, shards, 'coluna', 8.5, 5, { map: tileTex() }));

    // coluna estrutural central
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x2c3642, roughness: 0.7 }));
    pillar.position.set(2.5, 1.3, 2.5); pillar.castShadow = true; scene.add(pillar);
    this.pillar = { x: 2.5, z: 2.5, r: 0.8 };

    // placas de corredor em postes
    const sign = (text, sub, x, z) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), dark);
      pole.position.y = 1.45; g.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ map: signTex(text, sub), roughness: 0.6 }));
      board.position.y = 2.9; board.castShadow = true; g.add(board);
      g.position.set(x, 0, z); scene.add(g);
    };
    sign('AÇOUGUE', 'fundo à direita', -4.5, 4.8);
    sign('FRIOS', 'laticínios', 5.5, -2.2);
    sign('CAIXAS →', 'saída', -0.5, -6.2);

    // carrinhos abandonados no canto + caixas derrubadas
    const cartAt = (x, z, ry) => {
      const g = new THREE.Group();
      const wire = new THREE.MeshBasicMaterial({ color: 0x8a939c, wireframe: true });
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), wire);
      basket.position.y = 0.8; g.add(basket);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), dark);
      bar.position.set(-0.55, 1.05, 0); g.add(bar);
      const wheelG = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8);
      [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]].forEach(([wx, wz]) => {
        const wmesh = new THREE.Mesh(wheelG, dark);
        wmesh.rotation.x = Math.PI / 2; wmesh.position.set(wx, 0.09, wz); g.add(wmesh);
      });
      g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    };
    cartAt(12.3, 11.8, 0.4); cartAt(11.3, 12.4, -0.3);
    const spillCols = [0xc0392b, 0x2980b9, 0xf39c12];
    [[-3.2, 3.6], [6.6, -3.4], [-7.4, 7.4]].forEach(([x, z], i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32),
        new THREE.MeshStandardMaterial({ color: spillCols[i], roughness: 0.8 }));
      b.position.set(x, 0.15, z); b.rotation.y = Math.random() * 3;
      b.castShadow = true; scene.add(b);
    });
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
    return true;
  }
}

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

export function pointBlocked(room, x, z) {
  for (const c of room.covers) {
    if (!c.dead && c.solid && c.contains(x, z)) return c;
  }
  const dx = x - room.pillar.x, dz = z - room.pillar.z;
  if (dx * dx + dz * dz < room.pillar.r * room.pillar.r) return room.pillar;
  return null;
}

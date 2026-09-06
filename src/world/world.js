import * as THREE from 'three';
import { floorTex, wallTex, tileTex, shelfTex, checkoutTex, fridgeTex, signTex, posterTex, crateTex, freezerTex, concreteTex } from './textures.js';
import { sfx } from '../audio/sfx.js';

// Mundo: arena 38x38. Metade jogável = 18, muros em ~18.4.
export const WORLD = { half: 18, wall: 18.4 };

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

// Móvel em 2 estágios: intacto (trava corpo + bala) → entulho (trava bala,
// atravessável) → poeira. Coluna racha antes de cair.
export class Prop {
  constructor(parent, shards, kind, x, z, opts = {}) {
    const k = PROP_KINDS[kind];
    this.kind = kind; this.w = k.w; this.d = k.d;
    this.hp = k.hp; this.rubbleHp = k.rubbleHp;
    this.solid = true; this.dead = false;
    this.parent = parent; this.shards = shards;
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
    parent.add(this.group);
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
    sfx('crunch');
    if (this.solid) {
      this.solid = false; this.hp = this.rubbleHp;
      const old = this.mesh;
      this.group.remove(old); if (this.top) this.group.remove(this.top);
      this.top = null;
      this.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(this.w, 0.35, this.d),
        new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 })
      );
      this.mesh.position.y = 0.17; this.mesh.receiveShadow = true;
      this.group.add(this.mesh);
      this.shards.spawn(old, this.group.position.clone().setY(0.7), dir);
    } else {
      this.dead = true;
      this.parent.remove(this.group);
      this.shards.spawn(this.mesh, this.group.position.clone().setY(0.4), dir);
      this.shards.spawn(this.mesh, this.group.position.clone().setY(0.4), dir.clone().negate());
    }
  }
}

// Caixa quebrável: papelão (1 tiro) ou freezer de emergência (2 tiros).
// Drop: 60% sucata 1-2, 20% NÚCLEO, 20% bandagem. Enfileira no room.pendingLoot.
export class SupplyCrate {
  constructor(parent, room, kind, x, z) {
    this.kind = kind; this.dead = false; this.solid = true;
    const papelao = kind === 'papelao';
    this.w = papelao ? 0.8 : 1.0; this.d = papelao ? 0.8 : 0.9;
    this.hp = papelao ? 1 : 2;
    this.parent = parent; this.room = room;
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(
      papelao ? new THREE.BoxGeometry(0.8, 0.8, 0.8) : new THREE.BoxGeometry(1.0, 1.1, 0.9),
      new THREE.MeshStandardMaterial({ map: papelao ? crateTex() : freezerTex(), roughness: 0.7 })
    );
    this.mesh.position.y = papelao ? 0.4 : 0.55;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = (Math.random() - 0.5) * 0.3;
    parent.add(this.group);
  }
  contains(x, z) {
    const dx = x - this.group.position.x, dz = z - this.group.position.z;
    return Math.abs(dx) < this.w / 2 && Math.abs(dz) < this.d / 2;
  }
  hit(dir) {
    if (this.dead) return;
    this.hp--;
    this.mesh.position.x += (Math.random() - 0.5) * 0.09;
    this.mesh.rotation.z += (Math.random() - 0.5) * 0.08;
    if (this.hp > 0) { sfx('hit'); return; }
    this.dead = true; this.solid = false;
    this.parent.remove(this.group);
    sfx('crunch');
    const r = Math.random();
    const px = this.group.position.x, pz = this.group.position.z;
    if (r < 0.6) {
      const n = 1 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) this.room.pendingLoot.push({ type: 'sucata', x: px, z: pz });
    } else if (r < 0.8) {
      this.room.pendingLoot.push({ type: 'nucleo', x: px, z: pz });
    } else {
      this.room.pendingLoot.push({ type: 'bandagem', x: px, z: pz });
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
  clear() {
    for (const m of this.items) this.scene.remove(m);
    this.items.length = 0;
  }
}

// Andares do MERCADÃO: 'loja' (térreo, ondas 1-3, 7-9...) e
// 'estoque' (1º andar, ondas 4-6, 10-12...). Troca via dispose + rebuild.
export class Room {
  constructor(scene, shards, theme = 'loja') {
    this.scene = scene; this.shards = shards; this.theme = theme;
    this.covers = []; this.loot = []; this.pendingLoot = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    const H = WORLD.half, W = WORLD.wall;
    const dark = new THREE.MeshStandardMaterial({ color: 0x232c37, roughness: 0.85 });
    const add = (m) => { this.group.add(m); return m; };
    const mkWall = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || dark);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
      return add(m);
    };
    mkWall(H * 2 + 2, 2.4, 0.4, 0, 1.2, -W - 0.2);
    mkWall(0.4, 2.4, H * 2 + 2, -W - 0.2, 1.2, 0);
    mkWall(H * 2 + 2, 0.5, 0.3, 0, 0.25, W + 0.15);
    mkWall(0.3, 0.5, H * 2 + 2, W + 0.15, 0.25, 0);

    if (theme === 'estoque') this.buildEstoque(add, dark, H, W);
    else this.buildLoja(add, dark, H, W);

    // escada de serviço ao sul (visual — a troca de andar é o fade)
    const stair = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(3 - i * 0.4, 0.3, 0.7), dark);
      st.position.set(0, 0.15 + i * 0.3, -i * 0.6); st.castShadow = true;
      stair.add(st);
    }
    const stairSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.1),
      new THREE.MeshStandardMaterial({ map: signTex(theme === 'estoque' ? '↕ TÉRREO' : '↕ ESTOQUE', 'escada'), roughness: 0.6 }));
    stairSign.position.set(0, 2.2, 0.6);
    stair.add(stairSign);
    const stairRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    stairRing.rotation.x = -Math.PI / 2; stairRing.position.y = 0.05;
    stair.add(stairRing);
    stair.position.set(6, 0, W - 1.2);
    add(stair);
    this.stairs = { x: 6, z: W - 1.2 }; // pisar aqui troca de andar

    // coluna estrutural central
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x2c3642, roughness: 0.7 }));
    pillar.position.set(3, 1.3, 3); pillar.castShadow = true; add(pillar);
    this.pillar = { x: 3, z: 3, r: 0.8 };
  }
  buildLoja(add, dark, H, W) {
    const floorMap = floorTex(); floorMap.repeat.set(19, 19);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 2, 0.2, H * 2 + 2),
      new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.9 }));
    floor.position.y = -0.1; floor.receiveShadow = true; add(floor);
    const fridgeMap = fridgeTex(); fridgeMap.repeat.set(9, 1);
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 2.0, 0.6),
      new THREE.MeshStandardMaterial({ map: fridgeMap, roughness: 0.35, metalness: 0.15 }));
    fridge.position.set(0, 1.0, -W + 0.35); fridge.receiveShadow = true; add(fridge);
    const wtMap = wallTex(); wtMap.repeat.set(10, 1);
    const wt = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, 2.4),
      new THREE.MeshStandardMaterial({ map: wtMap, roughness: 0.85 }));
    wt.rotation.y = Math.PI / 2; wt.position.set(-W + 0.01, 1.2, 0); add(wt);
    [[-5, 0], [4, 1]].forEach(([z, pi]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9),
        new THREE.MeshStandardMaterial({ map: posterTex(pi), roughness: 0.7 }));
      p.rotation.y = Math.PI / 2; p.position.set(-W + 0.04, 1.3, z); add(p);
    });
    const shelfMaps = [shelfTex(0), shelfTex(1), shelfTex(2)];
    this.covers.push(new Prop(this.group, this.shards, 'gondola', -6, 3, { map: shelfMaps[0] }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', 7, -6, { map: shelfMaps[1] }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', -11, 11, { map: shelfMaps[2] }));
    this.covers.push(new Prop(this.group, this.shards, 'caixa', -0.5, -11, { map: checkoutTex('1') }));
    this.covers.push(new Prop(this.group, this.shards, 'coluna', -11, -4.5, { map: tileTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'coluna', 11, 6.5, { map: tileTex() }));
    // caixas quebráveis: perto das gôndolas, do caixa e nos cantos
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', -3.5, 4.5));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', 8.5, -4));
    this.loot.push(new SupplyCrate(this.group, this, 'freezer', -3.2, -9.5));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', 13, 12));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', -14, 2));
    const sign = (text, sub, x, z) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), dark);
      pole.position.y = 1.45; g.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ map: signTex(text, sub), roughness: 0.6 }));
      board.position.y = 2.9; board.castShadow = true; g.add(board);
      g.position.set(x, 0, z); add(g);
    };
    sign('AÇOUGUE', 'fundo à direita', -6, 5.4);
    sign('FRIOS', 'laticínios', 7, -3.4);
    sign('CAIXAS →', 'saída', -0.5, -8.4);
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
      g.position.set(x, 0, z); g.rotation.y = ry; add(g);
    };
    cartAt(15.5, 14.5, 0.4); cartAt(14.3, 15.3, -0.3);
    const spillCols = [0xc0392b, 0x2980b9, 0xf39c12];
    [[-4.7, 4.2], [8.2, -4.6], [-9.7, 9.7]].forEach(([x, z], i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32),
        new THREE.MeshStandardMaterial({ color: spillCols[i], roughness: 0.8 }));
      b.position.set(x, 0.15, z); b.rotation.y = Math.random() * 3;
      b.castShadow = true; add(b);
    });
  }
  buildEstoque(add, dark, H, W) {
    const floorMap = concreteTex(); floorMap.repeat.set(16, 16);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 2, 0.2, H * 2 + 2),
      new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.95 }));
    floor.position.y = -0.1; floor.receiveShadow = true; add(floor);
    // doca de carga ao fundo norte
    const dock = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.9 }));
    dock.position.set(-6, 1.6, -W + 0.1); add(dock);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.52),
      new THREE.MeshStandardMaterial({ color: 0xe6a817, emissive: 0xe6a817, emissiveIntensity: 0.35 }));
    stripe.position.set(-6, 0.35, -W + 0.1); add(stripe);
    const docSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1),
      new THREE.MeshStandardMaterial({ map: signTex('ESTOQUE', '1º andar · doca 2'), roughness: 0.7 }));
    docSign.position.set(6, 2.2, -W + 0.32); add(docSign);
    // faixas de segurança no piso
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xa88a1e });
    [[-3.5, -3.5], [0, -3.5], [3.5, -3.5], [-3.5, 6], [3.5, 6]].forEach(([x, z]) => {
      const ln = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.25), laneMat);
      ln.position.set(x, 0.02, z); add(ln);
    });
    // paletes (cobertura) + colunas + bancada
    const crateMap = crateTex();
    this.covers.push(new Prop(this.group, this.shards, 'gondola', -7, 0, { map: crateMap }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', 0, 0, { map: crateTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', 7, 0, { map: crateTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', -7, -7, { map: crateTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'gondola', 7, -7, { map: crateTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'coluna', -13, -9, { map: tileTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'coluna', 13, 9, { map: tileTex() }));
    this.covers.push(new Prop(this.group, this.shards, 'caixa', 0, -12));
    // mais caixas quebráveis no estoque
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', -4, -3.5));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', 4, 4));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', -11, 5));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', 11, -3));
    this.loot.push(new SupplyCrate(this.group, this, 'papelao', 2, 9));
    this.loot.push(new SupplyCrate(this.group, this, 'freezer', 12, -11));
  }
  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    this.scene.remove(this.group);
  }
  collidePoint(x, z) {
    for (const c of this.covers) {
      if (!c.dead && c.contains(x, z)) return c;
    }
    for (const c of this.loot) {
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
  const solids = [...room.covers, ...(room.loot || [])];
  for (const c of solids) {
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
  for (const c of (room.loot || [])) {
    if (!c.dead && c.solid && c.contains(x, z)) return c;
  }
  const dx = x - room.pillar.x, dz = z - room.pillar.z;
  if (dx * dx + dz * dz < room.pillar.r * room.pillar.r) return room.pillar;
  return null;
}

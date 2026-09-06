import * as THREE from 'three';
import { collideWorld, WORLD } from '../world/world.js';
import { sfx } from '../audio/sfx.js';

// Carcaça-núcleo (boss, ondas 5/10/15...): cubo central + 4 braços-arma,
// cada um com silhueta e ataque próprios. Braço perdido = ataque removido.
// Com 1 braço restante: berserk 5s, depois colapsa sozinho.
const RED = 0xff3b30;

const ARM_DEFS = [
  { id: 'slug', off: [0.72, 0.35], cd: 3.2, tele: 0.5 },  // tiro pesado mirado
  { id: 'fan', off: [-0.72, 0.35], cd: 4.2, tele: 0.55 }, // fan de 3
  { id: 'nade', off: [0.72, -0.55], cd: 6.5, tele: 0.6 }, // granada no player
  { id: 'spit', off: [-0.72, -0.55], cd: 7.5, tele: 0.6 },// cospe 2 parasitas
];

export class Carcaca {
  constructor(scene, x, z, tier = 1) {
    this.kind = 'carcaca';
    this.scene = scene; this.tier = tier;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.dead = false;
    this.coreHp = 3 + tier;
    this.arms = ARM_DEFS.map(a => ({ ...a, alive: true, cd: 2 + Math.random() * 2, mesh: null }));
    this.lastArm = -1;
    this.state = 'chase'; this.t = 0; this.pendingArm = -1;
    this.attackCd = 1.5;
    this.aimTarget = new THREE.Vector3();
    this.berserk = false; this.berserkT = 0; this.berserked = false;
    this.speed = 1.3 * (1 + (tier - 1) * 0.1);
    this.phase = Math.random() * 10;
    this.flash = 0;

    const armor = new THREE.MeshStandardMaterial({ color: 0x3d2a33, roughness: 0.55, metalness: 0.4 });
    this.armorMat = armor;
    this.coreMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), armor);
    this.coreMesh.position.y = 1.0; this.coreMesh.castShadow = true;
    this.group.add(this.coreMesh);
    // avental sujo + cabeça + pernas grossas de açougueiro
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.9 }));
    apron.position.set(0, -0.05, 0.58);
    this.coreMesh.add(apron);
    const bhead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x9aa07a, roughness: 0.9 }));
    bhead.position.y = 1.95; bhead.castShadow = true;
    this.group.add(bhead);
    const blegMat = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.9 });
    this.blegL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.28), blegMat);
    this.blegL.position.set(-0.35, 0.3, 0);
    this.group.add(this.blegL);
    this.blegR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.28), blegMat);
    this.blegR.position.set(0.35, 0.3, 0);
    this.group.add(this.blegR);
    // núcleo exposto atrás (ponto fraco, como a sentinela)
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26),
      new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2 }));
    this.core.position.set(0, 1.1, -0.62);
    this.group.add(this.core);
    // coroa-anel: silhueta de boss legível em iso
    this.crown = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x8a2a22, emissive: RED, emissiveIntensity: 0.8 }));
    this.crown.rotation.x = -Math.PI / 2; this.crown.position.y = 1.85; this.crown.castShadow = true;
    this.group.add(this.crown);

    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.4, metalness: 0.6 });
    const glow = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 1.5 });
    const mk = (mesh, ox, oz, y = 1.0) => { mesh.position.set(ox, y, oz); mesh.castShadow = true; this.group.add(mesh); return mesh; };
    // slug: cano longo pra frente
    const slug = new THREE.Group();
    slug.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 1.0), metal));
    const slugTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), glow);
    slugTip.position.z = 0.55; slug.add(slugTip);
    this.arms[0].mesh = mk(slug, 0.72, 0.35);
    // fan: boca larga
    const fan = new THREE.Group();
    fan.add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.5), metal));
    const fanSlit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.08), glow);
    fanSlit.position.z = 0.26; fan.add(fanSlit);
    this.arms[1].mesh = mk(fan, -0.72, 0.35);
    // nade: morteiro vertical
    const nade = new THREE.Group();
    nade.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.6, 10), metal));
    const nadeMouth = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), glow);
    nadeMouth.position.y = 0.32; nade.add(nadeMouth);
    this.arms[2].mesh = mk(nade, 0.72, -0.55);
    // spit: bolsa orgânica
    const spit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a1f28, emissive: RED, emissiveIntensity: 0.9, roughness: 0.5 }));
    this.arms[3].mesh = mk(spit, -0.72, -0.55);

    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);

    scene.add(this.group);
  }

  get pos() { return this.group.position; }
  armsAlive() { return this.arms.filter(a => a.alive).length; }

  hitTest(p, r) {
    if (this.dead) return null;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    if (dx * dx + dz * dz > (1.5 + r) * (1.5 + r) || p.y > 2.2) return null;
    const rot = -this.group.rotation.y;
    const c = Math.cos(rot), s = Math.sin(rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    for (let i = 0; i < this.arms.length; i++) {
      const a = this.arms[i];
      if (!a.alive) continue;
      if (Math.abs(lx - a.off[0]) < 0.35 + r && Math.abs(lz - a.off[1]) < 0.4 + r && p.y > 0.3 && p.y < 1.9) {
        return 'arm:' + i;
      }
    }
    if (Math.abs(lx) < 0.6 + r && Math.abs(lz) < 0.6 + r && p.y < 2.0) return 'core';
    return null;
  }

  detachArm(i, shards, dir, fx) {
    const a = this.arms[i];
    if (!a || !a.alive) return;
    a.alive = false;
    this.group.remove(a.mesh);
    shards.spawn(a.mesh.children ? a.mesh.children[0] : a.mesh,
      new THREE.Vector3(this.pos.x + a.off[0], 1.0, this.pos.z + a.off[1]), dir);
    sfx('crunch');
    fx.hitstop(0.09); fx.shake(0.16);
    if (this.armsAlive() <= 1 && !this.berserked) {
      this.berserk = true; this.berserked = true; this.berserkT = 5;
      fx.toast('a carcaça enlouquece');
      sfx('horn');
    }
  }

  damage(n, fx) {
    if (this.dead) return;
    this.coreHp -= n; this.flash = 1;
    if (this.coreHp <= 0) this.die(fx);
    else { sfx('hit'); fx.hitstop(0.05); fx.shake(0.08); }
  }

  die(fx) {
    if (this.dead) return;
    this.dead = true;
    const c = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    fx.shards.spawn(this.coreMesh, c.clone().setY(1.0), new THREE.Vector3(1, 0, 0));
    fx.shards.spawn(this.crown, c.clone().setY(1.8), new THREE.Vector3(-1, 0, 0));
    for (const a of this.arms) {
      if (!a.alive) continue;
      fx.shards.spawn(a.mesh.children ? a.mesh.children[0] : a.mesh,
        c.clone().setY(1.0), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5));
    }
    fx.shards.spawn(this.core, c.clone().setY(1.1), new THREE.Vector3(0, 0, -1));
    if (fx.pickups) {
      fx.pickups.dropNucleo(this.pos); fx.pickups.dropNucleo(this.pos);
      fx.pickups.dropSucata(this.pos); fx.pickups.dropSucata(this.pos); fx.pickups.dropSucata(this.pos);
    }
    fx.blood?.splatter(this.pos.x, this.pos.z, 2.2);
    this.scene.remove(this.group);
    sfx('bigboom');
    fx.banner('CARCAÇA DESMONTADA', '2 ◆ na sucata');
    fx.hitstop(0.15); fx.shake(0.3);
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.phase += dt * 2;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armorMat.emissive = new THREE.Color(RED);
    this.armorMat.emissiveIntensity = this.flash * 0.9 + (this.berserk ? 0.25 + Math.sin(this.phase * 6) * 0.2 : 0);
    this.crown.rotation.z += dt * (this.berserk ? 3 : 0.8);

    const toP = new THREE.Vector3().subVectors(player.pos, this.pos); toP.y = 0;
    const dist = toP.length();
    const wantAngle = Math.atan2(toP.x, toP.z);
    const cur = this.group.rotation.y;
    const diff = ((wantAngle - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.group.rotation.y = cur + THREE.MathUtils.clamp(diff, -1.8 * dt, 1.8 * dt);

    // mantém distância média, derrapa pro lado
    if (this.state === 'chase') {
      if (dist > 7) this.pos.addScaledVector(toP.normalize(), this.speed * dt);
      else if (dist < 3.5) this.pos.addScaledVector(toP.normalize(), -this.speed * 0.7 * dt);
      else this.pos.x += Math.cos(this.phase * 0.7) * dt * 0.7;
    }
    if (fx.room) collideWorld(fx.room, this.pos, 0.95);

    for (const a of this.arms) if (a.alive) a.cd -= dt;
    this.attackCd -= dt;

    if (this.berserk) {
      this.berserkT -= dt;
      if (this.berserkT <= 0) { this.die(fx); return; } // colapsa sozinho
    }

    if (this.state === 'chase' && this.attackCd <= 0) {
      // round-robin: primeiro braço vivo com cd pronto
      let idx = -1;
      for (let k = 1; k <= this.arms.length; k++) {
        const i = (this.lastArm + k) % this.arms.length;
        if (this.arms[i].alive && this.arms[i].cd <= 0) { idx = i; break; }
      }
      if (idx >= 0) {
        const a = this.arms[idx];
        this.pendingArm = idx; this.lastArm = idx;
        this.state = 'tele'; this.t = a.tele;
        const base = Math.atan2(toP.x, toP.z);
        const dAng = -base + Math.PI / 2;
        if (a.id === 'slug') fx.telegraph?.sector(this.pos, dAng, 0.14, 9, a.tele);
        else if (a.id === 'fan') fx.telegraph?.sector(this.pos, dAng, 0.5, 8, a.tele);
        else if (a.id === 'nade') {
          this.aimTarget.copy(player.pos).addScaledVector(player.vel, 0.35);
          this.aimTarget.x = THREE.MathUtils.clamp(this.aimTarget.x, -WORLD.half, WORLD.half);
          this.aimTarget.z = THREE.MathUtils.clamp(this.aimTarget.z, -WORLD.half, WORLD.half);
          fx.telegraph?.ring(this.aimTarget, 2.3, a.tele);
        } else if (a.id === 'spit') fx.telegraph?.ring(new THREE.Vector3(this.pos.x, 0, this.pos.z), 1.8, a.tele, 0xffc857);
      }
    } else if (this.state === 'tele') {
      this.t -= dt;
      if (this.t <= 0) {
        const a = this.arms[this.pendingArm];
        this.state = 'chase';
        const fireMul = fx.mods?.enemyFireMul ?? 1;
        this.attackCd = 1.6 * (this.berserk ? 0.45 : 1) * fireMul;
        if (a && a.alive) {
          a.cd = a.cd <= 0 ? ({ slug: 3.2, fan: 4.2, nade: 6.5, spit: 7.5 })[a.id] : a.cd;
          const base = Math.atan2(toP.x, toP.z);
          if (a.id === 'slug') {
            const d = new THREE.Vector3(Math.sin(base), 0, Math.cos(base));
            bullets.fire(this.pos.clone().addScaledVector(d, 1.1), d, 12, true, 1.1);
            sfx('foeShoot'); fx.shake(0.08);
          } else if (a.id === 'fan') {
            for (const sp of [-0.16, 0, 0.16]) {
              const d = new THREE.Vector3(Math.sin(base + sp), 0, Math.cos(base + sp));
              bullets.fire(this.pos.clone().addScaledVector(d, 1.1), d, 8, true, 1.1);
            }
            sfx('foeShoot'); fx.shake(0.08);
          } else if (a.id === 'nade' && fx.grenades) {
            fx.grenades.throw(this.pos.clone().setY(1.4), this.aimTarget.clone());
            sfx('lob');
          } else if (a.id === 'spit' && fx.spawn) {
            const live = fx.foes().filter(e => e.kind === 'parasita' && !e.dead).length;
            for (let i = 0; i < 2 && live + i < 6; i++) {
              const ang = Math.random() * Math.PI * 2;
              fx.spawn('parasita', this.pos.x + Math.cos(ang) * 1.5, this.pos.z + Math.sin(ang) * 1.5);
            }
            sfx('spit');
          }
        }
        this.pendingArm = -1;
      }
    }
    this.coreMesh.position.y = 1.0 + Math.sin(this.phase) * 0.04;
    this.blegL.rotation.x = Math.sin(this.phase) * 0.4;
    this.blegR.rotation.x = -Math.sin(this.phase) * 0.4;
  }
}

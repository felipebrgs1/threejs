import * as THREE from 'three';
import { collideWorld, pointBlocked, WORLD } from '../world/world.js';
import { sfx } from '../audio/sfx.js';

// Caçador-delta (flanqueador): ronda em órbita a 5-7m, trava dash de 6m com
// faixa telegrafada no piso. Atravessa cobertura baixa no dash — e quebra
// o móvel que atingir. Sem ponta, o dash sai torto e ele beija a parede.
const RED = 0xff3b30;

export class Cacador {
  constructor(scene, x, z) {
    this.kind = 'cacador';
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.dead = false;
    this.hasTip = true;
    this.legsAlive = 2;
    this.bodyHp = 2;
    this.state = 'stalk'; // stalk | tele | dash | stun | recover
    this.t = 0;
    this.speed = 3.0;
    this.dashCd = 2.5; this.dashCdMax = 3.5;
    this.dashDir = new THREE.Vector3(1, 0, 0);
    this.dashLeft = 0;
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.phase = Math.random() * 10;
    this.flash = 0;

    const armor = new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 0.55, metalness: 0.4 });
    this.armorMat = armor;
    // diedro: pirâmide triangular — silhueta de seta em iso
    this.body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 3), armor);
    this.body.position.y = 0.85; this.body.castShadow = true;
    this.group.add(this.body);
    // ponta destacável (o módulo que mira)
    this.tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a2a22, emissive: RED, emissiveIntensity: 0.8, roughness: 0.5 }));
    this.tip.rotation.x = Math.PI / 2;
    this.tip.position.set(0, 0.8, 0.62);
    this.group.add(this.tip);
    // olho: fenda vermelha
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05),
      new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2 }));
    eye.position.set(0, 1.0, 0.42); eye.rotation.y = 0;
    this.group.add(eye);
    // patas laterais destacáveis
    const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.5);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.6, metalness: 0.4 });
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.5, 0.45, -0.1); this.legL.castShadow = true;
    this.group.add(this.legL);
    this.legR = new THREE.Mesh(legGeo, legMat.clone());
    this.legR.position.set(0.5, 0.45, -0.1); this.legR.castShadow = true;
    this.group.add(this.legR);

    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.02;
    this.group.add(this.blob);

    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  // local: +z = frente. ponta na frente, patas nos lados, corpo no resto.
  hitTest(p, r) {
    if (this.dead || this.state === 'dash') return null; // no dash, rápido demais pra acertar
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    if (dx * dx + dz * dz > (0.85 + r) * (0.85 + r) || p.y > 1.7) return null;
    const rot = -this.group.rotation.y;
    const c = Math.cos(rot), s = Math.sin(rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (this.hasTip && lz > 0.3 && Math.abs(lx) < 0.4 + r) return 'tip';
    if (this.legL && Math.abs(lx + 0.5) < 0.25 + r && Math.abs(lz + 0.1) < 0.35 + r) return 'legL';
    if (this.legR && Math.abs(lx - 0.5) < 0.25 + r && Math.abs(lz + 0.1) < 0.35 + r) return 'legR';
    return 'body';
  }

  detachTip(shards, dir, fx) {
    if (!this.hasTip) return;
    this.hasTip = false;
    this.group.remove(this.tip);
    shards.spawn(this.tip, new THREE.Vector3(this.pos.x, 0.8, this.pos.z), dir);
    sfx('crunch');
    fx.hitstop(0.09); fx.shake(0.16);
  }

  detachLeg(side, shards, dir, fx) {
    const leg = side === 'legL' ? this.legL : this.legR;
    if (!leg) return;
    this.group.remove(leg);
    if (side === 'legL') this.legL = null; else this.legR = null;
    this.legsAlive--;
    this.speed *= 0.8;
    this.dashCdMax += 1;
    shards.spawn(leg, new THREE.Vector3(this.pos.x, 0.45, this.pos.z), dir);
    sfx('crunch');
    fx.hitstop(0.07); fx.shake(0.12);
  }

  damage(n, fx) {
    if (this.dead) return;
    this.bodyHp -= n; this.flash = 1;
    if (this.bodyHp <= 0) {
      this.dead = true;
      const c = new THREE.Vector3(this.pos.x, 0, this.pos.z);
      fx.shards.spawn(this.body, c.clone().setY(0.85), new THREE.Vector3(1, 0, 0));
      if (this.hasTip) fx.shards.spawn(this.tip, c.clone().setY(0.8), new THREE.Vector3(-1, 0, 0));
      if (this.legL) fx.shards.spawn(this.legL, c.clone().setY(0.45), new THREE.Vector3(0, 0, 1));
      if (this.legR) fx.shards.spawn(this.legR, c.clone().setY(0.45), new THREE.Vector3(0, 0, -1));
      if (fx.pickups) fx.pickups.dropSucata(this.pos);
      this.scene.remove(this.group);
      sfx('crunch');
      fx.hitstop(0.1); fx.shake(0.2);
    } else {
      sfx('hit');
      fx.hitstop(0.05); fx.shake(0.08);
    }
  }

  crash(fx, what) {
    // bateu em móvel/pilar/útero/muro no meio do dash
    this.state = 'stun'; this.t = 1.2;
    if (what && typeof what.hit === 'function') what.hit(this.dashDir.clone());
    sfx('crunch');
    fx.shake(0.18);
  }

  update(dt, player, bullets, fx) {
    if (this.dead) return;
    this.phase += dt * 4;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armorMat.emissive = new THREE.Color(RED);
    this.armorMat.emissiveIntensity = this.flash * 0.9;
    this.dashCd -= dt;

    const toP = new THREE.Vector3().subVectors(player.pos, this.pos); toP.y = 0;
    const dist = toP.length();
    const wantAngle = Math.atan2(toP.x, toP.z);
    const turn = (max) => {
      const cur = this.group.rotation.y;
      const diff = ((wantAngle - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.group.rotation.y = cur + THREE.MathUtils.clamp(diff, -max * dt, max * dt);
      return diff;
    };

    if (this.state === 'stalk') {
      turn(3.0);
      // órbita a ~6m: 80% tangente, 20% radial corretivo
      const nx = toP.x / (dist || 1), nz = toP.z / (dist || 1);
      const radial = dist > 6.5 ? 1 : dist < 5 ? -1 : 0;
      const vx = (-nz * this.orbit * 0.85 + nx * radial * 0.5);
      const vz = (nx * this.orbit * 0.85 + nz * radial * 0.5);
      this.pos.x += vx * this.speed * dt;
      this.pos.z += vz * this.speed * dt;
      if (fx.room) collideWorld(fx.room, this.pos, 0.5);
      // dispara o dash alinhado a 3.5–8.5m
      const diff = Math.abs(((wantAngle - this.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (this.dashCd <= 0 && dist > 3.5 && dist < 8.5 && diff < 0.3) {
        this.state = 'tele'; this.t = 0.45;
        this.dashDir.set(nx, 0, nz);
        const a = Math.atan2(this.dashDir.z, this.dashDir.x);
        fx.telegraph?.line(this.pos, a, 6.5, 0.7, 0.45);
        sfx('inflate');
      }
      this.body.position.y = 0.85 + Math.abs(Math.sin(this.phase)) * 0.06;
    } else if (this.state === 'tele') {
      turn(1.5); // acompanha devagar — dá pra sair da faixa andando
      this.t -= dt;
      this.group.scale.y = 0.8; // agacha antes do bote
      const a = Math.atan2(toP.x, toP.z);
      this.dashDir.set(Math.sin(a), 0, Math.cos(a));
      if (this.t <= 0) {
        this.state = 'dash'; this.dashLeft = 6.5;
        this.group.scale.y = 1;
        if (!this.hasTip) { // sem ponta: sai torto
          const err = (Math.random() - 0.5) * 1.0;
          const ca = Math.cos(err), sa = Math.sin(err);
          const dx = this.dashDir.x * ca - this.dashDir.z * sa;
          const dz = this.dashDir.x * sa + this.dashDir.z * ca;
          this.dashDir.set(dx, 0, dz);
        }
        sfx('dash');
      }
    } else if (this.state === 'dash') {
      const step = 16 * dt;
      this.pos.addScaledVector(this.dashDir, step);
      this.dashLeft -= step;
      // acertou o player?
      const hx = player.pos.x - this.pos.x, hz = player.pos.z - this.pos.z;
      if (hx * hx + hz * hz < 0.9 * 0.9) {
        if (player.damage()) { fx.hitstop(0.08); fx.shake(0.2); }
        player.vel.addScaledVector(this.dashDir, 7);
        this.state = 'recover'; this.t = 0.5;
        this.dashCd = this.dashCdMax;
      } else {
        // bateu em algo sólido? quebra o móvel e atordoa
        let what = fx.room ? pointBlocked(fx.room, this.pos.x, this.pos.z) : null;
        if (!what && fx.foes) {
          for (const e of fx.foes()) {
            if (e === this || e.dead || e.kind !== 'utero') continue;
            if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 1.4) { what = null; this.crashUtero = e; break; }
          }
        }
        const H = WORLD.half;
        if (Math.abs(this.pos.x) > H || Math.abs(this.pos.z) > H) {
          this.pos.x = THREE.MathUtils.clamp(this.pos.x, -H, H);
          this.pos.z = THREE.MathUtils.clamp(this.pos.z, -H, H);
          this.crash(fx, null);
        } else if (what) {
          this.crash(fx, what);
        } else if (this.crashUtero) {
          const u = this.crashUtero; this.crashUtero = null;
          u.damage(1, fx);
          this.crash(fx, null);
        } else if (this.dashLeft <= 0) {
          this.state = 'recover'; this.t = 0.5;
          this.dashCd = this.dashCdMax;
        }
      }
    } else if (this.state === 'stun') {
      this.t -= dt;
      this.group.rotation.y += dt * 2 * Math.sin(this.phase * 3); // tonto
      if (this.t <= 0) { this.state = 'stalk'; this.dashCd = Math.max(this.dashCd, 1.2); }
    } else { // recover
      this.t -= dt;
      if (this.t <= 0) this.state = 'stalk';
    }
  }
}

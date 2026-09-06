import * as THREE from 'three';

// Director de sobrevivência: ondas com composição crescente, spawn com telegraph
// dourado (justo), respiro entre ondas com recompensa. Densidade sobe, lane justo fica.
const SPOTS = [[-12, -12], [12, 11], [-12, 11], [12, -12], [0, -13], [0, 13], [-13, 0], [13, 0]];

export class Director {
  constructor(fx) {
    this.fx = fx;
    this.reset();
  }
  reset() {
    this.wave = 0; this.phase = 'intermission'; this.t = 3.5;
    this.queue = []; this.pending = [];
    this.spawnT = 0; this.interval = 4; this.maxConc = 3; this.bossTier = 1;
  }
  startWave(n, ctx) {
    this.wave = n; this.phase = 'combat';
    const S = 1 + Math.floor(n / 2);
    const O = n >= 2 ? Math.floor(n / 2) : 0;
    const H = n >= 2 ? Math.min(2, Math.floor(n / 2)) : 0;
    this.queue = [];
    for (let i = 0; i < S; i++) this.queue.push('sentinel');
    for (let i = 0; i < O; i++) this.queue.push('orbe');
    for (let i = 0; i < H; i++) this.queue.push('cacador');
    this.queue.sort(() => Math.random() - 0.5);
    const wantU = n >= 4 ? 2 : 1;
    const liveU = ctx.foes.filter(e => e.kind === 'utero' && !e.dead).length;
    for (let i = 0; i < wantU - liveU; i++) this.queue.push('utero');
    if (n % 5 === 0) { this.queue.push('carcaca'); this.bossTier = n / 5; } // boss a cada 5 ondas
    this.interval = Math.max(2.0, 4.5 - n * 0.3);
    this.maxConc = Math.min(7, 2 + Math.floor(n / 2));
    this.spawnT = 0.5;
    this.fx.mods.enemyFireMul = Math.max(0.7, 1 - (n - 1) * 0.04);
    const parts = [`${S} brutamonte${S > 1 ? 's' : ''}`];
    if (O) parts.push(`${O} baiacu${O > 1 ? 's' : ''}`);
    if (H) parts.push(`${H} corredor${H > 1 ? 'es' : ''}`);
    if (wantU - liveU > 0) parts.push('ninho');
    if (n % 5 === 0) parts.push('açougueiro');
    this.fx.banner(`ONDA ${n}`, parts.join(' · '));
    this.fx.sfx('horn');
  }
  scheduleNext(ctx) {
    const kind = this.queue.shift();
    let x, z;
    if (kind === 'utero') {
      const spots = this.fx.uteroSpots || [[-7, -7]];
      const free = spots.filter(([sx, sz]) => !ctx.foes.some(e =>
        e.kind === 'utero' && !e.dead && Math.hypot(e.pos.x - sx, e.pos.z - sz) < 3));
      [x, z] = free.length ? free[0] : spots[0];
    } else {
      const far = SPOTS.filter(([sx, sz]) => Math.hypot(sx - ctx.player.pos.x, sz - ctx.player.pos.z) > 7);
      [x, z] = far.length ? far[(Math.random() * far.length) | 0] : [0, -7];
    }
    // dourado = spawn (oportunidade), vermelho = perigo. Linguagem fixa.
    this.fx.telegraph.ring(new THREE.Vector3(x, 0, z), kind === 'carcaca' ? 1.4 : kind === 'utero' ? 1.6 : kind === 'cacador' ? 0.8 : 0.9, 1.0, 0xffc857);
    this.pending.push({ kind, x, z, t: 1.0, tier: kind === 'carcaca' ? this.bossTier : 0 });
  }
  clearWave(ctx) {
    this.phase = 'intermission'; this.t = 7;
    this.fx.banner('SILÊNCIO', 'onda eliminada · respire');
    this.fx.sfx('clear');
    this.fx.onWaveClear?.(); // main abre o draft roguelike
    for (let i = 0; i < 2; i++) this.fx.pickups.dropSucata(ctx.player.pos);
    if (this.wave % 3 === 0) {
      this.fx.pickups.dropNucleo(ctx.player.pos);
      this.fx.toast('a arena cospe um ◆');
    }
  }
  update(dt, ctx) {
    if (this.phase === 'intermission') {
      this.t -= dt;
      if (this.t <= 0) this.startWave(this.wave + 1, ctx);
      return;
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) { this.fx.spawn(p.kind, p.x, p.z, p.tier ? { tier: p.tier } : undefined); this.pending.splice(i, 1); }
    }
    const liveCombat = ctx.foes.filter(e => !e.dead && (e.kind === 'sentinel' || e.kind === 'orbe' || e.kind === 'carcaca' || e.kind === 'cacador')).length;
    if (this.queue.length && liveCombat + this.pending.length < this.maxConc) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = this.interval; this.scheduleNext(ctx); }
    }
    if (!this.queue.length && !this.pending.length && liveCombat === 0) this.clearWave(ctx);
  }
}

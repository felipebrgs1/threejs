import * as THREE from 'three';
import { IsoRig } from './camera/IsoRig.js';
import { Player } from './player/Player.js';
import { ProjectilePool } from './weapons/ProjectilePool.js';
import { GrenadePool } from './weapons/Grenade.js';
import { ShardField } from './pickups/ShardBody.js';
import { PickupField } from './pickups/Pickups.js';
import { TelegraphDecal, Room, collideWorld, BloodPool } from './world/world.js';
import { Shop } from './world/Shop.js';
import { Sentinel } from './enemies/Enemy.js';
import { Orbe } from './enemies/Orbe.js';
import { Parasita } from './enemies/Parasita.js';
import { Utero } from './enemies/Utero.js';
import { Director } from './core/Director.js';
import { Carcaca } from './enemies/Carcaca.js';
import { Cacador } from './enemies/Cacador.js';
import { WORLD } from './world/world.js';
import { initAudio, toggleMute, sfx } from './audio/sfx.js';
import { WEAPONS } from './weapons/Weapon.js';
import { banner, toast, setPrompt, setTop, damageFlash, setLowHp, fmtTime, showDeath, hideDeath } from './ui/hud.js';

const SEED = 1337;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060709);
scene.fog = new THREE.Fog(0x060709, 34, 78);

// luz fria escassa: 1 dir com sombra + ambiente baixo + 2 points
const dir = new THREE.DirectionalLight(0xbfd9ff, 1.5);
dir.position.set(-6, 12, 4);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.left = -17; dir.shadow.camera.right = 17;
dir.shadow.camera.top = 17; dir.shadow.camera.bottom = -17;
scene.add(dir);
scene.add(new THREE.AmbientLight(0x2a3644, 0.7));
const p1 = new THREE.PointLight(0x59d6ff, 8, 14); p1.position.set(-4, 3, 3); scene.add(p1);
const p2 = new THREE.PointLight(0xff3b30, 6, 12); p2.position.set(5, 2.5, -4); scene.add(p2);

const shards = new ShardField(scene);
const telegraph = new TelegraphDecal(scene);
const room = new Room(scene, shards);
const pickups = new PickupField(scene);
const grenades = new GrenadePool(scene);
const blood = new BloodPool(scene);
const shop = new Shop(scene);
const player = new Player(scene);
const bullets = new ProjectilePool(scene);

const rig = new IsoRig(player.pos);

// estado da run (sobrevivência)
let hitstopT = 0;
let enemies = [];
let started = false;
let runT = 0, kills = 0, deathShown = false, prevHp = 3;
const still = { t: 0 };
const mods = { telegraphMul: 1, enemyFireMul: 1 };
const UTERO_SPOTS = [[-11, -11], [11, 11]];
function spawnEnemy(kind, x, z, opts = {}) {
  const e = kind === 'sentinel' ? new Sentinel(scene, telegraph, x, z)
    : kind === 'orbe' ? new Orbe(scene, telegraph, x, z)
    : kind === 'parasita' ? new Parasita(scene, x, z)
    : kind === 'cacador' ? new Cacador(scene, x, z)
    : kind === 'carcaca' ? new Carcaca(scene, x, z, opts.tier || 1)
    : new Utero(scene, x, z);
  if ((kind === 'orbe' || kind === 'parasita' || kind === 'cacador') && director.wave > 1) {
    e.speed *= Math.min(1.3, 1 + (director.wave - 1) * 0.05); // ondas deixam o enxame mais rápido
  }
  enemies.push(e);
  return e;
}
const fx = {
  shards, grenades, pickups, room, still, mods, telegraph,
  uteroSpots: UTERO_SPOTS,
  foes: () => enemies,
  spawn: spawnEnemy,
  sfx, blood,
  banner, toast,
  hitstop(dur) { hitstopT = Math.max(hitstopT, dur); },
  shake(amp, dur = 0.1) { rig.shake(amp, dur); }
};
fx.onWaveClear = () => { draftPending = 1.4; }; // SILÊNCIO + loot antes da escolha
const director = new Director(fx);
// mercado já viu coisa: manchas antigas pelo piso
for (let i = 0; i < 9; i++) {
  blood.splatter((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.5 + Math.random());
}

// loja (DOM mínimo, jogo pausa aberto)
let shopOpen = false;
const shopDiv = document.getElementById('shop');
function refreshShop() {
  const rows = shop.stock.map((it, i) => {
    const state = it.sold ? '<span class="sold">VENDIDO</span>'
      : player.nucleos >= it.cost ? `<button data-buy="${i}">[${i + 1}] ◆${it.cost}</button>`
      : `<span class="poor">◆${it.cost} — sem NÚCLEO</span>`;
    return `<div class="item"><div><b>${it.name}</b><p>${it.desc}</p></div>${state}</div>`;
  }).join('');
  shopDiv.innerHTML = `<h3>LOJA <span>◆${player.nucleos}</span></h3><p class="sub">sucata não vale aqui. NÚCLEO vale.</p>${rows}<p class="sub">[E] fechar · Q usa ◆ fora da loja (recarga + ★)</p>`;
}
function openShop() { shopOpen = true; firing = false; charging = false; player.chargeGlow = 0; refreshShop(); shopDiv.classList.remove('hidden'); sfx('ui'); }
function closeShop() { shopOpen = false; shopDiv.classList.add('hidden'); }
function buyStock(i) {
  const it = shop.stock[i];
  if (it && shop.buy(i, player, fx)) { refreshShop(); sfx('buy'); toast(it.name); }
}
shopDiv.addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b) buyStock(+b.dataset.buy);
});

function resetRun() {
  player.reset();
  for (const e of enemies) if (!e.dead) scene.remove(e.group);
  enemies = [];
  bullets.deactivateAll();
  grenades.deactivateAll();
  shards.clear();
  pickups.clear();
  telegraph.clearAll();
  shop.stock.forEach(it => it.sold = false);
  mods.telegraphMul = 1; mods.enemyFireMul = 1;
  still.t = 0; hitstopT = 0; firing = false;
  runT = 0; kills = 0; deathShown = false; prevHp = 3;
  taken.clear(); draftPending = 0; charging = false; closeDraft();
  director.reset();
  document.getElementById('toasts').innerHTML = '';
  setLowHp(false);
  setPrompt(null);
  hideDeath();
  closeShop();
}

document.getElementById('startBtn').addEventListener('click', () => {
  initAudio(); // gesto do usuário libera o WebAudio
  started = true;
  document.getElementById('start').classList.add('hidden');
});
document.getElementById('retryBtn').addEventListener('click', () => { initAudio(); if (player.hp <= 0) resetRun(); });

// input
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  const uiKey = e.code === 'KeyE' || e.code === 'Escape' || e.code === 'KeyM' || e.code.startsWith('Digit');
  if ((shopOpen || draftOpen) && !uiKey) { if (e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'Space') {
    charging = false; player.chargeGlow = 0; // dash cancela a carga do canhão
    if (player.tryDash()) {
      sfx('dash');
      for (const en of enemies) {
        if (en.kind === 'parasita' && en.attached && !en.dead) en.fling(player.dashDir, fx);
      }
    }
    e.preventDefault();
  }
  if (e.code === 'KeyR') {
    if (player.mag < player.magSize && player.reloading <= 0) sfx('reload');
    player.startReload();
  }
  if (e.code === 'KeyQ' && !shopOpen && player.consumeNucleo()) { rig.shake(0.06, 0.08); sfx('overcharge'); toast('★ overcharge pronto'); }
  if (e.code === 'KeyE') {
    if (shopOpen) closeShop();
    else if (!draftOpen && Math.hypot(player.pos.x - shop.pos.x, player.pos.z - shop.pos.z) < 2.6) openShop();
  }
  if (e.code === 'Escape' && shopOpen) closeShop();
  if (e.code === 'KeyM') toast(toggleMute() ? 'som off' : 'som on');
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    const di = +e.code.slice(5) - 1;
    if (shopOpen) buyStock(di); else if (draftOpen) pickDraft(di);
  }
  if (e.code === 'KeyR' && player.hp <= 0 && started) resetRun();
});
addEventListener('keyup', e => keys[e.code] = false);

const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3(2, 0, 0);
let firing = false;
let triggerEdge = false, charging = false, chargeT = 0, chargeFull = false;
addEventListener('pointermove', e => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
addEventListener('pointerdown', e => {
  initAudio();
  if (e.target.closest('#shop,#draft,#start,#death')) return; // click em UI não atira
  if (e.button === 0) { firing = true; triggerEdge = true; }
});
addEventListener('pointerup', e => { if (e.button === 0) firing = false; });
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));

function readInput() {
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  const l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l;
  const s = Math.sin(rig.azimuth), c = Math.cos(rig.azimuth);
  return { x: ix * s + iz * c, z: -ix * c + iz * s };
}

function updateAim() {
  ray.setFromCamera(mouse, rig.camera);
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(aimPlane, hit)) aimPoint.copy(hit);
}

const clock = new THREE.Clock();

function collideSlugs() {
  for (const s of bullets.items) {
    if (!s.active || s.foe) continue;
    const p = s.mesh.position;
    const sh = shards.blocksAt(p.x, p.z);
    if (sh && p.y < 1.4) { bullets.kill(s); sh.blockT = 0; fx.shake(0.05); continue; }
    for (const e of enemies) {
      if (e.dead || s.hitSet.has(e)) continue;
      const part = e.hitTest(p, s.r);
      if (!part) continue;
      bullets.kill(s);
      player.markT = 0.12; // hitmarker na mira
      const dirH = s.vel.clone().setY(0).normalize();
      if (part === 'plate') e.detachPlate(shards, dirH, fx);
      else if (part === 'ring') e.detachRing(shards, dirH, fx);
      else if (part === 'lid') e.detachLid(shards, dirH, fx);
      else if (part === 'tip') e.detachTip(shards, dirH, fx);
      else if (part === 'legL' || part === 'legR') e.detachLeg(part, shards, dirH, fx);
      else if (part.startsWith('arm')) e.detachArm(+part.slice(4), shards, dirH, fx);
      else if (e.kind === 'orbe') e.detonate(fx, player);
      else { e.damage(s.dmg, fx); if (e.kind !== 'utero' && e.kind !== 'carcaca') e.pos.addScaledVector(dirH, s.knock ?? 0.25); }
      s.hitSet.add(e);
      if (s.pierce > 0) s.pierce--; // dardo/canhão atravessam e seguem voando
      else bullets.kill(s);
      break;
    }
  }
  for (const s of bullets.items) {
    if (!s.active || !s.foe) continue;
    const p = s.mesh.position;
    const sh = shards.blocksAt(p.x, p.z);
    if (sh && p.y < 1.4) { bullets.kill(s); sh.blockT = 0; continue; }
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
    if (p.y < 1.6 && dx * dx + dz * dz < 0.45) {
      bullets.kill(s);
      if (player.damage()) { fx.hitstop(0.08); fx.shake(0.18); }
    }
  }
  for (const s of shards.shards) {
    if (s.hotT <= 0 || s.mesh.position.y > 1.3) continue;
    const dx = s.mesh.position.x - player.pos.x, dz = s.mesh.position.z - player.pos.z;
    if (dx * dx + dz * dz < (s.r + 0.35) * (s.r + 0.35)) {
      s.hotT = 0;
      if (player.damage()) { fx.hitstop(0.08); fx.shake(0.18); }
    }
  }
}

// disparo central: aplica stats da arma + overcharge no slug do pool
function fireSlug(dir, o = {}) {
  const w = WEAPONS[player.weaponId];
  const s = bullets.fire(player.pos.clone().addScaledVector(dir, 0.7), dir, o.speed ?? w.speed, false, 1.0);
  if (!s) return null;
  const over = player.overcharge && !o.noOver;
  s.dmg = (o.dmg ?? w.dmg) + (over ? 1 : 0);
  s.pierce = o.pierce ?? w.pierce ?? 0;
  s.knock = o.knock ?? w.enemyKnock ?? 0.25;
  s.life = o.life ?? w.life ?? 2.2;
  const baseSize = o.size ?? w.size ?? 1;
  s.mesh.scale.setScalar(baseSize * (over ? 1.45 : 1));
  s.r = 0.35 * baseSize;
  if (over) {
    player.overchargeShots--;
    if (player.overchargeShots <= 0) player.overcharge = false;
  }
  return s;
}

// draft roguelike: fim de onda = escolha 1 de 3 (arma troca, status muda regra)
const STATUS_POOL = [
  { id: 'mag2', name: 'Fita estendida', desc: '+2 no pente da arma atual.' },
  { id: 'remendo', name: 'Remendo de placa', desc: '+1 segmento de vida e cura 1.' },
  { id: 'molas', name: 'Molas', desc: 'dash 0.3s mais rápido (mín 1.0s).' },
  { id: 'pernas', name: 'Pernas leves', desc: '+12% velocidade de movimento.' },
  { id: 'over2', name: 'Sobrecarga estável', desc: '★ do NÚCLEO dura 2 tiros.' },
  { id: 'ima', name: 'Ímã de sucata', desc: 'pickups voam até você.' },
];
const taken = new Set();
let draftOpen = false, draftPending = 0, draftOpts = [];
const draftDiv = document.getElementById('draft');
function rollDraft() {
  const pool = [];
  for (const id of ['dardo', 'sucata', 'estilete', 'canhao']) {
    if (id !== player.weaponId) {
      const w = WEAPONS[id];
      pool.push({ type: 'weapon', id, name: w.name, desc: w.desc + ' (troca sua arma)' });
    }
  }
  for (const s of STATUS_POOL) if (!taken.has(s.id)) pool.push({ type: 'status', ...s });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const opts = pool.slice(0, 3);
  const fills = [
    { type: 'bonus', id: 'nucleo', name: 'Núcleo solto', desc: '+1 ◆ direto no bolso.' },
    { type: 'bonus', id: 'sucata2', name: 'Kit de sucata', desc: '+2 sucatas aos pés.' },
  ];
  let f = 0;
  while (opts.length < 3) opts.push(fills[f++ % 2]);
  return opts;
}
function renderDraft() {
  draftDiv.innerHTML = `<h3>DRAFT <span class="tag">onda ${director.wave} eliminada</span></h3><p class="sub">escolha 1 — arma troca, status muda regra.</p>` +
    draftOpts.map((o, i) => `<div class="item"><div><b>${o.name}</b><p>${o.desc}</p></div><button data-pick="${i}">[${i + 1}] pegar</button></div>`).join('');
}
function openDraft() {
  draftOpts = rollDraft();
  draftOpen = true; firing = false; charging = false; player.chargeGlow = 0;
  renderDraft(); draftDiv.classList.remove('hidden'); sfx('ui');
}
function closeDraft() { draftOpen = false; draftDiv.classList.add('hidden'); }
function pickDraft(i) {
  const o = draftOpts[i];
  if (!o) return;
  if (o.type === 'weapon') player.setWeapon(o.id);
  else if (o.type === 'status') {
    taken.add(o.id);
    if (o.id === 'mag2') player.setMagSize(player.magSize + 2);
    if (o.id === 'remendo') player.setMaxHp(Math.min(4, player.maxHp + 1));
    if (o.id === 'molas') player.dashCdBase = Math.max(1.0, player.dashCdBase - 0.3);
    if (o.id === 'pernas') player.speed *= 1.12;
    if (o.id === 'over2') player.overchargeMax = 2;
    if (o.id === 'ima') player.magnet = true;
  }
  else if (o.id === 'nucleo') player.nucleos = Math.min(3, player.nucleos + 1);
  else if (o.id === 'sucata2') { pickups.dropSucata(player.pos); pickups.dropSucata(player.pos); }
  sfx('buy'); toast(o.name);
  closeDraft();
}
draftDiv.addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (b) pickDraft(+b.dataset.pick);
});

function loop() {
  requestAnimationFrame(loop);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  if (started && !shopOpen && !draftOpen) {
    const dt = hitstopT > 0 ? (hitstopT -= rawDt, rawDt * 0.05) : rawDt;
    const dead = player.hp <= 0;
    if (!dead) runT += rawDt;

    updateAim();
    if (dead) { firing = false; charging = false; player.chargeGlow = 0; }
    const input = dead ? { x: 0, z: 0 } : readInput();

    if (!dead && player.vel.length() < 0.6) still.t += rawDt; else still.t = 0;

    const attached = enemies.filter(e => e.kind === 'parasita' && e.attached && !e.dead).length;
    player.speedMul = Math.pow(0.85, attached) * (charging ? 0.6 : 1);
    player.dashPenalty = attached * 0.5;

    const wasReloading = player.reloading > 0;
    player.update(dt, input, aimPoint);
    if (wasReloading && player.reloading <= 0) sfx('reloadDone');
    collideWorld(room, player.pos, 0.4);
    rig.target.copy(player.pos);
    rig.update(rawDt);

    if (firing && !dead) {
      const w = WEAPONS[player.weaponId];
      const dir = new THREE.Vector3(Math.cos(player.aimAngle), 0, Math.sin(player.aimAngle));
      if (w.charge) {
        // canhão: segura p/ carregar, solta p/ disparar
        triggerEdge = false;
        if (charging) {
          chargeT += dt;
          player.chargeGlow = Math.min(1, chargeT / w.chargeTime);
          if (chargeT >= w.chargeTime && !chargeFull) { chargeFull = true; sfx('overcharge'); }
          if (!firing) {
            if (player.mag > 0 && chargeT >= w.minCharge && player.reloading <= 0 && player.dashT <= 0) {
              const power = Math.min(1, chargeT / w.chargeTime);
              const over = player.overcharge;
              fireSlug(dir, { dmg: power >= 1 ? w.dmg : 1, size: power >= 1 ? 2.0 : 1.2, pierce: 99 });
              player.onFired(w.kick * (0.5 + power * 0.5), w.cd);
              sfx(power >= 1 ? 'oshoot' : 'shoot');
              fx.shake(0.05 + power * 0.09, 0.08);
            }
            charging = false; chargeT = 0; chargeFull = false; player.chargeGlow = 0;
          }
        } else if (triggerEdge) {
          triggerEdge = false;
          if (player.mag <= 0 && player.reloading <= 0) { player.startReload(); player.onDryFire(); sfx('dry'); sfx('reload'); }
          else if (player.canFire()) { charging = true; chargeT = 0; chargeFull = false; }
        }
      } else {
        const wantFire = w.auto ? true : triggerEdge;
        triggerEdge = false;
        if (player.mag <= 0 && player.reloading <= 0) {
          if (wantFire) { player.startReload(); player.onDryFire(); sfx('dry'); sfx('reload'); }
        } else if (wantFire && player.canFire()) {
          const over = player.overcharge;
          if (w.count > 1) {
            for (let i = 0; i < w.count; i++) {
              const a = player.aimAngle + (Math.random() - 0.5) * 2 * w.spread;
              fireSlug(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), { life: w.life });
            }
          } else {
            const a = player.aimAngle + (w.spread ? (Math.random() - 0.5) * 2 * w.spread : 0);
            fireSlug(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), { life: w.life });
          }
          player.onFired(w.kick, w.cd);
          sfx(over ? 'oshoot' : 'shoot');
          fx.shake(over ? 0.12 : player.weaponId === 'sucata' ? 0.1 : 0.05, 0.07);
        }
      }
    } else triggerEdge = false;

    bullets.update(dt, room);
    grenades.update(dt, player, room, fx);
    collideSlugs();
    shards.update(dt);
    pickups.update(dt, player, kind => { toast(kind === 'nucleo' ? '◆ NÚCLEO' : '+1 sucata'); sfx(kind === 'nucleo' ? 'nucleo' : 'sucata'); });
    telegraph.update(dt);
    shop.update(dt);
    for (const e of enemies) e.update(dt, player, bullets, fx);

    for (const u of enemies) {
      if (u.kind !== 'utero' || u.dead) continue;
      const bodies = [player, ...enemies.filter(e => e !== u && !e.dead && e.kind !== 'utero')];
      for (const b of bodies) {
        const bp = b.pos;
        const dx = bp.x - u.pos.x, dz = bp.z - u.pos.z;
        const rr = 1.25 + (b === player ? 0.4 : 0.5);
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          bp.x = u.pos.x + dx / d * rr; bp.z = u.pos.z + dz / d * rr;
        }
      }
    }
    kills += enemies.filter(e => e.dead).length;
    enemies = enemies.filter(e => !e.dead);

    if (draftPending > 0) {
      draftPending -= rawDt;
      if (draftPending <= 0 && player.hp > 0 && !shopOpen) openDraft();
    }
    director.update(dt, { foes: enemies, player });

    if (dead && !deathShown) {
      deathShown = true;
      sfx('death');
      setLowHp(false);
      setPrompt(null);
      showDeath({ wave: director.wave, time: runT, kills, seed: SEED });
    }
    if (!dead) {
      if (player.hp < prevHp) { damageFlash(); sfx('hurt'); blood.splatter(player.pos.x, player.pos.z, 0.7); }
      prevHp = player.hp;
      setLowHp(player.hp === 1);
      const nearShop = Math.hypot(player.pos.x - shop.pos.x, player.pos.z - shop.pos.z) < 2.6;
      if (nearShop) setPrompt(`[E] loja · ◆${player.nucleos}`);
      else if (attached > 0 && player.dashCd <= 0) setPrompt('[SPACE] arrancar parasitas');
      else if (player.nucleos > 0 && !player.overcharge && player.mag <= 1) setPrompt('[Q] ◆ recarga + ★');
      else setPrompt(null);
      setTop(`ONDA ${director.wave || '—'} · ${fmtTime(runT)}`);
    }
  }
  renderer.render(scene, rig.camera);
}
loop();

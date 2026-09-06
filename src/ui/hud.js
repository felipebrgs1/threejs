const $ = (id) => document.getElementById(id);

let bannerTO = null;
export function banner(main, sub = '') {
  const b = $('banner');
  b.innerHTML = `${main}${sub ? `<span>${sub}</span>` : ''}`;
  b.classList.remove('hidden');
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  clearTimeout(bannerTO);
  bannerTO = setTimeout(() => b.classList.add('hidden'), 2300);
}

export function toast(text) {
  const box = $('toasts');
  while (box.children.length >= 4) box.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 1200);
  setTimeout(() => d.remove(), 1700);
}

export function setPrompt(text) {
  const p = $('prompt');
  if (!text) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  if (p.textContent !== text) p.textContent = text;
}

export function setTop(text) {
  const t = $('top');
  if (t.textContent !== text) t.textContent = text;
}

export function damageFlash() {
  const v = $('vignette-dmg');
  v.style.transition = 'none'; v.style.opacity = '0.65';
  void v.offsetWidth;
  v.style.transition = 'opacity .5s'; v.style.opacity = '0';
}

export function setLowHp(on) { $('vignette-low').classList.toggle('on', on); }

export function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function showDeath({ wave, time, kills, seed }) {
  $('deathStats').textContent = `onda ${wave} · ${fmtTime(time)} · ${kills} abates · seed ${seed}`;
  $('death').classList.remove('hidden');
}
export function hideDeath() { $('death').classList.add('hidden'); }

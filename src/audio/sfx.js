// SFX procedural: WebAudio puro, zero assets. Contexto abre no primeiro gesto.
// Volumes conservadores + compressor no master. `sfx('nome')` em qualquer lugar.
let ac = null, master = null, noiseBuf = null;
let muted = false;
const lastPlay = {};

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  const comp = ac.createDynamicsCompressor();
  master = ac.createGain(); master.gain.value = 0.32;
  master.connect(comp); comp.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() { muted = !muted; return muted; }

function throttle(name, ms) {
  const t = ac.currentTime;
  if (lastPlay[name] && t - lastPlay[name] < ms / 1000) return false;
  lastPlay[name] = t; return true;
}

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.5, at = 0 }) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(Math.max(1, f), t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.4, fc = 1000, fc2 = null, type = 'lowpass', at = 0 }) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + at;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type;
  fl.frequency.setValueAtTime(Math.max(10, fc), t0);
  if (fc2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, fc2), t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(fl); fl.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

export function sfx(name) {
  if (!ac || muted) return;
  switch (name) {
    case 'shoot': if (!throttle('shoot', 40)) return;
      tone({ f: 220, f2: 55, type: 'triangle', dur: 0.14, vol: 0.7 });
      noise({ dur: 0.06, vol: 0.25, fc: 3000 }); break;
    case 'oshoot':
      tone({ f: 140, f2: 35, type: 'sawtooth', dur: 0.25, vol: 0.8 });
      noise({ dur: 0.2, vol: 0.4, fc: 1200, fc2: 200 }); break;
    case 'dry': tone({ f: 1200, type: 'square', dur: 0.03, vol: 0.15 }); break;
    case 'reload':
      tone({ f: 500, type: 'square', dur: 0.04, vol: 0.2 });
      tone({ f: 750, type: 'square', dur: 0.04, vol: 0.2, at: 0.09 }); break;
    case 'reloadDone': tone({ f: 880, type: 'square', dur: 0.05, vol: 0.22 }); break;
    case 'hit': if (!throttle('hit', 50)) return;
      tone({ f: 900, f2: 300, type: 'square', dur: 0.05, vol: 0.3 }); break;
    case 'crunch':
      noise({ dur: 0.18, vol: 0.5, fc: 2500, fc2: 300 });
      tone({ f: 160, f2: 60, type: 'square', dur: 0.15, vol: 0.4 }); break;
    case 'boom':
      tone({ f: 90, f2: 28, type: 'sine', dur: 0.5, vol: 0.9 });
      noise({ dur: 0.4, vol: 0.5, fc: 900, fc2: 80 }); break;
    case 'bigboom':
      tone({ f: 70, f2: 24, type: 'sine', dur: 0.8, vol: 1 });
      noise({ dur: 0.7, vol: 0.6, fc: 1400, fc2: 60 });
      tone({ f: 45, f2: 30, type: 'triangle', dur: 0.7, vol: 0.7, at: 0.05 }); break;
    case 'hurt':
      tone({ f: 110, f2: 55, type: 'sawtooth', dur: 0.25, vol: 0.7 });
      noise({ dur: 0.15, vol: 0.3, fc: 800 }); break;
    case 'dash': if (!throttle('dash', 150)) return;
      noise({ dur: 0.18, vol: 0.3, fc: 400, fc2: 4000, type: 'bandpass' }); break;
    case 'sucata': tone({ f: 880, type: 'sine', dur: 0.07, vol: 0.25 }); break;
    case 'nucleo':
      tone({ f: 660, type: 'sine', dur: 0.1, vol: 0.3 });
      tone({ f: 990, type: 'sine', dur: 0.14, vol: 0.3, at: 0.09 }); break;
    case 'buy': [523, 659, 784].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.1, vol: 0.3, at: i * 0.07 })); break;
    case 'overcharge': tone({ f: 330, f2: 1320, type: 'sawtooth', dur: 0.2, vol: 0.3 }); break;
    case 'horn':
      tone({ f: 55, f2: 82, type: 'sawtooth', dur: 0.7, vol: 0.5 });
      tone({ f: 110, f2: 165, type: 'sawtooth', dur: 0.7, vol: 0.25, at: 0.05 }); break;
    case 'clear':
      tone({ f: 392, type: 'triangle', dur: 0.15, vol: 0.3 });
      tone({ f: 523, type: 'triangle', dur: 0.2, vol: 0.3, at: 0.12 }); break;
    case 'lob': tone({ f: 300, f2: 600, type: 'sine', dur: 0.12, vol: 0.2 }); break;
    case 'spit': tone({ f: 400, f2: 150, type: 'square', dur: 0.08, vol: 0.2 }); break;
    case 'stick': tone({ f: 500, f2: 250, type: 'square', dur: 0.08, vol: 0.25 }); break;
    case 'inflate': tone({ f: 200, f2: 800, type: 'sine', dur: 0.4, vol: 0.2 }); break;
    case 'foeShoot': if (!throttle('foeShoot', 140)) return;
      tone({ f: 180, f2: 70, type: 'square', dur: 0.08, vol: 0.25 }); break;
    case 'ui': tone({ f: 700, type: 'sine', dur: 0.05, vol: 0.2 }); break;
    case 'heal':
      tone({ f: 523, type: 'triangle', dur: 0.12, vol: 0.3 });
      tone({ f: 659, type: 'triangle', dur: 0.12, vol: 0.3, at: 0.09 });
      tone({ f: 784, type: 'triangle', dur: 0.18, vol: 0.3, at: 0.18 }); break;
    case 'death':
      tone({ f: 220, f2: 30, type: 'sawtooth', dur: 1.0, vol: 0.7 });
      noise({ dur: 0.8, vol: 0.4, fc: 600, fc2: 60 }); break;
  }
}

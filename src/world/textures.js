import * as THREE from 'three';

// Texturas procedurais do supermercado: tudo desenhado em canvas, zero assets.
// Piso quadriculado, gôndolas com produtos, geladeiras, placas e cartazes.
function make(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const R = (a, b) => a + Math.random() * (b - a);
const PROD = ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad', '#e8e4da', '#d35400'];

export function floorTex() {
  return make(256, (g, s) => {
    const t = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#c9cec0' : '#dfe2d6';
      g.fillRect(i * t, j * t, t, t);
    }
    g.strokeStyle = '#8a8f88'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * t); g.lineTo(s, i * t); g.stroke();
    }
    for (let i = 0; i < 130; i++) { // sujeira encrustada
      g.fillStyle = `rgba(60,60,55,${R(0.03, 0.1)})`;
      g.fillRect(R(0, s), R(0, s), R(1, 3), R(1, 3));
    }
  });
}

export function wallTex() {
  return make(256, (g, s) => {
    g.fillStyle = '#d5d8d2'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#a9ada6'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(s, i * 32); g.stroke();
    }
    g.fillStyle = '#3f6b4f'; g.fillRect(0, s * 0.42, s, s * 0.16); // faixa verde
    g.fillStyle = '#2a2d31'; g.fillRect(0, s - 18, s, 18); // rodapé
  });
}

export function tileTex() {
  return make(128, (g, s) => {
    g.fillStyle = '#cfd3cc'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#9aa09a'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(s, i * 32); g.stroke();
    }
    for (let i = 0; i < 12; i++) { // respingos
      g.fillStyle = `rgba(90,20,20,${R(0.1, 0.3)})`;
      g.fillRect(R(0, s), R(0, s), R(1, 4), R(1, 5));
    }
  });
}

export function shelfTex(v = 0) {
  return make(256, (g, s) => {
    g.fillStyle = ['#d8dce0', '#ddd8ce', '#d2dbe0'][v % 3]; g.fillRect(0, 0, s, s);
    for (let row = 0; row < 3; row++) {
      const y = row * (s / 3);
      g.fillStyle = '#9aa2ab'; g.fillRect(0, y, s, s / 3); // fundo da prateleira
      let x = 4;
      while (x < s - 8) { // produtos
        const w = R(10, 26), h = R(28, 52);
        g.fillStyle = PROD[(Math.random() * PROD.length) | 0];
        g.fillRect(x, y + s / 3 - 14 - h, w, h);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(x, y + s / 3 - 14 - h, w, 5); // brilho da embalagem
        x += w + R(1, 5);
      }
      g.fillStyle = '#6e757e'; g.fillRect(0, y + s / 3 - 14, s, 10); // tábua
      g.fillStyle = '#f5f2e8'; g.fillRect(0, y + s / 3 - 12, s, 5); // régua de preço
      g.fillStyle = '#c0392b';
      for (let px = 6; px < s; px += 22) g.fillRect(px, y + s / 3 - 11, 8, 3);
    }
  });
}

export function checkoutTex(num) {
  return make(256, (g, s) => {
    g.fillStyle = '#22262c'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#101216'; g.fillRect(0, s * 0.55, s, s * 0.45); // esteira
    g.fillStyle = '#ffc857'; g.font = 'bold 44px sans-serif';
    g.fillText('CAIXA ' + num, 18, 70);
    g.fillStyle = '#ff3b30'; g.fillRect(200, 90, 34, 10); // scanner
    g.fillStyle = '#3a4048'; g.fillRect(0, 0, s, 14);
  });
}

export function fridgeTex() {
  return make(256, (g, s) => {
    g.fillStyle = '#1d4e89'; g.fillRect(0, 0, s, 34);
    g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.fillText('FRIOS', 12, 26);
    for (let d = 0; d < 4; d++) {
      const x = d * (s / 4);
      const grad = g.createLinearGradient(x, 0, x + s / 4, 0);
      grad.addColorStop(0, 'rgba(180,220,255,.85)');
      grad.addColorStop(0.5, 'rgba(220,240,255,.55)');
      grad.addColorStop(1, 'rgba(160,200,240,.85)');
      g.fillStyle = '#2a2f36'; g.fillRect(x + 2, 38, s / 4 - 4, s - 42);
      g.fillStyle = grad; g.fillRect(x + 6, 42, s / 4 - 12, s - 50);
      for (let r = 0; r < 3; r++) { // produtos atrás do vidro
        let px = x + 10;
        while (px < x + s / 4 - 14) {
          const w = R(6, 12), h = R(12, 24);
          g.fillStyle = PROD[(Math.random() * PROD.length) | 0];
          g.globalAlpha = 0.75;
          g.fillRect(px, 60 + r * 60 - h * 0.4, w, h);
          g.globalAlpha = 1;
          px += w + 2;
        }
      }
    }
  });
}

export function signTex(main, sub) {
  return make(256, (g, s) => {
    g.fillStyle = '#16191d'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffc857'; g.font = 'bold 40px sans-serif';
    g.fillText(main, 16, 110);
    g.fillStyle = '#9fb3c8'; g.font = '24px sans-serif';
    g.fillText(sub, 16, 160);
    g.fillStyle = '#ffc857'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
  });
}

export function crateTex() {
  return make(128, (g, s) => {
    g.fillStyle = '#a9804e'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#8a6538'; g.fillRect(0, s / 2 - 6, s, 12); // fita
    g.strokeStyle = '#6e4f2a'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
    g.fillStyle = '#5e4426'; g.font = 'bold 20px sans-serif';
    g.fillText('FRÁGIL', 22, 44);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(60,40,20,${R(0.05, 0.15)})`;
      g.fillRect(R(0, s), R(0, s), R(1, 4), R(1, 4));
    }
  });
}

export function freezerTex() {
  return make(128, (g, s) => {
    g.fillStyle = '#e8ebee'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c0392b'; // cruz vermelha
    g.fillRect(s / 2 - 10, 22, 20, 56);
    g.fillRect(s / 2 - 28, 40, 56, 20);
    g.fillStyle = '#2a2d31'; g.font = 'bold 15px sans-serif';
    g.fillText('EMERGÊNCIA', 14, 108);
    g.strokeStyle = '#9aa0a8'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
  });
}

export function concreteTex() {
  return make(256, (g, s) => {
    g.fillStyle = '#7e8287'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,42,46' : '160,164,168'},${R(0.04, 0.12)})`;
      g.fillRect(R(0, s), R(0, s), R(1, 5), R(1, 5));
    }
    g.strokeStyle = '#5e6266'; g.lineWidth = 3; // juntas de dilatação
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.fillStyle = 'rgba(30,30,34,.25)'; // manchas de óleo
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.arc(R(0, s), R(0, s), R(4, 14), 0, 7); g.fill();
    }
  });
}

export function posterTex(i) {
  const bg = ['#c0392b', '#e6a817', '#1d4e89'][i % 3];
  return make(128, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 26px sans-serif';
    g.fillText(['OFERTA', 'PROMO', 'CARNE'][i % 3], s / 2, 60);
    g.font = 'bold 40px sans-serif';
    g.fillText(['2,99', '5,49', '9,90'][i % 3], s / 2, 120);
    g.font = '16px sans-serif';
    g.fillText('só hoje', s / 2, 150);
    g.textAlign = 'left';
  });
}

// Arsenal: 4 fantasias com tradeoff. Cadência baixa/média, tudo com massa.
// pierce = atravessa N módulos/inimigos. life = alcance honesto (segundos de voo).
export const WEAPONS = {
  dardo: {
    id: 'dardo', name: 'Lança-dardo', desc: '1 slug pesado que perfura 1 módulo.',
    mag: 3, reload: 1.6, cd: 0.42, kick: 1.6,
    speed: 18, dmg: 1, pierce: 1, size: 1, life: 2.2,
    auto: false, enemyKnock: 0.25,
  },
  sucata: {
    id: 'sucata', name: 'Espingarda de sucata', desc: 'cone curto devastador, inútil longe.',
    mag: 2, reload: 2.0, cd: 0.85, kick: 3.4,
    speed: 14, dmg: 1, pierce: 0, size: 1, life: 0.32,
    spread: 0.22, count: 5, auto: false, enemyKnock: 0.5,
  },
  estilete: {
    id: 'estilete', name: 'Estilete', desc: 'agulhas rápidas, pouco impacto. Segure o click.',
    mag: 6, reload: 1.4, cd: 0.16, kick: 0.5,
    speed: 26, dmg: 1, pierce: 0, size: 0.55, life: 1.4,
    spread: 0.02, auto: true, enemyKnock: 0.06,
  },
  canhao: {
    id: 'canhao', name: 'Canhão de núcleo', desc: 'segure p/ carregar 0.8s. Recuo brutal, empurra você.',
    mag: 2, reload: 2.4, cd: 1.0, kick: 4.2,
    speed: 10, dmg: 3, pierce: 99, size: 2.0, life: 2.5,
    auto: false, charge: true, chargeTime: 0.8, minCharge: 0.35, enemyKnock: 0.6,
  },
};

import * as THREE from 'three';

// Loja cara: terminal-obelisco. E abre, 1/2/3 compra com NÚCLEO (◆).
// Upgrade muda REGRA, nunca +10% dano.
const GOLD = 0xffc857;

export class Shop {
  constructor(scene, x = -11, z = 10) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    const ob = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 2.2, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.5, metalness: 0.5 })
    );
    ob.position.y = 1.1; ob.castShadow = true;
    this.group.add(ob);

    this.top = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 1.8 })
    );
    this.top.position.y = 2.6;
    this.group.add(this.top);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.2, 40),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04;
    this.group.add(this.ring);

    scene.add(this.group);

    this.stock = [
      { id: 'mag', name: 'Pente Estendido', desc: 'pente 3 → 5. Orbes extras no ombro.', cost: 1, sold: false },
      { id: 'dash', name: 'Fôlego', desc: 'dash recarrega em 1.4s em vez de 2.0s.', cost: 1, sold: false },
      { id: 'olho', name: 'Olho Claro', desc: 'telegraphs inimigos 35% mais longos. Caro porque tempo é vida.', cost: 2, sold: false },
    ];
  }

  buy(i, player, fx) {
    const it = this.stock[i];
    if (!it || it.sold || player.nucleos < it.cost) return false;
    player.nucleos -= it.cost;
    it.sold = true;
    if (it.id === 'mag') player.setMagSize(5);
    if (it.id === 'dash') player.dashCdBase = 1.4;
    if (it.id === 'olho') fx.mods.telegraphMul = 1.35;
    fx.shake(0.08, 0.1);
    return true;
  }

  update(dt) {
    this.top.rotation.y += dt * 1.5;
    this.top.position.y = 2.6 + Math.sin(performance.now() * 0.002) * 0.08;
  }
}

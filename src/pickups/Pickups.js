import * as THREE from 'three';

// Drops da run: SUCATA (+1 bala no pente) e NÚCLEO (recarga total + overcharge).
// Dourado = cor de item raro. Coleta por proximidade, sem tecla.
const GOLD = 0xffc857;

export class PickupField {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }
  _spawn(mesh, halo, kind, pos) {
    if (this.items.length > 14) return;
    const m = mesh;
    m.position.set(pos.x + (Math.random() - 0.5) * 1.6, 1.4, pos.z + (Math.random() - 0.5) * 1.6);
    m.castShadow = true;
    this.scene.add(m);
    if (halo) { halo.position.copy(m.position); this.scene.add(halo); }
    this.items.push({ mesh: m, halo, kind, dropT: 0, phase: Math.random() * 10, restY: kind === 'nucleo' ? 0.5 : 0.32 });
  }
  dropSucata(pos) {
    this._spawn(new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.15),
      new THREE.MeshStandardMaterial({ color: 0x6b5a2a, emissive: GOLD, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.6 })
    ), null, 'sucata', pos);
  }
  dropNucleo(pos) {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    this._spawn(new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26),
      new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 1.6, roughness: 0.3 })
    ), halo, 'nucleo', pos);
  }
  dropBandagem(pos) { // kit de primeiros socorros: cura 1 segmento
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 })
    );
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x2e9e5b });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), crossMat);
    c1.position.z = 0.125;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), crossMat);
    c2.position.z = 0.125;
    m.add(c1, c2);
    this._spawn(m, null, 'bandagem', pos);
  }
  _remove(i) {
    const it = this.items[i];
    this.scene.remove(it.mesh);
    if (it.halo) this.scene.remove(it.halo);
    this.items.splice(i, 1);
  }
  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this._remove(i);
  }
  collectAll(player) { // troca de andar: recolhe as sobras com os limites normais
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.kind === 'sucata' && player.mag < player.magSize) player.mag++;
      else if (it.kind === 'nucleo' && player.nucleos < 3) player.nucleos++;
      else if (it.kind === 'bandagem' && player.hp < player.maxHp) player.hp++;
      this._remove(i);
    }
  }
  update(dt, player, onPick) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.phase += dt * 2.5;
      // queda inicial + flutuação
      it.dropT = Math.min(1, it.dropT + dt * 2.5);
      const ease = 1 - (1 - it.dropT) * (1 - it.dropT);
      it.mesh.position.y = 1.4 + (it.restY - 1.4) * ease + Math.sin(it.phase) * 0.05;
      it.mesh.rotation.y += dt * 2;
      if (it.halo) {
        it.halo.position.set(it.mesh.position.x, 0.04, it.mesh.position.z);
        it.halo.material.opacity = 0.5 + Math.sin(it.phase * 1.5) * 0.25;
      }
      const dx = it.mesh.position.x - player.pos.x, dz = it.mesh.position.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (player.magnet && d2 < 9 && d2 > 0.8) { // ímã: voa até você
        const d = Math.sqrt(d2);
        it.mesh.position.x -= dx / d * 6 * dt;
        it.mesh.position.z -= dz / d * 6 * dt;
        if (it.halo) it.halo.position.set(it.mesh.position.x, 0.04, it.mesh.position.z);
        continue;
      }
      if (d2 > 0.95 * 0.95) continue;
      if (it.kind === 'sucata') {
        if (player.mag >= player.magSize) continue; // pente cheio: deixa no chão
        player.mag++;
        onPick?.('sucata');
        this._remove(i);
      } else if (it.kind === 'bandagem') {
        if (player.hp >= player.maxHp) continue; // cheio: deixa no chão
        player.hp++;
        onPick?.('bandagem');
        this._remove(i);
      } else {
        if (player.nucleos >= 3) continue; // bolso cheio: deixa no chão
        player.nucleos++; // Q = recarga pesada + overcharge · loja = moeda
        onPick?.('nucleo');
        this._remove(i);
      }
    }
  }
}

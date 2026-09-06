import * as THREE from 'three';

// Rig isométrico ortográfico estilo PZ: azimuth 45°, elevação ~33°.
// Shake = offset curto no plano da câmera, nunca rotação.
export class IsoRig {
  constructor(target) {
    const aspect = innerWidth / innerHeight;
    this.frustum = 15;
    this.camera = new THREE.OrthographicCamera(
      -this.frustum * aspect / 2, this.frustum * aspect / 2,
      this.frustum / 2, -this.frustum / 2, 0.1, 200
    );
    this.azimuth = Math.PI / 4;
    this.elevation = THREE.MathUtils.degToRad(33);
    this.dist = 30;
    this.target = target.clone();
    this.follow = target.clone();
    this.shakeT = 0; this.shakeDur = 0; this.shakeAmp = 0;
    addEventListener('resize', () => this.resize());
    this.update(1);
  }
  resize() {
    const aspect = innerWidth / innerHeight;
    const c = this.camera;
    c.left = -this.frustum * aspect / 2; c.right = this.frustum * aspect / 2;
    c.top = this.frustum / 2; c.bottom = -this.frustum / 2;
    c.updateProjectionMatrix();
  }
  dir() {
    const { azimuth: az, elevation: el } = this;
    return new THREE.Vector3(
      Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)
    );
  }
  shake(amp = 0.12, dur = 0.1) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = dur; this.shakeDur = dur;
  }
  update(dt) {
    // segue player com lerp — tenso mas não duro
    this.follow.lerp(this.target, 1 - Math.exp(-7 * dt));
    const d = this.dir();
    const base = this.follow.clone().addScaledVector(d, this.dist);
    // shake decai
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / this.shakeDur);
      ox = (Math.random() * 2 - 1) * this.shakeAmp * k;
      oy = (Math.random() * 2 - 1) * this.shakeAmp * k;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    this.camera.position.copy(base);
    // offset de shake no espaço de tela da câmera
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.camera.position.addScaledVector(right, ox).addScaledVector(up, oy);
    this.camera.lookAt(this.follow.x + ox * 0.5, 0.6, this.follow.z);
  }
}

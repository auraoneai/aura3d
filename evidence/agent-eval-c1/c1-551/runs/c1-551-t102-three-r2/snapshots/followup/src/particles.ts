import * as THREE from 'three';
import { mulberry32 } from './textures';

const SPIRAL_COUNT = 640;
const MOTE_COUNT = 140;
export const PARTICLE_TOTAL = SPIRAL_COUNT + MOTE_COUNT;

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aSize * uScale / -mv.z, 1.0);
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 2.0);
  float core = pow(1.0 - d, 6.0);
  gl_FragColor = vec4(vColor * (0.5 + 1.5 * core), a * vAlpha);
}
`;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class PortalParticles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(PARTICLE_TOTAL * 3);
  private readonly col = new Float32Array(PARTICLE_TOTAL * 3);
  private readonly size = new Float32Array(PARTICLE_TOTAL);
  private readonly alpha = new Float32Array(PARTICLE_TOTAL);
  // spiral state
  private readonly rad = new Float32Array(SPIRAL_COUNT);
  private readonly ang = new Float32Array(SPIRAL_COUNT);
  private readonly zoff = new Float32Array(SPIRAL_COUNT);
  private readonly age = new Float32Array(SPIRAL_COUNT);
  private readonly dir = new Float32Array(SPIRAL_COUNT);
  private readonly tint = new Float32Array(SPIRAL_COUNT);
  private readonly sz = new Float32Array(SPIRAL_COUNT);
  // mote state
  private readonly mAge = new Float32Array(MOTE_COUNT);
  private readonly mLife = new Float32Array(MOTE_COUNT);
  private readonly mVy = new Float32Array(MOTE_COUNT);
  private readonly mX = new Float32Array(MOTE_COUNT);
  private readonly mZ = new Float32Array(MOTE_COUNT);
  private readonly mPhase = new Float32Array(MOTE_COUNT);
  private readonly mTint = new Float32Array(MOTE_COUNT);
  private readonly mSz = new Float32Array(MOTE_COUNT);
  private readonly rnd = mulberry32(1234);
  private readonly cyan = new THREE.Color(0.25, 0.9, 1.0);
  private readonly violet = new THREE.Color(0.65, 0.3, 1.0);
  private readonly tmp = new THREE.Color();
  private readonly white = new THREE.Color(1, 1, 1);
  private readonly center: THREE.Vector3;
  liveCount = 0;

  constructor(center: THREE.Vector3, viewHeight: number, fovDeg: number) {
    this.center = center.clone();
    for (let i = 0; i < SPIRAL_COUNT; i++) {
      this.respawnSpiral(i, true);
    }
    for (let i = 0; i < MOTE_COUNT; i++) {
      this.respawnMote(i, true);
    }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: viewHeight / (2 * Math.tan((fovDeg * Math.PI) / 360)) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.update(0, 0);
  }

  private respawnSpiral(i: number, initial: boolean): void {
    const r = this.rnd;
    this.rad[i] = initial ? 0.3 + r() * 4.2 : 3.2 + r() * 1.6;
    this.ang[i] = r() * Math.PI * 2;
    this.zoff[i] = (r() - 0.5) * 3.2 * (this.rad[i] / 3);
    this.age[i] = initial ? 2 : 0;
    this.dir[i] = 1;
    this.tint[i] = r();
    this.sz[i] = 0.04 + r() * 0.07;
  }

  private respawnMote(i: number, initial: boolean): void {
    const r = this.rnd;
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 4.6;
    this.mX[i] = Math.cos(a) * d;
    this.mZ[i] = Math.sin(a) * d;
    this.mLife[i] = 3.5 + r() * 4;
    this.mAge[i] = initial ? r() * this.mLife[i] : 0;
    this.mVy[i] = 0.3 + r() * 0.6;
    this.mPhase[i] = r() * 6.28;
    this.mTint[i] = r();
    this.mSz[i] = 0.035 + r() * 0.06;
  }

  update(dt: number, time: number): void {
    const c = this.center;
    let live = 0;
    for (let i = 0; i < SPIRAL_COUNT; i++) {
      this.age[i] += dt;
      let r = this.rad[i];
      this.ang[i] += dt * (0.5 + 2.4 / (r + 0.45)) * this.dir[i];
      r -= dt * (0.28 + 0.12 * r + 0.25 / (r + 0.5));
      this.rad[i] = r;
      this.zoff[i] *= Math.exp(-dt * 0.55);
      if (r < 0.12) {
        this.respawnSpiral(i, false);
        r = this.rad[i];
      }
      const a = this.ang[i];
      const x = Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      const z = this.zoff[i] + Math.sin(time * 0.9 + i) * 0.03;
      const k = i * 3;
      this.pos[k] = c.x + x;
      this.pos[k + 1] = y;
      this.pos[k + 2] = c.z + z;
      const al =
        smooth(0, 0.8, this.age[i]) * smooth(0.12, 0.7, r) * smooth(0.5, 1.4, y) * 0.95;
      this.alpha[i] = al;
      this.tmp.copy(this.cyan).lerp(this.violet, this.tint[i]);
      const boost = 0.8 + 2.2 / (r + 0.6);
      this.col[k] = this.tmp.r * boost;
      this.col[k + 1] = this.tmp.g * boost;
      this.col[k + 2] = this.tmp.b * boost;
      this.size[i] = this.sz[i] * (0.7 + 0.5 * smooth(0.3, 2.5, r));
      live++;
    }
    for (let j = 0; j < MOTE_COUNT; j++) {
      const i = SPIRAL_COUNT + j;
      this.mAge[j] += dt;
      if (this.mAge[j] >= this.mLife[j]) this.respawnMote(j, false);
      const t = this.mAge[j];
      const u = t / this.mLife[j];
      const k = i * 3;
      this.pos[k] = this.mX[j] + Math.sin(t * 1.1 + this.mPhase[j]) * 0.35;
      this.pos[k + 1] = 0.45 + t * this.mVy[j];
      this.pos[k + 2] = this.mZ[j] + Math.cos(t * 0.9 + this.mPhase[j]) * 0.35;
      this.alpha[i] = Math.sin(Math.PI * u) * 0.9;
      this.tmp.copy(this.cyan).lerp(this.violet, this.mTint[j]).lerp(this.white, 0.25);
      this.col[k] = this.tmp.r * 1.6;
      this.col[k + 1] = this.tmp.g * 1.6;
      this.col[k + 2] = this.tmp.b * 1.6;
      this.size[i] = this.mSz[j];
      live++;
    }
    this.liveCount = live;
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

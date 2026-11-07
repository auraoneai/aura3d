import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  COMMON,
  SKY_VERT,
  SKY_FRAG,
  WATER_FRAG,
  SIL_VERT,
  SIL_FRAG,
  GLOW_VERT,
  GLOW_FRAG,
} from './shaders';

THREE.ColorManagement.enabled = false;

const W = 640;
const H = 360;
const FOV = 58;

type TaskState = { bursts: number; activeParticles: number };
const win = window as unknown as {
  __TASK_STATE__: TaskState;
  __EVAL_READY__?: boolean;
};
win.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.5, 3000);
camera.position.set(0, 5, 50);

// ---------------------------------------------------------------- shared uniforms
const NL = 6;
const lightPos: THREE.Vector4[] = [];
const lightCol: THREE.Vector3[] = [];
for (let i = 0; i < NL; i++) {
  lightPos.push(new THREE.Vector4(0, 30, -60, 0));
  lightCol.push(new THREE.Vector3(0, 0, 0));
}
const uTime = { value: 0 };
const uLP = { value: lightPos };
const uLC = { value: lightCol };
const uScale = { value: H / (2 * Math.tan((FOV * Math.PI) / 360)) };

// ---------------------------------------------------------------- sky + water
const skyMat = new THREE.ShaderMaterial({
  vertexShader: SKY_VERT,
  fragmentShader: SKY_FRAG,
  uniforms: { uTime, uLP, uLC },
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
sky.renderOrder = -3;
sky.frustumCulled = false;
scene.add(sky);

const waterMat = new THREE.ShaderMaterial({
  vertexShader: SKY_VERT,
  fragmentShader: WATER_FRAG,
  uniforms: { uTime, uLP, uLC },
  depthWrite: false,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), waterMat);
water.rotation.x = -Math.PI / 2;
water.renderOrder = -2;
water.frustumCulled = false;
scene.add(water);

// ---------------------------------------------------------------- silhouettes
function silMat(r: number, g: number, b: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SIL_VERT,
    fragmentShader: SIL_FRAG,
    uniforms: { uTime, uLP, uLC, uBase: { value: new THREE.Vector3(r, g, b) } },
    side: THREE.DoubleSide,
  });
}
const landMat = silMat(0.003, 0.005, 0.009);
const bldMat = silMat(0.005, 0.007, 0.012);
const boatMat = silMat(0.006, 0.008, 0.013);

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const srand = mulberry32(20240607);

function addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

// static point lights (windows, lanterns); filled while building the scenery
const staticLights: { x: number; y: number; z: number; r: number; g: number; b: number; s: number }[] = [];
function addLamp(x: number, y: number, z: number, r: number, g: number, b: number, s: number): void {
  staticLights.push({ x, y, z, r, g, b, s });
}

// shoreline strip and low hills
addMesh(new THREE.BoxGeometry(400, 2.2, 24), landMat, 0, 1.1, -62);
for (let i = 0; i < 9; i++) {
  const hill = addMesh(new THREE.SphereGeometry(1, 16, 8), landMat, -150 + i * 38 + srand() * 14, -1, -76 - srand() * 8);
  hill.scale.set(28 + srand() * 18, 4 + srand() * 6, 9);
}

// buildings
for (let x = -92; x <= 92; x += 4 + srand() * 7) {
  if (Math.abs(x + 56) < 5 || Math.abs(x - 34) < 3) continue;
  const w = 2 + srand() * 3.2;
  const h = 1.6 + srand() * 3.6;
  const d = 2.4 + srand() * 2.2;
  const z = -58 + srand() * 4.5;
  addMesh(new THREE.BoxGeometry(w, h, d), bldMat, x, 2.2 + h / 2 - 0.05, z);
  if (srand() < 0.6) {
    const roof = addMesh(new THREE.ConeGeometry(w * 0.74, 0.9 + srand() * 1.2, 4), bldMat, x, 2.2 + h + 0.4, z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = d / w;
  }
  const nWin = srand() < 0.7 ? 1 + Math.floor(srand() * 3) : 0;
  for (let k = 0; k < nWin; k++) {
    addLamp(
      x + (srand() - 0.5) * (w - 0.8),
      2.2 + 0.7 + srand() * Math.max(h - 1.2, 0.3),
      z + d / 2 + 0.05,
      1.0,
      0.68 + srand() * 0.12,
      0.28,
      0.38 + srand() * 0.2,
    );
  }
}

// tree clumps
for (let i = 0; i < 34; i++) {
  const x = -110 + srand() * 220;
  const r = 1 + srand() * 1.4;
  const t = addMesh(new THREE.SphereGeometry(1, 8, 6), landMat, x, 2.2 + r * 0.5, -53 - srand() * 5);
  t.scale.set(r * 1.2, r * 1.3, r);
}

// lighthouse
{
  const lx = -56;
  addMesh(new THREE.CylinderGeometry(0.9, 1.5, 11, 10), bldMat, lx, 2.2 + 5.5, -57);
  addMesh(new THREE.CylinderGeometry(1.5, 1.1, 0.5, 10), bldMat, lx, 2.2 + 11.2, -57);
  addMesh(new THREE.ConeGeometry(1.3, 1.6, 10), bldMat, lx, 2.2 + 12.3, -57);
  addLamp(lx, 2.2 + 11.9 - 0.4, -55.8, 1.0, 0.82, 0.45, 1.5);
}

// container stacks on a quay
for (let i = 0; i < 6; i++) {
  addMesh(new THREE.BoxGeometry(2.6, 1.1, 1.1), bldMat, 56 + (i % 3) * 2.8, 2.2 + 0.55 + (i > 2 ? 1.1 : 0), -52.6);
}

// pier
{
  const px = 34;
  addMesh(new THREE.BoxGeometry(2.4, 0.3, 34), landMat, px, 0.9, -34.5);
  for (let i = 0; i < 12; i++) {
    const z = -50 + i * 2.9;
    addMesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6), landMat, px - 1.05, 0.2, z);
    addMesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6), landMat, px + 1.05, 0.2, z);
    if (i % 3 === 1) {
      addMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), landMat, px - 1.0, 1.9, z);
      addLamp(px - 1.0, 2.75, z, 1.0, 0.72, 0.35, 0.55);
    }
  }
  addMesh(new THREE.BoxGeometry(2.2, 1.3, 2.4), bldMat, px, 1.7, -18.6);
  const r = addMesh(new THREE.ConeGeometry(1.8, 0.9, 4), bldMat, px, 2.8, -18.6);
  r.rotation.y = Math.PI / 4;
  addLamp(px + 0.4, 1.8, -17.35, 1.0, 0.75, 0.3, 0.4);
}

// boats
interface Boat {
  g: THREE.Group;
  phase: number;
  baseY: number;
}
const boats: Boat[] = [];
function makeBoat(x: number, z: number, len: number, sail: boolean, rotY: number, lamp: [number, number, number]): void {
  const g = new THREE.Group();
  const hs = new THREE.Shape();
  hs.moveTo(-len / 2, 0.75);
  hs.lineTo(-len / 2 + 0.5, -0.25);
  hs.lineTo(len / 2 - 1.0, -0.25);
  hs.lineTo(len / 2 + 0.7, 0.95);
  hs.lineTo(-len / 2, 0.75);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: len * 0.3, bevelEnabled: false }), boatMat);
  hull.position.z = -len * 0.15;
  g.add(hull);
  if (sail) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, len * 1.3, 6), boatMat);
    mast.position.set(-len * 0.05, 0.7 + len * 0.65, 0);
    g.add(mast);
    const ss = new THREE.Shape();
    ss.moveTo(0, 0);
    ss.lineTo(0, len * 1.1);
    ss.lineTo(-len * 0.55, 0);
    ss.lineTo(0, 0);
    const s = new THREE.Mesh(new THREE.ShapeGeometry(ss), boatMat);
    s.position.set(-len * 0.05, 1.1, 0.02);
    g.add(s);
    addLampToGroup(g, -len * 0.05, 0.7 + len * 1.3, 0, lamp);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, 0.9, len * 0.24), boatMat);
    cabin.position.set(-len * 0.1, 1.2, 0);
    g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), boatMat);
    mast.position.set(-len * 0.1, 2.2, 0);
    g.add(mast);
    addLampToGroup(g, -len * 0.1, 3.1, 0, lamp);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  boats.push({ g, phase: srand() * 6, baseY: 0 });
  // static lamp positions are in world space; boats bob only slightly so this is fine
  for (const l of pendingBoatLamps) {
    const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(g.matrixWorld.clone().compose(g.position, g.quaternion, g.scale));
    addLamp(v.x, v.y, v.z, l.r, l.g, l.b, l.s);
  }
  pendingBoatLamps.length = 0;
}
const pendingBoatLamps: { x: number; y: number; z: number; r: number; g: number; b: number; s: number }[] = [];
function addLampToGroup(_g: THREE.Group, x: number, y: number, z: number, c: [number, number, number]): void {
  pendingBoatLamps.push({ x, y, z, r: c[0], g: c[1], b: c[2], s: 0.7 });
}
makeBoat(-24, -30, 5.2, true, 0.35, [1.0, 0.7, 0.3]);
makeBoat(-6, -41, 4.2, false, -0.2, [0.3, 1.0, 0.5]);
makeBoat(14, -45, 5.6, true, -0.5, [1.0, 0.3, 0.2]);
makeBoat(-46, -42, 4.8, false, 0.9, [1.0, 0.75, 0.35]);
makeBoat(52, -33, 4.4, true, 0.15, [1.0, 0.7, 0.3]);

// ---------------------------------------------------------------- glow point systems
function glowMaterial(mirror: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uTime, uScale, uMirror: { value: mirror ? 1 : 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
}

class GlowPoints {
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pa: THREE.BufferAttribute;
  private readonly ca: THREE.BufferAttribute;
  private readonly sa: THREE.BufferAttribute;

  constructor(cap: number, dynamic: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.pa = new THREE.BufferAttribute(this.pos, 3);
    this.ca = new THREE.BufferAttribute(this.col, 3);
    this.sa = new THREE.BufferAttribute(this.size, 1);
    if (dynamic) {
      this.pa.setUsage(THREE.DynamicDrawUsage);
      this.ca.setUsage(THREE.DynamicDrawUsage);
      this.sa.setUsage(THREE.DynamicDrawUsage);
    }
    this.geo.setAttribute('position', this.pa);
    this.geo.setAttribute('aColor', this.ca);
    this.geo.setAttribute('aSize', this.sa);
    this.geo.setDrawRange(0, 0);
    for (const mirror of [false, true]) {
      const p = new THREE.Points(this.geo, glowMaterial(mirror));
      p.frustumCulled = false;
      p.renderOrder = 5;
      if (mirror) p.scale.y = -1;
      scene.add(p);
    }
  }

  commit(n: number): void {
    this.geo.setDrawRange(0, n);
    this.pa.needsUpdate = true;
    this.ca.needsUpdate = true;
    this.sa.needsUpdate = true;
  }
}

// static lamps
{
  const g = new GlowPoints(Math.max(staticLights.length, 1), false);
  staticLights.forEach((l, i) => {
    g.pos.set([l.x, l.y, l.z], i * 3);
    g.col.set([l.r * 0.9, l.g * 0.9, l.b * 0.9], i * 3);
    g.size[i] = l.s * 1.4;
  });
  g.commit(staticLights.length);
}

// ---------------------------------------------------------------- spark pool
const CAP = 24000;
const sparksGP = new GlowPoints(CAP, true);

const KIND_SPARK = 0;
const KIND_TRAIL = 1;
const KIND_EMBER = 2;
const KIND_FLASH = 3;

const px = new Float32Array(CAP);
const py = new Float32Array(CAP);
const pz = new Float32Array(CAP);
const vx = new Float32Array(CAP);
const vy = new Float32Array(CAP);
const vz = new Float32Array(CAP);
const cr = new Float32Array(CAP);
const cg = new Float32Array(CAP);
const cb = new Float32Array(CAP);
const age = new Float32Array(CAP);
const life = new Float32Array(CAP);
const psize = new Float32Array(CAP);
const drag = new Float32Array(CAP);
const grav = new Float32Array(CAP);
const phase = new Float32Array(CAP);
const emitAcc = new Float32Array(CAP);
const kind = new Uint8Array(CAP);
const allArrays: (Float32Array | Uint8Array)[] = [
  px, py, pz, vx, vy, vz, cr, cg, cb, age, life, psize, drag, grav, phase, emitAcc, kind,
];
let count = 0;

function spawn(
  k: number,
  x: number, y: number, z: number,
  ux: number, uy: number, uz: number,
  r: number, g: number, b: number,
  size: number, lifeSec: number, dragK: number, gravK: number,
): void {
  if (count >= CAP) return;
  const i = count++;
  px[i] = x; py[i] = y; pz[i] = z;
  vx[i] = ux; vy[i] = uy; vz[i] = uz;
  cr[i] = r; cg[i] = g; cb[i] = b;
  age[i] = 0;
  life[i] = lifeSec;
  psize[i] = size;
  drag[i] = dragK;
  grav[i] = gravK;
  phase[i] = Math.random() * 6.283;
  emitAcc[i] = Math.random();
  kind[i] = k;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

const EMBER_RATE = 24;

function updateParticles(dt: number): void {
  const pos = sparksGP.pos;
  const col = sparksGP.col;
  const siz = sparksGP.size;
  let i = 0;
  while (i < count) {
    age[i] += dt;
    const a = age[i];
    const L = life[i];
    if (a >= L) {
      const last = count - 1;
      if (i !== last) for (const arr of allArrays) arr[i] = arr[last];
      count--;
      continue;
    }
    const t = a / L;
    const k = kind[i];
    if (k !== KIND_FLASH) {
      const f = Math.exp(-drag[i] * dt);
      vx[i] *= f;
      vy[i] = vy[i] * f - grav[i] * dt;
      vz[i] *= f;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
    }
    let br: number;
    let sz: number;
    let r = cr[i];
    let g = cg[i];
    let b = cb[i];
    if (k === KIND_SPARK || k === KIND_TRAIL) {
      const hot = 1 - smoothstep(0, 0.22, t);
      br = Math.pow(1 - t, 1.3) * (1.05 + hot * 0.9);
      if (t > 0.55) br *= 0.45 + 0.55 * Math.sin(a * 48 + phase[i]) * 0.5 + 0.275;
      const w = hot * 0.45;
      r = r + (1 - r) * w;
      g = (g + (1 - g) * w) * (1 - 0.35 * t);
      b = (b + (1 - b) * w) * (1 - 0.45 * t);
      sz = psize[i] * (1 - 0.35 * t) * 1.25;
      if (k === KIND_TRAIL && count < CAP - 64) {
        emitAcc[i] += dt * EMBER_RATE;
        while (emitAcc[i] >= 1) {
          emitAcc[i] -= 1;
          const jx = (Math.random() - 0.5) * 1.2;
          const jy = (Math.random() - 0.5) * 1.2;
          const jz = (Math.random() - 0.5) * 1.2;
          spawn(KIND_EMBER, px[i], py[i], pz[i], vx[i] * 0.04 + jx, vy[i] * 0.04 + jy, vz[i] * 0.04 + jz,
            cr[i], cg[i] * 0.85, cb[i] * 0.7, psize[i] * 0.55, 0.55 + Math.random() * 0.4, 1.5, 2.0);
        }
      }
    } else if (k === KIND_EMBER) {
      br = (1 - t) * (1 - t) * 0.75;
      sz = psize[i] * (1 - 0.5 * t);
    } else {
      br = (1 - t) * (1 - t);
      sz = psize[i] * (0.6 + 0.4 * t);
    }
    pos[i * 3] = px[i];
    pos[i * 3 + 1] = py[i];
    pos[i * 3 + 2] = pz[i];
    col[i * 3] = r * br;
    col[i * 3 + 1] = g * br;
    col[i * 3 + 2] = b * br;
    siz[i] = sz;
    i++;
  }
  sparksGP.commit(count);
}

// ---------------------------------------------------------------- bursts and rockets
type RGB = [number, number, number];
const PALETTE: RGB[] = [
  [1.0, 0.62, 0.12], // gold
  [1.0, 0.07, 0.05], // red
  [0.12, 0.38, 1.0], // blue
  [0.1, 1.0, 0.32], // green
  [0.72, 0.18, 1.0], // violet
  [0.85, 0.95, 1.0], // silver
  [1.0, 0.22, 0.55], // pink
];
const recent: number[] = [];
function pickColor(): RGB {
  let idx = 0;
  for (let tries = 0; tries < 10; tries++) {
    idx = Math.floor(Math.random() * PALETTE.length);
    if (!recent.includes(idx)) break;
  }
  recent.push(idx);
  if (recent.length > 3) recent.shift();
  return PALETTE[idx];
}

interface BurstLight {
  t: number;
  life: number;
  x: number; y: number; z: number;
  c: RGB;
}
const burstLights: (BurstLight | null)[] = new Array(NL).fill(null);
let lightCursor = 0;

function randDir(out: [number, number, number]): void {
  const u = Math.random() * 2 - 1;
  const th = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  out[0] = s * Math.cos(th);
  out[1] = u;
  out[2] = s * Math.sin(th);
}

let totalBursts = 0;
const dirTmp: [number, number, number] = [0, 0, 0];

function burst(x: number, y: number, z: number): void {
  totalBursts++;
  const roll = Math.random();
  const c1 = pickColor();
  let lightCol0: RGB = c1;

  if (roll < 0.4) {
    // peony: one colour, crisp sphere
    const n = 380 + Math.floor(Math.random() * 120);
    const S = 28 + Math.random() * 6;
    for (let i = 0; i < n; i++) {
      randDir(dirTmp);
      const s = S * (0.9 + 0.1 * Math.random());
      spawn(KIND_SPARK, x, y, z, dirTmp[0] * s, dirTmp[1] * s, dirTmp[2] * s,
        c1[0], c1[1], c1[2], 1.15 + Math.random() * 0.5, 1.7 + Math.random() * 0.7, 1.6, 6.5);
    }
  } else if (roll < 0.72) {
    // streaking burst: sparks leave glowing trails
    const n = 150 + Math.floor(Math.random() * 40);
    const S = 26 + Math.random() * 5;
    const gold = Math.random() < 0.5;
    const c: RGB = gold ? PALETTE[0] : c1;
    lightCol0 = c;
    for (let i = 0; i < n; i++) {
      randDir(dirTmp);
      const s = S * (0.85 + 0.15 * Math.random());
      spawn(KIND_TRAIL, x, y, z, dirTmp[0] * s, dirTmp[1] * s, dirTmp[2] * s,
        c[0], c[1], c[2], 1.3 + Math.random() * 0.4, 2.2 + Math.random() * 0.8, 1.35, 7.5);
    }
  } else {
    // two-tone: inner and outer shells
    let c2 = pickColor();
    if (c2 === c1) c2 = PALETTE[(PALETTE.indexOf(c1) + 2) % PALETTE.length];
    const n1 = 300;
    const n2 = 170;
    for (let i = 0; i < n1; i++) {
      randDir(dirTmp);
      const s = 31 * (0.92 + 0.08 * Math.random());
      spawn(KIND_SPARK, x, y, z, dirTmp[0] * s, dirTmp[1] * s, dirTmp[2] * s,
        c1[0], c1[1], c1[2], 1.15 + Math.random() * 0.4, 1.7 + Math.random() * 0.6, 1.6, 6.5);
    }
    for (let i = 0; i < n2; i++) {
      randDir(dirTmp);
      const s = 17 * (0.92 + 0.08 * Math.random());
      spawn(KIND_SPARK, x, y, z, dirTmp[0] * s, dirTmp[1] * s, dirTmp[2] * s,
        c2[0], c2[1], c2[2], 1.1 + Math.random() * 0.4, 1.6 + Math.random() * 0.6, 1.6, 6.5);
    }
    lightCol0 = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2];
  }

  // flash at the centre
  spawn(KIND_FLASH, x, y, z, 0, 0, 0, lightCol0[0] * 0.8 + 0.2, lightCol0[1] * 0.8 + 0.2, lightCol0[2] * 0.8 + 0.2, 16, 0.22, 0, 0);

  burstLights[lightCursor] = { t: 0, life: 2.8, x, y, z, c: lightCol0 };
  lightCursor = (lightCursor + 1) % NL;
}

interface Rocket {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ay: number;
  t: number;
  T: number;
  acc: number;
}
const rockets: Rocket[] = [];

function launch(): void {
  const x = -52 + Math.random() * 104;
  const z = -57 + Math.random() * 3;
  const Hgt = 26 + Math.random() * 16;
  const T = 1.2 + Math.random() * 0.5;
  const v0 = (2 * Hgt) / T;
  rockets.push({
    x, y: 2.4, z,
    vx: (Math.random() - 0.5) * 3,
    vy: v0,
    vz: -Math.random() * 4,
    ay: v0 / T,
    t: 0,
    T,
    acc: 0,
  });
  spawn(KIND_FLASH, x, 2.8, z, 0, 0, 0, 1, 0.75, 0.4, 4, 0.2, 0, 0);
}

function updateRockets(dt: number): void {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    const ox = r.x, oy = r.y, oz = r.z;
    r.t += dt;
    r.vy -= r.ay * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.z += r.vz * dt;
    // trail embers at ~90 per second, placed along the path
    r.acc += dt * 90;
    const total = Math.floor(r.acc);
    for (let k = 1; k <= total; k++) {
      const f = k / total;
      spawn(KIND_EMBER,
        ox + (r.x - ox) * f, oy + (r.y - oy) * f, oz + (r.z - oz) * f,
        (Math.random() - 0.5) * 1.6, -2 - Math.random() * 3, (Math.random() - 0.5) * 1.6,
        1.0, 0.6, 0.22, 0.75, 0.45 + Math.random() * 0.35, 1.2, 2.5);
    }
    r.acc -= total;
    spawn(KIND_FLASH, r.x, r.y, r.z, 0, 0, 0, 1, 0.82, 0.5, 1.5, 0.045, 0, 0);
    if (r.t >= r.T || r.vy <= 0) {
      burst(r.x, r.y, r.z);
      rockets.splice(i, 1);
    }
  }
}

function updateLights(dt: number): void {
  for (let i = 0; i < NL; i++) {
    const l = burstLights[i];
    if (!l) {
      lightPos[i].w = 0;
      continue;
    }
    l.t += dt;
    if (l.t >= l.life) {
      burstLights[i] = null;
      lightPos[i].w = 0;
      continue;
    }
    const u = l.t / l.life;
    const I = 0.9 * Math.exp(-l.t * 5) + 0.55 * Math.pow(1 - u, 2) * Math.min(l.t * 8, 1);
    lightPos[i].set(l.x, l.y, l.z, I);
    lightCol[i].set(l.c[0], l.c[1], l.c[2]);
  }
}

// ---------------------------------------------------------------- post-processing
const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.75, 0.65, 0.28));
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- main loop
let nextLaunch = 0.15;
let pendingSalvo = -1;
let last = performance.now();
let simTime = 0;
let ready = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
  last = now;
  simTime += dt;
  uTime.value = simTime;

  nextLaunch -= dt;
  if (nextLaunch <= 0) {
    launch();
    nextLaunch = 0.5 + Math.pow(Math.random(), 1.4) * 2.0;
    if (Math.random() < 0.22) pendingSalvo = 0.18 + Math.random() * 0.25;
  }
  if (pendingSalvo > 0) {
    pendingSalvo -= dt;
    if (pendingSalvo <= 0) launch();
  }

  updateRockets(dt);
  updateParticles(dt);
  updateLights(dt);

  // slow camera drift
  camera.position.set(Math.sin(simTime * 0.06) * 7, 5 + Math.sin(simTime * 0.09) * 0.5, 50);
  camera.lookAt(Math.sin(simTime * 0.045 + 1) * 4, 20 + Math.sin(simTime * 0.07) * 1.2, -60);
  sky.position.copy(camera.position);

  for (const b of boats) {
    b.g.position.y = b.baseY + Math.sin(simTime * 1.1 + b.phase) * 0.05;
    b.g.rotation.z = Math.sin(simTime * 0.9 + b.phase) * 0.025;
  }

  composer.render();

  win.__TASK_STATE__.bursts = totalBursts;
  win.__TASK_STATE__.activeParticles = count;

  if (!ready) {
    ready = true;
    win.__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);

// keep COMMON referenced for tree-shaking-free type checking of the shader module
void COMMON;

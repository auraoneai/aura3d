import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Periodic noise and terrain function. Everything repeats every L units in z,
// so the flythrough loops seamlessly.
// ---------------------------------------------------------------------------
const L = 400;
const X_MIN = -60;
const X_MAX = 60;
const TWO_PI = Math.PI * 2;

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, z: number, period: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const z0 = ((iz % period) + period) % period;
  const z1 = (z0 + 1) % period;
  const a = hash2(ix, z0);
  const b = hash2(ix + 1, z0);
  const c = hash2(ix, z1);
  const d = hash2(ix + 1, z1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Fractal noise in [0,1]; `cells` = lattice cells per period L in the first octave. */
function fbm(x: number, z: number, cells: number, oct: number): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let n = cells;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise((x / L) * n, (z / L) * n, n);
    norm += amp;
    amp *= 0.5;
    n *= 2;
  }
  return sum / norm;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function center(z: number): number {
  return 14 * Math.sin((TWO_PI * 2 * z) / L + 0.4) + 4 * Math.sin((TWO_PI * 5 * z) / L + 1.1);
}

const WALL_W = 16;
const THICK = [4, 6, 3, 7, 5, 4, 7];
const CUM: number[] = [0];
for (const t of THICK) CUM.push(CUM[CUM.length - 1] + t);

function terrain(x: number, z: number): number {
  const d = x - center(z);
  const xs = d < 0 ? 0 : 173;
  const ad = Math.abs(d);
  const hw = 8 + 6 * fbm(xs, z, 6, 2);
  const rough = fbm(x, z, 40, 2);
  const t = ad - hw + (rough - 0.5) * 6;

  const ripple = (fbm(x, z, 60, 2) - 0.5) * 0.5;
  const bed = -0.6 * Math.exp(-(d * d) / 18);
  const base = ripple + bed;
  if (t <= 0) return base;

  const u = Math.min(1, t / WALL_W);
  const nz = fbm(x, z, 24, 3);
  const layers = THICK.length;
  let s = u * layers + (nz - 0.5) * 1.6 * smoothstep(0, 0.2, u);
  s = Math.min(layers, Math.max(0, s));
  const fl = Math.floor(s);
  let hs: number;
  if (fl >= layers) hs = CUM[layers];
  else hs = CUM[fl] + THICK[fl] * smoothstep(0.45, 0.95, s - fl);
  const talus = 0.35 * Math.min(t, 8);
  const extra = t > WALL_W ? (t - WALL_W) * 0.25 : 0;
  const erosion = (fbm(x, z, 12, 3) - 0.5) * 5 * smoothstep(0, 0.5, u);
  return base + talus + hs + extra + erosion;
}

// ---------------------------------------------------------------------------
// Terrain meshes (chunks along z, instanced three times for wrapping)
// ---------------------------------------------------------------------------
const PALETTE = [
  '#c4663a', '#a64b2e', '#d9915a', '#8e3b2a', '#e2a572', '#b8683f', '#7b3328', '#cf8050',
].map((c) => new THREE.Color(c));
const SAND = new THREE.Color('#d9ab78');
const SAND_DARK = new THREE.Color('#a8794f');
const DUST = new THREE.Color('#e4b98c');
const CAP = new THREE.Color('#7a4a38');

function buildChunk(z0: number, z1: number): THREE.BufferGeometry {
  const step = 0.5;
  const nx = Math.round((X_MAX - X_MIN) / step) + 1;
  const nzv = Math.round((z1 - z0) / step) + 1;
  const W = nx + 2;
  const H = nzv + 2;
  const hs = new Float32Array(W * H);
  for (let j = -1; j <= nzv; j++) {
    for (let i = -1; i <= nx; i++) {
      hs[i + 1 + (j + 1) * W] = terrain(X_MIN + i * step, z0 + j * step);
    }
  }
  const pos = new Float32Array(nx * nzv * 3);
  const col = new Float32Array(nx * nzv * 3);
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  for (let j = 0; j < nzv; j++) {
    for (let i = 0; i < nx; i++) {
      const k = i + j * nx;
      const x = X_MIN + i * step;
      const z = z0 + j * step;
      const h = hs[i + 1 + (j + 1) * W];
      const dhdx = (hs[i + 2 + (j + 1) * W] - hs[i + (j + 1) * W]) / (2 * step);
      const dhdz = (hs[i + 1 + (j + 2) * W] - hs[i + 1 + j * W]) / (2 * step);
      const il = 1 / Math.hypot(dhdx, 1, dhdz);
      const ny = il;
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;

      // colour
      const fine = fbm(x, z, 90, 2);
      const band = h / 4.2 + (fbm(x, z, 30, 2) - 0.5) * 1.6;
      const bi = Math.floor(band);
      tmp.copy(PALETTE[Math.floor(hash2(bi, 7) * PALETTE.length)]);
      const nextC = PALETTE[Math.floor(hash2(bi + 1, 7) * PALETTE.length)];
      tmp.lerp(nextC, smoothstep(0.8, 1.0, band - bi) * 0.6);
      if (h > 38) tmp.lerp(CAP, smoothstep(38, 44, h) * 0.5);
      // flat ledges collect dust and sand
      const flat = smoothstep(0.7, 0.95, ny);
      if (h > 0.9) tmp.lerp(DUST, flat * 0.45);
      // floor sand
      const floorW = 1 - smoothstep(0.4, 2.2, h);
      tmp2.copy(SAND).lerp(SAND_DARK, smoothstep(0.35, 0.65, fine) * 0.6);
      tmp.lerp(tmp2, floorW);
      const shade = 0.78 + 0.44 * fine;
      col[k * 3] = tmp.r * shade;
      col[k * 3 + 1] = tmp.g * shade;
      col[k * 3 + 2] = tmp.b * shade;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nzv - 1) * 6);
  let p = 0;
  for (let j = 0; j < nzv - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = i + j * nx;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  const nrm = new Float32Array(nx * nzv * 3);
  for (let j = 0; j < nzv; j++) {
    for (let i = 0; i < nx; i++) {
      const k = i + j * nx;
      const dhdx = (hs[i + 2 + (j + 1) * W] - hs[i + (j + 1) * W]) / (2 * step);
      const dhdz = (hs[i + 1 + (j + 2) * W] - hs[i + 1 + j * W]) / (2 * step);
      const il = 1 / Math.hypot(dhdx, 1, dhdz);
      nrm[k * 3] = -dhdx * il;
      nrm[k * 3 + 1] = il;
      nrm[k * 3 + 2] = -dhdz * il;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBoulderGeometry(rng: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const s1 = rng() * 10, s2 = rng() * 10, s3 = rng() * 10;
  const base = PALETTE[Math.floor(rng() * PALETTE.length)].clone().lerp(new THREE.Color('#6a4a40'), 0.45);
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r =
      1 +
      0.22 * Math.sin(x * 3.1 + s1) * Math.sin(y * 2.7 + s2) +
      0.12 * Math.sin(z * 5.3 + s3) * Math.sin(x * 4.1 + s1) +
      0.05 * Math.sin((x + y + z) * 9 + s2);
    p.setXYZ(i, x * r, Math.max(y * r, -0.55), z * r);
    const v = 0.8 + 0.3 * (0.5 + 0.5 * Math.sin(y * 6 + s2 + x * 3));
    c.copy(base).multiplyScalar(v);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function makeShrubGeometry(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const geo = new THREE.CylinderGeometry(rad * 0.55, rad, len, 4, 1);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const m = new THREE.Matrix4().compose(origin, q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    parts.push(geo);
    if (depth <= 0) return;
    const end = origin.clone().addScaledVector(dir, len);
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const nd = dir
        .clone()
        .add(new THREE.Vector3(rng() - 0.5, rng() * 0.3, rng() - 0.5).multiplyScalar(1.3))
        .normalize();
      branch(end, nd, len * (0.62 + rng() * 0.15), rad * 0.62, depth - 1);
    }
  };
  const stems = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < stems; i++) {
    const dir = new THREE.Vector3((rng() - 0.5) * 1.2, 1, (rng() - 0.5) * 1.2).normalize();
    branch(new THREE.Vector3(0, -0.05, 0), dir, 0.45 + rng() * 0.2, 0.035, 3);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('shrub merge failed');
  return merged;
}

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const FOG_COLOR = 0xa8708e;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0085);

const camera = new THREE.PerspectiveCamera(62, 640 / 360, 0.3, 2000);

// sky dome
const sunDir = new THREE.Vector3(0.5, 0.22, 0.84).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uHorizon: { value: new THREE.Color(FOG_COLOR) },
    uMid: { value: new THREE.Color(0x7a569f) },
    uZenith: { value: new THREE.Color(0x1a2564) },
    uSun: { value: sunDir.clone() },
    uGlow: { value: new THREE.Color(0xff7a3a) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizon;
    uniform vec3 uMid;
    uniform vec3 uZenith;
    uniform vec3 uSun;
    uniform vec3 uGlow;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float e = d.y;
      float sd = max(dot(d, uSun), 0.0);
      vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, e));
      c = mix(c, uZenith, smoothstep(0.12, 0.75, e));
      float low = 1.0 - smoothstep(0.0, 0.55, e);
      c += uGlow * (pow(sd, 5.0) * 0.35 + pow(sd, 36.0) * 0.9) * (0.35 + 0.65 * low);
      c += vec3(1.0, 0.82, 0.55) * pow(sd, 900.0) * 3.0;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0x7a80d0, 0x8a5a4a, 2.1);
scene.add(hemi);

const fill = new THREE.DirectionalLight(0x8a70c0, 0.9);
fill.position.set(-0.5, 0.45, -0.7);
scene.add(fill);

const SHADOW_HALF = 100;
const SHADOW_MAP = 2048;
const sun = new THREE.DirectionalLight(0xff9a58, 5.2);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
const sc = sun.shadow.camera;
sc.left = -SHADOW_HALF;
sc.right = SHADOW_HALF;
sc.top = SHADOW_HALF;
sc.bottom = -SHADOW_HALF;
sc.near = 1;
sc.far = 650;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = 3;
scene.add(sun);
scene.add(sun.target);

const lightF = sunDir.clone().negate();
const lightR = new THREE.Vector3().crossVectors(lightF, new THREE.Vector3(0, 1, 0)).normalize();
const lightU = new THREE.Vector3().crossVectors(lightR, lightF).normalize();
const focus = new THREE.Vector3();

function updateSun(camPos: THREE.Vector3, ahead: THREE.Vector3): void {
  focus.copy(camPos).addScaledVector(ahead, 70);
  const q = (SHADOW_HALF * 2) / SHADOW_MAP;
  const px = Math.round(focus.dot(lightR) / q) * q;
  const py = Math.round(focus.dot(lightU) / q) * q;
  const pz = focus.dot(lightF);
  focus.set(0, 0, 0).addScaledVector(lightR, px).addScaledVector(lightU, py).addScaledVector(lightF, pz);
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(sunDir, 300);
}

// ---------------------------------------------------------------------------
// World assembly
// ---------------------------------------------------------------------------
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
const boulderMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4d3b30, roughness: 1, metalness: 0 });

const CHUNKS = 8;
const chunkGeos: THREE.BufferGeometry[] = [];
for (let c = 0; c < CHUNKS; c++) chunkGeos.push(buildChunk((c * L) / CHUNKS, ((c + 1) * L) / CHUNKS));

const rng = mulberry32(20240607);
const boulderGeos: THREE.BufferGeometry[] = [];
for (let i = 0; i < 6; i++) boulderGeos.push(makeBoulderGeometry(rng));
const shrubGeos: THREE.BufferGeometry[] = [];
for (let i = 0; i < 5; i++) shrubGeos.push(makeShrubGeometry(rng));

interface PropDef {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
}
const props: PropDef[] = [];
for (let i = 0; i < 34; i++) {
  const z = rng() * L;
  const big = rng() < 0.2;
  const off = (rng() - 0.5) * (big ? 22 : 16);
  const x = center(z) + off;
  const s = big ? 2.4 + rng() * 1.8 : 0.5 + rng() * 1.5;
  props.push({
    geo: boulderGeos[Math.floor(rng() * boulderGeos.length)],
    mat: boulderMat,
    x,
    y: terrain(x, z) + s * 0.1,
    z,
    sx: s * (0.9 + rng() * 0.5),
    sy: s * (0.6 + rng() * 0.4),
    sz: s * (0.9 + rng() * 0.5),
    ry: rng() * TWO_PI,
  });
}
for (let i = 0; i < 70; i++) {
  const z = rng() * L;
  const x = center(z) + (rng() - 0.5) * 17;
  const s = 0.8 + rng() * 1.1;
  props.push({
    geo: shrubGeos[Math.floor(rng() * shrubGeos.length)],
    mat: shrubMat,
    x,
    y: terrain(x, z),
    z,
    sx: s,
    sy: s * (0.8 + rng() * 0.5),
    sz: s,
    ry: rng() * TWO_PI,
  });
}

for (let copy = -1; copy <= 1; copy++) {
  const dz = copy * L;
  for (const g of chunkGeos) {
    const m = new THREE.Mesh(g, terrainMat);
    m.position.z = dz;
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }
  for (const p of props) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.position.set(p.x, p.y, p.z + dz);
    m.rotation.y = p.ry;
    m.scale.set(p.sx, p.sy, p.sz);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }
}

// ---------------------------------------------------------------------------
// Camera flythrough
// ---------------------------------------------------------------------------
const SPEED = 5; // units per second; one loop = 80 s
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const ahead = new THREE.Vector3();

function drift(t: number): number {
  return 2.8 * Math.sin(0.21 * t) + 1.2 * Math.sin(0.53 * t + 1.0);
}

function updateCamera(t: number): void {
  const z = (10 + SPEED * t) % L;
  const x = center(z) + drift(t);
  const y = 2.1 + 0.6 * terrain(x, z) + 0.06 * Math.sin(0.9 * t);
  camPos.set(x, y, z);
  const lz = z + 16;
  lookAt.set(center(lz) + 0.5 * drift(t + 3), y + 4.5 + 0.8 * Math.sin(0.17 * t), lz);
  camera.position.copy(camPos);
  camera.lookAt(lookAt);
  ahead.copy(lookAt).sub(camPos);
  ahead.y = 0;
  ahead.normalize();
  sky.position.copy(camPos);
  updateSun(camPos, ahead);
}

let first = true;
const t0 = performance.now();
function frame(now: number): void {
  updateCamera((now - t0) / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

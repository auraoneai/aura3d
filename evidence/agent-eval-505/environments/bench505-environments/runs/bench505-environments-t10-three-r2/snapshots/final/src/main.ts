import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const PERIOD = 240; // canyon repeats every PERIOD units along z, so the flythrough loops seamlessly
const K = TAU / PERIOD;
const SPEED = 5; // units per second
const FOG_DENSITY = 0.0145;
const MESH_Z0 = -30;
const MESH_Z1 = PERIOD + 230;

const SUN_DIR = new THREE.Vector3(0.3, 0.15, 0.94).normalize();

// ---------------------------------------------------------------------------
// Seeded random + periodic noise
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise in 0..1, periodic along z with `nz` cells per PERIOD. x is in cell units. */
function vn(x: number, z: number, nz: number): number {
  const zc = (z / PERIOD) * nz;
  const iz0 = Math.floor(zc);
  const fz = zc - iz0;
  const ix0 = Math.floor(x);
  const fx = x - ix0;
  const a = ((iz0 % nz) + nz) % nz;
  const b = (a + 1) % nz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const v00 = hash2(ix0, a);
  const v10 = hash2(ix0 + 1, a);
  const v01 = hash2(ix0, b);
  const v11 = hash2(ix0 + 1, b);
  const x0 = v00 + (v10 - v00) * sx;
  const x1 = v01 + (v11 - v01) * sx;
  return x0 + (x1 - x0) * sz;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canyon shape
// ---------------------------------------------------------------------------
function centerX(z: number): number {
  return 14 * Math.sin(K * z) + 6 * Math.sin(2 * K * z + 1.3) + 3 * Math.sin(5 * K * z + 0.4);
}

function wallLeft(z: number): number {
  return 9.5 + 2.5 * Math.sin(3 * K * z + 2.0) + 1.5 * Math.sin(7 * K * z);
}

function wallRight(z: number): number {
  return 9.5 + 2.5 * Math.sin(3 * K * z + 4.1) + 1.5 * Math.sin(5 * K * z + 1.0);
}

/** Height of the ground at lateral offset u from the canyon centreline, at z. */
function terrainH(u: number, z: number): number {
  const a = Math.abs(u);
  const left = u < 0;
  const w = left ? wallLeft(z) : wallRight(z);

  const edgeNoise = vn(a * 0.08 + (left ? 13.7 : 0), z, 24);
  const e = Math.max(0, a - w + (edgeNoise - 0.5) * 6);
  const s = Math.min(1, e / 14);
  let base = 38 * s * s * (3 - 2 * s) + 0.12 * Math.max(0, e - 14);
  base += s * (vn(a * 0.05 + 31, z, 20) * 6 + vn(a * 0.2 + 5, z, 60) * 1.5);

  // sedimentary ledges
  const q = base / 5;
  const fq = q - Math.floor(q);
  const ledge = 5 * (Math.floor(q) + smoothstep(0.55, 1, fq));
  base = ledge * 0.8 + base * 0.2;

  const ur = u / 2.4;
  const floor =
    0.3 * (vn(u * 0.3 + 100, z, 80) - 0.5) -
    0.7 * Math.exp(-ur * ur) +
    1.4 * smoothstep(w - 4.5, w, a);

  return floor + base;
}

/** Lateral drift of the camera inside the canyon (periodic in z). */
function camOffset(z: number): number {
  return 2.4 * Math.sin(5 * K * z + 0.6) + 1.0 * Math.sin(8 * K * z + 2.0);
}

function camPos(z: number, out: THREE.Vector3): THREE.Vector3 {
  const u = camOffset(z);
  out.set(centerX(z) + u, terrainH(u, z) + 1.8, z);
  return out;
}

// ---------------------------------------------------------------------------
// GLSL shared pieces
// ---------------------------------------------------------------------------
const f = (n: number) => n.toFixed(5);
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(${f(SUN_DIR.x)}, ${f(SUN_DIR.y)}, ${f(SUN_DIR.z)});

vec3 skyColor(vec3 d, float withDisc) {
  float h = clamp(d.y, 0.0, 1.0);
  float sd = max(dot(d, SUN_DIR), 0.0);
  vec3 horizonSun = vec3(0.98, 0.50, 0.30);
  vec3 horizonAway = vec3(0.74, 0.42, 0.55);
  vec3 horizon = mix(horizonAway, horizonSun, 0.3 + 0.7 * pow(sd, 2.0));
  vec3 magenta = vec3(0.78, 0.30, 0.52);
  vec3 violet = vec3(0.34, 0.27, 0.60);
  vec3 zenith = vec3(0.08, 0.12, 0.36);
  vec3 c = mix(horizon, magenta, smoothstep(0.0, 0.10, h));
  c = mix(c, violet, smoothstep(0.06, 0.38, h));
  c = mix(c, zenith, smoothstep(0.30, 0.95, h));
  c += vec3(1.0, 0.45, 0.15) * pow(sd, 5.0) * 0.40;
  c += vec3(1.0, 0.70, 0.35) * pow(sd, 48.0) * 0.55;
  c += vec3(1.0, 0.90, 0.70) * smoothstep(0.9994, 0.9998, sd) * 2.0 * withDisc;
  return c;
}
`;

const NOISE_GLSL = /* glsl */ `
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}
vec3 strataColor(vec3 p, vec3 n) {
  float warp = vnoise(p.xz * 0.045) * 2.6 + vnoise(p.xz * 0.3 + 7.0) * 0.35;
  float band = (p.y + warp) * 0.42;
  float id = floor(band);
  float fr = fract(band);
  float r = hash11(id + 1.0);
  vec3 rust = vec3(0.60, 0.30, 0.20);
  vec3 terra = vec3(0.78, 0.45, 0.27);
  vec3 sand = vec3(0.86, 0.62, 0.40);
  vec3 cream = vec3(0.92, 0.76, 0.55);
  vec3 brown = vec3(0.45, 0.25, 0.22);
  vec3 col = rust;
  col = mix(col, terra, step(0.2, r));
  col = mix(col, sand, step(0.4, r));
  col = mix(col, cream, step(0.6, r));
  col = mix(col, brown, step(0.8, r));
  col *= 0.9 + 0.2 * hash11(id + 3.0);
  col *= 0.84 + 0.16 * smoothstep(0.0, 0.14, fr);
  col *= 0.93 + 0.07 * vnoise(vec2(p.y * 6.0, (p.x + p.z) * 0.2));
  col *= 0.80 + 0.20 * vnoise(vec2((p.x * 0.7 + p.z * 0.9) * 2.2, p.y * 0.15));
  vec3 floorSand = vec3(0.82, 0.62, 0.42) * (0.88 + 0.24 * vnoise(p.xz * 3.0)) * (0.94 + 0.06 * vnoise(p.xz * 17.0));
  col = mix(col, floorSand, smoothstep(0.72, 0.9, n.y));
  return pow(col, vec3(2.2));
}
`;

const FOG_GLSL = /* glsl */ `
{
  vec3 vd = vWPos - cameraPosition;
  float dist = length(vd);
  vec3 vdir = vd / max(dist, 0.0001);
  vec3 hd = normalize(vec3(vdir.x, max(vdir.y, 0.0) * 0.35 + 0.02, vdir.z));
  vec3 haze = skyColor(hd, 0.0);
  float fogF = 1.0 - exp(-${f(FOG_DENSITY * FOG_DENSITY)} * dist * dist);
  float low = exp(-max(vWPos.y, 0.0) * 0.03);
  fogF = clamp(fogF * (0.8 + 0.2 * low), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, fogF);
}
`;

function patchMaterial(mat: THREE.Material, strata: boolean): void {
  mat.customProgramCacheKey = () => (strata ? 'canyon-strata' : 'canyon-plain');
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\n${SKY_GLSL}\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        strata
          ? '#include <color_fragment>\ndiffuseColor.rgb *= strataColor(vWPos, normalize(vWN));'
          : '#include <color_fragment>',
      )
      .replace('#include <fog_fragment>', FOG_GLSL);
  };
}

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.3, 1500);

// Sky dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  vertexShader: /* glsl */ `
    varying vec3 vWPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vWPos;
    ${SKY_GLSL}
    void main() {
      vec3 d = normalize(vWPos - cameraPosition);
      gl_FragColor = vec4(skyColor(d, 1.0), 1.0);
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// Lights
const hemi = new THREE.HemisphereLight(0x8c8ae0, 0x9a6850, 2.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffa056, 4.2);
const SHADOW_R = 55;
const SHADOW_MAP = 2048;
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
sun.shadow.camera.left = -SHADOW_R;
sun.shadow.camera.right = SHADOW_R;
sun.shadow.camera.top = SHADOW_R;
sun.shadow.camera.bottom = -SHADOW_R;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 650;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0xc0508a, 0.35);
fill.position.set(-0.5, 0.4, -0.8);
scene.add(fill);

// Terrain
function buildTerrain(): THREE.Mesh {
  const us: number[] = [];
  for (let u = -70; u < -25; u += 2) us.push(u);
  for (let u = -25; u < 25; u += 0.6) us.push(u);
  for (let u = 25; u <= 70; u += 2) us.push(u);
  const nu = us.length;
  const nzRows = MESH_Z1 - MESH_Z0 + 1;
  const pos = new Float32Array(nu * nzRows * 3);
  let p = 0;
  for (let r = 0; r < nzRows; r++) {
    const z = MESH_Z0 + r;
    const cx = centerX(z);
    for (let c = 0; c < nu; c++) {
      const u = us[c];
      pos[p++] = cx + u;
      pos[p++] = terrainH(u, z);
      pos[p++] = z;
    }
  }
  const idx = new Uint32Array((nu - 1) * (nzRows - 1) * 6);
  let q = 0;
  for (let r = 0; r < nzRows - 1; r++) {
    for (let c = 0; c < nu - 1; c++) {
      const a = r * nu + c;
      const b = a + 1;
      const d = a + nu;
      const e = d + 1;
      // counter-clockwise when viewed from above (+y)
      idx[q++] = a;
      idx[q++] = d;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  patchMaterial(mat, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
scene.add(buildTerrain());

// Boulders
function makeBoulderGeometry(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const o1 = seed * 1.7;
  const o2 = seed * 3.1;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n =
      Math.sin(v.x * 2.3 + o1) * Math.cos(v.y * 2.9 + o2) * 0.22 +
      Math.sin(v.z * 4.1 + o2) * Math.sin(v.x * 3.7 + o1) * 0.12 +
      Math.sin(v.y * 8.0 + v.x * 6.0 + o1) * 0.04;
    const r = 1 + n;
    v.multiplyScalar(r);
    v.y = Math.max(v.y, -0.55) * 0.75;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const boulderGeos = [1, 2, 3, 4].map(makeBoulderGeometry);
const boulderMat = new THREE.MeshLambertMaterial({ color: 0xd8c4b8, flatShading: true });
patchMaterial(boulderMat, true);

// Dead shrubs
function makeShrubGeometry(seed: number): THREE.BufferGeometry {
  const rng = makeRng(seed * 7919);
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const addBranch = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const g = new THREE.CylinderGeometry(rad * 0.55, rad, len, 4, 1);
    g.translate(0, len / 2, 0);
    const qt = new THREE.Quaternion().setFromUnitVectors(up, dir);
    g.applyQuaternion(qt);
    g.translate(base.x, base.y, base.z);
    parts.push(g);
    if (depth <= 0) return;
    const tip = base.clone().addScaledVector(dir, len);
    const n = rng() < 0.4 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = dir
        .clone()
        .add(new THREE.Vector3(rng() - 0.5, rng() * 0.4 - 0.1, rng() - 0.5).multiplyScalar(1.4))
        .normalize();
      const start = base.clone().addScaledVector(dir, len * (0.55 + rng() * 0.45));
      addBranch(rng() < 0.5 ? tip : start, nd, len * (0.6 + rng() * 0.2), rad * 0.6, depth - 1);
    }
  };

  const stems = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < stems; i++) {
    const az = (i / stems) * TAU + rng() * 0.8;
    const tilt = 0.4 + rng() * 0.6;
    const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    addBranch(new THREE.Vector3(0, 0, 0), dir, 0.7 + rng() * 0.5, 0.035, 2);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('shrub merge failed');
  return merged;
}
const shrubGeos = [1, 2, 3, 4].map(makeShrubGeometry);
const shrubMat = new THREE.MeshLambertMaterial({ color: 0x4a3a30 });
patchMaterial(shrubMat, false);

function scatterProps(): void {
  const rng = makeRng(20240611);
  const tmp = new THREE.Vector3();
  void tmp;

  const place = (count: number, kind: 'boulder' | 'shrub') => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 20) {
      const z = rng() * PERIOD;
      const wl = wallLeft(z);
      const wr = wallRight(z);
      const u = -wl + 0.5 + rng() * (wl + wr - 1);
      const clump = kind === 'boulder' ? rng() : 0;
      let size: number;
      if (kind === 'boulder') size = clump > 0.9 ? 2.4 + rng() * 1.8 : 0.45 + rng() * rng() * 2.0;
      else size = 0.8 + rng() * 1.0;
      // keep the flight path clear
      if (Math.abs(u - camOffset(z)) < 2.3 + size * 0.8) continue;

      const rotY = rng() * TAU;
      const variant = Math.floor(rng() * 4);
      const sx = size * (0.9 + rng() * 0.5);
      const sz = size * (0.9 + rng() * 0.5);
      const sy = size * (0.6 + rng() * 0.5);
      const tiltX = (rng() - 0.5) * 0.3;
      const tiltZ = (rng() - 0.5) * 0.3;
      for (let copy = 0; copy < 2; copy++) {
        const zz = z + copy * PERIOD;
        const mesh =
          kind === 'boulder'
            ? new THREE.Mesh(boulderGeos[variant], boulderMat)
            : new THREE.Mesh(shrubGeos[variant], shrubMat);
        const gy = terrainH(u, zz);
        if (kind === 'boulder') {
          mesh.position.set(centerX(zz) + u, gy + sy * 0.2, zz);
          mesh.scale.set(sx, sy, sz);
          mesh.rotation.set(tiltX, rotY, tiltZ);
        } else {
          mesh.position.set(centerX(zz) + u, gy - 0.05, zz);
          mesh.scale.setScalar(size);
          mesh.rotation.set(0, rotY, 0);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = kind === 'boulder';
        scene.add(mesh);
      }
      placed++;
    }
  };
  place(70, 'boulder');
  place(80, 'shrub');
}
scatterProps();

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const camP = new THREE.Vector3();
const camT = new THREE.Vector3();
const flatFwd = new THREE.Vector3();
const lightRight = new THREE.Vector3();
const lightUp = new THREE.Vector3();
const snapped = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function updateShadowFrustum(): void {
  flatFwd.copy(camT).sub(camP);
  flatFwd.y = 0;
  flatFwd.normalize();
  const cx = camP.x + flatFwd.x * 30;
  const cy = camP.y;
  const cz = camP.z + flatFwd.z * 30;

  lightRight.crossVectors(worldUp, SUN_DIR).normalize();
  lightUp.crossVectors(SUN_DIR, lightRight).normalize();
  const texel = (2 * SHADOW_R) / SHADOW_MAP;
  const a = Math.round((cx * lightRight.x + cy * lightRight.y + cz * lightRight.z) / texel) * texel;
  const b = Math.round((cx * lightUp.x + cy * lightUp.y + cz * lightUp.z) / texel) * texel;
  const c = cx * SUN_DIR.x + cy * SUN_DIR.y + cz * SUN_DIR.z;
  snapped.set(0, 0, 0).addScaledVector(lightRight, a).addScaledVector(lightUp, b).addScaledVector(SUN_DIR, c);

  sun.target.position.copy(snapped);
  sun.target.updateMatrixWorld();
  sun.position.copy(snapped).addScaledVector(SUN_DIR, 300);
  sun.updateMatrixWorld();
}

const startTime = performance.now();
let firstFrame = true;

function frame(now: number): void {
  const t = (now - startTime) / 1000;
  const z = (t * SPEED) % PERIOD;

  camPos(z, camP);
  camP.y += 0.06 * Math.sin(t * 1.3);
  camPos(z + 16, camT);
  camT.y += 1.6;
  camera.position.copy(camP);
  camera.lookAt(camT);

  sky.position.copy(camP);
  updateShadowFrustum();

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

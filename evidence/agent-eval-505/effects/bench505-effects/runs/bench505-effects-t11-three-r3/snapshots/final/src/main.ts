import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

const W = 640;
const H = 360;
const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x15102a, 0.032);

const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);

// ---------- seeded random ----------
let seed = 1337;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function rr(a: number, b: number): number {
  return a + (b - a) * rnd();
}

// ---------- procedural textures ----------
function makeStoneTexture(base: [number, number, number], tiles: number, repeat: number): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(S, S);
  const grid = 32;
  const lat: number[] = [];
  for (let i = 0; i < grid * grid; i++) lat.push(rnd());
  const vnoise = (x: number, y: number, f: number): number => {
    const gx = (x / S) * f;
    const gy = (y / S) * f;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const p = (ix: number, iy: number): number => lat[(((iy % f) + f) % f) * grid + (((ix % f) + f) % f)];
    const a = p(x0, y0) * (1 - sx) + p(x0 + 1, y0) * sx;
    const b = p(x0, y0 + 1) * (1 - sx) + p(x0 + 1, y0 + 1) * sx;
    return a * (1 - sy) + b * sy;
  };
  const cell = S / tiles;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let n = vnoise(x, y, 4) * 0.45 + vnoise(x, y, 8) * 0.3 + vnoise(x, y, 16) * 0.15 + vnoise(x, y, 32) * 0.1;
      // block mortar lines
      const row = Math.floor(y / cell);
      const ox = (row % 2) * cell * 0.5;
      const mx = (x + ox) % cell;
      const my = y % cell;
      let line = 1;
      if (mx < 2 || my < 2) line = 0.45;
      n = (0.45 + n * 0.8) * line;
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, base[0] * n * 1.6);
      img.data[i + 1] = Math.min(255, base[1] * n * 1.6);
      img.data[i + 2] = Math.min(255, base[2] * n * 1.6);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const stoneTex = makeStoneTexture([120, 122, 135], 4, 1);
const stoneTexRing = makeStoneTexture([110, 108, 125], 2, 1);
stoneTexRing.repeat.set(12, 1);
const groundTex = makeStoneTexture([90, 92, 105], 8, 14);

const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, metalness: 0.05 });
const darkStoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x9a96aa, roughness: 0.95, metalness: 0.0 });
const ringMat = new THREE.MeshStandardMaterial({ map: stoneTexRing, roughness: 0.8, metalness: 0.25 });
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0x777788, roughness: 1 });

// ---------- sky ----------
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(120, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 horizon = vec3(0.55, 0.20, 0.32);
        vec3 mid = vec3(0.14, 0.08, 0.26);
        vec3 top = vec3(0.012, 0.016, 0.06);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        col = mix(col, top, smoothstep(0.2, 0.8, h));
        col = mix(col, vec3(0.06,0.04,0.1), smoothstep(0.0, -0.1, vDir.y));
        gl_FragColor = vec4(col * 0.8, 1.0);
      }`,
  }),
);
scene.add(sky);

// stars
{
  const n = 250;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(rr(0.15, 1));
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * 110;
    pos[i * 3 + 1] = Math.cos(ph) * 110;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 110;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xbfc8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  scene.add(stars);
}

// ---------- ground & platform ----------
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const PLAT_TOP = 0.6;
const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, PLAT_TOP, 48), stoneMat);
platform.position.y = PLAT_TOP / 2;
scene.add(platform);

const step = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.3, 48), darkStoneMat);
step.position.y = 0.15;
scene.add(step);

// glowing runic circle on platform
const runeRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.2, 1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const runeRing = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.58, 96), runeRingMat);
runeRing.rotation.x = -Math.PI / 2;
runeRing.position.y = PLAT_TOP + 0.01;
scene.add(runeRing);
const runeRing2 = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.94, 96), runeRingMat);
runeRing2.rotation.x = -Math.PI / 2;
runeRing2.position.y = PLAT_TOP + 0.01;
scene.add(runeRing2);
const runeMarks = new THREE.Group();
{
  const markGeo = new THREE.BoxGeometry(0.12, 0.01, 0.4);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(markGeo, runeRingMat);
    const a = (i / 24) * Math.PI * 2;
    m.position.set(Math.cos(a) * 3.2, PLAT_TOP + 0.01, Math.sin(a) * 3.2);
    m.rotation.y = -a;
    runeMarks.add(m);
  }
}
scene.add(runeMarks);

// ---------- portal ring ----------
const PORTAL_Y = PLAT_TOP + 2.55;
const RING_R = 2.3;
const portal = new THREE.Group();
portal.position.set(0, PORTAL_Y, 0);
scene.add(portal);

const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.34, 16, 72), ringMat);
portal.add(ring);

// inner glowing lip
const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.4) });
const lip = new THREE.Mesh(new THREE.TorusGeometry(RING_R - 0.3, 0.05, 8, 96), lipMat);
portal.add(lip);

// rune blocks on the ring face
const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 2.6) });
const runeMatV = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 2.8) });
const runes: THREE.Mesh[] = [];
{
  const geoA = new THREE.BoxGeometry(0.07, 0.2, 0.04);
  const geoB = new THREE.BoxGeometry(0.2, 0.06, 0.04);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const m = new THREE.Mesh(i % 2 ? geoA : geoB, i % 3 === 0 ? runeMatV : runeMat);
    m.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0.33);
    m.rotation.z = a + (i % 4) * 0.4;
    portal.add(m);
    runes.push(m);
    const m2 = m.clone();
    m2.position.z = -0.33;
    portal.add(m2);
  }
}

// ring supports: base blocks
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.2), stoneMat);
  base.position.set(0, PLAT_TOP + 0.25, 0);
  scene.add(base);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.9), darkStoneMat);
  sideL.position.set(-1.6, PLAT_TOP + 0.45, 0);
  sideL.rotation.y = 0.15;
  scene.add(sideL);
  const sideR = sideL.clone();
  sideR.position.set(1.6, PLAT_TOP + 0.35, 0.1);
  sideR.scale.set(1, 0.7, 1);
  sideR.rotation.y = -0.2;
  scene.add(sideR);
}

// swirling disc
const discMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uPulse: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uPulse;
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float ph1 = 4.0 * a - 7.0 * log(r + 0.08) + uTime * 1.6;
      float ph2 = 3.0 * a + 13.0 * r - uTime * 2.2;
      float ph3 = 6.0 * a - 11.0 * sqrt(r) - uTime * 0.9;
      float arms = 0.5 + 0.5 * sin(ph1);
      float fine = 0.5 + 0.5 * sin(ph2);
      float streak = pow(0.5 + 0.5 * sin(ph3), 3.0);
      vec3 cyan = vec3(0.05, 0.85, 1.25);
      vec3 violet = vec3(0.65, 0.18, 1.2);
      vec3 deep = vec3(0.04, 0.02, 0.18);
      float mixv = clamp(0.5 + 0.5 * sin(ph1 * 0.5 + r * 3.0 - uTime * 0.5), 0.0, 1.0);
      vec3 body = mix(violet, cyan, mixv);
      vec3 col = deep + body * (0.25 + 1.0 * arms) * (0.6 + 0.5 * fine);
      col += cyan * streak * 0.8;
      float core = exp(-r * r * 14.0);
      col += vec3(0.8, 1.2, 1.5) * core * 3.2 * uPulse;
      col += vec3(0.4, 0.6, 1.0) * exp(-r * 3.0) * 0.5;
      // bright rim
      float rim = smoothstep(0.72, 0.97, r);
      col += mix(cyan, violet, 0.3) * rim * 0.9;
      col *= smoothstep(1.0, 0.94, r);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(RING_R - 0.28, 96), discMat);
portal.add(disc);

// ---------- pillars & rubble ----------
function addPillar(x: number, z: number, h: number, r: number, broken: boolean, tilt = 0): void {
  const g = new THREE.Group();
  const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, 0.35, r * 2.8), darkStoneMat);
  baseBlock.position.y = 0.175;
  g.add(baseBlock);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 12), stoneMat);
  shaft.position.y = 0.35 + h / 2;
  g.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.3, r * 2.6), darkStoneMat);
    cap.position.y = 0.35 + h + 0.15;
    g.add(cap);
  } else {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.9, 0), darkStoneMat);
    chunk.position.set(r * 1.6, 0.35 + r * 0.6, r * 1.4);
    chunk.rotation.set(rr(0, 3), rr(0, 3), 0);
    g.add(chunk);
  }
  g.position.set(x, 0, z);
  g.rotation.z = tilt;
  scene.add(g);
}
addPillar(-6.2, -1.5, 5.2, 0.5, false);
addPillar(6.5, -2.5, 3.6, 0.52, true);
addPillar(-4.5, -5.5, 6.4, 0.55, false);
addPillar(4.8, -6.2, 2.2, 0.5, true);
addPillar(-7.5, 3.2, 2.6, 0.48, true);
addPillar(7.4, 3.8, 4.6, 0.5, false, 0.04);
addPillar(0.5, -9.5, 7.2, 0.6, false);

// fallen pillar
{
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 4.2, 12), stoneMat);
  fallen.rotation.set(0, 0.7, Math.PI / 2);
  fallen.position.set(-3.6, 0.46, 6.2);
  scene.add(fallen);
}
// rubble
for (let i = 0; i < 26; i++) {
  const s = rr(0.15, 0.55);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 2 ? stoneMat : darkStoneMat);
  const a = rnd() * Math.PI * 2;
  const d = rr(5.6, 11);
  rock.position.set(Math.cos(a) * d, s * 0.4, Math.sin(a) * d);
  rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  rock.scale.y = 0.7;
  scene.add(rock);
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x54508a, 0x120a1e, 0.55));
const dusk = new THREE.DirectionalLight(0xff8a70, 0.9);
dusk.position.set(-14, 5, -18);
scene.add(dusk);
const fill = new THREE.DirectionalLight(0x4a58b8, 0.35);
fill.position.set(10, 12, 12);
scene.add(fill);

const lightCyan = new THREE.PointLight(0x30d8ff, 60, 0, 2);
lightCyan.position.set(0, PORTAL_Y, 1.4);
scene.add(lightCyan);
const lightViolet = new THREE.PointLight(0x9a40ff, 50, 0, 2);
lightViolet.position.set(0, PORTAL_Y, -1.4);
scene.add(lightViolet);
const lightGround = new THREE.PointLight(0x6a70ff, 25, 0, 2);
lightGround.position.set(0, PLAT_TOP + 0.9, 0.5);
scene.add(lightGround);

// ---------- mist ----------
const glowTex = makeGlowTexture();
const mist: { s: THREE.Sprite; a: number; d: number; sp: number; y: number }[] = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.SpriteMaterial({
    map: glowTex,
    color: i % 3 === 0 ? 0x6a3f9a : 0x34508a,
    transparent: true,
    opacity: rr(0.1, 0.2),
    depthWrite: false,
    fog: false,
  });
  const s = new THREE.Sprite(m);
  const sc = rr(7, 12);
  s.scale.set(sc, sc * 0.35, 1);
  const o = { s, a: rnd() * Math.PI * 2, d: rr(3, 10), sp: rr(0.01, 0.04) * (rnd() > 0.5 ? 1 : -1), y: rr(0.7, 1.8) };
  scene.add(s);
  mist.push(o);
}
// portal halo sprite
const haloMat = new THREE.SpriteMaterial({
  map: glowTex,
  color: new THREE.Color(0.3, 0.7, 1.4),
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
const halo = new THREE.Sprite(haloMat);
halo.scale.set(8.5, 8.5, 1);
halo.position.copy(portal.position);
scene.add(halo);

// ---------- particles ----------
const SPIRAL_N = 650;
const MOTE_N = 130;
const TOTAL = SPIRAL_N + MOTE_N;

const pPos = new Float32Array(TOTAL * 3);
const pCol = new Float32Array(TOTAL * 3);
const pSize = new Float32Array(TOTAL);
const pAlpha = new Float32Array(TOTAL);

const sR = new Float32Array(SPIRAL_N);
const sTh = new Float32Array(SPIRAL_N);
const sZ = new Float32Array(SPIRAL_N);
const sSpd = new Float32Array(SPIRAL_N);
const sSeed = new Float32Array(SPIRAL_N);
const sBaseSize = new Float32Array(SPIRAL_N);
const cyanC = new THREE.Color(0.3, 1.2, 1.8);
const violetC = new THREE.Color(1.1, 0.4, 2.0);
const tmpC = new THREE.Color();

function respawnSpiral(i: number, initial: boolean): void {
  sR[i] = initial ? rr(0.3, 4.2) : rr(3.2, 4.4);
  sTh[i] = rnd() * Math.PI * 2;
  sSeed[i] = rnd() * 100;
  sSpd[i] = rr(0.25, 0.7);
  sZ[i] = rr(-1.0, 1.0);
  sBaseSize[i] = rr(0.6, 1.6);
  tmpC.copy(cyanC).lerp(violetC, rnd());
  pCol[i * 3] = tmpC.r;
  pCol[i * 3 + 1] = tmpC.g;
  pCol[i * 3 + 2] = tmpC.b;
}
for (let i = 0; i < SPIRAL_N; i++) respawnSpiral(i, true);

const mX = new Float32Array(MOTE_N);
const mZ = new Float32Array(MOTE_N);
const mY = new Float32Array(MOTE_N);
const mSpd = new Float32Array(MOTE_N);
const mSeed = new Float32Array(MOTE_N);
const MOTE_H = 6;
function respawnMote(i: number, initial: boolean): void {
  const a = rnd() * Math.PI * 2;
  const d = Math.sqrt(rnd()) * 3.8;
  mX[i] = Math.cos(a) * d;
  mZ[i] = Math.sin(a) * d;
  mY[i] = PLAT_TOP + (initial ? rnd() * MOTE_H : 0);
  mSpd[i] = rr(0.25, 0.7);
  mSeed[i] = rnd() * 100;
  const k = SPIRAL_N + i;
  tmpC.copy(rnd() > 0.5 ? cyanC : violetC).multiplyScalar(0.8);
  pCol[k * 3] = tmpC.r;
  pCol[k * 3 + 1] = tmpC.g;
  pCol[k * 3 + 2] = tmpC.b;
}
for (let i = 0; i < MOTE_N; i++) respawnMote(i, true);

const pGeo = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(pPos, 3);
const colAttr = new THREE.BufferAttribute(pCol, 3);
const sizeAttr = new THREE.BufferAttribute(pSize, 1);
const alphaAttr = new THREE.BufferAttribute(pAlpha, 1);
posAttr.setUsage(THREE.DynamicDrawUsage);
colAttr.setUsage(THREE.DynamicDrawUsage);
sizeAttr.setUsage(THREE.DynamicDrawUsage);
alphaAttr.setUsage(THREE.DynamicDrawUsage);
pGeo.setAttribute('position', posAttr);
pGeo.setAttribute('aColor', colAttr);
pGeo.setAttribute('aSize', sizeAttr);
pGeo.setAttribute('aAlpha', alphaAttr);

const pMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uScale: { value: H * 0.5 } },
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aAlpha;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = max(1.0, aSize * uScale / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d) * 2.0;
      float f = smoothstep(1.0, 0.0, r);
      f = f * f;
      gl_FragColor = vec4(vColor * f * vAlpha, 1.0);
    }`,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function updateParticles(dt: number, t: number): number {
  let live = 0;
  for (let i = 0; i < SPIRAL_N; i++) {
    let r = sR[i];
    r -= dt * sSpd[i] * (0.35 + 0.5 * r / 4);
    if (r < 0.15) {
      respawnSpiral(i, false);
      r = sR[i];
    }
    sR[i] = r;
    sTh[i] += dt * (0.5 + 2.6 / (r + 0.5));
    const th = sTh[i];
    const squeeze = Math.min(1, r / 1.5);
    const z = sZ[i] * (0.15 + 0.85 * smooth(0.2, 3, r)) + Math.sin(t * 0.8 + sSeed[i]) * 0.08;
    const x = Math.cos(th) * r;
    const y = PORTAL_Y + Math.sin(th) * r;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z * squeeze;
    const fadeIn = smooth(4.4, 3.4, r);
    const fadeOut = smooth(0.1, 0.7, r);
    const ground = smooth(PLAT_TOP, PLAT_TOP + 0.5, y);
    const tw = 0.75 + 0.25 * Math.sin(t * 5 + sSeed[i]);
    const a = fadeIn * fadeOut * ground * tw;
    pAlpha[i] = a;
    pSize[i] = sBaseSize[i] * 0.09 * (0.6 + 0.6 * fadeOut);
    live++;
  }
  for (let j = 0; j < MOTE_N; j++) {
    const k = SPIRAL_N + j;
    mY[j] += dt * mSpd[j];
    const life = (mY[j] - PLAT_TOP) / MOTE_H;
    if (life >= 1) respawnMote(j, false);
    const l = Math.min(1, (mY[j] - PLAT_TOP) / MOTE_H);
    const sw = Math.sin(t * 0.6 + mSeed[j]);
    pPos[k * 3] = mX[j] + sw * 0.3 * l * 3 + Math.sin(t * 1.3 + mSeed[j] * 2) * 0.05;
    pPos[k * 3 + 1] = mY[j];
    pPos[k * 3 + 2] = mZ[j] + Math.cos(t * 0.5 + mSeed[j]) * 0.3 * l * 3;
    pAlpha[k] = smooth(0, 0.12, l) * (1 - smooth(0.55, 1, l)) * (0.7 + 0.3 * Math.sin(t * 4 + mSeed[j]));
    pSize[k] = 0.07;
    live++;
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
  return live;
}

// ---------- post processing ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.7, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
let first = true;
const camTarget = new THREE.Vector3(0, PORTAL_Y - 0.3, 0);
const cyanLight = new THREE.Color(0x30d8ff);
const violetLight = new THREE.Color(0x9a40ff);

window.__TASK_STATE__ = { portalActive: true, particleCount: TOTAL, time: 0 };

function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  const t = elapsed;

  // pulse
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  const pulse2 = 0.5 + 0.5 * Math.sin(t * 0.8 + 2.0);
  discMat.uniforms.uTime.value = t;
  discMat.uniforms.uPulse.value = 0.85 + 0.25 * pulse;
  lightCyan.intensity = 45 + 40 * pulse;
  lightViolet.intensity = 40 + 35 * pulse2;
  lightGround.intensity = 18 + 14 * pulse;
  lightCyan.color.copy(cyanLight).lerp(violetLight, 0.2 * pulse2);
  runeRingMat.opacity = 0.35 + 0.4 * pulse;
  haloMat.opacity = 0.4 + 0.2 * pulse;
  lipMat.color.setRGB(0.4 + 0.3 * pulse, 1.3 + 0.5 * pulse, 2.0 + 0.5 * pulse);
  runeMat.color.setRGB(0.3, 1.2 + 0.8 * pulse, 2.0 + 0.6 * pulse);
  runeMatV.color.setRGB(1.2 + 0.5 * pulse2, 0.4, 2.2 + 0.5 * pulse2);
  runeMarks.rotation.y = t * 0.05;
  runeRing2.rotation.z = t * 0.1;

  // mist drift
  for (const m of mist) {
    m.a += m.sp * dt;
    m.s.position.set(Math.cos(m.a) * m.d, m.y, Math.sin(m.a) * m.d);
  }

  const live = updateParticles(dt, t);

  // camera sway / orbit
  const ang = Math.sin(t * 0.15) * 0.55;
  const rad = 10.5 + Math.sin(t * 0.1) * 0.6;
  camera.position.set(Math.sin(ang) * rad, 3.3 + Math.sin(t * 0.22) * 0.5, Math.cos(ang) * rad);
  camera.lookAt(camTarget);

  composer.render();

  const st = window.__TASK_STATE__;
  if (st) {
    st.portalActive = true;
    st.particleCount = live;
    st.time = elapsed;
  }
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);

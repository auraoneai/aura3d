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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// deterministic random
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
const rnd = mulberry32(1337);

const scene = new THREE.Scene();
const HAZE = new THREE.Color(0x2b2040);
scene.fog = new THREE.FogExp2(HAZE, 0.034);

const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);

// ---------- palette ----------
const CYAN = new THREE.Color(0.1, 0.85, 1.0);
const VIOLET = new THREE.Color(0.55, 0.22, 1.0);

// ---------- textures ----------
function makeStoneTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#7d7a82';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  const r = mulberry32(99);
  // low-frequency blotches + grain
  const blot: number[] = [];
  const bs = 16;
  for (let i = 0; i < bs * bs; i++) blot.push(r());
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const fx = (x / s) * bs;
      const fy = (y / s) * bs;
      const x0 = Math.floor(fx) % bs;
      const y0 = Math.floor(fy) % bs;
      const x1 = (x0 + 1) % bs;
      const y1 = (y0 + 1) % bs;
      const tx = fx - Math.floor(fx);
      const ty = fy - Math.floor(fy);
      const a = blot[y0 * bs + x0] * (1 - tx) + blot[y0 * bs + x1] * tx;
      const b = blot[y1 * bs + x0] * (1 - tx) + blot[y1 * bs + x1] * tx;
      const low = a * (1 - ty) + b * ty;
      const v = 0.55 + low * 0.35 + (r() - 0.5) * 0.28;
      const i = (y * s + x) * 4;
      img.data[i] = 150 * v;
      img.data[i + 1] = 145 * v;
      img.data[i + 2] = 155 * v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // cracks and mortar lines
  g.strokeStyle = 'rgba(20,18,26,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = (i + 0.5) * (s / 4);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(s, y);
    g.stroke();
  }
  g.lineWidth = 1.5;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 2; k++) {
      const x = ((k + (row % 2) * 0.5) * s) / 2;
      g.beginPath();
      g.moveTo(x, (row * s) / 4);
      g.lineTo(x, ((row + 1) * s) / 4);
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(10,8,14,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    let x = r() * s;
    let y = r() * s;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.2) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // moss
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(50,70,60,${0.05 + r() * 0.1})`;
    g.beginPath();
    g.arc(r() * s, r() * s, 4 + r() * 14, 0, Math.PI * 2);
    g.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

function makeGlowTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeRuneTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = mulberry32(5);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(s / 2, 14);
  g.lineTo(s / 2, s - 14);
  g.stroke();
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const y = 20 + r() * (s - 40);
    const dir = r() < 0.5 ? -1 : 1;
    g.beginPath();
    g.moveTo(s / 2, y);
    g.lineTo(s / 2 + dir * (16 + r() * 22), y + (r() - 0.5) * 36);
    g.stroke();
  }
  g.beginPath();
  g.arc(s / 2, 24, 8, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const stone = makeStoneTexture();
const glowTex = makeGlowTexture();
const runeTex = makeRuneTexture();

function stoneMat(tint: number, repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
  const map = stone.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  const bump = stone.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 2.5,
    color: tint,
    roughness: 0.88,
    metalness: 0.05,
  });
}

// ---------- sky ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, -0.2, 1.0);
      vec3 zenith = vec3(0.025, 0.02, 0.07);
      vec3 mid = vec3(0.16, 0.07, 0.22);
      vec3 horizon = vec3(0.62, 0.24, 0.26);
      vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
      col = mix(col, zenith, smoothstep(0.15, 0.75, h));
      // warm glow toward one side of the sky
      float side = pow(max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(-0.6, 0.0, -0.8))), 0.0), 3.0);
      col += vec3(0.35, 0.12, 0.08) * side * (1.0 - smoothstep(0.0, 0.3, h));
      col = mix(col, vec3(0.1, 0.07, 0.15), smoothstep(0.02, -0.15, vDir.y));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
sky.renderOrder = -10;
scene.add(sky);

{
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const v = 0.25 + rnd() * 0.75;
    const phi = u * Math.PI * 2;
    const y = v;
    const rr = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(phi) * rr * 95;
    pos[i * 3 + 1] = y * 95;
    pos[i * 3 + 2] = Math.sin(phi) * rr * 95;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xbfc4ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  scene.add(stars);
}

// ---------- ground & platform ----------
const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), stoneMat(0x4a4552, 28, 28));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const PLAT_TOP = 0.6;
const platLow = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.7, 0.3, 48), stoneMat(0x6c6874, 6, 1));
platLow.position.y = 0.15;
scene.add(platLow);
const platUp = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.7, 0.6, 48), stoneMat(0x8a8592, 5, 1));
platUp.position.y = 0.3;
scene.add(platUp);

// ---------- portal ring ----------
const portal = new THREE.Group();
const CY = 3.35;
portal.position.set(0, CY, 0);
scene.add(portal);

const RING_R = 2.5;
const ringStone = stoneMat(0x9a95a4, 1, 1);
const runeMats: THREE.MeshBasicMaterial[] = [];
const SEG = 14;
for (let i = 0; i < SEG; i++) {
  const a = (i / SEG) * Math.PI * 2;
  const w = 2 * RING_R * Math.tan(Math.PI / SEG) + 0.08;
  const h = 0.62 + (rnd() - 0.5) * 0.06;
  const d = 0.85 + (rnd() - 0.5) * 0.08;
  const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ringStone);
  block.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, (rnd() - 0.5) * 0.05);
  block.rotation.z = a + Math.PI / 2 + (rnd() - 0.5) * 0.03;
  block.rotation.x = (rnd() - 0.5) * 0.04;
  portal.add(block);

  const rm = new THREE.MeshBasicMaterial({
    map: runeTex,
    color: new THREE.Color(0.4, 1.4, 2.0),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.8,
  });
  runeMats.push(rm);
  for (const side of [1, -1]) {
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), rm);
    rune.position.set(0, 0, side * (d / 2 + 0.01));
    if (side < 0) rune.rotation.y = Math.PI;
    block.add(rune);
  }
}
// inner glowing lip
const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 1.8) });
const lip = new THREE.Mesh(new THREE.TorusGeometry(RING_R - 0.33, 0.035, 8, 96), lipMat);
portal.add(lip);

// vortex disc
const discMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uCyan: { value: CYAN }, uViolet: { value: VIOLET } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uCyan;
    uniform vec3 uViolet;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
      return v;
    }
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float ang = a + (1.0 - r) * 5.0 - uTime * 0.7;
      vec2 q = vec2(cos(ang), sin(ang)) * r;
      float n = fbm(q * 3.2 + vec2(uTime * 0.05, -uTime * 0.08));
      float n2 = fbm(q * 6.0 - uTime * 0.12 + n * 2.0);
      float arms = 0.5 + 0.5 * sin(a * 3.0 + log(r + 0.04) * 5.5 - uTime * 2.0 + n * 3.0);
      float arms2 = 0.5 + 0.5 * sin(a * 5.0 - log(r + 0.05) * 7.0 + uTime * 1.3 + n2 * 4.0);
      float mixv = clamp(0.5 + (n - 0.5) * 1.6 + (arms - 0.5) * 0.6, 0.0, 1.0);
      vec3 col = mix(uViolet, uCyan, mixv);
      float body = 0.25 + 0.75 * pow(arms, 1.5) + 0.35 * arms2 * n2;
      col *= body * 1.5;
      // streaks of bright energy
      col += uCyan * pow(arms * arms2, 3.0) * 1.6 * (0.3 + r);
      // bright core
      float core = exp(-r * r * 16.0);
      col += vec3(1.5, 1.7, 2.2) * core * 2.2;
      col += uCyan * exp(-r * 3.5) * 0.9;
      // bright rim
      col += mix(uCyan, vec3(1.0), 0.3) * smoothstep(0.78, 1.0, r) * 1.4;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(RING_R - 0.3, 96), discMat);
portal.add(disc);

// soft halo behind and in front
const haloMat = new THREE.SpriteMaterial({
  map: glowTex,
  color: new THREE.Color(0.25, 0.7, 1.4),
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
const halo = new THREE.Sprite(haloMat);
halo.scale.set(9.5, 9.5, 1);
halo.position.set(0, 0, -0.1);
portal.add(halo);

// portal feet
for (const sx of [-1, 1]) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.3), stoneMat(0x7d7886, 1, 1));
  foot.position.set(sx * 1.0, PLAT_TOP + 0.3 - 0.0, 0);
  foot.rotation.y = sx * 0.05;
  scene.add(foot);
}

// ---------- ruined pillars ----------
const pillarMat = stoneMat(0x8c8796, 1, 2);
function addPillar(x: number, z: number, height: number, radius: number, broken: boolean, tilt: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.8, 0.45, radius * 2.8), pillarMat);
  base.position.y = 0.22;
  g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, height, 10), pillarMat);
  shaft.position.y = 0.45 + height / 2;
  g.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.7, 0.4, radius * 2.7), pillarMat);
    cap.position.y = 0.45 + height + 0.2;
    g.add(cap);
  } else {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * 0.8, 0), pillarMat);
    chunk.position.y = 0.45 + height + 0.05;
    chunk.scale.set(1, 0.5, 1);
    chunk.rotation.set(0.4, 0.8, 0.2);
    g.add(chunk);
  }
  g.rotation.y = rnd() * Math.PI;
  g.rotation.z = tilt;
  scene.add(g);
}
addPillar(-6.5, -2.0, 6.5, 0.55, false, 0.0);
addPillar(6.8, -3.2, 4.2, 0.55, true, 0.02);
addPillar(-5.2, 4.8, 3.0, 0.5, true, -0.03);
addPillar(5.6, 5.4, 5.4, 0.5, false, 0.015);
addPillar(-9.5, -7.5, 4.5, 0.6, true, 0.0);
addPillar(9.8, 1.0, 7.0, 0.6, false, -0.01);
addPillar(1.5, -9.5, 5.0, 0.55, true, 0.0);

// fallen pillar + rubble
{
  const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 4.5, 10), pillarMat);
  fp.rotation.z = Math.PI / 2;
  fp.rotation.y = 0.5;
  fp.position.set(3.8, 0.5, 7.0);
  scene.add(fp);
  const rubbleMat = stoneMat(0x7a7582, 1, 1);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 5.8 + rnd() * 6;
    const s = 0.12 + rnd() * 0.4;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
    m.position.set(Math.cos(a) * rr, s * 0.3, Math.sin(a) * rr);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.scale.y = 0.6;
    scene.add(m);
  }
  // broken arch lintel segment
  const lint = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.9), pillarMat);
  lint.position.set(-6.4, 0.45, 1.8);
  lint.rotation.set(0.05, 0.9, 0.1);
  scene.add(lint);
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x5a4a86, 0x1c1426, 0.55));
const moon = new THREE.DirectionalLight(0x7f86d8, 0.55);
moon.position.set(-8, 10, 6);
scene.add(moon);
const rim = new THREE.DirectionalLight(0xff7a52, 0.5);
rim.position.set(-8, 1.5, -10);
scene.add(rim);

const frontLight = new THREE.PointLight(0x3cc8ff, 90, 26, 2);
frontLight.position.set(0, CY, 2.0);
scene.add(frontLight);
const backLight = new THREE.PointLight(0x8a3cff, 60, 22, 2);
backLight.position.set(0, CY, -2.0);
scene.add(backLight);
const lowLight = new THREE.PointLight(0x5a6bff, 30, 14, 2);
lowLight.position.set(0, 1.2, 0);
scene.add(lowLight);

// glow pool on platform
const poolMat = new THREE.MeshBasicMaterial({
  map: glowTex,
  color: new THREE.Color(0.2, 0.7, 1.2),
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), poolMat);
pool.rotation.x = -Math.PI / 2;
pool.position.y = PLAT_TOP + 0.015;
scene.add(pool);

// ---------- ground haze ----------
const hazeSprites: { s: THREE.Sprite; base: THREE.Vector3; ph: number }[] = [];
for (let i = 0; i < 12; i++) {
  const a = rnd() * Math.PI * 2;
  const rr = 2 + rnd() * 11;
  const m = new THREE.SpriteMaterial({
    map: glowTex,
    color: i % 3 === 0 ? 0x6a3fa0 : 0x3a4f8f,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    fog: false,
  });
  const s = new THREE.Sprite(m);
  const sc = 7 + rnd() * 6;
  s.scale.set(sc, sc * 0.4, 1);
  const base = new THREE.Vector3(Math.cos(a) * rr, 0.9 + rnd() * 1.0, Math.sin(a) * rr);
  s.position.copy(base);
  scene.add(s);
  hazeSprites.push({ s, base, ph: rnd() * 6.28 });
}

// ---------- particles ----------
const N_SPIRAL = 700;
const N_MOTE = 160;
const N = N_SPIRAL + N_MOTE;

const pPos = new Float32Array(N * 3);
const pCol = new Float32Array(N * 3);
const pAlpha = new Float32Array(N);
const pSize = new Float32Array(N);

// spiral state
const sR = new Float32Array(N_SPIRAL);
const sTh = new Float32Array(N_SPIRAL);
const sZ = new Float32Array(N_SPIRAL);
const sSpeed = new Float32Array(N_SPIRAL);
const sMix = new Float32Array(N_SPIRAL);
const sSize = new Float32Array(N_SPIRAL);
const R_MAX = 5.2;
function respawnSpiral(i: number, initial: boolean): void {
  sR[i] = initial ? 0.3 + rnd() * (R_MAX - 0.3) : R_MAX - rnd() * 0.8;
  sTh[i] = rnd() * Math.PI * 2;
  sZ[i] = (rnd() - 0.5) * 3.2;
  sSpeed[i] = 0.35 + rnd() * 0.5;
  sMix[i] = rnd();
  sSize[i] = 0.05 + rnd() * 0.07;
}
for (let i = 0; i < N_SPIRAL; i++) respawnSpiral(i, true);

// mote state
const mX = new Float32Array(N_MOTE);
const mZ = new Float32Array(N_MOTE);
const mAge = new Float32Array(N_MOTE);
const mLife = new Float32Array(N_MOTE);
const mRise = new Float32Array(N_MOTE);
const mPh = new Float32Array(N_MOTE);
const mMix = new Float32Array(N_MOTE);
function respawnMote(i: number, initial: boolean): void {
  const a = rnd() * Math.PI * 2;
  const rr = Math.sqrt(rnd()) * 4.2;
  mX[i] = Math.cos(a) * rr;
  mZ[i] = Math.sin(a) * rr;
  mLife[i] = 4 + rnd() * 5;
  mAge[i] = initial ? rnd() * mLife[i] : 0;
  mRise[i] = 0.35 + rnd() * 0.5;
  mPh[i] = rnd() * 6.28;
  mMix[i] = rnd();
}
for (let i = 0; i < N_MOTE; i++) respawnMote(i, true);

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uScale: { value: H * 0.5 } },
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    attribute float aAlpha;
    attribute float aSize;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = max(aSize * uScale / -mv.z * 2.0, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float f = clamp(1.0 - d, 0.0, 1.0);
      f = f * f;
      gl_FragColor = vec4(vColor * f * vAlpha, 1.0);
    }
  `,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

const tmpC = new THREE.Color();
function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

let liveCount = 0;
function updateParticles(dt: number, t: number): void {
  let live = 0;
  for (let i = 0; i < N_SPIRAL; i++) {
    const r = sR[i];
    const omega = 0.8 + 2.4 / (r + 0.5);
    sTh[i] += omega * dt * (0.6 + sSpeed[i]);
    sR[i] -= sSpeed[i] * dt * (0.5 + 0.5 * (r / R_MAX) + 0.15);
    if (sR[i] < 0.25) respawnSpiral(i, false);
    const rr = sR[i];
    const k = rr / R_MAX;
    const th = sTh[i];
    // slight wobble in depth
    const z = sZ[i] * k * k + Math.sin(th * 2 + t) * 0.08;
    pPos[i * 3] = Math.cos(th) * rr;
    pPos[i * 3 + 1] = CY + Math.sin(th) * rr;
    pPos[i * 3 + 2] = z;
    tmpC.copy(VIOLET).lerp(CYAN, Math.min(1, sMix[i] * 0.7 + (1 - k) * 0.5));
    const al = smooth(R_MAX, R_MAX - 1.0, rr) * smooth(0.25, 0.8, rr);
    const bright = 0.9 + 1.6 * (1 - k);
    pCol[i * 3] = tmpC.r * bright;
    pCol[i * 3 + 1] = tmpC.g * bright;
    pCol[i * 3 + 2] = tmpC.b * bright;
    pAlpha[i] = al;
    pSize[i] = sSize[i] * (0.7 + 0.6 * (1 - k));
    if (al > 0.001) live++;
  }
  for (let j = 0; j < N_MOTE; j++) {
    const i = N_SPIRAL + j;
    mAge[j] += dt;
    if (mAge[j] >= mLife[j]) respawnMote(j, false);
    const u = mAge[j] / mLife[j];
    const y = PLAT_TOP + 0.1 + mAge[j] * mRise[j] * (1 + u * 0.5);
    pPos[i * 3] = mX[j] + Math.sin(t * 0.7 + mPh[j]) * 0.35 * (0.3 + u);
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = mZ[j] + Math.cos(t * 0.6 + mPh[j] * 1.3) * 0.35 * (0.3 + u);
    if (mMix[j] < 0.25) tmpC.setRGB(1.3, 0.7, 0.45);
    else tmpC.copy(CYAN).lerp(VIOLET, mMix[j] * 0.6);
    pCol[i * 3] = tmpC.r * 1.3;
    pCol[i * 3 + 1] = tmpC.g * 1.3;
    pCol[i * 3 + 2] = tmpC.b * 1.3;
    const al = Math.sin(Math.PI * u);
    pAlpha[i] = al * (0.7 + 0.3 * Math.sin(t * 3 + mPh[j] * 5));
    pSize[i] = 0.045 + 0.03 * mMix[j];
    if (al > 0.001) live++;
  }
  liveCount = live;
  (pGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
}

// ---------- post processing ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.75, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- animation ----------
const clock = new THREE.Clock();
let elapsed = 0;
let first = true;
const lookTarget = new THREE.Vector3(0, 2.9, 0);
const lightCol = new THREE.Color();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  // camera sway
  const ang = Math.sin(t * 0.13) * 0.6 + 0.15;
  const R = 13.5 + Math.sin(t * 0.09) * 0.8;
  camera.position.set(Math.sin(ang) * R, 3.3 + Math.sin(t * 0.21) * 0.5, Math.cos(ang) * R);
  camera.lookAt(lookTarget);

  // portal pulse
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  const slow = 0.5 + 0.5 * Math.sin(t * 0.35);
  discMat.uniforms.uTime.value = t;
  lightCol.copy(CYAN).lerp(VIOLET, slow * 0.55);
  frontLight.color.copy(lightCol);
  frontLight.intensity = 70 + pulse * 55;
  backLight.intensity = 45 + (1 - pulse) * 40;
  lowLight.intensity = 20 + pulse * 25;
  lowLight.color.copy(lightCol);
  poolMat.opacity = 0.35 + pulse * 0.25;
  poolMat.color.setRGB(0.2 + slow * 0.25, 0.65 - slow * 0.3, 1.2);
  haloMat.opacity = 0.42 + pulse * 0.2;
  lipMat.color.setRGB(0.3 + pulse * 0.3, 1.1, 1.8);
  for (let i = 0; i < runeMats.length; i++) {
    runeMats[i].opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 - i * 0.45));
  }

  for (const h of hazeSprites) {
    h.s.position.set(h.base.x + Math.sin(t * 0.08 + h.ph) * 1.5, h.base.y + Math.sin(t * 0.15 + h.ph) * 0.15, h.base.z + Math.cos(t * 0.07 + h.ph) * 1.2);
  }

  updateParticles(dt, t);

  composer.render(dt);

  window.__TASK_STATE__ = { portalActive: true, particleCount: liveCount, time: t };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

window.__TASK_STATE__ = { portalActive: true, particleCount: N, time: 0 };
requestAnimationFrame(frame);

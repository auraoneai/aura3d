import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

declare global {
  interface Window {
    __TASK_STATE__: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__: boolean;
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x1b1634);
scene.background = fogColor;
scene.fog = new THREE.FogExp2(0x1b1634, 0.03);

const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 200);

// deterministic random
let seed = 1337;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const rr = (a: number, b: number): number => a + (b - a) * rnd();

// ---------- procedural textures ----------
function makeStoneTexture(base: [number, number, number], mossy: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor(rr(-30, 30));
    const a = rr(0.05, 0.25);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${a * 0.5})` : `rgba(0,0,0,${a})`;
    const s = rr(1, 14);
    g.beginPath();
    g.ellipse(rr(0, 256), rr(0, 256), s, s * rr(0.4, 1), rr(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  if (mossy) {
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(40,70,60,${rr(0.05, 0.2)})`;
      const s = rr(4, 24);
      g.beginPath();
      g.arc(rr(0, 256), rr(0, 256), s, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = rr(0.5, 1.6);
    g.beginPath();
    let x = rr(0, 256);
    let y = rr(0, 256);
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rr(-18, 18);
      y += rr(-18, 18);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeRuneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = 3 + Math.floor(rnd() * 3);
  g.beginPath();
  g.moveTo(64, 14);
  g.lineTo(64, 114);
  g.stroke();
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.moveTo(rr(24, 104), rr(20, 108));
    g.lineTo(rr(24, 104), rr(20, 108));
    if (rnd() > 0.5) g.lineTo(rr(24, 104), rr(20, 108));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const stoneTex = makeStoneTexture([118, 112, 120], true);
const darkStoneTex = makeStoneTexture([84, 80, 92], true);
const groundTex = makeStoneTexture([70, 66, 76], true);
groundTex.repeat.set(24, 24);

function stoneMat(tex: THREE.Texture, rep: number, rough = 0.92): THREE.MeshStandardMaterial {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rep, rep);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.5, roughness: rough, metalness: 0.05 });
}

// ---------- sky ----------
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(120, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP;
      void main(){
        float h = clamp(vP.y, -0.2, 1.0);
        vec3 horizon = vec3(0.55, 0.20, 0.30);
        vec3 mid = vec3(0.15, 0.08, 0.28);
        vec3 top = vec3(0.015, 0.02, 0.07);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.2, 0.8, h));
        c = mix(vec3(0.10,0.06,0.14), c, smoothstep(-0.2, 0.0, vP.y));
        gl_FragColor = vec4(c * 0.8, 1.0);
      }`,
  }),
);
sky.renderOrder = -10;
scene.add(sky);

{
  const n = 220;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = rr(0, Math.PI * 2);
    const ph = rr(0.15, 1.4);
    pos[i * 3] = Math.cos(th) * Math.cos(ph) * 110;
    pos[i * 3 + 1] = Math.sin(ph) * 110;
    pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 110;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x9aa4d8, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }),
  );
  scene.add(stars);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0x4a4d8c, 0x1a1020, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xff8a5c, 1.5);
sun.position.set(-14, 7, -12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -14;
sc.right = 14;
sc.top = 14;
sc.bottom = -14;
sc.near = 1;
sc.far = 50;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.04;
scene.add(sun);

const PORTAL_Y = 3.5;
const frontLight = new THREE.PointLight(0x33ddff, 90, 0, 2);
frontLight.position.set(0, PORTAL_Y - 0.6, 1.8);
scene.add(frontLight);
const backLight = new THREE.PointLight(0x8844ff, 90, 0, 2);
backLight.position.set(0, PORTAL_Y - 0.6, -1.8);
scene.add(backLight);
const floorLight = new THREE.PointLight(0x7a66ff, 20, 0, 2);
floorLight.position.set(0, 1.6, 0);
scene.add(floorLight);

// ---------- ground and platform ----------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(80, 48),
  new THREE.MeshStandardMaterial({ map: groundTex, bumpMap: groundTex, bumpScale: 1, roughness: 1, color: 0x8a8a98 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const platMat = stoneMat(stoneTex, 3);
const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.9, 0.45, 40), platMat);
tier1.position.y = 0.225;
const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.7, 0.4, 40), stoneMat(stoneTex, 2.5));
tier2.position.y = 0.45 + 0.2;
for (const m of [tier1, tier2]) {
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}
const TOP = 0.85;

// inlaid glowing ring on platform
const inlay = new THREE.Mesh(
  new THREE.RingGeometry(3.2, 3.32, 64),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
);
inlay.rotation.x = -Math.PI / 2;
inlay.position.y = TOP + 0.01;
scene.add(inlay);

// ---------- portal ring ----------
const portal = new THREE.Group();
portal.position.y = PORTAL_Y;
scene.add(portal);

const RING_IN = 2.0;
const SEG = 20;
const blockMat = stoneMat(darkStoneTex, 1, 0.85);
const runeMats: THREE.MeshBasicMaterial[] = [];
const runeTexes = [makeRuneTexture(), makeRuneTexture(), makeRuneTexture(), makeRuneTexture()];
const midR = RING_IN + 0.4;
for (let i = 0; i < SEG; i++) {
  const a = (i / SEG) * Math.PI * 2;
  const w = ((Math.PI * 2 * midR) / SEG) * 1.02;
  const depth = 0.85 + rr(-0.06, 0.06);
  const rad = 0.8 + rr(-0.06, 0.1);
  const block = new THREE.Mesh(new THREE.BoxGeometry(w, rad, depth), blockMat);
  block.position.set(Math.cos(a) * midR, Math.sin(a) * midR, 0);
  block.rotation.z = a - Math.PI / 2 + rr(-0.03, 0.03);
  block.rotation.x = rr(-0.02, 0.02);
  block.castShadow = true;
  block.receiveShadow = true;
  portal.add(block);

  if (i % 2 === 0 || i % 3 === 0) {
    const mat = new THREE.MeshBasicMaterial({
      map: runeTexes[i % runeTexes.length],
      color: new THREE.Color(0.3, 1.3, 2.0),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    runeMats.push(mat);
    for (const s of [1, -1]) {
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), mat);
      rune.position.set(Math.cos(a) * midR, Math.sin(a) * midR, s * (depth / 2 + 0.01));
      rune.rotation.z = a - Math.PI / 2;
      if (s < 0) rune.rotation.y = Math.PI;
      portal.add(rune);
    }
  }
}
// inner glowing lip
const lip = new THREE.Mesh(
  new THREE.TorusGeometry(RING_IN + 0.02, 0.04, 8, 96),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3.0) }),
);
portal.add(lip);

// base block under ring
const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 1.8), stoneMat(stoneTex, 1));
baseBlock.position.y = TOP + 0.3 - PORTAL_Y;
baseBlock.castShadow = true;
baseBlock.receiveShadow = true;
portal.add(baseBlock);

// swirling disc
const discMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + 5.1; a *= 0.5; }
      return v;
    }
    void main(){
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float sw = a + 2.2 / (r + 0.3) - uTime * 0.7;
      vec2 q = r * vec2(cos(sw), sin(sw));
      float n = fbm(q * 2.6 + vec2(0.0, uTime * 0.12));
      float arms = 0.5 + 0.5 * sin(3.0 * a + 5.0 * log(r + 0.06) * 2.0 - uTime * 1.8 + n * 3.5);
      float arms2 = 0.5 + 0.5 * sin(5.0 * a - 7.0 * r + uTime * 1.2 + n * 4.0);
      vec3 cyan = vec3(0.1, 0.9, 1.5);
      vec3 violet = vec3(0.65, 0.2, 1.4);
      float m = smoothstep(0.15, 0.85, n * 0.7 + arms * 0.45 + r * 0.1);
      vec3 col = mix(violet, cyan, m);
      float inten = 0.35 + 0.9 * arms + 0.4 * arms2 * (1.0 - r);
      col *= inten;
      float core = exp(-r * r * 16.0);
      col += vec3(0.9, 1.0, 1.0) * core * 3.0 + cyan * exp(-r * 4.0) * 0.6;
      col += cyan * smoothstep(0.78, 1.0, r) * 1.3 * (0.6 + 0.4 * n);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(RING_IN + 0.03, 96), discMat);
portal.add(disc);

// halo sprites
const glowTex = makeGlowTexture();
const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.2, 0.6, 1.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, fog: false }),
);
halo.scale.set(10, 10, 1);
portal.add(halo);
const halo2 = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.7, 0.25, 1.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, fog: false }),
);
halo2.scale.set(15, 11, 1);
portal.add(halo2);

// ---------- ruins ----------
const pillarMat = stoneMat(stoneTex, 1.5);
function addPillar(x: number, z: number, h: number, r: number, tilt = 0): void {
  const g = new THREE.Group();
  g.position.set(x, TOP - 0.45, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, 0.5, r * 2.8), pillarMat);
  base.position.y = 0.25;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 10), pillarMat);
  shaft.position.y = 0.5 + h / 2;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.95, 0), pillarMat);
  cap.scale.set(1, 0.5, 1);
  cap.position.y = 0.5 + h + 0.05;
  cap.rotation.set(rr(-0.4, 0.4), rr(0, 3), rr(-0.4, 0.4));
  for (const m of [base, shaft, cap]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.rotation.z = tilt;
  scene.add(g);
}
const pillarDefs: [number, number, number, number, number][] = [
  [-6.2, -2.0, 4.8, 0.55, 0],
  [6.4, -1.0, 3.2, 0.6, 0.03],
  [-7.2, 3.8, 2.2, 0.55, -0.04],
  [7.0, 4.5, 4.2, 0.55, 0],
  [-3.4, -7.2, 5.4, 0.6, 0.02],
  [4.4, -7.5, 2.6, 0.6, 0],
  [-11, -5, 3.8, 0.6, 0.03],
  [11.5, -6, 5.5, 0.65, -0.02],
];
for (const d of pillarDefs) addPillar(...d);

// fallen pillar and rubble
{
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 4.2, 10), pillarMat);
  fallen.rotation.set(0, 0.6, Math.PI / 2);
  fallen.position.set(2.8, 0.55, 8.2);
  fallen.castShadow = true;
  fallen.receiveShadow = true;
  scene.add(fallen);
  const rubbleMat = stoneMat(darkStoneTex, 1);
  for (let i = 0; i < 38; i++) {
    const s = rr(0.15, 0.6);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rubbleMat);
    const ang = rr(0, Math.PI * 2);
    const rad = rr(4.8, 13);
    m.position.set(Math.cos(ang) * rad, s * 0.4, Math.sin(ang) * rad);
    // a few on the platform
    if (i < 8) {
      const ra = rr(3, 4.3);
      m.position.set(Math.cos(ang) * ra, TOP + s * 0.3, Math.sin(ang) * ra);
    }
    m.scale.set(1, rr(0.5, 0.9), rr(0.8, 1.2));
    m.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  // broken arch fragments / wall blocks
  const wallMat = stoneMat(stoneTex, 1.2);
  const blocks: [number, number, number, number, number, number, number][] = [
    [-9, -9, 5, 1.2, 1, 0.5, 2],
    [-7.5, -8.5, 3, 1.1, 1.8, 0.5, 2],
    [8, -10, 4.5, 1.4, 1, 0.6, 0.3],
    [9.2, -9, 2.5, 1.2, 1.6, 0.6, 0.2],
    [-13, 1, 2.5, 1.2, 1.4, 0.7, 1.4],
  ];
  for (const [x, z, w, h, , d, ry] of blocks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ---------- haze ----------
const hazeTex = makeGlowTexture();
const hazes: { s: THREE.Sprite; bx: number; bz: number; ph: number }[] = [];
for (let i = 0; i < 14; i++) {
  const mat = new THREE.SpriteMaterial({
    map: hazeTex,
    color: i % 3 === 0 ? 0x6a4aa0 : 0x3a4a8a,
    transparent: true,
    opacity: rr(0.08, 0.15),
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  const sz = rr(9, 15);
  s.scale.set(sz, sz * 0.35, 1);
  const ang = rr(0, Math.PI * 2);
  const rad = rr(2, 14);
  const bx = Math.cos(ang) * rad;
  const bz = Math.sin(ang) * rad;
  s.position.set(bx, rr(0.5, 1.6), bz);
  scene.add(s);
  hazes.push({ s, bx, bz, ph: rr(0, 6.28) });
}

// ---------- particles ----------
const N_SPIRAL = 650;
const N_MOTE = 170;
const N = N_SPIRAL + N_MOTE;
const positions = new Float32Array(N * 3);
const colors = new Float32Array(N * 3);
const sizes = new Float32Array(N);
const alphas = new Float32Array(N);

// per-particle state
const pr = new Float32Array(N); // radius (spiral) / base x (mote)
const pa = new Float32Array(N); // angle (spiral) / base z (mote)
const pz = new Float32Array(N); // z offset (spiral)
const pv = new Float32Array(N); // speed
const pAge = new Float32Array(N);
const pLife = new Float32Array(N);
const pSeed = new Float32Array(N);
const pBase = new Float32Array(N); // base size
const cCyan = new THREE.Color(0.3, 1.4, 2.0);
const cViolet = new THREE.Color(1.1, 0.4, 2.0);
const cWhite = new THREE.Color(1.8, 1.9, 2.2);
const tmpC = new THREE.Color();

function spawnSpiral(i: number, scatter: boolean): void {
  pr[i] = rr(2.6, 7.5);
  pa[i] = rr(0, Math.PI * 2);
  pz[i] = rr(-2.8, 2.8) * (pr[i] / 5);
  pv[i] = rr(0.6, 1.3);
  pSeed[i] = rnd();
  pAge[i] = 0;
  pLife[i] = 1;
  if (scatter) {
    // advance a random amount so the stream is already filled
    const steps = Math.floor(rr(0, 200));
    for (let k = 0; k < steps; k++) stepSpiral(i, 0.03);
  }
  tmpC.copy(rnd() < 0.5 ? cCyan : cViolet);
  if (rnd() < 0.12) tmpC.copy(cWhite);
  colors[i * 3] = tmpC.r;
  colors[i * 3 + 1] = tmpC.g;
  colors[i * 3 + 2] = tmpC.b;
  pBase[i] = rr(0.05, 0.13);
}
function stepSpiral(i: number, dt: number): void {
  const r = pr[i];
  // angular speed grows toward the center, radius shrinks, z collapses to the disc plane
  pa[i] += (pv[i] * 1.8 * dt) / (0.35 + r * 0.35);
  pr[i] = r - dt * pv[i] * (0.35 + r * 0.22);
  pz[i] *= 1 - Math.min(1, dt * 0.55);
  if (pr[i] < 0.25) pLife[i] = 0;
}
function spawnMote(i: number, scatter: boolean): void {
  const ang = rr(0, Math.PI * 2);
  const rad = Math.sqrt(rnd()) * 4.6;
  pr[i] = Math.cos(ang) * rad;
  pa[i] = Math.sin(ang) * rad;
  pv[i] = rr(0.3, 0.8);
  pLife[i] = rr(4, 8);
  pAge[i] = scatter ? rr(0, pLife[i]) : 0;
  pSeed[i] = rr(0, 6.28);
  pBase[i] = rr(0.04, 0.1);
  tmpC.copy(rnd() < 0.5 ? cCyan : cViolet).multiplyScalar(0.9);
  colors[i * 3] = tmpC.r;
  colors[i * 3 + 1] = tmpC.g;
  colors[i * 3 + 2] = tmpC.b;
}
for (let i = 0; i < N_SPIRAL; i++) spawnSpiral(i, true);
for (let i = N_SPIRAL; i < N; i++) spawnMote(i, true);

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uScale: { value: H / (2 * Math.tan((camera.fov * Math.PI) / 360)) } },
  vertexShader: `
    attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
    uniform float uScale;
    varying vec3 vCol; varying float vA;
    void main(){
      vCol = aColor; vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = max(1.5, aSize * uScale / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vCol; varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float f = pow(max(0.0, 1.0 - d), 1.8);
      gl_FragColor = vec4(vCol * f * vA, 1.0);
    }`,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

// ---------- postprocessing ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.75, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- loop ----------
window.__TASK_STATE__ = { portalActive: true, particleCount: 0, time: 0 };
window.__EVAL_READY__ = false;

const clock = new THREE.Clock();
let elapsed = 0;
const lookAt = new THREE.Vector3(0, 2.9, 0);
const cyanL = new THREE.Color(0x33ddff);
const violetL = new THREE.Color(0x8a4dff);
const tmpL = new THREE.Color();
const tmpL2 = new THREE.Color();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  // camera orbit sway
  const ang = Math.sin(t * 0.12) * 0.7 + 0.15;
  const dist = 12.5 + Math.sin(t * 0.07) * 0.8;
  camera.position.set(Math.sin(ang) * dist, 3.4 + Math.sin(t * 0.17) * 0.35, Math.cos(ang) * dist);
  camera.lookAt(lookAt);

  // portal light pulse
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  const mixv = 0.5 + 0.5 * Math.sin(t * 0.35);
  const k = 0.7 + 0.5 * pulse;
  tmpL.copy(cyanL).lerp(violetL, mixv * 0.4);
  tmpL2.copy(violetL).lerp(cyanL, (1 - mixv) * 0.3);
  frontLight.color.copy(tmpL);
  frontLight.intensity = 90 * k;
  backLight.color.copy(tmpL2);
  backLight.intensity = 90 * k;
  floorLight.intensity = 20 * k;
  discMat.uniforms.uTime.value = t;
  (halo.material as THREE.SpriteMaterial).opacity = 0.4 + 0.2 * pulse;
  (halo2.material as THREE.SpriteMaterial).opacity = 0.25 + 0.15 * (1 - pulse);
  (inlay.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.3 * pulse;
  runeMats.forEach((m, i) => {
    m.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9));
  });
  bloom.strength = 0.95 + 0.2 * pulse;

  // haze drift
  for (const h of hazes) {
    h.s.position.x = h.bx + Math.sin(t * 0.08 + h.ph) * 1.5;
    h.s.position.z = h.bz + Math.cos(t * 0.06 + h.ph) * 1.2;
  }

  // particles
  let alive = 0;
  const cy = PORTAL_Y;
  for (let i = 0; i < N; i++) {
    if (i < N_SPIRAL) {
      stepSpiral(i, dt);
      if (pLife[i] <= 0) spawnSpiral(i, false);
      const r = pr[i];
      const a = pa[i];
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = cy + Math.sin(a) * r * 0.9 - (r > 3 ? (r - 3) * 0.3 : 0);
      positions[i * 3 + 2] = pz[i];
      const fadeIn = Math.min(1, (7.5 - r) * 1.2 + 0.2);
      const fadeOut = Math.min(1, (r - 0.25) * 2.0);
      const tw = 0.75 + 0.25 * Math.sin(t * 6 + pSeed[i] * 40);
      alphas[i] = Math.max(0, Math.min(fadeIn, fadeOut)) * tw;
      sizes[i] = pBase[i] * (0.6 + 0.6 * Math.min(1, r / 3));
    } else {
      pAge[i] += dt;
      if (pAge[i] >= pLife[i]) spawnMote(i, false);
      const age = pAge[i];
      const f = age / pLife[i];
      positions[i * 3] = pr[i] + Math.sin(t * 0.7 + pSeed[i]) * 0.4 * f;
      positions[i * 3 + 1] = TOP + 0.1 + age * pv[i] * 1.1;
      positions[i * 3 + 2] = pa[i] + Math.cos(t * 0.6 + pSeed[i] * 1.7) * 0.4 * f;
      alphas[i] = Math.sin(Math.PI * f) * 0.9;
      sizes[i] = pBase[i];
    }
    if (alphas[i] > 0.001) alive++;
  }
  (pGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;

  window.__TASK_STATE__.portalActive = true;
  window.__TASK_STATE__.particleCount = alive;
  window.__TASK_STATE__.time = elapsed;

  composer.render();
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

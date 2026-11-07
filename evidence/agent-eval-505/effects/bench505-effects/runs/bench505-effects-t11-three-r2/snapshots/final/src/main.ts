import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  makeStoneTexture,
  makeRuneTexture,
  makeFloorRunes,
  makeRadialTexture,
  mulberry32,
} from './textures';

declare global {
  interface Window {
    __TASK_STATE__: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__: boolean;
  }
}

const W = 640;
const H = 360;
const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0x2a1a3e);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.03);
scene.background = FOG_COLOR;

const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
const LOOK_AT = new THREE.Vector3(0, 2.6, 0);

const rnd = mulberry32(1337);
const CY = 3.1; // portal centre height
const RING_R = 2.2;
const PLATFORM_TOP = 0.7;

// ---------------------------------------------------------------- sky
const SUN_DIR = new THREE.Vector3(-0.55, 0.1, -0.83).normalize();
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: FOG_COLOR },
        uMid: { value: new THREE.Color(0x56306e) },
        uTop: { value: new THREE.Color(0x070718) },
        uWarm: { value: new THREE.Color(0xe8607c) },
        uSun: { value: SUN_DIR },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uTop; uniform vec3 uWarm; uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.14, h));
          col = mix(col, uTop, smoothstep(0.1, 0.75, h));
          float s = max(dot(d, uSun), 0.0);
          float glow = pow(s, 5.0) * 0.55 + pow(s, 48.0) * 0.6;
          col += uWarm * glow * (1.0 - smoothstep(0.0, 0.55, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const y = 0.22 + u * 0.78;
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * rr * 150;
    pos[i * 3 + 1] = y * 150;
    pos[i * 3 + 2] = Math.sin(a) * rr * 150;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xbcc8ff,
        size: 1.5,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    ),
  );
}

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x5a4aa8, 0x1c1226, 0.55));

const sun = new THREE.DirectionalLight(0xff8a70, 1.5);
sun.position.copy(SUN_DIR).multiplyScalar(26);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const lightFront = new THREE.PointLight(0x40d0ff, 35, 22, 2);
lightFront.position.set(0, CY, 2.3);
const lightBack = new THREE.PointLight(0x8a50ff, 30, 22, 2);
lightBack.position.set(0, CY, -2.3);
const lightFloor = new THREE.PointLight(0x6a78ff, 14, 14, 2);
lightFloor.position.set(0, 1.5, 3.4);
scene.add(lightFront, lightBack, lightFloor);

// ---------------------------------------------------------------- materials
function stoneMaterial(base: [number, number, number], seed: number, repeat = 1, rough = 0.9): THREE.MeshStandardMaterial {
  const t = makeStoneTexture(base, seed);
  t.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2.0, roughness: rough, metalness: 0.05 });
}
const stoneMat = stoneMaterial([172, 168, 186], 3);
const ringMat = stoneMaterial([138, 146, 176], 11, 1, 0.82);
const groundMat = stoneMaterial([110, 100, 120], 5, 28, 1.0);

function stone(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- ground + platform
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const t1 = stone(new THREE.CylinderGeometry(5.3, 5.5, 0.35, 20), stoneMat);
  t1.position.y = 0.175;
  const t2 = stone(new THREE.CylinderGeometry(4.3, 4.45, 0.35, 20), stoneMat);
  t2.position.y = 0.525;
  t2.rotation.y = 0.15;
  scene.add(t1, t2);
}

// ---------------------------------------------------------------- pillars and rubble
function addPillar(x: number, z: number, h: number, broken: boolean): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rnd() * Math.PI;
  const base = stone(new THREE.BoxGeometry(1.5, 0.3, 1.5), stoneMat);
  base.position.y = 0.15;
  const shaft = stone(new THREE.CylinderGeometry(0.46, 0.55, h, 8), stoneMat);
  shaft.position.y = 0.3 + h / 2;
  g.add(base, shaft);
  if (!broken) {
    const cap = stone(new THREE.BoxGeometry(1.2, 0.28, 1.2), stoneMat);
    cap.position.y = 0.3 + h + 0.14;
    g.add(cap);
  } else {
    for (let i = 0; i < 3; i++) {
      const chunk = stone(new THREE.BoxGeometry(0.3 + rnd() * 0.3, 0.25 + rnd() * 0.3, 0.3 + rnd() * 0.3), stoneMat);
      chunk.position.set((rnd() - 0.5) * 0.5, 0.3 + h + 0.05, (rnd() - 0.5) * 0.5);
      chunk.rotation.set(rnd() * 0.8, rnd() * 3, rnd() * 0.8);
      g.add(chunk);
    }
  }
  scene.add(g);
}
addPillar(-5.8, -1.6, 5.6, false);
addPillar(5.9, -2.2, 4.2, true);
addPillar(-4.6, 4.2, 3.0, true);
addPillar(5.0, 4.6, 2.0, true);
addPillar(-8.2, -5.5, 6.6, false);
addPillar(8.0, -6.2, 5.0, true);
addPillar(-2.8, -8.0, 4.6, false);
addPillar(3.6, -9.0, 3.2, true);
addPillar(-11, 2, 4.0, true);
addPillar(11.5, 1, 5.5, false);

// fallen column drums
{
  const drum = (x: number, z: number, ry: number, len: number) => {
    const m = stone(new THREE.CylinderGeometry(0.5, 0.5, len, 8), stoneMat);
    m.rotation.set(0, ry, Math.PI / 2);
    m.position.set(x, 0.5, z);
    scene.add(m);
  };
  drum(3.2, 6.6, 0.4, 2.4);
  drum(5.6, 7.2, -0.3, 1.4);
  drum(-3.4, 7.0, 1.2, 1.8);
}
// rubble
for (let i = 0; i < 38; i++) {
  const a = rnd() * Math.PI * 2;
  const r = 3.6 + rnd() * 9;
  const s = 0.15 + rnd() * 0.45;
  const m = stone(new THREE.BoxGeometry(s * (0.8 + rnd()), s * (0.6 + rnd() * 0.6), s * (0.8 + rnd())), stoneMat);
  const onPlatform = r < 4.2;
  m.position.set(Math.cos(a) * r, (onPlatform ? PLATFORM_TOP : 0) + s * 0.25, Math.sin(a) * r);
  m.rotation.set(rnd() * 0.5, rnd() * 3, rnd() * 0.5);
  scene.add(m);
}

// ---------------------------------------------------------------- portal ring
const portal = new THREE.Group();
portal.position.set(0, CY, 0);
scene.add(portal);

const runeMats: THREE.MeshBasicMaterial[] = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.MeshBasicMaterial({
    map: makeRuneTexture(40 + i * 13),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  m.color.setRGB(0.5, 1.4, 1.7);
  runeMats.push(m);
}
const runeGeo = new THREE.PlaneGeometry(0.34, 0.34);

{
  const N = 22;
  const tw = ((2 * Math.PI * RING_R) / N) * 1.04;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const depth = 0.62 + rnd() * 0.16;
    const rad = 0.56 + (rnd() - 0.5) * 0.06;
    const blk = stone(new THREE.BoxGeometry(tw, rad, depth), ringMat);
    blk.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, (rnd() - 0.5) * 0.05);
    blk.rotation.z = a - Math.PI / 2 + (rnd() - 0.5) * 0.04;
    portal.add(blk);
    if (i % 2 === 0) {
      const mat = runeMats[(i / 2) % 4];
      const front = new THREE.Mesh(runeGeo, mat);
      front.position.set(0, 0, depth / 2 + 0.008);
      const back = new THREE.Mesh(runeGeo, mat);
      back.position.set(0, 0, -depth / 2 - 0.008);
      back.rotation.y = Math.PI;
      blk.add(front, back);
    }
  }
  // keystone and foot
  const key = stone(new THREE.BoxGeometry(0.9, 0.5, 0.95), ringMat);
  key.position.set(0, RING_R + 0.38, 0);
  portal.add(key);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.5, 2.4), fog: false }),
  );
  orb.position.set(0, RING_R + 0.38, 0.5);
  portal.add(orb);
  const foot = stone(new THREE.BoxGeometry(2.8, 0.4, 1.3), ringMat);
  foot.position.set(0, PLATFORM_TOP - CY + 0.2, 0);
  portal.add(foot);
}

// ---------------------------------------------------------------- vortex disc
const discMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  fog: false,
  uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uPulse;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * vn(p); p = p * 2.03 + vec2(7.1, 3.7); a *= 0.5; }
      return v;
    }
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float a2 = a - uTime * 0.6 + 4.5 * r;
      vec2 q = vec2(cos(a2), sin(a2)) * (0.6 + r * 1.8);
      float n = fbm(q * 1.7 + uTime * 0.05);
      float arms = 0.5 + 0.5 * sin(a * 3.0 + log(r + 0.03) * 5.0 + uTime * 2.0);
      float streak = pow(arms, 3.0);
      float energy = n * 0.9 + streak * 0.55;
      vec3 deep = vec3(0.03, 0.01, 0.12);
      vec3 violet = vec3(0.45, 0.12, 1.0);
      vec3 cyan = vec3(0.05, 0.85, 1.2);
      vec3 white = vec3(0.8, 1.0, 1.2);
      float m = smoothstep(0.2, 0.9, n * 0.8 + (1.0 - r) * 0.5 + 0.2 * arms);
      vec3 col = deep + mix(violet, cyan, m) * (0.2 + 1.2 * energy);
      col += white * pow(max(n - 0.45, 0.0), 2.0) * 3.0;
      col += white * exp(-r * r * 14.0) * (2.0 + 0.6 * uPulse);
      col += cyan * exp(-r * 3.0) * 0.35;
      float rim = smoothstep(0.7, 1.0, r);
      col += mix(cyan, violet, 0.35) * rim * rim * (1.1 + 0.5 * uPulse);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(1.98, 72), discMat);
portal.add(disc);

// halo sprite behind the disc
const haloTex = makeRadialTexture([
  [0, 'rgba(255,255,255,1)'],
  [0.25, 'rgba(255,255,255,0.45)'],
  [0.6, 'rgba(255,255,255,0.1)'],
  [1, 'rgba(255,255,255,0)'],
]);
const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: haloTex,
    color: new THREE.Color(0.25, 0.6, 1.2),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0.6,
  }),
);
halo.scale.set(10, 10, 1);
halo.position.set(0, 0, -0.45);
portal.add(halo);

// floor rune circle
const floorRuneMat = new THREE.MeshBasicMaterial({
  map: makeFloorRunes(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  fog: false,
});
floorRuneMat.color.setRGB(0.4, 0.9, 1.5);
{
  const m = new THREE.Mesh(new THREE.CircleGeometry(4.05, 64), floorRuneMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = PLATFORM_TOP + 0.01;
  scene.add(m);
}

// ground glow pool
const poolMat = new THREE.MeshBasicMaterial({
  map: makeRadialTexture([
    [0, 'rgba(255,255,255,0.9)'],
    [0.5, 'rgba(255,255,255,0.25)'],
    [1, 'rgba(255,255,255,0)'],
  ]),
  color: new THREE.Color(0.2, 0.55, 1.0),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
  opacity: 0.4,
});
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = PLATFORM_TOP + 0.03;
  scene.add(m);
}

// ---------------------------------------------------------------- haze layers
const mist: THREE.Mesh[] = [];
{
  const tex = makeRadialTexture([
    [0, 'rgba(255,255,255,0.9)'],
    [0.5, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const cfg: Array<[number, number, number, number, number, number]> = [
    // x, y, z, size, color, opacity
    [-3, 0.9, 2, 18, 0x6a4ea0, 0.2],
    [4, 1.2, -3, 20, 0x4a4a9a, 0.2],
    [0, 0.6, 7, 22, 0x5a3d8a, 0.18],
    [-6, 1.6, -6, 24, 0x453a86, 0.18],
    [6, 0.8, 5, 18, 0x7a58a8, 0.16],
    [0, 1.0, 0, 12, 0x2a8ac0, 0.12],
  ];
  for (const [x, y, z, s, c, o] of cfg) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshBasicMaterial({ map: tex, color: c, transparent: true, opacity: o, depthWrite: false, fog: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 1;
    scene.add(m);
    mist.push(m);
  }
}

// ---------------------------------------------------------------- particles
const SPIRAL = 640;
const MOTES = 140;
const N = SPIRAL + MOTES;
const pPos = new Float32Array(N * 3);
const pCol = new Float32Array(N * 3);
const pAlpha = new Float32Array(N);
const pSize = new Float32Array(N);
const age = new Float32Array(N);
const life = new Float32Array(N);
const p0 = new Float32Array(N); // r0 or x0
const p1 = new Float32Array(N); // theta0 or z0
const p2 = new Float32Array(N); // z0 or speed
const p3 = new Float32Array(N); // turns or phase
const p4 = new Float32Array(N); // color mix
const baseSize = new Float32Array(N);

function spawn(i: number, initial: boolean): void {
  age[i] = initial ? rnd() : 0;
  p4[i] = rnd();
  if (i < SPIRAL) {
    life[i] = 3.5 + rnd() * 3.5;
    p0[i] = 2.6 + rnd() * 2.2;
    p1[i] = rnd() * Math.PI * 2;
    p2[i] = (rnd() - 0.5) * 3.2;
    p3[i] = (0.8 + rnd() * 1.2) * (rnd() < 0.85 ? 1 : -1);
    baseSize[i] = 0.05 + rnd() * 0.09;
  } else {
    life[i] = 5 + rnd() * 5;
    const r = Math.sqrt(rnd()) * 4.0;
    const a = rnd() * Math.PI * 2;
    p0[i] = Math.cos(a) * r;
    p1[i] = Math.sin(a) * r;
    p2[i] = 0.35 + rnd() * 0.55;
    p3[i] = rnd() * Math.PI * 2;
    baseSize[i] = 0.035 + rnd() * 0.06;
  }
}
for (let i = 0; i < N; i++) spawn(i, true);

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const cCyan = new THREE.Color(0.2, 0.9, 1.4);
const cViolet = new THREE.Color(0.7, 0.35, 1.5);
const cWhite = new THREE.Color(1.1, 1.2, 1.5);
const tmpC = new THREE.Color();

function updateParticles(dt: number, t: number, pulse: number): void {
  for (let i = 0; i < N; i++) {
    age[i] += dt / life[i];
    if (age[i] >= 1) spawn(i, false);
    const k = age[i];
    let x: number, y: number, z: number, alpha: number;
    if (i < SPIRAL) {
      const rr = p0[i] * Math.pow(1 - k, 1.25) + 0.04;
      const th = p1[i] + p3[i] * Math.PI * 2 * (0.5 * k + 0.9 * k * k) + t * 0.15;
      x = Math.cos(th) * rr;
      y = CY + Math.sin(th) * rr;
      z = p2[i] * Math.pow(1 - k, 1.6) + Math.sin(t * 1.3 + p1[i] * 3) * 0.05;
      alpha = smooth(0, 0.12, k) * (1 - smooth(0.82, 1, k)) * smooth(0.65, 1.35, y);
      tmpC.copy(cViolet).lerp(cCyan, p4[i]).lerp(cWhite, k * k * 0.7);
      alpha *= 0.85 + 0.15 * pulse;
      pSize[i] = baseSize[i] * (1.1 - 0.5 * k);
    } else {
      x = p0[i] + Math.sin(t * 0.6 + p3[i]) * 0.25 + k * 0.3 * Math.sin(p3[i]);
      y = PLATFORM_TOP + 0.05 + k * (4.5 * p2[i] + 1.5);
      z = p1[i] + Math.cos(t * 0.5 + p3[i] * 1.7) * 0.25;
      alpha = Math.sin(Math.PI * k) * 0.9;
      alpha *= 0.7 + 0.3 * Math.sin(t * 3 + p3[i] * 5);
      tmpC.copy(cCyan).lerp(cViolet, p4[i]).lerp(cWhite, 0.25);
      pSize[i] = baseSize[i] * (1.0 - 0.5 * k);
    }
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pCol[i * 3] = tmpC.r;
    pCol[i * 3 + 1] = tmpC.g;
    pCol[i * 3 + 2] = tmpC.b;
    pAlpha[i] = alpha;
  }
}

const pGeo = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage);
const colAttr = new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage);
const alphaAttr = new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage);
const sizeAttr = new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage);
pGeo.setAttribute('position', posAttr);
pGeo.setAttribute('aColor', colAttr);
pGeo.setAttribute('aAlpha', alphaAttr);
pGeo.setAttribute('aSize', sizeAttr);
const points = new THREE.Points(
  pGeo,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
      uniform float uScale;
      varying vec3 vC; varying float vA;
      void main() {
        vC = aColor; vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(aSize * uScale / -mv.z, 1.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float f = clamp(1.0 - r, 0.0, 1.0);
        float a = f * f;
        vec3 c = vC + vec3(1.0) * pow(f, 5.0) * 0.6;
        gl_FragColor = vec4(c, a * vA);
      }`,
  }),
);
points.frustumCulled = false;
points.renderOrder = 2;
scene.add(points);

// ---------------------------------------------------------------- post
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.95, 0.75, 0.8));
composer.addPass(
  new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uDark: { value: 0.7 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uDark;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        float v = 1.0 - smoothstep(0.1, 0.5, dot(d, d)) * uDark;
        gl_FragColor = vec4(c.rgb * v, c.a);
      }`,
  }),
);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- loop
window.__TASK_STATE__ = { portalActive: true, particleCount: N, time: 0 };
window.__EVAL_READY__ = false;

const startMs = performance.now();
let lastMs = startMs;
let first = true;

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastMs) / 1000, 0.05);
  lastMs = now;
  const t = (now - startMs) / 1000;

  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  const flick = 0.04 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 11.9 + 1);
  const k = 0.72 + 0.5 * pulse + flick;
  lightFront.intensity = 35 * k;
  lightBack.intensity = 30 * k;
  lightFloor.intensity = 14 * k;
  discMat.uniforms.uTime.value = t;
  discMat.uniforms.uPulse.value = pulse;
  halo.material.opacity = 0.45 + 0.25 * pulse;
  poolMat.opacity = 0.3 + 0.2 * pulse;
  floorRuneMat.opacity = 0.55 + 0.45 * pulse;
  for (let i = 0; i < runeMats.length; i++) {
    runeMats[i].opacity = 0.65 + 0.35 * Math.sin(t * 1.1 - i * 0.9) * 0.5 + 0.175;
  }
  for (let i = 0; i < mist.length; i++) {
    mist[i].rotation.z = t * 0.01 * (i % 2 === 0 ? 1 : -1) + i;
    mist[i].position.x += Math.sin(t * 0.1 + i) * 0.002;
  }

  updateParticles(dt, t, pulse);
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;

  const az = Math.sin(t * 0.15 + 0.5) * 0.6;
  const rad = 11 + Math.sin(t * 0.1) * 0.6;
  camera.position.set(Math.sin(az) * rad, 3.2 + Math.sin(t * 0.2) * 0.45, Math.cos(az) * rad);
  camera.lookAt(LOOK_AT);

  if (first) renderer.shadowMap.needsUpdate = true;
  composer.render(dt);

  window.__TASK_STATE__.particleCount = N;
  window.__TASK_STATE__.time = t;
  window.__TASK_STATE__.portalActive = true;
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);

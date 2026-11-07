import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

declare global {
  interface Window {
    __TASK_STATE__: { bursts: number; activeParticles: number };
    __EVAL_READY__?: boolean;
  }
}

const W = 640;
const H = 360;
const MAX_LIGHTS = 6;
const MAX_P = 24000;

window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };

// ---------- renderer ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.5, 5000);
camera.position.set(0, 4, 30);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0.7, 0.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- shared uniforms ----------
const lightPos: THREE.Vector3[] = [];
const lightCol: THREE.Vector3[] = [];
for (let i = 0; i < MAX_LIGHTS; i++) {
  lightPos.push(new THREE.Vector3(0, -1000, 0));
  lightCol.push(new THREE.Vector3(0, 0, 0));
}
const uTime = { value: 0 };

const HORIZON_GLSL = 'const vec3 HORIZON = vec3(0.010, 0.020, 0.042);';

// ---------- sky dome ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  uniforms: { uLightPos: { value: lightPos }, uLightCol: { value: lightCol } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vDir = w.xyz - cameraPosition;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    ${HORIZON_GLSL}
    uniform vec3 uLightPos[${MAX_LIGHTS}];
    uniform vec3 uLightCol[${MAX_LIGHTS}];
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 zenith = vec3(0.0015, 0.0030, 0.0120);
      vec3 col = mix(HORIZON, zenith, pow(h, 0.45));
      col += vec3(0.010, 0.006, 0.004) * exp(-h * 22.0) * 0.6;
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        vec3 l = normalize(uLightPos[i] - cameraPosition);
        float c = max(dot(l, d), 0.0);
        float g = exp(-(1.0 - c) * 55.0);
        col += uLightCol[i] * (g * 0.22 + exp(-(1.0 - c) * 9.0) * 0.035);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

// ---------- stars ----------
{
  const n = 1600;
  const pos = new Float32Array(n * 3);
  const info = new Float32Array(n * 3); // brightness, size, phase
  for (let i = 0; i < n; i++) {
    const y = Math.pow(Math.random(), 1.6) * 0.98 + 0.012;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 480;
    pos[i * 3 + 1] = y * 480;
    pos[i * 3 + 2] = Math.sin(a) * r * 480;
    const b = Math.pow(Math.random(), 3);
    info[i * 3] = 0.25 + b * 0.9;
    info[i * 3 + 1] = 1.2 + b * 1.6;
    info[i * 3 + 2] = Math.random() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    uniforms: { uTime },
    vertexShader: /* glsl */ `
      attribute vec3 aInfo;
      uniform float uTime;
      varying float vB;
      void main() {
        float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aInfo.z * 0.4) + aInfo.z * 10.0);
        vB = aInfo.x * tw;
        gl_PointSize = aInfo.y;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float a = exp(-r * r * 3.5) * smoothstep(1.0, 0.8, r);
        vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(vB * 37.0));
        gl_FragColor = vec4(tint * a * vB * 0.5, 1.0);
      }`,
  });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  scene.add(stars);
}

// ---------- water ----------
const waterMat = new THREE.ShaderMaterial({
  depthWrite: false,
  uniforms: { uTime, uLightPos: { value: lightPos }, uLightCol: { value: lightCol } },
  vertexShader: /* glsl */ `
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    ${HORIZON_GLSL}
    uniform float uTime;
    uniform vec3 uLightPos[${MAX_LIGHTS}];
    uniform vec3 uLightCol[${MAX_LIGHTS}];
    varying vec3 vW;
    void main() {
      vec3 p = vW;
      float dist = length(p.xz - cameraPosition.xz);
      float fog = 1.0 - exp(-dist / 450.0);
      float rip = 0.5 * sin(p.x * 0.9 + uTime * 0.9 + sin(p.z * 0.35 + uTime * 0.3) * 2.0)
                + 0.5 * sin(p.z * 0.6 - uTime * 1.1 + p.x * 0.15);
      vec3 deep = vec3(0.0015, 0.0045, 0.011);
      vec3 col = mix(deep, HORIZON, fog);
      col += vec3(0.003, 0.006, 0.012) * (0.5 + 0.5 * rip) * (1.0 - fog);
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        vec3 L = uLightPos[i];
        float t = cameraPosition.y / (cameraPosition.y + max(L.y, 0.0));
        vec2 hit = cameraPosition.xz + t * (L.xz - cameraPosition.xz);
        vec2 d = p.xz - hit;
        float sx = 7.0 + abs(d.y) * 0.08;
        float streak = exp(-d.x * d.x / (sx * sx)) * exp(-d.y * d.y / (55.0 * 55.0));
        float sliver = 0.5 + 0.5 * sin(p.z * 0.9 + rip * 3.0 - uTime * 1.6);
        vec2 e = p.xz - L.xz;
        float broad = exp(-dot(e, e) / (75.0 * 75.0));
        col += uLightCol[i] * (streak * (0.08 + 0.30 * sliver * (0.6 + 0.4 * rip)) + broad * (0.05 + 0.03 * rip));
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0, -1800);
water.renderOrder = 0;
water.frustumCulled = false;
scene.add(water);

// ---------- shoreline, pier, boats ----------
const silMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.002, 0.003, 0.006) });
const silMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.0015, 0.002, 0.005) });
const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 0.35) });
const world = new THREE.Group();
scene.add(world);

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat = silMat): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.renderOrder = 1;
  world.add(m);
  return m;
}

// land strip with gentle rises
box(700, 2.2, 34, 0, 1.1, -100);
box(90, 3.2, 30, -150, 1.6, -98);
box(80, 4.0, 30, 160, 2.0, -98);
box(60, 2.0, 24, -60, 2.8, -104);
box(40, 2.6, 24, 70, 3.2, -104);

// houses: [x, width, height, depth, z]
const houses: [number, number, number, number, number][] = [
  [-120, 8, 5, 7, -95], [-108, 6, 4, 6, -94], [-96, 10, 6.5, 7, -96], [-84, 7, 4.5, 6, -95],
  [-30, 9, 5, 7, -97], [-18, 6, 7.5, 6, -98], [-6, 12, 4.5, 7, -96],
  [34, 8, 5.5, 7, -96], [46, 10, 4, 7, -95], [112, 9, 6, 7, -95], [124, 7, 4.2, 6, -96], [136, 11, 5, 7, -97],
];
for (const [x, w, h, d, z] of houses) {
  const baseY = 2.2;
  box(w, h, d, x, baseY + h / 2, z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.4, 4), silMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  roof.position.set(x, baseY + h + h * 0.2, z);
  roof.renderOrder = 1;
  world.add(roof);
  // a few warm windows
  const nWin = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < nWin; k++) {
    const wx = x + (Math.random() - 0.5) * (w - 2);
    const wy = baseY + 1.2 + Math.random() * Math.max(0.5, h - 2.5);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), lampMat);
    win.position.set(wx, wy, z + d / 2 + 0.05);
    win.renderOrder = 2;
    world.add(win);
  }
}

// lighthouse
{
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.0, 16, 12), silMat);
  tower.position.set(-165, 2.2 + 8, -96);
  tower.renderOrder = 1;
  world.add(tower);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.4, 1.2, 12), silMat);
  top.position.set(-165, 2.2 + 16.6, -96);
  top.renderOrder = 1;
  world.add(top);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 12), silMat);
  cap.position.set(-165, 2.2 + 18.4, -96);
  cap.renderOrder = 1;
  world.add(cap);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), lampMat);
  lamp.position.set(-165, 2.2 + 16.6, -96);
  lamp.renderOrder = 2;
  world.add(lamp);
}

// pier
{
  const px = -34;
  box(5.5, 0.5, 52, px, 1.4, -66);
  for (let z = -90; z <= -42; z += 4.5) {
    for (const dx of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.0, 6), silMat);
      post.position.set(px + dx, 0.1, z);
      post.renderOrder = 1;
      world.add(post);
    }
  }
  box(0.3, 4.2, 0.3, px + 2.4, 3.8, -44);
  box(1.4, 0.6, 0.6, px + 1.9, 5.9, -44);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
  lamp.position.set(px + 1.3, 5.7, -44);
  lamp.renderOrder = 2;
  world.add(lamp);
}

// boats
interface Boat { g: THREE.Group; phase: number; baseY: number }
const boats: Boat[] = [];
function makeBoat(x: number, z: number, scale: number, rotY: number, kind: number): void {
  const g = new THREE.Group();
  const prof = new THREE.Shape();
  prof.moveTo(-4.5, 0.9);
  prof.lineTo(-3.6, -0.7);
  prof.lineTo(3.0, -0.7);
  prof.lineTo(5.2, 1.0);
  prof.lineTo(-4.5, 0.9);
  const hullGeo = new THREE.ExtrudeGeometry(prof, { depth: 2.4, bevelEnabled: false });
  hullGeo.translate(0, 0, -1.2);
  const hull = new THREE.Mesh(hullGeo, silMat2);
  hull.renderOrder = 1;
  g.add(hull);
  if (kind === 0) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 9, 5), silMat2);
    mast.position.set(0.3, 5.2, 0);
    mast.renderOrder = 1;
    g.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0.5, 8.5);
    sailShape.lineTo(0.5, 1.6);
    sailShape.lineTo(4.0, 1.6);
    sailShape.lineTo(0.5, 8.5);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.005, 0.009), side: THREE.DoubleSide }));
    sail.renderOrder = 1;
    g.add(sail);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 1.9), silMat2);
    cabin.position.set(-0.6, 1.9, 0);
    cabin.renderOrder = 1;
    g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 5), silMat2);
    mast.position.set(-0.6, 4.7, 0);
    mast.renderOrder = 1;
    g.add(mast);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), lampMat);
    lamp.position.set(-0.6, 6.8, 0);
    lamp.renderOrder = 2;
    g.add(lamp);
  }
  g.scale.setScalar(scale);
  g.position.set(x, 0.3 * scale, z);
  g.rotation.y = rotY;
  world.add(g);
  boats.push({ g, phase: Math.random() * 6, baseY: g.position.y });
}
makeBoat(20, -60, 1.0, 0.15, 0);
makeBoat(55, -48, 0.8, -0.25, 1);
makeBoat(-62, -70, 0.9, 0.35, 0);
makeBoat(88, -72, 1.1, -0.1, 1);
makeBoat(-8, -34, 0.7, 0.2, 1);
makeBoat(-100, -52, 0.9, -0.3, 0);

const silMats = [silMat, silMat2];
const silBase = silMats.map((m) => m.color.clone());

// ---------- particles ----------
const pPos = new Float32Array(MAX_P * 3);
const pCol = new Float32Array(MAX_P * 3);
const pAlpha = new Float32Array(MAX_P);
const pSize = new Float32Array(MAX_P);
const vel = new Float32Array(MAX_P * 3);
const life = new Float32Array(MAX_P);
const maxLife = new Float32Array(MAX_P);
const size0 = new Float32Array(MAX_P);
const drag = new Float32Array(MAX_P);
const grav = new Float32Array(MAX_P);
const emitT = new Float32Array(MAX_P);
const phase = new Float32Array(MAX_P);
const kind = new Uint8Array(MAX_P); // 0 spark, 1 trailing spark, 2 trail, 3 static glow
let cursor = 0;
let active = 0;

const pGeo = new THREE.BufferGeometry();
const aPos = new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage);
const aCol = new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage);
const aAlpha = new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage);
const aSize = new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage);
pGeo.setAttribute('position', aPos);
pGeo.setAttribute('aColor', aCol);
pGeo.setAttribute('aAlpha', aAlpha);
pGeo.setAttribute('aSize', aSize);

const uScale = { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) };
function makePointMat(mirror: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    uniforms: { uScale, uTime, uMirror: { value: mirror ? 1 : 0 }, uGain: { value: mirror ? 0.4 : 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aAlpha;
      attribute float aSize;
      uniform float uScale;
      uniform float uTime;
      uniform float uMirror;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 w = modelMatrix * vec4(position, 1.0);
        float s = aSize;
        if (uMirror > 0.5) {
          w.x += sin(w.y * 1.7 + uTime * 2.3 + w.z * 0.1) * 0.9 * (0.4 + 0.6 * smoothstep(0.0, 30.0, -w.y));
          s *= 0.8;
        }
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAlpha > 0.002 ? max(s * uScale / max(-mv.z, 0.1), 1.0) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float core = exp(-r * r * 9.0);
        float halo = exp(-r * r * 2.8) * 0.4;
        float edge = smoothstep(1.0, 0.75, r);
        float a = (core + halo) * edge * vAlpha * uGain;
        vec3 col = mix(vColor, vec3(1.0), core * smoothstep(0.35, 1.0, vAlpha) * 0.65);
        gl_FragColor = vec4(col * a * 1.6, 1.0);
      }`,
  });
}
const pointsMain = new THREE.Points(pGeo, makePointMat(false));
pointsMain.frustumCulled = false;
pointsMain.renderOrder = 10;
scene.add(pointsMain);
const pointsMirror = new THREE.Points(pGeo, makePointMat(true));
pointsMirror.scale.y = -1;
pointsMirror.frustumCulled = false;
pointsMirror.renderOrder = 9;
scene.add(pointsMirror);

function spawn(
  k: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  r: number, g: number, b: number, l: number, sz: number, dr: number, gr: number,
): number {
  let idx = -1;
  for (let t = 0; t < 64; t++) {
    const c = (cursor + t) % MAX_P;
    if (life[c] <= 0) { idx = c; break; }
  }
  if (idx < 0) {
    idx = cursor;
  } else {
    active++;
  }
  cursor = (idx + 1) % MAX_P;
  kind[idx] = k;
  const i3 = idx * 3;
  pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z;
  vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
  pCol[i3] = r; pCol[i3 + 1] = g; pCol[i3 + 2] = b;
  life[idx] = l;
  maxLife[idx] = l;
  size0[idx] = sz;
  drag[idx] = dr;
  grav[idx] = gr;
  emitT[idx] = Math.random() * 0.05;
  phase[idx] = Math.random() * 6.283;
  pAlpha[idx] = 1;
  pSize[idx] = sz;
  return idx;
}

// ---------- bursts ----------
interface BurstLight { pos: THREE.Vector3; col: THREE.Color; born: number; on: boolean }
const lights: BurstLight[] = [];
for (let i = 0; i < MAX_LIGHTS; i++) lights.push({ pos: new THREE.Vector3(), col: new THREE.Color(), born: 0, on: false });

function addLight(p: THREE.Vector3, c: THREE.Color, now: number): void {
  let slot = lights.find((l) => !l.on);
  if (!slot) {
    slot = lights.reduce((a, b) => (a.born < b.born ? a : b));
  }
  slot.pos.copy(p);
  slot.col.copy(c);
  slot.born = now;
  slot.on = true;
}

const palette: THREE.Color[] = [
  new THREE.Color(1.0, 0.62, 0.12), // gold
  new THREE.Color(1.0, 0.07, 0.05), // red
  new THREE.Color(0.1, 0.3, 1.0),   // blue
  new THREE.Color(0.1, 1.0, 0.3),   // green
  new THREE.Color(0.75, 0.15, 1.0), // violet
  new THREE.Color(1.0, 0.25, 0.55), // pink
  new THREE.Color(0.55, 0.8, 1.0),  // silver-blue
];
let bag: number[] = [];
function nextColorIndex(): number {
  if (bag.length === 0) {
    bag = palette.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop() as number;
}

const tmpDir = new THREE.Vector3();
function randSphere(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}

function explode(pos: THREE.Vector3, now: number): void {
  const ci = nextColorIndex();
  const c = palette[ci];
  const roll = Math.random();
  const style = roll < 0.4 ? 'peony' : roll < 0.75 ? 'trail' : roll < 0.9 ? 'twotone' : 'willow';
  const c2 = palette[(ci + 1 + Math.floor(Math.random() * (palette.length - 1))) % palette.length];
  const radius = 28 + Math.random() * 10;

  // central flash
  spawn(3, pos.x, pos.y, pos.z, 0, 0, 0, c.r * 0.7 + 0.5, c.g * 0.7 + 0.5, c.b * 0.7 + 0.5, 0.35, 22, 0, 0);
  spawn(3, pos.x, pos.y, pos.z, 0, 0, 0, 1, 0.95, 0.85, 0.12, 9, 0, 0);

  if (style === 'peony' || style === 'twotone') {
    const n = style === 'peony' ? 420 : 480;
    for (let i = 0; i < n; i++) {
      randSphere(tmpDir);
      const inner = style === 'twotone' && i % 3 === 0;
      const sp = radius * (inner ? 0.5 : 0.85 + Math.random() * 0.15) * 1.0;
      const col = inner ? c2 : c;
      spawn(
        0, pos.x, pos.y, pos.z,
        tmpDir.x * sp, tmpDir.y * sp, tmpDir.z * sp,
        col.r, col.g, col.b,
        1.5 + Math.random() * 1.0, 1.1 + Math.random() * 0.5, 1.6, 9,
      );
    }
  } else if (style === 'trail') {
    for (let i = 0; i < 150; i++) {
      randSphere(tmpDir);
      const sp = radius * (0.85 + Math.random() * 0.2);
      spawn(
        1, pos.x, pos.y, pos.z,
        tmpDir.x * sp, tmpDir.y * sp, tmpDir.z * sp,
        c.r, c.g, c.b,
        1.9 + Math.random() * 0.9, 1.2, 1.5, 9,
      );
    }
    for (let i = 0; i < 160; i++) {
      randSphere(tmpDir);
      const sp = radius * 0.9 * (0.9 + Math.random() * 0.1);
      spawn(0, pos.x, pos.y, pos.z, tmpDir.x * sp, tmpDir.y * sp, tmpDir.z * sp, c.r, c.g, c.b, 1.3 + Math.random() * 0.7, 0.9, 1.6, 9);
    }
  } else {
    // willow: golden, slow, long drooping streaks
    const gold = palette[0];
    for (let i = 0; i < 170; i++) {
      randSphere(tmpDir);
      const sp = radius * 0.75 * (0.8 + Math.random() * 0.2);
      spawn(
        1, pos.x, pos.y, pos.z,
        tmpDir.x * sp, tmpDir.y * sp, tmpDir.z * sp,
        gold.r, gold.g * 0.9, gold.b,
        2.6 + Math.random() * 0.8, 1.1, 2.3, 7,
      );
    }
  }
  addLight(pos, c, now);
  window.__TASK_STATE__.bursts++;
}

// ---------- rockets ----------
interface Rocket { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; emit: number; prev: THREE.Vector3 }
const rockets: Rocket[] = [];
function launch(): void {
  const x = (Math.random() * 2 - 1) * 85;
  const from = new THREE.Vector3(x, 3, -92 - Math.random() * 6);
  const to = new THREE.Vector3(
    x + (Math.random() * 2 - 1) * 14,
    38 + Math.random() * 32,
    -105 - Math.random() * 40,
  );
  rockets.push({ from, to, t: 0, dur: 1.2 + Math.random() * 0.6, emit: 0, prev: from.clone() });
}

function updateRockets(dt: number, now: number): void {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.t += dt;
    const u = Math.min(r.t / r.dur, 1);
    const e = 1 - (1 - u) * (1 - u);
    const px = r.from.x + (r.to.x - r.from.x) * e + Math.sin(r.t * 18 + i) * 0.12;
    const py = r.from.y + (r.to.y - r.from.y) * e;
    const pz = r.from.z + (r.to.z - r.from.z) * e;
    const dist = Math.hypot(px - r.prev.x, py - r.prev.y, pz - r.prev.z);
    const steps = Math.max(1, Math.ceil(dist / 0.9));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const sx = r.prev.x + (px - r.prev.x) * f;
      const sy = r.prev.y + (py - r.prev.y) * f;
      const sz = r.prev.z + (pz - r.prev.z) * f;
      spawn(
        2, sx, sy, sz,
        (Math.random() - 0.5) * 1.5, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 1.5,
        1.0, 0.5 + Math.random() * 0.15, 0.15, 0.45 + Math.random() * 0.4, 0.55, 1.5, 3,
      );
    }
    spawn(3, px, py, pz, 0, 0, 0, 1.0, 0.8, 0.5, 0.05, 1.7, 0, 0);
    r.prev.set(px, py, pz);
    if (u >= 1) {
      explode(r.to, now);
      rockets.splice(i, 1);
    }
  }
}

// ---------- particle update ----------
function updateParticles(dt: number, now: number): void {
  for (let i = 0; i < MAX_P; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    const k = kind[i];
    const i3 = i * 3;
    if (life[i] <= 0) {
      pAlpha[i] = 0;
      pSize[i] = 0;
      active--;
      continue;
    }
    const f = life[i] / maxLife[i];
    if (k !== 3) {
      const d = Math.exp(-drag[i] * dt);
      vel[i3] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt;
      vel[i3 + 2] *= d;
      pPos[i3] += vel[i3] * dt;
      pPos[i3 + 1] += vel[i3 + 1] * dt;
      pPos[i3 + 2] += vel[i3 + 2] * dt;
      if (pPos[i3 + 1] < 0.3) {
        life[i] = 0;
        pAlpha[i] = 0;
        pSize[i] = 0;
        active--;
        continue;
      }
    }
    if (k === 1) {
      emitT[i] -= dt;
      if (emitT[i] <= 0 && f > 0.12) {
        emitT[i] += 0.045;
        spawn(
          2, pPos[i3], pPos[i3 + 1], pPos[i3 + 2], 0, 0, 0,
          pCol[i3], pCol[i3 + 1], pCol[i3 + 2], 0.75, size0[i] * 0.6, 0.5, 0.8,
        );
      }
    }
    if (k <= 1) {
      let a = Math.pow(f, 0.7);
      if (f < 0.4) a *= 0.7 + 0.3 * Math.sin(now * 55 + phase[i]);
      pAlpha[i] = a;
      pSize[i] = size0[i] * (0.5 + 0.5 * f);
    } else if (k === 2) {
      pAlpha[i] = Math.pow(f, 1.6) * 0.7;
      pSize[i] = size0[i] * (0.4 + 0.6 * f);
    } else {
      pAlpha[i] = f * f;
      pSize[i] = size0[i];
    }
  }
}

// ---------- main loop ----------
let nextLaunch = 0.4;
let last = performance.now() / 1000;
let simTime = 0;
let first = true;

function frame(): void {
  const nowS = performance.now() / 1000;
  const dt = Math.min(Math.max(nowS - last, 0.001), 0.05);
  last = nowS;
  simTime += dt;
  uTime.value = simTime;

  // scheduling
  nextLaunch -= dt;
  if (nextLaunch <= 0) {
    launch();
    if (Math.random() < 0.3) {
      launch();
    }
    nextLaunch = 0.5 + Math.random() * Math.random() * 3.0 + (Math.random() < 0.15 ? 1.5 : 0);
  }

  updateRockets(dt, simTime);
  updateParticles(dt, simTime);

  aPos.needsUpdate = true;
  aCol.needsUpdate = true;
  aAlpha.needsUpdate = true;
  aSize.needsUpdate = true;

  // lights
  const tint = new THREE.Color(0, 0, 0);
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const l = lights[i];
    let inten = 0;
    if (l.on) {
      const age = simTime - l.born;
      if (age > 3.5) l.on = false;
      else inten = Math.min(age / 0.06, 1) * Math.exp(-age * 1.5);
    }
    lightPos[i].copy(l.pos);
    if (!l.on) lightPos[i].set(0, -1000, 0);
    lightCol[i].set(l.col.r * inten, l.col.g * inten, l.col.b * inten);
    if (l.on) tint.r += l.col.r * inten, tint.g += l.col.g * inten, tint.b += l.col.b * inten;
  }
  for (let i = 0; i < silMats.length; i++) {
    silMats[i].color.setRGB(
      silBase[i].r + tint.r * 0.012,
      silBase[i].g + tint.g * 0.012,
      silBase[i].b + tint.b * 0.012,
    );
  }

  // boats bob
  for (const b of boats) {
    b.g.position.y = b.baseY + Math.sin(simTime * 0.8 + b.phase) * 0.12;
    b.g.rotation.z = Math.sin(simTime * 0.6 + b.phase * 1.7) * 0.025;
  }

  // camera drift
  camera.position.set(Math.sin(simTime * 0.07) * 8, 4, 30);
  camera.lookAt(Math.sin(simTime * 0.05 + 1) * 6, 15 + Math.sin(simTime * 0.06) * 1.5, -120);

  composer.render();

  window.__TASK_STATE__.activeParticles = active;
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

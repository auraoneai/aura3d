import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a110a);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 100);
camera.position.set(0, 3.6, 10);
camera.lookAt(0, 3.25, 0);

// ---------- textures ----------
function woodTexture(base: string, dark: string, horizontal: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = dark;
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.08 + ((i * 37) % 10) / 80;
    g.lineWidth = 1 + ((i * 13) % 3);
    const p = (i * 53) % 256;
    g.beginPath();
    if (horizontal) {
      g.moveTo(0, p);
      g.bezierCurveTo(80, p + 6, 170, p - 6, 256, p + 2);
    } else {
      g.moveTo(p, 0);
      g.bezierCurveTo(p + 6, 80, p - 6, 170, p + 2, 256);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const l = 30 + ((i * 17) % 7);
    g.fillStyle = `hsl(28, 45%, ${l}%)`;
    g.fillRect(0, (i * 512) / n, 512, 512 / n);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, (i * 512) / n, 512, 2);
    g.fillRect(((i * 211) % 512), (i * 512) / n, 2, 512 / n);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------- materials ----------
const woodTex = woodTexture('#6a3a1b', '#3a1d0a', false);
const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.0 });
const woodDarkTex = woodTexture('#4a2810', '#2a1306', false);
const woodDark = new THREE.MeshStandardMaterial({ map: woodDarkTex, roughness: 0.5 });
const backMat = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.8 });
const brass = new THREE.MeshStandardMaterial({
  color: 0xd8a642,
  metalness: 0.7,
  roughness: 0.35,
  emissive: 0x2a1a02,
});
const cream = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.85 });
const ink = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.5 });
const red = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xfff4e0,
  transparent: true,
  opacity: 0.1,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});

// ---------- world ----------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.95 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
wall.position.set(0, 7, -0.62);
wall.receiveShadow = true;
scene.add(wall);

const ft = floorTexture();
ft.repeat.set(5, 3);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 14),
  new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 6.38);
floor.receiveShadow = true;
scene.add(floor);

const baseboard = new THREE.Mesh(
  new THREE.BoxGeometry(30, 0.35, 0.06),
  new THREE.MeshStandardMaterial({ color: 0x3c2414, roughness: 0.6 }),
);
baseboard.position.set(0, 0.175, -0.59);
baseboard.receiveShadow = true;
scene.add(baseboard);

// ---------- clock ----------
const clock = new THREE.Group();
scene.add(clock);

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  parent: THREE.Object3D = clock,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// base
box(2.6, 0.6, 1.2, 0, 0.3, 0, woodDark);
box(2.3, 0.14, 1.05, 0, 0.67, 0, wood);

// trunk (y 0.74 .. 4.0)
const trunkBot = 0.74;
const trunkTop = 4.0;
const trunkH = trunkTop - trunkBot;
const trunkMid = (trunkBot + trunkTop) / 2;
box(0.2, trunkH, 0.9, -0.85, trunkMid, 0, wood);
box(0.2, trunkH, 0.9, 0.85, trunkMid, 0, wood);
box(1.9, trunkH, 0.06, 0, trunkMid, -0.42, backMat);
// front rails
box(1.9, 0.3, 0.1, 0, 3.85, 0.4, wood);
box(1.9, 0.46, 0.1, 0, 0.97, 0.4, wood);
// window frame trim (brass)
box(1.56, 0.04, 0.04, 0, 3.69, 0.46, brass);
box(1.56, 0.04, 0.04, 0, 1.21, 0.46, brass);
box(0.04, 2.52, 0.04, -0.78, 2.45, 0.46, brass);
box(0.04, 2.52, 0.04, 0.78, 2.45, 0.46, brass);
// glass
const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.46), glass);
glassPane.position.set(0, 2.45, 0.44);
glassPane.renderOrder = 5;
clock.add(glassPane);

// back brass plate behind pendulum (subtle)
const plate = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 2.3),
  new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7 }),
);
plate.position.set(0, 2.45, -0.385);
plate.receiveShadow = true;
clock.add(plate);

// head (y 4.0 .. 5.9)
box(2.2, 1.9, 1.0, 0, 4.95, 0, wood);
box(2.4, 0.12, 1.1, 0, 3.98, 0, woodDark);
box(2.4, 0.14, 1.1, 0, 5.97, 0, woodDark);
box(1.9, 0.22, 0.9, 0, 6.15, 0, wood);
box(1.4, 0.18, 0.7, 0, 6.35, 0, woodDark);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), brass);
finial.position.set(0, 6.54, 0);
finial.castShadow = true;
clock.add(finial);

// dial
const dialY = 4.95;
const dialZ = 0.5;
const dialFrame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 0.04), woodDark);
dialFrame.position.set(0, dialY, dialZ + 0.01);
dialFrame.receiveShadow = true;
clock.add(dialFrame);

const dial = new THREE.Mesh(new THREE.CircleGeometry(0.8, 64), cream);
dial.position.set(0, dialY, dialZ + 0.04);
dial.receiveShadow = true;
clock.add(dial);

const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.04, 14, 72), brass);
bezel.position.set(0, dialY, dialZ + 0.045);
bezel.castShadow = true;
clock.add(bezel);

for (let i = 0; i < 12; i++) {
  const major = i % 3 === 0;
  const a = (i / 12) * Math.PI * 2;
  const r = major ? 0.65 : 0.67;
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(major ? 0.085 : 0.05, major ? 0.19 : 0.13, 0.015),
    ink,
  );
  mark.position.set(Math.sin(a) * r, dialY + Math.cos(a) * r, dialZ + 0.05);
  mark.rotation.z = -a;
  clock.add(mark);
}

function makeHand(
  len: number,
  tail: number,
  width: number,
  z: number,
  mat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, dialY, dialZ + z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, len + tail, 0.015), mat);
  m.position.y = (len - tail) / 2;
  m.castShadow = true;
  g.add(m);
  clock.add(g);
  return g;
}
const hourHand = makeHand(0.42, 0.08, 0.06, 0.06, ink);
const minuteHand = makeHand(0.64, 0.1, 0.04, 0.075, ink);
const secondHand = makeHand(0.7, 0.16, 0.014, 0.09, red);
const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), brass);
cap.rotation.x = Math.PI / 2;
cap.position.set(0, dialY, dialZ + 0.1);
clock.add(cap);

// pendulum
const PIVOT_Y = 3.62;
const ROD = 2.0;
const pendulum = new THREE.Group();
pendulum.position.set(0, PIVOT_Y, 0.12);
clock.add(pendulum);
const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ROD, 10), brass);
rod.position.y = -ROD / 2;
rod.castShadow = true;
pendulum.add(rod);
const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 48), brass);
bob.rotation.x = Math.PI / 2;
bob.position.y = -ROD - 0.05;
bob.castShadow = true;
pendulum.add(bob);
const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), brass);
boss.position.set(0, -ROD - 0.05, 0.05);
boss.scale.z = 0.5;
pendulum.add(boss);
const pivotKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), brass);
pivotKnob.position.set(0, PIVOT_Y, 0.12);
clock.add(pivotKnob);

// weights on chains
const WEIGHT_H = 0.5;
const WEIGHT_TOP_START = 3.2;
const WEIGHT_MIN_TOP = 1.8;
const SINK_RATE = 0.005; // units per second
interface Weight {
  body: THREE.Mesh;
  chain: THREE.Mesh;
}
const weights: Weight[] = [];
for (const x of [-0.5, 0.5]) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, WEIGHT_H, 28), brass);
  body.position.set(x, 0, -0.2);
  body.castShadow = true;
  clock.add(body);
  const chain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x3b3328, metalness: 0.6, roughness: 0.5 }),
  );
  chain.position.x = x;
  chain.position.z = -0.2;
  clock.add(chain);
  weights.push({ body, chain });
}

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0xffd9a8, 0.35));
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x4a2a14, 0.45));

const key = new THREE.DirectionalLight(0xffcf94, 1.9);
key.position.set(4, 8, 7);
key.target.position.set(0, 3, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -7;
key.shadow.camera.right = 7;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -3;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

const dialLight = new THREE.PointLight(0xffd8a0, 7, 0, 2);
dialLight.position.set(0, 5.4, 2.2);
scene.add(dialLight);

const innerLight = new THREE.PointLight(0xffa24a, 2.6, 0, 2);
innerLight.position.set(0, 3.2, 0.0);
clock.add(innerLight);
const innerLight2 = new THREE.PointLight(0xff9a40, 1.6, 0, 2);
innerLight2.position.set(0, 1.7, 0.1);
clock.add(innerLight2);

// ---------- animation ----------
const AMP = 0.16; // radians
const t0 = performance.now();
let first = true;

function frame(): void {
  const now = new Date();
  const ms = now.getMilliseconds();
  const secs = now.getSeconds();
  const mins = now.getMinutes();
  const hrs = now.getHours() % 12;

  // Pendulum: period 2 s, sinusoidal (slowest at extremes), phase locked to wall time.
  const ts = (now.getTime() % 2000) / 1000;
  pendulum.rotation.z = AMP * Math.sin(Math.PI * ts);

  // Hands
  secondHand.rotation.z = -(secs / 60) * Math.PI * 2;
  minuteHand.rotation.z = -((mins + secs / 60) / 60) * Math.PI * 2;
  hourHand.rotation.z = -((hrs + (mins + secs / 60) / 60) / 12) * Math.PI * 2;
  void ms;

  // Weights sink slowly
  const elapsed = (performance.now() - t0) / 1000;
  const top = Math.max(WEIGHT_MIN_TOP, WEIGHT_TOP_START - SINK_RATE * elapsed);
  for (const w of weights) {
    w.body.position.y = top - WEIGHT_H / 2;
    const chainLen = trunkTop - top;
    w.chain.scale.y = chainLen;
    w.chain.position.y = top + chainLen / 2;
  }

  // gentle candle-like flicker on interior light
  innerLight.intensity = 2.6 + 0.08 * Math.sin(elapsed * 7.3) + 0.05 * Math.sin(elapsed * 13.1);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

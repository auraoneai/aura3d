import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1210);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(0, 3.3, 11.5);
camera.lookAt(0, 2.75, 0);

// ---------- helpers ----------
function mat(color: number, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(
  w: number, h: number, d: number, x: number, y: number, z: number,
  m: THREE.Material, parent: THREE.Object3D = scene,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function plankTexture(base: string, line: string, vertical: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + (i % 3) * 0.04})`;
    if (vertical) g.fillRect(i * 32, 0, 32, 256);
    else g.fillRect(0, i * 32, 256, 32);
  }
  g.fillStyle = line;
  for (let i = 0; i < 8; i++) {
    if (vertical) g.fillRect(i * 32, 0, 2, 256);
    else g.fillRect(0, i * 32, 256, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- room ----------
const floorTex = plankTexture('#8a5a35', '#3a2312', true);
floorTex.repeat.set(3, 2);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 4);
floor.receiveShadow = true;
scene.add(floor);

const wallTex = plankTexture('#b99a6c', 'rgba(60,40,20,0.35)', true);
wallTex.repeat.set(6, 1);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
wall.position.set(0, 7, -0.7);
wall.receiveShadow = true;
scene.add(wall);

// skirting board
box(30, 0.35, 0.08, 0, 0.175, -0.66, mat(0x4a2c18, 0.6));

// ---------- clock case ----------
const wood = mat(0x6b3a1c, 0.5);
const darkWood = mat(0x3a1e0e, 0.7);
const interior = mat(0x24120a, 0.9);
const brass = mat(0xd4a64a, 0.3, 0.8);

const clock = new THREE.Group();
scene.add(clock);

// plinth
box(2.4, 0.5, 1.1, 0, 0.25, 0, wood, clock);
box(2.5, 0.1, 1.2, 0, 0.45, 0.02, darkWood, clock);
// trunk: back, sides, top, bottom, front frame
box(1.8, 3.1, 0.06, 0, 2.05, -0.42, interior, clock);
box(0.2, 3.1, 0.9, -0.8, 2.05, 0, wood, clock);
box(0.2, 3.1, 0.9, 0.8, 2.05, 0, wood, clock);
// front frame around opening (opening x +-0.65, y 0.95..3.3)
box(0.25, 3.1, 0.1, -0.775, 2.05, 0.4, wood, clock);
box(0.25, 3.1, 0.1, 0.775, 2.05, 0.4, wood, clock);
box(1.8, 0.45, 0.1, 0, 0.775, 0.4, wood, clock);
box(1.8, 0.3, 0.1, 0, 3.45, 0.4, wood, clock);
box(1.6, 0.05, 0.8, 0, 0.55, 0, interior, clock);
// glass
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(1.3, 2.35),
  new THREE.MeshPhysicalMaterial({
    color: 0xcfe8ff, transparent: true, opacity: 0.12, roughness: 0.05,
    metalness: 0, depthWrite: false,
  }),
);
glass.position.set(0, 2.125, 0.43);
clock.add(glass);
// brass trim around the opening
const trimM = brass;
box(1.34, 0.03, 0.03, 0, 0.95, 0.46, trimM, clock);
box(1.34, 0.03, 0.03, 0, 3.3, 0.46, trimM, clock);
box(0.03, 2.38, 0.03, -0.66, 2.125, 0.46, trimM, clock);
box(0.03, 2.38, 0.03, 0.66, 2.125, 0.46, trimM, clock);

// hood
box(2.0, 1.7, 1.0, 0, 4.45, 0, wood, clock);
box(2.2, 0.2, 1.1, 0, 5.4, 0, darkWood, clock);
box(2.1, 0.15, 1.05, 0, 3.62, 0, darkWood, clock);
box(1.5, 0.25, 0.9, 0, 5.62, 0, wood, clock);
const finialStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 16), brass);
finialStem.position.set(0, 5.85, 0);
finialStem.castShadow = true;
clock.add(finialStem);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), brass);
finial.position.set(0, 6.0, 0);
finial.castShadow = true;
clock.add(finial);
for (const sx of [-1, 1]) {
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 14), brass);
  col.position.set(sx * 0.93, 4.45, 0.5);
  col.castShadow = true;
  clock.add(col);
}

// face
const FACE_Y = 4.45;
const faceGroup = new THREE.Group();
faceGroup.position.set(0, FACE_Y, 0.5);
clock.add(faceGroup);

const faceDisc = new THREE.Mesh(
  new THREE.CircleGeometry(0.72, 64),
  new THREE.MeshStandardMaterial({ color: 0xf3e8c8, roughness: 0.8 }),
);
faceDisc.position.z = 0.01;
faceDisc.receiveShadow = true;
faceGroup.add(faceDisc);
const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 12, 64), brass);
bezel.position.z = 0.03;
bezel.castShadow = true;
faceGroup.add(bezel);

const markM = mat(0x1b1109, 0.5);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const len = major ? 0.14 : 0.1;
  const wd = major ? 0.045 : 0.03;
  const r = 0.64 - len / 2 + 0.04;
  const m = new THREE.Mesh(new THREE.BoxGeometry(wd, len, 0.015), markM);
  m.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.02);
  m.rotation.z = -a;
  faceGroup.add(m);
}

function makeHand(length: number, tail: number, width: number, z: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(width, length + tail, 0.012),
    mat(color, 0.4, 0.2),
  );
  m.position.y = (length - tail) / 2;
  m.position.z = z;
  m.castShadow = true;
  g.add(m);
  faceGroup.add(g);
  return g;
}
const hourHand = makeHand(0.739 * 0.6, 0.06, 0.055, 0.035, 0x120a05);
const minuteHand = makeHand(0.58, 0.08, 0.036, 0.05, 0x120a05);
const secondHand = makeHand(0.62, 0.15, 0.014, 0.065, 0xb81c1c);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), brass);
hub.rotation.x = Math.PI / 2;
hub.position.z = 0.075;
faceGroup.add(hub);

// ---------- pendulum ----------
const PIVOT_Y = 3.25;
const ROD_LEN = 1.85;
const pendulum = new THREE.Group();
pendulum.position.set(0, PIVOT_Y, 0.08);
clock.add(pendulum);
const rod = new THREE.Mesh(new THREE.BoxGeometry(0.04, ROD_LEN, 0.02), brass);
rod.position.y = -ROD_LEN / 2;
rod.castShadow = true;
pendulum.add(rod);
const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 40), brass);
bob.rotation.x = Math.PI / 2;
bob.position.y = -ROD_LEN;
bob.castShadow = true;
pendulum.add(bob);
const bobCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 24), mat(0x8a5a1a, 0.3, 0.8));
bobCenter.rotation.x = Math.PI / 2;
bobCenter.position.y = -ROD_LEN;
pendulum.add(bobCenter);
const pivotDot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), brass);
pivotDot.position.set(0, PIVOT_Y, 0.08);
clock.add(pivotDot);

// escapement hint: anchor above pendulum (small rocking piece)
const anchor = new THREE.Group();
anchor.position.set(0, PIVOT_Y + 0.0, 0.08);
clock.add(anchor);

// ---------- weights ----------
interface Weight { body: THREE.Mesh; chain: THREE.Mesh; x: number; }
const weights: Weight[] = [];
const CHAIN_TOP = 3.25;
for (const sx of [-1, 1]) {
  const x = sx * 0.5;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 24), mat(0xc79a3c, 0.3, 0.85));
  body.castShadow = true;
  body.position.set(x, 2.5, -0.2);
  clock.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), brass);
  cap.position.y = 0.3;
  body.add(cap);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), mat(0x888070, 0.4, 0.8));
  clock.add(chain);
  weights.push({ body, chain, x });
}

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0xffd9a8, 0.55));
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3a2414, 0.5));

const key = new THREE.DirectionalLight(0xffc58a, 1.8);
key.position.set(-4, 7, 9);
key.target.position.set(0, 2.5, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -2;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
scene.add(key.target);

const warmInner = new THREE.PointLight(0xff9a40, 6, 6, 1.6);
warmInner.position.set(0, 2.4, 0.2);
clock.add(warmInner);
const faceLight = new THREE.PointLight(0xffd9a0, 5, 6, 1.8);
faceLight.position.set(0, 5.2, 2.2);
scene.add(faceLight);
const floorLight = new THREE.PointLight(0xffb060, 8, 12, 1.6);
floorLight.position.set(-2.5, 2.0, 3.5);
scene.add(floorLight);

// ---------- animation ----------
const AMP = 9 * Math.PI / 180;
function update(): void {
  const now = new Date();
  const ms = now.getTime();
  const tSec = ms / 1000;

  // period 2s; harmonic swing => slowest at the extremes; extremes on the whole second
  pendulum.rotation.z = -AMP * Math.cos(Math.PI * tSec);

  // hands
  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;
  secondHand.rotation.z = -(s / 60) * Math.PI * 2; // discrete tick each second
  minuteHand.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
  hourHand.rotation.z = -((h + m / 60 + s / 3600) / 12) * Math.PI * 2;

  // weights sink very slowly
  const drop = (tSec * 0.012) % 1.0;
  for (const w of weights) {
    const top = 2.9 - drop; // top of the weight body
    w.body.position.y = top - 0.275;
    const len = CHAIN_TOP - top;
    w.chain.scale.y = len;
    w.chain.position.set(w.x, CHAIN_TOP - len / 2, -0.2);
  }
}

let first = true;
function frame(): void {
  update();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

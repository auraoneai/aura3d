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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a110a);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 4.3, 11.8);
camera.lookAt(0, 3.45, 0);

// ---------- textures ----------
function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// deterministic pseudo random
let seed = 12345;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const woodTex = makeCanvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#6a3a1c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256;
    const w = 1 + rnd() * 3;
    const l = Math.floor(40 + rnd() * 60);
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? '40,18,6' : '130,80,42'},${0.1 + rnd() * 0.2})`;
    ctx.fillRect(x, 0, w, 256);
    void l;
  }
});

const floorTex = makeCanvasTexture(
  512,
  512,
  (ctx) => {
    const plankW = 64;
    for (let i = 0; i < 8; i++) {
      const shade = 90 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgb(${shade + 40},${shade},${Math.floor(shade * 0.55)})`;
      ctx.fillRect(i * plankW, 0, plankW, 512);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(40,20,8,${0.05 + rnd() * 0.1})`;
        ctx.fillRect(i * plankW + rnd() * plankW, 0, 1 + rnd() * 2, 512);
      }
      ctx.fillStyle = 'rgba(20,10,4,0.8)';
      ctx.fillRect(i * plankW, 0, 2, 512);
    }
  },
  3,
  2,
);

const wallTex = makeCanvasTexture(
  256,
  256,
  (ctx) => {
    ctx.fillStyle = '#7d5a45';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(60,30,20,0.25)';
    for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 256);
    ctx.fillStyle = 'rgba(255,220,180,0.06)';
    for (let i = 0; i < 300; i++) ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  },
  8,
  3,
);

// ---------- materials ----------
const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.05 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a2611, roughness: 0.6 });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.9, emissive: 0x25130a });
const brass = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.9 });
const faceMat = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.8 });
const inkMat = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.6 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xb01c1c, roughness: 0.5 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xfff1d8,
  transparent: true,
  opacity: 0.12,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  parent: THREE.Object3D,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- room ----------
const WALL_Z = -0.7;
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 16),
  new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
);
wall.position.set(0, 8, WALL_Z);
wall.receiveShadow = true;
scene.add(wall);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 30),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, WALL_Z + 15);
floor.receiveShadow = true;
scene.add(floor);

// baseboard
box(40, 0.35, 0.08, darkWood, 0, 0.175, WALL_Z + 0.04, scene, false);

// ---------- clock case ----------
const clock = new THREE.Group();
scene.add(clock);

// plinth
box(2.3, 0.35, 1.2, wood, 0, 0.175, 0.05, clock);
box(2.1, 0.3, 1.1, wood, 0, 0.5, 0.05, clock);

// trunk (y 0.65 .. 4.4)
const TRUNK_BOT = 0.65;
const TRUNK_TOP = 4.4;
const TRUNK_H = TRUNK_TOP - TRUNK_BOT;
const TRUNK_MID = (TRUNK_TOP + TRUNK_BOT) / 2;
const TW = 1.8;
const TD = 1.0;
box(TW, TRUNK_H, 0.06, interiorMat, 0, TRUNK_MID, -0.47, clock); // back panel
box(0.1, TRUNK_H, TD, wood, -TW / 2 + 0.05, TRUNK_MID, 0, clock); // sides
box(0.1, TRUNK_H, TD, wood, TW / 2 - 0.05, TRUNK_MID, 0, clock);
// front frame around opening (opening x +-0.7, y 0.95 .. 4.2)
const OP_BOT = 0.95;
const OP_TOP = 4.2;
box(TW, OP_BOT - TRUNK_BOT, 0.1, wood, 0, (OP_BOT + TRUNK_BOT) / 2, 0.45, clock);
box(TW, TRUNK_TOP - OP_TOP, 0.1, wood, 0, (TRUNK_TOP + OP_TOP) / 2, 0.45, clock);
box(0.2, OP_TOP - OP_BOT, 0.1, wood, -0.8, (OP_TOP + OP_BOT) / 2, 0.45, clock);
box(0.2, OP_TOP - OP_BOT, 0.1, wood, 0.8, (OP_TOP + OP_BOT) / 2, 0.45, clock);
// inner brass trim
box(1.46, 0.03, 0.03, brass, 0, OP_BOT + 0.015, 0.51, clock, false);
box(1.46, 0.03, 0.03, brass, 0, OP_TOP - 0.015, 0.51, clock, false);
box(0.03, OP_TOP - OP_BOT, 0.03, brass, -0.715, (OP_TOP + OP_BOT) / 2, 0.51, clock, false);
box(0.03, OP_TOP - OP_BOT, 0.03, brass, 0.715, (OP_TOP + OP_BOT) / 2, 0.51, clock, false);
// glass
const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, OP_TOP - OP_BOT), glassMat);
glass.position.set(0, (OP_TOP + OP_BOT) / 2, 0.49);
glass.renderOrder = 10;
clock.add(glass);
// floor of the interior
box(1.6, 0.04, 0.9, interiorMat, 0, OP_BOT - 0.02, 0, clock, false);

// hood (y 4.4 .. 6.6)
const HOOD_BOT = 4.4;
const HOOD_H = 2.2;
const HOOD_Y = HOOD_BOT + HOOD_H / 2;
const HOOD_Z = 0.05;
box(2.2, HOOD_H, 1.1, wood, 0, HOOD_Y, HOOD_Z, clock);
box(2.4, 0.12, 1.25, wood, 0, HOOD_BOT, HOOD_Z, clock); // lower moulding
box(2.4, 0.15, 1.25, wood, 0, HOOD_BOT + HOOD_H, HOOD_Z, clock); // upper moulding
box(2.1, 0.18, 1.15, darkWood, 0, HOOD_BOT + HOOD_H + 0.16, HOOD_Z, clock);
box(1.5, 0.18, 1.0, wood, 0, HOOD_BOT + HOOD_H + 0.34, HOOD_Z, clock);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), brass);
finial.position.set(0, HOOD_BOT + HOOD_H + 0.55, HOOD_Z);
finial.castShadow = true;
clock.add(finial);

// ---------- face ----------
const FACE_Z = HOOD_Z + 0.55;
const FACE_Y = 5.5;
const faceGroup = new THREE.Group();
faceGroup.position.set(0, FACE_Y, FACE_Z);
clock.add(faceGroup);

const faceDisc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 64), faceMat);
faceDisc.position.z = 0.005;
faceDisc.receiveShadow = true;
faceGroup.add(faceDisc);

const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 12, 64), brass);
bezel.position.z = 0.02;
bezel.castShadow = true;
faceGroup.add(bezel);

for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6;
  const major = i % 3 === 0;
  const mark = new THREE.Mesh(new THREE.BoxGeometry(major ? 0.07 : 0.045, major ? 0.2 : 0.13, 0.02), inkMat);
  const r = 0.7;
  mark.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.02);
  mark.rotation.z = -a;
  faceGroup.add(mark);
}
// minute dots
for (let i = 0; i < 60; i++) {
  if (i % 5 === 0) continue;
  const a = (i * Math.PI) / 30;
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.01), inkMat);
  dot.position.set(Math.sin(a) * 0.78, Math.cos(a) * 0.78, 0.012);
  dot.rotation.z = -a;
  faceGroup.add(dot);
}

function makeHand(length: number, width: number, tail: number, mat: THREE.Material, z: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(width, length + tail, 0.015);
  geo.translate(0, (length - tail) / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  g.add(m);
  g.position.z = z;
  faceGroup.add(g);
  return g;
}
const hourHand = makeHand(0.4, 0.07, 0.08, inkMat, 0.04);
const minuteHand = makeHand(0.62, 0.045, 0.1, inkMat, 0.06);
const secondHand = makeHand(0.7, 0.014, 0.16, redMat, 0.08);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20), brass);
hub.rotation.x = Math.PI / 2;
hub.position.z = 0.09;
faceGroup.add(hub);

// ---------- movement: pendulum, escapement, weights ----------
const PIVOT_Y = 4.25;
const ROD_LEN = 2.8;
const AMP = 0.14;

const pendulum = new THREE.Group();
pendulum.position.set(0, PIVOT_Y, 0.15);
clock.add(pendulum);
const rodGeo = new THREE.BoxGeometry(0.04, ROD_LEN, 0.02);
rodGeo.translate(0, -ROD_LEN / 2, 0);
const rod = new THREE.Mesh(rodGeo, brass);
rod.castShadow = true;
pendulum.add(rod);
const bobGroup = new THREE.Group();
bobGroup.position.y = -ROD_LEN;
pendulum.add(bobGroup);
const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 40), brass);
bob.rotation.x = Math.PI / 2;
bob.castShadow = true;
bobGroup.add(bob);
const bobCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 32), new THREE.MeshStandardMaterial({
  color: 0xf0c060,
  roughness: 0.2,
  metalness: 1,
}));
bobCenter.rotation.x = Math.PI / 2;
bobGroup.add(bobCenter);
const pivotCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16), brass);
pivotCap.rotation.x = Math.PI / 2;
pendulum.add(pivotCap);

// escape wheel + anchor (behind the rod)
const WHEEL_Y = 3.8;
const WHEEL_Z = -0.2;
const TEETH = 15;
const wheel = new THREE.Group();
wheel.position.set(0, WHEEL_Y, WHEEL_Z);
clock.add(wheel);
const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 40), brass);
wheel.add(wheelRing);
for (let i = 0; i < TEETH; i++) {
  const a = (i * 2 * Math.PI) / TEETH;
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.02), brass);
  tooth.position.set(Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0);
  tooth.rotation.z = -a - 0.4;
  wheel.add(tooth);
}
for (let i = 0; i < 4; i++) {
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.015), brass);
  spoke.rotation.z = (i * Math.PI) / 4;
  wheel.add(spoke);
}
const anchor = new THREE.Group();
anchor.position.set(0, WHEEL_Y + 0.42, WHEEL_Z);
clock.add(anchor);
const anchorArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), brass);
anchorArm.position.y = -0.1;
anchor.add(anchorArm);
const anchorBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.02), brass);
anchorBar.position.y = -0.2;
anchor.add(anchorBar);
for (const sx of [-1, 1]) {
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.025), redMat);
  pallet.position.set(sx * 0.19, -0.23, 0);
  anchor.add(pallet);
}

// weights
const WEIGHT_H = 0.7;
const WEIGHT_START = 2.9; // centre y at start
const WEIGHT_MIN = 1.6;
const SINK_RATE = 0.01; // units per second
const weights: { weight: THREE.Mesh; cord: THREE.Mesh }[] = [];
for (const sx of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, WEIGHT_H, 24), brass);
  w.position.set(sx * 0.5, WEIGHT_START, -0.2);
  w.castShadow = true;
  clock.add(w);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  cap.position.y = WEIGHT_H / 2;
  w.add(cap);
  const cordGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
  const cord = new THREE.Mesh(cordGeo, inkMat);
  clock.add(cord);
  weights.push({ weight: w, cord });
}

// ---------- lighting ----------
scene.add(new THREE.AmbientLight(0xffd7a8, 0.35));
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3a2414, 0.4));

const key = new THREE.DirectionalLight(0xffc880, 1.6);
key.position.set(-4, 8, 8);
key.target.position.set(0, 3, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -3;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
scene.add(key.target);

const interiorLight = new THREE.PointLight(0xffa850, 3.2, 6, 1.6);
interiorLight.position.set(0, 2.9, 0.1);
scene.add(interiorLight);

const faceLight = new THREE.PointLight(0xffc27a, 2.2, 4, 1.8);
faceLight.position.set(0, 5.6, 1.8);
scene.add(faceLight);

// ---------- animation ----------
const startPerf = performance.now();
const DEG = Math.PI / 180;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function update(): void {
  const now = new Date();
  const tSec = now.getTime() / 1000;
  const elapsed = (performance.now() - startPerf) / 1000;

  // pendulum: period 2 s, sinusoidal (slowest at extremes), extremes on the whole second
  const theta = AMP * Math.cos(Math.PI * tSec);
  pendulum.rotation.z = theta;

  // escapement: wheel advances one tooth per second, anchor rocks with pendulum
  const whole = Math.floor(tSec);
  const step = smoothstep(0, 0.12, tSec - whole);
  wheel.rotation.z = -(((whole % TEETH) + step) * 2 * Math.PI) / TEETH;
  anchor.rotation.z = theta * 0.35;

  // hands (real local time); second hand ticks once per second
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  secondHand.rotation.z = -s * 6 * DEG;
  minuteHand.rotation.z = -m * 6 * DEG;
  hourHand.rotation.z = -h * 30 * DEG;

  // weights sinking slowly
  const drop = Math.min(WEIGHT_START - WEIGHT_MIN, elapsed * SINK_RATE);
  for (const [i, { weight, cord }] of weights.entries()) {
    const y = WEIGHT_START - drop * (i === 0 ? 1 : 0.8);
    weight.position.y = y;
    const top = y + WEIGHT_H / 2;
    const len = HOOD_BOT - top;
    cord.scale.y = len;
    cord.position.set(weight.position.x, top + len / 2, weight.position.z);
  }
}

function frame(): void {
  update();
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

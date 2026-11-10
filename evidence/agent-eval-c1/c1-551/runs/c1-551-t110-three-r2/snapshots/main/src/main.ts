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
scene.background = new THREE.Color(0x1a120c);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(0, 3.9, 12.5);
camera.lookAt(0, 3.1, 0);

// ---------- materials ----------
const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.55, metalness: 0.05 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.7 });
const innerWood = new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.9 });
const faceMat = new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.8 });
const ink = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.5 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xaa1e14, roughness: 0.4 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xcfe6ff,
  transparent: true,
  opacity: 0.12,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- room ----------
const floorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 4);
floor.receiveShadow = true;
scene.add(floor);
// floor planks
for (let i = -7; i <= 7; i++) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 20), new THREE.MeshStandardMaterial({ color: 0x4a2c15, roughness: 0.8 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(i * 1.9, 0.002, 4);
  scene.add(line);
}

const wallMat = new THREE.MeshStandardMaterial({ color: 0xb08d62, roughness: 0.95 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
wall.position.set(0, 7, -0.8);
wall.receiveShadow = true;
scene.add(wall);
box(30, 0.4, 0.1, darkWood, 0, 0.2, -0.75); // baseboard
box(30, 0.12, 0.08, darkWood, 0, 3.0, -0.76); // chair rail

// ---------- clock case ----------
const clock = new THREE.Group();
scene.add(clock);

box(2.4, 0.5, 1.2, darkWood, 0, 0.25, 0, clock); // plinth
box(2.1, 0.12, 1.1, wood, 0, 0.56, 0, clock); // base moulding
// trunk: opening x +-0.65, y 0.95..4.05 (glass), interior hollow
const TR_BOT = 0.62;
const TR_TOP = 4.2;
const trH = TR_TOP - TR_BOT;
const trY = (TR_BOT + TR_TOP) / 2;
box(0.15, trH, 1.0, wood, -0.875, trY, 0, clock);
box(0.15, trH, 1.0, wood, 0.875, trY, 0, clock);
box(1.8, trH, 0.06, innerWood, 0, trY, -0.47, clock); // back panel
box(1.8, 0.1, 1.0, innerWood, 0, TR_BOT + 0.05, 0, clock); // floor of trunk
// front frame
box(1.8, 0.33, 0.1, wood, 0, 0.62 + 0.165, 0.45, clock);
box(1.8, 0.15, 0.1, wood, 0, 4.125, 0.45, clock);
box(0.2, 3.0, 0.1, wood, -0.8, 2.45, 0.45, clock);
box(0.2, 3.0, 0.1, wood, 0.8, 2.45, 0.45, clock);
// glass
const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.9), glassMat);
glass.position.set(0, 2.45, 0.43);
glass.renderOrder = 10;
clock.add(glass);
// brass trim around glass
box(1.44, 0.03, 0.03, brass, 0, 3.92, 0.5, clock);
box(1.44, 0.03, 0.03, brass, 0, 0.98, 0.5, clock);
box(0.03, 2.97, 0.03, brass, -0.72, 2.45, 0.5, clock);
box(0.03, 2.97, 0.03, brass, 0.72, 2.45, 0.5, clock);

// hood
box(2.2, 1.8, 1.1, wood, 0, 5.1, 0, clock);
box(2.4, 0.15, 1.2, darkWood, 0, 4.28, 0, clock);
box(2.4, 0.18, 1.2, darkWood, 0, 6.09, 0, clock);
box(2.0, 0.2, 1.0, wood, 0, 6.28, 0, clock);
box(1.2, 0.2, 0.9, darkWood, 0, 6.48, 0, clock);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), brass);
finial.position.set(0, 6.68, 0);
finial.castShadow = true;
clock.add(finial);

// ---------- dial ----------
const FACE_Z = 0.56;
const FACE_Y = 5.1;
const dial = new THREE.Group();
dial.position.set(0, FACE_Y, FACE_Z);
clock.add(dial);

const faceDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.02, 64), faceMat);
faceDisc.rotation.x = Math.PI / 2;
faceDisc.receiveShadow = true;
dial.add(faceDisc);
const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.045, 12, 64), brass);
bezel.castShadow = true;
dial.add(bezel);

for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const w = major ? 0.07 : 0.045;
  const h = major ? 0.17 : 0.12;
  const r = 0.78 - 0.08 - h / 2;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), ink);
  m.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.015);
  m.rotation.z = -a;
  dial.add(m);
}

function makeHand(length: number, width: number, tail: number, mat: THREE.Material, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.z = z;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, length + tail, 0.015), mat);
  body.position.y = (length - tail) / 2;
  body.castShadow = true;
  g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 1.1, width * 3, 4), mat);
  tip.position.y = length + width * 1.2;
  tip.castShadow = true;
  g.add(tip);
  dial.add(g);
  return g;
}
const hourHand = makeHand(0.35, 0.05, 0.06, ink, 0.025);
const minuteHand = makeHand(0.55, 0.035, 0.08, ink, 0.045);
const secondHand = makeHand(0.6, 0.015, 0.14, redMat, 0.065);
const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20), brass);
cap.rotation.x = Math.PI / 2;
cap.position.z = 0.08;
dial.add(cap);

// ---------- escapement (visible at top of the trunk) ----------
const PIVOT_Y = 3.98;
const escape = new THREE.Group();
escape.position.set(0, 3.55, 0.12);
clock.add(escape);
const TEETH = 20;
const wheelDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24), brass);
wheelDisc.rotation.x = Math.PI / 2;
escape.add(wheelDisc);
for (let i = 0; i < TEETH; i++) {
  const a = (i / TEETH) * Math.PI * 2;
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.02), brass);
  t.position.set(Math.sin(a) * 0.2, Math.cos(a) * 0.2, 0);
  t.rotation.z = -a - 0.4;
  escape.add(t);
}
// spokes
for (let i = 0; i < 3; i++) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.025), innerWood);
  s.rotation.z = (i * Math.PI) / 3;
  escape.add(s);
}

// anchor rocks with the pendulum
const anchor = new THREE.Group();
anchor.position.set(0, PIVOT_Y, 0.2);
clock.add(anchor);
{
  const armL = box(0.025, 0.4, 0.02, brass, -0.12, -0.18, 0, anchor);
  armL.rotation.z = -0.35;
  const armR = box(0.025, 0.4, 0.02, brass, 0.12, -0.18, 0, anchor);
  armR.rotation.z = 0.35;
  box(0.1, 0.04, 0.02, brass, -0.2, -0.38, 0, anchor);
  box(0.1, 0.04, 0.02, brass, 0.2, -0.38, 0, anchor);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), brass);
  pin.rotation.x = Math.PI / 2;
  anchor.add(pin);
}

// ---------- pendulum ----------
const pendulum = new THREE.Group();
pendulum.position.set(0, PIVOT_Y, 0.25);
clock.add(pendulum);
const ROD_LEN = 2.1;
box(0.03, ROD_LEN, 0.02, brass, 0, -ROD_LEN / 2, 0, pendulum);
const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 40), brass);
bob.rotation.x = Math.PI / 2;
bob.position.y = -ROD_LEN - 0.05;
bob.castShadow = true;
pendulum.add(bob);
const bobRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.015, 8, 40), new THREE.MeshStandardMaterial({ color: 0x8a5f1c, roughness: 0.4, metalness: 0.8 }));
bobRing.position.set(0, -ROD_LEN - 0.05, 0.04);
pendulum.add(bobRing);
const bobKnob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), brass);
bobKnob.position.set(0, -ROD_LEN - 0.05, 0.05);
pendulum.add(bobKnob);

// ---------- weights ----------
const WEIGHT_X = 0.5;
const WEIGHT_H = 0.5;
const WEIGHT_TOP_Y = 3.55; // initial top of weight
const weights: { mesh: THREE.Group; chain: THREE.Mesh; x: number }[] = [];
for (const x of [-WEIGHT_X, WEIGHT_X]) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, WEIGHT_H, 20), brass);
  body.castShadow = true;
  g.add(body);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.06, 20), brass);
  capTop.position.y = WEIGHT_H / 2 + 0.03;
  g.add(capTop);
  g.position.set(x, WEIGHT_TOP_Y - WEIGHT_H / 2, -0.25);
  clock.add(g);
  const chain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.4 })
  );
  clock.add(chain);
  weights.push({ mesh: g, chain, x });
}
const CHAIN_TOP = TR_TOP - 0.05;

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3a2410, 0.55));

const key = new THREE.SpotLight(0xffc27a, 120, 40, Math.PI / 5, 0.6, 1.6);
key.position.set(-4, 9, 8);
key.target.position.set(0, 3, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0004;
scene.add(key, key.target);

const fill = new THREE.PointLight(0xff9a4a, 25, 20, 1.8);
fill.position.set(4, 2.5, 5);
scene.add(fill);

// warm interior light
const interior = new THREE.PointLight(0xffb060, 6, 5, 1.8);
interior.position.set(0, 2.8, 0.2);
clock.add(interior);

// ---------- animation ----------
const startMs = Date.now();
const AMP = 0.22; // rad
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
let first = true;

function frame(): void {
  const now = new Date();
  const ms = now.getTime();
  const ts = ms / 1000;

  // pendulum: period 2 s, sinusoidal (slowest at extremes)
  const theta = AMP * Math.sin(Math.PI * ts);
  pendulum.rotation.z = theta;
  anchor.rotation.z = -theta * 0.35;

  // escape wheel: one tooth step per second, snapping quickly
  const secInt = Math.floor(ts);
  const frac = ts - secInt;
  const step = (secInt % TEETH) + easeOut(Math.min(frac / 0.12, 1));
  escape.rotation.z = -step * ((Math.PI * 2) / TEETH);

  // hands
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  secondHand.rotation.z = -(s / 60) * Math.PI * 2; // discrete tick each second
  minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
  hourHand.rotation.z = -(h / 12) * Math.PI * 2;

  // weights sink very slowly
  const elapsed = (ms - startMs) / 1000;
  const drop = Math.min(elapsed * 0.004, 0.9);
  for (const w of weights) {
    const topY = WEIGHT_TOP_Y - drop;
    w.mesh.position.y = topY - WEIGHT_H / 2;
    const len = CHAIN_TOP - (topY + 0.06);
    w.chain.scale.y = len;
    w.chain.position.set(w.x, topY + 0.06 + len / 2, -0.25);
  }

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

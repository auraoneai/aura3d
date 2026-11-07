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
renderer.setClearColor(0x1a120c);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 3.7, 11.5);
camera.lookAt(0, 3.15, 0);

// ---------- materials ----------
const wood = new THREE.MeshStandardMaterial({ color: 0x7a4022, roughness: 0.55, metalness: 0.05 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x55290f, roughness: 0.5, metalness: 0.05 });
const brass = new THREE.MeshStandardMaterial({ color: 0xd9a638, roughness: 0.3, metalness: 0.85 });
const ivory = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.8 });
const ink = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.6 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.9 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff2d8,
  roughness: 0.05,
  metalness: 0,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
});

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------- room ----------
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 20),
  new THREE.MeshStandardMaterial({ color: 0xc9a77c, roughness: 0.95 }),
);
wall.position.set(0, 10, -0.7);
scene.add(wall);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// floor boards
for (let i = -10; i <= 10; i++) {
  box(0.03, 0.002, 40, ink, i * 1.2, 0.002, 5);
}

// skirting board
box(40, 0.35, 0.08, darkWood, 0, 0.175, -0.66);

// ---------- clock case ----------
const clock = new THREE.Group();
scene.add(clock);

// plinth
box(2.6, 0.8, 1.4, wood, 0, 0.4, 0, clock);
box(2.8, 0.12, 1.5, darkWood, 0, 0.06, 0, clock);
box(2.7, 0.1, 1.45, darkWood, 0, 0.85, 0, clock);

// trunk (y 0.8 .. 4.0)
box(0.3, 3.2, 1.2, wood, -1.0, 2.4, 0, clock); // left side
box(0.3, 3.2, 1.2, wood, 1.0, 2.4, 0, clock); // right side
box(1.7, 3.2, 0.1, interiorMat, 0, 2.4, -0.55, clock); // back panel
box(1.7, 0.4, 1.2, wood, 0, 1.0, 0, clock); // bottom block
box(1.7, 0.2, 0.15, wood, 0, 3.9, 0.52, clock); // top front rail
box(1.7, 0.2, 1.0, darkWood, 0, 3.9, -0.05, clock); // ceiling of the opening
box(1.7, 0.05, 0.08, brass, 0, 1.22, 0.58, clock); // bottom brass trim
// inner frame around glass
box(0.06, 2.6, 0.06, brass, -0.8, 2.5, 0.6, clock);
box(0.06, 2.6, 0.06, brass, 0.8, 2.5, 0.6, clock);
box(1.66, 0.06, 0.06, brass, 0, 3.8, 0.6, clock);

// glass
const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), glassMat);
glass.position.set(0, 2.5, 0.57);
glass.renderOrder = 5;
clock.add(glass);
const streakShape = new THREE.Shape();
streakShape.moveTo(-0.6, 1.2);
streakShape.lineTo(-0.3, 1.2);
streakShape.lineTo(0.5, -1.2);
streakShape.lineTo(0.2, -1.2);
const streak = new THREE.Mesh(
  new THREE.ShapeGeometry(streakShape),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false }),
);
streak.position.set(0, 2.5, 0.575);
streak.renderOrder = 6;
clock.add(streak);

// head / hood (y 4.0 .. 6.0)
box(2.5, 2.0, 1.3, wood, 0, 5.0, 0, clock);
box(2.8, 0.18, 1.5, darkWood, 0, 4.0, 0, clock);
box(2.8, 0.25, 1.5, darkWood, 0, 6.05, 0, clock);
box(2.6, 0.12, 1.4, wood, 0, 6.24, 0, clock);
// pediment
const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.25, 24), brass);
ped.position.set(0, 6.45, 0);
clock.add(ped);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), brass);
finial.position.set(0, 6.7, 0);
clock.add(finial);
// head side pillars
for (const sx of [-1, 1]) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 16), brass);
  p.position.set(sx * 1.2, 5.0, 0.62);
  clock.add(p);
}

// ---------- dial ----------
const dialY = 5.0;
const dialFrontZ = 0.68;
const dial = new THREE.Group();
dial.position.set(0, dialY, 0);
clock.add(dial);

const faceGeom = new THREE.CylinderGeometry(0.88, 0.88, 0.04, 48);
faceGeom.rotateX(Math.PI / 2);
const face = new THREE.Mesh(faceGeom, ivory);
face.position.z = dialFrontZ - 0.02;
dial.add(face);

const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 12, 64), brass);
bezel.position.z = dialFrontZ;
dial.add(bezel);

for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const r = major ? 0.7 : 0.72;
  const mark = box(major ? 0.07 : 0.045, major ? 0.2 : 0.14, 0.02, ink, Math.sin(a) * r, Math.cos(a) * r, dialFrontZ + 0.01, dial);
  mark.rotation.z = -a;
}

function makeHand(length: number, tail: number, width: number, mat: THREE.Material, z: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, length + tail, 0.015), mat);
  m.position.y = (length - tail) / 2;
  g.add(m);
  g.position.z = z;
  dial.add(g);
  return g;
}

const hourHand = makeHand(0.42, 0.08, 0.07, ink, dialFrontZ + 0.03);
const minuteHand = makeHand(0.65, 0.1, 0.045, ink, dialFrontZ + 0.05);
const secondHand = makeHand(0.72, 0.18, 0.015, redMat, dialFrontZ + 0.07);
const hub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), brass);
hub.position.z = dialFrontZ + 0.08;
dial.add(hub);

// ---------- pendulum ----------
const pivotY = 3.78;
const rodLen = 2.1;
const pendulum = new THREE.Group();
pendulum.position.set(0, pivotY, 0.15);
clock.add(pendulum);

const rod = new THREE.Mesh(new THREE.BoxGeometry(0.035, rodLen, 0.02), brass);
rod.position.y = -rodLen / 2;
pendulum.add(rod);

const bobGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 40);
bobGeom.rotateX(Math.PI / 2);
const bob = new THREE.Mesh(bobGeom, brass);
bob.position.y = -rodLen - 0.05;
pendulum.add(bob);
const bobRingGeom = new THREE.TorusGeometry(0.2, 0.025, 8, 32);
const bobRing = new THREE.Mesh(bobRingGeom, wood);
bobRing.position.set(0, -rodLen - 0.05, 0.045);
pendulum.add(bobRing);
const bobCap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), brass);
bobCap.position.set(0, -rodLen - 0.05, 0.05);
pendulum.add(bobCap);

const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), brass);
pivot.position.set(0, pivotY, 0.15);
clock.add(pivot);

// ---------- weights ----------
interface Weight {
  body: THREE.Mesh;
  chain: THREE.Mesh;
}
const weightTopStart = 3.4;
const weightH = 0.75;
const chainTop = 3.8;
const weights: Weight[] = [];
for (const sx of [-0.52, 0.52]) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, weightH, 20), brass);
  body.position.set(sx, 0, -0.25);
  clock.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), brass);
  cap.position.y = weightH / 2 + 0.05;
  body.add(cap);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.02), darkWood);
  chain.position.set(sx, 0, -0.25);
  clock.add(chain);
  weights.push({ body, chain });
}

function updateWeights(elapsed: number): void {
  const sink = Math.min(elapsed * 0.02, 1.6); // units per second, very slow
  const topY = weightTopStart - sink;
  for (const w of weights) {
    w.body.position.y = topY - weightH / 2;
    const len = chainTop - (topY + 0.1);
    w.chain.scale.y = len;
    w.chain.position.y = (chainTop + topY + 0.1) / 2;
  }
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x5a3a22, 1.6));

const key = new THREE.PointLight(0xffc27a, 160, 0, 2);
key.position.set(2.5, 6.5, 6.5);
scene.add(key);

const fill = new THREE.DirectionalLight(0xffd9a8, 0.8);
fill.position.set(-4, 4, 8);
scene.add(fill);

const inner = new THREE.PointLight(0xff9a3c, 8, 0, 2);
inner.position.set(0, 3.2, 0.1);
clock.add(inner);

const dialLight = new THREE.PointLight(0xffd29a, 6, 0, 2);
dialLight.position.set(0, 5.4, 2.0);
clock.add(dialLight);

// ---------- animation ----------
const amplitude = 0.17; // radians
const startMs = Date.now();
let first = true;

function frame(): void {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const t = nowMs / 1000;

  // pendulum: period 2 s, sinusoidal (slowest at the extremes), crosses center on whole seconds
  pendulum.rotation.z = amplitude * Math.sin(Math.PI * t);

  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;
  secondHand.rotation.z = -(sec / 60) * Math.PI * 2; // discrete tick each second
  minuteHand.rotation.z = -((min + sec / 60) / 60) * Math.PI * 2;
  hourHand.rotation.z = -((hr + min / 60 + sec / 3600) / 12) * Math.PI * 2;

  updateWeights((nowMs - startMs) / 1000);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

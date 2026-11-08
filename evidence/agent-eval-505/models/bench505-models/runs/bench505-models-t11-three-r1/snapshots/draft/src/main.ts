import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

// ---------- helpers ----------
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
const rr = (a: number, b: number): number => a + (b - a) * rnd();

function makeWoodTexture(vertical: boolean): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#c4986a';
  ctx.fillRect(0, 0, size, size);
  if (vertical) {
    ctx.translate(size, 0);
    ctx.rotate(Math.PI / 2);
  }
  for (let i = 0; i < 160; i++) {
    const y = rnd() * size;
    const dark = rnd() < 0.6;
    ctx.strokeStyle = dark
      ? `rgba(60,35,15,${0.05 + rnd() * 0.22})`
      : `rgba(240,205,150,${0.05 + rnd() * 0.15})`;
    ctx.lineWidth = 0.6 + rnd() * 2.4;
    ctx.beginPath();
    const ph = rnd() * 6;
    const amp = 0.5 + rnd() * 2;
    for (let x = 0; x <= size; x += 16) {
      const yy = y + Math.sin(x * 0.03 + ph) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = rnd() * size;
    const y = rnd() * size;
    for (let r = 3; r > 0; r--) {
      ctx.strokeStyle = `rgba(50,28,10,${0.18 + 0.1 * r})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 4 + 2, r * 1.8 + 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeDirtTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 6 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    g.addColorStop(0, dark ? 'rgba(70,48,28,0.30)' : 'rgba(170,138,100,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5000; i++) {
    const v = rnd();
    ctx.fillStyle =
      v < 0.5 ? `rgba(50,35,20,${rnd() * 0.5})` : `rgba(200,170,130,${rnd() * 0.4})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.anisotropy = 4;
  return t;
}

function makeBurlapTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#c9ae78';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 3) {
    ctx.fillStyle = `rgba(90,65,30,${0.12 + rnd() * 0.15})`;
    ctx.fillRect(i, 0, 1, size);
    ctx.fillStyle = `rgba(90,65,30,${0.12 + rnd() * 0.15})`;
    ctx.fillRect(0, i, size, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

const woodH = makeWoodTexture(false);
const woodV = makeWoodTexture(true);
const burlapTex = makeBurlapTexture();

function woodMat(tint: number, vertical = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: vertical ? woodV : woodH,
    color: tint,
    roughness: 0.85,
    metalness: 0,
  });
}

const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.85 });

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xe8d2a6);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 14, 34);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);

const hemi = new THREE.HemisphereLight(0xfff0d6, 0x6b5236, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
sun.position.set(3.5, 6, 4);
sun.target.position.set(-0.4, 0.5, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -4.5;
sc.right = 4.5;
sc.top = 4.5;
sc.bottom = -4.5;
sc.near = 1;
sc.far = 20;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- ground ----------
function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.7 - 0.4) * 0.5 +
    Math.sin(x * 2.3 + z * 1.7) * 0.25 +
    Math.sin(z * 3.1 - x * 1.1) * 0.15
  );
}
{
  const g = new THREE.PlaneGeometry(60, 60, 120, 120);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const d = Math.hypot(x + 0.5, z);
    const k = THREE.MathUtils.smoothstep(d, 2.8, 6);
    p.setY(i, noise2(x, z) * 0.1 * k);
  }
  g.computeVertexNormals();
  const ground = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ map: makeDirtTexture(), roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
}

// stones
function addStone(x: number, z: number, s: number, tone: number): void {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const off = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const f = 1 + 0.18 * Math.sin(vx * 4 + off) * Math.cos(vz * 3 + off * 1.7) + 0.08 * Math.sin(vy * 5 + off);
    p.setXYZ(i, vx * f, vy * f, vz * f);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95, flatShading: true }),
  );
  m.scale.set(s, s * 0.6, s * rr(0.7, 1));
  m.position.set(x, s * 0.6 * 0.35, z);
  m.rotation.y = rnd() * Math.PI;
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}
addStone(1.9, 1.7, 0.22, 0x8d8780);
addStone(2.3, 1.4, 0.12, 0x9a948b);
addStone(-3.0, -1.2, 0.3, 0x7d7871);
addStone(-3.3, -0.8, 0.14, 0x948d84);
addStone(1.3, -1.9, 0.17, 0x857f77);
addStone(-1.2, 2.3, 0.2, 0x8f8a82);
addStone(2.8, -0.7, 0.13, 0x7f7a73);
addStone(-2.2, -2.6, 0.25, 0x8a847c);
addStone(0.4, 1.75, 0.09, 0x9b958c);
addStone(-0.3, -1.9, 0.1, 0x7a756e);

// ---------- cart ----------
const cart = new THREE.Group();
scene.add(cart);

let plankCount = 0;
const WOOD_TINTS = [0xffffff, 0xf0dcc0, 0xd9bd98, 0xe8c9a0, 0xc9a77c, 0xf5e4cc];
const tint = (): number => WOOD_TINTS[Math.floor(rnd() * WOOD_TINTS.length)];

function box(
  parent: THREE.Object3D,
  sx: number,
  sy: number,
  sz: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function beamBetween(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  d: number,
  mat: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

function plank(
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  vertical = false,
): THREE.Mesh {
  const m = box(cart, sx + rr(-0.03, 0.03) * (sx > sz ? 1 : 0), sy, sz, woodMat(tint(), vertical), x, y, z);
  m.rotation.y = rr(-0.012, 0.012);
  m.rotation.z = rr(-0.006, 0.006);
  m.rotation.x = rr(-0.006, 0.006);
  m.position.y += rr(-0.003, 0.003);
  if (sz > sx) m.scale.z = 1 + rr(-0.015, 0.015);
  plankCount++;
  return m;
}

const FLOOR_Y = 0.8; // centre of the floor planks
const FLOOR_TOP = FLOOR_Y + 0.02;
const AXLE_Y = 0.635;

// floor: 8 planks along X
for (let i = 0; i < 8; i++) {
  const w = 0.135;
  plank(1.94, 0.04, w, 0, FLOOR_Y, -0.5 + i * 0.1425 + 0.0, false);
}
// side planks (3 per side) and end planks (3 per end)
for (const s of [-1, 1]) {
  for (let k = 0; k < 3; k++) {
    plank(1.9, 0.14, 0.04, 0, FLOOR_TOP + 0.075 + k * 0.15, s * 0.55);
    plank(0.04, 0.14, 1.04, s * 0.93, FLOOR_TOP + 0.075 + k * 0.15, 0, false);
  }
}
// ends: long axis is z, so fix the random length variation by scaling
// (done below by geometry design: size uses sz = 1.04)

// corner posts
const postMat = woodMat(0xd2b088, true);
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    box(cart, 0.08, 0.58, 0.08, postMat, sx * 0.97, 0.78 + 0.29 + 0.01, sz * 0.585);
  }
}
// cross rails: two per side, outside of posts
const railMat = woodMat(0xc8a47a);
for (const sz of [-1, 1]) {
  for (const y of [0.97, 1.22]) {
    box(cart, 2.08, 0.05, 0.04, railMat, 0, y, sz * 0.645);
  }
  // rails at the ends too (inside-facing frame between posts on end sides)
}
for (const sx of [-1, 1]) {
  for (const y of [0.97, 1.22]) {
    box(cart, 0.04, 0.05, 1.22, railMat, sx * 1.01, y, 0);
  }
}

// bearers / handles: long beams from front to rear
const handleMat = woodMat(0xd7b88e);
const front = 1.15;
const rear = -2.25;
const slope = 0.05;
const pivotY = 0.7;
for (const s of [-1, 1]) {
  const a = new THREE.Vector3(front, pivotY - front * slope, s * 0.38);
  const b = new THREE.Vector3(rear, pivotY - rear * slope, s * 0.38);
  // beamBetween makes the box's long side run along Y, with w/d the cross-section
  beamBetween(cart, a, b, 0.07, 0.065, handleMat);
  // rounded grip at the rear end
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 14), woodMat(0xb88d5e, true));
  grip.position.set(rear + 0.25, pivotY - (rear + 0.25) * slope, s * 0.38);
  grip.rotation.z = Math.PI / 2 - slope;
  cart.add(grip);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), woodMat(0xb88d5e));
  cap.position.set(rear, pivotY - rear * slope, s * 0.38);
  cart.add(cap);
  // iron straps lashing handle to bed
  for (const bx of [-0.6, 0.6]) {
    const sy = pivotY - bx * slope;
    box(cart, 0.07, 0.11, 0.095, ironMat, bx, sy + 0.01, s * 0.38);
  }
  // front prop legs
  const top = new THREE.Vector3(1.08, pivotY - 1.08 * slope - 0.02, s * 0.38);
  const bot = new THREE.Vector3(1.3, 0.035, s * 0.38);
  beamBetween(cart, top, bot, 0.07, 0.07, woodMat(0xcaa578, true));
  box(cart, 0.1, 0.03, 0.1, ironMat, 1.3, 0.02, s * 0.38); // iron shoe
}
// leg cross-brace
{
  const m = box(cart, 0.05, 0.05, 0.76, woodMat(0xc09a6c), 1.2, 0.33, 0);
  m.rotation.z = 0.02;
}
// handle cross-bar and tie
box(cart, 0.05, 0.05, 0.76, woodMat(0xc09a6c), -1.5, pivotY + 1.5 * slope, 0);

// axle + blocks
const axleMat = woodMat(0x9d7a52, false);
{
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.95, 16), axleMat);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, AXLE_Y, 0);
  cart.add(axle);
  for (const s of [-1, 1]) {
    box(cart, 0.2, 0.15, 0.14, woodMat(0xb98f60), 0, AXLE_Y + 0.05, s * 0.38);
    // linch pin + washer
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), ironMat);
    washer.rotation.x = Math.PI / 2;
    washer.position.set(0, AXLE_Y, s * 0.945);
    cart.add(washer);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), ironMat);
    pin.position.set(0, AXLE_Y, s * 0.96);
    cart.add(pin);
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), ironMat);
    pinHead.position.set(0, AXLE_Y + 0.07, s * 0.96);
    cart.add(pinHead);
  }
}

// iron straps on the end planks (vertical) and bolts
{
  const boltGeo = new THREE.SphereGeometry(0.018, 8, 6);
  const addBolt = (x: number, y: number, z: number): void => {
    const b = new THREE.Mesh(boltGeo, ironMat);
    b.position.set(x, y, z);
    cart.add(b);
  };
  for (const s of [-1, 1]) {
    for (const x of [-0.7, 0, 0.7]) {
      box(cart, 0.07, 0.5, 0.012, ironMat, x, FLOOR_TOP + 0.24, s * 0.575);
      for (const y of [0.1, 0.24, 0.38]) addBolt(x, FLOOR_TOP + y, s * 0.583);
    }
  }
  for (const s of [-1, 1]) {
    for (const z of [-0.3, 0.3]) {
      box(cart, 0.012, 0.5, 0.07, ironMat, s * 0.955, FLOOR_TOP + 0.24, z);
      for (const y of [0.1, 0.24, 0.38]) addBolt(s * 0.963, FLOOR_TOP + y, z);
    }
  }
  // corner strap bolts on posts and rail joins
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0.97, 1.22]) addBolt(sx * 0.97, y, sz * 0.668);
    }
  }
}

// ---------- wheels ----------
const wheels: THREE.Group[] = [];
let spokeCount = 0;
const SPOKES = 12;
function makeWheel(): THREE.Group {
  const w = new THREE.Group();
  const wood = woodMat(0xcaa273);
  // wooden rim (felloe) and iron tyre
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.05, 10, 48), wood);
  rim.scale.z = 1.6;
  w.add(rim);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 8, 64), ironMat);
  tyre.scale.z = 1.9;
  w.add(tyre);
  // hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 20), woodMat(0xb68b5c, true));
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  const hubMid = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.12, 20), woodMat(0xb68b5c, true));
  hubMid.rotation.x = Math.PI / 2;
  w.add(hubMid);
  // iron bands on the hub
  for (const z of [-0.125, 0.125, -0.07, 0.07]) {
    const r = Math.abs(z) > 0.1 ? 0.113 : 0.138;
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 28), ironMat);
    band.position.z = z;
    w.add(band);
  }
  // spokes
  for (let i = 0; i < SPOKES; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / SPOKES) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.045), woodMat(tint(), true));
    sp.position.y = 0.32;
    pivot.add(sp);
    w.add(pivot);
    spokeCount++;
  }
  // rivets on tyre
  const rivetGeo = new THREE.SphereGeometry(0.02, 8, 6);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const rv = new THREE.Mesh(rivetGeo, ironMat);
    rv.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.063 * (i % 2 === 0 ? 1 : -1));
    rv.scale.set(1, 1, 0.6);
    w.add(rv);
  }
  return w;
}
for (const s of [-1, 1]) {
  const w = makeWheel();
  w.position.set(0, AXLE_Y, s * 0.82);
  cart.add(w);
  wheels.push(w);
}

// ---------- props ----------
const PROP_BASE = FLOOR_TOP;

function makeBarrel(x: number, z: number, h: number, rb: number, tone: number): void {
  const g = new THREE.Group();
  const bulge = rb * 0.16;
  const prof = (y: number): number => rb + bulge * (1 - Math.pow(y / (h / 2), 2));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const y = -h / 2 + (h * i) / 12;
    pts.push(new THREE.Vector2(prof(y), y));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), woodMat(tone, true));
  g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(rb - 0.01, rb - 0.01, 0.03, 24), woodMat(0xb08658));
  lid.position.y = h / 2 - 0.03;
  g.add(lid);
  const dark = new THREE.Mesh(
    new THREE.TorusGeometry(rb * 0.5, 0.012, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }),
  );
  dark.rotation.x = Math.PI / 2;
  dark.position.y = h / 2 - 0.012;
  g.add(dark);
  for (const f of [-0.42, -0.3, 0.3, 0.42]) {
    const y = f * h;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(prof(y) + 0.004, 0.013, 6, 28), ironMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  g.position.set(x, PROP_BASE + h / 2, z);
  g.rotation.y = rnd() * Math.PI;
  cart.add(g);
}

function makeSack(x: number, y: number, z: number, scale: number, tone: number, lying = false): THREE.Mesh {
  const prof: Array<[number, number]> = [
    [0.0, 0.0],
    [0.15, 0.005],
    [0.23, 0.07],
    [0.265, 0.2],
    [0.25, 0.33],
    [0.18, 0.42],
    [0.09, 0.47],
    [0.065, 0.5],
    [0.1, 0.53],
    [0.095, 0.58],
    [0.04, 0.6],
    [0.0, 0.59],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([r, yy]) => new THREE.Vector2(r, yy)),
    24,
  );
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const f = 1 + 0.07 * Math.sin(vx * 17 + vy * 9) * Math.cos(vz * 15 - vy * 7) * (vy < 0.45 ? 1 : 0.3);
    p.setXYZ(i, vx * f, vy, vz * f);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ map: burlapTex, color: tone, roughness: 1, metalness: 0 }),
  );
  m.scale.setScalar(scale);
  m.scale.y *= 0.92;
  if (lying) {
    m.rotation.z = Math.PI / 2;
    m.rotation.y = 0.15;
  } else {
    m.rotation.y = rnd() * Math.PI * 2;
    m.rotation.z = rr(-0.05, 0.05);
  }
  m.position.set(x, y, z);
  cart.add(m);
  // rope tie
  const tie = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.014, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x6e5030, roughness: 1 }),
  );
  tie.rotation.x = Math.PI / 2;
  tie.position.set(0, 0.495, 0);
  m.add(tie);
  return m;
}

function makeCrate(x: number, z: number, sx: number, sy: number, sz: number, baseY: number, rotY: number, tone: number): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), woodMat(tone));
  g.add(body);
  const bat = woodMat(0xb8935f, true);
  const t = 0.045;
  for (const ax of [-1, 1]) {
    for (const az of [-1, 1]) {
      box(g, t, sy + 0.012, t, bat, ax * (sx / 2 - t / 2 + 0.004), 0, az * (sz / 2 - t / 2 + 0.004));
    }
  }
  const batH = woodMat(0xb8935f, false);
  for (const ay of [-1, 1]) {
    for (const az of [-1, 1]) {
      box(g, sx + 0.012, t, t, batH, 0, ay * (sy / 2 - t / 2 + 0.004), az * (sz / 2 - t / 2 + 0.004));
    }
    for (const ax of [-1, 1]) {
      box(g, t, t, sz + 0.012, batH, ax * (sx / 2 - t / 2 + 0.004), ay * (sy / 2 - t / 2 + 0.004), 0);
    }
  }
  // diagonal brace on the two long faces
  const diag = Math.hypot(sx, sy) * 0.86;
  for (const az of [-1, 1]) {
    const d = box(g, diag, 0.04, 0.012, bat, 0, 0, az * (sz / 2 + 0.003));
    d.rotation.z = Math.atan2(sy, sx);
  }
  g.position.set(x, baseY + sy / 2, z);
  g.rotation.y = rotY;
  cart.add(g);
}

// rear row: two barrels
makeBarrel(-0.62, -0.27, 0.58, 0.2, 0xd8b88c);
makeBarrel(-0.6, 0.28, 0.5, 0.19, 0xc9a273);
// middle: two sacks with a third lying across the top
makeSack(0.02, PROP_BASE - 0.005, -0.27, 0.98, 0xffffff);
makeSack(0.08, PROP_BASE - 0.005, 0.27, 0.95, 0xe8dcc0);
makeSack(0.32, PROP_BASE + 0.55, 0.0, 0.8, 0xf2e6c8, true);
// front: crates, one stacked
makeCrate(0.66, -0.26, 0.42, 0.36, 0.42, PROP_BASE, 0.08, 0xe0c498);
makeCrate(0.64, -0.26, 0.28, 0.24, 0.3, PROP_BASE + 0.36, -0.25, 0xcfae80);
makeCrate(0.66, 0.24, 0.5, 0.3, 0.38, PROP_BASE, -0.06, 0xd9b98c);

cart.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
});

// ---------- animation ----------
const center = new THREE.Vector3(-0.45, 0.65, 0);
const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const t = clock.getElapsedTime();
  for (const w of wheels) w.rotation.z = -t * 0.5;

  const az = Math.PI - 0.75 + 0.55 * Math.sin(t * 0.18);
  const dist = 7.0;
  camera.position.set(
    center.x + Math.cos(az) * dist,
    center.y + 2.5,
    center.z + Math.sin(az) * dist,
  );
  camera.lookAt(center);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = { ready: true, wheelCount: wheels.length, spokeCount, plankCount };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

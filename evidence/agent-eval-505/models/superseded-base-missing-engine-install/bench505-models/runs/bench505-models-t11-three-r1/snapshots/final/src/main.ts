import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

// ---------- helpers ----------
let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const rr = (a: number, b: number) => a + (b - a) * rand();

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function groundHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  return (fbm(x * 0.6 + 10, z * 0.6 + 4) - 0.5) * 0.35 * smoothstep(2.6, 6, d);
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xe8d3b0);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 14, 34);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);

const hemi = new THREE.HemisphereLight(0xfff0d8, 0x6b5238, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
sun.position.set(-3.5, 6.5, 3.5);
sun.target.position.set(0, 0.6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 20;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- materials ----------
function makeGrainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#e6d8c6';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 90; i++) {
    const x = rand() * 128;
    const w = rr(0.5, 2.5);
    g.strokeStyle = `rgba(${60 + rand() * 30},${40 + rand() * 20},20,${rr(0.06, 0.22)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + rr(-6, 6), 80, x + rr(-6, 6), 170, x + rr(-4, 4), 256);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(70,45,25,0.18)';
    g.beginPath();
    g.ellipse(rand() * 128, rand() * 256, rr(2, 4), rr(5, 10), 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const grain = makeGrainTexture();

function woodMat(hex: number, jitter = 0.06): THREE.MeshStandardMaterial {
  const col = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL(hsl.h + rr(-0.012, 0.012), hsl.s, Math.min(0.9, Math.max(0.1, hsl.l + rr(-jitter, jitter))));
  return new THREE.MeshStandardMaterial({ color: col, map: grain, roughness: 0.85, metalness: 0 });
}
const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.5, metalness: 0.85 });
const darkWood = woodMat(0x5a3b22, 0.02);
const midWood = woodMat(0x8a5f3a, 0.02);

function shadow<T extends THREE.Object3D>(o: T): T {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

function box(
  parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(
  parent: THREE.Object3D, rt: number, rb: number, len: number, mat: THREE.Material,
  axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0, seg = 16,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- ground ----------
function buildGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(60, 60, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x7d5c3b);
  const dark = new THREE.Color(0x52391f);
  const light = new THREE.Color(0xa08060);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const n = fbm(x * 1.3, z * 1.3);
    const f = vnoise(x * 9, z * 9);
    c.copy(base).lerp(dark, smoothstep(0.35, 0.75, n) * 0.8);
    c.lerp(light, smoothstep(0.55, 0.9, f) * 0.35);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}
scene.add(buildGround());

function addStone(x: number, z: number, size: number, sink: number): void {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const off = rand() * 100;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.75 + 0.5 * vnoise(v.x * 1.7 + off, v.y * 1.7 + v.z * 1.3 + off);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y * 0.6, v.z);
  }
  geo.computeVertexNormals();
  const g = 0.38 + rand() * 0.15;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(g, g * 0.97, g * 0.9), roughness: 0.95, flatShading: false });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(size * rr(0.9, 1.3), size, size * rr(0.9, 1.3));
  m.rotation.y = rand() * Math.PI;
  m.position.set(x, groundHeight(x, z) + size * (0.6 - sink) * 0.6, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}
const stones: [number, number, number, number][] = [
  [1.9, 1.3, 0.2, 0.2], [-2.2, 0.9, 0.28, 0.3], [2.6, -0.8, 0.14, 0.1], [-1.6, -1.8, 0.17, 0.2],
  [0.9, 2.2, 0.12, 0.1], [-1.2, 2.0, 0.09, 0.0], [3.2, 1.8, 0.3, 0.4], [-3.0, -0.6, 0.18, 0.2],
  [1.6, -2.6, 0.22, 0.3], [-0.4, 2.8, 0.15, 0.2], [1.2, 1.9, 0.07, 0], [-2.6, 1.6, 0.08, 0],
];
for (const s of stones) addStone(s[0], s[1], s[2], s[3]);

// ---------- cart ----------
const cart = new THREE.Group();
scene.add(cart);

const AXLE_Y = 0.645;
const AXLE_Z = 0.05;
const FLOOR_TOP = 0.86;
const BED_HW = 0.6; // half width (inner)
const BED_Z0 = -0.85;
const BED_Z1 = 0.95;
const BED_LEN = BED_Z1 - BED_Z0;
const BED_ZC = (BED_Z0 + BED_Z1) / 2;

let plankCount = 0;

// floor planks
const FLOOR_N = 9;
const plankW = (BED_HW * 2) / FLOOR_N;
for (let i = 0; i < FLOOR_N; i++) {
  const len = BED_LEN + rr(-0.05, 0.05);
  const m = box(cart, plankW - 0.008, 0.04, len, woodMat(0x9a6e45, 0.08),
    -BED_HW + plankW * (i + 0.5), FLOOR_TOP - 0.02, BED_ZC + rr(-0.025, 0.025));
  m.rotation.y = rr(-0.012, 0.012);
  m.rotation.z = rr(-0.008, 0.008);
  plankCount++;
}

// frame beams / long handles (push handles run to the rear)
const HANDLE_REAR = -2.25;
const BEAM_FRONT = 1.1;
for (const sx of [-1, 1]) {
  const len = BEAM_FRONT - HANDLE_REAR;
  const beam = box(cart, 0.07, 0.08, len, woodMat(0x6e4a2c, 0.03), sx * 0.5, 0.78, (BEAM_FRONT + HANDLE_REAR) / 2);
  beam.rotation.y = sx * 0.004;
  // rounded grip at the rear end
  cyl(cart, 0.04, 0.04, 0.55, woodMat(0xa27a50, 0.03), 'z', sx * 0.5, 0.78, HANDLE_REAR + 0.275, 14);
  // iron ferrule
  cyl(cart, 0.045, 0.045, 0.04, ironMat, 'z', sx * 0.5, 0.78, HANDLE_REAR + 0.57, 14);
  // iron strap holding beam to floor
  box(cart, 0.09, 0.012, 0.06, ironMat, sx * 0.5, 0.826, 0.7);
}
// cross members under the bed
for (const z of [-0.7, 0.85]) box(cart, 1.1, 0.06, 0.08, darkWood, 0, 0.745, z);
// iron straps across the bed floor
for (const z of [-0.7, 0.8]) {
  box(cart, BED_HW * 2, 0.008, 0.05, ironMat, 0, FLOOR_TOP + 0.004, z);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) cyl(cart, 0.016, 0.016, 0.012, ironMat, 'y', x, FLOOR_TOP + 0.012, z, 8);
}

// axle
cyl(cart, 0.04, 0.04, 2.0, darkWood, 'x', 0, AXLE_Y, AXLE_Z, 14);
for (const sx of [-1, 1]) {
  box(cart, 0.12, 0.09, 0.14, darkWood, sx * 0.5, 0.7, AXLE_Z); // axle bed
  box(cart, 0.1, 0.012, 0.16, ironMat, sx * 0.5, 0.735, AXLE_Z);
}

// corner posts, rails, side boards
const POST = 0.07;
const postX = BED_HW + POST / 2;
const postZ0 = BED_Z0 - POST / 2;
const postZ1 = BED_Z1 + POST / 2;
const POST_TOP = 1.5;
const postH = POST_TOP - FLOOR_TOP;
const postMat = woodMat(0x6e4a2c, 0.03);
for (const sx of [-1, 1]) {
  for (const z of [postZ0, postZ1]) {
    const p = box(cart, POST, postH, POST, postMat, sx * postX, FLOOR_TOP + postH / 2, z);
    p.rotation.y = rr(-0.03, 0.03);
    // iron band + bolt on each post
    box(cart, POST + 0.014, 0.035, POST + 0.014, ironMat, sx * postX, FLOOR_TOP + 0.1, z);
    cyl(cart, 0.012, 0.012, 0.02, ironMat, 'x', sx * (postX + POST / 2 + 0.005), FLOOR_TOP + 0.1, z, 8);
  }
  // middle post on long sides
  box(cart, POST * 0.9, postH * 0.85, POST * 0.9, postMat, sx * postX, FLOOR_TOP + postH * 0.425, BED_ZC);
}
const sideLen = postZ1 - postZ0 + POST;
const endLen = BED_HW * 2 + POST * 2;
const RAIL_YS = [1.2, 1.42];
for (const sx of [-1, 1]) {
  // lower side board (plank)
  box(cart, 0.035, 0.2, BED_LEN + rr(-0.03, 0.03), woodMat(0x93673f, 0.07), sx * (BED_HW + 0.02), FLOOR_TOP + 0.1, BED_ZC);
  plankCount++;
  for (const y of RAIL_YS) {
    const r = box(cart, 0.04, 0.06, sideLen + rr(-0.04, 0.04), woodMat(0x85592f, 0.07), sx * (BED_HW + POST / 2 + 0.03), y, BED_ZC);
    r.rotation.z = rr(-0.01, 0.01);
    for (const z of [postZ0, postZ1]) {
      cyl(cart, 0.012, 0.012, 0.02, ironMat, 'x', sx * (BED_HW + POST / 2 + 0.058), y, z, 8);
    }
  }
}
for (const z of [BED_Z0, BED_Z1]) {
  const sz = z < 0 ? -1 : 1;
  box(cart, BED_HW * 2, 0.2, 0.035, woodMat(0x93673f, 0.07), 0, FLOOR_TOP + 0.1 + rr(-0.005, 0.005), z + sz * 0.02);
  plankCount++;
  for (const y of RAIL_YS) {
    const r = box(cart, endLen + rr(-0.04, 0.04), 0.06, 0.04, woodMat(0x85592f, 0.07), 0, y, z + sz * (POST / 2 + 0.03));
    r.rotation.z = rr(-0.01, 0.01);
    for (const x of [-postX, postX]) {
      cyl(cart, 0.012, 0.012, 0.02, ironMat, 'z', x, y, z + sz * (POST / 2 + 0.058), 8);
    }
  }
}

// front prop legs
const LEG_L = 0.82;
const LEG_ANG = 0.2;
for (const sx of [-1, 1]) {
  const top = new THREE.Vector3(sx * 0.5, 0.78, 1.0);
  const dir = new THREE.Vector3(0, -Math.cos(LEG_ANG), Math.sin(LEG_ANG));
  const centre = top.clone().addScaledVector(dir, LEG_L / 2);
  const leg = box(cart, 0.07, LEG_L, 0.07, woodMat(0x6e4a2c, 0.03), centre.x, centre.y, centre.z);
  leg.rotation.x = -LEG_ANG;
  const foot = top.clone().addScaledVector(dir, LEG_L - 0.02);
  box(cart, 0.09, 0.035, 0.09, ironMat, foot.x, Math.max(0.02, foot.y), foot.z);
  const mid = top.clone().addScaledVector(dir, 0.1);
  box(cart, 0.1, 0.03, 0.1, ironMat, mid.x, mid.y, mid.z).rotation.x = -LEG_ANG;
}
// stretcher between legs
{
  const p = new THREE.Vector3(0, 0.78, 1.0).addScaledVector(new THREE.Vector3(0, -Math.cos(LEG_ANG), Math.sin(LEG_ANG)), 0.55);
  box(cart, 1.0, 0.05, 0.05, darkWood, 0, p.y, p.z);
}

// ---------- wheels ----------
const SPOKES = 12;
const wheels: THREE.Group[] = [];
let spokeCount = 0;
function buildWheel(): THREE.Group {
  const w = new THREE.Group(); // built in XY plane, axle along Z
  const hubMat = woodMat(0x6a4526, 0.02);
  const spokeMat = woodMat(0xa07848, 0.04);
  const rimMat = woodMat(0x8a6038, 0.04);
  cyl(w, 0.1, 0.1, 0.2, hubMat, 'z', 0, 0, 0, 20);
  cyl(w, 0.13, 0.13, 0.1, hubMat, 'z', 0, 0, 0, 20);
  // iron bands on hub ends + nave cap
  for (const dz of [-0.095, 0.095]) cyl(w, 0.112, 0.112, 0.03, ironMat, 'z', 0, 0, dz, 20);
  cyl(w, 0.134, 0.134, 0.025, ironMat, 'z', 0, 0, 0, 20);
  cyl(w, 0.05, 0.05, 0.03, ironMat, 'z', 0, 0, 0.115, 12);
  // spokes
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.z = a;
    box(holder, 0.04, 0.5, 0.05, spokeMat, 0, 0.33, 0);
    w.add(holder);
    spokeCount++;
  }
  // wooden rim, built from felloe segments
  const FEL = 8;
  for (let i = 0; i < FEL; i++) {
    const a0 = (i / FEL) * Math.PI * 2;
    const arc = (Math.PI * 2) / FEL;
    const R = 0.57;
    const seg = new THREE.Mesh(
      new THREE.TorusGeometry(R, 0.04, 6, 8, arc * 0.985),
      woodMat(0x8a6038, 0.06),
    );
    seg.scale.set(1, 1, 1.25);
    seg.rotation.z = a0;
    seg.castShadow = true;
    seg.receiveShadow = true;
    w.add(seg);
  }
  void rimMat;
  // iron tyre
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.026, 8, 64), ironMat);
  tyre.scale.set(1, 1, 1.5);
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  w.add(tyre);
  // rim nails
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const n = cyl(w, 0.014, 0.014, 0.01, ironMat, 'z', Math.cos(a) * 0.62, Math.sin(a) * 0.62, i % 2 ? 0.04 : -0.04, 6);
    n.scale.set(1, 1, 1);
  }
  return w;
}
for (const sx of [-1, 1]) {
  const pivot = new THREE.Group();
  pivot.position.set(sx * 0.83, AXLE_Y, AXLE_Z);
  pivot.rotation.y = Math.PI / 2;
  const wheel = buildWheel();
  wheel.rotation.z = sx > 0 ? 0.3 : 0.0;
  pivot.add(wheel);
  cart.add(pivot);
  wheels.push(wheel);
  // linchpin + washer
  cyl(cart, 0.05, 0.05, 0.02, ironMat, 'x', sx * 0.96, AXLE_Y, AXLE_Z, 14);
  cyl(cart, 0.01, 0.01, 0.1, ironMat, 'y', sx * 0.98, AXLE_Y - 0.0, AXLE_Z, 6);
}

// ---------- cargo ----------
function makeSack(rx: number, ry: number, rz: number, hex: number): THREE.Group {
  const g = new THREE.Group();
  let geo: THREE.BufferGeometry = new THREE.SphereGeometry(1, 24, 18);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const off = rand() * 50;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y > 0.55) {
      const t = (v.y - 0.55) / 0.45;
      const k = 1 - t * 0.68;
      v.x *= k; v.z *= k;
      v.y = 0.55 + (v.y - 0.55) * 1.15;
    }
    if (v.y < -0.65) v.y = -0.65 - (-0.65 - v.y) * 0.25;
    const n = 1 + 0.07 * (vnoise(v.x * 3 + off, v.y * 3 + v.z * 3) - 0.5) * 2;
    v.x *= n; v.z *= n;
    v.x *= 1 + 0.08 * v.y; // slightly wider mid-low
    p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  geo.computeVertexNormals();
  const col = new THREE.Color(hex);
  const mat = new THREE.MeshStandardMaterial({ color: col, map: grain, roughness: 1, metalness: 0 });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // rope tie at neck
  const rope = new THREE.Mesh(new THREE.TorusGeometry(Math.min(rx, rz) * 0.34, 0.015, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = ry * 0.6;
  rope.castShadow = true;
  g.add(rope);
  // floppy top
  const top = new THREE.Mesh(new THREE.ConeGeometry(Math.min(rx, rz) * 0.4, ry * 0.3, 8, 1, true), mat);
  top.material = mat.clone();
  (top.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  top.position.y = ry * 0.78;
  top.rotation.z = rr(-0.3, 0.3);
  top.castShadow = true;
  g.add(top);
  return g;
}

function makeBarrel(h: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const prof = (t: number) => r * (1 + 0.14 * (1 - (2 * t - 1) ** 2)); // t in 0..1
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(prof(t), (t - 0.5) * h));
  }
  const mat = woodMat(0x8a5c34, 0.05);
  mat.side = THREE.DoubleSide;
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.02, 28), woodMat(0xa27a50, 0.04));
  lid.position.y = h / 2 - 0.03;
  lid.castShadow = true;
  lid.receiveShadow = true;
  g.add(lid);
  for (const t of [0.08, 0.27, 0.73, 0.92]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(prof(t) + 0.004, 0.012, 6, 32), ironMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.scale.set(1, 1, 1.5);
    hoop.position.y = (t - 0.5) * h;
    hoop.castShadow = true;
    g.add(hoop);
  }
  return g;
}

function makeCrate(w: number, h: number, d: number, hex: number): THREE.Group {
  const g = new THREE.Group();
  const body = woodMat(hex, 0.05);
  box(g, w - 0.04, h - 0.04, d - 0.04, body, 0, 0, 0);
  const e = 0.045;
  const edge = woodMat(0x9b7347, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, e, h, e, edge, sx * (w / 2 - e / 2), 0, sz * (d / 2 - e / 2));
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) box(g, w, e, e, edge, 0, sy * (h / 2 - e / 2), sz * (d / 2 - e / 2));
    for (const sx of [-1, 1]) box(g, e, e, d, edge, sx * (w / 2 - e / 2), sy * (h / 2 - e / 2), 0);
  }
  // diagonal brace on front and back faces
  const diag = Math.hypot(w, h) * 0.8;
  const ang = Math.atan2(h, w);
  for (const sz of [-1, 1]) {
    const b = box(g, diag, 0.045, 0.02, edge, 0, 0, sz * (d / 2 - 0.005));
    b.rotation.z = ang;
  }
  return g;
}

function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  cart.add(shadow(o));
  return o;
}

const F = FLOOR_TOP;
// barrels (front)
place(makeBarrel(0.52, 0.2), -0.33, F + 0.26, 0.64);
place(makeBarrel(0.5, 0.19), 0.34, F + 0.25, 0.62);
// crates (middle)
place(makeCrate(0.4, 0.34, 0.38, 0x7c5733), -0.3, F + 0.17, 0.0, 0.08);
place(makeCrate(0.42, 0.36, 0.36, 0x6f4d2d), 0.3, F + 0.18, 0.02, -0.15);
place(makeCrate(0.3, 0.26, 0.3, 0x86603a), -0.3, F + 0.34 + 0.13, 0.0, 0.5);
// sacks (rear)
place(makeSack(0.27, 0.3, 0.22, 0xb59a6a), -0.31, F + 0.27, -0.56, 0.2);
place(makeSack(0.27, 0.29, 0.22, 0xa88f60), 0.31, F + 0.26, -0.55, -0.15);
{
  const s = place(makeSack(0.25, 0.27, 0.2, 0xbca272), 0.02, F + 0.55, -0.5, 0.1);
  s.rotation.z = 0.12;
}

// ---------- animation ----------
const target = new THREE.Vector3(0, 0.85, -0.25);
function updateCamera(t: number): void {
  const az = THREE.MathUtils.degToRad(42 + 28 * Math.sin(t * 0.22));
  const dist = 7.0;
  camera.position.set(Math.sin(az) * dist, 2.9, Math.cos(az) * dist);
  camera.lookAt(target);
}

let readyDone = false;
const clock = new THREE.Clock();
function frame(): void {
  const t = clock.getElapsedTime();
  for (const w of wheels) w.rotation.z = t * 0.35 * (w === wheels[0] ? 1 : 1);
  updateCamera(t);
  renderer.render(scene, camera);
  if (!readyDone) {
    readyDone = true;
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = { ready: true, wheelCount: wheels.length, spokeCount, plankCount };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

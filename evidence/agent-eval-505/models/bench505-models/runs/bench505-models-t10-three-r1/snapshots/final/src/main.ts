import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xcfe3ee);
scene.fog = new THREE.Fog(HORIZON, 70, 220);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 1000);

// ---------- helpers ----------
function add<G extends THREE.BufferGeometry>(
  parent: THREE.Object3D,
  geo: G,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
): THREE.Mesh<G> {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function std(color: number, rough = 0.7, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

let seed = 12345;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- sky ----------
{
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x3f78c0);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 300));
    c.copy(HORIZON).lerp(top, Math.pow(t, 0.7));
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false }),
  );
  scene.add(sky);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x4a5a48, 0.9);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0x9db8d8, 0.5);
fill.position.set(-15, 8, -12);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.position.set(18, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -18;
sc.right = 18;
sc.top = 20;
sc.bottom = -14;
sc.near = 1;
sc.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.target.position.set(0, 4, 0);
scene.add(sun);
scene.add(sun.target);

// ---------- sea ----------
const seaGeo = new THREE.PlaneGeometry(500, 500, 110, 110);
seaGeo.rotateX(-Math.PI / 2);
const sea = new THREE.Mesh(
  seaGeo,
  new THREE.MeshStandardMaterial({ color: 0x1f6f8f, roughness: 0.35, metalness: 0.1, flatShading: true }),
);
sea.receiveShadow = true;
scene.add(sea);
const seaPos = seaGeo.attributes.position as THREE.BufferAttribute;
const seaBase = new Float32Array(seaPos.array.length);
seaBase.set(seaPos.array as Float32Array);
function animateSea(t: number): void {
  for (let i = 0; i < seaPos.count; i++) {
    const x = seaBase[i * 3];
    const z = seaBase[i * 3 + 2];
    const d = Math.hypot(x, z);
    const amp = Math.min(1, d / 20) * 0.22;
    seaPos.setY(i, amp * (Math.sin(x * 0.35 + t * 0.9) + Math.cos(z * 0.3 + t * 0.7)) * 0.5);
  }
  seaPos.needsUpdate = true;
  seaGeo.computeVertexNormals();
}

// ---------- island ground ----------
const world = new THREE.Group();
scene.add(world);

const GROUND_TOP = 0.5;
const grassMat = std(0x5f8f4a, 0.95);
const sandMat = std(0xc9b787, 0.95);
add(world, new THREE.CylinderGeometry(9, 9.8, GROUND_TOP + 0.6, 40), sandMat, 1.5, (GROUND_TOP - 0.6) / 2, 0.5);
add(world, new THREE.CylinderGeometry(8.4, 8.8, 0.12, 40), grassMat, 1.5, GROUND_TOP - 0.05, 0.5);

// ---------- rocks ----------
function makeRock(radius: number, detail = 1, yScale = 0.7): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const salt = rnd() * 50;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.75 + 0.5 * hash3(Math.round(x * 50) / 50 + salt, Math.round(y * 50) / 50, Math.round(z * 50) / 50);
    p.setXYZ(i, x * k, y * k * yScale, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const rockMats = [std(0x6b6b6f, 0.95), std(0x7b7872, 0.95), std(0x58585c, 0.95), std(0x8a857b, 0.95)];
for (const m of rockMats) m.flatShading = true;

// central mass under the tower
add(world, makeRock(3.8, 2, 0.28), rockMats[0], 0, -0.05, 0);
// ring of rocks around the tower base and the island edge
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
  const d = 3.3 + rnd() * 1.6;
  const r = 1.1 + rnd() * 0.9;
  const rx = Math.sin(a) * d;
  const rz = Math.cos(a) * d;
  if (Math.hypot(rx - 6.2, rz - 2.8) < 3.6) continue;
  const m = add(world, makeRock(r), rockMats[i % rockMats.length], rx, 0.25 + rnd() * 0.3, rz);
  m.rotation.y = rnd() * 6;
}
// outlying rocks in the water
for (let i = 0; i < 6; i++) {
  const a = rnd() * Math.PI * 2;
  const d = 10 + rnd() * 5;
  const r = 0.8 + rnd() * 1.1;
  add(world, makeRock(r), rockMats[(i + 1) % rockMats.length], 1.5 + Math.sin(a) * d, 0.1, 0.5 + Math.cos(a) * d);
}

// ---------- tower ----------
const TOWER_BASE = 0.9;
const TOWER_H = 10;
const R0 = 2.1;
const R1 = 1.3;
const BANDS = 5;
const radiusAt = (y: number): number => R0 + (R1 - R0) * (y / TOWER_H);
const red = std(0xc2282b, 0.6);
const white = std(0xf3f1ea, 0.6);
const tower = new THREE.Group();
tower.position.y = TOWER_BASE;
world.add(tower);

const bandH = TOWER_H / BANDS;
for (let i = 0; i < BANDS; i++) {
  const y0 = i * bandH;
  const y1 = y0 + bandH;
  add(tower, new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), bandH, 40), i % 2 === 0 ? red : white, 0, (y0 + y1) / 2, 0);
}
// stone plinth
add(tower, new THREE.CylinderGeometry(R0 + 0.05, R0 + 0.3, 0.5, 40), std(0x77736b, 0.9), 0, 0.1, 0);

// door (faces the cottage)
const doorAngle = Math.atan2(5, 2.5);
function placeOnTower(obj: THREE.Object3D, y: number, ang: number, inset: number): void {
  const r = radiusAt(y) - inset;
  obj.position.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
  obj.rotation.y = ang;
}
{
  const doorMat = std(0x5a3a22, 0.8);
  const frameMat = std(0x2c2c2f, 0.8);
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.1, 1.7, 0.3), frameMat, 0, 0, 0);
  add(g, new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), frameMat, 0, 0.85, 0);
  add(g, new THREE.BoxGeometry(0.85, 1.6, 0.3), doorMat, 0, -0.03, 0.04);
  add(g, new THREE.CylinderGeometry(0.425, 0.425, 0.3, 16, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), doorMat, 0, 0.77, 0.04);
  add(g, new THREE.SphereGeometry(0.06, 8, 6), std(0xd4af37, 0.3, 0.8), 0.28, -0.05, 0.22);
  placeOnTower(g, 0.95, doorAngle, 0.05);
  tower.add(g);
  // step
  add(tower, new THREE.BoxGeometry(1.6, 0.2, 0.9), std(0x8a857b, 0.9), Math.sin(doorAngle) * (R0 + 0.35), 0.1, Math.cos(doorAngle) * (R0 + 0.35)).rotation.y = doorAngle;
}

// windows spiralling up
{
  const frameMat = std(0xf3f1ea, 0.7);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1b2b44,
    roughness: 0.15,
    metalness: 0.3,
    emissive: 0xffc860,
    emissiveIntensity: 0.35,
  });
  const ys = [3.2, 4.8, 6.4, 8.0, 9.2];
  ys.forEach((y, i) => {
    const ang = doorAngle + 1.2 + i * 1.25;
    const g = new THREE.Group();
    add(g, new THREE.BoxGeometry(0.62, 0.95, 0.3), frameMat, 0, 0, 0);
    add(g, new THREE.BoxGeometry(0.4, 0.72, 0.3), glassMat, 0, 0, 0.04);
    add(g, new THREE.BoxGeometry(0.04, 0.72, 0.3), frameMat, 0, 0, 0.06);
    placeOnTower(g, y, ang, 0.06);
    tower.add(g);
  });
}

// ---------- gallery ----------
const gy = TOWER_H; // local to tower
const metal = std(0x25272b, 0.5, 0.6);
add(tower, new THREE.CylinderGeometry(R1 + 0.15, R1, 0.3, 40), std(0x2c2c2f, 0.7), 0, gy - 0.1, 0);
add(tower, new THREE.CylinderGeometry(2.25, 2.0, 0.22, 40), std(0x3a3a3f, 0.7), 0, gy + 0.1, 0);
const railR = 2.15;
const railY = gy + 0.21;
const posts = 24;
for (let i = 0; i < posts; i++) {
  const a = (i / posts) * Math.PI * 2;
  add(tower, new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), metal, Math.sin(a) * railR, railY + 0.475, Math.cos(a) * railR);
}
add(tower, new THREE.TorusGeometry(railR, 0.045, 8, 48).rotateX(Math.PI / 2), metal, 0, railY + 0.95, 0);
add(tower, new THREE.TorusGeometry(railR, 0.03, 8, 48).rotateX(Math.PI / 2), metal, 0, railY + 0.5, 0);

// ---------- lantern room ----------
const ly = gy + 0.21; // lantern floor
const LH = 2.0;
const LR = 1.0;
add(tower, new THREE.CylinderGeometry(LR + 0.1, LR + 0.15, 0.3, 24), std(0x2c2c2f, 0.6), 0, ly + 0.15, 0);
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xbfe6f5,
  roughness: 0.05,
  metalness: 0,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});
add(tower, new THREE.CylinderGeometry(LR, LR, LH, 24, 1, true), glass, 0, ly + 0.3 + LH / 2, 0, false);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  add(tower, new THREE.BoxGeometry(0.07, LH, 0.07), metal, Math.sin(a) * LR, ly + 0.3 + LH / 2, Math.cos(a) * LR);
}
const lampY = ly + 0.3 + LH / 2;
add(tower, new THREE.CylinderGeometry(0.12, 0.2, 0.5, 12), metal, 0, lampY - 0.55, 0);
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xfff2b0,
  emissive: 0xffd36a,
  emissiveIntensity: 4,
  roughness: 0.3,
});
add(tower, new THREE.SphereGeometry(0.3, 20, 14), lampMat, 0, lampY, 0, false);
// Fresnel-style lens rings around the lamp
add(tower, new THREE.TorusGeometry(0.42, 0.04, 8, 24).rotateX(Math.PI / 2), std(0xc9a94a, 0.3, 0.8), 0, lampY + 0.15, 0, false);
add(tower, new THREE.TorusGeometry(0.42, 0.04, 8, 24).rotateX(Math.PI / 2), std(0xc9a94a, 0.3, 0.8), 0, lampY - 0.15, 0, false);
const lampLight = new THREE.PointLight(0xffd070, 18, 14, 1.6);
lampLight.position.set(0, lampY, 0);
tower.add(lampLight);

// roof
const roofY = ly + 0.3 + LH;
add(tower, new THREE.CylinderGeometry(LR + 0.15, LR + 0.15, 0.2, 24), metal, 0, roofY + 0.1, 0);
add(tower, new THREE.ConeGeometry(LR + 0.3, 1.3, 24), std(0x3c4a5c, 0.45, 0.4), 0, roofY + 0.2 + 0.65, 0);
add(tower, new THREE.SphereGeometry(0.14, 12, 10), std(0xd4af37, 0.3, 0.8), 0, roofY + 1.55, 0);
add(tower, new THREE.CylinderGeometry(0.012, 0.03, 0.6, 6), std(0xd4af37, 0.3, 0.8), 0, roofY + 1.85, 0);

// light beams
const beams = new THREE.Group();
beams.position.y = lampY;
tower.add(beams);
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xffe9a0,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
for (const dir of [1, -1]) {
  const g = new THREE.ConeGeometry(2.2, 22, 20, 1, true);
  g.translate(0, -11, 0); // apex at origin, opening toward -y
  g.rotateZ(dir * Math.PI / 2); // opening toward -dir... x axis
  add(beams, g, beamMat, 0, 0, 0, false).renderOrder = 2;
}

// ---------- keeper's cottage ----------
{
  const cottage = new THREE.Group();
  cottage.position.set(6.2, GROUND_TOP, 2.8);
  cottage.rotation.y = -0.5;
  world.add(cottage);
  const wall = std(0xece4d2, 0.85);
  add(cottage, new THREE.BoxGeometry(3.2, 1.7, 2.3), wall, 0, 0.85, 0);
  add(cottage, new THREE.BoxGeometry(3.4, 0.2, 2.5), std(0x77736b, 0.9), 0, 0.1, 0);
  // gable roof as a triangular prism
  const shape = new THREE.Shape();
  shape.moveTo(-1.35, 0);
  shape.lineTo(1.35, 0);
  shape.lineTo(0, 1.1);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: false });
  roofGeo.translate(0, 0, -1.75);
  roofGeo.rotateY(Math.PI / 2);
  add(cottage, roofGeo, std(0x8c3b2e, 0.75), 0, 1.7, 0);
  // chimney
  add(cottage, new THREE.BoxGeometry(0.35, 0.9, 0.35), std(0x8a6a5a, 0.9), 0.9, 2.3, -0.3);
  // door
  add(cottage, new THREE.BoxGeometry(0.55, 1.05, 0.1), std(0x5a3a22, 0.8), -0.6, 0.62, 1.17);
  // windows
  const cg = new THREE.MeshStandardMaterial({ color: 0x1b2b44, roughness: 0.2, emissive: 0xffc860, emissiveIntensity: 0.4 });
  const cf = std(0x4a6a8a, 0.7);
  for (const x of [0.5, 1.15]) {
    add(cottage, new THREE.BoxGeometry(0.5, 0.55, 0.08), cf, x, 1.0, 1.16);
    add(cottage, new THREE.BoxGeometry(0.38, 0.43, 0.1), cg, x, 1.0, 1.17);
  }
  add(cottage, new THREE.BoxGeometry(0.08, 0.55, 0.5), cf, 1.6, 1.0, 0);
  add(cottage, new THREE.BoxGeometry(0.1, 0.43, 0.38), cg, 1.61, 1.0, 0);
  // little fence
  const fenceMat = std(0xf3f1ea, 0.8);
  for (let i = 0; i < 6; i++) {
    add(cottage, new THREE.BoxGeometry(0.08, 0.5, 0.08), fenceMat, -1.5 + i * 0.6, 0.25, 1.9);
  }
  add(cottage, new THREE.BoxGeometry(3.1, 0.06, 0.05), fenceMat, -0.05, 0.38, 1.9);
}

// ---------- state ----------
let partCount = 0;
scene.traverse((o) => {
  if ((o as THREE.Mesh).isMesh && o !== sea && o.parent === scene && (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && !(o as THREE.Mesh).castShadow) {
    return; // skip sky dome
  }
  if ((o as THREE.Mesh).isMesh) partCount++;
});

// ---------- loop ----------
const clock = new THREE.Clock();
let first = true;
function frame(): void {
  const t = clock.getElapsedTime();
  const a = t * 0.12 + 0.6;
  const R = 31;
  camera.position.set(Math.sin(a) * R, 8.5, Math.cos(a) * R);
  camera.lookAt(0.8, 7.2, 0.3);
  beams.rotation.y = t * 0.8;
  animateSea(t);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

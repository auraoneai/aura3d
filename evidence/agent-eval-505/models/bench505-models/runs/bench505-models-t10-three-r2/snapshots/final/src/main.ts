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

const HORIZON = new THREE.Color(0xcfe3ee);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 70, 260);

const camera = new THREE.PerspectiveCamera(42, 640 / 360, 0.1, 1200);

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
const rand = mulberry32(1234);

function std(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  cast = true,
  receive = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

// ---------- sky ----------
{
  const geo = new THREE.SphereGeometry(900, 32, 24);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x3f86c9);
  const mid = new THREE.Color(0x8fbfe3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 900;
    if (h <= 0) c.copy(HORIZON);
    else if (h < 0.25) c.copy(HORIZON).lerp(mid, h / 0.25);
    else c.copy(mid).lerp(top, Math.min(1, (h - 0.25) / 0.6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false }),
  );
  scene.add(sky);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x4a5a4a, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(18, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fc0ff, 0.6);
fill.position.set(-16, 8, -14);
scene.add(fill);

// ---------- sea ----------
const seaGeo = new THREE.PlaneGeometry(600, 600, 120, 120);
const seaMat = new THREE.MeshStandardMaterial({ color: 0x2a7ea0, roughness: 0.35, metalness: 0.1 });
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -0.05;
sea.receiveShadow = true;
scene.add(sea);
const seaBase = Float32Array.from(seaGeo.attributes.position.array as ArrayLike<number>);

function updateSea(t: number): void {
  const p = seaGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = seaBase[i * 3];
    const y = seaBase[i * 3 + 1];
    const d = Math.hypot(x, y);
    const amp = Math.min(1, d / 14) * 0.16;
    p.setZ(i, amp * (Math.sin(x * 0.35 + t * 0.9) + Math.cos(y * 0.28 + t * 0.7) + 0.5 * Math.sin((x + y) * 0.7 + t * 1.3)));
  }
  p.needsUpdate = true;
  seaGeo.computeVertexNormals();
}

// ---------- island + rocks ----------
const island = new THREE.Group();
scene.add(island);
const GROUND_Y = 0.6;

addMesh(island, new THREE.CylinderGeometry(8.2, 9.6, 1.9, 40, 1), std(0x6f6a62, 0.95), 0, GROUND_Y - 0.95, 0);
addMesh(island, new THREE.CylinderGeometry(7.6, 8.2, 0.2, 40, 1), std(0x5f8f4a, 0.95), 0, GROUND_Y - 0.1, 0);

function makeRock(radius: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d =
      1 +
      0.22 * Math.sin(x * 1.7 + seed) * Math.cos(z * 2.1 + seed * 1.3) +
      0.15 * Math.sin(y * 3.1 + seed * 0.7 + x * 0.9);
    p.setXYZ(i, x * d, y * d * 0.75, z * d);
  }
  g.computeVertexNormals();
  return g;
}

const rockColors = [0x7b7873, 0x6a6762, 0x8a867e, 0x5d5b58, 0x74706a];
let rockCount = 0;
function addRock(x: number, z: number, r: number, y = GROUND_Y): void {
  const m = new THREE.MeshStandardMaterial({
    color: rockColors[rockCount % rockColors.length],
    roughness: 0.95,
    flatShading: true,
  });
  const rock = addMesh(island, makeRock(r, rockCount * 3.7 + 1), m, x, y, z);
  rock.rotation.y = rand() * Math.PI * 2;
  rock.scale.set(1 + rand() * 0.3, 0.8 + rand() * 0.5, 1 + rand() * 0.3);
  rockCount++;
}

// ring of rocks around tower base
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
  const d = 2.5 + rand() * 0.7;
  addRock(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rand() * 0.5, GROUND_Y + 0.05);
}
// shoreline rocks
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + rand() * 0.25;
  const d = 7.4 + rand() * 2.2;
  addRock(Math.cos(a) * d, Math.sin(a) * d, 0.9 + rand() * 1.0, -0.1);
}
// few scattered
addRock(-4.5, 3.2, 0.7);
addRock(-3.8, -4.4, 0.9);
addRock(3.5, -5, 0.6);

// ---------- tower ----------
const tower = new THREE.Group();
scene.add(tower);
const T_Y0 = GROUND_Y;
const T_H = 10;
const R_BOT = 2.0;
const R_TOP = 1.3;
const BANDS = 5;
const bandH = T_H / BANDS;
const radiusAt = (y: number): number => R_BOT + (R_TOP - R_BOT) * ((y - T_Y0) / T_H);

// plinth
addMesh(tower, new THREE.CylinderGeometry(R_BOT + 0.25, R_BOT + 0.35, 0.4, 48), std(0x55524e, 0.9), 0, T_Y0 + 0.1, 0);

const bandMats = [std(0xc8281f, 0.6), std(0xf4f1ea, 0.6)];
for (let i = 0; i < BANDS; i++) {
  const y0 = T_Y0 + i * bandH;
  const y1 = y0 + bandH;
  const geo = new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), bandH, 48, 1);
  addMesh(tower, geo, bandMats[i % 2], 0, (y0 + y1) / 2, 0);
}

const TOP_Y = T_Y0 + T_H;

// gallery
const galleryMat = std(0x2d3138, 0.5, 0.4);
addMesh(tower, new THREE.CylinderGeometry(2.25, 1.6, 0.35, 48), galleryMat, 0, TOP_Y + 0.05, 0);
addMesh(tower, new THREE.CylinderGeometry(2.3, 2.3, 0.1, 48), galleryMat, 0, TOP_Y + 0.27, 0);
const railR = 2.2;
const railH = 1.0;
const postCount = 20;
for (let i = 0; i < postCount; i++) {
  const a = (i / postCount) * Math.PI * 2;
  addMesh(
    tower,
    new THREE.CylinderGeometry(0.035, 0.035, railH, 6),
    galleryMat,
    Math.cos(a) * railR,
    TOP_Y + 0.32 + railH / 2,
    Math.sin(a) * railR,
  );
}
const topRail = addMesh(tower, new THREE.TorusGeometry(railR, 0.05, 8, 48), galleryMat, 0, TOP_Y + 0.32 + railH, 0);
topRail.rotation.x = Math.PI / 2;
const midRail = addMesh(tower, new THREE.TorusGeometry(railR, 0.03, 6, 48), galleryMat, 0, TOP_Y + 0.32 + railH * 0.5, 0);
midRail.rotation.x = Math.PI / 2;

// lantern room
const LANT_Y0 = TOP_Y + 0.32;
const LANT_H = 1.7;
const LANT_R = 1.0;
addMesh(tower, new THREE.CylinderGeometry(LANT_R + 0.08, LANT_R + 0.12, 0.2, 32), galleryMat, 0, LANT_Y0 + 0.1, 0);
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xbfe6f5,
  roughness: 0.05,
  metalness: 0,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const glassMesh = addMesh(
  tower,
  new THREE.CylinderGeometry(LANT_R, LANT_R, LANT_H, 32, 1, true),
  glass,
  0,
  LANT_Y0 + 0.2 + LANT_H / 2,
  0,
  false,
  false,
);
glassMesh.renderOrder = 2;
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  addMesh(
    tower,
    new THREE.BoxGeometry(0.06, LANT_H, 0.06),
    galleryMat,
    Math.cos(a) * LANT_R,
    LANT_Y0 + 0.2 + LANT_H / 2,
    Math.sin(a) * LANT_R,
  );
}
const LANT_TOP = LANT_Y0 + 0.2 + LANT_H;
addMesh(tower, new THREE.CylinderGeometry(LANT_R + 0.15, LANT_R + 0.1, 0.18, 32), galleryMat, 0, LANT_TOP + 0.09, 0);

// lamp
const LAMP_Y = LANT_Y0 + 0.2 + LANT_H / 2 - 0.05;
addMesh(tower, new THREE.CylinderGeometry(0.18, 0.28, 0.5, 16), std(0x444444, 0.4, 0.6), 0, LANT_Y0 + 0.45, 0, false, false);
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffd36a,
  emissiveIntensity: 3,
  roughness: 0.3,
});
addMesh(tower, new THREE.SphereGeometry(0.34, 24, 16), lampMat, 0, LAMP_Y + 0.1, 0, false, false);
const lampLight = new THREE.PointLight(0xffd88a, 18, 14, 1.6);
lampLight.position.set(0, LAMP_Y + 0.1, 0);
tower.add(lampLight);

// roof + finial
const roofMat = std(0x2f4f6a, 0.5, 0.3);
addMesh(tower, new THREE.ConeGeometry(LANT_R + 0.3, 1.2, 32), roofMat, 0, LANT_TOP + 0.18 + 0.6, 0);
addMesh(tower, new THREE.SphereGeometry(0.16, 16, 12), galleryMat, 0, LANT_TOP + 1.42, 0);
addMesh(tower, new THREE.CylinderGeometry(0.02, 0.03, 0.55, 8), galleryMat, 0, LANT_TOP + 1.7, 0);
addMesh(tower, new THREE.ConeGeometry(0.06, 0.18, 8), galleryMat, 0, LANT_TOP + 2.05, 0);

// light beams
const beamPivot = new THREE.Group();
beamPivot.position.set(0, LAMP_Y + 0.1, 0);
tower.add(beamPivot);
{
  const len = 16;
  const g = new THREE.ConeGeometry(2.6, len, 24, 1, true);
  g.translate(0, -len / 2, 0);
  g.rotateZ(Math.PI / 2);
  const bm = new THREE.MeshBasicMaterial({
    color: 0xffeeb0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const b1 = addMesh(beamPivot, g, bm, 0, 0, 0, false, false);
  b1.renderOrder = 3;
  const b2 = addMesh(beamPivot, g, bm, 0, 0, 0, false, false);
  b2.rotation.y = Math.PI;
  b2.renderOrder = 3;
}

// door
const doorAngle = 0.15;
function placeOnTower(obj: THREE.Object3D, y: number, angle: number, push = 0): void {
  const r = radiusAt(y) + push;
  obj.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
  obj.rotation.y = Math.atan2(Math.cos(angle), Math.sin(angle));
}
{
  const woodMat = std(0x5a3a22, 0.8);
  const frameMat = std(0x3a3835, 0.7);
  const door = addMesh(tower, new THREE.BoxGeometry(0.9, 1.5, 0.12), woodMat);
  placeOnTower(door, T_Y0 + 0.95, doorAngle, 0.0);
  const arch = addMesh(tower, new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16, 1, false, Math.PI / 2, Math.PI), woodMat);
  placeOnTower(arch, T_Y0 + 1.7, doorAngle, 0.0);
  arch.rotateX(Math.PI / 2);
  // frame
  const lintel = addMesh(tower, new THREE.BoxGeometry(1.2, 0.12, 0.2), frameMat);
  placeOnTower(lintel, T_Y0 + 2.28, doorAngle, 0.05);
  const step = addMesh(tower, new THREE.BoxGeometry(1.3, 0.2, 0.6), frameMat);
  placeOnTower(step, T_Y0 + 0.1, doorAngle, 0.25);
  const knob = addMesh(tower, new THREE.SphereGeometry(0.05, 8, 6), std(0xd4aa40, 0.3, 0.8));
  knob.position.copy(door.position);
  knob.position.x += Math.cos(doorAngle) * 0.09 - Math.sin(doorAngle) * 0.28;
  knob.position.z += Math.sin(doorAngle) * 0.09 + Math.cos(doorAngle) * 0.28;
  knob.position.y += 0;
}

// windows spiralling up
const winGlass = new THREE.MeshStandardMaterial({
  color: 0x1c2a3a,
  emissive: 0xffc860,
  emissiveIntensity: 0.5,
  roughness: 0.2,
  metalness: 0.2,
});
const winFrame = std(0x2d3138, 0.6);
const WINDOWS = 7;
for (let i = 0; i < WINDOWS; i++) {
  const y = T_Y0 + 2.6 + i * 1.05;
  const a = doorAngle + 1.1 + i * 0.9;
  const pane = addMesh(tower, new THREE.BoxGeometry(0.34, 0.55, 0.1), winGlass);
  placeOnTower(pane, y, a, 0.0);
  const fr = addMesh(tower, new THREE.BoxGeometry(0.46, 0.67, 0.08), winFrame);
  placeOnTower(fr, y, a, -0.03);
}

// ---------- keeper's cottage ----------
const cottage = new THREE.Group();
cottage.position.set(5.6, GROUND_Y, 1.8);
cottage.rotation.y = -0.5;
scene.add(cottage);
{
  const W = 3.4;
  const H = 1.9;
  const D = 2.6;
  const wall = std(0xf0e6d2, 0.9);
  addMesh(cottage, new THREE.BoxGeometry(W, H, D), wall, 0, H / 2, 0);
  addMesh(cottage, new THREE.BoxGeometry(W + 0.1, 0.2, D + 0.1), std(0x6b665e, 0.95), 0, 0.1, 0);

  // gabled roof
  const shape = new THREE.Shape();
  const rw = D / 2 + 0.3;
  shape.moveTo(-rw, 0);
  shape.lineTo(rw, 0);
  shape.lineTo(0, 1.2);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: W + 0.5, bevelEnabled: false });
  roofGeo.translate(0, 0, -(W + 0.5) / 2);
  roofGeo.rotateY(Math.PI / 2);
  addMesh(cottage, roofGeo, std(0x8a3b2c, 0.8), 0, H, 0);

  // chimney
  addMesh(cottage, new THREE.BoxGeometry(0.4, 1.1, 0.4), std(0x8a5a48, 0.9), -1.0, H + 0.7, 0.3);
  addMesh(cottage, new THREE.BoxGeometry(0.5, 0.1, 0.5), std(0x55524e, 0.9), -1.0, H + 1.3, 0.3);

  // door and windows on +z face
  const dm = std(0x3d6a8f, 0.7);
  addMesh(cottage, new THREE.BoxGeometry(0.6, 1.2, 0.08), dm, 0.5, 0.7, D / 2 + 0.02);
  addMesh(cottage, new THREE.BoxGeometry(0.8, 0.08, 0.2), std(0x6b665e, 0.9), 0.5, 0.2, D / 2 + 0.12);
  const gl = new THREE.MeshStandardMaterial({ color: 0x25384c, emissive: 0xffc860, emissiveIntensity: 0.4, roughness: 0.2 });
  const fm = std(0xffffff, 0.7);
  for (const wx of [-0.8]) {
    addMesh(cottage, new THREE.BoxGeometry(0.76, 0.66, 0.06), fm, wx, 1.1, D / 2 + 0.01);
    addMesh(cottage, new THREE.BoxGeometry(0.62, 0.52, 0.08), gl, wx, 1.1, D / 2 + 0.03);
  }
  // side window
  addMesh(cottage, new THREE.BoxGeometry(0.06, 0.66, 0.76), fm, W / 2 + 0.01, 1.1, 0);
  addMesh(cottage, new THREE.BoxGeometry(0.08, 0.52, 0.62), gl, W / 2 + 0.03, 1.1, 0);
}

// small fence-free garden stones leading to door
for (let i = 0; i < 4; i++) {
  const s = addMesh(
    island,
    new THREE.CylinderGeometry(0.28, 0.3, 0.06, 10),
    std(0x9a958b, 0.95),
    5.0 - i * 0.75,
    GROUND_Y + 0.02,
    2.9 - i * 0.55,
    false,
    true,
  );
  s.rotation.y = rand();
}

// ---------- state ----------
let partCount = 0;
scene.traverse((o) => {
  if ((o as THREE.Mesh).isMesh && o !== sea) partCount++;
});
partCount += 1; // sea

// ---------- loop ----------
const clock = new THREE.Clock();
let first = true;
function frame(): void {
  const t = clock.getElapsedTime();
  const a = t * 0.12 + 0.6;
  const R = 33;
  camera.position.set(Math.cos(a) * R, 8.5 + Math.sin(t * 0.2) * 0.6, Math.sin(a) * R);
  camera.lookAt(0, 6.3, 0);
  beamPivot.rotation.y = t * 1.2;
  lampMat.emissiveIntensity = 3 + Math.sin(t * 3) * 0.2;
  updateSea(t);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

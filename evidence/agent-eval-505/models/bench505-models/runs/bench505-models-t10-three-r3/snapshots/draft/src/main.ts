import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
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
renderer.toneMapping = THREE.NoToneMapping;

const HORIZON = new THREE.Color(0xcfe2ee);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 60, 350);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 1500);

// ---------- helpers ----------
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1234);

function std(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- sky ----------
{
  const geo = new THREE.SphereGeometry(900, 32, 24);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(0x3f7fd0);
  const mid = new THREE.Color(0x8fbbe6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 900);
    if (t < 0.25) c.copy(HORIZON).lerp(mid, t / 0.25);
    else c.copy(mid).lerp(zenith, Math.min(1, (t - 0.25) / 0.5));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a5a4a, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.position.set(26, 34, 18);
sun.target.position.set(0, 6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -20;
sc.right = 20;
sc.top = 24;
sc.bottom = -16;
sc.near = 5;
sc.far = 100;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0x9ab8ff, 0.7);
fill.position.set(-24, 10, -16);
scene.add(fill);

// ---------- sea & island ----------
const seaMat = new THREE.MeshStandardMaterial({ color: 0x1f6f9c, roughness: 0.25, metalness: 0.1 });
const sea = new THREE.Mesh(new THREE.CircleGeometry(800, 64), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -0.4;
sea.receiveShadow = true;
scene.add(sea);

const foamMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const foamRings: THREE.Mesh[] = [];
for (let i = 0; i < 2; i++) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(12.2 + i * 1.2, 12.9 + i * 1.2, 64), foamMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.35;
  scene.add(ring);
  foamRings.push(ring);
}

const GROUND_Y = 0.3;
const island = new THREE.Group();
scene.add(island);
mesh(island, new THREE.CylinderGeometry(12, 12.6, 1.6, 48), std(0xd9c58f, 1), 0, -0.5, 0); // sand
mesh(island, new THREE.CylinderGeometry(10, 11.2, 0.5, 48), std(0x5c8c46, 1), 0, GROUND_Y - 0.25, 0); // grass

// ---------- rocks ----------
function makeRockGeo(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const r = mulberry32(seed);
  const phase = [r() * 6, r() * 6, r() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 2.3 + phase[0]) * Math.cos(v.y * 2.1 + phase[1]) * Math.sin(v.z * 2.7 + phase[2]);
    v.multiplyScalar(1 + 0.28 * n + 0.1 * Math.sin(v.x * 5 + v.z * 4 + phase[1]));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const rockColors = [0x6d6a66, 0x7b7771, 0x58564f, 0x85807a];
const rockMats = rockColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));

function addRock(x: number, z: number, s: number, i: number): void {
  const rock = mesh(scene, makeRockGeo(100 + i), rockMats[i % rockMats.length], x, GROUND_Y + s * 0.25, z);
  rock.scale.set(s * (1 + rand() * 0.5), s * (0.6 + rand() * 0.4), s * (1 + rand() * 0.5));
  rock.rotation.y = rand() * Math.PI * 2;
}
let rockIdx = 0;
// ring around tower base
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
  const d = 3.2 + rand() * 0.9;
  addRock(Math.sin(a) * d, Math.cos(a) * d, 0.9 + rand() * 0.7, rockIdx++);
}
// outcrop at the island's seaward edge
for (let i = 0; i < 9; i++) {
  const a = -2.6 + i * 0.28 + rand() * 0.15;
  const d = 10.3 + rand() * 1.6;
  addRock(Math.sin(a) * d, Math.cos(a) * d, 1.1 + rand() * 1.3, rockIdx++);
}
// a few rocks standing in the water
addRock(-15, 6, 1.8, rockIdx++);
addRock(15, -8, 1.4, rockIdx++);
addRock(4, -15, 1.6, rockIdx++);

// ---------- tower ----------
const TOWER_Y0 = GROUND_Y + 0.5;
const TOWER_H = 14;
const R_BOT = 2.4;
const R_TOP = 1.5;
const BANDS = 5;
const radiusAt = (y: number): number => R_BOT + (R_TOP - R_BOT) * ((y - TOWER_Y0) / TOWER_H);

const lighthouse = new THREE.Group();
scene.add(lighthouse);

const white = std(0xf4f1ea, 0.7);
const red = std(0xc4282b, 0.7);
const stone = std(0x77736c, 0.95);
const dark = std(0x1d2430, 0.6);
const darkWood = std(0x4a2f1c, 0.8);

// plinth
mesh(lighthouse, new THREE.CylinderGeometry(R_BOT + 0.2, R_BOT + 0.6, 0.6, 40), stone, 0, GROUND_Y + 0.25, 0);

const bandH = TOWER_H / BANDS;
for (let i = 0; i < BANDS; i++) {
  const y0 = TOWER_Y0 + i * bandH;
  const y1 = y0 + bandH;
  const geo = new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), bandH, 48);
  mesh(lighthouse, geo, i % 2 === 0 ? red : white, 0, (y0 + y1) / 2, 0);
}

// door
{
  const th = 0;
  const g = new THREE.Group();
  const r = radiusAt(TOWER_Y0 + 1);
  g.position.set(Math.sin(th) * r, TOWER_Y0, Math.cos(th) * r);
  g.rotation.y = th;
  lighthouse.add(g);
  mesh(g, new THREE.BoxGeometry(1.2, 1.7, 0.4), darkWood, 0, 0.85, 0.05);
  // half-cylinder; the rotation about X turns the z<=0 half upward
  const arch = mesh(
    g,
    new THREE.CylinderGeometry(0.6, 0.6, 0.4, 20, 1, false, Math.PI / 2, Math.PI),
    darkWood,
    0,
    1.7,
    0.05,
  );
  arch.rotation.x = Math.PI / 2;
  mesh(g, new THREE.BoxGeometry(1.7, 0.15, 0.55), stone, 0, 0.05, 0.1); // step
  mesh(g, new THREE.SphereGeometry(0.07, 8, 8), std(0xd8b24a, 0.3, 0.8), 0.38, 0.9, 0.28, false); // knob
}

// windows spiralling up
const winGlow = new THREE.MeshStandardMaterial({
  color: 0x203040,
  emissive: 0xffd27a,
  emissiveIntensity: 0.55,
  roughness: 0.3,
});
const WINDOWS = 7;
for (let i = 0; i < WINDOWS; i++) {
  const y = TOWER_Y0 + 2.6 + i * 1.5;
  const th = 0.9 + i * 1.05;
  const r = radiusAt(y);
  const g = new THREE.Group();
  g.position.set(Math.sin(th) * r, y, Math.cos(th) * r);
  g.rotation.y = th;
  lighthouse.add(g);
  mesh(g, new THREE.BoxGeometry(0.62, 0.95, 0.3), dark, 0, 0, 0.0);
  mesh(g, new THREE.BoxGeometry(0.42, 0.75, 0.3), winGlow, 0, 0, 0.04, false);
  mesh(g, new THREE.BoxGeometry(0.8, 0.1, 0.4), stone, 0, -0.52, 0.04, false); // sill
}

// gallery
const GAL_Y = TOWER_Y0 + TOWER_H;
mesh(lighthouse, new THREE.CylinderGeometry(R_TOP + 0.2, R_TOP + 1.2, 0.5, 40), stone, 0, GAL_Y - 0.1, 0);
mesh(lighthouse, new THREE.CylinderGeometry(2.9, 2.9, 0.18, 40), dark, 0, GAL_Y + 0.24, 0);
const railMat = std(0x20242c, 0.5, 0.4);
const RAIL_R = 2.75;
const RAIL_BASE = GAL_Y + 0.33;
const RAIL_H = 1.05;
const POSTS = 20;
for (let i = 0; i < POSTS; i++) {
  const a = (i / POSTS) * Math.PI * 2;
  mesh(
    lighthouse,
    new THREE.CylinderGeometry(0.05, 0.05, RAIL_H, 6),
    railMat,
    Math.sin(a) * RAIL_R,
    RAIL_BASE + RAIL_H / 2,
    Math.cos(a) * RAIL_R,
    false,
  );
}
for (const hy of [RAIL_BASE + RAIL_H, RAIL_BASE + RAIL_H * 0.5]) {
  const t = mesh(lighthouse, new THREE.TorusGeometry(RAIL_R, 0.05, 6, 48), railMat, 0, hy, 0, false);
  t.rotation.x = Math.PI / 2;
}

// lantern room
const LAN_Y0 = GAL_Y + 0.33;
const LAN_H = 2.4;
const LAN_R = 1.25;
mesh(lighthouse, new THREE.CylinderGeometry(LAN_R + 0.1, LAN_R + 0.1, 0.35, 24), dark, 0, LAN_Y0 + 0.17, 0);
const glass = new THREE.MeshStandardMaterial({
  color: 0xbfe6ff,
  roughness: 0.05,
  metalness: 0,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
});
mesh(lighthouse, new THREE.CylinderGeometry(LAN_R, LAN_R, LAN_H, 24, 1, true), glass, 0, LAN_Y0 + 0.35 + LAN_H / 2, 0, false);
const MULLIONS = 8;
for (let i = 0; i < MULLIONS; i++) {
  const a = (i / MULLIONS) * Math.PI * 2 + Math.PI / MULLIONS;
  mesh(
    lighthouse,
    new THREE.BoxGeometry(0.07, LAN_H, 0.07),
    dark,
    Math.sin(a) * LAN_R,
    LAN_Y0 + 0.35 + LAN_H / 2,
    Math.cos(a) * LAN_R,
    false,
  );
}
const LAN_TOP = LAN_Y0 + 0.35 + LAN_H;
mesh(lighthouse, new THREE.CylinderGeometry(LAN_R + 0.2, LAN_R + 0.1, 0.25, 24), dark, 0, LAN_TOP + 0.12, 0);

// lamp
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xfff2b0,
  emissive: 0xffe08a,
  emissiveIntensity: 2.5,
  roughness: 0.3,
});
const LAMP_Y = LAN_Y0 + 0.35 + LAN_H * 0.5;
mesh(lighthouse, new THREE.CylinderGeometry(0.22, 0.3, LAN_H * 0.5 - 0.0, 12), dark, 0, LAN_Y0 + 0.35 + LAN_H * 0.25, 0, false);
mesh(lighthouse, new THREE.SphereGeometry(0.42, 20, 16), lampMat, 0, LAMP_Y + 0.1, 0, false);
const lensMat = new THREE.MeshStandardMaterial({
  color: 0xffeeb0,
  emissive: 0xffd36b,
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
mesh(lighthouse, new THREE.CylinderGeometry(0.62, 0.62, 0.9, 20, 1, true), lensMat, 0, LAMP_Y + 0.1, 0, false);

const lampLight = new THREE.PointLight(0xffd68a, 40, 24, 2);
lampLight.position.set(0, LAMP_Y + 0.1, 0);
lighthouse.add(lampLight);

// roof & finial
const ROOF_Y = LAN_TOP + 0.25;
mesh(lighthouse, new THREE.ConeGeometry(LAN_R + 0.55, 1.7, 32), red, 0, ROOF_Y + 0.85, 0);
mesh(lighthouse, new THREE.SphereGeometry(0.2, 12, 12), std(0xd8b24a, 0.3, 0.8), 0, ROOF_Y + 1.78, 0);
mesh(lighthouse, new THREE.ConeGeometry(0.08, 0.7, 8), std(0xd8b24a, 0.3, 0.8), 0, ROOF_Y + 2.2, 0);

// rotating light beams
const beams = new THREE.Group();
beams.position.set(0, LAMP_Y + 0.1, 0);
lighthouse.add(beams);
{
  const len = 22;
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b0,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  for (const dir of [1, -1]) {
    const geo = new THREE.ConeGeometry(2.2, len, 24, 1, true);
    geo.rotateZ(Math.PI / 2);
    geo.translate(len / 2, 0, 0);
    const b = mesh(beams, geo, beamMat, 0, 0, 0, false);
    b.receiveShadow = false;
    if (dir < 0) b.rotation.y = Math.PI;
  }
}

// ---------- keeper's cottage ----------
const cottage = new THREE.Group();
cottage.position.set(7.2, GROUND_Y, 3.4);
cottage.rotation.y = -0.5;
scene.add(cottage);
{
  const CW = 4.2;
  const CD = 3.0;
  const CH = 2.3;
  const wall = std(0xece3cf, 0.9);
  const roofMat = std(0x6b3a2a, 0.85);
  mesh(cottage, new THREE.BoxGeometry(CW, CH, CD), wall, 0, CH / 2, 0);
  const roof = mesh(cottage, new THREE.ConeGeometry(1, 1.6, 4), roofMat, 0, CH + 0.8, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set((CW / 2) * Math.SQRT2 + 0.35, 1, (CD / 2) * Math.SQRT2 + 0.35);
  mesh(cottage, new THREE.BoxGeometry(0.5, 1.3, 0.5), std(0x8a5a48, 0.9), 1.1, CH + 1.1, -0.4);
  mesh(cottage, new THREE.BoxGeometry(0.8, 1.5, 0.12), darkWood, -0.8, 0.75, CD / 2 + 0.03);
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0x203040,
    emissive: 0xffd27a,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  mesh(cottage, new THREE.BoxGeometry(0.9, 0.8, 0.1), paneMat, 0.9, 1.3, CD / 2 + 0.03, false);
  mesh(cottage, new THREE.BoxGeometry(1.1, 0.08, 0.2), white, 0.9, 0.85, CD / 2 + 0.1, false);
  mesh(cottage, new THREE.BoxGeometry(0.1, 0.8, 0.9), paneMat, CW / 2 + 0.03, 1.3, 0, false);
  mesh(cottage, new THREE.BoxGeometry(1.2, 0.12, 0.6), stone, -0.8, 0.06, CD / 2 + 0.3, false);
}

// ---------- first frame / animation ----------
const ORBIT_R = 38;
const ORBIT_H = 9;
const LOOK = new THREE.Vector3(0, 9.3, 0);
const START_ANGLE = 0.45;

function updateCamera(t: number): void {
  const a = START_ANGLE + t * 0.12;
  camera.position.set(Math.sin(a) * ORBIT_R, ORBIT_H, Math.cos(a) * ORBIT_R);
  camera.lookAt(LOOK);
}

const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const t = clock.getElapsedTime();
  updateCamera(t);
  beams.rotation.y = t * 1.2;
  lampLight.intensity = 38 + Math.sin(t * 7) * 2;
  foamRings.forEach((r, i) => {
    const s = 1 + Math.sin(t * 0.8 + i * 1.7) * 0.02;
    r.scale.set(s, s, 1);
  });
  renderer.render(scene, camera);

  if (first) {
    first = false;
    let parts = 0;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) parts++;
    });
    // exclude the sky dome and sea plane from "parts" bookkeeping? They are visible meshes, so count them.
    window.__TASK_STATE__ = { ready: true, partCount: parts, bandCount: BANDS };
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

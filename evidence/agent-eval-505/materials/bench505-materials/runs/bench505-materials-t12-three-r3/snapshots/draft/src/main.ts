import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeMarbleTexture } from './marble';
import { makeEnvironment } from './environment';

declare global {
  interface Window {
    __TASK_STATE__: { materials: string[]; cameraAzimuthDeg: number };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070504);
scene.fog = new THREE.FogExp2(0x070504, 0.018);

const envMap = makeEnvironment(renderer);

// ---------- materials ----------
const marbleBase = makeMarbleTexture(512, 3);

function marbleMaterial(repeat: number, ox: number, oy: number): THREE.MeshPhysicalMaterial {
  const t = marbleBase.clone();
  t.repeat.set(repeat, repeat);
  t.offset.set(ox, oy);
  t.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    map: t,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMap,
    envMapIntensity: 0.9,
  });
}

const goldMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(1.0, 0.74, 0.28),
  metalness: 1,
  roughness: 0.16,
  envMap,
  envMapIntensity: 1.6,
});

// engraved band: darker, rougher gold with a fine diamond relief
function makeBandBump(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 3;
  for (let i = -2; i < 6; i++) {
    g.beginPath();
    g.moveTo(i * 32, 8);
    g.lineTo(i * 32 + 16, 32);
    g.lineTo(i * 32, 56);
    g.lineTo(i * 32 - 16, 32);
    g.closePath();
    g.stroke();
  }
  g.fillStyle = '#f0f0f0';
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 59, 128, 5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

const bandMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.62, 0.43, 0.14),
  metalness: 1,
  roughness: 0.48,
  bumpMap: makeBandBump(),
  bumpScale: 2.5,
  envMap,
  envMapIntensity: 1.2,
});

const darkStoneMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0b0d,
  roughness: 0.22,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMap,
  envMapIntensity: 1.0,
});

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x6a5744,
  roughness: 0.38,
  metalness: 0,
  envMap,
  envMapIntensity: 0.35,
});
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x56423a,
  roughness: 0.85,
  envMap,
  envMapIntensity: 0.15,
});

// ---------- room ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), wallMat);
wall.position.set(0, 20, -7);
wall.receiveShadow = true;
scene.add(wall);

// ---------- pedestal ----------
const pedestal = new THREE.Group();
scene.add(pedestal);
function addStep(w: number, h: number, y: number, mat: THREE.Material): void {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, w, 3, 0.025), mat);
  m.position.y = y + h / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  pedestal.add(m);
}
addStep(2.9, 0.3, 0, marbleMaterial(0.8, 0.1, 0.3));
addStep(2.3, 0.3, 0.3, marbleMaterial(0.7, 0.55, 0.05));
addStep(1.6, 1.9, 0.6, marbleMaterial(0.95, 0.2, 0.0));
addStep(1.95, 0.18, 2.5, marbleMaterial(0.6, 0.7, 0.6));
const pedestalTop = 2.68;

// ---------- trophy ----------
const trophy = new THREE.Group();
trophy.position.y = pedestalTop;
trophy.scale.setScalar(1.15);
scene.add(trophy);

// base: black polished stone with thin gold plate
const baseH = 0.22;
const base = new THREE.Mesh(new RoundedBoxGeometry(1.1, baseH, 1.1, 4, 0.035), darkStoneMat);
base.position.y = baseH / 2;
base.castShadow = true;
base.receiveShadow = true;
trophy.add(base);

const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.085, 0.012), goldMat);
plate.position.set(0, baseH / 2, 0.55 + 0.002);
plate.castShadow = true;
trophy.add(plate);

const goldGroup = new THREE.Group();
goldGroup.position.y = baseH;
trophy.add(goldGroup);

// cup profile (radius, height), outer wall first, then the inside of the bowl
const outerPts: [number, number][] = [
  [0.0, 0.0],
  [0.42, 0.0],
  [0.44, 0.03],
  [0.4, 0.08],
  [0.28, 0.13],
  [0.14, 0.2],
  [0.085, 0.3],
  [0.075, 0.42],
  [0.11, 0.5],
  [0.145, 0.56],
  [0.11, 0.63],
  [0.07, 0.7],
  [0.065, 0.82],
  [0.09, 0.92],
  [0.19, 1.0],
  [0.33, 1.12],
  [0.43, 1.3],
  [0.47, 1.5],
  [0.46, 1.66],
];
const innerPts: [number, number][] = [
  [0.45, 1.7],
  [0.435, 1.66],
  [0.4, 1.5],
  [0.3, 1.3],
  [0.16, 1.15],
  [0.0, 1.1],
];

function sampleProfile(pts: [number, number][], n: number): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  );
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

const outerSampled = sampleProfile(outerPts, 200);
const cupProfile = sampleProfile([...outerPts, ...innerPts], 320);
const cupGeo = new THREE.LatheGeometry(cupProfile, 128);
const cup = new THREE.Mesh(cupGeo, goldMat.clone());
(cup.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
cup.castShadow = true;
cup.receiveShadow = true;
goldGroup.add(cup);

function outerRadiusAt(y: number): number {
  for (let i = 1; i < outerSampled.length; i++) {
    const a = outerSampled[i - 1];
    const b = outerSampled[i];
    if (a.y <= y && b.y >= y && b.y > a.y && a.y > 0.8) {
      const t = (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 0.4;
}

function addBand(y: number, halfH: number, mat: THREE.Material): void {
  const r = Math.max(outerRadiusAt(y - halfH), outerRadiusAt(y + halfH), outerRadiusAt(y));
  const pts = [
    new THREE.Vector2(r - 0.05, y - halfH),
    new THREE.Vector2(r + 0.008, y - halfH),
    new THREE.Vector2(r + 0.016, y - halfH + 0.008),
    new THREE.Vector2(r + 0.016, y + halfH - 0.008),
    new THREE.Vector2(r + 0.008, y + halfH),
    new THREE.Vector2(r - 0.05, y + halfH),
  ];
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  goldGroup.add(m);
}
addBand(1.27, 0.06, bandMat);

// thin dark ring at the foot of the stem
const ringMat = bandMat.clone();
ringMat.bumpMap = null;
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 12, 64), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.71;
ring.scale.set(1, 1, 1);
ring.castShadow = true;
goldGroup.add(ring);

// handles
const handlePath = [
  [0.4, 1.46],
  [0.58, 1.57],
  [0.75, 1.5],
  [0.8, 1.34],
  [0.7, 1.14],
  [0.5, 1.02],
  [0.24, 1.04],
];
for (const side of [1, -1]) {
  const curve = new THREE.CatmullRomCurve3(
    handlePath.map(([x, y]) => new THREE.Vector3(x * side, y, 0)),
    false,
    'centripetal',
  );
  const h = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.033, 16, false), goldMat);
  h.castShadow = true;
  h.receiveShadow = true;
  goldGroup.add(h);
}

// ---------- lights ----------
const target = new THREE.Object3D();
target.position.set(0, 3.0, 0);
scene.add(target);

const key = new THREE.SpotLight(0xffd9a3, 480, 0, 0.34, 0.85, 2);
key.position.set(2.5, 10, 7.5);
key.target = target;
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 4;
key.shadow.camera.far = 30;
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
key.shadow.radius = 5;
scene.add(key);

const fill = new THREE.DirectionalLight(0x8fb0ff, 0.35);
fill.position.set(-8, 4, 8);
fill.target = target;
scene.add(fill);

const rim = new THREE.SpotLight(0xcfe0ff, 260, 0, 0.3, 1, 2);
rim.position.set(-4.5, 6.5, -5.5);
rim.target = target;
scene.add(rim);

scene.add(new THREE.HemisphereLight(0x6a5a50, 0x15100c, 0.25));

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(38, 640 / 360, 0.1, 100);
const lookAt = new THREE.Vector3(0, 3.55, 0);
const RADIUS = 11.8;
const CAM_Y = 4.4;

window.__TASK_STATE__ = { materials: ['marble', 'gold', 'darkstone'], cameraAzimuthDeg: 0 };

function frame(timeMs: number): void {
  const t = timeMs / 1000;
  const az = 15 * Math.sin(t * 0.35);
  const a = THREE.MathUtils.degToRad(az);
  camera.position.set(lookAt.x + RADIUS * Math.sin(a), CAM_Y, lookAt.z + RADIUS * Math.cos(a));
  camera.lookAt(lookAt);
  window.__TASK_STATE__.cameraAzimuthDeg = az;
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

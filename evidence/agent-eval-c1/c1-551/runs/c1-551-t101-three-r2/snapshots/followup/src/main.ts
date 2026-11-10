import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { walking: boolean };
  }
}

const PERIOD = 2; // seconds per full gait cycle
const STRIDE = 0.7; // half stroke of a foot along the body axis
const TILE = 1.4; // ground texture tile size (world units); 4*STRIDE = 2 tiles per loop
const LIFT = 0.6;
const FEMUR = 1.5;
const TIBIA = 1.9;
const FOOT_Y = 0.07;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const BG = 0xcfd2d8;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 14, 30);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(5.6, 5.2, 8.2);
camera.lookAt(0, 0.9, 0);

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(4, 9, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6);
fill.position.set(-6, 3, -2);
scene.add(fill);

// Ground with a scrolling grid so planted feet appear fixed
function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#e4e6ea';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#c3c7cf';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  g.fillStyle = '#d3d6dc';
  g.beginPath();
  g.arc(128, 128, 6, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const size = 60;
  tex.repeat.set(size / TILE, size / TILE);
  return tex;
}
const groundTex = makeGroundTexture();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Spider
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a26, roughness: 0.55 });
const markMat = new THREE.MeshStandardMaterial({ color: 0xb4572b, roughness: 0.5 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x2a211f, roughness: 0.6 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x9a4a28, roughness: 0.45 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.3 });

const spider = new THREE.Group();
scene.add(spider);

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const sphereGeo = new THREE.SphereGeometry(1, 32, 24);

// body faces +x
const thorax = addMesh(spider, sphereGeo, bodyMat);
thorax.scale.set(0.75, 0.5, 0.6);
thorax.position.set(0.35, 0, 0);

const abdomen = new THREE.Group();
abdomen.position.set(-0.75, 0.2, 0);
spider.add(abdomen);
const abdMesh = addMesh(abdomen, sphereGeo, bodyMat);
abdMesh.scale.set(1.15, 0.8, 0.85);
for (const [x, s] of [
  [-0.1, 0.22],
  [-0.5, 0.18],
] as const) {
  const spot = addMesh(abdomen, sphereGeo, markMat);
  spot.scale.set(s * 1.3, s * 0.5, s);
  spot.position.set(x, 0.72 - Math.abs(x) * 0.3, 0);
}

const head = addMesh(spider, sphereGeo, bodyMat);
head.scale.set(0.38, 0.32, 0.4);
head.position.set(1.0, 0.05, 0);

for (const side of [-1, 1]) {
  const eye = addMesh(spider, sphereGeo, eyeMat);
  eye.scale.setScalar(0.09);
  eye.position.set(1.3, 0.17, side * 0.15);
  const eye2 = addMesh(spider, sphereGeo, eyeMat);
  eye2.scale.setScalar(0.06);
  eye2.position.set(1.22, 0.3, side * 0.08);
  const fang = addMesh(spider, new THREE.ConeGeometry(0.06, 0.28, 12), markMat);
  fang.position.set(1.3, -0.15, side * 0.14);
  fang.rotation.z = Math.PI * 0.05;
}

// Legs
const segGeo = new THREE.CylinderGeometry(0.05, 0.085, 1, 14); // top (+y) thin, bottom thick
const tipGeo = new THREE.ConeGeometry(0.05, 0.2, 10);
const UP = new THREE.Vector3(0, 1, 0);

interface Leg {
  side: number; // +1 left (z+), -1 right (z-)
  hip: THREE.Vector3; // body-local hip position
  dir: THREE.Vector3; // horizontal outward direction (world, body not rotating)
  reach: number;
  group: number;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  hipJ: THREE.Mesh;
  kneeJ: THREE.Mesh;
  footJ: THREE.Mesh;
}

const legs: Leg[] = [];
const angles = [40, 75, 108, 140].map((d) => (d * Math.PI) / 180); // from +x axis toward the side
const hipX = [0.65, 0.4, 0.15, -0.1];
const reaches = [2.5, 2.5, 2.6, 2.7];

for (const side of [1, -1]) {
  for (let i = 0; i < 4; i++) {
    const a = angles[i] ?? 0;
    const upper = addMesh(scene, segGeo, legMat);
    const lower = addMesh(scene, segGeo, legMat);
    const hipJ = addMesh(scene, sphereGeo, jointMat);
    const kneeJ = addMesh(scene, sphereGeo, jointMat);
    hipJ.scale.setScalar(0.12);
    kneeJ.scale.setScalar(0.105);
    const footJ = addMesh(scene, tipGeo, jointMat);
    legs.push({
      side,
      hip: new THREE.Vector3(hipX[i] ?? 0, -0.05, side * 0.3),
      dir: new THREE.Vector3(Math.cos(a), 0, side * Math.sin(a)),
      reach: reaches[i] ?? 2.5,
      group: (i + (side > 0 ? 0 : 1)) % 2,
      upper,
      lower,
      hipJ,
      kneeJ,
      footJ,
    });
  }
}

function placeSegment(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(1, len, 1);
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

const tmpHip = new THREE.Vector3();
const tmpFoot = new THREE.Vector3();
const tmpKnee = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function updateLeg(leg: Leg, cycle: number, bodyY: number): void {
  const phase = (((cycle + leg.group * 0.5) % 1) + 1) % 1;
  let s: number;
  let lift = 0;
  if (phase < 0.5) {
    // stance: foot slides backward relative to the body
    s = STRIDE * (1 - 2 * (phase / 0.5));
  } else {
    // swing: lift, move forward, plant
    const u = (phase - 0.5) / 0.5;
    s = -STRIDE + 2 * STRIDE * smooth(u);
    lift = Math.sin(Math.PI * u) * LIFT;
  }

  void bodyY;
  tmpHip.copy(leg.hip).applyMatrix4(spider.matrixWorld);
  tmpFoot.set(leg.hip.x + leg.dir.x * leg.reach + s, FOOT_Y + lift, leg.hip.z + leg.dir.z * leg.reach);

  // two-bone IK, knee bends upward
  tmpD.subVectors(tmpFoot, tmpHip);
  const maxD = FEMUR + TIBIA - 0.01;
  const dist = Math.min(tmpD.length(), maxD);
  tmpD.normalize();
  const along = (FEMUR * FEMUR + dist * dist - TIBIA * TIBIA) / (2 * dist);
  const h = Math.sqrt(Math.max(FEMUR * FEMUR - along * along, 0));
  tmpP.copy(UP).addScaledVector(tmpD, -UP.dot(tmpD)).normalize();
  tmpKnee.copy(tmpHip).addScaledVector(tmpD, along).addScaledVector(tmpP, h);
  tmpFoot.copy(tmpHip).addScaledVector(tmpD, dist);

  placeSegment(leg.upper, tmpHip, tmpKnee);
  placeSegment(leg.lower, tmpKnee, tmpFoot);
  leg.hipJ.position.copy(tmpHip);
  leg.kneeJ.position.copy(tmpKnee);
  leg.footJ.position.copy(tmpFoot);
  leg.footJ.position.y -= 0.0;
  // cone tip points along the lower segment direction
  tmpD.subVectors(tmpFoot, tmpKnee).normalize();
  leg.footJ.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tmpD);
  leg.footJ.position.addScaledVector(tmpD, -0.08);
}

function update(tSec: number): void {
  const cycle = (tSec % PERIOD) / PERIOD; // 0..1 loops seamlessly
  const bodyY = 1.05 + 0.07 * Math.cos(4 * Math.PI * cycle); // two bobs per period (one per diagonal step)
  spider.position.set(0, bodyY, 0);
  spider.rotation.set(0.015 * Math.sin(2 * Math.PI * cycle), 0, 0.02 * Math.sin(2 * Math.PI * cycle));
  abdomen.rotation.z = 0.04 * Math.sin(4 * Math.PI * cycle);
  spider.updateMatrixWorld(true);

  for (const leg of legs) updateLeg(leg, cycle, bodyY);

  // ground scrolls backward at the stance speed: 4*STRIDE per period
  groundTex.offset.x = (4 * STRIDE * cycle) / TILE;
}

const state = { walking: true };
window.__TASK_STATE__ = state;
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) state.walking = !state.walking;
  }
});

let first = true;
let animTime = 0;
let lastMs: number | null = null;
function frame(ms: number): void {
  if (lastMs !== null && state.walking) animTime += Math.max(0, (ms - lastMs) / 1000);
  lastMs = ms;
  update(animTime);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

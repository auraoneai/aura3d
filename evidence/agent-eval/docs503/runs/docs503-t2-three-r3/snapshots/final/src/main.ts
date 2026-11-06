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

const FOG_COLOR = 0xb9cfdc;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0045);

const camera = new THREE.PerspectiveCamera(55, 640 / 360, 1, 600);

// Lighting
scene.add(new THREE.HemisphereLight(0xddeeff, 0x445533, 0.7));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(60, 90, 40);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -95;
sc.right = 95;
sc.top = 95;
sc.bottom = -95;
sc.near = 10;
sc.far = 250;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshLambertMaterial({ color: 0x5f7a45 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Deterministic PRNG
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
const rand = mulberry32(1337);

const TREES = 8000;
const ROCKS = 2000;
const HALF = 65;

// Geometries (base at y = 0)
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
trunkGeo.translate(0, 1, 0);
const canopyGeo = new THREE.ConeGeometry(1.5, 4, 8);
canopyGeo.translate(0, 2, 0);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);

const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
const trunks = new THREE.InstancedMesh(trunkGeo, white, TREES);
const canopies = new THREE.InstancedMesh(canopyGeo, white, TREES);
const rocks = new THREE.InstancedMesh(rockGeo, white, ROCKS);
for (const m of [trunks, canopies, rocks]) {
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const euler = new THREE.Euler();
const color = new THREE.Color();

for (let i = 0; i < TREES; i++) {
  const x = (rand() * 2 - 1) * HALF;
  const z = (rand() * 2 - 1) * HALF;
  const s = 0.8 + rand() * 1.4;
  const yaw = rand() * Math.PI * 2;
  quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  pos.set(x, 0, z);
  scl.set(s, s, s);
  m4.compose(pos, quat, scl);
  trunks.setMatrixAt(i, m4);
  color.setHSL(0.07 + rand() * 0.03, 0.4 + rand() * 0.2, 0.2 + rand() * 0.12);
  trunks.setColorAt(i, color);

  const w = 0.85 + rand() * 0.5;
  pos.set(x, 1.5 * s, z);
  scl.set(s * w, s * (0.9 + rand() * 0.4), s * w);
  m4.compose(pos, quat, scl);
  canopies.setMatrixAt(i, m4);
  color.setHSL(0.22 + rand() * 0.14, 0.45 + rand() * 0.3, 0.2 + rand() * 0.18);
  canopies.setColorAt(i, color);
}

for (let i = 0; i < ROCKS; i++) {
  const x = (rand() * 2 - 1) * HALF;
  const z = (rand() * 2 - 1) * HALF;
  const s = 0.4 + rand() * 1.1;
  euler.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
  quat.setFromEuler(euler);
  pos.set(x, s * 0.4, z);
  scl.set(s * (0.9 + rand() * 0.5), s * (0.5 + rand() * 0.4), s * (0.9 + rand() * 0.5));
  m4.compose(pos, quat, scl);
  rocks.setMatrixAt(i, m4);
  const g = 0.25 + rand() * 0.35;
  color.setRGB(g * (0.95 + rand() * 0.1), g, g * (0.9 + rand() * 0.15));
  rocks.setColorAt(i, color);
}

for (const m of [trunks, canopies, rocks]) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
}

const RADIUS = 105;
const HEIGHT = 62;
function frame(t: number): void {
  const a = t * 0.00008 + 0.6;
  camera.position.set(Math.cos(a) * RADIUS, HEIGHT, Math.sin(a) * RADIUS);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 50;
const SEED = 1234567;

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

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const FOG_COLOR = 0xb9cfe0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0035);

const camera = new THREE.PerspectiveCamera(42, 640 / 360, 1, 400);

// Lighting
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(45, 70, 30);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -70;
sc.right = 70;
sc.top = 70;
sc.bottom = -70;
sc.near = 10;
sc.far = 200;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(110, 64),
  new THREE.MeshStandardMaterial({ color: 0x5d7a45, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Geometries (base sits on y = 0)
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6);
trunkGeo.translate(0, 0.8, 0);
const canopyGeo = new THREE.ConeGeometry(1.4, 3.4, 8);
canopyGeo.translate(0, 1.6 + 1.7 - 0.4, 0);
const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);

const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
for (const m of [trunks, canopies, rocks]) {
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
}

const rand = mulberry32(SEED);
const dummy = new THREE.Object3D();
const color = new THREE.Color();

function randomInDisk(): [number, number] {
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const a = rand() * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

for (let i = 0; i < TREE_COUNT; i++) {
  const [x, z] = randomInDisk();
  const s = 0.7 + rand() * 1.0;
  const sy = s * (0.85 + rand() * 0.5);
  const rotY = rand() * Math.PI * 2;

  dummy.position.set(x, 0, z);
  dummy.rotation.set(0, rotY, 0);
  dummy.scale.set(s, sy, s);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  canopies.setMatrixAt(i, dummy.matrix);

  color.setHSL(0.06 + rand() * 0.03, 0.4, 0.2 + rand() * 0.1);
  trunks.setColorAt(i, color);
  color.setHSL(0.22 + rand() * 0.14, 0.45 + rand() * 0.25, 0.22 + rand() * 0.16);
  canopies.setColorAt(i, color);
}

for (let i = 0; i < ROCK_COUNT; i++) {
  const [x, z] = randomInDisk();
  const s = 0.4 + rand() * 1.1;
  dummy.position.set(x, 0.25 * s, z);
  dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
  dummy.scale.set(s * (0.8 + rand() * 0.6), s * (0.5 + rand() * 0.4), s * (0.8 + rand() * 0.6));
  dummy.updateMatrix();
  rocks.setMatrixAt(i, dummy.matrix);

  const g = 0.3 + rand() * 0.3;
  color.setRGB(g * (0.95 + rand() * 0.1), g * (0.92 + rand() * 0.1), g * (0.88 + rand() * 0.12));
  rocks.setColorAt(i, color);
}

for (const m of [trunks, canopies, rocks]) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
scene.add(trunks, canopies, rocks);

// Camera orbit
const ORBIT_RADIUS = 92;
const ORBIT_HEIGHT = 58;
const ORBIT_SPEED = 0.05; // rad/s
const lookAt = new THREE.Vector3(0, 2, 0);

function render(timeMs: number): void {
  const a = (timeMs / 1000) * ORBIT_SPEED;
  camera.position.set(Math.cos(a) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(a) * ORBIT_RADIUS);
  camera.lookAt(lookAt);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

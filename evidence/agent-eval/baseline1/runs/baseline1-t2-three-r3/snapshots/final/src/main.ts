import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 55;
const SEED = 1337;

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
renderer.shadowMap.type = THREE.PCFShadowMap;

const FOG_COLOR = 0xb9cfdc;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.005);

const camera = new THREE.PerspectiveCamera(45, 640 / 360, 1, 600);

// Lighting
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a3a, 0.8));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -80;
sc.right = 80;
sc.top = 80;
sc.bottom = -80;
sc.near = 10;
sc.far = 250;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.3;
scene.add(sun);
scene.add(sun.target);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x5f7a45, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Geometries
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
trunkGeo.translate(0, 0.5, 0); // base at y=0, height 1
const canopyGeo = new THREE.ConeGeometry(1, 1, 8);
canopyGeo.translate(0, 0.5, 0); // base at y=0, height 1
const rockGeo = new THREE.DodecahedronGeometry(1, 0);

const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

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

function randomPoint(): [number, number] {
  const r = Math.sqrt(rand()) * FOREST_RADIUS;
  const a = rand() * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

for (let i = 0; i < TREE_COUNT; i++) {
  const [x, z] = randomPoint();
  const s = 0.7 + rand() * 0.9;
  const rotY = rand() * Math.PI * 2;
  const trunkH = 1.6 * s;
  const canopyH = 4.5 * s;
  const canopyR = 1.5 * s;

  dummy.position.set(x, 0, z);
  dummy.rotation.set(0, rotY, 0);
  dummy.scale.set(s, trunkH, s);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  color.setHSL(0.07 + rand() * 0.04, 0.45, 0.2 + rand() * 0.1);
  trunks.setColorAt(i, color);

  dummy.position.set(x, trunkH * 0.7, z);
  dummy.scale.set(canopyR, canopyH, canopyR);
  dummy.updateMatrix();
  canopies.setMatrixAt(i, dummy.matrix);
  color.setHSL(0.24 + rand() * 0.12, 0.5 + rand() * 0.2, 0.2 + rand() * 0.18);
  canopies.setColorAt(i, color);
}

for (let i = 0; i < ROCK_COUNT; i++) {
  const [x, z] = randomPoint();
  const s = 0.3 + rand() * rand() * 1.4;
  dummy.position.set(x, s * 0.4, z);
  dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
  dummy.scale.set(s * (0.8 + rand() * 0.6), s * (0.6 + rand() * 0.4), s * (0.8 + rand() * 0.6));
  dummy.updateMatrix();
  rocks.setMatrixAt(i, dummy.matrix);
  const g = 0.3 + rand() * 0.35;
  color.setRGB(g * (0.95 + rand() * 0.1), g, g * (0.9 + rand() * 0.1));
  rocks.setColorAt(i, color);
}

for (const m of [trunks, canopies, rocks]) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
}

// Camera orbit
const ORBIT_RADIUS = 105;
const ORBIT_HEIGHT = 55;
function updateCamera(t: number): void {
  const a = t * 0.08;
  camera.position.set(Math.cos(a) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(a) * ORBIT_RADIUS);
  camera.lookAt(0, 3, 0);
}

function frame(ms: number): void {
  updateCamera(ms / 1000);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}

updateCamera(0);
requestAnimationFrame(frame);

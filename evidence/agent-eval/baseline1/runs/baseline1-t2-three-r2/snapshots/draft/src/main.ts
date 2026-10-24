import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_HALF = 50; // forest occupies a square [-50, 50]^2
const SEED = 1337;

// Deterministic PRNG (mulberry32)
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
const rand = mulberry32(SEED);
const range = (a: number, b: number): number => a + (b - a) * rand();

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const FOG_COLOR = 0xb9cfdc;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.006);

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 1, 600);

// Lighting: one directional (shadow casting) light + non-shadow hemisphere ambient fill
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.position.set(60, 90, 35);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -75;
sc.right = 75;
sc.top = 75;
sc.bottom = -75;
sc.near = 10;
sc.far = 250;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.9));

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x5b7a3c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Geometries (unit-ish, base at y=0)
const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6);
trunkGeo.translate(0, 0.5, 0);
const canopyGeo = new THREE.ConeGeometry(1, 1, 8);
canopyGeo.translate(0, 0.5, 0);
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

const dummy = new THREE.Object3D();
const color = new THREE.Color();

for (let i = 0; i < TREE_COUNT; i++) {
  const x = range(-FOREST_HALF, FOREST_HALF);
  const z = range(-FOREST_HALF, FOREST_HALF);
  const rotY = range(0, Math.PI * 2);
  const h = range(3.5, 6.5); // total height
  const trunkH = h * 0.35;
  const canopyH = h * 0.85;
  const canopyR = range(0.9, 1.6) * (h / 5);

  dummy.position.set(x, 0, z);
  dummy.rotation.set(0, rotY, 0);
  dummy.scale.set(1, trunkH, 1);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  color.setHSL(range(0.06, 0.09), range(0.35, 0.5), range(0.14, 0.26));
  trunks.setColorAt(i, color);

  dummy.position.set(x, h - canopyH + 0.0 + trunkH * 0.0, z);
  dummy.scale.set(canopyR, canopyH, canopyR);
  dummy.updateMatrix();
  canopies.setMatrixAt(i, dummy.matrix);
  color.setHSL(range(0.22, 0.4), range(0.4, 0.7), range(0.16, 0.34));
  canopies.setColorAt(i, color);
}

for (let i = 0; i < ROCK_COUNT; i++) {
  const s = range(0.3, 1.1);
  dummy.position.set(range(-FOREST_HALF, FOREST_HALF), s * 0.4, range(-FOREST_HALF, FOREST_HALF));
  dummy.rotation.set(range(0, Math.PI), range(0, Math.PI), range(0, Math.PI));
  dummy.scale.set(s * range(0.8, 1.4), s * range(0.6, 1.0), s * range(0.8, 1.4));
  dummy.updateMatrix();
  rocks.setMatrixAt(i, dummy.matrix);
  const g = range(0.25, 0.6);
  color.setRGB(g * range(0.95, 1.1), g, g * range(0.85, 1.0));
  rocks.setColorAt(i, color);
}

for (const m of [trunks, canopies, rocks]) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
}

// Orbiting camera
const ORBIT_RADIUS = 105;
const ORBIT_HEIGHT = 55;
const ORBIT_SPEED = 0.06; // rad/s

function render(timeMs: number): void {
  const a = (timeMs / 1000) * ORBIT_SPEED;
  camera.position.set(Math.cos(a) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(a) * ORBIT_RADIUS);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

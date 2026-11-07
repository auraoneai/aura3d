import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const HALF = 60; // forest covers [-HALF, HALF] on x and z
const FOG_COLOR = 0xb8cde0;

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
const rand = mulberry32(20240607);
const range = (a: number, b: number): number => a + (b - a) * rand();

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.004);

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 1, 600);

// Lights
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a5a3a, 0.8));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
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
sc.far = 260;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x5b7a3f, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Instanced meshes
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
trunkGeo.translate(0, 0.5, 0); // base at y=0, height 1
const canopyGeo = new THREE.ConeGeometry(1, 1, 8);
canopyGeo.translate(0, 0.5, 0); // base at y=0, height 1
const rockGeo = new THREE.DodecahedronGeometry(1, 0);

const white = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

const trunks = new THREE.InstancedMesh(trunkGeo, white(), TREE_COUNT);
const canopies = new THREE.InstancedMesh(canopyGeo, white(), TREE_COUNT);
const rocks = new THREE.InstancedMesh(rockGeo, white(), ROCK_COUNT);
for (const m of [trunks, canopies, rocks]) {
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();

for (let i = 0; i < TREE_COUNT; i++) {
  const x = range(-HALF, HALF);
  const z = range(-HALF, HALF);
  const h = range(1.6, 3.2); // trunk height
  const ch = range(3, 6.5); // canopy height
  const cr = ch * range(0.32, 0.45); // canopy radius
  const ry = range(0, Math.PI * 2);

  dummy.position.set(x, 0, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(1, h, 1);
  dummy.updateMatrix();
  trunks.setMatrixAt(i, dummy.matrix);
  color.setHSL(range(0.06, 0.1), range(0.35, 0.5), range(0.2, 0.32));
  trunks.setColorAt(i, color);

  dummy.position.set(x, h * 0.7, z);
  dummy.scale.set(cr, ch, cr);
  dummy.updateMatrix();
  canopies.setMatrixAt(i, dummy.matrix);
  color.setHSL(range(0.22, 0.4), range(0.4, 0.7), range(0.18, 0.38));
  canopies.setColorAt(i, color);
}

for (let i = 0; i < ROCK_COUNT; i++) {
  const s = range(0.3, 1.2);
  dummy.position.set(range(-HALF, HALF), s * 0.4, range(-HALF, HALF));
  dummy.rotation.set(range(0, Math.PI), range(0, Math.PI * 2), range(0, Math.PI));
  dummy.scale.set(s * range(0.8, 1.3), s * range(0.6, 1), s * range(0.8, 1.3));
  dummy.updateMatrix();
  rocks.setMatrixAt(i, dummy.matrix);
  color.setHSL(range(0.05, 0.14), range(0, 0.15), range(0.3, 0.6));
  rocks.setColorAt(i, color);
}

for (const m of [trunks, canopies, rocks]) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
}

// Camera orbit
const RADIUS = 125;
const HEIGHT = 70;
function updateCamera(t: number): void {
  const a = t * 0.08;
  camera.position.set(Math.cos(a) * RADIUS, HEIGHT, Math.sin(a) * RADIUS);
  camera.lookAt(0, 0, 0);
}

let first = true;
function frame(ms: number): void {
  updateCamera(ms / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

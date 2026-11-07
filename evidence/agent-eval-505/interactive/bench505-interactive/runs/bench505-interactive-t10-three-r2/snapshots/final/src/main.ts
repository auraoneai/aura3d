import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const GROW_SECONDS = 8;
const GROUND_W = 20;
const GROUND_D = 13;
const GROUND_CZ = -0.5;

interface PlantState {
  x: number;
  z: number;
  growth: number;
}

declare global {
  interface Window {
    __TASK_STATE__: Readonly<{
      readonly plantCount: number;
      readonly plants: PlantState[];
      readonly ready: boolean;
    }>;
    __plantAt: (x: number, z: number) => void;
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// Sky gradient background
{
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#6fb4ee');
    grad.addColorStop(1, '#dff1fb');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 200);
camera.position.set(0, 8, 11);
camera.lookAt(0, 0, 0);

// Lights
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a7a3a, 0.8));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -13;
sun.shadow.camera.right = 13;
sun.shadow.camera.top = 13;
sun.shadow.camera.bottom = -13;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_W, GROUND_D),
  new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, GROUND_CZ);
ground.receiveShadow = true;
scene.add(ground);

// Shared geometry
const stemGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 6);
stemGeo.translate(0, 0.5, 0);

function buildLeaves(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const heights = [0.2, 0.38, 0.56];
  for (let i = 0; i < heights.length; i++) {
    for (let side = 0; side < 2; side++) {
      const leaf = new THREE.SphereGeometry(1, 8, 6);
      leaf.scale(0.34, 0.05, 0.14);
      leaf.translate(0.34, 0, 0);
      leaf.rotateZ(0.45);
      leaf.rotateY(i * 1.9 + side * Math.PI);
      leaf.translate(0, heights[i] * 1.6, 0);
      parts.push(leaf);
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

function buildPetals(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const p = new THREE.SphereGeometry(1, 8, 6);
    p.scale(0.24, 0.04, 0.12);
    p.translate(0.26, 0, 0);
    p.rotateZ(0.2);
    p.rotateY((i / n) * Math.PI * 2);
    parts.push(p);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

const leavesGeo = buildLeaves();
const petalsGeo = buildPetals();
const centerGeo = new THREE.SphereGeometry(0.12, 10, 8);
centerGeo.scale(1, 0.7, 1);
const centerMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.6 });

const petalPalette = [0xe8344e, 0xff8a1f, 0xf4e04d, 0xb056e0, 0xff6fb5, 0xffffff, 0x4f8cff, 0xff5a36];
const petalMats = petalPalette.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide }),
);

const sproutColor = new THREE.Color(0xb9e07a);
const matureColor = new THREE.Color(0x2f8a34);

interface Plant {
  x: number;
  z: number;
  born: number;
  height: number;
  headSize: number;
  group: THREE.Group;
  stem: THREE.Mesh;
  leaves: THREE.Mesh;
  head: THREE.Group;
  greenMat: THREE.MeshStandardMaterial;
}

const plants: Plant[] = [];
const plantRoot = new THREE.Group();
scene.add(plantRoot);

const clock = () => performance.now() / 1000;

function growthOf(p: Plant, now: number): number {
  return Math.min(1, Math.max(0, (now - p.born) / GROW_SECONDS));
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function plantAt(x: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;

  const greenMat = new THREE.MeshStandardMaterial({ color: sproutColor.clone(), roughness: 0.8 });
  const stem = new THREE.Mesh(stemGeo, greenMat);
  const leaves = new THREE.Mesh(leavesGeo, greenMat);
  stem.castShadow = true;
  leaves.castShadow = true;

  const head = new THREE.Group();
  const petals = new THREE.Mesh(petalsGeo, petalMats[Math.floor(Math.random() * petalMats.length)]);
  const center = new THREE.Mesh(centerGeo, centerMat);
  petals.castShadow = true;
  center.castShadow = true;
  head.add(petals, center);
  head.visible = false;

  group.add(stem, leaves, head);
  plantRoot.add(group);

  const plant: Plant = {
    x,
    z,
    born: clock(),
    height: 1.4 + Math.random() * 0.7,
    headSize: 0.75 + Math.random() * 0.7,
    group,
    stem,
    leaves,
    head,
    greenMat,
  };
  plants.push(plant);
  updatePlant(plant, plant.born);
  updateCount();
}

function updatePlant(p: Plant, now: number): void {
  const g = growthOf(p, now);
  const e = smooth(0, 1, g);
  const h = p.height * (0.08 + 0.92 * e);
  p.stem.scale.set(0.6 + 0.4 * e, h, 0.6 + 0.4 * e);

  // Leaves are modelled for a 1.6-high plant; scale them with the stem.
  p.leaves.scale.setScalar(Math.max(0.12, h / 1.6));

  const bloom = smooth(0.55, 1, g);
  p.head.visible = bloom > 0.01;
  p.head.position.y = h;
  p.head.scale.setScalar(Math.max(0.001, bloom * p.headSize));

  p.greenMat.color.copy(sproutColor).lerp(matureColor, smooth(0, 0.9, g));
}

function clearPlants(): void {
  for (const p of plants) {
    plantRoot.remove(p.group);
    p.greenMat.dispose();
  }
  plants.length = 0;
  updateCount();
}

// Overlay
const overlay = document.createElement('div');
overlay.style.cssText =
  'position:fixed;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;' +
  'background:rgba(0,0,0,0.55);border-radius:6px;color:#fff;font:13px system-ui,sans-serif;z-index:10;';
const countEl = document.createElement('span');
const clearBtn = document.createElement('button');
clearBtn.textContent = 'Clear';
clearBtn.style.cssText = 'font:inherit;padding:2px 10px;cursor:pointer;';
clearBtn.addEventListener('click', clearPlants);
overlay.append(countEl, clearBtn);
document.body.appendChild(overlay);

function updateCount(): void {
  countEl.textContent = `Plants: ${plants.length}`;
}
updateCount();

// Click → ground
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (!hit) return;
  plantAt(hit.point.x, hit.point.z);
});

// Exposed state
let ready = false;
Object.defineProperty(window, '__TASK_STATE__', {
  configurable: false,
  enumerable: true,
  get() {
    const now = clock();
    const snapshot = plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
    return Object.freeze({
      plantCount: plants.length,
      plants: snapshot,
      ready,
    });
  },
});
Object.defineProperty(window, '__plantAt', {
  configurable: false,
  enumerable: true,
  writable: false,
  value: (x: number, z: number) => plantAt(Number(x), Number(z)),
});

function frame(): void {
  const now = clock();
  for (const p of plants) updatePlant(p, now);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

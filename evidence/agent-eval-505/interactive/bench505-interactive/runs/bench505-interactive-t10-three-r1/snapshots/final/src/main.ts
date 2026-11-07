import * as THREE from 'three';

const GROW_SECONDS = 8;
const GROUND_W = 24;
const GROUND_D = 16;

interface PlantRecord {
  x: number;
  z: number;
  growth: number;
}

declare global {
  interface Window {
    __TASK_STATE__: { readonly plantCount: number; readonly plants: PlantRecord[]; readonly ready: boolean };
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

// Sky background (generated gradient, no external assets)
function makeSky(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6fb4ee');
  grad.addColorStop(1, '#e6f3fb');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const scene = new THREE.Scene();
scene.background = makeSky();

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 11.5, 13.5);
camera.lookAt(0, 0, 0.5);

// Lights
scene.add(new THREE.HemisphereLight(0xdcefff, 0x6b5a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(-7, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -15;
sc.right = 15;
sc.top = 12;
sc.bottom = -12;
sc.near = 1;
sc.far = 40;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// Ground
function makeGrassTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#5c9a3c';
  g.fillRect(0, 0, size, size);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 3500; i++) {
    const l = 30 + rnd() * 25;
    g.fillStyle = `hsl(${85 + rnd() * 30}, ${40 + rnd() * 25}%, ${l}%)`;
    g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_W, GROUND_D),
  new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Shared geometry and materials
const stemGeo = new THREE.CylinderGeometry(0.03, 0.055, 1, 6);
stemGeo.translate(0, 0.5, 0);
const leafGeo = new THREE.SphereGeometry(1, 8, 6);
leafGeo.scale(0.3, 0.04, 0.13);
leafGeo.translate(0.3, 0, 0);
const petalGeo = new THREE.SphereGeometry(1, 8, 6);
petalGeo.scale(0.17, 0.035, 0.075);
petalGeo.translate(0.2, 0, 0);
const centerGeo = new THREE.SphereGeometry(0.09, 10, 8);

const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f8a35, roughness: 0.8 });
const centerMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
const petalColors = [0xff4d6d, 0xffd23f, 0xffffff, 0xb36bff, 0xff8c42, 0x5fa8ff, 0xff7ac6];
const petalMats = petalColors.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide }),
);

const sproutLeaf = new THREE.Color(0xa6e66b);
const matureLeaf = new THREE.Color(0x2f8a3a);

const LEAF_COUNT = 4;
const PETALS = 6;

interface Plant {
  x: number;
  z: number;
  born: number;
  growth: number;
  maxH: number;
  flowerSize: number;
  group: THREE.Group;
  stem: THREE.Mesh;
  leaves: THREE.Mesh[];
  leafMat: THREE.MeshStandardMaterial;
  flower: THREE.Group;
}

const plants: Plant[] = [];
const plantRoot = new THREE.Group();
scene.add(plantRoot);

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function plantAt(x: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;

  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.castShadow = true;
  group.add(stem);

  const leafMat = new THREE.MeshStandardMaterial({ color: sproutLeaf, roughness: 0.7, side: THREE.DoubleSide });
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.rotation.order = 'YZX';
    leaf.rotation.y = i * Math.PI * 0.5 + (i % 2) * 0.4;
    leaf.rotation.z = 0.35;
    leaf.castShadow = true;
    group.add(leaf);
    leaves.push(leaf);
  }

  const flower = new THREE.Group();
  const petalMat = petalMats[Math.floor(Math.random() * petalMats.length)];
  for (let i = 0; i < PETALS; i++) {
    const p = new THREE.Mesh(petalGeo, petalMat);
    p.rotation.order = 'YZX';
    p.rotation.y = (i / PETALS) * Math.PI * 2;
    p.rotation.z = 0.2;
    p.castShadow = true;
    flower.add(p);
  }
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.scale.y = 0.7;
  flower.add(center);
  flower.rotation.x = (Math.random() - 0.5) * 0.3;
  flower.visible = false;
  group.add(flower);

  plantRoot.add(group);
  const plant: Plant = {
    x,
    z,
    born: performance.now(),
    growth: 0,
    maxH: 1.0 + Math.random() * 0.8,
    flowerSize: 0.8 + Math.random() * 0.7,
    group,
    stem,
    leaves,
    leafMat,
    flower,
  };
  plants.push(plant);
  updatePlant(plant, plant.born);
  updateCounter();
}

function updatePlant(p: Plant, now: number): void {
  if (p.growth >= 1 && p.stem.scale.y > 0 && now - p.born > GROW_SECONDS * 1000 + 100) return;
  const g = Math.min(1, Math.max(0, (now - p.born) / (GROW_SECONDS * 1000)));
  p.growth = g;
  const e = g * g * (3 - 2 * g);
  const h = p.maxH * (0.1 + 0.9 * e);
  p.stem.scale.set(0.6 + 0.4 * e, h, 0.6 + 0.4 * e);
  const ls = 0.22 + 0.78 * e;
  for (let i = 0; i < p.leaves.length; i++) {
    const frac = 0.97 - i * 0.2 * e - (i === 0 ? 0 : 0.0);
    const leaf = p.leaves[i];
    leaf.position.y = h * Math.max(0.12, frac - (i > 1 ? 0.1 * e : 0));
    // sprout shows only two cotyledons; other leaves unfold as it grows
    const unfold = i < 2 ? 1 : smoothstep(0.15 + 0.1 * i, 0.6 + 0.1 * i, g);
    const s = ls * unfold * (1 + (i % 2) * 0.1);
    leaf.scale.setScalar(Math.max(0.0001, s));
    leaf.visible = s > 0.002;
    leaf.rotation.z = 0.25 + 0.3 * e;
  }
  p.leafMat.color.copy(sproutLeaf).lerp(matureLeaf, e);
  const fs = smoothstep(0.45, 1, g) * p.flowerSize;
  p.flower.visible = fs > 0.01;
  p.flower.scale.setScalar(Math.max(0.0001, fs));
  p.flower.position.set(0, h + 0.02, 0);
}

function clearPlants(): void {
  for (const p of plants) {
    plantRoot.remove(p.group);
    p.leafMat.dispose();
  }
  plants.length = 0;
  updateCounter();
}

// Overlay
const overlay = document.createElement('div');
overlay.style.cssText =
  'position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:8px;padding:6px 10px;' +
  'background:rgba(0,0,0,0.55);color:#fff;border-radius:6px;font:13px system-ui,sans-serif;user-select:none;';
const counter = document.createElement('span');
const clearBtn = document.createElement('button');
clearBtn.textContent = 'Clear';
clearBtn.style.cssText = 'font:inherit;padding:2px 8px;cursor:pointer;';
clearBtn.addEventListener('click', clearPlants);
overlay.append(counter, clearBtn);
document.body.appendChild(overlay);

function updateCounter(): void {
  counter.textContent = `Plants: ${plants.length}`;
}
updateCounter();

// Click -> ground
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
canvas.addEventListener('click', (ev: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (hit) plantAt(hit.point.x, hit.point.z);
});

// State
let ready = false;
const state = {} as Window['__TASK_STATE__'];
Object.defineProperties(state, {
  plantCount: { get: () => plants.length, enumerable: true },
  plants: {
    get: () => plants.map((p) => ({ x: p.x, z: p.z, growth: Math.min(1, Math.max(0, (performance.now() - p.born) / (GROW_SECONDS * 1000))) })),
    enumerable: true,
  },
  ready: { get: () => ready, enumerable: true },
});
Object.defineProperty(window, '__TASK_STATE__', { value: state, writable: false, configurable: false });
window.__plantAt = plantAt;

function frame(): void {
  const now = performance.now();
  for (const p of plants) updatePlant(p, now);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

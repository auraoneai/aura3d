import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface PlantState {
  x: number;
  z: number;
  growth: number;
}
interface TaskState {
  readonly plantCount: number;
  readonly plants: PlantState[];
  readonly ready: boolean;
}
declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __plantAt: (x: number, z: number) => boolean;
    __EVAL_READY__?: boolean;
  }
}

const GROW_MS = 8000;
const GROUND_RADIUS = 18;
const SKY = 0xbfe3f5;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 25, 48);

const camera = new THREE.PerspectiveCamera(48, 640 / 360, 0.1, 100);
camera.position.set(0, 12, 14);
camera.lookAt(0, 0, 1);
camera.updateMatrixWorld();

// Lighting
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6b5a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(-8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -GROUND_RADIUS;
sc.right = GROUND_RADIUS;
sc.top = GROUND_RADIUS;
sc.bottom = -GROUND_RADIUS;
sc.near = 1;
sc.far = 50;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// Ground with procedural noise texture (no network assets)
function makeGroundTexture(): THREE.DataTexture {
  const n = 128;
  const data = new Uint8Array(n * n * 4);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n * n; i++) {
    const v = rnd();
    const patch = 0.85 + 0.3 * rnd();
    data[i * 4] = Math.min(255, (70 + v * 40) * patch);
    data[i * 4 + 1] = Math.min(255, (130 + v * 50) * patch);
    data[i * 4 + 2] = Math.min(255, (55 + v * 30) * patch);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(GROUND_RADIUS, 64),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Shared plant geometry
const stemGeo = new THREE.CylinderGeometry(0.035, 0.055, 1, 6);
stemGeo.translate(0, 0.5, 0);

const leafGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  const heights = [0.18, 0.3, 0.42, 0.52];
  for (let i = 0; i < heights.length; i++) {
    const g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(0.28, 0.04, 0.1);
    g.translate(0.26, 0, 0);
    g.rotateZ(0.5);
    g.rotateY((i * Math.PI) / 2 + i * 0.4);
    g.translate(0, heights[i], 0);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
})();

const petalGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(0.17, 0.035, 0.07);
    g.translate(0.2, 0, 0);
    g.rotateZ(0.25);
    g.rotateY((i / count) * Math.PI * 2);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
})();

const centerGeo = new THREE.SphereGeometry(0.1, 10, 8);
centerGeo.scale(1, 0.6, 1);
const centerMat = new THREE.MeshStandardMaterial({ color: 0xf2b21a, roughness: 0.7 });

const petalPalette = [0xff5d73, 0xffd23f, 0xffffff, 0xb36bff, 0xff8a3d, 0x5fa8ff, 0xff7ad9];
const petalMats = petalPalette.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }),
);

const sproutColor = new THREE.Color(0xa8e063);
const matureColor = new THREE.Color(0x2f8f3a);

interface Plant {
  group: THREE.Group;
  stem: THREE.Mesh;
  leaves: THREE.Mesh;
  head: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  x: number;
  z: number;
  born: number;
  height: number;
  headSize: number;
  growth: number;
}

const plants: Plant[] = [];
const plantRoot = new THREE.Group();
scene.add(plantRoot);

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function applyGrowth(p: Plant, g: number): void {
  p.growth = g;
  const e = smooth(0, 1, g);
  p.stem.scale.set(0.6 + 0.6 * e, 0.12 + 0.88 * e, 0.6 + 0.6 * e);
  p.stem.scale.y *= p.height;
  const ls = 0.35 + 0.65 * smooth(0.05, 0.75, g);
  p.leaves.scale.set(ls, ls * p.height, ls);
  const fs = smooth(0.55, 1, g);
  p.head.visible = fs > 0.001;
  p.head.position.y = p.height * (0.12 + 0.88 * e) + 0.02;
  p.head.scale.setScalar(Math.max(0.001, fs * p.headSize));
  p.mat.color.copy(sproutColor).lerp(matureColor, smooth(0, 0.8, g));
}

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x * x + z * z > GROUND_RADIUS * GROUND_RADIUS) return false;
  const mat = new THREE.MeshStandardMaterial({ color: sproutColor, roughness: 0.8 });
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  const size = 0.8 + Math.random() * 0.6;
  group.scale.setScalar(1.5 * size);

  const stem = new THREE.Mesh(stemGeo, mat);
  const leaves = new THREE.Mesh(leafGeo, mat);
  const head = new THREE.Group();
  const petals = new THREE.Mesh(
    petalGeo,
    petalMats[Math.floor(Math.random() * petalMats.length)],
  );
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.position.y = 0.025;
  head.add(petals, center);
  head.rotation.x = -0.25;
  for (const m of [stem, leaves, petals, center]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(stem, leaves, head);
  plantRoot.add(group);

  const p: Plant = {
    group,
    stem,
    leaves,
    head,
    mat,
    x,
    z,
    born: performance.now(),
    height: 0.85 + Math.random() * 0.45,
    headSize: 0.8 + Math.random() * 0.7,
    growth: 0,
  };
  applyGrowth(p, 0);
  plants.push(p);
  updateLabel();
  return true;
}

function clearPlants(): void {
  for (const p of plants) {
    plantRoot.remove(p.group);
    p.mat.dispose();
  }
  plants.length = 0;
  updateLabel();
}

// Overlay
const overlay = document.createElement('div');
overlay.style.cssText =
  'position:absolute;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;' +
  'background:rgba(0,0,0,0.55);border-radius:6px;color:#fff;font:13px/1.4 system-ui,sans-serif;user-select:none;';
const label = document.createElement('span');
label.id = 'plant-count';
const clearBtn = document.createElement('button');
clearBtn.id = 'clear-btn';
clearBtn.type = 'button';
clearBtn.textContent = 'Clear';
clearBtn.style.cssText = 'font:inherit;padding:2px 10px;cursor:pointer;';
clearBtn.addEventListener('click', clearPlants);
overlay.append(label, clearBtn);
document.body.appendChild(overlay);

function updateLabel(): void {
  label.textContent = `Plants: ${plants.length}`;
}
updateLabel();

// Click -> ground
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
canvas.addEventListener('click', (ev: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (hit) plantAt(hit.point.x, hit.point.z);
});

// State
let ready = false;
const state = {} as { -readonly [K in keyof TaskState]: TaskState[K] };
Object.defineProperties(state, {
  plantCount: { get: () => plants.length, enumerable: true },
  plants: {
    get: () => plants.map((p) => ({ x: p.x, z: p.z, growth: p.growth })),
    enumerable: true,
  },
  ready: { get: () => ready, enumerable: true },
});
Object.defineProperty(window, '__TASK_STATE__', { value: Object.freeze(state), writable: false });
window.__plantAt = (x: number, z: number) => plantAt(Number(x), Number(z));

function frame(): void {
  const now = performance.now();
  for (const p of plants) {
    const g = Math.min(1, (now - p.born) / GROW_MS);
    if (g !== p.growth || g < 1) applyGrowth(p, g);
  }
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

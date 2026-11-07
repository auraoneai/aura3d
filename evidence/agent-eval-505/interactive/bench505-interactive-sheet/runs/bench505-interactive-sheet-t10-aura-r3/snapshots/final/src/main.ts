import { camera, createAuraApp, lights, material, primitives, scene, instances, type AuraTransformSpec } from "@aura3d/engine";

interface PlantInfo { x: number; z: number; growth: number }
interface TaskState { readonly plantCount: number; readonly plants: PlantInfo[]; readonly ready: boolean }

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: TaskState;
    __plantAt?: (x: number, z: number) => boolean;
  }
}

const GROW_MS = 8000;
const MAX_PLANTS = 300;
const HALF = 11; // ground half-extent
const CAM_POS: [number, number, number] = [0, 10, 13];
const CAM_TARGET: [number, number, number] = [0, 0, 0.5];
const CAM_FOV = 45;

interface Plant {
  x: number; z: number; born: number;
  hue: number; fs: number; hs: number; rot: number; petals: number;
}

const plants: Plant[] = [];
let ready = false;
let dirty = true;

let seed = 987654321;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const LEAVES = 4;
const PETALS = 6;
const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.001, 0.001, 0.001] };
const hiddenArr = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => HIDDEN);
const hiddenCols = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");

const white = material.pbr({ color: "#ffffff", roughness: 0.8 });

const sc = scene({ background: "#bfdcf2" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 1, far: 120 }))
  .add(lights.hemisphere({ skyColor: "#dcebff", groundColor: "#6b7a4a", intensity: 1.0 }))
  .add(lights.directional({
    position: [8, 14, 6], target: [0, 0, 0], intensity: 3, shadow: { mapSize: 2048, filter: "pcf", softness: 2 }
  }))
  .add(primitives.plane({
    name: "ground", size: [HALF * 2, 1, HALF * 2],
    material: material.pbr({ color: "#6a8f3c", roughness: 1 }), receiveShadow: true, castShadow: false
  }))
  .add(instances.cylinder({
    name: "stems", transforms: hiddenArr(MAX_PLANTS), colors: hiddenCols(MAX_PLANTS), material: white,
    params: { radialSegments: 6 }
  }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({
    name: "leaves", transforms: hiddenArr(MAX_PLANTS * LEAVES), colors: hiddenCols(MAX_PLANTS * LEAVES), material: white
  }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({
    name: "petals", transforms: hiddenArr(MAX_PLANTS * PETALS), colors: hiddenCols(MAX_PLANTS * PETALS), material: white
  }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({
    name: "centers", transforms: hiddenArr(MAX_PLANTS), colors: hiddenCols(MAX_PLANTS), material: white
  }).runtime({ id: "centers", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function growthOf(p: Plant, now: number): number {
  return clamp01((now - p.born) / GROW_MS);
}

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX_PLANTS) return false;
  plants.push({
    x, z, born: performance.now(),
    hue: Math.floor(rand() * 360),
    fs: 0.8 + rand() * 0.9,
    hs: 0.75 + rand() * 0.5,
    rot: rand() * Math.PI * 2,
    petals: 0
  });
  dirty = true;
  updateOverlay();
  return true;
}

// ---- Overlay ----
const overlay = document.createElement("div");
overlay.style.cssText = "position:fixed;top:8px;left:8px;padding:6px 10px;background:rgba(20,30,20,0.7);color:#fff;font:14px sans-serif;border-radius:6px;display:flex;gap:10px;align-items:center;z-index:10";
const countEl = document.createElement("span");
const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:13px sans-serif;cursor:pointer;padding:2px 8px";
clearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  plants.length = 0;
  dirty = true;
  updateOverlay();
});
overlay.append(countEl, clearBtn);
document.body.appendChild(overlay);
function updateOverlay(): void { countEl.textContent = `Plants: ${plants.length}`; }
updateOverlay();

// ---- Click -> ground picking ----
const canvas = document.getElementById("app") as HTMLCanvasElement;

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function pickGround(clientX: number, clientY: number): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  const aspect = rect.width / rect.height;
  const th = Math.tan((CAM_FOV * Math.PI) / 360);
  const f = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d: [number, number, number] = [
    f[0] + r[0] * nx * th * aspect + u[0] * ny * th,
    f[1] + r[1] * nx * th * aspect + u[1] * ny * th,
    f[2] + r[2] * nx * th * aspect + u[2] * ny * th
  ];
  if (d[1] >= -1e-6) return null;
  const t = -CAM_POS[1] / d[1];
  if (t <= 0) return null;
  const x = CAM_POS[0] + d[0] * t, z = CAM_POS[2] + d[2] * t;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  return [x, z];
}

canvas.addEventListener("click", (e) => {
  const hit = pickGround(e.clientX, e.clientY);
  if (hit) plantAt(hit[0], hit[1]);
});

// ---- State exposure ----
const state: TaskState = {
  get plantCount(): number { return plants.length; },
  get plants(): PlantInfo[] {
    const now = performance.now();
    return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
  },
  get ready(): boolean { return ready; }
};
Object.defineProperty(window, "__TASK_STATE__", { value: state, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__plantAt", {
  value: (x: number, z: number) => plantAt(x, z), writable: false, configurable: false, enumerable: true
});

// ---- Per-frame rebuild ----
function rebuild(now: number): boolean {
  const stems: AuraTransformSpec[] = [], stemC: string[] = [];
  const leaves: AuraTransformSpec[] = [], leafC: string[] = [];
  const petals: AuraTransformSpec[] = [], petalC: string[] = [];
  const centers: AuraTransformSpec[] = [], centerC: string[] = [];
  let growing = false;

  for (const p of plants) {
    const g = growthOf(p, now);
    if (g < 1) growing = true;
    const e = smooth(g);
    const H = (0.08 + 1.7 * e) * p.hs;
    const sr = 0.03 + 0.04 * e;
    stems.push({ position: [p.x, H / 2, p.z], scale: [sr * 2, H, sr * 2] });
    stemC.push(`hsl(${lerp(90, 118, e)}, ${lerp(65, 48, e)}%, ${lerp(62, 30, e)}%)`);

    const leafCol = `hsl(${lerp(95, 120, e)}, ${lerp(65, 55, e)}%, ${lerp(55, 33, e)}%)`;
    for (let i = 0; i < LEAVES; i += 1) {
      const vis = i < 2 ? 1 : smooth((e - 0.2 - (i - 2) * 0.15) / 0.3);
      const L = (0.09 + 0.55 * e) * vis * p.hs + 0.001;
      const a = p.rot + i * 2.2;
      const hy = H * (i < 2 ? 0.92 - i * 0.1 : 0.3 + (i - 2) * 0.2) ;
      const rad = L * 0.5;
      leaves.push({
        position: [p.x + Math.cos(a) * rad, hy + (i < 2 ? 0 : 0.02), p.z + Math.sin(a) * rad],
        rotation: [0, -a, 0.25],
        scale: [L, 0.035 + 0.03 * e, L * 0.5]
      });
      leafC.push(leafCol);
    }

    const b = smooth((g - 0.55) / 0.4);
    const headY = H + 0.03;
    const petalCol = `hsl(${p.hue}, 80%, ${lerp(55, 62, b)}%)`;
    for (let i = 0; i < PETALS; i += 1) {
      const a = p.rot + (i / PETALS) * Math.PI * 2;
      const pr = 0.2 * p.fs * b;
      petals.push({
        position: [p.x + Math.cos(a) * pr, headY + 0.03 * b, p.z + Math.sin(a) * pr],
        rotation: [0, -a, 0],
        scale: [0.36 * p.fs * b + 0.001, 0.07 * p.fs * b + 0.001, 0.2 * p.fs * b + 0.001]
      });
      petalC.push(petalCol);
    }
    const cs = (0.05 + 0.17 * e) * (0.6 + 0.4 * p.fs);
    centers.push({ position: [p.x, headY + 0.03 * b, p.z], scale: [cs, cs, cs] });
    centerC.push(b > 0.02 ? `hsl(${lerp(100, 45, b)}, ${lerp(55, 90, b)}%, ${lerp(40, 55, b)}%)` : `hsl(100, 55%, ${lerp(55, 38, e)}%)`);
  }

  const pad = (arr: AuraTransformSpec[], cols: string[], n: number): void => {
    while (arr.length < n) { arr.push(HIDDEN); cols.push("#ffffff"); }
  };
  pad(stems, stemC, MAX_PLANTS);
  pad(leaves, leafC, MAX_PLANTS * LEAVES);
  pad(petals, petalC, MAX_PLANTS * PETALS);
  pad(centers, centerC, MAX_PLANTS);

  app.nodes.require("stems").setInstances(stems, stemC);
  app.nodes.require("leaves").setInstances(leaves, leafC);
  app.nodes.require("petals").setInstances(petals, petalC);
  app.nodes.require("centers").setInstances(centers, centerC);
  return growing;
}

app.onFrame(() => {
  const now = performance.now();
  if (dirty) {
    const growing = rebuild(now);
    dirty = growing;
  }
});

await app.ready();
ready = true;
window.__EVAL_READY__ = true;

import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Garden constants
// ---------------------------------------------------------------------------
const GROW_MS = 8000;
const HALF_X = 10;
const HALF_Z = 6.5;
const POOL = 80;
const CAM_POS: [number, number, number] = [0, 11, 16];
const CAM_TARGET: [number, number, number] = [0, 0, 0.5];
const CAM_FOV = 45; // vertical, degrees

const FLOWER_COLORS = ["#ff4d6d", "#ffd23f", "#f8f8ff", "#b25cff", "#ff8c1a", "#4da6ff", "#ff7ad9", "#e63946"];

// ---------------------------------------------------------------------------
// Minimal typing for the runtime node handles (all calls are optional-safe)
// ---------------------------------------------------------------------------
interface NodeHandle {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(x: number, y?: number, z?: number): unknown;
  setVisible?(v: boolean): unknown;
}

interface Plant {
  slot: number;
  x: number;
  z: number;
  born: number;
  hv: number; // height variation
  lv: number; // leaf size variation
  fv: number; // flower size variation
  flowerShown: boolean;
  done: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__: { plantCount: number; plants: { x: number; z: number; growth: number }[]; ready: boolean };
    __plantAt: (x: number, z: number) => boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Scene: soil plot, wooden edging, plant pool
// ---------------------------------------------------------------------------
const stemMat = material.pbr({ color: "#3f8f2f", roughness: 0.7 });
const leafMat = material.pbr({ color: "#58b043", roughness: 0.65 });
const centerMat = material.pbr({ color: "#7a4b12", roughness: 0.8 });
const flowerMats = FLOWER_COLORS.map((c) => material.pbr({ color: c, roughness: 0.55 }));

function hash(n: number): number {
  let h = (n + 1) * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967295;
}

const plantGroups = [];
for (let i = 0; i < POOL; i++) {
  const mat = flowerMats[Math.floor(hash(i * 7 + 1) * flowerMats.length) % flowerMats.length];
  plantGroups.push(
    group(
      `plant-${i}`,
      [
        primitives.cylinder({ name: `stem-${i}`, size: [1, 1, 1], material: stemMat, castShadow: true }).position(0, 0.05, 0).scale([0.04, 0.1, 0.04]).runtime({ id: `stem-${i}`, mutable: true }),
        primitives.sphere({ name: `leafL-${i}`, size: 1, material: leafMat, castShadow: true }).scale([0.1, 0.02, 0.05]).runtime({ id: `leafL-${i}`, mutable: true }),
        primitives.sphere({ name: `leafR-${i}`, size: 1, material: leafMat, castShadow: true }).scale([0.1, 0.02, 0.05]).runtime({ id: `leafR-${i}`, mutable: true }),
        primitives.sphere({ name: `head-${i}`, size: 1, material: mat, castShadow: true }).scale([0.1, 0.03, 0.1]).runtime({ id: `head-${i}`, mutable: true }),
        primitives.sphere({ name: `center-${i}`, size: 1, material: centerMat, castShadow: true }).scale(0.05).runtime({ id: `center-${i}`, mutable: true })
      ],
      { position: [0, -60, 0] }
    ).runtime({ id: `plant-${i}`, mutable: true })
  );
}

const wood = material.pbr({ color: "#8a6a42", roughness: 0.85 });
const edgeZ = HALF_Z + 0.15;
const edgeX = HALF_X + 0.15;

let stage = scene()
  .add(looks.preset("outdoor-day"))
  .add(
    primitives.plane({
      name: "ground",
      size: [HALF_X * 2, 1, HALF_Z * 2],
      material: material.pbr({ color: "#6b4a2f", roughness: 1 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(primitives.box({ name: "edge-n", size: [HALF_X * 2 + 0.6, 0.25, 0.3], material: wood, castShadow: true, receiveShadow: true }).position(0, 0.1, -edgeZ))
  .add(primitives.box({ name: "edge-s", size: [HALF_X * 2 + 0.6, 0.25, 0.3], material: wood, castShadow: true, receiveShadow: true }).position(0, 0.1, edgeZ))
  .add(primitives.box({ name: "edge-w", size: [0.3, 0.25, HALF_Z * 2], material: wood, castShadow: true, receiveShadow: true }).position(-edgeX, 0.1, 0))
  .add(primitives.box({ name: "edge-e", size: [0.3, 0.25, HALF_Z * 2], material: wood, castShadow: true, receiveShadow: true }).position(edgeX, 0.1, 0));
for (const g of plantGroups) stage = stage.add(g);
stage = stage.camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 0.5, far: 200 }));

const app = createAuraApp("#app", { scene: stage, ...looks.appOptions("outdoor-day") });
await app.ready();

const canvas = document.getElementById("app") as HTMLCanvasElement;

// ---------------------------------------------------------------------------
// DOM overlay
// ---------------------------------------------------------------------------
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;left:8px;top:8px;display:flex;gap:8px;align-items:center;padding:4px 8px;" +
  "background:rgba(0,0,0,0.55);border-radius:6px;color:#fff;font:13px/1.4 system-ui,sans-serif;z-index:10;user-select:none";
const countLabel = document.createElement("span");
countLabel.id = "plant-count";
countLabel.textContent = "Plants: 0";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:12px system-ui,sans-serif;padding:2px 8px;cursor:pointer";
overlay.append(countLabel, clearBtn);
document.body.appendChild(overlay);

// ---------------------------------------------------------------------------
// Plant state
// ---------------------------------------------------------------------------
const handle = (id: string): NodeHandle => app.nodes.require(id) as unknown as NodeHandle;
const setScale3 = (h: NodeHandle, x: number, y: number, z: number): void => {
  (h as unknown as { setScale: (...a: number[]) => unknown }).setScale(x, y, z);
};
const show = (h: NodeHandle, v: boolean): void => {
  if (typeof h.setVisible === "function") h.setVisible(v);
};

const handles = Array.from({ length: POOL }, (_, i) => ({
  root: handle(`plant-${i}`),
  stem: handle(`stem-${i}`),
  leafL: handle(`leafL-${i}`),
  leafR: handle(`leafR-${i}`),
  head: handle(`head-${i}`),
  center: handle(`center-${i}`)
}));

for (const h of handles) {
  h.root.setPosition(0, -60, 0);
  show(h.root, false);
  show(h.head, false);
  show(h.center, false);
}

let plants: Plant[] = [];
const freeSlots: number[] = [];
for (let i = POOL - 1; i >= 0; i--) freeSlots.push(i);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => t * t * (3 - 2 * t);
const growthOf = (p: Plant, now: number): number => clamp01((now - p.born) / GROW_MS);

function updateLabel(): void {
  countLabel.textContent = `Plants: ${plants.length}`;
}

function applyGrowth(p: Plant, g: number): void {
  const h = handles[p.slot];
  const e = smooth(g);
  const H = (0.08 + 1.4 * e) * p.hv;
  const w = 0.04 + 0.05 * e;
  h.stem.setPosition(0, H / 2, 0);
  setScale3(h.stem, w, H, w);

  const L = (0.08 + 0.55 * e) * p.lv;
  const leafY = H * (0.85 - 0.5 * e);
  const tilt = 0.25 + 0.4 * e;
  h.leafL.setPosition(-L * 0.55, leafY, 0);
  h.leafL.setRotation(0, 0, -tilt);
  setScale3(h.leafL, L, Math.max(L * 0.16, 0.012), L * 0.5);
  h.leafR.setPosition(L * 0.55, leafY, 0);
  h.leafR.setRotation(0, 0, tilt);
  setScale3(h.leafR, L, Math.max(L * 0.16, 0.012), L * 0.5);

  const fg = clamp01((g - 0.4) / 0.6);
  const fe = smooth(fg);
  const wantFlower = fg > 0.01;
  if (wantFlower !== p.flowerShown) {
    show(h.head, wantFlower);
    show(h.center, wantFlower);
    p.flowerShown = wantFlower;
  }
  if (wantFlower) {
    const D = Math.max(0.02, p.fv * 0.8 * fe);
    h.head.setPosition(0, H + 0.03, 0);
    setScale3(h.head, D, D * 0.32, D);
    const c = D * 0.38;
    h.center.setPosition(0, H + 0.03 + D * 0.1, 0);
    setScale3(h.center, c, c, c);
  }
}

function plantAt(x: number, z: number): boolean {
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF_X || Math.abs(z) > HALF_Z) return false;
  let slot = freeSlots.pop();
  if (slot === undefined) {
    // pool exhausted: recycle the oldest plant
    const oldest = plants.shift();
    if (!oldest) return false;
    slot = oldest.slot;
  }
  const n = slot + plants.length * 13 + Math.floor(performance.now() % 997);
  const p: Plant = {
    slot,
    x,
    z,
    born: performance.now(),
    hv: 0.75 + 0.55 * hash(n * 3 + 1),
    lv: 0.8 + 0.5 * hash(n * 3 + 2),
    fv: 0.7 + 0.7 * hash(n * 3 + 3),
    flowerShown: false,
    done: false
  };
  plants.push(p);
  const h = handles[slot];
  h.root.setPosition(x, 0, z);
  h.root.setRotation(0, hash(n * 5 + 9) * Math.PI * 2, 0);
  show(h.root, true);
  show(h.head, false);
  show(h.center, false);
  applyGrowth(p, 0);
  updateLabel();
  return true;
}

function clearAll(): void {
  for (const p of plants) {
    const h = handles[p.slot];
    show(h.root, false);
    show(h.head, false);
    show(h.center, false);
    h.root.setPosition(0, -60, 0);
    freeSlots.push(p.slot);
  }
  plants = [];
  updateLabel();
}

// ---------------------------------------------------------------------------
// Click -> ground mapping (ray / y=0 plane using the fixed camera)
// ---------------------------------------------------------------------------
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const fwd = norm(sub(CAM_TARGET, CAM_POS));
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((CAM_FOV * Math.PI) / 360);

function groundHit(clientX: number, clientY: number): { x: number; z: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const u = (clientX - rect.left) / rect.width;
  const v = (clientY - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const aspect = rect.width / rect.height;
  const nx = (u * 2 - 1) * tanHalf * aspect;
  const ny = (1 - v * 2) * tanHalf;
  const d: V3 = [fwd[0] + right[0] * nx + up[0] * ny, fwd[1] + right[1] * nx + up[1] * ny, fwd[2] + right[2] * nx + up[2] * ny];
  if (d[1] >= -1e-6) return null; // ray does not reach the ground
  const t = -CAM_POS[1] / d[1];
  if (t <= 0) return null;
  const x = CAM_POS[0] + d[0] * t;
  const z = CAM_POS[2] + d[2] * t;
  if (Math.abs(x) > HALF_X || Math.abs(z) > HALF_Z) return null;
  return { x, z };
}

canvas.addEventListener("click", (ev: MouseEvent) => {
  const hit = groundHit(ev.clientX, ev.clientY);
  if (hit) plantAt(hit.x, hit.z);
});
clearBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  clearAll();
});

// ---------------------------------------------------------------------------
// Globals for the harness
// ---------------------------------------------------------------------------
let ready = false;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get() {
    const now = performance.now();
    return {
      plantCount: plants.length,
      plants: plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) })),
      ready
    };
  }
});
Object.defineProperty(window, "__plantAt", {
  configurable: false,
  enumerable: true,
  writable: false,
  value: (x: number, z: number): boolean => plantAt(Number(x), Number(z))
});

// ---------------------------------------------------------------------------
// Per-frame growth
// ---------------------------------------------------------------------------
let firstFrame = true;
app.onFrame(() => {
  const now = performance.now();
  for (const p of plants) {
    if (p.done) continue;
    const g = growthOf(p, now);
    applyGrowth(p, g);
    if (g >= 1) p.done = true;
  }
  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      ready = true;
      window.__EVAL_READY__ = true;
    });
  }
});

import { camera, createAuraApp, looks, material, primitives, instances, scene, type AuraTransformSpec } from "@aura3d/engine";

// ---------------------------------------------------------------- constants
const HALF = 8; // the ground spans x, z in [-HALF, HALF]
const GROW_MS = 8000;
const MAX_PLANTS = 200;
const DUMMIES = 4; // permanent tiny instances at the plot corners: keep node bounds covering the plot, avoid empty nodes
const LEAVES_PER_PLANT = 4;
const PETALS_PER_PLANT = 6;

const CAM_POS: [number, number, number] = [0, 11, 18];
const CAM_TARGET: [number, number, number] = [0, 0, 2.5];
const CAM_FOV = 38;

// ---------------------------------------------------------------- state
interface Plant {
  x: number;
  z: number;
  born: number;
  yaw: number;
  heightVar: number;
  flowerSize: number;
  petalLin: [number, number, number];
  centerLin: [number, number, number];
  leafShade: number;
}

const plants: Plant[] = [];
let ready = false;
let dirty = true;
let seed = 987654321;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLin(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

const PETAL_COLORS = ["#ff4d6d", "#ffb703", "#9b5de5", "#ff7b00", "#f72585", "#4cc9f0", "#fdfdfd", "#ff8fab", "#f15bb5", "#ffd60a"].map(hexLin);
const CENTER_COLORS = ["#ffd23f", "#7b3f00", "#fff1a8", "#ff9f1c"].map(hexLin);
const SPROUT_LEAF = hexLin("#b9e36b");
const MATURE_LEAF = hexLin("#2f8a3c");
const SPROUT_STEM = hexLin("#a6d96a");
const MATURE_STEM = hexLin("#3f8f3a");

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

function plantGrowth(p: Plant, now: number): number {
  return clamp01((now - p.born) / GROW_MS);
}

function addPlant(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX_PLANTS) plants.shift();
  plants.push({
    x,
    z,
    born: performance.now(),
    yaw: rand() * Math.PI * 2,
    heightVar: 0.85 + rand() * 0.3,
    flowerSize: 0.7 + rand() * 0.7,
    petalLin: PETAL_COLORS[Math.floor(rand() * PETAL_COLORS.length)],
    centerLin: CENTER_COLORS[Math.floor(rand() * CENTER_COLORS.length)],
    leafShade: 0.85 + rand() * 0.3
  });
  dirty = true;
  return true;
}

// ---------------------------------------------------------------- scene
const CAP_STEM = MAX_PLANTS + DUMMIES;
const CAP_LEAF = MAX_PLANTS * LEAVES_PER_PLANT + DUMMIES;
const CAP_PETAL = MAX_PLANTS * PETALS_PER_PLANT + DUMMIES;
const CAP_CENTER = MAX_PLANTS + DUMMIES;

function hiddenTransforms(count: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  const corners: [number, number][] = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]];
  for (let i = 0; i < count; i += 1) {
    const c = corners[i % 4];
    out.push({ position: [c[0], 0, c[1]], scale: [0.0001, 0.0001, 0.0001] });
  }
  return out;
}

const white = (roughness: number) => material.pbr({ color: "#ffffff", roughness });

const stage = scene()
  .add(looks.preset("outdoor-day", { sun: { azimuthDeg: 60, elevationDeg: 45 }, key: { shadow: { filter: "pcf", softness: 1.5, mapSize: 2048 } } }))
  .add(primitives.plane({ name: "soil-border", size: [HALF * 2 + 1.6, 1, HALF * 2 + 1.6], material: material.pbr({ color: "#5a3d28", roughness: 1 }), castShadow: false, receiveShadow: true }).position(0, -0.03, 0))
  .add(primitives.plane({ name: "ground", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#5c9a47", roughness: 1 }), castShadow: false, receiveShadow: true }))
  .add(instances.cylinder({ name: "stems", transforms: hiddenTransforms(CAP_STEM), material: white(0.8), params: { radialSegments: 8 }, castShadow: true, receiveShadow: true }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({ name: "leaves", transforms: hiddenTransforms(CAP_LEAF), material: white(0.7), castShadow: true, receiveShadow: true }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({ name: "petals", transforms: hiddenTransforms(CAP_PETAL), material: white(0.6), castShadow: true, receiveShadow: true }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({ name: "centers", transforms: hiddenTransforms(CAP_CENTER), material: white(0.7), castShadow: true, receiveShadow: true }).runtime({ id: "centers", mutable: true }))
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 1, far: 200 }));

const canvas = document.getElementById("app") as HTMLCanvasElement;

const app = createAuraApp("#app", {
  scene: stage,
  ...looks.appOptions("outdoor-day"),
  pixelRatio: 1
});

// ---------------------------------------------------------------- instance buffers
interface Buffers {
  m: Float32Array;
  c: Float32Array;
  n: number;
}
function makeBuffers(cap: number): Buffers {
  const b: Buffers = { m: new Float32Array(cap * 16), c: new Float32Array(cap * 4), n: 0 };
  return b;
}
function pushMat(b: Buffers, px: number, py: number, pz: number, yaw: number, tilt: number, sx: number, sy: number, sz: number, col: readonly number[]): void {
  const s = (v: number): number => (v < 0.0001 ? 0.0001 : v);
  sx = s(sx);
  sy = s(sy);
  sz = s(sz);
  const cy = Math.cos(yaw), sY = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  // R = Ry(yaw) * Rx(tilt)
  const r00 = cy, r01 = sY * st, r02 = sY * ct;
  const r10 = 0, r11 = ct, r12 = -st;
  const r20 = -sY, r21 = cy * st, r22 = cy * ct;
  const o = b.n * 16;
  const m = b.m;
  m[o] = r00 * sx; m[o + 1] = r10 * sx; m[o + 2] = r20 * sx; m[o + 3] = 0;
  m[o + 4] = r01 * sy; m[o + 5] = r11 * sy; m[o + 6] = r21 * sy; m[o + 7] = 0;
  m[o + 8] = r02 * sz; m[o + 9] = r12 * sz; m[o + 10] = r22 * sz; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
  const k = b.n * 4;
  b.c[k] = col[0]; b.c[k + 1] = col[1]; b.c[k + 2] = col[2]; b.c[k + 3] = 1;
  b.n += 1;
}
function pushDummies(b: Buffers): void {
  const corners: [number, number][] = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]];
  for (const [x, z] of corners) pushMat(b, x, 0, z, 0, 0, 0.0001, 0.0001, 0.0001, [1, 1, 1]);
}

const stemB = makeBuffers(CAP_STEM);
const leafB = makeBuffers(CAP_LEAF);
const petalB = makeBuffers(CAP_PETAL);
const centerB = makeBuffers(CAP_CENTER);
const tmp: [number, number, number] = [0, 0, 0];
const LEAF_YAWS = [0, Math.PI, Math.PI / 2, (3 * Math.PI) / 2];

function lerp3(a: readonly number[], b: readonly number[], t: number, shade: number): [number, number, number] {
  tmp[0] = (a[0] + (b[0] - a[0]) * t) * shade;
  tmp[1] = (a[1] + (b[1] - a[1]) * t) * shade;
  tmp[2] = (a[2] + (b[2] - a[2]) * t) * shade;
  return tmp;
}

function rebuild(now: number): void {
  stemB.n = 0;
  leafB.n = 0;
  petalB.n = 0;
  centerB.n = 0;
  pushDummies(stemB);
  pushDummies(leafB);
  pushDummies(petalB);
  pushDummies(centerB);

  for (const p of plants) {
    const g = plantGrowth(p, now);
    const e = smooth(g);
    const stemH = (0.1 + (1.25 * p.heightVar - 0.1) * e);
    const stemW = 0.04 + 0.05 * e;
    pushMat(stemB, p.x, stemH / 2, p.z, 0, 0, stemW, stemH, stemW, lerp3(SPROUT_STEM, MATURE_STEM, e, 1));

    // leaves
    for (let k = 0; k < LEAVES_PER_PLANT; k += 1) {
      const ramp = k < 2 ? 1 : smooth((e - 0.2) / 0.5);
      const L = (0.15 + 0.5 * e) * ramp * (k < 2 ? 1 : 0.85);
      const yaw = p.yaw + LEAF_YAWS[k];
      const tilt = -0.7 + 0.9 * e; // sprout leaves point up, mature leaves droop outward
      const baseY = k < 2 ? stemH * (0.2 + 0.1 * e) : stemH * (0.35 + 0.2 * (k - 2));
      const dx = Math.sin(yaw) * Math.cos(tilt);
      const dz = Math.cos(yaw) * Math.cos(tilt);
      const dy = -Math.sin(tilt);
      pushMat(leafB, p.x + dx * L * 0.5, baseY + dy * L * 0.5, p.z + dz * L * 0.5, yaw, tilt, L * 0.45, L * 0.1, L, lerp3(SPROUT_LEAF, MATURE_LEAF, e, p.leafShade));
    }

    // flower
    const fe = smooth((e - 0.55) / 0.45);
    const topY = stemH + 0.02;
    const pl = 0.3 * p.flowerSize * fe;
    for (let j = 0; j < PETALS_PER_PLANT; j += 1) {
      const yaw = p.yaw + (j * Math.PI * 2) / PETALS_PER_PLANT;
      const tilt = -0.35;
      const dx = Math.sin(yaw) * Math.cos(tilt);
      const dz = Math.cos(yaw) * Math.cos(tilt);
      const dy = -Math.sin(tilt);
      const off = pl * 0.5 + 0.03 * fe;
      pushMat(petalB, p.x + dx * off, topY + dy * off, p.z + dz * off, yaw, tilt, pl * 0.55, pl * 0.12, pl, p.petalLin);
    }
    const cs = 0.17 * p.flowerSize * fe;
    pushMat(centerB, p.x, topY + 0.03 * fe, p.z, 0, 0, cs, cs * 0.8, cs, p.centerLin);
  }
}

function upload(): void {
  app.nodes.require("stems").setInstanceMatrices(stemB.m, stemB.n, stemB.c);
  app.nodes.require("leaves").setInstanceMatrices(leafB.m, leafB.n, leafB.c);
  app.nodes.require("petals").setInstanceMatrices(petalB.m, petalB.n, petalB.c);
  app.nodes.require("centers").setInstanceMatrices(centerB.m, centerB.n, centerB.c);
}

// ---------------------------------------------------------------- picking
function pickGround(clientX: number, clientY: number): { x: number; z: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ndx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndy = 1 - ((clientY - rect.top) / rect.height) * 2;
  if (ndx < -1 || ndx > 1 || ndy < -1 || ndy > 1) return null;
  const aspect = rect.width / rect.height;
  const tanHalf = Math.tan((CAM_FOV * Math.PI) / 360);
  let fx = CAM_TARGET[0] - CAM_POS[0], fy = CAM_TARGET[1] - CAM_POS[1], fz = CAM_TARGET[2] - CAM_POS[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // right = normalize(forward x up(0,1,0))
  let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl; ry /= rl; rz /= rl;
  // camera up = right x forward
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const dx = fx + rx * ndx * tanHalf * aspect + ux * ndy * tanHalf;
  const dy = fy + ry * ndx * tanHalf * aspect + uy * ndy * tanHalf;
  const dz = fz + rz * ndx * tanHalf * aspect + uz * ndy * tanHalf;
  if (dy >= -1e-6) return null; // ray does not go down: sky
  const t = -CAM_POS[1] / dy;
  const x = CAM_POS[0] + dx * t;
  const z = CAM_POS[2] + dz * t;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  return { x, z };
}

canvas.addEventListener("click", (ev) => {
  const hit = pickGround(ev.clientX, ev.clientY);
  if (hit) addPlant(hit.x, hit.z);
});

// ---------------------------------------------------------------- DOM overlay
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:absolute;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;" +
  "background:rgba(20,30,20,0.6);border-radius:6px;font:14px system-ui,sans-serif;color:#fff;user-select:none;z-index:10";
const countLabel = document.createElement("span");
countLabel.id = "plant-count";
countLabel.textContent = "Plants: 0";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.type = "button";
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:13px system-ui,sans-serif;padding:2px 10px;cursor:pointer";
clearBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  plants.length = 0;
  dirty = true;
});
overlay.append(countLabel, clearBtn);
document.body.appendChild(overlay);

let shownCount = -1;
function syncOverlay(): void {
  if (shownCount !== plants.length) {
    shownCount = plants.length;
    countLabel.textContent = `Plants: ${shownCount}`;
  }
}

// ---------------------------------------------------------------- exposed state
interface TaskState {
  readonly plantCount: number;
  readonly plants: ReadonlyArray<{ x: number; z: number; growth: number }>;
  readonly ready: boolean;
}
const taskState: TaskState = Object.freeze(
  Object.defineProperties({} as Record<string, unknown>, {
    plantCount: { enumerable: true, get: () => plants.length },
    plants: {
      enumerable: true,
      get: () => {
        const now = performance.now();
        return plants.map((p) => ({ x: p.x, z: p.z, growth: plantGrowth(p, now) }));
      }
    },
    ready: { enumerable: true, get: () => ready }
  })
) as unknown as TaskState;

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __plantAt: (x: number, z: number) => boolean;
    __EVAL_READY__?: boolean;
  }
}
Object.defineProperty(window, "__TASK_STATE__", { value: taskState, writable: false, enumerable: true, configurable: false });
window.__plantAt = (x: number, z: number): boolean => addPlant(Number(x), Number(z));

// ---------------------------------------------------------------- frame loop
let frames = 0;
app.onFrame(() => {
  const now = performance.now();
  let growing = dirty;
  if (!growing) {
    for (const p of plants) {
      if (now - p.born < GROW_MS + 100) {
        growing = true;
        break;
      }
    }
  }
  if (growing || frames === 0) {
    rebuild(now);
    upload();
    dirty = false;
  }
  syncOverlay();
  frames += 1;
  if (frames === 2) {
    requestAnimationFrame(() => {
      ready = true;
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();

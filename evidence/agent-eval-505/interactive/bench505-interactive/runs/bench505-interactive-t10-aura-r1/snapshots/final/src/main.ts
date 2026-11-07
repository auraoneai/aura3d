import {
  camera,
  createAuraApp,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------------------------------------------------------------- constants
const HALF = 12; // ground is a (2*HALF)^2 square centred on the origin, y = 0
const MAX_PLANTS = 300;
const GROW_MS = 8000;
const LEAVES_PER_PLANT = 4;
const PETALS_PER_PLANT = 6;

const EYE: readonly [number, number, number] = [0, 18, 21];
const TARGET: readonly [number, number, number] = [0, 0, 0.5];
const FOV_DEG = 45;

type RGB = readonly [number, number, number];

interface Plant {
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  readonly t0: number;
  readonly heightScale: number;
  readonly flowerScale: number;
  readonly yaw: number;
  readonly petalColor: RGB;
  readonly leafShade: number;
  done: boolean;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: {
      readonly plantCount: number;
      readonly plants: ReadonlyArray<{ x: number; z: number; growth: number }>;
      readonly ready: boolean;
    };
    __plantAt?: (x: number, z: number) => boolean;
  }
}

// ---------------------------------------------------------------- helpers
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

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SPROUT_GREEN = hex("#b7ec74");
const STEM_GREEN = hex("#2f8a3a");
const LEAF_SPROUT = hex("#a8e66a");
const LEAF_MATURE = hex("#237a35");
const BUD_GREEN = hex("#6fbf4f");
const CENTER_GOLD = hex("#f7b21b");
const MOUND_BROWN = hex("#3d2816");
const PETAL_PALETTE: RGB[] = [
  "#ff4d6d",
  "#ffd23f",
  "#ff8c42",
  "#c77dff",
  "#fff4f0",
  "#4cc9f0",
  "#f72585",
  "#ff6b6b",
  "#ffb3c6",
  "#7b5cff"
].map(hex);

/** Writes T * Ry(yaw) * Rz(tilt) * S into a column-major mat4 buffer. */
function put(
  arr: Float32Array,
  index: number,
  tx: number,
  ty: number,
  tz: number,
  yaw: number,
  tilt: number,
  sx: number,
  sy: number,
  sz: number
): void {
  const o = index * 16;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  arr[o] = c * ct * sx;
  arr[o + 1] = st * sx;
  arr[o + 2] = -s * ct * sx;
  arr[o + 3] = 0;
  arr[o + 4] = -c * st * sy;
  arr[o + 5] = ct * sy;
  arr[o + 6] = s * st * sy;
  arr[o + 7] = 0;
  arr[o + 8] = s * sz;
  arr[o + 9] = 0;
  arr[o + 10] = c * sz;
  arr[o + 11] = 0;
  arr[o + 12] = tx;
  arr[o + 13] = ty;
  arr[o + 14] = tz;
  arr[o + 15] = 1;
}

function putColor(arr: Float32Array, index: number, rgb: RGB): void {
  const o = index * 4;
  arr[o] = srgbToLinear(rgb[0]);
  arr[o + 1] = srgbToLinear(rgb[1]);
  arr[o + 2] = srgbToLinear(rgb[2]);
  arr[o + 3] = 1;
}

function hide(arr: Float32Array, index: number): void {
  put(arr, index, 0, -5, 0, 0, 0, 1e-5, 1e-5, 1e-5);
}

// ---------------------------------------------------------------- instance buffers
interface Part {
  readonly id: string;
  readonly capacity: number;
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
}
function makePart(id: string, capacity: number): Part {
  return { id, capacity, matrices: new Float32Array(capacity * 16), colors: new Float32Array(capacity * 4) };
}
const stems = makePart("stems", MAX_PLANTS);
const mounds = makePart("mounds", MAX_PLANTS);
const centers = makePart("centers", MAX_PLANTS);
const leaves = makePart("leaves", MAX_PLANTS * LEAVES_PER_PLANT);
const petals = makePart("petals", MAX_PLANTS * PETALS_PER_PLANT);
const parts: Part[] = [stems, mounds, centers, leaves, petals];

function resetPart(p: Part): void {
  for (let i = 0; i < p.capacity; i += 1) {
    hide(p.matrices, i);
    putColor(p.colors, i, [1, 1, 1]);
  }
}

function seedTransforms(capacity: number): AuraTransformSpec[] {
  const list: AuraTransformSpec[] = [];
  for (let i = 0; i < capacity; i += 1) {
    list.push({
      position: [(i % 2 === 0 ? -1 : 1) * (HALF - 1), 0.5, (i % 4 < 2 ? -1 : 1) * (HALF - 1)],
      scale: 0.0001
    });
  }
  return list;
}

const plantMaterial = (roughness: number) => material.pbr({ color: "#ffffff", roughness, metallic: 0 });

// ---------------------------------------------------------------- scene
const border = (name: string, size: [number, number, number], position: [number, number, number]) =>
  primitives.box({
    name,
    size,
    position,
    material: material.pbr({ color: "#8a6a45", roughness: 0.85 }),
    castShadow: true,
    receiveShadow: true
  });
const edge = HALF + 0.15;

const stage = scene({ background: "#bfe0f5" })
  .add(sky.gradient({ zenith: "#58a6ea", horizon: "#e2f1fa", name: "sky" }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6ecff", groundColor: "#7a5a3a", intensity: 0.9 }))
  .add(
    lights.directional({
      name: "sun",
      position: [9, 16, 7],
      target: [0, 0, 0],
      intensity: 2.8,
      color: "#fff1d6",
      shadow: { filter: "pcf", softness: 2, mapSize: 2048 }
    })
  )
  .add(
    primitives.plane({
      name: "ground",
      size: [HALF * 2, 1, HALF * 2],
      material: material.pbr({ color: "#7d5c3a", roughness: 1, metallic: 0 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(border("edge-n", [HALF * 2 + 0.6, 0.3, 0.3], [0, 0.15, -edge]))
  .add(border("edge-s", [HALF * 2 + 0.6, 0.3, 0.3], [0, 0.15, edge]))
  .add(border("edge-w", [0.3, 0.3, HALF * 2 + 0.6], [-edge, 0.15, 0]))
  .add(border("edge-e", [0.3, 0.3, HALF * 2 + 0.6], [edge, 0.15, 0]))
  .add(
    instances
      .cylinder({
        name: "stems",
        transforms: seedTransforms(stems.capacity),
        material: plantMaterial(0.8),
        castShadow: true,
        receiveShadow: true,
        frustumCulled: false,
        params: { radialSegments: 8 }
      })
      .runtime({ id: stems.id, mutable: true })
  )
  .add(
    instances
      .sphere({
        name: "mounds",
        transforms: seedTransforms(mounds.capacity),
        material: plantMaterial(1),
        castShadow: false,
        receiveShadow: true,
        frustumCulled: false
      })
      .runtime({ id: mounds.id, mutable: true })
  )
  .add(
    instances
      .sphere({
        name: "centers",
        transforms: seedTransforms(centers.capacity),
        material: plantMaterial(0.6),
        castShadow: true,
        receiveShadow: true,
        frustumCulled: false
      })
      .runtime({ id: centers.id, mutable: true })
  )
  .add(
    instances
      .sphere({
        name: "leaves",
        transforms: seedTransforms(leaves.capacity),
        material: plantMaterial(0.65),
        castShadow: true,
        receiveShadow: true,
        frustumCulled: false
      })
      .runtime({ id: leaves.id, mutable: true })
  )
  .add(
    instances
      .sphere({
        name: "petals",
        transforms: seedTransforms(petals.capacity),
        material: plantMaterial(0.5),
        castShadow: true,
        receiveShadow: true,
        frustumCulled: false
      })
      .runtime({ id: petals.id, mutable: true })
  )
  .camera(camera.perspective({ position: [...EYE], target: [...TARGET], fov: FOV_DEG }));

for (const p of parts) resetPart(p);

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
if (!canvas) throw new Error("canvas #app not found");

const app = createAuraApp(canvas, { scene: stage });

// ---------------------------------------------------------------- plants
const plants: Plant[] = [];
let ready = false;
let dirty = true;

function growthOf(p: Plant, now: number): number {
  return clamp01((now - p.t0) / GROW_MS);
}

function writePlant(p: Plant, g: number): void {
  const e = g * g * (3 - 2 * g); // eased growth drives all sizes
  const { slot, x, z } = p;
  const hs = p.heightScale;
  const fs = p.flowerScale;

  // soil mound marks the spot from the first frame
  const mw = lerp(0.55, 0.95, e);
  put(mounds.matrices, slot, x, 0.03, z, 0, 0, mw, 0.14, mw);
  putColor(mounds.colors, slot, MOUND_BROWN);

  // stem
  const topH = 2.9 * hs;
  const h = lerp(0.2, topH, e);
  const r2 = lerp(0.07, 0.17, e); // diameter
  put(stems.matrices, slot, x, h / 2, z, 0, 0, r2, h, r2);
  putColor(stems.colors, slot, mix(SPROUT_GREEN, STEM_GREEN, smooth(0, 0.7, g)));

  // leaves: pair 0 are the sprout's seed leaves, pair 1 appears later
  const leafCol = mix(LEAF_SPROUT, LEAF_MATURE, smooth(0.05, 0.8, g));
  const shaded: RGB = [leafCol[0] * p.leafShade, leafCol[1] * p.leafShade, leafCol[2] * p.leafShade];
  for (let k = 0; k < LEAVES_PER_PLANT; k += 1) {
    const idx = slot * LEAVES_PER_PLANT + k;
    const pair = k >> 1;
    const yaw = p.yaw + (k & 1) * Math.PI + pair * (Math.PI / 2);
    let len: number;
    let frac: number;
    let tilt: number;
    if (pair === 0) {
      len = lerp(0.3, 1.25 * hs, e);
      frac = lerp(0.95, 0.3, e);
      tilt = lerp(0.55, 0.12, e);
    } else {
      len = 1.1 * hs * smooth(0.25, 0.75, g);
      frac = lerp(0.9, 0.62, smooth(0.25, 0.75, g));
      tilt = lerp(0.6, 0.25, smooth(0.25, 0.75, g));
    }
    if (len < 0.01) {
      hide(leaves.matrices, idx);
      continue;
    }
    const wid = len * 0.46;
    const thick = 0.05 + len * 0.03;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const half = len / 2;
    const ay = h * frac;
    put(
      leaves.matrices,
      idx,
      x + cy * ct * half,
      ay + st * half,
      z - sy * ct * half,
      yaw,
      tilt,
      len,
      thick,
      wid
    );
    putColor(leaves.colors, idx, shaded);
  }

  // flower: green bud first, then petals open
  const bud = smooth(0.3, 0.6, g);
  const bloom = smooth(0.62, 1, g);
  const cd = fs * (0.14 * bud + 0.3 * bloom);
  if (cd < 0.01) {
    hide(centers.matrices, slot);
  } else {
    put(centers.matrices, slot, x, h + cd * 0.15, z, 0, 0, cd, cd * 0.8, cd);
    putColor(centers.colors, slot, mix(BUD_GREEN, CENTER_GOLD, bloom));
  }
  const plen = 0.72 * fs * bloom;
  for (let k = 0; k < PETALS_PER_PLANT; k += 1) {
    const idx = slot * PETALS_PER_PLANT + k;
    if (plen < 0.02) {
      hide(petals.matrices, idx);
      continue;
    }
    const yaw = p.yaw + (k * Math.PI * 2) / PETALS_PER_PLANT;
    const tilt = lerp(0.9, 0.22, bloom);
    const pw = plen * 0.62;
    const thick = 0.06 * fs;
    const reach = cd * 0.35 + plen / 2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    put(
      petals.matrices,
      idx,
      x + cy * ct * reach,
      h + cd * 0.2 + st * reach,
      z - sy * ct * reach,
      yaw,
      tilt,
      plen,
      thick,
      pw
    );
    putColor(petals.colors, idx, p.petalColor);
  }
}

function pushBuffers(): void {
  for (const part of parts) {
    app.nodes.require(part.id).setInstanceMatrices(part.matrices, part.capacity, part.colors);
  }
}

function updatePlants(now: number): void {
  let changed = dirty;
  for (const p of plants) {
    if (p.done) continue;
    const g = growthOf(p, now);
    writePlant(p, g);
    if (g >= 1) p.done = true;
    changed = true;
  }
  if (changed) {
    pushBuffers();
    dirty = false;
  }
}

// ---------------------------------------------------------------- HUD
const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;top:8px;left:8px;z-index:10;display:flex;align-items:center;gap:8px;padding:6px 10px;" +
  "background:rgba(20,28,20,0.72);color:#fff;border-radius:6px;font:600 13px/1.2 system-ui,sans-serif;user-select:none";
const counter = document.createElement("span");
counter.id = "plant-count";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.type = "button";
clearBtn.textContent = "Clear";
clearBtn.style.cssText =
  "font:600 12px system-ui,sans-serif;padding:3px 10px;border:0;border-radius:4px;background:#e8f0e0;color:#1c2a1c;cursor:pointer";
hud.append(counter, clearBtn);
document.body.appendChild(hud);

function refreshHud(): void {
  counter.textContent = `Plants: ${plants.length}`;
}
refreshHud();

// ---------------------------------------------------------------- planting
function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX_PLANTS) return false;
  const slot = plants.length;
  const palette = PETAL_PALETTE[Math.floor(rand() * PETAL_PALETTE.length)] ?? PETAL_PALETTE[0]!;
  const plant: Plant = {
    slot,
    x,
    z,
    t0: performance.now(),
    heightScale: 0.8 + rand() * 0.45,
    flowerScale: 0.75 + rand() * 0.75,
    yaw: rand() * Math.PI * 2,
    petalColor: palette,
    leafShade: 0.85 + rand() * 0.25,
    done: false
  };
  plants.push(plant);
  writePlant(plant, 0);
  dirty = true;
  refreshHud();
  return true;
}

function clearAll(): void {
  plants.length = 0;
  for (const p of parts) resetPart(p);
  dirty = true;
  refreshHud();
}

/** Intersect the camera ray through a client position with the ground plane y = 0. */
function groundPoint(clientX: number, clientY: number): { x: number; z: number } | undefined {
  const rect = canvas!.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return undefined;
  const aspect = rect.width / rect.height;
  const tanH = Math.tan((FOV_DEG * Math.PI) / 360);

  let fx = TARGET[0] - EYE[0];
  let fy = TARGET[1] - EYE[1];
  let fz = TARGET[2] - EYE[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = f x up(0,1,0)
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // true up = right x f
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const dx = fx + rx * ndcX * tanH * aspect + ux * ndcY * tanH;
  const dy = fy + ry * ndcX * tanH * aspect + uy * ndcY * tanH;
  const dz = fz + rz * ndcX * tanH * aspect + uz * ndcY * tanH;
  if (dy >= -1e-6) return undefined; // ray points at or above the horizon: sky
  const t = -EYE[1] / dy;
  const x = EYE[0] + dx * t;
  const z = EYE[2] + dz * t;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return undefined;
  return { x, z };
}

canvas.addEventListener("click", (event: MouseEvent) => {
  const hit = groundPoint(event.clientX, event.clientY);
  if (hit) plantAt(hit.x, hit.z);
});
clearBtn.addEventListener("click", (event: MouseEvent) => {
  event.stopPropagation();
  clearAll();
});

// ---------------------------------------------------------------- exposed state
const state = {
  get plantCount(): number {
    return plants.length;
  },
  get plants(): Array<{ x: number; z: number; growth: number }> {
    const now = performance.now();
    return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
  },
  get ready(): boolean {
    return ready;
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: state, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__plantAt", {
  value: (x: number, z: number): boolean => plantAt(Number(x), Number(z)),
  writable: false,
  configurable: false,
  enumerable: true
});

// ---------------------------------------------------------------- loop
app.onFrame(() => {
  updatePlants(performance.now());
});

void app.ready().then(() => {
  dirty = true; // make sure the hidden/initial buffers are uploaded once the renderer is mounted
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ready = true;
      window.__EVAL_READY__ = true;
    })
  );
});

import {
  camera,
  createAuraApp,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraRuntimeNodeHandle,
  type AuraTransformSpec
} from "@aura3d/engine";

interface PlantRecord {
  x: number;
  z: number;
  t0: number;
  rot: number;
  height: number; // mature stem height
  flower: number; // mature flower diameter
  leaf: number; // mature leaf length
  petal: [number, number, number]; // linear rgb
  center: [number, number, number]; // linear rgb
  shade: number; // leaf colour variation
}

interface TaskPlant {
  x: number;
  z: number;
  growth: number;
}

interface TaskState {
  readonly plantCount: number;
  readonly plants: TaskPlant[];
  readonly ready: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __plantAt: (x: number, z: number) => boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- constants
const GROW_MS = 8000;
const MAX_PLANTS = 160;
const SPHERES_PER_PLANT = 11; // 4 leaves + 6 petals + 1 flower centre
const LEAVES = 4;
const PETALS = 6;

// ground: x in [-GX, GX], z in [GZ0, GZ1]
const GX = 30;
const GZ0 = -10;
const GZ1 = 30;

const CAM_POS: [number, number, number] = [0, 10, 14];
const CAM_TARGET: [number, number, number] = [0, 0, 0];
const CAM_FOV = 45;

const SKY = "#bfe3f7";

// ---------------------------------------------------------------- colour helpers
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}
const SPROUT_STEM = hexToLinear("#b5e57a");
const MATURE_STEM = hexToLinear("#3c8f3a");
const SPROUT_LEAF = hexToLinear("#a2e36b");
const MATURE_LEAF = hexToLinear("#2f9a3e");
const BUD_GREEN = hexToLinear("#6fbf4a");

const PETAL_COLORS = [
  "#ff4f79",
  "#ffd23f",
  "#ff8c42",
  "#b57bff",
  "#ffffff",
  "#5ab8ff",
  "#ff3b3b",
  "#ff9ecb",
  "#f7f06d"
].map(hexToLinear);
const CENTER_COLORS = ["#ffcf24", "#8a4b1f", "#ff9a1f", "#fff2a0"].map(hexToLinear);

// ---------------------------------------------------------------- deterministic rng
let seed = 20240607;
function rand(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

// ---------------------------------------------------------------- math helpers
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Column-major T * Ry(yaw) * Rz(tilt) * S written into m at float offset o. */
function putMatrix(
  m: Float32Array,
  o: number,
  px: number,
  py: number,
  pz: number,
  yaw: number,
  tilt: number,
  sx: number,
  sy: number,
  sz: number
): void {
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  m[o] = ca * c * sx;
  m[o + 1] = s * sx;
  m[o + 2] = -sa * c * sx;
  m[o + 3] = 0;
  m[o + 4] = -ca * s * sy;
  m[o + 5] = c * sy;
  m[o + 6] = sa * s * sy;
  m[o + 7] = 0;
  m[o + 8] = sa * sz;
  m[o + 9] = 0;
  m[o + 10] = ca * sz;
  m[o + 11] = 0;
  m[o + 12] = px;
  m[o + 13] = py;
  m[o + 14] = pz;
  m[o + 15] = 1;
}

function putColor(
  c: Float32Array,
  o: number,
  r: number,
  g: number,
  b: number
): void {
  c[o] = r;
  c[o + 1] = g;
  c[o + 2] = b;
  c[o + 3] = 1;
}

// ---------------------------------------------------------------- scene
function hiddenTransforms(count: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  for (let i = 0; i < count; i += 1) out.push({ position: [0, -50, 0], scale: [0.001, 0.001, 0.001] });
  return out;
}

const whiteMat = material.pbr({ color: "#ffffff", roughness: 0.75, metallic: 0 });

const app = createAuraApp("#app", {
  scene: scene({ background: SKY })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ name: "sky-fill", skyColor: "#d6ecff", groundColor: "#7a5c3a", intensity: 0.7 }))
    .add(
      lights.directional({
        name: "sun",
        position: [-7, 12, 6],
        target: [0, 0, 0],
        intensity: 2.4,
        color: "#fff3dc",
        shadow: {
          filter: "pcf",
          softness: 2,
          mapSize: 2048,
          cascades: 1,
          fit: { center: [0, 0, -1], extent: 22 }
        }
      })
    )
    .add(
      primitives.plane({
        name: "ground",
        position: [0, 0, (GZ0 + GZ1) / 2],
        size: [GX * 2, 1, GZ1 - GZ0],
        material: material.pbr({ color: "#7d5d3d", roughness: 1, metallic: 0 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      instances
        .cylinder({
          name: "stems",
          transforms: hiddenTransforms(MAX_PLANTS),
          material: whiteMat,
          params: { radialSegments: 8 },
          castShadow: true,
          receiveShadow: true
        })
        .runtime({ id: "stems", mutable: true })
    )
    .add(
      instances
        .sphere({
          name: "blobs",
          transforms: hiddenTransforms(MAX_PLANTS * SPHERES_PER_PLANT),
          material: whiteMat,
          params: { widthSegments: 8, heightSegments: 5 },
          castShadow: true,
          receiveShadow: true
        })
        .runtime({ id: "blobs", mutable: true })
    )
    .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 0.5, far: 200 }))
});

// ---------------------------------------------------------------- plants
const plants: PlantRecord[] = [];
const stemMats = new Float32Array(MAX_PLANTS * 16);
const stemCols = new Float32Array(MAX_PLANTS * 4);
const blobMats = new Float32Array(MAX_PLANTS * SPHERES_PER_PLANT * 16);
const blobCols = new Float32Array(MAX_PLANTS * SPHERES_PER_PLANT * 4);

let stemsHandle: AuraRuntimeNodeHandle | undefined;
let blobsHandle: AuraRuntimeNodeHandle | undefined;
let dirty = true;
let lastVisible: boolean | undefined;

function growthOf(p: PlantRecord, now: number): number {
  return clamp01((now - p.t0) / GROW_MS);
}

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < -GX || x > GX || z < GZ0 || z > GZ1) return false;
  if (plants.length >= MAX_PLANTS) return false;
  const flowerSize = 0.7 + rand() * 0.55;
  plants.push({
    x,
    z,
    t0: performance.now(),
    rot: rand() * Math.PI * 2,
    height: 1.2 + rand() * 0.7,
    flower: flowerSize,
    leaf: 0.5 + rand() * 0.25,
    petal: PETAL_COLORS[Math.floor(rand() * PETAL_COLORS.length)] ?? PETAL_COLORS[0]!,
    center: CENTER_COLORS[Math.floor(rand() * CENTER_COLORS.length)] ?? CENTER_COLORS[0]!,
    shade: 0.8 + rand() * 0.4
  });
  dirty = true;
  updateCount();
  return true;
}

function clearPlants(): void {
  plants.length = 0;
  dirty = true;
  updateCount();
}

const LEAF_FRAC = [0.34, 0.54, 0.72, 0.88];

function writePlant(k: number, p: PlantRecord, now: number): void {
  const g = growthOf(p, now);
  const e = smooth(g);
  const h = p.height * (0.1 + 0.9 * e);
  const th = 0.04 + 0.05 * e;

  // stem
  putMatrix(stemMats, k * 16, p.x, h / 2, p.z, 0, 0, th, h, th);
  putColor(
    stemCols,
    k * 4,
    lerp(SPROUT_STEM[0], MATURE_STEM[0], e),
    lerp(SPROUT_STEM[1], MATURE_STEM[1], e),
    lerp(SPROUT_STEM[2], MATURE_STEM[2], e)
  );

  const base = k * SPHERES_PER_PLANT;
  const leafR = lerp(SPROUT_LEAF[0], MATURE_LEAF[0] * p.shade, e);
  const leafG = lerp(SPROUT_LEAF[1], MATURE_LEAF[1] * p.shade, e);
  const leafB = lerp(SPROUT_LEAF[2], MATURE_LEAF[2] * p.shade, e);

  // leaves
  for (let i = 0; i < LEAVES; i += 1) {
    const slot = base + i;
    const early = i < 2;
    const frac = early ? lerp(0.96, LEAF_FRAC[i] ?? 0.5, e) : (LEAF_FRAC[i] ?? 0.8);
    const lenK = early ? 0.16 + 0.84 * e : smooth((g - 0.2) / 0.5);
    const len = Math.max(0.0005, p.leaf * lenK);
    const yaw = p.rot + (i % 2) * Math.PI + (i >= 2 ? Math.PI / 2 : 0);
    const tilt = lerp(0.75, 0.3, e);
    const ax = Math.cos(yaw) * Math.cos(tilt);
    const ay = Math.sin(tilt);
    const az = -Math.sin(yaw) * Math.cos(tilt);
    const ay0 = h * frac;
    const half = len * 0.5 + th * 0.4;
    putMatrix(
      blobMats,
      slot * 16,
      p.x + ax * half,
      ay0 + ay * half,
      p.z + az * half,
      yaw,
      tilt,
      len,
      Math.max(0.01, len * 0.14),
      len * 0.5
    );
    putColor(blobCols, slot * 4, leafR, leafG, leafB);
  }

  // flower
  const bud = smooth((g - 0.25) / 0.3);
  const bloom = smooth((g - 0.45) / 0.55);
  const cd = p.flower * 0.3 * bud + 0.0005;
  const cSlot = base + LEAVES + PETALS;
  putMatrix(blobMats, cSlot * 16, p.x, h + cd * 0.15, p.z, 0, 0, cd, cd * 0.8, cd);
  putColor(
    blobCols,
    cSlot * 4,
    lerp(BUD_GREEN[0], p.center[0], bloom),
    lerp(BUD_GREEN[1], p.center[1], bloom),
    lerp(BUD_GREEN[2], p.center[2], bloom)
  );

  const pl = Math.max(0.0005, p.flower * 0.5 * bloom);
  const ptilt = lerp(1.1, 0.2, bloom);
  for (let j = 0; j < PETALS; j += 1) {
    const slot = base + LEAVES + j;
    const yaw = p.rot + (j * Math.PI * 2) / PETALS;
    const dx = Math.cos(yaw) * Math.cos(ptilt);
    const dy = Math.sin(ptilt);
    const dz = -Math.sin(yaw) * Math.cos(ptilt);
    const off = pl * 0.5 + cd * 0.3;
    putMatrix(
      blobMats,
      slot * 16,
      p.x + dx * off,
      h + cd * 0.2 + dy * off,
      p.z + dz * off,
      yaw,
      ptilt,
      pl,
      Math.max(0.008, pl * 0.18),
      pl * 0.62
    );
    // slight per-petal tone variation so heads look less flat
    const tone = j % 2 === 0 ? 1 : 0.88;
    putColor(blobCols, slot * 4, p.petal[0] * tone, p.petal[1] * tone, p.petal[2] * tone);
  }
}

function syncScene(now: number): void {
  if (!stemsHandle || !blobsHandle) return;
  const n = plants.length;
  let growing = false;
  for (let k = 0; k < n; k += 1) {
    const p = plants[k]!;
    if (now - p.t0 < GROW_MS + 100) growing = true;
  }
  const visible = n > 0;
  if (visible !== lastVisible) {
    stemsHandle.setVisible(visible);
    blobsHandle.setVisible(visible);
    lastVisible = visible;
  }
  if (!visible || (!growing && !dirty)) {
    dirty = false;
    return;
  }
  for (let k = 0; k < n; k += 1) writePlant(k, plants[k]!, now);
  stemsHandle.setInstanceMatrices(stemMats, n, stemCols);
  blobsHandle.setInstanceMatrices(blobMats, n * SPHERES_PER_PLANT, blobCols);
  dirty = false;
}

// ---------------------------------------------------------------- DOM overlay
const overlay = document.createElement("div");
overlay.id = "hud";
overlay.style.cssText =
  "position:fixed;top:8px;left:8px;display:flex;align-items:center;gap:8px;padding:5px 8px;" +
  "background:rgba(20,30,20,0.62);color:#fff;border-radius:6px;font:600 13px/1.2 system-ui,sans-serif;" +
  "z-index:10;user-select:none;";
const countLabel = document.createElement("span");
countLabel.id = "plant-count";
countLabel.textContent = "Plants: 0";
const clearButton = document.createElement("button");
clearButton.id = "clear-btn";
clearButton.type = "button";
clearButton.textContent = "Clear";
clearButton.style.cssText =
  "font:600 12px system-ui,sans-serif;padding:3px 9px;border:0;border-radius:4px;background:#f2f2f2;color:#222;cursor:pointer;";
clearButton.addEventListener("click", (ev) => {
  ev.stopPropagation();
  clearPlants();
});
overlay.append(countLabel, clearButton);
document.body.appendChild(overlay);

function updateCount(): void {
  countLabel.textContent = `Plants: ${plants.length}`;
}

// ---------------------------------------------------------------- click -> ground picking
const canvas = document.getElementById("app") as HTMLCanvasElement;

function sub(a: number[], b: number[]): number[] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}
function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function norm(a: number[]): number[] {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}

const camForward = norm(sub(CAM_TARGET, CAM_POS));
const camRight = norm(cross(camForward, [0, 1, 0]));
const camUp = cross(camRight, camForward);
const tanV = Math.tan((CAM_FOV * Math.PI) / 360);

function pickGround(clientX: number, clientY: number): { x: number; z: number } | undefined {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return undefined;
  const aspect = rect.width / rect.height;
  const dir = [
    camForward[0]! + camRight[0]! * nx * tanV * aspect + camUp[0]! * ny * tanV,
    camForward[1]! + camRight[1]! * nx * tanV * aspect + camUp[1]! * ny * tanV,
    camForward[2]! + camRight[2]! * nx * tanV * aspect + camUp[2]! * ny * tanV
  ];
  if (dir[1]! >= -1e-6) return undefined; // ray never reaches the ground
  const t = -CAM_POS[1] / dir[1]!;
  if (t <= 0) return undefined;
  const x = CAM_POS[0] + dir[0]! * t;
  const z = CAM_POS[2] + dir[2]! * t;
  if (x < -GX || x > GX || z < GZ0 || z > GZ1) return undefined;
  return { x, z };
}

canvas.addEventListener("click", (ev) => {
  const hit = pickGround(ev.clientX, ev.clientY);
  if (hit) plantAt(hit.x, hit.z);
});

// ---------------------------------------------------------------- task state
let ready = false;
const state = {
  get plantCount(): number {
    return plants.length;
  },
  get plants(): TaskPlant[] {
    const now = performance.now();
    return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
  },
  get ready(): boolean {
    return ready;
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: Object.freeze(state), writable: false, enumerable: true, configurable: false });
Object.defineProperty(window, "__plantAt", {
  value: (x: number, z: number): boolean => plantAt(Number(x), Number(z)),
  writable: false,
  enumerable: true,
  configurable: false
});

// ---------------------------------------------------------------- loop
let frames = 0;
app.onFrame(() => {
  if (!stemsHandle) {
    stemsHandle = app.nodes.require("stems");
    blobsHandle = app.nodes.require("blobs");
    stemsHandle.frustumCulled = false;
    blobsHandle.frustumCulled = false;
  }
  syncScene(performance.now());
  frames += 1;
  if (frames === 2 && !ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();

import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

// ---------------------------------------------------------------- constants
const GROW_MS = 8000;
const POOL = 80; // maximum simultaneous plants (pre-built node slots)
const PLANT_LIMIT = 25; // plantable ground half-extent (|x|, |z|)
const HIDDEN_Y = -60;
const TINY = 1e-4;

const CAM_POS: readonly [number, number, number] = [0, 5, 9];
const CAM_TARGET: readonly [number, number, number] = [0, 0, -2];
const CAM_FOV_DEG = 45;
const ASPECT = 640 / 360;

const PALETTE = ["#ff4d6d", "#ffd93d", "#c77dff", "#ff8fab", "#f4f1ea", "#ff7b00", "#4cc9f0", "#f72585"];

// ---------------------------------------------------------------- helpers
const frac = (v: number): number => v - Math.floor(v);
const hash = (i: number, k: number): number => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

interface SlotParams {
  readonly yaw: number;
  readonly height: number;
  readonly flowerR: number;
}

const slotParams: SlotParams[] = [];
for (let i = 0; i < POOL; i += 1) {
  slotParams.push({
    yaw: hash(i, 1) * Math.PI,
    height: 0.9 + 0.7 * hash(i, 2),
    flowerR: 0.17 + 0.15 * hash(i, 3)
  });
}

const ids = (i: number) => ({
  stem: `stem${i}`,
  leafA: `leafA${i}`,
  leafB: `leafB${i}`,
  flower: `flower${i}`,
  centre: `centre${i}`
});

// ---------------------------------------------------------------- scene
const stemMat = material.pbr({ color: "#4f9d3a", roughness: 0.8 });
const leafMat = material.pbr({ color: "#3f8f33", roughness: 0.75 });
const centreMat = material.pbr({ color: "#ffcf33", roughness: 0.6 });
const flowerMats = PALETTE.map((c) => material.pbr({ color: c, roughness: 0.55 }));

const stage = scene({ background: "#bcdcf2" })
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#dbe9ff", groundColor: "#5b5a3a", intensity: 0.45 }))
  .add(lights.directional({ name: "sun", position: [8, 14, 6], target: [0, 0, 0], intensity: 2.4, color: "#fff2dc", shadow: true }))
  .add(effects.fog({ color: "#bcdcf2", density: 0.006 }))
  .add(
    primitives.plane({
      name: "ground",
      size: [200, 1, 200],
      material: material.pbr({ color: "#7a5a3a", roughness: 1 }),
      receiveShadow: true,
      castShadow: false
    })
  )
  .camera(camera.perspective({ position: [...CAM_POS], target: [...CAM_TARGET], fov: CAM_FOV_DEG, near: 0.5, far: 300 }));

for (let i = 0; i < POOL; i += 1) {
  const id = ids(i);
  stage.add(
    primitives
      .cylinder({ name: id.stem, size: 1, material: stemMat, castShadow: true, receiveShadow: true })
      .position(0, HIDDEN_Y, 0)
      .scale(TINY)
      .runtime({ id: id.stem, mutable: true })
  );
  stage.add(
    primitives
      .sphere({ name: id.leafA, size: 1, material: leafMat, castShadow: true, receiveShadow: true })
      .position(0, HIDDEN_Y, 0)
      .scale(TINY)
      .runtime({ id: id.leafA, mutable: true })
  );
  stage.add(
    primitives
      .sphere({ name: id.leafB, size: 1, material: leafMat, castShadow: true, receiveShadow: true })
      .position(0, HIDDEN_Y, 0)
      .scale(TINY)
      .runtime({ id: id.leafB, mutable: true })
  );
  stage.add(
    primitives
      .sphere({ name: id.flower, size: 1, material: flowerMats[(i * 3) % flowerMats.length], castShadow: true, receiveShadow: true })
      .position(0, HIDDEN_Y, 0)
      .scale(TINY)
      .runtime({ id: id.flower, mutable: true })
  );
  stage.add(
    primitives
      .sphere({ name: id.centre, size: 1, material: centreMat, castShadow: false, receiveShadow: false })
      .position(0, HIDDEN_Y, 0)
      .scale(TINY)
      .runtime({ id: id.centre, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: stage, resize: false });

// ---------------------------------------------------------------- plant state
interface Plant {
  readonly x: number;
  readonly z: number;
  readonly t0: number;
  readonly slot: number;
  done: boolean;
}

const plants: Plant[] = [];
let ready = false;

const growthOf = (p: Plant, now: number): number => clamp01((now - p.t0) / GROW_MS);

type Handle = ReturnType<typeof app.nodes.require>;
interface SlotHandles {
  stem: Handle;
  leafA: Handle;
  leafB: Handle;
  flower: Handle;
  centre: Handle;
}
const handles: SlotHandles[] = [];
const getHandles = (slot: number): SlotHandles => {
  let h = handles[slot];
  if (!h) {
    const id = ids(slot);
    h = {
      stem: app.nodes.require(id.stem),
      leafA: app.nodes.require(id.leafA),
      leafB: app.nodes.require(id.leafB),
      flower: app.nodes.require(id.flower),
      centre: app.nodes.require(id.centre)
    };
    handles[slot] = h;
  }
  return h;
};

const hideSlot = (slot: number): void => {
  const h = getHandles(slot);
  for (const n of [h.stem, h.leafA, h.leafB, h.flower, h.centre]) {
    n.setPosition(0, HIDDEN_Y, 0);
    n.setScale(TINY, TINY, TINY);
  }
};

const applyPlant = (p: Plant, g: number): void => {
  const h = getHandles(p.slot);
  const sp = slotParams[p.slot];
  const e = smooth(g);

  // stem: short pale sprout -> tall stem
  const stemH = 0.06 + (sp.height - 0.06) * e;
  const stemW = 0.035 + 0.035 * e;
  h.stem.setPosition(p.x, stemH / 2, p.z);
  h.stem.setScale(stemW, stemH, stemW);

  // leaves: two small seed leaves near the top -> large leaves lower on the stem
  const len = 0.09 + 0.5 * e;
  const leafY = stemH * (0.85 - 0.4 * e);
  const dx = Math.cos(sp.yaw) * len * 0.5;
  const dz = -Math.sin(sp.yaw) * len * 0.5;
  const lw = len;
  const lt = 0.03 + 0.025 * e;
  const ld = len * 0.45;
  h.leafA.setPosition(p.x + dx, leafY, p.z + dz);
  h.leafA.setRotation(0, sp.yaw, 0);
  h.leafA.setScale(lw, lt, ld);
  h.leafB.setPosition(p.x - dx, leafY + 0.03 * e, p.z - dz);
  h.leafB.setRotation(0, sp.yaw, 0);
  h.leafB.setScale(lw, lt, ld);

  // flower: appears in the second half of the growth
  const fe = smooth((g - 0.5) / 0.5);
  const r = Math.max(TINY, sp.flowerR * fe);
  h.flower.setPosition(p.x, stemH + r * 0.55, p.z);
  h.flower.setScale(2 * r, 1.3 * r, 2 * r);
  const cr = Math.max(TINY, r * 0.8);
  h.centre.setPosition(p.x, stemH + r * 0.55 + r * 0.55, p.z);
  h.centre.setScale(cr, cr * 0.7, cr);
};

const plantAt = (x: number, z: number): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > PLANT_LIMIT || Math.abs(z) > PLANT_LIMIT) return false;
  if (plants.length >= POOL) return false;
  const p: Plant = { x, z, t0: performance.now(), slot: plants.length, done: false };
  plants.push(p);
  if (ready) applyPlant(p, 0);
  updateCounter();
  return true;
};

const clearPlants = (): void => {
  for (const p of plants) hideSlot(p.slot);
  plants.length = 0;
  updateCounter();
};

// ---------------------------------------------------------------- click -> ground
const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: readonly number[], b: readonly number[]): number[] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a: readonly number[]): number[] => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const fwd = norm(sub(CAM_TARGET, CAM_POS));
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((CAM_FOV_DEG * Math.PI) / 360);

/** Intersect the camera ray through normalised device coords with y = 0. */
const groundHit = (ndcX: number, ndcY: number): { x: number; z: number } | null => {
  const sx = ndcX * tanHalf * ASPECT;
  const sy = ndcY * tanHalf;
  const d = [fwd[0] + sx * right[0] + sy * up[0], fwd[1] + sx * right[1] + sy * up[1], fwd[2] + sx * right[2] + sy * up[2]];
  if (d[1] >= -1e-6) return null;
  const t = -CAM_POS[1] / d[1];
  if (t <= 0) return null;
  return { x: CAM_POS[0] + d[0] * t, z: CAM_POS[2] + d[2] * t };
};

const canvas = document.getElementById("app") as HTMLCanvasElement;
canvas.addEventListener("click", (ev: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((ev.clientY - rect.top) / rect.height) * 2;
  const hit = groundHit(ndcX, ndcY);
  if (hit) plantAt(hit.x, hit.z);
});

// ---------------------------------------------------------------- DOM overlay
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;" +
  "background:rgba(20,30,20,0.65);color:#fff;border-radius:6px;font:13px/1.4 system-ui,sans-serif;z-index:10;";
const counter = document.createElement("span");
counter.id = "plant-count";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.type = "button";
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:inherit;padding:2px 8px;cursor:pointer;";
clearBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  clearPlants();
});
overlay.append(counter, clearBtn);
document.body.appendChild(overlay);

function updateCounter(): void {
  counter.textContent = `Plants: ${plants.length}`;
}
updateCounter();

// ---------------------------------------------------------------- exposed state
const state = {};
Object.defineProperties(state, {
  plantCount: { get: (): number => plants.length, enumerable: true },
  plants: {
    get: (): { x: number; z: number; growth: number }[] => {
      const now = performance.now();
      return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
    },
    enumerable: true
  },
  ready: { get: (): boolean => ready, enumerable: true }
});
Object.freeze(state);
Object.defineProperty(window, "__TASK_STATE__", { value: state, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__plantAt", {
  value: (x: number, z: number): boolean => plantAt(Number(x), Number(z)),
  writable: false,
  configurable: false
});

// ---------------------------------------------------------------- frame loop
const markReady = (): void => {
  if (ready) return;
  ready = true;
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  for (const p of plants) applyPlant(p, growthOf(p, performance.now()));
};

app.onFrame(() => {
  if (!ready) return;
  const now = performance.now();
  for (const p of plants) {
    if (p.done) continue;
    const g = growthOf(p, now);
    applyPlant(p, g);
    if (g >= 1) p.done = true;
  }
});

await app.ready();
// Hide all slots explicitly, then flag readiness once a frame has actually been presented.
for (let i = 0; i < POOL; i += 1) hideSlot(i);
requestAnimationFrame(() => requestAnimationFrame(markReady));

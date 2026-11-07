import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

// ---------- configuration ----------
const GROW_SECONDS = 8;
const POOL = 100; // plant slots built up front; nodes are moved/scaled at runtime
const GROUND_X = 14; // ground spans x in [-14, 14]
const GROUND_Z = 10; // ground spans z in [-10, 10]
const CAM_POS: [number, number, number] = [0, 11, 13];
const CAM_TARGET: [number, number, number] = [0, 0, 1];
const CAM_FOV_DEG = 40;
const HIDDEN_Y = -60;
const TINY = 0.0001;

const FLOWER_COLORS = ["#e8453c", "#f2a33a", "#f5e04a", "#e56bb0", "#9a6ae0", "#f4f1ec", "#4f8ff0", "#ff7a59"];

interface Plant {
  x: number;
  z: number;
  slot: number;
  start: number; // performance.now() ms
  size: number; // mature size factor
  yaw: number;
  settled: boolean;
}

// ---------- seeded variation ----------
let seed = 20240607;
const rand = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- scene ----------
const stemMat = material.pbr({ color: "#3f8f3a", roughness: 0.8 });
const leafMat = material.pbr({ color: "#58b04a", roughness: 0.75 });
const centerMat = material.pbr({ color: "#f7c52a", roughness: 0.6 });

let stage = scene({ background: "#bfdcf2" })
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#dcecff", groundColor: "#5f7a40", intensity: 0.5 }))
  .add(
    lights.directional({
      name: "sun",
      position: [9, 16, 7],
      target: [0, 0, 0],
      intensity: 2.6,
      color: "#fff3dc",
      shadow: true
    })
  )
  .add(
    primitives.plane({
      name: "ground",
      size: [GROUND_X * 2, 1, GROUND_Z * 2],
      material: material.pbr({ color: "#6e9a4b", roughness: 1 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV_DEG, near: 0.5, far: 120 }));

const STEM_SIZE: [number, number, number] = [0.09, 1, 0.09]; // height 1 at scale 1
const LEAF_SIZE: [number, number, number] = [1, 0.22, 0.5]; // length 1 at scale 1
const HEAD_SIZE: [number, number, number] = [1, 0.4, 1]; // diameter 1 at scale 1
const CORE_SIZE: [number, number, number] = [1, 0.8, 1];

for (let i = 0; i < POOL; i += 1) {
  const headMat = material.pbr({ color: FLOWER_COLORS[i % FLOWER_COLORS.length] ?? "#e8453c", roughness: 0.55 });
  // Each part has a fixed aspect ratio baked into `size`; at runtime only a uniform scale is applied.
  const parts: Array<{ id: string; kind: "cylinder" | "sphere"; size: [number, number, number]; mat: typeof stemMat }> = [
    { id: `stem${i}`, kind: "cylinder", size: STEM_SIZE, mat: stemMat },
    { id: `leafA${i}`, kind: "sphere", size: LEAF_SIZE, mat: leafMat },
    { id: `leafB${i}`, kind: "sphere", size: LEAF_SIZE, mat: leafMat },
    { id: `head${i}`, kind: "sphere", size: HEAD_SIZE, mat: headMat },
    { id: `core${i}`, kind: "sphere", size: CORE_SIZE, mat: centerMat }
  ];
  for (const p of parts) {
    const node =
      p.kind === "cylinder"
        ? primitives.cylinder({ name: p.id, size: p.size, material: p.mat, castShadow: true, receiveShadow: true, params: { radialSegments: 8 } })
        : primitives.sphere({ name: p.id, size: p.size, material: p.mat, castShadow: true, receiveShadow: true });
    stage = stage.add(node.position(0, HIDDEN_Y, 0).scale(TINY).runtime({ id: p.id, mutable: true }));
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement;
const app = createAuraApp("#app", { scene: stage, resize: false });

// ---------- state ----------
const plants: Plant[] = [];

const ease = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const smooth = (a: number, b: number, t: number): number => ease((t - a) / (b - a));
const growthOf = (p: Plant, now: number): number => Math.min(1, Math.max(0, (now - p.start) / (GROW_SECONDS * 1000)));

type Handle = ReturnType<typeof app.nodes.require>;
interface SlotHandles {
  stem: Handle;
  leafA: Handle;
  leafB: Handle;
  head: Handle;
  core: Handle;
}
const handles: SlotHandles[] = [];
const getHandles = (slot: number): SlotHandles => {
  let h = handles[slot];
  if (!h) {
    h = {
      stem: app.nodes.require(`stem${slot}`),
      leafA: app.nodes.require(`leafA${slot}`),
      leafB: app.nodes.require(`leafB${slot}`),
      head: app.nodes.require(`head${slot}`),
      core: app.nodes.require(`core${slot}`)
    };
    handles[slot] = h;
  }
  return h;
};

const hideSlot = (slot: number): void => {
  const h = getHandles(slot);
  for (const n of [h.stem, h.leafA, h.leafB, h.head, h.core]) {
    n.setPosition(0, HIDDEN_Y, 0);
    n.setScale(TINY);
  }
};

const poseSlot = (p: Plant, g: number): void => {
  const h = getHandles(p.slot);
  const e = ease(g);
  const sz = p.size;

  // stem: short sprout stub grows into a tall stalk
  const stemH = Math.max(TINY, sz * (0.1 + 1.2 * e));
  h.stem.setScale(stemH);
  h.stem.setPosition(p.x, stemH / 2, p.z);

  // leaves: two cotyledons at the sprout stage, larger leaves further up the stem when mature
  const leafLen = sz * (0.22 + 0.6 * e);
  const leafY = stemH * (0.3 + 0.2 * e);
  const placeLeaf = (n: Handle, angle: number, lift: number): void => {
    const dx = Math.cos(angle);
    const dz = -Math.sin(angle);
    n.setScale(leafLen);
    n.setRotation(0, angle, 0);
    n.setPosition(p.x + dx * leafLen * 0.5, leafY + lift, p.z + dz * leafLen * 0.5);
  };
  placeLeaf(h.leafA, p.yaw, 0);
  placeLeaf(h.leafB, p.yaw + Math.PI, stemH * 0.12 * e);

  // flower: a bud appears only once the plant is well grown
  const fe = smooth(0.5, 1, g);
  const headD = Math.max(TINY, sz * 0.62 * fe);
  h.head.setScale(headD);
  h.head.setPosition(p.x, stemH + headD * 0.15, p.z);
  const coreD = Math.max(TINY, headD * 0.42);
  h.core.setScale(coreD);
  h.core.setPosition(p.x, stemH + headD * 0.3, p.z);
};

const countEl = document.createElement("span");
const updateCount = (): void => {
  countEl.textContent = `Plants: ${plants.length}`;
};

const plantAt = (x: number, z: number): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > GROUND_X || Math.abs(z) > GROUND_Z) return false;
  if (plants.length >= POOL) return false;
  const plant: Plant = {
    x,
    z,
    slot: plants.length,
    start: performance.now(),
    size: 0.8 + rand() * 0.6,
    yaw: rand() * Math.PI * 2,
    settled: false
  };
  plants.push(plant);
  poseSlot(plant, 0);
  updateCount();
  return true;
};

const clearPlants = (): void => {
  for (const p of plants) hideSlot(p.slot);
  plants.length = 0;
  updateCount();
};

// ---------- click -> ground mapping ----------
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const screenToGround = (clientX: number, clientY: number): { x: number; z: number } | null => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  const aspect = rect.width / rect.height;
  const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const th = Math.tan((CAM_FOV_DEG * Math.PI) / 360);
  const dir: [number, number, number] = [
    fwd[0] + right[0] * ndcX * th * aspect + up[0] * ndcY * th,
    fwd[1] + right[1] * ndcX * th * aspect + up[1] * ndcY * th,
    fwd[2] + right[2] * ndcX * th * aspect + up[2] * ndcY * th
  ];
  if (dir[1] >= -1e-6) return null; // ray points at the sky
  const t = -CAM_POS[1] / dir[1];
  if (t <= 0) return null;
  const x = CAM_POS[0] + dir[0] * t;
  const z = CAM_POS[2] + dir[2] * t;
  if (Math.abs(x) > GROUND_X || Math.abs(z) > GROUND_Z) return null;
  return { x, z };
};

canvas.addEventListener("click", (ev: MouseEvent) => {
  const hit = screenToGround(ev.clientX, ev.clientY);
  if (hit) plantAt(hit.x, hit.z);
});

// ---------- DOM overlay ----------
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;top:8px;left:8px;z-index:10;display:flex;gap:8px;align-items:center;padding:6px 10px;" +
  "background:rgba(20,30,20,0.62);color:#fff;border-radius:6px;font:600 13px/1.2 system-ui,sans-serif;user-select:none";
const clearBtn = document.createElement("button");
clearBtn.type = "button";
clearBtn.textContent = "Clear";
clearBtn.style.cssText =
  "font:600 12px system-ui,sans-serif;padding:3px 10px;border:0;border-radius:4px;background:#e8f3df;color:#1f3a1a;cursor:pointer";
clearBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  clearPlants();
});
overlay.append(countEl, clearBtn);
document.body.append(overlay);
updateCount();

// ---------- public state ----------
interface TaskState {
  readonly plantCount: number;
  readonly plants: ReadonlyArray<{ x: number; z: number; growth: number }>;
  readonly ready: boolean;
}
let isReady = false;
const taskState: TaskState = {
  get plantCount(): number {
    return plants.length;
  },
  get plants(): ReadonlyArray<{ x: number; z: number; growth: number }> {
    const now = performance.now();
    return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
  },
  get ready(): boolean {
    return isReady;
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: taskState, writable: false, configurable: false, enumerable: true });
const w = window as unknown as { __plantAt?: (x: number, z: number) => boolean; __EVAL_READY__?: boolean };
w.__plantAt = (x: number, z: number): boolean => plantAt(x, z);

// ---------- per-frame growth ----------
app.onFrame(() => {
  const now = performance.now();
  for (const p of plants) {
    if (p.settled) continue;
    const g = growthOf(p, now);
    poseSlot(p, g);
    if (g >= 1) p.settled = true;
  }
});

await app.ready();
for (let i = 0; i < POOL; i += 1) getHandles(i);
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    isReady = true;
    w.__EVAL_READY__ = true;
  })
);

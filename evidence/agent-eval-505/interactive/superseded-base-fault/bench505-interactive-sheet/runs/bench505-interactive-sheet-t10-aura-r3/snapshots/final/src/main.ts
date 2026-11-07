import { camera, createAuraApp, lights, material, primitives, scene, instances, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { readonly plantCount: number; readonly plants: { x: number; z: number; growth: number }[]; readonly ready: boolean };
    __plantAt?: (x: number, z: number) => boolean;
  }
}

// ---------- constants ----------
const GROW_MS = 8000;
const MAX_PLANTS = 150;
const LEAVES = 4;
const PETALS = 6;
const HALF_X = 12;
const HALF_Z = 9;
const CAM_POS: [number, number, number] = [0, 16, 19];
const CAM_TARGET: [number, number, number] = [0, 0, 1];
const FOV_DEG = 45;

// ---------- plants ----------
interface Plant {
  x: number;
  z: number;
  born: number;
  growth: number;
  height: number;
  leafSize: number;
  flowerSize: number;
  hue: number;
  rot: number;
}

let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const plants: Plant[] = [];
let dirty = true;
let ready = false;

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.001, 0.001, 0.001] };
const hiddenList = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => HIDDEN);
const whiteList = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");

const white = material.pbr({ color: "#ffffff", roughness: 0.8 });

const sc = scene({ background: "#bfe3f7" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: FOV_DEG, near: 1, far: 200 }))
  .add(lights.hemisphere({ skyColor: "#dcefff", groundColor: "#6b5a3e", intensity: 1.0 }))
  .add(lights.directional({ position: [9, 18, 8], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(primitives.plane({ name: "ground", size: [HALF_X * 2, 1, HALF_Z * 2], material: material.pbr({ color: "#6a8f3f", roughness: 1 }) }))
  .add(instances.cylinder({
    name: "stems", transforms: hiddenList(MAX_PLANTS), colors: whiteList(MAX_PLANTS), material: white, params: { radialSegments: 8 }
  }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({
    name: "leaves", transforms: hiddenList(MAX_PLANTS * LEAVES), colors: whiteList(MAX_PLANTS * LEAVES), material: white
  }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({
    name: "petals", transforms: hiddenList(MAX_PLANTS * PETALS), colors: whiteList(MAX_PLANTS * PETALS), material: white
  }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({
    name: "heads", transforms: hiddenList(MAX_PLANTS), colors: whiteList(MAX_PLANTS), material: white
  }).runtime({ id: "heads", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

// ---------- overlay ----------
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;" +
  "background:rgba(20,30,20,0.6);border-radius:6px;color:#fff;font:14px system-ui,sans-serif;z-index:10;user-select:none";
const label = document.createElement("span");
label.id = "plant-count";
label.textContent = "Plants: 0";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "cursor:pointer;padding:2px 10px;font:inherit";
overlay.append(label, clearBtn);
document.body.appendChild(overlay);

let shownCount = -1;
const updateLabel = (): void => {
  if (shownCount !== plants.length) {
    shownCount = plants.length;
    label.textContent = `Plants: ${plants.length}`;
  }
};

clearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  plants.length = 0;
  dirty = true;
  updateLabel();
});

// ---------- planting ----------
const plantAt = (x: number, z: number): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF_X || Math.abs(z) > HALF_Z) return false;
  if (plants.length >= MAX_PLANTS) plants.shift();
  plants.push({
    x, z,
    born: performance.now(),
    growth: 0,
    height: 1.5 + rand() * 0.9,
    leafSize: 0.6 + rand() * 0.35,
    flowerSize: 0.7 + rand() * 0.8,
    hue: Math.floor(rand() * 360),
    rot: rand() * Math.PI * 2
  });
  dirty = true;
  updateLabel();
  return true;
};

// ---------- click -> ground ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
];
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((FOV_DEG * Math.PI) / 360);

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((e.clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const sx = nx * tanHalf * aspect;
  const sy = ny * tanHalf;
  const d: [number, number, number] = [
    fwd[0] + right[0] * sx + up[0] * sy,
    fwd[1] + right[1] * sx + up[1] * sy,
    fwd[2] + right[2] * sx + up[2] * sy
  ];
  if (d[1] >= -1e-6) return; // ray does not reach the ground
  const t = -CAM_POS[1] / d[1];
  plantAt(CAM_POS[0] + d[0] * t, CAM_POS[2] + d[2] * t);
});

window.__plantAt = plantAt;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: () => ({
    plantCount: plants.length,
    plants: plants.map((p) => ({ x: p.x, z: p.z, growth: p.growth })),
    ready
  })
});

// ---------- rendering of plants ----------
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const rebuild = (): void => {
  const stemT: AuraTransformSpec[] = hiddenList(MAX_PLANTS);
  const stemC: string[] = whiteList(MAX_PLANTS);
  const leafT: AuraTransformSpec[] = hiddenList(MAX_PLANTS * LEAVES);
  const leafC: string[] = whiteList(MAX_PLANTS * LEAVES);
  const petT: AuraTransformSpec[] = hiddenList(MAX_PLANTS * PETALS);
  const petC: string[] = whiteList(MAX_PLANTS * PETALS);
  const headT: AuraTransformSpec[] = hiddenList(MAX_PLANTS);
  const headC: string[] = whiteList(MAX_PLANTS);

  for (let i = 0; i < plants.length; i += 1) {
    const p = plants[i]!;
    const e = smooth(p.growth);
    const h = lerp(0.3, p.height, e);
    const w = lerp(0.07, 0.12, e);
    stemT[i] = { position: [p.x, h / 2, p.z], scale: [w, h, w] };
    stemC[i] = `hsl(${Math.round(lerp(95, 125, e))}, 60%, ${Math.round(lerp(60, 30, e))}%)`;

    const leafLen = lerp(0.3, 1.0, e) * p.leafSize;
    const leafHue = Math.round(lerp(90, 120, e));
    const leafLight = Math.round(lerp(58, 34, e));
    for (let k = 0; k < LEAVES; k += 1) {
      const a = p.rot + k * (Math.PI / 2) + (k % 2) * 0.4;
      const frac = lerp(0.55, 0.25 + k * 0.15, e);
      const off = leafLen * 0.5;
      leafT[i * LEAVES + k] = {
        position: [p.x + Math.cos(a) * off, h * frac + 0.04, p.z + Math.sin(a) * off],
        rotation: [0, -a, 0],
        scale: [leafLen, leafLen * 0.14, leafLen * 0.45]
      };
      leafC[i * LEAVES + k] = `hsl(${leafHue}, 55%, ${leafLight}%)`;
    }

    // bud / flower head
    const b = smooth((p.growth - 0.45) / 0.55);
    const headY = h + 0.03;
    const budSize = lerp(0.1, 0.16, e) + 0.18 * p.flowerSize * b;
    headT[i] = { position: [p.x, headY, p.z], scale: [budSize, budSize, budSize] };
    headC[i] = b > 0.05
      ? `hsl(${(p.hue + 40) % 360}, 90%, ${Math.round(lerp(50, 38, b))}%)`
      : `hsl(${Math.round(lerp(95, 110, e))}, 60%, 50%)`;

    for (let k = 0; k < PETALS; k += 1) {
      const idx = i * PETALS + k;
      if (b < 0.02) continue;
      const a = p.rot + (k / PETALS) * Math.PI * 2;
      const len = 0.55 * p.flowerSize * b;
      const rad = 0.24 * p.flowerSize * b;
      petT[idx] = {
        position: [p.x + Math.cos(a) * rad, headY + 0.03 * b, p.z + Math.sin(a) * rad],
        rotation: [0, -a, 0],
        scale: [len, len * 0.22, len * 0.55]
      };
      petC[idx] = `hsl(${p.hue}, 85%, ${60 + (k % 2) * 6}%)`;
    }
  }

  app.nodes.require("stems").setInstances?.(stemT, stemC);
  app.nodes.require("leaves").setInstances?.(leafT, leafC);
  app.nodes.require("petals").setInstances?.(petT, petC);
  app.nodes.require("heads").setInstances?.(headT, headC);
};

app.onFrame(() => {
  const now = performance.now();
  let growing = false;
  for (const p of plants) {
    if (p.growth < 1) {
      p.growth = Math.min(1, (now - p.born) / GROW_MS);
      growing = true;
    }
  }
  if (growing || dirty) {
    rebuild();
    dirty = false;
  }
});

await app.ready();
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
ready = true;
window.__EVAL_READY__ = true;

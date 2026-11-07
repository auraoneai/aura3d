import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

interface Plant {
  x: number;
  z: number;
  born: number;
  size: number;
  phase: number;
  flowerColor: string;
  leafColor: string;
}

interface PlantState {
  plantCount: number;
  plants: { x: number; z: number; growth: number }[];
  ready: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__?: PlantState;
    __plantAt?: (x: number, z: number) => boolean;
    __EVAL_READY__?: boolean;
  }
}

const GROW_SECONDS = 8;
const HALF = 11; // ground half extent
const MAX_PLANTS = 150;
const LEAVES = 4;
const PETALS = 6;

const CAM_POS: [number, number, number] = [0, 20, 24];
const CAM_TARGET: [number, number, number] = [0, 0, 0];
const CAM_FOV = 45;

let seed = 987654321;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.001, 0.001, 0.001] };
const FLOWER_COLORS = ["#ff4d6d", "#ffd23f", "#ffffff", "#b388ff", "#ff8c42", "#4dc9ff", "#ff7ad9"];

const white = material.pbr({ color: "#ffffff", roughness: 0.75 });
const hiddenArray = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => HIDDEN);
const colorArray = (n: number, c: string): string[] => Array.from({ length: n }, () => c);

const stemColors = colorArray(MAX_PLANTS, "#6fae3c");
const leafColors = colorArray(MAX_PLANTS * LEAVES, "#3f8f2f");
const petalColors = colorArray(MAX_PLANTS * PETALS, "#ffffff");
const centerColors = colorArray(MAX_PLANTS, "#e8a317");

const sc = scene({ background: "#bfe0f5" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 1, far: 200 }))
  .add(lights.hemisphere({ skyColor: "#d6ecff", groundColor: "#6b5a3a", intensity: 1.0 }))
  .add(lights.directional({ position: [12, 22, 8], target: [0, 0, 0], intensity: 2.8, shadow: true }))
  .add(effects.fog({ color: "#bfe0f5", density: 0.003 }))
  .add(primitives.plane({ name: "ground", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#5b8a3a", roughness: 1 }) }))
  .add(instances.cylinder({ name: "stems", transforms: hiddenArray(MAX_PLANTS), colors: stemColors, material: white, params: { radialSegments: 6 } }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({ name: "leaves", transforms: hiddenArray(MAX_PLANTS * LEAVES), colors: leafColors, material: white }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({ name: "petals", transforms: hiddenArray(MAX_PLANTS * PETALS), colors: petalColors, material: white }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({ name: "centers", transforms: hiddenArray(MAX_PLANTS), colors: centerColors, material: white }).runtime({ id: "centers", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let now = 0;
let plants: Plant[] = [];
let dirty = true;
let ready = false;

const growthOf = (p: Plant): number => Math.min(1, Math.max(0, (now - p.born) / GROW_SECONDS));
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX_PLANTS) return false;
  const i = plants.length;
  const flowerColor = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)] ?? "#ff4d6d";
  const leafColor = `hsl(${95 + Math.floor(rand() * 40)}, 55%, ${28 + Math.floor(rand() * 14)}%)`;
  plants.push({ x, z, born: now, size: 0.8 + rand() * 0.7, phase: rand() * Math.PI * 2, flowerColor, leafColor });
  for (let k = 0; k < LEAVES; k += 1) leafColors[i * LEAVES + k] = leafColor;
  for (let k = 0; k < PETALS; k += 1) petalColors[i * PETALS + k] = flowerColor;
  centerColors[i] = rand() < 0.5 ? "#e8a317" : "#7a4a1d";
  dirty = true;
  updateLabel();
  return true;
}

function rebuild(): void {
  const stems = hiddenArray(MAX_PLANTS);
  const leaves = hiddenArray(MAX_PLANTS * LEAVES);
  const petals = hiddenArray(MAX_PLANTS * PETALS);
  const centers = hiddenArray(MAX_PLANTS);

  plants.forEach((p, i) => {
    const g = growthOf(p);
    const e = smooth(g);
    const s = p.size;
    const stemH = (0.12 + 1.5 * e) * s;
    const stemW = (0.07 + 0.06 * e) * s;
    stems[i] = { position: [p.x, stemH / 2, p.z], scale: [stemW, stemH, stemW] };

    for (let k = 0; k < LEAVES; k += 1) {
      // first two leaves are the sprout's seed leaves, the others unfold later
      const vis = k < 2 ? 1 : smooth((e - 0.2) / 0.4);
      const len = (0.14 + 0.62 * e) * s * vis;
      if (len < 0.002) continue;
      const a = p.phase + k * (Math.PI / 2) + (k % 2) * 0.3;
      const y = stemH * (k < 2 ? 0.75 : 0.25 + 0.2 * (k - 2));
      const d = len * 0.5;
      leaves[i * LEAVES + k] = {
        position: [p.x + Math.cos(a) * d, y, p.z + Math.sin(a) * d],
        rotation: [0, -a, 0],
        scale: [len, Math.max(0.01, len * 0.14), len * 0.45]
      };
    }

    const fe = smooth((e - 0.45) / 0.55);
    if (fe > 0.001) {
      const cy = stemH + 0.04 * s;
      const cd = 0.34 * s * fe;
      centers[i] = { position: [p.x, cy + 0.03 * s, p.z], scale: [cd, cd * 0.7, cd] };
      for (let k = 0; k < PETALS; k += 1) {
        const a = p.phase + (k / PETALS) * Math.PI * 2;
        const r = 0.24 * s * fe;
        petals[i * PETALS + k] = {
          position: [p.x + Math.cos(a) * r, cy, p.z + Math.sin(a) * r],
          rotation: [0, -a, 0],
          scale: [0.42 * s * fe, 0.08 * s * fe, 0.2 * s * fe]
        };
      }
    }
  });

  app.nodes.require("stems").setInstances?.(stems, stemColors);
  app.nodes.require("leaves").setInstances?.(leaves, leafColors);
  app.nodes.require("petals").setInstances?.(petals, petalColors);
  app.nodes.require("centers").setInstances?.(centers, centerColors);
}

// DOM overlay
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;" +
  "background:rgba(20,30,20,0.65);color:#fff;font:14px sans-serif;border-radius:6px;z-index:10";
const label = document.createElement("span");
label.id = "plant-count";
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:13px sans-serif;padding:2px 8px;cursor:pointer";
overlay.append(label, clearBtn);
document.body.appendChild(overlay);

function updateLabel(): void {
  label.textContent = `Plants: ${plants.length}`;
}
clearBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  plants = [];
  dirty = true;
  updateLabel();
});
updateLabel();

// Click -> ground intersection (plane y = 0) for the fixed camera
const norm = (v: number[]): [number, number, number] => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const cross = (a: number[], b: number[]): number[] => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!
];
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((CAM_FOV * Math.PI) / 360);

const canvas = document.querySelector<HTMLCanvasElement>("#app");
canvas?.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((ev.clientY - rect.top) / rect.height) * 2;
  const aspect = rect.width / rect.height;
  const dir = [
    fwd[0] + right[0]! * nx * tanHalf * aspect + up[0]! * ny * tanHalf,
    fwd[1] + right[1]! * nx * tanHalf * aspect + up[1]! * ny * tanHalf,
    fwd[2] + right[2]! * nx * tanHalf * aspect + up[2]! * ny * tanHalf
  ];
  if (dir[1]! >= -1e-6) return; // ray points at or above the horizon
  const t = -CAM_POS[1] / dir[1]!;
  if (t <= 0) return;
  plantAt(CAM_POS[0] + dir[0]! * t, CAM_POS[2] + dir[2]! * t);
});

window.__plantAt = plantAt;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: true,
  enumerable: true,
  get: (): PlantState => ({
    plantCount: plants.length,
    plants: plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p) })),
    ready
  })
});

app.onFrame((f) => {
  now += Math.min(f.dt, 0.25);
  if (dirty || plants.some((p) => growthOf(p) < 1)) {
    rebuild();
    dirty = plants.some((p) => growthOf(p) < 1);
  }
});

await app.ready();
ready = true;
window.__EVAL_READY__ = true;

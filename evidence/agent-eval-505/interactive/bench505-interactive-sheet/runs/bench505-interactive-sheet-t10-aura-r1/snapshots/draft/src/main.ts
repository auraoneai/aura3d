import { camera, createAuraApp, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { readonly plantCount: number; readonly plants: ReadonlyArray<{ x: number; z: number; growth: number }>; readonly ready: boolean };
    __plantAt?: (x: number, z: number) => boolean;
  }
}

type V3 = [number, number, number];

const HALF = 12; // ground half extent
const GROW_MS = 8000;
const MAX = 200;
const LEAVES = 4;
const PETALS = 6;

const CAM_POS: V3 = [0, 20, 24];
const CAM_TARGET: V3 = [0, 0, 0];
const CAM_FOV = 45;

const white = material.pbr({ color: "#ffffff", roughness: 0.8 });

const parked: AuraTransformSpec = { position: [0, -50, 0], scale: [0.0001, 0.0001, 0.0001] };
const parkedList = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => parked);
const parkedColors = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");

const sc = scene({ background: "#cfe3f2" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 1, far: 200 }))
  .add(sky.gradient({ zenith: "#8fb9e3", horizon: "#e6f0f7" }))
  .add(lights.hemisphere({ skyColor: "#dfeeff", groundColor: "#6b6a48", intensity: 1.0 }))
  .add(lights.directional({ position: [14, 24, 10], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(primitives.plane({ name: "ground", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#6a8a3c", roughness: 1 }) }))
  .add(instances.cylinder({ name: "stems", instances: parkedList(MAX), instanceColors: parkedColors(MAX), material: white, params: { radialSegments: 6 } }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({ name: "leaves", instances: parkedList(MAX * LEAVES), instanceColors: parkedColors(MAX * LEAVES), material: white }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({ name: "petals", instances: parkedList(MAX * PETALS), instanceColors: parkedColors(MAX * PETALS), material: white }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({ name: "centers", instances: parkedList(MAX), instanceColors: parkedColors(MAX), material: white }).runtime({ id: "centers", mutable: true }));

interface Plant {
  x: number;
  z: number;
  born: number;
  growth: number;
  size: number;
  rot: number;
  hue: number;
  light: number;
  centerHue: number;
}

const plants: Plant[] = [];
let dirty = true;

let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX) plants.shift();
  const hues = [350, 330, 290, 45, 25, 5, 210, 270];
  plants.push({
    x,
    z,
    born: performance.now(),
    growth: 0,
    size: 0.7 + rand() * 0.7,
    rot: rand() * Math.PI * 2,
    hue: (hues[Math.floor(rand() * hues.length)] ?? 340) + rand() * 16 - 8,
    light: 52 + rand() * 14,
    centerHue: 40 + rand() * 15
  });
  dirty = true;
  updateLabel();
  return true;
}

// ---- Overlay
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:absolute;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;background:rgba(20,30,20,0.6);border-radius:6px;color:#fff;font:13px system-ui,sans-serif;z-index:10;";
const label = document.createElement("span");
const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:inherit;padding:2px 10px;cursor:pointer;";
clearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  plants.length = 0;
  dirty = true;
  updateLabel();
  clearBtn.blur();
});
overlay.append(label, clearBtn);
document.body.appendChild(overlay);
function updateLabel(): void {
  label.textContent = `Plants: ${plants.length}`;
}
updateLabel();

// ---- Picking: ray from camera through pixel, intersect y = 0
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const upv = cross(right, fwd);
const tanH = Math.tan((CAM_FOV * Math.PI) / 360);

const canvas = document.getElementById("app") as HTMLCanvasElement;
canvas.addEventListener("click", (ev) => {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((ev.clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const d: V3 = [
    fwd[0] + right[0] * nx * tanH * aspect + upv[0] * ny * tanH,
    fwd[1] + right[1] * nx * tanH * aspect + upv[1] * ny * tanH,
    fwd[2] + right[2] * nx * tanH * aspect + upv[2] * ny * tanH
  ];
  if (d[1] >= -1e-6) return; // ray points at the sky
  const t = -CAM_POS[1] / d[1];
  plantAt(CAM_POS[0] + d[0] * t, CAM_POS[2] + d[2] * t);
});

// ---- State exposure
let ready = false;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: () => ({
    plantCount: plants.length,
    plants: plants.map((p) => ({ x: p.x, z: p.z, growth: p.growth })),
    ready
  })
});
Object.defineProperty(window, "__plantAt", { configurable: false, enumerable: true, writable: false, value: plantAt });

// ---- Rendering of plants
const app = createAuraApp("#app", { scene: sc });

function rebuild(): void {
  const stems: AuraTransformSpec[] = [];
  const stemC: string[] = [];
  const leaves: AuraTransformSpec[] = [];
  const leafC: string[] = [];
  const petals: AuraTransformSpec[] = [];
  const petalC: string[] = [];
  const centers: AuraTransformSpec[] = [];
  const centerC: string[] = [];

  for (const p of plants) {
    const e = smooth(p.growth);
    const H = p.size * (0.14 + 1.5 * e);
    const sw = 0.05 + 0.06 * e;
    stems.push({ position: [p.x, H / 2, p.z], scale: [sw, H, sw] });
    stemC.push(`hsl(${lerp(90, 105, e)}, ${lerp(60, 50, e)}%, ${lerp(62, 30, e)}%)`);

    const leafLen = p.size * (0.16 + 0.5 * e);
    const leafCol = `hsl(${lerp(85, 120, e)}, ${lerp(65, 50, e)}%, ${lerp(58, 33, e)}%)`;
    for (let i = 0; i < LEAVES; i += 1) {
      const a = p.rot + i * 2.4;
      // lower leaves appear first; upper leaves scale in later
      const vis = smooth((p.growth - i * 0.08) / 0.5) * (i < 2 ? 1 : 1);
      const len = leafLen * (i < 2 ? 1 : vis);
      const y = H * (0.18 + 0.2 * i) + 0.02;
      leaves.push({
        position: [p.x + Math.cos(a) * len * 0.5, y, p.z + Math.sin(a) * len * 0.5],
        rotation: [0, -a, 0],
        scale: [Math.max(len, 0.0001), 0.035 * p.size + 0.01 * e, Math.max(len * 0.5, 0.0001)]
      });
      leafC.push(leafCol);
    }

    const f = smooth((p.growth - 0.5) / 0.5);
    const fs = Math.max(f * p.size, 0.0001);
    const petalCol = `hsl(${p.hue}, 80%, ${p.light}%)`;
    for (let i = 0; i < PETALS; i += 1) {
      const a = p.rot + (i / PETALS) * Math.PI * 2;
      const rr = 0.2 * fs;
      petals.push({
        position: [p.x + Math.cos(a) * rr, H + 0.03, p.z + Math.sin(a) * rr],
        rotation: [0, -a, 0],
        scale: [0.3 * fs, 0.06 * fs + 0.0001, 0.17 * fs]
      });
      petalC.push(petalCol);
    }
    centers.push({ position: [p.x, H + 0.06 * fs + 0.03, p.z], scale: [0.2 * fs, 0.14 * fs, 0.2 * fs] });
    centerC.push(`hsl(${p.centerHue}, 90%, 50%)`);
  }

  const pad = (arr: AuraTransformSpec[], cols: string[], cap: number): void => {
    while (arr.length < cap) {
      arr.push(parked);
      cols.push("#ffffff");
    }
  };
  pad(stems, stemC, MAX);
  pad(leaves, leafC, MAX * LEAVES);
  pad(petals, petalC, MAX * PETALS);
  pad(centers, centerC, MAX);
  app.nodes.require("stems").setInstances(stems, stemC);
  app.nodes.require("leaves").setInstances(leaves, leafC);
  app.nodes.require("petals").setInstances(petals, petalC);
  app.nodes.require("centers").setInstances(centers, centerC);
}

app.onFrame(() => {
  const now = performance.now();
  for (const p of plants) {
    if (p.growth < 1) {
      p.growth = clamp01((now - p.born) / GROW_MS);
      dirty = true;
    }
  }
  if (dirty) {
    rebuild();
    dirty = false;
  }
});

await app.ready();
ready = true;
window.__EVAL_READY__ = true;

import { camera, createAuraApp, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { readonly plantCount: number; readonly plants: { x: number; z: number; growth: number }[]; readonly ready: boolean };
    __plantAt?: (x: number, z: number) => boolean;
  }
}

type V3 = [number, number, number];

const HALF = 9; // ground plot spans [-HALF, HALF] on x and z
const CAP = 300;
const GROW_MS = 8000;
const PETALS = 5;
const CAM_POS: V3 = [0, 14, 16];
const CAM_TARGET: V3 = [0, 0, 0];
const FOV_DEG = 50;
const CANVAS_W = 640;
const CANVAS_H = 360;

const GROUND_COLOR = "#6f8f45";
const white = material.pbr({ color: "#ffffff", roughness: 0.8 });

let sc = scene({ background: "#bfdcf0" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: FOV_DEG, near: 0.5, far: 120 }))
  .add(lights.hemisphere({ skyColor: "#d8ebfa", groundColor: "#6b5a3a", intensity: 1.0 }))
  .add(lights.directional({ position: [8, 16, 6], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(primitives.plane({ name: "ground", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: GROUND_COLOR, roughness: 1 }) }));

const HIDDEN: AuraTransformSpec = { position: [0, -10, 0], scale: [0.001, 0.001, 0.001] };
const makeArr = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => HIDDEN);
const makeCols = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");

const stemT = makeArr(CAP), stemC = makeCols(CAP);
const leafT = makeArr(CAP * 2), leafC = makeCols(CAP * 2);
const petalT = makeArr(CAP * PETALS), petalC = makeCols(CAP * PETALS);
const coreT = makeArr(CAP), coreC = makeCols(CAP);

sc = sc
  .add(instances.cylinder({ name: "stems", transforms: stemT, colors: stemC, material: white, params: { radialSegments: 8 } }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({ name: "leaves", transforms: leafT, colors: leafC, material: white }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({ name: "petals", transforms: petalT, colors: petalC, material: white }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({ name: "cores", transforms: coreT, colors: coreC, material: white }).runtime({ id: "cores", mutable: true }));

interface Plant {
  x: number;
  z: number;
  t0: number;
  growth: number;
  rot: number;
  size: number;
  flower: number;
  hue: number;
  light: number;
  done: boolean; // fully written at growth 1
}

const plants: Plant[] = [];
let dirty = true;

const HUES = [0, 12, 30, 48, 280, 305, 330, 215];
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function writePlant(i: number, p: Plant): void {
  const g = smooth(0, 1, p.growth);
  const fg = smooth(0.55, 1, p.growth);
  const H = (0.12 + g * 1.15) * p.size;
  const sr = (0.03 + 0.035 * g) * p.size;
  stemT[i] = { position: [p.x, H / 2, p.z], scale: [sr * 2, H, sr * 2] };
  stemC[i] = `hsl(${lerp(95, 110, g)}, 60%, ${lerp(62, 30, g)}%)`;

  const lg = 0.1 + 0.9 * g;
  const off = (0.05 + 0.3 * g) * p.size;
  const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
  const leafCol = `hsl(${lerp(90, 120, g)}, 62%, ${lerp(58, 32, g)}%)`;
  for (let k = 0; k < 2; k += 1) {
    const s = k === 0 ? 1 : -1;
    const idx = i * 2 + k;
    leafT[idx] = {
      position: [p.x + s * off * cs, H * 0.4 + 0.02, p.z - s * off * sn],
      rotation: [0, p.rot, s * 0.35],
      scale: [0.55 * lg * p.size, 0.06 * p.size, 0.24 * lg * p.size]
    };
    leafC[idx] = leafCol;
  }

  const fs = 0.001 + fg * p.flower * p.size;
  const petalCol = `hsl(${p.hue}, 80%, ${p.light}%)`;
  const pr = 0.2 * fs;
  for (let k = 0; k < PETALS; k += 1) {
    const th = p.rot + (k / PETALS) * Math.PI * 2;
    const idx = i * PETALS + k;
    petalT[idx] = {
      position: [p.x + Math.cos(th) * pr, H + 0.03 * p.size, p.z - Math.sin(th) * pr],
      rotation: [0, th, 0],
      scale: [0.34 * fs, 0.07 * fs, 0.2 * fs]
    };
    petalC[idx] = petalCol;
  }
  coreT[i] = { position: [p.x, H + 0.06 * p.size, p.z], scale: [0.2 * fs, 0.12 * fs, 0.2 * fs] };
  coreC[i] = "#f2c230";
}

function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= CAP) return false;
  const p: Plant = {
    x, z,
    t0: performance.now(),
    growth: 0,
    rot: Math.random() * Math.PI * 2,
    size: 0.8 + Math.random() * 0.5,
    flower: 0.8 + Math.random() * 0.9,
    hue: HUES[Math.floor(Math.random() * HUES.length)]!,
    light: 50 + Math.floor(Math.random() * 15),
    done: false
  };
  writePlant(plants.length, p);
  plants.push(p);
  dirty = true;
  updateLabel();
  return true;
}

function clearPlants(): void {
  plants.length = 0;
  for (let i = 0; i < CAP; i += 1) { stemT[i] = HIDDEN; coreT[i] = HIDDEN; stemC[i] = "#ffffff"; coreC[i] = "#ffffff"; }
  for (let i = 0; i < CAP * 2; i += 1) { leafT[i] = HIDDEN; leafC[i] = "#ffffff"; }
  for (let i = 0; i < CAP * PETALS; i += 1) { petalT[i] = HIDDEN; petalC[i] = "#ffffff"; }
  dirty = true;
  updateLabel();
}

// ---- DOM overlay ----
const canvas = document.getElementById("app") as HTMLCanvasElement;
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:8px;top:8px;display:flex;gap:8px;align-items:center;padding:4px 8px;background:rgba(0,0,0,0.5);color:#fff;border-radius:4px;font:13px system-ui,sans-serif;z-index:10;";
const label = document.createElement("span");
const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "font:12px system-ui,sans-serif;cursor:pointer;";
clearBtn.addEventListener("click", (e) => { e.stopPropagation(); clearPlants(); });
overlay.append(label, clearBtn);
document.body.append(overlay);
function updateLabel(): void { label.textContent = `Plants: ${plants.length}`; }
updateLabel();

// ---- click -> ground ----
function screenToGround(clientX: number, clientY: number): [number, number] | null {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((clientY - r.top) / r.height) * 2;
  const th = Math.tan((FOV_DEG * Math.PI) / 360);
  const aspect = CANVAS_W / CANVAS_H;
  const fx = CAM_TARGET[0] - CAM_POS[0], fy = CAM_TARGET[1] - CAM_POS[1], fz = CAM_TARGET[2] - CAM_POS[2];
  const fl = Math.hypot(fx, fy, fz);
  const f: V3 = [fx / fl, fy / fl, fz / fl];
  // right = normalize(f x up), up = (0,1,0)
  let rx = f[1] * 0 - f[2] * 1, ry = f[2] * 0 - f[0] * 0, rz = f[0] * 1 - f[1] * 0;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl; ry /= rl; rz /= rl;
  // true up = right x f
  const ux = ry * f[2] - rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1] - ry * f[0];
  const dx = f[0] + rx * nx * th * aspect + ux * ny * th;
  const dy = f[1] + ry * nx * th * aspect + uy * ny * th;
  const dz = f[2] + rz * nx * th * aspect + uz * ny * th;
  if (dy >= -1e-6) return null;
  const t = -CAM_POS[1] / dy;
  const x = CAM_POS[0] + dx * t, z = CAM_POS[2] + dz * t;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  return [x, z];
}

canvas.addEventListener("click", (e) => {
  const hit = screenToGround(e.clientX, e.clientY);
  if (hit) plantAt(hit[0], hit[1]);
});

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
window.__plantAt = plantAt;

const app = createAuraApp("#app", { scene: sc });
app.onFrame(() => {
  const now = performance.now();
  for (let i = 0; i < plants.length; i += 1) {
    const p = plants[i]!;
    if (p.done) continue;
    p.growth = Math.min(1, (now - p.t0) / GROW_MS);
    writePlant(i, p);
    if (p.growth >= 1) p.done = true;
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    app.nodes.require("stems").setInstances?.(stemT, stemC);
    app.nodes.require("leaves").setInstances?.(leafT, leafC);
    app.nodes.require("petals").setInstances?.(petalT, petalC);
    app.nodes.require("cores").setInstances?.(coreT, coreC);
  }
});
await app.ready();
ready = true;
window.__EVAL_READY__ = true;

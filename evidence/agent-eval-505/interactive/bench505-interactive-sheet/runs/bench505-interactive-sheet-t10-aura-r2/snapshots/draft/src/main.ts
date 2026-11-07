import { camera, createAuraApp, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { readonly plantCount: number; readonly plants: ReadonlyArray<{ x: number; z: number; growth: number }>; readonly ready: boolean };
    __plantAt?: (x: number, z: number) => boolean;
  }
}

type V3 = [number, number, number];

const GROW_MS = 8000;
const HALF = 11; // ground half-extent
const MAX_PLANTS = 300;
const LEAVES = 3;
const PETALS = 6;

const CAM_POS: V3 = [0, 14, 17];
const CAM_TARGET: V3 = [0, 0, 1];
const FOV = 50;

interface Plant {
  x: number;
  z: number;
  t0: number;
  height: number;
  headSize: number;
  yaw: number;
  petalColor: string;
}

const plants: Plant[] = [];
let ready = false;
let needRebuild = true;

let seed = 987654321;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const growthOf = (p: Plant, now: number): number => Math.min(1, Math.max(0, (now - p.t0) / GROW_MS));

const white = material.pbr({ color: "#ffffff", roughness: 0.8 });
const HIDDEN: AuraTransformSpec = { position: [0, -10, 0], scale: [0.0001, 0.0001, 0.0001] };
const hiddenList = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => HIDDEN);
const colorList = (n: number, c: string): string[] => Array.from({ length: n }, () => c);

const sc = scene({ background: "#bcd8ee" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: FOV, near: 0.5, far: 200 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#dcebf7", groundColor: "#6b5a3c", intensity: 0.9 }))
  .add(lights.directional({ position: [9, 16, 7], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(primitives.plane({ name: "ground", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#6a8a45", roughness: 1 }) }))
  .add(instances.cylinder({ name: "stems", transforms: hiddenList(MAX_PLANTS), colors: colorList(MAX_PLANTS, "#7cc04f"), material: white, params: { radialSegments: 8 } }).runtime({ id: "stems", mutable: true }))
  .add(instances.sphere({ name: "leaves", transforms: hiddenList(MAX_PLANTS * LEAVES), colors: colorList(MAX_PLANTS * LEAVES, "#7cc04f"), material: white }).runtime({ id: "leaves", mutable: true }))
  .add(instances.sphere({ name: "petals", transforms: hiddenList(MAX_PLANTS * PETALS), colors: colorList(MAX_PLANTS * PETALS, "#ff66aa"), material: white }).runtime({ id: "petals", mutable: true }))
  .add(instances.sphere({ name: "centers", transforms: hiddenList(MAX_PLANTS), colors: colorList(MAX_PLANTS, "#ffd23f"), material: white }).runtime({ id: "centers", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

const canvas = document.getElementById("app") as HTMLCanvasElement;

// ---- planting ----
function plantAt(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return false;
  if (plants.length >= MAX_PLANTS) return false;
  const hue = Math.floor(rand() * 360);
  plants.push({
    x,
    z,
    t0: performance.now(),
    height: 0.8 + rand() * 0.6,
    headSize: 0.35 + rand() * 0.3,
    yaw: rand() * Math.PI * 2,
    petalColor: `hsl(${hue}, ${70 + Math.floor(rand() * 25)}%, ${55 + Math.floor(rand() * 15)}%)`
  });
  needRebuild = true;
  updateLabel();
  return true;
}

// Map a screen click to the ground plane (y = 0) with the known static camera.
function groundPoint(clientX: number, clientY: number): [number, number] | null {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const th = Math.tan((FOV * Math.PI) / 360);
  let fx = CAM_TARGET[0] - CAM_POS[0], fy = CAM_TARGET[1] - CAM_POS[1], fz = CAM_TARGET[2] - CAM_POS[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // right = f x up(0,1,0)
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl; rz /= rl;
  // up = right x f
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const dx = fx + rx * nx * th * aspect + ux * ny * th;
  const dy = fy + uy * ny * th;
  const dz = fz + rz * nx * th * aspect + uz * ny * th;
  if (dy >= -1e-6) return null;
  const t = -CAM_POS[1] / dy;
  const x = CAM_POS[0] + dx * t, z = CAM_POS[2] + dz * t;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  return [x, z];
}

canvas.addEventListener("click", (e) => {
  const p = groundPoint(e.clientX, e.clientY);
  if (p) plantAt(p[0], p[1]);
});

// ---- DOM overlay ----
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;top:8px;left:8px;display:flex;gap:8px;align-items:center;padding:6px 10px;background:rgba(0,0,0,0.5);border-radius:6px;color:#fff;font:13px system-ui,sans-serif;user-select:none";
const label = document.createElement("span");
const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
clearBtn.style.cssText = "cursor:pointer;padding:2px 8px;font:inherit";
clearBtn.addEventListener("click", () => {
  plants.length = 0;
  needRebuild = true;
  updateLabel();
});
overlay.append(label, clearBtn);
document.body.appendChild(overlay);
function updateLabel(): void {
  label.textContent = `Plants: ${plants.length}`;
}
updateLabel();

// ---- state exposure ----
const state = {};
Object.defineProperties(state, {
  plantCount: { get: () => plants.length, enumerable: true },
  plants: {
    get: () => {
      const now = performance.now();
      return plants.map((p) => ({ x: p.x, z: p.z, growth: growthOf(p, now) }));
    },
    enumerable: true
  },
  ready: { get: () => ready, enumerable: true }
});
Object.defineProperty(window, "__TASK_STATE__", { value: Object.freeze(state), writable: false, configurable: false });
Object.defineProperty(window, "__plantAt", { value: (x: number, z: number) => plantAt(x, z), writable: false, configurable: false });

// ---- rebuild instance buffers ----
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function rebuild(now: number): boolean {
  const stems: AuraTransformSpec[] = hiddenList(MAX_PLANTS);
  const stemC: string[] = colorList(MAX_PLANTS, "#7cc04f");
  const leaves: AuraTransformSpec[] = hiddenList(MAX_PLANTS * LEAVES);
  const leafC: string[] = colorList(MAX_PLANTS * LEAVES, "#7cc04f");
  const petals: AuraTransformSpec[] = hiddenList(MAX_PLANTS * PETALS);
  const petalC: string[] = colorList(MAX_PLANTS * PETALS, "#ff66aa");
  const centers: AuraTransformSpec[] = hiddenList(MAX_PLANTS);
  const centerC: string[] = colorList(MAX_PLANTS, "#ffd23f");
  let growing = false;

  plants.forEach((p, i) => {
    const g = growthOf(p, now);
    if (g < 1) growing = true;
    const s = smooth(g);
    const H = lerp(0.14, p.height, s);
    const stemW = lerp(0.05, 0.075, s);
    stems[i] = { position: [p.x, H / 2, p.z], scale: [stemW, H, stemW] };
    const hl = Math.round(lerp(75, 115, s));
    const lum = Math.round(lerp(62, 30, s));
    const stemColor = `hsl(${hl}, 55%, ${lum + 5}%)`;
    stemC[i] = stemColor;

    const L = lerp(0.1, 0.5, s);
    const leafColor = `hsl(${hl}, ${Math.round(lerp(60, 55, s))}%, ${lum}%)`;
    for (let k = 0; k < LEAVES; k += 1) {
      const a = p.yaw + (k * Math.PI * 2) / LEAVES;
      const hy = H * (0.28 + 0.18 * k);
      const rr = L * 0.5;
      leaves[i * LEAVES + k] = {
        position: [p.x + Math.cos(a) * rr, hy, p.z + Math.sin(a) * rr],
        rotation: [0, -a, 0.35],
        scale: [L, L * 0.22, L * 0.5]
      };
      leafC[i * LEAVES + k] = leafColor;
    }

    const hs = smooth(Math.min(1, Math.max(0, (g - 0.55) / 0.45)));
    const headY = H + 0.03;
    if (hs > 0) {
      const D = p.headSize * hs;
      for (let k = 0; k < PETALS; k += 1) {
        const a = p.yaw * 0.5 + (k * Math.PI * 2) / PETALS;
        const rr = D * 0.55;
        petals[i * PETALS + k] = {
          position: [p.x + Math.cos(a) * rr, headY, p.z + Math.sin(a) * rr],
          rotation: [0, -a, 0],
          scale: [D * 0.65, D * 0.18, D * 0.45]
        };
        petalC[i * PETALS + k] = p.petalColor;
      }
      const c = D * 0.38;
      centers[i] = { position: [p.x, headY + D * 0.06, p.z], scale: [c, c, c] };
      centerC[i] = "#ffd23f";
    } else {
      // bud / sprout tip
      const c = lerp(0.07, 0.12, s);
      centers[i] = { position: [p.x, H + c * 0.3, p.z], scale: [c, c, c] };
      centerC[i] = stemColor;
    }
  });

  app.nodes.require("stems").setInstances(stems, stemC);
  app.nodes.require("leaves").setInstances(leaves, leafC);
  app.nodes.require("petals").setInstances(petals, petalC);
  app.nodes.require("centers").setInstances(centers, centerC);
  return growing;
}

app.onFrame(() => {
  if (needRebuild) {
    needRebuild = rebuild(performance.now());
  }
});

await app.ready();
ready = true;
window.__EVAL_READY__ = true;

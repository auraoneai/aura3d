/**
 * Procedural scenery for the course as instance placements (houses, roofs, lanterns, gates, bridges, trees, rocks,
 * paving, hills). Pure and deterministic: every layer is one shape drawn with per-instance matrix and colour, so the
 * world adds one `instances.mesh` per layer. Nothing here is the original's geometry; the layout (village, rooftops,
 * crossing, forest, valley) follows the course's biome table.
 */
import { BIOME_TONES } from "./palette";
import { COURSE_LENGTH, GAPS, biomeAt, gapAt, groundFrame, laneOffset, pathWidth, smooth } from "./course";
import { surfaceY } from "./meshes";
import { seededRandom } from "./sim";
import { trs } from "./shapes";
import { MESHY_MANIFEST } from "./assets/meshy/manifest";

/** A generated-model instance (position of the model's base centre, yaw, per-axis scale applied to the model's own units). */
export interface ModelPlacement { readonly position: [number, number, number]; readonly yaw: number; readonly scale: [number, number, number]; readonly tint?: string }
export type ModelSink = Record<string, ModelPlacement[]>;
/** Extra yaw that turns each model's authored front toward +z (calibrated from render frames). */
export const MODEL_FRONT_YAW: Readonly<Record<string, number>> = { houseA: 0, houseB: 0, houseC: 0, houseD: 0, teahouse: 0, marketStall: 0, tower: 0, gate: 0, pine: 0, lantern: 0, oak: 0, boulder: 0, cliffA: 0, cliffB: 0, bush: 0, ridge: 0, fenceRail: 0 };
const HOUSES = ["houseA", "houseB", "houseC", "houseD"] as const;

export type ShapeId = "box" | "gable" | "hip" | "cylinder" | "cone" | "sphere" | "rock" | "cliff";
export interface Placement { readonly matrix: number[]; readonly color: string }
export type SurfaceKey = "plaster" | "tiles" | "bark" | "leaf";
export interface LayerSpec { readonly id: string; readonly shape: ShapeId; readonly roughness: number; readonly metalness: number; readonly emissive?: string; readonly castShadow: boolean; readonly map?: SurfaceKey; readonly repeat?: readonly [number, number] }
export interface SceneryLayer extends LayerSpec { readonly placements: Placement[] }

export const LAYERS: readonly LayerSpec[] = [
  { id: "walls", shape: "box", roughness: 0.92, metalness: 0, castShadow: true, map: "plaster", repeat: [1, 1] },
  { id: "trim", shape: "box", roughness: 0.8, metalness: 0, castShadow: false },
  { id: "slabs", shape: "box", roughness: 0.9, metalness: 0, castShadow: false },
  { id: "roofs", shape: "gable", roughness: 0.62, metalness: 0, castShadow: true, map: "tiles", repeat: [1.5, 0.9] },
  { id: "hips", shape: "hip", roughness: 0.6, metalness: 0, castShadow: true, map: "tiles", repeat: [1.5, 0.9] },
  { id: "towers", shape: "cylinder", roughness: 0.92, metalness: 0, castShadow: true, map: "plaster", repeat: [2, 1] },
  { id: "capcones", shape: "cone", roughness: 0.6, metalness: 0, castShadow: true, map: "tiles", repeat: [2, 1] },
  { id: "posts", shape: "cylinder", roughness: 0.85, metalness: 0, castShadow: false },
  { id: "trunks", shape: "cylinder", roughness: 0.95, metalness: 0, castShadow: true, map: "bark", repeat: [2, 2] },
  { id: "cones", shape: "cone", roughness: 0.9, metalness: 0, castShadow: true, map: "leaf", repeat: [4, 2] },
  { id: "tufts", shape: "cone", roughness: 0.92, metalness: 0, castShadow: false },
  { id: "crowns", shape: "sphere", roughness: 0.88, metalness: 0, castShadow: true, map: "leaf", repeat: [3, 2] },
  { id: "rocks", shape: "rock", roughness: 0.95, metalness: 0, castShadow: true },
  { id: "cliffs", shape: "cliff", roughness: 0.97, metalness: 0, castShadow: false },
  { id: "hills", shape: "sphere", roughness: 1, metalness: 0, castShadow: false },
  { id: "lanterns", shape: "sphere", roughness: 0.5, metalness: 0, emissive: "#ff9a3c", castShadow: false }
];

const hex = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
/** Scale an sRGB hex colour's brightness by `k` (kept in sRGB so the variation reads evenly). */
export function shade(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16);
  return `#${hex(((n >> 16) & 255) * k)}${hex(((n >> 8) & 255) * k)}${hex((n & 255) * k)}`;
}

const WALLS = ["#d9c9a8", "#cbb890", "#bda684", "#e4d6b8", "#c8a57b", "#afa48a"] as const;
const ROOFS = ["#c86b47", "#a74938", "#527c70", "#564638", "#8b4f3d"] as const;
const SHUTTERS = ["#527c70", "#a74938", "#3a5351"] as const;
const LEAVES = ["#6f9a4e", "#5f8a45", "#78a24f", "#4c6339"] as const;
const PINES = ["#2f5a30", "#3b6b36", "#24492a", "#2d5238"] as const;
const BLOSSOM = ["#f0a9bf", "#e895ae", "#f4c3d0"] as const;
const STONE = ["#9a9484", "#8c8a7c", "#aaa893", "#7d9188"] as const;
const WOOD = ["#8a6a45", "#7a5c3b", "#9a7a50"] as const;
const CLOTH = ["#c0392b", "#d4a24c", "#3f7f9a", "#7a5c9a"] as const;

/**
 * The chase camera's eye for runner distance `s` and lateral position `x` (the original's offsets; `world.ts` uses the
 * same function). `y` is the runner's height above the path (0 when grounded).
 */
export function cameraEye(s: number, x: number, y = 0): { x: number; y: number; z: number } {
  const widen = smooth(2220, 2410, s);
  const f = groundFrame(s - 6.4 - widen * 3.4, x * 0.45, 3.35 + widen * 0.95 + y * 0.22);
  return { x: f.x, y: f.y, z: f.z };
}

/** Minimum horizontal gap kept between the camera path and every model's footprint (E-05: no prop sweeps past the lens). */
export const CAMERA_CLEARANCE = 3;
/** Props the camera is meant to pass through or that sit far off the path with very loose bounds. */
const CLEARANCE_EXEMPT = new Set(["gate", "ridge"]);

/** Camera eye samples every metre for the outer lanes and the centre lane, bucketed in a 10 m grid. */
function cameraEyeGrid(): Map<string, { x: number; y: number; z: number }[]> {
  const grid = new Map<string, { x: number; y: number; z: number }[]>();
  for (let s = 0; s <= COURSE_LENGTH; s += 1) for (const lane of [-1, 0, 1]) {
    const e = cameraEye(s, lane * laneOffset(s));
    const key = `${Math.floor(e.x / 10)},${Math.floor(e.z / 10)}`;
    let cell = grid.get(key);
    if (!cell) grid.set(key, cell = []);
    cell.push(e);
  }
  return grid;
}

/** Horizontal distance from the nearest camera eye (within the model's height band) to a model's footprint, and that eye. */
export function cameraGap(p: ModelPlacement, size: readonly [number, number, number], grid = cameraEyeGrid()): { gap: number; eye: { x: number; z: number } | null } {
  const hx = (size[0] * p.scale[0]) / 2, hz = (size[2] * p.scale[2]) / 2, h = size[1] * p.scale[1];
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  const reach = Math.hypot(hx, hz) + CAMERA_CLEARANCE + 1;
  let gap = Infinity, eye: { x: number; z: number } | null = null;
  for (let gx = Math.floor((p.position[0] - reach) / 10); gx <= Math.floor((p.position[0] + reach) / 10); gx++) {
    for (let gz = Math.floor((p.position[2] - reach) / 10); gz <= Math.floor((p.position[2] + reach) / 10); gz++) {
      for (const e of grid.get(`${gx},${gz}`) ?? []) {
        if (e.y < p.position[1] - 0.5 || e.y > p.position[1] + h + 0.5) continue;
        const dx = e.x - p.position[0], dz = e.z - p.position[2];
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        const d = Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz));
        if (d < gap) { gap = d; eye = e; }
      }
    }
  }
  return { gap, eye };
}

/** Push every model placement that comes closer than `CAMERA_CLEARANCE` to the camera path straight away from it. */
function clearCameraPath(models: ModelSink): void {
  const grid = cameraEyeGrid();
  for (const [id, list] of Object.entries(models)) {
    if (CLEARANCE_EXEMPT.has(id)) continue;
    const size = MESHY_MANIFEST[id]!.size;
    for (let i = 0; i < list.length; i++) {
      let p = list[i]!;
      for (let pass = 0; pass < 10; pass++) {
        const { gap, eye } = cameraGap(p, size, grid);
        if (gap >= CAMERA_CLEARANCE || !eye) break;
        let ux = p.position[0] - eye.x, uz = p.position[2] - eye.z;
        const len = Math.hypot(ux, uz) || 1;
        ux /= len; uz /= len;
        const push = CAMERA_CLEARANCE - gap + 0.25;
        p = { ...p, position: [p.position[0] + ux * push, p.position[1], p.position[2] + uz * push] };
      }
      list[i] = p;
    }
  }
}

export function buildScenery(models?: ModelSink): SceneryLayer[] {
  const layers = new Map<string, SceneryLayer>(LAYERS.map((l) => [l.id, { ...l, placements: [] }]));
  const put = (id: string, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, color: string): void => {
    layers.get(id)!.placements.push({ matrix: trs(x, y, z, yaw, sx, sy, sz), color });
  };
  const at = (d: number, lat: number) => { const f = groundFrame(d, lat); return { x: f.x, y: surfaceY(d, lat), z: f.z, yaw: Math.atan2(f.dx, f.dz) }; };
  const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;
  /** Add one generated-model instance whose base sits at world (x, y, z); `height`/`width`/`depth` are the wanted world sizes. */
  const mput = (id: string, x: number, y: number, z: number, yaw: number, width: number, height: number, depth: number, tint?: string): void => {
    const m = MESHY_MANIFEST[id]!;
    let sx = width / m.size[0], sy = height / m.size[1], sz = depth / m.size[2];
    /* Meshy models keep their own proportions: a request that would stretch one axis more than ~1.6x against another (a 6 x 10 m footprint on a nearly square house) smears the texture and tears the facets, so the per-axis scale stays within +-28% of the uniform scale. */
    const g = Math.cbrt(sx * sy * sz), lo = g * 0.78, hi = g * 1.28;
    sx = Math.min(hi, Math.max(lo, sx)); sy = Math.min(hi, Math.max(lo, sy)); sz = Math.min(hi, Math.max(lo, sz));
    (models![id] ??= []).push({ position: [x, y, z], yaw: yaw + (MODEL_FRONT_YAW[id] ?? 0), scale: [sx, sy, sz], ...(tint ? { tint } : {}) });
  };
  /** Uniform-by-height placement (`wk` widens or narrows the plan) for props that keep their authored proportions. */
  const mputH = (id: string, x: number, y: number, z: number, yaw: number, height: number, wk = 1, tint?: string): void => {
    const k = height / MESHY_MANIFEST[id]!.size[1];
    (models![id] ??= []).push({ position: [x, y, z], yaw: yaw + (MODEL_FRONT_YAW[id] ?? 0), scale: [k * wk, k, k * wk], ...(tint ? { tint } : {}) });
  };
  /** Free per-axis placement for landforms that may be stretched (distant ridges). */
  const mputFree = (id: string, x: number, y: number, z: number, yaw: number, width: number, height: number, depth: number, tint?: string): void => {
    const m = MESHY_MANIFEST[id]!;
    (models![id] ??= []).push({ position: [x, y, z], yaw, scale: [width / m.size[0], height / m.size[1], depth / m.size[2]], ...(tint ? { tint } : {}) });
  };
  /** World position of a point given in a box's local frame (+x across the route away from the right-hand side, +z forward). */
  const local = (c: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => {
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    return [c.x + lx * co + lz * si, c.z - lx * si + lz * co];
  };

  interface HouseOptions { bw: number; bd: number; bh: number; gap: number; baseY?: number }
  const house = (d: number, side: -1 | 1, o: HouseOptions, r: () => number): void => {
    const w = pathWidth(d);
    const lat = side * (w / 2 + o.gap + o.bw / 2);
    const c = at(d, lat);
    const y0 = o.baseY ?? Math.min(surfaceY(d, lat - o.bw / 2), surfaceY(d, lat + o.bw / 2), c.y) - 0.15;
    const face = side;
    if (models) {
      /* the model's width runs along the route, its depth across it; the façade (+z) faces the path; the base sinks 0.3 below the lowest ground */
      mput(HOUSES[Math.floor(r() * HOUSES.length) % HOUSES.length]!, c.x, y0 - 0.2, c.z, c.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), o.bd, o.bh + 2.6, o.bw);
      return;
    }
    put("walls", c.x, y0, c.z, c.yaw, o.bw, o.bh, o.bd, pick(r, WALLS));
    put("walls", c.x, y0 - 1.3, c.z, c.yaw, o.bw + 0.3, 2, o.bd + 0.3, shade(pick(r, STONE), 0.92));
    const floors = Math.max(1, Math.round(o.bh / 3.3));
    const fh = o.bh / floors;
    for (let f = 1; f < floors; f++) put("trim", c.x, y0 + f * fh - 0.14, c.z, c.yaw, o.bw + 0.2, 0.28, o.bd + 0.2, "#564638");
    const doorLz = (r() - 0.5) * o.bd * 0.5;
    const nW = Math.max(1, Math.floor(o.bd / 3));
    const shutter = pick(r, SHUTTERS);
    for (let f = 0; f < floors; f++) for (let k = 0; k < nW; k++) {
      const lz = ((k + 0.5) / nW - 0.5) * o.bd;
      if (f === 0 && Math.abs(lz - doorLz) < 1.5) continue;
      const wy = y0 + f * fh + (f === 0 ? 1.6 : fh * 0.38);
      const [wx, wz] = local(c, face * (o.bw / 2 + 0.03), lz);
      put("trim", wx, wy, wz, c.yaw, 0.14, 1.15, 0.95, "#2f4048");
      put("trim", wx, wy - 0.12, wz, c.yaw, 0.26, 0.1, 1.25, "#d9cfb5");
      for (const sh of [-0.68, 0.68]) { const [sx, sz] = local(c, face * (o.bw / 2 + 0.05), lz + sh); put("trim", sx, wy, sz, c.yaw, 0.1, 1.15, 0.38, shutter); }
    }
    const [dx, dz] = local(c, face * (o.bw / 2 + 0.06), doorLz);
    put("trim", dx, y0 + 0.7, dz, c.yaw, 0.2, 2.3, 1.45, "#3d2e24");
    put("trim", dx, y0 + 0.7, dz, c.yaw, 0.28, 2.1, 1.15, "#6a4630");
    if (r() < 0.5) { const [lx, lz] = local(c, face * (o.bw / 2 + 0.4), doorLz + 1.1); put("lanterns", lx, y0 + 2.5, lz, c.yaw, 0.26, 0.34, 0.26, "#ffb25a"); }
    const turn = r() < 0.3;
    const rh = 1.5 + r() * 1.4 + Math.min(o.bw, o.bd) * 0.1;
    const roof = pick(r, ROOFS);
    const yaw = turn ? c.yaw + Math.PI / 2 : c.yaw;
    const span = turn ? o.bd : o.bw, length = turn ? o.bw : o.bd;
    put("roofs", c.x, y0 + o.bh, c.z, yaw, span + 1.9, rh, length + 1.5, roof);
    put("trim", c.x, y0 + o.bh + rh - 0.12, c.z, yaw, 0.4, 0.3, length + 1.6, shade(roof, 0.62));
    if (r() < 0.55) {
      const [cx, cz] = local(c, (r() < 0.5 ? -1 : 1) * o.bw * 0.25, (r() < 0.5 ? -1 : 1) * o.bd * 0.2);
      put("trim", cx, y0 + o.bh, cz, c.yaw, 0.8, rh + 1.3, 0.8, "#8a7a6a");
      put("trim", cx, y0 + o.bh + rh + 1.3, cz, c.yaw, 1.0, 0.2, 1.0, "#4a4038");
    }
  };

  /** A round building: plastered drum with green eave bands, windows on the street side and a conical tiled roof. */
  const tower = (d: number, side: -1 | 1, o: { r: number; h: number; gap: number; baseY?: number }, r: () => number): void => {
    const w = pathWidth(d);
    const lat = side * (w / 2 + o.gap + o.r);
    const c = at(d, lat);
    const y0 = o.baseY ?? Math.min(surfaceY(d, lat - o.r), surfaceY(d, lat + o.r), c.y) - 0.2;
    if (models) { mput("tower", c.x, y0 - 0.2, c.z, r() * 6, (o.r + 0.3) * 2, o.h + 3.4, (o.r + 0.3) * 2); return; }
    put("towers", c.x, y0 - 1.3, c.z, 0, o.r + 0.2, 2, o.r + 0.2, shade(pick(r, STONE), 0.92));
    put("towers", c.x, y0, c.z, 0, o.r, o.h, o.r, pick(r, WALLS));
    const floors = Math.max(1, Math.round(o.h / 3.3));
    const fh = o.h / floors;
    for (let f = 1; f <= floors; f++) put("towers", c.x, y0 + f * fh - 0.3, c.z, 0, o.r + 0.22, 0.34, o.r + 0.22, "#527c70");
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const dirX = side * co, dirZ = -side * si; // unit vector from the tower toward the path (local +x when on the right)
    const fwdX = si, fwdZ = co;
    for (let f = 0; f < floors; f++) for (const a of [-1.05, -0.52, 0, 0.52, 1.05]) {
      const nx = dirX * Math.cos(a) + fwdX * Math.sin(a), nz = dirZ * Math.cos(a) + fwdZ * Math.sin(a);
      const wy = y0 + f * fh + (f === 0 ? 1.7 : fh * 0.4);
      put("trim", c.x + nx * (o.r + 0.02), wy, c.z + nz * (o.r + 0.02), Math.atan2(-nz, nx), 0.16, 1.2, 0.95, "#2f4048");
      put("trim", c.x + nx * (o.r + 0.12), wy - 0.12, c.z + nz * (o.r + 0.12), Math.atan2(-nz, nx), 0.3, 0.1, 1.3, "#a74938");
    }
    put("capcones", c.x, y0 + o.h, c.z, r() * 6, o.r + 1.2, 2.3 + o.r * 0.55, o.r + 1.2, pick(r, ROOFS));
    if (r() < 0.5) { const [lx, lz] = [c.x + dirX * (o.r + 0.5), c.z + dirZ * (o.r + 0.5)]; put("lanterns", lx, y0 + 2.5, lz, 0, 0.26, 0.34, 0.26, "#ffb25a"); }
  };

  const lanternPost = (d: number, side: -1 | 1): void => {
    const c = at(d, side * (pathWidth(d) / 2 + 0.55));
    if (models) { const k = 3.9 / MESHY_MANIFEST.lantern!.size[1]; mput("lantern", c.x, c.y, c.z, c.yaw, MESHY_MANIFEST.lantern!.size[0] * k, 3.9, MESHY_MANIFEST.lantern!.size[2] * k); return; }
    put("posts", c.x, c.y, c.z, 0, 0.07, 3, 0.07, "#3a3028");
    put("lanterns", c.x, c.y + 3.15, c.z, 0, 0.3, 0.4, 0.3, "#ffb25a");
    put("cones", c.x, c.y + 3.45, c.z, 0, 0.45, 0.32, 0.45, "#2b2420");
  };

  const gate = (d: number, pillar: string, beam: string): void => {
    const w = pathWidth(d) + 3.2;
    const c = at(d, 0);
    if (models) { mput("gate", c.x, c.y - 0.3, c.z, c.yaw, w + 4.6, 13.8, 3.4, pillar === "#9a9484" ? "#a9aca3" : undefined); return; }
    for (const s of [-1, 1]) {
      const [px, pz] = local(c, s * w / 2, 0);
      put("trim", px, c.y - 0.3, pz, c.yaw, 1.3, 13.3, 1.3, pillar);
      put("trim", px, c.y - 0.3, pz, c.yaw, 1.8, 0.7, 1.8, "#2b2420");
    }
    put("trim", c.x, c.y + 11.4, c.z, c.yaw, w + 4.4, 0.9, 1.5, beam);
    put("trim", c.x, c.y + 10.2, c.z, c.yaw, w + 1.2, 0.55, 1.1, beam);
    put("hips", c.x, c.y + 12.3, c.z, c.yaw, w + 5.6, 1.1, 2.4, "#2b2420");
  };

  const tree = (x: number, y: number, z: number, h: number, crown: string, r: () => number): void => {
    if (models) { const m = MESHY_MANIFEST.oak!, k = h / m.size[1], wk = 0.9 + r() * 0.3; mput("oak", x, y - 0.2, z, r() * 6, m.size[0] * k * wk, h, m.size[2] * k * wk); return; }
    put("trunks", x, y - 0.2, z, 0, 0.22 + h * 0.03, h * 0.62, 0.22 + h * 0.03, "#5a4332");
    const cr = h * 0.34;
    put("crowns", x, y + h * 0.66, z, 0, cr, cr * 0.85, cr, crown);
    put("crowns", x + (r() - 0.5) * cr, y + h * 0.58, z + (r() - 0.5) * cr, 0, cr * 0.72, cr * 0.62, cr * 0.72, shade(crown, 0.9));
    put("crowns", x + (r() - 0.5) * cr * 1.2, y + h * 0.82, z + (r() - 0.5) * cr * 1.2, 0, cr * 0.6, cr * 0.55, cr * 0.6, shade(crown, 1.08));
  };

  const pine = (x: number, y: number, z: number, h: number, r: () => number): void => {
    if (models) { const wk = 0.85 + r() * 0.35, m = MESHY_MANIFEST.pine!; mput("pine", x, y - 0.4, z, r() * 6, m.size[0] * (h / m.size[1]) * wk, h, m.size[2] * (h / m.size[1]) * wk); return; }
    const tw = 0.45 + h * 0.04;
    put("trunks", x, y - 0.6, z, 0, tw, h * 0.7, tw, "#4a3a2a");
    const tone = pick(r, PINES);
    for (let t = 0; t < 3; t++) {
      const k = 1 - t * 0.27;
      put("cones", x, y + h * (0.22 + t * 0.2), z, r() * 6, (3.6 + h * 0.1) * k, h * 0.4, (3.6 + h * 0.1) * k, shade(tone, 1 - t * 0.05));
    }
  };

  /* ---- village, backstreets, stairs (0-550) and the descent / riverside (1000-1240, 1390-1510) ---- */
  const town = seededRandom(9871);
  for (const [from, to] of [[8, 548], [1004, 1236], [1394, 1506]] as const) {
    for (let d = from; d < to; d += 15 + Math.floor(town() * 9)) {
      if (gapAt(d)) continue;
      for (const side of [-1, 1] as const) {
        if (town() < 0.12) continue;
        const alley = biomeAt(d) === "alley" || biomeAt(d) === "stairs";
        const bw = 6 + town() * 4, bd = 6 + town() * 4.5, bh = (alley ? 5 : 3.6) + town() * 3.6;
        if (town() < 0.3) tower(d, side, { r: 3.2 + town() * 1.8, h: bh + 1.5, gap: alley ? 1.6 + town() * 1.8 : 5.4 + town() * 3.2 }, town);
        else house(d, side, { bw, bd, bh, gap: alley ? 1.6 + town() * 1.8 : 5.4 + town() * 3.2 }, town);
      }
    }
  }
  for (let d = 14; d < 1236; d += 26) {
    if (gapAt(d) || (d > 560 && d < 1000)) continue;
    lanternPost(d, d % 52 < 26 ? -1 : 1);
  }
  gate(70, "#b2382c", "#2b2420");
  gate(1566, "#b2382c", "#2b2420");
  gate(2290, "#9a9484", "#6f7a76");
  const trees = seededRandom(515);
  for (let d = 24; d < 1230; d += 24 + Math.floor(trees() * 14)) {
    if (d > 540 && d < 1010) continue;
    for (const side of [-1, 1] as const) {
      if (trees() < 0.25) continue;
      const lat = side * (pathWidth(d) / 2 + 2.3 + trees() * 1.4);
      const c = at(d, lat);
      tree(c.x, c.y, c.z, 7.5 + trees() * 4, trees() < 0.3 ? pick(trees, BLOSSOM) : pick(trees, LEAVES), trees);
    }
  }
  const stalls = seededRandom(31);
  for (let d = 44; d < 460; d += 46 + Math.floor(stalls() * 22)) {
    if (d > 150 && d < 190) continue;
    const side = stalls() < 0.5 ? -1 : 1;
    const c = at(d, side * (pathWidth(d) / 2 + 2.6));
    if (models) { mputH("marketStall", c.x, c.y - 0.05, c.z, c.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 3.4, 1.15); continue; }
    put("trim", c.x, c.y, c.z, c.yaw, 3.2, 0.95, 1.5, "#8a5a35");
    for (const [sx, sz] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]] as const) { const [px, pz] = local(c, sx, sz); put("posts", px, c.y, pz, 0, 0.06, 2.4, 0.06, "#3a3028"); }
    put("hips", c.x, c.y + 2.35, c.z, c.yaw, 3.9, 0.9, 2.3, pick(stalls, CLOTH));
    put("walls", c.x, c.y + 0.95, c.z, c.yaw, 0.7, 0.45, 0.7, "#c8a57b");
  }
  if (models) {
    for (const [d, side] of [[172, 1], [1436, 1]] as const) {
      const c = at(d, side * (pathWidth(d) / 2 + 9));
      mputH("teahouse", c.x, c.y - 0.2, c.z, c.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 10.5);
    }
  }
  const fences = seededRandom(77);
  for (let d = 40; d < 1236; d += 5) {
    if (gapAt(d) || (d > 550 && d < 1000) || fences() < 0.55) continue;
    const biome = biomeAt(d);
    if (biome !== "alley" && biome !== "stairs" && biome !== "descent" && biome !== "riverside") continue;
    for (const side of [-1, 1] as const) {
      const c = at(d, side * (pathWidth(d) / 2 + 0.7));
      if (models) {
        for (const along of [-1.3, 1.3]) { const [fx, fz] = local(c, 0, along); mputFree("fenceRail", fx, c.y - 0.04, fz, c.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 2.7, 1.05 + fences() * 0.2, 0.22); }
        continue;
      }
      put("walls", c.x, c.y - 0.1, c.z, c.yaw, 0.38, 0.9 + fences() * 0.25, 5.2, shade(pick(fences, STONE), 1.05));
    }
  }

  /* ---- rooftops (550-1000): tiles, ridge caps, the lower street, neighbouring roofs ---- */
  const roofsRand = seededRandom(404);
  for (let d = 552; d < 998; d += 3.2) {
    if (gapAt(d) || gapAt(d + 1.6)) continue;
    const c = at(d, 0);
    put("slabs", c.x, c.y, c.z, c.yaw, pathWidth(d) + 0.1, 0.07, 0.14, roofsRand() < 0.5 ? "#4a5f55" : "#5f7a6e");
  }
  for (let d = 552; d < 998; d += 4) {
    for (const side of [-1, 1] as const) {
      if (gapAt(d) || gapAt(d + 4)) continue;
      const c = at(d + 2, side * (pathWidth(d) / 2 + 0.2));
      put("trim", c.x, c.y, c.z, c.yaw, 0.55, 0.38, 4.05, "#5b4034");
    }
  }
  for (const [g0, g1] of GAPS) {
    if (g0 < 550 || g0 > 1000) continue;
    for (const dd of [g0 - 0.3, g1 + 0.3]) {
      const c = at(dd, 0);
      put("walls", c.x, c.y - 3.1, c.z, c.yaw, pathWidth(dd) + 0.9, 3.1, 0.55, "#c8a57b");
      put("trim", c.x, c.y - 0.08, c.z, c.yaw, pathWidth(dd) + 1.1, 0.3, 0.9, "#6b3f33");
    }
  }
  const FLOOR_Y = 3.2;
  for (const row of [0, 1] as const) {
    for (let d = 556; d < 1000; d += 10 + Math.floor(roofsRand() * 6)) {
      for (const side of [-1, 1] as const) {
        const bw = 7 + roofsRand() * 5, bd = 8 + roofsRand() * 5;
        const gap = row === 0 ? 2.4 + roofsRand() * 2.5 : 22 + roofsRand() * 14;
        const top = surfaceY(d, 0) - 1.6 - roofsRand() * 2.2 - row * 3;
        const height = Math.max(5, top - FLOOR_Y - 1.4);
        if (roofsRand() < 0.35) tower(d, side, { r: 3.4 + roofsRand() * 1.8, h: height, gap, baseY: FLOOR_Y }, roofsRand);
        else house(d, side, { bw, bd, bh: height, gap, baseY: FLOOR_Y }, roofsRand);
      }
    }
  }
  for (let d = 580; d < 990; d += 70 + Math.floor(roofsRand() * 30)) {
    const side = roofsRand() < 0.5 ? -1 : 1;
    const c = at(d, side * (pathWidth(d) / 2 + 20 + roofsRand() * 6));
    if (models) { mputH("teahouse", c.x, FLOOR_Y - 0.4, c.z, c.yaw, 15, 1.1); continue; }
    for (let t = 0; t < 3; t++) {
      const sz = 7.5 - t * 1.6;
      put("walls", c.x, FLOOR_Y + t * 4.6, c.z, c.yaw, sz, 4.2, sz, shade("#d9c9a8", 1 - t * 0.04));
      put("hips", c.x, FLOOR_Y + t * 4.6 + 4.2, c.z, c.yaw, sz + 2.8, 1.4 + (t === 2 ? 2.2 : 0), sz + 2.8, t === 2 ? "#a74938" : "#2b2420");
    }
  }

  /* ---- the river crossing (1240-1390): planks, rails, pylons ---- */
  const bridge = seededRandom(1240);
  for (let d = 1240; d < 1390; d += 1.15) {
    const c = at(d, 0);
    put("slabs", c.x, c.y, c.z, c.yaw, pathWidth(d) + 0.5, 0.12, 0.94, pick(bridge, WOOD));
  }
  for (let d = 1240; d < 1390; d += 2.5) for (const side of [-1, 1] as const) {
    const c = at(d, side * (pathWidth(d) / 2 + 0.15));
    put("posts", c.x, c.y, c.z, 0, 0.1, 1.2, 0.1, "#4a3a2a");
    put("trim", c.x, c.y + 1.05, c.z, c.yaw, 0.14, 0.14, 2.6, "#6b5640");
  }
  for (let d = 1250; d < 1390; d += 28) for (const side of [-1, 1] as const) {
    const c = at(d, side * (pathWidth(d) / 2 - 0.4));
    put("walls", c.x, -6, c.z, c.yaw, 2.4, c.y + 5.6, 2.4, "#8c8a7c");
  }

  /* ---- forest (1510-2260) ---- */
  const forest = seededRandom(1600);
  for (let d = 1510; d < 2262; d += 4 + forest() * 4.5) {
    if (gapAt(d)) continue;
    for (const side of [-1, 1] as const) {
      const lat = side * (pathWidth(d) / 2 + 1.8 + Math.pow(forest(), 1.6) * 62);
      const c = at(d, lat);
      pine(c.x, c.y, c.z, 12 + forest() * 20, forest);
    }
  }
  for (let d = 1500; d < 2270; d += 2.2) for (const side of [-1, 1] as const) {
    if (forest() < (models ? 0.82 : 0.45)) continue;
    const c = at(d, side * (pathWidth(d) / 2 + 0.8 + forest() * 5));
    if (models) { mputH("bush", c.x, c.y - 0.1, c.z, forest() * 6, 0.7 + forest() * 0.9, 0.9 + forest() * 0.5, "#9fc08f"); continue; }
    put("tufts", c.x, c.y - 0.05, c.z, forest() * 6, 0.5 + forest() * 0.5, 0.7 + forest() * 0.8, 0.5 + forest() * 0.5, pick(forest, LEAVES));
  }
  for (let d = 1500; d < 2270; d += 9) for (const side of [-1, 1] as const) {
    if (forest() < 0.4) continue;
    const c = at(d, side * (pathWidth(d) / 2 + 2 + forest() * 22));
    const s = 0.7 + forest() * 1.9;
    if (models) { mputH("boulder", c.x, c.y - s * 0.08, c.z, forest() * 6, s * 1.5, 1.1 + forest() * 0.3); continue; }
    put("rocks", c.x, c.y + s * 0.15, c.z, forest() * 6, s * 1.2, s, s * 1.1, "#7d9188");
  }

  /* ---- ground detail on the path and verge, riverbanks, valley cliffs ---- */
  const ground = seededRandom(2025);
  for (let d = 2; d < COURSE_LENGTH; d += 1.35) {
    const biome = biomeAt(d);
    if (biome === "rooftops" || biome === "bridge" || gapAt(d)) continue;
    const w = pathWidth(d);
    const forested = biome === "forest" || biome === "forest_entry" || biome === "forest_exit";
    if (forested) {
      const base = BIOME_TONES[biome]![0];
      for (let k = 0; k < 2; k++) {
        const c = at(d + ground() * 1.3, (ground() - 0.5) * (w - 0.8));
        const sz = 0.18 + ground() * 0.3;
        put("slabs", c.x, c.y + 0.005, c.z, ground() * 6, sz * (0.8 + ground() * 0.5), 0.05 + ground() * 0.05, sz, shade(base, 0.7 + ground() * 0.6));
      }
    }
    if (!forested && biome !== "water") {
      const verge = BIOME_TONES[biome]![1];
      for (const side of [-1, 1] as const) {
        if (ground() < (models ? 0.82 : 0.4)) continue;
        const c = at(d, side * (w / 2 + 0.9 + ground() * 7));
        if (models) { mputH("bush", c.x, c.y - 0.1, c.z, ground() * 6, 0.8 + ground() * 1.1, 0.9 + ground() * 0.5, biome === "water" ? undefined : "#d4e6c4"); continue; }
        put("tufts", c.x, c.y - 0.04, c.z, ground() * 6, 0.34 + ground() * 0.3, 0.45 + ground() * 0.5, 0.34 + ground() * 0.3, shade(verge, 0.9 + ground() * 0.35));
      }
    }
  }
  const banks = seededRandom(1120);
  for (let d = 1110; d < 1520; d += 5) {
    const biome = biomeAt(d);
    if (biome !== "descent" && biome !== "riverside" && biome !== "bridge") continue;
    for (const side of [-1, 1] as const) {
      if (banks() < 0.35) continue;
      const c = at(d, side * (pathWidth(d) / 2 + 3 + banks() * 26));
      const s = 0.8 + banks() * 2.4;
      if (models) { mputH("boulder", c.x, c.y - s * 0.06, c.z, banks() * 6, s * 1.5, 1.1 + banks() * 0.3); continue; }
      put("rocks", c.x, c.y + s * 0.1, c.z, banks() * 6, s * 1.3, s, s * 1.1, pick(banks, STONE));
    }
  }
  const valley = seededRandom(2300);
  for (let d = 2250; d < COURSE_LENGTH + 60; d += 16 + valley() * 14) {
    for (const side of [-1, 1] as const) {
      const lat = side * (pathWidth(Math.min(d, COURSE_LENGTH)) / 2 + 12 + valley() * 55);
      const c = at(d, lat);
      const s = 8 + valley() * 20;
      if (models) { const slab = valley() < 0.3; mputH(slab ? "cliffA" : "cliffB", c.x, c.y - s * (slab ? 0.5 : 0.22), c.z, valley() * 6, s * (slab ? 1.6 : 1.35), (slab ? 1.2 : 1.0) + valley() * 0.4, slab ? "#b4bdb9" : "#cdc7b6"); continue; }
      put("cliffs", c.x, c.y - s * 0.35, c.z, valley() * 6, s * 1.2, s * 1.5, s, pick(valley, ["#8f9a96", "#7d9188", "#a1a18b"] as const));
    }
  }

  /* ---- distant hills that give the horizon depth ---- */
  const hills = seededRandom(3300);
  for (let d = -120; d < COURSE_LENGTH + 260; d += 60 + hills() * 40) {
    for (const side of [-1, 1] as const) {
      const lat = side * (120 + hills() * 300);
      const c = at(Math.min(d, COURSE_LENGTH), lat);
      const s = 45 + hills() * 90;
      const biome = biomeAt(Math.max(0, d));
      const tone = biome.startsWith("forest") ? "#4d7658" : biome === "water" ? "#8d9a9c" : "#7e9a6a";
      if (models) { mputFree("ridge", c.x, c.y - 10, c.z, hills() * 6, s * 2.6, 22 + hills() * 40, s * 2.2, biome.startsWith("forest") ? "#c8e0cc" : biome === "water" ? "#d6dcdc" : "#f0f6e6"); continue; }
      put("hills", c.x, c.y - 24, c.z, 0, s, 18 + hills() * 42, s * (0.8 + hills() * 0.6), shade(tone, 0.85 + hills() * 0.25));
    }
  }

  const peaks = seededRandom(4400);
  for (let d = -200; d < COURSE_LENGTH + 400; d += 120 + peaks() * 80) {
    for (const side of [-1, 1] as const) {
      const lat = side * (420 + peaks() * 380);
      const c = at(Math.min(Math.max(d, 0), COURSE_LENGTH), lat);
      const s = 130 + peaks() * 140;
      const tone = d > 1500 && d < 2300 ? "#5f8a86" : "#7a97a4";
      if (models) { mputFree("ridge", c.x, c.y - 30, c.z, peaks() * 6, s * 2.6, 60 + peaks() * 80, s * 2.2, d > 1500 && d < 2300 ? "#bcd8d4" : "#c4d6e0"); continue; }
      put("hills", c.x, c.y - 40, c.z, 0, s, 80 + peaks() * 110, s * (0.7 + peaks() * 0.6), shade(tone, 0.9 + peaks() * 0.2));
    }
  }

  if (models) clearCameraPath(models);
  return [...layers.values()].filter((l) => l.placements.length > 0);
}

/**
 * Roadster Hours world on the public `@aura3d/engine` surface only: a procedural sky dome, a footprint-filtered ocean,
 * rock cliffs, guardrails, the road ribbon, kickers and roofline shortcuts (`geometry.dynamic` + `material.custom`), relay
 * gates, data cells and hazards, the Roadster, and every traffic and lineup vehicle in `batched.mesh`es: generated (Meshy)
 * models as one textured batched mesh per model, the baked CC0 cars in per-material batched meshes and the box rigs as the
 * fallback when a generated model is unavailable (`meshy.ts`, `PORTING-NOTES.md`).
 */
import {
  batched, camera, cameras, effects, environments, geometry, instances, lights, material, primitives, scene, type AuraApp
} from "@aura3d/engine";
import { levelLayout, roadProfile, trafficPiece, pieceSpec, type Level } from "./course";
import { CAR_GROUPS, CAR_FOR_PIECE, carGroup, carNativeSize, type CarGroup, type CarKey } from "./cars";
import { LEVELS } from "./data";
import { LOOKS, hexLinear, type Look } from "./look";
import { beamSpec, plumeSpec, rampSpec, roadSpec, skySpec, solidSpec, terrainSpec, towerSpec, townSpec, waterSpec, type FogLook } from "./materials";
import { hasMeshy, meshyGeometry, meshyMaterial, meshySize } from "./meshy";
import type { Run, RunEvent as SimEvent } from "./sim";

import { createCameraDirector } from "./camera";

export { hexLinear };

type Scene = ReturnType<typeof scene>;
type Vec3 = [number, number, number];
type LocalBox = { min: readonly number[]; max: readonly number[] };

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const hexString = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;

/** World position of road point (s, lateral l) at height `h` above the surface (the game's `dd`). */
export function roadPoint(level: Level, s: number, l: number, h = 0): Vec3 {
  const p = roadProfile(level, s);
  const a = Math.sqrt(1 + p.dx * p.dx);
  return [p.x + (l * Math.cos(p.bank)) / a, p.y + l * Math.sin(p.bank) + h, p.z + (l * Math.cos(p.bank) * p.dx) / a];
}

interface MeshData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
const emptyMesh = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

function strip(
  level: Level, s0: number, s1: number, step: number, laterals: readonly number[],
  height: (s: number, l: number) => number, solid: (sMid: number) => boolean, uvScale: number
): MeshData {
  const m = emptyMesh();
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const bank = roadProfile(level, s).bank;
    for (const l of laterals) {
      m.positions.push(...roadPoint(level, s, l, height(s, l)));
      m.normals.push(-Math.sin(bank), Math.cos(bank), 0);
      m.uvs.push(l / uvScale, s);
    }
  }
  const cols = laterals.length;
  for (let i = 0; i < n; i++) {
    const mid = s0 + ((s1 - s0) * (i + 0.5)) / n;
    if (!solid(mid)) continue;
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      m.indices.push(a, d, b, b, d, e);
    }
  }
  return m;
}

const dyn = (m: MeshData) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });

const inGap = (level: Level, s: number): boolean => level.gaps.some(([a, b]) => s > a && s < b);

/* ------------------------------------------------------------------ procedural terrain */

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x: number, y: number, seed: number): number {
  let amp = 0.5, sum = 0, f = 1;
  for (let i = 0; i < 4; i++) { sum += amp * noise2(x * f, y * f, seed + i * 7); f *= 2.03; amp *= 0.5; }
  return sum;
}
const clampUnit = (x: number): number => Math.max(0, Math.min(1, x));
const sstep = (e0: number, e1: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Smooth normals for a (rows x cols) grid whose columns increase with lateral x and rows with arc s (so +Y is up). */
function gridNormals(positions: readonly number[], rows: number, cols: number): number[] {
  const normals = new Array<number>(positions.length).fill(0);
  const at = (r: number, c: number): Vec3 => { const i = (r * cols + c) * 3; return [positions[i]!, positions[i + 1]!, positions[i + 2]!]; };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = at(Math.max(0, r - 1), c), b = at(Math.min(rows - 1, r + 1), c), l = at(r, Math.max(0, c - 1)), rr = at(r, Math.min(cols - 1, c + 1));
    const dr: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dc: Vec3 = [rr[0] - l[0], rr[1] - l[1], rr[2] - l[2]];
    let nx = dc[1] * dr[2] - dc[2] * dr[1], ny = dc[2] * dr[0] - dc[0] * dr[2], nz = dc[0] * dr[1] - dc[1] * dr[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const i = (r * cols + c) * 3;
    normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
  }
  return normals;
}

function gridIndices(rows: number, cols: number, solid: (rowMid: number) => boolean): number[] {
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    if (!solid(r)) continue;
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  return indices;
}

const OFFSETS = [0.35, 1.0, 2.2, 3.8, 6, 9, 13, 18, 25, 34, 46, 62, 84, 112];

/** Absolute terrain height at arc position `s`, distance `d` from the road edge on side `sign`, for a sea embankment or a rock cliff. */
function flankY(level: Level, look: Look, sign: -1 | 1, kind: "sea" | "cliff" | "hills", seed: number, s: number, d: number): number {
  const prof = roadProfile(level, s);
  const edgeY = prof.y + sign * level.width * Math.sin(prof.bank);
  const cliffH = 30 + 26 * fbm2(s * 0.006, 3.1, seed) + 8 * Math.sin(s * 0.0031 + seed);
  const edgeBlend = 1 - sstep(0, 10, d);
  let y = prof.y + (edgeY - prof.y) * edgeBlend;
  const n = fbm2(s * 0.05 + d * 0.11, d * 0.07, seed + 11);
  if (kind === "sea") {
    const fall = sstep(0.5, look.style === "skyway" ? 5 : 15, d);
    y += -0.3 - (prof.y + 10) * Math.pow(fall, 0.75) + (n - 0.5) * 3.2 * sstep(1, 9, d);
  } else if (kind === "hills") {
    const rise = 1.5 + 0.17 * d;
    y += 0.2 + rise * sstep(0.3, 6, d) + (fbm2(s * 0.02 + d * 0.03, d * 0.02 + 4, seed + 29) - 0.45) * 22 * sstep(10, 90, d) + (n - 0.5) * 3 * sstep(2, 14, d);
  } else {
    const wall = Math.pow(sstep(0.4, look.style === "canyon" ? 20 : 26, d), 0.7);
    const ridge = fbm2(d * 0.07 + 5, s * 0.018, seed + 29) * 20 * sstep(10, 60, d);
    y += 0.1 + cliffH * wall + ridge + (n - 0.5) * 5.5 * sstep(2, 14, d);
  }
  return y;
}

/** One flank of the road: sea-side embankment that drops to the water, or a rock cliff that rises. */
function flank(level: Level, look: Look, sign: -1 | 1, kind: "sea" | "cliff" | "hills", seed: number): MeshData {
  const step = 5;
  const s0 = -40, s1 = level.length + 140;
  const rows = Math.ceil((s1 - s0) / step) + 1;
  const ds = sign < 0 ? [...OFFSETS].reverse() : OFFSETS;
  const cols = ds.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const s = s0 + r * step;
    for (const d of ds) {
      const [x, , z] = roadPoint(level, s, sign * (level.width + d), 0);
      positions.push(x, flankY(level, look, sign, kind, seed, s, d), z);
      uvs.push(d, s);
    }
  }
  return { positions, normals: gridNormals(positions, rows, cols), uvs, indices: gridIndices(rows, cols, () => true) };
}

/* ------------------------------------------------------------------ guardrails, towers */

function appendBox(m: MeshData, c: Vec3, h: Vec3): void {
  const base = m.positions.length / 3;
  const faces: [Vec3, Vec3, Vec3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
  ];
  faces.forEach(([n, u, v], f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      m.positions.push(c[0] + (n[0] + u[0] * su + v[0] * sv) * h[0], c[1] + (n[1] + u[1] * su + v[1] * sv) * h[1], c[2] + (n[2] + u[2] * su + v[2] * sv) * h[2]);
      m.normals.push(n[0], n[1], n[2]);
      m.uvs.push((su + 1) / 2, (sv + 1) / 2);
    }
    const o = base + f * 4;
    m.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
}

const RAIL_PROFILE: readonly (readonly [number, number])[] = [[-0.02, 0.4], [0.05, 0.47], [0, 0.55], [0.05, 0.63], [0, 0.71], [0.05, 0.78], [-0.02, 0.85]];

function guardrails(level: Level): MeshData {
  const m = emptyMesh();
  const step = 3;
  const s0 = 0, s1 = level.length + 70;
  const rows = Math.ceil((s1 - s0) / step) + 1;
  for (const sign of [-1, 1] as const) {
    const base = m.positions.length / 3;
    const positions: number[] = [];
    for (let r = 0; r < rows; r++) {
      const s = s0 + r * step;
      for (const [o, h] of RAIL_PROFILE) positions.push(...roadPoint(level, s, sign * (level.width + 0.5 + o), h));
    }
    const cols = RAIL_PROFILE.length;
    const normals = gridNormals(positions, rows, cols);
    for (let i = 0; i < positions.length; i++) { m.positions.push(positions[i]!); m.normals.push(normals[i]!); }
    for (let i = 0; i < positions.length / 3; i++) m.uvs.push(0, 0);
    for (const idx of gridIndices(rows, cols, (r) => !inGap(level, s0 + (r + 0.5) * step))) m.indices.push(base + idx);
    for (let s = s0; s <= s1; s += 4) {
      if (inGap(level, s)) continue;
      const p = roadPoint(level, s, sign * (level.width + 0.78), 0.4);
      appendBox(m, p, [0.06, 0.4, 0.06]);
    }
  }
  return m;
}

function towers(level: Level, seed: number): MeshData {
  const m = emptyMesh();
  for (let s = 40; s < level.length + 60; s += 38) {
    for (const sign of [-1, 1] as const) {
      const r = hash2(Math.floor(s), sign, seed);
      const dist = 70 + hash2(Math.floor(s), sign + 5, seed) * 260;
      const width = 14 + r * 26, depth = 14 + hash2(Math.floor(s), sign + 9, seed) * 24;
      const height = 50 + Math.pow(hash2(Math.floor(s), sign + 13, seed), 2) * 230;
      const [x, , z] = roadPoint(level, s + r * 20, sign * (level.width + dist), 0);
      appendBox(m, [x, -8 + height / 2, z], [width / 2, height / 2, depth / 2]);
    }
  }
  return m;
}

interface TownLot { readonly x: number; readonly y: number; readonly z: number; readonly w: number; readonly dep: number; readonly h: number; readonly s: number; readonly id: number; readonly sign: -1 | 1 }
/** Lots of the cliff-top town (shared by the plaster-cube fallback and the generated villa/townhouse models). */
function townLots(level: Level, look: Look, seed: number): TownLot[] {
  const lots: TownLot[] = [];
  const act = level.acts.find((a) => /city/i.test(a.name));
  if (!act) return lots;
  const next = level.acts[level.acts.indexOf(act) + 1];
  const s0 = act.s, s1 = next ? next.s : act.s + 600;
  const sign = (look.seaSide * -1) as -1 | 1;
  let id = 1;
  for (let s = s0; s < s1; s += 17) {
    for (let k = 0; k < 3; k++) {
      const r1 = hash2(Math.floor(s) + k * 131, 3, seed), r2 = hash2(Math.floor(s) + k * 71, 5, seed), r3 = hash2(Math.floor(s) + k * 53, 9, seed);
      if (r1 < 0.28) continue;
      const d = 34 + k * 24 + r2 * 12;
      const w = 8 + r1 * 8, dep = 8 + r2 * 7, h = 6 + r3 * 11;
      const ss = s + r3 * 8;
      const [x, , z] = roadPoint(level, ss, sign * (level.width + d), 0);
      const y = flankY(level, look, sign, "hills", seed + 101, ss, d) - 1.5;
      lots.push({ x, y, z, w, dep, h, s: ss, id, sign });
      id++;
    }
  }
  return lots;
}

/** Cliff-top town: plaster cubes with flat roofs on the plateau above the road for the route's town act. uv.x carries the building id for the facade tint. */
function townBuildings(level: Level, look: Look, seed: number): MeshData {
  const m = emptyMesh();
  const act = level.acts.find((a) => /city/i.test(a.name));
  if (!act) return m;
  const next = level.acts[level.acts.indexOf(act) + 1];
  const s0 = act.s, s1 = next ? next.s : act.s + 600;
  const sign = (look.seaSide * -1) as -1 | 1;
  let id = 1;
  for (let s = s0; s < s1; s += 17) {
    for (let k = 0; k < 3; k++) {
      const r1 = hash2(Math.floor(s) + k * 131, 3, seed), r2 = hash2(Math.floor(s) + k * 71, 5, seed), r3 = hash2(Math.floor(s) + k * 53, 9, seed);
      if (r1 < 0.28) continue;
      const d = 34 + k * 24 + r2 * 12;
      const w = 8 + r1 * 8, dep = 8 + r2 * 7, h = 6 + r3 * 11;
      const [x, , z] = roadPoint(level, s + r3 * 8, sign * (level.width + d), 0);
      const y = flankY(level, look, sign, "hills", seed + 101, s + r3 * 8, d) - 1.5;
      const before = m.positions.length / 3;
      appendBox(m, [x, y + h / 2, z], [w / 2, h / 2, dep / 2]);
      for (let i = before; i < m.positions.length / 3; i++) m.uvs[i * 2] = m.uvs[i * 2]! + id;
      id++;
    }
  }
  return m;
}

/** Street lamps along both sides: poles with an arm toward the road (grey) and emissive heads (warm). */
function streetLamps(level: Level): { poles: MeshData; heads: MeshData } {
  const poles = emptyMesh(), heads = emptyMesh();
  let i = 0;
  for (let s = 90; s < level.length + 40; s += 64, i++) {
    if (inGap(level, s)) continue;
    const sign = i % 2 === 0 ? 1 : -1;
    const base = roadPoint(level, s, sign * (level.width + 1.7), 0);
    appendBox(poles, [base[0], base[1] + 4.6, base[2]], [0.11, 4.6, 0.11]);
    const arm = roadPoint(level, s, sign * (level.width + 1.7 - 1.1), 9.2);
    appendBox(poles, [arm[0], arm[1], arm[2]], [1.15, 0.07, 0.07]);
    const head = roadPoint(level, s, sign * (level.width + 1.7 - 2.2), 9.15);
    appendBox(heads, [head[0], head[1], head[2]], [0.5, 0.09, 0.2]);
  }
  return { poles, heads };
}

/** Open cone from `apex` along `dir` (unit), uv.x around, uv.y along the beam. */
function beamCone(apex: Vec3, dir: Vec3, length: number, endRadius: number, segments = 16): MeshData {
  const m = emptyMesh();
  const ref: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u: Vec3 = [dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]];
  const ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v: Vec3 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  for (const t of [0, 1]) {
    const radius = 0.04 + endRadius * t;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rx = u[0] * ca + v[0] * sa, ry = u[1] * ca + v[1] * sa, rz = u[2] * ca + v[2] * sa;
      m.positions.push(apex[0] + dir[0] * length * t + rx * radius, apex[1] + dir[1] * length * t + ry * radius, apex[2] + dir[2] * length * t + rz * radius);
      m.normals.push(rx, ry, rz);
      m.uvs.push(i / segments, t);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < segments; i++) m.indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
  return m;
}

/* ------------------------------------------------------------------ vehicles */

const CAR_COLOURS = ["#d9dde6", "#1f2a3d", "#b3202a", "#e0b13a", "#2f6f4a", "#4a6b8a", "#f0f0f0", "#7d8896", "#c46a2b", "#3b3f48"];
const RIG_COLOURS: Record<string, string> = { box_truck: "#e8e8e8", bus: "#e6b020", semi_tractor: "#2f3e55", tanker: "#c9ced6", semi: "#b9c0cc", car_carrier: "#7d8896" };

const unionBox = (boxes: readonly LocalBox[]): LocalBox => {
  const min = [Infinity, 0, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let c = 0; c < 3; c++) { if (c !== 1) min[c] = Math.min(min[c]!, b.min[c]!); max[c] = Math.max(max[c]!, b.max[c]!); }
  return { min, max };
};

/** The slice of a `batched.mesh` handle a vehicle slot writes through. */
interface SlotMesh { setMatrixAt(i: number, matrix: Float32Array): void; setVisibleAt(i: number, visible: boolean): void }

const carFor = (piece: string, index: number): CarKey | null => {
  if (piece === "sedan") return index % 2 === 0 ? "sedan" : "sportsCar";
  const key = CAR_FOR_PIECE[piece];
  return key ?? null;
};

/** Which generated (Meshy) model stands in for a sim piece, when it loaded; null falls back to the baked CC0 cars and box rigs. */
const meshyFor = (piece: string, index: number): string | null => {
  const key = piece === "sedan" ? (index % 3 === 0 ? "hatch" : "sedan") : piece === "box_truck" ? "boxtruck" : piece;
  return ["sedan", "hatch", "suv", "pickup", "bus", "boxtruck", "semi", "tanker"].includes(key) && hasMeshy(key) ? key : null;
};

const CAB_COLOURS = ["#2f3e55", "#a32a2a", "#e0b13a", "#2b6a52", "#c46a2b"];
const GLASS_COLOUR = "#0a1119";
const DARK_COLOUR = "#1b1e24";

interface RigPart { readonly box: LocalBox; readonly colour: string }

/** Box rigs (bus, trucks, semis) detailed from their collision boxes: cab and cargo colours, chassis, windows, wheels, bumper and lamps. */
function rigParts(piece: string, boxes: readonly LocalBox[], cargoColour: string, cabColour: string): { parts: RigPart[]; tails: LocalBox[]; heads: LocalBox[] } {
  const parts: RigPart[] = [];
  const tails: LocalBox[] = [];
  const heads: LocalBox[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): LocalBox => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
  const zMin = Math.min(...boxes.map((b) => b.min[2]!)), zMax = Math.max(...boxes.map((b) => b.max[2]!));
  const cab = boxes.reduce((best, b) => (b.min[2]! < best.min[2]! ? b : best), boxes[0]!);
  const isBus = piece === "bus";
  boxes.forEach((b) => {
    const h = b.max[1]! - b.min[1]!;
    const chassis = b.min[1]! <= 0.4 && h <= 1.5;
    const colour = chassis ? DARK_COLOUR : b === cab && !isBus ? cabColour : cargoColour;
    parts.push({ box: b, colour });
  });
  const cabH = cab.max[1]! - cab.min[1]!;
  const cabW = cab.max[0]! - cab.min[0]!;
  if (isBus) {
    const body = cab;
    const len = body.max[2]! - body.min[2]!;
    for (const side of [-1, 1]) {
      const x = side > 0 ? body.max[0]! : body.min[0]!;
      parts.push({ box: box(Math.min(x, x + side * 0.04), body.min[1]! + cabH * 0.5, body.min[2]! + len * 0.06, Math.max(x, x + side * 0.04), body.min[1]! + cabH * 0.82, body.max[2]! - len * 0.06), colour: GLASS_COLOUR });
    }
    parts.push({ box: box(body.min[0]! + 0.1, body.min[1]! + cabH * 0.45, zMin - 0.03, body.max[0]! - 0.1, body.min[1]! + cabH * 0.85, zMin + 0.06), colour: GLASS_COLOUR });
    parts.push({ box: box(body.min[0]! + 0.12, body.min[1]! + cabH * 0.5, zMax - 0.06, body.max[0]! - 0.12, body.min[1]! + cabH * 0.82, zMax + 0.03), colour: GLASS_COLOUR });
  } else {
    parts.push({ box: box(cab.min[0]! + 0.12, cab.min[1]! + cabH * 0.5, cab.min[2]! - 0.03, cab.max[0]! - 0.12, cab.max[1]! - 0.1, cab.min[2]! + 0.08), colour: GLASS_COLOUR });
    for (const side of [-1, 1]) {
      const x = side > 0 ? cab.max[0]! : cab.min[0]!;
      parts.push({ box: box(Math.min(x, x + side * 0.04), cab.min[1]! + cabH * 0.52, cab.min[2]! + 0.25, Math.max(x, x + side * 0.04), cab.max[1]! - 0.12, cab.min[2]! + Math.min(1.5, (cab.max[2]! - cab.min[2]!) * 0.7)), colour: GLASS_COLOUR });
    }
  }
  const half = Math.max(...boxes.map((b) => b.max[0]!)) - 0.05;
  const axles = [zMin + (isBus ? 2.1 : 1.4), zMax - 1.3, zMax - 2.8];
  if (zMax - zMin > 14) axles.push(zMin + (cab.max[2]! - cab.min[2]!) + 1.4);
  for (const z of axles) for (const side of [-1, 1]) {
    parts.push({ box: box(side > 0 ? half - 0.26 : -half - 0.06, 0, z - 0.52, side > 0 ? half + 0.06 : -half + 0.26, 0.98, z + 0.52), colour: "#0e0f12" });
  }
  const rear = boxes.reduce((best, b) => (b.max[2]! > best.max[2]! ? b : best), boxes[0]!);
  parts.push({ box: box(rear.min[0]!, 0.42, rear.max[2]! - 0.04, rear.max[0]!, 0.74, rear.max[2]! + 0.14), colour: DARK_COLOUR });
  const rearW = (rear.max[0]! - rear.min[0]!) / 2;
  const rearLow = rear.min[1]! + (rear.max[1]! - rear.min[1]!) * 0.2;
  for (const sx of [-1, 1]) tails.push(box(sx * (rearW - 0.35) - 0.2, Math.max(0.55, rearLow) - 0.1, rear.max[2]! - 0.03, sx * (rearW - 0.35) + 0.2, Math.max(0.55, rearLow) + 0.1, rear.max[2]! + 0.08));
  const lampY = cab.min[1]! + cabH * 0.28;
  for (const sx of [-1, 1]) heads.push(box(sx * (cabW / 2 - 0.35) - 0.22, lampY - 0.1, cab.min[2]! - 0.06, sx * (cabW / 2 - 0.35) + 0.22, lampY + 0.1, cab.min[2]! + 0.04));
  return { parts, tails, heads };
}

interface VehicleDef { readonly piece: string; readonly variant: number; readonly car: CarKey | null; readonly meshy: string | null; readonly colour: string }

export interface WorldRuntime {
  /** `events` are the sim events of every step since the last frame (camera shake, FOV kicks, cut on recover). */
  update(run: Run, dt: number, time: number, aspect: number, events?: readonly SimEvent[]): void;
  reset(run: Run): void;
  /** Reduced motion: no camera shake and no FOV kicks. */
  setReducedMotion(on: boolean): void;
  batching(): Record<string, unknown> | null;
  /** Draw calls with every vehicle hidden vs shown: the delta is what the batched meshes cost. */
  probeBatchedDraws(): { hidden: number; visible: number; delta: number; instances: number; texturedInstances: number; batchedGeometries: number; geometries: number; features: readonly string[] };
  readonly vehicleInstances: number;
}

export interface World {
  readonly scene: Scene;
  readonly level: Level;
  readonly look: Look;
  /** Traffic and lineup vehicles. */
  readonly vehicleCount: number;
  /** Batched instances across every vehicle mesh (one per vehicle per material group, boxes for rigs). */
  readonly vehicleSlots: number;
  /** Pooled geometries across the batched vehicle meshes. */
  readonly vehicleGeometries: number;
  readonly vehicleMeshes: number;
  /** Nodes whose texture the engine uploads after mount (generated models): the page waits for them before it hides the loading screen. */
  readonly texturedNodes: number;
  bind(app: AuraApp): WorldRuntime;
}

/** Writes the instance matrix into `out` (one scratch buffer per world: `setMatrixAt` copies, so nothing is allocated per frame). */
export function matrixFor(psi: number, centre: Vec3, size: Vec3, out: Float32Array = new Float32Array(16)): Float32Array {
  const c = Math.cos(psi), s = Math.sin(psi);
  out[0] = c * size[0]; out[1] = 0; out[2] = -s * size[0]; out[3] = 0;
  out[4] = 0; out[5] = size[1]; out[6] = 0; out[7] = 0;
  out[8] = s * size[2]; out[9] = 0; out[10] = c * size[2]; out[11] = 0;
  out[12] = centre[0]; out[13] = centre[1]; out[14] = centre[2]; out[15] = 1;
  return out;
}

export const fogFor = (look: Look): FogLook => ({ fogColor: look.horizon, fogNear: look.fogNear, fogFar: look.fogFar });

const PLAYER_SCALE = 1.12;
const DUST_COLOUR: Record<string, readonly [number, number, number]> = { coast: [0.8, 0.78, 0.74], canyon: [0.62, 0.38, 0.28], skyway: [0.22, 0.28, 0.42] };

export function buildWorld(levelIndex: number): World {
  const level = LEVELS[levelIndex]!;
  const look = LOOKS[level.id]!;
  const seed = level.seed;
  const sunDirection = look.sunDir;
  const query = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const enabled = (flag: string): boolean => query.get(flag) !== "0";
  const builder: Scene = scene()
    .background(hexString(level.fog))
    .camera(camera.perspective({ position: roadPoint(level, 0, 0, 6), target: roadPoint(level, 40, 0, 2), fov: 60, near: 0.4, far: 7000 }))
    .add(lights.directional({ name: "sun", position: [sunDirection[0] * 500, sunDirection[1] * 500, sunDirection[2] * 500], target: [0, 0, 0], intensity: look.keyLight.intensity, color: look.keyLight.color, shadow: enabled("shadow") ? { cascades: 1, maxDistance: 90 } : false }))
    .add(lights.directional({ name: "fill", position: [-sunDirection[0] * 300, 120, -sunDirection[2] * 300], target: [0, 0, 0], intensity: look.fillLight.intensity, color: look.fillLight.color, shadow: false }));
  if (enabled("env")) builder.add(environments.preset(look.night ? "night" : look.id === "redline" ? "sunset" : "outdoor", { name: "route IBL", intensity: look.envIntensity, background: false }));
  if (enabled("fog")) builder.add(effects.fog({ name: "haze", density: look.engineFogDensity, color: look.engineFog }));
  if (enabled("post")) {
    builder
      .add(effects.bloom({ name: "bloom", intensity: look.bloom.intensity, threshold: look.bloom.threshold, radius: look.bloom.radius }))
      .add(effects.colorGrade({ name: "grade", exposure: look.grade.exposure, contrast: look.grade.contrast, saturation: look.grade.saturation }))
      .add(effects.vignette({ name: "vignette", intensity: look.vignette, smoothness: 0.7 }))
      .add(effects.antiAlias({ name: "fxaa", mode: "fxaa" }));
  }

  const width = level.width;
  const laterals = [-width, -width * 0.75, -width * 0.5, -width * 0.25, 0, width * 0.25, width * 0.5, width * 0.75, width];
  const glow = hexLinear(0x2ad6ff);

  /* ---- sky dome (follows the camera) ---- */
  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 6000, params: { widthSegments: 32, heightSegments: 16 }, material: material.custom(skySpec(look)) }).runtime({ id: "sky" }));

  /* ---- road, kickers, roofline shortcuts ---- */
  const road = strip(level, 0, level.length + 80, 3, laterals, () => 0, (mid) => !inGap(level, mid), width);
  builder.add(geometry.custom(dyn(road), { name: "road", material: material.custom(roadSpec(look, [0.92, 0.9, 0.82], glow)) }).runtime({ id: "road" }));
  level.lineups.forEach((lineup, i) => {
    const k = lineup.kicker;
    const wedge = strip(level, k.s, k.s + k.len, 1.5, [-k.w, -k.w / 2, 0, k.w / 2, k.w], (s) => {
      const t = (s - k.s) / k.len;
      return k.h * t * t;
    }, () => true, k.w);
    builder.add(geometry.custom(dyn(wedge), { name: `kicker-${i}`, material: material.custom(rampSpec(look, glow)), castShadow: false }));
  });
  level.shortcuts.forEach((sc, i) => {
    const deck = strip(level, sc.start, sc.end, 4, [sc.l - 5.5, sc.l, sc.l + 5.5], () => sc.height, () => true, 5.5);
    builder.add(geometry.custom(dyn(deck), { name: `shortcut-${i}`, material: material.custom(rampSpec(look, glow)), castShadow: false }));
  });

  /* ---- terrain, guardrails, towers ---- */
  const seaKind = look.style === "canyon" ? "cliff" : "sea";
  builder.add(geometry.custom(dyn(flank(level, look, look.seaSide, seaKind, seed)), { name: "flank-sea", material: material.custom(terrainSpec(look)) }));
  if (look.style !== "skyway") builder.add(geometry.custom(dyn(flank(level, look, (look.seaSide * -1) as -1 | 1, look.style === "coast" ? "hills" : "cliff", seed + 101)), { name: "flank-cliff", material: material.custom(terrainSpec(look)) }));
  else builder.add(geometry.custom(dyn(flank(level, look, (look.seaSide * -1) as -1 | 1, "sea", seed + 101)), { name: "flank-far", material: material.custom(terrainSpec(look)) }));
  builder.add(geometry.custom(dyn(guardrails(level)), { name: "guardrails", material: material.custom(solidSpec(look, [0.72, 0.74, 0.77], [0, 0, 0], 0, 0.32, 0.9)) }));
  if (look.style === "skyway") builder.add(geometry.custom(dyn(towers(level, seed)), { name: "towers", material: material.custom(towerSpec(look)) }));
  if (look.style !== "canyon") {
    const lamps = streetLamps(level);
    builder.add(geometry.custom(dyn(lamps.poles), { name: "lamp-poles", material: material.custom(solidSpec(look, [0.36, 0.38, 0.42], [0, 0, 0], 0, 0.5, 0.6)) }));
    builder.add(geometry.custom(dyn(lamps.heads), { name: "lamp-heads", material: material.custom(solidSpec(look, [1, 0.93, 0.8], [1, 0.9, 0.7], look.night ? 5 : 2.4, 0.3)) }));
  }
  // Procedural town and lighthouse only where the generated models are missing (they sit at the same spots; audit C3).
  const meshyTown = hasMeshy("villa") || hasMeshy("townhouse");
  if (look.style === "coast" && !meshyTown) {
    const town = townBuildings(level, look, seed);
    if (town.indices.length) builder.add(geometry.custom(dyn(town), { name: "town", material: material.custom(townSpec(look)) }));
  }
  if (look.style === "coast") {
    const lightS = Math.min(level.length - 260, 2520);
    const base = roadPoint(level, lightS, look.seaSide * (level.width + 95), 0);
    const white = (): ReturnType<typeof material.custom> => material.custom(solidSpec(look, [0.82, 0.8, 0.76], [0, 0, 0], 0, 0.6));
    const red = (): ReturnType<typeof material.custom> => material.custom(solidSpec(look, [0.62, 0.08, 0.06], [0, 0, 0], 0, 0.55));
    // The rock is the island under either lighthouse; the seven procedural tiers only stand in for a missing model.
    builder.add(primitives.sphere({ name: "lighthouse-rock", position: [base[0], 1, base[2]], size: [34, 18, 34], params: { widthSegments: 18, heightSegments: 10 }, material: material.custom(terrainSpec(look)) }));
    const proceduralTower = !hasMeshy("lighthouse");
    const tier = (name: string, y: number, dia: number, h: number, mat: ReturnType<typeof material.custom>): void => {
      if (proceduralTower) builder.add(primitives.cylinder({ name: `lighthouse-${name}`, position: [base[0], y + h / 2, base[2]], size: [dia, h, dia], material: mat }));
    };
    tier("base", 6, 10.5, 22, white());
    tier("band-a", 28, 9.2, 6, red());
    tier("shaft", 34, 8.2, 20, white());
    tier("band-b", 54, 7.6, 5, red());
    tier("gallery", 59, 9, 1.4, white());
    tier("lantern", 60.4, 5.6, 6, material.custom(solidSpec(look, [1, 0.85, 0.5], [1, 0.72, 0.28], 3.2, 0.2)));
    tier("cap", 66.4, 6.6, 2.4, red());
  }

  /* ---- the player's car goes in first: textured materials upgrade one at a time in scene order, so the hero is textured before props and traffic ---- */
  const meshyPlayer = hasMeshy("roadster");
  if (meshyPlayer) {
    const data = meshyGeometry("roadster")!;
    builder.add(geometry.custom(
      geometry.dynamic({ positions: data.positions, normals: data.normals, uvs: data.uvs, indices: data.indices }),
      { name: "car-body", material: meshyMaterial("roadster", { roughness: 0.42, metallic: 0.18 }) }
    ).runtime({ id: "car-body" }));
  }

  /* ---- generated (Meshy) scenery: lighthouse, town houses, trees, boulders; the procedural lighthouse and town above are only built when these are missing ---- */
  let texturedScenery = 0;
  const scatter = (key: string, name: string, items: readonly { p: Vec3; yaw: number; size: Vec3 }[], options: { roughness?: number; metallic?: number; doubleSided?: boolean; specular?: number } = {}): void => {
    const data = meshyGeometry(key);
    if (!data || !items.length) return;
    texturedScenery++;
    builder.add(instances.custom(geometry.dynamic({ positions: data.positions, normals: data.normals, uvs: data.uvs, indices: data.indices }) as never, {
      name, material: meshyMaterial(key, options), transforms: items.map((item) => ({ position: item.p, rotation: [0, item.yaw, 0] as Vec3, scale: item.size }))
    } as never));
  };
  if (look.style === "coast" && hasMeshy("lighthouse")) {
    const lightS = Math.min(level.length - 260, 2520);
    const lb = roadPoint(level, lightS, look.seaSide * (level.width + 95), 0);
    const towerH = 72;
    scatter("lighthouse", "lighthouse-model", [{ p: [lb[0], 6, lb[2]], yaw: 0, size: [towerH, towerH, towerH] }], { roughness: 0.6, metallic: 0.05 });
  }
  if (look.style === "coast" && meshyTown) {
    const lots = townLots(level, look, seed);
    const villas = lots.filter((l) => l.id % 2 === 0 || !hasMeshy("townhouse"));
    const towns = lots.filter((l) => !villas.includes(l));
    const place = (lot: TownLot) => ({ p: [lot.x, lot.y, lot.z] as Vec3, yaw: -roadProfile(level, lot.s).heading + (lot.sign > 0 ? Math.PI : 0), size: [lot.h * 1.3, lot.h * 1.3, lot.h * 1.3] as Vec3 });
    if (hasMeshy("villa")) scatter("villa", "town-villas", villas.map(place), { roughness: 0.8 });
    if (hasMeshy("townhouse")) scatter("townhouse", "town-townhouses", towns.map(place), { roughness: 0.8 });
  }
  if (look.style === "coast") {
    const sign = (look.seaSide * -1) as -1 | 1;
    const palms: { p: Vec3; yaw: number; size: Vec3 }[] = [], pines: { p: Vec3; yaw: number; size: Vec3 }[] = [];
    for (let s = 90; s < level.length; s += 24) {
      const r = (n: number): number => hash2(Math.floor(s) + n * 17, n + 3, seed + 505);
      if (r(1) > 0.5) {
        const d = 5 + r(2) * 10;
        const [x, , z] = roadPoint(level, s + r(3) * 12, look.seaSide * (level.width + d), 0);
        const h = 7 + r(4) * 4;
        palms.push({ p: [x, flankY(level, look, look.seaSide, "sea", seed, s + r(3) * 12, d) - 0.2, z], yaw: r(5) * Math.PI * 2, size: [h, h, h] });
      }
      if (r(6) > 0.35) {
        const d = 8 + r(7) * 46;
        const [x, , z] = roadPoint(level, s + r(8) * 12, sign * (level.width + d), 0);
        const h = 9 + r(9) * 6;
        pines.push({ p: [x, flankY(level, look, sign, "hills", seed + 101, s + r(8) * 12, d) - 0.3, z], yaw: r(10) * Math.PI * 2, size: [h, h, h] });
      }
    }
    const foliage = query.get("foliage") ?? "matte";
    const foliageOptions = foliage === "double" ? { roughness: 0.85, doubleSided: true } : foliage === "single" ? { roughness: 0.85 } : { roughness: 1, metallic: 0, specular: 0.05 };
    scatter("palm", "palms", palms, foliageOptions);
    scatter("pine", "pines", pines, foliageOptions);
  }
  if (look.style === "coast" || look.style === "canyon") {
    const sign = (look.seaSide * -1) as -1 | 1;
    const kind = look.style === "coast" ? "hills" : "cliff";
    const rocks: { p: Vec3; yaw: number; size: Vec3 }[] = [];
    for (let s = 60; s < level.length; s += 41) {
      const r = (n: number): number => hash2(Math.floor(s) + n * 29, n + 5, seed + 707);
      if (r(1) < 0.3) continue;
      const d = 4 + r(2) * 20;
      const [x, , z] = roadPoint(level, s + r(3) * 20, sign * (level.width + d), 0);
      const h = 2.5 + r(4) * 5;
      rocks.push({ p: [x, flankY(level, look, sign, kind, seed + 101, s + r(3) * 20, d) - 0.4, z], yaw: r(5) * Math.PI * 2, size: [h * (0.9 + r(6) * 0.5), h, h * (0.9 + r(7) * 0.5)] });
    }
    scatter("boulders", "boulders", rocks, { roughness: 0.95 });
  }

  /* ---- ocean ---- */
  const mid = roadPoint(level, level.length / 2, 0, 0);
  builder.add(primitives.plane({ name: "water", position: [mid[0], 0, mid[2]], size: 9000, material: material.custom(waterSpec(look)) }));

  /* ---- relay gates, data cells, hazards ---- */
  const gateMat = () => material.custom(solidSpec(look, hexLinear(0x2ad6ff), hexLinear(0x2ad6ff), 1.8, 0.4));
  level.gates.forEach((g, i) => {
    const psi = -roadProfile(level, g.s).heading;
    const base = roadPoint(level, g.s, 0, 0);
    for (const side of [-1, 1]) {
      const p = roadPoint(level, g.s, side * (width - 0.4), 6);
      builder.add(primitives.box({ name: `gate-post-${i}-${side}`, position: p, rotation: [0, psi, 0], size: [0.7, 12, 0.7], material: gateMat(), castShadow: false }));
    }
    builder.add(primitives.box({ name: `gate-bar-${i}`, position: [base[0], base[1] + 12, base[2]], rotation: [0, psi, 0], size: [width * 2, 0.6, 0.6], material: gateMat(), castShadow: false }));
  });
  level.cells.forEach((c, i) => {
    const p = roadPoint(level, c.s, c.l, c.h);
    builder.add(primitives.sphere({ name: `cell-${i}`, position: p, size: 1.7, material: material.custom(solidSpec(look, hexLinear(0xf3b548), hexLinear(0xffa31a), 4.2, 0.35, 0.3)), castShadow: false }).runtime({ id: `cell-${i}` }));
  });
  level.hazards.forEach((h, i) => {
    const tall = h.type === "vent";
    builder.add(primitives.cylinder({
      name: `hazard-${i}`, position: roadPoint(level, h.s, h.l, tall ? 2.5 : 0.8), size: [h.r * 2, tall ? 5 : 1.6, h.r * 2],
      material: material.custom(solidSpec(look, hexLinear(tall ? 0x6fe4e6 : 0xe34a3a), hexLinear(tall ? 0x6fe4e6 : 0xe34a3a), tall ? 1.0 : 0.6, 0.45)),
      castShadow: false
    }));
  });

  /* ---- vehicles: baked cars (one batched mesh per material group) + box rigs ---- */
  const layout = levelLayout(level);
  const defs: VehicleDef[] = [];
  const addDef = (piece: string, variant: number): number => {
    const idx = defs.length;
    const meshy = meshyFor(piece, idx);
    const car = meshy ? null : carFor(piece, idx);
    defs.push({ piece, variant, car, meshy, colour: car ? CAR_COLOURS[(idx * 7 + piece.length) % CAR_COLOURS.length]! : (RIG_COLOURS[piece] ?? "#cccccc") });
    return idx;
  };
  const lineupDefs = layout.vehicles.map((v) => addDef(v.piece, v.v));
  const trafficDefs = level.traffic.map((t) => addDef(t.piece, t.v || 0));

  const usedCars = new Set<CarKey>();
  for (const d of defs) if (d.car) usedCars.add(d.car);
  const carCount = defs.filter((d) => d.car).length;
  const meshyKeys = [...new Set(defs.flatMap((d) => (d.meshy ? [d.meshy] : [])))];
  const groupHandles = new Map<CarGroup, { mesh: ReturnType<typeof batched.mesh>; geo: Map<CarKey, number> }>();
  const groupMaterial = (g: CarGroup) => {
    switch (g) {
      case "paint": return material.carPaint({ color: "#ffffff", roughness: 0.3, metallic: 0.55 });
      case "trim": return material.pbr({ color: "#16181d", roughness: 0.62, metallic: 0.35 });
      case "glass": return material.pbr({ color: "#0a1119", roughness: 0.06, metallic: 0.95 });
      case "head": return material.pbr({ color: "#fff6dc", roughness: 0.2, emissive: "#fff2c8", emissiveIntensity: 5 });
      case "tail": return material.pbr({ color: "#4a0508", roughness: 0.3, emissive: "#ff1a10", emissiveIntensity: 4 });
    }
  };
  let geometryTotal = 0;
  for (const g of CAR_GROUPS) {
    let vertices = 0, indices = 0;
    for (const car of usedCars) { const data = carGroup(car, g); if (data) { vertices += data.positions.length / 3; indices += data.indices.length; } }
    if (!vertices) continue;
    const mesh = batched.mesh({ name: `vehicles-${g}`, maxInstances: carCount + 8, maxVertices: vertices + 64, maxIndices: indices + 64, material: groupMaterial(g) });
    const geo = new Map<CarKey, number>();
    for (const car of usedCars) {
      const data = carGroup(car, g);
      if (!data) continue;
      geo.set(car, mesh.addGeometry(geometry.dynamic({ positions: data.positions, normals: data.normals, uvs: new Float32Array((data.positions.length / 3) * 2), indices: data.indices })));
      geometryTotal++;
    }
    builder.add(mesh);
    groupHandles.set(g, { mesh, geo });
  }
  /* generated vehicles: one textured batched mesh per model (each model carries its own texture, one material per batched mesh) */
  const meshyBatches = new Map<string, { mesh: ReturnType<typeof batched.mesh>; geo: number }>();
  for (const key of meshyKeys) {
    const data = meshyGeometry(key)!;
    const count = defs.filter((d) => d.meshy === key).length;
    const mesh = batched.mesh({ name: `vehicles-${key}`, maxInstances: count + 8, maxVertices: data.positions.length / 3 + 64, maxIndices: data.indices.length + 64, material: meshyMaterial(key, { roughness: 0.5, metallic: 0.12 }) });
    const geo = mesh.addGeometry(geometry.dynamic({ positions: data.positions, normals: data.normals, uvs: data.uvs, indices: data.indices }));
    meshyBatches.set(key, { mesh, geo });
    builder.add(mesh);
    geometryTotal++;
  }
  const rigDefs = defs.filter((d) => !d.car && !d.meshy);
  const rigDetail = new Map<VehicleDef, ReturnType<typeof rigParts>>();
  rigDefs.forEach((d, i) => rigDetail.set(d, rigParts(d.piece, pieceSpec(d.piece, d.variant)!.boxes, d.colour, CAB_COLOURS[i % CAB_COLOURS.length]!)));
  const rigPartTotal = [...rigDetail.values()].reduce((n, r) => n + r.parts.length, 0);
  const rigs = batched.mesh({ name: "vehicles-rigs", maxInstances: rigPartTotal + 8, maxVertices: 64, maxIndices: 64, material: material.pbr({ color: "#ffffff", roughness: 0.52, metallic: 0.15 }) });
  const rigGeo = rigs.addGeometry("box");
  geometryTotal++;
  builder.add(rigs);
  const rigLights = batched.mesh({ name: "vehicles-rig-lights", maxInstances: rigDefs.length * 2 + 8, maxVertices: 64, maxIndices: 64, material: groupMaterial("tail") });
  const rigLightGeo = rigLights.addGeometry("box");
  geometryTotal++;
  builder.add(rigLights);
  const rigHeads = batched.mesh({ name: "vehicles-rig-heads", maxInstances: rigDefs.length * 2 + 8, maxVertices: 64, maxIndices: 64, material: groupMaterial("head") });
  const rigHeadGeo = rigHeads.addGeometry("box");
  geometryTotal++;
  builder.add(rigHeads);

  interface Slot { readonly mesh: SlotMesh; readonly slot: number; readonly box: LocalBox; readonly size: Vec3 }
  const slotsFor = (def: VehicleDef): Slot[] => {
    const slots: Slot[] = [];
    if (def.meshy) {
      const handle = meshyBatches.get(def.meshy)!;
      slots.push({ mesh: handle.mesh, slot: handle.mesh.addInstance(handle.geo), box: unionBox(pieceSpec(def.piece, def.variant)!.boxes), size: [0, 0, 0] });
    } else if (def.car) {
      const box = unionBox(pieceSpec(def.piece, def.variant)!.boxes);
      for (const g of CAR_GROUPS) {
        const handle = groupHandles.get(g);
        const geo = handle?.geo.get(def.car);
        if (!handle || geo === undefined) continue;
        const slot = handle.mesh.addInstance(geo);
        if (g === "paint") handle.mesh.setColorAt(slot, def.colour);
        slots.push({ mesh: handle.mesh, slot, box, size: [0, 0, 0] });
      }
    } else {
      const detail = rigDetail.get(def) ?? rigParts(def.piece, pieceSpec(def.piece, def.variant)!.boxes, def.colour, CAB_COLOURS[0]!);
      for (const part of detail.parts) {
        const slot = rigs.addInstance(rigGeo);
        rigs.setColorAt(slot, part.colour);
        slots.push({ mesh: rigs, slot, box: part.box, size: [0, 0, 0] });
      }
      for (const b of detail.tails) slots.push({ mesh: rigLights, slot: rigLights.addInstance(rigLightGeo), box: b, size: [0, 0, 0] });
      for (const b of detail.heads) slots.push({ mesh: rigHeads, slot: rigHeads.addInstance(rigHeadGeo), box: b, size: [0, 0, 0] });
    }
    return slots;
  };
  const lineupSlots = lineupDefs.map((di) => slotsFor(defs[di]!));
  const trafficSlots = trafficDefs.map((di) => slotsFor(defs[di]!));
  const slotTotal = [...lineupSlots, ...trafficSlots].reduce((n, s) => n + s.length, 0);

  /* ---- the Roadster: baked sports car in five material groups ---- */
  const nativeSize = meshyPlayer ? meshySize("roadster") : carNativeSize("sportsCar");
  const playerIds: string[] = [];
  const playerHeight = nativeSize[1] * PLAYER_SCALE;
  const playerPaint = material.carPaint({ color: "#232932", roughness: 0.26, metallic: 0.7 });
  if (meshyPlayer) {
    playerIds.push("car-body");
  } else {
    for (const g of CAR_GROUPS) {
      const data = carGroup("sportsCar", g);
      if (!data) continue;
      builder.add(geometry.custom(
        geometry.dynamic({ positions: data.positions, normals: data.normals, uvs: new Float32Array((data.positions.length / 3) * 2), indices: data.indices }),
        { name: `car-${g}`, material: g === "paint" ? playerPaint : groupMaterial(g) }
      ).runtime({ id: `car-${g}` }));
      playerIds.push(`car-${g}`);
    }
  }

  /* ---- headlight beams (additive cones, same transform as the car) and particle emitters ---- */
  const lampX = (nativeSize[0] * PLAYER_SCALE) / 2 - 0.4, lampY = -playerHeight * 0.18, lampZ = -(nativeSize[2] * PLAYER_SCALE) / 2 + 0.1;
  const beamDir: Vec3 = [0, -0.05, -1];
  for (const sx of [-1, 1]) {
    builder.add(geometry.custom(dyn(beamCone([sx * lampX, lampY, lampZ], beamDir, 38, 4.2)), { name: `beam-${sx}`, material: material.custom(beamSpec(look.beam * 0.2)) }).runtime({ id: `beam-${sx}` }));
  }
  const plumeGeometry = (count: number, salt: number) => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) p[i * 3 + c] = (hash2(i, c + salt * 7, seed) - 0.5) * 20000;
    return geometry.dynamic({ positions: p, topology: "points" });
  };
  const dustColour = DUST_COLOUR[look.style] ?? [0.78, 0.76, 0.72];
  builder.add(geometry.custom(plumeGeometry(260, 1), {
    name: "plume-dust",
    material: material.custom(plumeSpec({ color: dustColour, alpha: 1, life: [0.9, 1.9], size: [1.4, 6.5], width: 2.0, spread: 2.0, lift: 1.1, trail: 0.85, glow: 0, additive: false }))
  }).runtime({ id: "plume-dust" }));
  builder.add(geometry.custom(plumeGeometry(160, 2), {
    name: "plume-sparks",
    material: material.custom(plumeSpec({ color: [1, 0.62, 0.22], alpha: 1, life: [0.25, 0.6], size: [0.2, 0.06], width: 0.5, spread: 1.4, lift: 0.7, trail: 0.7, glow: 1, additive: true }))
  }).runtime({ id: "plume-sparks" }));

  return {
    scene: builder,
    level,
    look,
    vehicleCount: defs.length,
    vehicleSlots: slotTotal,
    vehicleGeometries: geometryTotal,
    vehicleMeshes: groupHandles.size + meshyBatches.size + 3,
    texturedNodes: meshyBatches.size + (meshyPlayer ? 1 : 0) + texturedScenery,
    bind(app: AuraApp): WorldRuntime {
      const camCtl = app.camera;
      // Framed mode: the director smooths the road-frame offsets and supplies shake and kicks; the rig only applies fov
      // smoothing and the cut flag (audit C7).
      const chase = cameras.chase({ lag: { fov: 4 } });
      const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
      const scratch = new Float32Array(16);
      if (!camCtl) throw new Error("roadster-hours-port: the app exposes no camera controller");
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
      const parts = playerIds.map((id) => node(id));
      const sky = node("sky");
      const roadNode = node("road");
      const cells = level.cells.map((_c, i) => node(`cell-${i}`));
      const slope = (s: number): number => Math.sqrt(1 + roadProfile(level, s).dx ** 2);
      const scaleVec: Vec3 = [nativeSize[0] * PLAYER_SCALE, nativeSize[1] * PLAYER_SCALE, nativeSize[2] * PLAYER_SCALE];
      const beams = [-1, 1].map((sx) => node(`beam-${sx}`));
      const dust = node("plume-dust"), sparks = node("plume-sparks");
      let dustAmount = 0, sparkAmount = 0;
      for (const part of parts) part.setScale(scaleVec);

      const writeVehicle = (slot: Slot, s: number, l: number, yaw: number): void => {
        const b = slot.box;
        const cx = (b.min[0]! + b.max[0]!) / 2, cy = (b.min[1]! + b.max[1]!) / 2, cz = (b.min[2]! + b.max[2]!) / 2;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        const lat = cx * c + cz * sn;
        const lon = (cx * sn - cz * c) / slope(s);
        const heading = roadProfile(level, s + lon).heading;
        const centre = roadPoint(level, s + lon, l + lat, cy);
        slot.size[0] = b.max[0]! - b.min[0]!; slot.size[1] = b.max[1]! - b.min[1]!; slot.size[2] = b.max[2]! - b.min[2]!;
        slot.mesh.setMatrixAt(slot.slot, matrixFor(yaw - heading, centre, slot.size, scratch));
      };
      const placeLineup = (): void => {
        layout.vehicles.forEach((v, vi) => { for (const slot of lineupSlots[vi]!) writeVehicle(slot, v.s, v.l, v.yaw); });
      };
      placeLineup();

      const allSlots = [...lineupSlots.flat(), ...trafficSlots.flat()];
      const offCentre = 0;
      return {
        vehicleInstances: allSlots.length,
        reset: () => { placeLineup(); director.cut(); chase.reset(); },
        setReducedMotion: (on: boolean) => director.setReducedMotion(on),
        probeBatchedDraws() {
          const draws = (): number => { app.step(0); return app.diagnostics().drawCalls ?? 0; };
          for (const s of allSlots) s.mesh.setVisibleAt(s.slot, false);
          const hidden = draws();
          for (const s of allSlots) s.mesh.setVisibleAt(s.slot, true);
          const visible = draws();
          const features = (app.diagnostics() as unknown as { compiledFeatures?: readonly string[] }).compiledFeatures ?? [];
          return { hidden, visible, delta: visible - hidden, instances: allSlots.length, texturedInstances: allSlots.filter((s) => [...meshyBatches.values()].some((b) => b.mesh === s.mesh)).length, batchedGeometries: geometryTotal, geometries: geometryTotal, features: features.map(String) };
        },
        batching: () => ((app.diagnostics() as unknown as Record<string, unknown>)["renderer.batching"] as Record<string, unknown> | undefined) ?? null,
        update(run: Run, dt: number, time: number, aspect: number, events: readonly SimEvent[] = []): void {
          const prof = roadProfile(level, run.s);
          const psi = -(prof.heading + run.theta) + run.spin;
          const pitch = run.flip;
          const carP = roadPoint(level, run.s, run.l, run.h + playerHeight / 2 + 0.03);
          const rollAngle = run.roll + prof.bank;
          for (const part of parts) { part.setPosition(carP[0], carP[1], carP[2]); part.setRotation(pitch, psi, rollAngle); }
          const racing = run.phase === "running" || run.phase === "countdown";
          for (const beam of beams) { beam.setPosition(carP[0], carP[1], carP[2]); beam.setRotation(pitch, psi, rollAngle); beam.setVisible(racing); }
          const trailDir: Vec3 = [Math.sin(psi), 0, Math.cos(psi)];
          const rear = roadPoint(level, run.s - 2.1, run.l, run.h + 0.3);
          const rolling = run.phase === "running";
          const wantDust = rolling ? (run.grounded ? clampUnit((run.v - 6) / 60) * (run.drifting ? 1.9 : 0.95) : 0.5) : 0;
          dustAmount += (wantDust - dustAmount) * Math.min(1, dt * 6);
          dust.setUniform?.("ptPos", rear); dust.setUniform?.("ptBack", trailDir); dust.setUniform?.("ptSpeed", run.v); dust.setUniform?.("ptAmount", dustAmount);
          const burning = rolling && (run.boosting || run.nitro > 0);
          const scraping = rolling && run.scraping;
          const wantSparks = burning ? 1 : scraping ? 0.9 : 0;
          sparkAmount += (wantSparks - sparkAmount) * Math.min(1, dt * 12);
          const wall = roadPoint(level, run.s, run.l + (run.l >= 0 ? 1.1 : -1.1), run.h + 0.35);
          const sparkAt = scraping && !burning ? wall : [rear[0], rear[1] + 0.2, rear[2]];
          sparks.setUniform?.("ptPos", sparkAt); sparks.setUniform?.("ptBack", trailDir); sparks.setUniform?.("ptSpeed", run.v); sparks.setUniform?.("ptAmount", sparkAmount);
          for (let i = 0; i < cells.length; i++) cells[i]!.setVisible(!run.cells.has(i));
          for (let ci = 0; ci < trafficSlots.length; ci++) {
            const car = run.traffic[ci]!;
            for (const slot of trafficSlots[ci]!) writeVehicle(slot, car.s, car.l, 0);
          }
          // headlight pool on the road follows the car
          roadNode.setUniform?.("carPos", [carP[0], carP[1], carP[2]]);
          roadNode.setUniform?.("carDir", [-Math.sin(psi), -Math.cos(psi)]);
          // chase camera: the arc position follows exactly; lateral offset, height and fov are smoothed on the road frame
          const cam = director.step(run, events, dt);
          const back = 8.5 + (run.v / 74) * 1.6;
          const eyeS = run.s - back;
          const eye = roadPoint(level, eyeS, cam.eyeL + offCentre, cam.eyeH);
          const look2 = roadPoint(level, run.s + 12 + (run.v / 74) * 5, cam.lookL, cam.lookH);
          void time;
          // shake offset along the road's lateral axis at the eye (the same axis `roadPoint` uses) and world up
          const dx = roadProfile(level, eyeS).dx, inv = 1 / Math.sqrt(1 + dx * dx);
          const shake: [number, number, number] = [cam.shakeRight * inv, cam.shakeUp, cam.shakeRight * dx * inv];
          const pose = chase.step({ wantEye: [eye[0], eye[1], eye[2]], wantLook: [look2[0], look2[1], look2[2]], fovTarget: (aspect < 1 ? 70 : 58) + cam.fovKick, cut: cam.cut, shakeOffset: shake }, dt);
          sky.setPosition(pose.eye[0], pose.eye[1], pose.eye[2]);
          camCtl.setPose({ position: pose.eye, target: pose.look, up: [0, 1, 0], fov: pose.fov }, { cut: pose.cut });
        }
      };
    }
  };
}

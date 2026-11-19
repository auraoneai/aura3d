/**
 * Slingshot Siege — six chapters, thirty levels.
 *
 * Fortresses are procedurally assembled from material pieces over a handful of
 * recipes (towers, walls, arches, pyramids, keeps, perches). Deterministic:
 * every recipe is a pure function of level index, so demo runs and captures
 * see identical layouts.
 *
 * Layout frame: the slingshot sits at x ≈ -7.4; the fortress occupies
 * x ∈ [4.5, 11]; gulls perch on or inside the structures. Gravity is Earth
 * normal except Moon Roost (chapter 5 → low-g + ambient slow-mo).
 */
import type { AmmoId } from "./ammo";
import type { SiegeMaterialId } from "./materials";
import { DECOR_COLLIDERS } from "./decorLayout";
import { groundTopAt } from "./ground";

export interface PieceSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Half extents. */
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly material: SiegeMaterialId;
  /** Yaw for angled walls/planks. */
  readonly yaw?: number;
  /** Visual style — primitive block, or a typed GLB prop that also collides. */
  readonly visual?: "block" | "crate" | "barrel" | "plank";
  /** Fixed-joint this piece to the piece at this index (snaps over jointStrength). */
  readonly jointTo?: number;
}

export interface GullSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** "perched" sits on structure, "tucked" starts inside a pocket. */
  readonly perch: "perched" | "tucked";
}

export interface WindmillSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bladeLength: number;
  readonly motorSpeed: number;
}

/** A chapter's name and map chip. Its look (sky, sun, fog, grade, island palette) is the GU47 look table in look.ts. */
export interface ChapterDef {
  readonly id: number;
  readonly name: string;
  readonly tagline: string;
  readonly chipColor: string;
}

export interface LevelSpec {
  readonly id: number;
  readonly chapter: number;
  readonly slot: number;
  readonly name: string;
  readonly ammo: readonly AmmoId[];
  readonly pieces: readonly PieceSpec[];
  readonly gulls: readonly GullSpec[];
  readonly windmills: readonly WindmillSpec[];
  readonly stars: readonly [number, number, number];
  readonly gravity?: readonly [number, number, number];
  /** Ambient slow-motion factor (Moon Roost). */
  readonly timeScale?: number;
  readonly par?: number;
}

// ---------------------------------------------------------------- helpers --

type V3 = readonly [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function tower(
  cx: number, cz: number,
  cols: number, rows: number,
  block: { w: number; h: number; d: number },
  mat: SiegeMaterialId,
  out: PieceSpec[] = []
): PieceSpec[] {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = cx + (c - (cols - 1) / 2) * (block.w + 0.015);
      out.push({
        x, y: block.h / 2 + r * (block.h + 0.015), z: cz,
        hx: block.w / 2, hy: block.h / 2, hz: block.d / 2,
        material: mat
      });
    }
  }
  return out;
}

function wall(
  cx: number, cz: number, length: number, rows: number,
  mat: SiegeMaterialId, yaw = 0,
  out: PieceSpec[] = []
): PieceSpec[] {
  const seg = 0.62;
  const n = Math.max(2, Math.round(length / seg));
  for (let r = 0; r < rows; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const lx = (i - (n - 1) / 2) * seg + (r % 2 === 1 ? seg / 2 : 0);
      out.push({
        x: cx + Math.cos(yaw) * lx,
        y: 0.14 + r * 0.3,
        z: cz + Math.sin(yaw) * lx,
        hx: seg / 2 - 0.005, hy: 0.14, hz: 0.16,
        // The segments run along (cos yaw, sin yaw) in x/z; the engine's +Y yaw turns a box's local +x to
        // (cos, -sin), so the box takes the opposite yaw to lie along its own wall line (with +yaw the blocks were
        // turned across the line and their corners overlapped, which blew angled walls apart on load).
        material: mat, ...(yaw !== 0 ? { yaw: -yaw } : {})
      });
    }
  }
  return out;
}

function lintel(
  cx: number, cy: number, cz: number, length: number, mat: SiegeMaterialId,
  yaw = 0, out: PieceSpec[] = []
): PieceSpec[] {
  out.push({
    x: cx, y: cy, z: cz,
    hx: length / 2, hy: 0.11, hz: 0.24,
    material: mat, yaw, visual: "plank"
  });
  return out;
}

function pyramid(cx: number, cz: number, base: number, mat: SiegeMaterialId, out: PieceSpec[] = []): PieceSpec[] {
  const block = { w: 0.7, h: 0.34, d: 0.7 };
  for (let r = 0; r < base; r += 1) {
    const n = base - r;
    for (let i = 0; i < n; i += 1) {
      out.push({
        x: cx + (i - (n - 1) / 2) * (block.w + 0.02),
        y: block.h / 2 + r * (block.h + 0.02),
        z: cz,
        hx: block.w / 2, hy: block.h / 2, hz: block.d / 2,
        material: mat
      });
    }
  }
  return out;
}

function crateAt(x: number, z: number, mat: SiegeMaterialId = "wood", out: PieceSpec[] = []): PieceSpec[] {
  out.push({ x, y: 0.3, z, hx: 0.3, hy: 0.3, hz: 0.3, material: mat, visual: "crate" });
  return out;
}

function barrelAt(x: number, z: number, out: PieceSpec[] = []): PieceSpec[] {
  out.push({ x, y: 0.34, z, hx: 0.24, hy: 0.34, hz: 0.24, material: "wood", visual: "barrel" });
  return out;
}

/** Tall keep: two legs + a lintel, optionally a flag pole socket. */
function keep(cx: number, cz: number, height: number, mat: SiegeMaterialId, out: PieceSpec[] = []): PieceSpec[] {
  const rows = Math.ceil(height / 0.46);
  tower(cx - 0.55, cz, 1, rows, { w: 0.5, h: 0.46, d: 0.5 }, mat, out);
  tower(cx + 0.55, cz, 1, rows, { w: 0.5, h: 0.46, d: 0.5 }, mat, out);
  // The plank rests on the legs' real top (rows of 0.46 m + 0.015 m joints), not on the nominal `height`: the
  // rounded-up legs stood up to 0.36 m into the plank and the overlap blew the keep apart on load.
  const legTop = rows * 0.46 + (rows - 1) * 0.015;
  out.push({
    x: cx, y: legTop + 0.122, z: cz,
    hx: 0.95, hy: 0.12, hz: 0.5, material: mat, visual: "plank"
  });
  return out;
}

// ---------------------------------------------------------------- chapters --

export const CHAPTERS: readonly ChapterDef[] = [
  {
    id: 0, name: "Driftwood Cove", tagline: "Splinter the driftwood forts",
    chipColor: "#ffb35c"
  },
  {
    id: 1, name: "Quarry Rise", tagline: "Crack the quarry stacks",
    chipColor: "#9fb2c8"
  },
  {
    id: 2, name: "Greenhouse Perch", tagline: "Shatter the glass roosts",
    chipColor: "#8fe0b0"
  },
  {
    id: 3, name: "Windmill Gap", tagline: "Dodge the turning blades",
    chipColor: "#ffd166"
  },
  {
    id: 4, name: "Gull Keep", tagline: "Siege the gull king's castle",
    chipColor: "#ff8c69"
  },
  {
    id: 5, name: "Moon Roost", tagline: "Low-gravity lunar siege",
    chipColor: "#b0a8ff"
  }
];

// ------------------------------------------------------------------ levels --

interface LevelDraft {
  name: string;
  ammo: readonly AmmoId[];
  pieces: PieceSpec[];
  gulls: GullSpec[];
  windmills?: WindmillSpec[];
  stars?: [number, number, number];
  par?: number;
}

function finalize(chapter: number, slot: number, draft: LevelDraft): LevelSpec {
  const settled = settleLayout(draft.pieces, draft.gulls);
  draft = { ...draft, pieces: settled.pieces, gulls: settled.gulls };
  const gullScore = draft.gulls.length * 1000;
  const pieceScore = draft.pieces.reduce((sum, p) => {
    const values: Record<SiegeMaterialId, number> = { wood: 40, stone: 90, glass: 60, ice: 80, obsidian: 140 };
    return sum + values[p.material];
  }, 0);
  const stars: [number, number, number] = draft.stars ?? [
    Math.round(gullScore * 0.4 + pieceScore * 0.08),
    Math.round(gullScore + pieceScore * 0.22),
    Math.round(gullScore + pieceScore * 0.5)
  ];
  return {
    id: chapter * 5 + slot,
    chapter, slot,
    name: draft.name,
    ammo: draft.ammo,
    pieces: draft.pieces,
    gulls: draft.gulls,
    windmills: draft.windmills ?? [],
    stars,
    par: draft.par ?? draft.ammo.length,
    ...(chapter === 5 ? { gravity: [0, -3.4, 0] as const, timeScale: 0.85 } : {})
  };
}

// ------------------------------------------------------------ layout settle --
//
// Stability pass (real-GPU audit 2026-11-19: forts collapsed on their own on load). The recipes place blocks by
// formula and some placements interpenetrated: lintels sunk 1-5 cm into tower tops, crates and barrels dropped inside
// wall rows, two walls laid over each other, gulls embedded in blocks. Rapier resolves an overlap with a violent
// separation impulse, which read as a hit, broke pieces and toppled the fort before the first shot. Every level now
// goes through `settleLayout`, so each piece spawns resting on what is under it and nothing overlaps
// (tests/unit/slingshot-siege/fort-stability.test.ts).

/** World half extents of a piece (yaw about +Y included). */
function extents(p: PieceSpec): [number, number, number] {
  const c = Math.abs(Math.cos(p.yaw ?? 0));
  const sn = Math.abs(Math.sin(p.yaw ?? 0));
  return [c * p.hx + sn * p.hz, p.hy, sn * p.hx + c * p.hz];
}

/** Separating-axis overlap depth of two pieces' x/z footprints (> 0 = overlap by that much on the shallowest axis). */
export function footprintOverlap(a: PieceSpec, b: PieceSpec): number {
  const axes = (yaw: number): [number, number][] => [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]];
  const A = axes(a.yaw ?? 0), B = axes(b.yaw ?? 0);
  const r = (p: PieceSpec, X: [number, number][], ax: [number, number]): number =>
    Math.abs(X[0]![0] * ax[0] + X[0]![1] * ax[1]) * p.hx + Math.abs(X[1]![0] * ax[0] + X[1]![1] * ax[1]) * p.hz;
  let depth = Infinity;
  for (const ax of [...A, ...B]) {
    const d = Math.abs((a.x - b.x) * ax[0] + (a.z - b.z) * ax[1]);
    depth = Math.min(depth, r(a, A, ax) + r(b, B, ax) - d);
  }
  return depth;
}

/** Vertical overlap of two pieces (> 0 = their height spans overlap by that much). */
function spanOverlap(a: PieceSpec, b: PieceSpec): number {
  return Math.min(a.y + a.hy, b.y + b.hy) - Math.max(a.y - a.hy, b.y - b.hy);
}

/** 3D overlap depth of two pieces (> 0 = they interpenetrate). */
export function pieceOverlap(a: PieceSpec, b: PieceSpec): number {
  return Math.min(footprintOverlap(a, b), spanOverlap(a, b));
}

const GULL_R = 0.26;
/** Clearance (m) every fort piece keeps from the static decor colliders (tests/unit/slingshot-siege/decor-pass-through.test.ts). */
export const DECOR_CLEARANCE = 0.15;
const DECOR_BOXES: readonly PieceSpec[] = DECOR_COLLIDERS.map((d) => ({
  x: d.center[0], y: d.center[1], z: d.center[2], hx: d.half[0], hy: d.half[1], hz: d.half[2], yaw: d.yaw, material: "stone"
}));

/** Distance from a gull centre to a piece's box (yaw included). */
function gullDistance(g: { x: number; y: number; z: number }, p: PieceSpec): number {
  const yaw = p.yaw ?? 0;
  const dx = g.x - p.x, dz = g.z - p.z;
  // Into the piece's own frame (engine yaw: local +x -> world (cos, -sin)).
  const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  const ox = Math.max(0, Math.abs(lx) - p.hx), oy = Math.max(0, Math.abs(g.y - p.y) - p.hy), oz = Math.max(0, Math.abs(lz) - p.hz);
  return Math.hypot(ox, oy, oz);
}

/** True when (x, z) lies inside a piece's footprint shrunk by `inset`. */
function footprintContains(p: PieceSpec, x: number, z: number, inset = 0): boolean {
  const yaw = p.yaw ?? 0;
  const dx = x - p.x, dz = z - p.z;
  const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  return Math.abs(lx) <= p.hx - inset && Math.abs(lz) <= p.hz - inset;
}

/**
 * Resolve a recipe's raw placements into a layout that stands still on load:
 *  1. side conflicts (two pieces at the same height interpenetrating: a crate inside a wall row, two walls laid over
 *     each other) move the later piece the shortest way out along z then x (up to 1.2 m), or drop it;
 *  2. every piece, lowest first, rests exactly on the highest piece under its footprint (or the ground), 2 mm clear;
 *  3. every gull rests at the free height nearest its authored one: on the ground or on a piece top under its centre.
 */
/** Highest sim ground top under a piece's footprint (corners, edge midpoints and centre); 0 off the ground table. */
function groundUnder(p: PieceSpec): number {
  const [ex, , ez] = extents(p);
  let top: number | null = null;
  for (const fx of [-1, 0, 1]) {
    for (const fz of [-1, 0, 1]) {
      const y = groundTopAt(p.x + fx * ex, p.z + fz * ez);
      if (y !== null && (top === null || y > top)) top = y;
    }
  }
  return top ?? 0;
}
export function settleLayout(rawPieces: readonly PieceSpec[], rawGulls: readonly GullSpec[]): { pieces: PieceSpec[]; gulls: GullSpec[] } {
  // 1. Side conflicts. A vertical overlap of up to 6 cm is a stacking slip (fixed by the rest pass), not a conflict.
  //    A moved piece must also keep `DECOR_CLEARANCE` from every static decor collider.
  const kept: PieceSpec[] = [];
  const sideConflict = (p: PieceSpec): boolean =>
    kept.some((q) => footprintOverlap(p, q) > 0.004 && spanOverlap(p, q) > 0.06) ||
    DECOR_BOXES.some((d) => footprintOverlap(p, d) > -DECOR_CLEARANCE && spanOverlap(p, d) > -DECOR_CLEARANCE);
  for (const raw of rawPieces) {
    if (!sideConflict(raw)) { kept.push(raw); continue; }
    let moved: PieceSpec | null = null;
    for (let step = 1; step <= 24 && !moved; step += 1) {
      for (const [ax, sign] of [["z", 1], ["z", -1], ["x", 1], ["x", -1]] as const) {
        const cand = { ...raw, [ax]: raw[ax] + sign * step * 0.05 };
        if (!sideConflict(cand)) { moved = cand; break; }
      }
    }
    if (moved) kept.push(moved);
  }

  // 2. Rest pass, lowest bottom first: a piece rests on the pieces under it (lower centre, footprints overlapping),
  //    or on the island ground: the highest ground point under its footprint (the beach right of the turf lip slopes
  //    down to the sea, so the far end of the Gull Keep / Moon Roost walls steps down onto the sand instead of
  //    hanging ~0.2 m above it).
  const order = kept.map((p, i) => i).sort((a, b) => (kept[a]!.y - kept[a]!.hy) - (kept[b]!.y - kept[b]!.hy) || a - b);
  const placed: (PieceSpec | null)[] = kept.map(() => null);
  for (const i of order) {
    const p = kept[i]!;
    let support = groundUnder(p);
    for (const j of order) {
      const q = placed[j];
      if (!q || j === i) continue;
      if (kept[j]!.y >= p.y - 0.02) continue;
      if (footprintOverlap(p, q) <= 0.02) continue;
      support = Math.max(support, q.y + q.hy);
    }
    placed[i] = { ...p, y: Math.round((support + p.hy + 0.002) * 10000) / 10000 };
  }
  const pieces = placed as PieceSpec[];

  // 3. Gulls: candidate rest heights are the ground and every piece top under the gull's centre.
  //    A perched gull stays on the structure whenever a piece top is free.
  //    With no free height over its spot (wedged between blocks), the gull moves to the nearest free spot, 5 cm steps.
  const gulls = rawGulls.map((g) => {
    const restAt = (x: number, z: number): number | undefined => {
      const ground = GULL_R + 0.003;
      // A top supports the gull when its centre is well inside that piece's footprint, or over the joint between
      // two pieces whose tops are level (a perch on a two-column tower sits over the 1.5 cm gap).
      const tops: number[] = [];
      for (const p of pieces) {
        const top = p.y + p.hy;
        const inside = footprintContains(p, x, z, 0.03);
        const bridged = footprintContains(p, x, z, -0.05) &&
          pieces.some((q) => q !== p && Math.abs(q.y + q.hy - top) < 0.01 && footprintContains(q, x, z, -0.05));
        if (inside || bridged) tops.push(top + GULL_R + 0.003);
      }
      const isFree = (y: number): boolean => pieces.every((p) => gullDistance({ x, y, z }, p) >= GULL_R - 0.001);
      const nearest = (ys: number[]): number | undefined => ys.filter(isFree).sort((a, b) => Math.abs(a - g.y) - Math.abs(b - g.y))[0];
      return g.perch === "perched" ? nearest(tops) ?? nearest([ground]) : nearest([ground, ...tops]);
    };
    for (let ring = 0; ring <= 30; ring += 1) {
      const n = ring === 0 ? 1 : 8 * ring;
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2;
        const x = g.x + Math.cos(a) * ring * 0.05, z = g.z + Math.sin(a) * ring * 0.05;
        const y = restAt(x, z);
        if (y !== undefined) return { ...g, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, z: Math.round(z * 10000) / 10000 };
      }
    }
    return { ...g };
  });
  return { pieces, gulls };
}

const F = 7.2; // fortress center x

function buildLevels(): readonly LevelSpec[] {
  const L: LevelSpec[] = [];

  // -------------------------------------------------- ch0 Driftwood Cove --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    pieces.push({ x: F, y: 1.13, z: 0, hx: 0.85, hy: 0.1, hz: 0.8, material: "wood", visual: "plank" });
    L.push(finalize(0, 0, {
      name: "First Splinter",
      ammo: ["pebble", "pebble", "pebble"],
      pieces,
      gulls: [{ x: F, y: 1.5, z: 0, perch: "perched" }],
      par: 1
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    tower(F + 1, 0, 2, 3, { w: 0.7, h: 0.34, d: 0.7 }, "wood", pieces);
    lintel(F, 1.2, 0, 2.6, "wood", 0, pieces);
    L.push(finalize(0, 1, {
      name: "Twin Posts",
      ammo: ["pebble", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F - 1, y: 1.32, z: 0, perch: "perched" },
        { x: F + 0.9, y: 0.35, z: 0.9, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F, -1.1, 3.2, 3, "wood", 0, pieces);
    tower(F + 1.8, 0.4, 2, 3, { w: 0.66, h: 0.34, d: 0.66 }, "wood", pieces);
    crateAt(F - 0.6, 0.9, "wood", pieces);
    L.push(finalize(0, 2, {
      name: "Crate Shelter",
      ammo: ["pebble", "triple", "stone"],
      pieces,
      gulls: [
        { x: F, y: 1.05, z: -1.1, perch: "perched" },
        { x: F + 1.8, y: 1.2, z: 0.4, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F, -0.6, 4, "wood", pieces);
    tower(F + 2.4, 0.9, 2, 4, { w: 0.6, h: 0.34, d: 0.6 }, "wood", pieces);
    barrelAt(F - 2, 1.2, pieces);
    L.push(finalize(0, 3, {
      name: "Driftwood Pyramid",
      ammo: ["pebble", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 1.55, z: -0.6, perch: "perched" },
        { x: F - 0.7, y: 0.75, z: -0.6, perch: "tucked" },
        { x: F + 2.4, y: 1.55, z: 0.9, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.4, -0.4, 1.7, "wood", pieces);
    keep(F + 1.4, 0.5, 1.4, "wood", pieces);
    wall(F, 1.8, 2.4, 2, "wood", 0, pieces);
    crateAt(F, -0.4, "wood", pieces);
    L.push(finalize(0, 4, {
      name: "Cove Keep",
      ammo: ["stone", "pebble", "triple", "squid"],
      pieces,
      gulls: [
        { x: F - 1.4, y: 2.15, z: -0.4, perch: "perched" },
        { x: F + 1.4, y: 1.75, z: 0.5, perch: "perched" },
        { x: F, y: 0.75, z: -0.4, perch: "tucked" }
      ]
    }));
  }

  // --------------------------------------------------- ch1 Quarry Rise ----
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 4, { w: 0.72, h: 0.36, d: 0.72 }, "stone", pieces);
    lintel(F, 1.58, 0, 1.9, "wood", 0, pieces);
    L.push(finalize(1, 0, {
      name: "Bedrock",
      ammo: ["stone", "pebble", "stone"],
      pieces,
      gulls: [{ x: F, y: 1.92, z: 0, perch: "perched" }, { x: F - 0.8, y: 0.4, z: 0.8, perch: "tucked" }],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.3, 0, 2, 4, { w: 0.7, h: 0.36, d: 0.7 }, "stone", pieces);
    tower(F + 1.3, 0, 2, 3, { w: 0.7, h: 0.36, d: 0.7 }, "wood", pieces);
    lintel(F, 1.55, 0, 3.4, "stone", 0, pieces);
    L.push(finalize(1, 1, {
      name: "Quarry Gate",
      ammo: ["stone", "squid", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.3, y: 1.62, z: 0, perch: "perched" },
        { x: F, y: 0.8, z: 0, perch: "tucked" },
        { x: F + 1.3, y: 1.25, z: 0, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 0.8, -0.9, 3.4, 4, "stone", 0.18, pieces);
    wall(F + 1.2, 0.9, 2.6, 3, "stone", -0.3, pieces);
    crateAt(F - 0.4, 0.6, "wood", pieces);
    barrelAt(F + 0.2, -0.2, pieces);
    L.push(finalize(1, 2, {
      name: "Cross Walls",
      ammo: ["stone", "triple", "stone", "squid"],
      pieces,
      gulls: [
        { x: F - 0.8, y: 1.35, z: -0.9, perch: "perched" },
        { x: F + 1.2, y: 1.05, z: 0.9, perch: "perched" },
        { x: F + 0.2, y: 0.45, z: -0.2, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.6, -0.8, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    tower(F + 1.6, 0.8, 2, 4, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    pyramid(F, 0.1, 3, "wood", pieces);
    L.push(finalize(1, 3, {
      name: "Split Quarry",
      ammo: ["squid", "stone", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.95, z: -0.8, perch: "perched" },
        { x: F + 1.6, y: 1.6, z: 0.8, perch: "perched" },
        { x: F, y: 0.5, z: 0.1, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.8, -0.9, 2.2, "stone", pieces);
    keep(F + 1.8, 0.9, 1.9, "stone", pieces);
    wall(F, 0, 4.6, 3, "stone", Math.PI / 2, pieces);
    barrelAt(F, 1.8, pieces);
    crateAt(F, -1.8, "wood", pieces);
    L.push(finalize(1, 4, {
      name: "Quarry Keep",
      ammo: ["stone", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.8, y: 2.6, z: -0.9, perch: "perched" },
        { x: F + 1.8, y: 2.3, z: 0.9, perch: "perched" },
        { x: F, y: 1.0, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 1.8, perch: "perched" }
      ]
    }));
  }

  // ----------------------------------------------- ch2 Greenhouse Perch ---
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 3, 3, { w: 0.6, h: 0.3, d: 0.6 }, "glass", pieces);
    lintel(F, 1.0, 0, 2.2, "wood", 0, pieces);
    L.push(finalize(2, 0, {
      name: "Glasshouse",
      ammo: ["pebble", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 1.3, z: 0, perch: "perched" },
        { x: F - 0.6, y: 0.45, z: 0, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1, 0, 2.6, 4, "glass", 0, pieces);
    wall(F + 1, 0, 2.6, 4, "glass", 0, pieces);
    lintel(F, 1.3, 0, 2.8, "wood", 0, pieces);
    crateAt(F, 0.8, "wood", pieces);
    L.push(finalize(2, 1, {
      name: "Twin Panes",
      ammo: ["ember", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1, y: 1.35, z: 0, perch: "perched" },
        { x: F + 1, y: 1.35, z: 0, perch: "perched" },
        { x: F, y: 0.5, z: 0.8, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F - 0.6, -0.4, 4, "glass", pieces);
    tower(F + 1.9, 0.7, 2, 4, { w: 0.6, h: 0.32, d: 0.6 }, "glass", pieces);
    barrelAt(F - 2.1, 1.1, pieces);
    L.push(finalize(2, 2, {
      name: "Crystal Pyramid",
      ammo: ["ember", "triple", "stone", "pebble"],
      pieces,
      gulls: [
        { x: F - 0.6, y: 1.5, z: -0.4, perch: "perched" },
        { x: F - 0.95, y: 0.75, z: -0.4, perch: "tucked" },
        { x: F + 1.9, y: 1.45, z: 0.7, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.4, -0.6, 1.9, "glass", pieces);
    keep(F + 1.4, 0.6, 1.6, "wood", pieces);
    wall(F, 1.7, 2.8, 2, "glass", 0, pieces);
    L.push(finalize(2, 3, {
      name: "Perch Palace",
      ammo: ["ember", "squid", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 1.4, y: 2.3, z: -0.6, perch: "perched" },
        { x: F + 1.4, y: 2.0, z: 0.6, perch: "perched" },
        { x: F, y: 0.7, z: 1.7, perch: "perched" },
        { x: F - 1.4, y: 0.7, z: -0.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.6, -1, 3.4, 4, "glass", 0.25, pieces);
    wall(F + 1.4, 0.8, 3, 4, "glass", -0.35, pieces);
    pyramid(F, 0, 3, "glass", pieces);
    crateAt(F, 1.6, "wood", pieces);
    L.push(finalize(2, 4, {
      name: "Grand Conservatory",
      ammo: ["ember", "stone", "squid", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.35, z: -1, perch: "perched" },
        { x: F + 1.4, y: 1.35, z: 0.8, perch: "perched" },
        { x: F, y: 1.25, z: 0, perch: "perched" },
        { x: F, y: 0.45, z: 1.6, perch: "tucked" }
      ]
    }));
  }

  // ---------------------------------------------------- ch3 Windmill Gap --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 2, 4, { w: 0.7, h: 0.36, d: 0.7 }, "wood", pieces);
    L.push(finalize(3, 0, {
      name: "First Spin",
      ammo: ["pebble", "stone", "squid"],
      pieces,
      gulls: [{ x: F, y: 1.6, z: 0, perch: "perched" }, { x: F + 1.5, y: 0.4, z: 0.7, perch: "tucked" }],
      windmills: [{ x: F, y: 2.1, z: 0, bladeLength: 1.1, motorSpeed: 1.4 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.5, -0.7, 2, 4, { w: 0.66, h: 0.35, d: 0.66 }, "wood", pieces);
    tower(F + 1.5, 0.7, 2, 3, { w: 0.66, h: 0.35, d: 0.66 }, "stone", pieces);
    crateAt(F, 0, "wood", pieces);
    L.push(finalize(3, 1, {
      name: "Mill Crossing",
      ammo: ["squid", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F - 1.5, y: 1.55, z: -0.7, perch: "perched" },
        { x: F + 1.5, y: 1.2, z: 0.7, perch: "perched" },
        { x: F, y: 0.75, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 1.9, z: 0, bladeLength: 1.35, motorSpeed: 1.8 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.2, -0.8, 3, 3, "stone", 0.2, pieces);
    wall(F + 1.4, 0.9, 2.8, 3, "wood", -0.3, pieces);
    pyramid(F + 0.2, 0, 3, "glass", pieces);
    L.push(finalize(3, 2, {
      name: "Blade Alley",
      ammo: ["ember", "stone", "triple", "squid"],
      pieces,
      gulls: [
        { x: F + 0.2, y: 1.2, z: 0, perch: "perched" },
        { x: F - 1.2, y: 1.1, z: -0.8, perch: "perched" },
        { x: F + 1.4, y: 1.05, z: 0.9, perch: "perched" }
      ],
      windmills: [{ x: F - 0.5, y: 1.8, z: 0.1, bladeLength: 1.5, motorSpeed: 2.3 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.6, -0.6, 2.0, "wood", pieces);
    keep(F + 1.6, 0.7, 1.7, "stone", pieces);
    barrelAt(F, -1.2, pieces);
    L.push(finalize(3, 3, {
      name: "Twin Mills",
      ammo: ["squid", "ember", "stone", "triple"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 2.4, z: -0.6, perch: "perched" },
        { x: F + 1.6, y: 2.1, z: 0.7, perch: "perched" },
        { x: F, y: 0.5, z: -1.2, perch: "tucked" },
        { x: F + 0.2, y: 0.4, z: 0.6, perch: "tucked" }
      ],
      windmills: [
        { x: F - 1.6, y: 2.75, z: -0.6, bladeLength: 1.2, motorSpeed: 1.6 },
        { x: F + 1.6, y: 2.4, z: 0.7, bladeLength: 1.2, motorSpeed: -1.9 }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 2, -1, 2, 5, { w: 0.64, h: 0.35, d: 0.64 }, "stone", pieces);
    tower(F + 2, 1, 2, 5, { w: 0.64, h: 0.35, d: 0.64 }, "wood", pieces);
    pyramid(F, 0, 4, "wood", pieces);
    crateAt(F - 0.5, 1.4, "wood", pieces);
    L.push(finalize(3, 4, {
      name: "Windmill Gap",
      ammo: ["ember", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 2, y: 1.95, z: -1, perch: "perched" },
        { x: F + 2, y: 1.95, z: 1, perch: "perched" },
        { x: F, y: 1.5, z: 0, perch: "perched" },
        { x: F - 0.7, y: 0.75, z: 0, perch: "tucked" },
        { x: F - 0.5, y: 0.75, z: 1.4, perch: "tucked" }
      ],
      windmills: [
        { x: F - 1, y: 2.4, z: 0.4, bladeLength: 1.6, motorSpeed: 2.1 },
        { x: F + 1, y: 2.4, z: -0.4, bladeLength: 1.6, motorSpeed: -1.7 }
      ]
    }));
  }

  // -------------------------------------------------------- ch4 Gull Keep --
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.5, -0.8, 2.1, "stone", pieces);
    keep(F + 1.5, 0.8, 2.1, "stone", pieces);
    wall(F, 0, 3.4, 2, "wood", 0, pieces);
    L.push(finalize(4, 0, {
      name: "Outer Bailey",
      ammo: ["stone", "squid", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.5, y: 2.5, z: -0.8, perch: "perched" },
        { x: F + 1.5, y: 2.5, z: 0.8, perch: "perched" },
        { x: F, y: 0.75, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 0.4, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.9, -1, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    tower(F + 1.9, 1, 2, 5, { w: 0.66, h: 0.36, d: 0.66 }, "stone", pieces);
    lintel(F, 1.9, 0, 4.4, "stone", Math.PI / 2, pieces);
    pyramid(F, 0, 3, "glass", pieces);
    crateAt(F - 0.9, 0.6, "wood", pieces);
    L.push(finalize(4, 1, {
      name: "Keep Bridge",
      ammo: ["squid", "stone", "ember", "triple"],
      pieces,
      gulls: [
        { x: F - 1.9, y: 2.0, z: -1, perch: "perched" },
        { x: F + 1.9, y: 2.0, z: 1, perch: "perched" },
        { x: F, y: 1.3, z: 0, perch: "tucked" },
        { x: F - 0.9, y: 0.75, z: 0.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F, -1.3, 4.4, 3, "stone", 0, pieces);
    wall(F, 1.3, 4.4, 3, "stone", 0, pieces);
    tower(F - 1.6, 0, 2, 4, { w: 0.64, h: 0.35, d: 0.64 }, "glass", pieces);
    tower(F + 1.6, 0, 2, 4, { w: 0.64, h: 0.35, d: 0.64 }, "glass", pieces);
    barrelAt(F, 0, pieces);
    L.push(finalize(4, 2, {
      name: "Castle Yard",
      ammo: ["ember", "squid", "stone", "triple", "pebble"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 1.55, z: 0, perch: "perched" },
        { x: F + 1.6, y: 1.55, z: 0, perch: "perched" },
        { x: F - 1, y: 1.1, z: -1.3, perch: "perched" },
        { x: F + 1, y: 1.1, z: 1.3, perch: "perched" },
        { x: F, y: 0.5, z: 0, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 2, -1, 2.4, "stone", pieces);
    keep(F + 2, 1, 2.4, "stone", pieces);
    keep(F, 0, 1.8, "wood", pieces);
    pyramid(F - 0.9, 1.2, 3, "glass", pieces);
    pyramid(F + 0.9, -1.2, 3, "glass", pieces);
    L.push(finalize(4, 3, {
      name: "Triple Crown",
      ammo: ["squid", "ember", "stone", "triple", "stone"],
      pieces,
      gulls: [
        { x: F - 2, y: 2.85, z: -1, perch: "perched" },
        { x: F + 2, y: 2.85, z: 1, perch: "perched" },
        { x: F, y: 2.2, z: 0, perch: "perched" },
        { x: F - 0.9, y: 1.3, z: 1.2, perch: "perched" },
        { x: F + 0.9, y: 1.3, z: -1.2, perch: "perched" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    // Boss fortress: ring of walls, central keep, gull king on top.
    wall(F - 1.8, -1.4, 4.2, 4, "stone", 0.15, pieces);
    wall(F + 1.8, 1.4, 4.2, 4, "stone", -0.15, pieces);
    keep(F, 0, 2.6, "stone", pieces);
    pyramid(F - 0.8, 1.5, 3, "glass", pieces);
    pyramid(F + 0.8, -1.5, 3, "glass", pieces);
    crateAt(F, 2, "wood", pieces);
    barrelAt(F, -2, pieces);
    L.push(finalize(4, 4, {
      name: "Gull Keep",
      ammo: ["squid", "ember", "stone", "triple", "stone", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 3.05, z: 0, perch: "perched" },
        { x: F - 1.8, y: 1.4, z: -1.4, perch: "perched" },
        { x: F + 1.8, y: 1.4, z: 1.4, perch: "perched" },
        { x: F - 0.8, y: 1.3, z: 1.5, perch: "perched" },
        { x: F + 0.8, y: 1.3, z: -1.5, perch: "perched" },
        { x: F, y: 0.8, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 3.4, z: 0, bladeLength: 1.5, motorSpeed: 1.5 }]
    }));
  }

  // ------------------------------------------------------- ch5 Moon Roost --
  {
    const pieces: PieceSpec[] = [];
    tower(F, 0, 3, 4, { w: 0.62, h: 0.32, d: 0.62 }, "ice", pieces);
    lintel(F, 1.4, 0, 2.2, "ice", 0, pieces);
    L.push(finalize(5, 0, {
      name: "Moonrise",
      ammo: ["ember", "pebble", "triple"],
      pieces,
      gulls: [
        { x: F, y: 1.7, z: 0, perch: "perched" },
        { x: F - 0.6, y: 0.5, z: 0, perch: "tucked" }
      ],
      par: 2
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    tower(F - 1.2, -0.6, 2, 4, { w: 0.62, h: 0.33, d: 0.62 }, "obsidian", pieces);
    tower(F + 1.2, 0.6, 2, 4, { w: 0.62, h: 0.33, d: 0.62 }, "ice", pieces);
    lintel(F, 1.45, 0, 3.0, "ice", 0, pieces);
    L.push(finalize(5, 1, {
      name: "Obsidian Twins",
      ammo: ["stone", "ember", "squid"],
      pieces,
      gulls: [
        { x: F - 1.2, y: 1.5, z: -0.6, perch: "perched" },
        { x: F + 1.2, y: 1.5, z: 0.6, perch: "perched" },
        { x: F, y: 0.6, z: 0, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    pyramid(F - 0.7, -0.5, 4, "ice", pieces);
    pyramid(F + 1.5, 0.8, 3, "obsidian", pieces);
    crateAt(F + 0.4, 1.6, "wood", pieces);
    L.push(finalize(5, 2, {
      name: "Crater Rim",
      ammo: ["ember", "triple", "squid", "stone"],
      pieces,
      gulls: [
        { x: F - 0.7, y: 1.5, z: -0.5, perch: "perched" },
        { x: F + 1.5, y: 1.2, z: 0.8, perch: "perched" },
        { x: F - 0.35, y: 0.8, z: -0.5, perch: "tucked" },
        { x: F + 0.4, y: 0.75, z: 1.6, perch: "tucked" }
      ]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    keep(F - 1.6, -0.8, 2.2, "obsidian", pieces);
    keep(F + 1.6, 0.8, 2.0, "ice", pieces);
    wall(F, 0, 3.6, 2, "ice", Math.PI / 2, pieces);
    barrelAt(F, 1.8, pieces);
    L.push(finalize(5, 3, {
      name: "Lunar Keep",
      ammo: ["squid", "ember", "stone", "triple"],
      pieces,
      gulls: [
        { x: F - 1.6, y: 2.65, z: -0.8, perch: "perched" },
        { x: F + 1.6, y: 2.45, z: 0.8, perch: "perched" },
        { x: F, y: 0.7, z: 0, perch: "tucked" },
        { x: F, y: 0.75, z: 1.8, perch: "perched" }
      ],
      windmills: [{ x: F, y: 2.9, z: 0, bladeLength: 1.4, motorSpeed: 1.2 }]
    }));
  }
  {
    const pieces: PieceSpec[] = [];
    wall(F - 1.7, -1.2, 4, 4, "obsidian", 0.2, pieces);
    wall(F + 1.7, 1.2, 4, 4, "ice", -0.2, pieces);
    keep(F, 0, 2.4, "obsidian", pieces);
    pyramid(F, 1.7, 3, "ice", pieces);
    crateAt(F - 0.6, -1.7, "wood", pieces);
    L.push(finalize(5, 4, {
      name: "Moon Roost",
      ammo: ["squid", "ember", "stone", "triple", "ember", "pebble"],
      pieces,
      gulls: [
        { x: F, y: 2.85, z: 0, perch: "perched" },
        { x: F - 1.7, y: 1.4, z: -1.2, perch: "perched" },
        { x: F + 1.7, y: 1.4, z: 1.2, perch: "perched" },
        { x: F, y: 1.25, z: 1.7, perch: "perched" },
        { x: F - 0.6, y: 0.75, z: -1.7, perch: "tucked" },
        { x: F, y: 0.7, z: 0, perch: "tucked" }
      ],
      windmills: [{ x: F, y: 3.2, z: 0, bladeLength: 1.7, motorSpeed: 1.1 }]
    }));
  }

  return L;
}

export const LEVELS: readonly LevelSpec[] = buildLevels();

export function levelById(id: number): LevelSpec {
  return LEVELS[Math.min(Math.max(0, id), LEVELS.length - 1)]!;
}

/** Star-gating: level unlocks when cumulative stars reach its gate. */
export const STAR_GATES: readonly number[] = LEVELS.map((_, i) => {
  const chapter = Math.floor(i / 5);
  const slot = i % 5;
  return chapter * 8 + Math.max(0, slot - 1) * 2;
});

/** Campaign stars only: ids outside the campaign (the Trajectory Range sandbox is 99) never count toward unlocks. */
export function totalStars(stars: Readonly<Record<number, number>>): number {
  let sum = 0;
  for (const key of Object.keys(stars)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 0 || id >= LEVELS.length) continue;
    sum += stars[id] ?? 0;
  }
  return sum;
}

export function isLevelUnlocked(id: number, stars: Readonly<Record<number, number>>): boolean {
  return id === 0 || totalStars(stars) >= (STAR_GATES[id] ?? 0);
}

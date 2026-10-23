// Roadster Hours course geometry: road profile, drivable surface, lineup layout, traffic pieces.
// Ported from the captured release (tests/fixtures/crayon/roadster-hours/PROVENANCE.md, world-BJq13QzJ.js:
// Qu, $u, od, sd, cd, fd, pd). Pure functions of the level data; no rendering.

import { LEVELS, PIECES, PIECE_POINTS, ROAD_PATHS } from "./data.js";
import type { Act, Box, Kicker, Level, PieceSpec } from "./data.js";

export { LEVELS, PIECE_POINTS };
export type { Level };

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const r = clamp((x - e0) / (e1 - e0), 0, 1);
  return r * r * (3 - 2 * r);
};

export interface RoadSample {
  x: number; y: number; z: number; dx: number; heading: number; curve: number; bank: number; ramp: number;
}

/** Road centre-line profile at arc position `s`. */
export function roadProfile(level: Level, s: number): RoadSample {
  const path = level.path ?? (level.id === "redline" ? ROAD_PATHS.redline! : ROAD_PATHS.sunbreak!);
  const w = path.wave;
  const x = Math.sin(s * w) * path.a + Math.sin(s * 13e-4) * path.b;
  const dx = Math.cos(s * w) * w * path.a + Math.cos(s * 13e-4) * 13e-4 * path.b;
  const d2x = -Math.sin(s * w) * w * w * path.a - Math.sin(s * 13e-4) * 13e-4 * 13e-4 * path.b;
  const base = path.y + Math.sin(s * 41e-4) * path.ya + Math.sin(s * 17e-4) * 5;
  let ramp = 0;
  for (const [a, b, h] of level.ramps) if (s >= a && s <= b) ramp = h * smoothstep(a, b, s);
  let bank = 0;
  for (const [a, b, h] of level.banks) if (s >= a && s <= b) bank = Math.sin(((s - a) / (b - a)) * Math.PI) ** 2 * h;
  return { x, y: base + ramp, z: -s, dx, heading: Math.atan2(dx, 1), curve: d2x / (1 + dx * dx), bank, ramp };
}

export interface SurfaceHit { height: number; shortcut: boolean; kicker?: Kicker; roof?: string }

/** Drivable surface under (s, l), or null over a gap / off the road. */
export function surfaceAt(level: Level, s: number, l = 0): SurfaceHit | null {
  if (s < 0 || s > level.length + 80) return null;
  for (const sc of level.shortcuts) if (s >= sc.start && s <= sc.end && Math.abs(l - sc.l) < 5.5) return { height: sc.height, shortcut: true };
  if (Math.abs(l) > level.width - 0.6 || level.gaps.some(([a, b]) => s > a && s < b)) return null;
  for (const lineup of level.lineups) {
    const k = lineup.kicker;
    if (s >= k.s && s <= k.s + k.len && Math.abs(l) < k.w) {
      const t = (s - k.s) / k.len;
      return { height: k.h * t * t, shortcut: false, kicker: k };
    }
  }
  return { height: 0, shortcut: false };
}

export interface FootBox { s0: number; s1: number; l0: number; l1: number; y0: number; y1: number }
export interface PieceInfo {
  id: string; hgt: number; top: number | null; halfLen: number; halfWid: number; boxes: FootBox[]; roofs: FootBox[];
}

let pieceTable: Record<string, PieceSpec[]> = PIECES;
let pieceTableVersion = 0;
const layoutCache = new Map<string, LevelLayout>();

/** The game replaces its built-in piece table with GLB metadata at runtime; this is the same hook. */
export function setPieceTable(overrides: Record<string, PieceSpec[]>): void {
  pieceTable = { ...pieceTable };
  for (const [name, list] of Object.entries(overrides)) if (Array.isArray(list) && list.length) pieceTable[name] = list;
  pieceTableVersion++;
  layoutCache.clear();
}

export function pieceSpec(name: string, variant = 0): PieceSpec | null {
  const list = pieceTable[name];
  return list ? list[Math.max(0, Math.min(list.length - 1, variant | 0))]! : null;
}

/** Footprint boxes of a piece rotated by `yaw` and placed at (s, l), in road coordinates. */
function placeBoxes(level: Level, spec: PieceSpec, s: number, l: number, yaw = 0): FootBox[] {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const slope = Math.sqrt(1 + roadProfile(level, s).dx ** 2);
  return spec.boxes.map((b: Box) => {
    let sMin = Infinity, sMax = -Infinity, lMin = Infinity, lMax = -Infinity;
    for (const x of [b.min[0], b.max[0]]) {
      for (const z of [b.min[2], b.max[2]]) {
        const lat = x * c + z * sn;
        const lon = (x * sn - z * c) / slope;
        sMin = Math.min(sMin, lon);
        sMax = Math.max(sMax, lon);
        lMin = Math.min(lMin, lat);
        lMax = Math.max(lMax, lat);
      }
    }
    return { s0: s + sMin, s1: s + sMax, l0: l + lMin, l1: l + lMax, y0: b.min[1], y1: b.max[1] };
  });
}

export interface LayoutVehicle {
  index: number; lineup: number; row: number; piece: string; v: number; id: string; s: number; l: number; yaw: number;
  hgt: number; top: number | null; boxes: FootBox[]; roofs: FootBox[]; s0: number; s1: number; l0: number; l1: number;
}
export interface LineupRow { s0: number; s1: number; l0: number; l1: number; top: number; count: number; points: number; pieces: string[] }
export interface LineupInfo {
  index: number; kicker: Kicker; label: string | null; rows: LineupRow[]; count: number; top: number;
  s0: number; s1: number; l0: number; l1: number; big: boolean;
}
export interface LevelLayout { vehicles: LayoutVehicle[]; lineups: LineupInfo[] }

/** Static lineup vehicles and their grouped rows for a level (cached per level and piece-table version). */
export function levelLayout(level: Level): LevelLayout {
  const key = `${level.id}:${pieceTableVersion}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const vehicles: LayoutVehicle[] = [];
  const lineups: LineupInfo[] = [];
  level.lineups.forEach((def, li) => {
    const kicker = def.kicker;
    const spacing = def.spacing ?? (def.orient === "along" ? 1.5 : 0.7);
    const maxHeight = Math.max(...def.rows.flat().map(([name, variant]) => pieceSpec(name, variant)?.hgt || 0));
    let cursor = kicker.s + kicker.len + (def.gap ?? 6 + Math.max(0, maxHeight - kicker.h) * 4);
    const rows: LineupRow[] = [];
    def.rows.forEach((row, rowIndex) => {
      const slope = Math.sqrt(1 + roadProfile(level, cursor).dx ** 2);
      const cells = row
        .map(([name, variant = 0, lat = 0, orient = def.orient]) => ({
          piece: name, v: variant, l: lat, across: orient !== "along", spec: pieceSpec(name, variant)
        }))
        .filter((c) => c.spec);
      if (!cells.length) return;
      const depth = Math.max(...cells.map((c) => (c.across ? c.spec!.wid : c.spec!.len) / slope));
      const centre = cursor + depth / 2;
      const placed: LayoutVehicle[] = [];
      cells.forEach((c, ci) => {
        const yaw = c.across ? (((rowIndex + ci) % 2 ? -1 : 1) * Math.PI) / 2 : 0;
        const boxes = placeBoxes(level, c.spec!, centre, c.l, yaw);
        const top = c.spec!.top;
        const vehicle: LayoutVehicle = {
          index: vehicles.length, lineup: li, row: rowIndex, piece: c.piece, v: c.v, id: c.spec!.id, s: centre, l: c.l, yaw,
          hgt: c.spec!.hgt, top, boxes, roofs: top == null ? [] : boxes.filter((b) => b.y1 >= top - 0.15),
          s0: Math.min(...boxes.map((b) => b.s0)), s1: Math.max(...boxes.map((b) => b.s1)),
          l0: Math.min(...boxes.map((b) => b.l0)), l1: Math.max(...boxes.map((b) => b.l1))
        };
        vehicles.push(vehicle);
        placed.push(vehicle);
      });
      rows.push({
        s0: Math.min(...placed.map((v) => v.s0)), s1: Math.max(...placed.map((v) => v.s1)),
        l0: Math.min(...placed.map((v) => v.l0)), l1: Math.max(...placed.map((v) => v.l1)),
        top: Math.max(...placed.map((v) => v.hgt)), count: placed.length,
        points: placed.reduce((sum, v) => sum + (PIECE_POINTS[v.piece] || 100), 0), pieces: placed.map((v) => v.piece)
      });
      cursor += depth + spacing;
    });
    if (!rows.length) return;
    const count = rows.reduce((sum, r) => sum + r.count, 0);
    const top = Math.max(...rows.map((r) => r.top));
    lineups.push({
      index: li, kicker, label: def.label || null, rows, count, top, s0: rows[0]!.s0, s1: rows[rows.length - 1]!.s1,
      l0: Math.min(...rows.map((r) => r.l0)), l1: Math.max(...rows.map((r) => r.l1)), big: top >= 3 || count >= 6
    });
  });
  const result = { vehicles, lineups };
  layoutCache.set(key, result);
  return result;
}

/** A moving traffic piece's collision footprint (cd). */
export function trafficPiece(name: string, variant = 0): PieceInfo {
  const spec = pieceSpec(name, variant) ?? pieceSpec("sedan")!;
  const boxes: FootBox[] = spec.boxes.map((b) => ({
    s0: -b.max[2], s1: -b.min[2], l0: b.min[0], l1: b.max[0], y0: b.min[1], y1: b.max[1]
  }));
  return {
    id: spec.id, hgt: spec.hgt, top: spec.top, halfLen: spec.len / 2, halfWid: spec.wid / 2, boxes,
    roofs: spec.top == null ? [] : boxes.filter((b) => b.y1 >= spec.top! - 0.15)
  };
}

/** The act (named stretch of the route) at arc position `s`. */
export function actAt(level: Level, s: number): Act {
  return [...level.acts].reverse().find((a) => s >= a.s) ?? level.acts[0]!;
}

export type Medal = "gold" | "silver" | "bronze";
export function medalFor(level: Level, time: number, score: number, cells: number): Medal {
  return time <= level.medal.gold && score >= 2600 && cells >= 3 ? "gold" : time <= level.medal.silver && score >= 1e3 ? "silver" : "bronze";
}

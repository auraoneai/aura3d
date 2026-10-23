// Deterministic placement planner: seeded scatter along a path or over an area, with exclusion zones,
// minimum spacing, height/slope filters and radius LOD splitting. Pure TypeScript, no scene-graph or GPU use:
// the result feeds `instances.*`, `instances.model` or `instances.mesh` (an empty result is a valid input there).
import type { AuraTransformSpec, AuraVec3 } from "./types.js";

export type AuraScatterRange = readonly [min: number, max: number];
export type AuraScatterSide = "both" | "left" | "right";

export type AuraScatterExclusion =
  | { readonly kind: "circle"; readonly center: readonly [number, number]; readonly radius: number }
  | { readonly kind: "box"; readonly min: readonly [number, number]; readonly max: readonly [number, number] };

export type AuraScatterArea =
  | { readonly kind: "rect"; readonly min: readonly [number, number]; readonly max: readonly [number, number] }
  | { readonly kind: "disc"; readonly center: readonly [number, number]; readonly radius: number };

export interface AuraScatterPoint {
  readonly position: AuraVec3;
  /** Rotation about +Y in radians. */
  readonly yaw: number;
  /** Uniform scale along X and Y, `scale * depthScale` along Z (`depthScale` is 1 unless `scaleDepth` is set). */
  readonly scale: number;
  readonly depthScale: number;
  /** Variant index in `[0, kinds)`; 0 when `kinds` is unset. */
  readonly kind: number;
  /** Arc length along the path (path scatter) or 0 (area scatter). */
  readonly along: number;
  /** Signed lateral offset from the path (path scatter) or 0 (area scatter). */
  readonly lateral: number;
}

interface AuraScatterCommon {
  /** Seed for the built-in generator (a 32-bit LCG). Ignored when `random` is given. Default 1. */
  readonly seed?: number;
  /** Share one random stream across several calls (chunked worlds). Overrides `seed`. */
  readonly random?: () => number;
  /** Number of model/mesh variants; each placement draws `kind` in `[0, kinds)`. Unset draws nothing and gives kind 0. */
  readonly kinds?: number;
  /** Extra height added to the base height, drawn uniformly from the range. */
  readonly yOffset?: AuraScatterRange;
  /** Uniform scale drawn from the range. Unset gives scale 1 and draws nothing. */
  readonly scale?: AuraScatterRange;
  /** Multiplier on the Z scale drawn from the range (squash/stretch variety). */
  readonly scaleDepth?: AuraScatterRange;
  /** Yaw in radians: a number (fixed), or a range drawn uniformly. Default `[0, 2π)`. */
  readonly yaw?: number | AuraScatterRange;
  /** Placements inside any zone are rejected (XZ plane). */
  readonly exclude?: readonly AuraScatterExclusion[];
  /** Reject a placement closer than this (XZ) to an already accepted one. */
  readonly minDistance?: number;
  /** Reject placements whose final height is outside the range. */
  readonly heightRange?: AuraScatterRange;
  /** With `maxSlope`, rejects placements where the ground gradient magnitude (rise over run) exceeds it. */
  readonly ground?: (x: number, z: number) => number;
  readonly maxSlope?: number;
  /** Final custom filter. Runs after every built-in filter. */
  readonly accept?: (point: AuraScatterPoint) => boolean;
  /** Stop after this many accepted placements. */
  readonly maxCount?: number;
}

export interface AuraScatterAlongPathOptions extends AuraScatterCommon {
  /** World position at arc length `s` and signed lateral offset (positive is the side `side: "right"` uses). */
  readonly path: (s: number, lateral: number) => AuraVec3;
  readonly start: number;
  readonly end: number;
  /** Arc-length spacing between rows, drawn uniformly from the range after each row. */
  readonly step: AuraScatterRange;
  /** Absolute lateral distance from the path, drawn uniformly. Both sides mirror it. */
  readonly lateral: AuraScatterRange;
  readonly side?: AuraScatterSide;
  /** Probability in `[0, 1)` of skipping a placement; draws once per placement when set. */
  readonly skipChance?: number;
  /** Total width of random arc-length jitter applied to each placement; draws once when set. */
  readonly alongJitter?: number;
  /** Base height for `yOffset`, called with the row's arc length (before `alongJitter`) and the placed position, e.g. the centreline height. Default is the path position's Y. */
  readonly baseHeight?: (row: number, position: AuraVec3) => number;
}

export interface AuraScatterInAreaOptions extends AuraScatterCommon {
  readonly area: AuraScatterArea;
  /** Target number of accepted placements. */
  readonly count: number;
  /** Attempts per requested placement before giving up (default 12), so filters cannot loop forever. */
  readonly attemptsPerPoint?: number;
}

/** The 32-bit LCG the ported games share (Numerical Recipes constants); one number in `[0, 1)` per call. */
export function createScatterRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0), state / 4294967296);
}

const TAU = Math.PI * 2;
const draw = (random: () => number, range: AuraScatterRange): number => range[0] + random() * (range[1] - range[0]);

function finiteRange(range: AuraScatterRange | undefined, label: string): void {
  if (!range) return;
  if (!Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[1] < range[0]) throw new Error(`Aura3D scatter ${label} must be a finite [min, max] range with max >= min.`);
}

function validateCommon(options: AuraScatterCommon): void {
  finiteRange(options.yOffset, "yOffset");
  finiteRange(options.scale, "scale");
  finiteRange(options.scaleDepth, "scaleDepth");
  finiteRange(options.heightRange, "heightRange");
  if (typeof options.yaw === "object") finiteRange(options.yaw, "yaw");
  if (options.kinds !== undefined && (!Number.isInteger(options.kinds) || options.kinds < 1)) throw new Error("Aura3D scatter kinds must be a positive integer.");
  if (options.minDistance !== undefined && !(options.minDistance >= 0)) throw new Error("Aura3D scatter minDistance must be zero or positive.");
  if (options.maxSlope !== undefined && !options.ground) throw new Error("Aura3D scatter maxSlope needs a ground(x, z) height function.");
}

function inZone(zone: AuraScatterExclusion, x: number, z: number): boolean {
  if (zone.kind === "circle") {
    const dx = x - zone.center[0];
    const dz = z - zone.center[1];
    return dx * dx + dz * dz <= zone.radius * zone.radius;
  }
  return x >= zone.min[0] && x <= zone.max[0] && z >= zone.min[1] && z <= zone.max[1];
}

function slopeAt(ground: (x: number, z: number) => number, x: number, z: number): number {
  const e = 0.5;
  const gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e);
  const gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** Spatial hash for the minimum-distance rule: O(1) neighbour lookups instead of an O(n^2) scan. */
class SpacingIndex {
  private readonly cells = new Map<string, Array<readonly [number, number]>>();
  constructor(private readonly distance: number) {}
  private key(cx: number, cz: number): string { return `${cx},${cz}`; }
  private cell(v: number): number { return Math.floor(v / this.distance); }
  blocked(x: number, z: number): boolean {
    if (this.distance <= 0) return false;
    const cx = this.cell(x);
    const cz = this.cell(z);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
      const bucket = this.cells.get(this.key(ix, iz));
      if (!bucket) continue;
      for (const p of bucket) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < this.distance * this.distance) return true;
    }
    return false;
  }
  add(x: number, z: number): void {
    if (this.distance <= 0) return;
    const k = this.key(this.cell(x), this.cell(z));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push([x, z]); else this.cells.set(k, [[x, z]]);
  }
}

interface Candidate { readonly position: AuraVec3; readonly yaw: number; readonly scale: number; readonly depthScale: number; readonly kind: number; readonly along: number; readonly lateral: number }

function makeFilter(options: AuraScatterCommon): { accepts(c: Candidate): boolean; commit(c: Candidate): void } {
  const spacing = new SpacingIndex(options.minDistance ?? 0);
  return {
    accepts(c) {
      const [x, y, z] = c.position;
      if (options.exclude?.some((zone) => inZone(zone, x, z))) return false;
      if (options.heightRange && (y < options.heightRange[0] || y > options.heightRange[1])) return false;
      if (options.maxSlope !== undefined && options.ground && slopeAt(options.ground, x, z) > options.maxSlope) return false;
      if (spacing.blocked(x, z)) return false;
      return options.accept ? options.accept(c) : true;
    },
    commit(c) { spacing.add(c.position[0], c.position[2]); }
  };
}

/**
 * Scatter placements along a path (roads, rails, rivers, corridors). Draw order per placement is fixed and
 * documented so a given seed always yields the same layout: skip chance, lateral distance, along-path jitter,
 * kind, yOffset, scale, scaleDepth, yaw; then one `step` draw per row. Filters run after the draws, so adding a
 * filter never shifts the random stream and never moves the placements that survive.
 */
export function scatterAlongPath(options: AuraScatterAlongPathOptions): AuraScatterPoint[] {
  validateCommon(options);
  finiteRange(options.step, "step");
  finiteRange(options.lateral, "lateral");
  if (!(options.step[1] > 0) || !(options.step[0] + options.step[1] > 0)) throw new Error("Aura3D scatter step must advance (max > 0).");
  const random = options.random ?? createScatterRandom(options.seed ?? 1);
  const sides = options.side === "left" ? [-1] : options.side === "right" ? [1] : [-1, 1];
  const filter = makeFilter(options);
  const out: AuraScatterPoint[] = [];
  const limit = options.maxCount ?? Infinity;
  for (let s = options.start; s < options.end && out.length < limit; s += options.step[0] + random() * (options.step[1] - options.step[0])) {
    for (const side of sides) {
      if (out.length >= limit) break;
      if (options.skipChance !== undefined && random() < options.skipChance) continue;
      const lateral = side * draw(random, options.lateral);
      const sAt = options.alongJitter !== undefined ? s + (random() - 0.5) * options.alongJitter : s;
      const base = options.path(sAt, lateral);
      const kind = options.kinds !== undefined ? Math.floor(random() * options.kinds) : 0;
      const baseY = options.baseHeight ? options.baseHeight(s, base) : base[1];
      const y = baseY + (options.yOffset ? draw(random, options.yOffset) : 0);
      const scale = options.scale ? draw(random, options.scale) : 1;
      const depthScale = options.scaleDepth ? draw(random, options.scaleDepth) : 1;
      const yaw = options.yaw === undefined ? random() * TAU : typeof options.yaw === "number" ? options.yaw : draw(random, options.yaw);
      const candidate: Candidate = { position: [base[0], y, base[2]], yaw, scale, depthScale, kind, along: sAt, lateral };
      if (!filter.accepts(candidate)) continue;
      filter.commit(candidate);
      out.push(candidate);
    }
  }
  return out;
}

/**
 * Scatter placements over a rectangle or disc. Draw order per attempt: position (x then z, or angle then
 * radius for discs), kind, yOffset, scale, scaleDepth, yaw. Stops at `count` accepted placements or after
 * `count * attemptsPerPoint` attempts, so impossible filters return fewer placements instead of hanging.
 */
export function scatterInArea(options: AuraScatterInAreaOptions): AuraScatterPoint[] {
  validateCommon(options);
  if (!Number.isInteger(options.count) || options.count < 0) throw new Error("Aura3D scatterInArea count must be a non-negative integer.");
  const random = options.random ?? createScatterRandom(options.seed ?? 1);
  const filter = makeFilter(options);
  const out: AuraScatterPoint[] = [];
  const maxAttempts = options.count * (options.attemptsPerPoint ?? 12);
  const area = options.area;
  for (let attempt = 0; attempt < maxAttempts && out.length < Math.min(options.count, options.maxCount ?? Infinity); attempt += 1) {
    let x: number;
    let z: number;
    if (area.kind === "rect") {
      x = area.min[0] + random() * (area.max[0] - area.min[0]);
      z = area.min[1] + random() * (area.max[1] - area.min[1]);
    } else {
      const angle = random() * TAU;
      const radius = area.radius * Math.sqrt(random());
      x = area.center[0] + Math.cos(angle) * radius;
      z = area.center[1] + Math.sin(angle) * radius;
    }
    const kind = options.kinds !== undefined ? Math.floor(random() * options.kinds) : 0;
    const y = (options.ground ? options.ground(x, z) : 0) + (options.yOffset ? draw(random, options.yOffset) : 0);
    const scale = options.scale ? draw(random, options.scale) : 1;
    const depthScale = options.scaleDepth ? draw(random, options.scaleDepth) : 1;
    const yaw = options.yaw === undefined ? random() * TAU : typeof options.yaw === "number" ? options.yaw : draw(random, options.yaw);
    const candidate: Candidate = { position: [x, y, z], yaw, scale, depthScale, kind, along: 0, lateral: 0 };
    if (!filter.accepts(candidate)) continue;
    filter.commit(candidate);
    out.push(candidate);
  }
  return out;
}

/**
 * Radius LOD: split placements into bands by XZ distance from `origin`. `radii` ascend; the result has
 * `radii.length + 1` arrays: `[0]` is closest (e.g. instanced Meshy models), the last is beyond every radius
 * (e.g. the cheap procedural fallback). Order inside each band is preserved.
 */
export function splitScatterByDistance(points: readonly AuraScatterPoint[], origin: readonly [number, number], radii: readonly number[]): AuraScatterPoint[][] {
  for (let i = 0; i < radii.length; i += 1) {
    if (!(radii[i]! >= 0) || (i > 0 && radii[i]! < radii[i - 1]!)) throw new Error("Aura3D scatter radii must be non-negative and ascending.");
  }
  const bands: AuraScatterPoint[][] = Array.from({ length: radii.length + 1 }, () => []);
  for (const point of points) {
    const d = Math.hypot(point.position[0] - origin[0], point.position[2] - origin[1]);
    let band = radii.length;
    for (let i = 0; i < radii.length; i += 1) if (d <= radii[i]!) { band = i; break; }
    bands[band]!.push(point);
  }
  return bands;
}

/** Turn placements into `instances.*` transforms. `kind` keeps only that variant. `baseScale` multiplies the stored scale. */
export function scatterTransforms(points: readonly AuraScatterPoint[], options: { readonly kind?: number; readonly baseScale?: number | AuraVec3 } = {}): AuraTransformSpec[] {
  const base: AuraVec3 = options.baseScale === undefined ? [1, 1, 1] : typeof options.baseScale === "number" ? [options.baseScale, options.baseScale, options.baseScale] : options.baseScale;
  const out: AuraTransformSpec[] = [];
  for (const p of points) {
    if (options.kind !== undefined && p.kind !== options.kind) continue;
    out.push({ position: p.position, rotation: [0, p.yaw, 0], scale: [p.scale * base[0], p.scale * base[1], p.scale * p.depthScale * base[2]] });
  }
  return out;
}

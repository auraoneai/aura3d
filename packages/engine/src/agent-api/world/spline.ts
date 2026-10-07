/**
 * PRD-10 §7.1.7 / T5.2 + T5.3 — `world.spline` and `world.extrude`.
 *
 * Spline: centripetal Catmull-Rom (alpha = 0.5) with an arc-length
 * reparameterisation, rotation-minimizing (parallel-transport) frames and
 * optional banking roll. All math is CPU-side, deterministic, and pure — the
 * handle captures sampled state at build time so callers can query
 * `pointAt/tangentAt/frameAt/closestT` without re-deriving.
 *
 * Extrude: sweeps a named or custom 2D profile (x = right, y = up in frame
 * space) along the spline into indexed triangle geometry with UVs in metres
 * (`uv.uScale`, `uv.vMetersPerTile`). `conformToTerrain` writes a flatten
 * mask into the target terrain's height source before upload and bumps the
 * record's `gridVersion` so the Path S runtime re-uploads the height texture.
 */
import type { AuraMaterialSpec, AuraSceneNode } from "../index.js";
import { defineAuraCustomGeometry, geometry } from "../index.js";
import type { AuraWorldNodeBase } from "./types.js";
import { terrainRecordFor, type AuraTerrainHandle } from "./terrain.js";

// -------------------------------------------------------------- vectors ----

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 1];
};
const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

// -------------------------------------------------- Catmull-Rom sampling ---
// Centripetal (alpha = 0.5) formulation: segment knots are spaced by
// sqrt(|P_{i+1} - P_i|), which prevents the cusps uniform CR produces when
// control points bunch up.

function catmullRomPoint(p0: V3, p1: V3, p2: V3, p3: V3, u: number): V3 {
  const d01 = Math.max(Math.sqrt(len(sub(p1, p0))), 1e-6);
  const d12 = Math.max(Math.sqrt(len(sub(p2, p1))), 1e-6);
  const d23 = Math.max(Math.sqrt(len(sub(p3, p2))), 1e-6);
  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const t = t1 + u * (t2 - t1);
  const a1 = add(scale(p0, (t1 - t) / (t1 - t0)), scale(p1, (t - t0) / (t1 - t0)));
  const a2 = add(scale(p1, (t2 - t) / (t2 - t1)), scale(p2, (t - t1) / (t2 - t1)));
  const a3 = add(scale(p2, (t3 - t) / (t3 - t2)), scale(p3, (t - t2) / (t3 - t2)));
  const b1 = add(scale(a1, (t2 - t) / (t2 - t0)), scale(a2, (t - t0) / (t2 - t0)));
  const b2 = add(scale(a2, (t3 - t) / (t3 - t1)), scale(a3, (t - t1) / (t3 - t1)));
  return add(scale(b1, (t2 - t) / (t2 - t1)), scale(b2, (t - t1) / (t2 - t1)));
}

// --------------------------------------------------------------- handle ----

export interface AuraSplineFrame {
  readonly right: V3;
  readonly up: V3;
  readonly forward: V3;
}

export interface AuraSplineHandle {
  /** Arc length in metres. */
  readonly length: number;
  /** Position at t ∈ [0,1] (t = arc-length fraction). */
  pointAt(t: number): V3;
  /** Unit tangent at t ∈ [0,1]. */
  tangentAt(t: number): V3;
  /** Rotation-minimizing orthonormal frame at t ∈ [0,1] (banking applied). */
  frameAt(t: number): AuraSplineFrame;
  /** t of the closest curve point to `point` (coarse + refined). */
  closestT(point: V3): number;
}

export interface AuraSplineOptions {
  readonly closed?: boolean;
  /** Reserved for API stability — centripetal parameterisation ignores it. */
  readonly tension?: number;
  readonly up?: "y" | "banked";
  /** Roll around the tangent at each control point, degrees. Default 0. */
  readonly bankDeg?: readonly number[];
}

const SAMPLES_PER_SPAN = 16;

export function worldSpline(points: readonly (readonly [number, number, number])[], options: AuraSplineOptions = {}): AuraSplineHandle {
  if (points.length < 2) throw new Error("world.spline: at least two control points are required");
  const closed = options.closed === true;
  if (closed && points.length < 3) throw new Error("world.spline: a closed spline needs at least three control points");

  // Sample the curve densely (16 sub-steps per span) and build the arc-length
  // table. All queries then operate on the table — deterministic and O(1)-ish.
  const pts = points.map((p): V3 => [p[0], p[1], p[2]]);
  const spanCount = closed ? pts.length : pts.length - 1;
  const at = (i: number): V3 => closed ? pts[((i % pts.length) + pts.length) % pts.length]! : pts[Math.max(0, Math.min(pts.length - 1, i))]!;

  const samples: V3[] = [];
  const segStart: number[] = []; // sample index at each span start
  for (let s = 0; s < spanCount; s += 1) {
    segStart.push(samples.length);
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
    const n = s === spanCount - 1 ? SAMPLES_PER_SPAN + 1 : SAMPLES_PER_SPAN;
    for (let i = 0; i < n; i += 1) {
      const u = i / SAMPLES_PER_SPAN;
      samples.push(catmullRomPoint(p0, p1, p2, p3, Math.min(u, 1)));
    }
  }
  // arc-length table
  const cum: number[] = [0];
  for (let i = 1; i < samples.length; i += 1) cum.push(cum[i - 1]! + len(sub(samples[i]!, samples[i - 1]!)));
  const length = cum[cum.length - 1]!;
  const N = samples.length;

  const indexAt = (s: number): number => {
    const clamped = Math.max(0, Math.min(length, s));
    let lo = 0, hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < clamped) lo = mid + 1; else hi = mid;
    }
    return Math.max(1, lo);
  };
  const pointAtDistance = (s: number): V3 => {
    const i = indexAt(s);
    const s0 = cum[i - 1]!, s1 = cum[i]!;
    const f = s1 > s0 ? (Math.max(0, Math.min(length, s)) - s0) / (s1 - s0) : 0;
    return lerp(samples[i - 1]!, samples[i]!, f);
  };
  const pointAt = (t: number): V3 => pointAtDistance(Math.max(0, Math.min(1, t)) * length);

  const tangentAt = (t: number): V3 => {
    const s = Math.max(0, Math.min(1, t)) * length;
    const ds = Math.max(length * 1e-4, 1e-4);
    return norm(sub(pointAtDistance(s + ds), pointAtDistance(s - ds)));
  };

  // Rotation-minimizing frames by parallel transport along the sample table,
  // then banking roll around the tangent. Bank is interpolated across control
  // stations (option bankDeg[i] applies at control point i's t).
  const frames: AuraSplineFrame[] = new Array(N);
  const initialT = norm(sub(samples[1]!, samples[0]!));
  let right: V3 = Math.abs(initialT[1]) > 0.999 ? norm(cross([1, 0, 0], initialT)) : norm(cross([0, 1, 0], initialT));
  for (let i = 0; i < N; i += 1) {
    const t_i = norm(sub(samples[Math.min(i + 1, N - 1)]!, samples[Math.max(i - 1, 0)]!));
    // project previous right onto the plane ⟂ tangent → parallel transport
    right = norm(sub(right, scale(t_i, dot(t_i, right))));
    const up = norm(cross(t_i, right));
    frames[i] = { right, up, forward: t_i };
  }
  const bank = (t: number): number => {
    const arr = options.bankDeg;
    if (!arr || arr.length === 0) return 0;
    if (arr.length === 1) return (arr[0]! * Math.PI) / 180;
    const spanT = t * (closed ? arr.length : arr.length - 1);
    const i0 = Math.floor(spanT);
    const i1 = closed ? (i0 + 1) % arr.length : Math.min(i0 + 1, arr.length - 1);
    const f = spanT - i0;
    return (arr[i0 % arr.length]! * (1 - f) + arr[i1]! * f) * (Math.PI / 180);
  };
  const frameAt = (t: number): AuraSplineFrame => {
    const s = Math.max(0, Math.min(1, t)) * length;
    const i = indexAt(s);
    const s0 = cum[i - 1]!, s1 = cum[i]!;
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const a = frames[i - 1]!, b = frames[i]!;
    const forward = norm(lerp(a.forward, b.forward, f));
    let r = norm(lerp(a.right, b.right, f));
    r = norm(sub(r, scale(forward, dot(forward, r))));
    let u = norm(cross(forward, r));
    const theta = bank(t);
    if (theta !== 0) {
      const c = Math.cos(theta), sn = Math.sin(theta);
      const r2 = add(scale(r, c), scale(u, sn));
      u = add(scale(u, c), scale(r, -sn));
      r = r2;
    }
    return { right: r, up: u, forward };
  };

  const closestT = (point: V3): number => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < N; i += 1) {
      const d = len(sub(samples[i]!, point));
      if (d < bestD) { bestD = d; best = i; }
    }
    // refine inside the neighbouring arc window with a golden-section search
    let lo = cum[Math.max(0, best - 1)]!, hi = cum[Math.min(N - 1, best + 1)]!;
    for (let it = 0; it < 20 && hi - lo > 1e-6; it += 1) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const d1 = len(sub(pointAtDistance(m1), point));
      const d2 = len(sub(pointAtDistance(m2), point));
      if (d1 < d2) hi = m2; else lo = m1;
    }
    return Math.max(0, Math.min(1, (lo + hi) / 2 / length));
  };

  return { length, pointAt, tangentAt, frameAt, closestT };
}

// ------------------------------------------------------------- extrusion ---

/** A 2D profile swept along the spline: x = right offset, y = up offset. */
export type AuraExtrudeProfile =
  | "road-2-lane" | "road-4-lane" | "race-track" | "curb" | "rail"
  | "tunnel-round" | "tunnel-box" | "fence" | "marking-line"
  | readonly (readonly [number, number])[];

interface ProfileDef {
  readonly points: readonly (readonly [number, number])[];
  /** Closed polygon (surface strip between consecutive points, last→first). */
  readonly closed: boolean;
}

const ring = (radius: number, n: number, yBase: number): readonly [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * radius, yBase + Math.sin(a) * radius + radius]);
  }
  return out;
};

const EXTRUDE_PROFILES: Record<string, ProfileDef> = {
  "road-2-lane": { points: [[-3.7, 0], [3.7, 0], [3.7, -0.15], [-3.7, -0.15]], closed: true },
  "road-4-lane": { points: [[-7.4, 0], [7.4, 0], [7.4, -0.15], [-7.4, -0.15]], closed: true },
  "race-track": { points: [[-6, 0], [-6, 0.06], [-5.6, 0.12], [5.6, 0.12], [6, 0.06], [6, 0], [6, -0.3], [-6, -0.3]], closed: true },
  "curb": { points: [[0, 0], [0.15, 0], [0.15, 0.18], [0, 0.18]], closed: true },
  "rail": { points: [[-0.072, 0], [0.072, 0], [0.06, 0.1], [0.033, 0.16], [-0.033, 0.16], [-0.06, 0.1]], closed: true },
  "tunnel-round": { points: ring(6, 12, -1.5), closed: true },
  "tunnel-box": { points: [[-4.5, 0], [4.5, 0], [4.5, 4.5], [-4.5, 4.5]], closed: true },
  "fence": { points: [[-0.05, 0], [0.05, 0], [0.05, 1], [-0.05, 1]], closed: true },
  // thin emissive strip for lane markings (§7.1.8 street markings)
  "marking-line": { points: [[-0.075, 0.015], [0.075, 0.015], [0.075, 0.0175], [-0.075, 0.0175]], closed: true }
};

export interface AuraExtrudeOptions extends AuraWorldNodeBase {
  readonly profile: AuraExtrudeProfile;
  readonly material: AuraMaterialSpec;
  /** Stations per metre of arc length; subdivided adaptively on curvature. */
  readonly segmentsPerMeter?: number;
  readonly uv?: { readonly uScale?: number; readonly vMetersPerTile?: number };
  readonly conformToTerrain?: { readonly terrain: AuraTerrainHandle | string; readonly falloff?: number; readonly offsetY?: number } | boolean;
  /** Accepted for future physics emission; Path S carries visual mesh only. */
  readonly collider?: boolean;
}

function resolveProfile(profile: AuraExtrudeProfile): ProfileDef {
  if (typeof profile !== "string") {
    if (profile.length < 3) throw new Error("world.extrude: a custom profile needs at least three [x, y] points");
    return { points: profile, closed: true };
  }
  const def = EXTRUDE_PROFILES[profile];
  if (!def) throw new Error(`world.extrude: unknown profile "${profile}"`);
  return def;
}

/** Write the spline's flatten mask into a terrain's height grid (pre-upload). */
function conformToTerrain(spline: AuraSplineHandle, terrainId: string, falloff: number, offsetY: number, halfWidth: number): void {
  const record = terrainRecordFor(terrainId);
  const grid = record?.grid;
  if (!record || !grid) {
    // Asset-source terrains resolve their grid at compile time; emit a warning
    // rather than silently skipping so the caller can see the flatten is lost.
    console.warn(`world.extrude conformToTerrain: terrain "${terrainId}" has no resolved height grid — flatten skipped`);
    return;
  }
  const cols = grid.columns, rows = grid.rows;
  const [sx, sz] = record.size;
  const reach = halfWidth + falloff;
  // marching stations — samples every ~1 m along the strip
  const stations = Math.max(2, Math.ceil(spline.length));
  for (let gz = 0; gz < rows; gz += 1) {
    const wz = record.origin[2] + (gz / (rows - 1)) * sz;
    for (let gx = 0; gx < cols; gx += 1) {
      const wx = record.origin[0] + (gx / (cols - 1)) * sx;
      const t = spline.closestT([wx, 0, wz]);
      const center = spline.pointAt(t);
      const dist = Math.hypot(wx - center[0], wz - center[2]);
      if (dist > reach) continue;
      const target = center[1] + offsetY;
      const w = dist <= halfWidth ? 1 : 1 - (dist - halfWidth) / Math.max(falloff, 1e-3);
      const i = gz * cols + gx;
      const cur = grid.heights[i]! * record.heightScale;
      grid.heights[i] = (cur * (1 - w) + target * w) / record.heightScale;
    }
  }
  record.gridVersion = (record.gridVersion ?? 0) + 1;
}

export function worldExtrude(spline: AuraSplineHandle, options: AuraExtrudeOptions): AuraSceneNode {
  if (spline.length <= 0) throw new Error("world.extrude: spline has zero length");
  const profile = resolveProfile(options.profile);
  const ppts = profile.points;
  const M = ppts.length;
  const edges = profile.closed ? M : M - 1;
  const edgeNormals: [number, number][] = [];
  for (let i = 0; i < edges; i += 1) {
    const a = ppts[i]!, b = ppts[(i + 1) % M]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    edgeNormals.push([dy / l, -dx / l]); // 2D outward normal in frame space
  }

  // Station spacing: base density + one adaptive pass that splits spans whose
  // tangent turn exceeds ~0.05 rad (curvature adaptive, §7.1.7).
  const spm = options.segmentsPerMeter ?? 0.5;
  let stations: number[] = [];
  const base = Math.max(2, Math.ceil(spline.length * spm) + 1);
  for (let i = 0; i < base; i += 1) stations.push(i / (base - 1));
  for (let pass = 0; pass < 2; pass += 1) {
    const out: number[] = [stations[0]!];
    for (let i = 1; i < stations.length; i += 1) {
      const a = spline.tangentAt(stations[i - 1]!);
      const b = spline.tangentAt(stations[i]!);
      if (dot(a, b) < Math.cos(0.05)) {
        const mid = (stations[i - 1]! + stations[i]!) / 2;
        if (out[out.length - 1]! !== mid) out.push(mid);
      }
      out.push(stations[i]!);
    }
    stations = out;
  }
  const S = stations.length;

  const positions: V3[] = [];
  const normals: V3[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const uScale = options.uv?.uScale ?? 1;
  const vTile = Math.max(1e-3, options.uv?.vMetersPerTile ?? 4);

  for (let s = 0; s < S; s += 1) {
    const t = stations[s]!;
    const center = spline.pointAt(t);
    const frame = spline.frameAt(t);
    const v = (t * spline.length) / vTile;
    for (let i = 0; i < M; i += 1) {
      const [px, py] = ppts[i]!;
      positions.push(add(center, add(scale(frame.right, px), scale(frame.up, py))));
      // vertex normal = average of adjacent edge normals in frame space
      const nA = edgeNormals[(i - 1 + edges) % edges] ?? edgeNormals[0]!;
      const nB = edgeNormals[i % edges] ?? edgeNormals[edges - 1]!;
      const nx = nA[0] + nB[0], ny = nA[1] + nB[1];
      normals.push(norm(add(scale(frame.right, nx), scale(frame.up, ny))));
      uvs.push(px * uScale, v);
    }
  }
  for (let s = 0; s < S - 1; s += 1) {
    for (let i = 0; i < edges; i += 1) {
      const a = s * M + i;
      const b = s * M + ((i + 1) % M);
      const c = (s + 1) * M + ((i + 1) % M);
      const d = (s + 1) * M + i;
      indices.push(a, d, b, b, d, c);
    }
  }
  // flat end caps for open splines
  for (const s of [0, S - 1]) {
    const t = stations[s]!;
    const center = spline.pointAt(t);
    const fwd = scale(spline.tangentAt(t), s === 0 ? -1 : 1);
    const centerIdx = positions.length;
    positions.push(center);
    normals.push(fwd);
    uvs.push(0, (t * spline.length) / vTile);
    for (let i = 0; i < edges - 1; i += 1) {
      const a = s * M + i, b = s * M + i + 1;
      if (s === 0) indices.push(centerIdx, b, a); else indices.push(centerIdx, a, b);
    }
  }

  if (options.conformToTerrain) {
    const conf = options.conformToTerrain;
    const terrainId = conf === true ? undefined : (typeof conf.terrain === "string" ? conf.terrain : conf.terrain.id);
    if (terrainId) {
      const maxHalf = Math.max(...ppts.map((p) => Math.abs(p[0])));
      conformToTerrain(spline, terrainId, conf === true ? 8 : (conf.falloff ?? 8), conf === true ? 0 : (conf.offsetY ?? 0), maxHalf);
    } else {
      console.warn("world.extrude conformToTerrain: pass { terrain: <handle|id> } to target a specific terrain");
    }
  }

  const spec = defineAuraCustomGeometry({
    positions: positions.map((p) => [p[0], p[1], p[2]] as const),
    normals: normals.map((n) => [n[0], n[1], n[2]] as const),
    indices
  });
  const node = geometry.custom(spec, {
    name: options.name ?? `extrude-${options.profile.toString()}`,
    material: options.material
  }).toJSON();
  // UVs in metres are attached post-hoc: defineAuraCustomGeometry rebuilds the
  // spec (owner-15 contract, positions/normals/indices only), so `uvs` rides
  // as an additive field the renderer's custom-geometry upload picks up.
  (node as { geometry?: { uvs?: number[] } }).geometry!.uvs = uvs;
  return node;
}

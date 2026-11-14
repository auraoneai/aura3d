/**
 * Follow-camera clearance: a pure, scene-free solve that keeps a third-person
 * lens on the subject's side of solid props. It sweeps the target -> desired
 * camera segment against simple occluder volumes (vertical cylinders and
 * axis-aligned or yaw-rotated boxes), pulls the camera in along the same line of
 * sight in front of the nearest blocker, and, when there is no room left above
 * `minDistance`, optionally cranes it up over the gap instead.
 *
 * Deterministic and allocation-free apart from the result (pass `out` to reuse
 * one). Smoothing is the caller's job: ease `result.fraction` (snap in, relax
 * out) and feed the eased value back through `maxFraction` to place the lens.
 */
import type { AuraVec3 } from "../nodes/types.js";

/**
 * Vertical extent shared by every occluder. `minY` / `maxY` win; otherwise
 * `baseY` (+ `height`) give the bottom and top. A missing bound is unbounded, so
 * an occluder with no vertical fields is an infinitely tall column.
 */
export interface AuraCameraClearanceVerticalExtent {
  /** Bottom of the occluder in world Y. */
  readonly minY?: number;
  /** Top of the occluder in world Y. Segments that stay above it pass over. */
  readonly maxY?: number;
  /** Bottom of the occluder when `minY` is omitted. */
  readonly baseY?: number;
  /** Height above `baseY`; gives the top when `maxY` is omitted. */
  readonly height?: number;
}

/** A vertical cylinder (tree trunk, pillar, NPC) centred on `x`, `z`. */
export interface AuraCameraClearanceCircle extends AuraCameraClearanceVerticalExtent {
  readonly shape: "circle";
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * A box footprint centred on `x`, `z` with half-extents along its local X and Z
 * axes, rotated by `yaw` radians about +Y (the same convention as a node's
 * `rotation: [0, yaw, 0]`: local `(lx, lz)` maps to world
 * `(lx cos yaw + lz sin yaw, -lx sin yaw + lz cos yaw)`).
 */
export interface AuraCameraClearanceBox extends AuraCameraClearanceVerticalExtent {
  readonly shape: "box";
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  /** Rotation about +Y in radians. Default 0 (axis-aligned). */
  readonly yaw?: number;
}

export type AuraCameraClearanceObstacle = AuraCameraClearanceCircle | AuraCameraClearanceBox;

export interface AuraCameraClearanceOptions {
  /**
   * Closest the camera may come to the target, in metres. A pull-in that would
   * go closer stops here (the lens may stay occluded) or, with
   * `allowVerticalRise`, rises at this distance instead. Default 0.
   */
  readonly minDistance?: number;
  /** Metres added to every occluder's radius / half-extents (the lens radius). Default 0.2. */
  readonly padding?: number;
  /** Metres the camera is kept back from the blocker along the line of sight. Default 0. */
  readonly backoff?: number;
  /**
   * When the clear point is closer than `minDistance`, crane the camera up over
   * the target at `minDistance` instead of stopping short. Default false.
   */
  readonly allowVerticalRise?: boolean;
  /**
   * Smallest horizontal offset kept while rising so the view never looks
   * straight down. Default 1.
   */
  readonly riseMinHorizontal?: number;
  /**
   * Upper bound on the boom fraction, in `[0, 1]`. Pass a caller-side eased
   * fraction here to place the lens while it relaxes back out. Default 1.
   */
  readonly maxFraction?: number;
}

/** `"clear"`: camera at the desired position; `"pull-in"`: moved in along the line of sight; `"rise"`: craned up at `minDistance`. */
export type AuraCameraClearanceMode = "clear" | "pull-in" | "rise";

export interface AuraCameraClearanceResult {
  /** Cleared camera position (written in place when `out` is reused). */
  position: [number, number, number];
  /** Boom fraction along target -> desired, in `[0, 1]`: 1 = unobstructed. In `"rise"` mode, the line fraction before rising. */
  fraction: number;
  /** Distance from the target to `position`. */
  distance: number;
  mode: AuraCameraClearanceMode;
  /** True when `position` differs from the desired position. */
  clamped: boolean;
  /** Index of the nearest blocking obstacle, or -1 when nothing blocks the line. */
  occluder: number;
}

const DEFAULT_OPTIONS: AuraCameraClearanceOptions = {};
const EPS = 1e-9;

function bottomOf(o: AuraCameraClearanceVerticalExtent): number {
  return o.minY ?? o.baseY ?? Number.NEGATIVE_INFINITY;
}

function topOf(o: AuraCameraClearanceVerticalExtent): number {
  if (o.maxY !== undefined) return o.maxY;
  return o.baseY !== undefined && o.height !== undefined ? o.baseY + o.height : Number.POSITIVE_INFINITY;
}

function writeResult(
  out: AuraCameraClearanceResult | undefined,
  x: number,
  y: number,
  z: number,
  fraction: number,
  distance: number,
  mode: AuraCameraClearanceMode,
  occluder: number
): AuraCameraClearanceResult {
  const r = out ?? { position: [0, 0, 0], fraction: 1, distance: 0, mode: "clear", clamped: false, occluder: -1 };
  r.position[0] = x;
  r.position[1] = y;
  r.position[2] = z;
  r.fraction = fraction;
  r.distance = distance;
  r.mode = mode;
  r.clamped = mode !== "clear";
  r.occluder = occluder;
  return r;
}

/**
 * Keeps a follow camera on the target's side of solid occluders.
 *
 * Sweeps `target -> desired` against `obstacles` and returns the furthest camera
 * position along that line that sits in front of every blocker (minus
 * `backoff`). Obstacles whose padded footprint already contains the target are
 * ignored (shortening the boom cannot get the lens out of them), as are
 * obstacles the segment passes over or under. When the clear point is nearer
 * than `minDistance` the camera stops at `minDistance`, or with
 * `allowVerticalRise` cranes up to `minDistance` above the target, keeping at
 * least `riseMinHorizontal` metres of horizontal offset (the risen position is
 * not re-swept).
 *
 * Pure and deterministic; the only allocation is the result, and none when
 * `out` is passed.
 *
 * @example
 * ```ts
 * import { computeCameraClearance, type AuraCameraClearanceObstacle, type AuraCameraClearanceResult } from "@aura3d/engine";
 *
 * const obstacles: AuraCameraClearanceObstacle[] = [
 *   { shape: "circle", x: 2, z: -6, radius: 0.4, baseY: 0, height: 3 },
 *   { shape: "box", x: -4, z: -9, halfX: 3, halfZ: 2, yaw: 0.5, minY: 0, maxY: 4.2 }
 * ];
 * const out: AuraCameraClearanceResult = { position: [0, 0, 0], fraction: 1, distance: 0, mode: "clear", clamped: false, occluder: -1 };
 * let boom = 1;
 * function updateCamera(chest: [number, number, number], desired: [number, number, number], dt: number) {
 *   const hit = computeCameraClearance(chest, desired, obstacles, { minDistance: 3, padding: 0.2 }, out);
 *   // snap in, ease back out over ~0.5 s (easing stays in the game)
 *   boom = hit.fraction < boom ? hit.fraction : boom + (hit.fraction - boom) * (1 - Math.exp(-4 * dt));
 *   const pose = computeCameraClearance(chest, desired, [], { minDistance: 3, allowVerticalRise: true, maxFraction: boom }, out);
 *   app.camera?.setPose({ position: pose.position, target: chest }); // `app` from createAuraApp
 * }
 * ```
 */
export function computeCameraClearance(
  target: AuraVec3,
  desired: AuraVec3,
  obstacles: readonly AuraCameraClearanceObstacle[],
  options: AuraCameraClearanceOptions = DEFAULT_OPTIONS,
  out?: AuraCameraClearanceResult
): AuraCameraClearanceResult {
  const tx = target[0], ty = target[1], tz = target[2];
  const dx = desired[0] - tx, dy = desired[1] - ty, dz = desired[2] - tz;
  const len = Math.hypot(dx, dy, dz);
  if (!(len >= 1e-6)) return writeResult(out, desired[0], desired[1], desired[2], 1, Number.isFinite(len) ? len : 0, "clear", -1);

  const padding = options.padding ?? 0.2;
  const backoff = options.backoff ?? 0;
  const minDistance = Math.max(0, options.minDistance ?? 0);
  const maxFraction = Math.max(0, Math.min(1, options.maxFraction ?? 1));
  const len2 = dx * dx + dz * dz;

  let best = 1;
  let occluder = -1;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i]!;
    const ox = tx - o.x, oz = tz - o.z;
    let lo: number, hi: number;
    if (o.shape === "circle") {
      const r = o.radius + padding;
      const c = ox * ox + oz * oz - r * r;
      if (c <= 0 || len2 < 1e-12) continue; // target inside the padded footprint, or a vertical segment that never enters it
      const b = 2 * (ox * dx + oz * dz);
      if (b >= 0) continue; // moving toward the camera moves away from the occluder
      const disc = b * b - 4 * len2 * c;
      if (disc <= 0) continue;
      const root = Math.sqrt(disc);
      const t0 = (-b - root) / (2 * len2);
      const t1 = (-b + root) / (2 * len2);
      if (t0 >= 1 || t1 <= 0) continue;
      lo = Math.max(0, t0);
      hi = Math.min(1, t1);
    } else {
      const hx = o.halfX + padding, hz = o.halfZ + padding;
      const yaw = o.yaw ?? 0;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      // world -> box-local (inverse of the +Y yaw rotation)
      const lx0 = ox * cs - oz * sn, lz0 = ox * sn + oz * cs;
      if (Math.abs(lx0) < hx && Math.abs(lz0) < hz) continue;
      const ldx = dx * cs - dz * sn, ldz = dx * sn + dz * cs;
      lo = 0;
      hi = 1;
      if (Math.abs(ldx) < EPS) {
        if (Math.abs(lx0) >= hx) continue;
      } else {
        let a = (-hx - lx0) / ldx, b = (hx - lx0) / ldx;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
        if (lo > hi) continue;
      }
      if (Math.abs(ldz) < EPS) {
        if (Math.abs(lz0) >= hz) continue;
      } else {
        let a = (-hz - lz0) / ldz, b = (hz - lz0) / ldz;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
        if (lo > hi) continue;
      }
    }
    // vertical slab: the part of the segment inside the footprint must also be inside [bottom, top]
    const bottom = bottomOf(o), top = topOf(o);
    if (Math.abs(dy) < EPS) {
      if (ty < bottom || ty > top) continue;
    } else {
      let a = (bottom - ty) / dy, b = (top - ty) / dy;
      if (a > b) { const tmp = a; a = b; b = tmp; }
      lo = Math.max(lo, a);
      hi = Math.min(hi, b);
      if (lo > hi) continue;
    }
    const f = lo - backoff / len;
    if (f < best) {
      best = f;
      occluder = i;
    }
  }

  let fraction = Math.max(0, Math.min(best, maxFraction));
  if (fraction >= 1) return writeResult(out, desired[0], desired[1], desired[2], 1, len, "clear", occluder);
  if (fraction * len >= minDistance) {
    return writeResult(out, tx + dx * fraction, ty + dy * fraction, tz + dz * fraction, fraction, fraction * len, "pull-in", occluder);
  }
  if (options.allowVerticalRise === true) {
    const h = Math.hypot(dx, dz);
    const gap = Math.max(options.riseMinHorizontal ?? 1, fraction * h);
    const rise = Math.sqrt(Math.max(0, minDistance * minDistance - gap * gap));
    const ux = h > 1e-4 ? dx / h : 0, uz = h > 1e-4 ? dz / h : 1;
    return writeResult(out, tx + ux * gap, ty + rise, tz + uz * gap, fraction, Math.hypot(gap, rise), "rise", occluder);
  }
  fraction = Math.min(1, minDistance / len);
  if (fraction >= 1) return writeResult(out, desired[0], desired[1], desired[2], 1, len, "clear", occluder);
  return writeResult(out, tx + dx * fraction, ty + dy * fraction, tz + dz * fraction, fraction, fraction * len, "pull-in", occluder);
}

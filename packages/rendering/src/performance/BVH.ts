import type { StaticSpatialBounds as BatchBounds, StaticSpatialItem as BatchSpatialItem } from "../SceneOptimization";

export {
  buildStaticBoundsBvh,
  queryStaticBoundsBvh,
  raycastStaticBoundsBvh,
  updateStaticBoundsBvh
} from "../SceneOptimization";
export type {
  StaticBoundsBvh,
  StaticBoundsBvhBuildDiagnostics,
  StaticBoundsBvhNode,
  StaticBoundsBvhQueryOptions,
  StaticBoundsBvhQueryResult,
  StaticBoundsBvhRaycastHit,
  StaticBoundsBvhRaycastResult,
  StaticBoundsBvhTraversalDiagnostics,
  StaticSpatialBounds,
  StaticSpatialItem
} from "../SceneOptimization";

/**
 * #181: a merged-bounds cull hint for one PRD 11 BatchPlan group — the union
 * of its members' bounds. Members listed here skip their own BVH nodes and
 * are culled once, as a group.
 */
export interface BatchCullHint<T = unknown> {
  readonly id: string;
  readonly bounds: BatchBounds;
  readonly memberIds: readonly string[];
  readonly members?: readonly T[];
}

/** Union of `bounds` (the merged bounds a BatchPlan group is culled against). */
export function mergeBatchBounds(bounds: readonly BatchBounds[]): BatchBounds {
  if (bounds.length === 0) throw new Error("mergeBatchBounds: empty group");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const box of bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, box.min[axis]!);
      max[axis] = Math.max(max[axis]!, box.max[axis]!);
    }
  }
  return { min, max };
}

/** Drop BatchPlan members from the per-item BVH input; their group hint culls them instead. */
export function excludeBatchedBvhItems<T>(items: readonly BatchSpatialItem<T>[], hints: readonly BatchCullHint[]): BatchSpatialItem<T>[] {
  const batched = new Set<string>();
  for (const hint of hints) for (const id of hint.memberIds) batched.add(id);
  return items.filter((item) => !batched.has(item.id));
}

/**
 * Cull each group once against its merged bounds: `isVisible` runs one test
 * per hint (not per member). Returns the visible member ids and the number
 * of bounds tests issued.
 */
export function cullBatchHints(hints: readonly BatchCullHint[], isVisible: (bounds: BatchBounds) => boolean): { readonly visibleMemberIds: readonly string[]; readonly visibleHints: readonly string[]; readonly tests: number } {
  const visibleMemberIds: string[] = [];
  const visibleHints: string[] = [];
  let tests = 0;
  for (const hint of hints) {
    tests += 1;
    if (!isVisible(hint.bounds)) continue;
    visibleHints.push(hint.id);
    visibleMemberIds.push(...hint.memberIds);
  }
  return { visibleMemberIds, visibleHints, tests };
}

import type { StaticBoundsBvh, StaticBoundsBvhNode, StaticSpatialBounds, StaticSpatialItem } from "../SceneOptimization";

type Vec3Tuple = readonly [number, number, number];

/** #215 (Q-11-2 from PRD-08): result of `sphereSweep`. */
export interface BvhSphereSweepResult<T = unknown> {
  readonly hit: boolean;
  /** Distance travelled by the sphere centre from `from` to first contact; `Infinity` on a miss. */
  readonly distance: number;
  /** Id of the BVH leaf node holding the hit item; `-1` on a miss. */
  readonly nodeId: number;
  readonly item: StaticSpatialItem<T> | null;
  /** Sphere centre at first contact; `null` on a miss. */
  readonly point: Vec3Tuple | null;
}

const MISS: BvhSphereSweepResult<never> = { hit: false, distance: Number.POSITIVE_INFINITY, nodeId: -1, item: null, point: null };

/**
 * Ray entry/exit against `bounds` grown by `radius` on every side; `null` when
 * the ray misses or the entry is past `maxT`. The grown box contains the
 * rounded box (bounds ⊕ sphere), so this is a conservative pre-test.
 */
function slab(origin: Vec3Tuple, dir: Vec3Tuple, bounds: StaticSpatialBounds, radius: number, maxT: number): readonly [number, number] | null {
  let tMin = 0;
  let tMax = maxT;
  for (let axis = 0; axis < 3; axis += 1) {
    const lo = bounds.min[axis]! - radius;
    const hi = bounds.max[axis]! + radius;
    const o = origin[axis]!;
    const d = dir[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  return [tMin, tMax];
}

/** Exact Euclidean distance from point `(x, y, z)` to the box (0 inside). */
function boxDistance(x: number, y: number, z: number, bounds: StaticSpatialBounds): number {
  const dx = Math.max(bounds.min[0] - x, 0, x - bounds.max[0]);
  const dy = Math.max(bounds.min[1] - y, 0, y - bounds.max[1]);
  const dz = Math.max(bounds.min[2] - z, 0, z - bounds.max[2]);
  return Math.hypot(dx, dy, dz);
}

/** Smallest root t >= 0 of a·t² + 2b·t + c = 0, or null. Callers ensure the start is outside. */
function firstRoot(a: number, b: number, c: number): number | null {
  if (a <= 0) return null;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 ? t : null;
}

/**
 * First contact of a sphere of `radius` moving from `origin` along unit `dir`
 * with the box, as a distance in `[0, maxT]`, or `null`. Analytic ray test
 * against the rounded box (bounds ⊕ sphere), which is exactly the union of the
 * box grown along one axis at a time (faces), 12 edge cylinders and 8 corner
 * spheres. Solved from the grown-box entry point so long sweeps stay precise;
 * tangent contacts resolve exactly (no iteration).
 */
function sweepBox(origin: Vec3Tuple, dir: Vec3Tuple, bounds: StaticSpatialBounds, radius: number, maxT: number): number | null {
  if (boxDistance(origin[0], origin[1], origin[2], bounds) <= radius) return 0;
  const range = slab(origin, dir, bounds, radius, maxT);
  if (!range) return null;
  const t0 = range[0];
  // Local frame: start at the grown-box entry, coordinates relative to the box minimum.
  const o: [number, number, number] = [0, 0, 0];
  const size: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    o[axis] = origin[axis]! + dir[axis]! * t0 - bounds.min[axis]!;
    size[axis] = bounds.max[axis]! - bounds.min[axis]!;
  }
  let best = Number.POSITIVE_INFINITY;

  // Faces: the box grown by `radius` along one axis only.
  for (let axis = 0; axis < 3; axis += 1) {
    const grown: StaticSpatialBounds = {
      min: [axis === 0 ? -radius : 0, axis === 1 ? -radius : 0, axis === 2 ? -radius : 0],
      max: [size[0] + (axis === 0 ? radius : 0), size[1] + (axis === 1 ? radius : 0), size[2] + (axis === 2 ? radius : 0)]
    };
    const hit = slab(o, dir, grown, 0, best);
    if (hit) best = Math.min(best, hit[0]);
  }
  const r2 = radius * radius;
  // Edges: cylinders of `radius` along each axis, at the 4 corners of the other two axes.
  for (let axis = 0; axis < 3; axis += 1) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const cu of [0, size[u]]) {
      for (const cv of [0, size[v]]) {
        const pu = o[u] - cu;
        const pv = o[v] - cv;
        const t = firstRoot(dir[u]! * dir[u]! + dir[v]! * dir[v]!, pu * dir[u]! + pv * dir[v]!, pu * pu + pv * pv - r2);
        if (t === null || t >= best) continue;
        const along = o[axis] + dir[axis]! * t;
        if (along >= 0 && along <= size[axis]) best = t;
      }
    }
  }
  // Corners: spheres of `radius` at the 8 box corners.
  for (const cx of [0, size[0]]) {
    for (const cy of [0, size[1]]) {
      for (const cz of [0, size[2]]) {
        const px = o[0] - cx;
        const py = o[1] - cy;
        const pz = o[2] - cz;
        const t = firstRoot(1, px * dir[0] + py * dir[1] + pz * dir[2], px * px + py * py + pz * pz - r2);
        if (t !== null && t < best) best = t;
      }
    }
  }
  if (!Number.isFinite(best)) return null;
  const distance = t0 + best;
  return distance <= maxT ? distance : null;
}

/**
 * #215: sweep a sphere from `from` to `to` through a static-bounds BVH and
 * return the first item it touches. A sphere already touching an item at
 * `from` hits at distance 0. Traversal visits children nearest-first and
 * prunes nodes whose grown-box entry is beyond the best hit.
 */
export function sphereSweep<T = unknown>(
  bvh: StaticBoundsBvh<T>,
  from: Vec3Tuple,
  to: Vec3Tuple,
  radius: number
): BvhSphereSweepResult<T> {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError("sphereSweep radius must be a finite non-negative number.");
  }
  const delta: Vec3Tuple = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  const dir: Vec3Tuple = length > 0 ? [delta[0] / length, delta[1] / length, delta[2] / length] : [0, 0, 0];
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = -1;
  let bestNode = -1;

  const visit = (node: StaticBoundsBvhNode): void => {
    const limit = Math.min(length, bestDistance);
    if (!slab(from, dir, node.bounds, radius, limit)) return;
    if (node.itemIndices) {
      for (const index of node.itemIndices) {
        const distance = sweepBox(from, dir, bvh.items[index]!.bounds, radius, Math.min(length, bestDistance));
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
          bestNode = node.id;
        }
      }
      return;
    }
    const children = [node.left, node.right].filter((child): child is StaticBoundsBvhNode => child !== undefined);
    const entries = children.map((child) => slab(from, dir, child.bounds, radius, Math.min(length, bestDistance))?.[0] ?? Number.POSITIVE_INFINITY);
    const order = entries[1] !== undefined && entries[1] < entries[0]! ? [1, 0] : [0, 1];
    for (const position of order) {
      const child = children[position];
      if (child && entries[position]! <= bestDistance) visit(child);
    }
  };

  visit(bvh.root);
  if (bestIndex < 0) return MISS;
  return {
    hit: true,
    distance: bestDistance,
    nodeId: bestNode,
    item: bvh.items[bestIndex]!,
    point: [from[0] + dir[0] * bestDistance, from[1] + dir[1] * bestDistance, from[2] + dir[2] * bestDistance]
  };
}

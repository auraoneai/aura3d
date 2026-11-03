import type { Vec3 } from "./Shape.js";

/**
 * Bounding volume hierarchy over an indexed triangle mesh.
 *
 * ## Why this exists
 *
 * Every grounding system in the library was solving against an *approximation of* a
 * surface rather than the surface itself. Turbo Drift sampled
 * `TRACK_SURFACE_Y - VERGE_DROP * shoulderFraction` — a flat plane plus an analytic
 * ramp — so on a banked or crowned corner the returned height was wrong and the car's
 * tyres passed through the visible road. The fix is to ask the real triangles, which
 * needs a spatial index: a naive per-sample scan over a 40k-triangle circuit is far too
 * slow to run four times per frame.
 *
 * ## Determinism
 *
 * Construction must not depend on iteration order or floating-point tie-breaking, or two
 * runs over the same mesh produce different trees and the same query returns different
 * hits. Splits use the median along the widest axis with a stable index-based tiebreak,
 * so the tree is a pure function of the input arrays.
 */

export interface MeshBVHBuildOptions {
  /** Stop splitting at this triangle count. Larger leaves trade traversal for tests. */
  readonly maxLeafTriangles?: number | undefined;
  /** Hard depth cap, a safety valve against degenerate geometry. */
  readonly maxDepth?: number | undefined;
}

interface BVHNode {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  /** Triangle indices, leaf nodes only. */
  readonly triangles?: readonly number[] | undefined;
  readonly left?: number | undefined;
  readonly right?: number | undefined;
}

export interface MeshBVH {
  readonly kind: "aura-mesh-bvh";
  readonly nodes: readonly BVHNode[];
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
  readonly maxDepth: number;
}

function triangleBounds(
  positions: Float32Array,
  indices: Uint32Array,
  triangle: number
): { min: [number, number, number]; max: [number, number, number]; centroid: [number, number, number] } {
  const a = indices[triangle * 3]! * 3;
  const b = indices[triangle * 3 + 1]! * 3;
  const c = indices[triangle * 3 + 2]! * 3;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const base of [a, b, c]) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[base + axis]!;
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    min,
    max,
    centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  };
}

export function buildMeshBVH(
  positions: Float32Array,
  indices: Uint32Array,
  options: MeshBVHBuildOptions = {}
): MeshBVH {
  if (indices.length % 3 !== 0) {
    throw new Error("buildMeshBVH requires an index count divisible by 3.");
  }
  const triangleCount = indices.length / 3;
  const maxLeafTriangles = Math.max(1, options.maxLeafTriangles ?? 8);
  const maxDepth = Math.max(1, options.maxDepth ?? 32);

  const bounds = Array.from({ length: triangleCount }, (_, index) => triangleBounds(positions, indices, index));
  const nodes: BVHNode[] = [];
  let observedDepth = 0;

  function build(triangles: number[], depth: number): number {
    observedDepth = Math.max(observedDepth, depth);
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const triangle of triangles) {
      const b = bounds[triangle]!;
      for (let axis = 0; axis < 3; axis += 1) {
        if (b.min[axis] < min[axis]) min[axis] = b.min[axis];
        if (b.max[axis] > max[axis]) max[axis] = b.max[axis];
      }
    }
    const index = nodes.length;
    if (triangles.length <= maxLeafTriangles || depth >= maxDepth) {
      nodes.push({ min, max, triangles: [...triangles] });
      return index;
    }
    // Split on the widest axis; median split keeps the tree balanced regardless of
    // how the mesh was authored.
    let axis = 0;
    let widest = -Infinity;
    for (let candidate = 0; candidate < 3; candidate += 1) {
      const extent = max[candidate] - min[candidate];
      if (extent > widest) {
        widest = extent;
        axis = candidate;
      }
    }
    // Stable sort: centroid, then triangle index. Without the index tiebreak, equal
    // centroids order differently between runs and the tree stops being deterministic.
    const sorted = [...triangles].sort((left, right) => {
      const delta = bounds[left]!.centroid[axis] - bounds[right]!.centroid[axis];
      return delta !== 0 ? delta : left - right;
    });
    const mid = Math.floor(sorted.length / 2);
    const leftTriangles = sorted.slice(0, mid);
    const rightTriangles = sorted.slice(mid);
    if (leftTriangles.length === 0 || rightTriangles.length === 0) {
      nodes.push({ min, max, triangles: [...triangles] });
      return index;
    }
    // Reserve this slot before recursing so child indices are stable.
    nodes.push({ min, max });
    const left = build(leftTriangles, depth + 1);
    const right = build(rightTriangles, depth + 1);
    nodes[index] = { min, max, left, right };
    return index;
  }

  if (triangleCount > 0) {
    build(Array.from({ length: triangleCount }, (_, index) => index), 0);
  } else {
    nodes.push({ min: [0, 0, 0], max: [0, 0, 0], triangles: [] });
  }

  return {
    kind: "aura-mesh-bvh",
    nodes,
    positions,
    indices,
    triangleCount,
    maxDepth: observedDepth
  };
}

/** Slab test. `tMax` lets a caller reject nodes beyond an existing best hit. */
function rayHitsAabb(
  origin: Vec3,
  inverseDirection: Vec3,
  node: BVHNode,
  tMax: number
): boolean {
  let tMin = 0;
  let tFar = tMax;
  for (let axis = 0; axis < 3; axis += 1) {
    const inv = inverseDirection[axis]!;
    let tNear = (node.min[axis] - origin[axis]!) * inv;
    let tFarAxis = (node.max[axis] - origin[axis]!) * inv;
    if (tNear > tFarAxis) {
      const swap = tNear;
      tNear = tFarAxis;
      tFarAxis = swap;
    }
    if (tNear > tMin) tMin = tNear;
    if (tFarAxis < tFar) tFar = tFarAxis;
    if (tMin > tFar) return false;
  }
  return true;
}

export interface MeshRayHit {
  readonly triangle: number;
  readonly distance: number;
  readonly point: Vec3;
  /** Geometric normal, unit length, oriented against the ray. */
  readonly normal: Vec3;
  /** Barycentric coordinates, for interpolating vertex attributes. */
  readonly barycentric: Vec3;
  /** True when the ray struck the back face. */
  readonly backFace: boolean;
}

/** Möller–Trumbore. Returns undefined for a miss or a degenerate triangle. */
function intersectTriangle(
  positions: Float32Array,
  indices: Uint32Array,
  triangle: number,
  origin: Vec3,
  direction: Vec3
): MeshRayHit | undefined {
  const ia = indices[triangle * 3]! * 3;
  const ib = indices[triangle * 3 + 1]! * 3;
  const ic = indices[triangle * 3 + 2]! * 3;
  const ax = positions[ia]!, ay = positions[ia + 1]!, az = positions[ia + 2]!;
  const bx = positions[ib]!, by = positions[ib + 1]!, bz = positions[ib + 2]!;
  const cx = positions[ic]!, cy = positions[ic + 1]!, cz = positions[ic + 2]!;

  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

  const px = direction[1]! * e2z - direction[2]! * e2y;
  const py = direction[2]! * e2x - direction[0]! * e2z;
  const pz = direction[0]! * e2y - direction[1]! * e2x;
  const det = e1x * px + e1y * py + e1z * pz;

  // A near-zero determinant means the ray is parallel to the plane, or the triangle is
  // degenerate (zero area). Both are misses, and both would divide by ~0 below.
  if (Math.abs(det) < 1e-12) return undefined;

  const invDet = 1 / det;
  const tx = origin[0]! - ax, ty = origin[1]! - ay, tz = origin[2]! - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-9 || u > 1 + 1e-9) return undefined;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (direction[0]! * qx + direction[1]! * qy + direction[2]! * qz) * invDet;
  if (v < -1e-9 || u + v > 1 + 1e-9) return undefined;

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 0) return undefined;

  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return undefined;
  nx /= length; ny /= length; nz /= length;

  // Orient the normal against the ray so callers always get an outward-facing surface.
  const facing = nx * direction[0]! + ny * direction[1]! + nz * direction[2]!;
  const backFace = facing > 0;
  if (backFace) { nx = -nx; ny = -ny; nz = -nz; }

  return {
    triangle,
    distance: t,
    point: [origin[0]! + direction[0]! * t, origin[1]! + direction[1]! * t, origin[2]! + direction[2]! * t],
    normal: [nx, ny, nz],
    barycentric: [1 - u - v, u, v],
    backFace
  };
}

export interface RaycastMeshOptions {
  readonly maxDistance?: number | undefined;
  /** Skip back faces. Off by default so a ray starting inside geometry still reports. */
  readonly cullBackFaces?: boolean | undefined;
}

/**
 * Nearest triangle hit along a ray, using the BVH.
 *
 * The direction is normalised internally so `distance` is always in world units; a
 * caller passing an unnormalised direction otherwise gets a distance scaled by its
 * length, which is a silent and very confusing error.
 */
export function raycastMesh(
  bvh: MeshBVH,
  origin: Vec3,
  direction: Vec3,
  options: RaycastMeshOptions = {}
): MeshRayHit | undefined {
  const length = Math.hypot(direction[0]!, direction[1]!, direction[2]!);
  if (!Number.isFinite(length) || length < 1e-12) return undefined;
  const dir: Vec3 = [direction[0]! / length, direction[1]! / length, direction[2]! / length];
  const maxDistance = options.maxDistance ?? Infinity;
  const inverse: Vec3 = [
    1 / (dir[0] === 0 ? 1e-30 : dir[0]),
    1 / (dir[1] === 0 ? 1e-30 : dir[1]),
    1 / (dir[2] === 0 ? 1e-30 : dir[2])
  ];

  let best: MeshRayHit | undefined;
  let bestDistance = maxDistance;
  const stack: number[] = bvh.nodes.length > 0 ? [0] : [];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = bvh.nodes[nodeIndex];
    if (!node) continue;
    if (!rayHitsAabb(origin, inverse, node, bestDistance)) continue;
    if (node.triangles) {
      for (const triangle of node.triangles) {
        const hit = intersectTriangle(bvh.positions, bvh.indices, triangle, origin, dir);
        if (!hit) continue;
        if (hit.distance > bestDistance) continue;
        if (options.cullBackFaces && hit.backFace) continue;
        best = hit;
        bestDistance = hit.distance;
      }
      continue;
    }
    if (node.left !== undefined) stack.push(node.left);
    if (node.right !== undefined) stack.push(node.right);
  }
  return best;
}

/** Reference implementation, for testing the BVH. Never use in a hot path. */
export function raycastMeshBruteForce(
  bvh: MeshBVH,
  origin: Vec3,
  direction: Vec3,
  options: RaycastMeshOptions = {}
): MeshRayHit | undefined {
  const length = Math.hypot(direction[0]!, direction[1]!, direction[2]!);
  if (!Number.isFinite(length) || length < 1e-12) return undefined;
  const dir: Vec3 = [direction[0]! / length, direction[1]! / length, direction[2]! / length];
  const maxDistance = options.maxDistance ?? Infinity;
  let best: MeshRayHit | undefined;
  for (let triangle = 0; triangle < bvh.triangleCount; triangle += 1) {
    const hit = intersectTriangle(bvh.positions, bvh.indices, triangle, origin, dir);
    if (!hit || hit.distance > maxDistance) continue;
    if (options.cullBackFaces && hit.backFace) continue;
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best;
}

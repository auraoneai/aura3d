import { Box3, Vector3 } from "@aura3d/math";
import type { StaticBoundsIntersector, StaticSpatialItem } from "../SceneOptimization";

/**
 * PRD-11 11-S5 culler — allocation-free frustum culling over packed bounds.
 *
 * `bounds` (Float32Array or Float64Array) packs `count` AABBs as `[minX, minY, minZ, maxX, maxY, maxZ]` per
 * item; `planes` packs 6 planes as `[nx, ny, nz, d]` (inside when
 * `n·p + d >= 0`, the `@aura3d/math` `Plane` convention). `out[i]` is set to
 * 1 when item `i` is inside or intersecting, 0 when culled. Returns the
 * visible count. Uses the positive-vertex test, so it is conservative
 * (never culls a visible box). No allocation per call or per item.
 */
type PackedFloats = Float32Array | Float64Array;

export function cull(bounds: PackedFloats, count: number, planes: PackedFloats, out: Uint8Array): number {
  if (bounds.length < count * 6) {
    throw new RangeError(`cull: bounds holds ${Math.floor(bounds.length / 6)} boxes, count is ${count}.`);
  }
  if (out.length < count) {
    throw new RangeError(`cull: out holds ${out.length} entries, count is ${count}.`);
  }
  const planeCount = Math.floor(planes.length / 4);
  let visible = 0;
  for (let item = 0; item < count; item += 1) {
    const base = item * 6;
    const minX = bounds[base]!;
    const minY = bounds[base + 1]!;
    const minZ = bounds[base + 2]!;
    const maxX = bounds[base + 3]!;
    const maxY = bounds[base + 4]!;
    const maxZ = bounds[base + 5]!;
    // Same emptiness rule as Box3.isEmpty (`max < min` on any axis), so NaN bounds stay visible like before.
    let inside = !(maxX < minX || maxY < minY || maxZ < minZ);
    for (let plane = 0; inside && plane < planeCount; plane += 1) {
      const p = plane * 4;
      const nx = planes[p]!;
      const ny = planes[p + 1]!;
      const nz = planes[p + 2]!;
      const distance = nx * (nx >= 0 ? maxX : minX) + ny * (ny >= 0 ? maxY : minY) + nz * (nz >= 0 ? maxZ : minZ) + planes[p + 3]!;
      if (distance < 0) inside = false;
    }
    out[item] = inside ? 1 : 0;
    if (inside) visible += 1;
  }
  return visible;
}

interface PlaneLike {
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly constant: number;
}

/** Packs `@aura3d/math` `Frustum.planes` (or any `{normal, constant}` list) into `out` for `cull`. */
export function packFrustumPlanes<O extends PackedFloats = Float64Array>(planes: readonly PlaneLike[], out?: O): O {
  const target = (out ?? new Float64Array(planes.length * 4)) as O;
  for (let index = 0; index < planes.length; index += 1) {
    const plane = planes[index]!;
    target[index * 4] = plane.normal.x;
    target[index * 4 + 1] = plane.normal.y;
    target[index * 4 + 2] = plane.normal.z;
    target[index * 4 + 3] = plane.constant;
  }
  return target;
}

function frustumPlanes(frustum: StaticBoundsIntersector): readonly PlaneLike[] | null {
  const planes = (frustum as { readonly planes?: unknown }).planes;
  if (!Array.isArray(planes) || planes.length === 0) return null;
  for (const plane of planes) {
    const candidate = plane as Partial<PlaneLike> | null;
    if (!candidate || typeof candidate.constant !== "number" || !candidate.normal) return null;
  }
  return planes as readonly PlaneLike[];
}

/**
 * Culls static items against a frustum. When the intersector exposes
 * `planes` (the `@aura3d/math` `Frustum`), this runs the allocation-free
 * plane test with no per-item `Box3`/`Vector3`; other intersectors keep the
 * `intersectsBox(Box3)` contract.
 */
export function cullStaticItems<T>(items: readonly StaticSpatialItem<T>[], frustum: StaticBoundsIntersector): readonly StaticSpatialItem<T>[] {
  const planes = frustumPlanes(frustum);
  if (!planes) {
    return items.filter((item) => frustum.intersectsBox(new Box3(
      new Vector3(item.bounds.min[0], item.bounds.min[1], item.bounds.min[2]),
      new Vector3(item.bounds.max[0], item.bounds.max[1], item.bounds.max[2])
    )));
  }
  const packedPlanes = packFrustumPlanes(planes);
  // Float64 keeps the old Box3 path's exact boundary behaviour.
  const bounds = new Float64Array(items.length * 6);
  for (let index = 0; index < items.length; index += 1) {
    const { min, max } = items[index]!.bounds;
    bounds.set(min, index * 6);
    bounds.set(max, index * 6 + 3);
  }
  const mask = new Uint8Array(items.length);
  cull(bounds, items.length, packedPlanes, mask);
  return items.filter((_, index) => mask[index] === 1);
}

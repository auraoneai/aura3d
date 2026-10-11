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

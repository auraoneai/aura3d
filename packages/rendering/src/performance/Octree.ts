import type { StaticSpatialBounds, StaticSpatialItem } from "../SceneOptimization";

export interface OctreeNode<T = unknown> {
  readonly bounds: StaticSpatialBounds;
  readonly items: readonly StaticSpatialItem<T>[];
}

export function createFlatOctree<T>(bounds: StaticSpatialBounds, items: readonly StaticSpatialItem<T>[]): OctreeNode<T> {
  return { bounds, items };
}

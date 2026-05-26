import { Box3, Vector3 } from "@aura3d/math";
import type { StaticBoundsIntersector, StaticSpatialItem } from "../SceneOptimization";

export function cullStaticItems<T>(items: readonly StaticSpatialItem<T>[], frustum: StaticBoundsIntersector): readonly StaticSpatialItem<T>[] {
  return items.filter((item) => frustum.intersectsBox(new Box3(
    new Vector3(item.bounds.min[0], item.bounds.min[1], item.bounds.min[2]),
    new Vector3(item.bounds.max[0], item.bounds.max[1], item.bounds.max[2])
  )));
}

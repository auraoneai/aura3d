import { Box3, Ray } from "@galileo3d/math";

export interface RaycastTarget<T = unknown> {
  readonly id: string;
  readonly bounds: Box3;
  readonly payload?: T;
}

export interface RaycastHit<T = unknown> {
  readonly target: RaycastTarget<T>;
  readonly distance: number;
}

export class Raycaster<T = unknown> {
  intersectBounds(ray: Ray, targets: readonly RaycastTarget<T>[]): readonly RaycastHit<T>[] {
    return targets
      .map((target) => ({ target, distance: ray.intersectBox(target.bounds)?.distanceTo(ray.origin) ?? Number.POSITIVE_INFINITY }))
      .filter((hit) => Number.isFinite(hit.distance))
      .sort((left, right) => left.distance - right.distance);
  }
}

import type { Ray } from "@galileo3d/math";
import type { SceneNode } from "@galileo3d/scene";

type Tuple3 = readonly [number, number, number];

export interface EditorPickTarget {
  readonly id: string;
  readonly node: SceneNode;
  readonly bounds: {
    readonly min: Tuple3;
    readonly max: Tuple3;
  };
}

export interface EditorPickHit {
  readonly target: EditorPickTarget;
  readonly distance: number;
}

export class PickingService {
  private readonly targets = new Map<string, EditorPickTarget>();

  setTargets(targets: readonly EditorPickTarget[]): void {
    this.targets.clear();
    for (const target of targets) {
      this.targets.set(target.id, target);
    }
  }

  addTarget(target: EditorPickTarget): void {
    this.targets.set(target.id, target);
  }

  removeTarget(id: string): void {
    this.targets.delete(id);
  }

  pick(ray: Ray): EditorPickHit | undefined {
    return [...this.targets.values()]
      .map((target) => ({ target, distance: intersectBounds(ray, target.bounds) }))
      .filter((hit): hit is EditorPickHit => hit.distance !== undefined)
      .sort((a, b) => a.distance - b.distance)[0];
  }
}

function intersectBounds(ray: Ray, bounds: EditorPickTarget["bounds"]): number | undefined {
  let tmin = Number.NEGATIVE_INFINITY;
  let tmax = Number.POSITIVE_INFINITY;

  for (const axis of [0, 1, 2] as const) {
    const origin = axis === 0 ? ray.origin.x : axis === 1 ? ray.origin.y : ray.origin.z;
    const direction = axis === 0 ? ray.direction.x : axis === 1 ? ray.direction.y : ray.direction.z;
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    if (Math.abs(direction) < 1e-8) {
      if (origin < min || origin > max) return undefined;
      continue;
    }
    const invD = 1 / direction;
    let near = (min - origin) * invD;
    let far = (max - origin) * invD;
    if (near > far) [near, far] = [far, near];
    tmin = Math.max(tmin, near);
    tmax = Math.min(tmax, far);
    if (tmin > tmax) return undefined;
  }

  const distance = tmin >= 0 ? tmin : tmax;
  return distance >= 0 ? distance : undefined;
}

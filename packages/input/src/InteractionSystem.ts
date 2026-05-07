import type { Ray } from "@galileo3d/math";
import type { SceneNode } from "@galileo3d/scene";
import type { InputSnapshot } from "./InputSnapshot";

type Tuple3 = readonly [number, number, number];

export interface InteractionBounds {
  readonly min: Tuple3;
  readonly max: Tuple3;
}

export interface InteractionTarget {
  readonly id: string;
  readonly node?: SceneNode;
  readonly bounds: InteractionBounds;
}

export interface InteractionHit {
  readonly target: InteractionTarget;
  readonly distance: number;
}

export type InteractionEventType = "hover-enter" | "hover-exit" | "pointer-down" | "drag-start" | "drag" | "drag-end" | "click";

export interface InteractionEvent {
  readonly type: InteractionEventType;
  readonly hit?: InteractionHit;
  readonly target?: InteractionTarget;
  readonly snapshot: InputSnapshot;
}

export type InteractionListener = (event: InteractionEvent) => void;
export type InteractionRayProvider = (snapshot: InputSnapshot) => Ray;
export type InteractionTargetProvider = () => readonly InteractionTarget[];

export class InteractionSystem {
  private readonly listeners = new Set<InteractionListener>();
  private hovered?: InteractionTarget;
  private pressed?: InteractionTarget;
  private dragging = false;

  constructor(
    private readonly rayProvider: InteractionRayProvider,
    private readonly targetProvider: InteractionTargetProvider
  ) {}

  subscribe(listener: InteractionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(snapshot: InputSnapshot): InteractionHit | undefined {
    const hit = this.pick(this.rayProvider(snapshot));
    const target = hit?.target;

    if (this.hovered?.id !== target?.id) {
      if (this.hovered) this.emit({ type: "hover-exit", target: this.hovered, snapshot });
      if (target) this.emit({ type: "hover-enter", hit, target, snapshot });
      this.hovered = target;
    }

    if (snapshot.button(0).pressed && target) {
      this.pressed = target;
      this.dragging = false;
      this.emit({ type: "pointer-down", hit, target, snapshot });
    }

    if (this.pressed && snapshot.button(0).down && (snapshot.pointer.deltaX !== 0 || snapshot.pointer.deltaY !== 0)) {
      this.emit({ type: this.dragging ? "drag" : "drag-start", hit, target: this.pressed, snapshot });
      this.dragging = true;
    }

    if (this.pressed && snapshot.button(0).released) {
      this.emit({ type: this.dragging ? "drag-end" : "click", hit, target: this.pressed, snapshot });
      this.pressed = undefined;
      this.dragging = false;
    }

    return hit;
  }

  pick(ray: Ray): InteractionHit | undefined {
    const hits = this.targetProvider()
      .map((target) => ({ target, distance: intersectBounds(ray, target.bounds) }))
      .filter((hit): hit is InteractionHit => hit.distance !== undefined)
      .sort((a, b) => a.distance - b.distance);
    return hits[0];
  }

  private emit(event: InteractionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

function intersectBounds(ray: Ray, bounds: InteractionBounds): number | undefined {
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

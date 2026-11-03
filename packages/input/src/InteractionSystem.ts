import type { Ray } from "@aura3d/math";
import type { SceneNode } from "@aura3d/scene";
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

export type InteractionEventType = "hover-enter" | "hover-exit" | "pointer-down" | "pointer-cancel" | "drag-start" | "drag" | "drag-end" | "drag-cancel" | "click";

export interface InteractionEvent {
  readonly type: InteractionEventType;
  readonly hit?: InteractionHit;
  readonly target?: InteractionTarget;
  readonly pointerId?: number;
  readonly snapshot: InputSnapshot;
}

export type InteractionListener = (event: InteractionEvent) => void;
export type InteractionRayProvider = (snapshot: InputSnapshot) => Ray;
export type InteractionTargetProvider = () => readonly InteractionTarget[];

export class InteractionSystem {
  private readonly listeners = new Set<InteractionListener>();
  private readonly states = new Map<number, { hovered?: InteractionTarget; pressed?: InteractionTarget; dragging: boolean }>();
  private disposed = false;
  private contactMode = false;

  constructor(
    private readonly rayProvider: InteractionRayProvider,
    private readonly targetProvider: InteractionTargetProvider
  ) {}

  subscribe(listener: InteractionListener): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(snapshot: InputSnapshot): InteractionHit | undefined {
    if (this.disposed) return undefined;
    if (snapshot.pointer.cancellationReason) {
      for (const id of [...this.states.keys()]) this.cancel(id, snapshot);
      return undefined;
    }
    if (snapshot.pointer.contacts.length > 0 || snapshot.pointer.cancellations.length > 0) this.contactMode = true;
    for (const cancellation of snapshot.pointer.cancellations) this.cancel(cancellation.id, snapshot);

    let primaryHit: InteractionHit | undefined;
    let firstHit: InteractionHit | undefined;
    let sawPrimary = false;
    if (snapshot.pointer.contacts.length > 0) {
      const present = new Set(snapshot.pointer.contacts.map(contact => contact.id));
      for (const id of [...this.states.keys()]) if (!present.has(id)) this.cancel(id, snapshot);
      for (const contact of snapshot.pointer.contacts) {
        if (contact.cancelled) continue;
        const view = snapshot.forContact(contact);
        const hit = this.updateContact(contact.id, view);
        if (firstHit === undefined) firstHit = hit;
        if (contact.id === snapshot.pointer.primaryId) { primaryHit = hit; sawPrimary = true; }
        if (contact.released && (contact.pointerType === "touch" || !contact.overTarget)) this.endHover(contact.id, view);
      }
      return sawPrimary ? primaryHit : firstHit;
    } else if (this.contactMode) {
      for (const id of [...this.states.keys()]) this.cancel(id, snapshot);
    } else if (snapshot.pointer.cancellations.length === 0) {
      primaryHit = this.updateContact(-1, snapshot);
    }
    return primaryHit;
  }

  dispose(): void {
    this.disposed = true;
    this.states.clear();
    this.listeners.clear();
  }

  private updateContact(id: number, snapshot: InputSnapshot): InteractionHit | undefined {
    const hit = this.pick(this.rayProvider(snapshot));
    const target = hit?.target;
    const state = this.states.get(id) ?? { dragging: false };
    this.states.set(id, state);
    const pointerId = id < 0 ? undefined : id;
    if (state.hovered?.id !== target?.id) {
      if (state.hovered) this.emit({ type: "hover-exit", target: state.hovered, snapshot, pointerId });
      if (target) this.emit({ type: "hover-enter", hit, target, snapshot, pointerId });
      state.hovered = target;
    }
    if (snapshot.button(0).pressed && target) {
      state.pressed = target;
      state.dragging = false;
      this.emit({ type: "pointer-down", hit, target, snapshot, pointerId });
    }
    if (state.pressed && snapshot.button(0).down && (snapshot.pointer.deltaX !== 0 || snapshot.pointer.deltaY !== 0)) {
      this.emit({ type: state.dragging ? "drag" : "drag-start", hit, target: state.pressed, snapshot, pointerId });
      state.dragging = true;
    }
    if (state.pressed && snapshot.button(0).released) {
      if (state.dragging || target?.id === state.pressed.id) {
        this.emit({ type: state.dragging ? "drag-end" : "click", hit, target: state.pressed, snapshot, pointerId });
      }
      state.pressed = undefined;
      state.dragging = false;
    }
    return hit;
  }

  private cancel(id: number, snapshot: InputSnapshot): void {
    const state = this.states.get(id);
    if (!state) return;
    if (state.pressed) this.emit({ type: state.dragging ? "drag-cancel" : "pointer-cancel", target: state.pressed, snapshot, pointerId: id < 0 ? undefined : id });
    this.endHover(id, snapshot);
    this.states.delete(id);
  }

  private endHover(id: number, snapshot: InputSnapshot): void {
    const state = this.states.get(id);
    if (state?.hovered) this.emit({ type: "hover-exit", target: state.hovered, snapshot, pointerId: id < 0 ? undefined : id });
    if (state) state.hovered = undefined;
    if (!state?.pressed) this.states.delete(id);
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

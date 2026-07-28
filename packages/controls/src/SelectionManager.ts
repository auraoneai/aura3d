import type { ControlObject3DLike } from "./NativeControlTypes";

export interface SelectionManagerChange {
  readonly previous: readonly ControlObject3DLike[];
  readonly current: readonly ControlObject3DLike[];
  readonly added: readonly ControlObject3DLike[];
  readonly removed: readonly ControlObject3DLike[];
}

export type SelectionManagerListener = (change: SelectionManagerChange) => void;

/**
 * Observable object-identity selection owner. This is intentionally separate
 * from editor-runtime's id selection: controls callers select object
 * references, while editor documents select stable string/number ids.
 */
export class SelectionManager {
  private readonly selectedObjects = new Set<ControlObject3DLike>();
  private readonly listeners = new Set<SelectionManagerListener>();

  get selected(): ReadonlySet<ControlObject3DLike> {
    return this.selectedObjects;
  }

  current(): readonly ControlObject3DLike[] {
    return Object.freeze([...this.selectedObjects]);
  }

  select(object: ControlObject3DLike, additive = false): void {
    const next = additive
      ? new Set([...this.selectedObjects, object])
      : new Set([object]);
    this.replace(next);
  }

  deselect(object: ControlObject3DLike): void {
    const next = new Set(this.selectedObjects);
    next.delete(object);
    this.replace(next);
  }

  clear(): void {
    this.replace(new Set());
  }

  has(object: ControlObject3DLike): boolean {
    return this.selectedObjects.has(object);
  }

  toggle(object: ControlObject3DLike, additive = true): void {
    if (this.selectedObjects.has(object)) {
      this.deselect(object);
      return;
    }
    this.select(object, additive);
  }

  prune(alive: (object: ControlObject3DLike) => boolean): void {
    this.replace(new Set([...this.selectedObjects].filter(alive)));
  }

  subscribe(listener: SelectionManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.selectedObjects.clear();
  }

  private replace(next: Set<ControlObject3DLike>): void {
    const previous = [...this.selectedObjects];
    const current = [...next];
    if (sameIdentityOrder(previous, current)) return;
    const added = current.filter((object) => !this.selectedObjects.has(object));
    const removed = previous.filter((object) => !next.has(object));
    this.selectedObjects.clear();
    for (const object of current) this.selectedObjects.add(object);
    const event = Object.freeze({
      previous: Object.freeze(previous),
      current: Object.freeze(current),
      added: Object.freeze(added),
      removed: Object.freeze(removed)
    });
    for (const listener of [...this.listeners]) listener(event);
  }
}

function sameIdentityOrder(
  left: readonly ControlObject3DLike[],
  right: readonly ControlObject3DLike[]
): boolean {
  return left.length === right.length && left.every((object, index) => object === right[index]);
}

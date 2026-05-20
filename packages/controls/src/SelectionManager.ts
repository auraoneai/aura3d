import type { ControlObject3DLike } from "./NativeControlTypes";

export class SelectionManager {
  readonly selected = new Set<ControlObject3DLike>();

  select(object: ControlObject3DLike, additive = false): void {
    if (!additive) this.clear();
    this.selected.add(object);
  }

  deselect(object: ControlObject3DLike): void {
    this.selected.delete(object);
  }

  clear(): void {
    this.selected.clear();
  }
}

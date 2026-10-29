import type { AuraRuntimeNodeHandle, AuraTransformSpec } from "@aura3d/engine";

type V3 = [number, number, number];
interface Spec {
  position: V3;
  rotation: V3;
  scale: V3;
}

export const HIDDEN_POS: V3 = [0, -80, 120];
export const HIDDEN_SCALE: V3 = [0.0001, 0.0001, 0.0001];

/** Build-time transforms for an instanced node of `capacity` slots, all parked out of view. */
export function parked(capacity: number): AuraTransformSpec[] {
  return Array.from({ length: capacity }, () => ({ position: [...HIDDEN_POS] as V3, scale: [...HIDDEN_SCALE] as V3 }));
}

/**
 * One instanced node (`instances.*`) driven as a per-frame pool: `begin`, `add` each drawn entity, `commit`. Only the slots in
 * use are submitted, so empty capacity costs no vertex work in the colour or shadow passes; an empty pool hides the node.
 * Spec objects are preallocated and reused (the engine copies them on `setInstances`).
 */
export class InstancePool {
  readonly capacity: number;
  count = 0;
  private readonly specs: Spec[];
  private readonly view: Spec[] = [];
  private shown = true;

  constructor(private readonly handle: AuraRuntimeNodeHandle, capacity: number) {
    this.capacity = capacity;
    this.specs = Array.from({ length: capacity }, () => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }));
  }

  begin(): void {
    this.count = 0;
  }

  /** Add one instance; returns false (and draws nothing) when the pool is full. */
  add(px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): boolean {
    if (this.count >= this.capacity) return false;
    const s = this.specs[this.count++]!;
    s.position[0] = px; s.position[1] = py; s.position[2] = pz;
    s.rotation[0] = rx; s.rotation[1] = ry; s.rotation[2] = rz;
    s.scale[0] = sx; s.scale[1] = sy; s.scale[2] = sz;
    return true;
  }

  commit(): void {
    if (this.count === 0) {
      if (this.shown) {
        this.handle.setVisible(false);
        this.shown = false;
      }
      return;
    }
    this.view.length = this.count;
    for (let i = 0; i < this.count; i++) this.view[i] = this.specs[i]!;
    this.handle.setInstances(this.view);
    if (!this.shown) {
      this.handle.setVisible(true);
      this.shown = true;
    }
  }
}

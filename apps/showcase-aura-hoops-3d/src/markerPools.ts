import type { AuraRuntimeNodeHandle, AuraTransformSpec } from "@aura3d/engine";

/**
 * H47-PF1: per-athlete ground markers (shadow discs, team rings, Jam auras) and the drill cones and their rings draw as one
 * instanced node per kind instead of one primitive each. A `MarkerSlot` keeps the call shape the game already uses on a
 * runtime node (`setPosition`, `setScale`, `setVisible`), and `MarkerPool.flush()` submits only the visible slots once per
 * rendered frame, so the per-instance transform is `T * R(base) * S(scale)` with the primitive `size` folded in by the
 * engine, the same result the separate nodes gave. An empty pool hides the node.
 */
type V3 = [number, number, number];

/** Parked transforms for the build-time node: capacity slots out of view. */
export function parkedTransforms(capacity: number): AuraTransformSpec[] {
  return Array.from({ length: capacity }, () => ({ position: [0, -80, 0] as V3, scale: [0.0001, 0.0001, 0.0001] as V3 }));
}

export interface MarkerSlot {
  setPosition(x: number, y: number, z: number): MarkerSlot;
  setScale(scale: number | readonly [number, number, number]): MarkerSlot;
  setVisible(visible: boolean): MarkerSlot;
}

interface SlotState {
  position: V3;
  scale: V3;
  visible: boolean;
}

/** The node surface a pool needs (a subset of `AuraRuntimeNodeHandle`). */
export type MarkerPoolHandle = Pick<AuraRuntimeNodeHandle, "setInstances" | "setVisible">;

export class MarkerPool {
  private readonly slots: SlotState[];
  private readonly specs: { position: V3; rotation: V3; scale: V3 }[];
  private readonly view: AuraTransformSpec[] = [];
  private dirty = true;
  private shown = true;

  constructor(
    private readonly handle: MarkerPoolHandle | undefined,
    capacity: number,
    private readonly rotation: V3 = [0, 0, 0],
    initialScale: number | readonly [number, number, number] = 1,
    initialVisible = true
  ) {
    const s = toV3(initialScale);
    this.slots = Array.from({ length: capacity }, () => ({ position: [0, 0, 0] as V3, scale: [...s] as V3, visible: initialVisible }));
    this.specs = Array.from({ length: capacity }, () => ({ position: [0, 0, 0] as V3, rotation: [...rotation] as V3, scale: [1, 1, 1] as V3 }));
  }

  get capacity(): number {
    return this.slots.length;
  }

  slot(index: number): MarkerSlot {
    const state = this.slots[index];
    if (!state) throw new RangeError(`MarkerPool slot ${index} is outside capacity ${this.slots.length}.`);
    const pool = this;
    const slot: MarkerSlot = {
      setPosition(x, y, z) {
        if (state.position[0] !== x || state.position[1] !== y || state.position[2] !== z) {
          state.position[0] = x; state.position[1] = y; state.position[2] = z;
          pool.dirty = true;
        }
        return slot;
      },
      setScale(scale) {
        const sx = typeof scale === "number" ? scale : scale[0];
        const sy = typeof scale === "number" ? scale : scale[1];
        const sz = typeof scale === "number" ? scale : scale[2];
        if (state.scale[0] !== sx || state.scale[1] !== sy || state.scale[2] !== sz) {
          state.scale[0] = sx; state.scale[1] = sy; state.scale[2] = sz;
          pool.dirty = true;
        }
        return slot;
      },
      setVisible(visible) {
        if (state.visible !== visible) {
          state.visible = visible;
          pool.dirty = true;
        }
        return slot;
      }
    };
    return slot;
  }

  /** Visible slot count after the last flush (tests and evidence). */
  visibleCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.visible) n += 1;
    return n;
  }

  /** The transforms the next flush submits (visible slots only). */
  transforms(): readonly AuraTransformSpec[] {
    let n = 0;
    for (const s of this.slots) {
      if (!s.visible) continue;
      const spec = this.specs[n++]!;
      spec.position[0] = s.position[0]; spec.position[1] = s.position[1]; spec.position[2] = s.position[2];
      spec.rotation[0] = this.rotation[0]; spec.rotation[1] = this.rotation[1]; spec.rotation[2] = this.rotation[2];
      spec.scale[0] = s.scale[0]; spec.scale[1] = s.scale[1]; spec.scale[2] = s.scale[2];
    }
    this.view.length = n;
    for (let i = 0; i < n; i++) this.view[i] = this.specs[i]!;
    return this.view;
  }

  /** Submit the visible slots once per rendered frame; no-op when nothing changed. */
  flush(): void {
    if (!this.dirty || !this.handle) return;
    this.dirty = false;
    const view = this.transforms();
    if (view.length === 0) {
      if (this.shown) {
        this.handle.setVisible(false);
        this.shown = false;
      }
      return;
    }
    this.handle.setInstances(view);
    if (!this.shown) {
      this.handle.setVisible(true);
      this.shown = true;
    }
  }
}

function toV3(scale: number | readonly [number, number, number]): V3 {
  return typeof scale === "number" ? [scale, scale, scale] : [scale[0], scale[1], scale[2]];
}

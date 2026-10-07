/**
 * L-7 interpolation store (PRD-08 §6.4) — prev/curr transform pairs per
 * handle plus the C-37 time members (`interpolate`, `timeScale`,
 * `teleport`).
 *
 * The store never writes resolved transforms back onto the handles: it keeps
 * its own copies, because writing render-space values back would poison the
 * next `capturePrevious`. `resolve(alpha)` returns the blended transforms —
 * the render seam (FixedStepDriver) decides where they land.
 *
 * Per-node `timeScale` semantics: the effective alpha is `alpha * scale`, so
 * scale 0 pins the resolved transform at the pre-stop state (the visual
 * freeze of T-4's scoped hit-stop) and scale 1 is normal motion.
 */

import type { AuraRuntimeNodeHandle, AuraVec3 } from "../index.js";
import { quatFromEulerXYZ, quatSlerp, quatToEulerXYZ } from "../camera/quat.js";

export interface AuraInterpolationTransform {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: AuraVec3;
}

export interface AuraInterpolableHandle {
  readonly id: string;
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: number | AuraVec3;
}

interface InterpolationState {
  prev: AuraInterpolationTransform;
  curr: AuraInterpolationTransform;
  interpolate: boolean;
  timeScale: number;
  snapNext: boolean;
}

function readTransform(handle: AuraInterpolableHandle): AuraInterpolationTransform {
  const s = handle.scale;
  return {
    position: [handle.position[0], handle.position[1], handle.position[2]],
    rotation: [handle.rotation[0], handle.rotation[1], handle.rotation[2]],
    scale: typeof s === "number" ? [s, s, s] : [s[0], s[1], s[2]]
  };
}

function mixTransform(
  a: AuraInterpolationTransform,
  b: AuraInterpolationTransform,
  t: number
): AuraInterpolationTransform {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    position: [
      lerp(a.position[0], b.position[0]),
      lerp(a.position[1], b.position[1]),
      lerp(a.position[2], b.position[2])
    ],
    rotation: quatToEulerXYZ(
      quatSlerp(quatFromEulerXYZ(a.rotation), quatFromEulerXYZ(b.rotation), t)
    ),
    scale: [lerp(a.scale[0], b.scale[0]), lerp(a.scale[1], b.scale[1]), lerp(a.scale[2], b.scale[2])]
  };
}

export class InterpolationStore {
  private readonly handles = new Map<string, AuraInterpolableHandle>();
  private readonly states = new Map<string, InterpolationState>();

  /**
   * C-37 attachment point (extension `prd08.time`): defines `interpolate`,
   * `timeScale`, and `teleport()` on a runtime handle. `interpolate = true`
   * registers the handle with the store.
   */
  attachTimeExtension(handle: AuraRuntimeNodeHandle): void {
    const target = handle as AuraRuntimeNodeHandle & {
      interpolate?: boolean;
      timeScale?: number;
      teleport?: (x: number, y: number, z: number, rotation?: AuraVec3) => AuraRuntimeNodeHandle;
    };
    const id = handle.id;
    const interpolable = handle as unknown as AuraInterpolableHandle;
    if (!("interpolate" in target)) {
      let enabled = false;
      Object.defineProperty(target, "interpolate", {
        configurable: true,
        enumerable: true,
        get: () => enabled,
        set: (value: boolean) => {
          enabled = Boolean(value);
          if (enabled) this.registerHandle(interpolable);
          else this.unregisterHandle(id);
        }
      });
    }
    if (!("timeScale" in target)) {
      let timeScale = 1;
      Object.defineProperty(target, "timeScale", {
        configurable: true,
        enumerable: true,
        get: () => timeScale,
        set: (value: number) => {
          timeScale = Math.max(0, value);
          this.setTimeScale(id, timeScale);
        }
      });
    }
    if (!("teleport" in target)) {
      target.teleport = (x, y, z, rotation) => {
        if (typeof handle.setPosition === "function") handle.setPosition(x, y, z);
        else (handle as { position: AuraVec3 }).position = [x, y, z];
        if (rotation) {
          if (typeof handle.setRotation === "function") handle.setRotation(rotation[0], rotation[1], rotation[2]);
          else (handle as { rotation: AuraVec3 }).rotation = [rotation[0], rotation[1], rotation[2]];
        }
        this.teleport(id);
        return handle;
      };
    }
  }

  registerHandle(handle: AuraInterpolableHandle): void {
    this.handles.set(handle.id, handle);
    const current = readTransform(handle);
    const state = this.states.get(handle.id);
    if (state) {
      state.interpolate = true;
      return;
    }
    this.states.set(handle.id, {
      prev: current,
      curr: current,
      interpolate: true,
      timeScale: 1,
      snapNext: false
    });
  }

  unregisterHandle(id: string): void {
    this.handles.delete(id);
    const state = this.states.get(id);
    if (state) state.interpolate = false;
  }

  setTimeScale(id: string, scale: number): void {
    const state = this.states.get(id);
    if (state) state.timeScale = Math.max(0, scale);
  }

  /** Marks the handle so the next `resolve` snaps to the latest state. */
  teleport(id: string): void {
    const state = this.states.get(id);
    if (state) state.snapNext = true;
  }

  /** Runs before each substep's `advance`: curr → prev. */
  capturePrevious(): void {
    for (const state of this.states.values()) state.prev = state.curr;
  }

  /** Runs after each substep's `advance`: reads truth back from the handles. */
  captureCurrent(): void {
    for (const [id, state] of this.states) {
      const handle = this.handles.get(id);
      if (!handle || !state.interpolate) continue;
      state.curr = readTransform(handle);
    }
  }

  /**
   * Blends prev→curr at `alpha` (multiplied by the node's timeScale) and
   * returns every resolved transform keyed by handle id.
   */
  resolve(alpha: number): ReadonlyMap<string, AuraInterpolationTransform> {
    const out = new Map<string, AuraInterpolationTransform>();
    const t = Math.max(0, Math.min(1, alpha));
    for (const [id, state] of this.states) {
      if (!state.interpolate) {
        out.set(id, state.curr);
        continue;
      }
      if (state.snapNext) {
        state.snapNext = false;
        state.prev = state.curr;
      }
      out.set(id, mixTransform(state.prev, state.curr, t * state.timeScale));
    }
    return out;
  }

  /** Resolved transform for one handle at `alpha` (same rules as resolve). */
  resolveHandle(id: string, alpha: number): AuraInterpolationTransform | undefined {
    const state = this.states.get(id);
    if (!state) return undefined;
    const t = Math.max(0, Math.min(1, alpha));
    if (state.snapNext || !state.interpolate) {
      if (state.snapNext) {
        state.snapNext = false;
        state.prev = state.curr;
      }
      return state.curr;
    }
    return mixTransform(state.prev, state.curr, t * state.timeScale);
  }

  get size(): number {
    return this.states.size;
  }
}

export function createInterpolationStore(): InterpolationStore {
  return new InterpolationStore();
}

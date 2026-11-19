/**
 * Fixed-step render interpolation built around the snapshot / blend / snap shape the games hand-rolled
 * (`shownOf(state)`, `blendShown(a, b, t)` with a snap distance, `viewOf(state, shown)`), with an allocation-free mode
 * that reuses four pooled snapshots instead of building new objects every step and frame.
 */
import type { AlphaSource } from "./presenter";

/** A 3-vector as an object (`{ x, y, z }`), the shape most sims keep positions in. */
export interface MixVec3Object {
  x: number;
  y: number;
  z: number;
}

/** What the snap test measures: a scalar track coordinate, a tuple or an `{ x, y, z }` position. */
export type SnapshotPosition = number | readonly number[] | Readonly<MixVec3Object>;

/** Snap when the measured position moves further than `distance` in one step (a teleport, respawn, restart or wrap). */
export interface SnapshotSnapDistance<S> {
  readonly distance: number;
  readonly position: (snapshot: S) => SnapshotPosition;
}

/** Either a predicate (`true` shows `next` unblended) or a distance rule. */
export type SnapshotSnap<S> = ((previous: S, next: S) => boolean) | SnapshotSnapDistance<S>;

export interface SnapshotInterpolatorOptions<S> {
  /**
   * Capture what the renderer needs of the simulation right now. With `create`, write into `out` and return it;
   * without, return a fresh value each call.
   */
  readonly snapshot: (out?: S) => S;
  /** Blend two snapshots (`t` 0 at `a`, 1 at `b`). With `create`, write into `out` and return it. */
  readonly blend: (a: S, b: S, t: number, out?: S) => S;
  /** Show the newer snapshot unblended when this says the step jumped. Checked before `blend`. */
  readonly snap?: SnapshotSnap<S>;
  /**
   * Allocation-free mode: builds four empty snapshots up front (two history slots, one for the latest state and one
   * for the blend result) and passes them to `snapshot` and `blend` as `out`. Each value `present` returns is reused
   * by a later call, so read it (or copy what you keep) before the next `afterStep` or `present`.
   */
  readonly create?: () => S;
}

export interface SnapshotInterpolator<S> {
  /** Call at the end of every simulation step. */
  afterStep(): void;
  /** Call after a teleport, restart or scene change so the next frame does not smear between unrelated states. */
  reset(): void;
  /**
   * The state to draw this frame: `blend(previous, current, alpha)` while `live` and `alpha < 1`, `current` when the
   * step snapped, and a fresh snapshot otherwise (`alpha >= 1`, menus, manual QA runs). `source` is a
   * `createFixedStepLoop` (its `alpha`) or a number.
   */
  present(source: AlphaSource | number, live?: boolean): S;
  /** The snapshot taken at the step before last. */
  readonly previous: S;
  /** The snapshot taken at the last step. */
  readonly current: S;
}

function measure(p: SnapshotPosition, q: SnapshotPosition): number {
  if (typeof p === "number" && typeof q === "number") return Math.abs(q - p);
  if (typeof p !== "number" && typeof q !== "number") {
    if (Array.isArray(p) && Array.isArray(q)) {
      const a = p as readonly number[], b = q as readonly number[];
      if (a.length === 1 && b.length === 1) return Math.abs(b[0]! - a[0]!);
      if (a.length === 2 && b.length === 2) return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
      return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    }
    if (!Array.isArray(p) && !Array.isArray(q)) {
      const a = p as Readonly<MixVec3Object>, b = q as Readonly<MixVec3Object>;
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
  }
  throw new TypeError("createSnapshotInterpolator: snap.position must return the same shape for every snapshot");
}

function snapTest<S>(snap: SnapshotSnap<S> | undefined): ((a: S, b: S) => boolean) | undefined {
  if (snap === undefined || typeof snap === "function") return snap;
  const { distance, position } = snap;
  if (!(distance >= 0)) throw new RangeError("createSnapshotInterpolator: snap.distance must be >= 0");
  return (a, b) => measure(position(a), position(b)) > distance;
}

/**
 * Draw a fixed-step simulation between its last two steps, so a 60 Hz sim advances on every frame of a 120 or
 * 144 Hz display. Same `afterStep` / `reset` / `present(loop, live)` calls as `createFixedStepPresenter`, plus a snap
 * rule kept out of the blend and an allocation-free pooled mode. Replays and `stepFrames` are untouched: only the
 * drawn state is blended.
 *
 * @example
 * ```ts
 * const presenter = createSnapshotInterpolator({
 *   snapshot: () => ({ s: run.s, lane: run.lane }),
 *   blend: (a, b, t) => ({ s: mixNumber(a.s, b.s, t), lane: mixNumber(a.lane, b.lane, t) }),
 *   snap: { distance: 20, position: (p) => p.s }
 * });
 * const loop = createFixedStepLoop({ step: (dt) => { stepRun(run, dt); presenter.afterStep(); }, render: () => draw(presenter.present(loop)) });
 * ```
 */
export function createSnapshotInterpolator<S>(options: SnapshotInterpolatorOptions<S>): SnapshotInterpolator<S> {
  const { snapshot, blend, create } = options;
  const snaps = snapTest(options.snap);
  const slotA = create?.();
  const slotB = create?.();
  const latest = create?.();
  const blended = create?.();

  let previous = snapshot(slotA);
  let current = previous;

  return {
    afterStep() {
      if (create) {
        const spare = previous === current ? (current === slotA ? slotB : slotA) : previous;
        previous = current;
        current = snapshot(spare);
      } else {
        previous = current;
        current = snapshot();
      }
    },
    reset() {
      previous = snapshot(slotA);
      current = previous;
    },
    present(source, live = true) {
      if (!live) return snapshot(latest);
      const alpha = typeof source === "number" ? source : source.alpha;
      if (alpha >= 1) return snapshot(latest);
      if (snaps?.(previous, current)) return current;
      return blend(previous, current, Math.max(0, Math.min(1, alpha)), blended);
    },
    get previous() {
      return previous;
    },
    get current() {
      return current;
    }
  };
}

/** `a + (b - a) * t`: the linear mix every presenter writes (exact at `t = 0`; `t` is not clamped). */
export function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Component-wise {@link mixNumber} of two 3-vectors, as tuples or `{ x, y, z }` objects. Pass `out` (same shape) to
 * write the result in place instead of allocating.
 */
export function mixVec3(a: readonly [number, number, number], b: readonly [number, number, number], t: number, out?: [number, number, number]): [number, number, number];
export function mixVec3<V extends MixVec3Object = MixVec3Object>(a: Readonly<MixVec3Object>, b: Readonly<MixVec3Object>, t: number, out?: V): V;
export function mixVec3(
  a: readonly [number, number, number] | Readonly<MixVec3Object>,
  b: readonly [number, number, number] | Readonly<MixVec3Object>,
  t: number,
  out?: [number, number, number] | MixVec3Object
): [number, number, number] | MixVec3Object {
  if (Array.isArray(a)) {
    const p = a as readonly [number, number, number], q = b as readonly [number, number, number];
    const o = (out as [number, number, number] | undefined) ?? [0, 0, 0];
    o[0] = p[0] + (q[0] - p[0]) * t;
    o[1] = p[1] + (q[1] - p[1]) * t;
    o[2] = p[2] + (q[2] - p[2]) * t;
    return o;
  }
  const p = a as Readonly<MixVec3Object>, q = b as Readonly<MixVec3Object>;
  const o = (out as MixVec3Object | undefined) ?? { x: 0, y: 0, z: 0 };
  o.x = p.x + (q.x - p.x) * t;
  o.y = p.y + (q.y - p.y) * t;
  o.z = p.z + (q.z - p.z) * t;
  return o;
}

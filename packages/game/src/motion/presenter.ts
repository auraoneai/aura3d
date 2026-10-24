import { createRenderInterpolator, lerpAngle } from "./smoothing";

/** Anything with a 0..1 progress through the current simulation step, such as `createFixedStepLoop`. */
export interface AlphaSource {
  readonly alpha: number;
}

export interface FixedStepPresenterOptions<T> {
  /** Capture what the renderer needs of the simulation right now. Must return a fresh value each call. */
  snapshot: () => T;
  /** Blend two snapshots; `t` is 0 at `a` and 1 at `b`. */
  blend: (a: T, b: T, t: number) => T;
}

export interface FixedStepPresenter<T> {
  /** Call at the end of every simulation step. */
  afterStep(): void;
  /** Call after a teleport, restart or scene change so the next frame does not smear between unrelated states. */
  reset(): void;
  /** The state to draw this frame: interpolated while `live`, the latest step otherwise (menus, manual QA runs). */
  present(source: AlphaSource, live?: boolean): T;
}

/**
 * Render interpolation in three calls: a 60 Hz simulation shown on a 120 or 144 Hz display advances on every
 * frame instead of every other one. Replays and `stepFrames` are untouched because only the drawn pose is blended.
 */
export function createFixedStepPresenter<T>(options: FixedStepPresenterOptions<T>): FixedStepPresenter<T> {
  const interpolator = createRenderInterpolator<T>(options.blend);
  interpolator.reset(options.snapshot());
  return {
    afterStep() {
      interpolator.push(options.snapshot());
    },
    reset() {
      interpolator.reset(options.snapshot());
    },
    present(source, live = true) {
      const latest = (): T => options.snapshot();
      if (!live) return latest();
      const alpha = source.alpha;
      if (alpha >= 1) return latest();
      return interpolator.sample(alpha) ?? latest();
    }
  };
}

export interface RecordBlendOptions<T> {
  /** Property names holding angles in radians: blended along the shortest arc. */
  angleKeys?: readonly string[];
  /** A step that moves the tracked position further than this is a teleport or wrap: show the new state. */
  snapDistance?: number;
  /** Position used for the snap test. */
  position?: (value: T) => readonly number[];
}

function blendValue(a: unknown, b: unknown, t: number, key: string, angleKeys: ReadonlySet<string>): unknown {
  if (typeof a === "number" && typeof b === "number") {
    return angleKeys.has(key) ? lerpAngle(a, b, t) : a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((x, i) => blendValue(x, b[i], t, key, angleKeys));
  }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && !(a instanceof DataView) && (a as unknown as ArrayLike<number>).length === (b as unknown as ArrayLike<number>).length) {
    const aa = a as unknown as ArrayLike<number>;
    const bb = b as unknown as ArrayLike<number>;
    const out = new (a.constructor as new (n: number) => { [i: number]: number })((aa).length);
    for (let i = 0; i < aa.length; i += 1) out[i] = aa[i]! + (bb[i]! - aa[i]!) * t;
    return out;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(b as object)) {
      out[k] = k in (a as object)
        ? blendValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t, k, angleKeys)
        : (b as Record<string, unknown>)[k];
    }
    return out;
  }
  return b;
}

/**
 * A blend function for plain pose records: numbers interpolate, listed angle keys take the shortest arc, arrays
 * and typed arrays interpolate per element, and everything else (clip names, flags) takes the latest value.
 */
export function createRecordBlend<T extends object>(options: RecordBlendOptions<T> = {}): (a: T, b: T, t: number) => T {
  const angleKeys = new Set(options.angleKeys ?? []);
  return (a, b, t) => {
    if (options.snapDistance !== undefined && options.position) {
      const pa = options.position(a);
      const pb = options.position(b);
      let d2 = 0;
      for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) d2 += (pb[i]! - pa[i]!) ** 2;
      if (d2 > options.snapDistance * options.snapDistance) return b;
    }
    return blendValue(a, b, t, "", angleKeys) as T;
  };
}

/**
 * GU47 WP-10 (E-J) audioReactive: a per-frame juice binding that turns one
 * band of an `AudioAnalyser` spectrum into a smoothed 0..1 envelope and maps
 * it onto a value range (emissive pulse, light flicker, HUD glow, camera
 * bob). `update(dt)` allocates nothing: it reads the analyser's reused byte
 * buffer, averages the band bins in place and advances a one-pole
 * attack/release envelope. Reduced motion (or any caller "still" state)
 * holds the rest value `range[0]`.
 */
import type { AudioAnalyser } from "@aura3d/audio";

/** The read side of `AudioAnalyser` the binding uses (structural: any reused byte spectrum fits). */
export type AudioReactiveSource = Pick<AudioAnalyser, "getFrequencyData">;

export interface AudioReactiveOptions {
  /** Spectrum band as fractions of the bin count, `[from, to)` in 0..1. Default `[0, 1]` (whole spectrum). */
  readonly band?: readonly [number, number];
  /** Rise time constant in seconds. Default 0.03. `0` follows rises instantly. */
  readonly attack?: number;
  /** Fall time constant in seconds. Default 0.25. `0` follows falls instantly. */
  readonly release?: number;
  /** Noise floor in 0..1 of the byte scale, removed before normalising. Default 0.05. */
  readonly floor?: number;
  /** Gain applied after the floor, before clamping to 0..1. Default 1. */
  readonly gain?: number;
  /** Output mapping `range[0] + level * (range[1] - range[0])`. Default `[0, 1]`. */
  readonly range?: readonly [number, number];
  /** When it returns true the binding rests: level 0, value `range[0]` (reduced motion, low tier, pause). */
  readonly reducedMotion?: () => boolean;
  /** Called with the mapped value on every `update` (for example `v => material.emissiveIntensity = v`). */
  readonly apply?: (value: number) => void;
}

export interface AudioReactive {
  /** Reads the analyser once, advances the envelope by `dtSeconds` and returns the mapped value. Allocation-free. */
  update(dtSeconds: number): number;
  /** Last mapped value (`range[0]` before the first update). */
  readonly value: number;
  /** Last envelope level in 0..1. */
  readonly level: number;
  /** Drops the envelope to rest without reading the analyser. */
  reset(): void;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function finiteOr(x: number | undefined, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

/** One-pole smoothing coefficient for a time constant; `tau <= 0` means follow instantly. */
function smoothing(dtSeconds: number, tau: number): number {
  if (tau <= 0) return 1;
  if (dtSeconds <= 0) return 0;
  return 1 - Math.exp(-dtSeconds / tau);
}

export function audioReactive(source: AudioReactiveSource, options: AudioReactiveOptions = {}): AudioReactive {
  const from = clamp01(finiteOr(options.band?.[0], 0));
  const to = clamp01(finiteOr(options.band?.[1], 1));
  if (!(to > from)) throw new RangeError(`audioReactive band must satisfy 0 <= from < to <= 1 (got [${from}, ${to}])`);
  const attack = Math.max(0, finiteOr(options.attack, 0.03));
  const release = Math.max(0, finiteOr(options.release, 0.25));
  const floor = Math.min(0.99, clamp01(finiteOr(options.floor, 0.05)));
  const gain = Math.max(0, finiteOr(options.gain, 1));
  const rest = finiteOr(options.range?.[0], 0);
  const span = finiteOr(options.range?.[1], 1) - rest;
  const reducedMotion = options.reducedMotion;
  const apply = options.apply;

  let level = 0;
  let value = rest;

  return {
    update(dtSeconds: number): number {
      if (reducedMotion?.() === true) {
        level = 0;
        value = rest;
      } else {
        const bins = source.getFrequencyData();
        const count = bins.length;
        let target = 0;
        if (count > 0) {
          const lo = Math.min(count - 1, Math.floor(from * count));
          const hi = Math.max(lo + 1, Math.min(count, Math.ceil(to * count)));
          let sum = 0;
          for (let i = lo; i < hi; i += 1) sum += bins[i]!;
          const mean = sum / (hi - lo) / 255;
          target = clamp01(((mean - floor) / (1 - floor)) * gain);
        }
        const dt = Number.isFinite(dtSeconds) ? dtSeconds : 0;
        level += (target - level) * smoothing(dt, target > level ? attack : release);
        value = rest + level * span;
      }
      apply?.(value);
      return value;
    },
    get value(): number {
      return value;
    },
    get level(): number {
      return level;
    },
    reset(): void {
      level = 0;
      value = rest;
    }
  };
}

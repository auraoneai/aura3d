import type { GameAudioContextLike } from "../game/GameAudio.js";

/** Acoustic summary rendered from a deterministic offline QA audio capture. */
export interface QaAudioTelemetry {
  /** Analyzed duration in seconds. */
  readonly durationSeconds: number;
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Channel count analyzed. */
  readonly channels: number;
  /** Peak sample magnitude in dBFS (`-Infinity` when completely silent). */
  readonly peakDb: number;
  /** Root-mean-square level in dBFS (`-Infinity` when completely silent). */
  readonly rmsDb: number;
  /** Total sample values across channels with `|sample| >= 1`. */
  readonly clippedSamples: number;
  /** Fraction (`0..1`) of 100 ms windows whose max-channel RMS falls below `-60 dBFS` (`0.001`). */
  readonly silentWindowRatio: number;
  /** Distinct sound onsets: 10 ms windows above `-40 dBFS` (`0.01`), `> 2x` previous window, `>= 50 ms` apart. */
  readonly soundCount: number;
  /** True when peak amplitude is `0` or every 100 ms window is below `-60 dBFS`. */
  readonly silent: boolean;
}

export interface QaOfflineAudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface QaOfflineAudioContextLike extends Omit<GameAudioContextLike, "resume"> {
  resume?(): Promise<void>;
  startRendering(): Promise<QaOfflineAudioBufferLike>;
}

export type QaOfflineAudioContextFactory = (
  numberOfChannels: number,
  length: number,
  sampleRate: number
) => QaOfflineAudioContextLike;

export interface QaOfflineAudioOptions {
  /** Maximum offline capture duration in seconds (clamped to `0.1..120`). Default `10`. */
  readonly maxDurationSeconds?: number;
  /** Sample rate in Hz. Default `22050` (fast headless render, sufficient for level/onset checks). */
  readonly sampleRate?: number;
  /** Channel count. Default `2`. */
  readonly channels?: number;
  /** External deterministic simulation clock in seconds. When omitted, `advance()` / `setTime()` drives it. */
  readonly nowSeconds?: () => number;
  /** Custom `OfflineAudioContext` factory for Node unit tests or custom Web Audio shims. */
  readonly createOfflineContext?: QaOfflineAudioContextFactory;
}

export interface QaOfflineAudio {
  /** Deterministic `GameAudioContextLike` whose `currentTime` tracks the simulation clock and schedules `.value = x` writes at `currentTime`. */
  readonly context: GameAudioContextLike & QaOfflineAudioContextLike;
  /** Current simulated audio clock in seconds. */
  readonly currentTime: number;
  /** Advance the internal simulation clock by `dtSeconds` (`>= 0`). */
  advance(dtSeconds: number): number;
  /** Pin the internal simulation clock to `seconds` (`>= 0`). */
  setTime(seconds: number): number;
  /** Render the offline context and analyze up to `durationSeconds` (defaults to `currentTime` or `maxDurationSeconds`). */
  render(durationSeconds?: number): Promise<QaAudioTelemetry>;
}

function linearToDb(amplitude: number): number {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : Number.NEGATIVE_INFINITY;
}

/**
 * Analyze PCM channel buffers for silence, clipping, peak/RMS dBFS, and distinct sound-onset count.
 * Pure TypeScript so Node unit tests and browser headless checks run the exact same math.
 */
export function analyzeQaAudioSamples(
  channels: readonly Float32Array[],
  sampleRate: number,
  durationSeconds?: number
): QaAudioTelemetry {
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) {
    throw new RangeError(`sampleRate must be finite and > 0 (received ${String(sampleRate)}).`);
  }
  const channelCount = channels.length;
  const minLength = channelCount === 0 ? 0 : Math.min(...channels.map((c) => c.length));
  const requestedSamples =
    durationSeconds !== undefined && Number.isFinite(durationSeconds)
      ? Math.max(0, Math.min(minLength, Math.round(durationSeconds * sampleRate)))
      : minLength;

  if (channelCount === 0 || requestedSamples === 0) {
    return {
      durationSeconds: 0,
      sampleRate,
      channels: channelCount,
      peakDb: Number.NEGATIVE_INFINITY,
      rmsDb: Number.NEGATIVE_INFINITY,
      clippedSamples: 0,
      silentWindowRatio: 1,
      soundCount: 0,
      silent: true
    };
  }

  let peak = 0;
  let clippedSamples = 0;
  let sumSquares = 0;
  for (let c = 0; c < channelCount; c++) {
    const data = channels[c]!;
    for (let i = 0; i < requestedSamples; i++) {
      const abs = Math.abs(data[i]!);
      if (abs > peak) peak = abs;
      if (abs >= 1) clippedSamples++;
      sumSquares += abs * abs;
    }
  }

  const windowMaxChannelRms = (from: number, len: number): number => {
    let maxRms = 0;
    const end = Math.min(requestedSamples, from + len);
    const count = end - from;
    if (count <= 0) return 0;
    for (let c = 0; c < channelCount; c++) {
      const data = channels[c]!;
      let sum = 0;
      for (let i = from; i < end; i++) {
        const sample = data[i]!;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / count);
      if (rms > maxRms) maxRms = rms;
    }
    return maxRms;
  };

  // 100 ms silence windows (< -60 dBFS == 0.001 amplitude).
  const win100 = Math.max(1, Math.round(sampleRate * 0.1));
  let total100 = 0;
  let silent100 = 0;
  for (let i = 0; i + win100 <= requestedSamples; i += win100) {
    total100++;
    if (windowMaxChannelRms(i, win100) < 0.001) silent100++;
  }
  if (total100 === 0) {
    total100 = 1;
    if (windowMaxChannelRms(0, requestedSamples) < 0.001) silent100 = 1;
  }

  // 10 ms onset windows (> -40 dBFS == 0.01 amplitude, > 2x prior window, >= 50 ms refractory gap).
  const win10 = Math.max(1, Math.round(sampleRate * 0.01));
  const minOnsetGap = Math.max(1, Math.round(sampleRate * 0.05));
  let soundCount = 0;
  let prevRms = 0;
  let lastOnsetSample = -minOnsetGap * 2;
  for (let i = 0; i + win10 <= requestedSamples; i += win10) {
    const rms = windowMaxChannelRms(i, win10);
    if (rms > 0.01 && rms > 2 * prevRms && i - lastOnsetSample >= minOnsetGap) {
      soundCount++;
      lastOnsetSample = i;
    }
    prevRms = rms;
  }

  const totalSamplesAllChannels = requestedSamples * channelCount;
  const rms = Math.sqrt(sumSquares / Math.max(1, totalSamplesAllChannels));
  const silentWindowRatio = silent100 / total100;

  return {
    durationSeconds: requestedSamples / sampleRate,
    sampleRate,
    channels: channelCount,
    peakDb: linearToDb(peak),
    rmsDb: linearToDb(rms),
    clippedSamples,
    silentWindowRatio,
    soundCount,
    silent: peak === 0 || silentWindowRatio >= 1
  };
}

function isAudioParamLike(value: unknown): value is { value: number; setValueAtTime?: (v: number, t: number) => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { setValueAtTime?: unknown }).setValueAtTime === "function"
  );
}

const PATCHED_PARAM = Symbol("auraQaClockSyncedParam");

/**
 * In an `OfflineAudioContext`, assigning `param.value = v` mid-run applies at `t = 0` (so muting at 30 s
 * silences the entire render). Wrapping node `AudioParam` properties routes `.value = v` to
 * `setValueAtTime(v, clock())` while preserving synchronous `.value` reads, without mutating global prototypes.
 */
function instrumentNodeAudioParams<T>(node: T, clock: () => number): T {
  if (typeof node !== "object" || node === null) return node;
  const record = node as Record<string, unknown>;
  for (const key of ["gain", "frequency", "detune", "pan", "playbackRate", "Q", " knee", "threshold", "ratio", "attack", "release"]) {
    const param = record[key.trim()];
    if (!isAudioParamLike(param) || (param as Record<symbol, unknown>)[PATCHED_PARAM]) continue;
    let shadowed: number | undefined;
    const proto = Object.getPrototypeOf(param) as object | null;
    const desc =
      Object.getOwnPropertyDescriptor(param, "value") ??
      (proto ? Object.getOwnPropertyDescriptor(proto, "value") : undefined);
    if (!desc || (desc.configurable === false && !desc.set)) continue;
    const readOriginal = (): number => (desc.get ? (desc.get.call(param) as number) : (desc.value as number));
    const writeOriginal = (v: number): void => {
      if (desc.set) desc.set.call(param, v);
    };
    Object.defineProperty(param, PATCHED_PARAM, { value: true, enumerable: false });
    Object.defineProperty(param, "value", {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get(): number {
        return shadowed !== undefined ? shadowed : readOriginal();
      },
      set(next: number): void {
        shadowed = next;
        try {
          param.setValueAtTime?.(next, Math.max(0, clock()));
        } catch {
          writeOriginal(next);
        }
      }
    });
  }
  return node;
}

function defaultOfflineContextFactory(): QaOfflineAudioContextFactory {
  const g = globalThis as unknown as {
    OfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => QaOfflineAudioContextLike;
    webkitOfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => QaOfflineAudioContextLike;
  };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  if (!Ctor) {
    throw new Error("createQaOfflineAudio: OfflineAudioContext is unavailable in this environment; pass createOfflineContext.");
  }
  return (numberOfChannels, length, sampleRate) => new Ctor(numberOfChannels, length, sampleRate);
}

/**
 * Create a deterministic, step-clock-locked `OfflineAudioContext` harness compatible with `createGameAudio({ context })`.
 */
export function createQaOfflineAudio(options: QaOfflineAudioOptions = {}): QaOfflineAudio {
  const maxDurationSeconds = Math.min(120, Math.max(0.1, options.maxDurationSeconds ?? 10));
  const sampleRate = options.sampleRate ?? 22050;
  const channels = options.channels ?? 2;
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) {
    throw new RangeError(`sampleRate must be finite and > 0 (received ${String(sampleRate)}).`);
  }
  if (!Number.isInteger(channels) || channels < 1) {
    throw new RangeError(`channels must be an integer >= 1 (received ${String(channels)}).`);
  }

  let internalSeconds = 0;
  const clock = (): number => Math.max(0, options.nowSeconds ? options.nowSeconds() : internalSeconds);
  const factory = options.createOfflineContext ?? defaultOfflineContextFactory();
  const totalSamples = Math.max(1, Math.round(maxDurationSeconds * sampleRate));
  const raw = factory(channels, totalSamples, sampleRate);

  const wrapFactory = <K extends keyof QaOfflineAudioContextLike>(method: K): void => {
    const fn = raw[method];
    if (typeof fn !== "function") return;
    const bound = (fn as (...args: unknown[]) => unknown).bind(raw);
    try {
      Object.defineProperty(raw, method, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => instrumentNodeAudioParams(bound(...args), clock)
      });
    } catch {
      // Leave read-only host methods untouched if non-configurable.
    }
  };

  for (const method of [
    "createGain",
    "createOscillator",
    "createBufferSource",
    "createBiquadFilter",
    "createStereoPanner",
    "createPanner",
    "createDynamicsCompressor",
    "createDelay"
  ] as const) {
    wrapFactory(method as keyof QaOfflineAudioContextLike);
  }

  try {
    Object.defineProperty(raw, "currentTime", { configurable: true, get: clock });
  } catch {
    // Custom mock may manage currentTime via Proxy.
  }
  try {
    Object.defineProperty(raw, "state", { configurable: true, get: () => "running" });
  } catch {
    // Ignore if already a running getter.
  }
  for (const lifecycle of ["resume", "suspend", "close"] as const) {
    try {
      Object.defineProperty(raw, lifecycle, {
        configurable: true,
        writable: true,
        value: () => Promise.resolve()
      });
    } catch {
      // Ignore non-configurable mock methods.
    }
  }

  let renderedPromise: Promise<QaOfflineAudioBufferLike> | null = null;

  return {
    context: raw as GameAudioContextLike & QaOfflineAudioContextLike,
    get currentTime() {
      return clock();
    },
    advance(dtSeconds) {
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        throw new RangeError(`dtSeconds must be finite and >= 0 (received ${String(dtSeconds)}).`);
      }
      internalSeconds += dtSeconds;
      return clock();
    },
    setTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new RangeError(`seconds must be finite and >= 0 (received ${String(seconds)}).`);
      }
      internalSeconds = seconds;
      return clock();
    },
    async render(durationSeconds) {
      if (!renderedPromise) {
        renderedPromise = raw.startRendering();
      }
      const buffer = await renderedPromise;
      const channelBuffers: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        channelBuffers.push(buffer.getChannelData(c));
      }
      const effectiveDuration =
        durationSeconds ?? (clock() > 0 ? Math.min(clock(), maxDurationSeconds) : maxDurationSeconds);
      return analyzeQaAudioSamples(channelBuffers, buffer.sampleRate, effectiveDuration);
    }
  };
}

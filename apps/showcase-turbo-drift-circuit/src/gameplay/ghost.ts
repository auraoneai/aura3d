/**
 * Turbo Drift Circuit time-trial ghost (PRD TDC-A1 / C9 input replay).
 *
 * A lap is recorded as a fixed list of state samples taken from the *same* `game.racing`
 * snapshot the HUD and chassis already read, so recording adds no second simulation and
 * cannot perturb the race (the recorder only reads). Playback interpolates those samples
 * against a lap clock and drives a visual-only translucent car node.
 *
 * Honesty boundary enforced here and in `main.ts`:
 * - the ghost has no collision body and never enters `game.planarCollisionWorld`;
 * - the ghost is excluded from gap, position, checkpoint and lap logic;
 * - playback is sample interpolation of a lap that actually happened on this route.
 */
export const TURBO_GHOST_SCHEMA = "aura3d-turbo-ghost-recording/1.0";

export interface TurboGhostSample {
  /** Seconds since the start of the recorded lap. */
  readonly t: number;
  /** Game-plane position from `GameRacingSnapshot.position`. */
  readonly x: number;
  readonly y: number;
  /** Kit heading, radians. */
  readonly heading: number;
  readonly speed: number;
  /** Lap progress 0..1 at this sample. */
  readonly progress: number;
}

export interface TurboGhostRecording {
  readonly schema: typeof TURBO_GHOST_SCHEMA;
  /** Recorded lap duration in seconds. */
  readonly lapSeconds: number;
  readonly sampleCount: number;
  readonly samples: readonly TurboGhostSample[];
}

export interface TurboGhostPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly speed: number;
  readonly progress: number;
}

/** Quantization used both when recording and when hashing, so a round trip is bit-stable. */
const QUANT_DECIMALS = 6;

function quantize(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Turbo ghost samples must be finite numbers.");
  const quantized = Number(value.toFixed(QUANT_DECIMALS));
  // Canonicalize -0 to 0 so JSON export/import is bit-identical (JSON loses -0).
  return quantized === 0 ? 0 : quantized;
}

function quantizeSample(sample: TurboGhostSample): TurboGhostSample {
  return {
    t: quantize(sample.t),
    x: quantize(sample.x),
    y: quantize(sample.y),
    heading: quantize(sample.heading),
    speed: quantize(sample.speed),
    progress: quantize(sample.progress)
  };
}

/**
 * Records one lap of state samples.
 *
 * `record` is called once per simulation frame; `finish` seals the recording when the lap
 * completes. Recording includes the opening frame so t=0 always exists.
 */
export function createTurboGhostRecorder() {
  let samples: TurboGhostSample[] = [];
  let active = false;
  return {
    get active(): boolean {
      return active;
    },
    get sampleCount(): number {
      return samples.length;
    },
    start(): void {
      samples = [];
      active = true;
    },
    record(sample: Omit<TurboGhostSample, "t"> & { readonly t?: number }): void {
      if (!active) return;
      const previous = samples[samples.length - 1];
      const t = quantize(sample.t ?? (previous ? previous.t + 1 / 60 : 0));
      // Skip duplicated timestamps (paused/hit-stop frames) rather than hashing them.
      if (previous && t <= previous.t) return;
      samples.push(quantizeSample({ ...sample, t }));
    },
    /** Seals and returns the recording, or null when too few samples were captured. */
    finish(lapSeconds: number): TurboGhostRecording | null {
      active = false;
      if (samples.length < 8) return null;
      const sealed: TurboGhostRecording = {
        schema: TURBO_GHOST_SCHEMA,
        lapSeconds: quantize(Math.max(1e-3, lapSeconds)),
        sampleCount: samples.length,
        samples
      };
      samples = [];
      return sealed;
    },
    abort(): void {
      active = false;
      samples = [];
    }
  };
}

/**
 * Deterministic FNV-1a hash over canonical sample text.
 *
 * Export -> import must reproduce the identical path hash: the hash input is built from
 * fixed-decimal formatting of every field in order, never from object key order or
 * platform-dependent float formatting.
 */
export function turboGhostPathHash(recording: TurboGhostRecording): string {
  let hash = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  feed(`${recording.schema}|${recording.lapSeconds.toFixed(QUANT_DECIMALS)}|${recording.samples.length}`);
  for (const sample of recording.samples) {
    const q = quantizeSample(sample);
    feed(`;${q.t.toFixed(QUANT_DECIMALS)},${q.x.toFixed(QUANT_DECIMALS)},${q.y.toFixed(QUANT_DECIMALS)},${q.heading.toFixed(QUANT_DECIMALS)},${q.speed.toFixed(QUANT_DECIMALS)},${q.progress.toFixed(QUANT_DECIMALS)}`);
  }
  return hash.toString(16).padStart(8, "0");
}

/** Canonical JSON export. Values are pre-quantized at record time. */
export function serializeTurboGhostRecording(recording: TurboGhostRecording): string {
  return JSON.stringify({
    schema: recording.schema,
    lapSeconds: recording.lapSeconds,
    sampleCount: recording.sampleCount,
    samples: recording.samples
  });
}

/**
 * Parses and validates an export. Throws on schema/shape violations instead of guessing.
 *
 * Values are validated but not re-quantized: the recorder already writes the canonical
 * fixed-decimal form, so export -> import preserves the recording bit-for-bit.
 */
export function parseTurboGhostRecording(json: string): TurboGhostRecording {
  const parsed = JSON.parse(json) as TurboGhostRecording;
  if (parsed.schema !== TURBO_GHOST_SCHEMA) {
    throw new Error(`Unknown ghost recording schema: ${String(parsed.schema)}`);
  }
  if (!Array.isArray(parsed.samples) || parsed.samples.length !== parsed.sampleCount) {
    throw new Error("Ghost recording sampleCount does not match its samples array.");
  }
  if (!Number.isFinite(parsed.lapSeconds) || parsed.lapSeconds <= 0) {
    throw new Error("Ghost recording lapSeconds must be positive.");
  }
  const samples = parsed.samples.map((sample) => {
    for (const value of [sample.t, sample.x, sample.y, sample.heading, sample.speed, sample.progress]) {
      if (!Number.isFinite(value)) throw new Error("Ghost recording contains a non-finite sample field.");
    }
    return { ...sample };
  });
  // Timestamps are authored monotonic; keep that invariant rather than reordering.
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index]!.t < samples[index - 1]!.t) {
      throw new Error("Ghost recording timestamps must be non-decreasing.");
    }
  }
  return { schema: TURBO_GHOST_SCHEMA, lapSeconds: parsed.lapSeconds, sampleCount: samples.length, samples };
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function lerpAngle(a: number, b: number, alpha: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * alpha;
}

export function turboGhostPoseAt(recording: TurboGhostRecording, timeSeconds: number): TurboGhostPose {
  const samples = recording.samples;
  if (samples.length === 0) throw new Error("Cannot interpolate an empty ghost recording.");
  const lap = recording.lapSeconds;
  // Loop within the recorded lap; a replay longer than the lap wraps like the real lap would.
  let t = timeSeconds % lap;
  if (t < 0) t += lap;
  if (t <= samples[0]!.t) {
    const first = samples[0]!;
    return { x: first.x, y: first.y, heading: first.heading, speed: first.speed, progress: first.progress };
  }
  const last = samples[samples.length - 1]!;
  if (t >= last.t) {
    return { x: last.x, y: last.y, heading: last.heading, speed: last.speed, progress: last.progress };
  }
  // Binary search for the bracketing pair, then linear interpolation.
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid]!.t <= t) low = mid;
    else high = mid;
  }
  const a = samples[low]!;
  const b = samples[high]!;
  const span = Math.max(1e-6, b.t - a.t);
  const alpha = Math.min(1, Math.max(0, (t - a.t) / span));
  return {
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    heading: lerpAngle(a.heading, b.heading, alpha),
    speed: lerp(a.speed, b.speed, alpha),
    progress: lerp(a.progress, b.progress, alpha)
  };
}

export interface TurboGhostPlayer {
  readonly advance: (dtSeconds: number) => TurboGhostPose;
  readonly restart: () => void;
  readonly elapsedSeconds: () => number;
}

export function createTurboGhostPlayer(recording: TurboGhostRecording): TurboGhostPlayer {
  let elapsed = 0;
  return {
    advance(dtSeconds) {
      elapsed += Math.max(0, dtSeconds);
      return turboGhostPoseAt(recording, elapsed);
    },
    restart() {
      elapsed = 0;
    },
    elapsedSeconds() {
      return elapsed;
    }
  };
}

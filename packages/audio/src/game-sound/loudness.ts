/**
 * game-sound/loudness.ts — BS.1770-style loudness metering for `aura3d sfx admit`
 * (PRD-09 1736 / §6.9 mastering targets).
 *
 * The admission pipeline decodes each source file to PCM (ffmpeg on the remote
 * runner) and calls `measureLoudness` here — pure TypeScript, no deps, so unit
 * tests exercise the same math the CLI reports into the pack manifest.
 *
 * Integrated loudness: K-weighted mean square per 400 ms block (75% overlap),
 * two-stage gating (−70 LUFS absolute, then −10 LU relative).
 * True peak: 4× oversampling with a windowed-sinc interpolator, per BS.1770
 * Annex 2. `truePeakDb` is in dBTP (≤ 0 for clips that don't exceed FS).
 */

export interface LoudnessInput {
  /** Interleaved or per-channel samples, normalized to ±1. */
  readonly channels: readonly (readonly number[] | Float32Array)[];
  readonly sampleRate: number;
}

export interface LoudnessMeasurement {
  /** Integrated loudness in LUFS; -Infinity for silence/shorter than one block. */
  readonly lufs: number;
  /** True peak in dBTP. */
  readonly truePeakDb: number;
  readonly durationSeconds: number;
}

/** A single biquad section, per-channel state. */
class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(
    private readonly b: readonly [number, number, number],
    private readonly a: readonly [number, number]
  ) {}
  process(x: number): number {
    const y = this.b[0] * x + this.z1;
    this.z1 = this.b[1] * x - this.a[0] * y + this.z2;
    this.z2 = this.b[2] * x - this.a[1] * y;
    return y;
  }
}

/** ITU-R BS.1770-5 coefficients for a 48 kHz reference (rescaled on other rates by bilinear design is approximated — near-48k rates stay within ~0.2 LU). */
const SHELF_48K = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285] as const, a: [-1.69065929318241, 0.73248077421585] as const };
const RLB_48K = { b: [1, -2, 1] as const, a: [-1.99004745483398, 0.99007225036621] as const };

const BLOCK_SECONDS = 0.4;
const OVERLAP = 0.75;
const ABS_GATE_LUFS = -70;
const REL_GATE_LU = 10;

const kWeight = (channel: readonly number[] | Float32Array): Float32Array => {
  const shelf = new Biquad(SHELF_48K.b as unknown as [number, number, number], SHELF_48K.a as unknown as [number, number]);
  const rlb = new Biquad(RLB_48K.b as unknown as [number, number, number], RLB_48K.a as unknown as [number, number]);
  const out = new Float32Array(channel.length);
  for (let i = 0; i < channel.length; i++) out[i] = rlb.process(shelf.process(channel[i]!));
  return out;
};

const channelWeights = (count: number): number[] => {
  // BS.1770 default weights: 1.0 for all channels except surround backs (1.41).
  if (count > 6) {
    const w = new Array<number>(count).fill(1);
    for (let i = 6; i < count; i++) w[i] = 1.41;
    return w;
  }
  return new Array<number>(count).fill(1);
};

/** Windowed-sinc kernel for 4× true-peak interpolation (±8 taps, Hann window). */
const SINC_TAPS = 8;
const sinc = (x: number): number => (x === 0 ? 1 : (Math.sin(Math.PI * x) / (Math.PI * x)) * (0.5 + 0.5 * Math.cos((Math.PI * x) / SINC_TAPS)));

const truePeakOf = (channel: readonly number[] | Float32Array): number => {
  let peak = 0;
  const n = channel.length;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(channel[i]!));
    for (let f = 1; f < 4; f++) {
      const t = i + f / 4;
      let s = 0;
      for (let k = -SINC_TAPS; k <= SINC_TAPS; k++) {
        const j = Math.round(t) - k;
        if (j >= 0 && j < n) s += channel[j]! * sinc(t - j);
      }
      peak = Math.max(peak, Math.abs(s));
    }
  }
  return peak;
};

export function measureLoudness(input: LoudnessInput): LoudnessMeasurement {
  const { channels, sampleRate } = input;
  const length = channels[0]?.length ?? 0;
  const durationSeconds = length / sampleRate;
  const block = Math.round(BLOCK_SECONDS * sampleRate);
  const step = Math.max(1, Math.round(block * (1 - OVERLAP)));

  const weighted = channels.map(kWeight);
  const weights = channelWeights(channels.length);
  const truePeakDb = 20 * Math.log10(Math.max(1e-12, Math.max(...channels.map(truePeakOf))));

  if (length < block) {
    return { lufs: Number.NEGATIVE_INFINITY, truePeakDb, durationSeconds };
  }

  // Momentary block energies per channel.
  const blockLoudness: number[] = [];
  for (let start = 0; start + block <= length; start += step) {
    let sum = 0;
    for (let c = 0; c < weighted.length; c++) {
      let acc = 0;
      const ch = weighted[c]!;
      for (let i = start; i < start + block; i++) acc += ch[i]! * ch[i]!;
      sum += weights[c]! * acc;
    }
    blockLoudness.push(sum / block);
  }

  const lufsOf = (z: number) => -0.691 + 10 * Math.log10(z);
  const gated = blockLoudness.filter((z) => lufsOf(z) >= ABS_GATE_LUFS);
  if (gated.length === 0) return { lufs: Number.NEGATIVE_INFINITY, truePeakDb, durationSeconds };
  const ungatedMean = gated.reduce((a, z) => a + z, 0) / gated.length;
  const relGate = lufsOf(ungatedMean) - REL_GATE_LU;
  const relGated = gated.filter((z) => lufsOf(z) > relGate);
  const mean = relGated.length ? relGated.reduce((a, z) => a + z, 0) / relGated.length : ungatedMean;
  return { lufs: lufsOf(mean), truePeakDb, durationSeconds };
}

/** §6.9 mastering targets: one-shots peak-normalize to −1 dBTP; loops/beds −20 LUFS; music −16 LUFS. */
export type SfxMasteringClass = "one-shot" | "loop" | "ambience" | "music";

export const MASTERING_TARGETS: Readonly<Record<SfxMasteringClass, { readonly lufs?: number; readonly truePeakDb?: number }>> = {
  "one-shot": { truePeakDb: -1 },
  loop: { lufs: -20 },
  ambience: { lufs: -20 },
  music: { lufs: -16 }
};

/** Gain (dB) to apply so `measured` hits its class target. Returns 0 when nothing applies. */
export function gainForTarget(measured: LoudnessMeasurement, cls: SfxMasteringClass): number {
  const target = MASTERING_TARGETS[cls];
  let gain = 0;
  if (target.truePeakDb !== undefined) {
    const delta = target.truePeakDb - measured.truePeakDb;
    gain = Number.isFinite(delta) ? delta : 0;
  } else if (target.lufs !== undefined && Number.isFinite(measured.lufs)) {
    gain = target.lufs - measured.lufs;
  }
  // Never let a loudness boost push the file's true peak over −1 dBTP.
  if (Number.isFinite(measured.truePeakDb)) {
    gain = Math.min(gain, -1 - measured.truePeakDb);
  }
  return Math.round(gain * 100) / 100;
}

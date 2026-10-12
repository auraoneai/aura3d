/**
 * game-sound/MasterChain.ts — §6.8 master bus chain.
 *
 *   master gain (headroom) → [glue, opt-in] → limiter → makeup trim → safety clipper → destination
 *
 * Chrome's DynamicsCompressorNode always applies automatic makeup gain
 * (≈ 0.6 × the full-scale gain reduction). The old default chain (glue −18 dB
 * 3:1 + limiter −6 dB 12:1) therefore lifted quiet material by +8.3 dB and
 * pushed −12 dBFS by +6.1 dB (L4 OfflineAudioContext sweep): beds, hums and
 * tails came up to meet the hits — a squashed, loud, buzzing mix. The default
 * is now a hard-knee −1 dBFS 20:1 limiter followed by a trim that cancels its
 * makeup exactly, so the chain is level-transparent below the ceiling.
 *
 * The two `DynamicsCompressorNode`s are NOT brick-wall limiting (max ratio
 * 20, finite attack): 32 simultaneous 0 dBFS hits still overshoot ~1.5 dB.
 * The `WaveShaperNode` safety clip (1,024-point curve, linear below −6 dBFS,
 * tanh knee to ±0.966 ≈ −0.3 dBFS) is the guaranteed ceiling — inaudible at
 * normal levels.
 */

import type { SoundGraphContext, SoundNodeLike } from "./types";

export interface MasterChainOptions {
  /** Glue compressor stage (−18 dB, 3:1). Off by default: its makeup gain lifts quiet material. */
  readonly glue?: boolean;
  /** Limiter threshold, default −1 dBFS. */
  readonly limiterCeilingDb?: number;
  /**
   * Fixed headroom gain in front of the dynamics stages (default
   * MASTER_HEADROOM). Game sample libraries are normalised to ~−1 dBFS peaks;
   * at unity, a few overlapping hits drive the limiter into audible pumping and
   * the safety clipper into distortion. The master volume slider scales on top.
   */
  readonly headroom?: number;
}

/** Default master headroom: −4.4 dB (0.6 linear). */
export const MASTER_HEADROOM = 0.6;
export const LIMITER_CEILING_DB = -1;
export const LIMITER_RATIO = 20;

/**
 * Makeup gain (dB) Chrome/WebKit's DynamicsCompressor adds for a hard-knee
 * curve: 0.6 × the reduction a 0 dBFS input gets, i.e. 0.6·|T|·(1 − 1/R).
 * L4 sweep: T −1, R 20 → measured +0.57 dB, formula 0.57.
 */
export function limiterMakeupDb(thresholdDb: number, ratio: number): number {
  return 0.6 * Math.abs(thresholdDb) * (1 - 1 / ratio);
}

export interface MasterChain {
  readonly input: AudioNode;
  readonly output: SoundNodeLike;
  readonly limiterEngaged: boolean;
  /** Human-readable stage list for `proof()`. */
  readonly stages: readonly string[];
  /** Master volume 0..1 (scaled by the fixed headroom). */
  setMasterGain(volume01: number): void;
  dispose(): void;
}

/** Safety-clip curve: linear to −6 dBFS, tanh knee, endpoints ±0.966. */
export function safetyClipCurve(size = 1024): Float32Array {
  const curve = new Float32Array(size);
  const knee = 0.5; // −6 dBFS
  const peak = 0.966;
  const tanhKnee = Math.tanh((1 - knee) * 2);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const ax = Math.abs(x);
    curve[i] =
      ax <= knee
        ? x
        : Math.sign(x) * (knee + ((ax - knee) / (1 - knee)) * tanhKnee * (peak - knee) / tanhKnee);
  }
  return curve;
}

interface CompressorLike extends SoundNodeLike {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
}

interface ShaperLike extends SoundNodeLike {
  curve: Float32Array | null;
  oversample?: OverSampleType;
}

export function createMasterChain(
  ctx: SoundGraphContext,
  destination: AudioNode,
  options: MasterChainOptions = {}
): MasterChain {
  const ceiling = options.limiterCeilingDb ?? LIMITER_CEILING_DB;
  const glueOn = options.glue ?? false;

  const headroom = Math.max(0, Math.min(1, options.headroom ?? MASTER_HEADROOM));
  const input = ctx.createGain();
  input.gain.value = headroom;
  const stages: string[] = ["masterGain"];
  const chain: SoundNodeLike[] = [];

  let limiter: CompressorLike | undefined;
  let shaper: ShaperLike | undefined;

  if (ctx.createDynamicsCompressor && glueOn) {
    const glue = ctx.createDynamicsCompressor() as unknown as CompressorLike;
    glue.threshold.value = -18;
    glue.knee.value = 6;
    glue.ratio.value = 3;
    glue.attack.value = 0.005;
    glue.release.value = 0.25;
    chain.push(glue);
    stages.push("glue(-18dB)");
  }

  if (ctx.createDynamicsCompressor) {
    limiter = ctx.createDynamicsCompressor() as unknown as CompressorLike;
    // Hard-knee peak limiter; the safety clip below is the guaranteed ceiling.
    limiter.threshold.value = ceiling;
    limiter.knee.value = 0;
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    chain.push(limiter);
    stages.push(`limiter(${ceiling}dB)`);
    // Cancel the compressor's automatic makeup gain (exact for knee 0).
    const trim = ctx.createGain();
    trim.gain.value = Math.pow(10, -limiterMakeupDb(ceiling, LIMITER_RATIO) / 20);
    chain.push(trim as unknown as SoundNodeLike);
    stages.push("makeupTrim");
  }

  if (ctx.createWaveShaper) {
    shaper = ctx.createWaveShaper() as unknown as ShaperLike;
    shaper.curve = safetyClipCurve();
    shaper.oversample = "none";
    chain.push(shaper);
    stages.push("safetyClip(±0.966)");
  }

  // Wire input → chain → destination.
  let head: SoundNodeLike = input as unknown as SoundNodeLike;
  for (const node of chain) {
    (head as { connect(d: SoundNodeLike): unknown }).connect(node);
    head = node;
  }
  (head as { connect(d: SoundNodeLike): unknown }).connect(destination as unknown as SoundNodeLike);

  let limiterEngaged = false;
  // `reduction` is read off live compressor state in proof paths; fakes may
  // not expose it, so engagement is computed from the signal instead.
  const reductionProbe = limiter as unknown as { reduction?: number } | undefined;
  const limiterActive = () => reductionProbe?.reduction !== undefined && reductionProbe.reduction < 0;
  // Engaged flag is sticky within a proof read — set when the limiter reports
  // negative gain reduction at least once.
  const pollLimiter = () => {
    if (limiterActive()) limiterEngaged = true;
  };
  if (typeof setInterval === "function" && reductionProbe?.reduction !== undefined) {
    const timer = setInterval(pollLimiter, 500);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref(): void }).unref();
    }
  }

  return {
    input,
    output: head,
    stages,
    get limiterEngaged() {
      pollLimiter();
      return limiterEngaged || limiterActive();
    },
    setMasterGain(volume01: number) {
      input.gain.value = Math.max(0, Math.min(1, volume01)) * headroom;
    },
    dispose() {
      for (const node of chain) {
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
    }
  };
}

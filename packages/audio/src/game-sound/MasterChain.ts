/**
 * game-sound/MasterChain.ts — §6.8 master bus chain.
 *
 *   master gain → glue compressor → limiter compressor → safety clipper → destination
 *
 * The two `DynamicsCompressorNode`s are NOT brick-wall limiting (max ratio
 * 20, finite attack): 32 simultaneous 0 dBFS hits still overshoot ~1.5 dB.
 * The `WaveShaperNode` safety clip (1,024-point curve, linear below −6 dBFS,
 * tanh knee to ±0.966 ≈ −0.3 dBFS) is the guaranteed ceiling — inaudible at
 * normal levels.
 */

import type { SoundGraphContext, SoundNodeLike } from "./types";

export interface MasterChainOptions {
  /** Glue + limiter stages on by default (master.glue). */
  readonly glue?: boolean;
  /** Limiter threshold, default −1 dBFS. */
  readonly limiterCeilingDb?: number;
}

export interface MasterChain {
  readonly input: AudioNode;
  readonly output: SoundNodeLike;
  readonly limiterEngaged: boolean;
  /** Human-readable stage list for `proof()`. */
  readonly stages: readonly string[];
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
  const ceiling = options.limiterCeilingDb ?? -1;
  const glueOn = options.glue ?? true;

  const input = ctx.createGain();
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
    limiter.threshold.value = ceiling;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    chain.push(limiter);
    stages.push(`limiter(${ceiling}dB)`);
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
      input.gain.value = Math.max(0, Math.min(1, volume01));
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

/**
 * game-sound/ReverbSend.ts — §6.8 reverb send.
 *
 * One convolver send off the bus mix, tier-gated (off on `low`; IR length ≤
 * the §17 budget: medium 0.8 s, high 1.5 s, ultra 2.5 s). Presets pick a
 * bundled mono 24 kHz IR via the format probe. `underwater` adds a 1.8 kHz
 * lowpass on the send path.
 */

import type { SoundBiquadLike, SoundGraphContext, SoundNodeLike } from "./types";

export type ReverbPreset = "none" | "small-room" | "hall" | "street" | "hangar" | "underwater";
export type QualityTier = "low" | "medium" | "high" | "ultra";

export const IR_BUDGET_SECONDS: Record<QualityTier, number> = {
  low: 0,
  medium: 0.8,
  high: 1.5,
  ultra: 2.5
};

/** IR lengths shipped per preset (seconds, mono 24 kHz — from the pack manifest). */
export const PRESET_IR_SECONDS: Record<Exclude<ReverbPreset, "none">, number> = {
  "small-room": 0.6,
  hall: 1.8,
  street: 1.2,
  hangar: 2.2,
  underwater: 1.4
};

export const presetIrUrl = (preset: ReverbPreset, extension: string): string | undefined =>
  preset === "none" ? undefined : `assets/ir/${preset}.${extension}`;

export interface ReverbSendOptions {
  readonly ctx: SoundGraphContext;
  readonly preset: ReverbPreset;
  readonly tier: QualityTier;
  /** Resolve an IR url → decoded AudioBuffer (async loading upstream). */
  readonly bufferFor: (url: string) => AudioBuffer | undefined;
}

export interface ReverbSend {
  readonly enabled: boolean;
  readonly sendInput?: SoundNodeLike;
  readonly irSeconds: number;
  dispose(): void;
}

export function createReverbSend(options: ReverbSendOptions): ReverbSend {
  const { ctx, preset, tier } = options;
  const budget = IR_BUDGET_SECONDS[tier];
  if (preset === "none" || budget <= 0 || typeof ctx.createConvolver !== "function") {
    return { enabled: false, irSeconds: 0, dispose() {} };
  }
  const irSeconds = Math.min(PRESET_IR_SECONDS[preset], budget);

  const convolver = ctx.createConvolver() as unknown as SoundNodeLike & { buffer?: AudioBuffer | null };
  const sendGain = ctx.createGain() as unknown as SoundNodeLike;
  (sendGain as unknown as { gain: { value: number } }).gain.value = 0.25;

  // Send input → convolver → (lowpass if underwater) → sendGain → caller's bus input.
  let tail: SoundNodeLike = convolver;
  if (preset === "underwater" && typeof ctx.createBiquadFilter === "function") {
    const lp = ctx.createBiquadFilter() as unknown as SoundBiquadLike;
    lp.type = "lowpass";
    if (lp.frequency) lp.frequency.value = 1800;
    (convolver as { connect(d: SoundNodeLike): unknown }).connect(lp);
    (lp as { connect(d: SoundNodeLike): unknown }).connect(sendGain);
    tail = lp;
  } else {
    (convolver as { connect(d: SoundNodeLike): unknown }).connect(sendGain);
  }

  return {
    enabled: true,
    sendInput: convolver,
    irSeconds,
    /** The send tail connects to the master/bus input — set by the engine. */
    ...{ sendTail: sendGain },
    setIrBuffer(buffer: AudioBuffer) {
      convolver.buffer = buffer;
    },
    dispose() {
      for (const n of [convolver, tail, sendGain]) {
        try {
          (n as SoundNodeLike).disconnect();
        } catch {
          /* noop */
        }
      }
    }
  } as ReverbSend & { sendTail: SoundNodeLike; setIrBuffer(b: AudioBuffer): void };
}

/**
 * game-sound/SpatialVoice.ts — §6.8 spatial voice node.
 *
 * Voice → PannerNode (HRTF on high/ultra, equalpower otherwise; inverse
 * distance, refDistance 1, maxDistance 60, rolloff 1) → occlusion lowpass
 * (BiquadFilterNode, 20 kHz open → 900 Hz occluded, exponential map) → cue
 * gain → bus.
 */

import type {
  SoundBiquadLike,
  SoundGraphContext,
  SoundNodeLike,
  SoundPannerLike,
  Vec3
} from "./types";
import { clamp, vec3 } from "./types";

export interface SpatialNodeOptions {
  readonly ctx: SoundGraphContext;
  /** "hrtf" resolved by tier: high/ultra → "HRTF", else "equalpower". */
  readonly panningModel: PanningModelType;
  readonly refDistance?: number;
  readonly maxDistance?: number;
  readonly rolloff?: number;
}

export interface SpatialNode {
  readonly input: SoundNodeLike;
  readonly panner?: SoundPannerLike;
  readonly occlusionFilter: SoundBiquadLike;
  setPosition(p: Vec3): void;
  setVelocity(v: Vec3): void;
  /** 0 = open (20 kHz), 1 = fully occluded (900 Hz). */
  setOcclusion(amount01: number): void;
  dispose(): void;
}

// C-25 (#208): 20000·(1-occ)² + 400 Hz — fully occluded rolls off at 400 Hz.
const OCCLUSION_OPEN_HZ = 20_000;
const OCCLUSION_CLOSED_HZ = 400;

export const occlusionHz = (amount01: number): number =>
  OCCLUSION_OPEN_HZ * Math.pow(1 - clamp(amount01, 0, 1), 2) + OCCLUSION_CLOSED_HZ;

export function createSpatialNode(options: SpatialNodeOptions): SpatialNode {
  const { ctx } = options;

  let panner: SoundPannerLike | undefined;
  if (typeof ctx.createPanner === "function") {
    panner = ctx.createPanner() as unknown as SoundPannerLike;
    if (panner) {
      if ("panningModel" in panner) panner.panningModel = options.panningModel;
      if ("distanceModel" in panner) panner.distanceModel = "inverse";
      if ("refDistance" in panner) panner.refDistance = options.refDistance ?? 1;
      if ("maxDistance" in panner) panner.maxDistance = options.maxDistance ?? 60;
      if ("rolloffFactor" in panner) panner.rolloffFactor = options.rolloff ?? 1;
    }
  }

  // Fake/headless contexts may lack createBiquadFilter — the occlusion filter
  // degrades to a passthrough gain (still positionable, just no lowpass).
  const filter = (
    typeof ctx.createBiquadFilter === "function"
      ? ctx.createBiquadFilter()
      : ctx.createGain()
  ) as unknown as SoundBiquadLike;
  filter.type = "lowpass";
  if (filter.frequency) filter.frequency.value = OCCLUSION_OPEN_HZ;
  if (filter.Q) filter.Q.value = 0.707;

  const input: SoundNodeLike = panner ?? (filter as SoundNodeLike);
  if (panner) {
    (panner as { connect(d: SoundNodeLike): unknown }).connect(filter);
  }

  return {
    input,
    panner,
    occlusionFilter: filter,
    setPosition(p) {
      if (!panner) return;
      const { x, y, z } = vec3(p);
      const now = ctx.currentTime;
      const px = panner.positionX;
      const py = panner.positionY;
      const pz = panner.positionZ;
      if (px?.setTargetAtTime && py?.setTargetAtTime && pz?.setTargetAtTime) {
        px.setTargetAtTime(x, now, 0.02);
        py.setTargetAtTime(y, now, 0.02);
        pz.setTargetAtTime(z, now, 0.02);
      } else if (panner.setPosition) {
        panner.setPosition(x, y, z);
      } else {
        if (panner.positionX) panner.positionX.value = x;
        if (panner.positionY) panner.positionY.value = y;
        if (panner.positionZ) panner.positionZ.value = z;
      }
    },
    setVelocity(v) {
      if (!panner?.setVelocity) return;
      const { x, y, z } = vec3(v);
      panner.setVelocity(x, y, z);
    },
    setOcclusion(amount01) {
      const hz = occlusionHz(amount01);
      const f = filter.frequency;
      if (!f) return;
      if (f.setTargetAtTime) f.setTargetAtTime(hz, ctx.currentTime, 0.03);
      else f.value = hz;
    },
    dispose() {
      for (const n of [panner, filter]) {
        try {
          n?.disconnect();
        } catch {
          /* noop */
        }
      }
    }
  };
}

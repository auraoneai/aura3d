import type { CartoonEmotionPose, CartoonPerformanceBodyState, CartoonPerformanceFacialState } from "./CartoonPerformance.js";

export interface PerformanceBlendResult {
  readonly kind: "performance-blend";
  readonly fromPoseId: string;
  readonly toPoseId: string;
  readonly t: number;
  readonly body: CartoonPerformanceBodyState;
  readonly facial: CartoonPerformanceFacialState;
}

export function blendPerformancePoses(from: CartoonEmotionPose, to: CartoonEmotionPose, t: number): PerformanceBlendResult {
  const amount = Math.min(1, Math.max(0, t));
  return {
    kind: "performance-blend",
    fromPoseId: from.id,
    toPoseId: to.id,
    t: amount,
    body: {
      ...from.body,
      ...to.body,
      headTilt: lerp(from.body.headTilt, to.body.headTilt, amount),
      torsoLean: lerp(from.body.torsoLean, to.body.torsoLean, amount),
      shoulderRaise: lerp(from.body.shoulderRaise, to.body.shoulderRaise, amount),
      energy: lerp(from.body.energy, to.body.energy, amount)
    },
    facial: {
      ...from.facial,
      ...to.facial,
      eyeOpen: lerp(from.facial.eyeOpen, to.facial.eyeOpen, amount),
      blinkRate: lerp(from.facial.blinkRate, to.facial.blinkRate, amount)
    }
  };
}

function lerp(left: number | undefined, right: number | undefined, t: number): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return Number(((left ?? right ?? 0) + ((right ?? left ?? 0) - (left ?? right ?? 0)) * t).toFixed(4));
}

import type { AnimationEmotionPose, AnimationPerformanceBodyState, AnimationPerformanceFacialState } from "./AnimationPerformance.js";

export interface PerformanceBlendResult {
  readonly kind: "performance-blend";
  readonly fromPoseId: string;
  readonly toPoseId: string;
  readonly t: number;
  readonly body: AnimationPerformanceBodyState;
  readonly facial: AnimationPerformanceFacialState;
}

export interface PerformanceTransitionSample extends PerformanceBlendResult {
  readonly time: number;
  readonly frame: number;
}

export interface PerformanceTransitionPlan {
  readonly kind: "performance-transition-plan";
  readonly fromPoseId: string;
  readonly toPoseId: string;
  readonly duration: number;
  readonly frameRate: number;
  readonly sampleCount: number;
  readonly smooth: boolean;
  readonly deterministic: true;
  readonly samples: readonly PerformanceTransitionSample[];
}

export function blendPerformancePoses(from: AnimationEmotionPose, to: AnimationEmotionPose, t: number): PerformanceBlendResult {
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

export function createPerformanceTransitionPlan(
  from: AnimationEmotionPose,
  to: AnimationEmotionPose,
  options: { readonly duration?: number; readonly frameRate?: number } = {}
): PerformanceTransitionPlan {
  const duration = positive(options.duration ?? 0.35, "Performance transition duration");
  const frameRate = positive(options.frameRate ?? 30, "Performance transition frameRate");
  const frameCount = Math.max(2, Math.round(duration * frameRate) + 1);
  const samples = Array.from({ length: frameCount }, (_, frame): PerformanceTransitionSample => {
    const t = frameCount <= 1 ? 1 : frame / (frameCount - 1);
    return {
      ...blendPerformancePoses(from, to, smoothstep(t)),
      time: Number((frame / frameRate).toFixed(4)),
      frame
    };
  });
  return {
    kind: "performance-transition-plan",
    fromPoseId: from.id,
    toPoseId: to.id,
    duration,
    frameRate,
    sampleCount: samples.length,
    smooth: samples.every((sample, index) => index === 0 || sample.t >= samples[index - 1]!.t),
    deterministic: true,
    samples
  };
}

function lerp(left: number | undefined, right: number | undefined, t: number): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return Number(((left ?? right ?? 0) + ((right ?? left ?? 0) - (left ?? right ?? 0)) * t).toFixed(4));
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return Number((t * t * (3 - 2 * t)).toFixed(4));
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

export interface AnimationMotionSample {
  readonly timeSeconds: number;
  readonly tracksApplied?: number;
  readonly skinningPalettesUpdated?: number;
  readonly stride?: number;
  readonly animatedSubjects?: number;
}

export interface AnimationMotionQualityReport {
  readonly sampleCount: number;
  readonly timeRangeSeconds: number;
  readonly activeTrackFrames: number;
  readonly activeSkinningFrames: number;
  readonly animatedSubjectFrames: number;
  readonly averageStride: number;
  readonly poseDiversityScore: number;
  readonly healthy: boolean;
}

export interface CartoonAnimationMotionQualityReport extends AnimationMotionQualityReport {
  readonly kind: "cartoon-animation-motion-quality";
  readonly staticPoseRejected: boolean;
  readonly issues: readonly string[];
}

export interface AnimationMotionQualityOptions {
  readonly maxSamples?: number;
  readonly minimumSamples?: number;
  readonly minimumTimeRangeSeconds?: number;
  readonly minimumPoseDiversityScore?: number;
}

export class AnimationMotionQualityTracker {
  private readonly maxSamples: number;
  private readonly minimumSamples: number;
  private readonly minimumTimeRangeSeconds: number;
  private readonly minimumPoseDiversityScore: number;
  private readonly samples: AnimationMotionSample[] = [];

  constructor(options: AnimationMotionQualityOptions = {}) {
    this.maxSamples = positiveInteger(options.maxSamples ?? 180, "maxSamples");
    this.minimumSamples = positiveInteger(options.minimumSamples ?? 8, "minimumSamples");
    this.minimumTimeRangeSeconds = nonNegativeFinite(options.minimumTimeRangeSeconds ?? 0.18, "minimumTimeRangeSeconds");
    this.minimumPoseDiversityScore = nonNegativeFinite(options.minimumPoseDiversityScore ?? 0.08, "minimumPoseDiversityScore");
  }

  record(sample: AnimationMotionSample): AnimationMotionQualityReport {
    validateSample(sample);
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    return this.report();
  }

  report(): AnimationMotionQualityReport {
    return summarizeAnimationMotion(this.samples, {
      minimumSamples: this.minimumSamples,
      minimumTimeRangeSeconds: this.minimumTimeRangeSeconds,
      minimumPoseDiversityScore: this.minimumPoseDiversityScore
    });
  }

  reset(): void {
    this.samples.length = 0;
  }
}

export function summarizeAnimationMotion(
  samples: readonly AnimationMotionSample[],
  options: Pick<AnimationMotionQualityOptions, "minimumSamples" | "minimumTimeRangeSeconds" | "minimumPoseDiversityScore"> = {}
): AnimationMotionQualityReport {
  const minimumSamples = positiveInteger(options.minimumSamples ?? 8, "minimumSamples");
  const minimumTimeRangeSeconds = nonNegativeFinite(options.minimumTimeRangeSeconds ?? 0.18, "minimumTimeRangeSeconds");
  const minimumPoseDiversityScore = nonNegativeFinite(options.minimumPoseDiversityScore ?? 0.08, "minimumPoseDiversityScore");
  const ordered = samples.slice().sort((left, right) => left.timeSeconds - right.timeSeconds);
  const sampleCount = ordered.length;
  if (sampleCount === 0) {
    return emptyReport();
  }

  const firstTime = ordered[0]!.timeSeconds;
  const lastTime = ordered[sampleCount - 1]!.timeSeconds;
  const timeRangeSeconds = Math.max(0, lastTime - firstTime);
  const activeTrackFrames = ordered.filter((sample) => (sample.tracksApplied ?? 0) > 0).length;
  const activeSkinningFrames = ordered.filter((sample) => (sample.skinningPalettesUpdated ?? 0) > 0).length;
  const animatedSubjectFrames = ordered.filter((sample) => (sample.animatedSubjects ?? 0) > 0).length;
  const strides = ordered.map((sample) => Math.abs(sample.stride ?? 0));
  const averageStride = strides.reduce((sum, value) => sum + value, 0) / sampleCount;
  const poseDiversityScore = computePoseDiversity(ordered);
  return {
    sampleCount,
    timeRangeSeconds: round(timeRangeSeconds),
    activeTrackFrames,
    activeSkinningFrames,
    animatedSubjectFrames,
    averageStride: round(averageStride),
    poseDiversityScore: round(poseDiversityScore),
    healthy: sampleCount >= minimumSamples
      && timeRangeSeconds >= minimumTimeRangeSeconds
      && poseDiversityScore >= minimumPoseDiversityScore
      && (activeTrackFrames > 0 || activeSkinningFrames > 0 || animatedSubjectFrames > 0)
  };
}

export function summarizeCartoonAnimationMotion(
  samples: readonly AnimationMotionSample[],
  options: Pick<AnimationMotionQualityOptions, "minimumSamples" | "minimumTimeRangeSeconds" | "minimumPoseDiversityScore"> = {}
): CartoonAnimationMotionQualityReport {
  const base = summarizeAnimationMotion(samples, options);
  const issues = [
    base.sampleCount < (options.minimumSamples ?? 8) ? "not enough motion samples" : undefined,
    base.timeRangeSeconds < (options.minimumTimeRangeSeconds ?? 0.18) ? "motion time range is too short" : undefined,
    base.poseDiversityScore < (options.minimumPoseDiversityScore ?? 0.08) ? "pose diversity is too low" : undefined,
    base.activeTrackFrames === 0 && base.activeSkinningFrames === 0 && base.animatedSubjectFrames === 0 ? "no active track, skinning, or subject motion" : undefined
  ].filter((issue): issue is string => Boolean(issue));
  return {
    ...base,
    kind: "cartoon-animation-motion-quality",
    staticPoseRejected: issues.length > 0,
    issues,
    healthy: issues.length === 0
  };
}

function computePoseDiversity(samples: readonly AnimationMotionSample[]): number {
  if (samples.length < 2) return 0;
  let diversity = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    diversity += Math.abs(current.timeSeconds - previous.timeSeconds);
    diversity += Math.abs((current.tracksApplied ?? 0) - (previous.tracksApplied ?? 0)) * 0.01;
    diversity += Math.abs((current.skinningPalettesUpdated ?? 0) - (previous.skinningPalettesUpdated ?? 0)) * 0.01;
    diversity += Math.abs((current.stride ?? 0) - (previous.stride ?? 0));
    diversity += Math.abs((current.animatedSubjects ?? 0) - (previous.animatedSubjects ?? 0)) * 0.02;
  }
  return diversity;
}

function validateSample(sample: AnimationMotionSample): void {
  nonNegativeFinite(sample.timeSeconds, "timeSeconds");
  optionalNonNegativeFinite(sample.tracksApplied, "tracksApplied");
  optionalNonNegativeFinite(sample.skinningPalettesUpdated, "skinningPalettesUpdated");
  optionalNonNegativeFinite(sample.stride, "stride");
  optionalNonNegativeFinite(sample.animatedSubjects, "animatedSubjects");
}

function optionalNonNegativeFinite(value: number | undefined, label: string): void {
  if (value !== undefined) nonNegativeFinite(value, label);
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Animation motion ${label} must be finite and non-negative.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Animation motion ${label} must be a positive integer.`);
  }
  return value;
}

function emptyReport(): AnimationMotionQualityReport {
  return {
    sampleCount: 0,
    timeRangeSeconds: 0,
    activeTrackFrames: 0,
    activeSkinningFrames: 0,
    animatedSubjectFrames: 0,
    averageStride: 0,
    poseDiversityScore: 0,
    healthy: false
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

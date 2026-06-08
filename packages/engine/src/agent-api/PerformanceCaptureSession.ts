import {
  createAnimationPerformance,
  type AnimationPerformanceArtifact,
  type AnimationPerformanceBodyState,
  type AnimationPerformanceFacialState,
  type AnimationPerformanceGazeState
} from "./AnimationPerformance.js";
import { createPromptAnimationIssue, type PromptAnimationId, type PromptAnimationValidationIssue } from "./PromptAnimationContract.js";

export type PerformanceCaptureSourceKind = "manual" | "webcam" | "motion-capture";
export type PerformanceCapturePermissionState = "unknown" | "granted" | "denied" | "not-required";
export type PerformanceCaptureRecordingSessionStatus = "idle" | "recording" | "stopped";
export type PerformanceCaptureSignal = "body" | "face" | "hands" | "gaze" | "audio";

export interface PerformanceCaptureCapability {
  readonly kind: PerformanceCaptureSourceKind;
  readonly available: boolean;
  readonly permission: PerformanceCapturePermissionState;
  readonly supportedSignals: readonly PerformanceCaptureSignal[];
  readonly provider?: string | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface PerformanceCaptureRecordingSample {
  readonly id: string;
  readonly time: number;
  readonly characterId: PromptAnimationId;
  readonly body?: AnimationPerformanceBodyState | undefined;
  readonly facial?: AnimationPerformanceFacialState | undefined;
  readonly gaze?: AnimationPerformanceGazeState | undefined;
  readonly confidence?: number | undefined;
  readonly sourceFrameId?: string | undefined;
}

export interface PerformanceCaptureRecordingSessionOptions {
  readonly id: PromptAnimationId;
  readonly episodeId: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly frameRate: number;
  readonly source: PerformanceCaptureCapability;
}

export interface PerformanceCaptureRecordingSessionSnapshot {
  readonly kind: "performance-capture-session";
  readonly id: PromptAnimationId;
  readonly episodeId: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly status: PerformanceCaptureRecordingSessionStatus;
  readonly source: PerformanceCaptureCapability;
  readonly sampleCount: number;
  readonly duration: number;
  readonly averageConfidence: number;
  readonly requiresRuntimeDevicePermission: boolean;
  readonly externalServiceIntegrated: false;
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly evidence: {
    readonly webcamCaptureContract: boolean;
    readonly motionCaptureContract: boolean;
    readonly manualCaptureFallback: boolean;
    readonly performanceDriven: boolean;
  };
}

export class PerformanceCaptureRecordingSession {
  private status: PerformanceCaptureRecordingSessionStatus = "idle";
  private readonly samples: PerformanceCaptureRecordingSample[] = [];

  constructor(private readonly options: PerformanceCaptureRecordingSessionOptions) {
    validateOptions(options);
  }

  start(): PerformanceCaptureRecordingSessionSnapshot {
    if (this.options.source.kind !== "manual" && (!this.options.source.available || this.options.source.permission !== "granted")) {
      throw new Error(`Performance capture source "${this.options.source.kind}" is not available with granted permission.`);
    }
    this.status = "recording";
    return this.snapshot();
  }

  stop(): PerformanceCaptureRecordingSessionSnapshot {
    this.status = "stopped";
    return this.snapshot();
  }

  recordSample(sample: PerformanceCaptureRecordingSample): PerformanceCaptureRecordingSessionSnapshot {
    if (this.status !== "recording") throw new Error("Performance capture samples can only be recorded while the session is recording.");
    const clean = sanitizeSample(sample, this.options.characterId);
    this.samples.push(clean);
    this.samples.sort((left, right) => left.time - right.time);
    return this.snapshot();
  }

  toPerformanceArtifact(): AnimationPerformanceArtifact {
    const cues = this.samples.map((sample, index) => {
      const next = this.samples[index + 1];
      const frameDuration = 1 / this.options.frameRate;
      return {
        id: sample.id,
        characterId: sample.characterId,
        startTime: sample.time,
        endTime: Math.max(sample.time + frameDuration, next?.time ?? sample.time + frameDuration),
        action: "react",
        ...(sample.body ? { body: sample.body } : {}),
        ...(sample.facial ? { facial: sample.facial } : {}),
        ...(sample.gaze ? { gaze: sample.gaze } : {}),
        intensity: sample.confidence ?? 1,
        notes: [
          `${this.options.source.kind} performance capture sample`,
          ...(sample.sourceFrameId ? [`source frame ${sample.sourceFrameId}`] : [])
        ]
      };
    });
    return createAnimationPerformance({
      episodeId: this.options.episodeId,
      frameRate: this.options.frameRate,
      cues
    });
  }

  snapshot(): PerformanceCaptureRecordingSessionSnapshot {
    const issues = validatePerformanceCaptureCapability(this.options.source);
    const confidenceValues = this.samples.map((sample) => sample.confidence ?? 1);
    const duration = this.samples.length > 0 ? this.samples[this.samples.length - 1].time - this.samples[0].time : 0;
    return {
      kind: "performance-capture-session",
      id: this.options.id,
      episodeId: this.options.episodeId,
      characterId: this.options.characterId,
      status: this.status,
      source: this.options.source,
      sampleCount: this.samples.length,
      duration: Number(Math.max(0, duration).toFixed(4)),
      averageConfidence: Number((confidenceValues.reduce((total, value) => total + value, 0) / Math.max(1, confidenceValues.length)).toFixed(4)),
      requiresRuntimeDevicePermission: this.options.source.kind !== "manual",
      externalServiceIntegrated: false,
      issues,
      evidence: {
        webcamCaptureContract: this.options.source.kind === "webcam",
        motionCaptureContract: this.options.source.kind === "motion-capture",
        manualCaptureFallback: this.options.source.kind === "manual",
        performanceDriven: this.samples.length > 0
      }
    };
  }
}

export function createPerformanceCaptureSession(options: PerformanceCaptureRecordingSessionOptions): PerformanceCaptureRecordingSession {
  return new PerformanceCaptureRecordingSession(options);
}

export function validatePerformanceCaptureCapability(capability: PerformanceCaptureCapability): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (!capability.available && capability.kind !== "manual") {
    issues.push(createPromptAnimationIssue("warning", "performance-capture-source-unavailable", `${capability.kind} capture source is not available in this runtime.`));
  }
  if (capability.kind !== "manual" && capability.permission !== "granted") {
    issues.push(createPromptAnimationIssue("warning", "performance-capture-permission-required", `${capability.kind} capture requires explicit runtime permission.`));
  }
  if (capability.supportedSignals.length === 0) {
    issues.push(createPromptAnimationIssue("error", "performance-capture-signals-missing", "Performance capture needs at least one supported signal."));
  }
  return issues;
}

function validateOptions(options: PerformanceCaptureRecordingSessionOptions): void {
  nonEmpty(options.id, "Performance capture id");
  nonEmpty(options.episodeId, "Performance capture episode id");
  nonEmpty(options.characterId, "Performance capture character id");
  if (!Number.isFinite(options.frameRate) || options.frameRate <= 0) throw new Error("Performance capture frameRate must be positive.");
  validatePerformanceCaptureCapability(options.source);
}

function sanitizeSample(sample: PerformanceCaptureRecordingSample, expectedCharacterId: string): PerformanceCaptureRecordingSample {
  if (sample.characterId !== expectedCharacterId) throw new Error(`Performance capture sample characterId must be "${expectedCharacterId}".`);
  if (!Number.isFinite(sample.time) || sample.time < 0) throw new Error("Performance capture sample time must be a non-negative finite number.");
  if (sample.confidence !== undefined && (!Number.isFinite(sample.confidence) || sample.confidence < 0 || sample.confidence > 1)) {
    throw new Error("Performance capture sample confidence must be between 0 and 1.");
  }
  return {
    id: nonEmpty(sample.id, "Performance capture sample id"),
    time: sample.time,
    characterId: sample.characterId,
    body: sample.body,
    facial: sample.facial,
    gaze: sample.gaze,
    confidence: sample.confidence,
    sourceFrameId: sample.sourceFrameId
  };
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`);
  return trimmed;
}

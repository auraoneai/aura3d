import type { AuraVec3 } from "./index.js";
import { normalizePromptAnimationTime, promptAnimationContractVersion, type PromptAnimationId, type PromptAnimationSeconds } from "./PromptAnimationContract.js";
import { applyCameraPreset, type CameraPresetId } from "./CameraPresetLibrary.js";
import type { ShotCameraInstruction } from "./ShotTimeline.js";

export type CameraPathInterpolation = "linear" | "smoothstep" | "catmull-rom";

export interface CameraKeyframe {
  readonly id: PromptAnimationId;
  readonly time: PromptAnimationSeconds;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
  readonly focusDistance?: number | undefined;
  readonly shake?: number | undefined;
}

export interface CameraPath {
  readonly id: PromptAnimationId;
  readonly interpolation: CameraPathInterpolation;
  readonly keyframes: readonly CameraKeyframe[];
}

export interface CameraChoreographyArtifact {
  readonly artifact: "camera-choreography";
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly paths: readonly CameraPath[];
  readonly generatedAt?: string | undefined;
}

export interface LegacyCameraChoreography {
  readonly kind: "camera-choreography";
  readonly duration: number;
  readonly keyframes: readonly CameraKeyframe[];
}

export interface CameraSample {
  readonly time: PromptAnimationSeconds;
  readonly pathId: PromptAnimationId;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
  readonly focusDistance?: number | undefined;
  readonly shake: number;
}

export function createCameraChoreography(input: {
  readonly episodeId: PromptAnimationId;
  readonly paths: readonly CameraPath[];
  readonly generatedAt?: string | undefined;
}): CameraChoreographyArtifact;
export function createCameraChoreography(keyframes: readonly CameraKeyframe[], duration?: number): LegacyCameraChoreography;
export function createCameraChoreography(
  input: {
    readonly episodeId: PromptAnimationId;
    readonly paths: readonly CameraPath[];
    readonly generatedAt?: string | undefined;
  } | readonly CameraKeyframe[],
  duration?: number
): CameraChoreographyArtifact | LegacyCameraChoreography {
  if (Array.isArray(input)) {
    const sorted = [...input].sort((left, right) => left.time - right.time);
    return {
      kind: "camera-choreography",
      duration: duration ?? Math.max(0, ...sorted.map((keyframe) => keyframe.time)),
      keyframes: sorted
    };
  }
  const planInput = input as {
    readonly episodeId: PromptAnimationId;
    readonly paths: readonly CameraPath[];
    readonly generatedAt?: string | undefined;
  };
  return {
    artifact: "camera-choreography",
    contractId: promptAnimationContractVersion,
    episodeId: planInput.episodeId,
    paths: planInput.paths.map((path: CameraPath) => ({
      ...path,
      keyframes: [...path.keyframes].sort((a, b) => a.time - b.time)
    })),
    ...(planInput.generatedAt ? { generatedAt: planInput.generatedAt } : {})
  };
}

export function cameraKeyframeFromPreset(id: CameraPresetId, time: PromptAnimationSeconds): CameraKeyframe {
  const camera = applyCameraPreset(id);
  return {
    id: `${id}:${time}`,
    time: normalizePromptAnimationTime(time),
    position: camera.position ?? camera.from ?? [0, 1.6, 4],
    target: camera.target ?? [0, 1.2, 0],
    fov: camera.fov ?? 40,
    focusDistance: camera.focusDistance,
    shake: camera.shake
  };
}

export function sampleCameraChoreography(choreography: LegacyCameraChoreography, time: PromptAnimationSeconds): CameraKeyframe {
  if (choreography.keyframes.length === 0) throw new Error("Camera choreography requires at least one keyframe.");
  const first = choreography.keyframes[0]!;
  const last = choreography.keyframes[choreography.keyframes.length - 1]!;
  if (time <= first.time) return first;
  if (time >= last.time) return last;
  const end = choreography.keyframes.find((keyframe) => keyframe.time >= time) ?? last;
  const start = choreography.keyframes[Math.max(0, choreography.keyframes.indexOf(end) - 1)] ?? first;
  const t = (time - start.time) / Math.max(0.0001, end.time - start.time);
  return {
    id: `${start.id}:sample:${normalizePromptAnimationTime(time)}`,
    time: normalizePromptAnimationTime(time),
    position: lerpVec3(start.position, end.position, t),
    target: lerpVec3(start.target, end.target, t),
    fov: Number(lerp(start.fov, end.fov, t).toFixed(4)),
    focusDistance: start.focusDistance !== undefined || end.focusDistance !== undefined
      ? lerp(start.focusDistance ?? end.focusDistance ?? 0, end.focusDistance ?? start.focusDistance ?? 0, t)
      : undefined,
    shake: lerp(start.shake ?? 0, end.shake ?? 0, t)
  };
}

export function createCameraPathFromPreset(input: {
  readonly id: PromptAnimationId;
  readonly presetId: CameraPresetId;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly subjectPosition?: AuraVec3 | undefined;
  readonly interpolation?: CameraPathInterpolation | undefined;
}): CameraPath {
  const camera = applyCameraPreset(input.presetId, { subjectPosition: input.subjectPosition });
  const start = camera.from ?? camera.position ?? [0, 1.6, 4];
  const end = camera.to ?? camera.position ?? start;
  const target = camera.target ?? [0, 1.2, 0];
  return {
    id: input.id,
    interpolation: input.interpolation ?? "smoothstep",
    keyframes: [
      {
        id: `${input.id}:start`,
        time: normalizePromptAnimationTime(input.startTime),
        position: start,
        target,
        fov: camera.fov ?? 40,
        focusDistance: camera.focusDistance,
        shake: camera.shake
      },
      {
        id: `${input.id}:end`,
        time: normalizePromptAnimationTime(input.endTime),
        position: end,
        target,
        fov: camera.fov ?? 40,
        focusDistance: camera.focusDistance,
        shake: 0
      }
    ]
  };
}

export function sampleCameraPath(path: CameraPath, time: PromptAnimationSeconds): CameraSample {
  const keyframes = [...path.keyframes].sort((a, b) => a.time - b.time);
  const first = keyframes[0];
  if (!first) throw new Error(`Camera path "${path.id}" has no keyframes.`);
  const normalized = normalizePromptAnimationTime(time);
  const previous = [...keyframes].reverse().find((keyframe) => keyframe.time <= normalized) ?? first;
  const next = keyframes.find((keyframe) => keyframe.time >= normalized) ?? keyframes[keyframes.length - 1] ?? first;
  const span = Math.max(0.0001, next.time - previous.time);
  const t = previous === next ? 0 : easing((normalized - previous.time) / span, path.interpolation);
  return {
    time: normalized,
    pathId: path.id,
    position: lerpVec3(previous.position, next.position, t),
    target: lerpVec3(previous.target, next.target, t),
    fov: lerp(previous.fov, next.fov, t),
    ...(previous.focusDistance !== undefined || next.focusDistance !== undefined
      ? { focusDistance: lerp(previous.focusDistance ?? next.focusDistance ?? 0, next.focusDistance ?? previous.focusDistance ?? 0, t) }
      : {}),
    shake: lerp(previous.shake ?? 0, next.shake ?? 0, t)
  };
}

export function shotReverseShotCameraPaths(input: {
  readonly episodeId: PromptAnimationId;
  readonly speakerAId: PromptAnimationId;
  readonly speakerBId: PromptAnimationId;
  readonly speakerAPosition: AuraVec3;
  readonly speakerBPosition: AuraVec3;
  readonly startTime: PromptAnimationSeconds;
  readonly turnDuration: PromptAnimationSeconds;
  readonly turns: number;
}): CameraChoreographyArtifact {
  const paths: CameraPath[] = [];
  for (let turn = 0; turn < input.turns; turn += 1) {
    const focusA = turn % 2 === 0;
    const subjectPosition = focusA ? input.speakerAPosition : input.speakerBPosition;
    const focusId = focusA ? input.speakerAId : input.speakerBId;
    const startTime = input.startTime + turn * input.turnDuration;
    const camera = applyCameraPreset("over-shoulder", { subjectPosition, focusTargetId: focusId });
    paths.push({
      id: `shot-reverse:${turn}:${focusId}`,
      interpolation: "smoothstep",
      keyframes: [
        {
          id: `shot-reverse:${turn}:start`,
          time: normalizePromptAnimationTime(startTime),
          position: camera.position ?? [0, 1.6, 3.2],
          target: camera.target ?? subjectPosition,
          fov: camera.fov ?? 35
        },
        {
          id: `shot-reverse:${turn}:end`,
          time: normalizePromptAnimationTime(startTime + input.turnDuration),
          position: camera.position ?? [0, 1.6, 3.2],
          target: camera.target ?? subjectPosition,
          fov: camera.fov ?? 35
        }
      ]
    });
  }
  return createCameraChoreography({ episodeId: input.episodeId, paths });
}

export function cameraInstructionFromSample(sample: CameraSample): ShotCameraInstruction {
  return {
    move: sample.shake > 0 ? "handheld" : "static",
    position: sample.position,
    target: sample.target,
    fov: sample.fov,
    focusDistance: sample.focusDistance,
    shake: sample.shake
  };
}

function easing(t: number, interpolation: CameraPathInterpolation): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (interpolation === "smoothstep" || interpolation === "catmull-rom") return clamped * clamped * (3 - 2 * clamped);
  return clamped;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

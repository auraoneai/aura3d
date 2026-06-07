import type { AuraVec3 } from "./index.js";
import { sampleCameraPath, type CameraKeyframe, type CameraPath, type CameraSample } from "./CameraChoreographer.js";
import { normalizePromptAnimationTime, type PromptAnimationId, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface CameraPathEditorState {
  readonly path: CameraPath;
  readonly selectedKeyframeIds: readonly PromptAnimationId[];
  readonly pathMarkers: readonly CameraPathMarker[];
}

export interface CameraPathMarker {
  readonly keyframeId: PromptAnimationId;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly label: string;
}

export function createCameraPathEditorState(path: CameraPath): CameraPathEditorState {
  return {
    path,
    selectedKeyframeIds: [],
    pathMarkers: path.keyframes.map(keyframeToMarker)
  };
}

export function addCameraKeyframe(path: CameraPath, keyframe: CameraKeyframe): CameraPath {
  return {
    ...path,
    keyframes: [...path.keyframes.filter((candidate) => candidate.id !== keyframe.id), keyframe].sort((a, b) => a.time - b.time)
  };
}

export function moveCameraKeyframe(
  path: CameraPath,
  keyframeId: PromptAnimationId,
  patch: Partial<Pick<CameraKeyframe, "time" | "position" | "target" | "fov" | "focusDistance" | "shake">>
): CameraPath {
  return {
    ...path,
    keyframes: path.keyframes
      .map((keyframe) => keyframe.id === keyframeId
        ? {
            ...keyframe,
            ...patch,
            time: patch.time === undefined ? keyframe.time : normalizePromptAnimationTime(patch.time)
          }
        : keyframe)
      .sort((a, b) => a.time - b.time)
  };
}

export function removeCameraKeyframe(path: CameraPath, keyframeId: PromptAnimationId): CameraPath {
  return {
    ...path,
    keyframes: path.keyframes.filter((keyframe) => keyframe.id !== keyframeId)
  };
}

export function sampleCameraPathEditorPreview(
  state: CameraPathEditorState,
  times: readonly PromptAnimationSeconds[]
): readonly CameraSample[] {
  return times.map((time) => sampleCameraPath(state.path, time));
}

function keyframeToMarker(keyframe: CameraKeyframe): CameraPathMarker {
  return {
    keyframeId: keyframe.id,
    position: keyframe.position,
    target: keyframe.target,
    label: keyframe.id
  };
}

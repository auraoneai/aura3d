import { CommandHistory } from "./CommandHistory";
import { CurveEditor } from "./CurveEditor";
import { KeyframeEditor, readTimelineKeyframes, type TimelineKeyframe } from "./KeyframeEditor";
import type { TimelineClip } from "./TimelineModel";

export type EditorCameraVector3 = readonly [number, number, number];

export interface EditorCameraPathKeyframe {
  readonly id: string;
  readonly time: number;
  readonly position: EditorCameraVector3;
  readonly target: EditorCameraVector3;
  readonly fov: number;
  readonly focusDistance?: number;
  readonly shake?: number;
  readonly interpolation?: TimelineKeyframe["interpolation"];
}

export interface EditorCameraPathSample {
  readonly time: number;
  readonly position: EditorCameraVector3;
  readonly target: EditorCameraVector3;
  readonly fov: number;
  readonly focusDistance?: number;
  readonly shake: number;
}

export interface EditorCameraPathEvidence {
  readonly clipId: string;
  readonly cameraKeyframeCount: number;
  readonly editablePropertyCount: number;
  readonly sampledPointCount: number;
  readonly evidence: {
    readonly shotCameraMoveEditing: boolean;
    readonly cameraPositionCurves: boolean;
    readonly cameraTargetCurves: boolean;
    readonly fovCurve: boolean;
    readonly deterministicSampling: true;
  };
}

const CAMERA_PROPERTY_PATHS = [
  "camera.position.x",
  "camera.position.y",
  "camera.position.z",
  "camera.target.x",
  "camera.target.y",
  "camera.target.z",
  "camera.fov",
  "camera.focusDistance",
  "camera.shake"
] as const;

type CameraPropertyPath = typeof CAMERA_PROPERTY_PATHS[number];

export class CameraPathEditor {
  private readonly keyframes: KeyframeEditor;
  private readonly curves: CurveEditor;

  constructor(history = new CommandHistory()) {
    this.keyframes = new KeyframeEditor(history);
    this.curves = new CurveEditor(history);
  }

  get commandHistory(): CommandHistory {
    return this.keyframes.commandHistory;
  }

  async setCameraKeyframe(clip: TimelineClip, keyframe: EditorCameraPathKeyframe): Promise<EditorCameraPathKeyframe> {
    const normalized = normalizeCameraKeyframe(keyframe);
    const interpolation = normalized.interpolation ?? "linear";
    for (const [propertyPath, value] of cameraKeyframeEntries(normalized)) {
      await this.keyframes.addKeyframe(clip, {
        id: cameraKeyframePropertyId(normalized.id, propertyPath),
        propertyPath,
        time: normalized.time,
        value,
        interpolation
      });
    }
    clip.properties.cameraPathEdited = "true";
    clip.properties.cameraPathKeyframeIds = JSON.stringify(readCameraPathKeyframes(clip).map((frame) => frame.id));
    return normalized;
  }

  readCameraPathKeyframes(clip: TimelineClip): readonly EditorCameraPathKeyframe[] {
    return readCameraPathKeyframes(clip);
  }

  sample(clip: TimelineClip, time: number): EditorCameraPathSample {
    assertFinite(time, "Camera path sample time");
    const fallback = this.readCameraPathKeyframes(clip)[0];
    if (!fallback) throw new Error(`Camera path clip "${clip.id}" has no editable camera keyframes.`);
    return {
      time,
      position: [
        numericCurveValue(this.curves.sample(clip, "camera.position.x", time).value, fallback.position[0]),
        numericCurveValue(this.curves.sample(clip, "camera.position.y", time).value, fallback.position[1]),
        numericCurveValue(this.curves.sample(clip, "camera.position.z", time).value, fallback.position[2])
      ],
      target: [
        numericCurveValue(this.curves.sample(clip, "camera.target.x", time).value, fallback.target[0]),
        numericCurveValue(this.curves.sample(clip, "camera.target.y", time).value, fallback.target[1]),
        numericCurveValue(this.curves.sample(clip, "camera.target.z", time).value, fallback.target[2])
      ],
      fov: numericCurveValue(this.curves.sample(clip, "camera.fov", time).value, fallback.fov),
      focusDistance: optionalNumericCurveValue(this.curves.sample(clip, "camera.focusDistance", time).value, fallback.focusDistance),
      shake: numericCurveValue(this.curves.sample(clip, "camera.shake", time).value, fallback.shake ?? 0)
    };
  }

  evidence(clip: TimelineClip): EditorCameraPathEvidence {
    const keyframes = this.readCameraPathKeyframes(clip);
    const encodedKeyframes = readTimelineKeyframes(clip);
    const fovEvidence = this.curves.evidence(clip, "camera.fov");
    return {
      clipId: clip.id,
      cameraKeyframeCount: keyframes.length,
      editablePropertyCount: CAMERA_PROPERTY_PATHS.filter((path) => encodedKeyframes.some((keyframe) => keyframe.propertyPath === path)).length,
      sampledPointCount: fovEvidence.sampledPointCount,
      evidence: {
        shotCameraMoveEditing: clip.properties.cameraPathEdited === "true" && keyframes.length >= 2,
        cameraPositionCurves: ["camera.position.x", "camera.position.y", "camera.position.z"].every((path) => encodedKeyframes.some((keyframe) => keyframe.propertyPath === path)),
        cameraTargetCurves: ["camera.target.x", "camera.target.y", "camera.target.z"].every((path) => encodedKeyframes.some((keyframe) => keyframe.propertyPath === path)),
        fovCurve: fovEvidence.keyframeCount >= 2,
        deterministicSampling: true
      }
    };
  }
}

export function createCameraPathEditor(history?: CommandHistory): CameraPathEditor {
  return new CameraPathEditor(history);
}

export function readCameraPathKeyframes(clip: TimelineClip): readonly EditorCameraPathKeyframe[] {
  const groups = new Map<string, Partial<Record<CameraPropertyPath, number>> & { time?: number }>();
  for (const keyframe of readTimelineKeyframes(clip)) {
    const parsed = parseCameraKeyframePropertyId(keyframe.id);
    if (!parsed) continue;
    if (typeof keyframe.value !== "number") continue;
    const group = groups.get(parsed.frameId) ?? {};
    group[parsed.propertyPath] = keyframe.value;
    group.time = keyframe.time;
    groups.set(parsed.frameId, group);
  }
  return [...groups.entries()].flatMap(([id, values]) => {
    const position = tupleFrom(values["camera.position.x"], values["camera.position.y"], values["camera.position.z"]);
    const target = tupleFrom(values["camera.target.x"], values["camera.target.y"], values["camera.target.z"]);
    if (!position || !target || values["camera.fov"] === undefined || values.time === undefined) return [];
    return [{
      id,
      time: values.time,
      position,
      target,
      fov: values["camera.fov"],
      focusDistance: values["camera.focusDistance"],
      shake: values["camera.shake"]
    }];
  }).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function cameraKeyframeEntries(keyframe: EditorCameraPathKeyframe): readonly (readonly [CameraPropertyPath, number])[] {
  return [
    ["camera.position.x", keyframe.position[0]],
    ["camera.position.y", keyframe.position[1]],
    ["camera.position.z", keyframe.position[2]],
    ["camera.target.x", keyframe.target[0]],
    ["camera.target.y", keyframe.target[1]],
    ["camera.target.z", keyframe.target[2]],
    ["camera.fov", keyframe.fov],
    ["camera.focusDistance", keyframe.focusDistance ?? 0],
    ["camera.shake", keyframe.shake ?? 0]
  ];
}

function normalizeCameraKeyframe(keyframe: EditorCameraPathKeyframe): EditorCameraPathKeyframe {
  const id = keyframe.id.trim();
  if (!id) throw new Error("Camera path keyframe id is required.");
  assertFinite(keyframe.time, "Camera path keyframe time");
  if (keyframe.time < 0) throw new RangeError("Camera path keyframe time must be non-negative.");
  assertVector3(keyframe.position, "Camera path keyframe position");
  assertVector3(keyframe.target, "Camera path keyframe target");
  assertFinite(keyframe.fov, "Camera path keyframe fov");
  if (keyframe.fov <= 0) throw new RangeError("Camera path keyframe fov must be positive.");
  if (keyframe.focusDistance !== undefined) assertFinite(keyframe.focusDistance, "Camera path keyframe focusDistance");
  if (keyframe.shake !== undefined) assertFinite(keyframe.shake, "Camera path keyframe shake");
  return { ...keyframe, id };
}

function cameraKeyframePropertyId(frameId: string, propertyPath: string): string {
  return `${frameId}#${propertyPath}`;
}

function parseCameraKeyframePropertyId(id: string): { readonly frameId: string; readonly propertyPath: CameraPropertyPath } | undefined {
  const separator = id.lastIndexOf("#");
  if (separator <= 0) return undefined;
  const propertyPath = id.slice(separator + 1);
  if (!CAMERA_PROPERTY_PATHS.includes(propertyPath as CameraPropertyPath)) return undefined;
  return { frameId: id.slice(0, separator), propertyPath: propertyPath as CameraPropertyPath };
}

function tupleFrom(x: number | undefined, y: number | undefined, z: number | undefined): EditorCameraVector3 | undefined {
  return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
}

function numericCurveValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumericCurveValue(value: unknown, fallback: number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function assertVector3(value: EditorCameraVector3, label: string): void {
  if (value.length !== 3) throw new Error(`${label} must contain three numeric components.`);
  for (const component of value) assertFinite(component, label);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

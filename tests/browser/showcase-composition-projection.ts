import type { PngCrop } from "./showcase-visual-quality";

export interface CompositionCameraProjectionInput {
  readonly mode: string;
  readonly position?: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly offset?: readonly [number, number, number];
  readonly targetOffset?: readonly [number, number, number];
  readonly offsetMode?: string;
  readonly fov: number;
}

export interface CompositionSubjectProjectionInput {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
}

export interface ResolvedCompositionCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

/** Mirrors the production renderer's follow-camera target and eye resolution. */
export function resolveCompositionCamera(
  camera: CompositionCameraProjectionInput,
  subject: CompositionSubjectProjectionInput
): ResolvedCompositionCamera {
  if (camera.mode !== "follow") {
    if (!camera.position) throw new Error("camera-position-missing");
    return { position: camera.position, target: camera.target, fov: camera.fov };
  }
  const offset = camera.offset ?? [0, 1, 5];
  const targetOffset = camera.targetOffset ?? [0, 0, 0];
  const rotatedOffset = camera.offsetMode === "target-yaw" ? rotateY(offset, subject.rotation[1]) : offset;
  const rotatedTarget = camera.offsetMode === "target-yaw" ? rotateY(targetOffset, subject.rotation[1]) : targetOffset;
  const target = addVec3(subject.position, rotatedTarget);
  return {
    // Production resolveCameraEye adds the follow offset to the already-resolved target.
    position: addVec3(target, rotatedOffset),
    target,
    fov: camera.fov
  };
}

export function projectScenePoint(
  point: readonly [number, number, number],
  camera: ResolvedCompositionCamera,
  crop: PngCrop
): { readonly x: number; readonly y: number } | undefined {
  const forward = normalizeVec3(subVec3(camera.target, camera.position));
  const right = normalizeVec3(crossVec3(forward, [0, 1, 0]));
  const up = normalizeVec3(crossVec3(right, forward));
  const relative = subVec3(point, camera.position);
  const depth = dotVec3(relative, forward);
  if (depth <= 0.001) return undefined;
  const tangent = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = crop.width / crop.height;
  const ndcX = dotVec3(relative, right) / (depth * tangent * aspect);
  const ndcY = dotVec3(relative, up) / (depth * tangent);
  return {
    x: Number((crop.x + ((ndcX + 1) / 2) * crop.width).toFixed(3)),
    y: Number((crop.y + ((1 - ndcY) / 2) * crop.height).toFixed(3))
  };
}

function addVec3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function subVec3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function rotateY(value: readonly [number, number, number], yaw: number): readonly [number, number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [value[0] * cosine + value[2] * sine, value[1], -value[0] * sine + value[2] * cosine];
}
function dotVec3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function crossVec3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalizeVec3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

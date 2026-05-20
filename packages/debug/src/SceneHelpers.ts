import type { DebugRenderLine } from "./DebugLineCanvasRenderer.js";

export type DebugVec3 = readonly [number, number, number];
export type DebugColor = readonly [number, number, number, number];

export interface AxesHelperOptions {
  readonly size?: number;
  readonly origin?: DebugVec3;
}

export interface GridHelperOptions {
  readonly size?: number;
  readonly divisions?: number;
  readonly y?: number;
  readonly color?: DebugColor;
  readonly centerColor?: DebugColor;
}

export interface BoundsHelperOptions {
  readonly min: DebugVec3;
  readonly max: DebugVec3;
  readonly color?: DebugColor;
}

export interface CameraFrustumHelperOptions {
  readonly nearHalfWidth: number;
  readonly nearHalfHeight: number;
  readonly farHalfWidth: number;
  readonly farHalfHeight: number;
  readonly nearZ?: number;
  readonly farZ?: number;
  readonly color?: DebugColor;
}

export interface DirectionalLightHelperOptions {
  readonly direction: DebugVec3;
  readonly origin?: DebugVec3;
  readonly length?: number;
  readonly color?: DebugColor;
}

export interface SkeletonHelperJoint {
  readonly id: string;
  readonly parentId?: string;
  readonly position: DebugVec3;
}

const AXIS_X: DebugColor = [1, 0.18, 0.14, 1];
const AXIS_Y: DebugColor = [0.18, 0.86, 0.28, 1];
const AXIS_Z: DebugColor = [0.2, 0.48, 1, 1];
const DEFAULT_GRID: DebugColor = [0.38, 0.46, 0.58, 1];
const DEFAULT_CENTER: DebugColor = [0.72, 0.78, 0.86, 1];
const DEFAULT_HELPER: DebugColor = [1, 0.84, 0.28, 1];

export function buildAxesHelper(options: AxesHelperOptions = {}): readonly DebugRenderLine[] {
  const size = positive(options.size ?? 1, "Axes helper size");
  const origin = options.origin ?? [0, 0, 0];
  return [
    { from: origin, to: [origin[0] + size, origin[1], origin[2]], color: AXIS_X },
    { from: origin, to: [origin[0], origin[1] + size, origin[2]], color: AXIS_Y },
    { from: origin, to: [origin[0], origin[1], origin[2] + size], color: AXIS_Z }
  ];
}

export function buildGridHelper(options: GridHelperOptions = {}): readonly DebugRenderLine[] {
  const size = positive(options.size ?? 10, "Grid helper size");
  const divisions = integerAtLeast(options.divisions ?? 10, 1, "Grid helper divisions");
  const y = finite(options.y ?? 0, "Grid helper y");
  const half = size / 2;
  const step = size / divisions;
  const lines: DebugRenderLine[] = [];
  for (let index = 0; index <= divisions; index += 1) {
    const offset = -half + index * step;
    const isCenter = Math.abs(offset) < 1e-8;
    const color = isCenter ? options.centerColor ?? DEFAULT_CENTER : options.color ?? DEFAULT_GRID;
    lines.push({ from: [-half, y, offset], to: [half, y, offset], color });
    lines.push({ from: [offset, y, -half], to: [offset, y, half], color });
  }
  return lines;
}

export function buildBoundsHelper(options: BoundsHelperOptions): readonly DebugRenderLine[] {
  validateVec3(options.min, "Bounds helper min");
  validateVec3(options.max, "Bounds helper max");
  const [minX, minY, minZ] = options.min;
  const [maxX, maxY, maxZ] = options.max;
  if (maxX < minX || maxY < minY || maxZ < minZ) {
    throw new RangeError("Bounds helper max must be greater than or equal to min.");
  }
  const color = options.color ?? DEFAULT_HELPER;
  const p: readonly DebugVec3[] = [
    [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]
  ];
  return edges([
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ], p, color);
}

export function buildCameraFrustumHelper(options: CameraFrustumHelperOptions): readonly DebugRenderLine[] {
  const nearHalfWidth = positive(options.nearHalfWidth, "Camera frustum nearHalfWidth");
  const nearHalfHeight = positive(options.nearHalfHeight, "Camera frustum nearHalfHeight");
  const farHalfWidth = positive(options.farHalfWidth, "Camera frustum farHalfWidth");
  const farHalfHeight = positive(options.farHalfHeight, "Camera frustum farHalfHeight");
  const nearZ = finite(options.nearZ ?? -0.1, "Camera frustum nearZ");
  const farZ = finite(options.farZ ?? -1, "Camera frustum farZ");
  if (Math.abs(nearZ - farZ) < 1e-8) {
    throw new RangeError("Camera frustum nearZ and farZ must be distinct.");
  }
  const p: readonly DebugVec3[] = [
    [-nearHalfWidth, -nearHalfHeight, nearZ],
    [nearHalfWidth, -nearHalfHeight, nearZ],
    [nearHalfWidth, nearHalfHeight, nearZ],
    [-nearHalfWidth, nearHalfHeight, nearZ],
    [-farHalfWidth, -farHalfHeight, farZ],
    [farHalfWidth, -farHalfHeight, farZ],
    [farHalfWidth, farHalfHeight, farZ],
    [-farHalfWidth, farHalfHeight, farZ]
  ];
  return edges([
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ], p, options.color ?? DEFAULT_HELPER);
}

export function buildDirectionalLightHelper(options: DirectionalLightHelperOptions): readonly DebugRenderLine[] {
  const origin = options.origin ?? [0, 0, 0];
  const length = positive(options.length ?? 1, "Directional light helper length");
  const direction = normalize(options.direction, "Directional light helper direction");
  const to: DebugVec3 = [
    origin[0] + direction[0] * length,
    origin[1] + direction[1] * length,
    origin[2] + direction[2] * length
  ];
  return [{ from: origin, to, color: options.color ?? DEFAULT_HELPER }];
}

export function buildSkeletonHelper(joints: readonly SkeletonHelperJoint[], color: DebugColor = DEFAULT_HELPER): readonly DebugRenderLine[] {
  const byId = new Map<string, SkeletonHelperJoint>();
  for (const joint of joints) {
    if (!joint.id) throw new Error("Skeleton helper joints require stable ids.");
    validateVec3(joint.position, `Skeleton helper joint ${joint.id}`);
    byId.set(joint.id, joint);
  }
  const lines: DebugRenderLine[] = [];
  for (const joint of joints) {
    if (!joint.parentId) continue;
    const parent = byId.get(joint.parentId);
    if (!parent) continue;
    lines.push({ from: parent.position, to: joint.position, color });
  }
  return lines;
}

function edges(indices: readonly (readonly [number, number])[], points: readonly DebugVec3[], color: DebugColor): readonly DebugRenderLine[] {
  return indices.map(([from, to]) => ({ from: points[from]!, to: points[to]!, color }));
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function integerAtLeast(value: number, minimum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}.`);
  return value;
}

function validateVec3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${label} must contain three finite values.`);
  }
}

function normalize(value: DebugVec3, label: string): DebugVec3 {
  validateVec3(value, label);
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) throw new RangeError(`${label} must be non-zero.`);
  return [value[0] / length, value[1] / length, value[2] / length];
}

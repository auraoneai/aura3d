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

/** Column-major affine transform, using the same convention as scene matrices. */
export type DebugHelperMatrix = readonly number[] | Float32Array;

/**
 * A reusable helper whose geometry is sampled from live scene state. It owns
 * no renderer resources; feed `lines()` to a debug renderer after each update.
 * Transform and visibility are applied on read, leaving source geometry in
 * local space. `dispose` releases the reader and geometry and is idempotent.
 */
export class DynamicSceneHelper<T> {
  private reader: (() => T) | undefined;
  private builder: ((source: T) => readonly DebugRenderLine[]) | undefined;
  private localLines: readonly DebugRenderLine[] = [];
  private matrix: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  private shown = true;
  private closed = false;

  constructor(reader: () => T, builder: (source: T) => readonly DebugRenderLine[]) {
    this.reader = reader;
    this.builder = builder;
    this.update();
  }

  get disposed(): boolean { return this.closed; }
  get visible(): boolean { return this.shown && !this.closed; }

  /** Re-read current state; failed validation leaves the last valid geometry intact. */
  update(): readonly DebugRenderLine[] {
    this.assertOpen();
    const next = this.builder!(this.reader!());
    if (next.length > 262144) throw new RangeError("Debug helper exceeds the 262144 line limit.");
    const copied = next.map((line, index) => copyLine(line, `Debug helper line ${index}`));
    this.localLines = copied;
    return this.lines();
  }

  setVisible(visible: boolean): this {
    this.assertOpen();
    this.shown = visible;
    return this;
  }

  setTransform(matrix: DebugHelperMatrix): this {
    this.assertOpen();
    if (matrix.length !== 16 || Array.from(matrix).some((component) => !Number.isFinite(component)) ||
      matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
      throw new RangeError("Debug helper transform must be a finite column-major affine matrix.");
    }
    this.matrix = Array.from(matrix);
    return this;
  }

  /** Returns independent endpoint and color arrays, so consumers cannot mutate stored state. */
  lines(): readonly DebugRenderLine[] {
    if (!this.visible) return [];
    return this.localLines.map((line) => ({
      from: transformPoint(line.from, this.matrix),
      to: transformPoint(line.to, this.matrix),
      color: [...line.color] as [number, number, number, number]
    }));
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.localLines = [];
    this.reader = undefined;
    this.builder = undefined;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Debug helper has been disposed.");
  }
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
  validateVec3(origin, "Axes helper origin");
  return [
    { from: origin, to: [origin[0] + size, origin[1], origin[2]], color: AXIS_X },
    { from: origin, to: [origin[0], origin[1] + size, origin[2]], color: AXIS_Y },
    { from: origin, to: [origin[0], origin[1], origin[2] + size], color: AXIS_Z }
  ];
}

export function buildGridHelper(options: GridHelperOptions = {}): readonly DebugRenderLine[] {
  const size = positive(options.size ?? 10, "Grid helper size");
  const divisions = integerAtLeast(options.divisions ?? 10, 1, "Grid helper divisions");
  if (divisions > 65535) throw new RangeError("Grid helper divisions must not exceed 65535.");
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
  validateVec3(origin, "Directional light helper origin");
  const length = positive(options.length ?? 1, "Directional light helper length");
  const direction = normalize(options.direction, "Directional light helper direction");
  const to: DebugVec3 = [
    origin[0] + direction[0] * length,
    origin[1] + direction[1] * length,
    origin[2] + direction[2] * length
  ];
  return [{ from: origin, to, color: options.color ?? DEFAULT_HELPER }];
}

function copyLine(line: DebugRenderLine, label: string): DebugRenderLine {
  validateVec3(line.from, `${label} from`);
  validateVec3(line.to, `${label} to`);
  if (line.color.length !== 4 || line.color.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${label} color must contain four finite values.`);
  }
  return {
    from: [...line.from] as [number, number, number],
    to: [...line.to] as [number, number, number],
    color: [...line.color] as [number, number, number, number]
  };
}

function transformPoint(point: DebugVec3, matrix: readonly number[]): DebugVec3 {
  return [
    matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
    matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
    matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!
  ];
}

export function buildSkeletonHelper(joints: readonly SkeletonHelperJoint[], color: DebugColor = DEFAULT_HELPER): readonly DebugRenderLine[] {
  if (joints.length > 262144) throw new RangeError("Skeleton helper exceeds the 262144 joint limit.");
  const byId = new Map<string, SkeletonHelperJoint>();
  for (const joint of joints) {
    if (!joint.id) throw new Error("Skeleton helper joints require stable ids.");
    if (byId.has(joint.id)) throw new Error(`Skeleton helper joint id '${joint.id}' is duplicated.`);
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

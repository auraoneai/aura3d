import type { PhysicsShape } from "@aura3d/physics/solverless";
import type { DebugRenderLine } from "./DebugLineCanvasRenderer.js";
import { buildBoundsHelper, type DebugColor, type DebugHelperMatrix, type DebugVec3 } from "./SceneHelpers.js";

const DEFAULT_COLOR: DebugColor = [1, 0.84, 0.28, 1];
const MAX_LINES = 262144;
const MAX_PROBES = 4096;
const MAX_PIXELS = 65536;

export interface AnimationPathHelperOptions {
  readonly points: readonly DebugVec3[];
  readonly closed?: boolean;
  readonly color?: DebugColor;
}
export interface AudioOrientationHelperOptions {
  readonly origin?: DebugVec3;
  readonly direction: DebugVec3;
  readonly up?: DebugVec3;
  readonly length?: number;
  readonly color?: DebugColor;
}
export interface ProbeHelperOptions {
  readonly center?: DebugVec3;
  readonly size?: number;
  readonly segments?: number;
  readonly color?: DebugColor;
}
export interface ProbeGridHelperOptions {
  readonly min: DebugVec3;
  readonly max: DebugVec3;
  /** Number of probes on each axis. A one-probe axis is placed at its midpoint. */
  readonly divisions: readonly [number, number, number];
  readonly size?: number;
  readonly maxProbes?: number;
  readonly color?: DebugColor;
}
export interface OctreeHelperNode {
  readonly min: DebugVec3;
  readonly max: DebugVec3;
  readonly children?: readonly OctreeHelperNode[];
}
export interface OctreeHelperOptions {
  readonly root: OctreeHelperNode;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly color?: DebugColor;
}
export interface ColliderHelperOptions {
  readonly shape: PhysicsShape;
  /** Plane shapes are infinite; this controls the drawn square extent. */
  readonly planeSize?: number;
  readonly segments?: number;
  readonly color?: DebugColor;
}
export interface AreaLightHelperOptions {
  readonly width: number;
  readonly height: number;
  /** Local -Z emission direction; use the node transform to orient it. */
  readonly length?: number;
  readonly color?: DebugColor;
}
export interface TextureHelperOptions {
  readonly width: number;
  readonly height: number;
  /** Row-major CPU pixel data, top row first; bytes are 0..255 and floats are 0..1. */
  readonly pixels: Uint8Array | Uint8ClampedArray | Float32Array;
  readonly channels?: 1 | 2 | 3 | 4;
  readonly size?: number | readonly [number, number];
  readonly origin?: DebugVec3;
  readonly maxPixels?: number;
}
export interface VertexNormalHelperOptions {
  readonly positions: readonly DebugVec3[];
  readonly normals: readonly DebugVec3[];
  readonly length?: number;
  readonly color?: DebugColor;
  /** Local-to-world matrix; normals use its inverse transpose, including reflections. */
  readonly transform?: DebugHelperMatrix;
}
export type DebugTangent = DebugVec3 | readonly [number, number, number, number];
export interface TangentHelperOptions {
  readonly positions: readonly DebugVec3[];
  readonly tangents: readonly DebugTangent[];
  readonly length?: number;
  readonly color?: DebugColor;
  /** Local-to-world matrix; tangents use its linear part. */
  readonly transform?: DebugHelperMatrix;
}

/** Draws each sampled animation segment, including an optional closing segment. */
export function buildAnimationPathHelper(options: AnimationPathHelperOptions): readonly DebugRenderLine[] {
  bounded(options.points.length, options.closed ? MAX_LINES : MAX_LINES + 1, "Animation path points");
  const color = checkedColor(options.color);
  const points = options.points.map((point, i) => checkedVec(point, `Animation path point ${i}`));
  const lines: DebugRenderLine[] = [];
  for (let i = 1; i < points.length; i += 1) lines.push(line(points[i - 1]!, points[i]!, color));
  if (options.closed && points.length > 2) lines.push(line(points[points.length - 1]!, points[0]!, color));
  return lines;
}

/** Forward and orthogonalized up arrows visualize the orientation used by audio. */
export function buildAudioOrientationHelper(options: AudioOrientationHelperOptions): readonly DebugRenderLine[] {
  const origin = checkedVec(options.origin ?? [0, 0, 0], "Audio origin");
  const forward = unit(options.direction, "Audio direction");
  const requestedUp = unit(options.up ?? [0, 1, 0], "Audio up");
  const right = unit(cross(forward, requestedUp), "Audio direction and up must not be parallel");
  const up = unit(cross(right, forward), "Audio up");
  const length = positive(options.length ?? 1, "Audio length");
  const color = checkedColor(options.color);
  return [...arrow(origin, forward, right, length, color), ...arrow(origin, up, right, length * 0.7, color)];
}

/** Three perpendicular rings representing a spherical light/reflection probe. */
export function buildProbeHelper(options: ProbeHelperOptions = {}): readonly DebugRenderLine[] {
  const center = checkedVec(options.center ?? [0, 0, 0], "Probe center");
  const size = positive(options.size ?? 0.25, "Probe size");
  const segments = segmentCount(options.segments);
  const color = checkedColor(options.color);
  return sphere(center, size, segments, color);
}

/** Crosses at the requested probe positions, not interpolation of probe data. */
export function buildProbeGridHelper(options: ProbeGridHelperOptions): readonly DebugRenderLine[] {
  const min = checkedVec(options.min, "Probe grid min");
  const max = checkedVec(options.max, "Probe grid max");
  for (let i = 0; i < 3; i += 1) if (max[i]! < min[i]!) throw new RangeError("Probe grid max must be >= min.");
  const dims = options.divisions;
  if (!Array.isArray(dims) || dims.length !== 3 || dims.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    throw new RangeError("Probe grid divisions must contain three positive integers.");
  }
  const maxProbes = limit(options.maxProbes ?? MAX_PROBES, MAX_PROBES, "Probe grid maxProbes");
  const count = dims[0] * dims[1] * dims[2];
  if (!Number.isSafeInteger(count) || count > maxProbes) throw new RangeError(`Probe grid exceeds ${maxProbes} probes.`);
  const size = positive(options.size ?? 0.1, "Probe grid size");
  const color = checkedColor(options.color);
  const at = (axis: number, n: number): number => dims[axis] === 1 ? (min[axis]! + max[axis]!) / 2 : min[axis]! + (max[axis]! - min[axis]!) * n / (dims[axis]! - 1);
  const lines: DebugRenderLine[] = [];
  for (let x = 0; x < dims[0]; x += 1) for (let y = 0; y < dims[1]; y += 1) for (let z = 0; z < dims[2]; z += 1) {
    const p: DebugVec3 = [at(0, x), at(1, y), at(2, z)];
    lines.push(line([p[0] - size, p[1], p[2]], [p[0] + size, p[1], p[2]], color));
    lines.push(line([p[0], p[1] - size, p[2]], [p[0], p[1] + size, p[2]], color));
    lines.push(line([p[0], p[1], p[2] - size], [p[0], p[1], p[2] + size], color));
  }
  return lines;
}

/** Draws supplied octree bounds with cycle, depth and node limits. */
export function buildOctreeHelper(options: OctreeHelperOptions): readonly DebugRenderLine[] {
  const maxDepth = options.maxDepth ?? 32;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 64) throw new RangeError("Octree maxDepth must be an integer from 0 to 64.");
  const maxNodes = limit(options.maxNodes ?? 4096, 16384, "Octree maxNodes");
  const color = checkedColor(options.color);
  const lines: DebugRenderLine[] = [];
  const seen = new Set<OctreeHelperNode>();
  const pending: { node: OctreeHelperNode; depth: number }[] = [{ node: options.root, depth: 0 }];
  while (pending.length > 0) {
    const { node, depth } = pending.pop()!;
    if (!node || seen.has(node)) throw new Error("Octree helper requires an acyclic tree without repeated nodes.");
    seen.add(node);
    if (seen.size > maxNodes) throw new RangeError(`Octree helper exceeds ${maxNodes} nodes.`);
    lines.push(...buildBoundsHelper({ min: node.min, max: node.max, color }));
    if (depth < maxDepth) {
      const children = node.children ?? [];
      if (children.length > 8) throw new RangeError("An octree node cannot have more than eight children.");
      for (let i = children.length - 1; i >= 0; i -= 1) pending.push({ node: children[i]!, depth: depth + 1 });
    }
  }
  return lines;
}

/** Local-space outline of every PhysicsShape. World transforms can be applied separately. */
export function buildColliderHelper(options: ColliderHelperOptions): readonly DebugRenderLine[] {
  const shape = options.shape;
  const color = checkedColor(options.color);
  switch (shape.kind) {
    case "box": {
      const h = checkedVec(shape.halfExtents, "Collider halfExtents");
      if (h.some((x) => x < 0)) throw new RangeError("Collider halfExtents must be non-negative.");
      return buildBoundsHelper({ min: [-h[0], -h[1], -h[2]], max: h, color });
    }
    case "sphere": return sphere([0, 0, 0], positive(shape.radius, "Collider radius"), segmentCount(options.segments), color);
    case "capsule": {
      const radius = positive(shape.radius, "Collider radius");
      const h = nonnegative(shape.halfHeight, "Collider halfHeight");
      const count = segmentCount(options.segments);
      const lines: DebugRenderLine[] = [];
      for (let i = 0; i < count; i += 1) {
        const a = i * Math.PI * 2 / count, b = (i + 1) * Math.PI * 2 / count;
        for (const y of [-h, h]) lines.push(line([radius * Math.cos(a), y, radius * Math.sin(a)], [radius * Math.cos(b), y, radius * Math.sin(b)], color));
        const t0 = i * Math.PI / count, t1 = (i + 1) * Math.PI / count;
        for (const side of [-1, 1]) for (const axis of [0, 2]) {
          const cap = (t: number): DebugVec3 => axis === 0
            ? [radius * Math.cos(t), side * (h + radius * Math.sin(t)), 0]
            : [0, side * (h + radius * Math.sin(t)), radius * Math.cos(t)];
          lines.push(line(cap(t0), cap(t1), color));
        }
      }
      for (const p of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]] as const) lines.push(line([p[0], -h, p[1]], [p[0], h, p[1]], color));
      return lines;
    }
    case "plane": {
      const n = unit(shape.normal, "Collider plane normal");
      if (!Number.isFinite(shape.constant)) throw new RangeError("Collider plane constant must be finite.");
      const extent = positive(options.planeSize ?? 10, "Collider plane size") / 2;
      const length = Math.hypot(...shape.normal);
      const center = mul(n, -shape.constant / length);
      const tangent = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), "Collider plane tangent");
      const bitangent = cross(n, tangent);
      const p = (x: number, y: number): DebugVec3 => add(center, add(mul(tangent, x * extent), mul(bitangent, y * extent)));
      const corners = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
      return corners.map((corner, i) => line(corner, corners[(i + 1) % 4]!, color));
    }
    case "mesh":
    case "convex-hull": {
      bounded(shape.indices.length, MAX_LINES * 3, "Collider indices");
      bounded(shape.vertices.length, MAX_LINES, "Collider vertices");
      if (shape.indices.length % 3 !== 0) throw new RangeError("Collider indices must contain complete triangles.");
      const vertices = shape.vertices.map((p, i) => checkedVec(p, `Collider vertex ${i}`));
      const lines: DebugRenderLine[] = [];
      const edges = new Set<string>();
      const edge = (a: number, b: number): void => {
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= vertices.length || b >= vertices.length) throw new RangeError("Collider triangle index is out of range.");
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!edges.has(key) && a !== b) { edges.add(key); lines.push(line(vertices[a]!, vertices[b]!, color)); }
      };
      for (let i = 0; i < shape.indices.length; i += 3) {
        const a = shape.indices[i]!, b = shape.indices[i + 1]!, c = shape.indices[i + 2]!;
        edge(a, b); edge(b, c); edge(c, a);
        bounded(lines.length, MAX_LINES, "Collider lines");
      }
      return lines;
    }
    case "heightfield": {
      const { rows, columns, heights } = shape;
      if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1 || rows * columns !== heights.length || rows * columns > MAX_LINES / 2) {
        throw new RangeError("Heightfield dimensions must match a bounded height array.");
      }
      const cell = positive(shape.cellSize, "Heightfield cellSize");
      if (heights.some((v) => !Number.isFinite(v))) throw new RangeError("Heightfield heights must be finite.");
      const p = (r: number, c: number): DebugVec3 => [(c - (columns - 1) / 2) * cell, heights[r * columns + c]!, (r - (rows - 1) / 2) * cell];
      const lines: DebugRenderLine[] = [];
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < columns; c += 1) {
        if (c + 1 < columns) lines.push(line(p(r, c), p(r, c + 1), color));
        if (r + 1 < rows) lines.push(line(p(r, c), p(r + 1, c), color));
      }
      return lines;
    }
  }
}

/** Rectangle plus five rays; the light emits along its local -Z axis. */
export function buildAreaLightHelper(options: AreaLightHelperOptions): readonly DebugRenderLine[] {
  const x = positive(options.width, "Area light width") / 2;
  const y = positive(options.height, "Area light height") / 2;
  const length = positive(options.length ?? 1, "Area light length");
  const color = checkedColor(options.color);
  const corners: readonly DebugVec3[] = [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]];
  const lines = corners.map((p, i) => line(p, corners[(i + 1) % 4]!, color));
  for (const p of [...corners, [0, 0, 0] as DebugVec3]) lines.push(line(p, [p[0], p[1], -length], color));
  return lines;
}

/**
 * A bounded CPU texture preview made of one colored horizontal line per texel.
 * It does not read GPU textures; callers supply their own retained pixel data.
 */
export function buildTextureHelper(options: TextureHelperOptions): readonly DebugRenderLine[] {
  const { width, height, pixels } = options;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError("Texture dimensions must be positive integers.");
  const maxPixels = limit(options.maxPixels ?? MAX_PIXELS, MAX_PIXELS, "Texture maxPixels");
  if (width * height > maxPixels) throw new RangeError(`Texture helper exceeds ${maxPixels} pixels.`);
  const channels = options.channels ?? 4;
  if (![1, 2, 3, 4].includes(channels) || pixels.length !== width * height * channels) throw new RangeError("Texture pixels must match dimensions and channels.");
  const origin = checkedVec(options.origin ?? [0, 0, 0], "Texture origin");
  const size = typeof options.size === "number" ? [options.size, options.size] as const : options.size ?? [1, 1] as const;
  if (!Array.isArray(size) || size.length !== 2) throw new RangeError("Texture size must have two components.");
  const w = positive(size[0], "Texture width"), h = positive(size[1], "Texture height");
  const factor = pixels instanceof Float32Array ? 1 : 255;
  const read = (index: number): number => {
    const value = pixels[index]! / factor;
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Texture channel values must be within their declared range.");
    return value;
  };
  const lines: DebugRenderLine[] = [];
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    const i = (row * width + col) * channels;
    const r = read(i), g = channels <= 2 ? r : read(i + 1), b = channels <= 2 ? r : read(i + 2);
    const alpha = channels === 2 ? read(i + 1) : channels === 4 ? read(i + 3) : 1;
    const y = origin[1] + h / 2 - h * (row + 0.5) / height;
    lines.push(line([origin[0] - w / 2 + w * col / width, y, origin[2]], [origin[0] - w / 2 + w * (col + 1) / width, y, origin[2]], [r, g, b, alpha]));
  }
  return lines;
}

export function buildVertexNormalHelper(options: VertexNormalHelperOptions): readonly DebugRenderLine[] {
  return vectors(options.positions, options.normals, options.length, options.color, "Vertex normal", options.transform, true);
}
export function buildTangentHelper(options: TangentHelperOptions): readonly DebugRenderLine[] {
  return vectors(options.positions, options.tangents, options.length, options.color, "Tangent", options.transform, false);
}

function vectors(positions: readonly DebugVec3[], values: readonly (readonly number[])[], rawLength: number | undefined, rawColor: DebugColor | undefined, label: string, transform: DebugHelperMatrix | undefined, normal: boolean): readonly DebugRenderLine[] {
  if (positions.length !== values.length) throw new RangeError(`${label} positions and vectors must have equal counts.`);
  bounded(positions.length, MAX_LINES, `${label} count`);
  const length = positive(rawLength ?? 0.2, `${label} length`), color = checkedColor(rawColor);
  let directionMatrix: readonly number[] | undefined;
  if (transform !== undefined) {
    if (transform.length !== 16 || Array.from(transform).some((n) => !Number.isFinite(n)) || transform[3] !== 0 || transform[7] !== 0 || transform[11] !== 0 || transform[15] !== 1) throw new RangeError(`${label} transform must be a finite column-major affine matrix.`);
    const [a, b, c, d, e, f, g, h, i] = [transform[0]!, transform[4]!, transform[8]!, transform[1]!, transform[5]!, transform[9]!, transform[2]!, transform[6]!, transform[10]!];
    if (normal) {
      const cofactor = [e*i-f*h, f*g-d*i, d*h-e*g, c*h-b*i, a*i-c*g, b*g-a*h, b*f-c*e, c*d-a*f, a*e-b*d];
      const det = a * cofactor[0]! + b * cofactor[1]! + c * cofactor[2]!;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new RangeError(`${label} transform must be invertible.`);
      directionMatrix = cofactor.map((v) => v / det);
    } else directionMatrix = [a, b, c, d, e, f, g, h, i];
  }
  const lines: DebugRenderLine[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const local = checkedVec(positions[i]!, `${label} position ${i}`), v = values[i]!;
    if ((v.length !== 3 && v.length !== 4) || v.some((n) => !Number.isFinite(n))) throw new RangeError(`${label} vector ${i} must contain three or four finite values.`);
    const p: DebugVec3 = transform ? [transform[0]! * local[0] + transform[4]! * local[1] + transform[8]! * local[2] + transform[12]!, transform[1]! * local[0] + transform[5]! * local[1] + transform[9]! * local[2] + transform[13]!, transform[2]! * local[0] + transform[6]! * local[1] + transform[10]! * local[2] + transform[14]!] : local;
    const direction: DebugVec3 = directionMatrix ? [directionMatrix[0]! * v[0]! + directionMatrix[1]! * v[1]! + directionMatrix[2]! * v[2]!, directionMatrix[3]! * v[0]! + directionMatrix[4]! * v[1]! + directionMatrix[5]! * v[2]!, directionMatrix[6]! * v[0]! + directionMatrix[7]! * v[1]! + directionMatrix[8]! * v[2]!] : [v[0]!, v[1]!, v[2]!];
    const magnitude = Math.hypot(...direction);
    if (magnitude > 1e-12) lines.push(line(p, add(p, mul(direction, length / magnitude)), color));
  }
  return lines;
}

function sphere(center: DebugVec3, radius: number, count: number, color: DebugColor): DebugRenderLine[] {
  const lines: DebugRenderLine[] = [];
  const p = (axis: number, a: number): DebugVec3 => axis === 0
    ? [center[0], center[1] + radius * Math.cos(a), center[2] + radius * Math.sin(a)]
    : axis === 1 ? [center[0] + radius * Math.cos(a), center[1], center[2] + radius * Math.sin(a)]
      : [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a), center[2]];
  for (let axis = 0; axis < 3; axis += 1) for (let i = 0; i < count; i += 1) lines.push(line(p(axis, i * Math.PI * 2 / count), p(axis, (i + 1) * Math.PI * 2 / count), color));
  return lines;
}
function arrow(origin: DebugVec3, direction: DebugVec3, side: DebugVec3, length: number, color: DebugColor): DebugRenderLine[] {
  const tip = add(origin, mul(direction, length)), base = add(origin, mul(direction, length * 0.75));
  return [line(origin, tip, color), line(tip, add(base, mul(side, length * 0.1)), color), line(tip, add(base, mul(side, -length * 0.1)), color)];
}
function line(from: DebugVec3, to: DebugVec3, color: DebugColor): DebugRenderLine { return { from, to, color }; }
function add(a: DebugVec3, b: DebugVec3): DebugVec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a: DebugVec3, n: number): DebugVec3 { return [a[0] * n, a[1] * n, a[2] * n]; }
function cross(a: DebugVec3, b: DebugVec3): DebugVec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function checkedVec(value: DebugVec3, label: string): DebugVec3 {
  if (!value || value.length !== 3 || Array.from(value).some((n) => !Number.isFinite(n))) throw new RangeError(`${label} must contain three finite values.`);
  return [value[0], value[1], value[2]];
}
function unit(value: DebugVec3, label: string): DebugVec3 {
  const v = checkedVec(value, label), length = Math.hypot(...v);
  if (length < 1e-12) throw new RangeError(`${label} must be non-zero.`);
  return mul(v, 1 / length);
}
function checkedColor(color: DebugColor = DEFAULT_COLOR): DebugColor {
  if (color.length !== 4 || color.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw new RangeError("Helper color must have four values in [0, 1].");
  return [...color] as [number, number, number, number];
}
function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}
function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
  return value;
}
function segmentCount(value = 24): number {
  if (!Number.isInteger(value) || value < 3 || value > 256) throw new RangeError("Helper segments must be an integer from 3 to 256.");
  return value;
}
function bounded(value: number, max: number, label: string): void {
  if (value > max) throw new RangeError(`${label} exceeds ${max}.`);
}
function limit(value: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RangeError(`${label} must be an integer from 1 to ${max}.`);
  return value;
}

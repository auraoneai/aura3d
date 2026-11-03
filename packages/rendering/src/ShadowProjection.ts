import { type Bounds3 } from "./Geometry";

export type Vec3Tuple = readonly [number, number, number];

export interface ShadowProjectionOptions {
  readonly casterBounds: Bounds3;
  readonly lightDirection: Vec3Tuple;
  readonly receiverPlaneY?: number;
}

export interface ShadowProjection {
  readonly points: readonly Vec3Tuple[];
  readonly bounds: Bounds3;
}

/** Static, local-space triangle data for a bounded planar shadow projection. */
export interface ShadowTriangleProjectionOptions {
  /** Packed XYZ positions. Components are snapshotted as float32 before transformation. */
  readonly positions: ArrayLike<number>;
  /** Optional triangle-list indices; without them every three positions form a triangle. */
  readonly indices?: ArrayLike<number>;
  /** Optional column-major affine local-to-world matrix; perspective matrices are rejected. */
  readonly matrix?: ArrayLike<number>;
  /** Direction of light travel, toward the horizontal receiver. */
  readonly lightDirection: Vec3Tuple;
  readonly receiverPlaneY?: number;
  readonly maxProjectionDistance?: number;
  /** At most 1,024 input triangles, default 512. */
  readonly maxTriangles?: number;
  /** At most 500,000 projected triangle-pair checks, default 130,816. */
  readonly maxOverlapChecks?: number;
}

export interface ShadowTriangleProjection extends ShadowProjection {
  /** Triangle-list indices into points, with every nondegenerate face toward +Y. */
  readonly indices: readonly number[];
}

const epsilon = 1e-6;

export class ShadowProjectionBuilder {
  projectBounds(options: ShadowProjectionOptions): ShadowProjection {
    const receiverPlaneY = options.receiverPlaneY ?? 0;
    const direction = normalize(options.lightDirection);
    if (Math.abs(direction[1]) < epsilon) {
      throw new Error("Shadow projection requires a light direction that intersects the receiver plane.");
    }

    const projected = corners(options.casterBounds)
      .map((point) => projectPointToPlane(point, direction, receiverPlaneY))
      .filter((point) => isFiniteVec3(point));
    if (projected.length === 0) {
      throw new Error("Shadow projection produced no finite points.");
    }

    const hull2d = convexHull(projected.map((point) => [point[0], point[2]] as const));
    const points = hull2d.map(([x, z]) => [x, receiverPlaneY, z] as const);
    return {
      points,
      bounds: boundsFromPoints(points)
    };
  }

  /**
   * Project static triangles onto a horizontal plane without filling their
   * convex hull. The result preserves disconnected pieces, concavities and
   * holes. Triangles with overlapping projected interiors are rejected: a
   * translucent direct draw would otherwise accumulate opacity more than once.
   * Shared edges and points are permitted. Nonzero faces that collapse, flip,
   * or differ by more than 1% in edge length or area after float32 conversion
   * are rejected. Source-degenerate faces fail; faces whose projection has
   * exactly zero area are omitted.
   */
  projectTriangles(options: ShadowTriangleProjectionOptions): ShadowTriangleProjection {
    return projectTriangles(options);
  }
}

const MAX_TRIANGLE_PROJECTION_VERTICES = 65_536;
const MAX_TRIANGLE_PROJECTION_TRIANGLES = 1_024;
const MAX_TRIANGLE_PROJECTION_OVERLAP_CHECKS = 500_000;
const floatBits = new DataView(new ArrayBuffer(8));

type ExactPoint = { readonly x: bigint; readonly z: bigint };
interface ProjectedTriangle {
  readonly points: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple];
  /** Positive orientation in x/z, independent of the output's +Y winding. */
  readonly exact: readonly [ExactPoint, ExactPoint, ExactPoint];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function checkedPositiveInteger(value: number, maximum: number, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > maximum) {
    throw new RangeError(`${name} must be ${allowZero ? "between 0 and" : "between 1 and"} ${maximum}.`);
  }
  return value;
}

function float32(value: number, name: string): number {
  const result = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(result)) throw new RangeError(`${name} must fit in finite float32.`);
  return result;
}

function snapshotAffineMatrix(input: ArrayLike<number> | undefined): readonly number[] {
  if (input === undefined) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (!input || input.length !== 16) throw new RangeError("matrix must contain 16 column-major values.");
  const matrix = Array.from({ length: 16 }, (_, index) => float32(input[index]!, `matrix[${index}]`));
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
    throw new RangeError("matrix must be affine; perspective transforms are unsupported.");
  }
  return matrix;
}

function transformPoint(matrix: readonly number[], position: Vec3Tuple): Vec3Tuple {
  const [x, y, z] = position;
  return [matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!];
}

/** Exact float32 value in integer units of 2^-149. */
function float32Integer(value: number): bigint {
  floatBits.setFloat32(0, value, false);
  const bits = floatBits.getUint32(0, false);
  const exponent = (bits >>> 23) & 0xff;
  const fraction = bits & 0x7fffff;
  const mantissa = BigInt(exponent === 0 ? fraction : fraction | 0x800000);
  const integer = exponent === 0 ? mantissa : mantissa << BigInt(exponent - 1);
  return (bits >>> 31) === 0 ? integer : -integer;
}

function exactPoint(point: Vec3Tuple): ExactPoint {
  return { x: float32Integer(point[0]), z: float32Integer(point[2]) };
}

function exactCross(a: ExactPoint, b: ExactPoint, c: ExactPoint): bigint {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** Exact finite float64 represented by a signed mantissa and a power of two. */
function float64Parts(value: number): { readonly mantissa: bigint; readonly exponent: number } {
  floatBits.setFloat64(0, value, false);
  const high = floatBits.getUint32(0, false), low = floatBits.getUint32(4, false);
  const exponent = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  const mantissa = exponent === 0 ? fraction : (1n << 52n) | fraction;
  return { mantissa: (high >>> 31) === 0 ? mantissa : -mantissa, exponent: exponent === 0 ? -1074 : exponent - 1075 };
}

/** Exact orientation of finite projected double values, used to distinguish a line from a collapsed face. */
function exactDoubleOrientation(points: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple]): bigint {
  const parts = points.flatMap((point) => [float64Parts(point[0]), float64Parts(point[2])]);
  const nonzero = parts.filter((part) => part.mantissa !== 0n);
  if (nonzero.length === 0) return 0n;
  const exponent = Math.min(...nonzero.map((part) => part.exponent));
  const values = parts.map((part) => part.mantissa === 0n ? 0n : part.mantissa << BigInt(part.exponent - exponent));
  const a = { x: values[0]!, z: values[1]! }, b = { x: values[2]!, z: values[3]! }, c = { x: values[4]!, z: values[5]! };
  return exactCross(a, b, c);
}

function projectedArea(points: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple]): number {
  return (points[1][0] - points[0][0]) * (points[2][2] - points[0][2])
    - (points[1][2] - points[0][2]) * (points[2][0] - points[0][0]);
}

function validateProjectionPrecision(raw: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple], quantized: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple]): boolean {
  const rawSign = exactDoubleOrientation(raw);
  if (rawSign === 0n) return false;
  const exact = quantized.map(exactPoint) as unknown as [ExactPoint, ExactPoint, ExactPoint];
  const quantizedSign = exactCross(exact[0], exact[1], exact[2]);
  if (quantizedSign === 0n || (rawSign > 0n) !== (quantizedSign > 0n)) throw new RangeError("Shadow projection collapses or flips at float32 precision.");
  const areaBefore = projectedArea(raw), areaAfter = projectedArea(quantized);
  if (!Number.isFinite(areaBefore) || !Number.isFinite(areaAfter) || areaBefore === 0
    || Math.sign(areaBefore) !== Math.sign(areaAfter) || Math.abs(areaAfter / areaBefore - 1) > 0.01) {
    throw new RangeError("Shadow projection area is not preserved at float32 precision.");
  }
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const before = Math.hypot(raw[j]![0] - raw[i]![0], raw[j]![2] - raw[i]![2]);
    const after = Math.hypot(quantized[j]![0] - quantized[i]![0], quantized[j]![2] - quantized[i]![2]);
    if (!(before > 0) || !Number.isFinite(before) || !Number.isFinite(after) || Math.abs(after / before - 1) > 0.01) {
      throw new RangeError("Shadow projection edges are not preserved at float32 precision.");
    }
  }
  return true;
}

/** A separating edge proves the other triangle cannot share positive area. */
function separatedByEdge(a: ProjectedTriangle, b: ProjectedTriangle): boolean {
  for (let edge = 0; edge < 3; edge += 1) {
    const start = a.exact[edge]!, end = a.exact[(edge + 1) % 3]!;
    if (b.exact.every((point) => exactCross(start, end, point) <= 0n)) return true;
  }
  return false;
}

function trianglesOverlap(a: ProjectedTriangle, b: ProjectedTriangle): boolean {
  if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ) return false;
  return !separatedByEdge(a, b) && !separatedByEdge(b, a);
}

function projectTriangles(options: ShadowTriangleProjectionOptions): ShadowTriangleProjection {
  if (!options || typeof options !== "object") throw new TypeError("Shadow triangle projection options are required.");
  const maxTriangles = checkedPositiveInteger(options.maxTriangles ?? 512, MAX_TRIANGLE_PROJECTION_TRIANGLES, "maxTriangles");
  const maxOverlapChecks = checkedPositiveInteger(options.maxOverlapChecks ?? 130_816, MAX_TRIANGLE_PROJECTION_OVERLAP_CHECKS, "maxOverlapChecks", true);
  const positions = options.positions;
  if (!positions || !Number.isSafeInteger(positions.length) || positions.length < 9 || positions.length % 3 !== 0
    || positions.length / 3 > MAX_TRIANGLE_PROJECTION_VERTICES) {
    throw new RangeError("positions must contain a bounded, nonempty packed XYZ vertex array.");
  }
  const vertexCount = positions.length / 3;
  const indexInput = options.indices;
  const indexCount = indexInput === undefined ? vertexCount : indexInput?.length;
  if (!Number.isSafeInteger(indexCount) || indexCount! < 3 || indexCount! % 3 !== 0 || indexCount! / 3 > maxTriangles) {
    throw new RangeError("Triangle indices must form a nonempty bounded triangle list.");
  }
  const matrix = snapshotAffineMatrix(options.matrix);
  const receiver = float32(options.receiverPlaneY ?? 0, "receiverPlaneY");
  const maxDistance = options.maxProjectionDistance ?? 10_000;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) throw new RangeError("maxProjectionDistance must be positive and finite.");
  const directionInput = options.lightDirection;
  if (!directionInput || directionInput.length !== 3 || !directionInput.every(Number.isFinite)) throw new RangeError("lightDirection must be a finite vec3.");
  const length = Math.hypot(...directionInput);
  if (!Number.isFinite(length) || length <= 1e-12 || directionInput[1] >= 0 || -directionInput[1] / length < 1e-6) {
    throw new RangeError("lightDirection must point down and intersect the receiver plane.");
  }
  const direction: Vec3Tuple = [directionInput[0] / length, directionInput[1] / length, directionInput[2] / length];
  const source = new Array<Vec3Tuple>(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) source[i] = [float32(positions[i * 3]!, `positions[${i * 3}]`),
    float32(positions[i * 3 + 1]!, `positions[${i * 3 + 1}]`), float32(positions[i * 3 + 2]!, `positions[${i * 3 + 2}]`)];
  const index = new Array<number>(indexCount);
  for (let i = 0; i < index.length; i += 1) {
    const value = indexInput === undefined ? i : indexInput[i]!;
    if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) throw new RangeError(`Triangle index ${i} is outside the vertex array.`);
    index[i] = value;
  }
  const world = new Map<number, Vec3Tuple>(), projected = new Map<number, { readonly raw: Vec3Tuple; readonly quantized: Vec3Tuple }>();
  const project = (vertex: number): { readonly raw: Vec3Tuple; readonly quantized: Vec3Tuple } => {
    const cached = projected.get(vertex);
    if (cached) return cached;
    const point = transformPoint(matrix, source[vertex]!);
    if (!isFiniteVec3(point) || point[1] < receiver) throw new RangeError("Caster vertices must be finite and on or above the receiver plane.");
    const distance = (receiver - point[1]) / direction[1];
    if (!Number.isFinite(distance) || distance < 0 || distance > maxDistance) throw new RangeError("Shadow projection exceeds maxProjectionDistance.");
    const raw: Vec3Tuple = [point[0] + direction[0] * distance, receiver, point[2] + direction[2] * distance];
    const quantized: Vec3Tuple = [float32(raw[0], "projected x"), receiver, float32(raw[2], "projected z")];
    world.set(vertex, point);
    const result = { raw, quantized };
    projected.set(vertex, result);
    return result;
  };
  const triangles: ProjectedTriangle[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const ids = [index[i]!, index[i + 1]!, index[i + 2]!] as const;
    const values = ids.map(project) as [{ readonly raw: Vec3Tuple; readonly quantized: Vec3Tuple }, { readonly raw: Vec3Tuple; readonly quantized: Vec3Tuple }, { readonly raw: Vec3Tuple; readonly quantized: Vec3Tuple }];
    const [a, b, c] = ids.map((id) => world.get(id)!) as [Vec3Tuple, Vec3Tuple, Vec3Tuple];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area3 = Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!);
    if (!(area3 > 0) || !Number.isFinite(area3)) throw new RangeError("Caster triangles must have nonzero finite area.");
    const raw = values.map((value) => value.raw) as [Vec3Tuple, Vec3Tuple, Vec3Tuple];
    const points = values.map((value) => value.quantized) as [Vec3Tuple, Vec3Tuple, Vec3Tuple];
    if (!validateProjectionPrecision(raw, points)) continue;
    const exact = points.map(exactPoint) as [ExactPoint, ExactPoint, ExactPoint];
    // SAT uses counterclockwise x/z; output later reverses this for +Y.
    if (exactCross(exact[0], exact[1], exact[2]) < 0n) { [exact[1], exact[2]] = [exact[2], exact[1]]; [points[1], points[2]] = [points[2], points[1]]; }
    const xs = points.map((point) => point[0]), zs = points.map((point) => point[2]);
    triangles.push({ points, exact, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  if (triangles.length === 0) throw new RangeError("Shadow projection has no nondegenerate projected triangles.");
  const pairCount = triangles.length * (triangles.length - 1) / 2;
  if (pairCount > maxOverlapChecks) throw new RangeError("Shadow projection exceeds maxOverlapChecks.");
  for (let i = 0; i < triangles.length; i += 1) for (let j = i + 1; j < triangles.length; j += 1) {
    if (trianglesOverlap(triangles[i]!, triangles[j]!)) throw new RangeError("Projected triangle interiors overlap; translucent projection would double-darken.");
  }
  const points: Vec3Tuple[] = [], indices: number[] = [];
  for (const triangle of triangles) {
    const base = points.length;
    points.push(...triangle.points);
    indices.push(base, base + 2, base + 1);
  }
  return { points, indices, bounds: boundsFromPoints(points) };
}

function projectPointToPlane(point: Vec3Tuple, direction: Vec3Tuple, receiverPlaneY: number): Vec3Tuple {
  const t = (receiverPlaneY - point[1]) / direction[1];
  return [point[0] + direction[0] * t, receiverPlaneY, point[2] + direction[2] * t];
}

function corners(bounds: Bounds3): readonly Vec3Tuple[] {
  const min = bounds.min;
  const max = bounds.max;
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]]
  ];
}

function boundsFromPoints(points: readonly Vec3Tuple[]): Bounds3 {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    min[0] = Math.min(min[0], point[0]);
    min[1] = Math.min(min[1], point[1]);
    min[2] = Math.min(min[2], point[2]);
    max[0] = Math.max(max[0], point[0]);
    max[1] = Math.max(max[1], point[1]);
    max[2] = Math.max(max[2], point[2]);
  }
  return { min, max };
}

function convexHull(points: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] {
  const sorted = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point] as const)).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  if (sorted.length <= 1) {
    return sorted;
  }
  const lower: (readonly [number, number])[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: (readonly [number, number])[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function cross(origin: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

function normalize(value: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= epsilon) {
    throw new Error("Shadow projection light direction cannot be zero.");
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function isFiniteVec3(value: Vec3Tuple): boolean {
  return Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);
}

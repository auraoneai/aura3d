import type { AuraCustomGeometrySpec, AuraVec2Attribute } from "../RootGeometry.js";
import { assertGeometryMorphChannels } from "./MorphChannels.js";

/** The only two UV channels supported by the runtime geometry pipeline. */
export type UVAtlasDestination = "uvs" | "uv1s";
export type UVAtlasGeometry = AuraCustomGeometrySpec & { readonly uv1s?: AuraVec2Attribute };

export interface UVAtlasOptions {
  /** The caller must choose a channel; an existing channel is never replaced implicitly. */
  readonly destination: UVAtlasDestination;
  readonly width?: number;
  readonly height?: number;
  /** Requested pixels per world unit in the local coordinates of the geometry. */
  readonly texelDensity?: number;
  /** Empty pixels around each chart, including the atlas perimeter. */
  readonly gutter?: number;
  /** Edges expressed as pairs of original vertex indices that must separate charts. */
  readonly seams?: readonly (readonly [number, number])[];
  readonly overwrite?: boolean;
  readonly maxTriangles?: number;
  readonly maxCharts?: number;
  readonly maxVertices?: number;
  readonly maxChartTriangles?: number;
  /** Maximum out-of-plane displacement, in local geometry units. */
  readonly planeTolerance?: number;
  /**
   * Opt in to charts projected from gently curved triangles. Every face is
   * compared to its chart's seed normal; the angle must be finite and in
   * [0, acos(0.95)]. `planeTolerance` still applies to every admitted vertex.
   *
   * Before float32 quantization, projected edge lengths and areas are between
   * cos(angle) and 1 times their local-space values. The bounded mode rejects
   * results when float32 precision could add more than 1% error to an edge or
   * triangle area. Omit this option to retain the existing planar charting.
   */
  readonly maxNormalDeviationRadians?: number;
  /**
   * Opt in to intrinsic triangle unfolding across manifold edges whose
   * adjacent face normals differ by at most this angle, in [0, PI/2]. Each
   * admitted triangle retains its edge lengths and area up to the bounded
   * float32 precision checks. Non-developable loops, overlaps, folds, and
   * forced cuts are split into separate charts. This mode is independent of
   * the seed-plane projection mode and cannot be combined with
   * `maxNormalDeviationRadians` or an explicit `planeTolerance`.
   */
  readonly unfoldMaxDihedralRadians?: number;
  /**
   * Maximum candidate/final triangle-pair checks in bounded projection mode.
   * Defaults to 2,000,000; values must be integers from 0 through 4,000,000.
   * It requires `maxNormalDeviationRadians` or `unfoldMaxDihedralRadians` and
   * bounds total work across charts.
   */
  readonly maxOverlapChecks?: number;
  readonly signal?: AbortSignal;
  /** Invoked as faces are processed; it may abort the supplied signal. */
  readonly onProgress?: (completedTriangles: number, totalTriangles: number) => void;
}

export interface UVAtlasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UVAtlasChart {
  readonly id: number;
  /** Original triangle numbers, in source index order. */
  readonly triangles: readonly number[];
  /** Allocated pixels, including gutter. Rectangles never overlap. */
  readonly pixelBounds: UVAtlasRect;
  /** Integer pixel bounds reserved for the chart, surrounded by `gutter` pixels. */
  readonly contentBounds: UVAtlasRect;
  readonly rotated: boolean;
}

export interface UVAtlasSeam {
  readonly vertices: readonly [number, number];
  readonly triangles: readonly number[];
  readonly reason: "boundary" | "explicit" | "chart" | "nonmanifold";
}

export interface UVAtlasResult {
  readonly geometry: UVAtlasGeometry;
  readonly width: number;
  readonly height: number;
  readonly gutter: number;
  readonly texelDensity: number;
  readonly destination: UVAtlasDestination;
  readonly charts: readonly UVAtlasChart[];
  readonly seams: readonly UVAtlasSeam[];
  /** For each output vertex, the corresponding original vertex. */
  readonly vertexRemap: Uint32Array;
  /** For each original triangle corner/index offset, its new vertex index. */
  readonly indexRemap: Uint32Array;
}

export class UVAtlasError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "CAPACITY" | "CANCELLED", message: string) {
    super(message);
    this.name = "UVAtlasError";
  }
}

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Face = { readonly vertices: readonly [number, number, number]; readonly points: readonly [Vec3, Vec3, Vec3]; readonly normal: Vec3 };
type Edge = { readonly a: number; readonly b: number; readonly faces: number[] };
type Chart = {
  readonly id: number;
  readonly origin: Vec3;
  readonly axisX: Vec3;
  readonly axisY: Vec3;
  readonly normal: Vec3;
  readonly faces: number[];
  readonly projected: Vec2[][];
  /** Present only for intrinsic unfolding; positions are chart-local. */
  readonly coordinates?: Map<number, Vec2>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  placement?: { x: number; y: number; width: number; height: number; rotated: boolean };
};

const MAX_NORMAL_DEVIATION_RADIANS = Math.acos(0.95);
const DEFAULT_BOUNDED_OVERLAP_CHECKS = 2_000_000;
const MAX_BOUNDED_OVERLAP_CHECKS = 4_000_000;
const MAX_QUANTIZATION_RELATIVE_ERROR = 0.01;

/**
 * Independently authored planar charting and bounded rectangle packing.
 * Adjacent, consistently oriented triangles share a chart only when they are
 * coplanar and their projected interiors do not overlap. Callers may opt in to
 * bounded projection of gently curved faces or intrinsic unfolding over
 * manifold edges; folds, explicit cuts and non-manifold edges remain seams.
 * Both opt-in modes validate distortion and non-overlap after conversion to
 * the actual float32 UVs. Unfolding splits incompatible curved loops and is
 * not a general surface parameterization algorithm.
 *
 * Triangle order is unchanged, so groups and draw ranges remain valid. Seam
 * vertices are duplicated; source attributes and morphs are copied, never
 * modified in place. The result owns its arrays and does not own GPU resources.
 */
export function buildUVAtlas(input: UVAtlasGeometry, options: UVAtlasOptions): UVAtlasResult {
  if (!input || typeof input !== "object") invalid("geometry is required");
  const width = integerOption(options?.width ?? 1024, "width", 1, 16384);
  const height = integerOption(options?.height ?? 1024, "height", 1, 16384);
  const gutter = integerOption(options?.gutter ?? 2, "gutter", 0, 8192);
  const maxTriangles = integerOption(options?.maxTriangles ?? 16384, "maxTriangles", 1, 65536);
  const maxCharts = integerOption(options?.maxCharts ?? 4096, "maxCharts", 1, 8192);
  const maxVertices = integerOption(options?.maxVertices ?? 196608, "maxVertices", 3, 196608);
  const maxChartTriangles = integerOption(options?.maxChartTriangles ?? 256, "maxChartTriangles", 1, 1024);
  const density = options?.texelDensity ?? 32;
  const planeTolerance = options?.planeTolerance ?? 1e-6;
  const normalDeviation = options?.maxNormalDeviationRadians;
  const unfoldAngle = options?.unfoldMaxDihedralRadians;
  if (!Number.isFinite(density) || density <= 0) invalid("texelDensity must be finite and positive");
  if (!Number.isFinite(planeTolerance) || planeTolerance < 0) invalid("planeTolerance must be finite and non-negative");
  if (normalDeviation !== undefined && (typeof normalDeviation !== "number" || !Number.isFinite(normalDeviation) || normalDeviation < 0 || normalDeviation > MAX_NORMAL_DEVIATION_RADIANS)) {
    invalid("maxNormalDeviationRadians must be between 0 and acos(0.95)");
  }
  if (unfoldAngle !== undefined && (typeof unfoldAngle !== "number" || !Number.isFinite(unfoldAngle) || unfoldAngle < 0 || unfoldAngle > Math.PI / 2)) {
    invalid("unfoldMaxDihedralRadians must be between 0 and PI/2");
  }
  if (unfoldAngle !== undefined && (normalDeviation !== undefined || options?.planeTolerance !== undefined)) {
    invalid("unfoldMaxDihedralRadians cannot be combined with maxNormalDeviationRadians or planeTolerance");
  }
  const bounded = normalDeviation !== undefined || unfoldAngle !== undefined;
  if (!bounded && options?.maxOverlapChecks !== undefined) invalid("maxOverlapChecks requires maxNormalDeviationRadians or unfoldMaxDihedralRadians");
  const minNormalDot = normalDeviation === undefined ? 1 - 1e-8 : Math.cos(normalDeviation);
  const overlapLimit = !bounded ? undefined
    : integerOption(options?.maxOverlapChecks ?? DEFAULT_BOUNDED_OVERLAP_CHECKS, "maxOverlapChecks", 0, MAX_BOUNDED_OVERLAP_CHECKS);
  let overlapChecks = 0;
  const consumeOverlapCheck = (): void => {
    if (overlapLimit === undefined) return;
    if (overlapChecks >= overlapLimit) capacity(`bounded chart overlap checks exceed ${overlapLimit}`);
    if ((overlapChecks & 255) === 0) checkCancelled(options);
    overlapChecks += 1;
  };
  if (options?.destination !== "uvs" && options?.destination !== "uv1s") invalid("choose destination 'uvs' or 'uv1s'");
  if (input.topology !== undefined && input.topology !== "triangles") invalid("only triangle geometry is supported");
  const destination = options.destination;
  if (input[destination] !== undefined && options.overwrite !== true) invalid(`destination ${destination} already contains authored UVs; set overwrite to replace it`);
  checkCancelled(options);
  const positions = flattenPositions(input.positions);
  const vertexCount = positions.length / 3;
  assertGeometryMorphChannels(input.morphTargets, vertexCount, (_code, _field, message) => invalid(message));
  if (vertexCount < 3) invalid("at least three positions are required");
  if (!input.indices || typeof input.indices.length !== "number") invalid("indices are required (use an empty list for non-indexed geometry)");
  const indexCount = input.indices.length || vertexCount;
  if (indexCount === 0 || indexCount % 3 !== 0) invalid("indices must contain complete triangles");
  const triangleCount = indexCount / 3;
  if (triangleCount > maxTriangles) capacity(`triangle count ${triangleCount} exceeds ${maxTriangles}`);
  const sourceIndices = input.indices.length ? Array.from(input.indices) : Array.from({ length: vertexCount }, (_, i) => i);
  validateRanges(input, sourceIndices.length);
  const faces: Face[] = [];
  const edges = new Map<string, Edge>();
  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex += 1) {
    if ((faceIndex & 63) === 0) checkCancelled(options);
    const tri = sourceIndices.slice(faceIndex * 3, faceIndex * 3 + 3) as [number, number, number];
    for (const index of tri) {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) invalid(`index ${index} is outside the position buffer`);
    }
    const points = tri.map((index) => getPosition(positions, index)) as [Vec3, Vec3, Vec3];
    const e0 = subtract(points[1], points[0]);
    const e1 = subtract(points[2], points[0]);
    const crossProduct = cross(e0, e1);
    const length = magnitude(crossProduct);
    const scale = Math.max(magnitude(e0), magnitude(e1), magnitude(subtract(points[2], points[1])));
    if (!Number.isFinite(length) || scale === 0 || length <= scale * scale * 1e-12) invalid(`triangle ${faceIndex} is degenerate`);
    const normal = multiply(crossProduct, 1 / length);
    if (bounded && !normal.every(Number.isFinite)) capacity(`triangle ${faceIndex} exceeds bounded chart precision`);
    faces.push({ vertices: tri, points, normal });
    for (let corner = 0; corner < 3; corner += 1) {
      const a = Math.min(tri[corner]!, tri[(corner + 1) % 3]!);
      const b = Math.max(tri[corner]!, tri[(corner + 1) % 3]!);
      const key = edgeKey(a, b);
      const edge = edges.get(key) ?? { a, b, faces: [] };
      edge.faces.push(faceIndex);
      edges.set(key, edge);
    }
  }
  const explicitSeams = new Set<string>();
  if (options.seams && options.seams.length > edges.size) capacity("seam count exceeds the number of mesh edges");
  for (const seam of options.seams ?? []) {
    if (!seam || seam.length !== 2 || !Number.isInteger(seam[0]) || !Number.isInteger(seam[1]) || seam[0] < 0 || seam[1] < 0 || seam[0] >= vertexCount || seam[1] >= vertexCount || seam[0] === seam[1]) invalid("seams must contain distinct valid source vertex indices");
    const key = edgeKey(seam[0], seam[1]);
    if (!edges.has(key)) invalid(`seam ${key} is not an edge of the mesh`);
    explicitSeams.add(key);
  }
  const adjacency: number[][] = Array.from({ length: triangleCount }, () => []);
  for (const [key, edge] of edges) {
    if (edge.faces.length === 2 && !explicitSeams.has(key)) {
      adjacency[edge.faces[0]!]!.push(edge.faces[1]!);
      adjacency[edge.faces[1]!]!.push(edge.faces[0]!);
    }
  }
  const assigned = new Int32Array(triangleCount).fill(-1);
  const charts: Chart[] = [];
  let processed = 0;
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (assigned[seed] !== -1) continue;
    checkCancelled(options);
    if (charts.length >= maxCharts) capacity(`chart count exceeds ${maxCharts}`);
    const first = faces[seed]!;
    const axisX = normalize(subtract(first.points[1], first.points[0]));
    const axisY = cross(first.normal, axisX);
    const chart: Chart = { id: charts.length, origin: first.points[0], axisX, axisY, normal: first.normal, faces: [], projected: [], ...(unfoldAngle === undefined ? {} : { coordinates: new Map<number, Vec2>() }), minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    if (chart.coordinates) {
      first.vertices.forEach((vertex, corner) => chart.coordinates!.set(vertex, project(chart, first.points[corner]!)));
    }
    const queue = [seed];
    assigned[seed] = chart.id;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const faceIndex = queue[cursor]!;
      addToChart(chart, faceIndex, faces[faceIndex]!);
      processed += 1;
      options.onProgress?.(processed, triangleCount);
      checkCancelled(options);
      for (const candidate of adjacency[faceIndex]!) {
        if (assigned[candidate] !== -1 || queue.length >= maxChartTriangles) continue;
        const face = faces[candidate]!;
        // A seam must remain a cut even if another path connects the faces.
        const crossesForcedSeam = face.vertices.some((vertex, corner) => {
          const key = edgeKey(vertex, face.vertices[(corner + 1) % 3]!);
          const edge = edges.get(key)!;
          return (explicitSeams.has(key) || edge.faces.length > 2) && edge.faces.some((other) => assigned[other] === chart.id);
        });
        if (crossesForcedSeam) continue;
        let candidateCoordinate: { vertex: number; point: Vec2 } | undefined;
        let projected: Vec2[];
        if (unfoldAngle !== undefined) {
          // A sharp edge remains a cut even when the two faces can be reached
          // by another path through this chart.
          if (face.vertices.some((vertex, corner) => {
            const edge = edges.get(edgeKey(vertex, face.vertices[(corner + 1) % 3]!))!;
            return edge.faces.some((other) => other !== candidate && assigned[other] === chart.id && !withinUnfoldDihedral(face, faces[other]!, unfoldAngle));
          })) continue;
          const unfolded = unfoldFace(chart, faces[faceIndex]!, face);
          if (!unfolded) continue;
          projected = unfolded.points;
          candidateCoordinate = unfolded.coordinate;
        } else {
          if (dot(face.normal, chart.normal) < minNormalDot || face.points.some((point) => Math.abs(dot(subtract(point, chart.origin), chart.normal)) > planeTolerance)) continue;
          projected = face.points.map((point) => project(chart, point));
        }
        if (chart.projected.some((prior) => {
          consumeOverlapCheck();
          return triangleIntersectionArea(prior, projected) > 0;
        })) continue;
        // Check queued but not yet processed faces as well as established faces.
        if (queue.slice(cursor + 1).some((queued) => {
          consumeOverlapCheck();
          const pending = chartFacePoints(chart, faces[queued]!);
          return triangleIntersectionArea(pending, projected) > 0;
        })) continue;
        if (candidateCoordinate) chart.coordinates!.set(candidateCoordinate.vertex, candidateCoordinate.point);
        assigned[candidate] = chart.id;
        queue.push(candidate);
      }
    }
    charts.push(chart);
  }
  packCharts(charts, width, height, gutter, density, options);
  const seamResults: UVAtlasSeam[] = [];
  for (const [key, edge] of edges) {
    const reason = explicitSeams.has(key) ? "explicit" : edge.faces.length === 1 ? "boundary" : edge.faces.length !== 2 ? "nonmanifold" : assigned[edge.faces[0]!] !== assigned[edge.faces[1]!] ? "chart" : undefined;
    if (reason) seamResults.push({ vertices: [edge.a, edge.b], triangles: [...edge.faces], reason });
  }
  const outputToSource: number[] = [];
  const outputIndices: number[] = [];
  const generatedUVs: number[] = [];
  const mapped = new Map<string, number>();
  for (let offset = 0; offset < sourceIndices.length; offset += 1) {
    if ((offset & 255) === 0) checkCancelled(options);
    const source = sourceIndices[offset]!;
    const chart = charts[assigned[Math.floor(offset / 3)]!]!;
    const key = `${chart.id}:${source}`;
    let output = mapped.get(key);
    if (output === undefined) {
      if (outputToSource.length >= maxVertices) capacity(`output vertex count exceeds ${maxVertices}`);
      output = outputToSource.length;
      mapped.set(key, output);
      outputToSource.push(source);
      const point = chart.coordinates?.get(source) ?? project(chart, getPosition(positions, source));
      const px = (point[0] - chart.minX) * density;
      const py = (point[1] - chart.minY) * density;
      const placement = chart.placement!;
      const contentHeight = (chart.maxY - chart.minY) * density;
      const x = placement.x + gutter + (placement.rotated ? contentHeight - py : px);
      const y = placement.y + gutter + (placement.rotated ? px : py);
      generatedUVs.push(x / width, y / height);
    }
    outputIndices.push(output);
  }
  const remap = Uint32Array.from(outputToSource);
  const indexRemap = Uint32Array.from(outputIndices);
  const generated = Float32Array.from(generatedUVs);
  for (let offset = 0; offset < outputIndices.length; offset += 3) {
    const a = outputIndices[offset]! * 2;
    const b = outputIndices[offset + 1]! * 2;
    const c = outputIndices[offset + 2]! * 2;
    if (orient([generated[a]!, generated[a + 1]!], [generated[b]!, generated[b + 1]!], [generated[c]!, generated[c + 1]!]) <= 0) {
      capacity(`triangle ${offset / 3} cannot be represented at the requested UV precision`);
    }
  }
  if (bounded) {
    validateBoundedProjection(charts, faces, outputIndices, generated, width, height, gutter, density, unfoldAngle === undefined ? minNormalDot : 1, options, consumeOverlapCheck);
  }
  const geometry = remapGeometry(input, remap, outputIndices, destination, generated, vertexCount);
  const resultCharts: UVAtlasChart[] = charts.map((chart) => {
    const p = chart.placement!;
    return {
      id: chart.id,
      triangles: [...chart.faces].sort((a, b) => a - b),
      pixelBounds: { x: p.x, y: p.y, width: p.width, height: p.height },
      contentBounds: { x: p.x + gutter, y: p.y + gutter, width: p.width - 2 * gutter, height: p.height - 2 * gutter },
      rotated: p.rotated
    };
  });
  return { geometry, width, height, gutter, texelDensity: density, destination, charts: resultCharts, seams: seamResults, vertexRemap: remap, indexRemap };
}

function flattenPositions(value: AuraCustomGeometrySpec["positions"]): number[] {
  if (!value || typeof value.length !== "number") invalid("positions are required");
  if (value.length > 3_000_000) capacity("position input exceeds the vertex limit");
  const flattened: number[] = [];
  if (value.length > 0 && typeof value[0] !== "number") {
    if (value.length > 1_000_000) capacity("position input exceeds the vertex limit");
    for (const tuple of value as readonly (readonly number[])[]) {
      if (!tuple || tuple.length !== 3) invalid("positions must be vec3 values");
      flattened.push(tuple[0]!, tuple[1]!, tuple[2]!);
    }
  } else {
    for (const component of value as ArrayLike<number> & Iterable<number>) flattened.push(component);
  }
  if (flattened.length % 3 !== 0 || flattened.some((number) => !Number.isFinite(number))) invalid("positions must contain finite vec3 values");
  return flattened;
}

function validateRanges(input: UVAtlasGeometry, count: number): void {
  for (const range of input.groups ?? []) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.count) || range.start < 0 || range.count < 0 || range.start + range.count > count || (range.materialIndex !== undefined && (!Number.isInteger(range.materialIndex) || range.materialIndex < 0))) invalid("group is outside the index stream or has an invalid material index");
  }
  const draw = input.drawRange;
  if (draw && (!Number.isInteger(draw.start) || draw.start < 0 || !(draw.count === Infinity || (Number.isInteger(draw.count) && draw.count >= 0)))) {
    invalid("draw range must have a non-negative start and count");
  }
}

function withinUnfoldDihedral(face: Face, other: Face, maximum: number): boolean {
  const normalDot = dot(face.normal, other.normal);
  if (maximum === 0) {
    // A normalized dot product can be slightly below one for identical
    // normals, or round to one for a real but tiny fold. Determine zero-angle
    // coplanarity from the exact supplied float64 coordinates instead.
    return normalDot > 0 && exactlyCoplanar(face, other);
  }
  // atan2 preserves small positive angles that a rounded cosine can lose,
  // and includes exactly orthogonal normals at the documented PI/2 limit.
  return Math.atan2(magnitude(cross(face.normal, other.normal)), normalDot) <= maximum;
}

/** Compare four finite float64 positions in a common exact dyadic scale. */
function exactlyCoplanar(face: Face, other: Face): boolean {
  const opposite = other.points.find((_, index) => !face.vertices.includes(other.vertices[index]!)) ?? other.points[0];
  const values = [...face.points[0], ...face.points[1], ...face.points[2], ...opposite];
  const view = new DataView(new ArrayBuffer(8));
  const parts = values.map((value) => {
    view.setFloat64(0, value, false);
    const bits = view.getBigUint64(0, false);
    const exponent = Number((bits >> 52n) & 0x7ffn);
    const fraction = bits & 0x000fffffffffffffn;
    const magnitude = exponent === 0 ? fraction : fraction | 0x0010000000000000n;
    return { mantissa: (bits >> 63n) === 0n ? magnitude : -magnitude, power: exponent === 0 ? -1074 : exponent - 1075 };
  });
  let minimum = Infinity;
  for (const part of parts) if (part.mantissa !== 0n) minimum = Math.min(minimum, part.power);
  if (minimum === Infinity) return true;
  const coordinates = parts.map((part) => part.mantissa === 0n ? 0n : part.mantissa << BigInt(part.power - minimum));
  const u = [0, 1, 2].map((i) => coordinates[3 + i]! - coordinates[i]!);
  const v = [0, 1, 2].map((i) => coordinates[6 + i]! - coordinates[i]!);
  const w = [0, 1, 2].map((i) => coordinates[9 + i]! - coordinates[i]!);
  return u[0]! * (v[1]! * w[2]! - v[2]! * w[1]!)
    - u[1]! * (v[0]! * w[2]! - v[2]! * w[0]!)
    + u[2]! * (v[0]! * w[1]! - v[1]! * w[0]!) === 0n;
}

function chartFacePoints(chart: Chart, face: Face): Vec2[] {
  if (!chart.coordinates) return face.points.map((point) => project(chart, point));
  return face.vertices.map((vertex) => {
    const point = chart.coordinates!.get(vertex);
    if (!point) capacity("unfolded chart is missing a vertex coordinate");
    return point;
  });
}

/** Place a face isometrically across its already-mapped, oriented parent edge. */
function unfoldFace(chart: Chart, parent: Face, face: Face): { points: Vec2[]; coordinate?: { vertex: number; point: Vec2 } } | undefined {
  const coordinates = chart.coordinates!;
  let edge = -1;
  for (let corner = 0; corner < 3; corner += 1) {
    if (parent.vertices.includes(face.vertices[corner]!) && parent.vertices.includes(face.vertices[(corner + 1) % 3]!)) {
      edge = corner;
      break;
    }
  }
  if (edge < 0) return undefined;
  const next = (edge + 1) % 3, third = (edge + 2) % 3;
  const a = coordinates.get(face.vertices[edge]!);
  const b = coordinates.get(face.vertices[next]!);
  if (!a || !b) return undefined;
  const dx = b[0] - a[0], dy = b[1] - a[1], edgeLength = Math.hypot(dx, dy);
  const sourceEdge = subtract(face.points[next]!, face.points[edge]!);
  const sourceLength = magnitude(sourceEdge);
  if (!(edgeLength > 0) || !(sourceLength > 0) || !Number.isFinite(edgeLength) || !Number.isFinite(sourceLength)) return undefined;
  const sourceAxis = multiply(sourceEdge, 1 / sourceLength);
  const sourceThird = subtract(face.points[third]!, face.points[edge]!);
  const along = dot(sourceAxis, sourceThird);
  const height = magnitude(cross(sourceAxis, sourceThird));
  if (!Number.isFinite(along) || !Number.isFinite(height) || !(height > 0)) return undefined;
  const ux = dx / edgeLength, uy = dy / edgeLength;
  const proposed: Vec2 = [a[0] + along * ux - height * uy, a[1] + along * uy + height * ux];
  if (!proposed.every(Number.isFinite)) return undefined;
  const vertex = face.vertices[third]!;
  const existing = coordinates.get(vertex);
  if (existing) {
    // Closing a curved loop is allowed only if the existing UV is the same
    // isometric position to floating-point precision. Otherwise start a new
    // chart rather than hiding the loop's intrinsic distortion.
    const scale = Math.max(edgeLength, sourceLength, magnitude(sourceThird), Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]), Math.abs(existing[0]), Math.abs(existing[1]), Number.MIN_VALUE);
    if (Math.hypot(existing[0] - proposed[0], existing[1] - proposed[1]) > scale * Number.EPSILON * 256) return undefined;
  }
  const placed = existing ?? proposed;
  const points: Vec2[] = new Array(3);
  points[edge] = a; points[next] = b; points[third] = placed;
  if (!(orient(points[0]!, points[1]!, points[2]!) > 0)) return undefined;
  return { points, ...(existing ? {} : { coordinate: { vertex, point: placed } }) };
}

function addToChart(chart: Chart, index: number, face: Face): void {
  const projected = chartFacePoints(chart, face);
  chart.faces.push(index);
  chart.projected.push(projected);
  for (const point of projected) {
    chart.minX = Math.min(chart.minX, point[0]);
    chart.minY = Math.min(chart.minY, point[1]);
    chart.maxX = Math.max(chart.maxX, point[0]);
    chart.maxY = Math.max(chart.maxY, point[1]);
  }
}

type ExactUV = readonly [bigint, bigint];
type QuantizedChartFace = {
  readonly exact: readonly [ExactUV, ExactUV, ExactUV];
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

/**
 * Verify the actual float32 output, not just the initial double projection.
 * Rectangle packing separates different charts; the content-bound check keeps
 * that separation after rounding, while exact predicates check each chart.
 */
function validateBoundedProjection(
  charts: readonly Chart[], faces: readonly Face[], indices: readonly number[], generated: Float32Array,
  width: number, height: number, gutter: number, density: number, minNormalDot: number,
  options: UVAtlasOptions, consumeOverlapCheck: () => void
): void {
  const bitView = new DataView(new ArrayBuffer(4));
  const exactCache = new Map<number, ExactUV>();
  // Difference of two independently rounded float32 normalized coordinates,
  // expressed in pixel units; the maximum single-coordinate error is 2^-25.
  const coordinateError = Math.hypot(width, height) * 2 ** -24;
  const uvAt = (index: number): Vec2 => {
    const u = generated[index * 2]!, v = generated[index * 2 + 1]!;
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
      capacity("bounded chart UV coordinates exceed float32 atlas precision");
    }
    return [u, v];
  };
  const exactAt = (index: number, uv: Vec2): ExactUV => {
    const cached = exactCache.get(index);
    if (cached) return cached;
    const result: ExactUV = [float32DyadicUnits(uv[0], bitView), float32DyadicUnits(uv[1], bitView)];
    exactCache.set(index, result);
    return result;
  };

  for (const chart of charts) {
    checkCancelled(options);
    const placement = chart.placement!;
    const minU = Math.fround((placement.x + gutter) / width);
    const minV = Math.fround((placement.y + gutter) / height);
    const maxU = Math.fround((placement.x + placement.width - gutter) / width);
    const maxV = Math.fround((placement.y + placement.height - gutter) / height);
    const prior: QuantizedChartFace[] = [];
    for (const faceIndex of chart.faces) {
      const face = faces[faceIndex]!;
      const offset = faceIndex * 3;
      const ids: [number, number, number] = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!];
      const uv: [Vec2, Vec2, Vec2] = [uvAt(ids[0]), uvAt(ids[1]), uvAt(ids[2])];
      if (uv.some(([u, v]) => u < minU || u > maxU || v < minV || v > maxV)) {
        capacity(`triangle ${faceIndex} exceeds bounded chart gutter precision`);
      }
      const exact: [ExactUV, ExactUV, ExactUV] = [exactAt(ids[0], uv[0]), exactAt(ids[1], uv[1]), exactAt(ids[2], uv[2])];
      if (exactOrient(exact[0], exact[1], exact[2]) <= 0n) {
        capacity(`triangle ${faceIndex} cannot preserve bounded chart winding at float32 precision`);
      }

      const pixelLengths: number[] = [];
      for (let edge = 0; edge < 3; edge += 1) {
        const next = (edge + 1) % 3;
        const expected = magnitude(subtract(face.points[next]!, face.points[edge]!)) * density;
        const actual = Math.hypot((uv[next]![0] - uv[edge]![0]) * width, (uv[next]![1] - uv[edge]![1]) * height);
        const allowance = coordinateError + Number.EPSILON * 128 * Math.max(1, expected, actual);
        if (!Number.isFinite(expected) || !(expected > 0) || !Number.isFinite(actual) ||
            allowance > expected * MAX_QUANTIZATION_RELATIVE_ERROR ||
            actual + allowance < minNormalDot * expected || actual > expected + allowance) {
          capacity(`triangle ${faceIndex} exceeds bounded chart edge precision`);
        }
        pixelLengths.push(actual);
      }
      const edgeA: Vec2 = [(uv[1][0] - uv[0][0]) * width, (uv[1][1] - uv[0][1]) * height];
      const edgeB: Vec2 = [(uv[2][0] - uv[0][0]) * width, (uv[2][1] - uv[0][1]) * height];
      const actualArea = edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0];
      const sourceEdgeA = subtract(face.points[1], face.points[0]);
      const sourceEdgeB = subtract(face.points[2], face.points[0]);
      const sourceArea = magnitude(cross(sourceEdgeA, sourceEdgeB)) * density * density;
      // Account for cancellation in the source cross product as well as UV
      // quantization; very ill-conditioned triangles fail instead of acquiring
      // a misleading area-distortion guarantee.
      const sourceProductMagnitude = Math.abs(sourceEdgeA[1] * sourceEdgeB[2]) + Math.abs(sourceEdgeA[2] * sourceEdgeB[1])
        + Math.abs(sourceEdgeA[2] * sourceEdgeB[0]) + Math.abs(sourceEdgeA[0] * sourceEdgeB[2])
        + Math.abs(sourceEdgeA[0] * sourceEdgeB[1]) + Math.abs(sourceEdgeA[1] * sourceEdgeB[0]);
      const sourceAreaError = sourceProductMagnitude * Number.EPSILON * 32 * density * density;
      const areaAllowance = coordinateError * (pixelLengths[0]! + pixelLengths[2]!) + 3 * coordinateError ** 2
        + sourceAreaError + Number.EPSILON * 128 * Math.max(1, sourceArea, Math.abs(actualArea));
      if (!Number.isFinite(sourceArea) || !(sourceArea > 0) || !Number.isFinite(sourceAreaError) || !Number.isFinite(actualArea) || !(actualArea > 0) ||
          areaAllowance > sourceArea * MAX_QUANTIZATION_RELATIVE_ERROR ||
          actualArea + areaAllowance < minNormalDot * sourceArea || actualArea > sourceArea + areaAllowance) {
        capacity(`triangle ${faceIndex} exceeds bounded chart area precision`);
      }
      const current: QuantizedChartFace = {
        exact,
        minX: Math.min(uv[0][0], uv[1][0], uv[2][0]), minY: Math.min(uv[0][1], uv[1][1], uv[2][1]),
        maxX: Math.max(uv[0][0], uv[1][0], uv[2][0]), maxY: Math.max(uv[0][1], uv[1][1], uv[2][1])
      };
      for (const other of prior) {
        consumeOverlapCheck();
        if (current.maxX <= other.minX || other.maxX <= current.minX || current.maxY <= other.minY || other.maxY <= current.minY) continue;
        if (exactTriangleInteriorsOverlap(current.exact, other.exact)) {
          capacity(`triangle ${faceIndex} overlaps another bounded chart face after float32 conversion`);
        }
      }
      prior.push(current);
    }
  }
}

/** Every finite float32 is an integer multiple of 2^-149. */
function float32DyadicUnits(value: number, view: DataView): bigint {
  view.setFloat32(0, value, false);
  const bits = view.getUint32(0, false);
  const exponent = (bits >>> 23) & 0xff;
  const fraction = bits & 0x7fffff;
  if (exponent === 0xff) capacity("bounded chart UV coordinates must be finite");
  const magnitude = exponent === 0 ? BigInt(fraction) : BigInt(0x800000 + fraction) << BigInt(exponent - 1);
  return (bits >>> 31) === 0 ? magnitude : -magnitude;
}

function exactOrient(a: ExactUV, b: ExactUV, c: ExactUV): bigint {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Separating-axis test on exact float32 values; touching boundaries are allowed. */
function exactTriangleInteriorsOverlap(a: readonly [ExactUV, ExactUV, ExactUV], b: readonly [ExactUV, ExactUV, ExactUV]): boolean {
  const separatedByEdge = (first: readonly [ExactUV, ExactUV, ExactUV], second: readonly [ExactUV, ExactUV, ExactUV]): boolean => {
    for (let edge = 0; edge < 3; edge += 1) {
      const start = first[edge]!, end = first[(edge + 1) % 3]!, opposite = first[(edge + 2) % 3]!;
      const ownMax = exactOrient(start, end, opposite);
      if (ownMax <= 0n) capacity("bounded chart contains an invalid quantized triangle");
      const d0 = exactOrient(start, end, second[0]);
      const d1 = exactOrient(start, end, second[1]);
      const d2 = exactOrient(start, end, second[2]);
      const otherMin = d0 < d1 ? (d0 < d2 ? d0 : d2) : (d1 < d2 ? d1 : d2);
      const otherMax = d0 > d1 ? (d0 > d2 ? d0 : d2) : (d1 > d2 ? d1 : d2);
      if (otherMax <= 0n || otherMin >= ownMax) return true;
    }
    return false;
  };
  return !separatedByEdge(a, b) && !separatedByEdge(b, a);
}

function packCharts(charts: Chart[], width: number, height: number, gutter: number, density: number, options: UVAtlasOptions): void {
  const free: UVAtlasRect[] = [{ x: 0, y: 0, width, height }];
  const sorted = [...charts].sort((a, b) => {
    const aa = (a.maxX - a.minX) * (a.maxY - a.minY);
    const ba = (b.maxX - b.minX) * (b.maxY - b.minY);
    return ba - aa || a.id - b.id;
  });
  for (const chart of sorted) {
    checkCancelled(options);
    const w = Math.ceil((chart.maxX - chart.minX) * density) + gutter * 2;
    const h = Math.ceil((chart.maxY - chart.minY) * density) + gutter * 2;
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h)) capacity("chart dimensions exceed numeric limits");
    let choice: { index: number; rotated: boolean; width: number; height: number; waste: number } | undefined;
    for (let i = 0; i < free.length; i += 1) {
      const slot = free[i]!;
      for (const rotated of [false, true]) {
        const rw = rotated ? h : w;
        const rh = rotated ? w : h;
        if (rw > slot.width || rh > slot.height) continue;
        const waste = slot.width * slot.height - rw * rh;
        if (!choice || waste < choice.waste) choice = { index: i, rotated, width: rw, height: rh, waste };
      }
    }
    if (!choice) capacity(`atlas ${width}x${height} cannot fit all charts at density ${density} and gutter ${gutter}`);
    const slot = free.splice(choice.index, 1)[0]!;
    chart.placement = { x: slot.x, y: slot.y, width: choice.width, height: choice.height, rotated: choice.rotated };
    const rightWidth = slot.width - choice.width;
    const bottomHeight = slot.height - choice.height;
    // Two disjoint guillotine partitions; choose the larger residual rectangle first.
    if (rightWidth > 0) free.push({ x: slot.x + choice.width, y: slot.y, width: rightWidth, height: choice.height });
    if (bottomHeight > 0) free.push({ x: slot.x, y: slot.y + choice.height, width: slot.width, height: bottomHeight });
  }
}

function remapGeometry(input: UVAtlasGeometry, remap: Uint32Array, indices: number[], destination: UVAtlasDestination, generatedUVs: Float32Array, vertexCount: number): UVAtlasGeometry {
  const out: UVAtlasGeometry = {
    ...input,
    positions: copyVertexData(input.positions, 3, remap, vertexCount) as AuraCustomGeometrySpec["positions"],
    ...(input.normals !== undefined ? { normals: copyVertexData(input.normals, 3, remap, vertexCount) as AuraCustomGeometrySpec["normals"] } : {}),
    ...(input.uvs !== undefined ? { uvs: copyVertexData(input.uvs, 2, remap, vertexCount) as AuraCustomGeometrySpec["uvs"] } : {}),
    ...(input.uv1s !== undefined ? { uv1s: copyVertexData(input.uv1s, 2, remap, vertexCount) as AuraVec2Attribute } : {}),
    ...(input.colors !== undefined ? { colors: copyColors(input.colors, remap, vertexCount) as AuraCustomGeometrySpec["colors"] } : {}),
    indices: remap.length > 65536 ? Uint32Array.from(indices) : Uint16Array.from(indices),
    ...(input.groups ? { groups: input.groups.map((group) => ({ ...group })) } : {}),
    ...(input.drawRange ? { drawRange: { ...input.drawRange } } : {}),
    ...(input.bounds ? { bounds: { min: [...input.bounds.min] as [number, number, number], max: [...input.bounds.max] as [number, number, number] } } : {}),
    ...(input.morphTargets ? { morphTargets: input.morphTargets.map((target) => ({
      ...target,
      positions: copyVertexData(target.positions, 3, remap, vertexCount) as Float32Array | readonly number[],
      ...(target.normals !== undefined ? { normals: copyVertexData(target.normals, 3, remap, vertexCount) as Float32Array | readonly number[] } : {}),
      ...(target.tangents !== undefined ? { tangents: copyVertexData(target.tangents, 3, remap, vertexCount) as Float32Array | readonly number[] } : {})
    })) } : {}),
    ...(input.attributes ? { attributes: Object.fromEntries(Object.entries(input.attributes).map(([name, attribute]) => {
      const source = attribute as typeof attribute & { readonly stride?: number; readonly offset?: number };
      if (!Number.isInteger(source.itemSize) || source.itemSize < 1 || source.itemSize > 4) invalid(`attribute ${name} itemSize must be between 1 and 4`);
      if (source.normalized !== undefined && typeof source.normalized !== "boolean") invalid(`attribute ${name} normalized must be boolean`);
      if (source.normalized && !(source.data instanceof Int8Array || source.data instanceof Uint8Array || source.data instanceof Int16Array || source.data instanceof Uint16Array || source.data instanceof Int32Array || source.data instanceof Uint32Array)) invalid(`attribute ${name} normalization requires integer data`);
      return [name, { ...attribute, data: copyVertexData(source.data, source.itemSize, remap, vertexCount, source.stride, source.offset, source.stride === undefined && source.offset === undefined) as typeof attribute.data, stride: source.itemSize, offset: 0 }];
    })) } : {}),
    [destination]: generatedUVs
  };
  return out;
}

type NumericView = Float32Array | Float64Array | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array;
function copyVertexData(source: unknown, width: number, remap: Uint32Array, count: number, stride = width, offset = 0, packedStrict = true): unknown {
  if (!Number.isInteger(stride) || stride < width || !Number.isInteger(offset) || offset < 0 || offset + width > stride) invalid("attribute stride and offset are invalid");
  if (Array.isArray(source) && source.length > 0 && typeof source[0] !== "number") {
    if (source.length !== count || stride !== width || offset !== 0) invalid("tuple attribute length does not match positions");
    for (const tuple of source) {
      if (!Array.isArray(tuple) || tuple.length !== width || !tuple.every(Number.isFinite)) invalid("vertex attributes must contain finite tuples of the expected width");
    }
    return Array.from(remap, (index) => Array.isArray(source[index]) ? [...source[index]] : source[index]);
  }
  if (!Array.isArray(source) && !ArrayBuffer.isView(source)) invalid("unsupported vertex attribute data");
  const values = source as ArrayLike<number>;
  if (offset + (count - 1) * stride + width > values.length) invalid("attribute length does not match positions");
  if (packedStrict && values.length !== count * width) invalid("packed attribute length does not match positions");
  const list: number[] = [];
  for (const original of remap) {
    for (let component = 0; component < width; component += 1) {
      const value = values[offset + original * stride + component];
      if (!Number.isFinite(value)) invalid("vertex attributes must be finite");
      list.push(value!);
    }
  }
  if (Array.isArray(source)) return list;
  const TypedArray = (source as NumericView).constructor as { new(values: ArrayLike<number>): NumericView };
  return new TypedArray(list);
}

function copyColors(source: unknown, remap: Uint32Array, vertexCount: number): unknown {
  if (Array.isArray(source) && source.length > 0 && typeof source[0] !== "number") {
    if (source.length !== vertexCount) invalid("color count must match positions");
    for (const color of source) {
      if (typeof color === "string") continue;
      if (!Array.isArray(color) || (color.length !== 3 && color.length !== 4) || !color.every(Number.isFinite)) invalid("colors must be finite RGB/RGBA tuples or color strings");
    }
    return Array.from(remap, (index) => Array.isArray(source[index]) ? [...source[index]] : source[index]);
  }
  const length = (source as ArrayLike<number>).length;
  if (length === vertexCount * 3) return copyVertexData(source, 3, remap, vertexCount);
  if (length === vertexCount * 4) return copyVertexData(source, 4, remap, vertexCount);
  invalid("colors must have three or four values per vertex");
}

function triangleIntersectionArea(subject: readonly Vec2[], clip: readonly Vec2[]): number {
  let polygon = [...subject];
  const sign = orient(clip[0]!, clip[1]!, clip[2]!) >= 0 ? 1 : -1;
  for (let edge = 0; edge < 3 && polygon.length; edge += 1) {
    const a = clip[edge]!;
    const b = clip[(edge + 1) % 3]!;
    const result: Vec2[] = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i]!;
      const q = polygon[(i + 1) % polygon.length]!;
      const dp = sign * orient(a, b, p);
      const dq = sign * orient(a, b, q);
      if (dp >= 0) result.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = result;
  }
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    area += p[0] * q[1] - p[1] * q[0];
  }
  return Math.abs(area) / 2;
}
function orient(a: Vec2, b: Vec2, c: Vec2): number { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function getPosition(positions: readonly number[], index: number): Vec3 { return [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!]; }
function project(chart: Chart, point: Vec3): Vec2 { const p = subtract(point, chart.origin); return [dot(p, chart.axisX), dot(p, chart.axisY)]; }
function subtract(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function multiply(a: Vec3, scalar: number): Vec3 { return [a[0] * scalar, a[1] * scalar, a[2] * scalar]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function magnitude(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function normalize(a: Vec3): Vec3 { return multiply(a, 1 / magnitude(a)); }
function edgeKey(a: number, b: number): string { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function integerOption(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) invalid(`${label} must be an integer between ${minimum} and ${maximum}`);
  return value;
}
function checkCancelled(options: UVAtlasOptions): void { if (options.signal?.aborted) throw new UVAtlasError("CANCELLED", "UV atlas generation was cancelled"); }
function invalid(message: string): never { throw new UVAtlasError("INVALID_INPUT", message); }
function capacity(message: string): never { throw new UVAtlasError("CAPACITY", message); }

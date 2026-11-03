import type { RigidBody } from "../RigidBody.js";
import { Shape, addVec3, dotVec3, rotateVec3ByQuat, scaleVec3, subVec3, type HeightfieldShape, type MeshShape, type PhysicsShape, type Vec3 } from "../Shape.js";
import { convexPoints, convexShape, convexWitnessContact, type NativeConvexContact, type NativeConvexSet, type NativeConvexWitnessContact } from "./NativeConvex.js";

type Solid = Extract<PhysicsShape, { kind: "box" | "sphere" | "capsule" | "convex-hull" }>;
type Surface = MeshShape | HeightfieldShape;

function worldPoint(point: Vec3, body: RigidBody): Vec3 {
  return addVec3(body.position, rotateVec3ByQuat(point, body.rotation));
}

/** Yield the authored surface triangles in world coordinates, in stable index order. */
export function* nativeTriangles(shape: Surface, body: RigidBody): Generator<readonly [Vec3, Vec3, Vec3]> {
  if (shape.kind === "mesh") {
    for (let index = 0; index < shape.indices.length; index += 3) {
      yield [worldPoint(shape.vertices[shape.indices[index]!]!, body), worldPoint(shape.vertices[shape.indices[index + 1]!]!, body), worldPoint(shape.vertices[shape.indices[index + 2]!]!, body)];
    }
    return;
  }
  const point = (row: number, column: number): Vec3 => worldPoint([
    (column - (shape.columns - 1) * 0.5) * shape.cellSize,
    shape.heights[row * shape.columns + column]!,
    (row - (shape.rows - 1) * 0.5) * shape.cellSize
  ], body);
  for (let row = 0; row < shape.rows - 1; row += 1) {
    for (let column = 0; column < shape.columns - 1; column += 1) {
      const a = point(row, column), b = point(row, column + 1);
      const c = point(row + 1, column), d = point(row + 1, column + 1);
      yield [a, b, c];
      yield [b, d, c];
    }
  }
}

function finiteTriangle(triangle: readonly [Vec3, Vec3, Vec3]): boolean {
  const a = triangle[0], b = triangle[1], c = triangle[2];
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  const u = c[0] - a[0], v = c[1] - a[1], w = c[2] - a[2];
  const area = Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u);
  return area > Math.hypot(x, y, z) * Math.hypot(u, v, w) * 1e-12;
}

/** Separating axes establish overlap and its minimum translation direction. */
function boxTriangleAxis(shape: Extract<PhysicsShape, { kind: "box" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3]): { normal: Vec3; penetration: number } | undefined {
  const basis: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const boxAxes = basis.map((axis) => rotateVec3ByQuat(axis, body.rotation));
  const edges = triangle.map((point, index) => subVec3(triangle[(index + 1) % 3]!, point));
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const axes = [cross(edges[0]!, edges[1]!), ...boxAxes, ...boxAxes.flatMap((axis) => edges.map((edge) => cross(axis, edge)))];
  const coordinateMagnitude = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...body.position.map(Math.abs));
  const tolerance = Math.max(...shape.halfExtents) * 1e-9 + coordinateMagnitude * Number.EPSILON * 16;
  let best: { normal: Vec3; penetration: number } | undefined;
  for (const axis of axes) {
    const magnitude = Math.hypot(...axis);
    if (magnitude <= 1e-30) continue;
    const direction = scaleVec3(axis, 1 / magnitude);
    const span = boxAxes.reduce((sum, boxAxis, index) => sum + Math.abs(dotVec3(direction, boxAxis)) * shape.halfExtents[index]!, 0);
    const positions = triangle.map((point) => dotVec3(subVec3(point, body.position), direction));
    const towardPositive = span - Math.min(...positions), towardNegative = span + Math.max(...positions);
    const penetration = Math.min(towardPositive, towardNegative);
    if (penetration < -tolerance) return undefined;
    if (!best || penetration < best.penetration - tolerance * 0.1) {
      best = { normal: scaleVec3(direction, towardPositive <= towardNegative ? 1 : -1), penetration: Math.max(0, penetration) };
    }
  }
  if (!best) throw new Error("Native box/triangle collision could not establish an axis.");
  return best;
}

/** Clip distant portions of a triangle outside a padded solid bound. */
function localTrianglePolygon(triangle: readonly [Vec3, Vec3, Vec3], bounds: ReturnType<typeof Shape.bounds>): Vec3[] {
  const size = Math.max(...[0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!));
  const padding = size * 2;
  let polygon: Vec3[] = [...triangle];
  for (let axis = 0; axis < 3; axis += 1) for (const sign of [-1, 1]) {
    if (polygon.length === 0) return [];
    const limit = sign < 0 ? -(bounds.min[axis]! - padding) : bounds.max[axis]! + padding;
    const output: Vec3[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!, b = polygon[(index + 1) % polygon.length]!;
      const da = sign * a[axis]! - limit, db = sign * b[axis]! - limit;
      if (da <= 0) output.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        output.push(addVec3(a, scaleVec3(subVec3(b, a), da / (da - db))));
      }
    }
    polygon = output;
  }
  return polygon;
}

function insideTriangle(point: Vec3, triangle: readonly [Vec3, Vec3, Vec3]): boolean {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]), w = subVec3(point, triangle[0]);
  const uu = dotVec3(u, u), uv = dotVec3(u, v), vv = dotVec3(v, v), wu = dotVec3(w, u), wv = dotVec3(w, v);
  const denominator = uu * vv - uv * uv;
  if (denominator <= uu * vv * 1e-14) return false;
  const x = (vv * wu - uv * wv) / denominator, y = (uu * wv - uv * wu) / denominator;
  const coordinates = Math.max(...triangle.flatMap((vertex) => vertex.map(Math.abs)), ...point.map(Math.abs));
  const tolerance = Number.EPSILON * 32 * Math.max(1, coordinates / Math.max(Math.sqrt(uu), Math.sqrt(vv)));
  return x >= -tolerance && y >= -tolerance && x + y <= 1 + tolerance;
}

function closestTrianglePoint(point: Vec3, triangle: readonly [Vec3, Vec3, Vec3]): Vec3 {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
  const signed = dotVec3(subVec3(point, triangle[0]), normal);
  const projection = subVec3(point, scaleVec3(normal, signed));
  let closest = projection;
  if (!insideTriangle(projection, triangle)) {
    let best = Infinity;
    for (let index = 0; index < 3; index += 1) {
      const start = triangle[index]!, axis = subVec3(triangle[(index + 1) % 3]!, start);
      const fraction = Math.max(0, Math.min(1, dotVec3(subVec3(point, start), axis) / dotVec3(axis, axis)));
      const candidate = addVec3(start, scaleVec3(axis, fraction));
      const delta = subVec3(candidate, point);
      const distanceSquared = dotVec3(delta, delta);
      if (distanceSquared < best) { closest = candidate; best = distanceSquared; }
    }
  }
  return closest;
}

/** A sphere's nearest surface feature can be computed directly, without a size-dependent solver. */
function sphereTriangle(center: Vec3, radius: number, triangle: readonly [Vec3, Vec3, Vec3]): NativeConvexWitnessContact | undefined {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
  const signed = dotVec3(subVec3(center, triangle[0]), normal);
  const closest = closestTrianglePoint(center, triangle);
  const offset = subVec3(closest, center);
  const distance = Math.hypot(...offset);
  const coordinates = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...center.map(Math.abs));
  const tolerance = radius * 1e-9 + coordinates * Number.EPSILON * 16;
  if (distance > radius + tolerance) return undefined;
  const toward = distance > tolerance ? scaleVec3(offset, 1 / distance) : scaleVec3(normal, signed >= 0 ? -1 : 1);
  const witnessA = addVec3(center, scaleVec3(toward, radius));
  return { normal: toward, point: scaleVec3(addVec3(witnessA, closest), 0.5), penetration: Math.max(0, radius - distance), witnessA, witnessB: closest };
}

/** Closest points on closed segments, including nearly parallel interiors. */
export function closestNativeSegments(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3): readonly [Vec3, Vec3] {
  const u = subVec3(a1, a0), v = subVec3(b1, b0);
  const lengthA = Math.hypot(...u), lengthB = Math.hypot(...v);
  const centerA = addVec3(a0, scaleVec3(u, 0.5)), centerB = addVec3(b0, scaleVec3(v, 0.5));
  const axisA = lengthA ? scaleVec3(u, 1 / lengthA) : [0, 0, 0] as const;
  const axisB = lengthB ? scaleVec3(v, 1 / lengthB) : [0, 0, 0] as const;
  const nearest = (point: Vec3, center: Vec3, axis: Vec3, half: number): Vec3 =>
    addVec3(center, scaleVec3(axis, Math.max(-half, Math.min(half, dotVec3(subVec3(point, center), axis)))));
  const candidates: Array<readonly [Vec3, Vec3]> = [
    [a0, nearest(a0, centerB, axisB, lengthB / 2)], [a1, nearest(a1, centerB, axisB, lengthB / 2)],
    [nearest(b0, centerA, axisA, lengthA / 2), b0], [nearest(b1, centerA, axisA, lengthA / 2), b1]
  ];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normal = cross(axisA, axisB), sine = Math.hypot(...normal);
  // The cross product retains the small angle that is lost by subtracting
  // nearly equal squared dot products. Centering also avoids large offsets in
  // the line parameters when the segments are much longer than their gap.
  if (sine > 64 * Number.EPSILON) {
    const offset = subVec3(centerA, centerB), denominator = sine * sine;
    const s = -dotVec3(cross(offset, axisB), normal) / denominator;
    const t = -dotVec3(cross(offset, axisA), normal) / denominator;
    if (Math.abs(s) <= lengthA / 2 && Math.abs(t) <= lengthB / 2) {
      candidates.push([addVec3(centerA, scaleVec3(axisA, s)), addVec3(centerB, scaleVec3(axisB, t))]);
    }
  }
  let best = candidates[0]!;
  let distance = Math.hypot(...subVec3(best[0], best[1]));
  for (const candidate of candidates.slice(1)) {
    const next = Math.hypot(...subVec3(candidate[0], candidate[1]));
    if (next < distance) { best = candidate; distance = next; }
  }
  if (sine > 0 && sine <= 64 * Number.EPSILON && distance > 0 && sine * Math.min(lengthA, lengthB) > distance * 1e-9) {
    throw new Error("Native segment closest points are numerically ambiguous.");
  }
  return best;
}

/** Closest segment/triangle features; an actual crossing has zero distance. */
function closestSegmentTriangle(start: Vec3, end: Vec3, triangle: readonly [Vec3, Vec3, Vec3]): readonly [Vec3, Vec3] {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
  const first = dotVec3(subVec3(start, triangle[0]), normal), last = dotVec3(subVec3(end, triangle[0]), normal);
  if ((first <= 0 && last >= 0) || (first >= 0 && last <= 0)) {
    const denominator = first - last;
    if (denominator !== 0) {
      const point = addVec3(start, scaleVec3(subVec3(end, start), first / denominator));
      if (insideTriangle(point, triangle)) return [point, point];
    }
  }
  let best: readonly [Vec3, Vec3] = [start, closestTrianglePoint(start, triangle)];
  let distance = Math.hypot(...subVec3(best[0], best[1]));
  const choose = (candidate: readonly [Vec3, Vec3]): void => {
    const next = Math.hypot(...subVec3(candidate[0], candidate[1]));
    if (next < distance) { best = candidate; distance = next; }
  };
  choose([end, closestTrianglePoint(end, triangle)]);
  for (let index = 0; index < 3; index += 1) choose(closestNativeSegments(start, end, triangle[index]!, triangle[(index + 1) % 3]!));
  return best;
}

/** A disjoint capsule core has an exact radial separation from a triangle. */
function capsuleTriangle(shape: Extract<PhysicsShape, { kind: "capsule" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3]): { readonly kind: "ambiguous" | "separated" } | { readonly kind: "contact"; readonly contact: NativeConvexWitnessContact } {
  const axis = rotateVec3ByQuat([0, shape.halfHeight, 0], body.rotation);
  const [core, surface] = closestSegmentTriangle(subVec3(body.position, axis), addVec3(body.position, axis), triangle);
  const delta = subVec3(surface, core), distance = Math.hypot(...delta);
  const coordinates = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...body.position.map(Math.abs));
  const tolerance = shape.radius * 1e-9 + Math.max(coordinates, shape.halfHeight) * Number.EPSILON * 32;
  if (distance > shape.radius + tolerance) return { kind: "separated" };
  if (distance <= tolerance) return { kind: "ambiguous" };
  const normal = scaleVec3(delta, 1 / distance);
  const witnessA = addVec3(core, scaleVec3(normal, shape.radius));
  return { kind: "contact", contact: { normal, point: scaleVec3(addVec3(witnessA, surface), 0.5), penetration: Math.max(0, shape.radius - distance), witnessA, witnessB: surface } };
}

/** Verify collinearity using the exact binary values supplied by the author. */
function exactCollinear(a: Vec3, b: Vec3, point: Vec3): boolean {
  const view = new DataView(new ArrayBuffer(8));
  const components = [...a, ...b, ...point].map((value) => {
    view.setFloat64(0, value);
    const bits = view.getBigUint64(0), exponent = Number((bits >> 52n) & 0x7ffn);
    const fraction = bits & 0xfffffffffffffn;
    const magnitude = exponent === 0 ? fraction : fraction | 0x10000000000000n;
    return { coefficient: bits >> 63n ? -magnitude : magnitude, exponent: exponent === 0 ? -1074 : exponent - 1075 };
  });
  const exponent = Math.min(...components.filter((item) => item.coefficient !== 0n).map((item) => item.exponent));
  if (!Number.isFinite(exponent)) return true;
  const integers = components.map((item) => item.coefficient === 0n ? 0n : item.coefficient << BigInt(item.exponent - exponent));
  const u = [0, 1, 2].map((axis) => integers[axis + 3]! - integers[axis]!);
  const v = [0, 1, 2].map((axis) => integers[axis + 6]! - integers[axis]!);
  return u[0]! * v[1]! === u[1]! * v[0]! && u[0]! * v[2]! === u[2]! * v[0]! && u[1]! * v[2]! === u[2]! * v[1]!;
}

/** Discard only duplicate or exactly certified segment-interior points. */
function hullFeatureVertices(shape: Extract<PhysicsShape, { kind: "convex-hull" }>): Vec3[] {
  const ordered = [...shape.vertices].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const distinct = ordered.filter((point, index) => index === 0 || point.some((value, axis) => value !== ordered[index - 1]![axis]));
  const retained: Vec3[] = [];
  let work = 0, exactChecks = 0, exhausted = false;
  for (let index = 0; index < distinct.length; index += 1) {
    const point = distinct[index]!;
    let redundant = false;
    for (let first = 0; first < distinct.length && !redundant && !exhausted; first += 1) {
      if (first === index) continue;
      for (let second = first + 1; second < distinct.length; second += 1) {
        if (second === index) continue;
        if (++work > 300_000) { exhausted = true; break; }
        const a = distinct[first]!, b = distinct[second]!;
        if ([0, 1, 2].some((axis) => point[axis]! < Math.min(a[axis]!, b[axis]!) || point[axis]! > Math.max(a[axis]!, b[axis]!))) continue;
        const u = subVec3(b, a), v = subVec3(point, a);
        if (u[0] * v[1] - u[1] * v[0] !== 0 || u[0] * v[2] - u[2] * v[0] !== 0 || u[1] * v[2] - u[2] * v[1] !== 0) continue;
        if (++exactChecks > 20_000) { exhausted = true; break; }
        if (exactCollinear(a, b, point)) { redundant = true; break; }
      }
    }
    if (!redundant) retained.push(point);
  }
  return retained;
}

/** Candidate separating planes from independently computed hull/triangle features. */
function hullTriangleDirections(shape: Extract<PhysicsShape, { kind: "convex-hull" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3]): Vec3[] {
  const featureVertices = hullFeatureVertices(shape), count = featureVertices.length;
  const candidateAxes = 1 + 3 * count * (count - 1) / 2 + count * (count - 1) * (count - 2) / 6;
  // Every candidate is tested in both directions against the original hull.
  if (candidateAxes * 2 * (shape.vertices.length + 6) > 2_000_000) {
    throw new Error("Native hull/triangle feature search exceeds bounded work.");
  }
  const vertices = featureVertices.map((point) => rotateVec3ByQuat(point, body.rotation));
  const triangleEdges = triangle.map((point, index) => subVec3(triangle[(index + 1) % 3]!, point));
  const directions: Vec3[] = [];
  const addCross = (a: Vec3, b: Vec3): void => {
    const lengthA = Math.hypot(...a), lengthB = Math.hypot(...b);
    if (lengthA === 0 || lengthB === 0) return;
    const first = scaleVec3(a, 1 / lengthA), second = scaleVec3(b, 1 / lengthB);
    const normal: Vec3 = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
    const length = Math.hypot(...normal);
    if (length > 0) directions.push([normal[0] / length, normal[1] / length, normal[2] / length]);
  };
  addCross(triangleEdges[0]!, triangleEdges[1]!);
  for (let i = 0; i < vertices.length; i += 1) for (let j = i + 1; j < vertices.length; j += 1) {
    const edge = subVec3(vertices[j]!, vertices[i]!);
    for (const triangleEdge of triangleEdges) addCross(edge, triangleEdge);
    for (let k = j + 1; k < vertices.length; k += 1) addCross(edge, subVec3(vertices[k]!, vertices[i]!));
  }
  return directions;
}

/** Intersect the two supporting features in their shared tangent plane. */
function hullTrianglePlaneWitness(shape: Extract<PhysicsShape, { kind: "convex-hull" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3], normal: Vec3): NativeConvexWitnessContact | undefined {
  const a = shape.vertices.map((point) => rotateVec3ByQuat(point, body.rotation));
  const b = triangle.map((point) => subVec3(point, body.position));
  const maxA = Math.max(...a.map((point) => dotVec3(point, normal)));
  const minB = Math.min(...b.map((point) => dotVec3(point, normal)));
  const scale = Math.max(...a.map((point) => Math.hypot(...point)), ...b.map((point) => Math.hypot(...point)));
  const coordinates = Math.max(...body.position.map(Math.abs), ...triangle.flatMap((point) => point.map(Math.abs)));
  const tolerance = (scale + coordinates) * Number.EPSILON * 256;
  const depth = maxA - minB;
  if (depth < -tolerance) return undefined;
  const first = a.filter((point) => maxA - dotVec3(point, normal) <= tolerance);
  const second = b.filter((point) => dotVec3(point, normal) - minB <= tolerance);
  if (first.length === 0 || second.length === 0) return undefined;
  const seed: Vec3 = Math.abs(normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const raw: Vec3 = [normal[1] * seed[2] - normal[2] * seed[1], normal[2] * seed[0] - normal[0] * seed[2], normal[0] * seed[1] - normal[1] * seed[0]];
  const u = scaleVec3(raw, 1 / Math.hypot(...raw));
  const v: Vec3 = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];
  type Point2 = { readonly x: number; readonly y: number };
  const cross2 = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const project = (point: Vec3): Point2 => ({ x: dotVec3(point, u), y: dotVec3(point, v) });
  const hull = (points: readonly Vec3[]): Point2[] => {
    const sorted = points.map(project).sort((left, right) => left.x - right.x || left.y - right.y);
    const unique: Point2[] = [];
    for (const point of sorted) {
      const last = unique[unique.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) > tolerance) unique.push(point);
    }
    if (unique.length <= 2) return unique;
    const lower: Point2[] = [], upper: Point2[] = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= tolerance * scale) lower.pop();
      lower.push(point);
    }
    for (let index = unique.length - 1; index >= 0; index -= 1) {
      const point = unique[index]!;
      while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= tolerance * scale) upper.pop();
      upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  const firstHull = hull(first), secondHull = hull(second);
  const contains = (polygon: readonly Point2[], point: Point2): boolean => {
    if (polygon.length === 1) return Math.hypot(point.x - polygon[0]!.x, point.y - polygon[0]!.y) <= tolerance;
    if (polygon.length === 2) {
      const start = polygon[0]!, end = polygon[1]!, dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.hypot(dx, dy), projection = (point.x - start.x) * dx + (point.y - start.y) * dy;
      return Math.abs(cross2(start, end, point)) <= tolerance * length && projection >= -tolerance * length && projection <= length * length + tolerance * length;
    }
    return polygon.every((vertex, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return cross2(vertex, next, point) >= -tolerance * Math.hypot(next.x - vertex.x, next.y - vertex.y);
    });
  };
  let shared = firstHull.find((point) => contains(secondHull, point)) ?? secondHull.find((point) => contains(firstHull, point));
  if (!shared) {
    const edges = (polygon: readonly Point2[]) => polygon.length < 2 ? [] : polygon.length === 2 ? [[polygon[0]!, polygon[1]!] as const] : polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]!] as const);
    for (const [a0, a1] of edges(firstHull)) for (const [b0, b1] of edges(secondHull)) {
      const ax = a1.x - a0.x, ay = a1.y - a0.y, bx = b1.x - b0.x, by = b1.y - b0.y;
      const denominator = ax * by - ay * bx;
      if (Math.abs(denominator) <= tolerance * Math.max(Math.hypot(ax, ay), Math.hypot(bx, by))) continue;
      const dx = b0.x - a0.x, dy = b0.y - a0.y;
      const t = (dx * by - dy * bx) / denominator, s = (dx * ay - dy * ax) / denominator;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) { shared = { x: a0.x + t * ax, y: a0.y + t * ay }; break; }
    }
  }
  if (!shared) return undefined;
  const tangent = addVec3(scaleVec3(u, shared.x), scaleVec3(v, shared.y));
  const witnessA = addVec3(body.position, addVec3(tangent, scaleVec3(normal, maxA)));
  const witnessB = addVec3(body.position, addVec3(tangent, scaleVec3(normal, minB)));
  return { normal, witnessA, witnessB, point: scaleVec3(addVec3(witnessA, witnessB), 0.5), penetration: Math.max(0, depth) };
}

/** Use all bounded hull/triangle feature axes when a solver witness is invalid. */
function hullTriangleAxisContact(shape: Extract<PhysicsShape, { kind: "convex-hull" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3]): NativeConvexWitnessContact | undefined {
  const vertices = shape.vertices.map((point) => rotateVec3ByQuat(point, body.rotation));
  const target = triangle.map((point) => subVec3(point, body.position));
  let best: { normal: Vec3; depth: number } | undefined;
  for (const raw of hullTriangleDirections(shape, body, triangle)) {
    const length = Math.hypot(...raw);
    if (length === 0) continue;
    const axis = scaleVec3(raw, 1 / length);
    for (const sign of [-1, 1]) {
      const normal = scaleVec3(axis, sign);
      const depth = Math.max(...vertices.map((point) => dotVec3(point, normal))) - Math.min(...target.map((point) => dotVec3(point, normal)));
      if (!best || depth < best.depth) best = { normal, depth };
    }
  }
  if (!best) throw new Error("Native hull/triangle feature search found no separating axis.");
  const scale = Math.max(...vertices.map((point) => Math.hypot(...point)), ...target.map((point) => Math.hypot(...point)));
  const coordinates = Math.max(...body.position.map(Math.abs), ...triangle.flatMap((point) => point.map(Math.abs)));
  if (best.depth < -(scale + coordinates) * Number.EPSILON * 256) return undefined;
  const contact = hullTrianglePlaneWitness(shape, body, triangle, best.normal);
  if (!contact) throw new Error("Native hull/triangle contact could not verify supporting features.");
  return contact;
}

/** A point where the finite surface enters the solid side of a plane. */
export function surfaceHalfspaceIntersection(surface: Surface, body: RigidBody, normal: Vec3, constant: number): Vec3 | undefined {
  for (const triangle of nativeTriangles(surface, body)) {
    if (!finiteTriangle(triangle)) continue;
    for (const point of triangle) if (dotVec3(normal, point) <= constant + 1e-8) return point;
  }
  return undefined;
}

function planarSegmentIntersection(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3): Vec3 | undefined {
  const drop = Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2])
    ? 0 : Math.abs(normal[1]) >= Math.abs(normal[2]) ? 1 : 2;
  const axes = [0, 1, 2].filter((index) => index !== drop);
  const x = axes[0]!, y = axes[1]!;
  const rx = b[x]! - a[x]!, ry = b[y]! - a[y]!;
  const sx = d[x]! - c[x]!, sy = d[y]! - c[y]!;
  const qx = c[x]! - a[x]!, qy = c[y]! - a[y]!;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) > 1e-12) {
    const t = (qx * sy - qy * sx) / denominator;
    const u = (qx * ry - qy * rx) / denominator;
    if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return undefined;
    return addVec3(a, scaleVec3(subVec3(b, a), Math.max(0, Math.min(1, t))));
  }
  if (Math.abs(qx * ry - qy * rx) > 1e-10) return undefined;
  const lengthSquared = rx * rx + ry * ry;
  if (lengthSquared <= 1e-20) return Math.hypot(qx, qy) <= 1e-8 ? a : undefined;
  const t0 = (qx * rx + qy * ry) / lengthSquared;
  const t1 = t0 + (sx * rx + sy * ry) / lengthSquared;
  const first = Math.max(0, Math.min(t0, t1)), last = Math.min(1, Math.max(t0, t1));
  return first <= last + 1e-8 ? addVec3(a, scaleVec3(subVec3(b, a), first)) : undefined;
}

function segmentTriangle(a: Vec3, b: Vec3, triangle: readonly [Vec3, Vec3, Vec3]): Vec3 | undefined {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...raw);
  if (length <= 1e-12) return undefined;
  const normal = scaleVec3(raw, 1 / length);
  const da = dotVec3(subVec3(a, triangle[0]), normal), db = dotVec3(subVec3(b, triangle[0]), normal);
  if (Math.abs(da) <= 1e-8 && Math.abs(db) <= 1e-8) {
    if (insideTriangle(a, triangle)) return a;
    if (insideTriangle(b, triangle)) return b;
    for (let index = 0; index < 3; index += 1) {
      const point = planarSegmentIntersection(a, b, triangle[index]!, triangle[(index + 1) % 3]!, normal);
      if (point) return point;
    }
    return undefined;
  }
  if ((da > 1e-8 && db > 1e-8) || (da < -1e-8 && db < -1e-8)) return undefined;
  const denominator = da - db;
  if (Math.abs(denominator) <= 1e-14) return undefined;
  const t = da / denominator;
  if (t < -1e-8 || t > 1 + 1e-8) return undefined;
  const point = addVec3(a, scaleVec3(subVec3(b, a), Math.max(0, Math.min(1, t))));
  return insideTriangle(point, triangle) ? point : undefined;
}

/** Finite surface intersection, used for stationary sensor pairs. */
export function surfaceIntersection(a: Surface, bodyA: RigidBody, b: Surface, bodyB: RigidBody): Vec3 | undefined {
  const trianglesB = [...nativeTriangles(b, bodyB)].filter(finiteTriangle);
  for (const first of nativeTriangles(a, bodyA)) {
    if (!finiteTriangle(first)) continue;
    for (const second of trianglesB) {
      if ([0, 1, 2].some((axis) => {
        const minA = Math.min(...first.map((point) => point[axis]!)), maxA = Math.max(...first.map((point) => point[axis]!));
        const minB = Math.min(...second.map((point) => point[axis]!)), maxB = Math.max(...second.map((point) => point[axis]!));
        return maxA < minB - 1e-8 || maxB < minA - 1e-8;
      })) continue;
      for (let index = 0; index < 3; index += 1) {
        const point = segmentTriangle(first[index]!, first[(index + 1) % 3]!, second) ??
          segmentTriangle(second[index]!, second[(index + 1) % 3]!, first);
        if (point) return point;
      }
    }
  }
  return undefined;
}

function boxTriangleManifold(shape: Extract<PhysicsShape, { kind: "box" }>, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3], reference: NativeConvexContact): NativeConvexContact[] {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
  if (Math.abs(dotVec3(normal, reference.normal)) < 0.98) return [];
  const centerDistance = dotVec3(subVec3(body.position, triangle[0]), normal);
  const coordinates = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...body.position.map(Math.abs));
  const tolerance = Math.max(...shape.halfExtents) * 1e-10 + coordinates * Number.EPSILON * 16;
  const side = Math.abs(centerDistance) > tolerance ? Math.sign(centerDistance) : dotVec3(normal, reference.normal) <= 0 ? 1 : -1;
  const towardSurface = scaleVec3(normal, -side);
  const basis: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const axes = basis.map((axis) => rotateVec3ByQuat(axis, body.rotation));
  const alignments = axes.map((axis) => Math.abs(dotVec3(axis, towardSurface)));
  const faceAxis = alignments.indexOf(Math.max(...alignments));
  const sign = dotVec3(axes[faceAxis]!, towardSurface) >= 0 ? 1 : -1;
  const faceCenter = addVec3(body.position, scaleVec3(axes[faceAxis]!, sign * shape.halfExtents[faceAxis]!));
  const other = [0, 1, 2].filter((index) => index !== faceAxis);
  const first = scaleVec3(axes[other[0]!]!, shape.halfExtents[other[0]!]!);
  const second = scaleVec3(axes[other[1]!]!, shape.halfExtents[other[1]!]!);
  let polygon: Vec3[] = [addVec3(addVec3(faceCenter, first), second), addVec3(subVec3(faceCenter, first), second),
    subVec3(subVec3(faceCenter, first), second), addVec3(subVec3(faceCenter, second), first)];
  const clip = (vertices: readonly Vec3[], origin: Vec3, inward: Vec3): Vec3[] => {
    const clipped: Vec3[] = [];
    for (let index = 0; index < vertices.length; index += 1) {
      const a = vertices[index]!, b = vertices[(index + 1) % vertices.length]!;
      const da = dotVec3(subVec3(a, origin), inward), db = dotVec3(subVec3(b, origin), inward);
      if (da >= -tolerance) clipped.push(a);
      if ((da < -tolerance && db > tolerance) || (da > tolerance && db < -tolerance)) {
        clipped.push(addVec3(a, scaleVec3(subVec3(b, a), da / (da - db))));
      }
    }
    return clipped;
  };
  for (let index = 0; index < 3 && polygon.length > 0; index += 1) {
    const edge = subVec3(triangle[(index + 1) % 3]!, triangle[index]!);
    const inward: Vec3 = [normal[1] * edge[2] - normal[2] * edge[1], normal[2] * edge[0] - normal[0] * edge[2], normal[0] * edge[1] - normal[1] * edge[0]];
    polygon = clip(polygon, triangle[index]!, scaleVec3(inward, 1 / Math.hypot(...inward)));
  }
  if (polygon.length > 0) polygon = clip(polygon, triangle[0], towardSurface);
  const contacts = polygon.flatMap((vertex) => {
    const distance = dotVec3(subVec3(vertex, triangle[0]), normal);
    const depth = -distance * side;
    if (depth < -tolerance) return [];
    const projection = subVec3(vertex, scaleVec3(normal, distance));
    return [{ normal: towardSurface, point: scaleVec3(addVec3(vertex, projection), 0.5), penetration: Math.max(0, depth) }];
  });
  return contacts.some((contact) => contact.penetration > tolerance) ? contacts.filter((contact) => contact.penetration > tolerance) : contacts;
}

/** Prefer a genuine triangle-face witness over an internal triangulation edge. */
function triangleFaceContact(solid: NativeConvexSet, body: RigidBody, triangle: readonly [Vec3, Vec3, Vec3], reference: NativeConvexContact): NativeConvexContact | undefined {
  const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
  const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
  const centerDistance = dotVec3(subVec3(body.position, triangle[0]), normal);
  const width = Math.abs(dotVec3(subVec3(solid.support(normal), solid.support(scaleVec3(normal, -1))), normal));
  const coordinates = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...body.position.map(Math.abs));
  const tolerance = width * 1e-10 + coordinates * Number.EPSILON * 16;
  const side = Math.abs(centerDistance) > tolerance ? Math.sign(centerDistance) : dotVec3(reference.normal, normal) <= 0 ? 1 : -1;
  const towardSurface = scaleVec3(normal, -side);
  const witness = solid.support(towardSurface);
  const distance = dotVec3(subVec3(witness, triangle[0]), normal);
  const depth = -distance * side;
  if (depth < -tolerance) return undefined;
  const projection = subVec3(witness, scaleVec3(normal, distance));
  if (!insideTriangle(projection, triangle)) return undefined;
  return { normal: towardSurface, point: scaleVec3(addVec3(witness, projection), 0.5), penetration: Math.max(0, depth) };
}

type SurfaceCandidate = { readonly contact: NativeConvexContact; readonly triangle: readonly [Vec3, Vec3, Vec3]; readonly face: boolean; readonly witness?: Vec3 };

/** Check whether a neighboring face makes an edge witness redundant. */
function coveredInternalEdge(edge: SurfaceCandidate, face: SurfaceCandidate, center: Vec3, solidSize: number, sphere: boolean): boolean {
  if (!face.face || edge.face || !edge.witness) return false;
  const equal = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const shared = edge.triangle.filter((a) => face.triangle.some((b) => equal(a, b)));
  if (shared.length !== 2) return false;
  const axis = subVec3(shared[1]!, shared[0]!);
  const edgeOther = edge.triangle.find((point) => !shared.some((value) => equal(point, value)))!;
  const faceOther = face.triangle.find((point) => !shared.some((value) => equal(point, value)))!;
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const edgeSide = cross(axis, subVec3(edgeOther, shared[0]!));
  const faceSide = cross(axis, subVec3(faceOther, shared[0]!));
  const planeNormal = scaleVec3(faceSide, 1 / Math.hypot(...faceSide));
  const coordinateMagnitude = Math.max(...edge.triangle.flatMap((point) => point.map(Math.abs)), ...face.triangle.flatMap((point) => point.map(Math.abs)));
  const planeError = (coordinateMagnitude + Math.hypot(...axis)) * Number.EPSILON * 32;
  const coplanarInterior = Math.abs(dotVec3(subVec3(edgeOther, shared[0]!), planeNormal)) <= planeError && dotVec3(edgeSide, faceSide) < 0;
  if (!coplanarInterior) {
    // For a sphere above a convex ridge, a valid adjacent face witness is
    // strictly closer than the shared edge. Keep edges at concave creases,
    // exposed boundaries, or when neither face contains the closest point.
    if (!sphere) return false;
    const tolerance = solidSize * 1e-10 + Math.max(...center.map(Math.abs)) * Number.EPSILON * 16;
    const faceNormal = scaleVec3(face.contact.normal, -1);
    if (dotVec3(subVec3(edgeOther, shared[0]!), faceNormal) >= -tolerance) return false;
  }
  const fraction = Math.max(0, Math.min(1, dotVec3(subVec3(edge.witness, shared[0]!), axis) / dotVec3(axis, axis)));
  const closest = addVec3(shared[0]!, scaleVec3(axis, fraction));
  const tolerance = Math.min(Math.hypot(...axis), solidSize) * 1e-7 + coordinateMagnitude * Number.EPSILON * 16;
  return Math.hypot(...subVec3(edge.witness, closest)) <= tolerance;
}

/** A collinear interior point adds no normal constraint beyond its two endpoints. */
function redundantBoxPoint(candidate: SurfaceCandidate, faces: readonly SurfaceCandidate[], pointTolerance: number, depthTolerance: number): boolean {
  const eligible = faces.filter((face) => face !== candidate && Math.hypot(...subVec3(face.contact.normal, candidate.contact.normal)) < 1e-9);
  for (let i = 0; i < eligible.length; i += 1) for (let j = i + 1; j < eligible.length; j += 1) {
    const first = eligible[i]!.contact, second = eligible[j]!.contact;
    const axis = subVec3(second.point, first.point), lengthSquared = dotVec3(axis, axis);
    if (lengthSquared <= pointTolerance * pointTolerance) continue;
    const fraction = dotVec3(subVec3(candidate.contact.point, first.point), axis) / lengthSquared;
    if (fraction <= 1e-8 || fraction >= 1 - 1e-8) continue;
    const point = addVec3(first.point, scaleVec3(axis, fraction));
    const depth = first.penetration + (second.penetration - first.penetration) * fraction;
    if (Math.hypot(...subVec3(candidate.contact.point, point)) <= pointTolerance &&
      Math.abs(candidate.contact.penetration - depth) <= depthTolerance) return true;
  }
  return false;
}

/** Bound collinearity checks on densely tessellated surfaces with extremal witnesses. */
function boxFaceAnchors(faces: readonly SurfaceCandidate[]): readonly SurfaceCandidate[] {
  if (faces.length <= 32) return faces;
  const directions: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]];
  const anchors = new Set<SurfaceCandidate>();
  for (const direction of directions) {
    let min = faces[0]!, max = faces[0]!, minValue = dotVec3(min.contact.point, direction), maxValue = minValue;
    for (const candidate of faces) {
      const value = dotVec3(candidate.contact.point, direction);
      if (value < minValue) { min = candidate; minValue = value; }
      if (value > maxValue) { max = candidate; maxValue = value; }
    }
    anchors.add(min);
    anchors.add(max);
  }
  return [...anchors];
}

/** Reduce a coplanar, equal-depth patch to its outer contact witnesses. */
function reduceFlatBoxPatch(candidates: readonly SurfaceCandidate[], size: number, coordinates: number, depthTolerance: number): NativeConvexContact[] | undefined {
  const faces = candidates.filter((candidate) => candidate.face);
  if (faces.length < 4) return undefined;
  const deepest = faces.reduce((depth, candidate) => Math.max(depth, candidate.contact.penetration), 0);
  const reference = faces.find((candidate) => candidate.contact.penetration === deepest)!.contact;
  const competing = candidates.some((candidate) => candidate.contact.penetration >= deepest - depthTolerance &&
    Math.hypot(...subVec3(candidate.contact.normal, reference.normal)) > 1e-9);
  if (competing || candidates.some((candidate) => candidate.contact.penetration > deepest + depthTolerance)) return undefined;
  const patch = faces.filter((candidate) => candidate.contact.penetration >= deepest - depthTolerance &&
    Math.hypot(...subVec3(candidate.contact.normal, reference.normal)) <= 1e-9);
  if (patch.length < 4) return undefined;
  const n = reference.normal;
  const seed: Vec3 = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const raw: Vec3 = [n[1] * seed[2] - n[2] * seed[1], n[2] * seed[0] - n[0] * seed[2], n[0] * seed[1] - n[1] * seed[0]];
  const u = scaleVec3(raw, 1 / Math.hypot(...raw));
  const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const origin = patch[0]!.contact.point;
  const projected = patch.map((candidate) => {
    const point = subVec3(candidate.contact.point, origin);
    return { x: dotVec3(point, u), y: dotVec3(point, v), candidate };
  }).sort((a, b) => a.x - b.x || a.y - b.y);
  const precision = (size + coordinates) * Number.EPSILON * 64;
  const unique: typeof projected = [];
  for (const point of projected) {
    const previous = unique[unique.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > precision) unique.push(point);
  }
  if (unique.length < 3) return undefined;
  const turn = (a: typeof projected[number], b: typeof projected[number], c: typeof projected[number]) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const areaTolerance = size * precision;
  const lower: typeof projected = [], upper: typeof projected = [];
  for (const point of unique) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= areaTolerance) lower.pop();
    lower.push(point);
  }
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= areaTolerance) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) return undefined;
  if (hull.length <= 4) return hull.map((point) => point.candidate.contact);
  // Choose the farthest opposite point, then the widest remaining directions.
  const chosen = [0];
  let farthest = 1, distance = -1;
  for (let index = 1; index < hull.length; index += 1) {
    const next = (hull[index]!.x - hull[0]!.x) ** 2 + (hull[index]!.y - hull[0]!.y) ** 2;
    if (next > distance) { distance = next; farthest = index; }
  }
  chosen.push(farthest);
  let widest = -1, area = -1;
  for (let index = 0; index < hull.length; index += 1) {
    if (chosen.includes(index)) continue;
    const next = Math.abs(turn(hull[0]!, hull[farthest]!, hull[index]!));
    if (next > area) { area = next; widest = index; }
  }
  chosen.push(widest);
  let fourth = -1, quadrilateralArea = -1;
  for (let index = 0; index < hull.length; index += 1) {
    if (chosen.includes(index)) continue;
    const vertices = [...chosen, index].sort((a, b) => a - b).map((item) => hull[item]!);
    let next = 0;
    for (let edge = 0; edge < 4; edge += 1) next += vertices[edge]!.x * vertices[(edge + 1) % 4]!.y - vertices[(edge + 1) % 4]!.x * vertices[edge]!.y;
    if (Math.abs(next) > quadrilateralArea) { quadrilateralArea = Math.abs(next); fourth = index; }
  }
  return [...chosen, fourth].sort((a, b) => a - b).map((index) => hull[index]!.candidate.contact);
}

/** Return solid-to-surface contacts. Triangle winding does not make a back face nonphysical. */
export function collideSurface(solid: Solid, solidBody: RigidBody, surface: Surface, surfaceBody: RigidBody): NativeConvexContact[] {
  const bounds = Shape.bounds(solid, solidBody.position, solidBody.rotation);
  const solidSet = convexShape(solid, solidBody);
  const candidates: SurfaceCandidate[] = [];
  for (const triangle of nativeTriangles(surface, surfaceBody)) {
    if (!finiteTriangle(triangle)) continue;
    if ([0, 1, 2].some((axis) => {
      const min = Math.min(...triangle.map((point) => point[axis]!));
      const max = Math.max(...triangle.map((point) => point[axis]!));
      return bounds.max[axis]! < min - 1e-8 || bounds.min[axis]! > max + 1e-8;
    })) continue;
    const u = subVec3(triangle[1], triangle[0]), v = subVec3(triangle[2], triangle[0]);
    const raw: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const normal = scaleVec3(raw, 1 / Math.hypot(...raw));
    const low = dotVec3(subVec3(solidSet.support(scaleVec3(normal, -1)), triangle[0]), normal);
    const high = dotVec3(subVec3(solidSet.support(normal), triangle[0]), normal);
    const size = Math.max(...[0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!));
    const coordinateMagnitude = Math.max(...triangle.flatMap((point) => point.map(Math.abs)), ...solidBody.position.map(Math.abs));
    const planeTolerance = size * 1e-9 + coordinateMagnitude * Number.EPSILON * 16;
    if (low > planeTolerance || high < -planeTolerance) continue;
    const boxAxis = solid.kind === "box" ? boxTriangleAxis(solid, solidBody, triangle) : undefined;
    if (solid.kind === "box" && !boxAxis) continue;
    if (solid.kind === "box" && boxAxis && (Math.abs(dotVec3(boxAxis.normal, normal)) >= 1 - 1e-9 || boxAxis.penetration <= planeTolerance)) {
      const centerSide = dotVec3(subVec3(solidBody.position, triangle[0]), normal);
      const towardSurface = scaleVec3(normal, centerSide >= 0 ? -1 : 1);
      const reference: NativeConvexContact = { normal: towardSurface, penetration: boxAxis.penetration, point: triangle[0] };
      const faceContacts = boxTriangleManifold(solid, solidBody, triangle, reference);
      if (faceContacts.length > 0) {
        for (const point of faceContacts) candidates.push({ contact: point, triangle, face: true });
        if (Math.abs(dotVec3(boxAxis.normal, normal)) < 1 - 1e-9) {
          const face = faceContacts[0]!;
          const point = subVec3(face.point, scaleVec3(face.normal, face.penetration * 0.5));
          candidates.push({ contact: { normal: boxAxis.normal, penetration: boxAxis.penetration, point }, triangle, face: false, witness: point });
        }
        continue;
      }
    }
    const capsule = solid.kind === "capsule" ? capsuleTriangle(solid, solidBody, triangle) : undefined;
    if (capsule?.kind === "separated") continue;
    const generic = (): NativeConvexWitnessContact | undefined => {
      const polygon = localTrianglePolygon(triangle, bounds);
      if (polygon.length === 0) return undefined;
      let contact: NativeConvexWitnessContact | undefined;
      try {
        contact = convexWitnessContact(solidSet, convexPoints(polygon),
          solid.kind === "convex-hull" ? () => hullTriangleDirections(solid, solidBody, triangle) : undefined);
      } catch (error) {
        if (solid.kind === "convex-hull" && error instanceof Error && /^Native convex (intersection did not converge|penetration solver did not converge|penetration seed could not be established)\.$/.test(error.message)) {
          return hullTriangleAxisContact(solid, solidBody, triangle);
        }
        throw error;
      }
      if (!contact) return undefined;
      if (solid.kind !== "convex-hull") {
        if (contact.needsFeatureWitness) throw new Error("Native surface contact requires verified supporting features.");
        return contact;
      }
      // Even a converged generic solve must put its two witnesses on actual
      // supporting features. A shallow, nearly flat hull can otherwise
      // produce an interior point and understate the penetration.
      return hullTrianglePlaneWitness(solid, solidBody, triangle, contact.normal)
        ?? hullTriangleAxisContact(solid, solidBody, triangle);
    };
    const intersection = solid.kind === "sphere"
      ? sphereTriangle(solidBody.position, solid.radius, triangle)
      : capsule?.kind === "contact" ? capsule.contact : generic();
    if (!intersection) continue;
    const face = triangleFaceContact(solidSet, solidBody, triangle, intersection);
    const contact = face ?? { normal: intersection.normal, point: intersection.point, penetration: intersection.penetration };
    candidates.push({ contact, triangle, face: face !== undefined, witness: intersection.witnessB });
    if (solid.kind === "box") {
      for (const point of boxTriangleManifold(solid, solidBody, triangle, contact)) candidates.push({ contact: point, triangle, face: true });
    }
  }
  const size = Math.max(...[0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!));
  const coordinates = Math.max(...solidBody.position.map(Math.abs), ...surfaceBody.position.map(Math.abs));
  const duplicateTolerance = size * 1e-6 + coordinates * Number.EPSILON * 16;
  const depthTolerance = size * 1e-10 + coordinates * Number.EPSILON * 16;
  const faces = candidates.filter((candidate) => candidate.face);
  const visible = candidates.filter((candidate) => candidate.face || !faces.some((face) => coveredInternalEdge(candidate, face, solidBody.position, size, solid.kind === "sphere")));
  if (solid.kind === "box") {
    const patch = reduceFlatBoxPatch(visible, size, coordinates, depthTolerance);
    if (patch) return patch.sort((a, b) => a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.point[2] - b.point[2]);
  }
  const anchors = solid.kind === "box" ? boxFaceAnchors(faces) : faces;
  const contacts: SurfaceCandidate[] = [];
  for (const candidate of visible) {
    if (solid.kind === "box" && redundantBoxPoint(candidate, anchors, duplicateTolerance, depthTolerance)) continue;
    const contact = candidate.contact;
    const duplicate = contacts.findIndex((existing) => Math.hypot(
      existing.contact.point[0] - contact.point[0], existing.contact.point[1] - contact.point[1], existing.contact.point[2] - contact.point[2]
    ) < duplicateTolerance && Math.hypot(...subVec3(existing.contact.normal, contact.normal)) < 1e-9);
    if (duplicate < 0) contacts.push(candidate);
    else if (contact.penetration > contacts[duplicate]!.contact.penetration + depthTolerance ||
      (candidate.face && !contacts[duplicate]!.face && contact.penetration >= contacts[duplicate]!.contact.penetration - depthTolerance)) contacts[duplicate] = candidate;
  }
  const deepest = contacts.reduce((depth, candidate) => Math.max(depth, candidate.contact.penetration), 0);
  const depthBand = (candidate: SurfaceCandidate) => depthTolerance > 0 ? Math.floor((deepest - candidate.contact.penetration) / depthTolerance) : 0;
  return contacts.sort((a, b) => depthBand(a) - depthBand(b) || Number(b.face) - Number(a.face) ||
    b.contact.penetration - a.contact.penetration || a.contact.point[0] - b.contact.point[0] ||
    a.contact.point[1] - b.contact.point[1] || a.contact.point[2] - b.contact.point[2]
  ).slice(0, 4).map((candidate) => candidate.contact);
}

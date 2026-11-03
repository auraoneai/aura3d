import { addVec3, dotVec3, rotateVec3ByQuat, scaleVec3, subVec3, type PhysicsShape, type Vec3 } from "../Shape.js";
import type { RigidBody } from "../RigidBody.js";

/** A world-space support function for a finite convex set. */
export interface NativeConvexSet {
  readonly center: Vec3;
  support(direction: Vec3): Vec3;
}

export interface NativeConvexContact {
  readonly normal: Vec3;
  readonly point: Vec3;
  readonly penetration: number;
}

/** Contact plus the contributing points on each original convex set. */
export interface NativeConvexWitnessContact extends NativeConvexContact {
  readonly witnessA: Vec3;
  readonly witnessB: Vec3;
  /** A shallow supporting plane still needs verified source-feature witnesses. */
  readonly needsFeatureWitness?: true;
}

type ConvexShape = Extract<PhysicsShape, { kind: "box" | "sphere" | "capsule" | "convex-hull" }>;
type Support = { readonly point: Vec3; readonly a: Vec3; readonly b: Vec3 };
type Face = { readonly a: number; readonly b: number; readonly c: number; readonly normal: Vec3; readonly distance: number };
type Closest = { readonly points: readonly Support[]; readonly weights: readonly number[]; readonly point: Vec3 };

const tolerance = 1e-8;

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(value: Vec3, fallback: Vec3 = [1, 0, 0]): Vec3 {
  const length = Math.hypot(...value);
  return length > tolerance ? scaleVec3(value, 1 / length) : fallback;
}

/** Shapes are evaluated using all hull vertices, not the optional display triangulation. */
export function convexShape(shape: ConvexShape, body: RigidBody): NativeConvexSet {
  const inverse: readonly [number, number, number, number] = [-body.rotation[0], -body.rotation[1], -body.rotation[2], body.rotation[3]];
  return {
    center: body.position,
    support(direction) {
      const local = rotateVec3ByQuat(direction, inverse);
      let point: Vec3;
      if (shape.kind === "sphere") {
        point = scaleVec3(unit(local), shape.radius);
      } else if (shape.kind === "capsule") {
        point = addVec3(scaleVec3(unit(local), shape.radius), [0, local[1] >= 0 ? shape.halfHeight : -shape.halfHeight, 0]);
      } else if (shape.kind === "box") {
        point = [local[0] >= 0 ? shape.halfExtents[0] : -shape.halfExtents[0],
          local[1] >= 0 ? shape.halfExtents[1] : -shape.halfExtents[1],
          local[2] >= 0 ? shape.halfExtents[2] : -shape.halfExtents[2]];
      } else {
        let best = shape.vertices[0]!;
        let projection = dotVec3(best, local);
        for (let index = 1; index < shape.vertices.length; index += 1) {
          const candidate = shape.vertices[index]!;
          const next = dotVec3(candidate, local);
          if (next > projection) { best = candidate; projection = next; }
        }
        point = best;
      }
      return addVec3(body.position, rotateVec3ByQuat(point, body.rotation));
    }
  };
}

export function convexPoints(vertices: readonly Vec3[]): NativeConvexSet {
  if (vertices.length === 0) throw new Error("A convex point set needs at least one vertex.");
  const center: Vec3 = scaleVec3(vertices.reduce((sum, value) => addVec3(sum, value), [0, 0, 0] as Vec3), 1 / vertices.length);
  return {
    center,
    support(direction) {
      let best = vertices[0]!;
      let maximum = dotVec3(best, direction);
      for (let index = 1; index < vertices.length; index += 1) {
        const candidate = vertices[index]!;
        const projection = dotVec3(candidate, direction);
        if (projection > maximum) { best = candidate; maximum = projection; }
      }
      return best;
    }
  };
}

function support(a: NativeConvexSet, b: NativeConvexSet, direction: Vec3): Support {
  const pa = a.support(direction);
  const pb = b.support(scaleVec3(direction, -1));
  return { point: subVec3(pa, pb), a: pa, b: pb };
}

/** Solve a small linear system with pivoting; singular subsets have no unique minimum. */
function solve(matrix: number[][], right: number[]): number[] | undefined {
  const n = right.length;
  const rows = matrix.map((row, index) => [...row, right[index]!]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(rows[pivot]![column]!) < 1e-14) return undefined;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const diagonal = rows[column]![column]!;
    for (let j = column; j <= n; j += 1) rows[column]![j] = rows[column]![j]! / diagonal;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let j = column; j <= n; j += 1) rows[row]![j] = rows[row]![j]! - factor * rows[column]![j]!;
    }
  }
  return rows.map((row) => row[n]!);
}

/** Closest point on a simplex by minimizing squared distance on each of its faces. */
function closest(points: readonly Support[]): Closest {
  let best: Closest | undefined;
  let distance = Infinity;
  for (let mask = 1; mask < 1 << points.length; mask += 1) {
    const subset = points.filter((_, index) => (mask & (1 << index)) !== 0);
    const n = subset.length;
    let weights: number[];
    if (n === 1) weights = [1];
    else {
      const matrix = Array.from({ length: n + 1 }, () => Array<number>(n + 1).fill(0));
      for (let row = 0; row < n; row += 1) {
        for (let column = 0; column < n; column += 1) matrix[row]![column] = dotVec3(subset[row]!.point, subset[column]!.point);
        matrix[row]![n] = 1;
        matrix[n]![row] = 1;
      }
      const solution = solve(matrix, [...Array<number>(n).fill(0), 1]);
      if (!solution || solution.slice(0, n).some((weight) => weight < -tolerance)) continue;
      weights = solution.slice(0, n).map((weight) => Math.max(0, weight));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      weights = weights.map((weight) => weight / total);
    }
    const point = subset.reduce((sum, value, index) => addVec3(sum, scaleVec3(value.point, weights[index]!)), [0, 0, 0] as Vec3);
    const next = dotVec3(point, point);
    if (next < distance - 1e-20) { best = { points: subset, weights, point }; distance = next; }
  }
  return best!;
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tolerance;
}

function witnesses(points: readonly Support[], weights: readonly number[]): { a: Vec3; b: Vec3 } {
  let a: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    a = addVec3(a, scaleVec3(points[index]!.a, weights[index]!));
    b = addVec3(b, scaleVec3(points[index]!.b, weights[index]!));
  }
  return { a, b };
}

function tetrahedron(points: readonly Support[]): readonly Support[] | undefined {
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
    for (let c = b + 1; c < points.length; c += 1) for (let d = c + 1; d < points.length; d += 1) {
      const subset = [points[a]!, points[b]!, points[c]!, points[d]!];
      const coefficients = solve([
        subset.map((point) => point.point[0]), subset.map((point) => point.point[1]),
        subset.map((point) => point.point[2]), [1, 1, 1, 1]
      ], [0, 0, 0, 1]);
      if (coefficients && coefficients.every((weight) => weight > 1e-7)) return subset;
    }
  }
  return undefined;
}

function makeFace(vertices: readonly Support[], a: number, b: number, c: number): Face | undefined {
  const edge1 = subVec3(vertices[b]!.point, vertices[a]!.point);
  const edge2 = subVec3(vertices[c]!.point, vertices[a]!.point);
  const raw = cross(edge1, edge2);
  const magnitude = Math.hypot(...raw);
  if (magnitude < 1e-12) return undefined;
  let normal = scaleVec3(raw, 1 / magnitude);
  let distance = dotVec3(normal, vertices[a]!.point);
  if (distance < 0) { [b, c] = [c, b]; normal = scaleVec3(normal, -1); distance = -distance; }
  return { a, b, c, normal, distance };
}

function faceContact(face: Face, vertices: readonly Support[]): NativeConvexWitnessContact {
  const nearest = closest([vertices[face.a]!, vertices[face.b]!, vertices[face.c]!]);
  const points = witnesses(nearest.points, nearest.weights);
  return { normal: face.normal, point: scaleVec3(addVec3(points.a, points.b), 0.5), penetration: Math.max(0, face.distance), witnessA: points.a, witnessB: points.b };
}

function expand(a: NativeConvexSet, b: NativeConvexSet, initial: readonly Support[]): NativeConvexWitnessContact | undefined {
  const vertices = [...initial];
  let faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]
    .map(([i, j, k]) => makeFace(vertices, i!, j!, k!)).filter((face): face is Face => face !== undefined);
  for (let iteration = 0; iteration < 128 && faces.length > 0; iteration += 1) {
    faces.sort((left, right) => left.distance - right.distance || left.a - right.a || left.b - right.b || left.c - right.c);
    const face = faces[0]!;
    const next = support(a, b, face.normal);
    const advance = dotVec3(next.point, face.normal) - face.distance;
    if (advance <= 1e-6 || vertices.some((vertex) => samePoint(vertex.point, next.point))) return faceContact(face, vertices);
    const boundary: Array<[number, number]> = [];
    const remaining: Face[] = [];
    for (const candidate of faces) {
      if (dotVec3(candidate.normal, subVec3(next.point, vertices[candidate.a]!.point)) <= 1e-9) {
        remaining.push(candidate);
        continue;
      }
      for (const [from, to] of [[candidate.a, candidate.b], [candidate.b, candidate.c], [candidate.c, candidate.a]] as const) {
        const reverse = boundary.findIndex(([first, second]) => first === to && second === from);
        if (reverse >= 0) boundary.splice(reverse, 1); else boundary.push([from, to]);
      }
    }
    if (boundary.length === 0) return faceContact(face, vertices);
    const index = vertices.push(next) - 1;
    for (const [from, to] of boundary) {
      const added = makeFace(vertices, from, to, index);
      if (added) remaining.push(added);
    }
    faces = remaining;
  }
  return undefined;
}

function convexContactNormalized(a: NativeConvexSet, b: NativeConvexSet, tangentDirections?: () => readonly Vec3[]): NativeConvexWitnessContact | undefined {
  let direction = subVec3(b.center, a.center);
  if (Math.hypot(...direction) < tolerance) direction = [1, 0, 0];
  let simplex: readonly Support[] = [support(a, b, direction)];
  let nearest = closest(simplex);
  let hit = false;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const distance = Math.hypot(...nearest.point);
    if (distance <= tolerance) { hit = true; break; }
    direction = scaleVec3(nearest.point, -1 / distance);
    const next = support(a, b, direction);
    const projection = dotVec3(next.point, direction);
    if (projection < -tolerance) return undefined;
    if (simplex.some((point) => samePoint(point.point, next.point))) {
      if (distance <= tolerance) { hit = true; break; }
      return undefined;
    }
    simplex = [...nearest.points, next];
    nearest = closest(simplex);
  }
  if (!hit) throw new Error("Native convex intersection did not converge.");

  const pool = [...nearest.points];
  const directions: Vec3[] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
  ];
  for (const axis of directions) {
    const point = support(a, b, axis);
    if (!pool.some((candidate) => samePoint(candidate.point, point.point))) pool.push(point);
  }
  const tetra = tetrahedron(pool);
  if (tetra) {
    const expanded = expand(a, b, tetra);
    if (expanded) return expanded;
    throw new Error("Native convex penetration solver did not converge.");
  }
  // Without an enclosing tetrahedron, only report tangency if an actual
  // supporting plane is within the solver's contact tolerance of the origin.
  // Otherwise the available seed does not prove a zero-depth intersection.
  let normal = unit(direction);
  let distance = dotVec3(support(a, b, normal).point, normal);
  for (const axis of directions) {
    const candidate = unit(axis);
    const next = dotVec3(support(a, b, candidate).point, candidate);
    if (next < distance) { normal = candidate; distance = next; }
  }
  // A tangent support plane passes through the origin. Pairs of sampled
  // Minkowski vertices can identify its orientation even after the geometry
  // has been rotated away from the fixed probe directions.
  for (let i = 0; i < pool.length; i += 1) for (let j = i + 1; j < pool.length; j += 1) {
    const raw = cross(pool[i]!.point, pool[j]!.point);
    const magnitude = Math.hypot(...raw);
    if (magnitude <= 1e-12) continue;
    const axis = scaleVec3(raw, 1 / magnitude);
    for (const sign of [-1, 1]) {
      const candidate = scaleVec3(axis, sign);
      const next = dotVec3(support(a, b, candidate).point, candidate);
      if (next < distance) { normal = candidate; distance = next; }
    }
  }
  for (const raw of tangentDirections?.() ?? []) {
    const magnitude = Math.hypot(...raw);
    if (magnitude <= 1e-12) continue;
    const axis = scaleVec3(raw, 1 / magnitude);
    for (const sign of [-1, 1]) {
      const candidate = scaleVec3(axis, sign);
      const next = dotVec3(support(a, b, candidate).point, candidate);
      if (next < distance) { normal = candidate; distance = next; }
    }
  }
  if (distance < -tolerance) return undefined;
  if (distance > 1e-12 && (!tangentDirections || distance > 1e-6)) {
    throw new Error("Native convex penetration seed could not be established.");
  }
  const points = witnesses(nearest.points, nearest.weights);
  return { normal, point: scaleVec3(addVec3(points.a, points.b), 0.5), penetration: Math.max(0, distance), witnessA: points.a, witnessB: points.b,
    ...(distance > 1e-12 ? { needsFeatureWitness: true as const } : {}) };
}

/**
 * Solve in a translated, scale-normalized frame so tolerances describe relative
 * geometric precision rather than fixed world units. Witnesses remain world-space.
 */
export function convexWitnessContact(a: NativeConvexSet, b: NativeConvexSet, tangentDirections?: () => readonly Vec3[]): NativeConvexWitnessContact | undefined {
  const axes: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let scale = 0;
  for (const shape of [a, b]) for (const axis of axes) {
    const extent = dotVec3(subVec3(shape.support(axis), shape.support(scaleVec3(axis, -1))), axis);
    scale = Math.max(scale, extent);
  }
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Native convex geometry has no finite extent.");
  const origin = a.center;
  const toLocal = (point: Vec3): Vec3 => scaleVec3(subVec3(point, origin), 1 / scale);
  const toWorld = (point: Vec3): Vec3 => addVec3(origin, scaleVec3(point, scale));
  const normalized = (set: NativeConvexSet): NativeConvexSet => ({
    center: toLocal(set.center),
    support(direction) { return toLocal(set.support(direction)); }
  });
  const hit = convexContactNormalized(normalized(a), normalized(b), tangentDirections);
  if (!hit) return undefined;
  return {
    normal: hit.normal,
    point: toWorld(hit.point),
    penetration: hit.penetration * scale,
    witnessA: toWorld(hit.witnessA),
    witnessB: toWorld(hit.witnessB),
    ...(hit.needsFeatureWitness ? { needsFeatureWitness: true as const } : {})
  };
}

/** Intersect two support-mapped solids and return a world-space separating contact. */
export function convexContact(a: NativeConvexSet, b: NativeConvexSet): NativeConvexContact | undefined {
  const hit = convexWitnessContact(a, b);
  return hit && { normal: hit.normal, point: hit.point, penetration: hit.penetration };
}

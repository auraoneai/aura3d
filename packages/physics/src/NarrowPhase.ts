import type { Collider } from "./Collider.js";
import type { RigidBody } from "./RigidBody.js";
import {
  addVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  rotateVec3ByQuat,
  scaleVec3,
  subVec3,
  type ConvexHullShape,
  type HeightfieldShape,
  type MeshShape,
  type PhysicsShape,
  type Vec3
} from "./Shape.js";

export interface NativeNarrowPhaseContact {
  readonly normal: Vec3;
  readonly penetration: number;
  readonly point: Vec3;
  readonly algorithm: "obb-sat" | "gjk-epa" | "triangle-mesh" | "heightfield-triangles";
}

interface WorldPolyhedron {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly (readonly [number, number, number])[];
  readonly edges: readonly (readonly [number, number])[];
  readonly center: Vec3;
}

interface SupportPoint {
  readonly point: Vec3;
  readonly pointA: Vec3;
  readonly pointB: Vec3;
}

interface EpaFace {
  readonly indices: readonly [number, number, number];
  readonly normal: Vec3;
  readonly distance: number;
}

const BOX_FACES: readonly (readonly [number, number, number])[] = [
  [0, 2, 1], [0, 3, 2],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [3, 7, 6], [3, 6, 2],
  [0, 4, 7], [0, 7, 3],
  [1, 2, 6], [1, 6, 5]
];
const BOX_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];
const EPSILON = 1e-8;

export function buildNativeNarrowPhaseContact(
  colliderA: Collider,
  bodyA: RigidBody,
  colliderB: Collider,
  bodyB: RigidBody
): NativeNarrowPhaseContact | undefined {
  if (colliderA.shape.kind === "box" && colliderB.shape.kind === "box") {
    const polyA = boxPolyhedron(colliderA.shape.halfExtents, bodyA);
    const polyB = boxPolyhedron(colliderB.shape.halfExtents, bodyB);
    const result = satPolyhedra(polyA, polyB);
    return result ? { ...result, algorithm: "obb-sat" } : undefined;
  }

  if (isConvexSolid(colliderA.shape) && isConvexSolid(colliderB.shape)) {
    const polyA = convexPolyhedron(colliderA.shape, bodyA);
    const polyB = convexPolyhedron(colliderB.shape, bodyB);
    const gjkSimplex = gjkIntersection(polyA, polyB);
    if (!gjkSimplex) return undefined;
    const epa = epaPenetration(polyA, polyB, gjkSimplex) ?? satPolyhedra(polyA, polyB);
    return epa ? { ...epa, algorithm: "gjk-epa" } : undefined;
  }

  const meshA = isTriangleSurface(colliderA.shape);
  const meshB = isTriangleSurface(colliderB.shape);
  if (meshA === meshB) return undefined;
  const surfaceShape = meshA
    ? colliderA.shape as MeshShape | HeightfieldShape
    : colliderB.shape as MeshShape | HeightfieldShape;
  const surfaceBody = meshA ? bodyA : bodyB;
  const solidShape = meshA ? colliderB.shape : colliderA.shape;
  const solidBody = meshA ? bodyB : bodyA;
  const solidIsA = !meshA;
  const contact = collideSolidWithSurface(solidShape, solidBody, surfaceShape, surfaceBody);
  if (!contact) return undefined;
  return {
    normal: solidIsA ? contact.normal : scaleVec3(contact.normal, -1),
    penetration: contact.penetration,
    point: contact.point,
    algorithm: surfaceShape.kind === "heightfield" ? "heightfield-triangles" : "triangle-mesh"
  };
}

function isConvexSolid(shape: PhysicsShape): shape is Extract<PhysicsShape, { kind: "box" | "convex-hull" }> {
  return shape.kind === "box" || shape.kind === "convex-hull";
}

function isTriangleSurface(shape: PhysicsShape): shape is MeshShape | HeightfieldShape {
  return shape.kind === "mesh" || shape.kind === "heightfield";
}

function boxPolyhedron(halfExtents: Vec3, body: RigidBody): WorldPolyhedron {
  const [x, y, z] = halfExtents;
  const local: readonly Vec3[] = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
  return {
    vertices: local.map((vertex) => worldPoint(vertex, body)),
    faces: BOX_FACES,
    edges: BOX_EDGES,
    center: [...body.position]
  };
}

function convexPolyhedron(shape: Extract<PhysicsShape, { kind: "box" | "convex-hull" }>, body: RigidBody): WorldPolyhedron {
  if (shape.kind === "box") return boxPolyhedron(shape.halfExtents, body);
  const faces: Array<readonly [number, number, number]> = [];
  for (let offset = 0; offset < shape.indices.length; offset += 3) {
    faces.push([shape.indices[offset]!, shape.indices[offset + 1]!, shape.indices[offset + 2]!]);
  }
  return {
    vertices: shape.vertices.map((vertex) => worldPoint(vertex, body)),
    faces,
    edges: uniqueEdges(faces),
    center: worldPoint(centroid(shape.vertices), body)
  };
}

function satPolyhedra(a: WorldPolyhedron, b: WorldPolyhedron): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  const axes: Vec3[] = [
    ...faceAxes(a),
    ...faceAxes(b)
  ];
  const edgesA = edgeDirections(a);
  const edgesB = edgeDirections(b);
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      const axis = cross(edgeA, edgeB);
      if (lengthVec3(axis) > EPSILON) axes.push(normalizeVec3(axis));
    }
  }
  return minimumOverlapContact(a, b, axes);
}

function minimumOverlapContact(
  a: WorldPolyhedron,
  b: WorldPolyhedron,
  axes: readonly Vec3[]
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  let minimumOverlap = Number.POSITIVE_INFINITY;
  let minimumAxis: Vec3 = [1, 0, 0];
  for (const candidate of axes) {
    if (lengthVec3(candidate) <= EPSILON) continue;
    const axis = normalizeVec3(candidate);
    const projectionA = project(a.vertices, axis);
    const projectionB = project(b.vertices, axis);
    const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    if (overlap <= EPSILON) return undefined;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = axis;
    }
  }
  if (!Number.isFinite(minimumOverlap)) return undefined;
  const centerDelta = subVec3(b.center, a.center);
  const normal = dotVec3(centerDelta, minimumAxis) < 0 ? scaleVec3(minimumAxis, -1) : minimumAxis;
  const point = opposingSupportContactPoint(a.vertices, b.vertices, normal);
  return {
    normal,
    penetration: minimumOverlap,
    point
  };
}

function gjkIntersection(a: WorldPolyhedron, b: WorldPolyhedron): readonly SupportPoint[] | undefined {
  let direction: Vec3 = subVec3(b.center, a.center);
  if (lengthVec3(direction) <= EPSILON) direction = [1, 0, 0];
  const simplex: SupportPoint[] = [minkowskiSupport(a, b, direction)];
  direction = scaleVec3(simplex[0]!.point, -1);
  for (let iteration = 0; iteration < 32; iteration += 1) {
    if (lengthVec3(direction) <= EPSILON) direction = [1, 0, 0];
    const next = minkowskiSupport(a, b, direction);
    if (dotVec3(next.point, direction) < EPSILON) return undefined;
    simplex.push(next);
    const update = updateSimplex(simplex);
    if (update.containsOrigin) return simplex;
    direction = update.direction;
  }
  return undefined;
}

function updateSimplex(simplex: SupportPoint[]): { readonly containsOrigin: boolean; readonly direction: Vec3 } {
  const a = simplex[simplex.length - 1]!.point;
  const ao = scaleVec3(a, -1);
  if (simplex.length === 2) {
    const b = simplex[0]!.point;
    const ab = subVec3(b, a);
    if (dotVec3(ab, ao) > 0) return { containsOrigin: false, direction: tripleCross(ab, ao, ab) };
    simplex.splice(0, 1);
    return { containsOrigin: false, direction: ao };
  }
  if (simplex.length === 3) {
    const b = simplex[1]!.point;
    const c = simplex[0]!.point;
    const ab = subVec3(b, a);
    const ac = subVec3(c, a);
    const abc = cross(ab, ac);
    if (dotVec3(cross(abc, ac), ao) > 0) {
      if (dotVec3(ac, ao) > 0) {
        simplex.splice(1, 1);
        return { containsOrigin: false, direction: tripleCross(ac, ao, ac) };
      }
      simplex.splice(0, 1);
      return updateSimplex(simplex);
    }
    if (dotVec3(cross(ab, abc), ao) > 0) {
      simplex.splice(0, 1);
      return updateSimplex(simplex);
    }
    if (dotVec3(abc, ao) > 0) return { containsOrigin: false, direction: abc };
    [simplex[0], simplex[1]] = [simplex[1]!, simplex[0]!];
    return { containsOrigin: false, direction: scaleVec3(abc, -1) };
  }
  const b = simplex[2]!.point;
  const c = simplex[1]!.point;
  const d = simplex[0]!.point;
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const ad = subVec3(d, a);
  const abc = outwardFaceNormal(a, b, c, d);
  const acd = outwardFaceNormal(a, c, d, b);
  const adb = outwardFaceNormal(a, d, b, c);
  if (dotVec3(abc, ao) > 0) {
    simplex.splice(0, 1);
    return { containsOrigin: false, direction: abc };
  }
  if (dotVec3(acd, ao) > 0) {
    simplex.splice(2, 1);
    return { containsOrigin: false, direction: acd };
  }
  if (dotVec3(adb, ao) > 0) {
    simplex.splice(1, 1);
    return { containsOrigin: false, direction: adb };
  }
  return { containsOrigin: true, direction: [0, 0, 0] };
}

function epaPenetration(
  a: WorldPolyhedron,
  b: WorldPolyhedron,
  simplex: readonly SupportPoint[]
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  if (simplex.length < 4) return undefined;
  const vertices = [...simplex.slice(-4)];
  let faces = [
    createEpaFace(vertices, [0, 1, 2]),
    createEpaFace(vertices, [0, 3, 1]),
    createEpaFace(vertices, [0, 2, 3]),
    createEpaFace(vertices, [1, 3, 2])
  ].filter((face): face is EpaFace => face !== undefined);
  for (let iteration = 0; iteration < 48; iteration += 1) {
    faces.sort((left, right) => left.distance - right.distance);
    const closest = faces[0];
    if (!closest) return undefined;
    const support = minkowskiSupport(a, b, closest.normal);
    const supportDistance = dotVec3(support.point, closest.normal);
    if (supportDistance - closest.distance <= 1e-6) {
      const centerDelta = subVec3(b.center, a.center);
      const normal = dotVec3(centerDelta, closest.normal) < 0 ? scaleVec3(closest.normal, -1) : closest.normal;
      return {
        normal,
        penetration: Math.max(closest.distance, EPSILON),
        point: opposingSupportContactPoint(a.vertices, b.vertices, normal)
      };
    }
    const newIndex = vertices.push(support) - 1;
    const visible = faces.filter((face) => dotVec3(face.normal, subVec3(support.point, vertices[face.indices[0]]!.point)) > 1e-7);
    const boundary = boundaryEdges(visible);
    faces = faces.filter((face) => !visible.includes(face));
    for (const [from, to] of boundary) {
      const face = createEpaFace(vertices, [from, to, newIndex]);
      if (face) faces.push(face);
    }
  }
  return undefined;
}

function collideSolidWithSurface(
  solidShape: PhysicsShape,
  solidBody: RigidBody,
  surfaceShape: MeshShape | HeightfieldShape,
  surfaceBody: RigidBody
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  const triangles = surfaceTriangles(surfaceShape, surfaceBody);
  let best: Omit<NativeNarrowPhaseContact, "algorithm"> | undefined;
  for (const triangle of triangles) {
    const contact = solidShape.kind === "sphere"
      ? sphereTriangleContact(solidBody.position, solidShape.radius, triangle)
      : solidShape.kind === "capsule"
        ? capsuleTriangleContact(solidBody, solidShape.radius, solidShape.halfHeight, triangle)
      : isConvexSolid(solidShape)
        ? polyhedronTriangleContact(convexPolyhedron(solidShape, solidBody), triangle)
        : undefined;
    if (contact && (!best || contact.penetration > best.penetration)) best = contact;
  }
  return best;
}

function capsuleTriangleContact(
  body: RigidBody,
  radius: number,
  halfHeight: number,
  triangle: readonly [Vec3, Vec3, Vec3]
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  const axis = rotateVec3ByQuat([0, halfHeight, 0], body.rotation);
  const start = subVec3(body.position, axis);
  const end = addVec3(body.position, axis);
  const candidates: Array<{ readonly segment: Vec3; readonly triangle: Vec3 }> = [
    { segment: start, triangle: closestPointOnTriangle(start, ...triangle) },
    { segment: end, triangle: closestPointOnTriangle(end, ...triangle) }
  ];
  for (const vertex of triangle) {
    candidates.push({ segment: closestPointOnSegment(vertex, start, end), triangle: vertex });
  }
  const planeNormal = normalizeOr(cross(subVec3(triangle[1], triangle[0]), subVec3(triangle[2], triangle[0])), [0, 1, 0]);
  const denominator = dotVec3(planeNormal, subVec3(end, start));
  if (Math.abs(denominator) > EPSILON) {
    const t = dotVec3(planeNormal, subVec3(triangle[0], start)) / denominator;
    if (t >= 0 && t <= 1) {
      const point = addVec3(start, scaleVec3(subVec3(end, start), t));
      const trianglePoint = closestPointOnTriangle(point, ...triangle);
      if (lengthVec3(subVec3(point, trianglePoint)) <= 1e-7) candidates.push({ segment: point, triangle: trianglePoint });
    }
  }
  const closest = candidates.reduce((best, candidate) =>
    squaredDistance(candidate.segment, candidate.triangle) < squaredDistance(best.segment, best.triangle) ? candidate : best
  );
  const delta = subVec3(closest.triangle, closest.segment);
  const distance = lengthVec3(delta);
  if (distance >= radius) return undefined;
  return {
    normal: distance > EPSILON ? scaleVec3(delta, 1 / distance) : orientToward(planeNormal, subVec3(centroid(triangle), body.position)),
    penetration: radius - distance,
    point: closest.triangle
  };
}

function sphereTriangleContact(
  center: Vec3,
  radius: number,
  triangle: readonly [Vec3, Vec3, Vec3]
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  const point = closestPointOnTriangle(center, triangle[0], triangle[1], triangle[2]);
  const delta = subVec3(point, center);
  const distance = lengthVec3(delta);
  if (distance >= radius) return undefined;
  const triangleNormal = normalizeOr(cross(subVec3(triangle[1], triangle[0]), subVec3(triangle[2], triangle[0])), [0, 1, 0]);
  return {
    normal: distance > EPSILON ? scaleVec3(delta, 1 / distance) : orientToward(triangleNormal, subVec3(centroid(triangle), center)),
    penetration: radius - distance,
    point
  };
}

function polyhedronTriangleContact(
  poly: WorldPolyhedron,
  triangle: readonly [Vec3, Vec3, Vec3]
): Omit<NativeNarrowPhaseContact, "algorithm"> | undefined {
  const triangleCenter = centroid(triangle);
  let triangleNormal = normalizeOr(cross(subVec3(triangle[1], triangle[0]), subVec3(triangle[2], triangle[0])), [0, 1, 0]);
  const plane = dotVec3(triangleNormal, triangle[0]);
  const distances = poly.vertices.map((vertex) => dotVec3(triangleNormal, vertex) - plane);
  const centerDistance = dotVec3(triangleNormal, poly.center) - plane;
  const penetration = centerDistance >= 0 ? -Math.min(...distances) : Math.max(...distances);
  if (penetration <= EPSILON) return undefined;
  triangleNormal = centerDistance >= 0 ? scaleVec3(triangleNormal, -1) : triangleNormal;

  const triangleEdges: Vec3[] = [
    subVec3(triangle[1], triangle[0]),
    subVec3(triangle[2], triangle[1]),
    subVec3(triangle[0], triangle[2])
  ];
  const axes = [...faceAxes(poly)];
  for (const triangleEdge of triangleEdges) {
    axes.push(normalizeOr(cross(triangleEdge, triangleNormal), [1, 0, 0]));
    for (const polyEdge of edgeDirections(poly)) {
      const axis = cross(triangleEdge, polyEdge);
      if (lengthVec3(axis) > EPSILON) axes.push(normalizeVec3(axis));
    }
  }
  for (const axis of axes) {
    const projectionPoly = project(poly.vertices, axis);
    const projectionTriangle = project(triangle, axis);
    if (Math.min(projectionPoly.max, projectionTriangle.max) - Math.max(projectionPoly.min, projectionTriangle.min) < -EPSILON) {
      return undefined;
    }
  }
  const support = supportVertex(poly.vertices, triangleNormal);
  const point = closestPointOnTriangle(support, triangle[0], triangle[1], triangle[2]);
  return {
    normal: orientToward(triangleNormal, subVec3(triangleCenter, poly.center)),
    penetration,
    point
  };
}

function surfaceTriangles(shape: MeshShape | HeightfieldShape, body: RigidBody): readonly (readonly [Vec3, Vec3, Vec3])[] {
  if (shape.kind === "mesh") {
    const triangles: Array<readonly [Vec3, Vec3, Vec3]> = [];
    for (let offset = 0; offset < shape.indices.length; offset += 3) {
      triangles.push([
        worldPoint(shape.vertices[shape.indices[offset]!]!, body),
        worldPoint(shape.vertices[shape.indices[offset + 1]!]!, body),
        worldPoint(shape.vertices[shape.indices[offset + 2]!]!, body)
      ]);
    }
    return triangles;
  }
  const triangles: Array<readonly [Vec3, Vec3, Vec3]> = [];
  const halfWidth = (shape.columns - 1) * shape.cellSize * 0.5;
  const halfDepth = (shape.rows - 1) * shape.cellSize * 0.5;
  const sample = (row: number, column: number): Vec3 => worldPoint([
    column * shape.cellSize - halfWidth,
    shape.heights[row * shape.columns + column]!,
    row * shape.cellSize - halfDepth
  ], body);
  for (let row = 0; row < shape.rows - 1; row += 1) {
    for (let column = 0; column < shape.columns - 1; column += 1) {
      const a = sample(row, column);
      const b = sample(row, column + 1);
      const c = sample(row + 1, column);
      const d = sample(row + 1, column + 1);
      triangles.push([a, c, b], [b, c, d]);
    }
  }
  return triangles;
}

function faceAxes(poly: WorldPolyhedron): Vec3[] {
  const axes: Vec3[] = [];
  for (const [a, b, c] of poly.faces) {
    const normal = cross(subVec3(poly.vertices[b]!, poly.vertices[a]!), subVec3(poly.vertices[c]!, poly.vertices[a]!));
    if (lengthVec3(normal) > EPSILON) axes.push(normalizeVec3(normal));
  }
  return uniqueAxes(axes);
}

function edgeDirections(poly: WorldPolyhedron): Vec3[] {
  return uniqueAxes(poly.edges.map(([a, b]) => normalizeOr(subVec3(poly.vertices[b]!, poly.vertices[a]!), [1, 0, 0])));
}

function uniqueEdges(faces: readonly (readonly [number, number, number])[]): readonly (readonly [number, number])[] {
  const keys = new Set<string>();
  const edges: Array<readonly [number, number]> = [];
  for (const [a, b, c] of faces) {
    for (const [left, right] of [[a, b], [b, c], [c, a]] as const) {
      const edge: readonly [number, number] = left < right ? [left, right] : [right, left];
      const key = `${edge[0]}:${edge[1]}`;
      if (!keys.has(key)) {
        keys.add(key);
        edges.push(edge);
      }
    }
  }
  return edges;
}

function uniqueAxes(axes: readonly Vec3[]): Vec3[] {
  const unique: Vec3[] = [];
  for (const axis of axes) {
    if (!unique.some((candidate) => Math.abs(dotVec3(candidate, axis)) > 0.999999)) unique.push(axis);
  }
  return unique;
}

function minkowskiSupport(a: WorldPolyhedron, b: WorldPolyhedron, direction: Vec3): SupportPoint {
  const pointA = supportVertex(a.vertices, direction);
  const pointB = supportVertex(b.vertices, scaleVec3(direction, -1));
  return { point: subVec3(pointA, pointB), pointA, pointB };
}

function supportVertex(vertices: readonly Vec3[], direction: Vec3): Vec3 {
  let best = vertices[0]!;
  let bestProjection = dotVec3(best, direction);
  for (let index = 1; index < vertices.length; index += 1) {
    const projection = dotVec3(vertices[index]!, direction);
    if (projection > bestProjection) {
      best = vertices[index]!;
      bestProjection = projection;
    }
  }
  return best;
}

function opposingSupportContactPoint(verticesA: readonly Vec3[], verticesB: readonly Vec3[], normal: Vec3): Vec3 {
  const featureA = supportFeature(verticesA, normal);
  const featureB = supportFeature(verticesB, scaleVec3(normal, -1));
  const selected = featureA.spread <= featureB.spread ? featureA.point : featureB.point;
  const middlePlane = (dotVec3(featureA.point, normal) + dotVec3(featureB.point, normal)) * 0.5;
  return addVec3(selected, scaleVec3(normal, middlePlane - dotVec3(selected, normal)));
}

function supportFeature(vertices: readonly Vec3[], direction: Vec3): { readonly point: Vec3; readonly spread: number } {
  const maximum = Math.max(...vertices.map((vertex) => dotVec3(vertex, direction)));
  const support = vertices.filter((vertex) => maximum - dotVec3(vertex, direction) <= 1e-7);
  const point = centroid(support);
  const spread = support.reduce((sum, vertex) => sum + squaredDistance(vertex, point), 0);
  return { point, spread };
}

function project(vertices: readonly Vec3[], axis: Vec3): { readonly min: number; readonly max: number } {
  let min = dotVec3(vertices[0]!, axis);
  let max = min;
  for (let index = 1; index < vertices.length; index += 1) {
    const value = dotVec3(vertices[index]!, axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function createEpaFace(vertices: readonly SupportPoint[], indices: readonly [number, number, number]): EpaFace | undefined {
  const a = vertices[indices[0]]!.point;
  const b = vertices[indices[1]]!.point;
  const c = vertices[indices[2]]!.point;
  let normal = cross(subVec3(b, a), subVec3(c, a));
  if (lengthVec3(normal) <= EPSILON) return undefined;
  normal = normalizeVec3(normal);
  let distance = dotVec3(normal, a);
  let orientedIndices = indices;
  if (distance < 0) {
    normal = scaleVec3(normal, -1);
    distance = -distance;
    orientedIndices = [indices[0], indices[2], indices[1]];
  }
  return { indices: orientedIndices, normal, distance };
}

function boundaryEdges(faces: readonly EpaFace[]): readonly (readonly [number, number])[] {
  const edges: Array<readonly [number, number]> = [];
  for (const face of faces) {
    for (const edge of [
      [face.indices[0], face.indices[1]],
      [face.indices[1], face.indices[2]],
      [face.indices[2], face.indices[0]]
    ] as const) {
      const reverse = edges.findIndex((candidate) => candidate[0] === edge[1] && candidate[1] === edge[0]);
      if (reverse >= 0) edges.splice(reverse, 1);
      else edges.push(edge);
    }
  }
  return edges;
}

function worldPoint(local: Vec3, body: RigidBody): Vec3 {
  return addVec3(body.position, rotateVec3ByQuat(local, body.rotation));
}

function centroid(points: readonly Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((value, point) => addVec3(value, point), [0, 0, 0]);
  return scaleVec3(sum, 1 / points.length);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function tripleCross(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const result = cross(cross(a, b), c);
  return lengthVec3(result) > EPSILON ? result : perpendicular(c);
}

function perpendicular(value: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(value[0]) < Math.abs(value[1]) ? [1, 0, 0] : [0, 1, 0];
  return normalizeOr(cross(value, reference), [0, 0, 1]);
}

function outwardFaceNormal(a: Vec3, b: Vec3, c: Vec3, opposite: Vec3): Vec3 {
  let normal = normalizeOr(cross(subVec3(b, a), subVec3(c, a)), [1, 0, 0]);
  if (dotVec3(normal, subVec3(opposite, a)) > 0) normal = scaleVec3(normal, -1);
  return normal;
}

function orientToward(normal: Vec3, direction: Vec3): Vec3 {
  return dotVec3(normal, direction) < 0 ? scaleVec3(normal, -1) : normal;
}

function normalizeOr(value: Vec3, fallback: Vec3): Vec3 {
  return lengthVec3(value) > EPSILON ? normalizeVec3(value) : fallback;
}

function closestPointOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const ap = subVec3(point, a);
  const d1 = dotVec3(ab, ap);
  const d2 = dotVec3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = subVec3(point, b);
  const d3 = dotVec3(ab, bp);
  const d4 = dotVec3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return addVec3(a, scaleVec3(ab, d1 / (d1 - d3)));
  const cp = subVec3(point, c);
  const d5 = dotVec3(ab, cp);
  const d6 = dotVec3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return addVec3(a, scaleVec3(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return addVec3(b, scaleVec3(subVec3(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return addVec3(a, addVec3(scaleVec3(ab, v), scaleVec3(ac, w)));
}

function closestPointOnSegment(point: Vec3, start: Vec3, end: Vec3): Vec3 {
  const direction = subVec3(end, start);
  const denominator = dotVec3(direction, direction);
  if (denominator <= EPSILON) return start;
  const t = Math.max(0, Math.min(1, dotVec3(subVec3(point, start), direction) / denominator));
  return addVec3(start, scaleVec3(direction, t));
}

function squaredDistance(a: Vec3, b: Vec3): number {
  const delta = subVec3(a, b);
  return dotVec3(delta, delta);
}

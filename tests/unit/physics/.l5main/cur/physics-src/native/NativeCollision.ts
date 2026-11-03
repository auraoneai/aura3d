import type { Collider } from "../Collider.js";
import type { RigidBody } from "../RigidBody.js";
import { Shape, addVec3, dotVec3, rotateVec3ByQuat, scaleVec3, subVec3, type BoxShape, type PhysicsShape, type Vec3 } from "../Shape.js";
import { convexContact, convexShape } from "./NativeConvex.js";
import { closestNativeSegments, collideSurface, surfaceHalfspaceIntersection, surfaceIntersection } from "./NativeMesh.js";

/** One world-space contact; its unit normal points from A toward B. */
export interface NativeCollisionContact {
  readonly normal: Vec3;
  readonly point: Vec3;
  readonly penetration: number;
}

type Solid = Extract<PhysicsShape, { kind: "box" | "sphere" | "capsule" | "convex-hull" }>;
type Plane = Extract<PhysicsShape, { kind: "plane" }>;

function reverse(contact: NativeCollisionContact): NativeCollisionContact {
  return { ...contact, normal: scaleVec3(contact.normal, -1) };
}

function normalize(value: Vec3, fallback: Vec3 = [1, 0, 0]): Vec3 {
  const length = Math.hypot(...value);
  return length > 0 ? scaleVec3(value, 1 / length) : fallback;
}

function distanceTolerance(size: number, ...points: Vec3[]): number {
  const coordinates = Math.max(0, ...points.flatMap((point) => point.map(Math.abs)));
  return size * 1e-9 + coordinates * Number.EPSILON * 16;
}

function closestPoint(start: Vec3, end: Vec3, point: Vec3): Vec3 {
  const delta = subVec3(end, start);
  const length = dotVec3(delta, delta);
  const t = length > 0 ? Math.min(1, Math.max(0, dotVec3(subVec3(point, start), delta) / length)) : 0;
  return addVec3(start, scaleVec3(delta, t));
}

function spherePair(a: Vec3, radiusA: number, b: Vec3, radiusB: number, fallback: Vec3 = [1, 0, 0]): NativeCollisionContact[] {
  const offset = subVec3(b, a);
  const distance = Math.hypot(...offset);
  const depth = radiusA + radiusB - distance;
  if (depth < -distanceTolerance(radiusA + radiusB, a, b)) return [];
  const normal = normalize(offset, fallback);
  const pointA = addVec3(a, scaleVec3(normal, radiusA));
  const pointB = subVec3(b, scaleVec3(normal, radiusB));
  return [{ normal, point: scaleVec3(addVec3(pointA, pointB), 0.5), penetration: Math.max(0, depth) }];
}

function perpendicular(axis: Vec3): Vec3 {
  const basis: Vec3 = Math.abs(axis[0]) <= Math.abs(axis[1]) && Math.abs(axis[0]) <= Math.abs(axis[2])
    ? [1, 0, 0] : Math.abs(axis[1]) <= Math.abs(axis[2]) ? [0, 1, 0] : [0, 0, 1];
  return normalize([axis[1] * basis[2] - axis[2] * basis[1], axis[2] * basis[0] - axis[0] * basis[2], axis[0] * basis[1] - axis[1] * basis[0]]);
}

function capsuleEndpoints(body: RigidBody, halfHeight: number): readonly [Vec3, Vec3] {
  const axis = rotateVec3ByQuat([0, halfHeight, 0], body.rotation);
  return [subVec3(body.position, axis), addVec3(body.position, axis)];
}

function sphereBox(center: Vec3, radius: number, box: BoxShape, body: RigidBody): NativeCollisionContact[] {
  const inverse: readonly [number, number, number, number] = [-body.rotation[0], -body.rotation[1], -body.rotation[2], body.rotation[3]];
  const local = rotateVec3ByQuat(subVec3(center, body.position), inverse);
  const nearest: Vec3 = [0, 1, 2].map((axis) => Math.max(-box.halfExtents[axis]!, Math.min(box.halfExtents[axis]!, local[axis]!))) as unknown as Vec3;
  const towardBox = subVec3(nearest, local);
  const distance = Math.hypot(...towardBox);
  const tolerance = distanceTolerance(Math.max(radius, ...box.halfExtents), center, body.position);
  if (distance > radius + tolerance) return [];
  if (distance > tolerance) {
    const normal = rotateVec3ByQuat(scaleVec3(towardBox, 1 / distance), body.rotation);
    const pointA = addVec3(center, scaleVec3(normal, radius));
    const pointB = addVec3(body.position, rotateVec3ByQuat(nearest, body.rotation));
    return [{ normal, point: scaleVec3(addVec3(pointA, pointB), 0.5), penetration: Math.max(0, radius - distance) }];
  }
  let axis = 0;
  for (let index = 1; index < 3; index += 1) {
    if (box.halfExtents[index]! - Math.abs(local[index]!) < box.halfExtents[axis]! - Math.abs(local[axis]!)) axis = index;
  }
  const escape: [number, number, number] = [0, 0, 0];
  escape[axis] = local[axis]! < 0 ? -1 : 1;
  const normal = rotateVec3ByQuat(scaleVec3(escape, -1), body.rotation);
  const depth = radius + box.halfExtents[axis]! - Math.abs(local[axis]!);
  const location = addVec3(local, scaleVec3(escape, (box.halfExtents[axis]! - Math.abs(local[axis]!) - radius) * 0.5));
  return [{ normal, point: addVec3(body.position, rotateVec3ByQuat(location, body.rotation)), penetration: depth }];
}

function planeCandidates(shape: Solid, body: RigidBody, normal: Vec3): Vec3[] {
  const opposite = scaleVec3(normal, -1);
  if (shape.kind === "sphere") return [addVec3(body.position, scaleVec3(opposite, shape.radius))];
  if (shape.kind === "capsule") {
    const endpoints = capsuleEndpoints(body, shape.halfHeight);
    const projections = endpoints.map((point) => dotVec3(point, normal));
    const minimum = Math.min(...projections);
    const tolerance = distanceTolerance(shape.halfHeight * 2, ...endpoints);
    return endpoints.filter((_, index) => projections[index]! <= minimum + tolerance)
      .map((point) => addVec3(point, scaleVec3(opposite, shape.radius)));
  }
  const vertices: readonly Vec3[] = shape.kind === "convex-hull" ? shape.vertices :
    [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * shape.halfExtents[0], y * shape.halfExtents[1], z * shape.halfExtents[2]] as Vec3)));
  return vertices.map((point) => addVec3(body.position, rotateVec3ByQuat(point, body.rotation)));
}

function solidPlane(shape: Solid, body: RigidBody, plane: Plane, planeBody: RigidBody): NativeCollisionContact[] {
  const normal = rotateVec3ByQuat(plane.normal, planeBody.rotation);
  const constant = plane.constant + dotVec3(normal, planeBody.position);
  const bounds = Shape.bounds(shape, body.position, body.rotation);
  const size = Math.max(...[0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!));
  return planeCandidates(shape, body, normal).flatMap((point) => {
    const depth = constant - dotVec3(normal, point);
    const tolerance = distanceTolerance(size, point, planeBody.position) + Math.abs(plane.constant) * Number.EPSILON * 16;
    return depth >= -tolerance ? [{ normal: scaleVec3(normal, -1), point: addVec3(point, scaleVec3(normal, Math.max(0, depth) * 0.5)), penetration: Math.max(0, depth) }] : [];
  }).sort((a, b) => b.penetration - a.penetration || a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.point[2] - b.point[2]).slice(0, 4);
}

function axes(body: RigidBody): readonly Vec3[] {
  const basis: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return basis.map((axis) => rotateVec3ByQuat(axis, body.rotation));
}

function clip(points: readonly Vec3[], center: Vec3, axis: Vec3, limit: number, tolerance: number): Vec3[] {
  if (points.length === 0) return [];
  const out: Vec3[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!, b = points[(index + 1) % points.length]!;
    const da = dotVec3(subVec3(a, center), axis) - limit;
    const db = dotVec3(subVec3(b, center), axis) - limit;
    if (da <= tolerance) out.push(a);
    if ((da < -tolerance && db > tolerance) || (da > tolerance && db < -tolerance)) {
      out.push(addVec3(a, scaleVec3(subVec3(b, a), da / (da - db))));
    }
  }
  return out;
}

/** Preserve a deepest contact and maximize the covered face area when reducing a polygon. */
function reduceBoxManifold(contacts: NativeCollisionContact[], normal: Vec3, tolerance: number): NativeCollisionContact[] {
  if (contacts.length <= 4) return contacts;
  const deepest = Math.max(...contacts.map((contact) => contact.penetration));
  const extent = Math.max(...contacts.map((contact) => Math.hypot(...subVec3(contact.point, contacts[0]!.point))));
  const areaTolerance = tolerance * extent;
  let best = [0, 1, 2, 3], bestArea = -1;
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let a = 0; a < contacts.length - 3; a += 1) for (let b = a + 1; b < contacts.length - 2; b += 1) {
    for (let c = b + 1; c < contacts.length - 1; c += 1) for (let d = c + 1; d < contacts.length; d += 1) {
      const indices = [a, b, c, d];
      if (Math.max(...indices.map((index) => contacts[index]!.penetration)) < deepest - tolerance) continue;
      const origin = contacts[a]!.point;
      const u = subVec3(contacts[b]!.point, origin), v = subVec3(contacts[c]!.point, origin), w = subVec3(contacts[d]!.point, origin);
      const area = Math.abs(dotVec3(normal, addVec3(cross(u, v), cross(v, w))));
      if (area > bestArea + areaTolerance) { best = indices; bestArea = area; }
    }
  }
  return best.map((index) => contacts[index]!);
}

/** Clip an incident box face against the reference face so resting faces have multiple support points. */
function boxManifold(shapeA: BoxShape, bodyA: RigidBody, shapeB: BoxShape, bodyB: RigidBody, normal: Vec3): NativeCollisionContact[] {
  const axesA = axes(bodyA), axesB = axes(bodyB);
  const align = (basis: readonly Vec3[]) => basis.map((axis) => Math.abs(dotVec3(axis, normal)));
  const a = align(axesA), b = align(axesB);
  const maxA = Math.max(...a), maxB = Math.max(...b);
  if (Math.max(maxA, maxB) < 1 - 1e-8) return [];
  const useA = maxA >= maxB;
  const refBody = useA ? bodyA : bodyB, refShape = useA ? shapeA : shapeB, refAxes = useA ? axesA : axesB;
  const incBody = useA ? bodyB : bodyA, incShape = useA ? shapeB : shapeA, incAxes = useA ? axesB : axesA;
  const refAxis = (useA ? a : b).indexOf(useA ? maxA : maxB);
  const orientedNormal = useA ? normal : scaleVec3(normal, -1);
  const refNormal = scaleVec3(refAxes[refAxis]!, dotVec3(refAxes[refAxis]!, orientedNormal) >= 0 ? 1 : -1);
  const tolerance = distanceTolerance(Math.max(...shapeA.halfExtents, ...shapeB.halfExtents), bodyA.position, bodyB.position);
  const refCenter = addVec3(refBody.position, scaleVec3(refNormal, refShape.halfExtents[refAxis]!));
  const incAxis = incAxes.map((axis) => Math.abs(dotVec3(axis, refNormal))).indexOf(Math.max(...incAxes.map((axis) => Math.abs(dotVec3(axis, refNormal)))));
  const incSign = dotVec3(incAxes[incAxis]!, refNormal) > 0 ? -1 : 1;
  const incCenter = addVec3(incBody.position, scaleVec3(incAxes[incAxis]!, incShape.halfExtents[incAxis]! * incSign));
  const incidentOther = [0, 1, 2].filter((index) => index !== incAxis);
  const iu = scaleVec3(incAxes[incidentOther[0]!]!, incShape.halfExtents[incidentOther[0]!]!);
  const iv = scaleVec3(incAxes[incidentOther[1]!]!, incShape.halfExtents[incidentOther[1]!]!);
  let polygon: Vec3[] = [addVec3(addVec3(incCenter, iu), iv), addVec3(subVec3(incCenter, iu), iv), subVec3(subVec3(incCenter, iu), iv), addVec3(subVec3(incCenter, iv), iu)];
  for (const index of [0, 1, 2].filter((axis) => axis !== refAxis)) {
    polygon = clip(polygon, refCenter, refAxes[index]!, refShape.halfExtents[index]!, tolerance);
    polygon = clip(polygon, refCenter, scaleVec3(refAxes[index]!, -1), refShape.halfExtents[index]!, tolerance);
  }
  const contacts = polygon.flatMap((point) => {
    const distance = dotVec3(subVec3(point, refCenter), refNormal);
    return distance <= tolerance ? [{ normal, point: subVec3(point, scaleVec3(refNormal, distance * 0.5)), penetration: Math.max(0, -distance) }] : [];
  });
  return reduceBoxManifold(contacts, normal, tolerance).sort((left, right) => right.penetration - left.penetration || left.point[0] - right.point[0] || left.point[1] - right.point[1] || left.point[2] - right.point[2]);
}

/** The complete separating-axis test for two oriented rectangular boxes. */
function boxPair(shapeA: BoxShape, bodyA: RigidBody, idA: number, shapeB: BoxShape, bodyB: RigidBody, idB: number): NativeCollisionContact[] {
  const basisA = axes(bodyA), basisB = axes(bodyB), delta = subVec3(bodyB.position, bodyA.position);
  const size = Math.max(...shapeA.halfExtents, ...shapeB.halfExtents);
  const tolerance = distanceTolerance(size, bodyA.position, bodyB.position);
  let best: { normal: Vec3; penetration: number; edges?: readonly [number, number] } | undefined;
  const consider = (axis: Vec3, edges?: readonly [number, number]): boolean => {
    const length = Math.hypot(...axis);
    if (length <= 1e-12) return true;
    const direction = scaleVec3(axis, 1 / length);
    const radiusA = basisA.reduce((sum, basis, index) => sum + shapeA.halfExtents[index]! * Math.abs(dotVec3(direction, basis)), 0);
    const radiusB = basisB.reduce((sum, basis, index) => sum + shapeB.halfExtents[index]! * Math.abs(dotVec3(direction, basis)), 0);
    const projection = dotVec3(delta, direction);
    const penetration = radiusA + radiusB - Math.abs(projection);
    if (penetration < -tolerance) return false;
    if (!best || penetration < best.penetration - tolerance * 0.1) {
      const sign = projection > 0 ? 1 : projection < 0 ? -1 : idA < idB ? 1 : -1;
      best = { normal: scaleVec3(direction, sign), penetration: Math.max(0, penetration), ...(edges ? { edges } : {}) };
    }
    return true;
  };
  for (const axis of [...basisA, ...basisB]) if (!consider(axis)) return [];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) {
    const a = basisA[i]!, b = basisB[j]!;
    const cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (!consider(cross, [i, j])) return [];
  }
  if (!best) throw new Error("Native box collision could not establish a separating axis.");
  if (!best.edges) {
    const manifold = boxManifold(shapeA, bodyA, shapeB, bodyB, best.normal);
    if (manifold.length > 0) return manifold;
    throw new Error("Native box collision could not establish a face manifold.");
  }
  const edge = (shape: BoxShape, body: RigidBody, basis: readonly Vec3[], parallel: number, direction: Vec3): readonly [Vec3, Vec3] => {
    let center: Vec3 = body.position;
    for (let index = 0; index < 3; index += 1) {
      if (index === parallel) continue;
      const sign = dotVec3(basis[index]!, direction) >= 0 ? 1 : -1;
      center = addVec3(center, scaleVec3(basis[index]!, shape.halfExtents[index]! * sign));
    }
    const extent = scaleVec3(basis[parallel]!, shape.halfExtents[parallel]!);
    return [subVec3(center, extent), addVec3(center, extent)];
  };
  const first = edge(shapeA, bodyA, basisA, best.edges[0], best.normal);
  const second = edge(shapeB, bodyB, basisB, best.edges[1], scaleVec3(best.normal, -1));
  const [pointA, pointB] = closestNativeSegments(first[0], first[1], second[0], second[1]);
  return [{ normal: best.normal, point: scaleVec3(addVec3(pointA, pointB), 0.5), penetration: best.penetration }];
}

function isSolid(shape: PhysicsShape): shape is Solid {
  return shape.kind === "box" || shape.kind === "sphere" || shape.kind === "capsule" || shape.kind === "convex-hull";
}

function planeEquation(shape: Plane, body: RigidBody): { normal: Vec3; constant: number } {
  const normal = rotateVec3ByQuat(shape.normal, body.rotation);
  return { normal, constant: shape.constant + dotVec3(normal, body.position) };
}

/** Return a witness in the intersection of two solid halfspaces. */
function planePair(a: Plane, bodyA: RigidBody, b: Plane, bodyB: RigidBody): Vec3 | undefined {
  const first = planeEquation(a, bodyA), second = planeEquation(b, bodyB);
  const alignment = dotVec3(first.normal, second.normal);
  const perpendicular = subVec3(second.normal, scaleVec3(first.normal, alignment));
  const lengthSquared = dotVec3(perpendicular, perpendicular);
  if (lengthSquared <= 1e-20) {
    if (alignment < 0 && first.constant + second.constant < -1e-8) return undefined;
    return scaleVec3(first.normal, alignment >= 0 ? Math.min(first.constant, second.constant) : first.constant);
  }
  const onFirst = scaleVec3(first.normal, first.constant);
  const error = dotVec3(second.normal, onFirst) - second.constant;
  return error > 0 ? subVec3(onFirst, scaleVec3(perpendicular, error / lengthSquared)) : onFirst;
}

/**
 * Collider filtering belongs to the caller. For surface/surface intersections,
 * the single zero-depth witness is intended for sensors rather than impulses.
 */
export function collideNative(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): readonly NativeCollisionContact[] {
  if (a.bodyId !== bodyA.id || b.bodyId !== bodyB.id) throw new Error("Native collider body does not match its owner.");
  Shape.validate(a.shape);
  Shape.validate(b.shape);
  const shapeA = a.shape, shapeB = b.shape;
  if (shapeA.kind === "plane" && isSolid(shapeB)) return solidPlane(shapeB, bodyB, shapeA, bodyA).map(reverse);
  if (shapeB.kind === "plane" && isSolid(shapeA)) return solidPlane(shapeA, bodyA, shapeB, bodyB);
  if ((shapeA.kind === "mesh" || shapeA.kind === "heightfield") && isSolid(shapeB)) return collideSurface(shapeB, bodyB, shapeA, bodyA).map(reverse);
  if ((shapeB.kind === "mesh" || shapeB.kind === "heightfield") && isSolid(shapeA)) return collideSurface(shapeA, bodyA, shapeB, bodyB);
  if (shapeA.kind === "plane" && shapeB.kind === "plane") {
    const point = planePair(shapeA, bodyA, shapeB, bodyB);
    return point ? [{ normal: normalize(subVec3(bodyB.position, bodyA.position), planeEquation(shapeA, bodyA).normal), point, penetration: 0 }] : [];
  }
  if (shapeA.kind === "plane" && (shapeB.kind === "mesh" || shapeB.kind === "heightfield")) {
    const plane = planeEquation(shapeA, bodyA);
    const point = surfaceHalfspaceIntersection(shapeB, bodyB, plane.normal, plane.constant);
    return point ? [{ normal: normalize(subVec3(bodyB.position, bodyA.position), plane.normal), point, penetration: 0 }] : [];
  }
  if (shapeB.kind === "plane" && (shapeA.kind === "mesh" || shapeA.kind === "heightfield")) {
    const plane = planeEquation(shapeB, bodyB);
    const point = surfaceHalfspaceIntersection(shapeA, bodyA, plane.normal, plane.constant);
    return point ? [{ normal: normalize(subVec3(bodyB.position, bodyA.position), scaleVec3(plane.normal, -1)), point, penetration: 0 }] : [];
  }
  if ((shapeA.kind === "mesh" || shapeA.kind === "heightfield") && (shapeB.kind === "mesh" || shapeB.kind === "heightfield")) {
    const point = surfaceIntersection(shapeA, bodyA, shapeB, bodyB);
    return point ? [{ normal: normalize(subVec3(bodyB.position, bodyA.position), [a.id < b.id ? 1 : -1, 0, 0]), point, penetration: 0 }] : [];
  }
  if (!isSolid(shapeA) || !isSolid(shapeB)) throw new Error(`Unsupported native collision between '${shapeA.kind}' and '${shapeB.kind}' surfaces.`);
  if (shapeA.kind === "box" && shapeB.kind === "box") return boxPair(shapeA, bodyA, a.id, shapeB, bodyB, b.id);
  if (shapeA.kind === "sphere" && shapeB.kind === "sphere") return spherePair(bodyA.position, shapeA.radius, bodyB.position, shapeB.radius);
  if (shapeA.kind === "sphere" && shapeB.kind === "box") return sphereBox(bodyA.position, shapeA.radius, shapeB, bodyB);
  if (shapeA.kind === "box" && shapeB.kind === "sphere") return sphereBox(bodyB.position, shapeB.radius, shapeA, bodyA).map(reverse);
  if (shapeA.kind === "sphere" && shapeB.kind === "capsule") {
    const [start, end] = capsuleEndpoints(bodyB, shapeB.halfHeight);
    return spherePair(bodyA.position, shapeA.radius, closestPoint(start, end, bodyA.position), shapeB.radius, scaleVec3(perpendicular(subVec3(end, start)), -1));
  }
  if (shapeA.kind === "capsule" && shapeB.kind === "sphere") {
    const [start, end] = capsuleEndpoints(bodyA, shapeA.halfHeight);
    return spherePair(closestPoint(start, end, bodyB.position), shapeA.radius, bodyB.position, shapeB.radius, perpendicular(subVec3(end, start)));
  }
  if (shapeA.kind === "capsule" && shapeB.kind === "capsule") {
    const [a0, a1] = capsuleEndpoints(bodyA, shapeA.halfHeight), [b0, b1] = capsuleEndpoints(bodyB, shapeB.halfHeight);
    const [first, second] = closestNativeSegments(a0, a1, b0, b1);
    const u = subVec3(a1, a0), v = subVec3(b1, b0);
    const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return spherePair(first, shapeA.radius, second, shapeB.radius, normalize(cross, scaleVec3(perpendicular(u), a.id < b.id ? 1 : -1)));
  }
  const contact = convexContact(convexShape(shapeA, bodyA), convexShape(shapeB, bodyB));
  if (!contact) return [];
  return [contact];
}

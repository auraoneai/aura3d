import type { Collider } from "../Collider.js";
import type { RaycastHit, RaycastOptions, SphereCastHit } from "../Raycast.js";
import type { Quat, RigidBody } from "../RigidBody.js";
import { rotateVec3ByQuat, validateFiniteVec3, type BoxShape, type CapsuleShape, type ConvexHullShape, type HeightfieldShape, type MeshShape, type PhysicsShape, type SphereShape, type Vec3 } from "../Shape.js";

// These helpers operate on the actual shapes. They intentionally do not use
// collider AABBs as narrow-phase geometry.
type V = [number, number, number];
type Triangle = readonly [Vec3, Vec3, Vec3];
type Edge = readonly [Vec3, Vec3];
type Hit = { readonly distance: number; readonly normal: Vec3 };
type Face = { readonly a: number; readonly b: number; readonly c: number; readonly normal: Vec3; readonly constant: number };
type Hull = { readonly vertices: readonly Vec3[]; readonly faces: readonly Face[]; readonly edges: readonly Edge[] };
const EPS = 1e-9;
const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const pointAt = (o: Vec3, d: Vec3, t: number): V => add(o, mul(d, t));
function unit(v: Vec3, label: string): V {
  validateFiniteVec3(v, label);
  const m = length(v);
  if (!Number.isFinite(m) || m <= EPS) throw new Error(`${label} must be a finite non-zero vector.`);
  return mul(v, 1 / m);
}
function rotation(q: Quat): Quat {
  if (q.length !== 4 || !q.every(Number.isFinite)) throw new Error("body rotation must be a finite quaternion.");
  const n = Math.hypot(...q);
  if (!(n > EPS)) throw new Error("body rotation must be non-zero.");
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
function local(v: Vec3, body: RigidBody, translate: boolean): V {
  const q = rotation(body.rotation);
  return rotateVec3ByQuat(translate ? sub(v, body.position) : v, [-q[0], -q[1], -q[2], q[3]]);
}
function world(v: Vec3, body: RigidBody, translate: boolean): V {
  const result = rotateVec3ByQuat(v, rotation(body.rotation));
  return translate ? add(result, body.position) : result;
}
function accepts(collider: Collider, body: RigidBody, options: RaycastOptions): boolean {
  if (collider.bodyId !== body.id) throw new Error("Collider and query body do not match.");
  if (options.ignoreBodies?.includes(body.id) || options.ignoreColliders?.includes(collider.id)) return false;
  if (collider.sensor && options.includeSensors !== true) return false;
  if (options.mask !== undefined && (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 0xffffffff)) {
    throw new Error("query mask must be a non-negative 32-bit mask.");
  }
  return options.mask === undefined || (collider.filter.layer & options.mask) !== 0;
}
function limit(options: RaycastOptions): number {
  const value = options.maxDistance ?? Infinity;
  if (Number.isNaN(value) || value < 0) throw new Error("query maxDistance must be non-negative.");
  return value;
}
function nearest(a: Hit | undefined, b: Hit | undefined): Hit | undefined {
  return !a || (b && b.distance < a.distance) ? b : a;
}
function queryHit(hit: Hit | undefined, origin: Vec3, direction: Vec3, collider: Collider, body: RigidBody): RaycastHit | undefined {
  if (!hit) return undefined;
  return { colliderId: collider.id, bodyId: body.id, distance: hit.distance, point: pointAt(origin, direction, hit.distance), normal: world(hit.normal, body, false) };
}

/** Cast a ray at actual collider geometry; distance is measured in world units. */
export function nativeRaycastCollider(origin: Vec3, direction: Vec3, collider: Collider, body: RigidBody, options: RaycastOptions = {}): RaycastHit | undefined {
  validateFiniteVec3(origin, "query origin");
  const dir = unit(direction, "query direction");
  const max = limit(options);
  if (!accepts(collider, body, options)) return undefined;
  const o = local(origin, body, true), d = local(dir, body, false);
  const shape = collider.shape;
  let hit: Hit | undefined;
  switch (shape.kind) {
    case "sphere": hit = raySphere(o, d, [0, 0, 0], shape.radius, max); break;
    case "box": hit = rayBox(o, d, shape.halfExtents, max); break;
    case "capsule": hit = rayCapsule(o, d, [0, -shape.halfHeight, 0], [0, shape.halfHeight, 0], shape.radius, max); break;
    case "plane": hit = rayPlane(o, d, shape.normal, shape.constant, 0, max); break;
    case "convex-hull": hit = rayHull(o, d, convexHull(shape), max); break;
    case "mesh":
    case "heightfield":
      for (const triangle of triangles(shape)) hit = nearest(hit, rayTriangle(o, d, triangle, max, options.includeBackfaces === true));
      break;
  }
  return queryHit(hit, origin, dir, collider, body);
}

/**
 * Wheel rays use the inward normal at the exit when starting inside a solid
 * box, sphere, or plane and the exit lies within the ray length. A strictly
 * interior convex ray is also supported when both sufficiently separated exits
 * have uniquely identified, opposite parallel faces. Their point and distance
 * remain the original zero-time hit. Ordinary raycasts use different semantics.
 */
export function nativeWheelRaycastCollider(origin: Vec3, direction: Vec3, collider: Collider, body: RigidBody, options: RaycastOptions = {}): RaycastHit | undefined {
  const hit = nativeRaycastCollider(origin, direction, collider, body, options);
  if (!hit || hit.distance !== 0) return hit;
  const dir = unit(direction, "wheel ray direction"), d = local(dir, body, false), o = local(origin, body, true), max = limit(options), shape = collider.shape;
  let exit = Infinity, normal: Vec3 | undefined;
  if (shape.kind === "box") {
    for (let axis = 0; axis < 3; axis++) {
      if (d[axis] === 0) continue;
      const sign = d[axis]! > 0 ? 1 : -1, distance = (sign * shape.halfExtents[axis]! - o[axis]!) / d[axis]!;
      if (distance >= 0 && distance < exit) {
        const inward: V = [0, 0, 0]; inward[axis] = -sign;
        exit = distance; normal = inward;
      }
    }
  } else if (shape.kind === "sphere") {
    const centerDistance = length(o);
    if (centerDistance === 0) {
      if (shape.radius <= max) return { ...hit, normal: mul(dir, -1) };
      throw new Error("Native wheel ray at a sphere center has no finite inside normal before exit.");
    }
    if (Math.abs(centerDistance - shape.radius) <= 64 * Number.EPSILON * Math.max(centerDistance, shape.radius)) {
      throw new Error("Native wheel ray at a sphere boundary has no verified normal.");
    }
    const projection = dot(o, d), discriminant = projection * projection + shape.radius * shape.radius - dot(o, o);
    if (discriminant < 0 || !Number.isFinite(discriminant)) throw new Error("Native wheel sphere exit is outside the numeric range.");
    exit = -projection + Math.sqrt(discriminant);
    if (exit >= 0 && exit <= max) normal = mul(unit(pointAt(o, d, exit), "wheel sphere exit normal"), -1);
    else {
      normal = mul(o, -1 / centerDistance);
    }
  } else if (shape.kind === "plane") {
    const speed = dot(shape.normal, d);
    if (speed > 0) {
      exit = (shape.constant - dot(shape.normal, o)) / speed;
      normal = mul(shape.normal, -1);
    }
  } else if (shape.kind === "capsule") {
    const tolerance = 64 * Number.EPSILON, scale = Math.max(shape.radius, shape.halfHeight);
    const radial = Math.hypot(o[0], o[2]);
    const axial = Math.hypot(d[0], d[2]) <= tolerance;
    const transverse = Math.abs(d[1]) <= tolerance && Math.abs(o[1]) < shape.halfHeight;
    const surfaceDistance = length(sub(o, closestSegment(o, [0, -shape.halfHeight, 0], [0, shape.halfHeight, 0])));
    if (Math.abs(surfaceDistance - shape.radius) <= tolerance * shape.radius) throw new Error("Native wheel ray at a capsule boundary has no verified normal.");
    if (radial <= tolerance * scale && (axial || transverse)) return hit;
    throw new Error("Native wheel inside-origin ray against 'capsule' is not implemented for this direction.");
  } else if (shape.kind === "convex-hull") {
    return { ...hit, normal: world(wheelHullNormal(o, d, convexHull(shape), max, Math.max(length(origin), length(body.position))), body, false) };
  } else if (shape.kind === "mesh" || shape.kind === "heightfield") {
    return hit;
  }
  return normal && (exit <= max || shape.kind === "sphere") ? { ...hit, normal: world(normal, body, false) } : hit;
}

/**
 * Certify a limited inside-hull wheel normal. A long but bounded ray must pass
 * through the interiors of two opposing parallel support faces, so entry and
 * exit agree on the same wheel normal. Float32-scale clearance rejects face
 * edges, surface starts, and thresholds sensitive to backend rounding.
 */
function wheelHullNormal(origin: Vec3, direction: Vec3, hull: Hull, max: number, worldScale: number): Vec3 {
  const minimum: V = [Infinity, Infinity, Infinity], maximum: V = [-Infinity, -Infinity, -Infinity];
  let coordinateScale = Math.max(length(origin), worldScale);
  for (const vertex of hull.vertices) for (let axis = 0; axis < 3; axis++) {
    minimum[axis] = Math.min(minimum[axis]!, vertex[axis]!);
    maximum[axis] = Math.max(maximum[axis]!, vertex[axis]!);
    coordinateScale = Math.max(coordinateScale, Math.abs(vertex[axis]!));
  }
  const scale = Math.max(...maximum.map((value, axis) => value - minimum[axis]!));
  const clearance = Math.max(scale, coordinateScale) * 2 ** -17;
  const normalTolerance = 1024 * Number.EPSILON, planeTolerance = normalTolerance * Math.max(scale, coordinateScale);
  if (!Number.isFinite(scale) || !(scale > 0) || !Number.isFinite(max) || max > 4 * scale || !Number.isFinite(clearance)) {
    throw new Error("Native wheel convex ray exceeds the certified geometry or travel range.");
  }
  for (const face of hull.faces) if (!(face.constant - dot(face.normal, origin) > clearance)) {
    throw new Error("Native wheel inside-origin convex ray is too close to a hull boundary.");
  }
  const exit = (sign: number): { face: Face; distance: number } => {
    let selected: Face | undefined, distance = Infinity;
    for (const face of hull.faces) {
      const speed = sign * dot(face.normal, direction);
      if (!(speed > 0)) continue;
      const candidate = (face.constant - dot(face.normal, origin)) / speed;
      if (candidate < distance) { distance = candidate; selected = face; }
    }
    if (!selected || !Number.isFinite(distance)) throw new Error("Native wheel convex ray has no certified exit.");
    const point = pointAt(origin, direction, sign * distance);
    for (const face of hull.faces) {
      const samePlane = length(sub(face.normal, selected.normal)) <= normalTolerance && Math.abs(face.constant - selected.constant) <= planeTolerance;
      if (!samePlane && !(face.constant - dot(face.normal, point) > clearance)) {
        throw new Error("Native wheel convex ray has an ambiguous face or edge exit.");
      }
    }
    return { face: selected, distance };
  };
  const forward = exit(1), backward = exit(-1);
  if (length(add(forward.face.normal, backward.face.normal)) > normalTolerance) throw new Error("Native wheel convex ray requires opposing parallel exit faces.");
  if (!(max > 3 * Math.max(forward.distance, backward.distance) + clearance)) throw new Error("Native wheel convex ray is too short to certify its inside normal.");
  return mul(forward.face.normal, -1);
}

/** Sweep a sphere without inflating a target's AABB or ignoring its rotation. */
export function nativeSphereCastCollider(origin: Vec3, radius: number, direction: Vec3, collider: Collider, body: RigidBody, options: RaycastOptions = {}): SphereCastHit | undefined {
  validateFiniteVec3(origin, "query origin");
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("sphere cast radius must be finite and positive.");
  const dir = unit(direction, "query direction");
  const max = limit(options);
  if (!accepts(collider, body, options)) return undefined;
  const o = local(origin, body, true), d = local(dir, body, false);
  const shape = collider.shape;
  let hit: Hit | undefined;
  switch (shape.kind) {
    case "sphere": hit = raySphere(o, d, [0, 0, 0], shape.radius + radius, max); break;
    case "box": hit = rayRoundedBox(o, d, shape.halfExtents, radius, max); break;
    case "capsule": hit = rayCapsule(o, d, [0, -shape.halfHeight, 0], [0, shape.halfHeight, 0], shape.radius + radius, max); break;
    case "plane": hit = rayPlane(o, d, shape.normal, shape.constant, radius, max); break;
    case "convex-hull": hit = sweepSphereHull(o, d, radius, convexHull(shape), max); break;
    case "mesh":
    case "heightfield":
      for (const triangle of triangles(shape)) hit = nearest(hit, sweepSphereTriangle(o, d, radius, triangle, max, options.includeBackfaces === true));
      break;
  }
  if (!hit) return undefined;
  const normal = world(hit.normal, body, false);
  const castCenter = pointAt(origin, dir, hit.distance);
  return { colliderId: collider.id, bodyId: body.id, distance: hit.distance, castCenter, castRadius: radius, normal, point: sub(castCenter, mul(normal, radius)) };
}

/** Test the true volume of a world-aligned query sphere or box against a collider. */
export function nativeOverlapCollider(center: Vec3, shape: SphereShape | BoxShape, collider: Collider, body: RigidBody): boolean {
  validateFiniteVec3(center, "overlap center");
  if (body.id !== collider.bodyId) throw new Error("Collider and query body do not match.");
  validateQueryShape(shape);
  const target = collider.shape;
  if (shape.kind === "sphere") {
    const c = local(center, body, true), r = shape.radius;
    switch (target.kind) {
      case "sphere": return withinRadius(dot(c, c), r + target.radius);
      case "box": return withinRadius(distanceSquared(c, closestBox(c, target.halfExtents)), r);
      case "capsule": return withinRadius(distanceSquared(c, closestSegment(c, [0, -target.halfHeight, 0], [0, target.halfHeight, 0])), r + target.radius);
      case "plane": return dot(target.normal, c) - target.constant <= r + EPS;
      case "convex-hull": {
        const hull = convexHull(target);
        if (insideHull(c, hull)) return true;
        return hull.faces.some((f) => withinRadius(distanceSquared(c, closestTriangle(c, [hull.vertices[f.a]!, hull.vertices[f.b]!, hull.vertices[f.c]!])), r));
      }
      case "mesh":
      case "heightfield": return triangles(target).some((triangle) => withinRadius(distanceSquared(c, closestTriangle(c, triangle)), r));
    }
  }
  const half = shape.halfExtents;
  switch (target.kind) {
    case "sphere": return withinRadius(distanceSquared(body.position, closestWorldBox(body.position, center, half)), target.radius);
    case "box": return overlapsBoxes(center, half, body.position, target.halfExtents, body.rotation);
    case "capsule": {
      const a = world([0, -target.halfHeight, 0], body, true), b = world([0, target.halfHeight, 0], body, true);
      return withinRadius(segmentBoxDistanceSquared(sub(a, center), sub(b, center), half), target.radius);
    }
    case "plane": {
      const n = world(target.normal, body, false);
      return dot(n, sub(center, body.position)) - target.constant <= dotAbs(n, half) + EPS;
    }
    case "convex-hull": return overlapsHullBox(convexHull(target), body, center, half);
    case "mesh":
    case "heightfield": return triangles(target).some((t) => overlapsTriangleBox(t.map((v) => sub(world(v, body, true), center)) as unknown as Triangle, half));
  }
}

export interface NativeSweepHit { readonly fraction: number; readonly normal: Vec3; readonly point: Vec3; readonly collider: Collider; readonly body: RigidBody }

/** Match the character host contract at numerical zero, for one convex piece. */
function nonBlockingInitialContact(hit: NativeSweepHit, displacement: Vec3): boolean {
  if (hit.fraction > 1e-8) return false;
  const normalLength = length(hit.normal);
  if (!(normalLength > 0) || !Number.isFinite(normalLength)) throw new Error("Sweep returned an invalid contact normal.");
  return dot(mul(hit.normal, 1 / normalLength), displacement) >= -64 * Number.EPSILON * length(displacement);
}

/**
 * Sweep a supported moving shape along displacement against one already-selected
 * collider. Sphere/capsule queries ignore non-entering grazes so tangent floor
 * contacts do not block character motion. Unsupported pairs fail explicitly.
 */
export function nativeSweepCollider(movingShape: SphereShape | CapsuleShape | BoxShape, origin: Vec3, movingRotation: Quat, displacement: Vec3, collider: Collider, body: RigidBody, offset = 0): NativeSweepHit | undefined {
  validateFiniteVec3(origin, "sweep origin");
  validateFiniteVec3(displacement, "sweep displacement");
  const q = rotation(movingRotation);
  if (body.id !== collider.bodyId) throw new Error("Collider and query body do not match.");
  if (!Number.isFinite(offset) || offset < 0) throw new Error("sweep offset must be finite and non-negative.");
  if (movingShape.kind === "capsule") {
    if (!Number.isFinite(movingShape.radius) || movingShape.radius <= 0 || !Number.isFinite(movingShape.halfHeight) || movingShape.halfHeight <= 0) {
      throw new Error("sweep capsule dimensions must be finite and positive.");
    }
  } else validateQueryShape(movingShape);
  const distance = length(displacement);
  if (!Number.isFinite(distance)) throw new Error("sweep displacement must be finite.");
  if (collider.shape.kind === "plane") return sweepShapePlane(movingShape, origin, q, displacement, collider, body, offset);
  if (movingShape.kind === "box" && collider.shape.kind === "sphere") {
    const inverse: Quat = [-q[0], -q[1], -q[2], q[3]];
    const relative = rotateVec3ByQuat(sub(body.position, origin), inverse);
    const separation = sub(relative, closestBox(relative, movingShape.halfExtents));
    const separationLength = length(separation);
    if (separationLength <= collider.shape.radius + offset + EPS) {
      if (separationLength <= EPS) throw new Error("A sphere inside a moving box has no unique sweep normal.");
      const normal = mul(rotateVec3ByQuat(separation, q), -1 / separationLength);
      if (dot(normal, displacement) >= -EPS) return undefined;
      return { fraction: 0, normal, point: add(body.position, mul(normal, collider.shape.radius)), collider, body };
    }
    if (distance <= EPS) return undefined;
    const direction = rotateVec3ByQuat(mul(displacement, -1 / distance), inverse);
    const hit = rayRoundedBox(relative, direction, movingShape.halfExtents, collider.shape.radius + offset, distance);
    if (!hit) return undefined;
    const normal = mul(rotateVec3ByQuat(hit.normal, q), -1);
    return { fraction: hit.distance / distance, normal, point: add(body.position, mul(normal, collider.shape.radius)), collider, body };
  }
  if (movingShape.kind === "capsule" || movingShape.kind === "sphere") return sweepRoundShape(movingShape, origin, q, displacement, collider, body, offset);
  if (collider.shape.kind === "box" && offset === 0) return sweepBoxBox(movingShape, origin, q, displacement, collider, body);
  return sweepBoxShape(movingShape, origin, q, displacement, collider, body, offset);
}

function shapeSupport(shape: SphereShape | CapsuleShape | BoxShape, center: Vec3, q: Quat, direction: Vec3): V {
  if (shape.kind === "sphere") return add(center, mul(direction, shape.radius));
  if (shape.kind === "capsule") {
    const axis = rotateVec3ByQuat([0, shape.halfHeight, 0], q);
    return add(add(center, mul(axis, dot(axis, direction) >= 0 ? 1 : -1)), mul(direction, shape.radius));
  }
  const inverse: Quat = [-q[0], -q[1], -q[2], q[3]], localDirection = rotateVec3ByQuat(direction, inverse);
  return add(center, rotateVec3ByQuat([
    localDirection[0] >= 0 ? shape.halfExtents[0] : -shape.halfExtents[0],
    localDirection[1] >= 0 ? shape.halfExtents[1] : -shape.halfExtents[1],
    localDirection[2] >= 0 ? shape.halfExtents[2] : -shape.halfExtents[2]
  ], q));
}
function sweepShapePlane(shape: SphereShape | CapsuleShape | BoxShape, origin: Vec3, q: Quat, displacement: Vec3, collider: Collider, body: RigidBody, offset: number): NativeSweepHit | undefined {
  if (collider.shape.kind !== "plane") throw new Error("Expected a plane collider.");
  const normal = unit(world(collider.shape.normal, body, false), "plane normal");
  const support = sub(shapeSupport(shape, origin, q, mul(normal, -1)), mul(normal, offset));
  const signed = dot(normal, sub(support, body.position)) - collider.shape.constant;
  let fraction = 0;
  if (signed >= -EPS && signed <= EPS && dot(normal, displacement) >= -EPS) return undefined;
  if (signed > 0) {
    const speed = dot(normal, displacement);
    if (speed >= -EPS) return undefined;
    fraction = -signed / speed;
    if (fraction < 0 || fraction > 1) return undefined;
  }
  const surfaceSupport = add(support, mul(displacement, fraction));
  const surfaceDistance = dot(normal, sub(surfaceSupport, body.position)) - collider.shape.constant;
  const point = sub(surfaceSupport, mul(normal, surfaceDistance));
  return { fraction, normal, point, collider, body };
}
type PointPair = { readonly moving: Vec3; readonly target: Vec3 };
function sweepRoundShape(shape: CapsuleShape | SphereShape, origin: Vec3, q: Quat, displacement: Vec3, collider: Collider, body: RigidBody, offset: number): NativeSweepHit | undefined {
  const center = local(origin, body, true), delta = local(displacement, body, false);
  const axis = local(rotateVec3ByQuat([0, shape.kind === "capsule" ? shape.halfHeight : 0, 0], q), body, false);
  const a = sub(center, axis), b = add(center, axis), target = collider.shape;
  const radius = shape.radius + offset;
  const deltaLength = length(delta), closingTolerance = 16 * Number.EPSILON * deltaLength;
  const advance = (pairAt: (from: Vec3, to: Vec3) => PointPair, combinedRadius: number, targetRadius = 0): NativeSweepHit | undefined => {
    const at = (time: number): PointPair => pairAt(add(a, mul(delta, time)), add(b, mul(delta, time)));
    const separationAt = (time: number): Vec3 => { const pair = at(time); return sub(pair.moving, pair.target); };
    const precisionScale = (time: number, pair: PointPair): number => Math.max(1, combinedRadius, length(center), deltaLength * time, length(pair.moving), length(pair.target));
    const isGrazing = (start: number): boolean => {
      // Distance to a convex target under linear motion is convex. A rounded
      // triangle edge can look like a blocking approach just before a capsule
      // gliding across coplanar triangles reaches the seam. Find the minimum
      // distance along the remaining path and discard a touch without entry.
      if (dot(separationAt(1), delta) < 0) return false;
      let lo = start, hi = 1;
      for (let i = 0; i < 128; i++) {
        const middle = (lo + hi) * 0.5;
        if (middle === lo || middle === hi) break;
        if (dot(separationAt(middle), delta) < 0) lo = middle;
        else hi = middle;
      }
      const pair = at(hi), numericalTolerance = 64 * Number.EPSILON * precisionScale(hi, pair);
      return length(sub(pair.moving, pair.target)) >= combinedRadius - numericalTolerance;
    };
    let fraction = 0;
    for (let iteration = 0; iteration < 128; iteration++) {
      const pair = at(fraction);
      const separation = sub(pair.moving, pair.target), separationLength = length(separation);
      if (separationLength <= EPS) throw new Error("Deeply overlapping capsule sweep cannot determine an impact normal.");
      const normal = mul(separation, 1 / separationLength), gap = separationLength - combinedRadius;
      const closing = -dot(normal, delta);
      const tolerance = 1e-8 * Math.max(radius, EPS) + 32 * Number.EPSILON * precisionScale(fraction, pair);
      if (gap <= tolerance) {
        // Tangent or separating initial contacts must not hide a later hit on a
        // different triangle in the same mesh collider.
        if (fraction <= EPS && closing <= closingTolerance) return undefined;
        if (isGrazing(fraction)) return undefined;
        const targetPoint = add(pair.target, mul(normal, targetRadius));
        const hit = { fraction: clamp(fraction, 0, 1), normal: world(normal, body, false), point: world(targetPoint, body, true), collider, body };
        return nonBlockingInitialContact(hit, displacement) ? undefined : hit;
      }
      if (closing <= closingTolerance) return undefined;
      fraction += gap / closing;
      if (fraction > 1 + EPS) return undefined;
    }
    throw new Error("Native capsule sweep did not converge within its iteration limit.");
  };
  if (target.kind === "box") {
    return advance((from, to) => segmentBoxClosest(from, to, target.halfExtents), radius);
  }
  if (target.kind === "sphere") {
    return advance((from, to) => ({ moving: closestSegment([0, 0, 0], from, to), target: [0, 0, 0] }), radius + target.radius, target.radius);
  }
  if (target.kind === "capsule") {
    const first: Vec3 = [0, -target.halfHeight, 0], second: Vec3 = [0, target.halfHeight, 0];
    return advance((from, to) => closestSegments(from, to, first, second), radius + target.radius, target.radius);
  }
  let surface: Triangle[];
  if (target.kind === "convex-hull") {
    const hull = convexHull(target);
    if (insideHull(a, hull) || insideHull(b, hull)) throw new Error("A capsule starting inside a convex hull has no unique sweep normal.");
    surface = hull.faces.map((face) => [hull.vertices[face.a]!, hull.vertices[face.b]!, hull.vertices[face.c]!]);
  } else if (target.kind === "mesh" || target.kind === "heightfield") surface = triangles(target);
  else throw new Error(`Native capsule sweep against ${target.kind} is not implemented.`);
  let best: NativeSweepHit | undefined;
  for (const triangle of surface) {
    const hit = advance((from, to) => closestSegmentTriangle(from, to, triangle), radius);
    if (hit && (!best || hit.fraction < best.fraction)) best = hit;
  }
  return best;
}
function sweepBoxBox(shape: BoxShape, origin: Vec3, q: Quat, displacement: Vec3, collider: Collider, body: RigidBody): NativeSweepHit | undefined {
  if (collider.shape.kind !== "box") throw new Error("Expected a box collider.");
  const movingAxes = BASES.map((axis) => rotateVec3ByQuat(axis, q));
  const targetAxes = BASES.map((axis) => world(axis, body, false));
  const axes: Vec3[] = [...movingAxes, ...targetAxes];
  for (const a of movingAxes) for (const b of targetAxes) axes.push(cross(a, b));
  let enter = 0, exit = 1, hitNormal: Vec3 | undefined, closestDepth = Infinity, overlapNormal: Vec3 | undefined, nonBlockingContact = false;
  const delta = sub(origin, body.position);
  for (const candidate of axes) {
    const magnitude = length(candidate);
    if (magnitude <= EPS) continue;
    const axis = mul(candidate, 1 / magnitude);
    let extent = 0;
    for (let i = 0; i < 3; i++) extent += Math.abs(dot(axis, movingAxes[i]!)) * shape.halfExtents[i]! + Math.abs(dot(axis, targetAxes[i]!)) * collider.shape.halfExtents[i]!;
    const position = dot(delta, axis), speed = dot(displacement, axis), depth = extent - Math.abs(position);
    if (Math.abs(depth) <= EPS && position * speed >= -EPS) nonBlockingContact = true;
    if (depth < closestDepth) {
      closestDepth = depth;
      overlapNormal = mul(axis, position < -EPS ? -1 : position > EPS ? 1 : speed > 0 ? -1 : 1);
    }
    if (Math.abs(speed) <= EPS) { if (Math.abs(position) > extent + EPS) return undefined; continue; }
    const first = (-extent - position) / speed, second = (extent - position) / speed;
    const near = Math.min(first, second), far = Math.max(first, second);
    if (near > enter) { enter = near; hitNormal = mul(axis, speed > 0 ? -1 : 1); }
    exit = Math.min(exit, far);
    if (enter > exit + EPS) return undefined;
  }
  if (enter > 1 || exit < 0) return undefined;
  if (enter <= EPS && nonBlockingContact) return undefined;
  const normal = hitNormal ?? overlapNormal;
  if (!normal) throw new Error("Box sweep could not determine a contact normal.");
  const support = shapeSupport(shape, add(origin, mul(displacement, enter)), q, mul(normal, -1));
  const point = world(closestBox(local(support, body, true), collider.shape.halfExtents), body, true);
  return { fraction: enter, normal, point, collider, body };
}

type BoxConfiguration = { readonly hull: Hull; readonly targetVertices: readonly Vec3[] };
type ConfigurationSurface = { readonly point: Vec3; readonly target: Vec3; readonly face: Face };

// In the target's frame, the box center collides with target - box. Retaining
// each vertex's source makes a contact point on the original target recoverable.
function boxConfiguration(vertices: readonly Vec3[], shape: BoxShape, q: Quat, body: RigidBody): BoxConfiguration {
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    corners.push(local(rotateVec3ByQuat([x * shape.halfExtents[0], y * shape.halfExtents[1], z * shape.halfExtents[2]], q), body, false));
  }
  const sums: Vec3[] = [], targetVertices: Vec3[] = [];
  for (const vertex of vertices) for (const corner of corners) {
    sums.push(sub(vertex, corner));
    targetVertices.push(vertex);
  }
  return { hull: convexHull({ kind: "convex-hull", vertices: sums, indices: [] }), targetVertices };
}

function configurationSurface(center: Vec3, configuration: BoxConfiguration): ConfigurationSurface {
  let bestPoint: Vec3 | undefined, bestFace: Face | undefined, best = Infinity;
  const { hull, targetVertices } = configuration;
  for (const face of hull.faces) {
    const triangle: Triangle = [hull.vertices[face.a]!, hull.vertices[face.b]!, hull.vertices[face.c]!];
    const point = closestTriangle(center, triangle), squared = distanceSquared(point, center);
    if (squared < best) { best = squared; bestPoint = point; bestFace = face; }
  }
  if (!bestPoint || !bestFace) throw new Error("Box sweep configuration hull has no surface.");
  const a = hull.vertices[bestFace.a]!, b = hull.vertices[bestFace.b]!, c = hull.vertices[bestFace.c]!;
  const ab = sub(b, a), ac = sub(c, a), ap = sub(bestPoint, a);
  const aa = dot(ab, ab), bb = dot(ac, ac), abac = dot(ab, ac), denominator = aa * bb - abac * abac;
  if (!(denominator > 16 * Number.EPSILON * aa * bb)) throw new Error("Box sweep surface cannot determine stable contact coordinates.");
  const u = (bb * dot(ap, ab) - abac * dot(ap, ac)) / denominator;
  const v = (aa * dot(ap, ac) - abac * dot(ap, ab)) / denominator;
  const target = add(mul(targetVertices[bestFace.a]!, 1 - u - v), add(mul(targetVertices[bestFace.b]!, u), mul(targetVertices[bestFace.c]!, v)));
  return { point: bestPoint, target, face: bestFace };
}

function configurationSignedDistance(center: Vec3, hull: Hull): number {
  let maximum = -Infinity;
  for (const face of hull.faces) maximum = Math.max(maximum, dot(face.normal, center) - face.constant);
  if (!Number.isFinite(maximum)) throw new Error("Box sweep configuration exceeds the finite numeric range.");
  return maximum;
}

/** The closest vector is zero in the interior of the configuration volume. */
function configurationSeparation(center: Vec3, configuration: BoxConfiguration): Vec3 {
  if (configurationSignedDistance(center, configuration.hull) <= 0) return [0, 0, 0];
  return sub(center, configurationSurface(center, configuration).point);
}

function sweepBoxShape(shape: BoxShape, origin: Vec3, q: Quat, displacement: Vec3, collider: Collider, body: RigidBody, offset: number): NativeSweepHit | undefined {
  const center = local(origin, body, true), delta = local(displacement, body, false), target = collider.shape;
  const deltaLength = length(delta), closingTolerance = 16 * Number.EPSILON * deltaLength;
  let surfaces: readonly (readonly Vec3[])[], targetRadius = 0;
  if (target.kind === "box") {
    const vertices: Vec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x * target.halfExtents[0], y * target.halfExtents[1], z * target.halfExtents[2]]);
    surfaces = [vertices];
  } else if (target.kind === "capsule") {
    surfaces = [[[0, -target.halfHeight, 0], [0, target.halfHeight, 0]]];
    targetRadius = target.radius;
  } else if (target.kind === "convex-hull") surfaces = [target.vertices];
  else if (target.kind === "mesh" || target.kind === "heightfield") surfaces = triangles(target);
  else throw new Error(`Native sweep of moving box against ${target.kind} is not implemented.`);
  const clearance = targetRadius + offset;
  let best: NativeSweepHit | undefined;
  for (const surface of surfaces) {
    const configuration = boxConfiguration(surface, shape, q, body), { hull } = configuration;
    const initialSigned = configurationSignedDistance(center, hull);
    let scale = Math.max(1, length(center));
    for (const vertex of hull.vertices) scale = Math.max(scale, length(vertex));
    if (!Number.isFinite(scale)) throw new Error("Box sweep configuration exceeds the finite numeric range.");
    const numericalTolerance = 64 * Number.EPSILON * scale;
    if (initialSigned < -numericalTolerance) throw new Error("A box initially penetrating a sweep target has no unique impact normal.");

    const result = (fraction: number, normal: Vec3): NativeSweepHit => {
      const surfacePoint = configurationSurface(pointAt(center, delta, fraction), configuration);
      return { fraction, normal: world(normal, body, false), point: world(add(surfacePoint.target, mul(normal, targetRadius)), body, true), collider, body };
    };

    let hit: NativeSweepHit | undefined;
    if (clearance === 0) {
      let enter = -Infinity, exit = Infinity, normal: Vec3 | undefined, tangent = false;
      for (const face of hull.faces) {
        const signed = dot(face.normal, center) - face.constant, speed = dot(face.normal, delta);
        if (Math.abs(speed) <= closingTolerance) {
          if (signed > numericalTolerance) { exit = -Infinity; break; }
          if (signed >= -numericalTolerance) tangent = true;
        } else if (speed < 0) {
          const time = -signed / speed;
          if (time > enter) { enter = time; normal = face.normal; }
        } else exit = Math.min(exit, -signed / speed);
      }
      const fraction = Math.max(0, enter);
      if (!tangent && normal && fraction <= 1 && exit > fraction && !(initialSigned <= numericalTolerance && dot(normal, delta) >= -closingTolerance)) {
        hit = result(fraction, normal);
      }
    } else {
      const separationAt = (fraction: number): Vec3 => configurationSeparation(pointAt(center, delta, fraction), configuration);
      const precisionScale = (fraction: number): number => Math.max(scale, deltaLength * fraction);
      const isGrazing = (start: number): boolean => {
        if (dot(separationAt(1), delta) < 0) return false;
        let lo = start, hi = 1;
        for (let i = 0; i < 128; i++) {
          const middle = (lo + hi) * 0.5;
          if (middle === lo || middle === hi) break;
          if (dot(separationAt(middle), delta) < 0) lo = middle;
          else hi = middle;
        }
        return length(separationAt(hi)) >= clearance - 64 * Number.EPSILON * precisionScale(hi);
      };
      let fraction = 0, complete = false;
      for (let iteration = 0; iteration < 128; iteration++) {
        const position = pointAt(center, delta, fraction), separation = separationAt(fraction), separationLength = length(separation);
        if (separationLength === 0) {
          if (fraction !== 0) throw new Error("Box sweep could not determine a stable contact normal.");
          let normal: Vec3 | undefined, mostSeparatingSpeed = -Infinity;
          for (const face of hull.faces) {
            const signed = dot(face.normal, position) - face.constant, speed = dot(face.normal, delta);
            if (signed >= initialSigned - numericalTolerance && speed > mostSeparatingSpeed) {
              mostSeparatingSpeed = speed;
              normal = face.normal;
            }
          }
          if (!normal) throw new Error("Box sweep could not determine an initial contact normal.");
          if (mostSeparatingSpeed < -closingTolerance) hit = result(0, normal);
          complete = true;
          break;
        }
        const normal = mul(separation, 1 / separationLength), gap = separationLength - clearance;
        const closing = -dot(normal, delta);
        const tolerance = 1e-8 * Math.max(clearance, EPS) + 32 * Number.EPSILON * precisionScale(fraction);
        if (gap <= tolerance) {
          if (!(fraction <= EPS && closing <= closingTolerance) && !isGrazing(fraction)) hit = result(clamp(fraction, 0, 1), normal);
          complete = true;
          break;
        }
        if (closing <= closingTolerance) { complete = true; break; }
        fraction += gap / closing;
        if (fraction > 1 + EPS) { complete = true; break; }
      }
      if (!complete) throw new Error("Native box sweep did not converge within its iteration limit.");
    }
    // Filter each convex surface independently. Discarding a whole mesh here
    // could hide a later wall when an earlier triangle only grazes the shape.
    if (hit && !nonBlockingInitialContact(hit, displacement) && (!best || hit.fraction < best.fraction)) best = hit;
  }
  return best;
}

function validateQueryShape(shape: SphereShape | BoxShape): void {
  if (shape.kind === "sphere") {
    if (!Number.isFinite(shape.radius) || shape.radius <= 0) throw new Error("overlap sphere radius must be finite and positive.");
  } else if (shape.kind === "box") {
    validateFiniteVec3(shape.halfExtents, "overlap box halfExtents");
    if (shape.halfExtents.some((value) => value <= 0)) throw new Error("overlap box halfExtents must be positive.");
  } else throw new Error("Unsupported overlap shape.");
}

function raySphere(o: Vec3, d: Vec3, center: Vec3, radius: number, max: number): Hit | undefined {
  const v = sub(o, center), c = dot(v, v) - radius * radius;
  if (withinRadius(dot(v, v), radius)) return { distance: 0, normal: mul(d, -1) };
  const b = dot(v, d), discriminant = b * b - c;
  if (discriminant < 0) return undefined;
  const t = -b - Math.sqrt(Math.max(0, discriminant));
  if (t < 0 || t > max) return undefined;
  return { distance: t, normal: unit(sub(pointAt(o, d, t), center), "sphere normal") };
}
function rayBox(o: Vec3, d: Vec3, half: Vec3, max: number): Hit | undefined {
  if (Math.abs(o[0]) <= half[0] && Math.abs(o[1]) <= half[1] && Math.abs(o[2]) <= half[2]) return { distance: 0, normal: mul(d, -1) };
  let enter = 0, exit = max, normal: V = mul(d, -1);
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(d[axis]!) <= EPS) { if (o[axis]! < -half[axis]! || o[axis]! > half[axis]!) return undefined; continue; }
    const t1 = (-half[axis]! - o[axis]!) / d[axis]!, t2 = (half[axis]! - o[axis]!) / d[axis]!;
    const near = Math.min(t1, t2), far = Math.max(t1, t2);
    if (near > enter) { enter = near; normal = [0, 0, 0]; normal[axis] = d[axis]! > 0 ? -1 : 1; }
    exit = Math.min(exit, far);
    if (enter > exit) return undefined;
  }
  return enter <= max && exit >= 0 ? { distance: enter, normal } : undefined;
}
function rayCapsule(o: Vec3, d: Vec3, a: Vec3, b: Vec3, radius: number, max: number): Hit | undefined {
  if (withinRadius(distanceSquared(o, closestSegment(o, a, b)), radius)) return { distance: 0, normal: mul(d, -1) };
  const axisVector = sub(b, a), axisLength = length(axisVector);
  if (axisLength <= EPS) return raySphere(o, d, a, radius, max);
  const axis = mul(axisVector, 1 / axisLength), offset = sub(o, a);
  const od = dot(offset, axis), dd = dot(d, axis);
  const p = sub(offset, mul(axis, od)), v = sub(d, mul(axis, dd));
  const aa = dot(v, v), bb = dot(p, v), cc = dot(p, p) - radius * radius;
  let hit: Hit | undefined;
  if (aa > EPS) {
    const discriminant = bb * bb - aa * cc;
    if (discriminant >= 0) {
      for (const t of [(-bb - Math.sqrt(discriminant)) / aa, (-bb + Math.sqrt(discriminant)) / aa]) {
        const along = od + t * dd;
        if (t >= 0 && t <= max && along >= 0 && along <= axisLength) {
          const normal = unit(sub(pointAt(o, d, t), pointAt(a, axis, along)), "capsule normal");
          hit = nearest(hit, { distance: t, normal });
        }
      }
    }
  }
  return nearest(nearest(hit, raySphere(o, d, a, radius, max)), raySphere(o, d, b, radius, max));
}
function rayPlane(o: Vec3, d: Vec3, normal: Vec3, constant: number, radius: number, max: number): Hit | undefined {
  const n = unit(normal, "plane normal"), distance = dot(n, o) - constant - radius;
  if (distance <= 0) return { distance: 0, normal: mul(d, -1) };
  const speed = dot(n, d);
  if (speed >= -EPS) return undefined;
  const t = -distance / speed;
  return t <= max ? { distance: t, normal: n } : undefined;
}
function rayRoundedBox(o: Vec3, d: Vec3, half: Vec3, radius: number, max: number): Hit | undefined {
  if (withinRadius(distanceSquared(o, closestBox(o, half)), radius)) return { distance: 0, normal: mul(d, -1) };
  let hit: Hit | undefined;
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    if (Math.abs(d[axis]!) <= EPS) continue;
    const t = (sign * (half[axis]! + radius) - o[axis]!) / d[axis]!;
    if (t < 0 || t > max || d[axis]! * sign >= 0) continue;
    const p = pointAt(o, d, t);
    if ([0, 1, 2].every((other) => other === axis || Math.abs(p[other]!) <= half[other]! + EPS)) {
      const normal: V = [0, 0, 0]; normal[axis] = sign;
      hit = nearest(hit, { distance: t, normal });
    }
  }
  for (let along = 0; along < 3; along++) {
    const sides = [0, 1, 2].filter((axis) => axis !== along);
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const a: V = [0, 0, 0], b: V = [0, 0, 0];
      a[along] = -half[along]!; b[along] = half[along]!;
      a[sides[0]!] = b[sides[0]!] = s1 * half[sides[0]!]!;
      a[sides[1]!] = b[sides[1]!] = s2 * half[sides[1]!]!;
      hit = nearest(hit, rayCapsule(o, d, a, b, radius, max));
    }
  }
  return hit;
}

function triangles(shape: MeshShape | HeightfieldShape): Triangle[] {
  if (shape.kind === "mesh") {
    const out: Triangle[] = [];
    for (let i = 0; i < shape.indices.length; i += 3) {
      const triangle: Triangle = [shape.vertices[shape.indices[i]!]!, shape.vertices[shape.indices[i + 1]!]!, shape.vertices[shape.indices[i + 2]!]!];
      if (length(cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]))) > 0) out.push(triangle);
    }
    return out;
  }
  const out: Triangle[] = [], width = (shape.columns - 1) * shape.cellSize * 0.5, depth = (shape.rows - 1) * shape.cellSize * 0.5;
  const vertex = (row: number, col: number): V => [col * shape.cellSize - width, shape.heights[row * shape.columns + col]!, row * shape.cellSize - depth];
  for (let row = 0; row < shape.rows - 1; row++) for (let col = 0; col < shape.columns - 1; col++) {
    const a = vertex(row, col), b = vertex(row, col + 1), c = vertex(row + 1, col), d = vertex(row + 1, col + 1);
    out.push([a, c, b], [b, c, d]);
  }
  return out;
}
function rayTriangle(o: Vec3, d: Vec3, triangle: Triangle, max: number, backfaces: boolean): Hit | undefined {
  const [a, b, c] = triangle, e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), determinant = dot(e1, p);
  const area = length(cross(e1, e2)), tolerance = 16 * Number.EPSILON * area;
  if (area === 0 || (backfaces ? Math.abs(determinant) <= tolerance : determinant <= tolerance)) return undefined;
  const inverse = 1 / determinant, fromA = sub(o, a), u = dot(fromA, p) * inverse;
  if (u < -EPS || u > 1 + EPS) return undefined;
  const q = cross(fromA, e1), v = dot(d, q) * inverse;
  if (v < -EPS || u + v > 1 + EPS) return undefined;
  const distance = dot(e2, q) * inverse;
  if (distance < 0 || distance > max) return undefined;
  let normal = mul(cross(e1, e2), 1 / area);
  if (dot(normal, d) > 0) normal = mul(normal, -1);
  return { distance, normal };
}
function sweepSphereTriangle(o: Vec3, d: Vec3, radius: number, triangle: Triangle, max: number, backfaces: boolean): Hit | undefined {
  const raw = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
  const area = length(raw);
  if (area === 0) return undefined;
  const normal = mul(raw, 1 / area), speed = dot(normal, d);
  const signed = dot(normal, sub(o, triangle[0]));
  const initialSeparation = sub(o, closestTriangle(o, triangle));
  if (withinRadius(dot(initialSeparation, initialSeparation), radius)) {
    if (!backfaces && signed < -EPS) return undefined;
    const initialNormal = length(initialSeparation) > EPS ? unit(initialSeparation, "triangle contact normal") : (backfaces && speed > 0 ? mul(normal, -1) : normal);
    return { distance: 0, normal: initialNormal };
  }
  let hit: Hit | undefined;
  if (Math.abs(speed) > EPS) for (const sign of backfaces ? [-1, 1] : [1]) {
    if (speed * sign >= 0) continue;
    const t = (sign * radius - signed) / speed;
    if (t < 0 || t > max) continue;
    const contact = sub(pointAt(o, d, t), mul(normal, sign * radius));
    if (distanceSquared(contact, closestTriangle(contact, triangle)) <= EPS * EPS * 16) {
      hit = nearest(hit, { distance: t, normal: mul(normal, sign) });
    }
  }
  for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]] as const) {
    const edgeHit = rayCapsule(o, d, a, b, radius, max);
    if (edgeHit && (backfaces || signed + speed * edgeHit.distance >= -EPS)) hit = nearest(hit, edgeHit);
  }
  return hit;
}
function closestBox(p: Vec3, half: Vec3): V { return [clamp(p[0], -half[0], half[0]), clamp(p[1], -half[1], half[1]), clamp(p[2], -half[2], half[2])]; }
function closestWorldBox(p: Vec3, center: Vec3, half: Vec3): V { return add(center, closestBox(sub(p, center), half)); }
function distanceSquared(a: Vec3, b: Vec3): number { const d = sub(a, b); return dot(d, d); }
function withinRadius(squaredDistance: number, radius: number): boolean {
  const squaredRadius = radius * radius;
  if (!Number.isFinite(squaredDistance) || !Number.isFinite(squaredRadius)) throw new Error("Native query exceeds the numeric range for squared distances.");
  return squaredDistance <= squaredRadius + 16 * Number.EPSILON * Math.max(squaredDistance, squaredRadius);
}
function closestSegment(p: Vec3, a: Vec3, b: Vec3): V {
  const edge = sub(b, a), squared = dot(edge, edge);
  return squared <= EPS * EPS ? [a[0], a[1], a[2]] : pointAt(a, edge, clamp(dot(sub(p, a), edge) / squared, 0, 1));
}

/** Closest points on two finite line segments. */
function closestSegments(a: Vec3, b: Vec3, c: Vec3, d: Vec3): PointPair {
  const first = sub(b, a), second = sub(d, c), delta = sub(a, c);
  const firstLength = dot(first, first), secondLength = dot(second, second), secondDelta = dot(second, delta);
  let s = 0, t = 0;
  if (firstLength <= EPS * EPS && secondLength <= EPS * EPS) return { moving: a, target: c };
  if (firstLength <= EPS * EPS) t = clamp(secondDelta / secondLength, 0, 1);
  else {
    const firstDelta = dot(first, delta);
    if (secondLength <= EPS * EPS) s = clamp(-firstDelta / firstLength, 0, 1);
    else {
      const alignment = dot(first, second), denominator = firstLength * secondLength - alignment * alignment;
      if (denominator > 16 * Number.EPSILON * firstLength * secondLength) s = clamp((alignment * secondDelta - firstDelta * secondLength) / denominator, 0, 1);
      t = (alignment * s + secondDelta) / secondLength;
      if (t < 0) { t = 0; s = clamp(-firstDelta / firstLength, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((alignment - firstDelta) / firstLength, 0, 1); }
    }
  }
  return { moving: pointAt(a, first, s), target: pointAt(c, second, t) };
}
function closestSegmentTriangle(a: Vec3, b: Vec3, triangle: Triangle): PointPair {
  const segment = sub(b, a), segmentLength = length(segment);
  if (segmentLength > EPS) {
    const hit = rayTriangle(a, mul(segment, 1 / segmentLength), triangle, segmentLength, true);
    if (hit) { const point = pointAt(a, mul(segment, 1 / segmentLength), hit.distance); return { moving: point, target: point }; }
  }
  const pairs: PointPair[] = [{ moving: a, target: closestTriangle(a, triangle) }, { moving: b, target: closestTriangle(b, triangle) }];
  for (const [u, v] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]] as const) {
    pairs.push(closestSegments(a, b, u, v));
  }
  return pairs.reduce((best, pair) => distanceSquared(pair.moving, pair.target) < distanceSquared(best.moving, best.target) ? pair : best);
}

/** Closest point over the triangle's interior, edges and vertices. */
function closestTriangle(p: Vec3, triangle: Triangle): V {
  const [a, b, c] = triangle, ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [a[0], a[1], a[2]];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [b[0], b[1], b[2]];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return pointAt(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [c[0], c[1], c[2]];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return pointAt(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return pointAt(b, sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6));
  const sum = va + vb + vc;
  if (Math.abs(sum) <= 16 * Number.EPSILON * dot(ab, ab) * dot(ac, ac)) {
    return [closestSegment(p, a, b), closestSegment(p, b, c), closestSegment(p, c, a)]
      .reduce((best, candidate) => distanceSquared(p, candidate) < distanceSquared(p, best) ? candidate : best);
  }
  return add(a, add(mul(ab, vb / sum), mul(ac, vc / sum)));
}

/** Incremental convex hull, built from every point rather than display indices. */
function convexHull(shape: ConvexHullShape): Hull {
  const vertices = shape.vertices;
  if (vertices.length < 4) throw new Error("Convex query requires at least four non-coplanar vertices.");
  let scale = 1;
  for (const v of vertices) { validateFiniteVec3(v, "convex vertex"); scale = Math.max(scale, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])); }
  const tolerance = EPS * scale;
  const a = 0;
  let b = 1, best = distanceSquared(vertices[a]!, vertices[b]!);
  for (let i = 2; i < vertices.length; i++) {
    const value = distanceSquared(vertices[a]!, vertices[i]!);
    if (value > best) { best = value; b = i; }
  }
  if (best <= tolerance * tolerance) throw new Error("Convex query vertices are coincident.");
  const ab = sub(vertices[b]!, vertices[a]!);
  let c = -1, bestArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    if (i === a || i === b) continue;
    const area = length(cross(ab, sub(vertices[i]!, vertices[a]!)));
    if (area > bestArea) { bestArea = area; c = i; }
  }
  if (c < 0 || bestArea <= tolerance * Math.sqrt(best)) throw new Error("Convex query vertices are collinear.");
  const baseNormal = unit(cross(ab, sub(vertices[c]!, vertices[a]!)), "convex face normal");
  let d = -1, bestHeight = 0;
  for (let i = 0; i < vertices.length; i++) {
    if (i === a || i === b || i === c) continue;
    const height = Math.abs(dot(baseNormal, sub(vertices[i]!, vertices[a]!)));
    if (height > bestHeight) { bestHeight = height; d = i; }
  }
  if (d < 0 || bestHeight <= tolerance) throw new Error("Convex query vertices are coplanar.");
  const interior = mul(add(add(vertices[a]!, vertices[b]!), add(vertices[c]!, vertices[d]!)), 0.25);
  const makeFace = (i: number, j: number, k: number): Face | undefined => {
    const raw = cross(sub(vertices[j]!, vertices[i]!), sub(vertices[k]!, vertices[i]!));
    if (length(raw) <= tolerance * tolerance) return undefined;
    let normal = unit(raw, "convex face normal");
    if (dot(normal, sub(interior, vertices[i]!)) > 0) { [j, k] = [k, j]; normal = mul(normal, -1); }
    return { a: i, b: j, c: k, normal, constant: dot(normal, vertices[i]!) };
  };
  let faces = [[a, b, c], [a, d, b], [a, c, d], [b, d, c]]
    .map(([i, j, k]) => makeFace(i!, j!, k!)).filter((face): face is Face => face !== undefined);
  const seed = new Set([a, b, c, d]);
  for (let i = 0; i < vertices.length; i++) {
    if (seed.has(i)) continue;
    const visible = faces.filter((face) => dot(face.normal, vertices[i]!) - face.constant > tolerance);
    if (visible.length === 0) continue;
    const boundary = new Map<string, readonly [number, number]>();
    for (const face of visible) for (const edge of [[face.a, face.b], [face.b, face.c], [face.c, face.a]] as const) {
      const key = edge[0] < edge[1] ? `${edge[0]}:${edge[1]}` : `${edge[1]}:${edge[0]}`;
      if (boundary.has(key)) boundary.delete(key); else boundary.set(key, edge);
    }
    const removed = new Set(visible);
    faces = faces.filter((face) => !removed.has(face));
    for (const [from, to] of boundary.values()) {
      const face = makeFace(from, to, i);
      if (face) faces.push(face);
    }
  }
  const edgeIndices = new Map<string, readonly [number, number]>();
  for (const face of faces) for (const edge of [[face.a, face.b], [face.b, face.c], [face.c, face.a]] as const) {
    const key = edge[0] < edge[1] ? `${edge[0]}:${edge[1]}` : `${edge[1]}:${edge[0]}`;
    if (!edgeIndices.has(key)) edgeIndices.set(key, edge);
  }
  return { vertices, faces, edges: [...edgeIndices.values()].map(([i, j]) => [vertices[i]!, vertices[j]!] as const) };
}
function insideHull(point: Vec3, hull: Hull): boolean {
  return hull.faces.every((face) => dot(face.normal, point) - face.constant <= EPS * 16);
}
function rayHull(o: Vec3, d: Vec3, hull: Hull, max: number): Hit | undefined {
  if (insideHull(o, hull)) return { distance: 0, normal: mul(d, -1) };
  let enter = 0, exit = max, normal: Vec3 | undefined;
  for (const face of hull.faces) {
    const denominator = dot(face.normal, d), numerator = face.constant - dot(face.normal, o);
    if (Math.abs(denominator) <= EPS) { if (numerator < 0) return undefined; continue; }
    const t = numerator / denominator;
    if (denominator < 0) { if (t > enter) { enter = t; normal = face.normal; } }
    else exit = Math.min(exit, t);
    if (enter > exit) return undefined;
  }
  return normal && enter <= max && exit >= 0 ? { distance: enter, normal } : undefined;
}
function sweepSphereHull(o: Vec3, d: Vec3, radius: number, hull: Hull, max: number): Hit | undefined {
  if (insideHull(o, hull) || hull.faces.some((face) => withinRadius(distanceSquared(o, closestTriangle(o, [hull.vertices[face.a]!, hull.vertices[face.b]!, hull.vertices[face.c]!])), radius))) {
    return { distance: 0, normal: mul(d, -1) };
  }
  let hit: Hit | undefined;
  for (const face of hull.faces) {
    const speed = dot(face.normal, d);
    if (speed >= -EPS) continue;
    const t = (face.constant + radius - dot(face.normal, o)) / speed;
    if (t < 0 || t > max) continue;
    const surfacePoint = sub(pointAt(o, d, t), mul(face.normal, radius));
    if (insideHull(surfacePoint, hull)) hit = nearest(hit, { distance: t, normal: face.normal });
  }
  for (const [a, b] of hull.edges) hit = nearest(hit, rayCapsule(o, d, a, b, radius, max));
  return hit;
}
function dotAbs(axis: Vec3, half: Vec3): number { return Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2]; }
const BASES: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function separatedFromBox(vertices: readonly Vec3[], axes: readonly Vec3[], half: Vec3): boolean {
  for (const axis of axes) {
    if (dot(axis, axis) <= EPS * EPS) continue;
    let minimum = Infinity, maximum = -Infinity;
    for (const vertex of vertices) { const p = dot(axis, vertex); minimum = Math.min(minimum, p); maximum = Math.max(maximum, p); }
    const radius = dotAbs(axis, half);
    if (minimum > radius + EPS || maximum < -radius - EPS) return true;
  }
  return false;
}
function overlapsBoxes(center: Vec3, half: Vec3, otherCenter: Vec3, otherHalf: Vec3, otherRotation: Quat): boolean {
  const q = rotation(otherRotation), otherAxes = BASES.map((axis) => rotateVec3ByQuat(axis, q));
  const vertices: V[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    vertices.push(sub(add(otherCenter, rotateVec3ByQuat([x * otherHalf[0], y * otherHalf[1], z * otherHalf[2]], q)), center));
  }
  const axes = [...BASES, ...otherAxes];
  for (const a of BASES) for (const b of otherAxes) axes.push(cross(a, b));
  return !separatedFromBox(vertices, axes, half);
}
function overlapsHullBox(hull: Hull, body: RigidBody, center: Vec3, half: Vec3): boolean {
  const vertices = hull.vertices.map((vertex) => sub(world(vertex, body, true), center));
  const axes: Vec3[] = [...BASES, ...hull.faces.map((face) => world(face.normal, body, false))];
  for (const [a, b] of hull.edges) {
    const edge = world(sub(b, a), body, false);
    for (const axis of BASES) axes.push(cross(axis, edge));
  }
  return !separatedFromBox(vertices, axes, half);
}
function overlapsTriangleBox(triangle: Triangle, half: Vec3): boolean {
  const edges = [sub(triangle[1], triangle[0]), sub(triangle[2], triangle[1]), sub(triangle[0], triangle[2])];
  const axes: Vec3[] = [...BASES, cross(edges[0]!, edges[1]!)];
  for (const edge of edges) for (const axis of BASES) axes.push(cross(edge, axis));
  return !separatedFromBox(triangle, axes, half);
}
/** Exact minimum of the piecewise-quadratic point-to-box distance along a segment. */
function segmentBoxDistanceSquared(a: Vec3, b: Vec3, half: Vec3): number {
  const pair = segmentBoxClosest(a, b, half);
  return distanceSquared(pair.moving, pair.target);
}
function segmentBoxClosest(a: Vec3, b: Vec3, half: Vec3): PointPair {
  const velocity = sub(b, a), breaks = [0, 1];
  for (let axis = 0; axis < 3; axis++) if (Math.abs(velocity[axis]!) > EPS) {
    for (const plane of [-half[axis]!, half[axis]!]) {
      const t = (plane - a[axis]!) / velocity[axis]!;
      if (t > 0 && t < 1) breaks.push(t);
    }
  }
  breaks.sort((x, y) => x - y);
  let best = Infinity, pair: PointPair = { moving: a, target: closestBox(a, half) };
  const evaluate = (t: number) => {
    const moving = pointAt(a, velocity, t), target = closestBox(moving, half), distance = distanceSquared(moving, target);
    if (distance < best) { best = distance; pair = { moving, target }; }
  };
  for (let i = 0; i < breaks.length - 1; i++) {
    const lo = breaks[i]!, hi = breaks[i + 1]!, middle = (lo + hi) * 0.5;
    let numerator = 0, denominator = 0;
    for (let axis = 0; axis < 3; axis++) {
      const value = a[axis]! + middle * velocity[axis]!;
      if (value >= -half[axis]! && value <= half[axis]!) continue;
      const offset = a[axis]! - (value < 0 ? -half[axis]! : half[axis]!);
      numerator += offset * velocity[axis]!;
      denominator += velocity[axis]! * velocity[axis]!;
    }
    evaluate(lo); evaluate(hi);
    if (denominator > 0) evaluate(clamp(-numerator / denominator, lo, hi));
  }
  return pair;
}

// Internal geometry shared by the isolated CCD prototype; these helpers are
// not exported from the physics package entry point.
export { convexHull as nativeConvexHullGeometry, triangles as nativeTriangleGeometry, closestTriangle as nativeClosestTriangle };

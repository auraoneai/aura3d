import type { Collider } from "../Collider.js";
import type { RigidBody } from "../RigidBody.js";
import { Shape, addVec3, dotVec3, rotateVec3ByQuat, subVec3, validateFiniteVec3, type Bounds, type PhysicsShape, type Vec3 } from "../Shape.js";

/** One collider/body pair considered as both a possible support and an obstacle. */
export interface NativeSupportObstacle {
  readonly collider: Collider;
  readonly body: RigidBody;
}

/**
 * A fixed-orientation shape follows `origin + t * displacement`, 0 <= t <= 1.
 * This experiment supports spheres, capsules and boxes against boxes and
 * planes when their relative orientations can be represented exactly.
 * All eligible geometry must be supplied; omitting an obstacle invalidates it.
 * Geometry is a synchronous world snapshot; subsequent body motion is not
 * predicted by this certificate.
 */
export interface NativeSupportPathRequest {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly origin: Vec3;
  readonly displacement: Vec3;
  readonly offset: number;
  readonly maxSlopeClimbAngle: number;
  readonly obstacles: readonly NativeSupportObstacle[];
  /**
   * Evaluate moving colliders at their current transforms. Dynamic colliders
   * may support the path only when true; they always obstruct clearance. When
   * omitted, preserve the stricter static-only certificate for direct callers.
   */
  readonly includeDynamicBodies?: boolean;
  /** Require the center's projection to be over a supporting box face. */
  readonly requireCenterSupport?: boolean;
  /** Maximum tolerated normal separation/penetration, in world units. */
  readonly tolerance?: number;
}
/** Backward-compatible name for callers restricted to spheres. */
export type NativeSphereSupportPathRequest = NativeSupportPathRequest;

/** A closed interval of path parameters supported by one planar face. */
export interface NativeSupportInterval {
  readonly start: number;
  readonly end: number;
  readonly bodyId: number;
  readonly colliderId: number;
  readonly normal: Vec3;
}

export type NativeSupportPathResult =
  | { readonly status: "certified"; readonly intervals: readonly NativeSupportInterval[]; readonly tolerance: number }
  | { readonly status: "blocked"; readonly colliderId: number; readonly witnessFraction: number; readonly intervals: readonly NativeSupportInterval[]; readonly tolerance: number }
  | { readonly status: "unsupported"; readonly reason: string; readonly firstUncovered?: number; readonly intervals: readonly NativeSupportInterval[]; readonly tolerance: number };

type MutableVec3 = [number, number, number];
const DEFAULT_TOLERANCE = 1e-9;

function localVector(body: RigidBody, value: Vec3): MutableVec3 {
  const [x, y, z, w] = body.rotation;
  return rotateVec3ByQuat(value, [-x, -y, -z, w]);
}

function validTransform(body: RigidBody): boolean {
  const q = body.rotation;
  return body.position.length === 3 && body.position.every(Number.isFinite) && q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) <= 1e-6;
}

function sameRotation(a: RigidBody, b: RigidBody): boolean {
  return a.rotation.every((value, index) => value === b.rotation[index]) || a.rotation.every((value, index) => value === -b.rotation[index]!);
}

/** Bound the magnitude of local coordinates, including uncentered hulls. */
function shapeMagnitude(shape: PhysicsShape): number {
  switch (shape.kind) {
    case "sphere": return shape.radius;
    case "capsule": return shape.radius + shape.halfHeight;
    case "box": return shape.halfExtents.reduce((sum, value) => sum + Math.abs(value), 0);
    case "mesh":
    case "convex-hull": return shape.vertices.reduce((largest, vertex) => Math.max(largest, Math.abs(vertex[0]) + Math.abs(vertex[1]) + Math.abs(vertex[2])), 0);
    case "heightfield": return (shape.columns - 1) * shape.cellSize / 2 + (shape.rows - 1) * shape.cellSize / 2 + shape.heights.reduce((largest, height) => Math.max(largest, Math.abs(height)), 0);
    case "plane": return Infinity;
  }
}

function finiteBounds(bounds: Bounds): boolean {
  return bounds.min.every(Number.isFinite) && bounds.max.every(Number.isFinite) && bounds.min.every((value, axis) => value <= bounds.max[axis]!);
}

/**
 * A fixed-orientation translation has its exact swept AABB in the union of
 * its endpoint AABBs. A strict separation after padding both shapes for skin,
 * tolerance and numerical error is a sufficient disjointness proof only.
 */
function provablyDisjoint(request: NativeSupportPathRequest, end: Vec3, obstacle: NativeSupportObstacle, tolerance: number): boolean {
  if (obstacle.collider.shape.kind === "plane") return false;
  const startBounds = Shape.bounds(request.collider.shape, request.origin, request.body.rotation);
  const endBounds = Shape.bounds(request.collider.shape, end, request.body.rotation);
  const targetBounds = Shape.bounds(obstacle.collider.shape, obstacle.body.position, obstacle.body.rotation);
  if (!finiteBounds(startBounds) || !finiteBounds(endBounds) || !finiteBounds(targetBounds)) return false;
  const scale = Math.max(
    1, request.offset, shapeMagnitude(request.collider.shape), shapeMagnitude(obstacle.collider.shape),
    ...request.origin.map(Math.abs), ...end.map(Math.abs), ...obstacle.body.position.map(Math.abs),
    ...startBounds.min.map(Math.abs), ...startBounds.max.map(Math.abs),
    ...endBounds.min.map(Math.abs), ...endBounds.max.map(Math.abs),
    ...targetBounds.min.map(Math.abs), ...targetBounds.max.map(Math.abs)
  );
  const rotationError = Math.abs(Math.hypot(...request.body.rotation) - 1) + Math.abs(Math.hypot(...obstacle.body.rotation) - 1);
  const padding = request.offset + tolerance + (512 * Number.EPSILON + 16 * rotationError) * scale;
  if (!Number.isFinite(padding)) return false;
  return [0, 1, 2].some((axis) => {
    const low = Math.min(startBounds.min[axis]!, endBounds.min[axis]!) - padding;
    const high = Math.max(startBounds.max[axis]!, endBounds.max[axis]!) + padding;
    const targetLow = targetBounds.min[axis]! - padding;
    const targetHigh = targetBounds.max[axis]! + padding;
    return [low, high, targetLow, targetHigh].every(Number.isFinite) && (high < targetLow || targetHigh < low);
  });
}

/** Exact relative alignment subsets; other orientations remain unsupported. */
function expandedBoxHalf(request: NativeSupportPathRequest, obstacle: RigidBody, half: Vec3): MutableVec3 | undefined {
  const shape = request.collider.shape;
  const result: MutableVec3 = [...half];
  if (shape.kind === "sphere") return result;
  if (shape.kind === "capsule") {
    // A shared rotation, or two yaw-only rotations, makes the capsule's axis
    // coincide with the target box's local Y axis without a rounded proxy.
    const yawOnly = request.body.rotation[0] === 0 && request.body.rotation[2] === 0 && obstacle.rotation[0] === 0 && obstacle.rotation[2] === 0;
    if (!sameRotation(request.body, obstacle) && !yawOnly) return undefined;
    result[1] += shape.halfHeight;
    return result;
  }
  if (shape.kind === "box") {
    if (!sameRotation(request.body, obstacle)) return undefined;
    for (let axis = 0; axis < 3; axis += 1) result[axis]! += shape.halfExtents[axis]!;
    return result;
  }
  return undefined;
}

function planeSupportRadius(request: NativeSupportPathRequest, normal: Vec3): number {
  const shape = request.collider.shape;
  if (shape.kind === "sphere") return shape.radius + request.offset;
  if (shape.kind === "capsule") {
    const axis = rotateVec3ByQuat([0, 1, 0], request.body.rotation);
    return shape.radius + request.offset + shape.halfHeight * Math.abs(dotVec3(normal, axis));
  }
  if (shape.kind === "box") {
    let support = request.offset;
    for (let index = 0; index < 3; index += 1) {
      const axis: MutableVec3 = [0, 0, 0];
      axis[index] = 1;
      support += shape.halfExtents[index]! * Math.abs(dotVec3(normal, rotateVec3ByQuat(axis, request.body.rotation)));
    }
    return support;
  }
  return NaN;
}

/** Intersect an affine coordinate with one closed box slab. */
function slabInterval(position: number, displacement: number, half: number): readonly [number, number] | undefined {
  if (displacement === 0) return position >= -half && position <= half ? [0, 1] : undefined;
  const first = (-half - position) / displacement;
  const second = (half - position) / displacement;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return undefined;
  return [Math.max(0, Math.min(first, second)), Math.min(1, Math.max(first, second))];
}

/** Exact minimum of the piecewise-quadratic point-to-AABB distance on a segment. */
function segmentBoxMinimum(origin: Vec3, displacement: Vec3, half: Vec3): { distance: number; fraction: number } | undefined {
  const events = [0, 1];
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = displacement[axis]!;
    if (delta === 0) continue;
    for (const boundary of [-half[axis]!, half[axis]!]) {
      const time = (boundary - origin[axis]!) / delta;
      if (!Number.isFinite(time)) return undefined;
      if (time > 0 && time < 1) events.push(time);
    }
  }
  events.sort((a, b) => a - b);
  let best = Infinity;
  let bestFraction = 0;
  const inspect = (time: number): boolean => {
    const residual = [0, 1, 2].map((axis) => {
      const coordinate = origin[axis]! + displacement[axis]! * time;
      return Math.max(0, Math.abs(coordinate) - half[axis]!);
    });
    const distance = Math.hypot(...residual);
    if (!Number.isFinite(distance)) return false;
    if (distance < best) { best = distance; bestFraction = time; }
    return true;
  };
  for (let index = 0; index + 1 < events.length; index += 1) {
    const start = events[index]!, end = events[index + 1]!;
    const middle = (start + end) / 2;
    let quadratic = 0, linear = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = origin[axis]! + displacement[axis]! * middle;
      if (coordinate >= -half[axis]! && coordinate <= half[axis]!) continue;
      const boundary = coordinate < 0 ? -half[axis]! : half[axis]!;
      quadratic += displacement[axis]! ** 2;
      linear += (origin[axis]! - boundary) * displacement[axis]!;
    }
    if (!Number.isFinite(quadratic) || !Number.isFinite(linear)) return undefined;
    const minimum = quadratic > 0 ? Math.min(end, Math.max(start, -linear / quadratic)) : start;
    if (!inspect(start) || !inspect(end) || !inspect(minimum)) return undefined;
  }
  return { distance: best, fraction: bestFraction };
}

/**
 * Certify continuous planar-face contact and full offset-shape clearance
 * along a straight center path, within the returned numerical tolerance.
 *
 * Coverage is an any-contact condition: it does not certify center-of-mass
 * stability, the physical width of a platform, a curved-edge support, or
 * `autoStepMinWidth` parity. A gap in these sufficient intervals is reported
 * as unsupported rather than claiming all possible contacts have been ruled
 * out.
 */
export function certifyNativeSupportPath(request: NativeSupportPathRequest): NativeSupportPathResult {
  validateFiniteVec3(request.origin, "support path origin");
  validateFiniteVec3(request.displacement, "support path displacement");
  if (!Number.isFinite(request.offset) || request.offset < 0) throw new Error("Support path offset must be finite and non-negative.");
  if (!Number.isFinite(request.maxSlopeClimbAngle) || request.maxSlopeClimbAngle < 0 || request.maxSlopeClimbAngle > Math.PI / 2) {
    throw new Error("Support path maximum slope must be in [0, pi/2].");
  }
  if (!Array.isArray(request.obstacles)) throw new Error("Support path obstacles must be an array.");
  if (request.includeDynamicBodies !== undefined && typeof request.includeDynamicBodies !== "boolean") {
    throw new TypeError("Support path includeDynamicBodies must be boolean.");
  }
  if (request.requireCenterSupport !== undefined && typeof request.requireCenterSupport !== "boolean") {
    throw new TypeError("Support path requireCenterSupport must be boolean.");
  }
  if (request.collider.bodyId !== request.body.id || request.collider.sensor) throw new Error("Support path collider must be a non-sensor owned by the character body.");
  Shape.validate(request.collider.shape);
  const tolerance = request.tolerance ?? DEFAULT_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Support path tolerance must be finite and non-negative.");
  const intervals: NativeSupportInterval[] = [];
  const unsupported = (reason: string, firstUncovered?: number): NativeSupportPathResult => ({
    status: "unsupported", reason, ...(firstUncovered === undefined ? {} : { firstUncovered }), intervals, tolerance
  });
  const movingShape = request.collider.shape;
  if (movingShape.kind !== "sphere" && movingShape.kind !== "capsule" && movingShape.kind !== "box") {
    return unsupported("Only sphere, capsule and box moving colliders are supported.");
  }
  if (!validTransform(request.body)) return unsupported("Character transform is not finite and normalized.");
  const radius = (movingShape.kind === "box" ? 0 : movingShape.radius) + request.offset;
  if (!Number.isFinite(radius)) throw new Error("Support path inflated radius must be finite.");
  if (tolerance >= radius) return unsupported("Offset shape radius must exceed the numerical tolerance.");
  const end = addVec3(request.origin, request.displacement);
  if (!end.every(Number.isFinite)) return unsupported("Support path endpoint overflowed.");

  const eligible: NativeSupportObstacle[] = [];
  let intervalRoundoffDistance = 0;
  for (const obstacle of request.obstacles) {
    if (obstacle.collider.bodyId !== obstacle.body.id) throw new Error("Support obstacle collider/body ownership does not match.");
    if (obstacle.body.id === request.body.id || obstacle.collider.sensor || !request.collider.canCollideWith(obstacle.collider)) continue;
    if (!validTransform(obstacle.body)) return unsupported("Obstacle transform is not finite and normalized.");
    Shape.validate(obstacle.collider.shape);
    if (provablyDisjoint(request, end, obstacle, tolerance)) continue;
    if (obstacle.body.type !== "static" && request.includeDynamicBodies === undefined) {
      return unsupported("Moving support or obstacle geometry cannot be certified without snapshot mode.");
    }
    if (obstacle.collider.shape.kind !== "box" && obstacle.collider.shape.kind !== "plane") {
      return unsupported(`Obstacle shape '${obstacle.collider.shape.kind}' is not supported.`);
    }
    const shapeScale = obstacle.collider.shape.kind === "box"
      ? Math.max(...obstacle.collider.shape.halfExtents)
      : Math.abs(obstacle.collider.shape.constant);
    const movingScale = movingShape.kind === "box" ? Math.max(...movingShape.halfExtents) : movingShape.kind === "capsule" ? movingShape.halfHeight : 0;
    const scale = Math.max(1, radius, movingScale, shapeScale, ...request.origin.map(Math.abs), ...request.displacement.map(Math.abs), ...obstacle.body.position.map(Math.abs));
    const rotationError = Math.abs(Math.hypot(...obstacle.body.rotation) - 1) + Math.abs(Math.hypot(...request.body.rotation) - 1);
    if ((64 * Number.EPSILON + 8 * rotationError) * scale > tolerance) {
      return unsupported("Requested tolerance is too small for the obstacle's numeric scale.");
    }
    // Interval endpoints involve a few transforms, subtractions and divisions.
    // Bound their machine-roundoff separately from the user-supplied contact
    // tolerance; that larger tolerance must not silently bridge real gaps.
    intervalRoundoffDistance = Math.max(intervalRoundoffDistance, 32 * Number.EPSILON * scale);
    eligible.push(obstacle);
  }
  const minimumNormalY = Math.cos(request.maxSlopeClimbAngle);
  for (const { collider, body } of eligible) {
    const shape = collider.shape;
    const maySupport = body.type !== "dynamic" || request.includeDynamicBodies === true;
    if (shape.kind === "plane") {
      const normal = rotateVec3ByQuat(shape.normal, body.rotation);
      const support = planeSupportRadius(request, normal);
      const first = dotVec3(normal, subVec3(request.origin, body.position)) - shape.constant;
      const last = dotVec3(normal, subVec3(end, body.position)) - shape.constant;
      if (!Number.isFinite(first) || !Number.isFinite(last) || !Number.isFinite(support)) return unsupported("Plane distance overflowed.");
      if (Math.min(first, last) < support - tolerance) {
        return { status: "blocked", colliderId: collider.id, witnessFraction: first <= last ? 0 : 1, intervals, tolerance };
      }
      if (maySupport && normal[1] > 0 && normal[1] >= minimumNormalY && Math.abs(first - support) <= tolerance && Math.abs(last - support) <= tolerance) {
        intervals.push({ start: 0, end: 1, bodyId: body.id, colliderId: collider.id, normal });
      }
      continue;
    }
    if (shape.kind !== "box") return unsupported("Unsupported obstacle shape.");
    const half = expandedBoxHalf(request, body, shape.halfExtents);
    if (!half || !half.every(Number.isFinite)) return unsupported("Character and obstacle orientations cannot be certified exactly.");
    const localOrigin = localVector(body, subVec3(request.origin, body.position));
    const localDisplacement = localVector(body, request.displacement);
    if (!localOrigin.every(Number.isFinite) || !localDisplacement.every(Number.isFinite)) return unsupported("Box-local path overflowed.");
    const closest = segmentBoxMinimum(localOrigin, localDisplacement, half);
    if (!closest) return unsupported("Box clearance could not be evaluated within finite precision.");
    if (closest.distance < radius - tolerance) {
      return { status: "blocked", colliderId: collider.id, witnessFraction: closest.fraction, intervals, tolerance };
    }
    if (!maySupport) continue;
    for (let faceAxis = 0; faceAxis < 3; faceAxis += 1) for (const sign of [-1, 1]) {
      const localNormal: MutableVec3 = [0, 0, 0];
      localNormal[faceAxis] = sign;
      const normal = rotateVec3ByQuat(localNormal, body.rotation);
      if (normal[1] <= 0 || normal[1] < minimumNormalY) continue;
      const first = sign * localOrigin[faceAxis]! - half[faceAxis]!;
      const last = sign * (localOrigin[faceAxis]! + localDisplacement[faceAxis]!) - half[faceAxis]!;
      if (Math.abs(first - radius) > tolerance || Math.abs(last - radius) > tolerance) continue;
      let start = 0, finish = 1;
      for (let axis = 0; axis < 3; axis += 1) {
        if (axis === faceAxis) continue;
        const supportHalf = request.requireCenterSupport ? shape.halfExtents[axis]! : half[axis]!;
        const slab = slabInterval(localOrigin[axis]!, localDisplacement[axis]!, supportHalf);
        if (!slab) { start = 1; finish = 0; break; }
        start = Math.max(start, slab[0]); finish = Math.min(finish, slab[1]);
      }
      if (start <= finish) intervals.push({ start, end: finish, bodyId: body.id, colliderId: collider.id, normal });
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end || a.colliderId - b.colliderId);
  const pathLength = Math.hypot(...request.displacement);
  const intervalRoundoff = pathLength === 0 ? 0 : intervalRoundoffDistance / pathLength;
  if (!Number.isFinite(intervalRoundoff) || intervalRoundoff >= 1) return unsupported("Support path is too short for its numeric scale.");
  let covered = 0;
  for (const interval of intervals) {
    if (interval.start > covered + intervalRoundoff) return unsupported("Planar support intervals do not cover the entire path.", covered);
    covered = Math.max(covered, interval.end);
    if (covered >= 1 - intervalRoundoff) return { status: "certified", intervals, tolerance };
  }
  return unsupported("Planar support intervals do not cover the entire path.", covered);
}

/** Restrict this certificate to a spherical moving collider. */
export function certifyNativeSphereSupportPath(request: NativeSphereSupportPathRequest): NativeSupportPathResult {
  if (request.collider.shape.kind !== "sphere") {
    return { status: "unsupported", reason: "Only a spherical moving collider is supported by this entrypoint.", intervals: [], tolerance: request.tolerance ?? DEFAULT_TOLERANCE };
  }
  return certifyNativeSupportPath(request);
}

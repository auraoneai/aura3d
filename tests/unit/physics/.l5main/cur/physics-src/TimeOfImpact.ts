import { Shape, subVec3, validateFiniteVec3, type PhysicsShape, type Vec3 } from "./Shape.js";

export type TimeOfImpactHit = {
  /** Seconds from the start of the sweep. */
  readonly time: number;
  /** Contact normal pointing from shape A toward shape B. */
  readonly normal: Vec3;
};

/**
 * Computes the first overlap time for two linearly swept shape bounds.
 *
 * The query is conservative for non-box shapes because it sweeps their world
 * AABBs. Rotation and angular velocity are intentionally outside this query.
 */
export function timeOfImpact(
  shapeA: PhysicsShape,
  positionA: Vec3,
  velocityA: Vec3,
  shapeB: PhysicsShape,
  positionB: Vec3,
  velocityB: Vec3,
  maxTime: number
): TimeOfImpactHit | undefined {
  if (!Number.isFinite(maxTime) || maxTime < 0) {
    throw new Error("timeOfImpact maxTime must be finite and non-negative.");
  }
  validateFiniteVec3(velocityA, "timeOfImpact velocityA");
  validateFiniteVec3(velocityB, "timeOfImpact velocityB");
  const boundsA = Shape.bounds(shapeA, positionA);
  const boundsB = Shape.bounds(shapeB, positionB);
  if (!hasFiniteBounds(boundsA) || !hasFiniteBounds(boundsB)) {
    return undefined;
  }
  const relativeVelocity = subVec3(velocityA, velocityB);
  let entryTime = 0;
  let exitTime = maxTime;
  let entryNormal: Vec3 = initialOverlapNormal(boundsA, boundsB);

  for (let axis = 0; axis < 3; axis += 1) {
    const velocity = relativeVelocity[axis]!;
    if (Math.abs(velocity) <= 1e-12) {
      if (boundsA.max[axis]! < boundsB.min[axis]! || boundsA.min[axis]! > boundsB.max[axis]!) {
        return undefined;
      }
      continue;
    }
    const movingPositive = velocity > 0;
    const axisEntry = movingPositive
      ? (boundsB.min[axis]! - boundsA.max[axis]!) / velocity
      : (boundsB.max[axis]! - boundsA.min[axis]!) / velocity;
    const axisExit = movingPositive
      ? (boundsB.max[axis]! - boundsA.min[axis]!) / velocity
      : (boundsB.min[axis]! - boundsA.max[axis]!) / velocity;
    if (axisEntry > entryTime) {
      entryTime = axisEntry;
      entryNormal = axisVector(axis, movingPositive ? 1 : -1);
    }
    exitTime = Math.min(exitTime, axisExit);
    if (entryTime > exitTime) {
      return undefined;
    }
  }

  if (entryTime < 0 || entryTime > maxTime) {
    return undefined;
  }
  return { time: entryTime, normal: entryNormal };
}

function hasFiniteBounds(bounds: ReturnType<typeof Shape.bounds>): boolean {
  return [...bounds.min, ...bounds.max].every(
    (value) => Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER
  );
}

function initialOverlapNormal(
  a: ReturnType<typeof Shape.bounds>,
  b: ReturnType<typeof Shape.bounds>
): Vec3 {
  const centerA: Vec3 = [
    (a.min[0] + a.max[0]) * 0.5,
    (a.min[1] + a.max[1]) * 0.5,
    (a.min[2] + a.max[2]) * 0.5
  ];
  const centerB: Vec3 = [
    (b.min[0] + b.max[0]) * 0.5,
    (b.min[1] + b.max[1]) * 0.5,
    (b.min[2] + b.max[2]) * 0.5
  ];
  const delta = subVec3(centerB, centerA);
  let axis = 0;
  if (Math.abs(delta[1]) > Math.abs(delta[axis]!)) axis = 1;
  if (Math.abs(delta[2]) > Math.abs(delta[axis]!)) axis = 2;
  return axisVector(axis, delta[axis]! < 0 ? -1 : 1);
}

function axisVector(axis: number, direction: number): Vec3 {
  if (axis === 0) return [direction, 0, 0];
  if (axis === 1) return [0, direction, 0];
  return [0, 0, direction];
}

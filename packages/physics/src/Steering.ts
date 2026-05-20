export type SteeringPoint = readonly [number, number];
export type SteeringVector = readonly [number, number];

export interface SteeringForce {
  readonly force: SteeringVector;
  readonly desiredVelocity: SteeringVector;
  readonly distance: number;
  readonly arrived: boolean;
}

export interface PredictiveSteeringForce extends SteeringForce {
  readonly predictedTarget: SteeringPoint;
  readonly predictionTime: number;
}

export interface WanderSteeringForce extends SteeringForce {
  readonly wanderTarget: SteeringPoint;
  readonly seed: number;
}

export interface FlockingNeighbor {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
}

export interface FlockingSteeringForce extends SteeringForce {
  readonly separation: SteeringVector;
  readonly alignment: SteeringVector;
  readonly cohesion: SteeringVector;
  readonly neighborCount: number;
}

export interface SteeringObstacle {
  readonly position: SteeringPoint;
  readonly radius: number;
  readonly id?: string;
}

export interface ObstacleAvoidanceSteeringForce extends SteeringForce {
  readonly obstacleDetected: boolean;
  readonly obstacleId?: string;
  readonly closestDistance: number;
}

export interface SteeringWall {
  readonly start: SteeringPoint;
  readonly end: SteeringPoint;
  readonly normal: SteeringVector;
  readonly id?: string;
}

export interface WallAvoidanceSteeringForce extends SteeringForce {
  readonly wallDetected: boolean;
  readonly wallId?: string;
  readonly hitDistance: number;
}

export type SteeringBlendMode = "weighted-sum" | "priority";

export interface SteeringPipelineEntry {
  readonly id: string;
  readonly force: SteeringVector;
  readonly weight?: number;
  readonly priority?: number;
  readonly enabled?: boolean;
}

export interface SteeringPipelineResult {
  readonly force: SteeringVector;
  readonly selectedIds: readonly string[];
  readonly mode: SteeringBlendMode;
}

export interface SteeringAgentOptions {
  readonly position: SteeringPoint;
  readonly velocity?: SteeringVector;
  readonly maxSpeed?: number;
  readonly maxForce?: number;
}

export interface SteeringAgentSnapshot {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly speed: number;
  readonly distanceTraveled: number;
}

export function seekSteering(position: SteeringPoint, velocity: SteeringVector, target: SteeringPoint, maxSpeed: number): SteeringForce {
  const toTarget = subtract(target, position);
  const distance = length(toTarget);
  if (distance === 0) {
    return { force: [-velocity[0], -velocity[1]], desiredVelocity: [0, 0], distance: 0, arrived: true };
  }
  const desiredVelocity = scale(toTarget, maxSpeed / distance);
  return {
    force: subtract(desiredVelocity, velocity),
    desiredVelocity,
    distance: round3(distance),
    arrived: false
  };
}

export function arriveSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly target: SteeringPoint;
  readonly maxSpeed: number;
  readonly slowingRadius: number;
  readonly tolerance?: number;
}): SteeringForce {
  const tolerance = options.tolerance ?? 0.02;
  const toTarget = subtract(options.target, options.position);
  const distance = length(toTarget);
  if (distance <= tolerance) {
    return {
      force: [-options.velocity[0], -options.velocity[1]],
      desiredVelocity: [0, 0],
      distance: round3(distance),
      arrived: true
    };
  }
  const desiredSpeed = distance > options.slowingRadius
    ? options.maxSpeed
    : options.maxSpeed * (distance / Math.max(options.slowingRadius, tolerance));
  const desiredVelocity = scale(toTarget, desiredSpeed / distance);
  return {
    force: subtract(desiredVelocity, options.velocity),
    desiredVelocity,
    distance: round3(distance),
    arrived: false
  };
}

export function fleeSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly threat: SteeringPoint;
  readonly maxSpeed: number;
  readonly panicDistance?: number;
}): SteeringForce {
  const panicDistance = options.panicDistance ?? Number.POSITIVE_INFINITY;
  const away = subtract(options.position, options.threat);
  const distance = length(away);
  if (distance > panicDistance || distance === 0) {
    return { force: [0, 0], desiredVelocity: [0, 0], distance: round3(distance), arrived: distance > panicDistance };
  }
  const desiredVelocity = scale(away, options.maxSpeed / distance);
  return {
    force: subtract(desiredVelocity, options.velocity),
    desiredVelocity,
    distance: round3(distance),
    arrived: false
  };
}

export function pursuitSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly targetPosition: SteeringPoint;
  readonly targetVelocity: SteeringVector;
  readonly maxSpeed: number;
  readonly maxPredictionTime?: number;
}): PredictiveSteeringForce {
  const prediction = predictedPoint(options.position, options.velocity, options.targetPosition, options.targetVelocity, options.maxPredictionTime ?? 1);
  const steering = seekSteering(options.position, options.velocity, prediction.point, options.maxSpeed);
  return { ...steering, predictedTarget: prediction.point, predictionTime: prediction.time };
}

export function evadeSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly threatPosition: SteeringPoint;
  readonly threatVelocity: SteeringVector;
  readonly maxSpeed: number;
  readonly maxPredictionTime?: number;
  readonly panicDistance?: number;
}): PredictiveSteeringForce {
  const prediction = predictedPoint(options.position, options.velocity, options.threatPosition, options.threatVelocity, options.maxPredictionTime ?? 1);
  const steering = fleeSteering({
    position: options.position,
    velocity: options.velocity,
    threat: prediction.point,
    maxSpeed: options.maxSpeed,
    panicDistance: options.panicDistance
  });
  return { ...steering, predictedTarget: prediction.point, predictionTime: prediction.time };
}

export function wanderSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly maxSpeed: number;
  readonly seed: number;
  readonly radius?: number;
  readonly distance?: number;
  readonly jitter?: number;
}): WanderSteeringForce {
  const radius = options.radius ?? 0.35;
  const forward = length(options.velocity) > 0.001 ? normalize(options.velocity) : [1, 0] as const;
  const circleCenter = [options.position[0] + forward[0] * (options.distance ?? 0.55), options.position[1] + forward[1] * (options.distance ?? 0.55)] as const;
  const angle = seededUnit(options.seed) * Math.PI * 2;
  const jitter = (options.jitter ?? 0.12) * (seededUnit(options.seed + 1) * 2 - 1);
  const wanderTarget = [
    circleCenter[0] + Math.cos(angle + jitter) * radius,
    circleCenter[1] + Math.sin(angle + jitter) * radius
  ] as const;
  const steering = seekSteering(options.position, options.velocity, wanderTarget, options.maxSpeed);
  return { ...steering, wanderTarget: [round3(wanderTarget[0]), round3(wanderTarget[1])], seed: options.seed };
}

export function flockingSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly neighbors: readonly FlockingNeighbor[];
  readonly maxSpeed: number;
  readonly separationRadius?: number;
  readonly alignmentRadius?: number;
  readonly cohesionRadius?: number;
  readonly separationWeight?: number;
  readonly alignmentWeight?: number;
  readonly cohesionWeight?: number;
}): FlockingSteeringForce {
  const separation = separationSteering(options.position, options.neighbors, options.maxSpeed, options.separationRadius ?? 0.24);
  const alignment = alignmentSteering(options.position, options.velocity, options.neighbors, options.maxSpeed, options.alignmentRadius ?? 0.45);
  const cohesion = cohesionSteering(options.position, options.velocity, options.neighbors, options.maxSpeed, options.cohesionRadius ?? 0.7);
  const force = add(
    scale(separation, options.separationWeight ?? 1.7),
    add(scale(alignment, options.alignmentWeight ?? 0.8), scale(cohesion, options.cohesionWeight ?? 0.9))
  );
  return {
    force: roundVector(force),
    desiredVelocity: roundVector(add(options.velocity, force)),
    distance: round3(options.neighbors.length > 0 ? averageNeighborDistance(options.position, options.neighbors) : 0),
    arrived: options.neighbors.length === 0,
    separation: roundVector(separation),
    alignment: roundVector(alignment),
    cohesion: roundVector(cohesion),
    neighborCount: options.neighbors.length
  };
}

export function obstacleAvoidanceSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly obstacles: readonly SteeringObstacle[];
  readonly maxSpeed: number;
  readonly detectionDistance?: number;
  readonly agentRadius?: number;
  readonly avoidanceForce?: number;
}): ObstacleAvoidanceSteeringForce {
  const speed = length(options.velocity);
  if (speed <= 0.001 || options.obstacles.length === 0) {
    return { force: [0, 0], desiredVelocity: [0, 0], distance: 0, arrived: true, obstacleDetected: false, closestDistance: 0 };
  }
  const forward = normalize(options.velocity);
  const right = perpendicular(forward);
  const detectionDistance = (options.detectionDistance ?? 0.8) * Math.min(1, speed / options.maxSpeed);
  const agentRadius = options.agentRadius ?? 0.08;
  let closest: { readonly obstacle: SteeringObstacle; readonly forwardDistance: number; readonly lateralDistance: number } | undefined;
  for (const obstacle of options.obstacles) {
    const offset = subtract(obstacle.position, options.position);
    const forwardDistance = dot(offset, forward);
    if (forwardDistance < 0 || forwardDistance > detectionDistance) continue;
    const lateralDistance = dot(offset, right);
    const expandedRadius = obstacle.radius + agentRadius;
    if (Math.abs(lateralDistance) > expandedRadius) continue;
    if (!closest || forwardDistance < closest.forwardDistance) {
      closest = { obstacle, forwardDistance, lateralDistance };
    }
  }
  if (!closest) {
    return { force: [0, 0], desiredVelocity: [0, 0], distance: round3(detectionDistance), arrived: true, obstacleDetected: false, closestDistance: round3(detectionDistance) };
  }
  const expandedRadius = closest.obstacle.radius + agentRadius;
  const lateralSign = closest.lateralDistance >= 0 ? -1 : 1;
  const lateralStrength = (expandedRadius - Math.abs(closest.lateralDistance)) / Math.max(expandedRadius, 0.001);
  const brakeStrength = 1 - closest.forwardDistance / Math.max(detectionDistance, 0.001);
  const force = add(
    scale(right, lateralSign * lateralStrength * (options.avoidanceForce ?? options.maxSpeed)),
    scale(forward, -brakeStrength * (options.avoidanceForce ?? options.maxSpeed) * 0.35)
  );
  return {
    force: roundVector(force),
    desiredVelocity: roundVector(add(options.velocity, force)),
    distance: round3(closest.forwardDistance),
    arrived: false,
    obstacleDetected: true,
    obstacleId: closest.obstacle.id,
    closestDistance: round3(closest.forwardDistance)
  };
}

export function wallAvoidanceSteering(options: {
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly walls: readonly SteeringWall[];
  readonly maxSpeed: number;
  readonly whiskerLength?: number;
  readonly whiskerSpread?: number;
  readonly avoidanceForce?: number;
}): WallAvoidanceSteeringForce {
  if (length(options.velocity) <= 0.001 || options.walls.length === 0) {
    return { force: [0, 0], desiredVelocity: [0, 0], distance: 0, arrived: true, wallDetected: false, hitDistance: 0 };
  }
  const forward = normalize(options.velocity);
  const whiskerLength = options.whiskerLength ?? 0.8;
  const spread = options.whiskerSpread ?? Math.PI / 5;
  const whiskers = [
    { direction: forward, lengthScale: 1 },
    { direction: rotate(forward, spread), lengthScale: 0.78 },
    { direction: rotate(forward, -spread), lengthScale: 0.78 }
  ] as const;
  let closest: { readonly wall: SteeringWall; readonly distance: number; readonly normal: SteeringVector; readonly length: number } | undefined;
  for (const whisker of whiskers) {
    const end = add(options.position, scale(whisker.direction, whiskerLength * whisker.lengthScale));
    for (const wall of options.walls) {
      const hit = segmentIntersection(options.position, end, wall.start, wall.end);
      if (!hit) continue;
      const distance = length(subtract(hit, options.position));
      if (!closest || distance < closest.distance) {
        closest = { wall, distance, normal: normalize(wall.normal), length: whiskerLength * whisker.lengthScale };
      }
    }
  }
  if (!closest) {
    return { force: [0, 0], desiredVelocity: [0, 0], distance: round3(whiskerLength), arrived: true, wallDetected: false, hitDistance: round3(whiskerLength) };
  }
  const strength = 1 - closest.distance / Math.max(closest.length, 0.001);
  const force = scale(closest.normal, strength * (options.avoidanceForce ?? options.maxSpeed));
  return {
    force: roundVector(force),
    desiredVelocity: roundVector(add(options.velocity, force)),
    distance: round3(closest.distance),
    arrived: false,
    wallDetected: true,
    wallId: closest.wall.id,
    hitDistance: round3(closest.distance)
  };
}

export function blendSteeringForces(options: {
  readonly entries: readonly SteeringPipelineEntry[];
  readonly mode?: SteeringBlendMode;
  readonly maxForce?: number;
  readonly priorityThreshold?: number;
}): SteeringPipelineResult {
  const mode = options.mode ?? "weighted-sum";
  const enabled = options.entries.filter((entry) => entry.enabled !== false);
  if (mode === "priority") {
    const threshold = options.priorityThreshold ?? 0.001;
    const sorted = [...enabled].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
    const selected = sorted.find((entry) => length(scale(entry.force, entry.weight ?? 1)) > threshold);
    const force = selected ? clampMagnitude(scale(selected.force, selected.weight ?? 1), options.maxForce ?? Number.POSITIVE_INFINITY) : [0, 0] as const;
    return { force: roundVector(force), selectedIds: selected ? [selected.id] : [], mode };
  }
  const force = enabled.reduce<SteeringVector>((sum, entry) => add(sum, scale(entry.force, entry.weight ?? 1)), [0, 0]);
  return {
    force: roundVector(clampMagnitude(force, options.maxForce ?? Number.POSITIVE_INFINITY)),
    selectedIds: enabled.map((entry) => entry.id),
    mode
  };
}

export class SteeringAgent {
  private position: SteeringPoint;
  private velocity: SteeringVector;
  private distanceTraveled = 0;
  private readonly maxSpeed: number;
  private readonly maxForce: number;

  constructor(options: SteeringAgentOptions) {
    this.position = options.position;
    this.velocity = options.velocity ?? [0, 0];
    this.maxSpeed = options.maxSpeed ?? 1;
    this.maxForce = options.maxForce ?? 1;
    if (!Number.isFinite(this.maxSpeed) || this.maxSpeed <= 0 || !Number.isFinite(this.maxForce) || this.maxForce <= 0) {
      throw new RangeError("SteeringAgent maxSpeed and maxForce must be finite positive numbers.");
    }
  }

  apply(force: SteeringVector, deltaSeconds: number): SteeringAgentSnapshot {
    const dt = Math.max(0, deltaSeconds);
    const clampedForce = clampMagnitude(force, this.maxForce);
    this.velocity = clampMagnitude([
      this.velocity[0] + clampedForce[0] * dt,
      this.velocity[1] + clampedForce[1] * dt
    ], this.maxSpeed);
    const step: SteeringVector = [this.velocity[0] * dt, this.velocity[1] * dt];
    this.position = [this.position[0] + step[0], this.position[1] + step[1]];
    this.distanceTraveled += length(step);
    return this.snapshot();
  }

  snapshot(): SteeringAgentSnapshot {
    return {
      position: [round3(this.position[0]), round3(this.position[1])],
      velocity: [round3(this.velocity[0]), round3(this.velocity[1])],
      speed: round3(length(this.velocity)),
      distanceTraveled: round3(this.distanceTraveled)
    };
  }
}

function subtract(left: SteeringPoint, right: SteeringPoint): SteeringVector {
  return [left[0] - right[0], left[1] - right[1]];
}

function add(left: SteeringVector, right: SteeringVector): SteeringVector {
  return [left[0] + right[0], left[1] + right[1]];
}

function scale(value: SteeringVector, scalar: number): SteeringVector {
  return [value[0] * scalar, value[1] * scalar];
}

function dot(left: SteeringVector, right: SteeringVector): number {
  return left[0] * right[0] + left[1] * right[1];
}

function length(value: SteeringVector): number {
  return Math.hypot(value[0], value[1]);
}

function normalize(value: SteeringVector): SteeringVector {
  const magnitude = length(value);
  return magnitude === 0 ? [0, 0] : [value[0] / magnitude, value[1] / magnitude];
}

function clampMagnitude(value: SteeringVector, maxMagnitude: number): SteeringVector {
  const magnitude = length(value);
  if (magnitude <= maxMagnitude || magnitude === 0) return value;
  return scale(value, maxMagnitude / magnitude);
}

function perpendicular(value: SteeringVector): SteeringVector {
  return [-value[1], value[0]];
}

function rotate(value: SteeringVector, radians: number): SteeringVector {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [value[0] * cos - value[1] * sin, value[0] * sin + value[1] * cos];
}

function roundVector(value: SteeringVector): SteeringVector {
  return [round3(value[0]), round3(value[1])];
}

function separationSteering(position: SteeringPoint, neighbors: readonly FlockingNeighbor[], maxSpeed: number, radius: number): SteeringVector {
  let force: SteeringVector = [0, 0];
  let count = 0;
  for (const neighbor of neighbors) {
    const away = subtract(position, neighbor.position);
    const distance = length(away);
    if (distance > 0.001 && distance <= radius) {
      force = add(force, scale(normalize(away), 1 / distance));
      count += 1;
    }
  }
  return count > 0 ? scale(normalize(scale(force, 1 / count)), maxSpeed) : [0, 0];
}

function alignmentSteering(position: SteeringPoint, velocity: SteeringVector, neighbors: readonly FlockingNeighbor[], maxSpeed: number, radius: number): SteeringVector {
  let average: SteeringVector = [0, 0];
  let count = 0;
  for (const neighbor of neighbors) {
    if (length(subtract(neighbor.position, position)) <= radius) {
      average = add(average, neighbor.velocity);
      count += 1;
    }
  }
  if (count === 0 || length(average) === 0) return [0, 0];
  return subtract(scale(normalize(scale(average, 1 / count)), maxSpeed), velocity);
}

function cohesionSteering(position: SteeringPoint, velocity: SteeringVector, neighbors: readonly FlockingNeighbor[], maxSpeed: number, radius: number): SteeringVector {
  let center: SteeringVector = [0, 0];
  let count = 0;
  for (const neighbor of neighbors) {
    const toNeighbor = subtract(neighbor.position, position);
    if (length(toNeighbor) <= radius) {
      center = add(center, neighbor.position);
      count += 1;
    }
  }
  if (count === 0) return [0, 0];
  const target = scale(center, 1 / count);
  return seekSteering(position, velocity, target, maxSpeed).force;
}

function averageNeighborDistance(position: SteeringPoint, neighbors: readonly FlockingNeighbor[]): number {
  return neighbors.reduce((sum, neighbor) => sum + length(subtract(neighbor.position, position)), 0) / Math.max(1, neighbors.length);
}

function segmentIntersection(a: SteeringPoint, b: SteeringPoint, c: SteeringPoint, d: SteeringPoint): SteeringPoint | null {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 0.000001) return null;
  const cMinusA = subtract(c, a);
  const t = cross(cMinusA, s) / denominator;
  const u = cross(cMinusA, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

function cross(left: SteeringVector, right: SteeringVector): number {
  return left[0] * right[1] - left[1] * right[0];
}

function predictedPoint(position: SteeringPoint, velocity: SteeringVector, targetPosition: SteeringPoint, targetVelocity: SteeringVector, maxPredictionTime: number): { readonly point: SteeringPoint; readonly time: number } {
  const toTarget = subtract(targetPosition, position);
  const distance = length(toTarget);
  const relativeSpeed = length(velocity) + length(targetVelocity);
  const predictionTime = Math.min(maxPredictionTime, relativeSpeed > 0.001 ? distance / relativeSpeed : maxPredictionTime);
  return {
    point: [round3(targetPosition[0] + targetVelocity[0] * predictionTime), round3(targetPosition[1] + targetVelocity[1] * predictionTime)],
    time: round3(predictionTime)
  };
}

function seededUnit(seed: number): number {
  let value = (Math.trunc(seed) >>> 0) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

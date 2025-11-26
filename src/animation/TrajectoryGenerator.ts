/**
 * Trajectory generation from player input and navigation paths.
 * Converts user input into smooth future trajectories for motion matching.
 * @module animation/TrajectoryGenerator
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { TrajectorySample } from './MotionFeatures';

/**
 * Player input state for trajectory generation.
 */
export interface PlayerInput {
  /** Movement direction in world space (normalized) */
  moveDirection: Vector3;
  /** Desired facing direction in world space (normalized) */
  facingDirection: Vector3;
  /** Movement speed multiplier (0-1) */
  speed: number;
}

/**
 * Navigation path waypoint.
 */
export interface PathWaypoint {
  /** Position in world space */
  position: Vector3;
  /** Facing direction at this point */
  direction: Vector3;
}

/**
 * Configuration for trajectory generation.
 */
export interface TrajectoryConfig {
  /** Prediction times for trajectory samples (seconds) */
  predictionTimes?: number[];
  /** Smoothing factor for trajectory (0-1, higher = smoother) */
  smoothing?: number;
  /** Maximum speed for trajectory extrapolation */
  maxSpeed?: number;
  /** Whether to predict rotation as well as position */
  predictRotation?: boolean;
}

/**
 * Default trajectory configuration.
 */
const DEFAULT_TRAJECTORY_CONFIG: Required<TrajectoryConfig> = {
  predictionTimes: [0.33, 0.66, 1.0],
  smoothing: 0.8,
  maxSpeed: 5.0,
  predictRotation: true
};

/**
 * Generates smooth future trajectories from player input or navigation paths.
 * Used to predict where the character will move for motion matching.
 *
 * @example
 * ```typescript
 * const generator = new TrajectoryGenerator({
 *   predictionTimes: [0.2, 0.4, 0.6, 0.8, 1.0],
 *   smoothing: 0.85,
 *   maxSpeed: 6.0
 * });
 *
 * // From player input
 * const input: PlayerInput = {
 *   moveDirection: new Vector3(1, 0, 0).normalize(),
 *   facingDirection: new Vector3(1, 0, 0).normalize(),
 *   speed: 1.0
 * };
 * const trajectory = generator.generateFromInput(currentPosition, input);
 *
 * // From navigation path
 * const path = [
 *   { position: new Vector3(0, 0, 0), direction: Vector3.forward() },
 *   { position: new Vector3(10, 0, 0), direction: Vector3.forward() },
 *   { position: new Vector3(10, 0, 10), direction: Vector3.right() }
 * ];
 * const pathTrajectory = generator.generateFromPath(currentPosition, path);
 * ```
 */
export class TrajectoryGenerator {
  /**
   * Prediction times for trajectory samples.
   */
  private readonly predictionTimes: number[];

  /**
   * Smoothing factor for trajectory interpolation.
   */
  private readonly smoothing: number;

  /**
   * Maximum speed for predictions.
   */
  private readonly maxSpeed: number;

  /**
   * Whether to predict rotation.
   */
  private readonly predictRotation: boolean;

  /**
   * Previous trajectory for smoothing.
   */
  private previousTrajectory: TrajectorySample[] | null;

  /**
   * Creates a trajectory generator.
   *
   * @param config - Trajectory configuration
   *
   * @example
   * ```typescript
   * const generator = new TrajectoryGenerator({
   *   predictionTimes: [0.33, 0.66, 1.0],
   *   smoothing: 0.9,
   *   maxSpeed: 8.0
   * });
   * ```
   */
  constructor(config: TrajectoryConfig = {}) {
    const fullConfig = { ...DEFAULT_TRAJECTORY_CONFIG, ...config };

    this.predictionTimes = fullConfig.predictionTimes;
    this.smoothing = fullConfig.smoothing;
    this.maxSpeed = fullConfig.maxSpeed;
    this.predictRotation = fullConfig.predictRotation;
    this.previousTrajectory = null;
  }

  /**
   * Generates trajectory from player input.
   *
   * @param currentPosition - Current character position
   * @param input - Player input state
   * @returns Array of trajectory samples
   *
   * @example
   * ```typescript
   * const input: PlayerInput = {
   *   moveDirection: new Vector3(1, 0, 1).normalize(),
   *   facingDirection: new Vector3(1, 0, 0).normalize(),
   *   speed: 0.8
   * };
   * const trajectory = generator.generateFromInput(characterPos, input);
   * ```
   */
  generateFromInput(currentPosition: Vector3, input: PlayerInput): TrajectorySample[] {
    const samples: TrajectorySample[] = [];

    const velocity = input.moveDirection.scale(input.speed * this.maxSpeed);

    for (const predictionTime of this.predictionTimes) {
      const predictedPosition = currentPosition.add(velocity.scale(predictionTime));

      const facingDirection = this.predictRotation
        ? this.interpolateDirection(input.moveDirection, input.facingDirection, predictionTime)
        : input.facingDirection.clone();

      samples.push({
        position: predictedPosition,
        direction: facingDirection
      });
    }

    return this.applySmoothing(samples);
  }

  /**
   * Generates trajectory from navigation path.
   *
   * @param currentPosition - Current character position
   * @param path - Navigation path waypoints
   * @returns Array of trajectory samples
   *
   * @example
   * ```typescript
   * const path = [
   *   { position: new Vector3(5, 0, 0), direction: Vector3.forward() },
   *   { position: new Vector3(10, 0, 0), direction: Vector3.forward() }
   * ];
   * const trajectory = generator.generateFromPath(currentPos, path);
   * ```
   */
  generateFromPath(currentPosition: Vector3, path: PathWaypoint[]): TrajectorySample[] {
    if (path.length === 0) {
      return this.generateFromInput(currentPosition, {
        moveDirection: Vector3.zero(),
        facingDirection: Vector3.forward(),
        speed: 0
      });
    }

    const samples: TrajectorySample[] = [];

    for (const predictionTime of this.predictionTimes) {
      const sample = this.samplePathAtTime(currentPosition, path, predictionTime);
      samples.push(sample);
    }

    return this.applySmoothing(samples);
  }

  /**
   * Generates trajectory interpolated between current and target.
   *
   * @param currentPosition - Current position
   * @param currentDirection - Current facing direction
   * @param targetPosition - Target position to reach
   * @param targetDirection - Target facing direction
   * @param arrivalTime - Time to reach target (seconds)
   * @returns Array of trajectory samples
   *
   * @example
   * ```typescript
   * const trajectory = generator.generateToTarget(
   *   currentPos,
   *   currentDir,
   *   targetPos,
   *   targetDir,
   *   1.5 // Reach target in 1.5 seconds
   * );
   * ```
   */
  generateToTarget(
    currentPosition: Vector3,
    currentDirection: Vector3,
    targetPosition: Vector3,
    targetDirection: Vector3,
    arrivalTime: number
  ): TrajectorySample[] {
    const samples: TrajectorySample[] = [];

    for (const predictionTime of this.predictionTimes) {
      const t = Math.min(predictionTime / arrivalTime, 1.0);

      const easedT = this.easeInOutCubic(t);

      const position = currentPosition.lerp(targetPosition, easedT);
      const direction = this.slerpDirection(currentDirection, targetDirection, easedT);

      samples.push({ position, direction });
    }

    return this.applySmoothing(samples);
  }

  /**
   * Generates straight-line trajectory in a direction.
   *
   * @param currentPosition - Current position
   * @param direction - Movement direction (normalized)
   * @param speed - Movement speed
   * @returns Array of trajectory samples
   *
   * @example
   * ```typescript
   * const trajectory = generator.generateStraight(
   *   currentPos,
   *   Vector3.forward(),
   *   5.0
   * );
   * ```
   */
  generateStraight(
    currentPosition: Vector3,
    direction: Vector3,
    speed: number
  ): TrajectorySample[] {
    return this.generateFromInput(currentPosition, {
      moveDirection: direction,
      facingDirection: direction,
      speed: speed / this.maxSpeed
    });
  }

  /**
   * Generates zero trajectory (standing still).
   *
   * @param currentPosition - Current position
   * @param facingDirection - Current facing direction
   * @returns Array of trajectory samples (all at current position)
   *
   * @example
   * ```typescript
   * const idleTrajectory = generator.generateIdle(currentPos, currentDir);
   * ```
   */
  generateIdle(currentPosition: Vector3, facingDirection: Vector3): TrajectorySample[] {
    const samples: TrajectorySample[] = [];

    for (let i = 0; i < this.predictionTimes.length; i++) {
      samples.push({
        position: currentPosition.clone(),
        direction: facingDirection.clone()
      });
    }

    return samples;
  }

  /**
   * Resets smoothing state (call when teleporting character).
   *
   * @example
   * ```typescript
   * character.teleport(newPosition);
   * generator.reset();
   * ```
   */
  reset(): void {
    this.previousTrajectory = null;
  }

  /**
   * Samples a point on the path at a given time offset.
   * @private
   */
  private samplePathAtTime(
    currentPosition: Vector3,
    path: PathWaypoint[],
    time: number
  ): TrajectorySample {
    const firstWaypoint = path[0];
    const distanceToFirst = Vector3.distance(currentPosition, firstWaypoint.position);
    const timeToFirst = distanceToFirst / this.maxSpeed;

    if (time <= timeToFirst) {
      const t = time / timeToFirst;
      const position = currentPosition.lerp(firstWaypoint.position, t);
      const direction = firstWaypoint.position
        .sub(currentPosition)
        .normalize();

      return { position, direction };
    }

    let accumulatedTime = timeToFirst;
    let accumulatedDistance = distanceToFirst;

    for (let i = 0; i < path.length - 1; i++) {
      const current = path[i];
      const next = path[i + 1];

      const segmentDistance = Vector3.distance(current.position, next.position);
      const segmentTime = segmentDistance / this.maxSpeed;

      if (accumulatedTime + segmentTime >= time) {
        const timeInSegment = time - accumulatedTime;
        const t = timeInSegment / segmentTime;

        const position = current.position.lerp(next.position, t);
        const direction = this.slerpDirection(current.direction, next.direction, t);

        return { position, direction };
      }

      accumulatedTime += segmentTime;
      accumulatedDistance += segmentDistance;
    }

    const lastWaypoint = path[path.length - 1];
    const remainingTime = time - accumulatedTime;
    const extrapolatedPosition = lastWaypoint.position.add(
      lastWaypoint.direction.scale(remainingTime * this.maxSpeed)
    );

    return {
      position: extrapolatedPosition,
      direction: lastWaypoint.direction.clone()
    };
  }

  /**
   * Applies temporal smoothing to trajectory samples.
   * @private
   */
  private applySmoothing(samples: TrajectorySample[]): TrajectorySample[] {
    if (!this.previousTrajectory || this.smoothing <= 0) {
      this.previousTrajectory = samples;
      return samples;
    }

    const smoothed: TrajectorySample[] = [];

    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      const previous = this.previousTrajectory[i] ?? current;

      const position = previous.position.lerp(current.position, 1.0 - this.smoothing);
      const direction = this.slerpDirection(
        previous.direction,
        current.direction,
        1.0 - this.smoothing
      );

      smoothed.push({ position, direction });
    }

    this.previousTrajectory = smoothed;
    return smoothed;
  }

  /**
   * Interpolates between two directions over time.
   * @private
   */
  private interpolateDirection(
    moveDirection: Vector3,
    facingDirection: Vector3,
    time: number
  ): Vector3 {
    const t = Math.min(time, 1.0);

    if (moveDirection.lengthSquared() < 1e-6) {
      return facingDirection.clone();
    }

    return this.slerpDirection(facingDirection, moveDirection, t);
  }

  /**
   * Spherical linear interpolation for directions.
   * @private
   */
  private slerpDirection(from: Vector3, to: Vector3, t: number): Vector3 {
    const fromNorm = from.normalize();
    const toNorm = to.normalize();

    const dot = fromNorm.dot(toNorm);

    if (dot > 0.9999) {
      return fromNorm.lerp(toNorm, t).normalize();
    }

    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const sinAngle = Math.sin(angle);

    if (Math.abs(sinAngle) < 1e-6) {
      return fromNorm.clone();
    }

    const a = Math.sin((1 - t) * angle) / sinAngle;
    const b = Math.sin(t * angle) / sinAngle;

    return fromNorm.scale(a).add(toNorm.scale(b)).normalize();
  }

  /**
   * Ease-in-out cubic function for smooth interpolation.
   * @private
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

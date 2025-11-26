/**
 * @fileoverview Obstacle avoidance using raycasting for static obstacles.
 * @module ai/steering/ObstacleAvoidance
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Obstacle representation for avoidance calculations.
 */
export interface Obstacle {
  /** Obstacle center position */
  position: Vector3;
  /** Obstacle radius */
  radius: number;
}

/**
 * Obstacle avoidance behavior uses look-ahead raycasting to detect and avoid obstacles.
 * Casts rays in front of the agent and applies avoidance force when obstacles are detected.
 *
 * @example
 * ```typescript
 * const obstacles = [
 *   { position: new Vector3(10, 0, 10), radius: 2 },
 *   { position: new Vector3(20, 0, 15), radius: 3 }
 * ];
 *
 * const avoidance = new ObstacleAvoidance({
 *   detectionDistance: 15,
 *   avoidanceForce: 2.0
 * });
 *
 * // In update loop
 * avoidance.setObstacles(obstacles);
 * const force = avoidance.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class ObstacleAvoidance extends SteeringBehavior {
  /** Detection distance for obstacles */
  detectionDistance: number;

  /** Force multiplier for avoidance */
  avoidanceForce: number;

  /** Agent radius for collision checking */
  agentRadius: number;

  /** Current obstacles */
  private obstacles: Obstacle[];

  /**
   * Creates a new obstacle avoidance behavior.
   *
   * @param options - Optional configuration
   */
  constructor(
    options: {
      detectionDistance?: number;
      avoidanceForce?: number;
      agentRadius?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'ObstacleAvoidance' });
    this.detectionDistance = options.detectionDistance ?? 10.0;
    this.avoidanceForce = options.avoidanceForce ?? 2.0;
    this.agentRadius = options.agentRadius ?? 0.5;
    this.obstacles = [];
  }

  /**
   * Sets the obstacles for avoidance calculations.
   *
   * @param obstacles - Array of obstacles
   */
  setObstacles(obstacles: Obstacle[]): void {
    this.obstacles = obstacles;
  }

  /**
   * Calculates the obstacle avoidance steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    if (this.obstacles.length === 0 || velocity.lengthSquared() < 0.001) {
      return Vector3.zero();
    }

    const forward = velocity.normalize();
    const detectionBox = this.detectionDistance * (velocity.length() / maxSpeed);

    let closestObstacle: Obstacle | null = null;
    let closestDistance = Infinity;
    let closestLocalPos: Vector3 | null = null;

    // Find closest threatening obstacle
    for (const obstacle of this.obstacles) {
      // Transform obstacle to local space (agent forward = -Z)
      const localPos = this.worldToLocal(position, forward, obstacle.position);

      // Skip if behind agent
      if (localPos.z > 0) {
        continue;
      }

      // Check if in detection box
      const expandedRadius = obstacle.radius + this.agentRadius;

      if (Math.abs(localPos.x) < expandedRadius && Math.abs(localPos.z) < detectionBox) {
        // Calculate distance along forward direction
        const distance = Math.abs(localPos.z);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestObstacle = obstacle;
          closestLocalPos = localPos;
        }
      }
    }

    // No threatening obstacle found
    if (!closestObstacle || !closestLocalPos) {
      return Vector3.zero();
    }

    // Calculate avoidance force
    const expandedRadius = closestObstacle.radius + this.agentRadius;

    // Lateral force (perpendicular to forward)
    const lateralForce = (expandedRadius - Math.abs(closestLocalPos.x)) * this.avoidanceForce;
    const steerX = closestLocalPos.x < 0 ? lateralForce : -lateralForce;

    // Braking force (opposite to forward)
    const brakingForce = (expandedRadius - Math.abs(closestLocalPos.z)) * this.avoidanceForce;

    // Create local force
    const localForce = new Vector3(steerX, 0, brakingForce);

    // Transform back to world space
    return this.localToWorld(forward, localForce);
  }

  /**
   * Transforms a world position to local space (agent-relative).
   * @private
   */
  private worldToLocal(agentPos: Vector3, forward: Vector3, worldPos: Vector3): Vector3 {
    const offset = worldPos.sub(agentPos);

    // Create right vector
    const right = Vector3.up().cross(forward).normalize();

    // Project onto local axes
    const localX = offset.dot(right);
    const localZ = -offset.dot(forward); // -Z is forward
    const localY = offset.y;

    return new Vector3(localX, localY, localZ);
  }

  /**
   * Transforms a local vector to world space.
   * @private
   */
  private localToWorld(forward: Vector3, localVec: Vector3): Vector3 {
    const right = Vector3.up().cross(forward).normalize();
    const up = forward.cross(right);

    const worldVec = Vector3.zero();
    worldVec.addInPlace(right.scale(localVec.x));
    worldVec.addInPlace(up.scale(localVec.y));
    worldVec.addInPlace(forward.scale(-localVec.z)); // -Z is forward

    return worldVec;
  }

  /**
   * Adds an obstacle to the list.
   *
   * @param obstacle - Obstacle to add
   */
  addObstacle(obstacle: Obstacle): void {
    this.obstacles.push(obstacle);
  }

  /**
   * Removes all obstacles.
   */
  clearObstacles(): void {
    this.obstacles = [];
  }

  /**
   * Gets the number of obstacles.
   */
  getObstacleCount(): number {
    return this.obstacles.length;
  }

  /**
   * Checks if there's an obstacle in the detection path.
   *
   * @param position - Current position
   * @param velocity - Current velocity
   * @returns True if obstacle detected
   */
  isObstacleAhead(position: Vector3, velocity: Vector3): boolean {
    if (this.obstacles.length === 0 || velocity.lengthSquared() < 0.001) {
      return false;
    }

    const forward = velocity.normalize();
    const detectionBox = this.detectionDistance;

    for (const obstacle of this.obstacles) {
      const localPos = this.worldToLocal(position, forward, obstacle.position);

      if (localPos.z > 0) {
        continue;
      }

      const expandedRadius = obstacle.radius + this.agentRadius;

      if (Math.abs(localPos.x) < expandedRadius && Math.abs(localPos.z) < detectionBox) {
        return true;
      }
    }

    return false;
  }
}

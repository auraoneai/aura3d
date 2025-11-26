/**
 * @fileoverview Wall avoidance using whisker raycasting.
 * @module ai/steering/WallAvoidance
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Wall representation for avoidance calculations.
 */
export interface Wall {
  /** Wall start point */
  start: Vector3;
  /** Wall end point */
  end: Vector3;
  /** Wall normal (pointing away from solid side) */
  normal: Vector3;
}

/**
 * Whisker configuration for raycasting.
 */
interface Whisker {
  /** Whisker angle offset from forward (radians) */
  angle: number;
  /** Whisker length multiplier */
  length: number;
}

/**
 * Wall avoidance behavior uses whisker raycasting to detect and avoid walls.
 * Casts multiple rays (whiskers) in a forward arc to detect nearby walls.
 *
 * @example
 * ```typescript
 * const walls = [
 *   {
 *     start: new Vector3(0, 0, 0),
 *     end: new Vector3(100, 0, 0),
 *     normal: new Vector3(0, 0, -1)
 *   }
 * ];
 *
 * const wallAvoidance = new WallAvoidance({
 *   whiskerLength: 10,
 *   whiskerCount: 5
 * });
 *
 * // In update loop
 * wallAvoidance.setWalls(walls);
 * const force = wallAvoidance.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class WallAvoidance extends SteeringBehavior {
  /** Base whisker length */
  whiskerLength: number;

  /** Number of whiskers */
  whiskerCount: number;

  /** Whisker spread angle (radians) */
  whiskerSpread: number;

  /** Force multiplier for avoidance */
  avoidanceForce: number;

  /** Current walls */
  private walls: Wall[];

  /** Whisker configurations */
  private whiskers: Whisker[];

  /**
   * Creates a new wall avoidance behavior.
   *
   * @param options - Optional configuration
   */
  constructor(
    options: {
      whiskerLength?: number;
      whiskerCount?: number;
      whiskerSpread?: number;
      avoidanceForce?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'WallAvoidance' });
    this.whiskerLength = options.whiskerLength ?? 10.0;
    this.whiskerCount = options.whiskerCount ?? 5;
    this.whiskerSpread = options.whiskerSpread ?? Math.PI / 3; // 60 degrees
    this.avoidanceForce = options.avoidanceForce ?? 2.0;
    this.walls = [];

    this.whiskers = [];
    this.generateWhiskers();
  }

  /**
   * Generates whisker configurations.
   * @private
   */
  private generateWhiskers(): void {
    this.whiskers = [];

    // Center whisker
    this.whiskers.push({ angle: 0, length: 1.0 });

    // Side whiskers
    for (let i = 1; i <= Math.floor(this.whiskerCount / 2); i++) {
      const t = i / Math.ceil(this.whiskerCount / 2);
      const angle = t * this.whiskerSpread;

      // Shorter whiskers at wider angles
      const lengthMultiplier = 1.0 - t * 0.3;

      this.whiskers.push({ angle: angle, length: lengthMultiplier });
      this.whiskers.push({ angle: -angle, length: lengthMultiplier });
    }
  }

  /**
   * Sets the walls for avoidance calculations.
   *
   * @param walls - Array of walls
   */
  setWalls(walls: Wall[]): void {
    this.walls = walls;
  }

  /**
   * Calculates the wall avoidance steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    if (this.walls.length === 0 || velocity.lengthSquared() < 0.001) {
      return Vector3.zero();
    }

    const forward = velocity.normalize();
    const force = Vector3.zero();

    // Cast whiskers
    for (const whisker of this.whiskers) {
      const whiskerDir = this.rotateVector(forward, whisker.angle);
      const whiskerEnd = position.add(whiskerDir.scale(this.whiskerLength * whisker.length));

      // Check intersection with walls
      const hit = this.raycastWalls(position, whiskerEnd);

      if (hit) {
        // Calculate avoidance force
        const distanceFactor = 1.0 - hit.distance / (this.whiskerLength * whisker.length);
        const avoidForce = hit.normal.scale(distanceFactor * this.avoidanceForce);
        force.addInPlace(avoidForce);
      }
    }

    return force;
  }

  /**
   * Raycasts against all walls and returns closest hit.
   * @private
   */
  private raycastWalls(
    start: Vector3,
    end: Vector3
  ): { point: Vector3; normal: Vector3; distance: number } | null {
    let closestHit: { point: Vector3; normal: Vector3; distance: number } | null = null;
    let closestDistance = Infinity;

    for (const wall of this.walls) {
      const hit = this.lineIntersection(start, end, wall.start, wall.end);

      if (hit) {
        const distance = Vector3.distance(start, hit);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestHit = {
            point: hit,
            normal: wall.normal.clone(),
            distance: distance,
          };
        }
      }
    }

    return closestHit;
  }

  /**
   * Calculates 2D line-line intersection (ignores Y).
   * @private
   */
  private lineIntersection(
    p1: Vector3,
    p2: Vector3,
    p3: Vector3,
    p4: Vector3
  ): Vector3 | null {
    const x1 = p1.x, z1 = p1.z;
    const x2 = p2.x, z2 = p2.z;
    const x3 = p3.x, z3 = p3.z;
    const x4 = p4.x, z4 = p4.z;

    const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);

    if (Math.abs(denom) < 0.001) {
      return null; // Parallel
    }

    const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return new Vector3(x1 + t * (x2 - x1), p1.y, z1 + t * (z2 - z1));
    }

    return null;
  }

  /**
   * Rotates a vector around Y axis.
   * @private
   */
  private rotateVector(vec: Vector3, angle: number): Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new Vector3(
      vec.x * cos - vec.z * sin,
      vec.y,
      vec.x * sin + vec.z * cos
    );
  }

  /**
   * Adds a wall to the list.
   *
   * @param wall - Wall to add
   */
  addWall(wall: Wall): void {
    this.walls.push(wall);
  }

  /**
   * Removes all walls.
   */
  clearWalls(): void {
    this.walls = [];
  }

  /**
   * Gets the number of walls.
   */
  getWallCount(): number {
    return this.walls.length;
  }

  /**
   * Updates whisker configuration.
   *
   * @param count - Number of whiskers
   * @param spread - Spread angle in radians
   */
  updateWhiskers(count: number, spread: number): void {
    this.whiskerCount = count;
    this.whiskerSpread = spread;
    this.generateWhiskers();
  }
}

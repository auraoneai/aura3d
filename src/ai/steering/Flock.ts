/**
 * @fileoverview Flocking behavior implementing Reynolds' boids algorithm.
 * @module ai/steering/Flock
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Neighbor data for flocking calculations.
 */
export interface Neighbor {
  /** Neighbor position */
  position: Vector3;
  /** Neighbor velocity */
  velocity: Vector3;
}

/**
 * Flocking behavior implementing Craig Reynolds' boids algorithm.
 * Combines three behaviors: separation, alignment, and cohesion.
 *
 * @example
 * ```typescript
 * const flock = new Flock({
 *   separationRadius: 5,
 *   alignmentRadius: 10,
 *   cohesionRadius: 15,
 *   separationWeight: 2.0,
 *   alignmentWeight: 1.0,
 *   cohesionWeight: 1.0
 * });
 *
 * // In update loop
 * const neighbors = getNearbyBoids(agent);
 * flock.setNeighbors(neighbors);
 * const force = flock.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Flock extends SteeringBehavior {
  /** Radius for separation behavior */
  separationRadius: number;

  /** Radius for alignment behavior */
  alignmentRadius: number;

  /** Radius for cohesion behavior */
  cohesionRadius: number;

  /** Weight for separation component */
  separationWeight: number;

  /** Weight for alignment component */
  alignmentWeight: number;

  /** Weight for cohesion component */
  cohesionWeight: number;

  /** Current neighbors */
  private neighbors: Neighbor[];

  /**
   * Creates a new flock behavior.
   *
   * @param options - Optional configuration
   */
  constructor(
    options: {
      separationRadius?: number;
      alignmentRadius?: number;
      cohesionRadius?: number;
      separationWeight?: number;
      alignmentWeight?: number;
      cohesionWeight?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Flock' });
    this.separationRadius = options.separationRadius ?? 5.0;
    this.alignmentRadius = options.alignmentRadius ?? 10.0;
    this.cohesionRadius = options.cohesionRadius ?? 15.0;
    this.separationWeight = options.separationWeight ?? 2.0;
    this.alignmentWeight = options.alignmentWeight ?? 1.0;
    this.cohesionWeight = options.cohesionWeight ?? 1.0;
    this.neighbors = [];
  }

  /**
   * Sets the neighbors for flocking calculations.
   *
   * @param neighbors - Array of neighbor data
   */
  setNeighbors(neighbors: Neighbor[]): void {
    this.neighbors = neighbors;
  }

  /**
   * Calculates the flocking steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    if (this.neighbors.length === 0) {
      return Vector3.zero();
    }

    const separation = this.calculateSeparation(position, maxSpeed);
    const alignment = this.calculateAlignment(velocity, maxSpeed);
    const cohesion = this.calculateCohesion(position, velocity, maxSpeed);

    // Combine with weights
    const force = Vector3.zero();
    force.addInPlace(separation.scale(this.separationWeight));
    force.addInPlace(alignment.scale(this.alignmentWeight));
    force.addInPlace(cohesion.scale(this.cohesionWeight));

    return force;
  }

  /**
   * Calculates separation force (avoid crowding neighbors).
   * @private
   */
  private calculateSeparation(position: Vector3, maxSpeed: number): Vector3 {
    const force = Vector3.zero();
    let count = 0;

    for (const neighbor of this.neighbors) {
      const toNeighbor = position.sub(neighbor.position);
      const distanceSq = toNeighbor.lengthSquared();

      if (distanceSq < this.separationRadius * this.separationRadius && distanceSq > 0.001) {
        // Force inversely proportional to distance
        const distance = Math.sqrt(distanceSq);
        force.addInPlace(toNeighbor.normalize().scale(1 / distance));
        count++;
      }
    }

    if (count > 0) {
      // Average and normalize
      force.scaleInPlace(1 / count);
      force.normalizeInPlace();
      force.scaleInPlace(maxSpeed);
      return force;
    }

    return Vector3.zero();
  }

  /**
   * Calculates alignment force (steer toward average heading).
   * @private
   */
  private calculateAlignment(velocity: Vector3, maxSpeed: number): Vector3 {
    const averageVelocity = Vector3.zero();
    let count = 0;

    for (const neighbor of this.neighbors) {
      const distanceSq = Vector3.distanceSquared(velocity, neighbor.velocity);

      if (distanceSq < this.alignmentRadius * this.alignmentRadius) {
        averageVelocity.addInPlace(neighbor.velocity);
        count++;
      }
    }

    if (count > 0) {
      // Average velocity
      averageVelocity.scaleInPlace(1 / count);

      // Steer toward average heading
      const desired = averageVelocity.normalize().scale(maxSpeed);
      return desired.sub(velocity);
    }

    return Vector3.zero();
  }

  /**
   * Calculates cohesion force (steer toward center of mass).
   * @private
   */
  private calculateCohesion(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    const centerOfMass = Vector3.zero();
    let count = 0;

    for (const neighbor of this.neighbors) {
      const distanceSq = Vector3.distanceSquared(position, neighbor.position);

      if (distanceSq < this.cohesionRadius * this.cohesionRadius) {
        centerOfMass.addInPlace(neighbor.position);
        count++;
      }
    }

    if (count > 0) {
      // Average position
      centerOfMass.scaleInPlace(1 / count);

      // Seek center of mass
      const desired = centerOfMass.sub(position).normalize().scale(maxSpeed);
      return desired.sub(velocity);
    }

    return Vector3.zero();
  }

  /**
   * Gets the number of neighbors.
   */
  getNeighborCount(): number {
    return this.neighbors.length;
  }

  /**
   * Clears all neighbors.
   */
  clearNeighbors(): void {
    this.neighbors = [];
  }
}

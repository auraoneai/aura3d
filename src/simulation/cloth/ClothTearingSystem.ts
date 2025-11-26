/**
 * Cloth tearing and cutting system for realistic fabric damage.
 *
 * Supports strain-based tearing, mesh splitting, and cut plane intersection.
 * Dynamically updates mesh topology when cloth tears or is cut.
 *
 * @module Simulation/Cloth/ClothTearingSystem
 */

import { Vector3 } from '../../math/Vector3';
import { Plane } from '../../math/Plane';
import { DistanceConstraint } from './PBDSolver';

/**
 * Event data for tear events.
 */
export interface TearEvent {
  /**
   * Indices of particles at the tear location.
   */
  particleIndices: number[];

  /**
   * Position where the tear occurred.
   */
  position: Vector3;

  /**
   * Constraint that was torn.
   */
  constraint: DistanceConstraint;

  /**
   * Strain value that caused the tear.
   */
  strain: number;
}

/**
 * Configuration for tearing system.
 */
export interface TearingConfig {
  /**
   * Maximum strain before tearing (length ratio).
   * Default: 1.5 (50% elongation)
   */
  tearThreshold?: number;

  /**
   * Whether tearing is enabled.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Minimum time between tears (in seconds).
   * Prevents rapid cascading tears.
   * Default: 0.1
   */
  minTearInterval?: number;
}

/**
 * Cloth tearing system managing fabric damage and cutting.
 *
 * Monitors constraint strain and removes overstretched constraints.
 * Updates mesh topology to reflect tears and cuts.
 *
 * @example
 * ```typescript
 * const tearingSystem = new ClothTearingSystem({
 *   tearThreshold: 1.3,
 *   enabled: true
 * });
 *
 * // Listen for tear events
 * tearingSystem.onTear.add((event) => {
 *   console.log('Cloth tore at', event.position);
 *   // Update visual mesh
 * });
 *
 * // Check for tears each frame
 * const tornConstraints = tearingSystem.updateTearing(
 *   constraints,
 *   positions,
 *   deltaTime
 * );
 *
 * // Apply cutting plane
 * const cutConstraints = tearingSystem.cutWithPlane(
 *   constraints,
 *   positions,
 *   cutPlane
 * );
 * ```
 */
export class ClothTearingSystem {
  private tearThreshold: number;
  private enabled: boolean;
  private minTearInterval: number;
  private lastTearTime: number = 0;
  private tearEventCallbacks: Array<(event: TearEvent) => void> = [];

  /**
   * Creates a new tearing system.
   *
   * @param config - Tearing configuration
   */
  constructor(config: TearingConfig = {}) {
    this.tearThreshold = config.tearThreshold ?? 1.5;
    this.enabled = config.enabled ?? true;
    this.minTearInterval = config.minTearInterval ?? 0.1;
  }

  /**
   * Event callbacks for tear events.
   * Use add() to register a callback.
   */
  readonly onTear = {
    /**
     * Adds a tear event callback.
     *
     * @param callback - Callback function
     */
    add: (callback: (event: TearEvent) => void): void => {
      this.tearEventCallbacks.push(callback);
    },

    /**
     * Removes a tear event callback.
     *
     * @param callback - Callback function to remove
     */
    remove: (callback: (event: TearEvent) => void): void => {
      const index = this.tearEventCallbacks.indexOf(callback);
      if (index !== -1) {
        this.tearEventCallbacks.splice(index, 1);
      }
    },

    /**
     * Clears all tear event callbacks.
     */
    clear: (): void => {
      this.tearEventCallbacks = [];
    }
  };

  /**
   * Updates tearing by checking constraint strain.
   *
   * @param constraints - Array of distance constraints
   * @param positions - Current particle positions
   * @param deltaTime - Time since last update
   * @returns Array of constraints that were torn and should be removed
   */
  updateTearing(
    constraints: DistanceConstraint[],
    positions: Vector3[],
    deltaTime: number
  ): DistanceConstraint[] {
    if (!this.enabled) return [];

    this.lastTearTime += deltaTime;

    // Rate limiting to prevent cascading tears
    if (this.lastTearTime < this.minTearInterval) {
      return [];
    }

    const tornConstraints: DistanceConstraint[] = [];

    for (const constraint of constraints) {
      const strain = this.calculateStrain(constraint, positions);

      if (strain >= this.tearThreshold) {
        tornConstraints.push(constraint);

        // Fire tear event
        const [i1, i2] = constraint.particleIndices;
        const position = positions[i1].add(positions[i2]).scale(0.5);

        const event: TearEvent = {
          particleIndices: [i1, i2],
          position,
          constraint,
          strain
        };

        this.fireTearEvent(event);
        this.lastTearTime = 0;
      }
    }

    return tornConstraints;
  }

  /**
   * Cuts cloth with a plane, removing all constraints that intersect it.
   *
   * @param constraints - Array of distance constraints
   * @param positions - Current particle positions
   * @param plane - Cutting plane
   * @returns Array of constraints that were cut and should be removed
   */
  cutWithPlane(
    constraints: DistanceConstraint[],
    positions: Vector3[],
    plane: Plane
  ): DistanceConstraint[] {
    const cutConstraints: DistanceConstraint[] = [];

    for (const constraint of constraints) {
      const [i1, i2] = constraint.particleIndices;
      const p1 = positions[i1];
      const p2 = positions[i2];

      // Check if edge crosses plane
      if (this.edgeCrossesPlane(p1, p2, plane)) {
        cutConstraints.push(constraint);

        // Fire tear event at intersection point
        const t = this.getPlaneIntersectionT(p1, p2, plane);
        const position = p1.lerp(p2, t);

        const event: TearEvent = {
          particleIndices: [i1, i2],
          position,
          constraint,
          strain: this.tearThreshold
        };

        this.fireTearEvent(event);
      }
    }

    return cutConstraints;
  }

  /**
   * Cuts cloth with a line segment in 2D (for interactive cutting).
   *
   * @param constraints - Array of distance constraints
   * @param positions - Current particle positions
   * @param lineStart - Start point of cutting line
   * @param lineEnd - End point of cutting line
   * @param cutPlaneNormal - Normal of the cutting plane
   * @returns Array of constraints that were cut
   */
  cutWithLine(
    constraints: DistanceConstraint[],
    positions: Vector3[],
    lineStart: Vector3,
    lineEnd: Vector3,
    cutPlaneNormal: Vector3 = Vector3.forward()
  ): DistanceConstraint[] {
    const cutConstraints: DistanceConstraint[] = [];

    for (const constraint of constraints) {
      const [i1, i2] = constraint.particleIndices;
      const p1 = positions[i1];
      const p2 = positions[i2];

      // Project to 2D (remove component along normal)
      const p1Proj = this.projectToPlane(p1, cutPlaneNormal);
      const p2Proj = this.projectToPlane(p2, cutPlaneNormal);
      const lineStartProj = this.projectToPlane(lineStart, cutPlaneNormal);
      const lineEndProj = this.projectToPlane(lineEnd, cutPlaneNormal);

      // Check if segments intersect in 2D
      if (this.segmentsIntersect2D(p1Proj, p2Proj, lineStartProj, lineEndProj)) {
        cutConstraints.push(constraint);

        const position = p1.add(p2).scale(0.5);

        const event: TearEvent = {
          particleIndices: [i1, i2],
          position,
          constraint,
          strain: this.tearThreshold
        };

        this.fireTearEvent(event);
      }
    }

    return cutConstraints;
  }

  /**
   * Splits particles at tear locations to create separate mesh pieces.
   * Creates duplicate particles for torn edges.
   *
   * @param positions - Array of particle positions (modified)
   * @param velocities - Array of particle velocities (modified)
   * @param inverseMasses - Array of inverse masses (modified)
   * @param tornConstraints - Constraints that were torn
   * @returns Mapping of old particle indices to new duplicated indices
   */
  splitMesh(
    positions: Vector3[],
    velocities: Vector3[],
    inverseMasses: number[],
    tornConstraints: DistanceConstraint[]
  ): Map<number, number> {
    const duplicatedParticles = new Map<number, number>();

    for (const constraint of tornConstraints) {
      const [i1, i2] = constraint.particleIndices;

      // Duplicate second particle
      if (!duplicatedParticles.has(i2)) {
        const newIndex = positions.length;
        duplicatedParticles.set(i2, newIndex);

        // Clone particle data
        positions.push(positions[i2].clone());
        velocities.push(velocities[i2].clone());
        inverseMasses.push(inverseMasses[i2]);
      }
    }

    return duplicatedParticles;
  }

  /**
   * Calculates the strain of a constraint (current / rest length).
   *
   * @param constraint - Distance constraint
   * @param positions - Particle positions
   * @returns Strain ratio (1.0 = no strain, > 1.0 = stretched)
   */
  private calculateStrain(
    constraint: DistanceConstraint,
    positions: Vector3[]
  ): number {
    const [i1, i2] = constraint.particleIndices;
    const p1 = positions[i1];
    const p2 = positions[i2];

    const currentLength = Vector3.distance(p1, p2);
    return currentLength / constraint.restLength;
  }

  /**
   * Checks if an edge crosses a plane.
   *
   * @param p1 - First endpoint
   * @param p2 - Second endpoint
   * @param plane - Plane to test
   * @returns True if edge crosses plane
   */
  private edgeCrossesPlane(p1: Vector3, p2: Vector3, plane: Plane): boolean {
    const d1 = plane.distanceToPoint(p1);
    const d2 = plane.distanceToPoint(p2);

    // Edge crosses if endpoints are on opposite sides
    return (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0);
  }

  /**
   * Gets the parametric t value where edge intersects plane.
   *
   * @param p1 - First endpoint
   * @param p2 - Second endpoint
   * @param plane - Plane
   * @returns Parametric t (0-1)
   */
  private getPlaneIntersectionT(p1: Vector3, p2: Vector3, plane: Plane): number {
    const d1 = plane.distanceToPoint(p1);
    const d2 = plane.distanceToPoint(p2);
    const totalDist = Math.abs(d1) + Math.abs(d2);

    if (totalDist < 0.0001) return 0.5;

    return Math.abs(d1) / totalDist;
  }

  /**
   * Projects a point onto a plane perpendicular to given normal.
   *
   * @param point - Point to project
   * @param normal - Plane normal
   * @returns Projected point
   */
  private projectToPlane(point: Vector3, normal: Vector3): Vector3 {
    const component = point.dot(normal);
    return point.sub(normal.scale(component));
  }

  /**
   * Checks if two line segments intersect in 2D.
   *
   * @param a1 - First segment start
   * @param a2 - First segment end
   * @param b1 - Second segment start
   * @param b2 - Second segment end
   * @returns True if segments intersect
   */
  private segmentsIntersect2D(
    a1: Vector3,
    a2: Vector3,
    b1: Vector3,
    b2: Vector3
  ): boolean {
    const d1 = this.cross2D(a2.sub(a1), b1.sub(a1));
    const d2 = this.cross2D(a2.sub(a1), b2.sub(a1));
    const d3 = this.cross2D(b2.sub(b1), a1.sub(b1));
    const d4 = this.cross2D(b2.sub(b1), a2.sub(b1));

    return (d1 * d2 < 0) && (d3 * d4 < 0);
  }

  /**
   * 2D cross product (returns z component).
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Z component of cross product
   */
  private cross2D(a: Vector3, b: Vector3): number {
    return a.x * b.y - a.y * b.x;
  }

  /**
   * Fires a tear event to all registered callbacks.
   *
   * @param event - Tear event data
   */
  private fireTearEvent(event: TearEvent): void {
    for (const callback of this.tearEventCallbacks) {
      callback(event);
    }
  }

  /**
   * Sets the tear threshold.
   *
   * @param threshold - Strain threshold for tearing
   */
  setTearThreshold(threshold: number): void {
    this.tearThreshold = Math.max(1.0, threshold);
  }

  /**
   * Enables or disables tearing.
   *
   * @param enabled - Whether tearing is enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Gets whether tearing is enabled.
   *
   * @returns True if tearing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gets the current tear threshold.
   *
   * @returns Tear threshold
   */
  getTearThreshold(): number {
    return this.tearThreshold;
  }
}

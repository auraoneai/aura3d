/**
 * Position Based Dynamics (PBD) solver for constraint-based simulation.
 *
 * Implements Gauss-Seidel constraint iteration for fast, stable cloth simulation.
 * Supports distance constraints, bending constraints, and collision constraints.
 *
 * @module Simulation/Cloth/PBDSolver
 */

import { Vector3 } from '../../math/Vector3';
import { MathConstants } from '../../math/MathConstants';

const { EPSILON } = MathConstants;

/**
 * Base interface for PBD constraints.
 */
export interface IPBDConstraint {
  /**
   * Indices of particles affected by this constraint.
   */
  particleIndices: number[];

  /**
   * Stiffness of the constraint (0-1, where 1 is rigid).
   */
  stiffness: number;

  /**
   * Projects particle positions to satisfy the constraint.
   *
   * @param positions - Array of particle positions
   * @param inverseMasses - Array of inverse masses
   * @returns True if constraint was satisfied
   */
  project(positions: Vector3[], inverseMasses: number[]): boolean;
}

/**
 * Distance constraint maintaining fixed distance between two particles.
 * Used for structural springs in cloth simulation.
 */
export class DistanceConstraint implements IPBDConstraint {
  particleIndices: number[];
  stiffness: number;
  restLength: number;

  /**
   * Creates a distance constraint.
   *
   * @param p1 - Index of first particle
   * @param p2 - Index of second particle
   * @param restLength - Rest length of the constraint
   * @param stiffness - Constraint stiffness (0-1)
   */
  constructor(p1: number, p2: number, restLength: number, stiffness: number = 1.0) {
    this.particleIndices = [p1, p2];
    this.restLength = restLength;
    this.stiffness = stiffness;
  }

  project(positions: Vector3[], inverseMasses: number[]): boolean {
    const [i1, i2] = this.particleIndices;
    const p1 = positions[i1];
    const p2 = positions[i2];
    const w1 = inverseMasses[i1];
    const w2 = inverseMasses[i2];

    // If both particles are fixed, skip
    if (w1 === 0 && w2 === 0) return true;

    // Calculate current distance
    const delta = p2.sub(p1);
    const currentLength = delta.length();

    // Avoid division by zero
    if (currentLength < EPSILON) return true;

    // Calculate constraint violation
    const diff = currentLength - this.restLength;
    if (Math.abs(diff) < EPSILON) return true;

    // Calculate correction
    const n = delta.scale(1.0 / currentLength);
    const weightSum = w1 + w2;

    if (weightSum < EPSILON) return true;

    const correctionMagnitude = diff / weightSum * this.stiffness;

    // Apply corrections
    if (w1 > 0) {
      const correction1 = n.scale(w1 * correctionMagnitude);
      p1.addInPlace(correction1);
    }

    if (w2 > 0) {
      const correction2 = n.scale(-w2 * correctionMagnitude);
      p2.addInPlace(correction2);
    }

    return Math.abs(diff) < 0.01;
  }
}

/**
 * Bending constraint resisting bending deformation between adjacent triangles.
 * Maintains dihedral angle between cloth faces for natural folding behavior.
 */
export class BendingConstraint implements IPBDConstraint {
  particleIndices: number[];
  stiffness: number;
  restAngle: number;

  /**
   * Creates a bending constraint.
   *
   * @param p1 - Index of first edge particle
   * @param p2 - Index of second edge particle
   * @param p3 - Index of first wing particle
   * @param p4 - Index of second wing particle
   * @param restAngle - Rest dihedral angle in radians
   * @param stiffness - Constraint stiffness (0-1)
   */
  constructor(
    p1: number,
    p2: number,
    p3: number,
    p4: number,
    restAngle: number,
    stiffness: number = 0.1
  ) {
    this.particleIndices = [p1, p2, p3, p4];
    this.restAngle = restAngle;
    this.stiffness = stiffness;
  }

  project(positions: Vector3[], inverseMasses: number[]): boolean {
    const [i1, i2, i3, i4] = this.particleIndices;
    const p1 = positions[i1];
    const p2 = positions[i2];
    const p3 = positions[i3];
    const p4 = positions[i4];

    const w1 = inverseMasses[i1];
    const w2 = inverseMasses[i2];
    const w3 = inverseMasses[i3];
    const w4 = inverseMasses[i4];

    // Calculate edge and wing vectors
    const e = p2.sub(p1);
    const eLen = e.length();
    if (eLen < EPSILON) return true;

    // Calculate normals of both triangles
    const n1 = p3.sub(p1).cross(e);
    const n2 = e.cross(p4.sub(p1));

    const n1Len = n1.length();
    const n2Len = n2.length();

    if (n1Len < EPSILON || n2Len < EPSILON) return true;

    // Calculate current dihedral angle
    const n1Norm = n1.scale(1.0 / n1Len);
    const n2Norm = n2.scale(1.0 / n2Len);

    let cosAngle = n1Norm.dot(n2Norm);
    cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));

    const currentAngle = Math.acos(cosAngle);
    const angleDiff = currentAngle - this.restAngle;

    if (Math.abs(angleDiff) < EPSILON) return true;

    // Calculate gradients (simplified approximation)
    const correctionScale = this.stiffness * angleDiff * 0.5;

    // Apply corrections perpendicular to edge
    if (w3 > 0) {
      const correction3 = n1Norm.scale(-correctionScale * w3);
      p3.addInPlace(correction3);
    }

    if (w4 > 0) {
      const correction4 = n2Norm.scale(correctionScale * w4);
      p4.addInPlace(correction4);
    }

    return Math.abs(angleDiff) < 0.1;
  }
}

/**
 * Collision constraint keeping particles outside collision shapes.
 */
export class CollisionConstraint implements IPBDConstraint {
  particleIndices: number[];
  stiffness: number;
  collisionNormal: Vector3;
  collisionPoint: Vector3;
  penetrationDepth: number;

  /**
   * Creates a collision constraint.
   *
   * @param particleIndex - Index of colliding particle
   * @param collisionPoint - Point of collision
   * @param collisionNormal - Normal at collision point
   * @param penetrationDepth - Depth of penetration
   */
  constructor(
    particleIndex: number,
    collisionPoint: Vector3,
    collisionNormal: Vector3,
    penetrationDepth: number
  ) {
    this.particleIndices = [particleIndex];
    this.stiffness = 1.0;
    this.collisionPoint = collisionPoint;
    this.collisionNormal = collisionNormal.normalize();
    this.penetrationDepth = penetrationDepth;
  }

  project(positions: Vector3[], inverseMasses: number[]): boolean {
    const i = this.particleIndices[0];
    const p = positions[i];
    const w = inverseMasses[i];

    if (w === 0) return true;

    // Move particle out of collision
    const correction = this.collisionNormal.scale(this.penetrationDepth);
    p.addInPlace(correction);

    return true;
  }
}

/**
 * Configuration for PBD solver.
 */
export interface PBDSolverConfig {
  /**
   * Number of constraint iterations per substep.
   * Higher values = more accurate but slower.
   * Default: 5
   */
  iterations?: number;

  /**
   * Number of substeps per simulation step.
   * Higher values = more stable but slower.
   * Default: 1
   */
  substeps?: number;

  /**
   * Global damping factor (0-1).
   * Default: 0.01
   */
  damping?: number;

  /**
   * Whether to use sequential impulse for stability.
   * Default: false
   */
  useSequentialImpulse?: boolean;
}

/**
 * Position Based Dynamics solver for cloth simulation.
 *
 * Solves constraints iteratively using Gauss-Seidel method.
 * Ensures stability and fast convergence for real-time simulation.
 *
 * @example
 * ```typescript
 * const solver = new PBDSolver({
 *   iterations: 10,
 *   substeps: 2,
 *   damping: 0.02
 * });
 *
 * solver.addConstraint(new DistanceConstraint(0, 1, 1.0, 0.9));
 * solver.addConstraint(new BendingConstraint(0, 1, 2, 3, 0, 0.1));
 *
 * solver.solve(positions, velocities, inverseMasses, dt);
 * ```
 */
export class PBDSolver {
  private constraints: IPBDConstraint[] = [];
  private iterations: number;
  private substeps: number;
  private damping: number;
  private useSequentialImpulse: boolean;

  // Temporary arrays for substep calculations
  private prevPositions: Vector3[] = [];

  /**
   * Creates a new PBD solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: PBDSolverConfig = {}) {
    this.iterations = config.iterations ?? 5;
    this.substeps = config.substeps ?? 1;
    this.damping = config.damping ?? 0.01;
    this.useSequentialImpulse = config.useSequentialImpulse ?? false;
  }

  /**
   * Adds a constraint to the solver.
   *
   * @param constraint - Constraint to add
   */
  addConstraint(constraint: IPBDConstraint): void {
    this.constraints.push(constraint);
  }

  /**
   * Removes a constraint from the solver.
   *
   * @param constraint - Constraint to remove
   * @returns True if constraint was found and removed
   */
  removeConstraint(constraint: IPBDConstraint): boolean {
    const index = this.constraints.indexOf(constraint);
    if (index !== -1) {
      this.constraints.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes all constraints from the solver.
   */
  clearConstraints(): void {
    this.constraints = [];
  }

  /**
   * Gets all constraints.
   *
   * @returns Array of constraints
   */
  getConstraints(): IPBDConstraint[] {
    return this.constraints;
  }

  /**
   * Sets the number of solver iterations.
   *
   * @param iterations - Number of iterations
   */
  setIterations(iterations: number): void {
    this.iterations = Math.max(1, Math.floor(iterations));
  }

  /**
   * Sets the number of substeps.
   *
   * @param substeps - Number of substeps
   */
  setSubsteps(substeps: number): void {
    this.substeps = Math.max(1, Math.floor(substeps));
  }

  /**
   * Sets the damping factor.
   *
   * @param damping - Damping factor (0-1)
   */
  setDamping(damping: number): void {
    this.damping = Math.max(0, Math.min(1, damping));
  }

  /**
   * Solves all constraints for one time step.
   *
   * @param positions - Array of particle positions (modified in-place)
   * @param velocities - Array of particle velocities (modified in-place)
   * @param inverseMasses - Array of inverse masses
   * @param deltaTime - Time step in seconds
   * @param externalForces - Optional array of external forces per particle
   */
  solve(
    positions: Vector3[],
    velocities: Vector3[],
    inverseMasses: number[],
    deltaTime: number,
    externalForces?: Vector3[]
  ): void {
    if (positions.length === 0) return;

    const dt = deltaTime / this.substeps;

    for (let substep = 0; substep < this.substeps; substep++) {
      // Store previous positions
      this.updatePrevPositions(positions);

      // Apply external forces and predict positions
      for (let i = 0; i < positions.length; i++) {
        if (inverseMasses[i] === 0) continue;

        // Apply forces
        if (externalForces && externalForces[i]) {
          const acceleration = externalForces[i].scale(inverseMasses[i]);
          velocities[i].addInPlace(acceleration.scale(dt));
        }

        // Apply damping
        velocities[i].scaleInPlace(1.0 - this.damping);

        // Predict position
        positions[i].addInPlace(velocities[i].scale(dt));
      }

      // Solve constraints
      this.projectConstraints(positions, inverseMasses);

      // Update velocities based on position changes
      for (let i = 0; i < positions.length; i++) {
        if (inverseMasses[i] === 0) continue;

        const deltaPos = positions[i].sub(this.prevPositions[i]);
        velocities[i] = deltaPos.scale(1.0 / dt);
      }
    }
  }

  /**
   * Projects constraints using Gauss-Seidel iteration.
   *
   * @param positions - Array of particle positions
   * @param inverseMasses - Array of inverse masses
   */
  private projectConstraints(positions: Vector3[], inverseMasses: number[]): void {
    for (let iter = 0; iter < this.iterations; iter++) {
      let allSatisfied = true;

      for (const constraint of this.constraints) {
        const satisfied = constraint.project(positions, inverseMasses);
        if (!satisfied) allSatisfied = false;
      }

      // Early exit if all constraints satisfied
      if (allSatisfied) break;
    }
  }

  /**
   * Updates the previous positions array.
   *
   * @param positions - Current positions
   */
  private updatePrevPositions(positions: Vector3[]): void {
    if (this.prevPositions.length !== positions.length) {
      this.prevPositions = new Array(positions.length);
      for (let i = 0; i < positions.length; i++) {
        this.prevPositions[i] = positions[i].clone();
      }
    } else {
      for (let i = 0; i < positions.length; i++) {
        this.prevPositions[i].copy(positions[i]);
      }
    }
  }

  /**
   * Gets solver statistics.
   *
   * @returns Statistics object
   */
  getStats(): {
    constraintCount: number;
    iterations: number;
    substeps: number;
    damping: number;
  } {
    return {
      constraintCount: this.constraints.length,
      iterations: this.iterations,
      substeps: this.substeps,
      damping: this.damping
    };
  }
}

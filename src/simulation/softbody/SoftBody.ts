/**
 * Deformable soft body simulation using tetrahedral mesh and Position-Based Dynamics.
 * Supports volume preservation, shape matching, and rigid body attachments.
 * @module SoftBody
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix3 } from '../../math/Matrix3';
import { Matrix4 } from '../../math/Matrix4';

/**
 * Single particle in the soft body simulation.
 */
export interface SoftBodyParticle {
  /** Current position */
  position: Vector3;
  /** Previous position (for Verlet integration) */
  previousPosition: Vector3;
  /** Velocity */
  velocity: Vector3;
  /** Inverse mass (0 = infinite mass/fixed) */
  inverseMass: number;
  /** Original position in rest configuration */
  restPosition: Vector3;
}

/**
 * Tetrahedral element for volume-based simulation.
 */
export interface Tetrahedron {
  /** Indices of the 4 vertices forming the tetrahedron */
  indices: [number, number, number, number];
  /** Rest volume of the tetrahedron */
  restVolume: number;
  /** Inverse rest matrix for deformation gradient computation */
  inverseRestMatrix: Matrix3;
  /** Stiffness coefficient */
  stiffness: number;
}

/**
 * Distance constraint between two particles.
 */
export interface DistanceConstraint {
  /** Index of first particle */
  particleA: number;
  /** Index of second particle */
  particleB: number;
  /** Rest distance */
  restDistance: number;
  /** Constraint stiffness (0-1) */
  stiffness: number;
}

/**
 * Attachment point to a rigid body.
 */
export interface RigidAttachment {
  /** Index of the particle */
  particleIndex: number;
  /** Position in rigid body local space */
  localPosition: Vector3;
  /** Rigid body transform matrix */
  rigidBodyTransform: Matrix4;
  /** Attachment stiffness (0-1) */
  stiffness: number;
}

/**
 * Configuration for soft body simulation.
 */
export interface SoftBodyConfig {
  /** Global damping (0-1) */
  damping?: number;
  /** Gravity acceleration */
  gravity?: Vector3;
  /** Number of solver iterations per step */
  solverIterations?: number;
  /** Volume preservation stiffness (0-1) */
  volumeStiffness?: number;
  /** Shape matching stiffness (0-1) */
  shapeMatchingStiffness?: number;
  /** Distance constraint stiffness (0-1) */
  distanceStiffness?: number;
  /** Enable shape matching */
  enableShapeMatching?: boolean;
  /** Enable volume preservation */
  enableVolumePreservation?: boolean;
}

/**
 * Deformable soft body using Position-Based Dynamics (PBD).
 * Implements tetrahedral FEM-style constraints for realistic deformation.
 *
 * @example
 * ```typescript
 * // Create a soft body from a tetrahedral mesh
 * const particles: Vector3[] = [...]; // Vertex positions
 * const tets: [number, number, number, number][] = [...]; // Tet indices
 *
 * const softBody = new SoftBody(particles, tets, {
 *   damping: 0.99,
 *   gravity: new Vector3(0, -9.8, 0),
 *   volumeStiffness: 0.5,
 *   shapeMatchingStiffness: 0.3
 * });
 *
 * // Update simulation
 * softBody.step(1/60);
 *
 * // Apply force at a point
 * softBody.applyForce(10, new Vector3(100, 0, 0));
 * ```
 */
export class SoftBody {
  /** Particles in the soft body */
  particles: SoftBodyParticle[];
  /** Tetrahedral elements */
  tetrahedra: Tetrahedron[];
  /** Distance constraints */
  constraints: DistanceConstraint[];
  /** Rigid body attachments */
  attachments: RigidAttachment[];
  /** Configuration */
  config: Required<SoftBodyConfig>;
  /** Total mass of the soft body */
  totalMass: number;
  /** Center of mass in rest configuration */
  restCenterOfMass: Vector3;

  /**
   * Creates a new soft body.
   *
   * @param positions - Initial particle positions
   * @param tetrahedra - Tetrahedral elements (4 vertex indices each)
   * @param config - Simulation configuration
   * @param particleMass - Mass per particle (default: 1.0)
   */
  constructor(
    positions: Vector3[],
    tetrahedra: [number, number, number, number][],
    config: SoftBodyConfig = {},
    particleMass: number = 1.0
  ) {
    this.config = {
      damping: config.damping ?? 0.99,
      gravity: config.gravity ?? new Vector3(0, -9.8, 0),
      solverIterations: config.solverIterations ?? 5,
      volumeStiffness: config.volumeStiffness ?? 0.5,
      shapeMatchingStiffness: config.shapeMatchingStiffness ?? 0.2,
      distanceStiffness: config.distanceStiffness ?? 0.8,
      enableShapeMatching: config.enableShapeMatching ?? true,
      enableVolumePreservation: config.enableVolumePreservation ?? true,
    };

    const invMass = particleMass > 0 ? 1.0 / particleMass : 0;
    this.particles = positions.map(pos => ({
      position: pos.clone(),
      previousPosition: pos.clone(),
      velocity: new Vector3(),
      inverseMass: invMass,
      restPosition: pos.clone(),
    }));

    this.tetrahedra = [];
    this.constraints = [];
    this.attachments = [];
    this.totalMass = particleMass * positions.length;

    this.restCenterOfMass = this.computeCenterOfMass(positions);

    this.initializeTetrahedra(tetrahedra);
    this.generateDistanceConstraints();
  }

  /**
   * Initializes tetrahedral elements with rest volumes and inverse matrices.
   */
  private initializeTetrahedra(tetIndices: [number, number, number, number][]): void {
    for (const indices of tetIndices) {
      const p0 = this.particles[indices[0]!]!.restPosition;
      const p1 = this.particles[indices[1]!]!.restPosition;
      const p2 = this.particles[indices[2]!]!.restPosition;
      const p3 = this.particles[indices[3]!]!.restPosition;

      const v1 = p1.sub(p0);
      const v2 = p2.sub(p0);
      const v3 = p3.sub(p0);

      const volume = Math.abs(v1.dot(v2.cross(v3))) / 6.0;

      const restMatrix = new Matrix3();
      restMatrix.set(
        v1.x, v2.x, v3.x,
        v1.y, v2.y, v3.y,
        v1.z, v2.z, v3.z
      );

      const inverseRestMatrix = restMatrix.invert() || new Matrix3();

      this.tetrahedra.push({
        indices,
        restVolume: volume,
        inverseRestMatrix,
        stiffness: this.config.volumeStiffness,
      });
    }
  }

  /**
   * Generates distance constraints from tetrahedral edges.
   */
  private generateDistanceConstraints(): void {
    const edges = new Set<string>();

    for (const tet of this.tetrahedra) {
      const pairs: [number, number][] = [
        [tet.indices[0], tet.indices[1]],
        [tet.indices[0], tet.indices[2]],
        [tet.indices[0], tet.indices[3]],
        [tet.indices[1], tet.indices[2]],
        [tet.indices[1], tet.indices[3]],
        [tet.indices[2], tet.indices[3]],
      ];

      for (const [a, b] of pairs) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!edges.has(key)) {
          edges.add(key);
          const p0 = this.particles[a].restPosition;
          const p1 = this.particles[b].restPosition;
          const distance = p0.sub(p1).length();

          this.constraints.push({
            particleA: a,
            particleB: b,
            restDistance: distance,
            stiffness: this.config.distanceStiffness,
          });
        }
      }
    }
  }

  /**
   * Computes center of mass from particle positions.
   */
  private computeCenterOfMass(positions: Vector3[]): Vector3 {
    const sum = positions.reduce((acc, p) => acc.add(p), new Vector3());
    return sum.scale(1.0 / positions.length);
  }

  /**
   * Advances simulation by one time step.
   *
   * @param deltaTime - Time step in seconds
   */
  step(deltaTime: number): void {
    this.integrateVelocities(deltaTime);
    this.solveConstraints(deltaTime);
    this.updateVelocities(deltaTime);
    this.applyDamping();
  }

  /**
   * Integrates particle velocities (explicit Euler with gravity).
   */
  private integrateVelocities(dt: number): void {
    for (const particle of this.particles) {
      if (particle.inverseMass === 0) continue;

      particle.previousPosition.copy(particle.position);

      const gravity = this.config.gravity.scale(dt);
      particle.velocity.addInPlace(gravity);
      particle.position.addInPlace(particle.velocity.scale(dt));
    }
  }

  /**
   * Solves all constraints iteratively.
   */
  private solveConstraints(dt: number): void {
    for (let iter = 0; iter < this.config.solverIterations; iter++) {
      if (this.config.enableVolumePreservation) {
        this.solveVolumeConstraints();
      }

      this.solveDistanceConstraints();
      this.solveAttachmentConstraints();

      if (this.config.enableShapeMatching) {
        this.applyShapeMatching();
      }
    }
  }

  /**
   * Solves volume preservation constraints for each tetrahedron.
   */
  private solveVolumeConstraints(): void {
    for (const tet of this.tetrahedra) {
      const p0 = this.particles[tet.indices[0]].position;
      const p1 = this.particles[tet.indices[1]].position;
      const p2 = this.particles[tet.indices[2]].position;
      const p3 = this.particles[tet.indices[3]].position;

      const v1 = p1.sub(p0);
      const v2 = p2.sub(p0);
      const v3 = p3.sub(p0);

      const currentVolume = v1.dot(v2.cross(v3)) / 6.0;
      const volumeError = currentVolume - tet.restVolume;

      if (Math.abs(volumeError) < 1e-6) continue;

      const grad0 = v2.cross(v3).scale(-1.0 / 6.0);
      const grad1 = v3.cross(v2).scale(1.0 / 6.0);
      const grad2 = v1.cross(v3).scale(1.0 / 6.0);
      const grad3 = v2.cross(v1).scale(1.0 / 6.0);

      const w0 = this.particles[tet.indices[0]].inverseMass;
      const w1 = this.particles[tet.indices[1]].inverseMass;
      const w2 = this.particles[tet.indices[2]].inverseMass;
      const w3 = this.particles[tet.indices[3]].inverseMass;

      const sumGradSq =
        w0 * grad0.lengthSquared() +
        w1 * grad1.lengthSquared() +
        w2 * grad2.lengthSquared() +
        w3 * grad3.lengthSquared();

      if (sumGradSq < 1e-10) continue;

      const lambda = -volumeError / sumGradSq;
      const stiffness = tet.stiffness;

      if (w0 > 0) {
        this.particles[tet.indices[0]].position.addInPlace(
          grad0.scale(w0 * lambda * stiffness)
        );
      }
      if (w1 > 0) {
        this.particles[tet.indices[1]].position.addInPlace(
          grad1.scale(w1 * lambda * stiffness)
        );
      }
      if (w2 > 0) {
        this.particles[tet.indices[2]].position.addInPlace(
          grad2.scale(w2 * lambda * stiffness)
        );
      }
      if (w3 > 0) {
        this.particles[tet.indices[3]].position.addInPlace(
          grad3.scale(w3 * lambda * stiffness)
        );
      }
    }
  }

  /**
   * Solves distance constraints between particles.
   */
  private solveDistanceConstraints(): void {
    for (const constraint of this.constraints) {
      const p0 = this.particles[constraint.particleA];
      const p1 = this.particles[constraint.particleB];

      const w0 = p0.inverseMass;
      const w1 = p1.inverseMass;

      if (w0 === 0 && w1 === 0) continue;

      const delta = p1.position.sub(p0.position);
      const distance = delta.length();

      if (distance < 1e-6) continue;

      const error = distance - constraint.restDistance;
      const correction = delta.scale(error / (distance * (w0 + w1)));
      const stiffness = constraint.stiffness;

      if (w0 > 0) {
        p0.position.addInPlace(correction.scale(w0 * stiffness));
      }
      if (w1 > 0) {
        p1.position.addInPlace(correction.scale(-w1 * stiffness));
      }
    }
  }

  /**
   * Solves attachment constraints to rigid bodies.
   */
  private solveAttachmentConstraints(): void {
    for (const attachment of this.attachments) {
      const particle = this.particles[attachment.particleIndex];
      if (particle.inverseMass === 0) continue;

      const worldPos = new Vector3(
        attachment.localPosition.x,
        attachment.localPosition.y,
        attachment.localPosition.z
      );

      const m = attachment.rigidBodyTransform.elements;
      const targetPos = new Vector3(
        m[0] * worldPos.x + m[4] * worldPos.y + m[8] * worldPos.z + m[12],
        m[1] * worldPos.x + m[5] * worldPos.y + m[9] * worldPos.z + m[13],
        m[2] * worldPos.x + m[6] * worldPos.y + m[10] * worldPos.z + m[14]
      );

      const correction = targetPos.sub(particle.position);
      particle.position.addInPlace(correction.scale(attachment.stiffness));
    }
  }

  /**
   * Applies shape matching to maintain overall shape.
   */
  private applyShapeMatching(): void {
    const currentCM = this.particles.reduce(
      (acc, p) => acc.add(p.position),
      new Vector3()
    ).scale(1.0 / this.particles.length);

    const A = new Matrix3();
    const Ae = A.elements;

    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i].position.sub(currentCM);
      const p = this.particles[i].restPosition.sub(this.restCenterOfMass);

      Ae[0] += q.x * p.x; Ae[3] += q.x * p.y; Ae[6] += q.x * p.z;
      Ae[1] += q.y * p.x; Ae[4] += q.y * p.y; Ae[7] += q.y * p.z;
      Ae[2] += q.z * p.x; Ae[5] += q.z * p.y; Ae[8] += q.z * p.z;
    }

    const R = this.extractRotation(A);

    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].inverseMass === 0) continue;

      const p = this.particles[i].restPosition.sub(this.restCenterOfMass);
      const Re = R.elements;
      const goalPos = new Vector3(
        Re[0] * p.x + Re[3] * p.y + Re[6] * p.z,
        Re[1] * p.x + Re[4] * p.y + Re[7] * p.z,
        Re[2] * p.x + Re[5] * p.y + Re[8] * p.z
      ).add(currentCM);

      const correction = goalPos.sub(this.particles[i].position);
      this.particles[i].position.addInPlace(
        correction.scale(this.config.shapeMatchingStiffness)
      );
    }
  }

  /**
   * Extracts rotation matrix using polar decomposition (approximation).
   */
  private extractRotation(A: Matrix3): Matrix3 {
    const R = A.clone();

    for (let iter = 0; iter < 3; iter++) {
      const Rinv = R.transpose();
      const Re = R.elements;
      const Rie = Rinv.elements;

      for (let i = 0; i < 9; i++) {
        Re[i] = 0.5 * (Re[i] + Rie[i]);
      }
    }

    return R;
  }

  /**
   * Updates particle velocities from position changes.
   */
  private updateVelocities(dt: number): void {
    const invDt = 1.0 / dt;
    for (const particle of this.particles) {
      particle.velocity = particle.position.sub(particle.previousPosition).scale(invDt);
    }
  }

  /**
   * Applies velocity damping.
   */
  private applyDamping(): void {
    for (const particle of this.particles) {
      particle.velocity.scaleInPlace(this.config.damping);
    }
  }

  /**
   * Applies a force to a specific particle.
   *
   * @param particleIndex - Index of the particle
   * @param force - Force vector
   */
  applyForce(particleIndex: number, force: Vector3): void {
    const particle = this.particles[particleIndex];
    if (particle.inverseMass === 0) return;

    const acceleration = force.scale(particle.inverseMass);
    particle.velocity.addInPlace(acceleration);
  }

  /**
   * Applies an impulse to a specific particle.
   *
   * @param particleIndex - Index of the particle
   * @param impulse - Impulse vector
   */
  applyImpulse(particleIndex: number, impulse: Vector3): void {
    const particle = this.particles[particleIndex];
    if (particle.inverseMass === 0) return;

    particle.velocity.addInPlace(impulse.scale(particle.inverseMass));
  }

  /**
   * Attaches a particle to a rigid body.
   *
   * @param particleIndex - Index of the particle
   * @param rigidBodyTransform - Transform matrix of the rigid body
   * @param localPosition - Position in rigid body local space
   * @param stiffness - Attachment stiffness (0-1)
   */
  attachToRigidBody(
    particleIndex: number,
    rigidBodyTransform: Matrix4,
    localPosition: Vector3,
    stiffness: number = 1.0
  ): void {
    this.attachments.push({
      particleIndex,
      localPosition: localPosition.clone(),
      rigidBodyTransform,
      stiffness,
    });
  }

  /**
   * Fixes a particle in place (sets inverse mass to 0).
   *
   * @param particleIndex - Index of the particle to fix
   */
  fixParticle(particleIndex: number): void {
    this.particles[particleIndex].inverseMass = 0;
    this.particles[particleIndex].velocity.set(0, 0, 0);
  }

  /**
   * Unfixes a particle (restores mass).
   *
   * @param particleIndex - Index of the particle to unfix
   * @param mass - Mass to assign (default: 1.0)
   */
  unfixParticle(particleIndex: number, mass: number = 1.0): void {
    this.particles[particleIndex].inverseMass = mass > 0 ? 1.0 / mass : 0;
  }

  /**
   * Gets current positions of all particles.
   *
   * @returns Array of particle positions
   */
  getPositions(): Vector3[] {
    return this.particles.map(p => p.position.clone());
  }

  /**
   * Gets current velocities of all particles.
   *
   * @returns Array of particle velocities
   */
  getVelocities(): Vector3[] {
    return this.particles.map(p => p.velocity.clone());
  }

  /**
   * Resets the soft body to its rest configuration.
   */
  reset(): void {
    for (const particle of this.particles) {
      particle.position.copy(particle.restPosition);
      particle.previousPosition.copy(particle.restPosition);
      particle.velocity.set(0, 0, 0);
    }
  }
}

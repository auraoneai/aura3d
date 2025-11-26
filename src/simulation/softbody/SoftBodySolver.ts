/**
 * Advanced soft body solver with FEM and PBD support.
 * Provides multiple solver strategies for different simulation requirements.
 * @module SoftBodySolver
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix3 } from '../../math/Matrix3';
import { SoftBody, Tetrahedron, SoftBodyParticle } from './SoftBody';

/**
 * Material model for soft body deformation.
 */
export enum MaterialModel {
  /** Linear elastic material (simple) */
  Linear,
  /** Neo-Hookean hyperelastic material (more realistic) */
  NeoHookean,
  /** Corotated linear elasticity (rotation-invariant) */
  Corotated,
  /** Saint Venant-Kirchhoff (for large deformations) */
  StVenantKirchhoff,
}

/**
 * Solver method for soft body simulation.
 */
export enum SolverMethod {
  /** Position-Based Dynamics (fast, stable) */
  PBD,
  /** Finite Element Method (physically accurate) */
  FEM,
  /** Hybrid PBD + FEM */
  Hybrid,
}

/**
 * Material parameters for elastic deformation.
 */
export interface MaterialParameters {
  /** Young's modulus (stiffness), typical: 1e3 to 1e9 */
  youngsModulus: number;
  /** Poisson's ratio (volume preservation), typical: 0.3 to 0.49 */
  poissonsRatio: number;
  /** Density (kg/m³), typical: 1000 for soft materials */
  density: number;
}

/**
 * Advanced solver configuration.
 */
export interface SolverConfig {
  /** Solver method */
  method?: SolverMethod;
  /** Material model */
  materialModel?: MaterialModel;
  /** Material parameters */
  material?: MaterialParameters;
  /** Time integration scheme */
  timeIntegration?: 'explicit' | 'implicit' | 'semi-implicit';
  /** Maximum substeps per frame */
  maxSubsteps?: number;
  /** Convergence tolerance for implicit solvers */
  tolerance?: number;
}

/**
 * Advanced soft body solver with multiple integration schemes.
 *
 * @example
 * ```typescript
 * const solver = new SoftBodySolver({
 *   method: SolverMethod.FEM,
 *   materialModel: MaterialModel.NeoHookean,
 *   material: {
 *     youngsModulus: 1e6,
 *     poissonsRatio: 0.45,
 *     density: 1000
 *   }
 * });
 *
 * // Solve one step
 * solver.solve(softBody, 1/60);
 * ```
 */
export class SoftBodySolver {
  config: Required<SolverConfig>;

  /** Lamé's first parameter */
  private lambda!: number;
  /** Lamé's second parameter (shear modulus) */
  private mu!: number;

  constructor(config: SolverConfig = {}) {
    this.config = {
      method: config.method ?? SolverMethod.PBD,
      materialModel: config.materialModel ?? MaterialModel.Corotated,
      material: config.material ?? {
        youngsModulus: 1e5,
        poissonsRatio: 0.4,
        density: 1000,
      },
      timeIntegration: config.timeIntegration ?? 'semi-implicit',
      maxSubsteps: config.maxSubsteps ?? 5,
      tolerance: config.tolerance ?? 1e-6,
    };

    this.computeLameParameters();
  }

  /**
   * Computes Lamé parameters from Young's modulus and Poisson's ratio.
   */
  private computeLameParameters(): void {
    const E = this.config.material.youngsModulus;
    const nu = this.config.material.poissonsRatio;

    this.mu = E / (2 * (1 + nu));
    this.lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  }

  /**
   * Solves one simulation step.
   *
   * @param softBody - Soft body to simulate
   * @param deltaTime - Time step in seconds
   */
  solve(softBody: SoftBody, deltaTime: number): void {
    const substepDt = deltaTime / this.config.maxSubsteps;

    for (let i = 0; i < this.config.maxSubsteps; i++) {
      switch (this.config.method) {
        case SolverMethod.PBD:
          this.solvePBD(softBody, substepDt);
          break;
        case SolverMethod.FEM:
          this.solveFEM(softBody, substepDt);
          break;
        case SolverMethod.Hybrid:
          this.solveHybrid(softBody, substepDt);
          break;
      }
    }
  }

  /**
   * Position-Based Dynamics solver (delegates to SoftBody's built-in solver).
   */
  private solvePBD(softBody: SoftBody, dt: number): void {
    softBody.step(dt);
  }

  /**
   * Finite Element Method solver.
   */
  private solveFEM(softBody: SoftBody, dt: number): void {
    this.computeFEMForces(softBody);

    switch (this.config.timeIntegration) {
      case 'explicit':
        this.integrateExplicit(softBody, dt);
        break;
      case 'semi-implicit':
        this.integrateSemiImplicit(softBody, dt);
        break;
      case 'implicit':
        this.integrateImplicit(softBody, dt);
        break;
    }
  }

  /**
   * Hybrid PBD + FEM solver.
   */
  private solveHybrid(softBody: SoftBody, dt: number): void {
    this.computeFEMForces(softBody);
    this.integrateSemiImplicit(softBody, dt);
    softBody.step(dt * 0.1);
  }

  /**
   * Computes elastic forces using FEM.
   */
  private computeFEMForces(softBody: SoftBody): void {
    const forces = new Array(softBody.particles.length).fill(null).map(() => new Vector3());

    for (const tet of softBody.tetrahedra) {
      const F = this.computeDeformationGradient(softBody, tet);
      const P = this.computeStress(F);

      const H = this.computeForceGradient(P, tet);

      const p0 = softBody.particles[tet.indices[0]].position;

      for (let i = 0; i < 4; i++) {
        const idx = tet.indices[i];
        const force = this.extractColumnForce(H, i);
        forces[idx].addInPlace(force.scale(-tet.restVolume));
      }
    }

    for (let i = 0; i < softBody.particles.length; i++) {
      softBody.particles[i].velocity.addInPlace(
        forces[i].scale(softBody.particles[i].inverseMass)
      );
    }
  }

  /**
   * Computes deformation gradient for a tetrahedron.
   */
  private computeDeformationGradient(softBody: SoftBody, tet: Tetrahedron): Matrix3 {
    const p0 = softBody.particles[tet.indices[0]].position;
    const p1 = softBody.particles[tet.indices[1]].position;
    const p2 = softBody.particles[tet.indices[2]].position;
    const p3 = softBody.particles[tet.indices[3]].position;

    const v1 = p1.sub(p0);
    const v2 = p2.sub(p0);
    const v3 = p3.sub(p0);

    const Ds = new Matrix3();
    Ds.set(
      v1.x, v2.x, v3.x,
      v1.y, v2.y, v3.y,
      v1.z, v2.z, v3.z
    );

    return Ds.multiply(tet.inverseRestMatrix);
  }

  /**
   * Computes first Piola-Kirchhoff stress tensor.
   */
  private computeStress(F: Matrix3): Matrix3 {
    switch (this.config.materialModel) {
      case MaterialModel.Linear:
        return this.computeLinearStress(F);
      case MaterialModel.Corotated:
        return this.computeCorotatedStress(F);
      case MaterialModel.NeoHookean:
        return this.computeNeoHookeanStress(F);
      case MaterialModel.StVenantKirchhoff:
        return this.computeStVKStress(F);
      default:
        return this.computeCorotatedStress(F);
    }
  }

  /**
   * Linear elastic stress (simple but unstable for large rotations).
   */
  private computeLinearStress(F: Matrix3): Matrix3 {
    const I = Matrix3.identity();
    const epsilon = F.sub(I);

    const traceE = epsilon.elements[0] + epsilon.elements[4] + epsilon.elements[8];

    const P = new Matrix3();
    const Pe = P.elements;
    const ee = epsilon.elements;

    for (let i = 0; i < 9; i++) {
      Pe[i] = 2 * this.mu * ee[i];
    }

    Pe[0] += this.lambda * traceE;
    Pe[4] += this.lambda * traceE;
    Pe[8] += this.lambda * traceE;

    return P;
  }

  /**
   * Corotated linear elasticity (rotation-invariant).
   */
  private computeCorotatedStress(F: Matrix3): Matrix3 {
    const R = this.polarDecomposition(F);
    const S = R.transpose().multiply(F);

    const I = Matrix3.identity();
    const epsilon = S.sub(I);

    const traceE = epsilon.elements[0] + epsilon.elements[4] + epsilon.elements[8];

    const stress = new Matrix3();
    const se = stress.elements;
    const ee = epsilon.elements;

    for (let i = 0; i < 9; i++) {
      se[i] = 2 * this.mu * ee[i];
    }

    se[0] += this.lambda * traceE;
    se[4] += this.lambda * traceE;
    se[8] += this.lambda * traceE;

    return R.multiply(stress);
  }

  /**
   * Neo-Hookean hyperelastic material.
   */
  private computeNeoHookeanStress(F: Matrix3): Matrix3 {
    const detF = F.determinant();
    const Finv = F.invert();

    if (!Finv || detF <= 0) {
      return new Matrix3();
    }

    const FinvT = Finv.transpose();
    const P = F.multiplyScalar(this.mu);
    const term = FinvT.multiplyScalar(this.lambda * Math.log(detF) - this.mu);

    return P.add(term);
  }

  /**
   * Saint Venant-Kirchhoff material.
   */
  private computeStVKStress(F: Matrix3): Matrix3 {
    const FT = F.transpose();
    const C = FT.multiply(F);

    const I = Matrix3.identity();
    const E = C.sub(I).multiplyScalar(0.5);

    const traceE = E.elements[0] + E.elements[4] + E.elements[8];

    const S = new Matrix3();
    const Se = S.elements;
    const Ee = E.elements;

    for (let i = 0; i < 9; i++) {
      Se[i] = 2 * this.mu * Ee[i];
    }

    Se[0] += this.lambda * traceE;
    Se[4] += this.lambda * traceE;
    Se[8] += this.lambda * traceE;

    return F.multiply(S);
  }

  /**
   * Polar decomposition to extract rotation (simple iterative method).
   */
  private polarDecomposition(A: Matrix3): Matrix3 {
    const R = A.clone();

    for (let iter = 0; iter < 5; iter++) {
      const Rinv = R.invert();
      if (!Rinv) break;

      const RinvT = Rinv.transpose();
      const Re = R.elements;
      const Rie = RinvT.elements;

      for (let i = 0; i < 9; i++) {
        Re[i] = 0.5 * (Re[i] + Rie[i]);
      }
    }

    return R;
  }

  /**
   * Computes force gradient H = -P * Dm^(-T).
   */
  private computeForceGradient(P: Matrix3, tet: Tetrahedron): Matrix3 {
    const DmInvT = tet.inverseRestMatrix.transpose();
    return P.multiply(DmInvT);
  }

  /**
   * Extracts force for vertex i from force gradient.
   */
  private extractColumnForce(H: Matrix3, vertexIndex: number): Vector3 {
    const He = H.elements;

    if (vertexIndex === 0) {
      const sum = new Vector3(
        -(He[0] + He[3] + He[6]),
        -(He[1] + He[4] + He[7]),
        -(He[2] + He[5] + He[8])
      );
      return sum;
    } else {
      const col = vertexIndex - 1;
      return new Vector3(He[col * 3], He[col * 3 + 1], He[col * 3 + 2]);
    }
  }

  /**
   * Explicit Euler integration.
   */
  private integrateExplicit(softBody: SoftBody, dt: number): void {
    for (const particle of softBody.particles) {
      if (particle.inverseMass === 0) continue;

      particle.velocity.addInPlace(softBody.config.gravity.scale(dt));
      particle.position.addInPlace(particle.velocity.scale(dt));
    }
  }

  /**
   * Semi-implicit Euler integration (symplectic Euler).
   */
  private integrateSemiImplicit(softBody: SoftBody, dt: number): void {
    for (const particle of softBody.particles) {
      if (particle.inverseMass === 0) continue;

      particle.velocity.addInPlace(softBody.config.gravity.scale(dt));
      particle.position.addInPlace(particle.velocity.scale(dt));
      particle.velocity.scaleInPlace(softBody.config.damping);
    }
  }

  /**
   * Implicit Euler integration (backward Euler, simplified).
   */
  private integrateImplicit(softBody: SoftBody, dt: number): void {
    const dampingFactor = 1.0 / (1.0 + dt * (1.0 - softBody.config.damping));

    for (const particle of softBody.particles) {
      if (particle.inverseMass === 0) continue;

      particle.velocity.addInPlace(softBody.config.gravity.scale(dt));
      particle.velocity.scaleInPlace(dampingFactor);
      particle.position.addInPlace(particle.velocity.scale(dt));
    }
  }

  /**
   * Updates material parameters.
   *
   * @param material - New material parameters
   */
  setMaterial(material: MaterialParameters): void {
    this.config.material = material;
    this.computeLameParameters();
  }
}

/**
 * Helper methods for Matrix3 (extended operations).
 */
declare module '../../math/Matrix3' {
  interface Matrix3 {
    sub(m: Matrix3): Matrix3;
    add(m: Matrix3): Matrix3;
  }
}

if (!Matrix3.prototype.sub) {
  Matrix3.prototype.sub = function(m: Matrix3): Matrix3 {
    const result = new Matrix3();
    const re = result.elements;
    const ae = this.elements;
    const be = m.elements;

    for (let i = 0; i < 9; i++) {
      re[i] = ae[i] - be[i];
    }

    return result;
  };
}

if (!Matrix3.prototype.add) {
  Matrix3.prototype.add = function(m: Matrix3): Matrix3 {
    const result = new Matrix3();
    const re = result.elements;
    const ae = this.elements;
    const be = m.elements;

    for (let i = 0; i < 9; i++) {
      re[i] = ae[i] + be[i];
    }

    return result;
  };
}

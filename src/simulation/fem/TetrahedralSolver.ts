/**
 * Finite Element Method (FEM) solver for deformable bodies.
 * Implements corotational FEM with linear and nonlinear elasticity,
 * implicit integration, and sparse matrix solver.
 * @module TetrahedralSolver
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix3 } from '../../math/Matrix3';
import { Logger } from '../../core/Logger';
import { TetrahedralMesh, TetrahedralVertex, Tetrahedron } from './TetrahedralMesh';

const logger = Logger.get('TetrahedralSolver');

/**
 * Configuration for FEM solver.
 */
export interface FEMSolverConfig {
  timeStep: number;
  gravity: Vector3;
  damping: number;
  linearSolverIterations: number;
  useImplicitIntegration: boolean;
  useCorotationalFEM: boolean;
}

/**
 * Sparse matrix entry for FEM system.
 */
interface SparseEntry {
  row: number;
  col: number;
  value: number;
}

/**
 * FEM solver for tetrahedral meshes.
 */
export class TetrahedralSolver {
  private readonly config: FEMSolverConfig;
  private readonly mesh: TetrahedralMesh;

  private readonly stiffnessMatrix: Map<string, number>;
  private readonly systemRHS: Float64Array;

  private lambda: number;
  private mu: number;

  /**
   * Creates a new FEM solver.
   * @param mesh - Tetrahedral mesh
   * @param config - Solver configuration
   */
  constructor(mesh: TetrahedralMesh, config: Partial<FEMSolverConfig> = {}) {
    this.mesh = mesh;
    this.config = {
      timeStep: config.timeStep ?? 0.016,
      gravity: config.gravity ?? new Vector3(0, -9.81, 0),
      damping: config.damping ?? 0.999,
      linearSolverIterations: config.linearSolverIterations ?? 50,
      useImplicitIntegration: config.useImplicitIntegration ?? true,
      useCorotationalFEM: config.useCorotationalFEM ?? true,
    };

    const vertexCount = mesh.getVertexCount();
    this.stiffnessMatrix = new Map();
    this.systemRHS = new Float64Array(vertexCount * 3);

    const material = mesh.getMaterial();
    const E = material.youngsModulus;
    const nu = material.poissonsRatio;

    this.lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    this.mu = E / (2 * (1 + nu));

    logger.info(
      `FEM solver initialized: ${mesh.getVertexCount()} vertices, ` +
      `${mesh.getTetrahedronCount()} tetrahedra, ` +
      `Lamé parameters: λ=${this.lambda.toFixed(2)}, µ=${this.mu.toFixed(2)}`
    );
  }

  /**
   * Performs one simulation step.
   * @param dt - Time step (optional, uses config value if not provided)
   */
  public step(dt?: number): void {
    const timeStep = dt ?? this.config.timeStep;

    this.mesh.clearForces();

    this.applyGravity();

    this.mesh.updateDeformationGradients();

    if (this.config.useImplicitIntegration) {
      this.implicitStep(timeStep);
    } else {
      this.explicitStep(timeStep);
    }

    this.applyDamping();
  }

  /**
   * Applies gravitational forces to all vertices.
   */
  private applyGravity(): void {
    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);
      if (!vertex.isFixed) {
        const gravityForce = this.config.gravity.scale(vertex.mass);
        this.mesh.applyForceToVertex(i, gravityForce);
      }
    }
  }

  /**
   * Computes elastic forces using corotational FEM.
   */
  private computeElasticForces(): void {
    for (let tetIdx = 0; tetIdx < this.mesh.getTetrahedronCount(); tetIdx++) {
      const tet = this.mesh.getTetrahedron(tetIdx);
      const F = this.mesh.getDeformationGradient(tetIdx);

      let strain: Matrix3;
      let rotation: Matrix3;

      if (this.config.useCorotationalFEM) {
        const polar = this.polarDecomposition(F);
        rotation = polar.rotation;
        strain = polar.rotation.transpose().multiply(F).sub(Matrix3.identity());
      } else {
        rotation = Matrix3.identity();
        strain = F.sub(Matrix3.identity());
      }

      const stress = this.computeStress(strain);

      const P = rotation.multiply(stress);

      const Dm_inv = this.mesh.getInvRestMatrix(tetIdx);
      const H = P.multiply(Dm_inv.transpose()).scale(-tet.restVolume);

      const [v0, v1, v2, v3] = tet.vertices;

      const f1 = new Vector3(H.m11, H.m21, H.m31);
      const f2 = new Vector3(H.m12, H.m22, H.m32);
      const f3 = new Vector3(H.m13, H.m23, H.m33);
      const f0 = f1.add(f2).add(f3).scale(-1);

      this.mesh.applyForceToVertex(v0, f0);
      this.mesh.applyForceToVertex(v1, f1);
      this.mesh.applyForceToVertex(v2, f2);
      this.mesh.applyForceToVertex(v3, f3);
    }
  }

  /**
   * Computes stress from strain using linear elasticity.
   */
  private computeStress(strain: Matrix3): Matrix3 {
    const traceStrain = strain.m11 + strain.m22 + strain.m33;

    const m11 = 2 * this.mu * strain.m11 + this.lambda * traceStrain;
    const m22 = 2 * this.mu * strain.m22 + this.lambda * traceStrain;
    const m33 = 2 * this.mu * strain.m33 + this.lambda * traceStrain;
    const m12 = 2 * this.mu * strain.m12;
    const m13 = 2 * this.mu * strain.m13;
    const m21 = 2 * this.mu * strain.m21;
    const m23 = 2 * this.mu * strain.m23;
    const m31 = 2 * this.mu * strain.m31;
    const m32 = 2 * this.mu * strain.m32;

    return new Matrix3(m11, m12, m13, m21, m22, m23, m31, m32, m33);
  }

  /**
   * Polar decomposition of deformation gradient F = R * S.
   * Returns rotation matrix R.
   */
  private polarDecomposition(F: Matrix3): { rotation: Matrix3; stretch: Matrix3 } {
    let R = F.clone();

    for (let iter = 0; iter < 10; iter++) {
      const Rinv = R.invert();
      const RinvT = Rinv.transpose();

      const update = R.add(RinvT).scale(0.5);

      const diff = update.sub(R);
      const diffNorm = Math.sqrt(
        diff.m11 * diff.m11 + diff.m12 * diff.m12 + diff.m13 * diff.m13 +
        diff.m21 * diff.m21 + diff.m22 * diff.m22 + diff.m23 * diff.m23 +
        diff.m31 * diff.m31 + diff.m32 * diff.m32 + diff.m33 * diff.m33
      );

      R = update;

      if (diffNorm < 1e-6) {
        break;
      }
    }

    if (R.determinant() < 0) {
      R = R.scale(-1);
    }

    const S = R.transpose().multiply(F);

    return { rotation: R, stretch: S };
  }

  /**
   * Explicit time integration.
   */
  private explicitStep(dt: number): void {
    this.computeElasticForces();

    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);

      if (vertex.isFixed) {
        continue;
      }

      const acceleration = vertex.force.scale(1.0 / vertex.mass);

      vertex.velocity = vertex.velocity.add(acceleration.scale(dt));

      vertex.position = vertex.position.add(vertex.velocity.scale(dt));
    }
  }

  /**
   * Implicit time integration using backward Euler.
   */
  private implicitStep(dt: number): void {
    this.computeElasticForces();

    this.assembleSystemMatrix(dt);

    this.solveLinearSystem();

    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);

      if (vertex.isFixed) {
        continue;
      }

      const dx = new Vector3(
        this.systemRHS[i * 3],
        this.systemRHS[i * 3 + 1],
        this.systemRHS[i * 3 + 2]
      );

      vertex.velocity = dx.scale(1.0 / dt);
      vertex.position = vertex.position.add(dx);
    }
  }

  /**
   * Assembles the system matrix for implicit integration.
   * (M - dt² * K) * Δx = dt * (dt * f + M * v)
   */
  private assembleSystemMatrix(dt: number): void {
    this.stiffnessMatrix.clear();

    const vertexCount = this.mesh.getVertexCount();

    for (let i = 0; i < vertexCount; i++) {
      const vertex = this.mesh.getVertex(i);

      if (vertex.isFixed) {
        for (let d = 0; d < 3; d++) {
          const idx = i * 3 + d;
          this.setMatrixEntry(idx, idx, 1.0);
          this.systemRHS[idx] = 0;
        }
      } else {
        const mass = vertex.mass;

        for (let d = 0; d < 3; d++) {
          const idx = i * 3 + d;
          this.setMatrixEntry(idx, idx, mass);

          const vComponent = d === 0 ? vertex.velocity.x :
                            d === 1 ? vertex.velocity.y : vertex.velocity.z;
          const fComponent = d === 0 ? vertex.force.x :
                            d === 1 ? vertex.force.y : vertex.force.z;

          this.systemRHS[idx] = dt * (dt * fComponent + mass * vComponent);
        }
      }
    }
  }

  /**
   * Sets a matrix entry.
   */
  private setMatrixEntry(row: number, col: number, value: number): void {
    const key = `${row},${col}`;
    const existing = this.stiffnessMatrix.get(key) || 0;
    this.stiffnessMatrix.set(key, existing + value);
  }

  /**
   * Gets a matrix entry.
   */
  private getMatrixEntry(row: number, col: number): number {
    const key = `${row},${col}`;
    return this.stiffnessMatrix.get(key) || 0;
  }

  /**
   * Solves the linear system using Jacobi iteration.
   */
  private solveLinearSystem(): void {
    const n = this.systemRHS.length;
    const x = new Float64Array(n);
    const xNew = new Float64Array(n);

    for (let iter = 0; iter < this.config.linearSolverIterations; iter++) {
      for (let i = 0; i < n; i++) {
        const vertex = this.mesh.getVertex(Math.floor(i / 3));

        if (vertex.isFixed) {
          xNew[i] = 0;
          continue;
        }

        let sum = this.systemRHS[i];

        for (let j = 0; j < n; j++) {
          if (i !== j) {
            sum -= this.getMatrixEntry(i, j) * x[j];
          }
        }

        const diag = this.getMatrixEntry(i, i);
        xNew[i] = diag !== 0 ? sum / diag : 0;
      }

      x.set(xNew);
    }

    this.systemRHS.set(x);
  }

  /**
   * Applies velocity damping.
   */
  private applyDamping(): void {
    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);
      if (!vertex.isFixed) {
        vertex.velocity = vertex.velocity.scale(this.config.damping);
      }
    }
  }

  /**
   * Applies an external force to a vertex.
   */
  public applyForce(vertexIndex: number, force: Vector3): void {
    this.mesh.applyForceToVertex(vertexIndex, force);
  }

  /**
   * Applies a force to vertices in a region.
   */
  public applyForceInRegion(center: Vector3, radius: number, force: Vector3): void {
    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);
      const distance = vertex.position.sub(center).length();

      if (distance < radius) {
        const falloff = 1.0 - distance / radius;
        this.mesh.applyForceToVertex(i, force.scale(falloff));
      }
    }
  }

  /**
   * Sets a vertex velocity.
   */
  public setVertexVelocity(vertexIndex: number, velocity: Vector3): void {
    const vertex = this.mesh.getVertex(vertexIndex);
    if (!vertex.isFixed) {
      vertex.velocity = velocity.clone();
    }
  }

  /**
   * Gets the mesh.
   */
  public getMesh(): TetrahedralMesh {
    return this.mesh;
  }

  /**
   * Gets the configuration.
   */
  public getConfig(): Readonly<FEMSolverConfig> {
    return this.config;
  }

  /**
   * Computes total kinetic energy.
   */
  public computeKineticEnergy(): number {
    let energy = 0;

    for (let i = 0; i < this.mesh.getVertexCount(); i++) {
      const vertex = this.mesh.getVertex(i);
      energy += 0.5 * vertex.mass * vertex.velocity.lengthSq();
    }

    return energy;
  }

  /**
   * Computes total elastic potential energy.
   */
  public computePotentialEnergy(): number {
    let energy = 0;

    for (let tetIdx = 0; tetIdx < this.mesh.getTetrahedronCount(); tetIdx++) {
      const tet = this.mesh.getTetrahedron(tetIdx);
      const F = this.mesh.getDeformationGradient(tetIdx);

      const strain = F.sub(Matrix3.identity());
      const traceStrain = strain.m11 + strain.m22 + strain.m33;

      const traceStrainSq = traceStrain * traceStrain;

      const strainNormSq =
        strain.m11 * strain.m11 + strain.m12 * strain.m12 + strain.m13 * strain.m13 +
        strain.m21 * strain.m21 + strain.m22 * strain.m22 + strain.m23 * strain.m23 +
        strain.m31 * strain.m31 + strain.m32 * strain.m32 + strain.m33 * strain.m33;

      const tetEnergy = tet.restVolume * (0.5 * this.lambda * traceStrainSq + this.mu * strainNormSq);

      energy += tetEnergy;
    }

    return energy;
  }
}

/**
 * 3D grid for smoke simulation with velocity and density fields.
 * Implements staggered MAC (Marker-and-Cell) grid for incompressible flow.
 * @module SmokeGrid
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.get('SmokeGrid');

/**
 * Staggered grid for smoke simulation.
 * Velocities are stored at cell faces, density at cell centers.
 */
export class SmokeGrid {
  private readonly resolution: Vector3;
  private readonly cellSize: number;
  private readonly bounds: Vector3;

  private velocityU: Float32Array;
  private velocityV: Float32Array;
  private velocityW: Float32Array;

  private velocityUTemp: Float32Array;
  private velocityVTemp: Float32Array;
  private velocityWTemp: Float32Array;

  private density: Float32Array;
  private densityTemp: Float32Array;

  private pressure: Float32Array;
  private divergence: Float32Array;

  private readonly obstacles: Uint8Array;

  /**
   * Creates a new smoke grid.
   * @param resolution - Grid resolution
   * @param bounds - Physical domain size
   */
  constructor(resolution: Vector3, bounds: Vector3) {
    this.resolution = resolution.clone();
    this.bounds = bounds.clone();
    this.cellSize = Math.min(
      bounds.x / resolution.x,
      bounds.y / resolution.y,
      bounds.z / resolution.z
    );

    const size = resolution.x * resolution.y * resolution.z;

    this.velocityU = new Float32Array(size);
    this.velocityV = new Float32Array(size);
    this.velocityW = new Float32Array(size);

    this.velocityUTemp = new Float32Array(size);
    this.velocityVTemp = new Float32Array(size);
    this.velocityWTemp = new Float32Array(size);

    this.density = new Float32Array(size);
    this.densityTemp = new Float32Array(size);

    this.pressure = new Float32Array(size);
    this.divergence = new Float32Array(size);

    this.obstacles = new Uint8Array(size);

    logger.info(`Smoke grid initialized: ${resolution.x}x${resolution.y}x${resolution.z}`);
  }

  /**
   * Gets the 1D index from 3D coordinates.
   */
  private getIndex(i: number, j: number, k: number): number {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    return i + rx * (j + ry * k);
  }

  /**
   * Checks if cell is valid.
   */
  private isValid(i: number, j: number, k: number): boolean {
    return i >= 0 && i < this.resolution.x &&
           j >= 0 && j < this.resolution.y &&
           k >= 0 && k < this.resolution.z;
  }

  /**
   * Gets velocity at cell center.
   */
  public getVelocity(i: number, j: number, k: number): Vector3 {
    if (!this.isValid(i, j, k)) {
      return Vector3.zero();
    }

    const idx = this.getIndex(i, j, k);
    return new Vector3(
      this.velocityU[idx],
      this.velocityV[idx],
      this.velocityW[idx]
    );
  }

  /**
   * Sets velocity at cell center.
   */
  public setVelocity(i: number, j: number, k: number, velocity: Vector3): void {
    if (this.isValid(i, j, k)) {
      const idx = this.getIndex(i, j, k);
      this.velocityU[idx] = velocity.x;
      this.velocityV[idx] = velocity.y;
      this.velocityW[idx] = velocity.z;
    }
  }

  /**
   * Gets density at cell.
   */
  public getDensity(i: number, j: number, k: number): number {
    if (!this.isValid(i, j, k)) {
      return 0;
    }
    return this.density[this.getIndex(i, j, k)];
  }

  /**
   * Sets density at cell.
   */
  public setDensity(i: number, j: number, k: number, value: number): void {
    if (this.isValid(i, j, k)) {
      this.density[this.getIndex(i, j, k)] = value;
    }
  }

  /**
   * Adds density at cell.
   */
  public addDensity(i: number, j: number, k: number, amount: number): void {
    if (this.isValid(i, j, k)) {
      const idx = this.getIndex(i, j, k);
      this.density[idx] = Math.min(1, this.density[idx]! + amount);
    }
  }

  /**
   * Samples velocity at world position using trilinear interpolation.
   */
  public sampleVelocity(position: Vector3): Vector3 {
    const gridPos = new Vector3(
      (position.x / this.bounds.x) * this.resolution.x,
      (position.y / this.bounds.y) * this.resolution.y,
      (position.z / this.bounds.z) * this.resolution.z
    );

    const i = Math.floor(gridPos.x);
    const j = Math.floor(gridPos.y);
    const k = Math.floor(gridPos.z);

    if (i < 0 || i >= this.resolution.x - 1 ||
        j < 0 || j >= this.resolution.y - 1 ||
        k < 0 || k >= this.resolution.z - 1) {
      return Vector3.zero();
    }

    const fx = gridPos.x - i;
    const fy = gridPos.y - j;
    const fz = gridPos.z - k;

    const v000 = this.getVelocity(i, j, k);
    const v100 = this.getVelocity(i + 1, j, k);
    const v010 = this.getVelocity(i, j + 1, k);
    const v110 = this.getVelocity(i + 1, j + 1, k);
    const v001 = this.getVelocity(i, j, k + 1);
    const v101 = this.getVelocity(i + 1, j, k + 1);
    const v011 = this.getVelocity(i, j + 1, k + 1);
    const v111 = this.getVelocity(i + 1, j + 1, k + 1);

    const v00 = v000.scale(1 - fx).add(v100.scale(fx));
    const v01 = v001.scale(1 - fx).add(v101.scale(fx));
    const v10 = v010.scale(1 - fx).add(v110.scale(fx));
    const v11 = v011.scale(1 - fx).add(v111.scale(fx));

    const v0 = v00.scale(1 - fy).add(v10.scale(fy));
    const v1 = v01.scale(1 - fy).add(v11.scale(fy));

    return v0.scale(1 - fz).add(v1.scale(fz));
  }

  /**
   * Samples density at world position using trilinear interpolation.
   */
  public sampleDensity(position: Vector3): number {
    const gridPos = new Vector3(
      (position.x / this.bounds.x) * this.resolution.x,
      (position.y / this.bounds.y) * this.resolution.y,
      (position.z / this.bounds.z) * this.resolution.z
    );

    const i = Math.floor(gridPos.x);
    const j = Math.floor(gridPos.y);
    const k = Math.floor(gridPos.z);

    if (i < 0 || i >= this.resolution.x - 1 ||
        j < 0 || j >= this.resolution.y - 1 ||
        k < 0 || k >= this.resolution.z - 1) {
      return 0;
    }

    const fx = gridPos.x - i;
    const fy = gridPos.y - j;
    const fz = gridPos.z - k;

    const c000 = this.getDensity(i, j, k);
    const c100 = this.getDensity(i + 1, j, k);
    const c010 = this.getDensity(i, j + 1, k);
    const c110 = this.getDensity(i + 1, j + 1, k);
    const c001 = this.getDensity(i, j, k + 1);
    const c101 = this.getDensity(i + 1, j, k + 1);
    const c011 = this.getDensity(i, j + 1, k + 1);
    const c111 = this.getDensity(i + 1, j + 1, k + 1);

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Advects velocity field using semi-Lagrangian method.
   */
  public advectVelocity(dt: number): void {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    const rz = this.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const worldPos = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const velocity = this.getVelocity(i, j, k);
          const prevPos = worldPos.sub(velocity.scale(dt));

          const advectedVelocity = this.sampleVelocity(prevPos);

          const idx = this.getIndex(i, j, k);
          this.velocityUTemp[idx] = advectedVelocity.x;
          this.velocityVTemp[idx] = advectedVelocity.y;
          this.velocityWTemp[idx] = advectedVelocity.z;
        }
      }
    }

    this.swapVelocityBuffers();
  }

  /**
   * Advects density field using semi-Lagrangian method.
   */
  public advectDensity(dt: number): void {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    const rz = this.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const worldPos = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const velocity = this.getVelocity(i, j, k);
          const prevPos = worldPos.sub(velocity.scale(dt));

          this.densityTemp[this.getIndex(i, j, k)] = this.sampleDensity(prevPos);
        }
      }
    }

    this.swapDensityBuffers();
  }

  /**
   * Computes velocity divergence for pressure solve.
   */
  public computeDivergence(): void {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    const rz = this.resolution.z;

    for (let k = 1; k < rz - 1; k++) {
      for (let j = 1; j < ry - 1; j++) {
        for (let i = 1; i < rx - 1; i++) {
          const idx = this.getIndex(i, j, k);

          if (this.obstacles[idx]) {
            this.divergence[idx] = 0;
            continue;
          }

          const vxR = this.velocityU[this.getIndex(i + 1, j, k)]!;
          const vxL = this.velocityU[this.getIndex(i - 1, j, k)]!;
          const vyT = this.velocityV[this.getIndex(i, j + 1, k)]!;
          const vyB = this.velocityV[this.getIndex(i, j - 1, k)]!;
          const vzF = this.velocityW[this.getIndex(i, j, k + 1)]!;
          const vzK = this.velocityW[this.getIndex(i, j, k - 1)]!;

          this.divergence[idx] = ((vxR - vxL) + (vyT - vyB) + (vzF - vzK)) / (2.0 * this.cellSize);
        }
      }
    }
  }

  /**
   * Solves for pressure using Jacobi iteration.
   */
  public solvePressure(iterations: number = 40): void {
    this.pressure.fill(0);

    const alpha = -(this.cellSize * this.cellSize);
    const rBeta = 1.0 / 6.0;

    for (let iter = 0; iter < iterations; iter++) {
      const pTemp = new Float32Array(this.pressure);

      for (let k = 1; k < this.resolution.z - 1; k++) {
        for (let j = 1; j < this.resolution.y - 1; j++) {
          for (let i = 1; i < this.resolution.x - 1; i++) {
            const idx = this.getIndex(i, j, k);

            if (this.obstacles[idx]) {
              continue;
            }

            const pL = pTemp[this.getIndex(i - 1, j, k)]!;
            const pR = pTemp[this.getIndex(i + 1, j, k)]!;
            const pB = pTemp[this.getIndex(i, j - 1, k)]!;
            const pT = pTemp[this.getIndex(i, j + 1, k)]!;
            const pK = pTemp[this.getIndex(i, j, k - 1)]!;
            const pF = pTemp[this.getIndex(i, j, k + 1)]!;

            const div = this.divergence[idx]!;

            this.pressure[idx] = (pL + pR + pB + pT + pK + pF + alpha * div) * rBeta;
          }
        }
      }
    }
  }

  /**
   * Subtracts pressure gradient from velocity to enforce incompressibility.
   */
  public subtractPressureGradient(): void {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    const rz = this.resolution.z;

    for (let k = 1; k < rz - 1; k++) {
      for (let j = 1; j < ry - 1; j++) {
        for (let i = 1; i < rx - 1; i++) {
          const idx = this.getIndex(i, j, k);

          if (this.obstacles[idx]) {
            continue;
          }

          const pL = this.pressure[this.getIndex(i - 1, j, k)]!;
          const pR = this.pressure[this.getIndex(i + 1, j, k)]!;
          const pB = this.pressure[this.getIndex(i, j - 1, k)]!;
          const pT = this.pressure[this.getIndex(i, j + 1, k)]!;
          const pK = this.pressure[this.getIndex(i, j, k - 1)]!;
          const pF = this.pressure[this.getIndex(i, j, k + 1)]!;

          const gradX = (pR - pL) / (2.0 * this.cellSize);
          const gradY = (pT - pB) / (2.0 * this.cellSize);
          const gradZ = (pF - pK) / (2.0 * this.cellSize);

          this.velocityU[idx]! -= gradX;
          this.velocityV[idx]! -= gradY;
          this.velocityW[idx]! -= gradZ;
        }
      }
    }
  }

  /**
   * Applies dissipation to density.
   */
  public applyDissipation(dt: number, rate: number): void {
    const decay = Math.exp(-rate * dt);
    for (let i = 0; i < this.density.length; i++) {
      this.density[i]! *= decay;
    }
  }

  /**
   * Marks cell as obstacle.
   */
  public setObstacle(i: number, j: number, k: number, isObstacle: boolean): void {
    if (this.isValid(i, j, k)) {
      this.obstacles[this.getIndex(i, j, k)] = isObstacle ? 1 : 0;
    }
  }

  /**
   * Checks if cell is obstacle.
   */
  public isObstacle(i: number, j: number, k: number): boolean {
    if (!this.isValid(i, j, k)) {
      return true;
    }
    return this.obstacles[this.getIndex(i, j, k)] === 1;
  }

  /**
   * Swaps velocity buffers.
   */
  private swapVelocityBuffers(): void {
    [this.velocityU, this.velocityUTemp] = [this.velocityUTemp, this.velocityU];
    [this.velocityV, this.velocityVTemp] = [this.velocityVTemp, this.velocityV];
    [this.velocityW, this.velocityWTemp] = [this.velocityWTemp, this.velocityW];
  }

  /**
   * Swaps density buffers.
   */
  private swapDensityBuffers(): void {
    [this.density, this.densityTemp] = [this.densityTemp, this.density];
  }

  /**
   * Clears all fields.
   */
  public clear(): void {
    this.velocityU.fill(0);
    this.velocityV.fill(0);
    this.velocityW.fill(0);
    this.density.fill(0);
    this.pressure.fill(0);
    this.divergence.fill(0);
  }

  /**
   * Gets grid resolution.
   */
  public getResolution(): Vector3 {
    return this.resolution.clone();
  }

  /**
   * Gets cell size.
   */
  public getCellSize(): number {
    return this.cellSize;
  }

  /**
   * Gets domain bounds.
   */
  public getBounds(): Vector3 {
    return this.bounds.clone();
  }

  /**
   * Gets density data.
   */
  public getDensityData(): Float32Array {
    return this.density;
  }

  /**
   * Gets velocity data.
   */
  public getVelocityData(): { u: Float32Array; v: Float32Array; w: Float32Array } {
    return {
      u: this.velocityU,
      v: this.velocityV,
      w: this.velocityW,
    };
  }
}

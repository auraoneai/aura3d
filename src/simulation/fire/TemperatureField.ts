/**
 * Temperature field for fire simulation using a 3D grid.
 * Handles temperature storage, advection, diffusion, and heat dissipation.
 * Optimized for 64³ grids at 60 FPS.
 * @module TemperatureField
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.get('TemperatureField');

/**
 * 3D temperature field for fire and combustion simulation.
 * Uses a staggered grid layout for numerical stability.
 */
export class TemperatureField {
  private readonly resolution: Vector3;
  private readonly cellSize: number;
  private readonly bounds: Vector3;

  private current: Float32Array;
  private next: Float32Array;

  private readonly ambientTemperature: number;
  private readonly thermalDiffusivity: number;

  /**
   * Creates a new temperature field.
   * @param resolution - Grid resolution (cells per axis)
   * @param bounds - Physical size of the domain
   * @param ambientTemp - Ambient temperature in Kelvin (default: 293K / 20°C)
   * @param diffusivity - Thermal diffusivity coefficient (default: 2.2e-5 m²/s for air)
   */
  constructor(
    resolution: Vector3,
    bounds: Vector3,
    ambientTemp: number = 293.0,
    diffusivity: number = 2.2e-5
  ) {
    this.resolution = resolution.clone();
    this.bounds = bounds.clone();
    this.cellSize = Math.min(
      bounds.x / resolution.x,
      bounds.y / resolution.y,
      bounds.z / resolution.z
    );

    this.ambientTemperature = ambientTemp;
    this.thermalDiffusivity = diffusivity;

    const size = resolution.x * resolution.y * resolution.z;
    this.current = new Float32Array(size);
    this.next = new Float32Array(size);

    this.current.fill(ambientTemp);
    this.next.fill(ambientTemp);

    logger.info(`Temperature field initialized: ${resolution.x}x${resolution.y}x${resolution.z}`);
  }

  /**
   * Gets the 1D index from 3D coordinates.
   * @param i - X index
   * @param j - Y index
   * @param k - Z index
   * @returns Linear index
   */
  private getIndex(i: number, j: number, k: number): number {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    return i + rx * (j + ry * k);
  }

  /**
   * Gets temperature at grid cell.
   * @param i - X index
   * @param j - Y index
   * @param k - Z index
   * @returns Temperature in Kelvin
   */
  public getTemperature(i: number, j: number, k: number): number {
    if (i < 0 || i >= this.resolution.x ||
        j < 0 || j >= this.resolution.y ||
        k < 0 || k >= this.resolution.z) {
      return this.ambientTemperature;
    }
    return this.current[this.getIndex(i, j, k)];
  }

  /**
   * Sets temperature at grid cell.
   * @param i - X index
   * @param j - Y index
   * @param k - Z index
   * @param temperature - Temperature in Kelvin
   */
  public setTemperature(i: number, j: number, k: number, temperature: number): void {
    if (i >= 0 && i < this.resolution.x &&
        j >= 0 && j < this.resolution.y &&
        k >= 0 && k < this.resolution.z) {
      this.current[this.getIndex(i, j, k)] = temperature;
    }
  }

  /**
   * Samples temperature at world position using trilinear interpolation.
   * @param position - World space position
   * @returns Interpolated temperature
   */
  public sampleTemperature(position: Vector3): number {
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
      return this.ambientTemperature;
    }

    const fx = gridPos.x - i;
    const fy = gridPos.y - j;
    const fz = gridPos.z - k;

    const c000 = this.getTemperature(i, j, k);
    const c100 = this.getTemperature(i + 1, j, k);
    const c010 = this.getTemperature(i, j + 1, k);
    const c110 = this.getTemperature(i + 1, j + 1, k);
    const c001 = this.getTemperature(i, j, k + 1);
    const c101 = this.getTemperature(i + 1, j, k + 1);
    const c011 = this.getTemperature(i, j + 1, k + 1);
    const c111 = this.getTemperature(i + 1, j + 1, k + 1);

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Applies heat diffusion using explicit finite differences.
   * @param dt - Time step in seconds
   */
  public diffuse(dt: number): void {
    const alpha = this.thermalDiffusivity * dt / (this.cellSize * this.cellSize);

    for (let k = 1; k < this.resolution.z - 1; k++) {
      for (let j = 1; j < this.resolution.y - 1; j++) {
        for (let i = 1; i < this.resolution.x - 1; i++) {
          const idx = this.getIndex(i, j, k);
          const center = this.current[idx];

          const left = this.current[this.getIndex(i - 1, j, k)]!;
          const right = this.current[this.getIndex(i + 1, j, k)]!;
          const bottom = this.current[this.getIndex(i, j - 1, k)]!;
          const top = this.current[this.getIndex(i, j + 1, k)]!;
          const back = this.current[this.getIndex(i, j, k - 1)]!;
          const front = this.current[this.getIndex(i, j, k + 1)]!;

          const laplacian = left + right + bottom + top + back + front - 6.0 * center;
          this.next[idx] = center + alpha * laplacian;
        }
      }
    }

    this.swapBuffers();
  }

  /**
   * Advects temperature along a velocity field using semi-Lagrangian method.
   * @param velocityField - Velocity field callback (x, y, z) => Vector3
   * @param dt - Time step in seconds
   */
  public advect(velocityField: (i: number, j: number, k: number) => Vector3, dt: number): void {
    const rx = this.resolution.x;
    const ry = this.resolution.y;
    const rz = this.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const velocity = velocityField(i, j, k);

          const worldPos = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const prevPos = worldPos.sub(velocity.scale(dt));

          const temp = this.sampleTemperature(prevPos);
          this.next[this.getIndex(i, j, k)] = temp;
        }
      }
    }

    this.swapBuffers();
  }

  /**
   * Applies heat dissipation (cooling) over time.
   * @param dt - Time step in seconds
   * @param coolingRate - Cooling rate coefficient (0 = no cooling, 1 = instant)
   */
  public cool(dt: number, coolingRate: number = 0.05): void {
    const decay = Math.exp(-coolingRate * dt);

    for (let i = 0; i < this.current.length; i++) {
      const temp = this.current[i]!;
      const delta = temp - this.ambientTemperature;
      this.current[i] = this.ambientTemperature + delta * decay;
    }
  }

  /**
   * Adds heat source at position.
   * @param position - World position
   * @param radius - Source radius
   * @param temperature - Temperature to add
   */
  public addHeatSource(position: Vector3, radius: number, temperature: number): void {
    const gridPos = new Vector3(
      (position.x / this.bounds.x) * this.resolution.x,
      (position.y / this.bounds.y) * this.resolution.y,
      (position.z / this.bounds.z) * this.resolution.z
    );

    const radiusCells = Math.ceil(radius / this.cellSize);
    const radiusSq = radius * radius;

    const minI = Math.max(0, Math.floor(gridPos.x - radiusCells));
    const maxI = Math.min(this.resolution.x - 1, Math.ceil(gridPos.x + radiusCells));
    const minJ = Math.max(0, Math.floor(gridPos.y - radiusCells));
    const maxJ = Math.min(this.resolution.y - 1, Math.ceil(gridPos.y + radiusCells));
    const minK = Math.max(0, Math.floor(gridPos.z - radiusCells));
    const maxK = Math.min(this.resolution.z - 1, Math.ceil(gridPos.z + radiusCells));

    for (let k = minK; k <= maxK; k++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const cellCenter = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const distSq = cellCenter.sub(position).lengthSq();

          if (distSq < radiusSq) {
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            const idx = this.getIndex(i, j, k);
            this.current[idx] = Math.max(this.current[idx], temperature * falloff);
          }
        }
      }
    }
  }

  /**
   * Gets temperature gradient at cell (for buoyancy calculations).
   * @param i - X index
   * @param j - Y index
   * @param k - Z index
   * @returns Temperature gradient vector
   */
  public getGradient(i: number, j: number, k: number): Vector3 {
    if (i <= 0 || i >= this.resolution.x - 1 ||
        j <= 0 || j >= this.resolution.y - 1 ||
        k <= 0 || k >= this.resolution.z - 1) {
      return Vector3.zero();
    }

    const dx = (this.getTemperature(i + 1, j, k) - this.getTemperature(i - 1, j, k)) / (2.0 * this.cellSize);
    const dy = (this.getTemperature(i, j + 1, k) - this.getTemperature(i, j - 1, k)) / (2.0 * this.cellSize);
    const dz = (this.getTemperature(i, j, k + 1) - this.getTemperature(i, j, k - 1)) / (2.0 * this.cellSize);

    return new Vector3(dx, dy, dz);
  }

  /**
   * Clears temperature field to ambient temperature.
   */
  public clear(): void {
    this.current.fill(this.ambientTemperature);
    this.next.fill(this.ambientTemperature);
  }

  /**
   * Swaps current and next buffers.
   */
  private swapBuffers(): void {
    const temp = this.current;
    this.current = this.next;
    this.next = temp;
  }

  /**
   * Gets the grid resolution.
   */
  public getResolution(): Vector3 {
    return this.resolution.clone();
  }

  /**
   * Gets the domain bounds.
   */
  public getBounds(): Vector3 {
    return this.bounds.clone();
  }

  /**
   * Gets ambient temperature.
   */
  public getAmbientTemperature(): number {
    return this.ambientTemperature;
  }

  /**
   * Gets direct access to temperature data (for rendering).
   */
  public getData(): Float32Array {
    return this.current;
  }
}

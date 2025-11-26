/**
 * Complete smoke and gas simulation system.
 * Implements semi-Lagrangian advection, pressure projection (incompressibility),
 * vorticity confinement, and buoyancy forces.
 * Optimized for 128³ grids at 30 FPS.
 * @module SmokeSimulation
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { SmokeGrid } from './SmokeGrid';
import { BuoyancyForces, BuoyancyConfig } from './BuoyancyForces';
import { SmokeRenderer, RayMarchConfig } from './SmokeRenderer';

const logger = Logger.get('SmokeSimulation');

/**
 * Configuration for smoke simulation.
 */
export interface SmokeSimulationConfig {
  resolution: Vector3;
  bounds: Vector3;
  vorticityStrength: number;
  dissipationRate: number;
  pressureIterations: number;
  enableBuoyancy: boolean;
  enableVorticity: boolean;
}

/**
 * Complete smoke simulation with incompressible flow.
 */
export class SmokeSimulation {
  private readonly config: SmokeSimulationConfig;
  private readonly grid: SmokeGrid;
  private readonly buoyancy: BuoyancyForces;
  private readonly renderer: SmokeRenderer;

  private readonly temperatureField: Float32Array;
  private readonly vorticityFieldX: Float32Array;
  private readonly vorticityFieldY: Float32Array;
  private readonly vorticityFieldZ: Float32Array;

  /**
   * Creates a new smoke simulation.
   * @param config - Simulation configuration
   * @param buoyancyConfig - Buoyancy configuration
   * @param renderConfig - Renderer configuration
   */
  constructor(
    config: Partial<SmokeSimulationConfig> = {},
    buoyancyConfig?: Partial<BuoyancyConfig>,
    renderConfig?: Partial<RayMarchConfig>
  ) {
    this.config = {
      resolution: config.resolution ?? new Vector3(128, 128, 128),
      bounds: config.bounds ?? new Vector3(10, 10, 10),
      vorticityStrength: config.vorticityStrength ?? 0.5,
      dissipationRate: config.dissipationRate ?? 0.01,
      pressureIterations: config.pressureIterations ?? 40,
      enableBuoyancy: config.enableBuoyancy ?? true,
      enableVorticity: config.enableVorticity ?? true,
    };

    this.grid = new SmokeGrid(this.config.resolution, this.config.bounds);
    this.buoyancy = new BuoyancyForces(buoyancyConfig);
    this.renderer = new SmokeRenderer(renderConfig);

    const gridSize = this.config.resolution.x *
                     this.config.resolution.y *
                     this.config.resolution.z;

    this.temperatureField = new Float32Array(gridSize);
    this.temperatureField.fill(this.buoyancy.getConfig().ambientTemperature);

    this.vorticityFieldX = new Float32Array(gridSize);
    this.vorticityFieldY = new Float32Array(gridSize);
    this.vorticityFieldZ = new Float32Array(gridSize);

    logger.info(
      `Smoke simulation initialized: ${this.config.resolution.x}x${this.config.resolution.y}x${this.config.resolution.z}`
    );
  }

  /**
   * Gets the 1D index from 3D coordinates.
   */
  private getIndex(i: number, j: number, k: number): number {
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    return i + rx * (j + ry * k);
  }

  /**
   * Adds smoke source at position.
   * @param position - World position
   * @param radius - Source radius
   * @param density - Smoke density to add
   * @param velocity - Initial velocity
   * @param temperature - Temperature in Kelvin
   */
  public addSmokeSource(
    position: Vector3,
    radius: number,
    density: number,
    velocity: Vector3,
    temperature?: number
  ): void {
    const gridPos = new Vector3(
      (position.x / this.config.bounds.x) * this.config.resolution.x,
      (position.y / this.config.bounds.y) * this.config.resolution.y,
      (position.z / this.config.bounds.z) * this.config.resolution.z
    );

    const cellSize = this.grid.getCellSize();
    const radiusCells = Math.ceil(radius / cellSize);

    const minI = Math.max(0, Math.floor(gridPos.x - radiusCells));
    const maxI = Math.min(this.config.resolution.x - 1, Math.ceil(gridPos.x + radiusCells));
    const minJ = Math.max(0, Math.floor(gridPos.y - radiusCells));
    const maxJ = Math.min(this.config.resolution.y - 1, Math.ceil(gridPos.y + radiusCells));
    const minK = Math.max(0, Math.floor(gridPos.z - radiusCells));
    const maxK = Math.min(this.config.resolution.z - 1, Math.ceil(gridPos.z + radiusCells));

    for (let k = minK; k <= maxK; k++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const cellCenter = new Vector3(i + 0.5, j + 0.5, k + 0.5);
          const distance = cellCenter.sub(gridPos).length();

          if (distance < radiusCells) {
            const falloff = 1.0 - distance / radiusCells;

            this.grid.addDensity(i, j, k, density * falloff);

            const currentVelocity = this.grid.getVelocity(i, j, k);
            const newVelocity = currentVelocity.add(velocity.scale(falloff));
            this.grid.setVelocity(i, j, k, newVelocity);

            if (temperature !== undefined) {
              const idx = this.getIndex(i, j, k);
              this.temperatureField[idx] = Math.max(
                this.temperatureField[idx],
                temperature * falloff
              );
            }
          }
        }
      }
    }
  }

  /**
   * Updates the smoke simulation.
   * @param dt - Time step in seconds
   */
  public update(dt: number): void {
    if (this.config.enableBuoyancy) {
      this.buoyancy.applyBuoyancy(
        {
          getVelocity: this.grid.getVelocity.bind(this.grid),
          setVelocity: this.grid.setVelocity.bind(this.grid),
        },
        (i, j, k) => this.temperatureField[this.getIndex(i, j, k)],
        this.grid.getDensity.bind(this.grid),
        this.config.resolution,
        dt
      );
    }

    if (this.config.enableVorticity) {
      this.computeVorticity();
      this.applyVorticityConfinement(dt);
    }

    this.grid.advectVelocity(dt);

    this.grid.advectDensity(dt);

    this.advectTemperature(dt);

    this.grid.computeDivergence();
    this.grid.solvePressure(this.config.pressureIterations);
    this.grid.subtractPressureGradient();

    this.grid.applyDissipation(dt, this.config.dissipationRate);

    this.coolTemperature(dt);
  }

  /**
   * Computes vorticity field (curl of velocity).
   */
  private computeVorticity(): void {
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;
    const cellSize = this.grid.getCellSize();

    for (let k = 1; k < rz - 1; k++) {
      for (let j = 1; j < ry - 1; j++) {
        for (let i = 1; i < rx - 1; i++) {
          const vR = this.grid.getVelocity(i + 1, j, k);
          const vL = this.grid.getVelocity(i - 1, j, k);
          const vT = this.grid.getVelocity(i, j + 1, k);
          const vB = this.grid.getVelocity(i, j - 1, k);
          const vF = this.grid.getVelocity(i, j, k + 1);
          const vK = this.grid.getVelocity(i, j, k - 1);

          const dwdy = (vT.z - vB.z) / (2.0 * cellSize);
          const dvdz = (vF.y - vK.y) / (2.0 * cellSize);

          const dudz = (vF.x - vK.x) / (2.0 * cellSize);
          const dwdx = (vR.z - vL.z) / (2.0 * cellSize);

          const dvdx = (vR.y - vL.y) / (2.0 * cellSize);
          const dudy = (vT.x - vB.x) / (2.0 * cellSize);

          const idx = this.getIndex(i, j, k);
          this.vorticityFieldX[idx] = dwdy - dvdz;
          this.vorticityFieldY[idx] = dudz - dwdx;
          this.vorticityFieldZ[idx] = dvdx - dudy;
        }
      }
    }
  }

  /**
   * Applies vorticity confinement forces.
   */
  private applyVorticityConfinement(dt: number): void {
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;
    const cellSize = this.grid.getCellSize();

    for (let k = 1; k < rz - 1; k++) {
      for (let j = 1; j < ry - 1; j++) {
        for (let i = 1; i < rx - 1; i++) {
          const idx = this.getIndex(i, j, k);

          const wx = this.vorticityFieldX[idx];
          const wy = this.vorticityFieldY[idx];
          const wz = this.vorticityFieldZ[idx];

          const vorticity = new Vector3(wx, wy, wz);
          const vorticityMag = vorticity.length();

          if (vorticityMag < 1e-6) {
            continue;
          }

          const idxR = this.getIndex(i + 1, j, k);
          const idxL = this.getIndex(i - 1, j, k);
          const idxT = this.getIndex(i, j + 1, k);
          const idxB = this.getIndex(i, j - 1, k);
          const idxF = this.getIndex(i, j, k + 1);
          const idxK = this.getIndex(i, j, k - 1);

          const magR = new Vector3(
            this.vorticityFieldX[idxR],
            this.vorticityFieldY[idxR],
            this.vorticityFieldZ[idxR]
          ).length();

          const magL = new Vector3(
            this.vorticityFieldX[idxL],
            this.vorticityFieldY[idxL],
            this.vorticityFieldZ[idxL]
          ).length();

          const magT = new Vector3(
            this.vorticityFieldX[idxT],
            this.vorticityFieldY[idxT],
            this.vorticityFieldZ[idxT]
          ).length();

          const magB = new Vector3(
            this.vorticityFieldX[idxB],
            this.vorticityFieldY[idxB],
            this.vorticityFieldZ[idxB]
          ).length();

          const magF = new Vector3(
            this.vorticityFieldX[idxF],
            this.vorticityFieldY[idxF],
            this.vorticityFieldZ[idxF]
          ).length();

          const magK = new Vector3(
            this.vorticityFieldX[idxK],
            this.vorticityFieldY[idxK],
            this.vorticityFieldZ[idxK]
          ).length();

          const gradient = new Vector3(
            (magR - magL) / (2.0 * cellSize),
            (magT - magB) / (2.0 * cellSize),
            (magF - magK) / (2.0 * cellSize)
          );

          const gradMag = gradient.length();
          if (gradMag < 1e-6) {
            continue;
          }

          const N = gradient.scale(1.0 / gradMag);

          const force = N.cross(vorticity).scale(this.config.vorticityStrength * cellSize);

          const currentVelocity = this.grid.getVelocity(i, j, k);
          const newVelocity = currentVelocity.add(force.scale(dt));
          this.grid.setVelocity(i, j, k, newVelocity);
        }
      }
    }
  }

  /**
   * Advects temperature field.
   */
  private advectTemperature(dt: number): void {
    const tempBuffer = new Float32Array(this.temperatureField.length);
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;
    const cellSize = this.grid.getCellSize();

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const worldPos = new Vector3(
            (i + 0.5) * cellSize,
            (j + 0.5) * cellSize,
            (k + 0.5) * cellSize
          );

          const velocity = this.grid.getVelocity(i, j, k);
          const prevPos = worldPos.sub(velocity.scale(dt));

          const gridPos = new Vector3(
            (prevPos.x / this.config.bounds.x) * rx,
            (prevPos.y / this.config.bounds.y) * ry,
            (prevPos.z / this.config.bounds.z) * rz
          );

          tempBuffer[this.getIndex(i, j, k)] = this.sampleTemperature(gridPos);
        }
      }
    }

    this.temperatureField.set(tempBuffer);
  }

  /**
   * Samples temperature using trilinear interpolation.
   */
  private sampleTemperature(gridPos: Vector3): number {
    const i = Math.floor(gridPos.x);
    const j = Math.floor(gridPos.y);
    const k = Math.floor(gridPos.z);

    if (i < 0 || i >= this.config.resolution.x - 1 ||
        j < 0 || j >= this.config.resolution.y - 1 ||
        k < 0 || k >= this.config.resolution.z - 1) {
      return this.buoyancy.getConfig().ambientTemperature;
    }

    const fx = gridPos.x - i;
    const fy = gridPos.y - j;
    const fz = gridPos.z - k;

    const c000 = this.temperatureField[this.getIndex(i, j, k)]!;
    const c100 = this.temperatureField[this.getIndex(i + 1, j, k)]!;
    const c010 = this.temperatureField[this.getIndex(i, j + 1, k)]!;
    const c110 = this.temperatureField[this.getIndex(i + 1, j + 1, k)]!;
    const c001 = this.temperatureField[this.getIndex(i, j, k + 1)]!;
    const c101 = this.temperatureField[this.getIndex(i + 1, j, k + 1)]!;
    const c011 = this.temperatureField[this.getIndex(i, j + 1, k + 1)]!;
    const c111 = this.temperatureField[this.getIndex(i + 1, j + 1, k + 1)]!;

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Applies temperature cooling over time.
   */
  private coolTemperature(dt: number): void {
    const ambient = this.buoyancy.getConfig().ambientTemperature;
    const coolingRate = 0.1;
    const decay = Math.exp(-coolingRate * dt);

    for (let i = 0; i < this.temperatureField.length; i++) {
      const temp = this.temperatureField[i]!;
      const delta = temp - ambient;
      this.temperatureField[i] = ambient + delta * decay;
    }
  }

  /**
   * Adds an obstacle to the simulation.
   * @param position - Obstacle center
   * @param radius - Obstacle radius
   */
  public addObstacle(position: Vector3, radius: number): void {
    const gridPos = new Vector3(
      (position.x / this.config.bounds.x) * this.config.resolution.x,
      (position.y / this.config.bounds.y) * this.config.resolution.y,
      (position.z / this.config.bounds.z) * this.config.resolution.z
    );

    const cellSize = this.grid.getCellSize();
    const radiusCells = Math.ceil(radius / cellSize);

    const minI = Math.max(0, Math.floor(gridPos.x - radiusCells));
    const maxI = Math.min(this.config.resolution.x - 1, Math.ceil(gridPos.x + radiusCells));
    const minJ = Math.max(0, Math.floor(gridPos.y - radiusCells));
    const maxJ = Math.min(this.config.resolution.y - 1, Math.ceil(gridPos.y + radiusCells));
    const minK = Math.max(0, Math.floor(gridPos.z - radiusCells));
    const maxK = Math.min(this.config.resolution.z - 1, Math.ceil(gridPos.z + radiusCells));

    for (let k = minK; k <= maxK; k++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const cellCenter = new Vector3(i + 0.5, j + 0.5, k + 0.5);
          const distance = cellCenter.sub(gridPos).length();

          if (distance < radiusCells) {
            this.grid.setObstacle(i, j, k, true);
          }
        }
      }
    }
  }

  /**
   * Gets the smoke grid.
   */
  public getGrid(): SmokeGrid {
    return this.grid;
  }

  /**
   * Gets the renderer.
   */
  public getRenderer(): SmokeRenderer {
    return this.renderer;
  }

  /**
   * Gets the buoyancy forces calculator.
   */
  public getBuoyancy(): BuoyancyForces {
    return this.buoyancy;
  }

  /**
   * Clears the simulation.
   */
  public clear(): void {
    this.grid.clear();
    this.temperatureField.fill(this.buoyancy.getConfig().ambientTemperature);
    this.vorticityFieldX.fill(0);
    this.vorticityFieldY.fill(0);
    this.vorticityFieldZ.fill(0);
  }

  /**
   * Gets the simulation configuration.
   */
  public getConfig(): Readonly<SmokeSimulationConfig> {
    return this.config;
  }
}

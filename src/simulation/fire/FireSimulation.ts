/**
 * Complete fire and combustion simulation system.
 * Combines temperature advection-diffusion, buoyancy forces, turbulence,
 * fuel consumption, and particle emission for realistic fire effects.
 * Optimized for 64³ grids at 60 FPS.
 * @module FireSimulation
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { TemperatureField } from './TemperatureField';
import { TurbulenceSimulation } from './TurbulenceSimulation';
import { FireParticleSystem, FireParticleConfig } from './FireParticleSystem';

const logger = Logger.get('FireSimulation');

/**
 * Fuel cell data for combustion model.
 */
interface FuelCell {
  amount: number;
  consumptionRate: number;
}

/**
 * Configuration for fire simulation.
 */
export interface FireSimulationConfig {
  resolution: Vector3;
  bounds: Vector3;
  ambientTemperature: number;
  combustionTemperature: number;
  ignitionTemperature: number;
  fuelConsumptionRate: number;
  buoyancyStrength: number;
  turbulenceStrength: number;
  turbulenceSpeed: number;
  smokeGenerationRate: number;
  coolingRate: number;
  diffusionRate: number;
}

/**
 * Complete fire simulation with combustion, buoyancy, and turbulence.
 */
export class FireSimulation {
  private readonly config: FireSimulationConfig;
  private readonly temperatureField: TemperatureField;
  private readonly turbulence: TurbulenceSimulation;
  private readonly particleSystem: FireParticleSystem;

  private readonly velocityFieldX: Float32Array;
  private readonly velocityFieldY: Float32Array;
  private readonly velocityFieldZ: Float32Array;

  private readonly fuelGrid: FuelCell[];
  private readonly smokeDensity: Float32Array;

  private readonly cellSize: number;

  /**
   * Creates a new fire simulation.
   * @param config - Simulation configuration
   * @param particleConfig - Particle system configuration
   */
  constructor(
    config: Partial<FireSimulationConfig> = {},
    particleConfig?: Partial<FireParticleConfig>
  ) {
    this.config = {
      resolution: config.resolution ?? new Vector3(64, 64, 64),
      bounds: config.bounds ?? new Vector3(10, 10, 10),
      ambientTemperature: config.ambientTemperature ?? 293,
      combustionTemperature: config.combustionTemperature ?? 1200,
      ignitionTemperature: config.ignitionTemperature ?? 500,
      fuelConsumptionRate: config.fuelConsumptionRate ?? 0.5,
      buoyancyStrength: config.buoyancyStrength ?? 2.0,
      turbulenceStrength: config.turbulenceStrength ?? 1.5,
      turbulenceSpeed: config.turbulenceSpeed ?? 0.5,
      smokeGenerationRate: config.smokeGenerationRate ?? 0.8,
      coolingRate: config.coolingRate ?? 0.1,
      diffusionRate: config.diffusionRate ?? 2.2e-5,
    };

    this.cellSize = Math.min(
      this.config.bounds.x / this.config.resolution.x,
      this.config.bounds.y / this.config.resolution.y,
      this.config.bounds.z / this.config.resolution.z
    );

    this.temperatureField = new TemperatureField(
      this.config.resolution,
      this.config.bounds,
      this.config.ambientTemperature,
      this.config.diffusionRate
    );

    this.turbulence = new TurbulenceSimulation(12345, 4, 2.0, 0.5, 0.5);

    this.particleSystem = new FireParticleSystem(particleConfig);

    const gridSize = this.config.resolution.x *
                     this.config.resolution.y *
                     this.config.resolution.z;

    this.velocityFieldX = new Float32Array(gridSize);
    this.velocityFieldY = new Float32Array(gridSize);
    this.velocityFieldZ = new Float32Array(gridSize);

    this.fuelGrid = new Array(gridSize);
    for (let i = 0; i < gridSize; i++) {
      this.fuelGrid[i] = { amount: 0, consumptionRate: this.config.fuelConsumptionRate };
    }

    this.smokeDensity = new Float32Array(gridSize);

    logger.info(
      `Fire simulation initialized: ${this.config.resolution.x}x${this.config.resolution.y}x${this.config.resolution.z}, ` +
      `cell size: ${this.cellSize.toFixed(3)}m`
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
   * Gets velocity at grid cell.
   */
  private getVelocity(i: number, j: number, k: number): Vector3 {
    if (i < 0 || i >= this.config.resolution.x ||
        j < 0 || j >= this.config.resolution.y ||
        k < 0 || k >= this.config.resolution.z) {
      return Vector3.zero();
    }

    const idx = this.getIndex(i, j, k);
    return new Vector3(
      this.velocityFieldX[idx],
      this.velocityFieldY[idx],
      this.velocityFieldZ[idx]
    );
  }

  /**
   * Sets velocity at grid cell.
   */
  private setVelocity(i: number, j: number, k: number, velocity: Vector3): void {
    if (i >= 0 && i < this.config.resolution.x &&
        j >= 0 && j < this.config.resolution.y &&
        k >= 0 && k < this.config.resolution.z) {
      const idx = this.getIndex(i, j, k);
      this.velocityFieldX[idx] = velocity.x;
      this.velocityFieldY[idx] = velocity.y;
      this.velocityFieldZ[idx] = velocity.z;
    }
  }

  /**
   * Adds fuel to the simulation.
   * @param position - World position
   * @param radius - Fuel region radius
   * @param amount - Fuel amount (0-1)
   */
  public addFuel(position: Vector3, radius: number, amount: number): void {
    const gridPos = new Vector3(
      (position.x / this.config.bounds.x) * this.config.resolution.x,
      (position.y / this.config.bounds.y) * this.config.resolution.y,
      (position.z / this.config.bounds.z) * this.config.resolution.z
    );

    const radiusCells = Math.ceil(radius / this.cellSize);

    const minI = Math.max(0, Math.floor(gridPos.x - radiusCells));
    const maxI = Math.min(this.config.resolution.x - 1, Math.ceil(gridPos.x + radiusCells));
    const minJ = Math.max(0, Math.floor(gridPos.y - radiusCells));
    const maxJ = Math.min(this.config.resolution.y - 1, Math.ceil(gridPos.y + radiusCells));
    const minK = Math.max(0, Math.floor(gridPos.z - radiusCells));
    const maxK = Math.min(this.config.resolution.z - 1, Math.ceil(gridPos.z + radiusCells));

    for (let k = minK; k <= maxK; k++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const cellCenter = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const distance = cellCenter.sub(position).length();

          if (distance < radius) {
            const falloff = 1.0 - distance / radius;
            const idx = this.getIndex(i, j, k);
            this.fuelGrid[idx]!.amount = Math.min(1, this.fuelGrid[idx]!.amount + amount * falloff);
          }
        }
      }
    }
  }

  /**
   * Ignites fuel at position.
   * @param position - World position
   * @param radius - Ignition radius
   */
  public ignite(position: Vector3, radius: number): void {
    this.temperatureField.addHeatSource(position, radius, this.config.ignitionTemperature);
  }

  /**
   * Updates the fire simulation.
   * @param dt - Time step in seconds
   */
  public update(dt: number): void {
    this.updateCombustion(dt);

    this.updateBuoyancy(dt);

    this.turbulence.update(dt, this.config.turbulenceSpeed);
    this.turbulence.applyTurbulence(
      {
        getVelocity: this.getVelocity.bind(this),
        setVelocity: this.setVelocity.bind(this),
      },
      this.config.resolution,
      this.cellSize,
      this.config.turbulenceStrength * dt
    );

    this.temperatureField.advect(this.getVelocity.bind(this), dt);

    this.temperatureField.diffuse(dt);

    this.advectSmoke(dt);

    this.temperatureField.cool(dt, this.config.coolingRate);

    this.particleSystem.emitFromGrid(
      (i, j, k) => this.temperatureField.getTemperature(i, j, k),
      this.getVelocity.bind(this),
      this.config.resolution,
      this.cellSize,
      dt
    );

    this.particleSystem.update(dt, new Vector3(0, -9.81, 0), (pos) => {
      const gridPos = new Vector3(
        Math.floor((pos.x / this.config.bounds.x) * this.config.resolution.x),
        Math.floor((pos.y / this.config.bounds.y) * this.config.resolution.y),
        Math.floor((pos.z / this.config.bounds.z) * this.config.resolution.z)
      );
      return this.getVelocity(gridPos.x, gridPos.y, gridPos.z);
    });
  }

  /**
   * Updates combustion model (fuel consumption and heat release).
   */
  private updateCombustion(dt: number): void {
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const idx = this.getIndex(i, j, k);
          const fuel = this.fuelGrid[idx]!;

          if (fuel.amount > 0) {
            const temperature = this.temperatureField.getTemperature(i, j, k);

            if (temperature >= this.config.ignitionTemperature) {
              const burnRate = fuel.consumptionRate * dt * (fuel.amount);
              const consumed = Math.min(fuel.amount, burnRate);

              fuel.amount -= consumed;

              const heatRelease = consumed * this.config.combustionTemperature;
              this.temperatureField.setTemperature(
                i,
                j,
                k,
                temperature + heatRelease
              );

              const smokeGenerated = consumed * this.config.smokeGenerationRate;
              this.smokeDensity[idx] = Math.min(1, this.smokeDensity[idx]! + smokeGenerated);
            }
          }
        }
      }
    }
  }

  /**
   * Updates buoyancy forces based on temperature.
   */
  private updateBuoyancy(dt: number): void {
    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const temperature = this.temperatureField.getTemperature(i, j, k);
          const tempDiff = temperature - this.config.ambientTemperature;

          if (tempDiff > 0) {
            const buoyancy = this.config.buoyancyStrength * (tempDiff / this.config.ambientTemperature);

            const currentVelocity = this.getVelocity(i, j, k);
            const newVelocity = currentVelocity.add(new Vector3(0, buoyancy * dt, 0));

            this.setVelocity(i, j, k, newVelocity);
          }
        }
      }
    }
  }

  /**
   * Advects smoke density using semi-Lagrangian method.
   */
  private advectSmoke(dt: number): void {
    const tempSmoke = new Float32Array(this.smokeDensity.length);

    const rx = this.config.resolution.x;
    const ry = this.config.resolution.y;
    const rz = this.config.resolution.z;

    for (let k = 0; k < rz; k++) {
      for (let j = 0; j < ry; j++) {
        for (let i = 0; i < rx; i++) {
          const velocity = this.getVelocity(i, j, k);

          const worldPos = new Vector3(
            (i + 0.5) * this.cellSize,
            (j + 0.5) * this.cellSize,
            (k + 0.5) * this.cellSize
          );

          const prevPos = worldPos.sub(velocity.scale(dt));

          const gridPos = new Vector3(
            (prevPos.x / this.config.bounds.x) * rx,
            (prevPos.y / this.config.bounds.y) * ry,
            (prevPos.z / this.config.bounds.z) * rz
          );

          const smoke = this.sampleSmoke(gridPos);
          tempSmoke[this.getIndex(i, j, k)] = smoke * 0.99;
        }
      }
    }

    this.smokeDensity.set(tempSmoke);
  }

  /**
   * Samples smoke density at grid position using trilinear interpolation.
   */
  private sampleSmoke(gridPos: Vector3): number {
    const i = Math.floor(gridPos.x);
    const j = Math.floor(gridPos.y);
    const k = Math.floor(gridPos.z);

    if (i < 0 || i >= this.config.resolution.x - 1 ||
        j < 0 || j >= this.config.resolution.y - 1 ||
        k < 0 || k >= this.config.resolution.z - 1) {
      return 0;
    }

    const fx = gridPos.x - i;
    const fy = gridPos.y - j;
    const fz = gridPos.z - k;

    const c000 = this.smokeDensity[this.getIndex(i, j, k)]!;
    const c100 = this.smokeDensity[this.getIndex(i + 1, j, k)]!;
    const c010 = this.smokeDensity[this.getIndex(i, j + 1, k)]!;
    const c110 = this.smokeDensity[this.getIndex(i + 1, j + 1, k)]!;
    const c001 = this.smokeDensity[this.getIndex(i, j, k + 1)]!;
    const c101 = this.smokeDensity[this.getIndex(i + 1, j, k + 1)]!;
    const c011 = this.smokeDensity[this.getIndex(i, j + 1, k + 1)]!;
    const c111 = this.smokeDensity[this.getIndex(i + 1, j + 1, k + 1)]!;

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Gets the temperature field.
   */
  public getTemperatureField(): TemperatureField {
    return this.temperatureField;
  }

  /**
   * Gets the particle system.
   */
  public getParticleSystem(): FireParticleSystem {
    return this.particleSystem;
  }

  /**
   * Gets smoke density at grid cell.
   */
  public getSmokeDensity(i: number, j: number, k: number): number {
    if (i < 0 || i >= this.config.resolution.x ||
        j < 0 || j >= this.config.resolution.y ||
        k < 0 || k >= this.config.resolution.z) {
      return 0;
    }
    return this.smokeDensity[this.getIndex(i, j, k)];
  }

  /**
   * Gets the smoke density grid.
   */
  public getSmokeDensityGrid(): Float32Array {
    return this.smokeDensity;
  }

  /**
   * Clears the simulation.
   */
  public clear(): void {
    this.temperatureField.clear();
    this.velocityFieldX.fill(0);
    this.velocityFieldY.fill(0);
    this.velocityFieldZ.fill(0);
    this.smokeDensity.fill(0);
    this.fuelGrid.forEach(cell => { cell.amount = 0; });
    this.particleSystem.clear();
    this.turbulence.reset();
  }

  /**
   * Gets the simulation configuration.
   */
  public getConfig(): Readonly<FireSimulationConfig> {
    return this.config;
  }
}

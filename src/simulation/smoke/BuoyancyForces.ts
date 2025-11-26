/**
 * Buoyancy force calculations for smoke simulation.
 * Handles temperature-driven and density-driven buoyancy.
 * @module BuoyancyForces
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.get('BuoyancyForces');

/**
 * Configuration for buoyancy forces.
 */
export interface BuoyancyConfig {
  ambientTemperature: number;
  ambientDensity: number;
  thermalExpansionCoeff: number;
  smokeDensityFactor: number;
  gravity: Vector3;
}

/**
 * Buoyancy force calculator for smoke and gas simulation.
 */
export class BuoyancyForces {
  private readonly config: BuoyancyConfig;

  /**
   * Creates a new buoyancy force calculator.
   * @param config - Buoyancy configuration
   */
  constructor(config: Partial<BuoyancyConfig> = {}) {
    this.config = {
      ambientTemperature: config.ambientTemperature ?? 293,
      ambientDensity: config.ambientDensity ?? 1.225,
      thermalExpansionCoeff: config.thermalExpansionCoeff ?? 0.00343,
      smokeDensityFactor: config.smokeDensityFactor ?? 0.5,
      gravity: config.gravity ?? new Vector3(0, -9.81, 0),
    };

    logger.info('Buoyancy forces initialized');
  }

  /**
   * Calculates buoyancy force from temperature difference.
   * Uses the Boussinesq approximation: F = -α * (T - T₀) * g
   * @param temperature - Current temperature in Kelvin
   * @returns Buoyancy force vector
   */
  public calculateThermalBuoyancy(temperature: number): Vector3 {
    const tempDiff = temperature - this.config.ambientTemperature;

    if (Math.abs(tempDiff) < 0.1) {
      return Vector3.zero();
    }

    const alpha = this.config.thermalExpansionCoeff;
    const buoyancyMagnitude = -alpha * tempDiff;

    return this.config.gravity.scale(buoyancyMagnitude);
  }

  /**
   * Calculates buoyancy force from density difference.
   * F = (ρ - ρ₀) * g
   * @param density - Current density
   * @returns Buoyancy force vector
   */
  public calculateDensityBuoyancy(density: number): Vector3 {
    const densityDiff = density - this.config.ambientDensity;

    if (Math.abs(densityDiff) < 0.001) {
      return Vector3.zero();
    }

    return this.config.gravity.scale(densityDiff);
  }

  /**
   * Calculates combined buoyancy from smoke density and temperature.
   * @param smokeDensity - Smoke density (0-1)
   * @param temperature - Temperature in Kelvin
   * @returns Combined buoyancy force
   */
  public calculateSmokeBuoyancy(smokeDensity: number, temperature: number): Vector3 {
    const thermalBuoyancy = this.calculateThermalBuoyancy(temperature);

    const smokeWeight = this.config.gravity.scale(smokeDensity * this.config.smokeDensityFactor);

    return thermalBuoyancy.sub(smokeWeight);
  }

  /**
   * Applies buoyancy forces to a velocity field.
   * @param velocityField - Velocity field to modify
   * @param getVelocity - Function to get velocity at (i, j, k)
   * @param setVelocity - Function to set velocity at (i, j, k)
   * @param getTemperature - Function to get temperature at (i, j, k)
   * @param getDensity - Function to get smoke density at (i, j, k)
   * @param resolution - Grid resolution
   * @param dt - Time step in seconds
   */
  public applyBuoyancy(
    velocityField: {
      getVelocity: (i: number, j: number, k: number) => Vector3;
      setVelocity: (i: number, j: number, k: number, v: Vector3) => void;
    },
    getTemperature: (i: number, j: number, k: number) => number,
    getDensity: (i: number, j: number, k: number) => number,
    resolution: Vector3,
    dt: number
  ): void {
    for (let k = 0; k < resolution.z; k++) {
      for (let j = 0; j < resolution.y; j++) {
        for (let i = 0; i < resolution.x; i++) {
          const temperature = getTemperature(i, j, k);
          const smokeDensity = getDensity(i, j, k);

          const buoyancy = this.calculateSmokeBuoyancy(smokeDensity, temperature);

          if (buoyancy.lengthSquared() > 1e-6) {
            const currentVelocity = velocityField.getVelocity(i, j, k);
            const newVelocity = currentVelocity.add(buoyancy.scale(dt));
            velocityField.setVelocity(i, j, k, newVelocity);
          }
        }
      }
    }
  }

  /**
   * Applies temperature-only buoyancy to velocity field.
   * @param velocityField - Velocity field to modify
   * @param getVelocity - Function to get velocity at (i, j, k)
   * @param setVelocity - Function to set velocity at (i, j, k)
   * @param getTemperature - Function to get temperature at (i, j, k)
   * @param resolution - Grid resolution
   * @param dt - Time step in seconds
   */
  public applyThermalBuoyancy(
    velocityField: {
      getVelocity: (i: number, j: number, k: number) => Vector3;
      setVelocity: (i: number, j: number, k: number, v: Vector3) => void;
    },
    getTemperature: (i: number, j: number, k: number) => number,
    resolution: Vector3,
    dt: number
  ): void {
    for (let k = 0; k < resolution.z; k++) {
      for (let j = 0; j < resolution.y; j++) {
        for (let i = 0; i < resolution.x; i++) {
          const temperature = getTemperature(i, j, k);
          const buoyancy = this.calculateThermalBuoyancy(temperature);

          if (buoyancy.lengthSquared() > 1e-6) {
            const currentVelocity = velocityField.getVelocity(i, j, k);
            const newVelocity = currentVelocity.add(buoyancy.scale(dt));
            velocityField.setVelocity(i, j, k, newVelocity);
          }
        }
      }
    }
  }

  /**
   * Applies density-only buoyancy to velocity field.
   * @param velocityField - Velocity field to modify
   * @param getVelocity - Function to get velocity at (i, j, k)
   * @param setVelocity - Function to set velocity at (i, j, k)
   * @param getDensity - Function to get density at (i, j, k)
   * @param resolution - Grid resolution
   * @param dt - Time step in seconds
   */
  public applyDensityBuoyancy(
    velocityField: {
      getVelocity: (i: number, j: number, k: number) => Vector3;
      setVelocity: (i: number, j: number, k: number, v: Vector3) => void;
    },
    getDensity: (i: number, j: number, k: number) => number,
    resolution: Vector3,
    dt: number
  ): void {
    for (let k = 0; k < resolution.z; k++) {
      for (let j = 0; j < resolution.y; j++) {
        for (let i = 0; i < resolution.x; i++) {
          const density = getDensity(i, j, k);

          if (density > 0.001) {
            const buoyancy = this.calculateDensityBuoyancy(density);

            if (buoyancy.lengthSquared() > 1e-6) {
              const currentVelocity = velocityField.getVelocity(i, j, k);
              const newVelocity = currentVelocity.add(buoyancy.scale(dt));
              velocityField.setVelocity(i, j, k, newVelocity);
            }
          }
        }
      }
    }
  }

  /**
   * Gets the configuration.
   */
  public getConfig(): Readonly<BuoyancyConfig> {
    return this.config;
  }

  /**
   * Updates gravity vector.
   */
  public setGravity(gravity: Vector3): void {
    (this.config as { gravity: Vector3 }).gravity = gravity.clone();
  }

  /**
   * Updates ambient temperature.
   */
  public setAmbientTemperature(temperature: number): void {
    (this.config as { ambientTemperature: number }).ambientTemperature = temperature;
  }
}

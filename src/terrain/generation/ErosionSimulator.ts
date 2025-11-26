/**
 * Hydraulic and thermal erosion simulation for realistic terrain weathering.
 * Simulates water flow, sediment transport, and thermal weathering.
 * @module ErosionSimulator
 */

import { Heightmap } from '../Heightmap';
import { Logger } from '../../core/Logger';

const logger = Logger.create('ErosionSimulator');

/**
 * Erosion type enumeration.
 */
export enum ErosionType {
  /** Hydraulic erosion (water-based) */
  Hydraulic = 'Hydraulic',
  /** Thermal erosion (temperature-based weathering) */
  Thermal = 'Thermal',
  /** Combined hydraulic and thermal */
  Combined = 'Combined',
}

/**
 * Hydraulic erosion configuration.
 */
export interface HydraulicErosionConfig {
  /** Number of droplet iterations */
  iterations: number;
  /** Erosion rate */
  erosionRate: number;
  /** Deposition rate */
  depositionRate: number;
  /** Evaporation rate */
  evaporationRate: number;
  /** Sediment capacity */
  sedimentCapacity: number;
  /** Minimum slope for erosion */
  minSlope: number;
  /** Gravity strength */
  gravity: number;
  /** Inertia (droplet momentum) */
  inertia: number;
  /** Initial water volume */
  initialWaterVolume: number;
  /** Initial droplet speed */
  initialSpeed: number;
}

/**
 * Thermal erosion configuration.
 */
export interface ThermalErosionConfig {
  /** Number of iterations */
  iterations: number;
  /** Talus angle (angle of repose) in degrees */
  talusAngle: number;
  /** Material transfer rate */
  transferRate: number;
}

/**
 * Erosion simulator for realistic terrain weathering.
 * Implements hydraulic (water) and thermal (temperature) erosion.
 *
 * @example
 * ```typescript
 * const simulator = new ErosionSimulator();
 *
 * // Apply hydraulic erosion
 * simulator.applyHydraulicErosion(heightmap, {
 *   iterations: 100000,
 *   erosionRate: 0.3,
 *   depositionRate: 0.3,
 *   evaporationRate: 0.01,
 *   sedimentCapacity: 4.0
 * });
 *
 * // Apply thermal erosion
 * simulator.applyThermalErosion(heightmap, {
 *   iterations: 100,
 *   talusAngle: 35,
 *   transferRate: 0.5
 * });
 * ```
 */
export class ErosionSimulator {
  private _random: number;

  /**
   * Creates a new erosion simulator.
   *
   * @param seed - Random seed
   */
  constructor(seed: number = 0) {
    this._random = seed;
  }

  /**
   * Applies hydraulic erosion to a heightmap.
   * Simulates water droplets flowing downhill, eroding and depositing sediment.
   *
   * @param heightmap - Heightmap to erode
   * @param config - Erosion configuration
   */
  applyHydraulicErosion(
    heightmap: Heightmap,
    config: Partial<HydraulicErosionConfig> = {}
  ): void {
    const cfg: HydraulicErosionConfig = {
      iterations: config.iterations ?? 100000,
      erosionRate: config.erosionRate ?? 0.3,
      depositionRate: config.depositionRate ?? 0.3,
      evaporationRate: config.evaporationRate ?? 0.01,
      sedimentCapacity: config.sedimentCapacity ?? 4.0,
      minSlope: config.minSlope ?? 0.01,
      gravity: config.gravity ?? 4.0,
      inertia: config.inertia ?? 0.05,
      initialWaterVolume: config.initialWaterVolume ?? 1.0,
      initialSpeed: config.initialSpeed ?? 1.0,
    };

    logger.info(`Applying hydraulic erosion (${cfg.iterations} iterations)...`);

    const width = heightmap.width;
    const height = heightmap.height;
    const brushRadius = 3;
    const brushIndices: number[] = [];
    const brushWeights: number[] = [];

    // Precompute brush indices and weights
    this._precomputeBrush(brushRadius, brushIndices, brushWeights);

    // Simulate droplets
    for (let iteration = 0; iteration < cfg.iterations; iteration++) {
      // Random starting position
      let posX = this._randomFloat() * (width - 1);
      let posY = this._randomFloat() * (height - 1);

      let dirX = 0;
      let dirY = 0;
      let speed = cfg.initialSpeed;
      let water = cfg.initialWaterVolume;
      let sediment = 0;

      // Simulate droplet path
      for (let lifetime = 0; lifetime < 64; lifetime++) {
        const nodeX = Math.floor(posX);
        const nodeY = Math.floor(posY);

        // Check bounds
        if (nodeX < 0 || nodeX >= width - 1 || nodeY < 0 || nodeY >= height - 1) {
          break;
        }

        // Calculate droplet's offset inside the cell
        const cellOffsetX = posX - nodeX;
        const cellOffsetY = posY - nodeY;

        // Sample height and gradient
        const heightNW = heightmap.getSample(nodeX, nodeY);
        const heightNE = heightmap.getSample(nodeX + 1, nodeY);
        const heightSW = heightmap.getSample(nodeX, nodeY + 1);
        const heightSE = heightmap.getSample(nodeX + 1, nodeY + 1);

        // Bilinear interpolation
        const currentHeight =
          heightNW * (1 - cellOffsetX) * (1 - cellOffsetY) +
          heightNE * cellOffsetX * (1 - cellOffsetY) +
          heightSW * (1 - cellOffsetX) * cellOffsetY +
          heightSE * cellOffsetX * cellOffsetY;

        // Calculate gradient
        const gradientX = (heightNE - heightNW) * (1 - cellOffsetY) + (heightSE - heightSW) * cellOffsetY;
        const gradientY = (heightSW - heightNW) * (1 - cellOffsetX) + (heightSE - heightNE) * cellOffsetX;

        // Update direction and speed
        dirX = dirX * cfg.inertia - gradientX * (1 - cfg.inertia);
        dirY = dirY * cfg.inertia - gradientY * (1 - cfg.inertia);

        // Normalize direction
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len !== 0) {
          dirX /= len;
          dirY /= len;
        }

        // Update position
        posX += dirX;
        posY += dirY;

        // Check if out of bounds
        if (posX < 0 || posX >= width - 1 || posY < 0 || posY >= height - 1) {
          break;
        }

        // Sample new height
        const newNodeX = Math.floor(posX);
        const newNodeY = Math.floor(posY);
        const newOffsetX = posX - newNodeX;
        const newOffsetY = posY - newNodeY;

        const newHeightNW = heightmap.getSample(newNodeX, newNodeY);
        const newHeightNE = heightmap.getSample(newNodeX + 1, newNodeY);
        const newHeightSW = heightmap.getSample(newNodeX, newNodeY + 1);
        const newHeightSE = heightmap.getSample(newNodeX + 1, newNodeY + 1);

        const newHeight =
          newHeightNW * (1 - newOffsetX) * (1 - newOffsetY) +
          newHeightNE * newOffsetX * (1 - newOffsetY) +
          newHeightSW * (1 - newOffsetX) * newOffsetY +
          newHeightSE * newOffsetX * newOffsetY;

        // Calculate height difference
        const deltaHeight = newHeight - currentHeight;

        // Calculate sediment capacity
        const slope = Math.max(cfg.minSlope, -deltaHeight);
        const capacity = Math.max(-deltaHeight, cfg.minSlope) * speed * water * cfg.sedimentCapacity;

        // Erode or deposit sediment
        if (sediment > capacity || deltaHeight > 0) {
          // Deposit
          const amountToDeposit = deltaHeight > 0
            ? Math.min(deltaHeight, sediment)
            : (sediment - capacity) * cfg.depositionRate;

          sediment -= amountToDeposit;

          // Deposit using brush
          this._depositBrush(heightmap, nodeX, nodeY, amountToDeposit, brushIndices, brushWeights);
        } else {
          // Erode
          const amountToErode = Math.min((capacity - sediment) * cfg.erosionRate, -deltaHeight);

          // Erode using brush
          this._erodeBrush(heightmap, nodeX, nodeY, amountToErode, brushIndices, brushWeights);

          sediment += amountToErode;
        }

        // Update speed and water
        speed = Math.sqrt(speed * speed + deltaHeight * cfg.gravity);
        water *= (1 - cfg.evaporationRate);
      }
    }

    logger.info('Hydraulic erosion complete');
  }

  /**
   * Applies thermal erosion to a heightmap.
   * Simulates material sliding down steep slopes.
   *
   * @param heightmap - Heightmap to erode
   * @param config - Erosion configuration
   */
  applyThermalErosion(
    heightmap: Heightmap,
    config: Partial<ThermalErosionConfig> = {}
  ): void {
    const cfg: ThermalErosionConfig = {
      iterations: config.iterations ?? 100,
      talusAngle: config.talusAngle ?? 35,
      transferRate: config.transferRate ?? 0.5,
    };

    logger.info(`Applying thermal erosion (${cfg.iterations} iterations)...`);

    const width = heightmap.width;
    const height = heightmap.height;
    const maxHeightDiff = Math.tan((cfg.talusAngle * Math.PI) / 180);

    for (let iteration = 0; iteration < cfg.iterations; iteration++) {
      const changes = new Float32Array(width * height);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const currentHeight = heightmap.getSample(x, y);
          let totalDiff = 0;
          let validNeighbors = 0;

          // Check all 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const neighborHeight = heightmap.getSample(x + dx, y + dy);
              const heightDiff = currentHeight - neighborHeight;

              if (heightDiff > maxHeightDiff) {
                const distance = Math.sqrt(dx * dx + dy * dy);
                const adjustedDiff = heightDiff / distance;

                if (adjustedDiff > maxHeightDiff) {
                  totalDiff += heightDiff - maxHeightDiff * distance;
                  validNeighbors++;
                }
              }
            }
          }

          if (validNeighbors > 0) {
            const index = y * width + x;
            changes[index] = -(totalDiff / validNeighbors) * cfg.transferRate;
          }
        }
      }

      // Apply changes
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          if (changes[index]! !== 0) {
            const currentHeight = heightmap.getSample(x, y);
            heightmap.setSample(x, y, currentHeight + changes[index]!);
          }
        }
      }
    }

    logger.info('Thermal erosion complete');
  }

  /**
   * Precomputes brush indices and weights for erosion/deposition.
   * @private
   */
  private _precomputeBrush(radius: number, indices: number[], weights: number[]): void {
    indices.length = 0;
    weights.length = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          indices.push(dx, dy);
          const weight = 1 - dist / radius;
          weights.push(weight);
        }
      }
    }

    // Normalize weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < weights.length; i++) {
      weights[i]! /= totalWeight;
    }
  }

  /**
   * Erodes terrain using a brush.
   * @private
   */
  private _erodeBrush(
    heightmap: Heightmap,
    centerX: number,
    centerY: number,
    amount: number,
    indices: number[],
    weights: number[]
  ): void {
    for (let i = 0; i < indices.length / 2; i++) {
      const dx = indices[i * 2]!;
      const dy = indices[i * 2 + 1]!;
      const x = centerX + dx;
      const y = centerY + dy;

      if (x >= 0 && x < heightmap.width && y >= 0 && y < heightmap.height) {
        const currentHeight = heightmap.getSample(x, y);
        const erosionAmount = amount * weights[i]!;
        heightmap.setSample(x, y, currentHeight - erosionAmount);
      }
    }
  }

  /**
   * Deposits sediment using a brush.
   * @private
   */
  private _depositBrush(
    heightmap: Heightmap,
    centerX: number,
    centerY: number,
    amount: number,
    indices: number[],
    weights: number[]
  ): void {
    for (let i = 0; i < indices.length / 2; i++) {
      const dx = indices[i * 2]!;
      const dy = indices[i * 2 + 1]!;
      const x = centerX + dx;
      const y = centerY + dy;

      if (x >= 0 && x < heightmap.width && y >= 0 && y < heightmap.height) {
        const currentHeight = heightmap.getSample(x, y);
        const depositionAmount = amount * weights[i]!;
        heightmap.setSample(x, y, currentHeight + depositionAmount);
      }
    }
  }

  /**
   * Generates a random float between 0 and 1.
   * @private
   */
  private _randomFloat(): number {
    this._random = (this._random * 9301 + 49297) % 233280;
    return this._random / 233280;
  }

  /**
   * Sets the random seed.
   *
   * @param seed - New random seed
   */
  setSeed(seed: number): void {
    this._random = seed;
  }

  /**
   * Creates an erosion simulator with preset configuration.
   *
   * @param preset - Preset name
   * @returns Erosion simulator
   */
  static createPreset(preset: 'light' | 'medium' | 'heavy'): ErosionSimulator {
    return new ErosionSimulator(Math.random() * 10000);
  }
}

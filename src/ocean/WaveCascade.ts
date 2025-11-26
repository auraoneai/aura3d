import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';
import { OceanFFT, PhillipsParams } from './OceanFFT';

/**
 * Wave cascade level
 */
export interface CascadeLevel {
  fft: OceanFFT;
  resolution: number;
  size: number;
  weight: number;
}

/**
 * WaveCascade - Multiple detail levels for ocean waves
 *
 * Combines multiple FFT simulations at different scales to create
 * detailed ocean surfaces with both large and small waves.
 *
 * Features:
 * - Multiple cascade levels (typically 3-4)
 * - Different resolutions and physical sizes per level
 * - Weighted blending
 * - LOD support
 * - Performance optimization
 *
 * Cascade setup example:
 * - Level 0: 256x256, 2000m (large waves)
 * - Level 1: 256x256, 500m (medium waves)
 * - Level 2: 256x256, 125m (small waves)
 * - Level 3: 128x128, 30m (ripples)
 *
 * @example
 * ```typescript
 * const cascade = new WaveCascade();
 * cascade.addLevel(256, 2000, 1.0);
 * cascade.addLevel(256, 500, 0.5);
 * cascade.addLevel(256, 125, 0.25);
 * cascade.update(deltaTime);
 * ```
 */
export class WaveCascade {
  private levels: CascadeLevel[];
  private logger: Logger;
  private globalParams: PhillipsParams;

  constructor() {
    this.levels = [];
    this.logger = Logger.getInstance();

    // Default global parameters
    this.globalParams = {
      windSpeed: 30,
      windDirection: new Vector3(1, 0, 0).normalize(),
      gravity: 9.81,
      amplitude: 1.0,
      suppressionFactor: 0.001
    };
  }

  /**
   * Sets global parameters for all levels
   */
  public setGlobalParams(params: Partial<PhillipsParams>): void {
    this.globalParams = { ...this.globalParams, ...params };

    // Update all levels
    for (const level of this.levels) {
      level.fft.setParams(this.globalParams);
    }
  }

  /**
   * Adds a cascade level
   */
  public addLevel(resolution: number, size: number, weight: number = 1.0): void {
    const fft = new OceanFFT(resolution, size);
    fft.setParams(this.globalParams);

    this.levels.push({
      fft,
      resolution,
      size,
      weight
    });

    this.logger.info(`Added wave cascade level: ${resolution}x${resolution}, ${size}m, weight ${weight}`);
  }

  /**
   * Removes all cascade levels
   */
  public clearLevels(): void {
    this.levels = [];
  }

  /**
   * Updates all cascade levels
   */
  public update(deltaTime: number): void {
    for (const level of this.levels) {
      level.fft.update(deltaTime);
    }
  }

  /**
   * Gets combined height at world position
   */
  public getHeightAt(x: number, z: number): number {
    let totalHeight = 0;
    let totalWeight = 0;

    for (const level of this.levels) {
      const height = this.sampleHeight(level, x, z);
      totalHeight += height * level.weight;
      totalWeight += level.weight;
    }

    return totalWeight > 0 ? totalHeight / totalWeight : 0;
  }

  /**
   * Gets combined displacement at world position
   */
  public getDisplacementAt(x: number, z: number): Vector3 {
    let totalDisp = new Vector3(0, 0, 0);
    let totalWeight = 0;

    for (const level of this.levels) {
      const disp = this.sampleDisplacement(level, x, z);
      totalDisp.add(disp.multiplyScalar(level.weight));
      totalWeight += level.weight;
    }

    return totalWeight > 0 ? totalDisp.scale(1 / totalWeight) : totalDisp;
  }

  /**
   * Gets combined normal at world position
   */
  public getNormalAt(x: number, z: number): Vector3 {
    let totalNormal = new Vector3(0, 0, 0);
    let totalWeight = 0;

    for (const level of this.levels) {
      const normal = this.sampleNormal(level, x, z);
      totalNormal.add(normal.multiplyScalar(level.weight));
      totalWeight += level.weight;
    }

    return totalWeight > 0 ? totalNormal.scale(1 / totalWeight).normalize() : new Vector3(0, 1, 0);
  }

  /**
   * Gets combined Jacobian at world position (for foam)
   */
  public getJacobianAt(x: number, z: number): number {
    let totalJacobian = 0;
    let totalWeight = 0;

    for (const level of this.levels) {
      const jacobian = this.sampleJacobian(level, x, z);
      totalJacobian += jacobian * level.weight;
      totalWeight += level.weight;
    }

    return totalWeight > 0 ? totalJacobian / totalWeight : 1.0;
  }

  /**
   * Samples height from a cascade level
   */
  private sampleHeight(level: CascadeLevel, x: number, z: number): number {
    const heightField = level.fft.getHeightField();
    const resolution = level.resolution;
    const size = level.size;

    // Convert world position to grid coordinates
    const u = ((x % size) + size) % size;
    const v = ((z % size) + size) % size;

    const i = Math.floor((u / size) * resolution);
    const j = Math.floor((v / size) * resolution);

    const idx = i * resolution + j;
    return heightField[idx] || 0;
  }

  /**
   * Samples displacement from a cascade level
   */
  private sampleDisplacement(level: CascadeLevel, x: number, z: number): Vector3 {
    const dispX = level.fft.getDisplacementX();
    const dispZ = level.fft.getDisplacementZ();
    const resolution = level.resolution;
    const size = level.size;

    const u = ((x % size) + size) % size;
    const v = ((z % size) + size) % size;

    const i = Math.floor((u / size) * resolution);
    const j = Math.floor((v / size) * resolution);

    const idx = i * resolution + j;

    return new Vector3(
      dispX[idx] || 0,
      0,
      dispZ[idx] || 0
    );
  }

  /**
   * Samples normal from a cascade level
   */
  private sampleNormal(level: CascadeLevel, x: number, z: number): Vector3 {
    const normalField = level.fft.getNormalField();
    const resolution = level.resolution;
    const size = level.size;

    const u = ((x % size) + size) % size;
    const v = ((z % size) + size) % size;

    const i = Math.floor((u / size) * resolution);
    const j = Math.floor((v / size) * resolution);

    const idx = (i * resolution + j) * 3;

    return new Vector3(
      normalField[idx] || 0,
      normalField[idx + 1] || 1,
      normalField[idx + 2] || 0
    );
  }

  /**
   * Samples Jacobian from a cascade level
   */
  private sampleJacobian(level: CascadeLevel, x: number, z: number): number {
    const jacobian = level.fft.getJacobian();
    const resolution = level.resolution;
    const size = level.size;

    const u = ((x % size) + size) % size;
    const v = ((z % size) + size) % size;

    const i = Math.floor((u / size) * resolution);
    const j = Math.floor((v / size) * resolution);

    const idx = i * resolution + j;
    return jacobian[idx] || 1.0;
  }

  /**
   * Gets cascade level by index
   */
  public getLevel(index: number): CascadeLevel | undefined {
    return this.levels[index];
  }

  /**
   * Gets all cascade levels
   */
  public getLevels(): CascadeLevel[] {
    return this.levels;
  }

  /**
   * Gets number of cascade levels
   */
  public getLevelCount(): number {
    return this.levels.length;
  }

  /**
   * Sets level weight
   */
  public setLevelWeight(index: number, weight: number): void {
    if (index >= 0 && index < this.levels.length) {
      this.levels[index].weight = weight;
    }
  }

  /**
   * Gets recommended cascade setup for quality level
   */
  public static getRecommendedSetup(quality: 'low' | 'medium' | 'high' | 'ultra'): Array<{ resolution: number; size: number; weight: number }> {
    switch (quality) {
      case 'low':
        return [
          { resolution: 128, size: 2000, weight: 1.0 },
          { resolution: 128, size: 500, weight: 0.5 }
        ];
      case 'medium':
        return [
          { resolution: 256, size: 2000, weight: 1.0 },
          { resolution: 256, size: 500, weight: 0.7 },
          { resolution: 128, size: 125, weight: 0.4 }
        ];
      case 'high':
        return [
          { resolution: 256, size: 2000, weight: 1.0 },
          { resolution: 256, size: 500, weight: 0.8 },
          { resolution: 256, size: 125, weight: 0.5 },
          { resolution: 128, size: 30, weight: 0.3 }
        ];
      case 'ultra':
        return [
          { resolution: 512, size: 2000, weight: 1.0 },
          { resolution: 512, size: 500, weight: 0.9 },
          { resolution: 256, size: 125, weight: 0.6 },
          { resolution: 256, size: 30, weight: 0.4 }
        ];
    }
  }

  /**
   * Applies recommended cascade setup
   */
  public applyRecommendedSetup(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
    this.clearLevels();

    const setup = WaveCascade.getRecommendedSetup(quality);
    for (const level of setup) {
      this.addLevel(level.resolution, level.size, level.weight);
    }
  }
}

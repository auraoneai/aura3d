import { Logger } from '../core/Logger';

/**
 * Foam parameters
 */
export interface FoamParams {
  threshold: number;
  decay: number;
  persistence: number;
  coverage: number;
}

/**
 * FoamGenerator - Generates ocean foam using Jacobian
 *
 * Creates realistic foam patterns based on wave compression (Jacobian
 * determinant). Foam appears where waves fold and compress, and gradually
 * decays over time.
 *
 * Features:
 * - Jacobian-based foam generation
 * - Temporal persistence (foam trails)
 * - Configurable decay rate
 * - Threshold-based activation
 * - Coverage control
 *
 * @example
 * ```typescript
 * const foam = new FoamGenerator(256);
 * foam.setParams({ threshold: -0.5, decay: 0.95 });
 * foam.update(jacobianField, deltaTime);
 * const foamMap = foam.getFoamMap();
 * ```
 */
export class FoamGenerator {
  private resolution: number;
  private foamMap: Float32Array;
  private params: FoamParams;
  private logger: Logger;

  constructor(resolution: number) {
    this.resolution = resolution;
    this.foamMap = new Float32Array(resolution * resolution);
    this.logger = Logger.getInstance();

    this.params = {
      threshold: -0.3,
      decay: 0.98,
      persistence: 0.9,
      coverage: 0.5
    };
  }

  /**
   * Sets foam parameters
   */
  public setParams(params: Partial<FoamParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Gets foam parameters
   */
  public getParams(): FoamParams {
    return { ...this.params };
  }

  /**
   * Updates foam based on Jacobian field
   */
  public update(jacobianField: Float32Array, deltaTime: number): void {
    const { threshold, decay, persistence, coverage } = this.params;

    for (let i = 0; i < this.foamMap.length; i++) {
      const jacobian = jacobianField[i]!;

      // Generate foam where Jacobian is negative (wave compression/folding)
      if (jacobian < threshold) {
        const intensity = Math.abs(jacobian - threshold) / Math.abs(threshold);
        this.foamMap[i] = Math.max(this.foamMap[i]!, intensity * coverage);
      }

      // Decay existing foam
      this.foamMap[i] = this.foamMap[i]! * Math.pow(decay, deltaTime);

      // Apply persistence (prevents instant disappearance)
      if (this.foamMap[i]! < 0.01) {
        this.foamMap[i] = this.foamMap[i]! * persistence;
      }
    }
  }

  /**
   * Gets foam map
   */
  public getFoamMap(): Float32Array {
    return this.foamMap;
  }

  /**
   * Gets foam intensity at grid position
   */
  public getFoamAt(i: number, j: number): number {
    if (i < 0 || i >= this.resolution || j < 0 || j >= this.resolution) {
      return 0;
    }
    return this.foamMap[i * this.resolution + j];
  }

  /**
   * Clears all foam
   */
  public clear(): void {
    this.foamMap.fill(0);
  }

  /**
   * Gets resolution
   */
  public getResolution(): number {
    return this.resolution;
  }
}

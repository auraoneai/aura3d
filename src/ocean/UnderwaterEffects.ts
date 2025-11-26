import { Vector3 } from '../math/Vector3';
import { Logger } from '../core/Logger';

/**
 * Underwater rendering parameters
 */
export interface UnderwaterParams {
  fogColor: [number, number, number];
  fogDensity: number;
  causticsScale: number;
  causticsSpeed: number;
  causticsIntensity: number;
  distortionStrength: number;
  sunlightColor: [number, number, number];
  sunlightIntensity: number;
  absorptionColor: [number, number, number];
}

/**
 * Caustics pattern
 */
export interface CausticsData {
  pattern: Float32Array;
  resolution: number;
}

/**
 * UnderwaterEffects - Underwater rendering effects
 *
 * Provides realistic underwater rendering with:
 * - Volumetric fog
 * - Caustics (light patterns)
 * - Water distortion
 * - Color absorption
 * - God rays
 *
 * @example
 * ```typescript
 * const underwater = new UnderwaterEffects();
 * underwater.setParams({ fogDensity: 0.05 });
 * const caustics = underwater.generateCaustics(time);
 * ```
 */
export class UnderwaterEffects {
  private params: UnderwaterParams;
  private logger: Logger;
  private causticsResolution: number = 512;

  constructor() {
    this.logger = Logger.getInstance();

    this.params = {
      fogColor: [0.0, 0.3, 0.5],
      fogDensity: 0.03,
      causticsScale: 10.0,
      causticsSpeed: 0.5,
      causticsIntensity: 1.5,
      distortionStrength: 0.02,
      sunlightColor: [1.0, 0.95, 0.8],
      sunlightIntensity: 0.5,
      absorptionColor: [0.45, 0.15, 0.03]
    };
  }

  /**
   * Sets underwater parameters
   */
  public setParams(params: Partial<UnderwaterParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Gets underwater parameters
   */
  public getParams(): UnderwaterParams {
    return { ...this.params };
  }

  /**
   * Calculates fog factor based on distance
   */
  public calculateFog(distance: number): number {
    return 1.0 - Math.exp(-this.params.fogDensity * distance);
  }

  /**
   * Applies color absorption based on depth
   */
  public applyColorAbsorption(color: [number, number, number], depth: number): [number, number, number] {
    const absorption = this.params.absorptionColor;

    return [
      color[0] * Math.exp(-absorption[0] * depth),
      color[1] * Math.exp(-absorption[1] * depth),
      color[2] * Math.exp(-absorption[2] * depth)
    ];
  }

  /**
   * Generates procedural caustics pattern
   */
  public generateCaustics(time: number): CausticsData {
    const resolution = this.causticsResolution;
    const pattern = new Float32Array(resolution * resolution);
    const { causticsScale, causticsSpeed, causticsIntensity } = this.params;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = (i / resolution) * causticsScale;
        const y = (j / resolution) * causticsScale;

        // Multi-octave caustics pattern
        let value = 0;

        // First layer
        value += Math.sin(x * 2 + time * causticsSpeed) *
                 Math.sin(y * 2 + time * causticsSpeed * 0.8);

        // Second layer (higher frequency)
        value += Math.sin(x * 4 + time * causticsSpeed * 1.2) *
                 Math.sin(y * 4 + time * causticsSpeed * 0.9) * 0.5;

        // Third layer (even higher frequency)
        value += Math.sin(x * 8 + time * causticsSpeed * 1.5) *
                 Math.sin(y * 8 + time * causticsSpeed * 1.1) * 0.25;

        // Normalize and apply intensity
        value = (value + 1.75) / 3.5; // Normalize to 0-1
        value = Math.pow(value, 2) * causticsIntensity;

        pattern[i * resolution + j] = Math.max(0, Math.min(1, value));
      }
    }

    return { pattern, resolution };
  }

  /**
   * Samples caustics pattern at world position
   */
  public sampleCaustics(causticsData: CausticsData, x: number, z: number): number {
    const { pattern, resolution } = causticsData;
    const { causticsScale } = this.params;

    const u = ((x / causticsScale) % 1 + 1) % 1;
    const v = ((z / causticsScale) % 1 + 1) % 1;

    const i = Math.floor(u * resolution);
    const j = Math.floor(v * resolution);

    const idx = (i % resolution) * resolution + (j % resolution);
    return pattern[idx] || 0;
  }

  /**
   * Calculates distortion offset for underwater view
   */
  public calculateDistortion(position: Vector3, time: number): Vector3 {
    const { distortionStrength } = this.params;

    const offset = new Vector3(
      Math.sin(position.y * 0.5 + time) * distortionStrength,
      Math.cos(position.x * 0.5 + time * 0.8) * distortionStrength,
      Math.sin(position.z * 0.5 + time * 1.2) * distortionStrength
    );

    return offset;
  }

  /**
   * Calculates god rays intensity
   */
  public calculateGodRays(position: Vector3, sunDirection: Vector3, depth: number): number {
    const { sunlightIntensity } = this.params;

    // God rays are stronger when looking towards the sun
    const viewDir = position.clone().normalize();
    const alignment = Math.max(0, viewDir.dot(sunDirection));

    // Fade with depth
    const depthFade = Math.exp(-depth * 0.1);

    return alignment * sunlightIntensity * depthFade;
  }

  /**
   * Checks if position is underwater
   */
  public isUnderwater(position: Vector3, waterHeight: number): boolean {
    return position.y < waterHeight;
  }

  /**
   * Gets depth underwater
   */
  public getDepth(position: Vector3, waterHeight: number): number {
    return Math.max(0, waterHeight - position.y);
  }

  /**
   * Calculates underwater light attenuation
   */
  public calculateLightAttenuation(depth: number): number {
    // Beer-Lambert law
    const extinctionCoefficient = 0.1;
    return Math.exp(-extinctionCoefficient * depth);
  }

  /**
   * Gets fog color with depth variation
   */
  public getFogColor(depth: number): [number, number, number] {
    const baseColor = this.params.fogColor;

    // Darken with depth
    const darkening = Math.max(0.2, 1.0 - depth * 0.05);

    return [
      baseColor[0] * darkening,
      baseColor[1] * darkening,
      baseColor[2] * darkening
    ];
  }
}

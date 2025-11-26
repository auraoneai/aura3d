/**
 * Volume rendering for smoke simulation.
 * Implements ray marching through the density field for visualization.
 * @module SmokeRenderer
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Logger } from '../../core/Logger';

const logger = Logger.get('SmokeRenderer');

/**
 * Ray marching parameters for volume rendering.
 */
export interface RayMarchConfig {
  maxSteps: number;
  stepSize: number;
  densityScale: number;
  lightPosition: Vector3;
  lightColor: Color;
  ambientColor: Color;
  shadowSteps: number;
  shadowDensity: number;
}

/**
 * Volume renderer for smoke using ray marching.
 */
export class SmokeRenderer {
  private readonly config: RayMarchConfig;

  /**
   * Creates a new smoke renderer.
   * @param config - Ray marching configuration
   */
  constructor(config: Partial<RayMarchConfig> = {}) {
    this.config = {
      maxSteps: config.maxSteps ?? 128,
      stepSize: config.stepSize ?? 0.1,
      densityScale: config.densityScale ?? 1.0,
      lightPosition: config.lightPosition ?? new Vector3(10, 20, 10),
      lightColor: config.lightColor ?? new Color(1, 1, 1, 1),
      ambientColor: config.ambientColor ?? new Color(0.1, 0.1, 0.15, 1),
      shadowSteps: config.shadowSteps ?? 8,
      shadowDensity: config.shadowDensity ?? 0.5,
    };

    logger.info('Smoke renderer initialized');
  }

  /**
   * Performs ray marching through density field.
   * @param rayOrigin - Ray origin in world space
   * @param rayDirection - Ray direction (normalized)
   * @param sampleDensity - Function to sample density at position
   * @param bounds - Domain bounds
   * @returns Final color after ray marching
   */
  public rayMarch(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    sampleDensity: (pos: Vector3) => number,
    bounds: Vector3
  ): Color {
    const tEntry = this.intersectBox(rayOrigin, rayDirection, bounds);
    if (tEntry < 0) {
      return new Color(0, 0, 0, 0);
    }

    let currentPos = rayOrigin.add(rayDirection.scale(tEntry));
    let transmittance = 1.0;
    let scattering = Vector3.zero();

    for (let step = 0; step < this.config.maxSteps; step++) {
      if (!this.isInsideBounds(currentPos, bounds)) {
        break;
      }

      const density = sampleDensity(currentPos) * this.config.densityScale;

      if (density > 0.001) {
        const extinction = density * this.config.stepSize;
        const absorb = Math.exp(-extinction);

        const lighting = this.calculateLighting(currentPos, density, sampleDensity, bounds);

        scattering = scattering.add(
          new Vector3(lighting.r, lighting.g, lighting.b).scale(transmittance * (1.0 - absorb))
        );

        transmittance *= absorb;

        if (transmittance < 0.01) {
          break;
        }
      }

      currentPos = currentPos.add(rayDirection.scale(this.config.stepSize));
    }

    const finalColor = new Color(
      scattering.x + this.config.ambientColor.r * transmittance,
      scattering.y + this.config.ambientColor.g * transmittance,
      scattering.z + this.config.ambientColor.b * transmittance,
      1.0 - transmittance
    );

    return finalColor;
  }

  /**
   * Calculates lighting at a sample point.
   * @param position - Sample position
   * @param density - Density at position
   * @param sampleDensity - Function to sample density
   * @param bounds - Domain bounds
   * @returns Light color
   */
  private calculateLighting(
    position: Vector3,
    density: number,
    sampleDensity: (pos: Vector3) => number,
    bounds: Vector3
  ): Color {
    const toLight = this.config.lightPosition.sub(position).normalize();

    let shadowTransmittance = 1.0;

    const shadowStepSize = this.config.stepSize * 2.0;
    let shadowPos = position.add(toLight.scale(shadowStepSize));

    for (let step = 0; step < this.config.shadowSteps; step++) {
      if (!this.isInsideBounds(shadowPos, bounds)) {
        break;
      }

      const shadowDensity = sampleDensity(shadowPos);
      const shadowExtinction = shadowDensity * shadowStepSize * this.config.shadowDensity;

      shadowTransmittance *= Math.exp(-shadowExtinction);

      if (shadowTransmittance < 0.01) {
        break;
      }

      shadowPos = shadowPos.add(toLight.scale(shadowStepSize));
    }

    const lightIntensity = shadowTransmittance;

    return new Color(
      this.config.lightColor.r * lightIntensity,
      this.config.lightColor.g * lightIntensity,
      this.config.lightColor.b * lightIntensity,
      1.0
    );
  }

  /**
   * Computes ray-box intersection.
   * @param rayOrigin - Ray origin
   * @param rayDirection - Ray direction
   * @param bounds - Box bounds
   * @returns Entry distance (negative if no intersection)
   */
  private intersectBox(rayOrigin: Vector3, rayDirection: Vector3, bounds: Vector3): number {
    const invDir = new Vector3(
      1.0 / rayDirection.x,
      1.0 / rayDirection.y,
      1.0 / rayDirection.z
    );

    const t1 = new Vector3(0, 0, 0).sub(rayOrigin).multiply(invDir);
    const t2 = bounds.sub(rayOrigin).multiply(invDir);

    const tmin = Vector3.min(t1, t2);
    const tmax = Vector3.max(t1, t2);

    const tEntry = Math.max(tmin.x, tmin.y, tmin.z);
    const tExit = Math.min(tmax.x, tmax.y, tmax.z);

    if (tEntry > tExit || tExit < 0) {
      return -1;
    }

    return Math.max(0, tEntry);
  }

  /**
   * Checks if position is inside bounds.
   */
  private isInsideBounds(position: Vector3, bounds: Vector3): boolean {
    return position.x >= 0 && position.x <= bounds.x &&
           position.y >= 0 && position.y <= bounds.y &&
           position.z >= 0 && position.z <= bounds.z;
  }

  /**
   * Generates a 2D slice through the density field.
   * @param sampleDensity - Function to sample density
   * @param bounds - Domain bounds
   * @param resolution - Output resolution
   * @param sliceAxis - Axis to slice along ('x', 'y', or 'z')
   * @param slicePosition - Position along axis (0-1)
   * @returns 2D array of density values
   */
  public generateSlice(
    sampleDensity: (pos: Vector3) => number,
    bounds: Vector3,
    resolution: { width: number; height: number },
    sliceAxis: 'x' | 'y' | 'z',
    slicePosition: number
  ): Float32Array {
    const data = new Float32Array(resolution.width * resolution.height);

    for (let j = 0; j < resolution.height; j++) {
      for (let i = 0; i < resolution.width; i++) {
        let position: Vector3;

        if (sliceAxis === 'x') {
          position = new Vector3(
            bounds.x * slicePosition,
            (j / resolution.height) * bounds.y,
            (i / resolution.width) * bounds.z
          );
        } else if (sliceAxis === 'y') {
          position = new Vector3(
            (i / resolution.width) * bounds.x,
            bounds.y * slicePosition,
            (j / resolution.height) * bounds.z
          );
        } else {
          position = new Vector3(
            (i / resolution.width) * bounds.x,
            (j / resolution.height) * bounds.y,
            bounds.z * slicePosition
          );
        }

        data[j * resolution.width + i] = sampleDensity(position);
      }
    }

    return data;
  }

  /**
   * Renders smoke to a 2D image buffer using orthographic projection.
   * @param sampleDensity - Function to sample density
   * @param bounds - Domain bounds
   * @param resolution - Output resolution
   * @param viewDirection - View direction
   * @returns Image buffer (RGBA)
   */
  public renderOrthographic(
    sampleDensity: (pos: Vector3) => number,
    bounds: Vector3,
    resolution: { width: number; height: number },
    viewDirection: Vector3
  ): Uint8ClampedArray {
    const buffer = new Uint8ClampedArray(resolution.width * resolution.height * 4);

    const normalizedDir = viewDirection.normalize();

    const up = Math.abs(normalizedDir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const right = normalizedDir.cross(up).normalize();
    const actualUp = right.cross(normalizedDir).normalize();

    for (let j = 0; j < resolution.height; j++) {
      for (let i = 0; i < resolution.width; i++) {
        const u = (i / resolution.width - 0.5) * 2.0;
        const v = (j / resolution.height - 0.5) * 2.0;

        const rayOrigin = bounds.scale(0.5)
          .add(right.scale(u * bounds.x * 0.5))
          .add(actualUp.scale(v * bounds.y * 0.5))
          .sub(normalizedDir.scale(bounds.z));

        const color = this.rayMarch(rayOrigin, normalizedDir, sampleDensity, bounds);

        const idx = (j * resolution.width + i) * 4;
        buffer[idx] = Math.floor(color.r * 255);
        buffer[idx + 1] = Math.floor(color.g * 255);
        buffer[idx + 2] = Math.floor(color.b * 255);
        buffer[idx + 3] = Math.floor(color.a * 255);
      }
    }

    return buffer;
  }

  /**
   * Gets the configuration.
   */
  public getConfig(): Readonly<RayMarchConfig> {
    return this.config;
  }

  /**
   * Updates light position.
   */
  public setLightPosition(position: Vector3): void {
    (this.config as { lightPosition: Vector3 }).lightPosition = position.clone();
  }

  /**
   * Updates light color.
   */
  public setLightColor(color: Color): void {
    (this.config as { lightColor: Color }).lightColor = color.clone();
  }
}

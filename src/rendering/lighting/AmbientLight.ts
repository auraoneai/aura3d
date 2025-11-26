/**
 * AmbientLight.ts
 * Simple ambient light for basic scene illumination.
 * Part of G3D 5.0 Rendering Module
 */

import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Color } from '../../math/Color';
import { Vector3 } from '../../math/Vector3';
import { Light, LightType, ShadowMode } from './Light';

/**
 * Simple ambient light that provides uniform illumination from all directions.
 * Unlike other lights, ambient light has no position or direction and affects
 * all surfaces equally.
 *
 * @example
 * ```typescript
 * const ambient = new AmbientLight();
 * ambient.color = new Color(0.2, 0.2, 0.3);
 * ambient.intensity = 0.5;
 * scene.addLight(ambient);
 * ```
 */
export class AmbientLight extends Light {
  /**
   * Create a new ambient light.
   * @param color - Light color (default: white)
   * @param intensity - Light intensity (default: 0.5)
   */
  constructor(color: Color = new Color(1, 1, 1), intensity: number = 0.5) {
    super(LightType.Probe); // Use probe type as it's closest to ambient
    this.color = color;
    this.intensity = intensity;
    // Ambient lights don't cast shadows - configure the shadow settings
    this.shadowConfig.mode = ShadowMode.None;
  }

  /**
   * Get the ambient light contribution for rendering.
   * @returns Ambient color multiplied by intensity
   */
  getAmbientColor(): Color {
    return new Color(
      this.color.r * this.intensity,
      this.color.g * this.intensity,
      this.color.b * this.intensity,
      1.0
    );
  }

  /**
   * Ambient lights have infinite bounds (affect everything).
   * @returns An empty box representing infinite bounds
   */
  getBoundingVolume(): Box3 | Sphere {
    // Return a very large sphere to represent infinite influence
    return new Sphere(new Vector3(0, 0, 0), Infinity);
  }

  /**
   * Pack light data for GPU buffer.
   * @param buffer - Target buffer
   * @param offset - Starting offset
   * @returns Number of floats written
   */
  packGPUData(buffer: Float32Array, offset: number): number {
    // Pack ambient light data: color (3) + intensity (1) = 4 floats
    buffer[offset + 0] = this.color.r * this.intensity;
    buffer[offset + 1] = this.color.g * this.intensity;
    buffer[offset + 2] = this.color.b * this.intensity;
    buffer[offset + 3] = 1.0; // Pad for alignment
    return 4;
  }

  /**
   * Clone this ambient light.
   * @returns A new AmbientLight with the same properties
   */
  clone(): AmbientLight {
    const cloned = new AmbientLight(this.color.clone(), this.intensity);
    cloned.enabled = this.enabled;
    return cloned;
  }
}

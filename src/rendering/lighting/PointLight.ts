/**
 * @module Rendering/Lighting
 * @description
 * Point light implementation for omnidirectional light sources with range-based attenuation.
 * Uses physically-based inverse square falloff and supports cubemap shadows.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Sphere } from '../../math/Sphere';
import { Box3 } from '../../math/Box3';
import { Light, LightType, LightUnit } from './Light';
import { Logger } from '../../core/Logger';

const logger = Logger.create('PointLight');

/**
 * Attenuation model for point lights.
 */
export enum AttenuationModel {
  /** No attenuation (unrealistic but useful for debugging) */
  None = 'none',
  /** Linear attenuation */
  Linear = 'linear',
  /** Physically-based inverse square falloff */
  InverseSquare = 'inverse_square',
  /** Unity-style attenuation with smooth cutoff */
  Unity = 'unity',
  /** Unreal Engine-style attenuation */
  Unreal = 'unreal',
}

/**
 * Point light class for omnidirectional light sources.
 *
 * Point lights emit light uniformly in all directions from a single point in space.
 * They are ideal for representing light bulbs, candles, torches, and other localized
 * light sources.
 *
 * Key features:
 * - Omnidirectional emission
 * - Physically-based inverse square falloff
 * - Efficient range-based culling
 * - Cubemap shadow mapping support
 * - Physical units (Lumens)
 *
 * @example
 * ```typescript
 * // Create a light bulb
 * const bulb = new PointLight();
 * bulb.position = new Vector3(0, 2, 0);
 * bulb.setIntensity(800, LightUnit.Lumens); // 60W incandescent equivalent
 * bulb.color = new Color(1, 0.9, 0.7); // Warm white
 * bulb.range = 10;
 *
 * // Enable shadows
 * bulb.setShadowsEnabled(true);
 * bulb.shadowConfig.quality = ShadowQuality.Medium;
 *
 * // Create a torch with flickering
 * const torch = new PointLight(new Vector3(5, 1, 5));
 * torch.setIntensity(200, LightUnit.Lumens);
 * torch.setTemperature(1800); // Fire temperature
 * ```
 */
export class PointLight extends Light {
  /**
   * Light position in world space.
   */
  position: Vector3;

  /**
   * Maximum range of light influence.
   * Light intensity falls to zero at this distance.
   */
  range: number;

  /**
   * Attenuation model for light falloff.
   */
  attenuationModel: AttenuationModel;

  /**
   * Radius of the light source for soft shadows.
   * Larger radius creates softer shadows (area light approximation).
   */
  sourceRadius: number;

  /**
   * Enable cubemap shadow optimization.
   * When true, only necessary faces are rendered.
   */
  optimizeShadowFaces: boolean;

  /**
   * Cached bounding sphere for culling.
   */
  private cachedBoundingSphere: Sphere | null;

  /**
   * Creates a new PointLight instance.
   *
   * @param position - Light position in world space
   * @param color - Light color
   * @param intensity - Light intensity (in Lumens when using physical units)
   * @param range - Maximum light range
   *
   * @example
   * ```typescript
   * // Default light at origin
   * const light = new PointLight();
   *
   * // Custom position and range
   * const bulb = new PointLight(
   *   new Vector3(0, 3, 0),
   *   new Color(1, 1, 1),
   *   800,
   *   15
   * );
   * ```
   */
  constructor(
    position: Vector3 = new Vector3(0, 0, 0),
    color: Color = new Color(1, 1, 1),
    intensity: number = 1000,
    range: number = 10
  ) {
    super(LightType.Point);

    this.position = position;
    this.color = color;
    this.intensity = intensity;
    this.unit = LightUnit.Lumens;
    this.range = range;
    this.attenuationModel = AttenuationModel.InverseSquare;
    this.sourceRadius = 0.01; // Small radius by default
    this.optimizeShadowFaces = true;
    this.cachedBoundingSphere = null;

    this.label = `PointLight_${this.id}`;
  }

  /**
   * Sets the light position.
   *
   * @param position - New position in world space
   *
   * @example
   * ```typescript
   * light.setPosition(new Vector3(10, 5, 0));
   *
   * // Animate light position
   * const time = Time.elapsed;
   * light.setPosition(new Vector3(
   *   Math.cos(time) * 5,
   *   2,
   *   Math.sin(time) * 5
   * ));
   * ```
   */
  setPosition(position: Vector3): void {
    this.position = position;
    this.cachedBoundingSphere = null;
    this.markDirty();
  }

  /**
   * Sets the light range.
   *
   * @param range - Maximum light range
   *
   * @example
   * ```typescript
   * light.setRange(20);
   *
   * // Calculate range from intensity for specific cutoff
   * const cutoffLuminance = 0.01; // lux
   * const range = Math.sqrt(light.intensity / (4 * Math.PI * cutoffLuminance));
   * light.setRange(range);
   * ```
   */
  setRange(range: number): void {
    this.range = Math.max(0.1, range);
    this.cachedBoundingSphere = null;
    this.markDirty();
  }

  /**
   * Calculates light attenuation at a given distance.
   *
   * @param distance - Distance from light position
   * @returns Attenuation factor [0, 1]
   *
   * @example
   * ```typescript
   * const attenuation = light.calculateAttenuation(5.0);
   * const contribution = light.intensity * attenuation;
   * ```
   */
  calculateAttenuation(distance: number): number {
    if (distance >= this.range) return 0;

    switch (this.attenuationModel) {
      case AttenuationModel.None:
        return 1.0;

      case AttenuationModel.Linear:
        return Math.max(0, 1.0 - distance / this.range);

      case AttenuationModel.InverseSquare: {
        // Physically-based inverse square with smooth cutoff
        const distanceSquared = distance * distance;
        const rangeSquared = this.range * this.range;

        // Smooth attenuation that reaches zero at range
        const attenuation = 1.0 / (1.0 + distanceSquared);
        const smoothCutoff = Math.max(0, 1.0 - (distanceSquared / rangeSquared));
        const smoothCutoffSquared = smoothCutoff * smoothCutoff;

        return attenuation * smoothCutoffSquared;
      }

      case AttenuationModel.Unity: {
        // Unity's smooth attenuation formula
        const distanceRatio = distance / this.range;
        const distanceRatioSquared = distanceRatio * distanceRatio;
        const attenuation = 1.0 / (1.0 + 25.0 * distanceRatioSquared);

        if (distanceRatio >= 1.0) return 0;

        const smoothFactor = Math.max(0, 1.0 - distanceRatioSquared);
        return attenuation * smoothFactor * smoothFactor;
      }

      case AttenuationModel.Unreal: {
        // Unreal Engine's attenuation formula
        const distanceSquared = distance * distance;
        const rangeSquared = this.range * this.range;

        const numerator = Math.max(0, 1.0 - Math.pow(distance / this.range, 4));
        const denominator = distanceSquared + 1.0;

        return (numerator * numerator) / denominator;
      }

      default:
        return this.calculateAttenuation(distance);
    }
  }

  /**
   * Calculates the effective range where light contribution exceeds threshold.
   *
   * @param threshold - Minimum contribution threshold [0, 1]
   * @returns Effective range in world units
   *
   * @example
   * ```typescript
   * // Get range where light contributes at least 1%
   * const effectiveRange = light.calculateEffectiveRange(0.01);
   * ```
   */
  calculateEffectiveRange(threshold: number = 0.01): number {
    // Binary search to find distance where attenuation equals threshold
    let low = 0;
    let high = this.range;
    const epsilon = 0.001;

    while (high - low > epsilon) {
      const mid = (low + high) / 2;
      const attenuation = this.calculateAttenuation(mid);

      if (attenuation > threshold) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  }

  /**
   * Gets the luminous intensity in candelas.
   *
   * @returns Intensity in candelas
   *
   * @example
   * ```typescript
   * const candela = light.getLuminousIntensity();
   * console.log(`Light intensity: ${candela} cd`);
   * ```
   */
  getLuminousIntensity(): number {
    if (this.unit === LightUnit.Lumens) {
      // Convert lumens to candela (lumens / 4π steradians)
      return this.intensity / (4 * Math.PI);
    } else if (this.unit === LightUnit.Candela) {
      return this.intensity;
    }
    return this.getEffectiveIntensity();
  }

  /**
   * Gets the bounding volume for this light.
   * Used for frustum culling and spatial queries.
   *
   * @returns Bounding sphere containing the light's influence
   *
   * @example
   * ```typescript
   * const bounds = light.getBoundingVolume();
   * if (frustum.intersectsSphere(bounds)) {
   *   // Light is visible
   * }
   * ```
   */
  getBoundingVolume(): Sphere {
    if (this.cachedBoundingSphere && !this.isDirty()) {
      return this.cachedBoundingSphere;
    }

    this.cachedBoundingSphere = new Sphere(this.position, this.range);
    return this.cachedBoundingSphere;
  }

  /**
   * Gets a bounding box for this light.
   * Useful for certain culling algorithms.
   *
   * @returns Axis-aligned bounding box
   */
  getBoundingBox(): Box3 {
    const min = this.position.sub(new Vector3(this.range, this.range, this.range));
    const max = this.position.add(new Vector3(this.range, this.range, this.range));
    return new Box3(min, max);
  }

  /**
   * Calculates which cubemap faces need shadow rendering.
   * Optimizes shadow rendering by only rendering visible faces.
   *
   * @param cameraPosition - Camera position
   * @param cameraForward - Camera forward direction
   * @param fov - Camera field of view
   * @returns Array of face indices to render (0-5: +X, -X, +Y, -Y, +Z, -Z)
   *
   * @example
   * ```typescript
   * const visibleFaces = light.calculateVisibleShadowFaces(
   *   camera.position,
   *   camera.forward,
   *   camera.fov
   * );
   * // Render only visible faces
   * ```
   */
  calculateVisibleShadowFaces(
    cameraPosition: Vector3,
    cameraForward: Vector3,
    fov: number
  ): number[] {
    if (!this.optimizeShadowFaces) {
      return [0, 1, 2, 3, 4, 5]; // All faces
    }

    const toCamera = cameraPosition.sub(this.position).normalize();
    const fovRadius = Math.cos(fov / 2);

    const faces = [
      { index: 0, direction: new Vector3(1, 0, 0) },   // +X
      { index: 1, direction: new Vector3(-1, 0, 0) },  // -X
      { index: 2, direction: new Vector3(0, 1, 0) },   // +Y
      { index: 3, direction: new Vector3(0, -1, 0) },  // -Y
      { index: 4, direction: new Vector3(0, 0, 1) },   // +Z
      { index: 5, direction: new Vector3(0, 0, -1) },  // -Z
    ];

    // Filter faces based on camera view
    return faces
      .filter(face => {
        const dot = face.direction.dot(toCamera);
        return dot > -fovRadius; // Face potentially visible
      })
      .map(face => face.index);
  }

  /**
   * Packs this light's data into a GPU buffer.
   *
   * Layout (16 floats):
   * - [0-2]: Position (xyz)
   * - [3]: Type (1 = point)
   * - [4-6]: Color (rgb)
   * - [7]: Intensity
   * - [8]: Range
   * - [9]: Attenuation model
   * - [10]: Source radius
   * - [11]: Reserved
   * - [12-15]: Shadow parameters
   *
   * @param buffer - Target buffer
   * @param offset - Offset in floats
   * @returns New offset after packing
   */
  packGPUData(buffer: Float32Array, offset: number): number {
    // Position and type
    buffer[offset++] = this.position.x;
    buffer[offset++] = this.position.y;
    buffer[offset++] = this.position.z;
    buffer[offset++] = 1; // Type: point

    // Color and intensity
    const color = this.getEffectiveColor();
    buffer[offset++] = color.r;
    buffer[offset++] = color.g;
    buffer[offset++] = color.b;
    buffer[offset++] = this.getLuminousIntensity();

    // Range and attenuation
    buffer[offset++] = this.range;
    buffer[offset++] = this.getAttenuationModelValue();
    buffer[offset++] = this.sourceRadius;
    buffer[offset++] = 0; // Reserved

    // Shadow parameters
    buffer[offset++] = this.castsShadows() ? 1 : 0;
    buffer[offset++] = this.shadowConfig.bias;
    buffer[offset++] = this.shadowConfig.normalBias;
    buffer[offset++] = this.shadowConfig.strength;

    return offset;
  }

  /**
   * Gets numeric value for attenuation model (for GPU).
   */
  private getAttenuationModelValue(): number {
    switch (this.attenuationModel) {
      case AttenuationModel.None: return 0;
      case AttenuationModel.Linear: return 1;
      case AttenuationModel.InverseSquare: return 2;
      case AttenuationModel.Unity: return 3;
      case AttenuationModel.Unreal: return 4;
      default: return 2;
    }
  }

  /**
   * Updates light state.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * // Override for flickering effect
   * update(deltaTime: number): void {
   *   super.update(deltaTime);
   *
   *   // Random flicker
   *   const flicker = 0.9 + Math.random() * 0.1;
   *   this.intensity = this.baseIntensity * flicker;
   * }
   * ```
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    // Additional update logic for point light
  }

  /**
   * Clones this point light.
   *
   * @returns New PointLight instance with same properties
   */
  clone(): PointLight {
    const clone = new PointLight(
      this.position.clone(),
      this.color.clone(),
      this.intensity,
      this.range
    );

    clone.unit = this.unit;
    clone.enabled = this.enabled;
    clone.priority = this.priority;
    clone.shadowConfig = { ...this.shadowConfig };
    clone.cullingMask = { ...this.cullingMask };
    clone.attenuationModel = this.attenuationModel;
    clone.sourceRadius = this.sourceRadius;
    clone.optimizeShadowFaces = this.optimizeShadowFaces;

    return clone;
  }
}

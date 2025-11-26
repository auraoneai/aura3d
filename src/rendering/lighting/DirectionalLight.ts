/**
 * @module Rendering/Lighting
 * @description
 * Directional light implementation for infinite distance light sources (sun, moon).
 * Uses cascaded shadow maps for high-quality shadow rendering across large scenes.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Matrix4 } from '../../math/Matrix4';
import { Light, LightType, LightUnit, ShadowQuality } from './Light';
import { Logger } from '../../core/Logger';

const logger = Logger.create('DirectionalLight');

/**
 * Cascade split scheme for shadow map distribution.
 */
export enum CascadeSplitScheme {
  /** Uniform distribution */
  Uniform = 'uniform',
  /** Logarithmic distribution */
  Logarithmic = 'logarithmic',
  /** Practical split (combination of uniform and logarithmic) */
  Practical = 'practical',
  /** Manual split distances */
  Manual = 'manual',
}

/**
 * Configuration for cascaded shadow maps.
 */
export interface CascadeConfig {
  /** Number of cascades (1-4) */
  count: number;
  /** Split scheme for cascade distribution */
  splitScheme: CascadeSplitScheme;
  /** Lambda value for practical split [0, 1] (0=uniform, 1=logarithmic) */
  splitLambda: number;
  /** Manual split distances (when using Manual scheme) */
  manualSplits: number[];
  /** Blend region between cascades (0-1) */
  blendRegion: number;
  /** Enable cascade stabilization (prevents shimmering) */
  stabilize: boolean;
  /** Resolution per cascade */
  resolutions: number[];
}

/**
 * Atmospheric scattering parameters for sky rendering.
 */
export interface AtmosphericScattering {
  /** Enable atmospheric scattering */
  enabled: boolean;
  /** Rayleigh scattering coefficient */
  rayleighCoefficient: number;
  /** Mie scattering coefficient */
  mieCoefficient: number;
  /** Atmospheric turbidity [1, 10] */
  turbidity: number;
  /** Ground albedo [0, 1] */
  groundAlbedo: number;
  /** Sun disk scale factor */
  sunDiskScale: number;
  /** Sun disk intensity */
  sunDiskIntensity: number;
}

/**
 * Directional light class for infinite distance light sources.
 *
 * Directional lights simulate light from sources infinitely far away (like the sun),
 * where all light rays are parallel. This makes them ideal for outdoor lighting
 * and large-scale scenes.
 *
 * Key features:
 * - Parallel light rays (no attenuation)
 * - Cascaded shadow maps for high-quality shadows over large distances
 * - Atmospheric scattering parameters for realistic sky rendering
 * - Efficient culling (affects entire scene)
 * - Physically-based units (Lux)
 *
 * @example
 * ```typescript
 * // Create a sun light
 * const sun = new DirectionalLight();
 * sun.direction = new Vector3(0.3, -1, 0.2).normalize();
 * sun.setIntensity(100000, LightUnit.Lux); // Typical sunlight
 * sun.setTemperature(5778); // Sun temperature
 *
 * // Configure cascaded shadows
 * sun.setShadowsEnabled(true);
 * sun.cascadeConfig.count = 4;
 * sun.cascadeConfig.splitScheme = CascadeSplitScheme.Practical;
 * sun.cascadeConfig.splitLambda = 0.5;
 *
 * // Enable atmospheric scattering
 * sun.atmospheric.enabled = true;
 * sun.atmospheric.turbidity = 2.0;
 * ```
 */
export class DirectionalLight extends Light {
  /**
   * Light direction in world space (normalized).
   * Default points downward (0, -1, 0).
   */
  direction: Vector3;

  /**
   * Cascaded shadow map configuration.
   */
  cascadeConfig: CascadeConfig;

  /**
   * Atmospheric scattering parameters.
   */
  atmospheric: AtmosphericScattering;

  /**
   * Angular diameter of light source in degrees.
   * Used for soft shadow simulation (sun = 0.53 degrees).
   */
  angularDiameter: number;

  /**
   * Cached cascade split distances.
   */
  private cachedSplits: number[];

  /**
   * Cached cascade view-projection matrices.
   */
  private cachedCascadeMatrices: Matrix4[];

  /**
   * Creates a new DirectionalLight instance.
   *
   * @param direction - Light direction (will be normalized)
   * @param color - Light color
   * @param intensity - Light intensity (in Lux when using physical units)
   *
   * @example
   * ```typescript
   * // Default sun pointing down
   * const sun = new DirectionalLight();
   *
   * // Custom direction and intensity
   * const moon = new DirectionalLight(
   *   new Vector3(0.5, -0.5, 0.3),
   *   new Color(0.7, 0.8, 1.0),
   *   1.0
   * );
   * moon.setIntensity(0.25, LightUnit.Lux); // Moonlight
   * ```
   */
  constructor(
    direction: Vector3 = new Vector3(0, -1, 0),
    color: Color = new Color(1, 1, 1),
    intensity: number = 100000
  ) {
    super(LightType.Directional);

    this.direction = direction.normalize();
    this.color = color;
    this.intensity = intensity;
    this.unit = LightUnit.Lux;
    this.angularDiameter = 0.53; // Sun's angular diameter

    // Default cascade configuration
    this.cascadeConfig = {
      count: 4,
      splitScheme: CascadeSplitScheme.Practical,
      splitLambda: 0.5,
      manualSplits: [0.1, 1.0, 10.0, 100.0],
      blendRegion: 0.1,
      stabilize: true,
      resolutions: [2048, 2048, 2048, 2048],
    };

    // Default atmospheric scattering
    this.atmospheric = {
      enabled: false,
      rayleighCoefficient: 1.0,
      mieCoefficient: 1.0,
      turbidity: 2.0,
      groundAlbedo: 0.3,
      sunDiskScale: 1.0,
      sunDiskIntensity: 1.0,
    };

    this.cachedSplits = [];
    this.cachedCascadeMatrices = [];

    this.label = `DirectionalLight_${this.id}`;
  }

  /**
   * Sets the light direction.
   *
   * @param direction - New direction (will be normalized)
   *
   * @example
   * ```typescript
   * // Point light downward and slightly east
   * light.setDirection(new Vector3(0.3, -1, 0));
   *
   * // Animate sun across sky
   * const angle = Time.elapsed * 0.1;
   * light.setDirection(new Vector3(Math.sin(angle), -Math.cos(angle), 0));
   * ```
   */
  setDirection(direction: Vector3): void {
    this.direction = direction.normalize();
    this.markDirty();
  }

  /**
   * Calculates cascade split distances based on the split scheme.
   *
   * @param nearPlane - Camera near plane
   * @param farPlane - Camera far plane
   * @returns Array of split distances
   *
   * @example
   * ```typescript
   * const splits = light.calculateCascadeSplits(0.1, 100.0);
   * console.log(splits); // [0.1, 2.5, 10.0, 40.0, 100.0]
   * ```
   */
  calculateCascadeSplits(nearPlane: number, farPlane: number): number[] {
    const splits: number[] = [nearPlane];
    const cascadeCount = this.cascadeConfig.count;

    if (this.cascadeConfig.splitScheme === CascadeSplitScheme.Manual) {
      // Use manual splits
      for (let i = 0; i < cascadeCount; i++) {
        splits.push(this.cascadeConfig.manualSplits[i] || farPlane);
      }
    } else {
      // Calculate splits based on scheme
      for (let i = 1; i <= cascadeCount; i++) {
        const fraction = i / cascadeCount;
        let split: number;

        switch (this.cascadeConfig.splitScheme) {
          case CascadeSplitScheme.Uniform:
            split = nearPlane + fraction * (farPlane - nearPlane);
            break;

          case CascadeSplitScheme.Logarithmic:
            split = nearPlane * Math.pow(farPlane / nearPlane, fraction);
            break;

          case CascadeSplitScheme.Practical:
          default:
            // Practical split scheme (combination of uniform and logarithmic)
            const lambda = this.cascadeConfig.splitLambda;
            const uniformSplit = nearPlane + fraction * (farPlane - nearPlane);
            const logSplit = nearPlane * Math.pow(farPlane / nearPlane, fraction);
            split = lambda * logSplit + (1 - lambda) * uniformSplit;
            break;
        }

        splits.push(split);
      }
    }

    this.cachedSplits = splits;
    return splits;
  }

  /**
   * Gets the cascade split distances.
   * Returns cached splits if available.
   *
   * @param nearPlane - Camera near plane
   * @param farPlane - Camera far plane
   * @returns Array of split distances
   */
  getCascadeSplits(nearPlane: number, farPlane: number): number[] {
    if (this.cachedSplits.length === 0 || this.isDirty()) {
      return this.calculateCascadeSplits(nearPlane, farPlane);
    }
    return this.cachedSplits;
  }

  /**
   * Calculates the view-projection matrix for a specific cascade.
   *
   * @param cascadeIndex - Index of the cascade (0-3)
   * @param viewMatrix - Camera view matrix
   * @param nearSplit - Near split distance
   * @param farSplit - Far split distance
   * @param fov - Camera field of view in radians
   * @param aspect - Camera aspect ratio
   * @returns View-projection matrix for the cascade
   *
   * @example
   * ```typescript
   * const splits = light.getCascadeSplits(0.1, 100.0);
   * const cascadeMatrix = light.calculateCascadeMatrix(
   *   0,
   *   camera.viewMatrix,
   *   splits[0],
   *   splits[1],
   *   Math.PI / 4,
   *   16 / 9
   * );
   * ```
   */
  calculateCascadeMatrix(
    cascadeIndex: number,
    viewMatrix: Matrix4,
    nearSplit: number,
    farSplit: number,
    fov: number,
    aspect: number
  ): Matrix4 {
    // Calculate frustum corners in world space
    const frustumCorners = this.calculateFrustumCorners(
      viewMatrix,
      nearSplit,
      farSplit,
      fov,
      aspect
    );

    // Calculate center of frustum
    const center = new Vector3(0, 0, 0);
    for (const corner of frustumCorners) {
      center.addInPlace(corner);
    }
    center.scaleInPlace(1.0 / frustumCorners.length);

    // Create light view matrix looking at frustum center
    const lightView = Matrix4.lookAt(
      center.sub(this.direction.scale(100)),
      center,
      new Vector3(0, 1, 0)
    );

    // Transform frustum corners to light space
    const lightSpaceCorners = frustumCorners.map(corner =>
      lightView.transformPoint(corner)
    );

    // Calculate bounding box in light space
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const corner of lightSpaceCorners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      minZ = Math.min(minZ, corner.z);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
      maxZ = Math.max(maxZ, corner.z);
    }

    // Stabilize cascade by rounding to texel size
    if (this.cascadeConfig.stabilize) {
      const resolution = this.cascadeConfig.resolutions[cascadeIndex] || 2048;
      const worldUnitsPerTexel = (maxX - minX) / resolution;

      minX = Math.floor(minX / worldUnitsPerTexel) * worldUnitsPerTexel;
      minY = Math.floor(minY / worldUnitsPerTexel) * worldUnitsPerTexel;
      maxX = Math.floor(maxX / worldUnitsPerTexel) * worldUnitsPerTexel;
      maxY = Math.floor(maxY / worldUnitsPerTexel) * worldUnitsPerTexel;
    }

    // Extend depth range to include shadow casters behind frustum
    const depthRange = maxZ - minZ;
    minZ -= depthRange * 2.0;

    // Create orthographic projection for cascade
    const lightProjection = Matrix4.orthographic(
      minX, maxX,
      minY, maxY,
      minZ, maxZ
    );

    return lightProjection.multiply(lightView);
  }

  /**
   * Calculates frustum corners for cascade calculation.
   *
   * @param viewMatrix - Camera view matrix
   * @param near - Near plane distance
   * @param far - Far plane distance
   * @param fov - Field of view in radians
   * @param aspect - Aspect ratio
   * @returns Array of 8 frustum corners in world space
   */
  private calculateFrustumCorners(
    viewMatrix: Matrix4,
    near: number,
    far: number,
    fov: number,
    aspect: number
  ): Vector3[] {
    const tanHalfFov = Math.tan(fov / 2);
    const nearHeight = 2 * tanHalfFov * near;
    const nearWidth = nearHeight * aspect;
    const farHeight = 2 * tanHalfFov * far;
    const farWidth = farHeight * aspect;

    const invView = viewMatrix.invert()!;

    const corners: Vector3[] = [
      // Near plane
      new Vector3(-nearWidth / 2, -nearHeight / 2, -near),
      new Vector3( nearWidth / 2, -nearHeight / 2, -near),
      new Vector3( nearWidth / 2,  nearHeight / 2, -near),
      new Vector3(-nearWidth / 2,  nearHeight / 2, -near),
      // Far plane
      new Vector3(-farWidth / 2, -farHeight / 2, -far),
      new Vector3( farWidth / 2, -farHeight / 2, -far),
      new Vector3( farWidth / 2,  farHeight / 2, -far),
      new Vector3(-farWidth / 2,  farHeight / 2, -far),
    ];

    return corners.map(corner => invView.transformPoint(corner));
  }

  /**
   * Gets the bounding volume for this light.
   * Directional lights affect the entire scene, so returns a very large box.
   *
   * @returns Bounding box for the light
   */
  getBoundingVolume(): Box3 {
    // Directional lights affect the entire scene
    return new Box3(
      new Vector3(-1e6, -1e6, -1e6),
      new Vector3(1e6, 1e6, 1e6)
    );
  }

  /**
   * Packs this light's data into a GPU buffer.
   *
   * Layout (16 floats):
   * - [0-2]: Direction (xyz)
   * - [3]: Type (0 = directional)
   * - [4-6]: Color (rgb)
   * - [7]: Intensity
   * - [8-10]: Atmospheric parameters (rayleigh, mie, turbidity)
   * - [11]: Angular diameter
   * - [12-15]: Shadow parameters
   *
   * @param buffer - Target buffer
   * @param offset - Offset in floats
   * @returns New offset after packing
   */
  packGPUData(buffer: Float32Array, offset: number): number {
    // Direction and type
    buffer[offset++] = this.direction.x;
    buffer[offset++] = this.direction.y;
    buffer[offset++] = this.direction.z;
    buffer[offset++] = 0; // Type: directional

    // Color and intensity
    const color = this.getEffectiveColor();
    buffer[offset++] = color.r;
    buffer[offset++] = color.g;
    buffer[offset++] = color.b;
    buffer[offset++] = this.getEffectiveIntensity();

    // Atmospheric parameters
    buffer[offset++] = this.atmospheric.rayleighCoefficient;
    buffer[offset++] = this.atmospheric.mieCoefficient;
    buffer[offset++] = this.atmospheric.turbidity;
    buffer[offset++] = this.angularDiameter;

    // Shadow parameters
    buffer[offset++] = this.castsShadows() ? 1 : 0;
    buffer[offset++] = this.cascadeConfig.count;
    buffer[offset++] = this.shadowConfig.bias;
    buffer[offset++] = this.shadowConfig.normalBias;

    return offset;
  }

  /**
   * Updates light state.
   *
   * @param deltaTime - Time since last update in seconds
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    // Additional update logic for directional light
  }

  /**
   * Clones this directional light.
   *
   * @returns New DirectionalLight instance with same properties
   */
  clone(): DirectionalLight {
    const clone = new DirectionalLight(
      this.direction.clone(),
      this.color.clone(),
      this.intensity
    );

    clone.unit = this.unit;
    clone.enabled = this.enabled;
    clone.priority = this.priority;
    clone.shadowConfig = { ...this.shadowConfig };
    clone.cullingMask = { ...this.cullingMask };
    clone.cascadeConfig = {
      ...this.cascadeConfig,
      manualSplits: [...this.cascadeConfig.manualSplits],
      resolutions: [...this.cascadeConfig.resolutions],
    };
    clone.atmospheric = { ...this.atmospheric };
    clone.angularDiameter = this.angularDiameter;

    return clone;
  }
}

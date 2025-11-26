/**
 * @module Rendering/Lighting
 * @description
 * Area light implementation using Linearly Transformed Cosines (LTC) for physically-based
 * area lighting. Supports rectangular and disc-shaped area lights with texture emission.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Matrix4 } from '../../math/Matrix4';
import { Quaternion } from '../../math/Quaternion';
import { Light, LightType, LightUnit } from './Light';
import { Logger } from '../../core/Logger';

const logger = Logger.create('AreaLight');

/**
 * Area light shape types.
 */
export enum AreaLightShape {
  /** Rectangular area light */
  Rectangle = 'rectangle',
  /** Circular disc area light */
  Disc = 'disc',
  /** Spherical area light */
  Sphere = 'sphere',
  /** Tube/cylinder area light */
  Tube = 'tube',
}

/**
 * Area light two-sided emission mode.
 */
export enum EmissionMode {
  /** Emit only from front face */
  SingleSided = 'single_sided',
  /** Emit from both faces */
  DoubleSided = 'double_sided',
}

/**
 * LTC lookup table configuration for area lights.
 */
export interface LTCConfig {
  /** Enable LTC-based shading (more accurate but slower) */
  enabled: boolean;
  /** LTC amplitude texture ID */
  amplitudeTextureId: number | null;
  /** LTC matrix texture ID */
  matrixTextureId: number | null;
  /** Fallback to simple approximation if LTC textures unavailable */
  fallbackToApproximation: boolean;
}

/**
 * Emission texture configuration.
 */
export interface EmissionTexture {
  /** Enable texture emission */
  enabled: boolean;
  /** Texture ID for emission map */
  textureId: number | null;
  /** Texture intensity multiplier */
  intensity: number;
  /** Texture tiling in U direction */
  tilingU: number;
  /** Texture tiling in V direction */
  tilingV: number;
  /** Texture offset in U direction */
  offsetU: number;
  /** Texture offset in V direction */
  offsetV: number;
}

/**
 * Area light class for physically-based area lighting.
 *
 * Area lights emit light from a surface rather than a point, creating soft shadows
 * and more realistic lighting. They use Linearly Transformed Cosines (LTC) for
 * accurate specular reflections.
 *
 * Key features:
 * - Rectangular and disc shapes
 * - Physically-based LTC integration
 * - Soft shadows by nature
 * - Texture emission support
 * - Two-sided emission
 * - Physical units (Nits for luminance)
 *
 * @example
 * ```typescript
 * // Create a rectangular area light (window)
 * const window = new AreaLight();
 * window.position = new Vector3(0, 2, 5);
 * window.setSize(4, 2); // 4m wide, 2m tall
 * window.setIntensity(1000, LightUnit.Nits);
 * window.color = new Color(0.9, 0.95, 1.0); // Skylight blue
 *
 * // Create a disc light (softbox)
 * const softbox = new AreaLight(AreaLightShape.Disc);
 * softbox.position = new Vector3(3, 3, 0);
 * softbox.setSize(1, 1); // 1m diameter
 * softbox.setIntensity(5000, LightUnit.Nits);
 *
 * // Add emission texture
 * softbox.emissionTexture.enabled = true;
 * softbox.emissionTexture.textureId = textureId;
 * ```
 */
export class AreaLight extends Light {
  /**
   * Light position in world space (center of the area).
   */
  position: Vector3;

  /**
   * Light orientation (rotation).
   */
  rotation: Quaternion;

  /**
   * Light shape type.
   */
  shape: AreaLightShape;

  /**
   * Width of rectangular light or diameter of disc light.
   */
  width: number;

  /**
   * Height of rectangular light (or diameter for disc).
   */
  height: number;

  /**
   * Radius for sphere and tube lights.
   */
  radius: number;

  /**
   * Length for tube lights.
   */
  length: number;

  /**
   * Emission mode (single or double-sided).
   */
  emissionMode: EmissionMode;

  /**
   * LTC configuration for accurate shading.
   */
  ltcConfig: LTCConfig;

  /**
   * Emission texture configuration.
   */
  emissionTexture: EmissionTexture;

  /**
   * Maximum range for light contribution cutoff.
   * Used for culling and optimization.
   */
  range: number;

  /**
   * Cached world transform matrix.
   */
  private cachedTransform: Matrix4 | null;

  /**
   * Cached normal direction in world space.
   */
  private cachedNormal: Vector3 | null;

  /**
   * Creates a new AreaLight instance.
   *
   * @param shape - Light shape
   * @param position - Light position in world space
   * @param width - Light width (or diameter)
   * @param height - Light height
   *
   * @example
   * ```typescript
   * // Rectangular light
   * const rect = new AreaLight(AreaLightShape.Rectangle);
   * rect.setSize(2, 1);
   *
   * // Disc light
   * const disc = new AreaLight(AreaLightShape.Disc);
   * disc.setSize(1.5, 1.5);
   * ```
   */
  constructor(
    shape: AreaLightShape = AreaLightShape.Rectangle,
    position: Vector3 = new Vector3(0, 0, 0),
    width: number = 1,
    height: number = 1
  ) {
    super(LightType.Area);

    this.position = position;
    this.rotation = Quaternion.identity();
    this.shape = shape;
    this.width = width;
    this.height = height;
    this.radius = 0.5;
    this.length = 1.0;
    this.intensity = 1000;
    this.unit = LightUnit.Nits;
    this.emissionMode = EmissionMode.SingleSided;
    this.range = 10; // Default range for culling

    // LTC configuration
    this.ltcConfig = {
      enabled: true,
      amplitudeTextureId: null,
      matrixTextureId: null,
      fallbackToApproximation: true,
    };

    // Emission texture
    this.emissionTexture = {
      enabled: false,
      textureId: null,
      intensity: 1.0,
      tilingU: 1.0,
      tilingV: 1.0,
      offsetU: 0.0,
      offsetV: 0.0,
    };

    this.cachedTransform = null;
    this.cachedNormal = null;

    this.label = `AreaLight_${this.id}`;
  }

  /**
   * Sets the light position.
   *
   * @param position - New position in world space
   *
   * @example
   * ```typescript
   * light.setPosition(new Vector3(0, 5, 0));
   * ```
   */
  setPosition(position: Vector3): void {
    this.position = position;
    this.cachedTransform = null;
    this.markDirty();
  }

  /**
   * Sets the light rotation.
   *
   * @param rotation - New rotation quaternion
   *
   * @example
   * ```typescript
   * // Rotate 45 degrees around Y axis
   * light.setRotation(Quaternion.fromEuler(0, Math.PI / 4, 0));
   *
   * // Face a specific direction
   * const direction = target.sub(light.position).normalize();
   * light.lookAt(direction);
   * ```
   */
  setRotation(rotation: Quaternion): void {
    this.rotation = rotation.normalize();
    this.cachedTransform = null;
    this.cachedNormal = null;
    this.markDirty();
  }

  /**
   * Sets the light size.
   *
   * @param width - Light width (or diameter for disc/sphere)
   * @param height - Light height (same as width for disc/sphere)
   *
   * @example
   * ```typescript
   * // Rectangular light 3m x 2m
   * light.setSize(3, 2);
   *
   * // Circular light 1.5m diameter
   * disc.setSize(1.5, 1.5);
   * ```
   */
  setSize(width: number, height: number = width): void {
    this.width = Math.max(0.01, width);
    this.height = Math.max(0.01, height);
    this.radius = (width + height) / 4; // Average radius
    this.cachedTransform = null;
    this.markDirty();
  }

  /**
   * Orients the light to look in a specific direction.
   *
   * @param direction - Direction to look (will be normalized)
   * @param up - Up vector (default: world up)
   *
   * @example
   * ```typescript
   * // Point light downward
   * light.lookAt(new Vector3(0, -1, 0));
   *
   * // Look at a target
   * const toTarget = target.sub(light.position);
   * light.lookAt(toTarget);
   * ```
   */
  lookAt(direction: Vector3, up: Vector3 = new Vector3(0, 1, 0)): void {
    const forward = direction.normalize();
    const right = up.cross(forward).normalize();
    const actualUp = forward.cross(right);

    this.rotation = Quaternion.fromRotationMatrix(
      new Matrix4().setFromBasis(right, actualUp, forward)
    );

    this.cachedTransform = null;
    this.cachedNormal = null;
    this.markDirty();
  }

  /**
   * Gets the world transform matrix for this area light.
   *
   * @returns Transform matrix (position + rotation + scale)
   *
   * @example
   * ```typescript
   * const transform = light.getTransform();
   * const corners = light.getCorners(transform);
   * ```
   */
  getTransform(): Matrix4 {
    if (this.cachedTransform && !this.isDirty()) {
      return this.cachedTransform;
    }

    this.cachedTransform = Matrix4.compose(
      this.position,
      this.rotation,
      new Vector3(this.width, this.height, 1)
    );

    return this.cachedTransform;
  }

  /**
   * Gets the normal direction in world space.
   *
   * @returns Normal vector (direction light is facing)
   *
   * @example
   * ```typescript
   * const normal = light.getNormal();
   * const facingCamera = normal.dot(cameraForward) < 0;
   * ```
   */
  getNormal(): Vector3 {
    if (this.cachedNormal && !this.isDirty()) {
      return this.cachedNormal;
    }

    // Transform forward vector by rotation
    this.cachedNormal = this.rotation.rotateVector(new Vector3(0, 0, -1));
    return this.cachedNormal;
  }

  /**
   * Gets the four corners of a rectangular area light in world space.
   *
   * @returns Array of 4 corner positions
   *
   * @example
   * ```typescript
   * const corners = light.getCorners();
   * // corners[0] = bottom-left
   * // corners[1] = bottom-right
   * // corners[2] = top-right
   * // corners[3] = top-left
   * ```
   */
  getCorners(): Vector3[] {
    const transform = this.getTransform();
    const halfWidth = 0.5;
    const halfHeight = 0.5;

    const localCorners = [
      new Vector3(-halfWidth, -halfHeight, 0),
      new Vector3( halfWidth, -halfHeight, 0),
      new Vector3( halfWidth,  halfHeight, 0),
      new Vector3(-halfWidth,  halfHeight, 0),
    ];

    return localCorners.map(corner => transform.transformPoint(corner));
  }

  /**
   * Calculates the solid angle subtended by the area light at a point.
   * Used for physically-based lighting calculations.
   *
   * @param point - Point in world space
   * @returns Solid angle in steradians
   *
   * @example
   * ```typescript
   * const solidAngle = light.calculateSolidAngle(surfacePoint);
   * const irradiance = light.intensity * solidAngle;
   * ```
   */
  calculateSolidAngle(point: Vector3): number {
    const toLight = this.position.sub(point);
    const distance = toLight.length();
    const normal = this.getNormal();

    // Simple approximation for now
    // More accurate calculation would integrate over the area
    let area: number;

    switch (this.shape) {
      case AreaLightShape.Rectangle:
        area = this.width * this.height;
        break;
      case AreaLightShape.Disc:
        area = Math.PI * this.radius * this.radius;
        break;
      case AreaLightShape.Sphere:
        area = 4 * Math.PI * this.radius * this.radius;
        break;
      case AreaLightShape.Tube:
        area = 2 * Math.PI * this.radius * this.length;
        break;
      default:
        area = this.width * this.height;
    }

    // Projected solid angle
    const direction = toLight.normalize();
    const cosTheta = Math.abs(direction.dot(normal));
    const distanceSquared = distance * distance;

    return (area * cosTheta) / distanceSquared;
  }

  /**
   * Checks if a point is on the front-facing side of the light.
   *
   * @param point - Point in world space
   * @returns True if point is on the front side
   *
   * @example
   * ```typescript
   * if (light.isFrontFacing(surfacePoint)) {
   *   // Apply lighting
   * }
   * ```
   */
  isFrontFacing(point: Vector3): boolean {
    if (this.emissionMode === EmissionMode.DoubleSided) {
      return true;
    }

    const toPoint = point.sub(this.position);
    const normal = this.getNormal();
    return toPoint.dot(normal) > 0;
  }

  /**
   * Gets the luminous flux (power) in lumens.
   *
   * @returns Luminous flux in lumens
   *
   * @example
   * ```typescript
   * const lumens = light.getLuminousFlux();
   * console.log(`Area light: ${lumens} lumens`);
   * ```
   */
  getLuminousFlux(): number {
    let area: number;

    switch (this.shape) {
      case AreaLightShape.Rectangle:
        area = this.width * this.height;
        break;
      case AreaLightShape.Disc:
        area = Math.PI * this.radius * this.radius;
        break;
      case AreaLightShape.Sphere:
        area = 4 * Math.PI * this.radius * this.radius;
        break;
      case AreaLightShape.Tube:
        area = 2 * Math.PI * this.radius * this.length;
        break;
      default:
        area = 1.0;
    }

    if (this.unit === LightUnit.Nits) {
      // Convert nits (cd/m²) to lumens
      // Lumens = Nits * Area * π
      return this.intensity * area * Math.PI;
    }

    return this.intensity;
  }

  /**
   * Gets the bounding volume for this light.
   *
   * @returns Bounding box containing the light's influence
   *
   * @example
   * ```typescript
   * const bounds = light.getBoundingVolume();
   * if (frustum.intersectsBox(bounds)) {
   *   // Light is visible
   * }
   * ```
   */
  getBoundingVolume(): Box3 {
    const corners = this.getCorners();
    const box = Box3.empty();

    for (const corner of corners) {
      box.expandByPoint(corner);
    }

    // Expand by range for light influence
    box.expandByScalar(this.range);

    return box;
  }

  /**
   * Packs this light's data into a GPU buffer.
   *
   * Layout (24 floats):
   * - [0-2]: Position (xyz)
   * - [3]: Type (3 = area)
   * - [4-6]: Normal direction (xyz)
   * - [7]: Intensity
   * - [8-10]: Color (rgb)
   * - [11]: Width
   * - [12]: Height
   * - [13]: Shape
   * - [14]: Emission mode
   * - [15]: Range
   * - [16-19]: Right vector (for orientation)
   * - [20-23]: Up vector (for orientation)
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
    buffer[offset++] = 3; // Type: area

    // Normal and intensity
    const normal = this.getNormal();
    buffer[offset++] = normal.x;
    buffer[offset++] = normal.y;
    buffer[offset++] = normal.z;
    buffer[offset++] = this.getEffectiveIntensity();

    // Color and dimensions
    const color = this.getEffectiveColor();
    buffer[offset++] = color.r;
    buffer[offset++] = color.g;
    buffer[offset++] = color.b;
    buffer[offset++] = this.width;

    // Shape and emission
    buffer[offset++] = this.height;
    buffer[offset++] = this.getShapeValue();
    buffer[offset++] = this.emissionMode === EmissionMode.DoubleSided ? 1 : 0;
    buffer[offset++] = this.range;

    // Orientation vectors (right and up in world space)
    const right = this.rotation.rotateVector(new Vector3(1, 0, 0));
    const up = this.rotation.rotateVector(new Vector3(0, 1, 0));

    buffer[offset++] = right.x;
    buffer[offset++] = right.y;
    buffer[offset++] = right.z;
    buffer[offset++] = 0; // Padding

    buffer[offset++] = up.x;
    buffer[offset++] = up.y;
    buffer[offset++] = up.z;
    buffer[offset++] = this.emissionTexture.enabled ? 1 : 0;

    return offset;
  }

  /**
   * Gets numeric value for shape type (for GPU).
   */
  private getShapeValue(): number {
    switch (this.shape) {
      case AreaLightShape.Rectangle: return 0;
      case AreaLightShape.Disc: return 1;
      case AreaLightShape.Sphere: return 2;
      case AreaLightShape.Tube: return 3;
      default: return 0;
    }
  }

  /**
   * Updates light state.
   *
   * @param deltaTime - Time since last update in seconds
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    // Additional update logic for area light
  }

  /**
   * Clones this area light.
   *
   * @returns New AreaLight instance with same properties
   */
  clone(): AreaLight {
    const clone = new AreaLight(
      this.shape,
      this.position.clone(),
      this.width,
      this.height
    );

    clone.rotation = this.rotation.clone();
    clone.color = this.color.clone();
    clone.intensity = this.intensity;
    clone.unit = this.unit;
    clone.enabled = this.enabled;
    clone.priority = this.priority;
    clone.shadowConfig = { ...this.shadowConfig };
    clone.cullingMask = { ...this.cullingMask };
    clone.radius = this.radius;
    clone.length = this.length;
    clone.emissionMode = this.emissionMode;
    clone.ltcConfig = { ...this.ltcConfig };
    clone.emissionTexture = { ...this.emissionTexture };
    clone.range = this.range;

    return clone;
  }
}

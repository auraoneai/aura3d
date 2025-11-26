/**
 * @module Rendering/Lighting
 * @description
 * Spot light implementation for cone-shaped light sources with projective textures.
 * Combines directional and point light characteristics with angular attenuation.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Matrix4 } from '../../math/Matrix4';
import { Light, LightType, LightUnit } from './Light';
import { AttenuationModel } from './PointLight';
import { Logger } from '../../core/Logger';

const logger = Logger.create('SpotLight');

/**
 * Spot light angular falloff model.
 */
export enum AngularFalloffModel {
  /** Linear falloff from inner to outer angle */
  Linear = 'linear',
  /** Smooth (cosine-based) falloff */
  Smooth = 'smooth',
  /** Unity-style falloff */
  Unity = 'unity',
  /** Unreal-style IES profile approximation */
  IES = 'ies',
}

/**
 * Projective texture configuration for spot lights.
 */
export interface ProjectiveTexture {
  /** Whether projective texture is enabled */
  enabled: boolean;
  /** Texture ID for the projected image */
  textureId: number | null;
  /** Texture aspect ratio */
  aspectRatio: number;
  /** Texture intensity multiplier */
  intensity: number;
  /** Enable texture filtering */
  filter: boolean;
}

/**
 * Spot light class for cone-shaped light sources.
 *
 * Spot lights emit light in a cone from a point, similar to flashlights, stage lights,
 * or car headlights. They combine characteristics of both point and directional lights.
 *
 * Key features:
 * - Cone-shaped emission with inner and outer angles
 * - Position and direction control
 * - Range-based distance attenuation
 * - Angular attenuation for smooth edge falloff
 * - Projective texture support (gobo patterns)
 * - Single shadow map per light
 * - Physical units (Candela for directional intensity)
 *
 * @example
 * ```typescript
 * // Create a flashlight
 * const flashlight = new SpotLight();
 * flashlight.position = new Vector3(0, 1, 0);
 * flashlight.direction = new Vector3(0, -0.5, -1).normalize();
 * flashlight.setAngles(15, 25); // Inner and outer angles in degrees
 * flashlight.range = 20;
 * flashlight.setIntensity(1000, LightUnit.Candela);
 *
 * // Enable shadows
 * flashlight.setShadowsEnabled(true);
 * flashlight.shadowConfig.quality = ShadowQuality.High;
 *
 * // Add projective texture (gobo pattern)
 * flashlight.projectiveTexture.enabled = true;
 * flashlight.projectiveTexture.textureId = textureId;
 * ```
 */
export class SpotLight extends Light {
  /**
   * Light position in world space.
   */
  position: Vector3;

  /**
   * Light direction in world space (normalized).
   */
  direction: Vector3;

  /**
   * Maximum range of light influence.
   */
  range: number;

  /**
   * Inner cone angle in radians.
   * Light has full intensity within this angle.
   */
  innerAngle: number;

  /**
   * Outer cone angle in radians.
   * Light intensity falls to zero at this angle.
   */
  outerAngle: number;

  /**
   * Distance attenuation model.
   */
  attenuationModel: AttenuationModel;

  /**
   * Angular falloff model.
   */
  angularFalloffModel: AngularFalloffModel;

  /**
   * Radius of the light source for soft shadows.
   */
  sourceRadius: number;

  /**
   * Projective texture configuration.
   */
  projectiveTexture: ProjectiveTexture;

  /**
   * Aspect ratio for non-circular spot lights.
   */
  aspectRatio: number;

  /**
   * Cached projection matrix for shadow mapping.
   */
  private cachedProjectionMatrix: Matrix4 | null;

  /**
   * Cached view matrix.
   */
  private cachedViewMatrix: Matrix4 | null;

  /**
   * Creates a new SpotLight instance.
   *
   * @param position - Light position in world space
   * @param direction - Light direction (will be normalized)
   * @param color - Light color
   * @param intensity - Light intensity (in Candela when using physical units)
   * @param range - Maximum light range
   * @param outerAngle - Outer cone angle in degrees
   *
   * @example
   * ```typescript
   * // Default spotlight
   * const spot = new SpotLight();
   *
   * // Custom configuration
   * const stage = new SpotLight(
   *   new Vector3(0, 10, 0),
   *   new Vector3(0, -1, 0),
   *   new Color(1, 1, 1),
   *   5000,
   *   30,
   *   45
   * );
   * ```
   */
  constructor(
    position: Vector3 = new Vector3(0, 0, 0),
    direction: Vector3 = new Vector3(0, -1, 0),
    color: Color = new Color(1, 1, 1),
    intensity: number = 1000,
    range: number = 10,
    outerAngle: number = 45
  ) {
    super(LightType.Spot);

    this.position = position;
    this.direction = direction.normalize();
    this.color = color;
    this.intensity = intensity;
    this.unit = LightUnit.Candela;
    this.range = range;
    this.outerAngle = (outerAngle * Math.PI) / 180;
    this.innerAngle = this.outerAngle * 0.5; // Default inner angle is half of outer
    this.attenuationModel = AttenuationModel.InverseSquare;
    this.angularFalloffModel = AngularFalloffModel.Smooth;
    this.sourceRadius = 0.01;
    this.aspectRatio = 1.0;

    this.projectiveTexture = {
      enabled: false,
      textureId: null,
      aspectRatio: 1.0,
      intensity: 1.0,
      filter: true,
    };

    this.cachedProjectionMatrix = null;
    this.cachedViewMatrix = null;

    this.label = `SpotLight_${this.id}`;
  }

  /**
   * Sets the light position.
   *
   * @param position - New position in world space
   *
   * @example
   * ```typescript
   * light.setPosition(new Vector3(5, 3, 0));
   * ```
   */
  setPosition(position: Vector3): void {
    this.position = position;
    this.cachedViewMatrix = null;
    this.markDirty();
  }

  /**
   * Sets the light direction.
   *
   * @param direction - New direction (will be normalized)
   *
   * @example
   * ```typescript
   * light.setDirection(new Vector3(0, -1, -0.5));
   *
   * // Point light at target
   * const target = new Vector3(0, 0, 0);
   * light.setDirection(target.sub(light.position));
   * ```
   */
  setDirection(direction: Vector3): void {
    this.direction = direction.normalize();
    this.cachedViewMatrix = null;
    this.markDirty();
  }

  /**
   * Sets the cone angles for the spotlight.
   *
   * @param innerAngleDeg - Inner cone angle in degrees
   * @param outerAngleDeg - Outer cone angle in degrees
   *
   * @example
   * ```typescript
   * // Narrow beam (flashlight)
   * light.setAngles(10, 15);
   *
   * // Wide beam (stage light)
   * light.setAngles(30, 50);
   * ```
   */
  setAngles(innerAngleDeg: number, outerAngleDeg: number): void {
    this.innerAngle = Math.max(0, (innerAngleDeg * Math.PI) / 180);
    this.outerAngle = Math.max(this.innerAngle, (outerAngleDeg * Math.PI) / 180);
    this.cachedProjectionMatrix = null;
    this.markDirty();
  }

  /**
   * Sets the light range.
   *
   * @param range - Maximum light range
   *
   * @example
   * ```typescript
   * light.setRange(25);
   * ```
   */
  setRange(range: number): void {
    this.range = Math.max(0.1, range);
    this.cachedProjectionMatrix = null;
    this.markDirty();
  }

  /**
   * Calculates distance attenuation at a given distance.
   *
   * @param distance - Distance from light position
   * @returns Attenuation factor [0, 1]
   *
   * @example
   * ```typescript
   * const distAttenuation = light.calculateDistanceAttenuation(10);
   * ```
   */
  calculateDistanceAttenuation(distance: number): number {
    if (distance >= this.range) return 0;

    switch (this.attenuationModel) {
      case AttenuationModel.None:
        return 1.0;

      case AttenuationModel.Linear:
        return Math.max(0, 1.0 - distance / this.range);

      case AttenuationModel.InverseSquare: {
        const distanceSquared = distance * distance;
        const rangeSquared = this.range * this.range;
        const attenuation = 1.0 / (1.0 + distanceSquared);
        const smoothCutoff = Math.max(0, 1.0 - (distanceSquared / rangeSquared));
        return attenuation * smoothCutoff * smoothCutoff;
      }

      case AttenuationModel.Unity: {
        const distanceRatio = distance / this.range;
        const distanceRatioSquared = distanceRatio * distanceRatio;
        const attenuation = 1.0 / (1.0 + 25.0 * distanceRatioSquared);
        const smoothFactor = Math.max(0, 1.0 - distanceRatioSquared);
        return attenuation * smoothFactor * smoothFactor;
      }

      case AttenuationModel.Unreal: {
        const distanceSquared = distance * distance;
        const numerator = Math.max(0, 1.0 - Math.pow(distance / this.range, 4));
        const denominator = distanceSquared + 1.0;
        return (numerator * numerator) / denominator;
      }

      default:
        return 1.0;
    }
  }

  /**
   * Calculates angular attenuation based on angle from light direction.
   *
   * @param cosAngle - Cosine of angle from light direction
   * @returns Attenuation factor [0, 1]
   *
   * @example
   * ```typescript
   * const toPoint = point.sub(light.position).normalize();
   * const cosAngle = light.direction.dot(toPoint);
   * const angularAttenuation = light.calculateAngularAttenuation(cosAngle);
   * ```
   */
  calculateAngularAttenuation(cosAngle: number): number {
    const cosInner = Math.cos(this.innerAngle);
    const cosOuter = Math.cos(this.outerAngle);

    // Outside cone
    if (cosAngle < cosOuter) return 0;

    // Inside inner cone (full intensity)
    if (cosAngle > cosInner) return 1;

    // Between inner and outer cone
    const t = (cosAngle - cosOuter) / (cosInner - cosOuter);

    switch (this.angularFalloffModel) {
      case AngularFalloffModel.Linear:
        return t;

      case AngularFalloffModel.Smooth:
        // Smoothstep
        return t * t * (3 - 2 * t);

      case AngularFalloffModel.Unity:
        // Unity's falloff
        return t * t;

      case AngularFalloffModel.IES:
        // IES profile approximation (smooth bell curve)
        return Math.pow(t, 2.5);

      default:
        return t;
    }
  }

  /**
   * Calculates total light attenuation at a world position.
   *
   * @param worldPosition - Position in world space
   * @returns Total attenuation factor [0, 1]
   *
   * @example
   * ```typescript
   * const attenuation = light.calculateAttenuation(surfacePosition);
   * const contribution = light.intensity * attenuation;
   * ```
   */
  calculateAttenuation(worldPosition: Vector3): number {
    const toPoint = worldPosition.sub(this.position);
    const distance = toPoint.length();
    const direction = toPoint.scale(1.0 / distance);

    const distanceAttenuation = this.calculateDistanceAttenuation(distance);
    const cosAngle = this.direction.dot(direction);
    const angularAttenuation = this.calculateAngularAttenuation(cosAngle);

    return distanceAttenuation * angularAttenuation;
  }

  /**
   * Gets the view matrix for this spotlight.
   * Used for shadow mapping and projective textures.
   *
   * @returns View matrix
   *
   * @example
   * ```typescript
   * const viewMatrix = light.getViewMatrix();
   * const viewProjection = projectionMatrix.multiply(viewMatrix);
   * ```
   */
  getViewMatrix(): Matrix4 {
    if (this.cachedViewMatrix && !this.isDirty()) {
      return this.cachedViewMatrix;
    }

    const target = this.position.add(this.direction);
    const up = Math.abs(this.direction.y) > 0.999
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 1, 0);

    this.cachedViewMatrix = Matrix4.lookAt(this.position, target, up);
    return this.cachedViewMatrix;
  }

  /**
   * Gets the projection matrix for this spotlight.
   * Used for shadow mapping and projective textures.
   *
   * @returns Projection matrix
   *
   * @example
   * ```typescript
   * const projMatrix = light.getProjectionMatrix();
   * const viewProj = projMatrix.multiply(light.getViewMatrix());
   * ```
   */
  getProjectionMatrix(): Matrix4 {
    if (this.cachedProjectionMatrix && !this.isDirty()) {
      return this.cachedProjectionMatrix;
    }

    // Use outer angle for FOV
    const fov = this.outerAngle * 2;
    const near = this.shadowConfig.nearPlane;
    const far = Math.min(this.range, this.shadowConfig.farPlane);

    this.cachedProjectionMatrix = Matrix4.perspective(
      fov,
      this.aspectRatio,
      near,
      far
    );

    return this.cachedProjectionMatrix;
  }

  /**
   * Gets the view-projection matrix for this spotlight.
   *
   * @returns Combined view-projection matrix
   */
  getViewProjectionMatrix(): Matrix4 {
    const projection = this.getProjectionMatrix();
    const view = this.getViewMatrix();
    return projection.multiply(view);
  }

  /**
   * Gets the bounding volume for this light.
   * Returns a cone-shaped bounding volume (approximated as box).
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
    // Calculate cone endpoint
    const endpoint = this.position.add(this.direction.scale(this.range));

    // Calculate cone radius at endpoint
    const endRadius = Math.tan(this.outerAngle) * this.range;

    // Create axis-aligned bounding box
    const min = new Vector3(
      Math.min(this.position.x, endpoint.x - endRadius),
      Math.min(this.position.y, endpoint.y - endRadius),
      Math.min(this.position.z, endpoint.z - endRadius)
    );

    const max = new Vector3(
      Math.max(this.position.x, endpoint.x + endRadius),
      Math.max(this.position.y, endpoint.y + endRadius),
      Math.max(this.position.z, endpoint.z + endRadius)
    );

    return new Box3(min, max);
  }

  /**
   * Packs this light's data into a GPU buffer.
   *
   * Layout (20 floats):
   * - [0-2]: Position (xyz)
   * - [3]: Type (2 = spot)
   * - [4-6]: Direction (xyz)
   * - [7]: Intensity
   * - [8-10]: Color (rgb)
   * - [11]: Range
   * - [12]: Inner angle (cosine)
   * - [13]: Outer angle (cosine)
   * - [14]: Attenuation model
   * - [15]: Angular falloff model
   * - [16-19]: Shadow/texture parameters
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
    buffer[offset++] = 2; // Type: spot

    // Direction and intensity
    buffer[offset++] = this.direction.x;
    buffer[offset++] = this.direction.y;
    buffer[offset++] = this.direction.z;
    buffer[offset++] = this.getEffectiveIntensity();

    // Color and range
    const color = this.getEffectiveColor();
    buffer[offset++] = color.r;
    buffer[offset++] = color.g;
    buffer[offset++] = color.b;
    buffer[offset++] = this.range;

    // Angular parameters (store as cosine for GPU efficiency)
    buffer[offset++] = Math.cos(this.innerAngle);
    buffer[offset++] = Math.cos(this.outerAngle);
    buffer[offset++] = this.getAttenuationModelValue();
    buffer[offset++] = this.getAngularFalloffValue();

    // Shadow and texture parameters
    buffer[offset++] = this.castsShadows() ? 1 : 0;
    buffer[offset++] = this.projectiveTexture.enabled ? 1 : 0;
    buffer[offset++] = this.shadowConfig.bias;
    buffer[offset++] = this.shadowConfig.normalBias;

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
   * Gets numeric value for angular falloff model (for GPU).
   */
  private getAngularFalloffValue(): number {
    switch (this.angularFalloffModel) {
      case AngularFalloffModel.Linear: return 0;
      case AngularFalloffModel.Smooth: return 1;
      case AngularFalloffModel.Unity: return 2;
      case AngularFalloffModel.IES: return 3;
      default: return 1;
    }
  }

  /**
   * Updates light state.
   *
   * @param deltaTime - Time since last update in seconds
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    // Additional update logic for spot light
  }

  /**
   * Clones this spot light.
   *
   * @returns New SpotLight instance with same properties
   */
  override clone(): SpotLight {
    const clone = new SpotLight(
      this.position.clone(),
      this.direction.clone(),
      this.color.clone(),
      this.intensity,
      this.range,
      (this.outerAngle * 180) / Math.PI
    );

    clone.unit = this.unit;
    clone.enabled = this.enabled;
    clone.priority = this.priority;
    clone.shadowConfig = { ...this.shadowConfig };
    clone.cullingMask = { ...this.cullingMask };
    clone.innerAngle = this.innerAngle;
    clone.attenuationModel = this.attenuationModel;
    clone.angularFalloffModel = this.angularFalloffModel;
    clone.sourceRadius = this.sourceRadius;
    clone.projectiveTexture = { ...this.projectiveTexture };
    clone.aspectRatio = this.aspectRatio;

    return clone;
  }
}

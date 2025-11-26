/**
 * @module Rendering/Lighting
 * @description
 * Abstract base class for all light types in the G3D rendering engine.
 * Provides common properties and functionality for light sources.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Matrix4 } from '../../math/Matrix4';
import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';

const logger = Logger.create('Light');

/**
 * Physical light unit types for realistic lighting calculations.
 */
export enum LightUnit {
  /** Lumens - Total luminous flux */
  Lumens = 'lumens',
  /** Candela - Luminous intensity (lumens per steradian) */
  Candela = 'candela',
  /** Lux - Illuminance (lumens per square meter) */
  Lux = 'lux',
  /** Nits - Luminance (candela per square meter) */
  Nits = 'nits',
  /** Unitless - Arbitrary intensity scale */
  Unitless = 'unitless',
}

/**
 * Shadow casting mode for lights.
 */
export enum ShadowMode {
  /** No shadows */
  None = 'none',
  /** Hard shadows */
  Hard = 'hard',
  /** Soft shadows with PCF filtering */
  Soft = 'soft',
  /** High-quality soft shadows with PCSS */
  Verysoft = 'verysoft',
}

/**
 * Shadow quality settings.
 */
export enum ShadowQuality {
  /** Low resolution shadows (512x512) */
  Low = 'low',
  /** Medium resolution shadows (1024x1024) */
  Medium = 'medium',
  /** High resolution shadows (2048x2048) */
  High = 'high',
  /** Ultra resolution shadows (4096x4096) */
  Ultra = 'ultra',
}

/**
 * Shadow filter types.
 */
export enum ShadowFilter {
  /** Point sampling (no filtering) */
  Point = 'point',
  /** Percentage Closer Filtering */
  PCF = 'pcf',
  /** Percentage Closer Soft Shadows */
  PCSS = 'pcss',
  /** Variance Shadow Maps */
  VSM = 'vsm',
  /** Exponential Shadow Maps */
  ESM = 'esm',
}

/**
 * Light culling mask configuration.
 * Uses bitmasking for efficient layer-based culling.
 */
export interface CullingMask {
  /** Bitmask of enabled layers (32 layers supported) */
  layers: number;
  /** Whether this light affects all layers */
  affectsAll: boolean;
}

/**
 * Shadow configuration for a light.
 */
export interface ShadowConfig {
  /** Shadow casting mode */
  mode: ShadowMode;
  /** Shadow quality/resolution */
  quality: ShadowQuality;
  /** Shadow filter type */
  filter: ShadowFilter;
  /** Near plane for shadow projection */
  nearPlane: number;
  /** Far plane for shadow projection */
  farPlane: number;
  /** Bias to prevent shadow acne */
  bias: number;
  /** Normal offset bias for improved quality */
  normalBias: number;
  /** Shadow strength/opacity [0, 1] */
  strength: number;
  /** Number of PCF samples */
  pcfSamples: number;
  /** PCSS blocker search radius */
  blockerSearchRadius: number;
  /** PCSS penumbra size */
  penumbraSize: number;
  /** Enable temporal stabilization */
  stabilize: boolean;
}

/**
 * Light type enumeration.
 */
export enum LightType {
  Directional = 'directional',
  Point = 'point',
  Spot = 'spot',
  Area = 'area',
  Probe = 'probe',
}

/**
 * Abstract base class for all light sources in the rendering engine.
 *
 * Provides common functionality for:
 * - Light color and intensity with physical units
 * - Shadow casting configuration
 * - Layer-based culling masks
 * - Bounding volume calculations for efficient culling
 * - GPU buffer data packing
 *
 * @example
 * ```typescript
 * // Extending Light to create a custom light type
 * class CustomLight extends Light {
 *   constructor() {
 *     super(LightType.Point);
 *     this.setIntensity(1000, LightUnit.Lumens);
 *     this.color = new Color(1, 0.95, 0.8); // Warm white
 *   }
 *
 *   getBoundingVolume(): Box3 | Sphere {
 *     return new Sphere(this.position, this.range);
 *   }
 *
 *   packGPUData(buffer: Float32Array, offset: number): number {
 *     // Pack light-specific data
 *     return offset;
 *   }
 * }
 * ```
 */
export abstract class Light {
  /**
   * Unique identifier for this light instance.
   */
  readonly id: number;

  /**
   * Light type identifier.
   */
  readonly type: LightType;

  /**
   * Light color in linear RGB space.
   * Default is pure white (1, 1, 1).
   */
  color: Color;

  /**
   * Light intensity value.
   * Interpretation depends on the unit type.
   */
  intensity: number;

  /**
   * Physical unit for intensity measurement.
   */
  unit: LightUnit;

  /**
   * Whether this light is currently enabled.
   */
  enabled: boolean;

  /**
   * Shadow configuration for this light.
   */
  shadowConfig: ShadowConfig;

  /**
   * Culling mask for layer-based visibility.
   */
  cullingMask: CullingMask;

  /**
   * Render priority for sorting.
   * Higher priority lights are processed first.
   */
  priority: number;

  /**
   * Whether this light should affect specular reflections.
   */
  affectsSpecular: boolean;

  /**
   * Whether this light should affect diffuse lighting.
   */
  affectsDiffuse: boolean;

  /**
   * Light temperature in Kelvin for color temperature simulation.
   * Values: 1000K (warm) to 10000K (cool).
   * If set, overrides the color property.
   */
  temperature: number | null;

  /**
   * Indirect lighting multiplier for GI systems.
   */
  indirectMultiplier: number;

  /**
   * Volumetric scattering coefficient.
   * Controls how much this light contributes to volumetric fog.
   */
  volumetricScattering: number;

  /**
   * Debug label for this light.
   */
  label: string;

  /**
   * Whether this light has been modified and needs GPU update.
   */
  protected dirty: boolean;

  /**
   * Last frame this light's shadow was updated.
   */
  protected lastShadowUpdateFrame: number;

  /**
   * Creates a new Light instance.
   *
   * @param type - Type of light
   *
   * @example
   * ```typescript
   * // In a derived class
   * constructor() {
   *   super(LightType.Point);
   *   this.setIntensity(800, LightUnit.Lumens);
   * }
   * ```
   */
  constructor(type: LightType) {
    this.id = IdGenerator.generate();
    this.type = type;
    this.color = new Color(1, 1, 1);
    this.intensity = 1.0;
    this.unit = LightUnit.Unitless;
    this.enabled = true;
    this.priority = 0;
    this.affectsSpecular = true;
    this.affectsDiffuse = true;
    this.temperature = null;
    this.indirectMultiplier = 1.0;
    this.volumetricScattering = 1.0;
    this.label = `Light_${this.id}`;
    this.dirty = true;
    this.lastShadowUpdateFrame = -1;

    // Default shadow configuration
    this.shadowConfig = {
      mode: ShadowMode.None,
      quality: ShadowQuality.Medium,
      filter: ShadowFilter.PCF,
      nearPlane: 0.1,
      farPlane: 100.0,
      bias: 0.0001,
      normalBias: 0.001,
      strength: 1.0,
      pcfSamples: 16,
      blockerSearchRadius: 2.0,
      penumbraSize: 1.0,
      stabilize: true,
    };

    // Default culling mask (all layers)
    this.cullingMask = {
      layers: 0xFFFFFFFF,
      affectsAll: true,
    };
  }

  /**
   * Sets the light intensity with a specific unit.
   *
   * @param intensity - Intensity value
   * @param unit - Physical unit for the intensity
   *
   * @example
   * ```typescript
   * // Directional light (sun)
   * light.setIntensity(100000, LightUnit.Lux);
   *
   * // Point light (light bulb)
   * light.setIntensity(800, LightUnit.Lumens);
   *
   * // Spot light (flashlight)
   * light.setIntensity(1000, LightUnit.Candela);
   * ```
   */
  setIntensity(intensity: number, unit: LightUnit): void {
    this.intensity = intensity;
    this.unit = unit;
    this.markDirty();
  }

  /**
   * Sets the light color from a temperature in Kelvin.
   *
   * @param kelvin - Temperature in Kelvin (1000-10000)
   *
   * @example
   * ```typescript
   * light.setTemperature(2700); // Warm white (incandescent)
   * light.setTemperature(5500); // Daylight
   * light.setTemperature(6500); // Cool white (overcast)
   * ```
   */
  setTemperature(kelvin: number): void {
    this.temperature = Math.max(1000, Math.min(10000, kelvin));
    this.color = this.kelvinToColor(this.temperature);
    this.markDirty();
  }

  /**
   * Enables or disables shadow casting for this light.
   *
   * @param enabled - Whether to cast shadows
   * @param mode - Shadow mode to use when enabled
   *
   * @example
   * ```typescript
   * light.setShadowsEnabled(true, ShadowMode.Soft);
   * light.shadowConfig.quality = ShadowQuality.High;
   * ```
   */
  setShadowsEnabled(enabled: boolean, mode: ShadowMode = ShadowMode.Soft): void {
    this.shadowConfig.mode = enabled ? mode : ShadowMode.None;
    this.markDirty();
  }

  /**
   * Sets the culling layer mask for this light.
   *
   * @param layers - Bitmask of layers this light affects
   *
   * @example
   * ```typescript
   * // Affect only layer 0 and 1
   * light.setCullingMask((1 << 0) | (1 << 1));
   *
   * // Affect all layers
   * light.setCullingMask(0xFFFFFFFF);
   * ```
   */
  setCullingMask(layers: number): void {
    this.cullingMask.layers = layers;
    this.cullingMask.affectsAll = (layers === 0xFFFFFFFF);
    this.markDirty();
  }

  /**
   * Tests if this light affects objects on a specific layer.
   *
   * @param layer - Layer index (0-31)
   * @returns True if light affects this layer
   *
   * @example
   * ```typescript
   * if (light.affectsLayer(0)) {
   *   // Light affects objects on layer 0
   * }
   * ```
   */
  affectsLayer(layer: number): boolean {
    if (this.cullingMask.affectsAll) return true;
    return (this.cullingMask.layers & (1 << layer)) !== 0;
  }

  /**
   * Gets the effective light color including temperature.
   *
   * @returns Final light color
   *
   * @example
   * ```typescript
   * const color = light.getEffectiveColor();
   * const finalColor = color.scale(light.getEffectiveIntensity());
   * ```
   */
  getEffectiveColor(): Color {
    return this.color.clone();
  }

  /**
   * Gets the effective intensity in a standardized unit.
   * Converts from physical units to a common scale for rendering.
   *
   * @returns Effective intensity value
   *
   * @example
   * ```typescript
   * const intensity = light.getEffectiveIntensity();
   * const contribution = intensity * attenuation;
   * ```
   */
  getEffectiveIntensity(): number {
    // Convert to unitless scale for rendering
    switch (this.unit) {
      case LightUnit.Lumens:
        // Lumens to approximate unitless (for point lights)
        return this.intensity / (4 * Math.PI);
      case LightUnit.Candela:
        // Candela is already intensity per steradian
        return this.intensity;
      case LightUnit.Lux:
        // Lux is already illuminance
        return this.intensity;
      case LightUnit.Nits:
        // Nits to unitless (for area lights)
        return this.intensity / Math.PI;
      case LightUnit.Unitless:
      default:
        return this.intensity;
    }
  }

  /**
   * Checks if this light casts shadows.
   *
   * @returns True if shadows are enabled
   */
  castsShadows(): boolean {
    return this.shadowConfig.mode !== ShadowMode.None;
  }

  /**
   * Checks if this light needs shadow update this frame.
   *
   * @param frameIndex - Current frame index
   * @returns True if shadow needs updating
   */
  needsShadowUpdate(frameIndex: number): boolean {
    if (!this.castsShadows()) return false;
    if (this.dirty) return true;
    return this.lastShadowUpdateFrame !== frameIndex;
  }

  /**
   * Marks shadow as updated for this frame.
   *
   * @param frameIndex - Current frame index
   */
  markShadowUpdated(frameIndex: number): void {
    this.lastShadowUpdateFrame = frameIndex;
  }

  /**
   * Marks this light as dirty (needs GPU update).
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Marks this light as clean (GPU data is up to date).
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * Checks if this light is dirty and needs update.
   *
   * @returns True if dirty
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Converts color temperature (Kelvin) to RGB color.
   * Based on Tanner Helland's algorithm.
   *
   * @param kelvin - Temperature in Kelvin
   * @returns RGB color
   */
  protected kelvinToColor(kelvin: number): Color {
    // Clamp to valid range
    const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;

    let r: number, g: number, b: number;

    // Calculate red
    if (temp <= 66) {
      r = 1.0;
    } else {
      r = temp - 60;
      r = 329.698727446 * Math.pow(r, -0.1332047592);
      r = Math.max(0, Math.min(255, r)) / 255;
    }

    // Calculate green
    if (temp <= 66) {
      g = temp;
      g = 99.4708025861 * Math.log(g) - 161.1195681661;
      g = Math.max(0, Math.min(255, g)) / 255;
    } else {
      g = temp - 60;
      g = 288.1221695283 * Math.pow(g, -0.0755148492);
      g = Math.max(0, Math.min(255, g)) / 255;
    }

    // Calculate blue
    if (temp >= 66) {
      b = 1.0;
    } else if (temp <= 19) {
      b = 0.0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
      b = Math.max(0, Math.min(255, b)) / 255;
    }

    return new Color(r, g, b);
  }

  /**
   * Gets the bounding volume for this light in world space.
   * Used for frustum culling and spatial queries.
   *
   * @returns Bounding box or sphere containing the light's influence
   *
   * @example
   * ```typescript
   * const bounds = light.getBoundingVolume();
   * if (frustum.intersects(bounds)) {
   *   // Light is visible, include in rendering
   * }
   * ```
   */
  abstract getBoundingVolume(): Box3 | Sphere;

  /**
   * Packs this light's data into a GPU buffer.
   *
   * @param buffer - Target buffer
   * @param offset - Offset in floats
   * @returns New offset after packing
   *
   * @example
   * ```typescript
   * const buffer = new Float32Array(256);
   * let offset = 0;
   * offset = light.packGPUData(buffer, offset);
   * ```
   */
  abstract packGPUData(buffer: Float32Array, offset: number): number;

  /**
   * Updates light state.
   * Called once per frame for animated or dynamic lights.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * // Override in derived class for animated lights
   * update(deltaTime: number): void {
   *   super.update(deltaTime);
   *   this.intensity = Math.sin(Time.elapsed) * 100 + 500;
   * }
   * ```
   */
  update(deltaTime: number): void {
    // Override in derived classes for dynamic behavior
  }

  /**
   * Clones this light.
   *
   * @returns New light instance with same properties
   */
  abstract clone(): Light;
}

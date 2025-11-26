/**
 * LightingPresetManager - Lighting preset system for product visualization
 *
 * @example
 * ```typescript
 * const lighting = new LightingPresetManager(scene);
 *
 * // Apply preset
 * await lighting.applyPreset('studio');
 *
 * // Create custom preset
 * lighting.createCustomPreset('myPreset', {
 *   ambient: { color: [1, 1, 1], intensity: 0.3 },
 *   key: { color: [1, 0.95, 0.9], intensity: 1.5, position: [2, 3, 2] },
 *   fill: { color: [0.9, 0.95, 1], intensity: 0.5, position: [-2, 1, 1] },
 *   rim: { color: [1, 1, 1], intensity: 0.8, position: [0, 2, -3] },
 *   environmentMap: 'path/to/hdri.hdr'
 * });
 *
 * // Transition between presets
 * await lighting.transitionToPreset('outdoor', 1.0);
 * ```
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';

export interface LightConfig {
  color: [number, number, number];
  intensity: number;
  position?: [number, number, number];
  direction?: [number, number, number];
}

export interface LightingPresetData {
  ambient?: LightConfig;
  key?: LightConfig;
  fill?: LightConfig;
  rim?: LightConfig;
  back?: LightConfig;
  environmentMap?: string;
  environmentIntensity?: number;
  shadowEnabled?: boolean;
  shadowSoftness?: number;
}

export type PresetName = 'studio' | 'outdoor' | 'soft' | 'dramatic' | 'neutral';

/**
 * Light instance in the scene
 */
interface SceneLight {
  type: 'ambient' | 'directional' | 'point';
  color: Color;
  intensity: number;
  position?: Vector3;
  direction?: Vector3;
  castShadow?: boolean;
}

/**
 * LightingPresetManager manages lighting configurations for product visualization
 */
export class LightingPresetManager {
  private _currentPreset: string | null;
  private _lights: Map<string, SceneLight>;
  private _presets: Map<string, LightingPresetData>;
  private _customPresets: Map<string, LightingPresetData>;
  private _transitionActive: boolean;
  private _environmentMap: string | null;
  private _environmentIntensity: number;

  constructor() {
    this._currentPreset = null;
    this._lights = new Map();
    this._presets = new Map();
    this._customPresets = new Map();
    this._transitionActive = false;
    this._environmentMap = null;
    this._environmentIntensity = 1.0;

    this._initializePresets();
  }

  /**
   * Initialize built-in lighting presets
   */
  private _initializePresets(): void {
    // Studio lighting - Classic 3-point setup
    this._presets.set('studio', {
      ambient: {
        color: [1, 1, 1],
        intensity: 0.2
      },
      key: {
        color: [1, 0.95, 0.9],
        intensity: 1.5,
        position: [2, 3, 2]
      },
      fill: {
        color: [0.9, 0.95, 1],
        intensity: 0.5,
        position: [-2, 1, 1]
      },
      rim: {
        color: [1, 1, 1],
        intensity: 0.8,
        position: [0, 2, -3]
      },
      shadowEnabled: true,
      shadowSoftness: 0.5
    });

    // Outdoor lighting - Natural daylight
    this._presets.set('outdoor', {
      ambient: {
        color: [0.53, 0.81, 0.92],
        intensity: 0.4
      },
      key: {
        color: [1, 0.98, 0.95],
        intensity: 1.8,
        position: [3, 5, 2]
      },
      fill: {
        color: [0.6, 0.75, 0.9],
        intensity: 0.6,
        position: [-1, 0.5, 0.5]
      },
      environmentIntensity: 1.2,
      shadowEnabled: true,
      shadowSoftness: 0.3
    });

    // Soft lighting - Diffused, even illumination
    this._presets.set('soft', {
      ambient: {
        color: [1, 1, 1],
        intensity: 0.5
      },
      key: {
        color: [1, 0.98, 0.96],
        intensity: 0.8,
        position: [1, 2, 1]
      },
      fill: {
        color: [0.96, 0.98, 1],
        intensity: 0.8,
        position: [-1, 2, 1]
      },
      back: {
        color: [1, 1, 1],
        intensity: 0.4,
        position: [0, 1, -2]
      },
      shadowEnabled: false,
      shadowSoftness: 1.0
    });

    // Dramatic lighting - High contrast
    this._presets.set('dramatic', {
      ambient: {
        color: [0.2, 0.2, 0.3],
        intensity: 0.05
      },
      key: {
        color: [1, 0.9, 0.8],
        intensity: 2.5,
        position: [3, 4, 1]
      },
      rim: {
        color: [0.8, 0.9, 1],
        intensity: 1.2,
        position: [-2, 1, -2]
      },
      shadowEnabled: true,
      shadowSoftness: 0.1
    });

    // Neutral lighting - Balanced, true-to-color
    this._presets.set('neutral', {
      ambient: {
        color: [1, 1, 1],
        intensity: 0.3
      },
      key: {
        color: [1, 1, 1],
        intensity: 1.0,
        position: [2, 3, 2]
      },
      fill: {
        color: [1, 1, 1],
        intensity: 0.6,
        position: [-2, 1, 1]
      },
      back: {
        color: [1, 1, 1],
        intensity: 0.3,
        position: [0, 2, -2]
      },
      shadowEnabled: true,
      shadowSoftness: 0.5
    });
  }

  /**
   * Apply a lighting preset
   * @param presetName - Name of the preset to apply
   * @returns Promise that resolves when preset is applied
   */
  public async applyPreset(presetName: PresetName | string): Promise<void> {
    const preset = this._presets.get(presetName) || this._customPresets.get(presetName);

    if (!preset) {
      throw new Error(`Lighting preset "${presetName}" not found`);
    }

    // Clear existing lights
    this._lights.clear();

    // Apply ambient light
    if (preset.ambient) {
      this._lights.set('ambient', {
        type: 'ambient',
        color: new Color(preset.ambient.color[0], preset.ambient.color[1], preset.ambient.color[2]),
        intensity: preset.ambient.intensity
      });
    }

    // Apply key light
    if (preset.key) {
      this._lights.set('key', {
        type: 'directional',
        color: new Color(preset.key.color[0], preset.key.color[1], preset.key.color[2]),
        intensity: preset.key.intensity,
        position: preset.key.position
          ? new Vector3(preset.key.position[0], preset.key.position[1], preset.key.position[2])
          : new Vector3(2, 3, 2),
        castShadow: preset.shadowEnabled ?? true
      });
    }

    // Apply fill light
    if (preset.fill) {
      this._lights.set('fill', {
        type: 'directional',
        color: new Color(preset.fill.color[0], preset.fill.color[1], preset.fill.color[2]),
        intensity: preset.fill.intensity,
        position: preset.fill.position
          ? new Vector3(preset.fill.position[0], preset.fill.position[1], preset.fill.position[2])
          : new Vector3(-2, 1, 1)
      });
    }

    // Apply rim light
    if (preset.rim) {
      this._lights.set('rim', {
        type: 'directional',
        color: new Color(preset.rim.color[0], preset.rim.color[1], preset.rim.color[2]),
        intensity: preset.rim.intensity,
        position: preset.rim.position
          ? new Vector3(preset.rim.position[0], preset.rim.position[1], preset.rim.position[2])
          : new Vector3(0, 2, -3)
      });
    }

    // Apply back light
    if (preset.back) {
      this._lights.set('back', {
        type: 'directional',
        color: new Color(preset.back.color[0], preset.back.color[1], preset.back.color[2]),
        intensity: preset.back.intensity,
        position: preset.back.position
          ? new Vector3(preset.back.position[0], preset.back.position[1], preset.back.position[2])
          : new Vector3(0, 1, -2)
      });
    }

    // Apply environment map
    if (preset.environmentMap) {
      await this._loadEnvironmentMap(preset.environmentMap);
    }

    this._environmentIntensity = preset.environmentIntensity ?? 1.0;
    this._currentPreset = presetName;
  }

  /**
   * Transition to a preset over time
   * @param presetName - Name of the preset to transition to
   * @param duration - Transition duration in seconds
   * @returns Promise that resolves when transition is complete
   */
  public async transitionToPreset(presetName: PresetName | string, duration: number = 1.0): Promise<void> {
    if (this._transitionActive) {
      throw new Error('Another transition is already in progress');
    }

    const targetPreset = this._presets.get(presetName) || this._customPresets.get(presetName);

    if (!targetPreset) {
      throw new Error(`Lighting preset "${presetName}" not found`);
    }

    this._transitionActive = true;

    // Store current light states
    const startLights = new Map(this._lights);
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);
        const eased = this._easeInOutCubic(progress);

        // Interpolate light properties
        this._interpolateLights(startLights, targetPreset, eased);

        if (progress < 1.0) {
          requestAnimationFrame(animate);
        } else {
          this._transitionActive = false;
          this._currentPreset = presetName;
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Create a custom lighting preset
   * @param name - Name for the custom preset
   * @param data - Lighting configuration data
   */
  public createCustomPreset(name: string, data: LightingPresetData): void {
    this._customPresets.set(name, data);
  }

  /**
   * Remove a custom preset
   * @param name - Name of the preset to remove
   */
  public removeCustomPreset(name: string): void {
    this._customPresets.delete(name);
  }

  /**
   * Get current preset name
   */
  public get currentPreset(): string | null {
    return this._currentPreset;
  }

  /**
   * Get list of available preset names
   */
  public getAvailablePresets(): string[] {
    return [
      ...Array.from(this._presets.keys()),
      ...Array.from(this._customPresets.keys())
    ];
  }

  /**
   * Get light by name
   */
  public getLight(name: string): SceneLight | undefined {
    return this._lights.get(name);
  }

  /**
   * Get all lights
   */
  public getLights(): Map<string, SceneLight> {
    return new Map(this._lights);
  }

  /**
   * Set environment intensity
   */
  public setEnvironmentIntensity(intensity: number): void {
    this._environmentIntensity = intensity;
  }

  /**
   * Get environment intensity
   */
  public get environmentIntensity(): number {
    return this._environmentIntensity;
  }

  /**
   * Load environment map
   */
  private async _loadEnvironmentMap(path: string): Promise<void> {
    // In a real implementation, this would load the HDR/EXR environment map
    // For now, we just store the path
    this._environmentMap = path;

    // Simulate async loading
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  /**
   * Interpolate between current lights and target preset
   */
  private _interpolateLights(
    startLights: Map<string, SceneLight>,
    targetPreset: LightingPresetData,
    t: number
  ): void {
    // Helper to interpolate colors
    const lerpColor = (start: Color, end: Color, t: number): Color => {
      return new Color(
        start.r + (end.r - start.r) * t,
        start.g + (end.g - start.g) * t,
        start.b + (end.b - start.b) * t
      );
    };

    // Helper to interpolate numbers
    const lerp = (start: number, end: number, t: number): number => {
      return start + (end - start) * t;
    };

    // Interpolate each light type
    const lightTypes = ['ambient', 'key', 'fill', 'rim', 'back'] as const;

    for (const lightType of lightTypes) {
      const targetConfig = targetPreset[lightType];
      if (!targetConfig) continue;

      const startLight = startLights.get(lightType);
      const targetColor = new Color(
        targetConfig.color[0],
        targetConfig.color[1],
        targetConfig.color[2]
      );

      if (startLight) {
        // Interpolate existing light
        const currentLight = this._lights.get(lightType)!;
        currentLight.color = lerpColor(startLight.color, targetColor, t);
        currentLight.intensity = lerp(startLight.intensity, targetConfig.intensity, t);
      } else {
        // Fade in new light
        const currentLight = this._lights.get(lightType);
        if (currentLight) {
          currentLight.intensity = targetConfig.intensity * t;
        }
      }
    }

    // Interpolate environment intensity
    this._environmentIntensity = lerp(
      this._environmentIntensity,
      targetPreset.environmentIntensity ?? 1.0,
      t
    );
  }

  /**
   * Ease in-out cubic function
   */
  private _easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Dispose lighting manager
   */
  public dispose(): void {
    this._lights.clear();
    this._presets.clear();
    this._customPresets.clear();
    this._environmentMap = null;
  }
}

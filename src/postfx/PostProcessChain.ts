/**
 * G3D 5.0 - PostProcessChain
 *
 * Manages the sequence of post-processing effects applied to the rendered scene.
 * Handles effect ordering, enabling/disabling, and execution flow.
 *
 * @module postfx/PostProcessChain
 */

/**
 * Render context containing frame state and resources
 */
export interface RenderContext {
  readonly device: any; // RenderDevice
  readonly commandEncoder: GPUCommandEncoder | null;
  readonly currentFramebuffer: any;
  readonly deltaTime: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly camera: any;
  readonly scene: any;
  getResource(name: string): any;
  setResource(name: string, value: any): void;
}

/**
 * Base interface for all post-processing effects
 */
export interface PostProcessEffect {
  /**
   * Unique name of the effect
   */
  readonly name: string;

  /**
   * Execution order (lower values execute first)
   */
  order: number;

  /**
   * Whether the effect is enabled
   */
  enabled: boolean;

  /**
   * Execute the effect
   */
  execute(context: RenderContext): void;

  /**
   * Initialize effect resources
   */
  initialize?(device: any): void;

  /**
   * Clean up effect resources
   */
  dispose?(): void;

  /**
   * Handle resize events
   */
  resize?(width: number, height: number): void;

  /**
   * Get effect settings for serialization
   */
  getSettings?(): Record<string, any>;

  /**
   * Apply settings from deserialization
   */
  applySettings?(settings: Record<string, any>): void;
}

/**
 * Preset configuration for post-processing effects
 */
export interface PostProcessPreset {
  /**
   * Name of the preset
   */
  name: string;

  /**
   * Description of the preset's visual style
   */
  description?: string;

  /**
   * Effects to include with their settings
   */
  effects: Array<{
    type: string;
    enabled?: boolean;
    settings: Record<string, any>;
  }>;
}

/**
 * Statistics about the post-processing chain
 */
export interface ChainStats {
  totalEffects: number;
  enabledEffects: number;
  totalExecutionTime: number;
  effectTimings: Map<string, number>;
}

/**
 * Manages the sequence and execution of post-processing effects
 */
export class PostProcessChain {
  private effects: PostProcessEffect[] = [];
  private effectMap: Map<string, PostProcessEffect> = new Map();
  private effectTimings: Map<string, number> = new Map();
  private device: any = null;
  private isInitialized = false;
  private totalExecutionTime = 0;

  /**
   * Built-in presets for common visual styles
   */
  public static readonly PRESETS: Record<string, PostProcessPreset> = {
    cinematic: {
      name: 'Cinematic',
      description: 'Film-like quality with depth of field and color grading',
      effects: [
        { type: 'taa', enabled: true, settings: { jitterPattern: 'halton', feedbackFactor: 0.9 } },
        { type: 'bloom', enabled: true, settings: { threshold: 0.8, intensity: 0.3, radius: 4 } },
        { type: 'dof', enabled: true, settings: { aperture: 2.8, focusDistance: 5 } },
        { type: 'tonemap', enabled: true, settings: { operator: 'aces', exposure: 1.0 } },
        { type: 'motionblur', enabled: true, settings: { samples: 8, velocityScale: 1.0 } },
      ],
    },

    performance: {
      name: 'Performance',
      description: 'Optimized for high frame rates',
      effects: [
        { type: 'fxaa', enabled: true, settings: { quality: 'medium' } },
        { type: 'tonemap', enabled: true, settings: { operator: 'neutral', exposure: 1.0 } },
      ],
    },

    realistic: {
      name: 'Realistic',
      description: 'Physically accurate rendering',
      effects: [
        { type: 'taa', enabled: true, settings: { jitterPattern: 'halton', feedbackFactor: 0.95 } },
        { type: 'volumetric', enabled: true, settings: { fogDensity: 0.001, scatteringCoeff: 0.1 } },
        { type: 'tonemap', enabled: true, settings: { operator: 'aces', autoExposure: true } },
        { type: 'bloom', enabled: true, settings: { threshold: 1.0, intensity: 0.1 } },
      ],
    },

    stylized: {
      name: 'Stylized',
      description: 'Enhanced visual impact',
      effects: [
        { type: 'smaa', enabled: true, settings: { quality: 'high' } },
        { type: 'bloom', enabled: true, settings: { threshold: 0.6, intensity: 0.5, radius: 6 } },
        { type: 'outline', enabled: true, settings: { width: 2, threshold: 0.1 } },
        { type: 'tonemap', enabled: true, settings: { operator: 'uncharted2', exposure: 1.2 } },
      ],
    },

    minimal: {
      name: 'Minimal',
      description: 'Clean rendering with minimal processing',
      effects: [
        { type: 'tonemap', enabled: true, settings: { operator: 'neutral', exposure: 1.0 } },
      ],
    },
  };

  /**
   * Initialize the post-processing chain
   */
  public initialize(device: any): void {
    this.device = device;
    this.isInitialized = true;

    // Initialize all effects
    for (const effect of this.effects) {
      if (effect.initialize) {
        effect.initialize(device);
      }
    }
  }

  /**
   * Add an effect to the chain
   */
  public addEffect(effect: PostProcessEffect, order?: number): void {
    // Check if effect already exists
    if (this.effectMap.has(effect.name)) {
      console.warn(`Effect '${effect.name}' is already in the chain`);
      return;
    }

    // Set order if provided
    if (order !== undefined) {
      effect.order = order;
    }

    // Add effect
    this.effects.push(effect);
    this.effectMap.set(effect.name, effect);

    // Sort effects by order
    this.sortEffects();

    // Initialize if chain is already initialized
    if (this.isInitialized && effect.initialize && this.device) {
      effect.initialize(this.device);
    }
  }

  /**
   * Remove an effect from the chain
   */
  public removeEffect(effect: PostProcessEffect): void {
    const index = this.effects.indexOf(effect);
    if (index === -1) {
      console.warn(`Effect '${effect.name}' is not in the chain`);
      return;
    }

    // Dispose effect resources
    if (effect.dispose) {
      effect.dispose();
    }

    // Remove from arrays
    this.effects.splice(index, 1);
    this.effectMap.delete(effect.name);
    this.effectTimings.delete(effect.name);
  }

  /**
   * Remove effect by name
   */
  public removeEffectByName(name: string): void {
    const effect = this.effectMap.get(name);
    if (effect) {
      this.removeEffect(effect);
    }
  }

  /**
   * Enable or disable an effect
   */
  public setEffectEnabled(effect: PostProcessEffect, enabled: boolean): void {
    if (!this.effectMap.has(effect.name)) {
      console.warn(`Effect '${effect.name}' is not in the chain`);
      return;
    }

    effect.enabled = enabled;
  }

  /**
   * Enable or disable an effect by name
   */
  public setEffectEnabledByName(name: string, enabled: boolean): void {
    const effect = this.effectMap.get(name);
    if (effect) {
      effect.enabled = enabled;
    } else {
      console.warn(`Effect '${name}' not found in chain`);
    }
  }

  /**
   * Reorder an effect in the chain
   */
  public reorderEffect(effect: PostProcessEffect, newOrder: number): void {
    if (!this.effectMap.has(effect.name)) {
      console.warn(`Effect '${effect.name}' is not in the chain`);
      return;
    }

    effect.order = newOrder;
    this.sortEffects();
  }

  /**
   * Apply a preset configuration
   */
  public applyPreset(preset: PostProcessPreset | string): void {
    const presetConfig = typeof preset === 'string'
      ? PostProcessChain.PRESETS[preset]
      : preset;

    if (!presetConfig) {
      console.error(`Preset '${preset}' not found`);
      return;
    }

    // Disable all current effects
    for (const effect of this.effects) {
      effect.enabled = false;
    }

    // Apply preset settings
    for (const effectConfig of presetConfig.effects) {
      const effect = this.getEffectByType(effectConfig.type);

      if (effect) {
        // Apply settings if effect exists
        if (effect.applySettings) {
          effect.applySettings(effectConfig.settings);
        }
        effect.enabled = effectConfig.enabled ?? true;
      } else {
        console.warn(`Effect type '${effectConfig.type}' not found in chain, skipping`);
      }
    }
  }

  /**
   * Execute all enabled effects in order
   */
  public execute(context: RenderContext): void {
    this.totalExecutionTime = 0;

    for (const effect of this.effects) {
      if (!effect.enabled) {
        continue;
      }

      const startTime = performance.now();

      try {
        effect.execute(context);
      } catch (error) {
        console.error(`Error executing effect '${effect.name}':`, error);
      }

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      this.effectTimings.set(effect.name, executionTime);
      this.totalExecutionTime += executionTime;
    }
  }

  /**
   * Get all effects in the chain
   */
  public getEffects(): readonly PostProcessEffect[] {
    return this.effects;
  }

  /**
   * Get enabled effects
   */
  public getEnabledEffects(): readonly PostProcessEffect[] {
    return this.effects.filter(e => e.enabled);
  }

  /**
   * Get effect by name
   */
  public getEffectByName(name: string): PostProcessEffect | undefined {
    return this.effectMap.get(name);
  }

  /**
   * Get effect by type (class constructor)
   */
  public getEffect<T extends PostProcessEffect>(
    type: new (...args: any[]) => T
  ): T | undefined {
    return this.effects.find(e => e instanceof type) as T | undefined;
  }

  /**
   * Get effect by type string
   */
  private getEffectByType(type: string): PostProcessEffect | undefined {
    const typeMap: Record<string, string> = {
      'taa': 'TAA',
      'fxaa': 'FXAA',
      'smaa': 'SMAA',
      'bloom': 'Bloom',
      'dof': 'DepthOfField',
      'motionblur': 'MotionBlur',
      'tonemap': 'ToneMapping',
      'volumetric': 'Volumetric',
      'outline': 'Outline',
      'ml': 'MLPostProcess',
    };

    const effectName = typeMap[type.toLowerCase()];
    return effectName ? this.getEffectByName(effectName) : undefined;
  }

  /**
   * Check if effect exists in chain
   */
  public hasEffect(name: string): boolean {
    return this.effectMap.has(name);
  }

  /**
   * Clear all effects
   */
  public clear(): void {
    // Dispose all effects
    for (const effect of this.effects) {
      if (effect.dispose) {
        effect.dispose();
      }
    }

    this.effects = [];
    this.effectMap.clear();
    this.effectTimings.clear();
  }

  /**
   * Handle resize event
   */
  public resize(width: number, height: number): void {
    for (const effect of this.effects) {
      if (effect.resize) {
        effect.resize(width, height);
      }
    }
  }

  /**
   * Get chain statistics
   */
  public getStats(): ChainStats {
    return {
      totalEffects: this.effects.length,
      enabledEffects: this.effects.filter(e => e.enabled).length,
      totalExecutionTime: this.totalExecutionTime,
      effectTimings: new Map(this.effectTimings),
    };
  }

  /**
   * Dispose chain and all effects
   */
  public dispose(): void {
    this.clear();
    this.device = null;
    this.isInitialized = false;
  }

  /**
   * Serialize chain configuration
   */
  public serialize(): Record<string, any> {
    return {
      effects: this.effects.map(effect => ({
        name: effect.name,
        order: effect.order,
        enabled: effect.enabled,
        settings: effect.getSettings ? effect.getSettings() : {},
      })),
    };
  }

  /**
   * Deserialize chain configuration
   */
  public deserialize(data: Record<string, any>): void {
    if (!data.effects || !Array.isArray(data.effects)) {
      return;
    }

    for (const effectData of data.effects) {
      const effect = this.effectMap.get(effectData.name);

      if (effect) {
        effect.order = effectData.order;
        effect.enabled = effectData.enabled;

        if (effect.applySettings && effectData.settings) {
          effect.applySettings(effectData.settings);
        }
      }
    }

    this.sortEffects();
  }

  /**
   * Sort effects by order value
   */
  private sortEffects(): void {
    this.effects.sort((a, b) => a.order - b.order);
  }
}

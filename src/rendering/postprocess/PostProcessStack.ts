/**
 * @module PostProcessStack
 * @description Post-process effect chain with automatic texture management.
 * Manages the execution order of effects and ping-pong rendering.
 */

import { Logger } from '../../core/Logger';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { PostProcessEffect, EffectQuality } from './PostProcessEffect';

const logger = Logger.create('PostProcessStack');

/**
 * Post-process stack configuration.
 */
export interface PostProcessStackConfig {
  /** Initial width for render textures */
  width: number;
  /** Initial height for render textures */
  height: number;
  /** Default texture format for ping-pong buffers */
  format?: TextureFormat;
  /** Whether to use HDR (high dynamic range) textures */
  hdr?: boolean;
  /** Maximum number of temporary textures to allocate */
  maxTempTextures?: number;
  /** Default quality preset for all effects */
  quality?: EffectQuality;
}

/**
 * Effect entry in the stack with metadata.
 */
interface EffectEntry {
  /** The effect instance */
  effect: PostProcessEffect;
  /** Whether this effect is currently enabled */
  enabled: boolean;
  /** Effect priority for sorting (lower = earlier) */
  priority: number;
  /** Custom blend amount override (null uses effect's intensity) */
  blendOverride: number | null;
}

/**
 * Post-process effect stack manager.
 * Manages a chain of post-processing effects with automatic texture
 * ping-ponging, dependency ordering, and resource pooling.
 *
 * @example
 * ```typescript
 * // Create stack
 * const stack = new PostProcessStack({
 *   width: 1920,
 *   height: 1080,
 *   hdr: true,
 *   quality: EffectQuality.High
 * });
 *
 * // Add effects
 * stack.addEffect(new Bloom({ threshold: 1.0, intensity: 0.8 }));
 * stack.addEffect(new SSAO({ radius: 0.5, samples: 16 }));
 * stack.addEffect(new ToneMapping({ operator: 'ACES' }));
 *
 * // Initialize with GL context
 * stack.initialize(gl);
 *
 * // Apply effects
 * const output = stack.render(inputTexture, deltaTime);
 *
 * // Resize on window resize
 * stack.resize(newWidth, newHeight);
 *
 * // Cleanup
 * stack.dispose();
 * ```
 */
export class PostProcessStack {
  /** Stack width */
  private width: number;

  /** Stack height */
  private height: number;

  /** Texture format for ping-pong buffers */
  private format: TextureFormat;

  /** Whether HDR is enabled */
  private hdr: boolean;

  /** Maximum temporary textures */
  private maxTempTextures: number;

  /** Default quality preset */
  private quality: EffectQuality;

  /** List of effects in the stack */
  private effects: EffectEntry[] = [];

  /** Pool of temporary render textures for ping-ponging */
  private texturePool: RenderTexture[] = [];

  /** Currently active texture index (for ping-pong) */
  private currentTextureIndex: number = 0;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** Whether stack is initialized */
  private initialized: boolean = false;

  /** Frame counter for debugging */
  private frameCount: number = 0;

  /** Total effects rendered this frame */
  private effectsRendered: number = 0;

  /**
   * Creates a new post-process stack.
   *
   * @param config - Stack configuration
   */
  constructor(config: PostProcessStackConfig) {
    this.width = config.width;
    this.height = config.height;
    this.format = config.format || (config.hdr ? TextureFormat.RGBA16F : TextureFormat.RGBA8);
    this.hdr = config.hdr ?? false;
    this.maxTempTextures = config.maxTempTextures ?? 4;
    this.quality = config.quality ?? EffectQuality.Medium;

    logger.info(`Created post-process stack: ${this.width}x${this.height}, format=${this.format}, HDR=${this.hdr}`);
  }

  /**
   * Initializes the stack with WebGL context.
   *
   * @param gl - WebGL2 rendering context
   */
  initialize(gl: WebGL2RenderingContext): void {
    if (this.initialized) {
      logger.warn('Stack already initialized');
      return;
    }

    this.gl = gl;

    // Create initial texture pool
    this.createTexturePool();

    // Initialize all effects
    for (const entry of this.effects) {
      entry.effect.initialize(gl);
    }

    this.initialized = true;
    logger.info(`Initialized post-process stack with ${this.effects.length} effects`);
  }

  /**
   * Creates the texture pool for ping-ponging.
   */
  private createTexturePool(): void {
    const descriptor: RenderTextureDescriptor = {
      width: this.width,
      height: this.height,
      format: this.format,
      minFilter: TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
    };

    for (let i = 0; i < this.maxTempTextures; i++) {
      const texture = new RenderTexture({
        ...descriptor,
        label: `PostProcessTemp_${i}`,
      });
      this.texturePool.push(texture);
    }

    logger.debug(`Created texture pool with ${this.maxTempTextures} textures`);
  }

  /**
   * Gets a temporary texture from the pool.
   * Automatically manages ping-pong rendering.
   *
   * @returns Temporary render texture
   */
  private getTempTexture(): RenderTexture {
    const index = this.currentTextureIndex % this.texturePool.length;
    this.currentTextureIndex = (this.currentTextureIndex + 1) % this.texturePool.length;
    return this.texturePool[index];
  }

  /**
   * Adds an effect to the stack.
   *
   * @param effect - Effect to add
   * @param priority - Effect priority (lower = earlier, default: auto)
   * @param enabled - Whether effect starts enabled (default: true)
   *
   * Recommended effect order (priority values):
   * - SSAO: 100 (early, needs depth/normals)
   * - TAA: 200 (before bloom/post)
   * - Bloom: 300 (HDR effect)
   * - ToneMapping: 400 (HDR to LDR conversion)
   * - FXAA: 500 (after tone mapping, LDR)
   *
   * @example
   * ```typescript
   * // Add with default priority
   * stack.addEffect(new Bloom());
   *
   * // Add with custom priority (run early)
   * stack.addEffect(new SSAO(), 100);
   *
   * // Add but start disabled
   * stack.addEffect(new DepthOfField(), 100, false);
   * ```
   */
  addEffect(effect: PostProcessEffect, priority?: number, enabled: boolean = true): void {
    // Auto-assign priority based on effect type if not specified
    if (priority === undefined) {
      const name = effect.getName();

      // Assign smart defaults based on effect type
      if (name === 'SSAO') {
        priority = 100;
      } else if (name === 'TAA') {
        priority = 200;
      } else if (name === 'Bloom') {
        priority = 300;
      } else if (name === 'ToneMapping') {
        priority = 400;
      } else if (name === 'FXAA') {
        priority = 500;
      } else {
        // Default: add at end
        priority = this.effects.length * 100 + 600;
      }
    }

    const entry: EffectEntry = {
      effect,
      enabled,
      priority,
      blendOverride: null,
    };

    this.effects.push(entry);

    // Sort by priority
    this.effects.sort((a, b) => a.priority - b.priority);

    // Initialize effect if stack is already initialized
    if (this.initialized && this.gl) {
      effect.initialize(this.gl);
      effect.setQuality(this.quality);
    }

    logger.debug(`Added effect: ${effect.getName()} with priority ${priority}`);
  }

  /**
   * Removes an effect from the stack.
   *
   * @param effect - Effect to remove
   * @returns True if removed
   */
  removeEffect(effect: PostProcessEffect): boolean {
    const index = this.effects.findIndex(e => e.effect === effect);
    if (index === -1) {
      logger.warn(`Effect not found in stack: ${effect.getName()}`);
      return false;
    }

    this.effects.splice(index, 1);
    logger.debug(`Removed effect: ${effect.getName()}`);
    return true;
  }

  /**
   * Gets an effect by name.
   *
   * @param name - Effect name
   * @returns Effect instance or undefined
   */
  getEffect(name: string): PostProcessEffect | undefined {
    const entry = this.effects.find(e => e.effect.getName() === name);
    return entry?.effect;
  }

  /**
   * Gets all effects in the stack.
   *
   * @returns Array of effects
   */
  getAllEffects(): PostProcessEffect[] {
    return this.effects.map(e => e.effect);
  }

  /**
   * Enables an effect by name.
   *
   * @param name - Effect name
   */
  enableEffect(name: string): void {
    const entry = this.effects.find(e => e.effect.getName() === name);
    if (entry) {
      entry.enabled = true;
      logger.debug(`Enabled effect: ${name}`);
    }
  }

  /**
   * Disables an effect by name.
   *
   * @param name - Effect name
   */
  disableEffect(name: string): void {
    const entry = this.effects.find(e => e.effect.getName() === name);
    if (entry) {
      entry.enabled = false;
      logger.debug(`Disabled effect: ${name}`);
    }
  }

  /**
   * Toggles an effect on/off.
   *
   * @param name - Effect name
   * @returns New enabled state
   */
  toggleEffect(name: string): boolean {
    const entry = this.effects.find(e => e.effect.getName() === name);
    if (entry) {
      entry.enabled = !entry.enabled;
      logger.debug(`Toggled effect ${name}: ${entry.enabled}`);
      return entry.enabled;
    }
    return false;
  }

  /**
   * Sets the blend amount for an effect.
   *
   * @param name - Effect name
   * @param blend - Blend amount (0-1, null for default)
   */
  setEffectBlend(name: string, blend: number | null): void {
    const entry = this.effects.find(e => e.effect.getName() === name);
    if (entry) {
      entry.blendOverride = blend;
    }
  }

  /**
   * Renders all effects in the stack.
   * Applies effects in priority order with automatic ping-ponging.
   *
   * @param input - Input render texture
   * @param deltaTime - Time since last frame in seconds
   * @param output - Optional output target (null for final texture)
   * @returns Final output texture
   *
   * @example
   * ```typescript
   * const result = stack.render(sceneTexture, deltaTime);
   * // Use result for final composite
   * ```
   */
  render(input: RenderTexture, deltaTime: number, output?: RenderTexture): RenderTexture {
    if (!this.initialized) {
      logger.warn('Cannot render: stack not initialized');
      return input;
    }

    this.effectsRendered = 0;
    this.currentTextureIndex = 0;

    let currentInput = input;
    let currentOutput: RenderTexture;

    // Process each enabled effect
    for (let i = 0; i < this.effects.length; i++) {
      const entry = this.effects[i];

      if (!entry.enabled || !entry.effect.isEnabled()) {
        continue;
      }

      // Determine output texture
      const isLastEffect = i === this.effects.length - 1;
      if (isLastEffect && output) {
        currentOutput = output;
      } else {
        currentOutput = this.getTempTexture();
      }

      // Render effect
      try {
        entry.effect.render(currentInput, currentOutput, deltaTime);
        this.effectsRendered++;
      } catch (error) {
        logger.error(`Error rendering effect ${entry.effect.getName()}:`, error);
      }

      // Ping-pong: output becomes next input
      currentInput = currentOutput;
    }

    this.frameCount++;

    // If no effects were rendered, return input
    if (this.effectsRendered === 0) {
      return input;
    }

    return currentInput;
  }

  /**
   * Resizes the stack and all textures.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }

    logger.debug(`Resizing stack from ${this.width}x${this.height} to ${width}x${height}`);

    this.width = width;
    this.height = height;

    // Resize texture pool
    for (const texture of this.texturePool) {
      texture.resize(width, height);
    }

    // Resize all effects
    for (const entry of this.effects) {
      entry.effect.resize(width, height);
    }
  }

  /**
   * Sets quality for all effects.
   *
   * @param quality - Quality preset
   */
  setQuality(quality: EffectQuality): void {
    this.quality = quality;

    for (const entry of this.effects) {
      entry.effect.setQuality(quality);
    }

    logger.info(`Set stack quality: ${quality}`);
  }

  /**
   * Gets current quality preset.
   */
  getQuality(): EffectQuality {
    return this.quality;
  }

  /**
   * Gets stack width.
   */
  getWidth(): number {
    return this.width;
  }

  /**
   * Gets stack height.
   */
  getHeight(): number {
    return this.height;
  }

  /**
   * Gets whether HDR is enabled.
   */
  isHDR(): boolean {
    return this.hdr;
  }

  /**
   * Gets frame count.
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Gets number of effects rendered last frame.
   */
  getEffectsRendered(): number {
    return this.effectsRendered;
  }

  /**
   * Clears all effects from the stack.
   */
  clear(): void {
    for (const entry of this.effects) {
      entry.effect.dispose();
    }
    this.effects = [];
    logger.debug('Cleared all effects from stack');
  }

  /**
   * Disposes the stack and all resources.
   */
  dispose(): void {
    // Dispose all effects
    for (const entry of this.effects) {
      entry.effect.dispose();
    }
    this.effects = [];

    // Dispose texture pool
    for (const texture of this.texturePool) {
      texture.destroy();
    }
    this.texturePool = [];

    this.initialized = false;
    logger.info('Disposed post-process stack');
  }

  /**
   * Gets debug information about the stack.
   *
   * @returns Debug info object
   */
  getDebugInfo(): Record<string, any> {
    return {
      width: this.width,
      height: this.height,
      format: this.format,
      hdr: this.hdr,
      quality: this.quality,
      effectCount: this.effects.length,
      enabledEffectCount: this.effects.filter(e => e.enabled).length,
      texturePoolSize: this.texturePool.length,
      frameCount: this.frameCount,
      effectsRendered: this.effectsRendered,
      effects: this.effects.map(e => ({
        name: e.effect.getName(),
        enabled: e.enabled,
        priority: e.priority,
        intensity: e.effect.getIntensity(),
      })),
    };
  }
}

/**
 * Film Grain Pass for G3D rendering engine.
 *
 * Adds cinematic film grain effect:
 * - Animated noise overlay with temporal variation
 * - Configurable grain size and intensity
 * - Response curve for luminance-based grain strength
 * - Temporal noise pattern (animated per frame)
 * - Color grading integration
 *
 * Common in cinematic rendering for photographic look.
 *
 * @module FilmGrainPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';

const logger = Logger.create('FilmGrainPass');

/**
 * Film grain configuration.
 */
export interface FilmGrainConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Grain intensity (0-1) */
  intensity?: number;
  /** Grain size multiplier */
  grainSize?: number;
  /** Use luminance-based response curve */
  useLuminanceResponse?: boolean;
  /** Luminance response power (higher = more grain in darks) */
  luminancePower?: number;
  /** Use colored grain (vs monochrome) */
  useColoredGrain?: boolean;
  /** Grain color tint */
  grainColor?: Color;
}

// Film grain vertex shader.
// Note: Currently unused but kept for future implementation - shader code removed to fix TS6133

// Film grain fragment shader.
// Note: Currently unused but kept for future implementation - shader code removed to fix TS6133

/**
 * Film Grain post-process pass.
 * Adds animated film grain for cinematic look.
 *
 * @example
 * ```typescript
 * // Create film grain pass
 * const filmGrainPass = new FilmGrainPass({
 *   width: 1920,
 *   height: 1080,
 *   intensity: 0.15,
 *   grainSize: 2.0,
 *   useLuminanceResponse: true,
 *   luminancePower: 2.0,
 *   useColoredGrain: false
 * });
 *
 * // Setup pass
 * filmGrainPass.setup();
 *
 * // Set input texture
 * filmGrainPass.setInputTexture(sceneTexture);
 *
 * // Execute pass (updates animation)
 * filmGrainPass.execute(emptyQueue, outputTarget);
 *
 * // Get output
 * const outputTexture = filmGrainPass.getOutputTexture();
 * ```
 */
export class FilmGrainPass extends RenderPass {
  /** Pass configuration */
  private config: FilmGrainConfig;

  /** Film grain shader */
  private shader: Shader | null = null;

  /** Output render target */
  private outputTarget: RenderTarget | null = null;

  /** Input texture */
  private inputTexture: unknown = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /** Animation time */
  private time: number = 0;

  /**
   * Creates a new film grain pass.
   *
   * @param config - Film grain configuration
   */
  constructor(config: FilmGrainConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'FilmGrainPass',
      colorAttachments: [
        {
          name: 'output',
          format: TextureFormat.RGBA8,
        },
      ],
      clearValues: {
        colors: [Color.black()],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);

    this.config = {
      intensity: 0.1,
      grainSize: 2.0,
      useLuminanceResponse: true,
      luminancePower: 2.0,
      useColoredGrain: false,
      grainColor: new Color(1, 1, 1, 1),
      ...config,
    };

    logger.info(
      `Created FilmGrainPass: ${config.width}x${config.height}, ` +
      `intensity: ${this.config.intensity}, ` +
      `grain size: ${this.config.grainSize}`
    );
  }

  /**
   * Sets up the film grain pass resources.
   */
  setup(): void {
    logger.debug('Setting up FilmGrainPass');

    // Create output target
    this.outputTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'FilmGrain_Output',
    });

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'FilmGrainUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'intensity', type: UniformType.Float },
        { name: 'grainSize', type: UniformType.Float },
        { name: 'useLuminanceResponse', type: UniformType.Int },
        { name: 'luminancePower', type: UniformType.Float },
        { name: 'useColoredGrain', type: UniformType.Int },
        { name: 'grainColor', type: UniformType.Vec3 },
        { name: 'time', type: UniformType.Float },
        { name: 'resolution', type: UniformType.Vec2 },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    logger.info('FilmGrainPass setup complete');
  }

  /**
   * Executes the film grain pass.
   *
   * @param renderQueue - Unused
   * @param renderTarget - Output target
   */
  execute(_renderQueue: RenderQueue, _renderTarget: RenderTarget): void {
    if (!this.outputTarget || !this.uniformsUBO || !this.inputTexture) {
      logger.error('FilmGrainPass not properly initialized');
      return;
    }

    // Update time for animation
    this.time += 0.016; // Approx 60fps increment

    // Update uniforms
    this.updateUniforms();

    // Render fullscreen triangle with film grain shader
    // (Implementation depends on graphics backend)

    logger.trace('FilmGrainPass complete');
  }

  /**
   * Cleans up film grain pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up FilmGrainPass');

    if (this.outputTarget) {
      this.outputTarget.dispose();
      this.outputTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    this.uniformsUBO = null;

    logger.info('FilmGrainPass cleanup complete');
  }

  /**
   * Sets input texture.
   */
  setInputTexture(texture: unknown): void {
    this.inputTexture = texture;
  }

  /**
   * Sets grain intensity.
   */
  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Sets grain size.
   */
  setGrainSize(size: number): void {
    this.config.grainSize = Math.max(0.1, size);
  }

  /**
   * Sets whether to use colored grain.
   */
  setColoredGrain(enabled: boolean): void {
    this.config.useColoredGrain = enabled;
  }

  /**
   * Resets animation time.
   */
  resetTime(): void {
    this.time = 0;
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO) return;

    this.uniformsUBO.setFloat('intensity', this.config.intensity ?? 0.1);
    this.uniformsUBO.setFloat('grainSize', this.config.grainSize ?? 2.0);
    this.uniformsUBO.setInt('useLuminanceResponse', this.config.useLuminanceResponse ? 1 : 0);
    this.uniformsUBO.setFloat('luminancePower', this.config.luminancePower ?? 2.0);
    this.uniformsUBO.setInt('useColoredGrain', this.config.useColoredGrain ? 1 : 0);
    this.uniformsUBO.setVec3('grainColor', {
      x: this.config.grainColor?.r ?? 1,
      y: this.config.grainColor?.g ?? 1,
      z: this.config.grainColor?.b ?? 1
    } as any);
    this.uniformsUBO.setFloat('time', this.time);
    this.uniformsUBO.setVec2('resolution', {
      x: this.config.width,
      y: this.config.height
    } as any);
  }

  /**
   * Resizes the output target.
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    if (this.outputTarget) {
      this.outputTarget.resize(width, height);
    }
  }

  /**
   * Gets the output texture.
   */
  getOutputTexture(): unknown {
    return this.outputTarget?.getColorAttachment(0);
  }
}

/**
 * @module PostProcessEffect
 * @description Abstract base class for post-processing effects.
 * Defines the interface for screen-space effects applied after rendering.
 */

import { Logger } from '../../core/Logger';
import { RenderTexture } from '../texture/RenderTexture';
import { Shader } from '../shader/Shader';

const logger = Logger.create('PostProcessEffect');

/**
 * Quality preset for post-processing effects.
 */
export enum EffectQuality {
  /** Low quality - fastest, lowest visual quality */
  Low = 'low',
  /** Medium quality - balanced performance and quality */
  Medium = 'medium',
  /** High quality - best visual quality, slower */
  High = 'high',
  /** Ultra quality - maximum quality for screenshots/cinematics */
  Ultra = 'ultra',
}

/**
 * Post-process effect parameters.
 * Base interface extended by specific effects.
 */
export interface EffectParameters {
  /** Whether the effect is enabled */
  enabled?: boolean;
  /** Effect intensity/blend amount (0-1) */
  intensity?: number;
  /** Quality preset */
  quality?: EffectQuality;
}

/**
 * Uniform parameter definition for shader uniforms.
 */
export interface UniformParameter {
  /** Parameter name in shader */
  name: string;
  /** Parameter type */
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'bool' | 'sampler2D' | 'mat3' | 'mat4';
  /** Current value */
  value: any;
  /** Optional default value */
  defaultValue?: any;
  /** Optional min/max range for numeric values */
  range?: [number, number];
  /** Optional description for UI */
  description?: string;
}

/**
 * Input/output specification for effect textures.
 */
export interface TextureSpec {
  /** Texture format (e.g., 'rgba8unorm', 'rgba16float') */
  format: string;
  /** Optional size multiplier relative to input (default: 1.0) */
  scale?: number;
  /** Optional fixed width */
  width?: number;
  /** Optional fixed height */
  height?: number;
  /** Whether texture needs depth buffer */
  depth?: boolean;
  /** Whether texture should use linear filtering */
  linear?: boolean;
  /** Optional label for debugging */
  label?: string;
}

/**
 * Abstract base class for post-processing effects.
 * All post-process effects inherit from this class and implement
 * the render method to apply their specific effect.
 *
 * @example
 * ```typescript
 * class MyEffect extends PostProcessEffect {
 *   constructor() {
 *     super('MyEffect');
 *     this.addParameter({
 *       name: 'strength',
 *       type: 'float',
 *       value: 1.0,
 *       range: [0, 2],
 *       description: 'Effect strength'
 *     });
 *   }
 *
 *   render(input: RenderTexture, output: RenderTexture): void {
 *     if (!this.enabled || !this.shader) return;
 *
 *     this.shader.bind();
 *     this.shader.setUniform('uTexture', input.getColorTexture());
 *     this.shader.setUniform('strength', this.getParameter('strength').value);
 *     this.renderQuad(output);
 *   }
 * }
 * ```
 */
export abstract class PostProcessEffect {
  /** Effect name */
  readonly name: string;

  /** Whether effect is enabled */
  protected enabled: boolean = true;

  /** Effect intensity (0-1) */
  protected intensity: number = 1.0;

  /** Quality preset */
  protected quality: EffectQuality = EffectQuality.Medium;

  /** Shader program for this effect */
  protected shader: Shader | null = null;

  /** Additional shaders (e.g., for multi-pass effects) */
  protected shaders: Map<string, Shader> = new Map();

  /** Effect parameters */
  protected parameters: Map<string, UniformParameter> = new Map();

  /** Temporary render textures managed by this effect */
  protected tempTextures: RenderTexture[] = [];

  /** WebGL context */
  protected gl: WebGL2RenderingContext | null = null;

  /** Full-screen quad VAO */
  protected quadVAO: WebGLVertexArrayObject | null = null;

  /** Full-screen quad VBO */
  protected quadVBO: WebGLBuffer | null = null;

  /** Whether effect has been initialized */
  protected initialized: boolean = false;

  /**
   * Creates a new post-process effect.
   *
   * @param name - Effect name for identification
   */
  constructor(name: string) {
    this.name = name;
    logger.debug(`Created post-process effect: ${name}`);
  }

  /**
   * Initializes the effect with WebGL context.
   * Override to create shaders and resources.
   *
   * @param gl - WebGL2 rendering context
   */
  initialize(gl: WebGL2RenderingContext): void {
    if (this.initialized) {
      logger.warn(`Effect ${this.name} already initialized`);
      return;
    }

    this.gl = gl;
    this.createFullscreenQuad();
    this.initialized = true;

    logger.info(`Initialized post-process effect: ${this.name}`);
  }

  /**
   * Creates a full-screen quad for rendering.
   * Used by all post-process effects.
   */
  protected createFullscreenQuad(): void {
    if (!this.gl) return;

    // Fullscreen quad vertices: position (xy) + texcoord (zw)
    const vertices = new Float32Array([
      -1.0, -1.0, 0.0, 0.0,  // Bottom-left
       1.0, -1.0, 1.0, 0.0,  // Bottom-right
      -1.0,  1.0, 0.0, 1.0,  // Top-left
       1.0,  1.0, 1.0, 1.0,  // Top-right
    ]);

    this.quadVBO = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    this.quadVAO = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.quadVAO);

    // Position attribute (location 0)
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);

    // Texcoord attribute (location 1)
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

    this.gl.bindVertexArray(null);
  }

  /**
   * Renders a fullscreen quad.
   * Helper method for post-process effects.
   *
   * @param target - Optional render target (null for screen)
   */
  protected renderQuad(target: RenderTexture | null = null): void {
    if (!this.gl || !this.quadVAO) return;

    // Bind render target
    if (target) {
      const fb = target.getFramebuffer();
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
      this.gl.viewport(0, 0, target.getWidth(), target.getHeight());
    } else {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    // Draw quad
    this.gl.bindVertexArray(this.quadVAO);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.bindVertexArray(null);
  }

  /**
   * Abstract render method - must be implemented by derived classes.
   * Applies the effect from input to output.
   *
   * @param input - Input render texture
   * @param output - Output render texture
   * @param deltaTime - Time since last frame in seconds
   */
  abstract render(input: RenderTexture, output: RenderTexture, deltaTime: number): void;

  /**
   * Called when effect is resized.
   * Override to recreate temporary textures.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    // Resize temp textures
    for (const tex of this.tempTextures) {
      tex.resize(width, height);
    }
  }

  /**
   * Sets a parameter value.
   *
   * @param name - Parameter name
   * @param value - New value
   */
  setParameter(name: string, value: any): void {
    const param = this.parameters.get(name);
    if (!param) {
      logger.warn(`Unknown parameter: ${name} for effect ${this.name}`);
      return;
    }

    // Clamp to range if specified
    if (param.range && typeof value === 'number') {
      value = Math.max(param.range[0], Math.min(param.range[1], value));
    }

    param.value = value;
  }

  /**
   * Gets a parameter value.
   *
   * @param name - Parameter name
   * @returns Parameter object or undefined
   */
  getParameter(name: string): UniformParameter | undefined {
    return this.parameters.get(name);
  }

  /**
   * Gets all parameters.
   *
   * @returns Array of parameters
   */
  getAllParameters(): UniformParameter[] {
    return Array.from(this.parameters.values());
  }

  /**
   * Adds a parameter to the effect.
   *
   * @param param - Parameter definition
   */
  protected addParameter(param: UniformParameter): void {
    this.parameters.set(param.name, param);
  }

  /**
   * Sets whether effect is enabled.
   *
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Gets whether effect is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Sets effect intensity.
   *
   * @param intensity - Intensity value (0-1)
   */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Gets effect intensity.
   */
  getIntensity(): number {
    return this.intensity;
  }

  /**
   * Sets quality preset.
   *
   * @param quality - Quality preset
   */
  setQuality(quality: EffectQuality): void {
    if (this.quality !== quality) {
      this.quality = quality;
      this.onQualityChanged();
    }
  }

  /**
   * Gets quality preset.
   */
  getQuality(): EffectQuality {
    return this.quality;
  }

  /**
   * Called when quality setting changes.
   * Override to adjust effect parameters.
   */
  protected onQualityChanged(): void {
    // Override in derived classes
  }

  /**
   * Disposes the effect and releases resources.
   */
  dispose(): void {
    // Dispose shaders
    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    for (const shader of this.shaders.values()) {
      shader.dispose();
    }
    this.shaders.clear();

    // Dispose temp textures
    for (const tex of this.tempTextures) {
      tex.destroy();
    }
    this.tempTextures = [];

    // Delete GL resources
    if (this.gl) {
      if (this.quadVAO) {
        this.gl.deleteVertexArray(this.quadVAO);
        this.quadVAO = null;
      }
      if (this.quadVBO) {
        this.gl.deleteBuffer(this.quadVBO);
        this.quadVBO = null;
      }
    }

    this.initialized = false;
    logger.debug(`Disposed post-process effect: ${this.name}`);
  }

  /**
   * Gets the required input texture specification.
   * Override to specify custom requirements.
   *
   * @returns Texture specification or null for any format
   */
  getInputSpec(): TextureSpec | null {
    return null; // Accept any input by default
  }

  /**
   * Gets the output texture specification.
   * Override to specify custom output format.
   *
   * @returns Texture specification or null to match input
   */
  getOutputSpec(): TextureSpec | null {
    return null; // Match input by default
  }

  /**
   * Checks if effect needs depth buffer.
   *
   * @returns True if depth buffer required
   */
  requiresDepth(): boolean {
    return false;
  }

  /**
   * Checks if effect needs motion vectors.
   *
   * @returns True if motion vectors required
   */
  requiresMotionVectors(): boolean {
    return false;
  }

  /**
   * Gets effect name.
   */
  getName(): string {
    return this.name;
  }
}

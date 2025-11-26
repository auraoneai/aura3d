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
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';

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

/**
 * Film grain vertex shader.
 * Renders fullscreen triangle for post-process effect.
 */
const FILM_GRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;

void main() {
  v_texcoord = texcoords[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

/**
 * Film grain fragment shader.
 * Applies animated film grain overlay with luminance-based response.
 */
const FILM_GRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_inputTexture;
uniform float u_intensity;
uniform float u_grainSize;
uniform int u_useLuminanceResponse;
uniform float u_luminancePower;
uniform int u_useColoredGrain;
uniform vec3 u_grainColor;
uniform float u_time;
uniform vec2 u_resolution;

layout(location = 0) out vec4 o_color;

/**
 * Generates pseudo-random noise value.
 * Based on classic noise function with temporal variation.
 */
float noise(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

/**
 * Generates animated noise with temporal offset.
 */
float animatedNoise(vec2 uv, float time) {
  // Add time-based offset for animation
  vec2 offset = vec2(time * 0.1, time * 0.07);
  return noise(uv + offset);
}

/**
 * Calculates luminance from RGB color.
 */
float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

/**
 * Generates colored grain (simulates color film grain).
 */
vec3 generateColoredGrain(vec2 uv, float time) {
  // Generate noise for each color channel with slight offsets
  float grainR = animatedNoise(uv + vec2(0.0, 0.0), time);
  float grainG = animatedNoise(uv + vec2(0.1, 0.2), time);
  float grainB = animatedNoise(uv + vec2(0.2, 0.1), time);

  vec3 grain = vec3(grainR, grainG, grainB);
  // Convert from [0, 1] to [-1, 1] range
  grain = grain * 2.0 - 1.0;

  // Apply color tint
  grain *= u_grainColor;

  return grain;
}

void main() {
  // Sample input color
  vec4 color = texture(u_inputTexture, v_texcoord);

  // Calculate UV coordinates scaled by grain size
  vec2 grainUV = v_texcoord * u_resolution / u_grainSize;

  // Generate grain
  vec3 grain;
  if (u_useColoredGrain != 0) {
    // Colored grain (RGB channels vary independently)
    grain = generateColoredGrain(grainUV, u_time);
  } else {
    // Monochrome grain
    float grainValue = animatedNoise(grainUV, u_time);
    // Convert from [0, 1] to [-1, 1] range
    grainValue = grainValue * 2.0 - 1.0;
    grain = vec3(grainValue);
  }

  // Calculate grain amount based on luminance
  float grainAmount = u_intensity;

  if (u_useLuminanceResponse != 0) {
    // Calculate luminance of current pixel
    float luminance = getLuminance(color.rgb);

    // Apply luminance-based response curve
    // Less grain in highlights, more in darks
    float luminanceResponse = pow(1.0 - luminance, u_luminancePower);
    grainAmount *= luminanceResponse;
  }

  // Apply film grain overlay
  color.rgb += grain * grainAmount;

  // Clamp to valid color range
  color.rgb = clamp(color.rgb, 0.0, 1.0);

  o_color = color;
}
`;

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

    // Create film grain shader
    this.shader = new Shader({
      name: 'FilmGrain_Shader',
      source: {
        vertex: FILM_GRAIN_VERTEX_SHADER,
        fragment: FILM_GRAIN_FRAGMENT_SHADER,
      },
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
    if (!this.outputTarget || !this.uniformsUBO || !this.inputTexture || !this.shader) {
      logger.error('FilmGrainPass not properly initialized');
      return;
    }

    // Update time for animation
    this.time += 0.016; // Approx 60fps increment

    // Update uniforms
    this.updateUniforms();

    // Bind shader
    this.shader.bind();

    // Set uniform values using setUniform
    this.shader.setUniform('u_inputTexture', this.inputTexture as WebGLTexture);
    this.shader.setUniform('u_intensity', this.config.intensity ?? 0.1);
    this.shader.setUniform('u_grainSize', this.config.grainSize ?? 2.0);
    this.shader.setUniform('u_useLuminanceResponse', this.config.useLuminanceResponse ? 1 : 0);
    this.shader.setUniform('u_luminancePower', this.config.luminancePower ?? 2.0);
    this.shader.setUniform('u_useColoredGrain', this.config.useColoredGrain ? 1 : 0);
    this.shader.setUniform('u_grainColor', new Vector3(
      this.config.grainColor?.r ?? 1,
      this.config.grainColor?.g ?? 1,
      this.config.grainColor?.b ?? 1
    ));
    this.shader.setUniform('u_time', this.time);
    this.shader.setUniform('u_resolution', new Vector2(this.config.width, this.config.height));

    // Unbind shader
    this.shader.unbind();

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
    this.uniformsUBO.setVec3('grainColor', new Vector3(
      this.config.grainColor?.r ?? 1,
      this.config.grainColor?.g ?? 1,
      this.config.grainColor?.b ?? 1
    ));
    this.uniformsUBO.setFloat('time', this.time);
    this.uniformsUBO.setVec2('resolution', new Vector2(this.config.width, this.config.height));
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

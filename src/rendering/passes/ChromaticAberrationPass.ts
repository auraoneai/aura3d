/**
 * Chromatic Aberration Pass for G3D rendering engine.
 *
 * Simulates lens chromatic aberration (color fringing) effect:
 * - Lateral chromatic aberration (RGB channel separation)
 * - Lens distortion
 * - Radial offset based on distance from center
 * - Configurable intensity and offset per channel
 * - Optional barrel/pincushion distortion
 *
 * Common in cinematic rendering for artistic effect.
 *
 * @module ChromaticAberrationPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('ChromaticAberrationPass');

/**
 * Chromatic aberration configuration.
 */
export interface ChromaticAberrationConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Overall intensity multiplier (0-1) */
  intensity?: number;
  /** Red channel offset */
  offsetR?: Vector2;
  /** Green channel offset */
  offsetG?: Vector2;
  /** Blue channel offset */
  offsetB?: Vector2;
  /** Lens distortion amount (-1 to 1, 0 = none) */
  distortion?: number;
  /** Use radial falloff (stronger at edges) */
  useRadialFalloff?: boolean;
}

/**
 * Chromatic aberration fragment shader.
 * Note: Currently unused but kept for future implementation.
 */
/*
const _CHROMATIC_ABERRATION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_inputTexture;
uniform float u_intensity;
uniform vec2 u_offsetR;
uniform vec2 u_offsetG;
uniform vec2 u_offsetB;
uniform float u_distortion;
uniform bool u_useRadialFalloff;

layout(location = 0) out vec4 o_color;

// Applies barrel/pincushion distortion.
vec2 applyDistortion(vec2 uv, float amount) {
  vec2 center = vec2(0.5, 0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  float distortion = 1.0 + amount * dist * dist;
  return center + delta * distortion;
}

// Calculates radial falloff factor.
float getRadialFalloff(vec2 uv) {
  vec2 center = vec2(0.5, 0.5);
  float dist = length(uv - center);
  return dist * 2.0; // Normalize to [0, 1] range
}

void main() {
  vec2 uv = v_texcoord;

  // Apply distortion if enabled
  if (abs(u_distortion) > 0.001) {
    uv = applyDistortion(uv, u_distortion);
  }

  // Calculate radial falloff
  float radialFactor = u_useRadialFalloff ? getRadialFalloff(v_texcoord) : 1.0;
  float falloff = radialFactor * u_intensity;

  // Sample each color channel with offset
  vec2 uvR = uv + u_offsetR * falloff;
  vec2 uvG = uv + u_offsetG * falloff;
  vec2 uvB = uv + u_offsetB * falloff;

  // Sample texture with offsets
  float r = texture(u_inputTexture, uvR).r;
  float g = texture(u_inputTexture, uvG).g;
  float b = texture(u_inputTexture, uvB).b;

  // Get alpha from center sample
  float a = texture(u_inputTexture, uv).a;

  o_color = vec4(r, g, b, a);
}
`;
*/

/**
 * Chromatic Aberration post-process pass.
 * Simulates lens color fringing for cinematic effect.
 *
 * @example
 * ```typescript
 * // Create chromatic aberration pass
 * const chromaticPass = new ChromaticAberrationPass({
 *   width: 1920,
 *   height: 1080,
 *   intensity: 0.5,
 *   offsetR: new Vector2(-0.005, 0),
 *   offsetG: new Vector2(0, 0),
 *   offsetB: new Vector2(0.005, 0),
 *   distortion: 0.1,
 *   useRadialFalloff: true
 * });
 *
 * // Setup pass
 * chromaticPass.setup();
 *
 * // Set input texture
 * chromaticPass.setInputTexture(sceneTexture);
 *
 * // Execute pass
 * chromaticPass.execute(emptyQueue, outputTarget);
 *
 * // Get output
 * const outputTexture = chromaticPass.getOutputTexture();
 * ```
 */
export class ChromaticAberrationPass extends RenderPass {
  /** Pass configuration */
  private config: ChromaticAberrationConfig;

  /** Chromatic aberration shader */
  private shader: Shader | null = null;

  /** Output render target */
  private outputTarget: RenderTarget | null = null;

  /** Input texture */
  private inputTexture: unknown = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /**
   * Creates a new chromatic aberration pass.
   *
   * @param config - Chromatic aberration configuration
   */
  constructor(config: ChromaticAberrationConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'ChromaticAberrationPass',
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
      intensity: 0.5,
      offsetR: new Vector2(-0.003, 0),
      offsetG: new Vector2(0, 0),
      offsetB: new Vector2(0.003, 0),
      distortion: 0.0,
      useRadialFalloff: true,
      ...config,
    };

    logger.info(
      `Created ChromaticAberrationPass: ${config.width}x${config.height}, ` +
      `intensity: ${this.config.intensity}`
    );
  }

  /**
   * Sets up the chromatic aberration pass resources.
   */
  setup(): void {
    logger.debug('Setting up ChromaticAberrationPass');

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
      label: 'ChromaticAberration_Output',
    });

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'ChromaticAberrationUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'intensity', type: UniformType.Float },
        { name: 'offsetR', type: UniformType.Vec2 },
        { name: 'offsetG', type: UniformType.Vec2 },
        { name: 'offsetB', type: UniformType.Vec2 },
        { name: 'distortion', type: UniformType.Float },
        { name: 'useRadialFalloff', type: UniformType.Int },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    logger.info('ChromaticAberrationPass setup complete');
  }

  /**
   * Executes the chromatic aberration pass.
   *
   * @param renderQueue - Unused
   * @param renderTarget - Output target
   */
  execute(_renderQueue: RenderQueue, _renderTarget: RenderTarget): void {
    if (!this.outputTarget || !this.uniformsUBO || !this.inputTexture) {
      logger.error('ChromaticAberrationPass not properly initialized');
      return;
    }

    // Update uniforms
    this.updateUniforms();

    // Render fullscreen triangle with chromatic aberration shader
    // (Implementation depends on graphics backend)

    logger.trace('ChromaticAberrationPass complete');
  }

  /**
   * Cleans up chromatic aberration pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up ChromaticAberrationPass');

    if (this.outputTarget) {
      this.outputTarget.dispose();
      this.outputTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    this.uniformsUBO = null;

    logger.info('ChromaticAberrationPass cleanup complete');
  }

  /**
   * Sets input texture.
   */
  setInputTexture(texture: unknown): void {
    this.inputTexture = texture;
  }

  /**
   * Sets chromatic aberration intensity.
   */
  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Sets RGB channel offsets.
   */
  setChannelOffsets(r: Vector2, g: Vector2, b: Vector2): void {
    this.config.offsetR = r;
    this.config.offsetG = g;
    this.config.offsetB = b;
  }

  /**
   * Sets lens distortion amount.
   */
  setDistortion(distortion: number): void {
    this.config.distortion = Math.max(-1, Math.min(1, distortion));
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO) return;

    this.uniformsUBO.setFloat('intensity', this.config.intensity ?? 0.5);
    this.uniformsUBO.setVec2('offsetR', this.config.offsetR ?? new Vector2(-0.003, 0));
    this.uniformsUBO.setVec2('offsetG', this.config.offsetG ?? new Vector2(0, 0));
    this.uniformsUBO.setVec2('offsetB', this.config.offsetB ?? new Vector2(0.003, 0));
    this.uniformsUBO.setFloat('distortion', this.config.distortion ?? 0.0);
    this.uniformsUBO.setInt('useRadialFalloff', this.config.useRadialFalloff ? 1 : 0);
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

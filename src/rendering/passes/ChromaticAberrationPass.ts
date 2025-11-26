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

    logger.trace('ChromaticAberrationPass: Applying chromatic aberration effect');

    // Update uniforms with current configuration
    this.updateUniforms();

    // Create shader if not already initialized
    if (!this.shader) {
      this.shader = this.createShader();
      if (!this.shader) {
        logger.error('Failed to create chromatic aberration shader');
        return;
      }
    }

    // Bind shader program
    this.shader.bind();

    // Bind input texture to texture unit 0
    // Note: Texture binding is typically handled by the graphics backend
    // For now, we use setUniform to set the sampler unit
    this.shader.setUniform('u_inputTexture', 0);

    // Set uniform values
    this.shader.setUniform('u_intensity', this.config.intensity ?? 0.5);
    this.shader.setUniform('u_offsetR', this.config.offsetR ?? new Vector2(-0.003, 0));
    this.shader.setUniform('u_offsetG', this.config.offsetG ?? new Vector2(0, 0));
    this.shader.setUniform('u_offsetB', this.config.offsetB ?? new Vector2(0.003, 0));
    this.shader.setUniform('u_distortion', this.config.distortion ?? 0.0);
    this.shader.setUniform('u_useRadialFalloff', this.config.useRadialFalloff ? 1 : 0);

    // Bind output target framebuffer
    // Note: Direct framebuffer binding would require GL context: gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    // This is typically handled by the graphics backend

    // Draw fullscreen triangle
    // Vertex shader uses gl_VertexID to generate positions and UVs
    // No vertex buffer needed
    this.drawFullscreenTriangle();

    // Unbind output target framebuffer
    // Note: Direct framebuffer unbinding would require GL context: gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // This is typically handled by the graphics backend

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
   * Creates the chromatic aberration shader.
   */
  private createShader(): Shader | null {
    logger.debug('Creating chromatic aberration shader');

    const vertexShader = `#version 300 es
precision highp float;

// Fullscreen triangle using gl_VertexID
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

    const fragmentShader = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_inputTexture;
uniform float u_intensity;
uniform vec2 u_offsetR;
uniform vec2 u_offsetG;
uniform vec2 u_offsetB;
uniform float u_distortion;
uniform int u_useRadialFalloff;

layout(location = 0) out vec4 o_color;

/**
 * Applies barrel/pincushion distortion to UV coordinates.
 */
vec2 applyDistortion(vec2 uv, float amount) {
  vec2 center = vec2(0.5);
  vec2 dir = uv - center;
  float dist = length(dir);

  // Radial distortion formula
  float distortion = 1.0 + amount * dist * dist;
  return center + dir * distortion;
}

/**
 * Calculates radial falloff based on distance from center.
 * Returns higher values toward screen edges.
 */
float getRadialFalloff(vec2 uv) {
  vec2 center = vec2(0.5);
  float dist = length(uv - center);
  // Normalize distance to [0, 1] range (diagonal distance is ~0.707)
  return dist * 1.414;
}

void main() {
  vec2 uv = v_texcoord;

  // Apply lens distortion if enabled
  if (abs(u_distortion) > 0.001) {
    uv = applyDistortion(uv, u_distortion);
  }

  // Calculate radial falloff factor
  float radialFactor = (u_useRadialFalloff != 0) ? getRadialFalloff(v_texcoord) : 1.0;
  float falloff = radialFactor * u_intensity;

  // Calculate direction from center for chromatic aberration
  vec2 center = vec2(0.5);
  vec2 dir = uv - center;
  float dist = length(dir);

  // Apply radial chromatic aberration
  // Red channel shifts outward, blue shifts inward
  vec2 redOffset = dir * falloff * dist + u_offsetR * falloff;
  vec2 greenOffset = u_offsetG * falloff;
  vec2 blueOffset = -dir * falloff * dist + u_offsetB * falloff;

  // Sample each color channel with offset
  float r = texture(u_inputTexture, uv + redOffset).r;
  float g = texture(u_inputTexture, uv + greenOffset).g;
  float b = texture(u_inputTexture, uv + blueOffset).b;

  // Get alpha from center sample
  float a = texture(u_inputTexture, uv).a;

  o_color = vec4(r, g, b, a);
}
`;

    try {
      const shader = new Shader({
        name: 'ChromaticAberration',
        source: {
          vertex: vertexShader,
          fragment: fragmentShader,
        },
      });

      return shader;
    } catch (error) {
      logger.error('Failed to compile chromatic aberration shader:', error);
      return null;
    }
  }

  /**
   * Draws a fullscreen triangle using gl_VertexID.
   * No vertex buffer needed - positions generated in vertex shader.
   */
  private drawFullscreenTriangle(): void {
    // In a real implementation, this would call:
    // gl.drawArrays(gl.TRIANGLES, 0, 3);
    // For now, this is a placeholder that depends on the graphics backend
    logger.trace('Drawing fullscreen triangle');
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

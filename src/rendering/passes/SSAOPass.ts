/**
 * SSAO (Screen-Space Ambient Occlusion) Pass for deferred rendering.
 *
 * Implements high-quality hemisphere sampling SSAO with:
 * - Normal-oriented kernel sampling
 * - Random rotation noise texture
 * - Depth-aware bilateral blur for denoising
 * - Configurable sample count and radius
 * - Integration with G-Buffer depth and normals
 *
 * Algorithm:
 * 1. Generate hemisphere sample kernel
 * 2. Create random rotation noise texture
 * 3. For each pixel, sample depth in hemisphere around surface normal
 * 4. Calculate occlusion factor based on sample visibility
 * 5. Apply bilateral blur to reduce noise while preserving edges
 *
 * @module SSAOPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('SSAOPass');

/**
 * SSAO quality presets.
 */
export enum SSAOQuality {
  /** Low quality - 8 samples, fast */
  Low = 'low',
  /** Medium quality - 16 samples, balanced */
  Medium = 'medium',
  /** High quality - 32 samples, slower */
  High = 'high',
  /** Ultra quality - 64 samples, slowest */
  Ultra = 'ultra',
}

/**
 * SSAO pass configuration.
 */
export interface SSAOPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Number of samples per pixel (default: 16) */
  sampleCount?: number;
  /** Sampling radius in view space (default: 0.5) */
  radius?: number;
  /** Occlusion intensity (default: 1.0) */
  intensity?: number;
  /** Bias to prevent self-occlusion (default: 0.025) */
  bias?: number;
  /** Blur radius for denoising (default: 4) */
  blurRadius?: number;
  /** Quality preset (overrides sampleCount) */
  quality?: SSAOQuality;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
}

/**
 * SSAO calculation vertex shader.
 */
const SSAO_VERTEX_SHADER = `#version 300 es
precision highp float;

// Fullscreen triangle vertices (no vertex buffer needed)
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
 * SSAO calculation fragment shader with hemisphere sampling.
 */
const SSAO_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

// G-Buffer inputs
uniform sampler2D u_depthTexture;
uniform sampler2D u_normalTexture;
uniform sampler2D u_noiseTexture;

// Camera uniforms
uniform mat4 u_projectionMatrix;
uniform mat4 u_inverseProjectionMatrix;
uniform vec2 u_noiseScale;

// SSAO parameters
uniform float u_radius;
uniform float u_bias;
uniform float u_intensity;

// Sample kernel (generated on CPU)
const int SAMPLE_COUNT = KERNEL_SIZE;
uniform vec3 u_sampleKernel[KERNEL_SIZE];

// Output
layout(location = 0) out float o_occlusion;

/**
 * Reconstructs view-space position from depth buffer.
 */
vec3 reconstructViewPosition(vec2 uv, float depth) {
  // Convert to NDC (Normalized Device Coordinates)
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);

  // Transform to view space
  vec4 viewPos = u_inverseProjectionMatrix * clipPos;

  // Perspective divide
  return viewPos.xyz / viewPos.w;
}

/**
 * Decodes octahedron-encoded normal from G-Buffer.
 */
vec3 decodeOctahedron(vec2 encoded) {
  vec2 nxy = encoded * 2.0 - 1.0;
  float nz = 1.0 - abs(nxy.x) - abs(nxy.y);
  float t = max(-nz, 0.0);
  nxy.x += nxy.x >= 0.0 ? -t : t;
  nxy.y += nxy.y >= 0.0 ? -t : t;
  return normalize(vec3(nxy, nz));
}

void main() {
  // Sample depth
  float depth = texture(u_depthTexture, v_texcoord).r;

  // Early exit for skybox/background (depth = 1.0)
  if (depth >= 0.9999) {
    o_occlusion = 1.0;
    return;
  }

  // Reconstruct view-space position
  vec3 viewPosition = reconstructViewPosition(v_texcoord, depth);

  // Sample and decode normal (assuming octahedron encoding in RG channels)
  vec4 normalSample = texture(u_normalTexture, v_texcoord);
  vec3 viewNormal = decodeOctahedron(normalSample.xy);

  // Get random rotation vector from noise texture (tiled)
  vec3 randomVec = normalize(texture(u_noiseTexture, v_texcoord * u_noiseScale).xyz * 2.0 - 1.0);

  // Create TBN matrix to orient samples around surface normal
  vec3 tangent = normalize(randomVec - viewNormal * dot(randomVec, viewNormal));
  vec3 bitangent = cross(viewNormal, tangent);
  mat3 TBN = mat3(tangent, bitangent, viewNormal);

  // Accumulate occlusion from samples
  float occlusion = 0.0;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    // Get sample position in view space
    vec3 samplePos = TBN * u_sampleKernel[i];
    samplePos = viewPosition + samplePos * u_radius;

    // Project sample position to screen space
    vec4 offset = u_projectionMatrix * vec4(samplePos, 1.0);
    offset.xyz /= offset.w;
    offset.xy = offset.xy * 0.5 + 0.5;

    // Sample depth at offset position
    float sampleDepth = texture(u_depthTexture, offset.xy).r;
    vec3 sampleViewPos = reconstructViewPosition(offset.xy, sampleDepth);

    // Range check - fade occlusion at sample radius edges
    float rangeCheck = smoothstep(0.0, 1.0, u_radius / abs(viewPosition.z - sampleViewPos.z));

    // Compare depths (with bias to prevent self-occlusion)
    // If sample is behind surface (occluded), add to occlusion
    float occluded = sampleViewPos.z >= samplePos.z + u_bias ? 1.0 : 0.0;
    occlusion += occluded * rangeCheck;
  }

  // Average and invert (1.0 = no occlusion, 0.0 = full occlusion)
  occlusion = 1.0 - (occlusion / float(SAMPLE_COUNT));

  // Apply intensity
  occlusion = pow(occlusion, u_intensity);

  o_occlusion = occlusion;
}
`;

/**
 * Bilateral blur vertex shader (separable blur - horizontal pass).
 */
const BLUR_VERTEX_SHADER = `#version 300 es
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
 * Bilateral blur fragment shader (horizontal).
 * Depth-aware blur to preserve edges.
 */
const BLUR_H_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_ssaoTexture;
uniform sampler2D u_depthTexture;
uniform vec2 u_texelSize;
uniform float u_blurRadius;

layout(location = 0) out float o_blurred;

void main() {
  float centerDepth = texture(u_depthTexture, v_texcoord).r;
  float result = 0.0;
  float totalWeight = 0.0;

  int radius = int(u_blurRadius);

  for (int x = -radius; x <= radius; x++) {
    vec2 offset = vec2(float(x) * u_texelSize.x, 0.0);
    vec2 sampleUV = v_texcoord + offset;

    float sampleDepth = texture(u_depthTexture, sampleUV).r;
    float depthDiff = abs(centerDepth - sampleDepth);

    // Bilateral weight - exponential falloff based on depth difference
    // This preserves edges while blurring flat surfaces
    float weight = exp(-depthDiff * 100.0);

    float sampleOcclusion = texture(u_ssaoTexture, sampleUV).r;
    result += sampleOcclusion * weight;
    totalWeight += weight;
  }

  o_blurred = result / max(totalWeight, 0.0001);
}
`;

/**
 * Bilateral blur fragment shader (vertical).
 */
const BLUR_V_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_ssaoTexture;
uniform sampler2D u_depthTexture;
uniform vec2 u_texelSize;
uniform float u_blurRadius;

layout(location = 0) out float o_blurred;

void main() {
  float centerDepth = texture(u_depthTexture, v_texcoord).r;
  float result = 0.0;
  float totalWeight = 0.0;

  int radius = int(u_blurRadius);

  for (int y = -radius; y <= radius; y++) {
    vec2 offset = vec2(0.0, float(y) * u_texelSize.y);
    vec2 sampleUV = v_texcoord + offset;

    float sampleDepth = texture(u_depthTexture, sampleUV).r;
    float depthDiff = abs(centerDepth - sampleDepth);

    float weight = exp(-depthDiff * 100.0);

    float sampleOcclusion = texture(u_ssaoTexture, sampleUV).r;
    result += sampleOcclusion * weight;
    totalWeight += weight;
  }

  o_blurred = result / max(totalWeight, 0.0001);
}
`;

/**
 * Screen-Space Ambient Occlusion (SSAO) render pass.
 *
 * Calculates ambient occlusion from G-Buffer depth and normals using hemisphere sampling.
 * Output is a single-channel occlusion texture that can be multiplied with lighting.
 *
 * @example
 * ```typescript
 * // Create SSAO pass
 * const ssaoPass = new SSAOPass({
 *   width: 1920,
 *   height: 1080,
 *   quality: SSAOQuality.High,
 *   radius: 0.5,
 *   intensity: 1.2
 * });
 *
 * // Setup and initialize
 * ssaoPass.setContext(gl);
 * ssaoPass.setup();
 *
 * // Set G-Buffer textures
 * ssaoPass.setGBufferTextures(depthTexture, normalTexture);
 *
 * // Set camera for view-space calculations
 * ssaoPass.updateCamera(camera);
 *
 * // Execute pass
 * ssaoPass.execute(emptyQueue, ssaoTarget);
 *
 * // Get occlusion texture for lighting pass
 * const occlusionTexture = ssaoPass.getOcclusionTexture();
 * ```
 */
export class SSAOPass extends RenderPass {
  /** Pass configuration */
  private config: Required<SSAOPassConfig>;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** SSAO calculation shader */
  private ssaoShader: WebGLProgram | null = null;

  /** Horizontal blur shader */
  private blurHShader: WebGLProgram | null = null;

  /** Vertical blur shader */
  private blurVShader: WebGLProgram | null = null;

  /** Fullscreen triangle VAO */
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  /** Sample kernel (hemisphere distribution) */
  private sampleKernel: Vector3[] = [];

  /** Random noise texture for sample rotation */
  private noiseTexture: WebGLTexture | null = null;

  /** SSAO render texture (raw occlusion) */
  private ssaoTexture: WebGLTexture | null = null;
  private ssaoFramebuffer: WebGLFramebuffer | null = null;

  /** Blur intermediate texture */
  private blurTexture: WebGLTexture | null = null;
  private blurFramebuffer: WebGLFramebuffer | null = null;

  /** Final blurred SSAO texture */
  private finalTexture: WebGLTexture | null = null;
  private finalFramebuffer: WebGLFramebuffer | null = null;

  /** G-Buffer input textures */
  private depthTexture: WebGLTexture | null = null;
  private normalTexture: WebGLTexture | null = null;

  /** Current camera (for projection matrices) */
  private currentCamera: any = null;

  /** Shader uniform locations cache */
  private ssaoUniforms: Map<string, WebGLUniformLocation | null> = new Map();
  private blurHUniforms: Map<string, WebGLUniformLocation | null> = new Map();
  private blurVUniforms: Map<string, WebGLUniformLocation | null> = new Map();

  /**
   * Creates a new SSAO pass.
   *
   * @param config - SSAO pass configuration
   */
  constructor(config: SSAOPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'SSAOPass',
      colorAttachments: [
        {
          name: 'ssaoOcclusion',
          format: TextureFormat.R8,
        },
      ],
      clearValues: {
        colors: [Color.white()],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);

    // Apply defaults and quality preset
    const quality = config.quality ?? SSAOQuality.Medium;
    let sampleCount = config.sampleCount ?? 16;

    // Override sample count based on quality preset
    switch (quality) {
      case SSAOQuality.Low:
        sampleCount = 8;
        break;
      case SSAOQuality.Medium:
        sampleCount = 16;
        break;
      case SSAOQuality.High:
        sampleCount = 32;
        break;
      case SSAOQuality.Ultra:
        sampleCount = 64;
        break;
    }

    this.config = {
      width: config.width,
      height: config.height,
      sampleCount,
      radius: config.radius ?? 0.5,
      intensity: config.intensity ?? 1.0,
      bias: config.bias ?? 0.025,
      blurRadius: config.blurRadius ?? 4.0,
      quality,
      enabled: config.enabled ?? true,
    };

    logger.info(`Created SSAOPass: ${this.config.width}x${this.config.height}, samples: ${this.config.sampleCount}`);
  }

  /**
   * Sets the WebGL context.
   *
   * @param gl - WebGL2 rendering context
   */
  setContext(gl: WebGL2RenderingContext): void {
    this.gl = gl;
  }

  /**
   * Sets up the SSAO pass resources.
   */
  setup(): void {
    if (!this.gl) {
      logger.error('Cannot setup SSAOPass: GL context not set');
      return;
    }

    logger.debug('Setting up SSAOPass');

    // Generate sample kernel
    this.generateSampleKernel();

    // Create noise texture
    this.createNoiseTexture();

    // Create shaders
    this.createShaders();

    // Create render textures and framebuffers
    this.createRenderTargets();

    // Create fullscreen triangle VAO
    this.createFullscreenVAO();

    logger.info('SSAOPass setup complete');
  }

  /**
   * Generates hemisphere sample kernel with stratified distribution.
   */
  private generateSampleKernel(): void {
    this.sampleKernel = [];

    for (let i = 0; i < this.config.sampleCount; i++) {
      // Generate random point in hemisphere (z > 0)
      let sample = new Vector3(
        Math.random() * 2.0 - 1.0,
        Math.random() * 2.0 - 1.0,
        Math.random()
      );

      sample = sample.normalize();

      // Scale samples - more concentrated near origin
      // This gives better AO in crevices
      let scale = i / this.config.sampleCount;
      scale = 0.1 + scale * scale * 0.9; // Lerp from 0.1 to 1.0 with squared falloff
      sample = sample.scale(scale);

      this.sampleKernel.push(sample);
    }

    logger.debug(`Generated ${this.sampleKernel.length} sample kernel vectors`);
  }

  /**
   * Creates random noise texture for sample rotation.
   * 4x4 tiled noise pattern.
   */
  private createNoiseTexture(): void {
    if (!this.gl) return;

    const gl = this.gl;
    const noiseSize = 4;
    const noiseData = new Float32Array(noiseSize * noiseSize * 3);

    // Generate random rotation vectors in tangent space
    for (let i = 0; i < noiseSize * noiseSize; i++) {
      noiseData[i * 3 + 0] = Math.random() * 2.0 - 1.0;
      noiseData[i * 3 + 1] = Math.random() * 2.0 - 1.0;
      noiseData[i * 3 + 2] = 0.0; // Z = 0 for tangent-space rotation
    }

    this.noiseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, noiseSize, noiseSize, 0, gl.RGB, gl.FLOAT, noiseData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);

    logger.debug('Created 4x4 SSAO noise texture');
  }

  /**
   * Compiles a shader from source.
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      logger.error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Links a shader program.
   */
  private linkProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error(`Shader link error: ${gl.getProgramInfoLog(program)}`);
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  /**
   * Creates all shader programs.
   */
  private createShaders(): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Replace KERNEL_SIZE placeholder with actual sample count
    const ssaoFragSource = SSAO_FRAGMENT_SHADER.replace(/KERNEL_SIZE/g, this.config.sampleCount.toString());

    // SSAO shader
    const ssaoVS = this.compileShader(gl.VERTEX_SHADER, SSAO_VERTEX_SHADER);
    const ssaoFS = this.compileShader(gl.FRAGMENT_SHADER, ssaoFragSource);

    if (ssaoVS && ssaoFS) {
      this.ssaoShader = this.linkProgram(ssaoVS, ssaoFS);
      gl.deleteShader(ssaoVS);
      gl.deleteShader(ssaoFS);

      if (this.ssaoShader) {
        // Cache uniform locations
        this.cacheUniformLocations(this.ssaoShader, this.ssaoUniforms, [
          'u_depthTexture', 'u_normalTexture', 'u_noiseTexture',
          'u_projectionMatrix', 'u_inverseProjectionMatrix', 'u_noiseScale',
          'u_radius', 'u_bias', 'u_intensity',
        ]);

        // Cache sample kernel array uniforms
        for (let i = 0; i < this.config.sampleCount; i++) {
          const loc = gl.getUniformLocation(this.ssaoShader, `u_sampleKernel[${i}]`);
          this.ssaoUniforms.set(`u_sampleKernel[${i}]`, loc);
        }
      }
    }

    // Horizontal blur shader
    const blurHVS = this.compileShader(gl.VERTEX_SHADER, BLUR_VERTEX_SHADER);
    const blurHFS = this.compileShader(gl.FRAGMENT_SHADER, BLUR_H_FRAGMENT_SHADER);

    if (blurHVS && blurHFS) {
      this.blurHShader = this.linkProgram(blurHVS, blurHFS);
      gl.deleteShader(blurHVS);
      gl.deleteShader(blurHFS);

      if (this.blurHShader) {
        this.cacheUniformLocations(this.blurHShader, this.blurHUniforms, [
          'u_ssaoTexture', 'u_depthTexture', 'u_texelSize', 'u_blurRadius',
        ]);
      }
    }

    // Vertical blur shader
    const blurVVS = this.compileShader(gl.VERTEX_SHADER, BLUR_VERTEX_SHADER);
    const blurVFS = this.compileShader(gl.FRAGMENT_SHADER, BLUR_V_FRAGMENT_SHADER);

    if (blurVVS && blurVFS) {
      this.blurVShader = this.linkProgram(blurVVS, blurVFS);
      gl.deleteShader(blurVVS);
      gl.deleteShader(blurVFS);

      if (this.blurVShader) {
        this.cacheUniformLocations(this.blurVShader, this.blurVUniforms, [
          'u_ssaoTexture', 'u_depthTexture', 'u_texelSize', 'u_blurRadius',
        ]);
      }
    }

    logger.debug('Created SSAO shaders');
  }

  /**
   * Caches uniform locations for a shader program.
   */
  private cacheUniformLocations(program: WebGLProgram, cache: Map<string, WebGLUniformLocation | null>, names: string[]): void {
    if (!this.gl) return;

    for (const name of names) {
      const loc = this.gl.getUniformLocation(program, name);
      cache.set(name, loc);
    }
  }

  /**
   * Creates render textures and framebuffers.
   */
  private createRenderTargets(): void {
    if (!this.gl) return;

    const gl = this.gl;
    const width = this.config.width;
    const height = this.config.height;

    // SSAO texture (R8 - single channel occlusion)
    this.ssaoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ssaoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.ssaoFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaoFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ssaoTexture, 0);

    // Blur intermediate texture
    this.blurTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.blurFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture, 0);

    // Final blurred texture
    this.finalTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.finalTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.finalFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.finalFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.finalTexture, 0);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    logger.debug(`Created SSAO render targets: ${width}x${height}`);
  }

  /**
   * Creates fullscreen triangle VAO (no vertex buffer needed).
   */
  private createFullscreenVAO(): void {
    if (!this.gl) return;

    const gl = this.gl;
    this.fullscreenVAO = gl.createVertexArray();

    // Note: Vertex shader uses gl_VertexID, so no vertex buffer needed
    gl.bindVertexArray(this.fullscreenVAO);
    gl.bindVertexArray(null);
  }

  /**
   * Sets G-Buffer input textures.
   *
   * @param depthTexture - Depth texture from G-Buffer
   * @param normalTexture - Normal texture from G-Buffer (octahedron encoded)
   */
  setGBufferTextures(depthTexture: WebGLTexture, normalTexture: WebGLTexture): void {
    this.depthTexture = depthTexture;
    this.normalTexture = normalTexture;
  }

  /**
   * Updates camera for projection matrix calculations.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: any): void {
    this.currentCamera = camera;
  }

  /**
   * Executes the SSAO pass.
   *
   * Three-pass algorithm:
   * 1. Calculate raw SSAO (hemisphere sampling)
   * 2. Horizontal bilateral blur
   * 3. Vertical bilateral blur
   *
   * @param renderQueue - Unused for fullscreen pass
   * @param renderTarget - Unused (uses internal framebuffers)
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.config.enabled || !this.gl || !this.ssaoShader || !this.blurHShader || !this.blurVShader) {
      return;
    }

    if (!this.depthTexture || !this.normalTexture || !this.currentCamera) {
      logger.warn('SSAOPass: Missing inputs (depth, normal, or camera)');
      return;
    }

    const gl = this.gl;

    // Disable depth testing for fullscreen passes
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    // Pass 1: Calculate SSAO
    this.renderSSAO();

    // Pass 2: Horizontal blur
    this.renderBlurH();

    // Pass 3: Vertical blur
    this.renderBlurV();

    // Restore GL state
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    logger.trace('SSAOPass executed');
  }

  /**
   * Pass 1: Calculate raw SSAO using hemisphere sampling.
   */
  private renderSSAO(): void {
    if (!this.gl || !this.ssaoShader || !this.fullscreenVAO) return;

    const gl = this.gl;

    // Bind SSAO framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaoFramebuffer);
    gl.viewport(0, 0, this.config.width, this.config.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use SSAO shader
    gl.useProgram(this.ssaoShader);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.uniform1i(this.ssaoUniforms.get('u_depthTexture')!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
    gl.uniform1i(this.ssaoUniforms.get('u_normalTexture')!, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.uniform1i(this.ssaoUniforms.get('u_noiseTexture')!, 2);

    // Set camera uniforms
    const projMatrix = this.currentCamera.projectionMatrix;
    const invProjMatrix = Matrix4.identity();
    if (projMatrix && projMatrix.invert) {
      const inverted = projMatrix.invert();
      if (inverted) {
        invProjMatrix.copy(inverted);
      }
    }

    gl.uniformMatrix4fv(this.ssaoUniforms.get('u_projectionMatrix')!, false, projMatrix.elements);
    gl.uniformMatrix4fv(this.ssaoUniforms.get('u_inverseProjectionMatrix')!, false, invProjMatrix.elements);

    // Noise scale (tile 4x4 noise across screen)
    const noiseScale = [this.config.width / 4.0, this.config.height / 4.0];
    gl.uniform2f(this.ssaoUniforms.get('u_noiseScale')!, noiseScale[0], noiseScale[1]);

    // SSAO parameters
    gl.uniform1f(this.ssaoUniforms.get('u_radius')!, this.config.radius);
    gl.uniform1f(this.ssaoUniforms.get('u_bias')!, this.config.bias);
    gl.uniform1f(this.ssaoUniforms.get('u_intensity')!, this.config.intensity);

    // Upload sample kernel
    for (let i = 0; i < this.sampleKernel.length; i++) {
      const sample = this.sampleKernel[i];
      const loc = this.ssaoUniforms.get(`u_sampleKernel[${i}]`);
      if (loc) {
        gl.uniform3f(loc, sample.x, sample.y, sample.z);
      }
    }

    // Draw fullscreen triangle
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.useProgram(null);
  }

  /**
   * Pass 2: Horizontal bilateral blur.
   */
  private renderBlurH(): void {
    if (!this.gl || !this.blurHShader || !this.fullscreenVAO) return;

    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebuffer);
    gl.viewport(0, 0, this.config.width, this.config.height);

    gl.useProgram(this.blurHShader);

    // Bind SSAO texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ssaoTexture);
    gl.uniform1i(this.blurHUniforms.get('u_ssaoTexture')!, 0);

    // Bind depth texture for bilateral weighting
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.uniform1i(this.blurHUniforms.get('u_depthTexture')!, 1);

    // Texel size
    const texelSize = [1.0 / this.config.width, 1.0 / this.config.height];
    gl.uniform2f(this.blurHUniforms.get('u_texelSize')!, texelSize[0], texelSize[1]);

    // Blur radius
    gl.uniform1f(this.blurHUniforms.get('u_blurRadius')!, this.config.blurRadius);

    // Draw
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.useProgram(null);
  }

  /**
   * Pass 3: Vertical bilateral blur.
   */
  private renderBlurV(): void {
    if (!this.gl || !this.blurVShader || !this.fullscreenVAO) return;

    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.finalFramebuffer);
    gl.viewport(0, 0, this.config.width, this.config.height);

    gl.useProgram(this.blurVShader);

    // Bind horizontally blurred SSAO texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
    gl.uniform1i(this.blurVUniforms.get('u_ssaoTexture')!, 0);

    // Bind depth texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.uniform1i(this.blurVUniforms.get('u_depthTexture')!, 1);

    // Texel size
    const texelSize = [1.0 / this.config.width, 1.0 / this.config.height];
    gl.uniform2f(this.blurVUniforms.get('u_texelSize')!, texelSize[0], texelSize[1]);

    // Blur radius
    gl.uniform1f(this.blurVUniforms.get('u_blurRadius')!, this.config.blurRadius);

    // Draw
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Gets the final blurred occlusion texture.
   * This texture can be bound to the lighting pass.
   *
   * @returns Final SSAO occlusion texture (R8, 1.0 = no occlusion, 0.0 = full occlusion)
   */
  getOcclusionTexture(): WebGLTexture | null {
    return this.finalTexture;
  }

  /**
   * Resizes the SSAO pass.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (width === this.config.width && height === this.config.height) {
      return;
    }

    logger.info(`Resizing SSAOPass from ${this.config.width}x${this.config.height} to ${width}x${height}`);

    this.config.width = width;
    this.config.height = height;

    // Destroy old render targets
    this.destroyRenderTargets();

    // Recreate with new size
    this.createRenderTargets();
  }

  /**
   * Destroys render targets.
   */
  private destroyRenderTargets(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.ssaoTexture) gl.deleteTexture(this.ssaoTexture);
    if (this.ssaoFramebuffer) gl.deleteFramebuffer(this.ssaoFramebuffer);
    if (this.blurTexture) gl.deleteTexture(this.blurTexture);
    if (this.blurFramebuffer) gl.deleteFramebuffer(this.blurFramebuffer);
    if (this.finalTexture) gl.deleteTexture(this.finalTexture);
    if (this.finalFramebuffer) gl.deleteFramebuffer(this.finalFramebuffer);

    this.ssaoTexture = null;
    this.ssaoFramebuffer = null;
    this.blurTexture = null;
    this.blurFramebuffer = null;
    this.finalTexture = null;
    this.finalFramebuffer = null;
  }

  /**
   * Cleans up all resources.
   */
  cleanup(): void {
    if (!this.gl) return;

    logger.debug('Cleaning up SSAOPass');

    const gl = this.gl;

    // Delete shaders
    if (this.ssaoShader) gl.deleteProgram(this.ssaoShader);
    if (this.blurHShader) gl.deleteProgram(this.blurHShader);
    if (this.blurVShader) gl.deleteProgram(this.blurVShader);

    // Delete textures and framebuffers
    this.destroyRenderTargets();

    if (this.noiseTexture) gl.deleteTexture(this.noiseTexture);
    if (this.fullscreenVAO) gl.deleteVertexArray(this.fullscreenVAO);

    this.ssaoShader = null;
    this.blurHShader = null;
    this.blurVShader = null;
    this.noiseTexture = null;
    this.fullscreenVAO = null;

    this.sampleKernel = [];
    this.ssaoUniforms.clear();
    this.blurHUniforms.clear();
    this.blurVUniforms.clear();

    logger.info('SSAOPass cleanup complete');
  }

  /**
   * Sets SSAO radius.
   *
   * @param radius - Sampling radius in view space
   */
  setRadius(radius: number): void {
    this.config.radius = radius;
  }

  /**
   * Sets SSAO intensity.
   *
   * @param intensity - Occlusion intensity multiplier
   */
  setIntensity(intensity: number): void {
    this.config.intensity = intensity;
  }

  /**
   * Sets blur radius.
   *
   * @param blurRadius - Blur kernel radius in pixels
   */
  setBlurRadius(blurRadius: number): void {
    this.config.blurRadius = blurRadius;
  }

  /**
   * Enables or disables the SSAO effect.
   *
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

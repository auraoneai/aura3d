/**
 * @module SSAO
 * @description Screen-Space Ambient Occlusion post-processing effect.
 * Implements HBAO-style occlusion with hemisphere sampling and bilateral blur.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap, Texture, TextureDescriptor, TextureFormat } from '../texture/Texture';
import { Vector2, Vector3, Vector4 } from '../../math';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('SSAO');

/**
 * SSAO parameters.
 */
export interface SSAOParameters {
  /** Sampling radius in world units (default: 0.5) */
  radius?: number;
  /** Effect intensity (default: 1.0) */
  intensity?: number;
  /** Bias to prevent self-occlusion (default: 0.025) */
  bias?: number;
  /** Number of samples per pixel (default: 16) */
  samples?: number;
  /** Maximum occlusion distance (default: 1.0) */
  maxDistance?: number;
  /** Blur radius for denoising (default: 4) */
  blurRadius?: number;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Screen-Space Ambient Occlusion (SSAO) effect.
 * Implements high-quality ambient occlusion using hemisphere sampling
 * with normal-oriented kernel and bilateral blur for denoising.
 *
 * Algorithm:
 * 1. Generate random sample kernel (hemisphere)
 * 2. Create noise texture for rotation
 * 3. For each pixel, sample depth buffer in screen space
 * 4. Calculate occlusion based on sample visibility
 * 5. Bilateral blur to reduce noise
 *
 * @example
 * ```typescript
 * const ssao = new SSAO({
 *   radius: 0.5,
 *   intensity: 1.2,
 *   samples: 32,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(ssao);
 *
 * // Adjust parameters
 * ssao.setParameter('radius', 0.75);
 * ssao.setParameter('intensity', 1.5);
 * ```
 */
export class SSAO extends PostProcessEffect {
  /** SSAO calculation shader */
  private ssaoShader: Shader | null = null;

  /** Bilateral blur shader (horizontal) */
  private blurHShader: Shader | null = null;

  /** Bilateral blur shader (vertical) */
  private blurVShader: Shader | null = null;

  /** SSAO render texture */
  private ssaoTexture: RenderTexture | null = null;

  /** Blurred SSAO texture */
  private blurTexture: RenderTexture | null = null;

  /** Random noise texture for sample rotation */
  private noiseTexture: Texture | null = null;

  /** Sample kernel vectors */
  private sampleKernel: Vector3[] = [];

  /** Number of samples */
  private sampleCount: number = 16;

  /** Projection matrix (set externally) */
  private projectionMatrix: Matrix4 = Matrix4.identity();

  /**
   * Creates a new SSAO effect.
   *
   * @param params - SSAO parameters
   */
  constructor(params: SSAOParameters = {}) {
    super('SSAO');

    this.enabled = params.enabled ?? true;
    this.intensity = params.intensity ?? 1.0;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.sampleCount = params.samples ?? 16;

    // Add parameters
    this.addParameter({
      name: 'radius',
      type: 'float',
      value: params.radius ?? 0.5,
      range: [0, 5],
      description: 'Sampling radius in world units',
    });

    this.addParameter({
      name: 'bias',
      type: 'float',
      value: params.bias ?? 0.025,
      range: [0, 0.5],
      description: 'Bias to prevent self-occlusion',
    });

    this.addParameter({
      name: 'maxDistance',
      type: 'float',
      value: params.maxDistance ?? 1.0,
      range: [0, 10],
      description: 'Maximum occlusion distance',
    });

    this.addParameter({
      name: 'blurRadius',
      type: 'float',
      value: params.blurRadius ?? 4.0,
      range: [0, 16],
      description: 'Blur radius for denoising',
    });
  }

  /**
   * Initializes SSAO effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);

    // Generate sample kernel
    this.generateSampleKernel();

    // Create noise texture
    this.createNoiseTexture();

    // Create shaders
    this.createShaders();

    // Create render textures
    this.createRenderTextures(1920, 1080);

    logger.info(`SSAO initialized with ${this.sampleCount} samples`);
  }

  /**
   * Generates hemisphere sample kernel.
   */
  private generateSampleKernel(): void {
    this.sampleKernel = [];

    for (let i = 0; i < this.sampleCount; i++) {
      // Random point in hemisphere
      let sample = new Vector3(
        Math.random() * 2.0 - 1.0,
        Math.random() * 2.0 - 1.0,
        Math.random()
      );

      sample = sample.normalize();

      // Scale samples so they're more aligned to center
      let scale = i / this.sampleCount;
      scale = 0.1 + scale * scale * 0.9; // Lerp from 0.1 to 1.0
      sample = sample.scale(scale);

      this.sampleKernel.push(sample);
    }

    logger.debug(`Generated ${this.sampleKernel.length} sample kernel vectors`);
  }

  /**
   * Creates random noise texture for sample rotation.
   */
  private createNoiseTexture(): void {
    if (!this.gl) return;

    const noiseSize = 4;
    const noiseData = new Float32Array(noiseSize * noiseSize * 3);

    for (let i = 0; i < noiseSize * noiseSize; i++) {
      // Random rotation vectors
      noiseData[i * 3 + 0] = Math.random() * 2.0 - 1.0;
      noiseData[i * 3 + 1] = Math.random() * 2.0 - 1.0;
      noiseData[i * 3 + 2] = 0.0;
    }

    const descriptor: TextureDescriptor = {
      width: noiseSize,
      height: noiseSize,
      format: TextureFormat.RGBA16F,
      minFilter: TextureFilter.Nearest,
      magFilter: TextureFilter.Nearest,
      wrapU: TextureWrap.Repeat,
      wrapV: TextureWrap.Repeat,
      mipLevels: 1,
      label: 'SSAONoise',
    };

    this.noiseTexture = new Texture(descriptor);
    // In real implementation, would upload noiseData to texture

    logger.debug('Created SSAO noise texture');
  }

  /**
   * Creates shaders for SSAO.
   */
  private createShaders(): void {
    if (!this.gl) return;

    // Build sample kernel string for shader
    let kernelStr = '';
    for (let i = 0; i < this.sampleKernel.length; i++) {
      const s = this.sampleKernel[i];
      kernelStr += `  vec3(${s.x.toFixed(6)}, ${s.y.toFixed(6)}, ${s.z.toFixed(6)}),\n`;
    }

    // SSAO shader
    const ssaoSource: ShaderSource = {
      vertex: `#version 300 es
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
          vTexCoord = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `,
      fragment: `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uDepthTexture;
        uniform sampler2D uNormalTexture;
        uniform sampler2D uNoiseTexture;

        uniform mat4 uProjection;
        uniform mat4 uInverseProjection;
        uniform vec2 uNoiseScale;
        uniform float uRadius;
        uniform float uBias;
        uniform float uMaxDistance;
        uniform int uSampleCount;

        const vec3 samples[${this.sampleCount}] = vec3[](
${kernelStr}
        );

        // Reconstruct view space position from depth
        vec3 reconstructPosition(vec2 uv, float depth) {
          vec4 clipSpace = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 viewSpace = uInverseProjection * clipSpace;
          return viewSpace.xyz / viewSpace.w;
        }

        void main() {
          float depth = texture(uDepthTexture, vTexCoord).r;

          // Early out for background
          if (depth >= 0.9999) {
            fragColor = vec4(1.0);
            return;
          }

          vec3 position = reconstructPosition(vTexCoord, depth);
          vec3 normal = normalize(texture(uNormalTexture, vTexCoord).xyz * 2.0 - 1.0);
          vec3 randomVec = normalize(texture(uNoiseTexture, vTexCoord * uNoiseScale).xyz * 2.0 - 1.0);

          // Create TBN matrix
          vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
          vec3 bitangent = cross(normal, tangent);
          mat3 TBN = mat3(tangent, bitangent, normal);

          // Calculate occlusion
          float occlusion = 0.0;
          for (int i = 0; i < uSampleCount; i++) {
            // Get sample position
            vec3 samplePos = TBN * samples[i];
            samplePos = position + samplePos * uRadius;

            // Project sample position
            vec4 offset = uProjection * vec4(samplePos, 1.0);
            offset.xyz /= offset.w;
            offset.xyz = offset.xyz * 0.5 + 0.5;

            // Sample depth
            float sampleDepth = texture(uDepthTexture, offset.xy).r;
            vec3 samplePosition = reconstructPosition(offset.xy, sampleDepth);

            // Range check & accumulate
            float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(position.z - samplePosition.z));
            occlusion += (samplePosition.z >= samplePos.z + uBias ? 1.0 : 0.0) * rangeCheck;
          }

          occlusion = 1.0 - (occlusion / float(uSampleCount));
          fragColor = vec4(vec3(occlusion), 1.0);
        }
      `,
    };

    this.ssaoShader = new Shader({
      name: 'SSAO',
      source: ssaoSource,
      gl: this.gl,
    });

    // Bilateral blur (horizontal)
    const blurHSource: ShaderSource = {
      vertex: `#version 300 es
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
          vTexCoord = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `,
      fragment: `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uTexture;
        uniform sampler2D uDepthTexture;
        uniform vec2 uTexelSize;
        uniform float uBlurRadius;

        void main() {
          float centerDepth = texture(uDepthTexture, vTexCoord).r;
          float result = 0.0;
          float totalWeight = 0.0;

          int radius = int(uBlurRadius);
          for (int x = -radius; x <= radius; x++) {
            vec2 offset = vec2(float(x) * uTexelSize.x, 0.0);
            vec2 sampleUV = vTexCoord + offset;

            float sampleDepth = texture(uDepthTexture, sampleUV).r;
            float depthDiff = abs(centerDepth - sampleDepth);

            // Bilateral weight based on depth difference
            float weight = exp(-depthDiff * 100.0);

            result += texture(uTexture, sampleUV).r * weight;
            totalWeight += weight;
          }

          fragColor = vec4(vec3(result / totalWeight), 1.0);
        }
      `,
    };

    this.blurHShader = new Shader({
      name: 'SSAOBlurH',
      source: blurHSource,
      gl: this.gl,
    });

    // Bilateral blur (vertical)
    const blurVSource: ShaderSource = {
      vertex: `#version 300 es
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
          vTexCoord = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `,
      fragment: `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uTexture;
        uniform sampler2D uDepthTexture;
        uniform vec2 uTexelSize;
        uniform float uBlurRadius;

        void main() {
          float centerDepth = texture(uDepthTexture, vTexCoord).r;
          float result = 0.0;
          float totalWeight = 0.0;

          int radius = int(uBlurRadius);
          for (int y = -radius; y <= radius; y++) {
            vec2 offset = vec2(0.0, float(y) * uTexelSize.y);
            vec2 sampleUV = vTexCoord + offset;

            float sampleDepth = texture(uDepthTexture, sampleUV).r;
            float depthDiff = abs(centerDepth - sampleDepth);

            // Bilateral weight based on depth difference
            float weight = exp(-depthDiff * 100.0);

            result += texture(uTexture, sampleUV).r * weight;
            totalWeight += weight;
          }

          fragColor = vec4(vec3(result / totalWeight), 1.0);
        }
      `,
    };

    this.blurVShader = new Shader({
      name: 'SSAOBlurV',
      source: blurVSource,
      gl: this.gl,
    });
  }

  /**
   * Creates render textures for SSAO.
   *
   * @param width - Width
   * @param height - Height
   */
  private createRenderTextures(width: number, height: number): void {
    const descriptor: RenderTextureDescriptor = {
      width,
      height,
      format: TextureFormat.R8,
      minFilter: TextureFilter.Nearest,
      magFilter: TextureFilter.Nearest,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
    };

    this.ssaoTexture = new RenderTexture({
      ...descriptor,
      label: 'SSAO',
    });

    this.blurTexture = new RenderTexture({
      ...descriptor,
      label: 'SSAOBlur',
    });

    this.tempTextures = [this.ssaoTexture, this.blurTexture];
  }

  /**
   * Sets the projection matrix.
   *
   * @param projection - Projection matrix
   */
  setProjectionMatrix(projection: Matrix4): void {
    this.projectionMatrix = projection;
  }

  /**
   * Renders SSAO effect.
   *
   * @param input - Input texture (with depth and normals)
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.ssaoShader || !this.blurHShader ||
        !this.blurVShader || !this.ssaoTexture || !this.blurTexture) {
      return;
    }

    const radius = this.getParameter('radius')!.value;
    const bias = this.getParameter('bias')!.value;
    const maxDistance = this.getParameter('maxDistance')!.value;
    const blurRadius = this.getParameter('blurRadius')!.value;

    const width = input.getWidth();
    const height = input.getHeight();

    const depthTexture = input.getDepthTexture();

    // Pass 1: Calculate SSAO
    this.ssaoShader.bind();
    if (depthTexture) {
      this.ssaoShader.setUniform('uDepthTexture', depthTexture);
    }
    // Note: In real implementation, would need normal buffer from G-buffer
    if (this.noiseTexture) {
      this.ssaoShader.setUniform('uNoiseTexture', this.noiseTexture);
    }
    this.ssaoShader.setUniform('uProjection', this.projectionMatrix);
    // this.ssaoShader.setUniform('uInverseProjection', this.projectionMatrix.invert());
    this.ssaoShader.setUniform('uNoiseScale', new Vector2(width / 4.0, height / 4.0));
    this.ssaoShader.setUniform('uRadius', radius);
    this.ssaoShader.setUniform('uBias', bias);
    this.ssaoShader.setUniform('uMaxDistance', maxDistance);
    this.ssaoShader.setUniform('uSampleCount', this.sampleCount);
    this.renderQuad(this.ssaoTexture);

    // Pass 2: Horizontal blur
    this.blurHShader.bind();
    this.blurHShader.setUniform('uTexture', this.ssaoTexture.getColorTexture());
    if (depthTexture) {
      this.blurHShader.setUniform('uDepthTexture', depthTexture);
    }
    this.blurHShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.blurHShader.setUniform('uBlurRadius', blurRadius);
    this.renderQuad(this.blurTexture);

    // Pass 3: Vertical blur
    this.blurVShader.bind();
    this.blurVShader.setUniform('uTexture', this.blurTexture.getColorTexture());
    if (depthTexture) {
      this.blurVShader.setUniform('uDepthTexture', depthTexture);
    }
    this.blurVShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.blurVShader.setUniform('uBlurRadius', blurRadius);
    this.renderQuad(output);
  }

  /**
   * Resizes the effect.
   *
   * @param width - New width
   * @param height - New height
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);

    if (this.ssaoTexture) {
      this.ssaoTexture.resize(width, height);
    }
    if (this.blurTexture) {
      this.blurTexture.resize(width, height);
    }
  }

  /**
   * Called when quality changes.
   */
  protected override onQualityChanged(): void {
    // Adjust sample count based on quality
    switch (this.quality) {
      case EffectQuality.Low:
        this.sampleCount = 8;
        break;
      case EffectQuality.Medium:
        this.sampleCount = 16;
        break;
      case EffectQuality.High:
        this.sampleCount = 32;
        break;
      case EffectQuality.Ultra:
        this.sampleCount = 64;
        break;
    }

    // Regenerate kernel and shader
    this.generateSampleKernel();
    if (this.gl) {
      this.createShaders();
    }
  }

  /**
   * Requires depth buffer.
   */
  override requiresDepth(): boolean {
    return true;
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    this.ssaoShader?.dispose();
    this.blurHShader?.dispose();
    this.blurVShader?.dispose();
    this.noiseTexture?.destroy();

    super.dispose();
  }
}

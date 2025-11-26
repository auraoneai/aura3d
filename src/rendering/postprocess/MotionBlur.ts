/**
 * @module MotionBlur
 * @description Per-object and camera motion blur using velocity buffers.
 * Creates realistic motion blur based on object and camera movement.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('MotionBlur');

/**
 * Motion blur parameters.
 */
export interface MotionBlurParameters {
  /** Motion blur intensity (default: 0.5) */
  intensity?: number;
  /** Maximum blur distance in pixels (default: 64) */
  maxBlurDistance?: number;
  /** Number of samples per pixel (default: 16) */
  samples?: number;
  /** Enable tile-based optimization (default: true) */
  tileOptimization?: boolean;
  /** Tile size for optimization (default: 32) */
  tileSize?: number;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Motion Blur effect.
 * Implements per-object motion blur using velocity buffers with
 * tile-based optimization for better performance.
 *
 * @example
 * ```typescript
 * const motionBlur = new MotionBlur({
 *   intensity: 0.8,
 *   maxBlurDistance: 64,
 *   samples: 16,
 *   tileOptimization: true,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(motionBlur);
 *
 * // Adjust blur strength
 * motionBlur.setParameter('intensity', 1.0);
 * ```
 */
export class MotionBlur extends PostProcessEffect {
  /** Tile max velocity shader */
  private tileMaxShader: Shader | null = null;

  /** Neighbor max shader */
  private neighborMaxShader: Shader | null = null;

  /** Motion blur shader */
  private blurShader: Shader | null = null;

  /** Tile velocity texture */
  private tileVelocityTexture: RenderTexture | null = null;

  /** Neighbor max velocity texture */
  private neighborMaxTexture: RenderTexture | null = null;

  /** Tile size for optimization */
  private tileSize: number = 32;

  /** Number of blur samples */
  private sampleCount: number = 16;

  /**
   * Creates a new MotionBlur effect.
   *
   * @param params - Motion blur parameters
   */
  constructor(params: MotionBlurParameters = {}) {
    super('MotionBlur');

    this.enabled = params.enabled ?? true;
    this.intensity = params.intensity ?? 0.5;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.tileSize = params.tileSize ?? 32;
    this.sampleCount = params.samples ?? 16;

    // Add parameters
    this.addParameter({
      name: 'maxBlurDistance',
      type: 'float',
      value: params.maxBlurDistance ?? 64.0,
      range: [0, 256],
      description: 'Maximum blur distance in pixels',
    });

    this.addParameter({
      name: 'tileOptimization',
      type: 'bool',
      value: params.tileOptimization ?? true,
      description: 'Enable tile-based optimization',
    });
  }

  /**
   * Initializes motion blur effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);
    this.createShaders();
    this.createRenderTextures(1920, 1080);
    logger.info('MotionBlur initialized');
  }

  /**
   * Creates shaders for motion blur.
   */
  private createShaders(): void {
    if (!this.gl) return;

    // Tile max velocity shader
    const tileMaxSource: ShaderSource = {
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

        uniform sampler2D uVelocityTexture;
        uniform vec2 uTexelSize;
        uniform int uTileSize;

        void main() {
          vec2 maxVelocity = vec2(0.0);
          float maxLength = 0.0;

          // Find max velocity in tile
          for (int y = 0; y < uTileSize; y++) {
            for (int x = 0; x < uTileSize; x++) {
              vec2 offset = vec2(float(x), float(y)) * uTexelSize;
              vec2 velocity = texture(uVelocityTexture, vTexCoord + offset).xy;
              float length = dot(velocity, velocity);

              if (length > maxLength) {
                maxLength = length;
                maxVelocity = velocity;
              }
            }
          }

          fragColor = vec4(maxVelocity, 0.0, 1.0);
        }
      `,
    };

    this.tileMaxShader = new Shader({
      name: 'MotionBlurTileMax',
      source: tileMaxSource,
      gl: this.gl,
    });

    // Neighbor max shader
    const neighborMaxSource: ShaderSource = {
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

        uniform sampler2D uTileVelocityTexture;
        uniform vec2 uTexelSize;

        void main() {
          vec2 maxVelocity = vec2(0.0);
          float maxLength = 0.0;

          // Find max velocity in 3x3 neighborhood
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y)) * uTexelSize;
              vec2 velocity = texture(uTileVelocityTexture, vTexCoord + offset).xy;
              float length = dot(velocity, velocity);

              if (length > maxLength) {
                maxLength = length;
                maxVelocity = velocity;
              }
            }
          }

          fragColor = vec4(maxVelocity, 0.0, 1.0);
        }
      `,
    };

    this.neighborMaxShader = new Shader({
      name: 'MotionBlurNeighborMax',
      source: neighborMaxSource,
      gl: this.gl,
    });

    // Motion blur shader
    const blurSource: ShaderSource = {
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
        uniform sampler2D uVelocityTexture;
        uniform sampler2D uNeighborMaxTexture;
        uniform sampler2D uDepthTexture;

        uniform float uIntensity;
        uniform float uMaxBlurDistance;
        uniform int uSampleCount;
        uniform bool uTileOptimization;
        uniform vec2 uTexelSize;

        // Random jitter for temporal stability
        float random(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 velocity = texture(uVelocityTexture, vTexCoord).xy;

          // Use neighbor max for tile optimization
          if (uTileOptimization) {
            vec2 neighborVelocity = texture(uNeighborMaxTexture, vTexCoord).xy;
            velocity = mix(velocity, neighborVelocity, 0.5);
          }

          // Scale velocity by intensity and max distance
          velocity *= uIntensity * uMaxBlurDistance;

          // Clamp velocity
          float velocityLength = length(velocity);
          if (velocityLength > uMaxBlurDistance) {
            velocity = normalize(velocity) * uMaxBlurDistance;
          }

          // Early out if velocity is too small
          if (velocityLength < 0.5) {
            fragColor = texture(uTexture, vTexCoord);
            return;
          }

          float centerDepth = texture(uDepthTexture, vTexCoord).r;

          vec3 color = vec3(0.0);
          float totalWeight = 0.0;

          // Random jitter for temporal anti-aliasing
          float jitter = random(vTexCoord) - 0.5;

          // Sample along velocity vector
          for (int i = 0; i < uSampleCount; i++) {
            float t = (float(i) + jitter) / float(uSampleCount - 1);
            t = t * 2.0 - 1.0; // [-1, 1]

            vec2 offset = velocity * t * uTexelSize;
            vec2 sampleUV = vTexCoord + offset;

            // Boundary check
            if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
              continue;
            }

            vec3 sampleColor = texture(uTexture, sampleUV).rgb;
            float sampleDepth = texture(uDepthTexture, sampleUV).r;

            // Depth-based weighting to prevent foreground bleed
            float depthDiff = abs(centerDepth - sampleDepth);
            float weight = exp(-depthDiff * 100.0);

            color += sampleColor * weight;
            totalWeight += weight;
          }

          // Normalize
          if (totalWeight > 0.0) {
            color /= totalWeight;
          } else {
            color = texture(uTexture, vTexCoord).rgb;
          }

          fragColor = vec4(color, 1.0);
        }
      `,
    };

    this.blurShader = new Shader({
      name: 'MotionBlur',
      source: blurSource,
      gl: this.gl,
    });
  }

  /**
   * Creates render textures.
   *
   * @param width - Width
   * @param height - Height
   */
  private createRenderTextures(width: number, height: number): void {
    const tileWidth = Math.ceil(width / this.tileSize);
    const tileHeight = Math.ceil(height / this.tileSize);

    const tileDescriptor: RenderTextureDescriptor = {
      width: tileWidth,
      height: tileHeight,
      format: TextureFormat.RGBA16F,
      minFilter: TextureFilter.Nearest,
      magFilter: TextureFilter.Nearest,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
    };

    this.tileVelocityTexture = new RenderTexture({
      ...tileDescriptor,
      label: 'MotionBlurTileVelocity',
    });

    this.neighborMaxTexture = new RenderTexture({
      ...tileDescriptor,
      label: 'MotionBlurNeighborMax',
    });

    this.tempTextures = [this.tileVelocityTexture, this.neighborMaxTexture];
  }

  /**
   * Renders motion blur effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.tileMaxShader || !this.neighborMaxShader ||
        !this.blurShader || !this.tileVelocityTexture || !this.neighborMaxTexture) {
      return;
    }

    const maxBlurDistance = this.getParameter('maxBlurDistance')!.value;
    const tileOptimization = this.getParameter('tileOptimization')!.value;

    const width = input.getWidth();
    const height = input.getHeight();

    // Note: In real implementation, need velocity buffer from renderer
    // For now, we'll assume velocity data is available

    if (tileOptimization) {
      // Pass 1: Calculate tile max velocities
      this.tileMaxShader.bind();
      // this.tileMaxShader.setUniform('uVelocityTexture', velocityBuffer);
      this.tileMaxShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
      this.tileMaxShader.setUniform('uTileSize', this.tileSize);
      this.renderQuad(this.tileVelocityTexture);

      // Pass 2: Calculate neighbor max
      this.neighborMaxShader.bind();
      this.neighborMaxShader.setUniform('uTileVelocityTexture', this.tileVelocityTexture.getColorTexture());
      const tileTexelSize = new Vector2(
        1.0 / this.tileVelocityTexture.getWidth(),
        1.0 / this.tileVelocityTexture.getHeight()
      );
      this.neighborMaxShader.setUniform('uTexelSize', tileTexelSize);
      this.renderQuad(this.neighborMaxTexture);
    }

    // Pass 3: Apply motion blur
    this.blurShader.bind();
    this.blurShader.setUniform('uTexture', input.getColorTexture());
    // this.blurShader.setUniform('uVelocityTexture', velocityBuffer);
    this.blurShader.setUniform('uNeighborMaxTexture', this.neighborMaxTexture.getColorTexture());
    const depthTexture = input.getDepthTexture();
    if (depthTexture) {
      this.blurShader.setUniform('uDepthTexture', depthTexture);
    }
    this.blurShader.setUniform('uIntensity', this.intensity);
    this.blurShader.setUniform('uMaxBlurDistance', maxBlurDistance);
    this.blurShader.setUniform('uSampleCount', this.sampleCount);
    this.blurShader.setUniform('uTileOptimization', tileOptimization);
    this.blurShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
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

    const tileWidth = Math.ceil(width / this.tileSize);
    const tileHeight = Math.ceil(height / this.tileSize);

    this.tileVelocityTexture?.resize(tileWidth, tileHeight);
    this.neighborMaxTexture?.resize(tileWidth, tileHeight);
  }

  /**
   * Called when quality changes.
   */
  protected override onQualityChanged(): void {
    switch (this.quality) {
      case EffectQuality.Low:
        this.sampleCount = 8;
        break;
      case EffectQuality.Medium:
        this.sampleCount = 16;
        break;
      case EffectQuality.High:
        this.sampleCount = 24;
        break;
      case EffectQuality.Ultra:
        this.sampleCount = 32;
        break;
    }
  }

  /**
   * Requires motion vectors.
   */
  override requiresMotionVectors(): boolean {
    return true;
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
    this.tileMaxShader?.dispose();
    this.neighborMaxShader?.dispose();
    this.blurShader?.dispose();

    super.dispose();
  }
}

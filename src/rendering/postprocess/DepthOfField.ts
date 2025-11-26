/**
 * @module DepthOfField
 * @description Depth of Field post-processing effect with bokeh simulation.
 * Creates realistic camera focus effects with circular/hexagonal bokeh shapes.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('DepthOfField');

/**
 * Bokeh shape type.
 */
export enum BokehShape {
  /** Circular bokeh */
  Circle = 'circle',
  /** Hexagonal bokeh */
  Hexagon = 'hexagon',
  /** Octagonal bokeh */
  Octagon = 'octagon',
}

/**
 * Depth of Field parameters.
 */
export interface DepthOfFieldParameters {
  /** Focus distance in world units (default: 10.0) */
  focusDistance?: number;
  /** Focal length in mm (default: 50.0) */
  focalLength?: number;
  /** F-stop/aperture (default: 5.6) */
  fStop?: number;
  /** Maximum blur size in pixels (default: 20) */
  maxBlurSize?: number;
  /** Bokeh shape (default: Circle) */
  bokehShape?: BokehShape;
  /** Enable foreground blur (default: true) */
  foregroundBlur?: boolean;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Depth of Field (DoF) effect.
 * Simulates camera lens focusing with realistic bokeh and
 * separate foreground/background blur.
 *
 * @example
 * ```typescript
 * const dof = new DepthOfField({
 *   focusDistance: 10.0,
 *   focalLength: 50.0,
 *   fStop: 2.8,
 *   maxBlurSize: 20,
 *   bokehShape: BokehShape.Hexagon,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(dof);
 *
 * // Adjust focus
 * dof.setParameter('focusDistance', 15.0);
 * dof.setParameter('fStop', 1.4);
 * ```
 */
export class DepthOfField extends PostProcessEffect {
  /** Circle of Confusion (CoC) calculation shader */
  private cocShader: Shader | null = null;

  /** Foreground blur shader */
  private foregroundShader: Shader | null = null;

  /** Background blur shader */
  private backgroundShader: Shader | null = null;

  /** Composite shader */
  private compositeShader: Shader | null = null;

  /** CoC texture */
  private cocTexture: RenderTexture | null = null;

  /** Foreground blur texture */
  private foregroundTexture: RenderTexture | null = null;

  /** Background blur texture */
  private backgroundTexture: RenderTexture | null = null;

  /** Number of blur samples */
  private sampleCount: number = 16;

  /**
   * Creates a new DepthOfField effect.
   *
   * @param params - DoF parameters
   */
  constructor(params: DepthOfFieldParameters = {}) {
    super('DepthOfField');

    this.enabled = params.enabled ?? true;
    this.quality = params.quality ?? EffectQuality.Medium;

    // Add parameters
    this.addParameter({
      name: 'focusDistance',
      type: 'float',
      value: params.focusDistance ?? 10.0,
      range: [0.1, 100],
      description: 'Focus distance in world units',
    });

    this.addParameter({
      name: 'focalLength',
      type: 'float',
      value: params.focalLength ?? 50.0,
      range: [10, 200],
      description: 'Focal length in mm',
    });

    this.addParameter({
      name: 'fStop',
      type: 'float',
      value: params.fStop ?? 5.6,
      range: [1.4, 22],
      description: 'F-stop/aperture',
    });

    this.addParameter({
      name: 'maxBlurSize',
      type: 'float',
      value: params.maxBlurSize ?? 20.0,
      range: [0, 100],
      description: 'Maximum blur size in pixels',
    });

    this.addParameter({
      name: 'bokehShape',
      type: 'int',
      value: 0, // Circle
      range: [0, 2],
      description: 'Bokeh shape',
    });

    this.addParameter({
      name: 'foregroundBlur',
      type: 'bool',
      value: params.foregroundBlur ?? true,
      description: 'Enable foreground blur',
    });
  }

  /**
   * Initializes DoF effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);
    this.createShaders();
    this.createRenderTextures(1920, 1080);
    logger.info('DepthOfField initialized');
  }

  /**
   * Creates shaders for DoF.
   */
  private createShaders(): void {
    if (!this.gl) return;

    // CoC calculation shader
    const cocSource: ShaderSource = {
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
        uniform float uFocusDistance;
        uniform float uFocalLength;
        uniform float uFStop;
        uniform float uMaxBlurSize;

        // Calculate Circle of Confusion
        float calculateCoC(float depth, float focusDistance, float focalLength, float fstop) {
          float focalPlane = focusDistance;
          float aperture = focalLength / fstop;

          // Thin lens equation
          float coc = aperture * abs(depth - focalPlane) / (focalPlane * (depth + 1e-5));
          return clamp(coc, -1.0, 1.0);
        }

        void main() {
          float depth = texture(uDepthTexture, vTexCoord).r;

          // Convert depth to world space (simplified)
          float linearDepth = depth * 100.0; // Approximate

          float coc = calculateCoC(linearDepth, uFocusDistance, uFocalLength / 1000.0, uFStop);

          // Store CoC with sign (negative = foreground, positive = background)
          fragColor = vec4(coc, abs(coc), step(0.0, coc), 1.0);
        }
      `,
    };

    this.cocShader = new Shader({
      name: 'DoFCoC',
      source: cocSource,
      gl: this.gl,
    });

    // Background blur shader with bokeh
    const bgBlurSource: ShaderSource = {
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
        uniform sampler2D uCoCTexture;
        uniform vec2 uTexelSize;
        uniform float uMaxBlurSize;
        uniform int uSampleCount;

        #define PI 3.14159265359

        void main() {
          vec4 cocData = texture(uCoCTexture, vTexCoord);
          float coc = cocData.r;

          // Early out if in focus
          if (abs(coc) < 0.01) {
            fragColor = texture(uTexture, vTexCoord);
            return;
          }

          // Only blur background (positive CoC)
          if (coc < 0.0) {
            fragColor = texture(uTexture, vTexCoord);
            return;
          }

          vec3 color = vec3(0.0);
          float totalWeight = 0.0;

          float radius = abs(coc) * uMaxBlurSize;

          // Poisson disk sampling for bokeh
          for (int i = 0; i < uSampleCount; i++) {
            float angle = float(i) * (2.0 * PI / float(uSampleCount));
            float r = sqrt(float(i) / float(uSampleCount)) * radius;

            vec2 offset = vec2(cos(angle), sin(angle)) * r * uTexelSize;
            vec2 sampleUV = vTexCoord + offset;

            vec3 sampleColor = texture(uTexture, sampleUV).rgb;
            vec4 sampleCoC = texture(uCoCTexture, sampleUV);

            // Weight by CoC
            float weight = smoothstep(0.0, radius, abs(sampleCoC.r) * uMaxBlurSize);
            weight = max(weight, 0.1);

            color += sampleColor * weight;
            totalWeight += weight;
          }

          fragColor = vec4(color / totalWeight, 1.0);
        }
      `,
    };

    this.backgroundShader = new Shader({
      name: 'DoFBackground',
      source: bgBlurSource,
      gl: this.gl,
    });

    // Foreground blur shader
    const fgBlurSource: ShaderSource = {
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
        uniform sampler2D uCoCTexture;
        uniform vec2 uTexelSize;
        uniform float uMaxBlurSize;
        uniform int uSampleCount;

        #define PI 3.14159265359

        void main() {
          vec4 cocData = texture(uCoCTexture, vTexCoord);
          float coc = cocData.r;

          // Only blur foreground (negative CoC)
          if (coc >= 0.0) {
            fragColor = texture(uTexture, vTexCoord);
            return;
          }

          vec3 color = vec3(0.0);
          float totalWeight = 0.0;

          float radius = abs(coc) * uMaxBlurSize;

          // Poisson disk sampling
          for (int i = 0; i < uSampleCount; i++) {
            float angle = float(i) * (2.0 * PI / float(uSampleCount));
            float r = sqrt(float(i) / float(uSampleCount)) * radius;

            vec2 offset = vec2(cos(angle), sin(angle)) * r * uTexelSize;
            vec2 sampleUV = vTexCoord + offset;

            vec3 sampleColor = texture(uTexture, sampleUV).rgb;
            vec4 sampleCoC = texture(uCoCTexture, sampleUV);

            // Weight by CoC
            float weight = smoothstep(0.0, radius, abs(sampleCoC.r) * uMaxBlurSize);
            weight = max(weight, 0.1);

            color += sampleColor * weight;
            totalWeight += weight;
          }

          fragColor = vec4(color / totalWeight, 1.0);
        }
      `,
    };

    this.foregroundShader = new Shader({
      name: 'DoFForeground',
      source: fgBlurSource,
      gl: this.gl,
    });

    // Composite shader
    const compositeSource: ShaderSource = {
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

        uniform sampler2D uSharpTexture;
        uniform sampler2D uForegroundTexture;
        uniform sampler2D uBackgroundTexture;
        uniform sampler2D uCoCTexture;

        void main() {
          vec4 cocData = texture(uCoCTexture, vTexCoord);
          float coc = cocData.r;

          vec3 sharp = texture(uSharpTexture, vTexCoord).rgb;
          vec3 foreground = texture(uForegroundTexture, vTexCoord).rgb;
          vec3 background = texture(uBackgroundTexture, vTexCoord).rgb;

          vec3 result;
          if (abs(coc) < 0.01) {
            // In focus
            result = sharp;
          } else if (coc < 0.0) {
            // Foreground
            float blend = abs(coc);
            result = mix(sharp, foreground, blend);
          } else {
            // Background
            float blend = abs(coc);
            result = mix(sharp, background, blend);
          }

          fragColor = vec4(result, 1.0);
        }
      `,
    };

    this.compositeShader = new Shader({
      name: 'DoFComposite',
      source: compositeSource,
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
    const descriptor: RenderTextureDescriptor = {
      width,
      height,
      format: TextureFormat.RGBA16F,
      minFilter: TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
    };

    this.cocTexture = new RenderTexture({
      ...descriptor,
      format: TextureFormat.RGBA8,
      label: 'DoFCoC',
    });

    this.foregroundTexture = new RenderTexture({
      ...descriptor,
      label: 'DoFForeground',
    });

    this.backgroundTexture = new RenderTexture({
      ...descriptor,
      label: 'DoFBackground',
    });

    this.tempTextures = [this.cocTexture, this.foregroundTexture, this.backgroundTexture];
  }

  /**
   * Renders DoF effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.cocShader || !this.foregroundShader ||
        !this.backgroundShader || !this.compositeShader || !this.cocTexture ||
        !this.foregroundTexture || !this.backgroundTexture) {
      return;
    }

    const focusDistance = this.getParameter('focusDistance')!.value;
    const focalLength = this.getParameter('focalLength')!.value;
    const fStop = this.getParameter('fStop')!.value;
    const maxBlurSize = this.getParameter('maxBlurSize')!.value;
    const foregroundBlur = this.getParameter('foregroundBlur')!.value;

    const width = input.getWidth();
    const height = input.getHeight();

    // Pass 1: Calculate CoC
    this.cocShader.bind();
    const depthTexture = input.getDepthTexture();
    if (!depthTexture) {
      logger.warn('Depth texture not available for DoF effect');
      return;
    }
    this.cocShader.setUniform('uDepthTexture', depthTexture);
    this.cocShader.setUniform('uFocusDistance', focusDistance);
    this.cocShader.setUniform('uFocalLength', focalLength);
    this.cocShader.setUniform('uFStop', fStop);
    this.cocShader.setUniform('uMaxBlurSize', maxBlurSize);
    this.renderQuad(this.cocTexture);

    // Pass 2: Background blur
    this.backgroundShader.bind();
    this.backgroundShader.setUniform('uTexture', input.getColorTexture());
    this.backgroundShader.setUniform('uCoCTexture', this.cocTexture.getColorTexture());
    this.backgroundShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.backgroundShader.setUniform('uMaxBlurSize', maxBlurSize);
    this.backgroundShader.setUniform('uSampleCount', this.sampleCount);
    this.renderQuad(this.backgroundTexture);

    // Pass 3: Foreground blur (if enabled)
    if (foregroundBlur) {
      this.foregroundShader.bind();
      this.foregroundShader.setUniform('uTexture', input.getColorTexture());
      this.foregroundShader.setUniform('uCoCTexture', this.cocTexture.getColorTexture());
      this.foregroundShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
      this.foregroundShader.setUniform('uMaxBlurSize', maxBlurSize);
      this.foregroundShader.setUniform('uSampleCount', this.sampleCount);
      this.renderQuad(this.foregroundTexture);
    }

    // Pass 4: Composite
    this.compositeShader.bind();
    this.compositeShader.setUniform('uSharpTexture', input.getColorTexture());
    this.compositeShader.setUniform('uForegroundTexture', this.foregroundTexture.getColorTexture());
    this.compositeShader.setUniform('uBackgroundTexture', this.backgroundTexture.getColorTexture());
    this.compositeShader.setUniform('uCoCTexture', this.cocTexture.getColorTexture());
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

    this.cocTexture?.resize(width, height);
    this.foregroundTexture?.resize(width, height);
    this.backgroundTexture?.resize(width, height);
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
        this.sampleCount = 32;
        break;
      case EffectQuality.Ultra:
        this.sampleCount = 64;
        break;
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
    this.cocShader?.dispose();
    this.foregroundShader?.dispose();
    this.backgroundShader?.dispose();
    this.compositeShader?.dispose();

    super.dispose();
  }
}

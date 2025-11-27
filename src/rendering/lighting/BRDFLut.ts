/**
 * @module Rendering/Lighting
 * @description
 * BRDF lookup table generator for split-sum approximation in PBR rendering.
 * Generates a 2D texture containing the scale and bias terms for the specular
 * BRDF integral.
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('BRDFLut');

/**
 * BRDF LUT configuration.
 */
export interface BRDFLutConfig {
  /** LUT resolution (width and height) */
  resolution: number;
  /** Number of samples for integration */
  sampleCount: number;
  /** Texture format */
  format: 'rg16f' | 'rg32f';
  /** Use compute shader (if available) */
  useCompute: boolean;
}

/**
 * BRDF lookup table generator for PBR specular IBL.
 *
 * Generates a 2D lookup table for the split-sum approximation used in
 * image-based lighting. The LUT stores scale and bias factors for the
 * specular BRDF integral as a function of:
 * - X axis: NdotV (cosine of angle between normal and view direction)
 * - Y axis: roughness
 *
 * The integration is performed using importance sampling with the GGX
 * distribution and the Schlick approximation for Fresnel.
 *
 * @example
 * ```typescript
 * // Generate BRDF LUT
 * const brdfLut = new BRDFLut();
 * const texture = brdfLut.generate(gl);
 *
 * // Use in shader
 * shader.setUniform('u_brdfLut', texture);
 *
 * // In fragment shader:
 * // vec2 envBRDF = texture(u_brdfLut, vec2(NdotV, roughness)).rg;
 * // vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
 * ```
 */
export class BRDFLut {
  /**
   * Configuration for LUT generation.
   */
  readonly config: BRDFLutConfig;

  /**
   * Generated LUT texture.
   */
  private lutTexture: WebGLTexture | null;

  /**
   * Shader program for LUT generation.
   */
  private shader: WebGLProgram | null;

  /**
   * Creates a new BRDFLut instance.
   *
   * @param config - LUT generation configuration
   *
   * @example
   * ```typescript
   * // High quality LUT
   * const brdfLut = new BRDFLut({
   *   resolution: 512,
   *   sampleCount: 2048,
   *   format: 'rg16f',
   *   useCompute: false
   * });
   *
   * // Performance-oriented LUT
   * const brdfLutFast = new BRDFLut({
   *   resolution: 256,
   *   sampleCount: 512,
   *   format: 'rg16f',
   *   useCompute: false
   * });
   * ```
   */
  constructor(config: Partial<BRDFLutConfig> = {}) {
    this.config = {
      resolution: config.resolution || 512,
      sampleCount: config.sampleCount || 1024,
      format: config.format || 'rg16f',
      useCompute: config.useCompute ?? false,
    };

    this.lutTexture = null;
    this.shader = null;
  }

  /**
   * Generates the BRDF lookup table.
   *
   * @param gl - WebGL2 rendering context
   * @returns Generated LUT texture
   *
   * @example
   * ```typescript
   * const brdfLut = new BRDFLut();
   * const texture = brdfLut.generate(gl);
   *
   * // Bind for use in PBR shader
   * gl.activeTexture(gl.TEXTURE5);
   * gl.bindTexture(gl.TEXTURE_2D, texture);
   * ```
   */
  generate(gl: WebGL2RenderingContext): WebGLTexture | null {
    // Create LUT texture
    this.lutTexture = gl.createTexture();
    if (!this.lutTexture) {
      logger.error('Failed to create BRDF LUT texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);

    // Determine internal format
    const internalFormat = this.config.format === 'rg32f' ? gl.RG32F : gl.RG16F;

    // Allocate texture storage
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      this.config.resolution,
      this.config.resolution,
      0,
      gl.RG,
      gl.FLOAT,
      null
    );

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Generate LUT content
    if (this.config.useCompute) {
      // Use compute shader if available (WebGL doesn't support compute, but WebGPU does)
      logger.warn('Compute shader not supported in WebGL2, falling back to render-to-texture');
      this.generateRenderToTexture(gl);
    } else {
      this.generateRenderToTexture(gl);
    }

    return this.lutTexture;
  }

  /**
   * Generates BRDF LUT using render-to-texture approach.
   */
  private generateRenderToTexture(gl: WebGL2RenderingContext): void {
    if (!this.lutTexture) return;

    // Create shader for LUT generation
    this.shader = this.createBRDFShader(gl);
    if (!this.shader) {
      logger.error('Failed to create BRDF shader');
      return;
    }

    // Create FBO for rendering
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // Attach LUT texture to FBO
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.lutTexture,
      0
    );

    // Check FBO completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      logger.error(`BRDF LUT FBO incomplete: ${status}`);
      gl.deleteFramebuffer(fbo);
      return;
    }

    // Save viewport
    const savedViewport = gl.getParameter(gl.VIEWPORT);

    // Set viewport to LUT resolution
    gl.viewport(0, 0, this.config.resolution, this.config.resolution);

    // Clear
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable depth test and blending
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Use shader
    gl.useProgram(this.shader);

    // Upload sample count
    const sampleCountLoc = gl.getUniformLocation(this.shader, 'u_sampleCount');
    gl.uniform1i(sampleCountLoc, this.config.sampleCount);

    // Render fullscreen quad
    this.renderFullscreenQuad(gl, this.shader);

    // Restore state
    gl.viewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
  }

  /**
   * Creates BRDF integration shader.
   */
  private createBRDFShader(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = `#version 300 es
      in vec2 a_position;
      out vec2 v_uv;

      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;

      in vec2 v_uv;
      out vec4 fragColor;

      uniform int u_sampleCount;

      const float PI = 3.14159265359;

      // Van der Corput sequence for low-discrepancy sampling
      float RadicalInverse_VdC(uint bits) {
        bits = (bits << 16u) | (bits >> 16u);
        bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
        bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
        bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
        bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
        return float(bits) * 2.3283064365386963e-10;
      }

      // Hammersley point set
      vec2 Hammersley(uint i, uint N) {
        return vec2(float(i) / float(N), RadicalInverse_VdC(i));
      }

      // GGX importance sampling
      vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
        float a = roughness * roughness;

        float phi = 2.0 * PI * Xi.x;
        float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
        float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

        // Spherical to cartesian
        vec3 H;
        H.x = cos(phi) * sinTheta;
        H.y = sin(phi) * sinTheta;
        H.z = cosTheta;

        // Tangent to world space
        vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        vec3 tangent = normalize(cross(up, N));
        vec3 bitangent = cross(N, tangent);

        vec3 sampleVec = tangent * H.x + bitangent * H.y + N * H.z;
        return normalize(sampleVec);
      }

      // Geometry function (Smith's method with GGX)
      float GeometrySchlickGGX(float NdotV, float roughness) {
        float a = roughness;
        float k = (a * a) / 2.0; // For IBL

        float nom = NdotV;
        float denom = NdotV * (1.0 - k) + k;

        return nom / denom;
      }

      float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
        float NdotV = max(dot(N, V), 0.0);
        float NdotL = max(dot(N, L), 0.0);
        float ggx2 = GeometrySchlickGGX(NdotV, roughness);
        float ggx1 = GeometrySchlickGGX(NdotL, roughness);

        return ggx1 * ggx2;
      }

      // BRDF integration for split-sum approximation
      vec2 IntegrateBRDF(float NdotV, float roughness) {
        vec3 V;
        V.x = sqrt(1.0 - NdotV * NdotV);
        V.y = 0.0;
        V.z = NdotV;

        float A = 0.0;
        float B = 0.0;

        vec3 N = vec3(0.0, 0.0, 1.0);

        uint SAMPLE_COUNT = uint(u_sampleCount);

        for (uint i = 0u; i < SAMPLE_COUNT; ++i) {
          vec2 Xi = Hammersley(i, SAMPLE_COUNT);
          vec3 H = ImportanceSampleGGX(Xi, N, roughness);
          vec3 L = normalize(2.0 * dot(V, H) * H - V);

          float NdotL = max(L.z, 0.0);
          float NdotH = max(H.z, 0.0);
          float VdotH = max(dot(V, H), 0.0);

          if (NdotL > 0.0) {
            float G = GeometrySmith(N, V, L, roughness);
            float G_Vis = (G * VdotH) / (NdotH * NdotV);
            float Fc = pow(1.0 - VdotH, 5.0);

            A += (1.0 - Fc) * G_Vis;
            B += Fc * G_Vis;
          }
        }

        A /= float(SAMPLE_COUNT);
        B /= float(SAMPLE_COUNT);

        return vec2(A, B);
      }

      void main() {
        float NdotV = v_uv.x;
        float roughness = v_uv.y;

        // Clamp to avoid numerical issues
        NdotV = clamp(NdotV, 0.0, 1.0);
        roughness = clamp(roughness, 0.0, 1.0);

        vec2 integratedBRDF = IntegrateBRDF(NdotV, roughness);

        fragColor = vec4(integratedBRDF, 0.0, 1.0);
      }
    `;

    return this.compileShaderProgram(gl, vs, fs);
  }

  /**
   * Compiles shader program.
   */
  private compileShaderProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
  ): WebGLProgram | null {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);

    if (!vs || !fs) return null;

    // Compile vertex shader
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      logger.error('VS compile error:', gl.getShaderInfoLog(vs));
      return null;
    }

    // Compile fragment shader
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      logger.error('FS compile error:', gl.getShaderInfoLog(fs));
      return null;
    }

    // Link program
    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  /**
   * Renders a fullscreen quad.
   */
  private renderFullscreenQuad(gl: WebGL2RenderingContext, shader: WebGLProgram): void {
    // Create quad vertices
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);

    // Create VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Create VBO
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Setup attribute
    const posLoc = gl.getAttribLocation(shader, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Cleanup
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
  }

  /**
   * Gets the generated LUT texture.
   *
   * @returns LUT texture or null if not generated
   */
  getTexture(): WebGLTexture | null {
    return this.lutTexture;
  }

  /**
   * Disposes of GPU resources.
   *
   * @param gl - WebGL2 rendering context
   */
  dispose(gl: WebGL2RenderingContext): void {
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
      this.lutTexture = null;
    }

    if (this.shader) {
      gl.deleteProgram(this.shader);
      this.shader = null;
    }
  }

  /**
   * Generates BRDF LUT using CPU computation (fallback).
   *
   * @param resolution - LUT resolution
   * @param sampleCount - Number of samples for integration
   * @returns Float array with RG data
   */
  static generateCPU(resolution: number = 512, sampleCount: number = 1024): Float32Array {
    const data = new Float32Array(resolution * resolution * 2);

    for (let y = 0; y < resolution; y++) {
      const roughness = (y + 0.5) / resolution;

      for (let x = 0; x < resolution; x++) {
        const NdotV = (x + 0.5) / resolution;

        const result = this.integrateBRDF(NdotV, roughness, sampleCount);

        const index = (y * resolution + x) * 2;
        data[index + 0] = result[0]; // Scale
        data[index + 1] = result[1]; // Bias
      }
    }

    return data;
  }

  /**
   * CPU-based BRDF integration.
   */
  private static integrateBRDF(NdotV: number, roughness: number, sampleCount: number): [number, number] {
    const V = [
      Math.sqrt(1.0 - NdotV * NdotV),
      0.0,
      NdotV
    ];

    let A = 0.0;
    let B = 0.0;

    const N = [0.0, 0.0, 1.0];

    for (let i = 0; i < sampleCount; i++) {
      const Xi = this.hammersley(i, sampleCount);
      const H = this.importanceSampleGGX(Xi, N as [number, number, number], roughness);

      // L = reflect(-V, H)
      const VdotH = V[0] * H[0] + V[1] * H[1] + V[2] * H[2];
      const L = [
        2.0 * VdotH * H[0] - V[0],
        2.0 * VdotH * H[1] - V[1],
        2.0 * VdotH * H[2] - V[2]
      ];

      const NdotL = Math.max(L[2], 0.0);
      const NdotH = Math.max(H[2], 0.0);

      if (NdotL > 0.0) {
        const G = this.geometrySmith(N as [number, number, number], V as [number, number, number], L as [number, number, number], roughness);
        const G_Vis = (G * VdotH) / (NdotH * NdotV);
        const Fc = Math.pow(1.0 - VdotH, 5.0);

        A += (1.0 - Fc) * G_Vis;
        B += Fc * G_Vis;
      }
    }

    return [A / sampleCount, B / sampleCount];
  }

  /**
   * Van der Corput sequence.
   */
  private static radicalInverseVdC(bits: number): number {
    bits = (bits << 16) | (bits >>> 16);
    bits = ((bits & 0x55555555) << 1) | ((bits & 0xAAAAAAAA) >>> 1);
    bits = ((bits & 0x33333333) << 2) | ((bits & 0xCCCCCCCC) >>> 2);
    bits = ((bits & 0x0F0F0F0F) << 4) | ((bits & 0xF0F0F0F0) >>> 4);
    bits = ((bits & 0x00FF00FF) << 8) | ((bits & 0xFF00FF00) >>> 8);
    return (bits >>> 0) * 2.3283064365386963e-10;
  }

  /**
   * Hammersley point set.
   */
  private static hammersley(i: number, N: number): [number, number] {
    return [i / N, this.radicalInverseVdC(i)];
  }

  /**
   * GGX importance sampling.
   */
  private static importanceSampleGGX(Xi: [number, number], N: [number, number, number], roughness: number): [number, number, number] {
    const a = roughness * roughness;

    const phi = 2.0 * Math.PI * Xi[0];
    const cosTheta = Math.sqrt((1.0 - Xi[1]) / (1.0 + (a * a - 1.0) * Xi[1]));
    const sinTheta = Math.sqrt(1.0 - cosTheta * cosTheta);

    const H: [number, number, number] = [
      Math.cos(phi) * sinTheta,
      Math.sin(phi) * sinTheta,
      cosTheta
    ];

    // Tangent to world space
    const up: [number, number, number] = Math.abs(N[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0];
    const tangent = this.normalize(this.cross(up, N));
    const bitangent = this.cross(N, tangent);

    return this.normalize([
      tangent[0] * H[0] + bitangent[0] * H[1] + N[0] * H[2],
      tangent[1] * H[0] + bitangent[1] * H[1] + N[1] * H[2],
      tangent[2] * H[0] + bitangent[2] * H[1] + N[2] * H[2]
    ]);
  }

  /**
   * Geometry function.
   */
  private static geometrySchlickGGX(NdotV: number, roughness: number): number {
    const a = roughness;
    const k = (a * a) / 2.0;

    return NdotV / (NdotV * (1.0 - k) + k);
  }

  /**
   * Smith's geometry function.
   */
  private static geometrySmith(N: [number, number, number], V: [number, number, number], L: [number, number, number], roughness: number): number {
    const NdotV = Math.max(this.dot(N, V), 0.0);
    const NdotL = Math.max(this.dot(N, L), 0.0);
    const ggx2 = this.geometrySchlickGGX(NdotV, roughness);
    const ggx1 = this.geometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
  }

  /**
   * Vector operations.
   */
  private static dot(a: [number, number, number], b: [number, number, number]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  private static cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  private static normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }
}

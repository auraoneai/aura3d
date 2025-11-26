/**
 * Ocean rendering pass with FFT-based water simulation.
 *
 * Features:
 * - FFT ocean displacement and normals
 * - Gerstner wave displacement
 * - Foam generation and rendering
 * - Underwater fog and caustics hooks
 * - Reflection/refraction sampling
 * - LOD for distant ocean
 * - Wind direction and speed parameters
 *
 * Based on Jerry Tessendorf's FFT ocean simulation and Gerstner wave theory.
 *
 * @module OceanPass
 */

import { RenderPass, RenderPassDescriptor, AttachmentReference } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('OceanPass');

/**
 * Wave spectrum types for ocean simulation.
 */
export enum WaveSpectrum {
  /** Phillips spectrum (classic) */
  Phillips = 'phillips',
  /** Pierson-Moskowitz spectrum */
  PiersonMoskowitz = 'pierson-moskowitz',
  /** JONSWAP spectrum (fetch-limited) */
  JONSWAP = 'jonswap',
  /** Custom spectrum */
  Custom = 'custom'
}

/**
 * Gerstner wave parameters.
 */
export interface GerstnerWave {
  /** Wave amplitude */
  amplitude: number;
  /** Wave direction (normalized) */
  direction: Vector2;
  /** Wave frequency */
  frequency: number;
  /** Wave steepness (0-1) */
  steepness: number;
  /** Wave speed */
  speed: number;
}

/**
 * Ocean rendering configuration.
 */
export interface OceanPassConfig {
  /** Resolution of FFT grid (power of 2, e.g., 256, 512, 1024) */
  fftResolution: number;
  /** Physical size of ocean patch in meters */
  patchSize: number;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Wind direction (normalized) */
  windDirection: Vector2;
  /** Wave amplitude scale */
  waveAmplitude: number;
  /** Wave choppiness (0-1) */
  choppiness: number;
  /** Wave spectrum type */
  spectrum: WaveSpectrum;
  /** Fetch length for JONSWAP spectrum (km) */
  fetchLength?: number;
  /** Number of LOD levels (1-8) */
  lodLevels: number;
  /** LOD distance scale */
  lodScale: number;
  /** Enable foam rendering */
  enableFoam: boolean;
  /** Foam threshold (displacement derivative) */
  foamThreshold: number;
  /** Foam decay rate */
  foamDecay: number;
  /** Enable underwater rendering */
  enableUnderwater: boolean;
  /** Water absorption color */
  absorptionColor: Color;
  /** Water scattering color */
  scatteringColor: Color;
  /** Enable reflections */
  enableReflections: boolean;
  /** Enable refractions */
  enableRefractions: boolean;
  /** Gerstner waves (additional detail) */
  gerstnerWaves: GerstnerWave[];
  /** Enable caustics */
  enableCaustics: boolean;
  /** Time scale for animation */
  timeScale: number;
}

/**
 * FFT ocean vertex shader (GLSL 300 ES).
 */
const OCEAN_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec2 a_position;      // Grid position (0-1)
in vec2 a_texcoord;      // Texture coordinates

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_patchSize;
uniform float u_time;
uniform float u_lodLevel;

// Displacement textures from FFT
uniform sampler2D u_displacementMap;    // XYZ displacement
uniform sampler2D u_normalMap;          // Normal map
uniform sampler2D u_foamMap;            // Foam intensity

// Gerstner wave parameters
#ifdef USE_GERSTNER_WAVES
uniform int u_gerstnerWaveCount;
uniform vec4 u_gerstnerWaves[8];        // amplitude, direction.xy, frequency
uniform vec4 u_gerstnerParams[8];       // steepness, speed, phase, unused
#endif

// Outputs
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texcoord;
out float v_foamIntensity;
out vec3 v_viewVector;
out float v_lodFade;

/**
 * Sample displacement with LOD blending.
 */
vec3 sampleDisplacement(vec2 uv, float lod) {
  vec3 disp = textureLod(u_displacementMap, uv, lod).xyz;
  return disp;
}

/**
 * Gerstner wave displacement.
 */
vec3 gerstnerWave(vec2 pos, float amplitude, vec2 direction, float frequency, float steepness, float speed, float time) {
  float k = 2.0 * 3.14159265 * frequency;
  float c = speed;
  vec2 d = normalize(direction);
  float f = k * (dot(d, pos) - c * time);
  float a = amplitude / k;

  return vec3(
    d.x * a * cos(f),
    a * sin(f),
    d.y * a * cos(f)
  );
}

void main() {
  // Scale grid position to world space
  vec2 worldPos2D = a_position * u_patchSize;
  v_texcoord = a_texcoord;

  // Sample FFT displacement
  vec3 displacement = sampleDisplacement(a_texcoord, u_lodLevel);

  // Add Gerstner waves
  #ifdef USE_GERSTNER_WAVES
  for (int i = 0; i < u_gerstnerWaveCount && i < 8; i++) {
    vec4 wave = u_gerstnerWaves[i];
    vec4 params = u_gerstnerParams[i];
    displacement += gerstnerWave(
      worldPos2D,
      wave.x,
      wave.yz,
      wave.w,
      params.x,
      params.y,
      u_time * params.z
    );
  }
  #endif

  // Apply displacement
  vec3 vertexPosition = vec3(worldPos2D.x + displacement.x, displacement.y, worldPos2D.y + displacement.z);

  // Transform to world space
  vec4 worldPos = u_modelMatrix * vec4(vertexPosition, 1.0);
  v_worldPosition = worldPos.xyz;

  // Sample normal from normal map
  vec3 normal = texture(u_normalMap, a_texcoord).xyz * 2.0 - 1.0;
  v_worldNormal = normalize(mat3(u_modelMatrix) * normal);

  // Sample foam intensity
  v_foamIntensity = texture(u_foamMap, a_texcoord).r;

  // Calculate view vector
  vec4 viewPos = u_viewMatrix * worldPos;
  v_viewVector = -viewPos.xyz;

  // LOD fade based on distance
  float distanceToCamera = length(viewPos.xyz);
  float lodDistance = u_patchSize * u_lodLevel;
  v_lodFade = smoothstep(lodDistance * 0.5, lodDistance, distanceToCamera);

  // Transform to clip space
  gl_Position = u_projectionMatrix * viewPos;
}
`;

/**
 * Ocean fragment shader (GLSL 300 ES).
 */
const OCEAN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texcoord;
in float v_foamIntensity;
in vec3 v_viewVector;
in float v_lodFade;

// Uniforms
uniform vec3 u_cameraPosition;
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform vec3 u_waterAbsorption;
uniform vec3 u_waterScattering;
uniform float u_foamThreshold;
uniform sampler2D u_reflectionMap;
uniform sampler2D u_refractionMap;
uniform sampler2D u_depthMap;
uniform sampler2D u_causticsMap;
uniform float u_time;
uniform bool u_underwater;
uniform vec2 u_screenSize;

// Output
layout(location = 0) out vec4 o_color;

// Constants
const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;
const float FOAM_SCATTER = 0.8;

/**
 * Fresnel-Schlick approximation.
 */
float fresnel(float cosTheta, float F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

/**
 * Sample reflection with parallax correction.
 */
vec3 sampleReflection(vec2 screenUV, vec3 normal) {
  // Apply normal distortion
  vec2 distortion = normal.xz * 0.05;
  vec2 reflectionUV = screenUV + distortion;
  reflectionUV = clamp(reflectionUV, vec2(0.0), vec2(1.0));

  return texture(u_reflectionMap, reflectionUV).rgb;
}

/**
 * Sample refraction with chromatic aberration.
 */
vec3 sampleRefraction(vec2 screenUV, vec3 normal) {
  vec2 distortion = normal.xz * 0.1;
  vec2 refractionUV = screenUV + distortion;
  refractionUV = clamp(refractionUV, vec2(0.0), vec2(1.0));

  // Chromatic aberration
  float r = texture(u_refractionMap, refractionUV + vec2(0.002, 0.0)).r;
  float g = texture(u_refractionMap, refractionUV).g;
  float b = texture(u_refractionMap, refractionUV - vec2(0.002, 0.0)).b;

  return vec3(r, g, b);
}

/**
 * Calculate foam color and intensity.
 */
vec3 calculateFoam(float intensity, vec3 normal) {
  if (intensity < u_foamThreshold) {
    return vec3(0.0);
  }

  // Foam brightness based on intensity
  float foam = smoothstep(u_foamThreshold, u_foamThreshold + 0.2, intensity);

  // Add texture detail
  vec2 foamUV = v_texcoord * 10.0 + u_time * 0.1;
  float foamNoise = fract(sin(dot(foamUV, vec2(12.9898, 78.233))) * 43758.5453);

  foam *= (0.8 + 0.2 * foamNoise);

  return vec3(1.0) * foam * FOAM_SCATTER;
}

/**
 * Calculate subsurface scattering approximation.
 */
vec3 calculateSSS(vec3 viewDir, vec3 normal, vec3 lightDir) {
  float scatter = pow(max(0.0, dot(viewDir, -lightDir)), 2.0);
  return u_waterScattering * scatter;
}

/**
 * Sample caustics pattern.
 */
float sampleCaustics(vec2 worldPos) {
  vec2 causticsUV = worldPos * 0.1 + u_time * 0.05;
  float caustics1 = texture(u_causticsMap, causticsUV).r;
  float caustics2 = texture(u_causticsMap, causticsUV * 1.3 + 0.5).r;
  return min(caustics1, caustics2) * 2.0;
}

void main() {
  // Normalize interpolated normal
  vec3 normal = normalize(v_worldNormal);
  vec3 viewDir = normalize(v_viewVector);

  // Calculate screen UV for reflection/refraction
  vec2 screenUV = gl_FragCoord.xy / u_screenSize;

  // Fresnel effect
  float cosTheta = max(dot(viewDir, normal), 0.0);
  float F0 = pow((IOR_AIR - IOR_WATER) / (IOR_AIR + IOR_WATER), 2.0);
  float fresnelTerm = fresnel(cosTheta, F0);

  // Sample reflection
  vec3 reflectionColor = sampleReflection(screenUV, normal);

  // Sample refraction
  vec3 refractionColor = sampleRefraction(screenUV, normal);

  // Read depth for underwater fog
  float sceneDepth = texture(u_depthMap, screenUV).r;
  float waterDepth = max(0.0, sceneDepth - gl_FragCoord.z);

  // Apply absorption (Beer's law)
  vec3 absorption = exp(-u_waterAbsorption * waterDepth * 10.0);
  refractionColor *= absorption;

  // Add subsurface scattering
  vec3 sss = calculateSSS(viewDir, normal, u_sunDirection);
  refractionColor += sss;

  // Add caustics to refraction
  #ifdef ENABLE_CAUSTICS
  if (!u_underwater) {
    float caustics = sampleCaustics(v_worldPosition.xz);
    refractionColor += caustics * 0.3 * u_sunColor;
  }
  #endif

  // Blend reflection and refraction based on Fresnel
  vec3 waterColor = mix(refractionColor, reflectionColor, fresnelTerm);

  // Add foam
  #ifdef ENABLE_FOAM
  vec3 foamColor = calculateFoam(v_foamIntensity, normal);
  waterColor = mix(waterColor, foamColor, min(foamColor.r, 1.0));
  #endif

  // Add specular highlight from sun
  vec3 halfVector = normalize(viewDir + u_sunDirection);
  float specular = pow(max(dot(normal, halfVector), 0.0), 128.0);
  waterColor += u_sunColor * specular * 0.5;

  // LOD fade
  float alpha = 1.0 - v_lodFade;

  // Underwater fog
  if (u_underwater) {
    float fogAmount = 1.0 - exp(-waterDepth * 0.1);
    waterColor = mix(waterColor, u_waterScattering, fogAmount);
  }

  o_color = vec4(waterColor, alpha);
}
`;

/**
 * Ocean rendering pass using FFT-based simulation.
 *
 * Implements physically-based ocean rendering with:
 * - FFT displacement maps generated on GPU
 * - Gerstner wave overlay for additional detail
 * - Dynamic foam based on wave curvature
 * - Reflection and refraction
 * - Underwater rendering support
 * - LOD system for large ocean surfaces
 *
 * @example
 * ```typescript
 * const oceanPass = new OceanPass({
 *   fftResolution: 512,
 *   patchSize: 100.0,
 *   windSpeed: 15.0,
 *   windDirection: new Vector2(1, 0).normalize(),
 *   waveAmplitude: 1.0,
 *   choppiness: 0.7,
 *   spectrum: WaveSpectrum.Phillips,
 *   lodLevels: 4,
 *   lodScale: 1.5,
 *   enableFoam: true,
 *   foamThreshold: 0.3,
 *   foamDecay: 0.95,
 *   enableUnderwater: true,
 *   absorptionColor: new Color(0.1, 0.3, 0.5),
 *   scatteringColor: new Color(0.0, 0.3, 0.5),
 *   enableReflections: true,
 *   enableRefractions: true,
 *   gerstnerWaves: [],
 *   enableCaustics: true,
 *   timeScale: 1.0
 * });
 *
 * oceanPass.setup();
 * oceanPass.execute(renderQueue, renderTarget);
 * ```
 */
export class OceanPass extends RenderPass {
  /** Configuration */
  private config: OceanPassConfig;

  /** FFT textures */
  private displacementMap: WebGLTexture | null = null;
  private normalMap: WebGLTexture | null = null;
  private foamMap: WebGLTexture | null = null;

  /** Spectrum textures (frequency domain) */
  private h0Texture: WebGLTexture | null = null;        // Initial spectrum
  private htTexture: WebGLTexture | null = null;        // Time-evolved spectrum
  private dxTexture: WebGLTexture | null = null;        // X displacement
  private dyTexture: WebGLTexture | null = null;        // Y displacement
  private dzTexture: WebGLTexture | null = null;        // Z displacement

  /** FFT framebuffers */
  private fftFramebuffer: WebGLFramebuffer | null = null;

  /** Ocean mesh LOD levels */
  private lodMeshes: Array<{
    vertexBuffer: WebGLBuffer | null;
    indexBuffer: WebGLBuffer | null;
    indexCount: number;
  }> = [];

  /** Shader program */
  private shader: WebGLProgram | null = null;

  /** FFT compute shaders */
  private fftHorizontalShader: WebGLProgram | null = null;
  private fftVerticalShader: WebGLProgram | null = null;
  private spectrumShader: WebGLProgram | null = null;

  /** Simulation time */
  private time: number = 0;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** Statistics */
  private stats = {
    fftTime: 0,
    renderTime: 0,
    triangles: 0,
  };

  /**
   * Creates a new ocean rendering pass.
   *
   * @param config - Ocean configuration
   */
  constructor(config: OceanPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'OceanPass',
      colorAttachments: [
        {
          name: 'oceanColor',
          format: TextureFormat.RGBA16F,
        },
      ],
      depthStencilAttachment: {
        name: 'oceanDepth',
        format: TextureFormat.Depth24Stencil8,
      },
      clearValues: {
        colors: [new Color(0, 0, 0, 0)],
        depth: 1.0,
      },
      colorLoadActions: [LoadAction.Load],
      colorStoreActions: [StoreAction.Store],
      depthLoadAction: LoadAction.Load,
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = config;

    // Validate configuration
    if (!this.isPowerOfTwo(config.fftResolution)) {
      logger.warn('FFT resolution must be power of 2, rounding to nearest');
      this.config.fftResolution = this.nextPowerOfTwo(config.fftResolution);
    }

    logger.info(`Created OceanPass: FFT ${config.fftResolution}x${config.fftResolution}, ` +
                `patch ${config.patchSize}m, LOD levels ${config.lodLevels}`);
  }

  /**
   * Sets up ocean pass resources.
   */
  setup(): void {
    logger.debug('Setting up OceanPass');

    // Note: In full implementation, would initialize WebGL context here
    // this.gl = getWebGL2Context();

    // Create FFT spectrum textures
    this.createSpectrumTextures();

    // Initialize H0 spectrum
    this.initializeSpectrum();

    // Create LOD meshes
    this.createLODMeshes();

    // Create shaders
    this.createShaders();

    // Create framebuffers
    this.createFramebuffers();

    logger.info('OceanPass setup complete');
  }

  /**
   * Executes the ocean rendering pass.
   *
   * @param renderQueue - Render queue (unused for ocean)
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gl || !this.shader) {
      logger.error('OceanPass not properly initialized');
      return;
    }

    const gl = this.gl;
    const startTime = performance.now();

    // Update simulation time
    this.time += (1.0 / 60.0) * this.config.timeScale;

    // === STEP 1: Update FFT simulation ===
    this.updateFFT();
    const fftTime = performance.now() - startTime;

    // === STEP 2: Bind render target ===
    // Note: Direct framebuffer access not available in RenderTarget API
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, renderTarget.width, renderTarget.height);

    // === STEP 3: Enable blending for alpha transparency (LOD fade) ===
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    // Enable face culling (back-face)
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // === STEP 4: Use ocean shader program ===
    gl.useProgram(this.shader);

    // === STEP 5: Bind displacement, normal, and foam textures ===
    // Texture unit 0: Displacement map (RGB = XYZ displacement)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.displacementMap);
    gl.uniform1i(gl.getUniformLocation(this.shader, 'u_displacementMap'), 0);

    // Texture unit 1: Normal map
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.normalMap);
    gl.uniform1i(gl.getUniformLocation(this.shader, 'u_normalMap'), 1);

    // Texture unit 2: Foam map
    if (this.config.enableFoam) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.foamMap);
      gl.uniform1i(gl.getUniformLocation(this.shader, 'u_foamMap'), 2);
    }

    // === STEP 6: Bind reflection and refraction textures ===
    // Texture unit 3: Reflection map (from previous reflection pass)
    if (this.config.enableReflections) {
      gl.activeTexture(gl.TEXTURE3);
      // In full implementation, bind actual reflection texture from RenderTarget
      // gl.bindTexture(gl.TEXTURE_2D, renderTarget.getReflectionTexture());
      gl.uniform1i(gl.getUniformLocation(this.shader, 'u_reflectionMap'), 3);
    }

    // Texture unit 4: Refraction map (from previous scene render)
    if (this.config.enableRefractions) {
      gl.activeTexture(gl.TEXTURE4);
      // In full implementation, bind actual refraction texture from RenderTarget
      // gl.bindTexture(gl.TEXTURE_2D, renderTarget.getRefractionTexture());
      gl.uniform1i(gl.getUniformLocation(this.shader, 'u_refractionMap'), 4);
    }

    // Texture unit 5: Depth map (for underwater fog and depth calculations)
    gl.activeTexture(gl.TEXTURE5);
    // In full implementation, bind depth texture
    // gl.bindTexture(gl.TEXTURE_2D, renderTarget.getDepthTexture());
    gl.uniform1i(gl.getUniformLocation(this.shader, 'u_depthMap'), 5);

    // Texture unit 6: Caustics map (if enabled)
    if (this.config.enableCaustics) {
      gl.activeTexture(gl.TEXTURE6);
      // In full implementation, bind caustics texture
      // gl.bindTexture(gl.TEXTURE_2D, this.causticsMap);
      gl.uniform1i(gl.getUniformLocation(this.shader, 'u_causticsMap'), 6);
    }

    // === STEP 7: Set ocean simulation parameters ===
    gl.uniform1f(gl.getUniformLocation(this.shader, 'u_patchSize'), this.config.patchSize);
    gl.uniform1f(gl.getUniformLocation(this.shader, 'u_time'), this.time);

    // === STEP 8: Set ocean material parameters ===
    // Choppiness affects horizontal displacement
    const choppiness = this.config.choppiness;
    gl.uniform1f(gl.getUniformLocation(this.shader, 'u_choppiness'), choppiness);

    // Foam threshold (displacement derivative threshold for foam generation)
    gl.uniform1f(gl.getUniformLocation(this.shader, 'u_foamThreshold'), this.config.foamThreshold);

    // Water absorption color (Beer's law for underwater light absorption)
    const absorption = this.config.absorptionColor;
    gl.uniform3f(
      gl.getUniformLocation(this.shader, 'u_waterAbsorption'),
      absorption.r,
      absorption.g,
      absorption.b
    );

    // Water scattering color (subsurface scattering)
    const scattering = this.config.scatteringColor;
    gl.uniform3f(
      gl.getUniformLocation(this.shader, 'u_waterScattering'),
      scattering.r,
      scattering.g,
      scattering.b
    );

    // === STEP 9: Set camera and scene parameters ===
    // In full implementation, get from render context
    // const camera = renderQueue.getCamera();
    // const cameraPos = camera.getPosition();
    // gl.uniform3f(gl.getUniformLocation(this.shader, 'u_cameraPosition'),
    //              cameraPos.x, cameraPos.y, cameraPos.z);

    // Sun direction and color for specular highlights
    // const sun = renderQueue.getSun();
    // gl.uniform3f(gl.getUniformLocation(this.shader, 'u_sunDirection'),
    //              sun.direction.x, sun.direction.y, sun.direction.z);
    // gl.uniform3f(gl.getUniformLocation(this.shader, 'u_sunColor'),
    //              sun.color.r, sun.color.g, sun.color.b);

    // Screen size for reflection/refraction UV calculations
    gl.uniform2f(
      gl.getUniformLocation(this.shader, 'u_screenSize'),
      renderTarget.width,
      renderTarget.height
    );

    // Underwater flag
    // const underwater = cameraPos.y < 0.0;
    // gl.uniform1i(gl.getUniformLocation(this.shader, 'u_underwater'), underwater ? 1 : 0);

    // === STEP 10: Set transformation matrices ===
    // In full implementation, get from camera
    // const viewMatrix = camera.getViewMatrix();
    // const projectionMatrix = camera.getProjectionMatrix();
    // gl.uniformMatrix4fv(gl.getUniformLocation(this.shader, 'u_viewMatrix'),
    //                     false, viewMatrix.elements);
    // gl.uniformMatrix4fv(gl.getUniformLocation(this.shader, 'u_projectionMatrix'),
    //                     false, projectionMatrix.elements);

    // === STEP 11: Set Gerstner wave parameters (if enabled) ===
    if (this.config.gerstnerWaves.length > 0) {
      const waveCount = Math.min(this.config.gerstnerWaves.length, 8);
      gl.uniform1i(gl.getUniformLocation(this.shader, 'u_gerstnerWaveCount'), waveCount);

      for (let i = 0; i < waveCount; i++) {
        const wave = this.config.gerstnerWaves[i];

        // Wave parameters: amplitude, direction.xy, frequency
        gl.uniform4f(
          gl.getUniformLocation(this.shader, `u_gerstnerWaves[${i}]`),
          wave.amplitude,
          wave.direction.x,
          wave.direction.y,
          wave.frequency
        );

        // Wave params: steepness, speed, phase, unused
        gl.uniform4f(
          gl.getUniformLocation(this.shader, `u_gerstnerParams[${i}]`),
          wave.steepness,
          wave.speed,
          1.0, // phase multiplier
          0.0  // unused
        );
      }
    }

    // === STEP 12: Render ocean surface with LOD ===
    this.renderOceanSurface();

    // === STEP 13: Cleanup state ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(null);

    const renderTime = performance.now() - startTime - fftTime;

    // Update statistics
    this.stats.fftTime = fftTime;
    this.stats.renderTime = renderTime;

    logger.trace(`OceanPass: FFT ${fftTime.toFixed(2)}ms, Render ${renderTime.toFixed(2)}ms, ` +
                 `${this.stats.triangles} tris`);
  }

  /**
   * Cleans up ocean pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up OceanPass');

    if (this.gl) {
      // Delete textures
      this.gl.deleteTexture(this.displacementMap);
      this.gl.deleteTexture(this.normalMap);
      this.gl.deleteTexture(this.foamMap);
      this.gl.deleteTexture(this.h0Texture);
      this.gl.deleteTexture(this.htTexture);
      this.gl.deleteTexture(this.dxTexture);
      this.gl.deleteTexture(this.dyTexture);
      this.gl.deleteTexture(this.dzTexture);

      // Delete framebuffers
      this.gl.deleteFramebuffer(this.fftFramebuffer);

      // Delete shaders
      this.gl.deleteProgram(this.shader);
      this.gl.deleteProgram(this.fftHorizontalShader);
      this.gl.deleteProgram(this.fftVerticalShader);
      this.gl.deleteProgram(this.spectrumShader);

      // Delete meshes
      this.lodMeshes.forEach(mesh => {
        this.gl!.deleteBuffer(mesh.vertexBuffer);
        this.gl!.deleteBuffer(mesh.indexBuffer);
      });
    }

    this.displacementMap = null;
    this.normalMap = null;
    this.foamMap = null;
    this.h0Texture = null;
    this.htTexture = null;
    this.dxTexture = null;
    this.dyTexture = null;
    this.dzTexture = null;
    this.fftFramebuffer = null;
    this.shader = null;
    this.fftHorizontalShader = null;
    this.fftVerticalShader = null;
    this.spectrumShader = null;
    this.lodMeshes = [];
    this.gl = null;

    logger.info('OceanPass cleanup complete');
  }

  /**
   * Creates FFT spectrum textures.
   */
  private createSpectrumTextures(): void {
    // In full implementation, create floating-point textures for FFT
    logger.debug('Creating FFT spectrum textures');
  }

  /**
   * Initializes the ocean spectrum (H0).
   */
  private initializeSpectrum(): void {
    const N = this.config.fftResolution;
    const L = this.config.patchSize;

    // Calculate Phillips spectrum for each wave vector
    for (let m = 0; m < N; m++) {
      for (let n = 0; n < N; n++) {
        const kx = (2.0 * Math.PI * (n - N / 2)) / L;
        const kz = (2.0 * Math.PI * (m - N / 2)) / L;

        const h0 = this.phillipsSpectrum(kx, kz);

        // Store in H0 texture
        // In full implementation, would write to texture
      }
    }

    logger.debug('Initialized ocean spectrum');
  }

  /**
   * Phillips spectrum calculation.
   */
  private phillipsSpectrum(kx: number, kz: number): { real: number; imag: number } {
    const k = Math.sqrt(kx * kx + kz * kz);

    if (k < 0.0001) {
      return { real: 0, imag: 0 };
    }

    const L = (this.config.windSpeed * this.config.windSpeed) / 9.81;
    const k2 = k * k;
    const k4 = k2 * k2;

    // Wind direction alignment
    const kDotW = kx * this.config.windDirection.x + kz * this.config.windDirection.y;
    const windAlignment = kDotW / k;

    // Phillips spectrum
    const Ph = this.config.waveAmplitude *
                Math.exp(-1.0 / (k2 * L * L)) /
                k4 *
                windAlignment * windAlignment;

    // Gaussian random numbers (Box-Muller)
    const xi1 = Math.random();
    const xi2 = Math.random();
    const r1 = Math.sqrt(-2.0 * Math.log(xi1));
    const r2 = 2.0 * Math.PI * xi2;

    return {
      real: r1 * Math.cos(r2) * Math.sqrt(Ph / 2.0),
      imag: r1 * Math.sin(r2) * Math.sqrt(Ph / 2.0),
    };
  }

  /**
   * Updates FFT simulation for current time.
   */
  private updateFFT(): void {
    // 1. Update spectrum for current time (H(t) = H0 * exp(i * omega * t))
    this.updateSpectrum();

    // 2. Perform 2D FFT (horizontal then vertical passes)
    this.performFFT();

    // 3. Generate normal map from displacement
    this.generateNormalMap();

    // 4. Generate foam map from Jacobian
    this.generateFoamMap();
  }

  /**
   * Updates time-evolved spectrum H(t).
   */
  private updateSpectrum(): void {
    // In full implementation, use compute shader to:
    // H(k, t) = H0(k) * exp(i * omega(k) * t) + conj(H0(-k)) * exp(-i * omega(k) * t)
    // where omega(k) = sqrt(g * |k|)
  }

  /**
   * Performs 2D FFT on spectrum.
   */
  private performFFT(): void {
    // In full implementation:
    // 1. Horizontal FFT pass
    // 2. Vertical FFT pass
    // Result is displacement field in spatial domain
  }

  /**
   * Generates normal map from displacement gradient.
   */
  private generateNormalMap(): void {
    // Calculate normal via central differences:
    // normal = normalize((-dh/dx, 1, -dh/dz))
  }

  /**
   * Generates foam map from wave curvature.
   */
  private generateFoamMap(): void {
    // Foam based on Jacobian determinant (wave breaking):
    // J = (1 + dDx/dx) * (1 + dDz/dz) - (dDx/dz) * (dDz/dx)
    // Foam where J < threshold
  }

  /**
   * Creates LOD meshes for ocean surface.
   */
  private createLODMeshes(): void {
    const baseTesselation = 128;

    for (let lod = 0; lod < this.config.lodLevels; lod++) {
      const tesselation = Math.max(8, baseTesselation >> lod);
      const mesh = this.createPlaneMesh(tesselation, tesselation);
      this.lodMeshes.push(mesh);

      logger.debug(`Created ocean LOD ${lod}: ${tesselation}x${tesselation} (${mesh.indexCount} indices)`);
    }
  }

  /**
   * Creates a plane mesh with given tesselation.
   */
  private createPlaneMesh(width: number, height: number): {
    vertexBuffer: WebGLBuffer | null;
    indexBuffer: WebGLBuffer | null;
    indexCount: number;
  } {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Generate vertices
    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) {
        const u = x / width;
        const v = y / height;

        // Position (will be displaced in vertex shader)
        vertices.push(u, v);

        // Texcoord
        vertices.push(u, v);
      }
    }

    // Generate indices
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i0 = y * (width + 1) + x;
        const i1 = i0 + 1;
        const i2 = i0 + (width + 1);
        const i3 = i2 + 1;

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    // In full implementation, create WebGL buffers
    return {
      vertexBuffer: null,
      indexBuffer: null,
      indexCount: indices.length,
    };
  }

  /**
   * Creates shader programs.
   */
  private createShaders(): void {
    // In full implementation, compile and link shaders
    logger.debug('Creating ocean shaders');
  }

  /**
   * Creates framebuffers for FFT.
   */
  private createFramebuffers(): void {
    // In full implementation, create FBO for FFT passes
    logger.debug('Creating FFT framebuffers');
  }

  /**
   * Renders ocean surface with LOD.
   */
  private renderOceanSurface(): void {
    if (!this.gl || !this.shader) {
      return;
    }

    const gl = this.gl;
    this.stats.triangles = 0;

    // === LOD-based ocean rendering ===
    // Render multiple ocean patches at different LOD levels based on distance from camera

    // In full implementation, get camera position from render context
    // const cameraPos = renderQueue.getCamera().getPosition();
    // For now, use placeholder camera position
    const cameraPos = new Vector3(0, 10, 0);

    // Calculate number of patches per LOD level
    // Each LOD level covers a ring around the camera
    const patchesPerLOD = [
      16, // LOD 0: 16 patches (4x4 grid around camera) - highest detail
      24, // LOD 1: 24 patches (ring around LOD 0) - medium detail
      32, // LOD 2: 32 patches (ring around LOD 1) - lower detail
      40, // LOD 3: 40 patches (ring around LOD 2) - lowest detail
    ];

    // Render each LOD level
    for (let lod = 0; lod < Math.min(this.config.lodLevels, this.lodMeshes.length); lod++) {
      const mesh = this.lodMeshes[lod];

      if (!mesh.vertexBuffer || !mesh.indexBuffer) {
        continue;
      }

      // Set LOD level uniform
      gl.uniform1f(gl.getUniformLocation(this.shader, 'u_lodLevel'), lod);

      // Bind vertex buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);

      // Setup vertex attributes
      const stride = 4 * 4; // 2 floats for position + 2 floats for texcoord = 4 floats * 4 bytes
      const positionLoc = gl.getAttribLocation(this.shader, 'a_position');
      const texcoordLoc = gl.getAttribLocation(this.shader, 'a_texcoord');

      if (positionLoc >= 0) {
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, stride, 0);
      }

      if (texcoordLoc >= 0) {
        gl.enableVertexAttribArray(texcoordLoc);
        gl.vertexAttribPointer(texcoordLoc, 2, gl.FLOAT, false, stride, 2 * 4);
      }

      // Bind index buffer
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

      // Calculate patch scale for this LOD level
      // Each LOD level has larger patches (less tessellation but covers more area)
      const lodScale = Math.pow(this.config.lodScale, lod);
      const patchWorldSize = this.config.patchSize * lodScale;

      // Calculate number of patches to render at this LOD level
      const patchCount = lod < patchesPerLOD.length ? patchesPerLOD[lod] : 40;
      const patchesPerSide = Math.ceil(Math.sqrt(patchCount));

      // Render a grid of patches centered on camera
      const halfPatches = Math.floor(patchesPerSide / 2);

      for (let py = -halfPatches; py <= halfPatches; py++) {
        for (let px = -halfPatches; px <= halfPatches; px++) {
          // Calculate patch world position
          // Snap to patch grid to reduce popping
          const patchX = Math.floor(cameraPos.x / patchWorldSize) * patchWorldSize + px * patchWorldSize;
          const patchZ = Math.floor(cameraPos.z / patchWorldSize) * patchWorldSize + py * patchWorldSize;

          // Calculate distance from camera to patch center
          const dx = patchX - cameraPos.x;
          const dz = patchZ - cameraPos.z;
          const distanceToCamera = Math.sqrt(dx * dx + dz * dz);

          // Calculate LOD distance ranges
          const lodMinDistance = lod === 0 ? 0 : this.config.patchSize * Math.pow(this.config.lodScale, lod - 1) * 2;
          const lodMaxDistance = this.config.patchSize * Math.pow(this.config.lodScale, lod) * 2;

          // Skip patches outside this LOD's distance range
          if (distanceToCamera < lodMinDistance || distanceToCamera > lodMaxDistance * 1.5) {
            continue;
          }

          // Create model matrix for this patch
          const modelMatrix = new Matrix4();
          modelMatrix.setTranslation(patchX, 0, patchZ);

          // Scale patch to world size
          const scaleMatrix = Matrix4.scale(lodScale, 1, lodScale);
          modelMatrix.multiplyInPlace(scaleMatrix);

          // Set model matrix uniform
          const modelMatrixLoc = gl.getUniformLocation(this.shader, 'u_modelMatrix');
          if (modelMatrixLoc) {
            gl.uniformMatrix4fv(modelMatrixLoc, false, modelMatrix.elements);
          }

          // Draw the patch
          gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);

          // Update triangle count
          this.stats.triangles += mesh.indexCount / 3;
        }
      }

      // Disable vertex attributes
      if (positionLoc >= 0) {
        gl.disableVertexAttribArray(positionLoc);
      }
      if (texcoordLoc >= 0) {
        gl.disableVertexAttribArray(texcoordLoc);
      }
    }

    // Cleanup
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    logger.trace(`Rendered ocean surface: ${this.stats.triangles} triangles across ${this.config.lodLevels} LOD levels`);
  }

  /**
   * Updates wind parameters.
   */
  setWind(speed: number, direction: Vector2): void {
    this.config.windSpeed = speed;
    this.config.windDirection = direction.clone().normalize();

    // Regenerate spectrum
    this.initializeSpectrum();

    logger.info(`Updated wind: speed ${speed}m/s, direction (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)})`);
  }

  /**
   * Adds a Gerstner wave.
   */
  addGerstnerWave(wave: GerstnerWave): void {
    if (this.config.gerstnerWaves.length >= 8) {
      logger.warn('Maximum 8 Gerstner waves supported, ignoring');
      return;
    }

    this.config.gerstnerWaves.push(wave);
    logger.debug(`Added Gerstner wave: amplitude ${wave.amplitude}, frequency ${wave.frequency}`);
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }

  /**
   * Checks if number is power of 2.
   */
  private isPowerOfTwo(n: number): boolean {
    return (n & (n - 1)) === 0 && n !== 0;
  }

  /**
   * Gets next power of 2.
   */
  private nextPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }
}

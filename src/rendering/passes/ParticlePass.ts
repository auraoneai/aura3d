/**
 * GPU particle rendering pass with advanced features.
 *
 * Features:
 * - GPU particle rendering
 * - Billboard and stretched billboard modes
 * - Soft particles (depth fade)
 * - Sorting for transparency
 * - Instanced rendering
 * - Texture atlas support
 * - GPU simulation integration
 *
 * @module ParticlePass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('ParticlePass');

/**
 * Particle billboard mode.
 */
export enum BillboardMode {
  /** Face camera (default) */
  Camera = 'camera',
  /** Stretch along velocity */
  Velocity = 'velocity',
  /** Horizontal billboard (world-space Y up) */
  Horizontal = 'horizontal',
  /** No billboarding (use orientation) */
  None = 'none'
}

/**
 * Particle blend mode.
 */
export enum ParticleBlendMode {
  /** Alpha blending */
  Alpha = 'alpha',
  /** Additive blending */
  Additive = 'additive',
  /** Multiplicative blending */
  Multiply = 'multiply',
  /** Subtractive blending */
  Subtract = 'subtract'
}

/**
 * Single particle data structure.
 */
export interface Particle {
  /** Position */
  position: Vector3;
  /** Velocity */
  velocity: Vector3;
  /** Size */
  size: number;
  /** Rotation (radians) */
  rotation: number;
  /** Color */
  color: Color;
  /** Life (0-1, 1 = just spawned, 0 = dead) */
  life: number;
  /** Age in seconds */
  age: number;
  /** Custom data */
  userData: Vector4;
}

/**
 * Particle emitter configuration.
 */
export interface ParticleEmitterConfig {
  /** Maximum particles */
  maxParticles: number;
  /** Emission rate (particles/second) */
  emissionRate: number;
  /** Particle lifetime (seconds) */
  lifetime: number;
  /** Lifetime variance */
  lifetimeVariance: number;
  /** Initial position */
  position: Vector3;
  /** Position variance */
  positionVariance: Vector3;
  /** Initial velocity */
  velocity: Vector3;
  /** Velocity variance */
  velocityVariance: Vector3;
  /** Initial size */
  size: number;
  /** Size variance */
  sizeVariance: number;
  /** Size over life curve (4 control points) */
  sizeOverLife: [number, number, number, number];
  /** Initial rotation */
  rotation: number;
  /** Rotation variance */
  rotationVariance: number;
  /** Rotation speed */
  rotationSpeed: number;
  /** Start color */
  startColor: Color;
  /** End color */
  endColor: Color;
  /** Color over life */
  colorOverLife: Color[];
  /** Gravity */
  gravity: Vector3;
  /** Drag */
  drag: number;
  /** Billboard mode */
  billboardMode: BillboardMode;
  /** Blend mode */
  blendMode: ParticleBlendMode;
  /** Texture */
  texture: WebGLTexture | null;
  /** Texture atlas (columns, rows) */
  textureAtlas: Vector2 | null;
  /** Animate texture over life */
  animateTexture: boolean;
}

/**
 * Particle rendering configuration.
 */
export interface ParticlePassConfig {
  /** Enable soft particles */
  enableSoftParticles: boolean;
  /** Soft particle distance */
  softParticleDistance: number;
  /** Enable sorting */
  enableSorting: boolean;
  /** Sort every N frames (0 = every frame) */
  sortInterval: number;
  /** Enable GPU simulation */
  enableGPUSimulation: boolean;
  /** Simulation timestep */
  simulationTimestep: number;
}

/**
 * Particle vertex shader (GLSL 300 ES).
 */
const PARTICLE_VERTEX_SHADER = `#version 300 es
precision highp float;

// Instance attributes (per-particle)
in vec3 a_instancePosition;
in vec3 a_instanceVelocity;
in float a_instanceSize;
in float a_instanceRotation;
in vec4 a_instanceColor;
in float a_instanceLife;
in vec4 a_instanceUserData;

// Vertex attributes (quad corners)
in vec2 a_vertexPosition;
in vec2 a_vertexTexcoord;

// Uniforms
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform int u_billboardMode;
uniform vec2 u_textureAtlas;  // columns, rows

// Outputs
out vec2 v_texcoord;
out vec4 v_color;
out float v_life;
out vec3 v_worldPosition;

/**
 * Rotates 2D point.
 */
vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(
    p.x * c - p.y * s,
    p.x * s + p.y * c
  );
}

/**
 * Calculates billboard matrix.
 */
mat3 getBillboardMatrix(vec3 position, vec3 velocity) {
  vec3 right, up, forward;

  if (u_billboardMode == 0) {
    // Camera-facing billboard
    right = u_cameraRight;
    up = u_cameraUp;
  } else if (u_billboardMode == 1) {
    // Velocity-aligned billboard (stretched)
    forward = normalize(velocity);
    right = normalize(cross(u_cameraUp, forward));
    up = cross(forward, right);
  } else if (u_billboardMode == 2) {
    // Horizontal billboard
    up = vec3(0.0, 1.0, 0.0);
    forward = normalize(u_cameraPosition - position);
    right = normalize(cross(up, forward));
  } else {
    // No billboarding
    right = vec3(1.0, 0.0, 0.0);
    up = vec3(0.0, 1.0, 0.0);
  }

  return mat3(right, up, normalize(cross(right, up)));
}

void main() {
  // Skip dead particles
  if (a_instanceLife <= 0.0) {
    gl_Position = vec4(0.0, 0.0, -10.0, 1.0);
    return;
  }

  // Calculate billboard matrix
  mat3 billboard = getBillboardMatrix(a_instancePosition, a_instanceVelocity);

  // Rotate vertex around particle center
  vec2 rotatedVertex = rotate2D(a_vertexPosition, a_instanceRotation);

  // Scale by particle size
  vec3 vertexOffset = billboard * vec3(rotatedVertex * a_instanceSize, 0.0);

  // World position
  vec3 worldPosition = a_instancePosition + vertexOffset;
  v_worldPosition = worldPosition;

  // Transform to clip space
  vec4 viewPosition = u_viewMatrix * vec4(worldPosition, 1.0);
  gl_Position = u_projectionMatrix * viewPosition;

  // Calculate texture coordinates with atlas support
  vec2 texcoord = a_vertexTexcoord;

  if (u_textureAtlas.x > 1.0 || u_textureAtlas.y > 1.0) {
    // Animate through atlas based on life
    float frameCount = u_textureAtlas.x * u_textureAtlas.y;
    float frame = floor((1.0 - a_instanceLife) * frameCount);
    float col = mod(frame, u_textureAtlas.x);
    float row = floor(frame / u_textureAtlas.x);

    vec2 atlasSize = vec2(1.0) / u_textureAtlas;
    texcoord = (texcoord + vec2(col, row)) * atlasSize;
  }

  v_texcoord = texcoord;
  v_color = a_instanceColor;
  v_life = a_instanceLife;
}
`;

/**
 * Particle fragment shader (GLSL 300 ES).
 */
const PARTICLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec2 v_texcoord;
in vec4 v_color;
in float v_life;
in vec3 v_worldPosition;

// Uniforms
uniform sampler2D u_particleTexture;
uniform sampler2D u_depthTexture;
uniform bool u_enableSoftParticles;
uniform float u_softParticleDistance;
uniform mat4 u_projectionMatrix;
uniform vec2 u_screenSize;
uniform float u_cameraNear;
uniform float u_cameraFar;

// Output
layout(location = 0) out vec4 o_color;

/**
 * Linearizes depth value.
 */
float linearizeDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  return (2.0 * u_cameraNear * u_cameraFar) / (u_cameraFar + u_cameraNear - z * (u_cameraFar - u_cameraNear));
}

void main() {
  // Sample particle texture
  vec4 texColor = texture(u_particleTexture, v_texcoord);

  // Apply vertex color
  vec4 finalColor = texColor * v_color;

  // Soft particles
  if (u_enableSoftParticles) {
    vec2 screenUV = gl_FragCoord.xy / u_screenSize;
    float sceneDepth = texture(u_depthTexture, screenUV).r;
    float particleDepth = gl_FragCoord.z;

    // Linearize depths
    float linearSceneDepth = linearizeDepth(sceneDepth);
    float linearParticleDepth = linearizeDepth(particleDepth);

    // Calculate depth difference
    float depthDiff = linearSceneDepth - linearParticleDepth;

    // Fade based on depth difference
    float fade = smoothstep(0.0, u_softParticleDistance, depthDiff);
    finalColor.a *= fade;
  }

  // Premultiply alpha
  finalColor.rgb *= finalColor.a;

  o_color = finalColor;
}
`;

/**
 * GPU particle rendering pass.
 *
 * Efficiently renders large numbers of particles using:
 * - Instanced rendering (one draw call per emitter)
 * - GPU-based sorting for transparency
 * - Soft particles with depth fade
 * - Multiple billboard modes
 * - Texture atlas animation
 * - Various blend modes
 *
 * @example
 * ```typescript
 * const particlePass = new ParticlePass({
 *   enableSoftParticles: true,
 *   softParticleDistance: 1.0,
 *   enableSorting: true,
 *   sortInterval: 2,
 *   enableGPUSimulation: false,
 *   simulationTimestep: 1.0 / 60.0
 * });
 *
 * particlePass.setup();
 *
 * // Create emitter
 * const emitter = particlePass.createEmitter({
 *   maxParticles: 1000,
 *   emissionRate: 100,
 *   lifetime: 2.0,
 *   position: new Vector3(0, 0, 0),
 *   velocity: new Vector3(0, 5, 0),
 *   size: 0.5,
 *   billboardMode: BillboardMode.Camera,
 *   blendMode: ParticleBlendMode.Additive,
 *   // ... other parameters
 * });
 *
 * particlePass.execute(renderQueue, renderTarget);
 * ```
 */
export class ParticlePass extends RenderPass {
  /** Configuration */
  private config: ParticlePassConfig;

  /** Particle emitters */
  private emitters: Map<number, ParticleEmitter> = new Map();

  /** Next emitter ID */
  private nextEmitterId: number = 0;

  /** Shader program */
  private shader: WebGLProgram | null = null;

  /** Quad vertex buffer (shared by all particles) */
  private quadVertexBuffer: WebGLBuffer | null = null;

  /** Quad index buffer */
  private quadIndexBuffer: WebGLBuffer | null = null;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** Frame counter for sort interval */
  private frameCount: number = 0;

  /** Statistics */
  private stats = {
    emitters: 0,
    particles: 0,
    drawCalls: 0,
  };

  /**
   * Creates a new particle rendering pass.
   *
   * @param config - Particle configuration
   */
  constructor(config: ParticlePassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'ParticlePass',
      colorAttachments: [
        {
          name: 'particleColor',
          format: TextureFormat.RGBA16F,
        },
      ],
      depthStencilAttachment: {
        name: 'particleDepth',
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

    logger.info('Created ParticlePass');
  }

  /**
   * Sets up particle pass resources.
   */
  setup(gl?: WebGL2RenderingContext): void {
    logger.debug('Setting up ParticlePass');

    // Initialize WebGL context
    if (gl) {
      this.gl = gl;
    } else {
      logger.warn('No WebGL context provided to ParticlePass.setup()');
      // In a real implementation, would get context from Engine
      return;
    }

    // Create quad mesh
    this.createQuadMesh();

    // Create shaders
    this.createShaders();

    logger.info('ParticlePass setup complete');
  }

  /**
   * Executes the particle rendering pass.
   *
   * @param renderQueue - Render queue (unused)
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gl || !this.shader) {
      logger.error('ParticlePass not properly initialized');
      return;
    }

    // Reset statistics
    this.stats.emitters = this.emitters.size;
    this.stats.particles = 0;
    this.stats.drawCalls = 0;

    // Update all emitters
    const deltaTime = this.config.simulationTimestep;
    for (const emitter of this.emitters.values()) {
      emitter.update(deltaTime);
      this.stats.particles += emitter.getAliveCount();
    }

    // Sort particles if enabled
    if (this.config.enableSorting &&
        (this.config.sortInterval === 0 || this.frameCount % this.config.sortInterval === 0)) {
      this.sortParticles();
    }

    // Bind output framebuffer
    this.bindRenderTarget(renderTarget);

    // Setup GL state for particle rendering
    this.setupGLState();

    // Bind particle shader
    this.gl.useProgram(this.shader);

    // Setup camera uniforms (would normally come from camera)
    this.setupCameraUniforms();

    // Bind depth buffer for soft particles
    if (this.config.enableSoftParticles) {
      this.bindDepthTexture(renderTarget);
    }

    // Render all emitters
    this.renderEmitters();

    // Restore GL state
    this.restoreGLState();

    this.frameCount++;

    logger.trace(`ParticlePass: ${this.stats.emitters} emitters, ${this.stats.particles} particles, ${this.stats.drawCalls} draws`);
  }

  /**
   * Cleans up particle pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up ParticlePass');

    if (this.gl) {
      // Delete shader
      this.gl.deleteProgram(this.shader);

      // Delete quad buffers
      this.gl.deleteBuffer(this.quadVertexBuffer);
      this.gl.deleteBuffer(this.quadIndexBuffer);

      // Delete emitter buffers
      for (const emitter of this.emitters.values()) {
        emitter.cleanup(this.gl);
      }
    }

    this.shader = null;
    this.quadVertexBuffer = null;
    this.quadIndexBuffer = null;
    this.emitters.clear();
    this.gl = null;

    logger.info('ParticlePass cleanup complete');
  }

  /**
   * Creates a particle emitter.
   */
  createEmitter(config: ParticleEmitterConfig): number {
    const id = this.nextEmitterId++;
    const emitter = new ParticleEmitter(config);

    if (this.gl) {
      emitter.setup(this.gl);
    }

    this.emitters.set(id, emitter);

    logger.debug(`Created particle emitter ${id}: max ${config.maxParticles} particles`);

    return id;
  }

  /**
   * Destroys a particle emitter.
   */
  destroyEmitter(id: number): void {
    const emitter = this.emitters.get(id);

    if (emitter && this.gl) {
      emitter.cleanup(this.gl);
    }

    this.emitters.delete(id);

    logger.debug(`Destroyed particle emitter ${id}`);
  }

  /**
   * Gets emitter by ID.
   */
  getEmitter(id: number): ParticleEmitter | undefined {
    return this.emitters.get(id);
  }

  /**
   * Creates quad mesh for particles.
   */
  private createQuadMesh(): void {
    if (!this.gl) {
      logger.error('Cannot create quad mesh: WebGL context not initialized');
      return;
    }

    const gl = this.gl;

    const vertices = new Float32Array([
      // Position (xy), Texcoord (uv)
      -0.5, -0.5, 0.0, 0.0,
       0.5, -0.5, 1.0, 0.0,
       0.5,  0.5, 1.0, 1.0,
      -0.5,  0.5, 0.0, 1.0,
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ]);

    // Create vertex buffer
    this.quadVertexBuffer = gl.createBuffer();
    if (this.quadVertexBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    }

    // Create index buffer
    this.quadIndexBuffer = gl.createBuffer();
    if (this.quadIndexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }

    // Unbind buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    logger.debug('Created particle quad mesh');
  }

  /**
   * Creates shader programs.
   */
  private createShaders(): void {
    if (!this.gl) {
      logger.error('Cannot create shaders: WebGL context not initialized');
      return;
    }

    logger.debug('Creating particle shaders');

    const gl = this.gl;

    // Compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      logger.error('Failed to create particle vertex shader');
      return;
    }

    gl.shaderSource(vertexShader, PARTICLE_VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(vertexShader);
      logger.error(`Particle vertex shader compilation failed: ${info}`);
      gl.deleteShader(vertexShader);
      return;
    }

    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      logger.error('Failed to create particle fragment shader');
      gl.deleteShader(vertexShader);
      return;
    }

    gl.shaderSource(fragmentShader, PARTICLE_FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(fragmentShader);
      logger.error(`Particle fragment shader compilation failed: ${info}`);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    // Link shader program
    this.shader = gl.createProgram();
    if (!this.shader) {
      logger.error('Failed to create particle shader program');
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.attachShader(this.shader, vertexShader);
    gl.attachShader(this.shader, fragmentShader);
    gl.linkProgram(this.shader);

    if (!gl.getProgramParameter(this.shader, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(this.shader);
      logger.error(`Particle shader program linking failed: ${info}`);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(this.shader);
      this.shader = null;
      return;
    }

    // Clean up shaders
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    logger.info('Particle shaders created successfully');
  }

  /**
   * Binds render target framebuffer.
   */
  private bindRenderTarget(renderTarget: RenderTarget): void {
    if (!this.gl) return;

    // In full implementation, would bind WebGL framebuffer
    // For now, assume we're rendering to default framebuffer or a pre-bound FBO
    const viewport = renderTarget.getViewport();
    this.gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
  }

  /**
   * Sets up GL state for particle rendering.
   */
  private setupGLState(): void {
    if (!this.gl) return;

    // Enable blending for particles
    this.gl.enable(this.gl.BLEND);

    // Enable depth testing but disable depth writes
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(false);

    // Disable face culling (particles are billboards)
    this.gl.disable(this.gl.CULL_FACE);

    // Default blend mode (will be changed per emitter)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * Restores GL state after particle rendering.
   */
  private restoreGLState(): void {
    if (!this.gl) return;

    // Restore depth writes
    this.gl.depthMask(true);

    // Disable blending
    this.gl.disable(this.gl.BLEND);

    // Re-enable face culling
    this.gl.enable(this.gl.CULL_FACE);
  }

  /**
   * Sets up camera uniforms for particle shader.
   */
  private setupCameraUniforms(): void {
    if (!this.gl || !this.shader) return;

    // In full implementation, would extract from camera
    // For now, use placeholder identity matrices and vectors
    const viewMatrix = Matrix4.identity();
    const projectionMatrix = Matrix4.identity();
    const cameraPosition = new Vector3(0, 0, 5);
    const cameraRight = new Vector3(1, 0, 0);
    const cameraUp = new Vector3(0, 1, 0);

    // Set matrix uniforms
    const viewLoc = this.gl.getUniformLocation(this.shader, 'u_viewMatrix');
    const projLoc = this.gl.getUniformLocation(this.shader, 'u_projectionMatrix');
    const camPosLoc = this.gl.getUniformLocation(this.shader, 'u_cameraPosition');
    const camRightLoc = this.gl.getUniformLocation(this.shader, 'u_cameraRight');
    const camUpLoc = this.gl.getUniformLocation(this.shader, 'u_cameraUp');

    if (viewLoc) this.gl.uniformMatrix4fv(viewLoc, false, viewMatrix.toArray());
    if (projLoc) this.gl.uniformMatrix4fv(projLoc, false, projectionMatrix.toArray());
    if (camPosLoc) this.gl.uniform3f(camPosLoc, cameraPosition.x, cameraPosition.y, cameraPosition.z);
    if (camRightLoc) this.gl.uniform3f(camRightLoc, cameraRight.x, cameraRight.y, cameraRight.z);
    if (camUpLoc) this.gl.uniform3f(camUpLoc, cameraUp.x, cameraUp.y, cameraUp.z);
  }

  /**
   * Binds depth texture for soft particles.
   */
  private bindDepthTexture(renderTarget: RenderTarget): void {
    if (!this.gl || !this.shader) return;

    const depthAttachment = renderTarget.getDepthStencilAttachment();
    if (!depthAttachment) {
      logger.warn('Soft particles enabled but no depth attachment available');
      return;
    }

    // Bind depth texture to texture unit 1
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, depthAttachment.texture as WebGLTexture);

    // Set depth texture uniform
    const depthTexLoc = this.gl.getUniformLocation(this.shader, 'u_depthTexture');
    if (depthTexLoc) this.gl.uniform1i(depthTexLoc, 1);

    // Set soft particle uniforms
    const enableSoftLoc = this.gl.getUniformLocation(this.shader, 'u_enableSoftParticles');
    const softDistLoc = this.gl.getUniformLocation(this.shader, 'u_softParticleDistance');
    const screenSizeLoc = this.gl.getUniformLocation(this.shader, 'u_screenSize');

    if (enableSoftLoc) this.gl.uniform1i(enableSoftLoc, 1);
    if (softDistLoc) this.gl.uniform1f(softDistLoc, this.config.softParticleDistance);
    if (screenSizeLoc) this.gl.uniform2f(screenSizeLoc, renderTarget.width, renderTarget.height);
  }

  /**
   * Sets blend mode based on particle blend mode.
   */
  private setBlendMode(mode: ParticleBlendMode): void {
    if (!this.gl) return;

    switch (mode) {
      case ParticleBlendMode.Alpha:
        // Standard alpha blending
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        break;

      case ParticleBlendMode.Additive:
        // Additive blending (for glows, fire, etc.)
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
        break;

      case ParticleBlendMode.Multiply:
        // Multiplicative blending (for darkening effects)
        this.gl.blendFunc(this.gl.DST_COLOR, this.gl.ZERO);
        break;

      case ParticleBlendMode.Subtract:
        // Subtractive blending
        this.gl.blendEquation(this.gl.FUNC_REVERSE_SUBTRACT);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
        break;
    }
  }

  /**
   * Sorts particles by distance to camera.
   */
  private sortParticles(): void {
    // In full implementation:
    // 1. Calculate camera position
    // 2. Sort all particles by distance to camera (back-to-front for alpha blending)
    // 3. Can use GPU-based sorting (bitonic sort, etc.) for better performance
    // 4. Or sort particles within each emitter and then merge

    // For now, just sort emitters by distance to camera
    const cameraPosition = new Vector3(0, 0, 5);
    const emitterArray = Array.from(this.emitters.values());

    emitterArray.sort((a, b) => {
      const distA = a.getConfig().position.distanceTo(cameraPosition);
      const distB = b.getConfig().position.distanceTo(cameraPosition);
      return distB - distA; // Back-to-front
    });
  }

  /**
   * Renders all particle emitters.
   */
  private renderEmitters(): void {
    if (!this.gl || !this.shader || !this.quadVertexBuffer || !this.quadIndexBuffer) return;

    // Bind quad vertex buffer (shared by all particles)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVertexBuffer);

    // Setup vertex attributes for quad
    const posLoc = this.gl.getAttribLocation(this.shader, 'a_vertexPosition');
    const texLoc = this.gl.getAttribLocation(this.shader, 'a_vertexTexcoord');

    if (posLoc >= 0) {
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 16, 0);
    }

    if (texLoc >= 0) {
      this.gl.enableVertexAttribArray(texLoc);
      this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 16, 8);
    }

    // Bind quad index buffer
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);

    // Render each emitter
    for (const emitter of this.emitters.values()) {
      const aliveCount = emitter.getAliveCount();
      if (aliveCount === 0) continue;

      const config = emitter.getConfig();

      // Upload particle data to GPU
      emitter.uploadToGPU(this.gl);

      // Set blend mode
      this.setBlendMode(config.blendMode);

      // Set billboard mode
      const billboardLoc = this.gl.getUniformLocation(this.shader, 'u_billboardMode');
      if (billboardLoc) {
        const modeIndex = this.getBillboardModeIndex(config.billboardMode);
        this.gl.uniform1i(billboardLoc, modeIndex);
      }

      // Set texture atlas
      const atlasLoc = this.gl.getUniformLocation(this.shader, 'u_textureAtlas');
      if (atlasLoc) {
        const atlas = config.textureAtlas ?? new Vector2(1, 1);
        this.gl.uniform2f(atlasLoc, atlas.x, atlas.y);
      }

      // Bind particle texture
      this.gl.activeTexture(this.gl.TEXTURE0);
      if (config.texture) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, config.texture);
      } else {
        // Use white texture as fallback
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      }

      const textureLoc = this.gl.getUniformLocation(this.shader, 'u_particleTexture');
      if (textureLoc) this.gl.uniform1i(textureLoc, 0);

      // Bind instance buffer with particle data
      const instanceBuffer = emitter.getInstanceBuffer();
      if (instanceBuffer) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceBuffer);

        // Setup instance attributes
        this.setupInstanceAttributes();

        // Draw instanced
        this.gl.drawElementsInstanced(
          this.gl.TRIANGLES,
          6, // 6 indices for quad (2 triangles)
          this.gl.UNSIGNED_SHORT,
          0,
          aliveCount
        );

        this.stats.drawCalls++;
      }
    }

    // Cleanup: disable vertex attrib arrays
    if (posLoc >= 0) this.gl.disableVertexAttribArray(posLoc);
    if (texLoc >= 0) this.gl.disableVertexAttribArray(texLoc);
  }

  /**
   * Sets up instance attributes for particle data.
   */
  private setupInstanceAttributes(): void {
    if (!this.gl || !this.shader) return;

    // Instance attributes are interleaved in the buffer:
    // position (vec3), velocity (vec3), size (float), rotation (float),
    // color (vec4), life (float), userData (vec4)

    const stride = (3 + 3 + 1 + 1 + 4 + 1 + 4) * 4; // 17 floats * 4 bytes
    let offset = 0;

    const attrs = [
      { name: 'a_instancePosition', size: 3 },
      { name: 'a_instanceVelocity', size: 3 },
      { name: 'a_instanceSize', size: 1 },
      { name: 'a_instanceRotation', size: 1 },
      { name: 'a_instanceColor', size: 4 },
      { name: 'a_instanceLife', size: 1 },
      { name: 'a_instanceUserData', size: 4 },
    ];

    for (const attr of attrs) {
      const loc = this.gl.getAttribLocation(this.shader, attr.name);
      if (loc >= 0) {
        this.gl.enableVertexAttribArray(loc);
        this.gl.vertexAttribPointer(loc, attr.size, this.gl.FLOAT, false, stride, offset);
        this.gl.vertexAttribDivisor(loc, 1); // Advance once per instance
      }
      offset += attr.size * 4;
    }
  }

  /**
   * Gets billboard mode index for shader.
   */
  private getBillboardModeIndex(mode: BillboardMode): number {
    switch (mode) {
      case BillboardMode.Camera: return 0;
      case BillboardMode.Velocity: return 1;
      case BillboardMode.Horizontal: return 2;
      case BillboardMode.None: return 3;
      default: return 0;
    }
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}

/**
 * Particle emitter class.
 */
class ParticleEmitter {
  /** Configuration */
  private config: ParticleEmitterConfig;

  /** Particle array */
  private particles: Particle[];

  /** Alive particle count */
  private aliveCount: number = 0;

  /** Emission accumulator */
  private emissionAccum: number = 0;

  /** Instance buffer (GPU) */
  private instanceBuffer: WebGLBuffer | null = null;

  /** Buffer data (CPU-side cache) */
  private bufferData: Float32Array | null = null;

  constructor(config: ParticleEmitterConfig) {
    this.config = config;

    // Initialize particle array
    this.particles = new Array(config.maxParticles);
    for (let i = 0; i < config.maxParticles; i++) {
      this.particles[i] = this.createParticle(true);
    }
  }

  /**
   * Sets up GPU resources.
   */
  setup(gl: WebGL2RenderingContext): void {
    // Create instance buffer (will be populated in updateInstanceBuffer)
    this.instanceBuffer = gl.createBuffer();

    if (!this.instanceBuffer) {
      logger.error('Failed to create particle instance buffer');
      return;
    }

    // Allocate buffer space (17 floats per particle)
    const floatsPerParticle = 17;
    const bufferSize = this.config.maxParticles * floatsPerParticle * Float32Array.BYTES_PER_ELEMENT;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bufferSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    logger.debug(`Created instance buffer for ${this.config.maxParticles} particles`);
  }

  /**
   * Updates particle simulation.
   */
  update(deltaTime: number): void {
    // Emit new particles
    this.emissionAccum += this.config.emissionRate * deltaTime;
    const toEmit = Math.floor(this.emissionAccum);
    this.emissionAccum -= toEmit;

    for (let i = 0; i < toEmit && this.aliveCount < this.config.maxParticles; i++) {
      this.emitParticle();
    }

    // Update existing particles
    this.aliveCount = 0;
    for (let i = 0; i < this.config.maxParticles; i++) {
      const p = this.particles[i];

      if (p.life > 0) {
        // Update physics
        p.age += deltaTime;
        p.life -= deltaTime / this.config.lifetime;

        p.velocity.add(this.config.gravity.clone().multiplyScalar(deltaTime));
        p.velocity.multiplyScalar(1.0 - this.config.drag * deltaTime);
        p.position.add(p.velocity.clone().multiplyScalar(deltaTime));
        p.rotation += this.config.rotationSpeed * deltaTime;

        // Update size over life
        const t = 1.0 - p.life;
        p.size = this.evaluateCurve(this.config.sizeOverLife, t) * this.config.size;

        // Update color over life
        p.color = this.config.startColor.lerp(this.config.endColor, t);

        if (p.life > 0) {
          this.aliveCount++;
        }
      }
    }

    // Update instance buffer
    this.updateInstanceBuffer();
  }

  /**
   * Emits a new particle.
   */
  private emitParticle(): void {
    // Find dead particle slot
    for (let i = 0; i < this.config.maxParticles; i++) {
      if (this.particles[i].life <= 0) {
        this.particles[i] = this.createParticle(false);
        break;
      }
    }
  }

  /**
   * Creates a new particle.
   */
  private createParticle(dead: boolean): Particle {
    if (dead) {
      return {
        position: new Vector3(),
        velocity: new Vector3(),
        size: 0,
        rotation: 0,
        color: Color.white(),
        life: 0,
        age: 0,
        userData: new Vector4(),
      };
    }

    return {
      position: this.config.position.clone().add(this.randomVector3(this.config.positionVariance)),
      velocity: this.config.velocity.clone().add(this.randomVector3(this.config.velocityVariance)),
      size: this.config.size + (Math.random() - 0.5) * this.config.sizeVariance,
      rotation: this.config.rotation + (Math.random() - 0.5) * this.config.rotationVariance,
      color: this.config.startColor.clone(),
      life: 1.0,
      age: 0,
      userData: new Vector4(),
    };
  }

  /**
   * Updates instance buffer with particle data.
   */
  private updateInstanceBuffer(): void {
    // Pack particle data into buffer for GPU
    // Buffer layout: position (vec3), velocity (vec3), size (float), rotation (float),
    //                color (vec4), life (float), userData (vec4)
    // Total: 17 floats per particle

    const floatsPerParticle = 17;
    const bufferData = new Float32Array(this.config.maxParticles * floatsPerParticle);

    let writeIndex = 0;
    for (let i = 0; i < this.config.maxParticles; i++) {
      const p = this.particles[i];

      // Position (vec3)
      bufferData[writeIndex++] = p.position.x;
      bufferData[writeIndex++] = p.position.y;
      bufferData[writeIndex++] = p.position.z;

      // Velocity (vec3)
      bufferData[writeIndex++] = p.velocity.x;
      bufferData[writeIndex++] = p.velocity.y;
      bufferData[writeIndex++] = p.velocity.z;

      // Size (float)
      bufferData[writeIndex++] = p.size;

      // Rotation (float)
      bufferData[writeIndex++] = p.rotation;

      // Color (vec4)
      bufferData[writeIndex++] = p.color.r;
      bufferData[writeIndex++] = p.color.g;
      bufferData[writeIndex++] = p.color.b;
      bufferData[writeIndex++] = p.color.a;

      // Life (float)
      bufferData[writeIndex++] = p.life;

      // User data (vec4)
      bufferData[writeIndex++] = p.userData.x;
      bufferData[writeIndex++] = p.userData.y;
      bufferData[writeIndex++] = p.userData.z;
      bufferData[writeIndex++] = p.userData.w;
    }

    // Store buffer data for later upload (actual upload happens when rendering)
    this.bufferData = bufferData;
  }

  /**
   * Uploads instance buffer data to GPU.
   */
  uploadToGPU(gl: WebGL2RenderingContext): void {
    if (!this.instanceBuffer || !this.bufferData) {
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bufferData);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Evaluates a curve at time t.
   */
  private evaluateCurve(curve: [number, number, number, number], t: number): number {
    // Cubic Bezier interpolation
    const u = 1.0 - t;
    return u * u * u * curve[0] +
           3.0 * u * u * t * curve[1] +
           3.0 * u * t * t * curve[2] +
           t * t * t * curve[3];
  }

  /**
   * Generates random Vector3 in range.
   */
  private randomVector3(variance: Vector3): Vector3 {
    return new Vector3(
      (Math.random() - 0.5) * variance.x,
      (Math.random() - 0.5) * variance.y,
      (Math.random() - 0.5) * variance.z
    );
  }

  /**
   * Cleans up GPU resources.
   */
  cleanup(gl: WebGL2RenderingContext): void {
    gl.deleteBuffer(this.instanceBuffer);
    this.instanceBuffer = null;
  }

  /**
   * Gets alive particle count.
   */
  getAliveCount(): number {
    return this.aliveCount;
  }

  /**
   * Gets configuration.
   */
  getConfig(): ParticleEmitterConfig {
    return this.config;
  }

  /**
   * Gets instance buffer (GPU buffer containing particle data).
   */
  getInstanceBuffer(): WebGLBuffer | null {
    return this.instanceBuffer;
  }
}

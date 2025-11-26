/**
 * Shadow Pass for shadow map generation.
 *
 * Renders depth information from light's perspective for shadow mapping.
 * Supports:
 * - Cascaded shadow maps (CSM) for directional lights
 * - Omnidirectional shadow maps (cubemap) for point lights
 * - Standard shadow maps for spot lights
 * - Shadow atlas management
 * - PCF filtering preparation
 *
 * @module ShadowPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';
import { Frustum } from '../../math/Frustum';

const logger = Logger.create('ShadowPass');

/**
 * Shadow map type enumeration.
 */
export enum ShadowMapType {
  /** Standard depth map for directional/spot lights */
  Standard = 0,
  /** Cascaded shadow map for directional lights */
  Cascaded = 1,
  /** Omnidirectional cubemap for point lights */
  Omnidirectional = 2,
}

/**
 * Cascade configuration for CSM.
 */
export interface CascadeConfig {
  /** Cascade split distances (view space) */
  splitDistances: number[];
  /** Number of cascades */
  cascadeCount: number;
  /** Cascade resolution (square) */
  resolution: number;
}

/**
 * Shadow pass configuration.
 */
export interface ShadowPassConfig {
  /** Shadow map resolution (width x height) */
  resolution: number;
  /** Use shadow atlas for batching multiple lights */
  useShadowAtlas?: boolean;
  /** Shadow atlas size (if using atlas) */
  atlasSize?: number;
  /** Maximum number of shadow-casting lights */
  maxShadowMaps?: number;
  /** Cascade configuration for directional lights */
  cascadeConfig?: CascadeConfig;
  /** Shadow bias to prevent acne */
  shadowBias?: number;
  /** Normal offset bias */
  normalBias?: number;
}

/**
 * Shadow map descriptor.
 */
export interface ShadowMapDescriptor {
  /** Shadow map type */
  type: ShadowMapType;
  /** Light-space view-projection matrix */
  lightViewProjection: Matrix4;
  /** Shadow bias */
  bias: number;
  /** Cascade index (for CSM) */
  cascadeIndex?: number;
  /** Cubemap face index (for omnidirectional) */
  faceIndex?: number;
  /** Light position (for point/omnidirectional lights) */
  lightPosition?: Vector3;
  /** Light range (for point/omnidirectional lights) */
  range?: number;
}

/**
 * Depth-only vertex shader for shadow mapping.
 */
const SHADOW_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;

#ifdef ALPHA_MASK
in vec2 a_texcoord;
out vec2 v_texcoord;
#endif

uniform mat4 u_lightViewProjection;
uniform mat4 u_modelMatrix;

void main() {
  #ifdef ALPHA_MASK
  v_texcoord = a_texcoord;
  #endif

  gl_Position = u_lightViewProjection * u_modelMatrix * vec4(a_position, 1.0);
}
`;

/**
 * Depth-only fragment shader for shadow mapping.
 */
const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

#ifdef ALPHA_MASK
in vec2 v_texcoord;
uniform sampler2D u_albedoMap;
uniform float u_alphaCutoff;
#endif

void main() {
  #ifdef ALPHA_MASK
  float alpha = texture(u_albedoMap, v_texcoord).a;
  if (alpha < u_alphaCutoff) {
    discard;
  }
  #endif

  // Depth is written automatically
}
`;

/**
 * Omnidirectional shadow vertex shader (for point lights).
 */
const OMNI_SHADOW_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_modelMatrix;
uniform mat4 u_lightViewProjection;

out vec3 v_worldPosition;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;
  gl_Position = u_lightViewProjection * worldPos;
}
`;

/**
 * Omnidirectional shadow fragment shader.
 */
const OMNI_SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_worldPosition;

uniform vec3 u_lightPosition;
uniform float u_farPlane;

void main() {
  // Calculate distance from light
  float lightDistance = length(v_worldPosition - u_lightPosition);

  // Map to [0, 1] range
  lightDistance = lightDistance / u_farPlane;

  // Write distance as depth
  gl_FragDepth = lightDistance;
}
`;

/**
 * Shadow rendering pass.
 * Generates shadow maps from light's perspective for shadow mapping in lighting pass.
 *
 * @example
 * ```typescript
 * // Create shadow pass
 * const shadowPass = new ShadowPass({
 *   resolution: 2048,
 *   maxShadowMaps: 4,
 *   cascadeConfig: {
 *     cascadeCount: 4,
 *     splitDistances: [0.1, 10, 50, 200, 1000],
 *     resolution: 2048
 *   },
 *   shadowBias: 0.005
 * });
 *
 * // Setup pass
 * shadowPass.setup();
 *
 * // Add shadow-casting light
 * shadowPass.addDirectionalShadowMap(lightDirection, viewCamera);
 *
 * // Render shadow maps
 * shadowPass.execute(shadowCastersQueue, shadowTarget);
 *
 * // Access shadow maps for lighting
 * const shadowMaps = shadowPass.getShadowMaps();
 * ```
 */
export class ShadowPass extends RenderPass {
  /** Pass configuration */
  private config: ShadowPassConfig;

  /** Shadow map render targets */
  private shadowTargets: RenderTarget[] = [];

  /** Shadow map descriptors */
  private shadowMaps: ShadowMapDescriptor[] = [];

  /** Shadow shader */
  private shader: Shader | null = null;

  /** Omnidirectional shadow shader */
  private omniShader: Shader | null = null;

  /** Uniform buffer for shadow matrices */
  private shadowUBO: UniformBuffer | null = null;

  /** WebGL2 context */
  private gl: WebGL2RenderingContext | null = null;

  /** Shadow atlas (if enabled) */
  private shadowAtlas: RenderTarget | null = null;

  /** Cascade frustums for CSM */
  private cascadeFrustums: Frustum[] = [];

  /** Cascade split distances */
  private cascadeSplits: number[] = [];

  /** Statistics */
  private stats = {
    shadowMapsRendered: 0,
    cascadesRendered: 0,
    drawCalls: 0,
  };

  /**
   * Creates a new shadow pass.
   *
   * @param config - Shadow pass configuration
   */
  constructor(config: ShadowPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'ShadowPass',
      colorAttachments: [],
      depthStencilAttachment: {
        name: 'shadowDepth',
        format: TextureFormat.Depth32F,
      },
      clearValues: {
        depth: 1.0,
      },
      depthLoadAction: LoadAction.Clear,
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = {
      useShadowAtlas: false,
      atlasSize: 4096,
      maxShadowMaps: 4,
      shadowBias: 0.005,
      normalBias: 0.01,
      ...config,
    };

    // Initialize cascade splits if CSM is configured
    if (this.config.cascadeConfig) {
      this.cascadeSplits = [...this.config.cascadeConfig.splitDistances];
    }

    logger.info(`Created ShadowPass: resolution ${config.resolution}x${config.resolution}`);
  }

  /**
   * Sets up shadow pass resources.
   */
  setup(): void {
    logger.debug('Setting up ShadowPass');

    // Get WebGL2 context (would be passed from renderer in a real implementation)
    // For now, we'll get it when execute() is called

    if (this.config.useShadowAtlas) {
      // Create shadow atlas
      this.shadowAtlas = new RenderTarget({
        width: this.config.atlasSize ?? 4096,
        height: this.config.atlasSize ?? 4096,
        samples: 1,
        colorAttachments: [],
        depthStencilAttachment: {
          format: TextureFormat.Depth32F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: 1.0,
        },
        label: 'ShadowAtlas',
      });
    } else {
      // Create individual shadow maps
      const maxMaps = this.config.maxShadowMaps ?? 4;
      for (let i = 0; i < maxMaps; i++) {
        const target = new RenderTarget({
          width: this.config.resolution,
          height: this.config.resolution,
          samples: 1,
          colorAttachments: [],
          depthStencilAttachment: {
            format: TextureFormat.Depth32F,
            loadAction: LoadAction.Clear,
            storeAction: StoreAction.Store,
            clearValue: 1.0,
          },
          label: `ShadowMap${i}`,
        });
        this.shadowTargets.push(target);
      }
    }

    // Create shadow uniform buffer
    const shadowUBODesc: UniformBufferDescriptor = {
      name: 'Shadow',
      binding: 2,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'lightViewProjection', type: UniformType.Mat4 },
        { name: 'modelMatrix', type: UniformType.Mat4 },
        { name: 'lightPosition', type: UniformType.Vec3 },
        { name: 'farPlane', type: UniformType.Float },
      ],
    };
    this.shadowUBO = new UniformBuffer(shadowUBODesc);

    logger.info('ShadowPass setup complete');
  }

  /**
   * Initializes the GL context and creates shaders.
   * Should be called before execute() with a valid GL context.
   *
   * @param gl - WebGL2 rendering context
   */
  initializeGL(gl: WebGL2RenderingContext): void {
    if (this.gl === gl && this.shader && this.omniShader) {
      return; // Already initialized
    }

    this.gl = gl;

    // Create standard shadow shader
    this.shader = new Shader({
      name: 'ShadowDepth',
      source: {
        vertex: SHADOW_VERTEX_SHADER,
        fragment: SHADOW_FRAGMENT_SHADER,
      },
      gl: this.gl,
    });

    // Create omnidirectional shadow shader
    this.omniShader = new Shader({
      name: 'OmniShadow',
      source: {
        vertex: OMNI_SHADOW_VERTEX_SHADER,
        fragment: OMNI_SHADOW_FRAGMENT_SHADER,
      },
      gl: this.gl,
    });

    logger.debug('Shadow shaders initialized');
  }

  /**
   * Executes the shadow pass.
   * Renders shadow maps for all shadow-casting lights.
   *
   * @param renderQueue - Queue containing shadow casters
   * @param renderTarget - Unused, uses internal shadow targets
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (renderQueue.isEmpty || this.shadowMaps.length === 0) {
      logger.trace('ShadowPass: no shadow maps or empty queue, skipping');
      return;
    }

    // Ensure GL context is available
    if (!this.gl) {
      logger.error('ShadowPass: GL context not initialized. Call initializeGL() first.');
      return;
    }

    if (!this.shader || !this.shader.isReady) {
      logger.error('ShadowPass: Shadow shader not ready');
      return;
    }

    // Reset statistics
    this.stats.shadowMapsRendered = 0;
    this.stats.cascadesRendered = 0;
    this.stats.drawCalls = 0;

    logger.trace(`ShadowPass: rendering ${this.shadowMaps.length} shadow maps`);

    const gl = this.gl;

    // Render each shadow map
    for (let i = 0; i < this.shadowMaps.length; i++) {
      const shadowMap = this.shadowMaps[i];
      const target = this.shadowTargets[i];

      if (!target) {
        logger.warn(`ShadowPass: No render target for shadow map ${i}`);
        continue;
      }

      // Get shadow map framebuffer
      const depthAttachment = target.getDepthStencilAttachment();
      if (!depthAttachment || !depthAttachment.texture) {
        logger.warn(`ShadowPass: No depth attachment for shadow map ${i}`);
        continue;
      }

      // Bind shadow map framebuffer
      const framebuffer = this.getOrCreateFramebuffer(target);
      if (!framebuffer) {
        logger.warn(`ShadowPass: Failed to create framebuffer for shadow map ${i}`);
        continue;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, target.width, target.height);

      // Clear depth to 1.0
      gl.clearDepth(1.0);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      // Set GL state for depth-only rendering
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);

      // Disable color writes for depth-only pass
      gl.colorMask(false, false, false, false);

      // Optionally enable culling
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // Select appropriate shader based on shadow map type
      const activeShader = shadowMap.type === ShadowMapType.Omnidirectional ? this.omniShader : this.shader;

      if (!activeShader || !activeShader.isReady) {
        logger.warn(`ShadowPass: Shader not ready for shadow map ${i}`);
        continue;
      }

      // Bind shadow shader
      activeShader.bind();

      // Set light view-projection matrix uniform
      activeShader.setUniform('u_lightViewProjection', shadowMap.lightViewProjection);

      // Set omnidirectional-specific uniforms if needed
      if (shadowMap.type === ShadowMapType.Omnidirectional && shadowMap.lightPosition && shadowMap.range) {
        activeShader.setUniform('u_lightPosition', shadowMap.lightPosition);
        activeShader.setUniform('u_farPlane', shadowMap.range);
      }

      // Render shadow casters
      renderQueue.forEach((entry) => {
        const { drawCall } = entry;

        // Cull objects outside shadow frustum
        // (Would check bounds against shadow frustum here for optimization)

        // Get model matrix from draw call user data (if available)
        // In a real implementation, this would come from the entity's transform
        const modelMatrix = (drawCall.userData as any)?.modelMatrix || Matrix4.identity();
        activeShader.setUniform('u_modelMatrix', modelMatrix);

        // Bind vertex buffers
        const vertexBuffers = drawCall.getVertexBuffers();
        for (let slot = 0; slot < vertexBuffers.length; slot++) {
          const vb = vertexBuffers[slot];
          if (vb && vb.buffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, vb.buffer as WebGLBuffer);

            // Enable position attribute (location 0)
            if (slot === 0) {
              const posAttr = activeShader.getAttribute('a_position');
              if (posAttr) {
                gl.enableVertexAttribArray(posAttr.location);
                gl.vertexAttribPointer(
                  posAttr.location,
                  3, // vec3 position
                  gl.FLOAT,
                  false,
                  vb.stride,
                  vb.offset
                );
              }
            }
          }
        }

        // Bind index buffer and draw
        const indexBuffer = drawCall.indexBuffer;
        if (indexBuffer && indexBuffer.buffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer as WebGLBuffer);

          const indexType = indexBuffer.format === 0 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
          const indexSize = indexBuffer.format === 0 ? 2 : 4;

          // Draw indexed geometry
          if (drawCall.instanceCount > 1) {
            gl.drawElementsInstanced(
              gl.TRIANGLES,
              drawCall.indexCount,
              indexType,
              drawCall.firstIndex * indexSize,
              drawCall.instanceCount
            );
          } else {
            gl.drawElements(
              gl.TRIANGLES,
              drawCall.indexCount,
              indexType,
              drawCall.firstIndex * indexSize
            );
          }

          this.stats.drawCalls++;
        } else if (drawCall.vertexCount > 0) {
          // Draw non-indexed geometry
          if (drawCall.instanceCount > 1) {
            gl.drawArraysInstanced(
              gl.TRIANGLES,
              drawCall.firstVertex,
              drawCall.vertexCount,
              drawCall.instanceCount
            );
          } else {
            gl.drawArrays(
              gl.TRIANGLES,
              drawCall.firstVertex,
              drawCall.vertexCount
            );
          }

          this.stats.drawCalls++;
        }

        // Disable vertex attributes
        const posAttr = activeShader.getAttribute('a_position');
        if (posAttr) {
          gl.disableVertexAttribArray(posAttr.location);
        }
      });

      // Unbind shader
      activeShader.unbind();

      this.stats.shadowMapsRendered++;

      if (shadowMap.type === ShadowMapType.Cascaded) {
        this.stats.cascadesRendered++;
      }
    }

    // Restore GL state
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    logger.trace(
      `ShadowPass complete: ${this.stats.shadowMapsRendered} maps, ${this.stats.cascadesRendered} cascades, ${this.stats.drawCalls} draws`
    );
  }

  /**
   * Gets or creates a WebGL framebuffer for a render target.
   * Caches framebuffers to avoid recreation.
   *
   * @param target - Render target
   * @returns WebGL framebuffer or null
   */
  private framebufferCache = new WeakMap<RenderTarget, WebGLFramebuffer>();

  private getOrCreateFramebuffer(target: RenderTarget): WebGLFramebuffer | null {
    if (!this.gl) return null;

    // Check cache
    const cached = this.framebufferCache.get(target);
    if (cached) return cached;

    const gl = this.gl;

    // Create new framebuffer
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      logger.error('Failed to create framebuffer');
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // Attach depth texture
    const depthAttachment = target.getDepthStencilAttachment();
    if (depthAttachment && depthAttachment.texture) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        depthAttachment.texture as WebGLTexture,
        0
      );
    }

    // Check framebuffer completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      logger.error(`Framebuffer incomplete: ${status}`);
      gl.deleteFramebuffer(framebuffer);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Cache framebuffer
    this.framebufferCache.set(target, framebuffer);

    return framebuffer;
  }

  /**
   * Cleans up shadow pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up ShadowPass');

    // Clean up cached framebuffers
    // Note: WeakMap doesn't expose iteration, but framebuffers will be GC'd when targets are disposed
    // We'll manually clean up the ones we know about
    if (this.gl) {
      for (const target of this.shadowTargets) {
        const fb = this.framebufferCache.get(target);
        if (fb) {
          this.gl.deleteFramebuffer(fb);
        }
      }
    }
    this.framebufferCache = new WeakMap();

    for (const target of this.shadowTargets) {
      target.dispose();
    }
    this.shadowTargets.length = 0;

    if (this.shadowAtlas) {
      this.shadowAtlas.dispose();
      this.shadowAtlas = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.omniShader) {
      this.omniShader.dispose();
      this.omniShader = null;
    }

    this.shadowMaps.length = 0;
    this.shadowUBO = null;
    this.gl = null;

    logger.info('ShadowPass cleanup complete');
  }

  /**
   * Adds a directional light shadow map.
   * Optionally creates cascaded shadow maps.
   *
   * @param lightDirection - Light direction (normalized)
   * @param viewCamera - View camera for CSM split calculation
   * @param useCascades - Whether to use cascaded shadow maps
   * @returns Shadow map index
   */
  addDirectionalShadowMap(lightDirection: Vector3, viewCamera: Camera, useCascades: boolean = false): number {
    if (useCascades && this.config.cascadeConfig) {
      return this.addCascadedShadowMap(lightDirection, viewCamera);
    }

    // Create simple directional shadow map
    const lightView = this.calculateDirectionalLightView(lightDirection, viewCamera);
    const lightProjection = this.calculateDirectionalLightProjection(viewCamera);
    const lightVP = lightProjection.multiply(lightView);

    const index = this.shadowMaps.length;
    this.shadowMaps.push({
      type: ShadowMapType.Standard,
      lightViewProjection: lightVP,
      bias: this.config.shadowBias ?? 0.005,
    });

    return index;
  }

  /**
   * Adds cascaded shadow maps for a directional light.
   *
   * @param lightDirection - Light direction (normalized)
   * @param viewCamera - View camera
   * @returns First shadow map index (cascades use consecutive indices)
   */
  addCascadedShadowMap(lightDirection: Vector3, viewCamera: Camera): number {
    if (!this.config.cascadeConfig) {
      logger.error('Cascade configuration not provided');
      return -1;
    }

    const cascadeCount = this.config.cascadeConfig.cascadeCount;
    const firstIndex = this.shadowMaps.length;

    // Calculate cascade splits in view space
    this.calculateCascadeSplits(viewCamera);

    // Create shadow map for each cascade
    for (let i = 0; i < cascadeCount; i++) {
      const near = this.cascadeSplits[i];
      const far = this.cascadeSplits[i + 1];

      const lightView = this.calculateDirectionalLightView(lightDirection, viewCamera);
      const lightProjection = this.calculateCascadeProjection(viewCamera, near, far);
      const lightVP = lightProjection.multiply(lightView);

      this.shadowMaps.push({
        type: ShadowMapType.Cascaded,
        lightViewProjection: lightVP,
        bias: this.config.shadowBias ?? 0.005,
        cascadeIndex: i,
      });
    }

    return firstIndex;
  }

  /**
   * Adds a point light omnidirectional shadow map.
   *
   * @param lightPosition - Light position
   * @param range - Light range
   * @returns Shadow map index
   */
  addPointShadowMap(lightPosition: Vector3, range: number): number {
    // Point lights need 6 shadow maps (cubemap faces)
    // Store base index - we'll have 6 entries for the cube faces
    const index = this.shadowMaps.length;

    // Create perspective projection for cubemap faces (90 degree FOV, 1:1 aspect)
    const projection = Matrix4.perspective(Math.PI / 2, 1.0, 0.1, range);

    // Standard cube map face directions and up vectors
    // Order: +X, -X, +Y, -Y, +Z, -Z (matching WebGL/OpenGL cubemap convention)
    const cubeMapDirections: Array<{ dir: Vector3; up: Vector3 }> = [
      { dir: new Vector3(1, 0, 0), up: new Vector3(0, -1, 0) },   // +X
      { dir: new Vector3(-1, 0, 0), up: new Vector3(0, -1, 0) },  // -X
      { dir: new Vector3(0, 1, 0), up: new Vector3(0, 0, 1) },    // +Y
      { dir: new Vector3(0, -1, 0), up: new Vector3(0, 0, -1) },  // -Y
      { dir: new Vector3(0, 0, 1), up: new Vector3(0, -1, 0) },   // +Z
      { dir: new Vector3(0, 0, -1), up: new Vector3(0, -1, 0) },  // -Z
    ];

    // Create shadow map entry for each cube face
    for (let face = 0; face < 6; face++) {
      const { dir, up } = cubeMapDirections[face];

      // Create view matrix looking from light position along face direction
      const target = lightPosition.add(dir);
      const view = Matrix4.lookAt(lightPosition, target, up);

      // Combine projection and view for this face
      const lightVP = projection.multiply(view);

      this.shadowMaps.push({
        type: ShadowMapType.Omnidirectional,
        lightViewProjection: lightVP,
        bias: this.config.shadowBias ?? 0.005,
        faceIndex: face,
        lightPosition: lightPosition.clone(),
        range: range,
      });
    }

    return index;
  }

  /**
   * Adds a spot light shadow map.
   *
   * @param lightPosition - Light position
   * @param lightDirection - Light direction
   * @param outerConeAngle - Outer cone angle (radians)
   * @param range - Light range
   * @returns Shadow map index
   */
  addSpotShadowMap(lightPosition: Vector3, lightDirection: Vector3, outerConeAngle: number, range: number): number {
    // Create perspective projection for spot light
    const fov = outerConeAngle * 2; // Full cone angle
    const projection = Matrix4.perspective(fov, 1.0, 0.1, range);

    // Create view matrix looking from light position along direction
    const view = Matrix4.lookAt(lightPosition, lightPosition.add(lightDirection), Vector3.up());
    const lightVP = projection.multiply(view);

    const index = this.shadowMaps.length;
    this.shadowMaps.push({
      type: ShadowMapType.Standard,
      lightViewProjection: lightVP,
      bias: this.config.shadowBias ?? 0.005,
    });

    return index;
  }

  /**
   * Clears all shadow maps.
   */
  clearShadowMaps(): void {
    this.shadowMaps.length = 0;
  }

  /**
   * Gets all shadow map descriptors.
   */
  getShadowMaps(): readonly ShadowMapDescriptor[] {
    return this.shadowMaps;
  }

  /**
   * Gets a specific shadow map texture.
   *
   * @param index - Shadow map index
   */
  getShadowMapTexture(index: number): unknown {
    if (index < 0 || index >= this.shadowTargets.length) {
      return null;
    }
    return this.shadowTargets[index].getDepthStencilAttachment();
  }

  /**
   * Gets the shadow atlas texture (if using atlas).
   */
  getShadowAtlas(): unknown {
    return this.shadowAtlas?.getDepthStencilAttachment();
  }

  /**
   * Calculates cascade splits using logarithmic distribution.
   *
   * @param camera - View camera
   */
  private calculateCascadeSplits(camera: Camera): void {
    if (!this.config.cascadeConfig) return;

    const cascadeCount = this.config.cascadeConfig.cascadeCount;
    const near = camera.near;
    const far = camera.far;

    this.cascadeSplits.length = 0;
    this.cascadeSplits.push(near);

    // Practical split scheme (logarithmic + uniform mix)
    const lambda = 0.5; // 0 = uniform, 1 = logarithmic

    for (let i = 1; i < cascadeCount; i++) {
      const p = i / cascadeCount;
      const log = near * Math.pow(far / near, p);
      const uniform = near + (far - near) * p;
      const split = lambda * log + (1 - lambda) * uniform;
      this.cascadeSplits.push(split);
    }

    this.cascadeSplits.push(far);
  }

  /**
   * Calculates directional light view matrix.
   *
   * @param lightDirection - Light direction
   * @param camera - View camera
   * @returns Light view matrix
   */
  private calculateDirectionalLightView(lightDirection: Vector3, camera: Camera): Matrix4 {
    const lightPos = camera.transform.worldPosition.sub(lightDirection.scale(100));
    const target = camera.transform.worldPosition;
    return Matrix4.lookAt(lightPos, target, Vector3.up());
  }

  /**
   * Calculates directional light orthographic projection.
   *
   * @param camera - View camera
   * @returns Light projection matrix
   */
  private calculateDirectionalLightProjection(camera: Camera): Matrix4 {
    // Calculate frustum bounds in light space
    // (Simplified - would calculate from camera frustum corners)
    const size = 50;
    return Matrix4.orthographic(-size, size, -size, size, 0.1, 200);
  }

  /**
   * Calculates cascade projection for CSM.
   *
   * @param camera - View camera
   * @param near - Cascade near plane
   * @param far - Cascade far plane
   * @returns Cascade projection matrix
   */
  private calculateCascadeProjection(camera: Camera, near: number, far: number): Matrix4 {
    // Calculate frustum bounds for this cascade
    // (Simplified - would calculate from cascade frustum corners)
    const size = far * 0.5;
    return Matrix4.orthographic(-size, size, -size, size, 0.1, far * 2);
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}

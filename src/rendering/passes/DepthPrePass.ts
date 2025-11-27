/**
 * Depth Pre-Pass for early-Z optimization.
 *
 * Renders depth-only for opaque geometry before main rendering passes.
 * Benefits:
 * - Early-Z rejection reduces fragment shader invocations
 * - Hi-Z buffer generation for occlusion culling
 * - Depth buffer for effects (SSAO, SSR, etc.)
 *
 * @module DepthPrePass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('DepthPrePass');

/**
 * Depth pre-pass configuration.
 */
export interface DepthPrePassConfig {
  /** Target resolution */
  width: number;
  height: number;
  /** Generate Hi-Z mipmap chain for occlusion culling */
  generateHiZ?: boolean;
  /** Number of Hi-Z mip levels */
  hiZLevels?: number;
}

/**
 * Depth-only vertex shader.
 * Minimal shader that only transforms position for depth writing.
 */
const DEPTH_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_mvp;

void main() {
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

/**
 * Depth-only fragment shader.
 * Empty shader - depth is written automatically.
 */
const DEPTH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

void main() {
  // Depth is written automatically to depth buffer
}
`;


/**
 * Hi-Z generation compute shader (for mipmap chain).
 * Note: Currently unused but kept for future implementation.
 */
/*
const HIZ_COMPUTE_SHADER = `#version 310 es
precision highp float;

layout(local_size_x = 8, local_size_y = 8) in;

uniform sampler2D u_depthTexture;
uniform int u_sourceMipLevel;
uniform int u_targetMipLevel;

layout(r32f, binding = 0) uniform writeonly image2D u_hiZOutput;

void main() {
  ivec2 coord = ivec2(gl_GlobalInvocationID.xy);
  ivec2 sourceCoord = coord * 2;

  // Sample 2x2 quad from source mip level
  float d0 = texelFetch(u_depthTexture, sourceCoord + ivec2(0, 0), u_sourceMipLevel).r;
  float d1 = texelFetch(u_depthTexture, sourceCoord + ivec2(1, 0), u_sourceMipLevel).r;
  float d2 = texelFetch(u_depthTexture, sourceCoord + ivec2(0, 1), u_sourceMipLevel).r;
  float d3 = texelFetch(u_depthTexture, sourceCoord + ivec2(1, 1), u_sourceMipLevel).r;

  // Max depth for conservative occlusion culling
  float maxDepth = max(max(d0, d1), max(d2, d3));

  imageStore(u_hiZOutput, coord, vec4(maxDepth));
}
`;
*/

/**
 * Depth pre-pass for early-Z optimization.
 *
 * @example
 * ```typescript
 * // Create depth pre-pass
 * const depthPrePass = new DepthPrePass({
 *   width: 1920,
 *   height: 1080,
 *   generateHiZ: true,
 *   hiZLevels: 8
 * });
 *
 * // Setup
 * depthPrePass.setup();
 *
 * // Render depth-only
 * depthPrePass.execute(opaqueQueue, depthTarget);
 *
 * // Access depth buffer for subsequent passes
 * const depthTexture = depthPrePass.getDepthTexture();
 * const hiZTexture = depthPrePass.getHiZTexture();
 * ```
 */
export class DepthPrePass extends RenderPass {
  /** Pass configuration */
  private config: DepthPrePassConfig;

  /** Depth render target */
  private depthTarget: RenderTarget | null = null;

  /** Depth-only shader */
  private shader: Shader | null = null;

  /** Camera uniform buffer */
  private cameraUBO: UniformBuffer | null = null;

  /** Model uniform buffer */
  private modelUBO: UniformBuffer | null = null;

  /** Hi-Z pyramid texture (if enabled) */
  private hiZTexture: unknown = null;

  /** Hi-Z compute shader */
  private hiZShader: Shader | null = null;

  /** Current camera */
  private currentCamera: Camera | null = null;

  /** WebGL2 rendering context */
  private gl: WebGL2RenderingContext | null = null;

  /** Statistics */
  private stats = {
    drawCalls: 0,
    triangles: 0,
    culledObjects: 0,
  };

  /**
   * Creates a new depth pre-pass.
   *
   * @param config - Depth pre-pass configuration
   */
  constructor(config: DepthPrePassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'DepthPrePass',
      colorAttachments: [], // Depth-only pass
      depthStencilAttachment: {
        name: 'depth',
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
      generateHiZ: false,
      hiZLevels: 8,
      ...config,
    };

    logger.info(`Created DepthPrePass: ${config.width}x${config.height}, Hi-Z: ${this.config.generateHiZ}`);
  }

  /**
   * Sets up depth pre-pass resources.
   */
  setup(gl?: WebGL2RenderingContext): void {
    logger.debug('Setting up DepthPrePass');

    // Store GL context if provided
    if (gl) {
      this.gl = gl;
    }

    // Create depth render target
    this.depthTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [],
      depthStencilAttachment: {
        format: TextureFormat.Depth32F,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: 1.0,
      },
      label: 'DepthPrePass',
    });

    // Create depth-only shader
    if (this.gl) {
      this.shader = new Shader({
        name: 'DepthPrePass',
        source: {
          vertex: DEPTH_VERTEX_SHADER,
          fragment: DEPTH_FRAGMENT_SHADER,
        },
        gl: this.gl,
      });

      if (!this.shader.isReady) {
        logger.error('Failed to compile depth shader', this.shader.getErrors());
      }
    }

    // Create camera uniform buffer
    const cameraUBODesc: UniformBufferDescriptor = {
      name: 'Camera',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'viewProjectionMatrix', type: UniformType.Mat4 },
      ],
    };
    this.cameraUBO = new UniformBuffer(cameraUBODesc);

    // Create model uniform buffer
    const modelUBODesc: UniformBufferDescriptor = {
      name: 'Model',
      binding: 1,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'modelMatrix', type: UniformType.Mat4 },
      ],
    };
    this.modelUBO = new UniformBuffer(modelUBODesc);

    // Create Hi-Z texture if enabled
    if (this.config.generateHiZ) {
      // Would create texture with mipmap chain here
      logger.debug(`Creating Hi-Z texture with ${this.config.hiZLevels} levels`);
    }

    logger.info('DepthPrePass setup complete');
  }

  /**
   * Executes the depth pre-pass.
   * Renders depth-only for all opaque geometry.
   *
   * @param renderQueue - Queue containing opaque geometry
   * @param renderTarget - Unused, uses internal depth target
   */
  execute(renderQueue: RenderQueue, _renderTarget: RenderTarget): void {
    if (!this.gl || !this.depthTarget || !this.currentCamera || !this.shader) {
      logger.error('DepthPrePass not properly initialized');
      return;
    }

    if (!this.shader.isReady) {
      logger.error('Depth shader not ready');
      return;
    }

    if (renderQueue.isEmpty) {
      logger.trace('DepthPrePass: empty queue, skipping');
      return;
    }

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.culledObjects = 0;

    logger.trace(`DepthPrePass: rendering ${renderQueue.length} objects`);

    // Sort queue front-to-back for early-Z
    renderQueue.sort();

    const gl = this.gl;

    // Bind depth buffer target
    if (this.depthTarget && 'getFramebuffer' in this.depthTarget) {
      const framebuffer = (this.depthTarget as any).getFramebuffer?.();
      if (framebuffer !== undefined) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer as WebGLFramebuffer | null);
      }
    }

    // Set viewport
    gl.viewport(0, 0, this.config.width, this.config.height);

    // Clear depth buffer to 1.0
    gl.clearDepth(1.0);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Set GL state for depth-only rendering
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true); // Enable depth writes

    // Disable color writes (depth-only pass)
    gl.colorMask(false, false, false, false);

    // Enable culling for better performance
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // Bind depth shader
    this.shader.bind();

    // Get view-projection matrix from camera
    const viewProjectionMatrix = this.currentCamera.viewProjectionMatrix;

    // Render depth-only for each entry
    renderQueue.forEach((entry) => {
      const { drawCall } = entry;

      // Compute MVP matrix
      // For now, assuming identity model matrix
      // In a real implementation, you would get this from the draw call's entity
      const modelMatrix = Matrix4.identity();
      const mvpMatrix = viewProjectionMatrix.multiply(modelMatrix);

      // Set MVP uniform
      this.shader!.setUniform('u_mvp', mvpMatrix);

      // Bind vertex buffers
      const vertexBuffers = drawCall.getVertexBuffers();
      for (let i = 0; i < vertexBuffers.length; i++) {
        const vb = vertexBuffers[i];
        if (vb && vb.buffer) {
          // Bind vertex buffer
          // Note: In a real implementation, you would need VAO binding
          // or manual attribute setup based on the shader's attributes
          gl.bindBuffer(gl.ARRAY_BUFFER, vb.buffer as WebGLBuffer);

          // Enable attribute (assuming a_position is at location 0)
          const positionAttr = this.shader!.getAttribute('a_position');
          if (positionAttr) {
            gl.enableVertexAttribArray(positionAttr.location);
            gl.vertexAttribPointer(
              positionAttr.location,
              3, // 3 components (x, y, z)
              gl.FLOAT,
              false,
              vb.stride,
              vb.offset
            );
          }
        }
      }

      // *** ACTUAL DRAW CALL: Render depth-only for early-Z ***
      // Draw elements
      if (drawCall.isIndexed()) {
        const indexBuffer = drawCall.indexBuffer;
        if (indexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer as WebGLBuffer);

          const indexType = indexBuffer.format === 0 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;

          if (drawCall.isInstanced()) {
            gl.drawElementsInstanced(
              this.getGLTopology(drawCall.topology),
              drawCall.indexCount,
              indexType,
              drawCall.firstIndex * (indexBuffer.format === 0 ? 2 : 4),
              drawCall.instanceCount
            );
          } else {
            gl.drawElements(
              this.getGLTopology(drawCall.topology),
              drawCall.indexCount,
              indexType,
              drawCall.firstIndex * (indexBuffer.format === 0 ? 2 : 4)
            );
          }

          this.stats.triangles += Math.floor(drawCall.indexCount / 3) * drawCall.instanceCount;
        }
      } else {
        // Non-indexed draw
        if (drawCall.isInstanced()) {
          gl.drawArraysInstanced(
            this.getGLTopology(drawCall.topology),
            drawCall.firstVertex,
            drawCall.vertexCount,
            drawCall.instanceCount
          );
        } else {
          gl.drawArrays(
            this.getGLTopology(drawCall.topology),
            drawCall.firstVertex,
            drawCall.vertexCount
          );
        }

        this.stats.triangles += Math.floor(drawCall.vertexCount / 3) * drawCall.instanceCount;
      }

      // Disable vertex attributes
      const posAttr = this.shader!.getAttribute('a_position');
      if (posAttr) {
        gl.disableVertexAttribArray(posAttr.location);
      }

      this.stats.drawCalls++;
    });

    // Unbind shader
    this.shader.unbind();

    // Restore color writes
    gl.colorMask(true, true, true, true);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Generate Hi-Z mipmap chain if enabled
    if (this.config.generateHiZ) {
      this.generateHiZ();
    }

    logger.trace(
      `DepthPrePass complete: ${this.stats.drawCalls} draws, ${this.stats.triangles} triangles, ${this.stats.culledObjects} culled`
    );
  }

  /**
   * Converts DrawCall topology to WebGL primitive type.
   *
   * @param topology - DrawCall topology
   * @returns WebGL primitive type constant
   */
  private getGLTopology(topology: number): number {
    if (!this.gl) return 0;

    const gl = this.gl;
    switch (topology) {
      case 0: return gl.POINTS;
      case 1: return gl.LINES;
      case 2: return gl.LINE_STRIP;
      case 3: return gl.TRIANGLES;
      case 4: return gl.TRIANGLE_STRIP;
      case 5: return gl.TRIANGLE_FAN;
      default: return gl.TRIANGLES;
    }
  }

  /**
   * Cleans up depth pre-pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up DepthPrePass');

    if (this.depthTarget) {
      this.depthTarget.dispose();
      this.depthTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.hiZShader) {
      this.hiZShader.dispose();
      this.hiZShader = null;
    }

    this.cameraUBO = null;
    this.modelUBO = null;
    this.hiZTexture = null;

    logger.info('DepthPrePass cleanup complete');
  }

  /**
   * Generates Hi-Z mipmap pyramid.
   * Downsamples depth buffer to create hierarchical depth buffer.
   */
  private generateHiZ(): void {
    if (!this.hiZTexture || !this.config.hiZLevels) {
      return;
    }

    logger.trace('Generating Hi-Z mipmap pyramid');

    // Generate each mip level using compute shader
    for (let level = 1; level < this.config.hiZLevels; level++) {
      // Downsample from (level - 1) to level
      // Each pixel in target = max of 2x2 quad in source

      // Dispatch compute shader
      // const targetWidth = Math.max(1, this.config.width >> level);
      // const targetHeight = Math.max(1, this.config.height >> level);
      // const groupsX = Math.ceil(targetWidth / 8);
      // const groupsY = Math.ceil(targetHeight / 8);

      // Would dispatch compute shader here: (groupsX, groupsY, 1)
    }

    logger.trace('Hi-Z generation complete');
  }

  /**
   * Updates camera for rendering.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    this.currentCamera = camera;
  }

  /**
   * Updates model matrix for an object.
   *
   * @param modelMatrix - Model transformation matrix
   */
  updateModelMatrix(modelMatrix: Matrix4): void {
    if (this.modelUBO) {
      this.modelUBO.setMat4('modelMatrix', modelMatrix);
    }
  }

  /**
   * Resizes the depth buffer.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (this.config.width === width && this.config.height === height) {
      return;
    }

    logger.info(`Resizing DepthPrePass: ${this.config.width}x${this.config.height} -> ${width}x${height}`);

    this.config.width = width;
    this.config.height = height;

    if (this.depthTarget) {
      this.depthTarget.resize(width, height);
    }

    // Recreate Hi-Z texture if enabled
    if (this.config.generateHiZ) {
      // Would recreate Hi-Z texture here
    }
  }

  /**
   * Gets the depth texture.
   */
  getDepthTexture(): unknown {
    return this.depthTarget?.getDepthStencilAttachment();
  }

  /**
   * Gets the Hi-Z pyramid texture.
   */
  getHiZTexture(): unknown {
    return this.hiZTexture;
  }

  /**
   * Tests if a bounding box is occluded using Hi-Z buffer.
   * Used for occlusion culling.
   *
   * @param min - Bounding box minimum
   * @param max - Bounding box maximum
   * @param viewProjection - View-projection matrix
   * @returns True if occluded (not visible)
   */
  isOccluded(_min: unknown, _max: unknown, _viewProjection: Matrix4): boolean {
    if (!this.hiZTexture) {
      return false; // No Hi-Z, assume visible
    }

    // Project bounding box to screen space
    // Sample appropriate Hi-Z mip level
    // Compare against nearest depth

    // (Full implementation would do screen-space AABB projection)

    return false;
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}

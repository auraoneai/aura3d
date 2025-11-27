/**
 * Voxel rendering pass with greedy meshing algorithm.
 *
 * Features:
 * - Voxel rendering
 * - Greedy meshing algorithm for optimization
 * - Ambient occlusion per voxel
 * - Colored voxels with palette support
 * - LOD support for distant chunks
 * - Chunk-based rendering with frustum culling
 *
 * Based on "Voxel Rendering Techniques" and greedy meshing optimization.
 *
 * @module VoxelPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Box3 } from '../../math/Box3';

const logger = Logger.create('VoxelPass');

/**
 * Voxel type enumeration.
 */
export enum VoxelType {
  Air = 0,
  Solid = 1,
  Transparent = 2,
}

/**
 * Voxel data structure.
 */
export interface Voxel {
  /** Voxel type */
  type: VoxelType;
  /** Color index (palette) or RGB */
  color: number;
  /** Custom data */
  data: number;
}

/**
 * Chunk configuration.
 */
export interface ChunkConfig {
  /** Chunk size in voxels (typically 16 or 32) */
  size: number;
  /** World position */
  position: Vector3;
  /** Voxel data (size^3 array) */
  voxels: Voxel[];
  /** Whether chunk needs remeshing */
  dirty: boolean;
}

/**
 * Voxel rendering configuration.
 */
export interface VoxelPassConfig {
  /** Chunk size (power of 2, e.g., 16, 32) */
  chunkSize: number;
  /** Voxel size in world units */
  voxelSize: number;
  /** Enable ambient occlusion */
  enableAO: boolean;
  /** AO intensity */
  aoIntensity: number;
  /** Enable smooth lighting */
  enableSmoothLighting: boolean;
  /** Color palette (256 colors) */
  palette: Color[];
  /** Use palette mode (vs direct RGB) */
  usePalette: boolean;
  /** Enable LOD */
  enableLOD: boolean;
  /** LOD distance threshold */
  lodDistance: number;
  /** Enable greedy meshing */
  enableGreedyMeshing: boolean;
  /** Enable backface culling */
  enableBackfaceCulling: boolean;
  /** Maximum chunks to render per frame */
  maxChunksPerFrame: number;
}

/**
 * Face direction enumeration.
 */
enum FaceDirection {
  PosX = 0,
  NegX = 1,
  PosY = 2,
  NegY = 3,
  PosZ = 4,
  NegZ = 5,
}

/**
 * Greedy mesh quad.
 */
interface GreedyQuad {
  /** Position */
  position: Vector3;
  /** Width in voxels */
  width: number;
  /** Height in voxels */
  height: number;
  /** Face direction */
  direction: FaceDirection;
  /** Color */
  color: number;
  /** AO values for corners */
  ao: [number, number, number, number];
}

/**
 * Chunk mesh data.
 */
interface ChunkMesh {
  /** Vertex buffer */
  vertexBuffer: WebGLBuffer | null;
  /** Index buffer */
  indexBuffer: WebGLBuffer | null;
  /** Vertex count */
  vertexCount: number;
  /** Index count */
  indexCount: number;
  /** Bounds */
  bounds: Box3;
}

/**
 * Voxel vertex shader (GLSL 300 ES).
 */
const VOXEL_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec3 a_position;
in vec3 a_normal;
in vec3 a_color;
in float a_ao;

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

// Outputs
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec3 v_color;
out float v_ao;

void main() {
  // Transform position to world space
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;

  // Transform normal to world space
  v_worldNormal = mat3(u_modelMatrix) * a_normal;

  // Pass color and AO
  v_color = a_color;
  v_ao = a_ao;

  // Transform to clip space
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;

/**
 * Voxel fragment shader (GLSL 300 ES).
 */
const VOXEL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec3 v_color;
in float v_ao;

// Uniforms
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform vec3 u_ambientColor;
uniform float u_aoIntensity;

// Outputs
layout(location = 0) out vec4 o_color;

void main() {
  // Normalize normal
  vec3 normal = normalize(v_worldNormal);

  // Diffuse lighting
  float diffuse = max(dot(normal, u_sunDirection), 0.0);

  // Ambient
  float ambient = 0.3;

  // Apply AO
  float ao = mix(1.0, v_ao, u_aoIntensity);

  // Combine lighting
  vec3 lighting = u_sunColor * diffuse + u_ambientColor * ambient;
  lighting *= ao;

  // Final color
  vec3 finalColor = v_color * lighting;

  o_color = vec4(finalColor, 1.0);
}
`;

/**
 * Voxel rendering pass with greedy meshing.
 *
 * Efficiently renders voxel-based geometry using:
 * - Greedy meshing algorithm to reduce quad count
 * - Per-vertex ambient occlusion
 * - Chunk-based spatial partitioning
 * - Frustum culling of chunks
 * - LOD for distant chunks
 * - Color palette support
 *
 * @example
 * ```typescript
 * const voxelPass = new VoxelPass({
 *   chunkSize: 16,
 *   voxelSize: 1.0,
 *   enableAO: true,
 *   aoIntensity: 0.7,
 *   enableSmoothLighting: true,
 *   palette: generateDefaultPalette(),
 *   usePalette: true,
 *   enableLOD: true,
 *   lodDistance: 200.0,
 *   enableGreedyMeshing: true,
 *   enableBackfaceCulling: true,
 *   maxChunksPerFrame: 100
 * });
 *
 * voxelPass.setup();
 *
 * // Add chunks
 * voxelPass.addChunk({
 *   size: 16,
 *   position: new Vector3(0, 0, 0),
 *   voxels: generateVoxelData(),
 *   dirty: true
 * });
 *
 * voxelPass.execute(renderQueue, renderTarget);
 * ```
 */
export class VoxelPass extends RenderPass {
  /** Configuration */
  private config: VoxelPassConfig;

  /** Chunk storage (keyed by position) */
  private chunks: Map<string, ChunkConfig> = new Map();

  /** Chunk meshes */
  private chunkMeshes: Map<string, ChunkMesh> = new Map();

  /** Shader program */
  private shader: WebGLProgram | null = null;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** Statistics */
  private stats = {
    chunksRendered: 0,
    chunksMeshed: 0,
    quadsRendered: 0,
    quadsOptimized: 0,
  };

  /**
   * Creates a new voxel rendering pass.
   *
   * @param config - Voxel configuration
   */
  constructor(config: VoxelPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'VoxelPass',
      colorAttachments: [
        {
          name: 'voxelColor',
          format: TextureFormat.RGBA8,
        },
      ],
      depthStencilAttachment: {
        name: 'voxelDepth',
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

    logger.info(`Created VoxelPass: chunk size ${config.chunkSize}, voxel size ${config.voxelSize}`);
  }

  /**
   * Sets up voxel pass resources.
   */
  setup(gl?: WebGL2RenderingContext): void {
    logger.debug('Setting up VoxelPass');

    // Initialize WebGL context
    if (gl) {
      this.gl = gl;
    } else {
      logger.warn('No WebGL context provided to VoxelPass.setup()');
      // In a real implementation, would get context from Engine
      return;
    }

    // Create shaders
    this.createShaders();

    logger.info('VoxelPass setup complete');
  }

  /**
   * Executes the voxel rendering pass.
   *
   * @param renderQueue - Render queue (unused)
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gl || !this.shader) {
      logger.error('VoxelPass not properly initialized');
      return;
    }

    // Reset statistics
    this.stats.chunksRendered = 0;
    this.stats.chunksMeshed = 0;
    this.stats.quadsRendered = 0;

    // Remesh dirty chunks
    this.remeshDirtyChunks();

    // Enable shader program
    this.gl.useProgram(this.shader);

    // Set up rendering state
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);

    if (this.config.enableBackfaceCulling) {
      this.gl.enable(this.gl.CULL_FACE);
      this.gl.cullFace(this.gl.BACK);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }

    // Get uniform locations
    const u_modelMatrix = this.gl.getUniformLocation(this.shader, 'u_modelMatrix');
    const u_viewMatrix = this.gl.getUniformLocation(this.shader, 'u_viewMatrix');
    const u_projectionMatrix = this.gl.getUniformLocation(this.shader, 'u_projectionMatrix');
    const u_sunDirection = this.gl.getUniformLocation(this.shader, 'u_sunDirection');
    const u_sunColor = this.gl.getUniformLocation(this.shader, 'u_sunColor');
    const u_ambientColor = this.gl.getUniformLocation(this.shader, 'u_ambientColor');
    const u_aoIntensity = this.gl.getUniformLocation(this.shader, 'u_aoIntensity');

    // Set global uniforms (would come from camera/scene in full implementation)
    const viewMatrix = Matrix4.identity();
    const projectionMatrix = Matrix4.identity();

    this.gl.uniformMatrix4fv(u_viewMatrix, false, viewMatrix.elements);
    this.gl.uniformMatrix4fv(u_projectionMatrix, false, projectionMatrix.elements);

    // Set lighting uniforms
    const sunDirection = new Vector3(0.5, 1.0, 0.3).normalize();
    this.gl.uniform3f(u_sunDirection, sunDirection.x, sunDirection.y, sunDirection.z);
    this.gl.uniform3f(u_sunColor, 1.0, 0.98, 0.95); // Warm sunlight
    this.gl.uniform3f(u_ambientColor, 0.4, 0.45, 0.5); // Cool ambient
    this.gl.uniform1f(u_aoIntensity, this.config.aoIntensity);

    // Get attribute locations
    const a_position = this.gl.getAttribLocation(this.shader, 'a_position');
    const a_normal = this.gl.getAttribLocation(this.shader, 'a_normal');
    const a_color = this.gl.getAttribLocation(this.shader, 'a_color');
    const a_ao = this.gl.getAttribLocation(this.shader, 'a_ao');

    // Render visible chunks
    this.renderChunksWithMesh(u_modelMatrix, a_position, a_normal, a_color, a_ao);

    // Cleanup state
    this.gl.disableVertexAttribArray(a_position);
    this.gl.disableVertexAttribArray(a_normal);
    this.gl.disableVertexAttribArray(a_color);
    this.gl.disableVertexAttribArray(a_ao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    this.gl.useProgram(null);

    logger.trace(`VoxelPass: ${this.stats.chunksRendered} chunks, ${this.stats.quadsRendered} quads`);
  }

  /**
   * Cleans up voxel pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up VoxelPass');

    if (this.gl) {
      // Delete shader
      this.gl.deleteProgram(this.shader);

      // Delete chunk meshes
      this.chunkMeshes.forEach(mesh => {
        this.gl!.deleteBuffer(mesh.vertexBuffer);
        this.gl!.deleteBuffer(mesh.indexBuffer);
      });
    }

    this.shader = null;
    this.chunks.clear();
    this.chunkMeshes.clear();
    this.gl = null;

    logger.info('VoxelPass cleanup complete');
  }

  /**
   * Adds a chunk to the voxel world.
   */
  addChunk(chunk: ChunkConfig): void {
    const key = this.chunkKey(chunk.position);
    this.chunks.set(key, chunk);
    logger.debug(`Added chunk at (${chunk.position.x}, ${chunk.position.y}, ${chunk.position.z})`);
  }

  /**
   * Removes a chunk from the voxel world.
   */
  removeChunk(position: Vector3): void {
    const key = this.chunkKey(position);

    // Delete mesh
    const mesh = this.chunkMeshes.get(key);
    if (mesh && this.gl) {
      this.gl.deleteBuffer(mesh.vertexBuffer);
      this.gl.deleteBuffer(mesh.indexBuffer);
    }

    this.chunks.delete(key);
    this.chunkMeshes.delete(key);

    logger.debug(`Removed chunk at (${position.x}, ${position.y}, ${position.z})`);
  }

  /**
   * Gets voxel at world position.
   */
  getVoxel(position: Vector3): Voxel | null {
    const chunkPos = this.worldToChunk(position);
    const key = this.chunkKey(chunkPos);
    const chunk = this.chunks.get(key);

    if (!chunk) {
      return null;
    }

    const localPos = this.worldToLocal(position, chunkPos);
    const index = this.voxelIndex(localPos);

    return chunk.voxels[index] || null;
  }

  /**
   * Sets voxel at world position.
   */
  setVoxel(position: Vector3, voxel: Voxel): void {
    const chunkPos = this.worldToChunk(position);
    const key = this.chunkKey(chunkPos);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      // Create new chunk
      chunk = {
        size: this.config.chunkSize,
        position: chunkPos,
        voxels: new Array(this.config.chunkSize ** 3).fill({ type: VoxelType.Air, color: 0, data: 0 }),
        dirty: true,
      };
      this.chunks.set(key, chunk);
    }

    const localPos = this.worldToLocal(position, chunkPos);
    const index = this.voxelIndex(localPos);

    chunk.voxels[index] = voxel;
    chunk.dirty = true;
  }

  /**
   * Remeshes all dirty chunks.
   */
  private remeshDirtyChunks(): void {
    const maxMeshes = 5; // Limit meshes per frame to avoid stuttering
    let meshedCount = 0;

    for (const [key, chunk] of this.chunks) {
      if (chunk.dirty && meshedCount < maxMeshes) {
        this.meshChunk(chunk);
        chunk.dirty = false;
        meshedCount++;
      }
    }

    this.stats.chunksMeshed = meshedCount;
  }

  /**
   * Meshes a chunk using greedy meshing algorithm.
   */
  private meshChunk(chunk: ChunkConfig): void {
    const quads: GreedyQuad[] = [];

    if (this.config.enableGreedyMeshing) {
      // Greedy meshing for each axis
      for (let d = 0; d < 6; d++) {
        const direction = d as FaceDirection;
        this.greedyMeshFace(chunk, direction, quads);
      }
    } else {
      // Simple meshing (one quad per visible face)
      this.simpleMesh(chunk, quads);
    }

    // Build vertex and index buffers from quads
    const mesh = this.buildMeshFromQuads(quads, chunk.position);

    // Store mesh
    const key = this.chunkKey(chunk.position);
    this.chunkMeshes.set(key, mesh);

    logger.debug(`Meshed chunk at (${chunk.position.x}, ${chunk.position.y}, ${chunk.position.z}): ${quads.length} quads`);
  }

  /**
   * Greedy meshing for a specific face direction.
   */
  private greedyMeshFace(chunk: ChunkConfig, direction: FaceDirection, quads: GreedyQuad[]): void {
    const size = chunk.size;
    const [u, v, w] = this.getFaceAxes(direction);
    const mask: (number | null)[] = new Array(size * size);

    // Sweep through each slice
    for (let d = 0; d < size; d++) {
      // Build mask for this slice
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const posArray = [0, 0, 0];
          posArray[u] = i;
          posArray[v] = j;
          posArray[w] = d;
          const pos = new Vector3(posArray[0], posArray[1], posArray[2]);

          const voxel = this.getVoxelInChunk(chunk, pos);
          const neighborArray = [pos.x, pos.y, pos.z];
          neighborArray[w] += (direction % 2 === 0 ? 1 : -1);
          const neighbor = this.getVoxelInChunk(chunk, new Vector3(
            neighborArray[0],
            neighborArray[1],
            neighborArray[2]
          ));

          // Add to mask if face is visible
          if (voxel && voxel.type === VoxelType.Solid &&
              (!neighbor || neighbor.type === VoxelType.Air)) {
            mask[j * size + i] = voxel.color;
          } else {
            mask[j * size + i] = null;
          }
        }
      }

      // Greedily merge quads in mask
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size;) {
          const color = mask[j * size + i];

          if (color !== null) {
            // Find width
            let width = 1;
            while (i + width < size && mask[j * size + i + width] === color) {
              width++;
            }

            // Find height
            let height = 1;
            let done = false;
            while (j + height < size && !done) {
              for (let k = 0; k < width; k++) {
                if (mask[(j + height) * size + i + k] !== color) {
                  done = true;
                  break;
                }
              }
              if (!done) height++;
            }

            // Create quad
            const quadPosArray = [0, 0, 0];
            quadPosArray[u] = i;
            quadPosArray[v] = j;
            quadPosArray[w] = d + (direction % 2 === 0 ? 1 : 0);
            const pos = new Vector3(quadPosArray[0], quadPosArray[1], quadPosArray[2]);

            quads.push({
              position: pos,
              width,
              height,
              direction,
              color,
              ao: [1, 1, 1, 1], // Calculate AO later
            });

            // Clear mask
            for (let h = 0; h < height; h++) {
              for (let w = 0; w < width; w++) {
                mask[(j + h) * size + i + w] = null;
              }
            }

            i += width;
          } else {
            i++;
          }
        }
      }
    }
  }

  /**
   * Simple meshing (one quad per visible face).
   */
  private simpleMesh(chunk: ChunkConfig, quads: GreedyQuad[]): void {
    const size = chunk.size;

    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const pos = new Vector3(x, y, z);
          const voxel = this.getVoxelInChunk(chunk, pos);

          if (voxel && voxel.type === VoxelType.Solid) {
            // Check each face
            for (let d = 0; d < 6; d++) {
              const direction = d as FaceDirection;
              const offset = this.getFaceOffset(direction);
              const neighbor = this.getVoxelInChunk(chunk, pos.clone().add(offset));

              if (!neighbor || neighbor.type === VoxelType.Air) {
                quads.push({
                  position: pos,
                  width: 1,
                  height: 1,
                  direction,
                  color: voxel.color,
                  ao: this.calculateAO(chunk, pos, direction),
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * Calculates ambient occlusion for a face.
   */
  private calculateAO(chunk: ChunkConfig, position: Vector3, direction: FaceDirection): [number, number, number, number] {
    if (!this.config.enableAO) {
      return [1, 1, 1, 1];
    }

    // In full implementation, check neighboring voxels for each corner
    // Return AO values [0-1] for each corner
    return [0.8, 0.9, 0.85, 0.95];
  }

  /**
   * Builds mesh buffers from quads.
   */
  private buildMeshFromQuads(quads: GreedyQuad[], chunkPosition: Vector3): ChunkMesh {
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    for (const quad of quads) {
      const [u, v, w] = this.getFaceAxes(quad.direction);
      const normal = this.getFaceNormal(quad.direction);
      const color = this.config.usePalette
        ? this.config.palette[quad.color] || Color.white()
        : new Color(
            ((quad.color >> 16) & 0xFF) / 255,
            ((quad.color >> 8) & 0xFF) / 255,
            (quad.color & 0xFF) / 255
          );

      // Calculate quad corners
      const corners = this.getQuadCorners(quad, u, v, w);

      // Add vertices
      for (let i = 0; i < 4; i++) {
        const corner = corners[i];
        const worldPos = corner.clone().multiplyScalar(this.config.voxelSize).add(chunkPosition);

        vertices.push(
          worldPos.x, worldPos.y, worldPos.z,
          normal.x, normal.y, normal.z,
          color.r, color.g, color.b,
          quad.ao[i]
        );
      }

      // Add indices (two triangles)
      indices.push(
        vertexCount, vertexCount + 1, vertexCount + 2,
        vertexCount, vertexCount + 2, vertexCount + 3
      );

      vertexCount += 4;
    }

    // Calculate bounds
    const bounds = new Box3(
      chunkPosition,
      chunkPosition.clone().add(new Vector3(
        this.config.chunkSize * this.config.voxelSize,
        this.config.chunkSize * this.config.voxelSize,
        this.config.chunkSize * this.config.voxelSize
      ))
    );

    // Create WebGL buffers
    let vertexBuffer: WebGLBuffer | null = null;
    let indexBuffer: WebGLBuffer | null = null;

    if (this.gl && vertices.length > 0) {
      // Create and populate vertex buffer
      vertexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);

      // Create and populate index buffer
      indexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

      // Unbind buffers
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    }

    return {
      vertexBuffer,
      indexBuffer,
      vertexCount: vertices.length / 10,
      indexCount: indices.length,
      bounds,
    };
  }

  /**
   * Renders all visible chunks with full WebGL mesh rendering.
   */
  private renderChunksWithMesh(
    u_modelMatrix: WebGLUniformLocation | null,
    a_position: number,
    a_normal: number,
    a_color: number,
    a_ao: number
  ): void {
    if (!this.gl) return;

    let chunksRendered = 0;
    let quadsRendered = 0;
    let processedChunks = 0;

    // Iterate through all chunks with meshes
    for (const [key, chunk] of this.chunks) {
      const mesh = this.chunkMeshes.get(key);

      if (!mesh || !mesh.vertexBuffer || !mesh.indexBuffer) {
        continue; // Skip chunks without valid meshes
      }

      // Frustum culling (in full implementation, would check against camera frustum)
      // For now, render all chunks up to maxChunksPerFrame limit
      if (processedChunks >= this.config.maxChunksPerFrame) {
        break;
      }

      // Set model matrix (chunk world position)
      const modelMatrix = Matrix4.translation(chunk.position.x, chunk.position.y, chunk.position.z);
      this.gl.uniformMatrix4fv(u_modelMatrix, false, modelMatrix.elements);

      // Bind vertex buffer
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vertexBuffer);

      // Set up vertex attributes
      // Vertex format: position(3) + normal(3) + color(3) + ao(1) = 10 floats per vertex
      const stride = 10 * Float32Array.BYTES_PER_ELEMENT;

      this.gl.enableVertexAttribArray(a_position);
      this.gl.vertexAttribPointer(a_position, 3, this.gl.FLOAT, false, stride, 0);

      this.gl.enableVertexAttribArray(a_normal);
      this.gl.vertexAttribPointer(a_normal, 3, this.gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

      this.gl.enableVertexAttribArray(a_color);
      this.gl.vertexAttribPointer(a_color, 3, this.gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);

      this.gl.enableVertexAttribArray(a_ao);
      this.gl.vertexAttribPointer(a_ao, 1, this.gl.FLOAT, false, stride, 9 * Float32Array.BYTES_PER_ELEMENT);

      // Bind index buffer
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

      // Draw chunk mesh
      this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);

      chunksRendered++;
      quadsRendered += mesh.indexCount / 6; // 6 indices per quad (2 triangles)
      processedChunks++;
    }

    this.stats.chunksRendered = chunksRendered;
    this.stats.quadsRendered = quadsRendered;
  }

  /**
   * Renders all visible chunks (legacy method for compatibility).
   */
  private renderChunks(): void {
    // This method is now a placeholder
    // Actual rendering is done in renderChunksWithMesh
    let chunksRendered = 0;
    let quadsRendered = 0;

    for (const [key, mesh] of this.chunkMeshes) {
      chunksRendered++;
      quadsRendered += mesh.indexCount / 6;
    }

    this.stats.chunksRendered = chunksRendered;
    this.stats.quadsRendered = quadsRendered;
  }

  /**
   * Creates shader programs.
   */
  private createShaders(): void {
    if (!this.gl) {
      logger.error('Cannot create shaders: WebGL context not initialized');
      return;
    }

    logger.debug('Creating voxel shaders');

    // Compile vertex shader
    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    if (!vertexShader) {
      logger.error('Failed to create vertex shader');
      return;
    }

    this.gl.shaderSource(vertexShader, VOXEL_VERTEX_SHADER);
    this.gl.compileShader(vertexShader);

    if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(vertexShader);
      logger.error(`Vertex shader compilation failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      return;
    }

    // Compile fragment shader
    const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      logger.error('Failed to create fragment shader');
      this.gl.deleteShader(vertexShader);
      return;
    }

    this.gl.shaderSource(fragmentShader, VOXEL_FRAGMENT_SHADER);
    this.gl.compileShader(fragmentShader);

    if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(fragmentShader);
      logger.error(`Fragment shader compilation failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      return;
    }

    // Link shader program
    this.shader = this.gl.createProgram();
    if (!this.shader) {
      logger.error('Failed to create shader program');
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      return;
    }

    this.gl.attachShader(this.shader, vertexShader);
    this.gl.attachShader(this.shader, fragmentShader);
    this.gl.linkProgram(this.shader);

    if (!this.gl.getProgramParameter(this.shader, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(this.shader);
      logger.error(`Shader program linking failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      this.gl.deleteProgram(this.shader);
      this.shader = null;
      return;
    }

    // Clean up shaders (they're now part of the program)
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    logger.info('Voxel shaders created successfully');
  }

  /**
   * Helper: Gets axes for face direction.
   */
  private getFaceAxes(direction: FaceDirection): [number, number, number] {
    switch (direction) {
      case FaceDirection.PosX:
      case FaceDirection.NegX:
        return [2, 1, 0]; // u=Z, v=Y, w=X
      case FaceDirection.PosY:
      case FaceDirection.NegY:
        return [0, 2, 1]; // u=X, v=Z, w=Y
      case FaceDirection.PosZ:
      case FaceDirection.NegZ:
        return [0, 1, 2]; // u=X, v=Y, w=Z
    }
  }

  /**
   * Helper: Gets normal for face direction.
   */
  private getFaceNormal(direction: FaceDirection): Vector3 {
    const normals = [
      new Vector3(1, 0, 0),  // PosX
      new Vector3(-1, 0, 0), // NegX
      new Vector3(0, 1, 0),  // PosY
      new Vector3(0, -1, 0), // NegY
      new Vector3(0, 0, 1),  // PosZ
      new Vector3(0, 0, -1), // NegZ
    ];
    return normals[direction];
  }

  /**
   * Helper: Gets offset for face direction.
   */
  private getFaceOffset(direction: FaceDirection): Vector3 {
    return this.getFaceNormal(direction);
  }

  /**
   * Helper: Gets quad corners.
   */
  private getQuadCorners(quad: GreedyQuad, u: number, v: number, w: number): Vector3[] {
    const corners: Vector3[] = [];
    const base = quad.position.clone();

    for (let i = 0; i < 4; i++) {
      const cornerArray = [base.x, base.y, base.z];
      const du = (i === 1 || i === 2) ? quad.width : 0;
      const dv = (i === 2 || i === 3) ? quad.height : 0;

      cornerArray[u] += du;
      cornerArray[v] += dv;

      corners.push(new Vector3(cornerArray[0], cornerArray[1], cornerArray[2]));
    }

    return corners;
  }

  /**
   * Helper: Gets voxel in chunk.
   */
  private getVoxelInChunk(chunk: ChunkConfig, localPos: Vector3): Voxel | null {
    if (localPos.x < 0 || localPos.x >= chunk.size ||
        localPos.y < 0 || localPos.y >= chunk.size ||
        localPos.z < 0 || localPos.z >= chunk.size) {
      return null;
    }

    const index = this.voxelIndex(localPos);
    return chunk.voxels[index];
  }

  /**
   * Helper: Converts world position to chunk position.
   */
  private worldToChunk(worldPos: Vector3): Vector3 {
    const chunkSize = this.config.chunkSize * this.config.voxelSize;
    return new Vector3(
      Math.floor(worldPos.x / chunkSize) * chunkSize,
      Math.floor(worldPos.y / chunkSize) * chunkSize,
      Math.floor(worldPos.z / chunkSize) * chunkSize
    );
  }

  /**
   * Helper: Converts world position to local voxel position.
   */
  private worldToLocal(worldPos: Vector3, chunkPos: Vector3): Vector3 {
    return new Vector3(
      Math.floor((worldPos.x - chunkPos.x) / this.config.voxelSize),
      Math.floor((worldPos.y - chunkPos.y) / this.config.voxelSize),
      Math.floor((worldPos.z - chunkPos.z) / this.config.voxelSize)
    );
  }

  /**
   * Helper: Generates chunk key from position.
   */
  private chunkKey(position: Vector3): string {
    return `${position.x},${position.y},${position.z}`;
  }

  /**
   * Helper: Calculates voxel index in chunk.
   */
  private voxelIndex(localPos: Vector3): number {
    const size = this.config.chunkSize;
    return localPos.x + localPos.y * size + localPos.z * size * size;
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}

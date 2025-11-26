import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Logger } from '../core/Logger';

/**
 * Projection grid parameters
 */
export interface ProjectionGridParams {
  resolution: number;
  rangeScale: number;
  heightScale: number;
}

/**
 * Ocean mesh data
 */
export interface OceanMeshData {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

/**
 * OceanRenderer - Renders ocean with projection grid
 *
 * Uses a camera-aligned projection grid that adapts to viewing angle,
 * providing high detail near the camera and lower detail far away.
 *
 * Features:
 * - Projection grid technique
 * - Camera-aligned mesh
 * - Adaptive LOD
 * - Efficient vertex usage
 * - Horizon handling
 *
 * @example
 * ```typescript
 * const renderer = new OceanRenderer();
 * renderer.setGridParams({ resolution: 128 });
 * const mesh = renderer.generateMesh(cameraPos, viewMatrix);
 * ```
 */
export class OceanRenderer {
  private params: ProjectionGridParams;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();

    this.params = {
      resolution: 128,
      rangeScale: 500,
      heightScale: 1.0
    };
  }

  /**
   * Sets projection grid parameters
   */
  public setGridParams(params: Partial<ProjectionGridParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Gets grid parameters
   */
  public getGridParams(): ProjectionGridParams {
    return { ...this.params };
  }

  /**
   * Generates ocean mesh using projection grid
   */
  public generateMesh(cameraPosition: Vector3, viewMatrix: Matrix4, projectionMatrix: Matrix4): OceanMeshData {
    const { resolution } = this.params;
    const vertexCount = resolution * resolution;
    const indexCount = (resolution - 1) * (resolution - 1) * 6;

    const vertices = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);

    const viewProjMatrix = projectionMatrix.clone().multiply(viewMatrix);
    const invViewProjMatrix = viewProjMatrix.clone().invert();

    if (!invViewProjMatrix) {
      this.logger.error('Failed to invert view-projection matrix');
      // Return a simple grid as fallback
      return this.generateGridMesh(cameraPosition.x, cameraPosition.z, 1000);
    }

    let vertexIndex = 0;
    let indexIndex = 0;

    // Generate grid in NDC space, project to world space
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        // NDC coordinates (-1 to 1)
        const x = (j / (resolution - 1)) * 2 - 1;
        const z = (i / (resolution - 1)) * 2 - 1;

        // Project from NDC to world space
        const worldPos = this.ndcToWorld(x, z, invViewProjMatrix, cameraPosition);

        // Store vertex
        vertices[vertexIndex * 3] = worldPos.x;
        vertices[vertexIndex * 3 + 1] = 0; // Will be displaced by waves
        vertices[vertexIndex * 3 + 2] = worldPos.z;

        // Default normal (up)
        normals[vertexIndex * 3] = 0;
        normals[vertexIndex * 3 + 1] = 1;
        normals[vertexIndex * 3 + 2] = 0;

        // UV coordinates for wave sampling
        uvs[vertexIndex * 2] = worldPos.x / 1000;
        uvs[vertexIndex * 2 + 1] = worldPos.z / 1000;

        vertexIndex++;
      }
    }

    // Generate indices
    for (let i = 0; i < resolution - 1; i++) {
      for (let j = 0; j < resolution - 1; j++) {
        const topLeft = i * resolution + j;
        const topRight = topLeft + 1;
        const bottomLeft = (i + 1) * resolution + j;
        const bottomRight = bottomLeft + 1;

        // First triangle
        indices[indexIndex++] = topLeft;
        indices[indexIndex++] = bottomLeft;
        indices[indexIndex++] = topRight;

        // Second triangle
        indices[indexIndex++] = topRight;
        indices[indexIndex++] = bottomLeft;
        indices[indexIndex++] = bottomRight;
      }
    }

    return {
      vertices,
      normals,
      uvs,
      indices,
      vertexCount,
      indexCount
    };
  }

  /**
   * Projects NDC coordinates to world space
   */
  private ndcToWorld(ndcX: number, ndcZ: number, invViewProjMatrix: Matrix4, cameraPosition: Vector3): Vector3 {
    // Use a point at y=0 (water surface)
    const ndcPoint = new Vector3(ndcX, 0, ndcZ);

    // Transform by inverse view-projection
    const worldPoint = ndcPoint.clone().applyMatrix4(invViewProjMatrix);

    // Project onto y=0 plane
    const ray = worldPoint.clone().sub(cameraPosition);
    if (Math.abs(ray.y) > 0.001) {
      const t = -cameraPosition.y / ray.y;
      const intersection = cameraPosition.clone().add(ray.multiplyScalar(t));
      return intersection;
    }

    return worldPoint;
  }

  /**
   * Generates simple grid mesh (alternative to projection grid)
   */
  public generateGridMesh(centerX: number, centerZ: number, size: number): OceanMeshData {
    const { resolution } = this.params;
    const vertexCount = resolution * resolution;
    const indexCount = (resolution - 1) * (resolution - 1) * 6;

    const vertices = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);

    const cellSize = size / (resolution - 1);
    const halfSize = size / 2;

    let vertexIndex = 0;
    let indexIndex = 0;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = centerX - halfSize + j * cellSize;
        const z = centerZ - halfSize + i * cellSize;

        vertices[vertexIndex * 3] = x;
        vertices[vertexIndex * 3 + 1] = 0;
        vertices[vertexIndex * 3 + 2] = z;

        normals[vertexIndex * 3] = 0;
        normals[vertexIndex * 3 + 1] = 1;
        normals[vertexIndex * 3 + 2] = 0;

        uvs[vertexIndex * 2] = j / (resolution - 1);
        uvs[vertexIndex * 2 + 1] = i / (resolution - 1);

        vertexIndex++;
      }
    }

    // Generate indices
    for (let i = 0; i < resolution - 1; i++) {
      for (let j = 0; j < resolution - 1; j++) {
        const topLeft = i * resolution + j;
        const topRight = topLeft + 1;
        const bottomLeft = (i + 1) * resolution + j;
        const bottomRight = bottomLeft + 1;

        indices[indexIndex++] = topLeft;
        indices[indexIndex++] = bottomLeft;
        indices[indexIndex++] = topRight;

        indices[indexIndex++] = topRight;
        indices[indexIndex++] = bottomLeft;
        indices[indexIndex++] = bottomRight;
      }
    }

    return {
      vertices,
      normals,
      uvs,
      indices,
      vertexCount,
      indexCount
    };
  }

  /**
   * Updates mesh vertices with wave displacement
   */
  public updateMeshWithWaves(
    mesh: OceanMeshData,
    getHeight: (x: number, z: number) => number,
    getNormal: (x: number, z: number) => Vector3
  ): void {
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = mesh.vertices[i * 3];
      const z = mesh.vertices[i * 3 + 2];

      // Update height
      mesh.vertices[i * 3 + 1] = getHeight(x, z);

      // Update normal
      const normal = getNormal(x, z);
      mesh.normals[i * 3] = normal.x;
      mesh.normals[i * 3 + 1] = normal.y;
      mesh.normals[i * 3 + 2] = normal.z;
    }
  }
}

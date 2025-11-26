/**
 * IsosurfaceExtractor.ts - Marching Cubes Isosurface Extraction
 *
 * Extracts triangulated isosurfaces from 3D volume data using the
 * marching cubes algorithm. Generates mesh geometry suitable for
 * surface rendering.
 *
 * Performance target: 256³ volume < 2 seconds
 *
 * @example
 * ```typescript
 * const extractor = new IsosurfaceExtractor(volumeData);
 * const mesh = extractor.extract(500); // Extract at isovalue 500
 * ```
 */

import { VolumeData } from './VolumeData';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CUBE_VERTICES } from './MarchingCubesTable';

export interface MeshGeometry {
  vertices: Float32Array;  // [x, y, z, x, y, z, ...]
  normals: Float32Array;   // [nx, ny, nz, nx, ny, nz, ...]
  indices: Uint32Array;    // Triangle indices
  vertexCount: number;
  triangleCount: number;
}

export interface ExtractOptions {
  smoothNormals?: boolean;      // Use smooth vertex normals (default: true)
  useGradientNormals?: boolean; // Calculate normals from gradients (default: true)
  bounds?: {                    // Optional extraction bounds
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export class IsosurfaceExtractor {
  private volume: VolumeData;

  constructor(volume: VolumeData) {
    this.volume = volume;
  }

  /**
   * Extracts an isosurface at the specified isovalue.
   *
   * @param isovalue - Scalar value defining the isosurface
   * @param options - Extraction options
   * @returns Mesh geometry
   */
  extract(isovalue: number, options: ExtractOptions = {}): MeshGeometry {
    const {
      smoothNormals = true,
      useGradientNormals = true,
      bounds
    } = options;

    const [width, height, depth] = this.volume.getDimensions();
    const spacing = this.volume.getSpacing();
    const origin = this.volume.getOrigin();

    const minX = bounds?.minX ?? 0;
    const maxX = bounds?.maxX ?? width - 1;
    const minY = bounds?.minY ?? 0;
    const maxY = bounds?.maxY ?? height - 1;
    const minZ = bounds?.minZ ?? 0;
    const maxZ = bounds?.maxZ ?? depth - 1;

    const vertices: number[] = [];
    const normals: number[] = [];
    const vertexMap = new Map<string, number>();

    // Process each cube in the volume
    for (let z = minZ; z < maxZ; z++) {
      for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
          this.processCube(
            x, y, z,
            isovalue,
            spacing,
            origin,
            vertices,
            normals,
            vertexMap,
            useGradientNormals
          );
        }
      }
    }

    // Convert to typed arrays
    const vertexArray = new Float32Array(vertices);
    let normalArray = new Float32Array(normals);

    // Smooth normals if requested
    if (smoothNormals && !useGradientNormals) {
      normalArray = this.computeSmoothNormals(vertexArray);
    }

    // Generate indices (sequential for now)
    const indexArray = new Uint32Array(vertices.length / 3);
    for (let i = 0; i < indexArray.length; i++) {
      indexArray[i] = i;
    }

    return {
      vertices: vertexArray,
      normals: normalArray,
      indices: indexArray,
      vertexCount: vertices.length / 3,
      triangleCount: vertices.length / 9
    };
  }

  private processCube(
    x: number,
    y: number,
    z: number,
    isovalue: number,
    spacing: [number, number, number],
    origin: [number, number, number],
    vertices: number[],
    normals: number[],
    vertexMap: Map<string, number>,
    useGradientNormals: boolean
  ): void {
    // Get the 8 corner values
    const cubeValues: number[] = [];
    for (const [dx, dy, dz] of CUBE_VERTICES) {
      cubeValues.push(this.volume.getVoxel(x + dx, y + dy, z + dz));
    }

    // Determine cube index based on which vertices are inside/outside
    let cubeIndex = 0;
    for (let i = 0; i < 8; i++) {
      if (cubeValues[i] > isovalue) {
        cubeIndex |= (1 << i);
      }
    }

    // Check if cube is entirely inside or outside
    if (EDGE_TABLE[cubeIndex] === 0) {
      return;
    }

    // Calculate intersection points on edges
    const edgeVertices: Array<[number, number, number]> = [];

    for (let i = 0; i < 12; i++) {
      if ((EDGE_TABLE[cubeIndex] & (1 << i)) !== 0) {
        const [v1, v2] = EDGE_VERTICES[i];
        const val1 = cubeValues[v1];
        const val2 = cubeValues[v2];

        // Interpolation factor
        const t = (isovalue - val1) / (val2 - val1);

        const p1 = CUBE_VERTICES[v1];
        const p2 = CUBE_VERTICES[v2];

        // Interpolated position in local cube coordinates
        const localX = p1[0] + t * (p2[0] - p1[0]);
        const localY = p1[1] + t * (p2[1] - p1[1]);
        const localZ = p1[2] + t * (p2[2] - p1[2]);

        // Convert to world coordinates
        const worldX = origin[0] + (x + localX) * spacing[0];
        const worldY = origin[1] + (y + localY) * spacing[1];
        const worldZ = origin[2] + (z + localZ) * spacing[2];

        edgeVertices[i] = [worldX, worldY, worldZ];
      }
    }

    // Generate triangles
    const triangles = TRIANGLE_TABLE[cubeIndex];
    for (let i = 0; i < triangles.length; i += 3) {
      if (triangles[i] === -1) break;

      const v1 = edgeVertices[triangles[i]];
      const v2 = edgeVertices[triangles[i + 1]];
      const v3 = edgeVertices[triangles[i + 2]];

      // Add vertices
      vertices.push(v1[0], v1[1], v1[2]);
      vertices.push(v2[0], v2[1], v2[2]);
      vertices.push(v3[0], v3[1], v3[2]);

      // Calculate normals
      let normal: [number, number, number];

      if (useGradientNormals) {
        // Use gradient-based normals for each vertex
        const n1 = this.getGradientNormal(v1, spacing, origin);
        const n2 = this.getGradientNormal(v2, spacing, origin);
        const n3 = this.getGradientNormal(v3, spacing, origin);

        normals.push(n1[0], n1[1], n1[2]);
        normals.push(n2[0], n2[1], n2[2]);
        normals.push(n3[0], n3[1], n3[2]);
      } else {
        // Use face normal for all three vertices
        normal = this.computeFaceNormal(v1, v2, v3);

        normals.push(normal[0], normal[1], normal[2]);
        normals.push(normal[0], normal[1], normal[2]);
        normals.push(normal[0], normal[1], normal[2]);
      }
    }
  }

  private getGradientNormal(
    worldPos: [number, number, number],
    spacing: [number, number, number],
    origin: [number, number, number]
  ): [number, number, number] {
    // Convert world position to voxel coordinates
    const voxelX = (worldPos[0] - origin[0]) / spacing[0];
    const voxelY = (worldPos[1] - origin[1]) / spacing[1];
    const voxelZ = (worldPos[2] - origin[2]) / spacing[2];

    // Get gradient
    const gradient = this.volume.getGradient(
      Math.floor(voxelX),
      Math.floor(voxelY),
      Math.floor(voxelZ)
    );

    // Normalize
    return this.normalize(gradient);
  }

  private computeFaceNormal(
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number]
  ): [number, number, number] {
    // Calculate edge vectors
    const e1: [number, number, number] = [
      v2[0] - v1[0],
      v2[1] - v1[1],
      v2[2] - v1[2]
    ];

    const e2: [number, number, number] = [
      v3[0] - v1[0],
      v3[1] - v1[1],
      v3[2] - v1[2]
    ];

    // Cross product
    const normal: [number, number, number] = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];

    return this.normalize(normal);
  }

  private normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 1e-10) {
      return [0, 0, 1];
    }
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private computeSmoothNormals(vertices: Float32Array): Float32Array {
    const normals = new Float32Array(vertices.length);
    const vertexNormals = new Map<string, number[]>();

    // Accumulate normals for each unique vertex
    for (let i = 0; i < vertices.length; i += 9) {
      // Triangle vertices
      const v1 = [vertices[i], vertices[i + 1], vertices[i + 2]];
      const v2 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
      const v3 = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];

      const normal = this.computeFaceNormal(
        v1 as [number, number, number],
        v2 as [number, number, number],
        v3 as [number, number, number]
      );

      // Accumulate for each vertex
      for (let j = 0; j < 3; j++) {
        const idx = i + j * 3;
        const key = `${vertices[idx]},${vertices[idx + 1]},${vertices[idx + 2]}`;

        if (!vertexNormals.has(key)) {
          vertexNormals.set(key, [0, 0, 0]);
        }

        const accumulated = vertexNormals.get(key)!;
        accumulated[0] += normal[0];
        accumulated[1] += normal[1];
        accumulated[2] += normal[2];
      }
    }

    // Normalize accumulated normals and assign
    for (let i = 0; i < vertices.length; i += 3) {
      const key = `${vertices[i]},${vertices[i + 1]},${vertices[i + 2]}`;
      const accumulated = vertexNormals.get(key)!;
      const normalized = this.normalize(accumulated as [number, number, number]);

      normals[i] = normalized[0];
      normals[i + 1] = normalized[1];
      normals[i + 2] = normalized[2];
    }

    return normals;
  }

  /**
   * Extracts multiple isosurfaces at different isovalues.
   *
   * @param isovalues - Array of isovalues to extract
   * @param options - Extraction options
   * @returns Array of mesh geometries
   */
  extractMultiple(isovalues: number[], options: ExtractOptions = {}): MeshGeometry[] {
    return isovalues.map(isovalue => this.extract(isovalue, options));
  }

  /**
   * Simplifies a mesh by decimating vertices (simple implementation).
   *
   * @param mesh - Input mesh geometry
   * @param targetReduction - Target reduction factor (0-1)
   * @returns Simplified mesh geometry
   */
  simplify(mesh: MeshGeometry, targetReduction: number = 0.5): MeshGeometry {
    // Simple decimation: keep every Nth triangle
    const keepRatio = 1 - targetReduction;
    const newTriangleCount = Math.floor(mesh.triangleCount * keepRatio);
    const stride = Math.floor(mesh.triangleCount / newTriangleCount);

    const vertices: number[] = [];
    const normals: number[] = [];

    for (let i = 0; i < mesh.triangleCount; i += stride) {
      const baseIdx = i * 9;

      for (let j = 0; j < 9; j++) {
        vertices.push(mesh.vertices[baseIdx + j]);
        normals.push(mesh.normals[baseIdx + j]);
      }
    }

    const vertexArray = new Float32Array(vertices);
    const normalArray = new Float32Array(normals);
    const indexArray = new Uint32Array(vertices.length / 3);

    for (let i = 0; i < indexArray.length; i++) {
      indexArray[i] = i;
    }

    return {
      vertices: vertexArray,
      normals: normalArray,
      indices: indexArray,
      vertexCount: vertices.length / 3,
      triangleCount: vertices.length / 9
    };
  }
}

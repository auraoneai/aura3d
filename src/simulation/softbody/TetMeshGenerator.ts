/**
 * Tetrahedral mesh generation from surface meshes.
 * Provides multiple algorithms for creating volumetric tet meshes.
 * @module TetMeshGenerator
 */

import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';

/**
 * Tetrahedral mesh data structure.
 */
export interface TetMesh {
  /** Vertex positions */
  vertices: Vector3[];
  /** Tetrahedra (4 vertex indices per tet) */
  tetrahedra: [number, number, number, number][];
  /** Surface triangle indices (for rendering) */
  surfaceTriangles: [number, number, number][];
}

/**
 * Configuration for tet mesh generation.
 */
export interface TetGenConfig {
  /** Target edge length for tetrahedra */
  targetEdgeLength?: number;
  /** Maximum number of Steiner points to add */
  maxSteinerPoints?: number;
  /** Quality threshold (0-1, higher = better quality) */
  qualityThreshold?: number;
  /** Enable Delaunay refinement */
  delaunayRefinement?: boolean;
}

/**
 * Tetrahedral mesh generator for soft body simulation.
 * Converts surface meshes to volumetric tetrahedral meshes.
 *
 * @example
 * ```typescript
 * const generator = new TetMeshGenerator();
 *
 * // Generate from surface mesh
 * const surfaceVertices = [...];
 * const surfaceTriangles = [...];
 *
 * const tetMesh = generator.generateFromSurface(
 *   surfaceVertices,
 *   surfaceTriangles,
 *   { targetEdgeLength: 0.5 }
 * );
 *
 * // Or generate from box
 * const boxMesh = generator.generateBox(
 *   new Vector3(-1, -1, -1),
 *   new Vector3(1, 1, 1),
 *   4, 4, 4
 * );
 * ```
 */
export class TetMeshGenerator {
  /**
   * Generates a tetrahedral mesh from a surface mesh.
   * Uses a simple grid-based approach with surface conformity.
   *
   * @param vertices - Surface mesh vertices
   * @param triangles - Surface mesh triangles (3 indices per triangle)
   * @param config - Generation configuration
   * @returns Tetrahedral mesh
   */
  generateFromSurface(
    vertices: Vector3[],
    triangles: [number, number, number][],
    config: TetGenConfig = {}
  ): TetMesh {
    const targetEdgeLength = config.targetEdgeLength ?? 0.5;

    const bounds = this.computeBounds(vertices);
    const size = bounds.max.sub(bounds.min);

    const nx = Math.max(2, Math.ceil(size.x / targetEdgeLength));
    const ny = Math.max(2, Math.ceil(size.y / targetEdgeLength));
    const nz = Math.max(2, Math.ceil(size.z / targetEdgeLength));

    const gridMesh = this.generateBox(bounds.min, bounds.max, nx, ny, nz);

    const insidePoints: Vector3[] = [];
    const insideIndices: number[] = [];

    for (let i = 0; i < gridMesh.vertices.length; i++) {
      if (this.isPointInside(gridMesh.vertices[i], vertices, triangles)) {
        insideIndices.push(i);
        insidePoints.push(gridMesh.vertices[i]);
      }
    }

    const surfaceVertices = [...vertices];
    const vertexMap = new Map<number, number>();
    for (let i = 0; i < insideIndices.length; i++) {
      vertexMap.set(insideIndices[i], surfaceVertices.length);
      surfaceVertices.push(insidePoints[i]);
    }

    const tets: [number, number, number, number][] = [];

    for (const tet of gridMesh.tetrahedra) {
      const mappedIndices = tet.map(idx => {
        const mapped = vertexMap.get(idx);
        return mapped !== undefined ? mapped : -1;
      });

      if (mappedIndices.every(idx => idx >= 0)) {
        tets.push(mappedIndices as [number, number, number, number]);
      }
    }

    return {
      vertices: surfaceVertices,
      tetrahedra: tets,
      surfaceTriangles: triangles,
    };
  }

  /**
   * Generates a box-shaped tetrahedral mesh.
   *
   * @param min - Minimum corner
   * @param max - Maximum corner
   * @param nx - Number of divisions along X
   * @param ny - Number of divisions along Y
   * @param nz - Number of divisions along Z
   * @returns Tetrahedral mesh
   */
  generateBox(
    min: Vector3,
    max: Vector3,
    nx: number,
    ny: number,
    nz: number
  ): TetMesh {
    const vertices: Vector3[] = [];
    const dx = (max.x - min.x) / nx;
    const dy = (max.y - min.y) / ny;
    const dz = (max.z - min.z) / nz;

    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          vertices.push(new Vector3(
            min.x + i * dx,
            min.y + j * dy,
            min.z + k * dz
          ));
        }
      }
    }

    const getIndex = (i: number, j: number, k: number): number => {
      return k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
    };

    const tetrahedra: [number, number, number, number][] = [];

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v000 = getIndex(i, j, k);
          const v100 = getIndex(i + 1, j, k);
          const v010 = getIndex(i, j + 1, k);
          const v110 = getIndex(i + 1, j + 1, k);
          const v001 = getIndex(i, j, k + 1);
          const v101 = getIndex(i + 1, j, k + 1);
          const v011 = getIndex(i, j + 1, k + 1);
          const v111 = getIndex(i + 1, j + 1, k + 1);

          tetrahedra.push(
            [v000, v100, v010, v001],
            [v100, v110, v010, v111],
            [v100, v001, v101, v111],
            [v010, v001, v011, v111],
            [v100, v010, v001, v111]
          );
        }
      }
    }

    const surfaceTriangles = this.extractSurfaceTriangles(vertices.length, tetrahedra);

    return {
      vertices,
      tetrahedra,
      surfaceTriangles,
    };
  }

  /**
   * Generates a sphere-shaped tetrahedral mesh.
   *
   * @param center - Center of the sphere
   * @param radius - Radius of the sphere
   * @param resolution - Number of radial divisions
   * @returns Tetrahedral mesh
   */
  generateSphere(center: Vector3, radius: number, resolution: number = 8): TetMesh {
    const min = center.sub(new Vector3(radius, radius, radius));
    const max = center.add(new Vector3(radius, radius, radius));

    const boxMesh = this.generateBox(min, max, resolution, resolution, resolution);

    const vertices: Vector3[] = [];
    const vertexMap = new Map<number, number>();

    for (let i = 0; i < boxMesh.vertices.length; i++) {
      const dist = boxMesh.vertices[i].sub(center).length();
      if (dist <= radius) {
        vertexMap.set(i, vertices.length);
        vertices.push(boxMesh.vertices[i]);
      }
    }

    const tetrahedra: [number, number, number, number][] = [];

    for (const tet of boxMesh.tetrahedra) {
      const mappedIndices = tet.map(idx => vertexMap.get(idx));

      if (mappedIndices.every(idx => idx !== undefined)) {
        tetrahedra.push(mappedIndices as [number, number, number, number]);
      }
    }

    const surfaceTriangles = this.extractSurfaceTriangles(vertices.length, tetrahedra);

    return {
      vertices,
      tetrahedra,
      surfaceTriangles,
    };
  }

  /**
   * Generates a cylinder-shaped tetrahedral mesh.
   *
   * @param start - Start point (center of bottom cap)
   * @param end - End point (center of top cap)
   * @param radius - Radius of the cylinder
   * @param radialSegments - Number of radial segments
   * @param heightSegments - Number of height segments
   * @returns Tetrahedral mesh
   */
  generateCylinder(
    start: Vector3,
    end: Vector3,
    radius: number,
    radialSegments: number = 8,
    heightSegments: number = 4
  ): TetMesh {
    const axis = end.sub(start).normalize();
    const height = start.sub(end).length();

    const perpendicular = Math.abs(axis.y) < 0.9
      ? new Vector3(0, 1, 0)
      : new Vector3(1, 0, 0);

    const u = axis.cross(perpendicular).normalize();
    const v = axis.cross(u);

    const vertices: Vector3[] = [];

    vertices.push(start.clone());

    for (let h = 0; h <= heightSegments; h++) {
      const t = h / heightSegments;
      const centerPoint = start.lerp(end, t);

      for (let r = 0; r < radialSegments; r++) {
        const angle = (r / radialSegments) * Math.PI * 2;
        const offset = u.scale(Math.cos(angle) * radius).add(
          v.scale(Math.sin(angle) * radius)
        );
        vertices.push(centerPoint.add(offset));
      }
    }

    vertices.push(end.clone());

    const tetrahedra: [number, number, number, number][] = [];

    for (let h = 0; h < heightSegments; h++) {
      for (let r = 0; r < radialSegments; r++) {
        const r1 = (r + 1) % radialSegments;

        const i0 = 1 + h * radialSegments + r;
        const i1 = 1 + h * radialSegments + r1;
        const i2 = 1 + (h + 1) * radialSegments + r;
        const i3 = 1 + (h + 1) * radialSegments + r1;

        if (h === 0) {
          tetrahedra.push([0, i0, i1, i2]);
        } else if (h === heightSegments - 1) {
          tetrahedra.push([i0, i1, i2, vertices.length - 1]);
        }

        tetrahedra.push([i0, i1, i2, i3]);
        tetrahedra.push([i1, i2, i3, i0]);
      }
    }

    const surfaceTriangles = this.extractSurfaceTriangles(vertices.length, tetrahedra);

    return {
      vertices,
      tetrahedra,
      surfaceTriangles,
    };
  }

  /**
   * Refines a tetrahedral mesh by subdividing tetrahedra.
   *
   * @param mesh - Input mesh
   * @returns Refined mesh
   */
  refine(mesh: TetMesh): TetMesh {
    const vertices = [...mesh.vertices];
    const tetrahedra: [number, number, number, number][] = [];

    const edgeMap = new Map<string, number>();

    const getMidpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      let idx = edgeMap.get(key);

      if (idx === undefined) {
        idx = vertices.length;
        vertices.push(mesh.vertices[a].lerp(mesh.vertices[b], 0.5));
        edgeMap.set(key, idx);
      }

      return idx;
    };

    for (const tet of mesh.tetrahedra) {
      const [v0, v1, v2, v3] = tet;

      const m01 = getMidpoint(v0, v1);
      const m02 = getMidpoint(v0, v2);
      const m03 = getMidpoint(v0, v3);
      const m12 = getMidpoint(v1, v2);
      const m13 = getMidpoint(v1, v3);
      const m23 = getMidpoint(v2, v3);

      tetrahedra.push(
        [v0, m01, m02, m03],
        [v1, m01, m12, m13],
        [v2, m02, m12, m23],
        [v3, m03, m13, m23],
        [m01, m02, m03, m12],
        [m01, m02, m12, m13],
        [m02, m03, m12, m23],
        [m01, m03, m12, m13]
      );
    }

    const surfaceTriangles = this.extractSurfaceTriangles(vertices.length, tetrahedra);

    return {
      vertices,
      tetrahedra,
      surfaceTriangles,
    };
  }

  /**
   * Extracts surface triangles from a tetrahedral mesh.
   */
  private extractSurfaceTriangles(
    vertexCount: number,
    tetrahedra: [number, number, number, number][]
  ): [number, number, number][] {
    const faceMap = new Map<string, number>();

    const addFace = (a: number, b: number, c: number): void => {
      const sorted = [a, b, c].sort((x, y) => x - y);
      const key = `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
      const count = faceMap.get(key) ?? 0;
      faceMap.set(key, count + 1);
    };

    for (const tet of tetrahedra) {
      addFace(tet[0], tet[1], tet[2]);
      addFace(tet[0], tet[1], tet[3]);
      addFace(tet[0], tet[2], tet[3]);
      addFace(tet[1], tet[2], tet[3]);
    }

    const surfaceTriangles: [number, number, number][] = [];

    for (const [key, count] of faceMap.entries()) {
      if (count === 1) {
        const indices = key.split('-').map(Number);
        surfaceTriangles.push([indices[0], indices[1], indices[2]]);
      }
    }

    return surfaceTriangles;
  }

  /**
   * Computes bounding box of vertices.
   */
  private computeBounds(vertices: Vector3[]): Box3 {
    const bounds = Box3.empty();
    for (const v of vertices) {
      bounds.expandByPoint(v);
    }
    return bounds;
  }

  /**
   * Tests if a point is inside a closed surface mesh.
   * Uses ray casting algorithm.
   */
  private isPointInside(
    point: Vector3,
    vertices: Vector3[],
    triangles: [number, number, number][]
  ): boolean {
    const direction = new Vector3(1, 0.123456, 0.789012).normalize();
    let intersectionCount = 0;

    for (const tri of triangles) {
      const v0 = vertices[tri[0]];
      const v1 = vertices[tri[1]];
      const v2 = vertices[tri[2]];

      if (this.rayIntersectsTriangle(point, direction, v0, v1, v2)) {
        intersectionCount++;
      }
    }

    return intersectionCount % 2 === 1;
  }

  /**
   * Ray-triangle intersection test (Möller-Trumbore algorithm).
   */
  private rayIntersectsTriangle(
    origin: Vector3,
    direction: Vector3,
    v0: Vector3,
    v1: Vector3,
    v2: Vector3
  ): boolean {
    const EPSILON = 1e-6;

    const edge1 = v1.sub(v0);
    const edge2 = v2.sub(v0);
    const h = direction.cross(edge2);
    const a = edge1.dot(h);

    if (Math.abs(a) < EPSILON) return false;

    const f = 1.0 / a;
    const s = origin.sub(v0);
    const u = f * s.dot(h);

    if (u < 0 || u > 1) return false;

    const q = s.cross(edge1);
    const v = f * direction.dot(q);

    if (v < 0 || u + v > 1) return false;

    const t = f * edge2.dot(q);

    return t > EPSILON;
  }

  /**
   * Computes quality metric for a tetrahedron.
   * Returns value in [0, 1] where 1 is perfect (regular tetrahedron).
   *
   * @param vertices - Vertices of the tetrahedron
   * @returns Quality metric (0-1)
   */
  computeTetQuality(vertices: [Vector3, Vector3, Vector3, Vector3]): number {
    const [v0, v1, v2, v3] = vertices;

    const e01 = v1.sub(v0).length();
    const e02 = v2.sub(v0).length();
    const e03 = v3.sub(v0).length();
    const e12 = v2.sub(v1).length();
    const e13 = v3.sub(v1).length();
    const e23 = v3.sub(v2).length();

    const longestEdge = Math.max(e01, e02, e03, e12, e13, e23);

    const d1 = v1.sub(v0);
    const d2 = v2.sub(v0);
    const d3 = v3.sub(v0);

    const volume = Math.abs(d1.dot(d2.cross(d3))) / 6.0;

    const aspectRatio = volume / (longestEdge * longestEdge * longestEdge);

    const idealAspectRatio = Math.sqrt(2) / 12;

    return Math.min(1, aspectRatio / idealAspectRatio);
  }
}

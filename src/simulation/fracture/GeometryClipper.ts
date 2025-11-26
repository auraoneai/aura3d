/**
 * Mesh clipping and boolean operations for fracture systems.
 * Clips meshes against Voronoi cells to create fragments.
 * @module GeometryClipper
 */

import { Vector3 } from '../../math/Vector3';
import { Plane } from '../../math/Plane';
import { Mesh } from '../../rendering/geometry/Mesh';
import { VertexBuffer } from '../../rendering/geometry/VertexBuffer';
import { IndexBuffer } from '../../rendering/geometry/IndexBuffer';
import { VertexFormat } from '../../rendering/geometry/VertexFormat';
import { VoronoiCell } from './VoronoiMath';

/**
 * Result of clipping a mesh against a convex region.
 */
export interface ClipResult {
  /** Clipped mesh */
  mesh: Mesh;
  /** Indices of interior faces (newly created) */
  interiorFaces: number[];
  /** Volume of the clipped region */
  volume: number;
}

/**
 * Vertex data with interpolatable attributes.
 */
interface ClipVertex {
  position: Vector3;
  normal: Vector3;
  uv: [number, number];
  index: number;
}

/**
 * Geometry clipper for mesh fragmentation.
 * Clips meshes against convex regions (Voronoi cells) to create fragments.
 *
 * @example
 * ```typescript
 * const clipper = new GeometryClipper();
 *
 * // Clip mesh against a Voronoi cell
 * const result = clipper.clipMeshByCell(mesh, voronoiCell);
 *
 * if (result) {
 *   console.log(`Fragment volume: ${result.volume}`);
 *   console.log(`Interior faces: ${result.interiorFaces.length}`);
 * }
 * ```
 */
export class GeometryClipper {
  /**
   * Clips a mesh against a Voronoi cell.
   *
   * @param mesh - Input mesh
   * @param cell - Voronoi cell defining the clipping region
   * @returns Clipped mesh result or null if completely outside
   */
  clipMeshByCell(mesh: Mesh, cell: VoronoiCell): ClipResult | null {
    const planes = this.getCellPlanes(cell);

    let currentVertices = this.extractVertices(mesh);
    let currentTriangles = this.extractTriangles(mesh);

    const interiorFaceMap = new Map<string, number[]>();

    for (const plane of planes) {
      const clipResult = this.clipByPlane(currentVertices, currentTriangles, plane);

      if (!clipResult) return null;

      currentVertices = clipResult.vertices;
      currentTriangles = clipResult.triangles;

      if (clipResult.interiorTriangles.length > 0) {
        const key = this.planeKey(plane);
        interiorFaceMap.set(key, clipResult.interiorTriangles);
      }
    }

    if (currentVertices.length === 0 || currentTriangles.length === 0) {
      return null;
    }

    const resultMesh = this.buildMesh(currentVertices, currentTriangles);

    const interiorFaces: number[] = [];
    for (const triangles of interiorFaceMap.values()) {
      interiorFaces.push(...triangles);
    }

    const volume = this.computeVolume(currentVertices, currentTriangles);

    return {
      mesh: resultMesh,
      interiorFaces,
      volume,
    };
  }

  /**
   * Extracts planes defining a Voronoi cell boundary.
   */
  private getCellPlanes(cell: VoronoiCell): Plane[] {
    const planes: Plane[] = [];

    for (const face of cell.faces) {
      if (face.length < 3) continue;

      const v0 = cell.vertices[face[0]];
      const v1 = cell.vertices[face[1]];
      const v2 = cell.vertices[face[2]];

      const e1 = v1.sub(v0);
      const e2 = v2.sub(v0);
      const normal = e1.cross(e2).normalize();

      const towardsSite = cell.site.sub(v0);
      const facing = normal.dot(towardsSite);

      const finalNormal = facing < 0 ? normal : normal.negate();
      const distance = -finalNormal.dot(v0);

      planes.push(new Plane(finalNormal, distance));
    }

    return planes;
  }

  /**
   * Extracts vertices from a mesh.
   */
  private extractVertices(mesh: Mesh): ClipVertex[] {
    const vertices: ClipVertex[] = [];
    const pos = [0, 0, 0];
    const normal = [0, 0, 0];
    const uv = [0, 0];

    for (let i = 0; i < mesh.vertexCount; i++) {
      mesh.vertexBuffer.getPosition(i, pos);
      mesh.vertexBuffer.getNormal(i, normal);
      mesh.vertexBuffer.getTexCoord(i, 0, uv);

      vertices.push({
        position: new Vector3(pos[0], pos[1], pos[2]),
        normal: new Vector3(normal[0], normal[1], normal[2]),
        uv: [uv[0], uv[1]],
        index: i,
      });
    }

    return vertices;
  }

  /**
   * Extracts triangles from a mesh.
   */
  private extractTriangles(mesh: Mesh): [number, number, number][] {
    const triangles: [number, number, number][] = [];

    for (let i = 0; i < mesh.indexCount; i += 3) {
      const i0 = mesh.indexBuffer.getIndex(i);
      const i1 = mesh.indexBuffer.getIndex(i + 1);
      const i2 = mesh.indexBuffer.getIndex(i + 2);

      triangles.push([i0, i1, i2]);
    }

    return triangles;
  }

  /**
   * Clips geometry by a plane.
   */
  private clipByPlane(
    vertices: ClipVertex[],
    triangles: [number, number, number][],
    plane: Plane
  ): {
    vertices: ClipVertex[];
    triangles: [number, number, number][];
    interiorTriangles: number[];
  } | null {
    const distances = vertices.map(v => plane.distanceToPoint(v.position));

    const allOutside = distances.every(d => d > 1e-6);
    if (allOutside) return null;

    const newVertices: ClipVertex[] = [];
    const vertexMap = new Map<number, number>();

    for (let i = 0; i < vertices.length; i++) {
      if (distances[i]! <= 1e-6) {
        vertexMap.set(i, newVertices.length);
        newVertices.push({ ...vertices[i]!, index: newVertices.length });
      }
    }

    const edgeIntersections = new Map<string, number>();

    const getEdgeKey = (a: number, b: number): string => {
      return a < b ? `${a}-${b}` : `${b}-${a}`;
    };

    const newTriangles: [number, number, number][] = [];
    const interiorVertices: number[] = [];

    for (const [i0, i1, i2] of triangles) {
      const d0 = distances[i0]!;
      const d1 = distances[i1]!;
      const d2 = distances[i2]!;

      const inside = [d0 <= 1e-6, d1 <= 1e-6, d2 <= 1e-6];
      const insideCount = inside.filter(x => x).length;

      if (insideCount === 3) {
        const v0 = vertexMap.get(i0)!;
        const v1 = vertexMap.get(i1)!;
        const v2 = vertexMap.get(i2)!;
        newTriangles.push([v0, v1, v2]);
      } else if (insideCount === 2) {
        const indices = [i0, i1, i2];
        const insideIndices = indices.filter((_, i) => inside[i]);
        const outsideIndex = indices.find((_, i) => !inside[i])!;

        const v0 = vertexMap.get(insideIndices[0]!)!;
        const v1 = vertexMap.get(insideIndices[1]!)!;

        const intersections: number[] = [];
        for (const insideIdx of insideIndices) {
          const edgeKey = getEdgeKey(insideIdx, outsideIndex);
          let intIdx = edgeIntersections.get(edgeKey);

          if (intIdx === undefined) {
            const t = distances[insideIdx]! / (distances[insideIdx]! - distances[outsideIndex]!);
            const newVertex = this.interpolateVertex(
              vertices[insideIdx]!,
              vertices[outsideIndex]!,
              t
            );
            newVertex.index = newVertices.length;
            intIdx = newVertices.length;
            newVertices.push(newVertex);
            edgeIntersections.set(edgeKey, intIdx);
            interiorVertices.push(intIdx);
          }

          intersections.push(intIdx);
        }

        newTriangles.push([v0, v1, intersections[0]!]);
        newTriangles.push([v1, intersections[1]!, intersections[0]!]);
      } else if (insideCount === 1) {
        const indices = [i0, i1, i2];
        const insideIndex = indices.find((_, i) => inside[i]!)!;
        const outsideIndices = indices.filter((_, i) => !inside[i]!);

        const v0 = vertexMap.get(insideIndex)!;

        const intersections: number[] = [];
        for (const outsideIdx of outsideIndices) {
          const edgeKey = getEdgeKey(insideIndex, outsideIdx);
          let intIdx = edgeIntersections.get(edgeKey);

          if (intIdx === undefined) {
            const t = distances[insideIndex]! / (distances[insideIndex]! - distances[outsideIdx]!);
            const newVertex = this.interpolateVertex(
              vertices[insideIndex]!,
              vertices[outsideIdx]!,
              t
            );
            newVertex.index = newVertices.length;
            intIdx = newVertices.length;
            newVertices.push(newVertex);
            edgeIntersections.set(edgeKey, intIdx);
            interiorVertices.push(intIdx);
          }

          intersections.push(intIdx);
        }

        newTriangles.push([v0, intersections[0]!, intersections[1]!]);
      }
    }

    const interiorTriangleIndices: number[] = [];
    if (interiorVertices.length >= 3) {
      const uniqueVertices = Array.from(new Set(interiorVertices));
      const positions = uniqueVertices.map(i => newVertices[i].position);

      const centroid = positions.reduce((sum, p) => sum.add(p), new Vector3())
        .scale(1 / positions.length);

      const sortedIndices = this.sortCoplanarVertices(
        positions,
        plane.normal,
        centroid
      );

      for (let i = 1; i < sortedIndices.length - 1; i++) {
        const idx0 = uniqueVertices[sortedIndices[0]];
        const idx1 = uniqueVertices[sortedIndices[i]];
        const idx2 = uniqueVertices[sortedIndices[i + 1]];

        const triIndex = newTriangles.length;
        newTriangles.push([idx0, idx1, idx2]);
        interiorTriangleIndices.push(triIndex);
      }
    }

    return {
      vertices: newVertices,
      triangles: newTriangles,
      interiorTriangles: interiorTriangleIndices,
    };
  }

  /**
   * Interpolates vertex attributes.
   */
  private interpolateVertex(v0: ClipVertex, v1: ClipVertex, t: number): ClipVertex {
    return {
      position: v0.position.lerp(v1.position, t),
      normal: v0.normal.lerp(v1.normal, t).normalize(),
      uv: [
        v0.uv[0] + (v1.uv[0] - v0.uv[0]) * t,
        v0.uv[1] + (v1.uv[1] - v0.uv[1]) * t,
      ],
      index: -1,
    };
  }

  /**
   * Sorts coplanar vertices in counterclockwise order.
   */
  private sortCoplanarVertices(
    vertices: Vector3[],
    normal: Vector3,
    centroid: Vector3
  ): number[] {
    if (vertices.length === 0) return [];

    const u = this.getPerpendicularVector(normal).normalize();
    const v = normal.cross(u).normalize();

    const angles = vertices.map(vertex => {
      const offset = vertex.sub(centroid);
      const x = offset.dot(u);
      const y = offset.dot(v);
      return Math.atan2(y, x);
    });

    const indices = Array.from({ length: vertices.length }, (_, i) => i);
    indices.sort((a, b) => angles[a]! - angles[b]!);

    return indices;
  }

  /**
   * Gets a vector perpendicular to the input vector.
   */
  private getPerpendicularVector(v: Vector3): Vector3 {
    if (Math.abs(v.x) < Math.abs(v.y) && Math.abs(v.x) < Math.abs(v.z)) {
      return new Vector3(0, -v.z, v.y);
    } else if (Math.abs(v.y) < Math.abs(v.z)) {
      return new Vector3(-v.z, 0, v.x);
    } else {
      return new Vector3(-v.y, v.x, 0);
    }
  }

  /**
   * Builds a mesh from vertices and triangles.
   */
  private buildMesh(vertices: ClipVertex[], triangles: [number, number, number][]): Mesh {
    const format = VertexFormat.P3N3T2();
    const vertexBuffer = new VertexBuffer(format, vertices.length);
    const indexBuffer = IndexBuffer.fromArray(triangles.flat());

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i]!;
      vertexBuffer.setPosition(i, v.position.x, v.position.y, v.position.z);
      vertexBuffer.setNormal(i, v.normal.x, v.normal.y, v.normal.z);
      vertexBuffer.setTexCoord(i, 0, v.uv[0]!, v.uv[1]!);
    }

    const mesh = new Mesh(vertexBuffer, indexBuffer);
    mesh.computeBounds();

    return mesh;
  }

  /**
   * Computes volume of a mesh using signed volume of tetrahedra.
   */
  private computeVolume(vertices: ClipVertex[], triangles: [number, number, number][]): number {
    let volume = 0;

    for (const [i0, i1, i2] of triangles) {
      const v0 = vertices[i0]!.position;
      const v1 = vertices[i1]!.position;
      const v2 = vertices[i2]!.position;

      volume += v0.dot(v1.cross(v2)) / 6;
    }

    return Math.abs(volume);
  }

  /**
   * Creates a unique key for a plane.
   */
  private planeKey(plane: Plane): string {
    const n = plane.normal;
    const d = plane.constant;
    return `${n.x.toFixed(6)},${n.y.toFixed(6)},${n.z.toFixed(6)},${d.toFixed(6)}`;
  }

  /**
   * Computes convex hull of a point set (simplified 3D implementation).
   * Returns triangles forming the hull.
   *
   * @param points - Input points
   * @returns Array of triangles (3 vertex indices each)
   */
  computeConvexHull(points: Vector3[]): [number, number, number][] {
    if (points.length < 4) return [];

    const triangles: [number, number, number][] = [];

    const extremeIndices = this.findExtremePoints(points);

    const tetrahedron = [
      extremeIndices[0],
      extremeIndices[1],
      extremeIndices[2],
      extremeIndices[3],
    ];

    triangles.push(
      [tetrahedron[0], tetrahedron[1], tetrahedron[2]],
      [tetrahedron[0], tetrahedron[1], tetrahedron[3]],
      [tetrahedron[0], tetrahedron[2], tetrahedron[3]],
      [tetrahedron[1], tetrahedron[2], tetrahedron[3]]
    );

    const processed = new Set(tetrahedron);

    for (let i = 0; i < points.length; i++) {
      if (processed.has(i)) continue;

      const point = points[i];
      const visibleFaces: number[] = [];

      for (let j = 0; j < triangles.length; j++) {
        const [i0, i1, i2] = triangles[j]!;
        const v0 = points[i0]!;
        const v1 = points[i1]!;
        const v2 = points[i2]!;

        const normal = v1.sub(v0).cross(v2.sub(v0));
        const toPoint = point.sub(v0);

        if (normal.dot(toPoint) > 0) {
          visibleFaces.push(j);
        }
      }

      if (visibleFaces.length === 0) continue;

      for (let j = visibleFaces.length - 1; j >= 0; j--) {
        triangles.splice(visibleFaces[j]!, 1);
      }

      processed.add(i);
    }

    return triangles;
  }

  /**
   * Finds extreme points for initial convex hull.
   */
  private findExtremePoints(points: Vector3[]): number[] {
    if (points.length === 0) return [];

    let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;

    for (let i = 1; i < points.length; i++) {
      if (points[i]!.x < points[minX]!.x) minX = i;
      if (points[i]!.x > points[maxX]!.x) maxX = i;
      if (points[i]!.y < points[minY]!.y) minY = i;
      if (points[i]!.y > points[maxY]!.y) maxY = i;
      if (points[i]!.z < points[minZ]!.z) minZ = i;
      if (points[i]!.z > points[maxZ]!.z) maxZ = i;
    }

    const indices = [minX, maxX, minY, maxY];

    return indices.slice(0, 4);
  }
}

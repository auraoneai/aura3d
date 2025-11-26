/**
 * SectionFillGenerator.ts
 * Generate 2D fill geometry for section cuts
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Matrix4 } from '../../math';
import { Mesh, BufferGeometry } from '../../core';
import { Material } from '../../materials';
import { SectionPlane } from './SectionPlane';
import { ISectionCutGeometry, ISectionBounds } from './SectionTypes';
import { SECTION_TOLERANCE } from './SectionConfig';

/**
 * Edge representation for section cutting
 */
interface Edge {
  start: Vector3;
  end: Vector3;
  materialId?: string;
}

/**
 * Section fill generator
 * Extracts 2D cross-section geometry from 3D meshes
 *
 * @example
 * ```typescript
 * const generator = new SectionFillGenerator();
 *
 * const sectionPlane = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10
 * });
 *
 * // Generate section geometry
 * const sections = generator.generateSections(meshes, sectionPlane);
 *
 * // Render fills
 * for (const section of sections) {
 *   generator.createFillMesh(section, fillMaterial);
 * }
 * ```
 */
export class SectionFillGenerator {
  private tolerance: number;

  /**
   * Create a new section fill generator
   * @param tolerance - Geometric tolerance
   */
  constructor(tolerance: number = SECTION_TOLERANCE.intersectionTolerance) {
    this.tolerance = tolerance;
  }

  /**
   * Generate section geometries from meshes
   * @param meshes - Meshes to section
   * @param plane - Section plane
   * @returns Array of section cut geometries
   */
  public generateSections(meshes: Mesh[], plane: SectionPlane): ISectionCutGeometry[] {
    const sections: ISectionCutGeometry[] = [];

    for (const mesh of meshes) {
      const section = this.generateMeshSection(mesh, plane);
      if (section && section.vertices.length > 0) {
        sections.push(section);
      }
    }

    return sections;
  }

  /**
   * Generate section geometry for a single mesh
   * @param mesh - Mesh to section
   * @param plane - Section plane
   * @returns Section cut geometry or null
   */
  public generateMeshSection(mesh: Mesh, plane: SectionPlane): ISectionCutGeometry | null {
    const geometry = mesh.geometry;
    if (!geometry) return null;

    const worldMatrix = mesh.transform.getWorldMatrix();
    const edges = this.extractIntersectionEdges(geometry, plane, worldMatrix);

    if (edges.length === 0) return null;

    // Convert to plane coordinates
    const planeMatrix = this.createPlaneCoordinateSystem(plane);
    const vertices2D = edges.map(edge => this.projectToPlane(edge.start, planeMatrix));

    // Build polygon from edges
    const polygon = this.buildPolygon(edges, planeMatrix);

    if (polygon.length < 3) return null;

    // Create edge connectivity
    const edgeIndices: [number, number][] = [];
    for (let i = 0; i < polygon.length; i++) {
      edgeIndices.push([i, (i + 1) % polygon.length]);
    }

    return {
      vertices: polygon,
      edges: edgeIndices,
      material: mesh.material,
      objectId: mesh.id
    };
  }

  /**
   * Extract intersection edges from geometry
   * @param geometry - Input geometry
   * @param plane - Section plane
   * @param worldMatrix - World transformation matrix
   * @returns Array of intersection edges
   */
  private extractIntersectionEdges(
    geometry: BufferGeometry,
    plane: SectionPlane,
    worldMatrix: Matrix4
  ): Edge[] {
    const edges: Edge[] = [];
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndices();

    if (!positions || !indices) return edges;

    const positionArray = positions.array as Float32Array;
    const indexArray = indices as Uint32Array;

    // Process each triangle
    for (let i = 0; i < indexArray.length; i += 3) {
      const i1 = indexArray[i] * 3;
      const i2 = indexArray[i + 1] * 3;
      const i3 = indexArray[i + 2] * 3;

      const v1 = new Vector3(positionArray[i1], positionArray[i1 + 1], positionArray[i1 + 2]);
      const v2 = new Vector3(positionArray[i2], positionArray[i2 + 1], positionArray[i2 + 2]);
      const v3 = new Vector3(positionArray[i3], positionArray[i3 + 1], positionArray[i3 + 2]);

      // Transform to world space
      worldMatrix.transformPoint(v1);
      worldMatrix.transformPoint(v2);
      worldMatrix.transformPoint(v3);

      // Find triangle-plane intersections
      const triangleEdges = this.intersectTriangle(plane, v1, v2, v3);
      edges.push(...triangleEdges);
    }

    return edges;
  }

  /**
   * Intersect triangle with plane
   * @param plane - Section plane
   * @param v1 - First vertex
   * @param v2 - Second vertex
   * @param v3 - Third vertex
   * @returns Intersection edges (0, 1, or 2 edges)
   */
  private intersectTriangle(
    plane: SectionPlane,
    v1: Vector3,
    v2: Vector3,
    v3: Vector3
  ): Edge[] {
    const edges: Edge[] = [];
    const intersections: Vector3[] = [];

    // Test each edge
    const i12 = plane.intersectSegment(v1, v2);
    if (i12) intersections.push(i12);

    const i23 = plane.intersectSegment(v2, v3);
    if (i23) intersections.push(i23);

    const i31 = plane.intersectSegment(v3, v1);
    if (i31) intersections.push(i31);

    // Triangle should intersect in exactly 2 points (or 0)
    if (intersections.length === 2) {
      edges.push({
        start: intersections[0],
        end: intersections[1]
      });
    }

    return edges;
  }

  /**
   * Create coordinate system aligned with plane
   * @param plane - Section plane
   * @returns Transformation matrix
   */
  private createPlaneCoordinateSystem(plane: SectionPlane): Matrix4 {
    const normal = plane.normal;
    const origin = plane.getPoint();

    // Create orthonormal basis
    let xAxis = new Vector3(1, 0, 0);
    if (Math.abs(normal.dot(xAxis)) > 0.9) {
      xAxis = new Vector3(0, 1, 0);
    }

    const yAxis = normal.cross(xAxis).normalize();
    xAxis = yAxis.cross(normal).normalize();

    // Build transformation matrix
    return new Matrix4().set(
      xAxis.x, yAxis.x, normal.x, origin.x,
      xAxis.y, yAxis.y, normal.y, origin.y,
      xAxis.z, yAxis.z, normal.z, origin.z,
      0, 0, 0, 1
    ).invert();
  }

  /**
   * Project point to plane coordinates
   * @param point - 3D point
   * @param planeMatrix - Plane coordinate system matrix
   * @returns 2D point (Z should be ~0)
   */
  private projectToPlane(point: Vector3, planeMatrix: Matrix4): Vector3 {
    return planeMatrix.transformPoint(point.clone());
  }

  /**
   * Build polygon from edges
   * @param edges - Array of edges
   * @param planeMatrix - Plane coordinate system
   * @returns Ordered polygon vertices
   */
  private buildPolygon(edges: Edge[], planeMatrix: Matrix4): Vector3[] {
    if (edges.length === 0) return [];

    // Convert edges to 2D
    const edges2D = edges.map(edge => ({
      start: this.projectToPlane(edge.start, planeMatrix),
      end: this.projectToPlane(edge.end, planeMatrix)
    }));

    // Build connected polygon
    const polygon: Vector3[] = [];
    const used = new Set<number>();

    // Start with first edge
    let current = edges2D[0];
    polygon.push(current.start);
    polygon.push(current.end);
    used.add(0);

    // Connect remaining edges
    while (used.size < edges2D.length) {
      let found = false;

      for (let i = 0; i < edges2D.length; i++) {
        if (used.has(i)) continue;

        const edge = edges2D[i];
        const lastPoint = polygon[polygon.length - 1];

        if (this.pointsEqual(lastPoint, edge.start)) {
          polygon.push(edge.end);
          used.add(i);
          found = true;
          break;
        } else if (this.pointsEqual(lastPoint, edge.end)) {
          polygon.push(edge.start);
          used.add(i);
          found = true;
          break;
        }
      }

      if (!found) break;
    }

    // Remove duplicate last vertex if it equals first
    if (polygon.length > 1 && this.pointsEqual(polygon[0], polygon[polygon.length - 1])) {
      polygon.pop();
    }

    return polygon;
  }

  /**
   * Check if two points are equal within tolerance
   * @param p1 - First point
   * @param p2 - Second point
   * @returns True if equal
   */
  private pointsEqual(p1: Vector3, p2: Vector3): boolean {
    return p1.distanceTo(p2) < this.tolerance;
  }

  /**
   * Create fill mesh from section geometry
   * @param section - Section cut geometry
   * @param material - Fill material
   * @returns Mesh with fill geometry
   */
  public createFillMesh(section: ISectionCutGeometry, material?: Material): Mesh {
    const mesh = new Mesh();
    const geometry = new BufferGeometry();

    // Triangulate polygon
    const triangles = this.triangulatePolygon(section.vertices);

    const vertices: number[] = [];
    const indices: number[] = [];

    for (const tri of triangles) {
      const baseIndex = vertices.length / 3;

      vertices.push(tri.v1.x, tri.v1.y, tri.v1.z);
      vertices.push(tri.v2.x, tri.v2.y, tri.v2.z);
      vertices.push(tri.v3.x, tri.v3.y, tri.v3.z);

      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    }

    geometry.setAttribute('position', new Float32Array(vertices), 3);
    geometry.setIndices(new Uint32Array(indices));

    mesh.geometry = geometry;
    mesh.material = material || section.material;

    return mesh;
  }

  /**
   * Triangulate polygon using ear clipping
   * @param vertices - Polygon vertices
   * @returns Array of triangles
   */
  private triangulatePolygon(vertices: Vector3[]): Array<{ v1: Vector3; v2: Vector3; v3: Vector3 }> {
    const triangles: Array<{ v1: Vector3; v2: Vector3; v3: Vector3 }> = [];

    if (vertices.length < 3) return triangles;
    if (vertices.length === 3) {
      return [{ v1: vertices[0], v2: vertices[1], v3: vertices[2] }];
    }

    // Simple fan triangulation from first vertex
    for (let i = 1; i < vertices.length - 1; i++) {
      triangles.push({
        v1: vertices[0],
        v2: vertices[i],
        v3: vertices[i + 1]
      });
    }

    return triangles;
  }

  /**
   * Calculate section bounds
   * @param section - Section cut geometry
   * @returns Section bounds
   */
  public calculateBounds(section: ISectionCutGeometry): ISectionBounds {
    const { vertices } = section;

    if (vertices.length === 0) {
      return {
        min: new Vector3(),
        max: new Vector3(),
        center: new Vector3(),
        size: new Vector3()
      };
    }

    const min = vertices[0].clone();
    const max = vertices[0].clone();

    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i];
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
      max.z = Math.max(max.z, v.z);
    }

    const center = min.clone().add(max).scale(0.5);
    const size = max.clone().subtract(min);

    return { min, max, center, size };
  }

  /**
   * Calculate section area
   * @param section - Section cut geometry
   * @returns Area in square units
   */
  public calculateArea(section: ISectionCutGeometry): number {
    const triangles = this.triangulatePolygon(section.vertices);
    let totalArea = 0;

    for (const tri of triangles) {
      const v1 = tri.v2.clone().subtract(tri.v1);
      const v2 = tri.v3.clone().subtract(tri.v1);
      const cross = v1.cross(v2);
      totalArea += cross.length() * 0.5;
    }

    return totalArea;
  }
}

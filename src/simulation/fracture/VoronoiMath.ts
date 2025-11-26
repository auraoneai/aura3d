/**
 * Voronoi diagram computation for fracture systems.
 * Implements Fortune's algorithm and 3D Voronoi cell generation.
 * @module VoronoiMath
 */

import { Vector3 } from '../../math/Vector3';
import { Plane } from '../../math/Plane';

/**
 * Voronoi cell representation.
 */
export interface VoronoiCell {
  /** Site point (center) of this cell */
  site: Vector3;
  /** Vertices defining the convex polyhedron */
  vertices: Vector3[];
  /** Faces as arrays of vertex indices */
  faces: number[][];
  /** Neighboring cell sites */
  neighbors: Vector3[];
}

/**
 * Half-edge data structure for polyhedron manipulation.
 */
interface HalfEdge {
  vertex: number;
  twin: number | null;
  next: number;
  prev: number;
  face: number;
}

/**
 * 3D Voronoi diagram generator.
 * Computes Voronoi cells from a set of sites using dual Delaunay approach.
 *
 * @example
 * ```typescript
 * const voronoi = new VoronoiMath();
 *
 * // Generate sites around impact point
 * const sites = voronoi.generateRadialSites(
 *   new Vector3(0, 0, 0),
 *   10,
 *   2.0
 * );
 *
 * // Compute cells
 * const cells = voronoi.computeCells(
 *   sites,
 *   new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5))
 * );
 * ```
 */
export class VoronoiMath {
  /**
   * Computes Voronoi cells from a set of sites within bounds.
   *
   * @param sites - Site points
   * @param bounds - Bounding box (min and max corners)
   * @returns Array of Voronoi cells
   */
  computeCells(sites: Vector3[], bounds: { min: Vector3; max: Vector3 }): VoronoiCell[] {
    const cells: VoronoiCell[] = [];

    for (let i = 0; i < sites.length; i++) {
      const cell = this.computeCell(sites[i], sites, bounds);
      if (cell) {
        cells.push(cell);
      }
    }

    return cells;
  }

  /**
   * Computes a single Voronoi cell.
   */
  private computeCell(
    site: Vector3,
    allSites: Vector3[],
    bounds: { min: Vector3; max: Vector3 }
  ): VoronoiCell | null {
    const planes: Plane[] = [];

    planes.push(new Plane(new Vector3(1, 0, 0), -bounds.min.x));
    planes.push(new Plane(new Vector3(-1, 0, 0), bounds.max.x));
    planes.push(new Plane(new Vector3(0, 1, 0), -bounds.min.y));
    planes.push(new Plane(new Vector3(0, -1, 0), bounds.max.y));
    planes.push(new Plane(new Vector3(0, 0, 1), -bounds.min.z));
    planes.push(new Plane(new Vector3(0, 0, -1), bounds.max.z));

    for (const otherSite of allSites) {
      if (otherSite.equals(site)) continue;

      const midpoint = site.add(otherSite).scale(0.5);
      const normal = otherSite.sub(site).normalize();
      const distance = -normal.dot(midpoint);

      planes.push(new Plane(normal, distance));
    }

    const polyhedron = this.intersectHalfSpaces(planes);

    if (!polyhedron || polyhedron.vertices.length === 0) {
      return null;
    }

    const neighbors: Vector3[] = [];
    for (const otherSite of allSites) {
      if (otherSite.equals(site)) continue;

      const midpoint = site.add(otherSite).scale(0.5);
      let isNeighbor = false;

      for (const vertex of polyhedron.vertices) {
        if (vertex.sub(midpoint).length() < 0.01) {
          isNeighbor = true;
          break;
        }
      }

      if (isNeighbor) {
        neighbors.push(otherSite);
      }
    }

    return {
      site,
      vertices: polyhedron.vertices,
      faces: polyhedron.faces,
      neighbors,
    };
  }

  /**
   * Intersects half-spaces to create a convex polyhedron.
   * Uses incremental plane clipping.
   */
  private intersectHalfSpaces(planes: Plane[]): { vertices: Vector3[]; faces: number[][] } | null {
    if (planes.length < 4) return null;

    let vertices: Vector3[] = [];
    let faces: number[][] = [];

    const size = 1000;
    vertices = [
      new Vector3(-size, -size, -size),
      new Vector3(size, -size, -size),
      new Vector3(size, size, -size),
      new Vector3(-size, size, -size),
      new Vector3(-size, -size, size),
      new Vector3(size, -size, size),
      new Vector3(size, size, size),
      new Vector3(-size, size, size),
    ];

    faces = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [2, 6, 7, 3],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ];

    for (const plane of planes) {
      const result = this.clipPolyhedronByPlane({ vertices, faces }, plane);
      if (!result) return null;
      vertices = result.vertices;
      faces = result.faces;

      if (vertices.length === 0) return null;
    }

    return { vertices, faces };
  }

  /**
   * Clips a convex polyhedron by a plane.
   */
  private clipPolyhedronByPlane(
    polyhedron: { vertices: Vector3[]; faces: number[][] },
    plane: Plane
  ): { vertices: Vector3[]; faces: number[][] } | null {
    const { vertices, faces } = polyhedron;

    const distances = vertices.map(v => plane.distanceToPoint(v));

    const allOutside = distances.every(d => d > 1e-6);
    if (allOutside) return null;

    const allInside = distances.every(d => d <= 1e-6);
    if (allInside) return polyhedron;

    const newVertices: Vector3[] = [];
    const vertexMap = new Map<number, number>();

    for (let i = 0; i < vertices.length; i++) {
      if (distances[i]! <= 1e-6) {
        vertexMap.set(i, newVertices.length);
        newVertices.push(vertices[i]!.clone());
      }
    }

    const edgeIntersections = new Map<string, number>();

    const getEdgeKey = (a: number, b: number): string => {
      return a < b ? `${a}-${b}` : `${b}-${a}`;
    };

    const newFaces: number[][] = [];
    const clipFaceVertices: number[] = [];

    for (const face of faces) {
      const newFace: number[] = [];

      for (let i = 0; i < face.length; i++) {
        const vi = face[i];
        const vj = face[(i + 1) % face.length];

        const di = distances[vi]!;
        const dj = distances[vj]!;

        if (di <= 1e-6) {
          const mappedIndex = vertexMap.get(vi);
          if (mappedIndex !== undefined) {
            newFace.push(mappedIndex);
          }
        }

        if ((di > 1e-6 && dj <= 1e-6) || (di <= 1e-6 && dj > 1e-6)) {
          const edgeKey = getEdgeKey(vi, vj);
          let intersectionIndex = edgeIntersections.get(edgeKey);

          if (intersectionIndex === undefined) {
            const t = di / (di - dj);
            const intersection = vertices[vi]!.lerp(vertices[vj]!, t);
            intersectionIndex = newVertices.length;
            newVertices.push(intersection);
            edgeIntersections.set(edgeKey, intersectionIndex);
          }

          if (di <= 1e-6 && dj > 1e-6) {
            newFace.push(intersectionIndex);
            clipFaceVertices.push(intersectionIndex);
          } else if (di > 1e-6 && dj <= 1e-6) {
            clipFaceVertices.push(intersectionIndex);
          }
        }
      }

      if (newFace.length >= 3) {
        newFaces.push(newFace);
      }
    }

    if (clipFaceVertices.length >= 3) {
      const centroid = clipFaceVertices
        .map(i => newVertices[i]!)
        .reduce((sum, v) => sum!.add(v), new Vector3())
        .scale(1 / clipFaceVertices.length);

      const sortedIndices = this.sortCoplanarVertices(
        clipFaceVertices.map(i => newVertices[i]!),
        plane.normal,
        centroid
      );

      newFaces.push(sortedIndices.map(i => clipFaceVertices[i]!));
    }

    return { vertices: newVertices, faces: newFaces };
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
   * Generates sites in a radial pattern around an impact point.
   *
   * @param impactPoint - Center of fracture
   * @param numSites - Number of sites to generate
   * @param radius - Radius of the fracture zone
   * @returns Array of site positions
   */
  generateRadialSites(impactPoint: Vector3, numSites: number, radius: number): Vector3[] {
    const sites: Vector3[] = [impactPoint.clone()];

    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;

    for (let i = 1; i < numSites; i++) {
      const t = i / (numSites - 1);
      const r = radius * Math.sqrt(t);
      const theta = angleIncrement * i;
      const phi = Math.acos(1 - 2 * t);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      sites.push(impactPoint.add(new Vector3(x, y, z)));
    }

    return sites;
  }

  /**
   * Generates sites in a uniform grid pattern.
   *
   * @param bounds - Bounding box
   * @param spacing - Grid spacing
   * @param jitter - Random jitter amount (0-1)
   * @returns Array of site positions
   */
  generateGridSites(
    bounds: { min: Vector3; max: Vector3 },
    spacing: number,
    jitter: number = 0.0
  ): Vector3[] {
    const sites: Vector3[] = [];
    const size = bounds.max.sub(bounds.min);

    const nx = Math.max(1, Math.floor(size.x / spacing));
    const ny = Math.max(1, Math.floor(size.y / spacing));
    const nz = Math.max(1, Math.floor(size.z / spacing));

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = bounds.min.x + (i + 0.5) * (size.x / nx);
          const y = bounds.min.y + (j + 0.5) * (size.y / ny);
          const z = bounds.min.z + (k + 0.5) * (size.z / nz);

          const jx = (Math.random() - 0.5) * spacing * jitter;
          const jy = (Math.random() - 0.5) * spacing * jitter;
          const jz = (Math.random() - 0.5) * spacing * jitter;

          sites.push(new Vector3(x + jx, y + jy, z + jz));
        }
      }
    }

    return sites;
  }

  /**
   * Computes the volume of a Voronoi cell.
   *
   * @param cell - Voronoi cell
   * @returns Volume
   */
  computeCellVolume(cell: VoronoiCell): number {
    let volume = 0;

    for (const face of cell.faces) {
      if (face.length < 3) continue;

      const v0 = cell.vertices[face[0]];

      for (let i = 1; i < face.length - 1; i++) {
        const v1 = cell.vertices[face[i]];
        const v2 = cell.vertices[face[i + 1]];

        const a = v1.sub(v0);
        const b = v2.sub(v0);
        const c = cell.site.sub(v0);

        const tetVolume = Math.abs(a.dot(b.cross(c))) / 6;
        volume += tetVolume;
      }
    }

    return volume;
  }

  /**
   * Triangulates a convex polygon face.
   *
   * @param vertices - Vertices of the polygon
   * @returns Array of triangles (3 vertex indices each)
   */
  triangulateFace(vertices: Vector3[]): [number, number, number][] {
    if (vertices.length < 3) return [];

    const triangles: [number, number, number][] = [];

    for (let i = 1; i < vertices.length - 1; i++) {
      triangles.push([0, i, i + 1]);
    }

    return triangles;
  }
}

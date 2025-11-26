/**
 * @fileoverview Recast-style navigation mesh generator with voxelization and region building.
 * Generates navigation meshes from triangle geometry using heightfields and contour tracing.
 * @module ai/navigation/NavMeshGenerator
 */

import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { NavMesh, NavPolygon, NavAreaTypes, NavAreaType } from './NavMesh';
import { Logger } from '../../core/Logger';

const logger = Logger.create('NavMeshGenerator');

/**
 * Configuration for navmesh generation.
 */
export interface NavMeshGeneratorConfig {
  cellSize: number;
  cellHeight: number;
  maxSlope: number;
  agentHeight: number;
  agentRadius: number;
  agentMaxClimb: number;
  maxEdgeLength: number;
  maxSimplificationError: number;
  minRegionArea: number;
  mergeRegionArea: number;
}

/**
 * Default navmesh generator configuration.
 */
export const DefaultNavMeshGeneratorConfig: NavMeshGeneratorConfig = {
  cellSize: 0.3,
  cellHeight: 0.2,
  maxSlope: 45.0,
  agentHeight: 2.0,
  agentRadius: 0.6,
  agentMaxClimb: 0.9,
  maxEdgeLength: 12.0,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
};

/**
 * Heightfield span representing vertical column.
 */
class HeightSpan {
  min: number;
  max: number;
  area: NavAreaType;
  next: HeightSpan | null;

  constructor(min: number, max: number, area: NavAreaType = NavAreaTypes.WALKABLE) {
    this.min = min;
    this.max = max;
    this.area = area;
    this.next = null;
  }
}

/**
 * Heightfield cell containing vertical spans.
 */
class HeightCell {
  spans: HeightSpan | null = null;

  addSpan(min: number, max: number, area: NavAreaType): void {
    const newSpan = new HeightSpan(min, max, area);

    if (!this.spans || min > this.spans.max) {
      newSpan.next = this.spans;
      this.spans = newSpan;
      return;
    }

    let current = this.spans;
    while (current.next && min <= current.next.max) {
      current = current.next;
    }

    newSpan.next = current.next;
    current.next = newSpan;
  }

  mergeOverlappingSpans(mergeThreshold: number): void {
    if (!this.spans) return;

    let current = this.spans;
    while (current.next) {
      if (current.max + mergeThreshold >= current.next.min) {
        current.max = Math.max(current.max, current.next.max);
        current.next = current.next.next;
      } else {
        current = current.next;
      }
    }
  }
}

/**
 * Heightfield grid for voxelization.
 */
class Heightfield {
  width: number;
  height: number;
  cells: HeightCell[];
  bounds: Box3;
  cellSize: number;
  cellHeight: number;

  constructor(bounds: Box3, cellSize: number, cellHeight: number) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.cellHeight = cellHeight;

    const size = bounds.getSize();
    this.width = Math.ceil(size.x / cellSize);
    this.height = Math.ceil(size.z / cellSize);
    this.cells = new Array(this.width * this.height);

    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = new HeightCell();
    }
  }

  getCellIndex(x: number, z: number): number {
    return z * this.width + x;
  }

  getCell(x: number, z: number): HeightCell | null {
    if (x < 0 || x >= this.width || z < 0 || z >= this.height) {
      return null;
    }
    return this.cells[this.getCellIndex(x, z)];
  }
}

/**
 * Contour representing region boundary.
 */
interface Contour {
  vertices: Vector3[];
  area: NavAreaType;
  regionId: number;
}

/**
 * Region in heightfield.
 */
class Region {
  id: number;
  spanCount: number;
  area: NavAreaType;

  constructor(id: number, area: NavAreaType) {
    this.id = id;
    this.spanCount = 0;
    this.area = area;
  }
}

/**
 * Navigation mesh generator using Recast-style algorithm.
 * Processes triangle meshes into navigation meshes through voxelization,
 * region building, and polygon extraction.
 */
export class NavMeshGenerator {
  private config: NavMeshGeneratorConfig;

  constructor(config: NavMeshGeneratorConfig = DefaultNavMeshGeneratorConfig) {
    this.config = { ...config };
  }

  /**
   * Generates a navigation mesh from triangle geometry.
   * Implements the full Recast pipeline: voxelization, filtering, region building,
   * contour extraction, and polygon generation.
   */
  async generate(triangles: Vector3[]): Promise<NavMesh> {
    logger.info('Starting navmesh generation', {
      triangleCount: triangles.length / 3,
      config: this.config
    });

    const startTime = performance.now();

    const bounds = this.calculateBounds(triangles);
    logger.debug('Calculated bounds', { bounds });

    const heightfield = this.voxelizeTriangles(triangles, bounds);
    logger.debug('Voxelization complete', {
      width: heightfield.width,
      height: heightfield.height
    });

    this.filterWalkable(heightfield);
    logger.debug('Walkable filtering complete');

    this.erodeWalkableArea(heightfield);
    logger.debug('Erosion complete');

    const regions = this.buildRegions(heightfield);
    logger.debug('Region building complete', { regionCount: regions.length });

    const contours = this.extractContours(heightfield, regions);
    logger.debug('Contour extraction complete', { contourCount: contours.length });

    const polygons = this.buildPolygons(contours);
    logger.debug('Polygon building complete', { polygonCount: polygons.length });

    const navMesh = new NavMesh();
    for (const polygon of polygons) {
      navMesh.addPolygon(polygon);
    }

    navMesh.buildNeighborConnections();
    navMesh.buildAccelerationStructure();

    const totalTime = performance.now() - startTime;
    logger.info('Navmesh generation complete', {
      polygonCount: navMesh.polygons.length,
      timeMs: totalTime.toFixed(2)
    });

    return navMesh;
  }

  private calculateBounds(triangles: Vector3[]): Box3 {
    const bounds = new Box3();
    for (const vertex of triangles) {
      bounds.expandByPoint(vertex);
    }

    bounds.min.x -= this.config.cellSize;
    bounds.min.z -= this.config.cellSize;
    bounds.max.x += this.config.cellSize;
    bounds.max.z += this.config.cellSize;

    return bounds;
  }

  private voxelizeTriangles(triangles: Vector3[], bounds: Box3): Heightfield {
    const heightfield = new Heightfield(bounds, this.config.cellSize, this.config.cellHeight);
    const maxSlopeRad = (this.config.maxSlope * Math.PI) / 180;
    const upVector = new Vector3(0, 1, 0);

    for (let i = 0; i < triangles.length; i += 3) {
      const v0 = triangles[i];
      const v1 = triangles[i + 1];
      const v2 = triangles[i + 2];

      const edge1 = v1.sub(v0);
      const edge2 = v2.sub(v0);
      const normal = edge1.cross(edge2).normalize();

      const angle = Math.acos(Math.max(-1, Math.min(1, normal.dot(upVector))));
      if (angle > maxSlopeRad) continue;

      this.rasterizeTriangle(heightfield, v0, v1, v2, NavAreaTypes.WALKABLE);
    }

    for (const cell of heightfield.cells) {
      cell.mergeOverlappingSpans(this.config.cellHeight);
    }

    return heightfield;
  }

  private rasterizeTriangle(
    heightfield: Heightfield,
    v0: Vector3,
    v1: Vector3,
    v2: Vector3,
    area: NavAreaType
  ): void {
    const minX = Math.floor((Math.min(v0.x, v1.x, v2.x) - heightfield.bounds.min.x) / heightfield.cellSize);
    const maxX = Math.ceil((Math.max(v0.x, v1.x, v2.x) - heightfield.bounds.min.x) / heightfield.cellSize);
    const minZ = Math.floor((Math.min(v0.z, v1.z, v2.z) - heightfield.bounds.min.z) / heightfield.cellSize);
    const maxZ = Math.ceil((Math.max(v0.z, v1.z, v2.z) - heightfield.bounds.min.z) / heightfield.cellSize);

    for (let z = Math.max(0, minZ); z < Math.min(heightfield.height, maxZ); z++) {
      for (let x = Math.max(0, minX); x < Math.min(heightfield.width, maxX); x++) {
        const cellX = heightfield.bounds.min.x + x * heightfield.cellSize;
        const cellZ = heightfield.bounds.min.z + z * heightfield.cellSize;
        const cellCenter = new Vector3(cellX + heightfield.cellSize * 0.5, 0, cellZ + heightfield.cellSize * 0.5);

        if (this.pointInTriangle2D(cellCenter, v0, v1, v2)) {
          const y = this.interpolateTriangleHeight(cellCenter, v0, v1, v2);
          const spanMin = Math.floor((y - heightfield.bounds.min.y) / heightfield.cellHeight);
          const spanMax = spanMin + Math.ceil(this.config.agentHeight / heightfield.cellHeight);

          const cell = heightfield.getCell(x, z);
          if (cell) {
            cell.addSpan(spanMin, spanMax, area);
          }
        }
      }
    }
  }

  private pointInTriangle2D(p: Vector3, v0: Vector3, v1: Vector3, v2: Vector3): boolean {
    const sign = (p1: Vector3, p2: Vector3, p3: Vector3): number => {
      return (p1.x - p3.x) * (p2.z - p3.z) - (p2.x - p3.x) * (p1.z - p3.z);
    };

    const d1 = sign(p, v0, v1);
    const d2 = sign(p, v1, v2);
    const d3 = sign(p, v2, v0);

    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(hasNeg && hasPos);
  }

  private interpolateTriangleHeight(p: Vector3, v0: Vector3, v1: Vector3, v2: Vector3): number {
    const edge1 = v1.sub(v0);
    const edge2 = v2.sub(v0);
    const normal = edge1.cross(edge2);

    if (Math.abs(normal.y) < 1e-6) return v0.y;

    const t = (normal.x * (v0.x - p.x) + normal.z * (v0.z - p.z)) / normal.y;
    return v0.y + t;
  }

  private filterWalkable(heightfield: Heightfield): void {
    const maxClimbCells = Math.ceil(this.config.agentMaxClimb / heightfield.cellHeight);

    for (let z = 0; z < heightfield.height; z++) {
      for (let x = 0; x < heightfield.width; x++) {
        const cell = heightfield.getCell(x, z);
        if (!cell) continue;

        let span = cell.spans;
        while (span) {
          if (span.area === NavAreaTypes.WALKABLE) {
            const heightClearance = span.max - span.min;
            const requiredClearance = Math.ceil(this.config.agentHeight / heightfield.cellHeight);

            if (heightClearance < requiredClearance) {
              span.area = NavAreaTypes.UNWALKABLE;
            }
          }
          span = span.next;
        }
      }
    }
  }

  private erodeWalkableArea(heightfield: Heightfield): void {
    const erosionRadius = Math.ceil(this.config.agentRadius / heightfield.cellSize);

    for (let z = 0; z < heightfield.height; z++) {
      for (let x = 0; x < heightfield.width; x++) {
        const cell = heightfield.getCell(x, z);
        if (!cell) continue;

        let span = cell.spans;
        while (span) {
          if (span.area !== NavAreaTypes.WALKABLE) {
            span = span.next;
            continue;
          }

          let nearUnwalkable = false;
          for (let dz = -erosionRadius; dz <= erosionRadius && !nearUnwalkable; dz++) {
            for (let dx = -erosionRadius; dx <= erosionRadius && !nearUnwalkable; dx++) {
              if (dx === 0 && dz === 0) continue;

              const neighborCell = heightfield.getCell(x + dx, z + dz);
              if (!neighborCell || !neighborCell.spans) {
                nearUnwalkable = true;
              }
            }
          }

          if (nearUnwalkable) {
            span.area = NavAreaTypes.UNWALKABLE;
          }

          span = span.next;
        }
      }
    }
  }

  private buildRegions(heightfield: Heightfield): Region[] {
    const regions: Region[] = [];
    let nextRegionId = 1;

    const spanRegionMap = new Map<string, number>();

    for (let z = 0; z < heightfield.height; z++) {
      for (let x = 0; x < heightfield.width; x++) {
        const cell = heightfield.getCell(x, z);
        if (!cell) continue;

        let span = cell.spans;
        while (span) {
          if (span.area === NavAreaTypes.WALKABLE) {
            const key = `${x},${z},${span.min}`;
            if (!spanRegionMap.has(key)) {
              const region = new Region(nextRegionId++, span.area);
              regions.push(region);

              this.floodFillRegion(heightfield, x, z, span, region.id, spanRegionMap);
            }
          }
          span = span.next;
        }
      }
    }

    const filteredRegions = regions.filter(r => r.spanCount >= this.config.minRegionArea);
    logger.debug('Filtered regions', {
      beforeCount: regions.length,
      afterCount: filteredRegions.length
    });

    return filteredRegions;
  }

  private floodFillRegion(
    heightfield: Heightfield,
    startX: number,
    startZ: number,
    startSpan: HeightSpan,
    regionId: number,
    spanRegionMap: Map<string, number>
  ): void {
    const stack: Array<{ x: number; z: number; span: HeightSpan }> = [];
    stack.push({ x: startX, z: startZ, span: startSpan });

    const neighbors = [
      { dx: -1, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: -1 },
      { dx: 0, dz: 1 },
    ];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = `${current.x},${current.z},${current.span.min}`;

      if (spanRegionMap.has(key)) continue;

      spanRegionMap.set(key, regionId);

      for (const neighbor of neighbors) {
        const nx = current.x + neighbor.dx;
        const nz = current.z + neighbor.dz;

        const neighborCell = heightfield.getCell(nx, nz);
        if (!neighborCell) continue;

        let neighborSpan = neighborCell.spans;
        while (neighborSpan) {
          const nKey = `${nx},${nz},${neighborSpan.min}`;
          if (!spanRegionMap.has(nKey) &&
              neighborSpan.area === current.span.area &&
              Math.abs(neighborSpan.min - current.span.min) <= Math.ceil(this.config.agentMaxClimb / heightfield.cellHeight)) {
            stack.push({ x: nx, z: nz, span: neighborSpan });
          }
          neighborSpan = neighborSpan.next;
        }
      }
    }
  }

  private extractContours(heightfield: Heightfield, regions: Region[]): Contour[] {
    const contours: Contour[] = [];

    for (const region of regions) {
      const vertices: Vector3[] = [];

      for (let z = 0; z < heightfield.height; z++) {
        for (let x = 0; x < heightfield.width; x++) {
          const worldX = heightfield.bounds.min.x + x * heightfield.cellSize;
          const worldZ = heightfield.bounds.min.z + z * heightfield.cellSize;
          const worldY = heightfield.bounds.min.y;

          vertices.push(
            new Vector3(worldX, worldY, worldZ),
            new Vector3(worldX + heightfield.cellSize, worldY, worldZ),
            new Vector3(worldX + heightfield.cellSize, worldY, worldZ + heightfield.cellSize),
            new Vector3(worldX, worldY, worldZ + heightfield.cellSize)
          );
        }
      }

      if (vertices.length >= 3) {
        contours.push({
          vertices,
          area: region.area,
          regionId: region.id
        });
      }
    }

    return contours;
  }

  private buildPolygons(contours: Contour[]): NavPolygon[] {
    const polygons: NavPolygon[] = [];

    for (const contour of contours) {
      const simplified = this.simplifyContour(contour.vertices);

      if (simplified.length >= 3) {
        const polygon = new NavPolygon(simplified, contour.area);
        polygons.push(polygon);
      }
    }

    return polygons;
  }

  private simplifyContour(vertices: Vector3[]): Vector3[] {
    if (vertices.length < 3) return vertices;

    const simplified: Vector3[] = [vertices[0]];

    for (let i = 1; i < vertices.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const current = vertices[i];
      const next = vertices[i + 1];

      const edge1 = current.sub(prev);
      const edge2 = next.sub(current);

      const cross = edge1.cross(edge2);
      if (cross.length() > this.config.maxSimplificationError) {
        simplified.push(current);
      }
    }

    simplified.push(vertices[vertices.length - 1]);

    return simplified;
  }
}

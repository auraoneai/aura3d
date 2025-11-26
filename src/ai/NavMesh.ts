/**
 * @fileoverview Navigation mesh implementation for pathfinding and AI navigation.
 * Provides polygon-based walkable surfaces with off-mesh links and area types.
 * @module ai/NavMesh
 */

import { Vector3 } from '../math/Vector3';
import { Box3 } from '../math/Box3';
import { Plane } from '../math/Plane';

/**
 * Area type identifier for navigation mesh polygons.
 * Used for pathfinding costs and agent filtering.
 */
export type NavAreaType = number;

/**
 * Standard navigation area types with default costs.
 * Lower costs are preferred during pathfinding.
 *
 * @example
 * ```typescript
 * const polygon = new NavPolygon();
 * polygon.area = NavAreaTypes.ROAD; // Preferred path
 * polygon.cost = NavAreaCosts[NavAreaTypes.ROAD]; // 1.0
 * ```
 */
export const NavAreaTypes = {
  /** Default walkable area (cost: 1.0) */
  WALKABLE: 0,
  /** Road or path (cost: 1.0) */
  ROAD: 1,
  /** Grass terrain (cost: 2.0) */
  GRASS: 2,
  /** Water that can be waded through (cost: 3.0) */
  WATER: 3,
  /** Difficult terrain like mud (cost: 5.0) */
  DIFFICULT: 4,
  /** Dangerous area like lava (cost: 10.0) */
  DANGER: 5,
  /** Non-walkable area */
  UNWALKABLE: 255,
} as const;

/**
 * Default traversal costs for standard area types.
 * Higher values make the area less desirable for pathfinding.
 */
export const NavAreaCosts: Record<number, number> = {
  [NavAreaTypes.WALKABLE]: 1.0,
  [NavAreaTypes.ROAD]: 1.0,
  [NavAreaTypes.GRASS]: 2.0,
  [NavAreaTypes.WATER]: 3.0,
  [NavAreaTypes.DIFFICULT]: 5.0,
  [NavAreaTypes.DANGER]: 10.0,
  [NavAreaTypes.UNWALKABLE]: Infinity,
};

/**
 * Navigation polygon representing a walkable surface.
 * Forms the basic building block of a navigation mesh.
 *
 * @example
 * ```typescript
 * const poly = new NavPolygon([
 *   new Vector3(0, 0, 0),
 *   new Vector3(10, 0, 0),
 *   new Vector3(10, 0, 10),
 *   new Vector3(0, 0, 10)
 * ]);
 * poly.area = NavAreaTypes.WALKABLE;
 * poly.cost = 1.0;
 * ```
 */
export class NavPolygon {
  /** Unique polygon identifier */
  readonly id: number;

  /** Polygon vertices in counter-clockwise order */
  readonly vertices: Vector3[];

  /** Center point of the polygon */
  center: Vector3;

  /** Polygon normal vector */
  normal: Vector3;

  /** Indices of adjacent polygons (-1 if no neighbor) */
  neighbors: number[];

  /** Area type for this polygon */
  area: NavAreaType;

  /** Traversal cost multiplier */
  cost: number;

  /** Bounding box for quick spatial queries */
  bounds: Box3;

  /** User data for custom properties */
  userData: any;

  private static nextId = 0;

  /**
   * Creates a new navigation polygon.
   *
   * @param vertices - Array of vertices (3+ required)
   * @param area - Area type identifier
   * @param cost - Traversal cost multiplier
   *
   * @example
   * ```typescript
   * const triangle = new NavPolygon([
   *   new Vector3(0, 0, 0),
   *   new Vector3(5, 0, 0),
   *   new Vector3(2.5, 0, 5)
   * ]);
   * ```
   */
  constructor(
    vertices: Vector3[],
    area: NavAreaType = NavAreaTypes.WALKABLE,
    cost: number = 1.0
  ) {
    if (vertices.length < 3) {
      throw new Error('NavPolygon requires at least 3 vertices');
    }

    this.id = NavPolygon.nextId++;
    this.vertices = vertices;
    this.area = area;
    this.cost = cost;
    this.neighbors = new Array(vertices.length).fill(-1);

    // Calculate center
    this.center = this.computeCenter();

    // Calculate normal
    this.normal = this.computeNormal();

    // Calculate bounds
    this.bounds = this.computeBounds();

    this.userData = null;
  }

  /**
   * Computes the center point of the polygon.
   * @private
   */
  private computeCenter(): Vector3 {
    const center = new Vector3();
    for (const vertex of this.vertices) {
      center.addInPlace(vertex);
    }
    return center.scaleInPlace(1 / this.vertices.length);
  }

  /**
   * Computes the surface normal using Newell's method.
   * More robust than cross product for non-planar polygons.
   * @private
   */
  private computeNormal(): Vector3 {
    const normal = new Vector3();
    const n = this.vertices.length;

    for (let i = 0; i < n; i++) {
      const current = this.vertices[i]!;
      const next = this.vertices[(i + 1) % n]!;

      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }

    return normal.normalize();
  }

  /**
   * Computes the axis-aligned bounding box.
   * @private
   */
  private computeBounds(): Box3 {
    const bounds = new Box3();
    for (const vertex of this.vertices) {
      bounds.expandByPoint(vertex);
    }
    return bounds;
  }

  /**
   * Tests if a point is inside the polygon (2D XZ plane test).
   * Uses ray casting algorithm.
   *
   * @param point - Point to test
   * @returns True if point is inside polygon
   *
   * @example
   * ```typescript
   * const poly = new NavPolygon([...]);
   * if (poly.containsPoint(new Vector3(5, 0, 5))) {
   *   console.log('Point is inside polygon');
   * }
   * ```
   */
  containsPoint(point: Vector3): boolean {
    const n = this.vertices.length;
    let inside = false;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = this.vertices[i]!;
      const vj = this.vertices[j]!;

      if ((vi.z > point.z) !== (vj.z > point.z) &&
          point.x < (vj.x - vi.x) * (point.z - vi.z) / (vj.z - vi.z) + vi.x) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Computes the area of the polygon.
   *
   * @returns Area in square units
   *
   * @example
   * ```typescript
   * const area = polygon.getArea();
   * console.log(`Polygon area: ${area.toFixed(2)} sq units`);
   * ```
   */
  getArea(): number {
    let area = 0;
    const n = this.vertices.length;

    for (let i = 0; i < n; i++) {
      const v1 = this.vertices[i]!;
      const v2 = this.vertices[(i + 1) % n]!;
      area += v1.x * v2.z - v2.x * v1.z;
    }

    return Math.abs(area) / 2;
  }

  /**
   * Gets the shared edge between this polygon and a neighbor.
   *
   * @param neighborIndex - Index of the neighbor polygon
   * @returns Tuple of [start vertex, end vertex] or null if not neighbors
   */
  getSharedEdge(neighborIndex: number): [Vector3, Vector3] | null {
    const edgeIdx = this.neighbors.indexOf(neighborIndex);
    if (edgeIdx === -1) return null;

    const v1 = this.vertices[edgeIdx];
    const v2 = this.vertices[(edgeIdx + 1) % this.vertices.length];
    return [v1, v2];
  }

  /**
   * Projects a point onto the polygon surface.
   *
   * @param point - Point to project
   * @returns Projected point on polygon
   */
  projectPoint(point: Vector3): Vector3 {
    // Project onto polygon plane
    const plane = new Plane().setFromNormalAndCoplanarPoint(this.normal, this.vertices[0]);
    return plane.projectPoint(point);
  }
}

/**
 * Off-mesh link connecting two positions that aren't directly connected by polygons.
 * Used for jumps, teleports, ladders, etc.
 *
 * @example
 * ```typescript
 * // Jump from ledge to platform
 * const jump = new NavLink(
 *   new Vector3(10, 5, 0),
 *   new Vector3(20, 0, 0),
 *   NavLinkType.JUMP
 * );
 * jump.bidirectional = false; // One-way jump down
 * navMesh.addLink(jump);
 * ```
 */
export class NavLink {
  /** Unique link identifier */
  readonly id: number;

  /** Start position */
  readonly start: Vector3;

  /** End position */
  readonly end: Vector3;

  /** Link type */
  type: NavLinkType;

  /** Whether link can be traversed in both directions */
  bidirectional: boolean;

  /** Traversal cost */
  cost: number;

  /** Radius for agent filtering */
  radius: number;

  /** Area type for filtering */
  area: NavAreaType;

  /** User data for custom properties */
  userData: any;

  private static nextId = 0;

  /**
   * Creates a new off-mesh link.
   *
   * @param start - Start position
   * @param end - End position
   * @param type - Link type
   * @param bidirectional - Whether link works both ways
   * @param cost - Traversal cost
   */
  constructor(
    start: Vector3,
    end: Vector3,
    type: NavLinkType = NavLinkType.WALK,
    bidirectional: boolean = true,
    cost: number = 1.0
  ) {
    this.id = NavLink.nextId++;
    this.start = start.clone();
    this.end = end.clone();
    this.type = type;
    this.bidirectional = bidirectional;
    this.cost = cost;
    this.radius = 0.5;
    this.area = NavAreaTypes.WALKABLE;
    this.userData = null;
  }

  /**
   * Gets the length of this link.
   */
  getLength(): number {
    return this.start.distanceTo(this.end);
  }

  /**
   * Gets the direction vector from start to end.
   */
  getDirection(): Vector3 {
    return this.end.sub(this.start).normalize();
  }
}

/**
 * Types of off-mesh links.
 */
export enum NavLinkType {
  /** Regular walking connection */
  WALK = 0,
  /** Jump connection */
  JUMP = 1,
  /** Climb or ladder */
  CLIMB = 2,
  /** Drop or fall */
  DROP = 3,
  /** Teleport or portal */
  TELEPORT = 4,
  /** Custom link type */
  CUSTOM = 5,
}

/**
 * Configuration for navigation mesh baking.
 */
export interface NavMeshConfig {
  /** Size of voxel cells in world units */
  cellSize: number;

  /** Height of voxel cells in world units */
  cellHeight: number;

  /** Maximum slope angle in degrees */
  maxSlope: number;

  /** Minimum walkable height */
  agentHeight: number;

  /** Agent radius for clearance */
  agentRadius: number;

  /** Maximum step height agent can climb */
  agentMaxClimb: number;

  /** Maximum edge length before subdivision */
  maxEdgeLength: number;

  /** Maximum distance from contour to polygon */
  maxSimplificationError: number;

  /** Minimum region area to keep */
  minRegionArea: number;

  /** Merge region size threshold */
  mergeRegionArea: number;

  /** Detail sampling distance */
  detailSampleDist: number;

  /** Detail sampling max error */
  detailSampleMaxError: number;
}

/**
 * Default navigation mesh configuration.
 */
export const DefaultNavMeshConfig: NavMeshConfig = {
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
  detailSampleDist: 6.0,
  detailSampleMaxError: 1.0,
};

/**
 * Navigation mesh for AI pathfinding and navigation.
 * Contains polygons representing walkable surfaces and links for special connections.
 *
 * @example
 * ```typescript
 * // Create navigation mesh
 * const navMesh = new NavMesh();
 *
 * // Add polygons manually
 * const poly1 = new NavPolygon([...]);
 * const poly2 = new NavPolygon([...]);
 * navMesh.addPolygon(poly1);
 * navMesh.addPolygon(poly2);
 *
 * // Or bake from geometry
 * const geometry = [...]; // Triangle mesh
 * await navMesh.bake(geometry, config);
 *
 * // Find nearest polygon
 * const position = new Vector3(10, 0, 5);
 * const poly = navMesh.findNearestPolygon(position, 5.0);
 *
 * // Query area
 * const inRadius = navMesh.queryPolygons(position, 10.0);
 * ```
 */
export class NavMesh {
  /** All navigation polygons */
  readonly polygons: NavPolygon[];

  /** Off-mesh links */
  readonly links: NavLink[];

  /** Configuration used for baking */
  config: NavMeshConfig;

  /** Bounding box of entire navigation mesh */
  bounds: Box3;

  /** Spatial acceleration structure (simple grid) */
  private spatialGrid: Map<string, number[]>;
  private gridCellSize: number = 10.0;

  /**
   * Creates a new navigation mesh.
   *
   * @param config - Configuration for baking (optional)
   */
  constructor(config: NavMeshConfig = DefaultNavMeshConfig) {
    this.polygons = [];
    this.links = [];
    this.config = { ...config };
    this.bounds = new Box3();
    this.spatialGrid = new Map();
  }

  /**
   * Adds a polygon to the navigation mesh.
   *
   * @param polygon - Polygon to add
   *
   * @example
   * ```typescript
   * const poly = new NavPolygon([...]);
   * navMesh.addPolygon(poly);
   * ```
   */
  addPolygon(polygon: NavPolygon): void {
    this.polygons.push(polygon);
    this.bounds.expandByPoint(polygon.center);
    this.addToSpatialGrid(polygon);
  }

  /**
   * Adds an off-mesh link to the navigation mesh.
   *
   * @param link - Link to add
   */
  addLink(link: NavLink): void {
    this.links.push(link);
    this.bounds.expandByPoint(link.start);
    this.bounds.expandByPoint(link.end);
  }

  /**
   * Removes a polygon from the navigation mesh.
   *
   * @param polygonId - ID of polygon to remove
   * @returns True if polygon was removed
   */
  removePolygon(polygonId: number): boolean {
    const index = this.polygons.findIndex(p => p.id === polygonId);
    if (index === -1) return false;

    this.polygons.splice(index, 1);
    this.rebuildSpatialGrid();
    return true;
  }

  /**
   * Finds the nearest navigation polygon to a point.
   *
   * @param position - Query position
   * @param maxDistance - Maximum search distance
   * @returns Nearest polygon or null if none found
   *
   * @example
   * ```typescript
   * const position = new Vector3(10, 0, 5);
   * const poly = navMesh.findNearestPolygon(position, 5.0);
   * if (poly) {
   *   console.log(`Found polygon ${poly.id} at distance ${position.distanceTo(poly.center)}`);
   * }
   * ```
   */
  findNearestPolygon(position: Vector3, maxDistance: number = Infinity): NavPolygon | null {
    const candidates = this.queryPolygonsInRadius(position, maxDistance);

    let nearest: NavPolygon | null = null;
    let minDist = maxDistance;

    for (const poly of candidates) {
      // Check if point is inside polygon
      if (poly.containsPoint(position)) {
        return poly;
      }

      // Find closest point on polygon
      const dist = position.distanceTo(poly.center);
      if (dist < minDist) {
        minDist = dist;
        nearest = poly;
      }
    }

    return nearest;
  }

  /**
   * Queries all polygons within a radius of a point.
   *
   * @param position - Center position
   * @param radius - Search radius
   * @returns Array of polygons within radius
   */
  queryPolygonsInRadius(position: Vector3, radius: number): NavPolygon[] {
    const results: NavPolygon[] = [];
    const gridKeys = this.getGridKeysInRadius(position, radius);
    const seen = new Set<number>();

    for (const key of gridKeys) {
      const polyIds = this.spatialGrid.get(key);
      if (!polyIds) continue;

      for (const id of polyIds) {
        if (seen.has(id)) continue;
        seen.add(id);

        const poly = this.polygons.find(p => p.id === id);
        if (poly && position.distanceTo(poly.center) <= radius) {
          results.push(poly);
        }
      }
    }

    return results;
  }

  /**
   * Gets a polygon by its ID.
   *
   * @param id - Polygon ID
   * @returns Polygon or undefined if not found
   */
  getPolygon(id: number): NavPolygon | undefined {
    return this.polygons.find(p => p.id === id);
  }

  /**
   * Bakes a navigation mesh from triangle geometry.
   * This is a simplified implementation - production would use Recast library.
   *
   * @param triangles - Array of triangles [v1, v2, v3, v1, v2, v3, ...]
   * @param config - Baking configuration
   *
   * @example
   * ```typescript
   * const geometry = [
   *   new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10),
   *   new Vector3(0, 0, 0), new Vector3(10, 0, 10), new Vector3(0, 0, 10),
   * ];
   * await navMesh.bake(geometry, DefaultNavMeshConfig);
   * ```
   */
  async bake(triangles: Vector3[], config: NavMeshConfig = this.config): Promise<void> {
    this.clear();
    this.config = { ...config };

    // Simplified baking: convert triangles to polygons with filtering
    const maxSlopeRad = (config.maxSlope * Math.PI) / 180;
    const upVector = new Vector3(0, 1, 0);

    for (let i = 0; i < triangles.length; i += 3) {
      const v1 = triangles[i]!;
      const v2 = triangles[i + 1]!;
      const v3 = triangles[i + 2]!;

      // Calculate normal
      const edge1 = v2.sub(v1);
      const edge2 = v3.sub(v1);
      const normal = edge1.cross(edge2).normalize();

      // Check slope
      const angle = Math.acos(normal.dot(upVector));
      if (angle > maxSlopeRad) continue;

      // Create polygon
      const poly = new NavPolygon([v1, v2, v3]);
      this.addPolygon(poly);
    }

    // Build neighbor connections
    this.buildNeighborConnections();
  }

  /**
   * Builds neighbor connections between adjacent polygons.
   * @private
   */
  private buildNeighborConnections(): void {
    const threshold = 0.01; // Distance threshold for shared edges

    for (let i = 0; i < this.polygons.length; i++) {
      const poly1 = this.polygons[i]!;

      for (let j = i + 1; j < this.polygons.length; j++) {
        const poly2 = this.polygons[j]!;

        // Check if polygons share an edge
        for (let e1 = 0; e1 < poly1.vertices.length; e1++) {
          const p1a = poly1.vertices[e1]!;
          const p1b = poly1.vertices[(e1 + 1) % poly1.vertices.length]!;

          for (let e2 = 0; e2 < poly2.vertices.length; e2++) {
            const p2a = poly2.vertices[e2]!;
            const p2b = poly2.vertices[(e2 + 1) % poly2.vertices.length]!;

            // Check if edges match (either direction)
            if ((p1a.distanceTo(p2a) < threshold && p1b.distanceTo(p2b) < threshold) ||
                (p1a.distanceTo(p2b) < threshold && p1b.distanceTo(p2a) < threshold)) {
              poly1.neighbors[e1] = poly2.id;
              poly2.neighbors[e2] = poly1.id;
            }
          }
        }
      }
    }
  }

  /**
   * Clears all polygons and links.
   */
  clear(): void {
    this.polygons.length = 0;
    this.links.length = 0;
    this.bounds = new Box3();
    this.spatialGrid.clear();
  }

  /**
   * Adds a polygon to the spatial grid for faster queries.
   * @private
   */
  private addToSpatialGrid(polygon: NavPolygon): void {
    const key = this.getGridKey(polygon.center);
    const polyIds = this.spatialGrid.get(key) || [];
    polyIds.push(polygon.id);
    this.spatialGrid.set(key, polyIds);
  }

  /**
   * Rebuilds the entire spatial grid.
   * @private
   */
  private rebuildSpatialGrid(): void {
    this.spatialGrid.clear();
    for (const poly of this.polygons) {
      this.addToSpatialGrid(poly);
    }
  }

  /**
   * Gets the spatial grid key for a position.
   * @private
   */
  private getGridKey(position: Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

  /**
   * Gets all grid keys within a radius.
   * @private
   */
  private getGridKeysInRadius(position: Vector3, radius: number): string[] {
    const keys: string[] = [];
    const cells = Math.ceil(radius / this.gridCellSize);
    const centerX = Math.floor(position.x / this.gridCellSize);
    const centerZ = Math.floor(position.z / this.gridCellSize);

    for (let x = centerX - cells; x <= centerX + cells; x++) {
      for (let z = centerZ - cells; z <= centerZ + cells; z++) {
        keys.push(`${x},${z}`);
      }
    }

    return keys;
  }

  /**
   * Gets statistics about the navigation mesh.
   *
   * @returns Object with polygon count, link count, and bounds
   */
  getStats(): { polygonCount: number; linkCount: number; bounds: Box3 } {
    return {
      polygonCount: this.polygons.length,
      linkCount: this.links.length,
      bounds: this.bounds,
    };
  }
}

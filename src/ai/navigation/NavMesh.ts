/**
 * @fileoverview Advanced navigation mesh with BVH spatial acceleration.
 * Provides polygon-based walkable surfaces with efficient spatial queries.
 * @module ai/navigation/NavMesh
 */

import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { Logger } from '../../core/Logger';

const logger = Logger.create('NavMesh');

/**
 * Area type identifier for navigation mesh polygons.
 */
export type NavAreaType = number;

/**
 * Standard navigation area types with default costs.
 */
export const NavAreaTypes = {
  WALKABLE: 0,
  ROAD: 1,
  GRASS: 2,
  WATER: 3,
  DIFFICULT: 4,
  DANGER: 5,
  UNWALKABLE: 255,
} as const;

/**
 * Default traversal costs for standard area types.
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
 */
export class NavPolygon {
  readonly id: number;
  readonly vertices: Vector3[];
  center: Vector3;
  normal: Vector3;
  neighbors: number[];
  area: NavAreaType;
  cost: number;
  bounds: Box3;
  userData: any;

  private static nextId = 0;

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
    this.center = this.computeCenter();
    this.normal = this.computeNormal();
    this.bounds = this.computeBounds();
    this.userData = null;
  }

  private computeCenter(): Vector3 {
    const center = new Vector3();
    for (const vertex of this.vertices) {
      center.addInPlace(vertex);
    }
    return center.scaleInPlace(1 / this.vertices.length);
  }

  private computeNormal(): Vector3 {
    const normal = new Vector3();
    const n = this.vertices.length;

    for (let i = 0; i < n; i++) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % n];

      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }

    return normal.normalize();
  }

  private computeBounds(): Box3 {
    const bounds = new Box3();
    for (const vertex of this.vertices) {
      bounds.expandByPoint(vertex);
    }
    return bounds;
  }

  containsPoint(point: Vector3): boolean {
    const n = this.vertices.length;
    let inside = false;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = this.vertices[i];
      const vj = this.vertices[j];

      if ((vi.z > point.z) !== (vj.z > point.z) &&
          point.x < (vj.x - vi.x) * (point.z - vi.z) / (vj.z - vi.z) + vi.x) {
        inside = !inside;
      }
    }

    return inside;
  }

  getArea(): number {
    let area = 0;
    const n = this.vertices.length;

    for (let i = 0; i < n; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[(i + 1) % n];
      area += v1.x * v2.z - v2.x * v1.z;
    }

    return Math.abs(area) / 2;
  }

  getSharedEdge(neighborIndex: number): [Vector3, Vector3] | null {
    const edgeIdx = this.neighbors.indexOf(neighborIndex);
    if (edgeIdx === -1) return null;

    const v1 = this.vertices[edgeIdx];
    const v2 = this.vertices[(edgeIdx + 1) % this.vertices.length];
    return [v1, v2];
  }

  closestPointOnPolygon(point: Vector3): Vector3 {
    if (this.containsPoint(point)) {
      return point.clone();
    }

    let closestPoint = this.vertices[0].clone();
    let minDistSq = point.distanceTo(this.vertices[0]) ** 2;

    for (let i = 0; i < this.vertices.length; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[(i + 1) % this.vertices.length];

      const closest = this.closestPointOnSegment(point, v1, v2);
      const distSq = point.distanceTo(closest) ** 2;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestPoint = closest;
      }
    }

    return closestPoint;
  }

  private closestPointOnSegment(point: Vector3, a: Vector3, b: Vector3): Vector3 {
    const ab = b.sub(a);
    const ap = point.sub(a);
    const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
    return a.add(ab.scale(t));
  }
}

/**
 * Off-mesh link connecting two positions.
 */
export class NavLink {
  readonly id: number;
  readonly start: Vector3;
  readonly end: Vector3;
  type: NavLinkType;
  bidirectional: boolean;
  cost: number;
  radius: number;
  area: NavAreaType;
  userData: any;

  private static nextId = 0;

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

  getLength(): number {
    return this.start.distanceTo(this.end);
  }

  getDirection(): Vector3 {
    return this.end.sub(this.start).normalize();
  }
}

/**
 * Types of off-mesh links.
 */
export enum NavLinkType {
  WALK = 0,
  JUMP = 1,
  CLIMB = 2,
  DROP = 3,
  TELEPORT = 4,
  CUSTOM = 5,
}

/**
 * BVH (Bounding Volume Hierarchy) node for spatial acceleration.
 */
class BVHNode {
  bounds: Box3;
  polygonIds: number[];
  left: BVHNode | null;
  right: BVHNode | null;

  constructor(bounds: Box3, polygonIds: number[]) {
    this.bounds = bounds;
    this.polygonIds = polygonIds;
    this.left = null;
    this.right = null;
  }

  isLeaf(): boolean {
    return this.left === null && this.right === null;
  }
}

/**
 * BVH tree for fast polygon queries.
 */
class BVHTree {
  private root: BVHNode | null = null;
  private readonly maxLeafSize = 8;

  build(polygons: NavPolygon[]): void {
    if (polygons.length === 0) {
      this.root = null;
      return;
    }

    const polygonIds = polygons.map(p => p.id);
    const bounds = this.computeBounds(polygons);
    this.root = this.buildRecursive(polygons, polygonIds, bounds);
  }

  private buildRecursive(
    polygons: NavPolygon[],
    polygonIds: number[],
    bounds: Box3
  ): BVHNode {
    const node = new BVHNode(bounds, polygonIds);

    if (polygonIds.length <= this.maxLeafSize) {
      return node;
    }

    const { leftIds, rightIds, leftBounds, rightBounds } = this.splitNode(
      polygons,
      polygonIds,
      bounds
    );

    if (leftIds.length === 0 || rightIds.length === 0) {
      return node;
    }

    const leftPolygons = polygons.filter(p => leftIds.includes(p.id));
    const rightPolygons = polygons.filter(p => rightIds.includes(p.id));

    node.left = this.buildRecursive(leftPolygons, leftIds, leftBounds);
    node.right = this.buildRecursive(rightPolygons, rightIds, rightBounds);

    return node;
  }

  private splitNode(
    polygons: NavPolygon[],
    polygonIds: number[],
    bounds: Box3
  ): {
    leftIds: number[];
    rightIds: number[];
    leftBounds: Box3;
    rightBounds: Box3;
  } {
    const size = bounds.getSize();
    const axis = size.x > size.y ? (size.x > size.z ? 0 : 2) : (size.y > size.z ? 1 : 2);
    const center = bounds.getCenter();

    const leftIds: number[] = [];
    const rightIds: number[] = [];
    const leftBounds = new Box3();
    const rightBounds = new Box3();

    for (const id of polygonIds) {
      const polygon = polygons.find(p => p.id === id)!;
      const polyCenter = polygon.center;

      if ((axis === 0 && polyCenter.x < center.x) ||
          (axis === 1 && polyCenter.y < center.y) ||
          (axis === 2 && polyCenter.z < center.z)) {
        leftIds.push(id);
        leftBounds.expandByBox(polygon.bounds);
      } else {
        rightIds.push(id);
        rightBounds.expandByBox(polygon.bounds);
      }
    }

    return { leftIds, rightIds, leftBounds, rightBounds };
  }

  private computeBounds(polygons: NavPolygon[]): Box3 {
    const bounds = new Box3();
    for (const polygon of polygons) {
      bounds.expandByBox(polygon.bounds);
    }
    return bounds;
  }

  query(point: Vector3, radius: number): number[] {
    if (!this.root) return [];

    const results: number[] = [];
    const queryBounds = new Box3(
      new Vector3(point.x - radius, point.y - radius, point.z - radius),
      new Vector3(point.x + radius, point.y + radius, point.z + radius)
    );

    this.queryRecursive(this.root, queryBounds, results);
    return results;
  }

  private queryRecursive(node: BVHNode, queryBounds: Box3, results: number[]): void {
    if (!node.bounds.intersectsBox(queryBounds)) {
      return;
    }

    if (node.isLeaf()) {
      results.push(...node.polygonIds);
      return;
    }

    if (node.left) this.queryRecursive(node.left, queryBounds, results);
    if (node.right) this.queryRecursive(node.right, queryBounds, results);
  }

  raycast(origin: Vector3, direction: Vector3, maxDistance: number): number[] {
    if (!this.root) return [];

    const results: number[] = [];
    this.raycastRecursive(this.root, origin, direction, maxDistance, results);
    return results;
  }

  private raycastRecursive(
    node: BVHNode,
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
    results: number[]
  ): void {
    if (!this.intersectRayBox(origin, direction, node.bounds, maxDistance)) {
      return;
    }

    if (node.isLeaf()) {
      results.push(...node.polygonIds);
      return;
    }

    if (node.left) this.raycastRecursive(node.left, origin, direction, maxDistance, results);
    if (node.right) this.raycastRecursive(node.right, origin, direction, maxDistance, results);
  }

  private intersectRayBox(
    origin: Vector3,
    direction: Vector3,
    box: Box3,
    maxDistance: number
  ): boolean {
    const invDir = new Vector3(
      1 / direction.x,
      1 / direction.y,
      1 / direction.z
    );

    const t1 = (box.min.x - origin.x) * invDir.x;
    const t2 = (box.max.x - origin.x) * invDir.x;
    const t3 = (box.min.y - origin.y) * invDir.y;
    const t4 = (box.max.y - origin.y) * invDir.y;
    const t5 = (box.min.z - origin.z) * invDir.z;
    const t6 = (box.max.z - origin.z) * invDir.z;

    const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
    const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

    if (tmax < 0 || tmin > tmax || tmin > maxDistance) {
      return false;
    }

    return true;
  }
}

/**
 * Navigation mesh with BVH spatial acceleration.
 * Supports efficient polygon queries and pathfinding.
 */
export class NavMesh {
  readonly polygons: NavPolygon[];
  readonly links: NavLink[];
  bounds: Box3;
  private bvh: BVHTree;
  private polygonMap: Map<number, NavPolygon>;

  constructor() {
    this.polygons = [];
    this.links = [];
    this.bounds = new Box3();
    this.bvh = new BVHTree();
    this.polygonMap = new Map();
  }

  addPolygon(polygon: NavPolygon): void {
    this.polygons.push(polygon);
    this.polygonMap.set(polygon.id, polygon);
    this.bounds.expandByBox(polygon.bounds);
  }

  addLink(link: NavLink): void {
    this.links.push(link);
    this.bounds.expandByPoint(link.start);
    this.bounds.expandByPoint(link.end);
  }

  removePolygon(polygonId: number): boolean {
    const index = this.polygons.findIndex(p => p.id === polygonId);
    if (index === -1) return false;

    this.polygons.splice(index, 1);
    this.polygonMap.delete(polygonId);
    this.rebuildBVH();
    return true;
  }

  getPolygon(id: number): NavPolygon | undefined {
    return this.polygonMap.get(id);
  }

  buildAccelerationStructure(): void {
    logger.debug('Building BVH acceleration structure', {
      polygonCount: this.polygons.length
    });

    const startTime = performance.now();
    this.bvh.build(this.polygons);
    const buildTime = performance.now() - startTime;

    logger.info('BVH built successfully', {
      polygonCount: this.polygons.length,
      buildTimeMs: buildTime.toFixed(2)
    });
  }

  private rebuildBVH(): void {
    this.bvh.build(this.polygons);
  }

  findNearestPolygon(position: Vector3, maxDistance: number = Infinity): NavPolygon | null {
    const candidateIds = this.bvh.query(position, maxDistance);

    let nearest: NavPolygon | null = null;
    let minDist = maxDistance;

    for (const id of candidateIds) {
      const poly = this.polygonMap.get(id);
      if (!poly) continue;

      if (poly.containsPoint(position)) {
        return poly;
      }

      const closestPoint = poly.closestPointOnPolygon(position);
      const dist = position.distanceTo(closestPoint);

      if (dist < minDist) {
        minDist = dist;
        nearest = poly;
      }
    }

    return nearest;
  }

  queryPolygonsInRadius(position: Vector3, radius: number): NavPolygon[] {
    const candidateIds = this.bvh.query(position, radius);
    const results: NavPolygon[] = [];

    for (const id of candidateIds) {
      const poly = this.polygonMap.get(id);
      if (!poly) continue;

      const closestPoint = poly.closestPointOnPolygon(position);
      if (position.distanceTo(closestPoint) <= radius) {
        results.push(poly);
      }
    }

    return results;
  }

  raycast(origin: Vector3, direction: Vector3, maxDistance: number = Infinity): {
    polygon: NavPolygon;
    point: Vector3;
    distance: number;
  } | null {
    const candidateIds = this.bvh.raycast(origin, direction, maxDistance);

    let closestHit: { polygon: NavPolygon; point: Vector3; distance: number } | null = null;
    let closestDist = maxDistance;

    for (const id of candidateIds) {
      const poly = this.polygonMap.get(id);
      if (!poly) continue;

      const hit = this.raycastPolygon(origin, direction, poly);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = { polygon: poly, point: hit.point, distance: hit.distance };
      }
    }

    return closestHit;
  }

  private raycastPolygon(
    origin: Vector3,
    direction: Vector3,
    polygon: NavPolygon
  ): { point: Vector3; distance: number } | null {
    const epsilon = 1e-6;
    const edge1 = polygon.vertices[1].sub(polygon.vertices[0]);
    const edge2 = polygon.vertices[2].sub(polygon.vertices[0]);

    const h = direction.cross(edge2);
    const a = edge1.dot(h);

    if (Math.abs(a) < epsilon) return null;

    const f = 1.0 / a;
    const s = origin.sub(polygon.vertices[0]);
    const u = f * s.dot(h);

    if (u < 0.0 || u > 1.0) return null;

    const q = s.cross(edge1);
    const v = f * direction.dot(q);

    if (v < 0.0 || u + v > 1.0) return null;

    const t = f * edge2.dot(q);

    if (t > epsilon) {
      const point = origin.add(direction.scale(t));
      return { point, distance: t };
    }

    return null;
  }

  buildNeighborConnections(threshold: number = 0.01): void {
    logger.debug('Building neighbor connections', {
      polygonCount: this.polygons.length
    });

    const startTime = performance.now();
    let connectionCount = 0;

    for (let i = 0; i < this.polygons.length; i++) {
      const poly1 = this.polygons[i];

      for (let j = i + 1; j < this.polygons.length; j++) {
        const poly2 = this.polygons[j];

        if (!poly1.bounds.intersectsBox(poly2.bounds)) continue;

        for (let e1 = 0; e1 < poly1.vertices.length; e1++) {
          const p1a = poly1.vertices[e1];
          const p1b = poly1.vertices[(e1 + 1) % poly1.vertices.length];

          for (let e2 = 0; e2 < poly2.vertices.length; e2++) {
            const p2a = poly2.vertices[e2];
            const p2b = poly2.vertices[(e2 + 1) % poly2.vertices.length];

            if ((p1a.distanceTo(p2a) < threshold && p1b.distanceTo(p2b) < threshold) ||
                (p1a.distanceTo(p2b) < threshold && p1b.distanceTo(p2a) < threshold)) {
              poly1.neighbors[e1] = poly2.id;
              poly2.neighbors[e2] = poly1.id;
              connectionCount++;
            }
          }
        }
      }
    }

    const buildTime = performance.now() - startTime;
    logger.info('Neighbor connections built', {
      connectionCount,
      buildTimeMs: buildTime.toFixed(2)
    });
  }

  clear(): void {
    this.polygons.length = 0;
    this.links.length = 0;
    this.polygonMap.clear();
    this.bounds = new Box3();
    this.bvh = new BVHTree();
  }

  getStats(): {
    polygonCount: number;
    linkCount: number;
    bounds: Box3;
    averagePolySize: number;
  } {
    let totalArea = 0;
    for (const poly of this.polygons) {
      totalArea += poly.getArea();
    }

    return {
      polygonCount: this.polygons.length,
      linkCount: this.links.length,
      bounds: this.bounds,
      averagePolySize: this.polygons.length > 0 ? totalArea / this.polygons.length : 0,
    };
  }
}

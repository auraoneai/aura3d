/**
 * Spatial query system for world entities
 * @module World
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { SpatialIndex, SpatialObject, AABB } from './SpatialIndex';

/**
 * Query result with distance information
 */
export interface QueryResult {
    /** Object that matched query */
    object: SpatialObject;

    /** Distance from query origin */
    distance: number;

    /** Whether object is fully contained (for volume queries) */
    fullyContained: boolean;
}

/**
 * Frustum plane for frustum culling
 */
export interface FrustumPlane {
    /** Plane normal */
    normal: Vector3;

    /** Plane distance from origin */
    distance: number;
}

/**
 * View frustum for frustum culling
 */
export class ViewFrustum {
    /** Frustum planes (left, right, top, bottom, near, far) */
    public planes: FrustumPlane[];

    /**
     * Creates a view frustum
     */
    constructor() {
        this.planes = [];
    }

    /**
     * Extracts frustum planes from view-projection matrix
     * @param viewProjectionMatrix - Combined view-projection matrix
     */
    public fromMatrix(viewProjectionMatrix: Matrix4): void {
        const m = viewProjectionMatrix.elements;

        this.planes = [
            // Left plane
            {
                normal: new Vector3(m[3] + m[0], m[7] + m[4], m[11] + m[8]).normalize(),
                distance: m[15] + m[12]
            },
            // Right plane
            {
                normal: new Vector3(m[3] - m[0], m[7] - m[4], m[11] - m[8]).normalize(),
                distance: m[15] - m[12]
            },
            // Top plane
            {
                normal: new Vector3(m[3] - m[1], m[7] - m[5], m[11] - m[9]).normalize(),
                distance: m[15] - m[13]
            },
            // Bottom plane
            {
                normal: new Vector3(m[3] + m[1], m[7] + m[5], m[11] + m[9]).normalize(),
                distance: m[15] + m[13]
            },
            // Near plane
            {
                normal: new Vector3(m[3] + m[2], m[7] + m[6], m[11] + m[10]).normalize(),
                distance: m[15] + m[14]
            },
            // Far plane
            {
                normal: new Vector3(m[3] - m[2], m[7] - m[6], m[11] - m[10]).normalize(),
                distance: m[15] - m[14]
            }
        ];
    }

    /**
     * Tests if a point is inside the frustum
     * @param point - Point to test
     */
    public containsPoint(point: Vector3): boolean {
        for (const plane of this.planes) {
            const distance = point.dot(plane.normal) + plane.distance;
            if (distance < 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Tests if an AABB intersects the frustum
     * @param bounds - AABB to test
     */
    public intersectsAABB(bounds: AABB): boolean {
        for (const plane of this.planes) {
            // Get positive vertex
            const px = plane.normal.x > 0 ? bounds.max.x : bounds.min.x;
            const py = plane.normal.y > 0 ? bounds.max.y : bounds.min.y;
            const pz = plane.normal.z > 0 ? bounds.max.z : bounds.min.z;

            const positiveVertex = new Vector3(px, py, pz);
            const distance = positiveVertex.dot(plane.normal) + plane.distance;

            if (distance < 0) {
                return false;
            }
        }
        return true;
    }
}

/**
 * World spatial query system
 */
export class WorldQuery {
    /** Spatial index for efficient queries */
    private spatialIndex: SpatialIndex;

    /**
     * Creates a new world query system
     * @param spatialIndex - Spatial index to query
     */
    constructor(spatialIndex: SpatialIndex) {
        this.spatialIndex = spatialIndex;
    }

    /**
     * Queries objects within a radius
     * @param center - Query center position
     * @param radius - Query radius
     * @param sorted - Sort results by distance
     * @returns Query results
     */
    public queryRadius(center: Vector3, radius: number, sorted: boolean = false): QueryResult[] {
        const objects = this.spatialIndex.querySphere(center, radius);
        const results: QueryResult[] = [];

        for (const obj of objects) {
            const distance = obj.position.subtract(center).length();

            if (distance <= radius) {
                results.push({
                    object: obj,
                    distance: distance,
                    fullyContained: this.isAABBInSphere(obj.bounds, center, radius)
                });
            }
        }

        if (sorted) {
            results.sort((a, b) => a.distance - b.distance);
        }

        return results;
    }

    /**
     * Queries objects within an axis-aligned box
     * @param min - Box minimum corner
     * @param max - Box maximum corner
     * @returns Query results
     */
    public queryBox(min: Vector3, max: Vector3): QueryResult[] {
        const bounds: AABB = { min, max };
        const objects = this.spatialIndex.queryAABB(bounds);
        const results: QueryResult[] = [];

        const center = new Vector3(
            (min.x + max.x) * 0.5,
            (min.y + max.y) * 0.5,
            (min.z + max.z) * 0.5
        );

        for (const obj of objects) {
            const distance = obj.position.subtract(center).length();

            results.push({
                object: obj,
                distance: distance,
                fullyContained: this.isAABBInAABB(obj.bounds, bounds)
            });
        }

        return results;
    }

    /**
     * Queries objects within a view frustum
     * @param frustum - View frustum
     * @returns Query results
     */
    public queryFrustum(frustum: ViewFrustum): QueryResult[] {
        // Get all objects (we'll filter by frustum)
        const allObjects = this.spatialIndex.getAllObjects();
        const results: QueryResult[] = [];

        for (const obj of allObjects) {
            if (frustum.intersectsAABB(obj.bounds)) {
                results.push({
                    object: obj,
                    distance: 0,
                    fullyContained: false
                });
            }
        }

        return results;
    }

    /**
     * Finds the nearest object to a point
     * @param point - Query point
     * @param maxDistance - Maximum search distance
     * @returns Nearest object or null
     */
    public queryNearest(point: Vector3, maxDistance: number = Infinity): QueryResult | null {
        const searchRadius = maxDistance === Infinity ? 1000 : maxDistance;
        const objects = this.spatialIndex.querySphere(point, searchRadius);

        let nearest: QueryResult | null = null;
        let nearestDistance = maxDistance;

        for (const obj of objects) {
            const distance = obj.position.subtract(point).length();

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = {
                    object: obj,
                    distance: distance,
                    fullyContained: false
                };
            }
        }

        return nearest;
    }

    /**
     * Finds the K nearest objects to a point
     * @param point - Query point
     * @param k - Number of objects to find
     * @param maxDistance - Maximum search distance
     * @returns K nearest objects
     */
    public queryKNearest(point: Vector3, k: number, maxDistance: number = Infinity): QueryResult[] {
        const searchRadius = maxDistance === Infinity ? 1000 : maxDistance;
        const objects = this.spatialIndex.querySphere(point, searchRadius);

        const results: QueryResult[] = objects.map(obj => ({
            object: obj,
            distance: obj.position.subtract(point).length(),
            fullyContained: false
        }));

        results.sort((a, b) => a.distance - b.distance);

        return results.slice(0, k).filter(r => r.distance <= maxDistance);
    }

    /**
     * Performs a ray cast query
     * @param origin - Ray origin
     * @param direction - Ray direction (normalized)
     * @param maxDistance - Maximum ray distance
     * @returns Objects hit by ray, sorted by distance
     */
    public queryRaycast(origin: Vector3, direction: Vector3, maxDistance: number = 1000): QueryResult[] {
        const results: QueryResult[] = [];

        // Create AABB along ray
        const endPoint = origin.add(direction.clone().multiplyScalar(maxDistance));
        const rayBounds: AABB = {
            min: new Vector3(
                Math.min(origin.x, endPoint.x),
                Math.min(origin.y, endPoint.y),
                Math.min(origin.z, endPoint.z)
            ),
            max: new Vector3(
                Math.max(origin.x, endPoint.x),
                Math.max(origin.y, endPoint.y),
                Math.max(origin.z, endPoint.z)
            )
        };

        const candidates = this.spatialIndex.queryAABB(rayBounds);

        for (const obj of candidates) {
            const hit = this.rayIntersectsAABB(origin, direction, obj.bounds, maxDistance);
            if (hit.hit) {
                results.push({
                    object: obj,
                    distance: hit.distance,
                    fullyContained: false
                });
            }
        }

        results.sort((a, b) => a.distance - b.distance);

        return results;
    }

    /**
     * Ray-AABB intersection test
     */
    private rayIntersectsAABB(
        origin: Vector3,
        direction: Vector3,
        bounds: AABB,
        maxDistance: number
    ): { hit: boolean; distance: number } {
        const invDir = new Vector3(
            1 / direction.x,
            1 / direction.y,
            1 / direction.z
        );

        const t1 = (bounds.min.x - origin.x) * invDir.x;
        const t2 = (bounds.max.x - origin.x) * invDir.x;
        const t3 = (bounds.min.y - origin.y) * invDir.y;
        const t4 = (bounds.max.y - origin.y) * invDir.y;
        const t5 = (bounds.min.z - origin.z) * invDir.z;
        const t6 = (bounds.max.z - origin.z) * invDir.z;

        const tmin = Math.max(
            Math.max(Math.min(t1, t2), Math.min(t3, t4)),
            Math.min(t5, t6)
        );

        const tmax = Math.min(
            Math.min(Math.max(t1, t2), Math.max(t3, t4)),
            Math.max(t5, t6)
        );

        if (tmax < 0 || tmin > tmax || tmin > maxDistance) {
            return { hit: false, distance: 0 };
        }

        return { hit: true, distance: tmin >= 0 ? tmin : tmax };
    }

    /**
     * Checks if AABB is fully contained in sphere
     */
    private isAABBInSphere(bounds: AABB, center: Vector3, radius: number): boolean {
        const corners = [
            new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
            new Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
            new Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
            new Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
            new Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
            new Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
            new Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
            new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
        ];

        for (const corner of corners) {
            if (corner.subtract(center).length() > radius) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks if AABB is fully contained in another AABB
     */
    private isAABBInAABB(inner: AABB, outer: AABB): boolean {
        return (
            inner.min.x >= outer.min.x && inner.max.x <= outer.max.x &&
            inner.min.y >= outer.min.y && inner.max.y <= outer.max.y &&
            inner.min.z >= outer.min.z && inner.max.z <= outer.max.z
        );
    }
}

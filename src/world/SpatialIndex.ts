/**
 * Spatial indexing structures for efficient spatial queries
 * Implements octree for 3D spatial partitioning
 * @module World
 */

import { Vector3 } from '../math/Vector3';

/**
 * Axis-aligned bounding box
 */
export interface AABB {
    /** Minimum corner */
    min: Vector3;

    /** Maximum corner */
    max: Vector3;
}

/**
 * Spatial object with bounds
 */
export interface SpatialObject {
    /** Object unique identifier */
    id: string;

    /** Object bounding box */
    bounds: AABB;

    /** Object position */
    position: Vector3;

    /** Object user data */
    data: unknown;
}

/**
 * Octree node for spatial partitioning
 */
class OctreeNode {
    /** Node bounds */
    public bounds: AABB;

    /** Node depth in tree */
    public depth: number;

    /** Objects in this node */
    public objects: SpatialObject[];

    /** Child nodes (8 octants) */
    public children: OctreeNode[] | null;

    /** Parent node */
    public parent: OctreeNode | null;

    /**
     * Creates a new octree node
     * @param bounds - Node bounds
     * @param depth - Node depth
     * @param parent - Parent node
     */
    constructor(bounds: AABB, depth: number = 0, parent: OctreeNode | null = null) {
        this.bounds = bounds;
        this.depth = depth;
        this.objects = [];
        this.children = null;
        this.parent = parent;
    }

    /**
     * Checks if this is a leaf node
     */
    public isLeaf(): boolean {
        return this.children === null;
    }
}

/**
 * Octree spatial index
 */
export class SpatialIndex {
    /** Root node */
    private root: OctreeNode;

    /** Maximum objects per node before subdivision */
    private readonly maxObjectsPerNode: number = 8;

    /** Maximum tree depth */
    private readonly maxDepth: number = 8;

    /** Total objects in tree */
    private objectCount: number = 0;

    /** Object ID to node mapping for fast removal */
    private objectNodeMap: Map<string, OctreeNode>;

    /**
     * Creates a new spatial index
     * @param worldBounds - World bounds
     */
    constructor(worldBounds: AABB) {
        this.root = new OctreeNode(worldBounds, 0);
        this.objectNodeMap = new Map();
    }

    /**
     * Inserts an object into the spatial index
     * @param object - Spatial object to insert
     */
    public insert(object: SpatialObject): void {
        this.insertIntoNode(object, this.root);
        this.objectCount++;
    }

    /**
     * Inserts object into a specific node
     */
    private insertIntoNode(object: SpatialObject, node: OctreeNode): void {
        // If node has children, insert into appropriate child
        if (!node.isLeaf()) {
            const childIndex = this.getOctant(object.bounds, node.bounds);
            if (childIndex !== -1 && node.children) {
                this.insertIntoNode(object, node.children[childIndex]);
                return;
            }
        }

        // Add to this node
        node.objects.push(object);
        this.objectNodeMap.set(object.id, node);

        // Subdivide if necessary
        if (node.objects.length > this.maxObjectsPerNode && node.depth < this.maxDepth) {
            this.subdivide(node);
        }
    }

    /**
     * Subdivides a node into 8 children
     */
    private subdivide(node: OctreeNode): void {
        const bounds = node.bounds;
        const center = new Vector3(
            (bounds.min.x + bounds.max.x) * 0.5,
            (bounds.min.y + bounds.max.y) * 0.5,
            (bounds.min.z + bounds.max.z) * 0.5
        );

        node.children = [];

        // Create 8 octants
        for (let i = 0; i < 8; i++) {
            const min = new Vector3(
                i & 1 ? center.x : bounds.min.x,
                i & 2 ? center.y : bounds.min.y,
                i & 4 ? center.z : bounds.min.z
            );

            const max = new Vector3(
                i & 1 ? bounds.max.x : center.x,
                i & 2 ? bounds.max.y : center.y,
                i & 4 ? bounds.max.z : center.z
            );

            node.children.push(new OctreeNode({ min, max }, node.depth + 1, node));
        }

        // Redistribute objects to children
        const objects = node.objects;
        node.objects = [];

        for (const obj of objects) {
            const octant = this.getOctant(obj.bounds, bounds);
            if (octant !== -1 && node.children) {
                this.insertIntoNode(obj, node.children[octant]);
            } else {
                node.objects.push(obj);
                this.objectNodeMap.set(obj.id, node);
            }
        }
    }

    /**
     * Gets the octant index for an object
     * Returns -1 if object doesn't fit in a single octant
     */
    private getOctant(objectBounds: AABB, nodeBounds: AABB): number {
        const center = new Vector3(
            (nodeBounds.min.x + nodeBounds.max.x) * 0.5,
            (nodeBounds.min.y + nodeBounds.max.y) * 0.5,
            (nodeBounds.min.z + nodeBounds.max.z) * 0.5
        );

        const fitsLeft = objectBounds.max.x <= center.x;
        const fitsRight = objectBounds.min.x >= center.x;
        const fitsBottom = objectBounds.max.y <= center.y;
        const fitsTop = objectBounds.min.y >= center.y;
        const fitsBack = objectBounds.max.z <= center.z;
        const fitsFront = objectBounds.min.z >= center.z;

        if (fitsLeft && fitsBottom && fitsBack) return 0;
        if (fitsRight && fitsBottom && fitsBack) return 1;
        if (fitsLeft && fitsTop && fitsBack) return 2;
        if (fitsRight && fitsTop && fitsBack) return 3;
        if (fitsLeft && fitsBottom && fitsFront) return 4;
        if (fitsRight && fitsBottom && fitsFront) return 5;
        if (fitsLeft && fitsTop && fitsFront) return 6;
        if (fitsRight && fitsTop && fitsFront) return 7;

        return -1;
    }

    /**
     * Removes an object from the spatial index
     * @param objectId - Object ID to remove
     * @returns True if removed, false if not found
     */
    public remove(objectId: string): boolean {
        const node = this.objectNodeMap.get(objectId);
        if (!node) {
            return false;
        }

        node.objects = node.objects.filter(obj => obj.id !== objectId);
        this.objectNodeMap.delete(objectId);
        this.objectCount--;

        return true;
    }

    /**
     * Updates an object's position
     * @param objectId - Object ID
     * @param newBounds - New bounds
     */
    public update(objectId: string, newBounds: AABB): void {
        const node = this.objectNodeMap.get(objectId);
        if (!node) {
            return;
        }

        const object = node.objects.find(obj => obj.id === objectId);
        if (!object) {
            return;
        }

        // Remove and reinsert
        this.remove(objectId);
        object.bounds = newBounds;
        object.position = new Vector3(
            (newBounds.min.x + newBounds.max.x) * 0.5,
            (newBounds.min.y + newBounds.max.y) * 0.5,
            (newBounds.min.z + newBounds.max.z) * 0.5
        );
        this.insert(object);
    }

    /**
     * Queries objects within a bounding box
     * @param bounds - Query bounds
     * @returns Objects within bounds
     */
    public queryAABB(bounds: AABB): SpatialObject[] {
        const results: SpatialObject[] = [];
        this.queryAABBRecursive(this.root, bounds, results);
        return results;
    }

    /**
     * Recursively queries AABB
     */
    private queryAABBRecursive(node: OctreeNode, bounds: AABB, results: SpatialObject[]): void {
        if (!this.aabbIntersects(node.bounds, bounds)) {
            return;
        }

        for (const obj of node.objects) {
            if (this.aabbIntersects(obj.bounds, bounds)) {
                results.push(obj);
            }
        }

        if (node.children) {
            for (const child of node.children) {
                this.queryAABBRecursive(child, bounds, results);
            }
        }
    }

    /**
     * Queries objects within a sphere
     * @param center - Sphere center
     * @param radius - Sphere radius
     * @returns Objects within sphere
     */
    public querySphere(center: Vector3, radius: number): SpatialObject[] {
        const results: SpatialObject[] = [];
        this.querySphereRecursive(this.root, center, radius, results);
        return results;
    }

    /**
     * Recursively queries sphere
     */
    private querySphereRecursive(
        node: OctreeNode,
        center: Vector3,
        radius: number,
        results: SpatialObject[]
    ): void {
        if (!this.sphereIntersectsAABB(center, radius, node.bounds)) {
            return;
        }

        for (const obj of node.objects) {
            if (this.sphereIntersectsAABB(center, radius, obj.bounds)) {
                const distSq = obj.position.subtract(center).lengthSquared();
                if (distSq <= radius * radius) {
                    results.push(obj);
                }
            }
        }

        if (node.children) {
            for (const child of node.children) {
                this.querySphereRecursive(child, center, radius, results);
            }
        }
    }

    /**
     * Gets all objects in the index
     */
    public getAllObjects(): SpatialObject[] {
        const results: SpatialObject[] = [];
        this.getAllObjectsRecursive(this.root, results);
        return results;
    }

    /**
     * Recursively gets all objects
     */
    private getAllObjectsRecursive(node: OctreeNode, results: SpatialObject[]): void {
        results.push(...node.objects);

        if (node.children) {
            for (const child of node.children) {
                this.getAllObjectsRecursive(child, results);
            }
        }
    }

    /**
     * Checks if two AABBs intersect
     */
    private aabbIntersects(a: AABB, b: AABB): boolean {
        return (
            a.min.x <= b.max.x && a.max.x >= b.min.x &&
            a.min.y <= b.max.y && a.max.y >= b.min.y &&
            a.min.z <= b.max.z && a.max.z >= b.min.z
        );
    }

    /**
     * Checks if sphere intersects AABB
     */
    private sphereIntersectsAABB(center: Vector3, radius: number, aabb: AABB): boolean {
        const closestPoint = new Vector3(
            Math.max(aabb.min.x, Math.min(center.x, aabb.max.x)),
            Math.max(aabb.min.y, Math.min(center.y, aabb.max.y)),
            Math.max(aabb.min.z, Math.min(center.z, aabb.max.z))
        );

        const distSq = closestPoint.subtract(center).lengthSquared();
        return distSq <= radius * radius;
    }

    /**
     * Gets total object count
     */
    public getObjectCount(): number {
        return this.objectCount;
    }

    /**
     * Clears all objects from the index
     */
    public clear(): void {
        this.root.objects = [];
        this.root.children = null;
        this.objectNodeMap.clear();
        this.objectCount = 0;
    }

    /**
     * Gets tree statistics
     */
    public getStatistics(): {
        objectCount: number;
        maxDepth: number;
        nodeCount: number;
        leafCount: number;
    } {
        let nodeCount = 0;
        let leafCount = 0;
        let maxDepth = 0;

        const traverse = (node: OctreeNode): void => {
            nodeCount++;
            maxDepth = Math.max(maxDepth, node.depth);

            if (node.isLeaf()) {
                leafCount++;
            } else if (node.children) {
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        traverse(this.root);

        return {
            objectCount: this.objectCount,
            maxDepth,
            nodeCount,
            leafCount
        };
    }
}

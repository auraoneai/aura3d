/**
 * Streaming volume definitions for level streaming
 * @module World
 */

import { Vector3 } from '../math/Vector3';
import { AABB } from './SpatialIndex';

/**
 * Streaming volume shape types
 */
export enum StreamingVolumeShape {
    BOX = 'box',
    SPHERE = 'sphere',
    CYLINDER = 'cylinder'
}

/**
 * Streaming priority levels
 */
export enum StreamingPriority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3,
    BACKGROUND = 4
}

/**
 * Streaming volume definition
 */
export class StreamingVolume {
    /** Volume unique identifier */
    public readonly id: string;

    /** Volume name */
    public name: string;

    /** Volume shape */
    public shape: StreamingVolumeShape;

    /** Volume center position */
    public position: Vector3;

    /** Volume size/radius */
    public size: Vector3;

    /** Streaming priority */
    public priority: StreamingPriority;

    /** Level/scene IDs to load when in volume */
    public levelIds: string[];

    /** Load distance (start loading when this distance away) */
    public loadDistance: number;

    /** Unload distance (unload when this distance away) */
    public unloadDistance: number;

    /** Whether volume is enabled */
    public enabled: boolean;

    /** Volume metadata */
    private metadata: Map<string, unknown>;

    /**
     * Creates a new streaming volume
     * @param id - Volume identifier
     * @param name - Volume name
     * @param shape - Volume shape
     * @param position - Volume position
     * @param size - Volume size
     */
    constructor(
        id: string,
        name: string,
        shape: StreamingVolumeShape,
        position: Vector3,
        size: Vector3
    ) {
        this.id = id;
        this.name = name;
        this.shape = shape;
        this.position = position.clone();
        this.size = size.clone();
        this.priority = StreamingPriority.NORMAL;
        this.levelIds = [];
        this.loadDistance = 100.0;
        this.unloadDistance = 200.0;
        this.enabled = true;
        this.metadata = new Map();
    }

    /**
     * Checks if a point is inside the volume
     * @param point - Point to test
     * @returns True if point is inside
     */
    public containsPoint(point: Vector3): boolean {
        switch (this.shape) {
            case StreamingVolumeShape.BOX:
                return this.containsPointBox(point);
            case StreamingVolumeShape.SPHERE:
                return this.containsPointSphere(point);
            case StreamingVolumeShape.CYLINDER:
                return this.containsPointCylinder(point);
            default:
                return false;
        }
    }

    /**
     * Checks if point is in box
     */
    private containsPointBox(point: Vector3): boolean {
        const halfSize = this.size.clone().multiplyScalar(0.5);
        const min = this.position.subtract(halfSize);
        const max = this.position.add(halfSize);

        return (
            point.x >= min.x && point.x <= max.x &&
            point.y >= min.y && point.y <= max.y &&
            point.z >= min.z && point.z <= max.z
        );
    }

    /**
     * Checks if point is in sphere
     */
    private containsPointSphere(point: Vector3): boolean {
        const distance = point.subtract(this.position).length();
        return distance <= this.size.x;
    }

    /**
     * Checks if point is in cylinder
     */
    private containsPointCylinder(point: Vector3): boolean {
        const horizontalDist = Math.sqrt(
            Math.pow(point.x - this.position.x, 2) +
            Math.pow(point.z - this.position.z, 2)
        );

        const verticalDist = Math.abs(point.y - this.position.y);

        return horizontalDist <= this.size.x && verticalDist <= this.size.y * 0.5;
    }

    /**
     * Gets distance from point to volume
     * @param point - Point to measure from
     * @returns Distance to volume boundary
     */
    public getDistanceToPoint(point: Vector3): number {
        switch (this.shape) {
            case StreamingVolumeShape.BOX:
                return this.getDistanceToPointBox(point);
            case StreamingVolumeShape.SPHERE:
                return this.getDistanceToPointSphere(point);
            case StreamingVolumeShape.CYLINDER:
                return this.getDistanceToPointCylinder(point);
            default:
                return Infinity;
        }
    }

    /**
     * Gets distance to box
     */
    private getDistanceToPointBox(point: Vector3): number {
        const halfSize = this.size.clone().multiplyScalar(0.5);
        const min = this.position.subtract(halfSize);
        const max = this.position.add(halfSize);

        const closestPoint = new Vector3(
            Math.max(min.x, Math.min(point.x, max.x)),
            Math.max(min.y, Math.min(point.y, max.y)),
            Math.max(min.z, Math.min(point.z, max.z))
        );

        return point.subtract(closestPoint).length();
    }

    /**
     * Gets distance to sphere
     */
    private getDistanceToPointSphere(point: Vector3): number {
        const distance = point.subtract(this.position).length();
        return Math.max(0, distance - this.size.x);
    }

    /**
     * Gets distance to cylinder
     */
    private getDistanceToPointCylinder(point: Vector3): number {
        const horizontalDist = Math.sqrt(
            Math.pow(point.x - this.position.x, 2) +
            Math.pow(point.z - this.position.z, 2)
        );

        const verticalDist = Math.abs(point.y - this.position.y);
        const halfHeight = this.size.y * 0.5;

        const horizontalOverflow = Math.max(0, horizontalDist - this.size.x);
        const verticalOverflow = Math.max(0, verticalDist - halfHeight);

        return Math.sqrt(horizontalOverflow * horizontalOverflow + verticalOverflow * verticalOverflow);
    }

    /**
     * Checks if should load based on distance
     * @param distance - Distance from volume
     * @returns True if should load
     */
    public shouldLoad(distance: number): boolean {
        return this.enabled && distance <= this.loadDistance;
    }

    /**
     * Checks if should unload based on distance
     * @param distance - Distance from volume
     * @returns True if should unload
     */
    public shouldUnload(distance: number): boolean {
        return !this.enabled || distance > this.unloadDistance;
    }

    /**
     * Gets bounding box for the volume
     */
    public getBounds(): AABB {
        switch (this.shape) {
            case StreamingVolumeShape.BOX: {
                const halfSize = this.size.clone().multiplyScalar(0.5);
                return {
                    min: this.position.subtract(halfSize),
                    max: this.position.add(halfSize)
                };
            }
            case StreamingVolumeShape.SPHERE: {
                const radius = this.size.x;
                const offset = new Vector3(radius, radius, radius);
                return {
                    min: this.position.subtract(offset),
                    max: this.position.add(offset)
                };
            }
            case StreamingVolumeShape.CYLINDER: {
                const radius = this.size.x;
                const halfHeight = this.size.y * 0.5;
                return {
                    min: this.position.subtract(new Vector3(radius, halfHeight, radius)),
                    max: this.position.add(new Vector3(radius, halfHeight, radius))
                };
            }
            default:
                return {
                    min: this.position.clone(),
                    max: this.position.clone()
                };
        }
    }

    /**
     * Sets volume metadata
     * @param key - Metadata key
     * @param value - Metadata value
     */
    public setMetadata(key: string, value: unknown): void {
        this.metadata.set(key, value);
    }

    /**
     * Gets volume metadata
     * @param key - Metadata key
     */
    public getMetadata(key: string): unknown {
        return this.metadata.get(key);
    }

    /**
     * Creates a box streaming volume
     * @param id - Volume ID
     * @param name - Volume name
     * @param position - Volume position
     * @param size - Box dimensions
     * @returns Streaming volume
     */
    public static createBox(
        id: string,
        name: string,
        position: Vector3,
        size: Vector3
    ): StreamingVolume {
        return new StreamingVolume(id, name, StreamingVolumeShape.BOX, position, size);
    }

    /**
     * Creates a sphere streaming volume
     * @param id - Volume ID
     * @param name - Volume name
     * @param position - Volume position
     * @param radius - Sphere radius
     * @returns Streaming volume
     */
    public static createSphere(
        id: string,
        name: string,
        position: Vector3,
        radius: number
    ): StreamingVolume {
        return new StreamingVolume(
            id,
            name,
            StreamingVolumeShape.SPHERE,
            position,
            new Vector3(radius, radius, radius)
        );
    }

    /**
     * Creates a cylinder streaming volume
     * @param id - Volume ID
     * @param name - Volume name
     * @param position - Volume position
     * @param radius - Cylinder radius
     * @param height - Cylinder height
     * @returns Streaming volume
     */
    public static createCylinder(
        id: string,
        name: string,
        position: Vector3,
        radius: number,
        height: number
    ): StreamingVolume {
        return new StreamingVolume(
            id,
            name,
            StreamingVolumeShape.CYLINDER,
            position,
            new Vector3(radius, height, radius)
        );
    }
}

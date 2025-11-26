/**
 * Field Data Manager
 *
 * Manages multiple field datasets with caching, async loading, and memory management.
 * Provides centralized access to all field data in the application.
 *
 * @example
 * ```typescript
 * const manager = new FieldManager();
 *
 * // Load field with progress tracking
 * await manager.load('temperature', 'data/temp.vtk', (progress) => {
 *   console.log(`Loading: ${progress * 100}%`);
 * });
 *
 * // Access field
 * const temp = manager.get('temperature');
 * const value = temp.getInterpolated(5, 5, 5);
 * ```
 */

import { ScalarFieldData, VectorFieldData, FieldData } from './FieldData';
import { FieldDataLoader } from './FieldDataLoader';

export type FieldType = 'scalar' | 'vector';

export interface FieldEntry {
    field: FieldData;
    type: FieldType;
    loadTime: number;
    memorySize: number;
}

export interface FieldManagerOptions {
    maxMemoryMB?: number;
    enableCache?: boolean;
    autoEvict?: boolean;
}

/**
 * Progress callback for field loading
 */
export type ProgressCallback = (progress: number, status: string) => void;

/**
 * Manages multiple field datasets
 */
export class FieldManager {
    private fields: Map<string, FieldEntry> = new Map();
    private loader: FieldDataLoader;
    private options: Required<FieldManagerOptions>;
    private totalMemory: number = 0;

    constructor(options: FieldManagerOptions = {}) {
        this.options = {
            maxMemoryMB: options.maxMemoryMB ?? 1024,
            enableCache: options.enableCache ?? true,
            autoEvict: options.autoEvict ?? true
        };

        this.loader = new FieldDataLoader();
    }

    /**
     * Load field from file
     */
    public async load(
        name: string,
        url: string,
        onProgress?: ProgressCallback
    ): Promise<FieldData> {
        // Check if already loaded
        if (this.fields.has(name)) {
            if (onProgress) {
                onProgress(1.0, 'Already loaded');
            }
            return this.fields.get(name)!.field;
        }

        // Load field
        const field = await this.loader.load(url, onProgress);

        // Calculate memory size
        const memorySize = this.calculateMemorySize(field);

        // Check memory constraints
        if (this.options.autoEvict) {
            await this.ensureMemoryAvailable(memorySize);
        }

        // Store field
        const entry: FieldEntry = {
            field,
            type: field instanceof ScalarFieldData ? 'scalar' : 'vector',
            loadTime: Date.now(),
            memorySize
        };

        this.fields.set(name, entry);
        this.totalMemory += memorySize;

        return field;
    }

    /**
     * Add pre-existing field
     */
    public add(name: string, field: FieldData): void {
        if (this.fields.has(name)) {
            this.remove(name);
        }

        const memorySize = this.calculateMemorySize(field);

        if (this.options.autoEvict) {
            this.ensureMemoryAvailableSync(memorySize);
        }

        const entry: FieldEntry = {
            field,
            type: field instanceof ScalarFieldData ? 'scalar' : 'vector',
            loadTime: Date.now(),
            memorySize
        };

        this.fields.set(name, entry);
        this.totalMemory += memorySize;
    }

    /**
     * Get field by name
     */
    public get(name: string): FieldData | null {
        const entry = this.fields.get(name);
        return entry ? entry.field : null;
    }

    /**
     * Get scalar field by name
     */
    public getScalar(name: string): ScalarFieldData | null {
        const field = this.get(name);
        return field instanceof ScalarFieldData ? field : null;
    }

    /**
     * Get vector field by name
     */
    public getVector(name: string): VectorFieldData | null {
        const field = this.get(name);
        return field instanceof VectorFieldData ? field : null;
    }

    /**
     * Check if field exists
     */
    public has(name: string): boolean {
        return this.fields.has(name);
    }

    /**
     * Remove field
     */
    public remove(name: string): boolean {
        const entry = this.fields.get(name);
        if (!entry) {
            return false;
        }

        this.totalMemory -= entry.memorySize;
        return this.fields.delete(name);
    }

    /**
     * List all field names
     */
    public list(): string[] {
        return Array.from(this.fields.keys());
    }

    /**
     * Get field metadata
     */
    public getMetadata(name: string): Omit<FieldEntry, 'field'> | null {
        const entry = this.fields.get(name);
        if (!entry) {
            return null;
        }

        return {
            type: entry.type,
            loadTime: entry.loadTime,
            memorySize: entry.memorySize
        };
    }

    /**
     * Clear all fields
     */
    public clear(): void {
        this.fields.clear();
        this.totalMemory = 0;
    }

    /**
     * Get total memory usage in MB
     */
    public getMemoryUsage(): number {
        return this.totalMemory / (1024 * 1024);
    }

    /**
     * Get number of loaded fields
     */
    public get count(): number {
        return this.fields.size;
    }

    /**
     * Create scalar field
     */
    public createScalar(
        name: string,
        nx: number,
        ny: number,
        nz: number,
        boundsMin: [number, number, number],
        boundsMax: [number, number, number]
    ): ScalarFieldData {
        const field = new ScalarFieldData(nx, ny, nz, boundsMin, boundsMax, name);
        this.add(name, field);
        return field;
    }

    /**
     * Create vector field
     */
    public createVector(
        name: string,
        nx: number,
        ny: number,
        nz: number,
        boundsMin: [number, number, number],
        boundsMax: [number, number, number]
    ): VectorFieldData {
        const field = new VectorFieldData(nx, ny, nz, boundsMin, boundsMax, name);
        this.add(name, field);
        return field;
    }

    /**
     * Clone field
     */
    public clone(sourceName: string, targetName: string): FieldData | null {
        const source = this.get(sourceName);
        if (!source) {
            return null;
        }

        let clone: FieldData;

        if (source instanceof ScalarFieldData) {
            clone = new ScalarFieldData(
                source.dimensions[0],
                source.dimensions[1],
                source.dimensions[2],
                source.boundsMin,
                source.boundsMax,
                targetName
            );
            (clone as ScalarFieldData).data.set(source.data);
        } else {
            const vectorSource = source as VectorFieldData;
            clone = new VectorFieldData(
                source.dimensions[0],
                source.dimensions[1],
                source.dimensions[2],
                source.boundsMin,
                source.boundsMax,
                targetName
            );
            (clone as VectorFieldData).dataX.set(vectorSource.dataX);
            (clone as VectorFieldData).dataY.set(vectorSource.dataY);
            (clone as VectorFieldData).dataZ.set(vectorSource.dataZ);
        }

        this.add(targetName, clone);
        return clone;
    }

    /**
     * Calculate memory size of field in bytes
     */
    private calculateMemorySize(field: FieldData): number {
        const pointSize = field.size;

        if (field instanceof ScalarFieldData) {
            // 4 bytes per float
            return pointSize * 4;
        } else {
            // 3 components * 4 bytes per float
            return pointSize * 3 * 4;
        }
    }

    /**
     * Ensure memory is available by evicting old fields if needed
     */
    private async ensureMemoryAvailable(requiredBytes: number): Promise<void> {
        const maxBytes = this.options.maxMemoryMB * 1024 * 1024;
        const availableBytes = maxBytes - this.totalMemory;

        if (availableBytes >= requiredBytes) {
            return;
        }

        // Evict oldest fields until enough memory is available
        const bytesNeeded = requiredBytes - availableBytes;
        let bytesFreed = 0;

        // Sort by load time (oldest first)
        const entries = Array.from(this.fields.entries()).sort(
            (a, b) => a[1].loadTime - b[1].loadTime
        );

        for (const [name, entry] of entries) {
            if (bytesFreed >= bytesNeeded) {
                break;
            }

            console.warn(`FieldManager: Evicting field '${name}' to free memory`);
            this.remove(name);
            bytesFreed += entry.memorySize;
        }
    }

    /**
     * Synchronous version of ensureMemoryAvailable
     */
    private ensureMemoryAvailableSync(requiredBytes: number): void {
        const maxBytes = this.options.maxMemoryMB * 1024 * 1024;
        const availableBytes = maxBytes - this.totalMemory;

        if (availableBytes >= requiredBytes) {
            return;
        }

        const bytesNeeded = requiredBytes - availableBytes;
        let bytesFreed = 0;

        const entries = Array.from(this.fields.entries()).sort(
            (a, b) => a[1].loadTime - b[1].loadTime
        );

        for (const [name, entry] of entries) {
            if (bytesFreed >= bytesNeeded) {
                break;
            }

            console.warn(`FieldManager: Evicting field '${name}' to free memory`);
            this.remove(name);
            bytesFreed += entry.memorySize;
        }
    }

    /**
     * Get statistics about loaded fields
     */
    public getStats(): {
        count: number;
        memoryMB: number;
        maxMemoryMB: number;
        fields: Array<{
            name: string;
            type: FieldType;
            dimensions: [number, number, number];
            memoryMB: number;
        }>;
    } {
        const fields = Array.from(this.fields.entries()).map(([name, entry]) => ({
            name,
            type: entry.type,
            dimensions: entry.field.dimensions,
            memoryMB: entry.memorySize / (1024 * 1024)
        }));

        return {
            count: this.count,
            memoryMB: this.getMemoryUsage(),
            maxMemoryMB: this.options.maxMemoryMB,
            fields
        };
    }

    /**
     * Export field to JSON
     */
    public exportToJSON(name: string): object | null {
        const entry = this.fields.get(name);
        if (!entry) {
            return null;
        }

        const field = entry.field;
        const base = {
            name: field.name,
            type: entry.type,
            dimensions: field.dimensions,
            boundsMin: field.boundsMin,
            boundsMax: field.boundsMax,
            spacing: field.spacing
        };

        if (field instanceof ScalarFieldData) {
            return {
                ...base,
                data: Array.from(field.data)
            };
        } else {
            const vectorField = field as VectorFieldData;
            return {
                ...base,
                dataX: Array.from(vectorField.dataX),
                dataY: Array.from(vectorField.dataY),
                dataZ: Array.from(vectorField.dataZ)
            };
        }
    }

    /**
     * Import field from JSON
     */
    public importFromJSON(name: string, json: any): FieldData | null {
        try {
            if (json.type === 'scalar') {
                const field = new ScalarFieldData(
                    json.dimensions[0],
                    json.dimensions[1],
                    json.dimensions[2],
                    json.boundsMin,
                    json.boundsMax,
                    name
                );
                field.data.set(json.data);
                this.add(name, field);
                return field;
            } else if (json.type === 'vector') {
                const field = new VectorFieldData(
                    json.dimensions[0],
                    json.dimensions[1],
                    json.dimensions[2],
                    json.boundsMin,
                    json.boundsMax,
                    name
                );
                field.dataX.set(json.dataX);
                field.dataY.set(json.dataY);
                field.dataZ.set(json.dataZ);
                this.add(name, field);
                return field;
            }
        } catch (error) {
            console.error('Failed to import field from JSON:', error);
        }

        return null;
    }
}

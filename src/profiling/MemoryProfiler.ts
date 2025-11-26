/**
 * Memory profiling
 *
 * Tracks JavaScript heap, object allocations, texture memory,
 * buffer memory, and provides memory pressure detection.
 */

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
    /** Timestamp of snapshot */
    timestamp: number;
    /** Total JS heap size in bytes */
    totalJSHeapSize: number;
    /** Used JS heap size in bytes */
    usedJSHeapSize: number;
    /** JS heap size limit in bytes */
    jsHeapSizeLimit: number;
    /** Tracked object count */
    objectCount: number;
    /** Texture memory in bytes */
    textureMemory: number;
    /** Buffer memory in bytes */
    bufferMemory: number;
    /** Total tracked memory in bytes */
    totalTrackedMemory: number;
}

/**
 * Memory allocation event
 */
export interface AllocationEvent {
    /** Object type/category */
    type: string;
    /** Size in bytes */
    size: number;
    /** Timestamp */
    timestamp: number;
    /** Stack trace (if available) */
    stackTrace?: string;
}

/**
 * Memory profiler configuration
 */
export interface MemoryProfilerConfig {
    /** Enable memory profiling */
    enabled?: boolean;
    /** Snapshot interval in milliseconds */
    snapshotInterval?: number;
    /** Maximum number of snapshots to keep */
    maxSnapshots?: number;
    /** Track individual allocations */
    trackAllocations?: boolean;
    /** Memory pressure threshold (0-1) */
    pressureThreshold?: number;
}

/**
 * Memory pressure level
 */
export enum MemoryPressureLevel {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * Memory profiler for tracking JavaScript heap and GPU memory.
 * Provides allocation tracking, memory pressure detection, and GC hints.
 *
 * @example
 * ```typescript
 * const profiler = new MemoryProfiler({ snapshotInterval: 1000 });
 * profiler.start();
 *
 * // Track allocations
 * profiler.trackAllocation('Texture', 1024 * 1024);
 *
 * // Get memory info
 * const info = profiler.getCurrentMemoryInfo();
 * console.log(`Used: ${info.usedJSHeapSize / 1024 / 1024}MB`);
 *
 * // Check memory pressure
 * if (profiler.getMemoryPressure() === MemoryPressureLevel.HIGH) {
 *   profiler.suggestGarbageCollection();
 * }
 * ```
 */
export class MemoryProfiler {
    private enabled: boolean = false;
    private snapshotInterval: number;
    private maxSnapshots: number;
    private trackAllocations: boolean;
    private pressureThreshold: number;

    private snapshots: MemorySnapshot[] = [];
    private allocations: AllocationEvent[] = [];
    private objectRegistry: Map<string, number> = new Map();

    private snapshotTimer: number | null = null;
    private lastSnapshotTime: number = 0;

    // Memory tracking
    private textureMemory: number = 0;
    private bufferMemory: number = 0;

    /**
     * Create a new memory profiler
     */
    constructor(config: MemoryProfilerConfig = {}) {
        this.enabled = config.enabled !== false;
        this.snapshotInterval = config.snapshotInterval || 1000;
        this.maxSnapshots = config.maxSnapshots || 300;
        this.trackAllocations = config.trackAllocations || false;
        this.pressureThreshold = config.pressureThreshold || 0.85;
    }

    /**
     * Start memory profiling
     */
    public start(): void {
        this.enabled = true;

        if (typeof window !== 'undefined') {
            this.snapshotTimer = window.setInterval(() => {
                this.takeSnapshot();
            }, this.snapshotInterval);
        }

        this.takeSnapshot();
    }

    /**
     * Stop memory profiling
     */
    public stop(): void {
        this.enabled = false;

        if (this.snapshotTimer !== null) {
            if (typeof window !== 'undefined') {
                window.clearInterval(this.snapshotTimer);
            }
            this.snapshotTimer = null;
        }
    }

    /**
     * Check if profiling is enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Take a memory snapshot
     */
    public takeSnapshot(): MemorySnapshot {
        const snapshot = this.createSnapshot();

        this.snapshots.push(snapshot);

        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }

        this.lastSnapshotTime = snapshot.timestamp;

        return snapshot;
    }

    /**
     * Create a memory snapshot
     */
    private createSnapshot(): MemorySnapshot {
        let totalJSHeapSize = 0;
        let usedJSHeapSize = 0;
        let jsHeapSizeLimit = 0;

        // Try to get performance memory info (Chrome only)
        if (typeof performance !== 'undefined' && (performance as any).memory) {
            const memory = (performance as any).memory;
            totalJSHeapSize = memory.totalJSHeapSize || 0;
            usedJSHeapSize = memory.usedJSHeapSize || 0;
            jsHeapSizeLimit = memory.jsHeapSizeLimit || 0;
        }

        const objectCount = this.getTotalObjectCount();
        const totalTrackedMemory = this.textureMemory + this.bufferMemory;

        return {
            timestamp: performance.now(),
            totalJSHeapSize,
            usedJSHeapSize,
            jsHeapSizeLimit,
            objectCount,
            textureMemory: this.textureMemory,
            bufferMemory: this.bufferMemory,
            totalTrackedMemory
        };
    }

    /**
     * Get all snapshots
     */
    public getSnapshots(): ReadonlyArray<MemorySnapshot> {
        return this.snapshots;
    }

    /**
     * Get latest snapshot
     */
    public getLatestSnapshot(): MemorySnapshot | null {
        if (this.snapshots.length === 0) {
            return null;
        }
        return this.snapshots[this.snapshots.length - 1];
    }

    /**
     * Get current memory info
     */
    public getCurrentMemoryInfo(): MemorySnapshot {
        return this.createSnapshot();
    }

    /**
     * Track an object allocation
     */
    public trackAllocation(type: string, size: number, stackTrace?: string): void {
        if (!this.enabled) {
            return;
        }

        // Update object count
        const count = this.objectRegistry.get(type) || 0;
        this.objectRegistry.set(type, count + 1);

        // Track allocation event
        if (this.trackAllocations) {
            this.allocations.push({
                type,
                size,
                timestamp: performance.now(),
                stackTrace
            });
        }
    }

    /**
     * Track an object deallocation
     */
    public trackDeallocation(type: string): void {
        if (!this.enabled) {
            return;
        }

        const count = this.objectRegistry.get(type) || 0;
        if (count > 0) {
            this.objectRegistry.set(type, count - 1);
        }
    }

    /**
     * Get total object count
     */
    public getTotalObjectCount(): number {
        let total = 0;
        for (const count of this.objectRegistry.values()) {
            total += count;
        }
        return total;
    }

    /**
     * Get object count by type
     */
    public getObjectCount(type: string): number {
        return this.objectRegistry.get(type) || 0;
    }

    /**
     * Get all tracked object types
     */
    public getObjectTypes(): string[] {
        return Array.from(this.objectRegistry.keys());
    }

    /**
     * Track texture memory allocation
     */
    public trackTextureMemory(bytes: number): void {
        this.textureMemory += bytes;
    }

    /**
     * Free texture memory
     */
    public freeTextureMemory(bytes: number): void {
        this.textureMemory = Math.max(0, this.textureMemory - bytes);
    }

    /**
     * Track buffer memory allocation
     */
    public trackBufferMemory(bytes: number): void {
        this.bufferMemory += bytes;
    }

    /**
     * Free buffer memory
     */
    public freeBufferMemory(bytes: number): void {
        this.bufferMemory = Math.max(0, this.bufferMemory - bytes);
    }

    /**
     * Get total texture memory
     */
    public getTextureMemory(): number {
        return this.textureMemory;
    }

    /**
     * Get total buffer memory
     */
    public getBufferMemory(): number {
        return this.bufferMemory;
    }

    /**
     * Get total tracked memory
     */
    public getTotalTrackedMemory(): number {
        return this.textureMemory + this.bufferMemory;
    }

    /**
     * Get memory pressure level
     */
    public getMemoryPressure(): MemoryPressureLevel {
        const snapshot = this.getLatestSnapshot() || this.getCurrentMemoryInfo();

        if (snapshot.jsHeapSizeLimit === 0) {
            // Can't determine pressure without heap limit
            return MemoryPressureLevel.LOW;
        }

        const usage = snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit;

        if (usage >= 0.95) {
            return MemoryPressureLevel.CRITICAL;
        } else if (usage >= this.pressureThreshold) {
            return MemoryPressureLevel.HIGH;
        } else if (usage >= 0.7) {
            return MemoryPressureLevel.MEDIUM;
        } else {
            return MemoryPressureLevel.LOW;
        }
    }

    /**
     * Check if memory pressure is high
     */
    public isMemoryPressureHigh(): boolean {
        const pressure = this.getMemoryPressure();
        return pressure === MemoryPressureLevel.HIGH || pressure === MemoryPressureLevel.CRITICAL;
    }

    /**
     * Suggest garbage collection
     * Note: Actual GC cannot be triggered from JavaScript
     */
    public suggestGarbageCollection(): void {
        // In browsers, we can't force GC, but we can provide hints
        // by nullifying references and creating memory pressure

        console.log('MemoryProfiler: Suggesting garbage collection');

        // Some browsers expose gc() in development mode
        if (typeof (window as any).gc === 'function') {
            (window as any).gc();
        }
    }

    /**
     * Get allocation events
     */
    public getAllocations(): ReadonlyArray<AllocationEvent> {
        return this.allocations;
    }

    /**
     * Get recent allocations
     */
    public getRecentAllocations(count: number): AllocationEvent[] {
        return this.allocations.slice(-count);
    }

    /**
     * Clear allocation history
     */
    public clearAllocations(): void {
        this.allocations = [];
    }

    /**
     * Get memory growth rate (bytes per second)
     */
    public getMemoryGrowthRate(): number {
        if (this.snapshots.length < 2) {
            return 0;
        }

        const latest = this.snapshots[this.snapshots.length - 1];
        const oldest = this.snapshots[0];

        const timeDelta = (latest.timestamp - oldest.timestamp) / 1000; // Convert to seconds
        if (timeDelta === 0) {
            return 0;
        }

        const memoryDelta = latest.usedJSHeapSize - oldest.usedJSHeapSize;

        return memoryDelta / timeDelta;
    }

    /**
     * Detect potential memory leaks
     */
    public detectMemoryLeaks(): {
        suspected: boolean;
        growthRate: number;
        message: string;
    } {
        const growthRate = this.getMemoryGrowthRate();
        const threshold = 1024 * 1024; // 1MB per second

        const suspected = growthRate > threshold;

        return {
            suspected,
            growthRate,
            message: suspected
                ? `Potential memory leak detected. Growth rate: ${(growthRate / 1024 / 1024).toFixed(2)} MB/s`
                : 'No memory leaks detected'
        };
    }

    /**
     * Get memory statistics
     */
    public getStatistics(): {
        current: MemorySnapshot;
        pressure: MemoryPressureLevel;
        growthRate: number;
        objectCount: number;
        textureMemory: number;
        bufferMemory: number;
        totalTrackedMemory: number;
        leakDetection: ReturnType<MemoryProfiler['detectMemoryLeaks']>;
    } {
        return {
            current: this.getCurrentMemoryInfo(),
            pressure: this.getMemoryPressure(),
            growthRate: this.getMemoryGrowthRate(),
            objectCount: this.getTotalObjectCount(),
            textureMemory: this.textureMemory,
            bufferMemory: this.bufferMemory,
            totalTrackedMemory: this.getTotalTrackedMemory(),
            leakDetection: this.detectMemoryLeaks()
        };
    }

    /**
     * Reset profiler
     */
    public reset(): void {
        this.snapshots = [];
        this.allocations = [];
        this.objectRegistry.clear();
        this.textureMemory = 0;
        this.bufferMemory = 0;
    }

    /**
     * Dispose profiler
     */
    public dispose(): void {
        this.stop();
        this.reset();
    }
}

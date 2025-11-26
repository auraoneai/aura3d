/**
 * Counter markers for tracking numeric metrics
 *
 * Provides counters for draw calls, triangles, instances, and custom metrics.
 * Tracks frame-to-frame deltas and historical data.
 */

import { Profiler } from '../Profiler';

/**
 * Counter data point
 */
export interface CounterDataPoint {
    /** Frame number */
    frame: number;
    /** Counter value */
    value: number;
    /** Timestamp */
    timestamp: number;
    /** Delta from previous frame */
    delta: number;
}

/**
 * Counter statistics
 */
export interface CounterStatistics {
    /** Counter name */
    name: string;
    /** Current value */
    current: number;
    /** Minimum value */
    min: number;
    /** Maximum value */
    max: number;
    /** Average value */
    average: number;
    /** Total accumulated value */
    total: number;
    /** Number of samples */
    sampleCount: number;
}

/**
 * Predefined counter names
 */
export enum CounterName {
    DRAW_CALLS = 'DrawCalls',
    TRIANGLES = 'Triangles',
    VERTICES = 'Vertices',
    INSTANCES = 'Instances',
    TEXTURES_BOUND = 'TexturesBound',
    SHADER_SWITCHES = 'ShaderSwitches',
    STATE_CHANGES = 'StateChanges',
    RENDER_PASSES = 'RenderPasses',
    OBJECTS_RENDERED = 'ObjectsRendered',
    OBJECTS_CULLED = 'ObjectsCulled',
    LIGHTS = 'Lights',
    SHADOWS = 'Shadows'
}

/**
 * Counter marker for tracking numeric metrics.
 * Tracks frame-to-frame deltas and maintains historical data.
 *
 * @example
 * ```typescript
 * // Increment counters
 * CounterMarker.increment(CounterName.DRAW_CALLS);
 * CounterMarker.increment(CounterName.TRIANGLES, 1000);
 *
 * // Set counter value
 * CounterMarker.set(CounterName.OBJECTS_RENDERED, 50);
 *
 * // Get counter value
 * const drawCalls = CounterMarker.get(CounterName.DRAW_CALLS);
 *
 * // Get statistics
 * const stats = CounterMarker.getStatistics(CounterName.DRAW_CALLS);
 * console.log(`Draw calls: ${stats.current}, Avg: ${stats.average}`);
 * ```
 */
export class CounterMarker {
    private static counters: Map<string, number> = new Map();
    private static counterHistory: Map<string, CounterDataPoint[]> = new Map();
    private static historySize: number = 300;
    private static frameNumber: number = 0;

    /**
     * Set the history size for counters
     */
    public static setHistorySize(size: number): void {
        CounterMarker.historySize = size;
    }

    /**
     * Increment a counter
     */
    public static increment(name: string, value: number = 1): void {
        const current = CounterMarker.counters.get(name) || 0;
        const newValue = current + value;

        CounterMarker.counters.set(name, newValue);

        // Also update global profiler
        Profiler.incrementCounter(name, value);
    }

    /**
     * Decrement a counter
     */
    public static decrement(name: string, value: number = 1): void {
        CounterMarker.increment(name, -value);
    }

    /**
     * Set a counter value
     */
    public static set(name: string, value: number): void {
        CounterMarker.counters.set(name, value);
        Profiler.setCounter(name, value);
    }

    /**
     * Get a counter value
     */
    public static get(name: string): number {
        return CounterMarker.counters.get(name) || 0;
    }

    /**
     * Reset a counter to zero
     */
    public static reset(name: string): void {
        CounterMarker.counters.set(name, 0);
        Profiler.setCounter(name, 0);
    }

    /**
     * Reset all counters
     */
    public static resetAll(): void {
        CounterMarker.counters.clear();
    }

    /**
     * Begin a new frame (should be called at frame start)
     */
    public static beginFrame(): void {
        CounterMarker.frameNumber++;

        // Record current counter values to history
        const timestamp = performance.now();

        for (const [name, value] of CounterMarker.counters.entries()) {
            const history = CounterMarker.getOrCreateHistory(name);
            const previousValue = history.length > 0
                ? history[history.length - 1].value
                : 0;
            const delta = value - previousValue;

            const dataPoint: CounterDataPoint = {
                frame: CounterMarker.frameNumber,
                value,
                timestamp,
                delta
            };

            history.push(dataPoint);

            // Trim history if needed
            if (history.length > CounterMarker.historySize) {
                history.shift();
            }
        }

        // Reset per-frame counters
        CounterMarker.resetPerFrameCounters();
    }

    /**
     * Reset counters that should be reset each frame
     */
    private static resetPerFrameCounters(): void {
        const perFrameCounters = [
            CounterName.DRAW_CALLS,
            CounterName.TRIANGLES,
            CounterName.VERTICES,
            CounterName.TEXTURES_BOUND,
            CounterName.SHADER_SWITCHES,
            CounterName.STATE_CHANGES,
            CounterName.RENDER_PASSES,
            CounterName.OBJECTS_RENDERED,
            CounterName.OBJECTS_CULLED
        ];

        for (const counter of perFrameCounters) {
            CounterMarker.counters.set(counter, 0);
        }
    }

    /**
     * Get or create history for a counter
     */
    private static getOrCreateHistory(name: string): CounterDataPoint[] {
        let history = CounterMarker.counterHistory.get(name);

        if (!history) {
            history = [];
            CounterMarker.counterHistory.set(name, history);
        }

        return history;
    }

    /**
     * Get counter history
     */
    public static getHistory(name: string): ReadonlyArray<CounterDataPoint> {
        return CounterMarker.counterHistory.get(name) || [];
    }

    /**
     * Get counter statistics
     */
    public static getStatistics(name: string): CounterStatistics {
        const history = CounterMarker.getHistory(name);
        const current = CounterMarker.get(name);

        if (history.length === 0) {
            return {
                name,
                current,
                min: 0,
                max: 0,
                average: 0,
                total: 0,
                sampleCount: 0
            };
        }

        let min = Number.MAX_VALUE;
        let max = 0;
        let total = 0;

        for (const dataPoint of history) {
            min = Math.min(min, dataPoint.value);
            max = Math.max(max, dataPoint.value);
            total += dataPoint.value;
        }

        const average = total / history.length;

        return {
            name,
            current,
            min,
            max,
            average,
            total,
            sampleCount: history.length
        };
    }

    /**
     * Get all counter names
     */
    public static getAllCounterNames(): string[] {
        return Array.from(CounterMarker.counters.keys());
    }

    /**
     * Get all counter values
     */
    public static getAllCounters(): Map<string, number> {
        return new Map(CounterMarker.counters);
    }

    /**
     * Get delta from previous frame
     */
    public static getDelta(name: string): number {
        const history = CounterMarker.getHistory(name);

        if (history.length === 0) {
            return 0;
        }

        return history[history.length - 1].delta;
    }

    /**
     * Get average over last N frames
     */
    public static getAverage(name: string, frames: number = 60): number {
        const history = CounterMarker.getHistory(name);

        if (history.length === 0) {
            return 0;
        }

        const recentHistory = history.slice(-frames);
        const sum = recentHistory.reduce((acc, dp) => acc + dp.value, 0);

        return sum / recentHistory.length;
    }

    /**
     * Get maximum over last N frames
     */
    public static getMax(name: string, frames: number = 60): number {
        const history = CounterMarker.getHistory(name);

        if (history.length === 0) {
            return 0;
        }

        const recentHistory = history.slice(-frames);
        return Math.max(...recentHistory.map(dp => dp.value));
    }

    /**
     * Get minimum over last N frames
     */
    public static getMin(name: string, frames: number = 60): number {
        const history = CounterMarker.getHistory(name);

        if (history.length === 0) {
            return 0;
        }

        const recentHistory = history.slice(-frames);
        return Math.min(...recentHistory.map(dp => dp.value));
    }

    /**
     * Clear history for a counter
     */
    public static clearHistory(name: string): void {
        CounterMarker.counterHistory.delete(name);
    }

    /**
     * Clear all counter history
     */
    public static clearAllHistory(): void {
        CounterMarker.counterHistory.clear();
    }

    /**
     * Export counter data
     */
    public static export(): {
        counters: Record<string, number>;
        history: Record<string, CounterDataPoint[]>;
        statistics: Record<string, CounterStatistics>;
    } {
        const counters: Record<string, number> = {};
        const history: Record<string, CounterDataPoint[]> = {};
        const statistics: Record<string, CounterStatistics> = {};

        for (const name of CounterMarker.getAllCounterNames()) {
            counters[name] = CounterMarker.get(name);
            history[name] = Array.from(CounterMarker.getHistory(name));
            statistics[name] = CounterMarker.getStatistics(name);
        }

        return { counters, history, statistics };
    }
}

/**
 * Scoped counter for automatic increment/decrement
 *
 * @example
 * ```typescript
 * function renderObject() {
 *   const counter = new ScopedCounter(CounterName.OBJECTS_RENDERED);
 *   // ... rendering code ...
 *   // Automatically increments counter when created and decrements when disposed
 * }
 * ```
 */
export class ScopedCounter {
    private name: string;
    private incrementOnCreate: boolean;
    private decrementOnDispose: boolean;

    /**
     * Create a scoped counter
     */
    constructor(
        name: string,
        options: {
            incrementOnCreate?: boolean;
            decrementOnDispose?: boolean;
        } = {}
    ) {
        this.name = name;
        this.incrementOnCreate = options.incrementOnCreate !== false;
        this.decrementOnDispose = options.decrementOnDispose !== false;

        if (this.incrementOnCreate) {
            CounterMarker.increment(this.name);
        }
    }

    /**
     * Dispose the scoped counter
     */
    public dispose(): void {
        if (this.decrementOnDispose) {
            CounterMarker.decrement(this.name);
        }
    }

    /**
     * Symbol.dispose for using with 'using' keyword
     */
    [Symbol.dispose](): void {
        this.dispose();
    }
}

/**
 * Profiling session management
 *
 * Manages recording sessions, frame data collection, and statistics calculation.
 */

import { FrameProfile } from './Profiler';

/**
 * Session configuration
 */
export interface SessionConfig {
    /** Session name */
    name?: string;
    /** Maximum number of frames to record */
    maxFrames?: number;
    /** Automatically calculate statistics */
    autoCalculateStats?: boolean;
}

/**
 * Session statistics
 */
export interface SessionStatistics {
    /** Total number of frames */
    totalFrames: number;
    /** Total duration in milliseconds */
    totalDuration: number;
    /** Average frame time */
    averageFrameTime: number;
    /** Minimum frame time */
    minFrameTime: number;
    /** Maximum frame time */
    maxFrameTime: number;
    /** Median frame time */
    medianFrameTime: number;
    /** Standard deviation */
    standardDeviation: number;
    /** 95th percentile */
    percentile95: number;
    /** 99th percentile */
    percentile99: number;
    /** Average FPS */
    averageFPS: number;
    /** Per-scope statistics */
    scopeStats: Map<string, ScopeStatistics>;
}

/**
 * Statistics for a specific scope
 */
export interface ScopeStatistics {
    /** Scope name */
    name: string;
    /** Number of calls */
    callCount: number;
    /** Total time spent in this scope */
    totalTime: number;
    /** Average time per call */
    averageTime: number;
    /** Minimum time */
    minTime: number;
    /** Maximum time */
    maxTime: number;
    /** Percentage of frame time */
    percentageOfFrame: number;
}

/**
 * Profiling session class.
 * Manages recording sessions, collects frame data, and calculates statistics.
 *
 * @example
 * ```typescript
 * const session = new ProfilerSession({ name: 'My Session', maxFrames: 300 });
 * session.start();
 * // ... record frames ...
 * session.stop();
 * const stats = session.getStatistics();
 * ```
 */
export class ProfilerSession {
    private name: string;
    private maxFrames: number;
    private autoCalculateStats: boolean;

    private frames: FrameProfile[] = [];
    private startTime: number = 0;
    private endTime: number = 0;
    private isRecording: boolean = false;
    private statistics: SessionStatistics | null = null;

    /**
     * Create a new profiler session
     */
    constructor(config: SessionConfig = {}) {
        this.name = config.name || `Session ${Date.now()}`;
        this.maxFrames = config.maxFrames || 300;
        this.autoCalculateStats = config.autoCalculateStats !== false;
    }

    /**
     * Start recording
     */
    public start(): void {
        this.startTime = performance.now();
        this.isRecording = true;
        this.frames = [];
        this.statistics = null;
    }

    /**
     * Stop recording
     */
    public stop(): void {
        this.endTime = performance.now();
        this.isRecording = false;

        if (this.autoCalculateStats) {
            this.calculateStatistics();
        }
    }

    /**
     * Check if session is recording
     */
    public isActive(): boolean {
        return this.isRecording;
    }

    /**
     * Add a frame to the session
     */
    public addFrame(frame: FrameProfile): void {
        if (!this.isRecording) {
            return;
        }

        this.frames.push(frame);

        // Remove oldest frames if we exceed the maximum
        if (this.frames.length > this.maxFrames) {
            this.frames.shift();
        }
    }

    /**
     * Get all recorded frames
     */
    public getFrames(): ReadonlyArray<FrameProfile> {
        return this.frames;
    }

    /**
     * Get a specific frame by index
     */
    public getFrame(index: number): FrameProfile | null {
        if (index < 0 || index >= this.frames.length) {
            return null;
        }
        return this.frames[index];
    }

    /**
     * Get the number of recorded frames
     */
    public getFrameCount(): number {
        return this.frames.length;
    }

    /**
     * Get session name
     */
    public getName(): string {
        return this.name;
    }

    /**
     * Get session duration
     */
    public getDuration(): number {
        if (this.isRecording) {
            return performance.now() - this.startTime;
        }
        return this.endTime - this.startTime;
    }

    /**
     * Calculate session statistics
     */
    public calculateStatistics(): SessionStatistics {
        if (this.frames.length === 0) {
            return this.createEmptyStatistics();
        }

        const frameTimes = this.frames.map(f => f.duration);
        const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);

        const totalFrames = this.frames.length;
        const totalDuration = this.getDuration();
        const sumFrameTimes = frameTimes.reduce((sum, time) => sum + time, 0);
        const averageFrameTime = sumFrameTimes / totalFrames;
        const minFrameTime = sortedFrameTimes[0];
        const maxFrameTime = sortedFrameTimes[sortedFrameTimes.length - 1];
        const medianFrameTime = this.calculateMedian(sortedFrameTimes);
        const standardDeviation = this.calculateStandardDeviation(frameTimes, averageFrameTime);
        const percentile95 = this.calculatePercentile(sortedFrameTimes, 0.95);
        const percentile99 = this.calculatePercentile(sortedFrameTimes, 0.99);
        const averageFPS = 1000 / averageFrameTime;

        const scopeStats = this.calculateScopeStatistics();

        this.statistics = {
            totalFrames,
            totalDuration,
            averageFrameTime,
            minFrameTime,
            maxFrameTime,
            medianFrameTime,
            standardDeviation,
            percentile95,
            percentile99,
            averageFPS,
            scopeStats
        };

        return this.statistics;
    }

    /**
     * Get cached statistics (calculate if not available)
     */
    public getStatistics(): SessionStatistics {
        if (!this.statistics) {
            return this.calculateStatistics();
        }
        return this.statistics;
    }

    /**
     * Calculate per-scope statistics
     */
    private calculateScopeStatistics(): Map<string, ScopeStatistics> {
        const scopeMap = new Map<string, {
            times: number[];
            totalTime: number;
            callCount: number;
        }>();

        // Collect all scope timings
        for (const frame of this.frames) {
            for (const scope of frame.scopes) {
                const key = `${scope.category}::${scope.name}`;

                if (!scopeMap.has(key)) {
                    scopeMap.set(key, {
                        times: [],
                        totalTime: 0,
                        callCount: 0
                    });
                }

                const data = scopeMap.get(key)!;
                data.times.push(scope.duration);
                data.totalTime += scope.duration;
                data.callCount++;
            }
        }

        // Calculate statistics for each scope
        const stats = new Map<string, ScopeStatistics>();
        const totalFrameTime = this.frames.reduce((sum, f) => sum + f.duration, 0);

        for (const [key, data] of scopeMap.entries()) {
            const sortedTimes = [...data.times].sort((a, b) => a - b);

            stats.set(key, {
                name: key,
                callCount: data.callCount,
                totalTime: data.totalTime,
                averageTime: data.totalTime / data.callCount,
                minTime: sortedTimes[0],
                maxTime: sortedTimes[sortedTimes.length - 1],
                percentageOfFrame: (data.totalTime / totalFrameTime) * 100
            });
        }

        return stats;
    }

    /**
     * Calculate median value
     */
    private calculateMedian(sortedValues: number[]): number {
        const mid = Math.floor(sortedValues.length / 2);

        if (sortedValues.length % 2 === 0) {
            return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
        }

        return sortedValues[mid];
    }

    /**
     * Calculate percentile value
     */
    private calculatePercentile(sortedValues: number[], percentile: number): number {
        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
    }

    /**
     * Calculate standard deviation
     */
    private calculateStandardDeviation(values: number[], mean: number): number {
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return diff * diff;
        });

        const avgSquareDiff = squareDiffs.reduce((sum, value) => sum + value, 0) / values.length;
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * Create empty statistics object
     */
    private createEmptyStatistics(): SessionStatistics {
        return {
            totalFrames: 0,
            totalDuration: 0,
            averageFrameTime: 0,
            minFrameTime: 0,
            maxFrameTime: 0,
            medianFrameTime: 0,
            standardDeviation: 0,
            percentile95: 0,
            percentile99: 0,
            averageFPS: 0,
            scopeStats: new Map()
        };
    }

    /**
     * Export session data
     */
    public export(): {
        name: string;
        startTime: number;
        endTime: number;
        duration: number;
        frames: FrameProfile[];
        statistics: SessionStatistics;
    } {
        return {
            name: this.name,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.getDuration(),
            frames: this.frames,
            statistics: this.getStatistics()
        };
    }

    /**
     * Clear all recorded data
     */
    public clear(): void {
        this.frames = [];
        this.statistics = null;
    }
}

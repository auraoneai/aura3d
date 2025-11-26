/**
 * Frame timing management
 *
 * Provides high-precision frame timing using performance.now(),
 * maintains frame time history in a ring buffer, and tracks frame budget.
 */

/**
 * Frame timer configuration
 */
export interface FrameTimerConfig {
    /** Target frame rate (default: 60) */
    targetFPS?: number;
    /** History buffer size (default: 300) */
    historySize?: number;
    /** Spike threshold multiplier (default: 2.0) */
    spikeThreshold?: number;
}

/**
 * Frame timing data
 */
export interface FrameTimingData {
    /** Frame number */
    frameNumber: number;
    /** Frame start time */
    startTime: number;
    /** Frame end time */
    endTime: number;
    /** Frame duration */
    duration: number;
    /** Delta time from previous frame */
    deltaTime: number;
    /** Is this frame a spike? */
    isSpike: boolean;
}

/**
 * High-precision frame timer.
 * Uses performance.now() for sub-millisecond accuracy.
 * Maintains a ring buffer of frame times for statistical analysis.
 *
 * @example
 * ```typescript
 * const timer = new FrameTimer({ targetFPS: 60, historySize: 300 });
 *
 * // In game loop
 * timer.beginFrame();
 * // ... render ...
 * timer.endFrame();
 *
 * console.log(`FPS: ${timer.getFPS()}`);
 * console.log(`Frame time: ${timer.getLastFrameTime()}ms`);
 * ```
 */
export class FrameTimer {
    private targetFPS: number;
    private targetFrameTime: number;
    private historySize: number;
    private spikeThreshold: number;

    private frameNumber: number = 0;
    private currentFrameStart: number = 0;
    private lastFrameEnd: number = 0;

    // Ring buffer for frame times
    private frameTimeHistory: Float32Array;
    private historyIndex: number = 0;
    private historyFilled: boolean = false;

    // Spike detection
    private spikeCount: number = 0;
    private lastSpikeFrame: number = -1;

    /**
     * Create a new frame timer
     */
    constructor(config: FrameTimerConfig = {}) {
        this.targetFPS = config.targetFPS || 60;
        this.targetFrameTime = 1000 / this.targetFPS;
        this.historySize = config.historySize || 300;
        this.spikeThreshold = config.spikeThreshold || 2.0;

        this.frameTimeHistory = new Float32Array(this.historySize);
    }

    /**
     * Begin a new frame
     */
    public beginFrame(): void {
        this.currentFrameStart = performance.now();
    }

    /**
     * End the current frame
     */
    public endFrame(): void {
        const now = performance.now();
        const frameTime = now - this.currentFrameStart;
        const deltaTime = this.lastFrameEnd > 0 ? this.currentFrameStart - this.lastFrameEnd : frameTime;

        // Add to ring buffer
        this.frameTimeHistory[this.historyIndex] = frameTime;
        this.historyIndex = (this.historyIndex + 1) % this.historySize;

        if (this.historyIndex === 0) {
            this.historyFilled = true;
        }

        // Spike detection
        const avgFrameTime = this.getAverageFrameTime();
        const isSpike = frameTime > avgFrameTime * this.spikeThreshold;

        if (isSpike) {
            this.spikeCount++;
            this.lastSpikeFrame = this.frameNumber;
        }

        this.lastFrameEnd = now;
        this.frameNumber++;
    }

    /**
     * Get current frame number
     */
    public getFrameNumber(): number {
        return this.frameNumber;
    }

    /**
     * Get the last frame time in milliseconds
     */
    public getLastFrameTime(): number {
        if (this.frameNumber === 0) {
            return 0;
        }

        const lastIndex = (this.historyIndex - 1 + this.historySize) % this.historySize;
        return this.frameTimeHistory[lastIndex];
    }

    /**
     * Get current FPS (based on last frame time)
     */
    public getFPS(): number {
        const lastFrameTime = this.getLastFrameTime();
        if (lastFrameTime === 0) {
            return 0;
        }
        return 1000 / lastFrameTime;
    }

    /**
     * Get average frame time over the history buffer
     */
    public getAverageFrameTime(): number {
        const count = this.getHistoryCount();
        if (count === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += this.frameTimeHistory[i];
        }

        return sum / count;
    }

    /**
     * Get average FPS over the history buffer
     */
    public getAverageFPS(): number {
        const avgFrameTime = this.getAverageFrameTime();
        if (avgFrameTime === 0) {
            return 0;
        }
        return 1000 / avgFrameTime;
    }

    /**
     * Get minimum frame time in history
     */
    public getMinFrameTime(): number {
        const count = this.getHistoryCount();
        if (count === 0) {
            return 0;
        }

        let min = Number.MAX_VALUE;
        for (let i = 0; i < count; i++) {
            min = Math.min(min, this.frameTimeHistory[i]);
        }

        return min;
    }

    /**
     * Get maximum frame time in history
     */
    public getMaxFrameTime(): number {
        const count = this.getHistoryCount();
        if (count === 0) {
            return 0;
        }

        let max = 0;
        for (let i = 0; i < count; i++) {
            max = Math.max(max, this.frameTimeHistory[i]);
        }

        return max;
    }

    /**
     * Get target frame time in milliseconds
     */
    public getTargetFrameTime(): number {
        return this.targetFrameTime;
    }

    /**
     * Get target FPS
     */
    public getTargetFPS(): number {
        return this.targetFPS;
    }

    /**
     * Set target FPS
     */
    public setTargetFPS(fps: number): void {
        this.targetFPS = fps;
        this.targetFrameTime = 1000 / fps;
    }

    /**
     * Get frame budget remaining in milliseconds
     * (negative if over budget)
     */
    public getFrameBudgetRemaining(): number {
        const elapsed = performance.now() - this.currentFrameStart;
        return this.targetFrameTime - elapsed;
    }

    /**
     * Check if current frame is over budget
     */
    public isOverBudget(): boolean {
        return this.getFrameBudgetRemaining() < 0;
    }

    /**
     * Get frame time history as array
     */
    public getHistory(): number[] {
        const count = this.getHistoryCount();
        const history: number[] = [];

        for (let i = 0; i < count; i++) {
            history.push(this.frameTimeHistory[i]);
        }

        return history;
    }

    /**
     * Get frame time history in chronological order
     */
    public getHistoryChronological(): number[] {
        const count = this.getHistoryCount();
        const history: number[] = [];

        if (!this.historyFilled) {
            // History not full yet, just return in order
            for (let i = 0; i < count; i++) {
                history.push(this.frameTimeHistory[i]);
            }
        } else {
            // History is full, need to reorder
            for (let i = 0; i < count; i++) {
                const index = (this.historyIndex + i) % this.historySize;
                history.push(this.frameTimeHistory[index]);
            }
        }

        return history;
    }

    /**
     * Get number of items in history
     */
    private getHistoryCount(): number {
        return this.historyFilled ? this.historySize : this.historyIndex;
    }

    /**
     * Get total number of frame spikes detected
     */
    public getSpikeCount(): number {
        return this.spikeCount;
    }

    /**
     * Get the frame number of the last spike
     */
    public getLastSpikeFrame(): number {
        return this.lastSpikeFrame;
    }

    /**
     * Check if the last frame was a spike
     */
    public wasLastFrameSpike(): boolean {
        return this.lastSpikeFrame === this.frameNumber - 1;
    }

    /**
     * Calculate frame time percentile
     */
    public getPercentile(percentile: number): number {
        const history = this.getHistory();
        if (history.length === 0) {
            return 0;
        }

        const sorted = [...history].sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }

    /**
     * Get 95th percentile frame time
     */
    public get95thPercentile(): number {
        return this.getPercentile(0.95);
    }

    /**
     * Get 99th percentile frame time
     */
    public get99thPercentile(): number {
        return this.getPercentile(0.99);
    }

    /**
     * Calculate frame time standard deviation
     */
    public getStandardDeviation(): number {
        const history = this.getHistory();
        if (history.length === 0) {
            return 0;
        }

        const mean = this.getAverageFrameTime();
        const squareDiffs = history.map(value => {
            const diff = value - mean;
            return diff * diff;
        });

        const avgSquareDiff = squareDiffs.reduce((sum, value) => sum + value, 0) / history.length;
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * Reset the timer
     */
    public reset(): void {
        this.frameNumber = 0;
        this.currentFrameStart = 0;
        this.lastFrameEnd = 0;
        this.historyIndex = 0;
        this.historyFilled = false;
        this.spikeCount = 0;
        this.lastSpikeFrame = -1;
        this.frameTimeHistory.fill(0);
    }

    /**
     * Get timing statistics
     */
    public getStatistics(): {
        frameNumber: number;
        currentFPS: number;
        averageFPS: number;
        minFrameTime: number;
        maxFrameTime: number;
        averageFrameTime: number;
        standardDeviation: number;
        percentile95: number;
        percentile99: number;
        spikeCount: number;
        targetFPS: number;
        targetFrameTime: number;
    } {
        return {
            frameNumber: this.frameNumber,
            currentFPS: this.getFPS(),
            averageFPS: this.getAverageFPS(),
            minFrameTime: this.getMinFrameTime(),
            maxFrameTime: this.getMaxFrameTime(),
            averageFrameTime: this.getAverageFrameTime(),
            standardDeviation: this.getStandardDeviation(),
            percentile95: this.get95thPercentile(),
            percentile99: this.get99thPercentile(),
            spikeCount: this.spikeCount,
            targetFPS: this.targetFPS,
            targetFrameTime: this.targetFrameTime
        };
    }
}

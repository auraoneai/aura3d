/**
 * GPU profiling using WebGL timer queries
 *
 * Provides GPU timing per draw call, render pass timing,
 * GPU memory tracking, and pipeline statistics.
 */

/**
 * GPU timer query wrapper
 */
interface TimerQuery {
    query: WebGLQuery;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    resolved: boolean;
}

/**
 * GPU profiler configuration
 */
export interface GPUProfilerConfig {
    /** Enable GPU profiling */
    enabled?: boolean;
    /** Maximum number of pending queries */
    maxPendingQueries?: number;
}

/**
 * GPU timing result
 */
export interface GPUTimingResult {
    /** Query name */
    name: string;
    /** GPU time in milliseconds */
    gpuTime: number;
    /** Timestamp when query started */
    timestamp: number;
}

/**
 * GPU memory info
 */
export interface GPUMemoryInfo {
    /** Total memory in bytes (if available) */
    total?: number;
    /** Used memory in bytes (if available) */
    used?: number;
    /** Available memory in bytes (if available) */
    available?: number;
    /** Texture memory in bytes */
    textureMemory: number;
    /** Buffer memory in bytes */
    bufferMemory: number;
    /** Renderbuffer memory in bytes */
    renderbufferMemory: number;
}

/**
 * GPU profiler for WebGL.
 * Provides GPU timing using EXT_disjoint_timer_query or EXT_disjoint_timer_query_webgl2.
 *
 * @example
 * ```typescript
 * const profiler = new GPUProfiler(gl);
 *
 * // Begin GPU timing
 * profiler.beginQuery('Shadow Pass');
 * // ... GPU work ...
 * profiler.endQuery('Shadow Pass');
 *
 * // Poll for results
 * profiler.update();
 * const results = profiler.getResults();
 * ```
 */
export class GPUProfiler {
    private gl: WebGL2RenderingContext;
    private enabled: boolean = false;
    private maxPendingQueries: number;

    // Extension support
    private timerExt: any = null;
    private hasTimerQuerySupport: boolean = false;

    // Active queries
    private activeQueries: Map<string, TimerQuery> = new Map();
    private pendingQueries: TimerQuery[] = [];
    private completedResults: GPUTimingResult[] = [];

    // Memory tracking
    private textureMemory: number = 0;
    private bufferMemory: number = 0;
    private renderbufferMemory: number = 0;

    /**
     * Create a new GPU profiler
     */
    constructor(gl: WebGL2RenderingContext, config: GPUProfilerConfig = {}) {
        this.gl = gl;
        this.enabled = config.enabled !== false;
        this.maxPendingQueries = config.maxPendingQueries || 64;

        this.initializeExtensions();
    }

    /**
     * Initialize WebGL extensions
     */
    private initializeExtensions(): void {
        // Try WebGL2 timer query extension
        this.timerExt = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');

        if (!this.timerExt) {
            // Fallback to WebGL1 extension
            this.timerExt = this.gl.getExtension('EXT_disjoint_timer_query');
        }

        this.hasTimerQuerySupport = this.timerExt !== null;

        if (!this.hasTimerQuerySupport && this.enabled) {
            console.warn('GPUProfiler: Timer query extension not available. GPU profiling disabled.');
            this.enabled = false;
        }
    }

    /**
     * Check if GPU profiling is supported
     */
    public isSupported(): boolean {
        return this.hasTimerQuerySupport;
    }

    /**
     * Enable GPU profiling
     */
    public enable(): void {
        if (this.hasTimerQuerySupport) {
            this.enabled = true;
        }
    }

    /**
     * Disable GPU profiling
     */
    public disable(): void {
        this.enabled = false;
    }

    /**
     * Check if GPU profiling is enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Begin a GPU timer query
     */
    public beginQuery(name: string): void {
        if (!this.enabled || !this.hasTimerQuerySupport) {
            return;
        }

        // Check if we have too many pending queries
        if (this.pendingQueries.length >= this.maxPendingQueries) {
            console.warn(`GPUProfiler: Too many pending queries (${this.pendingQueries.length}). Skipping query "${name}".`);
            return;
        }

        // Check if query with this name is already active
        if (this.activeQueries.has(name)) {
            console.warn(`GPUProfiler: Query "${name}" is already active.`);
            return;
        }

        const query = this.gl.createQuery();
        if (!query) {
            console.error('GPUProfiler: Failed to create query.');
            return;
        }

        const timerQuery: TimerQuery = {
            query,
            name,
            startTime: 0,
            endTime: 0,
            duration: 0,
            resolved: false
        };

        this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, query);
        this.activeQueries.set(name, timerQuery);
    }

    /**
     * End a GPU timer query
     */
    public endQuery(name: string): void {
        if (!this.enabled || !this.hasTimerQuerySupport) {
            return;
        }

        const timerQuery = this.activeQueries.get(name);
        if (!timerQuery) {
            console.warn(`GPUProfiler: No active query found for "${name}".`);
            return;
        }

        this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
        this.activeQueries.delete(name);
        this.pendingQueries.push(timerQuery);
    }

    /**
     * Update and poll for query results
     */
    public update(): void {
        if (!this.enabled || !this.hasTimerQuerySupport) {
            return;
        }

        // Check for disjoint operation (GPU state lost)
        const disjoint = this.gl.getParameter(this.timerExt.GPU_DISJOINT_EXT);
        if (disjoint) {
            // Discard all pending queries
            this.pendingQueries.forEach(timerQuery => {
                this.gl.deleteQuery(timerQuery.query);
            });
            this.pendingQueries = [];
            console.warn('GPUProfiler: GPU disjoint operation detected. Discarding pending queries.');
            return;
        }

        // Poll pending queries
        const stillPending: TimerQuery[] = [];

        for (const timerQuery of this.pendingQueries) {
            const available = this.gl.getQueryParameter(
                timerQuery.query,
                this.gl.QUERY_RESULT_AVAILABLE
            );

            if (available) {
                const timeElapsed = this.gl.getQueryParameter(
                    timerQuery.query,
                    this.gl.QUERY_RESULT
                );

                // Convert nanoseconds to milliseconds
                const gpuTime = timeElapsed / 1000000;

                this.completedResults.push({
                    name: timerQuery.name,
                    gpuTime,
                    timestamp: performance.now()
                });

                timerQuery.duration = gpuTime;
                timerQuery.resolved = true;

                // Clean up query
                this.gl.deleteQuery(timerQuery.query);
            } else {
                stillPending.push(timerQuery);
            }
        }

        this.pendingQueries = stillPending;
    }

    /**
     * Get completed GPU timing results
     */
    public getResults(): GPUTimingResult[] {
        return [...this.completedResults];
    }

    /**
     * Get and clear completed GPU timing results
     */
    public pollResults(): GPUTimingResult[] {
        const results = this.completedResults;
        this.completedResults = [];
        return results;
    }

    /**
     * Clear all completed results
     */
    public clearResults(): void {
        this.completedResults = [];
    }

    /**
     * Track texture memory allocation
     */
    public trackTextureAllocation(width: number, height: number, format: number, type: number, levels: number = 1): void {
        const bytesPerPixel = this.getBytesPerPixel(format, type);
        let totalBytes = 0;

        for (let level = 0; level < levels; level++) {
            const levelWidth = Math.max(1, width >> level);
            const levelHeight = Math.max(1, height >> level);
            totalBytes += levelWidth * levelHeight * bytesPerPixel;
        }

        this.textureMemory += totalBytes;
    }

    /**
     * Track texture memory deallocation
     */
    public trackTextureFree(width: number, height: number, format: number, type: number, levels: number = 1): void {
        const bytesPerPixel = this.getBytesPerPixel(format, type);
        let totalBytes = 0;

        for (let level = 0; level < levels; level++) {
            const levelWidth = Math.max(1, width >> level);
            const levelHeight = Math.max(1, height >> level);
            totalBytes += levelWidth * levelHeight * bytesPerPixel;
        }

        this.textureMemory = Math.max(0, this.textureMemory - totalBytes);
    }

    /**
     * Track buffer memory allocation
     */
    public trackBufferAllocation(bytes: number): void {
        this.bufferMemory += bytes;
    }

    /**
     * Track buffer memory deallocation
     */
    public trackBufferFree(bytes: number): void {
        this.bufferMemory = Math.max(0, this.bufferMemory - bytes);
    }

    /**
     * Track renderbuffer memory allocation
     */
    public trackRenderbufferAllocation(width: number, height: number, format: number): void {
        const bytesPerPixel = this.getBytesPerPixelForRenderbuffer(format);
        const totalBytes = width * height * bytesPerPixel;
        this.renderbufferMemory += totalBytes;
    }

    /**
     * Track renderbuffer memory deallocation
     */
    public trackRenderbufferFree(width: number, height: number, format: number): void {
        const bytesPerPixel = this.getBytesPerPixelForRenderbuffer(format);
        const totalBytes = width * height * bytesPerPixel;
        this.renderbufferMemory = Math.max(0, this.renderbufferMemory - totalBytes);
    }

    /**
     * Get GPU memory info
     */
    public getMemoryInfo(): GPUMemoryInfo {
        const gl = this.gl;
        const memoryExt = gl.getExtension('WEBGL_debug_renderer_info');

        let total: number | undefined;
        let used: number | undefined;
        let available: number | undefined;

        // Try to get system memory info (not widely supported)
        if (memoryExt) {
            // This is just for demonstration; actual memory info is not available in WebGL
            // Some browsers might provide this through performance APIs
        }

        return {
            total,
            used,
            available,
            textureMemory: this.textureMemory,
            bufferMemory: this.bufferMemory,
            renderbufferMemory: this.renderbufferMemory
        };
    }

    /**
     * Get total tracked GPU memory in bytes
     */
    public getTotalMemory(): number {
        return this.textureMemory + this.bufferMemory + this.renderbufferMemory;
    }

    /**
     * Calculate bytes per pixel for texture format
     */
    private getBytesPerPixel(format: number, type: number): number {
        const gl = this.gl;

        // Simplified calculation - expand based on your needs
        switch (format) {
            case gl.RGBA:
                switch (type) {
                    case gl.UNSIGNED_BYTE: return 4;
                    case gl.FLOAT: return 16;
                    case gl.HALF_FLOAT: return 8;
                    default: return 4;
                }
            case gl.RGB:
                switch (type) {
                    case gl.UNSIGNED_BYTE: return 3;
                    case gl.FLOAT: return 12;
                    case gl.HALF_FLOAT: return 6;
                    default: return 3;
                }
            case gl.LUMINANCE_ALPHA:
                return 2;
            case gl.LUMINANCE:
            case gl.ALPHA:
                return 1;
            case gl.DEPTH_COMPONENT:
                return 4;
            case gl.DEPTH_STENCIL:
                return 4;
            default:
                return 4;
        }
    }

    /**
     * Calculate bytes per pixel for renderbuffer format
     */
    private getBytesPerPixelForRenderbuffer(format: number): number {
        const gl = this.gl;

        switch (format) {
            case gl.RGBA8:
            case gl.RGBA4:
            case gl.RGB5_A1:
            case gl.RGB565:
            case gl.DEPTH_COMPONENT16:
            case gl.DEPTH_COMPONENT24:
            case gl.DEPTH_COMPONENT32F:
            case gl.DEPTH24_STENCIL8:
            case gl.DEPTH32F_STENCIL8:
                return 4;
            default:
                return 4;
        }
    }

    /**
     * Reset memory tracking
     */
    public resetMemoryTracking(): void {
        this.textureMemory = 0;
        this.bufferMemory = 0;
        this.renderbufferMemory = 0;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Delete all pending queries
        this.pendingQueries.forEach(timerQuery => {
            this.gl.deleteQuery(timerQuery.query);
        });

        this.pendingQueries = [];
        this.activeQueries.clear();
        this.completedResults = [];
    }
}

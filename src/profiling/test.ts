/**
 * G3D 5.0 Profiling Module - Integration Test
 *
 * Demonstrates all features working together in a complete example.
 */

import {
    Profiler,
    ProfileMarker,
    ScopeMarker,
    CounterMarker,
    CounterName,
    MarkerCategory,
    ProfilerOverlay,
    FrameGraph,
    FlameGraph,
    TimelineView,
    ChromeTraceExporter,
    JSONExporter,
    GPUProfiler,
    MemoryProfiler,
    MemoryPressureLevel
} from './index';

/**
 * Complete profiling integration test
 */
export class ProfilingIntegrationTest {
    private overlay: ProfilerOverlay | null = null;
    private memoryProfiler: MemoryProfiler;
    private gpuProfiler: GPUProfiler | null = null;
    private running: boolean = false;

    constructor() {
        this.memoryProfiler = new MemoryProfiler({ enabled: true });
    }

    /**
     * Initialize profiling system
     */
    public initialize(gl?: WebGL2RenderingContext): void {
        console.log('Initializing G3D Profiling System...');

        // Enable profiling
        Profiler.enable();

        // Start session
        Profiler.startSession('Integration Test');

        // Create overlay
        this.overlay = new ProfilerOverlay({
            position: 'top-right',
            mode: 'detailed',
            enableF3Toggle: true,
            showFPS: true,
            showFrameTime: true,
            showMemory: true,
            showCounters: true
        });

        this.overlay.show();

        // Start memory profiling
        this.memoryProfiler.start();

        // Initialize GPU profiling if WebGL context provided
        if (gl) {
            this.gpuProfiler = new GPUProfiler(gl, { enabled: true });

            if (this.gpuProfiler.isSupported()) {
                console.log('GPU profiling enabled');
            } else {
                console.warn('GPU profiling not supported');
                this.gpuProfiler = null;
            }
        }

        console.log('Profiling system initialized');
        console.log('Press F3 to toggle overlay');
    }

    /**
     * Simulate a game loop
     */
    public start(): void {
        this.running = true;
        this.gameLoop();
    }

    /**
     * Stop the test
     */
    public stop(): void {
        this.running = false;
    }

    /**
     * Main game loop
     */
    private gameLoop(): void {
        if (!this.running) {
            return;
        }

        // Begin frame
        Profiler.beginFrame();
        CounterMarker.beginFrame();

        // Frame marker
        const frameScope = new ScopeMarker('Frame');

        // Update phase
        this.update();

        // Render phase
        this.render();

        // Dispose frame marker
        frameScope.dispose();

        // Check memory pressure
        this.checkMemoryPressure();

        // End frame
        Profiler.endFrame();

        // Update overlay
        if (this.overlay) {
            this.overlay.update();
        }

        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }

    /**
     * Update phase
     */
    private update(): void {
        const updateScope = new ScopeMarker('Update');

        // Physics
        ProfileMarker.begin('Physics', { category: MarkerCategory.PHYSICS });
        this.simulateWork(2, 5);
        ProfileMarker.end('Physics');

        // Animation
        ProfileMarker.begin('Animation', { category: MarkerCategory.ANIMATION });
        this.simulateWork(1, 3);
        ProfileMarker.end('Animation');

        // AI
        ProfileMarker.begin('AI', { category: MarkerCategory.AI });
        this.simulateWork(1, 4);
        ProfileMarker.end('AI');

        // Input
        ProfileMarker.begin('Input', { category: MarkerCategory.INPUT });
        this.simulateWork(0.5, 1);
        ProfileMarker.end('Input');

        updateScope.dispose();
    }

    /**
     * Render phase
     */
    private render(): void {
        const renderScope = new ScopeMarker('Render');

        // Shadow pass
        ProfileMarker.begin('Shadow Pass', { category: MarkerCategory.RENDERING });

        if (this.gpuProfiler) {
            this.gpuProfiler.beginQuery('Shadow Pass');
        }

        this.simulateRenderPass(50, 100);

        if (this.gpuProfiler) {
            this.gpuProfiler.endQuery('Shadow Pass');
        }

        ProfileMarker.end('Shadow Pass');

        // Main pass
        ProfileMarker.begin('Main Pass', { category: MarkerCategory.RENDERING });

        if (this.gpuProfiler) {
            this.gpuProfiler.beginQuery('Main Pass');
        }

        this.simulateRenderPass(200, 300);

        if (this.gpuProfiler) {
            this.gpuProfiler.endQuery('Main Pass');
        }

        ProfileMarker.end('Main Pass');

        // Post processing
        ProfileMarker.begin('Post Processing', { category: MarkerCategory.RENDERING });

        if (this.gpuProfiler) {
            this.gpuProfiler.beginQuery('Post Processing');
        }

        this.simulateWork(1, 2);

        if (this.gpuProfiler) {
            this.gpuProfiler.endQuery('Post Processing');
        }

        ProfileMarker.end('Post Processing');

        // UI
        ProfileMarker.begin('UI', { category: MarkerCategory.UI });
        this.simulateWork(0.5, 1);
        ProfileMarker.end('UI');

        // Update GPU profiler
        if (this.gpuProfiler) {
            this.gpuProfiler.update();
            const results = this.gpuProfiler.pollResults();

            for (const result of results) {
                console.log(`GPU ${result.name}: ${result.gpuTime.toFixed(2)}ms`);
            }
        }

        renderScope.dispose();
    }

    /**
     * Simulate render pass with draw calls
     */
    private simulateRenderPass(minDrawCalls: number, maxDrawCalls: number): void {
        const drawCalls = Math.floor(Math.random() * (maxDrawCalls - minDrawCalls) + minDrawCalls);

        for (let i = 0; i < drawCalls; i++) {
            CounterMarker.increment(CounterName.DRAW_CALLS);
            CounterMarker.increment(CounterName.TRIANGLES, Math.floor(Math.random() * 1000 + 500));
            CounterMarker.increment(CounterName.VERTICES, Math.floor(Math.random() * 3000 + 1500));

            // Simulate small draw call overhead
            this.simulateWork(0.01, 0.05);
        }
    }

    /**
     * Simulate work for a random duration
     */
    private simulateWork(minMs: number, maxMs: number): void {
        const duration = Math.random() * (maxMs - minMs) + minMs;
        const start = performance.now();

        while (performance.now() - start < duration) {
            // Busy wait
        }
    }

    /**
     * Check memory pressure
     */
    private checkMemoryPressure(): void {
        const pressure = this.memoryProfiler.getMemoryPressure();

        if (pressure === MemoryPressureLevel.HIGH) {
            console.warn('High memory pressure detected');
        } else if (pressure === MemoryPressureLevel.CRITICAL) {
            console.error('Critical memory pressure!');
            this.memoryProfiler.suggestGarbageCollection();
        }
    }

    /**
     * Generate visualizations
     */
    public generateVisualizations(): void {
        console.log('Generating visualizations...');

        const session = Profiler.getSession();
        if (!session) {
            console.error('No active profiling session');
            return;
        }

        // Frame graph
        const frameGraphContainer = document.getElementById('frame-graph');
        if (frameGraphContainer) {
            console.log('Creating frame graph...');
            const frameGraph = new FrameGraph({
                container: frameGraphContainer,
                width: 800,
                height: 200,
                targetFPS: 60
            });

            const timer = Profiler.getFrameTimer();
            frameGraph.update(timer);
        }

        // Flame graph
        const flameGraphContainer = document.getElementById('flame-graph');
        if (flameGraphContainer) {
            console.log('Creating flame graph...');
            const flameGraph = new FlameGraph({
                container: flameGraphContainer,
                width: 1200,
                height: 600,
                enableSearch: true,
                enableZoom: true,
                colorScheme: 'category'
            });

            flameGraph.setData(session);
        }

        // Timeline view
        const timelineContainer = document.getElementById('timeline');
        if (timelineContainer) {
            console.log('Creating timeline view...');
            const timeline = new TimelineView({
                container: timelineContainer,
                width: 1200,
                height: 400,
                enableSelection: true
            });

            timeline.setData(session);
        }

        console.log('Visualizations created');
    }

    /**
     * Export profiling data
     */
    public exportData(): void {
        console.log('Exporting profiling data...');

        const session = Profiler.getSession();
        if (!session) {
            console.error('No active profiling session');
            return;
        }

        // Stop session
        Profiler.stopSession();

        // Get statistics
        const stats = session.getStatistics();
        console.log('Session Statistics:');
        console.log(`  Total Frames: ${stats.totalFrames}`);
        console.log(`  Average FPS: ${stats.averageFPS.toFixed(2)}`);
        console.log(`  Average Frame Time: ${stats.averageFrameTime.toFixed(2)}ms`);
        console.log(`  Min Frame Time: ${stats.minFrameTime.toFixed(2)}ms`);
        console.log(`  Max Frame Time: ${stats.maxFrameTime.toFixed(2)}ms`);
        console.log(`  95th Percentile: ${stats.percentile95.toFixed(2)}ms`);
        console.log(`  99th Percentile: ${stats.percentile99.toFixed(2)}ms`);

        // Export to Chrome trace format
        console.log('Exporting to Chrome trace format...');
        ChromeTraceExporter.exportToFile(session, 'profile-trace.json');

        // Export to JSON
        console.log('Exporting to JSON...');
        JSONExporter.exportToFile(session, 'profile-data.json', {
            prettyPrint: true,
            includeFrames: true,
            includeStatistics: true
        });

        // Export to CSV
        console.log('Exporting to CSV...');
        JSONExporter.exportCSVToFile(session, 'profile-frames.csv');

        // Export scope statistics
        const scopeCSV = JSONExporter.exportScopeStatsToCSV(session);
        console.log('Scope Statistics (CSV):');
        console.log(scopeCSV);

        // Memory statistics
        const memStats = this.memoryProfiler.getStatistics();
        console.log('Memory Statistics:');
        console.log(`  Current Usage: ${(memStats.current.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Texture Memory: ${(memStats.textureMemory / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Buffer Memory: ${(memStats.bufferMemory / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Growth Rate: ${(memStats.growthRate / 1024 / 1024).toFixed(2)} MB/s`);
        console.log(`  Memory Pressure: ${memStats.pressure}`);

        if (memStats.leakDetection.suspected) {
            console.warn(`  ${memStats.leakDetection.message}`);
        }

        console.log('Export complete!');
        console.log('Files saved:');
        console.log('  - profile-trace.json (open in chrome://tracing)');
        console.log('  - profile-data.json');
        console.log('  - profile-frames.csv');
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.running = false;

        if (this.overlay) {
            this.overlay.dispose();
        }

        this.memoryProfiler.dispose();

        if (this.gpuProfiler) {
            this.gpuProfiler.dispose();
        }

        console.log('Profiling system disposed');
    }
}

/**
 * Run the integration test
 */
export function runIntegrationTest(gl?: WebGL2RenderingContext): ProfilingIntegrationTest {
    console.log('=== G3D 5.0 Profiling Integration Test ===');

    const test = new ProfilingIntegrationTest();
    test.initialize(gl);
    test.start();

    // Run for 10 seconds then generate visualizations and export
    setTimeout(() => {
        test.stop();
        test.generateVisualizations();
        test.exportData();
        test.dispose();
    }, 10000);

    return test;
}

// Auto-run if executed directly
if (typeof window !== 'undefined') {
    (window as any).runProfilingTest = runIntegrationTest;
    console.log('Profiling test available. Call runProfilingTest() to start.');
}

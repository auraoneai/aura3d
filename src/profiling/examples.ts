/**
 * G3D 5.0 Profiling Module - Usage Examples
 *
 * Comprehensive examples demonstrating all profiling features.
 */

import {
    Profiler,
    ProfileMarker,
    ScopeMarker,
    CounterMarker,
    ProfilerOverlay,
    FrameGraph,
    FlameGraph,
    TimelineView,
    ChromeTraceExporter,
    JSONExporter,
    GPUProfiler,
    MemoryProfiler,
    ProfileMethod,
    ProfileAsyncMethod,
    scoped,
    scopedAsync
} from './index';
import type {
    CounterName,
    MarkerCategory,
    MarkerColor,
    MemoryPressureLevel
} from './index';

// Import enums directly from their source files since they're exported as types in index
import { CounterName as CounterNameEnum } from './markers/CounterMarker';
import { MarkerCategory as MarkerCategoryEnum, MarkerColor as MarkerColorEnum } from './markers/ProfileMarker';
import { MemoryPressureLevel as MemoryPressureLevelEnum } from './MemoryProfiler';

/**
 * Example 1: Basic Profiling
 */
export function basicProfilingExample() {
    // Enable profiling
    Profiler.enable();

    // Start a session
    Profiler.startSession('Basic Example');

    // Game loop
    function gameLoop() {
        Profiler.beginFrame();

        // Update
        ProfileMarker.begin('Update');
        update();
        ProfileMarker.end('Update');

        // Render
        ProfileMarker.begin('Render');
        render();
        ProfileMarker.end('Render');

        Profiler.endFrame();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();

    // After some time, get results
    setTimeout(() => {
        const session = Profiler.getSession();
        if (session) {
            const stats = session.getStatistics();
            console.log(`Average FPS: ${stats.averageFPS.toFixed(1)}`);
            console.log(`Average Frame Time: ${stats.averageFrameTime.toFixed(2)}ms`);
        }
    }, 5000);
}

/**
 * Example 2: Hierarchical Profiling
 */
export function hierarchicalProfilingExample() {
    Profiler.enable();
    Profiler.startSession('Hierarchical Example');

    function gameLoop() {
        Profiler.beginFrame();

        // Top-level frame marker
        ProfileMarker.begin('Frame', {
            category: MarkerCategoryEnum.CUSTOM,
            color: MarkerColorEnum.WHITE
        });

        // Update phase
        ProfileMarker.begin('Update', {
            category: MarkerCategoryEnum.CUSTOM,
            color: MarkerColorEnum.GREEN
        });

        ProfileMarker.begin('Physics', { category: MarkerCategoryEnum.PHYSICS });
        updatePhysics();
        ProfileMarker.end('Physics');

        ProfileMarker.begin('Animation', { category: MarkerCategoryEnum.ANIMATION });
        updateAnimations();
        ProfileMarker.end('Animation');

        ProfileMarker.begin('AI', { category: MarkerCategoryEnum.AI });
        updateAI();
        ProfileMarker.end('AI');

        ProfileMarker.end('Update');

        // Render phase
        ProfileMarker.begin('Render', {
            category: MarkerCategoryEnum.RENDERING,
            color: MarkerColorEnum.BLUE
        });

        ProfileMarker.begin('Shadow Pass', { category: MarkerCategoryEnum.RENDERING });
        renderShadows();
        ProfileMarker.end('Shadow Pass');

        ProfileMarker.begin('Main Pass', { category: MarkerCategoryEnum.RENDERING });
        renderMain();
        ProfileMarker.end('Main Pass');

        ProfileMarker.begin('Post Processing', { category: MarkerCategoryEnum.RENDERING });
        renderPostProcess();
        ProfileMarker.end('Post Processing');

        ProfileMarker.end('Render');

        ProfileMarker.end('Frame');

        Profiler.endFrame();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();
}

/**
 * Example 3: RAII-Style Scopes
 */
export function scopeMarkersExample() {
    Profiler.enable();
    Profiler.startSession('Scope Markers Example');

    function render() {
        const renderScope = new ScopeMarker('Render');

        {
            const shadowScope = new ScopeMarker('Shadow Pass');
            renderShadows();
            shadowScope.dispose();
        }

        {
            const mainScope = new ScopeMarker('Main Pass');
            renderMain();
            // Automatically disposed at scope exit
        }
    }

    // Using scoped helper
    function update() {
        scoped('Update', () => {
            scoped('Physics', () => updatePhysics());
            scoped('Animation', () => updateAnimations());
        });
    }

    // Async scoped
    async function loadLevel() {
        await scopedAsync('Load Level', async () => {
            await scopedAsync('Load Textures', async () => {
                await loadTextures();
            });

            await scopedAsync('Load Models', async () => {
                await loadModels();
            });
        });
    }
}

/**
 * Example 4: Counter Tracking
 */
export function counterTrackingExample() {
    Profiler.enable();
    Profiler.startSession('Counter Tracking Example');

    function gameLoop() {
        Profiler.beginFrame();
        CounterMarker.beginFrame();

        // Render
        ProfileMarker.begin('Render');

        for (const object of getVisibleObjects()) {
            CounterMarker.increment(CounterNameEnum.DRAW_CALLS);
            CounterMarker.increment(CounterNameEnum.TRIANGLES, object.triangleCount);
            CounterMarker.increment(CounterNameEnum.VERTICES, object.vertexCount);

            drawObject(object);
        }

        ProfileMarker.end('Render');

        // Get counter values
        const drawCalls = CounterMarker.get(CounterNameEnum.DRAW_CALLS);
        const triangles = CounterMarker.get(CounterNameEnum.TRIANGLES);

        console.log(`Draw Calls: ${drawCalls}, Triangles: ${triangles}`);

        Profiler.endFrame();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();

    // Check statistics after some time
    setTimeout(() => {
        const stats = CounterMarker.getStatistics(CounterNameEnum.DRAW_CALLS);
        console.log(`Average draw calls: ${stats.average.toFixed(0)}`);
        console.log(`Max draw calls: ${stats.max}`);
    }, 5000);
}

/**
 * Example 5: GPU Profiling
 */
export function gpuProfilingExample(gl: WebGL2RenderingContext) {
    const gpuProfiler = new GPUProfiler(gl, { enabled: true });

    if (!gpuProfiler.isSupported()) {
        console.warn('GPU profiling not supported');
        return;
    }

    function render() {
        // Shadow pass
        gpuProfiler.beginQuery('Shadow Pass');
        renderShadows();
        gpuProfiler.endQuery('Shadow Pass');

        // Main pass
        gpuProfiler.beginQuery('Main Pass');
        renderMain();
        gpuProfiler.endQuery('Main Pass');

        // Post processing
        gpuProfiler.beginQuery('Post Processing');
        renderPostProcess();
        gpuProfiler.endQuery('Post Processing');

        // Poll results
        gpuProfiler.update();
        const results = gpuProfiler.pollResults();

        for (const result of results) {
            console.log(`${result.name}: ${result.gpuTime.toFixed(2)}ms`);
        }
    }

    // Track GPU memory
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gpuProfiler.trackTextureAllocation(1024, 1024, gl.RGBA, gl.UNSIGNED_BYTE);

    const memInfo = gpuProfiler.getMemoryInfo();
    console.log(`Texture memory: ${(memInfo.textureMemory / 1024 / 1024).toFixed(2)}MB`);
}

/**
 * Example 6: Memory Profiling
 */
export function memoryProfilingExample() {
    const memProfiler = new MemoryProfiler({
        enabled: true,
        snapshotInterval: 1000,
        maxSnapshots: 300
    });

    memProfiler.start();

    // Track allocations
    function createTexture(width: number, height: number) {
        const size = width * height * 4; // RGBA
        memProfiler.trackAllocation('Texture', size);

        // Track texture memory
        memProfiler.trackTextureMemory(size);

        return { width, height, size };
    }

    // Check memory pressure
    function gameLoop() {
        const pressure = memProfiler.getMemoryPressure();

        if (pressure === MemoryPressureLevelEnum.HIGH) {
            console.warn('High memory pressure! Reducing quality...');
            reduceQuality();
        }

        if (pressure === MemoryPressureLevelEnum.CRITICAL) {
            console.error('Critical memory pressure! Unloading assets...');
            unloadAssets();
            memProfiler.suggestGarbageCollection();
        }

        requestAnimationFrame(gameLoop);
    }

    gameLoop();

    // Check for memory leaks
    setInterval(() => {
        const leak = memProfiler.detectMemoryLeaks();
        if (leak.suspected) {
            console.warn(leak.message);
        }

        const stats = memProfiler.getStatistics();
        console.log(`Memory growth rate: ${(stats.growthRate / 1024 / 1024).toFixed(2)} MB/s`);
    }, 10000);
}

/**
 * Example 7: On-Screen Overlay
 */
export function overlayExample() {
    Profiler.enable();
    Profiler.startSession('Overlay Example');

    // Create overlay
    const overlay = new ProfilerOverlay({
        position: 'top-right',
        mode: 'detailed',
        enableF3Toggle: true,
        showFPS: true,
        showFrameTime: true,
        showMemory: true,
        showCounters: true
    });

    overlay.show();

    // Game loop
    function gameLoop() {
        Profiler.beginFrame();
        CounterMarker.beginFrame();

        // ... game logic ...

        Profiler.endFrame();

        // Update overlay
        overlay.update();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();

    // The overlay can be toggled with F3 key
}

/**
 * Example 8: Visualizations
 */
export function visualizationsExample() {
    Profiler.enable();
    Profiler.startSession('Visualizations Example');

    // Run profiling for a while
    function gameLoop() {
        Profiler.beginFrame();
        ProfileMarker.begin('Update');
        update();
        ProfileMarker.end('Update');
        ProfileMarker.begin('Render');
        render();
        ProfileMarker.end('Render');
        Profiler.endFrame();
    }

    const interval = setInterval(gameLoop, 16);

    // After collecting data, create visualizations
    setTimeout(() => {
        clearInterval(interval);

        const session = Profiler.getSession();
        if (!session) return;

        // Frame graph
        const frameGraphContainer = document.getElementById('frame-graph');
        if (frameGraphContainer) {
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
            const timeline = new TimelineView({
                container: timelineContainer,
                width: 1200,
                height: 400,
                enableSelection: true
            });

            timeline.setData(session);
        }
    }, 5000);
}

/**
 * Example 9: Export to Chrome Tracing
 */
export function chromeTraceExportExample() {
    Profiler.enable();
    Profiler.startSession('Chrome Trace Export Example');

    // Run profiling
    function gameLoop() {
        Profiler.beginFrame();
        ProfileMarker.begin('Update');
        update();
        ProfileMarker.end('Update');
        ProfileMarker.begin('Render');
        render();
        ProfileMarker.end('Render');
        Profiler.endFrame();
    }

    const interval = setInterval(gameLoop, 16);

    // After some time, export
    setTimeout(() => {
        clearInterval(interval);

        const session = Profiler.getSession();
        if (!session) return;

        // Export to Chrome trace format
        ChromeTraceExporter.exportToFile(session, 'profile.json');

        // To view:
        // 1. Open Chrome
        // 2. Go to chrome://tracing
        // 3. Click "Load" and select profile.json
    }, 5000);
}

/**
 * Example 10: JSON Export and Analysis
 */
export function jsonExportExample() {
    Profiler.enable();
    Profiler.startSession('JSON Export Example');

    // Run profiling
    function gameLoop() {
        Profiler.beginFrame();
        ProfileMarker.begin('Update');
        update();
        ProfileMarker.end('Update');
        ProfileMarker.begin('Render');
        render();
        ProfileMarker.end('Render');
        Profiler.endFrame();
    }

    const interval = setInterval(gameLoop, 16);

    setTimeout(() => {
        clearInterval(interval);

        const session = Profiler.getSession();
        if (!session) return;

        // Full export
        const fullJson = JSONExporter.export(session, {
            prettyPrint: true,
            includeFrames: true,
            includeStatistics: true,
            maxFrames: 300
        });

        console.log('Full export:', fullJson);

        // Compact export
        const compact = JSONExporter.exportCompact(session);
        console.log('Compact export:', compact);

        // Statistics only
        const stats = JSONExporter.exportStatistics(session);
        console.log('Statistics:', stats);

        // CSV export
        const csv = JSONExporter.exportToCSV(session);
        console.log('CSV:', csv);

        // Save to file
        JSONExporter.exportToFile(session, 'profile.json');
        JSONExporter.exportCSVToFile(session, 'profile.csv');
    }, 5000);
}

/**
 * Example 11: Class-Based Profiling
 *
 * Note: Decorator usage requires 'experimentalDecorators' in tsconfig.json
 * This example shows manual profiling approach that works without decorators.
 */
export class RendererExample {
    public render(): void {
        ProfileMarker.begin('RendererExample.render', { category: MarkerCategoryEnum.RENDERING });
        this.renderShadows();
        this.renderMain();
        this.renderPostProcess();
        ProfileMarker.end('RendererExample.render');
    }

    private renderShadows(): void {
        ProfileMarker.begin('RendererExample.renderShadows', { category: MarkerCategoryEnum.RENDERING });
        // Shadow rendering code
        ProfileMarker.end('RendererExample.renderShadows');
    }

    private renderMain(): void {
        ProfileMarker.begin('RendererExample.renderMain', { category: MarkerCategoryEnum.RENDERING });
        // Main rendering code
        ProfileMarker.end('RendererExample.renderMain');
    }

    private renderPostProcess(): void {
        ProfileMarker.begin('RendererExample.renderPostProcess', { category: MarkerCategoryEnum.RENDERING });
        // Post-processing code
        ProfileMarker.end('RendererExample.renderPostProcess');
    }

    public async loadTexture(path: string): Promise<void> {
        ProfileMarker.begin('RendererExample.loadTexture', { category: MarkerCategoryEnum.LOADING });
        // Async loading code
        await new Promise(resolve => setTimeout(resolve, 100));
        ProfileMarker.end('RendererExample.loadTexture');
    }
}

/**
 * Example 11b: Decorator Usage (Commented Out)
 *
 * To use decorators, add to tsconfig.json compilerOptions:
 * "experimentalDecorators": true
 *
 * Then uncomment this example:
 */
/*
export class RendererExampleWithDecorators {
    @ProfileMethod({ category: MarkerCategoryEnum.RENDERING })
    public render(): void {
        this.renderShadows();
        this.renderMain();
        this.renderPostProcess();
    }

    @ProfileMethod({ category: MarkerCategoryEnum.RENDERING })
    private renderShadows(): void {
        // Shadow rendering code
    }

    @ProfileMethod({ category: MarkerCategoryEnum.RENDERING })
    private renderMain(): void {
        // Main rendering code
    }

    @ProfileMethod({ category: MarkerCategoryEnum.RENDERING })
    private renderPostProcess(): void {
        // Post-processing code
    }

    @ProfileAsyncMethod({ category: MarkerCategoryEnum.LOADING })
    public async loadTexture(path: string): Promise<void> {
        // Async loading code
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
*/

/**
 * Example 12: Performance Comparison
 */
export function performanceComparisonExample() {
    // Baseline session
    Profiler.enable();
    Profiler.startSession('Baseline');

    function gameLoop1() {
        Profiler.beginFrame();
        ProfileMarker.begin('Update');
        update();
        ProfileMarker.end('Update');
        ProfileMarker.begin('Render');
        renderOldMethod();
        ProfileMarker.end('Render');
        Profiler.endFrame();
    }

    const interval1 = setInterval(gameLoop1, 16);

    setTimeout(() => {
        clearInterval(interval1);
        const session1 = Profiler.getSession();

        // Optimized session
        Profiler.startSession('Optimized');

        function gameLoop2() {
            Profiler.beginFrame();
            ProfileMarker.begin('Update');
            update();
            ProfileMarker.end('Update');
            ProfileMarker.begin('Render');
            renderNewMethod();
            ProfileMarker.end('Render');
            Profiler.endFrame();
        }

        const interval2 = setInterval(gameLoop2, 16);

        setTimeout(() => {
            clearInterval(interval2);
            const session2 = Profiler.getSession();

            if (session1 && session2) {
                // Compare sessions
                const comparison = JSONExporter.exportComparison(session1, session2);
                console.log('Performance comparison:', comparison);
            }
        }, 5000);
    }, 5000);
}

// Dummy functions for examples
function update() { /* ... */ }
function render() { /* ... */ }
function renderShadows() { /* ... */ }
function renderMain() { /* ... */ }
function renderPostProcess() { /* ... */ }
function updatePhysics() { /* ... */ }
function updateAnimations() { /* ... */ }
function updateAI() { /* ... */ }
function loadTextures() { return Promise.resolve(); }
function loadModels() { return Promise.resolve(); }
function getVisibleObjects(): Array<{ triangleCount: number; vertexCount: number }> { return []; }
function drawObject(obj: any) { /* ... */ }
function reduceQuality() { /* ... */ }
function unloadAssets() { /* ... */ }
function renderOldMethod() { /* ... */ }
function renderNewMethod() { /* ... */ }

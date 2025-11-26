# G3D 5.0 Profiling - Quick Start Guide

Get started with profiling in 5 minutes!

## 1. Basic Setup (30 seconds)

```typescript
import { Profiler, ProfileMarker, ProfilerOverlay } from './profiling';

// Enable profiling
Profiler.enable();
Profiler.startSession('My Game');

// Show on-screen overlay (toggle with F3)
const overlay = new ProfilerOverlay();
overlay.show();
```

## 2. Profile Your Game Loop (2 minutes)

```typescript
function gameLoop() {
    // Begin frame
    Profiler.beginFrame();

    // Profile update
    ProfileMarker.begin('Update');
    update();
    ProfileMarker.end('Update');

    // Profile render
    ProfileMarker.begin('Render');
    render();
    ProfileMarker.end('Render');

    // End frame
    Profiler.endFrame();

    // Update overlay
    overlay.update();

    requestAnimationFrame(gameLoop);
}
```

## 3. Profile Nested Operations (1 minute)

```typescript
function render() {
    ProfileMarker.begin('Render');

    // Shadow pass
    ProfileMarker.begin('Shadow Pass');
    renderShadows();
    ProfileMarker.end('Shadow Pass');

    // Main pass
    ProfileMarker.begin('Main Pass');
    renderMain();
    ProfileMarker.end('Main Pass');

    // Post processing
    ProfileMarker.begin('Post Processing');
    renderPostProcess();
    ProfileMarker.end('Post Processing');

    ProfileMarker.end('Render');
}
```

## 4. Export Results (30 seconds)

```typescript
// Get profiling session
const session = Profiler.getSession();

// Export to Chrome trace format (open in chrome://tracing)
import { ChromeTraceExporter } from './profiling';
ChromeTraceExporter.exportToFile(session, 'profile.json');

// Export to JSON
import { JSONExporter } from './profiling';
JSONExporter.exportToFile(session, 'profile-data.json');
```

## 5. View Results

### Option A: Chrome Tracing
1. Open Chrome browser
2. Go to `chrome://tracing`
3. Click "Load" and select `profile.json`
4. Explore your flame graph!

### Option B: On-Screen Overlay
- Press **F3** to toggle the overlay
- Shows FPS, frame time, memory usage
- Real-time performance monitoring

### Option C: Programmatic Analysis
```typescript
const stats = session.getStatistics();
console.log(`Average FPS: ${stats.averageFPS.toFixed(1)}`);
console.log(`Average Frame Time: ${stats.averageFrameTime.toFixed(2)}ms`);
console.log(`95th Percentile: ${stats.percentile95.toFixed(2)}ms`);
```

## Advanced Features

### RAII-Style Scopes
```typescript
import { ScopeMarker } from './profiling';

function render() {
    const scope = new ScopeMarker('Render');
    // ... code ...
    // Automatically ends when function returns
}
```

### Counter Tracking
```typescript
import { CounterMarker, CounterName } from './profiling';

function render() {
    CounterMarker.beginFrame();

    for (const object of objects) {
        CounterMarker.increment(CounterName.DRAW_CALLS);
        CounterMarker.increment(CounterName.TRIANGLES, object.triangleCount);
        drawObject(object);
    }
}
```

### GPU Profiling
```typescript
import { GPUProfiler } from './profiling';

const gpuProfiler = new GPUProfiler(gl);

gpuProfiler.beginQuery('Render Pass');
// ... GPU work ...
gpuProfiler.endQuery('Render Pass');

gpuProfiler.update();
const results = gpuProfiler.getResults();
```

### Memory Profiling
```typescript
import { MemoryProfiler, MemoryPressureLevel } from './profiling';

const memProfiler = new MemoryProfiler();
memProfiler.start();

// Check memory pressure
if (memProfiler.getMemoryPressure() === MemoryPressureLevel.HIGH) {
    console.warn('High memory pressure!');
}
```

### Visualizations
```typescript
import { FlameGraph, FrameGraph, TimelineView } from './profiling';

// Flame graph
const flameGraph = new FlameGraph({
    container: document.getElementById('flame-graph'),
    enableSearch: true,
    enableZoom: true
});
flameGraph.setData(session);

// Frame graph
const frameGraph = new FrameGraph({
    container: document.getElementById('frame-graph'),
    targetFPS: 60
});
frameGraph.update(Profiler.getFrameTimer());

// Timeline view
const timeline = new TimelineView({
    container: document.getElementById('timeline'),
    enableSelection: true
});
timeline.setData(session);
```

## Complete Example

```typescript
import {
    Profiler,
    ProfileMarker,
    ProfilerOverlay,
    CounterMarker,
    CounterName,
    ChromeTraceExporter
} from './profiling';

// Setup
Profiler.enable();
Profiler.startSession('My Game');

const overlay = new ProfilerOverlay({ position: 'top-right' });
overlay.show();

// Game loop
function gameLoop() {
    Profiler.beginFrame();
    CounterMarker.beginFrame();

    // Update
    ProfileMarker.begin('Update');
    update();
    ProfileMarker.end('Update');

    // Render
    ProfileMarker.begin('Render');
    for (const object of objects) {
        CounterMarker.increment(CounterName.DRAW_CALLS);
        CounterMarker.increment(CounterName.TRIANGLES, object.triangleCount);
        drawObject(object);
    }
    ProfileMarker.end('Render');

    Profiler.endFrame();
    overlay.update();

    requestAnimationFrame(gameLoop);
}

gameLoop();

// Export after 10 seconds
setTimeout(() => {
    const session = Profiler.getSession();
    ChromeTraceExporter.exportToFile(session, 'profile.json');
    console.log('Profile exported! Open profile.json in chrome://tracing');
}, 10000);
```

## Tips

1. **Press F3** to toggle the overlay during development
2. **Profile selectively** - don't profile every function
3. **Use categories** to organize markers by system
4. **Export regularly** to catch performance regressions
5. **Check chrome://tracing** for detailed analysis
6. **Monitor memory** to catch leaks early
7. **Track counters** for draw calls and triangles
8. **Disable in production** - `Profiler.disable()`

## Next Steps

- Read the [full documentation](./README.md)
- Explore [examples](./examples.ts)
- Run the [integration test](./test.ts)
- Check the API reference in individual files

## Performance Notes

- Overhead when **enabled**: ~0.05ms per frame
- Overhead when **disabled**: <0.01ms per frame
- Recommended for development builds only
- Production builds should disable profiling

## Support

For detailed API documentation, see:
- `Profiler.ts` - Main profiler API
- `ProfileMarker.ts` - Marker API
- `ProfilerOverlay.ts` - Overlay API
- `ChromeTraceExporter.ts` - Export API

Happy profiling!

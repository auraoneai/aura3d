# G3D 5.0 Profiling & Debugging Module

Complete profiling system for the G3D game engine with CPU/GPU timing, memory tracking, visualization, and export functionality.

## Features

- **Low Overhead**: < 0.1ms when disabled
- **CPU Profiling**: High-precision frame timing with hierarchical scopes
- **GPU Profiling**: WebGL timer queries for GPU timing
- **Memory Profiling**: JavaScript heap and GPU memory tracking
- **Visualization**: On-screen overlay, frame graphs, flame graphs, timeline view
- **Export**: Chrome trace format and JSON export
- **Markers**: Named markers, scopes, and counters

## Quick Start

```typescript
import {
  Profiler,
  ProfileMarker,
  ProfilerOverlay,
  ChromeTraceExporter
} from './profiling';

// Enable profiling
Profiler.enable();
Profiler.startSession('Game Session');

// Profile code
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

// Show overlay (toggle with F3)
const overlay = new ProfilerOverlay({ position: 'top-right' });
overlay.show();

// Update overlay in game loop
function gameLoop() {
  // ... profiling code ...
  overlay.update();
}

// Export results
const session = Profiler.getSession();
ChromeTraceExporter.exportToFile(session, 'profile.json');
```

## Core Components

### Profiler

Main profiler singleton for global profiling control.

```typescript
// Enable/disable profiling
Profiler.enable();
Profiler.disable();

// Start/stop session
Profiler.startSession('My Session');
Profiler.stopSession();

// Frame profiling
Profiler.beginFrame();
Profiler.endFrame();

// Scope profiling
Profiler.beginScope('My Scope', 'rendering');
Profiler.endScope('My Scope');

// Counters
Profiler.incrementCounter('DrawCalls', 1);
Profiler.setCounter('Triangles', 1000);
```

### ProfileMarker

Named timing markers with hierarchical support.

```typescript
// Simple marker
ProfileMarker.begin('Render');
// ... code ...
ProfileMarker.end('Render');

// With category and color
ProfileMarker.begin('Shadow Pass', {
  category: MarkerCategory.RENDERING,
  color: MarkerColor.BLUE
});
// ... code ...
ProfileMarker.end('Shadow Pass');

// Nested markers
ProfileMarker.begin('Frame');
  ProfileMarker.begin('Update');
  ProfileMarker.end('Update');
  ProfileMarker.begin('Render');
  ProfileMarker.end('Render');
ProfileMarker.end('Frame');

// Measure function
const result = ProfileMarker.measure('Calculate', () => {
  return expensiveCalculation();
});

// Async function
await ProfileMarker.measureAsync('LoadAssets', async () => {
  await loadAssets();
});
```

### ScopeMarker

RAII-style scope markers for automatic timing.

```typescript
function render() {
  const scope = new ScopeMarker('Render');
  // ... code ...
  // Automatically ends when scope exits
}

// Manual disposal
const scope = new ScopeMarker('Update');
try {
  // ... code ...
} finally {
  scope.dispose();
}

// Scoped function
scoped('Physics', () => {
  updatePhysics();
});

// Async scoped function
await scopedAsync('LoadLevel', async () => {
  await loadLevel();
});
```

### CounterMarker

Numeric counters for tracking metrics.

```typescript
// Increment counters
CounterMarker.increment(CounterName.DRAW_CALLS);
CounterMarker.increment(CounterName.TRIANGLES, 1000);

// Set counter value
CounterMarker.set(CounterName.OBJECTS_RENDERED, 50);

// Get counter value
const drawCalls = CounterMarker.get(CounterName.DRAW_CALLS);

// Get statistics
const stats = CounterMarker.getStatistics(CounterName.DRAW_CALLS);
console.log(`Draw calls: ${stats.current}, Avg: ${stats.average}`);
```

### FrameTimer

High-precision frame timing with ring buffer.

```typescript
const timer = new FrameTimer({ targetFPS: 60, historySize: 300 });

// In game loop
timer.beginFrame();
// ... render ...
timer.endFrame();

// Get statistics
console.log(`FPS: ${timer.getFPS()}`);
console.log(`Avg: ${timer.getAverageFPS()}`);
console.log(`Min: ${timer.getMinFrameTime()}ms`);
console.log(`Max: ${timer.getMaxFrameTime()}ms`);

// Frame budget
if (timer.isOverBudget()) {
  console.log('Frame over budget!');
}

// Spike detection
if (timer.wasLastFrameSpike()) {
  console.log('Frame spike detected!');
}
```

### GPUProfiler

GPU profiling using WebGL timer queries.

```typescript
const gl = ...; // WebGL2RenderingContext
const profiler = new GPUProfiler(gl);

// Begin GPU timing
profiler.beginQuery('Shadow Pass');
// ... GPU work ...
profiler.endQuery('Shadow Pass');

// Poll for results
profiler.update();
const results = profiler.getResults();

for (const result of results) {
  console.log(`${result.name}: ${result.gpuTime}ms`);
}

// Memory tracking
profiler.trackTextureAllocation(1024, 1024, gl.RGBA, gl.UNSIGNED_BYTE);
const memInfo = profiler.getMemoryInfo();
console.log(`Texture memory: ${memInfo.textureMemory / 1024 / 1024}MB`);
```

### MemoryProfiler

Memory profiling with leak detection.

```typescript
const profiler = new MemoryProfiler({ snapshotInterval: 1000 });
profiler.start();

// Track allocations
profiler.trackAllocation('Texture', 1024 * 1024);

// Get memory info
const info = profiler.getCurrentMemoryInfo();
console.log(`Used: ${info.usedJSHeapSize / 1024 / 1024}MB`);

// Check memory pressure
if (profiler.getMemoryPressure() === MemoryPressureLevel.HIGH) {
  profiler.suggestGarbageCollection();
}

// Leak detection
const leak = profiler.detectMemoryLeaks();
if (leak.suspected) {
  console.warn(leak.message);
}
```

## Visualization

### ProfilerOverlay

On-screen overlay with FPS, frame time graph, and memory usage.

```typescript
const overlay = new ProfilerOverlay({
  position: 'top-right',  // or 'top-left', 'bottom-left', 'bottom-right'
  mode: 'detailed',       // or 'minimal'
  enableF3Toggle: true,   // Toggle with F3 key
  showFPS: true,
  showFrameTime: true,
  showMemory: true,
  showCounters: true
});

overlay.show();

// Update in game loop
function gameLoop() {
  overlay.update();
}

// Toggle visibility
overlay.toggle();

// Change position
overlay.setPosition('bottom-left');

// Change mode
overlay.setMode('minimal');
```

### FrameGraph

Bar chart visualization of frame times.

```typescript
const container = document.getElementById('frame-graph');
const graph = new FrameGraph({
  container,
  width: 800,
  height: 200,
  targetFPS: 60
});

// Update with timer data
const timer = Profiler.getFrameTimer();
graph.update(timer);

// Or set data directly
graph.setData([16.2, 15.8, 17.3, 16.1, ...]);
```

### FlameGraph

Hierarchical timing visualization.

```typescript
const container = document.getElementById('flame-graph');
const graph = new FlameGraph({
  container,
  width: 1200,
  height: 600,
  enableSearch: true,
  enableZoom: true,
  colorScheme: 'category'  // or 'hot', 'cold'
});

// Set data from session
const session = Profiler.getSession();
graph.setData(session);

// Reset zoom
graph.resetZoom();

// Change color scheme
graph.setColorScheme('hot');

// Export as image
const dataUrl = graph.exportImage();
```

### TimelineView

Horizontal timeline with track-based layout.

```typescript
const container = document.getElementById('timeline');
const timeline = new TimelineView({
  container,
  width: 1200,
  height: 400,
  enableSelection: true
});

// Set data from session
const session = Profiler.getSession();
timeline.setData(session);

// Get selection
const selection = timeline.getSelection();
if (selection) {
  console.log(`Selected frames ${selection.startFrame} to ${selection.endFrame}`);
}

// Export selection
const selectedFrames = timeline.exportSelection();
```

## Export

### ChromeTraceExporter

Export to chrome://tracing format.

```typescript
const session = Profiler.getSession();

// Export to string
const json = ChromeTraceExporter.export(session, {
  processId: 1,
  threadId: 1,
  includeMetadata: true,
  useCompleteEvents: true
});

// Save to file
ChromeTraceExporter.exportToFile(session, 'profile.json');

// Export multiple sessions
const sessions = [session1, session2, session3];
const combined = ChromeTraceExporter.exportMultipleSessions(sessions);
```

To view the trace:
1. Open Chrome browser
2. Navigate to `chrome://tracing`
3. Click "Load" and select your profile.json file

### JSONExporter

Export to custom JSON format.

```typescript
const session = Profiler.getSession();

// Full export
const json = JSONExporter.export(session, {
  prettyPrint: true,
  includeFrames: true,
  includeStatistics: true,
  maxFrames: 300
});

// Compact export
const compact = JSONExporter.exportCompact(session);

// Statistics only
const stats = JSONExporter.exportStatistics(session);

// Frames only
const frames = JSONExporter.exportFrames(session, 60);

// CSV export
const csv = JSONExporter.exportToCSV(session);

// Scope statistics CSV
const scopeCSV = JSONExporter.exportScopeStatsToCSV(session);

// Save to file
JSONExporter.exportToFile(session, 'profile.json');
JSONExporter.exportCSVToFile(session, 'profile.csv');

// Compare sessions
const comparison = JSONExporter.exportComparison(session1, session2);
```

## Decorators

### @ProfileMethod

Automatically profile class methods.

```typescript
class Renderer {
  @ProfileMethod({ category: MarkerCategory.RENDERING })
  render() {
    // ... rendering code ...
  }

  @ProfileAsyncMethod({ category: MarkerCategory.LOADING })
  async loadTexture(path: string) {
    // ... async loading code ...
  }
}
```

### @ProfileFunction

Profile standalone functions.

```typescript
class PhysicsSystem {
  @ProfileFunction('physics')
  updatePhysics() {
    // ... physics code ...
  }
}
```

## Best Practices

### 1. Use Hierarchical Markers

```typescript
ProfileMarker.begin('Frame');
  ProfileMarker.begin('Update');
    ProfileMarker.begin('Physics');
    ProfileMarker.end('Physics');
    ProfileMarker.begin('Animation');
    ProfileMarker.end('Animation');
  ProfileMarker.end('Update');
  ProfileMarker.begin('Render');
    ProfileMarker.begin('Shadow Pass');
    ProfileMarker.end('Shadow Pass');
    ProfileMarker.begin('Main Pass');
    ProfileMarker.end('Main Pass');
  ProfileMarker.end('Render');
ProfileMarker.end('Frame');
```

### 2. Use RAII-Style Scopes

```typescript
function render() {
  const scope = new ScopeMarker('Render');

  // ... rendering code ...

  // Automatically ends when function returns
}
```

### 3. Track Important Counters

```typescript
function render() {
  CounterMarker.beginFrame();

  for (const object of objects) {
    CounterMarker.increment(CounterName.DRAW_CALLS);
    CounterMarker.increment(CounterName.TRIANGLES, object.triangleCount);
    drawObject(object);
  }
}
```

### 4. Monitor Memory Pressure

```typescript
const memProfiler = new MemoryProfiler();
memProfiler.start();

function gameLoop() {
  if (memProfiler.isMemoryPressureHigh()) {
    // Reduce quality, unload assets, etc.
    reduceMemoryUsage();
  }
}
```

### 5. Export Regular Profiling Sessions

```typescript
// During development
if (DEBUG_MODE) {
  setInterval(() => {
    const session = Profiler.getSession();
    const timestamp = Date.now();
    JSONExporter.exportToFile(session, `profile-${timestamp}.json`);
  }, 60000); // Every minute
}
```

## Performance Tips

1. **Disable in Production**: Set `Profiler.disable()` in production builds
2. **Limit History Size**: Use smaller history buffers for lower memory usage
3. **Use Categories**: Organize markers by category for better analysis
4. **Profile Selectively**: Don't profile every function, focus on bottlenecks
5. **Export Regularly**: Don't let sessions grow too large

## API Reference

See individual file documentation for complete API details:

- `Profiler.ts` - Main profiler singleton
- `ProfilerSession.ts` - Session management
- `FrameTimer.ts` - Frame timing
- `GPUProfiler.ts` - GPU profiling
- `MemoryProfiler.ts` - Memory profiling
- `ProfileMarker.ts` - Named markers
- `ScopeMarker.ts` - Scope markers
- `CounterMarker.ts` - Numeric counters
- `ProfilerOverlay.ts` - On-screen overlay
- `FrameGraph.ts` - Frame graph visualization
- `FlameGraph.ts` - Flame graph visualization
- `TimelineView.ts` - Timeline visualization
- `ChromeTraceExporter.ts` - Chrome trace export
- `JSONExporter.ts` - JSON export

## License

Part of the G3D 5.0 game engine.

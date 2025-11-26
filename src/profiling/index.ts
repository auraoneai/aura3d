/**
 * G3D 5.0 Profiling & Debugging Module
 *
 * Complete profiling system for the G3D game engine.
 * Provides CPU/GPU timing, memory tracking, visualization, and export functionality.
 *
 * @module Profiling
 * @version 5.0.0
 *
 * @example
 * ```typescript
 * import { Profiler, ProfileMarker, ProfilerOverlay } from './profiling';
 *
 * // Enable profiling
 * Profiler.enable();
 * Profiler.startSession('Game Session');
 *
 * // Profile code
 * function gameLoop() {
 *   Profiler.beginFrame();
 *
 *   ProfileMarker.begin('Update');
 *   update();
 *   ProfileMarker.end('Update');
 *
 *   ProfileMarker.begin('Render');
 *   render();
 *   ProfileMarker.end('Render');
 *
 *   Profiler.endFrame();
 * }
 *
 * // Show overlay
 * const overlay = new ProfilerOverlay();
 * overlay.show();
 *
 * // Export results
 * const session = Profiler.getSession();
 * ChromeTraceExporter.exportToFile(session, 'profile.json');
 * ```
 */

// Core profiling
export {
    Profiler,
    PROFILE_SCOPE,
    ProfileFunction
} from './Profiler';
export type {
    ProfilerConfig,
    ProfileScope,
    FrameProfile
} from './Profiler';

export {
    ProfilerSession
} from './ProfilerSession';
export type {
    SessionConfig,
    SessionStatistics,
    ScopeStatistics
} from './ProfilerSession';

export {
    FrameTimer
} from './FrameTimer';
export type {
    FrameTimerConfig,
    FrameTimingData
} from './FrameTimer';

export {
    GPUProfiler
} from './GPUProfiler';
export type {
    GPUProfilerConfig,
    GPUTimingResult,
    GPUMemoryInfo
} from './GPUProfiler';

export {
    MemoryProfiler,
    MemoryPressureLevel
} from './MemoryProfiler';
export type {
    MemoryProfilerConfig,
    MemorySnapshot,
    AllocationEvent
} from './MemoryProfiler';

// Markers
export {
    ProfileMarker,
    ProfileMethod,
    ProfileAsyncMethod,
    MarkerCategory
} from './markers/ProfileMarker';
export type {
    ProfileMarkerConfig,
    MarkerColor
} from './markers/ProfileMarker';

export {
    ScopeMarker,
    ScopeStack,
    using,
    usingAsync,
    scoped,
    scopedAsync,
    getGlobalScopeStack,
    beginScope,
    endScope,
    getScopeDepth
} from './markers/ScopeMarker';

export {
    CounterMarker,
    ScopedCounter,
    CounterName
} from './markers/CounterMarker';
export type {
    CounterDataPoint,
    CounterStatistics
} from './markers/CounterMarker';

// Visualization
export {
    ProfilerOverlay
} from './visualization/ProfilerOverlay';
export type {
    ProfilerOverlayConfig,
    OverlayPosition,
    OverlayMode
} from './visualization/ProfilerOverlay';

export {
    FrameGraph
} from './visualization/FrameGraph';
export type {
    FrameGraphConfig
} from './visualization/FrameGraph';

export {
    FlameGraph
} from './visualization/FlameGraph';
export type {
    FlameGraphConfig
} from './visualization/FlameGraph';

export {
    TimelineView
} from './visualization/TimelineView';
export type {
    TimelineConfig
} from './visualization/TimelineView';

// Export
export {
    ChromeTraceExporter
} from './export/ChromeTraceExporter';
export type {
    ChromeTraceExporterConfig
} from './export/ChromeTraceExporter';

export {
    JSONExporter
} from './export/JSONExporter';
export type {
    JSONExporterConfig,
    JSONExportFormat,
    CompactExportFormat
} from './export/JSONExporter';

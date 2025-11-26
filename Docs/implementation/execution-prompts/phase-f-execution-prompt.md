# Phase F: Domain Packs & Tooling - Execution Prompt

## Overview

**Phase:** F - Domain Packs & Tooling  
**PRD Documents:** 
- `PRD-Final-08-Domain-Packs.md` (~61 files)
- `PRD-Final-10-Tooling.md` (~139 files)

**Total Files:** ~200 files  
**Estimated Time:** 3-4 weeks  
**Dependencies:** Phases A, B, C, D, E (all previous phases)

---

## Execution Strategy

### Parallel Execution Rules

**✅ CAN BE PARALLELIZED:**
- Different domain packs (scientific, medical, architecture, XR, ecommerce)
- Different tooling modules (editor, scripting, timeline, profiling, analytics, cloud, localization)
- Files within the same module that have no dependencies on each other

**❌ MUST BE SEQUENTIAL:**
- Files that depend on other files in the same module
- Tooling that depends on core systems (editor depends on rendering, etc.)

**Execution Order:**
1. **Phase F.1 (Parallel):** Domain Packs (5 independent modules)
2. **Phase F.2 (Parallel):** Tooling Core (Editor, Scripting, Timeline)
3. **Phase F.3 (Parallel):** Tooling Support (Profiling, Analytics, Cloud, Localization)

---

## Part 1: Domain Packs (PRD-08)

### Module 1: Scientific Visualization (`src/scientific/`) - ~18 files

**Subdirectories:**
- `field/` - Field visualization (9 files)
- `climate/` - Climate simulation (7 files)

**Key Files:**

#### Field Visualization (9 files)
- [ ] `src/scientific/field/FieldManager.ts` - Field data management
- [ ] `src/scientific/field/FieldData.ts` - Field data structure
- [ ] `src/scientific/field/VectorFieldRenderer.ts` - Vector field rendering
- [ ] `src/scientific/field/ScalarFieldRenderer.ts` - Scalar field rendering
- [ ] `src/scientific/field/StreamlineIntegrator.ts` - Streamline computation
- [ ] `src/scientific/field/ParticleTracer.ts` - Particle tracing
- [ ] `src/scientific/field/FieldProbe.ts` - Interactive probing
- [ ] `src/scientific/field/FieldDataLoader.ts` - Data loading (VTK, NetCDF)
- [ ] `src/scientific/field/ColorMap.ts` - Scientific color mapping
- [ ] `src/scientific/field/MarchingCubesTables.ts` - Lookup tables

**Implementation Requirements:**
- Support scalar and vector 3D fields
- Multiple visualization modes (glyphs, streamlines, particles)
- GPU instanced rendering for performance
- Perceptually uniform color maps (Viridis, Plasma, Inferno)
- Runge-Kutta integration for streamlines
- **Performance:** 1M vectors @ 30 FPS

#### Climate Simulation (7 files)
- [ ] `src/scientific/climate/ClimateSystem.ts` - Main climate system
- [ ] `src/scientific/climate/ClimateGrid.ts` - Global climate grid
- [ ] `src/scientific/climate/TemperatureSimulator.ts` - Temperature dynamics
- [ ] `src/scientific/climate/PressureHumiditySimulator.ts` - Pressure/humidity
- [ ] `src/scientific/climate/WindSimulator.ts` - Wind simulation
- [ ] `src/scientific/climate/WeatherEventGenerator.ts` - Weather events
- [ ] `src/scientific/climate/ClimateZone.ts` - Climate zones

**Implementation Requirements:**
- Global climate grid (360x180)
- Temperature, pressure, humidity simulation
- Wind vector fields
- Weather event generation
- **Performance:** 360x180 grid @ 60 FPS

**Exports:**
- [ ] `src/scientific/index.ts` - Export all scientific modules

---

### Module 2: Medical Imaging (`src/medical/`) - ~9 files

**Key Files:**
- [ ] `src/medical/VolumeData.ts` - Volume data structure
- [ ] `src/medical/VolumeRenderer.ts` - GPU volume rendering
- [ ] `src/medical/TransferFunction.ts` - Transfer function mapping
- [ ] `src/medical/DICOMLoader.ts` - DICOM file loading
- [ ] `src/medical/MPRSlicer.ts` - Multi-planar reconstruction
- [ ] `src/medical/IsosurfaceExtractor.ts` - Marching cubes extraction
- [ ] `src/medical/MarchingCubesTable.ts` - Lookup table
- [ ] `src/medical/MedicalTools.ts` - Measurement tools
- [ ] `src/medical/index.ts` - Exports

**Implementation Requirements:**
- Ray marching volume rendering
- Transfer function with color/opacity curves
- DICOM file parsing (series sorting, window/level)
- Axial/Sagittal/Coronal views + oblique slicing
- Marching cubes isosurface extraction
- Medical imaging presets (CT, MRI)
- **Performance:** 512³ volume @ 30 FPS

---

### Module 3: Architecture/BIM (`src/architecture/`) - ~10 files

**Subdirectories:**
- `section/` - Section cut system (10 files)

**Key Files:**
- [ ] `src/architecture/section/SectionManager.ts` - Section management
- [ ] `src/architecture/section/SectionFillGenerator.ts` - Fill generation
- [ ] `src/architecture/section/ClippingShaderController.ts` - GPU clipping
- [ ] `src/architecture/section/HatchingGenerator.ts` - Hatching patterns
- [ ] `src/architecture/section/BIMMetadataDisplay.ts` - BIM metadata
- [ ] `src/architecture/section/SectionPlane.ts` - Section plane
- [ ] `src/architecture/section/SectionPlaneHelper.ts` - Visual helper
- [ ] `src/architecture/section/SectionConfig.ts` - Configuration
- [ ] `src/architecture/section/SectionTypes.ts` - Type definitions
- [ ] `src/architecture/section/index.ts` - Exports
- [ ] `src/architecture/index.ts` - Main exports

**Implementation Requirements:**
- Multiple section planes
- Real-time mesh clipping
- Section fill rendering
- Hatching patterns
- BIM metadata display (IFC classes, properties)
- 2D export (SVG, DXF)

---

### Module 4: XR System (`src/xr/`) - ~8 files

**Subdirectories:**
- `foveated/` - Foveated rendering (7 files)

**Key Files:**
- [ ] `src/xr/XREngine.ts` - Main XR integration
- [ ] `src/xr/XRSessionManager.ts` - Session management
- [ ] `src/xr/XRInputSystem.ts` - Controller/hand tracking
- [ ] `src/xr/foveated/EyeTracker.ts` - Eye tracking
- [ ] `src/xr/foveated/VariableRateShadingManager.ts` - VRS
- [ ] `src/xr/foveated/MultiResolutionRenderer.ts` - Multi-res rendering
- [ ] `src/xr/foveated/GazeBasedLOD.ts` - Gaze-based LOD
- [ ] `src/xr/foveated/FixedFoveatedRenderer.ts` - Fixed foveation
- [ ] `src/xr/foveated/FoveatedRenderer.ts` - Dynamic foveation
- [ ] `src/xr/foveated/index.ts` - Exports
- [ ] `src/xr/index.ts` - Main exports

**Implementation Requirements:**
- WebXR session management
- Stereo camera setup
- Controller tracking
- Hand tracking (where supported)
- Fixed foveated rendering (ring-based)
- Dynamic gaze-based foveation
- Variable rate shading (where supported)
- **Performance:** 30-50% pixel reduction

---

### Module 5: E-Commerce (`src/ecommerce/`) - ~8 files

**Subdirectories:**
- `turntable/` - Product viewer (8 files)

**Key Files:**
- [ ] `src/ecommerce/turntable/TurntableController.ts` - Turntable controls
- [ ] `src/ecommerce/turntable/OrbitCamera.ts` - Orbit camera
- [ ] `src/ecommerce/turntable/LightingPresetManager.ts` - Lighting presets
- [ ] `src/ecommerce/turntable/HotspotManager.ts` - Interactive hotspots
- [ ] `src/ecommerce/turntable/CaptureManager.ts` - Image/video capture
- [ ] `src/ecommerce/turntable/ARExporter.ts` - AR export (USDZ, GLB)
- [ ] `src/ecommerce/turntable/BatchProcessor.ts` - Batch processing
- [ ] `src/ecommerce/turntable/index.ts` - Exports
- [ ] `src/ecommerce/index.ts` - Main exports

**Implementation Requirements:**
- Smooth orbit controls
- Auto-rotation with pause on interaction
- Lighting presets (Studio, Outdoor, Soft, etc.)
- Interactive hotspots with 3D→2D projection
- High-resolution screenshot capture
- Video recording (MediaRecorder)
- 360° spin automation
- USDZ export for iOS AR Quick Look
- GLB export for Android

---

## Part 2: Tooling (PRD-10)

### Module 6: Editor Integration (`src/editor/`) - ~20 files

**Subdirectories:**
- `commands/` - Command pattern (6 files)
- `gizmos/` - Transform gizmos (5 files)
- `picking/` - Entity picking (3 files)
- `inspectors/` - Component inspectors (2 files)

**Key Files:**

#### Core Editor (4 files)
- [ ] `src/editor/EditorEngine.ts` - Editor engine wrapper
- [ ] `src/editor/EditorState.ts` - Editor state management
- [ ] `src/editor/Selection.ts` - Entity selection
- [ ] `src/editor/History.ts` - Undo/redo system

#### Commands (6 files)
- [ ] `src/editor/commands/Command.ts` - Base command interface
- [ ] `src/editor/commands/TransformCommand.ts` - Transform commands
- [ ] `src/editor/commands/CreateEntityCommand.ts` - Create commands
- [ ] `src/editor/commands/DeleteEntityCommand.ts` - Delete commands
- [ ] `src/editor/commands/SetPropertyCommand.ts` - Property commands
- [ ] `src/editor/commands/CommandHistory.ts` - Command history manager

#### Gizmos (5 files)
- [ ] `src/editor/gizmos/GizmoManager.ts` - Gizmo manager
- [ ] `src/editor/gizmos/TranslateGizmo.ts` - Translation gizmo
- [ ] `src/editor/gizmos/RotateGizmo.ts` - Rotation gizmo
- [ ] `src/editor/gizmos/ScaleGizmo.ts` - Scale gizmo
- [ ] `src/editor/gizmos/BoundsGizmo.ts` - Bounds gizmo

#### Picking (3 files)
- [ ] `src/editor/picking/PickingSystem.ts` - Picking system
- [ ] `src/editor/picking/GPUPicking.ts` - GPU-based picking
- [ ] `src/editor/picking/RaycastPicking.ts` - Raycast-based picking

#### Inspectors (2 files)
- [ ] `src/editor/inspectors/InspectorRegistry.ts` - Inspector registry
- [ ] `src/editor/inspectors/ComponentInspectors.ts` - Component inspectors

**Exports:**
- [ ] `src/editor/index.ts` - Export all editor components

**Implementation Requirements:**
- Edit/play mode switching
- Undo/redo with command pattern
- Transform gizmos (translate, rotate, scale)
- GPU and raycast picking
- Component property inspectors
- Scene save/load
- **Performance:** < 1ms per pick

---

### Module 7: Visual Scripting (`src/scripting/`) - ~20 files

**Subdirectories:**
- `nodes/` - Visual script nodes (8 files)
- `execution/` - Graph execution (3 files)
- `compiler/` - Script compilation (3 files)

**Key Files:**

#### Core Scripting (5 files)
- [ ] `src/scripting/ScriptingEngine.ts` - Scripting runtime
- [ ] `src/scripting/Graph.ts` - Graph structure
- [ ] `src/scripting/Node.ts` - Base node class
- [ ] `src/scripting/Edge.ts` - Edge connection
- [ ] `src/scripting/Port.ts` - Port definition

#### Node Types (8 files)
- [ ] `src/scripting/nodes/EventNodes.ts` - Event nodes (OnStart, OnUpdate, etc.)
- [ ] `src/scripting/nodes/FlowNodes.ts` - Flow control (Branch, Loop, Delay)
- [ ] `src/scripting/nodes/MathNodes.ts` - Math operations
- [ ] `src/scripting/nodes/LogicNodes.ts` - Logic operations (AND, OR, NOT)
- [ ] `src/scripting/nodes/VariableNodes.ts` - Variable nodes
- [ ] `src/scripting/nodes/ComponentNodes.ts` - Component access
- [ ] `src/scripting/nodes/PhysicsNodes.ts` - Physics nodes
- [ ] `src/scripting/nodes/AnimationNodes.ts` - Animation nodes
- [ ] `src/scripting/nodes/DebugNodes.ts` - Debug nodes

#### Execution (3 files)
- [ ] `src/scripting/execution/GraphExecutor.ts` - Graph executor
- [ ] `src/scripting/execution/ExecutionContext.ts` - Execution context
- [ ] `src/scripting/execution/FlowMachine.ts` - Flow state machine

#### Compiler (3 files)
- [ ] `src/scripting/compiler/ScriptCompiler.ts` - Script compiler
- [ ] `src/scripting/compiler/TypeChecker.ts` - Type checking
- [ ] `src/scripting/compiler/Optimizer.ts` - Graph optimization

**Exports:**
- [ ] `src/scripting/index.ts` - Export all scripting components

**Implementation Requirements:**
- Flow-based execution
- Type-safe port connections
- Node type registration system
- Global and local variables
- Event triggering
- Hot reload support
- Debugging with breakpoints
- **Performance:** 1000 nodes/frame

---

### Module 8: Timeline & Cinematics (`src/timeline/`) - ~20 files

**Subdirectories:**
- `tracks/` - Track types (6 files)
- `playables/` - Playable system (3 files)
- `signals/` - Signal system (3 files)

**Key Files:**

#### Core Timeline (4 files)
- [ ] `src/timeline/TimelineSystem.ts` - Timeline system
- [ ] `src/timeline/Timeline.ts` - Timeline asset
- [ ] `src/timeline/Track.ts` - Base track class
- [ ] `src/timeline/Clip.ts` - Base clip class
- [ ] `src/timeline/Playable.ts` - Playable interface

#### Track Types (6 files)
- [ ] `src/timeline/tracks/AnimationTrack.ts` - Animation track
- [ ] `src/timeline/tracks/AudioTrack.ts` - Audio track
- [ ] `src/timeline/tracks/ActivationTrack.ts` - Activation track
- [ ] `src/timeline/tracks/ControlTrack.ts` - Control track
- [ ] `src/timeline/tracks/CameraTrack.ts` - Camera track
- [ ] `src/timeline/tracks/SignalTrack.ts` - Signal track
- [ ] `src/timeline/tracks/CustomTrack.ts` - Custom track

#### Playables (3 files)
- [ ] `src/timeline/playables/PlayableDirector.ts` - Playback director
- [ ] `src/timeline/playables/PlayableGraph.ts` - Playable graph
- [ ] `src/timeline/playables/PlayableMixer.ts` - Playable mixer

#### Signals (3 files)
- [ ] `src/timeline/signals/SignalReceiver.ts` - Signal receiver
- [ ] `src/timeline/signals/SignalEmitter.ts` - Signal emitter
- [ ] `src/timeline/signals/SignalAsset.ts` - Signal asset

**Exports:**
- [ ] `src/timeline/index.ts` - Export all timeline components

**Implementation Requirements:**
- Multi-track timeline
- Clip overlap and blending
- Animation, audio, camera tracks
- Signal emission at markers
- Playback control (play, pause, stop, scrub)
- Wrap modes (none, loop, hold)
- Timeline serialization

---

### Module 9: Profiling & Debugging (`src/profiling/`) - ~15 files

**Subdirectories:**
- `markers/` - Profile markers (3 files)
- `visualization/` - Profiler UI (4 files)
- `export/` - Export formats (2 files)

**Key Files:**

#### Core Profiling (3 files)
- [ ] `src/profiling/Profiler.ts` - Main profiler
- [ ] `src/profiling/ProfilerSession.ts` - Profiling session
- [ ] `src/profiling/FrameTimer.ts` - Frame timing

#### GPU & Memory (2 files)
- [ ] `src/profiling/GPUProfiler.ts` - GPU profiling
- [ ] `src/profiling/MemoryProfiler.ts` - Memory profiling

#### Markers (3 files)
- [ ] `src/profiling/markers/ProfileMarker.ts` - Profile marker
- [ ] `src/profiling/markers/ScopeMarker.ts` - Scope marker
- [ ] `src/profiling/markers/CounterMarker.ts` - Counter marker

#### Visualization (4 files)
- [ ] `src/profiling/visualization/ProfilerOverlay.ts` - On-screen overlay
- [ ] `src/profiling/visualization/FrameGraph.ts` - Frame graph view
- [ ] `src/profiling/visualization/FlameGraph.ts` - Flame graph view
- [ ] `src/profiling/visualization/TimelineView.ts` - Timeline view

#### Export (2 files)
- [ ] `src/profiling/export/ChromeTraceExporter.ts` - Chrome trace format
- [ ] `src/profiling/export/JSONExporter.ts` - JSON export

**Exports:**
- [ ] `src/profiling/index.ts` - Export all profiling components

**Implementation Requirements:**
- Hierarchical sampling
- CPU and GPU timing
- Memory tracking
- Frame time history
- Chrome trace export
- On-screen overlay (F3 toggle)
- Flame graph visualization
- **Performance:** < 0.1ms overhead when disabled

---

### Module 10: Analytics & Telemetry (`src/analytics/`) - ~13 files

**Subdirectories:**
- `providers/` - Analytics providers (4 files)
- `privacy/` - Privacy features (2 files)

**Key Files:**

#### Core Analytics (5 files)
- [ ] `src/analytics/AnalyticsManager.ts` - Analytics manager
- [ ] `src/analytics/EventTracker.ts` - Event tracking
- [ ] `src/analytics/MetricsCollector.ts` - Metrics collection
- [ ] `src/analytics/SessionManager.ts` - Session management
- [ ] `src/analytics/UserProfile.ts` - User profile

#### Providers (4 files)
- [ ] `src/analytics/providers/AnalyticsProvider.ts` - Base provider
- [ ] `src/analytics/providers/ConsoleProvider.ts` - Console provider
- [ ] `src/analytics/providers/CustomProvider.ts` - Custom provider
- [ ] `src/analytics/providers/BatchingProvider.ts` - Batching provider

#### Privacy (2 files)
- [ ] `src/analytics/privacy/ConsentManager.ts` - Consent management
- [ ] `src/analytics/privacy/DataAnonymizer.ts` - Data anonymization

**Exports:**
- [ ] `src/analytics/index.ts` - Export all analytics components

**Implementation Requirements:**
- Event tracking
- User properties
- Session management
- Consent handling (GDPR)
- Batched sending
- Offline queuing
- IP anonymization
- Custom provider support

---

### Module 11: Cloud Services (`src/cloud/`) - ~9 files

**Key Files:**
- [ ] `src/cloud/CloudManager.ts` - Cloud service coordinator
- [ ] `src/cloud/Authentication.ts` - User authentication
- [ ] `src/cloud/CloudSave.ts` - Cloud save sync
- [ ] `src/cloud/Leaderboards.ts` - Leaderboard system
- [ ] `src/cloud/Achievements.ts` - Achievement system
- [ ] `src/cloud/RemoteConfig.ts` - Remote configuration
- [ ] `src/cloud/Matchmaking.ts` - Cloud matchmaking
- [ ] `src/cloud/ContentDelivery.ts` - CDN integration
- [ ] `src/cloud/index.ts` - Exports

**Implementation Requirements:**
- User authentication
- Cloud save with conflict resolution
- Leaderboard management
- Achievement tracking
- Remote configuration fetching
- Matchmaking integration
- CDN content delivery
- Offline mode handling

---

### Module 12: Localization (`src/localization/`) - ~9 files

**Subdirectories:**
- `loaders/` - Locale loaders (2 files)

**Key Files:**
- [ ] `src/localization/LocalizationManager.ts` - Localization manager
- [ ] `src/localization/Locale.ts` - Locale definition
- [ ] `src/localization/StringTable.ts` - String table
- [ ] `src/localization/Pluralization.ts` - Pluralization rules
- [ ] `src/localization/DateFormatter.ts` - Date formatting
- [ ] `src/localization/NumberFormatter.ts` - Number formatting
- [ ] `src/localization/loaders/JSONLocaleLoader.ts` - JSON loader
- [ ] `src/localization/loaders/CSVLocaleLoader.ts` - CSV loader
- [ ] `src/localization/index.ts` - Exports

**Implementation Requirements:**
- String key translation
- Parameter substitution
- Pluralization rules (CLDR)
- Number/date/currency formatting
- Locale fallback chain
- Hot-swap locale support
- JSON and CSV format support

---

## Execution Checklist

### Phase F.1: Domain Packs (Parallel)
- [ ] **Module 1:** Scientific Visualization (18 files)
- [ ] **Module 2:** Medical Imaging (9 files)
- [ ] **Module 3:** Architecture/BIM (10 files)
- [ ] **Module 4:** XR System (8 files)
- [ ] **Module 5:** E-Commerce (8 files)

### Phase F.2: Tooling Core (Parallel)
- [ ] **Module 6:** Editor Integration (20 files)
- [ ] **Module 7:** Visual Scripting (20 files)
- [ ] **Module 8:** Timeline & Cinematics (20 files)

### Phase F.3: Tooling Support (Parallel)
- [ ] **Module 9:** Profiling & Debugging (15 files)
- [ ] **Module 10:** Analytics & Telemetry (13 files)
- [ ] **Module 11:** Cloud Services (9 files)
- [ ] **Module 12:** Localization (9 files)

### Integration
- [ ] Update `src/index.ts` to export all Phase F modules
- [ ] Verify all exports are correct
- [ ] Check for TypeScript errors
- [ ] Update documentation

---

## Performance Targets

### Domain Packs
- **Scientific:** 1M vectors @ 30 FPS, 360x180 climate grid @ 60 FPS
- **Medical:** 512³ volume @ 30 FPS, isosurface extraction < 2s
- **Architecture:** Real-time section clipping, < 1ms per operation
- **XR:** 30-50% pixel reduction with foveation
- **E-Commerce:** Smooth 60 FPS turntable, < 1s AR export

### Tooling
- **Editor:** < 1ms per pick, smooth gizmo interaction
- **Scripting:** 1000 nodes/frame execution
- **Timeline:** Smooth playback, < 0.1ms overhead
- **Profiling:** < 0.1ms overhead when disabled
- **Analytics:** Efficient batching, offline queuing
- **Cloud:** Automatic sync, conflict resolution
- **Localization:** Hot-swap support, fast lookup

---

## Implementation Guidelines

### Code Quality
- ✅ **No TODOs** - All code must be production-ready
- ✅ **Full TypeScript** - Strict type checking
- ✅ **Documentation** - JSDoc comments for all public APIs
- ✅ **Examples** - Usage examples in index.ts files
- ✅ **Error Handling** - Proper error handling and validation

### Dependencies
- Use existing G3D systems (rendering, math, ECS, etc.)
- Minimize external dependencies
- Use Web APIs where possible (WebXR, MediaRecorder, etc.)

### Testing
- Unit tests for core functionality
- Integration tests for complex workflows
- Performance benchmarks for critical paths

---

## Completion Criteria

**Phase F is complete when:**

1. ✅ All ~200 files created and implemented
2. ✅ All modules properly exported
3. ✅ All performance targets met
4. ✅ No TypeScript errors
5. ✅ Documentation complete
6. ✅ Examples provided
7. ✅ Integration with main engine verified

---

## Notes

- **Domain Packs** are optional modules that extend G3D for specific use cases
- **Tooling** provides developer tools and runtime services
- Both parts can be implemented in parallel (different modules)
- Some tooling may depend on core systems (editor needs rendering)
- XR requires WebXR API support in browser
- Medical imaging requires DICOM parsing library
- Cloud services require backend infrastructure (not included)

---

**Ready to execute! Start with Phase F.1 (Domain Packs) and Phase F.2 (Tooling Core) in parallel.**


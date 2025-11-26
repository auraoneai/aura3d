# G3D 5.0 PRD – Part 10: Tooling

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 29. Editor Integration

---

## 29.1 `src/editor/` – Editor Integration

### Directory Structure

```
src/editor/
├── EditorEngine.ts
├── EditorState.ts
├── Selection.ts
├── History.ts
├── commands/
│   ├── Command.ts
│   ├── TransformCommand.ts
│   ├── CreateEntityCommand.ts
│   ├── DeleteEntityCommand.ts
│   ├── SetPropertyCommand.ts
│   └── CommandHistory.ts
├── gizmos/
│   ├── GizmoManager.ts
│   ├── TranslateGizmo.ts
│   ├── RotateGizmo.ts
│   ├── ScaleGizmo.ts
│   └── BoundsGizmo.ts
├── picking/
│   ├── PickingSystem.ts
│   ├── GPUPicking.ts
│   └── RaycastPicking.ts
├── inspectors/
│   ├── InspectorRegistry.ts
│   └── ComponentInspectors.ts
└── index.ts
```

---

### 29.1.1 `src/editor/EditorEngine.ts`

**Role:** Editor-specific engine extensions.

**Public API:**
```typescript
class EditorEngine {
  // State
  readonly state: EditorState;
  readonly selection: Selection;
  readonly history: History;
  readonly gizmos: GizmoManager;

  // Mode
  setEditMode(mode: EditMode): void;
  get editMode(): EditMode;

  // Play mode
  enterPlayMode(): void;
  exitPlayMode(): void;
  pausePlayMode(): void;
  stepFrame(): void;
  get isPlaying(): boolean;
  get isPaused(): boolean;

  // Scene
  saveScene(path: string): Promise<void>;
  loadScene(path: string): Promise<void>;
  newScene(): void;

  // Tools
  setActiveTool(tool: EditorTool): void;
  get activeTool(): EditorTool;
}

enum EditMode { SELECT, TRANSLATE, ROTATE, SCALE, PAINT, SCULPT }

interface EditorTool {
  name: string;
  icon: string;
  onActivate(): void;
  onDeactivate(): void;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
}
```

**Dependencies:**
- Depends on: `Engine`, editor components
- Depended by: Editor application

**Implementation Checklist:**
- [ ] Edit/play mode switching
- [ ] Scene save/load
- [ ] Tool system
- [ ] State management
- [ ] **Tests:** Mode switching

---

### 29.1.2 `src/editor/Selection.ts`

**Role:** Entity selection management.

**Public API:**
```typescript
class Selection {
  // Selection
  select(entity: Entity): void;
  selectMultiple(entities: Entity[]): void;
  deselect(entity: Entity): void;
  deselectAll(): void;
  toggleSelect(entity: Entity): void;

  // State
  get selected(): Entity[];
  get count(): number;
  isSelected(entity: Entity): boolean;
  get primary(): Entity | null;

  // Bounds
  getSelectionBounds(): Box3;
  getSelectionCenter(): Vector3;

  // Events
  onSelectionChanged: Signal<(selection: Entity[]) => void>;
}
```

**Implementation Checklist:**
- [ ] Single and multi-select
- [ ] Selection bounds calculation
- [ ] Primary selection concept
- [ ] Change notifications

---

### 29.1.3 `src/editor/History.ts`

**Role:** Undo/redo system.

**Public API:**
```typescript
class History {
  // Commands
  execute(command: Command): void;
  undo(): void;
  redo(): void;

  // State
  canUndo(): boolean;
  canRedo(): boolean;
  get undoStack(): Command[];
  get redoStack(): Command[];

  // Grouping
  beginGroup(name: string): void;
  endGroup(): void;

  // Clear
  clear(): void;
  get isDirty(): boolean;
  markClean(): void;

  // Events
  onExecute: Signal<(command: Command) => void>;
  onUndo: Signal<(command: Command) => void>;
  onRedo: Signal<(command: Command) => void>;
}

interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
  merge?(other: Command): boolean;
}
```

**Implementation Checklist:**
- [ ] Command pattern implementation
- [ ] Undo/redo stacks
- [ ] Command grouping
- [ ] Command merging (continuous transforms)
- [ ] Dirty state tracking
- [ ] **Tests:** Undo/redo cycles

---

### 29.1.4 `src/editor/gizmos/GizmoManager.ts`

**Role:** Transform manipulation gizmos.

**Public API:**
```typescript
class GizmoManager {
  // Active gizmo
  setGizmoType(type: GizmoType): void;
  get gizmoType(): GizmoType;

  // Space
  setSpace(space: TransformSpace): void;
  get space(): TransformSpace;

  // Snapping
  enablePositionSnap(enabled: boolean, increment?: number): void;
  enableRotationSnap(enabled: boolean, increment?: number): void;
  enableScaleSnap(enabled: boolean, increment?: number): void;

  // Visibility
  show(): void;
  hide(): void;
  get isVisible(): boolean;

  // Update
  update(camera: Camera, selection: Entity[]): void;
  render(context: RenderContext): void;
}

enum GizmoType { NONE, TRANSLATE, ROTATE, SCALE, BOUNDS }
enum TransformSpace { LOCAL, WORLD }
```

**Implementation Checklist:**
- [ ] Translation gizmo (XYZ axes + planes)
- [ ] Rotation gizmo (XYZ rings)
- [ ] Scale gizmo (XYZ + uniform)
- [ ] Local/world space
- [ ] Snap to grid
- [ ] Multi-selection pivot
- [ ] **Tests:** Transform accuracy

---

### 29.1.5 `src/editor/picking/PickingSystem.ts`

**Role:** Entity picking from screen coordinates.

**Public API:**
```typescript
class PickingSystem {
  // Picking
  pick(screenX: number, screenY: number): PickResult | null;
  pickMultiple(screenX: number, screenY: number): PickResult[];
  pickRect(rect: Rect): Entity[];

  // Configuration
  pickingMode: 'raycast' | 'gpu';

  // Layers
  setLayerPickable(layer: number, pickable: boolean): void;
}

interface PickResult {
  entity: Entity;
  position: Vector3;
  normal: Vector3;
  distance: number;
}
```

**Implementation Checklist:**
- [ ] Raycast-based picking
- [ ] GPU picking (color ID render)
- [ ] Rectangle selection
- [ ] Layer filtering
- [ ] **Performance:** < 1ms per pick

---

---

## 30. Visual Scripting

---

## 30.1 `src/scripting/` – Visual Scripting

### Directory Structure

```
src/scripting/
├── ScriptingEngine.ts
├── Graph.ts
├── Node.ts
├── Edge.ts
├── Port.ts
├── nodes/
│   ├── EventNodes.ts
│   ├── FlowNodes.ts
│   ├── MathNodes.ts
│   ├── LogicNodes.ts
│   ├── VariableNodes.ts
│   ├── ComponentNodes.ts
│   ├── PhysicsNodes.ts
│   ├── AnimationNodes.ts
│   └── DebugNodes.ts
├── execution/
│   ├── GraphExecutor.ts
│   ├── ExecutionContext.ts
│   └── FlowMachine.ts
├── compiler/
│   ├── ScriptCompiler.ts
│   ├── TypeChecker.ts
│   └── Optimizer.ts
└── index.ts
```

---

### 30.1.1 `src/scripting/ScriptingEngine.ts`

**Role:** Visual scripting runtime.

**Public API:**
```typescript
class ScriptingEngine {
  // Lifecycle
  initialize(): void;
  update(dt: number): void;
  dispose(): void;

  // Graphs
  createGraph(): Graph;
  loadGraph(path: string): Promise<Graph>;
  executeGraph(graph: Graph, context: ExecutionContext): void;

  // Variables
  setGlobalVariable(name: string, value: any): void;
  getGlobalVariable(name: string): any;

  // Nodes
  registerNodeType(type: NodeType): void;
  getNodeTypes(): NodeType[];
  getNodeTypesByCategory(category: string): NodeType[];

  // Events
  triggerEvent(eventName: string, data?: any): void;
}
```

**Dependencies:**
- Depends on: `Graph`, `GraphExecutor`, node implementations
- Depended by: `ScriptComponent`

**Implementation Checklist:**
- [ ] Graph execution runtime
- [ ] Node type registration
- [ ] Global variables
- [ ] Event triggering
- [ ] Hot reload support
- [ ] **Performance:** 1000 nodes/frame
- [ ] **Tests:** Node execution

---

### 30.1.2 `src/scripting/Graph.ts`

**Role:** Visual script graph structure.

**Public API:**
```typescript
class Graph {
  readonly id: string;
  name: string;

  // Nodes
  addNode(type: string, position: Vector2): Node;
  removeNode(node: Node): void;
  getNode(id: string): Node | undefined;
  get nodes(): Node[];

  // Edges
  connect(fromPort: Port, toPort: Port): Edge;
  disconnect(edge: Edge): void;
  get edges(): Edge[];

  // Variables
  addVariable(name: string, type: DataType, defaultValue?: any): Variable;
  removeVariable(name: string): void;
  getVariable(name: string): Variable | undefined;
  get variables(): Variable[];

  // Validation
  validate(): ValidationResult;

  // Serialization
  serialize(): GraphData;
  static deserialize(data: GraphData): Graph;
}
```

**Implementation Checklist:**
- [ ] Node management
- [ ] Edge connection with type checking
- [ ] Local variables
- [ ] Graph validation
- [ ] Serialization

---

### 30.1.3 `src/scripting/Node.ts`

**Role:** Base visual script node.

**Public API:**
```typescript
abstract class Node {
  readonly id: string;
  readonly type: string;
  position: Vector2;

  // Ports
  get inputPorts(): Port[];
  get outputPorts(): Port[];
  getPort(name: string): Port | undefined;

  // Execution
  abstract execute(context: ExecutionContext): void | Promise<void>;

  // For flow nodes
  getNextFlowNode(portName?: string): Node | null;
}

interface Port {
  readonly node: Node;
  readonly name: string;
  readonly direction: 'input' | 'output';
  readonly dataType: DataType;
  readonly isFlow: boolean;
  connections: Edge[];

  getValue(context: ExecutionContext): any;
  setValue(context: ExecutionContext, value: any): void;
}

type DataType = 'any' | 'flow' | 'boolean' | 'number' | 'string' | 'vector2' | 'vector3' | 'entity' | 'object';
```

**Implementation Checklist:**
- [ ] Port management
- [ ] Flow and data ports
- [ ] Type system
- [ ] Execute method

---

### 30.1.4 Visual Script Nodes

**Event Nodes:**
- [ ] OnStart
- [ ] OnUpdate
- [ ] OnTriggerEnter/Exit
- [ ] OnCollisionEnter/Exit
- [ ] OnKeyPress/Release
- [ ] OnCustomEvent

**Flow Nodes:**
- [ ] Branch (if/else)
- [ ] Sequence
- [ ] Loop (for, while, forEach)
- [ ] Delay
- [ ] DoOnce
- [ ] FlipFlop
- [ ] Gate

**Math Nodes:**
- [ ] Arithmetic (+, -, *, /, %)
- [ ] Comparison (<, >, ==, !=, <=, >=)
- [ ] Vector operations
- [ ] Random
- [ ] Clamp, Lerp, Map

**Logic Nodes:**
- [ ] AND, OR, NOT, XOR
- [ ] Switch
- [ ] IsValid, IsNull

**Component Nodes:**
- [ ] GetComponent
- [ ] SetProperty
- [ ] GetProperty
- [ ] AddComponent
- [ ] RemoveComponent

---

### 30.1.5 `src/scripting/execution/GraphExecutor.ts`

**Role:** Executes visual script graphs.

**Public API:**
```typescript
class GraphExecutor {
  // Execution
  execute(graph: Graph, context: ExecutionContext, entryNode?: Node): void;
  executeAsync(graph: Graph, context: ExecutionContext, entryNode?: Node): Promise<void>;

  // State
  get isExecuting(): boolean;
  abort(): void;

  // Debugging
  enableDebugging(enabled: boolean): void;
  setBreakpoint(node: Node): void;
  clearBreakpoint(node: Node): void;
  step(): void;
  continue(): void;
}

interface ExecutionContext {
  entity: Entity;
  world: World;
  deltaTime: number;
  variables: Map<string, any>;
  flowStack: Node[];
}
```

**Implementation Checklist:**
- [ ] Flow-based execution
- [ ] Async node support
- [ ] Context management
- [ ] Debugging support
- [ ] Infinite loop detection
- [ ] **Tests:** Execution correctness

---

---

## 31. Timeline & Cinematics

---

## 31.1 `src/timeline/` – Timeline System

### Directory Structure

```
src/timeline/
├── TimelineSystem.ts
├── Timeline.ts
├── Track.ts
├── Clip.ts
├── Playable.ts
├── tracks/
│   ├── AnimationTrack.ts
│   ├── AudioTrack.ts
│   ├── ActivationTrack.ts
│   ├── ControlTrack.ts
│   ├── CameraTrack.ts
│   ├── SignalTrack.ts
│   └── CustomTrack.ts
├── playables/
│   ├── PlayableDirector.ts
│   ├── PlayableGraph.ts
│   └── PlayableMixer.ts
├── signals/
│   ├── SignalReceiver.ts
│   ├── SignalEmitter.ts
│   └── SignalAsset.ts
└── index.ts
```

---

### 31.1.1 `src/timeline/TimelineSystem.ts`

**Role:** Timeline playback system.

**Public API:**
```typescript
class TimelineSystem {
  // Directors
  createDirector(): PlayableDirector;
  destroyDirector(director: PlayableDirector): void;
  get directors(): PlayableDirector[];

  // Global control
  pauseAll(): void;
  resumeAll(): void;
  setGlobalTimeScale(scale: number): void;

  // Update
  update(dt: number): void;
}
```

**Dependencies:**
- Depends on: `PlayableDirector`, `Timeline`
- Depended by: Cutscene system

**Implementation Checklist:**
- [ ] Director management
- [ ] Global time control
- [ ] Update coordination
- [ ] **Tests:** Playback

---

### 31.1.2 `src/timeline/Timeline.ts`

**Role:** Timeline asset definition.

**Public API:**
```typescript
class Timeline {
  readonly id: string;
  name: string;
  duration: number;
  loop: boolean;

  // Tracks
  addTrack(track: Track): void;
  removeTrack(track: Track): void;
  getTrack(index: number): Track;
  get tracks(): Track[];
  get trackCount(): number;

  // Markers
  addMarker(time: number, name: string): Marker;
  removeMarker(marker: Marker): void;
  get markers(): Marker[];

  // Serialization
  serialize(): TimelineData;
  static deserialize(data: TimelineData): Timeline;
}
```

**Implementation Checklist:**
- [ ] Multi-track container
- [ ] Duration management
- [ ] Markers for events
- [ ] Loop support
- [ ] Serialization

---

### 31.1.3 `src/timeline/Track.ts`

**Role:** Base track class.

**Public API:**
```typescript
abstract class Track {
  readonly id: string;
  name: string;
  muted: boolean;
  locked: boolean;

  // Clips
  addClip(clip: Clip, startTime: number): void;
  removeClip(clip: Clip): void;
  getClipAt(time: number): Clip | null;
  get clips(): Clip[];

  // Binding
  binding: Entity | null;

  // Evaluation
  abstract evaluate(time: number, director: PlayableDirector): void;
}

abstract class Clip {
  readonly track: Track;
  startTime: number;
  duration: number;
  blendInDuration: number;
  blendOutDuration: number;
  clipSpeed: number;

  // Evaluation
  abstract evaluate(localTime: number, weight: number): void;
}
```

**Implementation Checklist:**
- [ ] Clip management
- [ ] Overlap/blend handling
- [ ] Mute/lock states
- [ ] Binding to entities

---

### 31.1.4 Track Types

**AnimationTrack.ts:**
- [ ] Animation clip playback
- [ ] Root motion options
- [ ] Avatar masks
- [ ] Blend in/out

**AudioTrack.ts:**
- [ ] Audio clip playback
- [ ] Volume curves
- [ ] Spatial audio binding

**CameraTrack.ts:**
- [ ] Camera shots
- [ ] Blend between cameras
- [ ] Virtual cameras

**ActivationTrack.ts:**
- [ ] Entity enable/disable
- [ ] Component enable/disable

**SignalTrack.ts:**
- [ ] Fire signals at specific times
- [ ] Custom payload data

---

### 31.1.5 `src/timeline/playables/PlayableDirector.ts`

**Role:** Timeline playback controller.

**Public API:**
```typescript
class PlayableDirector {
  // Timeline
  timeline: Timeline | null;

  // Bindings
  setBinding(track: Track, target: Entity): void;
  getBinding(track: Track): Entity | null;
  clearBindings(): void;

  // Playback
  play(): void;
  pause(): void;
  stop(): void;
  get state(): PlayState;

  // Time
  get time(): number;
  set time(value: number);
  get duration(): number;
  timeScale: number;

  // Wrap mode
  wrapMode: WrapMode;

  // Events
  onPlay: Signal<() => void>;
  onPause: Signal<() => void>;
  onStop: Signal<() => void>;
  onComplete: Signal<() => void>;
  onSignal: Signal<(signal: SignalAsset, data: any) => void>;
}

enum PlayState { STOPPED, PLAYING, PAUSED }
enum WrapMode { NONE, LOOP, HOLD }
```

**Implementation Checklist:**
- [ ] Timeline binding
- [ ] Playback control
- [ ] Time scrubbing
- [ ] Wrap modes
- [ ] Signal emission
- [ ] **Tests:** Playback lifecycle

---

---

## 32. Profiling & Debugging

---

## 32.1 `src/profiling/` – Profiling System

### Directory Structure

```
src/profiling/
├── Profiler.ts
├── ProfilerSession.ts
├── FrameTimer.ts
├── GPUProfiler.ts
├── MemoryProfiler.ts
├── markers/
│   ├── ProfileMarker.ts
│   ├── ScopeMarker.ts
│   └── CounterMarker.ts
├── visualization/
│   ├── ProfilerOverlay.ts
│   ├── FrameGraph.ts
│   ├── FlameGraph.ts
│   └── TimelineView.ts
├── export/
│   ├── ChromeTraceExporter.ts
│   └── JSONExporter.ts
└── index.ts
```

---

### 32.1.1 `src/profiling/Profiler.ts`

**Role:** Performance profiling system.

**Public API:**
```typescript
class Profiler {
  // Control
  static enable(): void;
  static disable(): void;
  static get isEnabled(): boolean;

  // Sessions
  static beginSession(name: string): ProfilerSession;
  static endSession(): void;
  static get activeSession(): ProfilerSession | null;

  // Markers
  static beginSample(name: string): void;
  static endSample(): void;
  static marker(name: string): ProfileMarker;

  // Counters
  static setCounter(name: string, value: number): void;
  static incrementCounter(name: string, delta?: number): void;

  // Frame timing
  static tick(dt: number): void;
  static get frameTime(): number;
  static get fps(): number;
  static get frameTimeHistory(): number[];

  // GPU
  static readonly gpu: GPUProfiler;

  // Memory
  static readonly memory: MemoryProfiler;

  // Export
  static exportChromeTrace(): string;
  static exportJSON(): string;
}
```

**Dependencies:**
- Depends on: All profiler components
- Depended by: `Engine`, `Diagnostics`

**Implementation Checklist:**
- [ ] Hierarchical sampling
- [ ] Counter tracking
- [ ] Frame timing history
- [ ] GPU timing integration
- [ ] Memory tracking
- [ ] Chrome trace export
- [ ] Low overhead when disabled
- [ ] **Performance:** < 0.1ms overhead
- [ ] **Tests:** Marker accuracy

---

### 32.1.2 `src/profiling/GPUProfiler.ts`

**Role:** GPU timing and statistics.

**Public API:**
```typescript
class GPUProfiler {
  // Timing
  beginQuery(name: string): void;
  endQuery(name: string): void;
  getQueryTime(name: string): number;

  // Statistics
  get drawCalls(): number;
  get triangles(): number;
  get textureMemory(): number;
  get bufferMemory(): number;
  get pipelineChanges(): number;

  // Frame
  beginFrame(): void;
  endFrame(): void;
  getFrameStats(): GPUFrameStats;
}

interface GPUFrameStats {
  gpuTime: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  passBreakdown: Map<string, number>;
}
```

**Implementation Checklist:**
- [ ] Timestamp queries (WebGPU)
- [ ] Draw call counting
- [ ] Memory tracking
- [ ] Per-pass breakdown
- [ ] **Tests:** Query accuracy

---

### 32.1.3 `src/profiling/visualization/ProfilerOverlay.ts`

**Role:** On-screen profiler display.

**Public API:**
```typescript
class ProfilerOverlay {
  // Visibility
  show(): void;
  hide(): void;
  toggle(): void;
  get isVisible(): boolean;

  // Mode
  setMode(mode: OverlayMode): void;

  // Position
  setPosition(corner: ScreenCorner): void;

  // Update
  update(): void;
  render(context: RenderContext): void;
}

enum OverlayMode { MINIMAL, STANDARD, DETAILED, FRAME_GRAPH, FLAME_GRAPH }
enum ScreenCorner { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT }
```

**Implementation Checklist:**
- [ ] FPS counter
- [ ] Frame time graph
- [ ] Memory usage
- [ ] GPU stats
- [ ] Flame graph view
- [ ] Keyboard toggle (F3 or ~)

---

---

## 33. Analytics & Telemetry

---

## 33.1 `src/analytics/` – Analytics System

### Directory Structure

```
src/analytics/
├── AnalyticsManager.ts
├── EventTracker.ts
├── MetricsCollector.ts
├── SessionManager.ts
├── UserProfile.ts
├── providers/
│   ├── AnalyticsProvider.ts
│   ├── ConsoleProvider.ts
│   ├── CustomProvider.ts
│   └── BatchingProvider.ts
├── privacy/
│   ├── ConsentManager.ts
│   └── DataAnonymizer.ts
└── index.ts
```

---

### 33.1.1 `src/analytics/AnalyticsManager.ts`

**Role:** Central analytics coordination.

**Public API:**
```typescript
class AnalyticsManager {
  // Configuration
  initialize(config: AnalyticsConfig): Promise<void>;
  setUserId(userId: string): void;
  setUserProperty(key: string, value: any): void;

  // Events
  trackEvent(name: string, properties?: Record<string, any>): void;
  trackScreen(screenName: string): void;
  trackTiming(category: string, name: string, duration: number): void;
  trackError(error: Error, fatal?: boolean): void;

  // Sessions
  startSession(): void;
  endSession(): void;
  get sessionDuration(): number;

  // Consent
  setConsent(granted: boolean): void;
  get hasConsent(): boolean;

  // Flushing
  flush(): Promise<void>;
}

interface AnalyticsConfig {
  providers: AnalyticsProvider[];
  sessionTimeout: number;
  batchSize: number;
  flushInterval: number;
  anonymizeIP: boolean;
}
```

**Dependencies:**
- Depends on: `EventTracker`, `MetricsCollector`, providers
- Depended by: Game systems

**Implementation Checklist:**
- [ ] Event tracking
- [ ] User properties
- [ ] Session management
- [ ] Consent handling
- [ ] Batched sending
- [ ] Offline queuing
- [ ] **Tests:** Event flow

---

---

## 34. Cloud Services

---

## 34.1 `src/cloud/` – Cloud Services

### Directory Structure

```
src/cloud/
├── CloudManager.ts
├── Authentication.ts
├── CloudSave.ts
├── Leaderboards.ts
├── Achievements.ts
├── RemoteConfig.ts
├── Matchmaking.ts
├── ContentDelivery.ts
└── index.ts
```

---

### 34.1.1 `src/cloud/CloudManager.ts`

**Role:** Cloud service coordination.

**Public API:**
```typescript
class CloudManager {
  // Initialization
  initialize(config: CloudConfig): Promise<void>;
  dispose(): void;

  // Services
  readonly auth: Authentication;
  readonly save: CloudSave;
  readonly leaderboards: Leaderboards;
  readonly achievements: Achievements;
  readonly remoteConfig: RemoteConfig;
  readonly matchmaking: Matchmaking;
  readonly cdn: ContentDelivery;

  // Status
  get isOnline(): boolean;
  get isAuthenticated(): boolean;
  onConnectionChange: Signal<(online: boolean) => void>;
}
```

**Implementation Checklist:**
- [ ] Service initialization
- [ ] Connection monitoring
- [ ] Offline mode handling
- [ ] **Tests:** Connection states

---

### 34.1.2 `src/cloud/CloudSave.ts`

**Role:** Cloud save synchronization.

**Public API:**
```typescript
class CloudSave {
  // Save
  save(key: string, data: any): Promise<void>;
  saveMultiple(saves: Map<string, any>): Promise<void>;

  // Load
  load<T>(key: string): Promise<T | null>;
  loadAll(): Promise<Map<string, any>>;

  // Conflict resolution
  onConflict: Signal<(local: any, cloud: any) => Promise<'local' | 'cloud' | 'merge'>>;

  // Status
  get isSyncing(): boolean;
  get lastSyncTime(): Date | null;
}
```

**Implementation Checklist:**
- [ ] Key-value cloud storage
- [ ] Conflict detection
- [ ] Automatic sync
- [ ] Offline queue
- [ ] **Tests:** Sync scenarios

---

---

## 35. Localization

---

## 35.1 `src/localization/` – Localization System

### Directory Structure

```
src/localization/
├── LocalizationManager.ts
├── Locale.ts
├── StringTable.ts
├── Pluralization.ts
├── DateFormatter.ts
├── NumberFormatter.ts
├── loaders/
│   ├── JSONLocaleLoader.ts
│   └── CSVLocaleLoader.ts
└── index.ts
```

---

### 35.1.1 `src/localization/LocalizationManager.ts`

**Role:** Text localization system.

**Public API:**
```typescript
class LocalizationManager {
  // Configuration
  initialize(config: LocalizationConfig): Promise<void>;
  loadLocale(localeCode: string): Promise<void>;
  preloadLocales(localeCodes: string[]): Promise<void>;

  // Current locale
  setLocale(localeCode: string): void;
  get locale(): string;
  get availableLocales(): string[];

  // Translation
  translate(key: string, params?: Record<string, any>): string;
  translatePlural(key: string, count: number, params?: Record<string, any>): string;
  hasTranslation(key: string): boolean;

  // Formatting
  formatNumber(value: number, options?: NumberFormatOptions): string;
  formatDate(date: Date, format?: string): string;
  formatCurrency(value: number, currency: string): string;

  // Events
  onLocaleChanged: Signal<(locale: string) => void>;
}

interface LocalizationConfig {
  defaultLocale: string;
  fallbackLocale: string;
  localesPath: string;
}
```

**Dependencies:**
- Depends on: `StringTable`, formatters
- Depended by: UI system, all text display

**Implementation Checklist:**
- [ ] String key translation
- [ ] Parameter substitution
- [ ] Pluralization rules
- [ ] Number/date formatting
- [ ] Fallback chain
- [ ] Locale hot-swap
- [ ] **Tests:** All locales

---

---

## Next Document

Continue to `PRD-Final-11-Testing-Phases.md` for Testing and Implementation Phases.

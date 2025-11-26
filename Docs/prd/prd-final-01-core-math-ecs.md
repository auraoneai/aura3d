# G3D 5.0 PRD – Part 1: Core, Math, ECS

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 4. Core, Math, ECS

---

## 4.1 `src/core/` – Engine Foundation

### Directory Structure

```
src/core/
├── Engine.ts
├── EngineConfig.ts
├── Time.ts
├── Logger.ts
├── ObjectPool.ts
├── EventBus.ts
├── TaskScheduler.ts
├── Diagnostics.ts
├── Panic.ts
├── Assert.ts
├── Random.ts
├── IdGenerator.ts
├── BuildInfo.ts
└── index.ts
```

---

### 4.1.1 `src/core/Engine.ts`

**Role:** Main entry point and orchestrator for all engine subsystems.

**Public API:**
```typescript
class Engine {
  static instance: Engine;

  // Lifecycle
  initialize(config: EngineConfig): Promise<void>;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  destroy(): Promise<void>;

  // State
  get isRunning(): boolean;
  get isPaused(): boolean;
  get world(): World;
  get renderer(): Renderer;
  get config(): EngineConfig;

  // Hooks
  onBeforeUpdate: Signal<(dt: number) => void>;
  onAfterUpdate: Signal<(dt: number) => void>;
  onBeforeRender: Signal<() => void>;
  onAfterRender: Signal<() => void>;
  onError: Signal<(error: Error) => void>;
}
```

**Dependencies:**
- Depends on: `EngineConfig`, `Time`, `Logger`, `EventBus`, all subsystem managers
- Depended by: Application entry point, all subsystems (for registration)

**Implementation Checklist:**
- [ ] Singleton pattern with explicit initialization
- [ ] `initialize()` creates and wires: ECS World, Renderer, Physics, Audio, Net, UI, Input, Asset systems
- [ ] `initialize()` validates config and logs startup diagnostics
- [ ] `start()` begins the main loop using `requestAnimationFrame`
- [ ] `stop()` cleanly halts the loop and allows restart
- [ ] `pause()`/`resume()` freeze/unfreeze simulation without destroying state
- [ ] `destroy()` properly disposes all GPU resources, event listeners, and subsystems
- [ ] Main loop follows exact order from Section 2.1 of Overview
- [ ] Hooks fire at correct points in frame lifecycle
- [ ] Error boundaries catch and report subsystem failures without crashing
- [ ] Zero allocations in per-frame update path (pre-allocated frame info objects)
- [ ] Frame timing tracked and exposed via `Time`
- [ ] **Performance:** Main loop overhead < 0.1ms per frame
- [ ] **Tests:** Unit tests for lifecycle states, integration test for full startup/shutdown

---

### 4.1.2 `src/core/EngineConfig.ts`

**Role:** Complete configuration schema for all engine subsystems.

**Public API:**
```typescript
interface EngineConfig {
  // Core
  canvas: HTMLCanvasElement;
  targetFPS: number;
  fixedTimestep: number;
  maxFixedStepsPerFrame: number;

  // Quality presets
  qualityPreset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';

  // Subsystem configs
  rendering: RenderingConfig;
  physics: PhysicsConfig;
  audio: AudioConfig;
  networking: NetworkConfig;
  ai: AIConfig;

  // Feature flags
  features: FeatureFlags;
}

function createDefaultConfig(): EngineConfig;
function mergeConfigs(base: EngineConfig, overrides: Partial<EngineConfig>): EngineConfig;
function getPresetConfig(preset: QualityPreset): Partial<EngineConfig>;
function detectOptimalConfig(): Partial<EngineConfig>;
```

**Dependencies:**
- Depends on: None (leaf module)
- Depended by: `Engine`, all subsystem initializers

**Implementation Checklist:**
- [ ] Complete type definitions for all subsystem configs
- [ ] `createDefaultConfig()` returns safe, cross-platform defaults
- [ ] `mergeConfigs()` performs deep merge with type safety
- [ ] Quality presets (low/medium/high/ultra) with appropriate settings:
  - [ ] Low: 720p, no SSAO/SSR/GI, simplified shadows, 30 FPS physics
  - [ ] Medium: 1080p, SSAO, basic shadows, 60 FPS physics
  - [ ] High: 1080p+, SSR, cascaded shadows, TAA
  - [ ] Ultra: Native resolution, full GI, volumetrics, 8x MSAA
- [ ] `detectOptimalConfig()` uses WebGL/WebGPU capability detection
- [ ] `detectOptimalConfig()` considers device memory, GPU tier, battery status
- [ ] Serialization to/from JSON for config persistence
- [ ] Config validation with meaningful error messages
- [ ] Runtime config changes where supported (quality scaling)
- [ ] **Tests:** Unit tests for merge logic, preset generation, validation

---

### 4.1.3 `src/core/Time.ts`

**Role:** Frame timing, fixed timestep accumulator, and time management.

**Public API:**
```typescript
class Time {
  // Frame timing
  static deltaTime: number;           // Variable dt for rendering
  static fixedDeltaTime: number;      // Fixed dt for physics
  static unscaledDeltaTime: number;   // Ignores timeScale
  static time: number;                // Total elapsed time
  static frameCount: number;          // Total frames rendered

  // Time control
  static timeScale: number;           // 0 = paused, 1 = normal, 2 = 2x speed
  static maxDeltaTime: number;        // Cap for spiral of death prevention

  // Fixed timestep
  static fixedTime: number;           // Accumulated fixed time
  static fixedStepCount: number;      // Fixed steps this frame

  // Methods
  static update(): void;
  static getFixedStepIterator(): Generator<number>;
  static reset(): void;
}
```

**Dependencies:**
- Depends on: None
- Depended by: `Engine`, `PhysicsSystem`, all time-dependent systems

**Implementation Checklist:**
- [ ] High-precision timing using `performance.now()`
- [ ] Fixed timestep accumulator pattern for deterministic physics:
  ```typescript
  accumulator += deltaTime;
  while (accumulator >= fixedDeltaTime) {
    // Fixed step
    accumulator -= fixedDeltaTime;
    fixedStepCount++;
  }
  ```
- [ ] Maximum fixed steps per frame (default 8) to prevent spiral of death
- [ ] `timeScale` affects `deltaTime` but not `unscaledDeltaTime`
- [ ] `maxDeltaTime` caps extremely large deltas (tab hidden, debugger pause)
- [ ] Frame count as monotonically increasing integer
- [ ] `getFixedStepIterator()` yields interpolation alpha for smooth rendering
- [ ] Handles page visibility change (reset accumulator on tab return)
- [ ] Thread-safe design (no race conditions with Web Workers)
- [ ] **Performance:** < 0.01ms per update
- [ ] **Tests:** Unit tests for accumulator behavior, time scaling, edge cases

---

### 4.1.4 `src/core/Logger.ts`

**Role:** Structured logging with categories, levels, and multiple outputs.

**Public API:**
```typescript
enum LogLevel { TRACE, DEBUG, INFO, WARN, ERROR, FATAL }

interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  timestamp: number;
  data?: unknown;
  stack?: string;
}

class Logger {
  static setLevel(category: string, level: LogLevel): void;
  static setGlobalLevel(level: LogLevel): void;
  static addSink(sink: LogSink): void;
  static removeSink(sink: LogSink): void;

  // Category-based logging
  static trace(category: string, message: string, data?: unknown): void;
  static debug(category: string, message: string, data?: unknown): void;
  static info(category: string, message: string, data?: unknown): void;
  static warn(category: string, message: string, data?: unknown): void;
  static error(category: string, message: string, data?: unknown): void;
  static fatal(category: string, message: string, data?: unknown): void;

  // Scoped logger factory
  static create(category: string): ScopedLogger;
}

interface LogSink {
  write(entry: LogEntry): void;
}
```

**Dependencies:**
- Depends on: None
- Depended by: All subsystems

**Implementation Checklist:**
- [ ] Per-category log level filtering
- [ ] Global level override for quick silencing
- [ ] Built-in sinks: ConsoleSink, ArraySink (for in-engine console)
- [ ] Remote sink interface for cloud logging integration
- [ ] Log entry includes timestamp, category, stack trace (for errors)
- [ ] Structured data attachment (JSON-serializable)
- [ ] `ScopedLogger` pre-binds category for convenience
- [ ] Conditional compilation: TRACE/DEBUG stripped in production builds
- [ ] Rate limiting to prevent log spam (max N messages per category per second)
- [ ] Log history buffer (last 1000 entries) for debugging
- [ ] **Performance:** Logging disabled categories has near-zero overhead
- [ ] **Tests:** Unit tests for level filtering, sink routing, rate limiting

---

### 4.1.5 `src/core/ObjectPool.ts`

**Role:** Generic object pooling for allocation-free gameplay.

**Public API:**
```typescript
class ObjectPool<T> {
  constructor(factory: () => T, reset: (obj: T) => void, initialSize?: number);

  acquire(): T;
  release(obj: T): void;

  get activeCount(): number;
  get pooledCount(): number;
  get totalCreated(): number;

  prewarm(count: number): void;
  shrink(targetSize: number): void;
  clear(): void;
}

// Specialized pools
class Vector3Pool extends ObjectPool<Vector3> { }
class Matrix4Pool extends ObjectPool<Matrix4> { }
class ComponentPool<C extends Component> extends ObjectPool<C> { }
```

**Dependencies:**
- Depends on: None
- Depended by: `Math` types, `ECS` components, `Particles`, temp allocations

**Implementation Checklist:**
- [ ] Generic pool with factory and reset functions
- [ ] `acquire()` returns pooled instance or creates new if empty
- [ ] `release()` calls reset function and returns to pool
- [ ] Double-release detection in debug builds (assertion)
- [ ] Use-after-release detection in debug builds
- [ ] `prewarm()` pre-creates objects to avoid runtime allocations
- [ ] `shrink()` releases excess pooled objects (memory pressure response)
- [ ] Statistics tracking: active, pooled, total created, high water mark
- [ ] Thread-safe variant for Web Worker usage
- [ ] Specialized math pools with proper reset semantics
- [ ] **Performance:** `acquire()`/`release()` < 0.001ms
- [ ] **Tests:** Unit tests for acquire/release cycles, edge cases, stats

---

### 4.1.6 `src/core/EventBus.ts`

**Role:** Type-safe publish/subscribe for engine-level events.

**Public API:**
```typescript
interface EventMap {
  'engine:start': void;
  'engine:stop': void;
  'engine:pause': void;
  'engine:resume': void;
  'scene:load': { sceneName: string };
  'scene:unload': { sceneName: string };
  'asset:loaded': { assetId: string; assetType: string };
  'error:fatal': { error: Error };
  // ... extensible
}

class EventBus {
  static on<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ): () => void;  // Returns unsubscribe function

  static once<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ): () => void;

  static emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;

  static off<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ): void;

  static clear(): void;
}
```

**Dependencies:**
- Depends on: None
- Depended by: `Engine`, scene management, asset loading, error handling

**Implementation Checklist:**
- [ ] Type-safe event registration using TypeScript mapped types
- [ ] `on()` returns unsubscribe function for easy cleanup
- [ ] `once()` auto-unsubscribes after first invocation
- [ ] `emit()` calls all handlers synchronously in registration order
- [ ] Handler errors caught and logged, don't break other handlers
- [ ] Priority system for handler ordering (optional)
- [ ] Wildcard subscription for debugging (`*` matches all events)
- [ ] Event queue mode for deferred processing
- [ ] Memory leak detection: warn if handlers accumulate without cleanup
- [ ] **Performance:** Event dispatch < 0.01ms for 10 handlers
- [ ] **Tests:** Unit tests for subscribe/emit/unsubscribe, type safety

---

### 4.1.7 `src/core/TaskScheduler.ts`

**Role:** Background task scheduling and async job management.

**Public API:**
```typescript
enum TaskPriority { LOW, NORMAL, HIGH, CRITICAL }

interface Task {
  id: string;
  priority: TaskPriority;
  execute: () => Promise<void> | void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

class TaskScheduler {
  static schedule(task: Task): string;  // Returns task ID
  static cancel(taskId: string): boolean;
  static cancelAll(): void;

  // Frame-budget tasks (run during idle time)
  static scheduleIdle(
    task: () => boolean,  // Returns true when complete
    maxTimeMs: number
  ): string;

  // Deferred to next frame
  static defer(fn: () => void): void;

  // Process pending tasks (called by Engine)
  static update(budgetMs: number): void;

  get pendingCount(): number;
  get isProcessing(): boolean;
}
```

**Dependencies:**
- Depends on: `Logger`
- Depended by: Asset loading, mesh generation, AI pathfinding

**Implementation Checklist:**
- [ ] Priority queue for task ordering
- [ ] Uses `requestIdleCallback` when available, fallback to setTimeout
- [ ] `scheduleIdle()` for interruptible tasks (e.g., mesh simplification)
- [ ] Time-sliced execution respects frame budget
- [ ] Task cancellation with proper cleanup
- [ ] `defer()` for next-frame execution (batched callbacks)
- [ ] Error handling per task, doesn't affect other tasks
- [ ] Task dependencies (task B waits for task A)
- [ ] Progress reporting for long-running tasks
- [ ] Statistics: tasks completed, average duration, queue depth
- [ ] **Performance:** Scheduling overhead < 0.1ms
- [ ] **Tests:** Unit tests for priority ordering, cancellation, time budgeting

---

### 4.1.8 `src/core/Diagnostics.ts`

**Role:** Central diagnostics API for runtime health monitoring.

**Public API:**
```typescript
interface DiagnosticReport {
  timestamp: number;
  fps: number;
  frameTime: number;
  memoryUsage: MemoryInfo;
  gpuMemory: number;
  entityCount: number;
  drawCalls: number;
  triangles: number;
  warnings: string[];
  errors: string[];
}

class Diagnostics {
  static enable(): void;
  static disable(): void;
  static get isEnabled(): boolean;

  static warn(subsystem: string, message: string): void;
  static error(subsystem: string, message: string): void;
  static perfWarning(metric: string, value: number, threshold: number): void;

  static getReport(): DiagnosticReport;
  static onReport: Signal<(report: DiagnosticReport) => void>;

  // Integration points
  static registerMetric(name: string, getter: () => number): void;
  static unregisterMetric(name: string): void;
}
```

**Dependencies:**
- Depends on: `Logger`, `Time`
- Depended by: `Engine`, `Profiler`, `Editor`

**Implementation Checklist:**
- [ ] Aggregates metrics from all subsystems
- [ ] Performance warnings when metrics exceed thresholds
- [ ] Memory monitoring using `performance.memory` (Chrome) or estimation
- [ ] GPU memory tracking via WebGL/WebGPU extensions
- [ ] Warning/error history with timestamps
- [ ] Report generation for debugging
- [ ] Signal for real-time monitoring (editor overlay)
- [ ] Metric registration for subsystem-specific stats
- [ ] Enabled by default in development, disabled in production
- [ ] **Tests:** Unit tests for metric aggregation, threshold warnings

---

### 4.1.9 `src/core/Panic.ts`

**Role:** Hard failure handler for unrecoverable errors.

**Public API:**
```typescript
class Panic {
  static handler: (error: Error, context: string) => void;

  static panic(message: string, context?: string): never;
  static panicIf(condition: boolean, message: string, context?: string): void;

  static setCustomHandler(handler: (error: Error, context: string) => void): void;
  static resetHandler(): void;
}
```

**Dependencies:**
- Depends on: `Logger`
- Depended by: All critical code paths

**Implementation Checklist:**
- [ ] Default handler logs error and throws
- [ ] Custom handler support for user-friendly fatal screens
- [ ] `panic()` creates Error with full stack trace
- [ ] `panicIf()` conditional panic for guard clauses
- [ ] Context string identifies failing subsystem
- [ ] Attempt to save diagnostics before crash
- [ ] Editor integration shows panic dialog
- [ ] Production builds can report to analytics before crash
- [ ] **Tests:** Unit tests for panic behavior, custom handlers

---

### 4.1.10 `src/core/Assert.ts`

**Role:** Assertion utilities for development-time validation.

**Public API:**
```typescript
class Assert {
  static isTrue(condition: boolean, message?: string): asserts condition;
  static isFalse(condition: boolean, message?: string): void;
  static isDefined<T>(value: T | undefined | null, message?: string): asserts value is T;
  static isNumber(value: unknown, message?: string): asserts value is number;
  static isFinite(value: number, message?: string): void;
  static isInRange(value: number, min: number, max: number, message?: string): void;
  static isArray<T>(value: unknown, message?: string): asserts value is T[];
  static isInstanceOf<T>(value: unknown, type: new (...args: any[]) => T, message?: string): asserts value is T;
  static unreachable(message?: string): never;
}
```

**Dependencies:**
- Depends on: None
- Depended by: All modules for validation

**Implementation Checklist:**
- [ ] All assertions throw `AssertionError` with descriptive message
- [ ] Stack trace points to assertion call site
- [ ] `unreachable()` for exhaustive switch statements
- [ ] Build-time stripping in production via dead code elimination
- [ ] TypeScript assertion signatures for type narrowing
- [ ] Performance: zero overhead when stripped
- [ ] **Tests:** Unit tests verify assertions throw correctly

---

### 4.1.11 `src/core/Random.ts`

**Role:** Seedable random number generation for deterministic simulation.

**Public API:**
```typescript
class Random {
  constructor(seed?: number);

  // Core
  next(): number;                    // [0, 1)
  nextInt(max: number): number;      // [0, max)
  nextRange(min: number, max: number): number;
  nextIntRange(min: number, max: number): number;

  // Distributions
  nextGaussian(mean?: number, stdDev?: number): number;
  nextExponential(lambda?: number): number;

  // Utilities
  pick<T>(array: T[]): T;
  shuffle<T>(array: T[]): T[];
  weightedPick<T>(items: T[], weights: number[]): T;

  // State
  get seed(): number;
  set seed(value: number);
  getState(): number;
  setState(state: number): void;

  // Global instance
  static global: Random;
}
```

**Dependencies:**
- Depends on: None
- Depended by: Procedural generation, particles, AI, physics noise

**Implementation Checklist:**
- [ ] Implements xorshift128+ or similar high-quality PRNG
- [ ] Deterministic output for same seed (critical for replays)
- [ ] State save/restore for checkpointing
- [ ] Gaussian distribution using Box-Muller transform
- [ ] `shuffle()` using Fisher-Yates algorithm
- [ ] `weightedPick()` for probability-weighted selection
- [ ] Global instance for convenience, seedable for testing
- [ ] Seed from `crypto.getRandomValues()` by default
- [ ] **Tests:** Statistical tests for distribution quality, determinism tests

---

### 4.1.12 `src/core/IdGenerator.ts`

**Role:** Globally unique ID generation for entities and assets.

**Public API:**
```typescript
class IdGenerator {
  static nextEntityId(): number;
  static nextAssetId(): string;
  static nextUUID(): string;

  // Namespaced IDs
  static next(namespace: string): number;

  // Deterministic IDs (for networking)
  static fromSeed(seed: string): string;

  // Reset (for testing only)
  static reset(): void;
}
```

**Dependencies:**
- Depends on: None
- Depended by: `ECS`, asset system, networking

**Implementation Checklist:**
- [ ] Entity IDs as incrementing integers (fast comparison)
- [ ] Asset IDs as compact base62 strings
- [ ] UUID v4 generation for cross-system references
- [ ] Namespace isolation prevents ID collision between systems
- [ ] `fromSeed()` generates deterministic IDs for network sync
- [ ] No ID reuse during session (even after entity destruction)
- [ ] Overflow handling for very long sessions (>2^53 entities)
- [ ] **Tests:** Uniqueness tests, overflow handling

---

### 4.1.13 `src/core/BuildInfo.ts`

**Role:** Build-time constants for version tracking and diagnostics.

**Public API:**
```typescript
const BuildInfo = {
  VERSION: string;           // Semantic version "5.0.0"
  VERSION_MAJOR: number;
  VERSION_MINOR: number;
  VERSION_PATCH: number;
  BUILD_NUMBER: number;
  BUILD_DATE: string;        // ISO date
  GIT_COMMIT: string;        // Short hash
  GIT_BRANCH: string;
  IS_DEVELOPMENT: boolean;
  IS_PRODUCTION: boolean;
} as const;
```

**Dependencies:**
- Depends on: Build system (injected at compile time)
- Depended by: `Diagnostics`, analytics, crash reporting

**Implementation Checklist:**
- [ ] All values injected at build time via bundler
- [ ] `IS_DEVELOPMENT` enables debug features
- [ ] `IS_PRODUCTION` enables optimizations, strips asserts
- [ ] Version follows semantic versioning
- [ ] Git info captured from build environment
- [ ] Exposed in console on engine start (development only)
- [ ] **Tests:** Build system integration test

---

### 4.1.14 `src/core/index.ts`

**Role:** Barrel export for core module.

**Implementation Checklist:**
- [ ] Re-exports all public APIs from core files
- [ ] No logic, only exports
- [ ] Tree-shakeable exports

---

## 4.2 `src/math/` – Core Mathematics

### Directory Structure

```
src/math/
├── Vector2.ts
├── Vector3.ts
├── Vector4.ts
├── Matrix3.ts
├── Matrix4.ts
├── Quaternion.ts
├── Color.ts
├── Rect.ts
├── Box3.ts
├── Sphere.ts
├── Plane.ts
├── Ray.ts
├── Frustum.ts
├── Transform.ts
├── Spline.ts
├── Interpolation.ts
├── Easing.ts
├── RandomMath.ts
├── MathConstants.ts
└── index.ts
```

---

### 4.2.0 Math Module Group Checklist

**All math primitive files (Vector2/3/4, Matrix3/4, Quaternion, Color) must implement:**

- [ ] Full basic operations: add, sub, mul, div, scale
- [ ] Length, lengthSquared, normalize, negate
- [ ] Dot product (where applicable)
- [ ] Cross product (Vector3)
- [ ] Static and instance method variants
- [ ] In-place mutation methods (for allocation-free paths): `addInPlace()`, etc.
- [ ] `clone()` and `copy(other)` methods
- [ ] `equals(other, epsilon?)` with floating-point tolerance
- [ ] `toArray()` and `fromArray(arr, offset?)` for buffer interop
- [ ] `set(x, y, z?, w?)` for bulk assignment
- [ ] Static factory methods: `zero()`, `one()`, `unitX/Y/Z()`
- [ ] JSON serialization: `toJSON()` and `fromJSON()`
- [ ] Object pooling integration via `ObjectPool`
- [ ] Zero allocations in hot-path methods (return `this` or use out parameter)
- [ ] TypedArray backing for SIMD-friendly memory layout
- [ ] **Tests:** >90% coverage, numerical edge cases (denormals, infinity, NaN)

---

### 4.2.1 `src/math/Vector2.ts`

**Role:** 2D vector for UI, texture coordinates, 2D physics.

**Public API:**
```typescript
class Vector2 {
  x: number;
  y: number;

  constructor(x?: number, y?: number);

  // Operations
  add(v: Vector2): Vector2;
  sub(v: Vector2): Vector2;
  mul(v: Vector2): Vector2;
  scale(s: number): Vector2;
  dot(v: Vector2): number;
  cross(v: Vector2): number;  // Returns scalar (2D cross)

  length(): number;
  lengthSquared(): number;
  normalize(): Vector2;

  lerp(v: Vector2, t: number): Vector2;
  angle(): number;
  rotate(radians: number): Vector2;

  // In-place variants
  addInPlace(v: Vector2): this;
  // ... etc

  // Static
  static zero(): Vector2;
  static one(): Vector2;
  static distance(a: Vector2, b: Vector2): number;
}
```

**Dependencies:**
- Depends on: `MathConstants`
- Depended by: UI system, texture mapping, 2D collisions

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `cross()` returns scalar z-component of 3D cross
- [ ] `angle()` returns angle from positive x-axis
- [ ] `rotate()` around origin
- [ ] `perpendicular()` returns 90° rotated vector
- [ ] `reflect(normal)` for bounce calculations

---

### 4.2.2 `src/math/Vector3.ts`

**Role:** 3D vector for positions, directions, velocities.

**Public API:**
```typescript
class Vector3 {
  x: number;
  y: number;
  z: number;

  constructor(x?: number, y?: number, z?: number);

  // Operations
  add(v: Vector3): Vector3;
  sub(v: Vector3): Vector3;
  mul(v: Vector3): Vector3;
  scale(s: number): Vector3;
  dot(v: Vector3): number;
  cross(v: Vector3): Vector3;

  length(): number;
  lengthSquared(): number;
  normalize(): Vector3;
  negate(): Vector3;

  lerp(v: Vector3, t: number): Vector3;
  slerp(v: Vector3, t: number): Vector3;  // Spherical

  project(onto: Vector3): Vector3;
  reject(from: Vector3): Vector3;
  reflect(normal: Vector3): Vector3;

  applyMatrix3(m: Matrix3): Vector3;
  applyMatrix4(m: Matrix4): Vector3;
  applyQuaternion(q: Quaternion): Vector3;

  // Static
  static zero(): Vector3;
  static one(): Vector3;
  static up(): Vector3;      // (0, 1, 0)
  static forward(): Vector3; // (0, 0, -1) or (0, 0, 1) based on convention
  static right(): Vector3;   // (1, 0, 0)
  static distance(a: Vector3, b: Vector3): number;
  static angle(a: Vector3, b: Vector3): number;
}
```

**Dependencies:**
- Depends on: `MathConstants`, `Matrix3`, `Matrix4`, `Quaternion`
- Depended by: Nearly all 3D systems

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `cross()` follows right-hand rule
- [ ] `slerp()` for direction interpolation on unit sphere
- [ ] `project()` / `reject()` for vector decomposition
- [ ] `reflect()` for physics bounces
- [ ] Matrix/quaternion application for transforms
- [ ] Coordinate system: Y-up, right-handed (configurable)

---

### 4.2.3 `src/math/Vector4.ts`

**Role:** 4D vector for homogeneous coordinates, colors, quaternion data.

**Public API:**
```typescript
class Vector4 {
  x: number;
  y: number;
  z: number;
  w: number;

  constructor(x?: number, y?: number, z?: number, w?: number);

  // Operations
  add(v: Vector4): Vector4;
  sub(v: Vector4): Vector4;
  scale(s: number): Vector4;
  dot(v: Vector4): number;

  length(): number;
  normalize(): Vector4;

  applyMatrix4(m: Matrix4): Vector4;

  // Swizzling
  get xyz(): Vector3;
  get xy(): Vector2;

  // Static
  static zero(): Vector4;
  static one(): Vector4;
}
```

**Dependencies:**
- Depends on: `MathConstants`, `Vector2`, `Vector3`, `Matrix4`
- Depended by: Shaders, homogeneous transforms, RGBA colors

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Swizzle accessors for common conversions
- [ ] Perspective divide helper: `perspectiveDivide()` returns `xyz / w`

---

### 4.2.4 `src/math/Matrix3.ts`

**Role:** 3x3 matrix for 2D transforms, normal transforms, rotation matrices.

**Public API:**
```typescript
class Matrix3 {
  elements: Float32Array;  // Column-major, 9 elements

  constructor();

  // Operations
  multiply(m: Matrix3): Matrix3;
  multiplyScalar(s: number): Matrix3;
  transpose(): Matrix3;
  invert(): Matrix3;
  determinant(): number;

  // Transforms
  setFromMatrix4(m: Matrix4): Matrix3;  // Extract 3x3 rotation
  getNormalMatrix(m: Matrix4): Matrix3; // Inverse transpose for normals

  // Static
  static identity(): Matrix3;
  static rotation(radians: number): Matrix3;
  static scale(sx: number, sy: number): Matrix3;
  static translation(tx: number, ty: number): Matrix3;
}
```

**Dependencies:**
- Depends on: `MathConstants`
- Depended by: Normal mapping, 2D transforms, texture transforms

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Column-major storage for WebGL compatibility
- [ ] `getNormalMatrix()` computes inverse-transpose for correct normal transforms
- [ ] Determinant for invertibility check
- [ ] Robust inversion with near-zero determinant handling

---

### 4.2.5 `src/math/Matrix4.ts`

**Role:** 4x4 matrix for 3D transforms, projections, view matrices.

**Public API:**
```typescript
class Matrix4 {
  elements: Float32Array;  // Column-major, 16 elements

  constructor();

  // Operations
  multiply(m: Matrix4): Matrix4;
  premultiply(m: Matrix4): Matrix4;
  multiplyScalar(s: number): Matrix4;
  transpose(): Matrix4;
  invert(): Matrix4;
  determinant(): number;

  // Decomposition
  decompose(): { position: Vector3; rotation: Quaternion; scale: Vector3 };
  compose(position: Vector3, rotation: Quaternion, scale: Vector3): Matrix4;

  // Transform builders
  static identity(): Matrix4;
  static translation(x: number, y: number, z: number): Matrix4;
  static rotation(axis: Vector3, angle: number): Matrix4;
  static rotationX(radians: number): Matrix4;
  static rotationY(radians: number): Matrix4;
  static rotationZ(radians: number): Matrix4;
  static scale(x: number, y: number, z: number): Matrix4;
  static fromQuaternion(q: Quaternion): Matrix4;

  // View/Projection
  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4;
  static perspective(fov: number, aspect: number, near: number, far: number): Matrix4;
  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4;

  // Extraction
  getPosition(): Vector3;
  getScale(): Vector3;
  getMaxScaleOnAxis(): number;
}
```

**Dependencies:**
- Depends on: `MathConstants`, `Vector3`, `Quaternion`
- Depended by: Transform system, cameras, rendering

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Column-major storage for WebGL/WebGPU
- [ ] `decompose()` extracts TRS components from arbitrary matrix
- [ ] `compose()` builds matrix from TRS (order: Scale → Rotate → Translate)
- [ ] `lookAt()` creates view matrix
- [ ] `perspective()` with vertical FOV in radians
- [ ] Infinite far plane variant for reverse-Z
- [ ] Robust inversion for non-singular matrices
- [ ] **Performance:** Multiplication < 0.001ms

---

### 4.2.6 `src/math/Quaternion.ts`

**Role:** Unit quaternion for rotation representation.

**Public API:**
```typescript
class Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;

  constructor(x?: number, y?: number, z?: number, w?: number);

  // Operations
  multiply(q: Quaternion): Quaternion;
  conjugate(): Quaternion;
  invert(): Quaternion;
  normalize(): Quaternion;
  dot(q: Quaternion): number;

  length(): number;
  lengthSquared(): number;

  // Interpolation
  slerp(q: Quaternion, t: number): Quaternion;
  slerpFlat(q: Quaternion, t: number): Quaternion;  // Allocation-free

  // Conversions
  setFromAxisAngle(axis: Vector3, angle: number): Quaternion;
  setFromEuler(x: number, y: number, z: number, order?: string): Quaternion;
  setFromRotationMatrix(m: Matrix4): Quaternion;
  setFromUnitVectors(from: Vector3, to: Vector3): Quaternion;

  toAxisAngle(): { axis: Vector3; angle: number };
  toEuler(order?: string): Vector3;
  toMatrix4(): Matrix4;

  // Static
  static identity(): Quaternion;
  static fromAxisAngle(axis: Vector3, angle: number): Quaternion;
  static fromEuler(x: number, y: number, z: number, order?: string): Quaternion;
  static angle(a: Quaternion, b: Quaternion): number;
}
```

**Dependencies:**
- Depends on: `MathConstants`, `Vector3`, `Matrix4`
- Depended by: Transform system, animation, physics

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Always normalized for rotation representation
- [ ] `slerp()` handles quaternion sign flip for shortest path
- [ ] Euler conversion supports all 12 orders (XYZ, XZY, YXZ, etc.)
- [ ] `setFromUnitVectors()` for aligning directions
- [ ] Matrix extraction uses robust algorithm (no gimbal lock)
- [ ] Conjugate equals inverse for unit quaternions

---

### 4.2.7 `src/math/Color.ts`

**Role:** RGB/RGBA color with color space conversions.

**Public API:**
```typescript
class Color {
  r: number;  // [0, 1] linear
  g: number;
  b: number;
  a: number;

  constructor(r?: number, g?: number, b?: number, a?: number);

  // Operations
  add(c: Color): Color;
  multiply(c: Color): Color;
  scale(s: number): Color;
  lerp(c: Color, t: number): Color;

  // Conversions
  setHex(hex: number): Color;
  setHSL(h: number, s: number, l: number): Color;
  setHSV(h: number, s: number, v: number): Color;

  toHex(): number;
  toHSL(): { h: number; s: number; l: number };
  toHSV(): { h: number; s: number; v: number };
  toCSSString(): string;

  // Color space
  toLinear(): Color;      // sRGB → Linear
  toSRGB(): Color;        // Linear → sRGB

  // Static
  static white(): Color;
  static black(): Color;
  static red(): Color;
  static green(): Color;
  static blue(): Color;
  static fromHex(hex: number): Color;
  static fromCSS(css: string): Color;
}
```

**Dependencies:**
- Depends on: `MathConstants`
- Depended by: Materials, lighting, UI

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Internal storage in linear color space
- [ ] sRGB ↔ Linear conversion using proper gamma curves (2.2 or exact)
- [ ] CSS color string parsing (hex, rgb(), hsl())
- [ ] Premultiplied alpha support
- [ ] HDR values allowed (r/g/b > 1)
- [ ] Color temperature to RGB conversion

---

### 4.2.8 `src/math/Rect.ts`

**Role:** 2D axis-aligned rectangle for UI and 2D bounds.

**Public API:**
```typescript
class Rect {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x?: number, y?: number, width?: number, height?: number);

  // Properties
  get left(): number;
  get right(): number;
  get top(): number;
  get bottom(): number;
  get center(): Vector2;
  get size(): Vector2;

  // Operations
  contains(point: Vector2): boolean;
  containsRect(rect: Rect): boolean;
  intersects(rect: Rect): boolean;
  intersection(rect: Rect): Rect | null;
  union(rect: Rect): Rect;
  expand(amount: number): Rect;

  // Static
  static fromMinMax(min: Vector2, max: Vector2): Rect;
  static fromCenterSize(center: Vector2, size: Vector2): Rect;
}
```

**Dependencies:**
- Depends on: `Vector2`
- Depended by: UI layout, 2D rendering, texture atlases

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Convention: y increases downward (screen space)
- [ ] `intersection()` returns null for non-overlapping rects
- [ ] `union()` returns bounding rect

---

### 4.2.9 `src/math/Box3.ts`

**Role:** 3D axis-aligned bounding box for culling and collision.

**Public API:**
```typescript
class Box3 {
  min: Vector3;
  max: Vector3;

  constructor(min?: Vector3, max?: Vector3);

  // Properties
  get center(): Vector3;
  get size(): Vector3;
  get isEmpty(): boolean;

  // Operations
  setFromPoints(points: Vector3[]): Box3;
  setFromCenterAndSize(center: Vector3, size: Vector3): Box3;
  expandByPoint(point: Vector3): Box3;
  expandByScalar(scalar: number): Box3;

  containsPoint(point: Vector3): boolean;
  containsBox(box: Box3): boolean;
  intersectsBox(box: Box3): boolean;
  intersectsSphere(sphere: Sphere): boolean;
  intersectsPlane(plane: Plane): boolean;

  clampPoint(point: Vector3): Vector3;
  distanceToPoint(point: Vector3): number;

  union(box: Box3): Box3;
  intersection(box: Box3): Box3;

  applyMatrix4(m: Matrix4): Box3;

  // Static
  static empty(): Box3;
  static fromPoints(points: Vector3[]): Box3;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Matrix4`, `Sphere`, `Plane`
- Depended by: Culling, spatial partitioning, physics broad phase

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `isEmpty` checks for inverted bounds
- [ ] `applyMatrix4()` transforms 8 corners and rebuilds AABB
- [ ] Robust intersection tests with all primitives
- [ ] `setFromPoints()` handles empty arrays

---

### 4.2.10 `src/math/Sphere.ts`

**Role:** Bounding sphere for fast culling and collision.

**Public API:**
```typescript
class Sphere {
  center: Vector3;
  radius: number;

  constructor(center?: Vector3, radius?: number);

  // Operations
  setFromPoints(points: Vector3[], center?: Vector3): Sphere;
  setFromBox(box: Box3): Sphere;

  containsPoint(point: Vector3): boolean;
  intersectsSphere(sphere: Sphere): boolean;
  intersectsBox(box: Box3): boolean;
  intersectsPlane(plane: Plane): boolean;

  distanceToPoint(point: Vector3): number;
  clampPoint(point: Vector3): Vector3;

  applyMatrix4(m: Matrix4): Sphere;

  // Static
  static fromPoints(points: Vector3[]): Sphere;
  static fromBox(box: Box3): Sphere;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Matrix4`, `Box3`, `Plane`
- Depended by: Culling, LOD selection, physics

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `setFromPoints()` uses Ritter's algorithm or Welzl's for minimal sphere
- [ ] `applyMatrix4()` scales radius by max scale factor

---

### 4.2.11 `src/math/Plane.ts`

**Role:** Mathematical plane for clipping and frustum culling.

**Public API:**
```typescript
class Plane {
  normal: Vector3;
  constant: number;  // Distance from origin along normal

  constructor(normal?: Vector3, constant?: number);

  // Setup
  setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): Plane;
  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): Plane;

  // Operations
  normalize(): Plane;
  negate(): Plane;

  distanceToPoint(point: Vector3): number;
  distanceToSphere(sphere: Sphere): number;

  projectPoint(point: Vector3): Vector3;
  intersectLine(start: Vector3, end: Vector3): Vector3 | null;

  coplanarPoint(): Vector3;

  applyMatrix4(m: Matrix4, normalMatrix?: Matrix3): Plane;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Matrix3`, `Matrix4`, `Sphere`
- Depended by: Frustum culling, CSG, clipping

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Plane equation: `n · p + d = 0`
- [ ] `setFromCoplanarPoints()` uses cross product for normal
- [ ] Sign convention: positive distance = in front of plane
- [ ] `applyMatrix4()` requires normal matrix for correct transform

---

### 4.2.12 `src/math/Ray.ts`

**Role:** Ray for picking, raycasting, and collision queries.

**Public API:**
```typescript
class Ray {
  origin: Vector3;
  direction: Vector3;  // Must be normalized

  constructor(origin?: Vector3, direction?: Vector3);

  // Operations
  at(t: number): Vector3;
  lookAt(target: Vector3): Ray;

  distanceToPoint(point: Vector3): number;
  distanceSqToPoint(point: Vector3): number;
  closestPointToPoint(point: Vector3): Vector3;

  // Intersections
  intersectSphere(sphere: Sphere): Vector3 | null;
  intersectBox(box: Box3): Vector3 | null;
  intersectPlane(plane: Plane): Vector3 | null;
  intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling?: boolean): Vector3 | null;

  applyMatrix4(m: Matrix4): Ray;

  // Static
  static fromCamera(camera: Camera, ndcX: number, ndcY: number): Ray;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Matrix4`, `Sphere`, `Box3`, `Plane`
- Depended by: Picking, physics queries, AI sight

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `intersectTriangle()` uses Möller–Trumbore algorithm
- [ ] Returns intersection point and can provide t parameter
- [ ] Backface culling option for triangle intersection
- [ ] `fromCamera()` unprojects screen coordinates

---

### 4.2.13 `src/math/Frustum.ts`

**Role:** View frustum for visibility culling.

**Public API:**
```typescript
class Frustum {
  planes: [Plane, Plane, Plane, Plane, Plane, Plane];  // L, R, T, B, N, F

  constructor(planes?: Plane[]);

  // Setup
  setFromProjectionMatrix(m: Matrix4): Frustum;

  // Culling tests
  containsPoint(point: Vector3): boolean;
  intersectsBox(box: Box3): boolean;
  intersectsSphere(sphere: Sphere): boolean;

  // For debugging
  getCorners(): Vector3[];
}
```

**Dependencies:**
- Depends on: `Plane`, `Vector3`, `Matrix4`, `Box3`, `Sphere`
- Depended by: Culling system, LOD system

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Extracts 6 planes from projection × view matrix
- [ ] Optimized sphere test (early-out on any plane)
- [ ] Box test handles all 8 corners
- [ ] Plane normalization for correct distance calculations
- [ ] **Performance:** Box intersection < 0.001ms

---

### 4.2.14 `src/math/Transform.ts`

**Role:** Encapsulates position, rotation, scale with matrix computation.

**Public API:**
```typescript
class Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;

  constructor();

  // Matrix access
  get localMatrix(): Matrix4;
  get worldMatrix(): Matrix4;

  // Hierarchy
  parent: Transform | null;
  children: Transform[];

  addChild(child: Transform): void;
  removeChild(child: Transform): void;

  // World-space access
  get worldPosition(): Vector3;
  get worldRotation(): Quaternion;
  get worldScale(): Vector3;

  // Utilities
  lookAt(target: Vector3, up?: Vector3): void;
  rotateAround(point: Vector3, axis: Vector3, angle: number): void;

  // Dirty tracking
  get isDirty(): boolean;
  updateMatrix(): void;
  updateWorldMatrix(force?: boolean): void;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Quaternion`, `Matrix4`
- Depended by: ECS TransformComponent, scene graph

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Dirty flag for lazy matrix recomputation
- [ ] Parent-child hierarchy with automatic world matrix updates
- [ ] World matrix = parent.worldMatrix × localMatrix
- [ ] `lookAt()` sets rotation to face target
- [ ] Handles non-uniform scale in hierarchy (with warnings)
- [ ] Event/signal when transform changes (for observers)

---

### 4.2.15 `src/math/Spline.ts`

**Role:** Spline curves for animation paths and procedural geometry.

**Public API:**
```typescript
enum SplineType { LINEAR, CATMULL_ROM, BEZIER, B_SPLINE, HERMITE }

class Spline {
  points: Vector3[];
  type: SplineType;
  closed: boolean;
  tension: number;  // For Catmull-Rom

  constructor(points?: Vector3[], type?: SplineType);

  // Evaluation
  getPoint(t: number): Vector3;           // t in [0, 1]
  getTangent(t: number): Vector3;
  getLength(): number;
  getLengthAtT(t: number): number;
  getTAtLength(length: number): number;   // Arc-length parameterization

  // Sampling
  getPoints(divisions: number): Vector3[];
  getSpacedPoints(count: number): Vector3[];  // Evenly spaced by arc length

  // Modification
  addPoint(point: Vector3): void;
  removePoint(index: number): void;
  updatePoint(index: number, point: Vector3): void;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Interpolation`
- Depended by: Animation paths, camera tracks, procedural meshes

**Implementation Checklist:**
- [ ] Catmull-Rom with configurable tension
- [ ] Cubic Bezier with explicit control points
- [ ] B-spline for smooth approximation
- [ ] Hermite spline with tangent control
- [ ] Arc-length parameterization via lookup table
- [ ] Closed loop support
- [ ] `getSpacedPoints()` for uniform sampling

---

### 4.2.16 `src/math/Interpolation.ts`

**Role:** Interpolation functions for animation and blending.

**Public API:**
```typescript
const Interpolation = {
  // Linear
  lerp(a: number, b: number, t: number): number;
  lerpClamped(a: number, b: number, t: number): number;
  inverseLerp(a: number, b: number, value: number): number;
  remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;

  // Smooth
  smoothstep(edge0: number, edge1: number, x: number): number;
  smootherstep(edge0: number, edge1: number, x: number): number;

  // Angular
  lerpAngle(a: number, b: number, t: number): number;

  // Damping
  damp(current: number, target: number, smoothing: number, dt: number): number;
  smoothDamp(current: number, target: number, velocity: { value: number }, smoothTime: number, maxSpeed: number, dt: number): number;

  // Bezier
  bezier(p0: number, p1: number, p2: number, p3: number, t: number): number;
  bezierTangent(p0: number, p1: number, p2: number, p3: number, t: number): number;

  // Catmull-Rom
  catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number;
};
```

**Dependencies:**
- Depends on: `MathConstants`
- Depended by: Animation, UI transitions, camera

**Implementation Checklist:**
- [ ] All functions handle edge cases (t outside [0,1])
- [ ] `smoothDamp()` matches Unity's implementation for familiar feel
- [ ] `lerpAngle()` handles wraparound (-π to π)
- [ ] Bezier/Catmull-Rom for curve evaluation

---

### 4.2.17 `src/math/Easing.ts`

**Role:** Easing functions for animation timing.

**Public API:**
```typescript
type EasingFunction = (t: number) => number;

const Easing = {
  // Linear
  linear: EasingFunction;

  // Quad
  easeInQuad: EasingFunction;
  easeOutQuad: EasingFunction;
  easeInOutQuad: EasingFunction;

  // Cubic
  easeInCubic: EasingFunction;
  easeOutCubic: EasingFunction;
  easeInOutCubic: EasingFunction;

  // Quart, Quint, Sine, Expo, Circ, Elastic, Back, Bounce
  // ... all standard easing types

  // Custom
  fromBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction;
  fromKeyframes(keyframes: { time: number; value: number }[]): EasingFunction;
};
```

**Dependencies:**
- Depends on: None
- Depended by: Animation, UI, transitions

**Implementation Checklist:**
- [ ] All 30 standard easing functions (Robert Penner's)
- [ ] `fromBezier()` creates cubic-bezier easing (CSS-compatible)
- [ ] Input clamped to [0, 1], output may exceed for elastic/back
- [ ] **Tests:** Visual tests comparing to reference implementations

---

### 4.2.18 `src/math/RandomMath.ts`

**Role:** Math utilities for random distributions and noise.

**Public API:**
```typescript
const RandomMath = {
  // Points
  pointInCircle(random: Random, radius: number): Vector2;
  pointOnCircle(random: Random, radius: number): Vector2;
  pointInSphere(random: Random, radius: number): Vector3;
  pointOnSphere(random: Random, radius: number): Vector3;
  pointInBox(random: Random, box: Box3): Vector3;
  pointOnTriangle(random: Random, a: Vector3, b: Vector3, c: Vector3): Vector3;

  // Directions
  randomDirection2D(random: Random): Vector2;
  randomDirection3D(random: Random): Vector3;
  randomInCone(random: Random, direction: Vector3, angle: number): Vector3;

  // Noise
  perlin2D(x: number, y: number): number;
  perlin3D(x: number, y: number, z: number): number;
  simplex2D(x: number, y: number): number;
  simplex3D(x: number, y: number, z: number): number;
  worley2D(x: number, y: number, cells: number): number;
  fbm2D(x: number, y: number, octaves: number, lacunarity: number, gain: number): number;
};
```

**Dependencies:**
- Depends on: `Random`, `Vector2`, `Vector3`, `Box3`
- Depended by: Procedural generation, particles, terrain

**Implementation Checklist:**
- [ ] Uniform distribution over surfaces and volumes
- [ ] Cone sampling for emission patterns
- [ ] Classic Perlin noise implementation
- [ ] Simplex noise for better isotropy
- [ ] Worley/cellular noise for textures
- [ ] fBm (fractal Brownian motion) for terrain
- [ ] All noise functions tileable (optional parameter)

---

### 4.2.19 `src/math/MathConstants.ts`

**Role:** Mathematical constants and utilities.

**Public API:**
```typescript
const MathConstants = {
  PI: number;
  TWO_PI: number;
  HALF_PI: number;
  QUARTER_PI: number;

  DEG_TO_RAD: number;
  RAD_TO_DEG: number;

  EPSILON: number;         // 1e-6
  EPSILON_SQUARED: number;

  PHI: number;             // Golden ratio
  SQRT2: number;
  SQRT3: number;

  MAX_SAFE_INTEGER: number;
  MIN_SAFE_INTEGER: number;
};

function clamp(value: number, min: number, max: number): number;
function saturate(value: number): number;  // clamp to [0, 1]
function sign(value: number): number;
function isPowerOfTwo(value: number): boolean;
function nextPowerOfTwo(value: number): number;
function nearlyEqual(a: number, b: number, epsilon?: number): boolean;
function toRadians(degrees: number): number;
function toDegrees(radians: number): number;
```

**Dependencies:**
- Depends on: None
- Depended by: All math modules

**Implementation Checklist:**
- [ ] All constants as `const` for inlining
- [ ] Utility functions with no allocations
- [ ] `nearlyEqual()` handles special cases (infinity, NaN)
- [ ] `nextPowerOfTwo()` for texture sizing

---

### 4.2.20 `src/math/index.ts`

**Role:** Barrel export for math module.

**Implementation Checklist:**
- [ ] Re-exports all public APIs
- [ ] No logic, only exports
- [ ] Tree-shakeable

---

## 4.3 `src/ecs/` – Entity Component System

### Directory Structure

```
src/ecs/
├── World.ts
├── Entity.ts
├── Component.ts
├── System.ts
├── Query.ts
├── Archetype.ts
├── ComponentStore.ts
├── ComponentRegistry.ts
├── SystemScheduler.ts
├── CommandBuffer.ts
├── EntityManager.ts
├── SparseSet.ts
├── Bitset.ts
├── ECSSerializer.ts
├── ECSProfiler.ts
├── components/
│   ├── TransformComponent.ts
│   ├── MeshComponent.ts
│   ├── MaterialComponent.ts
│   ├── CameraComponent.ts
│   ├── LightComponent.ts
│   ├── RigidBodyComponent.ts
│   ├── ColliderComponent.ts
│   ├── AudioSourceComponent.ts
│   ├── NetworkIdentityComponent.ts
│   ├── ScriptComponent.ts
│   ├── TagComponent.ts
│   ├── ParticleEmitterComponent.ts
│   ├── VolumeComponent.ts
│   ├── TerrainChunkComponent.ts
│   ├── VoxelChunkComponent.ts
│   ├── OceanComponent.ts
│   ├── WeatherZoneComponent.ts
│   ├── CrowdAgentComponent.ts
│   ├── AIStateComponent.ts
│   ├── AnimationStateComponent.ts
│   ├── FacialRigComponent.ts
│   ├── MotionMatchingComponent.ts
│   ├── SoftBodyComponent.ts
│   ├── ClothComponent.ts
│   ├── FluidComponent.ts
│   ├── VehicleComponent.ts
│   ├── CharacterControllerComponent.ts
│   └── XRViewComponent.ts
├── systems/
│   ├── TransformSystem.ts
│   ├── RenderSystem.ts
│   ├── CullingSystem.ts
│   ├── AnimationSystem.ts
│   ├── PhysicsSystem.ts
│   ├── SoftBodySystem.ts
│   ├── ClothSystem.ts
│   ├── FluidSystem.ts
│   ├── FractureSystem.ts
│   ├── CrowdSystem.ts
│   ├── AISystem.ts
│   ├── NavigationSystem.ts
│   ├── WeatherSystem.ts
│   ├── OceanSystem.ts
│   ├── TerrainSystem.ts
│   ├── VoxelSystem.ts
│   ├── AudioSystem.ts
│   ├── NetReplicationSystem.ts
│   ├── NetPredictionSystem.ts
│   ├── UISystem.ts
│   ├── ScriptingSystem.ts
│   ├── TimelineSystem.ts
│   ├── StreamingSystem.ts
│   ├── XRSystem.ts
│   └── ProfilingSystem.ts
└── index.ts
```

---

### 4.3.1 `src/ecs/World.ts`

**Role:** Central container for all entities, components, and systems.

**Public API:**
```typescript
class World {
  // Entity management
  createEntity(): Entity;
  destroyEntity(entity: Entity): void;
  isEntityAlive(entity: Entity): boolean;
  getEntityCount(): number;

  // Component management
  addComponent<C extends Component>(entity: Entity, component: C): void;
  removeComponent<C extends Component>(entity: Entity, componentType: ComponentType<C>): void;
  getComponent<C extends Component>(entity: Entity, componentType: ComponentType<C>): C | undefined;
  hasComponent<C extends Component>(entity: Entity, componentType: ComponentType<C>): boolean;

  // Querying
  query<C extends Component[]>(...componentTypes: ComponentType<C[number]>[]): Query<C>;

  // Systems
  registerSystem(system: System, phase?: SystemPhase): void;
  unregisterSystem(system: System): void;
  getSystem<S extends System>(systemType: new (...args: any[]) => S): S | undefined;

  // Update
  update(dt: number): void;

  // Serialization
  serialize(): WorldSnapshot;
  deserialize(snapshot: WorldSnapshot): void;

  // Events
  onEntityCreated: Signal<(entity: Entity) => void>;
  onEntityDestroyed: Signal<(entity: Entity) => void>;
  onComponentAdded: Signal<(entity: Entity, component: Component) => void>;
  onComponentRemoved: Signal<(entity: Entity, component: Component) => void>;
}

enum SystemPhase {
  PRE_UPDATE,
  UPDATE,
  POST_UPDATE,
  PRE_PHYSICS,
  PHYSICS,
  POST_PHYSICS,
  PRE_RENDER,
  RENDER,
  POST_RENDER
}
```

**Dependencies:**
- Depends on: `Entity`, `Component`, `System`, `Query`, `Archetype`, `ComponentStore`, `SystemScheduler`, `CommandBuffer`, `EntityManager`
- Depended by: `Engine`, all systems

**Implementation Checklist:**
- [ ] Entity ID recycling with generation counters for ABA safety
- [ ] Component storage via Archetype-based columnar layout
- [ ] Query caching with automatic invalidation on archetype changes
- [ ] System scheduling by phase with topological ordering
- [ ] Deferred entity/component operations via CommandBuffer
- [ ] Thread-safe snapshot for serialization
- [ ] Event signals for external observers (editor, debugging)
- [ ] **Performance:** 100k entities @ 120 FPS for basic transform updates
- [ ] **Performance:** Entity creation < 0.01ms
- [ ] **Performance:** Component access < 0.001ms
- [ ] **Tests:** Full lifecycle tests, stress tests with 100k+ entities

---

### 4.3.2 `src/ecs/Entity.ts`

**Role:** Lightweight entity identifier.

**Public API:**
```typescript
// Entity is a branded number type for type safety
type Entity = number & { readonly __entity: unique symbol };

// Entity utilities
const Entity = {
  NULL: Entity;  // Invalid entity constant

  isValid(entity: Entity): boolean;
  getIndex(entity: Entity): number;
  getGeneration(entity: Entity): number;
  create(index: number, generation: number): Entity;
};
```

**Dependencies:**
- Depends on: None
- Depended by: `World`, all components and systems

**Implementation Checklist:**
- [ ] Entity as 32-bit number: 20 bits index + 12 bits generation
- [ ] Supports up to ~1M concurrent entities
- [ ] Generation prevents stale reference bugs
- [ ] `NULL` entity for optional relationships
- [ ] Zero allocation for entity operations

---

### 4.3.3 `src/ecs/Component.ts`

**Role:** Base interface for all components.

**Public API:**
```typescript
interface Component {
  readonly type: ComponentType<this>;
}

interface ComponentType<C extends Component> {
  readonly id: number;
  readonly name: string;
  create(): C;
  reset(component: C): void;
  clone(component: C): C;
  serialize(component: C): unknown;
  deserialize(data: unknown): C;
}

function defineComponent<C extends Component>(
  name: string,
  definition: {
    create: () => C;
    reset?: (component: C) => void;
    clone?: (component: C) => C;
    serialize?: (component: C) => unknown;
    deserialize?: (data: unknown) => C;
  }
): ComponentType<C>;
```

**Dependencies:**
- Depends on: None
- Depended by: All component definitions

**Implementation Checklist:**
- [ ] `defineComponent()` auto-assigns unique ID
- [ ] Default `reset()` zeroes all fields
- [ ] Default `clone()` performs shallow copy
- [ ] Serialization support for save/load and networking
- [ ] Type safety via branded types

---

### 4.3.4 `src/ecs/System.ts`

**Role:** Base class for all ECS systems.

**Public API:**
```typescript
abstract class System {
  abstract readonly name: string;
  readonly phase: SystemPhase;
  enabled: boolean;

  // Lifecycle
  initialize?(world: World): void;
  shutdown?(world: World): void;

  // Per-frame
  abstract update(world: World, dt: number): void;

  // Dependencies
  readonly runAfter?: (new (...args: any[]) => System)[];
  readonly runBefore?: (new (...args: any[]) => System)[];
}
```

**Dependencies:**
- Depends on: `World`, `SystemPhase`
- Depended by: All system implementations

**Implementation Checklist:**
- [ ] Phase determines execution order bucket
- [ ] `runAfter`/`runBefore` for fine-grained ordering within phase
- [ ] `enabled` flag for runtime toggling
- [ ] `initialize()` called once on registration
- [ ] `shutdown()` called on unregistration or world destroy
- [ ] Systems stateless where possible (data in components)

---

### 4.3.5 `src/ecs/Query.ts`

**Role:** Efficient entity filtering by component composition.

**Public API:**
```typescript
class Query<C extends Component[]> {
  // Iteration
  [Symbol.iterator](): Iterator<QueryResult<C>>;
  forEach(callback: (result: QueryResult<C>) => void): void;

  // Access
  get entities(): Entity[];
  get count(): number;
  isEmpty(): boolean;

  // Filtering
  with<D extends Component>(componentType: ComponentType<D>): Query<[...C, D]>;
  without<D extends Component>(componentType: ComponentType<D>): Query<C>;

  // Single entity queries
  first(): QueryResult<C> | undefined;
  single(): QueryResult<C>;  // Throws if not exactly one
}

type QueryResult<C extends Component[]> = {
  entity: Entity;
  components: C;
};
```

**Dependencies:**
- Depends on: `Entity`, `Component`, `Archetype`, `Bitset`
- Depended by: All systems

**Implementation Checklist:**
- [ ] Bitmask-based archetype matching
- [ ] Cached query results, invalidated on archetype changes
- [ ] Lazy evaluation for memory efficiency
- [ ] `with()`/`without()` for query refinement
- [ ] Iteration order stable within frame
- [ ] **Performance:** Query iteration overhead < 1ns per entity

---

### 4.3.6 `src/ecs/Archetype.ts`

**Role:** Groups entities with identical component sets for cache-efficient storage.

**Public API:**
```typescript
class Archetype {
  readonly id: number;
  readonly mask: Bitset;
  readonly componentTypes: ComponentType<any>[];

  // Storage
  get entityCount(): number;
  getEntities(): Entity[];
  getComponentArray<C extends Component>(type: ComponentType<C>): C[];

  // Internal operations
  addEntity(entity: Entity, components: Component[]): number;  // Returns row
  removeEntity(row: number): void;
  moveEntity(row: number, targetArchetype: Archetype): number;
}
```

**Dependencies:**
- Depends on: `Entity`, `Component`, `Bitset`
- Depended by: `World`, `Query`, `ComponentStore`

**Implementation Checklist:**
- [ ] Columnar storage: one array per component type
- [ ] Entities stored contiguously for cache efficiency
- [ ] Swap-remove for O(1) deletion
- [ ] Entity-to-row mapping maintained separately
- [ ] **Performance:** Archetype iteration saturates memory bandwidth

---

### 4.3.7 `src/ecs/ComponentStore.ts`

**Role:** Manages storage and pooling for a single component type.

**Public API:**
```typescript
class ComponentStore<C extends Component> {
  readonly type: ComponentType<C>;

  create(): C;
  release(component: C): void;

  get activeCount(): number;
  get pooledCount(): number;
}
```

**Dependencies:**
- Depends on: `Component`, `ObjectPool`
- Depended by: `Archetype`, `World`

**Implementation Checklist:**
- [ ] Pools components for allocation-free operations
- [ ] Calls `reset()` on release
- [ ] Pre-warming support
- [ ] Statistics tracking

---

### 4.3.8 `src/ecs/ComponentRegistry.ts`

**Role:** Global registry of all component types.

**Public API:**
```typescript
class ComponentRegistry {
  static register<C extends Component>(type: ComponentType<C>): void;
  static get<C extends Component>(id: number): ComponentType<C>;
  static getByName(name: string): ComponentType<any> | undefined;
  static getAll(): ComponentType<any>[];
  static getCount(): number;
}
```

**Dependencies:**
- Depends on: `Component`
- Depended by: `defineComponent()`, serialization

**Implementation Checklist:**
- [ ] Auto-registration via `defineComponent()`
- [ ] Name-based lookup for serialization
- [ ] ID-based lookup for runtime
- [ ] Duplicate detection with warnings

---

### 4.3.9 `src/ecs/SystemScheduler.ts`

**Role:** Orders and executes systems according to phases and dependencies.

**Public API:**
```typescript
class SystemScheduler {
  add(system: System): void;
  remove(system: System): void;

  update(world: World, dt: number): void;
  updatePhase(world: World, phase: SystemPhase, dt: number): void;

  get systems(): System[];
  getSystemsInPhase(phase: SystemPhase): System[];
}
```

**Dependencies:**
- Depends on: `System`, `SystemPhase`
- Depended by: `World`

**Implementation Checklist:**
- [ ] Topological sort respecting `runAfter`/`runBefore`
- [ ] Cycle detection with meaningful error
- [ ] Phase-based buckets for main loop integration
- [ ] Runtime system add/remove
- [ ] Per-system timing for profiler

---

### 4.3.10 `src/ecs/CommandBuffer.ts`

**Role:** Defers structural changes to safe sync points.

**Public API:**
```typescript
class CommandBuffer {
  createEntity(): Entity;
  destroyEntity(entity: Entity): void;
  addComponent<C extends Component>(entity: Entity, component: C): void;
  removeComponent<C extends Component>(entity: Entity, type: ComponentType<C>): void;

  execute(world: World): void;
  clear(): void;

  get pendingCount(): number;
}
```

**Dependencies:**
- Depends on: `Entity`, `Component`, `World`
- Depended by: Systems that modify structure during iteration

**Implementation Checklist:**
- [ ] Buffers all structural commands
- [ ] `execute()` applies in order at end of frame
- [ ] Handles entity creation during buffer (returns placeholder)
- [ ] Commands referencing destroyed entities safely ignored
- [ ] **Performance:** Command recording < 0.001ms each

---

### 4.3.11 `src/ecs/EntityManager.ts`

**Role:** Manages entity allocation and recycling.

**Public API:**
```typescript
class EntityManager {
  create(): Entity;
  destroy(entity: Entity): void;
  isAlive(entity: Entity): boolean;

  get count(): number;
  get capacity(): number;
}
```

**Dependencies:**
- Depends on: `Entity`
- Depended by: `World`

**Implementation Checklist:**
- [ ] Free list for ID recycling
- [ ] Generation increment on recycle
- [ ] Capacity growth strategy
- [ ] `isAlive()` checks generation match

---

### 4.3.12 `src/ecs/SparseSet.ts`

**Role:** O(1) set operations for entity collections.

**Public API:**
```typescript
class SparseSet {
  add(entity: Entity): void;
  remove(entity: Entity): boolean;
  has(entity: Entity): boolean;
  clear(): void;

  get count(): number;
  get dense(): Entity[];

  [Symbol.iterator](): Iterator<Entity>;
}
```

**Dependencies:**
- Depends on: `Entity`
- Depended by: `Query`, component storage

**Implementation Checklist:**
- [ ] Sparse array for O(1) lookup
- [ ] Dense array for O(n) iteration
- [ ] Swap-remove for O(1) deletion
- [ ] Memory-efficient sparse growth

---

### 4.3.13 `src/ecs/Bitset.ts`

**Role:** Compact bit manipulation for component masks.

**Public API:**
```typescript
class Bitset {
  set(bit: number): void;
  unset(bit: number): void;
  has(bit: number): boolean;

  and(other: Bitset): Bitset;
  or(other: Bitset): Bitset;
  xor(other: Bitset): Bitset;
  not(): Bitset;

  contains(other: Bitset): boolean;
  intersects(other: Bitset): boolean;
  equals(other: Bitset): boolean;

  clear(): void;
  clone(): Bitset;

  get count(): number;  // Population count
}
```

**Dependencies:**
- Depends on: None
- Depended by: `Archetype`, `Query`

**Implementation Checklist:**
- [ ] Backed by Uint32Array for efficient ops
- [ ] Dynamic growth as needed
- [ ] Bitwise AND/OR/XOR for query matching
- [ ] Population count for statistics
- [ ] **Performance:** All ops < 0.001ms for 256 bits

---

### 4.3.14 `src/ecs/ECSSerializer.ts`

**Role:** Serializes/deserializes ECS state.

**Public API:**
```typescript
class ECSSerializer {
  static serialize(world: World): WorldSnapshot;
  static deserialize(snapshot: WorldSnapshot, world: World): void;

  static serializeEntity(world: World, entity: Entity): EntitySnapshot;
  static deserializeEntity(snapshot: EntitySnapshot, world: World): Entity;
}

interface WorldSnapshot {
  version: number;
  entities: EntitySnapshot[];
  metadata: Record<string, unknown>;
}

interface EntitySnapshot {
  id: number;
  components: ComponentSnapshot[];
}
```

**Dependencies:**
- Depends on: `World`, `Entity`, `Component`, `ComponentRegistry`
- Depended by: Save/load, networking

**Implementation Checklist:**
- [ ] Version field for migration support
- [ ] All component types serializable via registry
- [ ] Entity relationships preserved (parent-child)
- [ ] Handles circular references
- [ ] Binary and JSON format options
- [ ] Delta serialization for networking

---

### 4.3.15 `src/ecs/ECSProfiler.ts`

**Role:** Performance tracking for ECS operations.

**Public API:**
```typescript
class ECSProfiler {
  static enable(): void;
  static disable(): void;

  static beginSystem(system: System): void;
  static endSystem(system: System): void;

  static getSystemTimes(): Map<System, number>;
  static getEntityCount(): number;
  static getArchetypeCount(): number;
  static getQueryStats(): QueryStats[];
}
```

**Dependencies:**
- Depends on: `System`, `World`
- Depended by: `Profiler`, editor

**Implementation Checklist:**
- [ ] Per-system frame time tracking
- [ ] Per-query iteration counts
- [ ] Archetype fragmentation metrics
- [ ] Low overhead when enabled (< 1% frame time)
- [ ] Zero overhead when disabled

---

### 4.3.16 ECS Components Group Checklist

**All files in `src/ecs/components/` must implement:**

- [ ] Extends or implements `Component` interface
- [ ] Has `ComponentType` defined via `defineComponent()`
- [ ] Default constructor creates valid zero/default state
- [ ] `reset()` method restores to default state
- [ ] `clone()` method creates independent copy
- [ ] `serialize()` returns JSON-safe object
- [ ] `deserialize()` constructs from serialized data
- [ ] Registered in `ComponentRegistry` on module load
- [ ] JSDoc documentation for all public fields
- [ ] Unit tests for serialization round-trip

---

### 4.3.17 `src/ecs/components/TransformComponent.ts`

**Role:** Spatial transform data for entities.

**Public API:**
```typescript
interface TransformComponent extends Component {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;

  // Cached matrices (computed by TransformSystem)
  localMatrix: Matrix4;
  worldMatrix: Matrix4;

  // Hierarchy
  parent: Entity | null;
  children: Entity[];

  // Flags
  dirty: boolean;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Quaternion`, `Matrix4`, `Entity`
- Depended by: Almost all systems

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] `dirty` flag set on any transform change
- [ ] `parent`/`children` for hierarchy
- [ ] Default: position=0, rotation=identity, scale=1

---

### 4.3.18 `src/ecs/components/MeshComponent.ts`

**Role:** References renderable mesh geometry.

**Public API:**
```typescript
interface MeshComponent extends Component {
  meshId: string;           // Asset reference
  submeshIndex: number;     // For multi-part meshes
  visible: boolean;
  castShadows: boolean;
  receiveShadows: boolean;
  renderLayer: number;      // For layer-based rendering
  boundingBox: Box3;        // Local space
  boundingSphere: Sphere;
}
```

**Dependencies:**
- Depends on: `Box3`, `Sphere`
- Depended by: `RenderSystem`, `CullingSystem`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Bounds cached from mesh asset
- [ ] Layer mask for selective rendering

---

### 4.3.19 `src/ecs/components/MaterialComponent.ts`

**Role:** References material for rendering.

**Public API:**
```typescript
interface MaterialComponent extends Component {
  materialId: string;       // Asset reference
  materialInstance: MaterialInstance | null;  // For per-instance overrides
  sortingOrder: number;     // For transparency sorting
}
```

**Dependencies:**
- Depends on: `MaterialInstance`
- Depended by: `RenderSystem`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Instance allows per-entity material parameters
- [ ] Sorting order for controlled draw order

---

### 4.3.20 `src/ecs/components/CameraComponent.ts`

**Role:** Camera view and projection parameters.

**Public API:**
```typescript
interface CameraComponent extends Component {
  projectionType: 'perspective' | 'orthographic';

  // Perspective
  fov: number;              // Vertical FOV in radians

  // Orthographic
  orthoSize: number;

  // Common
  near: number;
  far: number;
  aspect: number;

  // Computed
  viewMatrix: Matrix4;
  projectionMatrix: Matrix4;
  viewProjectionMatrix: Matrix4;
  frustum: Frustum;

  // Render target
  renderTarget: RenderTarget | null;
  clearColor: Color;
  clearFlags: ClearFlags;

  // Priority
  priority: number;         // Order when multiple cameras
  enabled: boolean;
}
```

**Dependencies:**
- Depends on: `Matrix4`, `Frustum`, `Color`, `RenderTarget`
- Depended by: `RenderSystem`, culling

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Frustum computed from view-projection
- [ ] Support for render-to-texture
- [ ] Multi-camera priority ordering

---

### 4.3.21 `src/ecs/components/LightComponent.ts`

**Role:** Light source parameters.

**Public API:**
```typescript
interface LightComponent extends Component {
  type: 'directional' | 'point' | 'spot' | 'area';
  color: Color;
  intensity: number;

  // Point/Spot
  range: number;

  // Spot
  innerAngle: number;
  outerAngle: number;

  // Area
  areaWidth: number;
  areaHeight: number;

  // Shadows
  castShadows: boolean;
  shadowBias: number;
  shadowNormalBias: number;
  shadowResolution: number;

  // Culling
  cullingMask: number;
}
```

**Dependencies:**
- Depends on: `Color`
- Depended by: `LightingPass`, `ShadowMapPass`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Physical units (lumens, lux) support
- [ ] Area light shape parameters

---

### 4.3.22 – 4.3.43 Additional Components

*Each component file follows the group checklist. Key specific requirements:*

**RigidBodyComponent.ts:**
- [ ] Body type: dynamic, kinematic, static
- [ ] Mass, drag, angular drag
- [ ] Constraints (freeze position/rotation axes)
- [ ] Interpolation mode

**ColliderComponent.ts:**
- [ ] Shape types: box, sphere, capsule, mesh, convex hull
- [ ] Physics material reference
- [ ] Trigger flag
- [ ] Layer/mask for collision filtering

**AudioSourceComponent.ts:**
- [ ] Audio clip reference
- [ ] Volume, pitch, pan
- [ ] Spatial blend (2D/3D)
- [ ] Doppler, rolloff settings
- [ ] Loop, autoplay flags

**NetworkIdentityComponent.ts:**
- [ ] Network ID (globally unique)
- [ ] Owner client ID
- [ ] Authority flags
- [ ] Sync settings

**AIStateComponent.ts:**
- [ ] Current behavior tree node
- [ ] Blackboard reference
- [ ] State machine state
- [ ] Perception memory

**MotionMatchingComponent.ts:**
- [ ] Motion database reference
- [ ] Current trajectory
- [ ] Blend weights
- [ ] Feature snapshot

---

### 4.3.44 ECS Systems Group Checklist

**All files in `src/ecs/systems/` must implement:**

- [ ] Extends `System` abstract class
- [ ] Has unique `name` property
- [ ] Specifies `phase` for execution order
- [ ] Defines queries explicitly in constructor
- [ ] `update()` iterates query results efficiently
- [ ] Zero allocations in `update()` hot path
- [ ] No assumptions about singleton globals
- [ ] All dependencies injected via World or explicit managers
- [ ] Error handling for missing components
- [ ] Performance profiling hooks
- [ ] Unit tests for core logic
- [ ] Integration tests with real World

---

### 4.3.45 `src/ecs/systems/TransformSystem.ts`

**Role:** Updates transform matrices and propagates hierarchy.

**Public API:**
```typescript
class TransformSystem extends System {
  readonly name = 'TransformSystem';
  readonly phase = SystemPhase.PRE_PHYSICS;

  update(world: World, dt: number): void;
}
```

**Dependencies:**
- Depends on: `TransformComponent`
- Depended by: `RenderSystem`, `PhysicsSystem`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Processes dirty transforms only
- [ ] Topological sort for parent-before-child
- [ ] World matrix = parent.worldMatrix × localMatrix
- [ ] Clears dirty flags after update
- [ ] **Performance:** 100k transforms < 2ms

---

### 4.3.46 `src/ecs/systems/RenderSystem.ts`

**Role:** Builds RenderScene from ECS data for renderer.

**Public API:**
```typescript
class RenderSystem extends System {
  readonly name = 'RenderSystem';
  readonly phase = SystemPhase.PRE_RENDER;

  update(world: World, dt: number): void;

  getRenderScene(): RenderScene;
}

interface RenderScene {
  cameras: CameraData[];
  lights: LightData[];
  meshInstances: MeshInstanceData[];
  environment: EnvironmentData;
}
```

**Dependencies:**
- Depends on: `TransformComponent`, `MeshComponent`, `MaterialComponent`, `CameraComponent`, `LightComponent`
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Aggregates all visible meshes with transforms
- [ ] Collects all active cameras and lights
- [ ] Sorts transparent objects back-to-front
- [ ] Groups by material for batching hints
- [ ] No GPU calls – pure data preparation
- [ ] **Performance:** 10k objects < 1ms

---

### 4.3.47 `src/ecs/systems/CullingSystem.ts`

**Role:** Frustum culling for cameras.

**Public API:**
```typescript
class CullingSystem extends System {
  readonly name = 'CullingSystem';
  readonly phase = SystemPhase.PRE_RENDER;
  readonly runBefore = [RenderSystem];

  update(world: World, dt: number): void;
}
```

**Dependencies:**
- Depends on: `TransformComponent`, `MeshComponent`, `CameraComponent`
- Depended by: `RenderSystem`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Per-camera frustum culling
- [ ] Uses bounding spheres for early rejection
- [ ] Falls back to AABB for edge cases
- [ ] Sets visibility flags on MeshComponent
- [ ] Occlusion culling integration point
- [ ] **Performance:** 100k objects < 2ms

---

### 4.3.48 – 4.3.67 Additional Systems

*Each system follows the group checklist. Key specific requirements per system documented in their respective PRD sections.*

---

### 4.3.68 `src/ecs/index.ts`

**Role:** Barrel export for ECS module.

**Implementation Checklist:**
- [ ] Re-exports all public APIs
- [ ] Re-exports all components
- [ ] Re-exports all systems
- [ ] Tree-shakeable

---

## Next Document

Continue to `PRD-Final-02-Rendering.md` for Rendering specifications.

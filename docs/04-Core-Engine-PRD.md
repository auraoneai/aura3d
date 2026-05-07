# Core Engine PRD

## Purpose
The core engine owns lifecycle, timing, scheduling, diagnostics, logging, events, resource disposal, and error handling. It exists so every other subsystem runs inside a predictable frame loop instead of creating its own hidden update order.

## Lessons From Failed Attempts
- Current `G3D` had an ambitious `Engine` and broad modules, but E2E tests reported missing runtime setup and incomplete cross-system lifecycle coverage.
- `G3D2025` had strong PRD ideas but `SYSTEM_ORDER_REPORT.md` found no dependency enforcement and hardcoded priorities.
- `Old-G3D` accumulated multiple startup, factory, feature, event, and activation systems; `activate100.md` showed many systems were not really activated.

Reuse conceptually:

- A typed engine config.
- A central event bus.
- Fixed/update/render lifecycle phases.
- Diagnostics hooks.

Discard:

- Multiple startup/factory systems.
- Hidden singletons.
- Hardcoded priorities.
- Reports that claim readiness without scheduler tests.

## Target Architecture
The core package is independent of scene, ECS, rendering, physics, animation, assets, input, and audio. It provides a runtime host, not feature behavior.

Public API:

```ts
const engine = new Engine({ targetFPS: 60, fixedDelta: 1 / 60 });
engine.use(plugin);
await engine.init();
engine.start();
engine.stop();
await engine.dispose();
```

Internal responsibilities:

- Build the lifecycle state machine.
- Own timing and fixed-step accumulation.
- Schedule phases and validate dependencies.
- Expose typed events.
- Provide diagnostics snapshots.
- Track disposables and resource scopes.

Dependency boundaries:

- May import `math` for small utility types only.
- Must not import `scene`, `ecs`, `rendering`, `physics`, `animation`, `assets`, or browser-only APIs directly except through platform adapters.

## File-By-File Implementation Plan

### `packages/core/src/Engine.ts`
- Purpose: top-level lifecycle owner.
- Contains: `Engine`, `EngineState`, `EnginePlugin`, lifecycle methods.
- Depends on: `EngineLoop`, `Scheduler`, `EventBus`, `Diagnostics`, `ResourceScope`.
- Inputs/outputs: config in, lifecycle events and frame execution out.
- Edge cases: double init, start before init, stop during init, dispose during running, plugin init failure.
- Required tests: lifecycle transitions, plugin order, disposal, failure rollback.
- Completion checklist: state machine is explicit, idempotent methods are documented, errors are typed.

### `packages/core/src/EngineConfig.ts`
- Purpose: validate and normalize runtime config.
- Contains: `EngineConfig`, `ResolvedEngineConfig`, `resolveEngineConfig()`.
- Edge cases: invalid FPS, negative fixed delta, unsupported feature flags.
- Tests: defaults, overrides, invalid values, readonly resolved object.

### `packages/core/src/EngineLoop.ts`
- Purpose: requestAnimationFrame loop and manual stepping for tests.
- Contains: `EngineLoop`, `FrameContext`, `LoopMode`.
- Edge cases: background tab delta spikes, manual stepping, pause/resume.
- Tests: fixed-step accumulation, max catch-up steps, pause behavior.

### `packages/core/src/Time.ts`
- Purpose: per-frame timing state.
- Contains: `Time`, `TimeSnapshot`.
- Edge cases: clamped deltas, time scale zero, slow frames.
- Tests: delta smoothing, elapsed time, scaled/unscaled time.

### `packages/core/src/FixedStepAccumulator.ts`
- Purpose: deterministic fixed-timestep accumulator.
- Contains: `FixedStepAccumulator`.
- Edge cases: spiral of death, fractional leftover interpolation alpha.
- Tests: repeatability for identical delta sequences.

### `packages/core/src/Scheduler.ts`
- Purpose: phase scheduler with dependency validation.
- Contains: `Scheduler`, `SystemPhase`, `ScheduledTask`, `DependencyGraph`.
- Edge cases: cycles, missing dependencies, duplicate IDs, disabled tasks.
- Tests: order, phase boundaries, cycle detection, stable sort.

### `packages/core/src/EventBus.ts`
- Purpose: typed event dispatch.
- Contains: `EventBus<EventMap>`, unsubscribe handles, once listeners.
- Edge cases: listener removal during emit, listener errors, wildcard diagnostics.
- Tests: ordering, once, unsubscribe, error handling.

### `packages/core/src/TaskQueue.ts`
- Purpose: async task finalization during safe phases.
- Contains: `TaskQueue`, `TaskHandle`, cancellation.
- Edge cases: task cancellation, task enqueues task, failure propagation.
- Tests: ordering and cancellation.

### `packages/core/src/Logger.ts`
- Purpose: structured logging with categories.
- Contains: `Logger`, `LogLevel`, sinks, rate limiting.
- Edge cases: sink failure, high-volume warnings.
- Tests: filtering, sink routing, rate limit.

### `packages/core/src/Diagnostics.ts`
- Purpose: runtime metrics aggregation.
- Contains: `Diagnostics`, `Metric`, `DiagnosticsSnapshot`.
- Edge cases: disabled metrics, max history, nested timers.
- Tests: counters, gauges, timings, snapshot immutability.

### `packages/core/src/Errors.ts`
- Purpose: common typed error hierarchy.
- Contains: `EngineError`, `LifecycleError`, `ValidationError`, `ResourceError`.
- Tests: codes, messages, cause preservation.

### `packages/core/src/Disposable.ts`
- Purpose: common disposable contract.
- Contains: `Disposable`, `isDisposable()`, `DisposableStack`.
- Tests: LIFO dispose, repeated dispose, async disposal.

### `packages/core/src/ResourceScope.ts`
- Purpose: group resource ownership.
- Contains: `ResourceScope`, child scopes.
- Tests: nested disposal, leak report.

### `packages/core/src/index.ts`
- Purpose: public core exports only.
- Tests: package export smoke test.

## Acceptance Criteria
- Engine can initialize, run three frames, fixed-step twice, pause, resume, stop, and dispose without leaked resources.
- Scheduler rejects circular dependencies and missing phase dependencies.
- Core package has no forbidden imports.
- All lifecycle APIs are documented and unit-tested.
- Manual-step mode can run deterministic tests without browser APIs.

## Testing Checklist
- Unit: config, time, accumulator, scheduler, event bus, diagnostics, disposable scope.
- Integration: engine with mock plugin, fixed/variable phase ordering.
- Browser/runtime: requestAnimationFrame loop start/stop.
- Module import/export: `@galileo3d/core` exports only public APIs.
- Regression: no hidden singleton state between tests.

## Implementation Order
1. `EngineConfig`, `Errors`, `Disposable`.
2. `Time`, `FixedStepAccumulator`.
3. `EventBus`, `Logger`, `Diagnostics`.
4. `Scheduler`.
5. `EngineLoop`.
6. `Engine`.
7. Export and lifecycle integration tests.


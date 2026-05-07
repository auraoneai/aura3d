# @galileo3d/core

`@galileo3d/core` owns the engine lifecycle, scheduling spine, deterministic time stepping, diagnostics, events, logging, task queues, and disposable resource scopes. It is the root runtime package and does not depend on scene, rendering, physics, animation, assets, input, audio, scripting, editor, or browser-only APIs.

## Public API

- `Engine`: lifecycle owner for plugin initialization, scheduler execution, manual stepping, start/stop control, events, diagnostics, task queues, and resource disposal.
- `EngineConfig`, `resolveEngineConfig`, `ResolvedEngineConfig`: validated runtime configuration for fixed-step timing, max frame delta, time scale, and optional auto-start behavior.
- `EngineLoop`, `FrameContext`: deterministic frame loop used by `Engine` for manual and requestAnimationFrame-backed execution.
- `FixedStepAccumulator`: fixed-step accumulator with max-step clamping for deterministic simulation phases.
- `Scheduler`, `SystemPhase`: explicit ordered phase scheduler with dependency validation, duplicate rejection, cycle detection, and cross-phase dependency rejection.
- `TaskQueue`: async-safe queue flushed in the engine task phase.
- `EventBus`: typed event emitter used by engine lifecycle, frame, and error signals.
- `Diagnostics`: structured metric/counter snapshot support.
- `Logger`: scoped runtime logging abstraction.
- `DisposableStack`, `ResourceScope`: deterministic LIFO cleanup primitives.
- `ValidationError`, `LifecycleError`: typed error classes for invalid configuration, graph, and lifecycle operations.

## Lifecycle Contract

An `Engine` starts in `created`. Plugins may only be registered in this state. Calling `init()` transitions through `initializing` into `initialized`, invoking plugin `init` handlers in registration order. If any plugin initialization fails, already initialized plugin disposers run in reverse order and the engine transitions to `failed`.

Calling `start()` is valid only from `initialized` or `stopped`; it starts the configured loop and transitions to `running`. Calling `stop()` from `running` stops the loop and transitions to `stopped`. Calling `step(delta)` from `created` initializes the engine first, then executes one deterministic frame from `initialized`, `running`, or `stopped`.

Each frame executes phases in this order:

1. `Platform`
2. `Tasks`
3. queued `TaskQueue` work
4. `Fixed`, once per accumulated fixed step
5. `Update`
6. `Scene`
7. `Render`
8. `Present`
9. `Cleanup`

Calling `dispose()` is idempotent. If the engine is running it stops first, then disposes plugin resources and engine-owned `ResourceScope` entries, clears events, and transitions to `disposed`. Disposal errors are reported as an `AggregateError`.

## Verification

Lifecycle, scheduler, fixed-step, plugin rollback, deterministic manual stepping, and frame diagnostics are covered by:

- `tests/unit/core/scheduler-engine.test.ts`
- `tests/unit/core/config-time.test.ts`
- `tests/unit/core/events-disposal-diagnostics.test.ts`
- `tests/integration/engine-loop.test.ts`
- `tests/browser/core-raf-loop.spec.ts`

Public export and import boundaries are covered by `pnpm verify:exports`, `pnpm verify:imports`, and `pnpm verify:boundaries`.

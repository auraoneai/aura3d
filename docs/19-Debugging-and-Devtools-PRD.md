# Debugging And Devtools PRD

## Purpose
Debugging and devtools provide the built-in observability needed to prevent future black-box failures: frame profiling, draw-call tracking, shader/material validation, resource leak detection, physics debug draw, animation state inspection, and exportable reports.

## Lessons From Failed Attempts
- Old-G3D had valuable draw-call tracker and diagnostic docs.
- Rendering autopsies show that detailed diagnostics were essential to isolate shader selection, uniform upload, state pollution, and draw failures.
- Current G3D test reports exposed useful issue lists, but many docs claimed completion without proof.

Reuse conceptually:

- Draw-call tracker.
- Pipeline tracing.
- Runtime color/material asserts.
- Performance profiler.
- Visual diagnostics.

Discard:

- Diagnostics as optional afterthought.
- Test harness false positives.
- Debug systems that silently mutate engine state.

## Target Architecture
Debug package consumes public instrumentation hooks from core, renderer, physics, animation, assets, and ECS.

## File-By-File Implementation Plan

### `packages/debug/src/Profiler.ts`
- Purpose: CPU markers and frame timings.
- Tests: nested markers and snapshots.

### `packages/debug/src/GPUProfiler.ts`
- Purpose: backend timing when supported.
- Edge cases: extension unavailable.
- Tests: graceful unavailable path.

### `packages/debug/src/DrawCallTracker.ts`
- Purpose: count and classify draw calls.
- Tests: mock renderer call recording.

### `packages/debug/src/RenderStateInspector.ts`
- Purpose: capture render state before/after passes.
- Tests: state leak detection.

### `packages/debug/src/ShaderDiagnostics.ts`
- Purpose: shader source markers, compile logs, active attributes/uniforms.
- Tests: wrong marker failure.

### `packages/debug/src/MaterialDiagnostics.ts`
- Purpose: validate material bindings and uniform values.
- Tests: missing uniform and wrong type.

### `packages/debug/src/ResourceTracker.ts`
- Purpose: track GPU/asset/disposable resources.
- Tests: leak detection after dispose.

### `packages/debug/src/PhysicsDebugAdapter.ts`
- Purpose: convert physics debug shapes to debug render lines.
- Tests: box/sphere line counts.

### `packages/debug/src/AnimationInspector.ts`
- Purpose: expose mixer, actions, states, skeleton info.
- Tests: snapshot action state.

### `packages/debug/src/ECSInspector.ts`
- Purpose: expose entity/component/query/system stats.
- Tests: query/system snapshot.

### `packages/debug/src/DebugOverlay.ts`
- Purpose: optional browser overlay data model.
- Tests: text/model generation, no DOM requirement for core.

### `packages/debug/src/ReportExporter.ts`
- Purpose: JSON report for failures.
- Tests: deterministic report schema.

### `packages/debug/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Renderer failures include shader, material, resource, draw-call, and state diagnostics.
- Resource tracker can detect leaked disposable/GPU resources in tests.
- Debug draw can render physics/camera/bounds lines.
- Reports are structured JSON, not prose-only logs.

## Testing Checklist
- Unit: profiler, trackers, inspectors, exporter.
- Integration: renderer diagnostics around a real frame.
- Browser/runtime: overlay demo.
- Regression: diagnostics do not alter render output except explicit debug passes.

## Implementation Order
1. Profiler and resource tracker.
2. Renderer diagnostics.
3. Shader/material diagnostics.
4. Physics and animation inspectors.
5. Overlay and report export.


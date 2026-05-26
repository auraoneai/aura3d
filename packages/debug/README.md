# @aura3d/debug

`@aura3d/debug` owns diagnostics helpers for rendering, materials, shaders, physics, animation, ECS, profiling, resource leaks, overlays, line rendering, and report export.

## Public API

- `DrawCallTracker`, `RenderStateInspector`: draw-call recording and render-state leak detection.
- `ShaderDiagnostics`, `MaterialDiagnostics`: shader-source and material-binding validation with structured errors.
- `PhysicsDebugAdapter`, `AnimationInspector`, `ECSInspector`: snapshot and evidence adapters for runtime subsystems.
- `Profiler`, `GPUProfiler`, `ChromeTraceExporter`: CPU marker snapshots, GPU timer abstractions, and deterministic Chrome trace export for bounded local profiling evidence.
- `ResourceTracker`: leak detection for tracked runtime resources.
- `DebugOverlay`, `DebugLineCanvasRenderer`: browser-visible overlay rows and debug line drawing.
- `ReportExporter`: deterministic debug report serialization.

## Verification

Debug runtime behavior, render diagnostics, shader/material validation, physics/animation evidence, Chrome trace export, overlay rendering, and browser debug pixels are covered by `tests/unit/debug/debug-runtime.test.ts`, `tests/unit/debug/rendering-diagnostics.test.ts`, `tests/unit/workstream4.physics-animation.test.ts`, and `tests/browser/debug-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.

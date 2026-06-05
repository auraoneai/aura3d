# Profiling And Diagnostics

Version: 1.0.5

`@aura3d/debug` and the report-generation tools provide the diagnostics layer behind renderer, material, physics, animation, resource-lifecycle, and public-claim evidence. The package is exported from `@aura3d/engine/debug`.

## Package Surface

| Capability | Source |
|---|---|
| Draw-call and render-state inspection | `DrawCallTracker.ts`, `RenderStateInspector.ts` |
| Shader and material diagnostics | `ShaderDiagnostics.ts`, `MaterialDiagnostics.ts` |
| Physics, animation, and ECS adapters | `PhysicsDebugAdapter.ts`, `AnimationInspector.ts`, `ECSInspector.ts` |
| CPU/GPU profiling | `Profiler.ts`, `GPUProfiler.ts`, `ChromeTraceExporter.ts` |
| Resource leak tracking | `ResourceTracker.ts` |
| Browser overlays and line drawing | `DebugOverlay.ts`, `DebugLineCanvasRenderer.ts` |
| Deterministic report output | `ReportExporter.ts` |

## Evidence Systems

Diagnostics feed several feature gates:

- renderer lifecycle and disposal evidence in `docs/rendering/renderer-lifecycle.md`;
- advanced-gallery route reports and structural audit in `tools/advanced-gallery-report-audit/`;
- shader/material validation in rendering and material tests;
- physics debug evidence in physics routes and unit tests;
- Chrome trace output for bounded local profiling.

## Commands

Useful focused commands:

```sh
pnpm exec vitest run tests/unit/debug --reporter=dot
pnpm advanced-gallery:audit
pnpm test:performance
```

Run broader checks before release claims:

```sh
pnpm typecheck
pnpm test
```

## How To Use Reports

Diagnostics reports should be deterministic and narrow:

- name the package, route, or subsystem inspected;
- record enough input state to reproduce the finding;
- separate warnings from blockers;
- avoid converting runtime counters into visual acceptance;
- keep generated artifacts under ignored report directories unless release policy says otherwise.

Use `ReportExporter` or the existing tool helper patterns when adding new evidence files so the output is stable enough for tests and audits.

## Current Limits

- GPU timing depends on browser/device support and may be unavailable or noisy.
- Resource lifecycle reports prove the scoped reload/test path, not every possible app.
- Advanced-gallery audit proves the ten-route evidence set only when it has current full-gallery screenshots and matching hashes.
- Debug overlays are developer evidence, not user-facing production UI.

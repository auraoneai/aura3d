# Testing And Validation PRD

## Purpose
Testing defines the proof required before any subsystem is complete. It corrects the prior pattern where status reports claimed readiness while actual tests, visual behavior, or integration points were weak.

## Lessons From Failed Attempts
- Current `src/tests/E2E-TEST-REPORT.md` reported 4/13 E2E tests passing and known issues.
- `G3D2025` had many validation reports but also unresolved system order and dependency issues.
- Old-G3D had visual test harness false positives and browser/headless discrepancies.

## Target Architecture
Testing is a first-class package and tooling layer, not prose added after implementation. Unit tests run in Node where possible. Browser and visual tests run in Playwright. Performance tests produce structured JSON baselines. Boundary, export, shader, and visual verifiers are executable gates in `pnpm verify`.

Validation data flow:

1. Source packages expose public APIs.
2. Unit and integration tests verify deterministic contracts.
3. Browser tests verify real Web APIs.
4. Visual tests verify rendered pixels.
5. Verifier tools enforce import/export/shader/package rules.
6. Reports are emitted as JSON and linked from release notes.

## Test Layers

### Unit Tests
Purpose: prove pure functions and isolated classes.

Required for:

- Core scheduler/time/events.
- Math primitives.
- Scene transforms and cameras.
- ECS entity/component/query/command buffer.
- Renderer data contracts.
- Physics deterministic stepping.
- Animation sampling.
- Asset cache and loaders.

### Integration Tests
Purpose: prove cross-module data flow.

Required flows:

- Engine loop phase order.
- Scene to renderer.
- ECS to scene bridge.
- Physics to scene/ECS sync.
- Animation to scene/ECS sync.
- Asset to renderable scene object.
- Input to behavior to transform.
- Audio listener/source scene sync.

### Browser Tests
Purpose: prove real browser APIs.

Required:

- WebGL2 initialization.
- Buffer upload/readback.
- Shader compile and material binding.
- Rendered output nonblank.
- Context loss handling.
- Audio context unlock.
- Pointer events and controls.

### Visual Tests
Purpose: prove rendered pixels match intent.

Required visual baselines:

- Triangle.
- Lit cube.
- PBR sphere grid.
- Shadowed cube.
- Textured glTF asset.
- Debug lines.
- Particle emitter.
- Animated object.

### Performance Tests
Purpose: prevent regressions.

Budgets start conservative and become stricter after baseline:

- ECS: 100,000 entity iteration benchmark.
- Renderer: 1,000 cubes, then instancing benchmark later.
- Physics: 500 dynamic bodies fixed step.
- Animation: 100 mixers with simple clips.
- Assets: repeated load/release no leak.

## Required Tooling

## File-By-File Implementation Plan

### `vitest.config.ts`
- Purpose: configure unit and integration tests.
- Tests: sample unit and integration fixtures are discovered.

### `playwright.config.ts`
- Purpose: configure browser and visual tests.
- Tests: local page smoke and screenshot capture.

### `tests/unit/**`
- Purpose: isolated package tests.
- Tests: math/core/scene/ECS/rendering/physics/animation/assets/input/audio.

### `tests/integration/**`
- Purpose: cross-package data-flow tests.
- Tests: engine loop, scene-rendering, physics sync, animation sync, asset-to-renderable.

### `tests/browser/**`
- Purpose: real Web API tests.
- Tests: WebGL2 init, buffer upload/readback, shader compile, audio unlock, pointer events.

### `tests/visual/**`
- Purpose: screenshot and canvas-pixel assertions.
- Tests: triangle, cube, PBR, shadows, particles, animation.

### `tests/performance/**`
- Purpose: benchmark baselines.
- Tests: ECS entities, renderer draw calls, physics fixed step, animation mixers, assets release.

### `tools/verify-boundaries/index.ts`
- Purpose: enforce allowed package imports.
- Tests: valid and invalid import fixtures.

### `tools/verify-exports/index.ts`
- Purpose: enforce public export map and barrels.
- Tests: missing and unintended export fixtures.

### `tools/verify-shaders/index.ts`
- Purpose: enforce shader source markers and compile checks.
- Tests: wrong marker and missing marker fixtures.

### `tools/visual-baseline/index.ts`
- Purpose: run visual validation and produce reports.
- Tests: blank canvas fixture fails.

### `tools/verify-boundaries`
- Checks forbidden imports.
- Fails on cycles between packages.
- Fails on private deep imports.

### `tools/verify-exports`
- Checks package exports match docs.
- Fails on missing types or unintended exports.

### `tools/visual-baseline`
- Runs browser examples.
- Captures screenshots.
- Performs nonblank and expected-region checks.

### `tools/package-size`
- Tracks package and bundle sizes.

## Acceptance Gates
Every PRD must pass:

- Unit tests for its file list.
- Integration tests for its data flow.
- Browser tests if it uses browser APIs.
- Visual tests if it renders.
- Boundary tests if it adds imports.
- Export tests if it adds public API.
- Leak tests if it owns resources.

## Acceptance Criteria
- `pnpm test` runs unit and integration suites and emits structured reports.
- `pnpm test:browser` verifies real browser APIs for renderer, input, and audio.
- `pnpm test:visual` detects blank canvas and visual regressions.
- Boundary and export verifiers fail on known invalid fixtures.
- Shader verifier detects wrong or missing shader source markers.
- Performance tests record baselines without being used as sole correctness proof.

## Testing Checklist
- Unit: every pure runtime file has edge-case unit tests.
- Integration: every subsystem bridge has a data-flow test.
- Browser/runtime: every Web API dependency has a Playwright test.
- Visual: every renderer-facing subsystem has baseline or pixel checks.
- Physics correctness: fixed-step replay and collision tests.
- Animation correctness: sampling, blending, events, skeleton palette tests.
- Module import/export: package export and boundary tests.
- Example/demo validation: all examples smoke-tested; visual examples screenshot-tested.

## Required Reports
Reports must be generated from command output or structured test results:

- `tests/reports/unit.json`
- `tests/reports/integration.json`
- `tests/reports/browser.json`
- `tests/reports/visual.json`
- `tests/reports/performance.json`
- `tests/reports/boundaries.json`
- `tests/reports/exports.json`

## Completion Anti-Patterns
These do not prove completion:

- "No TODOs" text in a README.
- Line counts.
- Manual screenshots without test metadata.
- Passing unit tests that do not cover browser rendering.
- A generated "final status" report without commands and evidence.
- Examples that run only because they bypass engine APIs.

## Implementation Order
1. Vitest unit setup.
2. Boundary and export verifiers.
3. Playwright browser setup.
4. Visual baseline harness.
5. Performance benchmark harness.
6. Required reports.

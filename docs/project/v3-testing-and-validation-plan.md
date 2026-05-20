# Testing And Validation Plan

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Goal

Create a v3 verification system that proves code behavior, visual output, and comparison claims. Internal tests are necessary, but the v3 target requires browser-visible product evidence and same-scene competitor comparisons.

## New Commands

Add these package scripts:

- [x] `pnpm verify:v3-code`
- [x] `pnpm verify:v3-examples`
- [x] `pnpm verify:v3-rendering`
- [x] `pnpm verify:v3-assets`
- [x] `pnpm verify:v3-editor`
- [x] `pnpm verify:v3-runtime`
- [x] `pnpm verify:v3-benchmarks`
- [x] `pnpm verify:v3`

## Reports

Add these reports:

- [x] `tests/reports/v3-current-capability.json`
- [x] `tests/reports/v3-example-screenshots/manifest.json`
- [x] `tests/reports/v3-rendering.json`
- [x] `tests/reports/v3-asset-corpus.json`
- [x] `tests/reports/v3-editor-authoring.json`
- [x] `tests/reports/v3-runtime-systems.json`
- [x] `tests/reports/v3-engine-comparison.json`
- [x] `tests/reports/v3-flake-detection.json`
- [x] `tests/reports/v3-claim-gates.json`

Each report must include:

- [x] commit hash;
- [x] run ID;
- [x] command;
- [x] timestamp;
- [x] browser version where applicable;
- [x] source file hashes or freshness marker;
- [x] pass/fail;
- [x] blocked claims;
- [x] screenshot paths where applicable.

## Browser Visual Validation

Required tests:

- [x] Portfolio screenshot audit.
- [x] Product configurator visual and interaction test.
- [x] Architecture viewer visual and interaction test.
- [x] Game slice visual and interaction test.
- [x] Asset viewer corpus visual test.
- [x] Material showroom visual test.
- [x] Shadow lab visual test.
- [x] Postprocess lab before/after visual test.
- [x] Editor authoring visual workflow test.
- [x] Exported app visual smoke test.

## Pixel And Screenshot Rules

- [x] Nonblank pixels are not enough for v3 visual completion.
- [x] Tests must verify expected color/material/geometry regions where feasible.
- [x] Screenshots must be stored with stable viewport, DPR, and browser version.
- [x] Screenshot diff thresholds must be explicit.
- [x] Any changed screenshot baseline must include a reason.

## Benchmark Validation

Required tests:

- [x] Same-scene startup benchmark.
- [x] Same-scene load benchmark.
- [x] Same-scene frame benchmark.
- [x] Same-scene memory/resource benchmark.
- [x] Same-scene screenshot generation.
- [x] Unsupported-feature comparison.

Benchmark rules:

- [x] No benchmark may compare different scenes.
- [x] No benchmark may hide unsupported features.
- [x] No benchmark may claim a win from one metric while losing the required feature behavior.
- [x] Every report must list where Three.js/Babylon remains stronger.

## Editor Workflow Validation

Required Playwright workflow:

- [x] New project.
- [x] Import asset.
- [x] Place object.
- [x] Select object.
- [x] Edit transform.
- [x] Edit material.
- [x] Add light.
- [x] Add camera.
- [x] Add physics/script component if supported.
- [x] Enter play mode.
- [x] Save project.
- [x] Reload project.
- [x] Export app.
- [x] Open exported app.
- [x] Verify rendered pixels and runtime state.

## Claim Validation

Add source checks that fail if disallowed claims appear before gates pass:

- [x] broad better-than-Three.js language;
- [x] Unity/Unreal replacement language;
- [x] production-ready language;
- [x] PBR parity language;
- [x] full WebGPU language;
- [x] complete glTF support language;
- [x] real editor language before editor workflow passes.

## Flake Control

- [x] Run browser visual tests at least twice in one command and compare reports.
- [x] Isolate tests that depend on network and provide local fixtures where possible.
- [x] Add timeout diagnostics and console/pageerror capture.
- [x] Fail on renderer disposal errors, context loss, shader errors, and missing textures unless expected.

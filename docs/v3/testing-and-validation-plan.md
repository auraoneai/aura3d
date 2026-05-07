# Testing And Validation Plan

## Goal

Create a v3 verification system that proves code behavior, visual output, and comparison claims. Internal tests are necessary, but the v3 target requires browser-visible product evidence and same-scene competitor comparisons.

## New Commands

Add these package scripts:

- [ ] `pnpm verify:v3-code`
- [ ] `pnpm verify:v3-examples`
- [ ] `pnpm verify:v3-rendering`
- [ ] `pnpm verify:v3-assets`
- [ ] `pnpm verify:v3-editor`
- [ ] `pnpm verify:v3-runtime`
- [ ] `pnpm verify:v3-benchmarks`
- [ ] `pnpm verify:v3`

## Reports

Add these reports:

- [ ] `tests/reports/v3-current-capability.json`
- [ ] `tests/reports/v3-example-screenshots/manifest.json`
- [ ] `tests/reports/v3-rendering.json`
- [ ] `tests/reports/v3-asset-corpus.json`
- [ ] `tests/reports/v3-editor-authoring.json`
- [ ] `tests/reports/v3-runtime-systems.json`
- [ ] `tests/reports/v3-engine-comparison.json`
- [ ] `tests/reports/v3-claim-gates.json`

Each report must include:

- [ ] commit hash;
- [ ] run ID;
- [ ] command;
- [ ] timestamp;
- [ ] browser version where applicable;
- [ ] source file hashes or freshness marker;
- [ ] pass/fail;
- [ ] blocked claims;
- [ ] screenshot paths where applicable.

## Browser Visual Validation

Required tests:

- [ ] Portfolio screenshot audit.
- [ ] Product configurator visual and interaction test.
- [ ] Architecture viewer visual and interaction test.
- [ ] Game slice visual and interaction test.
- [ ] Asset viewer corpus visual test.
- [ ] Material showroom visual test.
- [ ] Shadow lab visual test.
- [ ] Postprocess lab before/after visual test.
- [ ] Editor authoring visual workflow test.
- [ ] Exported app visual smoke test.

## Pixel And Screenshot Rules

- [ ] Nonblank pixels are not enough for v3 visual completion.
- [ ] Tests must verify expected color/material/geometry regions where feasible.
- [ ] Screenshots must be stored with stable viewport, DPR, and browser version.
- [ ] Screenshot diff thresholds must be explicit.
- [ ] Any changed screenshot baseline must include a reason.

## Benchmark Validation

Required tests:

- [ ] Same-scene startup benchmark.
- [ ] Same-scene load benchmark.
- [ ] Same-scene frame benchmark.
- [ ] Same-scene memory/resource benchmark.
- [ ] Same-scene screenshot generation.
- [ ] Unsupported-feature comparison.

Benchmark rules:

- [ ] No benchmark may compare different scenes.
- [ ] No benchmark may hide unsupported features.
- [ ] No benchmark may claim a win from one metric while losing the required feature behavior.
- [ ] Every report must list where Three.js/Babylon remains stronger.

## Editor Workflow Validation

Required Playwright workflow:

- [ ] New project.
- [ ] Import asset.
- [ ] Place object.
- [ ] Select object.
- [ ] Edit transform.
- [ ] Edit material.
- [ ] Add light.
- [ ] Add camera.
- [ ] Add physics/script component if supported.
- [ ] Enter play mode.
- [ ] Save project.
- [ ] Reload project.
- [ ] Export app.
- [ ] Open exported app.
- [ ] Verify rendered pixels and runtime state.

## Claim Validation

Add source checks that fail if disallowed claims appear before gates pass:

- [ ] broad better-than-Three.js language;
- [ ] Unity/Unreal replacement language;
- [ ] production-ready language;
- [ ] PBR parity language;
- [ ] full WebGPU language;
- [ ] complete glTF support language;
- [ ] real editor language before editor workflow passes.

## Flake Control

- [ ] Run browser visual tests at least twice in one command and compare reports.
- [ ] Isolate tests that depend on network and provide local fixtures where possible.
- [ ] Add timeout diagnostics and console/pageerror capture.
- [ ] Fail on renderer disposal errors, context loss, shader errors, and missing textures unless expected.


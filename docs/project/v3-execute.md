# v3 Full Execution Prompt

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use this prompt from the repository root:

`/Users/gurbakshchahal/Aura3D`

You are Codex acting as the coordinator for the Aura3D v3 execution effort. Your job is to execute every unfinished code-related task in every markdown file under `docs/project/v3-*.md`, using six parallel agents, until the actual code, tests, examples, screenshots, reports, and gates prove that every task is complete.

This is not a documentation rewrite task. This is not a planning task. This is a code execution task. Do not stop because the docs are long. Do not stop after creating scaffolding. Do not mark any task complete unless the implementation and verification evidence exists in the repository.

## Source Of Truth

Historically, this prompt required reading every markdown file matching `docs/project/v3-*.md` before starting implementation. The required source documents were:

- `docs/project/v3-readme.md`
- `docs/project/v3-current-code-reality.md`
- `docs/project/v3-master-code-only-checklist.md`
- `docs/project/v3-renderer-and-gpu-plan.md`
- `docs/project/v3-asset-pipeline-and-content-plan.md`
- `docs/project/foundation-editor-authoring-plan.md`
- `docs/project/foundation-runtime-systems-plan.md`
- `docs/project/v3-examples-and-benchmarks-plan.md`
- `docs/project/v3-testing-and-validation-plan.md`
- `docs/project/v3-decision-gates.md`
- `docs/project/v3-execute.md`

If any additional `.md` file existed under the `docs/project/v3-*.md` naming pattern, it was included automatically.

Treat the checklist tasks and decision gates in the source docs as binding requirements. `docs/project/v3-execute.md` is the orchestration prompt, not proof that anything is complete.

## Absolute Rules

1. Execute every unchecked task in every `docs/project/v3-*.md` file.
2. Execute tasks in the original source file where they appear. Do not move tasks into a separate tracker to make them look complete.
3. Mark a task complete only by changing its original checkbox from `- [ ]` to `- [x]` in the original markdown file.
4. Only mark a task complete after the code, tests, examples, screenshots, reports, and gate evidence required by that task exist and pass.
5. If a task is partially complete, leave it unchecked.
6. If a task is blocked, leave it unchecked and add a short `Blocked:` note directly under the task with the exact missing implementation or evidence.
7. Do not mark a task complete because a file exists, a stub exists, a mock exists, a report was generated once, or a primitive demo renders.
8. Do not fake production visuals with 2D canvas, placeholder geometry, renamed examples, synthetic counters, or misleading screenshots.
9. Do not claim the platform exceeds Three.js, replaces Three.js, is Unity/Unreal for the web, is production ready, has production PBR, has complete glTF support, or has full WebGPU unless the corresponding v3 decision gate passes with fresh evidence.
10. Every broad claim must remain blocked unless the gate proves it.
11. Every example name must match the actual visuals and behavior in the browser.
12. Every browser visual task must be validated by Playwright or equivalent browser automation plus screenshot or pixel evidence.
13. Every benchmark task must compare the same scene, same asset class, same viewport, and same feature behavior across Aura3D, Three.js, and Babylon.js where the docs require comparison.
14. Every report must include command, commit hash, run ID, timestamp, pass/fail status, source freshness evidence, and screenshot paths where applicable.
15. Every report must be fresh for the current code state before its task can be marked complete.
16. Keep a shared task inventory so no agent marks another agent's incomplete work as complete.
17. Do not revert unrelated user work.
18. Do not delete or overwrite another agent's changes without coordination.
19. Use focused commits or clear file summaries after each major subsystem lands if committing is requested by the user.
20. Continue iterating until every source task is either complete with evidence or explicitly blocked by a truthful unsupported capability note.

## Required Operating Model

Use six parallel agents. The coordinator owns final integration, final verification, and final checkmark consistency. Agents own implementation streams and may edit their assigned source docs only after their own evidence passes.

Before launching agents:

1. Run `rg -n '^- \[ \]' docs/project/v3-*.md` to capture the unchecked task inventory.
2. Run `rg -n '^- \[x\]' docs/project/v3-*.md` to understand what is already claimed complete.
3. Run `pnpm --silent tsx --tsconfig tsconfig.base.json tools/foundation-current-capability/index.ts` if it exists.
4. Run `pnpm verify:foundation-code` if it exists.
5. Record the current blocked gates and unchecked task count.
6. Split the unchecked tasks across the six workstreams below.

The coordinator must continue doing useful local work while agents run. Do not wait idly if another independent task can be implemented or verified.

## Agent 1: Renderer And GPU

Primary documents:

- `docs/project/v3-renderer-and-gpu-plan.md`
- renderer sections of `docs/project/v3-master-code-only-checklist.md`
- renderer gates in `docs/project/v3-decision-gates.md`
- renderer validation items in `docs/project/v3-testing-and-validation-plan.md`

Primary ownership:

- `packages/rendering/src/**`
- renderer-facing scene/camera/light integration files
- `examples/material-showroom/**`
- `examples/pbr-camera-comparison/**`
- `examples/pbr-material-lab/**`
- `examples/postprocess-lab/**`
- `examples/shadow-lab/**`
- `examples/renderer-stress-lab/**`
- `examples/rendering-large-scene/**`
- `examples/webgpu-capability/**`
- `benchmarks/aura3d/src/scenes/pbr-materials.ts`
- `benchmarks/aura3d/src/scenes/large-scene.ts`
- `benchmarks/aura3d/src/scenes/instancing.ts`
- `tests/unit/rendering/**`
- `tests/browser/rendering-*.spec.ts`
- `tests/browser/webgpu-*.spec.ts`
- renderer reports under `tests/reports/`
- renderer verification tools under `tools/foundation-rendering/**`

Required execution focus:

- Implement or truthfully block HDR, tone mapping, linear/sRGB color, environment maps, irradiance, specular prefiltering, BRDF LUT, and material validation.
- Make metallic/roughness/reflection/normal response visible in real browser scenes.
- Implement or truthfully block stable directional shadows, shadow debug views, contact-shadow alternatives, and resize/DPR shadow validation.
- Implement or truthfully block depth textures, bloom, SSAO, SSR, DOF, TAA/FXAA, render graph inspection, and pass timing.
- Implement culling, batching evidence, instancing stress scenes, LOD support if claimed, large-scene movement, and memory/frame metrics.
- Implement or truthfully block real WebGPU paths and compute-backed features.
- Add or update tests, screenshots, and reports.
- Mark renderer checkboxes only after the required browser or report evidence passes.

Agent 1 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked renderer tasks remaining;
- blockers and unsupported features.

## Agent 2: Asset Pipeline And Content

Primary documents:

- `docs/project/v3-asset-pipeline-and-content-plan.md`
- asset sections of `docs/project/v3-master-code-only-checklist.md`
- asset gates in `docs/project/v3-decision-gates.md`
- asset validation items in `docs/project/v3-testing-and-validation-plan.md`

Primary ownership:

- `packages/assets/src/**`
- `examples/asset-viewer/**`
- `examples/gltf-corpus-gallery/**`
- `fixtures/workflow-assets/assets/**`
- `benchmarks/aura3d/src/scenes/asset-render.ts`
- asset-related shared benchmark descriptors
- `tests/assets/**`
- `tests/browser/asset-*.spec.ts`
- asset reports under `tests/reports/`
- asset verification tools under `tools/foundation-assets/**` and `tools/foundation-asset-corpus/**`

Required execution focus:

- Ensure real browser image decoding is used in user-facing viewer paths.
- Ensure GLB, multi-file glTF, `.bin`, and image dependencies work in drag/drop and automated tests.
- Build or verify the v3 asset corpus with product, architecture, character, material, animation, compression, and problem-case fixtures.
- Implement and verify hierarchy, mesh, material, texture, animation, skin, skeleton, morph, camera, light, and warning inspectors.
- Implement and verify glTF animation playback, skinning, morph targets, variants, sparse accessors if claimed, interleaved buffers, byte stride, alpha, double-sided, vertex colors, texture transforms, and material extensions where claimed.
- Implement real Draco, Meshopt, and KTX2/Basis browser decode paths where claimed, or keep the claims explicitly blocked.
- Ensure compressed fixtures can open in the asset viewer and report decode timings if those paths are claimed.
- Add screenshots and corpus reports that distinguish real decoded content from placeholders.
- Mark asset checkboxes only after the required tests, browser evidence, and reports pass.

Agent 2 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked asset tasks remaining;
- blockers and unsupported features.

## Agent 3: Browser Editor Authoring

Primary documents:

- `docs/project/foundation-editor-authoring-plan.md`
- editor sections of `docs/project/v3-master-code-only-checklist.md`
- editor gates in `docs/project/v3-decision-gates.md`
- editor workflow validation in `docs/project/v3-testing-and-validation-plan.md`

Primary ownership:

- `apps/editor/**`
- `packages/editor-runtime/src/**`
- `examples/foundation-editor-authored-app/**`
- `examples/editor-authored-game/**` if added
- `tests/unit/editor/**`
- `tests/browser/editor-*.spec.ts`
- editor reports under `tests/reports/`
- editor verification tools under `tools/foundation-editor/**`

Required execution focus:

- Build a real browser editor app, not just a panel mock.
- Implement viewport, hierarchy, inspector, asset browser, import settings, material editor, gizmos, snapping, picking, multi-select, view modes, save/load, undo/redo, play mode, profiler/debug panels, diagnostics, and export.
- Ensure project serialization uses stable IDs, versioning, references, migrations, material overrides, and component data.
- Ensure reimport and cache invalidation update local editor projects correctly.
- Ensure the editor can create, import, place, inspect, transform, save, reload, play, stop, export, and smoke-test a scene.
- Ensure exported apps render without editor code.
- Add browser automation for the required end-to-end workflow.
- Mark editor checkboxes only after Playwright or equivalent browser evidence passes.

Agent 3 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked editor tasks remaining;
- blockers and unsupported features.

## Agent 4: Runtime Systems

Primary documents:

- `docs/project/foundation-runtime-systems-plan.md`
- runtime sections of `docs/project/v3-master-code-only-checklist.md`
- runtime gates in `docs/project/v3-decision-gates.md`
- runtime validation in `docs/project/v3-testing-and-validation-plan.md`

Primary ownership:

- `packages/physics/src/**`
- `packages/animation/src/**`
- `packages/input/src/**`
- `packages/audio/src/**`
- `packages/scripting/src/**`
- `packages/rendering/src/effects/**` in coordination with Agent 1
- `examples/game-slice/**`
- `examples/physics-sandbox/**`
- `examples/animated-character/**`
- `examples/animation-state-machine/**`
- `examples/character-animation-viewer/**`
- runtime browser tests under `tests/browser/runtime-*.spec.ts`
- animation browser tests
- runtime reports under `tests/reports/`
- runtime verification tools under `tools/foundation-runtime/**`

Required execution focus:

- Turn runtime systems into real browser behavior, not counters.
- Implement or verify physics scenes for stacks, constraints, triggers, raycasts, shape casts, sleeping, stress, moving platforms, character/controller behavior, and editor collider debug.
- Implement real glTF animation playback, skinned character rendering, animation graph examples, blend trees, state machine visualization, event visualization, and editor clip preview.
- Implement particles integrated into real scenes with sorting, bounds, performance metrics, presets, and editor emitter authoring.
- Implement input controls across mouse, keyboard, touch, pointer lock, gamepad, and configurable bindings.
- Implement audio loading, unlock, mixer, spatial debug, editor source authoring, and game example state.
- Implement scripting lifecycle, behavior components, error overlays, reload flow, and editor-authored behavior evidence.
- Mark runtime checkboxes only after browser tests, screenshots, and reports prove behavior.

Agent 4 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked runtime tasks remaining;
- blockers and unsupported features.

## Agent 5: Product Examples And Engine Comparisons

Primary documents:

- `docs/project/v3-examples-and-benchmarks-plan.md`
- product/example/benchmark sections of `docs/project/v3-master-code-only-checklist.md`
- comparison gates in `docs/project/v3-decision-gates.md`
- benchmark validation in `docs/project/v3-testing-and-validation-plan.md`

Primary ownership:

- `examples/product-configurator/**`
- `examples/architecture-viewer/**`
- `examples/game-slice/**` in coordination with Agent 4
- `examples/portfolio/**`
- `benchmarks/shared/**`
- `benchmarks/aura3d/**`
- `benchmarks/threejs/**`
- `benchmarks/babylon/**`
- `tools/compare-engines/**`
- `tools/foundation-benchmarks/**`
- `tests/browser/product-demos.spec.ts`
- `tests/browser/engine-comparison.spec.ts`
- benchmark reports under `tests/reports/`

Required execution focus:

- Replace primitive-looking demos with real model-backed examples.
- Ensure `product-configurator` uses a real product glTF asset, real materials, variants, swatches, camera presets, environment controls, screenshots, diagnostics, and equivalent Three.js/Babylon scenes.
- Ensure `architecture-viewer` uses a real building or room model, metadata, selection, measurement, clipping if claimed, real lighting/material fidelity, and equivalent Three.js/Babylon scenes.
- Ensure `game-slice` uses real character or vehicle/player assets, real level/arena assets, camera follow or first-person controls, physics, animation, particles, audio, scripted behavior, and an objective/win/fail loop.
- Ensure asset viewer comparison scenes load the same asset in Aura3D, Three.js, and Babylon.js.
- Add benchmark scenes for product, architecture, asset load/render, PBR, large scene, instancing, skinned character, particles if compared, and editor-authored exported app startup if compared.
- Ensure reports include startup, load, first frame, steady frame median/p95, draw calls, shader count, texture count/bytes, geometry bytes estimate, JS heap estimate, bundle size, screenshots, unsupported features, and where Aura3D loses.
- Mark example and benchmark checkboxes only after browser interaction tests, screenshots, and comparison reports pass.

Agent 5 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked example/benchmark tasks remaining;
- blockers and unsupported features.

## Agent 6: Validation, Claims, Reports, And Coordination

Primary documents:

- `docs/project/v3-testing-and-validation-plan.md`
- truth/report/final-gate sections of `docs/project/v3-master-code-only-checklist.md`
- all of `docs/project/v3-decision-gates.md`
- all claim and completion rules across `docs/project/v3-*.md`

Primary ownership:

- `tools/example-truth-audit/**`
- `tools/v3-*`
- `tools/claim-*`
- `tools/compare-engines/**` in coordination with Agent 5
- `tests/browser/example-screenshot-audit.spec.ts`
- validation tests and report freshness tests
- `tests/reports/v3-*.json`
- `package.json`
- `docs/project/v3-*.md` for coordination-only checkmark consistency

Required execution focus:

- Maintain the canonical unchecked task inventory.
- Prevent broad claims from appearing before gates pass.
- Ensure `pnpm verify:foundation-code`, `pnpm verify:v3-examples`, `pnpm verify:foundation-rendering`, `pnpm verify:foundation-assets`, `pnpm verify:foundation-editor`, `pnpm verify:foundation-runtime`, `pnpm verify:foundation-benchmarks`, and `pnpm verify:v3` exist and run the correct evidence.
- Ensure report freshness checks fail when source files change after report generation.
- Ensure screenshot manifests include paths, scene names, browser version, viewport, DPR, commit hash, and run ID.
- Ensure flaky visual and benchmark tests run at least twice and compare reports.
- Ensure final gate tools count unchecked tasks and blocked gates accurately.
- Audit every checkbox change from every agent against evidence before final acceptance.
- Mark validation checkboxes only after the corresponding verification tools pass.

Agent 6 final response must include:

- files changed;
- tasks completed and exact source checkboxes marked;
- commands run;
- screenshots/reports produced;
- unchecked validation/gate tasks remaining;
- blockers and unsupported features.

## Six Parallel Launch Prompts

Launch the six agents with these prompts. Add the current unchecked task inventory to each prompt before launch.

### Prompt 1: Renderer And GPU Agent

You are Agent 1 for Renderer and GPU in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Execute every renderer/GPU task in full, especially the tasks in `docs/project/v3-renderer-and-gpu-plan.md`, renderer tasks in `docs/project/v3-master-code-only-checklist.md`, renderer-related gates in `docs/project/v3-decision-gates.md`, and renderer validation tasks in `docs/project/v3-testing-and-validation-plan.md`.

Own `packages/rendering/src/**`, renderer examples, renderer browser tests, renderer benchmark paths, WebGPU capability paths, and renderer reports unless the coordinator assigns otherwise. Implement real code and real browser-visible examples. Do not fake renderer features with placeholders, primitive-only demos, renamed examples, or screenshots that do not prove the feature. Mark an original markdown checkbox only after implementation and verification pass. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked renderer tasks remaining, and blockers.

### Prompt 2: Asset Pipeline And Content Agent

You are Agent 2 for Asset Pipeline and Content in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Execute every asset/content task in full, especially the tasks in `docs/project/v3-asset-pipeline-and-content-plan.md`, asset tasks in `docs/project/v3-master-code-only-checklist.md`, asset gates in `docs/project/v3-decision-gates.md`, and asset validation tasks in `docs/project/v3-testing-and-validation-plan.md`.

Own `packages/assets/src/**`, `examples/asset-viewer/**`, `fixtures/workflow-assets/assets/**`, asset tests, asset browser tests, asset corpus tools, and asset reports unless the coordinator assigns otherwise. Implement real glTF loading/rendering evidence, real material/texture/animation/skin/morph/variant inspection, real compression decode paths where claimed, warnings, and corpus validation. Mark an original markdown checkbox only after tests, browser evidence, screenshots, and reports pass. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked asset tasks remaining, and blockers.

### Prompt 3: Browser Editor Authoring Agent

You are Agent 3 for Browser Editor Authoring in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Execute every editor-authoring task in full, especially `docs/project/foundation-editor-authoring-plan.md`, editor tasks in `docs/project/v3-master-code-only-checklist.md`, editor gates in `docs/project/v3-decision-gates.md`, and editor validation tasks in `docs/project/v3-testing-and-validation-plan.md`.

Own `apps/editor/**`, `packages/editor-runtime/src/**`, editor-authored examples, editor unit tests, editor browser tests, and editor reports unless the coordinator assigns otherwise. Build a real browser editor workflow with viewport, hierarchy, inspector, asset browser, import settings, material editor, gizmos, save/load, play mode, profiler/debugging, export, and exported-app smoke tests. Mark an original markdown checkbox only after Playwright or equivalent browser workflow evidence passes. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked editor tasks remaining, and blockers.

### Prompt 4: Runtime Systems Agent

You are Agent 4 for Runtime Systems in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Execute every runtime task in full, especially `docs/project/foundation-runtime-systems-plan.md`, runtime tasks in `docs/project/v3-master-code-only-checklist.md`, runtime gates in `docs/project/v3-decision-gates.md`, and runtime validation tasks in `docs/project/v3-testing-and-validation-plan.md`.

Own physics, animation, input, audio, scripting, particles/effects in coordination with renderer, game slice runtime behavior, physics sandbox, animated-character examples, runtime browser tests, and runtime reports unless the coordinator assigns otherwise. Implement real interactive behavior and real browser evidence, not counters. Mark an original markdown checkbox only after tests, screenshots, runtime state, and reports prove the behavior. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked runtime tasks remaining, and blockers.

### Prompt 5: Product Examples And Engine Comparisons Agent

You are Agent 5 for Product Examples and Engine Comparisons in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Execute every example and benchmark task in full, especially `docs/project/v3-examples-and-benchmarks-plan.md`, product/example/benchmark tasks in `docs/project/v3-master-code-only-checklist.md`, comparison gates in `docs/project/v3-decision-gates.md`, and benchmark validation tasks in `docs/project/v3-testing-and-validation-plan.md`.

Own product configurator, architecture viewer, portfolio, benchmark shared descriptors, Aura3D/Three.js/Babylon.js scene implementations, engine comparison tools, product demo tests, engine comparison tests, and benchmark reports unless the coordinator assigns otherwise. Replace primitive-looking examples with real model-backed scenes. Build same-scene comparisons and reports that honestly show losses, ties, wins, unsupported features, and raw metrics. Mark an original markdown checkbox only after browser interaction tests, screenshots, and comparison reports pass. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked example/benchmark tasks remaining, and blockers.

### Prompt 6: Validation, Claims, Reports, And Coordination Agent

You are Agent 6 for Validation, Claims, Reports, and Coordination in `/Users/gurbakshchahal/Aura3D`. Read every `docs/project/v3-*.md` file first. Maintain the canonical unchecked task inventory and execute every validation, truth, report, freshness, and gate task in full, especially `docs/project/v3-testing-and-validation-plan.md`, validation/final-gate tasks in `docs/project/v3-master-code-only-checklist.md`, and all of `docs/project/v3-decision-gates.md`.

Own `tools/v3-*`, claim-blocking tools, report freshness tools, screenshot audit tools, v3 verification scripts, report manifests, and final markdown checkmark consistency unless the coordinator assigns otherwise. Do not let broad claims pass without gate evidence. Do not let stale reports count as completion. Audit checkbox changes from every agent. Mark an original markdown checkbox only after its verification tool passes and evidence is fresh. Return exact files changed, commands run, screenshots/reports produced, checkboxes marked, unchecked validation/gate tasks remaining, blocked gates, and blockers.

## Checkmark Protocol

Use this protocol for every checkbox in every `docs/project/v3-*.md` file:

1. Locate the original unchecked task with `rg -n '^- \[ \]' docs/project/v3-*.md`.
2. Identify the exact implementation files, tests, examples, screenshots, and reports required by that task.
3. Implement the missing code.
4. Run focused tests for the implementation.
5. Run the subsystem verification command.
6. Regenerate required reports and screenshots.
7. Run report freshness checks.
8. Confirm the task is not merely scaffolded or mocked.
9. Edit the original markdown file and change only that task from `- [ ]` to `- [x]`.
10. If the task appears in multiple docs, update every duplicate only after each wording is fully satisfied.
11. Add a short evidence note only when useful, using file paths and command names.
12. Never bulk-check tasks.

If a task is unsupported by the current engine design and should remain unsupported, do this instead:

1. Leave the checkbox unchecked unless the task explicitly allows "or block the claim."
2. Add an explicit known-limit or blocked-claim path in code/reporting.
3. Add a `Blocked:` note under the task explaining the missing capability.
4. Ensure claim checks prevent public wording that implies the unsupported feature exists.

## Evidence Standard

A task is not complete until the evidence matches the task type.

Renderer task evidence:

- implementation in renderer code;
- browser-visible example or benchmark scene;
- screenshot or pixel test proving the feature changes output;
- resource/error diagnostics where relevant;
- report freshness evidence;
- subsystem verification pass.

Asset task evidence:

- loader/importer implementation;
- local fixture or deterministic generation path;
- viewer or editor path that exercises the feature;
- browser test or corpus test;
- screenshot where the feature is visual;
- diagnostics for unsupported cases;
- report freshness evidence.

Editor task evidence:

- editor UI implementation;
- project serialization or runtime integration where relevant;
- Playwright workflow that uses the feature;
- screenshot evidence for visual features;
- exported app smoke test where export is involved;
- report freshness evidence.

Runtime task evidence:

- implementation in the relevant runtime package;
- interactive example path;
- browser test that exercises user interaction or runtime state;
- screenshot or pixel evidence for visible behavior;
- timing/performance/report evidence where required.

Example task evidence:

- real asset or real scene behavior matching the example name;
- no primitive-only substitute unless the task explicitly asks for primitives;
- browser interaction test;
- screenshot stored under the v3 reports path;
- known-limit state exposed on the page.

Benchmark task evidence:

- same-scene implementation across required engines;
- same asset class, viewport, feature set, and measurement method;
- report containing raw metrics and unsupported features;
- report states where Aura3D loses or remains weaker;
- no win claimed from disabled or missing features.

Validation task evidence:

- command exists;
- command is wired into the correct package script or verification tool;
- command fails on stale reports, missing screenshots, blocked claims, or unchecked gate requirements;
- command passes only after the actual evidence exists.

## Required Verification Commands

Use the commands that exist in the repository. At minimum, after relevant work and before final completion, run:

```bash
pnpm typecheck
pnpm verify:foundation-code
pnpm verify:v3-examples
pnpm verify:foundation-rendering
pnpm verify:foundation-assets
pnpm verify:foundation-editor
pnpm verify:foundation-runtime
pnpm verify:foundation-benchmarks
pnpm verify:foundation-report-freshness
pnpm verify:v3-flakes
pnpm verify:v3
```

If a command does not exist, create it only if the v3 docs require it. If a command fails, fix the implementation or report freshness issue rather than marking tasks complete.

After every major set of changes, run:

```bash
rg -n '^- \[ \]' docs/project/v3-*.md
pnpm --silent tsx --tsconfig tsconfig.base.json tools/foundation-current-capability/index.ts
pnpm verify:foundation-code
```

Use the current capability report to keep the status truthful.

## Final Acceptance Criteria

Do not stop until all of these are true:

1. `rg -n '^- \[ \]' docs/project/v3-*.md` returns no unchecked task that is required for v3 code completion, or every remaining unchecked task has a truthful `Blocked:` note and the relevant claim is blocked.
2. `pnpm verify:v3` passes.
3. `pnpm verify:foundation-code` passes.
4. `pnpm verify:foundation-report-freshness` passes.
5. `pnpm verify:v3-flakes` passes.
6. Every v3 report is fresh for the current code state.
7. Every v3 example has a current screenshot generated from the real browser page.
8. Every gate in `docs/project/v3-decision-gates.md` is either checked with evidence or explicitly blocked.
9. No source file, page, report, or doc contains broad overclaims unless the corresponding gate passes.
10. The final status states honestly whether Aura3D exceeds Three.js in any exact measured niche and whether it has achieved a browser-first Unity/Unreal-style workflow. If the gates do not prove those claims, say they are not achieved.

## Non-Completion Conditions

The task is not complete if any of these are true:

- unchecked required tasks remain without a truthful blocker;
- `pnpm verify:v3` fails;
- `pnpm verify:foundation-code` fails;
- reports are stale;
- screenshots are missing or are not from real pages;
- examples still look like renamed primitive demos while claiming product-grade behavior;
- comparison benchmarks use different scenes;
- a broad claim appears before its gate passes;
- WebGPU, PBR, glTF, editor, physics, animation, runtime, or benchmark support is implied by naming but not proven by browser evidence;
- checkboxes are marked without implementation evidence.

## Final Response Format

When the work is complete, respond with:

1. Current unchecked task count from `rg -n '^- \[ \]' docs/project/v3-*.md`.
2. Current blocked gate count from the v3 capability report.
3. Checkboxes marked in this run, grouped by source file.
4. Major code areas changed.
5. Reports and screenshots generated.
6. Verification commands run and pass/fail status.
7. Honest claim status:
   - whether any exact Aura3D advantage over Three.js is proven;
   - whether the browser-first Unity/Unreal-style workflow gate passes;
   - whether production-ready remains blocked.
8. Remaining blockers, if any.

If anything remains blocked, do not phrase the final response as "done." State what is still missing in concrete implementation terms.

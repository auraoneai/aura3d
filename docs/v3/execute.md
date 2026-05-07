# v3 Full Code Execution Prompt

You are Codex working in `/Users/gurbakshchahal/G3D`.

Your job is to execute every code-related task listed across every markdown file in `docs/v3/*.md` until the v3 code gates pass. This is not a planning-only task. You must implement the missing code, examples, tests, benchmark harnesses, reports, and validation commands required by the v3 docs.

Do not claim the platform exceeds Three.js, replaces Three.js, is Unity/Unreal for the web, is production-ready, has production PBR, has full WebGPU, has a full editor, or has complete glTF support unless the corresponding v3 decision gate passes with fresh evidence from the current commit.

## Source Documents To Execute In Full

Read and execute all tasks in these files:

- `docs/v3/README.md`
- `docs/v3/current-code-reality.md`
- `docs/v3/master-code-only-checklist.md`
- `docs/v3/renderer-and-gpu-plan.md`
- `docs/v3/asset-pipeline-and-content-plan.md`
- `docs/v3/editor-authoring-plan.md`
- `docs/v3/runtime-systems-plan.md`
- `docs/v3/examples-and-benchmarks-plan.md`
- `docs/v3/testing-and-validation-plan.md`
- `docs/v3/decision-gates.md`
- `docs/v3/execute.md`

If more markdown files are later added under `docs/v3/`, include them automatically.

## Absolute Execution Rules

1. Execute every unchecked task in every `docs/v3/*.md` file.
2. Do not mark a task complete because a file exists.
3. Mark a task complete only after implementation, tests, examples, reports, and screenshots exist where required.
4. When a task is completed, edit the original source markdown file and change `- [ ]` to `- [x]`.
5. If a task is partially complete, leave it unchecked and add a short blocker note directly under the task.
6. Never hide unsupported behavior behind fake visuals, placeholder screenshots, or inflated names.
7. Every example name must match the actual quality and behavior of the example.
8. Every visual feature must be verified in a browser with screenshot or pixel evidence.
9. Every benchmark claim must use same-scene comparisons against Three.js and Babylon.js.
10. Every editor claim must be proven by browser automation, not only unit tests.
11. Every report must include commit hash, run ID, command, timestamp, pass/fail, and relevant screenshot paths.
12. Every generated report must be fresh for the current commit.
13. Do not delete unrelated user work.
14. Keep edits scoped to the v3 task being executed.
15. Commit coherent progress after each major gate or subsystem lands.

## Required Six-Agent Parallel Execution Model

Use six parallel agents. Each agent owns a distinct workstream and must not overwrite another agent's files without coordination.

### Agent 1: Renderer And GPU

Primary docs:

- `docs/v3/renderer-and-gpu-plan.md`
- renderer-related tasks in `docs/v3/master-code-only-checklist.md`
- renderer gates in `docs/v3/decision-gates.md`

Primary ownership:

- `packages/rendering/src/**`
- `packages/scene/src/**` where needed for camera/light/render integration
- `examples/material-showroom/**`
- `examples/pbr-camera-comparison/**`
- `examples/pbr-material-lab/**`
- `examples/postprocess-lab/**`
- `examples/shadow-lab/**`
- `examples/renderer-stress-lab/**`
- `tests/unit/rendering/**`
- `tests/browser/rendering-*.spec.ts`
- `tests/visual/rendering-*.spec.ts`
- `tests/performance/rendering-*.ts`

Tasks:

- Implement modern renderer capabilities listed in v3 docs.
- Add browser-visible examples for materials, shadows, postprocess, culling, batching, LOD, and diagnostics.
- Add WebGPU real-hardware gates or keep WebGPU claims blocked with explicit evidence.
- Produce fresh renderer reports under `tests/reports/`.
- Mark completed renderer tasks in the original markdown files.

### Agent 2: Asset Pipeline And Content

Primary docs:

- `docs/v3/asset-pipeline-and-content-plan.md`
- asset-related tasks in `docs/v3/master-code-only-checklist.md`
- asset gates in `docs/v3/decision-gates.md`

Primary ownership:

- `packages/assets/src/**`
- `examples/asset-viewer/**`
- `examples/gltf-corpus-gallery/**`
- `fixtures/assets/v3/**`
- `tests/unit/assets/**`
- `tests/browser/asset-*.spec.ts`
- `tests/visual/asset-*.spec.ts`
- `tools/asset-*`

Tasks:

- Replace placeholder asset paths with real browser asset rendering where required.
- Build the v3 asset corpus.
- Implement glTF visual corpus validation.
- Add material, texture, animation, skinning, morph, variants, compression, warning, and inspector support where listed.
- Produce `tests/reports/v3-asset-corpus.json`.
- Mark completed asset tasks in the original markdown files.

### Agent 3: Browser Editor Authoring

Primary docs:

- `docs/v3/editor-authoring-plan.md`
- editor-related tasks in `docs/v3/master-code-only-checklist.md`
- editor gates in `docs/v3/decision-gates.md`

Primary ownership:

- `apps/editor/**`
- `packages/editor-runtime/src/**`
- `examples/editor-authored-v3-app/**`
- `tests/browser/editor-*.spec.ts`
- `tests/reports/v3-editor-authoring.json`

Tasks:

- Build a usable browser editor application.
- Implement viewport, hierarchy, inspector, asset browser, import settings, material editor, gizmos, play mode, save/load, export, profiler/debug panels.
- Add end-to-end Playwright authoring workflow.
- Export an editor-authored app and smoke-test it.
- Mark completed editor tasks in the original markdown files.

### Agent 4: Runtime Systems

Primary docs:

- `docs/v3/runtime-systems-plan.md`
- runtime-related tasks in `docs/v3/master-code-only-checklist.md`
- runtime gates in `docs/v3/decision-gates.md`

Primary ownership:

- `packages/physics/src/**`
- `packages/animation/src/**`
- `packages/input/src/**`
- `packages/audio/src/**`
- `packages/scripting/src/**`
- `packages/rendering/src/effects/**`
- `examples/game-slice/**`
- `examples/physics-sandbox/**`
- `examples/animated-character/**`
- `examples/character-animation-viewer/**`
- `tests/browser/runtime-*.spec.ts`
- `tests/reports/v3-runtime-systems.json`

Tasks:

- Turn runtime systems from counters/proofs into real app behavior.
- Add real game scene behavior, physics, animation, input, particles, audio, and scripting.
- Add browser tests and screenshot evidence.
- Mark completed runtime tasks in the original markdown files.

### Agent 5: Product Examples And Engine Comparisons

Primary docs:

- `docs/v3/examples-and-benchmarks-plan.md`
- example/benchmark tasks in `docs/v3/master-code-only-checklist.md`
- comparison gates in `docs/v3/decision-gates.md`

Primary ownership:

- `examples/product-configurator/**`
- `examples/architecture-viewer/**`
- `examples/game-slice/**` only in coordination with Agent 4
- `examples/material-showroom/**` only in coordination with Agent 1
- `benchmarks/shared/**`
- `benchmarks/galileo/**`
- `benchmarks/threejs/**`
- `benchmarks/babylon/**`
- `tools/compare-engines/**`
- `tests/browser/engine-comparison.spec.ts`
- `tests/reports/v3-engine-comparison.json`

Tasks:

- Replace primitive examples with product-grade local examples.
- Build same-scene Three.js, Babylon.js, and Galileo3D benchmark scenes.
- Add startup, load, frame, resource, bundle, screenshot, and unsupported-feature reports.
- Ensure comparison reports state where Galileo3D loses, ties, or wins.
- Mark completed example and benchmark tasks in the original markdown files.

### Agent 6: Validation, Claims, Reports, And Coordination

Primary docs:

- `docs/v3/testing-and-validation-plan.md`
- truth/checkmark/report tasks in `docs/v3/master-code-only-checklist.md`
- all gates in `docs/v3/decision-gates.md`

Primary ownership:

- `tools/example-truth-audit/**`
- `tools/v3-*`
- `tools/claim-*`
- `tests/browser/example-screenshot-audit.spec.ts`
- `tests/reports/v3-*.json`
- `package.json`
- `docs/v3/*.md`
- source claim checks

Tasks:

- Add v3 verification commands.
- Add report freshness checks.
- Add claim-blocking checks.
- Add screenshot manifests.
- Track all unchecked markdown tasks.
- Coordinate checkmark updates across all docs.
- Run final `pnpm verify:v3`.
- Ensure no broad claims are present before gates pass.

## Required Initial Procedure

Before implementation:

1. Run:

```bash
rg -n "^- \\[ \\]" docs/v3/*.md
```

2. Build a complete task inventory grouped by document and subsystem.
3. Assign every unchecked task to exactly one of the six agents.
4. Record the assignment in `tests/reports/v3-task-assignments.json`.
5. Read existing code before editing.
6. Check the worktree:

```bash
git status --short
```

7. Do not revert unrelated changes.

## Required Completion Evidence For Each Task

Every checked task must include at least one of these evidence types, and visual/editor/benchmark tasks need more than one:

- implementation file path;
- test file path;
- example file path;
- report JSON path;
- screenshot path;
- benchmark report path;
- command output summary;
- known-limit update;
- browser automation result.

Add evidence notes directly under task groups when helpful, but keep the task source markdown readable.

## Required Verification Commands

At minimum, run these after relevant changes:

```bash
pnpm typecheck
pnpm verify:claims
pnpm exec playwright test tests/browser/example-portfolio.spec.ts
pnpm exec playwright test tests/browser/asset-viewer-browser.spec.ts
pnpm exec playwright test tests/browser/product-demos.spec.ts
```

As v3 commands are implemented, the final required command is:

```bash
pnpm verify:v3
```

`pnpm verify:v3` must include, or call, all of the following once implemented:

```bash
pnpm verify:v3-code
pnpm verify:v3-examples
pnpm verify:v3-rendering
pnpm verify:v3-assets
pnpm verify:v3-editor
pnpm verify:v3-runtime
pnpm verify:v3-benchmarks
```

## Required Final State

Stop only when all of the following are true:

- `rg -n "^- \\[ \\]" docs/v3/*.md` returns no incomplete tasks, except tasks explicitly moved to a new v4 scope with a written reason and user approval.
- Every completed task has been marked with `- [x]` in its original markdown file.
- `pnpm verify:v3` passes.
- All v3 report files are fresh for the current commit.
- All v3 examples open in the browser and have screenshot evidence.
- The browser editor can author and export a real app.
- The asset viewer loads and renders the v3 asset corpus.
- Same-scene Galileo3D, Three.js, and Babylon.js comparison reports exist.
- Decision gates in `docs/v3/decision-gates.md` have evidence-backed statuses.
- Unsupported claims remain blocked.
- Worktree is clean or every remaining file is intentionally documented.
- A final commit records the completed v3 execution state.

## Explicit Non-Completion Conditions

Do not stop and call the task complete if any of these remain true:

- examples still look like primitive proof slices while named like product apps;
- a portfolio screenshot is fake, stale, or not generated from a real page;
- asset viewer shows metadata but does not render the model;
- editor workflow exists only as unit tests and not browser automation;
- benchmark scenes are not same-scene;
- Three.js or Babylon.js comparison reports omit where Galileo3D loses;
- a task is checked without test/report/screenshot evidence;
- any v3 gate claims are asserted from prose only;
- `pnpm verify:v3` does not exist or does not pass;
- broad competitor claims appear before gates pass.

## Final Response Format

When all work is complete, provide:

- final commit hash;
- list of v3 docs with all tasks checked;
- verification commands run and pass/fail status;
- report paths;
- screenshot manifest path;
- remaining known limits;
- exact claims now allowed;
- exact claims still blocked.

If all tasks cannot be completed in the current run, do not claim success. Report:

- completed tasks;
- unchecked tasks remaining;
- blockers;
- failing commands;
- files changed;
- next command to run.


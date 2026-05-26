# V2 Execute Prompt

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Mission

You are executing Aura3D v2 to completion. Your job is to implement every task described across the v2 documentation set, verify every task with real tests/reports/examples, and update the original markdown checklists in place as work is completed. Every completed task must be crossed off with a real markdown check mark in the original owning `.md` file.

Do not treat this as a planning exercise. Treat it as an implementation, validation, documentation, and release-readiness execution run.

The target is not to create a fake "complete" audit. The target is to make the repository genuinely satisfy the v2 gates for:

- Internal release candidate readiness.
- Developer preview readiness.
- A narrow, evidence-backed "better than Three.js" claim where Aura3D is actually measurably stronger.
- A browser-first Unity/Unreal-competitive workflow claim where Aura3D actually has editor authoring, import, play mode, export, and product proof.
- Production credibility only after the required external evidence, docs, support, release, benchmark, and known-limits work exists.

You must continue iterating until the gates in `docs/project/v2-decision-gates.md` pass or until a hard technical blocker is documented with exact failing files, commands, reports, and next actions.

## Mandatory Source Documents

Read these files first, in this order:

1. `docs/project/v2-readme.md`
2. `docs/project/v2-current-feature-readiness.md`
3. `docs/project/v2-external-claim-requirements.md`
4. `docs/project/v2-subsystem-gap-roadmap.md`
5. `docs/project/v2-validation-and-benchmark-plan.md`
6. `docs/project/v2-documentation-examples-ecosystem-plan.md`
7. `docs/project/v2-filename-level-execution-checklist.md`
8. `docs/project/v2-decision-gates.md`
9. `docs/project/v2-claim-registry.md`
10. `docs/project/v2-execute-prompt.md`

Then run `rg --files docs/project -g 'v2-*.md'` and read any additional v2 markdown files that are not in the list above. The execution scope is all `docs/project/v2-*.md` source documents, not only this prompt.

Then inspect the relevant code, tests, examples, reports, package exports, and build scripts before editing.

Do not skip any v2 markdown file. Do not rely on memory. Do not rely on generated audit language unless it points to concrete source files, tests, examples, and current report IDs.

## Non-Negotiable Completion Rule

A task is complete only when all of these are true:

1. The source implementation exists.
2. The behavior works through public APIs or the intended app workflow.
3. Unit, integration, browser, visual, performance, or benchmark tests exist as appropriate for the risk.
4. The relevant example, app, benchmark, docs, or report exists.
5. The relevant command passes from the repository root.
6. The relevant report JSON is current, not stale.
7. The known-limits docs are updated for unsupported behavior.
8. The claim registry allows any public wording that the work enables.
9. The original v2 markdown task is updated in place from `- [ ]` to `- [x]`.

Never mark a checkbox complete from prose, intent, partial code, or an old green report.

## Checkbox Update Rule

When a task is completed, update the original source markdown file that owns the checkbox. "Original source markdown file" means the `.md` file where the task was originally defined, such as `docs/project/v2-filename-level-execution-checklist.md`, `docs/project/v2-decision-gates.md`, or another v2 source document. Do not mark only a copied checklist in a report, prompt, summary, or generated audit.

Required behavior:

- Change `- [ ]` to `- [x]` only after implementation and verification pass.
- Cross off the checkbox immediately after the evidence passes for that task; do not batch-check tasks at the end of a large run.
- Every checked task must be checked in its original `.md` source row, not only listed as complete in a terminal summary, report file, agent message, or final response.
- Every agent must keep a task ledger during its run with: source `.md` path, line number or stable heading, original task text, implementation files, verification commands, report artifacts, and final checkbox state.
- A checkbox is not complete unless the ledger entry points to the exact source markdown row that was changed from `- [ ]` to `- [x]`.
- If verification completes for a task, update the owning `.md` checkbox in the same iteration before moving to the next task.
- If verification fails, do not check the task. Leave `- [ ]` in place and append or update a `Blocked:` note on that same source row or immediately below it.
- Keep the task text intact unless the requirement itself was incorrect and the correction is documented.
- If a task is split into subtasks, add nested or adjacent checklist items in the same source file and check each item independently.
- If a task is blocked, leave it unchecked and add a short `Blocked:` note with exact command output, failing file/report, and next action.
- If a task becomes unsupported by product decision, leave it unchecked unless the original task explicitly allowed documenting unsupported state. In that case, check it only after known-limits docs and claim-registry exclusions are updated.
- If a completed task appears in multiple docs, update every matching checkbox that is truly satisfied.
- If an agent completes a task but cannot prove it from current source, tests, examples, reports, and commands, the task stays unchecked.
- At the end of each iteration, run a checklist scan and report remaining unchecked items by file and section.

Required per-task closeout sequence:

1. Identify the owning source checkbox with `rg -n "^- \\[ \\]" docs/project/v2-*`.
2. Implement the code, tests, docs, examples, and reports for that exact row.
3. Run the focused verification command and capture the current report path or command output.
4. Update the owning source row from `- [ ]` to `- [x]` only after the evidence passes.
5. Run `rg -n "^- \\[ \\]" docs/project/v2-*` again and confirm that exact row no longer appears.
6. Add the checked row, evidence, command, and report artifact to the agent ledger.
7. Move to the next task only after the ledger and source checkbox agree.

Use this command to inspect remaining unchecked v2 tasks:

```sh
rg -n "^- \\[ \\]" docs/project/v2-*
```

Use this command to inspect checked v2 tasks:

```sh
rg -n "^- \\[x\\]" docs/project/v2-*
```

## Required Parallel Execution Model

Use exactly six parallel agents or workstreams. Each workstream must work independently but coordinate through the v2 docs, tests, reports, and checkboxes.

Rules for all agents:

- Do not duplicate work.
- Do not revert another agent's changes.
- Do not mark checkboxes you did not verify.
- Do not make public claims beyond `docs/project/v2-claim-registry.md`.
- Do not close a gate because another agent says it is done; close it only from current source, tests, examples, reports, and docs.
- Write code in the repo's existing style.
- Keep edits scoped to the assigned files unless a dependency requires a coordinated change.
- After every implementation slice, update tests and run the smallest relevant verification command first.
- Before a gate is marked done, run the full required gate commands.

## Six Workstreams

### Agent 1: Truth, Release, Trace, Claims, And Governance

Owns:

- `docs/project/v2-readme.md`
- `docs/project/v2-claim-registry.md`
- `docs/project/v2-decision-gates.md`
- `docs/project/v2-filename-level-execution-checklist.md` section 0 and master gates
- `tools/release-verification/index.ts`
- `tools/requirements-trace/index.ts`
- `tools/verify-trace/index.ts`
- `tools/claim-registry/index.ts`
- `tools/final-demo-validation/index.ts`
- `tests/unit/tools/**`
- `tests/reports/**`
- `.github/workflows/**`
- `.github/ISSUE_TEMPLATE/**`
- `docs/project/security-policy.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `docs/project/support-policy.md`
- release, support, security, compatibility, and claim-guideline docs

Primary objectives:

- Make report freshness real through release-run IDs.
- Make stale report reuse fail.
- Make contradiction scanning real.
- Make trace evidence strict enough to reject generated audit artifacts as sole proof.
- Implement claim-registry enforcement over README, docs, package descriptions, release notes, and example READMEs.
- Add clean-checkout verification metadata: git SHA, dirty state, package manager, OS, browser versions, GPU info where available.
- Implement `pnpm verify:release:repeat`.
- Ensure `pnpm verify:release` consumes only current reports.
- Ensure public claims are blocked unless registered and supported.

Completion evidence:

- `pnpm typecheck`
- unit tests for verification tools
- `pnpm verify:trace`
- `pnpm verify:demos`
- `pnpm verify:release`
- `pnpm verify:release:repeat`
- current `tests/reports/final-release-verification.json`
- current `tests/reports/final-requirements-trace.json`
- current `tests/reports/claim-registry.json`
- checked tasks in the owning docs

### Agent 2: Renderer, Scene Camera, WebGL2, PBR, Shadows, Postprocess, And WebGPU

Owns:

- `packages/rendering/src/**`
- `packages/scene/src/Camera.ts`
- `packages/scene/src/PerspectiveCamera.ts`
- `packages/scene/src/OrthographicCamera.ts`
- `packages/scene/src/TransformNode.ts`
- `packages/scene/src/Renderable.ts`
- `tests/browser/rendering-*.spec.ts`
- `tests/browser/webgpu-*.spec.ts`
- `tests/visual/rendering-*.spec.ts`
- `tests/visual/pbr-*.spec.ts`
- `tests/visual/shadow-*.spec.ts`
- `tests/performance/webgpu-vs-webgl2-baseline.ts`
- `examples/rendering-large-scene/**`
- `examples/material-lab/**`
- `examples/pbr-material-lab/**`
- `examples/shadow-lab/**`
- renderer sections in `docs/project/v2-filename-level-execution-checklist.md`

Primary objectives:

- Make `Renderer.render(source, camera)` use real camera view/projection data.
- Add per-node model matrices, normal matrices, and model-view-projection matrices for scene renderables.
- Prove scene renderables, glTF render resources, instancing, skinning, morphing, lights, picking, culling, and resize through the same real renderer path.
- Build large-scene WebGL2 harnesses.
- Add render-state leak tests.
- Add high-DPI and resize tests.
- Add PBR material matrix coverage.
- Add environment lighting / IBL path or explicitly document unsupported parts.
- Add texture memory accounting, disposal diagnostics, compression/transcoding integration, and fallback diagnostics.
- Harden context/device lifecycle: loss, restore, resize, DPR, disposal, hot reload/recreate, long-running loops.
- Add shadows, postprocess, and moving-camera stress scenes.
- Add real WebGPU hardware path tests and fallback matrix where available.

Completion evidence:

- `pnpm typecheck`
- renderer unit tests
- browser rendering tests
- visual rendering tests
- WebGPU browser/hardware reports where available
- performance reports for large scene and material matrix
- screenshots or visual artifacts for PBR, shadows, postprocess, resize, and camera scenes
- checked tasks in the owning docs

### Agent 3: Assets, glTF Corpus, Materials Pipeline, Texture Pipeline, And Product Asset Proof

Owns:

- `packages/assets/src/**`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/Texture*.ts`
- `packages/rendering/src/Sampler.ts`
- `tests/assets/**`
- `tests/browser/asset-*.spec.ts`
- `tests/visual/asset-*.spec.ts`
- `tests/reports/gltf-corpus.json`
- `tests/reports/asset-load-performance.json`
- `tests/reports/asset-compatibility-threejs.json`
- `examples/asset-viewer/**`
- `examples/gltf-corpus-gallery/**`
- asset sections in `docs/project/v2-filename-level-execution-checklist.md`

Primary objectives:

- Create reproducible external asset corpus manifest.
- Validate Khronos glTF sample models.
- Validate Blender-exported assets.
- Wire real Draco, Meshopt, KTX2/Basis workflows or explicitly document unsupported state.
- Add import settings for color space, mipmaps, compression, scale, normals/tangents, animation import, and material variants.
- Add asset diagnostics that are actionable for users.
- Add load cancellation, retry, dependency cleanup, memory pressure tests, and cache/release behavior.
- Build a polished asset viewer that loads real external models through public APIs.
- Build a glTF corpus gallery.
- Compare asset compatibility against Three.js and Babylon.js where relevant.

Completion evidence:

- `pnpm typecheck`
- asset unit tests
- browser asset tests
- visual asset/corpus tests
- current corpus and compatibility reports
- asset viewer demo validation
- known-limits docs for expected failures
- checked tasks in the owning docs

### Agent 4: Runtime Systems: Physics, Animation, Particles, Input, Audio, Scripting, ECS, And Debug

Owns:

- `packages/physics/src/**`
- `packages/animation/src/**`
- `packages/particles/src/**`
- `packages/input/src/**`
- `packages/audio/src/**`
- `packages/scripting/src/**`
- `packages/ecs/src/**`
- `packages/debug/src/**`
- related tests under `tests/unit`, `tests/browser`, `tests/visual`, and `tests/performance`
- `examples/physics-sandbox/**`
- `examples/animated-character/**`
- `examples/animation-state-machine/**`
- `examples/particle-effects/**`
- `examples/game-slice/**`
- runtime sections in `docs/project/v2-filename-level-execution-checklist.md`

Primary objectives:

- Stabilize or optimize physics performance with real headroom.
- Add broadphase profiling and stress tests.
- Add CCD or document unsupported state if not claimed.
- Add robust constraints, sensors, filters, raycasts, shape casts, debug visualization, and comparison baselines.
- Add real glTF animated character corpus.
- Add animation controls: play, pause, scrub, speed, loop, crossfade.
- Add animation crowd/stress baselines.
- Add state machine and graph visualization or debug output.
- Add particle CPU/GPU parity where claimed.
- Add complete input, controls, audio, scripting, ECS, and debug examples where v2 requires them.
- Build a real game slice with physics, animation, particles, audio, input, scene/ECS, and renderer under frame budget.

Completion evidence:

- `pnpm typecheck`
- runtime unit tests
- browser runtime tests
- visual runtime tests
- performance reports
- product-style demos
- known-limits docs
- checked tasks in the owning docs

### Agent 5: Editor Application, Authoring Workflow, Project Serialization, Export, Templates, And Plugins

Owns:

- `packages/editor-runtime/src/**`
- `packages/editor/src/**`
- `apps/editor/**`
- `docs/editor/**`
- `docs/workflows/**`
- `templates/**`
- editor tests under `tests/browser`, `tests/visual`, and `tests/integration`
- editor and Unity/Unreal workflow sections in `docs/project/v2-filename-level-execution-checklist.md`

Primary objectives:

- Build the real browser editor app, not just editor-runtime tests.
- Add hierarchy panel: select, rename, create, delete, reparent.
- Add inspector panel: transform, material, light, camera, physics, script fields.
- Add renderer-backed viewport with picking and transform gizmos.
- Add asset browser with glTF import and preview.
- Add import settings UI.
- Add project save/load using versioned project JSON.
- Add play/edit mode with snapshot and restore.
- Add profiler/debug panel.
- Add material editor, light editor, camera editor, physics editor, script editor.
- Add prefab/composition format or document future-work status.
- Add plugin API for panels, tools, importers, and scripting nodes.
- Add static export workflow.
- Add exported-project runtime package that runs without the editor loaded.
- Check in or reproducibly generate at least one editor-authored product example.
- Add browser smoke tests for exported apps.

Completion evidence:

- `pnpm typecheck`
- editor unit tests
- editor browser tests
- editor visual tests
- project save/load integration tests
- editor-authored project replay test
- exported app browser smoke test
- workflow docs with screenshots
- checked tasks in the owning docs

### Agent 6: Product Demos, Competitive Benchmarks, Public Docs, API Reference, Ecosystem, And Final Gate Integration

Owns:

- `examples/**`
- `benchmarks/threejs/**`
- `benchmarks/babylon/**`
- `benchmarks/aura3d/**`
- `benchmarks/fixtures/**`
- `tools/compare-engines/index.ts`
- `docs/project/getting-started.md`
- `docs/concepts/**`
- `docs/project/tutorials-*.md`
- `docs/api/**`
- `docs/project/known-limits.md`
- `docs/project/claim-guidelines.md`
- `docs/comparisons/**`
- `docs/benchmarks/**`
- `examples/README.md`
- `tests/browser/examples-runtime.spec.ts`
- `tests/visual/examples-pixels.spec.ts`
- `tests/visual/screenshot-diff.spec.ts`
- product demo, benchmark, documentation, and ecosystem sections in `docs/project/v2-filename-level-execution-checklist.md`

Primary objectives:

- Separate validation examples from learning/product examples.
- Ensure product examples render through Aura3D's renderer and draw meaningful WebGL pixels.
- Build product configurator.
- Build architecture viewer.
- Build game slice.
- Build asset viewer integration with Agent 3.
- Build physics sandbox integration with Agent 4.
- Link editor app integration with Agent 5.
- Add README files for each example with systems used, run command, expected output, and known limits.
- Add browser, visual, screenshot-diff, and performance reports for every product example.
- Build equivalent Aura3D, Three.js, and Babylon.js benchmark scenes.
- Pin exact versions and benchmark environments.
- Store raw samples, summaries, screenshots, bundle artifacts, and failure logs.
- Write benchmark markdown reports.
- Write getting-started, concepts, tutorials, API docs, known limits, comparisons, troubleshooting, cookbook, release notes, and migration docs.
- Add starter templates for vanilla/Vite, React, Vue, Svelte, and static hosting.
- Add template CI smoke tests.

Completion evidence:

- `pnpm typecheck`
- `pnpm test:browser`
- `pnpm test:visual`
- `pnpm verify:demos`
- benchmark reports
- docs build or docs validation if available
- template install/build/smoke tests
- checked tasks in the owning docs

## Coordination Protocol

At the start of each iteration:

1. Run `rg -n "^- \\[ \\]" docs/project/v2-*`.
2. Assign remaining unchecked tasks to one of the six agents.
3. Confirm no two agents are editing the same primary files unless coordination is explicit.
4. Record the planned slice, target files, target tests, and owning checkboxes.

During each iteration:

1. Implement the smallest complete vertical slice.
2. Add or update tests.
3. Add or update examples, docs, reports, and known limits.
4. Run focused verification.
5. Fix failures.
6. Update source checkboxes from `[ ]` to `[x]` only after evidence passes.
7. Report changed files, commands run, reports generated, checkboxes marked, and remaining blockers.

At the end of each iteration:

1. Run `rg -n "^- \\[ \\]" docs/project/v2-*`.
2. Run `rg -n "^- \\[x\\]" docs/project/v2-*`.
3. Run the relevant gate command for the completed slice.
4. Update reports.
5. If a claim is now enabled, update `docs/project/v2-claim-registry.md` with evidence and exclusions.
6. If a claim is still not enabled, leave it blocked and keep disallowed wording out of public docs.

## Required Verification Commands

Use focused commands while iterating, then broaden verification as gates approach completion.

Baseline commands:

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify:performance
pnpm verify:demos
pnpm verify:trace
pnpm verify:release
```

Required before Gate A:

```sh
pnpm verify:release
pnpm verify:release:repeat
```

Required before Gate C:

```sh
pnpm verify:release
pnpm verify:demos
pnpm test:browser
pnpm test:visual
pnpm exec tsx tools/compare-engines/index.ts
```

Required before Gate D:

```sh
pnpm verify:release
pnpm test:browser -- editor
pnpm test:visual -- editor
```

Required before Gate E:

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify:performance
pnpm verify:demos
pnpm verify:trace
pnpm verify:release
pnpm verify:release:repeat
```

If a listed command does not exist yet, create it or document why it is intentionally replaced. Do not silently skip it.

## Evidence Reports Required

The final execution must produce current reports for all applicable gates:

- `tests/reports/final-release-verification.json`
- `tests/reports/final-requirements-trace.json`
- `tests/reports/final-performance.json`
- `tests/reports/final-demo-validation.json`
- `tests/reports/release-repeat.json`
- `tests/reports/claim-registry.json`
- `tests/reports/browser-hardware-matrix.json`
- `tests/reports/webgpu-hardware-matrix.json`
- `tests/reports/webgpu-parity.json`
- `tests/reports/webgpu-vs-webgl2.json`
- `tests/reports/gltf-corpus.json`
- `tests/reports/asset-load-performance.json`
- `tests/reports/asset-compatibility-threejs.json`
- `tests/reports/comparison-threejs.json`
- `tests/reports/comparison-babylon.json`

Reports must include run ID, git SHA, command, timestamp, environment, source inputs, pass/fail status, and links to relevant artifacts where practical.

## Public Claim Rules

Until the gates pass, only claim what `docs/project/v2-claim-registry.md` allows.

Blocked unless evidence exists:

- "production-ready"
- "better than Three.js"
- "Unity/Unreal for the web"
- "Unity replacement"
- "Unreal replacement"
- "full WebGPU support"
- "complete glTF ecosystem coverage"
- "real editor"
- "PBR parity"
- "production PBR renderer"

Any stronger claim must include:

- exact gate passed;
- exact evidence files;
- exact benchmark versions;
- exact browser/device matrix;
- exact date or release-run ID;
- known exclusions;
- where Three.js, Babylon.js, Unity, or Unreal remain stronger.

## Required Final State

Do not stop until all of these are true:

1. `rg -n "^- \\[ \\]" docs/project/v2-*` returns no unchecked tasks, or every remaining unchecked task has a documented product decision or hard blocker.
2. All checked tasks have matching implementation, tests, examples/docs/reports, and passing commands.
3. Gate A in `docs/project/v2-decision-gates.md` passes.
4. Gate B in `docs/project/v2-decision-gates.md` passes.
5. Gate C passes before any "better than Three.js" claim is made.
6. Gate D passes before any "Unity/Unreal for the web" claim is made.
7. Gate E passes before any "production-ready" claim is made.
8. `docs/project/v2-claim-registry.md` matches all public wording.
9. `docs/project/known-limits.md` is explicit and current.
10. Comparative benchmark reports exist and include raw data.
11. Product demos exist and are renderer-backed.
12. The browser editor can author, save, reload, play, export, and run an exported app.
13. API docs, tutorials, templates, release docs, support docs, and security docs exist and match the package version.
14. Full release verification passes repeatedly from a clean checkout.

## Final Response Format

When the execution is complete, report:

- Gates passed and gates not passed.
- Exact commands run.
- Exact report files generated.
- Exact examples/apps added.
- Exact docs added or updated.
- Exact checkboxes marked complete.
- Remaining unchecked tasks, if any, with blockers.
- Whether the repo can honestly claim:
  - internal release candidate;
  - developer preview;
  - better than Three.js in a defined niche;
  - Unity/Unreal-competitive for browser-first apps;
  - production-ready.

If the answer to any claim is no, say no plainly and explain the missing evidence.

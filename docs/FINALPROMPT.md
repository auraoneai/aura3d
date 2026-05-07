# FINALPROMPT: Galileo3D 100% Production Application Completion Prompt

Created for repository root:

```text
/Users/gurbakshchahal/G3D
```

This is the authoritative final execution prompt for turning the documented Galileo3D rebuild into a full production application with 100% of the required application features described across every markdown file in `docs/*.md`. It is also a truth-preservation prompt: it must prevent false completion claims, vague status updates, and trace rows being marked complete without implementation evidence.

## How To Use This File
Use this file as the single execution prompt for the next coordinator agent. The coordinator must execute from:

```text
/Users/gurbakshchahal/G3D
```

The coordinator must use six parallel implementation prompts, integrate their work, run verification, update the trace and audit files, and keep iterating until every requirement from every `docs/*.md` file is implemented and independently verified.

This prompt is not a completion claim. It is a production execution contract.

## Mission
You are operating in the repository:

```text
/Users/gurbakshchahal/G3D
```

Your mission is to convert the current partial Galileo3D rebuild into a complete production application that implements 100% of the features, architecture, validation gates, examples, packaging requirements, and completion criteria described in every markdown file in:

```text
/Users/gurbakshchahal/G3D/docs/*.md
```

This prompt is intentionally stricter than the previous six-parallel rebuild prompt. Do not treat file existence, line count, generated tests, or a passing self-verifier as proof of completion. Completion means every requirement in every relevant document is traced, implemented, tested, verified, documented with evidence, and audited against the final release gates.

## Production Application Scope Lock
The target is not a document rewrite, prototype, demo shell, partial library, generated file tree, or optimistic scaffold. The target is the actual production Galileo3D application and engine described by the docs.

The final application must include every required user-facing and developer-facing feature discussed in the docs, including the engine runtime, renderer, WebGL2/WebGPU obligations, materials and shaders, lighting and shadows, scene graph, ECS, physics, animation, asset pipeline, glTF/GLB loading, input and interaction, cameras and controls, particles and effects, audio, scripting, editor runtime, debugging/devtools, examples/demos, validation, packaging, exports, release checks, and completion audit.

Every implementation task must connect to the specific documentation page or pages that created the requirement. Do not implement broad guesses disconnected from the docs, and do not close broad docs by saying "covered elsewhere." A feature is complete only when its source page, requirement row, implementation file, test file, browser/example page where applicable, verification command, and evidence report all agree.

If any markdown file discusses a required feature and that feature is missing, simulated, stubbed, intentionally unavailable, only CPU-shadowed when real hardware is required, fake-device-only when real device behavior is required, untested, visually unproven, or absent from the public examples, the final status remains `NO-GO`.

## Current Truth To Start From
Before doing any implementation, accept the current status as:

- The repository contains a generated vertical-slice rebuild plus later verification hardening, but a passing self-report or stale audit document is not proof of completion.
- Regenerate `tests/reports/final-requirements-trace.json` before using any traced requirement counts.
- Use the regenerated trace report as the only source of truth for current traced requirement count, verified count, incomplete count, and incomplete status breakdown.
- `pnpm verify:trace` is a mandatory final gate and must pass before any completion, production-ready, or 100% claim.
- The executable gates that must pass before completion claims are typecheck, build, unit, integration, browser, architecture, boundaries, exports, shaders, visual, imports, package-size, source-cleanliness, performance, demo validation, requirements trace generation, final trace verification, and release verification.
- `pnpm verify:release` is the mandatory final release gate and must pass before any completion, production-ready, or 100% claim.
- Known former incomplete areas, including WebGPU renderer evidence, compressed glTF support, glTF lifecycle, renderer material/color-space validation, render-graph lifetime evidence, and GPU particle evidence, must have trace-linked implementation and verification evidence before they are treated as complete.

Do not overwrite this with optimistic status. Improve the implementation and the evidence until the gates actually pass.

### Current Incomplete Trace Rows To Start From
At the time this prompt was last updated, the trace report at `tests/reports/final-requirements-trace.json` said completion was true with zero incomplete rows. The previous 11-row open baseline has been closed by implementation, trace-tool hardening, and final release verification:

```text
ROADMAP-0153 = pnpm verify passes full suite.
CHECKLIST-0274 = pnpm verify passes.
FINAL-0060 = All required docs have been executed in full according to the current trace.
FINAL-0337 = `pnpm verify:release` passes with trace complete.
FINAL-0346 = Required production features have implementation and independent verification evidence.
FINAL-0462 = glTF/GLB coverage has trace-linked runtime, browser, public API, export, and boundary evidence, including compressed mesh hooks and asset disposal.
FINAL-0463 = GPU particles have WebGPU backend, browser compute/update, render-graph draw/readback, unit, and performance evidence.
FINAL-0492 = pnpm verify:boundaries, pnpm verify:exports, pnpm verify:imports, pnpm verify:size, and pnpm verify:release pass.
FINAL-0513 = Renderer/material requirements have rendering unit/browser/visual reports, WebGPU browser evidence, material diagnostics, PBR lighting, render-graph lifetime, texture color-space validation, and shader verification evidence.
FINAL-0515 = WebGPU backend implementation is verified by unit and browser WebGPU render-pass evidence.
FINAL-0584 = No incomplete trace rows remain.
```

These rows were not paperwork. They represented real implementation, verification, audit, and release work, and their closure is tied to source files, test files, report files, command output, and doc rows.

## Required Operating Mode
The coordinator must run this as a continuing implementation program, not as a one-shot summary task.

Required behavior:

- Start with the current `NO-GO` state unless fresh verification proves otherwise.
- Read and trace every `docs/*.md` page before declaring any new completion status.
- Reuse or launch exactly six parallel workstreams for implementation.
- Give each workstream disjoint file ownership and an explicit list of documentation pages to connect against.
- Require every workstream response to include changed files, requirement IDs addressed, tests added, commands run, and remaining rows.
- Integrate workstream changes in small batches.
- After each integration batch, rerun focused tests plus the relevant trace checks.
- Update `docs/requirements-trace.md`, `docs/rebuild-progress.md`, `docs/verification-evidence.md`, and `docs/completion-audit.md` after each major iteration.
- Continue iterating over incomplete trace rows and do not claim completion until `pnpm verify:release` passes.
- Never say `GO`, `done`, `complete`, `production-ready`, or `100%` unless `docs/completion-audit.md` proves every requirement is `Implemented and verified`.

### Status Honesty Protocol
Every status update must use one of these forms:

```text
NO-GO = one or more requirements are incomplete, unverified, partial, blocked, or failing.
GO CANDIDATE = all rows appear implemented and verified, and final release verification is running or pending review.
GO = every row is Implemented and verified, pnpm verify:release passes, and docs/completion-audit.md has a final go statement with command evidence.
```

Do not invent percentages. Use the trace counts. Do not claim that a production engine exists because many files exist. If a subsystem has minimal implementation, simulated behavior, CPU-shadowed behavior, injected browser behavior, fake-device behavior, or missing real-hardware parity, say so directly.

## Non-Negotiable Rules
- Read every `/docs/*.md` page before marking anything complete.
- Build a requirements trace matrix before claiming implementation progress.
- Each requirement must map to source docs, implementation files, tests, verification commands, and current status.
- Do not mark any requirement complete unless it has working implementation and independent verification.
- Do not confuse "file exists" with "feature complete."
- Do not confuse "test exists" with "feature complete."
- Do not write fake success paths, silent fallbacks, placeholder implementations, or TODO-driven completion.
- Do not leave intentionally unavailable production features if the docs require them.
- Do not delete or revert unrelated user work.
- Preserve existing useful implementation and improve it in place where possible.
- If the worktree is dirty, identify what is yours, what is pre-existing, and avoid destructive cleanup.
- No `*.bak`, `*.tmp`, `*.old`, duplicate backup source trees, or copied dead code.
- Public examples must use public package APIs. They may not deep-import internals to pass tests.
- Performance claims require measured reports.
- Visual claims require browser-rendered evidence.
- Production status requires install, build, typecheck, unit, integration, browser, visual, performance, package export, import smoke, shader, boundary, and release verification.
- If any requirement is partial, unavailable, deferred, stubbed, or unverified, the application is not complete.

## Required Documentation Set
Treat the following docs as the full specification set:

- `docs/00-Executive-Rebuild-Overview.md`
- `docs/01-Failure-Analysis.md`
- `docs/02-Architecture-Principles.md`
- `docs/03-Target-Repository-Structure.md`
- `docs/04-Core-Engine-PRD.md`
- `docs/05-Renderer-PRD.md`
- `docs/06-Scene-Graph-PRD.md`
- `docs/07-Entity-Component-System-PRD.md`
- `docs/08-Physics-Engine-PRD.md`
- `docs/09-Animation-System-PRD.md`
- `docs/10-Materials-and-Shaders-PRD.md`
- `docs/11-Asset-Pipeline-PRD.md`
- `docs/12-Input-and-Interaction-PRD.md`
- `docs/13-Camera-and-Controls-PRD.md`
- `docs/14-Lighting-and-Shadows-PRD.md`
- `docs/15-Particles-and-Effects-PRD.md`
- `docs/16-Audio-System-PRD.md`
- `docs/17-Scripting-and-Behavior-System-PRD.md`
- `docs/18-Editor-Runtime-PRD.md`
- `docs/19-Debugging-and-Devtools-PRD.md`
- `docs/20-Examples-and-Demos-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/22-Build-Packaging-and-Distribution-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`
- `docs/25-Six-Parallel-Rebuild-Execution-Prompt.md`
- `docs/completion-audit.md`
- `docs/implementation-plan-final.md`
- `docs/requirements-trace.md`
- `docs/rebuild-progress.md`
- `docs/verification-evidence.md`
- `docs/FINALPROMPT.md`

If any extra markdown files appear in `/docs`, include them in the trace matrix too.

## Page Connectivity Rule
Every implementation task must connect back to documentation pages. For each changed source or test file, record:

- Which `docs/*.md` source page created the requirement.
- Which requirement ID was changed.
- Which package/example/tool owns the implementation.
- Which tests and verification commands prove the behavior.
- Which browser page or example page proves user-visible behavior, when applicable.

Examples and demos are not optional documentation decoration. Every required example page from `docs/20-Examples-and-Demos-PRD.md` and `docs/24-File-by-File-Rebuild-Checklist.md` must be reachable through the example dev server, must use public APIs, and must be covered by browser and visual verification.

## Required Output Artifacts
Create and maintain these artifacts:

- `docs/requirements-trace.md`
- `docs/implementation-plan-final.md`
- `docs/rebuild-progress.md`
- `docs/verification-evidence.md`
- `docs/completion-audit.md`
- `tests/reports/final-requirements-trace.json`
- `tests/reports/final-release-verification.json`
- `tests/reports/final-performance.json`
- `tests/reports/final-visual.json`
- `tests/reports/final-browser.json`
- `tests/reports/final-package-size.json`

The trace and audit files must be updated after every major iteration.

## Definition Of 100% Complete
The application is 100% complete only when all of the following are true:

- Every requirement from every `/docs/*.md` file is represented in `docs/requirements-trace.md`.
- Every trace row has status `Implemented and verified`.
- Every implementation file required by `docs/24-File-by-File-Rebuild-Checklist.md` exists in the correct package.
- Every file-level checklist item has implementation, tests, and verification evidence.
- Every package has a stable public API and no forbidden private deep imports.
- Every required example runs in browser using public APIs.
- Every visual test renders nonblank, correctly framed, meaningful content.
- Every performance test records objective metrics and passes documented thresholds.
- Every verifier command passes from a clean install.
- No placeholder, stub, fake success, TODO completion, unavailable required backend, or silently degraded required feature remains.
- The worktree has no accidental backup files or duplicate dead source trees.
- `docs/completion-audit.md` proves completion doc by doc, feature by feature, and command by command.

## First Phase: Audit Before Coding
Do not start coding until this audit is complete.

1. List every markdown file under `docs/`.
2. Read every markdown file in full.
3. Extract every normative requirement into `docs/requirements-trace.md`.
4. Give every requirement a stable ID:
   - `OVR-*` for overview and architecture docs.
   - `CORE-*` for core engine requirements.
   - `RENDER-*` for renderer requirements.
   - `SCENE-*` for scene graph requirements.
   - `ECS-*` for ECS requirements.
   - `PHYS-*` for physics requirements.
   - `ANIM-*` for animation requirements.
   - `MAT-*` for materials/shaders requirements.
   - `ASSET-*` for asset pipeline requirements.
   - `INPUT-*` for input and interaction requirements.
   - `CAM-*` for camera and controls requirements.
   - `LIGHT-*` for lighting and shadows requirements.
   - `PART-*` for particles/effects requirements.
   - `AUDIO-*` for audio requirements.
   - `SCRIPT-*` for scripting requirements.
   - `EDITOR-*` for editor runtime requirements.
   - `DEBUG-*` for debugging/devtools requirements.
   - `EXAMPLE-*` for examples/demos requirements.
   - `TEST-*` for validation requirements.
   - `BUILD-*` for packaging/distribution requirements.
   - `ROADMAP-*` for roadmap sequencing requirements.
   - `CHECKLIST-*` for file-by-file checklist requirements.
5. For each requirement, record:
   - Requirement ID
   - Source document
   - Source section
   - Requirement text
   - Owning workstream
   - Current implementation file(s)
   - Required test file(s)
   - Verification command(s)
   - Current status
   - Evidence
   - Remaining work
6. Use only these statuses:
   - `Not started`
   - `Partially implemented`
   - `Implemented but unverified`
   - `Implemented and verified`
   - `Blocked`
7. Anything currently unavailable, minimal, deferred, placeholder, or stubbed must be marked `Partially implemented` or `Not started`, not complete.

## Second Phase: Current Code Audit
After the docs trace exists, audit the current codebase.

Run:

```sh
git status --short
find docs -maxdepth 1 -type f -name '*.md' -print | sort
find packages tests examples tools -type f | sort
rg -n "TODO|FIXME|placeholder|stub|not implemented|unavailable|deferred|minimal|fake success|throw new Error" packages tests examples tools docs
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify
pnpm verify:release
```

If any command fails, record the failure in `docs/rebuild-progress.md` and fix it before moving forward.

For each current limitation, create trace rows and implementation tasks. Known starting limitation signals must include the current evidence and the remaining gap. Do not copy stale "unavailable" claims forward if the code now has partial implementation evidence.

- WebGPU is implemented for the current traced target with injected-adapter render-device tests, browser-side WebGPU contract tests, WebGPU canvas-surface configuration, deterministic offscreen triangle/line/point/vertex-color/instanced readback, native render-pass submission, generated WGSL modules, fragment uniform buffers/bind groups, vertex-format-derived layouts, indexed draw evidence, and explicit malformed/missing-runtime diagnostics.
- Binary GLB/glTF asset recovery is implemented for the current traced target with binary GLB mesh-buffer evidence, URI buffer byteLength validation, embedded buffer data URI media/base64 validation, embedded and URI image MIME/data-URI validation, texture source/sampler descriptor validation, material texture-info index validation, sampler enum validation, signed accessor component decoding, accessor/bufferView/sparse descriptor validation, mesh primitive descriptor validation, scene node graph validation, skin descriptor validation, animation interpolation/target-path validation, morph target POSITION/NORMAL/TANGENT import and validation, primitive default-material handling and explicit material-reference validation, multi-primitive mesh scene import, POINTS import/render-resource/browser evidence, tangent/color import, secondary texcoord selection and mixed-texcoord rejection, shader-side vertex-color modulation, alpha/double-sided render-state binding, material variants, retry/cancellation/error recovery, streamed external-buffer progress, import-pipeline optimization, mip-chain hooks, material descriptor binding, cameras, punctual lights, instancing, compressed mesh hooks, advanced PBR extensions, CPU tangent morph deformation, asset disposal, and browser editor workflow evidence.
- GPU particles are implemented for the current traced target with an explicit WebGPU backend contract, optional GPU spawn initialization, `ParticleSystem.updateOnGPU`, browser-side compute update evidence, supported-backend selection tests, and browser-side async render-graph draw/canvas readback evidence.
- Renderer requirements for the current traced target are implemented with WebGL2, render graph, PBR, texture readiness and color-space validation, vertex-color shader modulation, material render-state application, shader include/variant preprocessing with source-map diagnostics, morph, instancing, resize, tone mapping, bloom, FXAA, shadow, cascaded-shadow, debug, WebGPU line/point/triangle readback contracts, browser, and visual evidence.
- Physics requirements for the current traced target are implemented with deterministic stepping, collisions, raycasts, constraints, sensors, scene/ECS bridge, debug extraction, energy checks, stable-stack evidence, browser evidence, and trace-linked verification.
- Animation requirements for the current traced target are implemented with clips, tracks, mixer, events, layers, blend trees, state machines, skeleton palette, scene/ECS binding, missing-target diagnostics, browser evidence, and trace-linked verification.
- Editor runtime requirements for the current traced target are implemented with selection, history, inspector, hierarchy, picking, gizmo, browser inspector/hierarchy workflow evidence, and public APIs.
- Visual validation for the current traced target includes 19 browser pixel checks plus example, rendering, shadow, particle, and browser-ready validation reports.
- Performance validation exists as a release gate with measured reports and enforceable budgets represented in the current trace.

## Six Parallel Production Workstreams
Launch six parallel workstreams only after the trace and current-code audit exist. Each workstream must read all docs, but each owns a specific slice. Workstreams are not alone in the codebase. They must preserve unrelated edits and coordinate shared contracts.

### Exact Parallel Dispatch Instructions
Dispatch exactly these six prompts in parallel. If the execution environment already has six reusable agents, reuse them; otherwise launch six new agents. Do not assign the same file ownership to multiple agents. Do not let any agent mark completion without evidence.

Each workstream must finish each iteration with this exact report structure:

```text
Workstream:
Iteration:
Docs read:
Requirement IDs addressed:
Files changed:
Tests added or changed:
Examples or browser pages touched:
Verification commands run:
Passing evidence:
Failing evidence:
Trace rows safe to update:
Trace rows still incomplete:
Risks or coordination needed:
```

The coordinator must reject any workstream report that does not include concrete files and commands. The coordinator must also inspect the changed files and run verification before updating trace rows.

Prompt for Workstream 1:

```text
You are Workstream 1 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own foundation, architecture, build, quality gates, trace tooling, packages/core, packages/math, and shared test infrastructure. Read the relevant docs in docs/*.md, especially docs/00, 01, 02, 03, 04, 21, 22, 23, 24, 25, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

Prompt for Workstream 2:

```text
You are Workstream 2 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own packages/scene, packages/ecs, camera data models, scene/ECS serialization, controls contracts that belong outside renderer/input internals, and scene/ECS integration tests. Read the relevant docs in docs/*.md, especially docs/02, 03, 06, 07, 12, 13, 18, 19, 20, 21, 23, 24, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

Prompt for Workstream 3:

```text
You are Workstream 3 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own production rendering, WebGL2/WebGPU where required, render graph, render targets, materials, shaders, lighting, shadows, renderer diagnostics, shader verification, rendering browser tests, and rendering visual tests. Read the relevant docs in docs/*.md, especially docs/01, 02, 03, 05, 10, 14, 19, 20, 21, 22, 23, 24, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

Prompt for Workstream 4:

```text
You are Workstream 4 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own packages/physics, packages/animation, physics/animation scene bridges, ECS bridges, debug adapters, deterministic simulation tests, animation renderer-skinning contracts in coordination with Workstream 3, and physics/animation examples. Read the relevant docs in docs/*.md, especially docs/02, 03, 08, 09, 18, 19, 20, 21, 23, 24, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

Prompt for Workstream 5:

```text
You are Workstream 5 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own packages/assets, packages/input, packages/audio, packages/scripting, packages/editor, related public APIs, related runtime examples, glTF/GLB loading where required, input/browser lifecycle, audio lifecycle, scripting graphs, and editor runtime behavior. Read the relevant docs in docs/*.md, especially docs/02, 03, 11, 12, 13, 16, 17, 18, 19, 20, 21, 23, 24, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

Prompt for Workstream 6:

```text
You are Workstream 6 for Galileo3D final production completion. You are not alone in the codebase; five other workstreams may be editing disjoint files. Do not revert or overwrite unrelated changes. Own particles, effects, examples, browser tests, visual tests, performance tests, final demo validation, example dev server connectivity, meaningful canvas pixel checks, and final browser/visual/performance reports. Read the relevant docs in docs/*.md, especially docs/02, 03, 15, 19, 20, 21, 22, 23, 24, requirements-trace, rebuild-progress, verification-evidence, completion-audit, and FINALPROMPT. Implement only requirements assigned to your ownership. For every change, report requirement IDs, files changed, tests added, commands run, evidence, and remaining gaps. Do not mark any row complete unless implementation and verification both exist.
```

### Workstream 1: Foundation, Architecture, Build, Quality, Trace
Owns:

- `docs/requirements-trace.md`
- `docs/implementation-plan-final.md`
- `docs/rebuild-progress.md`
- `docs/verification-evidence.md`
- `docs/completion-audit.md`
- Root build configuration.
- Package boundary tooling.
- Export/import verification.
- Release verification.
- Package size and performance budget enforcement.
- `packages/core/**`
- `packages/math/**`
- Shared test infrastructure.

Required docs:

- `00`, `01`, `02`, `03`, `04`, `21`, `22`, `23`, `24`, `25`, `rebuild-progress`, `FINALPROMPT`

Production requirements:

- Harden math and core APIs for edge cases and deterministic behavior.
- Ensure all public APIs are documented and exported consistently.
- Enforce package boundaries mechanically.
- Add trace checking that fails release verification if any requirement is not `Implemented and verified`.
- Add a command that generates `tests/reports/final-requirements-trace.json`.
- Ensure `pnpm verify:release` includes all final gates.
- Create a clean release evidence report that cannot pass with partial trace rows.

Completion evidence:

- Core and math tests cover edge cases, invalid inputs, deterministic behavior, lifecycle, disposal, scheduler ordering, event bus mutation, logging sink failures, diagnostics, task queues, manual and RAF engine loops.
- `pnpm verify:boundaries`, `pnpm verify:exports`, `pnpm verify:imports`, `pnpm verify:size`, and `pnpm verify:release` are mandatory final gates before completion can be claimed.
- Trace verifier fails if any requirement is incomplete.

### Workstream 2: Scene, ECS, Cameras, Controls Contracts
Owns:

- `packages/scene/**`
- `packages/ecs/**`
- Camera data models.
- Scene/ECS serialization.
- Scene/ECS bridges that do not belong to physics, animation, assets, or editor.
- Scene and ECS integration tests.

Required docs:

- `02`, `03`, `06`, `07`, `12`, `13`, `18`, `19`, `20`, `21`, `23`, `24`

Production requirements:

- Scene graph must support stable transforms, reparenting, traversal, queries, serialization, world bounds, cameras, lights, renderables, and mutation rules.
- ECS must support generational entity IDs, component registration, sparse storage, archetypes or equivalent efficient querying, command buffers, deterministic scheduling, serialization, profiling, and system lifecycle.
- Camera systems must support perspective and orthographic projections, frustums, resizing, controls contracts, and integration with examples.
- Controls contracts must integrate cleanly with input without creating renderer or DOM coupling inside scene/ECS.

Completion evidence:

- Scene hierarchy tests include cycles, removal during traversal, dirty propagation, serialization roundtrips, bounds with negative scale, camera validation, and renderable contracts.
- ECS tests include stale IDs, query invalidation, mutation during iteration, scheduler cycles, serialization/remapping, profiler snapshots, and component edge cases.
- Browser examples prove scene, ECS, cameras, and controls operate through public APIs.

### Workstream 3: Production Rendering, Materials, Shaders, Lighting, Shadows
Owns:

- `packages/rendering/**`, except particle systems owned by Workstream 6.
- Rendering-related `packages/debug/**`.
- Shader validation.
- Renderer browser and visual tests.

Required docs:

- `01`, `02`, `03`, `05`, `10`, `14`, `19`, `20`, `21`, `22`, `23`, `24`

Production requirements:

- Replace intentionally unavailable required renderer features with working implementation or make the docs explicitly not require them.
- WebGL2 must support real device lifecycle, buffer uploads, textures, samplers, render targets, shader compilation, context loss handling, draw calls, resize, disposal, and readback where required.
- WebGPU must be implemented if required by the docs. If docs require it, an unavailable backend is not acceptable.
- Renderer must support forward rendering, render graph execution, depth pass, shadow pass, cascaded shadows, lighting data collection, PBR materials, unlit materials, shader chunks, uniform layouts, texture bindings, diagnostics, state leak detection, and visual validation.
- Materials and shaders must have explicit schemas, diagnostics, and no silent missing-uniform success.
- Lighting/shadow implementation must handle no-light, no-caster, multiple lights, directional/point/spot lights, shadow bias, map resize, cascade split stability, and debug visualization.

Completion evidence:

- Unit tests for render graph hazards, shader preprocessing, material binding, uniform layouts, texture binding, shadow edge cases, render state leaks, and resource disposal.
- Browser tests that create real WebGL2 contexts and render scenes.
- Visual tests for triangle, PBR, textured asset, directional light, point/spot light, shadows, cascades/debug, resize, and nonblank output.
- Shader verifier passes all runtime shader sources.

### Workstream 4: Physics, Animation, Simulation Bridges
Owns:

- `packages/physics/**`
- `packages/animation/**`
- Physics/animation debug adapters.
- Physics/animation scene and ECS bridges.
- Physics/animation tests and examples.

Required docs:

- `02`, `03`, `08`, `09`, `18`, `19`, `20`, `21`, `23`, `24`

Production requirements:

- Physics must support shapes, rigid bodies, colliders, world stepping, deterministic fixed step, collision events, sensors, filters, raycasts, constraints, scene sync, ECS sync, debug draw, resource cleanup, and edge-case behavior.
- If docs require a deeper production physics set, implement it and update tests accordingly.
- Animation must support keyframes, tracks, clips, actions, mixer, crossfades, layers, blend trees, state machines, events, skeletons, skinning data contracts, scene binding, ECS binding, serialization, and debug inspection.
- Animation must integrate with renderer skinning contracts where required.
- Physics and animation examples must use public APIs and visually prove behavior in browser.

Completion evidence:

- Determinism tests run repeated simulations and compare outputs.
- Physics tests include contacts, begin/stay/end, removal during contact, sensors, filters, raycasts, constraints, bridge ordering, and debug draw.
- Animation tests include interpolation, loops, events, crossfades, layers, skeleton palettes, state transitions, missing targets, component removal, and debug snapshots.
- Browser and visual tests prove physics stack and animated character examples.

### Workstream 5: Assets, Input, Audio, Scripting, Editor Runtime
Owns:

- `packages/assets/**`
- `packages/input/**`
- `packages/audio/**`
- `packages/scripting/**`
- `packages/editor/**`
- Related runtime examples and tests.

Required docs:

- `02`, `03`, `11`, `12`, `13`, `16`, `17`, `18`, `19`, `20`, `21`, `23`, `24`

Production requirements:

- Asset pipeline must support asset IDs, asset registry, dependency graph, cache, loaders, import pipeline, worker jobs, scene loading, serialization, glTF, binary GLB, textures, materials, animations, skins where required, error recovery, and resource disposal.
- Current minimal glTF support is not enough. Implement the full scope required by docs.
- Input must support keyboard, pointer, gamepad, action maps, interaction targets, picking, orbit controls, first-person controls, editor shortcuts, and browser event lifecycle cleanup.
- Audio must support context ownership, listener, sources, spatial audio, mixer, buses, scene bridge, mute/pause/resume/dispose, and testable fallback behavior without fake success.
- Scripting must support graph/node/port data, execution, typed values, events, behavior attachment, serialization, and deterministic tests.
- Editor runtime must support selection, command history, undo/redo, transform gizmos, picking, inspector data, scene hierarchy data, runtime/editor separation, and public APIs.

Completion evidence:

- Asset tests include JSON glTF, binary GLB, textures, materials, dependency release, cache behavior, failed loads, worker jobs, scene loading, and disposal.
- Input/browser tests include keyboard, pointer, gamepad mocks, action mapping, picking, controls, shortcuts, and cleanup.
- Audio tests include graph lifecycle, spatial calculations, scene bridge, context unavailable behavior, and disposal.
- Scripting tests include graph validation, execution order, event dispatch, serialization, and behavior binding.
- Editor tests include selection, command history, undo/redo, gizmo transforms, hierarchy data, inspector data, and integration with scene/ECS.

### Workstream 6: Particles, Effects, Examples, Browser, Visual, Performance
Owns:

- `packages/rendering/src/effects/**`
- Particle and effects APIs.
- All `examples/**`.
- Browser tests.
- Visual tests.
- Performance tests.
- Final demo validation.

Required docs:

- `02`, `03`, `15`, `19`, `20`, `21`, `22`, `23`, `24`

Production requirements:

- Particle systems must support emitters, shapes, modules, CPU update, GPU update if required by docs, bounds, sorting, batching, materials, scene integration, disposal, and diagnostics.
- Current GPU particle backend unavailable status is not acceptable if docs require GPU particles.
- Effects must integrate with renderer and examples through public APIs.
- Every required example from `docs/20` and `docs/24` must exist, run in browser, render meaningful output, expose expected interaction, and use public APIs only.
- Visual tests must check meaningful pixels and framing, not just nonblank canvas.
- Performance tests must define budgets, measure repeatably, and fail when budgets are exceeded.

Completion evidence:

- Unit tests for particle emitters, lifetime, modules, sorting, bounds, CPU/GPU parity if applicable, disposal, and diagnostics.
- Browser tests for every example.
- Visual tests for every example.
- Performance reports for ECS, renderer, physics, animation, assets, particles, and full example scenes.
- `tests/reports/final-browser.json`, `final-visual.json`, and `final-performance.json` generated and referenced in completion audit.

## Integration Loop
The coordinator must run this loop while trace rows remain incomplete:

1. Pick all trace rows not `Implemented and verified`.
2. Assign each row to one of the six workstreams.
3. Workstream implements the missing behavior.
4. Workstream adds or strengthens tests.
5. Workstream runs focused verification.
6. Coordinator integrates changes.
7. Coordinator runs full verification.
8. Coordinator updates `docs/requirements-trace.md`, `docs/rebuild-progress.md`, and `docs/verification-evidence.md`.
9. If failures exist, create a fix iteration.
10. Continue while incomplete trace rows remain; do not claim completion until the incomplete count is zero.

Do not stop after one pass. Keep iterating.

### Iteration Priority Order
Use this order so the work converges instead of spreading effort thinly:

```text
Priority 1 = requirements that make release verification fail directly.
Priority 2 = requirements marked Not started.
Priority 3 = requirements marked Partially implemented because production behavior is missing.
Priority 4 = requirements marked Implemented but unverified.
Priority 5 = requirements whose evidence is too weak, such as fake-device-only, fixture-only, nonblank-only visual tests, or tests that do not assert behavior.
Priority 6 = documentation and audit rows that can be closed only after implementation and release verification pass.
```

The previous 11-row baseline is closed. Future regression work should reopen only rows with concrete failing evidence:

```text
Workstream 1 = keep ROADMAP-0153, CHECKLIST-0274, and FINAL-0492 closed only while pnpm verify and pnpm verify:release pass with trace complete; strengthen trace tooling if any broad status can pass without concrete evidence.
Workstream 3 = keep FINAL-0513 and FINAL-0515 closed with renderer/WebGPU implementation/evidence; reopen them if docs add requirements not covered by the current reports.
Workstream 4 = keep physics and animation rows closed with deterministic edge tests, browser-visible behavior, scene/ECS bridge evidence, and debug diagnostics.
Workstream 5 = keep FINAL-0462 and asset/editor rows closed with real runtime behavior, public APIs, streaming/error-recovery evidence, hierarchy/inspector/gizmo evidence, and browser validation.
Workstream 6 = keep FINAL-0463 closed with GPU particle evidence, meaningful per-example assertions, interaction checks, framing checks, readback evidence, and measured reports.
Coordinator = rerun pnpm verify, pnpm verify:release, regenerate trace, and reopen final process rows if any product row regresses.
```

## Required Verification Commands
At minimum, final completion requires these commands to pass:

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify:boundaries
pnpm verify:exports
pnpm verify:shaders
pnpm verify:imports
pnpm verify:size
pnpm verify:trace
pnpm verify:performance
pnpm verify:release
```

If a script does not exist, implement it. Do not remove the gate to make verification pass.

## Final Release Verification Must Check
`pnpm verify:release` must fail unless all of these pass:

- TypeScript typecheck.
- Build and declaration generation.
- Unit tests.
- Integration tests.
- Browser tests.
- Visual tests.
- Performance tests.
- Package boundary verification.
- Public export verification.
- Runtime import smoke verification.
- Shader source verification.
- Package size verification.
- Requirements trace verification.
- No placeholder or incomplete markers in production source.
- No required feature reports itself as unavailable.
- No forbidden backup/source copy files.
- All required examples run.
- All final reports are generated.

## Required Placeholder And Incomplete Marker Scan
Final completion must run and pass a strict scan over production code:

```sh
rg -n "TODO|FIXME|placeholder|stub|not implemented|unavailable|deferred|minimal|fake success|throw new Error" packages examples tools tests docs
```

This scan may find legitimate error throwing only when the trace and tests prove those errors are intended validation paths, not missing required features. Any hit related to a required production feature must be fixed or explicitly reclassified in the docs and trace.

## Required Final Audit Format
At the end, write `docs/completion-audit.md` with:

1. Executive completion status.
2. Exact git status summary.
3. Every docs page read.
4. Requirement trace totals:
   - Total requirements.
   - Implemented and verified.
   - Partially implemented.
   - Implemented but unverified.
   - Not started.
   - Blocked.
5. File checklist totals:
   - Required files.
   - Present files.
   - Verified files.
   - Missing files.
6. Package-level completion table.
7. Example-level completion table.
8. Test and verification command table.
9. Performance budget table.
10. Visual validation table.
11. Known limitations.
12. Final go/no-go statement.

The final go/no-go statement may say `GO` only if every requirement is `Implemented and verified`.

## Final Response Requirements
When responding to the user after execution, do not claim 100% completion unless the final audit proves it.

The final response must include:

- Whether final status is `GO` or `NO-GO`.
- Number of traced requirements.
- Number implemented and verified.
- Number incomplete.
- Commands run and pass/fail status.
- Links to:
  - `docs/requirements-trace.md`
  - `docs/rebuild-progress.md`
  - `docs/verification-evidence.md`
  - `docs/completion-audit.md`
  - final report JSON files

If incomplete, state exactly what remains and continue iterating unless the user tells you to stop.

## Starting Command For The Coordinator
Use this exact instruction to begin:

```text
You are the Galileo3D final production coordinator. Execute docs/FINALPROMPT.md from /Users/gurbakshchahal/G3D. First perform the full docs requirements trace across every docs/*.md file. Then audit the current codebase. Then launch six parallel workstreams with disjoint ownership. Iterate implementation and verification until every requirement is Implemented and verified. Do not mark complete based on file existence, line count, or generated tests. Final status can be GO only when docs/completion-audit.md proves every requirement from every doc is implemented, tested, verified, and production-ready.
```

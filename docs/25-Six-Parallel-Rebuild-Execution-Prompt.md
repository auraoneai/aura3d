# Six-Parallel Galileo3D Rebuild Execution Prompt

## How To Use This Prompt
Use this prompt from the repository root:

```text
/Users/gurbakshchahal/G3D
```

Your mission is to execute the Galileo3D rebuild from the documentation system in:

```text
/Users/gurbakshchahal/G3D/docs
```

You must use six parallel workstreams. Each workstream must read the relevant docs in full, implement its assigned scope, write or update tests, run verification, record progress, and keep iterating until its assigned checklist items are complete. The coordinating agent must integrate the workstreams, resolve conflicts, run the full verification suite, and only mark work complete when real evidence proves it.

Do not treat the docs as suggestions. Treat them as the rebuild specification.

## Non-Negotiable Operating Rules
- Read every required PRD page before implementing its scope.
- Use `/Users/gurbakshchahal/G3D/docs/24-File-by-File-Rebuild-Checklist.md` as the source of truth for file-level implementation status.
- Use `/Users/gurbakshchahal/G3D/docs/23-Implementation-Roadmap.md` as the phase sequencing source of truth.
- Use `/Users/gurbakshchahal/G3D/docs/21-Testing-and-Validation-PRD.md` as the acceptance gate source of truth.
- Do not skip ahead to advanced systems before their foundation phase passes.
- Do not mark a file, subsystem, phase, or workstream complete from intent, line count, or "looks done" status.
- Completion requires implementation, tests, verification output, and checklist evidence.
- Examples are validation artifacts. They must use public APIs and must not bypass engine internals.
- No source backup files such as `*.bak`.
- No placeholder implementations, fake success fallbacks, or TODO-driven completion.
- No private deep imports unless the relevant PRD explicitly allows them.
- Do not delete existing user work unless explicitly requested.
- If the repo is dirty, preserve unrelated changes and work around them.

## Required Documentation Pages
The coordinator and all workstreams must connect their work back to these pages:

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

## Coordinator Prompt
You are the coordinating agent for the Galileo3D rebuild.

First, read these docs in full:

- `docs/00-Executive-Rebuild-Overview.md`
- `docs/01-Failure-Analysis.md`
- `docs/02-Architecture-Principles.md`
- `docs/03-Target-Repository-Structure.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/22-Build-Packaging-and-Distribution-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Then launch six parallel workstreams using the six prompts below. Each workstream owns a disjoint scope. Tell each workstream that it is not alone in the codebase, that other workstreams may be editing disjoint files, and that it must not revert or overwrite unrelated changes.

Your responsibilities:

1. Create or maintain a progress ledger at `docs/rebuild-progress.md`.
2. For every phase, track:
   - PRD pages read.
   - Files implemented.
   - Tests added.
   - Commands run.
   - Failures found.
   - Fix iterations.
   - Completion evidence.
3. Keep the workstreams aligned to the roadmap order.
4. Integrate completed workstream changes.
5. Resolve merge conflicts by preserving each workstream's intent.
6. Run verification after each integration pass.
7. Continue iterating until all required docs have been executed in full.
8. Mark items complete only in `docs/rebuild-progress.md` after evidence exists.

Coordinator completion audit:

- Restate every required deliverable from docs `03` through `24`.
- Map every deliverable to implemented files, tests, and command evidence.
- Confirm all package boundaries pass.
- Confirm all public exports pass.
- Confirm all shader marker checks pass once shaders exist.
- Confirm all browser and visual checks pass for examples.
- Confirm no placeholder implementations exist.
- Confirm no source backup files exist.
- Confirm no advanced scope was added ahead of the roadmap.

If any item is incomplete, continue another iteration instead of claiming completion.

## Parallel Workstream 1: Foundations, Tooling, Core, Math
You are Workstream 1. You own repository scaffolding, verification tooling, `packages/math`, and `packages/core`.

Read these docs in full before coding:

- `docs/00-Executive-Rebuild-Overview.md`
- `docs/02-Architecture-Principles.md`
- `docs/03-Target-Repository-Structure.md`
- `docs/04-Core-Engine-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/22-Build-Packaging-and-Distribution-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- Root build and test config listed in phase 0 of `24-File-by-File-Rebuild-Checklist.md`.
- `tools/verify-boundaries/index.ts`
- `tools/verify-exports/index.ts`
- `tools/package-size/index.ts`
- `packages/math/**`
- `packages/core/**`
- Unit tests for math and core.
- Initial integration tests for engine loop and scheduler.

Execution requirements:

1. Implement phase 0 verification harness first.
2. Implement math before core files that depend on math.
3. Implement core lifecycle in the order specified in `04-Core-Engine-PRD.md`.
4. Add strict tests for edge cases, deterministic fixed steps, scheduler cycles, event listener mutation, disposal, and diagnostics snapshots.
5. Run relevant verification after each iteration.
6. Update `docs/rebuild-progress.md` with concrete evidence for completed items.

Do not implement renderer, scene, ECS, physics, animation, assets, examples, input, audio, scripting, editor, or particles except for minimal test fixtures needed by your scope.

Completion evidence required:

- Typecheck passes for your packages.
- Unit tests pass for `math` and `core`.
- Boundary/export verifier fixtures pass and fail correctly.
- No forbidden imports.
- Progress ledger links each completed file back to `24-File-by-File-Rebuild-Checklist.md`.

## Parallel Workstream 2: Scene Graph, ECS, Cameras, Controls Interfaces
You are Workstream 2. You own `packages/scene`, `packages/ecs`, and camera data contracts. Camera controls implementation must wait until input primitives exist, but you should define the contracts and tests that do not depend on browser input.

Read these docs in full before coding:

- `docs/02-Architecture-Principles.md`
- `docs/03-Target-Repository-Structure.md`
- `docs/06-Scene-Graph-PRD.md`
- `docs/07-Entity-Component-System-PRD.md`
- `docs/13-Camera-and-Controls-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- `packages/scene/**`
- `packages/ecs/**`
- Unit tests for scene and ECS.
- Integration tests for scene traversal, ECS scheduler, ECS serialization, and transform data contracts.

Execution requirements:

1. Wait for or coordinate with Workstream 1 for `math` and `core` public APIs.
2. Implement scene graph before renderer-specific renderable tests.
3. Implement ECS as pure runtime data with no renderer, physics, animation, asset, or editor imports.
4. Enforce one transform hierarchy owner in scene and a separate data transform component in ECS.
5. Add cycle rejection tests for scene hierarchy and ECS scheduler.
6. Update `docs/rebuild-progress.md` with file-level evidence.

Do not implement renderer, physics, animation, assets, input event listeners, audio, scripting, editor, particles, or examples.

Completion evidence required:

- Scene transform hierarchy tests pass.
- Camera and frustum tests pass.
- ECS entity/component/query/command buffer tests pass.
- ECS scheduler dependency tests pass.
- No forbidden imports.
- Progress ledger maps completed files to docs `06`, `07`, `13`, and `24`.

## Parallel Workstream 3: Rendering, Materials, Lighting, Shadows, Debug Render
You are Workstream 3. You own the renderer and rendering-facing diagnostics.

Read these docs in full before coding:

- `docs/01-Failure-Analysis.md`
- `docs/02-Architecture-Principles.md`
- `docs/03-Target-Repository-Structure.md`
- `docs/05-Renderer-PRD.md`
- `docs/10-Materials-and-Shaders-PRD.md`
- `docs/14-Lighting-and-Shadows-PRD.md`
- `docs/19-Debugging-and-Devtools-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/22-Build-Packaging-and-Distribution-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- `packages/rendering/**`, except particle effect files owned by Workstream 6.
- Rendering-related files in `packages/debug/**`:
  - `DrawCallTracker.ts`
  - `RenderStateInspector.ts`
  - `ShaderDiagnostics.ts`
  - `MaterialDiagnostics.ts`
  - rendering hooks needed by those diagnostics.
- Renderer unit, browser, and visual tests.
- Shader marker verifier integration with Workstream 1 tooling.

Execution requirements:

1. Wait for or coordinate with Workstreams 1 and 2 for `core`, `math`, and `scene` APIs.
2. Implement WebGL2 minimal vertical slice before PBR.
3. Prove CPU vertex layout, GPU upload/readback, shader attribute binding, and visual output separately.
4. Add one canonical shader library only.
5. Implement unlit material before PBR material.
6. Implement direct lighting before shadows.
7. Implement basic shadow map before cascaded shadows.
8. Add diagnostics that would catch the old failures: wrong shader source, missing uniforms, render state leak, zero draw calls.
9. Update `docs/rebuild-progress.md` after each validated file group.

Do not implement physics, animation, assets, input, audio, editor, scripting, or particle systems except for interfaces needed by rendering tests.

Completion evidence required:

- WebGL2 browser init passes.
- Buffer upload/readback passes.
- Triangle and cube visual checks pass.
- Shader marker verification passes.
- PBR material visual check passes once PBR is implemented.
- Shadow visual check passes once shadows are implemented.
- Render state leak tests pass.
- Progress ledger maps work to docs `05`, `10`, `14`, `19`, and `24`.

## Parallel Workstream 4: Physics And Animation
You are Workstream 4. You own deterministic physics, physics bridges, animation runtime, animation bridges, and their debug adapters.

Read these docs in full before coding:

- `docs/01-Failure-Analysis.md`
- `docs/02-Architecture-Principles.md`
- `docs/08-Physics-Engine-PRD.md`
- `docs/09-Animation-System-PRD.md`
- `docs/19-Debugging-and-Devtools-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- `packages/physics/**`
- `packages/animation/**`
- Debug files:
  - `packages/debug/src/PhysicsDebugAdapter.ts`
  - `packages/debug/src/AnimationInspector.ts`
- Physics and animation tests.
- Integration tests for scene/ECS sync after Workstreams 1 and 2 are available.

Execution requirements:

1. Wait for or coordinate with Workstreams 1 and 2 for `core`, `math`, `scene`, and `ecs`.
2. Implement deterministic rigidbody physics before constraints.
3. Implement real raycast; no stub raycasts.
4. Implement scene and ECS physics bridges only after physics world tests pass.
5. Implement animation tracks, clips, actions, mixer, and scene bridge before skeleton/state machine.
6. Implement skeleton matrix palette before any advanced skeletal feature claims.
7. Add replay, sampling, bridge, and visual integration tests where relevant.
8. Update `docs/rebuild-progress.md` with evidence.

Do not implement renderer internals, assets, input, audio, editor, scripting, particles, or examples beyond small test fixtures.

Completion evidence required:

- Physics deterministic replay passes.
- Falling body and collision event tests pass.
- Raycast hit/miss tests pass.
- Scene/ECS bridge tests pass.
- Animation track interpolation and mixer tests pass.
- Skeleton palette tests pass.
- Animation bridge tests pass.
- Progress ledger maps work to docs `08`, `09`, `19`, and `24`.

## Parallel Workstream 5: Assets, Input, Audio, Scripting, Editor Runtime
You are Workstream 5. You own asset loading, input, camera control implementations, audio, scripting, and editor runtime.

Read these docs in full before coding:

- `docs/02-Architecture-Principles.md`
- `docs/11-Asset-Pipeline-PRD.md`
- `docs/12-Input-and-Interaction-PRD.md`
- `docs/13-Camera-and-Controls-PRD.md`
- `docs/16-Audio-System-PRD.md`
- `docs/17-Scripting-and-Behavior-System-PRD.md`
- `docs/18-Editor-Runtime-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- `packages/assets/**`
- `packages/input/**`
- `packages/audio/**`
- `packages/scripting/**`
- `packages/editor-runtime/**`
- Relevant tests for these packages.

Execution requirements:

1. Wait for or coordinate with Workstreams 1, 2, and 3 for public APIs from core, math, scene, ECS, and rendering.
2. Implement asset handles, registry, cache, dependency graph, and manager before individual loaders.
3. Implement image/texture/shader/material/audio loaders before glTF.
4. Implement input snapshots/devices/action maps before controls.
5. Implement orbit and first-person controls after input and camera APIs exist.
6. Implement audio context lifecycle before sources and spatial audio.
7. Implement behavior runtime before visual graph execution.
8. Implement editor commands before gizmos.
9. Update `docs/rebuild-progress.md` with evidence.

Do not implement renderer internals, physics, animation internals, particle systems, or examples except for small tests.

Completion evidence required:

- Asset duplicate-load and release tests pass.
- Minimal glTF fixture loads after renderer/scene contracts are available.
- Input transition and action map tests pass.
- Browser input tests pass.
- Audio unlock/source/listener tests pass.
- Behavior phase-order tests pass.
- Editor command undo/redo tests pass.
- Progress ledger maps work to docs `11`, `12`, `13`, `16`, `17`, `18`, and `24`.

## Parallel Workstream 6: Examples, Particles, Full Validation, Release Evidence
You are Workstream 6. You own examples, particle/effects implementation, visual baselines, performance baselines, and release evidence. You must coordinate closely with all other workstreams because examples depend on their public APIs.

Read these docs in full before coding:

- `docs/00-Executive-Rebuild-Overview.md`
- `docs/01-Failure-Analysis.md`
- `docs/15-Particles-and-Effects-PRD.md`
- `docs/20-Examples-and-Demos-PRD.md`
- `docs/21-Testing-and-Validation-PRD.md`
- `docs/22-Build-Packaging-and-Distribution-PRD.md`
- `docs/23-Implementation-Roadmap.md`
- `docs/24-File-by-File-Rebuild-Checklist.md`

Owned files and areas:

- `packages/rendering/src/effects/**`
- `examples/**`
- `tests/visual/**`
- `tests/browser/**` for example smoke coverage.
- `tests/performance/**`
- Visual baselines and reports.

Execution requirements:

1. Do not create examples that bypass public APIs.
2. Implement examples in roadmap order:
   - `00-basic-triangle`
   - `01-basic-scene`
   - `02-materials-pbr`
   - `03-shadows`
   - `04-physics-stack`
   - `05-animation-character`
   - `06-asset-gltf`
   - `07-input-controls`
   - `08-audio-spatial`
   - `09-editor-runtime`
   - `10-particles`
3. Implement CPU particles before any GPU particle backend.
4. Add seeded particle determinism tests.
5. Add visual nonblank and expected-region checks.
6. Add performance baseline tests after each relevant subsystem exists.
7. Update `docs/rebuild-progress.md` with example validation evidence.

Do not implement core, scene, ECS, renderer internals outside particle/effects, physics, animation, assets, input, audio, scripting, or editor runtime unless coordinating a small compatibility fix with the owner workstream.

Completion evidence required:

- Every example has a README, purpose, run command, and acceptance target.
- Every example has browser smoke coverage.
- Visual examples have nonblank and expected-region checks.
- Particle tests and visual checks pass.
- Performance reports exist for ECS, renderer, physics, animation, assets, and particles once those systems exist.
- Progress ledger maps work to docs `15`, `20`, `21`, `22`, and `24`.

## Iteration Loop Required For All Six Workstreams
Each workstream must repeatedly follow this loop:

1. Read the assigned docs and identify the next unchecked file group in `24-File-by-File-Rebuild-Checklist.md`.
2. Inspect current repository state.
3. Implement the smallest coherent file group.
4. Add or update required tests.
5. Run the narrowest relevant tests.
6. Fix failures.
7. Run the next broader verification level.
8. Update `docs/rebuild-progress.md` with:
   - Files changed.
   - Docs used.
   - Checklist items completed.
   - Commands run.
   - Test results.
   - Remaining blockers.
9. Hand off any cross-workstream dependency explicitly.
10. Continue to the next file group.

If verification fails, do not mark the item complete. Fix the failure or document the blocker in `docs/rebuild-progress.md` and notify the coordinator.

## Required Progress Ledger Format
Maintain this file:

```text
docs/rebuild-progress.md
```

Use this structure:

```markdown
# Galileo3D Rebuild Progress

## Current Phase
- Phase:
- Status:
- Last verification command:
- Last verification result:

## Workstream Status
| Workstream | Scope | Current Task | Status | Evidence |
|---|---|---|---|---|

## Checklist Completion
| PRD | Checklist Item | Owner | Status | Evidence |
|---|---|---|---|---|

## Commands Run
| Date | Command | Result | Notes |
|---|---|---|---|

## Blockers
| Blocker | Owner | Needed From | Status |
|---|---|---|---|

## Completion Audit
- [ ] Docs read
- [ ] Files implemented
- [ ] Tests added
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Browser tests pass
- [ ] Visual tests pass
- [ ] Performance baselines recorded
- [ ] Boundary verifier passes
- [ ] Export verifier passes
- [ ] Shader verifier passes
- [ ] Examples validated
- [ ] No placeholders
- [ ] No backup source files
```

## Final Completion Audit
Before declaring the rebuild complete, the coordinator must inspect real evidence and answer every item below:

- Did every PRD page from `00` through `24` get read and used?
- Did every file in `24-File-by-File-Rebuild-Checklist.md` get implemented or explicitly deferred by roadmap rules?
- Did every implemented file have required tests?
- Did all package boundaries pass?
- Did all exports pass?
- Did all shader marker checks pass?
- Did all unit tests pass?
- Did all integration tests pass?
- Did all browser tests pass?
- Did all visual tests pass?
- Did all examples run through public APIs?
- Did physics deterministic replay pass?
- Did animation sampling and bridge tests pass?
- Did asset load/release tests pass?
- Did input and audio browser tests pass?
- Did editor undo/redo tests pass?
- Did particles visual and performance tests pass?
- Did performance reports get recorded?
- Are there zero placeholder implementations?
- Are there zero source backup files?
- Are all completion claims tied to command output, test output, or concrete file evidence?

If any answer is no, continue iterating.


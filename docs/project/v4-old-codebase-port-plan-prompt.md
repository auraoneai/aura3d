# V4 Old Codebase Port Plan Prompt

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.

  You are working in `/Users/gurbakshchahal/G3D`.

  Create a detailed, evidence-driven port plan for bringing forward the useful parts of the previous Galileo3D codebase into the current V3/V4 codebase, with explicit verification requirements proving that each ported thing actually works.

  Important context:

  - The old codebase is not a separate local folder. It is the older `master` / `origin/master` branch in this same repo.
  - The current working branch is `preserve/g3d-v2-execution-state`.
  - Do not switch branches destructively.
  - Inspect old files read-only using commands like:
    - `git show master:path/to/file`
    - `git ls-tree -r --name-only master`
    - `git diff master...HEAD -- path`
  - Do not blindly copy old code. The old branch has useful examples and algorithms, but also scaffolding, stale APIs, backup files, and corrupt renderer files.
  - The goal is not to claim Three.js/Unity/Unreal parity immediately. The goal is to create a port plan that moves the current repo toward stronger visual/runtime/editor evidence while keeping broad claims blocked until verified.

  Primary deliverable:

  Create a new planning document:

  `docs/project/v4-old-codebase-port-plan.md`

  The document must be detailed enough that another coding agent can execute it phase by phase without guessing. It must include a verification matrix that proves each ported subsystem works in the current architecture.

  Before writing the plan, inspect the current repo and the old `master` branch. Read enough of the current docs and source to avoid proposing ports that already exist or conflict with current V4 architecture.

  Required current docs to inspect:

  - `docs/project/v4-readme.md`
  - `docs/project/v4-decision-gates.md`
  - `docs/project/v4-current-gap-audit.md`
  - `docs/project/v4-renderer-visual-quality-plan.md`
  - `docs/project/v4-asset-content-plan.md`
  - `docs/project/v4-benchmarks-validation-plan.md`
  - `docs/project/v4-master-code-checklist.md`
  - `docs/project/v4-remaining-code-to-write.md`
  - Relevant V3 docs if a V4 task references V3 carry-over behavior:
    - `docs/project/v3-*.md`

  Required old-branch files to inspect:

  1. Racing / car showcase:
     - `master:examples/racing-game/src/ProceduralCarBuilder.ts`
     - `master:examples/racing-game/src/ProceduralTextureGenerator.ts`
     - `master:examples/racing-game/src/Track.ts`
     - `master:examples/racing-game/src/Vehicle.ts`
     - `master:examples/racing-game/src/RaceManager.ts`
     - `master:examples/racing-game/src/RacingHUD.ts`

  2. Space / visual background:
     - `master:examples/space-shooter/src/SpaceEnvironment.ts`
     - `master:src/assets/ProceduralTextures.ts`

  3. Procedural texture library:
     - `master:src/assets/ProceduralTextures.ts`
     - `master:examples/racing-game/src/ProceduralTextureGenerator.ts`

  4. Architecture:
     - `master:examples/arch-viz/src/ArchVizScene.ts`
     - `master:examples/arch-viz/src/MaterialLibrary.ts`
     - `master:examples/arch-viz/src/LightingController.ts`
     - `master:examples/arch-viz/src/MeasurementTool.ts`
     - `master:examples/arch-viz/src/PostProcessing.ts`

  5. PBR / shadows / shader references:
     - `master:src/shaders/chunks/pbr.glsl`
     - `master:src/shaders/chunks/shadow.glsl`
     - Relevant current files:
       - `packages/rendering/src/ShaderLibrary.ts`
       - `packages/rendering/src/PostProcessPass.ts`
       - `packages/rendering/src/ForwardPass.ts`
       - `packages/rendering/src/ShadowMap.ts`
       - `packages/rendering/src/CascadedShadowMaps.ts`
       - `packages/rendering/src/Geometry.ts`

  6. Explicitly inspect but do not blindly port:
     - `master:src/rendering/Renderer.ts.bak9`
     - `master:src/rendering/Renderer.ts.bak10`
     - `master:src/rendering/Renderer.ts.bak11`
     - `master:src/rendering/Renderer.ts.bak12`
     - `master:src/rendering/Renderer.ts.corrupt`

  For those backup/corrupt renderer files, the plan should say they are reference-only unless specific algorithms are extracted and reimplemented with tests.

  The plan must include these sections:

  1. Executive Summary

  Explain what should be ported, what should not be ported, and why. Be blunt about current visual gaps. State that the old branch is broader but not automatically correct or production-ready.

  2. Source Audit Table

  Create a table with columns:

  - Old source path
  - Current equivalent path, if any
  - What useful behavior exists in old code
  - Current gap it addresses
  - Port recommendation: `port`, `adapt`, `reference only`, or `do not port`
  - Risk level
  - Required verification

  3. Required Port Phases

  Create detailed implementation phases in this order unless inspection proves a different order is safer:

  Phase 1: Geometry Primitives

  - Add current-engine `Geometry.cylinder` and `Geometry.capsule` helpers.
  - Use current `VertexBuffer`, `IndexBuffer`, `VertexFormat.P3N3` patterns.
  - Include caps, side normals, correct bounds, segment validation, disposal compatibility.
  - Unit tests must verify vertex counts, index counts, bounds, normals, invalid input errors, and render-pipeline compatibility.

  Expected current files:
  - `packages/rendering/src/Geometry.ts`
  - `tests/unit/rendering/geometry-primitives.test.ts`

  Phase 2: Deterministic Procedural Texture Fixtures

  - Port/adapt deterministic texture generation from old `ProceduralTextures.ts` and racing `ProceduralTextureGenerator.ts`.
  - Required textures:
    - metallic paint
    - carbon fiber
    - tire tread
    - concrete/asphalt
    - sci-fi panel
    - wood plank
    - marble
    - starfield/nebula background texture
    - normal-from-height utility where useful
  - Must use seeded deterministic noise, not `Math.random`, for screenshot stability.
  - Must integrate with current `Texture` / material APIs, not old texture classes.
  - Add unit tests for dimensions, deterministic hash/output, color diversity, alpha validity, and invalid size errors.

  Expected current files may include:
  - `packages/rendering/src/ProceduralTextureFixtures.ts`
  - `packages/rendering/src/index.ts`
  - `tests/unit/rendering/procedural-texture-fixtures.test.ts`

  Phase 3: Racing Showcase / Car Port

  - Port the old procedural racing/car showcase into the current V4 architecture.
  - Prefer a new example:
    - `examples/racing-showcase/index.html`
    - `examples/racing-showcase/main.ts`
  - Or, if justified, use it to replace the weak visual centerpiece of `examples/game-slice`.
  - Current-engine implementation must use current `Geometry`, `PBRMaterial`, `TexturedPBRMaterial`, `Texture`, `Renderer`, and V4 evidence/report patterns.
  - The car must include body, cabin/glass, four tires, rims/hubs, spoiler, lights, decals/stripe or carbon material, and a track or showroom environment.
  - Add browser screenshot test and report evidence.
  - The screenshot test must fail if the scene is blank, tiny, debug-dominated, or if the car is not visibly present.
  - If this becomes a V4 flagship/example, wire it into relevant V4 verifiers and portfolio only after it passes visual gates.

  Expected files may include:
  - `examples/racing-showcase/*`
  - `tests/browser/racing-showcase-v4.spec.ts`
  - `tools/v4-examples/index.ts`
  - `tools/v4-visual-quality/index.ts`
  - `package.json` scripts only if needed

  Phase 4: Space / Starfield / Nebula Backgrounds

  - Port the old `SpaceEnvironment` concept as deterministic reusable background generation.
  - Use it in:
    - `examples/game-slice`
    - `examples/postprocess-lab`
    - optionally `examples/webgpu-capability`
  - It must not be a purely decorative CSS background. It should be a generated bitmap/canvas/texture or renderer-backed element with deterministic evidence.
  - Add tests proving deterministic output and screenshot improvement.
  - Do not allow random twinkling to make screenshot tests flaky.

  Phase 5: Product/Game/Material Texture Application

  - Apply the procedural texture library to current visible examples:
    - product configurator
    - game slice or racing showcase
    - material showroom
    - architecture viewer where appropriate
  - Add or update browser tests to verify texture slots, texture upload/readback, visible material variety, and screenshot color diversity.
  - This must replace flat material-only surfaces where possible.

  Phase 6: Architecture Scene Composition Port

  - Port old arch-viz composition concepts into current `examples/architecture-viewer`.
  - Bring over the idea of:
    - foundation/base
    - exterior walls
    - interior partition walls
    - floor/ceiling
    - windows/glass
    - doors
    - furniture
    - kitchen/bathroom details
    - exterior elements
    - measurement tools
    - better camera defaults
  - Implement in current code style.
  - Add browser screenshot tests that fail if the scene reads as a wire schematic or thin debug overlay.
  - Preserve current V4 state/evidence fields.

  Phase 7: Postprocess Settings Model

  - Adapt the old arch-viz `PostProcessing.ts` settings model, but only implement effects that can be actually tested now.
  - Required now:
    - ACES or filmic tone mapping if feasible
    - existing Reinhard path preserved
    - exposure
    - contrast
    - temperature/tint
    - saturation/vibrance
    - vignette
    - sharpening
  - Leave these blocked unless implemented with real evidence:
    - DOF
    - chromatic aberration
    - film grain
    - motion blur
  - Add pixel tests proving each implemented effect changes real-scene pixels and does not break layout.

  Expected files:
  - `packages/rendering/src/PostProcessPass.ts`
  - `examples/postprocess-lab/main.ts`
  - `tests/browser/rendering-v4-visuals.spec.ts`
  - `tests/unit/rendering/*postprocess*.test.ts`, if appropriate

  Phase 8: Shader / PBR / Shadow Reference Port

  - Use old `pbr.glsl` and `shadow.glsl` as references, not copy-paste sources.
  - Plan specific current-engine upgrades:
    - better GGX lighting
    - Smith-GGX / Schlick Fresnel parity where missing
    - Disney/Burley diffuse if feasible
    - Poisson PCF sample table
    - improved shadow bias logic
    - real forward-pass shadow sampling, not just proxy evidence
  - This phase should be last because it has higher risk.
  - Require browser visual tests comparing lit vs shadowed pixels under camera movement and verifying no stale metadata claim.
  - Require same-scene comparison against Three.js/Babylon only for specific, narrow claims.

  4. Verification Matrix

  Create a matrix with columns:

  - Port item
  - Implementation files
  - Unit tests
  - Browser tests
  - Screenshot/report artifacts
  - V4 verifier or script that must pass
  - What claim this supports
  - What claim remains blocked

  For every item, include concrete commands. Use existing scripts where possible:

  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm verify:v4-assets`
  - `pnpm verify:v4-rendering`
  - `pnpm verify:v4-examples`
  - `pnpm verify:v4-visual-quality`
  - `pnpm verify:v4-benchmarks`, only when comparison scenes are touched
  - `pnpm verify:v4`, only after broad integration changes

  If the repo uses different scripts after inspection, use the actual package scripts from `package.json`.

  5. Claim Policy

  The plan must explicitly say:

  - Do not claim broad Three.js superiority.
  - Do not claim Unity replacement.
  - Do not claim Unreal replacement.
  - Do not claim complete PBR, glTF, WebGPU, shadows, editor, or production renderer parity.
  - Claims may only be narrowed to exact verified scenes/metrics/dates/browsers.
  - Any portfolio/README wording must cite the relevant report paths and known limits.

  6. Visual Quality Gate Requirements

  Add a section requiring stronger visual review than current nonblank tests.

  The plan should require tests/tools that fail when:

  - screenshot is dominated by raw JSON/debug text;
  - primary asset occupies too little visible area;
  - image is mostly dark/blank;
  - scene uses only primitive untextured blocks while claiming showcase quality;
  - UI overlaps scene content;
  - screenshot is stale relative to manifest/report;
  - feature evidence exists only as metadata with no screenshot/pixel support.

  Specify how to implement this either by extending:
  - `tools/v4-visual-quality/index.ts`
  - `tests/browser/example-screenshot-audit-v4.spec.ts`
  - contact-sheet generation/review artifacts

  7. Do-Not-Port List

  Explicitly list old items that should not be ported wholesale:

  - `src/rendering/Renderer.ts.bak9`
  - `src/rendering/Renderer.ts.bak10`
  - `src/rendering/Renderer.ts.bak11`
  - `src/rendering/Renderer.ts.bak12`
  - `src/rendering/Renderer.ts.corrupt`
  - broad old `src/ai/**` unless a current V4 example needs a specific behavior and test
  - broad old `src/postfx/**` unless reimplemented in current `PostProcessPass` with pixel tests
  - any old code that depends on old `g3d` APIs without adaptation
  - any random/non-deterministic visual generation that would make browser screenshots flaky

  8. Execution Checklist

  At the end of the document, include a numbered execution checklist with one checkbox per concrete deliverable.

  The checklist must be granular enough to execute later, for example:

  - [ ] Add `Geometry.cylinder`
  - [ ] Add `Geometry.capsule`
  - [ ] Add geometry primitive unit tests
  - [ ] Add deterministic procedural texture module
  - [ ] Add texture hash tests
  - [ ] Add racing showcase example
  - [ ] Add racing screenshot test
  - [ ] Wire racing showcase into V4 examples verifier
  - [ ] Apply texture fixtures to product/material/game examples
  - [ ] Port architecture scene composition
  - [ ] Add architecture visual gate
  - [ ] Add postprocess color grading/vignette/sharpening
  - [ ] Add postprocess pixel tests
  - [ ] Plan PBR/shadow shader upgrades
  - [ ] Keep broad parity claims blocked until evidence exists

  9. Completion Audit

  Before considering the planning task complete, perform an audit in the final response:

  - State where the plan was written.
  - List which old files were inspected.
  - List which current files/docs were inspected.
  - Confirm the plan includes verification commands and claim limits.
  - Confirm no code was ported yet unless explicitly asked.
  - Identify any uncertainty or old file that still needs deeper inspection.

  Do not implement the ports in this task unless specifically asked after the plan is accepted. The deliverable is the detailed port plan and verification strategy.

  This prompt is intentionally strict about evidence. The key point is to stop the next pass from becoming “copy old broad code and declare parity.” It forces the port to produce concrete current-engine artifacts, browser screenshots, verifier coverage, and blocked-claim
  language for anything not actually proven.

## Planning Task Completion Status

- [x] Inspected the required V4/V3 docs and current renderer/example verification surfaces.
- [x] Inspected the required old `master` branch source paths for racing, procedural textures, space backgrounds, architecture, postprocess, shaders, and risky renderer backups.
- [x] Created `docs/project/v4-old-codebase-port-plan.md`.
- [x] Included the required source audit table, phased port plan, verification matrix, claim policy, visual-quality gate requirements, do-not-port list, execution checklist, and completion audit requirements.
- [x] Kept this task to planning only; no old code was ported as part of this prompt.

Note: the unchecked checkboxes above are example future deliverables that the prompt required the plan to contain. They are intentionally transcribed as future work in `docs/project/v4-old-codebase-port-plan.md`, not marked complete by this planning pass.

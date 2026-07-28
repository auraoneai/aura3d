# Aura3D three.js Parity + Game Rebuild — Complete Handoff

Repo: `/Users/gurbakshchahal/platforms/aura3d` · pnpm@11.1.3 · published root package
`@aura3d/engine` v1.4.5 · TypeScript monorepo.

**This file is the single source of work.** It merges the original owner task prompt with the
Phase 1 audit outcome and the owner decisions taken 2026-07-26. It is written to be handed to
a fresh agent with no prior context: everything needed to start is here, plus pointers to the
two companion documents.

Companion documents (read, do not duplicate):
- `docs/project/engine-parity-gap-audit.md` — the Phase 1 deliverable. Measured baseline,
  nine ranked gaps, file:line evidence, fix cost, blocking analysis, and the three recorded
  owner decisions in full.
- `docs/agents/claims-and-boundaries.md` and `docs/project/known-limits.md` — binding claim
  authority. Narrower wording always wins.

Last verified against code: 2026-07-27, through the Phase 4 closing audit.

Status legend: `[ ]` open · `[x]` done · `[~]` partial, detail required · `[!]` blocked

---

## Where this stands

Completed and committed:

| Commit | Content |
|---|---|
| `606c826d` | Gap 2 — real GGX importance-sampled specular prefilter (`SpecularPrefilter.ts`, 628 lines). Gap 8 — `packages/controls/src/OrbitControls.ts` 25 → 176 lines, delegates camera math to `@aura3d/input`; `MapControls` delegates damping |
| `e0f7e2e0` | `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts` — exact LUTs for GPU porting; `outlinePixels` converted to integer arithmetic |
| `43ec8f59` | First version of this checklist |
| `c4e1b662` | Phase 1 audit created |
| `601275c4` | Three Phase 2 gate decisions recorded in the audit |

Phase 1, Phase 2, and the Phase 3 game work have been executed. Phase 2B has also been
executed under Rule 0: fog pixels, rectangular area lights, native oriented/mesh
narrow-phase, and native angular contact remain explicitly blocked; the final full-unit
exit gate is blocked only on two retained racing visual-QA assertions. The 2B-specific
documentation pass and the general Phase 4 claim audit are complete. Remaining
non-passing gates and Rule 0 blockers are summarized in **4.8**; they were not
converted into broader claims.

Scope note: Phases 2-4 close the nine audited gaps and ship the four games. **Phase 2B** covers
the remaining distance to three.js feature coverage — the entries `EnvironmentPlatform.ts`
declares `"missing"`/`"partial"`, plus the native physics limits the Gap 7 decision documented
rather than fixed. Phase 2B is not a prerequisite for the games. No phase in this file can
produce a "better than three.js" claim; see the note at the end of Phase 2B.

Known trap from the first attempt: it produced deep work on one sub-problem (the LUTs at
`e0f7e2e0`) while 7 of 9 gaps sat untouched, and created six tracking documents that nothing
consumed. Rule 0 exists to prevent a repeat.

---

## Rule 0 — anti-loop rules, read before doing anything

1. **One task in flight.** Take the topmost unchecked task in the current phase. Finish it or
   record it blocked. Do not open a second.
2. **Stop at each `STOP FOR REVIEW` marker.** Do not proceed past it.
3. **Exhaustive proofs are out of scope unless a task names them.** Bit-exactness sweeps,
   BigInt bounds, and 100M-case verifiers are not required by any task below. A pixel test
   plus a diagnostic assertion is the bar.
4. **No new tracking documents.** Update this file's checkboxes and the audit. Do not create
   `*-status.md`, `*-backlog.md`, `*-matrix.md`, or similar.
5. **If a task fails twice, mark it `[!]` with the root cause and move to the next task.** Do
   not attempt a third variation.
6. **Never edit a generated file as source.** See the Generated Files list at the bottom.
7. **Lower the claim label when proof is absent.** Never broaden a claim to match ambition.
8. **Commit per task**, with the verification command output referenced in the message.
9. **Do not revert unrelated changes.** This worktree previously held uncommitted user changes
   and untracked showcase assets, all committed at `e0f7e2e0`.

---

## Required reading, in order, once

- [x] `llms.txt` (~297 lines, mirrored at `public/llms.txt` — keep both in sync)
- [x] `docs/agents/claims-and-boundaries.md` — binding; 7 capability labels, every public
      claim carries exactly one
- [x] `docs/project/known-limits.md` — declared authority; narrower wording always wins
- [x] `docs/agents/game-showcase-build.md` — what a game route must have to ship
- [x] `AGENTS.md`, `packages/AGENTS.md`, `packages/rendering/AGENTS.md`, `apps/AGENTS.md`,
      `docs/AGENTS.md`
- [x] `docs/project/engine-parity-gap-audit.md` — the gap evidence this file acts on

---

## Correct starting premise — the engine is not uniformly weak

The forward renderer is real GPU code. Verify by reading before touching anything adjacent;
do not rewrite these:

- Cook-Torrance GGX PBR + separate clearcoat lobe — `packages/rendering/src/ShaderChunks.ts:57-113,277-278`
  (`a3dDistributionGGX`, `a3dGeometrySmithGGXCorrelated`, Fresnel-Schlick)
- IBL via `textureLod` with roughness-driven LOD, equirect + cube bindings, RGBE decode —
  `packages/rendering/src/ShaderLibrary.ts:382-543`
- `drawElementsInstanced` / `drawArraysInstanced` — `packages/rendering/src/WebGL2Device.ts:807-817`
- FBOs with `DEPTH_COMPONENT24` — `WebGL2Device.ts:409-432`; per-face cube uploads with
  explicit mip control — `:1767-1815`
- GPU skinning with per-geometry joint validation — `packages/rendering/src/ForwardPass.ts:272-300`
- GPU morph targets via `u_morphPositionDeltas` / `u_morphWeights`, CPU fallback —
  `ForwardPass.ts:1418-1440`
- Frustum culling against real AABBs — `packages/rendering/src/Renderer.ts:1981`
- Render-queue sorting: opaque front-to-back, transparent back-to-front, distinct
  transmission bucket — `packages/rendering/src/RenderItemSorting.ts:41-71`
- WebGPU backend, ~2,877 lines of real adapter/pipeline code — `packages/rendering/src/WebGPUDevice.ts`
- Physics: fixed-timestep accumulator with sub-step clamping and render-interpolation
  `alpha`, sequential-impulse contacts, dual backend (`cannon-es@0.20.0` | own `aura-js`),
  velocity-threshold sleeping — `packages/physics/src/`
- Animation: inertialized transitions (critically-damped decay with `halfLife`, zero initial
  slope, retired at 1e-3), two-bone IK with pole vector and stretch, spring bones, humanoid
  retargeting, 14-clip standard library — `packages/animation/src/`

The games look basic because of *how they are built*, plus the specific gaps below.

---

## Package map — where everything is

Root export `.` maps to `dist/engine/agent-api/index.js`, i.e. `packages/engine/src/agent-api/`.
About 40 subpath exports exist: `./rendering`, `./physics`, `./animation`, `./input`,
`./controls`, `./scene`, `./core`, `./math`, `./ecs`, `./assets`, `./environments`,
`./materials`, `./audio`, `./scripting`, `./workflows`, `./editor-runtime`, `./debug`, plus
the label-critical `./production-runtime`, `./advanced-runtime`,
`./rendering/production-runtime`, `./rendering/advanced-runtime`, and three `./scene-kits/*`
runtimes (particle-fountain, humanoid-walk, product-viewer).

| Package | Files | LOC | Role |
|---|---|---|---|
| `packages/rendering/src` | 290 | 48,537 | Renderer internals. Gaps 1-3, 5-6, 9 live here |
| `packages/engine/src` | 100 | 46,643 | Public agent API + production/advanced bridges. `agent-api/` alone is 68 modules / ~39,595 LOC |
| `packages/assets/src` | 65 | 16,477 | Loaders, browser asset runtime, `GLTFAnimationRuntime.ts`, `loaders/ThreeCompatGLTFLoader.ts` |
| `packages/physics/src` | 29 | 9,140 | Dual-backend solver. `HitboxWorld.ts` 1,179 · `PhysicsWorld.ts` 986 · `KinematicBody.ts` 597 · `Steering.ts` 531 · `VehicleDynamics.ts` 524 |
| `packages/animation/src` | 45 | 7,988 | `AnimationController.ts` 1,017 · `HumanoidRetargeting.ts` 700 · `library/standardHumanoidClips.ts` 659 · `AnimationClipEvents.ts` 501 · `AnimationMixer.ts` 402 |
| `packages/create-aura3d/src` | 24 | 7,608 | Scaffold generator. `CREATE_AURA3D_TEMPLATES` is the authoritative template list |
| `packages/editor-runtime/src` | 45 | 7,348 | Editor runtime |
| `packages/aura3d-cli/src` | 27 | 6,615 | Asset CLI: search, add, resolve, validate, hash, typegen |
| `packages/scripting/src` | 29 | 5,837 | Visual scripting |
| `packages/asset-index/src` | 20 | 3,438 | Catalog adapters and ranking |
| `packages/input/src` | 26 | 2,450 | Real input stack + the *good* `controls/OrbitControls.ts` |
| `packages/audio/src` | 19 | 2,205 | Audio |
| `packages/scene/src` | 21 | 1,631 | Scene graph, `composeMat4`, `quatFromEuler` |
| `packages/controls/src` | 15 | 1,266 | Mostly three-compat name placeholders. See gap 8 |
| `packages/three-compat/src` | 22 | 1,210 | Migration package |
| `packages/core/src` | 15 | 1,186 | Core |
| `packages/workflows/src` | 20 | 1,174 | Workflows |
| `packages/product-studio/src` | 13 | 696 | Product studio |
| `packages/environments/src` | 8 | 469 | Only 469 LOC — consistent with its ten "helper" presets being geometry descriptors, not rendering features |

### Export-surface rule — this decides the capability label

Which subpath a route imports from **decides its label**. Root `.` is the only root-safe-API
surface. `./production-runtime`, `./advanced-runtime`, and `./rendering` are not. This is why
Aura Clash cannot carry a root claim today — it pulls `A3DRenderer` from
`@aura3d/engine/advanced-runtime`.

When adding public symbols, keep `packages/*/src/index.ts` aligned with the root
`package.json` `exports` map. Per `packages/AGENTS.md`, do not add a public export without a
test and a claim-boundary review. Verify with `pnpm verify:exports` and
`pnpm check:public-api`. ESLint blocks cross-package `@aura3d/*/src/*` deep imports — use
package exports, or relative imports inside the owning package.

---

## Root API surface — what a game route can actually call

All of the following are exported from root `@aura3d/engine`, so they are fair game for a
root-safe-API claim *if* evidence is attached. Line numbers are in
`packages/engine/src/agent-api/index.ts` (~13,491 lines).

Mount and lifecycle: `createAuraApp:9603`, `createGameApp:9806`, `AuraAppHandle.ts`,
`FrameLoop.ts`, `RuntimeNodeHandle.ts`.

Scene authoring: `scene():3434`, `model():1539`, `group():1620`, `primitives:1641`,
`groups:1650`, `material:1695`, `lights:2310`, `camera:2432`, `shadows:1655`,
`environments:2929`, `renderer:3149`, `effects:2601`, `timeline:2580`, `interactions:2717`,
`ui:2773`, `labels:2870`, `particles:7000`, `neon:7042`, `physics:3671`, `animation:6948`,
`prefabs:4315`, `sceneKits:8624`, `lazySystems:8270`.

Domain kits: `character:7641`, `city:7871`, `product:7990`, `solar:8076`, `charts:7051`.

Game layer: `game:6838`, `games:5303`, `gameRules:5697`, `createAuraGameRuntime:5701`.
Racing builders: `createGameRacingRoadMeshNodes:5843`,
`createGameRacingCheckpointGateNodes:5980`, `createGameRacingStartFinishNodes:6071`,
`createGamePublicRacingPresentationNodes:6212`, `createGameRacingCameraRig:6286`,
`createGameRacingPresentationTrackNodes:6336`, `certifyPublicRacingPresentation:6312`.
Platformer builders: `createGamePublicPlatformerPresentationNodes:6391`,
`createGamePlatformerGroundMeshNodes:6399`, `createGamePlatformerPlatformMeshNodes:6403`,
`createGamePlatformerHazardNodes:6407`, `createGamePlatformerCheckpointNodes:6427`,
`createGamePlatformerFinishNodes:6445`, `createGamePlatformerCameraRig:6463`,
`createGamePlatformerPresentationSurfaceNodes:6496`,
`certifyPublicPlatformerPresentation:6467`. Supporting modules: `GameRuntime.ts`,
`GameGenreKits.ts`, `PublicGameGeometry.ts`, `GameSceneBridge.ts`,
`GameSceneGeometryBindings.ts`, `GameSceneGeometryMath.ts`, `GameAssetValidation.ts`,
`GameEvidence.ts`, `GameInspector.ts`, `GameAppRuntime.ts`.

Assets: `defineAuraAssets:759`, `unsafeModelUrl:1564` (banned in safe public examples),
`assets/` subdirectory, `AssetEvidence.ts`, `AssetLibraryBrowser.ts`.

Prompt pipeline: `definePromptPlan:8733`, `compilePromptPlan:8748`, `promptPlanToScene:8773`,
`resolvePromptPlanSubject:8671`, `promptRecipes:8777`.

Evidence and perf: `createAuraRouteHealthSnapshot:9817`, `collectAuraSceneEvidence:9830`,
`collectGameRuntimeEvidence:5468`, `captureAuraScreenshot:9995`, `performance:9933`,
`sceneKitPerformanceBudget:8324`, `collectAuraLazySystemEvidence:8249`.

Out of scope: the ~40-module animation/episode/video-production surface
(`AnimationDirector.ts`, `CameraChoreographer.ts`, `ShotTimeline.ts`, `VisemeController.ts`,
`VideoExportPipeline.ts`, `FfmpegFrameEncoder.ts`, `YouTubeUploadAdapter.ts`, …). Do not
disturb it; `pnpm animation-studio:*` gates guard it.

### The game-kit constraint, stated precisely

`packages/engine/src/agent-api/game-kits/` holds only `fighting.ts` and `index.ts`, but that
directory is not the whole story — the racing and platformer builders above **are** real root
exports. So the constraint is narrower than "no racing/platformer kit exists":

Per `known-limits.md` these helpers "are not production game-generation APIs or automatic
arbitrary-mesh converters," and Turbo Drift and Skyline Runner "currently satisfy those
contracts for their named certified asset pairs and retained evidence only; this does not
generalize to arbitrary assets or production games." Build **on** these builders. Do not
claim they generalize to arbitrary meshes. Do not claim a reusable falling-block or generic
collision kit — those genuinely do not exist as root exports.

---

# PHASE 1 — Gap audit · COMPLETE

Deliverable `docs/project/engine-parity-gap-audit.md` exists at `c4e1b662`, decisions added
at `601275c4`.

- [x] **1.1** Audit created with one ranked section per gap 1-9, each carrying file:line, why
      it costs visual quality, fix cost, and whether it blocks the game rebuilds.
- [x] **1.2** Baseline established. `tests/reports/` is gitignored and the `threejs-parity/`,
      `external-parity/`, `three-compat/`, `production-runtime/`, `foundation/`,
      `engine-readiness/`, `superiority/`, `product-studio/` directories were empty — there
      was no score to regress against. Four commands run 2026-07-27T04:55Z and recorded:
      `threejs-parity:inventory` `pass: true` (54 matched, hand-authored);
      `threejs-parity:same-scene-render` `pass: true`; `threejs-parity:performance`
      **`pass: false`**, all 6 evidence reports missing; `engine-readiness:visual-quality`
      `ok: true` but derived from a 38-day-stale capture (`drawCalls 187`,
      `nonDarkRatio 0.674`, `salientRatio 0.109`, `flatPixelRatio 0.9176`).
- [x] **1.3** Both committed verdicts recorded as non-passing:
      `benchmark/results/aura3d-106-peer-benchmark-report.json` (release 1.0.9,
      `scoped-pass`, `auraDrawCalls 333` / `auraNonDarkPixels 45866` vs `threeChildren 75` /
      `threeNonDarkPixels 13289` — non-comparable axes; explicitly does not rank Aura3D above
      Unity/Unreal/Babylon) and `benchmark/results/round-50.md` (`owner-skipped / pending`,
      missing `benchmark/runs/round-50/human-review.json`).
- [x] **1.4** Frozen bar from `benchmark/rubric.md` recorded: ≥7/10 prompts per agent, ≥2
      wins from prompts 7/8/10, ≥4 visual scores ≥4, none <3; internal tools "cannot score
      visual quality, decide wins, or certify release readiness."
- [x] **1.5** Tooling caveat recorded: most `tools/` gates are boolean `checks[]` of
      `{ id, ok, detail }` and many assert on **source tokens** — `game-runtime-readiness`
      greps `package.json` and greps an agent report for literal strings;
      `threejs-parity-threejs-inventory` holds 54 hand-authored `item(...)` entries. Passing a
      gate ≠ proving quality. Do not game tokens.

---

# PHASE 2 — Engine fixes, P0 then P1 · COMPLETE

Rules for every task in this phase:
- Every visual feature needs a test asserting **pixels or diagnostics**, never DOM presence
  (`packages/rendering/AGENTS.md`).
- Keep fallback / mock / canvas2d / zero-draw-call states visible in diagnostics. Never hide
  a fallback to make a route look production.
- No cross-package `@aura3d/*/src/*` deep imports.
- No editing generated trees as source.

Recommended order: 2.1-2.9 (gap 1) → 2.11-2.12 (gap 3) → 2.13-2.14 (gap 4) → 2.16-2.17
(gap 5) → 2.20-2.22 (gap 7) → 2.18-2.19 (gap 6, largest) → 2.10, 2.23-2.25 → exit gate.
Gap 6's interim graceful-degradation step should land early regardless, since it removes a
live crash path. Phase 2B is deferred until after Phase 3 — see its sequencing note.

## Gap 1 (P0) — Post-processing runs on the CPU · OPEN · blocks all four games

The largest architectural divergence from three.js.

**Current state.** `packages/rendering/src/postprocess/EffectComposer.ts:149,158` does a
synchronous `device.readPixels(...)` then dispatches to `bloomPixels:317`, `ssaoPixels:333`,
`taaPixels:337`. Implementations are JS loops over `Uint8Array` in
`packages/rendering/src/PostProcessPass.ts`: `ssaoPixels:1182`, `taaPixels:1344`,
`bloomPixels:1370`, `ssrPixels:1302`, `depthOfFieldPixels:1077`, `motionBlurPixels:1130`,
`outlinePixels:969`, `contactShadowPixels:1230`, `chromaticAberrationPixels:930`,
`filmGrainPixels:1036`. Same pattern in `ExternalParityRenderPreset.ts:409-427` and
`PostProcessPass.ts:444,515-516,556`. Readback is a blocking `gl.readPixels`
(`WebGL2Device.ts:642-660`). `Renderer.ts` calls `readRenderTargetPixelsAsync` at
`:907,967,973,976,999,1049`.

**The only GPU path** is `presentLdrPostprocess` (`WebGL2Device.ts:555`; interface declared
`RenderDevice.ts:231`; called from `Renderer.ts:870-871` and `:987-988`).
`canFuseLdrPostprocess` (`Renderer.ts:1783-1792`) admits only `tone-mapping`, `color-grade`,
and `fxaa`, and only in `ldrFusionPassRank` order (`Renderer.ts:1794-1799`). A parallel
diagnostics copy of the same predicate lives in
`packages/rendering/src/RendererPostprocessPlan.ts:207-222` (`canFuseLdrPostprocessPlan`,
`ldrFusionPassRank`) — **both must be extended together or the diagnostics will lie.**
`RenderDevice.ts:59` also narrows `LdrPostprocessPassName` to the same three names.

**SSAO, SSR, DOF, motion blur, TAA, and bloom have no GPU implementation.** In three.js all
six are fullscreen fragment shaders.

**Visual cost.** Every frame stalls the pipeline on a synchronous readback, then burns CPU on
per-pixel JS, which forces routes to disable post-processing to stay interactive. This is why
the games read flat — `flatPixelRatio 0.9176`.

**Prior work to consume, not extend.** `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts`
(landed `e0f7e2e0`) holds exact LUTs: `createBloomBrightThresholdLut` (1-bit-per-color bitset
over all 16,777,216 RGB values, 2048×256 texels), `createBloomCompositeLut` (256×256 table
over `(source, blurred)` byte pairs), `createOutlineBlendLut` (256-entry per-channel table),
`createOutlineGradientBound` (exact integer bound split into two base-2²⁴ words), plus
`outlineLumaNumerator` and `outlineEdgeFromNumerators` as the shader-side reference. Bloom
blur needs no table: `Math.round(sum / kernelSize)` equals integer
`(2·sum + kernelSize) / (2·kernelSize)`. **Nothing consumes these outside
`tools/verify-native-ldr-luts.ts`.** Do not extend the LUT work; consume it.

CPU kernels the GPU ports must match: `extractBloomBrightPixels:1402`,
`blurBloomPixelsHorizontal:1429`, `blurBloomPixelsVertical:1458`, `compositeBloomPixels:1487`
(pipeline `["bright-extract", "horizontal-blur", "vertical-blur", "composite"]`), and the HDR
float variant `bloomFloatPixels:1531`.

- [x] **2.1** Add bloom as a fullscreen fragment-shader pass with ping-pong FBOs. Wire into
      `presentLdrPostprocess`, consuming the existing bright-threshold and composite LUTs as
      uploaded textures. Extend `canFuseLdrPostprocess` + `ldrFusionPassRank` in
      `Renderer.ts` **and** `canFuseLdrPostprocessPlan` + `ldrFusionPassRank` in
      `RendererPostprocessPlan.ts`, plus `LdrPostprocessPassName` in `RenderDevice.ts:59`.
      Note bloom is planned *before* tone-mapping by
      `createRendererPostprocessPasses` (`RendererPostprocessPlan.ts:112-117`), so it needs
      rank `-1`, not an append. HDR sources keep the existing
      `HDR_BLOOM_TONEMAPPING_REQUIRED` contract (`Renderer.ts:919`).
- [x] **2.2** Same for outline, consuming the blend LUT and the integer gradient bound
      (`outlineEdgeFromNumerators` is the exact reference for the GLSL).
- [x] **2.3** Port SSAO to a fragment shader, depth-texture driven. Depth routing already
      exists via `withRendererDepth` / `isDepthPostprocessPass` (`Renderer.ts:1801-1811`) and
      `readRendererOwnedDepthTexture` (used at `Renderer.ts:1017`).
- [x] **2.4** Port SSR.
- [x] **2.5** Port depth-of-field.
- [x] **2.6** Port motion blur. Note `missingPostprocessInputs`
      (`RendererPostprocessPlan.ts:236-250`) already reports `motion-blur:velocity` as a
      missing input — a velocity source is a prerequisite, not an afterthought.
- [x] **2.7** Port TAA.
- [x] **2.8** Keep the CPU path behind an explicit flag — the deterministic tests depend on
      it. Do not delete any `*Pixels` function.
- [x] **2.9** One pixel test per ported pass asserting GPU output matches the CPU kernel
      within a stated tolerance. One test per pass, not an exhaustive sweep. Also assert the
      plan diagnostics report `executionMode: "renderer-owned-fused-ldr-native"` and an empty
      `readbackPassNames` for the newly fused passes (`RendererPostprocessPlan.ts:186-199`).
      Bloom, outline, SSAO, SSR, and depth-of-field now have WebGL2-vs-CPU browser fixtures
      (zero-byte delta on fixed bloom/outline fixtures and ≤1-byte stated tolerance for
      normalized-depth passes) plus fused-plan assertions. Motion blur now also has an
      explicit RG32F velocity upload test, a WebGL2-vs-CPU browser fixture at ≤1-byte
      tolerance, and fused-plan assertions. TAA now carries equivalent RGBA8 history-upload,
      native-plan, and ≤1-byte WebGL2-vs-CPU evidence.

## Gap 2 (P0) — PMREM was a box blur · DONE at `606c826d`

`EnvironmentMapResources.ts:244` runs GGX importance-sampled prefiltering via the 628-line
`SpecularPrefilter.ts`. Per-level roughness comes from `specularPrefilterLevelRoughness`
instead of the old post-hoc `index / (levels - 1)`. `PMREM.ts` reports
`filterModel: "ggx-importance-sampled-equirect-prefilter"`.

- [x] Real GGX prefilter implemented
- [x] Covered by `tests/unit/rendering/specular-prefilter.test.ts`,
      `environment-map-resources.test.ts`, `shader-library.test.ts`
- [x] **2.10** Split-sum BRDF LUT. Despite its compatibility-preserving historical name,
      `generateApproximateBrdfLutPixels` performs deterministic Hammersley-sampled GGX
      split-sum integration and is asserted against independent midpoint-quadrature reference
      values plus a white-furnace energy test. Verified 14/14 focused tests on 2026-07-27.

## Gap 3 (P0) — Cascaded shadow maps are dead code · OPEN · blocks racing, runner

`CascadedShadowMaps.ts` and `shadows/CascadedShadowPipeline.ts` export `CascadedShadowMaps`,
`CascadedShadowPass`, `supportsCascadedShadowLight`. `rg -c "cascade"` returns **zero
matches** in both `Renderer.ts` and `ForwardPass.ts` (verified 2026-07-26). Consumers are
only: `packages/rendering/src/index.ts` re-export, a `CascadeSplit` *type* import in
`LightingDebug.ts`, `shadows/ShadowDebugViews.ts`, `packages/rendering/README.md`,
`docs/api/public-api.md`, `tools/external-parity-shadow-readiness/`,
`tools/external-parity-shadow-map-readiness/`, `tools/requirements-trace/`, and four tests
(`lighting-debug-cascades.test.ts`, `shadow-pass.test.ts`,
`rendering-foundation-labs.spec.ts`, `external-parity-shadow-quality.spec.ts`).

Directional shadows use a single 1024px map, giving roughly metre-scale shadow texels across
a race track — stair-stepped, swimming edges.

**DECISION (2026-07-26, owner): wire it.** Delete is cancelled.

- [x] **2.11** Wire cascades into `Renderer.ts` + `ForwardPass.ts`: frustum-split selection
      and per-cascade matrix upload. `CascadedShadowPipeline` is the implementation — do not
      rewrite it.
- [x] **2.12** Pixel test showing reduced aliasing at distance versus the single map. Shadow
      claims in `docs/api/public-api.md` stay as written **only once** this test proves
      cascades are reached from a live render path.

## Gap 4 (P0) — Root agent path disables its own optimizations · PARTIAL · blocks all four

- [x] `createProductionRendererInput` now sets `staticBatching: true, frustumCulling: true`
      (`packages/engine/src/agent-api/index.ts:10423-10424`; both were `false`)
- [x] **2.13** `createProductionRuntimeCollectedLights` (`:10240`) no longer returns a hardcoded
      3-directional-light rig regardless of scene content. It derives directional, point,
      studio, rect, and softbox direct-light descriptors from the authored snapshot, keeps
      ambient intent separate, selects one shadow caster deterministically, and uses the old
      key/fill/rim rig only as an explicitly diagnosed no-authored-direct-light fallback.
- [x] **2.14** The frozen `PRODUCTION_RUNTIME_POSTPROCESS` and
      `PRODUCTION_RUNTIME_SHADOWS` constants are removed. Production-runtime postprocess now
      responds to scene category, authored bloom, and emissive content; shadow enablement,
      1024/2048/4096 resolution, bias, strength, and PCF settings respond to the selected
      caster, scene extent, and category.
- [x] **2.15** `index.ts` is ~13.5k lines. Consider splitting as a **separate isolated
      change**, never bundled with 2.13/2.14 — bundling makes both unreviewable.
      Decision recorded 2026-07-27: defer the split to a dedicated refactor after parity
      execution; do not mix a structural rewrite into the completed behavior commits.

## Gap 5 (P1) — MSAA is only the context flag · OPEN · quality ceiling

`antialias: true` at context creation (`WebGL2Device.ts:191`), but
`rg -c "sampleCount|renderbufferStorageMultisample"` returns **zero matches** in that file
(verified 2026-07-26). FBOs use plain `DEPTH_COMPONENT24` and single-sampled colour
attachments (`:409-432`). The context flag only affects the default framebuffer, so every
scene routing through an offscreen target — which is every scene with post-processing — gets
no MSAA. Only edge AA available is the fused FXAA pass, a blur heuristic over an already
aliased image. Consistent with the measured `edgePixelRatio 0.0138`.

- [x] **2.16** Add multisampled renderbuffer support and a `sampleCount` render-target
      option, with `blitFramebuffer` resolve-to-texture. Add the WebGPU equivalent for
      backend parity.
- [x] **2.17** Diagnostic test asserting sample count, plus a pixel test on an edge.

## Gap 6 (P1) — Hard 16-light cap · CLOSED · clustered forward implemented

`MAX_DIRECT_LIGHTS = 16` (`packages/rendering/src/LightUniforms.ts:4`), packed into a fixed
`u_lightData` array of `MAX_DIRECT_LIGHTS * 4` vec4 slots (`:17`) backed by
`Float32Array(MAX_DIRECT_LIGHTS * floatsPerLight)` (`:25`). `pack()` hard-throws a
`RangeError` above the cap (`:21-22`). No clustered or deferred path. Point-light shadows
throw when the device lacks render-target pixel upload (`Renderer.ts:1196`).

A neon arena wants far more than 16 emissive sources, and the failure mode is a `RangeError`
from the render path rather than graceful degradation.

**DECISION (2026-07-26, owner): implement clustered forward rendering.** The cap is removed
properly rather than documented. This overrides the audit's own recommendation. Sequenced
**last** among the P0/P1 renderer work so the Phase 3 gate has passing pixel tests before the
multi-week item completes. **Do not silently raise the constant** — that trades a loud
failure for a quiet performance cliff.

- [x] **2.18a** Interim safety net, land early: graceful degradation. Sort by contribution,
      keep 16, emit a diagnostic naming the dropped count, so the `RangeError` at
      `LightUniforms.ts:21-22` stops being a live crash path.
- [x] **2.18b** Clustered forward: a light-cluster grid (froxel or screen-tile), a
      per-cluster light index list in a storage/texture buffer, and shader-side cluster
      lookup replacing the fixed `u_lightData` array walk — on **both** the WebGL2 and
      WebGPU backends.
- [x] **2.19** Test at the boundary (16 lights) and above it (>16), asserting diagnostics in
      the degradation path and correct shading in the clustered path.

## Gap 7 (P1) — Physics fidelity ceiling · OPEN · blocks Blockfall, Turbo Drift

`buildContact()` at `packages/physics/src/PhysicsWorld.ts:686` (called from `:330`) has
hand-written narrow-phase for six pairs only — plane↔any, sphere↔sphere, sphere↔box,
capsule↔sphere, capsule↔box, capsule↔capsule. **Everything else falls back to AABB overlap on
min-axis penetration**, including box↔box, the most common game collision pair.
`rg -c "gjk|convexHull|timeOfImpact"` returns **zero matches** across `packages/physics/src`
(verified 2026-07-26) — no convex hull, no GJK/EPA, no mesh or heightfield narrow-phase, no
CCD. `inverseInertia` is a diagonal `Vec3` (`RigidBody.ts:30`, constructed `:88`, inverted
`:264`); `applyImpulse` touches `angularVelocity` (`:155`) but the contact resolver does not
route through it, so contact resolution is purely linear and boxes will not tumble. Friction
clamps against `μ·(|Jn| + penetration)` rather than a Coulomb cone on accumulated normal
impulse.

**DECISION (2026-07-26, owner): route Blockfall Reactor and Turbo Drift Circuit through the
existing `cannon-es@0.20.0` backend.** No new native solver work. The `aura-js` narrow-phase
keeps its six pairs and its AABB fallback, documented rather than fixed. Aura Clash Arena
stays on `HitboxWorld`; Skyline Runner is unaffected.

- [x] **2.20** Record the per-game backend selection in code and in the route evidence, not
      only in the audit.
- [x] **2.21** Implement per that decision: switch Blockfall and Turbo Drift to `cannon-es`,
      confirming angular contact response and CCD are actually active on those routes.
- [x] **2.22** Tests: a box dropped on a corner must tumble; a fast mover must not tunnel.
      The route proof identifies angular contact as `cannon-es@0.20.0` and fast-body
      protection as Aura3D's explicit adaptive-substep wrapper; it does not claim native
      Cannon swept-TOI support.
- [x] **2.22b** Disclose in Phase 4 that the native `aura-js` backend remains without
      box↔box or angular contact response. Phase 2B added bounded adaptive CCD and a
      swept-bounds TOI query, so the former “no CCD” disclosure was corrected rather than
      repeated. The per-game backend choice remains stated wherever physics fidelity is
      claimed.

## Gap 8 (P1) — Duplicate OrbitControls · DONE at `606c826d`, stubs open

`packages/controls/src/OrbitControls.ts` went 25 → 176 lines and delegates all camera math to
the `@aura3d/input` engine when a camera is attached. Detached mode is documented as
bookkeeping-only, carrying no parity claim. `MapControls` delegates damping.

- [x] Consumer trap resolved
- [x] `tests/unit/controls/orbit-controls-delegation.test.ts`
- [x] **2.23** Seven exported placeholders remained in the same package, each a public export
      that did nothing. Fly, first-person, map, and pointer-lock now delegate to the input
      engines; selection is observable; DragControls and TransformControls retain functional
      explicit-delta shims with typed deprecation contracts and supported replacements.
- [x] **2.24** Re-check the inventory's `misc_controls_orbit` `"matched"` entry
      (`priority: "high"`) — it was written against the `input` implementation. Related:
      `misc_controls_transform` was also `"matched"` at `priority: "high"` while
      TransformControls lacked interactive gizmo semantics. The generator now keeps Orbit
      scoped to its delegated proof and lowers TransformControls to `"partial"` with the
      missing gizmo, picking, constraint, snapping, and space semantics named explicitly.

## Gap 9 (P1) — Features the codebase already declares missing · correctly untouched

`packages/rendering/src/EnvironmentPlatform.ts` keeps an honest ledger with a
`"missing" | "partial" | "helper"` status enum (`:29`). Notable: `exr-parser` —
"EXRLoaderThreeCompat is diagnostic-only and does not decode OpenEXR pixels" (`:260`);
`cube-camera-reflections` was a descriptor-only gap at the Phase 1 baseline and is scheduled
as 2B.3 below; `atmospheric-scattering` was missing (`:242`). Planar
reflections, scene refraction/caustics, area lights, terrain/heightfield (`:1027-1069`), and
volumetrics/god rays (`:457`) all disclosed unsupported. Ten environment presets are
`"helper"` — geometry descriptors, not rendering features.

- [x] Ledger not downgraded or deleted; nothing flipped because nothing was implemented
- [x] **2.25** If any Phase 2 task implements a ledger entry, flip its status **and** attach
      the proof in the same commit. Never flip without proof.

      Phase 2 did not implement an `EnvironmentPlatform.ts` ledger entry, so no ledger
      status was flipped. The ledger remains unchanged pending Phase 2B.

The ledger entries themselves are now scheduled as **Phase 2B** below rather than left as
permanent disclosures. Phase 2 (gaps 1-8) closes the gaps that block the games. Phase 2B
closes the remaining distance to three.js feature coverage and is **not** a Phase 3
prerequisite.

## Phase 2 exit gate

- [x] **2.26** `pnpm typecheck:raw` clean. Note: 3 pre-existing errors in
      `packages/scripting/tests/scripting.test.ts` (callbacks return `number`, expected
      `void`) are unrelated — fix or explicitly waive them.
- [x] **2.27** `pnpm test:unit` — full suite, was 328 files / 2,072 tests
- [x] **2.28** `pnpm test:packages`
- [x] **2.29** `pnpm verify:exports && pnpm verify:imports && pnpm verify:boundaries`
- [x] **2.30** `pnpm check:public-api`
- [x] **2.31** Re-run the four Phase 1 baseline commands and record the "after" column in the
      audit next to the §1 numbers.

### >>> STOP FOR REVIEW <<<
Do not begin Phase 3 until the P0 fixes (2.1-2.15) have passing pixel tests. Rebuilding games
on CPU post-processing wastes the effort.

---

# PHASE 2B — Remaining three.js feature coverage · EXECUTED

Everything above closes the nine audited gaps. That is not the same as three.js feature
parity. This phase schedules the features `EnvironmentPlatform.ts` currently declares
`"missing"` or `"partial"`, plus the physics limits the Gap 7 decision left in place.

Current ledger census: **0 `"missing"`, 2 `"unsupported"`, 2 `"partial"`, 10 `"helper"`, 8
`"implemented"`.** The
10 `"helper"` entries are deliberately **not** scheduled here — each is working reusable
geometry or telemetry whose `gap` string is already accurate. Promoting one is a judgement
call, not a queued task. The eight `"implemented"` entries are backed by their attached
unit/browser proof: cubemap, equirectangular, PMREM, scene-space transmission, RGBE HDR file
loading, cube-camera reflection, depth-aware volumetric light, and terrain heightfield
geometry. The original baseline was zero implemented entries and is what 2B.20 measures
against.

**Sequencing.** Phase 2B is **not** a Phase 3 prerequisite. None of the four games need these
features. Run it after Phase 3 ships, or in parallel by a second track that does not touch
`Renderer.ts` / `ForwardPass.ts` while gap 1/3/6 work is in flight.

**The 2.25 rule binds every task here.** Each task flips exactly one ledger status and must
attach its proof in the same commit. Flipping `"missing"` → `"implemented"` without a pixel
test is the single worst failure mode in this file. If a task lands only partially, set
`"partial"` and rewrite that entry's `gap` string to say precisely what is still absent.

Where an entry's `requiredForAcceptedClaim` string offers "or document as unsupported" as an
alternative, taking that branch is a legitimate completion — but it must be an explicit
recorded choice, not silence.

## 2B-A — Ledger entries currently `"missing"` (3)

- [x] **2B.1** `atmospheric-scattering` (`EnvironmentPlatform.ts:242`) — no reusable
      Rayleigh/Mie sky shader is exposed. Implement a physical sky shader with sun position
      driving in-scattering, or take the documented-unsupported branch. Today's
      `procedural-sky-dome` is a colour-gradient dome (`:266-268`), which is why this is
      `"missing"` and that one is `"helper"`. Large. Prerequisite for any credible outdoor
      route. Test: pixel test showing sky colour changing with sun elevation. The
      documented-unsupported branch was taken: the ledger now distinguishes
      `"unsupported"` from queued `"missing"` work, the accepted-claim boundary explicitly
      excludes physical atmosphere/Rayleigh/Mie/sun-driven scattering, and the capability
      report/unit test records `unsupportedCount: 1`.
- [x] **2B.2** `exr-parser` (`:260`) — `packages/assets/src/EXRLoader.ts` is **1 line** and
      `packages/assets/src/loaders/EXRLoader.ts` is **10 lines**; both are diagnostic-only
      re-export shells that decode no OpenEXR pixels. Implement real EXR decode (at minimum
      uncompressed + ZIP/PIZ half-float scanline) or document EXR as unsupported and remove
      the loader shells so they stop implying capability. Medium. Test: decode a fixture and
      assert pixel values against a known reference. The documented-unsupported branch was
      taken: both assets-package shells and exports were removed, the ledger status is now
      `"unsupported"`, and the remaining HDR test/readiness path uses a real retained HDR
      fixture without implying EXR decode.
- [x] **2B.3** `cube-camera-reflections` (`:261`) — `packages/rendering/src/ReflectionProbe.ts`
      is **13 lines**, a pure descriptor. Implement live six-direction cube capture into a
      render target plus reflective material binding, then wire it through
      `ReflectionSurfaces.ts` (219 lines). Large; depends on MSAA/render-target work from
      2.16. Note this entry is also the declared fallback for three separate unsupported
      requests — `reflective-floor` (`:1026-1032`), `cube-camera-reflection` (`:1047-1053`),
      and `planar-reflection` (`:1054-1060`) — so implementing it unblocks all three.
      Test: pixel test showing a moving object appearing in a reflective surface.
      Implemented with `CubeCameraReflectionCapture`: six canonical camera targets, optional
      MSAA, face readback into a real cube texture, validated PBR environment binding, and
      `ReflectionSurfaces` ownership/report wiring. The browser test moves one rendered
      object between captures and verifies the reflective PBR sphere's pixel region changes.

## 2B-B — Ledger entries currently `"partial"` (6)

Each of these has working renderer code and no accepted route/screenshot proving it. Several
are closer to "needs a proof route" than "needs implementation" — read the `gap` string before
assuming code is missing.

- [x] **2B.4** `cubemap-renderer` (`:227-232`) — path exists via `EnvironmentBackgroundPass`;
      needs a gallery route and screenshot proving six-face visual sampling. Small.
      Added the advanced-gallery `cubemap-six-face-proof.html` route. Six WebGL canvases
      render the same cube texture through canonical ±X/±Y/±Z cameras; the browser gate
      asserts six distinct backbuffer colors and saves/validates a full-page screenshot.
- [x] **2B.5** `equirectangular-projection` (`:233-237`) — same shape; needs panorama
      background route proof. Small.
      Added the advanced-gallery `equirect-panorama-proof.html` route. One directional 2:1
      texture renders through three camera yaws; the browser gate asserts distinct center
      and horizon backbuffer pixels and saves/validates a full-page screenshot.
- [x] **2B.6** `pmrem-generator` (`:238-241`) — GGX prefilter now real as of gap 2, but the
      entry's `gap` says the audit is "explicitly bounded and not Three.js parity". Prove
      material roughness response against stable HDR route screenshots. Pairs naturally with
      2.10 (the split-sum BRDF LUT). Small-medium.
      The existing runtime PMREM parity artifact meets this bar: four metallic spheres span
      roughness 0.02→0.74 under `studio_small_08_1k.hdr`, cubemap mip variance decreases,
      bounded A3D/Three.js deltas pass, and 15 high-resolution screenshots/diffs are
      validated. The gate now explicitly asserts the retained HDR URI and swatch values.
- [x] **2B.7** `linear-fog` (`:246-250`) — uniforms bound in `Renderer.ts`/`ForwardPass.ts`;
      needs a visual gate before claiming three.js `Fog` parity. Small.
- [x] **2B.8** `exponential-fog` (`:251-255`) — same; needs a `FogExp2`-equivalent visual
      gate. Small. Do 2B.7 and 2B.8 together.
      Two focused advanced-gallery attempts were made for Robotics Lab (linear) and Fog
      Cathedral (exponential-squared). Attempt 1 stopped on authored-resource 404 console
      errors; after exposing the underlying state, attempt 2 showed both routes at
      `authoredAsset.status: "error"` before the fog on/off screenshot-delta capture.
      A later explicitly requested remediation used a deterministic renderer-owned harness
      with synthetic PBR cubes and no authored-asset dependency. WebGL2 now compares no-fog,
      linear, and exponential-squared canvases, proves more than 1,000 changed pixels for
      each fog mode plus a distinct linear/exp2 result, and retains a full-page screenshot.
      Both ledger entries are now `"implemented"` at rendering-internal scope.
- [x] **2B.9** `rgbe-hdr-parser` (`:256-259`) — decode works
      (`parseProductionRadianceHDR`, `decodeRgbeEnvironmentMap`) but public
      `HDRLoaderThreeCompat` is diagnostic-only. Expose an end-to-end public HDR
      file-to-environment loader path. Medium.
      Added root-exported `loadProductionHdrEnvironmentFile` for URL and Blob inputs with
      injectable fetch, HTTP validation, disposal, and renderer-ready equirect/cubemap
      PMREM/BRDF resources. Unit tests use the real retained HDR fixture; browser proof
      fetches it through the public root API and renders an HDR-lit metallic sphere.

## 2B-C — Features disclosed unsupported outside the status enum

These are `unsupported(...)` fallbacks in `resolveEnvironmentFeatureRequest` and limitation
strings, not ledger statuses. Same proof rule applies to the strings.

- [!] **2B.10** `rectangular-area-light` (`:1040-1046`) — softbox presets use emissive panels;
      true rectangular area-light shading (three.js `RectAreaLight` + LTC) is absent. Medium.
      Would also improve `indoor-studio-stage` (`:275-277`) and `analytical-studio-box`
      (`:243-245`), both of which name area-light limits in their `gap` strings.
      Two implementation/test attempts were made. Attempt 1 exposed stale softbox
      unsupported assertions plus signed-zero direction comparisons; attempt 2 still stopped
      on the packed uniform assertion distinguishing `-0` from `0` before browser proof.
      Per Rule 0 the unverified partial implementation was removed and the disclosure stays.
- [x] **2B.11** `terrain-heightfield` (`:1033-1039`) — falls back to outdoor backdrop
      geometry. Implement reusable terrain/heightfield generation. Medium. Pair with the
      physics heightfield narrow-phase in 2B.14 — a terrain you cannot collide with is half a
      feature.
      Implemented `createTerrainHeightfieldGeometry` on the rendering subpath: deterministic
      samples become indexed PBR-ready geometry with computed normals, tangents, UVs, bounds,
      and a cell-aligned collider descriptor reserved for 2B.14. Terrain environment presets
      now attach the generated mesh and report the new implemented capability instead of the
      old unsupported fallback. Focused unit proof passed 35/35; WebGL2 browser proof rendered
      the 48×36 heightfield with 3,906 non-background pixels and the expected 3,290 triangles.
      Native collision response, terrain streaming, erosion, and clipmap LOD remain excluded.
- [x] **2B.12** `transmission-refraction` (`:1061-1067`) — no scene-space refraction, caustics,
      or background ray marching. A distinct feature from the `KHR_materials_transmission`
      uniform support that already exists; do not conflate them. Large.
      Promoted and hardened the production-runtime scene-color path: WebGL2 and WebGPU now
      capture an opaque-only backdrop, exclude transmissive objects from recursive
      self-sampling, generate roughness mips, and bind only transmission materials. The
      textured PBR pass samples that backdrop with IOR-driven screen offsets. Focused proof
      passed 81/81 unit checks and a two-canvas WebGL2 pixel test comparing zero offset with
      visible refraction. This is bounded screen-space transmission, not depth ray marching,
      off-screen recovery, recursive refraction, physical caustic projection, or a root
      `createAuraApp` claim.
- [x] **2B.13** Volumetrics / god rays / participating media (`:455-458`, and
      `volumetric-weather-enclosure` `:269-271`). Large. Depends on 2.3's depth-texture
      routing.
      Added the public rendering-subpath `volumetricLightPixels` kernel and
      `Renderer.postprocess.volumetricLight` pass. The renderer allocates/routes its
      sampleable forward depth texture, then performs radial participating-media integration
      from a normalized screen-space light with depth occlusion, configurable density,
      decay, weight, exposure, color, and sample count. Focused proof passed 152/152 unit
      checks and a WebGL2 two-canvas pixel gate with more than 500 changed pixels, more than
      250 warm scattering pixels, and depth-backed occluder/light contrast. This is bounded
      radial god-ray rendering, not volumetric clouds, froxel lighting, shadow-volume
      integration, multiple scattering, physical atmosphere, or root `createAuraApp`.

## 2B-D — Native physics limits the Gap 7 decision documented rather than fixed

The Gap 7 decision routed Blockfall and Turbo Drift to `cannon-es` and left `aura-js` as-is.
That is correct for shipping the games and leaves the native solver permanently behind. These
tasks close it. Do **not** start them before 2.20-2.22 have shipped — the decision stands
until the games work.

- [!] **2B.14** Extend `buildContact()` (`packages/physics/src/PhysicsWorld.ts:686`) past its
      six analytic pairs — plane↔any, sphere↔sphere, sphere↔box, capsule↔sphere, capsule↔box,
      capsule↔capsule — after which it falls through to the AABB overlap path at `:740`.
      Priority order: box↔box first (most common game pair, currently on that AABB fallback),
      then convex hull via GJK/EPA, then mesh and heightfield. Large.
      Two focused implementation/proof attempts were made. The branch added 15-axis rotated
      box SAT, convex-hull GJK/EPA, and triangle-backed mesh/heightfield contacts. Convex,
      mesh, and heightfield cases emitted contacts, but the required first-priority rotated
      box↔box case emitted no contact even after the second attempt moved the bodies into
      deep overlap; the 70 existing focused physics checks remained green. Per Rule 0 the
      unverified task changes were removed. Native box↔box remains on the AABB fallback, and
      convex-hull/heightfield shape additions remain unshipped.
- [!] **2B.15** Route contact impulses through `angularVelocity` so contacts generate torque.
      `applyImpulsePair` (`PhysicsWorld.ts:452-464`) writes only linear velocity on both
      bodies, even though `RigidBody.applyImpulse` (`:155`) does apply angular response — so
      the solver is the gap, not the body. Test: a box dropped on a corner must tumble on the
      **native** backend, not just `cannon-es`. Medium.
      Two contact-point/effective-mass solver attempts were made. The new off-center native
      box test generated angular velocity, but attempt 1 prevented the stable three-box stack
      from sleeping and regressed capsule↔sphere settling. After removing per-impulse wake
      resets and using the sphere surface point, attempt 2 still regressed
      capsule↔capsule settling from `[0, 0]` to residual x velocities
      `[0.015385, -0.015385]`. Per Rule 0 the solver changes and new test were removed;
      contact impulses remain linear-only.
- [x] **2B.16** Replace the friction clamp at `PhysicsWorld.ts:436` — currently
      `μ·(|Jn| + penetration)`, which mixes a penetration depth into an impulse bound — with a
      proper Coulomb cone on accumulated normal impulse. Medium.
      Implemented per-step accumulated normal and tangent impulses for the native solver. The
      tangent impulse is projected onto `|Jt| <= μ·Jn`, with no penetration-depth term. Focused
      tests prove identical friction for shallow/deep contacts and for one/eight solver
      iterations; supported-sliding, stress-scene, typecheck, build, exports, public-API, and
      claims gates pass.
- [x] **2B.17** CCD / time-of-impact. `rg "timeOfImpact"` returns zero matches across
      `packages/physics/src`. Medium.
      Added the exported conservative swept-bounds `timeOfImpact(...)` query and enabled the
      existing adaptive-substep CCD contract on the native backend as well as `cannon-es`.
      Native substeps preserve accumulated forces and outer-step interpolation history. A
      240-unit/s native box no longer tunnels through a 0.1-unit wall; exact hit/miss TOI,
      force-history, focused physics, API-doc, typecheck, build, exports, public-API, and
      claims checks pass. The full unit run reached 2,147/2,150 before the generated API-doc
      refresh; its other two failures were unrelated retained racing visual-evidence checks.
- [x] **2B.18** Full inertia tensor instead of the diagonal `inverseInertia: Vec3`
      (`RigidBody.ts:30`, built from three principal moments at `:88`), if 2B.14-2B.15 prove
      the diagonal insufficient for angular correctness. Assess before committing.
      Assessed with no implementation. 2B.14 and 2B.15 did not land, and the failed native
      angular-contact attempt used isotropic inertia; its regressions were contact
      stability/settling failures, not evidence that diagonal principal moments caused the
      error. A tensor rewrite would not fix the current linear-only contact impulse path, so
      it remains deferred until angular contacts are stable and a rotated anisotropic-body
      test demonstrates the need.

## Phase 2B exit gate

- [x] **2B.19** Every ledger entry touched has its status flipped **and** proof attached in
      the same commit. Every entry left unimplemented has an accurate `gap` string.
      Audited the Phase 2B commits and current capability table. Every promotion or explicit
      unsupported decision shipped with its unit/browser proof. The fog entries remain
      `"partial"` with visual-proof gaps, area lighting remains disclosed unsupported, and
      the terrain entry now explicitly records that 2B.14 did not land native heightfield
      collision response. The 24 focused ledger/reflection/volumetric checks and typecheck
      pass.
- [x] **2B.20** `createEnvironmentCapabilityReport()` counts (`:299-310`) move in the expected
      direction. `implementedCount` rising with no new pixel tests is a red flag, not
      progress.
      Verified the source report and its exact unit assertion: 22 requested, 8 implemented,
      2 partial, 10 helper, 0 missing, and 2 explicitly unsupported. Relative to the original
      20-entry baseline, implemented moved 0→8, missing 3→0, partial 6→2, helper 11→10, and
      unsupported 0→2. Every implemented promotion has browser pixels; the two additions are
      the separately scoped transmission and terrain capabilities.
- [!] **2B.21** Re-run the Phase 2 exit gate commands (2.26-2.31).
      Re-run twice. `typecheck:raw`, 81/81 package tests, exports, imports, boundaries, and
      public-API checks pass. The full unit suite reaches 333/334 files and 2,148/2,150
      tests; both failures are the same retained racing visual-QA assertions in
      `tests/unit/tools/game-visual-qa.test.ts`. Per Rule 0 this exit gate is recorded
      blocked rather than attempting a third variation. The four Phase 1 commands were also
      re-run: inventory remains 54 entries/53 matched/1 partial, same-scene remains 54/0/0,
      performance remains honestly non-passing with the same six missing reports, and
      visual-quality remains green on the same retained capture metrics.
- [x] **2B.22** Phase 4 doc pass for anything 2B changed — in particular, remove the native
      physics disclosure from 2.22b **only** if 2B.14-2B.17 actually landed.
      Updated the canonical known limits, audit, physics concept/runtime docs, and lower-level
      environment/postprocess docs. Native CCD and Coulomb friction are now documented
      without erasing the still-open oriented narrow-phase and angular-contact limits.
      Rendering additions remain explicitly `rendering`/`production-runtime` scoped; EXR,
      physical atmosphere, area lights, physical caustics, fog pixels, and native terrain
      collision remain excluded.

### What is still not claimable even after Phase 2B

Phase 2B closes feature coverage. It does not produce a "better than three.js" claim.
`benchmark/rubric.md` requires ≥7/10 prompts per agent, ≥2 wins from prompts 7/8/10, ≥4 visual
scores ≥4 and none <3 — adjudicated externally, since internal tools "cannot score visual
quality, decide wins, or certify release readiness." No task in this file can satisfy that.
Superiority claims stay out of docs and marketing regardless of how much of 2B ships.

---

# PHASE 3 — Rebuild the four games · ALL OPEN

Zero work has been done here.

| Game | Path | LOC | Core problem |
|---|---|---|---|
| Aura Clash Arena | `apps/aura-clash-showcase/` | 10,146 | Stage/lighting/atmosphere are DOM + CSS; mounts `A3DRenderer.create()` from `advanced-runtime`, not `createAuraApp`. 2 skinned GLB rigs, 22 typed assets, 46 scripts, 6 HTML routes |
| Blockfall Reactor | `apps/showcase-blockfall-reactor/` | 1,951 | 100% primitives (31 occurrences), `"primaryAssets": []`, no `package.json`. Single 1,174-line `main.ts` + 777-line `rules.ts` |
| Turbo Drift Circuit | `apps/showcase-turbo-drift-circuit/` | 965 | Thin (`main.ts` 348); "ghost opponent" is a second `game.racing` at progress offset 0.28, not AI |
| Skyline Runner | `apps/showcase-skyline-runner/` | 1,374 | Thin (`main.ts` 335); mirrors Turbo Drift. No `package.json` |

All four write a `window.__AURA3D_SHOWCASE_*__` / `__AURA_CLASH_ARENA_PROOF__` global plus a
`route-health.json`. Turbo Drift and Skyline additionally carry
`showcase-evidence-checklist.json`, `showcase-spec-compile-report.json`,
`route-gate.patch.json`, and `game-template/*-asset-pair-composition.json`. Gate runner is
`node tools/showcase-library/build-and-check.mjs`. Aura Clash has a parallel apparatus under
`launch-evidence/` with ~30 of its own scripts.

## 3A — Blockfall Reactor · highest priority

`route-health.json:15` declares `"primaryAssets": []` while the route is publicly promoted as
a named game on the marketing homepage and showcase index. Every visible element — locked
cells, active piece, ghost piece, board rails, cabinet, reactor tube, grid lines — is
`primitives.box/cylinder/sphere/torus`. It imports root-only (`camera`, `createGameApp`,
`effects`, `game`, `lights`, `material`, `primitives`, `scene`, `ui`) and drives state through
`GameFallingBlocksSnapshot`.

The Primitive Boundary in `docs/agents/claims-and-boundaries.md`: "Primitives are not allowed
as the primary character, vehicle, product, creature, weapon, world, hero object, or primary
environment for a named real-world or game prompt. With the asset catalog available, a named
object should start from a real typed GLB/glTF asset. A primitive-only public showcase must be
labeled abstract visualization or blocked."

- [x] **3.1** Choose and state: (a) source typed GLB assets through the CLI — `assets search`
      then `assets resolve`, **never invent ids** — or (b) relabel the route as abstract
      visualization.
- [x] **3.2** Execute the choice.
- [x] **3.3** Add `apps/showcase-blockfall-reactor/package.json`.
- [x] **3.4** Split the 1,174-line `main.ts`.
- [x] **3.5** Regenerate `route-health.json` by rerunning the evidence command — per
      `apps/AGENTS.md`, "Do not turn route-health JSON into the source of behavior; update the
      route and rerun the evidence command instead."

## 3B — Aura Clash · replace DOM chrome with rendered geometry

`src/playable/arena/AuraClashArenaStage.ts` defines the arena as ~20 DOM elements keyed by CSS
selector (`.aca-sky`, `.aca-portal`) across layers named `backdrop` / `lighting` /
`atmosphere`, each carrying an `evidenceKey` like `stage.skyGradient`, backed by a 1,078-line
stylesheet (`src/playable/playable.css`). The DOM And CSS Boundary forbids CSS/DOM/canvas
overlays as "substitute scene geometry" or as "screenshot evidence for renderer capability,"
and equally forbids fake particles, bloom, trails, lighting, labels, shadows, explosions.

Imports span four entry points: root `@aura3d/engine`, `advanced-runtime` (`A3DRenderer`),
`production-runtime` (`createSideViewGameRenderPreset`, `createTypedGLBActor`), `rendering`
(`Geometry`, `PBRMaterial`, `UnlitMaterial`), plus `@aura3d/scene`, `@aura3d/animation`.
Fighters are `createTypedGLBActor({ asset: assets.auraClashPlayerRig })` and
`assets.auraClashRivalRig`; the manifest holds 22 ids including `arenaNeonDowntown` (16.4 MB),
`auraClashDuelStage`, six named fighter GLBs, ten Kenney SFX. Live app is
`playable/AuraClashArenaApp.ts` (2,622 lines).

Real subsystems to build **on**, not replace: `src/animation/` (state machine, per-fighter
profiles, inertialized blending, fallback pose), `src/fighters/` (combo, guard-break, hitbox,
knockdown-recovery, six definitions), `src/state/` (event bus, loop, hit registry, match
state, save state), `src/rendering/` (lighting, postprocess, `HitSparkVfx.ts`), `src/ui/`
(title, character select, HUD, pause, results), `src/arenas/`.

- [x] **3.6** Replace the ~20 DOM stage elements with rendered geometry. Keep DOM for UI only.
- [x] **3.7** Prune `playable.css` to UI-only rules.
- [x] **3.8** Resolve the parallel scene path. `src/scenes/` is `createFightScene.ts` (38),
      `createFighterNodes.ts` (61), `createStageScene.ts` (20), `index.ts` (3). It imports
      `primitives` and reads as dead alongside the live `AuraClashArenaApp.ts` — but
      `src/evidence/evidenceModel.ts` references it, so **confirm before deleting.**
- [x] **3.9** Migrate off `advanced-runtime` `A3DRenderer` to `createAuraApp` if a root claim
      is wanted; otherwise keep the label lowered and say so.
- [x] **3.10** Full control surface A/D/S/Space/Shift/Q/J/K/L/P/R; combat halts after KO until
      reset; debug rigs and hitboxes behind explicit debug mode; no primitives as
      release-facing fighter art.
- [x] **3.11** Keep the fixed copy boundary from `docs/agents/game-showcase-build.md`:
      "Aura Clash Arena is a development showcase proving Aura3D browser runtime mechanics
      with typed GLB assets, input, animation state, combat evidence, screenshots, and
      deployment checks." Banned: "polished flagship fighting game", "Unity replacement",
      "Unreal competitor", "Babylon.js parity", "The AI prompt catalog always finds
      production-ready fighters." Keep "development showcase" / "runtime proof" scoping until
      gameplay, asset, art, audio, performance, deployment, and visual-approval gates pass.
- [!] **3.12** Regenerate `launch-evidence/` (~30 scripts). Two complete local-workflow
      attempts were made on 2026-07-27. The second passed all 22 playable browser tests, then
      stopped because the legacy `/poster/` route has no heading matching `Aura Clash` and
      the legacy `/evidence/` route has no `Runtime evidence` text. Per Rule 0, the failed
      `local-gates.json` and `workflow.json` retain the exact command evidence; do not attempt
      a third variation in this task.

## 3C — Turbo Drift Circuit

Certified pair: `showcaseKenneyRaceCarRed` (`role: "primaryVehicle"`) +
`showcaseKenneyNeonRaceCircuit` (`primaryTrack`), both `quality: "release"`, driven by
`game.assetBoundRacingRoute`, `game.racingSceneBinding`, `game.racing`,
`game.racingCameraRig`, `game.racingPresentationTrack`. Generated contract:
`src/generated/game-geometry.ts` (617 lines). Pair-composition report currently carries
`verdict: "pass"`.

- [x] **3.13** Real opponent AI replacing the progress-offset ghost.
- [x] **3.14** Deepen visuals **without** breaking the certified pair or its retained
      composition report.
- [x] **3.15** Tests for movement, restart, and at least one lap/checkpoint mechanic.

## 3D — Skyline Runner

Certified pair: `showcaseKenneyOobiPlatformerHero` (`primaryCharacter`,
`targetHeight: 0.44`) + `showcaseKenneyVerdantPlatformerWorld` (`primaryWorld`), via
`game.platformerPresentationSurfaces`. Exposes `window.__AURA3D_COMPOSITION_PROBE__`.
Generated contract: `src/generated/game-geometry.ts` (787 lines).

- [x] **3.16** Deepen gameplay beyond the 335-line `main.ts`.
- [x] **3.17** Add `apps/showcase-skyline-runner/package.json`.
- [x] **3.18** Tests for movement, restart, and at least one checkpoint/collection mechanic.

## Every game must have (`docs/agents/game-showcase-build.md`)

Apply as a per-game checklist — "A route is not a game claim just because it has a 3D scene
and key listeners." Screenshots prove only what is visible.

- [x] **3.19** Keyboard input that visibly changes state
- [x] **3.20** An objective
- [x] **3.21** Scoring or a fail condition
- [x] **3.22** Reset
- [x] **3.23** A progression loop
- [x] **3.24** Typed primary assets unless explicitly abstract
- [x] **3.25** Automated tests for movement, restart, and ≥1 win/fail/scoring/lap/checkpoint/
      line-clear/collection mechanic
- [x] **3.26** `route-health.json` naming primary assets, primitive count, renderer mode,
      fallback mode, claims
- [x] **3.27** Registration/routing consistent across `apps/showcase-index/index.html`,
      `vercel.json`, `marketing/scripts/build-showcase-routes.mjs`,
      `scripts/check-route-metadata.mjs`
- [x] **3.28** `node tools/showcase-library/build-and-check.mjs` passes (7/7 candidates)
- [x] **3.29** If game helpers changed, update `templates/racing-starter/`,
      `templates/falling-blocks-starter/`, `templates/mini-game/`, `templates/game-slice/`,
      and the `packages/create-aura3d/templates/{racing-starter,falling-blocks-starter,
      fighting-game,mini-game,character-controller}/` copies. No shared game helper changed
      in Phase 3; route-local implementations required no template-copy update.

## Anti-patterns that fail review

- [x] **3.30** No `three`, `three/examples/...`, `GLTFLoader`, `OrbitControls`, hand-rolled
      renderer loops, or raw loader code in public routes, templates, examples, README
      snippets, or agent docs. No `new THREE.Scene()` / `new THREE.WebGLRenderer(...)`.
- [x] **3.31** No `model("id")`, `model("/path/model.glb")`, raw `.glb`/`.gltf` URLs, guessed
      sample-model URLs, or `unsafeModelUrl(...)` in safe public examples. Do not invent ids.
- [x] **3.32** DOM/CSS/canvas overlays are UI only — never fake particles, lighting, shadows,
      trails, explosions, and never rendering evidence.
- [x] **3.33** Do not claim a reusable falling-block or generic collision kit.

---

# PHASE 4 — Docs · ALL OPEN

Update claim wording **only where new evidence exists**. Where proof is absent, **lower the
label**. Never broaden.

Not claimable for root, per the explicit list: production renderer parity or
"Three.js-quality" rendering, full PBR parity, HDR/IBL/PMREM/tone mapping/high-quality
shadows, pixel-backed bloom/SSAO/DOF/FXAA/TAA/color grading, native WebGPU, skinned GLB
animation in screenshots, morph targets in screenshots, production-quality
character/racing/platformer/falling-block/collision kits.

Note: `CHANGELOG.md`, `GoLiveCheckList.md`, `marketing/index.html`,
`marketing/src/styles.css` and 5 `docs/` files were modified and committed at `e0f7e2e0`.
Marketing was supposed to come last — re-verify those edits still match the evidence that
exists.

- [x] **4.1** Claims and boundaries first, these gate everything else:
      `docs/agents/claims-and-boundaries.md`, `docs/project/known-limits.md`,
      `docs/project/claim-guidelines.md`, `docs/project/product-boundaries.md`,
      `docs/agents/rendering-proof-required.md`, `docs/agents/anti-hallucination-rules.md`,
      `docs/agents/no-hackjob-rules.md`, `docs/agents/game-example-standards.md`,
      `docs/agents/verification.md`, `llms.txt` + `public/llms.txt`,
      `.cursor/rules/aura3d.mdc`, `AGENTS.md`, `Fixed-Needed-PRD.md`
      Audited every named file. Root, production-runtime, rendering, physics-package, game,
      and performance scopes now remain distinct. Broad skinned/morph support stays blocked
      while named root routes may cite their exact pixels; native physics additions do not
      erase oriented/angular gaps; and Turbo/Skyline public-ready wording is lowered while
      current racing visual QA is non-passing. The two `llms.txt` copies are byte-identical.
      Agent-doc, codeblock, claims, and docs-site checks pass.
- [x] **4.2** Rendering / API: `docs/rendering/postprocess.md`, `environment-lighting.md`,
      `skinning-and-morphs.md`, `material-matrix.md`, `renderer-lifecycle.md`,
      `webgpu-fallback.md`, `docs/concepts/rendering.md`, `docs/concepts/physics.md`,
      `docs/concepts/animation.md`, `docs/physics/runtime.md`,
      `docs/animation/runtime-support.md`, `believable-motion.md`, `docs/api/public-api.md`,
      `docs/api/game-runtime.md`, `docs/api/app-api.md`, `docs/api/assets.md`,
      `docs/project/public-api-contract.md`
      Audited every named file and regenerated the public API contract. Rendering-internal
      RGBE/PMREM and bounded transmission proof no longer reads as root support; WebGPU
      remains route-, backend-, and device-evidence-bound; animation names the exact root
      bridge/morph browser proofs while keeping those claims asset-specific; inertialized
      transitions and lower-level physics are described at package scope. The focused docs
      tests, API-doc verifier, full build/public-export audit, agent-doc check, codeblock
      check, and claim registry all pass.
- [!] **4.3** Status / release: `docs/project/current-state.md` — it fixes 7/7 public
      route-library count, 2 internal diagnostics, 2 game-layer harnesses, 0
      prototype-blocked; **do not silently break those numbers**. Plus `CHANGELOG.md`,
      `GoLiveCheckList.md`, `docs/project/release-checklist.md`,
      `showcase-quality-gates.md`, `showcase-visual-quality-standard.md`,
      `library-gap-roadmap.md`, `docs/project/apps-classification.md`
      Audited every named file without changing the configured 7/7, 2, 2, and 0
      inventory. The docs now distinguish that route-library sub-gate from the held
      overall release, preserve 2026-07-23 deployment receipts as historical, lower
      Turbo/Skyline to blocked while the retained racing screenshot hash is stale, and
      prohibit performance/parity promotion with six missing report inputs. Governance
      and version tests, docs-site browser checks, agent docs, codeblocks, claims, and
      marketing-truth all pass. Blocked under Rule 0 after
      `production-runtime:truth` failed twice: its legacy failure-audit still requires
      eight retired exact phrases across status docs (canvas-painted/mock-renderer/
      hardcoded-score/`page.setContent` terminology and related strings). No third
      wording/tool variation was attempted.
- [!] **4.4** Per-game: root `README.md`, each `apps/*/README.md`,
      `docs/project/aura-clash-showcase.md`, `docs/agents/game-showcase-build.md`,
      `docs/examples/fighting-game.md`, `docs/guides/build-a-browser-game.md`
      Audited the root README, all present app READMEs, and all four named game
      docs. Aura Clash now names its root plus lower-level package surfaces;
      Turbo/Skyline are held; Material Inspector is unpromoted; retained
      WebGPU/gallery claims stay lower-level; and the app classification catalog
      names every current directory literally. `game-runtime:docs` passes with
      `releaseReady: false`. Blocked under Rule 0 after two app-registry
      verification attempts: the first inner-check invocation lacked its
      Playwright report and exposed the incomplete literal catalog; after that
      catalog was corrected, the proper `check:examples` wrapper failed because
      the `hello-world-typed-asset` screenshot measured `cyanPixels: 0` where
      `>16` is required. No third visual/threshold variation was attempted.
- [x] **4.5** Marketing **last**, only after evidence lands: `marketing/index.html`
      (~lines 178, 234-280, 511, 564-575 carry the version claim, the Aura Clash pitch, the
      "seven distinct route-library examples" count, per-game tiles),
      `marketing/docs/claims.html`, `marketing/docs/aura-clash.html`,
      `marketing/docs/evidence.html`, `marketing/sections/aura-clash-homepage.html`,
      `apps/showcase-index/index.html`
      Audited every named surface after the docs pass. Marketing now labels 7/7
      as a configured route-library sub-gate, overall promotion as held,
      Turbo/Skyline as held, and Aura Clash as a development showcase. Package
      copy scopes WebGPU/96-joint evidence to lower-level/emulated paths, names
      RGBE while keeping OpenEXR unsupported, and names the actual physics
      backends. Marketing truth, link audit, the full marketing/showcase build,
      responsive docs-site browser checks, and the claim registry all pass. No
      production deployment was made by this source-audit task.
- [x] **4.6** `docs/comparisons/` and `docs/benchmarks/` only if a real benchmark exists
      Not applicable: the current comparative performance report is `pass:
      false` with all six required evidence inputs missing, the retained
      comparative verdicts remain non-passing, and the 54/54 inventory is not a
      performance measurement. Per the task condition, no comparison or
      benchmark prose was raised or refreshed.
- [x] **4.7** `pnpm check:agent-docs && pnpm check:docs-codeblocks &&
      pnpm check:marketing-truth && pnpm check:marketing-links && pnpm verify:claims`
      Exact command chain passes. The claim registry scanned 51 governed files
      with 0 violations.
- [x] **4.8** Closing summary: every claim raised with its proof, every claim lowered with why

      Claims raised, with the narrowest proven scope:

      - **Rendering internals / production-runtime:** six-face cubemaps,
        equirectangular backgrounds, bounded GGX PMREM under the retained RGBE
        fixture, the root-exported HDR file loader, generated terrain geometry,
        bounded scene-color transmission, and depth-aware radial volumetric
        light. Each is tied to its focused unit/browser-pixel gate recorded in
        2B.4-2B.6 and 2B.9-2B.13; none is generalized to root renderer parity.
      - **Root animation, named fixtures only:**
        `createAuraApp-animation-bridge-contract.spec.ts` proves the tested
        skinned asset/pose deltas, and `createAuraApp-morph-targets.spec.ts`
        proves the tested morph asset/influence pixels. Neither becomes an
        arbitrary-rig or broad character-pipeline claim.
      - **`@aura3d/physics`:** native accumulated Coulomb friction is backed by
        the focused friction/iteration tests from 2B.16; conservative
        `timeOfImpact(...)` and adaptive-substep CCD on `aura-js` and
        `cannon-es` are backed by the fast-wall, hit/miss, force-history, API,
        typecheck, build, export, and claims gates from 2B.17.
      - **Configured showcase inventory:** the latest route-library producer
        reports 7/7 configured candidates, with two internal diagnostics, two
        game-layer diagnostic harnesses, zero prototype-blocked routes, and the
        index handled separately. Docs and marketing label 7/7 as a sub-gate,
        not an overall release verdict.

      Claims lowered, with the missing or failing proof:

      - **Root rendering/PBR/HDR/IBL/PMREM/postprocess/shadow/WebGPU parity**
        remains unclaimed because the new proof is lower-level or
        route-specific; real-device WGSL and root-default WebGPU remain
        evidence-bound. OpenEXR and physical atmosphere remain unsupported.
      - **Broad skinned/morph/animation support** remains unclaimed because the
        passing root browser evidence covers named assets/fixtures, not
        arbitrary rigs, clips, or facial pipelines.
      - **Native production physics** remains unclaimed because oriented
        box/convex/mesh/heightfield narrow-phase and angular contact impulses
        did not survive their two Rule 0 attempts. The diagonal inertia tensor
        was correctly left conditional. Game docs name `cannon-es` where route
        fidelity depends on it.
      - **Turbo Drift Circuit and Skyline Runner public-ready status** is held:
        the required retained racing visual-QA unit test is red on a stale
        screenshot hash, and Skyline's world-level proof remains
        fixture-bounded. Their topology/geometry/gameplay evidence is retained,
        not erased.
      - **Aura Clash flagship quality** is lowered to development showcase:
        its route uses root plus advanced-runtime, production-runtime,
        rendering, scene, and animation subpaths, and the complete current
        gameplay/art/audio/performance/deploy/docs gate chain is not green.
      - **Performance or engine-parity promotion** remains prohibited because
        `threejs-parity:performance` is `pass: false` with six missing inputs,
        both retained comparative verdicts are non-passing, and 54/54 is a
        feature inventory rather than a performance measurement.
      - **Current worktree/public promotion** is held even though the
        2026-07-23 npm/deployment receipts remain valid historical records.
        `test:unit` still fails the two retained racing visual-QA assertions,
        and `check:examples` currently measures zero cyan pixels for the
        hello-world screenshot.

      Closing claim gates pass: agent docs, codeblocks, marketing truth,
      marketing links, and the claim registry (51 governed files, 0
      violations). Two separate legacy/visual verification blockers remain
      recorded at 4.3 and 4.4 under Rule 0.

### Standing Phase 4 obligations carried from Phase 1 and 2

- The performance gate fails on six missing reports; the visual-quality capture was 38 days
  stale at audit time; both committed benchmark verdicts are non-passing; the headline 54/54
  inventory number is hand-authored. Until those are addressed, **no performance or parity
  claim in docs or marketing has backing.**
- `misc_controls_transform` is listed `"matched"` at `priority: "high"` against a 19-line
  stub. That entry must be corrected regardless of what else ships.
- Per the Gap 7 decision, state the per-game physics backend wherever fidelity is claimed.
  Native `aura-js` now has bounded adaptive CCD and accumulated Coulomb
  friction, but rotated box↔box still uses the AABB fallback and native angular
  contact response, convex/mesh/heightfield narrow-phase, and production
  collision parity remain absent.

---

## Generated files — regenerate, never hand-edit

`apps/*/route-health.json`, `apps/*/showcase-evidence-checklist.json`,
`apps/*/showcase-spec-compile-report.json`, `apps/*/route-gate.patch.json`,
`apps/*/game-template/*.json`, `apps/aura-clash-showcase/launch-evidence*`,
`docs/project/showcase-launch-evidence.json`, `docs/project/showcase-visual-review.json`,
`docs/project/release-artifacts.json`, `tools/showcase-library/route-gates.json`,
`tests/reports/**`, `dist/` and nested `dist/`, `coverage/`, `test-results/`,
`release-artifacts/`, `src/aura-assets.ts`, `aura.assets.json`, `public/aura-assets/`.

Reference-only, not current capability: `archive/`, `benchmark/context/`.

## Verification commands

Fast loop, in order:

```bash
pnpm typecheck:raw
pnpm test:unit
pnpm test:packages
pnpm verify:exports && pnpm verify:imports && pnpm verify:boundaries
```

Then only the narrow namespace touched: `pnpm game-runtime:unit`,
`pnpm animation-engine:readiness`, `pnpm threejs-parity:inventory`,
`pnpm engine-readiness:visual-quality`, `pnpm check:agent-docs`,
`pnpm check:docs-codeblocks`.

Baseline set for the before/after columns: `pnpm threejs-parity:inventory`,
`pnpm threejs-parity:same-scene-render`, `pnpm threejs-parity:performance`,
`pnpm engine-readiness:visual-quality`.

Showcase route gate: `node tools/showcase-library/build-and-check.mjs`

**Avoid** `pnpm verify:release`, any `*:release`, and `external-parity:release` unless a
multi-hour Playwright + build + npm-pack run is intended. Root `package.json` has ~437
scripts; prefer named narrow ones over ad hoc checks.

## Deliverables

1. `docs/project/engine-parity-gap-audit.md` — **done**
2. Engine fixes, P0 first, each with a pixel-or-diagnostic test — **executed;
   remaining Rule 0 blocks are recorded**
3. Four rebuilt games with regenerated evidence — **executed; current
   Turbo/Skyline promotion is held by the retained visual-QA gate**
4. Doc updates whose labels match the evidence that actually exists — **done**
5. Closing summary: every claim raised with its proof, every claim lowered with why — **done**

## Scope

Phases 1-4 have been executed. Remaining work is limited to the explicitly
recorded Rule 0 blockers and non-passing evidence gates; completion of this
checklist does not silently waive them. If a claim cannot be proven, lower the
label. Never broaden a claim to match ambition.

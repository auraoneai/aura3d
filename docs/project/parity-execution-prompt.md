# Aura3D three.js Parity + Game Rebuild — Full Execution Prompt

Repo: `/Users/gurbakshchahal/platforms/aura3d` · pnpm@11.1.3 · `@aura3d/engine` v1.4.5

This document supersedes ad-hoc task tracking for the parity + game-rebuild effort. It is
the single checklist. Work top to bottom. Do not reorder phases.

Last verified against code: 2026-07-26, at commit `e0f7e2e0`.

---

## Rule 0 — anti-loop rules, read before doing anything

These exist because the first attempt burned a day producing depth on a sub-problem while
7 of 9 gaps sat untouched.

1. **One task in flight.** Take the topmost unchecked task in the current phase. Finish it
   or record it blocked. Do not open a second.
2. **Stop at each `STOP FOR REVIEW` marker.** Do not proceed past it.
3. **Exhaustive proofs are out of scope unless a task names them.** Bit-exactness sweeps,
   BigInt bounds, and 100M-case verifiers are not required by any task below. A pixel test
   plus a diagnostic assertion is the bar.
4. **No new tracking documents.** Update this file's checkboxes. Do not create
   `*-status.md`, `*-backlog.md`, `*-matrix.md`, or similar. The first attempt created six
   such files that nothing consumed.
5. **If a task fails twice, mark it `[!]` with the root cause and move to the next task.**
   Do not attempt a third variation.
6. **Never edit a generated file as source.** See the Generated Files list at the bottom.
7. **Lower the claim label when proof is absent.** Never broaden a claim to match ambition.
8. **Commit per task**, with the verification command output referenced in the message.

Status legend: `[ ]` open · `[x]` done · `[~]` partial, detail required · `[!]` blocked

---

## Required reading, in order, once

- [ ] `llms.txt` (mirrored at `public/llms.txt` — keep both in sync)
- [ ] `docs/agents/claims-and-boundaries.md` — binding; 7 capability labels, every public
      claim carries exactly one
- [ ] `docs/project/known-limits.md` — declared authority; narrower wording always wins
- [ ] `docs/agents/game-showcase-build.md` — what a game route must have to ship
- [ ] `AGENTS.md`, `packages/AGENTS.md`, `packages/rendering/AGENTS.md`, `apps/AGENTS.md`,
      `docs/AGENTS.md`

---

## Do not rewrite these — they are real GPU code

Verify by reading before touching anything adjacent. The renderer is not fake; the games
look basic because of how they are built plus the specific gaps below.

- Cook-Torrance GGX PBR + separate clearcoat lobe — `packages/rendering/src/ShaderChunks.ts:57-113,277-278`
- IBL via `textureLod`, equirect + cube bindings, RGBE decode — `packages/rendering/src/ShaderLibrary.ts:382-543`
- `drawElementsInstanced` / `drawArraysInstanced` — `packages/rendering/src/WebGL2Device.ts:807-817`
- FBOs with `DEPTH_COMPONENT24` — `WebGL2Device.ts:409-432`; per-face cube uploads `:1767-1815`
- GPU skinning with per-geometry joint validation — `packages/rendering/src/ForwardPass.ts:272-300`
- GPU morph targets + CPU fallback — `ForwardPass.ts:1418-1440`
- Frustum culling against real AABBs — `packages/rendering/src/Renderer.ts:1981`
- Render-queue sorting, distinct transmission bucket — `packages/rendering/src/RenderItemSorting.ts:41-71`
- WebGPU backend, ~2,877 lines — `packages/rendering/src/WebGPUDevice.ts`
- Physics fixed-timestep accumulator, sequential impulses, dual backend — `packages/physics/src/`
- Animation: inertialized transitions, two-bone IK, spring bones, humanoid retargeting,
  14-clip library — `packages/animation/src/`

---

# PHASE 1 — Gap audit. Write findings. Fix nothing.

Deliverable: **`docs/project/engine-parity-gap-audit.md`** — this does not exist yet and is
the gate the first attempt skipped.

For every gap below, the audit entry must carry: file:line, why it costs visual quality,
fix cost estimate, and whether it blocks the game rebuilds.

- [ ] **1.1** Create `docs/project/engine-parity-gap-audit.md` with one ranked section per
      gap 1-9 below, each with the four required fields.
- [ ] **1.2** Establish the parity baseline. `tests/reports/` is gitignored and the
      `threejs-parity/`, `external-parity/`, `three-compat/`, `production-runtime/`,
      `foundation/`, `engine-readiness/`, `superiority/`, `product-studio/` directories are
      currently empty — there is no score to regress against. Generate and record:
      `pnpm threejs-parity:inventory`, `pnpm threejs-parity:same-scene-render`,
      `pnpm threejs-parity:performance`, `pnpm engine-readiness:visual-quality`.
      Paste the numbers into the audit as the "before" column.
- [ ] **1.3** Record in the audit that the only committed verdicts are both non-passing, and
      do not treat either as a baseline pass:
      `benchmark/results/aura3d-106-peer-benchmark-report.json` (release 1.0.9,
      `scoped-pass`, `auraDrawCalls 333` / `auraNonDarkPixels 45866` vs `threeChildren 75` /
      `threeNonDarkPixels 13289`, explicitly does not rank Aura3D above Unity/Unreal/Babylon)
      and `benchmark/results/round-50.md` (`owner-skipped / pending`, missing
      `benchmark/runs/round-50/human-review.json`).
- [ ] **1.4** Note the frozen bar from `benchmark/rubric.md`: ≥7/10 prompts per agent, ≥2
      wins from prompts 7/8/10, ≥4 visual scores ≥4, none <3. And that internal tools
      "cannot score visual quality, decide wins, or certify release readiness." Do not
      self-certify.
- [ ] **1.5** Note the tooling caveat: most `tools/` gates are boolean `checks[]` of
      `{ id, ok, detail }` and many assert on **source tokens** — `game-runtime-readiness`
      greps `package.json` and greps an agent report for literal strings;
      `threejs-parity-threejs-inventory` holds 54 hand-authored `item(...)` entries
      (58 `"matched"` / 4 `"partial"`). Passing a gate ≠ proving quality. Do not game tokens.

### >>> STOP FOR REVIEW <<<
Do not begin Phase 2 until the audit is reviewed.

---

# PHASE 2 — Engine fixes, P0 then P1

Rules for every task in this phase:
- Every visual feature needs a test asserting **pixels or diagnostics**, never DOM presence
  (`packages/rendering/AGENTS.md`).
- Keep fallback / mock / canvas2d / zero-draw-call states visible in diagnostics. Never
  hide a fallback to make a route look production.
- No cross-package `@aura3d/*/src/*` deep imports — ESLint blocks them. Use package
  exports or relative imports inside the owning package.

## Gap 1 (P0) — Post-processing runs on the CPU · OPEN

The largest architectural divergence from three.js. `postprocess/EffectComposer.ts:149,158`
does a synchronous `device.readPixels(...)` then dispatches to `bloomPixels:317`,
`ssaoPixels:333`, `taaPixels:337`. Implementations are JS loops over `Uint8Array` in
`PostProcessPass.ts`: `ssaoPixels:1182`, `taaPixels:1344`, `bloomPixels:1370`, plus
`ssrPixels:1302`, `depthOfFieldPixels:1077`, `motionBlurPixels:1130`, `outlinePixels:969`,
`contactShadowPixels:1230`, `chromaticAberrationPixels:930`, `filmGrainPixels:1036`.
Same pattern in `ExternalParityRenderPreset.ts:409-427`. Readback is a blocking
`gl.readPixels` (`WebGL2Device.ts:642-660`), stalling every frame. `Renderer.ts` calls
`readRenderTargetPixelsAsync` at `:907,967,973,976,999,1049`.

The only GPU path is `presentLdrPostprocess` (`WebGL2Device.ts:555`);
`canFuseLdrPostprocess` (`Renderer.ts:1783-1792`) restricts fusion to tone-mapping,
color-grade, fxaa in `ldrFusionPassRank` order. **SSAO, SSR, DOF, motion blur, TAA, and
bloom have no GPU implementation at all.** In three.js all are fullscreen fragment shaders.

Already landed at `e0f7e2e0`: `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts`
holds exact LUTs (bloom bright-extract bitset, 256×256 composite table, 256-entry outline
blend table, BigInt outline gradient bound) and `outlinePixels` uses integer arithmetic.
**Nothing consumes those LUTs outside `tools/verify-native-ldr-luts.ts`.** Do not extend the
LUT work; consume it.

- [ ] **2.1** Add bloom as a fullscreen fragment-shader pass with ping-pong FBOs. Wire into
      `presentLdrPostprocess`, consuming the existing bright-threshold and composite LUTs as
      uploaded textures. Extend `canFuseLdrPostprocess` + `ldrFusionPassRank` to admit it.
- [ ] **2.2** Same for outline, consuming the blend LUT and the integer gradient bound.
- [ ] **2.3** Port SSAO to a fragment shader (depth-texture driven; depth routing already
      exists via `withRendererDepth` / `isDepthPostprocessPass` at `Renderer.ts:1801-1809`).
- [ ] **2.4** Port SSR.
- [ ] **2.5** Port depth-of-field.
- [ ] **2.6** Port motion blur.
- [ ] **2.7** Port TAA.
- [ ] **2.8** Keep the CPU path behind an explicit flag — the deterministic tests depend on
      it. Do not delete `*Pixels` functions.
- [ ] **2.9** Pixel test per ported pass asserting GPU output matches the CPU kernel within
      a stated tolerance. One test per pass, not an exhaustive sweep.

## Gap 2 (P0) — PMREM was a box blur · DONE at `606c826d`

`EnvironmentMapResources.ts:244` now runs GGX importance-sampled prefiltering via the new
628-line `SpecularPrefilter.ts`. Per-level roughness comes from
`specularPrefilterLevelRoughness` (the filter's own schedule) instead of the old post-hoc
`index / (levels - 1)`. `PMREM.ts` reports
`filterModel: "ggx-importance-sampled-equirect-prefilter"`.

- [x] Real GGX prefilter implemented
- [x] Covered by `tests/unit/rendering/specular-prefilter.test.ts`,
      `environment-map-resources.test.ts`, `shader-library.test.ts`
- [ ] **2.10** Split-sum BRDF LUT — still open. `generateApproximateBrdfLutPixels` is
      approximate; replace with a real split-sum integration and assert against reference
      values.

## Gap 3 (P0) — Cascaded shadow maps are dead code · OPEN

`CascadedShadowMaps.ts` and `shadows/CascadedShadowPipeline.ts` export `CascadedShadowMaps`,
`CascadedShadowPass`, `supportsCascadedShadowLight`. `Renderer.ts` has **zero** matches for
`cascade` (verified 2026-07-26). Neither it nor `ForwardPass.ts` references cascades. Only
consumers are `index.ts` re-exports, a `CascadeSplit` type import in `LightingDebug.ts`, and
tests. Directional shadows use a single 1024px map — racing and runner will alias badly.

- [ ] **2.11** Pick one and execute; the prompt forbids leaving this ambiguous:
      (a) wire cascades into `Renderer.ts` + `ForwardPass.ts`, or (b) delete the dead files
      and their re-exports. Record the decision in the audit.
- [ ] **2.12** If wiring: pixel test showing reduced aliasing at distance vs the single map.
      If deleting: update `packages/rendering/README.md`, `docs/api/public-api.md`,
      `tools/external-parity-shadow-readiness/`, `tools/external-parity-shadow-map-readiness/`,
      `tools/requirements-trace/`, and the tests that reference the removed symbols.

## Gap 4 (P0) — Root agent path disables its own optimizations · PARTIAL

- [x] `createProductionRendererInput` now sets `staticBatching: true, frustumCulling: true`
      (`packages/engine/src/agent-api/index.ts:10423-10424`, was `false`/`false`)
- [ ] **2.13** `createProductionRuntimeCollectedLights` (`:10240`) still returns a hardcoded
      3-directional-light rig (key/fill/rim, one shadow caster). Make it scene-driven.
- [ ] **2.14** `PRODUCTION_RUNTIME_POSTPROCESS:10157` and `PRODUCTION_RUNTIME_SHADOWS:10179`
      (1024px PCF) are still frozen constants. Make them respond to scene needs.
- [ ] **2.15** `index.ts` is ~13.5k lines. Consider splitting as a **separate isolated
      change**, not bundled with 2.13/2.14.

## Gap 5 (P1) — MSAA is only the context flag · OPEN

`antialias: true` at context creation (`WebGL2Device.ts:191`), but **no `sampleCount` and no
`renderbufferStorageMultisample` anywhere in the file** (verified 2026-07-26). Every render
target is single-sampled; combined with the FXAA-only GPU path, all offscreen rendering has
no MSAA.

- [ ] **2.16** Add multisampled renderbuffer support and a `sampleCount` render-target
      option, with resolve-to-texture.
- [ ] **2.17** Diagnostic test asserting sample count and a pixel test on an edge.

## Gap 6 (P1) — Hard 16-light cap · OPEN

`MAX_DIRECT_LIGHTS = 16` (`packages/rendering/src/LightUniforms.ts:4`), packed into a fixed
`u_lightData` array of `MAX_DIRECT_LIGHTS * 4` vec4 slots; `pack()` hard-throws above
(`:21-22`). No clustered or deferred path. Point-light shadows throw when the device lacks
render-target pixel upload (`Renderer.ts:1196`).

- [ ] **2.18** Decide and record: clustered forward, or a documented hard cap with a
      graceful diagnostic instead of a throw. Do not silently raise the constant.
- [ ] **2.19** Test at the boundary and above it.

## Gap 7 (P1) — Physics fidelity ceiling · OPEN, no decision recorded

`buildContact()` at `packages/physics/src/PhysicsWorld.ts:686` (called from `:330`) has
hand-written narrow-phase pairs only — plane↔any, sphere↔sphere, sphere↔box, capsule↔sphere,
capsule↔box, capsule↔capsule. **Everything else falls back to AABB overlap on min-axis
penetration.** No convex hull, no GJK/EPA, no mesh or heightfield narrow-phase — `gjk`,
`convexHull`, `timeOfImpact` return **zero matches** across `packages/physics/src` (verified
2026-07-26). `inverseInertia` is a diagonal `Vec3` (`RigidBody.ts:30,88,264`) and contact
impulses generate **no torque**, so resolution is purely linear and boxes will not tumble.
Friction clamps against `μ·(|Jn| + penetration)` rather than a Coulomb cone on accumulated
normal impulse. No CCD, so fast movers tunnel.

- [ ] **2.20** State the per-game decision explicitly: route through the `cannon-es@0.20.0`
      backend, or extend the native `aura-js` solver. This decision was required by the
      original prompt and was never made.
- [ ] **2.21** Implement per that decision, minimum: angular response from contact impulses,
      and CCD or a documented tunneling limit for the racing game's fast movers.
- [ ] **2.22** Test: a box dropped on a corner must tumble; a fast mover must not tunnel.

## Gap 8 (P1) — Duplicate OrbitControls · DONE at `606c826d`

`packages/controls/src/OrbitControls.ts` went 25 → 176 lines and now delegates all camera
math to the `@aura3d/input` engine when a camera is attached. Detached mode is explicitly
documented as bookkeeping-only carrying no parity claim. `MapControls` delegates damping.

- [x] Consumer trap resolved
- [x] `tests/unit/controls/orbit-controls-delegation.test.ts`
- [ ] **2.23** Remaining stubs in the same package are still placeholders and still exported:
      `FirstPersonControls` 8 lines, `FlyControls` 14, `MapControls` 15,
      `PointerLockControls` 15, `DragControls` 17, `SelectionManager` 18,
      `TransformControls` 19. Resolve or explicitly deprecate each.
- [ ] **2.24** The parity inventory's `misc_controls_orbit` "matched" claim rests only on the
      `input` version. Re-check that entry against the now-delegating `controls` version.

## Gap 9 (P1) — Features the codebase already declares missing · correctly untouched

`packages/rendering/src/EnvironmentPlatform.ts` keeps an honest ledger with a
`"missing" | "partial" | "helper"` status enum (line 29). Notable: `exr-parser` —
"EXRLoaderThreeCompat is diagnostic-only and does not decode OpenEXR pixels" (`:260`);
`cube-camera-reflections` — "ReflectionProbe is a descriptor helper; live six-direction
capture is not implemented" (`:261`); `atmospheric-scattering` missing (`:242`). Planar
reflections, scene refraction/caustics, area lights, terrain/heightfield (`:1027-1069`), and
volumetrics/god rays (`:457`) all disclosed unsupported. Ten environment presets are
`"helper"` — geometry descriptors, not rendering features, consistent with
`packages/environments/src` being only 469 LOC.

- [x] Ledger not downgraded or deleted; nothing flipped because nothing was implemented
- [ ] **2.25** If any Phase 2 task implements a ledger entry, flip its status **and** attach
      the proof in the same commit. Never flip without proof.

## Phase 2 exit gate

- [ ] **2.26** `pnpm typecheck:raw` clean. Note: 3 pre-existing errors in
      `packages/scripting/tests/scripting.test.ts` (callbacks return `number`, expected
      `void`) are unrelated — fix or explicitly waive them.
- [ ] **2.27** `pnpm test:unit` — full suite, was 328 files / 2,072 tests
- [ ] **2.28** `pnpm test:packages`
- [ ] **2.29** `pnpm verify:exports && pnpm verify:imports && pnpm verify:boundaries`
- [ ] **2.30** `pnpm check:public-api`
- [ ] **2.31** Re-run the Phase 1 baseline commands and record the "after" column.

### >>> STOP FOR REVIEW <<<
Do not begin Phase 3 until the P0 fixes (2.1-2.15) have passing pixel tests. Rebuilding
games on CPU post-processing wastes the effort.

---

# PHASE 3 — Rebuild the four games

Zero work has been done here. All four are exactly as originally described.

| Game | Path | LOC | Core problem |
|---|---|---|---|
| Aura Clash Arena | `apps/aura-clash-showcase/` | 10,146 | Stage/lighting/atmosphere are DOM + CSS; mounts `A3DRenderer.create()` from `advanced-runtime`, not `createAuraApp` |
| Blockfall Reactor | `apps/showcase-blockfall-reactor/` | 1,951 | 100% primitives, `"primaryAssets": []`, no `package.json` |
| Turbo Drift Circuit | `apps/showcase-turbo-drift-circuit/` | 965 | Thin; "ghost opponent" is a second `game.racing` at progress offset 0.28, not AI |
| Skyline Runner | `apps/showcase-skyline-runner/` | 1,374 | Thin; mirrors Turbo Drift. No `package.json` |

### Export-surface rule — this decides the capability label

Which subpath a route imports from **decides its label**. Root `.` is the only root-safe-API
surface. `./production-runtime`, `./advanced-runtime`, and `./rendering` are not. This is why
Aura Clash cannot carry a root claim today.

### The game-kit constraint, stated precisely

`packages/engine/src/agent-api/game-kits/` holds only `fighting.ts` and `index.ts`, but the
racing and platformer builders **are** real root exports: `createGameRacingRoadMeshNodes:5843`,
`createGameRacingCheckpointGateNodes:5980`, `createGameRacingStartFinishNodes:6071`,
`createGamePublicRacingPresentationNodes:6212`, `createGameRacingCameraRig:6286`,
`createGameRacingPresentationTrackNodes:6336`, `certifyPublicRacingPresentation:6312`;
`createGamePublicPlatformerPresentationNodes:6391`, `createGamePlatformerGroundMeshNodes:6399`,
`createGamePlatformerPlatformMeshNodes:6403`, `createGamePlatformerHazardNodes:6407`,
`createGamePlatformerCheckpointNodes:6427`, `createGamePlatformerFinishNodes:6445`,
`createGamePlatformerCameraRig:6463`, `createGamePlatformerPresentationSurfaceNodes:6496`,
`certifyPublicPlatformerPresentation:6467`.

Per `known-limits.md` these "are not production game-generation APIs or automatic
arbitrary-mesh converters," and Turbo Drift + Skyline Runner "currently satisfy those
contracts for their named certified asset pairs and retained evidence only; this does not
generalize to arbitrary assets or production games." Build **on** these builders. Do not
claim they generalize. Do not claim a reusable falling-block or generic collision kit —
those genuinely do not exist as root exports.

## 3A — Blockfall Reactor · highest priority

`route-health.json:15` declares `"primaryAssets": []` while the route is publicly promoted as
a named game on the marketing homepage and showcase index. Every visible element — locked
cells, active piece, ghost piece, board rails, cabinet, reactor tube, grid lines — is
`primitives.box/cylinder/sphere/torus` (31 occurrences). It imports root-only (`camera`,
`createGameApp`, `effects`, `game`, `lights`, `material`, `primitives`, `scene`, `ui`) and
drives state through `GameFallingBlocksSnapshot`. Source is a single 1,174-line `main.ts` +
777-line `rules.ts`.

The Primitive Boundary in `docs/agents/claims-and-boundaries.md`: "Primitives are not allowed
as the primary character, vehicle, product, creature, weapon, world, hero object, or primary
environment for a named real-world or game prompt. With the asset catalog available, a named
object should start from a real typed GLB/glTF asset. A primitive-only public showcase must be
labeled abstract visualization or blocked."

- [ ] **3.1** Choose and state: (a) source typed GLB assets through the CLI — `assets search`
      then `assets resolve`, **never invent ids** — or (b) relabel the route as abstract
      visualization.
- [ ] **3.2** Execute the choice.
- [ ] **3.3** Add `apps/showcase-blockfall-reactor/package.json`.
- [ ] **3.4** Split the 1,174-line `main.ts`.
- [ ] **3.5** Regenerate `route-health.json` by rerunning the evidence command — per
      `apps/AGENTS.md`, "Do not turn route-health JSON into the source of behavior."

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
`assets.auraClashRivalRig`; manifest holds 22 ids including `arenaNeonDowntown` (16.4 MB),
`auraClashDuelStage`, six fighter GLBs, ten Kenney SFX. Live app is
`playable/AuraClashArenaApp.ts` (2,622 lines).

Real subsystems to build **on**, not replace: `src/animation/` (state machine, per-fighter
profiles, inertialized blending, fallback pose), `src/fighters/` (combo, guard-break, hitbox,
knockdown-recovery, six definitions), `src/state/` (event bus, loop, hit registry, match
state, save state), `src/rendering/` (lighting, postprocess, `HitSparkVfx.ts`), `src/ui/`
(title, character select, HUD, pause, results), `src/arenas/`.

- [ ] **3.6** Replace the ~20 DOM stage elements with rendered geometry. Keep DOM for UI only.
- [ ] **3.7** Prune `playable.css` to UI-only rules.
- [ ] **3.8** Resolve the parallel scene path. `src/scenes/` is `createFightScene.ts` (38),
      `createFighterNodes.ts` (61), `createStageScene.ts` (20), `index.ts` (3). It imports
      `primitives` and reads as dead alongside the live `AuraClashArenaApp.ts` — but
      `src/evidence/evidenceModel.ts` references it, so **confirm before deleting.**
- [ ] **3.9** Migrate off `advanced-runtime` `A3DRenderer` to `createAuraApp` if a root claim
      is wanted; otherwise keep the label lowered and say so.
- [ ] **3.10** Full control surface A/D/S/Space/Shift/Q/J/K/L/P/R; combat halts after KO until
      reset; debug rigs and hitboxes behind explicit debug mode; no primitives as
      release-facing fighter art.
- [ ] **3.11** Keep the fixed copy boundary from `docs/agents/game-showcase-build.md`:
      "Aura Clash Arena is a development showcase proving Aura3D browser runtime mechanics
      with typed GLB assets, input, animation state, combat evidence, screenshots, and
      deployment checks." Banned: "polished flagship fighting game", "Unity replacement",
      "Unreal competitor", "Babylon.js parity", "The AI prompt catalog always finds
      production-ready fighters." Keep "development showcase" / "runtime proof" scoping until
      gameplay, asset, art, audio, performance, deployment, and visual-approval gates pass.
- [ ] **3.12** Regenerate `launch-evidence/` (~30 scripts).

## 3C — Turbo Drift Circuit

Certified pair: `showcaseKenneyRaceCarRed` (`role: "primaryVehicle"`) +
`showcaseKenneyNeonRaceCircuit` (`primaryTrack`), both `quality: "release"`, driven by
`game.assetBoundRacingRoute`, `game.racingSceneBinding`, `game.racing`, `game.racingCameraRig`,
`game.racingPresentationTrack`. Generated contract: `src/generated/game-geometry.ts` (617
lines). Pair-composition report currently carries `verdict: "pass"`.

- [ ] **3.13** Real opponent AI replacing the progress-offset ghost (currently a second
      `game.racing` at offset 0.28).
- [ ] **3.14** Deepen visuals **without** breaking the certified pair or its retained
      composition report.
- [ ] **3.15** Tests for movement, restart, and at least one lap/checkpoint mechanic.

## 3D — Skyline Runner

Certified pair: `showcaseKenneyOobiPlatformerHero` (`primaryCharacter`, `targetHeight: 0.44`)
+ `showcaseKenneyVerdantPlatformerWorld` (`primaryWorld`), via
`game.platformerPresentationSurfaces`. Exposes `window.__AURA3D_COMPOSITION_PROBE__`.
Generated contract: `src/generated/game-geometry.ts` (787 lines).

- [ ] **3.16** Deepen gameplay beyond the 335-line `main.ts`.
- [ ] **3.17** Add `apps/showcase-skyline-runner/package.json`.
- [ ] **3.18** Tests for movement, restart, and at least one checkpoint/collection mechanic.

## Every game must have (`docs/agents/game-showcase-build.md`)

Apply as a per-game checklist — "A route is not a game claim just because it has a 3D scene
and key listeners." Screenshots prove only what is visible.

- [ ] **3.19** Keyboard input that visibly changes state
- [ ] **3.20** An objective
- [ ] **3.21** Scoring or a fail condition
- [ ] **3.22** Reset
- [ ] **3.23** A progression loop
- [ ] **3.24** Typed primary assets unless explicitly abstract
- [ ] **3.25** Automated tests for movement, restart, and ≥1 win/fail/scoring/lap/checkpoint/
      line-clear/collection mechanic
- [ ] **3.26** `route-health.json` naming primary assets, primitive count, renderer mode,
      fallback mode, claims
- [ ] **3.27** Registration/routing consistent across `apps/showcase-index/index.html`,
      `vercel.json`, `marketing/scripts/build-showcase-routes.mjs`,
      `scripts/check-route-metadata.mjs`
- [ ] **3.28** `node tools/showcase-library/build-and-check.mjs` passes (7/7 candidates)
- [ ] **3.29** If game helpers changed, update `templates/racing-starter/`,
      `templates/falling-blocks-starter/`, `templates/mini-game/`, `templates/game-slice/`,
      and the `packages/create-aura3d/templates/{racing-starter,falling-blocks-starter,
      fighting-game,mini-game,character-controller}/` copies

## Anti-patterns that fail review

- [ ] **3.30** No `three`, `three/examples/...`, `GLTFLoader`, `OrbitControls`, hand-rolled
      renderer loops, or raw loader code in public routes, templates, examples, README
      snippets, or agent docs. No `new THREE.Scene()` / `new THREE.WebGLRenderer(...)`.
- [ ] **3.31** No `model("id")`, `model("/path/model.glb")`, raw `.glb`/`.gltf` URLs, guessed
      sample-model URLs, or `unsafeModelUrl(...)` in safe public examples. Do not invent ids.
- [ ] **3.32** DOM/CSS/canvas overlays are UI only — never fake particles, lighting, shadows,
      trails, explosions, and never rendering evidence.
- [ ] **3.33** Do not claim a reusable falling-block or generic collision kit.

---

# PHASE 4 — Docs

Update claim wording **only where new evidence exists**. Where proof is absent, **lower the
label**. Never broaden.

Not claimable for root, per the explicit list: production renderer parity or
"Three.js-quality" rendering, full PBR parity, HDR/IBL/PMREM/tone mapping/high-quality
shadows, pixel-backed bloom/SSAO/DOF/FXAA/TAA/color grading, native WebGPU, skinned GLB
animation in screenshots, morph targets in screenshots, production-quality
character/racing/platformer/falling-block/collision kits.

Note: `CHANGELOG.md`, `GoLiveCheckList.md`, `marketing/index.html`, `marketing/src/styles.css`
and 5 `docs/` files were modified and committed at `e0f7e2e0`. Marketing was supposed to come
last — re-verify those edits still match the evidence that exists.

- [ ] **4.1** Claims and boundaries first, these gate everything else:
      `docs/agents/claims-and-boundaries.md`, `docs/project/known-limits.md`,
      `docs/project/claim-guidelines.md`, `docs/project/product-boundaries.md`,
      `docs/agents/rendering-proof-required.md`, `docs/agents/anti-hallucination-rules.md`,
      `docs/agents/no-hackjob-rules.md`, `docs/agents/game-example-standards.md`,
      `docs/agents/verification.md`, `llms.txt` + `public/llms.txt`,
      `.cursor/rules/aura3d.mdc`, `AGENTS.md`, `Fixed-Needed-PRD.md`
- [ ] **4.2** Rendering / API: `docs/rendering/postprocess.md`, `environment-lighting.md`,
      `skinning-and-morphs.md`, `material-matrix.md`, `renderer-lifecycle.md`,
      `webgpu-fallback.md`, `docs/concepts/rendering.md`, `docs/concepts/physics.md`,
      `docs/concepts/animation.md`, `docs/physics/runtime.md`,
      `docs/animation/runtime-support.md`, `believable-motion.md`, `docs/api/public-api.md`,
      `docs/api/game-runtime.md`, `docs/api/app-api.md`, `docs/api/assets.md`,
      `docs/project/public-api-contract.md`
- [ ] **4.3** Status / release: `docs/project/current-state.md` — it fixes 7/7 public
      route-library count, 2 internal diagnostics, 2 game-layer harnesses, 0
      prototype-blocked; **do not silently break those numbers**. Plus `CHANGELOG.md`,
      `GoLiveCheckList.md`, `docs/project/release-checklist.md`,
      `showcase-quality-gates.md`, `showcase-visual-quality-standard.md`,
      `library-gap-roadmap.md`, `docs/project/apps-classification.md`
- [ ] **4.4** Per-game: root `README.md`, each `apps/*/README.md`,
      `docs/project/aura-clash-showcase.md`, `docs/agents/game-showcase-build.md`,
      `docs/examples/fighting-game.md`, `docs/guides/build-a-browser-game.md`
- [ ] **4.5** Marketing **last**, only after evidence lands: `marketing/index.html`
      (~lines 178, 234-280, 511, 564-575 carry the version claim, the Aura Clash pitch, the
      "seven distinct route-library examples" count, per-game tiles),
      `marketing/docs/claims.html`, `marketing/docs/aura-clash.html`,
      `marketing/docs/evidence.html`, `marketing/sections/aura-clash-homepage.html`,
      `apps/showcase-index/index.html`
- [ ] **4.6** `docs/comparisons/` and `docs/benchmarks/` only if a real benchmark exists
- [ ] **4.7** `pnpm check:agent-docs && pnpm check:docs-codeblocks &&
      pnpm check:marketing-truth && pnpm check:marketing-links && pnpm verify:claims`
- [ ] **4.8** Closing summary: every claim raised with its proof, every claim lowered with why

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

Showcase route gate: `node tools/showcase-library/build-and-check.mjs`

**Avoid** `pnpm verify:release`, any `*:release`, and `external-parity:release` unless a
multi-hour Playwright + build + npm-pack run is intended. Root `package.json` has ~437
scripts; prefer named narrow ones over ad hoc checks.

## Worktree note

This worktree contained uncommitted user changes and untracked showcase assets, all committed
at `e0f7e2e0`. Do not revert unrelated changes while doing scoped work.

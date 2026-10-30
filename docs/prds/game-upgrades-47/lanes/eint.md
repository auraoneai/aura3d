# GU47 lane eint: engine integration handoffs (after the engine lanes merged)

- Branch: `gu47/eint` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eint`)
- Base commit: `9869206dd` (`gu47/integration` with engine lanes ea, eb, ec, ed, ef, eg, eh, ei merged; ee and ej still running, their files untouched)
- Wave: integration pass (phase 1, code). No browsers, no remote runs, no captures, no push.
- Scope: `briefs/scope-eint.md`; handoff list `briefs/handoffs-eint.md` plus the Handoffs sections of `lanes/{ea,eb,ec,ed,ef,eg,eh,ei}.md`.

## Rows (one per handoff addressed to integration, a finished engine lane, or WP-38 `tools/finalize-dist`)

Status: `done`, `partial`, `declined (reason)`, `already applied (lane, commit)`, `pending` (not reached yet).

| ID | From -> to | File:symbol | Status | Commit | Notes |
|---|---|---|---|---|---|
| EA-1 | E-A -> E-C | `aura3d-cli/src/cli-help.ts` + `commands/prd05/index.ts` usage | done | 3cf747a0b | E-C had added a bare `--hdri` help line (8cbd585d7); it now names the required `--file in.hdr --out out_1k.hdr [--json]` (E-C's pinned prefix kept), and the prd05 `assets optimize` usage gains the HDRI mode. `tests/unit/gu47/eint/cli-help.test.ts` |
| EA-2 | E-A -> E-C | `agent-api/postBridge.ts:createRootPostPipeline` | done (default change, own commit) | 5a87c2abc | `lookOutputPreset(snapshot.nodes)` when `output.preset` is unset; authored output fields and look grade/bloom nodes still win; `tests/unit/gu47/eint/look-output-preset.test.ts` |
| EA-3 | E-A -> E-C | `agent-api/nodes/effects.post.ts:colorGrade/bloom` | done | b2c076133 | bloom copies `knee`/`clampLuminance`; colorGrade already forwarded temperature/tint/lut/lutIntensity (pinned); `tests/unit/gu47/eint/bloom-grade-fields.test.ts` |
| EA-4 | E-A -> E-C/E-A | `contracts/post.ts AuraBloomOptions`, `AuraAssetType "lut"` swap in `contracts/looks.ts` | pending | | |
| EA-5 | E-A -> E-B | `compiler/environment.ts` hdri rotation | already applied (E-B, 60ec60747) | | renderer half is EB-1 |
| EA-6 | E-A -> E-G | `public/index.ts`: `AuraHdriId`, `lookHdriIds`, `lookHdriUrl`, `lookOutputPreset` | done | 166d4ee7a | |
| EA-8 | E-A -> E-I | materials-environments skill | already applied (E-I, 7a6e1ccbe) | | |
| EB-1 | E-B -> integration | `rendering/src/renderer/Background.ts` environment rotation | done | cf7919b32 | `environmentProbeRotation` (radians) -> `environmentMapRotation` turns on the PRD-02 lighting object (memo keyed on it; ForwardPass -> `u_envRotation`), and the probe background's `rotation` turns unless an explicit background carries one; sign vs background is a phase-2 frame check. `tests/unit/gu47/eint/environment-rotation-renderer.test.ts` |
| EB-2 | E-B -> integration | `compiler/renderer.ts:194` shadowTier | done | cde2e26ce, e5e246537 | passes `explicitMountQualityTier(rendererOptions)` only when the app names a tier (auto/unset keep the coarse-pointer medium / desktop high default, so default unchanged); `production-bridge-boundary.test.ts` source pin updated; `tests/unit/gu47/eint/mount-shadow-tier.test.ts` |
| EB-3 | E-B -> integration, E-D | `rendering/src/shadows/Prd02ShadowBridge.ts` local tiles on the default path | declined (needs a forward-shader feature) | | The bridge feeds the legacy forward program, which has ONE directional/spot shadow map (`a3dForwardShadowFactor`, sun matrix) and one point map; local spot/point tiles need per-light tile matrices + atlas rects sampled per light in `ShaderLibraryCore` (and the `ShaderLibrary.ts` variants) plus ForwardPass uniform packing — a shader feature for every lit program, not a wiring change, and unverifiable without pixels in phase 1. Plan: expose `Prd02ShadowSystem` local tile matrices/rects from the bridge as `ForwardShadowMapOptions.localTiles`, pack up to `localShadowLights` (<= 4) mat4+rect uniforms, branch in the light loop on `spotShadowLayer.w` (tile index) for kind spot/point. The lookup-chunk path already renders local tiles. |
| EB-4 | E-B -> integration | `compiler/compileScene.ts:addSubtree/removeSubtree` runtime lights | done | 7037bb81c | `createRuntimeAddedCollectedLights` (observations.ts: physical or legacy descriptors, bound via `bindAuthoredLight`, never a shadow caster, none for ambient/hemisphere); `CompiledSceneImpl` republishes `mountCtx.collectedLights` (mount + runtime lights, new array) so the renderer input AND the light handler's update (setLight/setVisible/setPosition) see them; removeSubtree drops them. Not done: removing a MOUNT-time light keeps its collected light (pre-existing). `tests/unit/gu47/eint/runtime-added-lights.test.ts` |
| EB-5 | E-B -> E-G | `public/index.ts` light/env/fog/sky types | done | 166d4ee7a | |
| EB-6 | E-B -> E-G | `nodes/sky.ts`, `world/biomes.ts` contract sky types, count/brightness | partial | 166d4ee7a | types swapped; emission pending |
| EB-7 | E-B -> E-G | `compiler/fog.ts` | already applied (E-G, flip 0d9fe7f98) | | |
| EB-8 | E-B -> E-I | skill doc | already applied (E-I, 7a6e1ccbe, e92e6ccc2) | | |
| EC-1 | E-C -> E-G | `compiler/postprocess.ts` runtime overrides | already applied (E-G, 1c925de2b) | | |
| EC-2 | E-C -> E-F | `nodes/effects.ts` tiltShift / godRayDensity / SSR fields | pending (verify) | | |
| EC-3 | E-C -> E-D | `nodes/types.ts AuraAssetType "lut"` | pending | | |
| EC-4 | E-C -> E-D | forward fragment `alpha = u_bloomWeight` (selective bloom write) | pending | | |
| EC-5 | E-C -> E-D | forward MRT roughness channel for SSR | pending | | |
| EC-6 | E-C -> integration | `rendering/src/webgl2/LegacyPost.ts` selective-bloom weight read | done | 77ec234c9 | both HDR prefilters (`BLOOM_BRIGHT_EXTRACT_GLSL`, fused prefilter-downsample) multiply the excess by `auraBloomWeight(alpha, u_bloomSelective)`; `u_bloomSelective` from `options.selective`; `executePostGraphWebGL2` stamps `selective` from `pipeline.bloom.selective`; unstamped = factor 1.0. Optional SSR-descriptor filter not done (not needed). `tests/unit/gu47/eint/selective-bloom-read.test.ts` (incl. glslang) |
| EC-7 | E-C -> E-G (optional) | export `POST_RUNTIME_EFFECTS`, ... | declined | | E-G declined; games use `app.post.*`; root stays lean |
| ED-1 | E-D -> integration | `agent-api/diagnostics.ts` + `app/frameLoop.ts` triangles/textureBytes (ED-7) | done | 62912611c | lazy (one device read per inspected frame, none otherwise) instead of a per-frame `getDiagnostics()` copy: `bindLazyFrameDiagnostics({ deviceCounters })`, `deviceFrameCounters(auraRenderer)`, `snapshotDiagnostics` spreads both when present. `tests/unit/gu47/eint/diagnostics-device-counters.test.ts` |
| ED-2 | E-D -> E-G | `instances.*({ instanceColorTarget })` | already applied (E-G, 17d5dbfa9) | | |
| ED-3 | E-D -> E-G | `public/index.ts` toon/rim/instance-target types | done | 166d4ee7a | |
| EF-1 | E-F -> WP-38 | `tools/finalize-dist/index.ts` ship `aura-vfx-{1k,2k}.png` | done | 159316709 | copied to `dist/assets/vfx/` (+ the CC0 note) after the package loop; `tools/package-tarball-audit` (bans `.png`) allows exactly `dist/assets/vfx/aura-vfx-(1k\|2k).png`; +0.84 MB packed. Full build not run (phase 1). `tests/unit/gu47/eint/finalize-dist-vfx-pages.test.ts` |
| EF-2 | E-F -> E-G | `publishedUnion.ts:312` burst/trail/genre types | done | 166d4ee7a | |
| EF-3 | E-F -> E-I | `tools/real-gpu/scenarios.json` | already applied (E-I, afa026d35) | | |
| EF-6 | E-F -> unowned | `tools/vfx-atlas-bake/bake.mjs` re-bake | pending | | |
| EF-7 | E-F -> unowned | `rendering/src/vfx/VfxAtlas.ts:sequence` twin rects | pending | | |
| EG-1 | E-G -> integration | `createAuraApp.ts` `setWorldBuilderFlags` | pending | | |
| EH-1 | E-H -> E-G | `public/index.ts` crowd kit, GLB cache, animation types | done | 166d4ee7a | |
| EH-2 | E-H -> integration | `publishedUnion.ts:9` `AuraPlayLayerOptions`, `AuraActorPoseApi` | done | 166d4ee7a | |
| EH-3 | E-H -> E-G | `nodes/instances.ts:59-62` doc note (skinned crowds) | pending | | |
| EH-4 | E-H -> integration | `compiler/renderInput.ts` skinned-fallback warning text | pending | | |
| EH-5 | E-H -> integration | `actor/ModelTextureShare.ts:modelTextureShareKey` by value | pending | | |
| EH-6 | E-H -> integration | `ProductionGLTFRenderPipeline.ts` / `GLTFAssetParseCache.ts` decoder reuse | pending | | |
| EH-7 | E-H -> integration | `createAuraApp.ts` clear the GLB cache on dispose | pending | | |
| EI-1 | E-I -> E-C/integration | `cli-help.ts:60-61` certify categories | done | 3cf747a0b | both `certify-game-geometry` lines list `racing\|platformer\|sports\|fighting\|arena\|puzzle` (= `CERTIFY_CATEGORIES`) |
| EI-2 | E-I -> integration | `tools/real-gpu/capture.mjs` `evaluate` step | done | 15ebf8bab | step `{ evaluate }` runs after the step's shot; `report.json` games gain `evaluations: [{ expression, shot?, value \| error }]`; logic in `tools/real-gpu/evaluate-step.mjs` (unit-testable without the browser launch); README notes the key. Owner-run tool, not executed. `tests/unit/gu47/eint/real-gpu-evaluate-step.test.ts` |
| EE-H0 | E-E -> E-C (blocking G16/G20/G24) | `agent-api/postBridge.ts:POST_EFFECT_FIELDS.outline` | done | c7d8b7a2b | admits `"targets"`; a scene authoring `outline({ targets })` no longer throws `POST_FIELD_UNSUPPORTED` on the strict v2 chain |
| EE-H1 | E-E -> E-G (blocking) | `agent-api/compiler/postprocess.ts` outline object | done | c7d8b7a2b | `...outlineTargetsField(authoredOutline, nodes)` (flattened, override-applied nodes); no `targets` = byte-identical options; `tests/unit/gu47/eint/outline-targets-wiring.test.ts` |
| EE-H2 | E-E -> E-C (blocking) | `rendering/src/post/v2Stages.ts:runV2LdrTail` | done | 929321878 | `displayCustomLinearDepth`: scene depth (C-13 `sceneDepth.texture` -> `host.textureRegistry`) linearised once per tail with `DEPTH_LINEARIZE_GLSL` into a pooled rgba32f target, bound as `u_depthLinear` for `after-tonemap` customs with `inputs` "depth", released after the loop; stage `S1:depth-prep:after-tonemap`; `tests/unit/gu47/eint/ldr-tail-depth.test.ts` |
| EE-H4 | E-E -> E-C (optional) | `agent-api/postBridge.ts:POST_RUNTIME_EFFECTS` outline | pending | | runtime `setEffect("outline", { targets })` |

## Handoffs for game lanes and WP-38 release items (not applied here)

| From | To | File | Change |
|---|---|---|---|
| E-A | G09 | `apps/showcase-aura-fc-3d/src/game/scene.ts:449` | pass `background: vl.background` in the `looks.preset(vl.look, {...})` overrides |
| E-F | G05, G09, G10 | `apps/showcase-iron-crown/src/main.ts:399`, `apps/showcase-aura-fc-3d/src/main.ts:97`, `apps/showcase-aura-links-3d/src/main.ts:2816` | delete `effects.runtime = "off"` after the vfx-floating-dot receipt passes |
| E-F | G08, G09, G10 | Diamond `main.ts:766`, FC `game/scene.ts:418`, Links `main.ts:899` | `effects.trail({ target })` ribbons now draw: add `life` (~0.4 s) and `widthOverSpeed`, or remove the node; recapture |
| E-I | G03, G11, G16, G17, G18, G20, G21, G23 | boot code | implement the NEW variant params (`?circuit=`, `?floor=`, `?look=`, `?stage=`, `?at=`, `?band=`, `?found=`) |
| E-I | all game lanes | `art/direction.ts` + test | follow the compliance recipe in `ei.md`; commit `art/direction.audit.json` |
| E-I | WP-36 | Meshy admissions | key new assets with the owning game's prefix |
| E-A | WP-38 | distinctness | `outdoor-midday` and `kloppenheim_06_puresky` are the same sky |
| E-A | WP-38 / owner | HDRI page weight | 6 catalogue files are 1.63-1.83 MB |
| E-G | WP-38 | `CHANGELOG.md`, `BUNDLE_SIZES.md` | CHANGELOG text; bundle delta; consider a `@aura3d/engine/world` subpath |
| E-I | WP-38 | `tools/game-checks/lib/index.mjs:GU47_CHECK_SEVERITY` | `"warn"` -> `"error"` at the 4.7.0 release gate |
| E-D | E-E (running) | `rendering/src/ForwardPass.ts:registerForwardDrawHook` | optional outline-target ID mask |

## Verification

- Base (`9869206dd`, before the first edit): `published-union.test.ts` FAILS (15 names missing from the published barrel: the GU47 contract types and `Prd02LightingApp` / `RUNTIME_ENVIRONMENT_NODE_ID`); `public-api-contracts.test.ts` 1 pre-existing failure (`examples/custom-shader-webgpu-lab` imports engine internals; also on E-D's base); `t0-1140-root-side-effects`, `external-parity-public-api-stability` pass. `node tools/docs/check-root-exports.mjs` FAILS on the base (stale since E-G's `world` export).
- After P1 (166d4ee7a): `published-union`, `t0-1140-root-side-effects`, `external-parity-public-api-stability`, `prd07 sky-nodes`, `gu47/eg/{sky-stars-clouds,world-heightfield}`, new `gu47/eint/public-surface` all pass; `check-root-exports` ok (296 value exports, 254 live); `tools/public-surface-diff` PASS (0 unclassified removals); eslint clean (`public/index.ts` is eslint-ignored).

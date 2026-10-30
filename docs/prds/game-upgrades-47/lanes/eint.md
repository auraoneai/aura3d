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
| EA-4 | E-A -> E-C/E-A | `contracts/post.ts AuraBloomOptions`, `AuraAssetType "lut"` swap in `contracts/looks.ts` | partial | c046475df | `grade.lut` narrowed to `AuraAssetRef<"lut">` (PRD §3.1; E-A's test now defines `type: "lut", format: "cube"` assets). The `AuraBloomOptions` stand-in stays: `contracts/post.ts` declares no such type (E-C shipped bloom options on the node, not as a contract type). |
| EA-5 | E-A -> E-B | `compiler/environment.ts` hdri rotation | already applied (E-B, 60ec60747) | | renderer half is EB-1 |
| EA-6 | E-A -> E-G | `public/index.ts`: `AuraHdriId`, `lookHdriIds`, `lookHdriUrl`, `lookOutputPreset` | done | 166d4ee7a | |
| EA-8 | E-A -> E-I | materials-environments skill | already applied (E-I, 7a6e1ccbe) | | |
| EB-1 | E-B -> integration | `rendering/src/renderer/Background.ts` environment rotation | done | cf7919b32 | `environmentProbeRotation` (radians) -> `environmentMapRotation` turns on the PRD-02 lighting object (memo keyed on it; ForwardPass -> `u_envRotation`), and the probe background's `rotation` turns unless an explicit background carries one; sign vs background is a phase-2 frame check. `tests/unit/gu47/eint/environment-rotation-renderer.test.ts` |
| EB-2 | E-B -> integration | `compiler/renderer.ts:194` shadowTier | done | cde2e26ce, e5e246537 | passes `explicitMountQualityTier(rendererOptions)` only when the app names a tier (auto/unset keep the coarse-pointer medium / desktop high default, so default unchanged); `production-bridge-boundary.test.ts` source pin updated; `tests/unit/gu47/eint/mount-shadow-tier.test.ts` |
| EB-3 | E-B -> integration, E-D | `rendering/src/shadows/Prd02ShadowBridge.ts` local tiles on the default path | done (phase-2 capture needed) | 2d07ee6e9 | The bridge renders the shadowed spot/point lights of `source.collectedLights` (E-B's selection, capped by the tier's `localShadowLights`) into the PRD-02 local atlas in the same `Prd02ShadowSystem.update` and returns them as `ForwardShadowMapOptions.localShadows` (slots per light, 6 mat4 + rect, per-tile texel scale, strength, texel biases). On those frames `forwardShadedLights` clears the spot/point `castsShadow` gate (the bound map is the sun's) and packs first tile + 1 into the unused `right.w` (`LightUniforms` and the cluster texture); generated programs with `localShadows > 0` (one variant, 6 tiles) emit `shadow_local` and scale each light by its tile, point lights picking the cube face. A scene whose only casters are local lights binds a strength-0 sun map plus the tiles (it bailed `no-sun` before). Scenes without local casters: same shader source and `u_lightData`, no `u_localShadow*` uniforms (pinned by a Renderer test). Limits: legacy (non-generated) forward programs leave local casters unshadowed instead of wrongly sampling the sun map; with `?a3dLighting=atlas=off` the same; a point light gets a slot only when all 6 tiles fit (6-tile atlas cap, so one point light or up to 6 spots); bias constants (1 texel depth, 1 texel normal) are untuned. Phase 2: capture a sun + two shadowed floodlights scene and a point-bulb room (shadow present, no acne/peter-panning), plus a sun-only scene diff = 0 against the base. `tests/unit/gu47/eint/local-shadow-tiles.test.ts` (18, incl. glslang bucketed + clustered) |
| EB-4 | E-B -> integration | `compiler/compileScene.ts:addSubtree/removeSubtree` runtime lights | done | 7037bb81c | `createRuntimeAddedCollectedLights` (observations.ts: physical or legacy descriptors, bound via `bindAuthoredLight`, never a shadow caster, none for ambient/hemisphere); `CompiledSceneImpl` republishes `mountCtx.collectedLights` (mount + runtime lights, new array) so the renderer input AND the light handler's update (setLight/setVisible/setPosition) see them; removeSubtree drops them. Not done: removing a MOUNT-time light keeps its collected light (pre-existing). `tests/unit/gu47/eint/runtime-added-lights.test.ts` |
| EB-5 | E-B -> E-G | `public/index.ts` light/env/fog/sky types | done | 166d4ee7a | |
| EB-6 | E-B -> E-G | `nodes/sky.ts`, `world/biomes.ts` contract sky types, count/brightness | partial (emission declined) | 166d4ee7a | Types swapped by the predecessor. Emission declined: switching the day-night sky / biome presets from the legacy star shape to `count`/`brightness` changes star pixels in those scenes (a default change needing a phase-2 capture), and narrowing `stars` (dropping `AuraSkyStarsLegacySpec`) would break games authoring the legacy shape. Games can author `stars: { count, brightness }` today. |
| EB-7 | E-B -> E-G | `compiler/fog.ts` | already applied (E-G, flip 0d9fe7f98) | | |
| EB-8 | E-B -> E-I | skill doc | already applied (E-I, 7a6e1ccbe, e92e6ccc2) | | |
| EC-1 | E-C -> E-G | `compiler/postprocess.ts` runtime overrides | already applied (E-G, 1c925de2b) | | |
| EC-2 | E-C -> E-F | `nodes/effects.ts` tiltShift / godRayDensity / SSR fields | done | d735f495c | `tiltShift` and `godRayDensity` were already copied (E-F); `screenSpaceReflections` now copies `maxDistance`/`roughness`/`thickness` (new root type `AuraScreenSpaceReflectionsOptions`); public-surface-diff report regenerated. `tests/unit/gu47/eint/ssr-factory-fields.test.ts` |
| EC-3 | E-C -> E-D | `nodes/types.ts AuraAssetType "lut"` | done (alias part declined) | c046475df | `AuraAssetType` gains `"lut"`, so typed `.cube` assets are `AuraAssetRef<"lut">`. `AuraLutAssetRef` kept structural instead of aliasing the branded type: it already accepts `AuraAssetRef<"lut">`, and an alias would break hand-built refs (E-C tests) that compile today. |
| EC-4 | E-C -> E-D | forward fragment `alpha = u_bloomWeight` (selective bloom write) | declined (design + capture) | | The HDR target's alpha is already a channel with meaning (OutputPass coverage: 0 = `toneMapped: false` background, 1 = tone-mapped, `compiler/renderer.ts:outputClearColor`), so writing a 0..max bloom weight there needs a decision (coverage-safe encoding or a separate MRT attachment) and edits every forward program; not provable without pixels. The read side (EC-6) is live and inert until a weight is written; the bridge only stamps `selective` when a material declares `bloom` != 1. |
| EC-5 | E-C -> E-D | forward MRT roughness channel for SSR | declined (optional) | | E-C marked it optional; S3 uses `u_roughness` / the node `roughness` cutoff today. Needs an MRT attachment on the forward target (format, MSAA resolve) and a capture. |
| EC-6 | E-C -> integration | `rendering/src/webgl2/LegacyPost.ts` selective-bloom weight read | done | 77ec234c9 | both HDR prefilters (`BLOOM_BRIGHT_EXTRACT_GLSL`, fused prefilter-downsample) multiply the excess by `auraBloomWeight(alpha, u_bloomSelective)`; `u_bloomSelective` from `options.selective`; `executePostGraphWebGL2` stamps `selective` from `pipeline.bloom.selective`; unstamped = factor 1.0. Optional SSR-descriptor filter not done (not needed). `tests/unit/gu47/eint/selective-bloom-read.test.ts` (incl. glslang) |
| EC-7 | E-C -> E-G (optional) | export `POST_RUNTIME_EFFECTS`, ... | declined | | E-G declined; games use `app.post.*`; root stays lean |
| ED-1 | E-D -> integration | `agent-api/diagnostics.ts` + `app/frameLoop.ts` triangles/textureBytes (ED-7) | done | 62912611c | lazy (one device read per inspected frame, none otherwise) instead of a per-frame `getDiagnostics()` copy: `bindLazyFrameDiagnostics({ deviceCounters })`, `deviceFrameCounters(auraRenderer)`, `snapshotDiagnostics` spreads both when present. `tests/unit/gu47/eint/diagnostics-device-counters.test.ts` |
| ED-2 | E-D -> E-G | `instances.*({ instanceColorTarget })` | already applied (E-G, 17d5dbfa9) | | |
| ED-3 | E-D -> E-G | `public/index.ts` toon/rim/instance-target types | done | 166d4ee7a | |
| ED-4 | E-D -> E-E (finished) | `rendering/src/ForwardPass.ts:registerForwardDrawHook` for an outline-target ID mask | declined (optional; E-E chose another design) | | E-E's targeted outline draws the target items itself through the caster-variant depth program (fe14c8e9a), so no forward draw hook is needed; nothing to wire. |
| EF-1 | E-F -> WP-38 | `tools/finalize-dist/index.ts` ship `aura-vfx-{1k,2k}.png` | done | 159316709 | copied to `dist/assets/vfx/` (+ the CC0 note) after the package loop; `tools/package-tarball-audit` (bans `.png`) allows exactly `dist/assets/vfx/aura-vfx-(1k\|2k).png`; +0.84 MB packed. Full build not run (phase 1). `tests/unit/gu47/eint/finalize-dist-vfx-pages.test.ts` |
| EF-2 | E-F -> E-G | `publishedUnion.ts:312` burst/trail/genre types | done | 166d4ee7a | |
| EF-3 | E-F -> E-I | `tools/real-gpu/scenarios.json` | already applied (E-I, afa026d35) | | |
| EF-6 | E-F -> unowned | `tools/vfx-atlas-bake/bake.mjs` re-bake | declined (binary re-bake needs a visual check) | | Fix is `cy += rows * pitch` for multi-row sequences, then re-bake both pages and restore full rows in `VFX_SPRITE_LAYOUT`; the PNGs (and every sequence rect after the first two-row one) change, which needs a phase-2 look at the sprites. E-F's overlap test flags the layout table when the atlas is re-baked. |
| EF-7 | E-F -> unowned | `rendering/src/vfx/VfxAtlas.ts:sequence` twin rects | done | 4386a8cd4 | `vfxAtlasTwinRect` snaps positions to the twin's pitch (128 + 4 px gutter = 132 px) and scales sizes; equals E-F's `vfxSpriteRect` for every shipped sequence; the PRD-07 test that pinned the halved rect now expects the pitch-based one. `tests/unit/gu47/eint/vfx-atlas-twin-rects.test.ts` |
| EG-1 | E-G -> integration | `createAuraApp.ts` `setWorldBuilderFlags` | done | d93c2fc61 | installed next to `setQrAnimationFlags(qrFlags)`; builders after the app see its flags; apps without declared flags resolve the same defaults. `tests/unit/gu47/eint/world-builder-flags-app.test.ts` |
| EG-2 | E-G -> integration | `public/index.ts` new public types of E-A, E-B, E-D, E-F (E-G could not see them) | done | 166d4ee7a | same commit as EA-6 / EB-5 / ED-3 / EF-2 / EH-1 (P1) |
| EH-1 | E-H -> E-G | `public/index.ts` crowd kit, GLB cache, animation types | done | 166d4ee7a | |
| EH-2 | E-H -> integration | `publishedUnion.ts:9` `AuraPlayLayerOptions`, `AuraActorPoseApi` | done | 166d4ee7a | |
| EH-3 | E-H -> E-G | `nodes/instances.ts:59-62` doc note (skinned crowds) | done | e299307af | on the `instances.model` doc comment (now ~line 213) |
| EH-4 | E-H -> integration | `compiler/renderInput.ts` skinned-fallback warning text | done | b2e39396c | `SKINNED_CROWD_HINT` appended in the engine's `onWarning` (rendering's `warnOnInstancingFallback` untouched); `instances-model-mount-p2.test.ts` asserts it |
| EH-5 | E-H -> integration | `actor/ModelTextureShare.ts:modelTextureShareKey` by value | done | 0eb9c84c3 | `decoders` / `compressedTextureCapabilities` via `GlbResourceCache.valueToken` (now exported); the old identity assertion in `model-texture-share.test.ts` flipped on purpose |
| EH-6 | E-H -> integration | `ProductionGLTFRenderPipeline.ts` / `GLTFAssetParseCache.ts` decoder reuse | done | b8141fe49 | `sharedGLTFDecoderRegistry` per (basePath, workerCount, maxTextureSize, capabilities); failed `require()` drops it (retry semantics kept). `GLTFAssetParseCache.ts` unchanged (its identity key now matches); optional `acquireParsedGLTFAsset` export not added. `tests/unit/gu47/eint/gltf-decoder-registry-reuse.test.ts` |
| EH-7 | E-H -> integration | `createAuraApp.ts` clear the GLB cache on dispose | declined (optional; would defeat the cache) | | The cache is process-wide: games that dispose and recreate the app (restart / level change) and pages with two apps would lose it; `clearGlbResourceCache()` is exported from the root for an SPA leaving the game route. |
| EI-1 | E-I -> E-C/integration | `cli-help.ts:60-61` certify categories | done | 3cf747a0b | both `certify-game-geometry` lines list `racing\|platformer\|sports\|fighting\|arena\|puzzle` (= `CERTIFY_CATEGORIES`) |
| EI-2 | E-I -> integration | `tools/real-gpu/capture.mjs` `evaluate` step | done | 15ebf8bab | step `{ evaluate }` runs after the step's shot; `report.json` games gain `evaluations: [{ expression, shot?, value \| error }]`; logic in `tools/real-gpu/evaluate-step.mjs` (unit-testable without the browser launch); README notes the key. Owner-run tool, not executed. `tests/unit/gu47/eint/real-gpu-evaluate-step.test.ts` |
| EE-H0 | E-E -> E-C (blocking G16/G20/G24) | `agent-api/postBridge.ts:POST_EFFECT_FIELDS.outline` | done | c7d8b7a2b | admits `"targets"`; a scene authoring `outline({ targets })` no longer throws `POST_FIELD_UNSUPPORTED` on the strict v2 chain |
| EE-H1 | E-E -> E-G (blocking) | `agent-api/compiler/postprocess.ts` outline object | done | c7d8b7a2b | `...outlineTargetsField(authoredOutline, nodes)` (flattened, override-applied nodes); no `targets` = byte-identical options; `tests/unit/gu47/eint/outline-targets-wiring.test.ts` |
| EE-H2 | E-E -> E-C (blocking) | `rendering/src/post/v2Stages.ts:runV2LdrTail` | done | 929321878 | `displayCustomLinearDepth`: scene depth (C-13 `sceneDepth.texture` -> `host.textureRegistry`) linearised once per tail with `DEPTH_LINEARIZE_GLSL` into a pooled rgba32f target, bound as `u_depthLinear` for `after-tonemap` customs with `inputs` "depth", released after the loop; stage `S1:depth-prep:after-tonemap`; `tests/unit/gu47/eint/ldr-tail-depth.test.ts` |
| EE-H4 | E-E -> E-C (optional) | `agent-api/postBridge.ts:POST_RUNTIME_EFFECTS` outline | done | bc1eeb83c | `outline` is a runtime effect; `targets` patch validated (array of non-empty names, empty = ink nothing); outline colour patches stay colour strings; `setEffect` patch type admits `readonly string[]`; E-C's runtime-effect list test names eight effects. `tests/unit/gu47/eint/outline-runtime-targets.test.ts` |

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
| E-D | E-E (finished) | `rendering/src/ForwardPass.ts:registerForwardDrawHook` | optional outline-target ID mask (E-E declined: the mask pass draws the target items itself) |
| E-E | G16, G20, G24 | game code | UNBLOCKED (H0/H1 c7d8b7a2b, H2 929321878, H4 bc1eeb83c): author `effects.outline({ color, width, targets: [nodeName \| runtimeId] })`; retarget with `app.post.setEffect("outline", { targets })`; `toon({ inkSource: "depth" \| "both", fadeDistance, inkColor })` now gets depth at the default `after-tonemap` slot |
| E-E | WP-38 (H5) | `docs/api/toon.md`, effects API page | document `inkSource`, `fadeDistance`, `inkColor`, `outline({ targets })` and the runtime `targets` patch |
| E-J | WP-38 | `aura3d-art-direction/SKILL.md:8,83`, `docs/api/game-cheatsheet.md` | maze-arcade row (14 genres), new HUD themes and APIs |
| eint | WP-38 | `CHANGELOG.md` | text below ("CHANGELOG text for WP-38") |

## Verification

- Base (`9869206dd`, before the first edit): `published-union.test.ts` FAILS (15 names missing from the published barrel: the GU47 contract types and `Prd02LightingApp` / `RUNTIME_ENVIRONMENT_NODE_ID`); `public-api-contracts.test.ts` 1 pre-existing failure (`examples/custom-shader-webgpu-lab` imports engine internals; also on E-D's base); `t0-1140-root-side-effects`, `external-parity-public-api-stability` pass. `node tools/docs/check-root-exports.mjs` FAILS on the base (stale since E-G's `world` export).
- After P1 (166d4ee7a): `published-union`, `t0-1140-root-side-effects`, `external-parity-public-api-stability`, `prd07 sky-nodes`, `gu47/eg/{sky-stars-clouds,world-heightfield}`, new `gu47/eint/public-surface` all pass; `check-root-exports` ok (296 value exports, 254 live); `tools/public-surface-diff` PASS (0 unclassified removals); eslint clean (`public/index.ts` is eslint-ignored).
- Lane run 2 (this pass, merged `gu47/integration` with ee + ej first, d2ebeed96). Every item: its covering test files before the edit, then after. New tests `tests/unit/gu47/eint/{selective-bloom-read (4, incl. glslang), outline-targets-wiring (5), ldr-tail-depth (4), environment-rotation-renderer (3), mount-shadow-tier (3), runtime-added-lights (4), diagnostics-device-counters (3), cli-help (2), real-gpu-evaluate-step (2), finalize-dist-vfx-pages (3), world-builder-flags-app (2), gltf-decoder-registry-reuse (3), ssr-factory-fields (2), outline-runtime-targets (4), vfx-atlas-twin-rects (2)}` all pass.
- Touched regression files pass: prd03-bloom-excess/-v2-normalize/-v2-response, pcpost-post-graph-migration, shader-pass-order, prd03-t0-17, gu47/ec/{selective-bloom, ssr, lut, hdr-grade-and-stage-trace, runtime-post-control}, bloom-fusion-select, gu47/ee/{outline-targets-engine, toon-ink}, prd03-post-bridge, e2-wave3-post-handoffs, prd03-s18c-custom-passes, prd03-t0-16, prd02-{environment-knob, neutral-room-legacy, tier-budget, phase3, lighting-diagnostics, legacy-golden-18, root-collected-lights, lighting-legacy-golden}, e2-hemisphere-and-knob, gu47/eb/{set-environment, multi-caster-shadows}, e1-render-path-audit, C-36-compiler, set-light, production-bridge-boundary (source pin updated with EB-2), heatsink/roadster renderer-quality, shader-failures, prd12-diagnostics, e1-app-render-path, e1-wave2-{context-loss, restore-remount}, prd12-t0-12-mount-timing, gu47/ea/optimize-hdri, gu47/ei/real-gpu-scenarios, package-tarball-pack-result, generate-resolution-maps, model-texture-share (identity assertion flipped on purpose, EH-5), gu47/eh/{glb-resource-cache, glb-part-handle, crowd-kit, typed-glb-actor-mixer, root-source-shadows}, gltf-parsed-asset-reuse, typed-glb-actor-asset-reuse, prd05-asset-decoders, asset-decoder-registry, gu47/eg/world-builder-flags, side-effects-allowlist, t0-1140-root-side-effects, look-overrides-47 (LUT assets now `type: "lut"`), published-union, gu47/ef/vfx-atlas-sprites, prd07 vfx-atlas (twin-rect pin updated, EF-7), option-coverage, nonfinite-guards, contact-shadow-mask, prd03-post-bundle-split, current-routes-interactive-renderer-api, silt-and-signal-port audit-fixes.
- Pass 3 (EB-3, 2d07ee6e9): typecheck-delta NEW_ERRORS 0; eslint clean on the 8 touched sources + test; passing after: `contracts/impl/prd02-*` (46 files, 284 + 1 skipped), `agent-api/{prd02-environment-knob, prd02-lighting-composition, prd02-lighting-diagnostics, prd02-lighting-legacy-golden, prd02-root-collected-lights, production-bridge-boundary}`, `C-36-compiler`, `gu47/eb/{multi-caster-shadows, set-environment, set-fog}`, `set-light`, `shader-failures`, `clustered-lighting-b5`, `e1-render-path-audit`, `e2-hemisphere-and-knob`, `contact-shadow-mask`, `gu47/eint/{local-shadow-tiles, mount-shadow-tier, runtime-added-lights}`; every one was in the earlier pass list or passes. A multi-file batch of the eb/lighting/render files hung at 0 % CPU after finishing under machine load (load average 13); the same files pass run one at a time.
- Pre-existing failures (identical without this lane's edits, not caused here): `tests/unit/engine/instances-model-mount-p2.test.ts` "every mesh item carries one matrix per instance..." (`material.getParameter is not a function` in E-D's instance-colour-target path on the mock material); `tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts` "keeps the @aura3d/engine public root import mapped..." (`./examples/**` in `packages/engine/package.json#sideEffects`, unchanged since 4.6.2).
- Public surface: `tools/public-surface-diff` PASS (0 unclassified removals; report regenerated in d735f495c), `tools/agent-api-surface` ok. `check:agent-api`'s whole-directory vitest half not run (machine economy).
- Typecheck delta: see the final line below. eslint clean on every touched file (per commit).
- Not run (phase 1): browsers, the real-GPU harness, the full `pnpm build` (finalize-dist change is pinned by a source test), the tarball audit.

## API as shipped (this pass)

- `@aura3d/engine` root: type `AuraScreenSpaceReflectionsOptions = Omit<AuraEffectNode, "kind" | "effect"> & { readonly maxDistance?: number; readonly roughness?: number; readonly thickness?: number }`; `effects.screenSpaceReflections(options?: AuraScreenSpaceReflectionsOptions)`.
- `AuraAssetType` = `"model" | "texture" | "environment" | "audio" | "navigation" | "lut"`; `AuraLookOverrides.grade.lut?: AuraAssetRef<"lut">`.
- `AuraPostSurface.setEffect(name: string, patch: Record<string, number | string | boolean | number[] | readonly string[]>): void`; `POST_RUNTIME_EFFECTS.outline = "outline"` (`app.post.setEffect("outline", { targets: string[], color?, width?, threshold? })`).
- `effects.outline({ targets })` validates on the v2 chain (`POST_EFFECT_FIELDS.outline` = `["color", "width", "threshold", "targets"]`) and compiles into `RendererPostProcessOptions.outline.targets`.
- `app.diagnostics().triangles?: number`, `app.diagnostics().textureBytes?: number` (device counters, mounted apps).
- Engine internals (not root): `explicitMountQualityTier(rendererOptions?): AuraQualityTier | undefined` (`compiler/renderer.ts`); `createRuntimeAddedCollectedLights(nodes, flags?, options?): { node: AuraLightNode; lights: readonly CollectedLight[] }[]` (`compiler/observations.ts`); `MountSceneCompileContext.collectedLights` is now writable; `DeviceFrameCounters`, `deviceFrameCounters(auraRenderer: unknown): DeviceFrameCounters | undefined`, `bindLazyFrameDiagnostics(state, { ..., deviceCounters? })` (`agent-api/diagnostics.ts`); `SKINNED_CROWD_HINT` (`compiler/renderInput.ts`); `valueToken(value: unknown): string` (`production-runtime/GlbResourceCache.ts`).
- Rendering internals: `NativeBloomOptions.selective?: true` (`webgl2/LegacyPost.ts`); `VFX_ATLAS_GUTTER = 4`, `vfxAtlasTwinRect(rect, columns, scale): [number, number, number, number]` (`vfx/VfxAtlas.ts`).
- Assets: `sharedGLTFDecoderRegistry(options: AssetDecoderRegistryOptions)`, `dropSharedGLTFDecoderRegistry(registry)` (`asset-corpus/ProductionGLTFRenderPipeline.ts`).
- Tools: `tools/real-gpu/evaluate-step.mjs` `evaluateStep(page, expression, shot?)`; scenario step key `evaluate` executes; `tools/finalize-dist` ships `dist/assets/vfx/aura-vfx-{1k,2k}.png` (+ LICENSE.md); `tools/package-tarball-audit` allows exactly those two PNG paths.
- CLI help: `aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube] --file in.hdr --out out_1k.hdr [--json]`; `certify-game-geometry --category racing|platformer|sports|fighting|arena|puzzle`.

## CHANGELOG text for WP-38

- Outlines can target nodes: `effects.outline({ targets: ["rider"] })` inks only those nodes' silhouettes (node names or `.runtime({ id })` ids; model nodes match their model id), and `app.post.setEffect("outline", { targets })` retargets it at runtime. A scene that authored `targets` no longer fails `app.ready()` with `POST_FIELD_UNSUPPORTED`.
- `toon({ inkSource: "depth" | "both", fadeDistance })` gets scene depth at its default `after-tonemap` slot (custom display passes that declare `inputs: ["depth"]` receive linear depth).
- `setEnvironmentRotation` / `setEnvironment({ rotationDeg })` / the authored HDRI rotation now turn the image-based lighting and the HDRI background together.
- Lights added at runtime (`app.nodes.add(lights.point(...))`) render and answer `setLight` / `setVisible`; they do not cast shadows.
- `renderer: { quality: "low" | "medium" | "high" | "ultra" }` caps local shadow casters (0 / 1 / 2 / 4); `auto` keeps the device default.
- `app.diagnostics()` reports `triangles` and `textureBytes`.
- `effects.screenSpaceReflections({ maxDistance, roughness, thickness })` fields reach the reflection pass; `effects.bloom({ knee, clampLuminance })` reach bloom; selective bloom reads the per-material weight once materials write it.
- A look's declared post preset applies when `output.preset` is unset (default change, revertible: 5a87c2abc).
- Typed `.cube` assets are `AuraAssetRef<"lut">`; `looks.preset(id, { grade: { lut } })` takes one.
- Compressed GLBs (draco / meshopt via `assets.decoders`) and their textures are parsed once and reused across loads and `setScene`.
- The npm package ships the built-in VFX sprite pages, so `sprite: "smoke-a"` emitters draw outside the monorepo.
- CLI: `assets optimize --hdri` help shows `--file/--out`; certify lists sports, fighting, arena and puzzle.

## Phase-2 capture plan (remote runner; nothing run here)

- `tests/browser/gu47/outline-targets.spec.ts` (E-E's spec): now runnable — >= 60 % target perimeter inked, < 0.5 % sky edges, non-target un-inked; plus the depth-toon frame at the default slot (H2).
- `effects-selective-bloom` (E-C's spec): stays inert until a forward pass writes the weight (EC-4 declined); expect "bloom-selective == bloom-off" on the wall region and no change on the lamp until then.
- `envRotation` frames (E-B): rotate 0 / 90 / 180 deg; the background and the specular highlight must move the same way (sign check for EB-1).
- Runtime light add: a scene adding a `lights.point` after mount — the lit region appears; `setVisible(false)` removes it.
- Real-GPU `fc-vfx` / `links-vfx` / `iron-crown-vfx`: `report.json` now carries `evaluations` (`__AURA_VFX_DEBUG__()`).
- 1k-tier VFX sprites (`?quality=low`): sprite cells centred (EF-7), no 4 px bleed from the neighbouring cell.


## Pass 4 (game-lane handoffs)

Base: `gu47/integration` at bcc1c7d79 (all engine and game lanes merged). Input: the 108 handoff rows of `/tmp/gu47-gates/game-handoffs.txt` (25 lane reports, header rows dropped). Target column abbreviated to the first file or symbol.

| # | lane | to | target | status | commit | reason / note |
|---|---|---|---|---|---|---|
| 1 | g01 | E-B / integration | `packages/rendering/src/shadows/Prd02ShadowBridge.ts:executePrd02BridgedShadowMap` | applied | 2d07ee6e9 (pass 3) | EB-3 renders shadowed spot/point tiles on the default forward path; pixels phase 2 |
| 2 | g01 | E-C | `packages/engine/src/lanes/prd01/outputSurface.ts:toRendererOutput` / `setOutput` | deferred | - | runtime `setOutput({ preset })` needs the preset expansion applied outside mount (E-C); `app.post.setEffect` covers per-venue effect patches today |
| 3 | g01 | E-C | `packages/engine/src/agent-api/compiler/postprocess.ts` (SMAA) and the `anti-alias` nod... | declined | - | SMAA is a new post pass (shader, edge/blend targets); not small |
| 4 | g01 | E-A | `public/hdri/` | deferred | - | WP-36/E-A asset job: 2k HDRI copies via `aura3d assets optimize --hdri 2k` |
| 5 | g01 | E-B / E-G | `agent-api/nodes/probes.ts:probes`, `rendering/src/probes/Prd02ProbesContributor.ts:spe... | declined | - | root `probes` export plus box/dirty wiring only make sense once mounted apps install a probe face renderer (row 92); until then the node draws nothing |
| 6 | g01 | E-J | `packages/engine/src/contracts/art.ts:GameGenre`, `packages/game/src/art/define.ts:GAME... | deferred | - | E-J/WP-38: a new GameGenre needs its own look recipe and audit rules |
| 7 | g02 | E-F (ef) | `packages/engine/src/contracts/effects.ts:AuraAppEffects.trail` / `ProductionEffectSyst... | applied | 970499d4d, 2082f3913 | `AuraTrailHandle.translate(dx, dy, dz)` (call per frame with the world offset); instanced rivals: see row 75 |
| 8 | g02 | E-A (ea) | `packages/engine/src/agent-api/looks/looks.ts:applyOverrides` / `AuraLookOverrides.key` | deferred | - | E-A: `key.runtime` on look overrides changes the look child ids; the name-mapped child works today |
| 9 | g02 | E-C (ec) | post chain | declined | - | screen-space distortion stage is a new post pass; not small |
| 10 | g02 | E-I (ei) | `tests/browser/game-luma-targets.ts:VARIANT_PARAMS`, `GAME_LUMA_TARGETS` | applied | 2b0946cee | `VARIANT_PARAMS["roadster-rush"] = "tod"`, rows `roadster-rush--dusk` / `--night` |
| 11 | g02 | E-I (ei) | `tools/real-gpu/scenarios.json` | applied | ec17f1814 | `roadster-rush--dusk` / `--night` scenarios plus an evaluate step (draws, apex QA) on the base scenario |
| 12 | g02 | WP-38 | `CHANGELOG.md` | deferred | - | WP-38 release text |
| 13 | g02 | WP-36 | asset table below | deferred | - | WP-36 assets |
| 14 | g03 | E-G | `packages/engine/src/public/index.ts`: `probes` | declined | - | same as row 5 |
| 15 | g03 | G/E-I (art contract) | `packages/game/src/art/define.ts:186` `lighting.practicals` <= 6 | declined | - | practicals cap is the C-35 art contract; WP-38 decides (budgets are not raised to pass, PRD D7) |
| 16 | g03 | E-A | `public/hdri/rooftop_night_1k.hdr`, `public/hdri/spruit_sunrise_1k.hdr` | deferred | - | E-A/WP-38: HDRI re-encode under 1.5 MB |
| 17 | g04 | E-I | `tests/browser/game-luma-targets.ts`: teleoperator rows (`TELEOP_SKIES`, line 127) | applied | 2b0946cee | teleoperator rows load `?sky=<k>&intro=0` and click the dock button (works on 4.6.0 and 4.7); comment says Marine dusk boots |
| 18 | g04 | E-B | engine height fog (`compiler/fog.ts`, `HeightFog.ts` legacy pack) | declined | - | aloft fog layer is a new fog model (shader + pack); not small |
| 19 | g04 | E-F | `AuraAppEffects.trail` | applied | 970499d4d | `translate()` covers the scrolling-world wake; a view-space trail mode is not added |
| 20 | g04 | E-I | `tests/browser/game-luma-targets.ts` teleoperator crops | applied | 2b0946cee | no code change: the capture already reads `window.__AURA_QA__.crops` and every `__AURA_<NAME>__.crops` hook |
| 21 | g04 | E-F | `ProductionEffectSystem` `beamSpec` / beam-family nodes | declined | - | runtime position for beam-family effects needs a beam handle API (E-F); not small |
| 22 | g04 | E-F | emitters (`AuraBurstOptions` / spawn) | declined | - | emitter frame velocity needs a per-emitter world offset in the CPU/GPU sims; not small |
| 23 | g04 | E-I | teleoperator luma capture | applied | 2b0946cee | `intro=0` on every teleoperator row |
| 24 | g04 | E-D | `createAuraApp` option `qualityRebuild.flags` type | applied | c45d7f589 | `qualityRebuild.flags?: QrFlagInput`; the GD-00 cast can go |
| 25 | g05 | E-G / eint | `packages/engine/src/index.ts`: `probes` | declined | - | same as row 5 |
| 26 | g05 | E-H / eint | `agent-api/camera/layers/cinematicBars.ts`: `createCinematicBarsLayer` | applied | f41e9722e | root export of `createCinematicBarsLayer` + types; `open()` after `release()` |
| 27 | g05 | E-C | `effects.post.ts` | declined | - | same as row 9 |
| 28 | g05 | E-I / owner | `apps/showcase-iron-crown/src/aura-assets.ts` | deferred | - | game folder and owner decision (typegen shape); not an engine file |
| 29 | g05 | E-I | `tools/game-checks` `borrowed-asset` | applied | - | no change needed (warnings clear when WP-36 assets land) |
| 30 | g06 | E-C / eint | `contracts/post.ts:AuraPostSurface` | applied | - | no change needed: `app.quality.tier` and `app.quality.onChange` already exist (A3D_QR_TIERS, prd11) |
| 31 | g06 | E-B | local spot shadows on the default bridge path | applied | 2d07ee6e9 (pass 3) | same as row 1 |
| 32 | g06 | wp36 | assets below | deferred | - | WP-36 assets |
| 33 | g07 | E-I / C-35 owner | `packages/game/src/art/audit.ts` (shadowed-light rule for `basketball`) | declined | - | same as row 15 (shadowed-light rule is the C-35 audit) |
| 34 | g07 | E-A | HDRI catalogue | deferred | - | same as row 4 |
| 35 | g07 | E-C | `effects.bloom` | applied | 2ccfb4823 | `effects.bloom({ name })` keeps the name |
| 36 | g07 | E-G | `weather.precipitation` / `wetGround` | deferred | - | E-G: an option to omit the legacy weather primitives; games drop them by tag meanwhile |
| 37 | g08 | E-I | `packages/game/src/art/audit.ts:auditArtDirection` (maxShadowed) | declined | - | same as row 33 |
| 38 | g08 | E-J | `packages/engine/src/contracts/art.ts:GameGenre`, `packages/game/src/art/define.ts:GAME... | deferred | - | same as row 6 |
| 39 | g08 | E-A | `public/hdri/<id>_2k.hdr` for belfast_sunset_puresky, rooftop_night, outdoor-midday, sp... | deferred | - | same as row 4 |
| 40 | g08 | E-B / E-G | `packages/engine/src/public/index.ts` | declined | - | same as row 5 |
| 41 | g08 | E-C | `packages/engine/src/agent-api/postBridge.ts:createRootPostPipeline` | applied | 5a87c2abc (pass 2) | `createRootPostPipeline` applies `lookOutputPreset` when `output.preset` is unset |
| 42 | g08 | E-C / E-F | `packages/engine/src/agent-api/nodes/effects.post.ts:bloom`, `nodes/types.ts:AuraEffect... | applied | 2ccfb4823, c8d47804c | bloom keeps `name`; `lightPosition` is `[u, v]` (forward UV anchor) or `[x, y, z]` (v2 god-ray world point) |
| 43 | g09 | eint / E-B | `packages/engine/src/public/index.ts` | declined | - | same as row 5 |
| 44 | g09 | eint / E-C | look `output.preset` child | deferred | - | the root pipeline reads the look preset from each snapshot it derives; a venue switch that keeps the boot operator needs an E-C trace of where the operator is latched (phase 2 capture first) |
| 45 | g09 | eint / E-D | `contracts/materials.ts:AuraModelMaterialOverride` | applied | 4048800e4 | `sheen`, `sheenColor`, `sheenRoughness` on `AuraModelMaterialOverride` |
| 46 | g09 | eint / E-F | `agent-api/nodes/effects.ts:snow` | applied | 2ccfb4823 | `effects.snow({ size })` (also `radius`, `seed`, `name`) reaches the volume lowering |
| 47 | g09 | E-J | `contracts/art.ts:GameGenre` | deferred | - | same as row 6 |
| 48 | g09 | eint / E-G | `agent-api/nodes/text3d.ts` | declined | - | runtime `setText` on text3D needs geometry rebuild and handle plumbing; not small |
| 49 | g09 | eint / E-C | `compiler/lensFlare.ts` | declined | - | depth-occluded lens flares need a depth read in the flare pass; not small |
| 50 | g09 | repo owner | `.gitignore` | deferred | - | repo owner (.gitignore) |
| 51 | g09 | wp36 | asset needs below | deferred | - | WP-36 assets |
| 52 | g10 | E-A | `public/hdri/` | deferred | - | same as row 4; the 2k id in the `hdri` override waits for the files |
| 53 | g10 | E-J / E-I | `packages/game/src/art/audit.ts:auditArtDirection` (`SHADOWED_SPOT_GENRES`) | declined | - | same as row 33 |
| 54 | g11 | E-B / eint | rendering forward program, local spot shadow lookup | applied | 2d07ee6e9 (pass 3) | same as row 1 (PCSS filter per tier unchanged) |
| 55 | g11 | E-G / eint | `agent-api/compiler/paritySurfaces.ts` mirror capture | declined | - | mirror capture honouring runtime visibility needs the parity-surface compiler to track handles; not small |
| 56 | g11 | E-J | `packages/game/src/art/audit.ts` | declined | - | same as row 33 |
| 57 | g11 | E-B / eint | `packages/engine/src/public/index.ts` | declined | - | same as row 5 |
| 58 | g11 | E-C / eint | `agent-api/compiler/fog.ts` | declined | - | changes forward fog colour for every scene that authors both `fog` and `volumetricFog` (a default change); needs a phase-2 capture before it lands |
| 59 | g12 | E-C/E-F | `effects.post.ts:bloom`, `effects.ts:rain` | applied | 2ccfb4823 | bloom and rain keep `options.name` |
| 60 | g12 | E-J | `packages/game/src/art/define.ts` genre list | deferred | - | same as row 6 |
| 61 | g13 | E-G | `packages/engine/src/public/index.ts` | declined | - | same as row 5 |
| 62 | g13 | E-F | `packages/engine/src/agent-api/nodes/effects.ts:particles` | applied | 868ddc9e3 | `effects.particles({ speed: [min, max] })` type-checks |
| 63 | g13 | E-A | `contracts/looks.ts` | deferred | - | E-A: a new look id (`workbench-night`) is a look-catalogue change |
| 64 | g13 | WP-36 | asset table above | deferred | - | WP-36 assets |
| 65 | g14 | E-D | `packages/engine/src/contracts/materials.ts:AuraModelMaterialOverride` | applied | 4048800e4 | same as row 45 |
| 66 | g14 | E-G / E-B | `packages/engine/src/agent-api/nodes/sky.ts` | declined | - | runtime sky handle (`setSky`) is a new node-handle API; not small |
| 67 | g14 | E-G | app surface | applied | - | same as row 30 |
| 68 | g14 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `cross-hop--original` (`?look=original`) in the GU47 groups (not next to theme0: groups follow list order and `@g1..@g8` stay fixed); crops come from `__AURA_QA__.crops` |
| 69 | g14 | WP-38 | `art/direction.ts` `lighting.practicals` | deferred | - | WP-38 decision |
| 70 | g15 | E-I | `tests/browser/game-luma-targets.ts` strange-orbit-port rows | applied | 2b0946cee | `strange-orbit-port--original`, `--neutral-env` on the dev route |
| 71 | g15 | E-I | `tools/real-gpu/scenarios.json` | applied | ec17f1814 | `strange-orbit-port--autopilot` (`/apps/craterline-gp/?autostart=1&autopilot=1`, shots at 25 s and 60 s); the `?boost` window is not scripted (no boost param in the game) |
| 72 | g15 | E-G | (verify) `environments.capture` with `include: "all"` | deferred | - | verification only; phase-2 capture |
| 73 | g16 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | no code change: the `sun` crop comes from the game hook, which the capture reads |
| 74 | g16 | E-B | engine | deferred | - | E-B: a fallback environment on HDRI load failure needs a node `fallback` field consumed by the probe upgrade-failed path; today the procedural floor stays |
| 75 | g17 | E-F | `agent-api/vfx/effects-api.ts` `trail` | declined | - | instanced trail targets need an instance-matrix resolver in the effect system; not small |
| 76 | g17 | E-B | `contracts/lighting.ts` shadow options | declined | - | runtime shadow cascades change the shadow atlas layout at runtime; larger feature |
| 77 | g17 | E-I | `tools/game-checks/data/terms.json` `assetOwners.prefixes` | applied | 80638b510 | prefix `serpent` |
| 78 | g18 | E-B / E-D (probes owner) | `packages/engine/src/agent-api/nodes/probes.ts` `probes.reflection`, compiler | declined | - | same as row 5 (reflection-probe consumer is a larger feature) |
| 79 | g18 | WP-38 / C-35 owner | `packages/game/src/art/define.ts` practicals rule, `audit.ts` too-many-practicals | declined | - | same as row 15 |
| 80 | g18 | E-B | `ForwardPass.ts` equirect `u_environmentMapRotation` vs cube path | applied | - | checked, no change: `indirect_default.glsl` treats the uniform as turns on both the equirect (u offset) and cube (angle = turns x 2 pi) paths; the background converts turns to radians (`ForwardPass.ts:1937`) |
| 81 | g18 | E-C | `nodes/types.ts` `lightPosition` vs `postBridge.ts:1280` `lightWorld` | applied | c8d47804c | same as row 42; `AuraDepthOfFieldOptions.enabled` declined: no consumer reads a node-level `enabled`, use `app.post.setEffectEnabled("depthOfField", false)` |
| 82 | g18 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `drift-and-deliver-port--original`; crops come from the hook |
| 83 | g19 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `heatsink-port--original`; district rows deferred until the game reads `?at=` |
| 84 | g19 | E-F | `contracts/effects.ts` `AuraTrailOptions` | applied | 970499d4d | `AuraTrailOptions.colorTail` |
| 85 | g19 | E-C | post runtime | applied | e53e6dcd9 | `POST_RUNTIME_EFFECTS.ambientOcclusion`, `.filmGrain` |
| 86 | g20 | E-E / E-H | `production-runtime` root render sources | applied | d68b9014a | the mask pass selects from the frame's collected `items` (`Renderer.ts` postFrameContext), where root sources contribute; label matching was the gap (row 87); pixels phase 2 |
| 87 | g20 | E-E | `packages/rendering/src/renderer/OutlineTargets.ts:outlineTargetLabelMatches` | applied | d68b9014a | `<target>:` and `<target>-<n>:` prefixes match root-source actor labels |
| 88 | g20 | E-H | `TypedGLBActor` | declined | - | bone pose overrides on mixer-driven actors are a new animation API; larger feature |
| 89 | g20 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `ninja-runner-port--gate-cones-off` (`?at=2500&cones=0`) |
| 90 | g20 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `ninja-runner-port--original`, `--village-lanterns-off` (`?at=100&lanterns=0`) |
| 91 | g21 | E-I | `tests/browser/game-luma-targets.ts` `last-train-port--band-*` | applied | 2b0946cee | band rows now `?band=<X>&title=0` (ids unchanged) |
| 92 | g21 | E-B | `production-runtime` frame host: `installPrd02ProbeRenderer` (`packages/rendering/src/p... | declined | - | installing a scene face renderer for mounted apps (six-face capture per probe) is a larger feature |
| 93 | g21 | E-F | `production-runtime/effects/EffectNodeLowering.ts` rain/snow volume | declined | - | runtime weather on/off through the node handle needs volume-handle plumbing (E-F); not small |
| 94 | g21 | WP-36 | assets | deferred | - | WP-36 assets |
| 95 | g21 | WP-38 | PRD §6.1 duplicates | deferred | - | WP-38 |
| 96 | g22 | E-C | `packages/engine/src/agent-api/nodes/effects.post.ts:bloom` | declined | - | no warning fires: the deprecation check reads `postAuthored` only, and `effects.bloom({ scatter })` validates clean (test in 2ccfb4823); dropping the `radius` default would change the legacy bridge |
| 97 | g22 | E-C | velocity MRT for `material.custom` | declined | - | velocity MRT for custom shader programs is a new material output; not small |
| 98 | g22 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | Saltwind waits on `texturesReady()` when the hook has it; `--sunbreak\|redline\|halo-original` rows; static crops car/road/sky/sea |
| 99 | g22 | E-I | `tools/real-gpu/scenarios.json` | applied | ec17f1814 | evaluate `fx()` and `texturesReady()` on the `roadster-hours-port` scenario |
| 100 | g23 | E-I | `tools/game-checks/data/terms.json` `assetOwners.prefixes` | applied | 80638b510 | prefix `wind` |
| 101 | g23 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `where-the-wind-wanders-port--bell` (`?found=bell`) |
| 102 | g23 | E-C | `packages/engine/src/agent-api/nodes/effects.ts` volumetricFog (P2 now patches density ... | applied | c8d47804c | no new field: the v2 god-ray stage already takes its direction from the strongest directional key; a 3-number `lightPosition` now gives a world anchor |
| 103 | g24 | E-A / WP-38 | `public/hdri/kloppenheim_02_1k.hdr`, `spruit_sunrise_1k.hdr` | deferred | - | same as row 16 |
| 104 | g24 | E-I | `tests/browser/game-luma-targets.ts` | applied | 2b0946cee | `silt-and-signal-port--ch0-original` .. `--ch6-original` |
| 105 | g24 | E-I | `tools/real-gpu/scenarios.json` | applied | ec17f1814 | `silt-and-signal-port--ch4` storm scenario (ch0 is the base scenario) |
| 106 | g24 | E-E | `effects.toon.ts` | applied | - | no change: E-E H2 binds depth at the default slot (pass 2) |
| 107 | g25 | E-C | `compiler/customMaterial.ts` / bloom weight | declined | - | per-material bloom weight for `material.custom` waits for forward passes to write the weight at all (EC-4 declined in pass 2) |
| 108 | g25 | E-I | `tools/game-checks/data/terms.json` `assetOwners.prefixes` | applied | 80638b510 | `cumulus` already routes to cloud-runner-port (test pins it); `drift` added for g18 |

Counts: applied 48 (of which no code change needed: rows 20, 29, 30, 67, 73, 80, 106; done in earlier passes: rows 1, 31, 41, 54), declined 33, deferred 27 (WP-36 assets, WP-38 release items, E-A HDRI files, E-J genres, owner decisions).

Also fixed: `tests/unit/splat-rush-port/gu47-look.test.ts` TS2352 (5fac88b9f), the one NEW_ERRORS row of the engine typecheck delta on the merged base.

### Pass 4 API as shipped

- `AuraTrailOptions.colorTail?: AuraColor`; `AuraTrailHandle.translate?(dx: number, dy: number, dz: number): void` (always present on engine handles).
- `AuraModelMaterialOverride.sheen?: number` (0..1, scales `sheenColor`, default white), `sheenColor?: AuraColor`, `sheenRoughness?: number`.
- `POST_RUNTIME_EFFECTS.ambientOcclusion = "ambient-occlusion"`, `.filmGrain = "film-grain"` (`app.post.setEffect` / `setEffectEnabled`).
- `AuraEffectNode.lightPosition?: readonly [number, number] | readonly [number, number, number]` (UV anchor or v2 god-ray world point).
- `AuraWeatherEffectOptions` (root type) = rain/snow options plus `size?: number | readonly [number, number]`, `seed?: number`; rain/snow/bloom keep an authored `name`.
- `effects.particles` option type: `Omit<AuraEffectNode, "kind" | "effect" | "speed">` (emitter `speed: AuraRange`).
- `AuraCreateAppOptions.qualityRebuild.flags?: QrFlagInput`.
- Root: `createCinematicBarsLayer`, types `AuraCinematicBarsLayer` (new `open()`), `AuraCinematicBarsOptions`.
- Outline targets: `outlineTargetLabelMatches` also matches `<target>:` and `<target>-<digits>:` label prefixes (root-source actors).
- Tools: `GAME_LUMA_TARGETS` 148 rows (68 pre-GU47 unchanged in `@g1..@g8`; GU47 rows `@g9..@g17`), new exports `EXTRA_VARIANT_PARAMS`, `GU47_READY_WAITS`, `SALTWIND_CROPS`, `ROADSTER_RUSH_TODS`; `tools/real-gpu/scenarios.json` variant keys `<slug>--<variant>` (15); `terms.json` prefixes `serpent`, `drift`, `wind`.

### Pass 4 CHANGELOG text for WP-38

- Trails: `handle.translate(dx, dy, dz)` shifts a running trail, so games that scroll the world past a fixed subject get a wake; `trail(target, { colorTail })` fades the ribbon from its head colour to a tail colour.
- Model material overrides take `sheen`, `sheenColor` and `sheenRoughness` (fabric, fur, felt).
- `app.post.setEffectEnabled("ambientOcclusion" | "filmGrain", false)` drops ambient occlusion and film grain at runtime without a rebuild.
- `effects.volumetricFog({ lightPosition: [x, y, z] })` aims the god rays at a world point; a two-number `lightPosition` stays the screen anchor.
- `effects.bloom({ name })`, `effects.rain({ name })` and `effects.snow({ name, size, radius, seed })` keep those fields.
- `effects.particles({ speed: [min, max] })` type-checks; `createAuraApp({ qualityRebuild: { flags: { A3D_QR_POST: true } } })` accepts the record form.
- `createCinematicBarsLayer` is exported from `@aura3d/engine`; `bars.open()` brings the letterbox back after `release()`.
- `effects.outline({ targets: ["hero"] })` inks typed GLB actors drawn through `attachRootRenderSource` (actor ids `hero` or `hero-0`).

### Pass 4 verification

- Typecheck delta (engine and tools): NEW_ERRORS 0 at the head (58 errors, baseline 58; the merged base had 1 new error, fixed in 5fac88b9f). `--app` delta NEW_ERRORS 0 for all 25 live game app folders.
- New tests (pass): `tests/unit/gu47/eint/{game-checks-prefixes (2), outline-root-source-labels (3), effect-builder-passthrough (4), runtime-ao-grain (1), quality-rebuild-flags-type (1), volumetric-light-position (2), cinematic-bars-reopen (2), material-sheen-override (2), trail-translate-color-tail (3)}`; `tests/unit/game-luma-targets.test.ts` (12, 4 new); `tests/unit/gu47/ei/real-gpu-scenarios.test.ts` (4, 1 new).
- Touched or covering suites, run one file at a time (vitest --maxWorkers=1, timeout 600), all pass: ninja-runner-port/gu47-look, bunker-zero/art-direction, game-checks/gu47-checks, gu47/ee/{outline-targets, outline-targets-engine}, gu47/eint/{outline-targets-wiring, outline-runtime-targets, real-gpu-evaluate-step, bloom-grade-fields, public-surface}, agent-api/{agent-api, e2-wave3-post-handoffs, published-union}, contracts/impl/{prd03-post-diagnostics, prd03-post-v2-codemod, prd03-post-authored, prd03-post-exposure-aa, prd03-post-presets, prd03-post-bridge, prd03-t0-29-dual-ao-mount, prd04-overrides}, gu47/eg/{post-runtime-hook, post-only-tiers}, rendering/{bloom-fusion-select, volumetric-fog, volumetric-light, shadow-family-b1, shadow-filter-tier}, gu47/ec/{ssr, selective-bloom, runtime-post-control (key list and the unknown-effect example updated), tilt-shift-god-ray-density, hdr-grade-and-stage-trace}, gu47/ea/optimize-hdri, gu47/ed/{emissive-overrides, material-rim}, gu47/ef/{trail, floating-dot, vfx-atlas-sprites}, game/rumble-fxpass, pips-big-leap/vfx, splat-rush-port/gu47-look, bunker-zero/hatch, engine/external-parity-public-api-stability.
- Public surface: `tools/public-surface-diff` PASS (0 unclassified removals, report regenerated); `docs/api/root-exports.md` regenerated (297 value exports, 255 live); `tools/agent-api-surface` ran clean. `tests/qr/prd01/unit/t0-1140-*` not run (separate vitest config).
- eslint clean on every touched file. Not run: browsers, Playwright, real-GPU harness, remote runs (phase 1 rules).

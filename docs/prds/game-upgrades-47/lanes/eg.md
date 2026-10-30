# Lane eg (E-G, WP-7 flags, world, sky, instancing) report

- Branch: `gu47/eg` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eg`)
- Base commit: `f797808be` (`gu47/integration`). `gu47/ec` (finished, head `966e0510d`) is merged in at `99f195f33` so E-C handoff 1 could be applied verbatim; E-C touched no E-G file, so the integration merge of E-C then E-G is conflict-free.
- Wave: 1 (phase 1, code only; no browsers, no remote runs)
- Contract: PRD lines 253-262; checklist 426-433; owned files PRD §4.1 E-G row (line 323) plus `public/index.ts`, `nodes/instances.ts`, `evidence/game-upgrades-47/flag-promotion/`.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EG-0 predecessor work | - | done | e3f7772ae, d568cbb93 | Reviewed and committed the stopped predecessor's 9 files. Fixed two bugs in it: the baked `world.grass({ heightAt })` grid was drawn by the terrain pass (the pass draws every listed record; it is now a sampling-only record), and its normalized heights put every blade off by the grid minimum (handle and grass shader ignore `origin[1]`; now raw metres with `heightScale` 1). |
| EG-1 promotion prep (5 flags) | M | done (flips: see FLIP rows); capture phase 2 | 3c43c1213, 448a52f32 | Flag-on audit + fixes so scenes without the feature get no extra pass, draw, shader feature or MRT output: `prd07.fog` feature now selects only while a fog node is live; registered `prd03.velocity` feature needs a prepared temporal frame (`velocityFramePrepared`); new `prd10.waterOnly` contributor makes `A3D_QR_WORLD_WATER` draw without WORLD (its passes rode the WORLD-gated contributor) and emits nothing without water; sky and skinned-shadow paths were already no-ops. A promoted sub-flag stays off when its lane flag is explicitly off (`contracts/flags.ts`). `tests/unit/gu47/eg/flag-promotion-noop.test.ts` (9 pass). 64-target plan and table: `evidence/game-upgrades-47/flag-promotion/README.md`. |
| EG-2 `A3D_QR_TIERS` post-only mode | M | done | 9a2e0f285 | Sub-flag `A3D_QR_TIERS_POST` (`tiers.post`); `flags.on("A3D_QR_TIERS")` stays false, so no controller, governor, pools or forward/shadow tiers. A collect contributor gated on it records `resolvePostOnlyTier(device.probe)` (C-27 `TierResolver` steps 1-3, capped at High) per canvas; `resolvePostQualityTier` makes `auto` follow it (the first frame keeps High). `tests/unit/gu47/eg/post-only-tiers.test.ts` (5 pass). |
| EG-3 builder flags honour app flags | M | done | e3f7772ae, d568cbb93 | `world.useAppFlags(qualityRebuild)` (= `setWorldBuilderFlags`); builder reads (`water.surface`, `environments.outdoor`) resolve the declared app flags, then `?a3d-qr=` (unless `allowUrlFlags:false`), then env, like `createAuraApp`. `tests/unit/gu47/eg/world-builder-flags.test.ts` (6 pass). |
| EG-4 `world` export + heightfield sampler | M | done | e3f7772ae, d568cbb93 | `world` and its types exported from `public/index.ts`; `world.scatter({ heightAt })` (heights + slope from the sampler), `world.grass({ heightAt, bounds, resolution? })`; scatter result carries per-asset `instances.model` transforms. `tests/unit/gu47/eg/world-heightfield.test.ts` (8 pass). |
| EG-5 typed sky stars/clouds | M | done-interim (E-B) | e3f7772ae, 864d64a36 | `AuraSkyStarsOptions { count, brightness? }`, `AuraSkyCloudsOptions { coverage, speed?, color? }` on `sky.preetham` / `sky.gradient` (gradient gains `clouds`); StarField `count` → density, CloudLayer `speed` multiplier (1 = old drift) + `color` tint (`u_cloudTint`); gradient skies now show stars/moon at night (`gradientSunfade`, day stays 1) and light their clouds from the gradient (they drew black). Local mirror marked `GU47(E-B)`; E-B's branch declares identical contract types (wave-2 swap). `tests/unit/gu47/eg/sky-stars-clouds.test.ts` (10 pass). |
| EG-6 instances wind / custom wind / per-instance lights | M | done | 17d5dbfa9, f735c70fe | `wind?: boolean \| (world.wind options & { assetHeight? })` on `instances.model`, `instances.custom` and every instanced primitive: new sub-flag `A3D_QR_WORLD_WIND` (implied by `world`) gates the Path G `prd10.wind` deform; `INSTANCE_WIND_CONTRIBUTOR` (registered on the first wind build) labels the wind nodes' items `prd10.wind:` and publishes the frame's wind unless WORLD publishes its own. `instances.model({ lights: { offset, color, power, distance } })` returns a group: model + one `lights.point` per instance at `position + R(rotation)·(scale·offset)`. `tests/unit/gu47/eg/instance-wind.test.ts` (9), `instances-options.test.ts` (5). |
| EG-7 `instanceColorTarget` | M | done-interim (E-D) | 17d5dbfa9 | Accepted on every `instances.*` builder (not reported as ignored) and stamped on the node (structural; `GU47(E-D)` swap to E-D's `AuraInstanceColorTarget` node field, which E-D's renderer already reads). Absent when not authored. |
| EG-8 tests, receipt specs, bundle delta | M | done (receipts: phase 2) | 81e0f0c19 | Unit tests per item (above, 7 files in `tests/unit/gu47/eg/`). Receipt specs `tests/browser/gu47/{sky,height-fog,water}.spec.ts` + harness `world-receipts.{html,ts}` + `world-receipts-lib.ts`, not run. Bundle delta in Verification. |
| H-EC1 E-C handoff 1 | - | done | 1c925de2b | `tests/unit/gu47/eg/post-runtime-hook.test.ts` (3 pass). |
| FLIP-1 ... FLIP-6 | M | see "Flag flips" | end of branch | One commit each, revertible alone. |

## Flag flips (end of branch, one commit each)

`A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_WORLD_WATER`, `A3D_QR_POST_VELOCITY_MRT`, `A3D_QR_ANIMATION_SKINNED_SHADOWS`, then `A3D_QR_WORLD_WIND` (E-G addition: gates only label-selected wind draws). Each sets `default-on` in `packages/rendering/src/contracts/flags.state.ts`; the phase-2 64-target table decides whether each stays (revert the flip commit otherwise). Commit hashes are listed in the final section of this report.

## Decisions

- Unowned files edited because the scope needs them and no lane owns them (no other lane touched any of them): `agent-api/world/scatter.ts`, `agent-api/world/terrain.ts` (EG-4), `rendering/src/atmosphere/SkyBackgroundPass.ts`, `rendering/src/atmosphere/sky.glsl.ts` (EG-5), `rendering/src/post/PostQualityTiers.ts` (named in the scope), `rendering/src/lanes/prd03.ts` (EG-2 registration/exports), `rendering/src/world/vegetation/WindField.ts` (EG-6 flag gate), `rendering/src/forward/Velocity.ts`, `rendering/src/post/chunks/velocity.glsl.ts`, `rendering/src/lanes/prd07.ts`, `engine/src/production-runtime/world/WorldFramePasses.ts` (EG-1). `compiler/renderInput.ts` was avoided (E-D edits the same lines).
- EG-2: a value form (`A3D_QR_TIERS=post`) would make `flags.on("A3D_QR_TIERS")` true and arm the whole lane, so the post-only mode is a sub-flag. The device tier is classified once per canvas from the WebGL2 device's C-28 probe (always present), capped at High so desktops never pay more than today. The mode needs no change to E-C's `postBridge.ts`.
- EG-3: builders run before `createAuraApp`, so the app's flags are declared explicitly (`world.useAppFlags`); env stays a source for backward compatibility. Integration may additionally install the resolved flags from `createAuraApp` (handoff below).
- EG-5: `clouds.speed` is a multiplier (1 = the previous 0.0001 uv/s default) and `coverage` clamps to 0..1; no shipped scene passed raw cloud speeds.
- EG-6: render items carry their node's `userData` reference, so wind nodes get their own `userData` copy registered in a WeakMap; the contributor finds their items without a compiler change. All wind instances in one frame share one wind field (first wind node, or the `world.wind` node under WORLD).
- EG-1: the PRD flags the promotions as capture-gated; phase 1 has no captures, so the flips are isolated commits at the end of the branch and the README names the revert rule. `A3D_QR_POST_VELOCITY_MRT` and `A3D_QR_VFX_FOG` were not no-ops before this lane (every forward program changed); they are now gated on live state.
- Bundle: the PRD-required root `world` export puts the world builder modules on the core critical path (see Verification); a `@aura3d/engine/world` subpath would take them off it (public-surface change, left to WP-38 / integration).

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| integration (unowned file) | `agent-api/app/createAuraApp.ts` next to `setQrAnimationFlags(qrFlags)` | optional: also call `setWorldBuilderFlags(qrFlags)` | builders called after the app exists (runtime `app.nodes.add(water.surface())`, scene rebuilds) then see the app's flags without `world.useAppFlags` |
| E-B (wave 2) | `contracts/atmosphere.ts` | nothing new: E-B's typed `AuraSkyStarsOptions` / `AuraSkyCloudsOptions` already match E-G's mirror | see "Handoffs received" E-B 43 for the swap E-G does in wave 2 |
| WP-38 | `CHANGELOG.md`, `BUNDLE_SIZES.md` | CHANGELOG text below; bundle delta below; consider a `@aura3d/engine/world` subpath | release notes and budget follow-up |

## Handoffs received

| from | item | status |
|---|---|---|
| E-C 1 | `compiler/postprocess.ts` runtime overrides + canvas | applied (1c925de2b) |
| E-C 7 (optional) | export `POST_RUNTIME_EFFECTS`, `applyRuntimePostOverrides`, `preloadPostLut`, `postLutsSettled` | declined: games use `app.post.*` / `colorGrade({ lut })`; keeps the root surface lean |
| E-A 80 | export `AuraHdriId`, `lookHdriIds`, `lookHdriUrl`, `lookOutputPreset` | declined in wave 1: the symbols exist only on `gu47/ea`; apply in wave 2 after merge 1 |
| E-A 76 | `compiler/postprocess.ts:306` caller of `createRootPostPipeline` | no E-G change needed: the look preset fallback belongs inside `createRootPostPipeline` (E-C); the caller already passes `output` and now the canvas |
| E-B 42 | export `AuraLightPatch`, `AuraLightTransitionOptions`, `AuraEnvironmentSwapOptions`, `AuraSetFogSpec`, `AuraSetFogOptions`, `AuraSkyStarsOptions`, `AuraSkyCloudsOptions` | declined in wave 1: E-B's types exist only on `gu47/eb`; in wave 2 switch the root sky-type export source to `contracts/atmosphere.ts` |
| E-B 43 | `nodes/sky.ts:131,138`, `world/biomes.ts:189`, the `GU47(E-B)` mirror | wave 2: import E-B's contract types in `nodes/sky.ts`, emit `count`/`brightness` from `sky.dayNight` (StarField already resolves both) |
| E-B 44 | `compiler/fog.ts` | applied by the `A3D_QR_VFX_FOG` flip (no code change needed) |
| E-D 59 | `instances.*({ instanceColorTarget })` stamped on the node | applied (17d5dbfa9) |
| E-D 60 | export `AuraToonMaterialOptions`, `AuraInstanceColorTarget`, `AuraMaterialRimSpec` | declined in wave 1: the types exist only on `gu47/ed`; apply in wave 2 |
| E-F 51 | `agent-api/publishedUnion.ts:312` type re-export of `AuraBurstOptions`, `AuraTrailOptions`, `AuraTrailHandle`, `AuraVfxGenreVariant` | declined in wave 1: the types exist only on `gu47/ef`; apply in wave 2 |

## API as shipped

Root (`@aura3d/engine`, `packages/engine/src/public/index.ts`):
- `world` — `{ terrain, water, scatter, grass, spline, extrude, kits, placeAlong, placeGrid, placePoisson, room, street, biome, biomes, timeOfDay, wind, useAppFlags }`.
- `world.useAppFlags(source: AuraWorldBuilderFlagSource | QrFlags | null | undefined): void`; `interface AuraWorldBuilderFlagSource { readonly flags?: QrFlagInput; readonly allowUrlFlags?: boolean }`.
- `world.scatter(options: AuraScatterOptions): AuraScatterResult` with `AuraScatterOptions.heightAt?: AuraHeightfieldSampler` and `AuraScatterResult.transforms: Readonly<Record<string, readonly AuraTransformSpec[]>>`.
- `world.grass(input: AuraGrassInput)`; `type AuraGrassInput = (AuraGrassOptions & { heightAt?: undefined }) | (Omit<AuraGrassOptions, "terrain"> & { terrain?: undefined; heightAt: AuraHeightfieldSampler; bounds: AuraGrassBounds; resolution?: number })`; `interface AuraGrassBounds { min: readonly [number, number]; max: readonly [number, number] }`; `type AuraHeightfieldSampler = (x: number, z: number) => number`.
- Types: `AuraGrassBounds, AuraGrassInput, AuraGrassOptions, AuraHeightfieldSampler, AuraScatterAsset, AuraScatterLayer, AuraScatterOptions, AuraScatterResult, AuraTerrainHandle, AuraTerrainOptions, AuraWaterHandle, AuraWaterOptions, AuraWindOptions, AuraWorldBuilderFlagSource, AuraWorldShape`.
- `sky.preetham(options: AuraSkyPreethamOptions)`, `sky.gradient(options: AuraSkyGradientOptions)`; types `AuraSkyStarsOptions { readonly count: number; readonly brightness?: number }`, `AuraSkyCloudsOptions { readonly coverage: number; readonly speed?: number; readonly color?: string }`, `AuraSkyPreethamOptions`, `AuraSkyGradientOptions`, `AuraSkyNodeOptions`.
- `instances.<primitive>(options: AuraInstancedPrimitiveOptions)`, `instances.custom(spec, options: Omit<AuraInstancedPrimitiveOptions, "geometry">)`, `instances.model` (`AuraInstancesModelBuilder`: returns `AuraNodeBuilder<AuraGroupNode>` when `lights` is set, else `AuraNodeBuilder<AuraModelNode>`), with options `instanceColorTarget?: "base" | "emissive" | "both"`, `wind?: AuraInstanceWindOption`, and on `instances.model` `lights?: AuraInstanceLightsOptions`.
- Types `AuraInstancedPrimitiveOptions`, `AuraInstancedModelOptions`, `AuraInstanceLightsOptions { readonly offset: AuraVec3; readonly color: string; readonly power: number; readonly distance: number }`, `type AuraInstanceWindOption = boolean | (AuraWindOptions & { readonly assetHeight?: number })`, `AuraInstanceWind { readonly wind: Required<AuraWindSpec>; readonly assetHeight: number }`, `AuraInstancesModelBuilder`.

Flags: `A3D_QR_TIERS_POST` (`tiers.post`), `A3D_QR_WORLD_WIND` (`world.wind`, implied by `world`).

Engine internals (not root): `setWorldBuilderFlags`, `worldBuilderFlags(): QrFlags`; `scatterInstanceTransform(p: ScatterInstance): AuraTransformSpec`; `TerrainRecord.samplingOnly?: boolean` (skipped by `terrainRecordIds`); `resolvePostQualityTier(requested: AuraQualityTier | "auto" | null, canvas?: HTMLCanvasElement): AuraQualityTier`; `resolveInstanceWind(option)`, `labelInstanceWindItems(items)`, `INSTANCE_WIND_CONTRIBUTOR`, `instanceLightNodes(name, transforms, spec)`; `WATER_ONLY_CONTRIBUTOR` (`production-runtime/world/WorldFramePasses.ts`).

Rendering (`@aura3d/rendering`): `POST_ONLY_TIER_FLAG`, `POST_ONLY_TIER_CONTRIBUTOR`, `resolvePostOnlyTier(probe: DeviceProbe | null | undefined, cap?: AuraQualityTier): AuraQualityTier`, `postOnlyTierFor(canvas)`, `recordPostOnlyTier(canvas, probe)`, `clearPostOnlyTier(canvas)`; StarField `StarSpec.count?`, `StarSpec.brightness?`, `STARS_PER_DENSITY`, `STAR_DENSITY_MAX`, `starDensityForCount(count)`, `visibleStarCount(density)`; CloudLayer `CloudSpec.color?`, `CloudFrame.color`, `CLOUD_BASE_SPEED`, `cloudTintLinear(color)`; `gradientSunfade(grad)`; sky uniform `u_cloudTint`; `velocityFramePrepared()`, `registeredVelocityFeature`.

## CHANGELOG text for WP-38

- World: `world` is exported from `@aura3d/engine`. `world.scatter({ heightAt })` and `world.grass({ heightAt, bounds })` follow a game's own ground function, and scatter results include `instances.model` transforms. `world.useAppFlags(qualityRebuild)` makes builder-time flag reads match the app's `qualityRebuild.flags`.
- Sky: `sky.preetham` and `sky.gradient` take typed `stars: { count, brightness }` and `clouds: { coverage, speed, color }`. Gradient skies now show stars and the moon at night and light their clouds.
- Instancing: `instances.model({ wind })` sways without the world lane, and `instances.custom` and instanced primitives take `wind` too. `instances.model({ lights })` adds one point light per instance (lamp posts). `instanceColorTarget` chooses whether instance colours tint the base colour, the emissive or both.
- Quality: `tiers.post` (`A3D_QR_TIERS_POST`) runs post at the device's tier (capped at High) without turning on the rest of the tiers lane, so phones stop paying for High post.
- Flags: `A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_WORLD_WATER`, `A3D_QR_POST_VELOCITY_MRT`, `A3D_QR_ANIMATION_SKINNED_SHADOWS` and the new `A3D_QR_WORLD_WIND` are on by default. Scenes that do not use these features get no extra passes, shader features or render targets. Water draws with only `A3D_QR_WORLD_WATER` on.
- Post: `app.post.setEffect` / `setEffectEnabled` now also reach the bloom pass parameters and the depth-of-field and motion-blur passes.
- All numbers in the receipts are software WebGL2.

## Phase-2 plan

1. Receipts (remote runner): `RUN_ID=gu47-eg-receipts SPECS='tests/browser/gu47/sky.spec.ts tests/browser/gu47/height-fog.spec.ts tests/browser/gu47/water.spec.ts' tools/remote-acr/run.sh`, then `node tools/receipts/extract-from-acr-log.mjs <acr-run.log>` into `evidence/receipts/{sky,height-fog,water}/`.
   - sky: frames sky-none, sky-day-clouds, sky-night-stars; sky band mean |dRGB| ≥ 8 (day vs none); ≥ 12 star pixels (luma > 180) in the night sky band, 0 on the flat background.
   - height-fog: frames fog-off, fog-height; far-column mean |dRGB| ≥ 6 and greater than the near-ground delta.
   - water: frames water-off, water-lake with only `world.water`; lake region mean |dRGB| ≥ 10; draw calls up.
2. Flag promotion: the 64-target before/after table in `evidence/game-upgrades-47/flag-promotion/README.md` (build A = parent of the first flip, build B = branch head; luma at 25 s / 60 s + LPIPS; expected-change sets listed there; revert a flip that moves a non-user target by more than 2 luma).
3. Post-only tiers: one target with `?a3d-qr=tiers.post` on the remote runner; `diagnostics().post` must show the Low tier resolution (SwiftShader classifies as Low) and the same target without the flag High; frame-time p50 recorded.
4. Instance wind / lamp lights / grass heightfield: ad-hoc capture of a two-time pair of `instances.model({ wind: true })` (tree tops move, trunks do not), a lamp-post row with `lights` (light pools on the ground, clustered path in diagnostics) and `world.grass({ heightAt })` under `world` (blades sit on the sampled ground).

## Verification

- Typecheck delta (`bin/typecheck-delta.mjs`): first run 63 errors (5 new, all in `post-runtime-hook.test.ts`, fixed in be96a8e9d); second run after all product code: 58 errors (baseline 58), `NEW_ERRORS 0`.
- New unit tests (`tests/unit/gu47/eg/`): world-builder-flags 6, world-heightfield 8, post-runtime-hook 3, post-only-tiers 5, sky-stars-clouds 10, instances-options 5, instance-wind 9, flag-promotion-noop 9: all pass.
- Touched-code regression files, all pass on the branch: C-00-flags, parity/l0-flags, parity/default-flags, game/flag-default, prd15 default-on-promotion, prd10-scatter, prd10-world, prd10-world-features, prd10-world-graph, prd10-world-only-scene, prd10-biomes, prd10-water, prd10-terrain, prd10 world-frame-passes, prd10 generated-path-features, prd10 every-chunk-compiles (1 skipped), prd07-C-21, sky-nodes, sky-preetham, sky-bands, sky-capture-adapter, sky-capture-wire, preetham-cpu-reference, standalone-shader-validity (glslang, 125), d3-day-night-sky, prd03-post-quality-tiers, prd03-post-bridge, prd03-post-diagnostics, e2-wave3-post-handoffs, prd03-t0-17-no-perframe-throws, production-bridge-boundary, gu47/ec runtime-post-control, option-ignored-model-instances, optionCoverage, parity instancing, parity empty-instances, instance-matrices-dense, option-coverage, root-geometry-lod-instancing, instancing-size-once, e2-instance-slots-and-wind-cull, prd03-phase4, shader-variants-velocity, feature-pars, fog-compile, fog-live, fog-legacy-parity, bench-lane-flags, temporal-history-lifecycle, C-14-velocity, prd03-velocity, external-parity-public-api-stability.
- Pre-existing failures (fail without this lane's change, unrelated): `tests/qr/prd15/unit/per-renderer-flags.test.ts` "#266 default-on sub-flag expansion" (line 150: URL beats options since #1232; fails on `f797808be`); `tests/unit/engine/phase2-p2p3-bridge.test.ts` "M2 assets.ensureDecoders stays fail-closed" (asset decoders); `tests/qr/prd07/unit/fog-forward-absorption.test.ts` "legacy generator (core off)" (its flags leave CORE default-on).
- Lint: `eslint` clean on every touched file (`public/index.ts` is in the eslint ignore list).
- Bundle size (`tools/bundle-size/index.ts`, before the flag flips, which only add `flags.state.ts` entries; every budget already failed on the base, none raised; `BUNDLE_SIZES.md` regenerated by the check and restored): core critical path 4,230,305 bytes / gzip 1,243,734 (base `f797808be` 4,187,080 / 1,229,214 per E-C's report; E-C head 4,192,397 / 1,230,925, so this lane adds +37,908 bytes / +12,809 gzip, mostly the PRD-required root `world` export); deferred v2 chunk gzip 1,628,531 (E-C head 1,628,443, +88); product-viewer gzip 1,066,839; cinematic-scene gzip 1,073,279; mini-game gzip 1,149,526.

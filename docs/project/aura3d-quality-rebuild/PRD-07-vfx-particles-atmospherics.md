# PRD 07: VFX / Particles / Atmospherics

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`. Status: proposed, revised
2026-10-05 for contracts-first parallel execution. `CONTRACTS.md` is authoritative. Where this PRD and `CONTRACTS.md`
disagree, `CONTRACTS.md` wins and this file is the bug.

Lane: PRD 07, flag `A3D_QR_VFX` (sub-flags `A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_VFX_VOLUMETRIC`,
`A3D_QR_VFX_DECALS`; PRD-local alias `renderer.vfx: "v1" | "v2"` and `renderer.vfxOverrides`, CONTRACTS §5.1).
Provides C-20 and C-21. Consumes only contracts (§12) and builds against their PR 0 stubs. It never waits on another
lane. The owned paths are exactly CONTRACTS §4.1 row 07 plus the lane-NN row (§13.2). Every other file is reached through a
contract seam or a non-blocking request (§13.6).

Evidence base: research `08-vfx-atmos-environments.md` (primary), `10-camera-controls-gameruntime.md` §4.1,
`16-route-local-extraction.md` rows 2/14/19, `18-completeness-critic.md`, `19-claim-verification.md` C8/C9 (corrected
statements), `21-game-vision-judgment.md` (authoritative for every visual category), `23-benchmark-vision-judgment.md`
(authoritative Aura vs three r185), `22-benchmark-pass1-code-metrics.md` (harness fair), `20-game-scorecards-code-pixelstats.md`
(performance, non-visual), `_sections/B-game-scorecard.md`. Capture: GH Actions run 37289688772, macos-14, ANGLE Metal on a
paravirtual Apple GPU, sha `c08d8acb` (`evidence/games/`, `evidence/benchmark/`). Line anchors were re-checked at
`85aafcd0` on 2026-10-05 (§2.7 lists the corrections made in this revision).

Rule for this PRD: an effect is a feature only when it changes pixels on the default `createAuraApp` production path, in a
shipped game, at gameplay scale. Effect nodes that validate, appear in diagnostics, increment `effectsSpawned` counters,
or render only in the safe-basic fallback or the Canvas2D path count as zero. Unit tests are necessary and never
sufficient. The final gate is vision-model plus human judgment of captured frames. No engineering gate in this document
is evidence of three.js-level quality.

---

## 1. Problem statement

The VFX/atmosphere layer is the largest single cause of the "early console" look (research 08 §0). Four failures
compound.

1. **Particles produce no pixels on the default renderer.** Every quality profile, including the default `safe-basic`,
   sets `rendererMode: "production"` (`packages/engine/src/agent-api/index.ts:4253-4298, 4312`). On that bridge
   `effects.particles`, `effects.rain`, `effects.snow`, `effects.flipbook` and `effects.beam` reach no draw path. The
   engine documents this itself (`index.ts:3646-3650, 3666-3670, 3724-3728, 13722-13723`). The device has one blend
   function, alpha-over (`WebGL2Device.ts:4404`, `LeanWebGL2Device.ts:4183`, `WebGPUDevice.ts:1826-1844`), so additive
   glow cannot be expressed, although `effects.particles` defaults `materialMode` to `"additive-glow"` for fountains
   (`index.ts:3707`).
2. **Game juice reaches no renderer.** `game.effects()` and `gameFeel.create()` are data pools. They draw only if the
   route adds `controller.nodes()` to the scene, and no app, template or example does (`GameRuntime.ts:2872-2873`,
   `GameFeel.ts:262-263`; 19 C8 both skeptics; 16 headline 4). When rendered, 10 of 11 effect kinds become one shrinking
   emissive sphere, box or torus (`GameRuntime.ts:3903-3915`). Nodes cannot be added after mount:
   `AuraRuntimeNodeRegistry` exposes only get/require/has/ids/all (`index.ts:10664-10670`), and `setScene` remounts
   everything including physics (`index.ts:11480-11492`). Routes therefore pre-allocate hidden primitive pools (Blockfall's
   48 `primitives.box` shards parked at y=-50, `apps/showcase-blockfall-reactor/src/clear-fx.ts:15, 47-60`), which also
   inflate the shadow fit (18 C2).
3. **There is no sky.** The production bridge clears to one colour (`index.ts:13596`). `EnvironmentBackgroundPass` exists
   and `Renderer` schedules it (`Renderer.ts:559, 649-653`), but nothing in `packages/engine/src` sets
   `environmentBackground` (19 C9). `sky.dayNight` emits sphere suns 7 units from the origin, up to 120 sphere stars and
   opaque PBR sphere clouds, and discards the zenith colour (`index.ts:3730-3769`). `planSkyBackdrop` emits discrete
   emissive bands, which is a posterized sky by construction (`LayeredSceneComposition.ts:503-543`). Games stack flat
   boxes (Rooftop Buckets' three slabs, `apps/showcase-rooftop-buckets/src/environment.ts:21-56`).
4. **Fog and "volumetrics" are minimal or fake, and the fake one is the slowest thing in the program.** Forward exp/exp2
   fog is correct, but the height term is a per-fragment multiplier, not a ray integral (`ShaderChunks.ts:472-514`,
   multiplier at `:487-490`). The
   root caps opacity at `clamp(0.25 + intensity*0.55, 0, 0.92)` with intensity defaulting to 0.5 (`index.ts:12748,
   12758`), so the cap is 0.525: distant geometry never reaches the fog colour. Default density 0.12 exp2 gives
   `(1 - e^-1.44) * 0.525 ≈ 40%` fog at 10 m, a grey wash. Fog never reaches the background. Fog is chosen once from the
   static snapshot with `nodes.find` (`index.ts:12739-12745`), so Skyline's five act fogs all render as act 0 (18 §2).
   `effects.volumetricFog` is a surface lobe (`ShaderChunks.ts:500-510`) plus a CPU 8-bit radial blur from a fixed UV
   `[0.5, 0.18]` (`VolumetricFog.ts:131`, `PostProcessPass.ts:1177-1255`). The blur runs inside
   `Renderer.executePixelPostprocessPass` (`Renderer.ts:1245`), which reads back the whole frame with `readPixels` at
   `:1247`; the `volumetric-light` branch is `:1259-1260`. The pass is planned by `createProductionRuntimePostprocess`
   (`index.ts:12806-12824`). Deep Recovery is its only user. It measured **0.5 fps** at 1920×1080 on the capture runner,
   where Orbital Defense and Vault Breakers hold about 60 (`_sections/B-game-scorecard.md:31-36`).

Pixel consequences (authoritative vision judgments):

- Benchmark `14-particles` (2,000 additive sprites, seed 1414, `benchmarks/quality-rebuild/shared/scenes.ts:280-288`):
  **Aura 1/10 vs three.js 4/10** (23 §14; pass-1 metric judge 1 vs 6.5, 22 §14). "The particle system is entirely absent
  in Aura3D." The adapter logs that `effects.particles` has no seed, position or size option
  (`benchmarks/quality-rebuild/aura3d/common.ts:232-242`).
- Benchmark `09-outdoor-environment`: Aura 3.5 vs three 5.5. Flat sky; "greyed, low-contrast" tone from fog plus lifted
  ambient (23 §09). The adapter logs that `scene().background()` accepts only a colour (`aura3d/common.ts:119`) and that
  fog "caps opacity ... so distant geometry never fully fogs as FogExp2 does" (`aura3d/common.ts:250-252`). The adapter
  passes `intensity: 1`, so the benchmark runs at the 0.80 cap, not the 0.525 default cap.
- Benchmarks `17-large-environment` (3.0 vs 4.5) and `18-game-scene` (3.5 vs 5.0) list heavier haze and muddier mid-ground
  partly attributable to fog (23 §17, §18).
- 18 shipped games (21), scores 0–10:

| Game | VFX | Particles | Atmosphere | Vision-judge note (21) |
|---|---|---|---|---|
| aura-clash-showcase | 2 | 2 | 1 | "no sparks, flashes, or trails beyond translucent smears" |
| aurora-lander | 2.5 | 1 | 1 | exhaust is "a single static additive capsule mesh"; "no aurora", no sky gradient |
| bank-shot | 1 | 0 | 1 | no impact, pocket or charge effects |
| blockfall-reactor | 2 | 2 | 2 | "one orange ring in one frame" |
| courier-rush | 3 | 1 | 1 | no exhaust, sparks, speed lines or sky |
| deep-recovery | 3.5 | 3 | 1.5 | "no underwater fog colour, god rays, caustics, or suspended particulate" |
| gallery-shift | 2 | 1 | 1 | "vision cones are absent or broken" |
| gravity-post | 2 | 2 | 1 | no engine trail or ambient dust |
| mech-hangar | 1.5 | 1 | 1.5 | the action shot has zero combat VFX |
| neon-swarm | 2 | 1 | 2 | no combat VFX despite score changes |
| orbital-defense | 0.5 | 0 | 0 | no muzzle flash, hit, explosion, shield or trail |
| patrol-wing | 2 | 2 | 1 | "no fog, haze, clouds, aerial perspective" |
| pulse-tunnel | 1 | 2 | 1 | no thruster flames, trails or sky |
| rooftop-buckets | 4 | 3 | 2 | no haze volume, dusk sky gradient or light shafts |
| siege-golf | 3 | 1.5 | 2 | no dust; "no sky detail" |
| skyline-runner | 4 | 1 | 3 | no falling snow in a snow level; "all atmosphere is painted" |
| turbo-drift-circuit | 2 | 1.5 | 3 | "effectively no particle tire smoke"; haze "behaves like a grey wash" |
| vault-breakers | 1 | 0 | 1 | "the room has no air" |

No game scores above 4 in any of these categories. Means across 18: VFX 2.2, particles 1.4, atmosphere 1.4
(`_sections/B-game-scorecard.md:29`, the Mean row). These are the three lowest visual categories in the program, along with shadows (1.6)
and IBL (1.5).

What must exist: one GPU particle and sprite pipeline on the root renderer that every effect kind, game juice, weather
and the impact library draw through, with real blend modes, soft particles from scene depth, flipbook atlases, sorting,
lit and unlit shading, trails/ribbons, beams and mesh particles. Effects must be spawnable and removable at runtime and
auto-mounted from `game.effects` / `gameFeel`. The background must be a physically based procedural sky (with gradient
and HDRI alternatives) drawn behind the scene and fogged with the same function as geometry. Fog must integrate height
analytically with sane defaults, with a GPU froxel volumetric path on High/Ultra. Weather and decals are built on those
primitives.

---

## 2. Evidence from current code (path:line)

Identifiers E1–E48 are stable; other PRDs cite them (PRD 10 cites E26).

### 2.1 Particle stacks (none reaches the default frame)

| # | Location | Fact | Source |
|---|---|---|---|
| E1 | `packages/engine/src/agent-api/index.ts:3690-3714` | `effects.particles` exposes `materialMode`, `texturedBillboard: true`, `sizeOverLife`, `alphaOverLife`, `velocityOverLife`, `turbulence`, `noise`, `particleCount` 2400. No production consumer reads any of them. No `seed`, `size` or `positions` option. | read; 08 §2.1; 22 §14 |
| E2 | `index.ts:3620-3645` | `effects.rain` / `effects.snow` (wind, splashes, mist). No production consumer. | read; 19 C8 |
| E3 | `index.ts:3646-3689` | `effects.flipbook` (`spriteColumns`/`spriteRows`/`frameRate`) and `effects.beam` are "withheld — root has no native sprite-sheet sampler / beam target yet, so no pass is submitted". | read |
| E4 | `index.ts:3724-3728`, `:13722-13723` | Self-disclosure that production does not pixel-back rain, snow or particles; a blanket warning says effect nodes "remain non-pixel-backed". `analyzeProductionBridgeEligibility` (`:4339`) never rejects them. | read; 19 C8 |
| E5 | `index.ts:16000-16006`, `:16517-16600` | Safe-basic fallback: particles are 8-triangle opaque octahedrons (`createWebGLParticleModel` `:16548`); rain is 90 static 1 px `GL_LINES` (`createWebGLRainModel` `:16517`). Turbo's author documents "opaque beige marbles" (`apps/showcase-turbo-drift-circuit/src/main.ts:2629-2631`). | read; 08 §2.2 |
| E6 | `index.ts:18432-18600` | Canvas2D `drawEffect` paints circles and strokes with a hard-coded fountain palette. | 08 §2.2 |
| E7 | `packages/rendering/src/effects/ParticleSystem.ts` (734 lines) + modules | Real CPU module simulation (emitter shapes, bursts, force, colour, size, velocity, collision, turbulence, sub-emitter, trail). `ParticleRenderer.buildBatch` targets a `ParticleDrawTarget` with **no implementation in the repo**; the only caller is a no-op in `tools/effects-vfx-visual-audit/index.ts:239`. | 08 §2.1 |
| E8 | `packages/rendering/src/effects/ParticleRenderPass.ts:25-50` | Pass shell; calls `renderer.render(system, target)`; no GPU draw. | read |
| E9 | `effects/GPUParticleBackend.ts:453-455, 540-541, 648-652, 816-824` | WGSL compute kernels end in `copyBufferToBuffer` + `mapAsync(READ)` every frame. | 08 §2.1 |
| E10 | `effects/ResidentGPUParticleRenderer.ts:4-10, 187, 344-365, 483-488, 516-520` | Owns its own device and canvas. Camera is a compile-time constant `[0,2.5,7.2]`. Soft fade ray-casts a fixed y=0 plane. Output is flat squares. Lighting divides by the lighting factor. | 08 §2.1, §2.4 |
| E11 | `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts:24-28` | Opaque orange `UnlitMaterial` squares ±0.012 in world XY, not camera-facing; CPU rewrites the vertex buffer per update. Unused by any app. | 08 §2.1; 19 C8 |
| E12 | `effects/ParticleRenderer.ts:32-63, 79-110, 146-159` | Soft particles are a CPU scalar from a `sceneDepthAt` callback; `SOFT_PARTICLE_WGSL` exported, unused. Sort is CPU `Array.sort`, default `"none"`. | 08 §2.4 |
| E13 | `packages/rendering/src/SpriteFlipbook.ts:99-111` | `resolveFlipbookUv` is correct UV math (v flipped for GL). Nothing samples it on the GPU. | read |
| E14 | `packages/rendering/src/RenderDevice.ts:139`, `Material.ts:36` | `blend: boolean` is the whole blend model. | read |
| E15 | `WebGL2Device.ts:4404`, `LeanWebGL2Device.ts:4183`, `WebGPUDevice.ts:1826-1844` | Only `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`; WebGPU pipeline key encodes `blend`/`opaque` only. | 19 C8 |
| E16 | `packages/rendering/src/ForwardPass.ts:121, 260, 1652-1670` | `MAX_GPU_INSTANCES = 64` split for non-attribute shaders; transparent sort exists (`sortRenderQueueItems`). | read |
| E17 | `index.ts:14747-14754` | `createProductionInstanceTransforms` drops `node.size`: confirmed cause of benchmark 16's shrunken instances (22). Mesh particles must not route through it. | 22 |
| E18 | `index.ts:8344-8360, 9683, 9756, 9795-9796` | `gpuReady` and scene-kit "textured billboard impostor" evidence strings come from node metadata, not draws. | 08 §2.5 |
| E19 | `apps/showcase-webgpu-particle-lab/src/main.ts:318` | Claims the "visible particle field is produced by Aura3D effects.particles"; contradicted by the bridge. | 19 C8 |

### 2.2 Game juice and runtime mutability

| # | Location | Fact | Source |
|---|---|---|---|
| E20 | `packages/engine/src/agent-api/GameRuntime.ts:2800-2879` | `createGameEffects` is a pure data pool (`poolSize ?? 96`, `:2801`; option declared at `GameEffectsOptions` `:1163-1164`). `nodes()` (`:2872-2873`) is its only pixel path. PR 0b-1 carves this region to `agent-api/vfx/gameEffects.ts` (PRD 07). The rest of `GameRuntime.ts` stays with PRD 08. | read; 19 C8 |
| E21 | `GameRuntime.ts:3879-3915` | `effectToSceneNode`: `aura-burst` becomes a dead `particles` node (`:3889-3902`); every other kind becomes a `primitive` sphere/box/torus with `emissiveIntensity = intensity*life`, `opacity = life`, scaled by life (`:3903-3915`). | read |
| E22 | `GameRuntime.ts:1150-1171` | 11 `GameEffectKind`s: hit-spark, block-spark, impact-decal, ground-dust, dash-trail, slash-trail, impact-flash, aura-burst, shockwave, ring-shockwave, super-flash. No app binding. | read |
| E23 | `GameFeel.ts:1-17, 262-263` | "owns no renderer"; `nodes()` forwards to the effects port. | read |
| E24 | `rg '\.nodes\(\)' apps templates examples` | Zero consumers outside `tests/unit/engine/game-feel.test.ts` and `tests/browser/gamefeel-camera-rigs-harness.ts`. Neon Swarm spawns 7× and never updates; Courier, Skyline and Turbo spawn and update but never mount. | 10 §4.1; 16; 19 C8 |
| E25 | Route-local VFX pools | Neon `combat-feel.ts` (150 LOC), Mech `arena/feel.ts` (307), Blockfall `clear-fx.ts` (192), Aura Clash `rendering/HitSparkVfx.ts` + `AuraClashArenaApp.ts:3570-3700`, Pulse `main.ts:1737-2000`, Gravity `syncSparks`, Rooftop contact bursts; trails in Pulse, Siege `trailPuffs`, Patrol `orbTrailHandles`, Turbo ribbons. About 1.2k LOC duplicated. | 16 rows 2, 19 |
| E26 | `index.ts:10664-10670`, `:11480-11492` | No runtime add/remove: the registry is read-only; `setScene` resets runtime nodes, removes and re-registers every rigid body, and remounts. | read; 18 §2 |

### 2.3 Sky and background

| # | Location | Fact | Source |
|---|---|---|---|
| E27 | `index.ts:13586-13596` | `ProductionRuntimeRenderer.create({ clearColor: colorToAcesInputClearColor(snapshot.background) })`. | 19 C9 |
| E28 | `packages/rendering/src/Renderer.ts:268, 559, 649-653, 1806-1809` | `RenderSource.environmentBackground` schedules `EnvironmentBackgroundPass`; `rg environmentBackground packages/engine/src` is empty. The bridge spreads `compatibility?.source` (`index.ts:13991`), the only way an external source reaches it. | 19 C9 |
| E29 | `packages/rendering/src/EnvironmentBackgroundPass.ts:44-46, 109-114` | Equirect/cubemap fullscreen-triangle background. `execute()` (`:44`) calls `createFullscreenTriangleGeometry()` (`:46`, defined `:109-114`) every frame. | read |
| E30 | `index.ts:3730-3769` | `sky.dayNight`: sphere sun/moon at `(-6cos az, 1+5 sin az, -7)`, ≤120 sphere stars at z=-6.5, ≤48 opaque PBR sphere clouds; returns one background colour. | read |
| E31 | `packages/rendering/src/DayNightSky.ts:8-11, 63-84` | Nine hard-coded sRGB keyframes; "no Rayleigh/Mie model is implemented or implied". | 08 §4.2 |
| E32 | `packages/engine/src/agent-api/LayeredSceneComposition.ts:503-543` | `planSkyBackdrop` emits `bandCount` (default 4) flat bands with stepped `emissiveIntensity = 0.52 - blend*0.34` (`:525`). Used by Skyline (`apps/showcase-skyline-runner/src/main.ts:1122-1140`). File owned by PRD 10. | read |
| E33 | `packages/rendering/src/EnvironmentPlatform.ts:395-415` | `createProceduralSkyDome` is a single-colour unlit UV sphere; no root consumer. | 08 §4.4 |
| E34 | `packages/engine/src/production-runtime/index.ts:1436-1621` | `createProductViewer` draws an HDR sky through its own `A3DVisibleHdrSkyboxMaterial` sphere: a parallel background path. | 19 C9 |
| E35 | `apps/showcase-rooftop-buckets/src/environment.ts:21-56`; `apps/showcase-patrol-wing/src/sky.ts:449-458` | Box-slab sky bands; sun is an emissive sphere at (-29, 21, -58). | 08 §4.3 |

### 2.4 Fog and volumetrics

| # | Location | Fact | Source |
|---|---|---|---|
| E36 | `packages/rendering/src/ShaderChunks.ts:472-514` | Chunk `environment_fog_common`. `a3dEnvironmentFogFactor` (`:475-491`) is radial linear/exp/exp2 fog × `exp(-max(0, y - ref) * falloff)` (`:487-490`, a multiplier, not an integral), × `maxOpacity`. Volumetric "inscatter" (`:500-510`) is `pow(dot(V,L),6)` on surfaces only, plus sin-hash dither. Frozen legacy, owned by PRD 01 (CONTRACTS §3.7). | read |
| E37 | `index.ts:3442-3449` | `effects.fog` defaults: density 0.12, `#9fb7d9`, intensity undefined. | read |
| E38 | `index.ts:12733-12758` | Fog picked by `nodes.find` from the static snapshot; volumetric wins over plain; intensity defaults 0.5 (`:12748`); `maxOpacity = clamp(0.25 + intensity*0.55, 0, 0.92)` (`:12758`); `near 1, far 60` hard-coded (`:12755-12756`). | read |
| E39 | `benchmarks/quality-rebuild/aura3d/common.ts:250-252` | Harness records the opacity cap as a fidelity gap vs `FogExp2`. | read |
| E40 | `packages/rendering/src/VolumetricFog.ts:105-144`; `PostProcessPass.ts:1177-1255`; `Renderer.ts:1245-1260`; `index.ts:12806-12824` | CPU nested-loop radial blur on a `Uint8Array` from `readPixels` (`Renderer.ts:1247`). The anchor UV is fixed. The code says it owns "no GPU target". The pass is planned in `createProductionRuntimePostprocess`, which PRD 03 owns after carve-out. | 08 §3.2; read |
| E41 | `apps/showcase-deep-recovery/src/main.ts:280-285` | The only `volumetricFog` user. 0.5 fps desktop on the runner. | B scorecard; 17-g5 |
| E42 | `packages/rendering/src/cinematic/*` (14 files) | `FogVolumeSystem`, `DepthHazePass`, `RainParticleSystem` and others are descriptors with `rendererOwnedEvidence` flags; no renderer reads them. | 08 §3.3, §6 |
| E43 | `apps/showcase-skyline-runner/src/main.ts:1391, 1904, 2229-2238, 3864` | Five act fog nodes toggled via runtime handles; renderer always uses act 0. | 18 §2 |

### 2.5 Weather and decals

| # | Location | Fact | Source |
|---|---|---|---|
| E44 | `index.ts:3772-3810` | `weather.precipitation`: dead rain/snow node plus ≤160 opaque PBR `primitives.box` streaks or spheres sampled at `elapsedSeconds ?? 1.2`. Rain does not fall. | 08 §5.2; 19 C8 |
| E45 | `packages/rendering/src/Weather.ts`, `AtmosphereWetness.ts` | Sound deterministic state math (intensity, wind, puddles, wetness scalars). Keep. | 08 §13 |
| E46 | `packages/engine/src/agent-api/Decals.ts:51-61` | `AURA_DECAL_MAX_DECALS = 32`, forward transparent, one draw per decal, angle/distance fade, polygonOffset; no normal/roughness blending. 0 games use it. | 08 §7 |
| E47 | `packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry.ts` | Box/ellipse clip of the source mesh, comparable to three.js `DecalGeometry`. Keep. | 08 §7; path re-checked |
| E48 | `apps/showcase-turbo-drift-circuit/src/main.ts:5025-5060` | The "skid marks" are pre-allocated box `leftDriftRibbons`/`rightDriftRibbons` handles. They are moved, rotated and scaled each frame, and the code comment admits they show only the current slip (`:5027`). The judge sees "disc or rectangle decals". (`:5162-5184` is the dust-plume puff code, not the skids.) | read; 21 turbo |

### 2.6 Adoption (18 games; research 08 §9, 18 census)

`effects.fog` 17/18; `effects.volumetricFog` 1; `effects.particles` in 2 shipped games (Turbo `main.ts:2612`, Pulse
`main.ts:1409-1450`) and 2 non-game showcases (data-galaxy `:223`, particle-lab `:226`), all dead on production;
`sky.dayNight` 0; `weather.*` 0; `water.*` 0; `decals.*` 0; `effects.flipbook` 0; `effects.beam` 0;
`environments.hdri` 0; `.nodes()` 0.

### 2.7 Anchor corrections made in this revision (re-checked at `85aafcd0`)

| Old citation | Corrected | What the code shows |
|---|---|---|
| `ShaderChunks.ts:472-517` | `:472-514` | `environment_fog_common` ends at `:514`. `:516` starts `skinning_common`. |
| `Renderer.ts:1245-1262` "volumetric-light CPU branch" | `:1245` function, `:1247` readback, `:1259-1260` branch | All CPU pixel post passes share one `readPixels`. The region sits in PRD 03's `PostprocessExecution.ts` carve-out (`Renderer.ts:977-1330`). |
| `packages/rendering/src/ProjectedDecalGeometry.ts` | `packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry.ts` | The file does not exist at the old path. |
| Turbo skid marks `main.ts:5163-5184` | `:5025-5060` | `:5162+` is dust-plume code. |
| Turbo "beige marbles" `main.ts:2631-2633` | `:2629-2631` | Comment lines. |
| `EnvironmentBackgroundPass.ts:12-60` | `:44-46, 109-114` | Per-frame geometry creation. |
| `GameEffectsOptions.pool` (old §7.8) | `poolSize` (`GameRuntime.ts:1164`) | The existing option name. |
| `B-game-scorecard.md` "bottom row" | `:29` | Mean row. |
| `WebGL2Device.ts:2452-2454` (old E40) | removed | The anchor was not needed for the claim. The readback is at `Renderer.ts:1247`. |

Confirmed unchanged (17 anchors): `index.ts:3441-3449, 3646-3650, 3666-3689, 3707, 3724-3728, 8344-8360, 10664-10670,
11480-11492, 12733-12758, 13596, 13722-13723, 13990-13991, 14747-14754, 16000-16006, 18432`; `WebGL2Device.ts:4404`;
`LeanWebGL2Device.ts:4183`; `WebGPUDevice.ts:1826-1828`; `RenderDevice.ts:139`; `Material.ts:36`; `ForwardPass.ts:121, 260`;
`GameRuntime.ts:1150, 2872-2873, 3903-3915`; `GameFeel.ts:262-263`; `Decals.ts:51`; `ResidentGPUParticleRenderer.ts:512`
(ribbon alpha); `RootGpuParticleWorkload.ts:24-28`; `tools/effects-vfx-visual-audit/index.ts:239`;
`benchmarks/quality-rebuild/aura3d/common.ts:119, 232-242, 250-252`; `shared/scenes.ts:280-288`;
`apps/showcase-deep-recovery/src/main.ts:280-285`; `apps/showcase-webgpu-particle-lab/src/main.ts:318`;
`packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md:41-45`.

Relevant to the standalone design: effect nodes keep object identity through `flattenSceneSnapshot`.
`applyAuraParentTransform` returns `effect` nodes unchanged (`index.ts:17975`). A WeakMap keyed by the effect node
object is therefore stable between `app.scene` and the bridge's flattened snapshot (§6.3.1, §6.6).

---

## 3. Root cause

1. **The production bridge has no effect consumer.** `createProductionRuntimeSceneRenderer` builds draw entries only for
   typed GLB actors and primitives; for effect nodes it reads only fog/post settings (19 C8 skeptic 1,
   `index.ts:12741-12855`). Builders were added to the public API, diagnostics and evidence (E18) without a render path,
   and the zero-pixel case was a warning (E4), so nothing failed.
2. **The device cannot express VFX blending** (E14, E15). Additive, premultiplied and multiply are impossible on every
   backend; any particle renderer built on today's device looks wrong.
3. **The scene model is mount-time static** (E26, E38, E43). No runtime add/remove and fog from the static snapshot push
   games into pre-allocated hidden primitive pools, which shapes VFX into "a few shrinking shapes" and defeats emitters.
4. **The background is a clear colour, not a pass** (E27, E28). With no sky, fog and background colours are independent
   strings, so seams and grey washes follow; sky features were built from primitives because primitives were the only
   thing the bridge drew (E30, E32, E35).
5. **Evidence substituted for rendering.** Descriptor-only `cinematic/*` (E42), metadata `gpuReady` (E18), a CPU
   "volumetric" kernel (E40) and a Canvas2D VFX audit satisfied parity checklists. No pixel gate existed on the shipped
   path until the quality-rebuild capture.
6. **Agent guidance points at dead or primitive paths.** The `aura3d-materials-environments` skill teaches
   `sky.dayNight`, `weather.precipitation`, `water.surface` and `environments.hdri` "for the sky"
   (`packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md:41-45, 63-70`); `aura3d-game-art` produces
   flipbooks with no consumer (08 §10).

**Design rule (cited by PRD 10 as "PRD 07 §3"):** every effect node kind has exactly one production consumer, a
documented safe-basic degradation, and an observed-draw diagnostic. A node kind with no consumer is a build-time error.
At runtime, an effect node that submitted zero draws while visible and in frustum for 30 consecutive frames raises
`diagnostics().effects.errors[]` with code `EFFECT_ZERO_PIXELS` (a dev-build console error, not a warning). The
blanket warning at `index.ts:13722-13723` (moved to `compiler/renderer.ts`, owned by PRD 15) is suppressed when
`A3D_QR_VFX` is on. That is request R-15-1. Until it lands, both messages appear. The `effects` diagnostics section is
the authoritative one.

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/rendering` | New `vfx/` (particle batch pass, ribbons, beams, mesh particles, sort, soft-depth adapter, atlas sampling, GPU sim on WebGL2) and `atmosphere/` (procedural sky pass, gradient sky, `a3d_prd07_fog` and `a3d_prd07_wetness` chunks, absorption fog, froxel volumetric pass, sky-capture adapter). `effects/` modules feed `vfx/`. PRD 07-owned `cinematic/*` descriptors are deleted at flag removal. Registration goes only through the lane barrel `src/lanes/prd07.ts` (C-01 contributors, C-02 chunks/features, C-20/C-21 `provide()`). |
| `@aura3d/engine` (agent-api + production-runtime) | `ProductionEffectSystem`, effect-node lowering, `app.effects` and `app.atmosphere` (registered through C-38), the `sky` node handler (C-36), `sky.*`/`weather.*` rewrites in the carved `nodes/{sky,weather}.ts`, live fog in the carved `compiler/fog.ts`, `game.effects` auto-mount in the carved `vfx/gameEffects.ts`, the VFX preset library, `decals.*` batching, and the `effects`/`atmosphere` diagnostics sections (C-31). `app.nodes.add/remove` belongs to PRD 15 (C-37). PRD 07 consumes it. |
| `@aura3d/lean` | None. Lean particle rendering is out of scope (§25). |
| `packages/aura3d-cli` | `src/commands/prd07/` (C-39): `aura3d vfx validate-atlas`. PRD 05 owns `assets validate`, so mapping `--type vfx-atlas` onto it is request R-05-2. Skill text is PRD 13's, and this lane sends facts only (C-40). |
| `benchmarks/quality-rebuild` | Lane scenes in `scenes/prd07/`, `aura3d/scenes/prd07/` and `three/scenes/prd07/` (C-30). The base-scene adapter `aura3d/common.ts` belongs to PRD 12. Honouring `seed`/`size`/`blending` in base scene 14 is request R-12-1. |
| `tools/vfx-atlas-bake` (new) | Deterministic offline baker for the built-in VFX atlas. Sources are license-clean and procedurally generated. It makes no network calls. |
| `apps/*` | None edited by this lane (PRD 14 owns routes, R21). This lane ships replacements, a codemod and per-route reports (§10). |

---

## 5. Affected files / directories

Every path below is owned by PRD 07 under CONTRACTS §4.1, or is created by PRD 07 inside an owned directory. Paths
owned by other lanes are not edited. They appear in §13.6 as requests.

Modify (owned, existing files):

- `packages/rendering/src/effects/{ParticleSystem,ParticleEmitter,ParticleRenderer,ParticleRenderPass,TrailModule,GPUParticleBackend,ResidentGPUParticleRenderer,ParticleEffectPresets,ParticleDiagnostics}.ts`.
- `packages/rendering/src/{DayNightSky,Weather,AtmosphereWetness,SpriteFlipbook,VolumetricFog}.ts`,
  `packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry.ts`.
- `packages/rendering/src/cinematic/` (default 07). Excluded: `{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts` (03)
  and `CinematicMaterialPresets.ts` (15).
- `packages/engine/src/agent-api/Decals.ts`, `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts`.
- Carved by PR 0b-1 (verbatim moves from `index.ts`, owner 07 afterwards, CONTRACTS §3.2):
  - `agent-api/nodes/effects.ts` (from `index.ts:3441-3728` minus the post factories, which go to `nodes/effects.post.ts`, owned by 03).
  - `agent-api/nodes/sky.ts` (from `:3730-3770`).
  - `agent-api/nodes/weather.ts` (from `:3772-3868`).
  - `agent-api/nodes/particles.ts` (from `:8344-8365`).
  - `agent-api/compiler/fog.ts` (from `createProductionRuntimeEnvironmentFog`, `:12733-12786`).
  - `agent-api/vfx/gameEffects.ts` (from `GameRuntime.ts:1150-1171, 2800-2879, 3879-3915`).
- `tools/effects-vfx-visual-audit/` (deleted at flag removal).

Create (owned):

- `packages/rendering/src/vfx/`: `ParticleInstanceLayout.ts`, `ParticleBatch.ts`, `ParticleBatchPass.ts`,
  `ParticleSort.ts`, `ParticleGpuSim.ts` (WebGL2 ping-pong), `ProceduralVolumeEmitter.ts`, `RibbonBatch.ts`,
  `RibbonPass.ts`, `BeamBatch.ts`, `MeshParticleBatch.ts`, `DecalBatch.ts`, `VfxAtlas.ts`, `BlendFallback.ts` (C-04 stub
  adapter), `SceneDepthAdapter.ts` (C-01 `sceneDepth` consumer), `FrameContributors.ts` (`prd07.sky`, `prd07.particles`,
  `prd07.decals`, `prd07.volumetric`), `EffectSystemRegistry.ts` (app↔device binding, §6.3.1),
  `shaders/{particle,ribbon,mesh-particle,decal,gpu-sim}.glsl.ts` with `.wgsl` strings carried in the same
  `ShaderChunk` records (C-02 `wgsl?`).
- `packages/rendering/src/atmosphere/`: `SkyBackgroundPass.ts`, `PreethamSky.ts`, `GradientSky.ts`, `StarField.ts`,
  `CloudLayer.ts`, `HeightFog.ts` (CPU mirror plus uniform packing for both the legacy and `a3d_prd07_fog` paths),
  `FogVolumes.ts`, `VolumetricFogPass.ts`, `SkyCaptureAdapter.ts`, `chunks.ts` (registers `a3d_prd07_fog` and
  `a3d_prd07_wetness` through C-02 `registerShaderChunk` and `registerShaderFeature`),
  `shaders/{sky,fog,volumetric-inject,volumetric-integrate,volumetric-apply,wetness}.glsl.ts`.
- `packages/rendering/src/lanes/prd07.ts` and `packages/engine/src/lanes/prd07.ts`: every `provide()` and `register*()`
  call for this lane.
- `packages/engine/src/production-runtime/effects/`: `ProductionEffectSystem.ts`, `EffectNodeLowering.ts`,
  `EmitterInstance.ts`, `WeatherVolume.ts`, `DecalPool.ts`, `TransientLightPool.ts`, `EffectDiagnostics.ts`,
  `LiveAtmosphere.ts` (WeakMap of live fog/sky state per effect node).
- `packages/engine/src/agent-api/vfx/`: `presets.ts` (impact library), `atlas.ts` (built-in atlas manifest + typing),
  `effects-api.ts` (`app.effects` real factory), `atmosphere-api.ts` (`app.atmosphere` real factory),
  `diagnostics.ts` (C-31 `effects` and `atmosphere` sections), `lookLint.ts` (C-34 rule `look/fake-effect-names`),
  `index.ts`.
- `packages/engine/src/agent-api/compiler/{effects,sky}.ts` (C-36 `sky` node handler; option-coverage rows),
  `agent-api/compiler/diagnosticOnly.prd07.ts`.
- `packages/engine/assets/vfx/`: `aura-vfx-atlas-2k.ktx2`, `aura-vfx-atlas-1k.ktx2`, `.png` fallbacks,
  `aura-vfx-decals-1k.ktx2`, `manifest.json`, `LICENSE.md` (CC0, generated in-repo).
- `tools/vfx-atlas-bake/`. Node, deterministic and seeded. The same seed produces byte-identical files.
- `packages/aura3d-cli/src/commands/prd07/{index,validate-atlas}.ts`.
- `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd07/` (scene specs and both adapters, §17).
- `.github/workflows/prd07-vfx.yml` (macos-14, remote only).
- Tests: `tests/qr/prd07/**` and `tests/unit/contracts/impl/prd07-*.test.ts` (§16).
- Evidence: `docs/project/aura3d-quality-rebuild/evidence/prd07/<gh-run-id>/`.

Delete (at `A3D_QR_VFX` removal, CONTRACTS §5.4; owned files only):
- `cinematic/{FogVolumeSystem,RainParticleSystem,WetReflectionApproximation,CinematicDepthComposition,GlowCardSystem,EmissivePracticalLightSystem}.ts`.
- `production-runtime/RootGpuParticleWorkload.ts`.
- The hard-coded camera and the standalone device in `ResidentGPUParticleRenderer.ts`. These are generalized behind the
  WebGPU path in coordination with PRD 11, which sends requests to this lane.
- `tools/effects-vfx-visual-audit/`.
- `legacyPrimitiveNodes` and the `effectToSceneNode` primitive mapping in `vfx/gameEffects.ts`.

Removals in files owned by other lanes are requests (§13.6):
- `cinematic/{BloomPass,FilmGrainPass,VignettePass,DepthHazePass}` (R-03-2).
- The safe-basic octahedron and `GL_LINES` models (R-15-2).
- `createProceduralSkyDome` (R-02-3). `createEnvironmentStage` has live callers in
  `apps/advanced-examples-gallery/src/{dataGalaxyScene,productConfiguratorScene}.ts` (conflict map, PRD 10 note) and stays.
- `planSkyBackdrop` deprecation (R-10-1).
- Root re-export removals (R-15-4).

---

## 6. Architecture proposal

### 6.1 Frame placement

```
C-01 phase            PRD 07 contributor (lane barrel)      Target behaviour (C-01 real)            Day-0 behaviour (C-01 stub, Renderer.ts seams)
"shadows"             –                                       PRD 02 shadow maps                       unchanged
"background"          prd07.sky   SkyBackgroundPass           sky at far plane, LEQUAL, no depth write  added after the EnvironmentBackgroundPass addPass (:650) and before ForwardPass
                                  (preetham | gradient)       fogged by a3d_prd07_fog                  (:664). A visible sky therefore overdraws any PRD 02 background (precedence §6.5)
"opaque"              reserved (PRD 01)
"after-opaque"        prd07.volumetric  inject→[temporal]→    reads ctx.sceneDepth + C-11 shadow       runs after the single ForwardPass. ctx.sceneDepth.available === false,
                                  integrate→apply            lookup                                    so froxel is skipped (VOLUMETRIC_DEPTH_PENDING) and analytic fog only
                      prd07.decals  DecalBatch               after opaque, before transparents         after all forward transparents (documented interleave defect)
"transparent"         prd07.particles  ParticleBatch(es),     TransparentQueueItems interleaved with   drawn after every forward transparent (C-01 stub deviation): particles
                                  Ribbon, Beam, MeshParticle  forward transparents/water by sortDepth  always over water and glass
"post-hdr"            prd07.volumetric-apply (C-13 pass)     linear-HDR composite before tone map     skipped unless a post target exists (FRAME_PHASE_SKIPPED); apply also
                                                                                                        runs in "after-opaque" via alpha-over (§6.7)
Post (PRD 03), OutputPass (PRD 01)
```

`ProductionEffectSystem` submits the VFX work as C-01 contributor passes and `TransparentQueueItem`s. It is not a
parallel renderer, which is the opposite of E10. Opaque mesh particles are drawn by `prd07.particles` in
`after-opaque`. When PRD 01 provides a `collect`-phase opaque item insertion, they move into the opaque item list.
That move is optional and has no visual dependency. Nothing in this PRD edits `Renderer.ts` or `ForwardPass.ts`.

### 6.2 Particle pipeline

**6.2.1 One instance layout for every billboard source.** A camera-facing quad (4 static vertices, 6 indices, shared
VAO) with per-instance attributes (divisor 1), 64 bytes per particle:

| Attribute | Type | Contents |
|---|---|---|
| `a_posSize` | vec4 f32 | world position xyz, size (world metres) |
| `a_velStretch` | vec4 f32 | world velocity xyz, stretch factor (0 = round billboard) |
| `a_color` | vec4 f32 | linear RGB × intensity (HDR, may exceed 1), alpha |
| `a_rotFrameMisc` | vec4 f32 | rotation rad, flipbook frame (float, fractional = blend), emissive weight, normal bend |

CPU-simulated emitters write into one preallocated `Float32Array` per batch. The live range is uploaded with
`RenderDevice.updateBuffer` (`RenderDevice.ts:435`) into a 3-deep ring of buffers from `createBuffer` (`:434`), so there is
no per-frame allocation. This replaces the object arrays in `ParticleRenderer.buildBatch` (E7/E12). The ring is drawn with
the draw command's existing `instanceCount` and `instanceAttributes` (divisor 1, `RenderDevice.ts:113-130`). That is
today's device API, so no device file changes. GPU-simulated and procedural emitters skip the buffer and pull state in
the vertex shader (§6.2.3).

**6.2.2 Batching.** A batch key is `(atlas, blend, shading, softDepth, stretchMode, frameBlend, fogMode)`. All live
emitters with the same key and the same sort bucket merge into one instanced draw. Sort buckets: additive batches are
order-independent and merge across emitters; `alpha`/`premultiplied` batches merge only emitters whose bounds overlap
in depth, and each batch is inserted into the transparent queue at its bounds-centre distance.

**6.2.3 Simulation sources.**

| Source | Used for | Implementation | Tiers |
|---|---|---|---|
| CPU modules | bursts, event-driven hits, emitters ≤ 4,096 live, anything needing determinism or per-particle collision callbacks | existing `ParticleSystem` + modules (E7), seeded PRNG per emitter, fixed-step on `app` clock | all |
| GPU sim (WebGL2) | continuous emitters > 4,096 live (fountains, smoke stacks, sparks showers) | `ParticleGpuSim` keeps two RGBA32F state textures (pos+age, vel+seed) in `rgba32f` render targets, a format today's `RenderTargetDescriptor.format` already supports (`RenderDevice.ts:69`). They are ping-ponged by **two** single-target fullscreen passes (position pass, velocity pass), because MRT `colorAttachments` is a PR 0a field that stays pending until PRD 01 lands it (`RENDER_TARGET_FEATURE_PENDING`, CONTRACTS §3.4). Once MRT is real, one MRT pass replaces the pair. That swap is optional and a cost-only change. Emission writes the ring index range `[head, head+n)` via uniform. The vertex shader `texelFetch`es by `gl_InstanceID`. Forces: gravity, drag, curl noise (3D value noise), wind, and collision with the ground plane or a heightfield texture. | Medium+ (requires `EXT_color_buffer_float`, read from C-28 `probe.floatColorBuffer`; otherwise CPU at the tier cap) |
| Procedural volume | rain, snow, marine snow, dust motes, ash, star twinkle | stateless: position = `camPos + wrap(hash3(id) * extent + vel*t - camPos, extent)`; no simulation or upload; count capped per tier | all |
| WebGPU compute | Ultra 200k, depth collision | `GPUParticleBackend` kernels bound to a storage buffer read by the vertex stage; readback deleted (E9) | Ultra on WebGPU only (C-29 `backend: "webgpu"`, `A3D_QR_WEBGPU`) |

Unsorted GPU/procedural emitters are restricted to `additive` or `premultiplied` blending with per-particle alpha ≤ 0.5;
the builder enforces this and diagnoses violations (`PARTICLE_GPU_SORT_REQUIRED`).

**6.2.4 Sorting.** `alpha`/`premultiplied` CPU batches sort back-to-front by view depth with an LSD radix sort on a 16-bit
quantized key into a preallocated index permutation (not `Array.sort`, E12). Sort runs only when the camera moved
> 1 cm or rotated > 0.5° or particles changed, and is skipped for additive batches.

**6.2.5 Soft particles and near fade.** Fragment: `soft = saturate((sceneLinearDepth(uv) - fragLinearDepth) /
softDistance)`; `near = saturate((fragLinearDepth - near) / nearFade)`; alpha × soft × near. Depth comes from the
C-01 `FrameContributorContext.sceneDepth` (`SceneDepthSource`, alias C-07-IN-2). Defaults: `softDistance` 0.35 m,
`nearFade` 0.3 m. `SOFT_PARTICLES` is a C-02 feature bit. It is driven by the C-27 `softParticles` setting
(Low false) and by `sceneDepth.available`. With the C-01 stub, `available` is false, so particles use the near fade only.
Diagnostics then report `softDepth: false` and the `SOFT_DEPTH_PENDING` degradation (`capability-degraded`).
`vfx/SceneDepthAdapter.ts` holds one optional path that needs no other lane. When the frame's forward render target
exposes a `depthTexture` (`RenderDevice.ts:80`; true when a post target exists), the adapter copies it with one
fullscreen draw into an owned R32F linear-depth target in `after-opaque`. It never samples the bound attachment. That
path is enabled only when request R-01-1 publishes the forward target on the C-01 blackboard. The "soft" visual
criterion is therefore integrated (I2). The math is tested standalone against a synthetic depth texture (§15 P1-T10).

**6.2.6 Flipbooks.** Atlas pages are 2D textures with a JSON manifest of named sequences
`{ rect: [u, v, w, h], columns, rows, frames, fps, loop }`. The vertex shader computes the frame cell UVs
(`resolveFlipbookUv` logic, E13, moved to GLSL); `frameBlend: true` samples frames `floor(f)` and `floor(f)+1` and lerps by
`fract(f)`. Frame selection: `"over-life"` (default for explosions/smoke), `"fps"` with random start, or fixed. Atlas
textures use mips with `LINEAR_MIPMAP_LINEAR` and a 1-cell gutter so mip bleed stays inside a cell.

**6.2.7 Blending and HDR.** Blend modes come from C-04 `BlendMode`, set as `RenderCommandState.blendMode`:
- `additive` for sparks, glow and fire cores.
- `premultiplied` for smoke and dust. One mode handles both glow and occlusion: `rgb` is premultiplied, alpha controls
  occlusion, and the additive part comes from `alpha=0` texels.
- `alpha` for opaque-ish debris sprites.
- `multiply` for darkening, such as scorch puffs.

**Day-0 fallback (C-04 stub, `vfx/BlendFallback.ts`).** The device ignores `blendMode` and applies only
`SRC_ALPHA, ONE_MINUS_SRC_ALPHA` (`WebGL2Device.ts:4404`). The fallback keeps the premultiplied look exact by writing
un-premultiplied colour (`rgb / max(a, 1e-4)`, alpha unchanged), which alpha-over turns back into premultiplied
compositing. `additive` sequences switch to their premultiplied variant with the core intensity raised ×1.6, and
`multiply` is skipped. Each case reports `VFX_BLEND_FALLBACK` once per batch key. This is honest: additive accumulation
is not claimed until C-04 is real (I1).

Output is linear HDR when C-05 reports an HDR scene target (`probeHdrTargetFormat`; RGBA16F whenever a post target
exists). Emissive values > 1 then feed PRD 03 bloom. Without an HDR target, the particle and sky shaders encode with the
same `outputColorSpace` convention `EnvironmentBackgroundPass` uses (`Renderer.ts:652`), so the background and VFX match
the legacy forward output. Particle items set C-14 `writesReactive: true`. They write `o_reactive = alpha` at location 2
only when the reactive attachment exists (C-14 `VELOCITY_MRT.reactiveLocation`). Otherwise the output is compiled out.
Particles write no velocity.

**6.2.8 Shading modes.**

- `unlit`: `color × texture`, HDR. Default for sparks, fire, glows, rain.
- `lit`: per-vertex lighting for smoke, dust, snow, debris sprites. Normal = `normalize(mix(toCamera, cornerDir, bend))`
  (sphere-bent billboard). Terms: directional sun with half-Lambert wrap `0.5 + 0.5·N·L`; `a3dSampleIrradianceSH(N)` from
  the C-09 chunk `a3d_prd02_sh9`, whose PR 0a stub returns the hemisphere colour pair from SH band 0/1; and up to 4
  nearest point/spot lights. On High/Ultra the sun term is multiplied by one `a3dSunShadowAt(P)` tap. That comes from
  C-11 chunk `a3d_prd02_shadow_lookup`, whose stub returns 1.0. With the real lookup, smoke darkens in shade (I4). A
  `backlight` term `pow(saturate(dot(V, -L)), 4) × transmission` gives the sun-through-smoke rim. Lighting is per vertex,
  so cost is per particle, not per pixel.
- `distortion` is out of scope (§25).

**6.2.9 Trails and ribbons.** `RibbonBatch`: each trail is a CPU ring of `(position, time, width, color)` points sampled
when the target moved > `minVertexDistance` (default 0.05 m), up to `maxPoints` (default 48). The vertex shader expands
each point into 2 vertices offset by `normalize(cross(tangent, toCamera)) × width/2` (`orientation: "camera"`) or by
`cross(tangent, surfaceNormal)` (`orientation: "surface"`, used for skid marks and tyre tracks, drawn with polygon
offset in the decal phase). U runs along length (texture scroll by speed), V across. Width/alpha over age curves. One
draw per batch key for all trails. The Resident renderer's ribbon alpha `0.45·(1 - segment/depth)` (E10) is ported as
the default alpha curve (`ResidentGPUParticleRenderer.ts:512`). Targets: a runtime node id; `handle.socket(bone)` from C-19
(the stub returns the node root world matrix with `valid: false`, and diagnostics report `SOCKET_PENDING`); or a callback.

**6.2.10 Beams and cones.** `BeamBatch`: camera-facing strip from `from` to `to` (existing `createBeamDescriptor`,
`index.ts:3672-3677`), additive, soft depth, scrolling noise texture, core/edge falloff `pow(1-|v·2-1|, coreExponent)`.
`effects.lightCone` (PRD 14 §8.9): open cone mesh attached to a spot light, additive, depth write off, axial and radial
falloff, soft depth, low-frequency noise.

**6.2.11 Mesh particles.** `MeshParticleBatch`: instanced draw of one mesh (primitive or single-primitive GLB) with
per-instance `mat4` (pos, quat, scale), colour and emissive; simulation is CPU (gravity, drag, spin, ground bounce with
restitution, sleep). Opaque by default (opaque queue, casts shadow on High+ if `castShadow`), or `alpha` fade on death.
Instance transforms are built here and never go through `createProductionInstanceTransforms` (E17). The program is
PRD 07's own `vfx/shaders/mesh-particle.glsl.ts`: Lambert + `a3dSampleIrradianceSH` + emissive, with per-instance
`mat4` + colour + emissive as `instanceAttributes`. This is the permanent day-0 path. When C-02 `generateProgram` is
real and C-03 lobes are available, the batch can request a generated `instancing: { color: true, emissive: true }`
program for PBR debris. That is an optional upgrade, judged in I4.

**6.2.12 Effect graphs (composite effects).** An `AuraVfxEffectSpec` is a list of layers (emitters, ribbons, mesh
particles, a decal, a transient light, a camera kick request) with relative start times. The impact library (§6.4) is
data in this format. `app.effects.spawn(spec, at)` instantiates it once; `effects.*` builders declare persistent ones.

### 6.3 Effect lowering, runtime mutation and juice auto-mount

**6.3.1 Lowering.** `EffectNodeLowering` maps every `AuraEffectNode.effect` value to one consumer:

| `effect` | Consumer | Notes |
|---|---|---|
| `particles` | ParticleBatch (CPU or GPU source by count/tier) | `materialMode` → preset (atlas sequence, blend, shading): `additive-glow`→glow/additive/unlit, `soft-alpha`→soft-dot/premultiplied/lit, `spark`→spark-streak/additive/stretched, `smoke`→smoke-8x8/premultiplied/lit, `splash`→splash-4x4/premultiplied, `dust`→dust/premultiplied/lit, `star`→flare/additive |
| `rain`, `snow` | procedural volume + splash emitter (§6.8) | `particleCount` honoured within the tier cap |
| `flipbook-sprite` | ParticleBatch with one particle per instance, frame over life | `spriteColumns/spriteRows/frameRate` honoured; `texture` asset ref added |
| `light-beam` | BeamBatch | |
| `trail`, `aurora-ribbon`, `light-cone`, `fog-volume`, `decal` | new kinds, §7 | |
| `fog`, `volumetric-fog` | atmosphere state (§6.6, §6.7) | resolved from live state each frame |

**Where lowering runs (standalone, with no edit to PRD 15 files).** The real `app.effects` factory is registered through
C-38 `registerAppExtension({ member: "effects", owner: "prd07", flag: "A3D_QR_VFX" })`. It creates one
`ProductionEffectSystem` per app after mount. On every `app.onFrame` the system reads `app.scene` (effect nodes keep
identity, §2.7) and the visibility of the `app.nodes` handles. It lowers each `effect` node with
`lowerEffectNode(node, ctx)` and steps emitters on the app clock, multiplied by C-23 `app.time.scale`. It then publishes
batches to `vfx/EffectSystemRegistry.ts`. The `prd07.*` C-01 contributors draw the registry entry bound to the frame's
`ctx.device`. Binding rule: when exactly one app is live, its system binds to the first device that invokes the
contributor. With several live apps, binding needs the additive CCR `FrameContributorContext.canvas?` (CCR-07-1, §13.6).
Until it merges, multi-app pages draw VFX on the first app only and report `VFX_APP_BINDING_AMBIGUOUS`. No benchmark or
shipped game is multi-app.

Effect-node kinds stay on today's compiler path. PRD 03 also owns `effect` nodes (post factories), so PRD 07 does not
register a C-36 handler for kind `effect`. `compiler/effects.ts` registers option-coverage rows (C-36
`registerOptionCoverage`) for every new builder field and removes the matching entries from
`compiler/diagnosticOnly.prd07.ts` as each field is wired. Kind `sky` is new and unshared, so `compiler/sky.ts` registers
a C-36 `NodeHandler<{ kind: "sky" }>`. It validates the spec and records `feature("vfx.sky")`. That way the PRD 15 compiler
stub never reports `unknown-node-kind` for sky nodes under `A3D_QR_STRICT`. Drawing still happens through the effect
system, so it does not depend on C-36 being real.

`compiler/fog.ts` (owned carve-out) is still called per frame from `compiler/renderInput.ts` (`index.ts:14003`, PRD 15).
It resolves fog from live state as in §6.6.

The safe-basic fallback renderer (`compiler/safeBasic.ts`, PRD 15) keeps its octahedron and `GL_LINES` models until
request R-15-2 lands. The production path is unaffected.

**6.3.2 Runtime add/remove (fixes E26) is consumed, not built here.** PRD 15 owns `app.nodes.add/remove` (C-37, R14). This
section is the semantics input PRD 15 implements:
- `add(node, { parent? })` returns a handle.
- `remove` disposes the subtree's GPU resources and physics bodies.
- Neither ever remounts.
- Supported kinds include `effect`, `primitive`, `model`, `group` and `decal`.

PRD 07 does not depend on it for transient VFX. `app.effects` instances live in `ProductionEffectSystem` and create no
scene nodes (§6.3.3). Persistent effect nodes added at runtime go through C-37 `add`. The C-37 stub implements that as a
correct but slow `setScene` remount and reports `RUNTIME_ADD_REMOUNT`. The effect system picks up the new node on the
next frame either way. The no-remount property is integrated acceptance I8. PRD 07 also registers the C-37 node-handle
extension `setFog` for fog nodes (`registerNodeHandleExtension({ member: "setFog", appliesTo: ["effect"] })`).

**6.3.3 Imperative effects.** `app.effects.spawn(effect, at, options)` and `app.effects.burst(kind, position, options)`
create transient effect instances owned by `ProductionEffectSystem`, pooled per spec, with no scene-node churn. This is
the backend for PRD 09's `GameFxLayer` (`fx.burst`, `fx.trail`; backend `"particle-pass"` calls C-20, R13) and for the
C-23 feel bus `vfx` channel (PRD 08 calls `app.effects.burst`). `camera` layers call C-22 `app.camera.shake.add(...)` /
`app.camera.punch.trigger(...)`. `super-flash` calls C-05 `app.setOutputOverlay({ flash })`. Both are stubbed safely in
PR 0a.

**6.3.4 `game.effects` / `gameFeel` auto-mount.** This is implemented in the carved `agent-api/vfx/gameEffects.ts`,
which PRD 07 owns after PR 0b-1. `GameRuntime.ts` and `GameFeel.ts` stay with PRD 08.
- `createGameEffects(options)` gains `app?: AuraApp`, `autoMount?: boolean` (default true) and
  `legacyPrimitiveNodes?: boolean`.
- When the controller is bound and `A3D_QR_VFX` is on, spawns go to `app.effects` with the impact-library preset for
  the kind (§6.4), and `nodes()` returns `[]`.
- With no `app` given, controllers register in a realm-local pending list. The `effects` app extension adopts unbound
  controllers when exactly one app is live. With zero or several live apps, the controller stays unbound and
  diagnostics raise `GAME_EFFECTS_UNBOUND` (error).
- The app's `onFrame` calls `update(dt)` for bound controllers. Neon Swarm never calls it itself (E24).
- `gameFeel.create` builds its effects port with `createGameEffects` (`GameFeel.ts:262-263` forwards `nodes()`), so it is
  adopted the same way with no `GameFeel.ts` edit. An explicit `gameFeel.create({ app })` option is request R-08-1.
- With the flag off, `nodes()` and all behaviour are byte-identical to `85aafcd0`.
- When bound, `nodes()` is deprecated and returns primitive nodes only if `legacyPrimitiveNodes === true`.

### 6.4 Built-in VFX atlas and impact library

**Atlas (`packages/engine/assets/vfx/`).** Baked by `tools/vfx-atlas-bake` from seeded procedural sources (3D fBm density
volumes ray-marched with a single-scatter light for smoke/explosions; analytic shapes for sparks, rings, flares; Worley +
fBm for flame). Pages are 2048² (High/Ultra) and 1024² (Low/Medium), premultiplied alpha. Each page ships as KTX2
(UASTC + zstd) with a PNG fallback. KTX2 is decoded through C-16 (`createAssetDecoderRegistry` + `selectKTX2TargetFormat`).
That path ships real or wrapped in PR 0a, using the existing transcoder. When the KTX2 decoder is unavailable it throws
`AssetDecoderUnavailable`, which the atlas loader catches. The loader then loads the PNG page and reports
`VFX_ATLAS_PNG_FALLBACK`. Day 0 therefore works with PNG alone. Sequences:

| Sequence | Layout | Use |
|---|---|---|
| `soft-dot`, `glow`, `flare`, `spark-streak`, `ring`, `ring-thin`, `dust-mote`, `bubble`, `snowflake` ×4, `rain-streak` | single cells | sparks, glow, rings, weather |
| `smoke-a`, `smoke-b` | 8×8 | lit smoke puffs, tyre smoke, dust clouds |
| `fireball` | 8×8 | explosions |
| `flame-loop` | 8×4 | thrusters, torches, exhaust |
| `muzzle` | 4×1 (4 variants) | muzzle flashes |
| `splash` | 4×4 | rain splashes, water hits |
| `electric` | 4×4 | shield hits, arcs |
| `debris-chips` | 4×2 | sprite debris on Low |

Decal page `aura-vfx-decals-1k`: scorch ×2, crack ×2, bullet hole, splat ×2, tyre-track strip, footprint, puddle mask,
with normal and roughness channels (RG normal, B roughness in a second texture). Atlases conform to
`AuraVfxAtlasManifest` v1 (§7.1). The manifest stays PRD 07's (CONTRACTS Appendix A, C-07-OUT-3). Admission of
third-party sheets uses the C-17 role `vfx-atlas`. PRD 05's K9 VFX kit can therefore supply higher-quality sheets,
validated by `aura3d vfx validate-atlas` (C-39, this lane).

**Impact library (`packages/engine/src/agent-api/vfx/presets.ts`).** Each kind is an `AuraVfxEffectSpec`; values are
defaults, overridable per call (`count`, `scale`, `color`, `normal`, `seed`, `intensity`):

| Kind (PRD 09 `GameFxKind` / engine `GameEffectKind`) | Layers |
|---|---|
| `spark` / `hit-spark`, `block-spark` (blue, smaller) | 24 stretched additive `spark-streak` (speed 4–9 m/s in a 70° cone around `normal`, gravity 9.8, drag 2.5, life 0.18–0.4 s, HDR intensity 6→0); 1 `flare` flash 0.06 s scale 0.6; transient point light 0.08 s intensity 6, range 3 m (High+) |
| `dust` / `ground-dust` | 6 lit `smoke-a` puffs, premultiplied, radial 1–2 m/s, rise 0.3, size 0.4→1.4 m, life 0.9–1.4 s, alpha 0.5→0 |
| `debris` | 8 mesh-particle chips (box/kit fragment), bounce 0.3, spin, life 2 s; Low uses `debris-chips` sprites |
| `ring` / `shockwave`, `ring-shockwave` | 1 `ring` sprite aligned to `normal`, scale 0.2→2.5 m ease-out, additive HDR 3→0, 0.35 s; 4 dust puffs at radius |
| `streak` / `dash-trail`, `slash-trail` | ribbon on the target, width 0.25→0, life 0.2 s, additive; slash adds 12 sparks along the arc |
| `pickup` | 16 `glow` sparkles spiralling up 1 m, 0.6 s; `ring-thin` 0.3 s |
| `explosion-small` | flash 0.05 s (scale 1.5, HDR 12); `fireball` flipbook over life 0.6 s, size 1.2→2.4 m; 3 lit `smoke-b` puffs 2.5 s rising; 20 sparks; 6 debris; scorch decal; point light 0.25 s intensity 12 range 6 m |
| `muzzle` | `muzzle` variant random, 2 frames at 60 fps, aligned to barrel; 4 sparks; point light 0.05 s |
| `splash` | 1 `splash` flipbook 0.3 s + 12 droplet sprites with gravity |
| `bubble` | 10 `bubble` sprites rising 0.6 m/s with wobble, life 2 s, premultiplied |
| `impact-flash` / `super-flash` | flare HDR 8 / 20 at contact; super adds a 48-spark radial burst and PRD 08 screen-flash request |
| `impact-decal` | decal (scorch or crack by surface tag), fade-in 0.05 s, life 20 s |
| `aura-burst` | swirl emitter 200 `glow` particles 1.2 s, additive |

### 6.5 Sky and background

One background is drawn per frame, chosen by precedence:
1. A visible `sky` node (PRD 07).
2. An environment whose C-09 resolution has `background.visible` (PRD 02).
3. `scene().background(color)`, rendered as a solid colour with triangular dither.

A `sky` node and an environment can coexist: the sky draws and the environment lights. **Day-0 mechanism:**
`prd07.sky` is a C-01 `background`-phase contributor. The C-01 stub adds it after the `EnvironmentBackgroundPass`
`addPass` (`Renderer.ts:650`), so a visible sky overdraws any PRD 02 background with no edit to PRD 02 files. That costs
one redundant fullscreen draw. Request R-02-2 removes it by making the C-09 resolution report `background: false` when a
visible sky node exists.

When no environment exists and a sky does, the sky is captured into the IBL through C-09
`EnvironmentProbeFactory.fromScene({ renderFace })`, with `renderFace` bound to
`SkyBackgroundPass.renderToCubeFace` (C-21 `skyBackgroundSlot`). Re-capture is triggered by `onSkyChanged`. Reflections
match the visible sky only when C-09 is real (I5). With the C-09 stub, the capture factory wraps the legacy PMREM. PRD 07
calls it only when `A3D_QR_LIGHTING` reports the factory as real. Otherwise it reports `SKY_CAPTURE_PENDING` and lighting
is unchanged.

- **`preetham`** (default model): port of three.js r185 `examples/jsm/objects/Sky.js` (MIT). The attribution header is
  in `atmosphere/PreethamSky.ts` and `atmosphere/shaders/sky.glsl.ts`. The `LICENSE-THIRD-PARTY` entry comes from PRD 05's
  generator (R-05-1). The port covers Rayleigh/Mie with `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`,
  the sun disc, and the r185 procedural cloud layer (`cloudScale`, `cloudCoverage`, `cloudDensity`, `cloudElevation`,
  `Sky.js:80-90, 117-177`). Output is linear HDR radiance with no tone mapping in the sky shader. When C-05 reports no
  HDR target, the shader instead applies the legacy `outputColorSpace` encode (§6.2.7), so it matches today's forward
  output on the flag-off-core path.
- **`gradient`**: zenith/horizon/ground three-stop with exponent, horizon glow, optional sun disc and the stylized band mask
  from PRD 14 §8.7 (synthwave). It replaces `planSkyBackdrop` (E32) and box-slab skies (E35). Routes adopt it through
  PRD 14. The `planSkyBackdrop` deprecation is R-10-1.
- **Layers shared by both:** procedural star field (direction hashed into a cube-face cell grid, magnitude distribution,
  twinkle, fades with sun elevation), moon disc with phase and earthshine, `aurora` layer request served by the
  `effects.auroraRibbon` geometry (PRD 14 §8.2), and fog-matched horizon (`a3dApplyFog` evaluated at `backgroundDistance`).
- **Cost control:** on Low the sky is rendered into a 256×128 sky-view texture (lat-long) only when parameters change
  (sun moved > 0.25°, cloud time step), and the background pass samples it (1 fetch/pixel). Medium+ evaluates per pixel
  (≈ 0.1–0.25 ms at 1080p) for crisp sun and clouds.
- **`sky.dayNight` rewrite (carved `nodes/sky.ts`, behind `A3D_QR_VFX_SKY` at lowering time):** the builder output is
  identical with the flag on or off, because builders are flag-unaware. It returns the legacy primitive nodes, each
  registered as a runtime node `prd07.legacySky.<n>` (a runtime id adds no pixels), plus one `sky` node (preetham, sun/moon direction from `createDayNightSky`; the E31 keyframes are
  kept only for colour temperature), one directional light, and a fog colour hint. With the flag on, the effect system
  hides the tagged legacy primitives through their runtime handles and the `sky` node draws. With the flag off, the `sky`
  node is ignored (C-21 stub semantics) and the frame is unchanged. Flag-off identity is checked by IC-0 and the C-01
  sentinel. The return shape `{ nodes, background, dayFactor,
  visibleStarCount }` is preserved, plus `sky: AuraSkySpec`. At flag removal the legacy primitives are dropped.
- **Removed from the default path at flag removal:** sphere sun/moon/stars/clouds (E30). Removals in other lanes' files
  are R-02-3 (`createProceduralSkyDome`, E33) and R-10-1 (`planSkyBackdrop`, E32).

### 6.6 Fog

- **Integrated exponential height fog** (replaces the multiplier, E36). Density `σ(h) = σ_h · exp(-b·(h - h0))` plus a
  uniform distance term `σ_d`. Optical depth from camera `c` along unit `v` over length `d` (beyond `start`):
  `τ = σ_d·d' + σ_h·exp(-b·(c.y - h0)) · d' · (1 - exp(-b·v.y·d')) / (b·v.y·d')`, with the last factor → 1 when
  `|b·v.y·d'| < 1e-4`, `d' = max(d - start, 0)`. Fog amount `f = min(1 - exp(-τ), maxOpacity)`.
- **Inscatter colour:** `fogColor · ambientScale + sunColor · HG(dot(v, L), g) · sunInscatter`, with Henyey-Greenstein
  `g = 0.6` default. With a sky present, `color: "sky"` (the default) takes `fogColor` from the sky's horizon radiance at
  the view azimuth (uniform per frame: 8 azimuth samples interpolated), which removes the fog/background seam.
- **Absorption fog** (underwater; PRD 10 §8.7, PRD 14 §8.3): per-channel `σ = vec3` and
  `color = color·T + waterColor(depth)·(1 - T)`, `T = exp(-σ·d)`. It is exact in PRD 07 programs from day 0. On forward
  geometry it is exact only on the generator path. The legacy approximation uses exp mode with the luminance-weighted σ
  and the fog colour at 10 m.
- **Live state** (fixes E38, E43), standalone. `production-runtime/effects/LiveAtmosphere.ts` keeps
  `WeakMap<AuraEffectNode, LiveFogState>`. The `atmosphere` app extension updates it every `onFrame` from runtime handle
  visibility, `handle.setFog(partial)` (C-37 extension) and `app.atmosphere.setFog(spec, { transitionSeconds })`.
  `compiler/fog.ts` (`createProductionRuntimeEnvironmentFog`, called per frame from `index.ts:14003`) picks the last
  *visible* fog node in scene order from that map and applies transitions. Density interpolates in linear space and
  colour in linear RGB. Node identity is stable between `app.scene` and the bridge snapshot (§2.7).
  `app.atmosphere.setFog` on a scene with no fog node adds one through C-37 `app.nodes.add`. On the stub that is a one-time
  remount (`RUNTIME_ADD_REMOUNT`). The `near: 1, far: 60` hard-codes (`index.ts:12755-12756`) are removed under the flag.
  The fog function is byte-identical with the flag off.
- **Local fog volumes** (`effects.fogVolume`, ≤ 4 Low/Medium, ≤ 8 High+): constant-density box or ellipsoid, analytic
  segment length of the ray ∩ volume clipped to `[0, d]`, added to `τ`. Used for lamp haze, ground mist, steam.
- **Applied to.** There are two shader paths, and both are PRD 07's to drive:
  - **PRD 07 programs** (sky, particles, ribbons, beams, decals, mesh particles) include `a3d_prd07_fog` directly from day 0,
    so they always get the full model (particles per vertex).
  - **Forward geometry** is drawn by PRD 01 programs:
    - *Legacy path* (`A3D_QR_CORE` off): the frozen `environment_fog_common` chunk (`ShaderChunks.ts:472-514`). PRD 07
      drives it only through uniforms produced by the owned `compiler/fog.ts`: mode linear/exp/exp2, density,
      height reference, height falloff and `maxOpacity`. Height mode maps to exp mode with
      `density = σ_d + σ_h·exp(-b·(cam.y - h0))` and the legacy height multiplier `falloff = b`. That is not the integral.
      The error is bounded and reported as `FOG_LEGACY_APPROXIMATION` in `diagnostics().atmosphere.fog.path`.
      **Parity rule:** while forward geometry is on the legacy path, `a3d_prd07_fog` in PRD 07 programs evaluates the
      *same* legacy formula from the same packed uniforms (`HeightFog.packLegacy`), so the sky, VFX and geometry never
      seam.
    - *Generator path* (`A3D_QR_CORE=v2` with C-02 real): `atmosphere/chunks.ts` registers `ShaderFeature` `prd07.fog`
      (hook `fragment:fog`, program feature `fog: "height" | "volumetric"`). Forward geometry then evaluates the
      integral, and PRD 07 programs switch to the integral at the same moment (they read the same `ProgramFeatures.fog`
      bit). This is evaluated in I3.
  - **Background** when `affectsBackground` (default `true` for `preetham`/`gradient` skies and solid colour, `false` for
    an HDRI background), at `d = backgroundDistance` (default `camera.far`). A solid-colour background with fog is drawn
    by `prd07.sky` as a fogged colour pass.
- **Live state** (fixes E38, E43): the active fog is the last *visible* fog node in scene order, read from runtime
  handles every frame. `handle.setVisible`, `handle.setFog(partial)` and `app.atmosphere.setFog(spec, { transitionSeconds })`
  interpolate density in linear space and colour in linear RGB over the transition. `near: 1, far: 60` hard-codes
  (`index.ts:12755-12756`) are removed.
- **Defaults** (frozen in C-21): `effects.fog()` with no arguments gives `mode: "height"`, `σ_d = 0.004`, `σ_h = 0.008`,
  `b = 0.2`, `h0 = 0`, `start = 2 m`, `maxOpacity = 1`, `color = "sky"` (else `#a9bccf`). For a horizontal view from 1.6 m
  (`τ ≈ 0.0098·d'`) this gives ≈ 7% at 10 m, 37% at 50 m and 62% at 100 m, versus 40% at 10 m today (E38). Near gameplay
  keeps its contrast, and distant geometry still converges to the horizon colour (aerial perspective). Legacy calls that
  pass only `density` keep exp2 mode with that density and `maxOpacity = 1`. `legacyOpacityCap: true` restores
  `0.25 + intensity·0.55` (§11). These defaults apply only when `A3D_QR_VFX_FOG` is on. The builder records the authored
  fields, and `compiler/fog.ts` applies the defaults at resolve time, so flag-off output is unchanged.

### 6.7 Volumetric fog (GPU)

- **Tier mapping (C-27 `volumetricFog` / `froxelGrid`, frozen):**
  - Low and Medium (`"analytic"`): analytic height fog plus fog volumes only. `effects.volumetricFog` maps to analytic,
    with PRD 03 screen-space god rays added when requested.
  - High (`"froxel-medium"`): froxel grid 160×90×64.
  - Ultra (`"froxel-high"`): 240×135×128 with temporal reprojection (R10). When the C-27 Ultra memory budget check
    fails, the grid drops to 240×135×96, reported as `diagnostics().atmosphere.volumetric.grid` and
    `VOLUMETRIC_GRID_REDUCED`.
- **Grid:** view-aligned froxels, exponential slice distribution `z_k = n·(f/n)^(k/N)` with `n = 0.5 m`,
  `f = volumetricFar` (High 64 m, Ultra 96 m; beyond it, analytic fog continues so there is no seam).
- **Storage without new device features.** `RenderTargetDescriptor` has no 3D dimension today; `dimension` is
  pre-declared and pending in PR 0a. The volume is therefore a **2D tiled atlas** of slices in an `rgba16f` render
  target: 8×8 tiles of 160×90 = 1280×720 for High, and 16×8 tiles of 240×135 = 3840×1080 for Ultra. The z lookup does
  two bilinear fetches and lerps between them. A `2d-array` path is an optional, cost-only switch once PRD 01 implements
  `dimension: "2d-array"`.
- **WebGL2 implementation (no compute):**
  1. *Inject.* One fullscreen draw per slice into its tile.
     - Density = height fog + fog volumes + 3D noise (scrolling, `noiseScale`, `noiseStrength`).
     - Lighting = sun × `a3dSunShadowAt(froxelCentre)` (C-11; stub 1.0, so no shafts until it is real) × HG phase,
       + `a3dSampleIrradianceSH` ambient (C-09 chunk), + up to 4 local spot/point lights.
     - Ultra jitters the slice offset per frame.
  2. *Temporal* (Ultra). Reproject the previous inject atlas with C-01 `FrameCamera.previousViewProjectionMatrix`, blend
     0.9, and reject samples outside the volume. When that matrix is null (stub), temporal is off and diagnostics report
     `VOLUMETRIC_TEMPORAL_PENDING`.
  3. *Integrate.* One pass that loops the slices front to back and writes accumulated inscatter (rgb) and transmittance
     (a) into a second atlas.
  4. *Apply.* A fullscreen draw at the pixel's linear depth from `ctx.sceneDepth`. It is expressed as alpha-over with
     `src.a = 1 - T` and `src.rgb = S / max(1 - T, 1e-4)`, which equals `color·T + S`. That makes it valid on the C-04
     stub. It runs in `after-opaque`, or as the C-13 post pass `prd07.volumetric-apply` (`insertAt: "before-taa"`,
     `space: "linear-hdr"`) when `A3D_QR_POST` is on. Transparents and particles fetch the same atlas per vertex.
  The froxel path needs `ctx.sceneDepth.available`. Without it, the pass is skipped, analytic fog covers every tier, and
  diagnostics report `VOLUMETRIC_DEPTH_PENDING`. All froxel visual acceptance is therefore integrated (I4).
- **WebGPU:** the same passes as compute dispatches, when C-29 selects WebGPU.
- **The CPU path.** `volumetricLightPixels` (E40) stays in PRD 03's `PostProcessPass.ts` as a test oracle only. It is
  planned by `compiler/postprocess.ts` (PRD 03; `index.ts:12806-12824` today). Turning it off for `volumetric-fog` nodes
  when `A3D_QR_VFX_VOLUMETRIC` is on is request R-03-1. Until R-03-1 lands, Deep Recovery still pays the CPU readback with
  the flag on, so its performance criterion is integrated (I6). PRD 07 never edits the postprocess plan.

### 6.8 Weather

- **Rain:** procedural camera-relative volume (box 24×18×24 m Medium), velocity-stretched `rain-streak`, additive at low
  alpha with lit tint from sky irradiance, wind from `Weather.ts` state (E45), counts per tier (§18); occlusion under
  roofs via a top-down height test against `occluderHeightAt` when provided (C-26 `AuraHeightQuery.occluderHeightAt?`),
  else none.
  Splashes: CPU emitter spawning `splash` flipbooks at random points on `groundHeightAt(x, z)` in a 12 m disc around the
  camera, rate ∝ intensity. The default for `groundHeightAt` is C-26 `app.world.height().heightAt`, whose stub returns 0.
  Ripples: animated ripple normal flipbook in the wetness chunk.
- **Snow:** procedural volume, `snowflake` ×4 variants, sway `sin(t·f + id)·amp`, lit; optional `snowCover` term.
- **Wetness/snow-cover chunk (`a3d_prd07_wetness`, C-21 `WETNESS_CHUNK`).** `atmosphere/chunks.ts` registers it through
  C-02 as `ShaderFeature` `prd07.wetness` (hook `fragment:material`, `#define A3D_WETNESS`).
  - Formulas: `albedo *= mix(1, 0.55, wet·porosity)`; `roughness = mix(roughness, 0.06, wet·puddle)`. The puddle mask is a
    world-space tiled noise texture thresholded by `wet`. Ripple normals blend into puddles while it rains. `snowCover`
    lerps albedo to 0.9 where `N.y > 0.6`.
  - Global uniforms are driven by `AtmosphereWetness.ts` (E45). PRD 10 `world.street({ wet })` consumes it (C-21).
  - It affects forward geometry only when C-02 is real (`A3D_QR_CORE=v2`). Until then diagnostics report
    `WETNESS_PENDING` and wet looks are integrated (I3). PRD 07 decals and puddle decals apply it in their own programs
    from day 0.
- **Lightning:** ribbon bolt (branching L-system of 3–5 segments, additive HDR 40, 0.12 s), sky brightening uniform,
  directional flash light `1 + flash·4` (existing), thunder delay event for audio.
- **`weather.precipitation`** (E44, carved `nodes/weather.ts`) adds the rain/snow effect node. The legacy ≤ 160 boxes
  are registered as runtime nodes `prd07.legacyWeather.<n>`, which the effect system hides when `A3D_QR_VFX` is on (the
  same pattern as `sky.dayNight`, §6.5). `weather.wetGround` adds a wetness node beside its legacy slab and puddles,
  which are hidden the same way. Both drop the legacy nodes at flag removal.

### 6.9 Decals

- `DecalBatch`: projected geometry from `ProjectedDecalGeometry` (E47, kept) appended into one dynamic vertex buffer per
  atlas page and blend mode (ring allocator; oldest evicted when full). One draw per page × blend, not one per decal (E46).
- Lit decals: `vfx/shaders/decal.glsl.ts` is PRD 07's own program. It uses the decal's albedo, a tangent-space normal
  that perturbs the projected mesh normal, and roughness from the decal page. It shades with sun half-Lambert +
  GGX specular + `a3dSampleIrradianceSH` (C-09 chunk) + `a3dApplyFog`. Blend is `alpha` for marks and `multiply` for
  grime (C-04; with the stub, multiply is emulated as alpha-over with black at `1 - luminance`, reported as
  `VFX_BLEND_FALLBACK`). When C-02 is real, the fragment includes PRD 01's `brdf` chunk so lighting matches the
  surrounding geometry exactly (I3). Angle fade and distance fade are kept, and life/fade-out curves are added.
- Capacity per tier: Low 64, Medium 128, High 256, Ultra 512 (was a hard 32).
- Skid/tyre marks use `orientation: "surface"` ribbons in the decal phase (§6.2.9), which is cheaper than re-projecting a
  decal every frame.
- Projection onto skinned meshes, screen-space/deferred decals and atlas packing at runtime are out of scope (§25).

### 6.10 Diagnostics (observed, not declared)

Diagnostics are registered as C-31 sections `effects` and `atmosphere` from `agent-api/vfx/diagnostics.ts`. Their types
are C-20 `AuraEffectsDiagnostics` plus `pixelBacked`.

`app.diagnostics().effects`:
`{ nodes: [{ id, effect, consumer, live, drawCalls, instancesDrawn, sim: "cpu"|"gpu"|"procedural"|"compute", softDepth,
zeroPixelFrames }], batches, liveParticles, budget: { tier, cap, culled }, gpuMs?, errors: [{ code, nodeId, message }],
pixelBacked }`.

`app.diagnostics().atmosphere`: `{ background: "sky-preetham"|"sky-gradient"|"environment"|"color", fog: { mode, path:
"legacy-uniforms"|"generator", activeNodeId, maxOpacity }, volumetric: { mode: "analytic"|"froxel", grid?, gpuMs? } }`.

Measurement sources:
- `drawCalls` and `instancesDrawn` are counted at submission inside PRD 07 passes.
- `gpuMs` comes from C-28 `FrameStatsLike.scope("particles", …)`. It is `null` while the C-28 stub reports `gpuMs: null`,
  and never a constant (C-31 rule).

Replacements:
- `collectParticleBudgetDiagnostics.gpuReady` (carved `nodes/particles.ts`, owned) is replaced by
  `{ declared, observedLive, observedDraws }`.
- The scene-kit evidence strings at `index.ts:9683, 9756, 9795-9796` (E18) are in PRD 11's `devtools/sceneKitBudgets.ts`
  carve-out. Their replacement is request R-11-1.

### 6.11 Recommendations with cost profile

Costs are targets for a Medium-tier desktop (integrated-class GPU, 1080p) unless stated; validated per §18. Bundle = gzip
JS added to `@aura3d/engine`.

| # | Recommendation | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Particle batch pass + CPU feeder + atlas, wired to `effects.particles/flipbook` | Largest: particles go from absent (14-particles 1/10) to soft, textured, blended sprites in every game (Particles mean 1.4) | 0.3–1.5 ms, fill-bound (overdraw) | 0.05 ms per 1k CPU particles (sim + write) | 64 B/particle; atlas 5.3 MB (2k KTX2 + mips) / 1.3 MB (1k) | +14 KB | 1k atlas, 2k live cap, no soft depth on Low | alpha-over blend fallback (C-04 stub); safe-basic renderer keeps legacy models until R-15-2; Canvas2D diagnostic only |
| R2 | Impact library + `game.effects`/`gameFeel` auto-mount + `app.effects.burst` | Hit moments gain sparks, flash, ring, dust (VFX mean 2.2; Aura Clash, Mech, Orbital) | in R1 | ≤ 0.1 ms per 10 live effects | pools ≤ 1 MB | +6 KB | lights off on Low | PRD 09 backend A primitive pool |
| R3 | Ribbons/trails + beams + light cones | Dash/slash, contrails, skid marks, vision cones, aurora | 0.05–0.3 ms | 0.02 ms per trail | 48 points × 32 B per trail | +4 KB | ≤ 8 trails Low | none (feature absent) |
| R4 | Mesh particles | Debris that reads as 3D | 0.1–0.4 ms (instanced) | 0.03 ms per 100 | 96 B/instance | +3 KB | sprite chips on Low | sprite debris |
| R5 | Procedural sky (preetham + gradient + stars/clouds/moon) as background, sky→IBL capture | Removes flat/banded skies (09 flat sky; Patrol, Aurora, Siege, Skyline, Pulse) | 0.1–0.25 ms per pixel (Low: 0.03 ms via sky-view) | < 0.02 ms | Low sky-view 256×128 RGBA16F 0.25 MB | +6 KB | sky-view texture | gradient sky |
| R6 | Integrated height fog, absorption, fog volumes, live fog, defaults, fog on background | Aerial perspective without grey wash (09, 17, 18; Turbo "grey wash"; Skyline acts) | +≈ 20 ALU/pixel ≈ 0.05 ms | < 0.01 ms | 0 | +2 KB | same | exp2 legacy mode |
| R7 | GPU froxel volumetric (High/Ultra) | Shafts and lit haze (Deep Recovery, Mech Hangar, Gallery Shift) | High ≤ 1.5 ms, Ultra ≤ 2.5 ms | < 0.05 ms | 2D tiled atlases: High 2 × 7.4 MB (1280×720 RGBA16F); Ultra 3 × 33.2 MB (3840×1080) | +5 KB (lazy chunk) | off (analytic) | analytic + PRD 03 god rays; skipped until C-01 depth is real |
| R8 | Weather volumes + splashes + wetness/snow chunk + lightning | Rain/snow that falls, wet streets (Courier, Skyline, Aura Clash night street) | 0.2–0.8 ms | 0.05 ms (splashes) | noise + ripple textures 1.5 MB | +4 KB | 25% counts, no ripples | static wet look only |
| R9 | Batched lit decals + surface ribbons | Tyre marks, scorch, cracks (Turbo, Orbital, Courier) | 0.05–0.3 ms | 0.02 ms per spawn (projection) | ≤ 4 MB ring at Ultra | +3 KB | 64 cap | unlit decals |
| R10 | GPU particle sim (WebGL2 ping-pong); WebGPU compute (PRD 11) | 10k–200k particle density for fountains, sparks showers, marine snow | 0.1–0.5 ms sim | ≈ 0 | 32 B/particle state | +4 KB | off on Low | CPU at tier cap |
| R11 | Zero-pixel error + observed diagnostics; delete descriptor/evidence theater | Prevents regressions to invisible effects | 0 | 0 | 0 | −(deleted code) | – | – |

---

## 7. APIs to add / change / remove

All in `@aura3d/engine` (`packages/engine/src/agent-api/`), re-exported from the root through the lane barrel.

**Conformance to the frozen contracts.** The signatures that cross lanes are frozen in C-20
(`packages/engine/src/contracts/effects.ts`, `packages/rendering/src/contracts/particles.ts`) and C-21
(`contracts/atmosphere.ts`). Where the C-20/C-21 text differs from this section, the contract wins. The richer types here
reach the contract only as **additive CCRs** (CONTRACTS §6.4: optional fields and concrete types replacing `unknown`).
PRD 07 files them on day 0. They never block, because every field is optional and the contract shape already compiles:
- **CCR-07-2 (C-21).** Concrete `AuraSkyClouds`, `AuraSkyStars`, `AuraSkyMoon` and `AuraVolumetricFogSpec.noise`
  replacing `unknown`; optional `AuraSkySunSpec.discSize` documented in degrees; optional `horizonGlowColor`.
  C-21's `horizonGlow?: number` (strength) is kept, and so are `hdri.rotation` and `cubemap.faces[]`.
- **CCR-07-3 (C-20).** Optional `normal` on `spawn` options. Optional extended `trail` fields (`widthOverLife`,
  `alphaOverLife`, `sprite`, `blend`, `orientation`, `minVertexDistance`, `maxPoints`, `emitWhen`). Optional lit-decal
  fields on `AuraDecalOptions` (`sprite`, `normalStrength`, `roughness`, `blend`, `fadeOut`). C-20 names `kind` and
  `lifetime` are kept, and `life` is not used.
- The typed `AuraVfxEffectSpec` layers below are a structural subtype of C-20's
  `layers: ({ type; at? } & Record<string, unknown>)[]`, so no CCR is needed for them.

### 7.1 Shared types

```ts
export type AuraBlendMode = "alpha" | "premultiplied" | "additive" | "multiply";       // maps to PRD 01 BlendMode
export type AuraVfxShading = "unlit" | "lit";
export type AuraCurve = readonly number[] | readonly (readonly [t: number, value: number])[]; // evenly spaced or keyed
export type AuraColorRamp = readonly (AuraColor | readonly [t: number, color: AuraColor])[];
export type AuraRange = number | readonly [min: number, max: number];

export interface AuraVfxSpriteSource {
  /** Built-in atlas sequence name, or a typed texture asset with sheet layout. */
  readonly sequence?: AuraVfxBuiltinSequence;
  readonly texture?: AuraAssetRef<"texture">;
  readonly columns?: number; readonly rows?: number; readonly frames?: number;
  readonly frameMode?: "over-life" | "fps" | "fixed";
  readonly fps?: number; readonly randomStartFrame?: boolean; readonly frameBlend?: boolean;
}
export type AuraVfxBuiltinSequence =
  | "soft-dot" | "glow" | "flare" | "spark-streak" | "ring" | "ring-thin" | "dust-mote" | "bubble" | "rain-streak"
  | "snowflake" | "smoke-a" | "smoke-b" | "fireball" | "flame-loop" | "muzzle" | "splash" | "electric" | "debris-chips";

export interface AuraVfxAtlasManifest {                  // PRD 07-owned (CONTRACTS App. A: C-07-OUT-3 → C-17 admission role "vfx-atlas")
  readonly version: 1;
  readonly pages: readonly { readonly id: string; readonly uri: string; readonly size: number;
                             readonly premultiplied: true; readonly colorSpace: "srgb" }[];
  readonly sequences: Readonly<Record<string, { readonly page: string; readonly rect: readonly [number, number, number, number];
                             readonly columns: number; readonly rows: number; readonly frames: number;
                             readonly fps?: number; readonly loop?: boolean }>>;
}
```

### 7.2 Particles, flipbooks, trails, beams, mesh particles

```ts
export interface AuraParticleEmitterOptions {
  readonly name?: string;
  readonly position?: AuraVec3;
  readonly attachTo?: string | { readonly node: string; readonly socket?: string };   // runtime node id / PRD 06 bone socket
  readonly shape?: "point" | "sphere" | "hemisphere" | "cone" | "box" | "disc" | "ring" | "edge" | "mesh-surface";
  readonly shapeSize?: AuraVec3 | number; readonly coneAngleDeg?: number;
  readonly rate?: number;                                                    // particles/s (continuous)
  readonly bursts?: readonly { readonly time: number; readonly count: AuraRange; readonly repeat?: number; readonly interval?: number }[];
  readonly maxParticles?: number;                                            // clamped to tier budget, reported
  readonly duration?: number; readonly loop?: boolean; readonly prewarm?: boolean;
  readonly seed?: number;                                                     // deterministic (benchmark seed 1414)
  readonly lifetime?: AuraRange; readonly speed?: AuraRange; readonly size?: AuraRange; readonly rotation?: AuraRange;
  readonly angularVelocity?: AuraRange;
  readonly gravity?: number | AuraVec3; readonly drag?: number; readonly wind?: AuraVec3 | "weather";
  readonly noise?: { readonly strength: number; readonly frequency: number; readonly scroll?: number };   // curl noise
  readonly collision?: { readonly plane?: number; readonly heightfield?: "world"; readonly bounce?: number; readonly lifeLoss?: number };
  readonly sizeOverLife?: AuraCurve; readonly alphaOverLife?: AuraCurve; readonly speedOverLife?: AuraCurve;
  readonly color?: AuraColor; readonly colorOverLife?: AuraColorRamp; readonly intensity?: number;   // HDR multiplier
  readonly sprite?: AuraVfxSpriteSource;
  readonly blend?: AuraBlendMode; readonly shading?: AuraVfxShading;
  readonly stretch?: { readonly mode: "velocity" | "none"; readonly factor?: number };
  readonly softDistance?: number; readonly nearFade?: number;
  readonly simulation?: "auto" | "cpu" | "gpu";                              // auto: by count and tier
  readonly space?: "world" | "local";
  readonly subEmitters?: readonly { readonly on: "death" | "collision"; readonly effect: AuraVfxEffectSpec | AuraVfxKind }[];
  readonly castShadow?: false;                                               // sprites never cast
  // legacy fields kept and mapped (§11): materialMode, texturedBillboard, emitter, radius, height, particleCount,
  // emissionRate, groundCollision, lifetimeColorRamp, velocityOverLife, turbulence, density, speed
}

export const effects: {
  particles(options?: AuraParticleEmitterOptions & AuraLegacyParticleFields): AuraNodeBuilder<AuraEffectNode>;
  flipbook(options?: { readonly sprite?: AuraVfxSpriteSource; readonly position?: AuraVec3; readonly size?: number;
                       readonly blend?: AuraBlendMode; readonly loop?: boolean; readonly intensity?: number;
                       readonly color?: AuraColor; readonly spriteColumns?: number; readonly spriteRows?: number;
                       readonly frameRate?: number }): AuraNodeBuilder<AuraEffectNode>;
  trail(options: { readonly target: string | { readonly node: string; readonly socket?: string };
                   readonly width?: number; readonly life?: number; readonly color?: AuraColor | AuraColorRamp;
                   readonly widthOverLife?: AuraCurve; readonly alphaOverLife?: AuraCurve; readonly sprite?: AuraVfxSpriteSource;
                   readonly blend?: AuraBlendMode; readonly orientation?: "camera" | "surface";
                   readonly minVertexDistance?: number; readonly maxPoints?: number; readonly emitWhen?: "always" | "moving" }): AuraNodeBuilder<AuraEffectNode>;
  beam(options?: { readonly from?: AuraVec3; readonly to?: AuraVec3; readonly widthWorld?: number; readonly segmentCount?: number;
                   readonly color?: AuraColor; readonly intensity?: number; readonly noiseScroll?: number; readonly coreExponent?: number }): AuraNodeBuilder<AuraEffectNode>;
  lightCone(options: { readonly light: string; readonly length?: number; readonly color?: AuraColor;
                       readonly intensity?: number; readonly noise?: number }): AuraNodeBuilder<AuraEffectNode>;
  auroraRibbon(options?: { readonly ribbons?: 2 | 3 | 4; readonly distance?: number; readonly height?: number;
                           readonly colors?: readonly [AuraColor, AuraColor]; readonly intensity?: number; readonly seed?: number }): AuraNodeBuilder<AuraEffectNode>;
  meshParticles(options: AuraParticleEmitterOptions & { readonly mesh: "box" | "sphere" | "tetra" | AuraAssetRef<"model">;
                           readonly bounce?: number; readonly castShadow?: boolean; readonly material?: AuraMaterialInput }): AuraNodeBuilder<AuraEffectNode>;
  rain(options?: AuraRainOptions): AuraNodeBuilder<AuraEffectNode>;          // §7.5
  snow(options?: AuraSnowOptions): AuraNodeBuilder<AuraEffectNode>;
  fog(options?: AuraHeightFogSpec & AuraLegacyFogFields): AuraNodeBuilder<AuraEffectNode>;          // §7.4
  fogVolume(options: AuraFogVolumeSpec): AuraNodeBuilder<AuraEffectNode>;
  volumetricFog(options?: AuraVolumetricFogSpec): AuraNodeBuilder<AuraEffectNode>;
  // unchanged postprocess builders (bloom, colorGrade, ...) belong to PRD 03
};
```

### 7.3 Sky

```ts
export interface AuraSkySunSpec {
  readonly elevationDeg: number; readonly azimuthDeg: number;
  readonly discSize?: number;               // degrees, default 0.53 (C-21 name; unit documented by CCR-07-2)
  readonly intensity?: number;              // radiance multiplier, default 1 (HDR; disc peaks ≈ 20 before tone map)
  readonly color?: AuraColor;
}
export type AuraSkySpec =                   // C-21 (frozen); PRD 10 AuraBiomeRig.sky (C-26)
  | { readonly model: "preetham"; readonly sun: AuraSkySunSpec; readonly turbidity?: number; readonly rayleigh?: number;
      readonly mieCoefficient?: number; readonly mieDirectionalG?: number; readonly exposure?: number;
      readonly clouds?: AuraSkyClouds | false; readonly stars?: AuraSkyStars | false; readonly moon?: AuraSkyMoon | false;
      readonly groundColor?: AuraColor }
  | { readonly model: "gradient"; readonly zenith: AuraColor; readonly horizon: AuraColor; readonly ground?: AuraColor;
      readonly exponent?: number; readonly horizonGlow?: number /* strength; C-21 */; readonly horizonGlowColor?: AuraColor /* CCR-07-2 */;
      readonly sun?: AuraSkySunSpec; readonly bands?: { readonly frequency: number; readonly scroll?: number };
      readonly stars?: AuraSkyStars | false; readonly moon?: AuraSkyMoon | false; readonly intensity?: number }
  | { readonly model: "hdri"; readonly texture: AuraAssetRef<"texture">; readonly rotation?: number /* degrees */;
      readonly blurriness?: number; readonly intensity?: number }            // background drawn by PRD 02 (C-09); prd07.sky does not draw it
  | { readonly model: "cubemap"; readonly faces: readonly AuraAssetRef<"texture">[]; readonly intensity?: number }; // PRD 02 (C-09)
export interface AuraSkyClouds { readonly coverage?: number; readonly density?: number; readonly scale?: number;
                                 readonly elevation?: number; readonly speed?: number }
export interface AuraSkyStars { readonly density?: number; readonly brightness?: number; readonly twinkle?: number; readonly seed?: number }
export interface AuraSkyMoon { readonly elevationDeg: number; readonly azimuthDeg: number; readonly phase?: number; readonly intensity?: number }

export const sky: {
  preetham(options: Omit<Extract<AuraSkySpec, { model: "preetham" }>, "model"> & { readonly name?: string;
           readonly captureEnvironment?: boolean /* default true when no environment node */ }): AuraNodeBuilder<AuraSkyNode>;
  gradient(options: Omit<Extract<AuraSkySpec, { model: "gradient" }>, "model"> & { readonly name?: string;
           readonly captureEnvironment?: boolean }): AuraNodeBuilder<AuraSkyNode>;
  hdri(options: Omit<Extract<AuraSkySpec, { model: "hdri" }>, "model">): AuraNodeBuilder<AuraSkyNode>;
  /** Rewritten: adds one sky node + one key light + fog hint; legacy primitives kept as hidden-by-flag runtime nodes until flag removal (§6.5). Return shape preserved. */
  dayNight(options?: DayNightSkyOptions & { readonly starLimit?: number; readonly cloudLimit?: number;
           readonly model?: "preetham" | "gradient" }): { readonly nodes: readonly AuraSceneNode[]; readonly background: string;
           readonly dayFactor: number; readonly visibleStarCount: number; readonly sky: AuraSkySpec };
};
// AuraSkyNode: { kind: "sky"; name: string; spec: AuraSkySpec; captureEnvironment: boolean; affectsFog: boolean }
// Runtime: app.atmosphere.setSky(partial: Partial<AuraSkySpec>, { transitionSeconds? }): void
```

### 7.4 Fog and volumetrics

```ts
export interface AuraHeightFogSpec {        // C-21 (frozen); PRD 10 AuraBiomeRig.fog (C-26)
  readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption";
  readonly color?: AuraColor | "sky";       // default "sky" when a sky node exists
  readonly density?: number;                // σ_d (distance term), default 0.004 (height mode)
  readonly heightDensity?: number;          // σ_h, default 0.008
  readonly heightFalloff?: number;          // b, default 0.2 per metre
  readonly heightReference?: number;        // h0, default 0
  readonly start?: number;                  // default 2 m
  readonly maxOpacity?: number;             // default 1
  readonly near?: number; readonly far?: number;              // linear mode only
  readonly absorption?: AuraVec3;           // per-channel σ for "absorption" (underwater)
  readonly sunInscatter?: number;           // default 0.6
  readonly anisotropy?: number;             // HG g, default 0.6
  readonly affectsBackground?: boolean;     // default: true for sky/solid colour, false for HDRI background
  readonly backgroundDistance?: number;     // default camera.far
  readonly transitionSeconds?: number;      // used by setFog / visibility swaps, default 0
}
export interface AuraFogVolumeSpec {
  readonly shape: "box" | "ellipsoid"; readonly position: AuraVec3; readonly size: AuraVec3;
  readonly density: number; readonly color?: AuraColor; readonly edgeFalloff?: number; readonly name?: string;
}
export interface AuraVolumetricFogSpec extends AuraHeightFogSpec {
  readonly quality?: "auto" | "analytic" | "froxel";     // auto = tier (PRD 11)
  readonly volumetricFar?: number;          // default High 64, Ultra 96
  readonly noise?: { readonly strength: number; readonly scale: number; readonly speed?: AuraVec3 };
  readonly lightShafts?: boolean;           // default true: sun visibility from shadow map
  readonly localLights?: boolean;           // default true on Ultra
  readonly color?: AuraColor | "sky";       // authored colour is honoured (today ignored, E40)
}
// Runtime:
//   handle.setFog(partial: Partial<AuraHeightFogSpec>): void            (fog node handles)
//   app.atmosphere.setFog(spec: AuraHeightFogSpec | null, { transitionSeconds? }): void
//   app.atmosphere.state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number }
```

### 7.5 Weather

```ts
export interface AuraRainOptions {
  readonly intensity?: number;              // 0..1, default 0.5
  readonly wind?: AuraVec3 | "weather";
  readonly streakLength?: number;           // default 0.45 m at intensity 0.5
  readonly count?: number;                  // clamped to tier (§18)
  readonly splashes?: boolean;              // default true
  readonly ripples?: boolean;               // default true (Medium+)
  readonly wetness?: number | "auto";       // drives a3d_wetness, "auto" ramps with exposure time
  readonly groundHeightAt?: (x: number, z: number) => number;
  readonly occluderHeightAt?: (x: number, z: number) => number;
  readonly color?: AuraColor;
  // legacy: density, speed, particleCount, mist (mist → low fog volume)
}
export interface AuraSnowOptions extends Omit<AuraRainOptions, "streakLength" | "ripples" | "splashes"> {
  readonly flakeSize?: number; readonly sway?: number; readonly cover?: number;   // a3d_wetness snowCover
}
export const weather: {
  rain(options?: AuraRainOptions): { readonly nodes: readonly AuraSceneNode[] };
  snow(options?: AuraSnowOptions): { readonly nodes: readonly AuraSceneNode[] };
  lightning(options?: { readonly interval?: AuraRange; readonly intensity?: number; readonly seed?: number }): { readonly nodes: readonly AuraSceneNode[] };
  /** Rewritten: returns rain/snow nodes above; no boxes or spheres. */
  precipitation(options: WeatherPrecipitationOptions): { readonly nodes: readonly AuraSceneNode[]; readonly state: WeatherState };
  /** Rewritten: emits a wetness node (+ optional puddle decals); no slab or cylinder puddles. */
  wetGround(options?: { readonly wetness?: number; readonly puddles?: number; readonly seed?: number }): { readonly nodes: readonly AuraSceneNode[] };
};
// Runtime: app.atmosphere.setWetness(value: number, { transitionSeconds? }): void
```

### 7.6 Decals

```ts
// decals.* (Decals.ts, owned) keeps its public signatures; changes:
//   AURA_DECAL_MAX_DECALS is kept as a deprecated constant until flag removal; with A3D_QR_VFX_DECALS on, capacity = tier cap
//   (§6.9), oldest evicted, diagnostics count evictions.
export interface AuraDecalOptions {        // C-20 fields (kind, size, lifetime, color, opacity) + CCR-07-3 additive fields
  readonly kind?: AuraVfxBuiltinDecal | string; readonly size?: number; readonly lifetime?: number;
  readonly color?: AuraColor; readonly opacity?: number;                  // C-20 (frozen)
  readonly sprite?: AuraVfxSpriteSource;                                   // CCR-07-3
  readonly normalStrength?: number; readonly roughness?: number;          // CCR-07-3, lit decal channels
  readonly blend?: "alpha" | "multiply";                                   // CCR-07-3
  readonly fadeOut?: number;                                               // CCR-07-3
}
export type AuraVfxBuiltinDecal = "scorch-a" | "scorch-b" | "crack-a" | "crack-b" | "bullet-hole" | "splat-a" | "splat-b"
  | "tyre-track" | "footprint" | "puddle";
// app.effects.decal(at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle
```

### 7.7 Runtime mutation and imperative effects

```ts
// AuraRuntimeNodeRegistry.add/remove/version are CONSUMED from C-37 (provider PRD 15, `contracts/runtimeNodes.ts`);
// this PRD does not declare or implement them. PRD 07 registers one C-37 node-handle extension:
//   registerNodeHandleExtension({ id: "prd07.setFog", owner: "prd07", flag: "A3D_QR_VFX_FOG", member: "setFog",
//                                 appliesTo: ["effect"], create: (handle, app) => (partial) => liveFog.patch(handle, partial) })
export type AuraVfxKind =                            // C-20 (frozen)
  | "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble"
  | "impact-flash" | "super-flash" | "impact-decal" | "aura-burst";
export interface AuraVfxEffectSpec {
  readonly name: string;
  readonly layers: readonly (
    | { readonly type: "emitter"; readonly at?: number; readonly emitter: AuraParticleEmitterOptions }
    | { readonly type: "mesh"; readonly at?: number; readonly emitter: Parameters<typeof effects.meshParticles>[0] }
    | { readonly type: "ribbon"; readonly at?: number; readonly trail: Parameters<typeof effects.trail>[0] }
    | { readonly type: "decal"; readonly at?: number; readonly decal: AuraDecalOptions }
    | { readonly type: "light"; readonly at?: number; readonly color: AuraColor; readonly intensity: number;
        readonly range: number; readonly duration: number }
    | { readonly type: "camera"; readonly at?: number; readonly shake?: number; readonly punch?: number })[];  // → C-22 app.camera.shake.add / punch.trigger
}
export interface AuraEffectInstanceHandle { readonly id: string; readonly alive: boolean; stop(options?: { readonly immediate?: boolean }): void;
                                            setPosition(p: AuraVec3): void; setDirection?(n: AuraVec3): void }
export interface AuraAppEffects {                    // app.effects: C-20 (frozen) + CCR-07-3 optional fields; registered via C-38
  burst(kind: AuraVfxKind, position: AuraVec3, options?: { readonly count?: number; readonly speed?: number; readonly scale?: number;
        readonly color?: AuraColor; readonly normal?: AuraVec3; readonly seed?: number; readonly intensity?: number }): AuraEffectInstanceHandle;
  spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { readonly node: string; readonly socket?: string },
        options?: { readonly seed?: number; readonly scale?: number; readonly color?: AuraColor; readonly normal?: AuraVec3 /* CCR-07-3 */ }): AuraEffectInstanceHandle;
  trail(target: string | { readonly node: string; readonly socket?: string },
        options: { readonly width: number; readonly life: number; readonly color?: AuraColor }      // C-20
               & Partial<Omit<Parameters<typeof effects.trail>[0], "target" | "width" | "life" | "color">>): AuraEffectInstanceHandle; // CCR-07-3
  decal(at: { readonly position: AuraVec3; readonly normal: AuraVec3; readonly target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle;
  readonly presets: Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  readonly liveCount: number;
  clear(): void;
}
export interface AuraAppAtmosphere {                 // app.atmosphere: C-21 (frozen); registered via C-38
  setFog(spec: AuraHeightFogSpec | null, options?: { readonly transitionSeconds?: number }): void;
  setSky(spec: Partial<AuraSkySpec>, options?: { readonly transitionSeconds?: number }): void;
  setWetness(value: number, options?: { readonly transitionSeconds?: number }): void;
  state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number };
}
```

### 7.8 Game juice

```ts
// agent-api/vfx/gameEffects.ts (carved from GameRuntime.ts:1163-1164, owned by PRD 07 after PR 0b-1)
export interface GameEffectsOptions { /* existing */ readonly poolSize?: number;   // GameRuntime.ts:1164, default 96
  readonly app?: AuraApp;                       // new: bind to app.effects
  readonly autoMount?: boolean;                 // default true
  readonly legacyPrimitiveNodes?: boolean;      // default false; true restores effectToSceneNode output while bound
}
// GameEffectsController: spawn* methods unchanged; update(dt) is driven by the bound app loop;
// nodes(): readonly AuraSceneNode[]  — @deprecated; [] when bound (flag on) unless legacyPrimitiveNodes; unchanged when flag off.
// GameEffectKind → AuraVfxKind mapping: hit-spark→spark, block-spark→spark(blue, 0.6×), impact-decal→impact-decal,
// ground-dust→dust, dash-trail/slash-trail→streak, impact-flash→impact-flash, aura-burst→aura-burst,
// shockwave/ring-shockwave→ring, super-flash→super-flash.
// gameFeel.create(...) (GameFeel.ts, PRD 08) is adopted through its internal createGameEffects port with no edit;
// an explicit gameFeel.create({ app?, autoMount? }) passthrough is request R-08-1. damageFlash → impact-flash
// (+ C-05 setOutputOverlay flash), speedLines → PRD 03 speed-streak post (C-13), landingDust → dust.
```

### 7.9 Rendering package (`@aura3d/rendering`)

```ts
// C-20 ParticleRenderHook (frozen, contracts/particles.ts) is what PRD 07 provides via particleRenderHookSlot.provide();
// ParticleBatchPass is the implementation behind it.
export interface ParticleBatchDescriptor {          // C-20 (frozen)
  readonly key: string; readonly capacity: number; readonly source: "cpu" | "gpu" | "procedural" | "compute";
  readonly atlas: Texture; readonly blend: BlendMode /* C-04 */; readonly shading: "unlit" | "lit";
  readonly softDepth: boolean; readonly stretch: boolean; readonly frameBlend: boolean;
}
export class ParticleBatchPass implements ParticleRenderHook {
  constructor(device: RenderDevice, options?: { readonly maxBatches?: number });
  upsertBatch(desc: ParticleBatchDescriptor): ParticleBatchHandle;                              // C-20
  writeInstances(handle: ParticleBatchHandle, data: Float32Array, liveCount: number): void;    // C-20; 16 floats / particle
  removeBatch(handle: ParticleBatchHandle): void;                                               // C-20
  bindGpuState(handle: ParticleBatchHandle, state: ParticleGpuSimState): void;                 // PRD 07 internal
  transparentItems(ctx: FrameContributorContext): readonly TransparentQueueItem[];             // C-01 contributor "prd07.particles"
  dispose(): void;
}
// SceneDepthSource is CONSUMED from C-01 (contracts/frameGraph.ts) as ctx.sceneDepth; PRD 07 does not redeclare it.
export class SkyBackgroundPass implements SkyBackgroundPassLike {   // C-21 skyBackgroundSlot.provide(device => new SkyBackgroundPass(device))
  constructor(device: RenderDevice);
  setSpec(spec: AuraSkySpec, time: number): void;
  renderToCubeFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): void;   // C-09 fromScene renderFace
  horizonRadiance(azimuthSamples: 8): Float32Array;   // fog colour source
  passes(ctx: FrameContributorContext): readonly RenderPass[];      // C-01 "background" phase
}
export class VolumetricFogPass {
  constructor(device: RenderDevice, options: { readonly grid: readonly [number, number, number]; readonly temporal: boolean });
  update(input: { readonly fog: AuraVolumetricFogSpec; readonly frame: FrameContributorContext;
                  readonly lights: readonly CollectedLight[]; readonly time: number }): void;   // shadow via C-11 chunk; depth via ctx.sceneDepth
  readonly volume: { readonly atlas: RenderTarget; readonly tiles: readonly [number, number]; readonly grid: readonly [number, number, number] } | null;
}
// RenderSource fields vfx?/sky?/fog?/volumetric?/wetness? are pre-declared by PR 0a (custodian 15, inert). PRD 07 does not
// depend on them: its contributors read app state through EffectSystemRegistry (§6.3.1). They remain DIAGNOSTIC_ONLY
// (compiler/diagnosticOnly.prd07.ts) until PRD 15's real compiler populates them from PRD 07's handlers.
```

### 7.10 Removed or deprecated

"Flag removal" means the `A3D_QR_VFX` removal PR (CONTRACTS §5.4: after two `default-on` checkpoints). No public export
is removed before then, because the `85aafcd0` export superset rule applies (CONTRACTS §3.9).

| Symbol | Action | When / owner |
|---|---|---|
| `effects.particles` legacy fields (`materialMode`, `texturedBillboard`, `emitter`, `radius`, `height`, `particleCount`, `emissionRate`, `groundCollision`, `lifetimeColorRamp`, `velocityOverLife`, `turbulence`) | kept, mapped to new fields (§11), `@deprecated` JSDoc | removed next major (07) |
| `GameEffectsController.nodes()` | deprecated when bound | next major (07, `vfx/gameEffects.ts`) |
| `GameFeelController.nodes()` | deprecation JSDoc | request R-08-1 (08 owns `GameFeel.ts`) |
| `planSkyBackdrop` | `@deprecated`, dev warning pointing to `sky.gradient` | request R-10-1 (10 owns `LayeredSceneComposition.ts`) |
| `createProceduralSkyDome` | removed from root exports. `createEnvironmentStage` is **kept** because it has live callers | request R-02-3 at flag removal |
| `RootGpuParticleWorkload`, `createRootGpuParticleWorkload` | file deleted (07); root re-export removal is R-15-4 | flag removal |
| PRD 07-owned `cinematic/*` descriptors (E42) | deleted (07); PRD 03-owned ones are R-03-2 | flag removal |
| `collectParticleBudgetDiagnostics().gpuReady` | replaced by observed values (07, `nodes/particles.ts`); kept as a deprecated alias equal to `observedDraws > 0` | P1 |
| scene-kit evidence strings (E18) | replaced | request R-11-1 |
| `AURA_DECAL_MAX_DECALS` | deprecated constant; tier cap when `A3D_QR_VFX_DECALS` is on | removed at flag removal (07) |

---

## 8. Shader changes

GLSL ES 3.00 is shown. All chunks are registered from PRD 07 files through C-02 `registerShaderChunk`, with names
`a3d_prd07_*`. Each record carries its `wgsl` twin string. A missing twin reports `WGSL_PROGRAM_MISSING` only on the
WebGPU backend. Camera data comes from C-08. Its stub has `buffer: null`, so day-0 chunks read the legacy uniforms
(`u_cameraPosition`, `u_viewProjection`, `u_view`, `u_projection`), which the C-02 `ChunkHarness` declares in both
forms. Particles write `o_reactive` only when the C-14 reactive attachment exists. **No PRD 07 change touches
`ShaderChunks.ts`, `ShaderLibrary.ts` or `ShaderLibraryCore.ts`.** Those are frozen legacy files owned by PRD 01
(CONTRACTS §3.7).

### 8.1 Particle billboard (`vfx/shaders/particle.glsl.ts`)

```glsl
// vertex
layout(location=0) in vec2 a_corner;             // (-1,-1)..(1,1)
layout(location=1) in vec4 a_posSize;            // divisor 1
layout(location=2) in vec4 a_velStretch;
layout(location=3) in vec4 a_color;
layout(location=4) in vec4 a_rotFrameMisc;
#if PARTICLE_SOURCE == SOURCE_GPU
uniform highp sampler2D u_statePos; uniform highp sampler2D u_stateVel; uniform int u_stateWidth;
#endif
uniform vec4 u_atlasRect; uniform vec2 u_grid;   // sequence rect, columns/rows
out vec2 v_uv0; out vec2 v_uv1; out float v_frameT; out vec4 v_color; out float v_viewZ; out vec3 v_lit; out float v_fog;
void main() {
  vec3 P = a_posSize.xyz; float size = a_posSize.w; float rot = a_rotFrameMisc.x;
  vec3 right = u_cameraRight, up = u_cameraUp;
#if STRETCH
  vec3 vel = a_velStretch.xyz; float speed = length(vel);
  if (speed > 1e-4) {
    vec3 dirV = normalize((u_view * vec4(vel, 0.0)).xyz);
    vec2 d2 = normalize(dirV.xy + 1e-5);
    up = normalize(mat3(u_invView) * vec3(d2, 0.0)); right = normalize(cross(up, u_cameraForward));
    up *= 1.0 + speed * a_velStretch.w;
  }
#endif
  float c = cos(rot), s = sin(rot);
  vec2 k = vec2(c * a_corner.x - s * a_corner.y, s * a_corner.x + c * a_corner.y);
  vec3 world = P + (right * k.x + up * k.y) * size * 0.5;
  vec4 viewPos = u_view * vec4(world, 1.0); v_viewZ = -viewPos.z;
  gl_Position = u_projection * viewPos;
  // flipbook
  float frames = u_grid.x * u_grid.y; float f = clamp(a_rotFrameMisc.y, 0.0, frames - 1.0);
  float f0 = floor(f); float f1 = min(f0 + 1.0, frames - 1.0); v_frameT = f - f0;
  vec2 cell = vec2(1.0) / u_grid; vec2 local = a_corner * 0.5 + 0.5;
  v_uv0 = u_atlasRect.xy + (vec2(mod(f0, u_grid.x), u_grid.y - 1.0 - floor(f0 / u_grid.x)) + local) * cell * u_atlasRect.zw;
  v_uv1 = u_atlasRect.xy + (vec2(mod(f1, u_grid.x), u_grid.y - 1.0 - floor(f1 / u_grid.x)) + local) * cell * u_atlasRect.zw;
  v_color = a_color;
#if SHADING_LIT
  vec3 toCam = normalize(u_cameraPosition - P);
  vec3 N = normalize(mix(toCam, normalize(right * a_corner.x + up * a_corner.y), a_rotFrameMisc.w));
  float wrap = 0.5 + 0.5 * dot(N, u_sunDirection);
  float back = pow(clamp(dot(-toCam, u_sunDirection), 0.0, 1.0), 4.0) * u_particleTransmission;
  float vis = 1.0;
  #if PARTICLE_SHADOW
  vis = a3dSunShadowAt(P);                                   // C-11 chunk a3d_prd02_shadow_lookup (stub returns 1.0)
  #endif
  v_lit = u_sunColor * (wrap + back) * vis + a3dSampleIrradianceSH(N) + a3dLocalLightsVertex(P, N);
#else
  v_lit = vec3(1.0);
#endif
  v_fog = a3dFogAmount(P);                                   // §8.4, per vertex for particles
}
// fragment
uniform sampler2D u_atlas; uniform float u_softDistance, u_nearFade;
#if SOFT_PARTICLES
uniform highp sampler2D u_sceneDepth;                        // SceneDepthSource
#endif
layout(location=0) out vec4 o_color; layout(location=2) out vec4 o_reactive;
void main() {
  vec4 t = texture(u_atlas, v_uv0);
#if FRAME_BLEND
  t = mix(t, texture(u_atlas, v_uv1), v_frameT);
#endif
  float fade = v_color.a;
#if SOFT_PARTICLES
  float sceneZ = a3dLinearizeDepth(texelFetch(u_sceneDepth, ivec2(gl_FragCoord.xy), 0).r);
  fade *= clamp((sceneZ - v_viewZ) / u_softDistance, 0.0, 1.0);
#endif
  fade *= clamp((v_viewZ - u_cameraNear) / u_nearFade, 0.0, 1.0);
  float a = t.a * fade;
  vec3 rgb = t.rgb * v_color.rgb * v_lit * fade;             // atlas is premultiplied, so rgb stays premultiplied
#if BLEND_ADDITIVE
  o_color = vec4(rgb * (1.0 - v_fog), 0.0);                  // fog fades emitted light; alpha unused (ONE, ONE)
#else
  rgb = mix(rgb, u_fogInscatter * a, v_fog);                 // fog the sprite's coverage, keep premultiplication
  o_color = vec4(rgb, a);                                    // premultiplied (ONE, ONE_MINUS_SRC_ALPHA)
#endif
  o_reactive = vec4(a);
}
```

Defines are C-02 feature bits under ids `prd07.particle.*` and are listed in C-20 `PARTICLE_PROGRAM_DEFINES`:
`PARTICLE_SOURCE` (cpu|gpu|procedural), `STRETCH`, `SHADING_LIT`, `PARTICLE_SHADOW`, `SOFT_PARTICLES`, `FRAME_BLEND`,
`BLEND_ADDITIVE`, `FOG_VOLUMETRIC` (fog from the froxel atlas instead of analytic). PRD 07 particle programs are compiled
by PRD 07 itself, through `RenderDevice` shader creation, until C-02 `ProgramCache` is real. They are keyed with C-02
`computeProgramKey`, so the swap needs no key change. At most 12 distinct particle programs are allowed per app; more is
diagnosed.

### 8.2 Procedural volume source (rain/snow/marine snow)

```glsl
vec3 a3dProceduralVolumePos(int id, float t) {
  vec3 h = a3dHash31(float(id) * 0.6180339 + u_seed);             // [0,1)^3
  vec3 p = h * u_volumeExtent + u_fallVelocity * t + u_sway * sin(t * u_swayFreq + h.x * 6.2831);
  return u_cameraPosition + mod(p - u_cameraPosition + u_volumeExtent * 0.5, u_volumeExtent) - u_volumeExtent * 0.5;
}
// alpha *= smoothstep(0.0, 0.15, edgeDistance / extent)   (fade at volume edges to hide wrapping)
// rain: velStretch = (u_fallVelocity, streakFactor); occluded if p.y < occluderHeight(p.xz) sampled from an R16F top-down map
```

### 8.3 GPU simulation (`vfx/shaders/gpu-sim.glsl.ts`, WebGL2 ping-pong)

```glsl
// two single-target passes per step until C-01/RenderTarget MRT lands (§6.2.3): pass A writes o_pos, pass B writes o_vel;
// both read u_prevPos + u_prevVel and run the identical integration below (deterministic, so A and B agree). One texel per particle.
vec4 pa = texelFetch(u_prevPos, ivec2(gl_FragCoord.xy), 0); vec4 va = texelFetch(u_prevVel, ivec2(gl_FragCoord.xy), 0);
int index = int(gl_FragCoord.y) * u_stateWidth + int(gl_FragCoord.x);
bool emit = a3dInRing(index, u_emitHead, u_emitCount, u_capacity);
if (emit) { a3dEmit(index, u_frame, pa, va); }              // emitter shape from uniforms, hash(seed, index, frame)
else if (pa.w < u_lifetimeMax) {
  vec3 acc = u_gravity + u_wind + a3dCurlNoise(pa.xyz * u_noiseFreq + u_time * u_noiseScroll) * u_noiseStrength;
  va.xyz = (va.xyz + acc * u_dt) * exp(-u_drag * u_dt);
  pa.xyz += va.xyz * u_dt; pa.w += u_dt;
  float ground = u_useHeightfield ? a3dSampleHeight(pa.xz) : u_groundPlane;
  if (pa.y < ground) { pa.y = ground; va.y = -va.y * u_bounce; va.xz *= 0.7; pa.w += u_lifeLoss; }
}
o_pos = pa; o_vel = va;
```

### 8.4 Height fog chunk (`a3d_prd07_fog`, C-21 `FOG_CHUNK`, file `atmosphere/shaders/fog.glsl.ts`; the legacy `ShaderChunks.ts:472-514` is not edited)

```glsl
uniform vec4 u_fogA;   // σ_d, σ_h, b, h0
uniform vec4 u_fogB;   // start, maxOpacity, sunInscatter, anisotropy g
uniform vec3 u_fogColor; uniform vec3 u_fogAbsorption; uniform int u_fogMode;  // 0 off,1 height,2 exp,3 exp2,4 linear,5 absorption,6 legacy-parity
uniform vec4 u_fogVolumes[2 * A3D_MAX_FOG_VOLUMES];             // centre.xyz+shape, halfSize.xyz+density
float a3dHeightFogTau(vec3 c, vec3 v, float d) {
  float dd = max(d - u_fogB.x, 0.0);
  float tau = u_fogA.x * dd;
  float k = u_fogA.z * v.y * dd;
  float line = abs(k) < 1e-4 ? 1.0 : (1.0 - exp(-k)) / k;
  tau += u_fogA.y * exp(-u_fogA.z * (c.y - u_fogA.w)) * dd * line;
  return tau;
}
float a3dFogAmount(vec3 worldPos) {
  vec3 r = worldPos - u_cameraPosition; float d = length(r); vec3 v = r / max(d, 1e-5);
  float tau = (u_fogMode == 1) ? a3dHeightFogTau(u_cameraPosition, v, d)
            : (u_fogMode == 2) ? u_fogA.x * d
            : (u_fogMode == 3) ? (u_fogA.x * d) * (u_fogA.x * d) : 0.0;
  tau += a3dFogVolumesTau(u_cameraPosition, v, d);             // analytic ray/box, ray/ellipsoid segment × density
  float f = (u_fogMode == 4) ? clamp((d - u_fogNear) / (u_fogFar - u_fogNear), 0.0, 1.0) : 1.0 - exp(-tau);
  return min(f, u_fogB.y);
}
vec3 a3dFogInscatter(vec3 v) {
  float g = u_fogB.w; float mu = dot(v, u_sunDirection);
  float hg = (1.0 - g * g) / (12.5663706 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return u_fogColor + u_sunColor * hg * u_fogB.z;
}
vec3 a3dApplyFog(vec3 color, vec3 worldPos) {                  // stable entry point (PRD 10)
  if (u_fogMode == 0) return color;
  vec3 r = worldPos - u_cameraPosition; vec3 v = normalize(r);
  if (u_fogMode == 5) { vec3 T = exp(-u_fogAbsorption * length(r)); return color * T + u_fogColor * (1.0 - T); }
#if FOG_VOLUMETRIC
  vec4 s = a3dSampleFroxel(worldPos);                          // rgb inscatter, a transmittance
  color = color * s.a + s.rgb;                                  // near part from the volume
  // far part beyond volumetricFar continues analytically from volumetricFar
#endif
  float f = a3dFogAmount(worldPos);
  return mix(color, a3dFogInscatter(v), f);
}
```

`u_fogColor` is linear. For `color: "sky"` it is set per frame from `SkyBackgroundPass.horizonRadiance` at the camera
azimuth (CPU interpolation of 8 samples). The background pass calls `a3dApplyFog` at
`u_cameraPosition + v · backgroundDistance` when `affectsBackground`.

**Legacy-parity mode (`u_fogMode == 6`).** This is the default while forward geometry is on the legacy path (§6.6).
`a3dFogAmount` evaluates exactly `a3dEnvironmentFogFactor` from `ShaderChunks.ts:475-491`: linear/exp/exp2 × the height
multiplier × `maxOpacity`. It reads the same values that `compiler/fog.ts` writes into the legacy
`u_environmentFog*` uniforms, packed by `HeightFog.packLegacy`. `tests/qr/prd07/unit/fog-legacy-parity.test.ts` checks
that the CPU mirrors of both formulas agree to 1e-6 on 1,000 random points.

### 8.5 Preetham sky (`atmosphere/shaders/sky.glsl.ts`)

Port of r185 `Sky.js` vertex/fragment: `totalRayleigh`, `totalMie(T)`, `sunIntensity(zenithAngleCos)`, Rayleigh and
Henyey-Greenstein Mie phases, `Lin`/`L0`, sun disc `smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002,
cosTheta)`, and the cloud block. Changes vs r185: (1) no tone mapping or `pow(.., 1/(1.2+...))` display shaping in the
shader (output linear radiance; three applies its own `toneMapped` path); (2) fullscreen-triangle evaluation using the
inverse view-projection ray instead of a sky mesh; (3) star field and moon layers added after the scattering term,
attenuated by `(1 - dayFactor)` and by cloud coverage; (4) `ground` hemisphere below the horizon = `groundColor ×
irradiance` fading through the horizon over 2°; (5) output × `exposure` × `intensity`.

### 8.6 Gradient sky

`h = clamp(dir.y, -1, 1)`; above: `mix(horizon, zenith, pow(max(h, 0), exponent))`; below: `mix(horizon, ground,
pow(-min(h, 0), 0.5))`; horizon glow `exp(-abs(h) · sharpness) · glowColor`; sun disc and bands per PRD 14 §8.7 (reversed
`smoothstep` edges are not used, `acos` input clamped). The output is float. When C-05 OutputPass is real it dithers.
Until then the sky fragment adds its own triangular dither of ±1 LSB at the 8-bit output, so the legacy path does not
band.

### 8.7 Volumetric passes (`atmosphere/shaders/volumetric-*.glsl.ts`)

- *inject* (per slice draw, `u_slice`): froxel centre from `(uv, z_k)`; `σ = heightDensity(p) + volumes(p) +
  noise3(p · scale + t · speed) · strength`; `L = σ · (sunColor · vis(p) · HG(μ, g) + ambientSH + Σ local)`; output
  `(L, σ)`; Ultra jitters `z_k` by `(frameIndex mod 8 + 0.5) / 8` of a slice.
- *integrate* (2D pass, loops `N` slices): `T_acc *= exp(-σ·Δz)`; `S_acc += L · (1 - exp(-σ·Δz)) / max(σ, 1e-5) · T_acc`
  (energy-conserving step, Hillaire 2015); writes `(S_acc, T_acc)` to slice k.
- *apply* (fullscreen after opaque + sky): `slice = log(z/n)/log(f/n)·N`; `color = color · T + S`.

### 8.8 Ribbon, beam, decal, wetness

- Ribbon vertex: `offset = normalize(cross(tangent, orientation == CAMERA ? toCamera : surfaceNormal)) · width(age) · 0.5 ·
  side`; `uv = vec2(distanceAlong / textureLength - scroll·t, side·0.5+0.5)`; fragment as §8.1 without flipbook.
- Beam: as ribbon with two points; core `pow(1 - abs(uv.y·2 - 1), coreExponent)` × scrolling noise.
- Decal fragment: sample albedo (premultiplied), normal (RG → reconstruct Z) and roughness; build the TBN from the
  projected tangent frame. Shade with PRD 07's own sun half-Lambert + GGX + SH (metallic 0). When C-02 is real, use the
  C-02 `brdf` chunk instead. Output alpha or multiply blend (C-04, stub fallback §6.9), then `a3dApplyFog` last.
- `a3d_prd07_wetness`: as §6.8. Uniforms `u_wetness`, `u_puddleThreshold`, `u_rainRipples` (atlas frame), `u_snowCover`.
  World-space puddle noise is `texture(u_puddleNoise, worldPos.xz / 6.0).r`.

---

## 9. Rendering changes (frame level)

All items are delivered through C-01 contributors registered in `vfx/FrameContributors.ts` and gated by `A3D_QR_VFX`
(sub-flags as noted). With every flag off, contributors are not invoked and the frame is bit-identical (C-01 invariant,
checked by IC-0 and the per-PR sentinel).

1. Opaque forward. Under the C-01 stub nothing changes except the fog uniforms written by `compiler/fog.ts`
   (`A3D_QR_VFX_FOG`). With C-02 real, the `prd07.fog` and `prd07.wetness` ShaderFeatures splice into generated programs.
2. After opaque. `ctx.sceneDepth` is consumed when `available`. The stub reports `false`, and PRD 07 does not blit depth
   itself unless R-01-1 exposes the forward target (§6.2.5).
3. Background (`prd07.sky`, `A3D_QR_VFX_SKY`). Sky or fogged solid colour, at the far plane, no depth write. Under the
   stub it is drawn before ForwardPass, after any environment background.
4. Volumetric (`prd07.volumetric`, `A3D_QR_VFX_VOLUMETRIC`, High/Ultra). Inject (N tile draws) → temporal (Ultra) →
   integrate → apply. It is skipped while `sceneDepth.available === false`.
5. Decals (`prd07.decals`, `A3D_QR_VFX_DECALS`). After opaque; after all transparents under the stub.
6. Transparents (`prd07.particles`). Particle batches, ribbons, beams and alpha mesh particles, returned as
   `TransparentQueueItem`s with `sortDepth`. Under the stub they draw after all forward transparents. With C-01 real they
   interleave with water and glass.
7. The GPU sim passes for the next frame run in `collect`, before shadows (state from frame N-1), so the draw never
   waits on the sim.
8. Post (PRD 03). The froxel apply registers as a C-13 pass when `A3D_QR_POST` is on. PRD 03 god rays may also run on
   Medium.
9. Safe-basic WebGL2 fallback (`compiler/safeBasic.ts`, PRD 15). Unchanged until R-15-2. PRD 07 exports
   `renderSafeBasicEffects(gl, nodes, camera)` from its lane barrel for PRD 15 to call. The Canvas2D path stays a
   labelled diagnostic and is never counted as rendering.

Note on `alpha` blend: atlases are premultiplied, so the particle pipeline implements `alpha` as premultiplied output,
with `rgb·a` precomputed on the CPU for untextured colours. The device `alpha` mode is used only by decals.

---

## 10. Migration plan

1. **Honesty first (P0, no visual change).**
   - The `effects` diagnostics section reports `EFFECT_ZERO_PIXELS` per node. Suppressing the blanket warning
     (`index.ts:13722-13723`) is R-15-1.
   - `gpuReady` is replaced in the owned `nodes/particles.ts`.
   - The scene-kit evidence strings are R-11-1.
   - The particle-lab claim (`apps/showcase-webgpu-particle-lab/src/main.ts:318`) and its README are R-14-1.
   - True API facts go to PRD 13 as C-40 rows `F-07-*` in CONTRACTS Appendix B (append-only), each `proposed` until
     its evidence column cites a passing run.
2. **Engine behind `A3D_QR_VFX`.** The alias is `createAuraApp({ renderer: { vfx: "v2" } })`. Sub-flags are `_SKY`, `_FOG`,
   `_VOLUMETRIC` and `_DECALS`, and `renderer.vfxOverrides` maps onto them. Flag state moves only at checkpoints, and
   PRD 15 records it in `contracts/flags.state.ts` (CONTRACTS §5.3):
   - `dev` → `standalone-accepted` when §17.1 passes in `prd07-vfx.yml`.
   - → `integrated-accepted` at a G-PANEL round that passes the §17.2 rows marked *promotion*.
   - → `default-on` after two clean checkpoints.
   - → `removed` by PRD 07's removal PR.
   PRD 07 never flips a default itself.
3. **Builders keep signatures.** `effects.particles/rain/snow/flipbook/beam`, `sky.dayNight`, `weather.*` and `decals.*`
   keep their call shape, and legacy fields are mapped (§11). With the flag on, routes that call them start drawing
   pixels without code edits. Turbo's `driftParticleCloud`, Pulse's particles and the `game.effects` users are measured
   this way in §17.1 with no route edit.
4. **Games migrate through PRD 14** (R21; PRD 14 is the only writer of `apps/showcase-*`). PRD 07 ships:
   - The codemod `vfx-pools-to-effects` (C-39 `registerCodemod`, `packages/aura3d-cli/src/commands/prd07/`). It reports
     route-local spark/burst pools (E25) and rewrites the simple ones to `app.effects.burst`.
   - Per-route replacement notes in `docs/project/aura3d-quality-rebuild/evidence/prd07/route-notes.md`:
     - Box-slab and band skies (E35, E32: Rooftop, Skyline, Patrol, Pulse) → `sky.preetham` / `sky.gradient`.
     - Turbo `driftParticleCloud` (`main.ts:2612-2640`) → lit `smoke-a` emitter with emission ∝ slip.
     - Turbo box skid ribbons (`main.ts:5025-5060`) → `orientation: "surface"` trails.
     - Deep Recovery `effects.volumetricFog` (`main.ts:280-285`) → `effects.fog({ mode: "absorption", … })` +
       `effects.volumetricFog` (froxel on High+) + a marine-snow procedural volume (3,000 High / 800 Low, PRD 14 §8.3).
     - Skyline act fogs (E43) work unchanged once fog is live; the snow level gets `weather.snow`.
     - Blockfall `clear-fx.ts` (48 box shards, `:15, 46-60`) → `explosion-small`/`spark` bursts + `ring`.
5. **Benchmarks.**
   - PRD 07's own scenes live in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd07/`.
     `prd07-particles-fountain` replicates base scene 14 (`shared/scenes.ts:280-288`: seed 1414, 2,000, additive) with
     the options honoured.
   - Base-scene adapter changes (`aura3d/common.ts:114-119, 232-242, 250-252`) are R-12-1, owned by PRD 12.
6. **Removal (PRD 07's flag-removal PR)** runs after the flag has been `default-on` for two checkpoints. It is gated by
   `rg "RootGpuParticleWorkload|prd07\.legacy|legacyPrimitiveNodes" packages apps templates examples`
   returning only allowlisted lines.

## 11. Backward compatibility

"Flag on" means `A3D_QR_VFX` (and the named sub-flag). With the flag off, every row behaves exactly as at `85aafcd0`.

| Surface | Old behaviour | New behaviour | Compatibility path | Visible change |
|---|---|---|---|---|
| `effects.particles({...})` legacy fields | zero pixels on production | renders | `materialMode` → preset (§6.3.1); `emitter: "fountain"|"swirl"|...` → shape+velocity preset; `radius/height` → shape size; `particleCount` → `maxParticles` (tier-clamped, reported); `emissionRate` → `rate`; `lifetimeColorRamp` → `colorOverLife`; `velocityOverLife` → `speedOverLife`; `turbulence/noise` → `noise.strength/frequency`; `texturedBillboard: false` → `sprite: "soft-dot"` untextured disc | Particles appear where games declared them (Turbo, Pulse, data-galaxy, particle-lab). Pulse emits only under `visualReviewCapture` (08 §2.2), so PRD 14 must decide whether to keep them in play |
| `effects.rain/snow` | zero pixels; `weather.precipitation` drew static boxes | falling procedural volume | same options; `particleCount` honoured within cap | rain/snow animate |
| `effects.flipbook/beam` | withheld | renders | `spriteColumns/spriteRows/frameRate` honoured; without `texture`, `fireball` sequence | flipbooks appear |
| `effects.fog` | exp2, `maxOpacity ≤ 0.525` default, static | height mode default; explicit `density` keeps exp2 with `maxOpacity = 1` | `legacyOpacityCap: true` for one minor | far geometry fogs fully; 17 games need density re-check (PRD 14) |
| `effects.volumetricFog` | CPU radial blur, 0.5 fps | analytic (Low/Med), froxel (High/Ultra, once C-01 depth is real); CPU pass removed by R-03-1 | same options; `color` now honoured | Deep Recovery becomes playable after R-03-1; look changes |
| `sky.dayNight` | primitives + background colour | adds one sky node + light; legacy primitives hidden via their runtime handles when `A3D_QR_VFX_SKY` is on | return shape preserved (+`sky`) | spheres disappear; real sky |
| `planSkyBackdrop` | bands | unchanged in this lane (file owned by PRD 10); deprecation is R-10-1 | – | none |
| `game.effects` / `gameFeel` | data only | auto-mounted, impact library (flag on) | `legacyPrimitiveNodes: true` restores primitive nodes for routes that did mount them (none known) | hit VFX appear in Courier, Neon, Skyline, Turbo |
| `decals.*` | max 32, one draw each | tier cap, batched, lit (`A3D_QR_VFX_DECALS`) | same API | decals look lit (normal/roughness) |
| `AuraRuntimeNodeRegistry` | read-only | `add/remove` provided by PRD 15 (C-37); PRD 07 only consumes | additive | none from this lane |
| safe-basic renderer | octahedrons, GL_LINES, 3-band backdrop | unchanged until R-15-2 (PRD 15 owns `compiler/safeBasic.ts`) | – | none from this lane |

## 12. Contracts consumed / provided

Catalog IDs are from CONTRACTS §2. The PRD-proposed aliases of the previous draft (C-07-IN-1…11, C-07-OUT-1…9) map
through CONTRACTS Appendix A, shown in the "Alias" column. PRD 07 builds every consumed contract against its PR 0 stub.
No row says "after PRD X".

### 12.1 Consumed (built against stubs)

| ID | Alias | Provider | What PRD 07 uses | PR 0 stub PRD 07 runs against (day 0) | What becomes possible when real |
|---|---|---|---|---|---|
| C-01 | C-07-IN-2, C-07-IN-3 | 01 | `registerFrameContributor` with phases `background`, `after-opaque`, `transparent`, `post-hdr`; `FrameContributorContext.sceneDepth`, `.camera.previousViewProjectionMatrix`, `.tier`, `.blackboard` | Seams at `Renderer.ts:555/622/650/664/680` (PR 0b-2). `sceneDepth = { texture: null, available: false }`. Contributor transparents draw after all forward transparents | soft particles, froxel, correct water/glass interleave (I2, I4) |
| C-02 | C-07-IN-4, C-07-OUT-7 (part) | 01 | `registerShaderChunk` (`a3d_prd07_fog`, `a3d_prd07_wetness`, particle chunks), `registerShaderFeature` (`prd07.fog`, `prd07.wetness`), `computeProgramKey`, `ChunkHarness` | registries real. `generateProgram` throws `PROGRAM_GENERATOR_PENDING`, so PRD 07 compiles its own programs and forward geometry stays on legacy fog uniforms | fog integral and wetness on forward geometry (I3) |
| C-03 | – | 04 | optional `MaterialLobe`s for PBR mesh-particle debris | registry real, no render effect | PBR debris (I4, optional) |
| C-04 | C-07-IN-1 | 01 | `RenderCommandState.blendMode` (`additive`, `premultiplied`, `multiply`, `alpha`) | device ignores it → `vfx/BlendFallback.ts` alpha-over emulation, `VFX_BLEND_FALLBACK` | true additive accumulation and multiply (I1) |
| C-05 | – | 01 | `probeHdrTargetFormat` (encode choice), `app.setOutputOverlay({ flash })` for `super-flash` | `setOutputOverlay` returns `dom-fallback` | in-shader flash; one tone map for sky/VFX |
| C-08 | – | 01 | `CameraLike`/`FrameCamera` near/far for depth linearize | `buffer: null`; legacy camera uniforms | UBO path |
| C-09 | C-07-IN-5, C-07-OUT-4 (consumer side) | 02 | chunk `a3d_prd02_sh9` (`a3dSampleIrradianceSH`), `environmentProbeFactorySlot.fromScene({ renderFace })` for sky capture, `registerEnvironmentSource` not used | SH stub = hemisphere pair; factory wraps legacy PMREM. PRD 07 skips capture (`SKY_CAPTURE_PENDING`) unless the slot reports real | sky → IBL (I5) |
| C-11 | C-07-IN-6 | 02 | chunk `a3d_prd02_shadow_lookup` (`a3dSunShadowAt`) in particle, froxel and decal programs | returns 1.0 | shadowed smoke, light shafts (I4) |
| C-13 | C-07-IN-8 (part) | 03 | `registerPostPass` for `prd07.volumetric-apply` (`before-taa`, `linear-hdr`, `gpuOnly`) | stored; listed as skipped (`post-graph-v2-pending`); apply runs in `after-opaque` instead | apply in post graph; god rays on Medium (I6) |
| C-14 | C-07-IN-8 | 03 | `RenderItem.writesReactive`, `VELOCITY_MRT.reactiveLocation` | inert; reactive output compiled out | TAA without particle smear (I7) |
| C-16 | – | 05 | `createAssetDecoderRegistry`, `selectKTX2TargetFormat` for atlas pages | wraps existing loaders; `selectKTX2TargetFormat` real | local decoders; PNG fallback otherwise |
| C-17 | C-07-OUT-3 (consumer side) | 05 | role `vfx-atlas` for admitted third-party sheets | reader accepts 1.1 | K9 kit sheets admitted |
| C-19 | C-07-IN-7 | 06 | `handle.socket(bone).worldMatrix()` for trails/emitters | node root matrix, `valid: false` | bone-socket trails (I9) |
| C-22 | – | 08 | `app.camera.shake.add`, `app.camera.punch.trigger` for `camera` layers | PR 0a stub rig | real camera feel |
| C-23 | – | 08 | `app.time.scale` for effect sim dt; `app.onRender` | `AuraTimeController` real (pure) | – |
| C-26 | C-07-IN-11 | 10 | `app.world.height().heightAt/occluderHeightAt`, `wind()` for rain/snow | `heightAt` → 0, wind 0 | splashes on terrain, rain occlusion |
| C-27 | C-07-IN-9 | 11 | `QUALITY_TIERS` (`particleBudget`, `softParticles`, `volumetricFog`, `froxelGrid`), `app.quality.onChange` | table ships real (data); `"auto"` → high desktop / medium coarse pointer | governor-driven tier changes |
| C-28 | C-07-IN-9 (part) | 11 | `FrameStats.scope("particles")`, `probe.floatColorBuffer`, `counters().readbacks` | FrameStats real, `gpuMs: null`; probe from debug info | GPU ms per tier |
| C-29 | – | 11 | `resourceRegistrySlot.register` for VBO rings, sim targets, atlas, froxel atlases; `onDeviceRestored` | records and calls `rebuild` in order | WebGPU backend for compute particles |
| C-30 | C-07-OUT-8 (part) | 12 | lane scene index `benchmarks/quality-rebuild/scenes/prd07/index.ts`; `SceneSpec` fields, ids `prd07-*` | registry wraps base scenes + lane index | checkpoint capture of PRD 07 scenes |
| C-31 | C-07-OUT-8 (part) | 12 | `registerDiagnosticsSection` keys `effects`, `atmosphere` | keys present, null | – |
| C-32, C-33 | – | 12 | judgement schema; capture harness `--flags`, `qr_flags` | PR 0a/0b | – |
| C-34 | – | 13 | `registerLookLintRule("look/fake-effect-names")` | host real in PR 0b | – |
| C-36 | C-07-IN-10, C-07-OUT-6 | 15 | `registerNodeHandler` (kind `sky`), `registerOptionCoverage`, `DIAGNOSTIC_ONLY_FIELDS` via `compiler/diagnosticOnly.prd07.ts` | compile stub wraps the legacy bridge and runs new-kind handlers | compiler-hosted sky |
| C-37 | C-07-OUT-5 | 15 | `app.nodes.add/remove`, `registerNodeHandleExtension("setFog")` | `add` = `setScene` remount, `RUNTIME_ADD_REMOUNT` | no-remount add/remove (I8) |
| C-38 | – | 15 | `registerAppExtension` members `effects`, `atmosphere`; options `renderer.vfx`, `renderer.vfxOverrides` (pre-declared) | registry real; stub factories registered by 15 | – |
| C-39 | – | 15 | `registerCliCommand("vfx validate-atlas")`, `registerCodemod("vfx-pools-to-effects")` | registry real | – |

### 12.2 Provided (stub must keep working)

| ID | Alias | Consumers | What PRD 07 provides (real, behind `A3D_QR_VFX`) | Stub that ships in PR 0a and must stay valid | PRD 07 obligations on the stub |
|---|---|---|---|---|---|
| C-20 | C-07-OUT-1, C-07-OUT-7, C-07-fx | 08, 09, 13, 14 | `particleRenderHookSlot.provide(device => new ParticleBatchPass(device))`; `registerAppExtension({ member: "effects" })` real factory (`agent-api/vfx/effects-api.ts`); `AuraEffectsDiagnostics` incl. `pixelBacked`; `PARTICLE_PROGRAM_DEFINES`; presets for every `AuraVfxKind` and every PRD 09 `GameFxKind` | `burst`/`spawn` create pooled primitive nodes through C-37 `add`; `particleRenderHookSlot.stub` throws `PARTICLE_PASS_PENDING`; `EFFECT_ZERO_PIXELS` reported for `effects.particles` nodes | PRD 07 does not modify the stub. Its impl suite `tests/unit/contracts/impl/prd07-C-20.test.ts` passes, and the custodian suite `tests/unit/contracts/C-20-effects.test.ts` + `tests/browser/contracts/C-20-burst.spec.ts` passes for both `stub` and `real`. Consumers (PRD 09 `particle-pass` backend, PRD 08 feel `vfx`) call only the C-20 surface, so the swap is a flag flip |
| C-21 | C-07-OUT-2, C-07-OUT-4 | 02, 10, 13, 14 | `skyBackgroundSlot.provide(device => new SkyBackgroundPass(device))`; `onSkyChanged`; chunks `a3d_prd07_fog` (`a3dApplyFog`, `a3dFogAmount`, `a3dHeightFogTau`) and `a3d_prd07_wetness`; `registerAppExtension({ member: "atmosphere" })`; `sky.preetham/gradient/hdri` builders; frozen fog defaults; `setFog` handle extension | `sky.preetham`/`gradient` lower to today's `sky.dayNight` with `capability-degraded`; `setFog` writes the legacy `environmentFog`; stub `a3dApplyFog` = linear fog from `u_fogColor/u_fogNear/u_fogFar`; `renderToCubeFace` clears to the horizon colour | same rule. PRD 10 and PRD 02 build biome rigs and capture against the stub; PRD 07 never changes the C-21 surface except by additive CCR-07-2 |
| C-40 rows | C-07-OUT-9 | 13 | Appendix B rows `F-07-01` (fog defaults, exists) … `F-07-n` (which builders draw on which tier, impact kinds, sky models, blend fallback limits) | none (document) | `proposed` until the evidence column cites a passing `prd07-vfx.yml` run id |
| AuraVfxAtlasManifest v1 | C-07-OUT-3 | 05, 13 | type in `agent-api/vfx/atlas.ts`; `aura3d vfx validate-atlas` (C-39) | none needed (PRD 07-owned type) | – |
| C-30 scenes / C-31 sections | C-07-OUT-8 | 12 | `prd07-*` scene specs + adapters; `effects` and `atmosphere` diagnostics sections | base registry | scene ids `prd07-<slug>`; each has a three r185 adapter or is `admittedAsReference: false` |

## 13. Parallel execution

### 13.1 Day-0 start conditions

PRD 07 starts on 2026-10-05 with only the PR 0a branch (CONTRACTS §3.9: contracts, stubs, pre-declared fields, lane
barrels, lane scene indices). It needs nothing from any other lane.
- **Day 0, no seam needed.** All new files under `vfx/`, `atmosphere/`, `production-runtime/effects/`, `agent-api/vfx/`,
  `tools/vfx-atlas-bake/`, `packages/engine/assets/vfx/`, the lane scenes, `prd07-vfx.yml`, and `tests/qr/prd07/`.
  Everything consumed in §12.1 is a PR 0a type or stub. CONTRACTS §3.9 lists C-02, C-04, C-08, C-20, C-21, C-22, C-23,
  C-26 and C-27 as needing no 0b seam. C-01 contributor registration compiles on day 0; it executes once 0b-2 lands.
- **Days 1-2 (PR 0b, which is not another lane).** 0b-1 carves `nodes/{effects,sky,weather,particles}.ts`,
  `compiler/fog.ts` and `vfx/gameEffects.ts` into PRD 07 ownership. 0b-2 installs the C-01 `Renderer.ts` seams. Until a
  carve-out merges, PRD 07 writes the replacement logic in its new module (for example `EffectNodeLowering.ts`,
  `LiveAtmosphere.ts`, `HeightFog.ts`) and wires it in once the carved file exists. If a carve-out is dropped from 0b
  (CONTRACTS §3.9 size rule), its edit becomes a request to PRD 15 and the logic stays in PRD 07's module.

### 13.2 Owned files and directories (exactly CONTRACTS §4.1 row 07 + the lane-NN row)

- `packages/rendering/src/{vfx,atmosphere,effects}/` (including `GPUParticleBackend.ts`, `ResidentGPUParticleRenderer.ts`).
- `packages/rendering/src/cinematic/` (default; except 03's `BloomPass`, `VignettePass`, `FilmGrainPass`, `DepthHazePass`
  and 15's `CinematicMaterialPresets.ts`).
- `packages/rendering/src/{DayNightSky,Weather,AtmosphereWetness,SpriteFlipbook,VolumetricFog}.ts`,
  `packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry.ts`.
- `packages/engine/src/agent-api/vfx/` (including the carved `gameEffects.ts`), `agent-api/Decals.ts`,
  `agent-api/compiler/{fog,effects,sky}.ts`, `agent-api/nodes/{effects,sky,weather,particles}.ts`,
  `production-runtime/effects/`, `production-runtime/RootGpuParticleWorkload.ts`.
- `packages/engine/assets/vfx/`; `tools/{vfx-atlas-bake,effects-vfx-visual-audit}/`; `.github/workflows/prd07-vfx.yml`.
- Lane-NN:
  - `docs/project/aura3d-quality-rebuild/PRD-07-*.md`, `…/evidence/prd07/`;
  - `packages/{rendering,engine,assets,animation}/src/lanes/prd07.ts`;
  - `agent-api/compiler/diagnosticOnly.prd07.ts`;
  - `packages/aura3d-cli/src/commands/prd07/`;
  - `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd07/`;
  - `.github/workflows/qr-prd07-*.yml`;
  - `tests/qr/prd07/`;
  - `tests/unit/contracts/impl/prd07-*`.
- New test files PRD 07 creates elsewhere under `tests/` (creator rule). PRD 07 puts all of them under `tests/qr/prd07/`
  to keep ownership obvious.

Files PRD 07 does **not** edit, despite the previous draft, and the route it uses instead:

| File (owner) | Previous draft task | Route now |
|---|---|---|
| `ShaderChunks.ts:472-514` (01, frozen) | rewrite fog chunk | own chunk `a3d_prd07_fog` via C-02; legacy uniforms driven from `compiler/fog.ts`; optional R-01-2 |
| `Renderer.ts` (01; 977-1330 → 03) | register passes, `RenderSource` fields, remove CPU branch | C-01 contributors; fields pre-declared by PR 0a; CPU branch via R-03-1 |
| `EnvironmentBackgroundPass.ts` (02) | cache geometry, share helper | own fullscreen triangle in `atmosphere/`; R-02-1 |
| `index.ts` (15) builders, registry, createAuraApp, bridge, warning, render-source build, safe-basic | direct edits | carved owned files (§5); C-37 registry; C-38 app extensions; R-15-1/2 |
| `index.ts:9681-9796` scene-kit budgets (11) | replace evidence strings | R-11-1 |
| `GameRuntime.ts` (08) | edit effects regions | carved `vfx/gameEffects.ts` (07) |
| `GameFeel.ts` (08) | add `app` option | adoption through `createGameEffects`; R-08-1 |
| `LayeredSceneComposition.ts` (10) | deprecate `planSkyBackdrop` | R-10-1 |
| `EnvironmentPlatform.ts` (02) | delete `createProceduralSkyDome` | R-02-3 |
| `benchmarks/quality-rebuild/aura3d/common.ts`, `three/common.ts` (12) | adapter changes | lane adapters in `prd07/` dirs; R-12-1 |
| `apps/showcase-*` (14) | particle-lab claim, migrations | R-14-1, codemod + route notes |
| `packages/aura3d-cli/skills/**` (13) | skill text | C-40 rows |
| `LICENSE-THIRD-PARTY` (05, generated) | Sky.js attribution | R-05-1 |
| `tests/unit/engine/game-feel.test.ts` (08) | update | new cases in `tests/qr/prd07/unit/game-effects-automount.test.ts` |
| `.github/workflows/browser-matrix.yml` (12) | add PRD 07 specs | `qr-prd07-browsers.yml` (lane-owned) |
| `tools/quality-gate` (12) | stub grep | step inside `prd07-vfx.yml` |

### 13.3 Feature flags

- `A3D_QR_VFX` (lane flag, owner 07), sub-flags `A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_VFX_VOLUMETRIC`,
  `A3D_QR_VFX_DECALS`. URL short name `vfx` (`?a3d-qr=vfx`); env `A3D_QR=vfx`.
- Aliases: `renderer.vfx: "v1" | "v2"` (`"v2"` ≡ `A3D_QR_VFX` on) and `renderer.vfxOverrides: { particles?: false;
  sky?: false; fog?: "legacy"; volumetric?: false; decals?: false }`, which turn sub-flags off.
- Flag off: the frame is bit-identical to `85aafcd0` (contributors not invoked; carved files behave verbatim; builders
  unchanged in output except the runtime-id registration of legacy sky/weather primitives, which IC-0 verifies as pixel-identical).
- All PRD 07 captures run with explicit flags: `--flags vfx` (standalone) and `--flags all` (checkpoints).

### 13.4 Stubs used (and how PRD 07 stays honest on them)

Every consumed slot in §12.1 runs its PR 0 stub until the provider's real implementation is provided and its flag is
on. PRD 07 never replaces another lane's stub with its own. Where a stub leaves a capability absent, PRD 07 records
it as a `capability-degraded` degradation, using these codes: `VFX_BLEND_FALLBACK`, `SOFT_DEPTH_PENDING`,
`VOLUMETRIC_DEPTH_PENDING`, `VOLUMETRIC_TEMPORAL_PENDING`, `SKY_CAPTURE_PENDING`, `WETNESS_PENDING`,
`FOG_LEGACY_APPROXIMATION`, `SOCKET_PENDING`, `RUNTIME_ADD_REMOUNT` (C-37's), `VFX_ATLAS_PNG_FALLBACK`. It never claims
the absent capability ran. The previous draft's local stub files (`vfx/BlendModes.ts`, `vfx/SceneDepthSource.ts`,
`vfx/PhaseHooks.ts`, `vfx/TierCaps.ts`, `atmosphere/IrradianceStub.ts`, `atmosphere/ShadowLookupStub.ts`) are
withdrawn. Those stubs now ship in PR 0 under `contracts/`, and PRD 07 keeps only `vfx/BlendFallback.ts`, an adapter
over the C-04 stub.

### 13.5 Integration checkpoints

Dates are from CONTRACTS §7.
- IC-0 is 2026-10-08, the flag-off identity run. PRD 07 must cause no diff.
- Weekly checkpoints start with IC-1 on 2026-10-15, then 10-22, 10-29, 11-05, and continue.
- G-PANEL rounds are IC-4, IC-8 and IC-12. Only those rounds can accept.

Each §17.2 row lists its *trigger*: the provider slot or request that must be real before the row is meaningful. A
row is first evaluated at the first weekly checkpoint after its trigger is met. It passes only at a G-PANEL round. A
failure becomes a `qr-ic-regression` issue against the attributed lane. It does not block PRD 07's merges or anyone
else's.

### 13.6 Requests to other lanes (non-blocking; `qr-request` + `to:prdNN`, CONTRACTS §6.5)

| ID | To | File | Exact change | Serves | Until it lands |
|---|---|---|---|---|---|
| R-01-1 | 01 | `packages/rendering/src/renderer/FrameGraph.ts` (C-01 stub seam) | publish the forward `RenderTarget` on the blackboard as `"prd01.forwardTarget"` in the stub. If it has a `depthTexture`, fill `ctx.sceneDepth = { texture, linearize, available: true }` | C-01 | soft particles and froxel stay off |
| R-01-2 | 01 | `ShaderChunks.ts:472-514` (legacy patch, §3.7) | optional: add `u_environmentFogMode == 4` = integrated height τ (formula §6.6) behind a uniform that only `compiler/fog.ts` sets | C-21 | legacy approximation (`FOG_LEGACY_APPROXIMATION`) |
| R-02-1 | 02 | `EnvironmentBackgroundPass.ts:44-46, 109-114` | cache the fullscreen triangle at construction (E29) | perf | per-frame geometry stays |
| R-02-2 | 02 | `compiler/environment.ts` | C-09 resolution sets `background.visible = false` when a visible `kind: "sky"` node exists | C-09/C-21 | sky overdraws the env background (one extra fullscreen draw) |
| R-02-3 | 02 | `EnvironmentPlatform.ts:395-415` | remove `createProceduralSkyDome` from root exports at PRD 07 flag removal; keep `createEnvironmentStage` | cleanup | exported, unused |
| R-03-1 | 03 | `agent-api/compiler/postprocess.ts` (from `index.ts:12806-12824`) | do not plan the CPU `volumetric-light` pass for `volumetric-fog` nodes when `A3D_QR_VFX_VOLUMETRIC` is on | Deep Recovery perf | CPU readback remains with the flag on (I6 pending) |
| R-03-2 | 03 | `cinematic/{BloomPass,FilmGrainPass,VignettePass,DepthHazePass}.ts` | delete when unreferenced (E42 descriptor-only) | cleanup | files remain |
| R-05-1 | 05 | `LICENSE-THIRD-PARTY` generator | add three.js r185 `examples/jsm/objects/Sky.js` (MIT) | license | attribution only in file headers |
| R-05-2 | 05 | `aura3d assets validate` | route `--type vfx-atlas` to the PRD 07 C-39 command | C-17 | use `aura3d vfx validate-atlas` |
| R-08-1 | 08 | `GameFeel.ts` | `create({ app?, autoMount? })` passthrough to `createGameEffects`; `@deprecated` on `nodes()` | C-20 | realm adoption only |
| R-10-1 | 10 | `LayeredSceneComposition.ts:503-543` | `@deprecated` `planSkyBackdrop` with a dev warning naming `sky.gradient` | C-21 | bands keep working silently |
| R-11-1 | 11 | `agent-api/devtools/sceneKitBudgets.ts` (from `index.ts:9681-9796`) | replace "textured billboard impostor"/`gpuReady` evidence strings at `:9683, 9756, 9795-9796` with `"declared particle layers; see diagnostics().effects"` | C-31 honesty | strings remain; `effects` section is authoritative |
| R-12-1 | 12 | `benchmarks/quality-rebuild/aura3d/common.ts:114-119, 232-242, 250-252` | when the capture flags include `vfx`, pass spec `seed`, `size`, `blending` → `blend`, `count` → `maxParticles` + prewarm burst; `background.kind: "sky"` → `sky.preetham`; fog `intensity` drop; keep the capability-log entries for flags `none` | base scenes 09/14/17/18 | lane replica `prd07-particles-fountain` carries standalone S1 |
| R-14-1 | 14 | `apps/showcase-webgpu-particle-lab/src/main.ts:318` + README | replace the claim with "Particles render through effects.particles when A3D_QR_VFX is on" | honesty | claim stays false with the flag off |
| R-15-1 | 15 | `agent-api/compiler/renderer.ts` (from `index.ts:13722-13723`) | omit the blanket "remain non-pixel-backed" warning when `A3D_QR_VFX` is on | §3 design rule | both messages appear |
| R-15-2 | 15 | `agent-api/compiler/safeBasic.ts` (from `index.ts:16000-16006, 16517-16600`) | when `A3D_QR_VFX` is on, call PRD 07's exported `renderSafeBasicEffects(gl, nodes, camera)` instead of the octahedron/`GL_LINES` models | fallback quality | fallback unchanged |
| R-15-4 | 15 | `packages/{engine,rendering}/src/index.ts`, `production-runtime/index.ts` | remove `RootGpuParticleWorkload`, PRD 07 `cinematic/*` re-exports at PRD 07 flag removal | cleanup | exports remain |
| CCR-07-1 | 15 (custodian) + 01 | `contracts/frameGraph.ts` | additive optional `FrameContributorContext.canvas?: HTMLCanvasElement \| OffscreenCanvas` | multi-app binding | first app only, `VFX_APP_BINDING_AMBIGUOUS` |
| CCR-07-2 | 15 + consumers 10, 02 | `contracts/atmosphere.ts` | concrete `AuraSkyClouds/Stars/Moon`, `AuraVolumetricFogSpec.noise`; `horizonGlowColor?` | API richness | fields typed `unknown` |
| CCR-07-3 | 15 + consumer 09 | `contracts/effects.ts` | optional `spawn` `normal`, extended `trail` fields, lit `AuraDecalOptions` fields | API richness | extra fields accepted untyped, ignored by the stub |

## 14. Implementation phases

Everything merges to main behind `A3D_QR_VFX` (CONTRACTS §6.1), with no lane waiting. P1, P3 and P4 have no
dependency on each other and start on day 0 in parallel. P2, P5 and P6 need only P1's batch pass, which is PRD 07's own
code. "Capture" means a remote GH Actions macos-14 run of `.github/workflows/prd07-vfx.yml` with `--flags vfx`, plus the
same run with `--flags none` for flag-off identity. No phase exits on unit tests alone. Exit criteria use only
standalone checks. Integrated rows (§17.2) never gate a phase.

| # | Phase | Start | Scope | Exit criteria (standalone) |
|---|---|---|---|---|
| 1 | Particle core + honesty | day 0 (new files); wiring after 0b-1/0b-2 | lane barrels; `effects` app extension; `ProductionEffectSystem`; instance layout, `ParticleBatchPass` (C-20 `provide`), sort, blend fallback, atlas v1 + baker (PNG first), flipbook; lowering of `particles`/`flipbook-sprite`/`rain`/`snow` (CPU); `effects`/`atmosphere` diagnostics sections with `EFFECT_ZERO_PIXELS`; `nodes/particles.ts` observed diagnostics; lane scene `prd07-particles-fountain` + `prd07-flipbook`; C-40 rows; `prd07-vfx.yml` | S1, S2 pass; flags-none capture of the 18 games and the 18 base scenes is identical to the IC-0 baseline (ΔE2000 p99 within the noise floor); `EFFECT_ZERO_PIXELS` reported on 14-particles with flags `none` and absent with `vfx` on `prd07-particles-fountain`; §18 Medium budget in `prd07-particles-stress` (CPU part) |
| 2 | Runtime VFX + juice | after P1 batch pass (own code) | `app.effects` real factory, presets for 14 kinds, `vfx/gameEffects.ts` auto-mount, ribbons/trails, beams, light cones, aurora ribbon, mesh particles, transient light pool, C-22/C-05 forwarding | S3 (impact library) and S11 pass; S14 (Neon Swarm juice, no route edit) passes; `tests/browser/contracts/C-20-burst.spec.ts` passes for `real` |
| 3 | Sky | day 0 | `SkyBackgroundPass` (preetham, gradient, stars, moon, clouds), C-21 `provide`, `prd07.sky` contributor, `sky.preetham/gradient/hdri` builders + `sky` node handler (C-36), `sky.dayNight` rewrite, Low sky-view, `onSkyChanged`, capture adapter (gated on C-09 real) | S4, S5 pass; `skyVariance` > 0 in every sky frame; flags-none identity holds for any scene using `sky.dayNight` |
| 4 | Fog | day 0 | `HeightFog` CPU mirror + `packLegacy`; `a3d_prd07_fog` chunk (C-02 register) incl. legacy-parity mode; live fog (`LiveAtmosphere.ts`, `setFog` C-37 extension, `app.atmosphere` real factory); carved `compiler/fog.ts` defaults + transitions under `A3D_QR_VFX_FOG`; fog volumes; absorption in PRD 07 programs; fog on background | S6, S7 pass; S13 (Skyline act fogs, no route edit) passes; fog-legacy-parity unit test green |
| 5 | GPU sim + weather + volumetric | after P1 | WebGL2 two-pass ping-pong sim; procedural volumes; splashes; lightning; `weather.*` rewrite; `a3d_prd07_wetness` chunk registered (C-02); froxel inject/integrate/apply on 2D atlases, gated on `sceneDepth.available` | S8, S9, S12 (stress incl. 50k GPU) pass; froxel unit tests green against a synthetic depth target (§15 P5-T6) |
| 6 | Decals + polish | after P1 | `DecalBatch` lit decals, tier caps, `orientation: "surface"` trails, optional half-res particle target; `vfx-pools-to-effects` codemod; route notes; S15 (Turbo drift dust, no route edit) | S10, S15 pass |
| 7 | Promotion + removal | after `default-on` × 2 checkpoints (CONTRACTS §5.4) | removal PR: §5 "Delete" list, legacy-sky/weather runtime nodes, `legacyPrimitiveNodes`; flag ignored (`QR_FLAG_REMOVED`) | grep gate (§10 item 6) clean; full 18-game + benchmark capture shows no regression beyond PRD 12 thresholds; `EFFECT_ZERO_PIXELS` 0 on all shipped routes with flags `all` |

## 15. Task checklist

Task IDs are stable (`P<phase>-T<n>`). Every task names an owned file, the behaviour and the test. Unit tests live in
`tests/qr/prd07/unit/` and run with vitest. Browser tests live in `tests/qr/prd07/browser/` and run with Playwright,
remotely on macos-14, using the lane config `tests/qr/prd07/playwright.prd07.config.ts`. Contract-impl tests live in
`tests/unit/contracts/impl/prd07-*`. Paths below are relative to `packages/rendering/src/` (rendering) or
`packages/engine/src/` (engine) unless written in full.

### Phase 1: particle core + honesty (day 0)

- [x] **P1-T1** Lane barrels.
  - Rendering `lanes/prd07.ts` calls `particleRenderHookSlot.provide(...)` and `skyBackgroundSlot.provide(...)`, and runs
    `registerFrameContributor` for `prd07.sky`, `prd07.particles`, `prd07.decals` and `prd07.volumetric` (each with
    `flag` = its sub-flag) plus `registerShaderChunk` for every PRD 07 chunk.
  - Engine `lanes/prd07.ts` calls `registerAppExtension` for `effects` and `atmosphere`,
    `registerDiagnosticsSection("effects"|"atmosphere")`, `registerNodeHandler(sky)`, `registerNodeHandleExtension(setFog)`,
    `registerLookLintRule("look/fake-effect-names")`, `registerCliCommand` and `registerCodemod`.
  - Test `tests/unit/contracts/impl/prd07-registration.test.ts`: every registration id is unique and
    `owner === "prd07"`. With `resolveQrFlags({ options: [] })`, `frameContributors(flags)` contains no `prd07.*` entry.
- [x] **P1-T2** `agent-api/vfx/diagnostics.ts` + `production-runtime/effects/EffectDiagnostics.ts`.
  - API: `trackDraw(nodeId, drawCalls, instances)` and `endFrame(visibleInFrustum: Set<string>)`.
  - Behaviour: `zeroPixelFrames` increments for visible, in-frustum effect nodes that drew 0. At 30 frames it pushes
    `{ code: "EFFECT_ZERO_PIXELS", nodeId }`, logging `console.error` once per node in dev builds. `pixelBacked` lists the
    kinds with `instancesDrawn > 0` this frame.
  - Test `tests/qr/prd07/unit/zero-pixel-diagnostic.test.ts` (MockRenderDevice):
    - flags `none` + `effects.particles()` → the error appears after 30 `app.step(1/60)`;
    - flags `vfx` → no error, and `pixelBacked` includes `"particles"`;
    - a fog node never reports.
- [x] **P1-T3** Carved `agent-api/nodes/particles.ts`. `collectParticleBudgetDiagnostics` returns the existing fields plus
  `{ declared, observedLive: null, observedDraws: null }`. The observed values are filled by the effects section; the
  function itself is static. `gpuReady` stays as a deprecated alias computed exactly as today, so the flag-off
  output is identical. Update `tests/unit/` snapshot expectations only by adding fields.
- [x] **P1-T4** `vfx/ParticleInstanceLayout.ts`. Constants (16 floats/particle, attribute offsets), a cached quad
  `Geometry`, and `ParticleInstanceRing` (3 `RenderBuffer`s via `device.createBuffer`; `write(data, live)` via
  `device.updateBuffer`; grows by power of two). Test `instance-layout.test.ts`: after warm-up, 1,000 writes create 0
  buffers (MockRenderDevice `bufferCreates`) and allocate no `Float32Array`.
- [x] **P1-T5** `vfx/ParticleBatch.ts` + `vfx/ParticleBatchPass.ts`. Implements C-20 `ParticleRenderHook`. Batch keying
  follows §6.2.2. `transparentItems(ctx)` emits one `TransparentQueueItem` per batch, with `sortDepth` = bounds-centre
  view depth. Draws use `instanceAttributes` (divisor 1). Test `batch-keying.test.ts` (Mock):
  - two additive emitters with the same atlas → 1 draw;
  - additive + premultiplied → 2 draws;
  - two premultiplied emitters 20 m apart → 2 items in back-to-front order.
- [x] **P1-T6** `vfx/BlendFallback.ts`. `resolveVfxBlend(desc, flags, deviceHonoursBlendMode)` returns `{ renderState,
  shaderDefines, degraded }`. With the C-04 stub: alpha-over with the `UNPREMULTIPLY_OUTPUT` define; additive →
  premultiplied variant ×1.6 core; multiply → skipped. With C-04 real: `blendMode` is set directly. Test: the table of
  4 modes × {stub, real} → expected state and defines, and `VFX_BLEND_FALLBACK` is emitted once per key.
- [x] **P1-T7** `vfx/ParticleSort.ts`. LSD radix sort on 16-bit depth keys into a `Uint32Array` permutation. It is
  skipped when the camera moved < 1 cm and rotated < 0.5° and no particle changed. Test `particle-sort.test.ts`: order
  matches `Array.prototype.sort` for 10,000 random particles, with 0 allocations after warm-up.
- [x] **P1-T8** `effects/ParticleSystem.ts`. `writeInstances(out: Float32Array, camera): number` writes the §6.2.1 layout
  directly, evaluating sizes, colours and frames over life. `buildBatch` is kept untouched. Test: `seed` 1414 with 2,000
  particles produces byte-identical buffers across two runs.
- [x] **P1-T9** `vfx/shaders/particle.glsl.ts`. Shader per §8.1, registered as C-02 chunks. It encodes output per
  §6.2.7 (HDR target vs legacy `outputColorSpace`). Tests:
  - unit, `ChunkHarness` text: every chunk wraps;
  - browser, `particle-shader-compile.spec.ts`: all define combinations compile on WebGL2.
- [x] **P1-T10** `vfx/SceneDepthAdapter.ts`. `resolveSceneDepth(ctx)` returns `ctx.sceneDepth` when available. Otherwise it
  returns the R-01-1 blackboard target copy, or `{ available: false }` with `SOFT_DEPTH_PENDING`. The soft and near
  fade math is checked in `soft-depth.spec.ts` (browser): a PRD 07-created depth `RenderTarget` (`depth: "texture"`)
  holds a plane at 2 m, a particle at 1.9 m has `alpha × 0.2857` (±1/255), and particle depth beyond 2 m gives alpha 0.
- [x] **P1-T11** `vfx/VfxAtlas.ts`. Loads `manifest.json` and pages through C-16 `createAssetDecoderRegistry` (KTX2). On
  `AssetDecoderUnavailable` it falls back to PNG with `VFX_ATLAS_PNG_FALLBACK`. `sequence(name)` returns the sequence. The
  page is chosen by C-27 tier (1k Low/Medium, 2k High/Ultra). Test: every `AuraVfxBuiltinSequence` resolves, rects lie
  inside the page, and the gutter is ≥ 1 px per cell at mip 0.
- [x] **P1-T12** `tools/vfx-atlas-bake/`.
  - `bake.mjs --seed 7 --size 2048` writes `packages/engine/assets/vfx/*` (PNG always; KTX2 when `toktx`/basis encoder is
    present on the runner, else only PNG with a logged skip).
  - Test `tests/qr/prd07/unit/vfx-atlas-bake.test.ts` at 256 px: two runs give an identical sha256.
  - The full-size bake runs in `prd07-vfx.yml` and its outputs are committed.
  - `aura3d vfx validate-atlas` (`packages/aura3d-cli/src/commands/prd07/validate-atlas.ts`) checks that pages are
    premultiplied, the gutter is ≥ 1 px and pages are power-of-two.
- [x] **P1-T13** `production-runtime/effects/EffectNodeLowering.ts`.
  - `lowerEffectNode(node, ctx): LoweredEffect | null` handles `particles`, `flipbook-sprite`, `rain` and `snow` (CPU
    source in P1), applying the §11 legacy-field mapping.
  - Test `legacy-particle-mapping.test.ts`: each legacy field changes the lowered emitter options.
  - `compiler/effects.ts` registers matching C-36 option-coverage rows and removes them from
    `diagnosticOnly.prd07.ts`.
- [x] **P1-T14** `production-runtime/effects/ProductionEffectSystem.ts` + `vfx/EffectSystemRegistry.ts` +
  `agent-api/vfx/effects-api.ts`.
  - The C-38 `effects` factory creates one system per app. On `onFrame` it reads `app.scene` effect nodes and handle
    visibility, steps the fixed step on `app.time.scale`, and writes batches.
  - The registry binds system ↔ `ctx.device` per §6.3.1.
  - The real factory is used only when `A3D_QR_VFX` is on; otherwise the PR 0a stub factory is used.
  - Test `effect-system-binding.test.ts`: single app → bound on the first contributor call; two apps →
    `VFX_APP_BINDING_AMBIGUOUS`.
- [x] **P1-T15** Lane scenes, each with both adapters (Aura and three r185):
  - `benchmarks/quality-rebuild/scenes/prd07/index.ts` with `prd07-particles-fountain` (copy of `shared/scenes.ts:280-288`
    plus `blend: "additive"`, `size`), `prd07-flipbook` and `prd07-particles-stress`;
  - `aura3d/scenes/prd07/*.ts` and `three/scenes/prd07/*.ts`.
  Test: the C-30 conformance suite passes with the lane entries (unique ids, owner prefix, both adapters).
- [x] **P1-T16** `.github/workflows/prd07-vfx.yml`.
  - `runs-on: macos-14`. Triggers: PRs touching §13.2 paths, plus `workflow_dispatch`.
  - Jobs:
    - `unit`: `pnpm exec vitest run tests/qr/prd07/unit tests/unit/contracts`;
    - `browser`: Playwright Chromium with the lane config;
    - `capture`: `node benchmarks/quality-rebuild/capture.mjs --scenes 14-particles,09-outdoor-environment,17-large-environment,18-game-scene,prd07-* --flags vfx`
      and the same with `--flags none`;
    - `games`: `node tools/quality-rebuild-capture/capture-games.mjs --games showcase-turbo-drift-circuit,showcase-skyline-runner,showcase-neon-swarm,showcase-deep-recovery,showcase-blockfall-reactor --flags vfx`
      and the same with `--flags none`.
  - Each job uploads artefacts to `evidence/prd07/<run-id>/` and prints the remaining `capability-degraded` codes as an
    informational step.
- [x] **P1-T17** C-40 rows. Append `F-07-02…` to CONTRACTS Appendix B: builders that draw per tier, the blend fallback
  limits, and the impact kinds. Each row starts `proposed` and cites the run id once green. Appending rows is the one
  permitted shared edit (§6.4).
- [x] **P1-T18** `agent-api/vfx/lookLint.ts`. Rule `look/fake-effect-names` flags scene nodes named like VFX (`/spark|smoke|
  fire|rain|snow|explosion|trail|fog|sky/i`) whose kind is `primitive`, and effect nodes not in
  `capabilities.effectsPixelBacked`. Test: fixture scenes with 3 hits and 0 false positives on `prd07-*` scenes.
- [x] **P1-T19** Browser test `particles-production.spec.ts` (remote macos-14, flags `vfx`). `effects.particles({ seed: 1414,
  maxParticles: 2000, blend: "additive", color: "#ff9a3c", size: 0.06 })` on production gives:
  - ≥ 1.5% of pixels with `R - B > 15` in the fountain region;
  - `diagnostics().effects.nodes[0].drawCalls ≥ 1`;
  - `errors.length === 0`;
  - `counters().readbacks === 0` (C-28).

### Phase 2: runtime VFX, juice, trails, beams, mesh particles

- [x] **P2-T1** `agent-api/vfx/effects-api.ts`. Implements the C-20 `AuraAppEffects`: pooled `EffectInstance`s per spec,
  `liveCount`, `clear()`, `registerPreset`. `camera` layers call C-22 and `super-flash` calls C-05 `setOutputOverlay`.
  Tests:
  - `effects-api.test.ts`: 1,000 `burst("spark")` calls over 10 s keep the pool ≤ the tier cap and live particles ≤
    C-27 `particleBudget`;
  - impl suite `prd07-C-20.test.ts`.
- [x] **P2-T2** `agent-api/vfx/presets.ts`. The 14 kinds of §6.4 as data. Test `presets.test.ts`: every `AuraVfxKind` and
  every PRD 09 `GameFxKind` (imported from `contracts/game.ts`, C-24) resolves to a preset with ≥ 1 emitter layer.
- [x] **P2-T3** Carved `agent-api/vfx/gameEffects.ts`.
  - `createGameEffects({ poolSize?, app?, autoMount?, legacyPrimitiveNodes? })`. With the flag on and the controller
    bound, spawns forward to `app.effects.spawn` using the §7.8 mapping. The realm pending list is adopted by the
    `effects` extension. `GAME_EFFECTS_UNBOUND` is raised when 0 or ≥ 2 apps are live. `effectToSceneNode` is used only
    for flag off or `legacyPrimitiveNodes`.
  - Tests `tests/qr/prd07/unit/game-effects-automount.test.ts`:
    - flag off → `nodes()` output is deep-equal to the `85aafcd0` fixture;
    - flag on, no `nodes()` call → `diagnostics().effects.liveParticles > 0` after `hitSpark`;
    - `gameFeel.create()` controllers are adopted.
- [x] **P2-T4** `vfx/RibbonBatch.ts` + `vfx/RibbonPass.ts` + `vfx/shaders/ribbon.glsl.ts`. Point rings, camera/surface
  orientation, width and alpha curves. The default alpha curve is ported from `ResidentGPUParticleRenderer.ts:512`
  (`0.45·(1 - segment/depth)`). Test: a 48-point trail draws 94 triangles, and `surface` orientation normals equal the
  given surface normal.
- [x] **P2-T5** Carved `agent-api/nodes/effects.ts`.
  - Rewire `beam` (today `index.ts:3671-3689`).
  - Add `trail`, `lightCone`, `auroraRibbon` (geometry/fragment per PRD 14 §8.2), `meshParticles`, `fogVolume`.
  - The builders' output is identical whether the flag is on or off. Lowering in `EffectNodeLowering.ts` decides.
  - Test: option-coverage rows for every new field.
- [x] **P2-T6** `vfx/MeshParticleBatch.ts` + `vfx/shaders/mesh-particle.glsl.ts`. CPU sim (gravity, drag, spin, ground
  bounce, sleep) and an instanced draw through `instanceAttributes`. It never calls `createProductionInstanceTransforms`.
  Test: per-instance scale is honoured (regression guard for E17, `index.ts:14747-14754`).
- [x] **P2-T7** `production-runtime/effects/TransientLightPool.ts`. Lights are pre-allocated per tier (Low 0, Medium 2,
  High 4, Ultra 8). They are submitted as `CollectedLight`s through the C-01 `collect` phase (`prd07.lights`), with
  intensity 0 when idle. Test: 10 simultaneous explosions use ≤ the cap, and the oldest is recycled.
- [x] **P2-T8** Browser test `juice-automount.spec.ts`. A Neon-style scene calls `game.effects()` with no `nodes()` call.
  `hitSpark` at a known position must change ≥ 0.15% of the canvas pixels in a 64×64 region within frames N+1..N+3
  (flags `vfx`), and change 0 pixels with flags `none`.
- [x] **P2-T9** Lane scenes `prd07-impact-library` (§17.1 S3 contact sheet; Aura only, `admittedAsReference: false`) and
  `prd07-trails-beams` (S11).

### Phase 3: sky (day 0)

- [ ] **P3-T1** `atmosphere/PreethamSky.ts` + `atmosphere/shaders/sky.glsl.ts`. Port per §8.5, with the MIT header. Unit
  `preetham-cpu-reference.test.ts`: `PreethamSky.evaluate(dir)` at 16 directions matches a hand-computed r185 reference
  table within 1e-4. Browser: a GPU render of the same 16 directions into an `rgba16f` target, read back in the test only,
  matches within 2%.
- [ ] **P3-T2** `atmosphere/GradientSky.ts`, `StarField.ts`, `CloudLayer.ts` (r185 cloud block), and the moon disc with
  phase. Unit tests: the gradient is monotonic between stops, star count is ∝ density, and stars fade to 0 at sun
  elevation > 6°.
- [ ] **P3-T3** `atmosphere/SkyBackgroundPass.ts`. Implements C-21 `SkyBackgroundPassLike` and the `prd07.sky` contributor
  `passes(ctx)`. The fullscreen triangle is cached at construction. Evaluation is per pixel on Medium+, and on Low uses a
  256×128 sky-view re-rendered only on spec change. `renderToCubeFace` and `horizonRadiance(8)` are implemented. Impl test
  `prd07-C-21.test.ts`. Browser test `sky-background.spec.ts`:
  - sky-region luma std > 6;
  - the horizon is brighter than the zenith at noon;
  - sun disc luminance > 10 in an `rgba16f` debug target.
- [ ] **P3-T4** Carved `agent-api/nodes/sky.ts`. Add `sky.preetham`, `sky.gradient` and `sky.hdri` (`AuraSkyNode`). Rewrite
  `sky.dayNight` per §6.5 (legacy primitives registered as `prd07.legacySky.<n>` runtime nodes, plus the `sky` node and
  key light). Tests:
  - flag off → pixels identical to `85aafcd0` (`tests/qr/prd07/browser/sky-daynight-identity.spec.ts`);
  - flag on → the frame's draw list contains no legacy sky primitive (`diagnostics().atmosphere.background ===
    "sky-preetham"`).
- [x] **P3-T5** `agent-api/compiler/sky.ts`. C-36 `NodeHandler<{ kind: "sky" }>` that validates the `AuraSkySpec` union,
  records `feature("vfx.sky")` and degrades invalid specs with `option-ignored`. Test: under `A3D_QR_STRICT` a sky node
  raises no `unknown-node-kind`.
- [ ] **P3-T6** `atmosphere/SkyCaptureAdapter.ts`. When a visible sky node exists and no explicit environment does, and
  `environmentProbeFactorySlot.provided && flags.on("A3D_QR_LIGHTING")`, it calls `fromScene({ renderFace:
  sky.renderToCubeFace, resolution: 128 })` and re-captures on `onSkyChanged`. Otherwise it reports `SKY_CAPTURE_PENDING`.
  Test (Mock): the stub path makes no capture call; the "real" path (a test double provided in-test) makes 6 face calls.
- [ ] **P3-T7** Lane scenes `prd07-sky-timeofday` and `prd07-outdoor-sky`, with three r185 adapters (`Sky.js` with
  matching parameters; `FogExp2` tuned to equal fog at 50 m).

### Phase 4: fog (day 0)

- [ ] **P4-T1** `atmosphere/HeightFog.ts`. CPU mirrors `heightFogTau`, `fogAmount`, `legacyEnvironmentFogFactor` (a
  verbatim JS port of `ShaderChunks.ts:475-491`), `packLegacy(spec, camera)` and `packV2(spec)`. Tests:
  - `fog-height-integral.test.ts`: `heightFogTau` vs a 1,000-step numeric ray-march within 1% for 50 random rays,
    including `v.y ≈ 0` and `b = 0`;
  - `fog-legacy-parity.test.ts`: the GLSL legacy-parity mode CPU mirror equals `legacyEnvironmentFogFactor` within 1e-6
    on 1,000 points.
- [ ] **P4-T2** `atmosphere/shaders/fog.glsl.ts` + `atmosphere/chunks.ts`. Register chunk `a3d_prd07_fog` (C-21 names) and
  `ShaderFeature` `prd07.fog` (hook `fragment:fog`; the `select` returns `"height"`/`"volumetric"` only when
  `A3D_QR_VFX_FOG` is on). Browser test `C-21` chunk compile in ChunkHarness.
- [ ] **P4-T3** `production-runtime/effects/LiveAtmosphere.ts` + `agent-api/vfx/atmosphere-api.ts`.
  - `WeakMap<AuraEffectNode, LiveFogState>` updated on `onFrame` from handle visibility.
  - `setFog` handle extension (C-37).
  - `app.atmosphere.setFog/setSky/setWetness/state`, with transitions (density linear, colour linear RGB).
  - Test: Skyline-style scene with five fog nodes toggled via `setVisible`; the resolved density equals the visible
    act's density on the next frame. With `transitionSeconds: 1`, the midpoint value at 0.5 s is within 2%.
- [ ] **P4-T4** Carved `agent-api/compiler/fog.ts` (`createProductionRuntimeEnvironmentFog`).
  - Flag off: body byte-identical.
  - With `A3D_QR_VFX_FOG`:
    - read `LiveAtmosphere` for the active node;
    - apply the C-21 frozen defaults at resolve time;
    - drop the `near 1/far 60` hard-codes and the 0.525 cap (unless `legacyOpacityCap`);
    - map height mode to legacy uniforms via `packLegacy`;
    - set `color: "sky"` from `SkyBackgroundPass.horizonRadiance`.
  - Tests:
    - flag-off return is deep-equal to the `85aafcd0` fixture for the 18 base scene snapshots;
    - default fog at 10/50/100 m, horizontal from 1.6 m, is within ±1.5% of 7/37/62% (CPU mirror of the shipped uniforms);
    - a legacy `density`-only call keeps exp2 with `maxOpacity` 1.
- [ ] **P4-T5** `atmosphere/FogVolumes.ts`. Ray/box and ray/ellipsoid segment length, used by `effects.fogVolume` in
  PRD 07 programs. On forward geometry it applies only on the generator path (I3). Test: matches a numeric march within
  1%.
- [ ] **P4-T6** Absorption mode in `a3d_prd07_fog`. Test: `T = exp(-σ·d)` per channel at 10 m for σ = (0.42, 0.11, 0.07),
  within 1e-5.
- [ ] **P4-T7** Background fog. `prd07.sky` calls `a3dApplyFog` at `backgroundDistance` when `affectsBackground`. A
  solid-colour background with fog draws as a fogged fullscreen colour pass. Browser test `fog-background-match.spec.ts`:
  a fogged horizon pixel and a fogged far-plane geometry pixel differ by ≤ 3/255 (flags `vfx`, legacy forward path).
- [ ] **P4-T8** Lane scenes `prd07-fog-height`, `prd07-fog-transition` and `prd07-underwater` (absorption in PRD 07
  programs, plus geometry on the legacy approximation), each with a three r185 adapter or `admittedAsReference: false`.

### Phase 5: GPU sim, weather, volumetric

- [ ] **P5-T1** `vfx/ParticleGpuSim.ts` + `vfx/shaders/gpu-sim.glsl.ts` (§8.3). Two single-target `rgba32f` ping-pong
  passes, ring emission, curl noise, and plane/heightfield collision. The capability check uses C-28
  `probe.floatColorBuffer`, else CPU fallback with `PARTICLE_GPU_UNAVAILABLE`. Resources are registered with C-29
  `resourceRegistrySlot`. Browser test `gpu-sim-parity.spec.ts`: 50,000 particles under gravity only match the CPU
  integrator within 1 mm after 60 steps (readback in the test only).
- [ ] **P5-T2** `vfx/ProceduralVolumeEmitter.ts` + the §8.2 chunk, covering rain, snow, marine snow and dust motes. Test:
  positions stay within the camera volume for 10,000 ids across 100 m of camera moves.
- [ ] **P5-T3** `production-runtime/effects/WeatherVolume.ts`. `weather.rain/snow/lightning`. The splash CPU emitter uses
  `groundHeightAt`, defaulting to C-26 `app.world.height().heightAt`. Test: rain particle y decreases between frames, and
  splash y equals the height query value (stub 0).
- [ ] **P5-T4** Carved `agent-api/nodes/weather.ts`. `weather.precipitation` (today `index.ts:3772-3806`) and
  `weather.wetGround` (`:3807-3843`) add their effect/wetness nodes and register the legacy boxes as
  `prd07.legacyWeather.<n>`, hidden when the flag is on. Tests: flag-off pixel identity, and with the flag on no
  visible `primitive` node from these builders.
- [ ] **P5-T5** `atmosphere/shaders/wetness.glsl.ts` + `atmosphere/chunks.ts`. Chunk `a3d_prd07_wetness` and
  `ShaderFeature` `prd07.wetness` (`fragment:material`), with uniforms driven by `AtmosphereWetness.ts`. With the C-02
  generator still a stub, the effect system reports `WETNESS_PENDING`, and PRD 07 decal/puddle programs include the chunk
  directly. Test: ChunkHarness compile, plus a CPU mirror of albedo/roughness at wet = 0, 0.5 and 1.
- [ ] **P5-T6** `atmosphere/VolumetricFogPass.ts` + `atmosphere/shaders/volumetric-{inject,integrate,apply}.glsl.ts`
  (§8.7). Uses 2D tiled atlases, the C-27 `froxelGrid`, temporal on Ultra (needs `previousViewProjectionMatrix`), and the
  alpha-over apply. It runs only when `resolveSceneDepth(ctx).available`. Browser test `froxel-transmittance.spec.ts` uses
  a PRD 07-created depth target, not the frame: homogeneous σ = 0.05 with no light gives transmittance at 20 m of
  `exp(-1)` within 3%. A second case checks that the grid falls back to 240×135×96 with `VOLUMETRIC_GRID_REDUCED` when
  allocation fails (forced).
- [ ] **P5-T7** `VolumetricFog.ts:105-144`. Resolves `effects.volumetricFog` to `analytic` or `froxel` by C-27 tier and
  honours `color`. Test: the tier table maps as in §6.7. `color` changes the packed uniforms.
- [ ] **P5-T8** Lane scenes `prd07-rain-night`, `prd07-snow`, `prd07-volumetric-shafts`, `prd07-lit-smoke`,
  `prd07-soft-particles` and `prd07-water-interleave`, with three r185 adapters per §17. The last two exist for I2.

### Phase 6: decals and polish

- [ ] **P6-T1** `vfx/DecalBatch.ts` + `vfx/shaders/decal.glsl.ts`. Ring-allocated merged geometry per page × blend, lit per
  §8.8, tier cap, life/fade. In `agent-api/Decals.ts`, when `A3D_QR_VFX_DECALS` is on, decals route to `DecalBatch` and
  `AURA_DECAL_MAX_DECALS` is replaced by the tier cap. Test (Mock): 100 decals on one page → 1 draw, and cap eviction is
  oldest-first. Flag off: the draw list is identical to today's.
- [ ] **P6-T2** Decal page in the atlas baker (scorch, crack, tyre-track, puddle, with normal/roughness).
- [ ] **P6-T3** `orientation: "surface"` trails drawn by `prd07.decals` with polygon offset. Test: no depth-fighting on a
  plane at 50 m (browser; max abs diff between two consecutive frames ≤ 1/255 in the mark region).
- [ ] **P6-T4** Optional half-resolution particle target for batches flagged `lowRes`, with a bilateral depth-aware
  upsample when depth is available, else a plain bilinear upsample. Enabled when measured particle GPU ms exceeds the
  tier budget. Off by default.
- [ ] **P6-T5** Codemod `vfx-pools-to-effects` (`packages/aura3d-cli/src/commands/prd07/codemods.ts`, C-39). It reports
  the E25 pool patterns and rewrites the `primitives.box/sphere` + `.runtime` + `setScale(life)` pattern into
  `app.effects.burst`. Test: pure-function fixture from `apps/showcase-blockfall-reactor/src/clear-fx.ts`, copied as a
  fixture, never edited in place.
- [ ] **P6-T6** Route notes `docs/project/aura3d-quality-rebuild/evidence/prd07/route-notes.md` for PRD 14, one section per
  game, with anchors.
- [ ] **P6-T7** Lane scene `prd07-decals` (three r185 `DecalGeometry` adapter).

### Phase 7: promotion and removal

- [ ] **P7-T1** Request the flag state changes at checkpoints. PRD 15 records them in `contracts/flags.state.ts`, with
  this lane's evidence links.
- [ ] **P7-T2** Removal PR: the §5 "Delete" list; `legacyPrimitiveNodes`; the `prd07.legacy*` runtime nodes in the sky
  and weather builders; `renderer.vfx` accepted as a no-op with `QR_FLAG_REMOVED`. Re-file R-02-3, R-03-2 and R-15-4
  for the owners' removals.
- [ ] **P7-T3** Grep gate (§10 item 6) as a failing step in `prd07-vfx.yml`.
- [ ] **P7-T4** C-40 rows flipped to `verified` with run ids. PRD 13 writes the skill text from them.

## 16. Test requirements

All browser and GPU work runs remotely on GitHub Actions `macos-14` (ANGLE Metal), per policy. Nothing runs a local
browser or local Docker.

- **Unit (vitest, Node + `MockRenderDevice`).** The files named in §15 live under `tests/qr/prd07/unit/`. Contract-impl
  suites are `tests/unit/contracts/impl/prd07-C-20.test.ts`, `prd07-C-21.test.ts` and `prd07-registration.test.ts`.
  These run inside `pnpm test:unit` and therefore in `qr-contracts.yml`. Narrow run:
  `pnpm exec vitest run tests/qr/prd07/unit tests/unit/contracts`.
- **Contract conformance (custodian-owned suites, both `stub` and `real`).** `tests/unit/contracts/C-20-effects.test.ts`,
  `C-21-atmosphere.test.ts`, `tests/browser/contracts/C-20-burst.spec.ts` and `C-21-sky.spec.ts`. PRD 07's provider PR
  must keep them green (CONTRACTS §6.3).
- **Flag-off identity.** Every PRD 07 PR touching `packages/rendering/**` or `packages/engine/**` passes the CONTRACTS §6.1
  sentinel check (6 sentinel scenes, `qr_flags=none`, IC-0 tolerance). `prd07-vfx.yml` additionally captures the 5
  listed games with `--flags none` and compares them with the IC-0 baseline.
- **Option sensitivity.** Every new builder field is registered through C-36 `registerOptionCoverage` from
  `compiler/effects.ts`, or listed in `diagnosticOnly.prd07.ts` until wired. The arch gate `option-coverage` (PRD 15)
  enforces this.
- **Browser (Playwright, `tests/qr/prd07/browser/*.spec.ts`, remote macos-14).** Covers the shader compile matrix,
  particles production, juice auto-mount, sky background, sky.dayNight identity, fog background match, GPU-sim parity,
  froxel transmittance, soft depth math, decal batching draw counts (`diagnostics()`), and context-loss restore of
  particle buffers, sim targets and atlases through C-29 (`WEBGL_lose_context` round-trip; pixels restored).
- **Capture (remote).** `prd07-vfx.yml` jobs `capture` and `games` (§15 P1-T16) upload frames, `report.json` (including
  `diagnostics().effects`, `.atmosphere` and `qrFlags`) and the vision-judge records (C-32 schema). Checkpoint captures
  are PRD 12's runs and include the lane scenes automatically through the C-30 registry.
- **Determinism.** Every capture scene uses `seed` and fixed `app.step` clocks. Two runs on the same sha produce frames
  with SSIM ≥ 0.995 for CPU particle scenes. GPU-sim scenes are judged, not pixel-diffed.
- **Performance.** C-28 FrameStats `particles` scope, rAF p50/p95 and `counters().readbacks` (which must be 0 in every
  PRD 07 pass) are recorded per scene. The §18 budgets are asserted on the runner as relative checks, because the runner
  is a paravirtual GPU. Absolute tier budgets are validated by PRD 11's device lab at checkpoints.

## 17. Visual acceptance tests

**Judging protocol (both tables).**
- Frames are captured remotely (§16) at 1920×1080, DPR 1, plus 8-frame filmstrips (`app.step(0.1)` between frames) for
  anything animated.
- Two independent vision-model judges score each frame with the research 21/23 rubric (0–10, categories `vfx`,
  `particles`, `atmospheric_effects`, `overall`; C-32 schema). If they differ by > 1 point, a third judge breaks the tie.
- A human reviewer (program owner or delegate) signs off every criterion marked **H**.
- Thresholds are minimums. "three r185" means the same scene built in `benchmarks/quality-rebuild/three/scenes/prd07/`
  (or the base three adapter) with stock three.js r185 (examples/jsm allowed), judged in the same batch.
- Engineering metrics (SSIM, detectors, draw counts) are supporting evidence only and never pass a criterion on their own.
- No row in either table is a claim of three.js parity. A parity claim needs a G-PANEL round (CONTRACTS §7 honesty rule).

### 17.1 Standalone acceptance (passable by PRD 07 alone, on PR 0 stubs; gates PRD 07 merges and `standalone-accepted`)

Standalone rows are engineering evidence only; passing them supports no claim of three.js-level visual quality (only a
G-PANEL integrated round can, CONTRACTS §7).
Every standalone capture runs with `--flags vfx` and every other lane flag off. Because of the C-04 stub, additive
blending is the documented fallback. Because of the C-01 stub, there are no soft particles or froxels, and particles
draw after all transparents.

| # | Scene / game | Reference | Judged criterion | Threshold |
|---|---|---|---|---|
| S1 | `prd07-particles-fountain` (replica of base 14: seed 1414, 2,000, additive request) | three r185 replica (base 14 scored three 4/10, research 23) | the fountain exists, sprites are textured and round, density reads as ~2,000 particles | Aura `particles` ≥ 5 (absolute); three score reported, not required; PRD 12 `subjectPresence` ≥ 0.8; **H** |
| S2 | `prd07-flipbook`: fireball + smoke flipbook on a ground plane, 8-frame strip | three r185 `Sprite` + `SpriteMaterial` with the same atlas and UV animation (alpha blending) | reads as an explosion evolving into smoke; no frame popping; no square sprite edges | Aura `vfx` ≥ 6 and ≥ three − 0.5 |
| S3 | `prd07-impact-library`: contact sheet, 14 kinds × 4 frames (t = 0.03, 0.08, 0.2, 0.5 s) on dark and light backdrops | none (absolute) | each kind reads as its intended effect; none reads as a solid geometric shape (the E21 failure) | ≥ 11 of 14 kinds `vfx` ≥ 6; 0 kinds flagged "primitive shape"; **H** |
| S4 | `prd07-sky-timeofday`: hours 6, 9, 12, 18, 21 with preetham + clouds + stars | three r185 `Sky.js` with identical turbidity/rayleigh/mie/sun and r185 cloud params, same tone mapping | sky gradient, sun disc, clouds and night stars read as natural; no banding | per frame Aura `atmospheric_effects` ≥ three − 0.5; no visible steps (judge) and PRD 12 `skyVariance` > 0 |
| S5 | `prd07-outdoor-sky`: base-09 geometry with `sky.preetham` + default height fog (no HDRI) | three r185: same geometry with `Sky` + `FogExp2` tuned to equal fog at 50 m | sky, horizon and fogged distance are continuous (no seam); no grey wash on near objects | Aura `atmospheric_effects` ≥ 6; seam judged absent; **H** |
| S6 | `prd07-fog-height`: valley with pillars at 10, 25, 50, 100 and 200 m and a hill rising out of low fog | none (absolute) + CPU reference image of the *shipped* fog (legacy-uniform mapping, `HeightFog` mirror) | aerial perspective increases monotonically; hill top clearer than base; near pillars keep contrast | judge ≥ 6; measured fog amount per pillar within ±3% of the CPU reference |
| S7 | `prd07-fog-transition` (Skyline act pattern): five fog nodes toggled at t = 1, 2, 3, 4 s | none | each act's fog is visible and transitions smoothly | judge confirms 5 distinct fogs; no single-frame pop when `transitionSeconds > 0` |
| S8 | `prd07-rain-night`: street block, rain intensity 0.7, splashes on `y = 0`, 8-frame strip | three r185 instanced-streak rain (`InstancedMesh` + `ShaderMaterial`) | rain falls (displacement between frames); streaks thin and tinted; splashes on ground | Aura `particles` ≥ 6 and ≥ three − 0.5 (wet-street look excluded: I3) |
| S9 | `prd07-snow`: snow field, 8-frame strip | three r185 `Points` + `PointsMaterial` with a snowflake map | flakes sway and fall; depth-varied sizes | Aura `particles` ≥ 6 |
| S10 | `prd07-decals`: asphalt with tyre-track surface trails, scorch and crack decals | three r185 `DecalGeometry` + `MeshStandardMaterial` with the same atlas | marks sit on the surface without z-fighting; plausible lighting | Aura ≥ three − 1.0 (exact BRDF match is I3) |
| S11 | `prd07-trails-beams`: dash ribbon, contrails, beam, light cone, aurora ribbon | none | ribbons taper smoothly; no twisting at turns; aurora reads as curtains | judge ≥ 6 per element; **H** |
| S12 | `prd07-particles-stress` at the High tier cap: 4,096 CPU + 45,904 GPU particles (= C-27 High 50,000), mixed blend | none | no flicker from sort; no popping at emitter boundaries | judge ≥ 6 on the strip; §18 relative perf checks pass |
| S13 | `showcase-skyline-runner`, unedited, flags `vfx` vs `none` | its own `none` capture and run 37289688772 | the five act fogs (E43) are distinct per act; no grey wash | `atmospheric_effects` ≥ baseline (3) + 1; **H** |
| S14 | `showcase-neon-swarm`, unedited, flags `vfx` vs `none` (E24: spawns, never updates/mounts) | its own `none` capture | combat hits show sparks/flash instead of nothing | `vfx` ≥ baseline (2) + 2 |
| S15 | `showcase-turbo-drift-circuit`, unedited, flags `vfx` vs `none` (`driftParticleCloud` `main.ts:2612`) | its own `none` capture | drift produces soft lit dust, not "opaque beige marbles" or nothing | `particles` ≥ baseline (1.5) + 2 |

### 17.2 Integrated acceptance (evaluated at checkpoints; never blocks starting or merging PRD 07)

The trigger is the provider slot (`provided && flag on`) or the request that must land first. Rows marked *promotion*
are the ones CONTRACTS §5.3 uses for PRD 07's `integrated-accepted` transition. The other rows are tracked and filed as
issues, and never hold anything.

| # | Trigger | Scene / game | Criterion | Threshold |
|---|---|---|---|---|
| I1 *promotion* | C-04 real (`A3D_QR_CORE`) | `prd07-particles-fountain`; base `14-particles` after R-12-1 | overlapping sprites accumulate additively and bloom via PRD 03 when `A3D_QR_POST` is on | Aura `particles` ≥ 6.5 and ≥ three r185 + 2; **H** |
| I2 *promotion* | C-01 real (ForwardPass split + `sceneDepthCopy`) or R-01-1 | `prd07-soft-particles` (smoke column through ground and box, soft on vs off); `prd07-water-interleave` | no hard intersection lines; particles correctly behind/in front of water and glass | blind A/B soft preferred 100% (both judges + **H**); interleave judged correct |
| I3 | C-02 real (`A3D_QR_CORE=v2`) | `prd07-fog-height` (generator path); `prd07-rain-night` wet street; `prd07-underwater`; `prd07-decals` | fog integral within ±3% of the ray-march reference; wet surfaces darken and reflect; absorption on geometry; decal BRDF matches surroundings | judge ≥ 6.5 each |
| I4 | C-01 depth + C-11 real (+ C-09 SH) | `prd07-volumetric-shafts` (hangar with window light, High/Ultra); `prd07-lit-smoke` | shafts follow occluders; haze lit by sun and spots; smoke darker in shadow and rim-lit | `atmospheric_effects` ≥ 6.5; **H** |
| I5 *promotion* | C-09 real | `prd07-outdoor-sky` + chrome/rough spheres | reflections match the visible sky (sky → IBL) | judge "consistent"; `atmospheric_effects` ≥ 7 |
| I6 | R-03-1 landed (+ C-13 real for the post-graph apply) | `showcase-deep-recovery` (unedited, then after PRD 14 wave) | CPU readback gone; underwater fall-off present | desktop p50 frame ≤ 50 ms on the runner (was 0.5 fps); `atmospheric_effects` ≥ 1.5 + 2 |
| I7 | C-14 real (`A3D_QR_POST_TAA`) | `prd07-particles-fountain` with TAA, camera orbit strip | no particle smearing or ghost trails | judge ≥ 6; reactive-mask on vs off A/B preferred |
| I8 | C-37 real | `tests/qr/prd07/browser/runtime-add-remove.spec.ts` (200 add/remove cycles of effect nodes) | no remount, no blank frame | `RUNTIME_ADD_REMOUNT` count 0; physics body count stable |
| I9 | C-19 real | `prd07-trails-beams` with a rigged sword socket | trail follows the bone, not the root | judge ≥ 6 |
| I10 | R-12-1 landed | base `09-outdoor-environment`, `17-large-environment`, `18-game-scene` | flat sky and grey wash gone (23 §09/§17/§18) | each `atmospheric_effects` ≥ previous + 1.5 (three reported) |
| I11 | C-24 `particle-pass` default (PRD 09) + PRD 14 wave 1 | Aura Clash, Turbo Drift, Bank Shot, Orbital Defense | hit sparks/explosions/tyre smoke/skids/pocket rings read at gameplay scale | per game `vfx` ≥ 6.5, `particles` ≥ 6.5; **H** |
| I12 | PRD 14 wave 3 | Deep Recovery, Aurora Lander, Patrol Wing, Gravity Post | underwater stack, aurora + starfield, clouds/contrails, space VFX | per game `atmospheric_effects` ≥ 7 (Deep Recovery ≥ 7.5, PRD 14 §8.3) |
| I13 | PRD 14 all waves, flags `all` | all 18 games | category means | VFX ≥ 6.5, particles ≥ 6.5, atmosphere ≥ 6 (from 2.2 / 1.4 / 1.4); no game below 5 in any of the three; **H** |
| I14 | PRD 14 Skyline/Courier + C-02 real | snow level; rain street | weather reads as weather; wet surfaces reflect | `atmospheric_effects` ≥ 6.5 |

## 18. Performance budgets per tier

Budgets cover this PRD's work only. They are measured with C-28 FrameStats (`particles` scope; `gpuMs` from timer queries
when PRD 11's real implementation provides them) and rAF on PRD 11 reference devices: Low = mid-range phone, Medium =
integrated laptop GPU at 1080p, High = discrete mid GPU at 1440p, Ultra = high-end discrete at 1440p/4K. On the CI runner
they are checked only as relative regressions. Particle counts, soft particles and the froxel grid come from the frozen
C-27 table and are not restated as PRD 07 values.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Live particles, all emitters (C-27 `particleBudget`) | 2,000 | 10,000 | 50,000 | 100,000 (200,000 with WebGPU compute) |
| CPU-simulated live particles (rest GPU/procedural) | 2,000 | 4,096 | 4,096 | 4,096 |
| Particle GPU ms in `prd07-particles-stress` at tier cap | ≤ 0.8 | ≤ 1.2 | ≤ 2.0 | ≤ 3.0 |
| CPU ms: sim + write + sort | ≤ 0.4 | ≤ 0.5 | ≤ 0.6 | ≤ 0.6 |
| VFX draw calls (particles + ribbons + beams + mesh + decals) | ≤ 8 | ≤ 16 | ≤ 24 | ≤ 32 |
| Soft particles (C-27 `softParticles`) / lit shadow taps | off / off | on / off | on / on | on / on (both require the C-01 depth / C-11 lookup to be real; otherwise off and reported) |
| Procedural weather particles | 1,000 | 3,000 | 8,000 | 20,000 |
| Trails (live) / transient VFX lights | 8 / 0 | 16 / 2 | 32 / 4 | 64 / 8 |
| Decals (live) | 64 | 128 | 256 | 512 |
| Sky background GPU ms | ≤ 0.05 (sky-view) | ≤ 0.25 | ≤ 0.25 | ≤ 0.3 |
| Analytic fog + volumes (added ALU) | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms |
| Volumetric (C-27 `volumetricFog` / `froxelGrid`) | analytic | analytic (PRD 03 god rays optional) | ≤ 1.5 ms, 160×90×64 | ≤ 2.5 ms, 240×135×128 temporal (R10) |
| VFX + atmosphere GPU memory | ≤ 4 MB | ≤ 8 MB | ≤ 24 MB | ≤ 120 MB (froxel 3 × 33.2 MB atlases) |
| Atlas page | 1k (1.3 MB) | 1k | 2k (5.3 MB) | 2k |
| Overdraw guard (sum of projected particle area / screen area) | 1.5 | 2.5 | 4 | 6 |
| Readbacks per frame in PRD 07 passes (C-28 counters) | 0 | 0 | 0 | 0 |
| Bundle (gzip, `@aura3d/engine`, volumetric lazily loaded) | +40 KB total for this PRD, of which volumetric ≤ 5 KB is a lazy chunk; measured by PRD 11's `tools/bundle-size` and reported to PRD 15 |

When a frame exceeds its tier's overdraw guard, continuous emitters reduce emission. They never cull particles mid-life.
`diagnostics().effects.budget.culled` reports the reduction. When the C-27 Ultra memory budget check fails, the froxel grid
drops to 240×135×96 and reports `VOLUMETRIC_GRID_REDUCED`. This is the frozen R10 rule, so no CCR is needed.

## 19. Browser coverage

- **Chromium (GH Actions macos-14, ANGLE Metal):** all unit, browser and capture tests; authoritative frames.
- **WebKit and Firefox** (lane workflow `.github/workflows/qr-prd07-browsers.yml`, macos-14 runners; the shared
  `browser-matrix.yml` belongs to PRD 12): shader compile matrix, `particles-production`, `sky-background`, fog background
  match and GPU-sim capability fallback. Pass = no compile errors, `EFFECT_ZERO_PIXELS` 0, and the pixel-presence checks
  pass. Frames are not vision-judged per browser.
- **Capabilities:**
  - GPU sim needs `EXT_color_buffer_float` (C-28 `probe.floatColorBuffer`). Otherwise it runs on the CPU at the tier cap,
    diagnosed.
  - Froxel needs renderable `rgba16f` 2D targets (C-05 `probeHdrTargetFormat`) and C-01 depth. Otherwise it falls back to
    analytic, diagnosed.
  - KTX2 targets come from C-16 `selectKTX2TargetFormat`: ASTC → BC7 → ETC2 → BC3/BC1 → RGBA8, with PNG last.
  - WebGPU compute particles run only where C-29 selects WebGPU (`A3D_QR_WEBGPU`, Ultra).
- **Context loss:** particle buffers, sim targets, atlases and froxel atlases are registered with C-29
  `resourceRegistrySlot` and rebuilt on restore (browser test in §16).

## 20. Mobile coverage

- Low tier on phones (C-27 `low`): 1k atlas, no soft depth, sky-view texture, analytic fog only, 2,000 particles, 1,000
  weather particles, no transient lights, overdraw guard 1.5, optional half-resolution particle target (P6-T4).
- CI: Playwright mobile emulation (390×844, DPR 3, touch, `?aura3d-quality=low`) in `prd07-vfx.yml` runs the impact
  library sheet, rain and sky scenes to verify caps, guard behaviour and framing. Emulation is not a performance
  measurement. Real-device numbers come from PRD 11's device lab at checkpoints.
- Thermal behaviour: on C-27 `app.quality.onChange` (PRD 11's governor, or the stub's `set`), emitters keep their live
  particles and reduce emission. Froxel atlases are released, and analytic fog takes over without a visible pop because
  the fog parameters are shared.

## 21. Screenshots / evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd07/<gh-run-id>/`:

- For every §17 scene: Aura frame(s), the reference frame(s) where applicable, 8-frame filmstrips for animated scenes,
  side-by-side composites, `report.json` with `diagnostics().effects` and `.atmosphere`, vision-judge JSON records (both
  judges, tie-breaker if used), human sign-off note for **H** items.
- Before/after pairs with flags `none` vs `vfx` on the same sha for Turbo Drift, Skyline Runner, Neon Swarm, Deep
  Recovery and Blockfall Reactor. Run 37289688772 is the historical reference.
- Perf: per-scene GPU ms (or `null`), rAF p50/p95, live particle counts, draw calls, culled counts, readbacks.
- The `capability-degraded` codes active in each capture, so every frame states which stubs it ran on.
- The GH Actions run URL, commit sha and resolved `qrFlags` for each artefact set. No locally captured frame is
  admissible.

## 22. Completion criteria

**Standalone done.** This gates the lane and `standalone-accepted`, and needs no other lane:
1. S1–S15 pass with evidence (§21) in `prd07-vfx.yml`.
2. With flags `vfx`, `EFFECT_ZERO_PIXELS` is 0 on all `prd07-*` scenes and on the S13–S15 games, and every `effect` kind
   in §6.3.1 has a consumer.
3. With flags `none`, IC-0 identity holds on all 18 games and 18 base scenes for every PRD 07 PR.
4. `counters().readbacks === 0` in every PRD 07 pass; `readPixels` appears only in test files in the §13.2 paths.
5. The custodian conformance suites for C-20 and C-21 pass for `stub` and `real`.
6. Every new builder field has an option-coverage row or a `diagnosticOnly.prd07.ts` entry.
7. Every §13.6 request is filed with the exact change, and CCR-07-1…3 are filed.
8. C-40 rows `F-07-*` are appended, with run ids.

**Program done.** This is tracked at checkpoints and never blocks the standalone close:
9. The *promotion* rows I1, I2 and I5 pass at a G-PANEL round. The flag then moves to `integrated-accepted`, then to
   `default-on`, and is removed by P7-T2.
10. I3, I4 and I6–I14 are evaluated at the checkpoint after their trigger. Each failure has a filed `qr-ic-regression`
    issue with an attributed cause. I11–I14 are co-owned with PRD 14 and do not hold PRD 07's flag removal.
11. After removal no `prd07.legacy*` runtime node, `legacyPrimitiveNodes` or deleted symbol remains (grep gate), and no
    engine builder emits a primitive sky, rain, snow, star or cloud.

## 23. Rollback

- **Any time:** flags `none`, `?a3d-qr=-vfx`, or `renderer.vfx: "v1"` restores the `85aafcd0` behaviour per app. With the
  flag off, contributors are not invoked and carved files run verbatim, so rollback is exact.
- **Per subsystem:** sub-flags `A3D_QR_VFX_SKY`, `_FOG`, `_VOLUMETRIC` and `_DECALS`, or `renderer.vfxOverrides:
  { particles?: false; sky?: false; fog?: "legacy"; volumetric?: false; decals?: false }`. `fog: "legacy"` restores exp2
  with the 0.525 cap and static resolution.
- **Default state:** default changes are checkpoint state transitions (CONTRACTS §5.3). Reverting one means PRD 15
  reverting `flags.state.ts` to the previous state. PRD 07 code does not change.
- **Atlas load failure:** falls back to the PNG page, then to a procedural `soft-dot` drawn analytically in the shader. A
  route never loses particles entirely.
- **Trunk-red PR:** reverted immediately by anyone (CONTRACTS §6.1). PRD 07 re-lands it.
- **After removal:** rollback is a revert of the removal PR, which is kept as a single PR for that reason.

## 24. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Overdraw makes particles the frame bottleneck on mobile | high | fps loss | overdraw guard, C-27 caps, half-res target, soft depth off on Low, judged at gameplay scale not stress scale |
| C-04 real lands late | medium | additive glow is emulated | alpha-over fallback (§6.2.7) with honest `VFX_BLEND_FALLBACK`; standalone thresholds set for it; I1 evaluated when triggered |
| C-01 depth lands late | medium | no soft particles or froxel | near fade; analytic fog; R-01-1 offers a cheap stub-side path; I2/I4 wait for the trigger and nothing else does |
| New fog defaults change 17 tuned games | high | look shifts, some worse at first | defaults apply only with `A3D_QR_VFX_FOG`; explicit `density` keeps exp2 without the cap; `legacyOpacityCap`; PRD 14 opts routes in per wave with judged frames |
| Legacy-path fog approximation differs from the generator integral | medium | look changes when `A3D_QR_CORE=v2` turns on | parity mode keeps sky/VFX/geometry consistent on each path; I3 measures the change; `FOG_LEGACY_APPROXIMATION` reported |
| A PR 0b carve-out is dropped (verbatim rule) | low | owned file missing | logic stays in PRD 07 modules; wiring becomes a request to PRD 15 (CONTRACTS §3.9) |
| App↔device binding ambiguity on multi-app pages | low | VFX on the wrong canvas | first-app-only + `VFX_APP_BINDING_AMBIGUOUS`; CCR-07-1 |
| GPU-sim results differ across GPUs | medium | non-deterministic baselines | GPU-sim scenes judged, not pixel-diffed; the deterministic CPU path serves regression baselines |
| Preetham sky differs from three because of tone-mapping order | medium | S4 mismatch | linear radiance with an HDR target; legacy encode otherwise; the three reference uses the same tone mapping (PRD 12 profile) |
| Froxel memory on Ultra (≈ 100 MB) | medium | OOM on some GPUs | frozen R10 fallback to 96 slices; then the High grid on allocation failure |
| TAA ghosting on particles | medium | smearing | C-14 `writesReactive`; I7 |
| Realm-level auto-adoption of `game.effects` surprises multi-app pages | low | effects on the wrong app | adoption only with exactly one live app; otherwise `GAME_EFFECTS_UNBOUND` and the explicit `app` option |
| Vision-judge variance | medium | flaky acceptance | two judges + tie-breaker; human sign-off on **H** items; deterministic strips |
| Seam where the froxel volume ends and analytic fog continues | medium | visible band | analytic fog starts from the volume's far transmittance; judged in I4 |
| Requests not handled within 2 days | medium | standalone looks are missing small wins (R-02-2 cost, R-15-1 warning) | none of S1–S15 depends on a request; unresolved requests are listed in each checkpoint report |

## 25. Out of scope

- Water, ocean, underwater environment preset, terrain, foliage, grass, caustics (PRD 10).
- HDRI/cubemap background shader, IBL, PMREM, SH, reflection probes, shadows (PRD 02).
- Screen-space god rays S4, bloom, TAA, speed streaks, chromatic/flash post effects (PRD 03); camera shake and screen
  flashes (PRD 08).
- Distortion/refraction particles (heat haze), motion-vector flipbooks, fluid simulation, ray-marched 3D volumetric
  clouds, deferred/screen-space decals, decals on skinned meshes, depth-buffer particle collision on WebGL2 (WebGPU later
  via PRD 11).
- A node-based VFX graph editor or GUI authoring tool; `@aura3d/lean` particles; audio for VFX events (PRD 09 audio).
- Re-tuning individual games and editing any `apps/showcase-*` file (PRD 14); skill and template text (PRD 13).
- Edits to files owned by other lanes (§13.2 table). Those are requests (§13.6) or contract seams.

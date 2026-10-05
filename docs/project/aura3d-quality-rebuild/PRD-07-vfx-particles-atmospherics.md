# PRD 07: VFX / Particles / Atmospherics

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`. Status: proposed.

Owned area: `packages/rendering/src/vfx/` (new), `packages/rendering/src/atmosphere/` (new),
`packages/rendering/src/effects/*`, `packages/rendering/src/{VolumetricFog,DayNightSky,Weather,AtmosphereWetness,ProjectedDecalGeometry,SpriteFlipbook}.ts`,
the fog chunk in `packages/rendering/src/ShaderChunks.ts:472-517`, `packages/engine/src/production-runtime/effects/` (new),
`packages/engine/src/agent-api/vfx/` (new), and the `effects.*` / `sky.*` / `weather.*` / `decals.*` builders plus effect
lowering in `packages/engine/src/agent-api/{index,GameRuntime,GameFeel,LayeredSceneComposition,Decals}.ts`.
Not owned: device blend state (PRD 01), HDR target and OutputPass (PRD 01), environment/HDRI background and IBL
(PRD 02), screen-space god rays S4 and post graph (PRD 03), terrain/water/foliage (PRD 10), tier table (PRD 11),
scene compiler (PRD 15), the `game.fx` facade (PRD 09).

Evidence base: research `08-vfx-atmos-environments.md` (primary), `10-camera-controls-gameruntime.md` §4.1,
`16-route-local-extraction.md` rows 2/14/19, `18-completeness-critic.md`, `19-claim-verification.md` C8/C9 (corrected
statements), `21-game-vision-judgment.md` (authoritative for every visual category), `23-benchmark-vision-judgment.md`
(authoritative Aura vs three r185), `22-benchmark-pass1-code-metrics.md` (harness fair), `20-game-scorecards-code-pixelstats.md`
(performance, non-visual), `_sections/B-game-scorecard.md`. Capture: GH Actions run 37289688772, macos-14, ANGLE Metal on a
paravirtual Apple GPU, sha `c08d8acb` (`evidence/games/`, `evidence/benchmark/`).

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
   fog is correct, but the height term is a per-fragment multiplier, not a ray integral (`ShaderChunks.ts:472-517`). The
   root caps opacity at `clamp(0.25 + intensity*0.55, 0, 0.92)` with intensity defaulting to 0.5 (`index.ts:12748,
   12758`), so the cap is 0.525: distant geometry never reaches the fog colour. Default density 0.12 exp2 gives
   `(1 - e^-1.44) * 0.525 ≈ 40%` fog at 10 m, a grey wash. Fog never reaches the background. Fog is chosen once from the
   static snapshot with `nodes.find` (`index.ts:12739-12745`), so Skyline's five act fogs all render as act 0 (18 §2).
   `effects.volumetricFog` is a surface lobe plus a CPU 8-bit radial blur from a fixed UV `[0.5, 0.18]`
   (`VolumetricFog.ts:131`, `PostProcessPass.ts:1177-1255`, `Renderer.ts:1245-1262`). It forces CPU readback, and Deep
   Recovery, its only user, measured **0.5 fps** at 1920×1080 on the capture runner, where Orbital Defense and Vault
   Breakers hold about 60 (`_sections/B-game-scorecard.md:31-36`).

Pixel consequences (authoritative vision judgments):

- Benchmark `14-particles` (2,000 additive sprites, seed 1414, `benchmarks/quality-rebuild/shared/scenes.ts:280-288`):
  **Aura 1/10 vs three.js 4/10** (23 §14; pass-1 metric judge 1 vs 6.5, 22 §14). "The particle system is entirely absent
  in Aura3D." The adapter logs that `effects.particles` has no seed, position or size option
  (`benchmarks/quality-rebuild/aura3d/common.ts:232-242`).
- Benchmark `09-outdoor-environment`: Aura 3.5 vs three 5.5. Flat sky; "greyed, low-contrast" tone from fog plus lifted
  ambient (23 §09). The adapter logs that `scene().background()` accepts only a colour (`aura3d/common.ts:119`) and that
  fog "caps opacity ... so distant geometry never fully fogs as FogExp2 does" (`aura3d/common.ts:250-252`).
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
(`_sections/B-game-scorecard.md` bottom row), the three lowest visual categories in the program alongside shadows (1.6)
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
| E5 | `index.ts:16000-16006`, `:16517-16600` | Safe-basic fallback: particles are 8-triangle opaque octahedrons; rain is 90 static 1 px `GL_LINES`. Turbo's author documents "opaque beige marbles" (`apps/showcase-turbo-drift-circuit/src/main.ts:2631-2633`). | 08 §2.2 |
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
| E20 | `packages/engine/src/agent-api/GameRuntime.ts:2800-2879` | `createGameEffects` is a pure data pool; `nodes()` (`:2872-2873`) is its only pixel path. | read; 19 C8 |
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
| E29 | `packages/rendering/src/EnvironmentBackgroundPass.ts:12-60` | Equirect/cubemap fullscreen-triangle background; builds geometry inside `execute()` every frame. | read |
| E30 | `index.ts:3730-3769` | `sky.dayNight`: sphere sun/moon at `(-6cos az, 1+5 sin az, -7)`, ≤120 sphere stars at z=-6.5, ≤48 opaque PBR sphere clouds; returns one background colour. | read |
| E31 | `packages/rendering/src/DayNightSky.ts:8-11, 63-84` | Nine hard-coded sRGB keyframes; "no Rayleigh/Mie model is implemented or implied". | 08 §4.2 |
| E32 | `packages/engine/src/agent-api/LayeredSceneComposition.ts:503-543` | `planSkyBackdrop` emits `bandCount` (default 4) flat bands with stepped `emissiveIntensity = 0.52 - blend*0.34`. Used by Skyline (`apps/showcase-skyline-runner/src/main.ts:1122-1140`). | read |
| E33 | `packages/rendering/src/EnvironmentPlatform.ts:395-415` | `createProceduralSkyDome` is a single-colour unlit UV sphere; no root consumer. | 08 §4.4 |
| E34 | `packages/engine/src/production-runtime/index.ts:1436-1621` | `createProductViewer` draws an HDR sky through its own `A3DVisibleHdrSkyboxMaterial` sphere: a parallel background path. | 19 C9 |
| E35 | `apps/showcase-rooftop-buckets/src/environment.ts:21-56`; `apps/showcase-patrol-wing/src/sky.ts:449-458` | Box-slab sky bands; sun is an emissive sphere at (-29, 21, -58). | 08 §4.3 |

### 2.4 Fog and volumetrics

| # | Location | Fact | Source |
|---|---|---|---|
| E36 | `packages/rendering/src/ShaderChunks.ts:472-517` | `a3dEnvironmentFogFactor`: radial distance fog × `exp(-max(0, y - ref) * falloff)` (multiplier, not integrated). Volumetric "inscatter" is `pow(dot(V,L),6)` on surfaces only, plus sin-hash dither. | read |
| E37 | `index.ts:3442-3449` | `effects.fog` defaults: density 0.12, `#9fb7d9`, intensity undefined. | read |
| E38 | `index.ts:12733-12758` | Fog picked by `nodes.find` from the static snapshot; volumetric wins over plain; intensity defaults 0.5 (`:12748`); `maxOpacity = clamp(0.25 + intensity*0.55, 0, 0.92)` (`:12758`); `near 1, far 60` hard-coded (`:12755-12756`). | read |
| E39 | `benchmarks/quality-rebuild/aura3d/common.ts:250-252` | Harness records the opacity cap as a fidelity gap vs `FogExp2`. | read |
| E40 | `packages/rendering/src/VolumetricFog.ts:105-144`; `PostProcessPass.ts:1177-1255`; `Renderer.ts:1245-1262`; `WebGL2Device.ts:2452-2454` | CPU nested-loop radial blur on a `Uint8Array` readback; fixed anchor UV; "own no GPU target". | 08 §3.2 |
| E41 | `apps/showcase-deep-recovery/src/main.ts:280-285` | The only `volumetricFog` user. 0.5 fps desktop on the runner. | B scorecard; 17-g5 |
| E42 | `packages/rendering/src/cinematic/*` (14 files) | `FogVolumeSystem`, `DepthHazePass`, `RainParticleSystem` and others are descriptors with `rendererOwnedEvidence` flags; no renderer reads them. | 08 §3.3, §6 |
| E43 | `apps/showcase-skyline-runner/src/main.ts:1391, 1904, 2229-2238, 3864` | Five act fog nodes toggled via runtime handles; renderer always uses act 0. | 18 §2 |

### 2.5 Weather and decals

| # | Location | Fact | Source |
|---|---|---|---|
| E44 | `index.ts:3772-3810` | `weather.precipitation`: dead rain/snow node plus ≤160 opaque PBR `primitives.box` streaks or spheres sampled at `elapsedSeconds ?? 1.2`. Rain does not fall. | 08 §5.2; 19 C8 |
| E45 | `packages/rendering/src/Weather.ts`, `AtmosphereWetness.ts` | Sound deterministic state math (intensity, wind, puddles, wetness scalars). Keep. | 08 §13 |
| E46 | `packages/engine/src/agent-api/Decals.ts:51-61` | `AURA_DECAL_MAX_DECALS = 32`, forward transparent, one draw per decal, angle/distance fade, polygonOffset; no normal/roughness blending. 0 games use it. | 08 §7 |
| E47 | `packages/rendering/src/ProjectedDecalGeometry.ts` (439 lines) | Box/ellipse clip of the source mesh, comparable to three.js `DecalGeometry`. Keep. | 08 §7 |
| E48 | `apps/showcase-turbo-drift-circuit/src/main.ts:5163-5184` | "Skid marks" are primitives; the judge sees "disc or rectangle decals". | 08 §7; 21 turbo |

### 2.6 Adoption (18 games; research 08 §9, 18 census)

`effects.fog` 17/18; `effects.volumetricFog` 1; `effects.particles` in 2 shipped games (Turbo `main.ts:2612`, Pulse
`main.ts:1409-1450`) and 2 non-game showcases (data-galaxy `:223`, particle-lab `:226`), all dead on production;
`sky.dayNight` 0; `weather.*` 0; `water.*` 0; `decals.*` 0; `effects.flipbook` 0; `effects.beam` 0;
`environments.hdri` 0; `.nodes()` 0.

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
blanket warning at `index.ts:13722-13723` is deleted.

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/rendering` | New `vfx/` (particle batch pass, ribbons, beams, mesh particles, sort, soft-depth, atlas sampling, GPU sim on WebGL2) and `atmosphere/` (procedural sky pass, gradient sky, height fog chunk, absorption fog, froxel volumetric pass, sky-capture adapter). Effects modules feed `vfx/`. `cinematic/*` descriptors and the production CPU volumetric path are deleted. |
| `@aura3d/engine` (agent-api + production-runtime) | `ProductionEffectSystem`, effect-node lowering (later a PRD 15 compiler handler), `app.effects`, `app.nodes.add/remove`, background spec, `sky.*` rewrite, `weather.*` rewrite, fog from live state, `game.effects`/`gameFeel` auto-mount, VFX preset library, `decals.*` batching, observed-draw diagnostics. |
| `@aura3d/lean` | None beyond what PRD 01 does for blend parity. Lean particle rendering is out of scope (§25). |
| `packages/aura3d-cli/skills` | API facts for `aura3d-materials-environments`, `aura3d-game-art`, `aura3d-browser-game`; text delivery owned by PRD 13. |
| `benchmarks/quality-rebuild` | Particle spec fields (`seed`, `size`, explicit positions) honoured by the Aura adapter; new `prd07-*` scenes (§17). Scene registry types owned by PRD 12. |
| `tools/vfx-atlas-bake` (new) | Deterministic offline baker for the built-in VFX atlas (license-clean, procedurally generated, no network). |
| `apps/*` | Migration to engine VFX/sky/fog/decals; sequencing owned by PRD 14; per-game standalone subset in §17. |

---

## 5. Affected files / directories

Modify (owned):

- `packages/rendering/src/ShaderChunks.ts:472-517`: `environment_fog_common` becomes the integrated height-fog chunk
  `a3d_fog` (§8.4). The function name `a3dApplyFog(vec3 color, vec3 worldPos)` is the stable entry point PRD 10 calls.
- `packages/rendering/src/EnvironmentBackgroundPass.ts`: geometry cached at construction (E29), shared fullscreen-triangle
  helper reused by `SkyBackgroundPass`. Shader content for HDRI is PRD 02's (`ShaderLibraryCore.ts:808-889`).
- `packages/rendering/src/VolumetricFog.ts`: resolves to `VolumetricFogPass` options; `volumetricLightPixels` stays in
  `PostProcessPass.ts` only as a `cpu-deterministic` test oracle.
- `packages/rendering/src/effects/{ParticleSystem,ParticleEmitter,ParticleRenderer,ParticleRenderPass,TrailModule,GPUParticleBackend,ResidentGPUParticleRenderer,ParticleEffectPresets,ParticleDiagnostics}.ts`.
- `packages/rendering/src/{DayNightSky,Weather,AtmosphereWetness,ProjectedDecalGeometry,SpriteFlipbook}.ts`.
- `packages/rendering/src/Renderer.ts`: register the VFX/atmosphere passes through the phase hooks (§12 C-07-IN-3), extend
  `RenderSource` with `vfx`, `sky`, `fog`, `volumetric` fields (`:246-290`), remove the `volumetric-light` CPU branch
  (`:1245-1262`) from non-`cpu-deterministic` execution.
- `packages/engine/src/agent-api/index.ts`: `effects.*` builders (`:3441-3715`), `sky` (`:3730-3770`), `weather`
  (`:3772-3843`), `AuraRuntimeNodeRegistry` (`:10664-10670`), app object (`:11126+`, `setScene` `:11480-11492`), fog
  resolution (`:12733-12786`), bridge (`:13540+`, warning `:13722-13723`), render-source build (`:13990-14005`), particle
  diagnostics (`:8344-8360`), scene-kit evidence strings (`:9683, 9756, 9795-9796`), safe-basic particle/rain models
  (`:16000-16006, 16517-16600`).
- `packages/engine/src/agent-api/GameRuntime.ts` (`:1150-1171`, `:2800-2879`, `:3879-3915`), `GameFeel.ts`,
  `LayeredSceneComposition.ts:503-543`, `Decals.ts`.
- `benchmarks/quality-rebuild/aura3d/common.ts:114-119, 232-253` (honour particle `seed`/`size`/`blending`; route
  `background.kind: "sky"`), `benchmarks/quality-rebuild/three/common.ts` (reference for new `prd07-*` scenes).

Create:

- `packages/rendering/src/vfx/`: `ParticleInstanceLayout.ts`, `ParticleBatch.ts`, `ParticleBatchPass.ts`,
  `ParticleSort.ts`, `ParticleGpuSim.ts` (WebGL2 ping-pong), `ProceduralVolumeEmitter.ts`, `RibbonBatch.ts`,
  `RibbonPass.ts`, `BeamBatch.ts`, `MeshParticleBatch.ts`, `DecalBatch.ts`, `VfxAtlas.ts`, `SceneDepthSource.ts`
  (stub + adapter), `shaders/{particle,ribbon,mesh-particle,decal,gpu-sim}.glsl.ts`, matching `.wgsl.ts` for PRD 11.
- `packages/rendering/src/atmosphere/`: `SkyBackgroundPass.ts`, `PreethamSky.ts`, `GradientSky.ts`, `StarField.ts`,
  `CloudLayer.ts`, `HeightFog.ts`, `FogVolumes.ts`, `VolumetricFogPass.ts`, `SkyCaptureAdapter.ts`,
  `shaders/{sky,fog,volumetric-inject,volumetric-integrate,volumetric-apply,wetness}.glsl.ts` + `.wgsl.ts`.
- `packages/engine/src/production-runtime/effects/`: `ProductionEffectSystem.ts`, `EffectNodeLowering.ts`,
  `EmitterInstance.ts`, `WeatherVolume.ts`, `DecalPool.ts`, `TransientLightPool.ts`, `EffectDiagnostics.ts`.
- `packages/engine/src/agent-api/vfx/`: `presets.ts` (impact library), `atlas.ts` (built-in atlas manifest + typing),
  `effects-api.ts` (`app.effects`), `index.ts`.
- `packages/engine/assets/vfx/`: `aura-vfx-atlas-2k.ktx2`, `aura-vfx-atlas-1k.ktx2`, `.png` fallbacks,
  `aura-vfx-decals-1k.ktx2`, `manifest.json`, `LICENSE.md` (CC0, generated in-repo).
- `tools/vfx-atlas-bake/` (Node, deterministic, seeded; outputs byte-identical files for the same seed).
- `.github/workflows/prd07-vfx.yml` (macos-14; remote only), until PRD 12's registry runs `prd07-*` scenes.
- Tests listed in §16.

Delete (Phase 7, after migration): `packages/rendering/src/cinematic/{FogVolumeSystem,DepthHazePass,RainParticleSystem,BloomPass,FilmGrainPass,VignettePass,WetReflectionApproximation,CinematicDepthComposition,GlowCardSystem,EmissivePracticalLightSystem}.ts`
and their re-exports; `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts`; the hard-coded camera
and standalone device in `ResidentGPUParticleRenderer.ts` (generalized behind the WebGPU path, PRD 11 R12);
`tools/effects-vfx-visual-audit/`; the octahedron particle and `GL_LINES` rain models (`index.ts:16517-16600`), replaced
by the shared pass on the safe-basic path too; `createProceduralSkyDome` (E33); `planSkyBackdrop` (E32) after one minor
deprecation.

---

## 6. Architecture proposal

### 6.1 Frame placement

```
Shadow maps (PRD 02)
Opaque forward (PRD 01)                         ── hook "after-opaque" ──►  SceneDepthSource (C-07-IN-2)
                                                                               linear depth R32F / depth texture
Background: exactly one of                                                   │
  SkyBackgroundPass (PRD 07: preetham | gradient) or                         │
  EnvironmentBackgroundPass (PRD 02: hdri | cubemap | capture) or            │
  solid colour (dithered)                                                    │
  drawn at far plane, depth test LEQUAL, fogged by a3d_fog when affectsBackground
VolumetricFogPass (High/Ultra): inject → [temporal] → integrate (3D tex)    ◄─┘ samples depth + shadow map
                                 apply: full-screen composite over opaque+sky (premultiplied transmittance)
Decals (lit, forward, after opaque, before transparents)  — DecalBatch, one draw per atlas page × blend
Transparent queue (PRD 01 sorted queue, back-to-front by item distance):
  transparent meshes · water (PRD 10) · ParticleBatch(es) · RibbonBatch · BeamBatch · MeshParticleBatch(alpha)
  all VFX fragments: soft depth fade, a3d_fog or volumetric lookup, write HDR + reactive mask (color2)
Post (PRD 03): S1 depth prep … S4 god rays … S9 bloom … S10 composite
```

The VFX passes are submitted by `ProductionEffectSystem` as render items/batches into the existing queue, not as a parallel
renderer (the opposite of E10). Opaque mesh particles go in the opaque queue.

### 6.2 Particle pipeline

**6.2.1 One instance layout for every billboard source.** A camera-facing quad (4 static vertices, 6 indices, shared
VAO) with per-instance attributes (divisor 1), 64 bytes per particle:

| Attribute | Type | Contents |
|---|---|---|
| `a_posSize` | vec4 f32 | world position xyz, size (world metres) |
| `a_velStretch` | vec4 f32 | world velocity xyz, stretch factor (0 = round billboard) |
| `a_color` | vec4 f32 | linear RGB × intensity (HDR, may exceed 1), alpha |
| `a_rotFrameMisc` | vec4 f32 | rotation rad, flipbook frame (float, fractional = blend), emissive weight, normal bend |

CPU-simulated emitters write into one preallocated `Float32Array` per batch and upload the live range with
`bufferSubData` into a 3-deep ring of VBOs (no per-frame allocation; replaces `ParticleRenderer.buildBatch` object arrays,
E7/E12). GPU-simulated and procedural emitters skip the VBO and pull state in the vertex shader (§6.2.3).

**6.2.2 Batching.** A batch key is `(atlas, blend, shading, softDepth, stretchMode, frameBlend, fogMode)`. All live
emitters with the same key and the same sort bucket merge into one instanced draw. Sort buckets: additive batches are
order-independent and merge across emitters; `alpha`/`premultiplied` batches merge only emitters whose bounds overlap
in depth, and each batch is inserted into the transparent queue at its bounds-centre distance.

**6.2.3 Simulation sources.**

| Source | Used for | Implementation | Tiers |
|---|---|---|---|
| CPU modules | bursts, event-driven hits, emitters ≤ 4,096 live, anything needing determinism or per-particle collision callbacks | existing `ParticleSystem` + modules (E7), seeded PRNG per emitter, fixed-step on `app` clock | all |
| GPU sim (WebGL2) | continuous emitters > 4,096 live (fountains, smoke stacks, sparks showers) | `ParticleGpuSim`: two RGBA32F state textures (pos+age, vel+seed) ping-ponged by one fullscreen MRT fragment pass; emission writes ring index range `[head, head+n)` via uniform; vertex shader `texelFetch`es by `gl_InstanceID`; forces: gravity, drag, curl noise (3D value noise), wind, ground plane / heightfield texture collision | Medium+ (requires `EXT_color_buffer_float`; else CPU at Low cap) |
| Procedural volume | rain, snow, marine snow, dust motes, ash, star twinkle | stateless: position = `camPos + wrap(hash3(id) * extent + vel*t - camPos, extent)`; no simulation or upload; count capped per tier | all |
| WebGPU compute | Ultra 200k, depth collision | `GPUParticleBackend` kernels bound to a storage buffer read by the vertex stage; readback deleted (E9) | Ultra on WebGPU only (PRD 11 G-WGPU) |

Unsorted GPU/procedural emitters are restricted to `additive` or `premultiplied` blending with per-particle alpha ≤ 0.5;
the builder enforces this and diagnoses violations (`PARTICLE_GPU_SORT_REQUIRED`).

**6.2.4 Sorting.** `alpha`/`premultiplied` CPU batches sort back-to-front by view depth with an LSD radix sort on a 16-bit
quantized key into a preallocated index permutation (not `Array.sort`, E12). Sort runs only when the camera moved
> 1 cm or rotated > 0.5° or particles changed, and is skipped for additive batches.

**6.2.5 Soft particles and near fade.** Fragment: `soft = saturate((sceneLinearDepth(uv) - fragLinearDepth) /
softDistance)`; `near = saturate((fragLinearDepth - near) / nearFade)`; alpha × soft × near. Depth comes from
`SceneDepthSource` (C-07-IN-2). Default `softDistance` 0.35 m, `nearFade` 0.3 m. Low tier compiles `SOFT_PARTICLES 0`
(PRD 11 key).

**6.2.6 Flipbooks.** Atlas pages are 2D textures with a JSON manifest of named sequences
`{ rect: [u, v, w, h], columns, rows, frames, fps, loop }`. The vertex shader computes the frame cell UVs
(`resolveFlipbookUv` logic, E13, moved to GLSL); `frameBlend: true` samples frames `floor(f)` and `floor(f)+1` and lerps by
`fract(f)`. Frame selection: `"over-life"` (default for explosions/smoke), `"fps"` with random start, or fixed. Atlas
textures use mips with `LINEAR_MIPMAP_LINEAR` and a 1-cell gutter so mip bleed stays inside a cell.

**6.2.7 Blending and HDR.** Blend modes come from PRD 01 `BlendMode` (C-07-IN-1): `additive` for sparks/glow/fire cores,
`premultiplied` for smoke and dust (one mode handles both glow and occlusion: `rgb` premultiplied, alpha controls
occlusion, additive part via `alpha=0` texels), `alpha` for opaque-ish debris sprites, `multiply` for darkening (scorch
puffs). Output is linear HDR into the PRD 01 scene target; emissive values > 1 feed PRD 03 bloom (threshold 1.0). Particles
write `o_reactive = alpha` into PRD 03 `color2` and no velocity.

**6.2.8 Shading modes.**

- `unlit`: `color × texture`, HDR. Default for sparks, fire, glows, rain.
- `lit`: per-vertex lighting for smoke, dust, snow, debris sprites. Normal = `normalize(mix(toCamera, cornerDir, bend))`
  (sphere-bent billboard). Terms: directional sun with half-Lambert wrap `0.5 + 0.5·N·L`, `a3dSampleIrradianceSH(N)` from
  PRD 02 (C-07-IN-5; stub = hemisphere colour pair), and up to 4 nearest point/spot lights. On High/Ultra the sun term is
  multiplied by one shadow-map tap at the particle centre (cascade by distance), so smoke darkens in shade. A
  `backlight` term `pow(saturate(dot(V, -L)), 4) × transmission` gives the sun-through-smoke rim. Lighting is per vertex,
  so cost is per particle, not per pixel.
- `distortion` is out of scope (§25).

**6.2.9 Trails and ribbons.** `RibbonBatch`: each trail is a CPU ring of `(position, time, width, color)` points sampled
when the target moved > `minVertexDistance` (default 0.05 m), up to `maxPoints` (default 48). The vertex shader expands
each point into 2 vertices offset by `normalize(cross(tangent, toCamera)) × width/2` (`orientation: "camera"`) or by
`cross(tangent, surfaceNormal)` (`orientation: "surface"`, used for skid marks and tyre tracks, drawn with polygon
offset in the decal phase). U runs along length (texture scroll by speed), V across. Width/alpha over age curves. One
draw per batch key for all trails. The Resident renderer's ribbon alpha `0.45·(1 - segment/depth)` (E10) is ported as
the default alpha curve. Targets: runtime node id, `node.socket(bone)` from PRD 06 (C-07-IN-7), or a callback.

**6.2.10 Beams and cones.** `BeamBatch`: camera-facing strip from `from` to `to` (existing `createBeamDescriptor`,
`index.ts:3672-3677`), additive, soft depth, scrolling noise texture, core/edge falloff `pow(1-|v·2-1|, coreExponent)`.
`effects.lightCone` (PRD 14 §8.9): open cone mesh attached to a spot light, additive, depth write off, axial and radial
falloff, soft depth, low-frequency noise.

**6.2.11 Mesh particles.** `MeshParticleBatch`: instanced draw of one mesh (primitive or single-primitive GLB) with
per-instance `mat4` (pos, quat, scale), colour and emissive; simulation is CPU (gravity, drag, spin, ground bounce with
restitution, sleep). Opaque by default (opaque queue, casts shadow on High+ if `castShadow`), or `alpha` fade on death.
Instance transforms are built here and never go through `createProductionInstanceTransforms` (E17). The program comes
from PRD 01's instanced PBR feature (C-07-IN-4); the stub is a PRD 07 Lambert + SH + emissive shader.

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

Until PRD 15's compiler exists, lowering is called from one site in `createProductionRuntimeSceneRenderer` and from the
safe-basic renderer. It is written as a `NodeHandler<AuraEffectNode>` (PRD 15 `handlers.ts` shape) so PRD 15 can lift it
without changes (C-07-OUT-6).

**6.3.2 Runtime add/remove (fixes E26).** `app.nodes.add(node, { parent? })` returns an `AuraRuntimeNodeHandle`;
`app.nodes.remove(idOrHandle)` disposes its GPU resources and physics body. Supported kinds in this PRD: `effect` (all),
`primitive`, `model`, `group`, `decal`. Lights may be added; if the change crosses a PRD 01 light bucket, diagnostics report
`PROGRAM_VARIANT_COMPILE` with ms. Implementation: patch `renderSnapshot` in place, register the handle, create render
items for just that subtree, register declared physics bodies for just that subtree. No remount. `setScene` semantics are
unchanged. PRD 15 re-hosts the same API on `updateCompiledScene` version counters (C-07-OUT-5).

**6.3.3 Imperative effects.** `app.effects.spawn(effect, at, options)` and `app.effects.burst(kind, position, options)`
create transient effect instances owned by `ProductionEffectSystem`, pooled per spec, with no scene-node churn. This is
the backend for PRD 09's `GameFxLayer` (`fx.burst`, `fx.trail`; backend `"particle-pass"`, C-07-OUT-1) and PRD 08's VFX
dispatch.

**6.3.4 `game.effects` / `gameFeel` auto-mount.** `createGameEffects(options)` gains `app?: AuraApp`. If given, spawns go
to `app.effects` with the impact-library preset for the kind (§6.4) and `nodes()` returns `[]`. If not given,
controllers register in a realm-local pending list; the first `createAuraApp` mount (and each later mount) adopts unbound
controllers when exactly one app is live. With zero or several live apps, the controller stays unbound and diagnostics
raise `GAME_EFFECTS_UNBOUND` (error). `update(dt)` is called by the app loop for bound controllers (Neon Swarm never calls
it, E24). `gameFeel.create` forwards the same way. `nodes()` remains for one minor release, deprecated, and returns
primitive nodes only when `options.legacyPrimitiveNodes === true`.

### 6.4 Built-in VFX atlas and impact library

**Atlas (`packages/engine/assets/vfx/`).** Baked by `tools/vfx-atlas-bake` from seeded procedural sources (3D fBm density
volumes ray-marched with a single-scatter light for smoke/explosions; analytic shapes for sparks, rings, flares; Worley +
fBm for flame). 2048² page (High/Ultra) and 1024² (Low/Medium), KTX2 (UASTC + zstd, transcoded to BC7/ASTC/ETC2 by the
existing basis transcoder) with PNG fallback, premultiplied alpha. Sequences:

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
with normal and roughness channels (RG normal, B roughness in a second texture). Atlases conform to the
`AuraVfxAtlasManifest` contract (C-07-OUT-3) so PRD 05's K9 VFX kit can supply higher-quality sheets.

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

One background is drawn per frame, chosen by precedence: (1) a visible `sky` node (PRD 07); (2) an environment whose
background is visible (PRD 02, `AuraEnvironmentBackgroundOptions`); (3) `scene().background(color)`, rendered as a
solid colour with triangular dither. A `sky` node and an environment can coexist: the sky draws, the environment lights.
If no environment exists and a sky does, the sky is captured into the IBL through PRD 02's `environments.capture({
include: "sky-only" })` path (C-07-OUT-4), so outdoor reflections match the visible sky.

- **`preetham`** (default model): port of three.js r185 `examples/jsm/objects/Sky.js` (MIT, attribution in
  `LICENSE-THIRD-PARTY`): Rayleigh/Mie with `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, sun disc, and the
  r185 procedural cloud layer (`cloudScale`, `cloudCoverage`, `cloudDensity`, `cloudElevation`, `Sky.js:80-90, 117-177`).
  Output is linear HDR radiance (no tone mapping in the sky shader; PRD 01 OutputPass tone-maps once).
- **`gradient`**: zenith/horizon/ground three-stop with exponent, horizon glow, optional sun disc and the stylized band mask
  from PRD 14 §8.7 (synthwave). Replaces `planSkyBackdrop` (E32) and box-slab skies (E35).
- **Layers shared by both:** procedural star field (direction hashed into a cube-face cell grid, magnitude distribution,
  twinkle, fades with sun elevation), moon disc with phase and earthshine, `aurora` layer request served by the
  `effects.auroraRibbon` geometry (PRD 14 §8.2), and fog-matched horizon (`a3d_fog` evaluated at `backgroundDistance`).
- **Cost control:** on Low the sky is rendered into a 256×128 sky-view texture (lat-long) only when parameters change
  (sun moved > 0.25°, cloud time step), and the background pass samples it (1 fetch/pixel). Medium+ evaluates per pixel
  (≈ 0.1–0.25 ms at 1080p) for crisp sun and clouds.
- **`sky.dayNight` rewrite:** returns one `sky` node (preetham with sun/moon direction from `createDayNightSky`, E31 keyframes
  kept only for colour temperature), one directional light (sun or moon) with colour temperature and intensity, and a fog
  colour hint. No primitives. Return shape `{ nodes, background, dayFactor, visibleStarCount }` is preserved.
- **Deleted from the default path:** sphere sun/moon/stars/clouds (E30), `createProceduralSkyDome` (E33),
  `planSkyBackdrop` bands (E32, one deprecation minor).

### 6.6 Fog

- **Integrated exponential height fog** (replaces the multiplier, E36). Density `σ(h) = σ_h · exp(-b·(h - h0))` plus a
  uniform distance term `σ_d`. Optical depth from camera `c` along unit `v` over length `d` (beyond `start`):
  `τ = σ_d·d' + σ_h·exp(-b·(c.y - h0)) · d' · (1 - exp(-b·v.y·d')) / (b·v.y·d')`, with the last factor → 1 when
  `|b·v.y·d'| < 1e-4`, `d' = max(d - start, 0)`. Fog amount `f = min(1 - exp(-τ), maxOpacity)`.
- **Inscatter colour:** `fogColor · ambientScale + sunColor · HG(dot(v, L), g) · sunInscatter`, with Henyey-Greenstein
  `g = 0.6` default. With a sky present, `color: "sky"` (the default) takes `fogColor` from the sky's horizon radiance at
  the view azimuth (uniform per frame: 8 azimuth samples interpolated), which removes the fog/background seam.
- **Absorption fog** (underwater; PRD 10 §8.7, PRD 14 §8.3): per-channel `σ = vec3` and
  `color = color·T + waterColor(depth)·(1 - T)`, `T = exp(-σ·d)`.
- **Local fog volumes** (`effects.fogVolume`, ≤ 4 Low/Medium, ≤ 8 High+): constant-density box or ellipsoid, analytic
  segment length of the ray ∩ volume clipped to `[0, d]`, added to `τ`. Used for lamp haze, ground mist, steam.
- **Applied to:** all opaque (forward chunk), transparents and VFX (same chunk; particles evaluate per vertex), and the
  background when `affectsBackground` (default `true` for `preetham`/`gradient` skies and solid colour, `false` for an
  HDRI background, matching PRD 02 §6.2), using `d = backgroundDistance` (default `camera.far`).
- **Live state** (fixes E38, E43): the active fog is the last *visible* fog node in scene order, read from runtime
  handles every frame. `handle.setVisible`, `handle.setFog(partial)` and `app.atmosphere.setFog(spec, { transitionSeconds })`
  interpolate density in linear space and colour in linear RGB over the transition. `near: 1, far: 60` hard-codes
  (`index.ts:12755-12756`) are removed.
- **Defaults** (`effects.fog()` with no arguments): `mode: "height"`, `σ_d = 0.004`, `σ_h = 0.008`, `b = 0.2`, `h0 = 0`,
  `start = 2 m`, `maxOpacity = 1`, `color = "sky"` (else `#a9bccf`). For a horizontal view from 1.6 m
  (`τ ≈ 0.0098·d'`) this gives ≈ 7% at 10 m, 37% at 50 m and 62% at 100 m, versus 40% at 10 m today (E38). Near
  gameplay keeps its contrast and distant geometry still converges to the horizon colour (aerial perspective). Legacy calls that pass only
  `density` keep exp2 mode with that density but `maxOpacity = 1`; `legacyOpacityCap: true` restores
  `0.25 + intensity·0.55` for one minor release (§11).

### 6.7 Volumetric fog (GPU)

- **Tier mapping (PRD 11 table):** Low/Medium = analytic height fog + fog volumes only (`effects.volumetricFog` maps to
  analytic, with the PRD 03 S4 screen-space god rays when requested); High = froxel grid 160×90×64; Ultra = 240×135×128
  with temporal reprojection.
- **Grid:** view-aligned froxels, exponential slice distribution `z_k = n·(f/n)^(k/N)` with `n = 0.5 m`,
  `f = volumetricFar` (High 64 m, Ultra 96 m; beyond it, analytic fog continues so there is no seam).
- **WebGL2 implementation (no compute):** (1) *inject*: render each slice of an RGBA16F `TEXTURE_3D` with
  `framebufferTextureLayer` (N small fullscreen draws of 160×90 each): density = height fog + fog volumes + 3D noise
  (scrolling, `noiseScale`, `noiseStrength`); lighting = sun × shadow-map visibility at the froxel centre (PRD 02 cascade
  lookup, C-07-IN-6) × HG phase + SH ambient + up to 4 local spot/point lights with their shadow when available;
  jittered slice offset per frame on Ultra. (2) *temporal* (Ultra): reproject the previous inject volume with the
  previous view-projection, blend 0.9, reject outside the volume. (3) *integrate*: one 2D pass over 160×90 looping the
  slices front to back, writing accumulated inscatter (rgb) and transmittance (a) per slice into a second 3D texture.
  (4) *apply*: full-screen pass after opaque + sky: `color = color·T(uv, z) + inscatter(uv, z)` with a tricubic-free
  trilinear fetch at the pixel's linear depth; transparents and particles fetch the same volume per vertex.
- **WebGPU:** the same passes as compute dispatches (PRD 11 WGSL target).
- **Deletion:** `volumetricLightPixels` (E40) leaves production; it remains the `cpu-deterministic` oracle for unit tests.
  PRD 11's interim mapping ("analytic height fog on all tiers", PRD 11 §6, `index.ts:12805-12825`) is replaced by this pass
  on High/Ultra.

### 6.8 Weather

- **Rain:** procedural camera-relative volume (box 24×18×24 m Medium), velocity-stretched `rain-streak`, additive at low
  alpha with lit tint from sky irradiance, wind from `Weather.ts` state (E45), counts per tier (§18); occlusion under
  roofs via a top-down height test against `occluderHeightAt` when provided (PRD 10 terrain/kit contract), else none.
  Splashes: CPU emitter spawning `splash` flipbooks at random points on `groundHeightAt(x, z)` (default `y = 0`, or PRD 10
  `app.world.terrain(n).heightAt`) in a 12 m disc around the camera, rate ∝ intensity. Ripples: animated ripple normal
  flipbook in the wetness chunk.
- **Snow:** procedural volume, `snowflake` ×4 variants, sway `sin(t·f + id)·amp`, lit; optional `snowCover` term.
- **Wetness/snow-cover chunk (`a3d_wetness`):** included in the PBR program behind `#define A3D_WETNESS` (PRD 01 shader
  framework; PRD 07 supplies the chunk, like PRD 10's caustics). `albedo *= mix(1, 0.55, wet·porosity)`,
  `roughness = mix(roughness, 0.06, wet·puddle)`, puddle mask from a world-space tiled noise texture thresholded by `wet`,
  ripple normals blended into puddles while raining, `snowCover` lerps albedo to 0.9 on `N.y > 0.6`. Global uniforms
  driven by `AtmosphereWetness.ts` (E45). PRD 10 `world.street({ wet })` consumes it (C-07-OUT-2).
- **Lightning:** ribbon bolt (branching L-system of 3–5 segments, additive HDR 40, 0.12 s), sky brightening uniform,
  directional flash light `1 + flash·4` (existing), thunder delay event for audio.
- **`weather.precipitation`** (E44) returns these nodes instead of ≤ 160 static boxes; `weather.wetGround` emits a wetness
  node instead of a box slab with cylinder puddles.

### 6.9 Decals

- `DecalBatch`: projected geometry from `ProjectedDecalGeometry` (E47, kept) appended into one dynamic vertex buffer per
  atlas page and blend mode (ring allocator; oldest evicted when full). One draw per page × blend, not one per decal (E46).
- Lit decals: the decal fragment runs the PRD 01 PBR lighting with its own albedo, tangent-space normal (perturbing the
  projected mesh normal) and roughness from the decal page; `alpha` blend for marks, `multiply` for grime. Angle fade and
  distance fade are kept; life/fade-out curves added.
- Capacity per tier: Low 64, Medium 128, High 256, Ultra 512 (was a hard 32).
- Skid/tyre marks use `orientation: "surface"` ribbons in the decal phase (§6.2.9), which is cheaper than re-projecting a
  decal every frame.
- Projection onto skinned meshes, screen-space/deferred decals and atlas packing at runtime are out of scope (§25).

### 6.10 Diagnostics (observed, not declared)

`app.diagnostics().effects`:
`{ nodes: [{ id, effect, consumer, live, drawCalls, instancesDrawn, sim: "cpu"|"gpu"|"procedural"|"compute", softDepth,
zeroPixelFrames }], batches, liveParticles, budget: { tier, cap, culled }, gpuMs?, errors: [{ code, nodeId, message }] }`.
`app.diagnostics().atmosphere`: `{ background: "sky-preetham"|"sky-gradient"|"environment"|"color", fog: { mode,
activeNodeId, maxOpacity }, volumetric: { mode: "analytic"|"froxel", grid?, gpuMs? } }`. `gpuMs` comes from
`EXT_disjoint_timer_query_webgl2` when available (PRD 11 `RendererTiming`). `collectParticleBudgetDiagnostics.gpuReady`
and the scene-kit evidence strings (E18) are replaced by these observed values.

### 6.11 Recommendations with cost profile

Costs are targets for a Medium-tier desktop (integrated-class GPU, 1080p) unless stated; validated per §18. Bundle = gzip
JS added to `@aura3d/engine`.

| # | Recommendation | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Particle batch pass + CPU feeder + atlas, wired to `effects.particles/flipbook` | Largest: particles go from absent (14-particles 1/10) to soft, textured, blended sprites in every game (Particles mean 1.4) | 0.3–1.5 ms, fill-bound (overdraw) | 0.05 ms per 1k CPU particles (sim + write) | 64 B/particle; atlas 5.3 MB (2k KTX2 + mips) / 1.3 MB (1k) | +14 KB | 1k atlas, 2k live cap, no soft depth on Low | safe-basic: same pass (WebGL2); Canvas2D diagnostic only |
| R2 | Impact library + `game.effects`/`gameFeel` auto-mount + `app.effects.burst` | Hit moments gain sparks, flash, ring, dust (VFX mean 2.2; Aura Clash, Mech, Orbital) | in R1 | ≤ 0.1 ms per 10 live effects | pools ≤ 1 MB | +6 KB | lights off on Low | PRD 09 backend A primitive pool |
| R3 | Ribbons/trails + beams + light cones | Dash/slash, contrails, skid marks, vision cones, aurora | 0.05–0.3 ms | 0.02 ms per trail | 48 points × 32 B per trail | +4 KB | ≤ 8 trails Low | none (feature absent) |
| R4 | Mesh particles | Debris that reads as 3D | 0.1–0.4 ms (instanced) | 0.03 ms per 100 | 96 B/instance | +3 KB | sprite chips on Low | sprite debris |
| R5 | Procedural sky (preetham + gradient + stars/clouds/moon) as background, sky→IBL capture | Removes flat/banded skies (09 flat sky; Patrol, Aurora, Siege, Skyline, Pulse) | 0.1–0.25 ms per pixel (Low: 0.03 ms via sky-view) | < 0.02 ms | Low sky-view 256×128 RGBA16F 0.25 MB | +6 KB | sky-view texture | gradient sky |
| R6 | Integrated height fog, absorption, fog volumes, live fog, defaults, fog on background | Aerial perspective without grey wash (09, 17, 18; Turbo "grey wash"; Skyline acts) | +≈ 20 ALU/pixel ≈ 0.05 ms | < 0.01 ms | 0 | +2 KB | same | exp2 legacy mode |
| R7 | GPU froxel volumetric (High/Ultra) | Shafts and lit haze (Deep Recovery, Mech Hangar, Gallery Shift) | High ≤ 1.5 ms, Ultra ≤ 2.5 ms | < 0.05 ms | High 2 × 7.4 MB; Ultra 3 × 33 MB | +5 KB (lazy chunk) | off (analytic) | analytic + PRD 03 S4 |
| R8 | Weather volumes + splashes + wetness/snow chunk + lightning | Rain/snow that falls, wet streets (Courier, Skyline, Aura Clash night street) | 0.2–0.8 ms | 0.05 ms (splashes) | noise + ripple textures 1.5 MB | +4 KB | 25% counts, no ripples | static wet look only |
| R9 | Batched lit decals + surface ribbons | Tyre marks, scorch, cracks (Turbo, Orbital, Courier) | 0.05–0.3 ms | 0.02 ms per spawn (projection) | ≤ 4 MB ring at Ultra | +3 KB | 64 cap | unlit decals |
| R10 | GPU particle sim (WebGL2 ping-pong); WebGPU compute (PRD 11) | 10k–200k particle density for fountains, sparks showers, marine snow | 0.1–0.5 ms sim | ≈ 0 | 32 B/particle state | +4 KB | off on Low | CPU at tier cap |
| R11 | Zero-pixel error + observed diagnostics; delete descriptor/evidence theater | Prevents regressions to invisible effects | 0 | 0 | 0 | −(deleted code) | – | – |

---

## 7. APIs to add / change / remove

All in `@aura3d/engine` (`packages/engine/src/agent-api/`), re-exported from the root.

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

export interface AuraVfxAtlasManifest {                  // contract C-07-OUT-3
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
  readonly discSizeDeg?: number;            // default 0.53
  readonly intensity?: number;              // radiance multiplier, default 1 (HDR; disc peaks ≈ 20 before tone map)
  readonly color?: AuraColor;
}
export type AuraSkySpec =                   // contract C-07-OUT-2 (PRD 10 AuraBiomeRig.sky)
  | { readonly model: "preetham"; readonly sun: AuraSkySunSpec; readonly turbidity?: number; readonly rayleigh?: number;
      readonly mieCoefficient?: number; readonly mieDirectionalG?: number; readonly exposure?: number;
      readonly clouds?: AuraSkyClouds | false; readonly stars?: AuraSkyStars | false; readonly moon?: AuraSkyMoon | false;
      readonly groundColor?: AuraColor }
  | { readonly model: "gradient"; readonly zenith: AuraColor; readonly horizon: AuraColor; readonly ground?: AuraColor;
      readonly exponent?: number; readonly horizonGlow?: { readonly color: AuraColor; readonly sharpness: number };
      readonly sun?: AuraSkySunSpec; readonly bands?: { readonly frequency: number; readonly scroll?: number };
      readonly stars?: AuraSkyStars | false; readonly moon?: AuraSkyMoon | false; readonly intensity?: number }
  | { readonly model: "hdri"; readonly texture: AuraAssetRef<"texture">; readonly rotationDeg?: number;
      readonly blurriness?: number; readonly intensity?: number }            // delegates to PRD 02 background
  | { readonly model: "cubemap"; readonly faces: AuraAssetRef<"texture">; readonly intensity?: number }; // PRD 02
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
  /** Rewritten: one sky node + one key light + fog hint. No primitives. Return shape preserved. */
  dayNight(options?: DayNightSkyOptions & { readonly starLimit?: number; readonly cloudLimit?: number;
           readonly model?: "preetham" | "gradient" }): { readonly nodes: readonly AuraSceneNode[]; readonly background: string;
           readonly dayFactor: number; readonly visibleStarCount: number; readonly sky: AuraSkySpec };
};
// AuraSkyNode: { kind: "sky"; name: string; spec: AuraSkySpec; captureEnvironment: boolean; affectsFog: boolean }
// Runtime: app.atmosphere.setSky(partial: Partial<AuraSkySpec>, { transitionSeconds? }): void
```

### 7.4 Fog and volumetrics

```ts
export interface AuraHeightFogSpec {        // contract C-07-OUT-2 (PRD 10 AuraBiomeRig.fog)
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
// decals.* (Decals.ts) keeps its public signatures; changes:
//   AURA_DECAL_MAX_DECALS is removed; capacity = tier cap (§6.9), oldest evicted, diagnostics count evictions.
export interface AuraDecalOptions {        // additive fields
  readonly sprite?: AuraVfxSpriteSource | AuraVfxBuiltinDecal;
  readonly normalStrength?: number; readonly roughness?: number;          // lit decal channels
  readonly blend?: "alpha" | "multiply";
  readonly life?: number; readonly fadeOut?: number;
}
export type AuraVfxBuiltinDecal = "scorch-a" | "scorch-b" | "crack-a" | "crack-b" | "bullet-hole" | "splat-a" | "splat-b"
  | "tyre-track" | "footprint" | "puddle";
// app.effects.decal(at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle
```

### 7.7 Runtime mutation and imperative effects

```ts
export interface AuraRuntimeNodeRegistry {           // extended (E26)
  get(id: string): AuraRuntimeNodeHandle | undefined;
  require(id: string): AuraRuntimeNodeHandle;
  has(id: string): boolean;
  ids(): readonly string[];
  all(): readonly AuraRuntimeNodeHandle[];
  add(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
}
export type AuraVfxKind =
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
    | { readonly type: "camera"; readonly at?: number; readonly shake?: number; readonly punch?: number })[];  // forwarded to PRD 08
}
export interface AuraEffectInstanceHandle { readonly id: string; readonly alive: boolean; stop(options?: { readonly immediate?: boolean }): void;
                                            setPosition(p: AuraVec3): void; setDirection?(n: AuraVec3): void }
export interface AuraAppEffects {                    // app.effects  (contract C-07-OUT-1)
  burst(kind: AuraVfxKind, position: AuraVec3, options?: { readonly count?: number; readonly speed?: number; readonly scale?: number;
        readonly color?: AuraColor; readonly normal?: AuraVec3; readonly seed?: number; readonly intensity?: number }): AuraEffectInstanceHandle;
  spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { readonly node: string; readonly socket?: string },
        options?: { readonly seed?: number; readonly scale?: number; readonly color?: AuraColor; readonly normal?: AuraVec3 }): AuraEffectInstanceHandle;
  trail(target: string | { readonly node: string; readonly socket?: string }, options: Parameters<typeof effects.trail>[0]): AuraEffectInstanceHandle;
  decal(at: { readonly position: AuraVec3; readonly normal: AuraVec3; readonly target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle;
  readonly presets: Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  readonly liveCount: number;
  clear(): void;
}
export interface AuraAppAtmosphere {                 // app.atmosphere
  setFog(spec: AuraHeightFogSpec | null, options?: { readonly transitionSeconds?: number }): void;
  setSky(spec: Partial<AuraSkySpec>, options?: { readonly transitionSeconds?: number }): void;
  setWetness(value: number, options?: { readonly transitionSeconds?: number }): void;
  state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number };
}
```

### 7.8 Game juice

```ts
export interface GameEffectsOptions { /* existing */ readonly pool?: number;
  readonly app?: AuraApp;                       // new: bind to app.effects
  readonly autoMount?: boolean;                 // default true
  readonly legacyPrimitiveNodes?: boolean;      // default false; true restores effectToSceneNode output for one minor
}
// GameEffectsController: spawn* methods unchanged; update(dt) is driven by the bound app loop;
// nodes(): readonly AuraSceneNode[]  — @deprecated; [] when bound unless legacyPrimitiveNodes.
// GameEffectKind → AuraVfxKind mapping: hit-spark→spark, block-spark→spark(blue, 0.6×), impact-decal→impact-decal,
// ground-dust→dust, dash-trail/slash-trail→streak, impact-flash→impact-flash, aura-burst→aura-burst,
// shockwave/ring-shockwave→ring, super-flash→super-flash.
// gameFeel.create({ app?, autoMount? }) forwards to the same binding; damageFlash/speedLines/landingDust map to
// impact-flash (+PRD 08 screen flash), PRD 03 speed streak request, dust.
```

### 7.9 Rendering package (`@aura3d/rendering`)

```ts
export interface ParticleBatchDescriptor {
  readonly key: string; readonly capacity: number; readonly source: "cpu" | "gpu" | "procedural" | "compute";
  readonly atlas: Texture; readonly blend: BlendMode /* PRD 01 */; readonly shading: "unlit" | "lit";
  readonly softDepth: boolean; readonly stretch: boolean; readonly frameBlend: boolean;
}
export class ParticleBatchPass implements RenderPassLike {
  constructor(device: RenderDevice, options: { readonly depth: SceneDepthSource; readonly maxBatches?: number });
  upsertBatch(desc: ParticleBatchDescriptor): ParticleBatchHandle;
  writeInstances(handle: ParticleBatchHandle, data: Float32Array, liveCount: number): void;    // 16 floats / particle
  bindGpuState(handle: ParticleBatchHandle, state: ParticleGpuSimState): void;
  collectTransparentItems(camera: CameraLike, out: TransparentQueueItem[]): void;              // sorted with transparents
  dispose(): void;
}
export interface SceneDepthSource {                 // C-07-IN-2
  readonly texture: Texture | null;                 // sampleable depth (raw) after opaque, single-sample
  readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
  readonly available: boolean;
}
export class SkyBackgroundPass implements RenderPassLike {
  constructor(device: RenderDevice);
  setSpec(spec: AuraSkySpec, time: number): void;
  renderToCubeFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Mat4): void;   // PRD 02 capture
  horizonRadiance(azimuthSamples: 8): Float32Array;   // fog colour source
}
export class VolumetricFogPass implements RenderPassLike {
  constructor(device: RenderDevice, options: { readonly grid: readonly [number, number, number]; readonly temporal: boolean });
  update(input: { readonly fog: AuraVolumetricFogSpec; readonly camera: CameraLike; readonly shadow?: ShadowLookup;
                  readonly lights: readonly CollectedLight[]; readonly depth: SceneDepthSource; readonly time: number }): void;
  readonly volume: Texture3D | null;                // sampled by transparents/particles
}
// RenderSource additions (Renderer.ts:246-290):
//   vfx?: { readonly batches: ParticleBatchPass; readonly ribbons: RibbonPass; readonly decals: DecalBatch; readonly meshes: MeshParticleBatch }
//   sky?: AuraSkySpec; fog?: ResolvedFogUniforms; volumetric?: VolumetricFogPass; wetness?: WetnessUniforms
```

### 7.10 Removed or deprecated

| Symbol | Action | When |
|---|---|---|
| `effects.particles` legacy fields (`materialMode`, `texturedBillboard`, `emitter`, `radius`, `height`, `particleCount`, `emissionRate`, `groundCollision`, `lifetimeColorRamp`, `velocityOverLife`, `turbulence`) | kept, mapped to new fields (§11), `@deprecated` JSDoc | removed next major |
| `GameEffectsController.nodes()`, `GameFeelController.nodes()` | deprecated | next major |
| `planSkyBackdrop` | deprecated, emits a dev warning pointing to `sky.gradient` | next minor+1 |
| `createProceduralSkyDome`, `createEnvironmentStage` sky dome | removed from root exports | Phase 7 |
| `RootGpuParticleWorkload`, `createRootGpuParticleWorkload` | removed | Phase 7 |
| `cinematic/*` descriptors (E42) | removed | Phase 7 |
| `collectParticleBudgetDiagnostics().gpuReady`, scene-kit evidence strings (E18) | replaced by observed values | Phase 1 |
| `AURA_DECAL_MAX_DECALS` | removed (tier cap) | Phase 6 |

---

## 8. Shader changes

GLSL ES 3.00 shown; WGSL ports live beside each file and follow PRD 11. All VFX shaders include PRD 01's `common`
chunk (camera UBO, exposure-free linear output) and write `o_reactive` (PRD 03 `color2`).

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
  vis = a3dSunShadowAt(P);                                   // PRD 02 lookup (C-07-IN-6)
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

Defines entering the PRD 11 program key: `PARTICLE_SOURCE` (cpu|gpu|procedural), `STRETCH`, `SHADING_LIT`,
`PARTICLE_SHADOW`, `SOFT_PARTICLES`, `FRAME_BLEND`, `BLEND_ADDITIVE`, `FOG_VOLUMETRIC` (fog from the 3D volume instead of
analytic). Maximum distinct particle programs per app: 12 (diagnosed above that).

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
// fullscreen pass, MRT: o_pos (xyz, age), o_vel (xyz, seed); one texel per particle
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

### 8.4 Height fog chunk (`a3d_fog`, replaces `ShaderChunks.ts:472-517`)

```glsl
uniform vec4 u_fogA;   // σ_d, σ_h, b, h0
uniform vec4 u_fogB;   // start, maxOpacity, sunInscatter, anisotropy g
uniform vec3 u_fogColor; uniform vec3 u_fogAbsorption; uniform int u_fogMode;  // 0 off,1 height,2 exp,3 exp2,4 linear,5 absorption
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

`u_fogColor` is linear and, for `color: "sky"`, set per frame from `SkyBackgroundPass.horizonRadiance` at the camera
azimuth (CPU interpolation of 8 samples). The background pass calls `a3dApplyFog` at
`u_cameraPosition + v · backgroundDistance` when `affectsBackground`.

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
`smoothstep` edges are not used, `acos` input clamped). 8-bit banding is avoided because the output is HDR float and
PRD 01 OutputPass dithers.

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
- Decal fragment: sample albedo (premultiplied), normal (RG → reconstruct Z), roughness; TBN from projected tangent
  frame; feed PRD 01 `brdf` with metallic 0; output alpha or multiply blend; `a3dApplyFog` last.
- `a3d_wetness`: as §6.8; uniforms `u_wetness`, `u_puddleThreshold`, `u_rainRipples` (atlas frame), `u_snowCover`;
  world-space puddle noise `texture(u_puddleNoise, worldPos.xz / 6.0).r`.

---

## 9. Rendering changes (frame level)

1. Opaque forward unchanged except for the `a3d_fog` chunk and optional `A3D_WETNESS`.
2. After opaque: `SceneDepthSource` is made available (shared resource when present; PRD 07 stub otherwise: blit the
   resolved depth into a single-sample `DEPTH_COMPONENT24` texture, 1 blit, ≈ 0.05 ms at 1080p).
3. Background: one of sky / environment / colour, at far plane with `LEQUAL`, depth write off.
4. Volumetric (High/Ultra): inject (N slice draws) → temporal (Ultra) → integrate → apply composite.
5. Decals (lit, after opaque, before transparents).
6. Transparent queue: transparent meshes, water (PRD 10), particle batches, ribbons, beams, alpha mesh particles, all
   sorted by item distance; additive batches anywhere after opaque.
7. GPU sim passes for the next frame run at the start of the frame before shadows (state from frame N-1), so the draw
   never waits on the sim.
8. Post (PRD 03). PRD 03 S4 screen-space god rays may run on Medium in addition to analytic fog.
9. Safe-basic WebGL2 renderer: the same `ParticleBatchPass` (CPU source, unlit, no soft depth), sky (sky-view texture)
   and fog chunk replace the octahedron/GL_LINES models (E5) and the 3-band backdrop. The Canvas2D path remains a
   labelled diagnostic and is never counted as rendering.

Note on `alpha` blend: atlases are premultiplied, so the particle pipeline implements `alpha` as premultiplied output
with `rgb·a` precomputed on the CPU for untextured colours; the distinct device `alpha` mode is used only by decals.

---

## 10. Migration plan

1. **Honesty first (Phase 0, no visual change).** Replace the blanket warning (`index.ts:13722-13723`) with per-node
   `EFFECT_ZERO_PIXELS` errors. Replace `gpuReady` and scene-kit evidence strings with observed counts. Correct
   `apps/showcase-webgpu-particle-lab/src/main.ts:318` and its README claim. Hand the true API facts to PRD 13 for the
   skills (§3 item 6) with the date each capability lands.
2. **Engine behind `renderer.vfx: "v2"`** (`createAuraApp({ renderer: { vfx: "v2" } })`, default `"v1"` until the Phase 4
   exit, then default `"v2"`, then the flag is removed in Phase 7). Under `"v1"`, nothing changes. Under `"v2"`, effect
   nodes lower to the new passes, `sky` nodes draw, fog uses `a3d_fog`.
3. **Builders keep signatures.** `effects.particles/rain/snow/flipbook/beam`, `sky.dayNight`, `weather.*`, `decals.*`
   keep their call shape; legacy fields are mapped (§11). Routes that call them start drawing pixels without code edits.
4. **Games migrate through PRD 14 waves** (route edits owned by PRD 14; this PRD supplies the replacements):
   - Route-local spark/burst pools (E25) → `app.effects.burst` (or PRD 09 `fx.burst` on backend `"particle-pass"`).
   - Box-slab and band skies (E35, E32: Rooftop, Skyline, Patrol, Pulse) → `sky.preetham` / `sky.gradient`.
   - Turbo `driftParticleCloud` (`main.ts:2612-2640`) and box skid marks (`:5163-5184`) → lit `smoke-a` emitter with
     emission ∝ slip, `orientation: "surface"` ribbons.
   - Deep Recovery `effects.volumetricFog` (`main.ts:280-285`) → `effects.fog({ mode: "absorption", ... })` +
     `effects.volumetricFog` (froxel on High+) + marine snow procedural volume (3,000 High / 800 Low, PRD 14 §8.3).
   - Skyline act fogs (E43) work unchanged once fog is live; snow level gets `weather.snow`.
   - Blockfall `clear-fx.ts` 48 box shards → `explosion-small`/`spark` bursts + `ring`.
5. **Benchmark adapter** (`benchmarks/quality-rebuild/aura3d/common.ts:232-242`) maps spec `seed`, `size` and
   `blending: "additive"` to the new options and deletes the `particles:seeded-positions` / `particles:sprite-size`
   capability-log entries once honoured; maps `background.kind: "sky"` scenes to `sky.preetham`.
6. **Deletion (Phase 7)** after all 18 games and templates are off the deleted symbols (grep gate in CI:
   `rg "planSkyBackdrop|RootGpuParticleWorkload|cinematic/|nodes\(\)" apps templates examples` returns only allowlisted
   lines).

## 11. Backward compatibility

| Surface | Old behaviour | New behaviour | Compatibility path | Visible change |
|---|---|---|---|---|
| `effects.particles({...})` legacy fields | zero pixels on production | renders | `materialMode` → preset (§6.3.1); `emitter: "fountain"|"swirl"|...` → shape+velocity preset; `radius/height` → shape size; `particleCount` → `maxParticles` (tier-clamped, reported); `emissionRate` → `rate`; `lifetimeColorRamp` → `colorOverLife`; `velocityOverLife` → `speedOverLife`; `turbulence/noise` → `noise.strength/frequency`; `texturedBillboard: false` → `sprite: "soft-dot"` untextured disc | Particles appear where games declared them (Turbo, Pulse, data-galaxy, particle-lab). Pulse emits only under `visualReviewCapture` (08 §2.2), so PRD 14 must decide whether to keep them in play |
| `effects.rain/snow` | zero pixels; `weather.precipitation` drew static boxes | falling procedural volume | same options; `particleCount` honoured within cap | rain/snow animate |
| `effects.flipbook/beam` | withheld | renders | `spriteColumns/spriteRows/frameRate` honoured; without `texture`, `fireball` sequence | flipbooks appear |
| `effects.fog` | exp2, `maxOpacity ≤ 0.525` default, static | height mode default; explicit `density` keeps exp2 with `maxOpacity = 1` | `legacyOpacityCap: true` for one minor | far geometry fogs fully; 17 games need density re-check (PRD 14) |
| `effects.volumetricFog` | CPU radial blur, 0.5 fps | analytic (Low/Med), froxel (High/Ultra) | same options; `color` now honoured | Deep Recovery becomes playable; look changes |
| `sky.dayNight` | primitives + background colour | one sky node + light | return shape preserved | spheres disappear; real sky |
| `planSkyBackdrop` | bands | deprecated; still works for one minor | dev warning | none until removed |
| `game.effects` / `gameFeel` | data only | auto-mounted, impact library | `legacyPrimitiveNodes: true` restores primitive nodes for routes that did mount them (none known) | hit VFX appear in Courier, Neon, Skyline, Turbo |
| `decals.*` | max 32, one draw each | tier cap, batched, lit | same API | decals look lit (normal/roughness) |
| `AuraRuntimeNodeRegistry` | read-only | `add/remove` added | additive | none |
| safe-basic renderer | octahedrons, GL_LINES, 3-band backdrop | shared pass + sky-view + fog chunk | none needed | fallback looks like production at lower quality |

## 12. Contracts consumed / provided

IDs are proposals for `CONTRACTS.md`. Each consumed contract lists the stub this PRD uses until the provider lands.

### Consumed

| ID | Provider | Interface needed | Stub until available |
|---|---|---|---|
| C-07-IN-1 | PRD 01 | `RenderState.blend: BlendMode` with `opaque | alpha | premultiplied | additive | multiply` (PRD 01 §6.8 table) on WebGL2 and WebGPU; HDR RGBA16F scene target | `vfx/BlendModes.ts` adapter: when `BlendMode` is absent, every batch renders with the existing alpha-over (`blend: true`), additive sequences switch to their premultiplied variant, and diagnostics report `VFX_BLEND_FALLBACK`. No edits to device files by this PRD |
| C-07-IN-2 | PRD 01 / PRD 03 / PRD 04 (shared `SceneDepthCopy`) | sampleable single-sample depth of the opaque pass, available to transparent draws, plus near/far/projection type | `vfx/SceneDepthSource.ts` stub: blit resolved depth into an owned `DEPTH_COMPONENT24` texture after opaque; removed at integration |
| C-07-IN-3 | PRD 01 (`Renderer`/`ForwardPass`) | render-phase hooks `afterOpaque`, `background`, `transparentItems` (items sorted with other transparents) | stub: PRD 07 passes run after `ForwardPass` completes (particles drawn after all transparents; water/transparent interleave wrong, documented) |
| C-07-IN-4 | PRD 01 | instanced program feature with per-instance `mat4` + colour + emissive (mesh particles), shader chunk inclusion (`A3D_WETNESS`, `a3d_fog`) in the program generator | stub: PRD 07-owned Lambert + SH mesh-particle shader; wetness not applied |
| C-07-IN-5 | PRD 02 | `a3dSampleIrradianceSH(N)` GLSL function + uniform block; `environments.capture({ include: "sky-only" })` that calls a `renderFace(face, target, viewProjection)` callback (PRD 02 `fromScene`); background precedence fields `AuraEnvironmentBackgroundOptions.visible` | stub: hemisphere colour pair from the sky's zenith/horizon; no sky→IBL capture (lighting stays as today) |
| C-07-IN-6 | PRD 02 | `a3dSunShadowAt(vec3 worldPos)` (cascade-selected, filtered) usable in vertex and fragment stages of non-forward passes; cascade UBO | stub: visibility 1 (no shafts, no shadowed smoke) |
| C-07-IN-7 | PRD 06 | `node.socket(bone)` live world matrix for trails/emitters | stub: attach to node root transform |
| C-07-IN-8 | PRD 03 | `color2` reactive-mask attachment and location 2 output convention; S4 god rays for Medium; bloom threshold 1.0 on HDR | stub: location 2 output compiled out when the attachment is absent |
| C-07-IN-9 | PRD 11 | tier id + caps (particle budget, soft-depth on/off, volumetric mode/grid), `RendererTiming` GPU ms, program-key defines registry | stub: local tier table copied from PRD 11 §6 (Low 2k/Med 10k/High 50k/Ultra 100k), `quality` from existing profile |
| C-07-IN-10 | PRD 15 | `NodeHandler<AuraEffectNode>` / `AuraSkyNode` registration in `compiler/handlers.ts`; `updateCompiledScene` version counters for `nodes.add/remove` | stub: lowering called from the bridge directly (§6.3.1) |
| C-07-IN-11 | PRD 10 | `heightAt(x, z)` for splashes/collision, optional `occluderHeightAt` top-down map | stub: `groundHeightAt` option or `y = 0` |

### Provided

| ID | Consumer(s) | Interface |
|---|---|---|
| C-07-OUT-1 | PRD 09, PRD 08, PRD 14 | `app.effects` (`AuraAppEffects`, §7.7): `burst/spawn/trail/decal`, presets for all PRD 09 `GameFxKind`s; flips PRD 09 backend default to `"particle-pass"` in the PR that lands Phase 2 |
| C-07-OUT-2 | PRD 10, PRD 14 | `AuraSkySpec`, `AuraHeightFogSpec` types (§7.3, §7.4), `a3dApplyFog(color, worldPos)` chunk, absorption fog mode, `a3d_wetness` chunk + `app.atmosphere.setWetness`, `RenderSource.sky` semantics, sky draw "after opaque, LEQUAL at far plane" |
| C-07-OUT-3 | PRD 05, PRD 13 | `AuraVfxAtlasManifest` v1 (§7.1) and built-in sequence names; validation `aura3d assets validate --type vfx-atlas` rules (premultiplied, gutter ≥ 1 cell px, power-of-two page) |
| C-07-OUT-4 | PRD 02 | `SkyBackgroundPass.renderToCubeFace` for sky-only capture; sky change events (sun moved > 0.5°) to trigger re-capture |
| C-07-OUT-5 | PRD 15 | `AuraRuntimeNodeRegistry.add/remove` semantics (§6.3.2) to re-host on the compiler |
| C-07-OUT-6 | PRD 15 | effect/sky node handlers written in handler-table shape; `option-coverage` entries for every new builder field |
| C-07-OUT-7 | PRD 11 | program-key defines (`PARTICLE_SOURCE`, `STRETCH`, `SHADING_LIT`, `PARTICLE_SHADOW`, `SOFT_PARTICLES`, `FRAME_BLEND`, `BLEND_ADDITIVE`, `FOG_VOLUMETRIC`); the WebGL2 GPU-sim path and one documented workload it cannot reach (PRD 11 §6 item 3) |
| C-07-OUT-8 | PRD 12 | `prd07-*` scene specs (§17) and `diagnostics().effects` / `.atmosphere` observed fields for capture reports |
| C-07-OUT-9 | PRD 13 | skill facts: which builders render on which tier, impact-library kinds, sky/fog defaults |

## 13. Parallel execution

- **Owned files:** everything under "Create" in §5; in `index.ts` the line ranges listed in §5 for `effects.*`, `sky`,
  `weather`, fog resolution, the registry interface, the warning line, render-source `vfx/sky/fog` fields and the
  safe-basic particle/rain models; `GameRuntime.ts:1150-1171, 2800-2879, 3879-3915`; `GameFeel.ts`; `Decals.ts`;
  `LayeredSceneComposition.ts:503-543`; `ShaderChunks.ts:472-517`; `effects/*`.
- **Shared-file protocol:** `index.ts` and `Renderer.ts` are edited by several PRDs. This PRD keeps its changes to new
  functions in new files (`production-runtime/effects/*`, `agent-api/vfx/*`) and to ≤ 12 call-site lines in `index.ts`
  and ≤ 8 in `Renderer.ts`, each marked `// PRD07:` so rebases are mechanical. No reformatting of shared files.
- **Not touched:** `WebGL2Device.ts`, `LeanWebGL2Device.ts`, `WebGPUDevice.ts`, `WebGL2StateCache.ts`, `Material.ts`,
  `RenderDevice.ts` (PRD 01); `EnvironmentBackgroundPass` shader content and IBL (PRD 02); post graph (PRD 03).
- **Stubs used:** C-07-IN-1…11 stubs (§12). Each stub lives in one file, is exported only internally, and carries
  `// PRD07-STUB: remove when <contract id> lands` for a grep gate.
- **Feature flag:** `renderer.vfx: "v1" | "v2"` (§10). Benchmark and capture runs set `"v2"` explicitly until the default
  flips.
- **Integration checkpoints:**
  - IC-1 (after PRD 01 Phase 2 blend modes): switch `BlendModes.ts` to `BlendMode`; re-run `prd07-particles-additive`
    and 14-particles; additive criteria in §17.2 become evaluable.
  - IC-2 (after PRD 01/03 depth resource): delete the depth stub; soft-particle scenes re-captured.
  - IC-3 (after PRD 02 SH + capture + shadow lookup): lit particles, sky→IBL, froxel shafts evaluated (§17.2).
  - IC-4 (after PRD 15 compiler): lowering moved into `handlers.ts`; `nodes.add/remove` re-hosted.
  - IC-5 (PRD 09 Phase 3 merged): FX backend default flips to `"particle-pass"`.
  - IC-6 (PRD 14 waves): per-game integrated acceptance (§17.2).

## 14. Implementation phases

Each phase merges behind `renderer.vfx: "v2"` unless stated. "Capture" = remote GH Actions macos-14 run of
`.github/workflows/prd07-vfx.yml` (and the shared `quality-rebuild-capture.yml` once `prd07-*` scenes are registered by
PRD 12). No phase exits on unit tests alone.

| # | Phase | Scope | Exit criteria |
|---|---|---|---|
| 0 | Honesty + contracts | `EFFECT_ZERO_PIXELS` error; observed diagnostics; particle-lab claim fix; contract stubs; flag plumbing; benchmark adapter fields | Unit tests green; a capture of 14-particles on `"v1"` reports `EFFECT_ZERO_PIXELS` for the fountain node in `report.json`; no pixel change in the 18-game capture (SSIM ≥ 0.999 vs run 37289688772 frames on the same sha + this change) |
| 1 | Particle core | instance layout, `ParticleBatchPass`, CPU feeder, sort, soft depth (stub), flipbook, built-in atlas v1 (bake tool), lowering of `particles/flipbook/rain/snow` (CPU) | 14-particles standalone criteria §17.1 S1 pass; `prd07-flipbook`, `prd07-soft-particles` pass; perf §18 Medium budget met in `prd07-particles-stress` |
| 2 | Runtime + juice | `app.nodes.add/remove`, `app.effects`, impact library, `game.effects`/`gameFeel` auto-mount, ribbons/trails, beams, light cones, mesh particles, transient lights | `prd07-impact-library` sheet S4 passes; juice harness: a `game.effects().hitSpark()` with no `nodes()` call produces ≥ 0.15% canvas pixels within 3 frames; zero remounts during 200 add/remove cycles (physics body count stable) |
| 3 | Sky | `SkyBackgroundPass` (preetham, gradient, stars, moon, clouds), background precedence, `sky.dayNight` rewrite, sky-view texture for Low, `planSkyBackdrop` deprecation, sky capture adapter (stubbed until IC-3) | `prd07-sky-timeofday` and 09 sky criteria S5/S6 pass; `skyVariance` > 0 in every sky frame (PRD 12 detector) |
| 4 | Fog | `a3d_fog` integrated height fog, absorption, fog volumes, live fog + transitions, defaults, fog on background and VFX, `"sky"` colour; remove CPU volumetric from production | `prd07-fog-height`, `prd07-fog-transition` pass; 09-outdoor fog criterion S7; Deep Recovery desktop p50 frame ≤ 50 ms on the runner with `volumetricFog` analytic; **default flips to `"v2"`** |
| 5 | GPU sim + weather + volumetric | WebGL2 ping-pong sim, procedural volumes, splashes, wetness/snow chunk (stub until IC-1/C-07-IN-4), lightning, froxel volumetric High/Ultra | `prd07-rain-night`, `prd07-snow`, `prd07-volumetric-shafts` pass (shafts integrated after IC-3); 50k-particle `prd07-particles-stress` High budget met |
| 6 | Decals + polish | `DecalBatch` lit decals, tier caps, surface ribbons, aurora ribbon, optional half-res particle buffer for overdraw | `prd07-decals` passes; Turbo skid-mark integrated criterion evaluable |
| 7 | Deletion + docs | delete §5 list; remove flag; grep gate; skill facts to PRD 13 | grep gate clean; full 18-game + benchmark capture with no new regression > PRD 12 thresholds; `EFFECT_ZERO_PIXELS` count 0 across all shipped routes |

## 15. Task checklist

### Phase 0: honesty, contracts, flag

- [ ] `packages/engine/src/production-runtime/effects/EffectDiagnostics.ts`: `trackEffectDraws(nodeId, drawCalls, instances)`
  and `endFrame()` that increments `zeroPixelFrames` for visible, in-frustum effect nodes with 0 draws and pushes
  `{ code: "EFFECT_ZERO_PIXELS", nodeId }` to `diagnostics().effects.errors` at 30 frames; dev builds `console.error` once
  per node. Test `tests/unit/engine/effects/zero-pixel-diagnostic.test.ts`: a scene with `effects.particles()` on
  `vfx: "v1"` with a `MockRenderDevice` reports the error after 30 `app.step(1/60)` calls; a fog node never reports it.
- [ ] `index.ts:13722-13723`: delete the blanket warning; call `EffectDiagnostics` from the bridge frame loop.
- [ ] `index.ts:8344-8360`: `collectParticleBudgetDiagnostics` returns `{ declared, observedLive, observedDraws }`; drop
  `gpuReady`. `index.ts:9683, 9756, 9795-9796`: replace evidence strings with `"declared particle layers; see
  diagnostics().effects for observed draws"`. Update the snapshot tests that assert the old strings.
- [ ] `apps/showcase-webgpu-particle-lab/src/main.ts:318` and its README: replace the claim with
  `"Particles render through effects.particles when renderer.vfx is v2"`.
- [ ] `createAuraApp` options: add `renderer.vfx?: "v1" | "v2"` (default `"v1"`), surfaced in `diagnostics().renderer.vfx`.
  Test: default `"v1"`, explicit `"v2"` reported.
- [ ] Create stub files with `// PRD07-STUB` markers: `vfx/BlendModes.ts` (C-07-IN-1), `vfx/SceneDepthSource.ts`
  (C-07-IN-2), `vfx/PhaseHooks.ts` (C-07-IN-3), `vfx/shaders/mesh-particle-stub.glsl.ts` (C-07-IN-4),
  `atmosphere/IrradianceStub.ts` (C-07-IN-5), `atmosphere/ShadowLookupStub.ts` (C-07-IN-6), `vfx/TierCaps.ts` (C-07-IN-9).
  Add `tools/quality-gate` grep listing remaining stubs in CI output (informational until Phase 7, failing after).
- [ ] `benchmarks/quality-rebuild/aura3d/common.ts:232-242`: pass `seed`, `size` (→ `size`), `blending` (→ `blend`) and
  `count` (→ `maxParticles` + one burst at t=0 with `prewarm: true`) to `effects.particles` when `vfx: "v2"`; keep the
  capability-log entries when running `"v1"`.

### Phase 1: particle core

- [ ] `vfx/ParticleInstanceLayout.ts`: constants (16 floats/particle, attribute offsets), `createQuadGeometry()` cached
  VAO, `ParticleInstanceRing` (3 VBOs, `write(data, live)` with `bufferSubData`, `bufferData(null)` orphan on resize).
  Test: 1,000 writes allocate 0 JS arrays after warm-up (heap snapshot count via `performance.memory` stub on Mock).
- [ ] `vfx/ParticleBatch.ts` + `ParticleBatchPass.ts`: batch keying per §6.2.2, `collectTransparentItems` emitting one
  item per batch with bounds-centre distance. Test (Mock device): two additive emitters with the same atlas → 1 draw;
  one additive + one premultiplied → 2 draws; premultiplied emitters 20 m apart in depth → 2 items correctly ordered.
- [ ] `vfx/ParticleSort.ts`: LSD radix sort on 16-bit depth keys into a `Uint32Array` permutation; skip when camera
  delta below thresholds. Test: matches a reference `Array.sort` order for 10,000 random particles; 0 allocations.
- [ ] `effects/ParticleSystem.ts`: add `writeInstances(out: Float32Array, camera): number` writing the §6.2.1 layout
  directly (sizes/colours/frames over life evaluated); keep `buildBatch` only for the legacy no-op target until Phase 7.
  Test: `seed` 1414 with 2,000 particles produces identical buffers across two runs.
- [ ] `vfx/shaders/particle.glsl.ts`: shader per §8.1 with the listed defines; compile test in
  `tests/browser/vfx/particle-shader-compile.spec.ts` (all define combinations compile on WebGL2).
- [ ] `vfx/VfxAtlas.ts`: load manifest + KTX2/PNG page, expose `sequence(name)`; default page by tier (1k Low/Medium,
  2k High/Ultra). Test: every `AuraVfxBuiltinSequence` resolves; rect within page; gutter ≥ 1 px per cell at mip 0.
- [ ] `tools/vfx-atlas-bake/`: `bake.mjs --seed 7 --size 2048` writes `packages/engine/assets/vfx/*`; deterministic
  (two runs → identical sha256, asserted in `tests/unit/tools/vfx-atlas-bake.test.ts` at 256 px to keep CI fast). Runs on
  the remote runner for full size; outputs committed.
- [ ] `production-runtime/effects/EffectNodeLowering.ts`: `lowerEffectNode(node, ctx)` for `particles`, `flipbook-sprite`,
  `rain`, `snow` (CPU source in Phase 1) with the legacy field mapping table (§11). Test
  `tests/unit/engine/effects/legacy-particle-mapping.test.ts`: each legacy field changes the resulting emitter options
  (option-sensitivity, PRD 15 style).
- [ ] `production-runtime/effects/ProductionEffectSystem.ts`: owns emitters, steps them on the app clock (fixed step,
  `app.step` deterministic), writes batches, reports diagnostics. Wire one call in `createProductionRuntimeSceneRenderer`
  (`// PRD07:`) and one in the render-source build (`index.ts:13990-14005`) adding `vfx`.
- [ ] Safe-basic: replace `createWebGLParticleModel` / `createWebGLRainModel` (`index.ts:16517-16600`) calls at
  `:16000-16006` with `ParticleBatchPass` (unlit, no soft depth) behind `vfx: "v2"`.
- [ ] Browser test `tests/browser/vfx/particles-production.spec.ts` (remote macos-14): `effects.particles({ seed: 1414,
  maxParticles: 2000, blend: "additive", color: "#ff9a3c", size: 0.06 })` on production → ≥ 1.5% of pixels with
  `R - B > 15` in the fountain region, `diagnostics().effects.nodes[0].drawCalls ≥ 1`, `errors.length === 0`.

### Phase 2: runtime mutation, juice, trails, beams, mesh particles

- [ ] `index.ts:10664-10670`: extend `AuraRuntimeNodeRegistry` with `add/remove` (§7.7). Implementation in
  `production-runtime/effects/RuntimeNodeMutation.ts`: patch `renderSnapshot`, register handle, create render items for
  the subtree only, register declared bodies for the subtree only, notify the bridge. Test
  `tests/unit/agent-api/runtime-node-add-remove.test.ts`: 200 add/remove cycles of a primitive with a body leave
  `physics.bodyCount` unchanged and never call `mountCurrentScene` (spy); removed handle `.alive === false`.
- [ ] `agent-api/vfx/effects-api.ts`: `app.effects` (§7.7) with pooled `EffectInstance`s per spec, `liveCount`,
  `clear()`. Test: 1,000 `burst("spark")` calls over 10 s keep pool size ≤ tier cap and live particles ≤ budget.
- [ ] `agent-api/vfx/presets.ts`: the 14 kinds in §6.4 as `AuraVfxEffectSpec` data; `registerPreset`. Test: every
  `AuraVfxKind` and every PRD 09 `GameFxKind` resolves to a preset with ≥ 1 emitter layer.
- [ ] `GameRuntime.ts:2800-2879`: `createGameEffects({ app?, autoMount?, legacyPrimitiveNodes? })`; spawns forward to
  `app.effects.spawn` with the kind mapping (§7.8); realm pending-list adoption on mount; `GAME_EFFECTS_UNBOUND` error
  when 0 or ≥ 2 apps live. `GameRuntime.ts:3879-3915` `effectToSceneNode` used only when `legacyPrimitiveNodes`.
  Tests: `tests/unit/engine/game-feel.test.ts` updated; new `game-effects-automount.test.ts` (no `nodes()` call → the
  app's `diagnostics().effects.liveParticles > 0` after `hitSpark`).
- [ ] `GameFeel.ts`: `create({ app?, autoMount? })` forwarding; `damageFlash/landingDust/speedLines` mapping (§7.8).
- [ ] `vfx/RibbonBatch.ts` + `RibbonPass.ts` + `shaders/ribbon.glsl.ts`: point rings, camera/surface orientation, width
  and alpha curves; port alpha curve from `ResidentGPUParticleRenderer.ts:503-514`. Test: 48-point trail draws
  94 triangles; `surface` orientation normals equal the provided surface normal.
- [ ] `effects.trail`, `effects.beam` (rewire `index.ts:3671-3689`), `effects.lightCone`, `effects.auroraRibbon` builders
  + lowering. `auroraRibbon` geometry/fragment per PRD 14 §8.2.
- [ ] `vfx/MeshParticleBatch.ts`: CPU sim (gravity, drag, spin, ground bounce, sleep) + instanced draw through C-07-IN-4
  or the stub shader; never calls `createProductionInstanceTransforms`. Test: per-instance scale is honoured
  (regression guard for E17).
- [ ] `production-runtime/effects/TransientLightPool.ts`: pre-allocated point lights per tier (Low 0, Medium 2, High 4,
  Ultra 8) driven by preset `light` layers; intensity 0 when idle. Test: 10 simultaneous explosions use ≤ cap lights,
  oldest recycled.
- [ ] Browser test `tests/browser/vfx/juice-automount.spec.ts`: neon-style scene, `game.effects()` without `nodes()`;
  `hitSpark` at a known position → ≥ 0.15% canvas pixels changed within frames N+1..N+3 in a 64×64 region.

### Phase 3: sky

- [ ] `atmosphere/PreethamSky.ts` + `shaders/sky.glsl.ts`: port per §8.5 with MIT attribution in `LICENSE-THIRD-PARTY`.
  Unit test: CPU reference of the same formula (`PreethamSky.evaluate(dir)`) at 16 directions matches a GPU readback in
  the browser test within 2% (remote).
- [ ] `atmosphere/GradientSky.ts`, `StarField.ts`, `CloudLayer.ts` (r185 cloud block), moon disc with phase.
- [ ] `atmosphere/SkyBackgroundPass.ts`: fullscreen triangle cached at construction; per-pixel on Medium+, sky-view
  256×128 on Low (re-render only when spec changes); `renderToCubeFace`; `horizonRadiance(8)`.
- [ ] `index.ts:3730-3769` `sky.dayNight`: emit one `sky` node + one directional light; no primitives. Add `sky.preetham`,
  `sky.gradient`, `sky.hdri` builders and `AuraSkyNode` kind. Test: `sky.dayNight({ hour: 18 }).nodes` contains no
  `primitive` nodes; `visibleStarCount` preserved semantics.
- [ ] Background precedence in the bridge render-source build: sky node > PRD 02 environment background > colour.
  Test (Mock): with `sky.preetham` + `environments.studio`, `RenderSource.sky` set and `environmentBackground` unset.
- [ ] `atmosphere/SkyCaptureAdapter.ts`: when a sky exists and no environment node, call PRD 02 capture with
  `renderToCubeFace` (stub: no-op + `SKY_CAPTURE_PENDING` info diagnostic).
- [ ] `LayeredSceneComposition.ts:503-543` `planSkyBackdrop`: `@deprecated`, dev warning naming `sky.gradient`.
- [ ] Browser test `tests/browser/vfx/sky-background.spec.ts`: sky region luma std > 6 (non-flat), horizon brighter than
  zenith at noon preset, sun disc pixel luminance pre-tone-map > 10 (read via `app.capture` HDR debug target).

### Phase 4: fog

- [ ] `ShaderChunks.ts:472-517`: replace with `a3d_fog` (§8.4); keep exported symbol names used elsewhere as wrappers.
  Unit test: `tests/unit/rendering/fog-height-integral.test.ts` CPU mirror of `a3dHeightFogTau` vs numeric ray-march
  (1,000 steps) within 1% for 50 random rays, including `v.y ≈ 0` and `b = 0`.
- [ ] `index.ts:12733-12786`: `resolveLiveFog(snapshot, runtimeNodes, time)` picks the last visible fog node each frame,
  applies transitions, computes `"sky"` colour; removes `near 1/far 60` hard-codes and the 0.525 cap (except
  `legacyOpacityCap`). Test: Skyline-style scene with five fog nodes toggled via `setVisible` → resolved density equals
  the visible act's density on the next frame.
- [ ] `effects.fog` defaults (§6.6) in `index.ts:3442-3449`; legacy `density`-only calls keep exp2. Test: default fog at
  10/50/100 m horizontal from 1.6 m within ±1.5% of 7/37/62%.
- [ ] `atmosphere/FogVolumes.ts`: ray/box and ray/ellipsoid segment length; `effects.fogVolume`. Test vs numeric march.
- [ ] Absorption mode wiring for PRD 10 underwater; test: `T = exp(-σ·d)` per channel at 10 m for σ = (0.42, 0.11, 0.07).
- [ ] Background fog: `SkyBackgroundPass` and solid-colour path call `a3dApplyFog` at `backgroundDistance` when
  `affectsBackground`. Browser test: fogged horizon pixel and fogged far-plane geometry pixel differ by ≤ 3/255.
- [ ] Remove CPU `volumetric-light` from production in `Renderer.ts:1245-1262` (only `cpu-deterministic`), coordinated
  with PRD 11's interim task (`index.ts:12805-12825`); whichever lands first owns the edit, the other rebases.
- [ ] Flip `renderer.vfx` default to `"v2"` (one-line change + changelog) once the Phase 4 exit capture passes.

### Phase 5: GPU sim, weather, volumetric

- [ ] `vfx/ParticleGpuSim.ts` + `shaders/gpu-sim.glsl.ts` (§8.3): RGBA32F MRT ping-pong, ring emission, curl noise,
  plane/heightfield collision; capability check `EXT_color_buffer_float` else CPU fallback with `PARTICLE_GPU_UNAVAILABLE`
  info. Test (browser): 50,000 particles with gravity only match the CPU integrator positions within 1 mm after 60 steps
  (readback in test only).
- [ ] `vfx/ProceduralVolumeEmitter.ts` + §8.2 chunk: rain, snow, marine snow, dust motes. Test: positions stay within the
  camera volume for 10,000 ids across camera moves of 100 m.
- [ ] `production-runtime/effects/WeatherVolume.ts`: `weather.rain/snow/lightning`; splash CPU emitter using
  `groundHeightAt`; rewrite `weather.precipitation` (`index.ts:3772-3806`) and `weather.wetGround` (`:3807-3843`) to emit
  these nodes. Test: no `primitive` nodes in their output; rain particle y decreases between frames.
- [ ] `atmosphere/shaders/wetness.glsl.ts` (`a3d_wetness`) + uniforms from `AtmosphereWetness.ts`; inclusion via
  C-07-IN-4 (stub: not included, diagnostic `WETNESS_PENDING`).
- [ ] `atmosphere/VolumetricFogPass.ts` + `shaders/volumetric-{inject,integrate,apply}.glsl.ts` per §8.7; tier grid
  from C-07-IN-9; temporal on Ultra. Test (browser): homogeneous fog σ = 0.05 with no light → transmittance at 20 m
  equals `exp(-1)` within 3%; shaft test after IC-3.
- [ ] `VolumetricFog.ts:105-144`: resolve `effects.volumetricFog` to `analytic` or `froxel` by tier; honour `color`.

### Phase 6: decals and polish

- [ ] `vfx/DecalBatch.ts` + `shaders/decal.glsl.ts`: ring-allocated merged geometry per page × blend, lit (§8.8), tier cap,
  life/fade. `Decals.ts`: remove `AURA_DECAL_MAX_DECALS`, route to `DecalBatch`. Test (Mock): 100 decals on one page →
  1 draw; cap eviction order oldest-first.
- [ ] Decal page in the atlas baker (scorch, crack, tyre-track, puddle with normal/roughness).
- [ ] Optional half-resolution particle target for batches flagged `lowRes` (bilateral depth-aware upsample) when
  measured particle GPU ms > tier budget; off by default.

### Phase 7: deletion

- [ ] Delete the §5 "Delete" list and their exports; remove `renderer.vfx` flag (keep accepting the option as a no-op
  with a dev warning for one minor).
- [ ] CI grep gate (§10 item 6) and `PRD07-STUB` gate fail on any remaining match.
- [ ] Hand API facts (C-07-OUT-9) to PRD 13 as a dated table in `docs/project/aura3d-quality-rebuild/CONTRACTS.md`
  under C-07-OUT-9.

## 16. Test requirements

All browser/GPU work runs remotely on GitHub Actions `macos-14` (ANGLE Metal), per policy; nothing runs a local browser.

- **Unit (vitest, `tests/unit/...`, Node + `MockRenderDevice`):** files named in §15; plus
  `tests/unit/rendering/vfx/batch-keying.test.ts`, `particle-sort.test.ts`, `instance-layout.test.ts`,
  `tests/unit/rendering/atmosphere/{preetham-cpu-reference,gradient-sky,fog-height-integral,fog-volumes,froxel-slices}.test.ts`,
  `tests/unit/engine/effects/{lowering,legacy-particle-mapping,zero-pixel-diagnostic,game-effects-automount,runtime-node-add-remove,presets}.test.ts`.
  Run with `pnpm test:unit` (narrow: `vitest run tests/unit/rendering/vfx tests/unit/rendering/atmosphere tests/unit/engine/effects`).
- **Option sensitivity:** every new builder field appears in PRD 15's `compiler/optionCoverage.ts` (or, before IC-4, in
  `tests/unit/engine/effects/option-coverage.test.ts`) and changes the lowered output.
- **Browser (Playwright, `tests/browser/vfx/*.spec.ts`, remote macos-14):** shader compile matrix, particles production,
  juice auto-mount, sky background, fog background match, GPU-sim parity, volumetric transmittance, decal batching draw
  counts (`diagnostics()`), context-loss restore of particle VBOs and sim textures.
- **Capture (remote):** `.github/workflows/prd07-vfx.yml`, `runs-on: macos-14`, steps mirroring
  `quality-rebuild-capture.yml` (pnpm install, Playwright Chromium, `benchmarks/quality-rebuild/capture.mjs --scenes
  14-particles,09-outdoor-environment,17-large-environment,18-game-scene,prd07-*` and
  `tools/quality-rebuild-capture/capture-games.mjs --local-build --games showcase-deep-recovery,showcase-turbo-drift-circuit,showcase-skyline-runner,showcase-blockfall-reactor`
  (switching to PRD 12's `--pr-build` once available)), uploads frames, `report.json` (including `diagnostics().effects/.atmosphere`) and the vision-judge
  records. Triggered on PRs touching owned paths; also `workflow_dispatch`.
- **Determinism:** every capture scene uses `seed` and `app.step` fixed clocks; two runs on the same sha produce frames
  with SSIM ≥ 0.995 (particle scenes) to keep regression baselines meaningful.
- **Performance:** `RendererTiming` GPU ms and rAF p50/p95 recorded per scene; budgets in §18 asserted on the runner as
  relative checks (runner is a paravirtual GPU; absolute tier budgets are validated by PRD 11's device lab).

## 17. Visual acceptance tests

Judging protocol (both sections): frames captured remotely (§16) at 1920×1080, DPR 1, plus 8-frame filmstrips
(`app.step(0.1)` between frames) for anything animated. Two independent vision-model judges score each frame with the
research 21/23 rubric (0–10, same category names: `vfx`, `particles`, `atmospheric_effects`, `overall`); if they differ
by > 1 point a third judge breaks the tie. A human reviewer (program owner or delegate) signs off every criterion
marked **H**. Thresholds are minimums; "three r185" means the same scene built in `benchmarks/quality-rebuild/three/`
with stock three.js r185 (examples/jsm allowed) and judged in the same batch. Engineering metrics (SSIM, detectors,
draw counts) are supporting evidence only and never pass a criterion on their own.

### 17.1 Standalone acceptance (passable by this PRD alone, with its stubs)

| # | Scene / game | Reference | Judged criterion | Threshold |
|---|---|---|---|---|
| S1 | `14-particles` (existing spec, seeded) | three r185 (23: 4/10) | the fountain exists, sprites are soft and round, density reads as ~2,000 particles | Aura `particles` ≥ 5 and ≥ three; PRD 12 `subjectPresence` ≥ 0.8; **H** |
| S2 | `prd07-flipbook`: fireball + smoke flipbook on a ground plane, 8-frame strip | three r185 `Sprite` + `SpriteMaterial` with the same atlas and UV animation | reads as a volumetric explosion evolving into smoke, no frame popping, no square sprite edges | Aura `vfx` ≥ 6 and ≥ three − 0.5 |
| S3 | `prd07-soft-particles`: smoke column intersecting ground and a box, soft on vs off | same scene with `softDistance: 0` | no hard intersection lines; judge prefers soft in a blind A/B | A/B preference 100% (both judges + **H**) |
| S4 | `prd07-impact-library`: contact sheet, 14 kinds × 4 frames (t = 0.03, 0.08, 0.2, 0.5 s) on dark and light backdrops | none (absolute) | each kind reads as its intended effect; none reads as a solid geometric shape (the E21 failure) | ≥ 12 of 14 kinds `vfx` ≥ 6; 0 kinds flagged "primitive shape"; **H** |
| S5 | `prd07-sky-timeofday`: hours 6, 9, 12, 18, 21 with preetham + clouds + stars | three r185 `Sky.js` with identical turbidity/rayleigh/mie/sun and r185 cloud params | sky gradient, sun disc, clouds and night stars read as natural; no banding | per frame Aura `atmospheric_effects` ≥ three − 0.5; banding: no visible steps (judge) and PRD 12 `skyVariance` > 0 |
| S6 | `prd07-outdoor-sky`: benchmark 09 geometry with `sky.preetham` + default height fog (no HDRI) | three r185: same geometry with `Sky` + `FogExp2` tuned to equal 50 m fog | sky, horizon and fogged distance are continuous (no seam), no grey wash on near objects | Aura `atmospheric_effects` ≥ 6; horizon seam judged absent; **H** |
| S7 | `prd07-fog-height`: valley with pillars at 10, 25, 50, 100, 200 m and a hill rising out of low fog | none (absolute) + CPU ray-march reference image for fog amount | aerial perspective increases monotonically; hill top clearer than its base; near pillars keep contrast | judge ≥ 6; measured fog amount per pillar within ±3% of the CPU reference |
| S8 | `prd07-fog-transition` (Skyline act pattern): five fog nodes toggled at t = 1, 2, 3, 4 s | none | each act's fog is visible and transitions smoothly | judge confirms 5 distinct fogs; no single-frame pop when `transitionSeconds > 0` |
| S9 | `prd07-rain-night`: street block, rain intensity 0.7, splashes, 8-frame strip | three r185 instanced-streak rain (`InstancedMesh` + `ShaderMaterial`) | rain falls (displacement between frames), streaks are thin and lit, splashes on ground | Aura `particles` ≥ 6 and ≥ three − 0.5 |
| S10 | `prd07-snow`: snow field, 8-frame strip | three r185 `Points` + `PointsMaterial` with a snowflake map | flakes sway and fall, depth-varied sizes | Aura `particles` ≥ 6 |
| S11 | `prd07-decals`: asphalt with tyre-track surface ribbons, scorch and crack decals | three r185 `DecalGeometry` + `MeshStandardMaterial` with the same atlas | marks sit on the surface without z-fighting, lit consistently with the ground | Aura ≥ three − 0.5 |
| S12 | `prd07-trails-beams`: dash ribbon, contrails, beam, light cone, aurora ribbon | none | ribbons taper smoothly, no twisting at turns, aurora reads as curtains | judge ≥ 6 per element; **H** |
| S13 | `showcase-deep-recovery` with `volumetricFog` → absorption + analytic (Low/Medium path) | its 37289688772 frames | underwater colour falloff present; performance restored | desktop p50 frame ≤ 50 ms on the runner (was 0.5 fps); `atmospheric_effects` ≥ previous (1.5) + 2 |
| S14 | `prd07-particles-stress`: 10k CPU + 50k GPU particles mixed blend | none | no flicker from sort, no popping at emitter boundaries | judge ≥ 6 on the strip; perf per §18 |

### 17.2 Integrated acceptance (evaluated at checkpoints; never blocks starting or merging this PRD)

| # | Checkpoint | Scene / game | Criterion | Threshold |
|---|---|---|---|---|
| I1 | IC-1 (PRD 01 blend + HDR) | `14-particles` additive | overlapping sprites accumulate and bloom via PRD 03 | Aura `particles` ≥ 6.5 and ≥ three r185 + 2; **H** |
| I2 | IC-2 (shared depth) | `prd07-soft-particles` | identical look with the shared resource vs the stub | SSIM ≥ 0.99 between the two |
| I3 | IC-3 (PRD 02 SH/shadow/capture) | `prd07-volumetric-shafts` (hangar with window light, High/Ultra) | shafts follow occluders, haze lit by sun and spots | `atmospheric_effects` ≥ 6.5; **H** |
| I4 | IC-3 | `prd07-lit-smoke` (smoke in sun and shadow) | smoke darker in shadow, rim-lit against the sun | judge ≥ 6.5 |
| I5 | IC-3 | `prd07-outdoor-sky` + chrome/rough spheres | reflections match the visible sky (sky→IBL) | judge "consistent"; `atmospheric_effects` ≥ 7 |
| I6 | IC-5 + PRD 14 wave 1 | Aura Clash, Turbo Drift, Bank Shot, Orbital Defense | hit sparks/explosions/tyre smoke/skids/pocket rings read at gameplay scale | per game `vfx` ≥ 6.5, `particles` ≥ 6.5; **H** |
| I7 | PRD 14 wave 3 | Deep Recovery, Aurora Lander, Patrol Wing, Gravity Post | underwater stack, aurora + starfield, clouds/contrails, space VFX | per game `atmospheric_effects` ≥ 7 (Deep Recovery ≥ 7.5 per PRD 14 §8.3 target) |
| I8 | PRD 14 all waves | all 18 games | category means | VFX mean ≥ 6.5, particles mean ≥ 6.5, atmosphere mean ≥ 6 (from 2.2 / 1.4 / 1.4); no game below 5 in any of the three; **H** |
| I9 | PRD 14 Skyline/Courier | snow level; rain street | weather reads as weather, wet surfaces reflect | `atmospheric_effects` ≥ 6.5 |

## 18. Performance budgets per tier

Budgets are for this PRD's work only, measured with `RendererTiming` GPU ms and rAF on PRD 11 reference devices
(Low = mid-range phone, Medium = integrated laptop GPU at 1080p, High = discrete mid GPU at 1440p, Ultra = high-end
discrete at 1440p/4K). On the CI runner they are checked as relative regressions only.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Live particles, all emitters (PRD 11) | 2,000 | 10,000 | 50,000 | 200,000 (WebGPU) / 100,000 (WebGL2) |
| CPU-simulated live particles (rest GPU/procedural) | 2,000 | 4,096 | 4,096 | 4,096 |
| Particle GPU ms in `prd07-particles-stress` at tier cap | ≤ 0.8 | ≤ 1.2 | ≤ 2.0 | ≤ 3.0 |
| CPU ms: sim + write + sort | ≤ 0.4 | ≤ 0.5 | ≤ 0.6 | ≤ 0.6 |
| VFX draw calls (particles + ribbons + beams + mesh + decals) | ≤ 8 | ≤ 16 | ≤ 24 | ≤ 32 |
| Soft particles / lit shadow taps | off / off | on / off | on / on | on / on |
| Procedural weather particles | 1,000 | 3,000 | 8,000 | 20,000 |
| Trails (live) / transient VFX lights | 8 / 0 | 16 / 2 | 32 / 4 | 64 / 8 |
| Decals (live) | 64 | 128 | 256 | 512 |
| Sky background GPU ms | ≤ 0.05 (sky-view) | ≤ 0.25 | ≤ 0.25 | ≤ 0.3 |
| Analytic fog + volumes (added ALU) | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms |
| Volumetric froxel | off | off (analytic; PRD 03 S4 optional) | ≤ 1.5 ms, 160×90×64 | ≤ 2.5 ms, 240×135×128 temporal |
| VFX + atmosphere GPU memory | ≤ 4 MB | ≤ 8 MB | ≤ 24 MB | ≤ 120 MB (froxel 3 × 33 MB) |
| Atlas page | 1k (1.3 MB) | 1k | 2k (5.3 MB) | 2k |
| Overdraw guard (sum of projected particle area / screen area) | 1.5 | 2.5 | 4 | 6 |
| Bundle (gzip, `@aura3d/engine`, volumetric lazily loaded) | +40 KB total for this PRD, of which volumetric ≤ 5 KB lazy chunk; negotiated against PRD 15 budgets |

When a frame exceeds its tier's overdraw guard, continuous emitters reduce emission (never visible particles mid-life) and
`diagnostics().effects.budget.culled` reports it. If Ultra froxel memory exceeds PRD 11's Ultra memory budget, this PRD
requests 240×135×96 through CONTRACTS.md rather than exceeding it silently.

## 19. Browser coverage

- **Chromium (GH Actions macos-14, ANGLE Metal):** all unit, browser and capture tests; authoritative frames.
- **WebKit and Firefox (existing `.github/workflows/browser-matrix.yml`):** shader compile matrix, `particles-production`,
  `sky-background`, fog background match and GPU-sim capability fallback. Pass = no compile errors, `EFFECT_ZERO_PIXELS` 0,
  pixel-presence checks pass; frames are not vision-judged per browser.
- **Capabilities:** GPU sim needs `EXT_color_buffer_float` (else CPU at tier cap, diagnosed); froxel needs renderable
  RGBA16F 3D textures via `framebufferTextureLayer` (else analytic, diagnosed); KTX2 transcodes to BC7 (desktop), ASTC
  (Apple/mobile), ETC2 fallback, PNG last. WebGPU compute particles only where PRD 11 enables WebGPU root.
- Context loss: particle VBOs, sim textures, atlas and froxel volumes are recreated on restore (browser test in §16).

## 20. Mobile coverage

- Low tier on phones (PRD 11): 1k atlas, no soft depth, sky-view texture, analytic fog only, 2,000 particles, 1,000
  weather particles, no transient lights, overdraw guard 1.5, optional half-resolution particle target (Phase 6).
- CI: Playwright mobile emulation (390×844, DPR 3, touch, Low tier forced) runs the impact library sheet, rain and sky
  scenes to verify caps, guard behaviour and framing. Emulation is not a performance measurement; real-device numbers come
  from PRD 11's device lab.
- Thermal behaviour: when PRD 11's governor drops a tier at runtime, emitters keep live particles and reduce emission;
  froxel volumes are released and analytic fog takes over without a visible pop (fog parameters are shared).

## 21. Screenshots / evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd07/<gh-run-id>/`:

- For every §17 scene: Aura frame(s), the reference frame(s) where applicable, 8-frame filmstrips for animated scenes,
  side-by-side composites, `report.json` with `diagnostics().effects` and `.atmosphere`, vision-judge JSON records (both
  judges, tie-breaker if used), human sign-off note for **H** items.
- Before/after pairs against run 37289688772 for Deep Recovery, Turbo Drift, Skyline Runner and Blockfall Reactor.
- Perf: per-scene GPU ms, rAF p50/p95, live particle counts, draw calls, culled counts.
- The GH Actions run URL and commit sha for each artefact set. No locally captured frame is admissible.

## 22. Completion criteria

1. All S1–S14 pass, with evidence (§21).
2. `EFFECT_ZERO_PIXELS` is 0 for every shipped route on the default renderer; every `effect` kind has a consumer.
3. `game.effects` / `gameFeel` render without `nodes()`; PRD 09 backend `"particle-pass"` is the default.
4. No primitive-shape sky, rain, snow, star or cloud is emitted by any engine builder (grep + unit tests).
5. No CPU readback in any production frame path owned by this PRD (`readPixels` grep in owned files is test-only).
6. `renderer.vfx` flag removed; the §5 delete list is gone; no `PRD07-STUB` remains (all IC-1…IC-4 passed).
7. Integrated criteria I1–I5 passed at their checkpoints; I6–I9 are tracked by PRD 14 and are not required to close
   this PRD, but every failure there has a filed PRD 07 issue with a cause.
8. Contracts C-07-OUT-1…9 documented in CONTRACTS.md with the shipped signatures.

## 23. Rollback

- Until Phase 7: `renderer.vfx: "v1"` restores current behaviour per app; flipping the default back is a one-line revert.
- Per-subsystem overrides for diagnosis and emergency rollback (kept after Phase 7, documented as unsupported for
  shipping): `renderer.vfxOverrides: { particles?: false; sky?: false; fog?: "legacy"; volumetric?: false; decals?: false }`.
  `fog: "legacy"` restores exp2 with the 0.525 cap and static resolution.
- Atlas load failure falls back to the PNG page, then to procedural `soft-dot` drawn analytically in the shader; the
  route never loses particles entirely.
- After Phase 7, rollback is a revert of the deletion PR (kept as a single PR for that reason).

## 24. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Overdraw makes particles the frame bottleneck on mobile | high | fps loss | overdraw guard, tier caps, half-res target, soft depth off on Low, judged at gameplay scale not stress scale |
| PRD 01 blend modes land late | medium | additive glow missing | premultiplied fallback (§12); standalone thresholds set for it; I1 waits for IC-1 |
| New fog defaults change 17 tuned games | high | look shifts, some worse at first | explicit `density` keeps exp2 without cap; `legacyOpacityCap` for one minor; PRD 14 re-tunes per wave with judged frames |
| Shared-file conflicts in `index.ts` / `Renderer.ts` | high | merge pain | new files, ≤ 12/8 marked call-site lines, rebase daily |
| GPU-sim results differ across GPUs | medium | non-deterministic baselines | GPU-sim scenes judged, not pixel-diffed; deterministic CPU path for regression baselines |
| Preetham sky looks different from three because of tone-mapping order | medium | S5 mismatch | sky outputs linear radiance; three reference uses the same OutputPass-equivalent tone mapping (PRD 12 profile) |
| Froxel memory on Ultra (≈ 100 MB) | medium | OOM on some GPUs | request 96 slices via CONTRACTS.md; auto-fallback to High grid on allocation failure |
| TAA ghosting on particles | medium | smearing | reactive mask (PRD 03 C-07-IN-8); evaluated at IC with PRD 03 |
| Realm-level auto-adoption of `game.effects` surprises multi-app pages | low | effects on wrong app | adoption only with exactly one live app; otherwise `GAME_EFFECTS_UNBOUND` error and explicit `app` option |
| Vision-judge variance | medium | flaky acceptance | two judges + tie-breaker; human sign-off on **H** items; deterministic strips |
| Seam where froxel volume ends and analytic fog continues | medium | visible band | analytic fog starts from the volume's far transmittance; S7/I3 judged |

## 25. Out of scope

- Water, ocean, underwater environment preset, terrain, foliage, grass, caustics (PRD 10).
- HDRI/cubemap background shader, IBL, PMREM, SH, reflection probes, shadows (PRD 02).
- Screen-space god rays S4, bloom, TAA, speed streaks, chromatic/flash post effects (PRD 03); camera shake and screen
  flashes (PRD 08).
- Distortion/refraction particles (heat haze), motion-vector flipbooks, fluid simulation, ray-marched 3D volumetric
  clouds, deferred/screen-space decals, decals on skinned meshes, depth-buffer particle collision on WebGL2 (WebGPU later
  via PRD 11).
- A node-based VFX graph editor or GUI authoring tool; `@aura3d/lean` particles; audio for VFX events (PRD 09 audio).
- Re-tuning individual games (PRD 14) and skill text delivery (PRD 13).

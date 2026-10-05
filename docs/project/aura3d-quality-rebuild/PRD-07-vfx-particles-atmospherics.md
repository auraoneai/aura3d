# PRD 07 — VFX / Particles / Atmospherics

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed. Owner area: `packages/rendering/src/effects`, `packages/rendering/src/{ShaderChunks,ForwardPass,Renderer,EnvironmentBackgroundPass,VolumetricFog,DayNightSky,Weather,DecalGeometry}.ts`,
`packages/rendering/src/{WebGL2Device,LeanWebGL2Device,WebGPUDevice,WebGL2StateCache,RenderDevice,Material}.ts` (blend state only),
`packages/engine/src/agent-api/{index,GameRuntime,GameFeel,LayeredSceneComposition,Decals}.ts`, `packages/engine/src/production-runtime`.

Evidence base: research `08-vfx-atmos-environments.md` (primary), `10-camera-controls-gameruntime.md` §4.1,
`16-route-local-extraction.md` rows 2/14/19, `18-completeness-critic.md` C6/C9 and §2 (Skyline act fog),
`19-claim-verification.md` C8/C9 (corrected statements used throughout), `21-game-vision-judgment.md` (authoritative for
every visual category below), `23-benchmark-vision-judgment.md` scenes 09/14/17/18 (authoritative same-scene comparison),
`22-benchmark-pass1-code-metrics.md` (harness verified fair), `20-game-scorecards-code-pixelstats.md` (performance only),
capture report `evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, ANGLE Metal on an Apple
*paravirtual* GPU, sha `c08d8acb`).

Rule for this PRD: an effect is a feature only when it changes pixels on the default `createAuraApp` production path,
in a shipped game, at gameplay scale. Effect nodes that validate, appear in diagnostics, increment `effectsSpawned`
counters, or render only in a fallback or Canvas2D path count as zero. A green unit test is not acceptance. The final
gate is a human plus vision-model judgment that the shipped game's VFX, sky and atmosphere look competitive with a
well-built three.js r185 game.

---

## 1. Problem statement

The VFX/atmosphere layer is the largest single cause of the "early console" look (research 08 §0). Four failures compound:

1. **Particles produce no pixels on the default renderer.** On the production bridge, the default for every quality
   profile including `safe-basic` (`packages/engine/src/agent-api/index.ts:4253-4298, 4312`), `effects.particles`,
   `effects.rain`, `effects.snow`, `effects.flipbook` and `effects.beam` reach no draw path. The engine says so itself
   (`index.ts:3646-3650, 3666-3670, 3724-3728, 13722-13723`). The engine has a single blend function, alpha-over
   (`WebGL2Device.ts:4404`, `LeanWebGL2Device.ts:4183`, `WebGPUDevice.ts:1826-1844`), so additive glow cannot be expressed,
   even though `effects.particles` defaults `materialMode` to `"additive-glow"` (`index.ts:3707`).
2. **Game juice is wired to nothing.** `game.effects()` and `gameFeel.create()` are data pools. They produce pixels only
   if the route adds `controller.nodes()` to the scene, and no app, template or example does
   (`GameRuntime.ts:2872-2873`, `GameFeel.ts:262-263`; 19 C8, 16 headline 4). When they are rendered, 10 of 11 effect kinds
   become one shrinking emissive sphere, box or torus (`GameRuntime.ts:3879-3915`). Nodes cannot be added after mount:
   `AuraRuntimeNodeRegistry` exposes only get/require/has/ids/all (`index.ts:10664-10670`), and `setScene` tears down and
   remounts (`index.ts:11480-11492`). Games therefore pre-allocate small hidden primitive pools parked at y=-50
   (Blockfall's 48 `primitives.box` shards, `apps/showcase-blockfall-reactor/src/clear-fx.ts:15, 47-60`). Those parked
   nodes also inflate the shadow-map size (18 C2).
3. **There is no sky.** The production bridge clears to one colour (`index.ts:13596`). `EnvironmentBackgroundPass` exists
   and `Renderer` schedules it (`Renderer.ts:559, 649-653`), but nothing in `packages/engine/src` sets
   `environmentBackground` (19 C9, both skeptics). `sky.dayNight` emits sphere suns 7 units from the origin, up to 120
   sphere stars and opaque PBR sphere clouds, and discards the zenith colour (`index.ts:3730-3769`). `planSkyBackdrop`
   emits discrete emissive bands, a posterized sky by construction (`LayeredSceneComposition.ts:503-543`). Games stack
   flat boxes instead (Rooftop Buckets' 3 slabs, research 08 §4.3).
4. **Fog and "volumetrics" are minimal or fake.** Forward exp/exp2 fog is correct, but the height term is a per-fragment
   multiplier, not a ray integral (`ShaderChunks.ts:474-491`). The root caps opacity at `0.25 + intensity*0.55` (max 0.92,
   `index.ts:12758`), so at the default intensity 0.5 the cap is 0.525. The default density of 0.12 gives about 40% fog at
   10 m after the cap (18 C6). Fog never reaches the background. Fog is resolved once from the static snapshot with
   `nodes.find` (`index.ts:12739-12745`), so runtime toggling has no effect: Skyline's five act fogs all render as act 0
   (18 §2). `effects.volumetricFog` is a surface lobe plus a CPU 8-bit radial blur from a fixed UV `[0.5, 0.18]`
   (`VolumetricFog.ts:131`, `PostProcessPass.ts:1177-1255`, `Renderer.ts:1245-1262`). It forces the whole post chain into
   CPU readback (research 05 #7), which is the documented cause of Deep Recovery's frame-time collapse (17-g5 §A). The
   capture measured 0.5–1 fps.

Pixel consequences (authoritative vision judgments):

- Benchmark `14-particles` (2,000 additive sprites): **Aura 1/10, three.js 4/10.** "The particle system is entirely
  absent in Aura3D" (23 §14).
- Benchmark `09-outdoor-environment`: **Aura 3.5, three 5.5.** "Sky is a flat colour, not the HDRI gradient and cloud".
  The Aura frame is "greyed-out haze" (23 §09). Both the HDRI-background gap and the fog behaviour are classified as
  Aura defects. The harness log records that `scene().background()` accepts only a colour
  (`benchmarks/quality-rebuild/aura3d/common.ts:119`).
- Benchmarks `17-large-environment` (Aura 3.0 / three 4.5) and `18-game-scene` (Aura 3.5 / three 5.0) list "hazier,
  lifted midtones" partly attributable to fog and background mismatch (23 §17, §18).
- 18 shipped games (21), scores out of 10:

| Game | vfx | particles | atmospheric_effects | Vision-judge note (21) |
|---|---|---|---|---|
| aura-clash-showcase | 2 | 2 | 1 | "no sparks, flashes, or trails beyond translucent smears" |
| aurora-lander | 2.5 | 1 | 1 | exhaust is "a single static additive capsule mesh"; "no aurora", no sky gradient |
| bank-shot | 1 | 0 | 1 | no impact, pocket or charge effects |
| blockfall-reactor | 2 | 2 | 2 | "one orange ring in one frame" |
| courier-rush | 3 | 1 | 1 | no exhaust, sparks, speed lines, sky |
| deep-recovery | 3.5 | 3 | 1.5 | "no underwater fog colour, god rays, caustics, or suspended particulate" |
| gallery-shift | 2 | 1 | 1 | "vision cones absent or broken" |
| gravity-post | 2 | 2 | 1 | no engine trail, no ambient dust |
| mech-hangar | 1.5 | 1 | 1.5 | "action shot has zero combat VFX" |
| neon-swarm | 2 | 1 | 2 | no combat VFX despite score changes |
| orbital-defense | 0.5 | 0 | 0 | no muzzle flash, explosion, shield, trail, starfield |
| patrol-wing | 2 | 2 | 1 | "no fog, haze, clouds, aerial perspective, or sunset sky" |
| pulse-tunnel | 1 | 2 | 1 | no thruster flames or trails; "a flat void" |
| rooftop-buckets | 4 | 3 | 2 | "Bloom is standing in for atmosphere" |
| siege-golf | 3 | 1.5 | 2 | "no sky detail beyond cube clouds" |
| skyline-runner | 4 | 1 | 3 | "No falling snow ... In a snow level that is a glaring omission"; sky is a painted static plate |
| turbo-drift-circuit | 2 | 1.5 | 3 | "no particle tire smoke"; skid marks are "disc or rectangle decals"; haze is "a grey wash" |
| vault-breakers | 1 | 0 | 1 | "the room has no air" |

No game scores above 4 in any of the three categories. Mean scores: vfx 2.2, particles 1.4, atmospherics 1.5.

What must exist: one GPU particle and sprite pipeline on the root renderer, which all effect kinds, game juice, weather
and the impact library draw through. It needs a real blend-mode model, soft particles from renderer depth, flipbook
atlases, sorting, trails and mesh particles. Effects must be addable and removable at runtime and auto-mounted from
`game.effects`/`gameFeel`. The background must be a physically based procedural sky (with HDRI and gradient alternatives)
drawn behind the scene and fogged with the same function as geometry. Fog must use analytic height integration with sane
defaults, plus a GPU volumetric path. Weather and decals must be built on these primitives.

---

## 2. Evidence from current code

### 2.1 Particle stacks (none reaches the default frame)

| # | Location | Fact | Source |
|---|---|---|---|
| E1 | `packages/engine/src/agent-api/index.ts:3690-3714` | `effects.particles` exposes `materialMode`, `texturedBillboard: true`, `sizeOverLife`, `alphaOverLife`, `velocityOverLife`, `turbulence`, `noise`, `particleCount` 2400. None of these is consumed on production. | read; 08 §2.1 |
| E2 | `index.ts:3620-3645` | `effects.rain`/`effects.snow` builders (wind, splashes, mist). No production consumer. | read; 19 C8 |
| E3 | `index.ts:3646-3689` | `effects.flipbook` and `effects.beam` are "withheld — root has no native sprite-sheet sampler / beam target yet, so no pass is submitted". | read |
| E4 | `index.ts:3724-3728`, `:13722-13723` | Self-disclosure that the production bridge does not pixel-back rain, snow or particles; a blanket warning says the effect nodes "remain non-pixel-backed". | read; 19 C8 |
| E5 | `index.ts:16000-16006`, `:16517-16600` | The safe-basic fallback renders particles as 8-triangle opaque octahedrons and rain as 90 static 1 px `GL_LINES`. | 08 §2.2; 19 C8 |
| E6 | `index.ts:18432-18600` | The Canvas2D diagnostic `drawEffect` paints circles and strokes. | 08 §2.2 |
| E7 | `packages/rendering/src/effects/ParticleSystem.ts` (734 lines) + modules | Real CPU module simulation (emitters, bursts, force, colour, size, velocity, collision, turbulence, sub-emitter, trail). `ParticleRenderer.buildBatch` targets a `ParticleDrawTarget` that has **no implementation in the repo**. | 08 §2.1 |
| E8 | `packages/rendering/src/effects/ParticleRenderPass.ts:25-50` | `ParticleRenderPass.execute` calls `renderer.render(system, target)`. It is a pass shell with no GPU draw. | read |
| E9 | `effects/GPUParticleBackend.ts:453-455, 540-541, 648-652, 816-824` | WGSL compute kernels end in `copyBufferToBuffer` + `mapAsync(READ)` every frame (full readback). | 08 §2.1 |
| E10 | `effects/ResidentGPUParticleRenderer.ts:4-10, 187, 352-365, 483-488, 516-520` | Owns its own device and canvas. Camera is a compile-time constant `[0,2.5,7.2]`. Soft fade uses a fixed y=0 plane. Output is flat squares. Lighting divides by the lighting factor. | 08 §2.1, §2.4 |
| E11 | `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts:24-28` | Orange opaque `UnlitMaterial` squares ±0.012 in the world XY plane, not camera-facing. The CPU rewrites the vertex buffer each update. No consumer anywhere. | 08 §2.1; 18 C9 |
| E12 | `effects/ParticleRenderer.ts:47-63, 79-110, 146-159` | Soft particles are a CPU scalar per sprite from a `sceneDepthAt` callback. `SOFT_PARTICLE_WGSL` is exported but unused. Sorting is CPU `Array.sort`, default `"none"`. | read; 08 §2.4 |
| E13 | `packages/rendering/src/SpriteFlipbook.ts:99-111` | `resolveFlipbookUv` is correct UV math with v flipped for GL. Nothing samples it on the GPU. | read |
| E14 | `packages/rendering/src/RenderDevice.ts:139`, `Material.ts:36` | `blend: boolean` is the entire blend model. | read |
| E15 | `WebGL2Device.ts:4404`, `LeanWebGL2Device.ts:4183`, `WebGPUDevice.ts:1826-1844` | Only `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`. The WebGPU pipeline key encodes `blend`/`opaque` only. | read; 19 C8 |
| E16 | `packages/rendering/src/ForwardPass.ts:121, 260, 1652-1670` | `MAX_GPU_INSTANCES = 64` split for non-attribute shaders. Transparent bucket sorting exists (`sortRenderQueueItems`). | read |
| E17 | `index.ts:14747-14754` | `createProductionInstanceTransforms` drops `node.size`. This is the confirmed cause of benchmark 16's shrunken instances (22). Mesh particles must not inherit it. | read; 22 |
| E18 | `index.ts:8344-8360, 9683, 9756, 9795-9796` | `gpuReady` and the scene-kit "textured billboard impostor" evidence strings are computed from node metadata, not from draws. | 08 §2.5 |
| E19 | `apps/showcase-webgpu-particle-lab/src/main.ts:318` | Claims "visible particle field is produced by Aura3D effects.particles", which the code contradicts. | 08 §2.2; 19 C8 |

### 2.2 Game juice

| # | Location | Fact | Source |
|---|---|---|---|
| E20 | `packages/engine/src/agent-api/GameRuntime.ts:2800-2879` | `createGameEffects` is a pure data pool (pool 96). `nodes()` is the only pixel path. | read |
| E21 | `GameRuntime.ts:3879-3915` | `effectToSceneNode`: `aura-burst` becomes a dead `particles` node. Every other kind becomes `primitive` sphere/box/torus with `emissiveIntensity*life` and `opacity: life`. | read |
| E22 | `GameRuntime.ts:1150-1171` | 11 `GameEffectKind`s: hit-spark, block-spark, impact-decal, ground-dust, dash-trail, slash-trail, impact-flash, aura-burst, shockwave, ring-shockwave, super-flash. `GameEffectsOptions` has no app/target binding. | read |
| E23 | `GameFeel.ts:1-17, 262-263` | "owns no renderer"; `nodes()` forwards to the effects port. | read |
| E24 | 18 routes (`rg '\.nodes\(\)'`) | Zero consumers. Neon Swarm calls `gameEffects.spawn` 7× and never calls `update`. Turbo and Skyline route `damageFlash`/`speedLines`/`landingDust` through `gameFeel` and record `effectsSpawned` into evidence. | 10 §4.1; 16; 19 C8 |
| E25 | Route-local VFX pools | Neon `combat-feel.ts` (150 LOC, instanced spark pool), Mech `arena/feel.ts` (307), Blockfall `clear-fx.ts` (192), Aura Clash `rendering/HitSparkVfx.ts` (150) + `AuraClashArenaApp.ts:3570-3700`, Pulse `main.ts:1737-2000`. Trails: Pulse, Siege `trailPuffs`, Patrol `orbTrailHandles`, Turbo ribbons. | 16 rows 2, 19 |
| E26 | `index.ts:10664-10670`, `:11480-11492` | No runtime add/remove. `setScene` remounts everything, including physics re-registration. | read; 18 §2 |

### 2.3 Sky and background

| # | Location | Fact | Source |
|---|---|---|---|
| E27 | `index.ts:13586-13596` | `ProductionRuntimeRenderer.create({ clearColor: colorToAcesInputClearColor(snapshot.background) })` | 19 C9 |
| E28 | `packages/rendering/src/Renderer.ts:268, 559, 649-653, 1806-1809` | `RenderSource.environmentBackground` schedules `EnvironmentBackgroundPass`. `rg environmentBackground packages/engine/src` returns nothing. | read; 19 C9 |
| E29 | `packages/rendering/src/EnvironmentBackgroundPass.ts:12-60` | Equirect/cubemap fullscreen-triangle background. It creates the fullscreen geometry inside `execute()` every frame. | read |
| E30 | `index.ts:3730-3769` | `sky.dayNight`: sphere sun/moon at z=-7, ≤120 sphere stars at z=-6.5, ≤48 opaque PBR sphere clouds. The returned background is one colour. | read |
| E31 | `packages/rendering/src/DayNightSky.ts:8-11, 63-84` | Nine hard-coded sRGB keyframes. "no Rayleigh/Mie model is implemented or implied". | 08 §4.2 |
| E32 | `packages/engine/src/agent-api/LayeredSceneComposition.ts:503-543` | `planSkyBackdrop` emits `bandCount` (default 4) flat bands with stepped `emissiveIntensity = 0.52 - blend*0.34`. Used by Skyline (`main.ts:1122-1140`). | read |
| E33 | `packages/rendering/src/EnvironmentPlatform.ts:395-415` | `createProceduralSkyDome` is a single-colour unlit UV sphere with no root consumer. | 08 §4.4 |
| E34 | `packages/engine/src/production-runtime/index.ts:1436-1621` | `createProductViewer` draws a visible HDR sky with its own `A3DVisibleHdrSkyboxMaterial` sphere. This is a second, parallel background path. | 19 C9 counter-evidence |
| E35 | `apps/showcase-rooftop-buckets/src/environment.ts:21-56`, `apps/showcase-patrol-wing/src/sky.ts:449-458` | Box-slab sky bands. Sun is an emissive sphere at (-29,21,-58). | 08 §4.3 |

### 2.4 Fog and volumetrics

| # | Location | Fact | Source |
|---|---|---|---|
| E36 | `packages/rendering/src/ShaderChunks.ts:472-517` | `a3dEnvironmentFogFactor`: distance fog × `exp(-max(0, y - ref) * falloff)`, which is a multiplier and not integrated. The volumetric "inscatter" is `pow(dot(V, L), 6)` on surfaces only, with sin-hash dither. | read |
| E37 | `index.ts:3442-3449` | `effects.fog` defaults: density 0.12, `#9fb7d9`, intensity undefined. | read |
| E38 | `index.ts:12733-12786` | Fog chosen by `nodes.find` on the static snapshot. Volumetric wins over plain fog. `maxOpacity = clamp(0.25 + intensity*0.55, 0, 0.92)`, so the default is 0.525. | read; 18 C6 |
| E39 | `benchmarks/quality-rebuild/aura3d/common.ts:250-252` | Harness records that fog "caps opacity ... so distant geometry never fully fogs as FogExp2 does". | read |
| E40 | `packages/rendering/src/VolumetricFog.ts:105-144`, `PostProcessPass.ts:1177-1255`, `Renderer.ts:1245-1262`, `WebGL2Device.ts:2452-2454` | CPU nested-loop radial blur on `Uint8Array` readback. Fixed anchor UV. Authored colour ignored (05 §6.5). "own no GPU target". | 08 §3.2 |
| E41 | `apps/showcase-deep-recovery/src/main.ts:280-285` | The only `volumetricFog` user. Captured at 0.5–1 fps on the macos-14 runner, versus 5–15 fps for most games. | 17-g5; capture report |
| E42 | `packages/rendering/src/cinematic/*` (14 files) | `FogVolumeSystem`, `DepthHazePass`, `RainParticleSystem` and similar are descriptor objects with `rendererOwnedEvidence` flags. No renderer reads them. | 08 §3.3, §6 |
| E43 | `apps/showcase-skyline-runner/src/main.ts:1391, 1904, 2229-2238, 3864` | Five act fog nodes toggled through runtime handles. The renderer always uses act 0. | 18 §2 |

### 2.5 Weather and decals

| # | Location | Fact | Source |
|---|---|---|---|
| E44 | `index.ts:3772-3810` | `weather.precipitation`: dead rain/snow node plus ≤160 opaque PBR `primitives.box` streaks or spheres sampled at `elapsedSeconds ?? 1.2`. The rain does not fall. | 08 §5.2; 19 C8 |
| E45 | `packages/rendering/src/Weather.ts`, `AtmosphereWetness.ts` | Sound deterministic state math (intensity, wind, puddles, wetness scalars). | 08 §5.2, §13 |
| E46 | `packages/engine/src/agent-api/Decals.ts:51-61` | `AURA_DECAL_MAX_DECALS = 32`, forward transparent, one draw per decal, angle/distance fade, polygonOffset. No normal or roughness blending. **0 games use it.** | read; 08 §7 |
| E47 | `packages/rendering/src/ProjectedDecalGeometry.ts` (439 lines) | Box/ellipse clip of the source mesh, comparable to three.js `DecalGeometry`. | 08 §7 |
| E48 | `apps/showcase-turbo-drift-circuit/src/main.ts:5163-5184` | "Skid marks" are primitives. The vision judge sees "grey disc decals ... skid marks rendered as circles". | 08 §7; 21 turbo |

### 2.6 Adoption (18 games, research 08 §9 + 18 census)

`effects.fog` 17/18, `effects.volumetricFog` 1, `effects.particles` 2 shipped games plus 2 non-game showcases (all dead
nodes), `sky.dayNight` 0, `weather.*` 0, `water.*` 0, `decals.*` 0, `effects.flipbook` 0, `effects.beam` 0,
`environments.hdri` 0, `.nodes()` 0. 0/18 games show sky, HDRI, rendered particles or decals (18 §5).

---

## 3. Root cause

1. **The production bridge has no effect consumer.** `createProductionRuntimeSceneRenderer` builds draw entries only for
   typed GLB actors and primitives (19 C8 skeptic 1). Effect builders were added to the public API, to diagnostics and to
   evidence (E18) without a render path. The "zero-pixel effect" case was downgraded to a warning (E4), so nothing failed.
2. **The device layer cannot express VFX blending.** `blend: boolean` (E14) means additive, premultiplied and multiply
   blending are impossible on every backend. Any particle renderer built on the current device would produce wrong-looking
   output.
3. **The scene model is mount-time static.** No runtime add/remove (E26) and fog read from the static snapshot (E38, E43)
   push games into pre-allocated hidden primitive pools. That shapes VFX into "a few shrinking shapes" and defeats any
   per-frame emitter model.
4. **Background is a clear colour, not a pass.** The engine never sets `environmentBackground` (E28). With no sky to match,
   fog and background colours are independent strings, so seams and grey washes follow. Sky "features" were therefore
   built from scene primitives (E30, E32) because primitives are the only thing the bridge draws.
5. **Evidence substituted for rendering.** Descriptor-only `cinematic/*` (E42), metadata-derived `gpuReady` (E18), a CPU
   "volumetric" kernel (E40), and a Canvas2D VFX audit (08 §2.5) all satisfied parity checklists. No pixel gate existed on
   the shipped path until the quality-rebuild capture.
6. **Agent guidance points at dead or primitive paths.** `aura3d-materials-environments` SKILL teaches `sky.dayNight`,
   `weather.precipitation`, `water.surface` and `environments.hdri` "for the sky". `aura3d-game-art` produces flipbooks
   that have no consumer (08 §10).

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/rendering` | Blend-mode model; `ParticleBatchPass`, `RibbonPass`, `SkyBackgroundPass`, `HeightFogChunk`, `VolumetricFogPass`, depth-resolve resource, decal batching; particle simulation feeders; deletion of `cinematic/*` descriptors and the CPU volumetric path from production. |
| `@aura3d/engine` (agent-api + production-runtime) | Production effect system (`ProductionEffectSystem`), effect-node lowering, runtime `nodes.add/remove`, `app.effects`, background spec, `sky.*` rewrite, `weather.*` rewrite, fog resolution from live state, `game.effects`/`gameFeel` auto-mount, VFX preset library, diagnostics from observed draws. |
| `@aura3d/lean` (`LeanWebGL2Device.ts`) | Blend-mode parity only (state cache + `blendFunc`). Lean particle rendering is out of scope (§24). |
| `@aura3d/create-aura3d` / `packages/aura3d-cli/skills` | Skill text for `aura3d-materials-environments`, `aura3d-game-art`, `aura3d-browser-game` (delivery owned by PRD 13; this PRD supplies the API facts). |
| `benchmarks/quality-rebuild` | Particle spec fields (seed, size, explicit positions), new VFX/sky/fog/weather/decal scenes, translator updates. |
| `tools/vfx-atlas-bake` (new) | Offline deterministic baker for the built-in smoke/flame/explosion flipbooks (license-clean, no third-party art required). |
| `apps/*` (18 games) | Migration to engine VFX, background, fog and decals. Sequencing is owned by PRD 14; per-game acceptance subset is in §16. |

---

## 5. Affected files / directories

Modify:

- `packages/rendering/src/RenderDevice.ts` (`RenderCommandState.blend`), `Material.ts` (`RenderState.blend`,
  `DEFAULT_RENDER_STATE`), `WebGL2Device.ts` (`:4404` blend apply, pipeline/state key), `WebGL2StateCache.ts`
  (`blendFunc` → `blendFuncSeparate` + `blendEquation`), `LeanWebGL2Device.ts:4183`, `WebGPUDevice.ts:1826-1844`
  (pipeline key + `blend` descriptor).
- `packages/rendering/src/Renderer.ts` (pass scheduling `:545-700`, `RenderSource` `:246-290`, depth resolve after
  opaque, `collectEnvironmentBackground` `:1806-1809`, removal of the CPU `volumetric-light` branch `:1245-1262`).
- `packages/rendering/src/ForwardPass.ts` (split opaque/transparent execution so particles draw between them and sorted
  with transparents; fog uniforms `:519-640`).
- `packages/rendering/src/ShaderChunks.ts:472-517` (`environment_fog_common` → integrated height fog, plus a shared
  `a3d_fog_ray` chunk used by sky and particles).
- `packages/rendering/src/EnvironmentBackgroundPass.ts` (cache fullscreen geometry; accept `blurriness` via mip
  level-of-detail; apply fog).
- `packages/rendering/src/VolumetricFog.ts` (resolve to GPU pass options; keep `volumetricLightPixels` only as a test oracle).
- `packages/rendering/src/effects/{ParticleSystem,ParticleRenderer,ParticleRenderPass,GPUParticleBackend,TrailModule,ResidentGPUParticleRenderer}.ts`.
- `packages/rendering/src/{DayNightSky,Weather,AtmosphereWetness,DecalGeometry,ProjectedDecalGeometry,SpriteFlipbook}.ts`.
- `packages/engine/src/agent-api/index.ts`: `effects.*` (`:3441-3715`), `sky` (`:3730-3770`), `weather` (`:3772+`),
  `AuraRuntimeNodeRegistry` (`:10664-10670`), app object (`:11480-11520`), fog resolution (`:12733-12786`),
  `createProductionRuntimeSceneRenderer` (`:13540+`, warning `:13722-13723`), render-source build (`:13990-14005`),
  particle diagnostics (`:8344-8360`), scene-kit strings (`:9683, 9756, 9795-9796`), safe-basic particle and rain models
  (`:16000-16006, 16517-16600`).
- `packages/engine/src/agent-api/GameRuntime.ts` (`:1150-1171`, `:2800-2879`, `:3879-3915`), `GameFeel.ts`,
  `LayeredSceneComposition.ts:503-543`, `Decals.ts`.
- `benchmarks/quality-rebuild/shared/scenes.ts:280-289` (14-particles), `aura3d/common.ts:114-119, 232-253`,
  `three/common.ts:154-165, 316-328`.

Create:

- `packages/rendering/src/vfx/` — `BlendModes.ts`, `ParticleBatch.ts`, `ParticleBatchPass.ts`,
  `ParticleInstanceLayout.ts`, `ParticleSort.ts`, `RibbonBatch.ts`, `RibbonPass.ts`, `MeshParticleBatch.ts`,
  `DepthResolve.ts`, `shaders/particle.glsl.ts`, `shaders/particle.wgsl.ts`, `shaders/ribbon.{glsl,wgsl}.ts`.
- `packages/rendering/src/atmosphere/` — `SkyBackgroundPass.ts`, `PreethamSky.ts`, `GradientSky.ts`, `HeightFog.ts`,
  `VolumetricFogPass.ts`, `shaders/sky.{glsl,wgsl}.ts`, `shaders/height-fog.{glsl,wgsl}.ts`,
  `shaders/volumetric.{glsl,wgsl}.ts`, `SkyEnvironmentCapture.ts` (sky→IBL capture, coordinated with PRD 02).
- `packages/engine/src/production-runtime/effects/` — `ProductionEffectSystem.ts`, `EffectNodeLowering.ts`,
  `EmitterInstance.ts`, `WeatherVolume.ts`, `DecalPool.ts`.
- `packages/engine/src/agent-api/vfx/` — `presets.ts` (impact library), `textures.ts` (built-in atlas manifest), `index.ts`.
- `packages/engine/assets/vfx/` — `aura-vfx-atlas-{1k,2k}.ktx2` + `.png` fallback + `manifest.json` (baked, §6.4).
- `tools/vfx-atlas-bake/` — offline baker (Node, deterministic, no network).
- Tests listed in §15.

Delete (phase 6, after migration): `packages/rendering/src/cinematic/{FogVolumeSystem,DepthHazePass,RainParticleSystem,BloomPass,FilmGrainPass,VignettePass,WetReflectionApproximation,CinematicDepthComposition,GlowCardSystem,EmissivePracticalLightSystem}.ts`
and their re-exports. `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts`. The hard-coded camera in
`ResidentGPUParticleRenderer.ts` (the file is generalized or deleted, §6.2.6). `tools/effects-vfx-visual-audit/`. The
octahedron particle and `GL_LINES` rain models in `index.ts:16517-16600`, which are replaced by the shared pass.


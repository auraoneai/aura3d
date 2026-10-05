# 08 — VFX, Particles, Atmospherics, World/Environment Systems: Forensic Audit

Scope: particle systems (CPU/GPU, soft particles, sorting, flipbooks, lit particles, trails), `packages/rendering/src/effects`, `packages/rendering/src/cinematic`, decals, fog (linear/exp2/height/volumetric), sky (`DayNightSky`, procedural sky dome), weather, water/ocean, terrain, vegetation/scatter, `packages/environments`, `packages/materials`, `AtmosphereWetness`, `EnvironmentPreset(Pack)`, and how the 18+ `apps/showcase-*` games actually produce sky, water, smoke, sparks, rain and foliage pixels.

Method: read shader source strings, the root `createAuraApp` production bridge (`packages/engine/src/agent-api/index.ts`, 18,733 lines), the safe-basic WebGL fallback and the Canvas2D diagnostic path, then grepped every showcase for the public APIs. three.js r185.1 source is present at `node_modules/three` and was used for comparison (`examples/jsm/objects/Sky.js`, `Water.js`, `src/renderers/shaders/ShaderChunk/fog_*.glsl.js`). Nothing was run in a browser (policy). Claims that depend on runtime pixels are marked "by code reading" and need one remote screenshot to confirm.

---

## 0. Executive verdict

The VFX/atmosphere/world layer is the clearest single explanation of the "Atari / early-Nintendo" look. There are four separate failures, and they compound:

1. **The default production renderer draws zero pixels for `effects.particles`, `effects.rain`, `effects.snow`, `effects.flipbook`, and `effects.beam`.** The production bridge has no consumer for these effect kinds. The engine's own comments say so (`index.ts:3724-3728`, `index.ts:13722-13723`, `index.ts:4536-4537`). The only places particle effect nodes become pixels are (a) the "safe-basic" WebGL fallback, which draws them as opaque, flat-lit **octahedrons** with no alpha (`index.ts:16548-16600`), and rain as **90 one-pixel `GL_LINES`** (`index.ts:16517-16546`); and (b) a Canvas2D diagnostic path that paints circles and strokes (`index.ts:18432-18600`).
2. **There is no sky.** The production bridge clears to one solid `snapshot.background` colour (`index.ts:13596`). `EnvironmentBackgroundPass` (equirect/cubemap skybox) exists in `@aura3d/rendering` and the renderer accepts it (`Renderer.ts:559,649-653`), but **nothing in `packages/engine` ever sets `environmentBackground`**, so an HDRI never shows as a visible sky, even through `environments.hdri(...)`. Games therefore build skies from stacked emissive **boxes** (rooftop-buckets: 3 flat-colour slabs, `environment.ts:21-56`). The engine helper for this, `planSkyBackdrop`, emits **discrete colour bands** (`LayeredSceneComposition.ts:503-543`), which is a posterized 8/16-bit sky by construction. `sky.dayNight` adds stars as emissive **spheres** 6.5 units from the origin and clouds as squashed opaque PBR **spheres** (`index.ts:3730-3769`).
3. **Every "world system" (water, weather, terrain, vegetation, ocean, space, wetness, volumetric clouds) is either a pure-data descriptor with no renderer, or a builder that emits grids of primitive boxes, spheres and cylinders.** `water.surface` = opaque PBR box strips + sphere "foam" (`index.ts:3870-3900`). `weather.precipitation` = up to 160 static PBR boxes (rain) or spheres (snow), frozen at `elapsedSeconds: 1.2` (`index.ts:3783-3806`). Terrain splatting, triplanar, clipmaps, instanced foliage rendering and an ocean shader do not exist (`TerrainTiles.ts`, `VegetationScatter.ts:134`, `OceanSurface.ts:166`, `MaterialPresets.ts:243`). None of the showcase games calls `sky.*`, `weather.*`, `water.*`, the terrain modules or the vegetation modules (§9).
4. **Default lighting environments are tiny, LDR and studio-shaped.** Every outdoor game that adds `environments.studio()` gets a generated **128×64** three-band gradient with one softbox blob, **Reinhard tone-mapped to 8-bit sRGB**, 5 box-blurred mips and a 16×8 irradiance map (`ExternalParityRenderPreset.ts:133-151, 223-256`). The repo's own `@aura3d/environments` diagnostics flag anything under 256 px/face or 8 mips as below the quality floor (`PMREMPreset.ts`), so the engine's default environment fails the engine's own check.

The parts that are real (a solid CPU particle simulation, a WebGPU compute kernel, mesh-projection decals, a correct exp/exp2 fog chunk) are either unreachable from `createAuraApp`, unused by any game, or reachable only through a hard-coded single-camera demo renderer (`ResidentGPUParticleRenderer`, camera fixed at `[0, 2.5, 7.2]`).

The "parity"/"evidence" layer hides all of this. Scene-kit budgets claim "textured billboard layers represent thousands of particles as batched impostors" (`index.ts:9683, 9756, 9796`) when production draws none. `@aura3d/materials` ships "50 PBR materials" made with `Array.from({length: 50})`, hue `index*41`, and texture sets that point at `embedded://baseColor` inside DamagedHelmet, Duck and BoomBox (`PBRMaterialLibrary.ts:40-88`, `TextureSet.ts:18-56`). The environment manifest lists 6 "real HDRIs" but has only 3 files; "venice-sunset" is `studio_small_08_1k.hdr` with the same sha256 (§8.2).

---

## 1. Capability ladder summary

Ladder: E = exists, W = technically works, API = public root API, U = used by showcase games, D = good defaults, C = composes with the rest of the frame, M = modern visual quality, A = agents know to use it correctly, X = examples demonstrate it.

| Capability | E | W | API | U | D | C | M | A | X | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CPU particle simulation (`effects/ParticleSystem.ts` + modules) | Y | Y | N (rendering pkg only) | N | ~ | N | N | N | Audit tool draws it on a 2D canvas | No production `ParticleDrawTarget` exists anywhere |
| WebGPU particle compute (`GPUParticleBackend.ts`) | Y | Y | N | N | – | N | N | N | 1 wow app | Per-frame `mapAsync` readback of positions |
| `ResidentGPUParticleRenderer` (GPU-resident draw) | Y | Y | N | N | N | **N (owns its own device and canvas, hard-coded camera)** | N | N | `wow-webgpu-compute-particles` | Square quads, no texture, fake ground-plane soft fade |
| `RootGpuParticleWorkload` | Y | Y | partial | N | N | Y (root items) | **N** (orange `UnlitMaterial` 0.024-unit squares in the XY plane) | N | – | Not camera-facing, no alpha, no texture |
| `effects.particles` on production bridge | Y (node) | **N (0 pixels)** | Y | 4 apps | – | N | N | N | – | Self-documented at `index.ts:3724-3728` |
| `effects.particles` on safe-basic fallback | Y | Y | Y | (fallback only) | N | ~ | **N (opaque octahedrons, no alpha)** | N | – | `index.ts:16548-16600` |
| `effects.rain` / `effects.snow` on production | Y | **N** | Y | 0 games | – | – | – | – | – | Fallback: 90 `GL_LINES` |
| `weather.precipitation` | Y | Y | Y | 0 games | N | N | **N (≤160 static PBR boxes/spheres)** | taught by skill | harness | Frozen at t=1.2 s |
| Soft particles | ~ | CPU only, per-sprite scalar | N | N | off | N | N | N | – | `ParticleRenderer.ts:79-110`, a CPU callback, not a depth texture |
| Particle sorting | Y | CPU `Array.sort` | N | N | `"none"` | – | – | – | – | `ParticleRenderer.ts:146-159` |
| Flipbook / texture atlas | UV math only | N | `effects.flipbook` | 0 | – | – | – | Skill says it is "withheld" | – | `index.ts:4536` warning |
| Trails / ribbons | GPU demo only | in Resident renderer | N | N | – | – | – | – | – | GameRuntime "trails" are scaled **boxes** |
| Lit particles | GPU demo only | ~ | N | N | – | – | – | – | – | Odd inverse-factor shading (`ResidentGPUParticleRenderer.ts:487`) |
| Game hit/impact VFX (`GameRuntime` effects) | Y | Y | Y | Y | N | Y | **N (shrinking emissive spheres/torus/boxes)** | – | – | `GameRuntime.ts:3879-3915` |
| Decals (mesh projection) | Y | Y | `decals.*` | **0 games** | ~ | Y (forward, transparent) | ~ (three.js DecalGeometry-level) | ~ | `apps/decals` | Max 32, no deferred decals, no normal/roughness blending |
| Fog exp/exp2/linear | Y | Y | `effects.fog` | **17/18 games** | ~ | **N (does not touch the background or sky)** | ~ (three.js-level) | Y | many | Height term is a multiplier, not integrated |
| "Volumetric" fog | Y | Y (CPU) | `effects.volumetricFog` | 1 game | N | ~ | **N** (screen-space radial blur run on the CPU, anchor fixed at UV [0.5, 0.18]) | – | – | `PostProcessPass.ts:1177-1255` |
| Procedural sky / atmospheric scattering | **N** | – | `sky.dayNight` (spheres) | 0 games | – | – | – | Skill teaches it | harness | Claim boundary admits "no Rayleigh/Mie" |
| Skybox / HDRI background | Y (`EnvironmentBackgroundPass`) | Y | **N (root never wires it)** | 0 | – | – | – | Skill implies yes (wrong) | – | Solid clear colour only |
| Sky dome (`createProceduralSkyDome`) | Y | Y | N | 0 | – | – | **N (single-colour unlit UV sphere)** | – | – | `EnvironmentPlatform.ts:395-415` |
| Water (`water.surface`) | Y | Y | Y | 0 | – | – | **N (opaque box bands)** | taught | harness | – |
| Planar water reflection/refraction capture | Y | ~ | N | 0 | – | N | N (128² rgba8 targets) | – | – | `OceanSurface.ts:389-455` |
| Gerstner ocean | CPU telemetry only | – | N | 0 | – | – | – | – | – | "does not implement a production ocean renderer" |
| Terrain heightfield mesh | Y | Y | N | 0 (games hand-roll) | – | – | N (no splat material) | – | – | `TerrainHeightfield.ts:143-215` |
| Terrain tiles / LOD / slope blend | descriptor only | – | N | 0 | – | – | – | – | – | No geometry, no shader |
| Vegetation scatter | planner only | Y | `planScatterInstances` | 1 game (draws **two boxes per tree**) | – | – | **N** | – | – | `smart-city-control/main.ts:157-166` |
| `@aura3d/environments` | metadata/diagnostics | Y (Node) | Y | 0 | – | – | – | – | – | No rendering code |
| `@aura3d/materials` presets | parameter tables | Y | Y | 0 | **N (generated hues)** | – | – | taught | – | §8.3 |
| `AtmosphereWetness` | pure functions | Y | via `weather.wetGround` | 0 | – | – | N (box slab + cylinder puddles) | – | – | – |
| `EnvironmentPresetPack` | Y | Y | N | 0 | **N (normalizes night to daytime luma)** | – | – | – | – | §8.4 |
| `cinematic/*` systems | descriptor objects + "evidence flags" | – | N | 0 | – | – | – | – | – | §6 |

---

## 2. Particles

### 2.1 Four particle stacks that do not connect

| Stack | Path | Simulation | Rendering | Reachable from `createAuraApp`? |
|---|---|---|---|---|
| A. CPU module system | `packages/rendering/src/effects/ParticleSystem.ts` (734 lines) + Emitter/Force/Color/Size/Velocity/Collision/Turbulence/Heightfield/SubEmitter/Trail/Lighting modules | CPU, Unity-Shuriken-like modules, real and reasonable | `ParticleRenderer.buildBatch` produces a JS array of `{position, color, size, rotation, fade}` and calls `target.drawParticles(batch)`. **No implementation of `ParticleDrawTarget` exists in the repo.** The only caller is `tools/effects-vfx-visual-audit/index.ts:239` (`drawParticles() {}`, a no-op), and the "visual audit" then paints the sprites with Canvas2D radial gradients (`index.ts:478-500`). | No |
| B. WebGPU compute backend | `effects/GPUParticleBackend.ts` (1,446 lines) | WGSL compute with wind, turbulence, planes, heightfield, sub-emitters, curves, lighting, trails flags | None of its own. Every update ends in `copyBufferToBuffer` to readback buffers plus `mapAsync(READ)` (`:453-455, 540-541, 648-652, 816-824`), so positions round-trip to the CPU each frame. | Only via D |
| C. Resident GPU renderer | `effects/ResidentGPUParticleRenderer.ts` (522 lines) | GPU-resident | Its own WebGPU device and canvas context (`context.configure`, `device.destroy` in `dispose`, `:344-349`). **Camera is a compile-time constant**: `RESIDENT_PARTICLE_CAMERA = { position: [0, 2.5, 7.2], target: [0, 1.4, 0], fov 65 }` (`:4-10`), baked into WGSL as `vec3<f32>(0.0, 2.5, 7.2)` and a hand-unrolled projection (`:352-358`). The "soft fade" ray-casts against a hard-coded ground plane at y=0 (`softFade`, `:360-365`) instead of sampling scene depth. Fragment output is a flat-coloured quad with no texture and no radial falloff (`:516-520`), so particles are **solid squares**. | No. Used by one app: `apps/wow-webgpu-compute-particles` |
| D. Root workload | `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts` (68 lines) | B (WebGPU) or a trivial CPU Euler step | `UnlitMaterial({color:[1,.667,.267,1]})` (orange, opaque) and 6 vertices per particle at fixed XY corners `±0.012` (`:24-25`). Quads lie in the world XY plane and are **not camera-facing**. No texture, no alpha, no size or colour over life, and positions are re-written into a CPU `VertexBuffer` every update (`writeVertices`, `:28`). | Through the root render-source bridge, but no public `effects.*` builder targets it |

The public authoring surface (`effects.particles({...})`, `index.ts:3691-3715`) carries a rich, plausible-looking option set: `materialMode` (`additive-glow|soft-alpha|spark|smoke|splash|dust|star`), `texturedBillboard: true` by default, `sizeOverLife: [0.35,1,0.58]`, `alphaOverLife: [0,0.92,0]`, `velocityOverLife`, `turbulence`, `noise`, `lifetimeColorRamp`, `particleCount` default 2,400. **None of stacks A–D consumes this node.** Here is what happens to it.

### 2.2 What `effects.particles` produces per renderer path

Default renderer: `normalizeCreateAppRendererOptions` resolves `qualityProfile` to `"safe-basic"` (`index.ts:4311-4313`), whose `rendererMode` is `"production"` (`index.ts:4249-4253`). So every game runs the production bridge unless it falls back.

| Path | When | Pixels for `effects.particles` |
|---|---|---|
| Production bridge (`createProductionRuntimeSceneRenderer`, `index.ts:13540+`) | Default | **None.** In 13540–15500 no code reads `effect === "particles"`, `"rain"` or `"snow"`. The only effect kinds consumed are fog/volumetric-fog (forward uniforms, `:12734-12790`) and the postprocess set (bloom, ssao, color-grade, fxaa/taa, outline, ssr, dof, motion-blur, `:12795-12900`). The bridge adds a blanket warning instead: "Effect nodes are requested in the scene graph; production bridge diagnostics report them, but unsupported postprocess/effect passes remain non-pixel-backed" (`:13722-13723`). The block comment at `:3724-3728` is explicit: "the production bridge does not pixel-back `rain`, `snow`, or `particles` effect passes (they render only in the safe-basic fallback and the Canvas2D diagnostic path)." |
| Safe-basic WebGL fallback (`createWebGLSceneRenderer`) | Production mount throws (`:12543-12548`) | `createWebGLParticleModel` (`:16548+`) builds every particle as an **8-triangle octahedron** (`localVertices` ±1 on each axis, `localTriangles` 8 faces) with per-vertex colours from `lifetimeColorRamp`, drawn by the generic lit primitive program. The turbo-drift author documents the result: "Warm cream dust was reading as opaque beige marbles in the agent-runtime WebGL path, whose primitive shader intentionally carries RGB but not alpha" (`apps/showcase-turbo-drift-circuit/src/main.ts:2631-2633`) and "keeps fountain billboards at a small fixed base size … collapsed to a few sub-pixel flecks" (`:2616-2619`). Rain = `createWebGLRainModel`: 90 line segments, `gl.LINES`, 1 px wide, static positions (`:16517-16546`). |
| Canvas2D diagnostic path (`drawEffect`) | No WebGL, or diagnostics | `context.arc` circles with a white specular dot, ellipse "splashes", `lineTo` rain strokes, and a hard-coded fountain palette `["#fff7ad","#fef08a","#fb923c","#60a5fa","#38bdf8","#fb7185"]` (`:18432-18600`). |

Consequences:

- `apps/showcase-webgpu-particle-lab/src/main.ts:318` claims "The visible particle field is produced by Aura3D effects.particles." It runs the default production mode (`:90-94`, no renderer option). **By code reading, its `effects.particles` layers produce no pixels on the production bridge.** Whatever particle-like pixels it shows come from primitives or a fallback. Confirm with one remote screenshot plus `app.diagnostics().renderer.runtime.backend`.
- turbo-drift's drift-dust cloud (`main.ts:2612-2640`), pulse-tunnel's "discharge plume" and "ember fall" (`main.ts:1409-1440`, emitted only when `visualReviewCapture` is set), data-galaxy's "inference dust" (`main.ts:223`), and `GameRuntime` "aura-burst" (`GameRuntime.ts:3889-3902`) are all the same dead node kind on the default path.
- `prefabs.particleFountain` (`index.ts:5820-5840`) and `particles.fountain` add three particle nodes plus primitives (ground plane, torus, slider knob, colour **swatch boxes**). On production, only the props render.

### 2.3 How games actually make VFX

| Game | VFX technique | Evidence |
|---|---|---|
| All `game.*` kits | `effectToSceneNode`: hit, shockwave, dash-trail, slash-trail, ground-dust and super-flash are each **one primitive** (sphere, torus or box) with `emissiveIntensity = intensity*life` and `opacity = life`, scaled down over life. "aura-burst" is the only one routed to the dead `particles` node. | `packages/engine/src/agent-api/GameRuntime.ts:3879-3915` |
| blockfall-reactor | Line-clear "particle bursts" = **48 `primitives.box` shards**, one `material.neon` (opacity 0.74), parked at y=-50 when idle | `apps/showcase-blockfall-reactor/src/clear-fx.ts:15, 47-60` |
| turbo-drift | Dust = dead particle node; tyre marks and debris = primitives | `main.ts:2612-2640, 5163-5184` |
| others (courier, gravity-post, siege-golf, rooftop, vault, neon-swarm, mech-hangar …) | Emissive primitive spheres, rings and boxes; bloom and fog do the rest | grep §9 |

This is the core "early-Nintendo" signature: VFX are solid geometric shapes that shrink, not soft, textured, additive, camera-facing sprites with sub-frame animation.

### 2.4 Feature detail vs three.js ecosystem

| Feature | Aura3D reality | three.js r185 + ecosystem (three.quarks, three-nebula, `THREE.Points`+`PointsMaterial`, TSL `SpriteNodeMaterial`) |
|---|---|---|
| Billboards | Production: none. Fallback: octahedrons. Resident: square quads facing a fixed camera. Root workload: XY-plane squares. | Camera-facing `Sprite`/`Points`/instanced quads, any camera |
| Texture / alpha | None in any shipping path (`texturedBillboard: true` is metadata) | `map`, `alphaMap`, `alphaTest`, premultiplied alpha |
| Blending | Resident: `src-alpha / one-minus-src-alpha` only (`ResidentGPUParticleRenderer.ts:187`). Fallback: opaque. | Additive, normal, multiply, custom; quarks per-system blend |
| Flipbook | `resolveFlipbookUv` math (`SpriteFlipbook.ts:99`); `effects.flipbook` is "recorded but withheld … no flipbook pass is submitted" (`index.ts:3646-3666, 4536`) | quarks `uTileCount/vTileCount`, frame-over-life, random start frame; nebula `SpriteRenderer` |
| Soft particles | `computeSoftParticleFade` is a CPU scalar per sprite from user callbacks `sceneDepthAt(position)` (`ParticleRenderer.ts:32-56, 84-100`), so nothing samples a depth texture. Resident uses a fixed ground plane. A WGSL snippet `SOFT_PARTICLE_WGSL` is exported for "consumers" (`:58-63`). | quarks soft particles sample the depth texture; TSL `viewportDepthTexture` |
| Sorting | CPU `Array.sort` by distance², default `"none"` | `Points` sorted by `renderer.sortObjects`; quarks per-batch sort |
| Lighting | Resident: `color.rgb / (ambient + diffuse*max(dot(n,key),0))`, a **division** by the lighting factor (`ResidentGPUParticleRenderer.ts:483-488`), with the velocity direction used as the "normal" | quarks lit `MeshStandardMaterial` particles |
| Trails | Resident ribbons with alpha `0.45*(1-segment/depth)` (`:503-514`); root game "trails" are scaled boxes | quarks `TrailBatch`, `MeshLine`, `Line2` |
| GPU simulation | WebGPU compute with **full readback every frame** (B), or resident but camera-locked (C) | TSL compute (`instancedArray`, `storage`) feeding `SpriteNodeMaterial` with no readback (`webgpu_compute_particles*`) |
| Count | Root workload: exact quads, vertex buffer rewritten on the CPU | 1M+ particles in the r185 compute examples |

### 2.5 Particle-related evidence theater

- `collectParticleBudgetDiagnostics` (`index.ts:8344-8360`) reports `gpuReady: totalParticles >= 1000 && every texturedBillboard !== false`, which is computed from node metadata only. A route can be "GPU-ready" while producing zero pixels.
- `sceneKitPerformanceBudgets.particleFountain.evidence = "particle billboard layers collapse thousands of particles into a small draw-call set"` (`:9683`); `addFamily("particle billboards", Math.max(2400, …), 4, "textured billboard layers represent thousands of particles as batched impostors")` (`:9756`); `levels: ["near textured billboards", "mid trail impostors", "far glow/splash impostors"]` (`:9795-9796`). None of these exist on the default path.
- `tools/effects-vfx-visual-audit/index.ts` presents CPU particle presets drawn by Canvas2D radial gradients with `globalCompositeOperation="lighter"` (`:478-500`), not by the engine.

---

## 3. Fog and "volumetrics"

### 3.1 Forward fog: correct but minimal

GLSL chunk `environment_fog_common` (`packages/rendering/src/ShaderChunks.ts:472-517`):

```glsl
float a3dEnvironmentFogFactor(vec3 worldPosition) {
  float distanceToCamera = length(u_cameraPosition - worldPosition);
  ... linear / 1-exp(-d*density) / 1-exp(-(d*density)^2)
  float heightMultiplier = u_environmentFogHeightFalloff > 0.0
    ? exp(-max(0.0, worldPosition.y - u_environmentFogHeightReference) * u_environmentFogHeightFalloff) : 1.0;
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(u_environmentFogMaxOpacity, 0.0, 1.0);
}
```

- Exp2 matches three.js `FogExp2` (`fog_fragment.glsl.js`: `1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth)`). Aura uses radial distance where three uses view depth, a minor difference.
- **Height fog is not integrated.** It multiplies the distance term by the fragment's own altitude falloff. Real exponential height fog (UE `ExponentialHeightFog`, the Frostbite/Wronski analytic integral) integrates density along the view ray. With a multiplier, a distant mountain top gets *less* fog than its base no matter how much low fog the ray crosses, which flattens aerial perspective.
- **maxOpacity cap.** The root bridge sets `maxOpacity = 0.25 + intensity*0.55`, capped at 0.92 (`index.ts:12760-12763`). With the default intensity 0.5 (absent `intensity`) that is 0.525, so distant geometry **never fades into the fog colour** and keeps a hard silhouette against the background.
- **Fog never touches the background.** The background is a GL clear colour (`index.ts:13596`) and no sky geometry exists, so fog colour and background colour are independent strings. Mismatches produce a visible seam where fogged geometry meets the background. three.js has the same rule (fog only on fogged materials), but three.js scenes have a skybox or `Sky` mesh whose horizon colour can be matched. Aura routes have a flat rectangle.
- Usage: `effects.fog` appears in 17 of 18 showcase games (§9). It is the one atmospheric system that is actually used, and its defaults (`density 0.12`, `#9fb7d9`, `index.ts:3442-3449`) give 76% fog at 10 m with exp2. Games compensate with tiny densities (data-galaxy 0.018), which makes it almost invisible.

### 3.2 "Volumetric fog" is a CPU screen-space radial blur

`effects.volumetricFog` (`index.ts:3494-3511`) resolves through `resolveVolumetricFog` (`VolumetricFog.ts:105-144`) into two parts:

1. A forward term: `pow(max(dot(viewDir, lightDir),0), 6.0) * intensity * lightColor * (0.15+0.85*fogFactor)` plus a sin-hash dither (`ShaderChunks.ts:500-512`). This is evaluated **on surfaces only** and adds a view-dependent glow to geometry facing away from the light. It is not participating media: empty air in front of the background receives nothing.
2. A post pass `volumetric-light`: `volumetricLightPixels` (`PostProcessPass.ts:1177-1255`) is the GPU Gems 3 ch. 13 radial "god-ray" blur, implemented as **nested JavaScript loops over every pixel and every sample** on an 8-bit `Uint8Array` read back from the GPU (`Renderer.ts:1245-1262`: `this.device.readPixels(...)` then `volumetricLightPixels(input, …)` then `writePostProcessPixels`). The light anchor defaults to the constant UV `[0.5, 0.18]` (`VolumetricFog.ts:131`, `PostProcessPass.ts:1184`) rather than the projected sun position. The occlusion test is `sampleDepth >= 0.985 || luminance-derived source > 0.05`. The device inventory confirms no GPU target: "A5 volumetric light … own no GPU target (forward uniforms + CPU kernel…)" (`WebGL2Device.ts:2452-2454`).

Self-disclosure: `EnvironmentPlatform.ts:312-314, 507, 1155`: "volumetric clouds, froxel lighting, shadow-volume integration, multiple scattering, and physical atmosphere remain unsupported."

Comparison: three.js core has no froxel fog either. The ecosystem (`three-good-godrays` shadow-map raymarch, `postprocessing` GodRaysEffect on the GPU, TSL volumetric examples `webgpu_volume_*`, r185 `VolumeNodeMaterial`) runs these on the GPU at full rate, with shadow-map visibility in the good cases.

Used by: `showcase-deep-recovery` only.

### 3.3 `cinematic/` fog and haze are descriptors only

`createFogVolumeSystem` (`cinematic/FogVolumeSystem.ts`) returns `{mode, color, density, heightFalloff, rendererOwnedEvidence}` with the diagnostic string "Fog volume compiled as route-supported renderer atmospheric approximation." `createCinematicDepthHazePass` likewise returns a descriptor plus an evidence flag. No renderer reads these objects (grep: only `cinematic/index.ts` and `rendering/src/index.ts` re-export them).

---

## 4. Sky

### 4.1 No sky path in the default renderer

- Production clears to `colorToAcesInputClearColor(snapshot.background)` (`index.ts:13596`). `snapshot.background` is an `AuraColor`, one colour.
- `EnvironmentBackgroundPass` (`packages/rendering/src/EnvironmentBackgroundPass.ts`, equirect and cubemap) is supported by `Renderer` (`Renderer.ts:559, 649-653, 728`). `rg "environmentBackground" packages/engine/src` returns **no matches**. Root never sets it, so the HDR chain in B3 (`environments.hdri`) lights the scene but never appears behind it.
- The agent skill tells agents the opposite: "Wire the sky with `environments.hdri({ texture: assets.nightSky, … })`" and "Equirect seam: capture the sky at a yaw that puts the left and right edge in frame and confirm no visible seam" (`packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md:63-70, 86-89`). An agent following it gets IBL, no visible sky, and an unanswerable QA step.

three.js equivalent: `scene.background = envMap` (plus `backgroundBlurriness`, `backgroundIntensity`, `backgroundRotation`), `GroundedSkybox`, and `Sky`/`SkyMesh`. In r185 `Sky.js` has Preetham Rayleigh/Mie (`totalRayleigh`, `totalMie(turbidity)`, `sunIntensity`) and **procedural clouds** (`cloudScale`, `cloudCoverage`, `cloudDensity`, `cloudElevation`, `Sky.js:80-90, 117-177`).

### 4.2 `sky.dayNight`: a gradient table plus primitive spheres

`DayNightSky.ts` is a pure descriptor with nine hard-coded sRGB keyframes (`:74-84`) and the claim boundary "Time-of-day gradient dome … no Rayleigh/Mie model is implemented or implied" (`:8-11, 63-65`). There is no dome shader. The root builder (`index.ts:3730-3769`) turns it into:

| Element | Implementation |
|---|---|
| Sky gradient | **Not drawn.** Returns `background: dayFactor>0.5 ? horizonColor : …`. The zenith colour is computed and discarded, so the "gradient" is one clear colour. |
| Sun | `primitives.sphere` with emissive 2.2, at `(-6cos(az), 1+5sin(az), -7)`, scale 0.85. **7 world units from the origin**, so it parallaxes with the camera and sits inside the play space. |
| Moon | Same, scale 0.6. The descriptor's `phase` is ignored. |
| Stars | Up to 120 `primitives.sphere` nodes, scale `0.028 + size*2`, at z = -6.5. Each is a scene node (draw call), lit and depth-tested. |
| Clouds | Up to 48 `primitives.sphere` with **opaque `material.pbr` roughness 1**, squashed `[r*1.7, r*0.5, r*0.8]`, at z = -5.5. "Clouds" are grey ellipsoids. |
| Key light | One directional light |

Used by: 0 showcase games.

### 4.3 What games do instead

- `showcase-rooftop-buckets/src/environment.ts:21-56`: "Distant Twilight Sky Backdrop Gradient Panels" = three `primitives.box` slabs `[120, 28|18|12, 0.5]` at z ≈ -38 with flat emissive `#172554`, `#701a75`, `#ea580c`. This is a three-colour banded sky.
- `showcase-skyline-runner/src/main.ts:1122-1140`: documents that the previous backdrop was "one emissive box … with a single flat colour" covering 43.65% of the frame, now replaced by `planSkyBackdrop`.
- `planSkyBackdrop` (`packages/engine/src/agent-api/LayeredSceneComposition.ts:503-543`): emits `bandCount` (default 4) **discrete bands**, each with one `emissiveIntensity` (`0.52 - blend*0.34`). Stacked flat bands are the definition of a posterized retro sky. A per-vertex gradient quad, or one fullscreen-triangle gradient shader, would fix it with less code.
- `showcase-patrol-wing/src/sky.ts:449-458`: sun = emissive `primitives.sphere` at (-29, 21, -58), scale 3.25.

### 4.4 Procedural sky dome in the rendering package

`createProceduralSkyDome` (`EnvironmentPlatform.ts:395-415`) = `Geometry.uvSphere(r, 48, 24)` with `UnlitMaterial({ color: palette.sky })`, a **single flat colour**, front-face culled. It is reachable only through `createEnvironmentStage`/`createEnvironmentPreset`, which nothing in `packages/engine` or `apps/` calls.

---

## 5. Water, weather, wetness, terrain, vegetation, space

### 5.1 Water

| Module | What it is | Evidence |
|---|---|---|
| `WaterSurface.ts` | Descriptor: depth bands with baked "fresnel" colours, foam discs, wake segments. The header says "NO planar reflection/refraction targets. The 'refraction' here is a bounded color look only". | `:1-17, 83-99` |
| `water.surface` (root) | N `primitives.box` bands `[9, 0.024, span]` with `material.pbr roughness 0.12 metallic 0.05`, a sand box, foam = flattened `primitives.sphere`, boat = box | `index.ts:3870-3900` |
| `OceanSurface.ts` | Gerstner sum on the CPU for **telemetry** (`evaluateWaves`, buoyancy force). The claim boundary says "does not implement a production ocean renderer". | `:166, 170-300` |
| `WaterReflectionRefractionCapture` | Mirror camera + oblique clip, **128×128 rgba8** reflection and refraction targets, a composite that keeps `previousPixels: Uint8Array` (CPU composite). Not wired into root. | `:389-455` |
| Games | patrol-wing ocean = one `material.pbr` plane, `color #22566a, roughness 0.2, metallic 0.28` (water is a dielectric, metallic should be 0), plus emissive "lane glint" boxes at opacity 0.2 | `apps/showcase-patrol-wing/src/sky.ts:332-346` |

three.js comparison: `Water.js` (r185) = mirror RT + scrolling normal map + `distortionScale` + sun specular (`Water.js:61-160`). `Water2` adds a refractor and flow maps; `WaterMesh` is the TSL version. All have animated normals and real reflections at screen resolution. Aura has no animated water normal anywhere.

### 5.2 Weather and wetness

- `Weather.ts`: deterministic state (rain/snow intensity, wind, puddle patches, `visualDrops`).
- `weather.precipitation` (`index.ts:3772-3810`): creates the dead `effects.rain/snow` node, then pushes ≤160 `primitives.box` streaks (`scale [0.014, len*2.4, 0.014]`, **opaque `material.pbr`**) or ≤160 snow `primitives.sphere` nodes, sampled at `elapsedSeconds ?? 1.2`. **The rain does not fall** unless the route rebuilds the scene each frame, and each streak is its own node.
- `weather.wetGround`: a box slab with `applyWetnessToColor`/`applyWetnessToRoughness` scalars and puddles as `primitives.cylinder` discs (`roughness 0.05`). No puddle mask in a shader, no ripple normals, no rain-streak normals.
- `weather.lightning`: one directional light at intensity `1+flash*4`.
- `cinematic/RainParticleSystem.ts`: static `Geometry.points` + `wideLineSegments` with `UnlitMaterial` alpha 0.58–0.62 (`:30-50`), not animated, unused.

Used by games: 0.

### 5.3 Terrain

- `TerrainHeightfield.ts:143-215`: a real indexed grid mesh with central-difference normals and UVs. Its claim boundary says "terrain streaming, erosion, and clipmap LOD remain separate capabilities" (`:215`). Fine as geometry. **No material exists for it.**
- `TerrainTiles.ts` header (`:1-13`) says it "Builds the missing RENDERED systems … LOD-morphed heightfield tiles with holes + slope-based material blend". In code, `createTerrainTileGrid` returns plan objects (`key, morphFactor, holeCellCount, diagnostic` string, `:47-95`) and `resolveTerrainSlopeBlend` returns four CPU weights for one sample (`:101-115`). No geometry is generated, and no shader reads a morph factor or blend weights. `rg "splat|triplanar|u_terrain"` over `packages/rendering/src` finds only `MaterialPresets.ts:243`: "splat maps, triplanar blending, and distance texture LOD are not claimed."
- Games hand-roll terrain: aurora-lander `TerrainField` (local), patrol-wing `TerrainMesh` (local), pulse-tunnel `TerrainMaterial` (local scalars). Each is a single-material, vertex-coloured or flat-PBR mesh.

three.js: no built-in terrain either, but standard practice (and every modern three.js showcase) is a custom `onBeforeCompile`/TSL splat with triplanar rock, height and slope blending and detail normals. Aura's `material.*` exposes no way to author a splat (`texTransforms` per map only).

### 5.4 Vegetation and scatter

- `VegetationScatter.ts`: placement plus L-system telemetry. The claim boundary (`:134`): "not instanced vegetation rendering, billboards, collision, seasonal growth, procedural mesh generation".
- `planScatterInstances`, `scatterWindOffset`, `enforceFrameBudget` (`TerrainTiles.ts:162-285`, re-exported to root via `packages/engine/src/agent-api/Scatter.ts`) are a CPU planner. The wind offset is computed on the CPU and has to be applied by the route.
- The only adopter is `showcase-smart-city-control/src/main.ts:157-166`: "every admitted tree renders **two boxes (12 tris each), zero texture maps**".
- No alpha-cutout foliage card material is used anywhere. There is no wind vertex shader, no impostor/octahedral billboard baker, and no grass system. three.js has `InstancedMesh`/`BatchedMesh` plus alpha-tested cards plus TSL `positionNode` wind; the ecosystem has `three-instanced-grass`-style and `ez-tree`.

### 5.5 Space

`SpaceEnvironment.ts`: seeded stars, nebula and dust descriptors (x, y, depth, alpha). The only consumer is `examples/game-slice/main.ts:913` (telemetry booleans `renderedSpaceEnvironment`, `layeredSpaceBackground`). Space-themed showcases (orbital-defense, data-galaxy, aurora-lander) use fog plus primitives.

---

## 6. `packages/rendering/src/cinematic`

All 14 files are factories returning plain objects with `rendererOwnedEvidence: createRendererOwnedEvidenceFlag({...})` and diagnostic strings such as "Bloom is a renderer postprocess pass over emissive scene content" (`BloomPass.ts`), "Depth haze is renderer-owned atmospheric composition; DOM fog panels do not satisfy this evidence" (`DepthHazePass.ts`). `BloomPass` (26 lines), `FilmGrainPass` (24), `VignettePass` (25), `WetReflectionApproximation` (27) and `CinematicDepthComposition` (30) contain no rendering. `RainParticleSystem` builds static `RenderItem`s, and `GlowCardSystem`/`EmissivePracticalLightSystem` are similar. Nothing in `packages/engine` imports them except the parity index. This package exists to satisfy evidence checklists. **Delete it or fold it into real passes.**

---

## 7. Decals

- `ProjectedDecalGeometry.ts` (439 lines): real box and ellipse clipping of a source mesh (`clipPolygonToBox`, `clipPolygonToEllipse`), normal offset, UVs, raycast placement. This is roughly three.js `DecalGeometry`.
- Root `decals.*` (`packages/engine/src/agent-api/Decals.ts`): `AURA_DECAL_MAX_DECALS = 32`, "forward transparent geometry (one draw call per decal) … A deferred decal pass is roadmap" (`:51-61`); angle and distance fade; polygonOffset.
- Gaps: no normal or roughness decal blending (paint only), no projection onto skinned meshes, no screen-space or deferred decals, no atlas batching.
- Used by games: **0** (turbo-drift's "decals" mention is a comment, `main.ts:5163, 5184`). Tyre marks, scorch marks, blood and bullet holes, which carry much of the visual richness in modern games, are absent from every showcase.

Grade: exists, works, public API, unused. Quality is equal to three.js core, below the ecosystem.

---

## 8. Environments and materials packages, presets

### 8.1 Default IBL environment (affects every game's reflections)

`createProductionRuntimeEnvironment` (`index.ts:12628-12700`) maps `environments.studio` to `"studio"`, `nightCinematic` to `"evening"`, and so on, and calls `createExternalParityEnvironmentLighting(preset)`:

- Source `createExternalParityGeneratedHdrEnvironmentMapSource(preset, 128, 64)` (`ExternalParityRenderPreset.ts:223-256`): per-row sky/horizon/ground mix, one `pow(...,4)*pow(...,3)` softbox blob, and a full-width `sin` stripe (`textureVariation ≈ 0.035`). A 128×64 equirect with no sun, no sky detail and no ground detail.
- `createEnvironmentMapResourceSet(..., { toneMapping: "reinhard", outputColorSpace: "srgb", specularLevels: 5, specularBlurRadius: 3, irradianceWidth: 16, irradianceHeight: 8, brdfLutSize: 32 })` (`:138-151`) produces a **tone-mapped, 8-bit sRGB** environment `Texture` (`:152-158`). Tone-mapping the IBL source clips the HDR softbox, so specular highlights on cars, metal and wet surfaces cannot exceed ~1.0. Box-blurred mips are not GGX-convolved.
- Outdoor games still choose `environments.studio` (turbo-drift alpine race `main.ts:3002-3006`, siege-golf). They get studio softbox reflections in a mountain scene.
- `@aura3d/environments` itself warns when `faceSize < 256` or `mipCount < 8` (`packages/environments/src/PMREMPreset.ts`). The engine default is 128×64 equirect with 5 levels.

three.js: `PMREMGenerator` on a real HDR (`RGBELoader`/`UltraHDRLoader`), 256-px cube faces, GGX importance-sampled lobes, half-float, `scene.environment`. `RoomEnvironment` gives a credible procedural studio. In r185, `scene.environment` plus `Sky` rendered into PMREM gives a physically matched outdoor IBL in about 5 lines.

### 8.2 Environment corpus manifest: aliased HDRIs

`fixtures/three-compat/environments/manifest.json` lists 12 presets, 6 of them `kind: "real-hdri"`. Only three files exist (`fixtures/environment-corpus/hdri/`: autumn_field_puresky_1k, kloppenheim_06_puresky_1k, studio_small_08_1k, about 1.1–1.5 MB each, all 1k). Three presets re-point at those files with identical sha256:

| Preset id | Actual file | sha256 prefix |
|---|---|---|
| industrial-sunset-puresky | autumn_field_puresky_1k | e60470d3a0f2 |
| spruit-sunrise | kloppenheim_06_puresky_1k | 206c67e3a1b9 |
| venice-sunset | **studio_small_08_1k** (an indoor studio) | f6a989f89432 |

Every procedural preset declares `resolution: 1024×512`, while the generator used at runtime is 128×64. No showcase uses `environments.hdri` (§9).

### 8.3 `@aura3d/materials`: generated padding

- `THREE_COMPAT_PBR_MATERIAL_LIBRARY = Array.from({ length: 50 }, (_, i) => createPreset(i, CLASSES[i % 20]))` (`PBRMaterialLibrary.ts:80-82`). `baseColor` is `hue = (i*41) % 255` spread over RGB (`:41, 53`), so "stone", "wood" and "leather" get arbitrary hues. Roughness is `0.18 + (i%8)*0.1`.
- `THREE_COMPAT_TEXTURE_SETS = Array.from({ length: 25 }, …)` cycles 12 sample GLBs (Duck, Avocado, DamagedHelmet, BoomBox, …) and assigns map URIs `embedded://baseColor`, `embedded://normal` and so on (`TextureSet.ts:18-56`). A "wood" preset's texture set can be the Duck's textures. These are not material textures.
- `GAME_READY_MATERIAL_PRESETS.carPaint`: "flakeNormalScale rides the normal slot as a fine sparkle normal", with snippet `material.clearcoatPaint({ …, normalScale: 0.35 })` and **no normal map** (`GameReadyMaterialLibrary.ts:50-70`). `normalScale` without a normal texture is a no-op, so there are no flakes.
- `foliage` and `concreteAsphalt` presets exist as parameter tables, and no game uses them.
- The package has no texture files, no procedural noise shader, no detail maps and no triplanar. Its browser export is tables and preview-scene descriptors only (`browser-index.ts`).

### 8.4 `EnvironmentPresetPack`: mood normalization

`AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK` (`EnvironmentPresetPack.ts:25-46`) applies `exposureFactor: 2.114618` to the night ("evening") source so its mean luma matches daylight (0.60698). Normalizing night to daytime brightness removes the night look. This only feeds an SSIM regression gate (`pmremRowSsimFloor: 0.975`) and is not consumed by any renderer path. It is harmless today, but it shows the test-driven thinking behind the look: the metric was "consistent" instead of "beautiful".

### 8.5 `EnvironmentPreset` (named presets)

`createNamedEnvironmentPreset("outdoor" | "ocean" | …)` (`EnvironmentPreset.ts:47-128`) returns `createEnvironmentPreset` stages: a single-colour sky dome, a "shadow-catcher" or grid ground, stage accents. `productionReady` is computed from a capability list. Nothing in `packages/engine`, `apps` or `templates` calls it.

---

## 9. Adoption in the showcase games (grep across `apps/showcase-*/src`)

API calls per game, deduplicated (`effects.X`, `sky.*`, `weather.*`, `water.*`, `environments.*`, terrain/vegetation/decals/flipbook):

| Game | fog | bloom | volumetricFog | particles | env | sky/weather/water/decals/flipbook/terrain/veg (engine) |
|---|---|---|---|---|---|---|
| aurora-lander | Y | bloom | – | – | – | local `TerrainField` only |
| bank-shot | Y | neonBloom | – | – | – | – |
| blockfall-reactor | Y | neonBloom | – | (48 box shards) | – | – |
| cinematic-architecture | Y | bloom | – | – | studio + nightCinematic | – |
| courier-rush | Y | neonBloom | – | – | – | – |
| data-galaxy | Y | bloom | – | **dead node** | – | – |
| deep-recovery | Y | neonBloom | **Y** | – | – | – |
| digital-twin-ops | Y | bloom | – | – | – | – |
| gallery-shift | Y | neonBloom | – | – | – | – |
| gravity-post | Y | neonBloom | – | – | – | – |
| mech-hangar | – | bloom | – | – | – | – |
| neon-swarm | Y | bloom | – | – | – | – |
| orbital-defense | Y | bloom | – | – | – | – |
| patrol-wing | Y | neonBloom | – | – | – | local `TerrainMesh`, PBR plane ocean |
| pulse-tunnel | Y | neonBloom | – | **dead node** (review capture only) | – | – |
| rooftop-buckets | Y | neonBloom | – | – | – | box sky bands |
| siege-golf | Y | neonBloom | – | – | studio | – |
| skyline-runner | Y | neonBloom | – | – | – | `planSkyBackdrop` bands |
| smart-city-control | Y | bloom | – | – | – | `planScatterInstances` with 2-box trees |
| turbo-drift-circuit | Y | neonBloom | – | **dead node** | studio | – |
| webgpu-particle-lab | Y | – | – | **dead node** ×2 | – | – |

Totals: `sky.dayNight` 0, `weather.*` 0, `water.*` 0, `decals.*` 0, `effects.flipbook` 0, `effects.beam` 0, engine terrain modules 0, engine vegetation 0, `environments.hdri` 0, `@aura3d/materials` presets 0, `@aura3d/environments` 0.

Bloom note (shared with the postprocess audit): WebGL bloom defaults to `"performance"` (`postprocess/NativeBloomPyramid.ts:34`), a single-scale ping-pong with an integer pixel kernel clamped to 1–4 (`resolveNativeBloomRadius`, `index.ts:12790-12794`). Most games opt into `"balanced"` but at intensity 0.06–0.44 with `antiBlowout` capping at 0.92. Emissive-primitive VFX therefore get a tight, faint halo, not the wide soft glow of `UnrealBloomPass` (5-mip chain) or pmndrs `postprocessing` `BloomEffect` (mipmap blur). Combined with opaque geometric VFX, this produces "glowing plastic shapes".

---

## 10. Agent-authoring failure (bucket E)

- `aura3d-materials-environments` SKILL steps 3 and 6 (`SKILL.md:41-45, 63-70`) teach `sky.dayNight`, `weather.precipitation`, `water.surface` and `environments.hdri` "for the sky" as the first-choice outdoor path. Following it yields primitive spheres, boxes and no visible sky. The skill never states that these builders emit primitives, or that HDRIs are not drawn as backgrounds.
- `aura3d-game-art` (`SKILL.md:21-25, 93-94`) correctly states that the flipbook is withheld and tells agents to label the route `prototype`. The result is that agents produce **no** sprite VFX and fall back to primitives. The skill directs effort to art that has no consumer.
- No skill teaches a sprite/billboard particle path, because none exists on the default renderer. An agent asked for "explosions" has two options: the dead `effects.particles` node (invisible) or primitives (Atari).
- `effects.particles` exposes `texturedBillboard`, `materialMode: "smoke"` and `alphaOverLife`. The API surface implies a modern VFX system and delivers nothing on production. This is an affordance lie, and it pushes agents into tuning parameters that have no effect (turbo-drift's comments in §2.2 show an agent doing exactly this against the fallback renderer).

---

## 11. Fake parity list

1. `effects.particles`, `effects.rain`, `effects.snow`: public builders with rich option sets and zero production pixels (`index.ts:3618-3715` vs `:3724-3728`).
2. `effects.flipbook`, `effects.beam`: validated, then "withheld" (`:3646-3690, 4536-4537`).
3. Particle budget diagnostics `gpuReady` and the scene-kit "textured billboard impostor" evidence strings (`:8344-8360, 9683, 9756, 9795-9796`).
4. `effects.volumetricFog`: named volumetric, actually a surface lobe plus a CPU 8-bit radial blur anchored at a fixed UV (`VolumetricFog.ts:131`, `PostProcessPass.ts:1177-1255`, `Renderer.ts:1245-1262`).
5. `sky.dayNight`: "time-of-day sky" made of primitive spheres; zenith colour discarded (`index.ts:3730-3769`).
6. `water.surface`: "rendered water material" made of opaque boxes (`index.ts:3870-3900`).
7. `weather.precipitation`: static PBR boxes (`index.ts:3772-3810`).
8. `TerrainTiles.ts` header "Builds the missing RENDERED systems" while it returns plans and weights only (`:1-13`).
9. `ResidentGPUParticleRenderer`: presented as GPU particles with soft fade, actually camera-locked with ground-plane fade (`:4-10, 352-365`).
10. `RootGpuParticleWorkload`: "native compute", actually readback plus CPU vertex rewrite of XY-plane squares (`:15-60`).
11. `cinematic/*` evidence-flag descriptors (§6).
12. `@aura3d/materials` 50 generated presets and 25 aliased texture sets (§8.3).
13. Environment manifest aliased "real HDRIs", including venice-sunset as an indoor studio file (§8.2).
14. `GameReady carPaint` "flake normal" without a normal map (§8.3).
15. `tools/effects-vfx-visual-audit` draws engine particle data with Canvas2D gradients (§2.5).
16. `apps/showcase-webgpu-particle-lab` claim "visible particle field is produced by Aura3D effects.particles" (`main.ts:318`), contradicted by the bridge code.

---

## 12. Recommendations (ordered by pixels gained per unit effort)

### P0: make the default path draw real VFX and a real sky

1. **Native billboard particle pass in the production renderer.** One instanced quad draw per emitter: camera-facing (or velocity-stretched) quads; per-instance position, size, rotation, colour and frame; `map` plus flipbook (`uTile`, `vTile`, frame over life, random start); additive and premultiplied-alpha blend modes per `materialMode`; **soft particles from the renderer-owned depth texture** (already exists for SSAO/SSR); back-to-front sort per emitter on the CPU (or none for additive). Feed it from stack A (CPU modules) by default and from B **without readback** (storage buffer to vertex pulling) on WebGPU. Wire `effects.particles`, `effects.rain`, `effects.snow` and `effects.flipbook` to it. Ship 6–8 built-in CC0 sprite textures (soft dot, smoke puff 8×8 flipbook, spark streak, flame flipbook, rain streak, snowflake, ring shockwave, flare) as engine assets so `materialMode` maps to a texture without agent asset work. This is roughly three.quarks-lite and the single largest visual upgrade available.
2. **Replace `GameRuntime.effectToSceneNode` primitives** with emitters on that pass: hit = spark burst plus flash sprite, shockwave = textured ring sprite with distortion-free additive falloff, dash/slash trail = ribbon (port the Resident ribbon math to the root camera), ground-dust = smoke flipbook.
3. **Wire `environmentBackground` in the root bridge.** Show the HDRI for `environments.hdri` (with `backgroundBlurriness`, `backgroundIntensity`, `rotation`), and add a **procedural sky background pass**: port three.js r185 `Sky.js` (Preetham plus clouds, MIT) as a fullscreen-triangle background pass, driven by `sky.dayNight({hour})` sun direction. Render the same sky into the IBL source (as three.js does with `PMREMGenerator.fromScene(sky)`) so outdoor reflections match the visible sky. Make the background-colour path a two-stop vertical gradient (zenith/horizon) at minimum.
4. **Make fog compose with the sky.** Fog the background pass with the same fog function along the view ray (density integrated to `far`), default `maxOpacity` to 1.0, and implement analytic exponential height fog (integrated along the ray) to replace the multiplier.
5. **Default outdoor environment.** Raise the generated environment to at least 256-px cube faces in half-float without tone-mapping the source, GGX-prefiltered (PMREM-equivalent), and add an `environments.outdoor` / `environments.sky` preset derived from item 3. Stop mapping outdoor racing and flight games to `"studio"`.

### P1: world systems that players see constantly

6. **Water material.** Port the three.js `Water.js` model as a real material: scrolling dual normal maps (ship one CC0 water normal), Fresnel (Schlick, F0 = 0.02, metallic 0), sun specular, depth-based colour absorption from the renderer depth texture, and an SSR or planar reflection at half resolution on the GPU (move `WaterReflectionRefractionCapture` off the CPU composite and raise it from 128²). Make `water.surface` emit one plane with that material. Delete the band and sphere builder.
7. **Terrain splat material.** Height- and slope-blended 4-layer splat with triplanar on steep faces, detail normal, and distance fade. Feed it from `resolveTerrainSlopeBlend` logic moved into GLSL/WGSL. Expose it as `material.terrain({...})` and make `TerrainHeightfield` geometry root-reachable.
8. **Foliage.** Alpha-tested card material with two-sided lighting and transmission approximation, a vertex-shader wind using `scatterWindOffset` parameters, `instances.*` batching, and an impostor at distance. Ship 3–4 CC0 foliage cards. Replace the "two boxes per tree" adoption.
9. **Weather.** Rain = GPU streak particles via item 1 (velocity-stretched, camera-relative volume that wraps around the camera), plus screen-space rain ripples and a wet-surface shader term (darken albedo, lower roughness, puddle mask texture with ripple normals) in the PBR shader, driven by the existing `AtmosphereWetness` math.
10. **Decals in games.** Tyre marks (turbo-drift), scorch marks (blockfall, orbital-defense), impact marks (courier, gravity-post) using existing `decals.*`. Add normal and roughness blending.
11. **GPU volumetric light.** Move `volumetricLightPixels` to a shader pass at half resolution, project the dominant light to screen UV each frame, and sample the shadow map along the ray for the directional light (the three-good-godrays approach). Keep the CPU kernel only as a test oracle.

### P2: delete, rename, stop lying

12. Delete or move to `tools/`: `cinematic/*` descriptor systems, `EnvironmentPresetPack` night normalization, `ResidentGPUParticleRenderer`'s hard-coded camera (or generalize it to take a view-projection uniform), the Canvas2D VFX "visual audit", and the `@aura3d/materials` generated 50/25 libraries. Replace them with a small set of real texture-backed presets (5–10 CC0 PBR sets at 1k: asphalt, concrete, grass, rock, wood, metal-painted, car-paint with flake normal).
13. Remove `sky.dayNight`'s sphere stars, clouds and sun once item 3 lands (render stars and moon in the sky shader).
14. Fix the environment manifest: delete aliased HDRI entries or add the real files.
15. Change scene-kit and particle diagnostics to report **observed** draws from the renderer rather than node metadata, and add a "zero-pixel effect" error (not a warning) when an effect node has no renderer consumer.
16. Update `aura3d-materials-environments` and `aura3d-game-art` skills after the work lands. Until then, tell agents the truth: `sky.dayNight`, `water.surface` and `weather.precipitation` emit primitives, and HDRIs light but are not drawn as a background.

---

## 13. Preserve (sound subsystems)

- `effects/ParticleSystem.ts` plus modules (Emitter shapes, bursts, Force/Color/Size/Velocity/Collision/Turbulence/SubEmitter/Trail): a good CPU simulation core. Keep it as the default feeder for the new billboard pass.
- `GPUParticleBackend.ts` WGSL compute kernels (`createEffectsParticleComputeShader`): keep the kernels and remove the per-frame readback by binding the storage buffers to a vertex-pulling draw.
- The `ResidentGPUParticleRenderer` ribbon and sprite vertex-pulling WGSL pattern: reusable once the camera becomes a uniform.
- `ProjectedDecalGeometry.ts` and root `decals.*` (clip, fade, polygonOffset).
- The `environment_fog_common` GLSL chunk and forward fog uniform plumbing (`ForwardPass.ts:525-640`): extend it, do not replace it.
- `TerrainHeightfield.ts` geometry plus collider descriptor; `OceanSurface.ts` Gerstner evaluation (move it to the vertex shader); `planScatterInstances` / `enforceFrameBudget` CPU planners.
- The `EnvironmentBackgroundPass` equirect/cubemap implementation: it only needs root wiring.
- The `Weather.ts` / `AtmosphereWetness.ts` deterministic state math (good drivers for shader uniforms).
- Honest claim-boundary strings (`DayNightSky.ts:63-65`, `WaterSurface.ts:1-17`, `EnvironmentPlatform.ts:312-314`, `Decals.ts:58-61`): they are accurate and should be surfaced to agents, not buried.

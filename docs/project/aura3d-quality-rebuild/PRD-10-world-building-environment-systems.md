# PRD 10: World Building / Environment Systems

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed. Owner area: `packages/rendering/src/{TerrainHeightfield,TerrainTiles,VegetationScatter,WaterSurface,OceanSurface,EnvironmentPlatform,EnvironmentPreset,EnvironmentPresetPack,SpaceEnvironment}.ts`,
new `packages/rendering/src/world/`, `packages/engine/src/agent-api/{index,Scatter,LayeredSceneComposition}.ts`,
new `packages/engine/src/agent-api/world/` and `packages/engine/src/production-runtime/world/`, `packages/environments`,
`packages/physics-rapier/src/HeightfieldLayout.ts` (consumer only), `fixtures/environment-corpus/`,
`fixtures/three-compat/environments/manifest.json`, `benchmarks/quality-rebuild/`.

Evidence base: research `08-vfx-atmos-environments.md` §5, §8, §9, §12 (primary for code facts), `11-asset-pipeline.md`
(textures, HDRIs, kits, optimization), `17-games-g1..g5.md` (per-game world construction), `16-route-local-extraction.md`
rows 14/15 (route-local environment and terrain builders), `07-webgpu-gpu-perf.md` §2.3, §3.3, §3.4 (instancing, culling, LOD),
`18-completeness-critic.md`, `19-claim-verification.md` (corrected statements only: C1, C4, C5, C6, C9, C10, C11, C12),
`21-game-vision-judgment.md` (authoritative for every visual category), `23-benchmark-vision-judgment.md` scenes
09/10/13/16/17/18 (authoritative same-scene comparison vs three r185), `22-benchmark-pass1-code-metrics.md` (harness fair;
16-instancing is an engine bug), `20-game-scorecards-code-pixelstats.md` (performance and non-visual categories only),
capture report `evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, "ANGLE Metal Renderer: Apple
Paravirtual device", sha `c08d8acb`).

Rule for this PRD: a world system counts as a feature only when it changes pixels on the default `createAuraApp`
production path, in a shipped game, at gameplay scale. Descriptors, planners, telemetry, diagnostics strings, claim
boundaries, unit tests, and fixtures that only exist as oracles count as zero. The completion gate is a human plus
vision-model judgment that the shipped games' worlds (ground, vegetation, water, set dressing, sky and light mood) look
competitive with a well-built three.js r185 browser game. Nothing in this document may be cited as evidence that Aura3D
is three.js-quality until the thresholds in §16 are met.

---

## 1. Problem statement

Aura3D has no world-building layer. Every shipped game builds its world from primitives, flat-colour GLBs and painted
cards. It does so in route-local code, inside a flat-clear-colour void, lit by a rig that usually has no IBL. The engine
modules whose names suggest world systems are descriptors, planners or CPU telemetry. The builders that do emit pixels
emit grids of boxes and spheres.

1. **Ground.** The engine has a real heightfield mesh builder (`TerrainHeightfield.ts:143-217`) but no terrain material,
   no splat, no triplanar, no LOD and no root API. `TerrainTiles.ts` claims to build "the missing RENDERED systems"
   (`:1-13`) yet returns plan objects and four CPU weights (`:47-114`). Games hand-roll single-material terrain
   (patrol-wing `sky.ts:32-230`, aurora-lander `terrain.ts`, 249 LOC) or use infinite flat planes (siege-golf, turbo-drift,
   benchmark 09). Vision judge: "untextured ground plane ... 50–65% of every frame being flat grey" (21, turbo-drift);
   "faceted flat-green hill, floating slab runway" (21, patrol-wing); "one untextured green blob" (21, aurora-lander).
2. **Vegetation and scatter.** `VegetationScatter.ts:134` disclaims "instanced vegetation rendering, billboards ...".
   `planScatterInstances` and `scatterWindOffset` are CPU planners whose output the route must apply
   (`TerrainTiles.ts:135-285`). The only adopter draws "two boxes (12 tris each), zero texture maps" per tree
   (`apps/showcase-smart-city-control/src/main.ts:157-166`). Shipped trees are cylinder+sphere lollipops (17-g2 X8; 21
   siege-golf "ellipsoid blobs as hills and trees"; 21 turbo-drift "sphere-on-stick trees"). No foliage material, no
   alpha cutout on the agent API, no wind shader, no impostors, no grass. The instancing it would need is broken:
   `createProductionInstanceTransforms` drops `node.size` (`agent-api/index.ts:14747-14754`), which produces benchmark
   16's shrunken field (23 §16: "implementation-bug", Aura 2.5 / three 4.5). Instances above 64 allocate buffers every
   frame and leak VAOs (07 §3.3). WebGPU renders only 4 distinct instances (07 §2.3). The shadow depth pass ignores
   instance transforms and alpha cutout (19 C4).
3. **Water.** `water.surface` emits opaque PBR box bands, a sand box, sphere "foam" and a box "boat"
   (`agent-api/index.ts:3870-3905`). `OceanSurface.ts` evaluates Gerstner waves on the CPU for telemetry and states that it
   "does not implement a production ocean renderer" (08 §5.1). The planar capture is a 128×128 rgba8 CPU composite that is
   not wired to the root renderer (08 §5.1). The only shipped ocean is one `material.pbr` plane with `metallic 0.28`
   (water is a dielectric) and no normals or reflection (`apps/showcase-patrol-wing/src/sky.ts:329-338`, 17-g2). Deep
   Recovery is underwater and has "no seabed, reef, terrain, or water volume" (21).
4. **Set dressing.** `prefabs.cityBlock` / `city.block` is about 25 primitive boxes, a plane and an instanced box tower
   family (`agent-api/index.ts:5842-5901`, alias `:9241-9245`). Courier Rush scales it 6× (`city.ts:760-769`). The
   root manifest has 0 texture or environment assets (11 §1). 54 of the 120 model ids referenced by games have zero images
   (11 §1). There is no kit, snap or socket concept, no spline/extrude tool for roads, rails or tunnels, and no placement
   API beyond hand-written loops. Group transforms are composed additively, so rotated parents do not rotate child offsets
   (19 C6, `agent-api/index.ts:17982-18006`). Route-local environment builders total about 5,000 LOC: deep 953,
   rooftop 1,113, gallery 695, bank 336 (16 row 14).
5. **Light mood per place.** Every outdoor game either gets studio softbox reflections (turbo-drift and siege-golf use
   `environments.studio`) or no IBL at all. A `lights.ambient()` without an `environments.*` node zeros IBL
   (`agent-api/index.ts:12693-12707`). Per 19 C1 that is 15 of the 18 games; Aura Clash avoids it through a separate
   compatibility path. The generated environments are 128×64 Reinhard-to-8-bit maps, and on WebGL2 only level 0 is
   sampled (19 C10). Exposure is fixed at 1 on the root path, so per-category exposure tables (`index.ts:4204-4214`) and
   `colorGrade.exposure` have no effect (19 C12). Shadow strength is 0.24–0.38 (19 C11), and CSM cannot run from root
   (19 C5). There is no sky: the production bridge clears to one colour (`index.ts:13596`) and never sets
   `environmentBackground` (19 C9). There is no packaged "outdoor day / sunset / night city / interior / space / underwater"
   rig, so every route hand-places about 190 point lights in total, plus ambient and directional lights (16 row 6).
6. **Environments are not good by default.** An agent calling `createAuraApp` with a terrain-and-trees prompt has no
   engine path that produces a textured ground, real trees, a sky and outdoor light. The skill points agents at
   `sky.dayNight` (sphere stars and clouds, `index.ts:3730-3769`), `water.surface` (boxes) and `environments.hdri` "for the
   sky" (lights only, never drawn) (08 §10).

Pixel consequences (authoritative vision judgments, research 21; scores out of 10):

| Game | environment_world | atmospheric_effects | Dominant world complaint (21) | Target biome rig (§6.3) |
|---|---|---|---|---|
| aura-clash-showcase | 4 | 1 | brownstone kit "unrelated to the arena: a flat plane dropped in front of a facade"; "no reflections ... no sky" | night-city |
| aurora-lander | 1.5 | 1 | "one untextured green blob"; "in 3 of 4 shots no world at all"; "no aurora" | polar-night (outdoor-night variant) |
| bank-shot | 2 | 1 | "Black void on desktop; empty untextured box room on mobile. No pool hall, no lamp, no props." | interior-warm |
| blockfall-reactor | 4 | 2 | backdrop is "flat plates with no parallax"; "bottom third is a void" | interior-neutral (arcade) |
| courier-rush | 2 | 1 | "Untextured box buildings and a flat road. No street furniture ... skyline silhouette" | night-city |
| deep-recovery | 2.5 | 1.5 | "No seabed, reef, terrain, or water volume" | underwater |
| gallery-shift | 4 | 1 | "a dollhouse of extruded boxes floating in a black void" | interior-neutral (museum) |
| gravity-post | 2.5 | 1 | "Flat solid-color void ... no skybox, nebula or star depth" | space |
| mech-hangar | 2.5 | 1.5 | "Flat planes and black void ... No architecture, props, or set dressing" | interior-industrial |
| neon-swarm | 2 | 2 | "Flat untextured planes, one decal, no set dressing, sky, walls, or architecture" | night-city |
| orbital-defense | 1 | 0 | "Solid near-black clear color. No starfield, skybox, nebula, or distant bodies." | space |
| patrol-wing | 2 | 1 | "Faceted flat-green hill, floating slab runway, 3 rocks, a few cone trees"; "plane floating in a flat navy void" | golden-hour (coastal) |
| pulse-tunnel | 3 | 1 | "A single repeating corridor of flat boxes and planes in a void" | space (synth variant) |
| rooftop-buckets | 3 | 2 | "Enclosed box room ... no rooftop, skyline, or dusk sky" | golden-hour → night-city (dusk) |
| siege-golf | 3.5 | 2 | "infinite flat green plane, with ellipsoid blobs as hills and trees" | outdoor-day |
| skyline-runner | 5 | 3 | "backdrop is gorgeous ... but it's a static plate"; 3D world is "six platforms" | alpine-snow |
| turbo-drift-circuit | 2.5 | 3 | "Flat-shaded plane world, sparse primitive trees, two stands, empty sky" | golden-hour (alpine) |
| vault-breakers | 2 | 1 | "Flat-colored box room with line decals; no arcade, no props, no depth" | interior-neutral (arcade) |

Mean environment_world is 2.7/10. No game exceeds 5, and the one game at 5 (skyline-runner) earns it from a painted 2D
plate. Same-scene benchmarks against three r185 (23), on identical input: 09-outdoor-environment Aura 3.5 / three 5.5
("Sky is a flat colour", "greyed-out haze"); 13-ibl-only 3.5 / 6 ("Background is a flat blue color instead of the HDRI");
16-instancing 2.5 / 4.5 (transform bug); 17-large-environment 3.0 / 4.5 (no visible cast shadows, flat sun);
18-game-scene 3.5 / 5.0. In every case the three.js reference is itself only "competent but dated", capped by
primitive programmer-art content. Matching three.js on these scenes is therefore the floor, not the goal. The goal
requires real world content, which this PRD supplies.

What must exist:

- A GPU terrain with splat/height-blended/triplanar material, CDLOD geometry and a physics heightfield from one source.
- GPU-instanced scatter for trees, rocks and props, with a foliage material (alpha cutout, two-sided, translucency),
  a global wind field applied in both colour and shadow passes, octahedral impostors, and a near-camera grass field.
- A water material (Gerstner vertex waves, dual normals, Fresnel, refraction with Beer-Lambert absorption,
  sky/IBL/planar reflection, shoreline foam) plus an underwater mode.
- Kit-based set dressing (snap grid, sockets, auto-instancing), spline extrusion for roads, tracks and tunnels,
  room and street builders, and a deterministic placement API.
- Packaged biome rigs (sky + IBL + sun + shadows + fog + post) that look good with zero tuning.
- A time-of-day driver that moves all rig parts coherently.
- Curated, licence-clean texture, foliage, kit and HDRI content shipped as engine assets.
- Environment defaults that never fall back to a void.

---

## 2. Evidence from current code

Lines marked "read" were opened on this branch while writing this PRD. Others cite the research file named.

### 2.1 Terrain

| # | Location | Fact | Source |
|---|---|---|---|
| T1 | `packages/rendering/src/TerrainHeightfield.ts:143-217` | `createTerrainHeightfieldGeometry` builds a real indexed grid (`VertexFormat.P3N3T4T2`) with central-difference normals, a tangent `[1, slopeX, 0]`, UVs and a Rapier-ready `heightfield` collider descriptor. Claim boundary: "terrain streaming, erosion, and clipmap LOD remain separate capabilities" (`:215`). There is no material and no root API. | read |
| T2 | `TerrainHeightfield.ts:133-141` vs `TerrainTiles.ts:116-133` | `sampleTerrainHeightfield` uses `Math.round` (nearest texel), but `queryTerrainHeight` documents itself as a "bilinear sample". Physics and visual heights therefore disagree by up to half a cell slope. | read |
| T3 | `packages/rendering/src/TerrainTiles.ts:1-13, 47-96` | The header says "Builds the missing RENDERED systems ... LOD-morphed heightfield tiles with holes + slope-based material blend". `createTerrainTileGrid` returns `TerrainTilePlan` objects with a `diagnostic` string and generates no geometry. Nothing reads `morphFactor`. | read; 08 §5.3 |
| T4 | `TerrainTiles.ts:98-114` | `resolveTerrainSlopeBlend` returns 4 CPU weights (rock/grass/sand/snow) for one sample. No shader exists. | read |
| T5 | `packages/rendering/src/MaterialPresets.ts:243` | "splat maps, triplanar blending, and distance texture LOD are not claimed." `rg "splat\|triplanar\|u_terrain"` finds nothing else. | 08 §5.3 |
| T6 | `apps/showcase-patrol-wing/src/sky.ts:32-230`, `apps/showcase-aurora-lander/src/terrain.ts` (249 LOC), `apps/showcase-skyline-runner/src/level-layout.ts` (`skylineTerrainWarp`) | Route-local terrains are single-material, vertex-coloured or flat PBR. Patrol-wing documents that "the root physics facade exposes no heightfield constructor". | 16 row 15; 17-g2 |
| T7 | `packages/physics-rapier/src/index.ts:561`, `HeightfieldLayout.ts:1-15` | `R.ColliderDesc.heightfield` exists with a row-major layout converter, but it is not reachable from a root terrain API. | read |

### 2.2 Vegetation, scatter, instancing

| # | Location | Fact | Source |
|---|---|---|---|
| V1 | `packages/rendering/src/VegetationScatter.ts:134` | Claim boundary: "not instanced vegetation rendering, billboards, collision, seasonal growth, procedural mesh generation". | 08 §5.4 |
| V2 | `TerrainTiles.ts:135-285`, `packages/engine/src/agent-api/Scatter.ts` (34 LOC re-export) | `planScatterInstances` returns counts (`admittedInstances`, `impostorInstances`, ...) plus a diagnostic and places nothing. `scatterWindOffset` is CPU-side. | read |
| V3 | `apps/showcase-smart-city-control/src/main.ts:157-166` | The only scatter adopter: "every admitted tree renders two boxes (12 tris each), zero texture maps". | 08 §5.4 |
| V4 | `packages/engine/src/agent-api/index.ts:14747-14754` | `createProductionInstanceTransforms` builds `localNode = { kind, primitive, ...transform }`, which drops `node.size`. `createModelMatrix` (`:17766-17789`) multiplies by `primitiveSize(node)`, so authored sizes are lost for every instanced primitive. This is the confirmed cause of benchmark 16. | read; 22; 23 §16 |
| V5 | `packages/rendering/src/ForwardPass.ts:121, 280, 1711-1729` | `MAX_GPU_INSTANCES = 64` on the uniform path. Above 64, or with any per-instance colour or attribute, vertex buffers are created per frame and disposed, and the VAO cache keyed on `buffer.id` leaks one VAO per draw per frame (`WebGL2Device.ts:4225-4236`). | read; 07 §3.3 |
| V6 | `packages/rendering/src/WebGPUDevice.ts:3420-3466, 3863-3868` | The WebGPU uniform struct has `instance0..instance3`. Instances 4–63 render at instance 0's transform. | 07 §2.3 |
| V7 | `packages/rendering/src/DepthPass.ts:59-87` | Shadow casters are drawn with one non-instanced position-only MVP shader. Instance transforms and alpha cutout are ignored, so instanced trees cast one (wrong) shadow and foliage cards cast solid-quad shadows. | read; 19 C4 |
| V8 | `packages/engine/src/agent-api/index.ts:1027-1110` (`AuraMaterialSpec`) | The agent API has zero `alphaCutoff`/`alphaMode` fields (`rg -c` = 0), although the shaders support `u_alphaCutoff` (`ShaderLibraryCore.ts:273, 284, 776`). Foliage cards cannot be authored from the public API. | read |
| V9 | `index.ts:2348-2359` (`distanceLod`), `packages/rendering/src/performance/LOD.ts:13-20` | LOD switches between authored primitive nodes only and does not reach GLBs. There are no impostors, no HLOD and no simplification. `BVH`/`Octree`/`Batcher` have no engine call sites. | read; 07 §3.4; 11 §2 |
| V10 | `index.ts:2241-2286` (`instances.model`) | Instanced GLB models exist (one draw class per static model, LOD levels by distance, per-draw cap). This is the correct base for scatter and kits once V4–V7 are fixed. | read |
| V11 | 17-g2 X8; 21 turbo/siege/patrol | Shipped trees are cylinder+sphere lollipops or cones. `propPineTree` (44,884 tris, spec-gloss Objaverse) is overridden by a flat material in skyline (`main.ts:378-381`, 11 §1), so its textures are discarded (19 C3). | 17-g2; 11 |

### 2.3 Water

| # | Location | Fact | Source |
|---|---|---|---|
| W1 | `packages/engine/src/agent-api/index.ts:3859-3909` | `water.surface`: N opaque `primitives.box` depth bands `[9, 0.024, span]` (`roughness 0.12, metallic 0.05`), a sand box, flattened sphere foam, a box boat and box wake. The doc comment admits there are "no planar reflection/refraction targets". | read |
| W2 | `packages/rendering/src/WaterSurface.ts:1-17, 83-99` | Descriptor with baked "fresnel" band colours. "The 'refraction' here is a bounded color look only". | 08 §5.1 |
| W3 | `packages/rendering/src/OceanSurface.ts:166, 170-300, 389-455` | CPU Gerstner sum for telemetry and buoyancy. `WaterReflectionRefractionCapture`: 128×128 rgba8 targets with a `previousPixels: Uint8Array` CPU composite. Not wired to root. | 08 §5.1 |
| W4 | `apps/showcase-patrol-wing/src/sky.ts:304-346` | Ocean = one 90×90 `material.pbr` plane (`#22566a`, roughness 0.2, **metallic 0.28**). Clouds = 7 `material.glass` spheres at opacity 0.24. "Lane glint" emissive boxes. | 08 §5.1; 17-g2 |
| W5 | `apps/showcase-deep-recovery/src/main.ts:280-285` | The only `effects.volumetricFog` user (CPU readback chain) is captured at 0.5–1.1 fps desktop and 3.6 fps mobile viewport on macos-14. The underwater look is "black void". | capture report; 21 |

### 2.4 Set dressing, kits, placement

| # | Location | Fact | Source |
|---|---|---|---|
| K1 | `index.ts:5842-5901`, `:9241-9245` | `prefabs.cityBlock` / `city.block`: a plane, about 20 `primitives.box` roads, sidewalks, curbs and emissive stripes, plus `instances.box` towers with palette colours. | read |
| K2 | `index.ts:9689` | Scene-kit budget evidence string "city windows, props, road markings, lights, and labels are instanced or impostored by family". There are no impostors anywhere (V9). | read |
| K3 | `apps/showcase-courier-rush/src/city.ts:760-773` | `city.block({ blocks: 20 })` wrapped in `group().scale([6,6,6])`. A separate review-only "canyon" set replaces it under `?capture=review`. | 17-g2; 19 C6 |
| K4 | `index.ts:17982-18006` (`composeAuraTransform`) | Group composition adds positions and Euler angles and multiplies scales per component. Rotated kit parents do not rotate child offsets. | 19 C6 |
| K5 | root `aura.assets.json` | 404 entries: 226 model, 178 audio, **0 texture/environment**. 0 Draco/Meshopt/KTX2. Poly Haven adapter is models-only and deep-link-only (`packages/asset-index/src/adapters/poly-haven.ts:25-35`). 54/120 referenced models have zero images. Only 3 Kenney assets. | 11 §1, §3 |
| K6 | 16 row 14 | Route-local environment builders: deep `environment.ts` 953, rooftop 1,113, gallery 695, bank 336, neon 117 + `main.ts:219-640`, vault 71, patrol `sky.ts` 868. | 16 |
| K7 | 17-g2 X10, 16 §counts | Review-capture forks build a different world for screenshots (courier canyon, turbo venue kit and treeline bands). The shipped world is never what was reviewed. | 17-g2; 16 |

### 2.5 Lighting mood, sky, environment defaults

| # | Location | Fact | Source |
|---|---|---|---|
| L1 | `index.ts:4123-4190`, `:12628-12720` | `environments.studio/materialLab/productHero/nightCinematic/metalStudio/glassStudio` map to generated procedural maps. `"hdri"` maps to `"studio"` for first frames. There is no outdoor, sky, interior-room, space or underwater environment. | read; 08 §8.1 |
| L2 | `index.ts:12693-12707` | Ambient light without an environment node gives `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0`. This affects 15 of 18 games; Aura Clash avoids it through a different path. | 19 C1 (corrected) |
| L3 | `packages/rendering/src/ExternalParityRenderPreset.ts:133-221` | 128×64 procedural source, Reinhard-encoded to 8-bit sRGB before the GGX prefilter. WebGL2 sampler `minFilter: "linear"` reads only level 0. | 19 C10 (corrected) |
| L4 | `index.ts:13586-13596` | Production clear colour only. No `environmentBackground` anywhere in `packages/engine/src`. | 19 C9 |
| L5 | `index.ts:3730-3769` | `sky.dayNight`: sun and moon are emissive spheres 7 units from origin; ≤120 star spheres; ≤48 opaque PBR cloud spheres; returns one background colour (zenith discarded). | read |
| L6 | `index.ts:4204-4214`; 19 C12 | Exposure presets per scene category exist, but root exposure is hard-coded to 1 and the operator is fixed to ACES. | read; 19 C12 |
| L7 | `index.ts:12966-12968` | Shadow strength 0.38 city-day, 0.24 material/product, 0.32 otherwise, applied as `mix(1, 1-occlusion, strength)`. | 19 C11 |
| L8 | `Renderer.ts:1387-1399, 1964-1986` | CSM requires a `PerspectiveCamera` instance; the root bridge passes `{viewProjectionMatrix}`, so CSM never runs from `createAuraApp`. | 19 C5 |
| L9 | `packages/rendering/src/EnvironmentPresetPack.ts:25-46` | Night preset multiplied by `exposureFactor 2.114618` to match daytime luma. This removes the night look; only an SSIM gate consumes it. | 08 §8.4 |
| L10 | `fixtures/three-compat/environments/manifest.json`; `fixtures/environment-corpus/hdri/` | 6 "real-hdri" entries but only 3 files, all 1k. `venice-sunset` aliases `studio_small_08_1k.hdr` (same sha256). | 08 §8.2; read (ls) |
| L11 | `packages/rendering/src/EnvironmentPlatform.ts:395-415`, `EnvironmentPreset.ts:47-128` | `createProceduralSkyDome` is a single-colour unlit sphere. `createNamedEnvironmentPreset` has no caller in engine, apps or templates. | 08 §4.4, §8.5 |
| L12 | `packages/rendering/src/SpaceEnvironment.ts` | Seeded star, nebula and dust descriptors. The only consumer is telemetry in `examples/game-slice/main.ts:913`. | 08 §5.5 |
| L13 | `index.ts:3807-3843` | `weather.wetGround` is a box slab plus cylinder puddles. | read |
| L14 | `benchmarks/quality-rebuild/aura3d/common.ts:114-119, 250-252` | The harness records that `scene().background()` accepts only a colour (HDRI background "missing"), and that fog opacity is capped. | read |

---

## 3. Root cause

1. **The production bridge only knows primitives and typed GLBs.** `createProductionRuntimeSceneRenderer` builds draw
   entries for those two kinds (19 C8). A world system could only ship by lowering itself to primitives. That is exactly
   what `water.surface`, `weather.*`, `sky.dayNight`, `city.block` and `planSkyBackdrop` do. There is no custom-material
   render item path in the root API for terrain, foliage or water.
2. **The API layer has no material vocabulary for world surfaces.** There is no splat or layered material, no alpha
   cutout (V8), no texture repeat or mip sampler for primitives (PRD 04 §1 item 3, `index.ts:14379`), no vertex-animation
   hook (wind, waves) and no texture arrays. With no way to express a textured, tiled, blended ground, games paint with
   emissive.
3. **Instancing, shadows and LOD are incomplete for dense content.** The size bug (V4), the 64-instance uniform path and
   VAO leak (V5), the WebGPU 4-instance cap (V6), shadows that ignore instances and alpha (V7) and the missing impostors
   (V9) mean any honest vegetation density would render wrong, leak, or cast wrong shadows. Teams therefore avoided density.
4. **No content.** There are zero texture assets, 1k HDRIs only, aliased HDRI manifests, no CC0 kit, foliage or texture
   library, and no import path for Poly Haven or ambientCG textures and HDRIs (K5, L10). Even a correct terrain shader
   would have nothing to sample.
5. **Light mood is a per-route craft problem.** There are no biome rigs. The ambient light zeroes IBL (L2), exposure is
   ignored (L6), shadows are weak (L7) and CSM is unreachable (L8). Every route rebuilds a rig and none gets it right
   (16 row 6).
6. **Evidence substituted for rendering.** "Builds the missing RENDERED systems" (T3) and "instanced or impostored by
   family" (K2) passed review because descriptors and diagnostics strings were accepted as capability. The review-capture
   forks (K7) also meant the shipped world was never what reviewers saw.
7. **Mount-time static scenes.** Without runtime add/remove (PRD 07 §2.2 E26) and with fog read from the static snapshot
   (18 §2), a time-of-day change or a streamed grass ring cannot be expressed. A runtime world handle is required.

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/rendering` | New `world/` module: terrain CDLOD + `TerrainMaterial`; `InstanceChunkGrid`, `FoliageMaterial`, `ImpostorMaterial`, `GrassField`, `WindField`; `WaterMaterial`, `ReflectionViewPass`, `GerstnerWaves`; `SpaceSkyBake`; shared GLSL/WGSL chunks (`a3d_wind`, `a3d_terrain_splat`, `a3d_gerstner`, `a3d_caustics`). Fix `sampleTerrainHeightfield` interpolation. Delete `TerrainTiles.createTerrainTileGrid`, `EnvironmentPreset.ts`, `createProceduralSkyDome`, and the `EnvironmentPresetPack` night normalization. |
| `@aura3d/engine` agent-api | New `world` namespace (`world.biome`, `world.timeOfDay`, `world.terrain`, `world.scatter`, `world.grass`, `world.water`, `world.kit`, `world.spline`, `world.extrude`, `world.placeAlong`, `world.room`, `world.street`, `world.wind`); `material.foliage`, `material.terrainLayer`, `material.planet`; `alphaCutoff`/`alphaMode` on `AuraMaterialSpec`; `app.world` runtime handle; deprecation of `water.surface`, `weather.wetGround`, `prefabs.cityBlock`/`city.block`; instance-size fix; world diagnostics from observed draws. |
| `@aura3d/engine` production-runtime | `production-runtime/world/{TerrainRuntime,ScatterRuntime,GrassRuntime,WaterRuntime,TimeOfDayRuntime,BiomeResolver}.ts`, which lower world nodes to render items with world materials. |
| `@aura3d/environments` | Biome HDRI registry (`BiomeEnvironmentRegistry.ts`) replacing aliased manifest entries; quality floors enforced at load (`PMREMPreset.ts` checks become errors for biome assets). |
| `@aura3d/physics` / `@aura3d/physics-rapier` | Consumer only: `world.terrain({ collider: true })` registers a `HeightfieldShape` (`physics/src/Shape.ts:37`) through the existing Rapier path. No new physics code beyond the root facade wiring. |
| `@aura3d/aura3d-cli` | `assets bake-impostor` and `assets add --type texture-set/--type hdri` verbs use the PRD 05 pipeline. This PRD supplies the bakers and the asset contracts. |
| `packages/engine/assets/world/` (new) | Shipped CC0 content: terrain layer sets, foliage, rocks, water normals, caustics, wind noise, biome HDRIs, starter kits (city, interior, trackside). Budget in §17. |
| `benchmarks/quality-rebuild` | New world scenes (§16.1) with Aura and three r185 adapters. The 16-instancing spec is unchanged (it must pass after V4). |
| `tools/impostor-bake/`, `tools/world-content-bake/` (new) | Offline deterministic bakers (impostor atlases, wind vertex weights, space cubemaps for CI fixtures). Node only, no network. |
| `apps/*` | Migration owned by PRD 14. Per-game acceptance subset in §16.2. |
| `packages/aura3d-cli/skills/aura3d-materials-environments`, `aura3d-scene-authoring`, `aura3d-performance` | Skill text delivered by PRD 13. This PRD supplies the API facts and the "do not use" list. |

---

## 5. Affected files / directories

Modify:

- `packages/engine/src/agent-api/index.ts`:
  - `createProductionInstanceTransforms` `:14747-14754` (pass `size`).
  - `AuraMaterialSpec` `:1027-1110` (alpha fields).
  - `instances.model` `:2241-2286` (static flag, chunking, shadow LOD).
  - `water` `:3859-3909` and `weather.wetGround` `:3807-3843` (deprecate, then re-implement on `world.water` / PRD 07 wetness).
  - `environments` `:4123-4190` (add `environments.outdoor`, `environments.room`, `environments.space`, `environments.underwater` as thin aliases to biome environments).
  - `prefabs.cityBlock` `:5842-5901` and `city` `:9241-9245` (re-implement on `world.kit(cityKit)`).
  - Scene-kit evidence strings `:9683-9796` (report observed draws).
  - `createProductionRuntimeEnvironment` `:12628-12720` (resolve the biome environment before ambient or category fallback; coordinate with PRD 02 for the ambient fix).
  - `createProductionRuntimeSceneRenderer` `:13540+` (world node lowering hook).
  - Render-source build `:13990-14005` (world passes).
  - App object `:11126+` (`app.world`).
- `packages/rendering/src/TerrainHeightfield.ts:133-141` (bilinear `sampleTerrainHeightfield`), `:143-217` (keep; add `toHeightTexture`).
- `packages/rendering/src/TerrainTiles.ts` (delete `createTerrainTileGrid` and the header claim; keep `planScatterInstances`, `enforceFrameBudget` and `queryTerrainHeight` as budget/query utilities).
- `packages/rendering/src/VegetationScatter.ts` (keep the L-system/placement math as an offline tool input; fix the claim boundary to name the new runtime).
- `packages/rendering/src/OceanSurface.ts:170-300` (move the Gerstner evaluation into `world/water/GerstnerWaves.ts`, shared CPU/GPU parameters); `:389-455` (delete the CPU composite capture after `ReflectionViewPass` lands).
- `packages/rendering/src/WaterSurface.ts` (delete after migration).
- `packages/rendering/src/ForwardPass.ts` (register world material shader keys; split opaque/transparent so water draws after an opaque scene-colour/depth copy; shared with PRD 04 transmission and PRD 07 particles).
- `packages/rendering/src/DepthPass.ts:59-87` (instanced + alpha-tested + wind-deformed casters; owned with PRD 02, §12).
- `packages/rendering/src/EnvironmentPresetPack.ts:25-46` (remove night exposure normalization).
- `packages/rendering/src/EnvironmentPlatform.ts:395-415`, `EnvironmentPreset.ts` (delete).
- `packages/rendering/src/SpaceEnvironment.ts` (becomes the input to `SpaceSkyBake`).
- `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts`.
- `fixtures/three-compat/environments/manifest.json` (delete aliased entries `industrial-sunset-puresky`, `spruit-sunrise`, `venice-sunset`, or add the real files).
- `benchmarks/quality-rebuild/shared/{scenes,types,assets,procedural}.ts`, `aura3d/common.ts`, `three/common.ts`, plus new per-scene files.

Create:

- `packages/rendering/src/world/terrain/`: `TerrainCdlod.ts` (quadtree selection, morph ranges), `TerrainPatchGeometry.ts` (shared N×N grid), `TerrainHeightTexture.ts` (R32F upload + manual bilinear contract), `TerrainMaterial.ts`, `shaders/terrain.vert.glsl.ts`, `shaders/terrain.frag.glsl.ts`, `shaders/terrain.wgsl.ts`.
- `packages/rendering/src/world/vegetation/`: `InstanceChunkGrid.ts` (static GPU instance buffers per spatial cell), `FoliageMaterial.ts`, `ImpostorMaterial.ts`, `GrassField.ts`, `WindField.ts`, `shaders/{wind,foliage,impostor,grass}.{glsl,wgsl}.ts`.
- `packages/rendering/src/world/water/`: `WaterMaterial.ts`, `GerstnerWaves.ts`, `ReflectionViewPass.ts`, `Caustics.ts`, `UnderwaterState.ts`, `shaders/water.{glsl,wgsl}.ts`, `shaders/caustics.glsl.ts`.
- `packages/rendering/src/world/space/`: `SpaceSkyBake.ts`, `PlanetMaterial.ts`, `shaders/{space-bake,planet}.glsl.ts`.
- `packages/rendering/src/world/index.ts` (subpath export `@aura3d/rendering/world`).
- `packages/engine/src/agent-api/world/`: `index.ts`, `biomes.ts`, `timeOfDay.ts`, `terrain.ts`, `scatter.ts`, `grass.ts`, `water.ts`, `kits.ts`, `spline.ts`, `placement.ts`, `room.ts`, `street.ts`, `wind.ts`, `types.ts`.
- `packages/engine/src/production-runtime/world/`: `BiomeResolver.ts`, `TerrainRuntime.ts`, `ScatterRuntime.ts`, `GrassRuntime.ts`, `WaterRuntime.ts`, `TimeOfDayRuntime.ts`, `WorldDiagnostics.ts`.
- `packages/engine/assets/world/`: `manifest.json` plus `terrain/`, `foliage/`, `rocks/`, `water/`, `noise/`, `hdri/`, `kits/{city,interior,trackside,space}/` (contents in §6.6).
- `tools/impostor-bake/` (index.ts plus a Playwright-driven bake page; WebGL2 readback of atlas tiles; runs on the remote
  macos-14 runner, never locally), `tools/world-content-bake/`.
- Tests listed in §15.

---

## 6. Architecture proposal

### 6.1 Target architecture

```
agent API (packages/engine/src/agent-api/world)                           runtime handle
  world.biome / world.timeOfDay / world.wind                                app.world.timeOfDay.set(h)
  world.terrain / world.scatter / world.grass / world.water                 app.world.wind.set(...)
  world.kit / world.spline / world.extrude / world.placeAlong               app.world.terrain(n).heightAt(x,z)
  world.room / world.street                                                 app.world.water(n).heightAt(x,z,t)
        │ emits typed scene nodes: kind "biome" | "time-of-day" | "terrain" | "scatter" | "grass" | "water" | "wind"
        │ kits/spline/room/street resolve at build time to instances.model groups + extruded custom geometry
        ▼
production bridge (createProductionRuntimeSceneRenderer)
  BiomeResolver ──► PRD 07 SkyBackgroundPass spec + HeightFog spec
              ──► PRD 02 environment source (sky-capture | HDRI) + sun + CSM config
              ──► PRD 03 post preset (tone map, exposure, bloom, grade)
  TerrainRuntime ─► CDLOD node selection (CPU, per frame) ─► 1 instanced draw per LOD level, TerrainMaterial
                 ─► Rapier HeightfieldShape (same R32F data)
  ScatterRuntime ─► InstanceChunkGrid (static GPU buffers) ─► per-chunk frustum cull ─► mesh LOD / impostor / culled
  GrassRuntime   ─► camera-centred chunk ring, instance data generated in VS from gl_InstanceID + chunk seed
  WaterRuntime   ─► WaterMaterial (after opaque, reads SceneColorCopy + depth) ─► optional ReflectionViewPass
  TimeOfDayRuntime ► per-frame uniforms (sun dir, sky, fog colour, exposure); amortized IBL re-capture via PRD 02
        ▼
@aura3d/rendering world/: TerrainMaterial, FoliageMaterial, ImpostorMaterial, GrassField, WaterMaterial,
  ReflectionViewPass, WindField UBO, shared chunks (a3d_wind, a3d_gerstner, a3d_terrain_splat, a3d_caustics)
        ▼
ForwardPass: opaque (terrain, scatter, kits) → SceneColorCopy/DepthCopy (PRD 04 resource) → water → transparents/particles (PRD 07)
DepthPass (PRD 02): instanced + alpha-tested + wind-deformed casters
```

Design rules:

1. **One world node, one renderer consumer.** Every `world.*` node kind has a production lowering, a safe-basic
   degraded lowering (documented and diagnosed) and an observed-draw diagnostic. A node with no consumer is a build-time
   error, not a warning (same principle as PRD 07 §3).
2. **Static content is uploaded once.** Terrain height textures, scatter instance buffers, kit instance buffers and
   extruded geometry are GPU-resident and are not rebuilt per frame. Today root instance matrices are recomputed every
   frame in JS (07 §3.3). World instances carry `static: true` and skip that path.
3. **One source for physics and pixels.** Terrain height, water height (Gerstner) and placement ground-snapping use the
   same data and the same interpolation on CPU and GPU. This fixes T2.
4. **Rigs are data, not code.** A biome is a frozen `AuraBiomeRig` object that composes specs owned by PRD 02, 03 and 07.
   This PRD owns the values and the visual acceptance of each rig, not the passes.
5. **Content ships with the engine.** Each world system ships at least one licence-clean default asset set, so a call
   without asset arguments still renders a textured, credible result (§6.6). Defaults are judged visually (§16), not by
   existence.
6. **Matrix-correct placement.** Kits, placement and splines compose full 4×4 matrices themselves and emit flat
   instance lists. They never rely on `group()` composition until PRD 01 fixes 19 C6.
7. **Tier-scaled, not tier-gated.** Every system renders on Low (mobile) with reduced parameters (§17). Features that
   cannot run on Low (planar reflection, triplanar on all layers, grass beyond 20 m) degrade to defined fallbacks.

### 6.2 Recommendations with cost profile

GPU/CPU costs are targets for a Medium-tier desktop (integrated-class GPU, 1080p) unless stated otherwise. They are
validated per §17. "Bundle" means gzip JS added to the `@aura3d/engine/world` subpath. Asset bytes are listed separately
in §17.3.

#### R1. Biome rigs + environment defaults (§6.3)

- What: 10 packaged rigs (sky, IBL source, sun, shadows, fog, post, exposure, practical-light scale) and scene-category
  default biomes, so `createAuraApp` never renders a void with zero IBL.
- Visual benefit: **highest per unit effort.** It addresses the top-1 change in the vision judgments for patrol-wing,
  siege-golf, orbital-defense, deep-recovery and turbo-drift ("Sky plus IBL in one move", 21), and benchmarks 09 and 13.
- GPU: no new passes beyond PRD 02/03/07. Sky-capture IBL costs 1 cube render (6×128² sky-only) + prefilter
  ≈ 1.5–3 ms **once** at load; with time-of-day, amortized ≤ 0.2 ms/frame (§6.7).
- CPU: < 0.05 ms/frame (uniform writes).
- Memory: HDRI rigs use a 2k RGBE equirect (8 MB GPU as RGBA16F 2048×1024) + PMREM 256² cube RGBA16F with mips
  (≈ 2.1 MB). Sky-capture rigs use only the PMREM.
- Bundle: +4 KB (rig tables + resolver).
- Mobile: Low uses 1k equirect background, 128² PMREM faces, sky-capture preferred over HDRI.
- Fallback: if the HDRI fails to load, the rig's procedural sky (PRD 07 Preetham or gradient) is captured instead,
  with a warning. It is never a flat colour and never zero IBL.

#### R2. Terrain: CDLOD heightfield + layered splat material (§8.1)

- What: `world.terrain` with an R32F height texture, a shared N×N patch mesh drawn per quadtree node with
  vertex morphing, a 4/8-layer texture-array splat material (height blend, triplanar on steep layers, anti-tiling,
  macro variation, detail normal), auto-splat rules (slope/height/noise) or an authored splat map, holes, and a Rapier
  heightfield collider.
- Visual benefit: very high. Ground covers 30–65% of frame in outdoor games (21 turbo: "50–65% of every frame").
  It fixes "flat grey", "faceted green blob" and "infinite flat plane".
- GPU: Medium ≈ 1.2 ms at 1080p (4 layers, triplanar only on the rock layer, 2 texture-array fetch sets per layer).
  High ≈ 1.8 ms (8 layers). Vertex cost is negligible (≤ 250k verts visible).
- CPU: quadtree selection ≤ 0.15 ms/frame for a 2 km terrain with a 6-level tree. Height texture upload is one-time.
- Memory: height R32F 1025² = 4.2 MB; splat RGBA8 1024² ×1–2 = 4–8 MB with mips (5.6 MB each); layer arrays
  (albedo+height, normal RG, ORM) at 1k, KTX2 BC7/ASTC/ETC2 ≈ 1.4 MB per layer per map → 4 layers ≈ 17 MB,
  8 layers ≈ 34 MB. Uncompressed fallback (if KTX2 unavailable) ×4.
- Bundle: +14 KB.
- Mobile: Low uses 4 layers at 512², no triplanar (slope uses stretched planar with rock UV scale ×0.5), 32² patches,
  4 LOD levels, splat 512². ≈ 1.0 ms on an A15-class GPU at 1170×2532×0.5 render scale (target, unmeasured).
- Fallback: safe-basic path renders `createTerrainHeightfieldGeometry` with vertex-colour splat weights (no textures) and
  reports `world.terrain.degraded`. WebGPU: until PRD 11's shader IR exists, terrain registers a hand-written WGSL
  program. If that is missing, the app selects WebGL2 (§18).

#### R3. Instanced scatter + foliage material + wind + impostors (§8.2–8.4)

- What: `world.scatter` places assets (trees, rocks, bushes, debris, props) by density, slope, height, mask and exclusion
  rules with a Poisson-disk distribution, then uploads them into an `InstanceChunkGrid` (32 m cells). Per-cell frustum
  culling, per-instance distance LOD (mesh LOD0 → LOD1 → octahedral impostor → culled), dithered crossfade, and a
  global `WindField` applied in the colour and shadow vertex shaders.
- Visual benefit: very high. It replaces lollipop trees and box trees with textured, swaying vegetation; gives world
  density and silhouette; and makes skylines (impostor buildings) possible.
- GPU: Medium budget 1.5 ms for ≤ 3k mesh trees + 20k impostors + 10k rocks/props visible; alpha-tested overdraw is
  the main cost. Shadows: near-cascade casters only (≤ 40 m) with wind, ≈ +0.6 ms.
- CPU: cell culling ≤ 0.2 ms/frame for 4,096 cells; LOD bucketing is per cell (not per instance) on Low/Medium, per
  instance on High/Ultra (GPU-side via a per-instance distance test in VS, culled instances collapse to degenerate).
- Memory: instance data 32 B/instance (position xyz, rotation y + scale packed, LOD seed, colour variation) →
  100k instances = 3.2 MB. Impostor atlas per species: 2048² (8×8 views × 256²) albedo+alpha and normal+depth,
  KTX2 ≈ 8 MB per species GPU.
- Bundle: +12 KB.
- Mobile: Low uses impostors beyond 25 m, mesh LOD1 only, no shadows from impostors, alpha-test without
  alpha-to-coverage, ≤ 30k visible instances.
- Fallback: without impostor atlases (asset missing), far instances use LOD1 mesh up to the cull distance and the
  diagnostic reports `impostor: "missing"`. Safe-basic path uses `instances.model` without wind.

#### R4. Grass field (§8.5)

- What: `world.grass` with procedural blades (5 tris) generated in the vertex shader from `gl_InstanceID` and a chunk
  hash. Height comes from the terrain height texture and colour from the terrain splat albedo at the root. Wind, density
  falloff with distance and a camera-centred 8 m chunk ring.
- Visual benefit: high for meadow and golf content (siege-golf, patrol-wing island, turbo verges). It hides texture
  tiling near the camera.
- GPU: Medium 1.0 ms for ≈ 250k blades within 30 m; High 1.8 ms for 600k blades within 50 m.
- CPU: ≤ 0.05 ms (ring bookkeeping; no per-blade CPU data).
- Memory: < 0.5 MB (no per-instance buffers; one blade mesh + chunk UBO).
- Bundle: +4 KB.
- Mobile: Low uses camera-facing grass cards (2 tris, alpha-tested 256² atlas) to 15 m, about 40k cards.
- Fallback: grass disabled. The terrain's detail normal and macro variation still carry the look.

#### R5. Water material + reflection + underwater (§8.6–8.7)

- What: `world.water` with kinds `ocean | lake | river | pool`. The vertex shader evaluates Gerstner waves (4 Low, 8 High)
  shared with CPU buoyancy. The fragment shader uses dual scrolling normal maps, Schlick Fresnel with F0 0.02,
  refraction from `SceneColorCopy` with a depth-checked offset, Beer-Lambert absorption from scene depth, a sun GGX
  highlight, shoreline and crest foam, and fog. Reflection comes from sky/IBL (all tiers), SSR (when PRD 03 lands) or a
  planar `ReflectionViewPass` (High+). When the camera is below the surface, an underwater mode switches fog, colour
  absorption, caustics and a surface-from-below Snell window.
- Visual benefit: very high where water exists (patrol-wing, deep-recovery, any coastal or lake scene). Water is one of
  the most recognisable "modern three.js" signatures (`Water.js`, `Water2`).
- GPU: Medium 0.6 ms (sky/IBL reflection, refraction, 4 waves). High +1.5–3 ms for half-res planar reflection,
  scene-dependent because it re-renders the reflected layer list.
- CPU: ≤ 0.1 ms. Planar reflection adds a second cull + draw submission of the reflection layer (≈ +0.5–1.5 ms CPU at
  current draw-submission costs).
- Memory: normals 2 × 512² RG KTX2 (0.5 MB); SceneColorCopy RGBA16F at render res (1080p: 16.6 MB, shared with
  transmission); planar RT half-res RGBA16F + depth (1080p: ≈ 6 MB).
- Bundle: +10 KB.
- Mobile: Low has no SceneColorCopy (refraction replaced by depth-based colour only if a depth texture exists, else
  vertex-alpha shore fade), 4 waves, IBL reflection only.
- Fallback: safe-basic path draws a single plane with the water colour, Fresnel-to-sky tint and animated normals. It
  never emits box bands.

#### R6. Kits, spline extrusion, placement, rooms and streets (§7.1.6–7.1.9)

- What: `defineKit` and `world.kit(kit).place/fill` with snap grid, rotation steps and sockets; `world.spline` +
  `world.extrude` (road, track, rail, tunnel, curb, fence profiles); `world.placeAlong`, `world.placeGrid`,
  `world.placePoisson`; `world.room` (walls, floor, ceiling, openings, lighting grid) and `world.street` (road, sidewalks,
  lamps, props, decal markings via PRD 07). Every placement resolves to static `instances.model` groups keyed by asset.
- Visual benefit: high for city, interior and track games (courier, neon-swarm, aura-clash, gallery, mech-hangar,
  bank-shot, vault, turbo, pulse-tunnel). It replaces primitive dressing and gives density.
- GPU: depends on content. Instancing keeps draw calls ≤ number of unique kit pieces visible (target ≤ 150 draws for
  a city block).
- CPU: build-time only (placement and extrusion run once at scene build, ≤ 30 ms for 5k placements). No per-frame cost
  beyond culling.
- Memory: kit GLBs (KTX2 + Meshopt per PRD 05) ≈ 6–15 MB per kit GPU.
- Bundle: +6 KB (API, extrusion, Poisson); kit assets are lazy-loaded.
- Mobile: same; kits are authored with LOD1 and are trimmed by cull distance.
- Fallback: none needed for API. Missing kit assets fail loudly at build with the asset id (no primitive substitution).

#### R7. Time of day (§6.7)

- What: `world.timeOfDay` drives sun direction (solar position from hour, latitude and day of year, or a simple arc),
  PRD 07 sky uniforms, sun colour and intensity, fog colour (from the sky horizon), exposure (PRD 03), practical/emissive
  scale (night windows and street lamps) and stars. IBL re-capture is amortized. Keyframes can interpolate between biome
  rigs (dawn → day → golden → dusk → night).
- Visual benefit: medium–high. It gives racing, flight and city games mood control and a dawn/dusk look without
  per-route light rigs. Patrol-wing toggles three hand-written rigs (`sky.ts:235-265`).
- GPU: ≤ 0.2 ms/frame amortized re-capture (one cube face every N frames when sun moved ≥ 1.5°).
- CPU: ≤ 0.05 ms.
- Memory: double-buffered PMREM (2 × 2.1 MB at 256²).
- Bundle: +3 KB.
- Mobile: Low re-captures at 64² faces, one face per 4 frames.
- Fallback: when `ibl.recapture: false`, IBL stays at the nearest keyframe rig's capture and only sun, sky and fog move.

#### R8. Space dressing (§8.8)

- What: `SpaceSkyBake` turns `SpaceEnvironment` star, nebula and dust descriptors into a GPU-baked RGBA16F cubemap
  (stars as magnitude-scaled point splats with colour temperature, nebula as domain-warped fBm with 2 colour ramps).
  It is used as background (PRD 07 cubemap mode) and IBL (PRD 02). `material.planet` provides albedo/night/cloud layers
  with a Fresnel atmosphere rim and terminator wrap. A ring material uses alpha-textured bands with planet shadow.
- Visual benefit: high for orbital-defense, gravity-post and pulse-tunnel (21: "No starfield, skybox, nebula, or distant
  bodies"; orbital-defense atmospheric 0/10).
- GPU: bake once 2–5 ms at load (1024² faces High, 512² Low). Planet fragment shader ≈ 0.2 ms at typical coverage.
- CPU: negligible.
- Memory: cube 1024² RGBA16F ≈ 50 MB with mips on High (too large: use RGB9E5 where supported → 25 MB, or 512² on
  Medium = 12.6 MB RGBA16F). Low uses 512² RGB9E5 or RGBA8 with RGBM.
- Bundle: +3 KB.
- Mobile: 512² faces, nebula octaves 4 instead of 6.
- Fallback: a shipped baked cubemap (`assets/world/hdri/space-default-512.ktx2`) when the bake shader fails.

#### R9. Correctness and honesty prerequisites (Phase 0)

- What: fix the instance `size` bug (V4); make terrain height sampling bilinear (T2); delete or rewrite the false headers
  (T3, K2, V1); remove the aliased HDRIs (L10) and the night normalization (L9); add observed-draw world diagnostics.
- Visual benefit: fixes benchmark 16 directly (instances regain size and spacing). The other items prevent false evidence.
- GPU/CPU/memory/bundle: none, or below 1 KB.
- Mobile: none.
- Fallback: not applicable.

### 6.3 Biome rigs (values are the shipped defaults; tuned only via §16 visual review)

Intensities are in the engine's current units, matching the values the quality-rebuild harness passes to both engines
(`benchmarks/quality-rebuild/shared/scenes.ts`, e.g. `sun(4, …)` with environment intensity 1). If PRD 01/02 change the
light-unit convention, this table is re-expressed in the new units. The look targets do not change.

| Biome id | Sky (PRD 07) | Environment source | Sun / key | Shadows | Fog (PRD 07 height fog) | Post (PRD 03) | Look target |
|---|---|---|---|---|---|---|---|
| `outdoor-day` | Preetham, turbidity 2.5, sun elevation 48°, clouds coverage 0.35 | sky-capture (HDRI `outdoor-day-meadow-2k` optional) intensity 1.0 | directional 3.5, 5800 K | CSM 3 cascades, 120 m, strength 1.0 | density 0.0025, height falloff 0.08, colour from horizon | ACES (or PRD 03 default), exposure 1.0, bloom threshold 1.2 strength 0.04, grade neutral | saturated sky gradient, blue-tinted shadow fill, readable terminators (fixes 23 §09 diffs 1–4) |
| `golden-hour` | Preetham, turbidity 4, sun elevation 9°, warm Mie g 0.8 | sky-capture; HDRI candidate Poly Haven `venice_sunset` or `industrial_sunset_puresky` (verify at admission) | directional 3.0, 3300 K | CSM 3, 150 m, long shadows | density 0.004, warm horizon inscatter | exposure +0.3 EV, bloom threshold 1.0 strength 0.06, grade warm highlights / cool shadows | long warm shadows, glowing horizon, rim light on vehicles |
| `overcast` | gradient zenith `#9aa6b2` horizon `#c9cfd4` + cloud coverage 0.9 | sky-capture intensity 1.2 | directional 1.0 (diffuse sky dominates), 6500 K | CSM 2, soft (PCSS radius ×2), strength 0.85 | density 0.006 | exposure +0.2 EV, low contrast grade | soft shadows, wet-looking materials (pairs with PRD 07 wetness) |
| `night-city` | gradient zenith `#03050c` horizon `#1a1f3a` + city glow band, stars off | HDRI candidate Poly Haven night street (verify) intensity 0.6; else sky-capture + emissive-card capture | moon directional 0.25, 7500 K; practicals ×1.0 | CSM 2, 60 m; point/spot shadows for ≤ 4 hero lights (PRD 02) | density 0.012, colour `#1a2238` | exposure +0.8 EV, bloom threshold 0.9 strength 0.12, grade teal/orange | reflective wet asphalt (PRD 07 + SSR PRD 03), lit windows, pools of light |
| `polar-night` | gradient + stars + aurora band (PRD 07 sky layer request) | sky-capture intensity 0.5 | moon 0.35, 8000 K | CSM 2, 80 m | density 0.008, colour `#1b2a44` | exposure +0.6 EV, bloom threshold 0.9 | aurora-lander brief (21: "has no aurora") |
| `alpine-snow` | Preetham turbidity 2, sun elevation 22° | sky-capture intensity 1.1 | directional 3.2, 6000 K | CSM 3, 150 m | density 0.003, falloff 0.05, cool | exposure −0.2 EV (snow albedo), bloom threshold 1.3 | skyline-runner, turbo alpine: bright snow without clipping |
| `interior-warm` | none (enclosed) | room-capture: `RoomEnvironment`-equivalent procedural room (PRD 02) tinted 2900 K, intensity 0.8 | no sun; 1 key spot 2700 K with shadow + practical lamps | spot/point shadows on key lights (PRD 02) | density 0.01 (haze), height falloff 0.4 | exposure +0.4 EV, bloom threshold 1.0 | bank-shot pool hall: pool of light over table, dark falloff |
| `interior-neutral` | none | room-capture 4500 K intensity 1.0 | ceiling grid area/point lights | spot/point shadows on 2 hero lights | density 0 | exposure 0 EV | gallery, arcade (blockfall, vault) |
| `interior-industrial` | none | room-capture with large window softbox, 5600 K, intensity 1.1 | directional "window" key 2.0 through openings | CSM 1 cascade or spot | density 0.015 (dust), volumetric when PRD 07 GPU volumetric lands | exposure +0.2 EV, cool grade | mech-hangar: shafts of light, metal reflections |
| `space` | none; background = `SpaceSkyBake` cube | same cube, intensity 0.35 (stars contribute little; nebula tints) | star directional 4.0, 5778 K, no fill | CSM 2 on hero bodies only | none | exposure +0.5 EV, bloom threshold 1.0 strength 0.08 | orbital-defense, gravity-post: hard terminator, rim atmosphere |
| `underwater` | none; background = depth-graded gradient (surface `#2a8fb0` → deep `#021018`) | sky-capture of the gradient, intensity 0.6 | directional "surface sun" 1.5 with caustics (§8.7) | CSM 1, 40 m | exponential absorption fog density 0.035, colour by depth | exposure +0.3 EV, bloom threshold 1.1 | deep-recovery: turquoise→navy falloff, god-ray look via PRD 07 volumetric |

Rules every rig enforces:

- `ambientPolicy: "ibl-only"`. A biome never relies on a flat `lights.ambient`, and it suppresses the
  ambient-zeros-IBL branch (L2) for its scene. PRD 02 owns the general fix.
- Shadow strength is 1.0 (contrast comes from IBL fill, not from a 0.32 multiplier, L7).
- Fog colour is derived from the sky horizon at the view azimuth unless overridden. This avoids the fog/background seam
  of 08 §3.1.
- Every rig has a Low-tier variant (1 cascade fewer, half shadow distance, no volumetric, 128² PMREM).

Default biome when a scene declares none (applied by `BiomeResolver`; overridden by any `environments.*` or `world.biome`):

| Scene signal | Default |
|---|---|
| `world.terrain` or `world.water(kind: "ocean"|"lake")` present | `outdoor-day` |
| `world.room` present | `interior-neutral` |
| scene category `space` (existing `AuraSceneCategory`) | `space` |
| category `city-night` / `neon` | `night-city` |
| category `city-day` | `outdoor-day` |
| category `product` / `material` | no biome (PRD 02 studio default) |
| anything else | `interior-neutral` room capture (never zero IBL, never a void clear colour when a sky can be drawn) |

### 6.4 Terrain design

- Height source: an `AuraHeightSource` is one of: a 16-bit PNG / R32F raw / EXR asset (admitted via PRD 05), a
  procedural function (`fbm`, `ridged`, `terraced`, plus `flattenAreas` for runways, tracks and pads), or an existing
  `TerrainHeightfieldFixture`. The CPU keeps a `Float32Array`. The GPU gets an R32F texture of the same data.
- Geometry: CDLOD (Strugar 2009). One shared patch mesh of `(N+1)²` vertices (N = 32 Low, 64 High) is drawn instanced,
  one instance per selected quadtree node, with per-instance `{offsetXZ, scale, lod}`. The vertex shader fetches height
  with manual bilinear (4 `texelFetch`, so no float-linear extension is needed) and morphs odd vertices toward the parent
  grid over the morph range. This removes popping and T-junction cracks without skirts.
- Normals: computed in the fragment shader from the height texture (central differences at the texel scale of the
  current LOD) for large-scale shape, plus layer detail normals. No baked normal map is required. An optional baked
  normal map (from PRD 05 bake) is used on Ultra for sub-texel detail.
- Layers: up to 8 `TerrainLayer`s, each with albedo (RGB) + height (A), normal (RG), ORM, UV scale, triplanar flag,
  height-blend contrast, tint and roughness bias. They are stored in three `sampler2DArray`s (WebGL2 core) built at load
  from per-layer KTX2. All layers in one terrain share a resolution.
- Splat: an authored RGBA splat (layers 0–3) and an optional second (layers 4–7), or `auto` rules evaluated **on the GPU
  at load** into the splat texture (slope, height, curvature, noise). This replaces CPU `resolveTerrainSlopeBlend` (T4),
  whose formula becomes the default rule set.
- Holes: splat alpha of the second map, or a 1-bit mask texture. Fragments with mask < 0.5 are discarded, and the
  physics collider receives the same mask as Rapier heightfield holes (if not supported, cells are raised under −1e4).
- Collider: `collider: true` registers `HeightfieldShape` with `heights = scaledHeights` from the same Float32Array
  (row-major via `toRapierHeightfieldHeights`, `physics-rapier/src/HeightfieldLayout.ts:12`).
- Queries: `heightAt(x, z)` and `normalAt(x, z)` use bilinear interpolation (fixes T2), identical to the shader's
  manual bilinear. Unit-tested to agree within 1e-4 m.

### 6.5 Scatter, foliage, impostors, wind

- Placement: Bridson Poisson-disk on a jittered grid per layer, with `minDistance` and density (per m²) modulated by a
  density mask, slope/height ranges, and terrain splat-layer weights (e.g. "trees only where grass > 0.5"). Exclusion
  shapes (splines with width, circles, polygons) come from roads, tracks, buildings and gameplay lanes. Determinism:
  every layer is seeded by `hash(seed, layerIndex, cellX, cellZ)`, so results are independent of evaluation order.
- Ground snapping: `y = terrain.heightAt(x, z)`, plus an optional `alignToNormal` blend between up and the terrain
  normal, plus `sink` (m) to bury roots.
- Storage: `InstanceChunkGrid` keeps 32 m cells. Each cell owns a contiguous range in a per-asset static instance buffer
  (32 B/instance). Per frame, cells are frustum-culled (AABB includes max wind sway) and bucketed by distance into
  LOD0/LOD1/impostor ranges. Draws are `drawElementsInstanced` with `firstInstance` emulated by per-range buffer offsets
  (WebGL2 has no base instance: bind the attribute pointer at `rangeStart * 32` bytes).
- Material: `FoliageMaterial` is PBR with `alphaCutoff` (default 0.5), two-sided with back-face normal flip,
  translucency (wrap diffuse plus `transmissionColor * pow(saturate(dot(-L, V)), 4) * thickness`), per-instance colour
  variation (hue ±4%, value ±10%), and alpha-to-coverage when MSAA is on (PRD 04 owns A2C generally; this PRD consumes
  it). Bark and opaque rocks use the standard PBR material with wind weight 0.
- Impostors: octahedral (hemi-octahedral for ground-standing assets) 8×8 views at 256², with albedo+alpha and
  normal+depth atlases, baked offline by `tools/impostor-bake` (§9.6). Runtime blends the 3 nearest views by
  barycentric weights in octahedral space, with depth-based parallax offset. Crossfade between LOD1 and the impostor
  uses screen-door dithering (4×4 Bayer) over a 4 m band. Impostors write depth and cast shadows only in the far cascade
  (High+).
- Wind: `WindField` UBO `{ direction.xz, strength, gustStrength, gustScale, time }` plus a 64×64 RG8 tiling gust noise
  texture shipped as an asset. Vertex weights come from the asset's vertex colour (R: trunk/branch bend weight, G: leaf
  flutter weight, B: phase). If absent, `tools/world-content-bake` derives R from normalized height and G from
  alpha-tested material membership at admission. The same vertex function runs in the depth pass (PRD 02 dependency, §12).

### 6.6 Shipped world content (engine assets; CC0 or MIT only, admitted through PRD 05 with provenance)

| Set | Contents | Candidate sources (verify licence and availability at admission) | GPU memory budget |
|---|---|---|---|
| Terrain layers | grass-meadow, grass-dry, dirt-path, rock-cliff, rock-scree, sand-beach, snow, forest-floor, asphalt, gravel (10 layers; albedo+height, normal, ORM at 1k + 512) | ambientCG / Poly Haven textures (CC0) | ≤ 1.4 MB/map/layer at 1k (KTX2) |
| Foliage | pine (3 variants), broadleaf (3), bush (3), fern, grass-card atlas, flower-card atlas, each with LOD0/LOD1 + impostor atlas | Quaternius nature packs / Kenney Nature Kit (CC0); Poly Haven plants (CC0) | ≤ 8 MB per species incl. impostor |
| Rocks | 6 rocks + 2 cliff chunks with LOD1 | Poly Haven rocks (CC0); existing `propRockA/B` after PRD 05 optimization | ≤ 4 MB total |
| Water | 2 water normal maps 512² (tileable), foam 512², caustics 256² 16-frame atlas | procedurally baked by `tools/world-content-bake` (no third-party art) | 1.5 MB |
| Noise | wind gust 64², macro variation 512², blue noise 64² | baked in-repo | 0.3 MB |
| HDRIs | outdoor-day, golden-hour, overcast, night-city, interior-room (procedural, no file), 2k + 1k each | Poly Haven (CC0); replaces the 3 × 1k fixtures for biome use | 8 MB (2k RGBA16F) each when active; only one active |
| City kit | road straight/curve/intersection/crosswalk, sidewalk, curb, 6 building modules (base/mid/roof × 2 styles), street lamp, bench, bin, sign, traffic light, fence, barrier | Kenney City Kit (CC0), KayKit City Builder Bits (CC0) | ≤ 15 MB |
| Interior kit | wall/door/window panels, floor tiles, ceiling panel + light fixture, pillar, shelf, crate, table, chair, rug, pool table optional | Kenney Furniture Kit / KayKit (CC0) | ≤ 10 MB |
| Trackside kit | tyre wall, barrier, catch fence, grandstand, gantry, marshal post, cones, kerb profile | Kenney Racing Kit (CC0) | ≤ 8 MB |
| Space | default baked cube 512², planet albedo/night/cloud 2k (procedural bake), ring band 1D texture | baked in-repo | ≤ 14 MB |

Content rules: no 4-triangle unlit image cards for world objects (19 C19). Every model must have base colour and
normal maps (or an explicit stylized-material decision recorded in the kit manifest and judged visually), plus LOD1.
Textures must be KTX2 (PRD 05 encode) with PNG fallback. The `suitabilityReason` texture waiver regex
(`aura3d-cli/src/index.ts:3376-3382`, 19 C19) does not apply to `packages/engine/assets/world`.

### 6.7 Time of day

- Sun direction: `solarPosition(hour, latitudeDeg, dayOfYear, northOffsetDeg)` (NOAA simplified algorithm, ±0.5°), or
  `arc` mode (`elevation = sin(π·(hour−6)/12) · maxElevation`, azimuth linear) for stylized games.
- Keyframes: a sorted list `{ hour, biome }`. Between keyframes the rig values are interpolated: colours in linear RGB,
  intensities in log space, fog density linearly, exposure in EV. Sky parameters come from PRD 07's sky spec.
- IBL: the rig's sky is re-captured into a back-buffer PMREM. A capture triggers when the sun has moved ≥ 1.5° or the
  keyframe weight has changed ≥ 0.05. One cube face renders per frame, and prefilter mips are spread over subsequent
  frames (≤ 0.2 ms/frame budget). The swap is atomic on completion, with a 0.5 s crossfade via a two-texture lerp
  uniform (`u_envBlend`) owned by PRD 02.
- Practicals: `practicalScale(hour)` multiplies emissive intensity of materials tagged `practical: true` (windows, lamps,
  signs) and the intensity of lights tagged `practical`, via one uniform. Lights are not rebuilt.
- Runtime: `app.world.timeOfDay.set(hour)`, `.animate({ hoursPerSecond })`, `.pause()`, `.get()`. These write uniforms
  only and never remount the scene.

---

## 7. APIs to add, change and remove

All new agent-API symbols live in `packages/engine/src/agent-api/world/` and are exported as `world` from
`@aura3d/engine`. The renderer pieces are also exported from the subpath `@aura3d/engine/world`, so routes that do not
use world systems do not pay the bundle cost (§17.4). Final placement in the public namespace is subject to PRD 15
consolidation. Names here are binding unless PRD 15 renames them, in which case it maps them 1:1.

### 7.1 `@aura3d/engine` agent API

#### 7.1.1 Shared types

```ts
// packages/engine/src/agent-api/world/types.ts
export type AuraWorldQualityTier = "low" | "medium" | "high" | "ultra"; // resolved from PRD 11 tiers
export type AuraBiomeId =
  | "outdoor-day" | "golden-hour" | "overcast" | "night-city" | "polar-night" | "alpine-snow"
  | "interior-warm" | "interior-neutral" | "interior-industrial" | "space" | "underwater";

export interface AuraTierValue<T> { readonly low?: T; readonly medium?: T; readonly high?: T; readonly ultra?: T }
export type AuraTiered<T> = T | AuraTierValue<T>; // scalar applies to all tiers

export interface AuraWorldNodeBase {
  readonly name?: string;
  /** Diagnostics: counted from submitted draws, never from node metadata. */
  readonly diagnosticsLabel?: string;
}
```

#### 7.1.2 Biomes and environment defaults

```ts
// packages/engine/src/agent-api/world/biomes.ts
export interface AuraBiomeSunSpec {
  readonly elevationDeg: number; readonly azimuthDeg: number;
  readonly intensity: number; readonly colorTemperatureK?: number; readonly color?: AuraColor;
  readonly castShadow?: boolean;
}
export interface AuraBiomeRig {
  readonly id: AuraBiomeId;
  readonly sky: AuraSkySpec | null;                 // type owned by PRD 07 (preetham | gradient | hdri | cubemap)
  readonly environment:
    | { readonly source: "sky-capture"; readonly intensity: number; readonly faceSize: AuraTiered<64 | 128 | 256> }
    | { readonly source: "hdri"; readonly hdri: AuraAssetRef<"texture">; readonly intensity: number; readonly rotationDeg: number }
    | { readonly source: "room"; readonly colorTemperatureK: number; readonly intensity: number }
    | { readonly source: "space-bake"; readonly intensity: number };
  readonly sun: AuraBiomeSunSpec | null;
  readonly shadows: { readonly cascades: AuraTiered<1 | 2 | 3 | 4>; readonly maxDistance: AuraTiered<number>; readonly strength: number; readonly softness: number };
  readonly fog: AuraHeightFogSpec | null;          // type owned by PRD 07
  readonly post: AuraPostPresetSpec;               // type owned by PRD 03 (tone map, exposureEv, bloom, grade)
  readonly practicalScale: number;                 // multiplier for emissive/lights tagged practical
  readonly ambientPolicy: "ibl-only";
}
export interface AuraBiomeOverrides {
  readonly sun?: Partial<AuraBiomeSunSpec>;
  readonly environment?: Partial<AuraBiomeRig["environment"]>;
  readonly fog?: Partial<AuraHeightFogSpec> | null;
  readonly post?: Partial<AuraPostPresetSpec>;
  readonly practicalScale?: number;
}
export interface AuraBiomeNode extends AuraWorldNodeBase { readonly kind: "biome"; readonly biome: AuraBiomeId; readonly overrides?: AuraBiomeOverrides }

export declare const world: {
  biome(id: AuraBiomeId, overrides?: AuraBiomeOverrides): AuraNodeBuilder<AuraBiomeNode>;
  biomes: {
    list(): readonly AuraBiomeId[];
    describe(id: AuraBiomeId, tier?: AuraWorldQualityTier): AuraBiomeRig; // frozen, inspectable by agents
  };
  // ... continued below
};

// environments.* additions (packages/engine/src/agent-api/index.ts:4123-4190): thin aliases that emit a biome node
// with environment-only scope (sky/sun/fog untouched).
environments.outdoor(options?: AuraEnvironmentOptions & { readonly biome?: "outdoor-day" | "golden-hour" | "overcast" | "alpine-snow" }): AuraNodeBuilder<AuraEnvironmentNode>;
environments.room(options?: AuraEnvironmentOptions & { readonly colorTemperatureK?: number }): AuraNodeBuilder<AuraEnvironmentNode>;
environments.space(options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraEnvironmentNode>;
environments.underwater(options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraEnvironmentNode>;
```

Resolution order in `BiomeResolver` (replaces the start of `createProductionRuntimeEnvironment`, `index.ts:12628`):
explicit `environments.*` (environment slot only) > `world.biome` > `world.timeOfDay` keyframe rig > default biome
(§6.3 table) > PRD 02 neutral room. `lights.ambient` nodes are additive and never zero IBL in any branch (PRD 02 owns
the general change; this resolver enforces it for world scenes).

#### 7.1.3 Time of day and wind

```ts
export interface AuraTimeOfDayOptions extends AuraWorldNodeBase {
  readonly hour: number;                                         // 0..24
  readonly mode?: "solar" | "arc";                               // default "solar"
  readonly latitudeDeg?: number; readonly dayOfYear?: number; readonly northOffsetDeg?: number;
  readonly maxElevationDeg?: number;                             // arc mode
  readonly keyframes?: readonly { readonly hour: number; readonly biome: AuraBiomeId; readonly overrides?: AuraBiomeOverrides }[];
  readonly ibl?: { readonly recapture?: boolean; readonly thresholdDeg?: number; readonly crossfadeSeconds?: number };
  readonly stars?: boolean;                                      // forwarded to PRD 07 sky
}
export interface AuraTimeOfDayNode extends AuraWorldNodeBase { readonly kind: "time-of-day"; readonly options: AuraTimeOfDayOptions }

export interface AuraWindSpec extends AuraWorldNodeBase {
  readonly directionDeg?: number;     // default 35
  readonly strength?: number;         // 0..2, default 0.5
  readonly gustStrength?: number;     // 0..1, default 0.35
  readonly gustScale?: number;        // world metres per gust cell, default 40
}
export interface AuraWindNode extends AuraWorldNodeBase { readonly kind: "wind"; readonly wind: AuraWindSpec }

world.timeOfDay(options: AuraTimeOfDayOptions): AuraNodeBuilder<AuraTimeOfDayNode>;
world.wind(spec?: AuraWindSpec): AuraNodeBuilder<AuraWindNode>;
```

#### 7.1.4 Terrain

```ts
export type AuraHeightSource =
  | { readonly kind: "asset"; readonly asset: AuraAssetRef<"texture">; readonly encoding: "png16" | "r32f" | "exr" }
  | { readonly kind: "procedural"; readonly seed: number; readonly octaves?: number; readonly baseFrequency?: number;
      readonly ridged?: number; readonly terrace?: number;
      readonly flatten?: readonly { readonly shape: AuraWorldShape; readonly height: number; readonly falloff: number }[] }
  | { readonly kind: "array"; readonly columns: number; readonly rows: number; readonly heights: Float32Array };

export type AuraWorldShape =
  | { readonly kind: "circle"; readonly center: readonly [number, number]; readonly radius: number }
  | { readonly kind: "polygon"; readonly points: readonly (readonly [number, number])[] }
  | { readonly kind: "spline"; readonly spline: AuraSplineHandle; readonly width: number };

export interface AuraTerrainLayerSpec {
  readonly name: string;
  readonly preset?: "grass-meadow" | "grass-dry" | "dirt-path" | "rock-cliff" | "rock-scree" | "sand-beach" | "snow" | "forest-floor" | "asphalt" | "gravel";
  readonly albedoHeight?: AuraAssetRef<"texture">; readonly normal?: AuraAssetRef<"texture">; readonly orm?: AuraAssetRef<"texture">;
  readonly uvScale?: number;          // metres per tile, default from preset
  readonly triplanar?: boolean;       // default true for rock-*
  readonly heightBlend?: number;      // 0..1 contrast, default 0.35
  readonly tint?: AuraColor; readonly roughnessBias?: number;
}
export type AuraSplatSpec =
  | { readonly kind: "texture"; readonly maps: readonly [AuraAssetRef<"texture">] | readonly [AuraAssetRef<"texture">, AuraAssetRef<"texture">] }
  | { readonly kind: "auto"; readonly rules: readonly AuraSplatRule[]; readonly resolution?: AuraTiered<512 | 1024 | 2048> };
export interface AuraSplatRule {
  readonly layer: string;
  readonly slopeDeg?: readonly [number, number]; readonly height?: readonly [number, number];
  readonly curvature?: readonly [number, number]; readonly noise?: { readonly scale: number; readonly threshold: number; readonly seed?: number };
  readonly mask?: AuraWorldShape; readonly weight?: number; readonly falloff?: number;
}
export interface AuraTerrainOptions extends AuraWorldNodeBase {
  readonly height: AuraHeightSource;
  readonly size: readonly [number, number];          // metres X, Z
  readonly heightScale?: number;                     // metres for normalized 1.0
  readonly origin?: AuraVec3;
  readonly layers: readonly AuraTerrainLayerSpec[];  // 1..8
  readonly splat?: AuraSplatSpec;                    // default: auto with RULES_DEFAULT (slope→rock, height→snow, rest grass/dirt noise)
  readonly holes?: readonly AuraWorldShape[];
  readonly lod?: { readonly patchSize?: AuraTiered<32 | 64>; readonly levels?: AuraTiered<number>; readonly morphRatio?: number };
  readonly collider?: boolean | { readonly friction?: number; readonly restitution?: number };
  readonly castShadow?: boolean;                     // default true (far cascades only on low)
  readonly macroVariation?: number;                  // 0..1, default 0.25
}
export interface AuraTerrainNode extends AuraWorldNodeBase { readonly kind: "terrain"; readonly options: AuraTerrainOptions; readonly id: string }

world.terrain(options: AuraTerrainOptions): AuraNodeBuilder<AuraTerrainNode> & { readonly handle: AuraTerrainHandle };

export interface AuraTerrainHandle {           // usable at build time (placement) and at runtime
  readonly id: string;
  heightAt(x: number, z: number): number;      // bilinear, identical to shader
  normalAt(x: number, z: number): AuraVec3;
  slopeDegAt(x: number, z: number): number;
  layerWeightsAt(x: number, z: number): Readonly<Record<string, number>>;
  raycast(origin: AuraVec3, direction: AuraVec3, maxDistance?: number): { readonly point: AuraVec3; readonly distance: number } | null;
}
```

#### 7.1.5 Scatter and grass

```ts
export interface AuraScatterAsset {
  readonly asset: AuraAssetRef<"model">;
  readonly weight?: number;                    // relative probability, default 1
  readonly scale?: readonly [number, number];  // uniform scale range, default [0.85, 1.15]
  readonly sink?: number;                      // metres, default 0.05
  readonly alignToNormal?: number;             // 0..1, default 0 for trees, 1 for rocks
  readonly impostor?: AuraAssetRef<"texture"> | "auto" | "none"; // "auto": use the baked atlas registered with the asset
  readonly wind?: boolean;                     // default true when the asset has foliage materials
}
export interface AuraScatterLayer {
  readonly assets: readonly AuraScatterAsset[];
  readonly density: number;                    // instances per 100 m²
  readonly minDistance?: number;               // Poisson radius, metres
  readonly slopeDeg?: readonly [number, number];
  readonly height?: readonly [number, number];
  readonly onLayers?: Readonly<Record<string, readonly [number, number]>>; // terrain layer weight ranges
  readonly densityMask?: AuraAssetRef<"texture">;
  readonly exclude?: readonly AuraWorldShape[];
  readonly rotationY?: "random" | number;
  readonly colorVariation?: number;            // 0..0.2
}
export interface AuraScatterOptions extends AuraWorldNodeBase {
  readonly surface: AuraTerrainHandle | { readonly kind: "area"; readonly shape: AuraWorldShape; readonly y?: number };
  readonly layers: readonly AuraScatterLayer[];
  readonly seed: number;
  readonly lod?: { readonly lod1Distance?: AuraTiered<number>; readonly impostorDistance?: AuraTiered<number>; readonly cullDistance?: AuraTiered<number>; readonly crossfade?: number };
  readonly shadows?: AuraTiered<"none" | "near" | "all">;   // default { low: "none", medium: "near", high: "near", ultra: "all" }
  readonly budget?: AuraTiered<number>;                     // max instances; enforced through planScatterInstances/enforceFrameBudget
  readonly collision?: "none" | "trunk-capsules";           // static capsules for tree trunks via physics
}
export interface AuraScatterNode extends AuraWorldNodeBase { readonly kind: "scatter"; readonly options: AuraScatterOptions }
export interface AuraScatterResult {
  readonly node: AuraScatterNode;
  readonly instanceCount: number;              // after rules and budget
  readonly perAsset: Readonly<Record<string, number>>;
  readonly checksum: string;                   // deterministic hash of placements (tests)
}
world.scatter(options: AuraScatterOptions): AuraScatterResult;

export interface AuraGrassOptions extends AuraWorldNodeBase {
  readonly terrain: AuraTerrainHandle;
  readonly onLayers?: Readonly<Record<string, readonly [number, number]>>; // default { "grass-meadow": [0.4, 1] }
  readonly density?: AuraTiered<number>;       // blades per m², default { low: 0 (cards), medium: 10, high: 20, ultra: 32 }
  readonly radius?: AuraTiered<number>;        // metres, default { low: 15, medium: 30, high: 45, ultra: 60 }
  readonly bladeHeight?: readonly [number, number]; // default [0.18, 0.42]
  readonly bladeWidth?: number;                // default 0.035
  readonly colorFromTerrain?: boolean;         // default true
  readonly tipColor?: AuraColor;
  readonly exclude?: readonly AuraWorldShape[];
}
export interface AuraGrassNode extends AuraWorldNodeBase { readonly kind: "grass"; readonly options: AuraGrassOptions }
world.grass(options: AuraGrassOptions): AuraNodeBuilder<AuraGrassNode>;
```

#### 7.1.6 Water

```ts
export interface AuraGerstnerWave { readonly directionDeg: number; readonly wavelength: number; readonly steepness: number; readonly speed?: number }
export interface AuraWaterOptions extends AuraWorldNodeBase {
  readonly kind: "ocean" | "lake" | "river" | "pool";
  readonly shape: AuraWorldShape | { readonly kind: "infinite"; readonly radius: number };
  readonly height?: number;                         // world Y of rest surface, default 0
  readonly shallowColor?: AuraColor; readonly deepColor?: AuraColor;
  readonly absorption?: readonly [number, number, number]; // per metre, default ocean [0.45, 0.09, 0.06]
  readonly waves?: readonly AuraGerstnerWave[] | "calm" | "moderate" | "rough"; // presets map to 4/8 waves
  readonly normalScale?: number; readonly normalSpeed?: number;
  readonly reflection?: AuraTiered<"ibl" | "ssr" | "planar">; // default { low: "ibl", medium: "ibl", high: "planar", ultra: "planar" }
  readonly reflectionLayers?: readonly string[];    // node tags included in planar pass, default ["terrain", "kit", "hero"]
  readonly refraction?: AuraTiered<boolean>;        // default { low: false, others: true }
  readonly foam?: { readonly shoreDepth?: number; readonly crest?: number };
  readonly flowDirectionDeg?: number;               // river: scrolls normals along direction
  readonly underwater?: boolean;                    // enable below-surface mode, default true for ocean/lake
  readonly caustics?: boolean;                      // default true when underwater or water depth < 4 m
}
export interface AuraWaterNode extends AuraWorldNodeBase { readonly kind: "water"; readonly options: AuraWaterOptions; readonly id: string }
world.water(options: AuraWaterOptions): AuraNodeBuilder<AuraWaterNode> & { readonly handle: AuraWaterHandle };
export interface AuraWaterHandle {
  readonly id: string;
  heightAt(x: number, z: number, timeSeconds: number): number;    // same Gerstner sum as the vertex shader
  normalAt(x: number, z: number, timeSeconds: number): AuraVec3;
  isUnderwater(point: AuraVec3, timeSeconds: number): boolean;
}
```

#### 7.1.7 Kits and placement

```ts
export interface AuraKitPieceSpec {
  readonly id: string;
  readonly asset: AuraAssetRef<"model">;
  readonly footprint: readonly [number, number];      // grid cells X, Z
  readonly height?: number;                           // metres, for stacking
  readonly pivot?: "corner" | "center";               // default "center"
  readonly sockets?: readonly { readonly name: string; readonly position: AuraVec3; readonly forward: AuraVec3 }[];
  readonly tags?: readonly string[];                  // e.g. ["practical"] for lamps
  readonly collider?: "none" | "box" | "convex" | "mesh";
  readonly lights?: readonly { readonly socket: string; readonly light: AuraLightNodeSpec }[]; // practical lights attached
}
export interface AuraKitDefinition { readonly id: string; readonly gridSize: number; readonly pieces: readonly AuraKitPieceSpec[]; readonly license: string }
export function defineKit(definition: AuraKitDefinition): AuraKit;

export interface AuraKitPlacement {
  readonly piece: string;
  readonly cell: readonly [number, number];           // grid coordinates
  readonly level?: number;                            // vertical stack index
  readonly rotation?: 0 | 90 | 180 | 270;
  readonly variant?: number;
  readonly snapTo?: { readonly placementIndex: number; readonly socket: string; readonly socketOnPiece: string };
}
export interface AuraKit {
  readonly id: string;
  place(placements: readonly AuraKitPlacement[], options?: { readonly origin?: AuraVec3; readonly rotationYDeg?: number; readonly name?: string }): readonly AuraSceneNode[];
  fill(region: { readonly min: readonly [number, number]; readonly max: readonly [number, number] }, rules: readonly { readonly piece: string; readonly weight: number; readonly tags?: readonly string[] }[], seed: number): readonly AuraSceneNode[];
  piece(id: string): AuraKitPieceSpec;
}
world.kits: { readonly city: AuraKit; readonly interior: AuraKit; readonly trackside: AuraKit; readonly space: AuraKit };

export interface AuraSplineHandle {
  readonly length: number;
  pointAt(t: number): AuraVec3; tangentAt(t: number): AuraVec3; frameAt(t: number): { readonly right: AuraVec3; readonly up: AuraVec3; readonly forward: AuraVec3 };
  closestT(point: AuraVec3): number;
}
world.spline(points: readonly AuraVec3[], options?: { readonly closed?: boolean; readonly tension?: number; readonly up?: "y" | "banked"; readonly bankDeg?: readonly number[] }): AuraSplineHandle;

export type AuraExtrudeProfile = readonly (readonly [number, number])[] | "road-2-lane" | "road-4-lane" | "race-track" | "curb" | "rail" | "tunnel-round" | "tunnel-box" | "fence";
world.extrude(spline: AuraSplineHandle, options: {
  readonly profile: AuraExtrudeProfile;
  readonly material: AuraMaterialSpec;            // must support repeat UVs (PRD 04 sampler fix)
  readonly segmentsPerMeter?: number;             // default 0.5, adaptive on curvature
  readonly uv?: { readonly uScale?: number; readonly vMetersPerTile?: number };
  readonly conformToTerrain?: AuraTerrainHandle;  // drapes and flattens the terrain under the extrusion
  readonly collider?: boolean;
  readonly name?: string;
}): AuraSceneNode;

world.placeAlong(spline: AuraSplineHandle, item: AuraAssetRef<"model"> | { readonly kit: AuraKit; readonly piece: string }, options: {
  readonly spacing: number; readonly offset?: readonly [number, number]; readonly side?: "left" | "right" | "both";
  readonly alignToTangent?: boolean; readonly jitter?: number; readonly seed?: number; readonly start?: number; readonly end?: number;
  readonly ground?: AuraTerrainHandle;
}): readonly AuraSceneNode[];
world.placeGrid(item: AuraAssetRef<"model">, options: { readonly origin: AuraVec3; readonly count: readonly [number, number]; readonly spacing: readonly [number, number]; readonly jitter?: number; readonly seed?: number; readonly ground?: AuraTerrainHandle }): readonly AuraSceneNode[];
world.placePoisson(items: readonly AuraScatterAsset[], options: { readonly shape: AuraWorldShape; readonly minDistance: number; readonly seed: number; readonly ground?: AuraTerrainHandle; readonly exclude?: readonly AuraWorldShape[] }): readonly AuraSceneNode[];
```

All placement functions compose full matrices internally (`translate · rotateY · scale`, with the parent kit origin
and rotation applied as a matrix). They emit one `instances.model` node per unique asset, with `static: true`. They
never emit `group()` hierarchies (K4).

#### 7.1.8 Rooms and streets

```ts
world.room(options: {
  readonly size: readonly [number, number, number];             // metres W, H, D
  readonly kit?: AuraKit;                                       // default world.kits.interior
  readonly walls?: { readonly piece?: string; readonly material?: AuraMaterialSpec };
  readonly floor?: { readonly material?: AuraMaterialSpec | "wood" | "concrete" | "tile" | "carpet" };
  readonly ceiling?: { readonly piece?: string; readonly lights?: { readonly grid: readonly [number, number]; readonly intensity?: number; readonly colorTemperatureK?: number; readonly castShadow?: "none" | "center" | "all" } };
  readonly openings?: readonly { readonly wall: "north" | "south" | "east" | "west"; readonly offset: number; readonly width: number; readonly height: number; readonly kind: "door" | "window" }[];
  readonly dressing?: readonly { readonly piece: string; readonly position: AuraVec3; readonly rotationYDeg?: number }[];
  readonly biome?: "interior-warm" | "interior-neutral" | "interior-industrial"; // default interior-neutral
  readonly name?: string;
}): readonly AuraSceneNode[];

world.street(options: {
  readonly path: AuraSplineHandle;
  readonly lanes?: 2 | 4;
  readonly sidewalkWidth?: number;
  readonly kit?: AuraKit;                                       // default world.kits.city
  readonly buildings?: { readonly side: "left" | "right" | "both"; readonly setback: number; readonly heightRange: readonly [number, number]; readonly seed: number };
  readonly props?: readonly { readonly piece: string; readonly spacing: number; readonly side: "left" | "right" | "both"; readonly offset: number }[];
  readonly markings?: boolean;                                  // decals via PRD 07
  readonly wet?: number;                                        // 0..1 wetness via PRD 07 wetness term
  readonly name?: string;
}): readonly AuraSceneNode[];
```

#### 7.1.9 Materials

```ts
// AuraMaterialSpec additions (packages/engine/src/agent-api/index.ts:1027)
readonly alphaMode?: "opaque" | "mask" | "blend";   // default "opaque"; "mask" uses alphaCutoff
readonly alphaCutoff?: number;                      // default 0.5 when alphaMode = "mask"
readonly practical?: boolean;                       // emissive scaled by world practicalScale (§6.7)

material.foliage(options: {
  readonly map: AuraAssetRef<"texture">; readonly normalMap?: AuraAssetRef<"texture">;
  readonly alphaCutoff?: number; readonly translucency?: number; readonly translucencyColor?: AuraColor;
  readonly roughness?: number; readonly wind?: boolean;
}): AuraMaterialSpec;
material.terrainLayer(preset: AuraTerrainLayerSpec["preset"]): AuraTerrainLayerSpec;
material.planet(options: {
  readonly albedo?: AuraAssetRef<"texture"> | "procedural-earthlike" | "procedural-rocky" | "procedural-gas";
  readonly night?: AuraAssetRef<"texture">; readonly clouds?: AuraAssetRef<"texture"> | number;
  readonly atmosphereColor?: AuraColor; readonly atmosphereThickness?: number; readonly seed?: number;
}): AuraMaterialSpec;
```

#### 7.1.10 Runtime handle

```ts
export interface AuraWorldRuntime {
  readonly timeOfDay: { set(hour: number): void; get(): number; animate(options: { readonly hoursPerSecond: number }): void; pause(): void };
  readonly wind: { set(spec: Partial<AuraWindSpec>): void };
  terrain(nameOrId: string): AuraTerrainHandle;
  water(nameOrId: string): AuraWaterHandle;
  diagnostics(): AuraWorldDiagnostics;
}
export interface AuraWorldDiagnostics {             // every number is measured from submitted draws in the last frame
  readonly terrain: readonly { readonly id: string; readonly nodesDrawn: number; readonly trianglesDrawn: number; readonly layers: number; readonly degraded: boolean }[];
  readonly scatter: readonly { readonly name: string; readonly lod0: number; readonly lod1: number; readonly impostor: number; readonly culled: number; readonly shadowCasters: number; readonly draws: number }[];
  readonly grass: readonly { readonly bladesDrawn: number; readonly chunks: number; readonly mode: "blades" | "cards" | "off" }[];
  readonly water: readonly { readonly id: string; readonly reflection: "ibl" | "ssr" | "planar"; readonly planarDraws: number; readonly refraction: boolean; readonly underwater: boolean }[];
  readonly biome: { readonly id: AuraBiomeId | null; readonly environmentSource: string; readonly iblPixelBacked: boolean; readonly backgroundDrawn: boolean };
  readonly gpuMs?: Readonly<Record<string, number>>; // when EXT_disjoint_timer_query_webgl2 is available
}
// AuraApp addition (packages/engine/src/agent-api/index.ts:11126+)
readonly world: AuraWorldRuntime;
```

### 7.2 Changed

| Symbol | Change |
|---|---|
| `instances.box/sphere/plane/cylinder/capsule/torus/custom` | Honour `size` (V4). Accept `static?: boolean` (default `true` when `transforms` is a literal array never mutated through runtime handles), which uploads once and skips per-frame `createProductionInstanceTransforms`. |
| `instances.model` | Accept `static`, `chunkSize` (metres, default 32 when > 256 instances), `shadowLod: "none" \| "lod1" \| "impostor"`, `wind?: boolean`, `impostor?: AuraAssetRef<"texture">`. |
| `createProductionRuntimeEnvironment` | Delegates to `BiomeResolver`. The ambient branch no longer emits `environmentMapIntensity: 0` for world scenes. |
| `prefabs.cityBlock` / `city.block` | Re-implemented on `world.kits.city` + `world.street` once the kit is admitted (Phase 5). Until then: unchanged output, plus a build warning "primitive placeholder city; use world.street". |
| `sceneKitPerformanceBudgets.*.evidence` strings (`index.ts:9683-9796`) | Replaced by values from `AuraWorldDiagnostics`. Strings that claim impostors are deleted. |
| `sampleTerrainHeightfield` (`TerrainHeightfield.ts:133`) | Bilinear interpolation. `queryTerrainHeight` doc unchanged (now true). |
| `planScatterInstances` / `enforceFrameBudget` | Kept as the budget enforcer called by `world.scatter`. The return type gains `perCell` counts. |
| `EnvironmentPresetPack` | Night `exposureFactor` removed. The SSIM gate compares per-preset references instead of normalized luma. |

### 7.3 Deprecated, then removed (removal after PRD 14 migration, no later than Phase 7 exit)

| Symbol | Replacement | Removal condition |
|---|---|---|
| `water.surface` (`index.ts:3870-3905`) | `world.water({ kind: "lake" \| "ocean" })` | 0 call sites in `apps/`, `examples/`, templates |
| `water.buoyancy` | `app.world.water(id).heightAt/normalAt` | same |
| `weather.wetGround` (`index.ts:3807-3843`) | PRD 07 wetness term on any material + `world.street({ wet })` | same |
| `prefabs.cityBlock`, `city.block`, `city.cityBlock` | `world.street` / `world.kits.city.place` | same |
| `planSkyBackdrop` (`LayeredSceneComposition.ts:503-543`) | PRD 07 gradient sky; distant layers via `world.scatter` of impostor buildings or ridge meshes | owned with PRD 07 |
| `createTerrainTileGrid`, `TerrainTilePlan` (`TerrainTiles.ts:15-96`) | `TerrainCdlod` | immediately (no external callers; verify with `rg`) |
| `resolveTerrainSlopeBlend` | GPU auto-splat rules (default rule set encodes the same formula) | after Phase 2 |
| `createProceduralSkyDome`, `createEnvironmentStage`, `createNamedEnvironmentPreset` (`EnvironmentPlatform.ts:395-415`, `EnvironmentPreset.ts`) | biomes | immediately (no callers in engine/apps/templates, 08 §8.5) |
| `WaterSurface.ts`, `WaterReflectionRefractionCapture` CPU composite (`OceanSurface.ts:389-455`) | `WaterMaterial`, `ReflectionViewPass` | after Phase 4 |
| `@aura3d/materials` `THREE_COMPAT_TEXTURE_SETS` aliasing GLB embedded textures (`TextureSet.ts:18-56`) for terrain/foliage purposes | `packages/engine/assets/world/terrain` layer presets | coordinate with PRD 04 |

---

## 8. Shader changes

All chunks are written in GLSL ES 3.00 and in WGSL. Until PRD 11 lands its shared material IR, each world material
registers a real WGSL program under its own marker in `createNativeShaderSources` (`WebGPUDevice.ts:3179-3311`). A
world material with no WGSL program makes the app select WebGL2 for that scene and report
`renderer.backendFallback: "world-material-no-wgsl"`. It must never render as flat `u_draw.color` (07 §2).
Lighting, shadows, IBL, fog and tone mapping come from the shared PBR chunks (PRD 01/02/07). World shaders provide only
surface inputs and vertex deformation.

### 8.1 Terrain (CDLOD vertex + splat fragment)

Vertex (`world/terrain/shaders/terrain.vert.glsl.ts`):

```glsl
in vec2 a_grid;                         // patch-local grid coords in [0,1]
in vec4 a_node;                         // per-instance: offsetX, offsetZ, nodeSize, lod
uniform highp sampler2D u_height;       // R32F, texelFetch only (no float filtering required)
uniform vec4 u_terrain;                 // originX, originZ, sizeX, sizeZ
uniform float u_heightScale;
uniform vec2 u_heightTexSize;
uniform vec2 u_morph[8];                // per LOD: morphStart, morphEnd (distance)
uniform float u_gridDim;                // patch quads per side (32 or 64)
uniform vec3 u_cameraPosition;

float heightBilinear(vec2 uv) {         // must match AuraTerrainHandle.heightAt bit-for-bit within 1e-4 m
  vec2 p = uv * (u_heightTexSize - 1.0);
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
  float h00 = texelFetch(u_height, i, 0).r,               h10 = texelFetch(u_height, i + ivec2(1,0), 0).r;
  float h01 = texelFetch(u_height, i + ivec2(0,1), 0).r,  h11 = texelFetch(u_height, i + ivec2(1,1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_heightScale;
}
void main() {
  vec2 world = a_node.xy + a_grid * a_node.z;
  float h = heightBilinear((world - u_terrain.xy) / u_terrain.zw);
  float d = distance(u_cameraPosition, vec3(world.x, h, world.y));
  int lod = int(a_node.w);
  float morph = clamp((d - u_morph[lod].x) / (u_morph[lod].y - u_morph[lod].x), 0.0, 1.0);
  vec2 fracPart = fract(a_grid * u_gridDim * 0.5) * 2.0 / u_gridDim;  // odd vertices
  world -= fracPart * a_node.z * morph;                              // snap toward parent grid
  vec2 uv = (world - u_terrain.xy) / u_terrain.zw;
  h = heightBilinear(uv);
  v_worldPosition = vec3(world.x, h, world.y);
  v_terrainUv = uv;
  gl_Position = u_viewProjection * vec4(v_worldPosition, 1.0);
}
```

Fragment (`world/terrain/shaders/terrain.frag.glsl.ts`, providing `a3dSurface` inputs to the shared PBR lighting):

- Macro normal: `n = normalize(vec3(hL - hR, 2.0 * texel, hD - hU))` from 4 `texelFetch` of `u_height` at the fragment UV
  (texel spacing = world size / tex size).
- Splat weights `w[0..7]` come from `u_splat0` (RGBA) and `u_splat1` (RGBA, optional), sampled with mips.
- Per layer i with `w[i] > 0.004` (dynamic loop over at most 8 layers, with an early-out mask built from the splat; on
  Low a compile-time 4-layer unrolled variant):
  - `uvA = worldXZ / scale_i`, and `uvB = rot(0.62) * worldXZ / (scale_i * 3.7)` (anti-tiling second scale).
  - Distance blend `t = smoothstep(20.0, 80.0, viewDist)` gives `sample = mix(tex(uvA), tex(uvB), t*0.5 + noise*0.25)`,
    where `noise` is from the macro variation texture.
  - Triplanar layers (flag in `u_layerParams[i].y`): sample on the YZ, XZ and XY planes with weights
    `pow(abs(n), vec3(4.0))` normalized. Normals use the whiplash/UDN reoriented triplanar blend. Triplanar runs only if
    the layer weight > 0.05 and the slope weight `1 - n.y > 0.15`, so flat ground pays one projection.
  - Height-blend (Unreal "height lerp"): `hb_i = w[i] + albedoHeight_i.a * u_layerParams[i].z`. Then
    `m = max(hb) - depth (0.2)`, `w'_i = max(hb_i - m, 0)`, and normalize w'.
- Final surface:
  - `albedo = Σ w'_i * albedo_i * tint_i * (0.85 + 0.3 * macro)`.
  - Normal = UDN blend of the macro normal with `Σ w'_i * detailNormal_i`.
  - `ORM = Σ w'_i * orm_i`, plus roughness bias.
  - Holes: `if (texture(u_holes, uv).r < 0.5) discard;`.
- Texture fetches per fragment: Medium flat ground with 2 active layers ≈ 2 × 3 maps × 2 scales = 12 array fetches, plus
  4 height and 2 splat. On steep rock, +6 for triplanar.

### 8.2 Wind (`a3d_wind` chunk, shared by foliage, grass and the depth pass)

```glsl
layout(std140) uniform A3DWind { vec4 u_windDirStrength; vec4 u_windGust; };  // dir.xz, strength, time | gustStrength, 1/gustScale, -, -
uniform sampler2D u_windNoise;                                                   // 64² RG8, repeat
vec3 a3dWindOffset(vec3 localPos, vec3 instanceOrigin, vec4 weights /* vertex colour */, float assetHeight) {
  vec2 dir = u_windDirStrength.xy; float strength = u_windDirStrength.z; float t = u_windDirStrength.w;
  vec2 gustUv = instanceOrigin.xz * u_windGust.y - dir * t * 0.08;
  float gust = texture(u_windNoise, gustUv).r * u_windGust.x;
  float h = clamp(localPos.y / max(assetHeight, 0.01), 0.0, 1.0);
  float bend = (strength + gust) * h * h * weights.r;                             // trunk/branch bend, quadratic in height
  float sway = sin(t * (1.1 + weights.b) + dot(instanceOrigin.xz, vec2(0.37, 0.71))) * 0.25 * strength * weights.r;
  vec3 offset = vec3(dir.x, 0.0, dir.y) * (bend + sway) * 0.35 * assetHeight;
  float flutter = sin(t * 7.3 + weights.b * 6.2831 + dot(localPos, vec3(2.1, 1.7, 2.9))) * 0.035 * (strength + gust) * weights.g;
  offset += vec3(flutter, flutter * 0.4, -flutter);
  // length preservation: keep the vertex on a sphere around the root to avoid stretching
  vec3 bent = localPos + offset;
  return normalize(bent) * length(localPos) - localPos;   // length-preserving offset
}
```

Wind applies in object space before the instance matrix. The same function is included in the depth vertex shader so
that shadows move with the foliage. Normal for lighting: bend the vertex normal by the same rotation approximation
(`n' = normalize(n + offset * 0.5 / assetHeight)`).

### 8.3 Foliage fragment

- `alpha = texture(u_baseColor, uv).a`. If `u_alphaToCoverage == 0`, run `if (alpha < u_alphaCutoff) discard;`.
  Otherwise output alpha sharpened for A2C: `alpha = (alpha - u_alphaCutoff) / max(fwidth(alpha), 1e-4) + 0.5`.
- Two-sided: `n = gl_FrontFacing ? n : -n`.
- Translucency term added to the shared direct-light loop for the directional sun only:
  `trans = translucencyColor * albedo * pow(saturate(dot(V, -L)), 4.0) * thickness * shadow * sunColor`.
- Per-instance colour variation: `albedo *= 1.0 + (a_instanceVariation.x - 0.5) * vec3(0.08, 0.12, 0.04)`.
- Dither crossfade: `if (bayer4x4(gl_FragCoord.xy) > a_instanceFade) discard;` (fade written per instance band in VS
  from distance).

### 8.4 Octahedral impostor

- Vertex: billboard quad facing the camera, centred at the instance's bounding-sphere centre. Compute the view direction
  in object space (`inverse(instanceRotation) * normalize(cameraPos - center)`), map it to hemi-octahedral grid
  coordinates (8×8), and output 3 frame UVs plus barycentric weights.
- Fragment: sample albedo+alpha and normal+depth from the 3 frames. Apply parallax offset per frame
  (`uv += (depth - 0.5) * frameViewDirXY * u_impostorParallax`), blend by weights, alpha-test, and convert the normal
  from impostor space to world. Write `gl_FragDepth` from the depth channel (High+ only; Low skips it for early-Z).
- Shadow: in the far cascade only, the depth pass runs the same alpha test with depth writes.

### 8.5 Grass

- Vertex (no instance buffers):
  - Per chunk, a uniform `{chunkOriginXZ, chunkSize, seed, bladeCount}`.
  - Blade i: `h = hash(seed, gl_InstanceID)` gives position inside the chunk (stratified jitter), yaw, height and
    bend.
  - Terrain height via `heightBilinear`; colour from `u_terrainAlbedoLowRes` (a 512² baked albedo of the terrain splat,
    produced at load).
  - Density falloff: blades beyond `radius * (0.5 + 0.5 * h.w)` collapse to zero-area triangles.
- Blade shape: 7 vertices along a quadratic Bézier, with width tapering to the tip. Wind uses `a3dWindOffset` with
  weight `(h², 0, phase)`.
- Normal: `mix(bladeNormal, terrainNormal, 0.6)`. This avoids the dark-blade look under top-down light.
- Fragment: two-sided, translucency term as foliage, roughness 0.65, and AO `mix(0.45, 1.0, v_bladeT)` from root to tip.
- Low: cards (2 tris) with an alpha-tested 4-variant atlas, same placement hash.

### 8.6 Water

Vertex (`a3d_gerstner` chunk; `GerstnerWaves.ts` holds the same constants and formula for CPU):

```glsl
uniform vec4 u_waves[8];      // dir.x, dir.y, steepness, wavelength
uniform float u_waveSpeed[8]; uniform int u_waveCount; uniform float u_time;
vec3 gerstner(vec2 xz, out vec3 normal) {
  vec3 p = vec3(xz.x, 0.0, xz.y); vec3 tangent = vec3(1,0,0), binormal = vec3(0,0,1);
  for (int i = 0; i < 8; i++) { if (i >= u_waveCount) break;
    vec2 d = u_waves[i].xy; float k = 6.2831853 / u_waves[i].w; float c = sqrt(9.81 / k) * u_waveSpeed[i];
    float f = k * (dot(d, xz) - c * u_time); float a = u_waves[i].z / k;
    p.x += d.x * a * cos(f); p.y += a * sin(f); p.z += d.y * a * cos(f);
    tangent  += vec3(-d.x*d.x*u_waves[i].z*sin(f),  d.x*u_waves[i].z*cos(f), -d.x*d.y*u_waves[i].z*sin(f));
    binormal += vec3(-d.x*d.y*u_waves[i].z*sin(f),  d.y*u_waves[i].z*cos(f), -d.y*d.y*u_waves[i].z*sin(f));
  }
  normal = normalize(cross(binormal, tangent)); return p;
}
```

The sum of steepness values is clamped to ≤ 1 on the CPU to prevent loops. The Jacobian proxy
`1 - Σ steepness·sin(f)` goes to the fragment shader as `v_crest` for crest foam.

Fragment:

```glsl
vec3 n = blendUDN(v_waveNormal, texture(u_normal0, v_xz / 6.0 + u_time * u_flow0).xyz * 2.0 - 1.0,
                               texture(u_normal1, v_xz / 17.0 + u_time * u_flow1).xyz * 2.0 - 1.0, u_normalScale);
vec3 V = normalize(u_cameraPosition - v_worldPosition);
float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);                 // Schlick, water IOR 1.33
vec2 suv = gl_FragCoord.xy / u_viewport;
float sceneZ = linearDepth(texture(u_sceneDepth, suv).r); float waterZ = linearDepth(gl_FragCoord.z);
float thickness = max(sceneZ - waterZ, 0.0);
vec2 ruv = suv + n.xz * u_refractionStrength * clamp(thickness, 0.0, 1.0);
if (linearDepth(texture(u_sceneDepth, ruv).r) < waterZ) ruv = suv;          // reject foreground leaks
vec3 refracted = texture(u_sceneColor, ruv).rgb;                             // SceneColorCopy (linear HDR)
vec3 T = exp(-u_absorption * thickness);                                     // Beer-Lambert per channel
vec3 transmitted = refracted * T + u_scatterColor * (1.0 - T) * a3dSunIrradiance();
vec3 R = reflect(-V, n);
vec3 reflected = u_reflectionMode == 2 ? texture(u_planarReflection, suv + n.xz * u_reflectionDistort).rgb
                                       : a3dSampleEnvironmentSpecular(R, 0.03);   // PRD 02 IBL, or SSR result (mode 1)
vec3 sunSpec = a3dDirectSpecularGGX(n, V, u_sunDirection, 0.06) * u_sunColor * a3dSunShadow(v_worldPosition);
float shoreFoam = (1.0 - smoothstep(0.0, u_foamShoreDepth, thickness)) * texture(u_foam, v_xz / 3.0 + u_time * 0.02).r;
float crestFoam = smoothstep(u_foamCrest, u_foamCrest - 0.15, v_crest) * texture(u_foam, v_xz / 5.0).g;
vec3 color = mix(transmitted, reflected, F) + sunSpec;
color = mix(color, vec3(0.9) * a3dSunIrradiance() + a3dSkyIrradiance(), clamp(shoreFoam + crestFoam, 0.0, 1.0));
color = a3dApplyFog(color, v_worldPosition);                                 // PRD 07 chunk
```

On Low (no SceneColorCopy), `transmitted = u_deepColor * a3dSkyIrradiance()`, mixed toward `u_shallowColor` by
`exp(-thickness)` when a depth texture exists, else by a per-vertex shore distance attribute baked at build from the
terrain.

### 8.7 Underwater and caustics

- `a3d_caustics` chunk, included in the shared PBR lighting behind `#define A3D_CAUSTICS` (PRD 01 owns the shader
  framework; this PRD supplies the chunk). For fragments with `worldPos.y < waterHeightAt(worldPos.xz)`:
  - Project along the sun direction to the water plane: `cuv = (worldPos.xz - L.xz * (h - worldPos.y) / L.y) / u_causticScale`.
  - Sample the 16-frame caustic atlas at `cuv` with frame `floor(t * 12) mod 16` (crossfaded between frames).
  - Multiply the direct sun term by `1.0 + u_causticStrength * c * exp(-depth * 0.15)`.
- Underwater mode (camera below the surface):
  - Fog switches to an absorption fog (PRD 07 fog with per-channel density `u_absorption`).
  - The water surface is drawn back-face with a Snell's window: total internal reflection outside the 48.6° cone,
    `refractAngle = asin(sin(θ) * 1.33)`.
  - Background uses the underwater gradient.
  - Post adds a slight wavy distortion via a 2-tap UV offset from the normal texture (PRD 03 hook).

### 8.8 Space bake and planet

- Space bake (`world/space/shaders/space-bake.glsl.ts`), run once per face into an RGBA16F cube:
  - Stars: for each face texel, look up the star hash grid (cell size by magnitude band). Output a Gaussian with σ =
    0.6 texel, peak luminance `pow(10, -0.4 * (mag - mag0))`, and colour from a blackbody temperature lookup.
  - Nebula: `fbm(domainWarp(dir * 2.3), 6 octaves)` mapped through 2 colour ramps from `SpaceEnvironment` nebula
    descriptors, at intensity 0.05–0.3 so stars stay dominant.
  - Dust: low-frequency dark lanes (subtracted).
- Planet:
  - Surface: albedo/night/clouds with terminator wrap lighting `wrap = saturate((dot(n, L) + 0.2) / 1.2)`. The night map
    shows where `dot(n, L) < 0`, with a 0.1 transition. Clouds cast a shadow by sampling the cloud map at a sun-offset UV.
  - Atmosphere: a second, 1.025× scaled sphere drawn additively. Rim = `pow(1 - saturate(dot(n, V)), 3.5)` modulated by
    `saturate(dot(n, L) + 0.35)` and `atmosphereColor`.

---

## 9. Rendering changes

### 9.1 Pass order (production root frame)

1. Shadow maps (PRD 02): terrain (far cascades on Low), kit instances, scatter LOD0/LOD1 near cascade (wind-deformed,
   alpha-tested), impostors far cascade (High+).
2. Planar reflection (`ReflectionViewPass`, High+ and only when a visible water node requests it):
   - Reflected camera about the water plane, with an oblique near clip plane (Lengyel) to cull geometry below the water.
   - Half resolution, RGBA16F + depth24.
   - Draws the sky (PRD 07), terrain at LOD bias +2 and items tagged with `reflectionLayers`. No grass, no particles,
     no water itself.
   - Skipped when the water plane is off-screen or its screen coverage < 2%.
3. Opaque forward: terrain → kits/scatter (front-to-back by cell) → grass → other opaque.
4. Sky/background (PRD 07) drawn after opaque with depth test `LEQUAL` at far plane (early-Z saves fill).
5. `SceneColorCopy` + depth copy (shared resource defined with PRD 04 transmission; one copy per frame, at render
   resolution, RGBA16F). Skipped on Low and when no water or transmission is visible.
6. Water (sorted as transparent, depth write on for the surface, so particles behind it are occluded).
7. Transparents and particles (PRD 07).
8. Post (PRD 03); underwater distortion hook.

### 9.2 Production bridge integration

- `createProductionRuntimeSceneRenderer` (`index.ts:13540+`) gains a `worldLowering` step before
  `collectRenderItems`. `production-runtime/world/*` builders convert world nodes to `RenderItem`s with world materials
  and register per-frame update callbacks:
  - CDLOD selection
  - cell culling
  - grass ring
  - time-of-day uniforms
  - water time
- World render items carry `static: true` buffers. The bridge must not re-run `createProductionInstanceTransforms` for
  them.
- Render source additions (`index.ts:13990-14005`): `environmentBackground` from the biome's sky (PRD 07 owns the field
  semantics), `reflectionViews: ReflectionViewRequest[]`, `sceneColorCopy: boolean`, `worldUniforms: { wind, time,
  practicalScale }`.
- `app.world` is created in `createAuraApp` (`index.ts:11126+`). Handles resolve by node `name` or generated `id`.
- Safe-basic fallback (`createWebGLSceneRenderer`): terrain = `createTerrainHeightfieldGeometry` mesh with vertex-colour
  splat; scatter = `instances.model` without wind/impostors; water = single plane with Fresnel tint; biome = sky
  gradient clear + IBL as available. Each emits `world.degraded: <reason>` in diagnostics and is visible in
  `app.diagnostics().world`.

### 9.3 Instancing fixes this PRD requires (owned here when not already landed by PRD 11)

- `createProductionInstanceTransforms` passes `size: node.size` into `localNode` (V4). Test in §15.1.
- Static instance buffers: allocate once per world item via `device.createBuffer("vertex", …)`, keep across frames,
  and dispose on scene teardown. This bypasses `applyInstanceBinding`'s per-frame allocation (V5) for world items.
  PRD 11 owns the general fix for dynamic instances and the VAO cache.
- Instance attribute layout (32 B):
  - `vec3 position`
  - `float yawScalePacked` (yaw 16-bit, scale 16-bit as half)
  - `vec4 variation` (colour variation, LOD fade, wind phase, reserved) as `unorm8x4`
  - `vec4 extra` reserved as `unorm8x4`
- Instance matrices are reconstructed in the vertex shader (yaw + uniform scale). Arbitrary 3×4 matrices are only
  needed for kits, where a 48 B layout `mat3x4` is used.
- WebGPU: world materials use a storage-buffer instance array (no 4-instance uniform cap, V6). This needs the WGSL
  program from §8. If PRD 11's IR is unavailable, the hand-written WGSL is required for Phase 3 exit on WebGPU, or
  WebGPU is excluded from Phase 3 acceptance (stated in §18).

### 9.4 Culling and LOD

- Terrain: CPU quadtree with per-node AABB (min/max height per node precomputed at load) against the frustum. LOD by
  distance ranges `range_l = range_0 * 2^l` with `range_0 = patchWorldSize * 1.5` (High). This targets ≤ 1.5 px
  geometric error at 1080p.
- Scatter: per-cell AABB frustum test. Per-instance LOD on the GPU via the fade attribute written by a per-cell CPU
  pass on Low/Medium (cells within one band share LOD), or computed in the VS from distance on High/Ultra. Instances
  outside their band output `gl_Position = vec4(2.0, 2.0, 2.0, 1.0)` (clipped), so each LOD band is drawn as one draw per
  cell-group.
- Shadow casters: scatter cells beyond the near cascade split distance are excluded from cascade 0 and 1 except
  impostors (High+).
- Occlusion culling: out of scope (07 §3.4). Large kit buildings use per-instance distance culling only.

### 9.5 Resource management

- Texture arrays are built at load by uploading each layer's KTX2 levels into a `TEXTURE_2D_ARRAY` (WebGL2 core) or a
  `texture_2d_array` (WebGPU). All layers must share size and compressed format. A mismatch is resized at admission
  (PRD 05), never at runtime.
- Total world GPU memory is tracked per tier (§17) and reported in `app.diagnostics().world.memoryMB`. Exceeding the
  tier budget at load drops layer resolution one step and warns.
- KTX2 transcoding uses the locally bundled basis transcoder (PRD 05 removes the unpkg CDN, 11 §3). World assets
  require it, and fall back to PNG when unavailable.

### 9.6 Impostor baking (offline)

`tools/impostor-bake/index.ts --asset <id> --views 8 --size 256` loads the GLB in a bake page (WebGL2) on the remote
macos-14 runner. For each hemi-octahedral view direction it renders the asset orthographically into a 256² tile:
albedo+alpha, normal (object space) + linear depth. It writes `<id>.impostor.albedo.ktx2` and
`<id>.impostor.normaldepth.ktx2` plus a JSON with bounding sphere and view count, and registers them with the asset
manifest via PRD 05's `assets add`. The output is deterministic: the same GLB hash gives the same atlas hash.


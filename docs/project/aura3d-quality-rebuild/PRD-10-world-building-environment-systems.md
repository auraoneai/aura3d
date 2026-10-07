# PRD 10: World Building / Environment Systems

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed, parallelized against `CONTRACTS.md` (2026-10-05). Lane: **PRD 10 World**, flag `A3D_QR_WORLD`.
Owned paths are exactly CONTRACTS §4.1 row 10 (repeated in "Parallel execution"). This PRD provides contract **C-26**
and consumes C-01, C-02, C-03, C-06, C-07, C-08, C-09, C-10, C-11, C-12, C-13, C-15, C-16, C-17, C-21, C-27, C-30,
C-31, C-33, C-34, C-36, C-37, C-38, C-39 and C-40, always against the PR 0 stub. It never waits for another lane; the
earlier draft's "PRD NN owns / after PRD NN lands" wording is replaced by contract IDs (§12) and non-blocking requests
(§12.3). Where this document names another PRD it is attribution of evidence or of a contract's provider, not a
dependency.

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
is three.js-quality until the integrated thresholds in §16.2 are met at a G-PANEL checkpoint (CONTRACTS §7). Standalone
acceptance (§16.1), conformance tests and engineering gates prove interfaces and determinism only; they are never
quality claims.

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
| `@aura3d/rendering` | New `world/` module (subpath `@aura3d/rendering/world`, reserved in PR 0a): terrain CDLOD + `TerrainMaterial`; `InstanceChunkGrid`, `FoliageMaterial`, `ImpostorMaterial`, `GrassField`, `WindField`; `WaterMaterial`, `ReflectionViewPass`, `GerstnerWaves`, `SceneCopyFallback`; `SpaceSkyBake`; chunks registered through C-02 (`a3d_prd10_wind`, `a3d_prd10_terrain_splat`, `a3d_prd10_gerstner`, `a3d_prd10_caustics`, `a3d_prd10_world_light_fallback`). Fix `sampleTerrainHeightfield` interpolation. Delete `TerrainTiles.createTerrainTileGrid`, `EnvironmentPreset.ts` and the `EnvironmentPresetPack` night normalization (all PRD 10-owned). |
| `@aura3d/engine` agent-api | New `world` namespace in `agent-api/world/` (`world.biome`, `world.timeOfDay`, `world.terrain`, `world.scatter`, `world.grass`, `world.water`, `world.kits`, `world.spline`, `world.extrude`, `world.placeAlong/placeGrid/placePoisson`, `world.room`, `world.street`, `world.wind`, `world.materials.{foliage,terrainLayer,planet}`); `practical` semantics on `AuraMaterialSpec` (field pre-declared in PR 0a, C-15); `app.world` via C-38; world node handlers via C-36; builders in PRD 10-owned carve-outs `nodes/{instances,water,environments.world}.ts` and `nodes/prefabs/cityBlock.ts`; world diagnostics section via C-31. The instance-size fix (V4) is PRD 15's (CONTRACTS R18, unflagged); `alphaMode/alphaCutoff` semantics are PRD 04's (R12). |
| `@aura3d/engine` production-runtime | `production-runtime/world/{TerrainRuntime,ScatterRuntime,GrassRuntime,WaterRuntime,TimeOfDayRuntime,BiomeResolver,WorldFramePasses,WorldDiagnostics}.ts`: C-36 node handlers lower world nodes; `WorldFramePasses` registers the `prd10.world` C-01 contributor. |
| `@aura3d/environments` | New `BiomeEnvironmentRegistry.ts` only (biome HDRI ids, quality floors checked at load inside this file). `EnvironmentRegistry/HDRIEnvironment/PMREMPreset.ts` are PRD 02's and are not edited. |
| `@aura3d/physics` / `@aura3d/physics-rapier` | Consumer only. `world.terrain({ collider: true })` builds a `HeightfieldShape` (`physics/src/Shape.ts:37`) through the existing public physics API from PRD 10's own `agent-api/world/terrain.ts`. PRD 10 owns `physics-rapier/src/HeightfieldLayout.ts` (row-major converter, `:12`). |
| `@aura3d/aura3d-cli` | `assets bake-impostor`, `world bake-content` registered through C-39 from `packages/aura3d-cli/src/commands/prd10/`. Texture-set/HDRI/height admission types are C-17 (PRD 05); PRD 10 calls them, never edits `cli.ts`. |
| `packages/engine/assets/world/` (new) | Shipped CC0 content: terrain layer sets, foliage, rocks, water normals, caustics, wind noise, biome HDRIs, starter kits (city, interior, trackside, space). Budget in §17.3. |
| `benchmarks/quality-rebuild` | Lane scenes only, in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd10/` (C-30 ids `prd10-*`). The shared 16-instancing spec is PRD 12's and is unchanged. |
| `tools/impostor-bake/`, `tools/world-content-bake/` (new) | Offline deterministic bakers (impostor atlases, wind vertex weights, water/noise textures, space cubemaps). Bake pages run on the remote macos-14 runner only. |
| `apps/*` | Not edited by this lane. PRD 14 owns routes (R21) and applies the `prd10-world-migrate` codemod/report shipped via C-39. |
| `packages/aura3d-cli/skills/**`, templates | Not edited. PRD 13 writes skill text from PRD 10's C-40 facts rows `F-10-*`. |

---

## 5. Affected files / directories

Every path below is classified by CONTRACTS §4 ownership. PRD 10 commits only to "Owned" paths. "Extension point"
rows are reached from PRD 10 files through a PR 0 registry or seam, without editing the host file. "Request" rows are
changes in files owned by other lanes, filed non-blocking (§12.3). Line numbers were re-checked at `7992a0dd`.

Owned, modify (CONTRACTS §4.1 row 10):

- `packages/engine/src/agent-api/nodes/instances.ts` (verbatim carve-out of `index.ts:2222-2287`, PR 0b-1): new options
  `static`, `chunkSize`, `shadowLod`, `wind`, `impostor` on `instances.model` (`index.ts:2241-2286` today). With
  `A3D_QR_WORLD` on and any of those options set, the builder emits a `scatter` node with explicit placements (handled by
  PRD 10's `ScatterRuntime`) instead of a `model` node; flag off emits today's node unchanged.
- `packages/engine/src/agent-api/nodes/water.ts` (carve-out of `index.ts:3870-3909`): `water.surface` deprecated; with the
  flag on it returns a `world.water({ kind: "lake" })` node (§7.3).
- `packages/engine/src/agent-api/nodes/environments.world.ts` (new, empty in PR 0b-1, spread into `environments`):
  `environments.outdoor/room/space/underwater` (§7.1.2).
- `packages/engine/src/agent-api/nodes/prefabs/cityBlock.ts` (carve-out of `index.ts:5842-5901`): re-implemented on
  `world.kits.city` + `world.street` behind the flag (Phase 5). The `city.block` alias (`index.ts:9241-9245`) calls
  `prefabs.cityBlock` and needs no edit.
- `packages/engine/src/agent-api/LayeredSceneComposition.ts`: `planSkyBackdrop` (`:503-543`) deprecated (§7.3).
- `packages/rendering/src/TerrainHeightfield.ts:133-141` (bilinear `sampleTerrainHeightfield`; today `Math.round` at
  `:134-135`), `:143-217` (keep; add `toHeightTexture`).
- `packages/rendering/src/TerrainTiles.ts` (324 lines): delete `createTerrainTileGrid` (`:47-96`) and the header claim
  (`:1-13`); keep `planScatterInstances` (from `:135`), `enforceFrameBudget` and `queryTerrainHeight` (`:116-133`).
- `packages/rendering/src/VegetationScatter.ts` (claim boundary at `:134` rewritten to name the new runtime).
- `packages/rendering/src/OceanSurface.ts` (601 lines): `oceanPresetWaves` `:170` and `evaluateWaves` `:213` move to
  `world/water/GerstnerWaves.ts`; `WaterReflectionRefractionCapture` (`:389-455`) deleted after Phase 4.
- `packages/rendering/src/WaterSurface.ts` (deleted after 0 call sites), `EnvironmentPresetPack.ts:25-46` (night
  `exposureFactor` removed), `EnvironmentPreset.ts` (deleted), `SpaceEnvironment.ts` (input to `SpaceSkyBake`).
- `fixtures/three-compat/environments/manifest.json` (delete aliased `industrial-sunset-puresky`, `spruit-sunrise`,
  `venice-sunset`, L10).
- `packages/physics-rapier/src/HeightfieldLayout.ts` (only if hole support needs a mask parameter; additive).

Owned, create:

- `packages/rendering/src/world/terrain/`: `TerrainCdlod.ts`, `TerrainPatchGeometry.ts`, `TerrainHeightTexture.ts`
  (R32F upload + manual bilinear contract), `TerrainMaterial.ts`, `shaders/terrain.{vert,frag}.glsl.ts`,
  `shaders/terrain.wgsl.ts`.
- `packages/rendering/src/world/vegetation/`: `InstanceChunkGrid.ts`, `FoliageMaterial.ts`, `ImpostorMaterial.ts`,
  `GrassField.ts`, `WindField.ts`, `shaders/{wind,foliage,impostor,grass}.{glsl,wgsl}.ts`.
- `packages/rendering/src/world/water/`: `WaterMaterial.ts`, `GerstnerWaves.ts`, `ReflectionViewPass.ts`,
  `SceneCopyFallback.ts`, `Caustics.ts`, `UnderwaterState.ts`, `shaders/{water,caustics}.{glsl,wgsl}.ts`.
- `packages/rendering/src/world/space/`: `SpaceSkyBake.ts`, `PlanetMaterial.ts`, `shaders/{space-bake,planet}.glsl.ts`.
- `packages/rendering/src/world/lighting/WorldLightFallback.ts` (chunk `a3d_prd10_world_light_fallback`, §8.0).
- `packages/rendering/src/world/index.ts` (entry of the reserved subpath `@aura3d/rendering/world`).
- `packages/engine/src/agent-api/world/`: `index.ts`, `types.ts`, `biomes.ts`, `timeOfDay.ts`, `wind.ts`, `terrain.ts`,
  `scatter.ts`, `grass.ts`, `water.ts`, `kits.ts`, `spline.ts`, `placement.ts`, `room.ts`, `street.ts`, `materials.ts`,
  `queries.ts` (C-26 real), `runtime.ts` (`AuraWorldRuntime`), `register.ts` (all `register*` calls).
- `packages/engine/src/agent-api/compiler/world.ts` (C-36 node handlers for `biome`, `time-of-day`, `wind`, `terrain`,
  `scatter`, `grass`, `water`).
- `packages/engine/src/production-runtime/world/`: `BiomeResolver.ts`, `TerrainRuntime.ts`, `ScatterRuntime.ts`,
  `GrassRuntime.ts`, `WaterRuntime.ts`, `TimeOfDayRuntime.ts`, `WorldFramePasses.ts`, `WorldDiagnostics.ts`.
- `packages/environments/src/BiomeEnvironmentRegistry.ts`.
- `packages/engine/assets/world/`: `manifest.json`, `terrain/`, `foliage/`, `rocks/`, `water/`, `noise/`, `hdri/`,
  `kits/{city,interior,trackside,space}/` (§6.6).
- `tools/impostor-bake/`, `tools/world-content-bake/` (bake pages run on the remote macos-14 runner only).
- Lane-generic: `packages/{rendering,engine,assets,animation}/src/lanes/prd10.ts`,
  `agent-api/compiler/diagnosticOnly.prd10.ts`, `packages/aura3d-cli/src/commands/prd10/`,
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd10/`, `.github/workflows/qr-prd10-world.yml`,
  `tests/qr/prd10/`, `tests/unit/contracts/impl/prd10-*`, `docs/project/aura3d-quality-rebuild/evidence/prd-10/`.

Reached through extension points (host file not edited by PRD 10):

| Host file (owner) | What PRD 10 needs there | Extension point |
|---|---|---|
| `agent-api/index.ts` `createProductionRuntimeSceneRenderer` `:13540` / `compiler/renderer.ts` (15) | world node lowering | C-36 `registerNodeHandler` for the 7 world kinds pre-declared in `AuraNodeKindMap` |
| `index.ts` render-source build `:13990` / `compiler/renderInput.ts` (15) | `reflectionViews`, `sceneColorCopy`, `worldUniforms` | C-36 `RenderSourceContributions.set`; fields pre-declared on `RenderSource` in PR 0a (CONTRACTS §3.5) |
| `createAuraApp` `index.ts:11126` / `app/createAuraApp.ts` (15) | `app.world` | C-38 `registerAppExtension({ member: "world" })` |
| `createProductionRuntimeEnvironment` `index.ts:12628` / `compiler/environment.ts` (02) | biome and time-of-day environment selection | C-09 `registerEnvironmentSource` (`prd10.biome` priority 300, `prd10.timeOfDay` 250) |
| `ForwardPass.ts` (01) | world draws, water after opaque | C-01 `registerFrameContributor("prd10.world")`; C-02 chunks/features; C-07 `instanceBufferSlot` |
| `DepthPass.ts:59-87` (02) | wind-deformed, instanced, alpha-tested casters | C-11 `registerDepthVariantFeature("prd10.wind")` |
| shared PBR lighting (01) | caustics, practical scale, foliage translucency | C-02 `registerShaderFeature` (`prd10.caustics`, `prd10.practical`), C-03 lobe `prd10.foliageTranslucency` |
| `AuraMaterialSpec` `index.ts:1027` (15, types) | `alphaMode`, `alphaCutoff`, `alphaToCoverage`, `doubleSided`, `practical` | pre-declared in PR 0a (C-15); `practical` semantics PRD 10 |
| `AuraDiagnostics` `index.ts:10377` (15) | `world` section | C-31 `registerDiagnosticsSection({ key: "world" })` |
| `packages/aura3d-cli/src/cli.ts` (05) | `assets bake-impostor`, `world bake-content`, codemod | C-39 `registerCliCommand`, `registerCodemod` |
| `benchmarks/quality-rebuild/shared/*` (12) | world scenes | C-30 lane scene index `scenes/prd10/index.ts` |
| `looks/generatedCodeWarnings.ts` (13) | world lint rules | C-34 `registerLookLintRule` (`look/world-void`, `look/primitive-trees`) |

Request only (non-blocking, §12.3): `index.ts:14747-14754` instance size (R18, PRD 15), `devtools/sceneKitBudgets.ts`
evidence strings from `index.ts:9683-9796` (11), `nodes/weather.ts` `wetGround` (07), `EnvironmentPlatform.ts:395-415`
`createProceduralSkyDome` (02), `WebGPUDevice.ts` WGSL program registration `:3179` (11),
`packages/materials/src/TextureSet.ts:40` `THREE_COMPAT_TEXTURE_SETS` (15), `nodes/material.ts` aliases (04),
engine subpath `@aura3d/engine/world` (15).

---

## 6. Architecture proposal

### 6.1 Target architecture

```
agent API (agent-api/world, PRD 10)                                        runtime handle (C-38 member "world")
  world.biome / world.timeOfDay / world.wind                                app.world.timeOfDay.set(h)
  world.terrain / world.scatter / world.grass / world.water                 app.world.setWind(...)
  world.kits / world.spline / world.extrude / world.place*                  app.world.terrain(n).heightAt(x,z)
  world.room / world.street                                                 app.world.ground()/height()/biome()  (C-26)
        | emits typed nodes: "biome" | "time-of-day" | "wind" | "terrain" | "scatter" | "grass" | "water"
        | (all 7 kinds pre-declared in C-36 AuraNodeKindMap); kits/placement/room/street emit "scatter" nodes
        | with explicit placements plus extruded custom geometry; never group() hierarchies
        v
compiler (PRD 15) -> C-36 registerNodeHandler -> agent-api/compiler/world.ts (PRD 10)
  BiomeResolver   -> C-21 AuraSkySpec + AuraHeightFogSpec (app.atmosphere.setSky/setFog, PRD 07 stub or real)
                  -> C-09 environment source "prd10.biome" (priority 300) / "prd10.timeOfDay" (250)
                  -> C-13 post preset id + exposure override; C-10 sun light node
  TerrainRuntime  -> CDLOD node selection (CPU, per frame) -> 1 instanced draw per LOD level; HeightfieldShape (same R32F)
  ScatterRuntime  -> InstanceChunkGrid (static GPU buffers, C-07 instanceBufferSlot or own buffers) -> cell cull -> LOD/impostor
  GrassRuntime    -> camera-centred chunk ring, blade data generated in VS from gl_InstanceID + chunk seed
  WaterRuntime    -> WaterMaterial (reads scene colour/depth copy) -> optional ReflectionViewPass (C-08 CameraLike)
  TimeOfDayRuntime-> per-frame uniforms; amortized sky re-capture through C-21 skyBackgroundSlot + C-09 fromScene
        v
draw path selected once at mount (§9.1):
  Path S (standalone, stubs): C-01 contributor "prd10.world": phase "background" (world opaque after sky, before
          ForwardPass), "after-opaque" (prd10 scene colour/depth copy), "transparent" (water TransparentQueueItems);
          PRD 10-owned complete GLSL programs + a3d_prd10_world_light_fallback (sun + SH stub + sky horizon), no shadows
  Path G (generator real: programCacheSlot.provided && A3D_QR_CORE=v2): world RenderItems added in C-01 "collect";
          surface/vertex chunks as C-02 ShaderFeatures; lighting, IBL (C-09), shadows (C-11), fog (C-21) shared
```

Design rules:

1. **One world node, one renderer consumer.** Every world node kind has a C-36 handler, a safe-basic degraded lowering
   (diagnosed as a C-36 `capability-degraded` degradation) and an observed-draw diagnostic in the C-31 `world` section. A
   node with no consumer is a build-time error under `A3D_QR_STRICT`, an `option-ignored` degradation otherwise.
2. **Static content is uploaded once.** Terrain height textures, scatter/kit instance buffers and extruded geometry are
   GPU-resident and are not rebuilt per frame. Today root instance matrices are recomputed every frame in JS (07 §3.3).
   World instances live in PRD 10's `InstanceChunkGrid` and never pass through `createProductionInstanceTransforms`.
3. **One source for physics and pixels.** Terrain height, water height (Gerstner) and placement ground-snapping use the
   same data and the same interpolation on CPU and GPU. This fixes T2 and is the C-26 `heightAt` semantics.
4. **Rigs are data, not code.** A biome is a frozen `AuraBiomeRigDetail` (superset of C-26 `AuraBiomeRig`) that composes
   C-21 sky/fog specs, a C-13 post preset id and a C-09 environment resolution. PRD 10 owns the values and the visual
   acceptance of each rig, not the passes.
5. **Content ships with the engine.** Each world system ships at least one licence-clean default asset set, so a call
   without asset arguments still renders a textured result (§6.6). Defaults are judged visually (§16.2), not by
   existence.
6. **Matrix-correct placement.** Kits, placement and splines compose full 4x4 matrices themselves and emit flat
   instance lists. They never rely on `group()` composition, whatever the state of C-06 (19 C6).
7. **Tier-scaled, not tier-gated.** Every system renders on Low (mobile) with reduced parameters read from C-27
   `QUALITY_TIERS` (`lodBias`, `maxTextureSize`, `shadow.*`, `environmentSize`) plus the PRD 10 tables in §17.
   Features that cannot run on Low (planar reflection, triplanar on all layers, grass beyond 20 m) degrade to defined
   fallbacks.
8. **Two draw paths, one look target.** Path S proves geometry, determinism, textures and queries on today's renderer
   with stubs. Path G adds shared lighting, shadows and IBL when C-02/C-09/C-11 are real. Visual acceptance is judged
   only on Path G at checkpoints (§16.2); Path S renders are reported, never claimed as quality.

### 6.2 Recommendations with cost profile

GPU/CPU costs are targets for a Medium-tier desktop (integrated-class GPU, 1080p) unless stated otherwise. They are
validated per §17. "Bundle" means gzip JS added to the `@aura3d/engine/world` subpath. Asset bytes are listed separately
in §17.3.

#### R1. Biome rigs + environment defaults (§6.3)

- What: 11 packaged rigs (the 11 C-26 `AuraBiomeId`s: sky, IBL source, sun, shadows, fog, post, exposure, practical-light scale) and scene-category
  default biomes, so `createAuraApp` never renders a void with zero IBL.
- Visual benefit: **highest per unit effort.** It addresses the top-1 change in the vision judgments for patrol-wing,
  siege-golf, orbital-defense, deep-recovery and turbo-drift ("Sky plus IBL in one move", 21), and benchmarks 09 and 13.
- GPU: no new passes; rigs drive C-21 sky/fog, C-09 environment and C-13 post. Sky-capture IBL costs 1 cube render (6×128² sky-only) + prefilter
  ≈ 1.5–3 ms **once** at load; with time-of-day, amortized ≤ 0.2 ms/frame (§6.7).
- CPU: < 0.05 ms/frame (uniform writes).
- Memory: HDRI rigs use a 2k RGBE equirect (8 MB GPU as RGBA16F 2048×1024) + PMREM 256² cube RGBA16F with mips
  (≈ 2.1 MB). Sky-capture rigs use only the PMREM.
- Bundle: +4 KB (rig tables + resolver).
- Mobile: Low uses 1k equirect background, 128² PMREM faces, sky-capture preferred over HDRI.
- Fallback: if the HDRI fails to load, the rig's procedural sky (C-21 `preetham` or `gradient` spec) is captured instead,
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
  reports `world.terrain.degraded`. WebGPU: every PRD 10 chunk ships a hand-written `ShaderChunk.wgsl` twin (C-02); a
  missing twin yields `WGSL_PROGRAM_MISSING` and the C-26 world section reports it (§18).

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
  highlight, shoreline and crest foam, and fog. Reflection comes from sky/IBL (all tiers), SSR (C-13 `post.ssr` when real) or a
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
  lamps, props, decal markings via the public `decals` API). Every placement resolves to `scatter` nodes with explicit
  placements, one per unique asset, drawn from static instance buffers.
- Visual benefit: high for city, interior and track games (courier, neon-swarm, aura-clash, gallery, mech-hangar,
  bank-shot, vault, turbo, pulse-tunnel). It replaces primitive dressing and gives density.
- GPU: depends on content. Instancing keeps draw calls ≤ number of unique kit pieces visible (target ≤ 150 draws for
  a city block).
- CPU: build-time only (placement and extrusion run once at scene build, ≤ 30 ms for 5k placements). No per-frame cost
  beyond culling.
- Memory: kit GLBs (KTX2 + Meshopt, C-16/C-17) ≈ 6–15 MB per kit GPU.
- Bundle: +6 KB (API, extrusion, Poisson); kit assets are lazy-loaded.
- Mobile: same; kits are authored with LOD1 and are trimmed by cull distance.
- Fallback: none needed for API. Missing kit assets fail loudly at build with the asset id (no primitive substitution).

#### R7. Time of day (§6.7)

- What: `world.timeOfDay` drives sun direction (solar position from hour, latitude and day of year, or a simple arc),
  C-21 sky spec (`app.atmosphere.setSky`), sun colour and intensity, fog colour (C-21 `color: "sky"`), exposure (C-13 preset
  override), practical/emissive
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
  It is used as background (C-21 `model: "cubemap"`) and IBL (C-09 `fromCube`). `material.planet` provides albedo/night/cloud layers
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
(`benchmarks/quality-rebuild/shared/scenes.ts`, e.g. `sun(4, …)` with environment intensity 1). If C-10 real (physical light units, PRD 02) changes the
light-unit convention, this table is re-expressed in the new units through a C-40 fact row (`F-10-02`). The look targets do not change.

| Biome id | Sky (C-21 `AuraSkySpec`) | Environment source (C-09) | Sun / key | Shadows (C-11) | Fog (C-21 `AuraHeightFogSpec`) | Post (C-13 preset + overrides) | Look target |
|---|---|---|---|---|---|---|---|
| `outdoor-day` | Preetham, turbidity 2.5, sun elevation 48°, clouds coverage 0.35 | sky-capture (HDRI `outdoor-day-meadow-2k` optional) intensity 1.0 | directional 3.5, 5800 K | CSM 3 cascades, 120 m, strength 1.0 | density 0.0025, height falloff 0.08, colour from horizon | ACES (or PRD 03 default), exposure 1.0, bloom threshold 1.2 strength 0.04, grade neutral | saturated sky gradient, blue-tinted shadow fill, readable terminators (fixes 23 §09 diffs 1–4) |
| `golden-hour` | Preetham, turbidity 4, sun elevation 9°, warm Mie g 0.8 | sky-capture; HDRI candidate Poly Haven `venice_sunset` or `industrial_sunset_puresky` (verify at admission) | directional 3.0, 3300 K | CSM 3, 150 m, long shadows | density 0.004, warm horizon inscatter | exposure +0.3 EV, bloom threshold 1.0 strength 0.06, grade warm highlights / cool shadows | long warm shadows, glowing horizon, rim light on vehicles |
| `overcast` | gradient zenith `#9aa6b2` horizon `#c9cfd4` + cloud coverage 0.9 | sky-capture intensity 1.2 | directional 1.0 (diffuse sky dominates), 6500 K | CSM 2, soft (PCSS radius ×2), strength 0.85 | density 0.006 | exposure +0.2 EV, low contrast grade | soft shadows, wet-looking materials (pairs with PRD 07 wetness) |
| `night-city` | gradient zenith `#03050c` horizon `#1a1f3a` + city glow band, stars off | HDRI candidate Poly Haven night street (verify) intensity 0.6; else sky-capture + emissive-card capture | moon directional 0.25, 7500 K; practicals ×1.0 | CSM 2, 60 m; point/spot shadows for ≤ 4 hero lights (PRD 02) | density 0.012, colour `#1a2238` | exposure +0.8 EV, bloom threshold 0.9 strength 0.12, grade teal/orange | reflective wet asphalt (PRD 07 + SSR PRD 03), lit windows, pools of light |
| `polar-night` | gradient + stars + aurora band (C-21 `stars`/`bands`; aurora layer is request Q-07-2) | sky-capture intensity 0.5 | moon 0.35, 8000 K | CSM 2, 80 m | density 0.008, colour `#1b2a44` | exposure +0.6 EV, bloom threshold 0.9 | aurora-lander brief (21: "has no aurora") |
| `alpine-snow` | Preetham turbidity 2, sun elevation 22° | sky-capture intensity 1.1 | directional 3.2, 6000 K | CSM 3, 150 m | density 0.003, falloff 0.05, cool | exposure −0.2 EV (snow albedo), bloom threshold 1.3 | skyline-runner, turbo alpine: bright snow without clipping |
| `interior-warm` | none (enclosed) | room-capture: `RoomEnvironment`-equivalent procedural room (C-09 neutral-room / `RoomEnvironmentScene`) tinted 2900 K, intensity 0.8 | no sun; 1 key spot 2700 K with shadow + practical lamps | spot/point shadows on key lights (C-11) | density 0.01 (haze), height falloff 0.4 | exposure +0.4 EV, bloom threshold 1.0 | bank-shot pool hall: pool of light over table, dark falloff |
| `interior-neutral` | none | room-capture 4500 K intensity 1.0 | ceiling grid area/point lights | spot/point shadows on 2 hero lights | density 0 | exposure 0 EV | gallery, arcade (blockfall, vault) |
| `interior-industrial` | none | room-capture with large window softbox, 5600 K, intensity 1.1 | directional "window" key 2.0 through openings | CSM 1 cascade or spot | density 0.015 (dust), volumetric via C-21 `AuraVolumetricFogSpec` when real | exposure +0.2 EV, cool grade | mech-hangar: shafts of light, metal reflections |
| `space` | none; background = `SpaceSkyBake` cube | same cube, intensity 0.35 (stars contribute little; nebula tints) | star directional 4.0, 5778 K, no fill | CSM 2 on hero bodies only | none | exposure +0.5 EV, bloom threshold 1.0 strength 0.08 | orbital-defense, gravity-post: hard terminator, rim atmosphere |
| `underwater` | none; background = depth-graded gradient (surface `#2a8fb0` → deep `#021018`) | sky-capture of the gradient, intensity 0.6 | directional "surface sun" 1.5 with caustics (§8.7) | CSM 1, 40 m | exponential absorption fog density 0.035, colour by depth | exposure +0.3 EV, bloom threshold 1.1 | deep-recovery: turquoise→navy falloff, god-ray look via PRD 07 volumetric |

Rules every rig enforces:

- `ambientPolicy: "ibl-only"`. A biome never relies on a flat `lights.ambient`, and it suppresses the
  ambient-zeros-IBL branch (L2) for its scene: its C-09 source returns `ambient: null` and IBL intensity > 0. The
  general fix is the C-09 additive-ambient invariant (provider PRD 02).
- Shadow strength is 1.0 (contrast comes from IBL fill, not from a 0.32 multiplier, L7).
- Fog colour is derived from the sky horizon at the view azimuth unless overridden. This avoids the fog/background seam
  of 08 §3.1.
- Every rig has a Low-tier variant (1 cascade fewer, half shadow distance, no volumetric, 128² PMREM).
- C-26 `AuraBiomeRig.post` is a frozen C-13 `AuraPostPresetId`. The EV/bloom/grade values in the table are
  `postOverrides` on top of that preset (`AuraBiomeRigDetail`, §7.1.2). Mapping: `outdoor-day`, `golden-hour`,
  `overcast`, `alpine-snow` → `daylight-outdoor`; `night-city`, `polar-night` → `neon-night`; `interior-neutral` →
  `product-studio`; `interior-warm`, `interior-industrial` → `cinematic-film`; `space` → `space`; `underwater` →
  `underwater`. C-26 `environment` kinds map as: sky-capture → `"sky-capture"`, HDRI → `"hdri"`, room-capture →
  `"room"`, `SpaceSkyBake` → `"space-bake"`.

Default biome when a scene declares none (applied by `BiomeResolver`; overridden by any `environments.*` or `world.biome`):

| Scene signal | Default |
|---|---|
| `world.terrain` or `world.water(kind: "ocean"|"lake")` present | `outdoor-day` |
| `world.room` present | `interior-neutral` |
| scene category `space` (existing `AuraSceneCategory`) | `space` |
| category `city-night` / `neon` | `night-city` |
| category `city-day` | `outdoor-day` |
| category `product` / `material` | no biome (the C-09 resolution of lower-priority sources applies) |
| anything else | `interior-neutral` room capture (never zero IBL, never a void clear colour when a sky can be drawn) |

### 6.4 Terrain design

- Height source: an `AuraHeightSource` is one of: a 16-bit PNG / R32F raw / EXR asset (admitted through C-17), a
  procedural function (`fbm`, `ridged`, `terraced`, plus `flattenAreas` for runways, tracks and pads), or an existing
  `TerrainHeightfieldFixture`. The CPU keeps a `Float32Array`. The GPU gets an R32F texture of the same data.
- Geometry: CDLOD (Strugar 2009). One shared patch mesh of `(N+1)²` vertices (N = 32 Low, 64 High) is drawn instanced,
  one instance per selected quadtree node, with per-instance `{offsetXZ, scale, lod}`. The vertex shader fetches height
  with manual bilinear (4 `texelFetch`, so no float-linear extension is needed) and morphs odd vertices toward the parent
  grid over the morph range. This removes popping and T-junction cracks without skirts.
- Normals: computed in the fragment shader from the height texture (central differences at the texel scale of the
  current LOD) for large-scale shape, plus layer detail normals. No baked normal map is required. An optional baked
  normal map (baked by `tools/world-content-bake`) is used on Ultra for sub-texel detail.
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
  variation (hue ±4%, value ±10%), and alpha-to-coverage when MSAA is on (C-15 `alphaToCoverage`, semantics PRD 04 per R12; C-04 state; ignored by the stub,
  so Path S uses alpha test). Bark and opaque rocks use the standard PBR material with wind weight 0.
- Impostors: octahedral (hemi-octahedral for ground-standing assets) 8×8 views at 256², with albedo+alpha and
  normal+depth atlases, baked offline by `tools/impostor-bake` (§9.6). Runtime blends the 3 nearest views by
  barycentric weights in octahedral space, with depth-based parallax offset. Crossfade between LOD1 and the impostor
  uses screen-door dithering (4×4 Bayer) over a 4 m band. Impostors write depth and cast shadows only in the far cascade
  (High+).
- Wind: `WindField` UBO `{ direction.xz, strength, gustStrength, gustScale, time }` plus a 64×64 RG8 tiling gust noise
  texture shipped as an asset. Vertex weights come from the asset's vertex colour (R: trunk/branch bend weight, G: leaf
  flutter weight, B: phase). If absent, `tools/world-content-bake` derives R from normalized height and G from
  alpha-tested material membership at admission. The same vertex function runs in the depth pass through the C-11 depth feature `prd10.wind` (§12).

### 6.6 Shipped world content (engine assets; CC0 or MIT only, admitted through C-17 with provenance)

| Set | Contents | Candidate sources (verify licence and availability at admission) | GPU memory budget |
|---|---|---|---|
| Terrain layers | grass-meadow, grass-dry, dirt-path, rock-cliff, rock-scree, sand-beach, snow, forest-floor, asphalt, gravel (10 layers; albedo+height, normal, ORM at 1k + 512) | ambientCG / Poly Haven textures (CC0) | ≤ 1.4 MB/map/layer at 1k (KTX2) |
| Foliage | pine (3 variants), broadleaf (3), bush (3), fern, grass-card atlas, flower-card atlas, each with LOD0/LOD1 + impostor atlas | Quaternius nature packs / Kenney Nature Kit (CC0); Poly Haven plants (CC0) | ≤ 8 MB per species incl. impostor |
| Rocks | 6 rocks + 2 cliff chunks with LOD1 | Poly Haven rocks (CC0); existing `propRockA/B` after `assets optimize` (C-17) | ≤ 4 MB total |
| Water | 2 water normal maps 512² (tileable), foam 512², caustics 256² 16-frame atlas | procedurally baked by `tools/world-content-bake` (no third-party art) | 1.5 MB |
| Noise | wind gust 64², macro variation 512², blue noise 64² | baked in-repo | 0.3 MB |
| HDRIs | outdoor-day, golden-hour, overcast, night-city, interior-room (procedural, no file), 2k + 1k each | Poly Haven (CC0); replaces the 3 × 1k fixtures for biome use | 8 MB (2k RGBA16F) each when active; only one active |
| City kit | road straight/curve/intersection/crosswalk, sidewalk, curb, 6 building modules (base/mid/roof × 2 styles), street lamp, bench, bin, sign, traffic light, fence, barrier | Kenney City Kit (CC0), KayKit City Builder Bits (CC0) | ≤ 15 MB |
| Interior kit | wall/door/window panels, floor tiles, ceiling panel + light fixture, pillar, shelf, crate, table, chair, rug, pool table optional | Kenney Furniture Kit / KayKit (CC0) | ≤ 10 MB |
| Trackside kit | tyre wall, barrier, catch fence, grandstand, gantry, marshal post, cones, kerb profile | Kenney Racing Kit (CC0) | ≤ 8 MB |
| Space | default baked cube 512², planet albedo/night/cloud 2k (procedural bake), ring band 1D texture | baked in-repo | ≤ 14 MB |

Content rules: no 4-triangle unlit image cards for world objects (19 C19). Every model must have base colour and
normal maps (or an explicit stylized-material decision recorded in the kit manifest and judged visually), plus LOD1.
Textures must be KTX2 (C-16 target table, C-17 optimize) with PNG fallback. The `suitabilityReason` texture waiver regex
(`aura3d-cli/src/index.ts:3376-3382`, 19 C19) does not apply to `packages/engine/assets/world`.

### 6.7 Time of day

- Sun direction: `solarPosition(hour, latitudeDeg, dayOfYear, northOffsetDeg)` (NOAA simplified algorithm, ±0.5°), or
  `arc` mode (`elevation = sin(π·(hour−6)/12) · maxElevation`, azimuth linear) for stylized games.
- Keyframes: a sorted list `{ hour, biome }`. Between keyframes the rig values are interpolated: colours in linear RGB,
  intensities in log space, fog density linearly, exposure in EV. Sky parameters are C-21 `AuraSkySpec` values.
- IBL: the rig's sky is re-captured into a back-buffer probe. `TimeOfDayRuntime` builds an `EnvironmentCaptureRequest`
  whose `renderFace` calls C-21 `skyBackgroundSlot.get(flags).renderToCubeFace` and hands it to C-09
  `environmentProbeFactorySlot.get(flags).fromScene`. A capture triggers when the sun has moved ≥ 1.5° (or on C-21
  `onSkyChanged`) or the keyframe weight has changed ≥ 0.05. One cube face renders per frame and prefilter mips are spread
  over subsequent frames (≤ 0.2 ms/frame budget). The `prd10.timeOfDay` C-09 source returns the new probe atomically on
  completion. A 0.5 s two-probe crossfade needs a C-09 field that does not exist; it is filed as CCR-10-1
  (`AuraEnvironmentSourceResolution.blendFrom?: { probe, weight }`). Until it lands, the swap is a hard cut and
  diagnostics report `world.biome.iblCrossfade: "pending-CCR-10-1"`. With the stubs (sky clears to the horizon colour,
  legacy PMREM wrapper) the re-captured probe is a horizon-colour cube: it is reported, never claimed as sky IBL.
- Practicals: `practicalScale(hour)` multiplies emissive intensity of materials tagged `practical: true` (windows, lamps,
  signs) and the intensity of lights tagged `practical`, via one uniform. Lights are not rebuilt. Mechanism: C-02
  `ShaderFeature` `prd10.practical` (hook `fragment:emissive`, uniform `u_a3dPrd10PracticalScale`), active only on
  Path G. On Path S it applies to PRD 10 world programs and to the practical lights PRD 10 itself emits (kit, room and
  street lights, re-emitted with scaled intensity by the C-36 handler `update()`); emissive on non-world materials stays
  unscaled and is reported as `practicalScale: "world-only"`.
- Runtime: `app.world.timeOfDay.set(hour)`, `.animate({ hoursPerSecond })`, `.pause()`, `.get()`. These write uniforms
  only and never remount the scene.

---

## 7. APIs to add, change and remove

All new agent-API symbols live in `packages/engine/src/agent-api/world/` (PRD 10) and are exported as `world` from
`@aura3d/engine` through the lane barrel `packages/engine/src/lanes/prd10.ts`. The barrel registers handlers and the
app extension with **lazy factories** (`() => import("../agent-api/world/runtime.js")`), so routes that never create a
world node load no world runtime code (§17.4). Renderer pieces are exported from the reserved subpath
`@aura3d/rendering/world` (entry `packages/rendering/src/world/index.ts`). An `@aura3d/engine/world` subpath is not
reserved in PR 0a; it is request Q-15-3 and nothing depends on it. If PRD 15's consolidation renames a symbol it maps
1:1 (CONTRACTS §6.4 rules); names here are otherwise binding. Types that C-26 freezes (`AuraBiomeId`, `AuraBiomeRig`,
`AuraWindSpec`, `AuraWorldQueries`, `GroundRaycaster`, `AuraHeightQuery`, `WIND_CHUNK`) are imported from
`packages/engine/src/contracts/world.ts` and never redeclared.

### 7.1 `@aura3d/engine` agent API

#### 7.1.1 Shared types

```ts
// packages/engine/src/agent-api/world/types.ts
export type { AuraBiomeId, AuraBiomeRig, AuraWindSpec, AuraWorldQueries, GroundRaycaster, AuraHeightQuery } from "../../contracts/world.js"; // C-26
export type AuraWorldQualityTier = import("../../contracts/world.js").AuraWorldQualityTier; // = C-27 AuraQualityTier

export interface AuraTierValue<T> { readonly low?: T; readonly medium?: T; readonly high?: T; readonly ultra?: T }
export type AuraTiered<T> = T | AuraTierValue<T>; // scalar applies to all tiers; resolved against app.quality.tier (C-27)

export interface AuraWorldNodeBase {
  readonly name?: string;
  /** Diagnostics: counted from submitted draws, never from node metadata. */
  readonly diagnosticsLabel?: string;
}
```

#### 7.1.2 Biomes and environment defaults

```ts
// packages/engine/src/agent-api/world/biomes.ts
import type { AuraSkySpec, AuraHeightFogSpec } from "../../contracts/atmosphere.js";   // C-21
import type { AuraPostPresetId } from "../../contracts/post.js";                         // C-13
export interface AuraBiomeSunSpec {
  readonly elevationDeg: number; readonly azimuthDeg: number;
  readonly intensity: number; readonly colorTemperatureK?: number; readonly color?: AuraColor;
  readonly castShadow?: boolean;
}
export type AuraBiomeEnvironmentSpec =
  | { readonly source: "sky-capture"; readonly intensity: number; readonly faceSize: AuraTiered<64 | 128 | 256> }
  | { readonly source: "hdri"; readonly hdri: AuraAssetRef<"texture">; readonly intensity: number; readonly rotationDeg: number }
  | { readonly source: "room"; readonly colorTemperatureK: number; readonly intensity: number }
  | { readonly source: "space-bake"; readonly intensity: number };
export interface AuraBiomePostOverrides { readonly exposureEv?: number; readonly bloomThreshold?: number; readonly bloomStrength?: number; readonly grade?: "neutral" | "warm" | "cool" | "teal-orange" | "low-contrast" }
/** Superset of the frozen C-26 AuraBiomeRig: every C-26 field keeps its contract type. */
export interface AuraBiomeRigDetail extends AuraBiomeRig {
  readonly sky: AuraSkySpec | null;                 // C-21
  readonly fog: AuraHeightFogSpec | null;           // C-21
  readonly post: AuraPostPresetId;                  // C-13 (frozen id); EV/bloom/grade in postOverrides
  readonly environment: AuraBiomeEnvironmentSpec["source"];
  readonly environmentSpec: AuraBiomeEnvironmentSpec;
  readonly sunDetail: AuraBiomeSunSpec | null;
  readonly shadows: { readonly cascades: AuraTiered<1 | 2 | 3 | 4>; readonly maxDistance: AuraTiered<number>; readonly strength: number; readonly softness: number };
  readonly postOverrides: AuraBiomePostOverrides;
  readonly practicalScale: number;                  // multiplier for emissive/lights tagged practical
  readonly ambientPolicy: "ibl-only";
}
export interface AuraBiomeOverrides {
  readonly sun?: Partial<AuraBiomeSunSpec>;
  readonly environment?: Partial<AuraBiomeEnvironmentSpec>;
  readonly fog?: Partial<AuraHeightFogSpec> | null;
  readonly post?: AuraBiomePostOverrides & { readonly preset?: AuraPostPresetId };
  readonly practicalScale?: number;
}
export interface AuraBiomeNode extends AuraWorldNodeBase { readonly kind: "biome"; readonly biome: AuraBiomeId; readonly scope?: "all" | "environment"; readonly overrides?: AuraBiomeOverrides }

export declare const world: {
  biome(id: AuraBiomeId, overrides?: AuraBiomeOverrides): AuraNodeBuilder<AuraBiomeNode>;
  biomes: {
    list(): readonly AuraBiomeId[];                                            // = C-26 listBiomes()
    describe(id: AuraBiomeId, tier?: AuraWorldQualityTier): AuraBiomeRigDetail; // = C-26 describeBiome (pure, deterministic, frozen)
  };
  // ... continued below
};

// environments.* additions, in PRD 10-owned packages/engine/src/agent-api/nodes/environments.world.ts (spread into
// `environments` by PR 0b-1; `index.ts:4123-4190` itself is not edited). They emit a biome node with scope
// "environment" (sky/sun/fog untouched). Flag off: they emit environments.studio() plus an option-ignored degradation.
environments.outdoor(options?: AuraEnvironmentOptions & { readonly biome?: "outdoor-day" | "golden-hour" | "overcast" | "alpine-snow" }): AuraNodeBuilder<AuraBiomeNode>;
environments.room(options?: AuraEnvironmentOptions & { readonly colorTemperatureK?: number }): AuraNodeBuilder<AuraBiomeNode>;
environments.space(options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraBiomeNode>;
environments.underwater(options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraBiomeNode>;
```

Resolution is C-09's priority order, not an edit to `createProductionRuntimeEnvironment` (`index.ts:12628`, carved to
PRD 02's `compiler/environment.ts`). PRD 10 registers two `AuraEnvironmentSource`s from `production-runtime/world/BiomeResolver.ts`:
`prd10.biome` (priority 300: `world.biome`, `environments.outdoor/room/space/underwater`, or the §6.3 default biome when
the scene has a world signal) and `prd10.timeOfDay` (priority 250: keyframe rig). Explicit PRD 02 environments (400) win.
Every PRD 10 resolution returns `ambient: null` plus IBL intensity > 0, so a biome scene never hits the ambient-zeroes-IBL
branch even while the C-09 stub's legacy path still has it for other scenes. With `A3D_QR_LIGHTING` off the C-09 stub
consults registered sources only when their flag is on, so `A3D_QR_WORLD` alone activates them (CONTRACTS C-09 stub).
Sky and fog are applied through C-21 `app.atmosphere.setSky/setFog` from the `biome` node handler, and the post preset
through the C-13 `AuraPostPresetId` plus overrides contributed as C-36 RenderSource contributions.

#### 7.1.3 Time of day and wind

```ts
export interface AuraTimeOfDayOptions extends AuraWorldNodeBase {
  readonly hour: number;                                         // 0..24
  readonly mode?: "solar" | "arc";                               // default "solar"
  readonly latitudeDeg?: number; readonly dayOfYear?: number; readonly northOffsetDeg?: number;
  readonly maxElevationDeg?: number;                             // arc mode
  readonly keyframes?: readonly { readonly hour: number; readonly biome: AuraBiomeId; readonly overrides?: AuraBiomeOverrides }[];
  readonly ibl?: { readonly recapture?: boolean; readonly thresholdDeg?: number; readonly crossfadeSeconds?: number };
  readonly stars?: boolean;                                      // forwarded to C-21 AuraSkySpec.stars
}
export interface AuraTimeOfDayNode extends AuraWorldNodeBase { readonly kind: "time-of-day"; readonly options: AuraTimeOfDayOptions }

/** Authoring options; normalized to the frozen C-26 AuraWindSpec (direction vec3, strength, gust, gustFrequency, turbulence). */
export interface AuraWindOptions extends AuraWorldNodeBase {
  readonly directionDeg?: number;     // default 35   -> direction = [sin, 0, cos]
  readonly strength?: number;         // 0..2, default 0.5 -> strength
  readonly gustStrength?: number;     // 0..1, default 0.35 -> gust
  readonly gustScale?: number;        // metres per gust cell, default 40 -> gustFrequency = 1 / gustScale
  readonly turbulence?: number;       // 0..1, default 0.2
}
export function normalizeWind(options?: AuraWindOptions): Required<AuraWindSpec>; // pure; used by C-26 wind()
export interface AuraWindNode extends AuraWorldNodeBase { readonly kind: "wind"; readonly wind: Required<AuraWindSpec> }

world.timeOfDay(options: AuraTimeOfDayOptions): AuraNodeBuilder<AuraTimeOfDayNode>;
world.wind(options?: AuraWindOptions): AuraNodeBuilder<AuraWindNode>;
```

`stars` is forwarded as C-21 `AuraSkySpec.stars`. The `A3DWind` UBO and chunk name are frozen by C-26 (`WIND_CHUNK =
"a3d_prd10_wind"`, §8.2).

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
export interface AuraScatterNode extends AuraWorldNodeBase {
  readonly kind: "scatter";
  readonly options?: AuraScatterOptions;          // rule-driven scatter
  /** Explicit placements emitted by kits, place*, room, street and instances.model({ static/chunkSize/wind/impostor }). */
  readonly placements?: { readonly asset: AuraAssetRef<"model">; readonly matrices: Float32Array /* 12 floats (3x4) per instance */; readonly colors?: Float32Array; readonly wind?: boolean; readonly impostor?: AuraAssetRef<"texture"> | "none"; readonly shadowLod?: "none" | "lod1" | "impostor"; readonly chunkSize?: number; readonly tags?: readonly string[] };
}
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
  readonly material: AuraMaterialSpec;            // repeat UVs via C-12 AuraTextureSampling (`sampling.wrap: "repeat"`); stub path keeps today's sampler
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
and rotation applied as a matrix). They emit one `scatter` node with explicit `placements` per unique asset (§7.1.5),
drawn by PRD 10's `ScatterRuntime` from static buffers. They never emit `group()` hierarchies (K4) and never pass through
`createProductionInstanceTransforms`, so the V4 size bug and its R18 fix do not affect them.

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
  readonly markings?: boolean;                                  // decals via the public `decals` API (PRD 07-owned `agent-api/Decals.ts`); no contract needed
  readonly wet?: number;                                        // 0..1 wetness: C-21 WETNESS_CHUNK on Path G; Path S ignores it with an option-ignored degradation
  readonly name?: string;
}): readonly AuraSceneNode[];
```

#### 7.1.9 Materials

```ts
// AuraMaterialSpec fields pre-declared in PR 0a (C-15; `index.ts:1027`, today 0 occurrences of alphaCutoff/alphaMode):
//   alphaMode?, alphaCutoff?, alphaToCoverage?, doubleSided?  -> semantics owned by PRD 04 (CONTRACTS R12); PRD 10 consumes
//   practical?: boolean                                        -> semantics owned by PRD 10 (§6.7)

// packages/engine/src/agent-api/world/materials.ts (PRD 10). Exposed as world.materials.*; `material.foliage/terrainLayer/planet`
// aliases in PRD 04's nodes/material.ts are request Q-04-1 and nothing depends on them.
world.materials.foliage(options: {
  readonly map: AuraAssetRef<"texture">; readonly normalMap?: AuraAssetRef<"texture">;
  readonly alphaCutoff?: number; readonly translucency?: number; readonly translucencyColor?: AuraColor;
  readonly roughness?: number; readonly wind?: boolean;
}): AuraMaterialSpec;   // sets alphaMode "mask", doubleSided true, and the C-03 lobe prd10.foliageTranslucency
world.materials.terrainLayer(preset: AuraTerrainLayerSpec["preset"]): AuraTerrainLayerSpec;
world.materials.planet(options: {
  readonly albedo?: AuraAssetRef<"texture"> | "procedural-earthlike" | "procedural-rocky" | "procedural-gas";
  readonly night?: AuraAssetRef<"texture">; readonly clouds?: AuraAssetRef<"texture"> | number;
  readonly atmosphereColor?: AuraColor; readonly atmosphereThickness?: number; readonly seed?: number;
}): AuraMaterialSpec;   // C-03 lobe prd10.planet (terminator wrap, night map, atmosphere rim)
```

#### 7.1.10 Runtime handle (provides C-26)

```ts
// packages/engine/src/agent-api/world/runtime.ts. Registered with C-38 registerAppExtension({ member: "world",
// owner: "prd10", flag: "A3D_QR_WORLD" }); C-26 worldQueriesSlot.provide(createWorldQueries) in lanes/prd10.ts.
export interface AuraWorldRuntime extends AuraWorldQueries {   // C-26: ground(), height(), wind(), biome(), describeBiome(), listBiomes()
  readonly timeOfDay: { set(hour: number): void; get(): number; animate(options: { readonly hoursPerSecond: number }): void; pause(): void };
  setWind(options: AuraWindOptions): void;                   // `wind()` is the C-26 getter, so the setter is a method
  terrain(nameOrId: string): AuraTerrainHandle;
  water(nameOrId: string): AuraWaterHandle;
  diagnostics(): AuraWorldDiagnostics;                       // same object as diagnostics().world (C-31 section "world")
}
export interface AuraWorldDiagnostics {             // every number is measured from submitted draws in the last frame; unmeasurable = null
  readonly drawPath: "S" | "G" | "safe-basic";
  readonly terrain: readonly { readonly id: string; readonly nodesDrawn: number; readonly trianglesDrawn: number; readonly layers: number; readonly degraded: boolean }[];
  readonly scatter: readonly { readonly name: string; readonly lod0: number; readonly lod1: number; readonly impostor: number; readonly culled: number; readonly shadowCasters: number | null; readonly draws: number; readonly checksum: string }[];
  readonly grass: readonly { readonly bladesDrawn: number; readonly chunks: number; readonly mode: "blades" | "cards" | "off" }[];
  readonly water: readonly { readonly id: string; readonly reflection: "ibl" | "ssr" | "planar"; readonly planarDraws: number; readonly refraction: boolean; readonly sceneCopy: "shared" | "prd10-fallback" | "none"; readonly underwater: boolean }[];
  readonly biome: { readonly id: AuraBiomeId | null; readonly environmentSource: string; readonly iblPixelBacked: boolean | null; readonly backgroundDrawn: boolean | null; readonly iblCrossfade: "on" | "pending-CCR-10-1" };
  readonly pending: readonly string[];              // e.g. "C-11:shadows", "C-02:generator", "C-21:sky-real" while stubs are active
  readonly memoryMB: number;
  readonly gpuMs: Readonly<Record<string, number>> | null; // only when EXT_disjoint_timer_query_webgl2 is available (C-28)
}
```

C-26 semantics implemented by PRD 10:
- `ground().raycastDown(x, z, fromY = 1e4, maxDistance = 2e4)` tests terrain heightfields first (ray-march on the CPU
  Float32Array with bilinear refinement), then physics colliders through the existing `packages/physics/src/Raycast.ts`
  API (owner PRD 08, unchanged), then static kit instance AABBs. It returns the nearest hit with `nodeId`.
- `height().heightAt/normalAt` return the bilinear terrain value under (x, z), or the highest water rest height when
  only water covers the point, else 0 and up. `occluderHeightAt` reads a 1 m occluder grid baked at build from kit and
  room roofs (for C-20/C-21 rain occlusion).
- `wind()` returns the normalized current `Required<AuraWindSpec>`; `biome()` the active rig or null; `describeBiome`
  and `listBiomes` are pure (§6.3 table).

### 7.2 Changed

| Symbol | Change | Owner of the edit |
|---|---|---|
| `instances.box/sphere/plane/cylinder/capsule/torus/custom` | Honour `size` (V4). Correctness fix, no flag. | PRD 15 (`compiler/primitives.ts`, CONTRACTS R18); request Q-15-1 |
| `AuraPrimitiveNode.static` | Upload once and skip per-frame `createProductionInstanceTransforms` | semantics PRD 11 (C-07); PRD 10 does not depend on it |
| `instances.model` (`nodes/instances.ts`) | Accept `static`, `chunkSize` (metres, default 32 when > 256 instances), `shadowLod: "none" \| "lod1" \| "impostor"`, `wind?: boolean`, `impostor?: AuraAssetRef<"texture">`. With `A3D_QR_WORLD` on and any of these set, the builder emits a `scatter` node with explicit placements. Flag off: they are listed in `DIAGNOSTIC_ONLY_FIELDS` (`compiler/diagnosticOnly.prd10.ts`) and the node is unchanged. | PRD 10 |
| environment selection | `prd10.biome` / `prd10.timeOfDay` C-09 sources; biome scenes never zero IBL | PRD 10 (own sources) |
| `prefabs.cityBlock` / `city.block` (`nodes/prefabs/cityBlock.ts`) | Re-implemented on `world.kits.city` + `world.street` behind the flag once the city kit is admitted (Phase 5). Until then: unchanged output plus a build warning "primitive placeholder city; use world.street". | PRD 10 |
| `sceneKitPerformanceBudgets.cityBlock.evidence` (`index.ts:9689`, carved to `devtools/sceneKitBudgets.ts`) | Replace "instanced or impostored by family" with values read from `diagnostics().world` | PRD 11; request Q-11-3 |
| `sampleTerrainHeightfield` (`TerrainHeightfield.ts:133`) | Bilinear interpolation. `queryTerrainHeight` doc unchanged (now true). Changes physics heights for existing fixtures; declared correctness fix (CONTRACTS §6.1) behind no flag, PRD 12 re-baselines affected scenes. | PRD 10 |
| `planScatterInstances` / `enforceFrameBudget` | Kept as the budget enforcer called by `world.scatter`. The return type gains `perCell` counts. | PRD 10 |
| `EnvironmentPresetPack` | Night `exposureFactor` removed behind `A3D_QR_WORLD_BIOME`. The SSIM gate compares per-preset references instead of normalized luma. | PRD 10 |

### 7.3 Deprecated, then removed

Removal condition for every row: 0 call sites in `apps/`, `examples/` and templates, measured with `rg`. Migration
is done by the route and template owners (PRD 14, PRD 13) with the `prd10-world-migrate` codemod/report that PRD 10
ships through C-39. Removal is a PRD 10 PR at or after Phase 7 and never blocks any PRD 10 acceptance.

| Symbol | Replacement | Removal |
|---|---|---|
| `water.surface` (`index.ts:3870-3909`, carved to `nodes/water.ts`) | `world.water({ kind: "lake" \| "ocean" })` | PRD 10 |
| `water.buoyancy` (`index.ts:3905-3908`) | `app.world.water(id).heightAt/normalAt` | PRD 10 |
| `weather.wetGround` (`index.ts:3807-3843`, carved to PRD 07's `nodes/weather.ts`) | C-21 wetness on any material + `world.street({ wet })` | PRD 07, request Q-07-1 |
| `prefabs.cityBlock`, `city.block`, `city.cityBlock` (`index.ts:9241-9245` aliases) | `world.street` / `world.kits.city.place` | PRD 10 (`cityBlock.ts`); alias lines PRD 15, request Q-15-2 |
| `planSkyBackdrop` (`LayeredSceneComposition.ts:503-543`, PRD 10-owned) | C-21 gradient sky; distant layers via `world.scatter` of impostor buildings or ridge meshes | PRD 10 |
| `createTerrainTileGrid`, `TerrainTilePlan` (`TerrainTiles.ts:15-96`) | `TerrainCdlod` | PRD 10, Phase 1 (`rg` shows no external callers) |
| `resolveTerrainSlopeBlend` (`TerrainTiles.ts:98-114`) | GPU auto-splat rules (default rule set encodes the same formula) | PRD 10, after Phase 2 |
| `createNamedEnvironmentPreset` (`EnvironmentPreset.ts:47-128`) | biomes | PRD 10, Phase 1 (no callers, 08 §8.5) |
| `createProceduralSkyDome`, `createEnvironmentStage` (`EnvironmentPlatform.ts:395-415`) | biomes | PRD 02 (file owner), request Q-02-3 |
| `WaterSurface.ts`, `WaterReflectionRefractionCapture` (`OceanSurface.ts:389-455`) | `WaterMaterial`, `ReflectionViewPass` | PRD 10, after Phase 4 |
| `THREE_COMPAT_TEXTURE_SETS` (`packages/materials/src/TextureSet.ts:40-59`) as terrain/foliage source | `packages/engine/assets/world/terrain` layer presets | PRD 15 (package owner), request Q-15-4 |

---

## 8. Shader changes

### 8.0 Program sources and draw paths

- Every PRD 10 chunk is a C-02 `ShaderChunk` named `a3d_prd10_<name>` with `owner: "prd10"`, a GLSL ES 3.00 body and
  a hand-written `wgsl` twin: `a3d_prd10_wind` (frozen name, C-26), `a3d_prd10_terrain_splat`, `a3d_prd10_terrain_cdlod`,
  `a3d_prd10_foliage`, `a3d_prd10_impostor`, `a3d_prd10_grass`, `a3d_prd10_gerstner`, `a3d_prd10_water`,
  `a3d_prd10_caustics`, `a3d_prd10_space_bake`, `a3d_prd10_planet`, `a3d_prd10_world_light_fallback`. All are registered
  from `packages/rendering/src/lanes/prd10.ts` and compile in `ChunkHarness` (C-02) on day 0.
- Path G (C-02 real and `A3D_QR_CORE=v2`): world RenderItems use generated programs. PRD 10 contributes
  `ShaderFeature`s (`prd10.terrain`, `prd10.wind`, `prd10.foliage`, `prd10.impostor`, `prd10.grass`, `prd10.water`,
  `prd10.caustics`, `prd10.practical`) at the hook points in §8.1-8.8. Lighting, shadows (C-11), IBL (C-09), fog
  (C-21 `a3d_prd07_fog`) and tone mapping (C-05) come from the shared chunks. World shaders provide only surface inputs and
  vertex deformation.
- Path S (stubs): `generateProgram` throws `PROGRAM_GENERATOR_PENDING`, so `WorldFramePasses` links complete PRD 10
  programs itself (`device.createShader` with PRD 10 chunks + `a3d_prd10_world_light_fallback`: Lambert + GGX sun from
  the first directional light in `ctx.source`, `a3dSampleIrradianceSH` from the C-09 stub chunk, specular from the C-21
  sky horizon colour, linear fog from the C-21 stub chunk, shadow factor `a3dSunShadowAt` = 1.0 from the C-11 stub).
  `diagnostics().world.pending` lists every stubbed input. Path S output is evidence of geometry and textures only.
- WebGPU: the C-02 `wgsl` twins are consumed by PRD 11's backend (C-29). Wiring them into
  `createNativeShaderSources` (`WebGPUDevice.ts:3179`) is request Q-11-1. A world node on WebGPU without a usable program
  records `WGSL_PROGRAM_MISSING` as a `capability-degraded` degradation and is skipped; it never renders as flat
  `u_draw.color` (07 §2).

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

### 8.2 Wind (`a3d_prd10_wind` chunk, C-26 `WIND_CHUNK`; shared by foliage, grass and the depth pass)

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

Wind applies in object space before the instance matrix (hook `vertex:deform`). The same function reaches the depth
pass through the C-11 depth feature `prd10.wind` (`passes: ["depth"]`), so shadows move with the foliage when C-11 is real (PRD 02's
`DepthPass` applying registered features); with the C-11 stub the feature is stored, not applied, and
`diagnostics().world.pending` lists `C-11:wind-casters`. Normal for lighting: bend the vertex normal by the same rotation approximation
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
                                       : a3dWorldEnvSpecular(R, 0.03);   // Path G: shared C-09 IBL; Path S: sky horizon; mode 1: C-13 SSR
vec3 sunSpec = a3dDirectSpecularGGX(n, V, u_sunDirection, 0.06) * u_sunColor * a3dSunShadowAt(v_worldPosition)   /* C-11 chunk; stub 1.0 */;
float shoreFoam = (1.0 - smoothstep(0.0, u_foamShoreDepth, thickness)) * texture(u_foam, v_xz / 3.0 + u_time * 0.02).r;
float crestFoam = smoothstep(u_foamCrest, u_foamCrest - 0.15, v_crest) * texture(u_foam, v_xz / 5.0).g;
vec3 color = mix(transmitted, reflected, F) + sunSpec;
color = mix(color, vec3(0.9) * a3dSunIrradiance() + a3dSkyIrradiance(), clamp(shoreFoam + crestFoam, 0.0, 1.0));
color = a3dApplyFog(color, v_worldPosition);                                 // C-21 chunk a3d_prd07_fog (stub: linear)
```

On Low (no SceneColorCopy), `transmitted = u_deepColor * a3dSkyIrradiance()`, mixed toward `u_shallowColor` by
`exp(-thickness)` when a depth texture exists, else by a per-vertex shore distance attribute baked at build from the
terrain.

### 8.7 Underwater and caustics

- `a3d_prd10_caustics` chunk, contributed to shared lighting as the C-02 `ShaderFeature` `prd10.caustics` (hook
  `fragment:lights`, define `A3D_PRD10_CAUSTICS`) on Path G, and linked into PRD 10's own terrain/kit programs on Path S.
  For fragments with `worldPos.y < waterHeightAt(worldPos.xz)`:
  - Project along the sun direction to the water plane: `cuv = (worldPos.xz - L.xz * (h - worldPos.y) / L.y) / u_causticScale`.
  - Sample the 16-frame caustic atlas at `cuv` with frame `floor(t * 12) mod 16` (crossfaded between frames).
  - Multiply the direct sun term by `1.0 + u_causticStrength * c * exp(-depth * 0.15)`.
- Underwater mode (camera below the surface):
  - Fog switches to an absorption fog: C-21 `setFog({ mode: "absorption", absorption })` (the stub maps it to linear fog
    and records a degradation).
  - The water surface is drawn back-face with a Snell's window: total internal reflection outside the 48.6° cone,
    `refractAngle = asin(sin(θ) * 1.33)`.
  - Background uses the underwater gradient.
  - Post adds a slight wavy distortion via a 2-tap UV offset from the normal texture: C-13 `registerPostPass`
    `prd10.underwaterDistortion` in phase `post-hdr` (C-01 stub skips it with `FRAME_PHASE_SKIPPED` when no post target
    exists).

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

The draw path is chosen once per app at mount by `WorldFramePasses`: Path G when `programCacheSlot.provided` and
`A3D_QR_CORE=v2`, else Path S. Both are registered as one C-01 contributor `prd10.world` (owner `prd10`, flag
`A3D_QR_WORLD`). Nothing in `Renderer.ts` or `ForwardPass.ts` is edited.

| Step | Path G (contracts real) | Path S (PR 0 stubs) |
|---|---|---|
| 1 Shadows | C-11 ShadowSystem draws terrain (far cascades on Low), kit instances, scatter LOD0/LOD1 near cascade (wind-deformed, alpha-tested via `prd10.wind` + C-11 `alphaTest` variant), impostors far cascade (High+) | none; reported `pending: ["C-11:shadows"]` |
| 2 Planar reflection | `ReflectionViewPass` (High+, visible water requesting it) in phase `background`, order −10: reflected `CameraLike` (C-08) about the water plane, oblique near clip (Lengyel), half-res RGBA16F + depth24; draws C-21 sky, terrain at LOD bias +2 and items tagged with `reflectionLayers`; no grass, particles or water. Skipped when the plane is off-screen or covers < 2% | same pass, world items only (forward items are not re-drawable from a contributor); reported as `reflection: "planar-world-only"` |
| 3 World opaque | RenderItems added in phase `collect`; drawn by PRD 01's opaque forward pass (terrain → kits/scatter front-to-back by cell → grass) | phase `background`, order +10, after `EnvironmentBackgroundPass`, before the single `ForwardPass` (C-01 stub, `Renderer.ts:650/664`); writes colour and depth so forward opaque depth-tests against it |
| 4 Sky | C-21 sky after opaque, LEQUAL at far plane (C-01 `background` when real) | legacy background / C-21 stub clear |
| 5 Scene copy | `FRAME_RESOURCES.sceneColorCopy` + `sceneDepthCopy` when another contributor publishes them (shared with transmission), else PRD 10's `SceneCopyFallback` writes `prd10.scene.color.copy` / `prd10.scene.depth.copy` in `after-opaque`. Skipped on Low and when no water is visible | `SceneCopyFallback` only (C-01 stub `sceneDepth.available = false`); if the blit is unsupported, water uses the Low path (§8.6) |
| 6 Water | `transparent` phase `TransparentQueueItem`s sorted with forward transparents by `sortDepth`; depth write on for the surface | `transparent` phase; drawn after every forward transparent (documented C-01 stub deviation: particles behind water draw first) |
| 7 Transparents/particles | C-20 | legacy |
| 8 Post | C-13 graph; `prd10.underwaterDistortion` in `post-hdr` | skipped with `FRAME_PHASE_SKIPPED` if no post target |

Phase 1 verifies the Path S step-3 assumption (the `background` phase pass shares the forward depth attachment and is
not cleared) in `tests/qr/prd10/browser/world-pass-depth.spec.ts`. If it fails, world opaque moves to `after-opaque`
and the transparent-order deviation is recorded; nothing outside PRD 10 changes.

### 9.2 Compiler integration (C-36, C-37, C-38)

- PRD 10 registers `NodeHandler`s from `agent-api/compiler/world.ts` for the 7 pre-declared kinds `biome`,
  `time-of-day`, `wind`, `terrain`, `scatter`, `grass`, `water`. `compile()` builds GPU resources once (height texture,
  splat, instance chunk buffers, extruded geometry) and calls `out.set("worldUniforms", { wind, time, practicalScale })`,
  `out.set("reflectionViews", requests)` and `out.set("sceneColorCopy", boolean)` on the RenderSource fields pre-declared
  in PR 0a (CONTRACTS §3.5). `update()` runs per frame: CDLOD selection, cell culling, grass ring, time-of-day uniforms,
  water time.
- World items never pass through `createProductionInstanceTransforms` (`index.ts:14747`).
- Runtime add/remove of world nodes (streamed grass rings, time-of-day keyframe swaps) uses C-37
  `AuraRuntimeNodeRegistry.add/remove`; with the stub (no add/remove) PRD 10 keeps its rings inside one `grass` node and
  updates buffers in `update()`, so it does not need C-37 real.
- `app.world` is created by the C-38 extension factory. Handles resolve by node `name` or generated `id`.
- Safe-basic fallback (no production renderer): terrain = `createTerrainHeightfieldGeometry` mesh with vertex-colour
  splat; scatter = `instances.model` without wind/impostors; water = single plane with Fresnel tint; biome = sky gradient
  clear + whatever IBL the legacy path provides. Each records a `capability-degraded` degradation and
  `diagnostics().world.drawPath = "safe-basic"`.

### 9.3 Instancing used by world content

- World instances are owned by PRD 10: `InstanceChunkGrid` allocates its static vertex buffers once per world item with
  `device.createBuffer("vertex", …)`, keeps them across frames and disposes them on scene teardown. This bypasses the
  per-frame allocation and VAO leak of the generic path (V5) and the WebGPU 4-instance uniform cap (V6) for world items
  without editing `ForwardPass.ts` or `WebGL2Device.ts`. When C-07 `instanceBufferSlot` is provided for real (PRD 01),
  `InstanceChunkGrid` uses it instead; the stub wraps today's per-frame upload and is not used for static world data.
- The generic fixes (dynamic instance buffers, VAO cache key at `WebGL2Device.ts:4225`, WebGPU `instance0..3` struct at
  `WebGPUDevice.ts:3420-3466`) belong to PRD 01 / PRD 11 (C-07, C-29). PRD 10 does not wait for them.
- The instance `size` bug (`index.ts:14750` builds `localNode` without `size`) is fixed by PRD 15 (R18). Benchmark 16
  recovering is an integrated observation, not a PRD 10 gate.
- Instance attribute layout (32 B): `vec3 position`; `float yawScalePacked` (yaw 16-bit, scale as half);
  `vec4 variation` (colour variation, LOD fade, wind phase, reserved) as `unorm8x4`; `vec4 extra` reserved as `unorm8x4`.
  Matrices are reconstructed in the vertex shader (yaw + uniform scale). Kits and explicit placements use a 48 B
  `mat3x4` layout.
- WebGPU: world programs use a storage-buffer instance array through their WGSL twins (§8.0). Until Q-11-1 lands,
  WebGPU is excluded from PRD 10 standalone acceptance (§18).

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
  (C-17 `assets optimize`), never at runtime.
- Total world GPU memory is tracked per tier (§17) and reported in `app.diagnostics().world.memoryMB` (C-31 section `world`). Exceeding the
  tier budget at load drops layer resolution one step and warns.
- KTX2 transcoding goes through the C-16 decoder registry (stub wraps today's `GLTFCompressionDecoders.ts`; the local
  bundled transcoder is PRD 05's real implementation, 11 §3). World textures fall back to their PNG twins when the
  registry reports no transcoder, and `diagnostics().world.pending` lists `C-16:ktx2`. Texture-array upload of compressed
  layers needs the C-16 compressed-format mapping; until it is real, arrays are uploaded from PNG (RGBA8) and the memory
  report says so.

### 9.6 Impostor baking (offline)

`tools/impostor-bake/index.ts --asset <id> --views 8 --size 256` loads the GLB in a bake page (WebGL2) on the remote
macos-14 runner. For each hemi-octahedral view direction it renders the asset orthographically into a 256² tile:
albedo+alpha, normal (object space) + linear depth. It writes `<id>.impostor.albedo.ktx2` and
`<id>.impostor.normaldepth.ktx2` plus a JSON with bounding sphere and view count. It records them in the PRD 10-owned
`packages/engine/assets/world/manifest.json` (manifest 1.1 field shape, C-17) after running the C-17 admission gates,
which are pure functions and therefore usable on day 0; root `aura.assets.json` is not written (generated file, owner
PRD 05, CONTRACTS §4.3). The command is registered as `aura3d assets bake-impostor` through C-39 from
`packages/aura3d-cli/src/commands/prd10/`. The output is deterministic: the same GLB hash gives the same atlas hash.

---

## 10. Migration plan

PRD 10 never edits routes or templates. Migration is delivered as tools and facts, applied by their owners whenever
they choose (CONTRACTS R20, R21). Nothing in PRD 10's standalone acceptance depends on any migration landing.

1. **Codemod/report `prd10-world-migrate`** (C-39 `registerCodemod`, `packages/aura3d-cli/src/commands/prd10/`). It
   reports, and with `--write` rewrites:
   - `water.surface(...)` → `world.water({ kind: "lake" | "ocean", shape, height })` (preset → waves preset mapping).
   - `water.buoyancy(...)` → `app.world.water(id).heightAt(x, z, t)`.
   - `prefabs.cityBlock` / `city.block` → `world.street` + `world.kits.city` (report-only: layout differs).
   - `environments.studio` used in outdoor categories (`city-day`, racing/golf routes) → `world.biome("outdoor-day")`.
   - `lights.ambient` with no environment node → report row "biome recommended" (the C-09 fix is PRD 02's).
   - `material.pbr({ metallic > 0 })` on nodes named `*water*`/`*ocean*` → report row (water is a dielectric).
   - route-local terrain builders (patrol-wing `sky.ts:32-230`, aurora-lander `terrain.ts`) → report rows with a
     suggested `world.terrain` call.
2. **Per-game target table** (§1 table, last column) is published as C-40 fact rows `F-10-*` (biome per game, content
   sets per game) for PRD 14 and PRD 13. PRD 14 decides adoption per route behind `A3D_QR_ROUTE_<ID>` + `A3D_QR_WORLD`.
3. **Templates and skills.** PRD 13 writes skill text for `aura3d-materials-environments`, `aura3d-scene-authoring`
   and `aura3d-performance` from facts `F-10-01..F-10-08` (§12.1), including the "do not use" list (`water.surface`,
   `sky.dayNight` for outdoor sky, `environments.hdri` "for the sky", `city.block`, cylinder+sphere trees).
4. **Deprecations** (§7.3) emit a one-time build warning naming the replacement when `A3D_QR_WORLD` is on. Removal follows
   §7.3 and CONTRACTS §5.4.
5. **Data.** `fixtures/three-compat/environments/manifest.json` aliased entries are deleted in Phase 1. Benchmarks that
   referenced them (if any, checked with `rg`) are listed in a request to PRD 12 (Q-12-1).

## 11. Backward compatibility

- Flag off (`A3D_QR_WORLD` unset, the default until `integrated-accepted`): every existing builder emits the same nodes
  as at `85aafcd0`, no PRD 10 handler, environment source, contributor, chunk feature or app factory is active, and the
  flag-off sentinel identity check (CONTRACTS §6.1) stays within IC-0 tolerance.
- Declared correctness fixes that ship with no flag (CONTRACTS §6.1): bilinear `sampleTerrainHeightfield` (T2). It
  changes physics heights for fixtures that sample between texels; PRD 12 re-baselines affected scenes. The instance
  `size` fix (V4) is PRD 15's declared fix (R18).
- New public symbols are additive: the `world` namespace, `environments.outdoor/room/space/underwater`,
  `instances.model` options, `app.world` (present in flag-off apps as the C-26 stub: plane-y=0 ground, zero wind, null
  biome). `tests/unit/public-api-contracts.test.ts` exports remain a superset.
- Deleted with no callers (verified with `rg` in the deleting PR): `createTerrainTileGrid`/`TerrainTilePlan`,
  `createNamedEnvironmentPreset`. Their names are kept as `@deprecated` re-exports that throw
  `AuraRuntimeError("removed-world-planner")` for one minor version.
- `EnvironmentPresetPack` night normalization removal is behind `A3D_QR_WORLD_BIOME` until `default-on`.
- Deprecated builders keep working until their §7.3 removal condition holds.

---

## 12. Contracts consumed / provided

The earlier "depends on PRD NN" edges (conflict map rows PRD-10 → 01/02/03/04/05/07/09/11/12/13/14/15) are replaced by
the contracts below. PRD 10 builds against each consumed contract's PR 0 stub and never waits for its real
implementation. Whether a criterion is standalone (§16.1) or integrated (§16.2) follows from what the stub can show.

### 12.1 Contracts provided

| ID | Surface PRD 10 provides | Stub that must keep working (PR 0a, CONTRACTS C-26) | Real (PRD 10) | Consumers |
|---|---|---|---|---|
| C-26 | `GroundRaycaster`, `AuraHeightQuery`, `AuraWindSpec`, `WIND_CHUNK = "a3d_prd10_wind"` + `A3DWind` UBO, `AuraBiomeId` (11 ids), `AuraBiomeRig`, `AuraWorldQueries`, `worldQueriesSlot`, `AuraApp.world` (C-38 member) | `ground()` raycasts physics if a world exists else plane y = 0; `height()` 0 + up; `wind()` zero strength; `biome()` null; `describeBiome` from today's `environments.*` with `post: "daylight-outdoor"` for outdoor ids | `agent-api/world/{queries,runtime,biomes,wind}.ts`, `production-runtime/world/BiomeResolver.ts`, terrain, scatter, water; `worldQueriesSlot.provide()` and `registerAppExtension({ member: "world" })` in `packages/engine/src/lanes/prd10.ts` | 06 (foot IK ground), 07 (splash/rain height, occluder height), 13 (looks → biomes), 14 (worlds) |

Invariants PRD 10 keeps for consumers: the stub stays the flag-off path until CONTRACTS §5.4 removal; the real
implementation passes `tests/unit/contracts/C-26-world.test.ts` (custodian PRD 15) for `real`, plus PRD 10's own
`tests/unit/contracts/impl/prd10-world.test.ts` (heightAt vs shader bilinear ≤ 1e-4 m, raycast order terrain → physics →
static, `describeBiome` deterministic and frozen, `listBiomes()` length 11, wind normalization). The wind chunk keeps the
frozen signature `vec3 a3dWindOffset(vec3 localPos, vec3 instanceOrigin, vec4 weights, float assetHeight)` so PRD 07
(foliage-like cards) and PRD 11 (batching) can include it.

Registry entries PRD 10 provides into other contracts (all from PRD 10 files):

| Contract | Entry |
|---|---|
| C-01 | contributor `prd10.world` (phases `collect` (Path G), `background`, `after-opaque`, `transparent`) |
| C-02 | chunks `a3d_prd10_*` (§8.0); features `prd10.terrain`, `prd10.wind`, `prd10.foliage`, `prd10.impostor`, `prd10.grass`, `prd10.water`, `prd10.caustics`, `prd10.practical` |
| C-03 | lobes `prd10.foliageTranslucency`, `prd10.planet` |
| C-09 | environment sources `prd10.biome` (300), `prd10.timeOfDay` (250) |
| C-11 | depth feature `prd10.wind` (passes `depth`) |
| C-13 | post pass `prd10.underwaterDistortion` (`post-hdr`) |
| C-15 | semantics of `AuraMaterialSpec.practical` |
| C-30 | lane scenes `prd10-*` (§16.1) in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd10/` |
| C-31 | diagnostics section `world` |
| C-34 | lint rules `look/world-void` (outdoor category, no sky/biome), `look/primitive-trees` (≥ 8 cylinder+sphere pairs) |
| C-36 | node handlers for `biome`, `time-of-day`, `wind`, `terrain`, `scatter`, `grass`, `water`; option-coverage rows; `compiler/diagnosticOnly.prd10.ts` |
| C-38 | app member `world` |
| C-39 | CLI `assets bake-impostor`, `world bake-content`; codemod `prd10-world-migrate` |
| C-40 | facts `F-10-01` world API surface, `F-10-02` biome table and units, `F-10-03` default-biome rules, `F-10-04` content sets and licences, `F-10-05` tier budgets, `F-10-06` do-not-use list, `F-10-07` per-game biome targets, `F-10-08` placement determinism (seed rules) |

### 12.2 Contracts consumed

| ID | Name | Provider | What PRD 10 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 01 | `registerFrameContributor`, `background`/`after-opaque`/`transparent`/`collect`, `FRAME_RESOURCES.sceneColorCopy/sceneDepthCopy`, blackboard | `background` passes between `EnvironmentBackgroundPass` and `ForwardPass`; other phases after the single ForwardPass; `sceneDepth.available = false` | Path S draws standalone; water/particle interleave integrated |
| C-02 | ShaderChunk/Feature registry, ProgramCache | 01 | `registerShaderChunk`, `registerShaderFeature`, `ChunkHarness`, `programCacheSlot.provided` | registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` | chunk compile standalone; shared lighting on world surfaces integrated |
| C-03 | MaterialFeature lobe registry | 04 | `registerMaterialLobe("prd10.*")` | registry real; no render effect until C-02 real | lobe numerics standalone (ChunkHarness); visible lobes integrated |
| C-06 | Scene graph transforms, color parsing | 01 | colour parsing for rig colours | today's parser; `group()` composition still additive (19 C6) | none: placement composes its own matrices |
| C-07 | InstanceBuffer | 01 | `instanceBufferSlot` (optional) | wraps per-frame upload | not used for static world data; standalone |
| C-08 | Frame uniforms, CameraLike | 01 | `CameraLike` for reflection views, `u_cameraPosition`/`u_viewProjection` | `buffer: null`; legacy uniforms | standalone |
| C-09 | EnvironmentSource / EnvironmentProbe | 02 | `registerEnvironmentSource`, `environmentProbeFactorySlot.fromScene/fromEquirect/fromCube/neutral`, `a3dSampleIrradianceSH` | sources consulted when their flag is on; probe factory wraps legacy PMREM; SH stub = hemisphere pair | biome selection standalone; pixel-correct biome IBL integrated |
| C-10 | Lighting API | 02 | sun as `lights.directional` node with `shadow` options; `lights.hemisphere` | hemisphere lowers to two directional fills; physical units inert | standalone (rig values in current units) |
| C-11 | Shadow caster variants, `a3dSunShadowAt` | 02 | `registerDepthVariantFeature("prd10.wind")`, `alphaTest`/`instanced` variant keys, shadow lookup chunk | features stored, not applied; `a3dSunShadowAt` = 1.0 | world shadows integrated only |
| C-12 | Sampler descriptors | 02 | `AuraTextureSampling` repeat + mips for extrusions, layer arrays (`wrap`, `anisotropy` by tier) | device mapping unchanged; anisotropy table real | standalone for PRD 10 programs (own samplers); forward materials integrated |
| C-13 | PostPass registry, post presets | 03 | `AuraPostPresetId`, `postPresets`, `registerPostPass` | presets map to today's post nodes; post-hdr skipped without target | rig post integrated |
| C-15 | Material spec additions | 04 | `alphaMode/alphaCutoff/alphaToCoverage/doubleSided` (pre-declared), `practical` | fields declared, DIAGNOSTIC_ONLY for forward materials | PRD 10 programs honour them standalone; forward materials integrated |
| C-16 | Compressed textures, decoder registry | 05 | `selectKTX2TargetFormat`, `createAssetDecoderRegistry` | pure target table real; registry wraps `GLTFCompressionDecoders.ts` | PNG fallback standalone; KTX2 memory budgets integrated |
| C-17 | Asset manifest 1.1, admission | 05 | 1.1 field shapes, pure admission gates for world content | reader accepts 1.1; gates pure | content admission standalone (own manifest) |
| C-21 | Sky / fog / atmosphere | 07 | `AuraSkySpec`, `AuraHeightFogSpec`, `app.atmosphere.setSky/setFog/setWetness`, `skyBackgroundSlot`, `onSkyChanged`, `a3d_prd07_fog`, `WETNESS_CHUNK` | `sky.preetham/gradient` lower to `sky.dayNight` + degradation; `setFog` writes `environmentFog`; linear fog chunk; capture clears to horizon | rig composition standalone; sky look integrated |
| C-27 | QualityTier settings | 11 | `QUALITY_TIERS` (`lodBias`, `maxTextureSize`, `shadow.*`, `environmentSize`, `msaaSamples`), `app.quality.tier/onChange` | ships real (data); `"auto"` → high desktop / medium coarse pointer | standalone |
| C-30 | Benchmark scene registry | 12 | lane scene indices, `prd10-*` ids, `SceneOwner "prd10"` | registry wraps 18 scenes + lane indices | standalone capture of own scenes |
| C-31 | Diagnostics sections | 12 | `registerDiagnosticsSection({ key: "world" })` | section present, null values | standalone |
| C-33 | Capture harness, `--flags` | 12 | `qr_flags` capture of lane scenes and games | today's scripts + passthrough | standalone screening; acceptance only at checkpoints |
| C-34 | lookLint rule registry | 13 | `registerLookLintRule` | registry real (0b-1) | standalone |
| C-36 | SceneCompiler extension points | 15 | `registerNodeHandler`, `RenderSourceContributions`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage`, `degrade()` | wraps the moved legacy compiler; new kinds run their handlers | standalone |
| C-37 | RuntimeNode add/remove | 15 | `add/remove` for streamed world nodes (optional) | registry without add/remove semantics | not required (§9.2); standalone |
| C-38 | App extension registry | 15 | `registerAppExtension("world")` | real in PR 0 | standalone |
| C-39 | CLI command + codemod registry | 15 | `registerCliCommand`, `registerCodemod` | real in PR 0 | standalone |
| C-40 | Facts handoff | each → 13 | rows `F-10-*` in CONTRACTS Appendix B | table, no code | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R12 (PRD 04 owns `alphaMode/alphaCutoff` semantics; PRD 10
consumes), R18 (instance `size` fix is PRD 15's, unflagged), R1 (`AuraWorldQualityTier` = C-27 `AuraQualityTier`),
R20/R21 (templates, skills and routes are PRD 13's/14's; PRD 10 ships facts and a codemod). Contract shapes adopted from
C-26: `AuraWindSpec` (PRD-local `AuraWindOptions` maps to it), `AuraBiomeRig.post` as a C-13 preset id
(`AuraBiomeRigDetail.postOverrides` carries EV/bloom/grade), chunk name `a3d_prd10_wind`, and `app.world.setWind` (the
earlier `app.world.wind.set` collided with the C-26 `wind()` getter).

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 10 never waits: each row says what PRD 10 does in the
meantime and which criterion moves to the next checkpoint after it lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-15-1 | 15 | `compiler/primitives.ts` (from `index.ts:14747-14754`): `localNode` keeps `size: node.size` (R18 declared fix) | C-36 | world content bypasses this path (§9.3); benchmark 16 recovery is an integrated observation |
| Q-15-2 | 15 | `index.ts:9241-9245` `city.block/cityBlock` aliases: add `@deprecated` JSDoc pointing at `world.street` | — | aliases call PRD 10's `prefabs.cityBlock`, which already warns |
| Q-15-3 | 15 | `packages/engine/package.json#exports`: reserve `@aura3d/engine/world` → `src/agent-api/world/index.ts` | §3.8 | `world` exported from the root through the lazy lane barrel |
| Q-15-4 | 15 | `packages/materials/src/TextureSet.ts:40-59`: mark `THREE_COMPAT_TEXTURE_SETS` "not a terrain/foliage source" | — | PRD 10 ships its own layer presets |
| Q-15-5 | 15 | `.github/QR_OWNERSHIP.json`: confirm `packages/engine/src/agent-api/compiler/world.ts` and `production-runtime/world/` map to prd10 (CONTRACTS §4.1 row 10) | §4 | — |
| Q-02-1 | 02 | `DepthPass.ts`: apply registered C-11 depth features (`prd10.wind`) and the `alphaTest`/`instanced` variant for world casters on PRD 02's real path | C-11 | world draws cast no shadows on Path S; reported `pending: ["C-11:shadows"]` |
| Q-02-2 | 02 | Accept `"sky-capture"` resolutions from `prd10.*` sources whose `probe.capture.include = "sky-only"` (already in the C-09 union) and report `iblPixelBacked` in `lighting.diagnostics().environment` | C-09 | PRD 10 reports `iblPixelBacked: null` |
| Q-02-3 | 02 | `EnvironmentPlatform.ts:395-415`: delete `createProceduralSkyDome`/`createEnvironmentStage` (no callers, 08 §8.5) | — | PRD 10 never calls them |
| CCR-10-1 | 15 + 02 | C-09 additive field `AuraEnvironmentSourceResolution.blendFrom?: { readonly probe: unknown; readonly weight: number }` for time-of-day crossfade | C-09 | hard cut on probe swap (§6.7) |
| Q-07-1 | 07 | `nodes/weather.ts`: `weather.wetGround` `@deprecated` → C-21 wetness + `world.street({ wet })` | C-21 | `world.street({ wet })` is option-ignored on Path S |
| Q-07-2 | 07 | C-21 `AuraSkySpec` gradient `bands` support for an aurora band (`polar-night`) and a city glow band (`night-city`) | C-21 | rigs use plain gradient; aurora is absent and reported |
| Q-07-3 | 07 | C-21 real `setFog({ mode: "absorption", absorption })` for underwater | C-21 | linear fog fallback + degradation |
| Q-04-1 | 04 | `nodes/material.ts`: add `material.foliage/terrainLayer/planet` as aliases of `world.materials.*` | C-15 | agents use `world.materials.*` |
| Q-04-2 | 04 | C-15 real: honour `alphaMode: "mask"`, `alphaCutoff`, `alphaToCoverage`, `doubleSided` on forward materials (kit GLBs with foliage) | C-15 | PRD 10 programs honour them; forward kit materials alpha-blend as today |
| Q-11-1 | 11 | `WebGPUDevice.ts:3179` `createNativeShaderSources`: consume C-02 `ShaderChunk.wgsl` twins of `a3d_prd10_*` and a storage-buffer instance array | C-02, C-29 | WebGPU excluded from PRD 10 standalone acceptance (§18) |
| Q-11-2 | 11 | `QUALITY_TIERS` CCR (additive) only if §17 world budgets need tier fields; none planned | C-27 | PRD 10 tables in §17 read existing fields |
| Q-11-3 | 11 | `devtools/sceneKitBudgets.ts` (from `index.ts:9689`): replace the "instanced or impostored by family" `cityBlock.evidence` string with `diagnostics().world` values | C-31 | PRD 10 diagnostics report the real values |
| Q-12-1 | 12 | Add `packages/engine/assets/world/**` binary paths to LFS in `.gitattributes` and `benchmarks/quality-rebuild/ci.sh`; re-baseline scenes affected by T2 and V4 fixes; rubric lines for §16.2 | C-30, C-32 | lane workflow `qr-prd10-world.yml` pulls LFS itself |
| Q-13-1 | 13 | Skills/templates from facts `F-10-01..08`; no template uses `water.surface`, `city.block` or primitive trees | C-40 | — |
| Q-14-1 | 14 | Per-route adoption of `world.*` per §1 target table, using `prd10-world-migrate`; delete review-capture world forks (K7) | R21 | standalone acceptance uses lane scenes, not routes |
| Q-15-6 | 15 | `contracts/flags.ts` `resolveQrFlags`: fill unset `A3D_QR_WORLD_{TERRAIN,WATER,BIOME}` from an enabled `A3D_QR_WORLD` after all flag sources run, so sub-flags are on-by-default per §13 while `-world.biome`/`A3D_QR_WORLD_BIOME=0` still disable | §13 | lane code reads sub-flags via `worldSubflagOn` (parent-default-on); the C-09 env sources keep the `A3D_QR_WORLD_BIOME` registry gate and activate on explicit `world.biome` until this lands |
| Q-15-7 | 15 | `tests/unit/rendering/environment-preset-pack.test.ts` + `tests/fixtures/b3-preset-pack-rows.json` (both owner 15): adopt `presetPackExposureFactor`/`presetPackSsimReference` and per-preset SSIM references per T6.5 | T6.5 | selectors are exported from `EnvironmentPresetPack.ts` behind `A3D_QR_WORLD_BIOME`; legacy normalized path untouched flag-off |

PRD 06 (C-26 ground for foot IK), PRD 07 (C-26 height for splashes and rain) and PRD 09 (game runtime hosting
`app.world` handles) consume C-26 and need no request from PRD 10.

---

## Parallel execution

### Day-0 start conditions

PRD 10 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`packages/rendering/src/contracts/{core,frameGraph,program,materialLobes,geometry,frameUniforms,environment,shadows,sampling,post,textureFormats,atmosphere,quality,renderSource,renderItem}.ts`
and `testing/ChunkHarness.ts`; `packages/engine/src/contracts/{flags,world,environment,lighting,atmosphere,post,materials,assets,diagnostics,looks,compiler,runtimeNodes,app}.ts`
and the C-26 stub in `stubs/`; the pre-declared optional fields (`AuraMaterialSpec.practical` and alpha fields,
`RenderSource.reflectionViews/sceneColorCopy/worldUniforms`, `AuraNodeKindMap` world kinds, `AuraApp.world`); the lane
barrels `src/lanes/prd10.ts`; `compiler/diagnosticOnly.prd10.ts`; `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd10/index.ts`;
`packages/aura3d-cli/src/commands/prd10/index.ts`; the conformance harness. No other lane's real implementation is needed.

Work in new PRD 10 files starts on day 0. Edits to PRD 10's carved regions start when the PR 0b part containing them
merges (≤ 2026-10-07); until then the replacement is written in the target module and wired after the merge:
- PR 0b-1: `nodes/instances.ts`, `nodes/water.ts`, `nodes/environments.world.ts`, `nodes/prefabs/cityBlock.ts`, and the
  C-31/C-34/C-36/C-37/C-38 seams (`registerNodeHandler` dispatch, app extensions).
- PR 0b-2: C-01 `FrameGraph.ts` dispatcher (contributor phases), C-09 `resolveEnvironment` seam, C-11 depth-feature
  store, C-13 post registry.
- PR 0b-3: C-39 CLI fallthrough and capture `--flags`.
PRD 10 files that need no PR 0b part (start at hour 0): everything in `packages/rendering/src/world/`, `Terrain*.ts`,
`OceanSurface.ts`, `VegetationScatter.ts`, `EnvironmentPreset*.ts`, `SpaceEnvironment.ts`, `agent-api/world/`,
`production-runtime/world/` (logic), `BiomeEnvironmentRegistry.ts`, `HeightfieldLayout.ts`, `engine/assets/world/`,
`tools/{impostor-bake,world-content-bake}/`, lane benchmark scenes, `tests/qr/prd10/`.

### Owned files and directories (must match CONTRACTS §4.1 row 10)

`packages/rendering/src/world/`, `packages/rendering/src/{EnvironmentPreset,EnvironmentPresetPack,OceanSurface,SpaceEnvironment,VegetationScatter,WaterSurface}.ts`,
`packages/rendering/src/Terrain*.ts`; `packages/engine/src/agent-api/world/`, `packages/engine/src/agent-api/{Scatter,LayeredSceneComposition}.ts`,
`packages/engine/src/agent-api/compiler/world.ts`, `packages/engine/src/agent-api/nodes/{instances,water,environments.world}.ts`,
`packages/engine/src/agent-api/nodes/prefabs/cityBlock.ts`, `packages/engine/src/production-runtime/world/`;
`packages/engine/assets/world/`; `packages/environments/src/BiomeEnvironmentRegistry.ts`;
`packages/physics-rapier/src/HeightfieldLayout.ts`; `fixtures/three-compat/environments/`; `tools/{impostor-bake,world-content-bake}/`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd10,prd-10}/`,
`packages/*/src/lanes/prd10.ts`, `agent-api/compiler/diagnosticOnly.prd10.ts`, `packages/aura3d-cli/src/commands/prd10/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd10/`, `.github/workflows/qr-prd10-*.yml`, `tests/qr/prd10/`,
`tests/unit/contracts/impl/prd10-*`.

Tasks of the earlier draft that edited files owned by other lanes were converted to extension points (§5 table) or
moved to §12.3 requests: `agent-api/index.ts` outside PRD 10 carve-outs, `compiler/{renderer,renderInput,primitives}.ts`
and `app/createAuraApp.ts` (15); `compiler/environment.ts`, `DepthPass.ts`, `EnvironmentPlatform.ts`,
`packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts` (02); `ForwardPass.ts` and the
shared PBR chunks (01); `WebGPUDevice.ts`, `devtools/sceneKitBudgets.ts` (11); `nodes/weather.ts` (07);
`nodes/material.ts` (04); `benchmarks/quality-rebuild/shared/*`, `aura3d/common.ts`, `three/common.ts` (12);
`fixtures/environment-corpus/` (15 default; biome HDRIs live in `packages/engine/assets/world/hdri/` instead); `apps/*` (14).

### Extension points used in files owned by others

| Extension point | Host (owner) | PRD 10 registration file |
|---|---|---|
| C-01 `registerFrameContributor` | `renderer/FrameGraph.ts` (01) | `production-runtime/world/WorldFramePasses.ts` |
| C-02 `registerShaderChunk/Feature` | `contracts/program.ts` (15) | `packages/rendering/src/lanes/prd10.ts` → `world/**/shaders/*` |
| C-03 `registerMaterialLobe` | `contracts/materialLobes.ts` (15) | `world/vegetation/FoliageMaterial.ts`, `world/space/PlanetMaterial.ts` |
| C-09 `registerEnvironmentSource` | `compiler/environment.ts` seam (02) | `production-runtime/world/BiomeResolver.ts` |
| C-11 `registerDepthVariantFeature` | `DepthPass.ts` (02) | `world/vegetation/WindField.ts` |
| C-13 `registerPostPass` | post registry (03) | `world/water/UnderwaterState.ts` |
| C-21 `app.atmosphere.setSky/setFog`, `skyBackgroundSlot` | atmosphere runtime (07) | `production-runtime/world/{BiomeResolver,TimeOfDayRuntime}.ts` |
| C-31 `registerDiagnosticsSection("world")` | `app/diagnostics.ts` (15) | `production-runtime/world/WorldDiagnostics.ts` |
| C-34 `registerLookLintRule` | `looks/generatedCodeWarnings.ts` (13) | `agent-api/world/register.ts` |
| C-36 `registerNodeHandler`, `registerOptionCoverage` | `compiler/` (15) | `agent-api/compiler/world.ts` |
| C-38 `registerAppExtension("world")` | `app/createAuraApp.ts` (15) | `packages/engine/src/lanes/prd10.ts` |
| C-39 `registerCliCommand`, `registerCodemod` | `commands/registry.ts` (15), `cli.ts` (05) | `packages/aura3d-cli/src/commands/prd10/index.ts` |
| `environments` spread | `nodes/environments.ts` (02) | `nodes/environments.world.ts` |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_WORLD` | bool | every PRD 10 behaviour change: node handlers, `prd10.world` contributor, C-09 sources, `app.world` real factory, `instances.model` world options, `prefabs.cityBlock` rebuild, lint rules, diagnostics section values | — |
| `A3D_QR_WORLD_TERRAIN` | bool | terrain + grass + scatter-on-terrain (on by default when `A3D_QR_WORLD` is on) | — |
| `A3D_QR_WORLD_WATER` | bool | water, reflection view, scene-copy fallback, underwater, caustics | — |
| `A3D_QR_WORLD_BIOME` | bool | biome/time-of-day sources, default-biome rules, `EnvironmentPresetPack` night change | — |

Not flagged (declared correctness fixes, CONTRACTS §6.1): bilinear `sampleTerrainHeightfield` (T2). Deletions of
caller-less planners (§7.3) ship unflagged with `@deprecated` throwing re-exports. Visibility of world surfaces in
shared lighting additionally requires `A3D_QR_CORE=v2` (Path G).

### Stubs used

C-01 (background/after-opaque/transparent after single ForwardPass; `sceneDepth` unavailable), C-02 (registries real,
`PROGRAM_GENERATOR_PENDING`), C-03 (registry only), C-06 (additive groups; unused), C-07 (per-frame wrapper; unused for
static data), C-08 (legacy uniforms), C-09 (legacy wrap + registered sources when flagged; legacy PMREM; SH hemisphere
pair), C-10 (hemisphere → 2 fills), C-11 (features stored; shadow = 1.0), C-12 (device mapping unchanged), C-13
(presets over today's post nodes), C-15 (fields declared, DIAGNOSTIC_ONLY), C-16 (pure table, wrapped decoders), C-17
(1.1 reader, pure gates), C-21 (sky → `sky.dayNight` + degradation, linear fog, horizon-clear capture), C-27 (real data),
C-30, C-31, C-33, C-34, C-36 (legacy compiler wrapper), C-37 (no add/remove), C-38/C-39 (real). PRD 10's own C-26 stub
stays the flag-off path until §5.4 removal.

### Integration checkpoints

Integrated acceptance (§16.2) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_WORLD` on inside
`qr_flags=all`, and never blocks a PRD 10 merge:
- IC-0 (2026-10-08): flags `none` baseline; PRD 10 records per-scene and per-game world baselines (research 21/23
  numbers reproduced) in `evidence/prd-10/IC-0.md`.
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening only (vision, recorded, cannot accept). PRD 10 checks that
  Path G activates where C-02 is real and lists still-pending contracts from `diagnostics().world.pending`.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds; the only rounds that can satisfy §16.2 and
  move `A3D_QR_WORLD` to `integrated-accepted`. Leave-one-out (`all,-world`) attributes regressions.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7).

---

## 13. Implementation phases

Each phase's exit criteria are met on a GitHub Actions macos-14 run (Chromium, ANGLE Metal) of
`.github/workflows/qr-prd10-world.yml`, with the run ID recorded in
`docs/project/aura3d-quality-rebuild/evidence/prd-10/<phase>.md`. Phase 1 starts on day 0. Phases 2, 3, 4, 5 and 6
depend only on Phase 1 outputs and the PR 0b merges, not on each other, and run in parallel inside the lane (separate
agents). No phase waits for another lane; integrated criteria (§16.2) never gate a phase exit.

**Phase 1: Day-0 foundations in PRD 10 files only (2026-10-05 →).**
- Work: R9 correctness/honesty (bilinear `sampleTerrainHeightfield`; delete `createTerrainTileGrid`/`TerrainTilePlan`,
  `createNamedEnvironmentPreset`; rewrite the claim headers at `TerrainTiles.ts:1-13` and `VegetationScatter.ts:134`;
  delete the 3 aliased HDRI manifest entries); `agent-api/world/{types,biomes,wind,queries}.ts` (pure); the §6.3 rig
  table as data with `describeBiome`; C-26 real `worldQueriesSlot.provide` (ground order, height, wind, biome); all
  `a3d_prd10_*` chunks registered and compiled in ChunkHarness; `WorldFramePasses` skeleton (contributor registered,
  Path S/G selection, depth-sharing probe test); lane scenes `prd10-*` (§16.1) with Aura and three r185 adapters;
  `qr-prd10-world.yml`; flag-`none` baseline capture of every lane scene; codemod `prd10-world-migrate` in report mode.
- Exit:
  - `pnpm typecheck:raw`, `pnpm lint`, `pnpm test:unit` green; C-26 conformance green for `stub` and `real`.
  - Every `a3d_prd10_*` chunk compiles in ChunkHarness on macos-14 (WebGL2). Its WGSL twin returns zero errors from
    `GPUShaderModule.getCompilationInfo()` in the same Chromium run when `navigator.gpu` exists; otherwise the twin is
    recorded as "unvalidated" (`tools/wgsl-validate` does not exist at `7992a0dd`; it is PRD 11's).
  - `world-pass-depth.spec.ts` result recorded (Path S step 3 in `background` or fallback to `after-opaque`).
  - `rg -n "createTerrainTileGrid|createNamedEnvironmentPreset" packages apps examples` returns only the throwing
    deprecated re-exports.
  - Baselines for all `prd10-*` scenes committed to `evidence/prd-10/phase-1.md`.

**Phase 2: Terrain (R2), after PR 0b-1/0b-2 (≤ 2026-10-07 →).**
- Scope: `world/terrain/*`, `TerrainRuntime`, `terrain` node handler, height sources (asset/procedural/array), CDLOD,
  layer arrays, auto-splat on GPU at load, holes, collider via `HeightfieldShape`, `AuraTerrainHandle`, safe-basic path.
- Exit: S1, S2, S3, S4 (§16.1).

**Phase 3: Scatter, foliage, wind, impostors, grass (R3, R4).**
- Scope: `InstanceChunkGrid`, `FoliageMaterial`, `ImpostorMaterial`, `GrassField`, `WindField`, `scatter`/`grass`/`wind`
  handlers, `instances.model` world options, `tools/impostor-bake`, C-11 `prd10.wind` depth feature registration.
- Exit: S5, S6, S7, S8 (§16.1).

**Phase 4: Water (R5).**
- Scope: `WaterMaterial`, `GerstnerWaves` (moved from `OceanSurface.ts:170-300`), `SceneCopyFallback`,
  `ReflectionViewPass`, underwater + caustics, `water` handler, `nodes/water.ts` deprecation path; delete
  `WaterReflectionRefractionCapture`.
- Exit: S9, S10 (§16.1).

**Phase 5: Kits, spline, placement, rooms, streets, content (R6, §6.6).**
- Scope: `defineKit`, `world.kits.*`, `world.spline/extrude/placeAlong/placeGrid/placePoisson`, `world.room`,
  `world.street`, `prefabs.cityBlock` rebuild, shipped content admitted through C-17 gates into
  `packages/engine/assets/world/manifest.json` with provenance.
- Exit: S11, S12, S13 (§16.1).

**Phase 6: Biomes, time of day, space (R1, R7, R8).**
- Scope: `prd10.biome`/`prd10.timeOfDay` C-09 sources, `biome`/`time-of-day` handlers applying C-21 sky/fog and C-13
  preset, default-biome rules, `environments.outdoor/room/space/underwater`, `TimeOfDayRuntime` re-capture, practical
  scale, `SpaceSkyBake`, `world.materials.planet`, lint rules, C-40 facts `F-10-01..08`.
- Exit: S14, S15, S16 (§16.1).

**Phase 7: Integrated acceptance (checkpoint-driven, never blocks merges).**
- Exit (= completion, §21): §16.2 met at a G-PANEL round with `A3D_QR_WORLD` on in `all`, vision + human sign-off
  recorded; flag reaches `integrated-accepted`, then `default-on` after two clean checkpoints; §7.3 removals done where
  their conditions hold.

---

## 14. Task checklist

Every task edits only PRD 10-owned paths (§Parallel execution) unless it says "request". File paths are relative to the
repo root; "flag" means `A3D_QR_WORLD` (or the named sub-flag) gates the behaviour.

Phase 1 (day 0):
- [x] T1.1 `packages/rendering/src/TerrainHeightfield.ts:133-141`: replace the `Math.round` texel pick (`:134-135`) with
  bilinear interpolation of the 4 neighbours; add `toHeightTexture(fixture): { data: Float32Array; width; height }`.
  Test `tests/qr/prd10/unit/terrain-bilinear.test.ts`: midpoint of a 2×2 ramp equals the mean ±1e-6.
  (landed at `tests/unit/contracts/impl/prd10-terrain-bilinear.test.ts` — `tests/qr/` is not lane-owned or vitest-included)
- [x] T1.2 `packages/rendering/src/TerrainTiles.ts`: delete `createTerrainTileGrid` and `TerrainTilePlan` (`:15-96`),
  replace the `:1-13` header with "budget and query utilities only"; keep a `@deprecated` `createTerrainTileGrid` that
  throws `AuraRuntimeError("removed-world-planner")`. (types kept as `@deprecated` — index.ts re-export is lane-01's)
- [x] T1.3 `packages/rendering/src/VegetationScatter.ts:134`: claim boundary names `world.scatter` as the runtime and
  this module as an offline placement helper.
- [x] T1.4 `packages/rendering/src/EnvironmentPreset.ts`: delete `createNamedEnvironmentPreset` (`:47-128`) after
  `rg -n createNamedEnvironmentPreset packages apps examples templates` shows only its definition; leave a throwing
  `@deprecated` export.
- [x] T1.5 `fixtures/three-compat/environments/manifest.json`: delete `industrial-sunset-puresky`, `spruit-sunrise`,
  `venice-sunset`; `rg` the ids in `benchmarks/` and file Q-12-1 with any hit. (no `benchmarks/` hits — Q-12-1 not needed;
  `flagshipBindings` repointed to the canonical ids; `requirements` corrected to the honest 9 presets / 3 real HDRIs)
- [ ] T1.6 `packages/engine/src/agent-api/world/types.ts`, `biomes.ts`: types of §7.1.1-7.1.2 re-exporting C-26
  types; `BIOME_RIGS: Readonly<Record<AuraBiomeId, AuraBiomeRigDetail>>` from the §6.3 table (all 11 ids, deep-frozen);
  `describeBiome(id, tier)` applying the Low-tier variant rule; `listBiomes()`.
- [ ] T1.7 `agent-api/world/wind.ts`: `AuraWindOptions`, `normalizeWind` (directionDeg → unit vec3, gustScale →
  gustFrequency, defaults 35°/0.5/0.35/40 m/0.2).
- [ ] T1.8 `agent-api/world/queries.ts`: `createWorldQueries(app)` implementing C-26 semantics (§7.1.10); provide it in
  `packages/engine/src/lanes/prd10.ts` via `worldQueriesSlot.provide`. Add
  `tests/unit/contracts/impl/prd10-world.test.ts`.
- [ ] T1.9 `packages/rendering/src/lanes/prd10.ts`: `registerShaderChunk` for every `a3d_prd10_*` chunk (§8.0) with
  GLSL and WGSL bodies from `world/**/shaders/*`; `tests/qr/prd10/browser/chunks.spec.ts` compiles each in
  ChunkHarness.
- [ ] T1.10 `production-runtime/world/WorldFramePasses.ts`: `registerFrameContributor({ id: "prd10.world", owner:
  "prd10", flag: "A3D_QR_WORLD", phases: ["collect", "background", "after-opaque", "transparent"] })`; select Path G iff
  `programCacheSlot.provided && flags.on("A3D_QR_CORE")` with value `v2`, else Path S.
- [ ] T1.11 `tests/qr/prd10/browser/world-pass-depth.spec.ts`: a Path S `background` pass quad at z = 5 and a forward
  box at z = 3 and z = 7; assert both occlusion orders by pixel colour. Record the result in `evidence/prd-10/phase-1.md`.
- [ ] T1.12 `production-runtime/world/WorldDiagnostics.ts`: `registerDiagnosticsSection({ key: "world", owner: "prd10" })`
  returning `AuraWorldDiagnostics` with `null` for anything not measured.
- [ ] T1.13 Lane scenes: `benchmarks/quality-rebuild/scenes/prd10/index.ts` with the 9 `prd10-*` specs of §16.1,
  `aura3d/scenes/prd10/*.ts` and `three/scenes/prd10/*.ts` adapters (three r185 `Water`, `Sky`, `InstancedMesh`
  references); each declares `qrFlags: ["world"]`, `owner: "prd10"`.
- [ ] T1.14 `.github/workflows/qr-prd10-world.yml`: macos-14; jobs `unit` (`pnpm test:unit -- tests/qr/prd10 tests/unit/contracts`),
  `browser` (Playwright Chromium on `tests/qr/prd10/browser`), `capture` (dispatches PRD 12's `quality-rebuild-capture.yml` with
  the C-33 `qr_flags` input, `world` and `none`, on `prd10-*` scenes); artifacts uploaded; run ID written by the job summary.
- [ ] T1.15 `packages/aura3d-cli/src/commands/prd10/index.ts`: `registerCodemod("prd10-world-migrate")` in report mode
  covering the §10 patterns, with row output `{ file, line, pattern, suggestion }`; unit test on fixtures in
  `tests/qr/prd10/fixtures/migrate/`.
- [ ] T1.16 `agent-api/compiler/diagnosticOnly.prd10.ts`: list `instances.model.{static,chunkSize,shadowLod,wind,impostor}`
  and `AuraMaterialSpec.practical` until wired; `registerOptionCoverage` rows for each world builder field.

Phase 2 (terrain):
- [ ] T2.1 `world/terrain/TerrainHeightTexture.ts`: R32F `texImage2D` upload, `heightBilinear` CPU twin identical to
  the GLSL of §8.1; test CPU vs GPU readback (one-off test readback, never in the frame) ≤ 1e-4 m on 1,000 random points.
- [ ] T2.2 `world/terrain/TerrainCdlod.ts`: quadtree with per-node min/max height, frustum test, ranges
  `range_l = range_0 · 2^l` scaled by C-27 `lodBias`; unit test: node count and morph ranges for a 2 km terrain.
- [ ] T2.3 `world/terrain/TerrainPatchGeometry.ts`: shared (N+1)² grid, N from §17 tier table.
- [ ] T2.4 `world/terrain/TerrainMaterial.ts` + `shaders/terrain.{vert,frag}.glsl.ts`, `terrain.wgsl.ts`: §8.1 exactly;
  layer `sampler2DArray`s built from per-layer textures (PNG on Path S, KTX2 via C-16 when real).
- [ ] T2.5 GPU auto-splat bake at load (`world/terrain/SplatBake.ts`): fullscreen pass writing RGBA8 splat from rules;
  default rule set equals `resolveTerrainSlopeBlend`'s formula (test: identical weights ±1/255 at 64 sample points).
- [ ] T2.6 `agent-api/world/terrain.ts`: `world.terrain` builder, `AuraTerrainHandle` (heightAt, normalAt, slopeDegAt,
  layerWeightsAt, raycast), holes, collider (`HeightfieldShape` via `toRapierHeightfieldHeights`), procedural sources
  (`fbm`, `ridged`, `terraced`, `flatten`).
- [ ] T2.7 `agent-api/compiler/world.ts` + `production-runtime/world/TerrainRuntime.ts`: `registerNodeHandler({ kind:
  "terrain" })`; Path G items in `collect`, Path S pass in `background`; safe-basic mesh with vertex-colour splat.
- [ ] T2.8 Delete `resolveTerrainSlopeBlend` callers in PRD 10 files; keep the export `@deprecated`.

Phase 3 (vegetation):
- [ ] T3.1 `world/vegetation/InstanceChunkGrid.ts`: 32 m cells, 32 B/48 B layouts (§9.3), static buffers, per-cell
  AABB including max wind sway, `firstInstance` emulation via attribute offset `rangeStart * stride`.
- [ ] T3.2 `agent-api/world/scatter.ts`: Bridson Poisson per cell seeded by `hash(seed, layerIndex, cellX, cellZ)`;
  slope/height/onLayers/mask/exclude rules; `planScatterInstances`/`enforceFrameBudget` budget; `checksum` = SHA-256 of
  the sorted placement buffer.
- [ ] T3.3 `world/vegetation/WindField.ts`: `A3DWind` UBO per C-26, 64² RG8 gust noise from `engine/assets/world/noise/`;
  `registerShaderFeature("prd10.wind")` (hook `vertex:deform`) and `registerDepthVariantFeature("prd10.wind")`.
- [ ] T3.4 `world/vegetation/FoliageMaterial.ts` + shaders: §8.3; `registerMaterialLobe("prd10.foliageTranslucency")`;
  alpha test always, A2C only when C-04/C-15 real and MSAA on.
- [ ] T3.5 `world/vegetation/ImpostorMaterial.ts` + shaders: §8.4; dithered crossfade over 4 m.
- [ ] T3.6 `tools/impostor-bake/`: CLI per §9.6 and `assets bake-impostor` C-39 command; determinism test (two runs →
  same atlas SHA-256) on the remote runner.
- [ ] T3.7 `world/vegetation/GrassField.ts` + `GrassRuntime.ts`: §8.5; blades on Medium+, cards on Low; ring of 8 m chunks.
- [ ] T3.8 `nodes/instances.ts`: world options on `instances.model` emit `scatter` placements when the flag is on.

Phase 4 (water):
- [ ] T4.1 `world/water/GerstnerWaves.ts`: move `oceanPresetWaves`/`evaluateWaves` (`OceanSurface.ts:170`, `:213`);
  `OceanSurface.ts` re-exports; CPU/GPU agreement test ≤ 1e-3 m over 10 s at 100 points.
- [ ] T4.2 `world/water/WaterMaterial.ts` + `shaders/water.{glsl,wgsl}.ts`: §8.6 with `a3dWorldEnvSpecular` and
  `a3dSunShadowAt`; Low path without scene copy.
- [ ] T4.3 `world/water/SceneCopyFallback.ts`: `after-opaque` blit to `prd10.scene.color.copy`/`prd10.scene.depth.copy`;
  use `FRAME_RESOURCES.sceneColorCopy/sceneDepthCopy` when another pass publishes them (read the blackboard).
- [ ] T4.4 `world/water/ReflectionViewPass.ts`: §9.1 step 2 with oblique clip; skip rule (< 2% coverage).
- [ ] T4.5 `world/water/{UnderwaterState,Caustics}.ts`: §8.7; `prd10.caustics` feature; `prd10.underwaterDistortion`
  post pass; C-21 absorption fog request Q-07-3.
- [ ] T4.6 `agent-api/world/water.ts`, `nodes/water.ts`: `world.water`, `AuraWaterHandle`; `water.surface` emits
  `world.water` with the flag on and warns.
- [ ] T4.7 Delete `WaterReflectionRefractionCapture` (`OceanSurface.ts:389-455`) and `WaterSurface.ts` once `rg` shows
  no imports outside PRD 10 files (else keep `@deprecated` and list the importers in Q-14-1).

Phase 5 (kits and content):
- [ ] T5.1 `agent-api/world/kits.ts`: `defineKit`, `place` (snap, rotation steps, sockets), `fill` (seeded); output =
  `scatter` placement nodes per asset (§7.1.7).
- [ ] T5.2 `agent-api/world/spline.ts`: centripetal Catmull-Rom, arc-length table, rotation-minimizing frames, banking.
- [ ] T5.3 `world.extrude` (`agent-api/world/spline.ts`): profiles of §7.1.7, UVs in metres, adaptive segments,
  `conformToTerrain` writes a flatten mask into the terrain height source before upload.
- [ ] T5.4 `agent-api/world/placement.ts`: `placeAlong`, `placeGrid`, `placePoisson`, all matrix-composed.
- [ ] T5.5 `agent-api/world/{room,street}.ts`: §7.1.8; room lights as practical lights.
- [ ] T5.6 `nodes/prefabs/cityBlock.ts`: rebuild on `world.street` + city kit behind the flag; flag off unchanged + warning.
- [ ] T5.7 `packages/engine/assets/world/`: admit §6.6 sets; each entry records source URL, licence (CC0/MIT only),
  author, SHA-256, C-17 gate verdicts; `tools/world-content-bake/` bakes water normals, foam, caustics, noise and wind
  vertex weights deterministically.

Phase 6 (biomes, time of day, space):
- [ ] T6.1 `production-runtime/world/BiomeResolver.ts`: `registerEnvironmentSource({ id: "prd10.biome", priority: 300 })`
  and `prd10.timeOfDay` (250); resolutions with `ambient: null`, IBL > 0; default-biome rules of §6.3.
- [ ] T6.2 `biome` node handler: apply rig sky/fog through `app.atmosphere.setSky/setFog` (C-21), sun as a directional
  light with C-10 shadow options, C-13 preset id + overrides via RenderSource contributions.
- [ ] T6.3 `nodes/environments.world.ts`: `environments.outdoor/room/space/underwater` (§7.1.2).
- [ ] T6.4 `production-runtime/world/TimeOfDayRuntime.ts` + `agent-api/world/timeOfDay.ts`: NOAA solar position (±0.5°
  vs a 20-point reference table), arc mode, keyframe interpolation rules (§6.7), re-capture scheduling, practical scale.
- [ ] T6.5 `packages/rendering/src/EnvironmentPresetPack.ts:25-46`: drop night `exposureFactor` behind
  `A3D_QR_WORLD_BIOME`; update its SSIM gate to per-preset references.
- [ ] T6.6 `world/space/{SpaceSkyBake,PlanetMaterial}.ts`: §8.8; fallback cube `engine/assets/world/hdri/space-default-512.ktx2`
  (+ PNG faces).
- [ ] T6.7 `packages/environments/src/BiomeEnvironmentRegistry.ts`: biome HDRI ids → `engine/assets/world/hdri/*`; load
  checks (≥ 2k for High, RGBE/EXR source, distinct SHA-256 per id).
- [ ] T6.8 `agent-api/world/register.ts`: `registerLookLintRule` for `look/world-void` and `look/primitive-trees`.
- [ ] T6.9 Append C-40 rows `F-10-01..08` to CONTRACTS Appendix B (append-only edit allowed by CONTRACTS §6.4).
- [ ] T6.10 File every §12.3 request that is still open, with the exact diff text.

---

## 15. Test requirements

All suites run remotely on GitHub Actions `macos-14` (Chromium with ANGLE Metal; the runner class of run 37289688772)
via `.github/workflows/qr-prd10-world.yml`, plus the custodian `qr-contracts.yml` on every PR. Nothing heavy runs on the
developer Mac. Browser tests and bakes are Playwright jobs on that runner.

### 15.1 Unit (`vitest`, `tests/qr/prd10/unit/`, picked up by `pnpm test:unit`)
- Terrain: bilinear sampling (T1.1); `TerrainCdlod` node selection, morph ranges and `lodBias` scaling; height-source
  generators deterministic per seed; holes mask; Rapier heights row-major equality with `toRapierHeightfieldHeights`.
- Scatter/placement: checksum stability across 3 runs and across `seed`-order permutations; budget enforcement; rule
  filters; kit socket snapping and rotated-origin placement against analytic matrices (≤ 1e-5); spline arc-length and
  frames; extrusion UV metres per tile (≤ 1%).
- Wind/water/time: `normalizeWind`; Gerstner CPU sums vs closed form; steepness clamp; NOAA solar position vs a 20-row
  reference table (≤ 0.5°); keyframe interpolation (linear RGB, log intensity, EV).
- Biomes: `listBiomes().length === 11`; `describeBiome` deep-frozen and deterministic; every rig has
  `ambientPolicy: "ibl-only"`, shadow strength 1.0, a valid C-13 preset id and C-21 spec union member; default-biome rules.
- Contracts: `tests/unit/contracts/C-26-world.test.ts` green for `stub` and `real`; `tests/unit/contracts/impl/prd10-world.test.ts`.
- C-36: option-coverage rows for every world builder field; flag-off RenderSource byte-equality for the 18 base
  scenes' snapshots with PRD 10 registrations loaded.
- Codemod: `prd10-world-migrate` rows on fixtures.

### 15.2 Browser (`tests/qr/prd10/browser/*.spec.ts`, Playwright Chromium macos-14)
- `chunks.spec.ts`: every `a3d_prd10_*` chunk compiles in ChunkHarness; WGSL twins via `getCompilationInfo()` when WebGPU
  exists.
- `world-pass-depth.spec.ts` (T1.11).
- `terrain-gpu-cpu.spec.ts`: GPU height readback (test-only) vs CPU ≤ 1e-4 m.
- `terrain-cracks.spec.ts`: 120-frame dolly over `prd10-terrain-flyover`; background-coloured pixels inside the terrain
  silhouette mask = 0 in every frame.
- `scatter-alloc.spec.ts`: instrumented `gl.createBuffer`/`createVertexArray` counts after a 60-frame warm-up stay
  constant for 300 frames with 100k instances.
- `wind-chunk.spec.ts`: `a3dWindOffset` in ChunkHarness vs CPU reference ≤ 1e-4; length preservation ≤ 1e-4.
- `impostor.spec.ts`: impostor vs LOD0 silhouette IoU ≥ 0.9 at 8 view directions.
- `water-gerstner.spec.ts`: vertex height vs `AuraWaterHandle.heightAt` ≤ 1e-3 m; `water.surface` with the flag on
  submits 0 `box` primitives.
- `time-of-day.spec.ts`: `app.world.timeOfDay.set(h)` leaves the snapshot version and node count unchanged; at most one
  capture face per frame.
- `flag-off-identity.spec.ts`: flags `none` vs `85aafcd0` on the 6 sentinel scenes within IC-0 tolerance.

### 15.3 Capture (C-30/C-33)
- Every `prd10-*` scene captured with `qr_flags=world` and `none`, both engines (three r185 adapter), desktop 1280×720 at
  DPR 1 and 2, and the mobile viewport 390×844 at DPR 3 (render scale per C-27 Low/Medium).
- Each run stores `ReadyPayloadV2` (qrFlags, applied exposure, tone mapping), `diagnostics().world`, FLIP/SSIM/ΔE2000 per
  PRD 12 metrics, and frame-time p50/p95 per tier.

### 15.4 Negative controls
- Broken controls `flat-sky` and `albedo-only` (C-30) on `prd10-biomes-*` and `prd10-terrain-layers` must lower the PRD 12
  metrics and the vision screening score; if they do not, the scene is not discriminative and is fixed before use.

---

## 16. Visual acceptance tests

### 16.1 Standalone acceptance (gates PRD 10 merges and `standalone-accepted`)

Passable with PR 0 stubs, today's renderer and `A3D_QR_WORLD` on, on the lane workflow. These are engineering and
determinism gates; renders produced here are recorded, **not** claimed as quality (CONTRACTS §8 row 10).

Lane scenes (C-30, both adapters): `prd10-terrain-flyover`, `prd10-terrain-layers`, `prd10-forest-wind`,
`prd10-meadow-grass`, `prd10-coast-water`, `prd10-city-street`, `prd10-interior-room`, `prd10-biomes-sweep` (one capture per
biome id, 11 frames), `prd10-space-orbit`.

| # | Criterion | Measured by |
|---|---|---|
| S1 | Terrain CPU/GPU/physics height agreement ≤ 1e-4 m (1,000 points); `ground().raycastDown` hits terrain first | 15.1, `terrain-gpu-cpu.spec.ts` |
| S2 | CDLOD: 0 crack pixels over 120 frames; per-frame terrain-region luma delta p99 ≤ 0.02 on a slow dolly (no popping) | `terrain-cracks.spec.ts`, capture strip |
| S3 | Terrain renders ≥ 4 sampled layers (`diagnostics().world.terrain[0].layers ≥ 4`); rock vs grass region mean ΔE2000 ≥ 10; terrain region is not a flat colour (per-pixel luma std-dev ≥ 0.03) | capture + masks |
| S4 | Terrain CPU selection ≤ 0.15 ms p95 (2 km, 6 levels); draws ≤ LOD levels + 1 | frame timing, diagnostics |
| S5 | Scatter checksum identical across 3 runs, Node vs browser, and evaluation-order permutations | 15.1 |
| S6 | 100k scatter instances: 0 buffer/VAO allocations after warm-up; draws ≤ 1 per (cell group × LOD band) | `scatter-alloc.spec.ts` |
| S7 | Wind chunk matches CPU reference ≤ 1e-4; foliage visibly moves (per-pixel delta in foliage mask over 1 s ≥ 1% of pixels) | `wind-chunk.spec.ts`, strip |
| S8 | Impostor bake deterministic (same SHA-256 twice); impostor/LOD0 IoU ≥ 0.9 at 8 views | `impostor.spec.ts` |
| S9 | Water vertex height = `heightAt` ≤ 1e-3 m; `water.surface` (flag on) submits 0 box primitives | `water-gerstner.spec.ts` |
| S10 | Water reflection/refraction mode per tier reported as configured in §17; planar pass skipped below 2% coverage | diagnostics, unit |
| S11 | Kits/placement: analytic matrix agreement ≤ 1e-5 under rotated origins; 0 `group` nodes emitted | 15.1 |
| S12 | Extrusion: UV metres per tile within 1%; `conformToTerrain` max gap ≤ 0.02 m | 15.1 |
| S13 | Shipped content: every asset CC0/MIT with provenance + SHA-256; every model has base colour + normal + LOD1 (or a recorded stylized decision); C-17 gates pass; bytes within §17.3 | admission report |
| S14 | Biomes: 11 rigs pure/deterministic; each biome scene resolves C-09 kind `"biome"` with `ambient: null` and IBL intensity > 0; a sky node is submitted (no single clear-colour world scene with a world signal) | 15.1, diagnostics |
| S15 | Time of day: solar ±0.5°; no remount on `set`; ≤ 1 capture face/frame; practical scale changes PRD 10 practical lights | `time-of-day.spec.ts` |
| S16 | Flag-off identity within IC-0 tolerance on the 6 sentinels; no string in PRD 10 files claims impostors, rendering or parity that a test does not measure (`rg` audit list in evidence) | `flag-off-identity.spec.ts`, audit |

### 16.2 Integrated acceptance (evaluated only at G-PANEL checkpoints; never blocks)

Judged with `qr_flags=all` (Path G active), 2 human judges + 1 vision model (PRD 12 rubric, C-32), same capture
conditions for both engines. Medians on the 0-10 scale.

| # | Criterion | Needs (contracts real) |
|---|---|---|
| I1 | Each `prd10-*` scene: Aura median ≥ 6.5 and ≥ three r185 median − 0.5 | C-02, C-03, C-09, C-11, C-13, C-21 |
| I2 | Base scenes 09-outdoor, 13-ibl-only, 16-instancing, 17-large-environment, 18-game-scene: Aura median ≥ three median (23: 5.5 / 6 / 4.5 / 4.5 / 5.0) | + R18 fix (15), C-16 |
| I3 | Games that adopted `world.*` (PRD 14's choice, per `games.json` `qrFlags`): `environment_world` ≥ 6 and `atmospheric_effects` ≥ 5 per game; mean `environment_world` over all 18 games ≥ 5 (from 2.7, research 21) | + PRD 14 adoption |
| I4 | Foliage shadows move with wind and cards cast cutout shadows (shadow-receiver mask IoU vs a reference ≥ 0.85) | C-11 |
| I5 | Biome IBL is pixel-backed (`iblPixelBacked: true`) and the `flat-sky` broken control scores ≥ 1.5 lower | C-09, C-21 |
| I6 | §17 budgets met per tier on the checkpoint runner with all flags on | C-27, C-28 |
| I7 | No vision-judge complaint of class "void", "flat grey ground", "lollipop/primitive trees", "box water" on adopted games | all of the above |

---

## 17. Performance budgets

Tier names and shared settings are C-27 `QUALITY_TIERS` (frozen). World values below are PRD 10's own tables, keyed by
the resolved tier. GPU numbers are targets at the tier's reference resolution (Low: mobile 1170×2532 at render scale
0.5; Medium: 1080p integrated GPU; High: 1440p discrete; Ultra: 4K discrete). They are measured on the checkpoint
runner (macos-14, Apple Paravirtual GPU) for regression tracking; numbers for real mobile hardware are "unmeasured"
until a device run exists. Timer-query numbers are reported only when `EXT_disjoint_timer_query_webgl2` exists.

### 17.1 Per-system budgets

| System / parameter | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Terrain patch N / LOD levels / layers | 32 / 4 / 4 (no triplanar) | 64 / 6 / 4 (triplanar rock) | 64 / 6 / 8 | 64 / 7 / 8 + baked normal |
| Terrain GPU ms | 1.0 | 1.2 | 1.8 | 2.5 |
| Scatter visible: mesh / impostor / rocks | 1k / 10k / 5k (impostor > 25 m) | 3k / 20k / 10k | 6k / 40k / 20k | 10k / 80k / 30k |
| Scatter GPU ms (incl. alpha-test overdraw) | 1.0 | 1.5 | 2.2 | 3.0 |
| Scatter shadow casters | none | near cascade ≤ 40 m | near ≤ 60 m + impostors far | all cascades |
| Grass | cards ≤ 15 m, ~40k | blades 10/m² ≤ 30 m | 20/m² ≤ 45 m | 32/m² ≤ 60 m |
| Grass GPU ms | 0.5 | 1.0 | 1.8 | 2.5 |
| Water reflection / refraction / waves | IBL / off / 4 | IBL / on / 4 | planar half-res / on / 8 | planar / on / 8 |
| Water GPU ms | 0.3 | 0.6 | 2.1-3.6 | 3-5 |
| Sky re-capture face size / cadence | 64² / 1 face per 4 frames | 128² / 1 per frame | 256² / 1 per frame | 256² / 1 per frame |
| Space bake | 512² RGBA8+RGBM | 512² RGBA16F | 1024² RGB9E5 | 1024² RGB9E5 |
| World CPU ms/frame (selection, culling, uniforms) | ≤ 0.5 | ≤ 0.5 | ≤ 0.6 | ≤ 0.8 |
| World draw calls (share of C-27 `drawBudget` 150/300/600/1500) | ≤ 60 | ≤ 120 | ≤ 240 | ≤ 500 |
| Total world GPU ms (all of the above in one scene) | ≤ 3.5 | ≤ 5.0 | ≤ 8.0 | ≤ 12.0 |

### 17.2 GPU memory (world resources, resident)

| Tier | Budget | Composition at the cap |
|---|---|---|
| Low | 96 MB | terrain 4 layers × 512² KTX2 (≈ 4.5 MB), height 513² R32F (1 MB), 2 species impostors at 1024² (8 MB), grass atlas, water normals, 1k HDRI or sky capture |
| Medium | 192 MB | 4 layers × 1k (17 MB), height 1025² (4.2 MB), splat ×1 (5.6 MB), 4 species (32 MB), 100k instances (3.2 MB), SceneColorCopy 1080p (16.6 MB), 2k HDRI (8 MB) |
| High | 320 MB | 8 layers (34 MB), splat ×2, 6 species, planar RT (6 MB), double PMREM |
| Ultra | 512 MB | High + baked normal map, 1024² space cube |

Over budget at load: drop layer resolution one step, then impostor atlas size, then warn with
`world.memory.reduced`. The uncompressed PNG path (C-16 stub) multiplies texture bytes ×4; on Path S the budget check
uses actual uploaded bytes, so Low may drop to 4 layers × 256² and reports it.

### 17.3 Shipped asset bytes (`packages/engine/assets/world/`, lazy-loaded, never in the JS bundle)

Terrain layers ≤ 30 MB (10 layers × 1k + 512 KTX2, PNG fallbacks ≤ 60 MB stored via LFS); foliage ≤ 48 MB; rocks
≤ 4 MB; water + noise ≤ 1.8 MB; HDRIs ≤ 40 MB (5 × 2k + 1k); city ≤ 15 MB; interior ≤ 10 MB; trackside ≤ 8 MB; space
≤ 14 MB. A route downloads only the sets its scene references.

### 17.4 Bundle (gzip)

- Root `@aura3d/engine` entry growth from PRD 10: ≤ 1.5 KB (lane barrel with lazy factories, type-only re-exports).
- World runtime chunk loaded on first world node: ≤ 56 KB (R1 4 + R2 14 + R3 12 + R4 4 + R5 10 + R6 6 + R7 3 + R8 3).
- Measured with the existing bundle-size tooling (`tools/bundle-size/`, PRD 11-owned; run, not edited) in the lane
  workflow; regressions above budget fail PRD 10's own job.

## 18. Browser coverage

| Browser (macos-14 runner) | Standalone (Path S) | Notes |
|---|---|---|
| Chromium, WebGL2 (ANGLE Metal) | required for all §16.1 criteria | reference runner |
| Firefox, WebGL2 | required for S1, S3, S5, S9, S14 functional checks | timer queries usually absent → GPU ms `null` |
| WebKit (Playwright), WebGL2 | required for S1, S3, S5, S9, S14 | R32F `texelFetch` path (no float-linear needed) |
| Any, WebGPU | excluded from standalone until Q-11-1 lands; `WGSL_PROGRAM_MISSING` degradation must be recorded, never flat colour | integrated only |

Safe-basic renderer: S9 (no box water) and S14 (sky node submitted) also run with `renderer: "safe-basic"`.

## 19. Mobile coverage

- Playwright device emulation on macos-14 (iPhone 13 390×844 DPR 3 WebKit; Pixel 7 412×915 DPR 2.625 Chromium) with
  `?aura3d-quality=low` and `medium`. This validates layout, tier selection (C-27 `"auto"` → medium on coarse pointer),
  Low-tier fallbacks (grass cards, no refraction, IBL water, 4 terrain layers) and memory accounting. It does not measure
  mobile GPU time.
- Touch-only interaction is not needed by world systems; no gesture tests.
- Real-device GPU numbers in §17 stay "target, unmeasured" until a device-farm run is recorded in
  `evidence/prd-10/mobile.md`.

## 20. Screenshots and evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd-10/` with the GH Actions run ID, commit SHA, runner
string, `qrFlags` and tier for every image:
- Per phase: `phase-N.md` with run IDs and the §16.1 table filled with measured values.
- For each `prd10-*` scene: Aura and three r185 frames at 1280×720 DPR 1 and 2 and the mobile viewport, flags `world`
  and `none`; 8-frame strips for wind, water and time-of-day; region masks (terrain, foliage, water, sky).
- `biomes-sweep.png` contact sheet of all 11 rigs (Path S label stamped on Path S captures).
- Diagnostics JSON (`diagnostics().world`) next to each capture.
- At G-PANEL rounds: the `PanelRoundRecord` excerpt for PRD 10 scenes and adopted games, leave-one-out deltas, and the
  judges' verbatim notes for any score below the §16.2 bar.
No capture produced with stubs is labelled as a quality result.

## 21. Completion criteria

1. Every §14 task is checked, or moved with a reason to §24 or to a §12.3 request.
2. §16.1 S1-S16 pass on the lane workflow; `A3D_QR_WORLD` is `standalone-accepted`.
3. §16.2 I1-I7 pass at one G-PANEL checkpoint with `qr_flags=all`, vision + human sign-off recorded; the flag reaches
   `integrated-accepted`, then `default-on` after two consecutive clean checkpoints (CONTRACTS §5.3).
4. C-26 real passes its conformance suite; facts `F-10-01..08` are `verified` in Appendix B.
5. §7.3 removals done where 0 call sites remain; the rest are listed with their remaining callers.

## 22. Rollback

- Every behaviour change except T2 (bilinear height, declared fix) is behind `A3D_QR_WORLD` or a sub-flag; rollback is
  turning it off (`?a3d-qr=-world`, `A3D_QR=-world`, or per-route opt-out). The C-26 stub remains the flag-off path.
- Sub-flag rollback isolates a system: `-world_water`, `-world_terrain`, `-world_biome`.
- A merged PR that turns main red is reverted immediately (CONTRACTS §6.1); PRD 10 re-lands.
- T2 rollback: revert the single commit; PRD 12 restores previous baselines.
- Deleted planners keep throwing re-exports for one minor version, so a downstream import failure is explicit.
- Shipped assets are additive files; removing a set only affects scenes that reference it, which fail loudly.

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Path S `background`-phase depth is not shared with ForwardPass | world opaque mis-occludes | T1.11 decides on day 0; fallback `after-opaque` with documented transparent-order deviation |
| C-02 generator lands late or never covers custom vertex hooks | world surfaces lack shared lighting/shadows; integrated scores stay low | Path S keeps standalone value; integrated criteria wait for checkpoints; hook needs filed early as CCR if missing |
| C-09 crossfade field rejected (CCR-10-1) | visible IBL pop at time-of-day captures | hard cut limited to captures every ≥ 1.5° of sun; option to disable re-capture |
| Licence or availability of candidate CC0 packs changes | content gap | multiple candidates per set (§6.6); admission blocks non-CC0/MIT; procedural bakes for water/noise/space |
| Alpha-tested foliage overdraw on Low | frame-time misses | impostors from 25 m, card-only grass, budget enforcement; tier drop via C-27 governor |
| Physics/visual height mismatch after T2 changes existing games | gameplay drift | declared fix; PRD 12 re-baseline; affected routes listed for PRD 14 |
| Vision judges reward painted plates over 3D worlds | misleading scores | rubric lines via Q-12-1; human panel required for acceptance |
| WebGPU coverage slips | WebGPU users get WebGL2 or degraded worlds | explicit degradation, never flat colour; integrated only |

## 24. Out of scope

- Occlusion culling, HLOD, mesh simplification at runtime (07 §3.4).
- Terrain streaming beyond one resident heightfield, erosion simulation, runtime sculpting, voxel/cave terrain.
- FFT ocean, rivers with flow-map authoring tools, foam particles (VFX lane), buoyancy physics beyond `heightAt/normalAt`.
- Procedural tree generation at runtime (L-system stays an offline input), seasonal growth.
- Editing routes, templates, skills, shared benchmarks or another lane's files (handled by §12.3 requests and C-40 facts).
- Any claim that Aura3D world rendering matches or beats three.js outside a G-PANEL round (§16.2).


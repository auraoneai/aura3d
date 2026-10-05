# 11 — Asset pipeline autopsy

Scope: `packages/assets`, `packages/asset-index`, `packages/aura3d-cli` (assets commands, Meshy import, pull-bridge scoring, release gates), `aura.assets.json`, `src/aura-assets.ts`, compression, mesh optimization, texture resizing, LOD, collision, HDRI handling. I also opened every model asset the showcase games use.

Method: I read the code (cited as path:line) and parsed every GLB the showcase routes reference. `/tmp` scratch scripts read each GLB's JSON chunk and PNG/JPEG/WebP/KTX2 headers. All 226 model entries in the root manifest were parsed. 120 distinct model ids are referenced as `assets.<id>` from `apps/showcase-*/src`. I did not run any browser, dev server, or build. "Referenced" means the id appears in route source. A few are behind flags (noted where it matters).

Compared against three.js r185 (`node_modules/three` is 0.185.1 in this repo).

---

## 0. Bottom line

The asset pipeline is a provenance and admission ledger. It is not a content pipeline. It records licence, hash, bounds, role, clips and orientation in great detail: 3.86 MB of JSON, about 9.5 KB per entry. It never transforms an asset to look better or ship better. Nothing compresses, resizes, bakes, generates LODs, generates tangents offline, retopologises or re-materials. There is no technical-art stage between "file admitted" and "file rendered".

The games' look is set by five asset-side facts that compound:

1. **Roughly half the game assets are programmer art.** 49 of the 120 referenced models are `aura3d-original` GLBs. Per-app Node scripts write them out of `addBox` / `addCylinderY` calls, with no UVs and no textures; flat `baseColorFactor` only. Typical counts: 12–600 triangles (mech parts 400–608, drones 108, backboard 12, display case 24). Another 14 "hero", "rival", "ledge" and "backdrop" assets are 4-triangle unlit quads carrying an AI-generated 2D PNG. These cardboard cut-outs are certified `quality: "release"`.
2. **Real PBR assets are neutered at render time.** Any `model(asset, { material: material.pbr({...}) })` turns off base-colour and metal-rough textures on every material in the GLB. It then paints one flat colour, one roughness and one metalness across all of them (`packages/engine/src/agent-api/index.ts:13567-13580`, `packages/engine/src/production-runtime/TypedGLBActor.ts:496-507`). `material.pbr()` always injects a colour (`index.ts:2416`), so any override triggers this. Games use it on 14-texture traffic cars, a 14-texture dock gate, parcels, pine trees, the product-configurator headphones and the Meshy aircraft.
3. **There is no IBL for almost every game.** If a scene has a `lights.ambient()` and no `environments.*` node, the production bridge sends `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0` (`index.ts:12693-12706`). 19 of the 23 game and demo routes with lights add an ambient light and no environment node. Their normal and metal-rough maps therefore get no reflections at all. Zero routes use `environments.hdri`. The repo has 4 HDRIs, all 1k, and none is wired to a game.
4. **The better-looking assets are policy-demoted.** Meshy imports are hard-blocked from `release` (`packages/aura3d-cli/src/meshy/import.ts:42`). Games then keep the Meshy model as a ghost, a candidate behind a URL flag, or a review-only variant. The live hero is a 2D card or a box assembly (skyline-runner, pulse-tunnel, neon-swarm).
5. **Nothing is optimized, so heavy assets are also raw.** Across 226 model assets there are 0 uses of `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu` or `KHR_mesh_quantization`, and 0 KTX2 or WebP textures. Meshy heroes are 15–28 MB GLBs with two 4096² JPEGs plus one 2048², which is about 200 MB of VRAM each with mips. The typed-GLB runtime path that games use cannot decode Draco or Meshopt anyway: no decoders are passed (`TypedGLBActor.ts:184-191`, `GLTFLoader.ts:1312`).

So the "Atari/early-Nintendo feel" is, on the asset side, mostly caused by:

- (C) a pipeline that admits flat-shaded primitive meshes and quads as "release";
- (B/A) renderer defaults that drop textures and IBL;
- (D/E) agents writing art as code because the gates reward provenance text over pixels.

The release gate's texture check can be waived with a magic phrase (§6.3).

---

## 1. Capability ladder

Ladder: exists / works / public API / used by apps / good defaults / composes / modern quality / agents know / examples show.

| Capability | Exists | Works | Public API | Used by games | Good defaults | Composes | Modern quality | Agents know | Examples | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Typed manifest + typegen (`aura.assets.json` → `src/aura-assets.ts`) | Y | Y | Y | Y (all) | N: one 3.78 MB / 129,724-line TS file for every app | partial | n/a | Y | Y | `src/aura-assets.ts`; `packages/aura3d-cli/src/cli.ts:183-185` |
| Provenance / licence tracking | Y | Y | Y | Y | Y | Y | n/a | Y | Y | `aura.assets.json` `provenance.*`; `scoring.ts:59-68` |
| Catalog search/resolve (asset-index) | Y | Y | Y | partly | N: ranks licence/metadata, not looks | — | N | Y | — | `packages/asset-index/src/ranking.ts:47-51`; `pull-bridge/scoring.ts:20-130` |
| Poly Haven (top CC0 PBR source) | adapter | deep-link only, models only | — | 0 | — | — | — | — | — | `adapters/poly-haven.ts:25-35` |
| Texture / HDRI catalog search | N | — | — | 0 | — | — | — | skill says "none" | — | `skills/aura3d-materials-environments/SKILL.md:9-10` |
| `assets add --type texture` (incl. HDR, KTX2) | Y | Y | Y | **0 texture assets in root manifest** (226 model + 178 audio) | — | — | — | Y | test fixture only | root manifest type counts |
| `environments.hdri()` | Y | claimed (post-mount swap) | Y | **0 routes / templates** | studio procedural fallback | ? | — | skill mentions | none | `index.ts:4180-4189`, `12647-12676` |
| Draco / Meshopt decode | Y (decoder adapters) | via explicit decoder only | low-level | **not wired into the typed-GLB path** | N | N | — | perf skill only | `loader-compression` app | `TypedGLBActor.ts:184-191`; `GLTFLoader.ts:1306-1312` |
| Draco / Meshopt **encode** | **N** | — | — | — | — | — | — | — | — | no CLI command; `cli.ts:54-228` |
| KTX2 decode | Y, loaders.gl from unpkg CDN at runtime | ? | low-level | 0 assets | etc2 default target; output tagged `"linear"` | — | — | perf skill | `loader-ktx2` app | `KTX2BasisTextureTranscoder.ts:22,30,49,63`; `GLTFRenderResources.ts:2222-2227` |
| KTX2 **encode** / texture resize | **N** | — | — | — | — | — | — | — | — | none |
| `KTX2LoaderThreeCompat` | stub returning a diagnostic | N | Y | 0 | — | — | — | — | — | `packages/assets/src/loaders/KTX2Loader.ts:3-6` |
| Mesh optimization | "optimizeIndexedMesh": removes unused vertices from JS arrays | trivially | exported | 0 call sites outside `index.ts` export | — | — | not a mesh optimizer | — | — | `packages/assets/src/MeshOptimization.ts:23-50` |
| Import preflight profiles (maxSize 2048, basis, targetTriangleCount 60k…) | report object only | **never executed** | exported | 0 | — | — | — | — | — | `packages/assets/src/AssetImportPreflight.ts:109-131` |
| LOD generation (simplification) | **N** (only `distanceLod` switching between authored nodes; `createDefaultPerformanceLodLevels` returns numbers) | — | — | `distanceLod` in 3 routes on primitives | — | — | — | — | — | `packages/rendering/src/performance/LOD.ts:13-20` |
| Collision generation from mesh | N (Rapier trimesh/convexHull only from caller-supplied vertices) | — | — | — | — | — | — | — | — | `physics-rapier/src/index.ts:555-557`; `PhysicsRuntime.ts:991-998` |
| Meshy import | Y | Y | Y | 8 assets in games | **candidate-only by law** | — | raw decimated soup | Y | — | `meshy/import.ts:42` |
| Meshy post-process (decimation) | ad-hoc Blender step, not in repo tooling | Y | — | Y | collapse decimation 1.93M→80k, no bake | — | N | — | — | `artifacts/meshy/courier-van-v2/DECIMATE.md` |
| Thumbnails | Y (`.thumb.svg`) | Y | Y | — | — | — | — | — | — | `cli.ts:186-187` |
| Release validation | Y | Y | Y | Y | gameable (§6.3) | — | — | Y | — | `packages/aura3d-cli/src/index.ts:3213-3382` |

Three.js r185, for comparison, ships `examples/jsm/libs/draco`, `libs/basis`, `meshopt_decoder.module.js`, `meshopt_simplifier.module.js` (runtime LOD generation) and `meshopt_clusterizer.module.js` locally (verified in `node_modules/three/examples/jsm/libs`). It also ships `RoomEnvironment` / `PMREMGenerator` as a one-liner neutral IBL, and its examples bake every showcase model through gltfpack / gltf-transform (Meshopt + KTX2). Aura3D has decode-side analogues for some of this. It has nothing on the authoring/optimization side, and the decode side is not reachable from the API the games use.

---

## 2. Inventory of the shipped asset set

### 2.1 Totals

| Metric | Value |
|---|---|
| Root manifest entries | 404: 226 `model`, 178 `audio`, **0 `texture`/`environment`** |
| Root manifest size | 3,864,055 bytes |
| `src/aura-assets.ts` | 3,782,497 bytes, 129,724 lines, imported by every showcase route (`apps/showcase-courier-rush/src/main.ts:27`, `apps/showcase-mech-hangar/src/main.ts:49`) |
| Asset metadata leaked into each route bundle | yes; e.g. `apps/showcase-courier-rush/dist/assets/index-BveQJRr1.js` (3.6 MB) contains 281 `suitabilityReason` and 78 `licenseRaw` strings, including other games' assets (`mechLegsD`, `gravityPlanetJupiter`, `deepRecoverySonarPingSfx`) |
| `public/aura-assets/` | 1,393 files, 1.7 GB (GLB 1,718 MB, PNG 45 MB, WAV 40 MB) |
| Orphan media in `public/aura-assets` (not referenced by manifest) | 529 files, 490 MB (stale hash versions) |
| Each app's `dist/aura-assets` | full copy of all 1.7 GB (checked `apps/showcase-courier-rush/dist/aura-assets`: 1,393 files, 1.7 G) |
| Total size of 226 model GLBs | 1,232 MB |
| Total size of the 120 game-referenced GLBs | 463 MB |
| Compression extensions used, all 226 | **0** Draco, **0** Meshopt, **0** quantization, **0** basisu |
| KTX2 / WebP textures in models | **0 / 0** |
| HDR/EXR in repo (non-dist) | 4 files, all 1k: `fixtures/environment-corpus/hdri/{studio_small_08,autumn_field_puresky,kloppenheim_06_puresky}_1k.hdr`, `fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr` |
| HDRIs used by any game/template | **0** |

Extensions actually present across all 226 models: `KHR_materials_unlit` 22, `clearcoat` 19, `specular` 17, `pbrSpecularGlossiness` 10 (legacy), `texture_transform` 6, `emissive_strength` 9, `transmission` 5, `animation_pointer` 1.

### 2.2 Source family of the 120 game-referenced models

| Family | Count | What it is |
|---|---:|---|
| `aura3d-original` (+1 "procedural world") | 50 | Per-app Node/Blender scripts emitting box/cylinder geometry, factor colours |
| (none) / CC0 "deterministic review-art" or Blender scripts | 19 | 14 are 4-tri unlit quads with AI-generated PNGs; the rest are Blender procedural kits with 32²–128² palette textures |
| objaverse (Sketchfab exports) | 32 | Mixed-quality community models; 1024² textures typical |
| meshy | 8 | Text-to-3D, Blender collapse-decimated to 48k–237k tris, 4096² JPEG |
| nasa-vtad | 5 | Planet spheres, 3,072–6,048 tris, up to 4096×3072 PNG |
| Sketchfab direct | 2 | Rooftop athletes (17 mats, 47 × 512² textures each; the two ids are byte-identical, 9,692 KB each) |
| Kenney starter | 3 | Low-poly CC0 kits (`showcaseKenneyVerdantPlatformerWorld` 16k tris, 0 textures; `showcaseRunnerGirl` 72 tris) |
| OpenGameArt | 1 | `showcaseCc0FormulaRaceCar` 5,464 tris, single 2000×1023 PNG |

Release-quality labels on these 120: `release` 97, `candidate` 20, ungraded/undefined 3. **Every primitive-built and 4-triangle-card asset is `release`. Every Meshy asset is `candidate`.**

So the answer to "are game assets low-poly Kenney/CC0 flat-coloured packs?" is "worse than that". Only 3 are Kenney. The dominant class is in-house programmer art written as JS vertex arrays: 54 of 120 referenced models have zero images. The next largest is uncurated Objaverse.

### 2.3 Per-route summary (referenced models)

Columns: models referenced, total MB, Σ triangles, Σ images, images at 4096, models with no textures, 4-tri cards.

| route | models | MB | Σ tris | images | 4096² | untextured | 4-tri cards |
|---|---:|---:|---:|---:|---:|---:|---:|
| aurora-lander | 4 | 3.4 | 534 | 2 | 0 | 2 | 2 |
| bank-shot | 3 | 1.0 | 12,030 | 0 | 0 | 3 | 0 |
| blockfall-reactor | 4 | 8.2 | 3,438 | 7 | 0 | 0 | 3 |
| cinematic-architecture | 3 | 26.3 | 367,758 | 21 | 0 | 0 | 0 |
| courier-rush | 7 | 31.5 | 119,934 | 42 | 0 | 0 | 0 |
| deep-recovery | 5 | 0.4 | 4,188 | 0 | 0 | 5 | 0 |
| digital-twin-ops | 1 | 21.3 | 704,582 | 1 | 0 | 0 | 0 |
| gallery-shift | 10 | 20.8 | 171,224 | 7 | 2 | 7 | 0 |
| gravity-post | 14 | 126.2 | 691,440 | 123 | 5 | 1 | 0 |
| mech-hangar | 17 | 28.4 | 106,863 | 3 | 2 | 16 | 0 |
| neon-swarm | 7 | 23.8 | 278,638 | 16 | 0 | 2 | 3 |
| patrol-wing | 4 | 19.9 | 60,304 | 3 | 2 | 3 | 0 |
| product-configurator | 1 | 1.6 | 3,688 | 4 | 0 | 0 | 0 |
| pulse-tunnel | 4 | 33.6 | 359,408 | 10 | 2 | 0 | 0 |
| rooftop-buckets | 10 | 45.4 | 183,144 | 99 | 2 | 5 | 0 |
| siege-golf | 5 | 8.2 | 82,326 | 6 | 0 | 2 | 0 |
| skyline-runner | 11 | 40.3 | 241,067 | 15 | 2 | 3 | 5 |
| smart-city-control | 1 | 2.0 | 792 | 4 | 0 | 0 | 0 |
| turbo-drift-circuit | 7 | 14.1 | 137,431 | 27 | 0 | 3 | 1 |
| vault-breakers | 5 | 0.8 | 9,050 | 0 | 0 | 5 | 0 |

The distribution is bimodal. Five games (bank-shot, deep-recovery, mech-hangar, vault-breakers, aurora-lander) ship under 1–3 MB of untextured boxes. Others (gravity-post 126 MB, rooftop 45 MB, skyline 40 MB) ship raw 4K Meshy or Sketchfab dumps. Nothing sits in the 2–10 MB, well-compressed, consistently textured band that a modern three.js game targets.

Primitive calls in route source sit on top of this: pulse-tunnel 105 `primitives.*(` call sites, deep-recovery 71, mech-hangar 45, courier-rush 45, blockfall 42, gravity-post 39, rooftop 37, siege-golf 35, neon-swarm 35, patrol-wing 31. Many are inside loops. Much of each frame is made of engine primitives, not assets.

### 2.4 Per-asset tables

Map columns: base / normal / metallic-roughness / emissive texture slots used across the asset's materials.

#### showcase-aurora-lander

| asset | KB | tris | mats | base/nrm/MR/emis | textures | anim/skin/morph | family : license | generator / ext |
|---|---:|---:|---:|---|---|---|---|---|
| auroraExtractionBayBackdrop | 2297 | 4 | 1 | 1/0/0/0 | 1x png 1586x992 | 0/0/0 | (none) : CC0-1.0 | Aura3D Aurora deterministic extraction-bay builder [unlit] |
| auroraExtractionLanderHero | 1010 | 4 | 1 | 1/0/0/0 | 1x png 984x918 | 0/0/0 | (none) : CC0-1.0 | Aura3D Aurora deterministic extraction-lander builder [unlit] |
| auroraLanderProbe | 41 | 460 | 4 | 0/0/0/0 | - | 0/0/0 | (none) : CC0-1.0 | showcase-aurora-lander build-models |
| auroraPadBeacon | 8 | 66 | 3 | 0/0/0/0 | - | 0/0/0 | (none) : CC0-1.0 | showcase-aurora-lander build-models |

#### showcase-bank-shot

| asset | KB | tris | mats | base/nrm/MR/emis | textures | anim/skin/morph | family : license | generator / ext |
|---|---:|---:|---:|---|---|---|---|---|
| bankShotBall00 | 149 | 1800 | 1 | 0/0/0/0 | - | 0/0/0 | aura3d-original : CC0 | build-models [clearcoat,specular] |
| bankShotCue | 16 | 170 | 3 | 0/0/0/0 | - | 0/0/0 | aura3d-original : CC0 | build-models |
| bankShotTable | 837 | 10060 | 14 | 0/0/0/0 | - | 0/0/0 | aura3d-original : CC0 | build-models [clearcoat,specular] |

A pool table with no felt texture, no wood grain, no normal map and no ball-number decals. Ball identity is factor colour only.

#### showcase-blockfall-reactor

| asset | KB | tris | mats | base/nrm/MR/emis | textures | anim/skin/morph | family : license | generator / ext |
|---|---:|---:|---:|---|---|---|---|---|
| blockfallReactorArenaBackdrop | 2382 | 4 | 1 | 1/0/0/0 | 1x png 1586x992 | 0/0/0 | (none) : CC0 | review-art builder [unlit] |
| blockfallReactorMechanicHero | 1999 | 4 | 1 | 1/0/0/0 | 1x png 1024x1536 | 0/0/0 | (none) : CC0 | review-art builder [unlit] |
| blockfallReactorPlasmaRival | 1652 | 4 | 1 | 1/0/0/0 | 1x png 1214x1295 | 0/0/0 | (none) : CC0 | review-art builder [unlit] |
| showcaseBlockfallCabinet | 1964 | 3426 | 1 | 1/1/1/1 | 4x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab-12.67.0 |

#### showcase-cinematic-architecture

| asset | KB | tris | mats | base/nrm/MR/emis | textures | anim/skin/morph | family : license | generator / ext |
|---|---:|---:|---:|---|---|---|---|---|
| showcaseCityVehicle | 1934 | 792 | 1 | 1/1/1/1 | 3x jpg 1024, 1x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab-12.66.0 |
| showcaseSkylineCity | 22859 | 350762 | 85 | 37/0/0/0 | 15 maps 256–1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab-12.67.0 |
| showcaseVoxelBuilding | 905 | 16204 | 1 | 1/0/0/1 | 2x png 256x1 (palette strip) | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab-12.67.0 |

The 350k-tri, 85-material city ships in one 22.9 MB uncompressed GLB, with no normal or roughness maps and 772 primitives.

#### showcase-courier-rush

| asset | KB | tris | mats | base/nrm/MR/emis | textures | anim/skin/morph | family : license | generator / ext |
|---|---:|---:|---:|---|---|---|---|---|
| courierParcel | 1141 | 216 | 1 | 1/1/1/0 | 3x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab |
| courierTrafficHatch | 3183 | 10101 | 3 | 2/2/2/0 | 6x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab |
| courierTrafficSedan | 8147 | 21556 | 8 | 7/4/3/0 | 12x png 1024, 2x png 512 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab |
| courierVan | 3871 | 6963 | 9 | 6/6/1/0 | 10x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab |
| courierVanMeshyV2Decimated | 9509 | 80000 | 1 | 1/1/1/0 | 3x jpg 2048 | 0/0/0 | meshy : paid terms | Blender I/O 5.2.40 |
| courierZoneAwning | 2943 | 466 | 1 | (specGloss) | 3x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab [pbrSpecularGlossiness] |
| courierZoneBollard | 1990 | 632 | 1 | 1/1/1/0 | 3x png 1024 | 0/0/0 | objaverse : CC-BY-4.0 | Sketchfab |

The route sets `material: material.pbr({ color: ... })` on the parcel (`apps/showcase-courier-rush/src/main.ts:363-368`), on both traffic cars (`main.ts:386-393`) and on the sedan in `city.ts:700-707`. Each of those 1024² PBR texture sets, 14 images on the sedan, is disabled at runtime (§3.1). The parcel and bollard have 216 and 632 tris carrying 3 × 1024² maps each, about 3 MB of texture data per box.

#### showcase-deep-recovery

| asset | KB | tris | mats | maps | textures | family | generator |
|---|---:|---:|---:|---|---|---|---|
| deepRecoveryBuoyBeacon | 40 | 456 | 3 | 0/0/0/0 | - | aura3d-original | Deep Recovery procedural GLB synth |
| deepRecoveryCrateHeavy | 22 | 240 | 3 | 0/0/0/0 | - | aura3d-original | same |
| deepRecoveryCrateStandard | 21 | 232 | 3 | 0/0/0/0 | - | aura3d-original | same |
| deepRecoverySub | 173 | 2068 | 5 | 0/0/0/0 | - | aura3d-original | same |
| deepRecoveryWreckHull | 101 | 1192 | 4 | 0/0/0/0 | - | aura3d-original | same |

The whole game ships 0.4 MB of geometry and no images. Six of its 8 `model()` calls also carry a `material:` override (`apps/showcase-deep-recovery/src/main.ts:343,367,388,395,402`, `environment.ts:22`).

#### showcase-digital-twin-ops

| asset | KB | tris | mats | maps | textures | anim | family |
|---|---:|---:|---:|---|---|---|---|
| showcaseRoboticWeldingWorkcell | 20824 | 704,582 | 76 | 1/0/0/0 | 1x jpg 256x128 | 1 | objaverse : CC-BY-4.0 |

That is 705k triangles and 76 factor-coloured materials with one 256×128 texture: CAD-level tessellation with no surface detail.

#### showcase-gallery-shift

| asset | KB | tris | mats | maps | textures | anim/skin/morph | family |
|---|---:|---:|---:|---|---|---|---|
| galleryShiftCutawayMuseumWorld | 1043 | 16776 | 14 | 0/0/0/0 | - | 0/0/0 | aura3d-original [emissive_strength] |
| galleryShiftDisplayCase | 4 | **24** | 2 | 0/0/0/0 | - | 0/0/0 | aura3d-original |
| galleryShiftExhibitA/B/C | 24/6/11 | 284/60/120 | 1 | 0/0/0/0 | - | 0/0/0 | aura3d-original |
| galleryShiftPedestal | 4 | 40 | 1 | 0/0/0/0 | - | 0/0/0 | aura3d-original |
| galleryThief | 14836 | 49,999 | 1 | 1/1/1/0 | 2x jpg 4096, 1x jpg 2048 | 0/0/0 | meshy |
| robotcand | 3810 | 100,612 | 7 | (specGloss) | 3x 256 | 0/0/0 | objaverse |
| showcaseExpressiveRobot | 453 | 3237 | 3 | 0/0/0/0 | - | 14/2/3 | aura3d-original (three.js RobotExpressive) |
| showcaseRunnerGirl | 111 | **72** | 1 | 1/0/0/0 | 1x png 1024 | 27/0/0 | Kenney [unlit] |

Fidelity in one route spans two orders of magnitude: a 50k-tri, 4K-textured Meshy thief stands next to 24-triangle display cases and a 72-triangle unlit runner.

#### showcase-gravity-post

| asset | KB | tris | mats | maps | textures | family |
|---|---:|---:|---:|---|---|---|
| courierParcel | 1141 | 216 | 1 | 1/1/1/0 | 3x 1024 | objaverse |
| gravityPlanetEarth/Jupiter/Mars/Mercury/Neptune | 12614/11210/3938/2977/571 | 3072–6048 | 1 | base(+nrm) | up to 4096x3072 PNG | nasa-vtad |
| gravityPostCourierSkiff | 956 | 14,096 | 10 | 9/0/0/0 | **9x png 32x32** | aura3d-original (Blender py) |
| gravityPostDockBeacon | 2978 | 15,182 | 5 | 1/3/1/0 | 4x 1024 | objaverse |
| gravityPostDockGate | 11199 | 29,000 | 5 | 5/5/5/0 | 14x 1024 | objaverse (**overridden flat `#b7f4ff`**, `main.ts:484-495`) |
| gravityPostFreightDistrict | 1848 | 26,916 | 9 | 9/0/0/0 | **9x png 32x32** | aura3d-original (Blender py) |
| gravityPostMailPod | 7880 | 42,810 | 2 | 2/2/2/2 | 8x 1024 | objaverse |
| gravityPostMeshyFreight | 21856 | 83,333 | 1 | 1/1/1/0 | 2x 4096, 1x 2048 | meshy |
| gravityPostStationRing | 43790 | 458,297 | 61 | 61/15/0/0 | 66 maps, 16²–1024² | objaverse (2,150 primitives) |
| neonCourierAvatar | 240 | 3,254 | 3 | 0/0/0/0 | - | objaverse [unlit] |

The route references 126 MB of GLB, including a 43.8 MB station ring with 2,150 primitives that is never batched offline. The player skiff and the freight district use 32×32 textures.

#### showcase-mech-hangar

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| mechArms{A–D} | 32 | 608 | 3 | none | aura3d-original "modular family synth" |
| mechChassis{A–D} | 23 | 400 | 4 | none | same |
| mechLegs{A–D} | 31 | 576 | 3 | none | same |
| mechWeapon{A–D} | 8–11 | 96–160 | 3 | none | same |
| mechHeroDecimated | 27308 | 99,999 | 1 | base/nrm/MR, 2x 4096 + 2048 | meshy |

Sixteen of the 17 assets are 96–608-triangle untextured boxes, and they are the "swappable" gameplay parts. The Meshy hero is mounted "just ahead of the root" so the box assembly wraps around it (`apps/showcase-mech-hangar/src/main.ts:209-225`). Coherence comes from one raw 27 MB Meshy mesh. The modular system is programmer art.

#### showcase-neon-swarm

| asset | KB | tris | mats | maps | textures | family |
|---|---:|---:|---:|---|---|---|
| mechWeaponA | 10 | 144 | 3 | none | - | aura3d-original |
| neonBarricadeProp | 2583 | 3,192 | 1 | 1/1/1/1 | 4x 1024 | objaverse |
| neonCourierAvatar | 240 | 3,254 | 3 | none | - | objaverse [unlit] |
| neonCrownMothElite | 926 | **4** | 1 | base | png 1134x975 | AI image card [unlit] |
| neonRainCourierHero | 1018 | **4** | 1 | base | png 1303x1207 | AI image card [unlit] |
| neonRainGardenArenaBackdrop | 2811 | **4** | 1 | base | png 1586x992 | AI image card [unlit] |
| neonStreetLampProp | 15615 | 272,036 | 15 | 6/5/5/0 | 9 maps | objaverse |

A 272k-triangle, 15.6 MB street lamp is set dressing in a "bounded draw contract" horde game.

#### showcase-patrol-wing

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| patrolAircraftMeshy | 19419 | 60,000 | 1 | 2x 4096 + 2048 | meshy |
| patrolWingDroneA/B | 12 | **108** | 4 | none | aura3d-original |
| patrolWingPadBeacon | 10 | 88 | 3 | none | aura3d-original |

The second Meshy aircraft instance gets a 0.32-opacity flat `#9fd8ff` "ghost shell" override (`apps/showcase-patrol-wing/src/main.ts:264-270`). The enemies are 108-triangle drones.

#### showcase-product-configurator / material-asset-inspector

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| showcaseHeadphones | 1552 | 3,688 | 1 | 1/1/1/1, 4x 1024 | objaverse |

The "product configurator" puts the hero product under `material: productMaterial` (`apps/showcase-product-configurator/src/main.ts:297-299`). Its base-colour and metal-rough maps are switched off and replaced with one flat swatch. A 3,688-tri headphone is the only product.

#### showcase-pulse-tunnel

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| pulseArena | 28597 | 237,500 | 1 | 2x 4096 + 2048 | meshy, **only with `?arena=candidate`** (`main.ts:63-64,369-372,1395`) |
| pulseReactorEncounterWorld | 2772 | 72,748 | 8 | 3x **128x128** | Blender procedural (v11 of `scripts/build-*.py`) |
| pulseRunnerCraft | 526 | 16,484 | 6 | 2x 128x128 | Blender procedural |
| pulseTerminalSentry | 943 | 32,676 | 6 | 2x 128x128 | Blender procedural |

The scripts directory holds 11 iterations of art generators (`build-models.py`, `build-structural-world-v3.py` … `build-encounter-finish-v11.py`). That is churn on code-authored geometry, not a technical-art loop.

#### showcase-rooftop-buckets

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| rooftopAthleteDefender / Shooter | 1890 / 961 | 15,432 | 9 | base only, 1x 1024 | objaverse |
| rooftopBackboard | 2 | **12** | 1 | none | aura3d-original |
| rooftopBall | 11 | 504 | 1 | none | aura3d-original (a basketball with no seams texture) |
| rooftopCourt | 871 | 10,900 | 10 | none | aura3d-original (`suitabilityReason`: "stylized flat-color material rationale is intentional") |
| rooftopDefender / rooftopLayupScorer | 9692 each (identical) | 44,612 | 17 | 17/13/17/0, 47x 512 | Sketchfab CC-BY, 4 clips, skinned |
| rooftopRim | 8 | 360 | 1 | none | aura3d-original |
| rooftopShooterMeshyV1 | 21091 | 50,000 | 1 | 2x 4096 + 2048 | meshy |
| rooftopVenueV2 | 107 | 1,280 | 6 | none | aura3d-original |

#### showcase-siege-golf

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| siegeGolfBall | 2113 | **76,800** | 1 | none | objaverse (76.8k tris for a golf ball, no texture) |
| siegeGolfCourseWorld | 338 | 4,032 | 9 | none | Aura3D procedural world |
| siegePlankSet | 1768 | **12** | 1 | base+nrm 1024 | objaverse |
| siegeWoodenBarrel | 1508 | 846 | 1 | base 1024 | objaverse |
| siegeWoodenCrate | 2321 | 636 | 1 | base/nrm/MR 1024 | objaverse |

A 4,032-triangle untextured golf course carries a 76,800-triangle untextured ball. "Painted" variants of crates and barrels are overridden flat (`main.ts:291-298`).

#### showcase-skyline-runner

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| propPineTree | 4515 | 44,884 | 5 | specGloss 4 maps | objaverse (overridden: `material: relayTreeMaterial`, `main.ts:378-381`) |
| propRockB | 2367 | 10,596 | 1 | 3x 1024 | objaverse |
| showcaseExpressiveRobot | 453 | 3,237 | 3 | none | three.js RobotExpressive |
| showcaseKenneyVerdantPlatformerWorld | 1293 | 16,060 | 11 | none | Kenney |
| showcaseTeaHouse | 6131 | 118,271 | 60 | none | objaverse [transmission] |
| **skylineArcticRunnerHero** (live player) | 1338 | **4** | 1 | png 1250x927 | AI image card, `release` |
| skylineHeroRunner (Meshy 3D runner) | 20269 | 47,999 | 1 | 2x 4096 + 2048 | meshy, used **only as ghost echo** with a 0.62-opacity flat cyan override (`main.ts:1553-1575`) |
| skylineIceLedge{Compact,Medium,Long} | 220–502 | **4** | 1 | 630–1461 px strips | AI image cards (platforms) |
| skylineWinterParallaxBackdrop | 1898 | 4 | 1 | png 1672x941 | AI image card |

The live player character of the platformer is a flat 4-triangle picture "posed procedurally by the renderer" (`main.ts:905-913`). The platforms are pictures too. This is literally a 2D sprite game drawn through a 3D renderer.

#### showcase-turbo-drift-circuit

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| showcaseCc0FormulaRaceCar | 243 | 5,464 | 1 | 1 base 2000x1023 | OpenGameArt (overridden flat `#8fd8ff`, `main.ts:3217-3226`) |
| showcaseCcByFormulaOpponent | 1732 | 31,176 | 13 | 3 base | objaverse |
| showcaseTsukubaCircuit | 4048 | 17,407 | 21 | 21 base (14 at 256²) | objaverse |
| turboAlpineVenueBackdrop | 2070 | 4 | 1 | png 1536x1024 | AI image card |
| turboCircuitEnvironmentV2 | 5024 | 75,504 | 28 | none | Blender procedural |
| turboFormulaCircuit | 346 | 4,112 | 9 | none | JS procedural (`suitabilityReason`: "intentionally untextured stylized flat-color") |
| turboHairpinVenueKit | 317 | 3,764 | 13 | none | JS procedural |

A racing game whose track has no asphalt texture, no normal map, and 4,112 triangles.

#### showcase-vault-breakers

| asset | KB | tris | mats | maps | family |
|---|---:|---:|---:|---|---|
| vaultBreakersBall | 80 | 960 | 1 | none | aura3d-original |
| vaultBreakersFlipper | 106 | 1,256 | 3 | none | aura3d-original |
| vaultBreakersMechanisms | 450 | 5,436 | 5 | none | aura3d-original |
| vaultBreakersTable | 89 | 1,012 | 8 | none | aura3d-original |
| vaultBreakersVaultDoor | 35 | 386 | 4 | none | aura3d-original |

The pinball game's whole art set is 0.8 MB of `addBox` output (`apps/showcase-vault-breakers/scripts/build-models.mjs:105-224`, e.g. `addBox(playfield, 0, -0.06, 0, 2.85, 0.06, 4.15)`).

### 2.5 Template starter assets (`packages/create-aura3d/templates/*/aura.assets.json`)

| template | asset | KB | tris | maps | notes |
|---|---|---:|---:|---|---|
| mini-game | showcaseKenneyOobiPlatformerHero | 203 | 1,096 | base 512 | Kenney, 25 clips |
| racing-starter | carModel | 349 | 8,494 | **none** | 7 factor materials |
| racing-starter | trackModel | 1603 | 24,493 | **none** | **100 materials**, no textures |
| fighting-game / character-controller | showcaseWalkAnimatedGirl | 3702 | 6,602 | 7 base + 7 normal | Sketchfab |
| fighting-game | showcaseRunnerRobot | 5371 | 20,780 | 6 base + 5 MR | Sketchfab |
| falling-blocks-starter | cabinetModel | 1964 | 3,426 | 1024 PBR | same Objaverse cabinet |
| product-viewer | product | 47 | 968 | **16 × 1×1 px PNG** | "A3D V3 asset fixture generator (compressed-product-glb)" |
| cinematic-scene | hero | 3685 | 15,452 | 5x 2048 | the best-configured asset in the set |
| animation-studio | luma / miko | ~1950 | ~37k | base 1024 | CC0 procedural mascots |
| animation-studio | moonGarden | 4 | 6 | none | "set anchor" |

Generated apps inherit this baseline. The product-viewer template, whose job is product beauty, starts from a 968-triangle mesh with 1×1-pixel textures. The racing template starts from an untextured 100-material track.

---

## 3. Render-time handling that destroys asset quality

These are engine paths (A/B) rather than pipeline code, but they decide whether asset work pays off, so they belong here.

### 3.1 `material` on `model()` strips the asset's textures (P0)

`packages/engine/src/agent-api/index.ts:13567-13580`:

```ts
...(node.material?.color ? {
  tint: {
    baseColor: colorToLinearRgba(node.material.color),
    replaceSurfaceTextures: true,
    ...
```

`packages/engine/src/production-runtime/TypedGLBActor.ts:496-507` applies the tint to every material in the GLB:

```ts
material.setParameter("u_baseColorFactor", color);
if (tint.replaceSurfaceTextures) {
  material.setParameter("u_baseColorTextureEnabled", 0);
  material.setParameter("u_metallicRoughnessTextureEnabled", 0);
}
...
const emissiveStrength = tint.emissiveStrength ?? 0.28;      // self-glow by default
material.setParameter("u_roughness", ... tint.roughness ?? 0.38);
material.setParameter("u_metallic",  ... tint.metallic ?? 0.16);
```

`material.pbr()` always supplies `color: "#d7dee8", roughness: 0.55` (`index.ts:2415-2417`). Any material override therefore:

- turns off base-colour and metal-rough maps on all materials;
- collapses multi-material assets (an 8-material sedan) to one colour;
- adds 0.28 emissive strength, with emissive defaulting to the base colour when the caller gives none. This flattens shading further.

There is no "tint multiply" mode, no per-material override, and no warning. Three.js agents expect `mesh.material.color` to multiply the map; here it deletes the map.

Game call sites (all verified to pass a colour): courier-rush `city.ts:700`, `main.ts:363`, `main.ts:386`; gravity-post `main.ts:484`; patrol-wing `main.ts:264`; turbo `main.ts:3217`; skyline `main.ts:378` and `1556`; siege-golf `main.ts:291,317` (painted variants); product-configurator `main.ts:297`; material-asset-inspector `main.ts:235`; deep-recovery 6 sites; aurora-lander `main.ts:763`; neon-swarm `main.ts:688`.

### 3.2 Ambient light turns IBL off (P0)

`index.ts:12693-12706`: with no `environment` node and any ambient light, lighting is `{ color, intensity, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }`, "without an implicit environment map".

| route | environment node | ambient light |
|---|---|---|
| cinematic-architecture, product-configurator, siege-golf, turbo-drift-circuit | yes | yes (env wins) |
| aurora-lander, bank-shot, blockfall, courier-rush, deep-recovery, digital-twin-ops, gallery-shift, gravity-post, mech-hangar, meshy-relic-pilot, neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, rooftop-buckets, skyline-runner, smart-city-control, vault-breakers, webgpu-particle-lab, asset-audition | **no** | **yes → no IBL** |

All 8 Meshy assets and most Objaverse PBR assets in the games render without any environment reflection. Metallic surfaces read as flat dark or flat grey. Normal maps only modulate the direct lights. This is the classic "untextured N64 plastic" look, whatever the asset quality. In three.js, by contrast, `scene.environment = pmrem.fromScene(new RoomEnvironment()).texture` is the canonical first line of every modern example.

### 3.3 The `environments.*` presets are procedural, not HDRIs

`environments.studio/productHero/nightCinematic/...` (`index.ts:4123-4165`) map to `createExternalParityEnvironmentLighting("studio"|"softbox"|"evening"|…)` (`index.ts:12640-12651`), a generated procedural map. `environments.hdri({ texture })` exists (`index.ts:4180-4189`). Per its own docstring, the first frames render "the honest studio procedural fallback" and the HDR chain swaps in after load. It has zero callers in `apps/`, `examples/` or `packages/create-aura3d/templates/`. The 4 repo HDRIs are 1k equirects (1.1–1.7 MB): fine for diffuse, too low for sharp specular on hero assets. three.js examples use 1k–2k Poly Haven HDRIs through `RGBELoader`/`HDRLoader` plus PMREM by default.

### 3.4 The typed-GLB path cannot load optimized assets

`createTypedGLBActor` calls `loadProductionGLTFRenderPipeline({ url, assetId, assetName, width, height, deduplicate… })` (`TypedGLBActor.ts:184-191`) and passes no `dracoDecoder`, `meshoptDecoder` or `imageDecoder`. `GLTFLoader.ts:1312` throws `"KHR_draco_mesh_compression requires a dracoDecoder"`. If an agent did run gltfpack or Draco on a game asset, `model(assets.x)` would fail. KTX2 goes through `decodeImageInBrowser → transcodeKTX2BasisTexture` (`GLTFRenderResources.ts:2222-2227`):

- It dynamically imports loaders.gl, falling back to `https://unpkg.com/@loaders.gl` (`KTX2BasisTextureTranscoder.ts:22`), a runtime third-party CDN dependency.
- It defaults to `targetFormat: "etc2-rgba8unorm"` (`:30`), which most desktop WebGL2 GPUs do not expose.
- It tags output `colorSpace: "linear"` (`:49,63`). Base-colour KTX2 may lose its sRGB decode unless the slot colour space overrides it. **PLAUSIBLE, not verified at runtime.**

### 3.5 No texture budget, no resize

Decoding uses `createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })` (`GLTFRenderResources.ts:2229-2237`) at full source resolution, with no clamp to device or role.

| Asset class | Texture set | VRAM (RGBA8 + mips) |
|---|---|---|
| Each Meshy hero | 2 × 4096² + 1 × 2048² | ≈ 2×89 + 22 ≈ **200 MB** |
| gravity-post | 5 × 4096² plus planets at 4096×3072 | **>500 MB** |
| courier-rush parcel | 3 × 1024² | ≈ 16 MB for a 216-triangle box |

The sampler sets `maxAnisotropy: 8` (`GLTFRenderResources.ts:2204,2211`), which is fine.

---

## 4. The pipeline: what it does vs. what a content pipeline does

### 4.1 CLI surface (`packages/aura3d-cli/src/cli.ts:54-228`)

`assets add | import-meshy | scan | bind-game-route-evidence | certify-game-geometry | inspect | validate | validate-game | validate-animation-studio | validate-animation | assemble-character | list | typegen | thumbnail | serve | search | resolve`.

Every verb either moves a file and records metadata, or validates and certifies. None changes geometry or pixels. There is no `optimize`, `compress`, `resize`, `lod`, `bake`, `collider`, `retopo`, `atlas`, `ktx2`, `draco`, `meshopt` or `hdri` verb. `assets add` copies the source to `public/aura-assets/<id>.<hash8>.glb` byte-for-byte (`courierVanMeshyV2Decimated` hash and size match `artifacts/meshy/courier-van-v2/model-decimated.glb`).

### 4.2 "Fake parity" library code

- `packages/assets/src/MeshOptimization.ts:23-50`, `optimizeIndexedMesh`: remaps indices to drop unreferenced vertices. It does no welding, no vertex-cache or overdraw optimization (meshoptimizer-style), no simplification and no quantization. Nothing outside the package index calls it.
- `packages/assets/src/AssetImportPreflight.ts:109-131` declares profiles (`web`: `maxSize: 2048, compression: "basis", targetTriangleCount: 60_000`; `mobile`: 1024/etc2/25k) and lists stages like `"texture-decode", "mesh-optimization"`. It returns a report object. No code applies those settings. It reads as an import pipeline but is a description of one.
- `packages/assets/src/loaders/KTX2Loader.ts:3-6`: `KTX2LoaderThreeCompat.load()` returns a diagnostic `{ decoderNeeds: ["basis-universal-transcoder"] }` and loads nothing.
- `packages/rendering/src/performance/LOD.ts:13-20`: `createDefaultPerformanceLodLevels` returns `{id, maxDistance, triangleBudget}` numbers. No mesh is ever produced at those budgets.
- The Meshy admission budgets in the skill (prop 100k tris / 8 textures / 4096 px; environment 500k / 16 / 8192; `skills/meshy-cli/SKILL.md:58-66`) are ceilings that permit 4K. Nothing pushes toward a web-appropriate target.

### 4.3 Catalog ranking optimizes provenance, not looks

`packages/asset-index/src/ranking.ts:47-51` scores title, tag and description keyword hits (+5/+3/+1) plus catalog signals. `pull-bridge/scoring.ts`:

| bucket | max points | content |
|---|---|---|
| sourceQuality | 22 | source page +6, download URL +5, author +4, family +3, retrievedAt +2, raw metadata +2 |
| license | 17 | verified redistributable +10, name +3, URL +4 |
| inspection | ~25 | bounds +6, tris>0 +3, meshCount>0 +3, materialCount>0 **+4**, textureCount>0 **+4**, clips/skins/morphs +5 |
| roleFit | 15 | |
| penalties | | licence −20, duplicate −40, missing texture **−6** |

Visual quality enters only as "has ≥1 material" and "has ≥1 texture". Nothing scores PBR completeness (normal/ORM present), texel density, triangle appropriateness, art-style consistency with the other assets in the scene, or a rendered beauty check. A missing licence URL costs as much as having no textures at all.

Poly Haven, the best CC0 PBR model, texture and HDRI library, is `deep-link-only`, and its adapter only queries `?t=models` (`adapters/poly-haven.ts:25-35`). There is no texture or HDRI adapter at all (`skills/aura3d-materials-environments/SKILL.md:9-10`). In practice the auto-pullable pool is Objaverse/Sketchfab mirror content, so 32 of the game assets are uncurated Objaverse: 76.8k-tri golf balls, 272k-tri lamps, 705k-tri CAD workcells, 12-triangle plank sets.

### 4.4 Meshy path

1. Text-to-3D refine produces ~1.9M triangles at 2048 or 4096 (`artifacts/meshy/courier-van-v2/model.glb`: 79.3 MB, 1,935,042 tris, 3 × 2048 JPEG).
2. A one-off headless Blender COLLAPSE decimate to a fixed tri target runs outside the CLI (`artifacts/meshy/courier-van-v2/DECIMATE.md`: "target 80000 tris"). There is no retopology, no high-to-low normal bake, no UV repack and no AO bake. Collapse-decimation of triangle soup leaves faceted silhouettes and smeared UV islands.
3. `assets import-meshy` refuses `--quality release` (`meshy/import.ts:42`).
4. Result: a single material, `doubleSided: true`, no occlusion texture, no emissive, no TANGENT attribute (checked for courierVanMeshyV2Decimated, mechHeroDecimated, skylineHeroRunner, galleryThief, pulseArena), and 10–28 MB uncompressed.

The pipeline never makes Meshy output web-grade, and its policy keeps Meshy output out of release roles. So routes keep it as ghosts, review-only variants or flag-gated candidates, and the live game uses boxes or cards.

### 4.5 In-repo art generators (agent-authored art as code)

| route | generator | NORMAL | TEXCOORD | images |
|---|---|---|---|---|
| aurora-lander, bank-shot, deep-recovery, gallery-shift, mech-hangar, patrol-wing, rooftop-buckets, vault-breakers | `scripts/build-models.mjs` (346–796 lines each) | yes | **no** | none |
| blockfall-reactor, neon-swarm, aurora, skyline, turbo | `build-review-art.mjs` etc.: 4-tri quad + PNG | no | yes | 1 AI PNG |
| gravity-post, pulse-tunnel, rooftop, turbo | Blender `*.py` (up to 11 versions) | Blender | Blender | 32²–128² palette swatches |

The JS builders emit no UVs. These meshes therefore cannot take a detail texture, decal, normal map or lightmap later without re-authoring. Their look is capped at flat factor colour by construction.

The AI cards come from OpenAI image generation (`apps/showcase-neon-swarm/assets/neon-rain-courier.prompt.md`: "Generator: OpenAI image generation … License: CC0-1.0"). The prompt asks for "stylized low-poly 3D PBR-like materials" painted into a 2D image. Separately, licensing AI-image output as CC0 with `"rights"` evidence being a prompt file is a provenance question the ledger does not flag.

The `aura3d-assets` skill says "Do not model the subject from primitives" (`skills/aura3d-assets/SKILL.md:109`). The repo's own showcase routes break that rule 49 times, and the gates certify the result as `release`.

---

## 5. Evidence and review-mode divergence (G)

`?capture=review` switches asset sets in 15 routes. Counts are `visualReviewCapture` references in `main.ts`: pulse-tunnel 85, gravity-post 75, rooftop 54, neon-swarm 53, skyline 51, blockfall 34, aurora 29, deep-recovery 23, bank-shot 22, gallery-shift 19, patrol-wing 18, courier-rush 17, siege-golf 16, mech-hangar 6, vault-breakers 5. Examples:

- neon-swarm `main.ts:176-188`: `compactDefaultComposition = !visualReviewCapture`. "The full dressing remains available to the dedicated art/provenance mode." At `main.ts:688` review mode shows the painted AI hero card. Normal play shows `neonCourierAvatar`, a 3,254-tri untextured unlit Objaverse mesh with a flat `#214f68` override.
- gallery-shift `main.ts:1067`: ambient 0.06 in review vs 0.38 in play.
- bank-shot `main.ts:351`: ambient 0.1 vs 0.24.

Screenshots and visual-QA evidence taken in review mode do not show what players get. Asset-quality evidence is therefore systematically optimistic.

---

## 6. Release gates: correctness over pixels

### 6.1 What release certification checks

From `packages/aura3d-cli/src/index.ts:3213-3260` (`createRoleAwareReleaseQualityWarnings`) and `:701-760` (`retainedGameSubjectCertificationBlockers`):

- role declared; bounds valid, not tiny, not huge;
- `suitabilityReason` text present and role-specific;
- materials readable; texture evidence (with an exception, §6.3);
- orientation evidence;
- rendered probe PNG present, hash-fresh, with `nonBlankPixels` and `colorBuckets` matching; foreground bounds inside the image.

Every check is about identity, freshness, non-blankness and metadata. No check asks: does it have normal or ORM maps; is texel density adequate at the gameplay camera; is the triangle count proportionate to screen size; does it match the art direction of the other assets; is it lit by IBL; how does it compare to a reference.

### 6.2 The probe is about readability, not beauty

`nonBlankPixels` / `colorBuckets` reward a large, well-lit silhouette. The code comment admits it: "A 792-triangle body shell with no wheels modelled passes all of them" (`index.ts:742-748`). Role-admission blockers were bolted on afterwards for wheels and similar parts. They are still structure checks, not quality checks.

### 6.3 The magic-phrase bypass (P0)

`packages/aura3d-cli/src/index.ts:3376-3381`:

```ts
function requiresTextureEvidence(role, suitabilityReason) {
  if (role === "debug" || role === "abstract") return false;
  if (/\b(stylized|stylised|flat[-\s]?color|flat[-\s]?colour|untextured|procedural material|clay render|solid material)\b/i.test(suitabilityReason)) {
    return false;
  }
  ...
```

Writing "stylized flat-color" in a free-text field waives the texture requirement for characters, vehicles, tracks, worlds and products. Shipped examples:

- `vaultBreakersTable`: "Original CC0 readable stylized flat-color pinball-table prop…"
- `deepRecoverySub`: "Original CC0 stylized flat-color primary vehicle…"
- `patrolWingDroneA`: "Original CC0 stylized flat-color heavy pursuit-drone vehicle…"
- `rooftopCourt`: "The stylized flat-color material rationale is intentional…"
- `turboFormulaCircuit`: "Its intentionally untextured stylized flat-color material palette…"
- `mechChassisA`: "Its intentionally untextured…"
- `skylineArcticRunnerHero`: a 4-triangle card, `quality: "release"`, `role: "character"`: "renderer-owned low-poly arctic relay runner character card…"

Agents learned that the cheapest way to green is to say "stylized". That is how a ledger focused on correctness produces Atari-era art.

### 6.4 Meshy is barred from release

`meshy/import.ts:42`: "Meshy imports cannot certify release quality." It has no promotion path in the CLI except "independent human review" (`meshy/admission.ts:130-135`). Combined with §6.3, an agent can certify a 4-triangle card in minutes but can never certify a 50k-triangle textured model. The incentive gradient points directly away from visual quality.

---

## 7. Comparison: three.js r185 practice vs Aura3D

| Concern | three.js r185 examples / ecosystem | Aura3D |
|---|---|---|
| Geometry compression | Draco + Meshopt decoders in `examples/jsm/libs`; showcase models shipped gltfpack/Meshopt; `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)` one line | decoders exist but are not reachable from `model()`; 0 compressed assets; no encoder |
| Texture compression | `KTX2Loader` + bundled basis transcoder; gltf-transform `etc1s/uastc` | transcoder via unpkg CDN; 0 KTX2 assets; no encoder; stub `KTX2LoaderThreeCompat` |
| Texture size policy | authored per asset (1k–2k typical for web) | raw 4096 Meshy JPEGs and 1024 PNGs on 216-tri boxes; no resize |
| LOD | `meshopt_simplifier` at runtime, `THREE.LOD`, offline gltfpack `-si` | `distanceLod` switches authored nodes; no simplification |
| Environment | `RoomEnvironment` + PMREM as a one-liner; `HDRLoader` with Poly Haven 1–2k | 4 HDRIs, unused; ambient light disables IBL; procedural presets |
| Material override | `material.color` multiplies `map` | colour override **disables** maps, flattens all materials |
| Asset curation | human-picked showcase assets (DamagedHelmet, Soldier, LittlestTokyo, Flamingo) | keyword + licence ranking over Objaverse; agent-coded boxes; AI image cards |
| Tangents | glTF tangents or derivative TBN | Meshy imports lack TANGENT; runtime path not verified here (renderer audit) |

---

## 8. Findings (ranked)

| # | Sev | Bucket | Finding | Evidence |
|---|---|---|---|---|
| 1 | P0 | B | Colour override on `model()` disables GLB base and MR textures on every material and adds 0.28 self-emission | `agent-api/index.ts:13567-13580`, `TypedGLBActor.ts:496-507`, `index.ts:2416`; 15+ game call sites |
| 2 | P0 | B/A | Ambient light without an environment node sets env-map intensity to 0, so 19 routes have no IBL | `index.ts:12693-12706` |
| 3 | P0 | C/E | Release gate waives texture evidence when `suitabilityReason` says "stylized/flat-color/untextured"; 49 code-built untextured assets and 14 4-tri cards are `release` | `aura3d-cli/src/index.ts:3376-3381`; manifest `quality` |
| 4 | P0 | D/E | Game art is authored as JS vertex arrays without UVs (8 routes) or as AI-image quads (5 routes), against the skill's own "do not model from primitives" rule | `apps/*/scripts/build-models.mjs`, `build-review-art.mjs:21-60`; `skills/aura3d-assets/SKILL.md:109` |
| 5 | P0 | C | No optimization stage: 0 Draco/Meshopt/KTX2/quantized assets; no CLI verb; preflight and mesh-optimization code is descriptive only | `cli.ts:54-228`; `AssetImportPreflight.ts:109-131`; `MeshOptimization.ts:23-50` |
| 6 | P1 | C/F | Meshy is candidate-only by policy; the best assets become ghosts or flag-gated variants | `meshy/import.ts:42`; `skyline main.ts:1553`; `pulse-tunnel main.ts:63,1395` |
| 7 | P1 | A/C | Typed-GLB loader passes no Draco/Meshopt decoder; KTX2 transcoder pulls from unpkg, etc2 default, "linear" tag | `TypedGLBActor.ts:184-191`; `GLTFLoader.ts:1312`; `KTX2BasisTextureTranscoder.ts:22,30,49,63` |
| 8 | P1 | C | No HDRI management: 4 × 1k HDRIs in fixtures, 0 HDRI texture assets, 0 `environments.hdri` callers; Poly Haven adapter is models-only, deep-link | `index.ts:4180`; `adapters/poly-haven.ts:25-35` |
| 9 | P1 | C | Ranking rewards provenance and licence metadata over visual signals; Objaverse dominates the auto-pull pool | `pull-bridge/scoring.ts:36-119`; `ranking.ts:47-51` |
| 10 | P1 | C | Meshy post-processing is an ad-hoc Blender collapse decimate (1.93M→80k) with no bake, retopo, AO or tangents; 15–28 MB, ~200 MB VRAM per hero | `artifacts/meshy/*/DECIMATE.md`; GLB parse |
| 11 | P1 | G | `?capture=review` swaps art, lighting and composition in 15 routes, so evidence screenshots do not represent gameplay | `neon-swarm main.ts:176-188,688` etc. |
| 12 | P1 | D | Art-direction incoherence inside routes: 24-tri cases next to a 50k-tri thief, a 76.8k-tri ball on a 4k-tri course, 108-tri drones next to a 60k-tri aircraft | §2.4 tables |
| 13 | P2 | F | Monolithic 3.78 MB typed asset module and 3.86 MB manifest bundled into every route (licence and suitability text in the JS) | `src/aura-assets.ts`; `dist/assets/index-*.js` |
| 14 | P2 | F | Every app `dist` copies all 1.7 GB of `public/aura-assets` including 529 orphaned files (490 MB) | `public/aura-assets` listing |
| 15 | P2 | C | Template starter assets are weak (1×1 px product textures, 100-material untextured racing track) | §2.5 |
| 16 | P2 | C | No LOD generation or mesh-derived collider generation | `performance/LOD.ts:13-20`; `PhysicsRuntime.ts:991-998` |

---

## 9. Recommendations

1. **Fix the two render-path killers first.** They are cheap and change pixels in every game.
   - Make `model(..., { material })` default to multiply-tint, preserving maps. Require an explicit `replaceTextures: true` to strip them, apply per material, and drop the implicit 0.28 emissive.
   - Never zero IBL because an ambient light exists. Default every scene to a neutral PMREM'd room or studio environment, the `RoomEnvironment` equivalent, and treat ambient as additive.
2. **Add a real technical-art stage: `aura3d assets optimize`.** Wrap gltf-transform/gltfpack as a pinned dev dependency, run on CI or a remote worker. Per role profile it would:
   - weld, dedupe and prune;
   - quantize and Meshopt-encode;
   - resize textures (hero 2048, prop 1024, background 512);
   - KTX2 encode (UASTC for normal/ORM, ETC1S for base colour);
   - generate tangents (MikkTSpace);
   - generate LOD chains (simplify 50%/20%);
   - generate convex or decomposed colliders;
   - record outputs in the manifest as derived artifacts of the source hash.
   Then wire `MeshoptDecoder`, `DRACO` and a locally bundled basis transcoder (no unpkg) into `createTypedGLBActor`. Delete or implement `AssetImportPreflight`, `MeshOptimization` and `KTX2LoaderThreeCompat`.
3. **Make looks a gate.** Replace the "stylized" regex waiver. Release for character, vehicle, world, track and product roles should need:
   - UVs plus base, normal and ORM maps, or an explicit art-direction document shared across the whole route;
   - texel density within range at the gameplay camera;
   - triangle count within a band for the role's screen coverage;
   - a probe rendered **with IBL**, compared against a reference image by a VLM or human rubric.
   Ban 4-triangle cards in `character` and `world` roles.
4. **Give Meshy (and other generated assets) a promotion path.** Add retopo/remesh to about 15–30k with a normal and AO bake from the high-poly mesh, a texture downsize, then the same gates as everything else. Remove the hard `release` ban in `import.ts:42`, or replace it with "requires optimize + art review".
5. **HDRI and texture sourcing.** Add Poly Haven HDRI and texture adapters that pull specific 1k/2k files rather than deep-links. Admit a small curated set of 4–6 HDRIs at 2k plus PBR texture sets (asphalt, concrete, metal, wood, fabric) into the root manifest. Make `environments.hdri` the template default.
6. **Curate instead of keyword-ranking.** Build a vetted, art-direction-coherent asset library per genre and pick one style family per game. Rank by PBR completeness, texel density, triangle appropriateness and rendered quality. Keep licence as a filter, not as score.
7. **Stop authoring art in code.** Restrict JS/Blender-script geometry to `debug` or gameplay-proxy roles that can never be `release`. Move the existing `build-models.mjs` outputs to proxy status and replace them with curated or optimized assets.
8. **Evidence honesty.** Remove `visualReviewCapture` asset and lighting forks, or make review mode render exactly the default route. Capture evidence from the default path only.
9. **Packaging hygiene.** Generate per-route typed asset modules containing url, hash and bounds only; keep licence and suitability text out of bundles. Deploy only the assets each route references. Prune the 529 orphans.

---

## 10. What to keep

- The provenance ledger itself: licence, author, source page, retrievedAt, hashes and rights evidence for Meshy. Keep it as a filter and record, not as the ranking objective.
- Content-hashed output paths and typed `assets.<key>` references. They are good for cache-busting and agent determinism.
- `assets inspect`: it extracts bounds, clips, skeleton, morphs and orientation correctly and is useful input to an optimize stage.
- The glTF loader's breadth: clearcoat, specular, transmission, specGloss conversion, animation pointer, and texture slots including anisotropy. The asset side can feed it.
- Decoder adapters (`GLTFCompressionDecoders.ts`) and the KTX2 transcoder skeleton. Wire them in properly.
- Rapier trimesh/convexHull support, as the target of a collider-generation step.
- The `distanceLod` node, as the consumer of generated LOD chains.

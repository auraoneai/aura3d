# PRD 05 — Asset Pipeline + Technical-Art Toolchain

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit` @ `c08d8acb`.
Status: proposed, parallelized against `CONTRACTS.md` (lane 05, flag `A3D_QR_ASSETS`, sub-flags `_LOD`,
`_DECODERS`). Owner area (exact list in "Parallel execution", matching CONTRACTS §4.1 row **05**):
`packages/aura3d-cli` (default: assets verbs, release gates, Meshy import), `packages/assets` (default: loaders,
decoders, preflight, mesh optimization, `gltf/ImageDecode.ts`), `packages/asset-index`, `packages/physics-rapier`
(except `HeightfieldLayout.ts`), `packages/rendering/src/webgl2/TextureFormats.ts`, `performance/LOD.ts`,
`shaders/{lod-dither,debug-view}.glsl.ts`, `packages/engine/src/agent-api/AssetDecoders.ts`,
`production-runtime/LodSelector.ts`, `production-runtime/actor/TypedGLBActorLod.ts`, new `tools/asset-optimize/`,
`apps/{asset-lookdev,loader-ktx2}/`, `assets/` (default), root `aura.assets.json` / `aura.library.json` /
`src/aura-assets.ts` / `public/{aura-assets,aura-decoders}/`.
Provides contracts **C-16** (compressed textures + decoder registry) and **C-17** (asset manifest 1.1 /
AssetOptimize / admission). Every other lane is reached only through contracts (§12) or non-blocking
`qr-request` issues (§12.3); no task in this PRD waits on another lane.

Evidence base: research `11-asset-pipeline.md` (primary; every GLB the games reference was parsed there),
`03-pbr-materials-gltf.md` §5–6 (KTX2 colour space, tangents, decoders), `09-animation-characters.md` §6–7
(character assets), `17-games-g1..g5.md`, `18-completeness-critic.md` Q8, `19-claim-verification.md` C3 and C19
(corrected counts used below), `20-game-scorecards-code-pixelstats.md` (non-visual: loading_transitions,
performance), `21-game-vision-judgment.md` (authoritative for `modeling_assets` and art coherence),
`22-benchmark-pass1-code-metrics.md`, `23-benchmark-vision-judgment.md` (authoritative same-scene comparison),
capture report `evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, ANGLE Metal paravirtual GPU).

Rule for this PRD: provenance, hashes, non-blank probes and "release" labels are not quality. An asset is
release-grade only when a rendered look-dev turntable under a standard HDRI, captured on the remote GPU lane,
is judged competitive by a human or vision model, and the measured texel density, triangle budget, PBR
completeness and byte/VRAM budgets pass. The final gate is the shipped game frame, not the asset ledger.

---

## 1. Problem statement

Aura3D's asset pipeline is a provenance ledger, not a content pipeline. It records licence, hash, bounds, role,
clips and orientation (3.86 MB of manifest JSON, ~9.5 KB per entry) and never transforms an asset to look or
ship better (research 11 §0). There is no technical-art stage between "file admitted" and "file rendered":
no compression, no texture resize, no KTX2, no tangents, no LOD, no collider generation, no bake, no look-dev.

The consequence is a content ceiling that no renderer fix can lift:

- Vision judgment of the 18 shipped games scores `modeling_assets` between 1 and 4 in every game
  (research 21: Orbital Defense 1, Vault Breakers 2, Deep Recovery 2.5, Bank Shot / Blockfall / Gallery Shift /
  Gravity Post / Neon Swarm / Pulse Tunnel / Rooftop / Siege Golf 3, Mech Hangar / Turbo 3.5, Aura Clash /
  Aurora / Courier / Patrol Wing / Skyline 4). "Weak assets" is estimated at 8–35 % of each game's visual deficit.
- In the same-scene benchmark, the only scene where Aura3D comes close to three.js r185 is the one with a
  professionally authored asset: `03-damaged-helmet` Aura 6.5 vs three 7.0 (research 23 lines 197-198). Every
  scene built from programmer-art content caps *both* engines at 4.5–5.5 (`01`, `10`, `11`, `17`, `18`;
  research 23 lines 60, 644, 709, 1064, 1125: "the scene content caps the ceiling").
- Where a game does contain a good asset, the judge says so and the pipeline buries it: the Meshy mech hero
  is "decent (~6)" but "buried in untextured cube clusters (~1.5)" (21 line 992); the Patrol Wing Meshy plane
  is "credible, detailed (~7)" while "everything else is primitive boxes" (21 line 1294).

The asset set itself is bimodal (research 11 §2.3): five games ship 0.4–3 MB of untextured boxes; others ship
126 MB (Gravity Post), 45 MB (Rooftop), 40 MB (Skyline) of raw 4K Meshy and Sketchfab dumps. The 120 model ids
the games reference total **463 MB of uncompressed GLB** with **0** Draco, **0** Meshopt, **0** quantized and
**0** KTX2/WebP textures (11 §2.1). Gravity Post takes 46.8 MB and ~9.9 s to ready "mostly textures for
dot-sized objects" (20 line 2015); Mech Hangar loads 28.5 MB before ready, 27 MB of it one hero (20 line 201).

The release gate rewards this. A free-text phrase ("stylized flat-color") waives texture requirements
(`packages/aura3d-cli/src/index.ts:3376-3382`), 13 of 131 release models are 4-triangle unlit image cards and
71 of 131 contain no images (19 C19), while Meshy imports — the best-looking 3D the games have — are
hard-blocked from `release` (`packages/aura3d-cli/src/meshy/import.ts:42`). The incentive gradient points away
from visual quality: an agent can certify a 4-triangle card in minutes and can never certify a 50k-triangle
textured model.

This PRD builds the missing technical-art stage (`aura3d assets optimize`), replaces provenance-only admission
with visual-quality admission, opens a quality-reviewed promotion path for generated assets, establishes a
curated per-genre hero library with HDRIs, adds a look-dev viewer with a standard HDRI turntable, wires the
decoders the optimized files need into the path games actually use, and sets byte/VRAM/triangle budgets.

---

## 2. Evidence from current code

### 2.1 No transform stage exists

| # | Fact | Evidence |
|---|---|---|
| E1 | CLI `assets` verbs are `add, import-meshy, scan, bind-game-route-evidence, certify-game-geometry, inspect, validate, validate-game, validate-animation-studio, validate-animation, assemble-character, list, typegen, thumbnail, serve, search, resolve`. None changes geometry or pixels; no `optimize/compress/resize/lod/bake/collider/ktx2/hdri` verb. | `packages/aura3d-cli/src/cli.ts:54-228` |
| E2 | `assets add` copies the source byte-for-byte to `public/aura-assets/<id>.<hash8>.glb`. | research 11 §4.1 (hash of `courierVanMeshyV2Decimated` equals `artifacts/meshy/courier-van-v2/model-decimated.glb`) |
| E3 | `optimizeIndexedMesh` only drops unreferenced vertices; no weld, no vertex-cache/overdraw optimization, no simplification, no quantization; no caller outside the package index. | `packages/assets/src/MeshOptimization.ts:23-50` |
| E4 | `AssetImportPreflight` declares `web` (maxSize 2048, basis, 60k tris), `mobile` (1024, etc2, 25k), `balanced` (2048, bc3, 100k) profiles and stage names (`"texture-decode", "mesh-optimization"`) but only returns a report object; nothing executes the settings. | `packages/assets/src/AssetImportPreflight.ts:109-131, 134-146` |
| E5 | `KTX2LoaderThreeCompat.load()` returns a diagnostic and loads nothing. | `packages/assets/src/loaders/KTX2Loader.ts:3-6` |
| E6 | `createDefaultPerformanceLodLevels` returns `{id, maxDistance, triangleBudget}` numbers; no mesh is ever produced at those budgets. `distanceLod` switches authored primitives/custom geometry only (`AuraRootLodLevelSpec` has `primitive`/`geometry`, no asset). | `packages/rendering/src/performance/LOD.ts:13-20`; `packages/engine/src/agent-api/index.ts:1275-1281, 2348` |
| E7 | Collision from mesh exists only when the caller supplies vertices (`ColliderDesc.trimesh` / `convexHull`). | `packages/physics-rapier/src/index.ts:555-557` |
| E8 | `meshoptimizer@1.2.0` (exact) and `draco3d@^1.5.7` (caret range, not exact-pinned) are already root devDependencies but used by nothing in the asset path; three is `0.185.1`. three r185 in `node_modules` ships `meshopt_decoder.module.js` (29,256 B), `meshopt_simplifier.module.js` (55,177 B), `meshopt_clusterizer.module.js`, `mikktspace.module.js` (48,841 B), `basis/basis_transcoder.wasm` (527,333 B) + `basis_transcoder.js` (57,529 B) and `draco/`. `@gltf-transform/*` and `sharp` are **not** installed. | `package.json:731,734,739`; `node_modules/three/examples/jsm/libs/` |

### 2.2 The path games use cannot load optimized files

| # | Fact | Evidence |
|---|---|---|
| E9 | `createTypedGLBActor` calls `loadProductionGLTFRenderPipeline({ url, assetId, assetName, width, height, deduplicate… })` and passes no `dracoDecoder`, `meshoptDecoder` or `imageDecoder`, although the pipeline options accept all three. | `packages/engine/src/production-runtime/TypedGLBActor.ts:183-191`; `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts:6-25` |
| E10 | Any Draco primitive throws `"KHR_draco_mesh_compression requires a dracoDecoder"`; Meshopt buffer views need an injected decoder. | `packages/assets/src/GLTFLoader.ts:807, 832, 1306-1312`; `GLTFExtensionSupport.ts:46` |
| E11 | `ensureAssetDecoders` is a thin wrapper; the behaviour lives in `ensureCompressedTextureSupport`, which defaults draco/meshopt **off** (`request.draco ?? false`), their probes to `async () => false`, and the KTX2 target to `"etc2-rgba8unorm"`. Nothing in the engine calls it with real probes. | `packages/engine/src/agent-api/AssetDecoders.ts:10-25`; `packages/assets/src/KTX2BasisTextureTranscoder.ts:277-293` |
| E12 | KTX2 transcoding dynamically imports loaders.gl with a runtime fallback to `https://unpkg.com/@loaders.gl`, defaults `targetFormat: "etc2-rgba8unorm"` (not exposed by most Windows/Linux desktop WebGL2 GPUs; Apple Silicon does expose ETC2), transcodes twice (target + RGBA8 fallback) unless the caller passes `includeFallback: false` (no engine caller does), and tags every output `colorSpace: "linear"`. | `packages/assets/src/KTX2BasisTextureTranscoder.ts:22, 30, 39, 49, 55-57, 63` |
| E13 | `TextureCompressedFormat` has only 4 members (`bc1-rgba-unorm`, `bc3-rgba-unorm`, `etc2-rgba8unorm`, `astc-4x4-rgba-unorm`); WebGL2 maps them to non-sRGB internal formats only (`COMPRESSED_RGBA_S3TC_DXT1/DXT5_EXT`, `COMPRESSED_RGBA_ASTC_4x4_KHR`, and a hard-coded `0x9278` = `COMPRESSED_RGBA8_ETC2_EAC` uploaded **without** querying `WEBGL_compressed_texture_etc`). No BC7, no ETC2 RGB8, no sRGB variants. KTX2 base colour would sample as linear (washed out) on GPUs that accept the upload. RGBA8 uploads do honour `colorSpace` (`SRGB8_ALPHA8`, `:4067`). `WebGPUDevice.ts` has **no** compressed-texture upload path at all (only counters at `:1217-1218`). | research 03 §5.1, `packages/rendering/src/Texture.ts:1`, `WebGL2Device.ts:4066-4068, 4117-4133`; `WebGPUDevice.ts` (PLAUSIBLE at runtime, 18 §3) |
| E14 | No texture budget or resize: `createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })` at full source resolution. | `packages/assets/src/GLTFRenderResources.ts:2229-2237` |
| E15 | Tangents absent from 98 of 120 game GLBs; runtime fallback is per-vertex Lengyel accumulation, not MikkTSpace, so Blender/Substance/Meshy normal maps show seam errors. | `GLTFRenderResources.ts:1216-1262`; research 03 §6 |
| E16 | `KHR_mesh_quantization` is registered "runtime-supported" but no shipped asset has ever exercised it. | `packages/assets/src/GLTFExtensionSupport.ts:44`; research 11 §2.1 (0 quantized) |
| E16a | The only in-repo direct consumer of the low-level KTX2 path is `apps/loader-ktx2`, which calls `createGLTFRenderResources(asset, { ktx2BasisTargetFormat: "etc2-rgba8unorm" })` on a data-URL fixture (`/tests/assets/corpus/ktx2/Rib_N.ktx2`). It must be migrated when `transcoderUrl` becomes required (§11). | `apps/loader-ktx2/src/main.ts:85-90` |

### 2.3 Admission rewards provenance, not looks

| # | Fact | Evidence |
|---|---|---|
| E17 | `requiresTextureEvidence` returns false when `suitabilityReason` matches `/\b(stylized|stylised|flat[-\s]?color|flat[-\s]?colour|untextured|procedural material|clay render|solid material)\b/i`; sole call site is the release warning at `:3252-3253`. 24 of 131 release assets are in texture-required roles and match the regex (19 C19 skeptic 2). | `packages/aura3d-cli/src/index.ts:3376-3382, 3252-3253` |
| E18 | The separate release-primary "no texture references" check is waived by `hasHashBoundFlatColorMaterialEvidence`, which only needs named visible materials with opacity > 0 and a probe whose `assetHash` equals the file hash. | `packages/aura3d-cli/src/index.ts:3005, 3164-3178` |
| E19 | Every role-aware release check is identity/metadata: role declared, bounds not tiny/huge (`:3280-3299`), suitability keywords (`:3351-3370`), materials readable, orientation, rendered probe `nonBlankPixels`/`colorBuckets`. None measures texel density, triangle appropriateness, PBR completeness, IBL-lit appearance, or art-direction match. | `packages/aura3d-cli/src/index.ts:3210-3272`; code comment `:742-748` ("A 792-triangle body shell with no wheels modelled passes all of them") |
| E20 | Meshy imports throw on `--quality release`; admission's only promotion path is "independent human review" text. | `packages/aura3d-cli/src/meshy/import.ts:42`; `meshy/admission.ts:129-136` |
| E21 | Catalog ranking: title/tag/description keyword hits plus provenance buckets (sourceQuality 22 pts, licence 17); visual signal is only "has ≥1 material" +4 and "has ≥1 texture" +4; missing texture −6 equals a missing licence URL. | `packages/asset-index/src/ranking.ts:47-51`; `packages/aura3d-cli/src/pull-bridge/scoring.ts:20-130` |
| E22 | Poly Haven adapter queries `?t=models` only and emits deep-link-only records; no texture or HDRI adapter. | `packages/asset-index/src/adapters/poly-haven.ts:25-35` |
| E23 | Manifest types: `AuraAssetQuality = "ungraded" | "blocked" | "prototype" | "candidate" | "release"`; roles include no `backdrop`/`proxy`; asset entry has no derived-artifact, look-dev, budget or art-direction fields. | `packages/aura3d-cli/src/asset-core-types.ts:12-26, 221-252` |
| E24 | Root manifest: 404 entries, 226 `model`, 178 `audio`, **0 `texture`/`environment`**; 4 HDRIs in the repo, all 1k, none used by a game. | research 11 §2.1 |

### 2.4 What shipped (corrected counts)

| Class (120 game-referenced models) | Count | Release label | Examples |
|---|---:|---|---|
| `aura3d-original` scripted geometry (`addBox`/`addCylinderY`, NORMAL but **no TEXCOORD**, factor colour only) | 50 | all `release` | `apps/showcase-vault-breakers/scripts/build-models.mjs:105-224`; mech parts 96–608 tris; `rooftopBackboard` 12 tris; `galleryShiftDisplayCase` 24 tris |
| No-family CC0 "review art" / Blender procedural | 19 | mostly `release` | 13 release 4-tri `KHR_materials_unlit` cards (19 C19: `neonRainCourierHero`, `neonCrownMothElite`, `skylineArcticRunnerHero` as `character`; `auroraExtractionLanderHero` as `vehicle`; 9 set-dressing). Blender kits with 32²–128² palette textures (`gravityPostCourierSkiff` 9× 32×32) |
| Objaverse / Sketchfab | 34 | release | uncurated: `siegeGolfBall` 76,800 tris untextured; `neonStreetLampProp` 272,036 tris / 15.6 MB; `gravityPostStationRing` 458,297 tris / 43.8 MB / 2,150 primitives; `siegePlankSet` 12 tris with 1024² base+normal |
| Meshy (Blender COLLAPSE decimate 1.93M → 48k–237k, no retopo/bake/AO/TANGENT, `doubleSided`) | 8 | all `candidate` | `mechHeroDecimated` 27.3 MB; `pulseArena` 28.6 MB (only `?arena=candidate`); `skylineHeroRunner` used only as 0.62-opacity ghost |
| NASA planets / Kenney / OpenGameArt | 9 | release | planets up to 4096×3072 PNG; `showcaseRunnerGirl` 72 tris |

Template starters inherit the floor: `product-viewer` product is 968 tris with 16× 1×1 px PNG textures;
`racing-starter` track is 24,493 tris across 100 untextured materials (research 11 §2.5).

### 2.5 Packaging

- `src/aura-assets.ts` is 3,782,497 B / 129,724 lines and is imported by every showcase route; a Courier Rush
  bundle (3.6 MB) contains 281 `suitabilityReason` and 78 `licenseRaw` strings including other games' assets
  (research 11 §2.1).
- `public/aura-assets/` is 1.7 GB / 1,393 files with 529 orphans (490 MB); each app's `dist/aura-assets` copies
  all of it.

### 2.6 Render-time asset destruction in other lanes' code (integrated, never blocking)

- `model(asset, { material })` with any colour sets `replaceSurfaceTextures: true` (hard-coded,
  `packages/engine/src/agent-api/index.ts:13570`, inside the tint bridge `:13560-13580` that PR 0b-1 carves to
  `compiler/modelMaterials.ts`, owner 04), disabling base-colour and metal-rough maps on every material
  (`TypedGLBActor.ts:484-514`); `material.pbr()` always injects `#d7dee8` (`index.ts:2416`). Confirmed by
  19 C3. Fixed by lane 04 behind `A3D_QR_MATERIALS` through contract C-15.
- `lights.ambient()` without an `environments.*` node zeroes IBL (`index.ts:12693-12707`): 15 of 18 games
  (19 corrected claim; Aura Clash avoids it through the compatibility RenderSource path). Fixed by lane 02
  behind `A3D_QR_LIGHTING` through C-09/C-10.
- Instanced boxes ignore `node.size` in `createProductionInstanceTransforms` (`index.ts:14747-14754`;
  research 22/23 `16-instancing`). CONTRACTS §0 R18: fixed by lane 15 in `compiler/primitives.ts` as an unflagged
  correctness fix (C-36).

These do not gate any task here. Lane 05's standalone acceptance (§16.0) is measured on the **three r185
adapter** of the look-dev viewer and on optimized-vs-source equivalence in Aura3D, neither of which needs those
fixes. Aura3D-rendered quality of optimized assets in games is integrated acceptance (§16.4), scored only at
CONTRACTS §7 checkpoints with `qr_flags=all`.

---

## 3. Root cause

1. **Wrong objective.** The pipeline was built to answer "is this file legal, identified and non-blank?"
   rather than "does this file look good at the gameplay camera within budget?". Every gate (E17–E19) measures
   identity; ranking (E21) optimizes provenance. Nothing in the loop sees a lit render.
2. **No technical-art stage.** Without optimize/resize/bake/LOD, the only two ways to put content on screen are
   raw dumps (too heavy, 4K on 216-triangle boxes) or code-authored primitives (too crude). The pipeline
   offered no middle; agents picked the path the gates made cheapest.
3. **Gameable waivers.** A regex on free text (E17) and a hash-bound "flat colour" evidence check (E18) let
   UV-less box geometry and image quads certify as `release` in character/vehicle/world roles.
4. **Policy inversion on generated assets.** Meshy is banned from release (E20) without a quality path, so
   the best 3D content is kept as ghosts and flag-gated candidates while cards and boxes ship.
5. **Decode side unreachable.** Even a correctly optimized file fails in `model()` (E9–E11); KTX2 depends on a
   third-party CDN and loses sRGB (E12–E13). This removed any incentive to build the encode side.
6. **No look-dev.** There is no standard environment to judge an asset in. Probes are rendered without IBL
   (because ambient zeroes it) and scored by pixel counts, so even good assets look flat in their own evidence.
7. **No curation.** Search draws from uncurated Objaverse mirrors (32 of 120 assets) with no art-direction
   coherence check, producing style clashes the vision judge calls out in Gallery Shift, Gravity Post,
   Neon Swarm, Courier Rush and Mech Hangar (research 21).

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/cli` (`packages/aura3d-cli`) | New verbs `assets optimize`, `assets lookdev`, `assets review`, `assets budget`, `assets library`, `assets admit`, `assets prune`; replace release gates; Meshy promotion; manifest schema 1.1 (C-17); per-route typegen; deploy subset; codemod `assets-route-modules` (C-39) |
| `@aura3d/assets` (`packages/assets`) | Delete/replace `MeshOptimization`, `AssetImportPreflight` stubs, `KTX2LoaderThreeCompat`; `AssetDecoderRegistry` + vendored basis/draco (C-16 real); `KTX2TargetSelection.ts`; MSFT_lod parse in `GLTFLoader.ts`; tier texture cap in carved `gltf/ImageDecode.ts` |
| `@aura3d/engine` (`packages/engine`) | Lane-05 files only: `agent-api/AssetDecoders.ts` (registry per app, `prepareModelDecoders`), `production-runtime/LodSelector.ts`, `production-runtime/actor/TypedGLBActorLod.ts` (TypedGLBActor extension), `lanes/prd05.ts`, `compiler/diagnosticOnly.prd05.ts`. The actor's pipeline call (`TypedGLBActor.ts`, 04) and model-node compile (`compiler/renderer.ts`, 15) are reached by requests Q-04-1 / Q-15-1 |
| `@aura3d/rendering` (`packages/rendering`) | Lane-05 files only: `webgl2/TextureFormats.ts` (carve-out of `WebGL2Device.ts:4117-4133`, sRGB + BPTC + gated ETC2), `shaders/lod-dither.glsl.ts`, `shaders/debug-view.glsl.ts` (C-02 chunks), `performance/LOD.ts`. WebGPU compressed upload is request Q-11-1 |
| `@aura3d/asset-index` (`packages/asset-index`) | Poly Haven HDRI + texture adapters (direct 1k/2k files), ambientCG texture adapter, library catalog source, visual-signal ranking |
| `@aura3d/physics-rapier` | `createCollidersFromSidecar` consuming generated collider sidecars |
| `create-aura3d` templates + skills (owner 13) | Not edited here: facts F-05-* (C-40) and requests Q-13-1..3 |
| New: `tools/asset-optimize` (own `package.json`) | Node pipeline on `@gltf-transform/*` + meshoptimizer + KTX-Software + MikkTSpace; runs in CI/remote |
| New: `apps/asset-lookdev` | Look-dev viewer route + capture script (both Aura3D and three r185 adapters) |

---

## 5. Affected files / directories

### 5.1 Owned by lane 05: modify

- `packages/aura3d-cli/src/cli.ts` (verb dispatch; C-39 fallthrough seam lands in PR 0b-3), `cli-help.ts`, `cli-options.ts`
- `packages/aura3d-cli/src/index.ts` — `createRoleAwareReleaseQualityWarnings` (:3210-3272), `requiresTextureEvidence` (:3376-3382, delete; call site :3252), `hasHashBoundFlatColorMaterialEvidence` (:3164-3178, delete; uses :3005, :3158), release-primary check (:3005), `retainedGameSubjectCertificationBlockers` (:702-760), `addAsset` (:313), `validateAssets` (:875), `inspectGltfAnimations` (:2112, request Q-05-1 from lane 06)
- `packages/aura3d-cli/src/asset-core-types.ts` (schema 1.1 types, re-exporting C-17), `asset-manifest.ts` (`writeTypedAssets` :37, per-route typegen), `asset-role-admission.ts`, `asset-source-validation.ts` (route AST scan)
- `packages/aura3d-cli/src/meshy/import.ts:42`, `meshy/admission.ts:100-137`
- `packages/aura3d-cli/src/pull-bridge/scoring.ts`, `packages/asset-index/src/ranking.ts`, `adapters/poly-haven.ts`
- `packages/assets/src/MeshOptimization.ts`, `AssetImportPreflight.ts`, `loaders/KTX2Loader.ts`, `KTX2BasisTextureTranscoder.ts` (incl. `ensureCompressedTextureSupport` :277-293), `GLTFCompressionDecoders.ts` (`createMeshoptDecoder` :63, `createDracoDecoder` :85), `GLTFLoader.ts` (Draco throw :1312; MSFT_lod parse)
- `packages/assets/src/gltf/ImageDecode.ts` (verbatim carve of `decodeImageInBrowser`, `GLTFRenderResources.ts:2216-2241`, in PR 0b-3; CONTRACTS §3.6)
- `packages/rendering/src/webgl2/TextureFormats.ts` (verbatim carve of `resolveCompressedTextureFormat`, `WebGL2Device.ts:4117-4133`, call site :3922, in PR 0b-2; C-16 slot)
- `packages/rendering/src/performance/LOD.ts` (delete `createDefaultPerformanceLodLevels` :13-20 or back it with real meshes)
- `packages/engine/src/agent-api/AssetDecoders.ts` (:10-25)
- `packages/physics-rapier/src/index.ts` (`ColliderDesc.trimesh`/`convexHull` :555-557)
- `apps/loader-ktx2/src/main.ts:85-90` (only direct low-level KTX2 caller; migrate to `transcoderUrl`)
- `aura.assets.json` (generator-only, CONTRACTS §4.3), `src/aura-assets.ts`, `public/aura-assets/`

### 5.2 Owned by lane 05: add

- `packages/assets/src/{AssetDecoderRegistry,KTX2TargetSelection,KTX2TranscodeWorker}.ts`, `packages/assets/vendor/{basis,draco}/`
- `packages/engine/src/production-runtime/{LodSelector.ts,actor/TypedGLBActorLod.ts}`
- `packages/rendering/src/shaders/{lod-dither,debug-view}.glsl.ts` (+ WGSL twins in the same files' `wgsl` field, C-02)
- `packages/aura3d-cli/src/{optimize,lookdev,admission}/`, `packages/aura3d-cli/src/commands/prd05/`
- `tools/asset-optimize/{package.json,index.ts,profiles.ts,steps/*.ts,checks/*.ts,extensions/msft-lod.ts,migrate-1.1.ts,review-vision.ts,measure-tiers.mjs,tool-versions.json,blender/*.py,README.md}`
- `apps/asset-lookdev/{index.html,src/main.ts,src/three-adapter.ts,src/aura-adapter.ts,capture.mjs,lookdev.stage.json}`
- `.github/workflows/{asset-optimize,asset-lookdev}.yml`, `.github/workflows/qr-prd05-{gates,assets-browser}.yml`
- `assets/library/` + `aura.library.json`, `assets/art-direction/`, `public/aura-decoders/`
- Lane-generic: `packages/{assets,engine,rendering,aura3d-cli}/src/lanes/prd05.ts`, `agent-api/compiler/diagnosticOnly.prd05.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/`, `tests/qr/prd05/`, `tests/unit/contracts/impl/prd05-*`, `docs/project/aura3d-quality-rebuild/evidence/prd05/` (all evidence below lives under `evidence/prd05/assets/`; `evidence/` default is lane 12's)

### 5.3 Not edited by lane 05 (seam, extension point, or request)

| File (owner) | Earlier draft edit | Now |
|---|---|---|
| `packages/engine/src/production-runtime/TypedGLBActor.ts:183-191` (04) | pass decoders to `loadProductionGLTFRenderPipeline` | pre-declared `TypedGLBActorOptions.decoders?/maxTextureSize?/lod?` (PR 0a) + request Q-04-1; LOD via `registerTypedGLBActorExtension` from `actor/TypedGLBActorLod.ts` |
| `packages/assets/src/GLTFRenderResources.ts` (04) | `decodeImageInBrowser`, `u_baseColorTextureSize` | carved `gltf/ImageDecode.ts` (05); debug view uses GLSL `textureSize()` so no new uniform |
| `packages/assets/src/{GLTFExtensionSupport.ts, asset-corpus/ProductionGLTFRenderPipeline.ts}` (04) | register `MSFT_lod`; decoders option | request Q-04-2 (generated matrix); pipeline already accepts decoders (E9) |
| `packages/engine/src/agent-api/index.ts`, `compiler/renderer.ts` (15) | `AuraModelOptions`/`AuraAssetDefinition` fields, model-node decoder await, `collider: "auto"` | fields pre-declared in PR 0a (C-17, DIAGNOSTIC_ONLY until wired); requests Q-15-1, Q-15-2 |
| `packages/rendering/src/WebGL2Device.ts` (01) | sRGB compressed formats | carved region `webgl2/TextureFormats.ts` (05) |
| `packages/rendering/src/WebGPUDevice.ts` (11) | compressed upload path | request Q-11-1 |
| `packages/rendering/src/Texture.ts:1` (06) | `TextureCompressedFormat` members | pre-declared in PR 0a (C-16) |
| `ShaderLibraryCore.ts` / `ShaderLibrary.ts` (01, frozen legacy §3.7) | `A3D_LOD_DITHER`, `A3D_DEBUG_VIEW` | C-02 chunks + features `prd05.lodDither`, `prd05.debugView`; C-11 depth feature |
| `benchmarks/quality-rebuild/shared/assets.ts` (12) | `optimized` variants | `benchmarks/quality-rebuild/scenes/prd05/assets.ts` + C-30 lane scenes |
| `.github/workflows/{browser-matrix,ci}.yml` (12/15) | Windows job; `--legacy-release-gates` grep | `qr-prd05-assets-browser.yml`, `qr-prd05-gates.yml` |
| root `package.json` (15) | devDependencies; `draco3d` pin | `tools/asset-optimize/package.json`, `packages/assets/package.json`; root pin via `root-manifest` request Q-15-3 |
| `packages/aura3d-cli/skills/**`, `packages/create-aura3d/templates/**` (13) | skill text, starter assets | facts F-05-* (C-40), requests Q-13-1..3 |
| `apps/showcase-*/**`, `tools/quality-rebuild-capture/games.json` (14) | register scripts, route imports, pilot swaps | requests Q-14-1..4; codemod `assets-route-modules` (C-39) |

---

## 6. Architecture proposal

### 6.1 Pipeline shape

```
source file (LFS, immutable, licence-bound)            assets/src/<id>/<file>  (provenance unchanged)
   │  aura3d assets add            → manifest entry, quality "ungraded", provenance, inspect
   │  aura3d assets optimize       → tools/asset-optimize (CI / remote worker; never a local Docker host)
   │      weld → dedup → prune → join/palette → resize → tangents(MikkTSpace) → LOD(simplify)
   │      → colliders → quantize → meshopt (or draco) → KTX2 (UASTC/ETC1S) → checks → measurements
   │                                → public/aura-assets/<id>.<derivedHash8>.glb          (optimized)
   │                                → public/aura-assets/<id>.<derivedHash8>.mobile.glb   (optional ≤1024 tex)
   │                                → public/aura-assets/<id>.<derivedHash8>.collision.glb
   │  aura3d assets lookdev        → apps/asset-lookdev on macos-14 runner (Aura3D + three r185 adapters)
   │                                → artifacts lookdev/<id>/<derivedHash8>/{contact.jpg, views/*.png, metrics.json}
   │  aura3d assets admit          → visual-quality gates G1–G11 (§6.4) + look-dev review record
   ▼
manifest entry quality "release" bound to derivedHash  → per-route typegen → per-route deploy subset
```

Principles:

- **Source and derived are separate artifacts.** The source file and its provenance stay exactly as today.
  Every derived file records `sourceHash`, the optimize profile, the tool versions and the step list. A
  derived file is reproducible from the source + profile + pinned tool versions (deterministic output is a
  test, §15).
- **Release binds to the derived hash.** Look-dev approval, measurements and admission are keyed to
  `derived.hash`; re-optimizing invalidates them automatically (same mechanism as today's `renderedProbe.assetHash`).
- **Heavy work is remote.** Optimize (KTX2 encode, Blender bakes, simplification of 1M-triangle sources) and
  look-dev capture run in GitHub Actions or the `auraone-remote-run` worker. Local CLI runs `--dry-run`
  measurement and small props only.
- **One toolchain.** `@gltf-transform/core|functions|extensions` (pinned exact, same 4.x version; not installed
  today) for graph edits; `meshoptimizer@1.2.0` (already pinned, `package.json:734`) for simplify/encode;
  `sharp` (pinned exact) for resize; KTX-Software `ktx` CLI (pinned release, installed in the workflow) for
  UASTC/ETC1S; `mikktspace` npm WASM (pinned exact) for tangents; `draco3d` for optional Draco encode — change
  the existing `^1.5.7` to exact `1.5.7`; Blender LTS headless (remote only) for remesh/bake.
  `@gltf-transform/extensions` has no `MSFT_lod` implementation, so `tools/asset-optimize/extensions/msft-lod.ts`
  implements it as a custom `Extension` subclass (read + write), with a round-trip unit test.

### 6.2 Optimize profiles

Profiles live in `tools/asset-optimize/profiles.ts` and replace the descriptive `AssetImportPreflight`
settings (E4). Triangle numbers are LOD0 targets/ceilings; floors are admission minima (§6.4 G1).

| Profile | Roles | LOD0 tris floor / target / ceiling | LOD chain (ratio of LOD0) | Base colour | Normal | ORM | Max tex (High) | Geometry | Collider |
|---|---|---|---|---|---|---|---|---|---|
| `hero-character` | character (player, fighter, hero) | 5k / 25k / 60k | 1, 0.5, 0.25 | UASTC | UASTC | UASTC | 2048 | meshopt; positions float (skinned) | capsule from bounds |
| `npc-character` | character (crowd, enemy, guard) | 2k / 10k / 25k | 1, 0.5, 0.2 | ETC1S | UASTC | ETC1S | 1024 | meshopt | capsule |
| `hero-vehicle` | vehicle (player) | 8k / 40k / 80k | 1, 0.5, 0.2, 0.08 | UASTC | UASTC | UASTC | 2048 | meshopt + quantize | convex hull(s) from LOD2 |
| `traffic-vehicle` | vehicle (AI, traffic) | 3k / 12k / 25k | 1, 0.4, 0.12 | ETC1S | UASTC | ETC1S | 1024 | meshopt + quantize | convex hull from LOD2 |
| `product` | product | 10k / 60k / 150k | 1, 0.5 | UASTC | UASTC | UASTC | 2048 (4096 Ultra) | meshopt + quantize | none |
| `weapon` | weapon | 1.5k / 6k / 15k | 1, 0.4 | ETC1S | UASTC | ETC1S | 1024 | meshopt + quantize | box |
| `prop-large` | prop (≥1 m, gameplay-relevant) | 500 / 4k / 15k | 1, 0.4, 0.12 | ETC1S | UASTC | ETC1S | 1024 | meshopt + quantize | convex hull |
| `prop-small` | prop (<1 m), set-dressing | 100 / 1k / 5k | 1, 0.35 | ETC1S | UASTC | ETC1S | 512 | meshopt + quantize | box / none |
| `world-chunk` | world, environment | — / 120k / 250k per chunk | 1, 0.4, 0.12 per chunk | ETC1S + tiling detail | UASTC | ETC1S | 2048 atlas / 1024 tiling | meshopt + quantize; `join` per material | trimesh from LOD1 |
| `track` | track | — / 60k / 150k | 1, 0.4 | ETC1S tiling | UASTC tiling | ETC1S tiling | 1024 tiling | meshopt + quantize | trimesh from LOD0 drivable surface |
| `backdrop` | new role `backdrop` (far plates, skyline cards) | 4 / — / 2k | none | ETC1S (UASTC if gradients band) | — | — | 2048 | quantize | none |
| `hdri` | environment type | — | — | RGBE `.hdr` 2k (+ 4k Ultra) kept; KTX2 `R16G16B16A16_SFLOAT`/UASTC-HDR only when a C-09 `EnvironmentSource` advertises that input (request Q-02-2; RGBE meanwhile) | — | — | 2048×1024 | — | — |

Normal maps always use UASTC (ETC1S block artefacts are visible in normals). UASTC uses RDO + Zstd
supercompression (`--encode uastc --uastc-quality 2 --uastc-rdo --uastc-rdo-l 1.0 --zstd 18`); ETC1S uses
`--encode basis-lz --clevel 2 --qlevel 192`; exact flags pinned in `profiles.ts` and recorded per output. Flag
spelling is version-specific in KTX-Software 4.x, so `asset-optimize.yml` runs `ktx create --help` for the pinned
release and a check fails the job if any flag in `profiles.ts` is not listed. Mobile variants cap every texture
at 1024 (hero) / 512 (others).

### 6.3 Optimize steps (ordered), with per-step contract

1. **weld** (`weld()`) — merges bitwise-identical vertices; required before simplify. gltf-transform v4
   removed the `tolerance` option, so near-duplicate seams are not merged here; simplify's `targetError` and
   the quantize step absorb sub-tolerance differences.
2. **dedup + prune** — identical accessors/textures/materials merged; unused removed. File-level duplicate
   detection across the manifest: byte-identical sources (e.g. `rooftopDefender` / `rooftopLayupScorer`,
   9,692 KB each, research 11 §2.4) become one derived file with two manifest aliases.
3. **join / palette** — merge primitives that share a material within a node subtree (`gravityPostStationRing`
   2,150 primitives; `showcaseSkylineCity` 772 primitives). Factor-only materials are baked into a palette
   texture so many materials collapse to one draw (`palette()`), **only** for roles `world-chunk`,
   `prop-small`; never for hero roles.
4. **resize** — downscale to the profile max, power-of-two, Lanczos3, mip-aware; normal maps renormalized
   after resize. Texture-to-geometry waste check: a texture larger than the profile max for a mesh whose
   triangle count is below the profile floor is flagged `texture-waste` (the 216-tri parcel with 3× 1024² maps).
5. **tangents** — generate MikkTSpace tangents for every primitive that has a normal map and no TANGENT
   (98 of 120 game GLBs today, E15). Requires TEXCOORD_0; primitives without UVs fail G5 instead.
6. **LOD** — `MeshoptSimplifier.simplifyWithAttributes` per primitive to each ratio of §6.2 with `targetError`
   0.01 (LOD1), 0.02 (LOD2), 0.05 (LOD3), flag `LockBorder` for multi-primitive seams, attribute weights
   normal 0.5 / UV0 1.0. If a level cannot reach ≤ 1.2 × its target index count within `targetError`, the step
   records `lod-target-missed` and keeps the achieved level (no silent error escalation).
   Skinned meshes: simplification only removes indices and reuses existing vertices, so JOINTS_n/WEIGHTS_n
   are preserved by construction; LOD count capped at 2.
   Output stored in the same GLB through the `MSFT_lod` node extension (custom gltf-transform `Extension`,
   §6.1) with `extras.MSFT_screencoverage` as an array of one value per level including LOD0, strictly
   decreasing (e.g. `[0.25, 0.08, 0.02]` for a 3-level chain: LOD0 above 0.25 of viewport height, LOD1 above
   0.08, LOD2 above 0.02, coarsest below), so textures are shared across LODs. Readers that ignore `MSFT_lod`
   (three r185 `GLTFLoader` has no built-in support) render LOD0 only.
7. **colliders** — from the LOD named in §6.2: per-node convex hull (meshoptimizer-simplified to ≤ 64 verts),
   or trimesh (worlds/tracks, LOD1), or analytic box/capsule from bounds. Output `<id>.<hash8>.collision.glb`
   (meshopt-compressed, no materials) with `extras.aura3dCollider = { shape, sourceNode }` per mesh.
8. **quantize** — `KHR_mesh_quantization`: positions 14-bit for static meshes (skinned positions stay float),
   normals 10-bit, UVs 12-bit only when all TEXCOORD values are in [0,1], tangents 8-bit.
9. **geometry compression** — `EXT_meshopt_compression` via gltf-transform `meshopt({ encoder, level: "medium" })`
   (default) or `KHR_draco_mesh_compression` (`--geometry draco`, static worlds only). Meshopt is the default
   because its decoder is 29,256 B raw (three r185 copy, both SIMD and scalar WASM embedded as base64) versus a
   ~300 KB+ Draco WASM, it decodes faster, and it keeps skin and morph attributes.
10. **KTX2** — `KHR_texture_basisu`; base colour/emissive/sheenColor/specularColor flagged sRGB in the KTX2 DFD;
    normal/ORM/clearcoat/transmission linear. UASTC/ETC1S per §6.2 slot.
11. **checks** — G1–G8 (§6.4) computed on the derived file and written to `metrics.json` and the manifest.
12. **measure** — before/after: file bytes, triangles, vertices, primitives, materials, estimated draw calls,
    texture count, max dimension, estimated GPU bytes (per tier), download bytes.

Meshy and other high-poly generated sources add a pre-stage (§6.5).

### 6.4 Visual-quality admission gates (replace E17–E19)

`aura3d assets admit <id> --quality release` (and `assets validate --release`) fail unless every gate passes on
the **derived** file. Warnings become failures for `release`; `candidate` records failures but does not block.

| Gate | Rule | Measured how |
|---|---|---|
| **G1 Triangle band** | LOD0 triangles within [floor, ceiling] of the role profile (§6.2). Floors kill programmer art (`rooftopBackboard` 12, `galleryShiftDisplayCase` 24, drones 108). Ceilings kill waste (`siegeGolfBall` 76,800; `neonStreetLampProp` 272,036). | accessor counts per primitive, LOD0 only |
| **G2 Texel density** | At the role's declared gameplay camera (`--camera-distance`, `--fov`, `--viewport`, defaults per role), the ratio of texels per screen pixel on the asset's median-area triangles is within [0.5, 4]. Below 0.5 = blurry; above 4 = wasted VRAM/bytes (mip never sampled). Absolute floor: character ≥ 256 px/m, vehicle/product ≥ 128 px/m, prop ≥ 96 px/m, world ≥ 64 px/m effective (tiling factor counted). | UV-area/world-area per triangle × texture size; reported as p10/p50/p90 |
| **G3 PBR completeness** | For character/vehicle/product/weapon/world/track/environment/prop-large: TEXCOORD_0 + base colour texture + normal texture + metallic-roughness texture (occlusion optional on skinned) on ≥ 90 % of rendered surface area. `KHR_materials_pbrSpecularGlossiness` converted to metal-rough by optimize. | material slots × primitive area |
| **G4 Card ban** | Any primitive role (everything except `backdrop`, `debug`, `abstract`) fails if: LOD0 ≤ 12 triangles, or `KHR_materials_unlit` on > 10 % of surface area, or the bounds thinness ratio min/max < 0.02 with ≤ 4 triangles. `backdrop` requires `extras.aura3dBackdrop.minDistance` ≥ 30 m and cannot be the route's primary asset. | geometry + extension scan |
| **G5 Programmer-art ban** | `release` is impossible when: no TEXCOORD_0 on > 10 % of area; or every material is factor-only with no texture and no approved stylized art-direction (G10). In addition, an asset whose `provenance.generation`/`generator`/source path matches the in-repo builder pattern — any file under `apps/*/scripts/` (`build-*.mjs`, `build-*.ts`, `build-*.py`, `blender-build-*.py`, `build-review-*.mjs`, `register-*.mjs`; 60+ such scripts exist today) or the generator strings `Deep Recovery procedural GLB synth`, `modular family synth`, `deterministic * builder` — is capped at `prototype` (role `proxy` allowed) **unless** it passes G2, G3, G6 and a G9 record with a named human reviewer (this keeps genuinely textured Blender-scripted kits admissible). The builder pattern list lives in `admission/builder-patterns.ts` with a unit test enumerating `git ls-files 'apps/*/scripts/*'`. | provenance + attribute scan |
| **G6 Texture sanity** | Normal maps: linear, not sRGB-tagged; decoded vector length within [0.9, 1.1] for ≥ 95 % texels; mean B ≥ 0.7. ORM: R/G/B not all constant; a channel with σ < 0.004 is flagged "replace texture with factor". Non-metal base colour sRGB luminance within [30, 240] on ≥ 95 % texels; metal (metallic ≥ 0.9) base colour luminance ≥ 140. No texture > profile max; no non-power-of-two after optimize. | decode at 256² proxy, histogram |
| **G7 Budget** | Derived file bytes, GPU bytes (High tier) and draw calls ≤ role budget (§17.2). | measure step |
| **G8 Tangents** | Primitive with normal map has TANGENT (authored or MikkTSpace-generated). | attribute scan |
| **G9 Look-dev approval** | A look-dev record bound to `derived.hash` with rubric score ≥ 6.5/10 (hero roles: vision model **and** named human; other roles: vision model, human spot-check of ≥ 10 % sampled weekly). The G9 score is computed on the **three r185 adapter frames** (the file reference, §6.7), so asset admission never waits on the renderer lanes 01–04; the Aura-adapter score is recorded alongside and an Aura-minus-three gap > 1.5 files a `qr-ic-regression`-style renderer issue (attributed by C-31 diagnostics) without blocking the asset. Reviews use the C-32 judgement schema and `judgeWithPrism`. Rubric axes: silhouette, surface detail, material believability under three HDRIs, texel sharpness at gameplay distance, LOD transitions, artefacts (seams, faceting, flipped normals, shading errors); score = unweighted mean of the 6 axes, any single axis < 4 fails regardless of mean. | `apps/asset-lookdev` capture + review record (§6.7) |
| **G10 Art direction** | Every release asset references `artDirection: <id>` (file `assets/art-direction/<id>.json`: palette, shading model `pbr-realistic`/`pbr-stylized`/`stylized-flat`, texel-density target, reference images). `stylized-flat` is the **only** structured replacement for the deleted regex: still needs UVs, G1 floor, G4, G9, and a reviewer name. Route admission (`assets validate --release --route <app>`) fails if the route's rendered assets reference more than one art-direction id without an explicit `mix` entry, and requires a group look-dev sheet judged ≥ 6 for coherence. | manifest + group contact sheet |
| **G11 Optimized** | `release` requires a `derived` record from `assets optimize` (or `derived.optimize = "not-needed"` with measurements proving every budget passes on the source). | manifest |

Default gameplay cameras for G2 (used when neither `--route` nor `--camera-distance` is given; viewport
1920×1080 and 390×844 both evaluated; distance is camera-to-bounds-centre):

| Profile | Distance | Vertical FOV | Rationale |
|---|---|---|---|
| `hero-character`, `npc-character` | 4 m | 50° | third-person follow cam (Skyline, Rooftop, Aura Clash) |
| `hero-vehicle`, `traffic-vehicle` | 7 m | 55° | chase cam (Courier, Turbo, Patrol Wing) |
| `product` | 1.5 × bounds diagonal | 30° | product-viewer framing |
| `weapon` | 1.2 m | 60° | first-person / held-item view |
| `prop-large` | 6 m | 50° | |
| `prop-small` | 3 m | 50° | |
| `world-chunk`, `track` | 15 m to the nearest surface, plus 2 m for ground-level surfaces | 55° | ground-level gameplay |
| `backdrop` | `extras.aura3dBackdrop.minDistance` | 55° | |

A route may override per asset in `aura.assets.json` (`gameplayCamera: { distance, fovDegrees }`) only when the
route source sets a matching camera; `assets validate --release --route` checks the override against the route's
camera node and fails on a mismatch > 20 %.

Deleted (no replacement by keyword): `requiresTextureEvidence` (`index.ts:3376-3382`),
`hasHashBoundFlatColorMaterialEvidence` (`index.ts:3164-3178`) and the "stylized-material rationale" warning
text (`index.ts:3252-3253`). `suitabilityReason` remains a human note and is no longer parsed for waivers.
`renderedProbe.nonBlankPixels/colorBuckets` stays as a smoke check only.

### 6.5 Generated-asset promotion path (Meshy and similar)

Replace the throw at `meshy/import.ts:42` with: Meshy imports may reach `release` only through
`assets optimize --profile <role> --from-generated` plus G1–G11. The pre-stage, run on a remote worker:

1. **Remesh** to the profile target (15–30k for `hero-character`/`hero-vehicle`; 5–10k props) through the
   Meshy remesh operation already covered by the `meshy-cli` skill, or Blender LTS headless QuadriFlow when a
   Meshy remesh is unavailable. Collapse-decimation of triangle soup (today's `DECIMATE.md`) is not accepted:
   it is detected by a "sliver ratio" check (fraction of triangles with min angle < 10° > 15 % fails G9 pre-check).
2. **UV** — keep provider UVs if the remeshed topology transfers them; otherwise Blender Smart UV + pack at
   4 px margin per 1024.
3. **Bake** high-poly → low-poly in Blender Cycles headless: base colour, tangent-space normal (MikkTSpace,
   OpenGL +Y), AO into ORM.R; roughness/metal transferred to ORM.G/B. Cage extrusion from bounds × 0.01.
4. **Single-sided** — clear `doubleSided` unless the mesh has open shells (check edge manifoldness).
5. Then the normal §6.3 steps.

Promotion records `provenance.generation` (unchanged) plus `derived.steps` including the remesh/bake tool
versions. Rights evidence handling is unchanged (`--rights-evidence` stays mandatory). AI-image-generated 2D
cards keep CC0-by-prompt provenance only for role `backdrop`, and the ledger now flags
`provenance.rightsReview: "required"` for generated images (research 11 §4.5).

### 6.6 Curated hero library and HDRIs

New `assets/library/` with `aura.library.json` (same entry schema, `quality: "release"`, `artDirection`
required). Library entries are admitted through §6.4 exactly like route assets. Content plan, mapped to the
18 games' genres (`tools/quality-rebuild-capture/games.json`):

| Kit | Contents (minimum) | Consumers |
|---|---|---|
| `characters/humanoid-pbr` | 2 rigged humanoids (male/female body types), ≥ 12 clips each (idle, walk, run, jump, fall, land, punch×2, kick, hit, block, KO), MikkTSpace normals, 2048 UASTC | Aura Clash, Skyline Runner, Rooftop Buckets, Gallery Shift, templates `fighting-game`, `character-controller`, `mini-game` |
| `characters/robots-mechs` | 1 rigged mech (≥ 6 clips), 3 robot enemies (rigged or rigid-part rigs) | Mech Hangar, Neon Swarm, Gallery Shift guards, Orbital Defense |
| `vehicles/road` | 1 hero car (separate wheels, interior blockout, glass), 3 traffic cars, 1 van; 2048/1024 | Courier Rush, Turbo Drift Circuit, template `racing-starter` |
| `vehicles/air-space-sea` | 1 aircraft, 1 drone, 1 lander, 1 cargo ship, 1 submarine | Patrol Wing, Aurora Lander, Gravity Post, Deep Recovery |
| `props/sports-tabletop` | pool table + cue + numbered balls; basketball + hoop + backboard; golf ball/club/flag; pinball flippers/bumpers/rails | Bank Shot, Rooftop Buckets, Siege Golf, Vault Breakers |
| `props/industrial-urban` | crates, barrels, barriers, lamps, signs, cones, dumpsters (≤ 5k tris each) | Courier Rush, Neon Swarm, Siege Golf, Mech Hangar |
| `environments/modular` | city block kit, hangar/interior kit, museum interior kit, seabed rock/coral set, track kit (asphalt, kerb, barrier) | Courier Rush, Mech Hangar, Gallery Shift, Deep Recovery, Turbo |
| `textures/tiling` | ≥ 16 PBR sets (asphalt, concrete ×2, painted metal, brushed metal, rubber, felt, wood ×2, leather, fabric, sand, rock, grass, tiles, plastic) at 1024 + 2048, UASTC normal/ORM | lane 04 materials (C-15 texture inputs), lane 10 terrain/world (C-17 `texture-set`) |
| `planets-space` | planet albedo/normal/night/cloud sets at 2048/4096 (existing NASA sources, re-encoded), starfield cube | Gravity Post, Orbital Defense, Aurora Lander |
| `hdri` | ≥ 6 at 2k (+4k for Ultra/product): studio soft, studio high-contrast, outdoor midday, outdoor golden hour, overcast, night city; plus the 3 repo HDRIs re-sourced at 2k (`studio_small_08`, `autumn_field_puresky`, `kloppenheim_06_puresky`) | lane 02 default environment (C-09 consumes `type: "environment"` entries), lane 12 reference scenes, look-dev, every game |

Sourcing rules: CC0 first (Poly Haven models/textures/HDRIs, ambientCG textures, Kenney, Quaternius,
Khronos glTF-Sample-Assets), CC-BY with attribution second (curated Sketchfab, human-selected), Meshy/generated
through §6.5, commissioned art last. Raw Mixamo files are not redistributed in the library (licence prohibits
standalone redistribution); retargeted clips baked into a library character require a licence review entry.
Each kit has one `artDirection` id. Catalog `search/resolve` ranks library entries first.

Poly Haven adapter changes: add `?t=hdris` and `?t=textures` queries and direct single-file pulls
(`.hdr` for HDRIs; per-map JPG/PNG for textures, assembled locally into a material entry), keep models
deep-link-only until a packaged GLB pull exists (current honesty note, `poly-haven.ts:25-31`).

Ranking change (`ranking.ts`, `scoring.ts`): licence and provenance become **filters** (fail = excluded), not
score. Score = semantic fit + PBR completeness (G3 pre-check) + triangle-band fit (G1) + texture adequacy (G2
estimate at default camera) + "has look-dev approval" + library membership + art-direction match with the
route. Missing textures for a texture-required role excludes the candidate instead of −6.

### 6.7 Look-dev viewer

`apps/asset-lookdev/` — a standalone route that renders one asset (or a group) in a standard stage, twice: with
Aura3D (`aura-adapter.ts`, public `createAuraApp` path only) and with three r185 (`three-adapter.ts`, reusing the
`benchmarks/quality-rebuild/three/common.ts` conventions: PMREM from the same HDRI, ACES, same exposure).
three is the **file reference**: if the three frame looks bad, the asset fails; if only the Aura frame looks bad,
the issue is a renderer issue (lanes 01–04, attributed through C-31 sections), not an asset failure. The three
adapter needs nothing from any other lane, so look-dev is fully standalone; the Aura adapter runs on whatever
renderer flags are on (`?a3d-qr=` passthrough, C-33) and its scores are integrated evidence only.

Standard stage (`lookdev.stage.json`, versioned):
- HDRIs: `studio-soft-2k`, `outdoor-midday-2k`, `night-city-2k` (library §6.6); background visible at 0.6 blur.
- Ground: neutral 18 % grey shadow catcher, contact shadow on.
- Camera: auto-fit to bounds, vertical FOV 30°, 8 yaw stops (45°) at 15° elevation + 1 top-down 60°.
- Plus gameplay-distance shot using the role's camera defaults (G2) at 1920×1080 DPR 1 and 390×844 DPR 3.
- Debug views (Aura adapter): base colour, world normal, roughness, metallic, occlusion, texel density heatmap,
  mip level, facet view, LOD strip (each LOD at its switch coverage), UV layout (2D canvas from the GLB).
- Output: `contact.jpg` (3 HDRIs × 8 yaws grid), `debug.jpg`, `gameplay.jpg`, `metrics.json` (G1–G8 numbers,
  three vs Aura masked SSIM per view), `review.json` (rubric scores, judge ids, timestamps, derived hash).

Runs on GitHub Actions macos-14 (ANGLE Metal; same lane as `.github/workflows/quality-rebuild-capture.yml`)
through a new `asset-lookdev.yml` workflow; matrix fan-out by asset id (batches of 10). Never SwiftShader.

### 6.8 Runtime: decoders on the typed-GLB path

- New `AssetDecoderRegistry` (`packages/assets/src/AssetDecoderRegistry.ts`, the C-16 real behind
  `createAssetDecoderRegistry`, provided from `packages/assets/src/lanes/prd05.ts`), created once per app by
  `agent-api/AssetDecoders.ts` from the pre-declared `AuraCreateAppOptions.assets` (C-17/C-38, PR 0a).
  `prepareModelDecoders(asset, registry)` (also in `AssetDecoders.ts`) reads `asset.requiredDecoders`
  (emitted by typegen from `extensionsUsed`) and resolves `registry.require([...])` into the pre-declared
  `TypedGLBActorOptions.decoders` (CONTRACTS §3.6). The two call sites are not lane-05 files: the actor forwards
  `options.decoders` to `loadProductionGLTFRenderPipeline` (`TypedGLBActor.ts:184`, request Q-04-1; the pipeline
  already accepts all three decoders, `ProductionGLTFRenderPipeline.ts:6-25`), and the model-node compile awaits
  `prepareModelDecoders` before actor creation (`compiler/renderer.ts`, ex-`index.ts:13540-13841`, request
  Q-15-1). Until both land, lane tests call `prepareModelDecoders` + the pipeline directly, which proves E9–E11
  fixed end to end without either file (§16.0 S3), and the look-dev Aura adapter renders the `source` variant.
- Meshopt decoder: `meshoptimizer@1.2.0` `MeshoptDecoder`, dynamic-imported chunk; budget ≤ 20 KB gz, measured
  in Phase 1 (the module embeds SIMD and scalar WASM as base64, 29,256 B raw in the three copy).
- Draco: `draco3d@1.5.7` decoder WASM copied to `/aura-decoders/draco/`, loaded only when an asset requires it.
- Basis: `basis_transcoder.{js,wasm}` vendored into `packages/assets/vendor/basis/` (copied from
  `node_modules/three/examples/jsm/libs/basis/` at three 0.185.1, sha256 recorded, upstream Apache-2.0),
  served from `/aura-decoders/basis/`. **Delete** the unpkg fallback (`KTX2BasisTextureTranscoder.ts:22`).
- Transcoding in a worker pool (`workerCount`: 1 on Low/mobile, 2 on Medium+; never raised automatically).
- Target selection per device and slot (`selectKTX2TargetFormat`, `KTX2TargetSelection.ts`, real in PR 0a
  because it is pure; CONTRACTS §0 R6): UASTC → ASTC 4×4 → BC7 → ETC2 RGBA8 → RGBA8; ETC1S → ETC2 RGB8 (opaque)
  / ETC2 RGBA8 (alpha) → BC1 (opaque) / BC3 (alpha) → RGBA8. ETC1S never targets the legacy `ETC1` format
  because WebGL has no sRGB ETC1 internal format; ETC2 RGB8 is a bit-exact superset. sRGB variants for colour
  slots; transcode only the selected target (no second RGBA8 transcode unless the upload fails). Device
  capabilities come from `probeCompressedTextureCapabilities(gl)` in `webgl2/TextureFormats.ts` (lane 05).
- Tier texture cap: `maxTextureSize = min(C-27 tier.maxTextureSize, role cap §17.1)`; skip KTX2 levels above it;
  for PNG/JPEG sources the carved `gltf/ImageDecode.ts` uses
  `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: "high" })` when larger than the cap (E14).
- LOD (`A3D_QR_ASSETS_LOD`): `production-runtime/LodSelector.ts` selects the `MSFT_lod` level by projected
  bounding-sphere height fraction each frame with 10 % hysteresis; `actor/TypedGLBActorLod.ts` registers
  `registerTypedGLBActorExtension({ id: "prd05.lod", owner: "prd05", flag: "A3D_QR_ASSETS_LOD", onLoad,
  collectRenderItems, dispose })` and its `collectRenderItems` keeps only the active level's items (plus the
  outgoing level during a fade, with the pre-declared `RenderItem.lodFade`). Dithered cross-fade (§8) needs the
  C-02 generator; on the stub it degrades to a hard switch (the Low-tier behaviour). Shadow casters one level
  coarser: request Q-02-1 (C-11); meanwhile casters use the active level.
- Colliders: `packages/physics-rapier` gains `createCollidersFromSidecar(world, url | bytes, transform)` building
  `ColliderDesc.convexHull`/`trimesh` (`physics-rapier/src/index.ts:555-557`). Binding it to
  `model(asset, { physics, collider: "auto" })` is request Q-15-2; the option stays DIAGNOSTIC_ONLY
  (`diagnosticOnly.prd05.ts`) until then and the lane physics test calls the API directly.

### 6.9 Packaging

- Per-route typegen: `aura3d assets typegen --route apps/<app>` emits `src/aura-assets.route.ts` containing only
  the assets that route references (AST scan from `asset-source-validation.ts`), with fields `type, format,
  url, hash, bounds, sizeBytes, requiredDecoders, lods, colliderUrl, budget` — no licence, suitability or
  provenance strings (they stay in the manifest and in a generated `CREDITS.md`/`credits.json` per route).
- Per-route deploy subset: `check-deploy` copies only referenced derived files to `dist/aura-assets`; orphan
  prune (`assets prune --dry-run` then apply) removes the 529 stale files from `public/aura-assets`.
- Lane 05 owns the generator and `src/aura-assets.ts`; the export shape of route modules is offered to lane 15
  as request Q-15-4 (package boundary), and route imports are switched by lane 14 running the C-39 codemod
  `assets-route-modules` (Q-14-2). The monolithic module keeps being generated meanwhile, so nothing waits.

### 6.10 Art authored as code

Allowed only as role `proxy` (gameplay collision/greybox) or `debug`, capped at `prototype`. `check-deploy`
fails a route whose default (non-debug) render path draws a `proxy`/`prototype` asset or more than
`primitiveBudget` engine primitives in hero/world roles (initial budget: 40 primitive nodes visible per frame,
ground/sky excluded; Pulse Tunnel has 105 `primitives.*(` call sites today, research 11 §2.3). The existing
`apps/showcase-*/scripts/build-models.mjs` outputs are reclassified to `proxy` by migration (§10).

### 6.11 Recommendation cost table

All GPU/CPU/memory numbers below are estimates from format arithmetic (RGBA8 with mips = 1.333 × w × h × 4 B;
UASTC→BC7/ASTC = 1 B/px; ETC1S→BC1/ETC1 = 0.5 B/px) or from the research measurements cited. They must be
replaced with measured values in Phase 5 (no performance tier has ever been measured, research 18 §2 item 3).

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory cost | Bundle-size impact | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | `assets optimize` (weld/dedup/join/quantize/meshopt) | Indirect: enables 4–10× more geometric detail within the same budget; removes 2,150-primitive draw explosions | Fewer draws after `join`; quantized attributes cut vertex fetch bandwidth ~40 % | Meshopt decode in main thread or worker; target ≤ 15 ms per 5 MB GLB on M1 | Vertex memory −40–60 % (quantized) | +≤ 20 KB gz lazy decoder chunk; 0 KB in initial bundle | Large: download and memory dominate mobile | Ship `source` variant via `typegen --variant source` |
| R2 | KTX2 UASTC/ETC1S + resize | Sharper hero textures at gameplay distance via correct budgets; no washed-out base colour once sRGB formats land | Compressed sampling is cheaper than RGBA8 (bandwidth ÷4–8) | Transcode in worker; one target only | Meshy hero 201 MB → ~17 MB (3× 2048 UASTC); Gravity Post > 500 MB → < 80 MB target | +527 KB raw basis WASM, lazy, cached, same-origin | Essential: ASTC/ETC2 native on mobile | RGBA8 transcode (always available) with tier cap |
| R3 | MikkTSpace tangents offline | Removes normal-map seam/shading errors on 98 of 120 GLBs | +16 B/vertex (8 B quantized) | Removes runtime Lengyel generation at load | +8–16 B/vertex | 0 | Neutral | Runtime Lengyel tangents today; derivative TBN if lane 04 ships it (not required) |
| R4 | LOD generation (MSFT_lod) + screen-coverage selection | Allows dense hero/world assets without popping; dither cross-fade | −30–70 % triangles in wide shots (estimate) | ≤ 0.2 ms/frame selection for 500 nodes | +40–60 % geometry bytes (LOD chain) | +~2 KB gz selector | Large win on vertex-bound GPUs | `lod: false` per model; LOD0 only |
| R5 | Collider generation | None directly; correct contacts/grounding feed game feel (lane 08 consumer) | 0 | Rapier hull build at load (≤ 5 ms/asset) | +5–20 % of geometry bytes in sidecar | 0 | Neutral | Bounds box colliders (current behaviour) |
| R6 | Visual-quality gates G1–G11, delete regex waiver | Stops programmer art and cards reaching release; forces PBR-complete assets | 0 | CI only | 0 | 0 | 0 | `candidate` label; no runtime effect |
| R7 | Generated-asset promotion (remesh + bake) | Best available 3D for the games (judge: Meshy mech ~6, Meshy plane ~7) becomes shippable at web budgets | Lower than today (27 MB raw heroes) | Remote Blender only | Hero 27 MB file → ≤ 6 MB target | 0 | Required for mobile | Keep as `candidate` |
| R8 | Curated hero library + 2k HDRIs | Coherent art direction per game; fixes style clashes judged in 5 games | Neutral | Neutral | Bounded by profiles | 0 (assets are not JS) | Mobile variants per kit | Existing assets until lane 14 swaps them (Q-14-3) |
| R9 | Look-dev viewer | Catches bad assets before they reach a game; separates asset vs renderer faults | Remote runner only | Remote only | — | 0 (separate app) | Captures 390×844 DPR 3 | Manual review on contact sheet |
| R10 | Decoder wiring + local transcoder | Makes R1/R2 usable from `model()`; removes third-party CDN | 0 | Worker transcode | Worker heap ≤ 32 MB | +≤ 3 KB gz registry glue in core | Same | Fail loud with `AssetDecoderUnavailable` diagnostic (no silent fallback) |
| R11 | Per-route typegen + deploy subset | Faster first frame | 0 | Parse 3.78 MB module removed | −3.6 MB JS heap per route | −~3.5 MB raw JS per route (281 suitability strings gone) | Large: mobile JS parse | Monolithic module generator kept behind `--all` for one minor |
| R12 | Tier texture caps | Prevents VRAM blowups; removes one plausible contributor to context loss (Courier Rush 1920 run lost its WebGL context, research 20 line 710; cause not established) | Bandwidth down on Low | None | Hard VRAM ceiling per tier (§17) | 0 | Essential | Cap 1024 globally if tier unknown |

---

## 7. APIs to add / change / remove

### 7.0 Relationship to the frozen contracts

The wire shapes of C-16 (`packages/assets/src/contracts/decoders.ts`, `packages/rendering/src/contracts/textureFormats.ts`)
and C-17 (`packages/aura3d-cli/src/contracts/assetManifest.ts`, `packages/engine/src/contracts/assets.ts`) are
frozen in CONTRACTS §2 and created by PR 0a; those contract files are lane 15's. Everything below either
re-exports those types unchanged or **extends** them additively in lane-05 files. Where this PRD needs more than
the contract carries, the extension lives here and the contract field stays as specified:

| Contract type | Contract shape (authoritative) | Lane-05 extension (own file) |
|---|---|---|
| `AssetQualityCheck` | `{ gate, verdict: "pass"\|"fail"\|"waived-by-role", measured: unknown, message }` | `AssetQualityCheckDetail` narrows `measured` to `Record<string, number\|string\|boolean>` (`admission/types.ts`); "not applicable for this role" is `waived-by-role` |
| `OptimizeStepRecord` | `{ step, ms, bytesBefore, bytesAfter }` | `OptimizeStepDetail extends OptimizeStepRecord { tool; settings }` (`optimize/types.ts`) |
| `AssetBudgetMeasurement` | `{ triangles, drawCalls, gpuBytesByTier, downloadBytes }` | `AssetBudgetMeasurementDetail` adds `fileBytes, vertices, primitives, materials, textures{count,maxDimension}` |
| `AuraCliAdmissionRecord` | `{ status, checks, at }` | adds `derivedHash`, `quality` |
| `AuraCliLookDevRecord` | `{ runUrl, reviews[{ reviewer, verdict, notes, at }] }` | adds `derivedHash`, `stageVersion`, `contactSheet`, `metrics`; each review adds optional `judge`, `score`, `axes` (C-32 `JudgeIdentity` for `judge`) |
| `optimizeAssets` | `({ ids?, dryRun?, profile? }) => Promise<{ rows[{ id, budget, checks }] }>` | `AssetOptimizeOptions` is a superset (same `ids` name); rows add the detail fields |
| `AssetDecoderRegistry` | `require(...)`, `diagnostics(): { loaded, failed[{id,url}] }`, `dispose()` | unchanged; registry options identical to `createAssetDecoderRegistry` |
| `AuraQualityTier` | C-27, `packages/rendering/src/contracts/quality.ts` (CONTRACTS §0 R1) | imported, never redefined |

Any further change to a contract file is a CCR (CONTRACTS §6.4: optional fields only), labelled `ccr`, filed by
lane 05 and approved by lane 15 plus one consumer. One is filed on day 0: **CCR-05-1** adds optional
`RenderItem.lodLevel?: number` and `lodLevels?: number` beside the pre-declared `lodFade?` (used only by the
integrated shadow-LOD request Q-02-1). No standalone phase needs a CCR.

### 7.1 CLI (`@aura3d/cli`)

```ts
// packages/aura3d-cli/src/optimize/types.ts (new)
// C-17 declares AssetOptimizeProfileId = string; the known ids live in tools/asset-optimize/profiles.ts.
export type AssetOptimizeProfileName =
  | "hero-character" | "npc-character" | "hero-vehicle" | "traffic-vehicle" | "product" | "weapon"
  | "prop-large" | "prop-small" | "world-chunk" | "track" | "backdrop" | "hdri";
export type { AssetOptimizeProfileId } from "../contracts/assetManifest";

export type AssetGeometryCompression = "meshopt" | "draco" | "none";
export type AssetTextureEncoding = "ktx2" | "webp" | "source";
export type AssetColliderMode = "auto" | "convex" | "trimesh" | "box" | "capsule" | false;

export interface AssetOptimizeOptions {
  readonly projectDir?: string;
  readonly ids?: readonly string[];                // C-17 name; omitted or ["*"] = whole manifest
  readonly profile?: AssetOptimizeProfileId;       // default: derived from role + bounds
  readonly geometry?: AssetGeometryCompression;    // default "meshopt"
  readonly textures?: AssetTextureEncoding;        // default "ktx2"
  readonly lods?: number | false;                  // default from profile
  readonly colliders?: AssetColliderMode;          // default from profile
  readonly fromGenerated?: boolean;                // run §6.5 remesh/bake pre-stage (remote only)
  readonly mobileVariant?: boolean;                // default true for character/vehicle/world
  readonly dryRun?: boolean;                       // measure + plan, write nothing
  readonly remote?: "github-actions" | "remote-worker" | false; // heavy steps refuse to run locally unless false + --allow-local-small
}

import type { AuraQualityTier } from "@aura3d/rendering/contracts/quality";          // C-27 (R1)
import type { AssetBudgetMeasurement, OptimizeStepRecord, AssetQualityCheck } from "../contracts/assetManifest"; // C-17

export interface AssetBudgetMeasurementDetail extends AssetBudgetMeasurement {     // triangles = LOD0
  readonly fileBytes: number;
  readonly vertices: number;
  readonly primitives: number;
  readonly materials: number;
  readonly textures: { readonly count: number; readonly maxDimension: number };
}

export interface OptimizeStepDetail extends OptimizeStepRecord {
  // step ∈ "weld" | "dedup" | "prune" | "join" | "palette" | "resize" | "tangents" | "lod"
  //      | "colliders" | "quantize" | "meshopt" | "draco" | "ktx2" | "remesh" | "bake"
  readonly tool: string;                           // e.g. "@gltf-transform/functions@4.x.y"
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface AssetQualityCheckDetail extends AssetQualityCheck {   // verdict "pass" | "fail" | "waived-by-role"
  readonly measured: Readonly<Record<string, number | string | boolean>>;
}

export interface AssetOptimizeRow {
  readonly id: string;                             // C-17 row key
  readonly sourceHash: string;
  readonly derivedHash: string;
  readonly profile: AssetOptimizeProfileId;
  readonly budget: AssetBudgetMeasurementDetail;   // C-17 field = "after"
  readonly before: AssetBudgetMeasurementDetail;
  readonly steps: readonly OptimizeStepDetail[];
  readonly checks: readonly AssetQualityCheckDetail[];
  readonly outputs: { readonly glb: string; readonly mobileGlb?: string; readonly collisionGlb?: string };
}

export interface AssetOptimizeResult { readonly ok: boolean; readonly rows: readonly AssetOptimizeRow[]; readonly manifestPath: string }
export function optimizeAssets(options: AssetOptimizeOptions): Promise<AssetOptimizeResult>;

// packages/aura3d-cli/src/lookdev/types.ts (new)
export interface AssetLookDevOptions {
  readonly assetIds: readonly string[];
  readonly group?: string;                         // route id for G10 coherence sheet
  readonly stage?: string;                         // default "lookdev.stage.json@1"
  readonly runner: "github-actions-macos-14";      // only accepted value; local capture is refused
}
// C-17 AuraCliLookDevRecord = { runUrl, reviews[{ reviewer, verdict, notes, at }] }; lane-05 extension:
export interface AuraCliLookDevRecordDetail extends AuraCliLookDevRecord {
  readonly derivedHash: string;
  readonly stageVersion: string;
  readonly contactSheet: string;                   // artifact path/URL
  readonly metrics: { readonly threeVsAuraMaskedSsim: number; readonly gameplayTexelsPerPixelP50: number };
  readonly reviews: readonly (AuraCliLookDevRecord["reviews"][number] & {
    readonly judge?: JudgeIdentity;                // C-32 { kind: "human" | "vision-model", id, model? }; reviewer = judge.id
    readonly score?: number;                       // 0-10 rubric mean; verdict = score >= 6.5 && min(axes) >= 4 ? "accept" : "reject"
    readonly axes?: Readonly<Record<"silhouette" | "surfaceDetail" | "materials" | "texelSharpness" | "lod" | "artifacts", number>>;
  })[];
}
export function captureAssetLookDev(options: AssetLookDevOptions): Promise<{ readonly runUrl: string }>;
export function recordAssetLookDevReview(assetId: string, review: AuraCliLookDevRecordDetail["reviews"][number]): AssetCliResult;

// packages/aura3d-cli/src/admission/types.ts (new)
export interface AssetAdmitOptions {
  readonly assetId: string;
  readonly quality: "candidate" | "release";
  readonly route?: string;                         // enables G10 route checks and gameplay camera from route profile
  readonly cameraDistance?: number;                // G2 override, metres
  readonly fovDegrees?: number;
  readonly viewport?: readonly [number, number];
}
// C-17 AuraCliAdmissionRecord = { status: "admitted" | "rejected" | "pending", checks, at }; lane-05 extension:
export interface AuraCliAdmissionRecordDetail extends AuraCliAdmissionRecord {
  readonly derivedHash: string;
  readonly quality: AuraAssetQuality;
}
export function admitAsset(options: AssetAdmitOptions): AssetCliResult & { readonly admission: AuraCliAdmissionRecordDetail };
```

CLI verbs. Dispatch for the existing verbs stays in `cli.ts` (lane 05 owns it); every new verb is registered
through C-39 `registerCliCommand({ name: "assets optimize", owner: "prd05", ... })` from
`packages/aura3d-cli/src/commands/prd05/index.ts`, so other lanes' commands (`animation inspect-clips` 06,
`assets bake-impostor` 10, `environments bake` 02, `assets transcode-audio` 09) register beside them without
touching `cli.ts`:

```
aura3d assets optimize <id...|--all> [--profile P] [--geometry meshopt|draco|none] [--textures ktx2|webp|source]
                       [--lods N|--no-lods] [--colliders auto|convex|trimesh|box|capsule|none] [--from-generated]
                       [--dry-run] [--remote github-actions|remote-worker]
aura3d assets lookdev <id...> [--group <route>]          # dispatches asset-lookdev.yml; prints run URL
aura3d assets review <id> --judge human|vision-model --judge-id <id> --score N --axes k=v,... --notes "..."
aura3d assets admit <id> --quality candidate|release [--route apps/<app>] [--camera-distance m] [--fov deg]
aura3d assets budget [--route apps/<app>] [--tier low|medium|high|ultra] [--json]
aura3d assets library list|add|sync
aura3d assets prune [--dry-run]
aura3d assets typegen [--route apps/<app>] [--variant optimized|source|mobile] [--all]
```

### 7.2 Manifest schema 1.1 (`asset-core-types.ts`, re-exporting C-17)

```ts
// AuraCliAssetRole: the C-17 union ("hero" | "character" | "vehicle" | "enemy" | "world" | "prop" | "set-dressing"
// | "backdrop" | "proxy" | "hdri" | "texture-set" | "vfx-atlas" | "audio"), re-exported; existing role strings
// outside it (e.g. "product", "weapon", "track", "environment") stay valid for 1.0 entries and map to profiles.
export type { AuraCliAssetRole, AuraCliDerivedAsset, AuraCliAssetEntry1_1 } from "./contracts/assetManifest";

// C-17 AuraCliDerivedAsset = { url, hash, mobileUrl?, collisionUrl?, profile, steps }; lane-05 extension:
export interface AuraCliDerivedAssetDetail extends AuraCliDerivedAsset {
  readonly sourceHash: string;
  readonly outputPath: string;
  readonly extensionsUsed: readonly string[];
  readonly requiredDecoders: readonly ("meshopt" | "draco" | "ktx2")[];
  readonly lods: readonly { readonly level: number; readonly triangles: number; readonly screenCoverage: number }[];
  readonly measurements: { readonly before: AssetBudgetMeasurementDetail; readonly after: AssetBudgetMeasurementDetail };
  readonly optimize?: "not-needed";
}

export interface AuraCliAssetManifest {
  readonly schema: "aura3d.assets/1.0" | "aura3d.assets/1.1";   // reader accepts both; writer emits 1.1 only with A3D_QR_ASSETS on (C-17 stub rule)
  // ...existing fields
}

export interface AuraCliAssetEntry {
  // ...existing fields (unchanged, including provenance and suitabilityReason)
  readonly derived?: AuraCliDerivedAssetDetail;
  readonly admission?: AuraCliAdmissionRecordDetail;
  readonly lookDev?: AuraCliLookDevRecordDetail;
  readonly artDirection?: string;
  readonly aliasOf?: string;                       // byte-identical source dedup
  readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number }; // G2 override (§6.4)
  readonly animationClips?: readonly { readonly name: string; readonly duration: number; readonly channelCount: number }[]; // C-17, for lane 06 (Q-05-1)
  readonly audio?: { readonly loudnessLufs?: number; readonly truePeakDb?: number; readonly author?: string; readonly sourceUrl?: string }; // for lane 09 (request received R-09-1)
}
```

### 7.3 Engine (`@aura3d/engine`)

All engine-side fields below are **pre-declared in PR 0a** (CONTRACTS C-17 "engine" block and §3.6) as optional
and inert, listed in `diagnosticOnly.prd05.ts` until lane 05 wires them. Lane 05 does not edit
`agent-api/index.ts` or `TypedGLBActor.ts`; it wires behaviour from its own files (§5.3).

```ts
// AuraQualityTier: imported from C-27 (packages/rendering/src/contracts/quality.ts, re-exported by engine). Not redefined.

// Pre-declared on AuraAssetDefinition (index.ts:951-960 today) by PR 0a:
export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: string;
  readonly url: string;                            // optimized derived URL when available
  readonly hash?: string;
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  readonly optional?: boolean;
  readonly metadata?: AuraAssetMetadata;          // typegen no longer emits licence/suitability strings into route modules
  readonly variants?: { readonly source?: string; readonly mobile?: string };
  readonly requiredDecoders?: readonly ("meshopt" | "draco" | "ktx2")[];
  readonly lods?: readonly { readonly level: number; readonly screenCoverage: number }[];
  readonly colliderUrl?: string;
  readonly budget?: { readonly triangles: number; readonly gpuBytesHigh: number };
}

export interface AuraModelOptions extends AuraTransformSpec {
  // ...existing
  readonly lod?: false | "auto" | { readonly bias?: number; readonly crossFadeSeconds?: number };  // default "auto" when asset.lods present
  readonly collider?: "auto" | "bounds" | false;   // "auto" uses asset.colliderUrl when physics is set
}

export interface AuraAppAssetOptions {
  readonly decoders?: {
    readonly basePath?: string;                    // default "/aura-decoders/"
    readonly meshopt?: boolean;                    // default true
    readonly draco?: boolean;                      // default "on demand" (true, lazy)
    readonly ktx2?: boolean;                       // default true
    readonly workerCount?: number;                 // default 1 low/mobile, 2 otherwise
  };
  readonly variant?: "optimized" | "source" | "mobile";   // default "optimized"; "mobile" auto on Low tier
  readonly maxTextureSize?: number;               // default from tier (§17)
}
// createAuraApp(options: { ...existing; readonly assets?: AuraAppAssetOptions })   // AuraCreateAppOptions.assets, pre-declared (C-38)

// TypedGLBActorOptions (TypedGLBActor.ts, owner 04): decoders?, maxTextureSize?, lod?, variant? pre-declared by PR 0a (§3.6).
// The actor interface itself is not extended; LOD control is exposed by lane 05's extension module:
// packages/engine/src/production-runtime/actor/TypedGLBActorLod.ts
export interface TypedGLBActorLodHandle {
  readonly levels: number;
  readonly level: number;
  setLevel(level: number, fadeSeconds?: number): void;     // forces "fixed" mode
  setMode(mode: "auto" | "fixed", options?: { readonly bias?: number; readonly crossFadeSeconds?: number }): void;
}
export function getTypedGLBActorLod(actor: TypedGLBActor): TypedGLBActorLodHandle | undefined;   // undefined when the asset has no MSFT_lod
export function registerTypedGLBActorLodExtension(): () => void;   // calls registerTypedGLBActorExtension({ id: "prd05.lod", owner: "prd05", flag: "A3D_QR_ASSETS_LOD", ... })

// packages/engine/src/agent-api/AssetDecoders.ts (lane 05)
export function createAppAssetDecoders(options: AuraAppAssetOptions | undefined, caps: CompressedTextureCapabilities, tier: AuraQualityTierSettings): AssetDecoderRegistry;
export function prepareModelDecoders(asset: AuraAssetDefinition, registry: AssetDecoderRegistry): Promise<AuraAssetDecoderSet>;   // throws AssetDecoderUnavailable
```

`ensureAssetDecoders` (`AssetDecoders.ts`, wrapping `ensureCompressedTextureSupport` at
`KTX2BasisTextureTranscoder.ts:277-293`) changes defaults to meshopt on, draco lazy, ktx2 on, with real probes
from the registry; its fail-closed probe defaults are removed.

### 7.4 Assets (`@aura3d/assets`)

```ts
export interface AuraAssetDecoderSet {
  readonly meshopt?: GLTFMeshoptDecoder;
  readonly draco?: GLTFDracoDecoder;
  readonly imageDecoder?: GLTFImageDecoder;       // KTX2-aware, tier-capped
}
export interface AssetDecoderRegistryOptions {
  readonly basePath: string;
  readonly capabilities: CompressedTextureCapabilities;   // from the device
  readonly maxTextureSize: number;
  readonly workerCount: number;
}
export interface AssetDecoderRegistry {   // C-16, exact
  require(decoders: readonly ("meshopt" | "draco" | "ktx2")[]): Promise<AuraAssetDecoderSet>;
  diagnostics(): { readonly loaded: readonly string[]; readonly failed: readonly { id: string; url: string }[] };
  dispose(): void;
}
export function createAssetDecoderRegistry(options: AssetDecoderRegistryOptions): AssetDecoderRegistry;

export interface CompressedTextureCapabilities {
  // astc: WEBGL_compressed_texture_astc / texture-compression-astc
  // bptc: EXT_texture_compression_bptc / texture-compression-bc
  // etc2: WEBGL_compressed_texture_etc / texture-compression-etc2
  // s3tc: WEBGL_compressed_texture_s3tc / texture-compression-bc; s3tcSrgb: WEBGL_compressed_texture_s3tc_srgb
  readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean;
}
export type KTX2BasisTargetFormat =
  | "astc-4x4-rgba-unorm" | "bc7-rgba-unorm" | "etc2-rgba8unorm" | "etc2-rgb8unorm" | "bc3-rgba-unorm" | "bc1-rgb-unorm" | "rgba8";
// Rendering side: `TextureCompressedFormat` (packages/rendering/src/Texture.ts:1, owner 06) gains
// "bc7-rgba-unorm" | "etc2-rgb8unorm" in PR 0a (C-16, declaration only, throwing defaults in exhaustive switches);
// lane 05 does not edit Texture.ts. The existing "bc1-rgba-unorm" is reused for BC1 targets.
// Colour slots on a device with s3tc but not s3tcSrgb select bptc if available, else rgba8 (never linear BC1/BC3
// for an sRGB slot).
export function selectKTX2TargetFormat(
  caps: CompressedTextureCapabilities,
  source: "uastc" | "etc1s",
  hasAlpha: boolean,
  colorSpace: "srgb" | "linear"
): KTX2BasisTargetFormat;

export interface KTX2BasisTextureTranscoderOptions {
  readonly targetFormat: KTX2BasisTargetFormat;   // now required; no "etc2" default
  readonly colorSpace: "srgb" | "linear";         // from the glTF slot; output keeps it
  readonly maxDimension?: number;                 // skip levels above
  readonly transcoderUrl: string;                 // same-origin; no CDN fallback
}
```

`DecodedGLTFImage.colorSpace` is set from the slot (`"srgb"` for base colour/emissive/sheenColor/specularColor),
and the lane-05 real of the C-16 slot `resolveCompressedTextureFormatSlot()` (provided from
`packages/rendering/src/lanes/prd05.ts`, implemented in `webgl2/TextureFormats.ts`, whose stub is the verbatim
moved `WebGL2Device.ts:4117-4133`) maps sRGB + compressed format to `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`,
`COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT`, `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`, `COMPRESSED_SRGB8_ETC2`,
`COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT` / `COMPRESSED_SRGB_S3TC_DXT1_EXT` (BC1 for ETC1S opaque). Every ETC2 format
is gated on `getExtension("WEBGL_compressed_texture_etc")` (today `0x9278` is uploaded unconditionally,
`WebGL2Device.ts:4128`, E13). With `A3D_QR_ASSETS_DECODERS` off the slot returns the stub (today's mapping).
Lane 04 reviews the mapping (shared review, conflict map row PRD-05→PRD-04) but does not block its merge.
`WebGPUDevice.ts` (owner 11) needs a compressed upload path (`writeTexture` per mip level with block-aligned
`bytesPerRow`, `-srgb`/`-unorm` variants, gated on `device.features`): request Q-11-1 with the exact format table
from §8 item 1; until it lands, WebGPU keeps uploading the RGBA8 fallback levels, which the transcoder produces on
demand when `capabilities` reports no WebGPU compressed feature.

### 7.5 Removed

| Symbol | File | Replacement |
|---|---|---|
| `requiresTextureEvidence` | `packages/aura3d-cli/src/index.ts:3376-3382` | G3/G10 |
| `hasHashBoundFlatColorMaterialEvidence` | `packages/aura3d-cli/src/index.ts:3164-3178` | G3/G5/G10 |
| Meshy `release` throw | `packages/aura3d-cli/src/meshy/import.ts:42` | §6.5 + G1–G11 |
| `optimizeIndexedMesh`, `createMeshOptimizationStage` | `packages/assets/src/MeshOptimization.ts` | `tools/asset-optimize` (re-export a thin meshoptimizer-backed `optimizeIndexedMesh` for one minor with `@deprecated`) |
| `createAssetImportPreflightReport` settings/stages | `packages/assets/src/AssetImportPreflight.ts:109-146` | `getAssetOptimizeProfile(id)` from `tools/asset-optimize/profiles.ts`; format detection kept |
| `KTX2LoaderThreeCompat` stub | `packages/assets/src/loaders/KTX2Loader.ts` | real loader on `AssetDecoderRegistry` |
| `createDefaultPerformanceLodLevels` | `packages/rendering/src/performance/LOD.ts:13-20` | `MSFT_lod` levels from the asset |
| unpkg CDN fallback | `packages/assets/src/KTX2BasisTextureTranscoder.ts:22` | vendored transcoder |

---

## 8. Shader changes

This PRD is mostly offline. Shader work is limited to what optimized assets and look-dev need, and it is
delivered only as C-02 chunks/features in lane-05 files (`shaders/lod-dither.glsl.ts`,
`shaders/debug-view.glsl.ts`); the legacy `ShaderLibraryCore.ts` / `ShaderLibrary.ts` / `ShaderChunks.ts` are
frozen (CONTRACTS §3.7) and are not edited. On the C-02 stub (`generateProgram` throws
`PROGRAM_GENERATOR_PENDING`) the chunks are compiled and unit-tested through `testing/ChunkHarness.ts`; their
pixels appear on screen only when lane 01's generator is real (integrated).

1. **Compressed sRGB sampling (GLSL/WGSL).** No math change: `a3dTexturedPbrDecodeSrgb` stays the identity
   (`ShaderLibrary.ts:2470-2472`, returns `max(encodedColor, 0)`) because decode happens in hardware sRGB
   formats (§7.4), exactly as for today's `SRGB8_ALPHA8` RGBA8 uploads (`WebGL2Device.ts:4067`). Required test:
   a KTX2 base colour texture and the same PNG render within ΔE2000 ≤ 2 mean (§15). WGSL (request Q-11-1): map to
   `astc-4x4-unorm-srgb`, `bc7-rgba-unorm-srgb`, `etc2-rgba8unorm-srgb`, `etc2-rgb8unorm-srgb`,
   `bc1-rgba-unorm-srgb`, `bc3-rgba-unorm-srgb` texture formats; no shader change.
2. **Quantized attributes.** Vertex shaders unchanged; `vertexAttribPointer(..., normalized = true)` for
   `KHR_mesh_quantization` SHORT/BYTE accessors (WebGL2, already "runtime-supported",
   `GLTFExtensionSupport.ts:44`) and `snorm16x4`/`unorm16x2`/`snorm8x4` vertex formats (WebGPU, Q-11-1).
   Positions dequantize through the node matrix gltf-transform writes. Instanced library props additionally need
   the `node.size` composition fix (`index.ts:14747-14754`), which CONTRACTS §0 R18 assigns to lane 15 as an
   unflagged correctness fix; lane 05 ships quantized assets regardless, and instanced-prop pixels are integrated.
   Skinned positions stay float (§6.3 step 8).
3. **LOD dither cross-fade.** Chunk `a3d_prd05_lod_dither` + feature `prd05.lodDither` registered with
   `registerShaderChunk` / `registerShaderFeature` at hook `fragment:alpha` (C-02), plus the same chunk as a C-11
   `registerDepthVariantFeature("prd05.lodDither")` for depth/shadow programs. Driven by the pre-declared
   `RenderItem.lodFade` (CONTRACTS §3.3 `RenderItem` row):
   ```glsl
   uniform float u_lodFade;            // 0 = fully visible; (0,1] fading out; [-1,0) fading in
   float a3dBayer4(vec2 p) {
     ivec2 i = ivec2(mod(p, 4.0));
     const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
     return (m[i.y * 4 + i.x] + 0.5) / 16.0;
   }
   #ifdef A3D_LOD_DITHER
     float t = a3dBayer4(gl_FragCoord.xy);
     if (u_lodFade > 0.0 ? t < u_lodFade : (u_lodFade < 0.0 && t > 1.0 + u_lodFade)) discard;
   #endif
   ```
   WGSL: same table in a `const` array, `@builtin(position)` for the pixel coordinate, in the chunk's `wgsl`
   field. Both LOD levels draw during the fade (complementary masks), default 0.25 s; disabled on Low tier (hard
   switch, also the behaviour while the generator is a stub).
4. **Look-dev debug views** (chunk `a3d_prd05_debug_view`, feature `prd05.debugView` at `fragment:end`, active
   only when the pre-declared `AuraCreateAppRendererOptions.debugView` is set by `apps/asset-lookdev`; never
   compiled into game bundles):
   - 1 base colour (post-decode linear → sRGB display), 2 world normal `n*0.5+0.5`, 3 roughness, 4 metallic,
     5 occlusion, 6 facet view `normalize(cross(dFdx(v_worldPos), dFdy(v_worldPos)))`.
   - 7 texel density: `vec2 t = fwidth(v_uv0 * vec2(textureSize(u_baseColorTexture, 0))); float tpp = max(t.x, t.y);`
     colour ramp on `log2(tpp)`: red < −1 (under 0.5 texels/pixel, blurry), green [−1, 2], blue > 2 (over 4,
     wasted). GLSL ES 3.00 `textureSize` replaces the earlier `u_baseColorTextureSize` uniform, so
     `GLTFRenderResources.ts` (owner 04) needs no change.
   - 8 mip level: `0.5 * log2(max(dot(dFdx(uvTex), dFdx(uvTex)), dot(dFdy(uvTex), dFdy(uvTex))))` bucketed.
   Until the generator is real, the Aura adapter's debug views are skipped and the same views are computed in
   the three adapter (`ShaderMaterial` with the identical GLSL), so G2/G6 visual checks stay standalone.
5. **No changes** to BRDF, IBL or tone mapping here (lanes 01–04 via C-02, C-03, C-05, C-09).

---

## 9. Rendering changes

- Model loading awaits decoders and passes them to the pipeline (E9) once Q-04-1 and Q-15-1 land; assets
  without compression extensions skip the registry (no added latency). Before that, the decoder path is exercised
  by lane tests calling `prepareModelDecoders` + `loadProductionGLTFRenderPipeline`.
- Texture uploads: compressed formats with full mip chain from KTX2 (no `generateMipmap` for compressed);
  tier cap skips top levels; RGBA8 fallback only when the selected compressed upload fails (the
  `COMPRESSED_TEXTURE_UNSUPPORTED` / `uploadRgba8FallbackTexture` path in `WebGL2Device.ts:3921-3946` is kept
  untouched, but transcoding to RGBA8 happens lazily, not up front). Mip-chain sampling follows C-12 (a single-level
  texture downgrades `linear-mipmap-linear` to `linear`).
- LOD selection runs per frame in `LodSelector.ts`, invoked from the `prd05.lod` actor extension's
  `collectRenderItems`: projected bounding-sphere height / viewport height vs `MSFT_screencoverage`, `bias`
  (default = C-27 `lodBias` × model `bias`) multiplies coverage, hysteresis 10 %, max one LOD step per frame per
  actor. Shadow casters one level coarser (`min(level + 1, maxLevel)`) is request Q-02-1 against C-11; until it
  lands, casters use the active level (correct, slightly more shadow triangles).
- Render-item count drops wherever `join` merges primitives; the draw-call estimate in `metrics.json` is checked
  against the renderer's measured draw calls (C-28 `counters()`) in the look-dev capture (difference > 10 % fails
  the capture).
- Collision sidecars are never rendered or uploaded to the GPU.
- HDRI entries (type `environment`, role `hdri`) are published as C-17 manifest entries with metadata
  (`sunDirection`, `luminanceP99`, `whiteBalanceK`) at 2k; lane 02 consumes them through its C-09
  `EnvironmentSource` (`environments.hdri`). Background visibility and PMREM are lane 02's.
- No change to sampler state: GLB textures already use `linear-mipmap-linear`, `repeat`, anisotropy 8
  (`GLTFRenderResources.ts:2196-2213`, research 03 §5.2); tiered anisotropy is lane 04/02 via C-12 (R9).

---

## 10. Migration plan

### 10.1 Triage of the 120 game-referenced models (classes from §2.4)

| Class | Count | Action | Resulting quality |
|---|---:|---|---|
| A. Real PBR sources (Objaverse/Sketchfab 34, NASA 5, OpenGameArt 1, Kenney 3) | 43 | `assets optimize` with role profile; re-admit through G1–G11; replace if G1/G9 fail (e.g. `siegeGolfBall`, `siegePlankSet`, `neonStreetLampProp`, `showcaseRoboticWeldingWorkcell` 704,582 tris) | `release` only after look-dev |
| B. Meshy (8) | 8 | §6.5 promotion: remesh 15–30k, bake, optimize; `pulseArena`, `mechHeroDecimated`, `patrolAircraftMeshy`, `skylineHeroRunner`, `galleryThief`, `courierVanMeshyV2Decimated`, `gravityPostMeshyFreight`, `rooftopShooterMeshyV1` | `candidate` → `release` on pass |
| C. Scripted geometry (`aura3d-original` + "procedural world") | 50 | reclassify role `proxy`, quality `prototype`; per-game replacement list published as C-40 facts + C-17 entries for lane 14 (Q-14-3) | `prototype` |
| D. 4-tri cards standing in for 3D subjects: character/vehicle roles (`skylineArcticRunnerHero`, `neonRainCourierHero`, `neonCrownMothElite`, `auroraExtractionLanderHero`), card "heroes/rivals" in set-dressing (`blockfallReactorMechanicHero`, `blockfallReactorPlasmaRival`), and gameplay platforms (`skylineIceLedgeCompact/Medium/Long`) | 9 | downgrade to `prototype`; replace with rigged/modelled library assets and modelled platform kit | `prototype` |
| E. Far plates (`auroraExtractionBayBackdrop`, `blockfallReactorArenaBackdrop`, `neonRainGardenArenaBackdrop`, `skylineWinterParallaxBackdrop`, `turboAlpineVenueBackdrop`) | 5 | role `backdrop`, `extras.aura3dBackdrop.minDistance`, re-encode KTX2 (the Skyline plate is the one element the judge rated excellent, research 21 line 1756) | `release` as backdrop |
| F. No-family Blender procedural kits with 128² palettes (`pulseReactorEncounterWorld`, `pulseRunnerCraft`, `pulseTerminalSentry`, `turboCircuitEnvironmentV2`) plus Blender-py kits inside class C with 32² palettes (`gravityPostCourierSkiff`, `gravityPostFreightDistrict`) | ~5 (+2 in C) | G2/G3 will fail; keep as `candidate` until replaced or re-textured with library tiling sets | `candidate` |

Class sizes come from research 11 §2.2/§2.4 and 19 C19 (A 43 + B 8 + C 50 + D 9 + E 5 + F ~5 = 120). They must
be regenerated by the migration script (`tools/asset-optimize/migrate-1.1.ts --report`) from the GLB JSON chunks
before any label change is committed; the script's table, not this one, is authoritative.

### 10.2 Steps

1. Ship schema 1.1 reader (accepts 1.0) and the `backdrop`/`proxy` roles (C-17 stub: writer stays 1.0 until
   `A3D_QR_ASSETS` is on; the root manifest is regenerated with the flag on in lane 05's own commits).
2. Run `assets optimize --all --dry-run` remotely; publish the before/after budget report as a CI artifact.
3. Run the migration script: compute G1–G11 for every `release` asset; write `admission` records; downgrade
   failing assets (`release` → `candidate`/`prototype`) in one reviewed commit with the report attached. No
   asset keeps `release` without passing. Labels change; URLs and pixels do not (routes keep the same files).
4. Optimize class A/B/E; capture look-dev; review; re-admit.
5. Switch typegen to per-route modules and derived URLs (`variant: "optimized"` default only when
   `A3D_QR_ASSETS` is on; flag off keeps source URLs).
6. Publish per-game replacement lists (class C/D/F) as `evidence/prd05/assets/replacement-lists.json` + C-40 rows;
   lane 14 applies them per route (Q-14-3).
7. Template starter assets: publish library replacements and the regenerated template manifests' expected diff
   as request Q-13-2 (lane 13 owns `packages/create-aura3d/templates/*/aura.assets.json`).
8. Delete stubs and the waiver (§7.5); skill wording is lane 13's (facts F-05-01..06, C-40; request Q-13-1).

---

## 11. Backward compatibility

- Runtime: with `A3D_QR_ASSETS` off (default until `integrated-accepted`, CONTRACTS §5.3) every route renders
  exactly as at `85aafcd0`: source URLs, stub decoder registry (wraps today's `GLTFCompressionDecoders.ts`),
  stub texture-format slot (verbatim moved function), no LOD extension registered, no collider sidecars. The
  flag-off sentinel identity check (CONTRACTS §6.1) runs on every lane-05 PR touching `packages/rendering/**` or
  `packages/engine/**`.
- The release-gate change (Phase 0) is CLI-only and declared in its PR as a correctness fix in the sense of
  CONTRACTS §6.1 (it changes labels, never pixels).
- `model(assets.x)` keeps its signature. URLs change (new derived hash); typed module consumers are unaffected.
- Manifest 1.0 files are read unchanged; `assets add` on a 1.0 manifest upgrades it to 1.1 in place with no
  field removal. `suitabilityReason`, `renderedProbe`, `provenance` are preserved.
- Release semantics change: third-party projects whose `--release` validation passed via the stylized regex will
  now fail. For one minor version, `--legacy-release-gates` restores 1.0 behaviour with a deprecation warning
  and an `admission.legacy: true` marker; the repo's own lane workflow `qr-prd05-gates.yml` greps the repo for
  that flag and fails if found.
- `ensureAssetDecoders` default change (meshopt on) is additive: uncompressed assets behave identically.
- `KTX2BasisTextureTranscoderOptions.targetFormat` becomes required and the CDN fallback is removed: callers of
  the low-level transcoder must pass a target and transcoder URL (breaking for direct callers). The one in-repo
  caller, `apps/loader-ktx2/src/main.ts:90`, is migrated in Phase 1 to pass `transcoderUrl: "/aura-decoders/basis/"`
  and a target from `selectKTX2TargetFormat`; its route-health test stays green.
- Monolithic `src/aura-assets.ts` generation stays available via `typegen --all` for one minor version.
- Removed stubs (`KTX2LoaderThreeCompat`, `createDefaultPerformanceLodLevels`, preflight settings) are exported
  with `@deprecated` and a runtime warning for one minor, then deleted.

---

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table is replaced by contracts. Lane 05 builds against each consumed
contract's PR 0a/0b stub and never waits for a provider's real implementation. What a stub can and cannot show
decides whether a criterion is standalone (§16.0) or integrated (§16.4). Facts from the old table that were
consumer relationships (lanes 07, 10, 13, 14 using assets) are now rows of §12.1 and §12.4.

### 12.1 Contracts provided

| ID | Name | Surface lane 05 provides | Stub that must keep working (PR 0a, CONTRACTS) | Real (lane 05) | Consumers |
|---|---|---|---|---|---|
| C-16 | Compressed textures + decoder registry | `selectKTX2TargetFormat`, `KTX2BasisTextureTranscoderOptions` (required `targetFormat`, same-origin `transcoderUrl`), `createAssetDecoderRegistry`, `AssetDecoderUnavailable`, `resolveCompressedTextureFormatSlot()`, `CompressedTextureCapabilities`, `TextureCompressedFormat` members `bc7-rgba-unorm`/`etc2-rgb8unorm` | `selectKTX2TargetFormat` real (pure table); registry wraps `GLTFCompressionDecoders.ts` loaders; slot stub = verbatim `resolveCompressedTextureFormat` (`WebGL2Device.ts:4117-4133`) | `AssetDecoderRegistry.ts` + `vendor/{basis,draco}` + `KTX2TranscodeWorker.ts`; sRGB/BPTC/gated-ETC2 in `webgl2/TextureFormats.ts`; `slot.provide` in `packages/{assets,rendering}/src/lanes/prd05.ts`; flag `A3D_QR_ASSETS_DECODERS` | 04 (KTX2 material textures, R6), 07 (KTX2 flipbook atlases), 10 (terrain/foliage KTX2) |
| C-17 | Asset manifest 1.1 / AssetOptimize / admission | schema `aura3d.assets/1.1`, roles, `AuraCliDerivedAsset`, `AuraCliAdmissionRecord`, `AuraCliLookDevRecord`, `optimizeAssets`, gates G1–G11, engine fields (`variants`, `requiredDecoders`, `lods`, `colliderUrl`, `budget`; `AuraModelOptions.lod/collider`; `AuraCreateAppOptions.assets`) | reader accepts 1.1 and ignores unknown fields; writer emits 1.0 until `A3D_QR_ASSETS` on; engine fields DIAGNOSTIC_ONLY (owner 5); clip consumers use `AuraCliAnimationClipInspection` | `tools/asset-optimize/`, `packages/aura3d-cli/src/{admission,lookdev,optimize}/`, `apps/asset-lookdev/`, `assets/library` (≥ 6 HDRIs at 2k) | 06 (clip metadata, rigged heroes), 07 (VFX atlas admission), 09 (SFX pack provenance), 10 (world content), 13 (templates, catalog phrases), 14 (kits K1–K9, replacement lists), 15 (manifest stops emitting lean imports) |

Registry entries lane 05 provides into other contracts: C-02 chunks `a3d_prd05_lod_dither`, `a3d_prd05_debug_view`
and features `prd05.lodDither`, `prd05.debugView`; C-11 depth feature `prd05.lodDither`; C-14/`RenderItem.lodFade`
values; C-31 section `assets` (decoders loaded/failed, selected KTX2 target per slot, LOD level histogram,
texture bytes by format); C-36 `diagnosticOnly.prd05.ts` entries for every C-17 engine field until wired, plus
option-coverage rows (`model.lod`, `model.collider`, `createAuraApp.assets.variant`, `.maxTextureSize`); C-39
commands `assets optimize|lookdev|review|admit|budget|library|prune` and codemod `assets-route-modules`; C-30 lane
scenes `prd05-asset-lod-transition`, `prd05-lookdev-hero`, `prd05-optimized-{damaged-helmet,pbr-product,skinned,
outdoor,game-scene}`; C-40 facts `F-05-*`; TypedGLBActor extension `prd05.lod` (CONTRACTS §3.6).

Conformance suites that must pass for both `stub` and `real` (lane 15-owned): `tests/unit/contracts/C-16-ktx2.test.ts`
(driven by `tests/unit/assets/ktx2-target-format.table.json`, which lane 05 authors: 128 rows), and
`tests/unit/contracts/C-17-manifest.test.ts` (1.0/1.1 round trip; gate purity). Lane 05 adds
`tests/unit/contracts/impl/prd05-{decoders,texture-formats,manifest,gates}.test.ts` for its real implementations.

### 12.2 Contracts consumed

| ID | Name | Provider | What lane 05 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-02 | ProgramFeatures, chunk registry, ProgramCache | 01 | `registerShaderChunk`, `registerShaderFeature` (`fragment:alpha`, `fragment:end`), `ChunkHarness` | registries real (store/validate); `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; ChunkHarness real | chunk compile + Bayer mask unit test standalone; on-screen dither/debug views integrated |
| C-05 | Output (tone map, exposure) | 01 | Aura adapter output settings matching the three adapter (ACES, same exposure) | today's output path | three-adapter G9 standalone; Aura-vs-three gap integrated |
| C-09 | EnvironmentSource | 02 | Aura adapter loads the look-dev HDRIs through `environments.hdri` | legacy environment path | Aura look-dev frames integrated; HDRI files themselves standalone |
| C-11 | Depth-variant hook | 02 | `registerDepthVariantFeature("prd05.lodDither")` | features stored, applied once lane 02's `DepthPass` consumes them | shadow dither/LOD+1 integrated |
| C-12 | Sampler descriptors | 02 | single-mip downgrade rule; KTX2 mip chains | fields inert; `resolveSamplerAnisotropy` real | standalone |
| C-15 | Model material overrides | 04 | tint must multiply, not strip maps (E-§2.6) | today's `replaceSurfaceTextures: true` | game asset visuals integrated only |
| C-27 | QualityTier settings | 11 | `tier`, `maxTextureSize`, `textureBudgetBytes`, `lodBias` | real data (pure table); `"auto"` → high desktop / medium coarse pointer | standalone |
| C-28 | Device capabilities | 11 | `DeviceProbe.maxTextureSize`, `counters()` (draw calls, texture uploads) | probe real; counters partial | standalone (lane harness counts draws itself where counters are partial) |
| C-29 | Renderer factory / WebGPU | 11 | WebGPU decode runs | today's backend selection | WebGPU compressed formats integrated (Q-11-1) |
| C-30 | Benchmark scene registry | 12 | lane scene index `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/`, `ReadyPayloadV2.qrFlags` | registry wraps 18 base scenes + lane indices | standalone (own scenes) |
| C-31 | Diagnostics sections | 12 | `registerDiagnosticsSection({ key: "assets" })` | section present with null values | standalone |
| C-32 / C-33 | Rubric + capture harness | 12 | `judgeWithPrism`, `JudgeIdentity`, step plugins, `--flags` passthrough | today's capture scripts + plugin loading + `a3d-qr=` passthrough | standalone screening; acceptance only at G-PANEL |
| C-35 | Art direction + game acceptance schema | 14 | `assets/art-direction/<id>.json` shares the C-35 palette/shading fields | schema file (data) | standalone |
| C-36 | SceneCompiler extension points | 15 | `SceneCompileContext.quality/flags`, `degrade("texture-upgrade-failed" \| "capability-degraded")`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage` | wraps the moved legacy compiler | standalone |
| C-38 | App surface registry | 15 | pre-declared `AuraCreateAppOptions.assets`, `AuraCreateAppRendererOptions.debugView` | real in PR 0 | standalone |
| C-39 | CLI command / codemod registry | 15 | `registerCliCommand`, `registerCodemod` | real in PR 0 (fallthrough in 0b-3) | standalone |
| C-19 | AnimationPlayback API | 06 | library character kits: clip strip in look-dev (`tracksApplied > 0`) | `crossFadeTo` = `node.play`; `animationState()` reads today's result | clip presence (inspection) standalone; moving characters in games integrated |
| C-40 | Facts handoff | each lane → 13 | rows `F-05-*` | n/a | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R1 (`AuraQualityTier` imported from C-27, not defined
here), R6 (this PRD's 4-argument `selectKTX2TargetFormat` is the contract; lane 04 consumes it), R18 (instance
`node.size` fix is lane 15's), R20 (skills/templates written by lane 13 from facts), R21 (route `main.ts` edits are
lane 14's; lane 05 ships codemods and lists).

### 12.3 Requests to other lanes (non-blocking)

Filed on day 0 as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). Lane 05 never waits: each row names what
lane 05 does meanwhile; any criterion that needs the change is evaluated at the next checkpoint after it lands.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-02-1 | 02 | `DepthPass.ts`: compose the registered `prd05.lodDither` depth feature; select caster LOD `min(level + 1, maxLevel)` from `RenderItem.lodLevel`/`lodLevels` (optional fields added by CCR-05-1, §7.0) | C-11 | casters use the active level; shadow dither absent (hard switch) |
| Q-02-2 | 02 | `EnvironmentSource`: advertise whether KTX2 `R16G16B16A16_SFLOAT`/UASTC-HDR input is accepted | C-09 | `hdri` profile keeps RGBE `.hdr` |
| Q-04-1 | 04 | `TypedGLBActor.ts:184-191`: forward the pre-declared `options.decoders.{meshopt,draco,imageDecoder}` and `options.maxTextureSize` into `loadProductionGLTFRenderPipeline` (one-line spread; the pipeline already accepts them, `ProductionGLTFRenderPipeline.ts:6-25`); confirm the `registerTypedGLBActorExtension` hook runs `collectRenderItems` after material overrides | C-16, §3.6 | lane tests and look-dev call the pipeline directly with registry decoders |
| Q-04-2 | 04 | `GLTFExtensionSupport.ts` via `tools/generate-extension-matrix.mjs`: register `MSFT_lod` (`runtime-supported`, `GLTFLoader` + `TypedGLBActorLod`), `KHR_texture_basisu` and `EXT_meshopt_compression` as `runtime-supported` when the registry is real | §4.3 generated-file | lane-05 `GLTFLoader.ts` parses `MSFT_lod` regardless of the matrix |
| Q-04-3 | 04 | Review (not approve-gate) the sRGB compressed-format mapping in `webgl2/TextureFormats.ts` | C-16 | merges on lane 05 tests; review comments land as follow-ups |
| Q-11-1 | 11 | `WebGPUDevice.ts`: compressed upload path (`writeTexture` per mip, block-aligned `bytesPerRow`) for the §8 item 1 format table; request `texture-compression-astc|bc|etc2` at device creation; report them through `CompressedTextureCapabilities`; quantized vertex formats `snorm16x4`/`unorm16x2`/`snorm8x4` | C-16, C-29 | WebGPU capabilities report none → transcoder emits RGBA8 levels (correct, more VRAM) |
| Q-11-2 | 11 | C-27 table: confirm `maxTextureSize` stays the device ceiling and lane 05 applies per-role caps (§17.1) below it; confirm `lodBias` semantics (coverage multiplier) | C-27 | lane 05 uses `min(C-27 cap, role cap)` and `lodBias` as coverage multiplier |
| Q-12-1 | 12 | Include `prd05-*` lane scenes in checkpoint captures (automatic via C-30 registry); add `public/aura-decoders/**`, `assets/library/**` LFS paths to `ci.sh`; rubric prompt lines for asset texel sharpness and LOD pops | C-30, C-32 | lane workflows capture their own scenes |
| Q-13-1 | 13 | Rewrite `packages/aura3d-cli/skills/{aura3d-assets/SKILL.md:109, meshy-cli/SKILL.md:56-66, aura3d-performance/SKILL.md, aura3d-materials-environments/SKILL.md:9-10}` from facts F-05-01..06, then `pnpm skills:sync` / `pnpm check:skills` | C-40 | facts published `proposed` → `verified` |
| Q-13-2 | 13 | Replace starters in `packages/create-aura3d/templates/{product-viewer,racing-starter,mini-game,fighting-game,character-controller,falling-blocks-starter}/aura.assets.json` with library ids (exact entries published in `evidence/prd05/assets/template-starters.json`); copy `/aura-decoders/` into template builds | C-17, C-40 | lane fixture project `tests/qr/prd05/fixtures/template-starter/` proves the entries pass G1–G11 |
| Q-13-3 | 13 | Template opt-in to `A3D_QR_ASSETS` once `standalone-accepted` | §5.4 | none needed |
| Q-14-1 | 14 | `apps/showcase-*/scripts/{register-models,register-assets}.mjs`: pass `--quality prototype --role proxy` for scripted geometry so re-runs cannot re-register `release` | C-17 | `assets add --quality release` already errors (Phase 0), so the scripts cannot re-promote |
| Q-14-2 | 14 | Run `aura3d codemod assets-route-modules --write` on every `apps/showcase-*/src/main.ts` (import `src/aura-assets.route.ts`) | C-39 | monolithic module still generated; report attached |
| Q-14-3 | 14 | Apply per-game replacement lists (§10.1 classes C/D/F) and the six pilot swaps (Skyline Runner, Mech Hangar, Courier Rush, Vault Breakers, Gravity Post, Bank Shot) | C-17, C-35 | lane scenes show the library assets in isolation |
| Q-14-4 | 14 | `tools/quality-rebuild-capture/games.json`: add `qrFlags: ["A3D_QR_ASSETS"]` for swapped routes | C-33 | checkpoint `all` run covers them |
| Q-15-1 | 15 | `compiler/renderer.ts` (ex-`index.ts:13540-13841`), model-node actor creation: `await prepareModelDecoders(asset, app.assetDecoders)` from `agent-api/AssetDecoders.ts` and pass the result as `TypedGLBActorOptions.decoders`; on `AssetDecoderUnavailable` call `ctx.degrade({ code: "capability-degraded" })` (throw under strict) | C-16, C-36 | lane tests drive the pipeline directly |
| Q-15-2 | 15 | Model physics binding: when `physics` is set and `asset.colliderUrl` exists and `collider !== "bounds"`, call `createCollidersFromSidecar` (physics-rapier, lane 05) instead of the bounds box | C-17, C-36 | option DIAGNOSTIC_ONLY; lane physics test calls the API directly |
| Q-15-3 | 15 | `root-manifest` batch: pin `draco3d` `^1.5.7` → `1.5.7` in root `package.json:731`; root script `"assets:optimize": "aura3d assets optimize"` | §4.4 | tools pin `draco3d@1.5.7` in their own `package.json` |
| Q-15-4 | 15 | Agree the export shape of `src/aura-assets.route.ts` (package boundary) and that `assets/GLTFLoader.ts` stays the single glTF parser | C-17 | generator emits the shape in §6.9 |

### 12.4 Requests received (lane 05 delivers; no other lane waits on them)

| From | Request (conflict map) | Lane 05 delivery | Consumer meanwhile |
|---|---|---|---|
| 06 (Q-05-1) | clip `duration`, `hasRootMotionCandidate`, `frameRate?` in inspection/typegen | Phase 0: `inspectGltfAnimations` (`index.ts:2112`) calls lane 06's `commands/prd06/inspectAnimationClips.ts`; `asset-manifest.ts` emits C-17 `animationClips` | runtime durations (06 T0.6) |
| 06 (Q-05-2) | rigged `hero` humanoid (≥ 15k tris, ≥ 50 joints, clip set), fighter pair, ARKit-52 head, hero LODs | Phase 5 library `characters/humanoid-pbr` + `robots-mechs`; head asset candidate list | repo rigs by path |
| 09 (R-09-1) | `assets add --type audio` with licence/sourceUrl/author/loudness metadata; audio provenance rule in `validate --release` | Phase 0: C-17 `audio` field + release rule (synth allowlist); transcode is lane 09's own command `assets transcode-audio` registered via C-39 in `commands/prd09/` | lane 09 records metadata in its pack manifest |
| 10 | `texture-set`, `hdri`, 16-bit/R32F/EXR height textures; KTX2 encode; Meshopt + LOD1 GLBs; impostor atlas registration | Phases 2 and 5 (profiles + roles); `assets bake-impostor` is lane 10's C-39 command | lane 10 commits pinned one-off encodes |
| 04 | KTX2/UASTC/ETC1S, Draco, Meshopt fixtures; MikkTSpace tangent bake | Phase 2 `tools/asset-optimize` outputs published as fixtures under `tests/qr/prd05/fixtures/encoded/` (lane 04 copies into its `fixtures/asset-corpus/`) | lane 04's pinned one-off CI encode |
| 07 | K9 VFX atlas sheets as KTX2 `vfx-atlas` role | Phase 5 admission | existing transcoder |
| 12 | 2k CC0 HDRIs (studio, outdoor, night), ground texture set, street kit, provenance format | Phase 5 `assets/library/hdri/` + `credits.json`; lane 12 references them from its own `fixtures/environment-corpus/hdri/manifest.json` | lane 12's existing 1k HDRIs |
| 13 | HDRIs and curated game packs with profile targets; skill rule facts | Phase 5; facts F-05-01..06 | typed catalog assets |
| 14 | `assets admit/optimize/lookdev/budget` verbs to admit kits K1–K9 | Phases 2–4 | current `assets add` |

Third-party code vendored by this lane: `basis_transcoder.{js,wasm}` (three 0.185.1 copy, Apache-2.0, sha256 in
`vendor/basis/README.md`) and `draco3d@1.5.7` decoder (Apache-2.0). Both appear in the generated
`LICENSE-THIRD-PARTY` (lane-05 generator, §4.3).

---

## Parallel execution

### Day-0 start conditions

Lane 05 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`packages/assets/src/contracts/decoders.ts`; `packages/rendering/src/contracts/{core,program,shadows,sampling,
textureFormats,quality,device,renderItem,index}.ts` and `testing/ChunkHarness.ts`;
`packages/engine/src/contracts/{flags,assets,diagnostics,compiler,app,index}.ts` and `stubs/*`;
`packages/aura3d-cli/src/contracts/{assetManifest,commands}.ts` and `src/commands/{registry.ts,prd05/index.ts}`;
the C-16/C-17 pre-declared fields on `Texture.ts`, `index.ts` (`AuraAssetDefinition`, `AuraModelOptions`,
`AuraCreateAppOptions.assets`), `TypedGLBActorOptions` and `RenderItem.lodFade`; the lane barrels
`packages/{assets,engine,rendering,aura3d-cli}/src/lanes/prd05.ts`, `agent-api/compiler/diagnosticOnly.prd05.ts`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/index.ts`; the conformance harness.
Nothing from any other lane's real implementation is needed.

Work in files lane 05 owns outright starts on day 0: all of Phase 0 (CLI gates, manifest 1.1, migration report),
`tools/asset-optimize/**`, `packages/assets/src/{AssetDecoderRegistry,KTX2TargetSelection,KTX2TranscodeWorker,
KTX2BasisTextureTranscoder,GLTFCompressionDecoders,GLTFLoader,MeshOptimization,AssetImportPreflight}.ts`,
`loaders/`, `vendor/`, `agent-api/AssetDecoders.ts`, `LodSelector.ts`, `shaders/{lod-dither,debug-view}.glsl.ts`,
`physics-rapier`, `asset-index`, `apps/{asset-lookdev,loader-ktx2}`, library sourcing, lane scenes and tests.
Edits to carved regions start when the PR 0b part containing them merges (≤ 2026-10-07); until then the
replacement is written in the new lane module and wired after the merge:
- PR 0b-2: `webgl2/TextureFormats.ts` (carve of `WebGL2Device.ts:4117-4133`), C-16 slot seam, C-11 seam.
- PR 0b-3: `gltf/ImageDecode.ts` (carve of `GLTFRenderResources.ts:2216-2241`), TypedGLBActor extension hook
  (`actor/TypedGLBActorLod.ts` registration), C-39 CLI fallthrough.
- PR 0b-1: C-31/C-36/C-38 seams (diagnostics section, option coverage).

### Owned files and directories (must match CONTRACTS §4.1)

`packages/assets/` default (decoders, `KTX2*`, `KTX2TargetSelection.ts`, `GLTFLoader.ts`, `MeshOptimization.ts`,
`AssetImportPreflight.ts`, `vendor/`, `loaders/`, `gltf/ImageDecode.ts`); `packages/rendering/src/webgl2/TextureFormats.ts`,
`performance/LOD.ts`, `shaders/{lod-dither,debug-view}.glsl.ts`; `packages/engine/src/agent-api/AssetDecoders.ts`,
`production-runtime/LodSelector.ts`, `production-runtime/actor/TypedGLBActorLod.ts`; `packages/aura3d-cli/` default
(`cli.ts`, `cli-help.ts`, `index.ts`, `asset-*`, `admission/`, `lookdev/`, `optimize/`, `meshy/`, `pull-bridge/`,
`cli-options.ts`, `tests/`); `packages/asset-index/`; `packages/physics-rapier/` (except `HeightfieldLayout.ts`);
`apps/{asset-lookdev,loader-ktx2}/`; `assets/` default (`library/`, `art-direction/`); `public/{aura-assets,aura-decoders}/`;
`aura.assets.json`, `aura.library.json`, `src/aura-assets.ts`, `LICENSE-THIRD-PARTY` (generated); `tools/asset-optimize/`;
`.github/workflows/{asset-lookdev,asset-optimize}.yml`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd05,prd-05}/`,
`packages/*/src/lanes/prd05.ts`, `agent-api/compiler/diagnosticOnly.prd05.ts`, `packages/aura3d-cli/src/commands/prd05/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/`, `.github/workflows/qr-prd05-*.yml`,
`tests/qr/prd05/`, `tests/unit/contracts/impl/prd05-*`. New test files elsewhere under `tests/` belong to this lane
by the creator rule.

Exclusions inside lane-05 defaults that belong to others (longest prefix): `packages/assets/src/{GLTFRenderResources,
GLTFExtensionSupport,MikkTSpaceTangents}.ts` and `asset-corpus/ProductionGLTFRenderPipeline.ts` (04);
`packages/assets/src/GLTFAnimationRuntime.ts` (06); `packages/assets/src/{asset-corpus/ (default),AdvancedAssetCorpus.ts}`
and all `contracts/` folders (15); `packages/aura3d-cli/src/{animation-asset-validator,asset-inspection-types}.ts` (06);
`packages/aura3d-cli/skills/**`, `src/look/` (13); `packages/aura3d-cli/src/{migrate-three,codemods}/`,
`src/commands/registry.ts` (15); `packages/physics-rapier/src/HeightfieldLayout.ts` (10); `assets/packs/game-sfx-core/` (09).

Tasks of the earlier draft that edited files owned by other lanes were converted (table §5.3): to extension points
(`TypedGLBActor.ts` LOD → actor extension; `ShaderLibraryCore.ts`/`ShaderLibrary.ts` → C-02 chunks + C-11 depth feature;
`WebGL2Device.ts` → carved `webgl2/TextureFormats.ts`; `GLTFRenderResources.ts` decode → carved `gltf/ImageDecode.ts`;
`u_baseColorTextureSize` → GLSL `textureSize`; `Texture.ts` union → PR 0a pre-declaration; `index.ts` option/asset
fields → PR 0a pre-declarations + C-36 DIAGNOSTIC_ONLY; `shared/assets.ts` → lane scene dir; `browser-matrix.yml`/
`ci.yml` → `qr-prd05-*.yml`; root devDependencies → workspace manifests; CLI verbs → C-39) or to §12.3 requests
(`TypedGLBActor.ts` decoder forwarding, `GLTFExtensionSupport.ts`, `WebGPUDevice.ts`, `DepthPass.ts`,
`compiler/renderer.ts`, model physics binding, root `package.json`, skills, templates, showcase scripts and routes,
`games.json`).

### Extension points used in files owned by others

| Host file (owner) | Extension point | Lane-05 registrant |
|---|---|---|
| generated programs (01) | C-02 `registerShaderChunk("a3d_prd05_lod_dither" \| "a3d_prd05_debug_view")`, `registerShaderFeature("prd05.lodDither" @ fragment:alpha, "prd05.debugView" @ fragment:end)` | `shaders/{lod-dither,debug-view}.glsl.ts`, `packages/rendering/src/lanes/prd05.ts` |
| `WebGL2Device.ts` (01) | C-16 `resolveCompressedTextureFormatSlot().provide(real)` at the 0b-2 seam (call site :3922) | `webgl2/TextureFormats.ts` |
| `DepthPass.ts` (02) | C-11 `registerDepthVariantFeature("prd05.lodDither")` | `shaders/lod-dither.glsl.ts` |
| `TypedGLBActor.ts` (04) | `registerTypedGLBActorExtension({ id: "prd05.lod", owner: "prd05", flag: "A3D_QR_ASSETS_LOD", onLoad, collectRenderItems, dispose })` | `actor/TypedGLBActorLod.ts` |
| `GLTFRenderResources.ts` (04) | 0b-3 carve: `decodeImageInBrowser` → `gltf/ImageDecode.ts` (default `imageDecoder` at `:397`) | `gltf/ImageDecode.ts` |
| `app/createAuraApp.ts` (15) | C-38 pre-declared `AuraCreateAppOptions.assets`, renderer `debugView`; registry created in `AssetDecoders.ts` from the lane barrel's app hook | `packages/engine/src/lanes/prd05.ts` |
| `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection({ key: "assets" })` | same |
| compiler (15) | C-36 `DIAGNOSTIC_ONLY_FIELDS` (`diagnosticOnly.prd05.ts`), `registerOptionCoverage`, `ctx.degrade` | `diagnosticOnly.prd05.ts`, `lanes/prd05.ts` |
| `aura3d-cli/src/commands/registry.ts` (15) | C-39 `registerCliCommand`, `registerCodemod("assets-route-modules")` | `commands/prd05/index.ts` |
| `capture-games.mjs` (12) | C-33 `--flags` passthrough (no step plugin needed) | — |
| `shared/registry.ts` (12) | C-30 lane scene index | `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/index.ts` |

### Feature flags (CONTRACTS §5)

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_ASSETS` | bool | manifest writer 1.1, derived URLs in typegen (`variant: "optimized"`), engine C-17 fields wired, per-route modules, tier texture cap, mobile variant on Low, C-31 `assets` values | `assets.variant: 'optimized' \| 'source'` (off = `source`) |
| `A3D_QR_ASSETS_DECODERS` | bool | real C-16 registry (vendored decoders, worker transcode, single target), real texture-format slot (sRGB/BPTC/gated ETC2) | `assets.decoders.*` |
| `A3D_QR_ASSETS_LOD` | bool | `prd05.lod` actor extension, `prd05.lodDither` chunk/feature registration | `model({ lod })`, `assets.lod: false` |

CLI-only changes (gates G1–G11, `assets optimize/lookdev/admit/...`, migration) ship directly behind CLI options,
like lane 12's tooling. Flag state transitions happen only at checkpoints (CONTRACTS §5.3).

### Stubs used

C-02 (`PROGRAM_GENERATOR_PENDING`; ChunkHarness real), C-05 (today's output), C-09 (legacy environment), C-11
(features stored, not applied), C-12 (fields inert; anisotropy table real), C-15 (today's tint bridge), C-19 (node.play
facade), C-27 (real data), C-28 (probe real, counters partial), C-29, C-30, C-31, C-32, C-33, C-35 (data), C-36,
C-38/C-39 (real). Lane 05's own stubs (C-16 registry wrapping `GLTFCompressionDecoders.ts`, verbatim format slot;
C-17 1.0 writer, DIAGNOSTIC_ONLY engine fields) stay the flag-off path until CONTRACTS §5.4 removal.

### Integration checkpoints (CONTRACTS §7)

Integrated acceptance (§16.4) is evaluated only at checkpoints with `A3D_QR_ASSETS` (and sub-flags) on inside
`qr_flags=all`, and never blocks a lane-05 merge:
- IC-0 (2026-10-08): flags `none` baseline; lane 05 records per-game ready bytes, model counts, texture bytes by
  format and `modeling_assets` scores (should reproduce research 21: games 1.5–4/10, mean ≈ 3.0).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening (vision-only, recorded, cannot accept). First expected
  integrated signal: derived URLs + real decoders on routes that opted in (needs Q-04-1, Q-15-1).
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds; the only rounds that can move
  `A3D_QR_ASSETS` to `integrated-accepted`. Leave-one-out (`all,-assets`) attributes deltas between asset work and
  renderer lanes (01–04) on the same routes.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7). Unresolved Q-*
requests are listed in each checkpoint report.

---

## 13. Implementation phases

Each phase ends only when its exit criteria are met on the remote lanes named in §15. "Tests pass" alone never
satisfies a phase whose criterion is visual. Every exit criterion below is **standalone** (lane-05 files + PR 0
stubs only); integrated outcomes are §16.4 and never gate a phase. Phases 0, 1, 2 and 4 have no ordering between
them beyond shared code and are staffed in parallel from day 0; Phase 3 needs Phase 2's simplifier output for its
exit test only (its runtime half starts day 0 on synthetic `MSFT_lod` fixtures); Phase 5 needs Phase 4's look-dev
for admission; Phase 6 needs Phase 2's derived files.

**Phase 0 — Gate honesty (no new tooling). Starts day 0 after PR 0a; all files lane-05-owned.**
Delete the regex waiver and flat-colour evidence waiver; schema 1.1 types; `backdrop`/`proxy` roles; offline
G1, G3, G4, G5, G8, G11 checks computed from GLB JSON; migration report; downgrade commit.
Exit: `tools/asset-optimize/migrate-1.1.ts --report` artifact committed under
`docs/project/aura3d-quality-rebuild/evidence/prd05/assets/migration-1.1.json`; 0 assets in the root manifest
hold `release` while failing G1/G3/G4/G5 (template manifests are reported in the same file and applied by lane 13,
Q-13-2); unit tests for each gate with the shipped failing examples
(`rooftopBackboard`, `skylineArcticRunnerHero`, `mechChassisA`, `vaultBreakersTable`) as fixtures; C-17
conformance green for stub and real.

**Phase 1 — Decode path. Starts day 0 (registry, transcoder, target table, vendoring); carved files after PR 0b-2/0b-3.**
`AssetDecoderRegistry` (C-16 real); `prepareModelDecoders`; vendored basis transcoder, CDN removed; target
selection; sRGB compressed formats in `webgl2/TextureFormats.ts`; single transcode; tier texture cap in
`gltf/ImageDecode.ts`. Wiring into `createTypedGLBActor` and the model compile is requests Q-04-1 / Q-15-1.
Exit (standalone): browser test on macos-14 loads Khronos DamagedHelmet in three encodings (source PNG,
meshopt+KTX2 UASTC, draco+KTX2 ETC1S) through `prepareModelDecoders` + `loadProductionGLTFRenderPipeline` rendered
by the current renderer with `A3D_QR_ASSETS_DECODERS` on; mean ΔE2000 between encodings ≤ 2.0 inside the object
mask; zero requests to origins other than the test server (network log); compressed internal format reported by
the device equals the expected sRGB format; C-16 conformance green for stub and real; flag-off sentinel identity
check green. The same test through `model(assets.x)` is integrated (needs Q-04-1, Q-15-1).

**Phase 2 — Optimize stage. Starts day 0.**
`tools/asset-optimize` steps 1–12, profiles, `assets optimize` verb (C-39), `asset-optimize.yml` workflow; dry-run
over all 226 models.
Exit: budget report artifact for all 120 game-referenced models (before/after bytes, tris, GPU bytes per tier);
deterministic-output test (same input + profile ⇒ byte-identical GLB twice); benchmark assets optimized and
§16.1 criteria (a)–(c) pass for lane scenes `prd05-optimized-*` (equivalents of base scenes 02, 03, 08, 09, 15, 18).

**Phase 3 — LOD and colliders. Runtime half starts day 0 on synthetic `MSFT_lod` fixtures; exit needs Phase 2.**
`MSFT_lod` writer, `LodSelector.ts` with hysteresis, `prd05.lod` actor extension (after PR 0b-3), `prd05.lodDither`
chunk; collision sidecars and `createCollidersFromSidecar`.
Exit (standalone): lane scene `prd05-asset-lod-transition` (§16.1, using the optimized existing
`courierTrafficSedan`, since the library does not exist until Phase 5) passes criteria (d)–(f) with the hard switch
(dither is integrated, C-02); Rapier contact test: the optimized benchmark `crate` (convex hull) dropped on the
optimized `racing-starter` track (trimesh from LOD0) rests within 1 cm of the visual surface in a deterministic
120-step simulation, through `createCollidersFromSidecar` directly. The scene is re-run with the library hero
vehicle in Phase 5.

**Phase 4 — Look-dev viewer and visual gates. Starts day 0 (three adapter needs no other lane).**
`apps/asset-lookdev`, `asset-lookdev.yml`, `assets lookdev|review|admit`; G2, G6, G7, G9, G10 enforced; G9 scored on
the three adapter.
Exit: contact sheets for 10 assets (3 good: DamagedHelmet, AntiqueCamera, Soldier; 7 shipped: `mechHeroDecimated`,
`patrolAircraftMeshy`, `courierTrafficSedan`, `showcaseHeadphones`, `bankShotTable`, `skylineArcticRunnerHero`,
`siegeGolfBall`); the 3 good assets pass G9 and the 4 known-bad ones (`bankShotTable`, `skylineArcticRunnerHero`,
`siegeGolfBall`, raw `mechHeroDecimated`) fail it — a broken-control requirement: if a known-bad asset passes,
the gate is defective. The other 3 (`patrolAircraftMeshy`, `courierTrafficSedan`, `showcaseHeadphones`) are
unlabelled probes: their scores are recorded and a named human states agree/disagree per asset; > 1 disagreement
blocks the phase until the rubric prompt is revised.

**Phase 5 — Library, HDRIs, generated-asset promotion. Sourcing and adapters start day 0; admission needs Phase 4.**
Kits of §6.6 admitted; Poly Haven HDRI/texture adapters; ranking rewrite; §6.5 Meshy pre-stage.
Exit: every kit in §6.6 has ≥ the listed minimum admitted at `release` with look-dev approval (three adapter);
6 HDRIs at 2k admitted as `environment` assets; each of the 8 Meshy assets is promoted or rejected with recorded
G-failures; `prd05-asset-lod-transition` re-run with the `vehicles/road` hero car passes the same thresholds;
facts F-05-01..06 published (C-40).

**Phase 6 — Packaging, measurement.**
Per-route typegen and deploy subset; prune orphans; codemod `assets-route-modules`; template starter entries
published (applied by lane 13); tier measurement on named devices (§17).
Exit: per-route modules generated for all 18 games and the codemod's dry-run report attached (lane 14 applies it,
Q-14-2); a lane fixture route built with its route module contains 0 `suitabilityReason`/`licenseRaw` strings;
the 120 ids (or their replacements) total ≤ 80 MB derived; the published `product-viewer` and `racing-starter`
starter entries pass G1–G11 in `tests/qr/prd05/fixtures/template-starter/`; measured tier table committed with
device names.

**Phase 7 — Pilot game support (integrated; no lane-05 exit gate).**
Lane 05 delivers the six pilot replacement lists and admitted kits (Q-14-3). The pilot games are re-captured by
lane 14 and scored at checkpoints; results are §16.4 integrated acceptance and never hold a lane-05 merge.

---

## 14. Task checklist

### Phase 0
- [ ] `packages/aura3d-cli/src/index.ts`: delete `requiresTextureEvidence` (:3376-3382); in `createRoleAwareReleaseQualityWarnings` (:3252-3253) replace the call with `requiresPbrTextures(role, profile)` that takes no text input and returns true for character/vehicle/product/weapon/track/world/environment, and for `prop` only when the resolved profile is `prop-large` (matching G3; today `prop` is not texture-required at all); delete the "explicit stylized-material rationale" message text.
- [ ] `packages/aura3d-cli/src/index.ts`: delete `hasHashBoundFlatColorMaterialEvidence` (:3164-3178) and its use in the release-primary no-texture check (:3005); the check now fails unless G3 passes or `artDirection` resolves to a `stylized-flat` document with an approved look-dev record.
- [ ] Add `tests/unit/aura3d-cli/release-gates-no-waiver.test.ts`: a manifest entry with role `vehicle`, no textures, `suitabilityReason: "Original CC0 stylized flat-color primary vehicle"` must produce a release failure.
- [ ] `packages/aura3d-cli/src/asset-core-types.ts`: add `"backdrop" | "proxy"` to `AuraCliAssetRole`; add `AuraCliDerivedAsset`, `AuraCliAdmissionRecord`, `AuraCliLookDevRecord`, `artDirection`, `aliasOf`, schema `"aura3d.assets/1.1"` (§7.2).
- [ ] `packages/aura3d-cli/src/asset-manifest.ts`: reader accepts 1.0 and 1.1; writer emits 1.1; test round-trips the root `aura.assets.json` with no field loss (compare JSON minus new fields).
- [ ] New `packages/aura3d-cli/src/admission/gates.ts`: implement G1 (triangle band from profile), G3 (PBR slot coverage by primitive area), G4 (card detection: ≤ 12 tris, unlit > 10 % area, thinness ratio < 0.02), G5 (no TEXCOORD_0 > 10 % area; factor-only; generator matches in-repo builder list), G8 (TANGENT when normal map), G11 (derived present) as pure functions over parsed glTF JSON + accessor counts.
- [ ] Unit tests in `tests/unit/aura3d-cli/admission-gates.test.ts` with real repo GLBs as fixtures: `rooftopBackboard` fails G1; `skylineArcticRunnerHero` fails G4; `mechChassisA` fails G5; `vaultBreakersTable` fails G3/G5; `fixtures/asset-corpus/damaged-helmet.glb` passes G1/G3/G4/G5.
- [ ] New `tools/asset-optimize/migrate-1.1.ts --report|--apply`: computes gates for every entry in root and template manifests, writes `docs/project/aura3d-quality-rebuild/evidence/prd05/assets/migration-1.1.json`, and with `--apply` downgrades failing `release` assets to `candidate` (or `prototype` + role `proxy` for G5 failures).
- [ ] Apply migration to the root `aura.assets.json` in one commit (regenerated by the CLI, §4.3 `--check`); attach report; publish the template-manifest rows for lane 13 (Q-13-2) and file Q-14-1 so `apps/showcase-*/scripts/register-models.mjs` / `register-assets.mjs` pass `--quality prototype --role proxy`.
- [ ] `packages/aura3d-cli/src/cli.ts`: `assets add --quality release` now errors with "use `assets admit`"; `--legacy-release-gates` flag accepted with deprecation warning; new `.github/workflows/qr-prd05-gates.yml` (lane-owned) greps the repo for `--legacy-release-gates` and fails if found, and runs the gate unit tests.
- [ ] `packages/aura3d-cli/src/index.ts:2112` `inspectGltfAnimations` (request Q-05-1 from lane 06): call `inspectAnimationClips(json, bin)` exported by `commands/prd06/inspectAnimationClips.ts` when present (dynamic import; fall back to today's names-only inspection) and add `duration`, `hasRootMotionCandidate`, `frameRate?`; `asset-manifest.ts` emits C-17 `animationClips` objects in typegen.
- [ ] Audio metadata (request from lane 09): `assets add --type audio` accepts `--license --source-url --author --loudness-lufs --true-peak-db`, writes `entry.audio`; `assets validate --release` fails an `audio` entry whose provenance is `synthesized` unless its id is on `admission/audio-synth-allowlist.ts`. Unit test with one licensed and one synthesized WAV fixture.
- [ ] Day 0: open issues Q-02-1..Q-15-4 (§12.3) and CCR-05-1 (§7.0); publish C-40 rows F-05-01..06 as `proposed` (Appendix B).
- [ ] `packages/aura3d-cli/src/commands/prd05/index.ts`: register every new verb through C-39 `registerCliCommand`; `cli.ts` keeps the existing verbs.

### Phase 1
- [ ] New `packages/assets/src/AssetDecoderRegistry.ts`: `createAssetDecoderRegistry` (§7.4) with lazy dynamic imports; one in-flight promise per decoder; `diagnostics()` returning `{ loaded, failed[{ id, url }] }` (C-16 exact); `dispose` terminates workers; `slot.provide` in `packages/assets/src/lanes/prd05.ts` behind `A3D_QR_ASSETS_DECODERS`; C-16 conformance green for stub and real.
- [ ] Meshopt: dynamic `import("meshoptimizer")` → `MeshoptDecoder.ready` → wrap with existing `createMeshoptDecoder` (`GLTFCompressionDecoders.ts:63`).
- [ ] Draco: copy `node_modules/draco3d/draco_decoder.wasm` + JS glue to `packages/assets/vendor/draco/` at build; wrap with `createDracoDecoder` (`GLTFCompressionDecoders.ts:85`); loaded only on `require(["draco"])`.
- [ ] Basis: vendor `basis_transcoder.{js,wasm}` from `node_modules/three/examples/jsm/libs/basis/` into `packages/assets/vendor/basis/` with `README.md` (upstream, version, sha256, licence); Vite/tsup copy to `/aura-decoders/basis/` in app builds and `create-aura3d` templates.
- [ ] `packages/assets/src/KTX2BasisTextureTranscoder.ts`: remove `DEFAULT_BROWSER_CDN` (:22) and loaders.gl dynamic import; use the vendored transcoder in a worker (`KTX2TranscodeWorker.ts`); `targetFormat` required; return `colorSpace` from options; transcode RGBA8 fallback only on demand; honour `maxDimension` by skipping levels.
- [ ] `packages/assets/src/KTX2TargetSelection.ts` `selectKTX2TargetFormat(caps, source, hasAlpha, colorSpace)` (PR 0a ships it real because it is pure; lane 05 owns the file and its table thereafter): UASTC → astc-4x4 > bc7 > etc2-rgba8 > rgba8; ETC1S → etc2-rgb8 (opaque) / etc2-rgba8 (alpha) > bc1 (opaque) / bc3 (alpha) > rgba8; sRGB slot on s3tc-without-s3tcSrgb never picks bc1/bc3; unit test is an exhaustive truth table over all 128 combinations (2⁵ capability sets × 2 sources × 2 alpha × 2 colour spaces) with expected outputs checked into `tests/unit/assets/ktx2-target-format.table.json`.
- [ ] Verify (no edit) that PR 0a pre-declared `TextureCompressedFormat` members `"bc7-rgba-unorm" | "etc2-rgb8unorm"` in `packages/rendering/src/Texture.ts:1` (owner 06) with throwing defaults; if missing, file a CCR against C-16 rather than editing the file.
- [ ] `packages/rendering/src/webgl2/TextureFormats.ts` (verbatim carve of `WebGL2Device.ts:4117-4133` in PR 0b-2; until it merges, write `resolveCompressedTextureFormatReal` in this new file and wire it after): real for `resolveCompressedTextureFormatSlot()` taking `texture.colorSpace` and returning sRGB internal formats (`COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`, `COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT`, `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`, `COMPRESSED_SRGB8_ETC2`, `COMPRESSED_SRGB_S3TC_DXT1_EXT`, `COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT`) when `colorSpace === "srgb"`; add `bc7-rgba-unorm` (`EXT_texture_compression_bptc`) and `etc2-rgb8unorm`; replace the unconditional `0x9278` (`:4128`) with a `WEBGL_compressed_texture_etc` query (return `null` when absent so the existing fallback path at `:3921-3946` runs); query `WEBGL_compressed_texture_s3tc_srgb` for sRGB BC1/BC3; add `probeCompressedTextureCapabilities(gl): CompressedTextureCapabilities`; `slot.provide` from `packages/rendering/src/lanes/prd05.ts` behind `A3D_QR_ASSETS_DECODERS`. Unit test `tests/unit/contracts/impl/prd05-texture-formats.test.ts` with a mocked `gl` asserts the internal-format enum for each (format, colorSpace, extension-set) triple.
- [ ] File Q-11-1 with the WebGPU format table (`astc-4x4-unorm(-srgb)`, `bc7-rgba-unorm(-srgb)`, `etc2-rgba8unorm(-srgb)`, `etc2-rgb8unorm(-srgb)`, `bc1-rgba-unorm(-srgb)`, `bc3-rgba-unorm(-srgb)`, block-aligned `bytesPerRow`); in `AssetDecoders.ts` report all-false capabilities on the WebGPU backend until the device advertises them, so the transcoder emits RGBA8.
- [ ] `apps/loader-ktx2/src/main.ts:90`: pass `transcoderUrl` and a target from `selectKTX2TargetFormat` (device caps); route-health test unchanged.
- [ ] `packages/assets/src/gltf/ImageDecode.ts` (verbatim carve of `decodeImageInBrowser`, `GLTFRenderResources.ts:2216-2241`, in PR 0b-3): route `image/ktx2` to the registry image decoder with the slot colour space; for PNG/JPEG larger than `maxTextureSize` pass `resizeWidth/resizeHeight/resizeQuality: "high"` to `createImageBitmap` (today `:2233`); behaviour change only with `A3D_QR_ASSETS` on.
- [ ] `packages/engine/src/agent-api/AssetDecoders.ts`: add `createAppAssetDecoders(options.assets, caps, C-27 tier)` and `prepareModelDecoders(asset, registry)` (§7.3); resolve `asset.requiredDecoders ?? extensionsUsed` from the GLB JSON header; throw `AssetDecoderUnavailable` with decoder id and URL; the engine lane barrel `packages/engine/src/lanes/prd05.ts` creates the registry once per app (C-38 options) and exposes it to the compiler request (Q-15-1).
- [ ] File Q-04-1 (`TypedGLBActor.ts:184-191` forwards `options.decoders` / `maxTextureSize`) and Q-15-1 (model compile awaits `prepareModelDecoders`, `degrade("capability-degraded")` on failure, throw under strict).
- [ ] `packages/assets/src/KTX2BasisTextureTranscoder.ts` `ensureCompressedTextureSupport` (:277-293) and its wrapper `packages/engine/src/agent-api/AssetDecoders.ts` (:10-25): defaults meshopt on, draco lazy, ktx2 on; probes come from the registry (no `async () => false` defaults); `chosenKtx2Target` comes from `selectKTX2TargetFormat` instead of the `"etc2-rgba8unorm"` default (:288); update both doc comments.
- [ ] Browser test `tests/qr/prd05/assets-compressed-glb.spec.ts` (macos-14, `qr-prd05-assets-browser.yml`): DamagedHelmet ×3 encodings through `prepareModelDecoders` + `loadProductionGLTFRenderPipeline` on the current renderer; assert ΔE2000 ≤ 2.0 masked; assert `performance.getEntriesByType("resource")` origins ⊆ test origin; assert device-reported internal format. A second, integrated variant `assets-compressed-typed-glb.spec.ts` drives `model(assets.x)` and is marked `integrated` (runs at checkpoints; skipped in lane CI until Q-04-1/Q-15-1 land).

### Phase 2
- [ ] Create `tools/asset-optimize/package.json` (lane-owned workspace manifest, CONTRACTS §4.4) with exact pins: `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions` (same exact 4.x version), `mikktspace` (exact), `sharp` (exact), `meshoptimizer@1.2.0`, `draco3d@1.5.7`; add `meshoptimizer@1.2.0` and `draco3d@1.5.7` to `packages/assets/package.json`; file Q-15-3 for the root `draco3d` caret (`package.json:731`) and the lockfile batch; record KTX-Software `ktx` CLI version in `tools/asset-optimize/tool-versions.json`; workflow installs that exact release and verifies its sha256.
- [ ] `tools/asset-optimize/extensions/msft-lod.ts`: custom gltf-transform `Extension` for `MSFT_lod` (read/write node `extensions.MSFT_lod.ids` and `extras.MSFT_screencoverage`); round-trip unit test on a 3-level synthetic node.
- [ ] `tools/asset-optimize/profiles.ts`: encode §6.2 table as `Record<AssetOptimizeProfileId, AssetOptimizeProfile>`; `profileForRole(role, bounds)`; unit test that every profile has floor ≤ target ≤ ceiling and normal = UASTC.
- [ ] `tools/asset-optimize/steps/{weld,dedup,join,palette,resize,tangents,quantize,compress,ktx2}.ts`: one function per step `(doc: Document, profile, log) => Promise<void>`, each appending an `OptimizeStepRecord`.
- [ ] `steps/resize.ts`: power-of-two Lanczos3 (sharp) to profile max; renormalize normal maps after resize; emit `texture-waste` check when tex > max for mesh below floor.
- [ ] `steps/tangents.ts`: MikkTSpace for primitives with `normalTexture` and no TANGENT; skip and record G8 failure when TEXCOORD_0 missing.
- [ ] `steps/ktx2.ts`: write PNG per texture, call `ktx create` with `--format R8G8B8A8_SRGB` (colour slots) or `R8G8B8A8_UNORM` (normal/ORM/clearcoat/transmission), `--generate-mipmap`, and profile flags (UASTC: `--encode uastc --uastc-quality 2 --uastc-rdo --uastc-rdo-l 1.0 --zstd 18`; ETC1S: `--encode basis-lz --clevel 2 --qlevel 192`); replace image with `KHR_texture_basisu`; a workflow step validates every flag against `ktx create --help` of the pinned release (§6.2).
- [ ] `steps/compress.ts`: meshopt via `meshopt({ encoder: MeshoptEncoder, level: "medium" })` default; Draco via `draco({ ... })` with `draco3d` encoder only with `--geometry draco` and only for non-skinned meshes.
- [ ] `tools/asset-optimize/measure.ts`: `AssetBudgetMeasurement` incl. `gpuBytesByTier` (format arithmetic with tier caps) and `drawCallsEstimate` (primitives × materials after join).
- [ ] `tools/asset-optimize/index.ts`: pipeline runner writing `public/aura-assets/<id>.<derivedHash8>.glb` (+ `.mobile.glb`), updating `derived` in the manifest; refuses KTX2/bake steps outside CI unless `--allow-local-small` and source < 5 MB.
- [ ] `packages/aura3d-cli/src/commands/prd05/optimize.ts`: `assets optimize` registered via C-39 calling `optimizeAssets`; usage text in the command's `usage` field and `cli-help.ts`.
- [ ] `.github/workflows/asset-optimize.yml`: `workflow_dispatch` + PR path filter (`aura.assets.json`, `tools/asset-optimize/**`); ubuntu-latest for CPU steps (KTX encode, simplify), LFS checkout, artifact upload of derived files + report; matrix by asset batch.
- [ ] Determinism test `tests/unit/asset-optimize/determinism.test.ts`: optimize `fixtures/asset-corpus/damaged-helmet.glb` twice with profile `product` ⇒ identical sha256.
- [ ] Dry-run all 226 models; commit `evidence/prd05/assets/optimize-dry-run.json` (before/after per id, aggregate for the 120 game ids).
- [ ] Optimize benchmark assets (`damagedHelmet`, `antiqueCamera`, `soldier`, `cesiumMan`, `fox`, `rockA`, `rockB`, `crate`) and register them with sha256 in `benchmarks/quality-rebuild/scenes/prd05/assets.ts`; add lane scenes `prd05-optimized-{damaged-helmet,pbr-product,skinned,outdoor,game-scene}` (Aura + three sides under `{aura3d,three}/scenes/prd05/`) that load the same scene content as base scenes 02/03/08/09/15/18 with the optimized files (C-30 registry; `shared/assets.ts` is lane 12's and is not edited).

### Phase 3
- [ ] `tools/asset-optimize/steps/lod.ts`: `MeshoptSimplifier.simplifyWithAttributes` per primitive per ratio with `targetError` per level, flag `LockBorder` for multi-primitive nodes, attribute weights normal 0.5 / UV0 1.0; record `lod-target-missed` when achieved index count > 1.2 × target; skinned: max 2 levels (JOINTS/WEIGHTS preserved because vertices are reused); write `MSFT_lod` + `extras.MSFT_screencoverage` through the custom extension.
- [ ] `packages/assets/src/GLTFLoader.ts`: parse `MSFT_lod` into `GLTFNode.lods: { nodeIndex, screenCoverage }[]`; file Q-04-2 to register `MSFT_lod` "runtime-supported" in the generated extension matrix (`GLTFExtensionSupport.ts`, owner 04).
- [ ] `packages/engine/src/production-runtime/actor/TypedGLBActorLod.ts`: `registerTypedGLBActorLodExtension()` calling `registerTypedGLBActorExtension({ id: "prd05.lod", owner: "prd05", flag: "A3D_QR_ASSETS_LOD", onLoad, collectRenderItems, dispose })` (hook lands in PR 0b-3); `onLoad` builds level → render-item index from `GLTFNode.lods`; `collectRenderItems` returns only the active level (and the outgoing level during fade with `lodFade` set); `getTypedGLBActorLod(actor)` handle (§7.3). Registered from `packages/engine/src/lanes/prd05.ts`.
- [ ] `packages/engine/src/production-runtime/LodSelector.ts`: per-frame coverage, hysteresis 10 %, bias (C-27 `lodBias` × model bias), one step per frame; unit test with synthetic camera distances. Shadow-caster level `min(level+1, max)` is emitted as CCR-05-1 `lodLevel`/`lodLevels` values and consumed only when Q-02-1 lands.
- [ ] `packages/rendering/src/shaders/lod-dither.glsl.ts`: chunk `a3d_prd05_lod_dither` (§8 item 3, GLSL + `wgsl` field), `registerShaderFeature({ id: "prd05.lodDither", hooks: ["fragment:pars", "fragment:alpha"] })`, `registerDepthVariantFeature("prd05.lodDither")`; ChunkHarness test compiles both stages and checks the Bayer masks are complementary (every pixel covered exactly once at any fade value). `ShaderLibraryCore.ts`/`ShaderLibrary.ts` are not edited (frozen, §3.7).
- [ ] `tools/asset-optimize/steps/colliders.ts`: convex hull per node from the profile's LOD (≤ 64 verts via simplify), trimesh for world/track, box/capsule from bounds; write `<id>.<hash8>.collision.glb`.
- [ ] `packages/physics-rapier/src/index.ts`: `createCollidersFromSidecar(world, source, transform)` reading `extras.aura3dCollider` and building `ColliderDesc.convexHull`/`trimesh` (:555-557); file Q-15-2 for the `model(asset, { physics, collider: "auto" })` binding; add `model.collider` / `model.lod` rows to `diagnosticOnly.prd05.ts` until wired.
- [ ] Physics test `tests/unit/physics/generated-collider-contact.test.ts`: optimized benchmark `crate` convex hull resting on the optimized `racing-starter` track trimesh within 1 cm after 120 fixed steps (Rapier, fixed `dt = 1/60`, seed fixed), built through `createCollidersFromSidecar`.
- [ ] Lane scene `prd05-asset-lod-transition` (`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd05/asset-lod-transition.ts`): hero vehicle ×3 at 5/25/80 m, 120-frame dolly; three side uses a `MSFT_lod` `GLTFLoader` plugin in the lane's three scene file.
- [ ] `packages/rendering/src/performance/LOD.ts`: mark `createDefaultPerformanceLodLevels` (:13-20) `@deprecated` with a one-time runtime warning; keep the export (re-exported by `packages/rendering/src/index.ts`, owner 15, and used by `tests/performance/external-parity-performance-baselines.ts`, owner 12 by the creator rule) for one minor, so no other lane's file changes.

### Phase 4
- [ ] `apps/asset-lookdev/`: Vite app with `?asset=<id>&stage=<v>&view=<n>&engine=aura|three`; `aura-adapter.ts` uses only public `createAuraApp` + `environments.hdri` + `model()` (derived compressed files once Q-04-1/Q-15-1 land; the `source` variant before that, recorded in `metrics.json`); `three-adapter.ts` uses `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader` + `PMREMGenerator` with the same HDRI, ACES, exposure.
- [ ] `apps/asset-lookdev/lookdev.stage.json` v1 (§6.7) checked in; any change bumps version and invalidates `lookDev` records.
- [ ] `packages/rendering/src/shaders/debug-view.glsl.ts`: chunk `a3d_prd05_debug_view` + feature `prd05.debugView` at `fragment:end` (§8 item 4), active only when the pre-declared renderer option `debugView` is set by the look-dev app; texel density uses GLSL `textureSize()` (no `GLTFRenderResources` change); ChunkHarness compile test. Same views implemented in `apps/asset-lookdev/src/three-adapter.ts` as `ShaderMaterial` overrides so debug sheets are produced standalone.
- [ ] `apps/asset-lookdev/capture.mjs`: Playwright capture of 3 HDRIs × 8 yaws + top + gameplay (1920×1080 DPR 1, 390×844 DPR 3) + debug views; composes `contact.jpg`, `debug.jpg`, `gameplay.jpg`; writes `metrics.json` with three-vs-Aura masked SSIM per view and renderer draw calls.
- [ ] `.github/workflows/asset-lookdev.yml`: macos-14, Chromium `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (same args as `quality-rebuild-capture.yml`), fails if the probe renderer string contains "SwiftShader"; matrix batches of 10 assets; uploads artifacts.
- [ ] `packages/aura3d-cli/src/lookdev/`: `assets lookdev` dispatches the workflow via `gh workflow run` and prints the run URL; `assets review` appends a review to `lookDev.reviews` bound to `derived.hash`.
- [ ] Vision-model review script `tools/asset-optimize/review-vision.ts`: calls C-32 `judgeWithPrism` (Kiro Prism; per policy §4 read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` first) with `contact.jpg` + `gameplay.jpg` + the asset rubric prompt and records a C-32 `JudgeIdentity { kind: "vision-model", id, model }`; two independent runs, mean recorded, disagreement > 1.5 flags human review. If lane 12's real `judgeWithPrism` is not merged yet, the C-32 stub's Prism call path is used unchanged.
- [ ] `packages/aura3d-cli/src/admission/gates.ts`: implement G2 (texel density from UV/world area with role camera defaults and route overrides), G6 (texture sanity on 256² decoded proxies), G7 (budget §17.2), G9 (record exists for current hash with three-adapter score ≥ 6.5 and no axis < 4; hero roles require a human review; Aura-minus-three gap > 1.5 emits a renderer-issue record, not a failure), G10 (art-direction file exists; route coherence sheet ≥ 6).
- [ ] `assets admit` verb; `assets validate --release --route apps/<app>` runs G1–G11 for every asset the route's default path references (AST scan) and fails the route if any rendered asset is below `release` or is `proxy`.
- [ ] Broken-control test in CI: look-dev + vision review of `skylineArcticRunnerHero` and `siegeGolfBall` must score < 6.5; if they pass, the review pipeline job fails.

### Phase 5
- [ ] `packages/asset-index/src/adapters/poly-haven.ts`: add HDRI adapter (`/assets?t=hdris`, direct `.hdr` 1k/2k/4k URLs from `/files/<id>`) and texture adapter (per-map files); records `access: "direct-download"`, CC0 verified.
- [ ] New `packages/asset-index/src/adapters/ambientcg.ts` (textures, CC0) with direct download of 1k/2k PNG/JPG sets.
- [ ] `packages/aura3d-cli/src/pull-bridge/scoring.ts` + `packages/asset-index/src/ranking.ts`: licence/provenance become filters; new score terms (G1 fit, G3 pre-check, G2 estimate, look-dev approval, library membership, art-direction match); remove "missing texture −6" in favour of exclusion for texture-required roles; update ranking tests.
- [ ] `assets/library/` + `aura.library.json`; `assets library add|list|sync`; library entries resolved first by `assets search/resolve`.
- [ ] Admit kits of §6.6 (each item: source, licence, optimize profile, look-dev, review); `assets/art-direction/<kit>.json` per kit (fields aligned with the C-35 art-direction schema).
- [ ] For lane 06 (Q-05-2): admit at least one `hero`-role rigged humanoid (≥ 15k tris, ≥ 50 joints, clip set idle/walk/run/jump/fall/land/punch×2/kick/hit/block/KO with C-17 `animationClips`), a combat fighter pair (candidates `auraClashPlayerRig`/`auraClashRivalRig` if licensing allows), and hero LODs (2 levels, skinned); record the outcome in `evidence/prd05/assets/character-kit.json`.
- [ ] Admit 6 HDRIs at 2k (+4k for `studio-soft` and `outdoor-midday`) as `type: "environment"` entries with `sunDirection`, `luminanceP99`, `whiteBalanceK` metadata; replace the three 1k fixture HDRIs in the look-dev stage; publish them for lane 02 (C-09 consumer) and lane 12 (reference scenes) as C-17 entries plus C-40 fact F-05-05 (ids, paths, metadata).
- [ ] `packages/aura3d-cli/src/meshy/import.ts:42`: replace throw with: `release` requires `derived` from `--from-generated` optimize and G1–G11 pass; message lists missing gates.
- [ ] `tools/asset-optimize/steps/remesh.ts` + `bake.ts`: Blender LTS headless scripts (`tools/asset-optimize/blender/remesh_quadriflow.py`, `bake_highpoly.py`) run only on the remote worker; Meshy remesh API path written as fact F-05-03 (C-40) for lane 13's `meshy-cli` skill; sliver-ratio pre-check rejects collapse-decimated input.
- [ ] Promote or reject each of the 8 Meshy assets; record outcomes in `evidence/prd05/assets/meshy-promotion.json`.
- [ ] Publish C-40 facts F-05-01 (gate table G1–G11 and the deleted waivers), F-05-02 (§6.2 profile targets replacing the 100k–500k / 4096–8192 ceilings in `meshy-cli/SKILL.md:56-66`), F-05-03 (Meshy promotion path), F-05-04 (decoder base path and `variant` option), F-05-05 (HDRI library ids), F-05-06 (`aura3d-assets/SKILL.md:109` rule: `model(assets.x)` only from admitted entries); file Q-13-1. Lane 13 edits the skills and runs `pnpm skills:sync` / `pnpm check:skills`.

### Phase 6
- [ ] `packages/aura3d-cli/src/asset-manifest.ts` `writeTypedAssets`: `--route` mode emits `src/aura-assets.route.ts` with only referenced ids and fields `type, format, url, hash, bounds, sizeBytes, requiredDecoders, lods, colliderUrl, budget`; credits written to `dist/credits.json`.
- [ ] Codemod `assets-route-modules` in `packages/aura3d-cli/src/commands/prd05/codemods/assetsRouteModules.ts`, registered via C-39 `registerCodemod` (pure `source → code + rows`): rewrites `import { assets } from "../../../src/aura-assets"`-style imports to the route module; fixture test on two copied `main.ts` files under `tests/qr/prd05/fixtures/routes/`; file Q-14-2 with the `--report` output for every `apps/showcase-*/src/main.ts`.
- [ ] `check-deploy`: copy only referenced derived files into `dist/aura-assets`; fail when the dist contains unreferenced files.
- [ ] `assets prune --dry-run|--apply`: remove `public/aura-assets` files not referenced by any manifest `outputPath`/`derived.outputPath` (529 files / 490 MB today); LFS pointers updated.
- [ ] Bundle test `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts`: a lane fixture route (`tests/qr/prd05/fixtures/route-bundle/`, a copy of Courier Rush's asset imports) built with its route module contains 0 occurrences of `suitabilityReason` and `licenseRaw`. The same assertion on the real Courier Rush bundle is integrated (after Q-14-2).
- [ ] Template starters: write `evidence/prd05/assets/template-starters.json` (library replacement entries for `product-viewer`, `racing-starter`, `mini-game`, `fighting-game`, `character-controller`, `falling-blocks-starter`), prove them in `tests/qr/prd05/fixtures/template-starter/` (G1–G11 pass, typegen output), and file Q-13-2; lane 13 edits the template manifests.
- [ ] Tier measurement harness `tools/asset-optimize/measure-tiers.mjs` (remote): loads the 6 pilot games per tier, records texture VRAM estimate (from uploaded formats), visible triangles, draw calls, ready bytes, long tasks during load; commit `evidence/prd05/assets/tier-measurements.json` with device/GPU strings.

### Phase 7 (integrated support; no lane-05 merge gate)
- [ ] Publish the six pilot replacement lists (Skyline Runner, Mech Hangar, Courier Rush, Vault Breakers, Gravity Post, Bank Shot) in `evidence/prd05/assets/replacement-lists.json` with admitted library ids and expected `qrFlags`; file Q-14-3 / Q-14-4.
- [ ] At each G-PANEL checkpoint, read the lane-14 captures (`tools/quality-rebuild-capture`, default URLs, no `?capture=review`) from the checkpoint record and append the per-game asset deltas to `evidence/prd05/assets/pilot-review.json` (named human sign-off per game); misses become `qr-ic-regression` issues attributed by leave-one-out.

---

## 15. Test requirements

Where tests run (policy: browser/GPU work is remote; nothing heavy runs on the Mac):
- Unit tests (vitest): `qr-contracts.yml` and `test.yml` on GitHub Actions; may also run locally because they are
  light (pure functions over GLB JSON and small fixtures).
- Lane workflows (lane-owned): `qr-prd05-gates.yml` (ubuntu-latest: gates, manifest, migration report, grep
  guard), `qr-prd05-assets-browser.yml` (**macos-14** Chromium ANGLE Metal + WebKit + Firefox projects; plus a
  `windows-latest` non-visual job for BC-format selection with a capability mock), `asset-optimize.yml`
  (ubuntu-latest CPU encode/simplify with LFS checkout), `asset-lookdev.yml` (**macos-14**).
- Browser tests and all screenshots: GitHub Actions **macos-14** (ANGLE Metal), same launch args as run
  37289688772. Never SwiftShader for visual criteria (the job fails if the renderer string contains
  "SwiftShader"); GPU-less runners only for non-visual decode tests.
- Every lane-05 PR touching `packages/rendering/**` or `packages/engine/**` also runs the CONTRACTS §6.1
  flag-off sentinel identity check, and the conformance matrix runs with flags `none`, `all`, and
  `A3D_QR_ASSETS` alone.

Contract conformance (lane 15-owned suites; must pass for `stub` and lane-05 `real`):
- `tests/unit/contracts/C-16-ktx2.test.ts` (128-row table), `tests/unit/contracts/C-17-manifest.test.ts`.
- Lane impl suites `tests/unit/contracts/impl/prd05-{decoders,texture-formats,manifest,gates}.test.ts`.

Unit:
- Gates G1, G3, G4, G5, G6, G8, G11 with real repo GLB fixtures (pass and fail cases listed in §14 Phase 0).
- G2 texel density: analytic cube with known UV area and texture size at known camera distance gives the
  expected texels-per-pixel within 1 %.
- Profiles invariants; `profileForRole` mapping.
- `MSFT_lod` custom extension read/write round trip; `extras.MSFT_screencoverage` strictly decreasing.
- G5 builder-pattern list covers every file returned by `git ls-files 'apps/*/scripts/*'` that emits GLB.
- G2 default-camera table (§6.4) encoded once and shared by `admit` and look-dev capture (same numbers).
- `selectKTX2TargetFormat` 128-row truth table; transcoder option validation (no default target, no CDN).
- Manifest 1.0 → 1.1 round trip; alias dedup.
- Determinism of `optimizeAssets` output.
- LOD selector hysteresis and one-step-per-frame; screen-coverage computation.
- Collider generation: hull vertex cap, trimesh index validity, contact test.
- Per-route typegen contains only referenced ids and no licence strings.
- Ranking: library entry outranks an Objaverse entry with better keyword match; untextured candidate excluded
  for `vehicle`.

Browser (macos-14, `qr-prd05-assets-browser.yml`; files under `tests/qr/prd05/`):
- `assets-compressed-glb.spec.ts` (Phase 1 exit, standalone S3); `assets-compressed-typed-glb.spec.ts` (same
  assertions through `model(assets.x)`, tagged `integrated`, runs at checkpoints).
- `assets-lod-transition.spec.ts`: dolly camera over 120 frames on `prd05-asset-lod-transition`; render-item count
  switches at the expected coverage; no frame with zero items for an LOD-ed actor; dither enabled on Medium+ only
  when the C-02 generator is real (otherwise the spec asserts the hard switch and records `lodDither: "pending"`).
- `assets-tier-texture-cap.spec.ts`: with `maxTextureSize: 1024`, a 2048 KTX2 texture uploads level 1 as level 0
  (reported dimensions 1024).
- `assets-decoder-failure.spec.ts`: blocked `/aura-decoders/basis/` URL produces `AssetDecoderUnavailable`, not
  a silent untextured render.
- Look-dev capture smoke: 1 asset end to end produces all artifacts and a renderer string without "SwiftShader".

---

## 16. Acceptance: standalone and integrated

All judgments use captured images from the remote macos-14 lane. Each criterion needs a vision-model judgment
(two independent runs, mean) and, where stated, a named human reviewer. Engineering counters (draw calls equal,
non-blank pixels, SSIM alone) never satisfy a visual criterion; SSIM thresholds below are necessary, not sufficient.
Per the CONTRACTS §7 honesty rule, none of the standalone items below supports a claim that Aura3D's rendering of
assets matches three.js; they establish that the pipeline preserves and budgets the content.

### 16.0 Standalone acceptance (lane 05 alone, PR 0 stubs only; gates lane-05 merges and `standalone-accepted`)

| # | Criterion | Measured by | Needs from other lanes |
|---|---|---|---|
| S1 | Regex and flat-colour waivers deleted; 0 root-manifest `release` assets fail G1–G11; broken-control fixtures fail the right gates | `qr-prd05-gates.yml`, `migration-1.1.json` | none |
| S2 | C-16 and C-17 conformance suites green for `stub` and `real`; flag-off sentinel identity check green | `qr-contracts.yml` | PR 0 only |
| S3 | DamagedHelmet ×3 encodings via `prepareModelDecoders` + pipeline: ΔE2000 ≤ 2.0 masked, 0 third-party requests, sRGB internal format reported (Chromium; WebKit/Firefox decode-correct) | `qr-prd05-assets-browser.yml` | none (current renderer) |
| S4 | `assets-decoder-failure`: blocked `/aura-decoders/basis/` → `AssetDecoderUnavailable`, never a silent untextured frame | same | none |
| S5 | Determinism: same source + profile ⇒ byte-identical derived GLB; budget report for all 120 game ids | `asset-optimize.yml` | none |
| S6 | §16.1 rows for `prd05-optimized-*` scenes (a)–(c) pass | lane scenes, vision ×2 | C-30 stub registry |
| S7 | `prd05-asset-lod-transition` (d)–(f) pass with hard switch; collider contact ≤ 1 cm | lane scene + physics unit test | none (dither is integrated) |
| S8 | Look-dev broken control: 3 good assets pass G9 and 4 known-bad fail it on the three adapter; ≤ 1 human disagreement on the 3 probes | `asset-lookdev.yml`, C-32 `judgeWithPrism` | C-32 stub |
| S9 | Library kits and 6 HDRIs at 2k admitted with three-adapter look-dev approval; 8 Meshy decisions recorded | `aura.library.json`, `meshy-promotion.json` | none |
| S10 | Route-module fixture bundle has 0 metadata strings; 120 ids ≤ 80 MB derived; template starter fixtures pass G1–G11 | `tests/qr/prd05/` | none |
| S11 | Bundle budgets of §17.1 (decoder glue ≤ 3 KB gz, meshopt chunk ≤ 20 KB gz) on a lane fixture app | `qr-prd05-assets-browser.yml` | none |

### 16.1 Benchmark scenes (lane scenes via C-30; standalone except `prd05-lookdev-hero`)

Rows 02–18 are lane scenes `prd05-optimized-*` that reuse the base scene content with optimized files; Aura
frames are rendered by whatever renderer is current (flags `none` for standalone), and the criteria compare
optimized vs source **within each engine**, so no renderer-lane fix is needed.

| Scene | Variant | Reference | Criterion | Threshold | Review |
|---|---|---|---|---|---|
| 03-damaged-helmet | optimized (meshopt + KTX2 UASTC) vs source | three r185 rendering the **same** optimized file, and three rendering the source | (a) three(opt) vs three(src) masked SSIM; (b) Aura(opt) vs Aura(src) masked SSIM; (c) vision "visible degradation?" | (a),(b) ≥ 0.97; (c) score drop ≤ 0.25 vs source (today Aura 6.5, three 7.0) | vision ×2 |
| 02-pbr-product | optimized antique camera | same as above | (a)–(c) | same; plus texture detail on leather "equivalent" (research 23 row 10 today) | vision ×2 |
| 08-skinned-character | optimized soldier (meshopt, float positions, KTX2) | three(opt) | skinning intact: silhouette IoU vs source ≥ 0.98 at `CAPTURE_TIME`; (c) | IoU ≥ 0.98; drop ≤ 0.25 | vision ×2 |
| 15-animation-skinning | optimized soldier + fox | three(opt) | same as 08 for both characters | same | vision ×2 |
| 09-outdoor-environment | optimized rocks + crates (ETC1S base, UASTC normal) | three(opt) | (a)–(c); no block artefacts visible on rock albedo at 1280×720 | (a),(b) ≥ 0.95 (ETC1S is lossier than UASTC; 0.97 would reject correct output); (c) as 03; "no visible artefacts" yes in both runs | vision ×2 |
| 18-game-scene | optimized crates/rocks/soldier | three(opt) | (a)–(c) | as 03 | vision ×2 |
| **prd05-asset-lod-transition** (new lane scene, C-30) | hero vehicle ×3 at 5/25/80 m, 120-frame dolly: optimized `courierTrafficSedan` in Phase 3, library `vehicles/road` hero car in Phase 5 | three r185 with the same `MSFT_lod` levels via a loader plugin | (d) visible pops in the frame strip; (e) far-copy triangle reduction; (f) per-frame render-item log shows the LOD switch happened (guards against a pass where LOD never engages) | (d) ≤ 1 pop judged visible across the strip (hard switch standalone; dithered variant integrated); (e) ≥ 60 % at 80 m; (f) ≥ 2 level changes logged per copy at 25/80 m | vision ×2 + human |
| **prd05-lookdev-hero** (new lane scene; **integrated**) | library `hero-character` under `studio-soft-2k` | three r185 same file | Aura vision score; gap to three | Aura ≥ 6.5 and gap ≤ 1.0, evaluated only at G-PANEL with `qr_flags=all` (renderer lanes 01–04 contribute through C-02/C-05/C-09/C-15) | G-PANEL |

### 16.2 Games (integrated; `tools/quality-rebuild-capture`, default URLs, 1920×1080 + 390×844)

Integrated only: scored at CONTRACTS §7 G-PANEL checkpoints on lane-14 routes that opted into `A3D_QR_ASSETS`
with `qr_flags=all`; never blocks a lane-05 merge. Reference: the research-21 baseline frames
(`evidence/games/<id>-contact.jpg`, `<id>-mid.jpg`) as the "before", and the per-genre reference stills
(lane 12, C-32) as the target. Judged with the research-21 prompt and scoring scale so scores are comparable.

| Game | Today `modeling_assets` (21) | Asset change | Criterion | Threshold |
|---|---:|---|---|---|
| showcase-skyline-runner | 4 (backdrop masks a 2–3 3D layer) | 4-tri card hero → rigged library character; ice-ledge cards → modelled platform kit; ghost Meshy runner removed or promoted | `modeling_assets`; "character likely a sprite" no longer cited | ≥ 6.5; human confirms player is a 3D rigged model in motion strip |
| showcase-mech-hangar | 3.5 (mech ~6 buried in cubes ~1.5) | box part assemblies → library modular mech parts (textured, UV'd); Meshy hero promoted (remesh/bake) or replaced | `modeling_assets`; no "placeholder cube" comments | ≥ 6.5 |
| showcase-courier-rush | 4 | traffic cars/van optimized and **not** tinted flat (lane 04 C-15 real in `all`); city kit replaces primitive buildings | `modeling_assets`; style coherence | ≥ 6.5; no "asset inconsistency" finding |
| showcase-vault-breakers | 2 | primitive playfield → pinball kit (bumpers, rails, flippers, playfield art) | `modeling_assets` | ≥ 6.0 |
| showcase-gravity-post | 3 (three asset languages clash) | planets re-encoded, skiff/freight replaced, station ring LOD/optimized | `modeling_assets`; ready download | ≥ 6.0; ready download ≤ 15 MB (today 46.8 MB, 20 line 2015) |
| showcase-bank-shot | 3 (no cue judged visible) | table/cue/numbered balls from sports kit with felt/wood PBR | `modeling_assets`; cue visible in action frame | ≥ 6.5; cue present in 04-action (human) |
| all 18 | — | optimize only (no replacement) | no visual category in research-21 format regresses by > 0.5; ready download within tier budget §17 | per-game table committed |

Human review: a named reviewer signs `evidence/prd05/assets/pilot-review.json` per pilot game (pass/fail + notes).
A pilot passes only with vision ≥ threshold **and** human pass.

### 16.3 Per-game asset impact (all 18 games; integrated)

Inputs: research 11 §2.3 (models, MB, untextured, 4-tri cards), research 21 `modeling_assets`. The migration
report (`migration-1.1.json`) regenerates the class columns and is authoritative; this table is the expected
shape. "Post-optimize only" is the minimum outcome lane 05 can deliver alone (derived files, measured
standalone); "with library" is the target once lane 14 applies the replacement lists (Q-14-3). Every game row is
checked at checkpoints by the "all 18" criterion in §16.2 (no category regresses > 0.5, ready download within
tier budget).

| Game | Today: models / MB / untextured / cards; `modeling_assets` | Expected downgrades (§10.1 classes) | Post-optimize only | With library (lane 14) | Ready download target (Medium) |
|---|---|---|---|---|---|
| aura-clash-showcase | not in research 11 table (compat RenderSource path); 4 | to be measured by migration script | fighter GLBs optimized, tangents added | `characters/humanoid-pbr` | ≤ 15 MB |
| showcase-blockfall-reactor | 4 / 8.2 / 0 / 3; 3 | 2 card "hero/rival" → D; arena backdrop → E | backdrop re-encoded KTX2 | robot/mech kit replaces cards | ≤ 15 MB |
| showcase-skyline-runner | 11 / 40.3 / 3 / 5; 4 | hero card + 3 ice ledges → D; parallax plate → E; Meshy runner → B | 40.3 MB → ≤ 15 MB | humanoid kit + platform kit (pilot, §16.2) | ≤ 15 MB |
| showcase-turbo-drift-circuit | 7 / 14.1 / 3 / 1; 3.5 | alpine venue card → E; circuit environment v2 → F | track/venue optimized | `vehicles/road` + track kit | ≤ 15 MB |
| showcase-siege-golf | 5 / 8.2 / 2 / 0; 3 | `siegeGolfBall` (G1 ceiling), `siegePlankSet` (G1 floor) → A replace | ball LOD/re-sourced | `props/sports-tabletop` golf set | ≤ 15 MB |
| showcase-aurora-lander | 4 / 3.4 / 2 / 2; 4 | lander hero card → D; bay plate → E; probe/beacon → C | bay plate KTX2 | `vehicles/air-space-sea` lander | ≤ 15 MB |
| showcase-neon-swarm | 7 / 23.8 / 2 / 3; 3 | 3 cards: `neonRainCourierHero`, `neonCrownMothElite` → D, `neonRainGardenArenaBackdrop` → E; street lamp (272k tris) → A replace | lamp replaced, 23.8 MB → ≤ 12 MB | robot enemies + industrial-urban props | ≤ 15 MB |
| showcase-gravity-post | 14 / 126.2 / 1 / 0; 3 | skiff/freight district → F/C; station ring 458k tris → A optimize | planets 4096 → 2048 KTX2, ring joined + LOD | air-space-sea + planets-space (pilot) | ≤ 15 MB (§16.2) |
| showcase-courier-rush | 7 / 31.5 / 0 / 0; 4 | parcel/bollard texture-waste flags; van → B | 31.5 MB → ≤ 12 MB; flat-tint look until lane 04's C-15 real is in `all` | road vehicles + city kit (pilot) | ≤ 15 MB |
| showcase-pulse-tunnel | 4 / 33.6 / 0 / 0; 3 | reactor world/craft/sentry → F; `pulseArena` → B | 33.6 MB → ≤ 15 MB | Meshy arena promoted or modular kit | ≤ 15 MB |
| showcase-mech-hangar | 17 / 28.4 / 16 / 0; 3.5 | 16 box parts → C; hero → B | 27 MB hero → ≤ 6 MB after §6.5 | robots-mechs kit (pilot) | ≤ 15 MB |
| showcase-vault-breakers | 5 / 0.8 / 5 / 0; 2 | all 5 → C | no change (nothing to optimize) | pinball kit (pilot) | ≤ 15 MB |
| showcase-rooftop-buckets | 10 / 45.4 / 5 / 0; 3 | backboard (12 tris) → C; defender/layup scorer byte-identical → alias | 45.4 MB → ≤ 15 MB via dedup + resize | humanoid kit + basketball set | ≤ 15 MB |
| showcase-gallery-shift | 10 / 20.8 / 7 / 0; 3 | display case (24 tris) → C; remaining 6 untextured → C or A per migration report; `galleryThief` → B | thief promoted or replaced | museum interior kit + robot guards | ≤ 15 MB |
| showcase-deep-recovery | 5 / 0.4 / 5 / 0; 2.5 | all 5 → C (procedural synth) | no change; frame cost is not asset-driven (§23) | seabed set + submarine | ≤ 15 MB |
| showcase-patrol-wing | 4 / 19.9 / 3 / 0; 4 | 3 untextured → C or A per migration report; `patrolAircraftMeshy` → B | aircraft promoted (judged ~7 today) | air-space-sea kit | ≤ 15 MB |
| showcase-bank-shot | 3 / 1.0 / 3 / 0; 3 | table/cue/balls → C | no change | sports-tabletop pool set (pilot) | ≤ 15 MB |
| showcase-orbital-defense | not in research 11 table; 1 | to be measured by migration script | — | planets-space + robot enemies | ≤ 15 MB |

Games whose "post-optimize only" column says "no change" (Vault Breakers, Deep Recovery, Bank Shot) gain
nothing visually from lane 05 alone; their §16.2 "all 18" row must still show no regression after the Phase 0
downgrade (labels change, pixels must not).

### 16.4 Integrated acceptance (checkpoints only; never blocks a lane-05 merge)

Evaluated only at CONTRACTS §7 G-PANEL rounds (IC-4 2026-11-05, IC-8, IC-12, …) with `A3D_QR_ASSETS` on inside
`qr_flags=all`; passing moves `A3D_QR_ASSETS` to `integrated-accepted` (§5.3). Leave-one-out (`all,-assets`)
separates asset deltas from renderer-lane deltas.

| # | Criterion | Integrated with (contract) |
|---|---|---|
| I1 | `prd05-lookdev-hero`: Aura ≥ 6.5 and gap to three ≤ 1.0 | 01 (C-02, C-05), 02 (C-09), 04 (C-03, C-15) |
| I2 | §16.2 six pilot games at their thresholds (vision + named human) | 14 (route swaps, Q-14-3), 04 (C-15 tint), 02 (C-09/C-10 ambient-vs-IBL, 15 of 18 games) |
| I3 | §16.2 "all 18" row: no category regresses > 0.5; ready download within §17.1 Medium | 14 (route opt-in), 15 (Q-15-1 model compile) |
| I4 | S3 equivalent through `model(assets.x)` on real routes (`assets-compressed-typed-glb.spec.ts`) | 04 (Q-04-1), 15 (Q-15-1) |
| I5 | Dithered LOD cross-fade with ≤ 1 visible pop; shadow casters one level coarser | 01 (C-02 generator), 02 (C-11, Q-02-1) |
| I6 | WebGPU decode with compressed formats; ΔE2000 ≤ 2.0 vs WebGL2 | 11 (Q-11-1, C-29) |
| I7 | Library characters move in games (`tracksApplied > 0` in motion strips) | 06 (C-19), 14 |
| I8 | Real Courier Rush bundle has 0 asset-metadata strings | 14 (Q-14-2) |

---

## 17. Performance budgets

These are targets. They become binding only after Phase 6 measures them on named devices; until then they
are design limits for gates G7 and the tier texture cap. Tier selection, tier ceilings (C-27: `maxTextureSize`
1024/2048/4096/4096, `textureBudgetBytes` 128/256/512/1024 MiB) and full-frame budgets are lane 11's; the rows
below are the asset-attributable share and always sit at or below the C-27 ceilings.

### 17.1 Per tier

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Reference device class | iPhone 12-class / mid Android (Adreno 6xx / Mali-G7x), 720p | Integrated GPU (Apple M1, Iris Xe), 1080p | Mid discrete (RTX 3060-class, M1 Pro), 1440p | High-end discrete, 4K |
| Max texture dimension (hero / other) | 1024 / 512 | 2048 / 1024 | 2048 / 1024 | 4096 (product, hero only) / 2048 |
| Scene texture VRAM (compressed where supported) | ≤ 96 MB | ≤ 192 MB | ≤ 384 MB | ≤ 768 MB |
| Scene geometry VRAM | ≤ 32 MB | ≤ 64 MB | ≤ 128 MB | ≤ 256 MB |
| Visible triangles (after LOD) | ≤ 300k | ≤ 750k | ≤ 1.5M | ≤ 3M |
| Asset draw calls (opaque + shadow) | ≤ 150 | ≤ 300 | ≤ 500 | ≤ 800 |
| GPU ms, geometry + shadow passes (asset-attributable) | ≤ 6 ms | ≤ 5 ms | ≤ 4 ms | ≤ 5 ms |
| CPU ms/frame, LOD select + asset culling | ≤ 0.3 ms | ≤ 0.4 ms | ≤ 0.5 ms | ≤ 0.6 ms |
| Load: main-thread long task from decode | none > 50 ms | none > 50 ms | none > 50 ms | none > 50 ms |
| Ready download (route, all assets before first playable frame) | ≤ 8 MB (mobile variants) | ≤ 15 MB | ≤ 25 MB | ≤ 40 MB |
| LOD cross-fade | off (hard switch) | on, 0.25 s | on, 0.25 s | on, 0.35 s |
| Transcode workers | 1 | 2 | 2 | 2 |

Bundle (all tiers): engine initial-bundle growth from decoder glue ≤ 3 KB gz; meshopt decoder lazy chunk
≤ 20 KB gz; basis transcoder 527,333 B raw WASM + 57,529 B JS, lazy, same-origin, cached; Draco never in the
initial bundle and only fetched for assets that require it; per-route typed asset module ≤ 20 KB gz (today the
monolithic module is 3.78 MB raw).

Memory caveat: if a device exposes no compressed format for a slot, RGBA8 fallback quadruples-to-octuples
texture memory; the tier cap then drops one more mip level so the VRAM budget still holds.

### 17.2 Per-role file budgets (derived GLB, High tier variant; mobile variant in parentheses)

| Role profile | Max file | Max GPU bytes (High) |
|---|---|---|
| hero-character | 6 MB (2.5 MB) | 20 MB |
| npc-character | 2 MB (1 MB) | 6 MB |
| hero-vehicle | 5 MB (2 MB) | 20 MB |
| traffic-vehicle | 1.5 MB (0.8 MB) | 5 MB |
| product | 8 MB (3 MB) | 32 MB |
| weapon | 1 MB (0.5 MB) | 4 MB |
| prop-large | 1 MB (0.5 MB) | 4 MB |
| prop-small | 0.3 MB (0.15 MB) | 1.5 MB |
| world-chunk | 8 MB (4 MB) | 32 MB |
| track | 6 MB (3 MB) | 24 MB |
| backdrop | 1.5 MB (0.6 MB) | 6 MB |
| hdri (2k RGBE; 1k on Low) | 7 MB (1.7 MB) | lane 02 (PMREM output, C-09) |

Aggregate target: the 120 game-referenced ids (or their replacements) ≤ 80 MB derived, from 463 MB today.
Reference arithmetic: one Meshy hero's 2× 4096² + 1× 2048² RGBA8 with mips ≈ 201 MB VRAM today (research 11
§3.5); the same set as 3× 2048² UASTC ≈ 17 MB.

---

## 18. Browser coverage

| Browser | Lane | What is verified |
|---|---|---|
| Chromium stable, macOS (ANGLE Metal) | GH Actions macos-14 (`asset-lookdev.yml`, `quality-rebuild-capture.yml`) | All visual acceptance; decode; compressed sRGB formats; LOD; look-dev |
| WebKit (Safari engine) | Playwright WebKit on macos-14 | Decode correctness (meshopt, KTX2 target selection, sRGB), worker transcoding, ΔE test |
| Firefox stable | Playwright Firefox on macos-14 | Decode correctness; ΔE test; capability probe log |
| Chromium, Windows (D3D11) | `windows-latest` job in lane-owned `qr-prd05-assets-browser.yml` (`browser-matrix.yml` is lane 12's and is not edited; hosted runners have no GPU) | Non-visual: decoder load, format selection with BC formats via capability mock; visual criteria not judged here |
| Safari 17+/18 desktop, Edge stable | manual on named hardware, Phase 6 | Load, VRAM, first-playable time for the 6 pilot games |

Each run logs the device's compressed-format extensions and the selected KTX2 target per texture slot; a run
where the selected target is `rgba8` on a device that advertises a compressed format fails.

---

## 19. Mobile coverage

- Every look-dev capture includes the 390×844 DPR 3 gameplay shot; G2 is evaluated at that viewport too
  (mobile texel density must stay ≥ 0.5 texels/pixel with the mobile variant).
- Low tier loads `variant: "mobile"` automatically; mobile variants are produced for character, vehicle, world,
  track and product profiles.
- Real devices (Phase 6, manual, recorded with device model and OS): one iPhone (A14 or newer, Safari) and one
  Android (Adreno 6xx-class, Chrome). Measure: ready time, ready bytes, peak JS heap, texture VRAM estimate,
  WebGL context loss count during a 3-minute session for the 6 pilot games.
- Mobile acceptance: no context loss; ready download ≤ 8 MB; first playable frame ≤ 6 s on the Android device
  over a throttled 20 Mbps profile.

---

## 20. Screenshots / evidence required

All under `docs/project/aura3d-quality-rebuild/evidence/prd05/assets/` (large binaries as CI artifacts with links):
- `migration-1.1.json` — gate results for every manifest entry and every downgrade.
- `optimize-dry-run.json` and `optimize-report.json` — per-id before/after measurements; aggregate for the 120 ids.
- `lookdev/<id>/<derivedHash8>/{contact.jpg, debug.jpg, gameplay.jpg, metrics.json, review.json}` for every
  `release` asset, plus the broken-control assets.
- Standalone: side-by-side JPGs for lane scenes `prd05-optimized-*` (equivalents of base scenes 02, 03, 08, 09,
  15, 18) and `prd05-asset-lod-transition` frame strips, in the `<scene>-side-by-side.jpg` format, with a C-30
  `report.json` including the optimized-vs-source SSIM and vision scores.
- Integrated (from checkpoint records, linked not copied): `prd05-lookdev-hero` G-PANEL scores; pilot game
  before/after contact sheets (`<id>-contact.before.jpg`, `<id>-contact.after.jpg`) from default routes, the vision
  judgment markdown, and `pilot-review.json` signed by a named human.
- `tier-measurements.json` with device/GPU strings and the §17 metrics.
- `meshy-promotion.json` — per Meshy asset: remesh/bake settings, gates, decision.
Evidence captured under `?capture=review` or any non-default route mode does not count.

---

## 21. Completion criteria

Lane-05 completion (standalone; reached without any other lane's real implementation; moves `A3D_QR_ASSETS` to
`standalone-accepted`):

1. The regex waiver and flat-colour waiver are deleted; no `release` asset in the root manifest or the library
   fails G1–G11 (`qr-prd05-gates.yml`-enforced); template-manifest rows are published for lane 13.
2. `aura3d assets optimize`, `lookdev`, `review`, `admit`, `budget`, `prune`, per-route `typegen` exist (C-39),
   are documented in `cli-help.ts`, and run on the remote lanes.
3. The C-16 decoder path (registry + vendored decoders + sRGB format slot) loads meshopt + KTX2 (+ Draco on
   demand) assets with correct sRGB on Chromium, WebKit and Firefox with no third-party network requests (S3, S4).
4. LOD chains and collider sidecars are generated and consumed by lane-05 code; `prd05-asset-lod-transition`
   passes with the hard switch (S7).
5. The library kits and 6 HDRIs of §6.6 are admitted at `release` with three-adapter look-dev approvals; all 8
   Meshy assets have a promotion decision (S9).
6. `prd05-optimized-*` lane scenes pass §16.1 (S6).
7. The 120 game-referenced ids (or replacements) total ≤ 80 MB derived; route-module fixtures are free of asset
   metadata strings; `check-deploy` copies only referenced assets (S10).
8. C-16/C-17 conformance green for stub and real; every §12.3 request filed; facts F-05-01..06 published.
9. Tier budgets measured on named devices and committed; any budget exceeded has a filed issue against the
   owning lane.

Program completion (integrated, §16.4; evaluated at G-PANEL checkpoints and never holding a lane-05 merge):
`prd05-lookdev-hero` (I1), the six pilot games and the "all 18" row (I2, I3), `model(assets.x)` on real routes
(I4), dithered LOD (I5), WebGPU (I6), moving library characters (I7), real route bundles (I8); the §16.3 per-game
table regenerated from the migration report and committed for all 18 games.

Not completion: tests green, all routes 200, non-blank probes, parity matrices green, or a "release" label count.

---

## 22. Rollback considerations

- Flag rollback: `A3D_QR_ASSETS=off` (or `_DECODERS` / `_LOD` alone) returns every route to stub behaviour
  (source URLs, today's decoders and format mapping, no LOD extension) with no code revert; a lane-05 PR that
  turns main red is reverted by anyone (CONTRACTS §6.1).
- Source files and provenance are never modified; derived files are additive. `aura3d assets typegen --variant
  source` (or `createAuraApp({ assets: { variant: "source" } })`) points every route back at sources with no
  data loss.
- Decoder problems in production (e.g. a CSP lacking `wasm-unsafe-eval`, a WebKit worker WASM failure): switch the
  affected route to `variant: "source"` and redeploy; the failure is visible (`AssetDecoderUnavailable`), never a
  silent untextured frame.
- Gate rollback: reverting the Phase 0 commit restores 1.0 behaviour, but the downgrade commit is kept separately so
  labels are not silently re-promoted; restoring labels requires an explicit revert of that commit with reason.
- LOD issues: `lod: false` per model or a global `assets.lod: false` flag in `createAuraApp` disables selection
  (LOD0 only) without re-optimizing.
- Colliders: `collider: "bounds"` restores today's behaviour per model.
- Library swaps in games are per-route commits owned by lane 14 and revert independently.

---

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Renderer lanes' fixes (04 tint C-15, 02 ambient-vs-IBL C-09/C-10) are late | Optimized PBR assets still render flat in games; integrated I1–I3 miss checkpoints | Nothing in lane 05 waits: standalone acceptance is three-adapter look-dev + within-engine equivalence; integrated results are re-scored at every checkpoint and misses become `qr-ic-regression` issues against the attributed lane |
| Requests Q-04-1 / Q-15-1 declined or slow | `model(assets.x)` keeps loading uncompressed sources; derived files unused by routes | Owners must answer within 2 working days (CONTRACTS §6.5); meanwhile `variant: "source"` stays the route default and lane tests prove the decoder path directly |
| A PR 0b carve (0b-2 `TextureFormats.ts`, 0b-3 `ImageDecode.ts` / actor hook) is dropped for not being verbatim | Lane 05 cannot edit that region | CONTRACTS §3.9: the region stays with the hot-file owner; lane 05 converts the change to a §12.3 request with the code attached |
| UASTC files larger than source JPEGs for some textures | Download grows on specific assets | Per-slot choice (ETC1S for base/ORM on props), RDO + Zstd; G7 measured per file; WebP fallback encoding allowed for backdrops |
| ETC1S artefacts on gradients (skies, backdrops) | Banding visible | Backdrops default UASTC when gradient detector fires; look-dev review catches |
| MikkTSpace tangents mismatched with how a source normal map was baked | Shading seams | Look-dev normal debug view + G9; keep authored TANGENT when present |
| Simplification breaks skinned deformation or UV seams | Visible tearing/pops | Skinned LOD ≤ 2 levels, `lockBorder`, attribute weights; scene 08/15 IoU checks; LOD strip in look-dev |
| Quantization on skinned positions | Skin errors | Skinned positions stay float (§6.3 step 8) |
| Vision-model judge variance or leniency | False passes | Two runs + human on hero roles; broken-control assets must fail (Phase 4 exit) |
| Licence errors in library (CC-BY attribution, Mixamo redistribution) | Legal exposure | Licence is a hard filter; credits generated per route; Mixamo raw files excluded; review entry per retargeted clip |
| AI-image cards labelled CC0 by prompt file | Rights ambiguity | `rightsReview: "required"` flag; cards limited to `backdrop` |
| Blender/remote bake capacity and cost | Phase 5 delay | Batch per kit; reuse one remote worker; cache by source hash |
| LFS storage growth from derived files | Repo/LFS quota | Prune orphans (490 MB) first; derived files deduplicated by hash |
| Over-attributing performance to assets | Wrong priorities | Deep Recovery runs 0.5 fps with 0.4 MB of geometry (report.slim.json; research 11 §2.4): frame cost there is not asset-driven; lane 11 owns frame performance (C-27/C-28) |
| Gate tuning too strict for stylized games | Valid stylized art blocked | `stylized-flat` art-direction path with UVs + look-dev review (G10) instead of text waivers |

---

## 24. Explicitly out of scope

- BRDF, IBL, shadow, tone-mapping and post fixes (lanes 01–03; C-02, C-05, C-09–C-13) and material/tint semantics
  (lane 04; C-03, C-15), except the sRGB compressed-format mapping implemented here in `webgl2/TextureFormats.ts`.
- Per-game scene rebuilds, layout and art direction beyond asset swaps (lane 14; C-35).
- Animation playback, retargeting and clip authoring (lane 06; C-19); lane 05 only requires library characters to
  ship with clips and emits C-17 `animationClips`.
- Runtime texture streaming, virtual texturing, cluster/meshlet LOD (`meshopt_clusterizer`), GPU-driven culling
  (lane 11).
- Lightmap/AO baking for worlds and terrain splat authoring (lane 10); lane 05 bakes per-asset AO only.
- Native FBX/USD/USDZ/DAE import (remains "convert-required", `AssetImportPreflight.ts:142-143`).
- Audio synthesis, transcoding (Opus/AAC) and playback (lane 09; its `assets transcode-audio` command registers
  via C-39). Lane 05 only stores audio provenance/loudness metadata and enforces the release provenance rule
  (17 of 18 games use oscillator-synthesized WAVs, research 18 C12).
- DCC exporter plugins (Blender/Maya add-ons) and an in-browser asset editor.
- Commissioning contracts and art budgets; this PRD defines the admission bar commissioned art must meet.

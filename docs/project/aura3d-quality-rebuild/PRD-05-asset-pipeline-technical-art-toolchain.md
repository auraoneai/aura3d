# PRD 05 — Asset Pipeline + Technical-Art Toolchain

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit` @ `c08d8acb`.
Status: proposed. Owner area: `packages/aura3d-cli` (assets verbs, release gates, Meshy import), `packages/assets`
(loaders, decoders, preflight, mesh optimization), `packages/asset-index` (catalog adapters, ranking),
`packages/engine/src/production-runtime/TypedGLBActor.ts` (decoder wiring), new `tools/asset-optimize/`,
new `apps/asset-lookdev/`, root `aura.assets.json` / `src/aura-assets.ts` / `public/aura-assets/`.

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

### 2.6 Render-time asset destruction owned by other PRDs (blocking dependencies)

- `model(asset, { material })` with any colour sets `replaceSurfaceTextures: true` (hard-coded,
  `packages/engine/src/agent-api/index.ts:13567-13580`), disabling base-colour and metal-rough maps on every
  material (`TypedGLBActor.ts:484-514`); `material.pbr()` always injects `#d7dee8` (`index.ts:2415-2417`).
  Confirmed by 19 C3. Owned by PRD 04.
- `lights.ambient()` without an `environments.*` node zeroes IBL (`index.ts:12693-12707`): 15 of 18 games
  (18 §1 C1; Aura Clash avoids it through the compatibility RenderSource path). Owned by PRD 02.
- Instanced boxes ignore `node.size` in `createProductionInstanceTransforms` (`index.ts:14747-14753`;
  research 22/23 `16-instancing`). Owned by PRD 11; blocks instanced library props.

Optimized assets will still look flat until PRD 04 (tint) and PRD 02 (IBL) land. This PRD's visual acceptance
is therefore sequenced after those fixes (§12, §16).

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
| `@aura3d/cli` (`packages/aura3d-cli`) | New verbs `assets optimize`, `assets lookdev`, `assets budget`, `assets library`, `assets admit`; replace release gates; Meshy promotion; manifest schema 1.1; per-route typegen; deploy subset |
| `@aura3d/assets` (`packages/assets`) | Delete/replace `MeshOptimization`, `AssetImportPreflight` stubs, `KTX2LoaderThreeCompat`; local basis transcoder; target-format detection; sRGB compressed formats (shared with PRD 04); MSFT_lod parse; texture level cap per tier |
| `@aura3d/engine` (`packages/engine`) | `createTypedGLBActor` decoder injection; `model()` `lod` option; quality-tier texture cap; collider sidecar consumption; `ensureAssetDecoders` defaults on |
| `@aura3d/rendering` (`packages/rendering`) | sRGB compressed internal formats in `WebGL2Device` and WebGPU device; LOD dither cross-fade; look-dev debug views |
| `@aura3d/asset-index` (`packages/asset-index`) | Poly Haven HDRI + texture adapters (direct 1k/2k files), ambientCG texture adapter, library catalog source, visual-signal ranking |
| `@aura3d/physics-rapier` | Consume generated collider sidecars |
| `create-aura3d` templates + skills | Replace starter assets; update `aura3d-assets`, `meshy-cli`, `aura3d-performance`, `aura3d-materials-environments` skills |
| New: `tools/asset-optimize` | Node pipeline on `@gltf-transform/*` + meshoptimizer + KTX-Software + MikkTSpace; runs in CI/remote |
| New: `apps/asset-lookdev` | Look-dev viewer route + capture script (both Aura3D and three r185 adapters) |

---

## 5. Affected files / directories

- `packages/aura3d-cli/src/cli.ts` (verb dispatch), `cli-help.ts`, `cli-options.ts`
- `packages/aura3d-cli/src/index.ts` — `createRoleAwareReleaseQualityWarnings` (:3210-3272), `requiresTextureEvidence` (:3376-3382, delete), `hasHashBoundFlatColorMaterialEvidence` (:3164-3178, delete), release-primary check (:3005), `retainedGameSubjectCertificationBlockers` (:702-760), `addAsset` (:313), `validateAssets` (:875)
- `packages/aura3d-cli/src/asset-core-types.ts` (schema 1.1 types), `asset-manifest.ts` (`writeTypedAssets` :37, per-route typegen), `asset-role-admission.ts`
- `packages/aura3d-cli/src/meshy/import.ts:42`, `meshy/admission.ts:100-137`
- `packages/aura3d-cli/src/pull-bridge/scoring.ts`, `packages/asset-index/src/ranking.ts`, `adapters/poly-haven.ts`
- `packages/assets/src/MeshOptimization.ts`, `AssetImportPreflight.ts`, `loaders/KTX2Loader.ts`, `KTX2BasisTextureTranscoder.ts` (incl. `ensureCompressedTextureSupport` :277-293), `GLTFCompressionDecoders.ts` (`createMeshoptDecoder` :63, `createDracoDecoder` :85), `GLTFLoader.ts`, `GLTFRenderResources.ts` (:2196-2237 decode/sampler), `GLTFExtensionSupport.ts`, `asset-corpus/ProductionGLTFRenderPipeline.ts`
- `packages/engine/src/production-runtime/TypedGLBActor.ts:183-191`, `packages/engine/src/agent-api/AssetDecoders.ts`, `packages/engine/src/agent-api/index.ts` (`AuraModelOptions` :1235-1257, `AuraAssetDefinition` :951-960, model node → actor :13540-13600)
- `packages/rendering/src/Texture.ts:1` (`TextureCompressedFormat` union), `packages/rendering/src/WebGL2Device.ts` (:4066-4068, :4117-4133 compressed formats), `packages/rendering/src/WebGPUDevice.ts` (new compressed upload path; none exists today), `ShaderLibraryCore.ts` / `ShaderLibrary.ts` (LOD dither)
- `apps/loader-ktx2/src/main.ts` (only direct low-level KTX2 caller; migrate to `transcoderUrl`)
- `packages/rendering/src/performance/LOD.ts` (delete `createDefaultPerformanceLodLevels` or back it with real meshes)
- New `tools/asset-optimize/{index.ts,profiles.ts,steps/*.ts,checks/*.ts,README.md}`
- New `apps/asset-lookdev/{index.html,src/main.ts,src/three-adapter.ts,src/aura-adapter.ts,capture.mjs}`
- New `.github/workflows/asset-optimize.yml`, `.github/workflows/asset-lookdev.yml`
- `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/`, new `assets/library/` + `aura.library.json`
- `apps/showcase-*/scripts/build-models.mjs`, `build-review-art.mjs`, `register-models.mjs`, `register-assets.mjs` (demotion)
- `packages/create-aura3d/templates/*/aura.assets.json` (product-viewer, racing-starter, mini-game, fighting-game, character-controller, falling-blocks-starter)
- `packages/aura3d-cli/skills/aura3d-assets/SKILL.md` (:109 rule enforcement), `packages/aura3d-cli/skills/meshy-cli/SKILL.md` (:56-66 profile budget table), `packages/aura3d-cli/skills/aura3d-performance/SKILL.md`, `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` (:9-10). These are canonical; the `.agents/`, `.claude/`, `.cursor/` and `packages/create-aura3d/skills/` copies are mirrors regenerated by `pnpm skills:sync` and checked by `pnpm check:skills` — never edit mirrors by hand. There is no root `skills/` directory.

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
| `hdri` | environment type | — | — | RGBE `.hdr` 2k (+ 4k Ultra) kept; KTX2 `R16G16B16A16_SFLOAT`/UASTC-HDR only after PRD 02 supports it | — | — | 2048×1024 | — | — |

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
| **G9 Look-dev approval** | A look-dev record bound to `derived.hash` with rubric score ≥ 6.5/10 (hero roles: vision model **and** named human; other roles: vision model, human spot-check of ≥ 10 % sampled weekly). The G9 score is computed on the **three r185 adapter frames** (the file reference, §6.7), so asset admission does not wait on PRDs 01–04; the Aura-adapter score is recorded alongside and an Aura-minus-three gap > 1.5 files a renderer issue against PRDs 01–04 without blocking the asset. Rubric axes: silhouette, surface detail, material believability under three HDRIs, texel sharpness at gameplay distance, LOD transitions, artefacts (seams, faceting, flipped normals, shading errors); score = unweighted mean of the 6 axes, any single axis < 4 fails regardless of mean. | `apps/asset-lookdev` capture + review record (§6.7) |
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
| `textures/tiling` | ≥ 16 PBR sets (asphalt, concrete ×2, painted metal, brushed metal, rubber, felt, wood ×2, leather, fabric, sand, rock, grass, tiles, plastic) at 1024 + 2048, UASTC normal/ORM | PRD 04 materials, PRD 10 terrain/world |
| `planets-space` | planet albedo/normal/night/cloud sets at 2048/4096 (existing NASA sources, re-encoded), starfield cube | Gravity Post, Orbital Defense, Aurora Lander |
| `hdri` | ≥ 6 at 2k (+4k for Ultra/product): studio soft, studio high-contrast, outdoor midday, outdoor golden hour, overcast, night city; plus the 3 repo HDRIs re-sourced at 2k (`studio_small_08`, `autumn_field_puresky`, `kloppenheim_06_puresky`) | PRD 02 default environment, look-dev, every game |

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
the issue is filed against PRDs 01–04, not the asset.

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

- New `AssetDecoderRegistry` in `@aura3d/assets`, created once per `createAuraApp`. `createTypedGLBActor`
  reads `asset.requiredDecoders` (emitted by typegen from `extensionsUsed`) and awaits
  `registry.require([...])` before `loadProductionGLTFRenderPipeline`, passing `meshoptDecoder`, `dracoDecoder`
  and a KTX2-aware `imageDecoder` (fixes E9–E11).
- Meshopt decoder: `meshoptimizer@1.2.0` `MeshoptDecoder`, dynamic-imported chunk; budget ≤ 20 KB gz, measured
  in Phase 1 (the module embeds SIMD and scalar WASM as base64, 29,256 B raw in the three copy).
- Draco: `draco3d@1.5.7` decoder WASM copied to `/aura-decoders/draco/`, loaded only when an asset requires it.
- Basis: `basis_transcoder.{js,wasm}` vendored into `packages/assets/vendor/basis/` (copied from
  `node_modules/three/examples/jsm/libs/basis/` at three 0.185.1, sha256 recorded, upstream Apache-2.0),
  served from `/aura-decoders/basis/`. **Delete** the unpkg fallback (`KTX2BasisTextureTranscoder.ts:22`).
- Transcoding in a worker pool (`workerCount`: 1 on Low/mobile, 2 on Medium+; never raised automatically).
- Target selection per device and slot: UASTC → ASTC 4×4 → BC7 → ETC2 RGBA8 → RGBA8; ETC1S → ETC2 RGB8 (opaque)
  / ETC2 RGBA8 (alpha) → BC1 (opaque) / BC3 (alpha) → RGBA8. ETC1S never targets the legacy `ETC1` format
  because WebGL has no sRGB ETC1 internal format; ETC2 RGB8 is a bit-exact superset. sRGB variants for colour
  slots; transcode only the selected target (no second RGBA8 transcode unless the upload fails).
- Tier texture cap: skip KTX2 levels above `maxTextureSize`; for PNG/JPEG sources use
  `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: "high" })` when larger than the cap (E14).
- LOD: production runtime selects `MSFT_lod` level by projected bounding-sphere height fraction each frame
  with 10 % hysteresis and optional dithered cross-fade (§8); shadow casters use one level coarser.
- Colliders: `model(asset, { physics, collider: "auto" })` loads `collision.glb` and builds Rapier
  `ColliderDesc.convexHull`/`trimesh` (`physics-rapier/src/index.ts:555-557`) instead of bounds boxes.

### 6.9 Packaging

- Per-route typegen: `aura3d assets typegen --route apps/<app>` emits `src/aura-assets.route.ts` containing only
  the assets that route references (AST scan from `asset-source-validation.ts`), with fields `type, format,
  url, hash, bounds, sizeBytes, requiredDecoders, lods, colliderUrl, budget` — no licence, suitability or
  provenance strings (they stay in the manifest and in a generated `CREDITS.md`/`credits.json` per route).
- Per-route deploy subset: `check-deploy` copies only referenced derived files to `dist/aura-assets`; orphan
  prune (`assets prune --dry-run` then apply) removes the 529 stale files from `public/aura-assets`.
- Coordinate the module split with PRD 15 (package/API consolidation); this PRD owns the generator.

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
| R3 | MikkTSpace tangents offline | Removes normal-map seam/shading errors on 98 of 120 GLBs | +16 B/vertex (8 B quantized) | Removes runtime Lengyel generation at load | +8–16 B/vertex | 0 | Neutral | Runtime derivative TBN (PRD 04) |
| R4 | LOD generation (MSFT_lod) + screen-coverage selection | Allows dense hero/world assets without popping; dither cross-fade | −30–70 % triangles in wide shots (estimate) | ≤ 0.2 ms/frame selection for 500 nodes | +40–60 % geometry bytes (LOD chain) | +~2 KB gz selector | Large win on vertex-bound GPUs | `lod: false` per model; LOD0 only |
| R5 | Collider generation | None directly; correct contacts/grounding feed game feel (PRD 08) | 0 | Rapier hull build at load (≤ 5 ms/asset) | +5–20 % of geometry bytes in sidecar | 0 | Neutral | Bounds box colliders (current behaviour) |
| R6 | Visual-quality gates G1–G11, delete regex waiver | Stops programmer art and cards reaching release; forces PBR-complete assets | 0 | CI only | 0 | 0 | 0 | `candidate` label; no runtime effect |
| R7 | Generated-asset promotion (remesh + bake) | Best available 3D for the games (judge: Meshy mech ~6, Meshy plane ~7) becomes shippable at web budgets | Lower than today (27 MB raw heroes) | Remote Blender only | Hero 27 MB file → ≤ 6 MB target | 0 | Required for mobile | Keep as `candidate` |
| R8 | Curated hero library + 2k HDRIs | Coherent art direction per game; fixes style clashes judged in 5 games | Neutral | Neutral | Bounded by profiles | 0 (assets are not JS) | Mobile variants per kit | Existing assets until replaced (PRD 14) |
| R9 | Look-dev viewer | Catches bad assets before they reach a game; separates asset vs renderer faults | Remote runner only | Remote only | — | 0 (separate app) | Captures 390×844 DPR 3 | Manual review on contact sheet |
| R10 | Decoder wiring + local transcoder | Makes R1/R2 usable from `model()`; removes third-party CDN | 0 | Worker transcode | Worker heap ≤ 32 MB | +≤ 3 KB gz registry glue in core | Same | Fail loud with `AssetDecoderUnavailable` diagnostic (no silent fallback) |
| R11 | Per-route typegen + deploy subset | Faster first frame | 0 | Parse 3.78 MB module removed | −3.6 MB JS heap per route | −~3.5 MB raw JS per route (281 suitability strings gone) | Large: mobile JS parse | Monolithic module generator kept behind `--all` for one minor |
| R12 | Tier texture caps | Prevents VRAM blowups; removes one plausible contributor to context loss (Courier Rush 1920 run lost its WebGL context, research 20 line 710; cause not established) | Bandwidth down on Low | None | Hard VRAM ceiling per tier (§17) | 0 | Essential | Cap 1024 globally if tier unknown |

---

## 7. APIs to add / change / remove

### 7.1 CLI (`@aura3d/cli`)

```ts
// packages/aura3d-cli/src/optimize/types.ts (new)
export type AssetOptimizeProfileId =
  | "hero-character" | "npc-character" | "hero-vehicle" | "traffic-vehicle" | "product" | "weapon"
  | "prop-large" | "prop-small" | "world-chunk" | "track" | "backdrop" | "hdri";

export type AssetGeometryCompression = "meshopt" | "draco" | "none";
export type AssetTextureEncoding = "ktx2" | "webp" | "source";
export type AssetColliderMode = "auto" | "convex" | "trimesh" | "box" | "capsule" | false;

export interface AssetOptimizeOptions {
  readonly projectDir?: string;
  readonly assetIds: readonly string[];            // or ["*"] for the whole manifest
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

export interface AssetBudgetMeasurement {
  readonly fileBytes: number;
  readonly triangles: number;                      // LOD0
  readonly vertices: number;
  readonly primitives: number;
  readonly materials: number;
  readonly drawCallsEstimate: number;
  readonly textures: {
    readonly count: number;
    readonly maxDimension: number;
    readonly downloadBytes: number;
    readonly gpuBytesByTier: Readonly<Record<AuraQualityTier, number>>;
  };
}

export interface OptimizeStepRecord {
  readonly step: "weld" | "dedup" | "prune" | "join" | "palette" | "resize" | "tangents" | "lod"
    | "colliders" | "quantize" | "meshopt" | "draco" | "ktx2" | "remesh" | "bake";
  readonly tool: string;                           // e.g. "@gltf-transform/functions@4.x.y"
  readonly settings: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
}

export interface AssetQualityCheck {
  readonly gate: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | "G9" | "G10" | "G11";
  readonly verdict: "pass" | "fail" | "not-applicable";
  readonly measured: Readonly<Record<string, number | string | boolean>>;
  readonly message: string;
}

export interface AssetOptimizeRow {
  readonly assetId: string;
  readonly sourceHash: string;
  readonly derivedHash: string;
  readonly profile: AssetOptimizeProfileId;
  readonly before: AssetBudgetMeasurement;
  readonly after: AssetBudgetMeasurement;
  readonly steps: readonly OptimizeStepRecord[];
  readonly checks: readonly AssetQualityCheck[];
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
export interface AuraCliLookDevRecord {
  readonly derivedHash: string;
  readonly stageVersion: string;
  readonly contactSheet: string;                   // artifact path/URL
  readonly metrics: { readonly threeVsAuraMaskedSsim: number; readonly gameplayTexelsPerPixelP50: number };
  readonly reviews: readonly {
    readonly judge: "human" | "vision-model";
    readonly judgeId: string;                      // person name or model id
    readonly score: number;                        // 0-10 rubric mean
    readonly axes: Readonly<Record<"silhouette" | "surfaceDetail" | "materials" | "texelSharpness" | "lod" | "artifacts", number>>;
    readonly notes: string;
    readonly reviewedAt: string;
  }[];
}
export function captureAssetLookDev(options: AssetLookDevOptions): Promise<{ readonly runUrl: string }>;
export function recordAssetLookDevReview(assetId: string, review: AuraCliLookDevRecord["reviews"][number]): AssetCliResult;

// packages/aura3d-cli/src/admission/types.ts (new)
export interface AssetAdmitOptions {
  readonly assetId: string;
  readonly quality: "candidate" | "release";
  readonly route?: string;                         // enables G10 route checks and gameplay camera from route profile
  readonly cameraDistance?: number;                // G2 override, metres
  readonly fovDegrees?: number;
  readonly viewport?: readonly [number, number];
}
export interface AuraCliAdmissionRecord {
  readonly derivedHash: string;
  readonly quality: AuraAssetQuality;
  readonly checks: readonly AssetQualityCheck[];
  readonly admittedAt: string;
}
export function admitAsset(options: AssetAdmitOptions): AssetCliResult & { readonly admission: AuraCliAdmissionRecord };
```

CLI verbs (dispatch in `cli.ts`):

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

### 7.2 Manifest schema 1.1 (`asset-core-types.ts`)

```ts
export type AuraCliAssetRole = /* existing */ | "backdrop" | "proxy";

export interface AuraCliDerivedAsset {
  readonly hash: string;
  readonly sourceHash: string;
  readonly profile: AssetOptimizeProfileId;
  readonly outputPath: string;
  readonly url: string;
  readonly mobileUrl?: string;
  readonly collisionUrl?: string;
  readonly extensionsUsed: readonly string[];
  readonly requiredDecoders: readonly ("meshopt" | "draco" | "ktx2")[];
  readonly lods: readonly { readonly level: number; readonly triangles: number; readonly screenCoverage: number }[];
  readonly measurements: { readonly before: AssetBudgetMeasurement; readonly after: AssetBudgetMeasurement };
  readonly steps: readonly OptimizeStepRecord[];
  readonly optimize?: "not-needed";
}

export interface AuraCliAssetManifest {
  readonly schema: "aura3d.assets/1.0" | "aura3d.assets/1.1";
  // ...existing fields
}

export interface AuraCliAssetEntry {
  // ...existing fields (unchanged, including provenance and suitabilityReason)
  readonly derived?: AuraCliDerivedAsset;
  readonly admission?: AuraCliAdmissionRecord;
  readonly lookDev?: AuraCliLookDevRecord;
  readonly artDirection?: string;
  readonly aliasOf?: string;                       // byte-identical source dedup
  readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number }; // G2 override (§6.4)
}
```

### 7.3 Engine (`@aura3d/engine`)

```ts
// packages/engine/src/agent-api/index.ts
export type AuraQualityTier = "low" | "medium" | "high" | "ultra";   // shared with PRD 11; defined there if it lands first

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
// createAuraApp(options: { ...existing; readonly assets?: AuraAppAssetOptions })

// packages/engine/src/production-runtime/TypedGLBActor.ts
export interface TypedGLBActorOptions {
  // ...existing
  readonly decoders?: AuraAssetDecoderSet;
  readonly maxTextureSize?: number;
  readonly lod?: { readonly mode: "auto" | "fixed"; readonly level?: number; readonly bias?: number; readonly crossFadeSeconds?: number };
}
export interface TypedGLBActor {
  // ...existing
  setLodLevel(level: number, fade?: number): void;
  readonly lodLevels: number;
}
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
export interface AssetDecoderRegistry {
  require(decoders: readonly ("meshopt" | "draco" | "ktx2")[]): Promise<AuraAssetDecoderSet>;
  readonly diagnostics: readonly { readonly decoder: string; readonly status: "ready" | "failed"; readonly detail?: string }[];
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
// Rendering side: `TextureCompressedFormat` (packages/rendering/src/Texture.ts:1) gains
// "bc7-rgba-unorm" | "etc2-rgb8unorm"; the existing "bc1-rgba-unorm" is reused for BC1 targets.
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
and `WebGL2Device` maps sRGB + compressed format to `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`,
`COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT`, `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`, `COMPRESSED_SRGB8_ETC2`,
`COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT` / `COMPRESSED_SRGB_S3TC_DXT1_EXT` (BC1 for ETC1S opaque). Every ETC2 format
is gated on `getExtension("WEBGL_compressed_texture_etc")` (today `0x9278` is uploaded unconditionally, E13).
`WebGPUDevice` gets a new compressed upload path (`writeTexture` per mip level with block-aligned
`bytesPerRow`) for the `-srgb`/`-unorm` variants, gated on `device.features`.

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

This PRD is mostly offline. Shader work is limited to what optimized assets and look-dev need.

1. **Compressed sRGB sampling (GLSL/WGSL).** No math change: `a3dTexturedPbrDecodeSrgb` stays the identity
   (`ShaderLibrary.ts:2470-2472`, returns `max(encodedColor, 0)`) because decode happens in hardware sRGB
   formats (§7.4), exactly as for today's `SRGB8_ALPHA8` RGBA8 uploads. Required test: a KTX2 base
   colour texture and the same PNG render within ΔE2000 ≤ 2 mean (§15). WGSL: map to
   `astc-4x4-unorm-srgb`, `bc7-rgba-unorm-srgb`, `etc2-rgba8unorm-srgb`, `etc2-rgb8unorm-srgb`,
   `bc1-rgba-unorm-srgb`, `bc3-rgba-unorm-srgb` texture formats; no shader change.
2. **Quantized attributes.** Vertex shaders unchanged; `vertexAttribPointer(..., normalized = true)` for
   `KHR_mesh_quantization` SHORT/BYTE accessors (WebGL2) and `snorm16x4`/`unorm16x2`/`snorm8x4` vertex formats
   (WebGPU). Positions dequantize through the node matrix gltf-transform writes; the instance path must compose
   node scale correctly (depends on PRD 11 fixing `createProductionInstanceTransforms`, `index.ts:14747-14753`).
   Skinned positions stay float (§6.3 step 8).
3. **LOD dither cross-fade.** New define `A3D_LOD_DITHER` in the opaque PBR, skinned-lit, unlit and depth/shadow
   variants (`ShaderLibraryCore.ts`):
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
   WGSL: same table in a `const` array, `@builtin(position)` for the pixel coordinate. Both LOD levels draw
   during the fade (complementary masks), default 0.25 s; disabled on Low tier (hard switch).
4. **Look-dev debug views** (`A3D_DEBUG_VIEW` integer define, compiled only into `apps/asset-lookdev` builds,
   never into game bundles):
   - 1 base colour (post-decode linear → sRGB display), 2 world normal `n*0.5+0.5`, 3 roughness, 4 metallic,
     5 occlusion, 6 facet view `normalize(cross(dFdx(v_worldPos), dFdy(v_worldPos)))`.
   - 7 texel density: `vec2 t = fwidth(v_uv0 * u_baseColorTextureSize); float tpp = max(t.x, t.y);`
     colour ramp on `log2(tpp)`: red < −1 (under 0.5 texels/pixel, blurry), green [−1, 2], blue > 2 (over 4,
     wasted). Requires a new `u_baseColorTextureSize` (vec2) uniform set by `GLTFRenderResources`.
   - 8 mip level: `0.5 * log2(max(dot(dFdx(uvTex), dFdx(uvTex)), dot(dFdy(uvTex), dFdy(uvTex))))` bucketed.
5. **No changes** to BRDF, IBL or tone mapping here (PRDs 01–04).

---

## 9. Rendering changes

- `createTypedGLBActor` awaits decoders and passes them to the pipeline (E9). Assets without compression
  extensions skip the registry (no added latency).
- Texture uploads: compressed formats with full mip chain from KTX2 (no `generateMipmap` for compressed);
  tier cap skips top levels; RGBA8 fallback only when the selected compressed upload fails (`readError()` path
  in `WebGL2Device.ts:3925-3946` kept, but transcoding to RGBA8 happens lazily, not up front).
- LOD selection runs in the production runtime per frame before culling: projected bounding-sphere height /
  viewport height vs `MSFT_screencoverage`, `bias` multiplies coverage, hysteresis 10 %, max one LOD step per
  frame per actor. Shadow pass uses `min(level + 1, maxLevel)` (coordinate with PRD 02's depth-shader rewrite,
  which must also add skinning; research 19 C4).
- Render-item count drops wherever `join` merges primitives; the draw-call estimate in `metrics.json` is checked
  against the renderer's measured draw calls in the look-dev capture (difference > 10 % fails the capture).
- Collision sidecars are never rendered or uploaded to the GPU.
- HDRI entries (type `environment`) are consumed by PRD 02's `environments.hdri` chain; this PRD supplies files,
  metadata (`sunDirection`, `luminanceP99`, `whiteBalanceK`), and 2k resolution. Background visibility is PRD 02.
- No change to sampler state: GLB textures already use `linear-mipmap-linear`, `repeat`, anisotropy 8
  (`GLTFRenderResources.ts:2196-2213`, research 03 §5.2).

---

## 10. Migration plan

### 10.1 Triage of the 120 game-referenced models (classes from §2.4)

| Class | Count | Action | Resulting quality |
|---|---:|---|---|
| A. Real PBR sources (Objaverse/Sketchfab 34, NASA 5, OpenGameArt 1, Kenney 3) | 43 | `assets optimize` with role profile; re-admit through G1–G11; replace if G1/G9 fail (e.g. `siegeGolfBall`, `siegePlankSet`, `neonStreetLampProp`, `showcaseRoboticWeldingWorkcell` 704,582 tris) | `release` only after look-dev |
| B. Meshy (8) | 8 | §6.5 promotion: remesh 15–30k, bake, optimize; `pulseArena`, `mechHeroDecimated`, `patrolAircraftMeshy`, `skylineHeroRunner`, `galleryThief`, `courierVanMeshyV2Decimated`, `gravityPostMeshyFreight`, `rooftopShooterMeshyV1` | `candidate` → `release` on pass |
| C. Scripted geometry (`aura3d-original` + "procedural world") | 50 | reclassify role `proxy`, quality `prototype`; replace in game by library asset (PRD 14 per game) | `prototype` |
| D. 4-tri cards standing in for 3D subjects: character/vehicle roles (`skylineArcticRunnerHero`, `neonRainCourierHero`, `neonCrownMothElite`, `auroraExtractionLanderHero`), card "heroes/rivals" in set-dressing (`blockfallReactorMechanicHero`, `blockfallReactorPlasmaRival`), and gameplay platforms (`skylineIceLedgeCompact/Medium/Long`) | 9 | downgrade to `prototype`; replace with rigged/modelled library assets and modelled platform kit | `prototype` |
| E. Far plates (`auroraExtractionBayBackdrop`, `blockfallReactorArenaBackdrop`, `neonRainGardenArenaBackdrop`, `skylineWinterParallaxBackdrop`, `turboAlpineVenueBackdrop`) | 5 | role `backdrop`, `extras.aura3dBackdrop.minDistance`, re-encode KTX2 (the Skyline plate is the one element the judge rated excellent, research 21 line 1756) | `release` as backdrop |
| F. No-family Blender procedural kits with 128² palettes (`pulseReactorEncounterWorld`, `pulseRunnerCraft`, `pulseTerminalSentry`, `turboCircuitEnvironmentV2`) plus Blender-py kits inside class C with 32² palettes (`gravityPostCourierSkiff`, `gravityPostFreightDistrict`) | ~5 (+2 in C) | G2/G3 will fail; keep as `candidate` until replaced or re-textured with library tiling sets | `candidate` |

Class sizes come from research 11 §2.2/§2.4 and 19 C19 (A 43 + B 8 + C 50 + D 9 + E 5 + F ~5 = 120). They must
be regenerated by the migration script (`tools/asset-optimize/migrate-1.1.ts --report`) from the GLB JSON chunks
before any label change is committed; the script's table, not this one, is authoritative.

### 10.2 Steps

1. Ship schema 1.1 reader (accepts 1.0) and the `backdrop`/`proxy` roles.
2. Run `assets optimize --all --dry-run` remotely; publish the before/after budget report as a CI artifact.
3. Run the migration script: compute G1–G11 for every `release` asset; write `admission` records; downgrade
   failing assets (`release` → `candidate`/`prototype`) in one reviewed commit with the report attached. No
   asset keeps `release` without passing.
4. Optimize class A/B/E; capture look-dev; review; re-admit.
5. Switch typegen to per-route modules and derived URLs (`variant: "optimized"`).
6. Hand per-game replacement lists (class C/D/F) to PRD 14.
7. Replace template starter assets (product-viewer, racing-starter, mini-game, fighting-game,
   character-controller, falling-blocks-starter) with library entries; regenerate template typed modules.
8. Delete stubs and the waiver (§7.5); update skills (PRD 13 owns wording; this PRD supplies rules).

---

## 11. Backward compatibility

- `model(assets.x)` keeps its signature. URLs change (new derived hash); typed module consumers are unaffected.
- Manifest 1.0 files are read unchanged; `assets add` on a 1.0 manifest upgrades it to 1.1 in place with no
  field removal. `suitabilityReason`, `renderedProbe`, `provenance` are preserved.
- Release semantics change: third-party projects whose `--release` validation passed via the stylized regex will
  now fail. For one minor version, `--legacy-release-gates` restores 1.0 behaviour with a deprecation warning
  and an `admission.legacy: true` marker; the repo's own CI rejects that flag (grep check in `ci.yml`).
- `ensureAssetDecoders` default change (meshopt on) is additive: uncompressed assets behave identically.
- `KTX2BasisTextureTranscoderOptions.targetFormat` becomes required and the CDN fallback is removed: callers of
  the low-level transcoder must pass a target and transcoder URL (breaking for direct callers). The one in-repo
  caller, `apps/loader-ktx2/src/main.ts:90`, is migrated in Phase 1 to pass `transcoderUrl: "/aura-decoders/basis/"`
  and a target from `selectKTX2TargetFormat`; its route-health test stays green.
- Monolithic `src/aura-assets.ts` generation stays available via `typegen --all` for one minor version.
- Removed stubs (`KTX2LoaderThreeCompat`, `createDefaultPerformanceLodLevels`, preflight settings) are exported
  with `@deprecated` and a runtime warning for one minor, then deleted.

---

## 12. Dependencies on other PRDs

| PRD | Dependency | Direction / blocking |
|---|---|---|
| 01 Rendering Core / Color / HDR / PBR | Correct linear workflow and output transform so look-dev frames are judgeable | Blocks G9 reviews being meaningful for Aura frames (three frames are judged regardless) |
| 02 Lighting / IBL / Reflections / Shadows | Ambient must not zero IBL (`index.ts:12693-12707`); PMREM mip sampling; `environments.hdri` default; skinned/instanced depth shader | Blocks game visual acceptance (§16.2). This PRD supplies the 2k HDRI library to 02 |
| 03 Postprocessing / AA / Tone Mapping | Tone-map operator and exposure wiring for look-dev parity | Soft |
| 04 Materials / Textures / glTF Fidelity | Tint must multiply, not strip maps (`index.ts:13567-13580`); sRGB compressed formats (shared ownership: 05 implements device mapping, 04 reviews); MikkTSpace/derivative TBN fallback | Hard block for any game acceptance |
| 06 Animation / Characters | Library characters need GLB clip playback to work on root (`AnimationController` empty-pose freeze, research 09 §4) | Blocks character kit acceptance in games |
| 07 VFX / Particles | Flipbook sheets admitted as KTX2 texture assets | Consumer |
| 08 Camera / Controls / Game Feel | Gameplay camera definitions per role feed G2; collider sidecars feed contacts | Soft |
| 09 Shared Game Runtime | Route-local asset references for per-route typegen | Soft |
| 10 World Building | Consumes `environments/modular` and `textures/tiling` kits; terrain splat textures | Consumer |
| 11 WebGPU / Performance Tiers | Defines `AuraQualityTier` and tier selection; instancing `node.size` bug (`index.ts:14747`); WebGPU compressed formats | Blocks tier budgets being enforced at runtime |
| 12 Visual Benchmark + Regression | Adds benchmark scenes 19/20 (§16.1), vision-judge harness, evidence lanes | Blocks visual acceptance automation |
| 13 Agent Authoring / Skills / Templates | Skill text and template defaults that teach optimize/admit/look-dev | Consumer |
| 14 18-Game Rebuild | Executes per-game asset replacement lists from §10.1 | Consumer |
| 15 API / Package Consolidation | Package boundaries for `tools/asset-optimize`, per-route typed module exports | Coordination |

---

## 13. Implementation phases

Each phase ends only when its exit criteria are met on the remote lanes named in §15. "Tests pass" alone never
satisfies a phase whose criterion is visual.

**Phase 0 — Gate honesty (no new tooling).**
Delete the regex waiver and flat-colour evidence waiver; schema 1.1 types; `backdrop`/`proxy` roles; offline
G1, G3, G4, G5, G8, G11 checks computed from GLB JSON; migration report; downgrade commit.
Exit: `tools/asset-optimize/migrate-1.1.ts --report` artifact committed under
`docs/project/aura3d-quality-rebuild/evidence/assets/migration-1.1.json`; 0 assets in root and template manifests
hold `release` while failing G1/G3/G4/G5; unit tests for each gate with the shipped failing examples
(`rooftopBackboard`, `skylineArcticRunnerHero`, `mechChassisA`, `vaultBreakersTable`) as fixtures.

**Phase 1 — Decode path the games use.**
`AssetDecoderRegistry`; meshopt/draco/KTX2 decoders injected in `createTypedGLBActor`; vendored basis
transcoder, CDN removed; target selection; sRGB compressed formats (WebGL2 + WebGPU); single transcode; tier
texture cap.
Exit: browser test on macos-14 loads Khronos DamagedHelmet in three encodings (source PNG, meshopt+KTX2 UASTC,
draco+KTX2 ETC1S) through `model(assets.x)`; mean ΔE2000 between encodings ≤ 2.0 inside the object mask; zero
requests to origins other than the test server (network log); compressed internal format reported by the
device equals the expected sRGB format.

**Phase 2 — Optimize stage.**
`tools/asset-optimize` steps 1–12, profiles, `assets optimize` verb, `asset-optimize.yml` workflow; dry-run over
all 226 models.
Exit: budget report artifact for all 120 game-referenced models (before/after bytes, tris, GPU bytes per tier);
deterministic-output test (same input + profile ⇒ byte-identical GLB twice); benchmark assets optimized and
§16.1 criteria (a)–(c) pass for scenes 02, 03, 08, 09, 15, 18.

**Phase 3 — LOD and colliders.**
`MSFT_lod` writer, runtime selection with hysteresis, dither cross-fade, shadow LOD+1; collision sidecars and
`collider: "auto"`.
Exit: benchmark scene 19 (§16.1, Phase-3 variant using the optimized existing `courierTrafficSedan`, since the
library does not exist until Phase 5) passes; Rapier contact test: the optimized benchmark `crate` (convex hull)
dropped on the optimized `racing-starter` template track (trimesh from LOD0) rests within 1 cm of the visual
surface in a deterministic 120-step simulation. Scene 19 is re-run with the library hero vehicle in Phase 5.

**Phase 4 — Look-dev viewer and visual gates.**
`apps/asset-lookdev`, `asset-lookdev.yml`, `assets lookdev|review|admit`; G2, G6, G7, G9, G10 enforced.
Exit: contact sheets for 10 assets (3 good: DamagedHelmet, AntiqueCamera, Soldier; 7 shipped: `mechHeroDecimated`,
`patrolAircraftMeshy`, `courierTrafficSedan`, `showcaseHeadphones`, `bankShotTable`, `skylineArcticRunnerHero`,
`siegeGolfBall`); the 3 good assets pass G9 and the 4 known-bad ones (`bankShotTable`, `skylineArcticRunnerHero`,
`siegeGolfBall`, raw `mechHeroDecimated`) fail it — a broken-control requirement: if a known-bad asset passes,
the gate is defective. The other 3 (`patrolAircraftMeshy`, `courierTrafficSedan`, `showcaseHeadphones`) are
unlabelled probes: their scores are recorded and a named human states agree/disagree per asset; > 1 disagreement
blocks the phase until the rubric prompt is revised.

**Phase 5 — Library, HDRIs, generated-asset promotion.**
Kits of §6.6 admitted; Poly Haven HDRI/texture adapters; ranking rewrite; §6.5 Meshy pre-stage.
Exit: every kit in §6.6 has ≥ the listed minimum admitted at `release` with look-dev approval; 6 HDRIs at 2k
admitted as `environment` assets; each of the 8 Meshy assets is promoted or rejected with recorded G-failures;
scene 19 re-run with the `vehicles/road` hero car passes the same thresholds.

**Phase 6 — Packaging, templates, measurement.**
Per-route typegen and deploy subset; prune orphans; template starter replacement; tier measurement on named
devices (§17).
Exit: every showcase route's main JS no longer contains `suitabilityReason`/`licenseRaw` strings; the 120 ids (or
their replacements) total ≤ 80 MB; template `product-viewer` and `racing-starter` starters pass G1–G11; measured
tier table committed with device names.

**Phase 7 — Pilot game acceptance (executed with PRD 14, after PRD 02 and 04 fixes land).**
Six pilot games re-captured with optimized/library assets.
Exit: §16.2 thresholds met and reviewed by a named human.

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
- [ ] New `tools/asset-optimize/migrate-1.1.ts --report|--apply`: computes gates for every entry in root and template manifests, writes `docs/project/aura3d-quality-rebuild/evidence/assets/migration-1.1.json`, and with `--apply` downgrades failing `release` assets to `candidate` (or `prototype` + role `proxy` for G5 failures).
- [ ] Apply migration in one commit; attach report; update `apps/showcase-*/scripts/register-models.mjs` and `register-assets.mjs` so re-running them cannot re-register scripted geometry as `release` (they pass `--quality prototype --role proxy`).
- [ ] `packages/aura3d-cli/src/cli.ts`: `assets add --quality release` now errors with "use `assets admit`"; `--legacy-release-gates` flag accepted with deprecation warning; `ci.yml` step greps the repo for `--legacy-release-gates` and fails if found.

### Phase 1
- [ ] New `packages/assets/src/AssetDecoderRegistry.ts`: `createAssetDecoderRegistry` (§7.4) with lazy dynamic imports; one in-flight promise per decoder; `diagnostics` array; `dispose` terminates workers.
- [ ] Meshopt: dynamic `import("meshoptimizer")` → `MeshoptDecoder.ready` → wrap with existing `createMeshoptDecoder` (`GLTFCompressionDecoders.ts:63`).
- [ ] Draco: copy `node_modules/draco3d/draco_decoder.wasm` + JS glue to `packages/assets/vendor/draco/` at build; wrap with `createDracoDecoder` (`GLTFCompressionDecoders.ts:85`); loaded only on `require(["draco"])`.
- [ ] Basis: vendor `basis_transcoder.{js,wasm}` from `node_modules/three/examples/jsm/libs/basis/` into `packages/assets/vendor/basis/` with `README.md` (upstream, version, sha256, licence); Vite/tsup copy to `/aura-decoders/basis/` in app builds and `create-aura3d` templates.
- [ ] `packages/assets/src/KTX2BasisTextureTranscoder.ts`: remove `DEFAULT_BROWSER_CDN` (:22) and loaders.gl dynamic import; use the vendored transcoder in a worker (`KTX2TranscodeWorker.ts`); `targetFormat` required; return `colorSpace` from options; transcode RGBA8 fallback only on demand; honour `maxDimension` by skipping levels.
- [ ] `selectKTX2TargetFormat(caps, source, hasAlpha, colorSpace)`: UASTC → astc-4x4 > bc7 > etc2-rgba8 > rgba8; ETC1S → etc2-rgb8 (opaque) / etc2-rgba8 (alpha) > bc1 (opaque) / bc3 (alpha) > rgba8; sRGB slot on s3tc-without-s3tcSrgb never picks bc1/bc3; unit test is an exhaustive truth table over all 128 combinations (2⁵ capability sets × 2 sources × 2 alpha × 2 colour spaces) with expected outputs checked into `tests/unit/assets/ktx2-target-format.table.json`.
- [ ] `packages/rendering/src/Texture.ts:1`: extend `TextureCompressedFormat` with `"bc7-rgba-unorm" | "etc2-rgb8unorm"`; update every exhaustive `switch` over it (TypeScript `never` check must pass in `pnpm typecheck`).
- [ ] `packages/rendering/src/WebGL2Device.ts` (:4117-4133 `resolveCompressedTextureFormat`): take `texture.colorSpace` and return sRGB internal formats (`COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`, `COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT`, `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`, `COMPRESSED_SRGB8_ETC2`, `COMPRESSED_SRGB_S3TC_DXT1_EXT`, `COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT`) when `colorSpace === "srgb"`; add `bc7-rgba-unorm` (`EXT_texture_compression_bptc`) and `etc2-rgb8unorm`; replace the unconditional `0x9278` with a `WEBGL_compressed_texture_etc` query (return `null` when absent so the existing fallback path runs); query `WEBGL_compressed_texture_s3tc_srgb` for sRGB BC1/BC3. Unit test with a mocked `gl` asserts the internal-format enum for each (format, colorSpace) pair.
- [ ] `packages/rendering/src/WebGPUDevice.ts`: add a compressed texture upload path (none exists today): map each `TextureCompressedFormat` × colour space to `astc-4x4-unorm(-srgb)`, `bc7-rgba-unorm(-srgb)`, `etc2-rgba8unorm(-srgb)`, `etc2-rgb8unorm(-srgb)`, `bc1-rgba-unorm(-srgb)`, `bc3-rgba-unorm(-srgb)`; request `texture-compression-astc|bc|etc2` features at device creation when the adapter offers them; upload each mip with `writeTexture` using block-aligned `bytesPerRow`; fall back to the RGBA8 levels when the feature is absent.
- [ ] `apps/loader-ktx2/src/main.ts:90`: pass `transcoderUrl` and a target from `selectKTX2TargetFormat` (device caps); route-health test unchanged.
- [ ] `packages/assets/src/GLTFRenderResources.ts` `decodeImageInBrowser` (:2222-2237): route `image/ktx2` to the registry image decoder with the slot colour space; for PNG/JPEG larger than `maxTextureSize` pass `resizeWidth/resizeHeight/resizeQuality: "high"` to `createImageBitmap`.
- [ ] `packages/engine/src/production-runtime/TypedGLBActor.ts:183-191`: accept `decoders`, `maxTextureSize`; pass `meshoptDecoder`, `dracoDecoder`, `imageDecoder` to `loadProductionGLTFRenderPipeline`.
- [ ] `packages/engine/src/agent-api/index.ts`: `createAuraApp` creates one registry from `options.assets.decoders` and device capabilities; model-node actor creation (near :13540-13600) awaits `registry.require(asset.requiredDecoders ?? extensionsFromHead)` before actor creation; on failure throws `AssetDecoderUnavailable` with decoder id and URL (no silent fallback to the safe-basic renderer).
- [ ] `packages/assets/src/KTX2BasisTextureTranscoder.ts` `ensureCompressedTextureSupport` (:277-293) and its wrapper `packages/engine/src/agent-api/AssetDecoders.ts`: defaults meshopt on, draco lazy, ktx2 on; probes come from the registry (no `async () => false` defaults); `chosenKtx2Target` comes from `selectKTX2TargetFormat` instead of the `"etc2-rgba8unorm"` default; update both doc comments.
- [ ] Browser test `tests/browser/assets-compressed-typed-glb.spec.ts` (macos-14): DamagedHelmet ×3 encodings through `model()`; assert ΔE2000 ≤ 2.0 masked; assert `performance.getEntriesByType("resource")` origins ⊆ test origin; assert device-reported internal format.

### Phase 2
- [ ] Add pinned exact devDependencies: `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions` (same exact 4.x version), `mikktspace` (exact), `sharp` (exact); change `draco3d` from `^1.5.7` to `1.5.7`; record KTX-Software `ktx` CLI version in `tools/asset-optimize/tool-versions.json`; workflow installs that exact release and verifies its sha256.
- [ ] `tools/asset-optimize/extensions/msft-lod.ts`: custom gltf-transform `Extension` for `MSFT_lod` (read/write node `extensions.MSFT_lod.ids` and `extras.MSFT_screencoverage`); round-trip unit test on a 3-level synthetic node.
- [ ] `tools/asset-optimize/profiles.ts`: encode §6.2 table as `Record<AssetOptimizeProfileId, AssetOptimizeProfile>`; `profileForRole(role, bounds)`; unit test that every profile has floor ≤ target ≤ ceiling and normal = UASTC.
- [ ] `tools/asset-optimize/steps/{weld,dedup,join,palette,resize,tangents,quantize,compress,ktx2}.ts`: one function per step `(doc: Document, profile, log) => Promise<void>`, each appending an `OptimizeStepRecord`.
- [ ] `steps/resize.ts`: power-of-two Lanczos3 (sharp) to profile max; renormalize normal maps after resize; emit `texture-waste` check when tex > max for mesh below floor.
- [ ] `steps/tangents.ts`: MikkTSpace for primitives with `normalTexture` and no TANGENT; skip and record G8 failure when TEXCOORD_0 missing.
- [ ] `steps/ktx2.ts`: write PNG per texture, call `ktx create` with `--format R8G8B8A8_SRGB` (colour slots) or `R8G8B8A8_UNORM` (normal/ORM/clearcoat/transmission), `--generate-mipmap`, and profile flags (UASTC: `--encode uastc --uastc-quality 2 --uastc-rdo --uastc-rdo-l 1.0 --zstd 18`; ETC1S: `--encode basis-lz --clevel 2 --qlevel 192`); replace image with `KHR_texture_basisu`; a workflow step validates every flag against `ktx create --help` of the pinned release (§6.2).
- [ ] `steps/compress.ts`: meshopt via `meshopt({ encoder: MeshoptEncoder, level: "medium" })` default; Draco via `draco({ ... })` with `draco3d` encoder only with `--geometry draco` and only for non-skinned meshes.
- [ ] `tools/asset-optimize/measure.ts`: `AssetBudgetMeasurement` incl. `gpuBytesByTier` (format arithmetic with tier caps) and `drawCallsEstimate` (primitives × materials after join).
- [ ] `tools/asset-optimize/index.ts`: pipeline runner writing `public/aura-assets/<id>.<derivedHash8>.glb` (+ `.mobile.glb`), updating `derived` in the manifest; refuses KTX2/bake steps outside CI unless `--allow-local-small` and source < 5 MB.
- [ ] `packages/aura3d-cli/src/cli.ts`: `assets optimize` dispatch to `optimizeAssets`; help text in `cli-help.ts`.
- [ ] `.github/workflows/asset-optimize.yml`: `workflow_dispatch` + PR path filter (`aura.assets.json`, `tools/asset-optimize/**`); ubuntu-latest for CPU steps (KTX encode, simplify), LFS checkout, artifact upload of derived files + report; matrix by asset batch.
- [ ] Determinism test `tests/unit/asset-optimize/determinism.test.ts`: optimize `fixtures/asset-corpus/damaged-helmet.glb` twice with profile `product` ⇒ identical sha256.
- [ ] Dry-run all 226 models; commit `evidence/assets/optimize-dry-run.json` (before/after per id, aggregate for the 120 game ids).
- [ ] Optimize benchmark assets (`damagedHelmet`, `antiqueCamera`, `soldier`, `cesiumMan`, `fox`, `rockA`, `rockB`, `crate`) and add `optimized` variants to `benchmarks/quality-rebuild/shared/assets.ts` with sha256.

### Phase 3
- [ ] `tools/asset-optimize/steps/lod.ts`: `MeshoptSimplifier.simplifyWithAttributes` per primitive per ratio with `targetError` per level, flag `LockBorder` for multi-primitive nodes, attribute weights normal 0.5 / UV0 1.0; record `lod-target-missed` when achieved index count > 1.2 × target; skinned: max 2 levels (JOINTS/WEIGHTS preserved because vertices are reused); write `MSFT_lod` + `extras.MSFT_screencoverage` through the custom extension.
- [ ] `packages/assets/src/GLTFLoader.ts`: parse `MSFT_lod` into `GLTFNode.lods: { nodeIndex, screenCoverage }[]`; `GLTFExtensionSupport.ts`: register `MSFT_lod` "runtime-supported".
- [ ] `packages/engine/src/production-runtime/TypedGLBActor.ts`: `setLodLevel`, `lodLevels`; `collectRenderItems` emits only the active level (and the outgoing level during fade with `u_lodFade`).
- [ ] Production runtime LOD selector (new `packages/engine/src/production-runtime/LodSelector.ts`): per-frame coverage, hysteresis 10 %, bias, one step per frame; shadow casters use `min(level+1, max)`; unit test with synthetic camera distances.
- [ ] Shader: add `A3D_LOD_DITHER` block (§8 item 3) to opaque PBR, skinned-lit, unlit, depth variants in `ShaderLibraryCore.ts`/`ShaderLibrary.ts` and the WGSL equivalents; `u_lodFade` uniform plumbed per render item.
- [ ] `tools/asset-optimize/steps/colliders.ts`: convex hull per node from the profile's LOD (≤ 64 verts via simplify), trimesh for world/track, box/capsule from bounds; write `<id>.<hash8>.collision.glb`.
- [ ] `packages/engine/src/agent-api/index.ts` + `packages/physics-rapier/src/index.ts`: `model(asset, { physics, collider: "auto" })` loads `colliderUrl` and builds `ColliderDesc.convexHull`/`trimesh` (:555-557); default when `physics` is set and `colliderUrl` exists.
- [ ] Physics test `tests/unit/physics/generated-collider-contact.test.ts`: optimized benchmark `crate` convex hull resting on the optimized `racing-starter` track trimesh within 1 cm after 120 fixed steps (Rapier, fixed `dt = 1/60`, seed fixed).
- [ ] Remove `createDefaultPerformanceLodLevels` usage; deprecate export in `packages/rendering/src/performance/LOD.ts`.

### Phase 4
- [ ] `apps/asset-lookdev/`: Vite app with `?asset=<id>&stage=<v>&view=<n>&engine=aura|three`; `aura-adapter.ts` uses only public `createAuraApp` + `environments.hdri` + `model()`; `three-adapter.ts` uses `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader` + `PMREMGenerator` with the same HDRI, ACES, exposure.
- [ ] `apps/asset-lookdev/lookdev.stage.json` v1 (§6.7) checked in; any change bumps version and invalidates `lookDev` records.
- [ ] Debug view shader define `A3D_DEBUG_VIEW` (§8 item 4) compiled only when the look-dev app sets `renderer.debugView`; `u_baseColorTextureSize` uniform added in `GLTFRenderResources`.
- [ ] `apps/asset-lookdev/capture.mjs`: Playwright capture of 3 HDRIs × 8 yaws + top + gameplay (1920×1080 DPR 1, 390×844 DPR 3) + debug views; composes `contact.jpg`, `debug.jpg`, `gameplay.jpg`; writes `metrics.json` with three-vs-Aura masked SSIM per view and renderer draw calls.
- [ ] `.github/workflows/asset-lookdev.yml`: macos-14, Chromium `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (same args as `quality-rebuild-capture.yml`), fails if the probe renderer string contains "SwiftShader"; matrix batches of 10 assets; uploads artifacts.
- [ ] `packages/aura3d-cli/src/lookdev/`: `assets lookdev` dispatches the workflow via `gh workflow run` and prints the run URL; `assets review` appends a review to `lookDev.reviews` bound to `derived.hash`.
- [ ] Vision-model review script `tools/asset-optimize/review-vision.ts`: sends `contact.jpg` + `gameplay.jpg` + rubric prompt through Kiro Prism (per policy §4; read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` first) and records `judge: "vision-model"` with model id; two independent runs, mean recorded, disagreement > 1.5 flags human review.
- [ ] `packages/aura3d-cli/src/admission/gates.ts`: implement G2 (texel density from UV/world area with role camera defaults and route overrides), G6 (texture sanity on 256² decoded proxies), G7 (budget §17.2), G9 (record exists for current hash with three-adapter score ≥ 6.5 and no axis < 4; hero roles require a human review; Aura-minus-three gap > 1.5 emits a renderer-issue record, not a failure), G10 (art-direction file exists; route coherence sheet ≥ 6).
- [ ] `assets admit` verb; `assets validate --release --route apps/<app>` runs G1–G11 for every asset the route's default path references (AST scan) and fails the route if any rendered asset is below `release` or is `proxy`.
- [ ] Broken-control test in CI: look-dev + vision review of `skylineArcticRunnerHero` and `siegeGolfBall` must score < 6.5; if they pass, the review pipeline job fails.

### Phase 5
- [ ] `packages/asset-index/src/adapters/poly-haven.ts`: add HDRI adapter (`/assets?t=hdris`, direct `.hdr` 1k/2k/4k URLs from `/files/<id>`) and texture adapter (per-map files); records `access: "direct-download"`, CC0 verified.
- [ ] New `packages/asset-index/src/adapters/ambientcg.ts` (textures, CC0) with direct download of 1k/2k PNG/JPG sets.
- [ ] `packages/aura3d-cli/src/pull-bridge/scoring.ts` + `packages/asset-index/src/ranking.ts`: licence/provenance become filters; new score terms (G1 fit, G3 pre-check, G2 estimate, look-dev approval, library membership, art-direction match); remove "missing texture −6" in favour of exclusion for texture-required roles; update ranking tests.
- [ ] `assets/library/` + `aura.library.json`; `assets library add|list|sync`; library entries resolved first by `assets search/resolve`.
- [ ] Admit kits of §6.6 (each item: source, licence, optimize profile, look-dev, review); `assets/art-direction/<kit>.json` per kit.
- [ ] Admit 6 HDRIs at 2k (+4k for `studio-soft` and `outdoor-midday`) as `type: "environment"` entries with `sunDirection`, `luminanceP99`, `whiteBalanceK` metadata; replace the three 1k fixture HDRIs in the look-dev stage and hand them to PRD 02.
- [ ] `packages/aura3d-cli/src/meshy/import.ts:42`: replace throw with: `release` requires `derived` from `--from-generated` optimize and G1–G11 pass; message lists missing gates.
- [ ] `tools/asset-optimize/steps/remesh.ts` + `bake.ts`: Blender LTS headless scripts (`tools/asset-optimize/blender/remesh_quadriflow.py`, `bake_highpoly.py`) run only on the remote worker; Meshy remesh API path documented in `packages/aura3d-cli/skills/meshy-cli/SKILL.md`; sliver-ratio pre-check rejects collapse-decimated input.
- [ ] Promote or reject each of the 8 Meshy assets; record outcomes in `evidence/assets/meshy-promotion.json`.
- [ ] `packages/aura3d-cli/skills/meshy-cli/SKILL.md:56-66`: replace the 100k–500k / 4096–8192 profile ceilings with §6.2 profile targets (supply text to PRD 13), then `pnpm skills:sync` and `pnpm check:skills`.

### Phase 6
- [ ] `packages/aura3d-cli/src/asset-manifest.ts` `writeTypedAssets`: `--route` mode emits `src/aura-assets.route.ts` with only referenced ids and fields `type, format, url, hash, bounds, sizeBytes, requiredDecoders, lods, colliderUrl, budget`; credits written to `dist/credits.json`.
- [ ] Switch every `apps/showcase-*/src/main.ts` import from `src/aura-assets.ts` to its route module (mechanical change, coordinate with PRD 09/15).
- [ ] `check-deploy`: copy only referenced derived files into `dist/aura-assets`; fail when the dist contains unreferenced files.
- [ ] `assets prune --dry-run|--apply`: remove `public/aura-assets` files not referenced by any manifest `outputPath`/`derived.outputPath` (529 files / 490 MB today); LFS pointers updated.
- [ ] Bundle test `tests/unit/build/route-bundle-no-asset-metadata.test.ts`: built Courier Rush JS contains 0 occurrences of `suitabilityReason` and `licenseRaw`.
- [ ] Replace starters in `packages/create-aura3d/templates/{product-viewer,racing-starter,mini-game,fighting-game,character-controller,falling-blocks-starter}/aura.assets.json` with library entries; templates' generated typed modules regenerated; template tests updated.
- [ ] Tier measurement harness `tools/asset-optimize/measure-tiers.mjs` (remote): loads the 6 pilot games per tier, records texture VRAM estimate (from uploaded formats), visible triangles, draw calls, ready bytes, long tasks during load; commit `evidence/assets/tier-measurements.json` with device/GPU strings.

### Phase 7
- [ ] With PRD 14: swap assets in Skyline Runner, Mech Hangar, Courier Rush, Vault Breakers, Gravity Post, Bank Shot; capture via `tools/quality-rebuild-capture` (default URLs, no `?capture=review`); run vision judgment with the research-21 prompt; record human review.

---

## 15. Test requirements

Where tests run (policy: browser/GPU work is remote):
- Unit tests (vitest): `test.yml` on GitHub Actions; may also run locally because they are light (pure functions
  over GLB JSON and small fixtures).
- Optimize pipeline tests that encode KTX2 or simplify > 100k triangles: `asset-optimize.yml` (ubuntu-latest).
- Browser tests and all screenshots: GitHub Actions **macos-14** (ANGLE Metal), same launch args as run
  37289688772; WebKit and Firefox Playwright projects on macos-14 for decode correctness. Never SwiftShader for
  visual criteria; Windows/Linux GPU-less runners only for non-visual decode tests.

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

Browser (macos-14):
- `assets-compressed-typed-glb.spec.ts` (Phase 1 exit).
- `assets-lod-transition.spec.ts`: dolly camera over 120 frames; render-item count switches at the expected
  coverage; no frame with zero items for an LOD-ed actor; dither enabled on Medium+.
- `assets-tier-texture-cap.spec.ts`: with `maxTextureSize: 1024`, a 2048 KTX2 texture uploads level 1 as level 0
  (reported dimensions 1024).
- `assets-decoder-failure.spec.ts`: blocked `/aura-decoders/basis/` URL produces `AssetDecoderUnavailable`, not
  a silent untextured render.
- Look-dev capture smoke: 1 asset end to end produces all artifacts and a renderer string without "SwiftShader".

---

## 16. Visual acceptance tests

All judgments use captured images from the remote macos-14 lane. Each criterion needs a vision-model judgment
(two independent runs, mean) and, where stated, a named human reviewer. Engineering counters (draw calls equal,
non-blank pixels, SSIM alone) never satisfy a visual criterion; SSIM thresholds below are necessary, not sufficient.

### 16.1 `benchmarks/quality-rebuild` scenes

| Scene | Variant | Reference | Criterion | Threshold | Review |
|---|---|---|---|---|---|
| 03-damaged-helmet | optimized (meshopt + KTX2 UASTC) vs source | three r185 rendering the **same** optimized file, and three rendering the source | (a) three(opt) vs three(src) masked SSIM; (b) Aura(opt) vs Aura(src) masked SSIM; (c) vision "visible degradation?" | (a),(b) ≥ 0.97; (c) score drop ≤ 0.25 vs source (today Aura 6.5, three 7.0) | vision ×2 |
| 02-pbr-product | optimized antique camera | same as above | (a)–(c) | same; plus texture detail on leather "equivalent" (research 23 row 10 today) | vision ×2 |
| 08-skinned-character | optimized soldier (meshopt, float positions, KTX2) | three(opt) | skinning intact: silhouette IoU vs source ≥ 0.98 at `CAPTURE_TIME`; (c) | IoU ≥ 0.98; drop ≤ 0.25 | vision ×2 |
| 15-animation-skinning | optimized soldier + fox | three(opt) | same as 08 for both characters | same | vision ×2 |
| 09-outdoor-environment | optimized rocks + crates (ETC1S base, UASTC normal) | three(opt) | (a)–(c); no block artefacts visible on rock albedo at 1280×720 | (a),(b) ≥ 0.95 (ETC1S is lossier than UASTC; 0.97 would reject correct output); (c) as 03; "no visible artefacts" yes in both runs | vision ×2 |
| 18-game-scene | optimized crates/rocks/soldier | three(opt) | (a)–(c) | as 03 | vision ×2 |
| **19-asset-lod-transition** (new, PRD 12 adds harness) | hero vehicle ×3 at 5/25/80 m, 120-frame dolly: optimized `courierTrafficSedan` in Phase 3, library `vehicles/road` hero car in Phase 5 | three r185 with the same `MSFT_lod` levels via a loader plugin | (d) visible pops in the frame strip; (e) far-copy triangle reduction; (f) per-frame render-item log shows the LOD switch happened (guards against a pass where LOD never engages) | (d) ≤ 1 pop judged visible across the strip; (e) ≥ 60 % at 80 m; (f) ≥ 2 level changes logged per copy at 25/80 m | vision ×2 + human |
| **20-lookdev-hero** (new) | library `hero-character` under `studio-soft-2k` | three r185 same file | Aura vision score; gap to three | Aura ≥ 6.5 and gap ≤ 1.0 (depends on PRDs 01–04) | vision ×2 + human |

### 16.2 Games (`tools/quality-rebuild-capture`, default URLs, 1920×1080 + 390×844)

Reference: the research-21 baseline frames (`evidence/games/<id>-contact.jpg`, `<id>-mid.jpg`) as the "before",
and the per-genre reference stills owned by PRD 12 as the target. Judged with the research-21 prompt and scoring
scale so scores are comparable.

| Game | Today `modeling_assets` (21) | Asset change | Criterion | Threshold |
|---|---:|---|---|---|
| showcase-skyline-runner | 4 (backdrop masks a 2–3 3D layer) | 4-tri card hero → rigged library character; ice-ledge cards → modelled platform kit; ghost Meshy runner removed or promoted | `modeling_assets`; "character likely a sprite" no longer cited | ≥ 6.5; human confirms player is a 3D rigged model in motion strip |
| showcase-mech-hangar | 3.5 (mech ~6 buried in cubes ~1.5) | box part assemblies → library modular mech parts (textured, UV'd); Meshy hero promoted (remesh/bake) or replaced | `modeling_assets`; no "placeholder cube" comments | ≥ 6.5 |
| showcase-courier-rush | 4 | traffic cars/van optimized and **not** tinted flat (needs PRD 04); city kit replaces primitive buildings | `modeling_assets`; style coherence | ≥ 6.5; no "asset inconsistency" finding |
| showcase-vault-breakers | 2 | primitive playfield → pinball kit (bumpers, rails, flippers, playfield art) | `modeling_assets` | ≥ 6.0 |
| showcase-gravity-post | 3 (three asset languages clash) | planets re-encoded, skiff/freight replaced, station ring LOD/optimized | `modeling_assets`; ready download | ≥ 6.0; ready download ≤ 15 MB (today 46.8 MB, 20 line 2015) |
| showcase-bank-shot | 3 (no cue judged visible) | table/cue/numbered balls from sports kit with felt/wood PBR | `modeling_assets`; cue visible in action frame | ≥ 6.5; cue present in 04-action (human) |
| all 18 | — | optimize only (no replacement) | no visual category in research-21 format regresses by > 0.5; ready download within tier budget §17 | per-game table committed |

Human review: a named reviewer signs `evidence/assets/pilot-review.json` per pilot game (pass/fail + notes).
A pilot passes only with vision ≥ threshold **and** human pass.

### 16.3 Per-game asset impact (all 18 games)

Inputs: research 11 §2.3 (models, MB, untextured, 4-tri cards), research 21 `modeling_assets`. The migration
report (`migration-1.1.json`) regenerates the class columns and is authoritative; this table is the expected
shape. "Post-optimize only" is the minimum outcome before PRD 14 swaps assets; "with library" is the PRD 14
target. Every game row is checked by the "all 18" criterion in §16.2 (no category regresses > 0.5, ready
download within tier budget).

| Game | Today: models / MB / untextured / cards; `modeling_assets` | Expected downgrades (§10.1 classes) | Post-optimize only | With library (PRD 14) | Ready download target (Medium) |
|---|---|---|---|---|---|
| aura-clash-showcase | not in research 11 table (compat RenderSource path); 4 | to be measured by migration script | fighter GLBs optimized, tangents added | `characters/humanoid-pbr` | ≤ 15 MB |
| showcase-blockfall-reactor | 4 / 8.2 / 0 / 3; 3 | 2 card "hero/rival" → D; arena backdrop → E | backdrop re-encoded KTX2 | robot/mech kit replaces cards | ≤ 15 MB |
| showcase-skyline-runner | 11 / 40.3 / 3 / 5; 4 | hero card + 3 ice ledges → D; parallax plate → E; Meshy runner → B | 40.3 MB → ≤ 15 MB | humanoid kit + platform kit (pilot, §16.2) | ≤ 15 MB |
| showcase-turbo-drift-circuit | 7 / 14.1 / 3 / 1; 3.5 | alpine venue card → E; circuit environment v2 → F | track/venue optimized | `vehicles/road` + track kit | ≤ 15 MB |
| showcase-siege-golf | 5 / 8.2 / 2 / 0; 3 | `siegeGolfBall` (G1 ceiling), `siegePlankSet` (G1 floor) → A replace | ball LOD/re-sourced | `props/sports-tabletop` golf set | ≤ 15 MB |
| showcase-aurora-lander | 4 / 3.4 / 2 / 2; 4 | lander hero card → D; bay plate → E; probe/beacon → C | bay plate KTX2 | `vehicles/air-space-sea` lander | ≤ 15 MB |
| showcase-neon-swarm | 7 / 23.8 / 2 / 3; 3 | 3 cards: `neonRainCourierHero`, `neonCrownMothElite` → D, `neonRainGardenArenaBackdrop` → E; street lamp (272k tris) → A replace | lamp replaced, 23.8 MB → ≤ 12 MB | robot enemies + industrial-urban props | ≤ 15 MB |
| showcase-gravity-post | 14 / 126.2 / 1 / 0; 3 | skiff/freight district → F/C; station ring 458k tris → A optimize | planets 4096 → 2048 KTX2, ring joined + LOD | air-space-sea + planets-space (pilot) | ≤ 15 MB (§16.2) |
| showcase-courier-rush | 7 / 31.5 / 0 / 0; 4 | parcel/bollard texture-waste flags; van → B | 31.5 MB → ≤ 12 MB; tint fix needs PRD 04 | road vehicles + city kit (pilot) | ≤ 15 MB |
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
nothing visually from this PRD until PRD 14 swaps assets; their §16.2 "all 18" row must still show no
regression after the Phase 0 downgrade (labels change, pixels must not).

---

## 17. Performance budgets

These are targets. They become binding only after Phase 6 measures them on named devices; until then they
are design limits for gates G7 and the tier texture cap. Tier selection and full-frame budgets are owned by
PRD 11; the rows below are the asset-attributable share.

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
| hdri (2k RGBE; 1k on Low) | 7 MB (1.7 MB) | PRD 02 (PMREM output) |

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
| Chromium, Windows (D3D11) | new `windows-latest` job added to `browser-matrix.yml` (today that workflow runs only on `ubuntu-latest`; hosted runners have no GPU) | Non-visual: decoder load, format selection with BC formats via capability mock; visual criteria not judged here |
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

All under `docs/project/aura3d-quality-rebuild/evidence/assets/` (large binaries as CI artifacts with links):
- `migration-1.1.json` — gate results for every manifest entry and every downgrade.
- `optimize-dry-run.json` and `optimize-report.json` — per-id before/after measurements; aggregate for the 120 ids.
- `lookdev/<id>/<derivedHash8>/{contact.jpg, debug.jpg, gameplay.jpg, metrics.json, review.json}` for every
  `release` asset, plus the broken-control assets.
- Benchmark side-by-side JPGs for scenes 02, 03, 08, 09, 15, 18 (optimized variant) and new 19, 20, in the
  existing `evidence/benchmark/<scene>-side-by-side.jpg` format, with `report.json` including the
  optimized-vs-source SSIM and vision scores.
- Pilot game before/after contact sheets (`<id>-contact.before.jpg`, `<id>-contact.after.jpg`) from default
  routes, the vision judgment markdown, and `pilot-review.json` signed by a named human.
- `tier-measurements.json` with device/GPU strings and the §17 metrics.
- `meshy-promotion.json` — per Meshy asset: remesh/bake settings, gates, decision.
Evidence captured under `?capture=review` or any non-default route mode does not count.

---

## 21. Completion criteria

1. The regex waiver and flat-colour waiver are deleted; no manifest in the repo has a `release` asset failing
   G1–G11 (CI-enforced).
2. `aura3d assets optimize`, `lookdev`, `review`, `admit`, `budget`, `prune`, per-route `typegen` exist, are
   documented in `cli-help.ts`, and run on the remote lanes.
3. `model(assets.x)` loads meshopt + KTX2 (+ Draco on demand) assets with correct sRGB on Chromium, WebKit and
   Firefox with no third-party network requests.
4. LOD chains and collider sidecars are generated and consumed; scene 19 passes.
5. The library kits and 6 HDRIs of §6.6 are admitted at `release` with look-dev approvals; all 8 Meshy assets
   have a promotion decision.
6. Benchmark scenes 02/03/08/09/15/18 optimized variants pass §16.1; scene 20 passes once PRDs 01–04 land.
7. The 120 game-referenced ids (or replacements) total ≤ 80 MB derived; every showcase route's JS is free of
   asset metadata strings; `dist` contains only referenced assets.
8. The 6 pilot games pass §16.2 (vision + named human), executed with PRD 14; the §16.3 per-game table is
   regenerated from the migration report and committed for all 18 games, and the "all 18" no-regression row passes.
9. Tier budgets measured on named devices and committed; any budget exceeded has a filed issue against the
   owning PRD.

Not completion: tests green, all routes 200, non-blank probes, parity matrices green, or a "release" label count.

---

## 22. Rollback considerations

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
- Library swaps in games are per-route commits owned by PRD 14 and revert independently.

---

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| PRD 04 (tint strips maps) or PRD 02 (ambient zeroes IBL) slips | Optimized PBR assets still render flat; pilot games cannot pass | §16.2 sequenced after both; look-dev uses three as file reference so asset work proceeds in parallel |
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
| Over-attributing performance to assets | Wrong priorities | Deep Recovery runs 0.5 fps with 0.4 MB of geometry (report.slim.json; research 11 §2.4): frame cost there is not asset-driven; PRD 11 owns frame performance |
| Gate tuning too strict for stylized games | Valid stylized art blocked | `stylized-flat` art-direction path with UVs + look-dev review (G10) instead of text waivers |

---

## 24. Explicitly out of scope

- BRDF, IBL, shadow, tone-mapping and post fixes (PRDs 01–03) and material/tint semantics (PRD 04), except the
  sRGB compressed-format mapping implemented here.
- Per-game scene rebuilds, layout and art direction beyond asset swaps (PRD 14).
- Animation playback, retargeting and clip authoring (PRD 06); this PRD only requires library characters to ship
  with clips.
- Runtime texture streaming, virtual texturing, cluster/meshlet LOD (`meshopt_clusterizer`), GPU-driven culling
  (PRD 11).
- Lightmap/AO baking for worlds and terrain splat authoring (PRD 10); this PRD bakes per-asset AO only.
- Native FBX/USD/USDZ/DAE import (remains "convert-required", `AssetImportPreflight.ts:142-144`).
- Audio assets (17 of 18 games use oscillator-synthesized WAVs, research 18 C12) — separate audio pipeline work.
- DCC exporter plugins (Blender/Maya add-ons) and an in-browser asset editor.
- Commissioning contracts and art budgets; this PRD defines the admission bar commissioned art must meet.

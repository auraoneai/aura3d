# Retired tests

Date: 2026-11-02 (Aura3D 5.0 pre-source-pass)
Authority: 5.0 decision record (`docs/prds/aura3d-native-code-complete.md`).

A test is retired only when the feature it asserts was deliberately deleted, or
when the data it reads cannot be legitimately obtained in a clean checkout
(three.js-derived corpora, never-committed generated corpora/reports). Every
retirement is listed here with its reason and the current coverage that
replaces it. Assertions of live behavior were moved to current-contract tests,
not dropped.

The 5.0 ACR source pass stages only `git ls-files --cached --others
--exclude-standard`, so a test that reads a gitignored local file fails there
even when it passes on a developer machine.

## 1. `tests/unit/rendering/renderer.test.ts` — WebGPU CPU rasterizer / sync readback (23 cases)

Reason: QR-11 Phase 1 (`d7de114d3`, 2026-10-06) deleted the WebGPU CPU
rasterizer, the synchronous `readPixels`/`readFloatPixels` WebGPU paths (they
now throw `WEBGPU_SYNC_READBACK_UNSUPPORTED`), and the `generated-basic` /
`generated-texture` GLSL→WGSL flat-colour fallbacks (a GLSL-only program now
throws `WGSL_PROGRAM_MISSING`). Current rules are covered by
`tests/qr/prd11/unit/wgsl-missing.test.ts`.

### 1a. Removed (asserted only deleted behavior) — 10 cases

| Retired case | What it asserted | Current coverage |
|---|---|---|
| rasterizes a WebGPU triangle into an offscreen render target for deterministic readback | CPU raster + sync `readPixels` | `wgsl-missing.test.ts` (sync readback throws); native pass submission cases below |
| modulates WebGPU offscreen raster output with vertex colors | CPU raster vertex-colour modulation | same |
| rasterizes WebGPU line and point topologies into deterministic offscreen readback | CPU raster lines/points | same; `tests/unit/rendering/native-webgpu-point-*.test.ts` |
| rasterizes WebGPU instanced triangles into deterministic offscreen readback | CPU raster instancing | same |
| applies WebGPU model-view-projection matrices in deterministic offscreen readback | CPU raster MVP | same |
| applies WebGPU depth testing in deterministic offscreen readback | CPU raster depth test | same; "creates native WebGPU depth targets…" (below) |
| binds generated vertex color 3 components, textured=false, with material RGBA modulation | `generated-basic` GLSL→WGSL fallback shader text and uniform packing | `wgsl-missing.test.ts` (GLSL-only markers throw `WGSL_PROGRAM_MISSING`); `tests/unit/rendering/native-generated-unlit.test.ts` (generated-program unlit path) |
| binds generated vertex color 4 components, textured=false, with material RGBA modulation | same | same |
| binds generated vertex color 3 components, textured=true, with material RGBA modulation | `generated-texture` fallback | same |
| binds generated vertex color 4 components, textured=true, with material RGBA modulation | same | same |

### 1b. Rewritten onto the current contract — 13 cases

These cases failed only because they built a GLSL-only shader (now
`WGSL_PROGRAM_MISSING`) or read back synchronously. Their live device-level
assertions are kept; the shader now supplies real WGSL (`passthroughWgsl()`,
or `portableTexturedWgsl()` for sampled textures). Only assertions about the
deleted generated-basic shader text/uniform packing or about sync readback
were removed (sync readback now asserts the `WEBGPU_SYNC_READBACK_UNSUPPORTED`
throw instead).

| Old case | Current case | Notes |
|---|---|---|
| renders high-level WebGPU sources into explicit offscreen render targets for deterministic readback | routes high-level sources into explicit offscreen render targets | Reference (mock) device; asserts draw count and that the draw went to the render target. Pixel colour came from the deleted CPU rasterizer. |
| runs renderer-owned HDR tone mapping before byte-space grading passes | runs renderer-owned mock reference HDR tone mapping before byte-space grading passes | Same ordering assertions on the reference device with `hdr-render-targets`. |
| creates a WebGPU render device through an injected adapter and verifies resources, readback, and diagnostics | creates a WebGPU render device through an injected adapter and verifies resources, reflection, and diagnostics | Sync `readPixels` now asserted to throw; everything else unchanged. |
| submits a native WebGPU render pass when the device exposes pipeline APIs | (same name) | Shader-module assertion now checks the supplied WGSL; generated-basic uniform-packing/bind-group assertions removed (that layout was deleted). |
| propagates imported texture sampler quality into native WebGPU sampled-texture bindings | (same name) | Portable binding `u_albedo`; sampler descriptor, sRGB upload and bind-group entries unchanged. |
| preserves half-float HDR sampled textures in native WebGPU bindings | (same name) | Portable binding; rgba16float descriptors/writes/target unchanged. |
| creates native WebGPU depth targets and binds depth state for offscreen render passes | (same name) | Depth format updated to the current `depth24plus-stencil8` (`e52fdad5c`). |
| creates a four-sample WebGPU attachment and resolves it into the target texture | (same name) | Unchanged assertions. |
| tracks native WebGPU render-target clears per target instead of per frame | (same name) | Unchanged assertions. |
| reads native WebGPU render targets through async texture-to-buffer copy when available | (same name) | Unchanged assertions. |
| reports WebGPU HDR target capabilities and submits native rgba16f render passes | (same name) | Sync `readFloatPixels` asserted to throw; async readback assertion kept. |
| submits native WebGPU indexed draws only when indexed pass APIs are present | (same name) | Unchanged assertions. |
| configures a WebGPU canvas surface and submits native render passes to the current texture | (same name) | Generated-basic bind-group assertion removed; surface/pass assertions unchanged. |

Result: `renderer.test.ts` 117/117 pass (was 104 pass / 23 fail).

## 2. Asset tests that read never-committed corpora (18 failing cases)

Khronos glTF-Sample-Assets models the tests need are now tracked under
`fixtures/asset-corpus/` (gitignore `!` exceptions; `*.glb` there is LFS by
`.gitattributes`). Sources, licenses, attribution and SHA-256 are in
`fixtures/asset-corpus/khronos-sources.json` and
`fixtures/asset-corpus/khronos-licenses.md`.

| Test file / case | Data it needed | Action | Replacement coverage |
|---|---|---|---|
| `tests/assets/current-routes-gltf-animation-runtime.test.ts` › applies imported morph target tracks from GLB animation data | AnimatedMorphCube via never-committed manifest revision | **Kept**: loads tracked Khronos `animated-morph-cube.glb` | — |
| › runs the mixer update path so animated routes can advance every frame | CesiumMan via same | **Kept**: tracked `cesium-man.glb` | — |
| › reports seeked clip time when routes sample a mixer with update(0) | CesiumMan via same | **Kept**: tracked `cesium-man.glb` | — |
| `tests/assets/current-routes-gltf-loader-corpus.test.ts` › pins a local, checksummed GLB/HDR corpus with real renderer features | `fixtures/threejs-parity/assets/manifest.json` in an uncommitted schema | **Retired** (three.js-derived corpus) | Khronos corpus classification: `tests/assets/gltf-100-classification.test.ts`, `tests/assets/gltf-corpus.test.ts` |
| › extracts declared per-asset metadata from the GLB JSON chunks | same | **Retired** (three.js-derived corpus) | `tests/qr/prd15/assets/gltf-parse-equivalence.test.ts` (inspection counts vs loader on Khronos files) |
| › loads representative production assets through the public GLTFLoader without blank-output diagnostics | same (incl. three.js example Soldier / RobotExpressive) | **Retired** (three.js-derived corpus) | `gltf-parse-equivalence.test.ts`; `production-runtime-gltf-render-pipeline.test.ts`; the CesiumMan/morph cases above |
| › loads GLB assets through the one-call renderable asset API | DamagedHelmet via same manifest | **Kept**: reads tracked Khronos `damaged-helmet.glb` directly | — |
| `tests/assets/production-runtime-real-asset-corpus.test.ts` (also re-run by `production-runtime-asset-corpus.test.ts`) › pins real imported GLB assets instead of primitive-only proof | `fixtures/asset-corpus/manifest.json` in a schema (`a3d-production-runtime-real-asset-corpus`, requirements block) that was never committed | **Retired** (unobtainable authored metadata) | `gltf-100-classification.test.ts`; structure case below |
| › extracts actual glTF scene structure from flagship files | DamagedHelmet / CesiumMan / AnimatedMorphCube via that manifest | **Kept**: reads the tracked Khronos files directly | — |
| `tests/assets/three-compat-asset-library.test.ts` › tracks a broad, pinned production asset corpus with provenance | `fixtures/three-compat/assets/manifest.json` (never committed) | **Retired** (three.js-derived corpus; file deleted) | none needed (three-compat registry is a legacy compatibility surface) |
| `tests/assets/external-parity-asset-corpus.test.ts` (4 cases, incl. the stale `external-gallery-corner` id) | gitignored `fixtures/external-parity-assets/**` and `tests/reports/external-parity-asset-corpus.json`, produced only by the quarantined `tools/_quarantine/external-parity-asset-corpus` generator; the generator emits `external-gallery-corner`, which the test's `external-parity-*` id rule rejects | **Retired** (file deleted; data from a quarantined generator, never committed) | GLTFLoader diagnostics: `tests/unit/parity/gltf-decoders.test.ts`, `tests/unit/product-studio/product-asset-loader.test.ts` |
| `tests/assets/external-parity-gltf-loader-corpus.test.ts` › defines a 25+ asset corpus with license, provenance, and feature coverage | `fixtures/external-parity/gltf-corpus/manifest.json` (never committed Aura3D metadata) | **Retired** (file deleted; unobtainable) | Khronos corpus pinning: `gltf-100-classification.test.ts`. Gap: `summarizeExternalParityGLTFCorpus` / `validateExternalParityGLTFCorpusManifest` have no other direct test. |
| `tests/assets/external-parity-gltf-corpus.test.ts` › ExternalParity glTF corpus alias maps the requested filename to the loader corpus proof | same manifest | **Retired** (file deleted; alias of the case above) | — |
| `tests/assets/foundation-asset-corpus.test.ts` (3 cases) | `fixtures/foundation-assets/**`, `tests/reports/foundation-asset-corpus.json`, `tests/reports/foundation-gltf-corpus.json` — absent locally too; no non-quarantined generator | **Retired** (file deleted; unobtainable) | `gltf-corpus.test.ts`, `gltf-100-classification.test.ts` |

Note on `antique-camera.glb`: the canonical file at the pinned revision (and
on `main`) is 17,540,348 bytes, SHA-256
`ae89695479ad997f09ebea8060a5ad01312ad8fe7ffb92f73b4e895109feecd2`; that is
what is tracked. The pins that recorded `7480f9bed391…` (32,375,420 bytes, a
local copy of unknown provenance) for the same URL were re-pinned to the
canonical digest in 5.0.0 release prep:
`tests/assets/corpus/gltf-corpus.manifest.json`,
`tests/assets/corpus/gltf-100-classification.manifest.json`,
`benchmarks/quality-rebuild/shared/assets.ts`,
`templates/production-{architecture-viewer,asset-inspector}/asset-manifest.json`
and the golden `tests/qr/prd02/golden/base-scene-snapshots.json`. The official
file's scene bounds (re-measured with glTF-Transform `getBounds`) are
2.597 x 7.209 x 3.395, matching the recorded `worldSize`, so no bounds changed.

## 3. Other source-pass reads of gitignored paths (`tests/unit`, `tests/assets`, `tests/qr`, `tests/integration`)

Method: every string-literal path under `fixtures/`, `tests/reports/`,
`tests/**/fixtures/`, `apps/`, `public/`, `evidence/` in those trees was
checked against `git ls-files --cached --others --exclude-standard`; hits that
exist only as local ignored files were read case by case.

### 3a. Fixed by tracking legitimately obtainable data

| Test | Ignored data it read | Action |
|---|---|---|
| `tests/qr/prd15/assets/gltf-parse-equivalence.test.ts` (4 fixture cases) | `clear-coat-test.glb`, `sheen-test-grid.glb`, `antique-camera.glb` | Khronos files tracked (section 2). The non-GLB rejection case pointed at the ignored `fixtures/asset-corpus/manifest.json` (it would have "passed" remotely on ENOENT); it now uses the tracked `khronos-sources.json`. |
| `tests/qr/prd04/unit/gltf-decoders-variants.test.ts` | `damaged-helmet-draco.glb`, `damaged-helmet-meshopt.glb` | Tracked. Derived from the tracked DamagedHelmet by `tools/generate-prd04-compressed-fixtures.mjs`; regenerated in a temp dir and byte-identical. |
| `tests/qr/prd04/unit/gltf-material-mapping-spec-exact.test.ts` | `compare-transmission.glb` | Khronos file tracked. |
| `tests/qr/prd04/unit/mikktspace-tangents.test.ts` | `normal-tangent-mirror-test.glb` | Khronos file tracked. |
| `tests/qr/prd04/unit/typed-glb-actor-snapshot.test.ts` | `materials-variants-shoe.glb` | Khronos file tracked. |
| `tests/assets/production-runtime-gltf-render-pipeline.test.ts` | `clear-coat-test.glb`, `cesium-man.glb`, `animated-morph-cube.glb` | Khronos files tracked. |
| `tests/assets/foundation-gltf-loader.test.ts` › loads Foundation .gltf, .glb, data URI, and external buffer/image fixtures | `fixtures/workflow-assets/assets/*/image-*.png` (92 files, 368 KB), referenced by the tracked `*-external.gltf` | Un-ignored. First-party generated fixtures; every PNG is byte-identical to the data URI embedded in the tracked sibling `*.gltf`. |
| `tests/qr/prd01/unit/hang-program-cache-01hang.test.ts` | `tests/qr/prd01/unit/fixtures/hang-01-harness/{index.html,main.ts,vite.config.ts}` (ignored by the repo-wide `fixtures/` rule) | Un-ignored (first-party harness source), same as the other lane fixture exceptions. |
| `tests/qr/prd04/unit/glb-fixtures-valid.test.ts` (9 of 15 cases) | `fixtures/asset-corpus/{alpha-blend-mode-test,anisotropy-barn-lamp,anisotropy-rotation-test,dispersion-test,iridescence-lamp,normal-tangent-test,texture-transform-test,damaged-helmet-uastc,damaged-helmet-etc1s}.glb` (found by tracing file reads of the full `tests/qr` run against the native-5-source-001 staged manifest) | Un-ignored. The six Khronos files were re-downloaded at the pinned revision and are byte-identical; the three derived files (TextureTransformTest GLB pack, DamagedHelmet UASTC/ETC1S) match the `scenes/prd04/assets.ts` pins and are recorded as not regenerated. Entries in `khronos-sources.json` / `khronos-licenses.md`. |

### 3b. Retired (deleted feature)

| Test / case | Reason | Replacement coverage |
|---|---|---|
| `tests/unit/apps/skyline-subject-pose-determinism.test.ts` (4 cases; file deleted) | `showcase-skyline-runner` was retired in 4.0.1 (`docs/project/showcase/apps-classification.md`); the file read `apps/showcase-skyline-runner/src/main.ts` (gone) and its ignored route probe, and already failed at collection locally. | none (route deleted) |
| `tests/unit/engine/layered-scene-composition.test.ts` › keeps the hero readable and unclipped in the shipped frame; › passes its own route gate with the composition layer active; › ships no primitive stand-in as a primary subject | Same retired Skyline route; read its ignored, non-regenerable route-primary probe. | Planner-level cases in the same file (determinism, constraints, depth layers, density, sky backdrop) remain. |
| `tests/unit/tools/head-to-head-current-aggregate.test.ts` (1 case; file deleted) | Ran `tools/head-to-head-current-aggregate/index.ts`, which was moved to `tools/_quarantine/` (`c92db9322`), and read the ignored three.js head-to-head aggregate. Already failing locally. | none (three.js comparison, independence rule) |
| `tests/qr/prd14/unit/games-json.test.ts` › leaves Courier Rush with no canvasBlankCheck override | `showcase-courier-rush` was deleted in 4.0.1 (`46bca99f1`) and its games.json entry pruned (`8e6ecef13`); the case read an entry that no longer exists. | The canvasBlankCheck allow-list case in the same file still rejects any un-listed override. |

PRD-14 per-route unit checks (`tests/qr/prd14/unit/{v2-flags,hud-widgets,sound-assets,s10-assets,stand-ins,kits,renderer-options,games-json}.test.ts`)
were not retired: they asserted "18 routes" and read `src/v2/boot.ts` /
`art/direction.ts` for every games.json entry. 13 of the 18 rebuild apps were
deleted in 4.0.1 (`46bca99f1`, pruned `8e6ecef13`) and three later non-rebuild
routes were registered (`644da6651`, `479225fd9`). They now iterate the five
shipped rebuild routes (`tests/qr/prd14/unit/helpers/games.ts`), and
`games-json.test.ts` asserts that split against games.json and the tree (rebuild
routes have a v2 boot and dispatch their route flag; the others have neither).
`tests/qr/prd06/unit/hero-validator.test.ts` › rejects skylineArcticRunner.glb
read the Skyline route's deleted `generated/skylineArcticRunner.glb`; it now reads
the tracked catalog successor `public/aura-assets/skylineArcticRunnerHero.84024fc9.glb`
(same four codes).

### 3c. Open — first-party retained browser/tool evidence (not retired, not committed)

These cases assert on retained first-party evidence in gitignored
`tests/reports/**` that only browser runs or evidence tools produce. They are
live release gates, not deleted features, and the data is neither three.js-derived
nor third-party, so neither rule applies; they will fail in the 5.0 source pass
until the owner chooses: (1) exclude them from the source-pass unit shards and
run them in acceptance after the browser evidence is produced (the old
`tools/remote-acr/source-checks.mjs` did this for three of them via
`HISTORICAL_ACCEPTANCE_TESTS`; `tools/remote-acr/source5-run.sh` has no
exclusions), or (2) track the specific retained reports.

| Test | Cases | Ignored input |
|---|---|---|
| `tests/unit/apps/turbo-hero-admission.test.ts` | has a retained multi-angle render…; is ADMITTED for hero-vehicle… | `tests/reports/vehicle-wheel-visibility/turboRaceCar.json` |
| `tests/unit/aura3d-cli/asset-screening-effects.test.ts` | 4 cases (retained multi-angle report → turboRaceCar chain) | same |
| `tests/unit/engine/runtime-parity-production-runtime-public-sdk.test.ts` | writes a bounded SDK replacement-readiness artifact… | `tests/reports/production-runtime-external-consumer{,-render}.json` |
| `tests/unit/root-path-integrity/pixel-exports-t1.test.ts` | live audit: divergent set matches the ratified known set exactly | `tests/reports/public-surface-diff.json` (dated 2026-10-27; may be stale after the 5.0 export removals) |
| `tests/unit/tools/claim-lineage.test.ts` | all 8 | `tests/reports/aura3d-threejs-ecosystem-parity.json` (via `tools/product-remediation`) |
| `tests/unit/tools/parity-consumers.test.ts` | all 3 | same |
| `tests/unit/tools/evidence-freshness.test.ts` | 9 cases | `tests/reports/evidence-freshness/staleness-audit.json`, route-primary probes |
| `tests/unit/tools/replicability-metrics.test.ts` | 4 cases | `tests/reports/replicability-metrics/report.json`, `tests/reports/asset-screening/*.json`, probes |
| `tests/unit/tools/showcase-route-gates.test.ts` | accepts the retained full route-primary summary…; keeps retained route-primary summary artifact paths repo-relative | `tests/reports/showcase-route-primary-probes/_summary.json` |
| `tests/unit/tools/visual-review-perceptual-binding.test.ts` | all 5 | `tests/reports/showcase-library-screenshots/*.png` |
| `tests/unit/tools/developer-value.test.ts` | whole file | `tests/reports/bundle-scenarios.json` (deterministic: `tools/bundle-scenarios`) |
| `tests/unit/tools/honest-public-claims.test.ts` | whole file | same |
| `tests/unit/tools/release-metrics-rollup.test.ts` | 2 cases | `bundle-scenarios.json`, `engine-layer-ratio.json` |

Checked and safe (reads are output-only, temp-root, mocked, `existsSync`-guarded
or string-only): the other 35 `tests/unit` candidates, `tests/assets/{gltf-100-classification,gltf-corpus,asset-compatibility,product-studio-product-assets}.test.ts`,
`tests/integration/external-parity-create-aura3d.test.ts`, and the
`tests/browser/fixtures/c1-*.png` URLs in `tests/unit/agent-api/*` (string-only).

### Note: the historical assertion baseline

`tools/muse3jsparity-readiness/baseline-unit-inventory.json` is an immutable
historical inventory; the retired renderer, Skyline and head-to-head assertions
above will appear as removed against it. This document is their retirement
record.

## 5. `tests/qr` renderer/asset cases rewritten onto 5.0 contracts (source pass 2026-11-02)

No case below was dropped; each assertion of the old behavior was replaced by
an assertion of the current contract that superseded it.

| File › case | Old assertion | Contract that changed it | Current assertion |
|---|---|---|---|
| `tests/qr/prd11/unit/renderer-profile-freeze.test.ts` › 2 cases | `experimental-webgpu` throws `AuraMigrationError` ("frozen by PRD 11") | `docs/migration/4-to-5.md` B5; CHANGELOG 5.0.0 "Renderer options are validated" | profile resolves; backend request is `webgpu` with `allowFallback: false` (`auto` → fallback on) |
| `tests/qr/prd05/unit/aura-decoders-plugin.test.ts` › dev middleware traversal case | traversal/malformed/directory requests under `/aura-decoders/` fall through to `next()` | S5-IMP-16 (decoder plugin dev/build/static-base agreement); `tests/unit/assets/native-decoder-deployment.test.ts` "rejects traversal, missing files and methods" | under the prefix: traversal/malformed → 400, directory → 404, never `next()` and no body; other prefixes still pass through |
| `tests/qr/prd05/unit/c16-texture-upload-consumer.test.ts` › 4 flag-off / no-provider cases | flag off uploads an sRGB ASTC texture under the linear constant; bc7 throws `UNSUPPORTED_COMPRESSED_FORMAT`; no-provider sRGB DXT1 uploads as linear DXT1 | 5.0 uploads always use the colour-space-correct `resolveCompressedTextureFormatReal` (26eae82e2), as the default-flag `tests/unit/rendering/native-bc1-image.test.ts` asserts | sRGB ASTC → `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR` in every mode; bc7 without BPTC or fallback → "not supported and no RGBA8 fallback"; sRGB DXT1 without `s3tc_srgb` → RGBA8 fallback; new linear-ASTC case |
| `tests/qr/prd04/unit/lobes-visual.test.ts` › 4 "lobe textures are sampled" cases | literal `texture( u_<slot>Texture, v_uv )` | per-slot KHR_texture_transform / texCoord UVs (`A3D_LOBE_UV_<SLOT>`, 26eae82e2; glTF 2.0 textureInfo) | sampler read through `A3D_LOBE_UV_<SLOT>`, which is defined from `v_uv` |
| `tests/qr/prd04/unit/materials-lobe-route.test.ts` › "srgb targets stay legacy" | a sheen material on an sRGB direct target draws with legacy pbr-direct | ForwardPass "explicit sRGB output selects the generator's encode variant" (`PROGRAM_OUTPUT_SRGB_FEATURE`, 26eae82e2) | lobe-free and `-core_generator` stay legacy; new case: sRGB target draws a generated program carrying the sheen lobe and a different (encode) fragment than linear |
| `tests/qr/prd04/unit/gltf-image-colorspace-intent.test.ts` › tangent-derivative-fallback | a TEXCOORD_1 normal map on a mesh without set-0 UVs reports `tangent-derivative-fallback` | S5-IMP-09 multiple UV sets (26eae82e2): such meshes now get a tangent attribute. **Product fix in this pass:** that tangent was generated from the empty set 0; `GLTFRenderResources.ts` now generates it from the normal map's `texCoord` set | no fallback issue, and the generated tangents equal those of the same UVs authored as set 0 (fails without the fix); flag-off / with-UVs no-issue checks kept |
| `tests/qr/prd07/unit/prd07-C-21.test.ts` › "horizon beats zenith" | horizon luminance > zenith at a 65° sun | independent Preetham, Shirley & Smits 1999 sky replaced the three.js r185 Sky.js port (`PreethamSky.ts`, 26eae82e2; 5.0 independence rule) — the paper's circumsolar term makes the zenith brighter here | luminance ratios to zenith match the paper's Perez F(θ,γ) with the published T-dependent coefficients within 3% |
| `tests/qr/prd07/unit/fountain-plume.test.ts` › non-fountain mapping | `swirl` with `radius` has no `spawnRadius` | 72945ca70 (4.0.1): `radius` sets the spawn disc for every emitter (pre-existing 4.x failure) | `swirl` + `radius` → `spawnRadius` = radius with swirl spread; no `radius` → none |

Harness-only fixes (assertions unchanged): `tests/qr/prd07/unit/frame-graph-paths.test.ts`
(the "legacy" variant now passes `-core`; `A3D_QR_CORE` is default-on since
4b7a636a1, so it silently resolved to the v2 path; guarded by a new flag
assertion), `tests/qr/prd06/unit/depth-feature.test.ts` (real `Geometry`
instead of a partial mock without `getAttributeBuffer`),
`tests/qr/prd08/unit/loop-arm-idle.test.ts` (imports the chase rig, which
registers on import per the S19 rig registry), and
`tests/qr/prd07/unit/standalone-shader-validity.test.ts` (explicit 60 s budget
for ~250 sequential `glslangValidator` spawns; the check still runs whenever
the tool is on PATH and all variants compile).


## 6. `tests/unit` tools/docs/package-dist cases (source pass 2026-11-02, tools lane)

### 6a. Retired (three.js-derived data, S5-WP19-07)

| Retired case | Reason | Current coverage |
|---|---|---|
| `tests/unit/tools/muse3jsparity-decoder-alignment.test.ts` › rejects changed vendored or installed content despite a claimed version | Read three's vendored `node_modules/three/examples/jsm/libs/ktx-parse.module.js`; S5-WP19-07 removed three from the workspace install graph, so the reference bytes no longer exist in a clean install. | Version gating cases in the same file (`assertDecoderVersion`, versionless-reference rejection) |
| same file › verifies actual loader-resolved KTX upstream content and compressed fixture behavior | Compared the installed ktx-parse against the same three-vendored copy. | same; KTX2 decode behavior: `tests/unit/assets/native-ktx2-worker.test.ts`, `tests/unit/assets/ktx2-target-format.test.ts` |

### 6b. Rewritten onto the documented contract (no live-behavior assertion weakened)

| File › case | Old assertion | Contract that changed it | Current assertion |
|---|---|---|---|
| `tests/unit/docs/converted-feature-docs.test.ts` › production renderer how-to | `export type AuraRendererMode` exists | CCR-15-1, QR-15 T8.1 (`90e6de309`) removed the alias | alias absent; `mode?: "safe-basic" \| "production"` is the inline option type; doc sentence corrected |
| `tests/unit/tools/root-motion-locomotion-301-contract.test.ts` › advances renderer-owned actor state… | `preparedFrame = { time, input: buildFrame(time) }` | 5.0 frame retention (`26eae82e2`) adds the retained-resource release | `update()` builds + retains without presenting; `render()` consumes the prepared frame for the same time |
| `tests/unit/tools/capture-flags.test.ts` › exact `route.bank_shot` | `A3D_QR_CAMERA` off | `A3D_QR_CAMERA` promoted `default-on` (`1e0871749`, §5.3) | flag list is exactly `["route.bank_shot"]`; GAME/WORLD off; CAMERA equals its registry default |
| `tests/unit/tools/marketing-showcase-build.test.ts` › 3 cases | Turbo Drift Circuit / Skyline Runner call the presentation helpers and are published; `showcase-orbital-defense` in games.json | Routes retired in 4.0.1 (`46bca99f1`, `apps-classification.md`) and redirected | helpers stay exported; retired routes have no source, are in `retiredPrototypeRoutes`, not built live; every games.json route is built or redirected |
| `tests/unit/tools/migration-matrix.test.ts` › 3 cases | `@aura3d/lean` exists; version `3.0.x`; only `./three-compat` removed since v1.5.2 | QR-15 T8.1 deleted `packages/lean` and 18 root subpaths; 5.0 decision record item 4 (version 5.0.0); `docs/migration/4-to-5.md` B15 | lean absent; `5.0.x`; exact removed-subpath set split 2.0 / QR-15 / 5.0 B15 (5.0 ones must be in the B15 table). v1.5.2 facts recorded in the test and re-verified against the tag when Git exists; the `c9d6044a^:QuickFixes.md` retrieval runs only with Git history |
| `tests/unit/tools/native-browser-source-inventory.test.ts` › required roots | `tools/bench-vs-threejs/full-game/three/src/*` are checked roots | S5-WP19-07 decision: the bench is external, never typechecked | those files exist and are not roots. `tests/qr/prd04/browser/native-physical-numeric{,.spec}.ts` (roadmap paths) were added to `tsconfig.browser-tests.json` (focused tsc clean) |
| `tests/unit/tools/current-threejs-baseline.test.ts` + `tools/current-threejs-baseline/index.mjs` | root `three@0.185.1` devDependency, `@types/three`, three in the lock | S5-WP19-07 (no other engine in install/lock graph) | root/lock have no three; external harness inputs still agree on 0.185.1 |
| `tests/unit/package-dist/root-gates.test.ts` › 2 cases | root resolves to `dist/engine/agent-api/index.js`; fixed 12-role help string | QR-15 T5 (`bf1789b06`) root export is `dist/engine/public/index.js`; CLI role list grew (`cli-help.ts` `assetRoleUsage`) | current entry; help prints the source role list, which still contains the 12 roles |

### 6c. Source-pass environment fixes (no assertion change)

- No `.git` on ACR: `tools/remote-acr/source5-files.mjs` lists candidate files from Git or the staged `tools/remote-acr/.source5-manifest.txt`; used by `tools/agent-eval/lib/sandbox.mjs` (bench authors sandbox leak check) and `lfs-fixture-attributes.test.ts`. The LFS clean-filter cases need the `git-lfs` binary (absent in the image) and skip without it; the attribute cases still run.
- `tools/agent-examples` no longer treats the staged manifest as route references (it made every `examples/*` dir "documented", e.g. `examples/shadow-lab`).
- `run-source5.sh` stages tracked `tests/reports/**` (e.g. `final-competitive-baseline`); untracked reports stay out.
- `tests/unit/package-dist/**` imports built dist: excluded from the pre-build unit shards, run in `packed-a` after `pnpm build`.
- Native custody guard tests kept: `sqlite_stat4` tamper only where SQLite has STAT4; the workspace fixture lives in a private parent (Linux `/tmp` is world-writable).
- `tests/fixtures/native-examples-catalog/expectations.json` source pins re-pinned to current bytes (12 files changed by later commits); re-pin again at freeze if pinned sources change.

## 7. `tests/unit` rendering/gu47/contracts/physics/rework-kit cases (source pass 2026-11-02, render lane)

### 7a. Retired (deleted feature)

| Test / case | Reason | Replacement coverage |
|---|---|---|
| `tests/unit/rendering/webgpu-skinning-parity.test.ts` › skins a vertex bound to joint #80; › a high joint index produces the same result as the equivalent low index | Both rendered through the WebGPU CPU emulation rasterizer and read back with synchronous WebGPU `readPixels`, deleted by QR-11 Phase 1 (`d7de114d3`; see §1). They failed with `Synchronous WebGPU readPixels is unsupported`. | The 96-joint capacity case in the same file; native WebGPU skinning through the generated bone-texture skin4/skin8 programs in `tests/unit/rendering/native-generated-pbr.test.ts` |
| `tests/unit/rendering/environment-lighting-reflection-platform.test.ts` › named environment preset reports (preset-content assertions) | `createNamedEnvironmentPreset` was removed by QR-10/PRD-10 (`864ccaa89`, "planner removal") and is a throwing `removed-world-planner` stub; a pre-existing 4.x failure. | Same case now asserts the stub throws with the replacement hint; `listNamedEnvironmentPresets()` ids still asserted |

### 7b. Rewritten onto the current contract (no live-behavior assertion weakened)

| File › case | Old assertion | Contract that changed it | Current assertion |
|---|---|---|---|
| `tests/unit/rendering/deform-cpu-morph-scratch.test.ts` › same count-mismatch error as legacy | plain `Error` text with a trailing period | `resolveRenderGeometry` validates both flag arms up front with the structured `RenderDeviceError` `MORPH_TARGET_CONTRACT` (`activeDirectionMorphs`, `forward/Deform.ts`) | flag on and flag off throw the same message and code `MORPH_TARGET_CONTRACT` |
| `tests/unit/rendering/environment-lighting-reflection-platform.test.ts` › cube capture | read `first.texture.cubeFaces` after the next capture retired it | `Texture.dispose()` releases CPU content references (doc comment, 26eae82e2) | face order asserted while `first` is the live capture; all other assertions unchanged |
| `tests/unit/contracts/impl/prd02-sampler-c12.test.ts` › flag off | explicit `addressW` ignored with the flag off (R falls back to `addressV`) | 26eae82e2 / S5-WP05-02 (3D/array/cube resources): an explicit third-axis mode is honoured in every mode (also `native-dynamic-textures` "third-axis address modes distinct") | explicit `addressW` → `TEXTURE_WRAP_R` REPEAT; a sampler without `addressW` still falls back to `addressV`; compare/mirror inert and no filter downgrade unchanged |
| `tests/unit/contracts/impl/prd02-cascade-fitter-oversize.test.ts` › shadow system skips an oversize caster | read diagnostics after a deliberately throwing `update` on a fake device | `Prd02ShadowSystem.update` clears fits and diagnostics of a frame that throws mid-submission (5.0) | the frame completes on `MockRenderDevice` with real cube casters; sky reported, house not, 2 cascade fits |
| `tests/unit/gu47/eint/ldr-tail-depth.test.ts` › 3 cases | linearise draw found by the old `linearizeDepth(d, u_near, u_far, u_ortho)` text; without scene depth the custom samples a 1×1 blank | depth-convention linearisation (`auraLinearDepth`, inverse projection; decision record item 3 reversed/log depth); `docs/rendering/postprocess.md` "Effect input audit": missing inputs report `POSTPROCESS_INPUT_UNAVAILABLE:<pass>:<input>` instead of a blank | linearise draw matched on the new program, same unit/uniform assertions; missing scene depth throws `POSTPROCESS_INPUT_UNAVAILABLE:eint.ink-none:depth` with no linearise or custom draw |
| `tests/unit/gu47/eh/crowd-kit.test.ts` › loadCrowdPoses | `hash: "sha256-cesium"` label | a typed asset `hash` is the expected document SHA-256 (`TypedGLBActor` `actorRequest`) | the fixture's real SHA-256 |
| `tests/unit/rendering/deferred-pipeline-adapter-contract.test.ts` › DFG upload | two pinned r185 table values | independent GGX split-sum table (`program/DFGLutData.ts`, 26eae82e2; 5.0 independence rule) | three texels equal `integrateGgxDfg` at their texel centres within binary16 precision |
| `tests/unit/rendering/native-pbr-detail-shaders.test.ts` › one-sided rectangle | `max(dot(a3dRectNormal, -L), 0.0)` literal | `RectAreaLight.twoSided` (5.0) packs into up.w | facing is `dot(a3dRectNormal, -L)` and the one-sided arm still clamps with `max(…, 0.0)` |
| `tests/unit/rendering/native-specialized-objects-webgpu.test.ts` › 5 cases | literal `(clip.z + clip.w) * 0.5` | native reversed depth (`webgpu/ProjectionClip.ts`): the remap is written through the `a3dZeroToOneProjection` override | the vertex declares the override and contains `rasterClipDepthWgsl("clip")`; a standard frame leaves the override false |
| `tests/unit/rework-kit/two-hand-grip.test.ts` › reproduces the Diamond batter solver | replayed the golden through the app's `solveBatterPose` | the Diamond batter stance was re-authored after capture (`8edba1957`, 4.3.x: stance key, poles, yaw, lower body), changing the app's calibrated socket; `twoHandGrip.ts` is unchanged since capture | the kit is driven with the rig as captured (`027b0eb6c` constants) and matches every golden row at 1e-12 |

### 7c. Product fix and harness-only fixes

- **Product fix:** `SceneRasterParticipantLease.ts` read `disposed` as an own data property of `VertexBuffer`/`IndexBuffer`; 5.0 made it a getter that turns true only after device retirement, so every participant buffer was rejected. It now rejects a buffer whose dispose was requested (`closed`) or completed (`disposalComplete`). `native-scene-raster-participant-lease.test.ts` (5 cases) passes unchanged.
- `primitive-submission-audit.test.ts`: passes a real `LoadContext` to `GLTFLoader.load` instead of a partial mock without `requestOptionsFor`.
- `native-entry-runtime-binding.test.ts` › no-TLA readiness: the three entry imports run sequentially. Concurrent dynamic imports of entries that share the agent-api node graph (it contains import cycles, e.g. through `nodes/scene.ts`) deadlocked vitest's module runner after `resetModules` (240 s timeout locally). Assertions unchanged.
- `native-physics-entry-graph.test.ts` › staged entry graph rows: explicit 60 s budget; the first row parses the whole source graph cold and exceeded the 5 s default on ACR (`STACK_TRACE_ERROR`).

## 8. `tests/unit` apps/CLI/create-aura3d/agent-api/engine cases (source pass 2026-11-02, apps lane)

### 8a. Retired (deleted feature)

| Test | Reason | Replacement coverage |
|---|---|---|
| `tests/unit/apps/skyline-challenge-feedback.test.ts` (whole file; deleted) | `showcase-skyline-runner` was retired in 4.0.1 (`docs/project/showcase/apps-classification.md`); the file read `apps/showcase-skyline-runner/src/main.ts`, which no longer exists, and failed at collection. Same route as section 3b. | none (route deleted) |
| `tests/unit/apps/smart-city-scene-update.test.ts` › "enlarges its bounds-derived command vehicle for the compact composition probe" — the `extent: [0.35, 0.1, 0.35]` assertion only | `72945ca70` (4.0.1 studio upgrade) removed the compact-only vehicle enlargement and fixed the command vehicle at a realistic 0.34-unit scale (pre-existing 4.x failure). | Same case, renamed: asserts the enlargement stays gone and `vehicleTargetMaxDimension()` returns 0.34; compact camera distance and FOV assertions unchanged. |

### 8b. Rewritten onto the current contract

| File › case | Old assertion / input | Contract that changed it | Current assertion |
|---|---|---|---|
| `tests/unit/engine/phase2-root-bridge.test.ts` › spot cone defaults | default spot `intensity: 8` | QR PRD-02 Phase 2 (`8e6f298dd`) raised the default to 30; `tests/unit/agent-api/prd02-builders.test.ts` pins 30 (pre-existing 4.x conflict) | `intensity: 30`; angle, penumbra, distance unchanged |
| `tests/unit/agent-api/paused-render-clock.test.ts` › pause cancels automatic submissions | four literal `if (… !isPaused() && (sceneWantsFrames …` guards | 5.0 frame loop (`app/frameLoop.ts`, 26eae82e2) routes every automatic reschedule through one `canSchedule()` guard that includes `!isPaused()` | the guard and the paused early return in `scheduleFrame` exist, and every `= requestAnimationFrame(scheduleFrame)` site in `frameLoop.ts` is guarded by `canSchedule()` (stricter: all sites, not four). Behavioral pause coverage: `native-onframe-wake.test.ts`, `native-orbit-camera-frame-loop.test.ts` |
| `tests/unit/asset-index/cli-pull-bridge-quality.test.ts` › refuses the 792-triangle shell and falls through | the shell (resolver score 100) is attempted first, refused, and the reason appears in the success messages | the resolve scorer's G1 triangle band ranks the in-band 32k-triangle hero (52) above the shell (39), so the default path never attempts the shell | default path: hero admitted, shell never downloaded; forcing the shell with `candidateId` rejects before download with `catalog:shell-792` and the structural-floor / distant-prop reason |
| `tests/unit/create-aura3d/showcase-{non-game,platformer}-spec.test.ts` › 4 replacement-selection cases | the live `aura.assets.json` supplies a `quality: "release"` replacement candidate | QR-05 release-gate honesty (`2d8f721f9`, 2026-10-06) demoted every hand-authored release grade; release quality is granted only by `aura3d assets admit`, and the live manifest holds none (pre-existing 4.x failure) | the expected candidate (`showcaseVoxelBuilding`, `showcaseRoboticWeldingWorkcell`, `showcaseParticleCore`, `showcaseSideScrollerWorld`) is presented as admitted via a `readManifestAssets` wrapper; every other manifest field, all evidence and every assertion unchanged |

Product fix in this pass: `apps/showcase-vault-breakers/src/gameplay/table.ts`. 5.0 measures hinge limits from the
creation pose (the Rapier path sets frame B from the bodies' relative rotation, `PhysicsWorld.jointAxisFrames`, matching
the native solver's `twist: 0` at creation). The table still passed 4.x absolute-yaw limits, so the flippers stopped at
rest + 0.5 rad and balls did not drain (3 cases in `vault-breakers-table.test.ts`). The limits are now `[0, up - rest]`
on both sides; assertions unchanged. `tests/unit/apps/vault-breakers-flipper-spike.test.ts` builds its own rig with the
same 4.x limits and had the same failure; its limit inputs were corrected the same way, assertions unchanged.

Harness-only fixes (assertions unchanged): `tests/unit/agent-api/e1-wave3-setscene-in-frame.test.ts` (the fake
production renderer returned `diagnostics: undefined`, violating the required
`WebGLSceneRenderer.diagnostics: AuraRendererDiagnosticReport`; it now carries an initial report),
`tests/unit/apps/blockfall-beat-occlusion.test.ts` (read the T1.10 path shim; now reads
`src/gameplay/reactor-scene.ts`, as the shim requests), `tests/unit/aura-links-3d/turf.test.ts` (one `expect()` per
texel took 2.3 s and timed out on a loaded shard; it now asserts the worst texel of every tile once, 0.19 s),
`tests/unit/aura3d-cli/legacy-model-admission.test.ts` (explicit 60 s budget for two cold `tsx cli.ts` spawns),
`tests/unit/aura3d-cli/admission-geometry-fixtures.test.ts` + `tools/asset-geometry-audit/wheel-detect.mjs` (the
auditor imported `packages/aura3d-cli/dist/`, which the unbuilt unit stage lacks; with type stripping it now loads the
import-free `src/asset-role-admission.ts`), `tests/unit/bunker-zero/decals.test.ts` (the `git ls-files` tracked check
runs only where `.git` exists; the source pass stages tracked files only, so an ignored PNG there exists only if it is
tracked), and `tests/unit/create-aura3d/showcase-racing-spec.test.ts` + `showcase-non-game-spec.test.ts` (their fixture
specs read three release probes from ignored `tests/reports/`; `turboFormulaCircuit` and
`showcaseRoboticWeldingWorkcell` probes were copied, paths rewritten, into the un-ignored
`tests/fixtures/showcase-spec/evidence/showcase-release-asset-probes/`, and `turbo-drift-circuit.json` now points at the
existing `showcaseTsukubaCircuit` fixture probe, as `turbo-drift-racing.json` already did).

## 9. `tests/unit` rendering/gu47/contracts/environments/navigation-recast/input cases (ACR unit shards 3-4, candidate `4639e868c`, render34 lane)

### 9a. Retired (deleted feature)

| Test / case | Reason | Replacement coverage |
|---|---|---|
| `tests/unit/rendering/terrain-sprites-d2d4.test.ts` › assigns nearer tiles lower LODs with morph in [0, 1]; › counts hole cells through the hole mask | `createTerrainTileGrid` (plan-only tile records, never rendered) was removed by QR-10 / PRD-10 (`864ccaa89`, "planner removal") and is a throwing `removed-world-planner` stub; same removal as §7a `createNamedEnvironmentPreset`. | One case now asserts the stub throws with its replacement hint (A3D_QR_WORLD terrain pass, C-26 world queries); `tests/qr/prd10/unit/world-frame-passes.test.ts`, `chunks-registration.test.ts`. The other D2/D4 cases in the file are unchanged. |

### 9b. Rewritten onto the current contract (no live-behavior assertion weakened)

| File › case | Old assertion | Contract that changed it | Current assertion |
|---|---|---|---|
| `tests/unit/environments/three-compat-environments.test.ts` | ≥ 12 presets, ≥ 6 real HDRIs | QR-10 (`864ccaa89`, "HDRI de-alias") dropped 3 alias presets that repeated a canonical sha256; the manifest's own `requirements` are 9 / 3 | requirements are 9 / 3, counts meet them, every real HDRI sha-verifies and has a distinct sha256; all other assertions unchanged |
| `tests/unit/navigation-recast/optional-boundary.test.ts` › optional peer | root `optionalDependencies` = `{ recast-navigation }` | `3bce07cb7` moved it to an optional peer (runtime lazy-loads); `docs/migration/4-to-5.md` §3 lists the optional peer `recast-navigation` `0.43.1` | not in `dependencies`/`optionalDependencies`; root `peerDependencies` pins `0.43.1` with `peerDependenciesMeta.optional` |
| `tests/unit/rendering/current-routes-interactive-renderer-api.test.ts` › one-renderer surface | literal `productionRenderer.render(` / `renderAsync(` in the bridge | frames now reach `Renderer.render`/`renderAsync` through the probe-frame helpers (PRD-02 probe capture + PRD-07 operation lease) | the helpers call `renderer.render(source, camera)` / `renderer.renderAsync(source, camera)` and the bridge dispatches through them with `productionRenderer` |
| `tests/unit/rendering/shader-library.test.ts` › GGX/Burley; › packaged files synchronized | `pow(distanceToLight / range, 4.0)` literal | PRD-02 §6.3: `range <= 0` is infinite (decay only) (`ShaderLibrary.ts` comment) | the full `rangeFalloff` line with the infinite-range branch. The sync case also found a product defect, see 9c |
| `tests/unit/rendering/native-shadow-checked.test.ts` › 2 `mock` cases (late unsupported caster preflight) | clipped point caster throws `Clipping is unavailable` on a non-WebGPU device | the 5.0 clipped specialized depth path (`ed5a52d58`, `shadows/SpecializedClippedDepth.ts`; `native-specialized-clipped-depth.test.ts` "submits only points whose source centre is retained (shadow pass)") supports clipped points | the late caster is an *instanced* clipped point (still unsupported on every device: `Clipped point depth does not support …`); no clear, no allocation, no draw, target restored, all unchanged; the `webgpu` cases are unchanged |
| `tests/unit/rendering/native-renderer-device-frame-cleanup-retry.test.ts` › retries a failed mock device | the failed history dispose is not retried (1 call) | decision record item 3 teardown contract: a failed dispose stays pending until `dispose()` is called again (`Renderer.disposeTemporalHistory` keeps `temporalCleanupPending`) | the failed history cleanup is retried exactly once like the device (2 calls each) and a third `dispose()` repeats nothing |
| `tests/unit/rendering/native-point-quads.test.ts` › disposed upload attempts | read `disposed.vertexBuffer` after `Geometry.dispose()` | 5.0 `Geometry`: a closed geometry's `vertexBuffer`/`indexBuffer` getters assert alive | the owned buffers are held before dispose; the getter throws `Geometry is disposed`; uploads throw `disposed` and record the attempt (unchanged) |
| `tests/unit/gu47/ec/lut.test.ts` › help lists the lut type | `[--type …|navigation|lut]` | 5.0 adds `scalar-volume` (`docs/migration/4-to-5.md` B3, `docs/api/native-formats.md`) | `[--type …|navigation|lut|scalar-volume]` |
| `tests/unit/gu47/eh/glb-part-handle.test.ts` › C-37 `part` member | an ownerless actor is found through a handle created for app `{}` | 5.0 scopes live actors per app owner (`actorAnimationContextFor`; ownerless actors share a separate bucket) | another owner's (ownerless) actor is not visible; the actor loaded with `runtimeOwner: app` resolves per call and stops resolving after dispose |

### 9c. Product fixes

- **`packages/rendering/src/shaders/pbr-direct.{vert,frag}.glsl`** were stale against the default shader library
  (missing diffuse-detail/retroreflection, detail UVs, contact-shadow mask, two-sided rect lights, infinite range,
  cluster tile fix). Regenerated from `createDefaultShaderLibrary().compileSource(DEFAULT_PBR_SHADER_NAME)`; the
  sync assertion is unchanged.
- **`packages/engine/src/agent-api/SceneQueries.ts`** mesh queries rejected a skinned item whose palette sets
  `extraInfluences` while the geometry declares only the first influence set; the renderer
  (`validateSkinningGeometryContract`) and `SkinningBounds` accept and draw it with four influences. The query now
  applies the same contract (second set used only when both halves exist; a half-declared set is rejected).
  Fixes `native-vertex-deformation.test.ts` › instance-rate joints (assertions unchanged).
- **`packages/input/src/InputSystem.ts`** registered capture listeners with a boolean `true`; Node's `EventTarget`
  on the ACR image reads only `options?.capture` in `removeEventListener` (local Node 26 flattens booleans), so
  `dispose()` left every pointer listener attached and a press after dispose was recorded. Add and remove now use
  `{ capture: true }`. Fixes `tests/unit/input/pointer-cancel-301.test.ts` on ACR (assertions unchanged).

### 9d. Harness / environment fixes (assertions unchanged)

- `tests/unit/contracts/impl/prd01-program-generator.test.ts` › explicit WGSL emitter: the fake program never
  reported disposal (`disposed` stayed false), which the 5.0 retirement contract reports as
  `Shader program did not report disposal`; the fake's `dispose()` now sets `disposed`.
- `tests/unit/gu47/eh/root-source-shadows.test.ts`: the fake canvas `{ width, height }` is treated as a worker
  canvas (`isHtmlCanvas`; root extensions are HTML-canvas-only in 5.0), so the attached source was never read;
  the fake now has `getBoundingClientRect`.
- `tests/unit/rendering/contact-shadow-mask.test.ts` (5 cases): the ACR image has no `glslangValidator`. Same
  convention as `prd02-contact-mask-glsl.test.ts`: the compile step runs wherever glslang is installed, a
  `runIf(A3D_REQUIRE_GLSLANG=1)` case fails when it is missing, and every source assertion still runs.
- `tests/unit/contracts/impl/prd12-variants.test.ts`: already fixed after the candidate by `ed6613888`
  ("prd12 overlay resynced"); passes unchanged.

### 9e. Open — gitignored third-party corpus (not retired, not committed)

`tests/unit/environments/production-runtime-hdr-environment-corpus.test.ts` (2 cases) verifies the 14 HDRIs pinned
by the tracked `fixtures/environment-corpus/manifest.json` (Poly Haven CC0, 2k + one 8k, 202 MB; the 8k file is
134 MB, above GitHub's 100 MB per-file limit without LFS). Only the three 1k files are tracked; the rest are
ignored by `/fixtures/*`, so both cases fail in the source pass (`ENOENT …/studio_small_08_2k.hdr`). The data is
legitimately obtainable and neither three.js-derived nor a deleted feature, so neither retirement rule applies.
Owner choice: (1) track the 2k/8k files through LFS (`.gitattributes` + un-ignore, as §3a did for Khronos files), or
(2) run the case only where the corpus is present (acceptance), recorded as a deferral.

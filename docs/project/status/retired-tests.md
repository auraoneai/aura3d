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
what is tracked. Several tracked pins
(`tests/assets/corpus/gltf-corpus.manifest.json`,
`benchmarks/quality-rebuild/shared/assets.ts`,
`templates/production-*/asset-manifest.json`) record `7480f9bed391…`
(32,375,420 bytes, a local copy of unknown provenance) for the same URL. No
vitest case checks that digest; the benchmark/template pins need updating to the
canonical digest.

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

### 3b. Retired (deleted feature)

| Test / case | Reason | Replacement coverage |
|---|---|---|
| `tests/unit/apps/skyline-subject-pose-determinism.test.ts` (4 cases; file deleted) | `showcase-skyline-runner` was retired in 4.0.1 (`docs/project/showcase/apps-classification.md`); the file read `apps/showcase-skyline-runner/src/main.ts` (gone) and its ignored route probe, and already failed at collection locally. | none (route deleted) |
| `tests/unit/engine/layered-scene-composition.test.ts` › keeps the hero readable and unclipped in the shipped frame; › passes its own route gate with the composition layer active; › ships no primitive stand-in as a primary subject | Same retired Skyline route; read its ignored, non-regenerable route-primary probe. | Planner-level cases in the same file (determinism, constraints, depth layers, density, sky backdrop) remain. |
| `tests/unit/tools/head-to-head-current-aggregate.test.ts` (1 case; file deleted) | Ran `tools/head-to-head-current-aggregate/index.ts`, which was moved to `tools/_quarantine/` (`c92db9322`), and read the ignored three.js head-to-head aggregate. Already failing locally. | none (three.js comparison, independence rule) |

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

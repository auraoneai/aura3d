# 15 — Three.js comparison infrastructure audit

Scope: `benchmark/`, `benchmarks/`, `tools/compare-engines`, `tools/threejs-parity-same-scene-render`,
`tools/current-routes-threejs-parity`, `tools/flagship-visual-comparison`, `tools/muse3jsparity-*`,
`tools/head-to-head-*`, `tools/three-compat-threejs-*`, `tools/production-runtime-threejs-parity`,
`apps/threejs-parity-lab`, `.github/workflows/muse301-h2h.yml`,
`.github/workflows/external-parity-external-engine-baselines.yml`, and the retained (gitignored but
present locally) results in `tests/reports/`.

Method: read the harness source, the three-side and Aura-side scene code, the gating thresholds, and
the stored JSON results; recomputed RMSE/SSIM/mean-luma on the retained PNG pairs with ImageMagick 7.1.2
(`magick compare -metric RMSE|SSIM`, `-alpha off`); parsed GLB JSON chunks with a tiny node script.
No browser, dev server, build or test suite was run. Image *viewing* through the Read tool returned
empty output in this session, so all visual statements below are numeric (pixel sampling, SSIM,
luma), not eyeball judgments.

---

## 0. Bottom line

1. **No comparison ever looked at the 18 showcase games.** A grep for every game `appDir` from
   `tools/quality-rebuild-capture/games.json` (aura-clash-showcase, showcase-blockfall-reactor, …
   showcase-orbital-defense) across `tools/head-to-head-*`, `tools/compare-engines`,
   `tools/threejs-parity-*`, `tools/current-routes-threejs-parity`, `benchmark/`, `benchmarks/threejs`,
   `benchmarks/aura3d`, and the two "game visual" specs returns **0 hits for all 18**. The "three.js
   parity" evidence and the games are disjoint universes.
2. **The baseline is a deliberately primitive Three.js scene.** The frozen contract
   (`benchmark/context/threejs-r185.1-20260808.json` → `commonRenderContract`) is: one directional
   key (2.6, `#fff4e6`), ambient 0.35, a 1k studio HDRI "or procedural equivalent", ACES, exposure 1.
   **Shadows are explicitly disabled in every workload that mentions them** (`castShadow: false,
   receiveShadow: false` in instancing-lod, navigation-crowd, physical-character, physical-vehicle,
   skinned-morph-animation, xr-interaction; no `shadowMap.enabled` anywhere in
   `benchmark/current-head-to-head/`). No SSAO/GTAO, no SMAA/TAA, no contact shadows, no SSR, no
   fog/atmosphere, no bloom except the single `postprocessed-scene` workload. "Parity" against this
   baseline means parity with a 2012-era forward-lit Three.js scene. Even a perfect pass would look
   dated. The harness is measuring *agreement*, not *quality*.
3. **Several "parity" artifacts are fabricated or stubbed** (section 6): the three-compat "visual
   parity" screenshots are Canvas2D drawings with hard-coded `visualScore` values; the
   production-runtime parity renderers return strings; the Three.js inventory derives
   `visualStatus: "accepted"` from a hand-typed `a3dStatus: "matched"`; the foundation
   `compare-engines` visual renders are grids of colored boxes in an orthographic camera, not the
   named scenes; its threshold `maxChangedPixelRatio: 1` can never fail.
4. **Metrics are pixel-difference only.** There is no SSIM/LPIPS/FLIP anywhere in the tooling. The
   two things called "structural similarity" are `1 - meanDelta/255`
   (`tools/current-routes-threejs-parity/index.ts:357`, `tests/browser/production-runtime-threejs-parity.spec.ts:71`),
   which is just mean absolute error renamed. No metric measures detail, shadowing, contrast,
   specular richness, or aliasing — i.e., the things that make a frame look "modern".
5. **No independent human judgment exists.** `docs/project/showcase-visual-review.json` reviewer =
   `{"id":"pending-user-review","kind":"pending"}`, `overallVerdict: "needs-work"`;
   `tests/reports/threejs-parity/visual-review.json` → `independentHumanApproval: false`, issue
   "No current hash-bound review by a named human approves the final visual set". All "Personal
   inspection of the retained captures…" sentences in H2H aggregates are agent-authored text
   hard-coded in `tools/head-to-head-*/index.ts` (e.g. `tools/head-to-head-gltf-product-viewer/index.ts:31-35`),
   and at least one contradicts the pixels (section 4.2).
6. **Results *were* used to fix rendering, but only toward matching the primitive baseline**:
   sRGB→linear input conversion, matrix-to-TRS round-trip bug, "matrix-fitted ACES", RGBA16F
   tone-map source, and *removing Aura's implicit studio environment/category grade* (all recorded in
   `observedLosses` of the H2H aggregates). The loop optimized Aura to *match a flat Three.js scene*;
   it never drove adoption of shadows/AO/AA/atmosphere in the games.
7. **Frozen benchmark assets are low-detail.** The H2H "vehicle" is **792 triangles**, the "product"
   headphones **3,688 triangles**, single mesh. These are the assets the head-to-head called
   representative.
8. **three@0.185.1 is pinned and genuinely used** (root `package.json:739`,
   `benchmarks/threejs/package.json:10`, `node_modules/three/package.json` = `0.185.1`, runtime
   assertion `THREE.REVISION === "185"` in the H2H tool checks). This part is real.

---

## 1. Inventory of comparison infrastructure

| Path | What it is | Renders both engines? | Same inputs? | Metric | Gate | Verdict |
|---|---|---|---|---|---|---|
| `benchmark/current-head-to-head/<15+3 workloads>/` + `tools/head-to-head-*/index.ts` + `tests/browser/head-to-head-*.spec.ts` | Paired page, two canvases `#aura` / `#three`, real THREE.WebGLRenderer + GLTFLoader + addons | Yes | Mostly (asset sha, viewport, camera frame, key light); lighting/env/background often not | FNV hash of every 97th byte (`pixelHash`, `gltf-product-viewer/main.ts:76`); draw calls; "changed after interaction" | `pass` = both drew, asset hash matches, captures > 10 KB, interaction changed hash | **Real harness, wrong bar.** Best reusable asset in the repo |
| `tools/head-to-head-current-aggregate/index.ts` | Rolls up 15 workloads | n/a | n/a | none | all sub-`pass` + installed tarball receipt | Currently `pass: false` (2026-09-22; failing `fresh-installed-current-packages-prove-all-workloads`) |
| `.github/workflows/muse301-h2h.yml` | `workflow_dispatch` reproducer on ubuntu-24.04: `pnpm head-to-head:installed`, uploads `tests/reports/current-head-to-head/` | Yes (remote) | Same | Same | Same | Ran ≥5× successfully 2026-09-12 (run ids 34716215769, 34701703714, …). Proves reproducibility, not quality |
| `tools/compare-engines/index.ts` (2,899 lines) + `benchmarks/{aura3d,threejs,babylon}/src/scenes/*` | "Foundation" 11-scene Aura/Three/Babylon comparison | **No real scenes.** Visual renders are `objectSpecs()` grids of boxes/16×8 spheres/cylinders with orthographic camera (`index.ts:1734-1770`, `1818-1856`) | No: Aura uses `createExternalParityEnvironmentLighting`, Three uses Hemisphere 1.4 + Directional 1.6; Aura metallic 0.55/rough 0.28+, Three 0.5/0.32+; clear colors differ | changedPixelRatio (delta>2), MAE | `maxChangedPixelRatio: 1`, `maxMeanAbsoluteError: 8` (`index.ts:2110-2112`) | **Fake parity** — ratio gate can't fail; scene descriptors (asset-render, skinned-characters…) are never actually rendered; timing came "from a raw WebGL2 control that imports no engine" (its own report text) |
| `tools/threejs-parity-same-scene-render/index.ts` | Report of "same-scene" proof | n/a | n/a | none | `pass` = H2H aggregate pass && ≥1 `aura*.png` && ≥1 `three*.png` > 8,000 bytes (`index.ts:36-45`) | File-existence check labeled "same-scene render" |
| `tools/current-routes-threejs-parity/` + `benchmarks/*/src/scenes/current-routes-flagship-viewer.ts` | One flagship watch viewer, Aura vs Three, same HDRI | Yes | Asset + HDRI + camera; stage differs | meanDelta, "structuralSimilarityProxy" = `1 - meanDelta/255` | meanDelta ≤ 55, proxy ≥ 0.8 (`index.ts:132-133`) | Permissive (55/255 ≈ 22% mean error passes). `noA3DRuntimeThreeImport: true` hard-coded (`:257`). No retained report found (`tests/reports/current-routes-threejs-parity.json` absent) |
| `tools/flagship-visual-comparison/index.mjs` | Before/after of Aura showcase routes | **Aura vs Aura** (old capture vs new) — no Three.js | n/a | IM AE(3% fuzz)/MAE/RMSE after OCR text masking | none ("Difference magnitude only… manual review determines whether the change is an improvement", `:239`) | Honest but irrelevant to Three parity |
| `tools/external-parity-{pbr,product,shadow,hdr,gltf-loader}-visual-parity` | Aura vs Three vs Babylon on small fixtures | Yes | Partly | changedPixelRatio, MAE | PBR `0.82 / 64`; shadow `0.86 / 72`; HDR `0.55 / 36`; glTF loader `0.45 / 32`; product `0.15 / 8` | Thresholds set loose from first commit (`19698382`). Product (the only strict one) **fails**: ratio 0.331, MAE 19.36 vs Three |
| `tools/three-compat-threejs-visual-parity` + `tests/browser/three-compat-threejs-visual-parity.spec.ts` + `benchmarks/three-compat/shared/scenes.ts` | 13 "flagship" scenes | **Neither engine.** Canvas2D painter draws a fake "a3d", "threejs", and "diff" image | n/a | hard-coded `visualScore` 0.82–0.93 | `visualScore >= 0.85` for ≥10 scenes | **Fabricated evidence.** Still wired as `pnpm three-compat:compare-threejs` (`package.json:335`) |
| `benchmarks/production-runtime/*` + `tools/production-runtime-threejs-parity/index.ts` | "Production runtime Three.js parity" | Stub: `renderA3DScene = s => 'a3d:' + s`, `renderThreeJsScene = s => 'threejs:' + s` | n/a | `compareImages(meanDelta,maxDelta)` → `pass: meanDelta <= 18 && maxDelta <= 255` | Visual/runtime parity reports = copy of readiness `pass` (`tools/production-runtime-report-bridge/shared.ts:160`) | **Stub masquerading as evidence** |
| `apps/threejs-parity-lab/` | 33 lines total; `runProductionApp(scene, ui)` | Aura only — README: "Three.js comparison is handled by the dedicated parity milestone" | n/a | n/a | n/a | Not a parity lab |
| `tests/browser/muse3jsparity-301-visual.spec.ts` + `-visual-cases.ts` + `game-visual-superiority.spec.ts` | 7 "game feel" families (bloom, night-lighting, water-reflections, decals, sdf-text, particles, camera-game-feel) | Yes, on micro scenes (600×380, `robotcand` asset) | Yes | `clipping` (≤0.05), `replayInstability`, `reflectionProjectionError`, `glyphEdgeError`, `shadowEdgeInstability`, `footprintError`, `trajectoryProjectionError`, `temporalJerk`, `settlingError` (`-visual-cases.ts:28-35`) | per-metric max + tie tolerance | Metrics are *defect* detectors (clipping, determinism, projection) — none measures richness. Result `superiorityVerdict: "inconclusive"`, 5 ties, 1 loss (decals footprint), 1 win (sdf-text) |
| `tests/reports/muse3jsparity/head-to-head.json` | 96 instanced cubes | Yes | Yes | checksum | "no similarity threshold is asserted" | 1,152 triangles total; meaningless for quality |
| `tools/threejs-parity-threejs-inventory/index.ts` | 54 threejs.org example rows | n/a | n/a | n/a | row `matched` iff hand-typed `a3dStatus` + test file exists | `visualStatus: "accepted"` is *derived* from `a3dStatus === "matched"` (`index.ts:251-256`). All 54 accepted, no image judged |
| `.github/workflows/external-parity-external-engine-baselines.yml` | Unity/Unreal capture on `[self-hosted, unity]` / `[self-hosted, unreal]` | Never ran (`gh run list` empty) | — | — | every audit step `\|\| true` (`:111-117`, `:185-191`, `:264-297`) | Dead workflow; can never fail |
| `benchmark/runner/*`, `benchmark/workloads.json`, `benchmark/context/*`, `benchmark/scoring/`, `benchmark/runs/round-50`, `benchmark/results/aura3d-106-peer-benchmark-report.json` | Agent-authoring benchmark (10 prompts) | n/a — scores agent workflows, not renderer parity | — | — | — | Out of scope for pixels; `benchmark/README.md` itself says "not the public Three.js parity claim" |
| `benchmarks/quality-rebuild/` (untracked, new) + `tools/quality-rebuild-capture/` (untracked) | New 18-scene Aura-vs-three@0.185.1 page router (`index.html?engine=aura3d\|three&scene=…`) with 18 paired scene modules incl. `03-damaged-helmet`, `12-shadows`, `18-game-scene`, and a real-input capture script for the 18 deployed games | Being built by this rebuild | — | — | — | Created during this audit; not evaluated here beyond structure |

---

## 2. Three.js version pinning

| Location | Value |
|---|---|
| `package.json:739` (root devDependency) | `"three": "0.185.1"` |
| `benchmarks/threejs/package.json:10` | `"three": "0.185.1"` |
| `node_modules/three/package.json` | `"version": "0.185.1"` |
| `benchmark/context/threejs-r185.1-20260808.json` → `three` | version `0.185.1`, tag `r185`, npmIntegrity `sha512-5aojFC…`, releaseCommit `2431a09f…`, publishedAt 2026-07-01 |
| H2H tool check | `browser.before?.three?.revision === "185"` (`tools/head-to-head-gltf-product-viewer/index.ts:14`) |
| `tests/reports/comparison-threejs.json` → `dependencyPins` | three 0.185.1, babylonjs 7.16.1, aura `@aura3d/engine` 3.0.1, playwright 1.59.1 |

Note: `node_modules/three/examples/` contains only `jsm/` — **no `examples/textures` or
`examples/models`** (no DamagedHelmet/HDRIs from the three repo are available locally via the
package). Three's `RoomEnvironment`, `DRACOLoader`, `KTX2Loader` (`libs/basis`), `MeshoptDecoder`,
`draco` decoders are present.

The historical suite against `three@0.165.0` is still referenced as "historical"
(`docs/project/threejs-superiority-status.md`).

---

## 3. Are the same inputs really rendered in both engines?

### 3.1 current-head-to-head (the only serious harness)

What *is* matched (verified in code): asset bytes (sha256 check), viewport 1440×900 dpr 1, camera
framing via shared `computePerspectiveCameraFrame` (Three side camera copies Aura's frame,
`gltf-product-viewer/main.ts:63`), key-light direction/color/intensity, ACES + exposure 1.

What is **not** matched, from code:

| Workload | Mismatch | Evidence |
|---|---|---|
| gltf-product-viewer | Background: Aura `clearColor [0.018,0.024,0.04]` → output pixel `srgb(18,25,39)`; Three `0x05060a` → `srgb(5,6,10)` | `main.ts:24,53`; sampled corner pixels of `tests/reports/current-head-to-head/gltf-product-viewer/{aura,three}.png` |
| gltf-product-viewer | Lighting model differs: Three = PMREM env intensity **1.0** + AmbientLight 0.35 + key; Aura = env lighting with `color:[1,1,1], intensity: 0.35` (env replaced by an ambient-like term) + key | `main.ts:53` vs `main.ts:59` |
| gltf-product-viewer | Aura quality preset `hdr-studio-preview` (Aura-specific pipeline) vs plain `WebGLRenderer` | `main.ts:59` |
| primitive-scene, custom-material-shader | Aura side uses low-level `@aura3d/rendering` `Renderer` + hand-built matrices, not `createAuraApp` | `primitive-scene/main.ts:1-2,30` |
| material-lab, product-viewer, postprocess, resource-lifecycle, webgpu-tsl | Aura side uses `@aura3d/engine/advanced-runtime` / `production-runtime` — *not* the `createAuraApp` path the games use | import map in §3.2 |
| resource-lifecycle, scaffold-to-deploy | Three uses `RoomEnvironment` + `EffectComposer/OutputPass`; Aura its own procedural studio | `resource-lifecycle/main.ts:20`; aggregate text "Three remains brighter under its RoomEnvironment/EffectComposer OutputPass treatment" |
| product-configurator | Different stage geometry: "Aura presents a narrower dark plinth while Three.js presents a wider flat disc" | aggregate `observedLosses` |
| skinned-morph | Required *removing* Aura's implicit studio environment and "category grade" to match | aggregate `observedLosses` |

### 3.2 Which Aura API each H2H workload exercises

| Workload | `createAuraApp` | Aura imports |
|---|---|---|
| cinematic-architecture | yes | `@aura3d/engine` |
| digital-twin-data | yes | `@aura3d/engine` |
| instancing-lod | yes | `@aura3d/engine` |
| navigation-crowd | yes | `@aura3d/engine`, `@aura3d/navigation-recast` |
| physical-character / physical-vehicle | yes | `@aura3d/engine`, `@aura3d/physics-rapier` |
| skinned-morph-animation | yes | `@aura3d/engine` |
| smart-city | yes | `@aura3d/engine` |
| xr-interaction | yes | `@aura3d/engine`, `@aura3d/input` |
| scaffold-to-deploy | yes | `@aura3d/lean/product` |
| product-configurator | yes (+ advanced-runtime) | mixed |
| **gltf-product-viewer** | **no** | `@aura3d/assets`, `engine/advanced-runtime`, `engine/production-runtime`, `@aura3d/rendering` |
| **material-laboratory** | **no** | same as above |
| **postprocessed-scene** | **no** | `@aura3d/assets`, `engine/advanced-runtime`, `@aura3d/rendering` |
| **primitive-scene**, **custom-material-shader** | **no** | `@aura3d/rendering`, `@aura3d/scene` |
| resource-lifecycle, webgpu-tsl | no | `@aura3d/assets`, `@aura3d/rendering` |

So the *material/PBR/IBL/bloom* comparisons — the ones closest to "does it look modern" — bypass the
game path entirely. And where `createAuraApp` is used, it is configured as a flat rig, e.g.
`skinned-morph-animation/main.ts:70-87`:

```ts
createAuraApp(canvas, { renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  scene: scene().background(LIGHTING.background)
    .add(lights.ambient({ intensity: LIGHTING.ambient }))
    .add(lights.directional({ position: LIGHTING.keyPosition, intensity: LIGHTING.keyIntensity }))
    .add(model(auraAssets.showcaseAnimatedRunnerHero, { ..., castShadow: false, receiveShadow: false })) ... })
```

### 3.3 compare-engines (foundation/external-parity suite)

The named scenes (`benchmarks/shared/scenes/asset-render.ts` etc.) are only *descriptors* (workload
counts: drawCalls 24, triangles 42000, …). The visual render step ignores them and draws
`objectSpecs(scene)` — a grid of 6–72 unit boxes scaled ~0.05, colored by a hash of the scene id
(`tools/compare-engines/index.ts:1734-1770`). The Aura bundle imports
`./packages/rendering/src/index.ts` directly (internal source, `:1787`), not the public package.
Even within this toy, inputs differ (lighting rig, metallic 0.55 vs 0.5, roughness offsets 0.28 vs
0.32, clear color `[0.015,0.02,0.03]` vs `0x05070b`). Result: **changedPixelRatio = 1.0 for every
Aura-vs-Three scene** — the clear color alone differs by >2 levels on every pixel — while the gate
`maxChangedPixelRatio: 1` passes anyway.

---

## 4. Stored results — actual numbers

### 4.1 current-head-to-head (generated 2026-09-10, three r185)

Recomputed from retained PNGs (`tests/reports/current-head-to-head/<w>/`). SSIM reported by IM 7.1.2
is a dissimilarity (0 = identical); "SSIM≈" column = 1 − value. Luma = mean gray, alpha off.

| Workload / frame | RMSE (norm.) | SSIM≈ | Aura luma | Three luma | Aura/Three draws | Agent verdict |
|---|---|---|---|---|---|---|
| primitive-scene | 0.037 | **0.64** | 0.028 | 0.040 | 3 / 3 | "visible aura lighting loss" |
| gltf-product-viewer | 0.072 | **0.77** | **0.112** | **0.052** | 1 / 1 (3,688 tris) | "Aura is visibly darker" — **contradicted by pixels** (§4.2) |
| webgpu-tsl before/after | 0.22 | **0.61** | 0.072 | 0.033 | 1 / 1 | "closely aligned" (excl. labels) |
| instancing-lod (legacy aura.png) | 0.106 | 0.70 | 0.138 | 0.030 | 3 / 3 | superseded by near/far |
| instancing-lod near / far | 0.024 / 0.009 | 0.994 / 0.9995 | | | | |
| cinematic-architecture before/after | 0.014 / 0.026 | 0.997 / 0.992 | | | **1,513 / 803** | "visible aura losses" |
| digital-twin-data | 0.100 | 0.946 | 0.085 | 0.078 | **362 / 182** | |
| product-configurator before/after | 0.216 / 0.225 | 0.91 / 0.90 | | | **14 / 2** (7×) | stage differs |
| smart-city day-core | 0.175 | 0.96 | 0.74 | 0.83 | **486 / 255** | bg differs up to 17 levels |
| smart-city night-all | 0.156 | 0.84 | 0.21 | 0.10 | | |
| custom-material-shader | 0.082 | 0.984 | | | 1 / 1 | "Three brighter & more magenta, Aura darker & bluer" |
| postprocessed-scene off / on | 0.014 / 0.043 | 0.997 / 0.985 | | | 2 passes / 3 passes, 1 RT vs 13 RT | "Aura halo tighter" |
| resource-lifecycle | 0.064 | 0.94 | 0.012 | 0.029 | | Aura darker |
| scaffold-to-deploy | 0.078 | 0.96 | 0.102 | 0.143 | | Aura darker; Aura slower in 6/7 workflow phases (prod build 7,036 ms vs 2,714 ms) |
| skinned-morph | 0.006–0.013 | 0.996–0.999 | | | **40 / 20** | |
| navigation-crowd | 0.031 | 0.988 | | | 805 (later) vs 829; earlier 1,565 vs 829 | |
| physical-character / vehicle / xr | 0.007–0.018 | ≥0.995 | | | | deterministic traces equal |
| material-lab (6 states) | 0.010–0.068 | 0.990–0.998 | | | | luma ratios 0.91–1.10, p99 0.99–1.09 |

Observations:
- Very high similarity in most pairs is *because both sides are near-black frames with one unshadowed
  lit object*: mean frame luma is 0.03–0.18 (out of 1.0) for 14 of 18 workloads. A near-black frame
  dominates SSIM. These scenes would look dated in either engine.
- Draw-call losses are consistent and large: 1.9× (architecture), 2.0× (digital twin), 1.9× (smart
  city), 2.0× (skinned), 7× (configurator).
- The only quantitative *quality* gate in the whole suite is material-laboratory's acceptance policy
  ("subject mean luminance within 15% and p99 highlight energy within 20% of current Three.js";
  chrome/gold ≥3× rubber highlight range). Everything else is "both rendered something".

### 4.2 Agent-authored "personal inspection" contradicts the pixels

`tools/head-to-head-gltf-product-viewer/index.ts:33` hard-codes the loss text:
"Aura is visibly darker while Three.js is brighter". Measured on the retained captures:
Aura mean luma **0.112**, Three **0.052**; center-crop luma Aura 0.143 vs Three 0.100; background
Aura `srgb(18,25,39)` vs Three `srgb(5,6,10)`. Aura's frame is brighter overall (largely because
its background is lifted and because its env term is replaced by a 0.35 ambient). Whatever the
subject looks like, the written verdict was not derived from a measurement, and it is a string
literal in the producer, so it cannot change when pixels change. All `observedLosses` text in the
`tools/head-to-head-*/index.ts` producers has this property.

### 4.3 compare-engines / foundation (2026-09-08, `tests/reports/comparison-threejs.json`)

| scene | vs Three ratio / MAE / pass | vs Babylon ratio / MAE / pass |
|---|---|---|
| product-configurator | 1.000 / 5.47 / pass | 0.013 / 1.89 / pass |
| architecture-viewer | 1.000 / 9.32 / **fail** | 0.027 / 3.95 / pass |
| asset-render | 1.000 / 6.94 / pass | 0.018 / 2.68 / pass |
| pbr-materials | 1.000 / **13.69** / **fail** | 0.047 / 6.90 / pass |
| large-scene | 1.000 / **21.56** / **fail** | 0.076 / 10.95 / fail |
| instancing | 1.000 / 5.04 / pass | 0.012 / 1.65 / pass |
| skinned-characters | 1.000 / 5.90 / pass | 0.026 / 4.05 / pass |
| particles | 1.000 / 4.41 / pass | 0.016 / 2.49 / pass |
| editor-authored-startup | 1.000 / 3.34 / pass | 0.009 / 1.43 / pass |

`comparisonOutcomes.byCompetitor.threejs.summary`: 0 wins, 36 ties, 9 losses (bundle size loss:
Aura 1,417,922 B vs Three 731,626 B = 1.94×). Report text: "NO TIMING METRIC IS SCORED HERE…
this report's browser measurement creates a raw WebGL2 context and draws its own 3-vertex triangle,
importing no engine". `productVisualParity` / `gltfLoaderVisualParity`:
`"not-applicable-to-foundation"`.

### 4.4 external-parity visual suites (2026-07-30 … 08-04)

| suite | vs Three: ratio / MAE | threshold ratio / MAE | ok |
|---|---|---|---|
| pbr | 0.314 / 31.9 | 0.82 / 64 | true |
| shadow | 0.305 / 17.8 | 0.86 / 72 | true |
| hdr | 0.261 / 24.2 | 0.55 / 36 | true |
| gltf-loader (4 validations) | 0.12–0.26 / 7.6–28.2 | 0.45 / 32 | true |
| **product** | **0.331 / 19.36** | **0.15 / 8** | **false** |

A mean absolute error of 31.9/255 on a PBR card (12.5% per channel on average) is a large visual
difference; the suite passes only because its threshold is 64. `git log -L` shows the PBR (0.82/64)
and shadow (0.86/72) thresholds were introduced at those values in `19698382` ("chore: bulk update
across packages…") — they were never tightened.

### 4.5 muse 3.0.1 "game visual superiority" (2026-09-10)

`tests/reports/muse3jsparity/game-visual-superiority.json`: `superiorityVerdict: "inconclusive"`,
`independentReviewRequired: true`. Families: bloom tie, night-lighting tie, water-reflections tie,
**decals loss** (footprintError), sdf-text win (glyphEdgeError, clipping), particles tie,
camera-game-feel tie. The metric set (`tests/browser/muse3jsparity-301-visual-cases.ts:28-35`) is
clipping ≤5%, replay determinism, and per-family geometric errors. A flat, unshadowed, low-contrast
frame scores a perfect "tie" on clipping and determinism. These are regression guards, not quality.

### 4.6 flagship-visual-comparison (2026-08-10, Aura before vs Aura after)

| route | changed-pixel ratio | MAE (norm) | RMSE (norm) |
|---|---|---|---|
| showcase-product-configurator | 0.050 | 0.0136 | 0.057 |
| showcase-smart-city-control | 0.786 | 0.193 | 0.278 |
| showcase-cinematic-architecture | 0.147 | 0.036 | 0.099 |
| showcase-digital-twin-ops | 0.212 | 0.031 | 0.080 |

Proves the routes changed, not that they improved, and does not involve Three.js.

---

## 5. Where Aura scored poorly (consolidated)

| Area | Evidence | Magnitude |
|---|---|---|
| Draw-call efficiency on imported scenes | H2H aggregates | 1.9–2.0× more draws on architecture/digital twin/smart city/skinned; 7× on configurator |
| Product visual parity (strict gate) | `external-parity-product-visual-parity.json` | ratio 0.331, MAE 19.4 vs gate 0.15/8 → fail |
| PBR pixel agreement | `external-parity-pbr-visual-parity.json` | MAE 31.9 vs Three (vs 13.5 vs Babylon) |
| foundation PBR / large scene | `comparison-threejs.json` | MAE 13.7 / 21.6 (fail) |
| Custom shader color output | H2H custom-material-shader | "Three brighter & more magenta, Aura darker & bluer under same shader colors" |
| Background/output transform | smart-city | same clear color differs up to 17 byte levels |
| Bloom spread | postprocessed-scene | Aura halo tighter than UnrealBloom multiscale; 1 RT vs 13 |
| Decals | muse 301 | loss on footprintError |
| Bundle size | foundation | 1.94× larger (1.42 MB vs 0.73 MB) |
| Build time | scaffold-to-deploy | 7.0 s vs 2.7 s production build; slower 6/7 workflow phases |
| Shading darker under shared contract | resource-lifecycle, scaffold-to-deploy, material-lab satin/rubber/gold | luma ratio ~0.43–0.93 |
| Material emissive saturation | material-lab | Aura cyan more saturated, highlight range 31.9 vs 8.9 |
| Instancing of imported GLBs | instancing-lod | "Aura's public root instancing helper instances built-in primitives; it does not expose imported GLB mesh instancing" |

Not measured anywhere: shadows quality, AO, anti-aliasing quality, texture filtering/anisotropy,
fog/atmosphere, specular aliasing, temporal stability under motion, any game scene.

---

## 6. Fake parity — detailed

### 6.1 three-compat "visual parity" is drawn with Canvas2D
`tests/browser/three-compat-threejs-visual-parity.spec.ts:14-19` loads an HTML page whose script calls
`drawFlagshipScene(scene, "a3d"|"threejs"|"diff")` — a Canvas2D painter (`drawProduct`, `drawCar`,
`drawSphere` with radial gradients, `:145-381`). The "threejs" variant is the same drawing shifted by
18 px with slightly different gradient colors (`:82`, `three ? "#172b3f" : "#10263a"`). Then
`window.__visualScore = ${scene.visualScore}` is injected from
`benchmarks/three-compat/shared/scenes.ts:22-34`, where every scene has hand-typed
`visualScore` (0.82–0.93), `a3dFrameMs`/`threeFrameMs` (Aura always faster, e.g. 11.4 vs 15.9 ms) and
setup-line counts (Aura always fewer). `tools/three-compat-threejs-visual-parity/index.ts:20,26`
gates on `visualScore >= 0.85` for ≥10 scenes. No WebGL context, no Aura, no Three.js. Still wired
as `pnpm three-compat:compare-threejs` (`package.json:335`).

### 6.2 production-runtime parity is a string stub
`benchmarks/production-runtime/aura3d/renderScene.ts:2`:
`export function renderA3DScene(scene) { return 'a3d:' + scene; }` (Three side identical with
`'threejs:'`). `benchmarks/production-runtime/shared/compareImages.ts:2`:
`pass: meanDelta <= 18 && maxDelta <= 255` (maxDelta clause always true). The emitted
`production-runtime-threejs-visual-parity.json` and `-runtime-parity.json` simply copy
`readiness.pass` (`tools/production-runtime-report-bridge/shared.ts:160`).

### 6.3 "SSIM proxy"
`structuralSimilarityProxy = 1 - meanDelta/255` (`tools/current-routes-threejs-parity/index.ts:357`),
gated ≥0.80 there and ≥0.75 in `tests/browser/production-runtime-threejs-parity.spec.ts:71`.
That admits mean errors of 51–64 levels and has no structural component.

### 6.4 Inventory "accepted"
`tools/threejs-parity-threejs-inventory/index.ts:251-256`: `visualStatus` = `"accepted"` iff the
hand-typed `a3dStatus` is `"matched"|"exceeded"`. The only demotions are "route dir missing" and
"no test file named" (`:266-307`). All 54 rows accepted; `startupMs/firstFrameMs/fpsMedian` are
`null` for every row (`:247-250`).

### 6.5 compare-engines gates
`maxChangedPixelRatio: 1` (`tools/compare-engines/index.ts:2110`) cannot fail; visual renders are
box grids, not the scene descriptors; timing is a raw-WebGL triangle.

### 6.6 same-scene-render
"Proven" = aggregate pass + `aura*.png` and `three*.png` larger than 8,000 bytes
(`tools/threejs-parity-same-scene-render/index.ts:36-45`).

### 6.7 external baselines workflow
Unity/Unreal jobs require self-hosted runners that have never executed; every audit step ends
`|| true`, so the workflow can only go green.

### 6.8 threejs-parity-lab
`apps/threejs-parity-lab` is 33 lines that render Aura only; no Three.js code.

---

## 7. Was the comparison ever used to fix rendering?

Yes, narrowly. The H2H aggregates record defects found and fixed because the pair disagreed:

- glTF matrix-backed nodes lost in a lossy matrix→TRS round trip ("giant-facade and detached-underside
  defects", cinematic-architecture).
- sRGB→linear conversion of authored instance/material/light colors (instancing-lod, primitive-scene).
- "matrix-fitted ACES" transform adopted; root tone mapping moved to an unclamped RGBA16F source
  (skinned-morph).
- Shared HDR/ACES/linear-color corrections (digital-twin).
- A Three.js fit-pivot defect in the harness itself (physical-vehicle).
- Commits: `823ef78a add native HDR bloom head-to-head proof`, `22cdb8fa prove head-to-head workloads
  from packed 2.0 packages`, `1ea90a3e release Aura3D 3.0.0: three.js-parity game surface`, and ten
  `ci: pin head-to-head reproduction to …` commits.

But the direction of every fix was **"make Aura agree with a flat Three.js scene"**, including
*removing* Aura's implicit studio environment and category grade (skinned-morph). Nothing in the
harness ever pushed toward shadows, AO, AA, or richer lighting, because the Three.js side never had
them. And because no game route is in the harness, none of these fixes was verified in a game.

---

## 8. Human visual judgment

| Record | State |
|---|---|
| `docs/project/showcase-visual-review.json` | reviewer `pending-user-review` / kind `pending`, `overallVerdict: "needs-work"`, 7 routes, perceptual 8×8 signatures only |
| `tests/reports/threejs-parity/visual-review.json` | `pass: false`, `independentHumanApproval: false`, blocker "No current hash-bound review by a named human approves the final visual set" |
| H2H aggregate `replicationBlockers` | "Retain an independent human inspection record for the final same-scene gallery." → `comparisonComplete: false` |
| `tests/reports/manual-visual-qa/` | before/after PNGs and two diff JSONs for product-configurator, smart-city, material-asset-inspector — no reviewer identity, no rating |

There is no record anywhere of a person rating Aura frames against a modern Three.js reference.

---

## 9. Assets and HDRIs available locally for a new benchmark

### 9.1 HDRIs (all tracked in git, all 1k equirect .hdr)
| Path | Bytes | Use |
|---|---|---|
| `fixtures/environment-corpus/hdri/studio_small_08_1k.hdr` | 1,508,872 | studio/product IBL (already the H2H shared env) |
| `fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr` | 1,092,974 | outdoor daylight sky |
| `fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr` | 1,173,154 | outdoor sky |
| `fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr` | 1,714,047 | space/night |
| `fixtures/environment-corpus/manifest.json` | — | provenance |

No 2k/4k HDRIs and no indoor/interior HDRI exist. 1k is fine for PMREM IBL but too low for a visible
skybox background at 1440×900 (three.js examples typically use 2k–4k for backgrounds). Three's
`RoomEnvironment` (`node_modules/three/examples/jsm/environments/RoomEnvironment.js`) is available
as a procedural interior IBL. Recommend fetching (license-checked, Poly Haven CC0) a 2k indoor and a
2k/4k outdoor HDRI for background use.

### 9.2 glTF/GLB (parsed triangle counts)
| Path | Tris | Mats | Imgs | Extensions / anims | Suitability |
|---|---|---|---|---|---|
| `fixtures/asset-corpus/damaged-helmet.glb` | 15,452 | 1 | 5 | — | **Canonical PBR reference** (tracked) |
| `fixtures/asset-corpus/antique-camera.glb` | 20,066 | 2 | 6 | — | PBR product |
| `fixtures/asset-corpus/boom-box.glb` | 6,036 | 1 | 4 | — | PBR product (38 MB textures) |
| `fixtures/asset-corpus/clear-coat-test.glb` | 37,116 | 19 | 6 | KHR_materials_clearcoat | clearcoat |
| `fixtures/asset-corpus/sheen-test-grid.glb` | 21,646 | 19 | 1 | KHR_materials_sheen | sheen |
| `fixtures/asset-corpus/avocado.glb` | 682 | 1 | 3 | — | small PBR |
| `fixtures/asset-corpus/duck.glb` | 4,212 | 1 | 1 | — | trivial |
| `fixtures/threejs-parity/assets/vehicles/car-concept.glb` | 213,347 | 29 | 14 | clearcoat, emissive_strength, iridescence, transmission, variants, texture_transform | **best hero asset** (automotive) |
| `fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb` | 141,802 | 15 | 4 | KHR_draco_mesh_compression, 1 anim | three.js classic environment scene |
| `fixtures/threejs-parity/assets/character/soldier.glb` | 11,376 | 2 | 2 | 4 anims | three.js skinning example asset |
| `fixtures/threejs-parity/assets/character/robot-expressive.glb` | 3,237 | 3 | 0 | 14 anims, morphs | three.js animation example asset |
| `fixtures/threejs-parity/assets/materials/compare-transmission.glb` | 11,778 | 4 | 4 | KHR_materials_transmission | transmission |
| `fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb` | 2,856 | 4 | 1 | 1 anim | small vehicle |
| `tests/assets/corpus/khronos/Fox/Fox.glb` | 576 | 1 | 1 | 3 anims | low-poly skinned |
| `tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` | 4,672 | 1 | 1 | 1 anim | skinned |
| `tests/assets/corpus/ktx2/Rib_N.ktx2` | — | — | — | KTX2 normal | KTX2 path |
| `fixtures/advanced-gallery/assets/*-blender/*.glb` (fog-cathedral 94k, physics-robotics 103k, digital-twin-factory 87k, water-marina 84k, reactor 76k, ocean-observatory 59k, data-galaxy 37k, robotics-lab 34k) | 34k–103k | 9–24 | **0** mostly | emissive_strength, transmission, lights_punctual | Untextured Blender-generated scenes — flat-shaded by construction |
| `public/aura-assets/showcaseSkylineCity.2f6624cd.glb` | 350,762 | 85 | 15 | — | H2H architecture |
| `public/aura-assets/showcaseRoboticWeldingWorkcell.cb604e0c.glb` | 704,582 | 76 | 1 | 1 anim | H2H digital twin |
| `public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb` | 23,300 | 7 | 13 | 3 anims | H2H skinned |
| `public/aura-assets/showcaseHeadphones.40b1fdf7.glb` | **3,688** | 1 | 4 | — | H2H product (low) |
| `public/aura-assets/showcaseCityVehicle.15552b57.glb` | **792** | 1 | 4 | — | H2H vehicle (Atari-level) |
| `benchmark/assets/sneaker.glb` | 22,700 | 3 | 5 | KHR_materials_variants | agent benchmark product |

Not present locally: Sponza, FlightHelmet, SciFiHelmet, ABeautifulGame, ToyCar, WaterBottle,
DragonAttenuation, SheenChair, IridescenceLamp, Xbot/Michelle, Horse, ferrari.glb, three's
`examples/textures`. (`tools/advanced-gallery-assets/generate-sponza-cathedral-crop-blender.py`
generates a crop, not the Khronos asset.)

---

## 10. How existing harness pages are structured (for reuse by the 18-scene benchmark)

### 10.1 current-head-to-head pattern (recommended base)
- `benchmark/current-head-to-head/<workload>/index.html`: one page, two `<canvas>` (`#aura`,
  `#three`) 1440×900, optional interaction `<button>` (e.g. `#orbit`), `<script type="module" src="./main.ts">`.
- `main.ts`: builds both engines in the same page; constants `ASSET {id,url,sha256}`,
  `ENVIRONMENT {url,intensity,rotation}`, `VIEWPORT {width,height,dpr}`, `FRAME {...}`; Aura camera
  frame computed by `computePerspectiveCameraFrame` from `@aura3d/rendering` and *reused* to place the
  Three camera; reads pixels from both (`readPixels`), publishes
  `window.__AURA_THREE_HEAD_TO_HEAD_<W>__` state and `..._ERROR__`.
- `tests/browser/head-to-head-<workload>.spec.ts`: Playwright waits for the global, screenshots each
  canvas to `tests/reports/current-head-to-head/<w>/{aura,three}[-state].png`, writes `report.json`.
- `tools/head-to-head-<workload>/index.ts`: node post-processor → `aggregate.json` (checks + verdict).
- `tools/head-to-head-installed-reproduction` + `muse301-h2h.yml`: re-runs everything from packed
  tarballs on GitHub-hosted ubuntu-24.04 (remote — satisfies the remote-execution policy).

Weaknesses to fix when reusing: same-page dual WebGL contexts (driver/context limits, shared GPU
state), sparse FNV hash instead of a real metric, verdict text hard-coded in the producer, Aura side
often not on `createAuraApp`, background/env not matched.

### 10.2 quality-rebuild pattern (new, untracked)
`benchmarks/quality-rebuild/index.html?engine=aura3d|three&scene=<id>`: one engine per page load
(avoids dual-context interference), `import.meta.glob` routing to `aura3d/NN-*.ts` /
`three/NN-*.ts`, shared `shared/scenes.ts` spec (resolution, assets), publishes
`window.__QR_READY__` (ReadyPayload) / `__QR_ERROR__`, `capture.mjs` drives screenshots. This is the
better structure; it should absorb the H2H constants (frozen asset sha256, HDR paths) and add real
metrics (§11).

### 10.3 Shared building blocks worth keeping
- `computePerspectiveCameraFrame` (shared framing; prevents framing drift between engines).
- Asset sha256 binding (`benchmark/context/threejs-r185.1-20260808.json` → `assets`).
- `linearRgb()` helper and the explicit sRGB→linear conversion discipline.
- Masking of text/HUD by OCR + union mask (`tools/flagship-visual-comparison/index.mjs:61-117`) —
  directly reusable for game captures with HUDs.
- ImageMagick-based AE/MAE/RMSE wrappers (same file, `:119-160`).
- material-lab's luminance-ratio / p99 highlight acceptance policy — the only perceptually motivated
  numeric gate in the repo.

---

## 11. Recommendations

1. **Change the reference, not just the metric.** Each of the 18 scenes needs a Three.js side
   authored the way a competent r185 developer would ship it: `shadowMap.enabled = true` with
   `PCFSoftShadowMap`/VSM and tuned shadow camera, PMREM env at intensity 1 from a 2k HDRI, `scene.background`
   from the HDRI (or `GroundedSkybox`), `EffectComposer` with `GTAOPass`/`SAOPass` + `UnrealBloomPass`
   + `SMAAPass`/MSAA + `OutputPass`, `ACESFilmic` or `AgX`/`Neutral` tone mapping, anisotropic filtering
   16, `physicallyCorrect` light units. Then compare Aura's **default `createAuraApp` output** (no
   per-benchmark tuning) against it. This is the gap the owner sees; the current harness hides it.
2. **Aura side must use the same path the games use** (`createAuraApp` + `@aura3d/engine` defaults),
   with a second "tuned" Aura column to separate (A) renderer capability from (B) defaults.
3. **Add real perceptual metrics**: SSIM (true windowed) and FLIP or LPIPS (LPIPS can run remotely
   in Python); plus quality descriptors that don't need a reference — shadow presence (luma drop under
   occluders), local contrast / RMS contrast in subject mask, edge aliasing energy (high-frequency
   stair-step score on silhouettes), dynamic range (p1–p99 luma), saturation clipping. Report
   per-scene, never gate on "both rendered".
4. **Include the 18 games.** Capture each deployed game (real input timeline, as
   `tools/quality-rebuild-capture/games.json` now does) and pair it with a Three.js reference of the
   same game moment (at minimum a rebuilt key shot), or with a curated modern Three.js reference frame
   in the same genre for blind human ranking.
5. **Human judgment, blind and recorded.** Side-by-side A/B with randomized left/right, named
   reviewer, 1–5 rating on lighting, materials, shadows/AO, AA, overall "generation"; store hashes.
   The pending `showcase-visual-review.json` slot already exists for binding.
6. **Upgrade benchmark assets**: retire `showcaseCityVehicle` (792 tris) and `showcaseHeadphones`
   (3,688 tris) as "representative"; use `car-concept.glb` (213k, clearcoat/iridescence/transmission),
   `damaged-helmet.glb`, `littlest-tokyo.glb`, `soldier.glb`, `antique-camera.glb`; add 2k HDRIs.
7. **Delete or quarantine fabricated evidence** (§12) so it cannot be cited again.
8. **Make verdict text measured**: generate loss descriptions from metrics (e.g. "Aura subject luma
   0.64× Three") instead of string literals in producers.
9. **Run remotely**: the existing `muse301-h2h.yml` pattern (GitHub-hosted, workflow_dispatch,
   artifact upload) is the right vehicle; add GPU (non-SwiftShader) runner or Azure GPU VM for
   representative shadows/AO numbers — SwiftShader results are not representative of shading cost.

---

## 12. Delete / replace list

| Item | Action |
|---|---|
| `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tools/three-compat-threejs-visual-parity/`, `benchmarks/three-compat/*/scenes.ts` hard-coded `visualScore`/`frameMs`/setup lines, script `three-compat:compare-threejs` | Delete (fabricated) |
| `benchmarks/production-runtime/*` string-stub renderers, `compareImages`, `tools/production-runtime-threejs-parity`, `writeThreeJsParityReports` | Delete (stub) |
| `tools/compare-engines` visual-render section (box grids, `maxChangedPixelRatio: 1`), raw-triangle timing | Replace with real-scene renders or delete the visual claim |
| `structuralSimilarityProxy` in `tools/current-routes-threejs-parity` and `production-runtime-threejs-parity.spec.ts` | Replace with real SSIM/FLIP |
| `tools/threejs-parity-threejs-inventory` `visualStatus` derivation | Make `visualStatus` require a reviewed image pair |
| `tools/threejs-parity-same-scene-render` | Replace file-size check with metric presence |
| External-parity thresholds (PBR 0.82/64, shadow 0.86/72, HDR 0.55/36) | Replace with perceptual metrics; stop calling these "visual parity" |
| `.github/workflows/external-parity-external-engine-baselines.yml` | Delete or disable (no runners; `\|\| true` everywhere) |
| `apps/threejs-parity-lab` | Delete or rename (no Three.js) |
| Hard-coded `observedLosses` literals in `tools/head-to-head-*/index.ts` | Generate from measurements |

## 13. Preserve list

- three@0.185.1 pin + `benchmark/context/threejs-r185.1-20260808.json` integrity/asset-sha manifest.
- `benchmark/current-head-to-head/*` paired pages (real Three.js with official addons) and the
  `muse301-h2h.yml` remote reproducer.
- `computePerspectiveCameraFrame` shared framing.
- OCR/HUD masking + ImageMagick metric wrappers in `tools/flagship-visual-comparison/index.mjs`.
- material-laboratory luminance/highlight acceptance policy as a pattern.
- Deterministic physics/navigation adapter traces (character, vehicle, crowd) — genuinely equal.
- `benchmarks/quality-rebuild/` one-engine-per-page router (new) as the base for the 18-scene benchmark.
- Asset fixtures listed in §9.

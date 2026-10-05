# 14 — Evidence, validation and fake-parity autopsy

Branch: `aura3d-quality-rebuild/audit` · Date: 2026-10-05 · Scope: `tools/`, `tests/`, `benchmark(s)/`,
`AURA3D-VERIFICATION-MATRIX.md`, `docs/project/parity`, `docs/project/threejs-superiority-status.md`,
`.github/workflows/*`, `release-artifacts/*`.

Method: read gate source, the specs that produce their inputs, and the retained reports on disk. No
browsers, dev servers, builds or suites were run. Pixel statistics below come from a small Pillow
script run over retained PNGs in `tests/reports/current-head-to-head/*` (read-only).

---

## 0. Bottom line

1. The evidence system mostly measures whether something renders and whether labels are
   consistent. It almost never measures whether the frame looks good. Of 449 tool directories with
   code, 340 (76%) only read JSON from `tests/reports/` and check fields. They never open a browser or
   decode a pixel. Only 34 launch a browser and only 40 touch pixels at all.
2. The "visual parity vs three.js" gates that do compare pixels use thresholds too loose to tell
   shading models apart. For example, the PBR gate passes with **82% of pixels changed** and
   **mean absolute error up to 64/255** (`tools/external-parity-pbr-visual-parity/index.ts:584-587`).
   The shadow gate passes at 86% / 72 (`tools/external-parity-shadow-visual-parity/index.ts:578-579`).
   The three.js shadowmap "SSIM proxy" is `1 - meanDelta/255` and only has to reach ≥ 0.4
   (`tools/threejs-parity-shadowmap-parity/index.ts:338`,
   `tests/browser/threejs-parity-shadowmap-parity.spec.ts:78`).
3. At least one parity suite is fabricated outright. `three-compat` "Three.js visual parity" and
   "runtime parity" use visual scores, frame times and draw calls hard-coded as constants in
   `benchmarks/three-compat/shared/scenes.ts:22-34`. Their "Aura3D", "three.js" and "diff" screenshots
   are drawn with **Canvas2D gradients and arcs**. Neither engine renders anything
   (`tests/browser/three-compat-threejs-visual-parity.spec.ts:13-19, 64-100`). It is still wired into
   `package.json` → `three-compat:compare-threejs` → `three-compat:release`, and it feeds
   `tools/three-compat-broad-replacement-readiness/index.ts:16`.
4. The "54/54 three.js examples matched" matrix (`docs/project/parity/threejs/parity-matrix.md`) is
   **hand-labelled**. Every `item(..., "matched")` in `tools/threejs-parity-threejs-inventory/index.ts`
   is a literal string. `visualStatus: "accepted"` is *derived from that same label*
   (`index.ts:251-256`), not from any image review. WebXR is "matched" ×3 on one route that uses an
   **injected** XR session with a **Canvas2D preview image** (`index.ts:177-179`).
5. The honest prose is already in the reports. The gates just ignore it. Head-to-head aggregates
   against three r185 *pass* while their own verdict strings say "visible aura lighting loss" or
   "visible aura losses" (6 of 11 workloads; `tools/head-to-head-*/index.ts`, `verdict:`). The 3.0.1
   visual matrix recorded **1 win / 5 ties / 1 loss** at 600×380, yet it sets
   `superiorityTargetsMet: true`. The check is `superiorityClaims.every(...)`, which is **vacuously
   true** over whatever wins exist (`tests/browser/muse3jsparity-301-visual.spec.ts:124-129`).
6. The comparison references are themselves low-bar. The retained three.js r185 head-to-head frames
   have mean luma **7.6–22.3** and **87–99% near-black pixels**. The scenes use `AmbientLight 0.35`,
   shadows off, and no post (`benchmark/current-head-to-head/*/main.ts`). "Matching three.js" there
   means matching a dark, minimal test card. It does not mean matching modern three.js work
   (PMREM/RoomEnvironment, soft shadows, AO, AgX/Neutral tone mapping, SMAA/TAA, GTAO, bloom, SSR).
7. There is **no golden-image regression anywhere**: no `toHaveScreenshot` and no perceptual metric
   (SSIM/FLIP/LPIPS/ΔE) used as a pass criterion. The CI "visual baseline" (`pnpm test:visual` →
   `tools/visual-baseline/index.ts`) checks that one JSON *fixture* has two differing pixels and that
   `tests/visual/*` specs pass.
8. The only human-review record is a one-line "ship, no blocking visual issues" approval
   (`release-artifacts/2.0-final-visual-review-approval.json`, 2026-08-12). Two days earlier the
   machine review document said `needs-work` for all 7 routes
   (`docs/project/showcase-visual-review.json`, 2026-08-10). The 3.0.1 human review is `pending`.
9. Game "Visual QA PASS 17/17" (`AURA3D-VERIFICATION-MATRIX.md:160-203`) is defined as zero page
   errors, a non-blank canvas, and an input that changes state. The same document flags Turbo Drift
   as "washed-out grey", Courier Rush as "bloom blowout", and Aurora Lander as "mostly empty sky".
   All three still PASS.
10. The evidence apparatus is about 5× the size of the renderer. `tools/` + `tests/` = **375k LOC**
    against **73k LOC** in `packages/rendering/src`. `tests/reports` is **9.5 GB** on disk with
    ~14.7k files, but it is git-ignored (`.gitignore:43`), so only 60 files are tracked. Almost none
    of the evidence can be reproduced from the repository.

The evidence process did not cause the retro look. Doc 04/06/03 cover the renderer and its
defaults. What the evidence process did was make the retro look **invisible to the release
process**. Every gate was designed to answer "does it render, is it consistent, is the claim
bounded". None answered "is this frame competitive". When a gate did measure a quality gap, its
pass/fail ignored it.

---

## 1. Size of the apparatus

| Area | LOC (ts/tsx/js/mjs) | Notes |
|---|---:|---|
| `tools/` (449 dirs with code, 454 entries) | 126,587 | 74 `external-parity-*`, 44 `production-runtime-*`, 30 `threejs-parity-*`, 30 `three-compat-*`, 20 `head-to-head-*`, 11 `superiority-*`, 19 `animation-studio-*` … |
| `tests/unit` (660 files) | 115,694 | |
| `tests/browser` (568 files) | 116,186 | |
| `tests/visual` (13 files) | 1,876 | the only directory named "visual" |
| `benchmark/` + `benchmarks/` | 21,080 | |
| **evidence total** | **~381,000** | |
| `packages/rendering/src` | 72,910 | of which only 15 files have shader/glsl/wgsl in the name |
| `packages/engine/src` | 64,603 | |
| all `packages/` | 257,208 | |
| `apps/` | 193,749 | |
| `package.json` scripts | 560 | |
| `docs/**/*.md` | 197 files / 30,337 lines | |
| `tests/reports` on disk | 9.5 GB, 14,747 files (13,226 JSON, 5,526 PNG) | **git-ignored**; 60 tracked |
| `.github/workflows` | 22 | 9 are `muse301-*`/`*-301` release-evidence pipelines |

Largest `tests/reports` subtrees are install and scaffold workspaces, not evidence:
`create-aura3d-scaffold-smoke` 4.2 GB, `package-clean-install-workspace` 1.2 GB,
`muse3jsparity` 504 MB, `game-play-probe` 484 MB.

### 1.1 Gate taxonomy (all 449 tool dirs, classified mechanically)

Classifier: read every `.ts/.mjs/.js` in each tool directory, then flag
(a) browser launch (`chromium|@playwright|puppeteer`),
(b) reads `tests/reports`,
(c) pixel decode (`getImageData|pngjs|PNG.sync|decodePng|readPng|validatePngVisual|pixelmatch|ssim`),
(d) imports three.js.

| Class | Count | % |
|---|---:|---:|
| Report aggregators: read `tests/reports` JSON, no browser, no pixel decode | **340** | 76% |
| Launch a browser themselves | 34 | 8% |
| Decode pixels at all | 40 | 9% |
| Reference three.js at all | 44 | 10% |
| Neither reports nor browser (static source/doc/package checks) | 64 | 14% |

By family (dirs / browser / pixel): `external` 74/8/9, `production` 44/1/2, `foundation` 30/2/0,
`three(-compat)` 30/0/4, `threejs(-parity)` 30/0/16, `animation` 28/0/1, `head(-to-head)` 20/0/0,
`superiority` 11/0/0, `product` 10/0/0, `prompt` 9/0/0.

The typical gate reads `tests/reports/X.json`, which an earlier Playwright spec wrote. It checks
`pass === true`, that some arrays are non-empty, that PNGs exist and are larger than N bytes, and that
claim-boundary strings are present. Then it writes `tests/reports/Y.json`. Layers of aggregators sit on
top of each other: `superiority-*` reads `threejs-parity-*`, which reads the inventory, which is
hand-written.

### 1.2 What unit tests assert

| Pattern | Files (of 659 `tests/unit` test files) |
|---|---:|
| Read source with `readFileSync` and assert `toContain`/`toMatch` | 141 |
| Read `apps/`/`packages/`/`templates/` source text directly | 49 |
| Read `tests/reports/*.json` (assert on prior evidence) | 54 |
| Stub GL calls (`drawElements/createShader/texImage2D/createBuffer`) | 23 |
| Assert on shader source strings | 8 |

Examples of source-string tests, which survive any visual regression:
`tests/unit/apps/showcase-gameplay-regressions.test.ts:246` expects source to contain
`"const gameplayPaceMultiplier = 4"`. `:250` expects `"Speed · km/h"`.
`tests/unit/apps/threejs-parity-product-configurator-policy.test.ts:229` expects
`"materialRenderStateOverrides"`. `tests/unit/rendering/shader-library.test.ts:131` expects the
fragment to contain `textureLod(u_environmentCubeMapTexture`. This proves the string exists, not that
it is reached or looks right.

---

## 2. What the pixel gates actually check

### 2.1 Threshold table (every three.js/Babylon pixel-diff gate found)

All of these are MAE in 0–255 units and changed-pixel ratios at a 6/255 per-channel delta, unless noted.

| Gate | maxChangedPixelRatio | maxMAE | Where | Comment |
|---|---:|---:|---|---|
| external-parity PBR "visual parity" | **0.82** | **64** | `tools/external-parity-pbr-visual-parity/index.ts:584-587` | The report itself says "loose visual-diff thresholds" (`:126`) |
| external-parity shadow "visual parity" | **0.86** | **72** | `tools/external-parity-shadow-visual-parity/index.ts:578-579` | "loose screenshot-diff thresholds" (`:123`) |
| external-parity HDR "visual parity" | 0.55 | 36 | `tools/external-parity-hdr-visual-parity/index.ts:558-559` | |
| external-parity glTF loader "visual parity" | 0.45 | 32 | `tools/external-parity-gltf-loader-visual-parity/index.ts:1131-1132` | |
| external-parity product "visual parity" | 0.15 | 8 | `tools/external-parity-product-visual-parity/index.ts:644-645` | the only tight one; product turntable |
| unity/unreal "parity" | 0.03–0.40 | 3–35 | `tools/external-parity-unity-unreal-parity/index.ts:1053-1061` | no retained report on disk |
| external-parity three.js "visual parity" | "close" = channel delta **< 96** | score ≥ 58 | `tests/browser/external-parity-threejs-visual-parity.spec.ts:252-257`, `tools/external-parity-threejs-visual-parity/index.ts:61-65` | `visualScore = close% − meanDiff/6` |
| threejs-parity shadowmap | "SSIM proxy" = `1 − meanDelta/255` ≥ **0.4** | (meanDelta ≤ 153) | `tools/threejs-parity-shadowmap-parity/index.ts:338`; `tests/browser/threejs-parity-shadowmap-parity.spec.ts:78` | not SSIM; nearly impossible to fail |
| muse301 visual matrix | 8×8 luma SSIM computed | **never gated** | `tests/browser/muse3jsparity-301-visual.spec.ts:47-63` | "retained as fidelity context, never a win metric" |

How loose is MAE 64 at 82% changed? In the PBR scene, eleven spheres of radius 0.13 sit on an
orthographic frame (`:338-386`), so most of the frame is the clear colour. Aura could render every
sphere as flat unlit albedo (no specular, no IBL, no clearcoat, no transmission) and still sit
inside MAE 64. The non-blank checks (`:229-241`) only require ≥ 40 colour buckets, ≥ 0.3% edge pixels
and mean luma ≥ 20. These gates detect "the scene is missing" or "the camera is wrong". They cannot
detect "the shading is a generation behind".

The PBR gate's three.js side is not a modern reference either. It uses `HemisphereLight` +
`DirectionalLight` with **no `scene.environment` / PMREM** (`index.ts:387-435`: no `environment`,
`PMREM` or `RoomEnvironment` tokens). Metallic, clearcoat, iridescent and transmissive spheres
without an environment map are what an r100-era scene looks like. Meanwhile the Aura side gets
`createExternalParityEnvironmentLighting("studio")`. The two sides are lit differently and the
threshold absorbs the gap.

### 2.2 Non-diff "quality" scorers

| Gate | What "visual quality" means in code | Evidence |
|---|---|---|
| `external-parity-roadmap-visual-quality` | `score = resolutionScore(≥720×400 → 35) + byteScore(PNG > 35 KB → 35) + categoryScore(category string in list → 30)`; pass ≥ 72 | `tools/external-parity-roadmap-visual-quality/index.ts:15-31` |
| `external-parity-threejs-visual-parity` (aggregator) | PNG exists and is > 8 KB (diff > 2 KB); `visualScore ≥ 58`; A3D setup lines < three setup lines (setup lines are constants in the scene file, `benchmarks/external-parity/shared/threejs-visual-parity-scenes.ts:19`) | `tools/external-parity-threejs-visual-parity/index.ts:20-65` |
| `threejs-parity-same-scene-render` | Aura and three PNG pair exist and each is > 8,000 bytes | `tools/threejs-parity-same-scene-render/index.ts:38,54-55` |
| `three-compat-threejs-visual-parity` | **hard-coded** `visualScore ≥ 0.85` on constants; PNG statistics on Canvas2D drawings | §3.1 |
| `visual-baseline` (`pnpm test:visual`, CI) | fixture JSON has ≥ 2 distinct pixels; `tests/visual` Playwright passes | `tools/visual-baseline/index.ts:21-30,101-114` |
| `showcase-library/game-visual-qa.mjs` | composition only: edge occupancy ≤ 0.42, foreground ≥ 0.025, largest component ≤ 0.72, flat region ≤ 0.58, HUD readability ≥ 30 | `tools/showcase-library/game-visual-qa.mjs:167-283` |
| current-routes route-health | `status==="ready"`, `drawCalls > 0`, no console/page/response errors, canvas/screenshot non-blank | `tests/browser/current-routes-route-health.spec.ts:70-76` |

`game-visual-qa.mjs:209-233` documents that its flat-region budget was **calibrated on the current
retained frames** so that "Turbo and Blockfall … keep passing with real headroom". The thresholds
come from the status quo, not from a target look. Nothing in the game QA measures lighting, shadow
presence, AO, texture detail, specular response, tone-mapping or aliasing.

### 2.3 Reference images collected but never used

`tests/reports/_visual-critic-refs/` holds reference stills from premium indie games (Art of Rally,
Brawlhalla, Neon White, Celeste, 20 Minutes Till Dawn …), fetched by
`tools/premium-indie-reference/*.mjs`. No gate, test or tool reads them (`rg` finds only the fetch
scripts and a `package.json` entry). This is the one artifact that points at the right bar, and
nothing is attached to it.

---

## 3. Fake-parity mechanisms, with proof

### 3.1 Fabricated: three-compat "Three.js visual + runtime parity"

`benchmarks/three-compat/shared/scenes.ts:21-35` hard-codes 13 scenes, each with
`visualScore` (0.82–0.93), `a3dFrameMs`/`threeFrameMs`, `a3dDrawCalls`/`threeDrawCalls`, setup
lines, and a `largeScene` block of 50,000 instances and 250k triangles. Aura always wins frame time
(e.g. `large-scene-instancing` 11.4 ms vs 15.9 ms).

- `tests/browser/three-compat-threejs-visual-parity.spec.ts:13-19` calls `page.setContent(<canvas>)`
  and runs `drawFlagshipScene(scene, engine)`, which uses `getContext("2d")` gradients, arcs and lines
  (`:64-140`). The "three.js" variant is the same painting shifted 18 px (`engineShift = three ? 18 : …`).
  Then `window.__visualScore = scene.visualScore` (the constant), and the spec polls that it is > 0.8.
- `tests/browser/three-compat-threejs-runtime-parity.spec.ts:7-19` copies the constants into
  `window.__runtime` and asserts the length is 13.
- `tools/three-compat-threejs-visual-parity/index.ts:20-28` passes if ≥ 10 constants are ≥ 0.85.
  `tools/three-compat-threejs-runtime-parity/index.ts:16-23` passes if the constant frame times are > 0.
- Consumers: `tools/three-compat-broad-replacement-readiness/index.ts:16`,
  `tools/three-compat-completion-audit/index.ts:37`,
  `tools/three-compat-release-readiness/index.ts:39,62-64`. That last one uses the Canvas2D
  `*-a3d.png` drawings as "flagship" gallery images. Wired into
  `package.json` scripts `three-compat:compare-threejs` → `three-compat:release`.
- Grep heuristic: across all `tests/browser`, `tests/visual` and `benchmarks` files that call
  `getContext("2d")`, only this spec has ≥ 15 Canvas2D drawing calls and zero
  WebGL/renderer/package references (42 drawing calls, 0 engine refs). It survived the
  August 2026 "descriptor purge" commits (`03a3f124`…`a21e4cd8`) and the WS-3.4 compat-tree deletion
  (`ed68ec86`, "delete the compat tree that reported success without touching a GPU").

Verdict: **fabricated evidence**. Delete it.

### 3.2 Self-referential: the 54/54 "matched" three.js inventory

- `tools/threejs-parity-threejs-inventory/index.ts` holds 54 `item(...)` calls. All 54 pass the
  literal `"matched"` (the classifier finds 54 matched, 0 partial, 0 unsupported). three.js ships
  roughly 500+ examples (from knowledge; `node_modules/three@0.185.1` here has no examples index to
  count), so this is a hand-picked ~10% subset.
- `visualStatus` comes from that label: `a3dStatus === "matched" ? "accepted" : …`
  (`index.ts:251-256`). The `tests/reports/threejs-parity/visual-review.json` on disk reports
  `accepted: 54, needingReview: 0` (generated 2026-09-08).
- `tools/superiority-visual-quality/index.ts:7-9` treats `visualStatus === "accepted"` as visual
  evidence and emits `category: "graphics-and-visual-quality", decision: "parity"` when no other
  blockers exist.
- `tools/superiority-animation-fidelity/index.ts:19-21` does the same with `a3dStatus`.
- WebXR: `webxr_vr_ballshooter`, `webxr_vr_dragging` and `webxr_ar_cones` are all "matched" to one
  route, `/apps/webxr-interactions/`. The item's own prose says the route "starts **injected**
  immersive-vr …; its **Canvas2D image is an explanatory UI preview, not Aura3D rendering
  evidence**" (`index.ts:177-179`).
- WebGPU: four items (`webgpu_rtt`, `webgpu_compute`, `webgpu_materials`, `webgpu_instance_uniform`)
  are "matched" to `wow-webgpu-*` routes. 24 of the 54 rows contain "without claiming" caveats and 13
  contain "bounded". The status column ignores them.
- Rendered into `docs/project/parity/threejs/parity-matrix.md` as 22 categories with 0 partial and
  0 unsupported. The README repeats "54 selected example-level rows, all marked matched"
  (`README.md:218`, `docs/project/threejs-superiority-status.md`).

The redeeming detail: `tools/threejs-parity-visual-review/index.ts:13-23` adds a blocker when no
named human approved, so `visual-review.json.pass` is `false`. The label-derived "accepted: 54" is
still published as a statistic.

Verdict: **label-backed parity**. The matrix is an authored opinion presented as generated data.

### 3.3 Gates that pass while recording a visual loss

Head-to-head vs three r185 (`tools/head-to-head-*/index.ts`, `verdict:` field):

| Workload | Verdict string (literal, in gate source) | Gate outcome |
|---|---|---|
| gltf-product-viewer | `both-render-and-orbit-the-frozen-product-with-visible-aura-lighting-loss` | pass |
| primitive | `both-render-frozen-primitive-contract-with-visible-aura-lighting-loss` | pass |
| instancing-lod | `both-native-instance-and-switch-lod-with-visible-aura-losses` | pass |
| digital-twin-data | `both-render-and-bind-data-with-visible-aura-losses` | pass |
| cinematic-architecture | `both-render-and-interact-with-visible-aura-losses` | pass |
| product-configurator | `both-configure-the-exact-product-with-visible-rendering-differences` | pass |
| material-laboratory | `…material-quality-parity-requires-human-review` | pass |

`head-to-head-gltf-product-viewer/index.ts:13-21` lists its checks: r185 version, asset hash,
viewport, import paths (checked as source text), `drawCalls > 0`, orbit changed pixels, and PNG
> 10 KB. No check compares the two images. The `observedLosses` prose ("Personal inspection … Aura is
visibly darker", `:33-37`) is a hard-coded string, not output from a measurement.

3.0.1 visual matrix: `tests/reports/muse3jsparity/visual-matrix-301.json` (2026-09-12) gives
outcomes bloom tie, night-lighting tie, water tie, **decals loss**, sdf-text win, particles tie,
camera tie. The win metrics are `clipping` and `glyphEdgeError` on text. The spec sets
`superiorityTargetsMet = superiorityClaims.every(c => c.verdict==='win' && c.winningMetrics.length>0)`
(`:127-129`). That is true for any number of wins, including zero, because it filters to wins first.
`qualityTargetsMet` checks one bespoke metric per family against frozen maxima, for example
`shadowEdgeInstability ≤ 0.001` and `temporalJerk ≤ 0.08` (`tests/browser/muse3jsparity-301-visual-cases.ts:30-35`).
These are stability and geometry-projection metrics. None of them is about appearance. The SSIM it
computes (0.70–0.99) is never gated. The commit that landed this is titled
`efe051c0 release: complete Aura3D 3.0.1 parity contract`.

### 3.4 Lowest-common-denominator references

Retained r185 head-to-head frames (`tests/reports/current-head-to-head/*/{aura,three}.png`, 1440×900):

| Workload | Aura mean luma / %dark(<20) | three mean luma / %dark |
|---|---|---|
| primitive-scene | 7.2 / 90.4% | 10.1 / 90.4% |
| instancing-lod | 35.3 / 0.0% | 7.6 / 99.1% |
| gltf-product-viewer | 28.6 / 4.7% | 13.3 / 87.0% |
| digital-twin-data | 22.1 / 91.2% | 19.9 / 91.5% |
| cinematic-architecture | 22.6 / 90.8% | 22.3 / 89.2% |

The three.js side of these benchmarks (`benchmark/current-head-to-head/*/main.ts`) is a contract
scene. `primitive-scene/main.ts:58-61` uses ACES + `AmbientLight`. `instancing-lod/main.ts:139-143`
uses ACES + `AmbientLight("#ffffff", 0.35)`, and every Aura object there has
`castShadow: false, receiveShadow: false` (`:93-97`). Only `gltf-product-viewer/main.ts:55` uses
PMREM. No reference uses shadows + AO + bloom + AA together. A dark frame that is 90% black is easy to
"match" and teaches nothing about the look the owner is complaining about. The process never
benchmarked against threejs.org showcase-grade scenes, and the indie references in §2.3 were never
attached.

### 3.5 Harness-path versus product-path

The parity harnesses call the low-level `Renderer.create(...)` / `renderer.render({ renderItems,
environmentLighting, cameraPolicy: "identity" })` with hand-tuned lighting, for example
`createExternalParityEnvironmentLighting("studio")` in
`tools/external-parity-pbr-visual-parity/index.ts:338-386`. 15 tool/test files use
`cameraPolicy: "identity"`. In `apps/` only `apps/flagship-ibl-states` does. Outside tools/tests,
`createExternalParityEnvironmentLighting` is used by 2 apps and 2 examples. The showcase games go
through `createAuraApp` and scene kits with the engine's defaults, which are covered in doc 06. So
when a harness proves something, it proves a path the games don't take, with lighting the games
don't get.

### 3.6 Route-local and special-case implementations counted as engine capability

- Water: `apps/advanced-examples-gallery/src/showcaseShaders.ts:290-367` is a route-local GLSL
  water shader. Its "reflection" is `horizonReflection = mix(u_highlightColor, u_foamColor, 0.32) *
  horizonBand` plus a fresnel-weighted **constant colour**, with no environment or planar sample.
  The engine's `packages/rendering/src/WaterSurface.ts:83-91` says so: "no planar
  reflection/refraction targets are created or sampled … water-refraction, currently unsupported".
  Despite this, the 3.0.1 matrix has a "water-reflections: tie" family measured on
  `'two-native-cubes-and-water-plane'` (`muse3jsparity-301-visual-cases.ts:18`).
- Six app/example files ship their own `#version 300 es` / `fragmentShader` strings
  (`apps/hdr-render-target-check`, `apps/texture-anisotropy`,
  `apps/advanced-examples-gallery/src/showcaseShaders.ts`, `examples/custom-material-lab`,
  `examples/hdr-render-target-check`, `examples/external-extension-lab`). These are bespoke looks
  that inventory rows cite, not engine features an agent gets by default.

### 3.7 "Large scene" that is the gallery scene

`tests/reports/external-parity-threejs-visual-parity.json` (2026-08-03, `pass: true`):
`large-scene-performance` has `a3dDrawCalls 3, threejsDrawCalls 4, threejsTriangles 4430,
meanDifference 33.98408333333333, visualScore 84`. `gallery-scene` has the **byte-identical** numbers.
The "large-scene/performance" comparison required by
`tools/external-parity-threejs-visual-parity/index.ts:18` is a 4,430-triangle duplicate of another
scene. Mean differences of 31–39/255 across all seven scenes pass as visual scores 75–92.

### 3.8 Self-consistency checks presented as capability checks

- `threejs-parity-shadowmap-parity`: `pcfCoverage: a3d.shadowMap.pcfSamples >= 16 &&
  threejs.shadowMap.filter === "pcf-soft"` (`index.ts:119`). Both values are config the harness
  reports about itself. `shadowContactVisible` requires only |contact darkening| > 2.5 luma.
  `fakeEqualityClaimed: false` is a literal type.
- `muse301` shadow acceptance: the oracle is a fixed threshold `.03` on temporal shimmer
  (stability, not quality), and the unit test checks that the threshold string did not change
  (`efe051c0`, "rejects changed fixed threshold or oracle").
- Lineage tooling (`tools/muse3jsparity-readiness/*`, 28 files; `tools/release/*`, 39 files;
  `tools/evidence-freshness/*`) checks SHA-256 binding of reports to commits, producers and
  manifests. This is rigorous provenance for evidence that does not measure the right thing.

### 3.9 Game QA as a liveness check

`AURA3D-VERIFICATION-MATRIX.md:160-203` "Mac GPU Visual QA 17/17 PASS". Method: "evidence global
populated, canvas pixel-probed non-blank, console/page errors … 2–3 gameplay inputs sent, state
change confirmed". Screenshots went to `/tmp/qa-g*/` and were "intentionally NOT committed". The
"§41 quality floor" notes (`:192-200`) call Turbo Drift "washed-out grey, low chase camera", Courier
Rush "overexposed (bloom blowout)", and Aurora Lander "mostly empty sky". None of these fail anything.
Two routes expose no evidence global at all. Earlier lanes were marked "VERIFIED COMPLETE. No visual
QA possible in VM" (`:23`) because SwiftShader gave black canvases. Most CI browser jobs are still
`ubuntu-24.04`/`ubuntu-latest` (`.github/workflows/muse301-gallery.yml:19,47,108,137`,
`browser-matrix.yml:19`, `remote-browser-301.yml:18`), so they run software GL. Only some jobs are
`macos-14/15`.

### 3.10 Human review: a single bit, with a contradiction

- `docs/project/showcase-visual-review.json` (2026-08-10): reviewer `pending-user-review`,
  `overallVerdict: needs-work`, 7/7 routes `needs-work`.
- `release-artifacts/2.0-final-visual-review-approval.json` (2026-08-12): `decision: "ship"`,
  "approve all four flagships, all three games, AuraClash … No blocking visual issues."
- `tools/release/final-review-approval.mjs:34-55` has a schema of
  `approved | rejected` + statement. There is no rubric, no per-axis score, no side-by-side
  reference, and no required written critique. The 3.0.1 manifest status is
  `independent-human-approval-pending`, and `visual-matrix-301.json` has `independentReview: 'pending'`.

### 3.11 Pattern history: honesty passes that changed labels, not pixels

`git log` contains a long run of cleanup commits: `e2bfb402 Make examples portfolio honest`,
`d6631718 stop scoring a 3-vertex triangle as an engine comparison`,
`3a8d012b a mock device does not produce a frame time, so stop calling it one`,
`ed68ec86 delete the compat tree that reported success without touching a GPU`,
`3f84aaea … three fabrications the PRD had not recorded`, `df9cae82 remove fabricated asset capability
descriptors`, `ff7abcc9 remove simulated advanced physics descriptors`, `94da14fb replace fake
character viewer`, `ddd58139 classify … non-claim prose honestly`. Each cycle tightened **claim
wording** (boundaries, "bounded", "not universal") and deleted the worst fabrications. None of them
introduced a perceptual quality bar. The result is a repo whose docs are carefully hedged
(`README.md:105`, "no universal superiority claim") while the pass/fail machinery still cannot
fail a retro-looking frame.

On threshold loosening: `git log -S`/`-G` on the visual-parity thresholds finds them first added at
their current loose values (`19698382` bulk update, renamed through `336dd1ca`/`0fa7d680`/`ef3e078b`).
So they were never tightened and then relaxed. They started loose. One tight self-regression
threshold (`maxChangedPixelRatio: 0.01` in a route audit) was **removed** in `f44dd136 Consolidate
Aura3D docs and examples` (740 files, −71k lines). Flattened history (`336dd1ca Flatten versioned
taxonomy paths`) prevents deeper archaeology.

---

## 4. FAKE PARITY register

Verdict key: **FABRICATED** (numbers or images not produced by the engine) · **LABEL** (hand-authored
status) · **LOOSE** (real render, threshold can't discriminate quality) · **LIVENESS** (renders/no
errors only) · **HARNESS-ONLY** (works on a path games don't use) · **ROUTE-LOCAL** (special-case code)
· **MOCKED** (injected or stubbed platform) · **SELF-REF** (checks its own config/labels) · **REAL-BOUNDED**
(genuine, narrow, honest).

| # | Claimed capability | Where claimed | What really backs it | Verdict |
|---|---|---|---|---|
| 1 | 13-scene Three.js visual parity, visual scores 0.82–0.93 | `three-compat:compare-threejs`, `tools/three-compat-threejs-visual-parity` | Constants in `benchmarks/three-compat/shared/scenes.ts:22-34`; Canvas2D paintings (`tests/browser/three-compat-threejs-visual-parity.spec.ts:64-100`) | **FABRICATED** |
| 2 | Aura faster than three.js in 13 scenes (e.g. 11.4 vs 15.9 ms) | `tools/three-compat-threejs-runtime-parity` | Same constants copied into `window.__runtime` (`…runtime-parity.spec.ts:7-19`) | **FABRICATED** |
| 3 | Three.js broad replacement readiness | `tools/three-compat-broad-replacement-readiness/index.ts:16` | Consumes #1 | **FABRICATED (transitive)** |
| 4 | 54/54 three.js examples "matched", 0 partial | `docs/project/parity/threejs/parity-matrix.md`, README:218 | Literal `"matched"` in `tools/threejs-parity-threejs-inventory/index.ts` | **LABEL** |
| 5 | 54/54 visual status "accepted" | `tests/reports/threejs-parity/visual-review.json` | Derived from #4 (`inventory/index.ts:251-256`) | **SELF-REF** |
| 6 | "graphics-and-visual-quality: parity" | `tools/superiority-visual-quality/index.ts:17-22` | #5 + report-pass flags | **SELF-REF** |
| 7 | WebXR ballshooter/dragging/AR cones matched | inventory `:177-179` | Injected XR session, Canvas2D preview, one route | **MOCKED + LABEL** |
| 8 | WebGPU rtt/compute/materials/instancing matched | inventory | `wow-webgpu-*` routes; native WebGPU only on macOS runners | **LABEL** (route exists; parity not measured) |
| 9 | PBR material visual parity vs three/Babylon (11 extensions) | `tools/external-parity-pbr-visual-parity` | Real renders; MAE ≤ 64, changed ≤ 82%; three side has no environment map | **LOOSE** |
| 10 | Shadow visual parity | `tools/external-parity-shadow-visual-parity` | Real renders; MAE ≤ 72, changed ≤ 86% | **LOOSE** |
| 11 | HDR visual parity | `tools/external-parity-hdr-visual-parity` | MAE ≤ 36, changed ≤ 55%; tone-map patch scene | **LOOSE** |
| 12 | glTF loader visual parity | `tools/external-parity-gltf-loader-visual-parity` | MAE ≤ 32, changed ≤ 45% | **LOOSE** |
| 13 | Product visual parity | `tools/external-parity-product-visual-parity` | MAE ≤ 8, changed ≤ 15% on a product turntable | **REAL-BOUNDED** (keep the method) |
| 14 | Same-scene Three.js parity, 7 scenes incl. large-scene/perf | `tools/external-parity-threejs-visual-parity` | "Close" = channel Δ < 96; score ≥ 58; large-scene = gallery-scene duplicate (§3.7); setup lines constant | **LOOSE + FABRICATED (scene/LOC)** |
| 15 | Three.js shadowmap PCF parity | `tools/threejs-parity-shadowmap-parity` | Config self-reports; "SSIM proxy" ≥ 0.4 (= meanDelta ≤ 153) | **SELF-REF + LOOSE** |
| 16 | Same-scene render availability for inventory | `tools/threejs-parity-same-scene-render` | PNG pair > 8,000 bytes | **LIVENESS** |
| 17 | Roadmap visual quality | `tools/external-parity-roadmap-visual-quality` | Resolution + file size + category name score | **FABRICATED metric** |
| 18 | 15/15 r185 head-to-head workloads pass | `docs/project/threejs-superiority-status.md`, README:739 | Correctness checks; 6/11 verdict strings admit visible Aura losses; no image comparison | **LIVENESS (honestly worded)** |
| 19 | 3.0.1 visual superiority targets met | `tests/reports/muse3jsparity/visual-matrix-301.json` | 1 win (text), 5 ties, 1 loss; vacuous `.every`; SSIM ungated; 600×380 | **SELF-REF** |
| 20 | Water reflections (tie vs three) | 3.0.1 matrix family `water-reflections` | No reflection target; constant-colour horizon band (`showcaseShaders.ts`); engine says unsupported (`WaterSurface.ts:83-91`) | **ROUTE-LOCAL + LOOSE** |
| 21 | "Visual QA 17/17 PASS" for showcase games | `AURA3D-VERIFICATION-MATRIX.md:160` | Non-blank + 0 errors + input changes state; quality defects noted but not failing; screenshots in /tmp | **LIVENESS** |
| 22 | Game composition QA | `tools/showcase-library/game-visual-qa.mjs` | Composition ratios calibrated to current frames | **LOOSE (status-quo calibrated)** |
| 23 | CI visual baseline | `pnpm test:visual` → `tools/visual-baseline/index.ts` | Fixture JSON with 2 differing pixels + `tests/visual` passes; no golden images | **LIVENESS** |
| 24 | Human visual approval (2.0) | `release-artifacts/2.0-final-visual-review-approval.json` | One "ship" bit two days after a machine `needs-work` on all routes; no rubric | **REAL but uninformative** |
| 25 | IBL/prefiltered env used by PBR shader | `tests/unit/rendering/shader-library.test.ts:131,155` | Fragment source contains `textureLod(u_environmentCubeMapTexture` | **SELF-REF (string)**; see doc 04 for reachability |
| 26 | Gameplay regressions covered | `tests/unit/apps/showcase-gameplay-regressions.test.ts` | Asserts source substrings (`"const gameplayPaceMultiplier = 4"`) | **SELF-REF (string)** |
| 27 | Unity/Unreal parity | `tools/external-parity-unity-unreal-parity` (1,239 LOC) | Thresholds defined; no retained report on disk | **UNEXERCISED** |
| 28 | Superiority (animation, physics, memory, workflow) | `tools/superiority-*` | Aggregate prior report `pass` flags + inventory labels | **SELF-REF** |
| 29 | Lower authoring complexity than three.js ("setup lines") | `external-parity` & `three-compat` scenes | Constants in scene definition files, not counted from source | **FABRICATED metric** |
| 30 | Gate coverage via 560 `package.json` scripts | `package.json` | Chained aggregators; 7 scripts reference missing files (e.g. `three-compat:app-suite` → 10 deleted `*-pro.spec.ts`) | **DEAD/STALE** |

---

## 5. Capability ladder applied to the evidence system itself

| Rung | Status |
|---|---|
| exists | yes. 449 tool dirs, ~1,230 test files, 22 workflows |
| technically works | mostly. Specs run, reports are generated, hashes bind |
| public API | n/a |
| used by generated apps | no. Templates/agents get `aura3d-evidence-review` skill guidance, which sends them to route-health/non-blank/`check-deploy` (liveness) |
| good defaults | no. Default pass criteria are liveness plus loose diff |
| composes | over-composes. Aggregators of aggregators; pass/fail is many hops from a pixel |
| modern visual quality | **absent.** No metric, reference or threshold represents "modern three.js look" |
| agents know to use it | agents learned to satisfy it: claim boundaries, non-blank, hash binding |
| examples demonstrate it | the gates demonstrate dark minimal contract scenes |

---

## 6. Keep vs delete

### Keep (sound, worth building on)

- **Paired same-scene capture harnesses that render real Aura and real three.js** in one page:
  `tools/external-parity-product-visual-parity` (the only tight thresholds, 0.15 / 8),
  `tools/external-parity-pbr-visual-parity` and `…-shadow-…`/`…-hdr-…`/`…-gltf-loader-…` (keep the
  harness, replace the thresholds and the three.js reference setup),
  `benchmark/current-head-to-head/*` + `tools/head-to-head-*` (frozen r185 inputs, asset hashes,
  installed-tarball reproduction; replace the correctness-only checks).
- **Provenance and lineage tooling**: `tools/muse3jsparity-readiness/evidence-lineage.ts`,
  `tools/release/*` hash binding, and `tools/evidence-freshness`. Trimmed down, this is how quality
  evidence should be bound to commits.
- **Route-health / liveness** (`tests/browser/current-routes-route-health.spec.ts`) as a smoke gate,
  renamed so nobody mistakes it for visual QA.
- **Composition probes** (`tools/showcase-library/game-visual-qa.mjs`) as one input to a rubric.
  Re-derive thresholds from reference targets, not current frames.
- **Real GPU behaviour tests** that check specific pixels against analytic expectations
  (`tests/visual/rendering-pixels.spec.ts:62-94`, e.g. shadow < plane − 120) and the BRDF LUT
  tolerance test (`0c7b34db`, 2/255).
- **The human-review workflow shape** (`muse301-final-review.yml`, authenticated reviewer, hash-bound
  manifest). Extend it with a rubric.
- **The premium indie references** in `tests/reports/_visual-critic-refs` (move into tracked
  `benchmarks/quality-rebuild/` with licences/attribution policy) and the honest observation prose
  in the head-to-head reports.

### Delete or replace

| Target | Action | Reason |
|---|---|---|
| `benchmarks/three-compat/shared/scenes.ts`, `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tests/browser/three-compat-threejs-runtime-parity.spec.ts`, `tools/three-compat-threejs-visual-parity`, `tools/three-compat-threejs-runtime-parity`, and their uses in `three-compat-broad-replacement-readiness`, `-completion-audit`, `-release-readiness` | **Delete now** | Fabricated (§3.1) |
| `tools/external-parity-roadmap-visual-quality` | Delete | Score = resolution + bytes + category name |
| `tools/threejs-parity-threejs-inventory` status column, `parity-matrix.md`, `superiority-*` "parity" decisions | Replace with measured statuses or delete the matrix | Hand labels presented as generated |
| `setupLines` constants in `benchmarks/external-parity/shared/threejs-visual-parity-scenes.ts` and `three-compat` | Delete or compute from source | Fabricated ergonomics metric |
| `large-scene-performance` in external-parity same-scene set | Replace with a real large scene | Duplicate of gallery scene (§3.7) |
| "SSIM proxy" in `threejs-parity-*` | Replace with real SSIM/FLIP and fixed thresholds | Mislabelled metric |
| `superiorityTargetsMet` logic in `muse3jsparity-301-visual.spec.ts:127` | Fix (require ≥ N wins and no loss on an appearance metric) | Vacuous truth |
| `tools/visual-baseline` as `test:visual` | Replace with golden-image regression on GPU runners | Not a baseline |
| ~340 report-aggregator tools | Collapse to ≤ 10 aggregators; delete those whose only check is `pass === true` of another report, PNG size, or string presence | Self-referential layers, maintenance cost |
| `external-parity-unity-unreal-parity` (1,239 LOC, no report) | Delete | Unexercised |
| 141 source-substring unit tests | Triage; keep only those guarding real invariants (e.g. forbidden imports) | Tests text, not behaviour |
| 9.5 GB `tests/reports` workspaces (`create-aura3d-scaffold-smoke` 4.2 GB, `package-clean-install-workspace` 1.2 GB) | Purge locally; keep evidence in CI artifacts | Not evidence |

---

## 7. What a real quality gate needs (recommendation)

1. **Reference targets, not reference engines at their minimum.** For each showcase genre, commit
   2–3 target frames: a three.js r185 scene built *well* (PMREM env, soft shadows with proper
   bias/normalBias, GTAO/SSAO, bloom, SMAA/TAA, AgX or Neutral tone-mapping, textured PBR assets), plus
   the indie stills already collected. Store them tracked under `benchmarks/quality-rebuild/`.
2. **Perceptual metrics with discriminating thresholds** on GPU runners (macOS or a GPU VM, never
   SwiftShader for visual gates). Use FLIP or SSIM on luminance plus ΔE2000 on tone-mapped colour.
   Calibrate thresholds by checking that a known-bad frame (unlit, no shadows, no AA, ACES-off) is
   **rejected** before using them. Every gate needs a "broken control must fail" test. The muse301
   harness already does this (`brokenRejected`); extend it to appearance.
3. **Appearance feature detectors** that fail when absent from the shipped frame: shadow coverage
   under casters, AO contact darkening, specular highlight energy on metals, texture-frequency
   content (detail beyond flat albedo), edge aliasing (staircase energy), clipped/crushed ratios,
   and tone-curve histogram shape.
4. **Run on the product path.** Gates must capture the shipped `createAuraApp` route with engine
   defaults, not `Renderer.render({cameraPolicy:"identity"})` harnesses with bespoke lighting.
5. **Golden-image regression per showcase route** (`toHaveScreenshot` or an equivalent with a fixed
   GPU profile), so quality can't silently regress.
6. **Rubric-based human review**: lighting, materials, shadows/AO, AA/post, assets, composition and
   motion, each scored 1–5 against the target frame, with written critique required. Approval is
   impossible while any axis is ≤ 2.
7. **Fail on admitted losses.** If a verdict string or observation says "visible loss", the gate must
   not pass. Make `verdict` an enum consumed by pass/fail.
8. **Retain evidence in CI artifacts with hashes**, not in a 9.5 GB ignored local folder.

---

## 8. Evidence index (quick reference)

- Fabricated three-compat: `benchmarks/three-compat/shared/scenes.ts:21-35`;
  `tests/browser/three-compat-threejs-visual-parity.spec.ts:8-46,64-100`;
  `tests/browser/three-compat-threejs-runtime-parity.spec.ts:6-28`;
  `tools/three-compat-threejs-visual-parity/index.ts:20-28`;
  `tools/three-compat-threejs-runtime-parity/index.ts:16-23`; `package.json` `three-compat:compare-threejs`.
- Inventory labels: `tools/threejs-parity-threejs-inventory/index.ts:35,227-256,177-179`;
  `docs/project/parity/threejs/parity-matrix.md`.
- Loose thresholds: `tools/external-parity-pbr-visual-parity/index.ts:229-241,584-597`;
  `tools/external-parity-shadow-visual-parity/index.ts:578-589`;
  `tools/external-parity-hdr-visual-parity/index.ts:558-569`;
  `tools/external-parity-gltf-loader-visual-parity/index.ts:1131-1142`;
  `tests/browser/external-parity-threejs-visual-parity.spec.ts:240-257`;
  `tools/threejs-parity-shadowmap-parity/index.ts:119-121,338`.
- Three reference without environment: `tools/external-parity-pbr-visual-parity/index.ts:387-435`.
- Head-to-head pass-with-loss: `tools/head-to-head-gltf-product-viewer/index.ts:13-38`; verdicts in
  `tools/head-to-head-*/index.ts`; `tests/reports/current-head-to-head/aggregate.json`
  (`pass:false, comparisonComplete:false, universalScore:null`, 2026-09-22).
- Vacuous superiority: `tests/browser/muse3jsparity-301-visual.spec.ts:119-158`;
  `tests/reports/muse3jsparity/visual-matrix-301.json`.
- Liveness QA: `AURA3D-VERIFICATION-MATRIX.md:1-30,160-203`;
  `tests/browser/current-routes-route-health.spec.ts:65-77`; `tools/visual-baseline/index.ts`.
- Status-quo calibration: `tools/showcase-library/game-visual-qa.mjs:207-235`.
- Human review: `docs/project/showcase-visual-review.json`;
  `release-artifacts/2.0-final-visual-review-approval.json`; `tools/release/final-review-approval.mjs:22-75`.
- Water: `apps/advanced-examples-gallery/src/showcaseShaders.ts:290-367`;
  `packages/rendering/src/WaterSurface.ts:83-91`.
- Size: `.gitignore:43` (`tests/reports/`); `du -sh tests` = 9.6 GB.

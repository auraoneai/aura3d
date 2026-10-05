# PRD 12 — Visual Benchmark + Regression Infrastructure

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed, parallelized (revision 2026-10-05). Lane: **12 Bench/gates**. Owned paths are exactly CONTRACTS
§4.1 row 12 (listed in "Parallel execution" below): `benchmarks/` (except lane scene dirs and `motion/`),
`tools/quality-rebuild-capture/` (except `games.json`, `route-composition.mjs`, `steps/burst.mjs`), new
`tools/quality-gate/` (except `src/scorecard.ts`, `forms/`), the fabricated/label evidence families under `tools/`,
`.github/workflows/` default, `playwright*.config.ts`, `.gitattributes`, `AURA3D-VERIFICATION-MATRIX.md`, and
`docs/project/{claim-guidelines.md,parity/,threejs-superiority-status.md}`. Root `package.json` scripts, `README.md`,
`fixtures/`, `games.json` and non-owned `tools/*` are changed only through non-blocking requests (§12.3).

Parallel-execution rule for this PRD: PRD 12 is the **provider** of C-30, C-31 (schema), C-32 and C-33, and the
dispatcher of every CONTRACTS §7 checkpoint. It consumes C-05, C-10, C-22, C-24, C-27, C-28, C-29, C-34 and C-35
only through their PR 0a stubs and never waits for any other lane. CONTRACTS §8 row 12: "None. It measures other
lanes." Every acceptance item below is either standalone (passable with stubs; gates PRD 12 merges) or integrated
(evaluated at checkpoints; never blocks).

Evidence base: research `14-evidence-fake-parity.md` and `15-threejs-comparison-infra.md` (primary),
`01-history-chronology.md`, `19-claim-verification.md` (C18 and the corrected C1 count: ambient-zeroes-IBL hits 15 of 18
games), `22-benchmark-pass1-code-metrics.md` (harness fairness verified, skeptic harness fixes),
`23-benchmark-vision-judgment.md` (authoritative benchmark scores), `21-game-vision-judgment.md` (authoritative game
visual scores), `20-game-scorecards-code-pixelstats.md` (non-visual categories), `18-completeness-critic.md` §4 and Q9,
`_sections/E-debt-delete-qualitybar.md` (the Aura3D Quality Bar this PRD makes executable). Raw evidence:
`evidence/benchmark/report.json` and `<scene>-side-by-side.jpg`, `evidence/games/report.slim.json` and
`<id>-{contact,mid}.jpg` (GitHub Actions run 37289688772, `macos-14`, sha `c08d8acb`).

Rule for this PRD: a gate that cannot fail is not a gate. Every new gate must show, in CI, that it rejects a
deliberately broken control before it may block anything. Test passes, HTTP 200, non-blank canvases and green parity
matrices are liveness signals. They are never reported as quality. The release-blocking quality decision is a panel
judgment of the shipped default path against references that look current. This PRD builds the machinery that
produces that judgment, records it over time, and stops quality from silently regressing once it improves.

---

## 1. Problem statement

Aura3D renders measurably worse than three.js r185 on the same inputs, and its shipped games look like early
tech demos. The release process never registered this. Four things went wrong.

1. **The gates measured liveness and labels, not appearance.**
   - Of 449 tool directories with code, 340 (76%) only read JSON from `tests/reports/` and check fields. Only 40
     decode a pixel and only 34 launch a browser (research 14 §1.1).
   - "Visual QA PASS 17/17" means a non-blank canvas, zero console errors and an input that changed state. The same
     document calls Turbo Drift "washed-out grey", Courier Rush "bloom blowout" and Aurora Lander "mostly empty sky".
     All three pass (research 14 §3.9).
   - There is no golden-image regression anywhere: no `toHaveScreenshot` and no perceptual metric used as a pass
     criterion. `pnpm test:visual` (`package.json:251` → `tools/visual-baseline/index.ts`) checks that one fixture
     JSON has two differing pixels (research 14 §0.7).
2. **Several parity suites are fabricated, label-backed or unfailable.**
   - `three-compat:compare-threejs` (`package.json:335`, gates `three-compat:release` at `:340`) scores
     hard-coded constants. Its "Aura3D", "three.js" and "diff" screenshots are Canvas2D paintings. Neither engine
     runs (research 19 C18, confirmed by both skeptics).
   - The "54/54 three.js examples matched" matrix comes from literal `"matched"` strings. `visualStatus: "accepted"`
     is derived from that same label (`tools/threejs-parity-threejs-inventory/index.ts:251-256`).
   - `tools/compare-engines` renders grids of boxes instead of the named scenes and gates on
     `maxChangedPixelRatio: 1` (`tools/compare-engines/index.ts:2110`), which cannot fail.
   - The 3.0.1 `superiorityTargetsMet` check is vacuously true (`tests/browser/muse3jsparity-301-visual.spec.ts:127-129`).
   - The PBR and shadow "visual parity" gates pass at 82%/86% changed pixels and MAE 64/72 (research 14 §2.1).
3. **The reference was a 2012-era three.js scene.** The frozen head-to-head contract disables shadows in every
   workload that mentions them, uses `AmbientLight 0.35` and has no AO, AA pass or atmosphere. Retained three.js
   frames have mean luma 7.6–22.3 and 87–99% near-black pixels (research 14 §3.4, research 15 §0.2). The loop
   optimized Aura3D to match a flat scene, including *removing* Aura's studio environment (research 15 §7).
4. **No comparison ever looked at a game, and no human scored anything against a rubric.** A grep for all 18 game
   `appDir`s across every comparison tool returns 0 hits (research 15 §0.1). The only human record is a single
   "ship" bit two days after a machine `needs-work` on every route (research 14 §3.10).

The audit built the first two pieces of infrastructure that measure appearance:

- `benchmarks/quality-rebuild/` renders 18 scenes from one `SceneSpec` in Aura3D (public API, `createAuraApp`) and
  three@0.185.1. Research 22 verified it fair.
- `tools/quality-rebuild-capture/` plays the 18 shipped games with real input on the default URL.

Both run on `macos-14` (ANGLE Metal). Their first results:

- **Benchmark (research 23, vision-judged).** Aura3D mean 3.6/10, three.js mean 5.4/10. Only 2 of 18 scenes are
  within 0.5 points (03 helmet 6.5 vs 7.0, 11 multi-light 5 vs 5). 16 of 18 carry `major-aura3d-deficiency` or
  `implementation-bug`. The three.js scores are themselves capped at 4–7 by programmer-art scene content.
- **Games (research 21, vision-judged).** `overall_visual_quality` 1.5–4, median 3, no game at 5.
- **Performance (report.slim.json).** 15 of 18 games run below 30 fps at 1920×1080 on the runner. Deep Recovery runs
  at 0.5 fps. Only Aurora Lander (52), Vault Breakers (57) and Orbital Defense (60) are near 60.

These tools are not yet gates.

- Both jobs use `continue-on-error: true` (`.github/workflows/quality-rebuild-capture.yml:78,83,137`).
- `capture.mjs` exits non-zero only when nothing rendered at all (`benchmarks/quality-rebuild/capture.mjs:374`).
- They compute only whole-frame metrics. Whole-frame luma SSIM is ≥ 0.95 on 14 of 18 scenes even where the vision
  gap is 1–3 points. SSIM only collapses where the subject is missing (14 particles 0.558, 16 instancing 0.399;
  `evidence/benchmark/report.json`).
- There are no goldens, no masks, no rubric records, no score history and no broken-control calibration.
- In pass 1, the judges could not see the images. The Read tool returned empty for every PNG (research 22, every
  scene), so "judging" fell back to pixel statistics.

**Goal.** Make `benchmarks/quality-rebuild` (18 scenes plus the reference-tier and PRD-contributed scenes) and
`tools/quality-rebuild-capture` (18 games) the canonical, blocking quality gates:

- golden-image regression with region-masked perceptual metrics, calibrated per scene so they can fail;
- a required panel review (2 named humans plus 1 vision model) using the research 21/23 rubric, with scores tracked
  over time;
- three.js reference scenes upgraded to how a competent r185 developer ships them;
- captures taken only from the player's frame, on a GPU runner;
- deletion or quarantine of the fabricated suites and of the report-aggregator layer, and retirement of
  label/claim gates.

## 2. Evidence from current code

All paths are relative to `/Users/gurbakshchahal/platforms/aura3d`. Line numbers were checked at HEAD `3a51cba3` unless a
research file is cited.

### 2.1 The new harnesses: what they do today

| # | Finding | Location |
|---|---|---|
| H1 | Scenes are a single typed `SceneSpec` that both translators read. Resolution is fixed at 1280×720 DPR 1. Tone mapping is limited to `"aces-filmic"`. | `benchmarks/quality-rebuild/shared/types.ts:5,8,191-212` |
| H2 | `ReadyPayload` carries `capabilityLog`, `drawCalls`, `warnings`, `errors`, `loadMs` and a free-form `extra`. It has no shadow, exposure, light-unit or frame-hash fields. | `shared/types.ts:222-233` |
| H3 | One engine per page load, routed by `index.html?engine=aura3d\|three&scene=<id>`. Avoids dual-context interference. | `benchmarks/quality-rebuild/main.ts`, research 15 §10.2 |
| H4 | Metrics are whole-frame only: MAD, PSNR, luma SSIM (8×8 uniform windows, stride 4), changed-pixel ratio at Δ>16, mean luma. Computed in a browser page by Canvas2D decode. | `benchmarks/quality-rebuild/capture.mjs:157-283` |
| H5 | Exit code is 0 unless no scene produced metrics. Capture failures are "audit data". | `capture.mjs:371-374` |
| H6 | Linux falls back to SwiftShader. | `capture.mjs:80-82` |
| H7 | The three.js translator is the *contract* reference: `antialias:true`, ACES, `PCFSoftShadowMap` (deprecated in r185, silently remapped to `PCFShadowMap`, `node_modules/three/src/renderers/webgl/WebGLShadowMap.js:99-101`), PMREM, `UnrealBloomPass` only when requested, `CSM` only when requested. No AO, no SMAA/TAA, no AgX/Neutral, no contact shadows, no anisotropy setting. | `benchmarks/quality-rebuild/three/common.ts:1-10,122-160` |
| H8 | The workflow triggers on `workflow_dispatch` and on push to the audit branch only. Capture and bench steps use `continue-on-error: true`. A final step fails the job only if the capture step failed. | `.github/workflows/quality-rebuild-capture.yml:6-27,76-84,135-159` |
| H9 | Game capture uses real keyboard/pointer timelines, never `?capture=` lenses or debug hooks. Shots are **viewport** `page.screenshot` PNGs (no `fullPage`; the DOM HUD over the canvas is included). The FPS sample is a 5 s rAF trace. Default desktop viewports are `1920x1080,1280x720` plus a mobile run. | `tools/quality-rebuild-capture/README.md:3-5,58-111`; `capture-games.mjs:65,413-442,534` |
| H10 | 17 games are captured from production `https://aura3d.auraone.ai`. Orbital Defense is built from source. A source-build mode already exists (`--local-build`, `--build-only`, `--skip-build`; `buildGame()` at `capture-games.mjs:198`; workflow input `local_build_all`), but it is off by default, so a PR is never judged on its own build. | `tools/quality-rebuild-capture/README.md:13-30`; workflow `:13-17,76-84` |
| H11 | Runner GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device)`, Apple M1 (Virtual), 3 vCPU, 7 GB, `maxSamples 4`, `EXT_color_buffer_float` present. | `evidence/benchmark/report.json` environment.gpu; `evidence/games/report.slim.json` environment |
| H12 | Benchmark load times: Aura3D 1.3–13× slower than three on 14 of 18 scenes (06: 2,892 ms vs 218 ms; 13: 2,905 vs 385). Duplicate `net::ERR_ABORTED` GLB/HDR fetches on both sides. | `evidence/benchmark/report.json`; research 22 scenes 02-09 |
| H13 | Draw calls (Aura vs three) match exactly on 9 of 18 scenes (01–04, 06–08, 15, 16). Exceptions: 05 transmission 5 vs 8, 09 outdoor 35 vs 36, 10 indoor 26 vs 23, 11 multi-light 32 vs 14, 12 shadows 11 vs 16, 13 IBL-only 7 vs 5, 14 particles 1 vs 2 (Aura draws no particles), 17 large-environment 1,135 vs 2,395, 18 game 24 vs 38. | `evidence/benchmark/report.json` `engines.*.payload.drawCalls` |
| H14 | Confirmed engine bug found by the benchmark: `createProductionInstanceTransforms` builds the instance node from `{kind, primitive, ...transform}` and drops `node.size`, so instanced boxes render at unit size (scene 16). The fix is CONTRACTS R18 (lane 15, `compiler/primitives.ts`, no flag); PRD 12 re-baselines scene 16 when it lands. | `packages/engine/src/agent-api/index.ts:14748-14755` (function), `:14751` (`localNode` omits `size`); research 22 §16 |
| H15 | `benchmarks/quality-rebuild` is **not** a pnpm workspace member (`pnpm-workspace.yaml` lists only `packages/*`, `workers/*`). `@aura3d/engine` resolves to `packages/engine/src/index.ts` through the repo-root Vite alias table, so the Aura side always renders the checked-out source. | `benchmarks/quality-rebuild/package.json` `description`; `vite.config.ts:9-11` |
| H16 | Scene implementations are discovered by `import.meta.glob(["./aura3d/*.ts", "!./aura3d/common.ts"])` (same for `three/`), keyed by scene id. Any new helper file placed directly in `aura3d/` or `three/` is treated as a scene module. Subdirectories are not matched. | `benchmarks/quality-rebuild/main.ts:21-22,40-41` |
| H17 | 16 of 18 game routes read `?capture` unconditionally at boot (`new URLSearchParams(...).get("capture") === "review"`) and branch on it 395 times (rooftop 81 … turbo 0, orbital 0). The C-24 capture context (`captureFromUrl()`, provider lane 09) keeps reading `capture` in order to ignore it and warn. A "was the key read" probe would therefore fail every route on every run, with the C-24 stub and with the real provider alike. | research 16 §0 item 3 and the per-route counts; CONTRACTS C-24, C-33 semantics ("`?capture=review\|overview` forbidden in migrated routes") |

### 2.2 Whole-frame metrics do not discriminate (from `evidence/benchmark/report.json`)

| Scene | SSIM | ssimMinWindow | MAD | Vision score Aura / three (research 23) | Vision class |
|---|---:|---:|---:|---|---|
| 01-simple-geometry | 0.984 | −0.05 | 4.4 | 3.5 / 4.5 | implementation-bug (missing cylinder cap) + major shadow deficiency |
| 02-pbr-product | 0.969 | −0.42 | 4.2 | 3.5 / 6 | major (broken plinth, no shadow) |
| 05-transmission | 0.946 | −0.64 | 12.1 | 3 / 6 | implementation-bug (black glass) |
| 06-metal-roughness-sweep | 0.964 | −0.46 | 4.3 | 4 / 7 | major (rough end loses ~25% energy) |
| 07-sheen-fabric | 0.954 | −0.26 | 6.4 | 3 / 6 | implementation-bug (sheen sweep missing) |
| 08-skinned-character | 0.989 | 0.05 | 2.6 | 3.5 / 5 | major (no cast shadow) |
| 12-shadows | 0.984 | −0.83 | 7.3 | 3.5 / 5.5 | major (shadows nearly invisible) |
| 14-particles | 0.558 | −0.39 | 12.9 | 1 / 4 | missing-capability (zero particles) |
| 16-instancing | 0.399 | −0.71 | 34.2 | 2.5 / 4.5 | implementation-bug (`node.size`) |

The subject covers 5–26% of the frame in most scenes, and the rest is an identical flat background (research 22:
02 ≈ 5%, 03 ≈ 17.8%, 05 ≈ 26%, 06 ≈ 12%). Research 22 skeptics asked for region-masked metrics for 02, 03, 04, 05, 06,
07 and 08. Example: on 03 the helmet-only MAD is about 15.4, against 2.91 for the whole frame.

### 2.3 Fabricated, label-only and unfailable suites (all paths verified to exist)

| Item | What it does | Location | Research |
|---|---|---|---|
| three-compat visual/runtime parity | Hard-coded `visualScore` 0.82–0.93, frame times and draw calls. Canvas2D paintings. Gate `visualScore >= 0.85` on constants. | `benchmarks/three-compat/{shared,aura3d,threejs}/`, `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tests/browser/three-compat-threejs-runtime-parity.spec.ts`, `tools/three-compat-threejs-visual-parity/index.ts:20-28`, `tools/three-compat-threejs-runtime-parity/index.ts:16-23`; consumers `tools/three-compat-broad-replacement-readiness/index.ts:16,42`, `tools/three-compat-completion-audit/index.ts:37-38`, `tools/three-compat-release-readiness/index.ts:39-40,62-79`; scripts `package.json:335,340` | 19 C18; 14 §3.1 |
| external-parity same-scene | Pass = PNGs > 8,000 bytes, diff > 2,000 bytes, draw calls > 0 and a `visualScore >= 58`. | `tests/browser/external-parity-threejs-visual-parity.spec.ts:21-30`, `benchmarks/external-parity/shared/threejs-visual-parity-scenes.ts`; script `external-parity:compare-threejs` (`package.json:314`) | 15 §6.6 (same class as same-scene "proof") |
| production-runtime parity | `renderA3DScene = s => 'a3d:' + s`; `pass: meanDelta <= 18 && maxDelta <= 255`; reports copy `readiness.pass`. | `benchmarks/production-runtime/`, `tools/production-runtime-threejs-parity/`, `tools/production-runtime-report-bridge/shared.ts:160` | 15 §6.2 |
| compare-engines visual | Box grids instead of the named scenes. `maxChangedPixelRatio: 1`. Timing from a raw WebGL2 triangle. | `tools/compare-engines/index.ts:1734-1770,1818-1856,2110-2112` | 15 §3.3, §6.5 |
| 54/54 inventory | Literal `"matched"`. `visualStatus` derived from the label. WebXR rows backed by an injected session and a Canvas2D preview. | `tools/threejs-parity-threejs-inventory/index.ts:177-179,251-256`; `docs/project/parity/threejs/parity-matrix.md`; `README.md:218` | 14 §3.2 |
| superiority decisions | `visualStatus === "accepted"` → `decision: "parity"`. | `tools/superiority-*` (11 dirs) e.g. `tools/superiority-visual-quality/index.ts:7-22` | 14 §3.2 |
| same-scene "proof" | Pass = PNG pair larger than 8,000 bytes. | `tools/threejs-parity-same-scene-render/index.ts:36-45` | 15 §6.6 |
| "SSIM proxy" | `1 - meanDelta/255`, named `structuralSimilarityProxy`. Gated ≥ 0.8, ≥ 0.75 and ≥ 0.4. **52 files** use it (23 under `tools/`, 29 under `tests/browser/`), not 3: the `threejs-parity-*-parity` family (16 tools + 16 specs), `runtime-parity-*` specs and helpers (10 files), `tools/renderer-{animation,lighting-environment-color,pbr-gltf-correctness,postprocessing}`, `tools/webgpu-visual-parity`, `tools/current-routes-threejs-parity` + spec, `tools/production-runtime-threejs-parity-readiness` and `tests/browser/production-runtime-threejs-parity{.spec,}.ts`. Full list: `rg -l structuralSimilarityProxy tools tests`. | e.g. `tools/current-routes-threejs-parity/index.ts:357`, `tests/browser/production-runtime-threejs-parity.spec.ts:71`, `tools/threejs-parity-shadowmap-parity/index.ts:338` | 14 §2.1, 15 §6.3 |
| roadmap visual quality | Score = resolution + PNG bytes + category name. | `tools/external-parity-roadmap-visual-quality/index.ts:15-31` | 14 §2.2 |
| Unity/Unreal baselines | Self-hosted runners that never ran. Every audit step `\|\| true`. | `.github/workflows/external-parity-external-engine-baselines.yml:111-117,185-191,264-297`, `tools/external-parity-unity-unreal-parity/` (1,239 LOC) | 15 §6.7 |
| vacuous superiority | `superiorityClaims.every(...)` over filtered wins. The same flag is re-consumed by `tools/muse3jsparity-readiness/acceptance.ts:20,105` (a directory on the keep list), asserted in `tests/browser/game-visual-superiority.spec.ts:452` and fixtured in `tests/unit/tools/muse3jsparity-acceptance.test.ts:95`. | `tests/browser/muse3jsparity-301-visual.spec.ts:124-129` | 14 §3.3 |
| head-to-head verdict literals | "Personal inspection … Aura is visibly darker" is a string literal that contradicts the pixels (Aura luma 0.112 vs three 0.052). | `tools/head-to-head-gltf-product-viewer/index.ts:35-36` (20 `tools/head-to-head-*` dirs) | 15 §4.2 |
| status-quo-calibrated game QA | Flat-region budget measured on the current retained frames and set so one known-bad frame (Skyline pre-fix) fails while Turbo and Blockfall "keep passing with real headroom". No reference frame, so it cannot say what good looks like. | `tools/showcase-library/game-visual-qa.mjs:205-235` | 14 §2.2 |
| liveness as visual QA | "Mac GPU Visual QA 17/17 PASS" in the header (`:6-12`), a `Visual QA` column in every lane table (`:16,27,46`, …) and the section at `:161-207`. | `AURA3D-VERIFICATION-MATRIX.md` | 14 §3.9 |
| CI visual baseline | Fixture JSON with 2 differing pixels. Runs on `ubuntu-latest` (software GL). | `tools/visual-baseline/index.ts:21-30,101-114`; `.github/workflows/browser-matrix.yml:19,101` | 14 §2.2 |
| apps/threejs-parity-lab | 33 lines, Aura only. | `apps/threejs-parity-lab/` | 15 §6.8 |

### 2.4 Assets worth keeping (verified)

- `tests/visual/rendering-pixels.spec.ts:62-94`: analytic pixel checks, for example shadow < plane − 120 (research 14 §6).
- Human-review workflow shape: `.github/workflows/muse301-final-review.yml` and
  `tools/release/final-review-approval.mjs:22-75` (authenticated reviewer, hash-bound manifest). It has no rubric
  today.
- `tools/flagship-visual-comparison/index.mjs:61-160`: OCR/HUD masking and ImageMagick AE/MAE/RMSE wrappers
  (research 15 §10.3).
- Premium-indie reference stills: `tests/reports/_visual-critic-refs/` (Art of Rally, Brawlhalla, Neon White,
  Celeste, 20 Minutes Till Dawn, …), fetched by `tools/premium-indie-reference/*.mjs`. These are copyrighted game
  screenshots in an ignored folder. Nothing reads them.
- three r185 addons present locally: `GTAOPass`, `SAOPass`, `SSAOPass`, `SMAAPass`, `TAARenderPass`, `SSRPass`,
  `OutputPass`, `UnrealBloomPass`, `RoomEnvironment`, `GroundedSkybox`, `Reflector`, `Sky`
  (`node_modules/three/examples/jsm/{postprocessing,environments,objects}/`).
- HDRIs available: three 1k equirects (`fixtures/environment-corpus/hdri/{studio_small_08,autumn_field_puresky,kloppenheim_06_puresky}_1k.hdr`).
  No 2k/4k and no interior HDRI (research 15 §9.1).
- Hero assets available: `fixtures/threejs-parity/assets/vehicles/car-concept.glb` (213k tris; clearcoat, iridescence,
  transmission), `fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb` (142k, Draco, 1 animation),
  `fixtures/asset-corpus/{damaged-helmet,antique-camera,boom-box}.glb`, `fixtures/threejs-parity/assets/character/soldier.glb`
  (research 15 §9.2).

### 2.5 Process evidence

- 562 of 1,207 commits (47%) are evidence/claims/gates/receipts/PRD/amendment commits. Only 6.9% touched rendering
  source (research 01 §1).
- At least eight "parity"/"world-class" pushes were each followed by an audit that found the claims false. "The fix
  for each failure was another evidence layer, not better pixels" (research 01 §0.2).
- `package.json` holds 560 scripts: 77 `verify:*`, 53 `check:*`, 22 `external-parity:*`, 20 `head-to-head:*`,
  17 `threejs-parity:*`, 12 `superiority:*`, and only 10 `renderer:*` (research 01). 7 scripts reference missing
  files (research 14 §4 #30).
- `tests/reports` is 9.5 GB, git-ignored, with 60 tracked files, so almost no evidence is reproducible
  (research 14 §0.10).
- The 1.0-era bar was amended 25 times in 13 failing rounds (research 01 row 3, via `_sections/E`).
- The repository is **public** (`gh repo view` → `auraoneai/aura3d`, `PUBLIC`). Hosted `macos-14` minutes are free.
  Copyrighted reference stills must not be committed. Workflows that run on `pull_request` may not use secrets.
- Two workflows can publish packages: `.github/workflows/release.yml` (a manual "legacy repack" workflow; its own
  header says 3.0.1 shipped through the exact-plan coordinator) and `.github/workflows/muse301-publish.yml`. A release
  gate that wires only one of them can be bypassed through the other.
- Repo TypeScript imports carry no `.ts` extension (commit `45955a0d`), so `node --experimental-strip-types` cannot
  run multi-file tools. Multi-file tools run through `pnpm exec tsx --tsconfig tsconfig.base.json`, as the existing
  scripts do.

## 3. Root cause

1. **Gates encoded "does it render, is the claim bounded", never "is the frame competitive".** No metric, reference
   or threshold represents a modern look (research 14 §5). Where a gate did measure a gap, its pass/fail ignored it
   (head-to-head verdicts that admit losses still pass).
2. **No gate was required to fail on a known-bad input.** Thresholds started loose (`19698382`). One tight threshold
   was removed (`f44dd136`). Game QA was calibrated on the current frames. Without a broken-control test, any
   threshold can be set to pass.
3. **References were chosen at their minimum.** Matching a dark, unshadowed three.js test card is easy. Fixes then
   moved Aura3D toward that card.
4. **Evidence came from a different frame than the player sees.** Harnesses used `Renderer.render({cameraPolicy:"identity"})`
   with bespoke lighting (15 tool/test files), and 16 of 18 games stage a different look under `?capture=review`
   (research 16 §3). So evidence proved paths the games do not take.
5. **Software GL in CI.** Most browser jobs run on `ubuntu-latest`/SwiftShader, which produced black canvases and
   "No visual QA possible in VM" (research 14 §3.9). Visual gates therefore ran on whatever rendered, not on a GPU.
6. **Aggregators of aggregators.** Pass/fail sits many JSON hops from a pixel. A literal `"matched"` at the bottom
   becomes "graphics-and-visual-quality: parity" at the top.
7. **No persistent record.** Without tracked scores per round, regressions and improvements could not be seen, and
   claims could be rewritten in later commits.

## 4. Affected packages

| Package / area | Change |
|---|---|
| `benchmarks/quality-rebuild` (private package, not a pnpm workspace member; resolves `@aura3d/*` to source via root Vite aliases, H15) | Becomes the canonical renderer gate: scene registry, reference tiers, mask pass, broken-control variants, goldens, frame strips |
| `tools/quality-rebuild-capture` | Becomes the canonical game gate: PR-build mode (existing `--local-build` made the PR default), deterministic scenario stills, frame strips, shot-level masks for HUD, capture-branch differential probe, GPU timing |
| new `tools/quality-gate` (TypeScript orchestration + Python metrics, not published) | Metrics, calibration, golden store, verdict engine, rubric records, score history, report renderer |
| `@aura3d/engine` | No PRD 12 edit outside its lane barrel. PRD 12 registers the two C-31 sections it owns (`appliedLook`, `frameTiming`, assembled from other lanes' sections) from `packages/engine/src/lanes/prd12.ts` through `registerDiagnosticsSection` (seam `app/diagnostics.ts`, PR 0b-1). All other diagnostics keys are implemented by their owners (C-31 key table) and read as `null` until then |
| `@aura3d/game` (lane 09 package) | Read-only consumer of C-24 (`window.__AURA3D_GAME__` beacon, scenario query `?scenario=&seed=&freezeAt=&cameraPose=`). Built against the PR 0a stub; no PRD 12 edits in `packages/game/` |
| `.github/workflows` | Rewrite `quality-rebuild-capture.yml` into a gate; delete `external-parity-external-engine-baselines.yml`; remove `pnpm test:visual` from `browser-matrix.yml`; retire `muse301-*` jobs that run deleted tools; add the release-gate precondition to **both** publishing workflows (`release.yml`, `muse301-publish.yml` or its successor) |
| `tools/*` evidence families | Delete or quarantine the fabricated/label/aggregator dirs that §4.1 assigns to 12 (§2.3, §10.2); the classifier output for non-owned `tools/*` dirs goes to lanes 15/13 as requests |
| `docs/project/{parity/,threejs-superiority-status.md,claim-guidelines.md}`, `AURA3D-VERIFICATION-MATRIX.md` | Remove parity/quality claims backed by deleted gates; relabel liveness as liveness |
| root `package.json`, `README.md` (lane 15) | Script deletions (560 → ≤ 80), `test:visual` replacement and the README:218 claim removal are filed as `root-manifest` / `qr-request` issues (Q-15-1, Q-15-2); never edited by this lane |

## 5. Affected files and directories

New (helpers go in `three/lib/` and `aura3d/lib/` so the `./three/*.ts` / `./aura3d/*.ts` scene globs in `main.ts`
never pick them up as scenes, H16):

```
benchmarks/quality-rebuild/shared/registry.ts        scene registry with owner, tier, purpose, masks, broken controls
benchmarks/quality-rebuild/shared/reference.ts       ReferenceProfile ("contract" | "showcase") definitions
benchmarks/quality-rebuild/shared/fetch-once.ts      module-level Map<url, Promise<ArrayBuffer>> used by both engines
benchmarks/quality-rebuild/three/lib/showcase.ts     well-built three.js r185 reference pipeline (section 9.1)
benchmarks/quality-rebuild/three/lib/mask.ts         object-id / shadow-receiver / sky / metal / edge mask passes
benchmarks/quality-rebuild/three/lib/contact-shadows.ts  contact-shadow helper ported from the r185 webgl_shadow_contact example
benchmarks/quality-rebuild/three/lib/variants.ts     three-side broken-control variants
benchmarks/quality-rebuild/aura3d/lib/variants.ts    broken-control and diagnostic variants (Aura side, public API only)
benchmarks/quality-rebuild/scenes/prd12/index.ts     PRD 12 lane scene index (created empty by PR 0a; C-30): ref-01..06 specs + prd12-skinned-character-walk
benchmarks/quality-rebuild/aura3d/scenes/prd12/ref-0{1..6}-*.ts   Aura side of the showcase scenes (section 9.3; ids prd12-ref-0N-<slug>)
benchmarks/quality-rebuild/three/scenes/prd12/ref-0{1..6}-*.ts    three.js side of the showcase scenes (section 9.3)
benchmarks/quality-rebuild/sentinels.json            6 flag-off sentinel scene ids for the CONTRACTS §6.1 identity check (stub from PR 0a; PRD 12 keeps it current)
benchmarks/quality-rebuild/shared/contracts.ts       C-30 frozen types (PR 0a); PRD 12 adds only CCR-approved optional fields
benchmarks/quality-rebuild/goldens/manifest.json     tracked golden index (sha256, round, approval record id)
benchmarks/quality-rebuild/goldens/**.png            Git LFS (approved Aura frames + masks)
benchmarks/quality-rebuild/history/index.jsonl       one line per scored round per item (tracked)
benchmarks/quality-rebuild/history/rounds/<round>.json  full panel records (tracked, no images)
benchmarks/quality-rebuild/history/baselines/3.0.1-detectors.json  detector numbers on the 3.0.1 baseline (T1.12)
benchmarks/quality-rebuild/history/calibration-baseline.json       frozen judge-calibration baseline (T4.5)
benchmarks/quality-rebuild/refs/manifest.json        reference-still index: sha256, licence, storage URI (no copyrighted pixels in git)
benchmarks/quality-rebuild/refs/canary-01.png        in-repo vision-judge canary frame (T4.3)
tools/quality-gate/package.json                      private, "type":"module" (not a workspace member, like benchmarks/quality-rebuild); holds the quality:* scripts so no root-manifest change is needed to run them (CONTRACTS §4.4)
tools/quality-gate/src/contracts.ts                  C-32 frozen rubric/judgement/verdict types (PR 0a); re-exported by src/types.ts
tools/quality-gate/root-manifest-pending.json        script paths whose removal is filed with lane 15 (Q-15-1) and not yet merged; read by scripts.test.ts
tools/quality-gate/src/cli.ts                        subcommands: gate | calibrate | report | classify-tools | propose-golden
tools/quality-gate/src/types.ts                      schemas (section 7)
tools/quality-gate/src/calibrate.ts                  noise floor + broken-control separation
tools/quality-gate/src/golden.ts                     golden store read/write/approve
tools/quality-gate/src/verdict.ts                    gate evaluation, enum verdicts
tools/quality-gate/src/rubric.ts                     rubric templates (research 21/23), record validation
tools/quality-gate/src/history.ts                    append/score trend
tools/quality-gate/src/report.ts                     HTML + $GITHUB_STEP_SUMMARY renderer
tools/quality-gate/src/judge-prism.ts                vision-model judge via Kiro Prism /v1/messages (opt-in)
tools/quality-gate/src/classify-tools.ts             mechanical classifier for tools/ and benchmarks/ (aggregator detection)
tools/quality-gate/metrics/requirements.lock         pinned + hashed Python deps
tools/quality-gate/metrics/metrics.py                FLIP, SSIM (Gaussian, MS), LPIPS, ΔE2000, region stats, detectors
tools/quality-gate/metrics/test_metrics.py           pytest
tests/unit/quality-gate/*.test.ts                    vitest for TS modules (matched by the root vitest include tests/unit/**/*.test.ts; lane 12 by the creator rule)
tests/unit/contracts/impl/prd12-*.test.ts            real-implementation conformance for C-30..C-33 (lane-generic path)
tools/quality-rebuild-capture/steps/strip.mjs        C-33 step plugin `strip` (12 frames)
tools/quality-rebuild-capture/steps/webm.mjs         C-33 step plugin `webm` (5 s)
tools/quality-rebuild-capture/games.prd12.json       PRD 12 overlay (scenarios, hudSelectors, keyboardHintSelectors) merged under games.json; games.json (lane 14) wins per field
packages/engine/src/lanes/prd12.ts                   lane barrel: registerDiagnosticsSection("appliedLook" | "frameTiming") (C-31)
playwright.quality-gate.config.ts                    macos-14 GPU-guarded config for the moved analytic pixel specs (T3.9)
.github/workflows/quality-gate.yml                   PR/main gate (no secrets)
.github/workflows/quality-checkpoint.yml             cron 00:00 UTC Thursday: CONTRACTS §7 checkpoint dispatch (flags all/none, leave-one-out on G-PANEL rounds)
.github/workflows/quality-review.yml                 panel round (workflow_dispatch, environment-protected)
.github/workflows/quality-devices.yml                real-device lane (Phase 5)
```

Changed:

```
benchmarks/quality-rebuild/main.ts                   read shared/registry.ts; route &profile=, &variant=, &pass=mask, &dpr=
benchmarks/quality-rebuild/shared/types.ts           SceneSpec/ReadyPayload extensions (section 7.1)
benchmarks/quality-rebuild/shared/scenes.ts          registry fields on base scenes 01-18 only (lane scenes live in scenes/prdNN/, C-30)
benchmarks/quality-rebuild/three/common.ts           PCFShadowMap explicit; use fetchOnce; contract tier only
benchmarks/quality-rebuild/aura3d/common.ts          record applied exposure/shadow/light units; use fetchOnce
benchmarks/quality-rebuild/capture.mjs               multi-pass capture (frame, mask, variants, strips); repeat runs; strict exit
benchmarks/quality-rebuild/ci.sh                     LFS include list for new assets/goldens; metrics hand-off
tools/quality-rebuild-capture/capture-games.mjs      --pr-build default on PRs, scenario stills, canvas-only crops, differential capture probe, GPU timing, --strict; merges games.prd12.json
tools/quality-rebuild-capture/games.schema.json      C-33 schema (PR 0a, all optional): scenarios[], hudSelectors[], keyboardHintSelectors[], captureContractMigrated, qrFlags[]
.github/workflows/quality-rebuild-capture.yml        becomes reusable workflow_call capture job (sharded); keeps the C-33 `qr_flags` / `strict` inputs
.github/workflows/browser-matrix.yml                 remove `pnpm test:visual` (line 101)
.github/workflows/release.yml, muse301-publish.yml   release-gate precondition (T5.7)
.gitattributes                                       LFS rule for benchmarks/quality-rebuild/goldens/**/*.png
AURA3D-VERIFICATION-MATRIX.md                        "Visual QA" → "Liveness"; remove PASS-as-quality language
```

Requested from other lanes (never edited by PRD 12; §12.3):

```
package.json (15)                                    root-manifest batch: script deletions, test:visual → quality:gate, quality:* aliases (Q-15-1)
README.md (15)                                       remove 54/54 and parity claims (line 218 and related) (Q-15-2)
tools/quality-rebuild-capture/games.json (14)        scenarios[], hudSelectors[], keyboardHintSelectors[], captureContractMigrated per game (Q-14-1)
fixtures/environment-corpus/hdri/ (15 path; admission 05)  2k CC0 studio/outdoor/night HDRIs via C-17 admission (Q-05-1)
```

Deleted or quarantined: see §10.2 (exact list).

## 6. Architecture proposal

### 6.1 Three gate types, one evidence record

```
                 ┌──────────────── capture (macos-14, ANGLE Metal, real GPU) ───────────────┐
 SceneSpec ──▶   benchmarks/quality-rebuild   → frame.png, mask.png, variants/*.png, strip/*.png, ready.json
 games.json ─▶   tools/quality-rebuild-capture → shots/*.png (player frame), scenario/*.png, strip/*.png, run.json
                 └───────────────────────────────────────────────────────────────────────────┘
                                         │ artifact (lossless PNG, sha256-bound)
                                         ▼
                 tools/quality-gate/metrics (ubuntu, CPU, Python) → metrics.json per item
                                         │
           ┌─────────────────────────────┼──────────────────────────────┐
           ▼                             ▼                              ▼
  G-REG  regression gate        G-REF  reference-gap gate        G-PANEL  panel review
  Aura vs approved Aura golden  Aura vs three (contract and      2 named humans + 1 vision model,
  region-masked FLIP/SSIM/ΔE    showcase), region metrics +      research 21/23 rubric, blind A/B,
  thresholds calibrated per     appearance detectors; trend +    calibration set; release-blocking;
  scene; blocks PRs             release-blocking at bar R1–R3    tracked in history/
           └─────────────────────────────┴──────────────────────────────┘
                                         ▼
                 EvidenceRecord (commit sha, run id, runner image, GPU string, asset hashes, verdict enums)
```

- **G-REG (regression)** answers one question: did this change make an already-approved frame worse? It compares
  Aura to Aura, so it never certifies the first frame as good. It blocks PRs.
- **G-REF (reference gap)** tracks how far Aura is from three.js on the same input, per region, using appearance
  detectors. It blocks a release when bar items R1–R3 fail (`_sections/E`). On PRs it reports only.
- **G-PANEL (panel)** is the only quality decision. It is required for a release, for every golden update and for
  every public quality claim.

### 6.2 Reference profiles (fix the 2012 baseline)

Every benchmark scene declares a `referenceProfile`:

- **`contract`**: today's 18 scenes, unchanged in content. Same inputs on both sides, used to prove fairness and to
  attribute defects ("Aura drops the cylinder cap"). three.js is configured exactly as the spec says. Fixes from the
  research 22 skeptics:
  - `PCFShadowMap` set explicitly instead of the deprecated `PCFSoftShadowMap`;
  - the duplicate `ERR_ABORTED` fetches deduplicated;
  - a `ReadyPayload` written next to each PNG.
- **`showcase`**: the same scene content plus every scene in `ref-01..ref-06`, with three.js built the way a
  competent r185 developer ships it.

  | Area | three.js setting |
  |---|---|
  | Renderer | `WebGLRenderer({ antialias: true })` at `setPixelRatio(min(devicePixelRatio, 2))` (capture at DPR 1 and DPR 2) |
  | Shadows | `shadowMap.type = PCFShadowMap` with a tuned shadow camera, `bias`/`normalBias`, `mapSize` 2048, `shadow.radius` 2–4; `VSMShadowMap` where the soft look fits |
  | IBL and background | PMREM environment at intensity 1 from a 2k HDRI; `scene.background` from the HDRI, or `GroundedSkybox` outdoors |
  | Post chain | `EffectComposer`: `RenderPass` → `GTAOPass` → `UnrealBloomPass` (only scenes with emissives > 1.0) → `SMAAPass` → `OutputPass` |
  | Tone mapping | `AgXToneMapping` or `NeutralToneMapping`, chosen per scene and recorded |
  | Textures | `anisotropy = renderer.capabilities.getMaxAnisotropy()` on all textures |
  | Product scenes | Contact shadows ported from the r185 `webgl_shadow_contact` example (depth silhouette + H/V blur; not an addon class, §9.1) |

  The Aura side of a `showcase` scene uses **engine defaults plus the scene's high-level intent only**: `createAuraApp`,
  `scene()`, `model()`, `environments.hdri()`, `lights.*`, and the C-27 quality tier (`?aura3d-quality=<tier>`; the
  PR 0a stub returns real tier data with `"auto"` → high on desktop, so the tier is applied from day 0). No
  shadow strength, bias, shader or `qualityProfile` overrides are allowed. A `showcase` gap is a defaults or
  capability gap by definition. This matches bar R4 and the agent rule A3 in `_sections/E`.
- **`aura3d-tuned`** (diagnostic column only, never scored): the strongest Aura configuration reachable through public
  API, for example a zero-intensity directional light to suppress the fallback rig in scene 03 (research 22 §03
  skeptic). It separates "capability exists but the default is wrong" from "capability missing" and is recorded in
  the capability log.

Content ceiling: the vision judges capped three.js at 4–7 because the content is programmer art (research 23:
01, 08, 10, 16, 17, 18). The `ref-*` scenes use real hero assets and must score **≥ 7 in three.js** under the panel
before they are admitted as references. A reference that scores lower is reworked, not lowered.

### 6.3 Region masks from the reference geometry

Both engines render the same `SceneSpec` from the same camera, so silhouettes coincide wherever Aura renders the
geometry correctly. Masks are rendered once, by the three.js side, and applied to both images. That assumption is
**checked per item, never presumed**: scene 16 (`node.size` bug) and scene 01 (missing cylinder cap) are known
exceptions. `three/lib/mask.ts` renders extra passes from the same `SceneSpec`.

| Mask | How it is produced | Used by |
|---|---|---|
| `object-id` | Per mesh, swap in `MeshBasicMaterial({ color, toneMapped: false, fog: false, blending: NoBlending })` (not `scene.overrideMaterial`, so each mesh gets its own id). `Points` get `PointsMaterial({ size, sizeAttenuation, toneMapped: false })` with the same id; `Line`s are skipped. Mask renderer: separate `WebGLRenderer({ antialias: false })`, `toneMapping = NoToneMapping`, `outputColorSpace = LinearSRGBColorSpace`, `scene.background = null` with clear colour 0. **The id colour is set with `color.setRGB(r/255, g/255, b/255, THREE.LinearSRGBColorSpace)`**: a hex `new Color(0x..)` is treated as sRGB and converted to linear by `ColorManagement`, so the written byte would not equal the id. Background id 0 | per-object FLIP/ΔE/specular energy, subject-only SSIM |
| `shadow-receiver` | Two renders by three into a `HalfFloatType` target with tone mapping off: (a) normal, (b) every light's `castShadow = false` (this changes the lights-state hash, so three recompiles programs without `needsUpdate`). Pixel is in the mask when linear luma(b) − luma(a) > max(0.02, 0.05·luma(b)) | shadow-contrast ratio (bar R3) |
| `sky` | Background id 0 ∩ (spec.background.kind === "hdri") | sky-variance detector (flat-sky detection, scenes 09, 13) |
| `metal` | Per-mesh harness `ShaderMaterial` writing `metalness * texture(metalnessMap, uv).b` (1.0 when no map) to R8; mask = object-id ∩ value ≥ 0.9. Factor-only tests are wrong for glTF assets, whose metalness lives in the map (DamagedHelmet) | specular-energy detector (06, 02, 03) |
| `silhouette-edge` | Morphological gradient of object-id (2 px) | edge-aliasing detector |
| `hud` (games only) | DOM rects of `games.json` `hudSelectors`, rasterized to the shot | excludes HUD from scene metrics, includes it in rubric |

Mask passes run in the same page load after the READY frame, so the camera and assets are identical. Mask PNGs are
written with a `.mask.png` suffix and hashed into the record.

**Alignment check (per item, both DPRs).** Aura has no public mask API, so the Aura silhouette is derived from its
shaded frame:
- colour-background scenes: Aura subject = pixels whose sRGB colour differs from `spec.background.color` by > 6 levels
  in any channel; alignment metric = IoU(Aura subject, three object-id ≠ 0);
- HDRI-background scenes: Canny edges of the Aura frame (σ = 1.5) vs the three `silhouette-edge` mask; alignment
  metric = symmetric chamfer distance in pixels.

Pass: IoU ≥ 0.98, or chamfer ≤ 1.5 px. Otherwise the item is `mask-misaligned`: per-object metrics are skipped for it,
the whole-frame metric is used, and the misalignment itself is reported as a G-REF finding (it usually means missing
or mis-sized geometry, as in scenes 01 and 16).

### 6.4 Calibrated thresholds that can fail

**Distance convention.** Every gated quantity is a distance `d(x, y) ≥ 0` where 0 means identical:
- FLIP mean, LPIPS and ΔE2000 are distances already;
- SSIM and MS-SSIM are gated as `1 − SSIM`;
- a detector `D` (§6.5) is gated as `|D(x) − D(y)|`, or as a relative change `|D(x) − D(y)| / max(|D(y)|, ε)` for
  ratio detectors (`shadowContrast`, `highlightEnergy`).

For G-REG, `y` is the approved golden and `x` is the new capture.

For every (item, metric, region) triple, `calibrate.ts` computes:

1. **Noise floor `N`.** Capture the same commit 5 times with fresh browser contexts (10 pairwise comparisons).
   `N` is the **maximum** pairwise distance. A percentile over so few samples is meaningless.
2. **Broken-control distances `B_c`.** One variant `c` per look feature, rendered from the approved build with that
   feature removed. A variant is applied only where the scene uses the feature (`spec.brokenControls`). `B_c` is
   `d(variant c, golden)` on that metric and region.

   | Variant | What it removes |
   |---|---|
   | `no-shadows` | `castShadow` off on every light |
   | `no-ibl` | environment intensity 0 |
   | `dpr-half` | render at 0.5× and upscale |
   | `no-aa` | MSAA 0 and post AA off |
   | `no-tonemap` | linear clamp |
   | `flat-sky` | solid background instead of the HDRI |
   | `albedo-only` | unlit material override |

3. **Threshold `T`.** `T = max(3·N, floor[metric])`. The triple **discriminates control `c`** when `T ≤ 0.5·B_c`. The
   triple is *active* when it discriminates at least one applicable control; otherwise it is `non-discriminating`
   and dropped from the item's gate. Each drop is listed in the PR summary, so it is never silent.
4. **Coverage rule.** For every item and every applicable control `c`, at least one active triple must discriminate
   `c`. An uncovered (item, control) pair makes the item `calibration-broken`. It is not silently handed to the panel.
   The fix is a new metric/region or a scene change, filed as a `qr-request` to the lane that owns the feature
   (it adds an isolating scene in its own `scenes/prdNN/`, C-30) (§23).
5. **Self-test.** The self-test re-renders every applicable broken control in a **separate capture run**; it never
   reuses the calibration images. It checks that each covered control is still rejected by G-REG. A gate whose
   self-test fails blocks *itself*: the job fails with `calibration-broken`.

Notes:
- Because a shadow metric is not expected to notice `no-tonemap`, discrimination is judged per control, not against
  the smallest `B` over all controls. A single global `Bmin` would mark almost every region metric non-discriminating.
- When a variant cannot be expressed through Aura public API (§8.3), `B_c` is measured on the three side (three
  variant vs three default). That proves the metric can see the feature at all. Coverage for that control is then
  marked `three-proxy` in `calibration.json`.

Metric floors (initial G-REG floors; tightened only by a new PRD revision):

| Metric | Floor |
|---|---|
| FLIP mean | 0.02 |
| 1 − SSIM (Gaussian 11×11, σ 1.5, luma) | 0.005 |
| ΔE2000 mean on lit object mask | 0.5 |
| LPIPS (AlexNet) | 0.01 |
| Detector relative change (ratio detectors) | 0.05 |
| Detector absolute change (`skyVariance`, `dynamicRange`, luma units 0–255) | 1.0 |

These floors are PRD 12 proposals. Bar R3 in `_sections/E` sets the G-REF limits (FLIP ≤ 0.10 per object, ΔE2000 ≤ 3,
shadow ratio ±15%, specular ±20%), not G-REG floors.

### 6.5 Appearance detectors (no-reference and reference-relative)

All detectors run in `metrics.py` on linear-light luminance derived from sRGB PNGs. Each one reports a value for
Aura, a value for three.js, and their ratio.

| Detector | Definition | Catches (evidence) |
|---|---|---|
| `shadowContrast` | median luma(shadow-receiver mask) / median luma(lit receiver ring 8–24 px outside the mask) | 01, 02, 08, 12, 17, 18: shadows 7–10% darker vs 49–80% in three (research 22) |
| `contactDarkening` | luma ratio in a 6 px band under each caster's lowest silhouette row vs the receiver mean | floating objects (research 23 01, 10, 18) |
| `highlightEnergy` | p99 luma and the clipped (≥ 250) fraction in the `metal` and `object-id` masks | 04 hotter lobes, 02 clipping, 06 rough-metal energy loss |
| `roughnessResponse` | luma std per sphere in a sweep; monotonicity of mean vs roughness | 06 dielectric darkening inverse of correct |
| `textureDetail` | variance of the Laplacian inside the object mask | tint override wiping textures (research 21 Aura Clash; 19 C3) |
| `edgeAliasing` | high-frequency energy along `silhouette-edge`, normalized by edge length | AA quality |
| `dynamicRange` | p1–p99 luma in the scene region (HUD excluded) | lifted blacks / washed-out (09, 17; Turbo Drift) |
| `skyVariance` | luma std in the `sky` mask | flat fallback sky, std 0.0 (research 22 §09) |
| `subjectPresence` | fraction of the three object mask whose Aura colour differs from `spec.background.color` by > 6 levels (colour-background scenes); for HDRI backgrounds, from the Aura `flat-sky` variant at the same pixel | missing particles (14), missing cap (01) |
| `temporalFlicker` | mean abs frame-to-frame luma delta of static pixels in an 8-frame strip with a slow orbit | shimmer, TAA instability |
| `blankOrBlack` | fraction of pixels with luma < 4 in the canvas region | Courier Rush black frames on the primary platform (research 21) |

Detectors feed G-REF and the panel packet. They do not replace the panel.

### 6.6 Player-frame-only capture

- **Games.** The harness loads the default route URL with no query string except the C-24 capture-context
  parameters (`?scenario=`, `?seed=`, `?freezeAt=`, `?cameraPose=`) and the C-33 `a3d-qr=<list>` flag passthrough. Under
  that contract, capture may change only camera pose, clock, seed, scenario state and the resolved QR flag set. Three
  checks enforce this.
  - **URL check (fails the run).** `capture-games.mjs` asserts that every navigated URL carries only contract keys.
    Any other key (`capture`, `review`, `debug`, `juiceProbe`, `evidence`, …) marks the run `forbidden-capture-flag`.
    This guards the harness itself.
  - **Differential probe (fails the game).** A "was the key read" probe cannot work: 16 of 18 routes read `capture` at
    boot, and the C-24 `captureFromUrl()` keeps reading it in order to ignore it (H17). So, once per game per run, the
    harness captures `01-title` at the default URL and again at the same URL plus `?capture=review`, with identical
    clock and seed. If FLIP(default, review) on the canvas crop exceeds 3× that game's title noise floor (FLIP between two default-URL title captures in the same run), the route still
    changes its look under a capture flag and is marked `forbidden-capture-flag`. Turbo Drift and Orbital Defense
    (0 capture ternaries) are the expected negatives; Rooftop Buckets (81) is the expected positive (V17).
  - **Read log (informational).** An init script wraps `URLSearchParams.prototype.get/has/getAll` and records the keys
    read into `run.json`. It is never a failure condition.
  - Shots stay **viewport** screenshots (H9), because the HUD is part of the player frame and the rubric scores
    `ui_hud`.
  - Scene metrics use the canvas crop with the `hud` mask removed.
  - The C-33 `games.json` schema carries `captureContractMigrated: boolean` per game (value set by lane 14 in
    `games.json`, Q-14-1; PRD 12 reads `false` when absent). While a game is unmigrated, a differential-probe flag is
    reported, not blocking, and none of its shots is golden-eligible. Once the entry says `true`, a flag fails the gate.
    PRD 12 does not wait for any migration: the probe, the report and the gate logic ship and are tested standalone
    against Rooftop Buckets (positive) and Turbo Drift / Orbital Defense (negatives).
- **Benchmark.** Aura scenes may use only the public `@aura3d/engine` API (enforced today by README policy and
  research 22 review). The base tsconfig maps every `@aura3d/*` package to source, so a `paths` override would not
  catch deep imports. Instead, `tests/unit/quality-gate/benchmark-imports.test.ts` parses every import specifier in
  `benchmarks/quality-rebuild/aura3d/**/*.ts` with the TypeScript compiler API. Each specifier must be one of:
  - `@aura3d/engine`;
  - an `@aura3d/engine/<subpath>` whose `./<subpath>` key exists in `packages/engine/package.json` `exports`;
  - a relative import that resolves inside `benchmarks/quality-rebuild/{shared,aura3d}/`.

  Anything else fails the test, including `packages/*/src/**` paths and other `@aura3d/*` packages.
- **No harness-only paths.** `cameraPolicy: "identity"`, `createExternalParityEnvironmentLighting` and
  `Renderer.render(...)` direct calls are banned from gate harnesses. The same import test also greps the gate
  harness directories for those three strings.

### 6.7 Deterministic stills vs gameplay strips (games)

Gameplay timelines run on wall-clock time against live physics, so pixel goldens on those shots would be flaky. Game
gates are split:

- **Scenario stills** (C-24 capture context, query shape fixed by C-33): `?scenario=<id>&seed=<n>&freezeAt=<s>&cameraPose=<name>`,
  with 3 scenarios per game (`establishing`, `action`, `hero`) declared in `games.prd12.json` and overridden by
  `games.json` when lane 14 adds them. A route that does not honour the query (C-24 stub: query parsed, not applied)
  produces a non-deterministic still; repeat-capture noise then exceeds the floor and the item is recorded
  `goldenEligible: false` with reason `scenario-nondeterministic` (panel-only). Deterministic stills get G-REG goldens.
- **Gameplay shots and strips** (real input timeline, unchanged): `02-opening`, `03-mid`, `04-action`, plus a 12-frame
  strip at 100 ms intervals around `04-action` (C-33 `steps/strip.mjs`) and a 5 s WebM (`steps/webm.mjs`). These go
  only to G-PANEL and to non-golden detectors: `blankOrBlack`, `dynamicRange`, measured fps. Lane 08 consumes the same
  step plugins for camera and feel judgment (C-33).
- **Viewports.** 1920×1080 @1, 1280×720 @1, **1440×900 @2** (the "DSF-2" desktop run requested by lane 03) and 390×844 @3 mobile
  emulation. Scenario stills are golden-eligible at 1920×1080 @1 and 390×844 @3 only. The other viewports go to the
  panel.

### 6.8 Panel review (G-PANEL)

- **Judges per round.** Two named humans (one art director, one rendering engineer) plus one vision model. The vision
  model is `claude-opus-5.5` through Kiro Prism `/v1/messages`, using the research 21/23 prompt verbatim, versioned
  in `tools/quality-gate/src/rubric.ts`.
  - The item score is the median of the three judges.
  - A difference class stands if 2 of 3 judges assign it.
  - The vision model alone can never produce a pass (`_sections/E` scoring protocol).
- **Blind A/B.** Benchmark pairs are presented with randomized left/right and engine labels removed. The key is
  stored in the round record and revealed only after scoring.
- **Image-delivery canary.** Pass-1 judges could not see images (research 22). The first item of every vision-model
  session is a canary frame with known content, for example "three coloured primitives, red cube left". If the
  model's description does not match, the round is invalid and is not recorded.
- **Calibration set** (scored blind at the start of each round):

  | Group | Frames |
  |---|---|
  | Known-bad | Orbital Defense 3.0.1 (1.5), benchmark 14 Aura (1.0) |
  | Known-mid | three r185 contract frames (4–7) |
  | Known-good | `ref-*` three showcase frames (≥ 7) and licensed reference stills |
  | Broken controls | must score ≥ 2 points below their source |

  A judge whose calibration scores drift more than 1.0 from the frozen baseline is replaced for that round.
- **Spread and reconciliation.** Any category with a judge spread > 2 is re-scored after a written reconciliation
  note.
- **Admitted loss fails.** If a judge's prose or a harness verdict records a visible loss on an item, the item cannot
  pass (research 14 §7.7). Verdicts are enums (§7.3), never free strings in producers.
- **Frozen thresholds.** Thresholds are frozen per round. Changing them requires a PRD revision.

### 6.9 Score history

`history/index.jsonl` gets one line per (round, item, judge-aggregate), with the commit SHA, run ID, runner image
version and per-category scores. `report.ts` renders trend charts (per scene and per game, overall plus the worst 3
categories) into the job artifact and the step summary. Round 0 is seeded from research 21 and 23 and flagged
`panel: "vision-only-single-judge"` so that it is never treated as a passing baseline.

### 6.10 Major recommendations: cost and fallback

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R-1 | Region masks + appearance detectors | Indirect: makes shadow/IBL/sheen/transmission regressions visible that whole-frame SSIM hides (§2.2) | Mask pass: about 1 extra draw per object per pass, on the CI runner only | Python metrics ~2–6 s per image pair on a CI CPU (estimate; measured in Phase 1) | ~200 MB peak per worker (LPIPS weights + float images) | 0 KB engine bundle; harness only | none at runtime | If the alignment check fails (IoU < 0.98 or chamfer > 1.5 px, §6.3), fall back to the whole-frame metric and mark the item `mask-misaligned` |
| R-2 | Calibrated per-scene thresholds with broken controls | Prevents any unfailable gate; locks in every approved improvement | 7 variants × scene renders + 5 repeats on CI: ~+90–120% capture GPU time on calibration runs only | Calibration runs only on golden update or runner-image change | goldens + variants ~1 MB/PNG; ≤ 150 MB LFS total | 0 | none | A non-discriminating triple is dropped visibly; an uncovered control makes the item `calibration-broken` (§6.4) |
| R-3 | Showcase reference tier + `ref-01..06` | Raises the target from "dark test card" to modern r185 output; the content ceiling moves from 4–7 to ≥ 7 | three side only, CI | negligible | +2k HDRIs (~6–24 MB each, LFS) | 0 | none | If an addon breaks under ANGLE Metal, fall back to the contract tier for that scene and record `reference-degraded` (the scene is not admitted to the bar) |
| R-4 | Golden-image regression (G-REG) | Approved looks cannot silently regress | capture already paid | ~1 s per comparison | LFS goldens | 0 | none | Golden-update PRs need a G-PANEL record; emergency revert restores the previous manifest |
| R-5 | Panel rubric gate (G-PANEL) + history | The only quality decision; scores tracked over time | none | Prism calls: 18 benchmark + 18 game packets per round (vision model) | jsonl < 1 MB/year | 0 | rubric includes `mobile_presentation` | If Prism is unavailable, the round is human-only and flagged `vision-missing`; no pass without 2 humans |
| R-6 | Player-frame-only + PR-build game capture | Evidence equals what players see; PRs judged on their own build | macos-14 time: 18 games × 4 viewports, sharded | Vite build per game (~6 s each for small apps; Orbital Defense built in 6 s, report.slim.json) + LFS pull | 1.7 GB `public/` must not be copied per app (already solved by `publicDir:false`) | 0 | Mobile emulation run kept; real-device lane in Phase 5 | When the local build fails, capture production and mark `source: production-fallback`; G-REG is skipped for that game and the PR fails the strict gate |
| R-6b | Differential capture-flag probe (§6.6) | Proves that the frame judged is the frame shipped; catches the 395 `?capture=review` look branches | +1 title capture per game per run | negligible | negligible | 0 | Probe also runs at 390×844 | While `games.json` says `captureContractMigrated: false` (or omits it) the flag is reported only; never silently passed |
| R-7 | Delete fabricated/label suites; collapse aggregators | Removes false "parity" signals that hid the gap | none | CI time drops (fewer jobs) | `tests/reports` shrinks | none | none | Deletions are per-family commits; `git revert` restores any family |
| R-8 | GPU-runner-only visual gates | No more black SwiftShader frames treated as evidence | macos-14 hosted | — | — | — | — | If macos-14 is unavailable, the gate is `blocked-runner` (fail closed), never a SwiftShader rerun |

Runtime cost to shipped apps is zero for every row. The harness ships no code into `@aura3d/engine` except the two
C-31 sections registered from `packages/engine/src/lanes/prd12.ts` (`appliedLook`, `frameTiming`; ≤ 1 KB gzip,
§17.2). Every other diagnostics key is implemented by its owning lane.

## 7. APIs to add / change / remove

All harness APIs are internal: they are not exported from any published `@aura3d/*` package. Engine-facing
fields are the C-31 schema (§7.4); each key is implemented by the lane named in the C-31 key table.

**Contract alignment (binding).** The frozen PR 0a files are the base, and the PRD 12 types below extend them only
with optional fields or new union members (CONTRACTS §6.4 "Allowed"):
- `benchmarks/quality-rebuild/shared/contracts.ts` (C-30) is re-exported by `shared/types.ts`; §7.1 restates it and
  adds nothing breaking. The `SceneSpec` registry fields stay optional in the type until T1.1 sets them on all 18
  base scenes; PRD 12 then makes `owner`/`referenceProfile`/`primaryCriterion` required **at runtime** in
  `registry.ts` validation (not in the type), so lane scenes written against the stub still compile.
- `tools/quality-gate/src/contracts.ts` (C-32) is re-exported by `tools/quality-gate/src/types.ts`. §7.3's richer
  records are `extends` of the C-32 interfaces (CCR-12-1, below), never replacements.
- `tools/quality-rebuild-capture/contracts.mjs` and `games.schema.json` (C-33) are the capture interface; PRD 12 adds
  step plugins and optional schema fields only.

### 7.1 `benchmarks/quality-rebuild/shared/types.ts` (change)

```ts
/** Tone mapping requested by a scene. "contract" scenes keep "aces-filmic" (three/common.ts:127); showcase scenes may pick agx/neutral. */
export type ToneMappingId = "aces-filmic" | "agx" | "neutral";

export type ReferenceProfile = "contract" | "showcase";

/**
 * Who owns a scene in the registry (C-30, verbatim). Bare numbers 19+ collided across lanes 02, 03, 04, 05 and 06;
 * owner-prefixed ids `<owner>-<slug>` resolve it (CONTRACTS §3.8 "Benchmarks").
 */
export type SceneOwner = "prd12" | "prd01" | "prd02" | "prd03" | "prd04" | "prd05" | "prd06" | "prd07" | "prd08" | "prd10" | "prd11";

export type BrokenControlId =
  | "no-shadows" | "no-ibl" | "dpr-half" | "no-aa" | "no-tonemap" | "flat-sky" | "albedo-only";

export type MaskId = "object-id" | "shadow-receiver" | "sky" | "metal" | "silhouette-edge";

/** Defined here (benchmark side) and re-exported by tools/quality-gate/src/types.ts. */
export type RegionId = "frame" | "subject" | `object:${number}` | MaskId | "scene-minus-hud";

export interface StripSpec {
  /** Frames captured after READY. */
  readonly frames: number;            // default 8
  readonly intervalMs: number;        // default 100 (deterministic clock: app.step(intervalMs/1000))
  /** Camera orbit over the strip, degrees around spec.camera.target (0 = static). */
  readonly orbitDegrees: number;
}

export interface SceneSpec {
  // ...existing fields unchanged (resolution stays RESOLUTION = 1280x720 @1; the capture DPR is passed as &dpr=
  //    and applied by each translator's setPixelRatio, so spec.resolution.devicePixelRatio is the DPR-1 base)...
  readonly owner: SceneOwner;                          // NEW
  readonly referenceProfile: ReferenceProfile;         // NEW
  /** Device pixel ratios captured. Default [1]; showcase scenes [1, 2] ("DSF-2", requested by lane 03). */
  readonly dprs?: readonly (1 | 2)[];                  // NEW
  readonly masks: readonly MaskId[];                   // NEW: which masks the three side must render
  readonly brokenControls: readonly BrokenControlId[]; // NEW: variants rendered for calibration (only features the scene uses)
  readonly strip?: StripSpec;                          // NEW: temporal capture
  /** Free-text, one line: the single visual behaviour this scene exists to test (judged first). */
  readonly primaryCriterion: string;                   // NEW
  /** Mask region on which primaryCriterion is measured (used by the Phase 2 coverage exit criterion). */
  readonly primaryRegion: RegionId;                    // NEW, e.g. "object:0" for 05's sphere, "shadow-receiver" for 12
  /** QR flags this scene captures with by default (C-30; `--flags` overrides, CONTRACTS §5.4 "Benchmarks"). */
  readonly qrFlags?: readonly string[];                // NEW (C-30)
}

/** One entry of the canonical registry (benchmarks/quality-rebuild/shared/registry.ts). */
export interface RegistryEntry {
  readonly id: string;               // "01-simple-geometry" | "prd12-ref-03-character-hero" | "prd03-bloom-hdr-threshold"
  readonly spec: SceneSpec;
  /** Panel admission: a showcase reference must score >= 7 in three.js before it is used as a bar. */
  readonly admittedAsReference: boolean;
  readonly status: "active" | "quarantined" | "retired";
}

export interface ShadowReport {
  readonly mapRendered: boolean;
  readonly mapSampled: boolean;
  readonly mapSize: number | null;
  readonly strength: number | null;     // Aura: applied strength (today 0.24-0.38, research 19 C11)
  readonly casterName: string | null;   // e.g. "aura3d-root-production-fallback-key-shadow"
}

export interface ReadyPayload {
  // ...existing fields unchanged...
  /** Variants that public API cannot express are never captured; they appear in capabilityLog as
   *  { feature: "broken-control:<id>", status: "missing" } and are measured on the three side only (§8.3). */
  readonly variant: "default" | "aura3d-tuned" | BrokenControlId;   // NEW
  readonly dpr: 1 | 2;                                               // NEW
  readonly appliedExposure: number | null;                           // NEW (Aura: from diagnostics().appliedLook)
  readonly appliedToneMapping: string | null;                        // NEW
  readonly lightUnits: "three-physical" | "aura-internal" | "unknown";// NEW
  readonly shadows: ShadowReport | null;                             // NEW
  readonly fallbackLightsActive: boolean | null;                     // NEW (research 22 §03)
  readonly frameTiming?: FrameTimingSample;                          // NEW (§7.4, C-30 ReadyPayloadV2)
  readonly assetHashes: Readonly<Record<string, string>>;            // NEW sha256 per served asset
  readonly qrFlags: readonly string[];                               // NEW (C-30): resolved flag set, from diagnostics().qrFlags
}
// ReadyPayload & the fields above == C-30 ReadyPayloadV2.
```

### 7.2 `tools/quality-gate/src/types.ts` (new)

```ts
export type ItemKind = "benchmark-scene" | "game-scenario" | "game-shot" | "game-strip";

export interface CaptureRef {
  readonly path: string;               // artifact-relative PNG path
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface EvidenceEnvironment {
  readonly commitSha: string;
  readonly githubRunId: string;
  readonly runnerImage: string;        // ImageOS + ImageVersion env from the hosted runner
  readonly gpuRenderer: string;        // UNMASKED_RENDERER_WEBGL
  readonly browserVersion: string;
  readonly launchArgs: readonly string[];
}

export interface CapturedItem {
  readonly itemId: string;             // "bench:16-instancing@dpr1" | "game:showcase-bank-shot:scenario:action@1920x1080"
  readonly kind: ItemKind;
  readonly aura: CaptureRef;
  readonly reference?: CaptureRef;     // three.js frame for benchmark items
  readonly masks: Readonly<Partial<Record<MaskId | "hud", CaptureRef>>>;
  readonly variants: Readonly<Partial<Record<BrokenControlId | "aura3d-tuned", CaptureRef>>>;
  readonly repeats: readonly CaptureRef[];   // 4 extra captures (5 total) on calibration runs; [] otherwise
  readonly env: EvidenceEnvironment;
}

export type MetricId =
  | "flip" | "ssim" | "msssim" | "lpips" | "deltaE2000"
  | "shadowContrast" | "contactDarkening" | "highlightEnergy" | "roughnessResponse"
  | "textureDetail" | "edgeAliasing" | "dynamicRange" | "skyVariance"
  | "subjectPresence" | "temporalFlicker" | "blankOrBlack";

export type RegionId = import("../../../benchmarks/quality-rebuild/shared/types").RegionId; // re-export

export interface MetricValue {
  readonly metric: MetricId;
  readonly region: RegionId;
  readonly aura: number;
  readonly reference: number | null;   // value on the three.js frame (detectors) or null for pairwise metrics
  readonly pairwise: number | null;    // distance (§6.4 convention) aura-vs-reference or aura-vs-golden
}

export interface CalibratedThreshold {
  readonly itemId: string;
  readonly metric: MetricId;
  readonly region: RegionId;
  readonly noiseMax: number;           // max over 10 pairwise repeat distances (5 captures)
  readonly brokenControls: Readonly<Partial<Record<BrokenControlId, { readonly distance: number; readonly source: "aura" | "three-proxy" }>>>;
  readonly threshold: number;          // max(3*noiseMax, floor)
  readonly rejects: readonly BrokenControlId[];  // controls c with threshold <= 0.5 * distance_c
  readonly active: boolean;            // rejects.length > 0
  readonly calibratedAt: { readonly commitSha: string; readonly runnerImage: string };
}

export interface CalibrationReport {
  readonly itemId: string;
  readonly thresholds: readonly CalibratedThreshold[];
  /** Applicable controls that no active threshold rejects; non-empty => item verdict "calibration-broken". */
  readonly uncoveredControls: readonly BrokenControlId[];
}

export interface GoldenEntry {
  readonly itemId: string;
  readonly image: CaptureRef;          // LFS path under benchmarks/quality-rebuild/goldens/
  readonly masks: Readonly<Partial<Record<MaskId | "hud", CaptureRef>>>;
  readonly thresholds: readonly CalibratedThreshold[];
  readonly approvedBy: string;         // PanelRoundRecord.roundId that approved this golden
  readonly supersedes: string | null;  // previous golden sha256
}

export interface GoldenManifest {
  readonly schema: "aura3d.quality-gate.goldens/1";
  readonly runnerImage: string;        // goldens are only valid on this runner image + GPU string
  readonly gpuRenderer: string;
  readonly entries: readonly GoldenEntry[];
}
```

### 7.3 Verdicts and rubric records (new; replaces every free-string verdict)

C-32 alignment (CCR-12-1, filed day 0, additive only): `GateVerdict`, `GAME_VISUAL_CATEGORIES`,
`GAME_NONVISUAL_CATEGORIES` and `RUBRIC_PROMPT_VERSION` are imported from `tools/quality-gate/src/contracts.ts`
unchanged. The PRD 12 record types below are declared as `interface X extends C32.X` with the extra fields optional
on the C-32 side: `JudgeIdentity.kind` keeps the C-32 values `"human" | "vision-model"` and PRD 12 adds
`role?: "art-director" | "rendering-engineer"` (the code below shows the PRD 12 view; `rubric.ts` maps
`"human-art-director"` → `{ kind: "human", role: "art-director" }`). `BenchmarkJudgement` keeps C-32 `sceneId`,
`round`, `aura`, `three`, `categories`, `observations`, `rubricPromptVersion` and adds `itemId`, `blindKey`,
`descriptions`, `differences`, `harnessFairness`. `PanelRoundRecord` keeps C-32 `round`, `date`, `commit`,
`captureRunId`, `qrFlags`, `judges` and adds `schema`, `env`, `calibration`, `canaryPassed`, `aggregates`. Consumers
(lane 13 `LookJudgement`, lane 14 scorecards) code against the C-32 base and are unaffected.

```ts
/** research 23 six-class taxonomy. */
export type DifferenceClass =
  | "equivalent" | "aura3d-better" | "minor-aura3d-deficiency"
  | "major-aura3d-deficiency" | "implementation-bug" | "missing-capability";

export type GateVerdict =
  | "pass"
  | "regression"                 // G-REG threshold exceeded
  | "reference-gap"              // G-REF bar R1-R3 failed
  | "admitted-loss"              // any judge or detector recorded a visible loss
  | "calibration-broken"         // threshold failed to reject a broken control
  | "non-discriminating"         // metric dropped for this item (informational)
  | "mask-misaligned"
  | "forbidden-capture-flag"
  | "blocked-runner"             // no GPU runner / SwiftShader detected
  | "capture-failed";

export const GAME_VISUAL_CATEGORIES = [
  "environment_world", "modeling_assets", "texture_quality", "material_quality", "pbr_credibility",
  "lighting", "shadows", "ambient_lighting", "ibl_reflections", "tone_mapping", "color_management",
  "anti_aliasing", "postprocessing", "vfx", "particles", "animation_quality", "character_presentation",
  "camera", "composition", "scale_depth_perception", "atmospheric_effects", "gameplay_readability",
  "ui_hud", "typography", "polish_juice", "mobile_presentation", "overall_visual_quality"
] as const;                                                    // 27, research 21
export const GAME_NONVISUAL_CATEGORIES = [
  "sound_audio", "controls", "physics_feel", "game_feel", "loading_transitions", "performance"
] as const;                                                    // research 20; performance filled from measured rAF

export interface JudgeIdentity {
  readonly id: string;                                         // GitHub login for humans; model id for the vision judge
  readonly kind: "human-art-director" | "human-rendering-engineer" | "vision-model";
  readonly promptVersion?: string;                             // vision judge only (rubric.ts RUBRIC_PROMPT_VERSION)
}

export interface BenchmarkJudgement {
  readonly itemId: string;
  readonly judge: JudgeIdentity;
  readonly blindKey: "A-is-aura" | "B-is-aura";
  readonly descriptions: { readonly aura: string; readonly reference: string };
  readonly differences: readonly { readonly text: string; readonly cls: DifferenceClass; readonly cause: string }[];
  readonly scores: { readonly aura: number; readonly reference: number };   // 0-10, 0.5 steps
  readonly harnessFairness: { readonly fair: boolean; readonly notes: string };
}

export interface GameJudgement {
  readonly itemId: string;                                     // game id + viewport
  readonly judge: JudgeIdentity;
  readonly scores: Readonly<Record<(typeof GAME_VISUAL_CATEGORIES)[number], number>>;
  readonly dominantCauses: readonly { readonly cause: string; readonly percent: number }[];
  readonly competitiveWithModernThree: boolean;
  readonly critique: string;                                   // required, >= 200 chars
}

export interface PanelRoundRecord {
  readonly schema: "aura3d.quality-gate.panel/1";
  readonly roundId: string;                                    // "2026-11-02-r1"
  readonly env: EvidenceEnvironment;
  readonly thresholdsFrozenAt: string;                         // PRD revision id
  readonly calibration: readonly { readonly judgeId: string; readonly drift: number; readonly accepted: boolean }[];
  readonly canaryPassed: boolean;                              // vision judge saw the canary correctly
  readonly benchmark: readonly BenchmarkJudgement[];
  readonly games: readonly GameJudgement[];
  readonly aggregates: readonly { readonly itemId: string; readonly median: number; readonly classes: readonly DifferenceClass[]; readonly verdict: GateVerdict }[];
}
```

### 7.4 Engine diagnostics read by the harness (C-31 schema; C-28 FrameStats)

The types are frozen in `packages/engine/src/contracts/diagnostics.ts` (C-31, PR 0a) and
`benchmarks/quality-rebuild/shared/contracts.ts` (C-30). They are restated here for the harness:

```ts
// @aura3d/engine — returned by app.diagnostics(); read-only; no behaviour change
export interface FrameTimingSample {                  // C-30/C-31 key "frameTiming": assembled by PRD 12 from C-28 FrameStats + its own rAF sampler
  readonly source: "rAF" | "gpu-timer-query";         // gpu-timer-query only when EXT_disjoint_timer_query_webgl2 exists
  readonly frames: number;
  readonly cpuMsP50: number; readonly cpuMsP95: number;
  readonly gpuMsP50: number | null; readonly gpuMsP95: number | null;
  readonly rafFps: number;                            // measured; replaces self-reported fps (research 20: engine says 60 at 0.5)
}
export interface AppliedLookReport {                  // C-31 key "appliedLook": assembled by PRD 12 from the output (01), lighting/shadows (02), exposure/post (03) sections
  readonly exposure: number;                          // value actually sent to the tone-map pass
  readonly toneMapping: "aces-filmic" | "agx" | "neutral" | "reinhard" | "none";
  readonly environment: { readonly specularIntensity: number; readonly diffuseIntensity: number; readonly background: "color" | "hdri" | "sky" };
  readonly shadows: ShadowReport | null;
  readonly fallbackLightsActive: boolean;
  readonly renderPath: "production" | "safe-basic" | "lean" | "compat-preset";   // research 18 Q4: 4 live pipelines
  readonly pixelRatio: number;
}
export interface AuraDiagnostics { /* existing, index.ts:10377 */ readonly frameTiming?: FrameTimingSample; readonly appliedLook?: AppliedLookReport; readonly qrFlags?: readonly string[]; }
```

Stub behaviour relied on (C-31 "Stub"): `appliedLook` is assembled from existing fields (tone-mapping literal
near `index.ts:1801`, shadow evidence, `fallbackLightsActive` from `createProductionRuntimeFallbackLights` at
`index.ts:13363-13413`); every other key is present with `null`/empty values; `qrFlags` is real. PRD 12 never
substitutes a constant for a `null` (no-fabricated-evidence rule): a `null` source field becomes `null`/`"unknown"` in
`ReadyPayload`. `renderPath` is assembled from the C-29 backend report when the real provider lands; with the stub it
is derived from the existing `safe-basic` fallback evidence, else `null`.

The harness fails an item with `capture-failed` when `appliedLook.renderPath` is non-null and `!== "production"` on a
scene that did not request another path. This catches the silent `safe-basic` fallback (`_sections/E` D1).

### 7.5 Entry points

```ts
// tools/quality-gate/src/calibrate.ts
export function calibrate(item: CapturedItem, metrics: readonly MetricValue[][], floors: Readonly<Record<MetricId, number>>): CalibrationReport;
// tools/quality-gate/src/golden.ts
export function loadGoldens(manifestPath: string): GoldenManifest;
export function compareToGolden(item: CapturedItem, golden: GoldenEntry, metrics: readonly MetricValue[]): { verdict: GateVerdict; failures: MetricValue[] };
export function proposeGoldenUpdate(items: readonly CapturedItem[], round: PanelRoundRecord): GoldenManifest; // refuses without a passing panel aggregate
// tools/quality-gate/src/verdict.ts
export function evaluateGates(input: { items: CapturedItem[]; metrics: Map<string, MetricValue[]>; goldens: GoldenManifest; bar: QualityBar }): { itemVerdicts: Map<string, GateVerdict[]>; exitCode: 0 | 1 };
// tools/quality-gate/src/judge-prism.ts
export async function judgeWithPrism(packet: JudgePacket, opts: { baseUrl: string; apiKeyEnv: "PRISM_API_KEY"; model: "claude-opus-5.5" }): Promise<BenchmarkJudgement | GameJudgement>;
// tools/quality-gate/src/history.ts
export function appendRound(round: PanelRoundRecord, indexPath: string): void;
export function trend(indexPath: string, itemId: string): readonly { roundId: string; median: number }[];
```

```python
# tools/quality-gate/metrics/metrics.py  (CLI: python -m metrics run --items items.json --out metrics.json)
def flip(ref: np.ndarray, test: np.ndarray, mask: np.ndarray | None) -> float: ...           # NVlabs flip-evaluator, "LDR" mode, explicit ppd=67.0 (FLIP default viewing conditions) recorded in metrics.json; mask applied to the returned error map, mean over mask
def ssim(ref, test, mask=None, gaussian_sigma=1.5, win=11) -> float: ...                     # skimage.metrics.structural_similarity(gaussian_weights=True, sigma=1.5, use_sample_covariance=False, data_range=1.0) on linear-light luma; full=True map averaged over mask; gated as 1 - ssim
def lpips_alex(ref, test) -> float: ...                                                       # lpips==0.1.4, net='alex', CPU, inputs scaled to [-1, 1]
def delta_e2000(ref, test, mask) -> float: ...                                                # skimage.color.rgb2lab then deltaE_ciede2000, mean over mask
def detectors(img, masks: dict[str, np.ndarray], ref_img: np.ndarray | None) -> dict[str, float]: ...
```

### 7.6 Remove

| Symbol / file | Replacement |
|---|---|
| `THREE_COMPAT_COMPARISON_SCENES` (`benchmarks/three-compat/shared/scenes.ts`) and the `visualScore`, `a3dFrameMs`, `threeFrameMs`, `setupLines` constants | none: deleted |
| `EXTERNAL_PARITY_THREEJS_PARITY_SCENES` consumer `tests/browser/external-parity-threejs-visual-parity.spec.ts` (byte-size + `visualScore >= 58` gate) | none: deleted |
| `setupLines` constants in `benchmarks/external-parity/shared/threejs-visual-parity-scenes.ts:19` | none: deleted (fabricated ergonomics metric) |
| `structuralSimilarityProxy` field and every assertion on it (52 files, §2.3) | `ssim` / `flip` from `metrics.py`; kept tools report `meanDelta` only, ungated |
| `superiorityTargetsMet` (`tests/browser/muse3jsparity-301-visual.spec.ts:127`, `tools/muse3jsparity-readiness/acceptance.ts:20,105`, `tests/browser/game-visual-superiority.spec.ts:452`, `tests/unit/tools/muse3jsparity-acceptance.test.ts:95`) | none (specs deleted, field removed from `acceptance.ts` and its fixture, §10.2) |
| `visualStatus` derivation (`tools/threejs-parity-threejs-inventory/index.ts:251-256`) | none (tool deleted) |
| free-string `verdict:` / `observedLosses` literals in `tools/head-to-head-*/index.ts` | `GateVerdict` + measured detector text |
| `renderA3DScene` / `renderThreeJsScene` string stubs, `compareImages` (`benchmarks/production-runtime/`) | none |
| `pnpm test:visual` → `tools/visual-baseline/index.ts` | `pnpm quality:gate` (G-REG) |

## 8. Shader changes

This PRD changes **no production shader**: no GLSL/WGSL in `packages/rendering` or `packages/engine`. Engine shader
work is owned by lanes 01-04, 07 and 11. The harness adds four small shader-level pieces, all confined to the
benchmark page and the three.js side:

1. **Object-ID mask material** (`three/lib/mask.ts`). `MeshBasicMaterial` with `toneMapped: false`, `fog: false`,
   `blending: NoBlending`, `depthWrite: true`, swapped per mesh (`PointsMaterial` for `Points`).
   - **Id encoding.** `idColor(i)` is an 8-bit RGB encoding of the object index: `r = (i*37) % 251 + 1`, `g = i >> 8`,
     `b = 0`, with collisions rejected at build time. It is written with
     `material.color.setRGB(r/255, g/255, b/255, THREE.LinearSRGBColorSpace)`.
   - **Renderer settings.** A separate `WebGLRenderer({ antialias: false })` with `toneMapping = NoToneMapping` and
     `outputColorSpace = LinearSRGBColorSpace`. With the id specified in linear space and a linear output, the byte
     written equals the id. A hex colour would be colour-managed from sRGB and would not survive.
   - **Unit test.** T-U9 renders 3 ids and reads them back.
   - **Skinned and instanced meshes.** They keep their geometry and skinning/instancing attributes. In r185 skinning
     is chosen from `object.isSkinnedMesh`, not from a material flag, so the standard vertex chunks place id pixels
     where the shaded frame has them.
2. **Metalness mask material.** A harness `ShaderMaterial` per mesh that outputs `metalness * texture(metalnessMap, vUv).b`
   (`metalnessMap` absent → factor only), using the same skinning/instancing chunks (`#include <skinning_pars_vertex>`
   etc.) so that it aligns with the shaded frame.
3. **Shadow-receiver mask**: two three.js renders into a `HalfFloatType` `WebGLRenderTarget` with
   `toneMapping = NoToneMapping` (linear values, before any tone map): (a) default, (b) every light's
   `castShadow = false`. Toggling `castShadow` changes three's lights-state hash, so programs refresh without
   `material.needsUpdate`. Read back with `readRenderTargetPixels` into a `Uint16Array`; half-float readback relies on
   `EXT_color_buffer_float`, which is present on the runner (H11). Pixel ∈ mask when linear luma(b) − luma(a) >
   max(0.02, 0.05·luma(b)). No custom shader.
4. **Broken-control variants on the Aura side** use only public API (`castShadow: false`, `environments.hdri({ intensity: 0 })`,
   a `renderer.pixelRatio` override, `antialias: false`, and tone-map selection through the C-05/C-13 output options
   when the resolved flag set exposes them; today `ToneMappingId` is only `"aces-filmic"` (`shared/types.ts:8`), so
   `no-tonemap` starts as three-proxy and switches to an Aura capture automatically when the option resolves). A variant that
   public API cannot express is not captured. It is logged as `{ feature: "broken-control:<id>", status: "missing" }`
   in `capabilityLog` and rendered on the three side only. Calibration then uses the three-side variant for that
   control (`source: "three-proxy"`, §6.4). That proves the metric can tell "has shadows" from "has none". It does
   not prove the Aura-side gate sees it, which is why the coverage report lists it separately.

No shader in this PRD is performance-relevant to shipped apps.

## 9. Rendering changes

### 9.1 three.js `showcase` pipeline (`benchmarks/quality-rebuild/three/lib/showcase.ts`)

```ts
export interface ShowcaseOptions {
  readonly toneMapping: "agx" | "neutral" | "aces-filmic";
  readonly ao: { readonly kind: "gtao"; readonly radius: number; readonly distanceExponent: number } | null;
  readonly bloom: { readonly strength: number; readonly radius: number; readonly threshold: number } | null; // threshold in HDR units (>= 1.0)
  readonly aa: "msaa4+smaa" | "msaa4";
  readonly shadows: { readonly type: "pcf" | "vsm"; readonly mapSize: 2048 | 4096; readonly radius: number; readonly bias: number; readonly normalBias: number } | null;
  readonly contactShadows: { readonly size: number; readonly blur: number; readonly darkness: number } | null; // product scenes
  readonly background: "hdri" | "grounded-skybox" | "color";
  readonly anisotropy: "max";
}
export async function runThreeShowcase(spec: SceneSpec, opts: ShowcaseOptions, host: HTMLElement): Promise<ReadyPayload>;
```

Composer order: `RenderPass` → `GTAOPass` (when `ao`) → `UnrealBloomPass` (when `bloom`) → `SMAAPass` (when
`aa === "msaa4+smaa"`) → `OutputPass`. Constraints:

- **Explicit composer target.** `EffectComposer` creates a `HalfFloatType` target **without** multisampling by
  default (`examples/jsm/postprocessing/EffectComposer.js:69`), and `WebGLRenderer({ antialias: true })` does not
  apply to off-screen targets. The composer is therefore constructed as `new EffectComposer(renderer, new
  WebGLRenderTarget(w*dpr, h*dpr, { type: HalfFloatType, samples: 4 }))`. Without this, "msaa4" silently means no
  MSAA.
- **Tone mapping and encode once.** When rendering into the composer target, `RenderPass` leaves output linear.
  `OutputPass` applies `renderer.toneMapping` / `toneMappingExposure` and the sRGB encode exactly once.
- **ContactShadows is not a three.js addon class.** `three/lib/contact-shadows.ts` ports the r185
  `webgl_shadow_contact` example:
  - an orthographic camera looking up from the ground renders a `MeshDepthMaterial` silhouette into a 512² target;
  - two blur passes use `HorizontalBlurShader` / `VerticalBlurShader` from `examples/jsm/shaders/`;
  - the result is applied as a plane with `opacity = darkness`.
- **CSM.** `examples/jsm/csm/CSM.js` (WebGL path; `CSMShadowNode` is the WebGPU one), with `csm.setupMaterial(m)` on
  every material.

The addons are present locally (§2.4).

### 9.2 Contract-tier fixes (`three/common.ts`, `aura3d/common.ts`, `capture.mjs`)

These implement the research 22 skeptic fixes:

- `renderer.shadowMap.type = THREE.PCFShadowMap` explicitly (removes the r185 deprecation remap).
- Deduplicate GLB/HDR fetches on both sides with a module-level `Map<url, Promise<ArrayBuffer>>`. Today
  `net::ERR_ABORTED` appears on scenes 02, 03, 04, 05, 06, 08 and 09.
- Write `ready.json` (the full `ReadyPayload`) next to each PNG.
- Aura side: populate `appliedExposure`, `shadows`, `fallbackLightsActive` and `lightUnits` from
  `diagnostics().appliedLook` (C-31). Record `null`/`unknown` wherever the stub section reports `null`.
- Scene 02: add a diagnostic variant that builds the plinth with `.scale([1.6,0.1,1.6])` instead of `size`, to locate
  the plinth offset (research 22 §02 skeptic).
- Scene 08 companion: add `prd12-skinned-character-walk` in PRD 12's own lane dirs
  (`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd12/skinned-character-walk.ts`) with the Walk
  clip at t = 1.25 s, so the DepthPass-ignores-skinning defect (research 19 C4) is visible. Owner `prd12` (a harness
  scene; lane 06 may register its own `prd06-*` scenes in `scenes/prd06/`, which PRD 12 never edits).
- Scene 01 and 06: add a three-side control at `SphereGeometry(16,12)` and `CylinderGeometry(...,24)` (diagnostic,
  not scored) to separate tessellation from shading.
- Scene 16 stays as is. The `node.size` bug (`index.ts:14751`) is CONTRACTS R18, fixed by lane 15 without a flag. The
  harness must not work around it; PRD 12 re-baselines scene 16 when the declared fix merges (CONTRACTS §6.1).

### 9.3 Showcase reference scenes `ref-01..ref-06` (new)

The content is chosen so a well-built three.js render scores ≥ 7. Assets are already tracked unless marked NEW.
Scene ids are owner-prefixed per C-30 (`prd12-ref-0N-<slug>`); the short form `ref-0N` is used in prose. Files live in
PRD 12's lane dirs `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd12/`.
NEW 2k HDRIs (Poly Haven, CC0) are requested from lane 05 through C-17 admission (Q-05-1). **Day-0 stand-ins**, so no
scene waits: the tracked 1k equirects `fixtures/environment-corpus/hdri/{studio_small_08,autumn_field_puresky,kloppenheim_06_puresky}_1k.hdr`
(§2.4), `RoomEnvironment` for interiors, and a procedural ground (`three/lib/` checker + noise normal) for ref-03.
A scene captured with a stand-in records `assetTier: "stand-in"` in `ready.json` and can be admitted only at the 1k
resolution it was judged at; swapping to the admitted 2k asset is a re-admission, not a code change. The "Feeds" column
lists the lanes whose integrated acceptance reads the scene (informational, not a dependency).

| id | Content | Assets | three.js showcase settings | Judged primary criterion | Feeds |
|---|---|---|---|---|---|
| `prd12-ref-01-automotive-studio` | Car on a turntable floor, studio HDRI, key + rim | `fixtures/threejs-parity/assets/vehicles/car-concept.glb` (213k tris; clearcoat, iridescence, transmission) + NEW 2k studio HDRI (stand-in `studio_small_08_1k`) | AgX, GTAO, PCF 4096 radius 3, ContactShadows, SMAA, HDRI background blurred (`backgroundBlurriness 0.4`) | Clearcoat/flake paint reads as lacquer; glass transmits; grounded contact | 02, 03, 04 |
| `prd12-ref-02-diorama` | Animated diorama, warm key, interior bounce | `fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb` (Draco, 1 clip) + `RoomEnvironment` | Neutral, GTAO, PCF 2048, SMAA, bloom (threshold 1.0) on lamps | Readable detail at 1280×720; AO in crevices; no aliasing on thin geometry | 01, 03, 05, 06 |
| `prd12-ref-03-character-hero` | Soldier idle → walk strip on a textured ground under an outdoor HDRI | `fixtures/threejs-parity/assets/character/soldier.glb` + NEW 2k outdoor HDRI (stand-in `autumn_field_puresky_1k`) + ground texture set requested from lane 05 (stand-in: procedural ground) | AgX, CSM 3 cascades 2048, GTAO, SMAA, `GroundedSkybox` | Skinned shadow matches pose; rim/key separation; ground detail with anisotropy | 02, 06, 10 |
| `prd12-ref-04-night-street` | Wet asphalt street, emissive signs, practical point lights, fog | street kit requested from lane 05 (Q-05-2; candidate: the Aura Clash brownstone kit). Stand-in: primitive street blocks with emissive sign quads + `kloppenheim_06_puresky_1k` at exposure 0.15 | ACES, `Reflector` or `SSRPass` on the floor, bloom threshold 1.0 on emissives > 1, FogExp2 0.015, GTAO | Emissives glow without blooming mid-tones; floor reflects; fog separates depth | 02, 03, 07, 14 (Aura Clash) |
| `prd12-ref-05-arena-game` | Third-person arena with 20+ props, pickups, particles, CSM, fog | soldier, `propRockA/B`, `deepRecoveryCrateStandard`, procedural particles | AgX, CSM 4 cascades, GTAO, bloom, SMAA, additive soft particles | Grounding at gameplay distance; particles present and lit; contrast and readability | 02, 03, 07, 08, 14 |
| `prd12-ref-06-product-turntable-motion` | DamagedHelmet + AntiqueCamera on a slow 8-frame orbit strip | `fixtures/asset-corpus/{damaged-helmet,antique-camera}.glb` + `studio_small_08` | Neutral, GTAO, ContactShadows, MSAA4 + SMAA | Temporal stability (`temporalFlicker`), specular aliasing in motion | 03, 04 |

### 9.4 Registry and ID policy

- `shared/registry.ts` is the single scene list. `main.ts` routing and `capture.mjs` discovery read it, not
  `import.meta.glob` file names.
- Existing IDs `01..18` are frozen. New scenes use `<owner>-<slug>`, for example `prd03-bloom-hdr-threshold` and
  `prd04-clearcoat-carpaint`. The colliding "19-*" numberings proposed by lanes 03, 04 and 11 are withdrawn
  (CONTRACTS §3.8). Each lane registers its scenes in its own `scenes/prdNN/index.ts`, `aura3d/scenes/prdNN/` and
  `three/scenes/prdNN/`; `shared/registry.ts` (PRD 12) aggregates them and validates ids, owner prefix and both
  adapters (`tests/unit/contracts/C-30-bench-registry.test.ts`). Lane 08's motion scenes live in
  `benchmarks/quality-rebuild/motion/` (lane 08) and register as `prd08-motion-m1..m6` through `scenes/prd08/`.
- `main.ts` routes lane adapters by registry lookup, so the `./aura3d/*.ts` glob (H16) never needs to see
  subdirectories; a lane scene missing either adapter is `status: "quarantined"` with reason `missing-adapter` and
  never breaks the page for other scenes.
- A scene enters `active` only after its first calibration run proves that at least one metric is discriminating, or
  after its panel admission for `ref-*`.

### 9.5 Capture pipeline (`capture.mjs` rewrite, same CLI flags plus new ones)

For each `(scene, engine, dpr)` the capture sequence is:

1. Load the page, wait for READY, screenshot `#stage` → `frame.png`.
2. Run the mask passes (three only) → `*.mask.png`.
3. Capture a frame strip if `spec.strip` is set.
4. Reload for each broken-control and diagnostic variant.
5. Reload twice more for repeat captures (noise floor). Repeats run only when `--calibrate` is set, or when the scene
   has no calibrated golden.

New flags: `--calibrate`, `--variants all|none|<ids>`, `--dprs 1,2`, `--strict`. With `--strict` the exit code is 1
when any item is not READY, any GPU string contains `SwiftShader` or `llvmpipe`, or any mask is misaligned. The
in-browser metric code in `compareInBrowser` (`capture.mjs:157-283`) is kept only for the side-by-side/diff composite.
All metrics move to `metrics.py`.

### 9.6 Game capture changes (`capture-games.mjs`)

- `--pr-build` builds every selected game from the checked-out commit using the existing wrapper-config path
  (`README.md:20-30`) and serves it locally. It is the default when `GITHUB_EVENT_NAME == pull_request`. Production
  capture stays available as `--source production` for post-deploy verification.
- `scenarios` per game in `games.json`: `[{ id, query: { scenario, seed, freezeAt, cameraPose } }]`. Captured at
  1920×1080 and 390×844@3. Golden-eligible.
- `hudSelectors` per game: CSS selectors whose bounding rects form the `hud` mask.
- The forbidden-param probe (§6.6) is installed as an init script.
- Strip capture: `{"strip": {"frames": 12, "intervalMs": 100}}` timeline step, plus `page.video` recording for 5 s
  around `04-action`.
- GPU timing: read `diagnostics().frameTiming` when present, otherwise the existing rAF sampler. Report both.
  Disagreement > 20% between engine-reported and rAF fps is recorded as `fps-self-report-mismatch`.

## 10. Migration plan

### 10.1 Order of cutover

1. **Stand up before tearing down.** Phases 1–3 make the new gates real (metrics, masks, calibration, goldens,
   panel). They run in **report-only** mode for 2 panel rounds.
2. **Delete fabricated suites immediately** (Phase 0). They are not gates anyone should rely on, and keeping them
   lets claims be re-cited. Nothing depends on their output except other fabricated or aggregator tools
   (research 19 C18 scope: no app imports them).
3. **Quarantine, then delete, the aggregator layer** (Phase 4). `classify-tools.ts` re-runs the research 14 §1.1
   classifier (browser launch, pixel decode, reads `tests/reports`, imports three). Every directory classified
   "aggregator-only" moves to `tools/_quarantine/<name>/` in one commit per family. Its `package.json` scripts are
   removed. CI references are listed. After one release cycle with no consumer restored, the quarantine is deleted.
4. **Flip to blocking.** G-REG blocks PRs once goldens exist for all 18 contract scenes plus 3 scenarios per
   deployable game. G-PANEL and G-REF bar items block releases.

### 10.2 Delete / quarantine list (exact)

Phase 0, delete now (fabricated or stub):

- `benchmarks/three-compat/` (entire tree), `tests/browser/three-compat-threejs-visual-parity.spec.ts`,
  `tests/browser/three-compat-threejs-runtime-parity.spec.ts`, `tools/three-compat-threejs-visual-parity/`,
  `tools/three-compat-threejs-runtime-parity/`. Remove the consumers' references in
  `tools/three-compat-broad-replacement-readiness/index.ts:16`, `tools/three-compat-completion-audit/index.ts:37` and
  `tools/three-compat-release-readiness/index.ts:39,62-64`. Those three tools go to quarantine in Phase 4. The
  scripts `three-compat:compare-threejs` (`package.json:335`) and its use inside `three-compat:release` (`:340`) are
  removed by lane 15's root-manifest batch (Q-15-1), filed in the same hour as the deletion PR.
- `benchmarks/production-runtime/` (entire tree), `tools/production-runtime-threejs-parity/`, and the
  `writeThreeJsParityReports` path in `tools/production-runtime-report-bridge/shared.ts:160`.
- `tools/external-parity-roadmap-visual-quality/`.
- `tools/external-parity-unity-unreal-parity/` and `.github/workflows/external-parity-external-engine-baselines.yml`.
- `tools/threejs-parity-threejs-inventory/` (the label-derived matrix), `docs/project/parity/threejs/parity-matrix.md`,
  and the "54 selected example-level rows, all marked matched" text in `docs/project/threejs-superiority-status.md`
  (owned). The same sentence in `README.md:218` (lane 15) is removed through Q-15-2.
- `tools/superiority-*` (11 directories): every decision is derived from labels or from prior `pass` flags.
- `tools/threejs-parity-same-scene-render/` (its script at `package.json:490` goes in Q-15-1).
- `tests/browser/muse3jsparity-301-visual.spec.ts`, `-visual-cases.ts` and `game-visual-superiority.spec.ts`
  (vacuous superiority; micro scenes at 600×380). Before deleting, keep their defect detectors (`clipping`,
  `replayInstability`) as candidate detectors in `metrics.py`, reimplemented on the new item format.
- The visual-render section of `tools/compare-engines/index.ts` (`:1734-1856`) and its thresholds (`:2110-2112`). The
  remaining bundle-size comparison may stay as a non-visual check.
- `apps/threejs-parity-lab/` (no three.js code). Referrers: `tools/threejs-parity-runtime-import-audit/index.ts`
  (lane 12, edited here); `tools/naming-taxonomy/contextualAliases.ts`, `tools/production-runtime-gallery-readiness/index.ts`,
  `tools/production-runtime-app-suite-readiness/index.ts` and `tests/browser/production-runtime-threejs-parity-lab.spec.ts`
  (lane 15, Q-15-3); `tools/agent-examples/index.ts` (lane 13, Q-13-1).

Test-file ownership for the deletions above (CONTRACTS §4.1 "creator" row). The specs
`tests/browser/{three-compat-threejs-visual-parity,three-compat-threejs-runtime-parity,external-parity-threejs-visual-parity}.spec.ts`
import only `benchmarks/` modules, and `tests/browser/muse3jsparity-301-visual{.spec,-cases}.ts`,
`game-visual-superiority.spec.ts` and `tests/unit/tools/muse3jsparity-acceptance.test.ts` import only
`tools/muse3jsparity-readiness/*` (verified: their `import` lines reference no `packages/**`). The creator rule
resolves owners by the first `packages/**` import and does not name tests with none. PRD 12 asks lane 15 (Q-15-4,
day 0) to add the explicit row "tests importing no `packages/**` module and only lane-12 modules → 12" to
`.github/QR_OWNERSHIP.json`. Until it lands, PRD 12 deletes the tools/benchmarks but keeps every module those tests
import (the tests still compile, are unscripted, and are excluded by name from the Phase 0 `rg` exit check), so no
lane waits on another.

Phase 0, relabel (keep the behaviour, remove the quality claim):

- `AURA3D-VERIFICATION-MATRIX.md:160-203`: "Mac GPU Visual QA 17/17 PASS" becomes "Liveness 17/17". The `§41 quality
  floor` notes move into the round-0 history record as admitted losses.
- `tests/browser/current-routes-route-health.spec.ts`: rename its report key from any `visual` wording to `liveness`
  (owner by the creator rule; PRD 12 files the rename as Q-15-5 if `check.mjs` resolves it outside lane 12).
- `tools/showcase-library/game-visual-qa.mjs` (lane 12 per §4.1): keep it as a detector input. Delete the status-quo
  calibration comment and thresholds (`:205-235`) and re-derive them from `ref-*` frames in Phase 2.
- `tools/head-to-head-*` (20 dirs): convert `verdict:` literals to `GateVerdict`. Delete hard-coded `observedLosses`
  prose (`tools/head-to-head-gltf-product-viewer/index.ts:35-36` and siblings). Keep the paired pages and
  `muse301-h2h.yml` as a reproducer, not a gate.

Phase 4, quarantine then delete:

- Every `tools/` directory that `classify-tools.ts` classifies as aggregator-only (estimated 340 of 449 at research 14
  time) and that is not on the keep list below. PRD 12 moves only directories §4.1 assigns to lane 12
  (`tools/{head-to-head,superiority,three-compat,muse3jsparity,external-parity,threejs-parity}-*`, `compare-engines`,
  `visual-baseline`, `premium-indie-reference`, `production-runtime-report-bridge`, `production-runtime-threejs-parity`).
  `CLASSIFICATION.json` lists every other aggregator-only directory with its §4.1 owner, and PRD 12 files one
  `qr-request` per owner (`foundation-*`, `production-runtime-*` remainder, `product-*` → 15; `animation-studio-*`,
  `prompt-*`, `agent-*` → 13; Q-15-6, Q-13-2). They are quarantined by their owners on their schedule.
- The 141 source-substring unit tests (`readFileSync` + `toContain`/`toMatch` on app or package source; research 14
  §1.2). A test survives only if it guards a real invariant (forbidden import, licence header, public export list).
  Each survivor carries a `// invariant:` comment that states the invariant.
- `muse301-*` workflow jobs that invoke deleted or quarantined tools (`muse301-aggregate.yml`,
  `muse301-evidence-closure.yml`, `muse301-final-readiness.yml`, `muse301-gallery.yml`, `muse301-l01.yml`,
  `muse301-publish.yml`, `remote-browser-301.yml`, `native-*-301.yml`). For each file: delete it, or reduce it to the
  steps that still run kept tools. `muse301-final-review.yml` is replaced by `quality-review.yml`.

Keep list (never quarantined by the classifier):

- `tools/release/*` hash binding, `tools/evidence-freshness`, `tools/muse3jsparity-readiness/evidence-lineage.ts`.
  They are folded into `EvidenceEnvironment` binding over Phases 3–4.
- `tools/flagship-visual-comparison`: its OCR mask and IM wrappers are ported to `metrics.py`.
- `tools/premium-indie-reference`, reworked so it no longer writes into the repo (§20.3).
- `tests/visual/rendering-pixels.spec.ts`, `tests/visual/shadow-cascade-motion.spec.ts`,
  `tests/visual/skinned-animation-pixels.spec.ts`: analytic GPU pixel tests. They move to the macos-14 job.
- `tools/quality-rebuild-capture`, `benchmarks/quality-rebuild`, `tools/quality-gate`.

### 10.3 Scripts (`tools/quality-gate/package.json`; root aliases by request)

Root `package.json` belongs to lane 15 (CONTRACTS §4.4). PRD 12 therefore defines its commands in
`tools/quality-gate/package.json` and `benchmarks/quality-rebuild/package.json` (both lane 12, private), runnable on
day 0 as `pnpm --dir tools/quality-gate <script>`:

- `capture` → `bash ../../benchmarks/quality-rebuild/ci.sh`
- `games` → `node ../quality-rebuild-capture/capture-games.mjs`
- `metrics` → `python -m metrics run` (cwd `metrics/`)
- `gate`, `calibrate`, `report`, `classify-tools`, `propose-golden` → `tsx --tsconfig ../../tsconfig.base.json src/cli.ts <sub>`
  (multi-file TS cannot run through `--experimental-strip-types`, §2.5)

Q-15-1 (`root-manifest` batch, filed day 0 and re-filed per deletion PR) asks lane 15 to:
- add root aliases `quality:capture`, `quality:games`, `quality:metrics`, `quality:gate`, `quality:calibrate`,
  `quality:report`, `quality:classify-tools` that delegate to the scripts above (these are the names C-33 and the
  other PRDs cite);
- replace `test:visual` (`package.json:251`) with `quality:gate`;
- delete every script that points at a deleted or quarantined lane-12 tool, plus the 7 scripts that point at missing
  files, toward the ≤ 80 target in `_sections/E`.

`tests/unit/quality-gate/scripts.test.ts` fails when any root script references a path that does not exist, except
paths listed in `tools/quality-gate/root-manifest-pending.json` with an open Q-15-1 issue number (reported as
`pending-root-manifest`, never silently passed). An entry older than 2 working days is listed in the checkpoint
report as an unresolved request (CONTRACTS §6.5).

## 11. Backward compatibility

- **Published packages.** No `@aura3d/*` public API is removed by this PRD. The §7.4 diagnostics fields are optional
  additions. `@aura3d/three-compat`'s `ThreeCompatibilityMatrix`/`ApproximationLedger` exports are not touched here;
  lane 15 owns the package surface.
- **Scripts and CI.** Removing `three-compat:compare-threejs`, `three-compat:release`, `threejs-parity:*`,
  `superiority:*` and `test:visual` breaks any external automation that calls them. None of them is invoked by the
  published CLI or templates (verified with `rg` as part of task T0.9). Each removal is listed in the release notes
  with its replacement or with "none: fabricated".
- **Reports.** Consumers of `tests/reports/*.json` produced by deleted tools lose those files. Nothing in
  `packages/` or `apps/` reads them (research 19 C18 scope). `aura3d-evidence-review` skill text that cites
  `check-deploy`/route-health as visual QA is rewritten by lane 13 (Q-13-3, C-40 facts `F-12-*`). This PRD supplies
  the replacement commands.
- **Benchmark IDs.** Scene IDs 01–18 and the `index.html?engine=&scene=` URL contract are unchanged. `ReadyPayload`
  gains fields and drops none.
- **Game routes.** The only route-facing change is that `?capture=`/`?review` look branches are now detected by the
  differential probe. Removing those branches is lane 09/14 route work (C-24, `eslint/qr/no-route-capture-flags.js`).
  While a route's `games.json` entry has `captureContractMigrated` false or absent, it is captured and reported
  `forbidden-capture-flag` (non-blocking); it is never silently passed.
- **Claims.** Every README/doc sentence that cites a deleted gate is removed in the same PR as the gate, so no claim
  outlives its evidence.

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table is replaced by contracts. CONTRACTS §8 row 12: PRD 12 has **no**
integrated dependency for its own gates; it measures other lanes. It builds against each consumed contract's PR 0a
stub and never waits for a provider's real implementation. What a stub can and cannot show decides whether a
criterion is standalone (§16.1) or integrated (§16.2). Facts from the old table that were really "other lanes need
this from PRD 12" moved into §12.1 (contracts provided) and the C-30 lane scene indices.

### 12.1 Contracts provided

| ID | Name | Surface PRD 12 provides | Stub that must keep working (PR 0a / 0b) | Real (PRD 12) | Consumers (counterpart lanes) |
|---|---|---|---|---|---|
| C-30 | Benchmark scene registry, ReadyPayload, report schema | `shared/contracts.ts` types (`ReferenceProfile`, `SceneOwner`, `BrokenControlId`, `MaskId`, `RegionId`, `StripSpec`, `RegistryEntry`, `ShadowReport`, `FrameTimingSample`, `ReadyPayloadV2`), `REGISTRY`, lane scene indices `scenes/prdNN/index.ts` (+ `aura3d/scenes/prdNN/`, `three/scenes/prdNN/`), `sentinels.json` | `REGISTRY` wraps today's 18 scenes from `scenes.ts` with `owner: "prd12"`, `status: "active"`, and appends each lane index; unknown new fields optional | `registry.ts` validation (unique ids, owner prefix, both adapters, runtime-required fields on active entries), masks, broken controls, showcase three references, calibration-gated `active` status, `main.ts` lane routing | 01-11 (each adds its own scenes), 14 (game-scene stress), 15 (§6.1 sentinel identity check) |
| C-31 | Diagnostics and evidence schema, sections registry (schema) | key table, no-fabricated-evidence rule (`null`, never a constant), sections `appliedLook` and `frameTiming` | every key present with `null`/empty; `qrFlags`/`degradations` real; `appliedLook` assembled from existing fields | `packages/engine/src/lanes/prd12.ts` registers `appliedLook` (from sections `output` 01, `lighting`/`shadows` 02, `exposure`/`post` 03, C-29 backend) and `frameTiming` (C-28 FrameStats + in-page rAF sampler); harness readers in `aura3d/common.ts` | all lanes (each implements its own key), 13 (lint), 14 (scorecards) |
| C-32 | VisualReview rubric and judgement schema | `tools/quality-gate/src/contracts.ts`: `GAME_VISUAL_CATEGORIES` (27, research 21), `GAME_NONVISUAL_CATEGORIES` (6), `JudgeIdentity`, `BenchmarkJudgement`, `GameJudgement`, `PanelRoundRecord`, `GateVerdict`, `RUBRIC_PROMPT_VERSION`; append-only `history/index.jsonl` | types + categories copied verbatim from research 21 | `rubric.ts` validators, `judge-prism.ts` (`judgeWithPrism`, screening), panel workflow, history, §7.3 extensions (CCR-12-1) | 13 (agent-eval `LookJudgement`), 14 (game scorecards; `@aura3d/game/art` `GameVisualCategory` must equal the 27) |
| C-33 | Capture harness interface | CLI `quality:capture --scenes … [--flags …]`, `quality:games --routes … [--flags …] [--strict] [--pr-build]`; `CaptureStepPlugin`; `games.schema.json`; workflow inputs `qr_flags`, `strict`; steps `strip.mjs`, `webm.mjs` | today's `capture-games.mjs`/`capture.mjs` + plugin loading + `--flags` passthrough (`a3d-qr=<list>`), PR 0b-3 | strict exit, masks, variants, strips, PR-build, differential probe, overlay merge (`games.prd12.json` under `games.json`), C-24 beacon readiness when present | 06 (`burst`), 08 (strips, WebM), 09 (beacon readiness), 13 (template and look capture), 14 (games) |
| — | Checkpoint dispatch (CONTRACTS §7) | `quality-checkpoint.yml`: Thursday 00:00 UTC on main HEAD, `qr_flags=all` and `none`, route `qrFlags`, metrics, vision screening, G-PANEL rounds every 4th with leave-one-out, `history/rounds/IC-<k>.json`, crash re-run with `all,-<lane>` | IC-0 identity run uses the PR 0 workflow as-is | full run + combined score | every lane (integrated acceptance is evaluated only here) |

Registry entries PRD 12 provides into other lanes' contracts: C-31 sections `appliedLook`, `frameTiming`; C-33
plugins `strip`, `webm`; C-30 scenes `prd12-ref-01..06`, `prd12-skinned-character-walk`; C-40 facts `F-12-*`
(quality commands, claim labels, liveness vs quality wording) for lane 13's skills.

Conformance suites (lane 15 owns the files; must pass for `stub` and `real`): `tests/unit/contracts/C-30-bench-registry.test.ts`,
`C-31-diagnostics.test.ts`, `C-32-rubric.test.ts`, `C-33-capture.test.ts`. PRD 12 adds
`tests/unit/contracts/impl/prd12-{registry,diagnostics,rubric,capture}.test.ts` for its real implementations.

### 12.2 Contracts consumed

| ID | Name | Provider lane | What PRD 12 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-05 | Output: tone mapping, exposure | 01 | `diagnostics().output` for `appliedLook.exposure/toneMapping`; tone-map option for the Aura `no-tonemap` control | section `null`; `ToneMappingId = "aces-filmic"` only | `appliedLook` falls back to the existing literal; `no-tonemap` is three-proxy standalone; Aura-side control integrated |
| C-10 | Lighting API and runtime | 02 | `diagnostics().lighting/shadows` → `ShadowReport`; `fallbackLightsActive` | section `null`; fallback detection from `createProductionRuntimeFallbackLights` (`index.ts:13363`) | `shadows: null` standalone is allowed and reported; real values integrated |
| C-22 | CameraRig live API | 08 | `cameraPose` names in scenario queries | scripted/route camera | scenario determinism is measured, never assumed (§6.7) |
| C-24 | GameShell, Session, capture context | 09 | readiness `window.__AURA3D_GAME__?.state === "playing"`; scenario query `?scenario=&seed=&freezeAt=&cameraPose=` | beacon absent → existing readiness probe (C-33 semantics); query parsed, not applied | scenario stills reported `scenario-nondeterministic` until a route honours them; probe/readiness logic standalone |
| C-27 | QualityTier settings | 11 | `?aura3d-quality=<tier>` per capture; tier column of §17 | real tier data; `"auto"` → high desktop, medium coarse pointer | standalone |
| C-28 | Device capabilities, FrameStats | 11 | `diagnostics().frame` for `frameTiming` (cpu/gpu ms, draw calls, readbacks) | counters partial; GPU ms `null` | rAF-only `frameTiming` standalone; GPU timer numbers integrated (or permanently `null` under ANGLE Metal) |
| C-29 | Renderer factory / backends | 11 | backend + render path in `appliedLook.renderPath`; WebGPU report-only lane | today's backend selection | `renderPath: null` allowed standalone |
| C-34 | Looks, lookLint | 13 | `diagnostics().look` recorded in `ready.json` for attribution | key `null` | informational only |
| C-35 | Art direction, game acceptance schema | 14 | `GameEntryV2` acceptance fields (`minOverall`, `minVisualCategory`) read by the game gate | schema with all fields optional; defaults `minOverall` 7, `minVisualCategory` 5 from CONTRACTS §8 row 14 | standalone (gate logic); per-game pass/fail integrated |
| C-36/C-38 | Compiler, app surface | 15 | `diagnostics().qrFlags`, `degradations` | real in PR 0 | standalone |
| §5 flags | `resolveQrFlags`, `?a3d-qr=` | 15 | capture `--flags`, `ReadyPayloadV2.qrFlags`, checkpoint `all` / `none` / `all,-<lane>` | real in PR 0a | standalone |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R18 (instance `node.size` fix is lane 15's; PRD 12
re-baselines scene 16), R22 (`games.json` data is lane 14's; PRD 12 owns `games.schema.json`), and §3.8 (the "19-*"
scene numbers are withdrawn; owner-prefixed ids only).

### 12.3 Requests to other lanes (non-blocking)

Filed on day 0 (or with the PR that creates the need) as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 12
never waits: each row names what PRD 12 does meanwhile, and anything that needs the change is evaluated at the next
checkpoint after it lands.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| CCR-12-1 | 15 + consumers 13, 14 | `tools/quality-gate/src/contracts.ts`: add optional `JudgeIdentity.role`, optional `BenchmarkJudgement.{itemId,blindKey,descriptions,differences,harnessFairness}`, optional `PanelRoundRecord.{schema,env,calibration,canaryPassed,aggregates}` (additive, §6.4) | C-32 | `types.ts` declares them as local `extends` interfaces; records validate against both |
| Q-15-1 | 15 | Root `package.json` (`root-manifest` batch): add `quality:*` aliases; `test:visual` (`:251`) → `quality:gate`; delete scripts for deleted/quarantined lane-12 tools (`:314`, `:335`, the `:340` segment, `:486`, `:490`, all `superiority:*`, `threejs-parity:*` for deleted dirs) and the 7 missing-path scripts; target ≤ 80 | §4.4 | `pnpm --dir tools/quality-gate <script>`; `root-manifest-pending.json` keeps `scripts.test.ts` honest |
| Q-15-2 | 15 | `README.md:218` and related lines: remove the "54 selected example-level rows, all marked matched" claim and any parity/visual-quality sentence backed by a deleted gate | §4.1 | the deleted gate's own docs (`docs/project/parity/`, owned) are removed in the same PR; README listed as open in the checkpoint report |
| Q-15-3 | 15 | Remove `apps/threejs-parity-lab` references from `tools/naming-taxonomy/contextualAliases.ts`, `tools/production-runtime-gallery-readiness/index.ts`, `tools/production-runtime-app-suite-readiness/index.ts`, `tests/browser/production-runtime-threejs-parity-lab.spec.ts` | §4.1 | the app dir is deleted only after this lands; until then it is unscripted and marked liveness-only |
| Q-15-4 | 15 | `.github/QR_OWNERSHIP.json`: explicit row "tests importing no `packages/**` module and only lane-12 modules → 12" (covers the §10.2 spec deletions) | §4.1 creator rule | imported modules kept; tests excluded by name from the Phase 0 `rg` check |
| Q-15-5 | 15 | `tests/browser/current-routes-route-health.spec.ts`: report key `visual*` → `liveness*` (only if `check.mjs` resolves it outside lane 12) | §4.1 | report wording fixed in `AURA3D-VERIFICATION-MATRIX.md` (owned) |
| Q-15-6 | 15 | Quarantine aggregator-only dirs owned by 15 that `CLASSIFICATION.json` lists (`foundation-*`, `production-runtime-*` remainder incl. `production-runtime-threejs-parity-readiness`, `product-*`, `renderer-*` SSIM-proxy tools, `webgpu-visual-parity`, `current-routes-threejs-parity`); drop their `structuralSimilarityProxy` gates | §4.1 | listed per PR in the step summary as `unowned-aggregator`; excluded from PRD 12's own 0-hit `rg` exit (owned paths only) |
| Q-15-7 | 15 | Declared R18 fix (`compiler/primitives.ts`, ex-`index.ts:14751`) carries the "re-baseline scene 16" label | R18, §6.1 | scene 16 golden marked `known-engine-bug`; G-REG compares against it as-is |
| Q-14-1 | 14 | `tools/quality-rebuild-capture/games.json`: per game `scenarios[3]` (`establishing`, `action`, `hero`), `hudSelectors[]`, `keyboardHintSelectors[]`, `captureContractMigrated`, `qrFlags[]`; PRD 12 supplies a proposed diff generated from `games.prd12.json` | C-33, R22 | `games.prd12.json` overlay (lane 12) supplies the same fields; `games.json` wins per field |
| Q-14-2 | 14 | `tools/quality-gate/src/scorecard.ts` / `forms/`: consume C-32 `GameJudgement` and `PanelRoundRecord` as-is | C-32 | `report.ts` renders the scorecard table from records |
| Q-13-1 | 13 | `tools/agent-examples/index.ts`: drop the `threejs-parity-lab` reference | §4.1 | as Q-15-3 |
| Q-13-2 | 13 | Quarantine lane-13 aggregator-only dirs from `CLASSIFICATION.json` (`animation-studio-*`, `prompt-*`, `agent-*` where classified) | §4.1 | listed as `unowned-aggregator` |
| Q-13-3 | 13 | `aura3d-evidence-review` skill (`packages/aura3d-cli/skills/**`, `.claude/skills`, …): cite `quality:*` outputs and panel rounds for quality; route health / `check-deploy` as liveness; from facts `F-12-01..05` | C-40 | facts published `proposed` in CONTRACTS Appendix B |
| Q-05-1 | 05 | Admit 2k CC0 HDRIs (studio, outdoor, night; Poly Haven) under `fixtures/environment-corpus/hdri/` with C-17 provenance, LFS | C-17 | 1k stand-ins + `RoomEnvironment` (§9.3); scenes record `assetTier: "stand-in"` |
| Q-05-2 | 05 | Admit a ground texture set (ref-03) and a street kit (ref-04; candidate Aura Clash brownstone kit) with licence records | C-17 | procedural ground and primitive street blocks (§9.3) |
| Q-11-1 | 11 | Name one device per tier (Low/Medium/High/Ultra) for §17.1 so tier budgets can become blocking | C-27, C-28 | budgets report-only except the CI-runner Low-desktop proxy row |
| Q-09-1 | 09 | Confirm the C-24 beacon writes `state: "playing"` only after the first presented frame of the scenario pose | C-24 | existing readiness probe + 2-frame settle |
| Q-LANES-1 | 01, 02, 03, 04, 07 | When `calibration.json` reports an uncovered (scene, control) pair in a lane's feature area, add an isolating scene in `scenes/prdNN/` | C-30 | item shown `calibration-broken` (visible, non-blocking for that lane) |

---

## Parallel execution

### Day-0 start conditions

PRD 12 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`benchmarks/quality-rebuild/shared/contracts.ts` and `shared/registry.ts` (stub), the empty lane scene indices
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prdNN/index.ts`, `sentinels.json`,
`tools/quality-gate/src/contracts.ts`, `tools/quality-rebuild-capture/{contracts.mjs,games.schema.json}`,
`packages/engine/src/contracts/{diagnostics,flags,game,quality,index}.ts` and `stubs/*`, the lane barrel
`packages/engine/src/lanes/prd12.ts`, the conformance suites C-30..C-33, `.github/QR_OWNERSHIP.json` and
`qr-contracts.yml`. PRD 12 is listed as the owner of several of these PR 0a files; the PR 0 lane (15) creates them
as stubs exactly per the catalog, and PRD 12 takes over editing them the moment PR 0a merges.

Day-0 work that needs no PR 0 at all (owned files): `tools/quality-gate/**` (metrics, calibrate, verdict, golden,
rubric, history, report, classify-tools), `three/lib/**`, `aura3d/lib/**`, `three/common.ts` fixes, Phase 0
deletions of lane-12 dirs, `AURA3D-VERIFICATION-MATRIX.md`, and all new workflows. Work that waits for a PR 0b part
(≤ 2026-10-07; written meanwhile in new lane-12 modules and wired after the merge):
- PR 0b-1: C-31 section registration (`app/diagnostics.ts` seam) for `appliedLook` / `frameTiming`.
- PR 0b-3: C-33 step-plugin loading and `--flags` passthrough in `capture-games.mjs` / `capture.mjs` (lane-12 files
  that the PR 0 lane edits once; PRD 12 rebases onto them) and the `qr_flags` workflow input.

### Owned files and directories (must match CONTRACTS §4.1 row 12)

`benchmarks/` default, incl. all of `benchmarks/quality-rebuild/` except lane scene dirs and `motion/`, plus
`benchmarks/three-compat/` and `benchmarks/production-runtime/`; `tools/quality-rebuild-capture/` (except
`games.json`, `route-composition.mjs`, `steps/burst.mjs`); `tools/quality-gate/` (except `src/scorecard.ts`,
`forms/`); `tools/{_quarantine,compare-engines,visual-baseline,premium-indie-reference,production-runtime-report-bridge,production-runtime-threejs-parity}/`,
`tools/{head-to-head,superiority,three-compat,muse3jsparity,external-parity,threejs-parity}-*`,
`tools/showcase-library/game-visual-qa.mjs`; `apps/threejs-parity-lab/`; `.github/workflows/` default (`quality-*`,
`browser-matrix`, `release`, `muse301-*`, `external-parity-*`, `remote-browser-301`, `native-*-301`);
`playwright*.config.ts` (except animation matrix); `.gitattributes`; `AURA3D-VERIFICATION-MATRIX.md`;
`docs/project/{claim-guidelines.md,parity/,threejs-superiority-status.md}`; `docs/project/aura3d-quality-rebuild/`
default (`research/`, `_sections/`, `evidence/` not lane-specific).
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd12,prd-12}/`,
`packages/*/src/lanes/prd12.ts`, `agent-api/compiler/diagnosticOnly.prd12.ts`, `packages/aura3d-cli/src/commands/prd12/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd12/`, `.github/workflows/qr-prd12-*.yml`,
`tests/qr/prd12/`, `tests/unit/contracts/impl/prd12-*`. New test files under `tests/` (e.g. `tests/unit/quality-gate/`)
belong to this lane by the creator rule; the 141 source-substring tests are lane 12 for deletion (§4.1 creator row).

Not owned, never edited (request or extension point only): root `package.json`, `README.md`, `fixtures/**`,
`tools/quality-rebuild-capture/games.json` (14), `tools/quality-gate/src/scorecard.ts` and `forms/` (14), every
`packages/**` file other than `src/lanes/prd12.ts`, `benchmarks/quality-rebuild/motion/` (08), other lanes'
`scenes/prdNN/` dirs, `tools/` default (15), `tools/release/*` (15, reused read-only), `tools/flagship-visual-comparison`
(15; its OCR mask and ImageMagick wrappers are re-implemented in `metrics.py`, not moved), `tests/visual/*` (creator
rule; run unchanged from a lane-12 workflow, T3.9), `.github/workflows/{qr-contracts,ci,test}.yml` (15).

Tasks of the earlier draft that edited files owned by other lanes were converted: to extension points (engine
diagnostics → C-31 sections from `lanes/prd12.ts`; `prd06-skinned-character-walk` → own `prd12-` scene; ref scenes →
own lane dirs; `games.json` fields → `games.prd12.json` overlay + C-33 schema; root scripts →
`tools/quality-gate/package.json`; moved `tests/visual/*` → referenced from `quality-gate.yml` with
`playwright.quality-gate.config.ts`) or to §12.3 requests (root `package.json`, `README.md`, HDRI/kit admission,
non-owned aggregator dirs, `threejs-parity-lab` referrers, ownership-row clarification, scorecard consumption).

### Extension points used in files owned by others

| Host file (owner) | Extension point | PRD 12 registrant |
|---|---|---|
| `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection({ key: "appliedLook" })`, `({ key: "frameTiming" })` | `packages/engine/src/lanes/prd12.ts` |
| `diagnostics().qrFlags` (15) | §5.2 `resolveQrFlags` result (read only) | `aura3d/common.ts` → `ReadyPayloadV2.qrFlags` |
| `@aura3d/game` beacon (09) | C-24 `window.__AURA3D_GAME__` (read only) | `capture-games.mjs` readiness |
| `games.json` (14) | C-33 schema fields (read only; PRD 12 owns the schema) | `capture-games.mjs` overlay merge |
| `tools/quality-gate/src/scorecard.ts` (14) | C-32 record types (lane 14 imports them) | `tools/quality-gate/src/contracts.ts` |
| CONTRACTS Appendix B (15) | C-40 rows `F-12-*` (append-only, no CCR) | this lane |

### Feature flags

PRD 12 runs **no runtime flags** (CONTRACTS §5.1: "PRD 12 runs no runtime flags. Its tooling changes ship directly
behind CLI options."). Its switches are tooling options: `--strict`, `--calibrate`, `--variants`, `--dprs`,
`--pr-build`, `--flags <qr-list>` (C-33), repository variable `QUALITY_GATE_MODE` (`report-only` | `blocking`), and
workflow input `qr_flags`. It **consumes** every lane flag as capture input: each scene's `qrFlags` default, the
`--flags` override, checkpoint sets `all`, `none`, each route's `qrFlags`, and `all,-<lane>` leave-one-out
(CONTRACTS §5.4). Flag-state transitions are recorded by lane 15 from PRD 12's checkpoint records; PRD 12 never edits
`flags.state.ts`.

### Stubs used

C-05 (`output` section `null`; aces literal), C-10 (lighting/shadows sections `null`; fallback-lights evidence real),
C-22 (route camera), C-24 (beacon absent → existing readiness; scenario query parsed, not applied), C-27 (real tier
data), C-28 (partial counters, GPU ms `null`), C-29 (today's backend), C-34 (`look` `null`), C-35 (all fields
optional), C-36/C-38 and §5 flags (real in PR 0). PRD 12's own stubs (C-30 registry wrapper, C-31 null sections,
C-32 types, C-33 PR 0b capture passthrough) stay valid for consumers at every step: real implementations only add
validation and fields.

### Integration checkpoints

PRD 12 dispatches every checkpoint (CONTRACTS §7) and is measured by them only for §16.2 items; none blocks a PRD 12
merge:
- IC-0 (2026-10-08): identity run, flags `none` vs `85aafcd0`, noise baseline from a fresh re-run of run
  37289688772. PRD 12 publishes the per-image ΔE2000 p99 noise floor used by the §6.1 sentinel check. Expected to
  reproduce research 23 (Aura ≈ 3.5 mean vs three r185 ≈ 5.4) and research 21 (games 1.5-4, mean ≈ 3.0).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): weekly integrated runs, vision screening only (recorded, cannot
  accept). First PRD 12 integrated signal: lane scenes appear in the registry and in `history/rounds/IC-<k>.json`.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds (2 humans + 1 vision model, leave-one-out).
  These are the only rounds that can accept any lane or game, and the rounds at which §16.2 (V13-V16 on later
  commits, judge drift, attribution) is evaluated.
- A crashed `all` run is re-run the same day with `all,-<lane>`. A checkpoint failure becomes a `qr-ic-regression`
  issue against the owning lane (attribution from leave-one-out or the failing diagnostics section). Open `qr-request`
  issues, including PRD 12's §12.3 rows, are listed in each report.

## 13. Implementation phases

Scheduling: Phases 0 and 1 both start on **day 0 (2026-10-05)** from the PR 0a branch and run in parallel; neither
needs the other or any other lane's real implementation. Phase 2 starts when Phase 1's mask pass exists (inside this
lane); Phases 3-5 are sequenced only by PRD 12's own artifacts (goldens need calibration; the release gate needs
panel records). No phase entry or exit criterion names another lane's delivery; anything that does is in §16.2.

### Phase 0: Remove false signals (1 week; day 0)

Delete the lane-12-owned fabricated suites, relabel liveness, and file Q-15-1..5, Q-13-1 (§10.2, Phase 0 lists).

Exit criteria (standalone):
- `rg -n "THREE_COMPAT_COMPARISON_SCENES|structuralSimilarityProxy|superiorityTargetsMet|visualScore >=|maxChangedPixelRatio: 1"`
  over the **lane-12-owned** paths (§Parallel execution "Owned files") returns 0 hits. Hits in non-owned paths are
  listed in the PR with their Q-15-6 / Q-13-2 issue; hits in the tests kept by Q-15-4 are listed by name.
- `tests/unit/quality-gate/scripts.test.ts` passes: no root script references a missing path except entries in
  `root-manifest-pending.json` with an open Q-15-1 issue.
- Owned docs (`docs/project/parity/`, `threejs-superiority-status.md`, `AURA3D-VERIFICATION-MATRIX.md`) contain no
  "54/54", "parity matrix" or "visual parity" claims backed by deleted tools; `README.md` is tracked through Q-15-2.
- `qr-contracts.yml`, `ci.yml` and `test.yml` on the PR are green (trunk stays green, CONTRACTS §6.1).

### Phase 1: Real metrics, masks, strict capture (2 weeks; day 0)

`metrics.py`, `three/lib/mask.ts`, `ReadyPayload` (C-30 `ReadyPayloadV2`) fields, `capture.mjs --strict`, the
GPU-string guard, the C-31 `appliedLook`/`frameTiming` sections, and the contract-tier fixes (§9.2). Day-0 inputs:
the 18 base scenes, PR 0a stubs, and the 3.0.1 commit `c08d8acb`.

Exit criteria: on the 3.0.1 baseline commit, the automated detectors reproduce the research 22/23 major findings
without any human input (acceptance V1, §16). Mask silhouette IoU between engines is ≥ 0.98 on every contract
scene, except 16 (instancing bug), which is reported as `mask-misaligned`.

### Phase 2: Showcase tier, reference scenes, calibration (3 weeks)

`three/lib/showcase.ts`, `prd12-ref-01..06` (with the §9.3 1k stand-ins; 2k assets swap in when Q-05-1/Q-05-2
land), broken-control variants, and `calibrate.ts`.

Exit criteria:
- Each `ref-*` three.js frame scores ≥ 7.0 (panel median of an admission round held by this lane, T2.7) and is marked
  `admittedAsReference: true`. A frame below 7.0 with a stand-in asset stays `admittedAsReference: false` and is
  re-judged after the asset swap; the phase exits once ≥ 4 of 6 are admitted.
- Every contract and `ref-*` scene has at least one discriminating metric on its `primaryCriterion` region.
  Non-discriminating pairs are listed in the calibration report.
- The self-test rejects all applicable broken controls on all active scenes.

### Phase 3: Goldens + blocking PR gate (2 weeks)

`golden.ts`, LFS goldens, `quality-gate.yml` on `pull_request`, `verdict.ts`, and `report.ts` step summaries.

Exit criteria:
- **Noise.** 10 consecutive reruns of an unchanged commit produce 0 G-REG failures.
- **Injected regressions.** A branch that injects each regression below, through public options only
  (`castShadow`/shadow `strength`, `environments.hdri({ intensity: 0 })`, `renderer.pixelRatio`), is blocked by G-REG
  on the stated scenes, and each block is recorded as a test run. No engine edit is needed.

  | Injected regression | Must be blocked on |
  |---|---|
  | Directional shadow strength halved | 01, 12 |
  | IBL intensity 0 | 03, 06, 13 |
  | DPR 0.5 | all scenes |

- **Golden updates need a panel.** A golden update without a panel record is refused by `proposeGoldenUpdate`.

### Phase 4: Panel rounds, history, aggregator quarantine (3 weeks, overlaps Phase 3)

`quality-review.yml`, `rubric.ts`, `judge-prism.ts`, `history.ts`, round 0 seeding, `classify-tools.ts`,
quarantine commits and script reduction.

Exit criteria:
- **Round 1.** Recorded with 2 named humans plus the vision model. The canary passed, calibration drift is ≤ 1.0 for
  every judge, and trend charts appear in the artifact.
- **Aggregator quarantine.** Lane-12 aggregator-only tool directories are in `tools/_quarantine/`; the non-owned ones
  are filed (Q-15-6, Q-13-2) with their `CLASSIFICATION.json` slice; the ≤ 80 root-script deletion list is filed as one
  Q-15-1 batch and `scripts.test.ts` reports the current count.
- **CI.** CI still green.

### Phase 5: Games on PR builds, scenarios, real devices, release gate (3 weeks)

`--pr-build`, scenarios (from `games.prd12.json`, overridden by `games.json`), HUD masks, the forbidden-param probe,
strips and video, the real-device lane, and the release gate wiring. All of it is built and tested against the
C-24 stub; scenario determinism is measured per game, not assumed.

Exit criteria (standalone):
- **PR games.** A PR's games are captured from its own build. Every game whose 3 scenario stills are deterministic
  (repeat noise ≤ floor) has goldens; every other game's stills are recorded `scenario-nondeterministic` with the
  measured noise, and its G-REG uses `01-title` shots where those are deterministic (expected for the 11 games
  whose title shot shows no motion; the set is fixed in Phase 1 by repeat captures, T1.13). Golden coverage of all 18
  games is §16.2 (integrated).
- **Real devices.** Real-device captures exist for 2 iOS and 2 Android devices, with measured rAF fps.
- **Release gate.** The release workflow refuses to publish without a passing G-PANEL round on the release commit.
  The refusal is proven by a dry run on the 3.0.1 commit, which must be refused because 0/18 games pass G1.

## 14. Task checklist

Phase 0:

- [ ] T0.1 Delete `benchmarks/three-compat/` (all three subdirectories), `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tests/browser/three-compat-threejs-runtime-parity.spec.ts`, `tools/three-compat-threejs-visual-parity/`, `tools/three-compat-threejs-runtime-parity/` in one commit titled `delete fabricated three-compat parity suite (research 19 C18)`.
- [ ] T0.2 File Q-15-1 (`root-manifest`): delete `three-compat:compare-threejs` (`package.json:335`) and remove the `pnpm three-compat:compare-threejs` segment from `three-compat:release` (`:340`); if `three-compat:release` then calls only quarantined tools, delete it too. Add the affected paths to `tools/quality-gate/root-manifest-pending.json` with the issue number in the same PR as T0.1.
- [ ] T0.3 Edit `tools/three-compat-broad-replacement-readiness/index.ts:16`, `tools/three-compat-completion-audit/index.ts:37` and `tools/three-compat-release-readiness/index.ts:39,62-64` so they no longer read the deleted reports. If the remaining logic only checks flags, move each directory to `tools/_quarantine/`.
- [ ] T0.4 Delete `benchmarks/production-runtime/`, `tools/production-runtime-threejs-parity/`, and the parity-report writer at `tools/production-runtime-report-bridge/shared.ts:160`. Update any script that called them.
- [ ] T0.5 Delete `tools/external-parity-roadmap-visual-quality/`, `tools/external-parity-unity-unreal-parity/`, `.github/workflows/external-parity-external-engine-baselines.yml` and their scripts.
- [ ] T0.6 Delete `tools/threejs-parity-threejs-inventory/`, `docs/project/parity/threejs/parity-matrix.md`, `tools/threejs-parity-same-scene-render/`, all 11 `tools/superiority-*` dirs. Their scripts (including `package.json:486,490`) go into Q-15-1 and `root-manifest-pending.json`. Remove the "54 selected example-level rows" sentence from `docs/project/threejs-superiority-status.md`; file Q-15-2 for `README.md:218`.
- [ ] T0.7 Copy the `clipping` and `replayInstability` formulas from `tests/browser/muse3jsparity-301-visual.spec.ts` / `-visual-cases.ts` / `game-visual-superiority.spec.ts` into `tools/quality-gate/metrics/legacy_detectors.md` as a spec for T1.9. File Q-15-4 (ownership row). Delete the three files (and `tests/browser/three-compat-threejs-{visual,runtime}-parity.spec.ts`, `external-parity-threejs-visual-parity.spec.ts`) in the PR that `check.mjs` accepts under lane 12; if it rejects them before Q-15-4 lands, keep the files and every module they import, and list them by name as the only allowed hits of the Phase 0 `rg`.
- [ ] T0.8 Remove the box-grid visual render (`tools/compare-engines/index.ts:1734-1856`) and its thresholds (`:2110-2112`). Keep the bundle-size comparison. Add `tests/unit/quality-gate/compare-engines-no-visual.test.ts`, which asserts that the output JSON has no `visual` key.
- [ ] T0.9 Run `rg -n "three-compat:compare-threejs|threejs-parity:inventory|superiority:" packages templates apps .github`. Each hit is removed or documented in the PR body.
- [ ] T0.10 Remove the `threejs-parity-lab` reference from `tools/threejs-parity-runtime-import-audit/index.ts` (owned). File Q-15-3 and Q-13-1 for the other referrers (§10.2). Delete `apps/threejs-parity-lab/` in the PR after both land; until then remove nothing else and mark it liveness-only in `AURA3D-VERIFICATION-MATRIX.md`.
- [ ] T0.11 Rewrite `AURA3D-VERIFICATION-MATRIX.md:160-203`: heading "Liveness (route alive, canvas non-blank, input changes state)". Delete "Visual QA PASS". Move the §41 quality-floor notes to `benchmarks/quality-rebuild/history/rounds/round-0.json` as `admittedLosses`.
- [ ] T0.12 In each `tools/head-to-head-*/index.ts` (20 dirs), replace the `verdict:` string with a `GateVerdict` value and delete the `observedLosses` string literals. Add `tests/unit/quality-gate/no-verdict-literals.test.ts`, which greps those files for `observedLosses: \[` with string literals and fails on any match.
- [ ] T0.13 Add `tests/unit/quality-gate/scripts.test.ts`: parse root `package.json` scripts, extract every `tools/…`, `tests/…` and `benchmarks/…` path, and assert that each exists unless it is listed in `tools/quality-gate/root-manifest-pending.json` with an open issue (then report `pending-root-manifest`).
- [ ] T0.14 Day 0: open the §12.3 issues (`qr-request` + `to:prdNN`) CCR-12-1, Q-15-1..7, Q-14-1, Q-14-2, Q-13-1..3, Q-05-1, Q-05-2, Q-11-1, Q-09-1, each stating file, exact change, contract and the "meanwhile" column.
- [ ] T0.15 Create `tools/quality-gate/package.json` (private, exact-pinned devDependencies) with the §10.3 scripts so every `quality:*` command runs as `pnpm --dir tools/quality-gate <script>` without root changes.

Phase 1:

- [ ] T1.1 Extend `benchmarks/quality-rebuild/shared/types.ts` exactly as in §7.1 (re-exporting C-30 from `shared/contracts.ts`; new fields optional in the type, enforced at runtime by `registry.ts` for `active` entries), and set `owner`, `referenceProfile: "contract"`, `masks`, `brokenControls` and `primaryCriterion` for scenes 01–18 in `shared/scenes.ts`. Use research 23's verdict sentence as the `primaryCriterion` (e.g. 05: "KHR_materials_transmission sphere shows the checker refracted through it").
- [ ] T1.2 Replace the PR 0a `shared/registry.ts` stub body with the real registry: wrap the 18 base scenes, aggregate every `scenes/prdNN/index.ts` lane index, validate unique ids / owner prefix / both adapters (`aura3d/scenes/prdNN/`, `three/scenes/prdNN/`) and quarantine (never throw on) a bad lane entry. Switch `main.ts` routing (registry lookup plus a second glob `./{aura3d,three}/scenes/*/*.ts`) and `capture.mjs` discovery (`window.__QR_SCENES__`) to read it. Must keep `tests/unit/contracts/C-30-bench-registry.test.ts` green.
- [ ] T1.3 In `three/common.ts:130`, set `THREE.PCFShadowMap`. Add the `fetchOnce(url)` cache, use it in `loadHdri` and the GLTF loader, and verify that `failedRequests` is empty for scenes 02–09 in the CI report.
- [ ] T1.4 In `aura3d/common.ts`, add the `ReadyPayload` fields from §7.1 (C-30 `ReadyPayloadV2`, incl. `qrFlags` from `diagnostics().qrFlags`). Read `app.diagnostics().appliedLook` (C-31); a `null` field stays `null`/`"unknown"`, never a constant. Use the same `fetchOnce` cache.
- [ ] T1.5 Implement `three/lib/mask.ts` `renderMasks(spec, scene, camera, kinds: MaskId[]): Promise<Record<MaskId, Uint8Array>>` with a separate non-AA `WebGLRenderer`, as in §8.1–8.2. Expose it at `index.html?engine=three&scene=<id>&pass=mask`.
- [ ] T1.6 Rewrite `capture.mjs`:
  - capture `frame.png`, `*.mask.png` and `ready.json` per (scene, engine, dpr);
  - add the `--strict`, `--calibrate`, `--variants` and `--dprs` flags;
  - fail on GPU strings matching `/SwiftShader|llvmpipe|Software/i`;
  - write `items.json` in the `CapturedItem[]` format.
- [ ] T1.7 Create `tools/quality-gate/metrics/requirements.lock`, generated with `pip-compile --generate-hashes`, with exact pins: `lpips==0.1.4`, `torch` (CPU wheel), `numpy`, `scikit-image`, `Pillow`, and NVlabs `flip-evaluator` (the official FLIP pip package). Record each exact version in the lock after checking it on PyPI. No unpinned ranges.
- [ ] T1.8 Implement `metrics.py` `flip`, `ssim`, `msssim`, `lpips_alex` and `delta_e2000` with optional masks. Add the CLI `python -m metrics run --items items.json --out metrics.json`.
- [ ] T1.9 Implement every detector in §6.5 in `metrics.py` `detectors()`, each as a pure function on numpy arrays with unit tests (T-U2).
- [ ] T1.10 Add a `metrics` job (ubuntu-latest, CPU) to the workflow. It downloads the capture artifact, runs `quality:metrics`, and uploads `metrics.json`.
- [ ] T1.11 Write `tools/quality-gate/src/types.ts` (§7.2–7.3) and `verdict.ts` `evaluateGates` with G-REF bar R3 checks:
  - `shadowContrast` ratio within ±15%;
  - FLIP on object masks ≤ 0.10;
  - ΔE2000 ≤ 3 in lit regions;
  - specular energy on metal masks within ±20%.

  These run in report-only mode.
- [ ] T1.12 Run the strict benchmark on the 3.0.1 baseline commit (`c08d8acb` engine) on `macos-14`. Commit `benchmarks/quality-rebuild/history/baselines/3.0.1-detectors.json` (numbers only) and confirm acceptance V1.
- [ ] T1.13 Capture each game's `01-title` 5 times in one run; record the deterministic set (FLIP between repeats ≤ floor) in `tools/quality-rebuild-capture/games.prd12.json` as `titleDeterministic: true`.
- [ ] T1.14 In `packages/engine/src/lanes/prd12.ts`, register C-31 sections `appliedLook` (assembled per §7.4 from other sections, `null` where they are `null`) and `frameTiming` (C-28 `diagnostics().frame` + a 120-frame rAF sampler started on demand only). Add `tests/unit/contracts/impl/prd12-diagnostics.test.ts` (schema-valid with every other section stubbed; no constant where a source is `null`; no section throws on a disposed app). Engine bundle delta ≤ 1 KB gzip (§17.2).
- [ ] T1.15 Add `tests/unit/contracts/impl/prd12-{registry,rubric,capture}.test.ts` for the real C-30, C-32 and C-33 implementations; they must pass with every other lane's stub.
- [ ] T1.16 Keep `benchmarks/quality-rebuild/sentinels.json` (6 ids: 01, 03, 08, 12, 13, 16; one per major engine area) current and document the IC-0 ΔE2000 p99 tolerance next to it for the §6.1 flag-off identity check.
- [ ] T1.17 Create `.github/workflows/quality-checkpoint.yml`: `schedule: cron "0 0 * * 4"` + `workflow_dispatch`; calls `quality-rebuild-capture.yml` with `qr_flags=all` and `none` (and each route's `qrFlags`), runs metrics and vision screening, writes `history/rounds/IC-<k>.json` and appends `history/index.jsonl` via a bot PR; on G-PANEL rounds (IC-4, 8, 12, …) adds `all,-<lane>` captures; on an `all` crash re-runs with `all,-<lane>` the same day; files `qr-ic-regression` issues with attribution. Dry-run it for IC-0 by 2026-10-08.

Phase 2:

- [ ] T2.1 Implement `three/lib/showcase.ts` `runThreeShowcase` (§9.1). Route `index.html?engine=three&scene=<id>&profile=showcase`.
- [ ] T2.2 Wire the §9.3 day-0 stand-ins (1k HDRIs, `RoomEnvironment`, procedural ground, primitive street) and `assetTier` in `ready.json`. Q-05-1/Q-05-2 (filed T0.14) deliver the 2k HDRIs and kits; when an admitted asset appears in `fixtures/environment-corpus/hdri/`, add it to the `ci.sh` LFS include list and re-run admission for that scene.
- [ ] T2.3 Implement `prd12-ref-01..06` per §9.3 in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd12/`, exported from `scenes/prd12/index.ts`, with `owner: "prd12"`, `referenceProfile: "showcase"`, `dprs: [1, 2]`, and a strip on ref-03 and ref-06. Add `prd12-skinned-character-walk` (§9.2) the same way.
- [ ] T2.4 Implement Aura-side broken-control variants in `aura3d/lib/variants.ts` using only public API. Variants that cannot be expressed set `variant: "unavailable"` in the capability log.
- [ ] T2.5 Implement the three-side broken-control variants (`no-shadows`, `no-ibl`, `dpr-half`, `no-aa`, `no-tonemap`, `flat-sky`, `albedo-only`) in `three/lib/variants.ts`, applied by `three/common.ts` and `three/lib/showcase.ts`, selected by the `&variant=` query parameter.
- [ ] T2.6 Implement `calibrate.ts` `calibrate()` per §6.4 and write `calibration.json`. Add the self-test that exits 1 with `calibration-broken`.
- [ ] T2.7 Hold a panel admission round for `ref-*` three.js frames. Record it in `history/rounds/`, and set `admittedAsReference` only where the median is ≥ 7.0.
- [ ] T2.8 Re-derive `tools/showcase-library/game-visual-qa.mjs` thresholds from admitted `ref-*` and reference stills. Delete the comment block at `:207-235`.

Phase 3:

- [ ] T3.1 Implement `golden.ts` (`loadGoldens`, `compareToGolden`, `proposeGoldenUpdate`). `proposeGoldenUpdate` throws unless a `PanelRoundRecord` aggregate for each item is `pass`, or is no worse than the current golden's aggregate.
- [ ] T3.2 Track `benchmarks/quality-rebuild/goldens/**/*.png` in LFS via `.gitattributes`, and add `goldens/manifest.json` (tracked, non-LFS).
- [ ] T3.3 Create `.github/workflows/quality-gate.yml` (§15.3): `pull_request` + `push: main` + `workflow_call`, with no secrets. Jobs:
  - `capture-bench` (macos-14)
  - `capture-games-{1,2,3}` (macos-14, 6 games each)
  - `metrics` (ubuntu-latest)
  - `gate` (ubuntu-latest, runs `quality:gate`)
- [ ] T3.4 Remove `continue-on-error: true` from `.github/workflows/quality-rebuild-capture.yml:78,83,137` and convert it into the reusable capture workflow called by `quality-gate.yml`.
- [ ] T3.5 Make `report.ts` write a `$GITHUB_STEP_SUMMARY` table containing, for each item: verdict, failing metric/region, value vs threshold, and links to the side-by-side and diff images.
- [ ] T3.6 Create the test branch `qr/injected-regressions` with three commits (shadow strength halved, IBL 0, DPR 0.5) through public options or test-only engine flags. Assert in `tests/unit/quality-gate/injected-regressions.test.ts`, which reads the recorded gate outputs, that each commit is blocked on the scenes listed in Phase 3.
- [ ] T3.7 Check runner drift. Record `ImageOS` and `ImageVersion` in `EvidenceEnvironment`. When they differ from `GoldenManifest.runnerImage`, the gate prints `runner-image-changed`, runs calibration, and blocks only on failures that exceed the re-calibrated thresholds.
- [ ] T3.8 Remove `pnpm test:visual` from `.github/workflows/browser-matrix.yml:101`. The `test:visual` → `quality:gate` swap at `package.json:251` is in Q-15-1; add `tools/visual-baseline/index.ts` to `root-manifest-pending.json`, then delete `tools/visual-baseline/`.
- [ ] T3.9 Run `tests/visual/rendering-pixels.spec.ts`, `shadow-cascade-motion.spec.ts` and `skinned-animation-pixels.spec.ts` unchanged (files are not moved or edited; creator-rule owners) from a macos-14 job in `quality-gate.yml` through the new `playwright.quality-gate.config.ts`, whose global setup fails the run on a GPU string matching `/SwiftShader|llvmpipe|Software/i`.

Phase 4:

- [ ] T4.1 Implement `rubric.ts` with `RUBRIC_PROMPT_VERSION`, the research 23 benchmark template and the research 21 game template, verbatim from those files, plus validators for `BenchmarkJudgement` and `GameJudgement`. The `critique` field must be ≥ 200 chars.
- [ ] T4.2 Implement `judge-prism.ts` using Kiro Prism `/v1/messages`. Send base64 `image` blocks: Aura and reference as separate 1280×720 JPEG q90 images, never one 2560-wide composite, because Prism resizes images over 2,000 px on the longest edge and allows ≤ 4 images per turn within an 800,000-byte image lane (`/Users/gurbakshchahal/kiro-prism/API.md:289-301`). Set headers `X-Prism-Client: aura3d-quality-gate` and `X-Prism-Job-Type: image-review`. Read the key from env `PRISM_API_KEY`. Never log it.
- [ ] T4.3 Make canary item 0 of each vision session a fixed frame `benchmarks/quality-rebuild/refs/canary-01.png` (generated in-repo: three primitives, known colours). If the model's description fails 3 required tokens, abort the round with `canaryPassed: false`.
- [ ] T4.4 Implement blind A/B in `rubric.ts` `buildPacket(item, seed)`: randomize left/right, strip labels, and store `blindKey` in the record only.
- [ ] T4.5 Implement the calibration set in `rubric.ts` `CALIBRATION_ITEMS` (§6.8) and a drift computation against the frozen baseline in `history/calibration-baseline.json`.
- [ ] T4.6 Create `.github/workflows/quality-review.yml`:
  - `workflow_dispatch` only;
  - `environment: quality-review` with required reviewers;
  - downloads artifacts from a named `quality-gate` run, runs the vision judge, opens a PR adding `history/rounds/<round>.json` plus the human-judgement stubs;
  - humans fill their judgements through a JSON form validated by `rubric.ts` in that PR.

  Operator action, recorded and not performed by agents: create a dedicated Prism key as the `quality-review` environment secret `PRISM_API_KEY`.
- [ ] T4.7 Implement `history.ts` `appendRound` and `trend`. Have `report.ts` render per-item trend SVGs (median per round, worst 3 categories). Seed round 0 from research 21/23 with `panel: "vision-only-single-judge"`.
- [ ] T4.8 Implement `classify-tools.ts`: walk `tools/*`, flag browser-launch, pixel-decode, reads-`tests/reports` and imports-three per research 14 §1.1 regexes, and write `tools/_quarantine/CLASSIFICATION.json`.
- [ ] T4.9 For each lane-12 family (`external-parity-*`, `threejs-parity-*`, `three-compat-*`, `head-to-head-*` aggregators, `superiority-*` remainder, `muse3jsparity-*` minus the keep list, `production-runtime-report-bridge`), make one commit `quarantine <family> aggregator-only tools` that moves the dirs to `tools/_quarantine/`, removes their workflow steps (owned workflows) and adds their script paths to Q-15-1 / `root-manifest-pending.json`. For non-owned families (`production-runtime-*` remainder, `foundation-*`, `product-*` → 15; `animation-studio-*`, `prompt-*` → 13) attach the `CLASSIFICATION.json` slice to Q-15-6 / Q-13-2.
- [ ] T4.10 Triage the 141 source-substring unit tests. Delete each test without an invariant, and add the `// invariant:` comment to each survivor. `tests/unit/quality-gate/source-substring-audit.test.ts` fails if a `readFileSync(...apps|packages|templates...)` + `toContain` test lacks the comment.
- [ ] T4.11 Supply lane 15 the full script-deletion list for the ≤ 80 target as one Q-15-1 batch (generated by `classify-tools.ts --scripts`). `scripts.test.ts` reports the count every run and asserts ≤ 80 once the batch is merged.
- [ ] T4.12 Delete or trim the `muse301-*.yml`, `remote-browser-301.yml` and `native-*-301.yml` steps that call quarantined tools. Replace `muse301-final-review.yml` with `quality-review.yml`.

Phase 5:

- [ ] T5.1 In `capture-games.mjs`, add `--pr-build` as the default on `pull_request`, using `buildGame()` for every selected game. A failed build marks `source: production-fallback` and fails `--strict`.
- [ ] T5.2 Install the forbidden-param init script: wrap `URLSearchParams.prototype.get/has/getAll` and record the keys read. Fail runs with reads of `capture`, `review` or `debug`.
- [ ] T5.3 Write `scenarios[]` (3 per game: `establishing`, `action`, `hero`), `hudSelectors[]` and `keyboardHintSelectors[]` for all 18 games in `tools/quality-rebuild-capture/games.prd12.json`; merge under `games.json` (lane 14 wins per field) and validate the merged result against `games.schema.json` in `--validate`. Attach the generated diff to Q-14-1. Scenario stills are captured for every game from day 1 of Phase 5; each is golden-eligible only when measured deterministic (§6.7).
- [ ] T5.4 Implement C-33 step plugins `tools/quality-rebuild-capture/steps/strip.mjs` (`{ strip: { frames: 12, intervalMs: 100 } }`) and `steps/webm.mjs` (`{ webm: { seconds: 5 } }`, Playwright `recordVideo`) and use them around `04-action`. Upload them as artifacts. Plugin names stay unique (`C-33-capture.test.ts`).
- [ ] T5.5 Read `diagnostics().frameTiming` (T1.14) in game captures. Flag `fps-self-report-mismatch` when the route's self-reported fps differs from the harness rAF sampler by more than 20%.
- [ ] T5.6 Real-device lane: provision AWS Device Farm (technical fit; no Azure equivalent) through `/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`, profile `auraone-production-operator`, tagged `project=aura3d-quality-gate`, ephemeral. Add `.github/workflows/quality-devices.yml` (`workflow_dispatch`), which runs the 18 games' `03-mid` timeline on 2 iOS Safari and 2 Android Chrome devices. If provisioning is denied, record the denial and the minimal grant in the PR (policy §2), and keep the emulated lane.
- [ ] T5.7 Wire the release: `.github/workflows/release.yml` must call `quality-gate.yml` on the release commit and require `history/rounds/<latest>.json` with `aggregates[*].verdict === "pass"` for every bar item. Dry-run on 3.0.1, which must be refused.

## 15. Test requirements

### 15.1 Unit tests (vitest, `tests/unit/quality-gate/`; ubuntu-latest, no GPU needed)

- **T-U1 schema.** Every type in §7.2–7.3 has a validator. Round-trip fixtures in `tests/unit/quality-gate/fixtures/`.
- **T-U2 metrics (pytest, `tools/quality-gate/metrics/test_metrics.py`).**
  - Identical images give FLIP 0, SSIM 1, ΔE 0.
  - Shifting a 64×64 synthetic shadow from luma 30 to 120 changes `shadowContrast` from ≈0.25 to ≈0.95.
  - A flat sky gives `skyVariance` 0, and a gradient sky > 5.
  - Empty particle masks give `subjectPresence` 0.
  - A 1-px stair-step edge gives higher `edgeAliasing` than a 4× supersampled edge.
  - Synthetic 8-frame strips with and without ±10-level noise separate `temporalFlicker` by ≥ 5×.
- **T-U3 calibration.** Synthetic metric sets where `3·N > 0.5·Bmin` yield `discriminating: false`. The self-test
  exits 1 when any active threshold accepts a broken control.
- **T-U4 golden.** `proposeGoldenUpdate` throws without a panel record and throws when the new median is below the
  old one. The manifest's `supersedes` chain is preserved.
- **T-U5 verdict.** An item with `admitted-loss` can never be `pass`, even when all metrics pass. A run with
  `gpuRenderer` matching SwiftShader yields `blocked-runner`.
- **T-U6 rubric.** Validators reject a missing category, a score outside 0–10 or not in 0.5 steps, and a critique
  under 200 chars. `buildPacket` with the same seed is deterministic, and with different seeds the A/B order flips
  for about 50% of items over 100 seeds.
- **T-U7 repo hygiene.** `scripts.test.ts`, `no-verdict-literals.test.ts`, `compare-engines-no-visual.test.ts` and
  `source-substring-audit.test.ts` (T0.8, T0.12, T0.13, T4.10).
- **T-U8 classifier.** `classify-tools.ts` against a fixture tree with one tool per class.

### 15.2 Browser tests (remote only: GitHub Actions `macos-14`, ANGLE Metal; never on a developer Mac, never SwiftShader)

- **T-B1 contract capture.** All 18 contract scenes × 2 engines produce READY. Masks align (IoU ≥ 0.98; scene 16 is
  expected `mask-misaligned` while the R18 bug is present, and the test asserts whichever state the checked-out engine
  is in). `ready.json` validates against C-30 `ReadyPayloadV2`.
- **T-B2 showcase capture.** `ref-01..06` × 2 engines × DPR 1/2 produce READY with no console errors on the three.js
  side.
- **T-B3 variants.** Each declared broken control renders, and its `ReadyPayload.variant` matches.
- **T-B4 noise.** 3 repeat captures per scene have FLIP ≤ floor on every scene (determinism check).
- **T-B5 game capture.** `--strict --pr-build` for the 18 games at 1920×1080, 1280×720 and 390×844@3. The
  forbidden-param probe is active. Each game produces the `requiredShots` (`02-opening`, `03-mid`, `04-action`) or a
  named failure.
- **T-B6 analytic pixels.** The `tests/visual/*` specs run through `playwright.quality-gate.config.ts` (T3.9).
- **T-B7 flags.** One scene captured with `--flags none` and `--flags all` records the resolved sets in
  `ready.json.qrFlags`; with every lane flag in `dev` state the two frames are identical within the IC-0 tolerance
  (this is the §6.1 sentinel check run on PRD 12's own CI).
- **T-B8 lane scenes.** A fixture lane index under `tests/qr/prd12/fixtures/scenes/` with one valid and one
  adapter-less scene: the valid one captures, the other is `quarantined` and the run still succeeds.

### 15.2a Conformance (both stub and real, `qr-contracts.yml`)

`tests/unit/contracts/C-30-bench-registry.test.ts`, `C-31-diagnostics.test.ts`, `C-32-rubric.test.ts`,
`C-33-capture.test.ts` (lane 15 files) and `tests/unit/contracts/impl/prd12-*.test.ts` (lane 12) pass on every PRD 12
PR, on ubuntu-latest for unit and macos-14 (Chromium, ANGLE Metal) for browser conformance.

### 15.3 Workflow layout

| Workflow | Trigger | Runners | Secrets | Blocking |
|---|---|---|---|---|
| `quality-gate.yml` | `pull_request`, `push: main`, `workflow_call` | macos-14 ×4 (bench + 3 game shards), ubuntu-latest ×2 (metrics, gate) | none (safe on fork PR code) | G-REG blocks PRs from Phase 3; G-REF report-only on PRs |
| `quality-rebuild-capture.yml` | `workflow_call`, `workflow_dispatch` (inputs `qr_flags`, `strict`, C-33) | macos-14 | none | via caller |
| `quality-checkpoint.yml` | `schedule` Thu 00:00 UTC, `workflow_dispatch` | macos-14 (via capture workflow), ubuntu-latest | none for capture/metrics; vision screening through `quality-review` environment | never blocks merges (CONTRACTS §7) |
| `quality-review.yml` | `workflow_dispatch` only | ubuntu-latest | `PRISM_API_KEY` in protected environment `quality-review` | produces panel records |
| `quality-devices.yml` | `workflow_dispatch` | ubuntu-latest + AWS Device Farm | `auraone-production-operator` role via OIDC (never a stored key; never on `pull_request`) | report-only until Phase 5 exit |
| `release.yml` | existing | existing | existing | refuses publish without a passing round |

Shard sizing must respect the hosted macOS concurrency limit for the account's plan. Shards queue rather than fail.
Wall-time budget: bench job ≤ 45 min, each game shard ≤ 60 min, metrics ≤ 20 min.

## 16. Acceptance: standalone and integrated

These test the **infrastructure**. Each one requires the gate to reach a known answer on known inputs. The visual
quality of Aura3D itself is accepted by lanes 01-11 and 14 at the CONTRACTS §7 checkpoints through the gates built
here, never by PRD 12.

### 16.1 Standalone acceptance (this lane alone, with stubs; gates PRD 12 merges)

Every row is reproducible from PRD 12's own files, the 3.0.1 commit `c08d8acb`, the PR 0a stubs and the macos-14
runner. None needs another lane's real implementation. These rows prove the infrastructure sees known defects; they
are not, and support no claim of, three.js-level visual quality for Aura3D (CONTRACTS §7).

| ID | Input | Reference | Criterion (automated) | Threshold | Human/vision review |
|---|---|---|---|---|---|
| V1 | 3.0.1 baseline, contract scenes 01, 02, 08, 12, 17, 18 | three r185 contract frames | `shadowContrast` Aura/three ratio flags `reference-gap` | Aura ratio ≥ 0.85 vs three ≤ 0.55 (research 22: Aura shadows 7–10% darker, three 49–80%) → all 6 flagged | Panel confirms flag ↔ research 23 class `major-aura3d-deficiency` on ≥ 5 of 6 |
| V2 | 3.0.1, scenes 09, 13 | three (HDRI background) | `skyVariance` Aura < 1.0 while three > 5 | both flagged | — |
| V3 | 3.0.1, scene 14 | three | `subjectPresence` Aura < 0.05 | flagged | — |
| V4 | 3.0.1, scene 16 | three | object-mask IoU < 0.5 → `mask-misaligned` + FLIP frame > 0.3 | flagged | — |
| V5 | 3.0.1, scene 05 transmission-sphere object mask | three | ΔE2000 on sphere mask > 10 (luma 91 vs 174) | flagged | — |
| V6 | 3.0.1, scene 07 swatch masks | three | ΔE2000 > 6 and green-channel gradient missing | flagged | — |
| V7 | 3.0.1, scene 06 rough half (r ≥ 0.6) masks | three | `roughnessResponse` monotonicity fails or mean luma ratio < 0.85 | flagged | — |
| V8 | 3.0.1, scenes 03, 11 | three | no `major` detector flags | ≤ 1 minor flag each (vision: 6.5 vs 7.0; 5 vs 5) | Panel agrees within ±1.0 |
| V9 | Any active scene's approved golden + each broken control | golden | G-REG rejects every applicable broken control | 100% | — |
| V10 | Unchanged commit × 10 reruns | golden | G-REG false-positive rate | 0 / 10 | — |
| V11 | Games 3.0.1: Courier Rush 1920×1080 shots | — | `blankOrBlack` > 0.9 on the black frames research 21 reports | flagged | Panel `overall_visual_quality` ≤ 2.5 |
| V12 | Games 3.0.1: all 18 at 1920×1080 | — | measured rAF fps reported; Deep Recovery < 2 fps flagged against the Low-desktop proxy target (≥ 55 fps) | 15 of 18 below 30 fps reproduced (report.slim.json) | — |
| V13 | Panel round 1 on 3.0.1 benchmark | three contract | Panel medians vs research 23 scores | |Δ| ≤ 1.0 on ≥ 15 of 18 scenes; class agreement ≥ 14 of 18 | 2 humans + vision required |
| V14 | Panel round 1 on 3.0.1 games | — | Panel `overall_visual_quality` vs research 21 | |Δ| ≤ 1.0 on ≥ 15 of 18 | required |
| V15 | Calibration set | known-bad / known-good / broken controls | broken controls score ≥ 2 below source; known-bad ≤ 2.5; `ref-*` ≥ 7 | all | required |
| V16 | `prd12-ref-01..06` three showcase (stand-in or admitted assets) | — | admission | panel median ≥ 7.0 on ≥ 4 of 6 | required |
| V17 | Differential probe on 3.0.1 games | default vs `?capture=review` title | FLIP(default, review) > 3× title noise | Rooftop Buckets flagged; Turbo Drift and Orbital Defense not flagged | — |
| V18 | Contracts provided | stubs of all other lanes | C-30..C-33 conformance + `impl/prd12-*` | green on stub and real | — |
| V19 | Trunk safety | PRD 12 PRs | `qr-contracts.yml`, `ci.yml`, `test.yml`; ownership check | green; 0 edits outside §Parallel execution "Owned files" | — |
| V20 | Checkpoint machinery | IC-0 on 2026-10-08 | `quality-checkpoint.yml` writes `history/rounds/IC-0.json` (valid `PanelRoundRecord`) with `none` captures of 18 scenes + 18 games | record present; noise floor published | — |

V13-V15 are standalone: the panel round on the 3.0.1 commit is convened by PRD 12 itself and needs no other lane.
A failing V1–V8 or V11–V12 means the infrastructure is blind to a defect the vision judges already found. Phase 1
cannot exit until all of them pass.

### 16.2 Integrated acceptance (checkpoints only; never blocks a PRD 12 merge)

Evaluated at CONTRACTS §7 checkpoints on main HEAD. A miss becomes a `qr-ic-regression` or `qr-request` issue and
nothing else.

| ID | Criterion | Needs (contract / request) | Checkpoint |
|---|---|---|---|
| I1 | Every lane's registered scenes (C-30) capture in both engines in the weekly run, with `qrFlags` recorded, and appear in `history/rounds/IC-<k>.json` | lanes 01-11 scene indices | IC-1 onward |
| I2 | Leave-one-out attribution on a G-PANEL round assigns each flags-all minus flags-none delta > 1.0 to exactly one lane (or flags `interaction`) | all lane flags | IC-4, IC-8, IC-12 |
| I3 | `appliedLook` and `frameTiming` report non-null `exposure`, `toneMapping`, `shadows`, `renderPath` and GPU ms where the platform allows | C-05 (01), C-10 (02), C-13 (03), C-28/C-29 (11) real | first checkpoint after each lands |
| I4 | Aura-side `no-tonemap` and `albedo-only` controls captured on Aura (not three-proxy) and rejected by G-REG | C-05/C-13 output options | first checkpoint after they resolve |
| I5 | 3 deterministic scenario stills with goldens for each of the 18 games | C-24 real + routes honouring it (09, 14); Q-14-1 | per game, as routes migrate |
| I6 | Differential probe reports 0 `forbidden-capture-flag` on every route marked `captureContractMigrated: true` | 09, 14 route migration | per game |
| I7 | `prd12-ref-*` re-admitted with 2k assets, panel median ≥ 7.0 on all 6 | Q-05-1, Q-05-2 | first G-PANEL round after admission |
| I8 | Scene 16 re-baselined (IoU ≥ 0.98) after the declared R18 fix | R18 (15) | first checkpoint after the fix |
| I9 | §17.1 tier budgets blocking on named devices | Q-11-1, C-27 | after devices are named |
| I10 | Panel medians on later checkpoints keep judge drift ≤ 1.0 and canary pass rate 100% across ≥ 2 consecutive G-PANEL rounds | — (panel availability) | IC-4, IC-8 |

The parity honesty rule (CONTRACTS §7) applies: none of I1-I10, nor any metric threshold, supports a claim that
Aura3D matches three.js. Only a G-PANEL median within the stated margin, citing round id and rubric version, does.

## 17. Performance budgets

### 17.1 What the gate enforces on shipped apps (targets from `_sections/E` Performance tiers; tier definitions are C-27, lane 11)

The harness measures and reports these per C-27 tier, using `?aura3d-quality=<tier>`. Standalone, only the CI-runner
row (Low-desktop proxy) blocks. Each other cell becomes blocking at the first checkpoint after Q-11-1 names a device
for that tier (integrated item I9); until then it is report-only and shown in every checkpoint record.

| Budget | Low | Medium (default) | High | Ultra |
|---|---|---|---|---|
| Frame time p95 (rAF, measured) | ≤ 16.7 ms desktop / ≤ 33.3 ms mobile | ≤ 16.7 ms at 1080p | ≤ 16.7 ms at 1440p | ≤ 33.3 ms realtime |
| GPU ms p95 (timer query when available, else `null`) | ≤ 12 | ≤ 12 | ≤ 13 | ≤ 28 |
| CPU main-thread ms p95 | ≤ 8 | ≤ 6 | ≤ 6 | ≤ 10 |
| GPU memory (estimated: textures + targets, from diagnostics) | ≤ 256 MB | ≤ 768 MB | ≤ 1.5 GB | ≤ 3 GB |
| Transfer before first interactive frame | ≤ 8 MB | ≤ 20 MB | ≤ 40 MB | no limit |
| Engine bundle (gzip, published package) | core ≤ three r185 core gzip × 1.2, measured by the gate on the same build tool; tier features as lazy chunks | same | same | same |
| Mobile | 30 fps floor on Low mobile devices; DPR ≤ 1.0 | 60 fps on iPhone 14-class | n/a | n/a |
| CI runner proxy (macos-14 paravirtual M1, 3 vCPU) | ≥ 55 fps p50 for Low-tier games (Orbital Defense 59.6, Vault Breakers 57.4 already meet it) | report-only | report-only | report-only |

GPU timer queries (`EXT_disjoint_timer_query_webgl2`) may be unavailable under ANGLE Metal in Chromium. When absent,
`gpuMsP50/P95` is `null` and only rAF frame time is used. GPU numbers are never estimated from CPU time.

### 17.2 Harness overhead budgets

| Item | Budget |
|---|---|
| Bytes added to `@aura3d/engine` production bundle by this PRD | ≤ 1 KB gzip: only the two C-31 sections in `lanes/prd12.ts` (measured by `tools/bundle-size` on the PR) |
| Bytes added to game bundles | 0 KB by this lane (the C-24 capture context is lane 09's budget) |
| Benchmark CI job | ≤ 45 min wall on macos-14 including variants; ≤ 20 min without `--calibrate` |
| Game shard job | ≤ 60 min each |
| Metrics job | ≤ 20 min on ubuntu-latest CPU; peak RSS ≤ 4 GB |
| Artifact size per run | ≤ 2 GB; PNG for gating, JPEG q90 only for judge packets |
| LFS goldens + masks | ≤ 150 MB total; re-baselines replace, they do not accumulate (history keeps hashes, not images) |
| Vision-judge payload | ≤ 4 images/turn, ≤ 800,000 bytes image lane, ≤ 1,500,000 bytes request (Prism limits) |

## 18. Browser coverage

| Browser / backend | Runner | Role |
|---|---|---|
| Chromium (Playwright full Chromium, new headless), ANGLE Metal | macos-14 | **Gate.** All goldens and thresholds are bound to this runner image + GPU string |
| Chromium DPR 2 | macos-14 | Gate for `showcase` scenes and game 1920×1080 retina run |
| WebKit (Playwright) | macos-14 | Report-only trend; separate goldens; becomes gating per scene when the owning lane records a WebKit support fact (C-40) |
| Firefox (Playwright) | macos-14 | Report-only trend |
| Chromium WebGPU (`--enable-unsafe-webgpu`, `?a3d-qr=webgpu`) | macos-14 | Report-only for `prd11-*` scenes; no WebGPU visual claims while `A3D_QR_WEBGPU` is below `integrated-accepted` |
| Real Safari / Chrome on devices | AWS Device Farm (Phase 5) | Report-only for perf + `mobile_presentation` judging |
| Linux/Windows hosted runners (SwiftShader/WARP) | — | **Excluded** from every visual gate (`blocked-runner` if attempted) |

Playwright WebKit is not shipping Safari. Safari claims require the device lane.

## 19. Mobile coverage

- **Emulated (every PR).** 390×844, `isMobile`, `hasTouch`, DPR 3 on macos-14 Chromium, as today (README "Runs per
  game"). This checks layout, touch-control presence and the `mobile_presentation` rubric category. It is **not**
  performance evidence for mobile.
- **Real devices (Phase 5, `quality-devices.yml`).** iPhone 13 and iPhone 15 (Safari), Pixel 7 and Galaxy A54
  (Chrome). Each runs the `03-mid` timeline per game, a 5 s rAF fps sample, a screenshot and a short video. The
  results feed the Low/Medium mobile rows in §17.1 and the panel's `mobile_presentation` score.
- **Mobile rubric hard checks** (automated, reported to the panel):
  - canvas covers ≥ 85% of the viewport;
  - no keyboard-only prompts when `hasTouch` is set (detected by `games.json` `keyboardHintSelectors`);
  - touch controls are present.

  These come from the research 21 findings on Aura Clash, Mech Hangar, Gravity Post, Vault Breakers and Orbital
  Defense.

## 20. Screenshots / evidence required

### 20.1 Per PR (artifact `quality-gate-<run>`, retained 30 days)

- For each benchmark item:
  - `frame.png` (Aura) and `three.png`
  - `*.mask.png`
  - `side-by-side.png`
  - `diff.png`
  - `golden-diff.png` (Aura vs golden, FLIP heat map)
  - `ready.json`
  - `metrics.json`
- For each game:
  - every shot PNG (full page)
  - the canvas crop
  - the HUD mask
  - scenario stills
  - `run.json` (fps, timings, GPU string, forbidden-param log)
- `items.json`, `calibration.json` (when run) and `verdicts.json`.
- Step summary table (T3.5).

### 20.2 Per panel round (tracked in git, no images)

- `history/rounds/<round>.json` (`PanelRoundRecord`), with every image bound by sha256 to the artifact of the named
  `quality-gate` run.
- Updated `history/index.jsonl`, plus trend SVGs in the round's artifact.
- Golden updates referencing the round ID.

### 20.3 Reference stills

The repo is public. Copyrighted stills (the `tests/reports/_visual-critic-refs/` premium-indie frames) are **never
committed**.

- `refs/manifest.json` records each still's sha256, source URL, rights status and storage URI. Storage is a private,
  access-controlled container (provider-neutral → Azure Blob via `az-auraone-gurbaksh`, per the funding snapshot)
  that only the `quality-review` environment can read.
- Committed references are limited to:
  - frames this repo renders itself (three.js `ref-*`, canary);
  - CC0 or explicitly licensed images.
- `tools/premium-indie-reference/*.mjs` is changed to write only into that private store, never into the working
  tree.

## 21. Completion criteria

1. Phase 0–5 exit criteria are met, each with a linked CI run ID.
2. No tool, test, script or workflow in the repository produces a "visual", "parity", "superiority" or "quality"
   claim from constants, labels, file sizes or aggregation of other `pass` flags (`classify-tools.ts` report shows 0
   in those classes outside `_quarantine/`, and `_quarantine/` is deleted).
3. G-REG blocks PRs on the macos-14 GPU runner. It has goldens for 18 contract scenes, every admitted `prd12-ref-*`,
   and every scenario still measured deterministic (§6.7). The false-positive rate over the last 20 `main` runs is 0.
   Golden coverage of all 18 games is integrated item I5 and does not hold completion of this lane.
4. Every active threshold has a recorded calibration that rejects its broken controls, and the self-test runs on
   every golden update and runner-image change.
5. At least two panel rounds are recorded in `history/` with 2 named humans plus the vision model, canary passed,
   and V13–V16 met.
6. The release workflow refuses publication without a passing panel round on the release commit (dry run proven).
7. Lane-12 docs (`AURA3D-VERIFICATION-MATRIX.md`, `docs/project/{parity/,threejs-superiority-status.md,claim-guidelines.md}`)
   cite only `quality:*` outputs and panel rounds for visual quality and describe route health, tests and non-blank
   checks as liveness only. The matching README (Q-15-2) and skill (Q-13-3) changes are filed with facts `F-12-*`; their
   landing is tracked in checkpoint reports, not required for this lane's completion.
8. Every root script path exists or is listed in `root-manifest-pending.json` with an open Q-15-1 issue; the ≤ 80
   script target is met when lane 15 merges the Q-15-1 batch (integrated, reported per checkpoint).
9. Standalone acceptance §16.1 (V1-V20) passes with every other lane on its stub. Integrated items I1-I10 (§16.2) are
   reported at checkpoints and never hold completion.

## 22. Rollback considerations

- **Deletions (Phase 0, 4).** One commit per family, so `git revert <sha>` restores any family. Quarantine before
  delete in Phase 4 gives one release cycle to restore a tool someone still needs. Fabricated suites are not
  restored without a new PRD, because restoring them restores false claims.
- **Blocking gate.** `quality-gate.yml` reads `QUALITY_GATE_MODE` from a repository variable (`blocking` |
  `report-only`). Flipping it to `report-only` disables blocking without deleting evidence. Each flip is recorded in
  the step summary. The flip is allowed for runner outages and harness bugs only. It must not be used to ship a known
  visual regression.
- **Goldens.** `goldens/manifest.json` is append-only through `supersedes`. To roll back a golden, revert the
  manifest commit. The LFS objects remain.
- **Runner image change.** If GitHub updates `macos-14` and the GPU string or image version changes, the gate
  re-calibrates (T3.7). If re-calibration fails, it holds in `runner-image-changed` report-only mode for at most
  7 days while goldens are re-approved by a panel round.
- **Vision judge.** If Prism or the model is unavailable or changes behaviour, the canary detects it. The round
  proceeds human-only, flagged `vision-missing`. History is not rewritten.

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The vision model drifts or prefers certain styles | Scores move without pixel changes | Canary + calibration set each round; vision can never pass alone; prompt versioned; humans decide ties |
| Goodhart on detectors (agents tune for metrics, not looks) | Metric-green, panel-red frames | Detectors are report signals for G-REF; only G-PANEL is release-blocking; detectors are rotated/added per round without notice to authoring agents |
| Paravirtual M1 GPU not representative of user hardware | Perf numbers misleading; some features (timer queries) unavailable | Treated as the Low-desktop proxy only; real-device lane for mobile; tier budgets need named devices before blocking |
| Hosted runner image updates churn goldens | Spurious failures | Bind goldens to `ImageVersion` + GPU string; re-calibration path T3.7 |
| Wall-clock game timelines are nondeterministic | Flaky gameplay goldens | Goldens only on deterministic scenario stills; gameplay shots go to the panel only |
| Human panel availability and cost | Rounds delayed; releases blocked | Rounds scheduled per release, not per PR; PRs gated by G-REG; two humans minimum is fixed, not waived |
| Copyright of reference stills in a public repo | Legal exposure | Never committed; private store; hashes only in git (§20.3) |
| LFS storage/bandwidth quota (goldens, HDRIs, assets pulled per job) | CI failures when quota exhausted | Goldens ≤ 150 MB; `actions/cache` keyed by LFS oid; only the include list in `ci.sh` is pulled |
| Deleting ~340 tool dirs breaks an unknown consumer | Broken script/CI | Classifier + quarantine cycle + `scripts.test.ts`; CI references removed in the same commit |
| PR captures of 18 games exceed macOS concurrency/time | Slow PR feedback | 3 shards; game shards run only when `apps/**`, `packages/**`, `templates/**` or `public/aura-assets/**` change; benchmark always |
| Prism key exposure | Credential leak | Only in protected `quality-review` environment on `workflow_dispatch`; never on `pull_request`; never logged; operator-provisioned |
| A threshold is non-discriminating for an important feature | Feature regressions undetected by G-REG | Reported visibly per PR; panel round must cover it; Q-LANES-1 asks the owning lane to add an isolating scene in its `scenes/prdNN/` |
| Another lane's request (Q-15-1 root scripts, Q-14-1 `games.json`, Q-05-1 assets) is slow | Scripts/docs/data lag the deleted tools | Every request has a lane-12 "meanwhile" path (§12.3); `root-manifest-pending.json` and checkpoint reports keep the lag visible; nothing in §16.1 depends on it |
| PR 0b-3 (capture plugins, `--flags`) slips | C-33 plugins cannot load | PRD 12 owns both capture scripts; it lands the same loader in its own PR on day 2 if 0b-3 is dropped (CONTRACTS §3.9: dropped carve-outs stay with the hot-file owner, here 12) |

## 24. Explicitly out of scope

- Fixing any rendering, material, lighting, post, VFX, animation or camera defect the gates expose (lanes 01-08, 10,
  11). This includes the `node.size` instancing bug (R18, lane 15) and shadow strength (lane 02).
- Rebuilding the games (lane 14) and removing route `?capture=review` branches (lanes 09/14).
- Editing any file outside §Parallel execution "Owned files" (root `package.json`, `README.md`, `fixtures/`,
  `games.json`, `packages/**` beyond `lanes/prd12.ts`); those changes are §12.3 requests.
- The agent-authoring benchmark in `benchmark/` (10 prompts, round-50), and agent-output scoring (bar A1–A4). Both
  belong to lane 13, which reuses `G-PANEL` (C-32).
- Unity/Unreal comparisons (deleted, not replaced).
- WebGPU visual parity beyond report-only capture (lane 11, C-29).
- Babylon.js comparisons (`benchmarks/babylon` stays untouched and ungated).
- Publishing benchmark results as marketing. No quality claim may be made until a passing panel round exists, and
  even then claims cite the round ID and the exact items that passed.

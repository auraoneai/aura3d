# PRD: Beat three.js (runtime cost, parity gaps and proof)

Status: ready for parallel execution. Owner: Gurbaksh. Written 2026-10-28 against `main` at `62c56e207` (Aura3D 4.3.7).
Companion to `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md` (agent authoring, bundle size, harness gate, real-GPU receipt path). This PRD covers everything else that is broken, partial or unproven against three.js. It does not repeat the bundle-size and first-load-JS work; it depends on that PRD's Track C (`tools/bundle-report`) and cites it where the two meet.
Execution mode: zero-hostage. Decisions are resolved from the repo and the measurements below.

Evidence base: `evidence/vs-threejs/RESULTS.md` (Aura3D 4.1.2 vs three.js 0.185.1, five scenes, software WebGL2, one author; numeric tally: Aura3D better 18 rows, three.js better 76, tie 10, unmeasurable 20), `docs/comparisons/aura3d-capability-audit.md` (shipped/partial/experimental per capability), `evidence/vs-threejs/full-game/README.md`, `evidence/agent-eval/fullgame-436/`.

**Read this first: the benchmark predates 4.3.7.** Several findings were measured at 4.1.2 and may already be fixed (for example the `POSTPROCESS_V2_UNMIGRATED` warning no longer exists in `packages/`, and `primitives.ts` now lists `widthSegments`/`heightSegments` for plane). WP-0 re-measures everything at 4.3.7 before any fix is started, so no lane works on a stale problem. Targets below are written against the 4.1.2 numbers and are re-baselined by WP-0.

Claim policy: no public surface may say Aura3D is faster, lighter or higher quality than three.js until the matching target passes in WP-B on a fresh run, on a real GPU where the claim is about speed. Sales surfaces state only the Aura3D side with method; the three.js column stays in `evidence/` (rule recorded in `sales-only-marketing-copy`).

---

## 1. Executive Summary & Architectural Decisions

### Objective
Close the measured places where a plain three.js app beats an Aura3D app (frame cost, first-frame time, per-frame CPU, draw calls, exposure, out-of-the-box DX), turn every "partial" and "experimental" capability that three.js users expect into a shipped, pixel-proven one, and build a repeatable proof pipeline so each win becomes a claim the site can make. The outcome is a re-run of the head-to-head benchmark in which the tally flips: three.js wins at most 30 numeric rows, Aura3D wins a majority.

### What is broken or missing (from the evidence)

| Area | Measured (4.1.2, software WebGL2 unless stated) | Source |
| --- | --- | --- |
| Steady-state frame, one cube | Aura3D 623.2 ms median vs three.js 0.9 ms (1.4 ms with 4x MSAA) | RESULTS §7a, §7d |
| CPU inside `frame()`, one cube | 3.50 ms vs 0.10 ms | §7c |
| Time to first frame, one cube | 3,269 ms vs 95 ms | §6 |
| Draw calls, one cube | 2 vs 1; PBR viewer 33 vs 25 | §8a |
| Requests on first load, one cube | 26 vs 2 | §5a |
| 10,000-instance forest | Aura3D never produced a result (55-minute limit hit); three.js with 4x MSAA 1,437.7 ms | §14, §7d |
| Exposure | Same nominal lights: skinned character mean luma 144 (Aura3D) vs 192 (three.js) | §9, §12 item 8 |
| Source size, hello cube | 18 lines / 278 tokens vs 15 / 210 | §1, §2 |
| Source size, shader water | 87 lines / 1,554 tokens vs 86 / 1,386 | §1, §2 |
| Silent no-ops | `primitives.plane` segments and `interactions.orbit` options were accepted and ignored | §12 items 4 and 5 |
| Console noise | `POSTPROCESS_V2_UNMIGRATED`, `WEIGHTS_0 normalized` on unmodified assets | §12 item 6 |
| Partial / experimental capabilities | See table below | audit |

Capabilities the audit labels partial or experimental (what three.js users expect to just work):

| Capability | Label | Gap to close |
| --- | --- | --- |
| Other effects (AO, colour grade, vignette, DoF, contact shadows) | partial | per-effect pixel receipts |
| Layers, root motion, retargeting, two-bone IK | partial | exposed at root, not only in `@aura3d/animation` |
| `sceneKits.*` (10 kits) | partial | only `materialLab` is root-proven; nine need per-kit pixels |
| Genre kits (racket sports, arcade kart, car soccer, fighting, platformer) | partial | building blocks only; AI, levels, art per game |
| `physics.*` root namespace | partial | generic collision claim |
| `tsl` (62 names), `compute`, WebGPU backend | experimental | no real-GPU run exists |
| `xr` | experimental | injected sessions only |
| `@aura3d/react` | experimental | not checked in the audit |
| Root `createGame` | experimental | headless stub |
| `migrate three` codemod | partial | 245 rows: 21 exact, 174 approximate, 47 none, 3 pending |

### Targets (acceptance; measured by WP-B on the remote runner, plus the real-GPU receipts for speed claims)

| # | Target | Baseline (4.1.2) | Target |
| - | --- | --- | --- |
| P1 | Steady-state frame, one cube, software GL | 623.2 ms | <= 5 ms (three.js 4x MSAA 1.4 ms) |
| P2 | CPU inside `frame()`, one cube | 3.50 ms | <= 0.5 ms (three.js 0.10 ms) |
| P3 | Time to first frame, one cube, software GL | 3,269 ms | <= 500 ms (three.js 95 to 120 ms) |
| P4 | Draw calls, one cube / PBR viewer | 2 / 33 | 1 / <= 25 |
| P5 | Requests on first load, one cube | 26 | <= 8 (bundle work in the companion PRD) |
| P6 | Forest 10k completes on software GL | did not finish in 55 min | completes in <= 5 min and <= 3x three.js 4x MSAA |
| P7 | Real GPU: steady-state frame, all five scenes | not measured | <= three.js with 4x MSAA on every scene (receipts) |
| Q1 | Exposure: skinned character mean luma, same nominal lights | 144 vs 192 | within 10% |
| Q2 | Console warnings on the five bench scenes | at least 2 kinds | 0 |
| D1 | Source: hello cube lines / tokens | 18 / 278 | <= 12 / <= 210 |
| D2 | Source: shader water lines / tokens | 87 / 1,554 | <= 80 / <= 1,386 |
| D3 | Silent no-ops in the documented API | 2 found | 0 (diagnostic or honoured) |
| C1 | Partial and experimental audit rows | 12 | each row either `shipped` with a pixel receipt or removed from public copy |
| M1 | Codemod rows: approximate / none / pending | 174 / 47 / 3 | <= 100 / <= 20 / 0 |
| T1 | Benchmark tally "three.js better" | 76 of 124 numeric rows | <= 30 |

These numbers are goals chosen from the gaps; WP-0 may show some are already met or physically unreachable under software GL, in which case the target is replaced by the real-GPU equivalent and the change is recorded in `evidence/`.

### Autonomous decisions made
1. **Re-measure first (WP-0), then fix.** The benchmark is two minor versions old. Each lane starts from a fresh 4.3.7 row for its metric.
2. **A cheap default path for simple scenes.** The `production` profile (`packages/engine/src/agent-api/app/rendererOptions.ts`) sets `pixelRatio: 1.5`, `antialiasing: "msaa-plus-high-dpi"` and `preserveDrawingBuffer: true`, and the benchmark shows 4x multisampled RGBA16F targets with a blit. Introduce `quality: "auto"` (default) that selects a single-pass, canvas-MSAA, 8-bit path when the scene authors no post-processing, HDR or transmission, and keeps the current pipeline otherwise. `quality: "production"` stays available and unchanged.
3. **`preserveDrawingBuffer` only when asked.** Set it true for capture and evidence modes (`?capture=1`, the QA hooks, `look capture`) and false otherwise; the QA kit already controls reads.
4. **Exposure is a calibration fix, not a user knob.** Make the default exposure and light-unit convention match three.js's physically-correct-lights output for identical nominal intensities, behind a one-line migration note, with a visual-regression baseline refresh in the same PR.
5. **Never accept an option and ignore it.** Every option that reaches a primitive, interaction or material either takes effect or raises a diagnostic naming the valid keys (extends `compiler/optionCoverage.ts`; the agent-first PRD adds the diagnostics; this PRD adds coverage tests for every option listed in the public docs).
6. **Promotion rule for partial and experimental rows.** A row becomes `shipped` only with (a) a pixel receipt from a remote run, (b) a unit test, and (c) a documented example that compiles. Otherwise it is removed from public copy. No row is promoted on the strength of a claim.
7. **Real-GPU receipts are owner-run** (needs the Mac GPU or quota). The receipt tooling is in the companion PRD (WP-D); this PRD consumes it. Until receipts exist, every speed statement keeps the "software WebGL2" qualifier.
8. **Benchmark methodology upgrade.** Three independent authors (fresh agents, as in `tools/agent-eval`), both libraries tuned, software GL and real GPU, equal antialiasing, published scripts. The existing five scenes plus the full game stay as the suite.

---

## 2. Current Codebase State & System Architecture

- **Renderer profiles:** `packages/engine/src/agent-api/app/rendererOptions.ts`: `rendererQualityProfiles` (`safe-basic`, `production`, `cinematic`, `experimental-webgpu`). `production`: `pixelRatio: 1.5`, `antialiasing: "msaa-plus-high-dpi"`, `preserveDrawingBuffer: true`, `maxRecommendedDrawCalls: 260`. `safe-basic`: `pixelRatio: 1`, `msaa`, `maxRecommendedDrawCalls: 180`.
- **Renderer core:** `packages/rendering/src/` (`RenderDevice.ts`, `forward/Lighting.ts`, `forward/Transmission.ts`, `reference/PostProcessPass.ts`, `SkinnedLitMaterial.ts`, `quality/{FrameStats,QualityGovernor}.ts`). The `QualityGovernor` exists and can lower quality under load; check whether it ever engages in the benchmark (it should explain nothing at 623 ms/frame if it does not).
- **Frame loop:** `packages/engine/src/agent-api/app/frameLoop.ts`, `createAuraApp.ts`, `mountRenderer.ts`, `pixelRatio.ts`, `colorManagement.ts` (exposure and output transform live here), `degradation.ts`.
- **Primitives and options:** `packages/engine/src/agent-api/nodes/primitives.ts` (per-kind `params` key table at lines 20 to 22, `SIZE_HINT` at line 28), `nodes/types.ts` (`widthSegments` at line 488), `nodes/interactions.ts` (orbit), `compiler/optionCoverage.ts`, `compiler/diagnosticOnly.prd09.ts`.
- **Effects:** `nodes/effects*.ts` (`effects.ts`, `effects.post.ts`, `effects.lighting.ts`, `effects.composite.ts`, `effects.toon.ts`), `postPresets.ts`.
- **Kits:** `nodes/sceneKits.ts`, `sceneKitDiagnostics.ts`, `agent-api/GameGenreKits.ts`, `ApplicationKits.ts`, `game-kits/`.
- **Animation:** `packages/animation/src` (layers, root motion, retargeting, IK) and the root `AnimationController`.
- **Physics:** `nodes/physics.ts`, `packages/physics`, `packages/physics-rapier`.
- **WebGPU/TSL/compute:** `nodes/tsl/index.ts`, `nodes/compute.ts`; `evidence/real-gpu/README.md`, `tools/real-gpu/run.sh`.
- **XR / React:** root `xr` (`docs/rendering/controls-picking-xr-context.md`), `packages/react/src/index.ts`.
- **Codemod:** `packages/aura3d-cli/src/migrate-three/mappings.ts` (245 rows), tests `tests/unit/aura3d-cli/migrate-three*.test.ts`.
- **Benchmark:** `tools/bench-vs-threejs/{baseline,pbr-viewer,forest,skinned-character,game-loop,shader-water,shared,harness,tagline,full-game}`; results in `evidence/vs-threejs/RESULTS.md`.
- **Constraints:** remote-only execution (`tools/remote-acr/run.sh`; image copies fixed dirs; stage extra dirs under `apps/<x>-stage-tmp` with `EXTRA_DIRS`); no local Docker or Playwright; LLM calls through Kiro Prism; Aura3D has no `three` dependency; sales copy sells Aura3D only.

---

## 3. Data Model, API & Interface Contracts

### 3.1 `quality` option (new, `createAuraApp` options)
```ts
export type AuraQualityMode = "auto" | "production" | "safe-basic" | "cinematic";
interface AuraCreateAppOptions {
  /** Default "auto": single-pass 8-bit canvas MSAA when the scene authors no post, HDR or transmission; otherwise "production". */
  readonly quality?: AuraQualityMode;
  /** Default false except in capture/evidence mode. */
  readonly preserveDrawingBuffer?: boolean;
}
```
`app.diagnostics()` reports `renderPath: "direct" | "hdr-msaa"` and the reason, so a user can see which path ran. `quality: "production"` reproduces today's behaviour byte for byte (receipt: existing visual baselines unchanged).

### 3.2 Exposure convention
`colorManagement.ts` documents and tests one rule: a directional light of intensity `I` on a Lambert surface of albedo `A` produces the same linear output as three.js r185 `MeshStandardMaterial` with `physicallyCorrectLights` defaults. A fixture (`tests/unit/rendering/exposure-parity.test.ts`) renders a calibration sphere set in Node (CPU reference) and asserts mean luma within 3% for 5 light/albedo pairs. The change is listed in the CHANGELOG as a visual change with a one-line `exposure` override.

### 3.3 Option coverage contract
For every option documented in `docs/api/*.md` and `docs/agents/recipes.md` code blocks, `tests/unit/agent-api/option-coverage.test.ts` asserts one of: the option changes the compiled scene, or a diagnostic with code `OPTION_IGNORED` is raised naming the valid keys. The test is generated from `compiler/optionCoverage.ts` metadata so new options cannot ship uncovered.

### 3.4 Instancing at scale
`instances.*` accepts 10,000+ transforms without per-instance JS cost in `frame()`: transforms are uploaded once to an instance buffer; `app.nodes.require(id).setInstanceTransforms(array)` is the only per-frame path and takes a typed array. A budget test asserts CPU in `frame()` for the forest scene <= 2 ms.

### 3.5 Pixel receipt schema (shared with the companion PRD's real-GPU receipts)
`evidence/receipts/<capability>/<version>.json`: `{ capability, version, gitSha, renderer: "swiftshader" | "<gpu string>", scene, frames: [{ file, sha256, meanLuma, nonBlackRatio }], tests: [path], date }`. `tools/receipts/check.mjs` fails CI when a capability labelled `shipped` in `docs/comparisons/aura3d-capability-audit.md` has no receipt for the current minor version.

### 3.6 Codemod row contract
`mappings.ts` rows carry `{ three: string, aura: string | null, fidelity: "exact" | "approximate" | "none", note: string, test: string }`. A test fails for any row whose `fidelity` is `exact` without a fixture that runs before/after through both renderers and compares frames within a stated tolerance.

---

## 4. File-by-File Breakdown

Lanes (disjoint ownership): **L-W0** re-measure | **L-P1** renderer path and frame cost | **L-P2** instancing and forest | **L-Q** exposure and warnings | **L-S** option coverage and silent no-ops | **L-K** capability promotions | **L-M** codemod | **L-B** benchmark and proof | **L-D** docs and copy (last).

### CREATE

| Path | Lane | Contents |
| --- | --- | --- |
| `tools/bench-vs-threejs/harness/run-4.3.7.mjs` (or extend the existing harness) | L-W0 | Re-runs the five scenes plus full game at the current version on the remote runner; outputs `evidence/vs-threejs/RESULTS-4.3.7.md` in the same table layout. |
| `evidence/vs-threejs/RESULTS-4.3.7.md` | L-W0 | Fresh tally; marks each finding fixed / still open / changed. |
| `packages/rendering/src/quality/DirectPath.ts` | L-P1 | Single-pass 8-bit canvas-MSAA path used by `quality: "auto"`. |
| `tests/unit/rendering/render-path-selection.test.ts` | L-P1 | Scenes with and without post/HDR/transmission select the right path; `production` unchanged. |
| `tests/browser/frame-cost.spec.ts` | L-P1 | Remote: frame time, CPU time, draw calls, first-frame time for the cube and PBR viewer; prints metrics for the harness. |
| `tests/unit/rendering/exposure-parity.test.ts` | L-Q | 3.2 fixture. |
| `tests/unit/agent-api/option-coverage.test.ts` | L-S | 3.3 test. |
| `tests/browser/forest-10k.spec.ts` | L-P2 | Remote: 10,000 instances complete and CPU budget. |
| `tools/receipts/check.mjs`, `evidence/receipts/**` | L-K | 3.5 gate and receipts. |
| `tests/browser/effects-receipts.spec.ts`, `tests/browser/scenekits-receipts.spec.ts`, `tests/browser/animation-root-receipts.spec.ts`, `tests/browser/physics-root-receipts.spec.ts` | L-K | Remote pixel receipts per promoted row. |
| `tests/unit/aura3d-cli/migrate-three-fidelity.test.ts`, `tests/fixtures/migrate-three/**` | L-M | 3.6 fixtures. |
| `tools/bench-vs-threejs/shared/authors/` | L-B | Prompts and runner for three independent agent authors per scene. |

### MODIFY

| Path | Lane | Change |
| --- | --- | --- |
| `packages/engine/src/agent-api/app/rendererOptions.ts` | L-P1 | Add `quality`; `auto` selects `DirectPath` when eligible; `preserveDrawingBuffer` default false outside capture/evidence mode; `production` unchanged. |
| `packages/engine/src/agent-api/app/{createAuraApp,mountRenderer,frameLoop,pixelRatio}.ts` | L-P1 | Read `quality`; default pixel ratio 1 on `auto` for scenes with no HiDPI request or cap at `min(devicePixelRatio, 2)`; expose `renderPath` in diagnostics; remove per-frame allocations found by the CPU profile (target P2). |
| `packages/rendering/src/{RenderDevice,forward/Lighting}.ts`, `quality/QualityGovernor.ts` | L-P1 | Draw-call merge (target P4: one draw for a cube + background; fold the sky/background into the first pass), governor engages when frame time exceeds budget. |
| `packages/engine/src/agent-api/nodes/instances.ts` and `packages/rendering` instance paths | L-P2 | 3.4 buffer upload and typed-array update path; profile and remove the stall that kept the forest from finishing. |
| `packages/engine/src/agent-api/app/colorManagement.ts`, `packages/rendering/src/forward/Lighting.ts` | L-Q | 3.2 calibration. |
| `packages/rendering/**` (post chain), `packages/aura3d-cli/src/skin/*.ts` | L-Q | No warnings on unmodified assets (`WEIGHTS_0 normalized` becomes debug-level when the sum is within 1e-3). |
| `packages/engine/src/agent-api/nodes/{primitives,interactions}.ts`, `compiler/optionCoverage.ts` | L-S | Honour or diagnose every documented option; confirm plane segments are applied (the key table lists them; verify the geometry actually subdivides). |
| `packages/engine/src/agent-api/nodes/effects*.ts`, `postPresets.ts` | L-K | Fix any effect that fails its receipt (AO, colour grade, vignette, DoF, contact shadows). |
| `packages/engine/src/agent-api/nodes/sceneKits.ts`, `sceneKitDiagnostics.ts` | L-K | Per-kit pixel receipts for the nine non-proven kits, or removal of kits that fail. |
| `packages/animation/src/**` and root `AnimationController` | L-K | Expose layers, root motion, retargeting and two-bone IK at the root with a documented example and receipts. |
| `nodes/physics.ts`, `packages/physics*` | L-K | Generic root collision (box/sphere/capsule vs static/dynamic) with a receipt, or narrow the public claim. |
| `nodes/tsl/index.ts`, `nodes/compute.ts` | L-K | Add real-GPU adapter/backend/dispatch/render evidence tests; label stays `experimental` until the owner runs real-GPU receipts. |
| `packages/react/src/index.ts` and tests | L-K | Audit and test the adapter (`mount`, scene props, cleanup); promote or keep experimental with the reason. |
| `packages/engine/src/contracts/stubs/game.ts` | L-K | Decide: remove root `createGame` stub from the public surface or forward to `@aura3d/engine/game`; document either way. |
| `packages/aura3d-cli/src/migrate-three/mappings.ts` | L-M | Convert approximate/none/pending rows toward exact where the Aura3D API now covers them; add `note` and `test` fields. |
| `tools/bench-vs-threejs/**`, `evidence/vs-threejs/RESULTS.md` | L-B | Methodology upgrade (equal AA, tuned both sides, three authors, real-GPU column when receipts exist); keep the 4.1.2 file as history. |
| `docs/comparisons/aura3d-capability-audit.md`, `docs/agents/claims-and-boundaries.md`, `docs/comparisons/threejs-positioning.md` | L-D | Relabel promoted rows; add newly unlocked claims with their evidence; remove claims that failed. |
| `README.md`, `marketing/index.html`, `marketing/docs/aura3d-vs-threejs.html`, `tools/marketing-truth/index.ts`, `tools/site/stale-rules.mjs` | L-D | Only after the matching target passes; Aura3D-side facts only. |

### DELETE
None expected. Features that fail their receipt are removed from public copy, not from the repo, unless unused.

---

## 5. Detailed Implementation Tasklist

Phases: **P0** re-measure (blocks everything), **P1** lanes in parallel, **P2** integration and proof, **P3** copy and release.

### P0: re-measure (L-W0, sequential, first)
- **WP-0.1** Build the five bench scenes and the full game against published 4.3.7 (registry install) and three.js 0.185.1; run on the remote runner with 3 cold loads and 60 steady frames, equal antialiasing, software WebGL2.
- **WP-0.2** Write `evidence/vs-threejs/RESULTS-4.3.7.md` with the same table layout, plus a status column per finding in section 1 (fixed, still open, worse, unmeasurable). Re-baseline section 1's targets in this PRD's `evidence/` addendum (do not edit history).
- **WP-0.3** CPU-profile the cube frame (`frame()` 3.5 ms) and the first-frame path (3,269 ms): output a flame summary of the top 15 costs so lanes L-P1 and L-P2 start from data.
- **WP-0.4** Run the forest on software GL with a 10-minute cap and record where it stalls (shader compile, instance upload, per-frame JS, or fill rate).

### P1: parallel lanes (start together after WP-0)

**Lane L-P1 (renderer path and frame cost)**
- WP-P1.1 Implement `DirectPath` and the `quality` option per 3.1; `production` byte-identical (compare existing visual baselines).
- WP-P1.2 Default `preserveDrawingBuffer` false outside capture/evidence mode; verify QA hooks, `look capture`, `assets thumbnail` and the stock `check-deploy --browser` black-frame check still work.
- WP-P1.3 Pixel-ratio default (cap at 2, 1 on `auto` without a HiDPI request), draw-call folding (P4), per-frame allocation removal (P2), `QualityGovernor` engagement test.
- WP-P1.4 `tests/browser/frame-cost.spec.ts`; iterate until P1 to P4 pass on the cube and PBR viewer.

**Lane L-P2 (instancing and forest)**
- WP-P2.1 Instance buffer upload and typed-array update (3.4); remove the cause found in WP-0.4.
- WP-P2.2 `forest-10k.spec.ts`; target P6.

**Lane L-Q (exposure and warnings)**
- WP-Q.1 Exposure fixture and calibration (3.2); refresh visual baselines in the same PR with before/after frames in `evidence/`.
- WP-Q.2 Warning cleanup (Q2): zero warnings on the five scenes; gate in `tests/browser/frame-cost.spec.ts` (console must be empty).

**Lane L-S (option coverage)**
- WP-S.1 Generate the coverage test (3.3) from `optionCoverage.ts`; fix or diagnose each gap it finds.
- WP-S.2 Confirm plane segments subdivide (vertex count in the frame), orbit takes node name or point (typed overloads, no `as never` needed), custom-material prelude names documented in the type JSDoc (benchmark §11 row 5).

**Lane L-K (capability promotions)**: one work package per audit row, each ending in a receipt or a public-copy removal.
- WP-K.1 Effects receipts (AO, grade, vignette, DoF, contact shadows).
- WP-K.2 Scene kits: nine receipts.
- WP-K.3 Animation at root: layers, root motion, retargeting, two-bone IK.
- WP-K.4 Physics root collision.
- WP-K.5 TSL/compute/WebGPU evidence tests (stay `experimental`; real-GPU is an owner step).
- WP-K.6 React adapter audit and tests.
- WP-K.7 Root `createGame` stub decision and docs.
- WP-K.8 Genre kits: write the exact boundary (what is a building block, what is per game) into `claims-and-boundaries.md`; add one runnable example per kit that compiles in `docs-codeblocks`.

**Lane L-M (codemod)**
- WP-M.1 Triage 224 non-exact rows by frequency in real three.js code; convert the most common 70 first.
- WP-M.2 Fidelity fixtures (3.6); report the new exact/approximate/none counts (target M1).

**Lane L-B (benchmark and proof)**
- WP-B.1 Methodology upgrade and three-author runner (reuse `tools/agent-eval` loop; agents write each scene from a one-paragraph brief for both libraries).
- WP-B.2 Final run at the candidate version: software GL on the remote runner; real-GPU run is the owner gate (the script and receipt format exist from the companion PRD).
- WP-B.3 Tally script that fails if "three.js better" rows exceed 30 (target T1) and prints per-target PASS/FAIL (`tools/bench-vs-threejs/gate.mjs`).

### P2: integration and proof (sequential)
- WP-I.1 Merge order: S, Q, P1, P2, K, M, B. Resolve conflicts in `rendererOptions.ts`, `colorManagement.ts`, `capability audit`.
- WP-I.2 Full gates: typecheck, unit suite, `tsc -p tsconfig.build.json`, `tools/receipts/check.mjs`, `tools/marketing-truth`, `tools/docs-codeblocks`, `marketing/scripts/check-site.mjs`, visual-regression baselines.
- WP-I.3 Release as 4.5.0 (visual change: exposure and default render path), following the standing release steps: bump, regenerate SEO/skills, build, publish, tag, GitHub release, deprecate every earlier npm version, re-banner older GitHub releases, deploy from a clean worktree (preview then production), run `tools/verify-asset-urls` and `tools/site/scan-live-site.mjs`.
- WP-I.4 Run WP-B.2/B.3 against the published package.

### P3: copy (L-D, only after the matching gate)
- WP-D.1 For each target that passed, add an Aura3D-side claim with method to README, homepage and the comparison page; update `docs/comparisons/threejs-positioning.md` "Claims to unlock" table. Never include the three.js column on sales surfaces.
- WP-D.2 For each target that failed, record it in `evidence/` and make no claim.

---

## 6. UI/UX & Edge-Case Specifications

- **No visual regressions by surprise.** `quality: "auto"` must not change the look of any template or showcase game that authors post, HDR or transmission (those take the old path). For direct-path scenes, frames are compared against baselines with a stated tolerance (mean abs diff <= 2/255, no edge change > 6/255); anything larger needs a documented baseline refresh.
- **Exposure change:** every look preset is re-captured (`look capture`) and judged (`look judge`) before and after; presets that go dark or blow out are retuned in the same PR.
- **Edge cases:** WebGL context loss and restore on both paths; `devicePixelRatio` 1, 2, 3; resize to 390x844 and 1440x900; background tab (frame loop paused); `prefers-reduced-motion`; scenes that add post-processing at runtime (switch from direct to HDR path without a visible hitch, or require it at mount and say so in diagnostics); capture mode keeps `preserveDrawingBuffer` true.
- **Diagnostics are visible:** `app.diagnostics().renderPath` and the existing `?diag=1` panel show the path and why.

---

## 7. Verification & Acceptance Checklist

Heavy and browser steps run on the remote runner (`tools/remote-acr/run.sh`); never local Docker or local Playwright.

### Completeness
- [ ] Every file in section 4 CREATE/MODIFY exists with no `TODO`, placeholder or stub body.
- [ ] `evidence/vs-threejs/RESULTS-4.3.7.md` exists and labels each section-1 finding fixed / open / changed; section-1 targets re-baselined in an `evidence/` addendum.
- [ ] CHANGELOG states the default render path change and the exposure change, with the override.

### Static and unit
- [ ] `pnpm typecheck`, lint, `tsc -p tsconfig.build.json`, `tools/finalize-dist` pass.
- [ ] `render-path-selection`, `exposure-parity`, `option-coverage`, `migrate-three-fidelity` tests pass.
- [ ] `tools/receipts/check.mjs` passes: every `shipped` audit row has a current-minor receipt.
- [ ] `tools/marketing-truth`, `tools/docs-codeblocks`, `tools/marketing-link-audit`, `marketing/scripts/check-site.mjs`, `tools/agent-skills/check.ts` pass; `tools/agent-docs` shows only its 6 known baseline failures.

### Browser (remote, software WebGL2)
- [ ] `frame-cost.spec.ts`: P1 to P4 and Q2 pass for the cube and PBR viewer; console empty.
- [ ] `forest-10k.spec.ts`: P6 passes.
- [ ] Visual-regression suites: no unexplained diffs; baseline refreshes documented with before/after frames.
- [ ] Receipt specs for every promoted capability pass and write `evidence/receipts/**`.

### Benchmark gate
- [ ] `node tools/bench-vs-threejs/gate.mjs` on the candidate release prints PASS for the targets the release claims, and T1 (three.js better <= 30 rows) passes before any "beats three.js" wording ships.
- [ ] Real-GPU rows (P7) are either filled from owner-run receipts or the speed claims keep the software-GL qualifier.

### Release
- [ ] 24 packages published, tag and GitHub release created, every earlier npm version deprecated, older GitHub releases re-bannered, production deployed, live scan clean.

---

## 8. Out of Scope & Do-or-Die Guardrails

Out of scope:
- Bundle-size and first-load JS reduction, agent-first authoring, the harness gate and `aura3d verify` (the companion PRD owns them).
- Native WebGPU as the default backend; XR on real headsets; porting every three.js addon.
- A hosted asset catalog (`docs/audit/asset-catalog-claim.md`).
- Any public claim of speed, size or quality superiority before its gate passes; any "built on three.js" wording.

Guardrails:
- Remote-first: no local Docker, no local Playwright, no unbounded `find`/`grep` from the home directory.
- Do not delete showcase games or change a game's art to hide a regression.
- A default-render-path change requires baselines refreshed in the same PR and a CHANGELOG entry; it must not alter `quality: "production"`.
- Real-GPU captures are an owner step (`REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac, or a granted GPU quota); never present software-GL numbers as GPU numbers.
- Protected env vars and tokens are never set or written; publishing goes through `tools/release/publish-all.mjs` with the existing credential store.
- If a target cannot be met, record the measured result and the cause in `evidence/`, keep the claim unmade, and open the next PRD from the failing rows. Do not move the target.

# PRD: Beat three.js, part 3 (the rows that still fail after 4.5.0)

Status: ready for parallel execution. Owner: Gurbaksh. Written 2026-10-28 against `main` at `6813d5d24` (Aura3D 4.5.0, published, tagged `v4.5.0`) plus the benchmark evidence on `post450/bench`. Execution mode: zero-hostage; decisions are resolved from the repo and the measurements cited here.

Evidence base: `evidence/vs-threejs/RESULTS-4.5.0.md` (published-package run, software WebGL2, one run; section 0a records the cause of every failed target), `evidence/vs-threejs/4.5.0/{gate.txt,gate.json,results.json,static-metrics.json,full-game-results.json,extra.json}`, `evidence/vs-threejs/failing-rows-analysis.md` (row grouping), `evidence/vs-threejs/wp7/README.md` (frame structure of the game loop and skinned character), `evidence/vs-threejs/wp5-frame-submission.md` (cube CPU split), `evidence/forest-10k/README.md`, `evidence/exposure-parity/README.md`.

Companion, not repeated here: `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md` owns bundle size, requests on first load, first-load JS and engine init (its Track C, WP-C1 to C6). That is 42 of the 81 failing rows (group G1) plus the module-loading share of first-frame time. This PRD owns everything else.

Claim policy: unchanged from parts 1 and 2 and `docs/agents/claims-and-boundaries.md`. No public surface says Aura3D is faster, lighter or better than three.js while `node tools/bench-vs-threejs/gate.mjs` prints FAIL on T1, and every speed statement carries the software-WebGL2 qualifier until owner-run real-GPU receipts exist. Sales surfaces (README.md, marketing/index.html, marketing/docs/*.html) state only the Aura3D side, with method, for a target whose own gate line printed PASS.

---

## 1. Codebase Grounding & Autonomous Decisions

### Where 4.5.0 ended (gate output, `aura-auto`, software WebGL2)

7 PASS, 7 FAIL, 1 NO-DATA. The gate fails on T1.

| Target | 4.5.0 | Limit | Cause (from `RESULTS-4.5.0.md` section 0a) | Owner of the fix |
| --- | --- | --- | --- | --- |
| P1 cube frame | 5.3 ms | 5 ms | 0.9 ms CPU plus a fill-bound `gl.finish` wait | this PRD, WP-4 |
| P2 CPU in `frame()` | 0.9 ms | 0.5 ms | about 0.4 ms JavaScript and 0.3 ms GL calls in the interleaved profile | this PRD, WP-4 |
| P5 requests, cube | 31 | 8 | 30 JS chunks load on first paint | companion Track C |
| P6 forest 10k | 197 s, 3.12x | 300 s and 3x | fragment-bound shadow and camera pass; candidate run measured 2.99x | this PRD, WP-1 and WP-3 |
| P7 real GPU | no data | every scene | no receipts | owner step OWNER-1 |
| C1 audit rows | 7 of 7 | 0 | partial or experimental by design | this PRD, WP-7 (triage and the cheapest row) |
| M1 codemod | 150 / 47 / 0 | 100 / 20 / 0 | scene-graph, material and helper rows are approximate; 26 of the 47 `none` rows are deliberate loader and exporter exclusions | this PRD, WP-6 |
| T1 tally | 81 of 125 | 30 | see below | all |

### The 81 "three.js better" rows at 4.5.0

| Group | Sections | Rows | Owner |
| --- | --- | --- | --- |
| G1 bundle and requests | 4a to 4d, 5a to 5c | 42 | companion PRD |
| G2 first frame | 6, 7e | 10 | companion for module loading; this PRD, WP-5 for the rest |
| G3 frame time | 7a, 7b, 7d | 17 | this PRD, WP-1 and WP-2 |
| G4 CPU in `frame()` | 7c | 6 | this PRD, WP-4 |
| G5 draws, triangles, programs | 8a, 8b, 8c | 6 | this PRD, WP-1 and WP-3 |

**T1 arithmetic, stated plainly.** T1 needs the count to fall from 81 to 30 or fewer, so 51 rows must flip to a tie or an Aura3D win. This PRD can reach at most the 39 rows in G2 to G5. Even if every one of them flipped, 42 rows (all of G1) would remain, so T1 cannot pass from this PRD alone. It also cannot pass from the companion PRD alone: G1 compares total JS against three.js at 0.5 to 0.65 MB raw in one file, and the companion's own T8 target (a hello-world critical path of at most 750 KB gzip) is above three.js's 125 to 167 KB gzip, so most G1 rows will stay "three.js better" even if the companion meets its target. Decision 1 below handles this.

### Code facts this PRD relies on (all verified at `6813d5d24`)

- **Four of the five slow bench scenes are forced onto the HDR chain by one authored option.** The bench sources for the forest, skinned character, game loop and PBR viewer author `output: { toneMapping: "aces" }` (`tools/bench-vs-threejs/{forest,skinned-character,game-loop,pbr-viewer}/aura/scene.ts`). `renderPathBlockers` in `packages/engine/src/agent-api/app/renderPath.ts:105` blocks the direct path whenever `options.output` is defined, whatever its value. The scene then renders into a 4x multisampled RGBA16F target and an extra output pass (`RESULTS-4.5.0.md` section 8d: 4x MSAA targets and one blit for every scene except the cube). `evidence/vs-threejs/wp7/README.md` measured the game loop and skinned character as fill-bound in that target: removing 18 shadow draws did not change the frame time.
- **The direct path already tone-maps.** The forward programs encode with the OutputPass operator body (`tests/unit/rendering/direct-path-encode.test.ts` checks the encode against `packages/rendering/src/output/ToneMappingOperators.glsl`); the default operator is the ACES filmic fit (`a3dPbrEncodeOutput` in `packages/rendering/src/ShaderLibrary.ts:407`). Whether an authored `toneMapping: "aces"` (and which other operators and exposures) can stay on the direct path with an identical result is the open question WP-1 answers by measurement.
- **Direct path parity bound.** Direct and HDR frames agree to a mean of 2/255 in the interior; silhouettes differ by up to 48/255 on 0.1 to 0.3% of pixels because canvas MSAA resolves in display space, as three.js does (`evidence/vs-threejs/4.3.7/direct-path-parity.json`, `tests/browser/direct-path-parity.spec.ts`).
- **Bloom fusion** is shipped with a selectable mode (`bloomFusion` in `app.diagnostics().renderPath`; `packages/rendering/src/**` bloom passes). The PBR viewer (HDRI, shadow, bloom) is 391.9 ms against 316.5 ms for three.js 4x MSAA (1.24x) and 25 draws against 25.
- **Cube CPU split.** In the interleaved profile of the cube (0.7 ms real), about 0.4 ms is JavaScript and 0.3 ms GL calls; the gate figure is 0.9 ms because it is a median over 60 frames of the last cold load (`wp5-frame-submission.md`). Forest CPU is 11.6 ms against 0.7 ms.
- **Shadow cost.** `MAX_FORWARD_SHADOW_PCF_SAMPLES = 32` at `packages/rendering/src/ForwardPass.ts:285`; kernels are validated in `packages/rendering/src/forward/Lighting.ts`. Instance shadow proxies and the 2-cascade cap for 8,192+ shadow-casting instances are shipped (`evidence/forest-10k/README.md`). Check with `rg -n "tier" packages/rendering/src/forward/Lighting.ts` whether a tap-count tier exists before WP-3 adds one.
- **Cold-start timing is not split.** `ttffMs` in `results.json` runs from navigation to the first presented frame, so it mixes module loading (companion) with renderer start-up (this PRD). `tests/browser/bench-vs-threejs.spec.ts` and `tools/bench-vs-threejs/harness/extract.mjs` record no marker between the two. WP-5 adds it so the two PRDs cannot claim the same milliseconds.
- **Codemod.** `packages/math/src/three/` (Vector2, Vector3, Vector4, Matrix3, Matrix4, Quaternion, Euler, Color, Box3, Sphere, Plane, Ray, Frustum, Triangle) shipped; 48 rows are `exact` with fixtures against real three.js r185 (`tests/unit/aura3d-cli/migrate-three-fidelity.test.ts`, goldens in `tests/fixtures/migrate-three/goldens.json`). The 150 `approximate` rows are scene-graph, geometry, material, light, control, helper and animation-track constructs in `packages/aura3d-cli/src/migrate-three/mappings.ts`.
- **The Aura3D PBR viewer bench source never loads its HDRI.** `tools/bench-vs-threejs/pbr-viewer/aura/scene.ts:15` passes `{ type: "texture", format: "hdr", url: "/env.hdr" } as never`; the engine reads only an asset reference, so the neutral room lights the scene while the three.js arm loads the HDRI (`evidence/exposure-parity/README.md`). Every PBR viewer row in `RESULTS-4.5.0.md` (including the P4 draw count) was measured on that scene. The 4.5.0 sales copy says "a PBR viewer scene with a shadow and bloom" for that reason.
- **Audit rows still open (C1):** genre kits, root `createGame` (headless stub), `physics.*` mesh and heightfield colliders, joints and vehicles, `tsl`/`compute`/WebGPU, `xr`, `@aura3d/react`, and the `migrate three` codemod (`docs/comparisons/aura3d-capability-audit.md`). No row changed between 4.3.7 and 4.5.0.
- **Exposure gaps outside Q1.** Mean luma, three.js vs Aura3D: cube 2.9 vs 12.8, PBR viewer 55.0 vs 89.3, forest 148.2 vs 119.6. `evidence/exposure-parity/README.md` (PRD-2 WP-6) attributes the cube gap to the default background (`#070b12` against black) and ACES against no tone mapping, both intentional defaults that differ between the two bench sources, and the PBR viewer gap mostly to bench-source differences (see the next bullet).

### Autonomous decisions

1. **No target is moved, and an unreachable target is reported, not edited.** T1 stays at 30 and the gate is not changed. This PRD sets per-group goals (below) and records the projected T1 count after each measured run. If the companion PRD's measured G1 result leaves T1 out of reach, the owner decides whether to change the target (OWNER-3); an agent does not.
2. **Fix the cause the bench exposes, not the bench source.** The bench sources author `toneMapping: "aces"` to match the three.js arm. Removing that line from the Aura3D source would flip rows by changing what is measured. WP-1 changes the engine so a scene that authors a tone-mapping operator the direct path can reproduce is no longer forced onto the HDR chain. The bench sources stay as they are.
3. **Pixels are the guard.** Any change of render path ships only with a pixel comparison against `quality: "production"` inside the existing tolerance (mean <= 2/255, interior max <= 2/255, edge change <= 6/255 on <= 0.5% of pixels, or a documented baseline refresh). `quality: "production"` output stays byte-identical.
4. **Row counts are measured, never predicted.** Each WP states an acceptance condition and what the gate must print. Expected row flips are listed as hypotheses.
5. **Owner steps stay owner steps.** Real-GPU captures and the paid three-author batch are never started by an agent.
6. **Rows that compare against non-antialiased three.js stay in the tally.** Sections 7a and 7b (12 rows) compare Aura3D's 4x MSAA frame with three.js with no antialiasing, which is unequal work (`RESULTS-4.5.0.md` 7d is the equal-work table). The tally is not changed. WP-1 and WP-2 are judged on 7d first; a 7a or 7b flip is a bonus.

### Goals per group

| Group | 4.5.0 rows | Goal for this PRD | If missed |
| --- | --- | --- | --- |
| G2 first frame (non-module share) | 10 | forest first frame <= 5 s; renderer start-up reported separately from module load for all scenes | measured floor and cause in `evidence/` |
| G3 frame time | 17 | game loop and skinned character 7d rows at a tie or better; forest P6 <= 2.5x on 3 runs; PBR viewer <= 1.1x | measured value and cause |
| G4 CPU | 6 | cube <= 0.5 ms (P2); forest <= 6 ms | measured floor and cause |
| G5 draws, triangles, programs | 6 | every program accounted for as drawn or removed; game-loop triangles within 5% of three.js or the geometry difference documented | cause in `evidence/` |
| **Non-G1 total** | **39** | **at most 15 remain** | next PRD |

---

## 2. Data Model, API & Interface Contracts

### 2.1 Render-path blocker contract

```ts
// packages/engine/src/agent-api/app/renderPath.ts (extend)
// Output options the direct path reproduces exactly. Anything else still blocks.
export interface DirectPathOutputSupport {
  readonly toneMapping: ReadonlySet<"aces" | /* operators proven by WP-1 */ never>;
  readonly exposure: "default-only" | "uniform";   // "uniform" only if WP-1 adds a shader uniform
  readonly dithering: false;                       // authored dithering still blocks
}
// renderPathBlockers() no longer pushes "output options are authored" when every authored
// output field is inside DirectPathOutputSupport. Otherwise the blocker text names the field.
```

`app.diagnostics().renderPath.reason` states which authored field kept the scene on `hdr-msaa`. `quality: "production"` is unchanged.

### 2.2 Cold-start markers

`createAuraApp` records `performance.mark("aura:create")` at entry and `performance.mark("aura:first-frame")` at the first presented frame (no-op outside a browser). `extract.mjs` reports `ttffMs` as before, plus `moduleLoadMs` (navigation start to `aura:create`) and `startupMs` (`aura:create` to `aura:first-frame`). The gate's P3 still reads `ttffMs`.

### 2.3 Tally by group

`tools/bench-vs-threejs/harness/tally.mjs` gains a `--by-group` print that groups "three.js better" rows into G1 to G5 using the section table in `RESULTS-4.5.0.md` section 0a. It changes no verdict and no count.

### 2.4 Codemod fidelity

A `mappings.ts` row becomes `exact` only with a `test` fixture whose output is generated from real three@0.185.1 (`THREE_DIR=<dir> node tests/fixtures/migrate-three/generate.mjs`). No row is relabelled to meet a count.

---

## 3. File-by-File Breakdown

### CREATE

| Path | Content |
| --- | --- |
| `tests/unit/rendering/direct-path-output-options.test.ts` | WP-1: each authored output field either keeps `direct` with an identical encode or names itself as the blocker. |
| `tests/browser/direct-path-output-parity.spec.ts` | WP-1: forest, skinned character and game loop on `direct` against `production`: mean, interior max, edge diff. Remote. |
| `tests/browser/hdr-chain-cost.spec.ts`, `evidence/vs-threejs/hdr-chain-cost/` | WP-2: per-pass wait for the PBR viewer on the HDR chain, one row per candidate change. Remote. |
| `tests/unit/rendering/shadow-filter-tier.test.ts` | WP-3: tap count per tier and kernel validity (only if no tier exists). |
| `tests/unit/rendering/frame-submission-budget.test.ts` | WP-4: GL-call count and per-frame allocations for the cube. |
| `tests/unit/engine/cold-start-markers.test.ts` | WP-5: marks exist, order, no-op without `performance`. |
| `tests/unit/rendering/program-accounting.test.ts` | WP-6: each program created for the bench scenes is drawn or not created. |
| `tests/fixtures/migrate-three/*.fixture.ts` for promoted rows | WP-6. |
| `evidence/vs-threejs/RESULTS-after-450.md` | WP-8: the run that follows these changes, same format as `RESULTS-4.5.0.md`. |

### MODIFY

| Path | Change |
| --- | --- |
| `packages/engine/src/agent-api/app/renderPath.ts`, `packages/rendering/src/quality/DirectPath.ts`, `packages/rendering/src/output/ToneMappingOperators.glsl.ts`, `packages/rendering/src/program/ProgramGenerator.ts` | WP-1: let the forward encode take the authored operator; narrow the output blocker. |
| `packages/rendering/src/**` HDR target and bloom passes (`output/HdrTarget.ts`, `output/OutputPass.ts`, bloom files) | WP-2: only changes the per-pass measurement supports. |
| `packages/rendering/src/ForwardPass.ts`, `forward/Lighting.ts`, shadow shaders in `ShaderLibrary.ts` | WP-3: shadow filter tier for dense instanced casters. |
| `packages/rendering/src/{RenderDevice,Renderer}.ts`, `packages/engine/src/agent-api/app/frameLoop.ts` | WP-4: state cache, uniform batching, allocation. |
| `packages/engine/src/agent-api/compiler/renderer.ts` (mount), `tests/browser/bench-vs-threejs.spec.ts`, `tools/bench-vs-threejs/harness/extract.mjs`, `report.mjs`, `tally.mjs` | WP-5 and 2.3. |
| `packages/rendering/src/Renderer.ts` (warm), instanced and primitive tessellation defaults in `packages/engine/src/agent-api/nodes/primitives.ts` | WP-6. |
| `packages/aura3d-cli/src/migrate-three/mappings.ts`, `tests/unit/aura3d-cli/migrate-three-fidelity.test.ts` | WP-6. |
| `docs/comparisons/aura3d-capability-audit.md`, `docs/agents/claims-and-boundaries.md`, `docs/comparisons/threejs-positioning.md`, `CHANGELOG.md` | WP-8, only for a gate line that printed PASS. |

### DELETE

Nothing.

---

## 4. Detailed Parallelizable Tasklist

Lanes own disjoint files. Merge order: WP-5, WP-1, WP-3, WP-4, WP-2, WP-6, WP-7, WP-8. Browser work runs only through `tools/remote-acr/run.sh` (serverless Azure ACR task, `KEEP_IMAGE=0`, a unique `RUN_ID` per run); no local Docker or Playwright.

- **WP-1 Keep authored tone mapping on the direct path (G3, G5, P6).** Hypothesis: the forest, skinned character and game loop move from `hdr-msaa` to `direct`, which removes the 4x RGBA16F target, the resolve blit and the output draw (the skinned character's extra draw, `wp7/README.md`).
  1. Read `renderPathBlockers` and `ToneMappingOperators.glsl.ts`; list which `output.toneMapping` values and which exposure values the forward encode can reproduce. `aces` first.
  2. Pass the authored operator to the forward program's encode feature; narrow the blocker per 2.1. Fields that cannot be reproduced still block, with their name in the reason.
  3. Edge cases: `output.exposure` other than the default, authored `dithering`, URL overrides (`tm=`, `exp=`), a scene that adds post at runtime (switches to `hdr-msaa` as today), `quality: "production"` and `"cinematic"` unchanged, transparent materials (blend after encode on the direct path; keep them as a blocker).
  4. Acceptance: `app.diagnostics().renderPath` is `direct` for the three scenes with the bench sources untouched; `direct-path-output-parity.spec.ts` within the Decision 3 tolerance; frame time of the three scenes <= 50% of the 4.5.0 value, or the measured floor and cause recorded; P6 forest measured three times (candidate and 4.5.0 runs straddled 3x).
- **WP-2 HDR chain fill for scenes that need it (G3, PBR viewer, shader water).** Measure first.
  1. Record per-pass wait (shadow cascades, forward into the 4x RGBA16F target, resolve, bloom mips, composite, output) for the PBR viewer with `tests/browser/hdr-chain-cost.spec.ts`.
  2. Try only changes the numbers justify, one per row: packed float target format where supported, resolve and composite fusion, bloom mip count. Each row keeps `quality: "production"` byte-identical.
  3. Acceptance: PBR viewer `aura-auto` <= 1.1x three.js 4x MSAA over 3 runs (4.5.0: 1.24x), or the dominant pass and its floor recorded. A change that adds fill on software GL is not shipped as a default (part 2, decision 1).
- **WP-3 Forest shadows and draws (P6, G5 forest).**
  1. If no tap-count tier exists, add 32 / 16 / 8 per quality tier; dense instanced shadow casters (>= 8,192) default to the lower tier. `production` kernels unchanged.
  2. Forest draws are 8 against 7 (8a). Find the extra draw (camera pass, cascade pass or output pass) and remove it if it is not required.
  3. Acceptance: forest median <= 2.5x three.js 4x MSAA over 3 remote runs; shadow-heavy showcase games within the visual-regression tolerance, or the tier stays opt-in.
- **WP-4 CPU in `frame()` (P1, P2, G4).**
  1. Profile the cube with `tests/browser/frame-cost.spec.ts` (interleaved real versus stubbed GL, as in `wp5-frame-submission.md`) and the forest with `tests/browser/perf-frame-cost.spec.ts`.
  2. Cut the GL calls that repeat unchanged state (state cache for binds and uniforms), batch uniform uploads, remove per-frame allocation; for the forest, the instance upload and cull path (11.6 ms).
  3. Acceptance: cube CPU <= 0.5 ms on the remote run (P2) or the measured floor and cause recorded; cube frame <= 5 ms (P1) or the share of the gap that is the harness wait is recorded; forest CPU <= 6 ms; `webgl2-sampled-error-policy` test still passes and no GL error is masked.
- **WP-5 Split first-frame cost (G2, boundary with the companion).**
  1. Add the marks in 2.2 and the `moduleLoadMs` / `startupMs` columns in the bench output.
  2. The 4.5.0 runs have no marks, so the split appears from the next run (WP-8).
  3. With the split in hand, cut start-up work that is not module loading: the lighting probe build, program warm, shadow map allocation. Forest first frame is dominated by the first frame's raster cost (9.4 s), which WP-1 and WP-3 address.
  4. Acceptance: the split is reported for all six scenes; forest first frame <= 5 s or the floor recorded; P3 still passes (<= 500 ms).
- **WP-6 Draws, triangles, programs and codemod rows (G5, M1).**
  1. Program accounting: for each bench scene list programs created against programs drawn (PBR viewer 15 vs 14, skinned 4 vs 3, game loop 4 vs 2 at 4.5.0). Remove never-drawn programs or document the extra one (for example the output pass, which WP-1 removes on `direct`).
  2. Game-loop triangles 3,099 against 1,050: compare the primitive tessellation defaults (cylinder radial segments, sphere rings) with three.js's defaults; keep Aura3D's defaults only if the visual quality case is written down, and never change the bench source to hide a difference.
  3. Codemod: promote `approximate` rows to `exact` only where a golden fixture proves it. Candidate groups by count: keyframe tracks (7), buffer attributes (4), fog (2), cameras (2), basic lights (5), geometry classes (6), loader `.load` forms. Target M1 approximate <= 100 (50 promotions); report the real count.
  4. Record that `none <= 20` is unreachable while 26 rows are loader and exporter exclusions; do not relabel them.
  5. Acceptance: draws, triangles and programs rows are flipped or explained in `evidence/`; the fidelity test passes with every promoted row named.
- **WP-7 Audit rows (C1).** For each of the 7 open rows write the decision: promote with a receipt, or leave with the missing evidence named. Take the cheapest: genre kits (a receipt per kit: unit test, remote pixel receipt, compiling example per `docs/agents/genre-kits.md`) and the `createGame` stub (either make the root export a thin re-export of `@aura3d/engine/game` or document it as removed from public claims; choose by whether `@aura3d/game` still imports the stub, `rg -n "contracts/stubs/game" packages`). Acceptance: `tools/receipts/check.mjs` exits 0; the audit changes only for rows with all three promotion items.
- **WP-8 Measure and copy (last).**
  0. Fix the PBR viewer bench source so its HDRI loads through an asset reference (`defineAuraAssets`, no `as never`), in its own commit named for the defect. Report the PBR viewer rows for both the old and the fixed source; the fixed source is the one the tally uses afterwards, and the change is stated in the results file.
  1. After the other WPs merge, run `BENCH_AURA_VERSION=<candidate> tools/bench-vs-threejs/harness/run-candidate.sh` (published mode needs a published version; before a release use workspace mode and say so), 3 cold loads and 60 steady frames, forest on its plan; write `evidence/vs-threejs/RESULTS-after-450.md`.
  2. Run `node tools/bench-vs-threejs/gate.mjs --results <results.json> --static <static-metrics.json> --extra <extra.json>`.
  3. Copy: per PASS gate line only, update the audit, boundaries and positioning "Claims to unlock", then README and site with Aura3D-side facts and method. For each FAIL, record value and cause in `evidence/`. No "faster", "lighter" or "better than three.js" while T1 fails.

### Owner steps (listed separately; an agent never starts these)

- **OWNER-1 Real-GPU receipts (P7).** `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac, or a granted GPU quota; feeds the gate's real-GPU column. Until then every speed statement keeps the software-WebGL2 qualifier.
- **OWNER-2 Paid three-author batch.** `node tools/bench-vs-threejs/shared/authors/run-authors.mjs --dry-run` validates; a paid run needs the owner's `--confirm-spend`. D1 and D2 pass on hand-tuned sources, so independent authors may move them.
- **OWNER-3 Decision on unreachable targets.** After the companion's G1 result and WP-8, decide whether T1 (<= 30) and M1 `none` (<= 20) stay as written. Evidence for the decision: the projected T1 count and the 26 loader and exporter exclusions.
- **OWNER-4 Release.** Publishing, tagging and deploy follow the standing steps in `tools/release/publish-all.mjs`; protected token variables are never set or written.

---

## 5. Verification & Acceptance Checklist

Heavy and browser steps run on the remote runner; typecheck and unit tests may run locally.

### Static and unit
- [ ] `pnpm typecheck` shows no new errors against `main`.
- [ ] `npx tsc -p tsconfig.build.json` passes.
- [ ] `node_modules/.bin/vitest run tests/unit/rendering/direct-path-output-options.test.ts tests/unit/rendering/direct-path-encode.test.ts tests/unit/rendering/render-path-selection.test.ts tests/unit/rendering/shadow-filter-tier.test.ts tests/unit/rendering/frame-submission-budget.test.ts tests/unit/rendering/program-accounting.test.ts tests/unit/engine/cold-start-markers.test.ts tests/unit/aura3d-cli/migrate-three-fidelity.test.ts tests/unit/agent-api/option-coverage.test.ts` passes.
- [ ] `node tools/receipts/check.mjs` exits 0.
- [ ] `pnpm check:marketing-truth && pnpm check:docs-codeblocks && pnpm check:marketing-links && node marketing/scripts/check-site.mjs && node marketing/scripts/gen-seo.mjs` pass, and regenerated files are committed if they changed.

### Browser (remote, software WebGL2)
- [ ] `RUN_ID=dp-$(date -u +%H%M%S) KEEP_IMAGE=0 SPECS="tests/browser/direct-path-output-parity.spec.ts tests/browser/direct-path-parity.spec.ts" tools/remote-acr/run.sh`: forest, skinned character and game loop are `direct`, inside the pixel tolerance.
- [ ] `RUN_ID=hdr-$(date -u +%H%M%S) KEEP_IMAGE=0 SPECS="tests/browser/hdr-chain-cost.spec.ts" tools/remote-acr/run.sh`: per-pass table written; PBR viewer ratio recorded.
- [ ] `RUN_ID=fo-$(date -u +%H%M%S) KEEP_IMAGE=0 SPECS="tests/browser/forest-10k.spec.ts" tools/remote-acr/run.sh` three times: median <= 2.5x three.js 4x MSAA.
- [ ] `RUN_ID=fc-$(date -u +%H%M%S) KEEP_IMAGE=0 SPECS="tests/browser/frame-cost.spec.ts tests/browser/perf-frame-cost.spec.ts" tools/remote-acr/run.sh`: cube CPU <= 0.5 ms, forest CPU <= 6 ms, console empty.
- [ ] `RUN_ID=w7-$(date -u +%H%M%S) KEEP_IMAGE=0 tools/bench-vs-threejs/harness/run-wp7.sh`: game loop and skinned programs and draws at or below the 4.5.0 values.
- [ ] Visual-regression, exposure and post-luma suites with the full context profile show no unexplained diffs (`tests/browser/exposure-scenes-*.spec.ts`, `tests/browser/post-luma-games-*.spec.ts`).
- [ ] `az acr repository show-tags` lists no tag for any `RUN_ID` used above.

### Benchmark gate
- [ ] `node tools/bench-vs-threejs/gate.mjs --results <results.json> --static <static-metrics.json> --extra <extra.json>` prints PASS for each targeted row; `node tools/bench-vs-threejs/harness/tally.mjs --by-group` prints the new group counts.
- [ ] Non-G1 "three.js better" rows are at most 15, or the shortfall and cause are in `evidence/`.
- [ ] T1 is reported with the companion's G1 result; no "beats three.js" wording ships while it fails.
- [ ] Real-GPU rows come from owner-run receipts, or every speed statement keeps the software-WebGL2 qualifier.

---

## 6. Out of Scope & Guardrails

- Bundle size, requests on first load, first-load JS and engine init (companion PRD Track C), agent-first authoring, `aura3d verify`.
- Changing the gate, the tally rule or the bench scene sources to move a row. Any three.js column on a sales surface. Any "built on three.js" wording.
- Native WebGPU as the default backend, XR on real headsets, porting every three.js addon, a hosted asset catalog.
- No local Docker or Playwright; no unbounded `find`, `du`, `grep` or `rg` from the home directory or `/`; no change to `quality: "production"` output; no change to game art to hide a regression.
- Real-GPU captures and paid LLM batches are owner steps. Protected token variables are never set or written.

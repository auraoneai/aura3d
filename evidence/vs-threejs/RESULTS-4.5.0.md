# Aura3D 4.5.0 vs three.js 0.185.1: measured results

Run 2026-10-28 on branch `post450/bench` (main at `6813d5d24`, the commit tagged `v4.5.0`; harness change in `a03d00cc6`). Remote runner only (`tools/remote-acr/run.sh`, serverless Azure ACR tasks, run prefix `p450b-1028a`, groups a to e and the full game, `KEEP_IMAGE=0`), **software WebGL2 (SwiftShader), not a GPU**. Every speed figure is a software-rasteriser figure. Real-GPU target P7 has no data.

**Published mode.** The Aura3D arms are built from the registry install of `@aura3d/engine@4.5.0` and `@aura3d/assets@4.5.0` (`BENCH_AURA_VERSION=4.5.0 tools/bench-vs-threejs/harness/run-candidate.sh`, stock Vite build via `shared/aura-vite.ts`), not from workspace sources. This is the first run in which P3 and P5 are published-bundle numbers; the earlier candidate run (`RESULTS-candidate.md`) was a source build with inflated request counts. One run, one author, no variance estimate.

Method: `tools/bench-vs-threejs/METHODOLOGY.md` (640x360, dpr 1, ACES, 3 cold loads, 10 warm-up and 60 measured frames, forest on its reduced plan, equal antialiasing: Aura3D arms pair with `three-msaa`). The three-independent-author runs were not repeated; source-size rows use the single hand-tuned sources. Raw files: `evidence/vs-threejs/4.5.0/` (`results.json`, `static-metrics.json`, `full-game-results.json`, `gate.txt`, `gate.json`, `extra.json`, `frames/`, `fg-frames/`).

## 0. Gate: every target at Aura3D 4.5.0

`node tools/bench-vs-threejs/gate.mjs --results evidence/vs-threejs/4.5.0/results.json --static evidence/vs-threejs/4.5.0/static-metrics.json --extra evidence/vs-threejs/4.5.0/extra.json`, Aura3D arm `aura-auto`. D3 comes from `tests/unit/agent-api/option-coverage.test.ts` (16 of 16 pass, so 0 silent no-ops). Full output: `4.5.0/gate.txt`.

| Target | Status | Measured at 4.5.0 (aura-auto) | Target value | 4.3.7 (history) | Note |
| --- | --- | --- | --- | --- | --- |
| P1 Steady-state frame, one cube | **FAIL** | 5.3 ms | <= 5 ms | 42.9 ms | three.js 4x MSAA 1.5 ms; software WebGL2 |
| P2 CPU inside frame(), one cube | **FAIL** | 0.9 ms | <= 0.5 ms | 3.00 ms | three.js 0.1 ms; software WebGL2 |
| P3 Time to first frame, one cube | **PASS** | 418.7 ms | <= 500 ms | 954 ms | three.js 93.2 ms; software WebGL2 |
| P4 Draw calls, one cube / PBR viewer | **PASS** | 1 / 25 | 1 / <= 25 | 2 / 33 | software WebGL2 |
| P5 Requests on first load, one cube | **FAIL** | 31 | <= 8 | 31 | software WebGL2 |
| P6 Forest 10k completes on software GL | **FAIL** | 197 s, 3.12x | <= 5 min and <= 3x three.js 4x MSAA | 7.32 s/frame, 5.1x, 333 s | software WebGL2 |
| P7 Real GPU: steady-state frame, five scenes | **NO-DATA** | n/a | <= three.js 4x MSAA on every scene | n/a | no real-GPU results; speed claims keep the software WebGL2 qualifier; real GPU |
| Q1 Exposure: skinned character mean luma | **PASS** | three.js 144 vs Aura3D 136.2 (5.4%) | within 10% | 144 vs 192.5 (34%) | software WebGL2 |
| Q2 Console warnings on the five bench scenes | **PASS** | 0 message(s), 0 kind(s) | 0 | 1 kind | software WebGL2 |
| D1 Source: hello cube lines / tokens | **PASS** | 12 / 208 | <= 12 / <= 210 | 18 / 278 | source |
| D2 Source: shader water lines / tokens | **PASS** | 71 / 1317 | <= 80 / <= 1,386 | 87 / 1,554 | source |
| D3 Silent no-ops in the documented API | **PASS** | 0 | 0 | not measured | pass --extra with silentNoOps from tests/unit/agent-api/option-coverage.test.ts; option-coverage test |
| C1 Partial and experimental audit rows | **FAIL** | 7 of 7 unresolved | 0 unresolved | 12 rows | Genre kits: `racketSports`, `arcadeKart`, `carSoccer`, fighting, platformer motion; Root `createGame`; `physics.*` root: mesh and heightfield colliders, joints, vehicles; `tsl` (62 names), `compute`, WebGPU backend; `xr`; docs |
| M1 Codemod rows approximate / none / pending | **FAIL** | 150 / 47 / 0 | <= 100 / <= 20 / 0 | n/a | exact 48; source |
| T1 Benchmark tally: three.js better rows | **FAIL** | 81 of 125 | <= 30 | 91 of 125 | Aura3D better 23, tie 16, unmeasurable 5; software WebGL2 |

**PASS 7, FAIL 7, NO-DATA 1. The gate fails on T1 (81 rows where three.js is better; limit 30).**

What the numbers say:

- P1 misses by 0.3 ms (5.3 ms vs 5 ms) and P2 by 0.4 ms (0.9 ms vs 0.5 ms). The cube is 3.5x three.js 4x MSAA (1.5 ms) and 9x three.js CPU (0.1 ms). `aura-production` takes 42.8 ms on the same cube (2 draws, 2 programs), so the default path is 8.1x faster than the old one.
- P3 passes (419 ms) because this is a published bundle. P5 fails (31 requests, 30 JS files, 4,046 KB raw JS for the cube, against 2 requests and 496 KB for three.js); the bundle work has not landed.
- P6 fails narrowly: 197 s wall (under 300 s) but 3.12x three.js 4x MSAA (4,421 vs 1,419 ms per frame, limit 3x). The candidate run measured 2.99x (212 s); with 12 frames and one cold load the two runs straddle the limit, so treat P6 as at the threshold, not fixed.
- Q1 passes (skinned character 136.2 vs 144.0, 5.4%), but the exposure gap remains on other scenes (section 10b): cube 12.8 vs 2.9, PBR viewer 89.3 vs 55.0, forest 119.6 vs 148.2.
- P4 passes with 1 draw for the cube and 25 for the PBR viewer (4.3.7: 2 and 33). Q2 passes (0 console messages from Aura3D on the five scenes; 4.3.7 had the `WEIGHTS_0` warning).
- D1 and D2 pass. C1 has 7 unresolved of 7 audit rows and M1 150 approximate / 47 none / 0 pending (exact 48); both read the repository at `6813d5d24`.
- On the PBR viewer `aura-auto` (391.9 ms) is 1.24x `three-msaa` (316.5 ms) and still slower than three.js with no antialiasing (222.7 ms). On shader water `aura-auto` (105.5 ms) is faster than `three-msaa` (129.2 ms). The skinned character is 3.7x and the game loop 7.2x `three-msaa`.

Against 4.3.7 (`RESULTS-4.3.7.md`, production profile): cube frame 42.9 to 5.3 ms, first frame 954 to 419 ms, draws 2 to 1; PBR viewer draws 33 to 25; forest frame 7,319 to 4,421 ms and first frame 16.4 to 9.4 s; tally three.js better 91 to 81, Aura3D better 19 to 23, tie 10 to 16, unmeasurable 5 to 5.

Against the earlier candidate run (`RESULTS-candidate.md`, workspace build taken before the 4.5.0 look-fill fixes): its P3 696 ms and P5 33 were source-build numbers; its PBR viewer `aura-auto` 632.9 ms is now 391.9 ms. Its tally was 86 / 23 / 11 / 5.

### 0a. Failed and unmeasured targets: value and cause

No public claim is made for any row below. The candidate-run grouping of the "three.js better" rows is in [`failing-rows-analysis.md`](failing-rows-analysis.md); the 4.5.0 counts per group are in the second table.

| Target | Measured | Limit | Cause | Where the cause is recorded |
| --- | --- | --- | --- | --- |
| P1 cube frame | 5.3 ms | 5 ms | The direct path still costs 0.9 ms of CPU per frame; the rest is the harness `gl.finish` wait on a software rasteriser, which is fill-rate bound. three.js 4x MSAA is 1.5 ms. | `wp5-frame-submission.md`; `failing-rows-analysis.md` G3 |
| P2 CPU in `frame()` | 0.9 ms | 0.5 ms | JavaScript plus GL command submission. In the interleaved profile of the cube (0.7 ms real), about 0.4 ms is JavaScript and about 0.3 ms is GL calls; the state cache and allocation fixes moved the median by 0.1 to 0.4 ms but did not reach 0.5. three.js is 0.1 ms. | `wp5-frame-submission.md` |
| P5 requests, cube | 31 (30 JS files, 4,046 KB raw) | 8 | The published engine is emitted as 30 JS chunks that all load on first paint, whatever the scene uses. three.js is 1 file, 496 KB. Nothing in the 4.5.0 benchmark work touched bundle composition. | Companion `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md`, Track C; `failing-rows-analysis.md` G1 |
| P6 forest 10k | 197 s, 3.12x three.js 4x MSAA (4,421 vs 1,419 ms per frame) | <= 300 s and <= 3x | Fragment-bound shadow sampling and the camera pass on software GL. The candidate run measured 2.99x (212 s); with 12 frames and one cold load the two runs straddle the limit. Not fixed, at the threshold. | `evidence/forest-10k/README.md`; `failing-rows-analysis.md` G3 |
| P7 real GPU | no data | <= three.js 4x MSAA on every scene | No real-GPU receipt exists. Owner step: `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac. | `evidence/real-gpu/README.md` |
| C1 audit rows | 7 of 7 unresolved | 0 | The rows are partial or experimental by design: genre kits, root `createGame` (a headless stub), `physics.*` mesh and heightfield colliders, joints and vehicles, `tsl`/`compute`/WebGPU, `xr`. None changed in 4.5.0. | `docs/comparisons/aura3d-capability-audit.md` |
| M1 codemod rows | 150 approximate / 47 none / 0 pending (48 exact) | <= 100 / <= 20 / 0 | Aura3D math classes are immutable values and three.js classes mutate in place, so most math rows stay `approximate`; most `none` rows are loader and exporter addons that Aura3D does not port. | `packages/aura3d-cli/src/migrate-three/mappings.ts`; `docs/prds/beat-threejs/PRD-beat-threejs-2-remaining-gaps.md` WP-2 |
| T1 tally | 81 of 125 three.js better | <= 30 | 42 of the 81 are bundle size and requests (G1); the other 39 are frame time, CPU time, first frame and draw counts. Even if all 39 flipped, 42 would remain, so T1 needs the companion PRD's bundle work as well. | table below |

**Bench-source defect that affects the PBR viewer rows.** `tools/bench-vs-threejs/pbr-viewer/aura/scene.ts` passes the HDRI as a bare `{ type, format, url }` object cast with `as never`. The engine reads only an asset reference, so the HDRI never loads and the neutral room lights the scene (`evidence/exposure-parity/README.md`, PRD-2 WP-6 attribution). The PBR viewer draw count (P4), frame time, luma and request rows are therefore measured on a scene that does not do what its source declares; the three.js arm loads its HDRI. The source is left as it was in this run so that 4.5.0 numbers stay comparable with earlier runs; the fix and a re-run are in `docs/prds/beat-threejs/PRD-beat-threejs-3-after-450.md` (WP-8).

Where the 81 "three.js better" rows sit at 4.5.0 (`aura-auto`; `node tools/bench-vs-threejs/harness/tally.mjs` rows, grouped as in `failing-rows-analysis.md`):

| Group | Sections | Rows at 4.5.0 | Rows in the candidate run | What remains |
| --- | --- | --- | --- | --- |
| G1 bundle and requests | 4a to 4d, 5a to 5c | 42 | 42 | Aura3D 4.0 MB raw JS across 30 files for every scene; three.js 0.5 to 0.65 MB in 1 file. Companion PRD. |
| G2 first frame | 6, 7e | 10 | 10 | Cube 419 vs 93 ms, forest 9.4 s vs 1.4 s, skinned character 1.9 s vs 0.56 s, game loop 1.0 s vs 0.18 s, shader water 0.91 s vs 0.25 s. The PBR viewer is an Aura3D win (2.3 s vs 6.1 s). |
| G3 frame time | 7a, 7b, 7d | 17 | 17 | Skinned character 3.7x and game loop 7.2x three.js 4x MSAA; forest 3.1x; PBR viewer 1.24x; cube 3.5x. Shader water is an Aura3D win against `three-msaa`. |
| G4 CPU in `frame()` | 7c | 6 | 6 | 0.9 to 11.6 ms against 0.1 to 0.7 ms. |
| G5 draws, triangles, programs | 8a, 8b, 8c | 6 | 11 | Forest 8 vs 7 draws, skinned character 6 vs 5, game loop 3,099 vs 1,050 triangles, programs 15 vs 14 (PBR viewer), 4 vs 3 (skinned), 4 vs 2 (game loop). |
| **Total** | | **81** | **86** | |

**Read this first.** All timings come from a CPU-only remote runner with **software WebGL2 (SwiftShader), not a GPU**. They compare CPU/driver cost under identical conditions; they are not GPU performance numbers and say nothing about an Apple M-series or desktop GPU. Rows are marked `tie` within 5%. Lower is better in every numeric row. Verdicts are per row and are not averaged into a score.

Runner: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (vendor Google Inc. (Google)), 2 logical CPUs reported by the browser. Libraries as installed in the container: @aura3d/engine 4.5.0, three 0.185.1, vite 7.3.2.

Sections 1 to 9 and the tally compare `aura-auto` (the Aura3D arm the gate reads) against `three` and `three-msaa`; the `Aura3D` columns below are `aura-auto`.

## 1. Source size: lines of code (scene.ts only)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 15 | 12 | Aura3D better |
| 1 PBR viewer | 49 | 23 | Aura3D better |
| 2 forest 10k | 71 | 48 | Aura3D better |
| 3 skinned character | 62 | 44 | Aura3D better |
| 4 game loop | 82 | 60 | Aura3D better |
| 5 shader water | 86 | 71 | Aura3D better |

Extra files an Aura3D app needed to build (three.js needed none):

| Scene | assets.generated.ts | vite.config.ts | shared/aura-vite.ts (shared by all) |
| --- | --- | --- | --- |
| baseline (one cube) | 0 | 1 | 10 |
| 1 PBR viewer | 1 | 1 | 10 |
| 2 forest 10k | 0 | 1 | 10 |
| 3 skinned character | 1 | 1 | 10 |
| 4 game loop | 0 | 1 | 10 |
| 5 shader water | 0 | 1 | 10 |

## 2. Source size: tokens (gpt-tokenizer o200k_base (OpenAI BPE; a proxy: Claude's tokenizer is not public))

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 210 | 208 | tie |
| 1 PBR viewer | 740 | 452 | Aura3D better |
| 2 forest 10k | 1,213 | 986 | Aura3D better |
| 3 skinned character | 846 | 768 | Aura3D better |
| 4 game loop | 1,178 | 1,112 | Aura3D better |
| 5 shader water | 1,386 | 1,317 | tie |

## 3. Distinct import modules and API concepts

| Scene | three.js modules | Aura3D modules | Verdict (modules) | three.js symbols | Aura3D symbols | Verdict (symbols) |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 1 | 1 | tie | 8 | 6 | Aura3D better |
| 1 PBR viewer | 8 | 1 | Aura3D better | 21 | 11 | Aura3D better |
| 2 forest 10k | 1 | 1 | tie | 20 | 9 | Aura3D better |
| 3 skinned character | 2 | 1 | Aura3D better | 17 | 8 | Aura3D better |
| 4 game loop | 1 | 1 | tie | 14 | 9 | Aura3D better |
| 5 shader water | 5 | 1 | Aura3D better | 15 | 7 | Aura3D better |

## 4. Production bundle (vite build, JS only)

`raw` is the sum of every emitted `.js` file; `largest chunk` is the single biggest file. Assets (GLB, HDR) are excluded and listed in section 5.

### 4a. Total JS emitted: raw

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB | 4,046.2 KB | three.js better |
| 1 PBR viewer | 639.7 KB | 4,049.0 KB | three.js better |
| 2 forest 10k | 506.1 KB | 4,047.9 KB | three.js better |
| 3 skinned character | 608.8 KB | 4,049.5 KB | three.js better |
| 4 game loop | 503.2 KB | 4,052.5 KB | three.js better |
| 5 shader water | 508.2 KB | 4,049.3 KB | three.js better |

### 4b. Total JS emitted: gzip -9

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 124.8 KB | 1,210.8 KB | three.js better |
| 1 PBR viewer | 163.0 KB | 1,212.1 KB | three.js better |
| 2 forest 10k | 127.8 KB | 1,211.4 KB | three.js better |
| 3 skinned character | 155.9 KB | 1,212.3 KB | three.js better |
| 4 game loop | 127.5 KB | 1,213.6 KB | three.js better |
| 5 shader water | 128.6 KB | 1,212.1 KB | three.js better |

### 4c. Total JS emitted: brotli -11

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 102.9 KB | 1,021.0 KB | three.js better |
| 1 PBR viewer | 133.7 KB | 1,021.9 KB | three.js better |
| 2 forest 10k | 105.4 KB | 1,021.4 KB | three.js better |
| 3 skinned character | 128.3 KB | 1,022.1 KB | three.js better |
| 4 game loop | 105.2 KB | 1,023.3 KB | three.js better |
| 5 shader water | 105.8 KB | 1,021.9 KB | three.js better |

### 4d. Largest single chunk (raw / gzip)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB / 124.8 KB | 948.8 KB / 310.0 KB | three.js better |
| 1 PBR viewer | 639.7 KB / 163.0 KB | 951.6 KB / 311.3 KB | three.js better |
| 2 forest 10k | 506.1 KB / 127.8 KB | 950.5 KB / 310.7 KB | three.js better |
| 3 skinned character | 608.8 KB / 155.9 KB | 952.1 KB / 311.6 KB | three.js better |
| 4 game loop | 503.2 KB / 127.5 KB | 955.1 KB / 312.9 KB | three.js better |
| 5 shader water | 508.2 KB / 128.6 KB | 951.9 KB / 311.3 KB | three.js better |

**Check against the earlier figure (engine chunk ~2.9 MB raw / ~845 KB gzip vs three ~366 KB / ~87 KB).** Measured here for the one-cube baseline: three.js 495.7 KB raw / 124.8 KB gzip in its largest chunk (495.7 KB / 124.8 KB all JS); Aura3D 948.8 KB raw / 310.0 KB gzip in its largest chunk (4,046.2 KB raw / 1,210.8 KB gzip across 42 JS files). Aura3D's total is 8.16x three.js raw and 9.70x gzip. The single-chunk figure does not reproduce exactly here: the build splits the engine across several chunks, so compare the totals.

## 5. Network on first load (one cold load, uncompressed static server)

### 5a. Request count (successful responses)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 2 | 31 | three.js better |
| 1 PBR viewer | 5 | 35 | three.js better |
| 2 forest 10k | 2 | 31 | three.js better |
| 3 skinned character | 5 | 36 | three.js better |
| 4 game loop | 2 | 31 | three.js better |
| 5 shader water | 2 | 31 | three.js better |

### 5b. JS bytes actually fetched on load (raw)

| Scene | three.js | Aura3D | Verdict | three.js JS files | Aura3D JS files |
| --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB | 3,115.3 KB | three.js better | 1 | 30 |
| 1 PBR viewer | 639.7 KB | 3,137.7 KB | three.js better | 1 | 32 |
| 2 forest 10k | 506.1 KB | 3,117.0 KB | three.js better | 1 | 30 |
| 3 skinned character | 608.8 KB | 3,186.1 KB | three.js better | 1 | 33 |
| 4 game loop | 503.2 KB | 3,121.7 KB | three.js better | 1 | 30 |
| 5 shader water | 508.2 KB | 3,118.4 KB | three.js better | 1 | 30 |

### 5c. Total bytes fetched on load (JS + assets + document)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 496.0 KB | 3,117.5 KB | three.js better |
| 1 PBR viewer | 2,688.7 KB | 3,862.5 KB | three.js better |
| 2 forest 10k | 506.4 KB | 3,119.2 KB | three.js better |
| 3 skinned character | 3,366.0 KB | 7,408.0 KB | three.js better |
| 4 game loop | 503.5 KB | 3,123.9 KB | three.js better |
| 5 shader water | 508.5 KB | 3,120.6 KB | three.js better |

Failed requests (status >= 400) on load: baseline three 0 / aura 0; pbr-viewer three 0 / aura 0; forest three 0 / aura 0; skinned-character three 0 / aura 0; game-loop three 0 / aura 0; shader-water three 0 / aura 0

## 6. Time to first frame (median of 3 cold loads, ms; includes asset load and shader compile, software GL)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 93 | 419 | three.js better |
| 1 PBR viewer | 6,087 | 2,301 | Aura3D better |
| 2 forest 10k | 1,445 | 9,372 | three.js better |
| 3 skinned character | 562 | 1,899 | three.js better |
| 4 game loop | 181 | 998 | three.js better |
| 5 shader water | 254 | 912 | three.js better |

## 7. Steady-state frame time (60 frames, software WebGL2, ms)

### 7a. Total per frame, median (until gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.7 | 5.3 | three.js better |
| 1 PBR viewer | 222.7 | 391.9 | three.js better |
| 2 forest 10k | 1,070.4 | 4,420.9 | three.js better |
| 3 skinned character | 51.4 | 253.7 | three.js better |
| 4 game loop | 20.2 | 162.4 | three.js better |
| 5 shader water | 52.6 | 105.5 | three.js better |

### 7b. Total per frame, p95

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1.3 | 6.1 | three.js better |
| 1 PBR viewer | 235.7 | 403.6 | three.js better |
| 2 forest 10k | 1,110.0 | 4,893.0 | three.js better |
| 3 skinned character | 60.5 | 322.0 | three.js better |
| 4 game loop | 22.1 | 170.6 | three.js better |
| 5 shader water | 60.6 | 115.9 | three.js better |

### 7c. CPU time inside frame(), median (JS + command submission, before gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.10 | 0.90 | three.js better |
| 1 PBR viewer | 0.70 | 4.40 | three.js better |
| 2 forest 10k | 0.70 | 11.60 | three.js better |
| 3 skinned character | 0.50 | 4.00 | three.js better |
| 4 game loop | 0.40 | 4.60 | three.js better |
| 5 shader water | 0.30 | 2.40 | three.js better |

### 7d. Total per frame, median, antialiasing equalised

The default Aura3D production profile renders into 4x multisampled RGBA16F targets (section 8d). The three.js apps above have no antialiasing, so 7a compares unequal work. This table adds three.js with 4x MSAA (`antialias: true`, or a 4-sample `EffectComposer` target for the post scenes). Both are software GL.

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D (4x MSAA default) | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 0.7 | 1.5 | 5.3 | three.js better |
| 1 PBR viewer | 222.7 | 316.5 | 391.9 | three.js better |
| 2 forest 10k | 1,070.4 | 1,419.2 | 4,420.9 | three.js better |
| 3 skinned character | 51.4 | 67.9 | 253.7 | three.js better |
| 4 game loop | 20.2 | 22.7 | 162.4 | three.js better |
| 5 shader water | 52.6 | 129.2 | 105.5 | Aura3D better |

### 7e. Time to first frame (ms), antialiasing equalised

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 93 | 100 | 419 | three.js better |
| 1 PBR viewer | 6,087 | 6,236 | 2,301 | Aura3D better |
| 2 forest 10k | 1,445 | 1,784 | 9,372 | three.js better |
| 3 skinned character | 562 | 580 | 1,899 | three.js better |
| 4 game loop | 181 | 192 | 998 | three.js better |
| 5 shader water | 254 | 384 | 912 | three.js better |

## 8. Draw calls and triangles per steady frame (all passes)

### 8a. Draw calls

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 1 | tie |
| 1 PBR viewer | 25 | 25 | tie |
| 2 forest 10k | 7 | 8 | three.js better |
| 3 skinned character | 5 | 6 | three.js better |
| 4 game loop | 19 | 20 | tie |
| 5 shader water | 4 | 4 | tie |

### 8b. Triangles submitted

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 12 | 12 | tie |
| 1 PBR viewer | 7,264 | 7,266 | tie |
| 2 forest 10k | 1,168,002 | 952,659 | Aura3D better |
| 3 skinned character | 22,754 | 22,755 | tie |
| 4 game loop | 1,050 | 3,099 | three.js better |
| 5 shader water | 19,394 | 19,458 | tie |

### 8c. Distinct shader programs created by the time of measurement

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 1 | tie |
| 1 PBR viewer | 14 | 15 | three.js better |
| 2 forest 10k | 7 | 7 | tie |
| 3 skinned character | 3 | 4 | three.js better |
| 4 game loop | 2 | 4 | three.js better |
| 5 shader water | 4 | 4 | tie |

### 8d. What the renderers set up per frame (viewport sizes, resolve blits, multisampled targets)

| Scene | three.js viewports | three.js blits | three.js MSAA targets | Aura3D viewports | Aura3D blits | Aura3D MSAA targets |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | n/a | 0 | none | 640x360 | 0 | none |
| 1 PBR viewer | 1024x1024, 640x360, 320x180, 160x90, 80x45, 40x23, 20x12 | 0 | none | 640x360, 2048x2048, 320x180, 160x90, 80x45, 40x23, 20x12 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 2 forest 10k | 2048x2048, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 3 skinned character | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 4 game loop | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 5 shader water | n/a | 0 | none | 640x360 | 1 | 4x 34842 640x360; 4x 33190 640x360 |

## 9. Correctness

There is no ground-truth image, so *which library is right* is `unmeasurable`; the table says how close the two libraries' pictures are at identical simulated time (frame 25; frame 85 in the JSD f85 column, frame 280 for the skinned character). JSD is Jensen-Shannon divergence of 64-bin luma histograms (0 identical, 1 maximal). Mean luma is 0-255. `gain-matched` rescales Aura3D's luma by mean(three)/mean(Aura3D) first, so a global exposure difference does not hide whether the layout agrees. The baseline cube is not a visual scene and is excluded.

| Scene | JSD f25 | JSD f85 | mean luma three / Aura (f25) | mean luma delta f25 | mean abs luma diff f25 | gain-matched JSD f25 | gain-matched mean abs diff f25 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 PBR viewer | 0.4578 | 0.4481 | 55.0 / 89.3 | 34.3 | 36.5 | 0.5220 | 19.9 | unmeasurable (no reference image); see frames |
| 2 forest 10k | 0.5768 | 0.5784 | 148.2 / 119.6 | 28.6 | 35.3 | 0.5334 | 45.3 | unmeasurable (no reference image); see frames |
| 3 skinned character | 0.9817 | 0.9837 | 144.0 / 136.2 | 7.7 | 10.7 | 0.7097 | 7.9 | unmeasurable (no reference image); see frames |
| 4 game loop | 0.4715 | 0.4714 | 59.6 / 54.4 | 5.1 | 5.2 | 0.6654 | 3.2 | unmeasurable (no reference image); see frames |
| 5 shader water | 0.0000 | 0.0000 | 175.2 / 175.2 | 0.0 | 0.2 | 0.0000 | 0.2 | unmeasurable (no reference image); see frames |

Animation and determinism checks:

| Check | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| Game loop: two 1800-step replays hash identically | yes | yes | tie |
| Game loop: replay hash (1800 steps) | lost:60:1800:9b693d58 | lost:60:1800:9b693d58 | tie (same rules, same stream) |
| Game loop: replay hash (600 steps) | playing:30:600:321a662f | playing:30:600:321a662f | tie |
| Skinned character: luma change between frame 25 and 85 (mean abs, proves motion) | 2.59 | 3.18 | see note: both must be > 0 |
| Skinned character: clips reported | ["Idle","Run","TPose","Walk"] | ["Idle","Run","TPose","Walk"] | unmeasurable |

Console errors and warnings during the run (first few per app):

- baseline/three: 4 message(s): [warning] [.WebGL-0x368400129a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x368400129a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x368400129a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- baseline/aura: 0 message(s)
- pbr-viewer/three: 1 message(s): [warning] RGBELoader has been deprecated. Please use HDRLoader instead.
- pbr-viewer/aura: 0 message(s)
- forest/three: 4 message(s): [warning] [.WebGL-0x1e840012da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1e840012da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1e840012da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- forest/aura: 0 message(s)
- skinned-character/three: 4 message(s): [warning] [.WebGL-0x86400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x86400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x86400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- skinned-character/aura: 0 message(s)
- game-loop/three: 0 message(s)
- game-loop/aura: 0 message(s)
- shader-water/three: 4 message(s): [warning] [.WebGL-0x20400135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x20400135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x20400135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- shader-water/aura: 0 message(s)

## 10. Per-arm results (both Aura3D arms, both three.js arms)

`aura-auto` is the scene source as written (default `quality: "auto"`). `aura-production` is the same source with `quality: "production"` injected into `createAuraApp` at build time (the pre-4.5.0 pipeline). `three` is three.js with default settings (no antialiasing); `three-msaa` is three.js with 4x MSAA, the equal-work arm for both Aura3D arms (both render into 4x multisampled targets). Sections 1 to 9 and the tally use `aura-auto`; `aura-production` is reported here only. Medians of 60 steady frames and 3 cold loads (forest: 12 frames, 1 cold load).

| Scene | Arm | Frame ms (median) | p95 ms | CPU ms | First frame ms | Draws | Programs | Requests | Console |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| one cube | three | 0.7 | 1.3 | 0.10 | 93 | 1 | 1 | 2 | 4 |
| one cube | three-msaa | 1.5 | 3.0 | 0.10 | 100 | 1 | 1 | 2 | 4 |
| one cube | aura-auto | 5.3 | 6.1 | 0.90 | 419 | 1 | 1 | 31 | 0 |
| one cube | aura-production | 42.8 | 50.3 | 2.60 | 562 | 2 | 2 | 31 | 0 |
| PBR viewer | three | 222.7 | 235.7 | 0.70 | 6,087 | 25 | 14 | 5 | 1 |
| PBR viewer | three-msaa | 316.5 | 393.2 | 0.70 | 6,236 | 25 | 14 | 5 | 1 |
| PBR viewer | aura-auto | 391.9 | 403.6 | 4.40 | 2,301 | 25 | 15 | 35 | 0 |
| PBR viewer | aura-production | 401.6 | 447.6 | 4.60 | 2,300 | 33 | 12 | 35 | 0 |
| skinned character | three | 51.4 | 60.5 | 0.50 | 562 | 5 | 3 | 5 | 4 |
| skinned character | three-msaa | 67.9 | 76.0 | 0.50 | 580 | 5 | 3 | 5 | 0 |
| skinned character | aura-auto | 253.7 | 322.0 | 4.00 | 1,899 | 6 | 4 | 36 | 0 |
| skinned character | aura-production | 249.4 | 259.6 | 3.90 | 1,779 | 6 | 4 | 36 | 0 |
| game loop | three | 20.2 | 22.1 | 0.40 | 181 | 19 | 2 | 2 | 0 |
| game loop | three-msaa | 22.7 | 24.4 | 0.30 | 192 | 19 | 2 | 2 | 0 |
| game loop | aura-auto | 162.4 | 170.6 | 4.60 | 998 | 20 | 4 | 31 | 0 |
| game loop | aura-production | 167.7 | 204.6 | 4.70 | 1,056 | 38 | 4 | 31 | 0 |
| shader water | three | 52.6 | 60.6 | 0.30 | 254 | 4 | 4 | 2 | 4 |
| shader water | three-msaa | 129.2 | 140.6 | 0.30 | 384 | 4 | 4 | 2 | 0 |
| shader water | aura-auto | 105.5 | 115.9 | 2.40 | 912 | 4 | 4 | 31 | 0 |
| shader water | aura-production | 115.4 | 187.1 | 2.60 | 847 | 4 | 4 | 31 | 0 |
| forest 10k | three | 1,070.4 | 1,110.0 | 0.70 | 1,445 | 7 | 7 | 2 | 4 |
| forest 10k | three-msaa | 1,419.2 | 1,475.5 | 0.60 | 1,784 | 7 | 7 | 2 | 0 |
| forest 10k | aura-auto | 4,420.9 | 4,893.0 | 11.60 | 9,372 | 8 | 7 | 31 | 0 |
| forest 10k | aura-production | 4,679.8 | 5,058.5 | 12.00 | 10,016 | 11 | 7 | 31 | 0 |

### 10a. Frame time against the equal-work arm

| Scene | aura-auto / three-msaa (frame) | aura-production / three-msaa (frame) | aura-auto vs aura-production |
| --- | --- | --- | --- |
| one cube | 3.53x | 28.53x | auto faster (5.3 vs 42.8 ms) |
| PBR viewer | 1.24x | 1.27x | auto faster (391.9 vs 401.6 ms) |
| skinned character | 3.74x | 3.67x | production faster (253.7 vs 249.4 ms) |
| game loop | 7.15x | 7.39x | auto faster (162.4 vs 167.7 ms) |
| shader water | 0.82x | 0.89x | auto faster (105.5 vs 115.4 ms) |
| forest 10k | 3.12x | 3.30x | auto faster (4,420.9 vs 4,679.8 ms) |

### 10b. Mean luma, frame A (aura-auto)

| Scene | three.js luma (frame A) | Aura3D luma (frame A, aura-auto) | Difference |
| --- | --- | --- | --- |
| one cube | 2.9 | 12.8 | 343.4% |
| PBR viewer | 55.0 | 89.3 | 62.4% |
| skinned character | 144.0 | 136.2 | -5.4% |
| game loop | 59.6 | 54.4 | -8.6% |
| shader water | 175.2 | 175.2 | 0.0% |
| forest 10k | 148.2 | 119.6 | -19.3% |

Tally if the `aura-production` arm were the compared arm: Aura3D better 23, three.js better 85, tie 12, unmeasurable 5.

## 11. Full game (coin dash, `tests/browser/fullgame-compare.spec.ts`) at Aura3D 4.5.0

Built from the registry install of `@aura3d/engine@4.5.0` (published mode: no workspace sources, type-check on), stock `vite build` with no config. Both builds type-check and build. All 32 behavioural checks (16 per build: non-black frame, four touch controls, pause by key and by button, results on win and on time-up, audio unlock and cues, restart by key and by button, seeded replay hash, resize/DPR, teardown and remount without leaks) pass, 0 fail, and the replay hashes agree at 600 and 1,800 steps. Raw: `4.5.0/full-game-results.json`. The full game is one Aura3D arm (the source as written, default `quality: "auto"`); this spec measures no frame times.

| Metric | three.js | Aura3D 4.5.0 | Verdict |
| --- | --- | --- | --- |
| Authored lines (all `src/*`) | 373 | 271 | Aura3D better |
| Tokens (o200k_base proxy) | 3,529 | 2,622 | Aura3D better |
| Production JS raw / gzip | 516,898 B / 131,094 B | 3,645,076 B / 1,144,923 B | three.js better |
| JS files emitted | 1 | 39 | three.js better |

Against 4.3.7 (3,596,528 B raw / 1,129,133 B gzip, 28 checks): the Aura3D bundle is 3,645,076 B raw (1.3% change). Single run, software GL, one author.

## Tally of numeric rows

Aura3D better: 23; three.js better: 81; tie: 16; unmeasurable: 5. (Rows counted: every per-scene row in sections 1 to 9.)

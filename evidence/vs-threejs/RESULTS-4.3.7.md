# Aura3D 4.3.7 vs three.js 0.185.1: measured results

Generated 2026-10-28T02:04:54.463Z from `results.json` (run groups on separate remote runners) and `static-metrics.json`. Method: `tools/bench-vs-threejs/README.md`.

**Read this first.** All timings come from a CPU-only remote runner with **software WebGL2 (SwiftShader), not a GPU**. They compare CPU/driver cost under identical conditions; they are not GPU performance numbers and say nothing about an Apple M-series or desktop GPU. Rows are marked `tie` within 5%. Lower is better in every numeric row. Verdicts are per row and are not averaged into a score.

Runner: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (vendor Google Inc. (Google)), 2 logical CPUs reported by the browser. Libraries as installed in the container: @aura3d/engine 4.3.7, three 0.185.1, vite 7.3.2.

## 0. Status of every section-1 finding of the PRD at Aura3D 4.3.7

Measured on the remote runner (Azure ACR task, software WebGL2 / SwiftShader, 2 logical CPUs), published `@aura3d/engine@4.3.7` from the npm registry against `three@0.185.1`, same scene sources as the 4.1.2 run (`evidence/vs-threejs/RESULTS.md`, kept unchanged as history). One run, one author, software GL: nothing here is a GPU number. **Every Aura3D scene still pins `renderer: { mode: "production", qualityProfile: "production" }` in its source, so these are the production-profile numbers; the lane that adds `quality: "auto"` needs a second Aura3D arm (`aura-auto`) that omits the renderer options.**

Status words: **fixed** (target met or the failure no longer reproduces), **improved, open** (better than 4.1.2 but the PRD target is not met), **unchanged**, **worse**, **unmeasured here** (not something this harness measures; owner lane named).

| # | Finding | 4.1.2 (PRD section 1) | 4.3.7 measured | PRD target | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Steady-state frame, one cube (median, total until sync) | Aura3D 623.2 ms vs three.js 0.9 ms (1.4 ms 4x MSAA) | Aura3D 42.9 ms vs three.js 0.7 ms (1.5 ms 4x MSAA) | P1 <= 5 ms | **improved, open** (14.5x faster than 4.1.2; still 29x three.js 4x MSAA) |
| 2 | CPU inside `frame()`, one cube | 3.50 ms vs 0.10 ms | 3.00 ms vs 0.10 ms | P2 <= 0.5 ms | **unchanged, open** |
| 3 | Time to first frame, one cube (median of 3 cold loads) | 3,269 ms vs 95 ms | 954 ms vs 108 ms | P3 <= 500 ms | **improved, open** (3.4x faster; 8.8x three.js, 7.8x three.js 4x MSAA) |
| 4 | Draw calls, one cube / PBR viewer | 2 vs 1; 33 vs 25 | 2 vs 1; 33 vs 25 | P4 1 / <= 25 | **unchanged, open** |
| 5 | Requests on first load, one cube | 26 vs 2 | 31 vs 2 (30 JS files, 3,069 KB of JS fetched) | P5 <= 8 | **worse, open** (bundle work is in the companion PRD) |
| 6 | 10,000-instance forest | never produced a result in 55 min | **completes**: first frame 16.4 s, 7.32 s per steady frame (12 frames) vs three.js 4x MSAA 1.43 s; whole measurement 333 s | P6 completes <= 5 min and <= 3x three.js 4x MSAA | **stall fixed; ratio open**: 5.1x three.js 4x MSAA (target 3x); measurement wall 333 s (target 300 s) |
| 7 | Exposure, skinned character mean luma, same nominal lights | 144 (three.js) vs 192.5 (Aura3D) in `results.json` | 144.0 / 192.5 (three.js / Aura3D). Aura3D is **brighter**, not darker as PRD text says. Other lit scenes: PBR 55.0 / 89.3, game loop 59.6 / 94.4, forest 148.2 / 155.6 | Q1 within 10% | **unchanged, open** (Aura3D 34% brighter on the character) |
| 8 | Source size, hello cube lines / tokens | 18 / 278 vs 15 / 210 | 18 / 278 vs 15 / 210 | D1 <= 12 / <= 210 | **unchanged, open** (sources untouched; authoring PRD owns it) |
| 9 | Source size, shader water | 87 / 1,554 vs 86 / 1,386 | 87 / 1,554 vs 86 / 1,386 | D2 <= 80 / <= 1,386 | **unchanged, open** |
| 10 | Silent no-ops (`primitives.plane` segments, `interactions.orbit` options) | accepted and ignored | not measured by this harness. Static read: `primitives.ts:22` lists `widthSegments`/`heightSegments` for plane; `interactions.ts:7` types orbit options as `{ target?: string }` only | D3 0 | **unmeasured here** (lane L-S verifies vertex counts and overloads) |
| 11 | Console noise | `POSTPROCESS_V2_UNMIGRATED`, `WEIGHTS_0 normalized` | Aura3D apps: `POSTPROCESS_V2_UNMIGRATED` **gone** (0 messages on 5 of 6 apps); `WEIGHTS_0 normalized: 0 degenerate vertex(es) set to [1,0,0,0], 52 rescaled to sum 1` **still emitted** on skinned-character/aura | Q2 0 warnings | **partly fixed, open** (1 kind left) |
| 12 | Partial / experimental capabilities (12 audit rows) | see audit | not a harness metric | C1 | **unmeasured here** (lane L-K) |

Benchmark tally at 4.3.7 (numeric rows, same rule as 4.1.2): Aura3D better 19, three.js better 91, tie 10, unmeasurable 5 (4.1.2: 18 / 76 / 10 / 20). The three.js-better count rose most likely because the forest rows, unmeasurable at 4.1.2 because it never finished, are now measured and are all three.js wins on this runner (not diffed row by row against the 4.1.2 tally). Target T1 (<= 30) is far from met; it is a goal for the whole PRD, not for WP-0.

Where the first-frame and steady-frame time goes is in sections 11 to 13 below (CPU profiles, forest stall hunt, re-baselined targets).

## 1. Source size: lines of code (scene.ts only)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 15 | 18 | three.js better |
| 1 PBR viewer | 49 | 24 | Aura3D better |
| 2 forest 10k | 71 | 49 | Aura3D better |
| 3 skinned character | 62 | 45 | Aura3D better |
| 4 game loop | 82 | 61 | Aura3D better |
| 5 shader water | 86 | 87 | tie |

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
| baseline (one cube) | 210 | 278 | three.js better |
| 1 PBR viewer | 740 | 474 | Aura3D better |
| 2 forest 10k | 1,213 | 1,008 | Aura3D better |
| 3 skinned character | 846 | 790 | Aura3D better |
| 4 game loop | 1,178 | 1,134 | tie |
| 5 shader water | 1,386 | 1,554 | three.js better |

## 3. Distinct import modules and API concepts

| Scene | three.js modules | Aura3D modules | Verdict (modules) | three.js symbols | Aura3D symbols | Verdict (symbols) |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 1 | 1 | tie | 8 | 6 | Aura3D better |
| 1 PBR viewer | 8 | 1 | Aura3D better | 21 | 11 | Aura3D better |
| 2 forest 10k | 1 | 1 | tie | 20 | 9 | Aura3D better |
| 3 skinned character | 2 | 1 | Aura3D better | 17 | 8 | Aura3D better |
| 4 game loop | 1 | 1 | tie | 14 | 9 | Aura3D better |
| 5 shader water | 5 | 1 | Aura3D better | 15 | 8 | Aura3D better |

## 4. Production bundle (vite build, JS only)

`raw` is the sum of every emitted `.js` file; `largest chunk` is the single biggest file. Assets (GLB, HDR) are excluded and listed in section 5.

### 4a. Total JS emitted: raw

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB | 3,998.9 KB | three.js better |
| 1 PBR viewer | 639.7 KB | 4,001.6 KB | three.js better |
| 2 forest 10k | 506.1 KB | 4,000.6 KB | three.js better |
| 3 skinned character | 608.8 KB | 4,002.2 KB | three.js better |
| 4 game loop | 503.2 KB | 4,005.2 KB | three.js better |
| 5 shader water | 508.2 KB | 4,018.7 KB | three.js better |

### 4b. Total JS emitted: gzip -9

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 124.8 KB | 1,195.5 KB | three.js better |
| 1 PBR viewer | 163.0 KB | 1,196.7 KB | three.js better |
| 2 forest 10k | 127.8 KB | 1,196.1 KB | three.js better |
| 3 skinned character | 155.9 KB | 1,197.0 KB | three.js better |
| 4 game loop | 127.5 KB | 1,198.3 KB | three.js better |
| 5 shader water | 128.6 KB | 1,202.1 KB | three.js better |

### 4c. Total JS emitted: brotli -11

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 102.9 KB | 1,009.2 KB | three.js better |
| 1 PBR viewer | 133.7 KB | 1,010.2 KB | three.js better |
| 2 forest 10k | 105.4 KB | 1,009.6 KB | three.js better |
| 3 skinned character | 128.3 KB | 1,010.3 KB | three.js better |
| 4 game loop | 105.2 KB | 1,011.4 KB | three.js better |
| 5 shader water | 105.8 KB | 1,014.4 KB | three.js better |

### 4d. Largest single chunk (raw / gzip)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB / 124.8 KB | 931.0 KB / 304.0 KB | three.js better |
| 1 PBR viewer | 639.7 KB / 163.0 KB | 933.7 KB / 305.2 KB | three.js better |
| 2 forest 10k | 506.1 KB / 127.8 KB | 932.6 KB / 304.6 KB | three.js better |
| 3 skinned character | 608.8 KB / 155.9 KB | 934.2 KB / 305.5 KB | three.js better |
| 4 game loop | 503.2 KB / 127.5 KB | 937.3 KB / 306.8 KB | three.js better |
| 5 shader water | 508.2 KB / 128.6 KB | 938.0 KB / 306.4 KB | three.js better |

**Check against the earlier figure (engine chunk ~2.9 MB raw / ~845 KB gzip vs three ~366 KB / ~87 KB).** Measured here for the one-cube baseline: three.js 495.7 KB raw / 124.8 KB gzip in its largest chunk (495.7 KB / 124.8 KB all JS); Aura3D 931.0 KB raw / 304.0 KB gzip in its largest chunk (3,998.9 KB raw / 1,195.5 KB gzip across 42 JS files). Aura3D's total is 8.07x three.js raw and 9.58x gzip. The single-chunk figure does not reproduce exactly here: the build splits the engine across several chunks, so compare the totals.

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
| baseline (one cube) | 495.7 KB | 3,068.6 KB | three.js better | 1 | 30 |
| 1 PBR viewer | 639.7 KB | 3,090.9 KB | three.js better | 1 | 32 |
| 2 forest 10k | 506.1 KB | 3,070.3 KB | three.js better | 1 | 30 |
| 3 skinned character | 608.8 KB | 3,138.8 KB | three.js better | 1 | 33 |
| 4 game loop | 503.2 KB | 3,074.9 KB | three.js better | 1 | 30 |
| 5 shader water | 508.2 KB | 3,088.2 KB | three.js better | 1 | 30 |

### 5c. Total bytes fetched on load (JS + assets + document)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 496.0 KB | 3,070.8 KB | three.js better |
| 1 PBR viewer | 2,688.7 KB | 3,815.8 KB | three.js better |
| 2 forest 10k | 506.4 KB | 3,072.5 KB | three.js better |
| 3 skinned character | 3,366.0 KB | 7,360.7 KB | three.js better |
| 4 game loop | 503.5 KB | 3,077.1 KB | three.js better |
| 5 shader water | 508.5 KB | 3,090.4 KB | three.js better |

Failed requests (status >= 400) on load: baseline three 0 / aura 0; pbr-viewer three 0 / aura 0; forest three 0 / aura 0; skinned-character three 0 / aura 0; game-loop three 0 / aura 0; shader-water three 0 / aura 0

## 6. Time to first frame (median of 3 cold loads, ms; includes asset load and shader compile, software GL)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 108 | 954 | three.js better |
| 1 PBR viewer | 6,007 | 2,571 | Aura3D better |
| 2 forest 10k | 1,674 | 16,379 | three.js better |
| 3 skinned character | 686 | 2,234 | three.js better |
| 4 game loop | 181 | 1,659 | three.js better |
| 5 shader water | 253 | 1,221 | three.js better |

## 7. Steady-state frame time (60 frames, software WebGL2, ms)

### 7a. Total per frame, median (until gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.7 | 42.9 | three.js better |
| 1 PBR viewer | 221.5 | 395.9 | three.js better |
| 2 forest 10k | 1,232.5 | 7,319.4 | three.js better |
| 3 skinned character | 50.1 | 250.9 | three.js better |
| 4 game loop | 19.7 | 167.2 | three.js better |
| 5 shader water | 53.1 | 113.7 | three.js better |

### 7b. Total per frame, p95

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1.3 | 46.5 | three.js better |
| 1 PBR viewer | 317.5 | 475.3 | three.js better |
| 2 forest 10k | 1,588.1 | 8,170.7 | three.js better |
| 3 skinned character | 68.6 | 285.3 | three.js better |
| 4 game loop | 20.4 | 208.2 | three.js better |
| 5 shader water | 66.8 | 141.5 | three.js better |

### 7c. CPU time inside frame(), median (JS + command submission, before gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.10 | 3.00 | three.js better |
| 1 PBR viewer | 0.70 | 5.70 | three.js better |
| 2 forest 10k | 0.50 | 23.60 | three.js better |
| 3 skinned character | 0.50 | 4.80 | three.js better |
| 4 game loop | 0.30 | 6.10 | three.js better |
| 5 shader water | 0.30 | 3.10 | three.js better |

### 7d. Total per frame, median, antialiasing equalised

The default Aura3D production profile renders into 4x multisampled RGBA16F targets (section 8d). The three.js apps above have no antialiasing, so 7a compares unequal work. This table adds three.js with 4x MSAA (`antialias: true`, or a 4-sample `EffectComposer` target for the post scenes). Both are software GL.

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D (4x MSAA default) | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 0.7 | 1.5 | 42.9 | three.js better |
| 1 PBR viewer | 221.5 | 312.6 | 395.9 | three.js better |
| 2 forest 10k | 1,232.5 | 1,425.9 | 7,319.4 | three.js better |
| 3 skinned character | 50.1 | 66.8 | 250.9 | three.js better |
| 4 game loop | 19.7 | 29.2 | 167.2 | three.js better |
| 5 shader water | 53.1 | 129.2 | 113.7 | Aura3D better |

### 7e. Time to first frame (ms), antialiasing equalised

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 108 | 122 | 954 | three.js better |
| 1 PBR viewer | 6,007 | 6,564 | 2,571 | Aura3D better |
| 2 forest 10k | 1,674 | 1,831 | 16,379 | three.js better |
| 3 skinned character | 686 | 582 | 2,234 | three.js better |
| 4 game loop | 181 | 217 | 1,659 | three.js better |
| 5 shader water | 253 | 383 | 1,221 | three.js better |

## 8. Draw calls and triangles per steady frame (all passes)

### 8a. Draw calls

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 2 | three.js better |
| 1 PBR viewer | 25 | 33 | three.js better |
| 2 forest 10k | 7 | 851 | three.js better |
| 3 skinned character | 5 | 6 | three.js better |
| 4 game loop | 19 | 38 | three.js better |
| 5 shader water | 4 | 4 | tie |

### 8b. Triangles submitted

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 12 | 13 | tie |
| 1 PBR viewer | 7,264 | 7,274 | tie |
| 2 forest 10k | 1,168,002 | 4,608,003 | three.js better |
| 3 skinned character | 22,754 | 22,755 | tie |
| 4 game loop | 1,050 | 6,195 | three.js better |
| 5 shader water | 19,394 | 22,530 | three.js better |

### 8c. Distinct shader programs created by the time of measurement

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 3 | three.js better |
| 1 PBR viewer | 14 | 18 | three.js better |
| 2 forest 10k | 7 | 9 | three.js better |
| 3 skinned character | 3 | 8 | three.js better |
| 4 game loop | 2 | 6 | three.js better |
| 5 shader water | 4 | 4 | tie |

### 8d. What the renderers set up per frame (viewport sizes, resolve blits, multisampled targets)

| Scene | three.js viewports | three.js blits | three.js MSAA targets | Aura3D viewports | Aura3D blits | Aura3D MSAA targets |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | n/a | 0 | none | 640x360 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 1 PBR viewer | 1024x1024, 640x360, 320x180, 160x90, 80x45, 40x23, 20x12 | 0 | none | 640x360, 2048x2048, 320x180, 160x90, 80x45, 40x23, 20x12 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 2 forest 10k | 2048x2048, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 3 skinned character | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 4 game loop | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 5 shader water | n/a | 0 | none | 640x360 | 1 | 4x 34842 640x360; 4x 33190 640x360 |

## 9. Correctness

There is no ground-truth image, so *which library is right* is `unmeasurable`; the table says how close the two libraries' pictures are at identical simulated time (frame 25; frame 85 in the JSD f85 column, frame 280 for the skinned character). JSD is Jensen-Shannon divergence of 64-bin luma histograms (0 identical, 1 maximal). Mean luma is 0-255. `gain-matched` rescales Aura3D's luma by mean(three)/mean(Aura3D) first, so a global exposure difference does not hide whether the layout agrees. The baseline cube is not a visual scene and is excluded.

| Scene | JSD f25 | JSD f85 | mean luma three / Aura (f25) | mean luma delta f25 | mean abs luma diff f25 | gain-matched JSD f25 | gain-matched mean abs diff f25 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 PBR viewer | 0.4578 | 0.4481 | 55.0 / 89.3 | 34.3 | 36.5 | 0.5219 | 19.9 | unmeasurable (no reference image); see frames |
| 2 forest 10k | 0.3864 | 0.3865 | 148.2 / 155.6 | 7.5 | 17.4 | 0.3979 | 16.0 | unmeasurable (no reference image); see frames |
| 3 skinned character | 0.9673 | 0.9724 | 144.0 / 192.5 | 48.5 | 48.6 | 0.6877 | 19.1 | unmeasurable (no reference image); see frames |
| 4 game loop | 0.4845 | 0.4845 | 59.6 / 94.4 | 34.8 | 34.8 | 0.9741 | 11.5 | unmeasurable (no reference image); see frames |
| 5 shader water | 0.0000 | 0.0000 | 175.2 / 175.2 | 0.0 | 0.2 | 0.0000 | 0.2 | unmeasurable (no reference image); see frames |

Animation and determinism checks:

| Check | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| Game loop: two 1800-step replays hash identically | yes | yes | tie |
| Game loop: replay hash (1800 steps) | lost:60:1800:9b693d58 | lost:60:1800:9b693d58 | tie (same rules, same stream) |
| Game loop: replay hash (600 steps) | playing:30:600:321a662f | playing:30:600:321a662f | tie |
| Skinned character: luma change between frame 25 and 85 (mean abs, proves motion) | 2.59 | 1.70 | see note: both must be > 0 |
| Skinned character: clips reported | ["Idle","Run","TPose","Walk"] | ["Idle","Run","TPose","Walk"] | unmeasurable |

Console errors and warnings during the run (first few per app):

- baseline/three: 4 message(s): [warning] [.WebGL-0x1e1400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1e1400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1e1400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- baseline/aura: 0 message(s)
- pbr-viewer/three: 1 message(s): [warning] RGBELoader has been deprecated. Please use HDRLoader instead.
- pbr-viewer/aura: 0 message(s)
- forest/three: 4 message(s): [warning] [.WebGL-0x2c3400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x2c3400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x2c3400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- forest/aura: 0 message(s)
- skinned-character/three: 4 message(s): [warning] [.WebGL-0x1cbc0014da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1cbc0014da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1cbc0014da00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- skinned-character/aura: 1 message(s): [warning] glTF mesh 0 primitive 0 WEIGHTS_0 normalized: 0 degenerate vertex(es) set to [1,0,0,0], 52 rescaled to sum 1
- game-loop/three: 0 message(s)
- game-loop/aura: 0 message(s)
- shader-water/three: 4 message(s): [warning] [.WebGL-0x3bdc00105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x3bdc00105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x3bdc00105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- shader-water/aura: 0 message(s)

## 11. CPU flame summary (WP-0.3): one cube, Aura3D 4.3.7

V8 sampling profile (200 us interval) via CDP on **unminified** builds (`vite build --minify false`; a separate build from the timing groups, so absolute times are inflated by profiling overhead: first frame 1,264 ms under the profiler vs 954 ms unprofiled). Percentages are of busy (non-idle) samples. Raw: `aux-profile-baseline-aura.json`.

### 11a. First-frame path, one cube (profiler on from before navigation until the first frame is ready)

Timeline: DOMContentLoaded at 231 ms, last of 29 JS responses ends at 381 ms, first frame done at 1,264 ms, so **883 ms (70%) is spent after the last script arrives** (parse, engine start, environment probe, shader compile, first draw). three.js for comparison: 1 JS request, first frame 130 ms.

| # | Function @ file:line (unminified build) | Self ms | % of busy |
| --- | --- | --- | --- |
| 1 | `finish @ index-BV_ybq7v.js:70` | 256.1 | 23% |
| 2 | `floatToHalf @ Rgb9e5Cube-CWgp9jN0.js:172` | 248.3 | 22.3% |
| 3 | `(program) @ native:0` | 116.2 | 10.5% |
| 4 | `halfToFloat @ Rgb9e5Cube-CWgp9jN0.js:446` | 56.7 | 5.1% |
| 5 | `(anonymous) @ Rgb9e5Cube-CWgp9jN0.js:483` | 45.6 | 4.1% |
| 6 | `faceToHalf @ Rgb9e5Cube-CWgp9jN0.js:186` | 44.6 | 4% |
| 7 | `probeToEquirectTexture @ Rgb9e5Cube-CWgp9jN0.js:479` | 35.4 | 3.2% |
| 8 | `sampleCube @ SphericalHarmonics-BTP6w6ZJ.js:151` | 25.5 | 2.3% |
| 9 | `finalizeLinkedProgram @ ComputeContext-CUMky0wE.js:12166` | 20.0 | 1.8% |
| 10 | `downsampleRgba @ Rgb9e5Cube-CWgp9jN0.js:456` | 18.9 | 1.7% |
| 11 | `(garbage collector) @ native:0` | 16.0 | 1.4% |
| 12 | `compileShader @ ComputeContext-CUMky0wE.js:12851` | 15.6 | 1.4% |
| 13 | `uploadCubeTexture @ ComputeContext-CUMky0wE.js:10683` | 11.5 | 1% |
| 14 | `prepareFullscreenPresentation @ ComputeContext-CUMky0wE.js:14227` | 10.7 | 1% |
| 15 | `clonePixelData @ Texture-Csyae563.js:354` | 9.8 | 0.9% |

By file (self ms): Rgb9e5Cube-CWgp9jN0.js 454; index-BV_ybq7v.js 321; native 141; ComputeContext-CUMky0wE.js 119; SphericalHarmonics-BTP6w6ZJ.js 25.

Reading it: the largest JS cost is `Rgb9e5Cube` (default image-based-lighting probe built on the CPU: `floatToHalf`, `halfToFloat`, `faceToHalf`, `probeToEquirectTexture`, `downsampleRgba`, `sampleCube`/spherical harmonics) at about 454 ms, for a scene that has one ambient light and a PBR cube. `finish` (the harness readPixels sync, i.e. software-GPU work for the first MSAA frame) is the next largest. Shader compile and link are small here (about 36 ms).

### 11b. Steady frame, one cube (60 frames, profiler on for the loop only)

53.4 ms wall per frame under the profiler (42.9 ms unprofiled), of which 4.69 ms is JS inside `frame()`. **93.3% of busy time is the `readPixels` sync: software rasterisation of two 4x multisampled 640x360 targets plus the resolve blit.** three.js 4x MSAA for the same scene: 1.6 ms wall per frame, 0.13 ms JS.

| # | Function @ file:line (unminified build) | Self ms | % of busy |
| --- | --- | --- | --- |
| 1 | `readPixels @ native:0` | 2,997.4 | 93.3% |
| 2 | `getParameter @ native:0` | 40.4 | 1.3% |
| 3 | `getError @ native:0` | 30.4 | 0.9% |
| 4 | `(program) @ native:0` | 14.2 | 0.4% |
| 5 | `bufferSubData @ native:0` | 8.4 | 0.3% |
| 6 | `(garbage collector) @ native:0` | 5.3 | 0.2% |
| 7 | `updateRouteDiagnostics @ index-BV_ybq7v.js:20377` | 4.2 | 0.1% |
| 8 | `getShader @ ForwardPass-DHWSASrc.js:6755` | 4.1 | 0.1% |
| 9 | `stableSerialize @ program-CeT_sToi.js:3173` | 3.6 | 0.1% |
| 10 | `parseHex @ index-BV_ybq7v.js:22846` | 3.5 | 0.1% |
| 11 | `presentLdrPostprocess @ ComputeContext-CUMky0wE.js:13219` | 3.4 | 0.1% |
| 12 | `getDiagnostics @ ComputeContext-CUMky0wE.js:12662` | 2.9 | 0.1% |
| 13 | `drawItem @ ForwardPass-DHWSASrc.js:6539` | 2.9 | 0.1% |
| 14 | `matchMedia @ native:0` | 2.9 | 0.1% |
| 15 | `collectAuraSceneEvidence @ index-BV_ybq7v.js:31741` | 2.9 | 0.1% |

Inclusive view (the JS side of the frame):

| # | Function (inclusive) | Ms | % of busy |
| --- | --- | --- | --- |
| 1 | `(root) @ native:0` | 3,212.6 | 100% |
| 2 | `(anonymous) @ native:1` | 3,193.1 | 99.4% |
| 3 | `evaluate @ native:296` | 3,193.1 | 99.4% |
| 4 | `finish @ index-BV_ybq7v.js:70` | 2,997.7 | 93.3% |
| 5 | `readPixels @ native:0` | 2,997.4 | 93.3% |
| 6 | `frame @ index-BV_ybq7v.js:43148` | 195.4 | 6.1% |
| 7 | `frameRaw @ index-BV_ybq7v.js:89` | 195.4 | 6.1% |
| 8 | `step @ index-BV_ybq7v.js:24025` | 195.1 | 6.1% |
| 9 | `render @ index-BV_ybq7v.js:20621` | 186.3 | 5.8% |
| 10 | `renderFrame @ index-BV_ybq7v.js:20498` | 186.0 | 5.8% |

Reading it: of the 4.69 ms JS per frame, about 3.10 ms is `renderFrame`. Native `getParameter` (40 ms over 60 frames) and `getError` (30 ms) are per-frame GL state queries that cost about 1.18 ms per frame together; per-frame diagnostics code (`updateRouteDiagnostics`, `getDiagnostics`, `collectAuraSceneEvidence`, `stableSerialize`) also shows in the tail. three.js 4x MSAA spends 88.6% in the same `readPixels` sync, so the **frame-time gap on this runner is GPU-side work (render targets and passes), not JS**: JS is about 4.7 ms of 53 ms.

### 11c. three.js 4x MSAA first frame, for reference

| # | Function @ file:line (unminified build) | Self ms | % of busy |
| --- | --- | --- | --- |
| 1 | `(program) @ native:0` | 43.3 | 29.5% |
| 2 | `finish @ index-uy7CadsF.js:45` | 29.6 | 20.2% |
| 3 | `onFirstUse @ index-uy7CadsF.js:18248` | 15.8 | 10.8% |
| 4 | `getContext @ index-uy7CadsF.js:23792` | 7.6 | 5.2% |
| 5 | `(garbage collector) @ native:0` | 6.7 | 4.6% |
| 6 | `runBench @ index-uy7CadsF.js:32` | 5.9 | 4.1% |
| 7 | `getExtension @ index-uy7CadsF.js:16531` | 5.1 | 3.5% |
| 8 | `uploadTexture @ index-uy7CadsF.js:21071` | 2.6 | 1.8% |

### 11d. PBR viewer, Aura3D (same method)

First frame 3,384 ms under the profiler (2,501 ms after the last script); top costs: `finish` 1,293 ms, `compileShader` 284 ms, `floatToHalf` 255 ms, `(program)` 150 ms, `finalizeLinkedProgram` 72 ms, `halfToFloat` 70 ms. Steady: 455 ms wall per frame, 8.8 ms JS, 98.2% in `readPixels`. Raw: `aux-profile-pbr-viewer-aura.json`.

## 12. Forest stall hunt (WP-0.4): Aura3D 4.3.7, 10-minute cap

Run: unminified forest build, GL call timing hook (logs every call over 500 ms, per-method totals every 10 s), V8 profiler (2 ms interval), wall-clock cap 600 s. Raw: `aux-forest-stall-aura.json`.

**Result: no stall at 4.3.7.** The page produced its first frame at 13.7 s and then completed 30 steady frames (cap not reached; not capped), whole run 200 s. The 55-minute failure of 4.1.2 does not reproduce.

| Quantity | Value |
| --- | --- |
| First frame ready | 13.7 s (1 slow `readPixels` of 12.2 s; the first frame also compiles 9 programs and builds the IBL probe) |
| Steady frame, median of 30 | 6.18 s total, 27.5 ms of it JS |
| Draw calls / triangles per frame | 851 draws and 4,608,003 triangles (harness rows 8a, 8b); three.js 7 draws and 1,168,002 triangles; 2,304,064 instances submitted over 32 frames |
| Share of profiled time in `readPixels` | 98.6% (197.4 s of 200.2 s busy) |
| Next largest self cost | `floatToHalf @ Rgb9e5Cube-CWgp9jN0.js:172` 324 ms (0.2%) |

GL call time by method (cumulative over the run):

| GL method | Calls | Total ms | Max ms |
| --- | --- | --- | --- |
| `readPixels` | 31 | 197,448 | 12,182 |
| `getShaderParameter` | 18 | 90 | 32 |
| `drawElementsInstanced` | 27,168 | 29 | 1 |
| `getError` | 65 | 26 | 6 |
| `getProgramParameter` | 25 | 15 | 3 |
| `texImage2D` | 42 | 15 | 3 |
| `bufferSubData` | 200 | 13 | 4 |
| `flush` | 32 | 2 | 0 |

**Cause classification: fill rate / vertex throughput of the software rasteriser, not shader compile, not instance upload, not JS.** Shader compile and link total about 105 ms; `bufferData`/`bufferSubData` total 13 ms; the 27,168 instanced draw calls cost 29 ms to submit; JS inside the frame is 28 ms. The time is the GPU work that `readPixels` waits for: Aura3D submits about 3.9x the triangles of three.js in 851 instanced draws per frame (three.js: 7) into 4x multisampled RGBA16F targets, and SwiftShader rasterises all of it on 2 CPUs. Inference, not measured: 851 draws is roughly 425 per pass for 2 passes, which suggests the instance set is split into many small batches or drawn without culling; lane L-P2 should confirm in `packages/engine/src/agent-api/nodes/instances.ts` and the rendering instance path before changing anything.

The same forest in the timing group (`forest`, 1 cold load, 12 measured frames): Aura3D first frame 16.4 s, 7.32 s per frame, wall 333 s; three.js 1.7 s first frame, 1.23 s per frame; three.js 4x MSAA 1.8 s, 1.43 s per frame. Aura3D / three.js 4x MSAA: 5.1x per frame, 8.9x to first frame.

## 13. Addendum: targets re-baselined at 4.3.7 (history above is not edited)

Per the PRD, targets are not moved. The baseline column is replaced by the 4.3.7 measurement; "reachable under software GL?" is a judgement from the profiles in section 11, not a measurement.

| # | Target | 4.1.2 baseline | 4.3.7 baseline | Target (unchanged) | Reachable under software GL? |
| --- | --- | --- | --- | --- | --- |
| P1 | Steady frame, one cube | 623.2 ms | 42.9 ms | <= 5 ms | Plausible: three.js 4x MSAA is 1.5 ms; cost is 93.3% GPU sync on two multisampled HDR targets, so the `auto` direct path is the lever |
| P2 | CPU in `frame()`, one cube | 3.50 ms | 3.00 ms (4.69 ms in the profile run) | <= 0.5 ms | Yes, in principle: it is JS; per-frame GL state queries and diagnostics are visible in section 11b |
| P3 | Time to first frame, one cube | 3,269 ms | 954 ms | <= 500 ms | Needs the default IBL probe off the critical path (section 11a) and fewer scripts; 883 ms of 1,264 ms is after the last script arrives |
| P4 | Draw calls, cube / PBR | 2 / 33 | 2 / 33 | 1 / <= 25 | Yes (counts are not renderer-bound) |
| P5 | Requests on first load, cube | 26 | 31 | <= 8 | Companion PRD (bundle) |
| P6 | Forest completes <= 5 min and <= 3x three.js 4x MSAA | did not finish in 55 min | completes; first frame 16.4 s; 5.1x per frame; measurement wall 333 s | unchanged | Per-frame ratio is mostly triangle count (3.9x) and draw splitting; reducing both could reach 3x |
| P7 | Real GPU, five scenes | not measured | not measured | <= three.js 4x MSAA | Owner-run receipts; software numbers say nothing about it |
| Q1 | Exposure, skinned character mean luma | 144 vs 192.5 | 144.0 / 192.5 | within 10% | Yes; note the direction: **Aura3D is brighter**, three.js darker |
| Q2 | Console warnings on bench scenes | >= 2 kinds | 1 kind (`WEIGHTS_0 normalized`) | 0 | Yes |
| D1 | Hello cube lines / tokens | 18 / 278 | 18 / 278 | <= 12 / <= 210 | n/a (source) |
| D2 | Shader water lines / tokens | 87 / 1,554 | 87 / 1,554 | <= 80 / <= 1,386 | n/a (source) |
| D3 | Silent no-ops | 2 found | not measured here | 0 | lane L-S |
| C1 | Partial/experimental rows | 12 | not measured here | each shipped with receipt or removed | lane L-K |
| M1 | Codemod rows approx / none / pending | 174 / 47 / 3 | not measured here | <= 100 / <= 20 / 0 | lane L-M |
| T1 | Tally, three.js better | 76 of 124 | 91 of 125 (5 unmeasurable) | <= 30 | Not a WP-0 target; many rows are GPU-bound ratios that only real-GPU runs can settle |

### Method notes for the lanes that consume this

- Harness: `tests/browser/bench-vs-threejs.spec.ts` groups A to F as before (3 cold loads, 10 warm-up + 60 measured frames, 640x360, DPR 1, ACES, software WebGL2; forest reduced plan: 1 load, 12 frames), plus group G (CPU profiles) and group H (forest stall hunt). `@aura3d/engine` and `@aura3d/assets` come from the registry at `BENCH_AURA_VERSION` (default 4.3.7); full game (`fullgame-compare.spec.ts`) defaults to 4.3.7 too.
- Results keys: the Aura3D arm is `aura` (the legacy key the gate accepts); three.js arms are `three` and `three-msaa`; console messages are `{ type, text }`; every result carries `wallMs` (whole measurement for that app) except group A, which ran before that field was added (A has no forest).
- Equal antialiasing: Aura3D production profile renders into 4x multisampled targets; the comparison that matters is against `three-msaa` (sections 7d, 7e).
- Single run per group. Run-to-run spread was not re-measured at 4.3.7 (4.1.2 had a second run in section 10 of its report).
- Frames for every captured scene are in `evidence/vs-threejs/4.3.7/frames/`.

## 14. Full game (coin dash, `tests/browser/fullgame-compare.spec.ts`) at Aura3D 4.3.7

Stock `vite build` and type-check pass for both builds; all 28 behavioural checks (14 per build: non-black frame, touch controls, pause, audio cues, restart, seeded replay hash, resize/DPR, teardown) pass, 0 fail. Raw: `4.3.7/full-game-results.json`; method: `tools/bench-vs-threejs/full-game/README.md`.

| Metric | three.js | Aura3D 4.3.7 | Verdict |
| --- | --- | --- | --- |
| Authored lines (all `src/*`) | 373 | 271 | Aura3D better |
| Tokens (o200k_base proxy) | 3,529 | 2,622 | Aura3D better |
| Production JS raw / gzip | 516,898 B / 131,094 B | 3,596,528 B / 1,129,133 B | three.js better |

These are single-run, software-GL, one-author numbers; the speed rows of the full game are not measured by this spec.

## Tally of numeric rows

Aura3D better: 19; three.js better: 91; tie: 10; unmeasurable: 5. (Rows counted: every per-scene row in sections 1 to 9.)

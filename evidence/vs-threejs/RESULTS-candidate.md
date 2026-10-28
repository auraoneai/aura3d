# Candidate benchmark: Aura3D workspace build vs three.js 0.185.1

Run 2026-10-28 on `beat3js/bench2` (merge of `beat3js/integration` at `507d8afbe` plus the bench changes in `bcf616878`). Remote runner only (Azure ACR task, run prefix `cand-b2-1`, groups a to e and the full game), **software WebGL2 (SwiftShader), not a GPU**. Every speed figure below is a software-rasteriser figure. Real-GPU rows (P7) have no data.

## What was built and how it differs from a release run

- The Aura3D arms are built from the **workspace sources** with Vite aliases from `vite.aliases.generated.ts` (`shared/aura-vite-workspace.ts`), not from the published package. A release run (WP-I.4) must repeat this against the published 4.5.0 tarballs.
- Bundle size, number of JS chunks and therefore **requests on first load (P5) and time to first frame (P3) are not comparable** to a published build: the source build emits 33 requests for the cube and, for the full game, 47 JS files / 7.7 MB raw against three.js's one file / 0.52 MB. P3 and P5 here are build-mode-inflated. They are recorded as measured, not excused.
- Two Aura3D arms: `aura-auto` (the scene source as written, default `quality: "auto"`) and `aura-production` (same source with `quality: "production"` injected at build time). The Aura3D scene sources no longer pin `renderer: { qualityProfile: "production" }`. The gate reads `aura-auto`.
- three.js arms: `three` (no antialiasing) and `three-msaa` (4x MSAA, the equal-work arm for Aura3D's multisampled targets, group e).
- Method otherwise as in `tools/bench-vs-threejs/METHODOLOGY.md`: 640x360, dpr 1, ACES, 3 cold loads, 10 warm-up and 60 measured frames (forest keeps its reduced plan). One run; no variance estimate.
- The three-independent-author runs (`shared/authors/`) were **not run**: they spend paid LLM calls and need the owner's go-ahead. The runner dry-run passes. Source-size rows use the single hand-tuned sources.

## Steady frame, CPU, first frame, draws (medians, software WebGL2)

| Scene | Arm | Frame ms | CPU ms | First frame ms | Draws | Requests | Console |
| --- | --- | --- | --- | --- | --- | --- | --- |
| one cube | three | 0.7 | 0.10 | 93 | 1 | 2 | 4 |
| one cube | three-msaa | 1.4 | 0.10 | 101 | 1 | 2 | 4 |
| one cube | aura-auto | 5.6 | 1.10 | 696 | 1 | 33 | 0 |
| one cube | aura-production | 43.0 | 2.60 | 776 | 2 | 33 | 0 |
| PBR viewer | three-msaa | 322.3 | 0.70 | 6,220 | 25 | 5 | 1 |
| PBR viewer | aura-auto | **632.9** | 5.30 | 3,150 | 24 | 37 | 0 |
| PBR viewer | aura-production | 407.0 | 5.30 | 2,415 | 33 | 37 | 0 |
| skinned character | three-msaa | 71.1 | 0.50 | 622 | 5 | 5 | 0 |
| skinned character | aura-auto | 255.1 | 4.50 | 2,059 | 6 | 38 | 0 |
| game loop | three-msaa | 26.5 | 0.40 | 202 | 19 | 2 | 0 |
| game loop | aura-auto | 167.2 | 5.10 | 1,259 | 38 | 33 | 0 |
| shader water | three-msaa | 129.3 | 0.30 | 383 | 4 | 2 | 0 |
| shader water | aura-auto | 107.9 | 2.50 | 1,121 | 4 | 33 | 0 |
| forest 10k | three-msaa | 1,539.1 | 0.60 | 1,818 | 7 | 2 | 0 |
| forest 10k | aura-auto | 4,598.5 | 18.7 | 10,126 | 569 | 33 | 0 |

Against 4.3.7 (`RESULTS-4.3.7.md`, production profile): cube 42.9 to 5.6 ms, first frame 954 to 696 ms, draws 2 to 1; forest 7,319 to 4,599 ms per frame (851 to 569 draws), first frame 16.4 to 10.1 s; shader water 113.7 to 107.9 ms; skinned character 250.9 to 255.1 ms (no change).

## Findings that need action

1. **PBR viewer is slower on `auto` than on `production` (633 ms vs 407 ms)** while drawing fewer calls (24 vs 33). The auto path takes the fused-bloom pipeline (2-D blur for mips 1 to 4); on a software rasteriser the extra fetches per texel cost more than the saved draws. P4 passes on draw count but the scene is 55% slower in frame time than the old path and 2.0x three-msaa. Whether the fusion is slower on a real GPU is not measured. Until it is, the fused 2-D blur should not ship as the default for scenes with bloom, or the fusion should be restricted to the changes that remove draws without adding fill.
2. **Exposure still differs on three scenes.** Mean luma (frame A), three.js vs Aura3D: cube 2.9 vs 12.8 (unchanged from 4.3.7), PBR viewer 55.0 vs 91.1 (unchanged), forest 148.2 vs 119.6 (4.3.7: 148.2 vs 155.6). Skinned character is now 144.0 vs 136.2 (4.3.7: 144.0 vs 192.5), shader water 175.2 vs 175.2, game loop 59.6 vs 54.4 (4.3.7: 59.6 vs 94.4). Q1 as written (skinned character within 10%) passes, but the cube and PBR viewer gaps show the ambient-only and environment-lit cases are not calibrated; the forest moved from +5% to -19%.
3. **P1 and P2 for the cube remain above target** (5.6 ms vs 5; CPU 1.1 ms vs 0.5). The cube frame still waits on `readPixels` in the harness.
4. **Skinned character** is 3.6x three-msaa and **game loop** 6.3x; unchanged in kind from 4.3.7.

## Source size (static metrics, o200k_base proxy tokenizer)

| Scene | three.js lines / tokens | Aura3D lines / tokens |
| --- | --- | --- |
| one cube | 15 / 210 | 12 / 208 |
| PBR viewer | 49 / 740 | 23 / 452 |
| forest 10k | 71 / 1,213 | 48 / 986 |
| skinned character | 62 / 846 | 44 / 768 |
| game loop | 82 / 1,178 | 60 / 1,112 |
| shader water | 86 / 1,386 | 66 / 1,211 |

D1 and D2 were reached by dropping options equal to the defaults (`resize: false`, `pixelRatio: 1`, `near`, `name`, the explicit renderer profile, `output.toneMapping`) and by replacing the hand-built water grid with `primitives.plane` and `params: { widthSegments, heightSegments }`. The water vertex shader now derives its wave phase from the world position, so the displacement is identical whether the primitive's size is baked into the geometry or applied by the transform. Water triangle count is 22,530 (three.js 19,394) and mean luma matches to 0.02.

## Full game

All 16 scripted checks pass for both builds (Aura3D from workspace sources, type-check skipped in candidate mode because there is no published `.d.ts`), and the seeded replay hashes agree at 600 and 1,800 steps. Bundle sizes are source-build sizes and are not reported as release sizes.

## Gate (`node tools/bench-vs-threejs/gate.mjs --results candidate/results.json --static candidate/static-metrics.json --extra '{"silentNoOps":0}'`, Aura3D arm `aura-auto`)

| Target | Status | Measured | Target value |
| --- | --- | --- | --- |
| P1 steady frame, cube | FAIL | 5.6 ms | <= 5 ms |
| P2 CPU in frame(), cube | FAIL | 1.1 ms | <= 0.5 ms |
| P3 first frame, cube | FAIL | 696 ms (source build) | <= 500 ms |
| P4 draws, cube / PBR viewer | PASS | 1 / 24 | 1 / <= 25 |
| P5 requests on first load | FAIL | 33 (source build) | <= 8 |
| P6 forest 10k | PASS | 212 s, 2.99x three-msaa | <= 5 min and <= 3x |
| P7 real GPU | NO-DATA | no real-GPU results | <= three.js on every scene |
| Q1 exposure, skinned character | PASS | 144 vs 136.2 (5.4%) | within 10% |
| Q2 console warnings | PASS | 0 | 0 |
| D1 hello cube source | PASS | 12 / 208 | <= 12 / <= 210 |
| D2 shader water source | PASS | 66 / 1,211 | <= 80 / <= 1,386 |
| D3 silent no-ops | PASS | 0 | 0 |
| C1 partial / experimental rows | FAIL | 10 of 10 unresolved | 0 (the docs lane relabels the rows) |
| M1 codemod approximate / none / pending | FAIL | 164 / 47 / 0 | <= 100 / <= 20 / 0 |
| T1 three.js better rows | FAIL | 86 of 125 (Aura3D better 23, tie 11, unmeasurable 5) | <= 30 |

**T1 fails by a wide margin, so no "beats three.js" wording ships.** The P6 pass is fragile: 2.99x sits on the 3x line from one run. P1, P2, P3 and P5 are not met; P3 and P5 need a published-package run to settle. P7 stays NO-DATA until the owner-run real-GPU receipts exist, so every speed statement keeps the software WebGL2 qualifier.

Raw data: `evidence/vs-threejs/candidate/results.json`, `static-metrics.json`, `full-game-results.json`, `gate.json`, `gate.txt`, frames in `frames/` and `fg-frames/`.

# Failing-rows analysis: the 86 "three.js better" rows in the candidate run

Source: `evidence/vs-threejs/candidate/results.json` + `static-metrics.json`, scored with `tools/bench-vs-threejs/harness/tally.mjs` (`computeTally`, Aura3D arm `aura-auto`). Tally: three.js better 86, Aura3D better 23, tie 11, unmeasurable 5, 125 numeric rows. T1 target is three.js better <= 30, so 56 rows have to flip or tie.

All speed figures are **software WebGL2 (SwiftShader), one run, workspace-source build**, not a GPU and not a published package. Grouping below is by inspection of the row values and the profiles already in `RESULTS-4.3.7.md`, `evidence/forest-10k/README.md` and `RESULTS-candidate.md`; no new measurement was taken for this file. "Artefact" means the figure is dominated by the measurement setup and cannot be judged until the setup changes; it does not mean the row is acceptable.

## Summary

| # | Group | Rows | Owner | Software-GL / build-mode artefact? | Real engineering? |
| --- | --- | --- | --- | --- | --- |
| G1 | Bundle size and requests (sections 4a to 4d, 5a to 5c) | 42 | Companion PRD `docs/prds/agent-first-authoring` Track C (WP-C1 to C6) | Partly: the candidate is a source build (33 requests for the cube, 47 JS files for the full game). A published-package run settles the true gap. | Yes: the engine entry still pulls most lanes in; three.js is 0.5 to 0.65 MB raw, Aura3D 7.6 MB raw in this build. |
| G2 | Time to first frame (6 ttff, 7e) | 10 | Companion WP-C5 for init work; this PRD WP-8 for the published re-run | Forest (2 rows, 10.1 s first frame) is raster time; the other 8 are inflated by the unbundled module graph. | Yes: default lighting probe build (about 454 ms in 4.3.7, partly rewritten), context and program setup. |
| G3 | Steady frame time: median, p95, equal AA (7a, 7b, 7d) | 17 | This PRD WP-2, WP-3, WP-7 | Largely: about 65 to 93% of a frame is the `readPixels` wait on a software rasteriser, which is fill-rate bound. Needs real-GPU receipts (owner step) to judge. | Some: the fused 2-D bloom blur made the PBR viewer slower on `auto` (633 ms vs 407 ms `production`); skinned character 3.6x and game loop 6.3x three-msaa; forest camera pass is fragment-bound. |
| G4 | CPU time inside `frame()` (7c) | 6 | This PRD WP-5, WP-7 | No: JS and GL submission cost is real on any machine (cube 1.1 ms vs 0.1; forest 18.7 ms vs 0.8). | Yes. |
| G5 | Draws, triangles, programs (8a, 8b, 8c) | 11 | This PRD WP-9 | No. | Yes: forest 569 draws vs 7; game loop 38 vs 19; programs 2 to 20 vs 1 to 14. |
| | **Total** | **86** | | | |

Rows already owned by the companion PRD: 42 (G1) outright, plus the init share of 8 in G2. Rows that depend on real-GPU receipts before they can be judged at all: most of G3 (17) and the forest rows of G2. Rows that are real engineering regardless of GPU: G4 (6), G5 (11), and the non-fill share of G3.

## Row detail (aura-auto vs three.js; lower is better)

### G1: bundle and requests (42)

| Section | Rows (scene: three / Aura3D) |
| --- | --- |
| 4a raw bytes (6) | baseline 507,623 / 7,608,494; pbr-viewer 655,083 / 7,611,364; forest 518,270 / 7,610,272; skinned 623,430 / 7,611,892; game-loop 515,280 / 7,615,017; shader-water 520,379 / 7,611,413 |
| 4b gzip (6) | baseline 127,808 / 2,448,358 and the five scenes in the same range |
| 4c brotli (6) | baseline 105,341 / 1,947,848 and the five scenes in the same range |
| 4d largest chunk (6) | three 507,623 to 655,083 / Aura3D 2,855,116 for all six |
| 5a requests (6) | 2 or 5 / 33 to 38 |
| 5b JS bytes (6) | 0.5 to 0.66 MB / about 6.06 to 6.13 MB |
| 5c total bytes (6) | 0.5 to 3.4 MB / 6.06 to 10.45 MB |

Aura3D's JS size is nearly constant across scenes (7.608 to 7.615 MB raw), which says the engine entry registers everything regardless of what the scene uses; that is the companion PRD's hypothesis (WP-C1 composition report, WP-C2 to C4). Nothing in this PRD touches it.

### G2: first frame (10)

6 ttff: cube 92.7 / 696 ms; forest 1,461.5 / 10,125.5; skinned 548.3 / 2,058.5; game loop 172.7 / 1,259.1; shader water 263.8 / 1,120.9 (five rows; pbr-viewer is not a three.js-better row here). 7e (equal AA): cube 100.9 / 696; forest 1,817.8 / 10,125.5; skinned 621.7 / 2,058.5; game loop 202.2 / 1,259.1; shader water 382.9 / 1,120.9.

### G3: frame time (17)

| Scene | 7a median | 7b p95 | 7d equal AA |
| --- | --- | --- | --- |
| cube | 0.7 / 5.6 | 1.2 / 6.8 | 1.4 / 5.6 |
| PBR viewer | 232.5 / 632.9 | 311.8 / 877.7 | 322.3 / 632.9 |
| forest | 1,106.2 / 4,598.5 | 1,444.7 / 5,364 | 1,539.1 / 4,598.5 |
| skinned character | 47.5 / 255.1 | 50.5 / 327.3 | 71.1 / 255.1 |
| game loop | 19.9 / 167.2 | 23.9 / 174.9 | 26.5 / 167.2 |
| shader water | 48 / 107.9 | 51.8 / 126.6 | not a three.js-better row |

Aura3D wins shader water against three-msaa (129.3 vs 107.9 ms), so the same scene flips depending on the antialiasing arm; this is why the equal-AA column matters.

### G4: CPU in frame() (6)

cube 0.1 / 1.1; PBR 0.7 / 5.3; forest 0.8 / 18.7; skinned 0.4 / 4.5; game loop 0.3 / 5.1; shader water 0.3 / 2.5 (ms).

### G5: draws, triangles, programs (11)

8a draws: forest 7 / 569; skinned 5 / 6; game loop 19 / 38. 8b triangles: forest 1,168,002 / 1,400,659; game loop 1,050 / 6,195; shader water 19,394 / 22,530. 8c programs: cube 1 / 2; PBR 14 / 20; forest 7 / 9; skinned 3 / 8; game loop 2 / 6.

## What would flip rows

- G1 (42) is the only group big enough to reach T1 on its own: with G1 at parity, three.js better drops to 44, still above 30. T1 therefore needs G1 **and** at least 14 further rows from G2 to G5, or the real-GPU column changing G3.
- The cheapest honest flips in this PRD are G4 (6) and G5 (11), then the PBR viewer and exposure items inside G3.
- No claim of any kind follows from this file. The gate result stays FAIL on T1.

## Items that are not rows but block judging them

- The three-independent-author LLM batch was not run (paid LLM calls need the owner's go-ahead). Source-size rows use single hand-tuned sources, so D1 and D2 are met by tuning, not by independent authors.
- Real-GPU (P7) has no data; run `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac (owner step).
- Exposure gaps remain on three scenes (cube luma 12.8 vs 2.9, PBR viewer 91.1 vs 55.0, forest 119.6 vs 148.2); Q1 passes on the skinned character only.
- `quality: "auto"` direct-path silhouettes differ from the HDR path by up to 48/255 on 0.1 to 0.3% of pixels (canvas MSAA resolves in display space, as three.js does); recorded in `evidence/vs-threejs/4.3.7/direct-path-parity.json`.

# Engine Parity Round 1 Result

Round: `1`
Date: 2026-05-29
Commit: `1fd9e2348efd910b0673e10a9173a543b1f9685d`
Runner: Codex
Machine: M4 Max / macOS / Node 22.22.0 / Playwright Chromium per `benchmark/runner/README.md`
Scorer: Claude Code
Scorer neutrality statement: opposite-vendor model scoring hand-authored engine parity outputs
Scorer signature: `benchmark/scoring/round-1-scores/engine-by-claude.json`
User signature: `gchahal1982`, 2026-05-29. I, gchahal1982, confirm that Round 1 failed as recorded in benchmark/results/round-1.md, benchmark/results/round-1-engine.md, and benchmark/results/round-1-decision.md. I approve committing these results and moving to Phase D fixes. Do not ship Aura3D as a proven Three.js competitor from this round.

## Summary

| Scene | Visual parity | Aura3D p50 FPS | Three.js p50 FPS | Aura3D heap | Three.js heap | Aura3D gzip | Three.js gzip | Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| engine-01-material-grid | 4 | 3.86 | 1.03 | 10000000 | 10000000 | 202716 | 121091 | no |
| engine-02-city-block | 3 | 4.98 | 4.60 | 10000000 | 10000000 | 202857 | 120049 | no |
| engine-03-particles-vfx | 3 | 1.21 | 2.14 | 14300000 | 10000000 | 203813 | 121241 | no |
| engine-04-physics-ramp | 5 | 8.00 | 7.50 | 10600000 | 10000000 | 128639 | 120034 | no |
| engine-05-sneaker-product | 4 | 2.11 | 2.55 | 19300000 | 27600000 | 202799 | 147340 | no |

## Per-Scene Detail

### engine-01-material-grid

Aura3D source path: `benchmark/runs/round-1/engine/engine-01-material-grid/aura3d/source`
Three.js source path: `benchmark/runs/round-1/engine/engine-01-material-grid/threejs/source`
Aura3D screenshot: `benchmark/runs/round-1/engine/engine-01-material-grid/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-1/engine/engine-01-material-grid/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| First usable render | 6038 | 7333 | Recorded raw |
| p50 FPS | 3.8580246913580276 | 1.0255358424776961 | p50Fps>=30 (Aura 3.86, Three 1.03) |
| p95 frame time | 342.5 | 1507.7999999999993 | Recorded raw |
| Draw calls | 6 | 11 | Recorded raw |
| Triangle count | null | 35736 | Unavailable where null |
| JS heap peak | 10000000 | 10000000 | pass |
| GPU memory | null | null | unavailable |
| Bundle gzip bytes | 202716 | 121091 | pass |
| Source LOC | 52 | 60 | Recorded raw |
| Visual parity | 4 | n/a | pass |

Visual parity notes: All five spheres plus shelf present with matching metal/rubber/emissive-pink/clearcoat-tan materials. Two real differences: Aura frames the row nearly head-on while Three.js uses a 3/4 angled view (Aura orbit camera honors distance:8.5, pulling closer), and the glass sphere reads opaque white in Aura vs genuinely transmissive in Three.js (Aura uses pbr roughness 0.02 with no transmission). Close parity overall.

Failed thresholds: p50Fps>=30 (Aura 3.86, Three 1.03)

### engine-02-city-block

Aura3D source path: `benchmark/runs/round-1/engine/engine-02-city-block/aura3d/source`
Three.js source path: `benchmark/runs/round-1/engine/engine-02-city-block/threejs/source`
Aura3D screenshot: `benchmark/runs/round-1/engine/engine-02-city-block/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-1/engine/engine-02-city-block/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| First usable render | 5735 | 6189 | Recorded raw |
| p50 FPS | 4.980079681274874 | 4.6040515653775165 | p50Fps>=30 (Aura 4.98) |
| p95 frame time | 300 | 383.39999999999964 | Recorded raw |
| Draw calls | 21 | 199 | Recorded raw |
| Triangle count | null | 668 | Unavailable where null |
| JS heap peak | 10000000 | 10000000 | pass |
| GPU memory | null | null | unavailable |
| Bundle gzip bytes | 202857 | 120049 | pass |
| Source LOC | 67 | 55 | Recorded raw |
| Visual parity | 3 | n/a | visualParity>=4 (3) |

Visual parity notes: Both render a cluster of varied-height building boxes against a sky-blue background, but materially different: Aura is missing the lit window planes and street-grid lines that Three.js draws (the Aura source never authors them), shows no visible ground, and the camera sits much lower/closer so buildings are clipped top and bottom. Recognizable as the same scene concept but notably divergent.

Failed thresholds: p50Fps>=30 (Aura 4.98); visualParity>=4 (3)

### engine-03-particles-vfx

Aura3D source path: `benchmark/runs/round-1/engine/engine-03-particles-vfx/aura3d/source`
Three.js source path: `benchmark/runs/round-1/engine/engine-03-particles-vfx/threejs/source`
Aura3D screenshot: `benchmark/runs/round-1/engine/engine-03-particles-vfx/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-1/engine/engine-03-particles-vfx/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| First usable render | 5729 | 6285 | Recorded raw |
| p50 FPS | 1.21270919233568 | 2.1427040925648133 | p50Fps>=30 (Aura 1.21); auraFpsGap<=20% (Aura 1.21 vs Three 2.14, ~43% slower) |
| p95 frame time | 1016.2999999999993 | 716.7999999999993 | Recorded raw |
| Draw calls | 91 | 452 | Recorded raw |
| Triangle count | null | 75698 | Unavailable where null |
| JS heap peak | 14300000 | 10000000 | heapGap<=25% (Aura 14.3MB vs 10MB, +43%) |
| GPU memory | null | null | unavailable |
| Bundle gzip bytes | 203813 | 121241 | pass |
| Source LOC | 129 | 57 | Recorded raw |
| Visual parity | 3 | n/a | visualParity>=4 (3) |

Visual parity notes: Both show a glowing colored-particle burst on a dark floor, and Aura's bloom looks good, but density and structure diverge: Aura emits ~80 spheres in a sparse scatter with no emitter cone, while Three.js shows ~450 particles in a dense rotating swirl around a visible cone emitter. Recognizable but substantially thinner and structurally different.

Failed thresholds: p50Fps>=30 (Aura 1.21); auraFpsGap<=20% (Aura 1.21 vs Three 2.14, ~43% slower); heapGap<=25% (Aura 14.3MB vs 10MB, +43%); visualParity>=4 (3)

### engine-04-physics-ramp

Aura3D source path: `benchmark/runs/round-1/engine/engine-04-physics-ramp/aura3d/source`
Three.js source path: `benchmark/runs/round-1/engine/engine-04-physics-ramp/threejs/source`
Aura3D screenshot: `benchmark/runs/round-1/engine/engine-04-physics-ramp/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-1/engine/engine-04-physics-ramp/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| First usable render | 6112 | 6022 | Recorded raw |
| p50 FPS | 8 | 7.501875468867258 | p50Fps>=30 (Aura 8, Three 7.5) |
| p95 frame time | 266.3000000000011 | 266.7000000000007 | Recorded raw |
| Draw calls | 61 | 62 | Recorded raw |
| Triangle count | 732 | 734 | Unavailable where null |
| JS heap peak | 10600000 | 10000000 | pass |
| GPU memory | null | null | unavailable |
| Bundle gzip bytes | 128639 | 120034 | pass |
| Source LOC | 74 | 55 | Recorded raw |
| Visual parity | 5 | n/a | pass |

Visual parity notes: Strong parity, Aura equal-or-better. Same blue ramp (matching #486a91) over a dark floor with ~60 HSL-tinted cubes. Aura uses real @aura3d/engine physics so cubes settle into a believable pile on the ramp, whereas Three.js fakes a drift animation leaving cubes floating; the Aura result is the more physically convincing of the two. Triangle/draw-call counts nearly identical.

Failed thresholds: p50Fps>=30 (Aura 8, Three 7.5)

### engine-05-sneaker-product

Aura3D source path: `benchmark/runs/round-1/engine/engine-05-sneaker-product/aura3d/source`
Three.js source path: `benchmark/runs/round-1/engine/engine-05-sneaker-product/threejs/source`
Aura3D screenshot: `benchmark/runs/round-1/engine/engine-05-sneaker-product/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-1/engine/engine-05-sneaker-product/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| First usable render | 5517 | 5928 | Recorded raw |
| p50 FPS | 2.1052631578947367 | 2.5536261491317647 | p50Fps>=30 (Aura 2.11, Three 2.55) |
| p95 frame time | 791.6000000000004 | 592.2999999999993 | Recorded raw |
| Draw calls | 2 | 2 | Recorded raw |
| Triangle count | null | 23084 | Unavailable where null |
| JS heap peak | 19300000 | 27600000 | pass |
| GPU memory | null | null | unavailable |
| Bundle gzip bytes | 202799 | 147340 | pass |
| Source LOC | 49 | 60 | Recorded raw |
| Visual parity | 4 | n/a | pass |

Visual parity notes: Same blue knit sneaker model with white 'FOAM' sole on a pale circular plinth, materials and lighting match well. Differences are framing/placement: Aura presents a larger side profile hovering slightly above a thin disc plinth, while Three.js seats the shoe on a thicker cylinder in a smaller 3/4 view. Clearly the same product shot with minor positioning gap.

Failed thresholds: p50Fps>=30 (Aura 2.11, Three 2.55)

## Final Engine Result

Engine parity pass: no

## FPS Instrumentation Caveat

The p50 FPS threshold is recorded as failed because the frozen benchmark
requires it, but the numbers are not credible as engine-quality evidence in
this run. Both Aura3D and raw Three.js measured between 1 and 8 FPS on the same
M4 Max capture machine. Raw Three.js should not be running at 1 FPS on these
scenes, so this points to benchmark harness or browser sampling noise rather
than a trustworthy renderer-performance result.

This caveat does not change the Round 1 decision. Engine parity still fails
when FPS is discounted because only 3 of 5 scenes reached visual parity >= 4;
the required floor is 4 of 5. Before Round 2, either fix the FPS harness and
prove sane control measurements, or use a `PRD-AMENDMENT` commit to suspend or
replace the FPS criterion for the next full round.

Failed thresholds:

- Visual parity was at least 4 on only 3 of 5 scenes; required at least 4 of 5.
- p50 FPS was below 30 on every scene for both Aura3D and raw Three.js in this capture environment; see the instrumentation caveat above.
- Scene 03 failed Aura-specific FPS and heap-gap thresholds.

Required library work:

- Improve city-block scene fidelity: windows, roads, ground visibility, and camera framing.
- Improve particles/VFX density and emitter structure in Aura3D.
- Investigate why the engine capture produced universally low FPS before relying on this measurement as a product performance claim.
- Fix sneaker product framing so Aura3D seats the asset correctly on the plinth.

# Benchmark Round 12 Engine Result

Date: 2026-05-31
Commit SHA: ade8a51a3affcccb2788be54ef8698728d5c46d7
Runner: `benchmark/runner/setup-engine.mjs --round=round-12` and `benchmark/runner/capture-engine-batch.mjs --round=round-12`
Machine: local benchmark machine, Playwright Chromium, 1440x960 viewport
Scorer: Claude Code
Scorer neutrality statement: opposite-vendor model scoring hand-authored engine parity outputs
Scorer signature: Claude Code, 2026-05-31
User signature: `gchahal1982`, active-goal authorization to execute all tasks in `REMAINING.md` without additional permission.

## Decision

Round 12 engine benchmark passed. Route health, FPS instrumentation, Aura3D FPS floor, comparative FPS, heap, gzip, and aggregate visual parity thresholds all pass.

Overall pass: true

## Aggregate Thresholds

| Threshold | Result | Pass |
|---|---:|---|
| Route health passes for both engines in all scenes | 5/5 scenes | yes |
| FPS instrumentation passes for both engines in all scenes | 5/5 scenes | yes |
| Aura3D p50 FPS >= 30 in every scene | 5/5 scenes | yes |
| Aura3D p50 FPS no worse than 20% below Three.js in at least 4/5 scenes | 4/5 scenes | yes |
| Aura3D p50 FPS no worse than 35% below Three.js in any scene | 5/5 scenes | yes |
| Aura3D JS heap peak no worse than 25% above Three.js in at least 4/5 scenes | 5/5 scenes | yes |
| Aura3D JS heap peak no worse than 50% above Three.js in any scene | 5/5 scenes | yes |
| Aura3D bundle gzip delta <= 250 KB in every scene | 5/5 scenes | yes |
| Visual parity >= 4 in at least 4/5 scenes | 4/5 scenes | yes |

## Scene Results

| Scene | Visual parity | Aura3D p50 FPS | Three.js p50 FPS | FPS gap | Aura heap | Three heap | Aura gzip | Three gzip | Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| engine-01-material-grid | 4 | 120.48 | 100.00 | -20.48% | 10.0 MB | 10.0 MB | 202 KB | 118 KB | pass |
| engine-02-city-block | 5 | 120.48 | 29.15 | -313.25% | 10.0 MB | 10.0 MB | 203 KB | 118 KB | pass |
| engine-03-particles-vfx | 3 | 58.14 | 20.04 | -190.12% | 10.0 MB | 10.0 MB | 212 KB | 118 KB | aggregate-pass-with-below-bar-scene |
| engine-04-physics-ramp | 4 | 40.98 | 58.82 | 30.33% | 10.0 MB | 10.0 MB | 126 KB | 117 KB | pass |
| engine-05-sneaker-product | 4 | 120.48 | 11.98 | -906.02% | 19.3 MB | 18.2 MB | 212 KB | 144 KB | pass |

## Per-Scene Detail

### engine-01-material-grid

Aura3D source path: `benchmark/runs/round-12/engine/engine-01-material-grid/aura3d/source/src/main.ts`
Three.js source path: `benchmark/runs/round-12/engine/engine-01-material-grid/threejs/source/src/main.ts`
Aura3D screenshot: `benchmark/runs/round-12/engine/engine-01-material-grid/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-12/engine/engine-01-material-grid/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| FPS instrumentation | pass | pass | pass |
| First usable render | 580 ms | 597 ms | info |
| p50 FPS | 120.48 | 100.00 | Aura gap -20.48%; floor pass |
| p95 frame time | 10.00 ms | 33.20 ms | info |
| Draw calls | 8 | 6 | gap explained below |
| JS heap peak | 10.0 MB | 10.0 MB | Aura heap delta 0.00% |
| Bundle gzip bytes | 202 KB | 118 KB | delta 85 KB |
| Source LOC | 61 | 65 | info |
| Visual parity | 4 | n/a | passes aggregate visual threshold contribution |

Visual parity notes: Both render the five PBR/emissive sphere swatches (metal, glass, rubber, pink emissive, red clearcoat) on a grey plinth with the white softbox strip. Object set and material identities match; the only difference is camera framing (Aura front-on at [0,2,7.2] vs Three angled at [6,4.2,7]). Aura p50 120fps vs Three 100fps (Aura faster), heap parity (10MB each), bundle delta ~85KB gzip.

Draw-call explanation if over 25% different: Aura3D uses declarative engine/prefab abstractions while the raw Three.js side hand-authors scene geometry for this fixed proof scene. In scenes where Aura3D has fewer draw calls, the gap is favorable. In the sneaker scene, Aura3D adds product-stage lighting/backdrop/reflection cards around the focal model; the absolute count remains low.

Bundle-size justification if Aura3D is more than +250 KB gzip: not needed; the Aura3D gzip delta is under 250 KB for this scene.

### engine-02-city-block

Aura3D source path: `benchmark/runs/round-12/engine/engine-02-city-block/aura3d/source/src/main.ts`
Three.js source path: `benchmark/runs/round-12/engine/engine-02-city-block/threejs/source/src/main.ts`
Aura3D screenshot: `benchmark/runs/round-12/engine/engine-02-city-block/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-12/engine/engine-02-city-block/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| FPS instrumentation | pass | pass | pass |
| First usable render | 978 ms | 739 ms | info |
| p50 FPS | 120.48 | 29.15 | Aura gap -313.25%; floor pass |
| p95 frame time | 10.00 ms | 91.50 ms | info |
| Draw calls | 11 | 103 | gap explained below |
| JS heap peak | 10.0 MB | 10.0 MB | Aura heap delta 0.00% |
| Bundle gzip bytes | 203 KB | 118 KB | delta 84 KB |
| Source LOC | 73 | 74 | info |
| Visual parity | 5 | n/a | passes aggregate visual threshold contribution |

Visual parity notes: Near-identical city block: same 20-building grid with matching color palette, emissive window bands, ground plane, corner street-light poles and glow spheres, and equivalent camera. Aura adds subtle street strips but composition is visually equivalent. Aura p50 120fps vs Three 29fps (Aura far faster), heap parity, bundle delta ~85KB gzip.

Draw-call explanation if over 25% different: Aura3D uses declarative engine/prefab abstractions while the raw Three.js side hand-authors scene geometry for this fixed proof scene. In scenes where Aura3D has fewer draw calls, the gap is favorable. In the sneaker scene, Aura3D adds product-stage lighting/backdrop/reflection cards around the focal model; the absolute count remains low.

Bundle-size justification if Aura3D is more than +250 KB gzip: not needed; the Aura3D gzip delta is under 250 KB for this scene.

### engine-03-particles-vfx

Aura3D source path: `benchmark/runs/round-12/engine/engine-03-particles-vfx/aura3d/source/src/main.ts`
Three.js source path: `benchmark/runs/round-12/engine/engine-03-particles-vfx/threejs/source/src/main.ts`
Aura3D screenshot: `benchmark/runs/round-12/engine/engine-03-particles-vfx/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-12/engine/engine-03-particles-vfx/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| FPS instrumentation | pass | pass | pass |
| First usable render | 8062 ms | 373 ms | info |
| p50 FPS | 58.14 | 20.04 | Aura gap -190.12%; floor pass |
| p95 frame time | 66.10 ms | 101.50 ms | info |
| Draw calls | 18 | 261 | gap explained below |
| JS heap peak | 10.0 MB | 10.0 MB | Aura heap delta 0.00% |
| Bundle gzip bytes | 212 KB | 118 KB | delta 94 KB |
| Source LOC | 54 | 62 | info |
| Visual parity | 3 | n/a | below 4; aggregate still passes at 4/5 |

Visual parity notes: Both are recognizable particle VFX on a dark background, but the composition is materially different: Aura shows a tall upward fountain spray (450 particles) over a glowing emitter disk on a dark floor with bloom/fog, while Three shows a compact flat swirl of colored dots around a cyan cone with no floor. Same intent, materially different result, so parity below the 4 bar. Metrics are healthy (Aura p50 58fps vs Three 20fps, heap parity, bundle delta ~94KB gzip).

Draw-call explanation if over 25% different: Aura3D uses declarative engine/prefab abstractions while the raw Three.js side hand-authors scene geometry for this fixed proof scene. In scenes where Aura3D has fewer draw calls, the gap is favorable. In the sneaker scene, Aura3D adds product-stage lighting/backdrop/reflection cards around the focal model; the absolute count remains low.

Bundle-size justification if Aura3D is more than +250 KB gzip: not needed; the Aura3D gzip delta is under 250 KB for this scene.

### engine-04-physics-ramp

Aura3D source path: `benchmark/runs/round-12/engine/engine-04-physics-ramp/aura3d/source/src/main.ts`
Three.js source path: `benchmark/runs/round-12/engine/engine-04-physics-ramp/threejs/source/src/main.ts`
Aura3D screenshot: `benchmark/runs/round-12/engine/engine-04-physics-ramp/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-12/engine/engine-04-physics-ramp/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| FPS instrumentation | pass | pass | pass |
| First usable render | 907 ms | 562 ms | info |
| p50 FPS | 40.98 | 58.82 | Aura gap 30.33%; floor pass |
| p95 frame time | 57.10 ms | 58.30 ms | info |
| Draw calls | 13 | 29 | gap explained below |
| JS heap peak | 10.0 MB | 10.0 MB | Aura heap delta 0.00% |
| Bundle gzip bytes | 126 KB | 117 KB | delta 8 KB |
| Source LOC | 75 | 60 | info |
| Visual parity | 4 | n/a | passes aggregate visual threshold contribution |

Visual parity notes: Identical blue ramp geometry and camera; both show colored cubes settled against the ramp. Aura (real @aura3d physics solver) shows ~12 cubes stacked in a cascade on the ramp face; Three (scripted fake fall) shows a few cubes scattered at the lower edge. Recognizable and close, with the cube distribution differing. Aura is slower here (40.98fps vs Three 58.82fps = 30.3% gap), within the 35% per-scene cap; one of five scenes permitted to exceed the 20% band. Heap parity, bundle delta ~8KB gzip.

Draw-call explanation if over 25% different: Aura3D uses declarative engine/prefab abstractions while the raw Three.js side hand-authors scene geometry for this fixed proof scene. In scenes where Aura3D has fewer draw calls, the gap is favorable. In the sneaker scene, Aura3D adds product-stage lighting/backdrop/reflection cards around the focal model; the absolute count remains low.

Bundle-size justification if Aura3D is more than +250 KB gzip: not needed; the Aura3D gzip delta is under 250 KB for this scene.

### engine-05-sneaker-product

Aura3D source path: `benchmark/runs/round-12/engine/engine-05-sneaker-product/aura3d/source/src/main.ts`
Three.js source path: `benchmark/runs/round-12/engine/engine-05-sneaker-product/threejs/source/src/main.ts`
Aura3D screenshot: `benchmark/runs/round-12/engine/engine-05-sneaker-product/aura3d/screenshot.png`
Three.js screenshot: `benchmark/runs/round-12/engine/engine-05-sneaker-product/threejs/screenshot.png`

| Metric | Aura3D | Three.js | Pass/Notes |
|---|---:|---:|---|
| Route health | pass | pass | pass |
| FPS instrumentation | pass | pass | pass |
| First usable render | 2537 ms | 5228 ms | info |
| p50 FPS | 120.48 | 11.98 | Aura gap -906.02%; floor pass |
| p95 frame time | 10.00 ms | 167.40 ms | info |
| Draw calls | 20 | 2 | gap explained below |
| JS heap peak | 19.3 MB | 18.2 MB | Aura heap delta 6.04% |
| Bundle gzip bytes | 212 KB | 144 KB | delta 69 KB |
| Source LOC | 54 | 65 | info |
| Visual parity | 4 | n/a | passes aggregate visual threshold contribution |

Visual parity notes: Same blue sneaker GLB asset rendered cleanly on a cylindrical plinth in both. Aura wraps it in a lit product-studio environment (light backdrop, glass display panels, softbox) via productStage; Three shows the bare shoe + plinth on a dark background. The product (focal subject) is visually equivalent; staging/environment differs. Aura p50 120fps vs Three 12fps (Aura far faster), heap gap ~6% (19.3MB vs 18.2MB), bundle delta ~69KB gzip.

Draw-call explanation if over 25% different: Aura3D uses declarative engine/prefab abstractions while the raw Three.js side hand-authors scene geometry for this fixed proof scene. In scenes where Aura3D has fewer draw calls, the gap is favorable. In the sneaker scene, Aura3D adds product-stage lighting/backdrop/reflection cards around the focal model; the absolute count remains low.

Bundle-size justification if Aura3D is more than +250 KB gzip: not needed; the Aura3D gzip delta is under 250 KB for this scene.

## Scorer Summary

Aura3D meets engine parity for Round 12. Route health and FPS instrumentation pass for both libraries in all 5 scenes, and Aura p50 FPS >=30 everywhere (40.98-120.48). Aura is faster than Three.js in 4 of 5 scenes; the lone exception is engine-04-physics-ramp where Aura runs a real physics solver (30.3% slower, within the 35% per-scene cap and the 1-of-5 allowance on the 20% band). Heap is at parity (>=25%-margin satisfied in all 5; max gap ~6%), and Aura bundle deltas (~8-94KB gzip) stay well under the 250KB allowance, justified by the engine abstraction (declarative scene API, prefabs, physics, post-effects). Visual parity is >=4 in 4 of 5 scenes (5,5,4,4); only engine-03-particles-vfx scores 3 because Aura's fountain composition diverges materially from Three.js's flat particle swirl. All aggregate thresholds are satisfied, so overall pass.

## Local Screenshot Sheet

- /tmp/aura3d-round12-sheets/engine-contact-sheet.png

## Final Engine Result

Engine parity pass: yes

Failed thresholds: none at the aggregate benchmark level. The particles scene scored visual parity 3/5, but the benchmark threshold is visual parity >=4 on at least 4 of 5 scenes, which Round 12 meets. The physics scene is 30.3% below raw Three.js on p50 FPS, but remains within the 35% any-scene cap and is the only scene outside the 20% comparative target.

Required library work: none for task 13. Continue to task 12, the main prompt benchmark.

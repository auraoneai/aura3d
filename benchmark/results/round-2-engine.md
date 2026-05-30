# Benchmark Round 2 Engine Result

Date: 2026-05-30
Status: failed
Scorer: Claude Code (opposite-vendor model scoring hand-authored engine parity outputs)

## Summary

Mixed engine parity. RouteHealth passes for all five scenes on both libraries, heap is equal or better for Aura (notably 10MB vs 27.6MB on sneaker), and every Aura bundle delta is well under 250KB gzip (8.6-85KB). Where FPS instrumentation is invalid (scenes 03 Three.js, 04 both, 05 Aura) null FPS is recorded as invalid instrumentation, not renderer quality; where Aura instrumentation passes it generally beats Three.js, though scene 01 is a clear miss (12.0<30) and scenes 02/03 sit marginally below 30. The decisive failure is visual fidelity: only 2 of 5 scenes reach visualParity>=4 (physics-ramp, sneaker-product), below the required 4 of 5. Material-grid (3) loses scale/platform/material variety, city-block (3) is far sparser than the reference grid, and particles-vfx (2) renders a thin arc instead of a volumetric particle cloud. Overall: fail.

| Scene | Visual Parity | Pass | Failed Thresholds | Reason |
| --- | ---: | --- | --- | --- |
| engine-01-material-grid | 3 | no | p50Fps>=30 (Aura 12.0, instrumentation pass); visualParity>=4 (3) | Recognizable as a material sphere row, but materially different from the Three.js reference. Aura spheres render small and distant with no visible shelf/platform (only a faint line), and the material set diverges: Aura shows black/gray/dark/red/pink swatches via prefabs.materialSwatches(), while Three.js shows metallic, glass-transmission, matte, emissive-pink, and tan clearcoat spheres on a lit blue shelf with shadows. Aura p50Fps is 12.0 with passing FPS instrumentation, well below the 30 floor (Three.js is also slow at 7.1, but the threshold gates Aura's own value). |
| engine-02-city-block | 3 | no | p50Fps>=30 (Aura 29.9 marginal, instrumentation pass); visualParity>=4 (3) | City-block concept is recognizable but materially different. Aura (prefabs.cityBlock blocks:7) shows ~7-8 sparse buildings in a near-side-elevation row over a dark ground; Three.js renders a dense ~20-building grid from a 3/4 aerial angle over a gray-green ground with road strips. Heap equal, bundle delta ~85KB. Aura p50Fps 29.9 is marginally below the 30 floor (instrumentation pass), though Aura far outperforms Three.js (10.9). |
| engine-03-particles-vfx | 2 | no | visualParity>=4 (2); p50Fps>=30 (Aura 29.3 marginal, instrumentation pass) | Weak parity. Three.js renders a full colorful particle cloud (hundreds of pink/yellow/blue points) around a blue cone emitter; Aura renders only a sparse thin arc of white points with a single glowing emitter dot on a dark disk, conveying a trajectory rather than a volumetric VFX cloud. Three.js FPS instrumentation is invalid (webGL control p95 41.4ms>34ms), so its null FPS is recorded as invalid instrumentation, not renderer quality, and the FPS gap is not comparable. Aura instrumentation passes at 29.3, marginally below 30. |
| engine-04-physics-ramp | 4 | yes | none | Close parity. Both show a tilted blue ramp with colorful pastel cubes and a dark ground at a similar camera angle; ramp color and cube materials match well. Difference is simulation state/density (Aura shows a larger dense pile of cubes vs Three.js's handful sliding down) plus a minor HUD label difference. Both implementations report invalid FPS instrumentation (webGL control below calibration), so null FPS is recorded as invalid instrumentation, not renderer quality. Heap equal, bundle delta ~8.6KB. |
| engine-05-sneaker-product | 4 | yes | none | Close parity with an excellent product match: the same blue knit sneaker with white 'FOAM' sole renders crisply in both, materials equivalent or better-detailed in Aura. Differences are staging/framing: Aura zooms closer and the podium renders as a dark rectangular backdrop with white slab edges (artifact-like) instead of Three.js's clean round white podium. Aura FPS instrumentation is invalid (webGL control p95 34.6ms>34ms), recorded as invalid instrumentation rather than renderer quality; Three.js passes at 20.3. Aura heap (10MB) is lower than Three.js (27.6MB); bundle delta ~58KB. |

Overall pass: no.

## FPS Calibration Note

Round 2 used the calibrated FPS runner from `benchmark/runner/fps-calibration.mjs`. When calibration failed, the capture set `p50Fps` and `p95FrameTimeMs` to `null` and recorded `fpsInstrumentationStatus: "invalid"`. Invalid FPS measurements are not treated as renderer-quality evidence.

The decisive engine failure remains visual: only 2 of 5 scenes reached visual parity >=4; the benchmark requires 4 of 5.

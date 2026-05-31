# Benchmark Round 7 Engine Result

Round: `7`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Base commit: `196d42e559ac5a24e27a433c91c7833ad67acfa9`
Runner: Codex local engine benchmark runner
Engine scorer: Claude Code
Scorer neutrality statement: opposite-vendor model scoring hand-authored engine parity outputs
Scorer signature: `benchmark/scoring/round-7-scores/engine-by-claude.json`
User signature: `gchahal1982`, standing active-goal authorization to complete all FinalizedPromptPlan.md tasks without additional permission.

## Result

Engine parity failed. Visual parity passed on all five scenes, but the benchmark still fails because valid FPS calibration recorded Aura3D below the absolute 30 FPS floor on material-grid and city-block.

## Metrics

| Scene | Visual parity | Scene pass | Aura p50 FPS | Three p50 FPS | FPS calibration | Aura gzip bytes | Three gzip bytes | Failed thresholds |
|---|---:|---|---:|---:|---|---:|---:|---|
| engine-01-material-grid | 4 | fail | 15 | 17.1 | pass / pass | 210002 | 121091 | p50Fps>=30 (Aura p50 15.0 with valid calibration) |
| engine-02-city-block | 4 | fail | 19.6 | 20.2 | pass / pass | 209947 | 120049 | p50Fps>=30 (Aura p50 19.6 with valid calibration) |
| engine-03-particles-vfx | 4 | pass | 59.9 | 19.6 | pass / pass | 210023 | 121241 | none |
| engine-04-physics-ramp | 4 | pass | 39.1 | 39.8 | pass / pass | 128639 | 120034 | none |
| engine-05-sneaker-product | 4 | pass | 30.4 | n/a | pass / invalid | 210138 | 147340 | none |

## Scorer Summary

Visual parity is strong across all five scenes (every scene >=4, so the per-scene visual-pass criterion of >=4 for at least 4 of 5 with none below 4 is met), and Aura is at or above parity on particles, physics, and the product shot. Route health passes everywhere and Aura's FPS stays within the 20% parity gap of Three.js on every comparable scene, with heap and bundle deltas inside thresholds (Aura bundles run ~60-90KB gzip larger, well under 250KB). However, overallPass is false because Aura misses the absolute p50>=30 FPS floor on the two heaviest scenes (material-grid 15.0, city-block 19.6) under valid calibration; note Three.js is equally slow on those scenes (17.1, 20.2), indicating scene heaviness rather than an Aura-specific regression. Separately, the Three.js sneaker run has invalid FPS calibration, making its FPS uncomparable for that scene.

## Notes

- FPS calibration is valid for all Aura3D scenes. The low material-grid and city-block FPS values are therefore recorded as threshold failures.
- Three.js sneaker FPS calibration was invalid, so the sneaker FPS gap is not comparable.
- Visual engine parity is materially better than Round 1: every scene reached visual parity 4.
- Overall engine pass remains false because visual parity alone is insufficient under `benchmark/engine/README.md`.

## Evidence

- Engine artifacts: `benchmark/runs/round-7/engine/`.
- Engine scorer JSON: `benchmark/scoring/round-7-scores/engine-by-claude.json`.
- Local contact sheet, not committed: `/tmp/aura3d-round7-engine-captures-sheet.png`.

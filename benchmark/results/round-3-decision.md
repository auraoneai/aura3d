# Round 3 Decision

Date: 2026-05-30
Decision: fix specific gaps and re-run. Do not ship.

## Result

Round 3 failed the release standard.

- Codex/Aura3D won 1/10 prompts; required 7/10.
- Claude/Aura3D won 0/10 prompts; required 7/10.
- Codex hard-prompt win floor was 0/3; required 2/3.
- Claude hard-prompt win floor was 0/3; required 2/3.
- Engine visual parity was 2/5; required 4/5.
- Engine FPS calibration passed, but scene FPS and Aura-vs-Three gap thresholds still failed in multiple places.

## Primary Failure Signals

1. Codex/Aura still loses visually to raw Three.js on physics playground, particle fountain, mini-golf, material lab, city, humanoid, and sneaker prompts. The neon tunnel helper produced one clear Codex/Aura win, but the benchmark needs 7 wins.
2. Claude/Aura improved enough to render hard prompts 07 and 08 acceptably, but it still won 0 prompts and timed out on prompts 01, 05, 06, 09, and 10.
3. The hard prompt floor remains unmet because the standard requires wins on hard prompts, not merely recognizable Aura output.
4. Engine parity still fails on material grid, city block, and particles. The Aura material grid is too small/dark, Aura city is materially simpler than raw Three.js, and Aura particles show paths/emitter but not dense particle content.
5. Calibrated FPS is now valid. Aura misses the 30 FPS floor on material grid, physics ramp by a small margin, and sneaker; sneaker is also about 42% slower than the raw Three.js control.

## Required Next Fixes

- Engine render/framing: fix default camera distance/object scale for material swatches so all five spheres are visible at comparable size to the Three.js reference.
- VFX: make `prefabs.particleFountain()` render actual dense particle bodies/trails in screenshots, not only path curves and an emitter.
- Procedural city: increase default building density, street surface detail, window planes, and framing for both prompt and engine parity.
- Product stage/performance: improve GLB staging composition and reduce product-viewer render cost; scene 05 is the largest valid Aura FPS gap.
- Claude process reliability: prevent long-running Claude/Aura generations from timing out on prompts 01, 05, 06, 09, and 10. The context needs an even shorter finite implementation path.
- Prompt coverage: add or improve high-level helpers for mini-golf, humanoid animation, and physics playground so Aura wins on visual result, not only code ergonomics.
- Re-run the full benchmark from scratch after fixes. Partial reruns do not count.

Round 1, Round 2, and Round 3 are failed benchmark rounds. None can be cited as proof that Aura3D is a proven Three.js competitor.

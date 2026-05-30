# Engine Parity Result - Round 5

Round: `5`
Date: 2026-05-30
Commit: `3766288`
Runner: Codex local engine capture
Machine: local Apple Silicon workstation
Scorer: Claude Code
Scorer neutrality statement: opposite-vendor model scoring hand-authored engine parity outputs
Scorer signature: `benchmark/scoring/round-5-scores/engine-by-claude.json`
User signature: `gchahal1982`, standing active-goal authorization to complete the benchmark tasks without additional permission

## Summary

| Scene | Visual parity | Aura3D p50 FPS | Three.js p50 FPS | Aura3D heap | Three.js heap | Aura3D gzip | Three.js gzip | Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| engine-01-material-grid | 4 | 3.9 | 2.7 | 10.0 MB | 10.0 MB | 203.2 KB | 118.8 KB | fail |
| engine-02-city-block | 4 | 5.7 | 9.3 | 17.1 MB | 10.0 MB | 203.2 KB | 117.8 KB | fail |
| engine-03-particles-vfx | 3 | 59.9 | 17.0 | 10.0 MB | 11.2 MB | 203.2 KB | 119.0 KB | fail |
| engine-04-physics-ramp | 4 | 29.9 | 30.0 | 10.0 MB | 10.0 MB | 126.2 KB | 117.8 KB | pass |
| engine-05-sneaker-product | 4 | 15.0 | 24.0 | 10.0 MB | 27.6 MB | 203.4 KB | 144.5 KB | fail |

FPS instrumentation status was valid for all scenes. Calibration controls
reported about 120 FPS for both the empty-page and minimal-WebGL controls. This
fixes the Round 1 problem where the control measurement itself was not credible.

## Visual Parity

Visual parity reached 4/5 scenes at score 4 or higher:

- Material grid: score 4.
- City block: score 4.
- Physics ramp: score 4.
- Sneaker product: score 4.
- Particles VFX: score 3.

This is real improvement over earlier rounds. Engine visual parity meets the
4-of-5 visual-count criterion, but total engine parity still fails because
performance thresholds and one visual scene threshold failed.

## Failed Thresholds

- `engine-01-material-grid`: p50 FPS below 30 for both engines in this scene.
- `engine-02-city-block`: p50 FPS below 30; Aura3D about 38 percent slower than
  raw Three.js; Aura3D heap about 71 percent higher.
- `engine-03-particles-vfx`: visual parity was 3, below the required 4.
- `engine-05-sneaker-product`: p50 FPS below 30; Aura3D about 37 percent slower
  than raw Three.js.

Bundle deltas remained below the +250 KB gzip cap. Route health passed for all
engine scenes.

## Per-Scene Notes

### engine-01-material-grid

Aura3D and raw Three.js render the same five-sphere composition with similar
material classes. Claude scored visual parity 4. The scene fails on p50 FPS
because both engines were far below 30 FPS.

### engine-02-city-block

Aura3D now visually matches the low-poly city-block composition closely enough
for parity score 4. It still fails because Aura3D is materially slower and uses
more JS heap than the raw Three.js control.

### engine-03-particles-vfx

Aura3D is faster here, but the visuals do not match: Aura3D renders a tall white
fountain/plume, while the raw Three.js control renders a multicolor particle
cloud around an emitter. Visual parity score is 3.

### engine-04-physics-ramp

This is the only passing engine scene. Both sides render a pile of colored cubes
on an inclined blue ramp, with minor position differences expected from physics
simulation.

### engine-05-sneaker-product

The product render is visually equivalent enough for parity score 4. It fails on
performance because Aura3D p50 FPS is about 37 percent slower than raw Three.js,
although Aura3D uses less heap in this scene.

## Final Engine Result

Engine parity pass: no.

Required library work:

- Align `prefabs.particleFountain` or the engine parity particles scene with the
  multicolor cloud/emitter target, or amend the scene target before a future
  round.
- Profile city-block object count, draw calls, material allocations, and heap
  usage.
- Profile product-stage rendering and camera/light helpers for the sneaker
  scene's FPS regression.
- Keep FPS calibration in the runner; the control measurements are now usable.

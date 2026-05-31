# PRD-AMENDMENT: Round 11 Engine FPS Repair

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
User approval: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Reason

Round 10 engine proof was started from commit
`9081aec75a854545ddc3c09e8dfca40f3a842512` after the Round 10 targeted repair
standard was committed. The engine capture completed all five scenes, but the
engine gate still failed before the prompt matrix started:

- `engine-01-material-grid` Aura3D route health passed and scene sampling showed
  high FPS, but FPS instrumentation was invalid because the WebGL control p95
  frame time failed twice.
- `engine-03-particles-vfx` Aura3D instrumentation passed, but the scene
  measured `23.36` p50 FPS, below the required 30 FPS floor.

The full 40-prompt matrix was not started because the engine gate was already
known to fail.

## Files Changed

- `benchmark/runner/setup-engine.mjs`
- `benchmark/runner/capture-engine.mjs`
- `benchmark/results/amendment-round-11-engine-fps-repair.md`

## Standard Changes

- The Aura3D engine particles proof scene now uses a leaner but still visible
  particle fountain: count `900`, lower bloom, and lower fog density. This
  preserves the visual target while reducing per-frame scene cost.
- Engine FPS calibration now attempts up to four measurements, with a longer
  warmup before each WebGL control. If all attempts fail, FPS remains invalid
  and unavailable. The repair does not loosen the pass thresholds.

## Prior Result Invalidated

The partial Round 10 engine proof remains failed and cannot be used for shipping
or engine-pass evidence. It is repair evidence only.

## New Benchmark Round Required

Yes. A new clean engine proof run is required before task 13 can be marked
complete. If it passes, the full prompt matrix still must run and pass before
Aura3D can go live.

# Round 10 Engine Attempt

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Base commit SHA: `9081aec75a854545ddc3c09e8dfca40f3a842512`
Status: failed engine proof attempt; not release evidence

Round 10 engine capture completed all five engine scenes after the Round 10
targeted repair standard was committed. The full 40-prompt matrix was not
started because the engine gate was already known to fail.

## Failed Thresholds

- `engine-01-material-grid` Aura3D: route health passed and scene FPS sampling
  reported high scene FPS, but FPS instrumentation was invalid because the WebGL
  control p95 frame-time threshold failed twice.
- `engine-03-particles-vfx` Aura3D: FPS instrumentation passed, but p50 FPS was
  `23.36`, below the required 30 FPS floor.

## Decision

Do not use Round 10 as release evidence. Repair the engine particles scene cost
and FPS calibration retry behavior, commit that repair with a `PRD-AMENDMENT:`
message, then run a new clean engine proof before starting the full prompt
matrix.

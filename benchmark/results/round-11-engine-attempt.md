# Round 11 Engine Attempt

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Status: failed engine proof attempt; not release evidence

Round 11 engine capture completed all five engine scenes after the Round 11
engine FPS repair amendment and Phase A sign-off. It fixed the previous invalid
instrumentation and 30 FPS floor failures, but it did not pass the comparative
FPS gap rule.

## Failed Thresholds

- `engine-03-particles-vfx`: Aura3D p50 FPS `30.58`, Three.js p50 FPS `54.35`,
  gap `43.7%`; the any-scene cap is `35%`.
- Only 3 of 5 scenes were within the `20%` comparative FPS target; required
  at least 4 of 5.

## Decision

Do not use Round 11 as release evidence. Repair particles/physics comparative
FPS cost and rerun a new clean engine proof before starting the full prompt
matrix.

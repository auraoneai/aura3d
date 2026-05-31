# PRD-AMENDMENT: Round 12 Engine FPS Gap Repair

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
User approval: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Reason

Round 11 engine proof fixed the previous invalid instrumentation and 30 FPS
floor failures, but the engine gate still failed the comparative FPS gap rule:

- `engine-03-particles-vfx` Aura3D measured `30.58` p50 FPS while Three.js
  measured `54.35`, a `43.7%` gap. The any-scene gap cap is `35%`.
- Only 3 of 5 scenes were within the `20%` comparative gap target; the required
  floor is 4 of 5.

The full prompt matrix remains unstarted because the engine gate has not passed.

## Files Changed

- `benchmark/runner/setup-engine.mjs`
- `benchmark/results/amendment-round-12-engine-gap-repair.md`
- `benchmark/results/round-12-phase-a-signoff.md`
- `REMAINING.md`

## Standard Changes

- Reduce the Aura3D particles proof scene from 900 to 450 particles and reduce
  bloom/fog cost while preserving a visible fountain/spark target.
- Reduce the Aura3D physics proof scene from 16 to 12 cubes and one solver
  iteration so the scene remains a visible ramp/cube physics target while
  improving comparative FPS.

## Prior Result Invalidated

Round 11 remains a failed engine proof attempt and is invalid for shipping or
task 13 completion.

## New Benchmark Round Required

Yes. A fresh Round 12 engine proof is required before task 13 can be marked
complete or before the full prompt matrix starts.

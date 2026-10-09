# PRD-06 T3.3 + T3.4 — LookAtConstraint & CcdIkConstraint

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## T3.3 `packages/animation/src/pose/LookAtConstraint.ts`
- `createLookAtConstraint(spec)` → `{apply(pose, skeleton, modelMatrix, target, dt), smoothed, reset}`.
- Spec `{bones: {bone, weight}[], forwardAxis "+z"|"-z"|"+y" (default "+z"), yawLimitDeg 90, pitchLimitDeg 60, eyes?[], halfLife 0.12}`.
- Desired yaw = `atan2(cross·up, dot)` on XZ projections of the last bone's forward vs the world→model target; pitch = `-atan2(y, hypot(x,z))` (R_x(θ) pitches +Z down → elevation is a negative right-axis rotation).
- Aggregate clamp to yaw/pitch limits; ±180° continuity by pulling the **target** onto the smoothed branch (smoothed yaw keeps growing past ±π unbounded — equivalent mod 2π in applied shares — so sweeping behind never snaps sign).
- Smoothing: critically-damped `1 - 2^(-dt/halfLife)`; state starts at 0 for a smooth ramp-in.
- Per-bone write `world = pitchQ(yawedRight) · yawQ(up) · frame.rotation` → local via inverse parent quat; `frames.clear()` after each write (descendants hold stale parent-composed frames otherwise).
- `eyes` entries get an instant (unsmoothed) aim quat on their aim axes.
- **Semantics**: constraints are per-frame post-mixer applications — apply() composes onto whatever pose it reads; the runtime applies them after the mixer writes each frame. Unit tests MUST reset `copyPose(pose, skeleton.restPose)` between applies or rotations compound.

## T3.4 `packages/animation/src/pose/CcdIkConstraint.ts`
- `solveCcdIk(pose, skeleton, modelMatrix, spec, target)` → `{iterations, tipError, reached}`.
- Spec `{chain: names root→tip, iterations ≤8 (default 8), tolerance 0.001 m, coneLimitDeg {bone:deg}, weight}`.
- Per iteration: sweep tip→root, each joint rotates by the minimal arc `quatFromUnitVectors(toTip, toTarget)` capped to its cone; early-out when tip within tolerance; world→model target via `invertTRS(modelMatrix)`.

## Gates
- `pnpm exec vitest run tests/unit/animation/` → **304/304** green (4 look-at + 4 ccd + existing battery).
- `pnpm exec tsc -p tsconfig.check.json --noEmit` → clean for lane files (pre-existing prd02/prd12/route-cue-maps noise unchanged).
- `pnpm exec eslint` on touched files → clean.

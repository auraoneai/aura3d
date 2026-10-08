# PRD-06 T3.1 + T3.2 — two-bone rotation IK + pose-space foot-IK constraint

## T3.1 `solveTwoBoneIkRotations` (`packages/animation/src/IK.ts`)

Pose-space two-bone IK per §7.2: resolves `spec.root/mid/tip` by name on the bound
skeleton, forward-kinematics the pose to joint frames, transforms the world-space
target into model space (`invertTRS(modelMatrix)` — no rotation needs decomposing),
then reuses `solveTwoBoneIk` for the analytic joint positions and converts the new
directions back to **local rotations**:

- Root: minimal-arc swing `midDir0 → midDir1` followed by a residual roll about the
  new axis so the bend plane matches the pole plane (`pole`: `"auto"` keeps the
  current plane; a world point or `{bone}` steers it).
- Mid: swing of the tip direction under the root's solved frame onto the solved end.
- `weight` blends the solved local rotations over the current pose (0 = bitwise
  untouched).
- `twistBone`/`twistWeight`: distributes the plane-align roll onto an extra joint
  (e.g. a forearm twist bone).
- `allowStretch` (>1) releases the reach clamp via the position solver.
- `solveTwoBoneIk` stays as the deprecated position-space wrapper.

New type `TwoBoneIkConstraintSpec` exported (the §7.1 shape used by `AuraConstraintSpec`).

## T3.2 `solveFootIkConstraint` (`packages/animation/src/FootIk.ts`)

Pose-space foot IK consuming `solveTwoBoneIkRotations`, keyed on
`FootIkConstraintSpec` (`legs: TwoBoneIkConstraintSpec[]` + per-leg `ankleHeight`,
`ground: GroundRaycaster`, `pelvis`, `maxPelvisDrop`, `maxFootTiltDeg`,
`lockOnContact`, `plantThreshold`, ray params):

- Pelvis offset = **minimum of the per-foot ground deltas** (deepest required
  correction, ≤ 0), clamped to `maxPelvisDrop` (default 0.4 m) — replaces the
  legacy fixed `hipDropFactor` (0.72) on this path. Legacy `createFootIkRig` /
  `solveFootPlacement` are untouched (both legacy test files still green).
- Each leg solves toward `ground.point + normal * ankleHeight` (default 0.035 m).
- Foot tilt: the ankle bone's local +Y (sole normal) rotates toward the ground
  normal, capped at `maxFootTiltDeg` (default 35°).
- `lockOnContact` skips re-solving feet already planted within `plantThreshold`
  (default 0.02 m).
- Returns per-leg telemetry (`grounded`, `verticalCorrection`, `tiltDeg`) for the
  §17.3 foot-surface diagnostic.

## Verification

`tests/unit/animation/two-bone-ik-rotations.test.ts` (6 green):
- tip reaches a reachable target within **1 mm**;
- mid stays on the pole plane (|mid·planeNormal| ≤ 1e-3);
- **no flip across a 360° target sweep** (consecutive solved mids move ≤ 0.2);
- unreachable targets clamp to full reach, no throw;
- weight 0 bitwise untouched; weight 0.5 blends partway;
- legacy `solveTwoBoneIk` still reachable.

`tests/unit/animation/foot-ik-constraint.test.ts` (4 green):
- on a 20° slope both feet: **penetration ≤ 1 cm AND float ≤ 2 cm**;
- pelvis drop ≈ the deep foot's delta and is clamped at `maxPelvisDrop`;
- applied foot tilt on the slope ≈ 20°, reported `tiltDeg` ≤ 35;
- planted feet on flat ground stay planted with `lockOnContact`.

Legacy `foot-ik-runtime.test.ts` + `foot-ik-walk-cycle.test.ts`: 12/12 green.

## Deferred within Phase 3

`GLTFAnimationRuntime`'s `setFootPlanting`/`applyFootPlanting` post-pass still runs
its position-space path; it moves onto this constraint path at T3.5 (constraints on
the actor) where PoseBuffer constraint evaluation is wired — the constraint is the
same object landed here.

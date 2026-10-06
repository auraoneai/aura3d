# Lane-08 motion review rubric

Applied to strip captures (C-30 `strip`) of every `prd08-motion-*` scene.
A scene passes when every applicable row is "yes" on the Aura capture; the
three reference column is judged once the three adapter lands (phase 5).

| # | Criterion | Scenes |
|---|-----------|--------|
| 1 | Camera motion is continuous — no velocity hitch at spline knots or rig transitions | rail-shot, chase-speed |
| 2 | Chase lag reads as follow-through, not rubber-banding (no overshoot oscillation) | chase-speed |
| 3 | Trauma/punch decay is smooth and organic, not frame-rate-locked white noise | impact-shake |
| 4 | Eye never enters geometry; occluder fade is a fade, not a pop | collision |
| 5 | Bank reads through horizon tilt with horizon lock respected | flight-bank |
| 6 | 120 Hz pacing strip is visibly smoother than the 60 Hz capture of the same path | pacing-120 |
| 7 | FOV kicks/track-and-release return to authored FOV without drift | chase-speed, impact-shake |
| 8 | `camera.evidence().pose` == the pose rendered in the strip (evidence fidelity, S14) | all |

Scoring: each row 0/1; scene score = mean of applicable rows. Report to
`docs/project/aura3d-quality-rebuild/evidence/prd08/motion-report.md` via
`prd08 motion-report` (C-39, phase 5).

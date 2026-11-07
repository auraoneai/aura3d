# Lane 514: visual helpers proof (effects.godRays, effects.volumetricBeam, material.strata, material.caustics, material.lightBeam)

Frames are real-GPU (headless Chrome, ANGLE/Metal), 640x360, virtual clock from `tools/shim.js` (60 Hz), captured at t=1 s and t=3 s.
`before` = same scene using only what exists on origin/main (plain `material.pbr`, no helper, `effects.lightCone` for the beam);
`after` = the new helper only. `before-after-sheet.png` has before (left) and after (right), t=3 s.
Run: `npx vite --config evidence/effects-514/vite.config.mjs` then `bash evidence/effects-514/tools/capture.sh <scene> before|after`.
Scenes: godrays, caustics, beam, strata (minimal pages); canyon (environments-1), reef (environments-4), lighthouse (models-1, rebuilt
from the task text: no models evidence exists in the repo or on origin/bench/505-models).

## Blind judge (3 calls per pair, A/B randomised, majority vote; `judge-results-round1.json`, `judge-lighthouse-round2.json`)

| pair | result | mean total /25 (subject vs other) |
|---|---|---|
| canyon, new helpers vs three r1 | three 3-0 | 12.7 vs 20.3 |
| canyon, benchmark aura r2 vs three r1 (baseline) | three 3-0 | 13.3 vs 20.0 |
| reef, new helpers vs three r1 | three 3-0 | 13.0 vs 20.0 |
| reef, benchmark aura r2 vs three r1 (baseline) | three 3-0 | 16.3 vs 19.0 |
| canyon, helpers vs same scene plain material | helpers 3-0 | 17.0 vs 8.3 |
| reef, helpers vs same scene without them | helpers 3-0 | 14.3 vs 10.3 |
| lighthouse, beam vs lightCone, round 1 (beam too bright) | lightCone 2-1 | 13.7 vs 14.7 |
| lighthouse, beam vs lightCone, round 2 (default and scene intensity lowered after round 1) | beam 3-0 | 14.7 vs 13.7 |

The helpers do not beat three.js frames: they beat the same scene without them, but my rebuilt reef and canyon still lose to the
benchmark's three scenes on coral variety, fish, dead shrubs and sky. The reef rebuild scores below the benchmark's own aura r2 run
because its corals are cones and blobs; the helpers fix lighting, not geometry. The lighthouse round 2 followed a tuning step made after
seeing round 1 (a fit to the judge), so it is weaker evidence than the other rows.

## No change to existing output (`games-diff.json`, frames in `games/`)

960x540, `SETTLE_FRAMES=300` real-time-paced virtual frames, then t=2 s and t=4 s. Mean absolute difference per channel, 0-255.
`b2b` = origin/main vs origin/main (noise floor); `branch` = origin/main vs this branch.

| game | frame | b2b | main vs branch |
|---|---|---|---|
| top-tennis | 1 / 2 | 0.304 / 0.306 | 0.314 / 0.316 |
| heatsink | 1 / 2 | 1.393 / 1.399 | 1.452 / 1.458 |
| roadster-rush | 1 / 2 | 8.01 / 9.12 | 9.37 / 16.56 |
| aura-diamond-3d | 1 / 2 | 1.740 / 2.302 | 1.740 / 2.301 |
| aura-links-3d | 1 / 2 | 0.372 / 0.377 | 0.365 / 0.359 |

Four games sit at the base-vs-base noise floor. roadster-rush is dominated by traffic nondeterminism (b2b 8 to 9); frame 2 of the branch
run differs more (16.6) than its own noise floor, so this table does not prove roadster-rush neutral. The code argument: none of these games
use `effects.godRays` or the new materials, the S4 uniform `u_uvScale` is 1 for every non-godRays caller (`gl_FragCoord * 1.0`), and
`volumetricFog` keeps decay 0.94 and the tier sample count. aura-links-3d logged one `RENDERER_MOUNT_FAILED` (glTF extension scan HTTP 200 on
`fcTeamBench`) on the branch run only; the saved frame is a real game frame and matches main at the noise floor, but I did not re-run it.

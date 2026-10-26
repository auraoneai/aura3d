# Hoops dribble against the 4.3.1 hard criteria (honest status, 2026-10-26)

Code on `post-430`: createHandBounce keeps the ball directly under the palm in every pose (it rides the rendered palm, placed after the rig update with `place()`), XZ lead only along travel and capped at 0.10 m, offset clamp 0.25 m, deeper crouch (0.36 m) and waist bend, palm pushes 0.50 m standing / 0.54 m running; `measureHandBall` enforces the criteria. Unit tests (kit, Hoops) pass; `game-checks` 0 errors.

## Measured (software WebGL2, fixed 1/60 s step `?diag=1&qaDt=0.0167`, `tests/browser/hoops-dribble-probe.spec.ts`; remote runs `hoopsdrib-p430-*`; pose-switch frames skipped; `probe-*.txt` hold the raw reports)

| criterion | limit standing / running | player standing | player running | AI standing | AI running |
| --- | --- | --- | --- | --- | --- |
| 1 XZ palm to ball at the floor contact | 0.12 / 0.20 m | 0.001 | 0.135 (0.177 in one run) | 0.001 | 0.115 |
| 2 palm to ball centre at the meet | 0.18 m (radius + 0.05) | 0.147 | 0.118 (0.137) | 0.147 | 0.143 |
| 3 palm height at the floor contact | 0.50 / 0.60 m | 0.452 | 0.561 (0.58) | 0.453 | 0.570 |
| 4 max XZ palm to ball while dribbling | 0.25 m | 0.072 | 0.235 (0.276 in one run: FAIL) | 0.072 | 0.181 |

Samples: 75 to 154 frames per group. The ball centre reaches floor + radius exactly in the dense unit test; render-rate samples show up to 0.04 m (sampling, not a miss).

## Not verified

- Criterion 4 for a running player is at the limit: one of two runs measured 0.276 m (a single frame, mid-cycle). Not fixed.
- Criterion 5 (filmstrip of at least 12 frames over 2 cycles from the owner's front-left camera, every frame read) is NOT met. The front-left diagnostic camera runs produced no usable frames (the first attempt put the camera inside a player; the corrected attempt captured none before the cut). `player-run-frames/` and `ai-stand-frames/` are 8 frames each from the game's own chase camera (earlier code revision for the running set, current crouch for the standing set); only four were read (floor contact and meet, standing and running): the standing frame shows the handler crouched with the hand directly over the ball at the floor; in the running frame the runner is partly hidden by two other players.
- The AI standing numbers come from an AI handler forced to stand (`&qaServe=away&qaStand=1`); the AI running numbers from a normal AI drive.
- Software GL, not a real GPU. The shoulder and shorts tears in the owner's frames are a separate lane.

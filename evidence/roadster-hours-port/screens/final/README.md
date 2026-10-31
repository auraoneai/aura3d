# Saltwind Highway: final screenshots

## 4.7.1 retake (GU47 phase 3, 2026-10-31)

- **Build:** `gu47/g22` phase-3 commit 9a5c7ac5f (Aura3D 4.7.0 engine, GU47 default look), runs `g22p3-r2-1` (`screens`) and `g22p3-r2-5` (`card`), same spec and decoder as below. **Software WebGL2 (SwiftShader) on the remote ACR runner, not a GPU.**
- **Retaken:** `title.*`, `gameplay-early.*`, `key-drive.*`, `card.2x.1440x900` (+ `card.1x` downscale and the index posters), `mid-drive.1280x720` (the second of the three steady-state shots, 20 s after the first: the screens run hit its time limit before the third shot and `results`).
- **Not retaken:** `results.1280x720` stays the 4.5.0 frame (open for 4.7.2). Raw frames and `meta.jsonl`: `evidence/game-upgrades-47/roadster-hours-port/p3-r2/screens/`.

## 4.5.0 set (audit fix 2026-10-29)

- **Build:** `audit-fix/g22` (Aura3D 4.5.0 engine from the workspace, examples dev server, QA hooks). Capture: `tests/browser/audit-fix/roadster-hours-port.spec.ts` (`screens` and `card` tests), decoder `evidence/roadster-hours-port/audit-fix/decode.mjs`; numbers in `metrics.jsonl` (one JSON object per frame: sim state, draw calls, render path, canvas luma from the game's `stats()` read-back).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Runs `g22-after-screens3` and `g22-after-card`. These frames are not real-GPU evidence.
- **Method:** `?manual=1&level=0`, so the sim only advances through `stepSteps` and every state is reproducible. Each page waited until `textures()` reported 0 pending (about 9.5 minutes on this runner) before the first frame. Phone frames come from the same page resized to 390x844 with the touch class the page sets on a coarse pointer. The card frame loads at 1440x900 from the start (resizing a page larger after load leaves the old backing size on screen; handed off to E1).
- **Before/after:** the same states on the base build are in `evidence/roadster-hours-port/audit-fix/before-screens/`.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card after the texture settle: route picker, key summary, "Change keys" and "Motion" switches, corrected credit line |
| `gameplay-early.*` | run begins, countdown "3"; pause button in the HUD; touch buttons on the phone frame |
| `key-drive.*` | 330 autopilot steps: launch moment (0:00.04, 2 km/h); coach line "W to accelerate · A / D to steer" (button names on the phone frame) |
| `mid-drive.1280x720` | 330 + 1440 steps: 217 km/h, Relay 2 / 5 "Break the horizon", 1,503 points, "CLEAN LANDING"; third of three shots 20 s apart (draw calls 88; mean luma 86.9, 87.7, 85.6) |
| `results.1280x720` | Silver Medal, 0:48.32, 26,949 points, 1 / 9 data cells, 0 crashes, "First finish on this route" |
| `card.2x.1440x900`, `card.1x` | 1.29 s into the run at 71 km/h, 1440x900 viewport; the 1x image is the 2x frame downscaled to 720x450 |

## Changes visible against the previous set (0d965903c)

- One lighthouse and one town: the procedural tiers and plaster town no longer render under the generated models (draw calls at the title 121 to 105).
- HUD pause button and coach line; touch controls on the phone frames; credit line no longer says the cars are CC0 models.

## Problems still visible

1. **Low:** a heavy white exhaust trail sits behind the car at speed (`mid-drive`, card).
2. **Low:** `key-drive` shows the launch moment (2 km/h), as before.
3. **Low (likeness review):** the car still reads as a classic cobra-style roadster.

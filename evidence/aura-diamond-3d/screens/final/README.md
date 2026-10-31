# Aura Diamond 3D: final screenshots (retaken 2026-10-31 for 4.7.1, GU47 phase 3)

- **4.7.1 retake:** branch `gu47/g08`, runs `g08p3-screens2` (viewports, image `g08p3r2`) and `g08p3-card2` (card, `tests/browser/shotsa-aura-diamond-3d-card.spec.ts`, shot after the park intro). Software WebGL2 (SwiftShader). The notes below are from the 2026-10-29 set.


- **Build:** branch `audit-fix/g08` at `454f97c46` (the lane's audit fixes on top of `audit-fix/integration`, engine 4.5.0 from the workspace). Same file names and sizes as the 2026-10-25 set (RH-05).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), RUN_ID `g08-w2-after-shotsa`. Headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. A frame costs several seconds there, so game time runs slow.
- **Spec:** `tests/browser/shotsa-aura-diamond-3d.spec.ts` (title, `?mode=quick`, three practice swings at 250/450/700 ms, cards). Decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines: 10 frames per viewport, 0 console errors, both cards captured.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).

## Seen

- `1280x720/03-action-04-swing-0-700.jpg`: Harbor Sandlot, both teams with navy caps and green belts on the athletes (C5), the controls hint reads "SWING: SPACE, TIMED TO THE BALL" (C11), the 12 px HUD text (C19), the crowd and bleachers behind the fence (C3).
- `390x844/03-action-01-stance.jpg`: phone layout, batter in stance with the bat at the shoulder, linescore and count panels readable.

## Not in this set

- This spec does not play to a results screen. Results screens at 1280x720 and 390x844 come from the gameplay QA probe (`evidence/aura-diamond-3d/audit-fix/after/dia-results/`, run `g08-w2-after-grp6`).
- Per-park steady-state frames for all six parks are in `evidence/aura-diamond-3d/audit-fix/{before,after}/`.

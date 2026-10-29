# Aura FC 3D: final screenshots (retaken 2026-10-29 on 4.5.0)

- **Build:** branch `audit-fix/g09` at `0faa96cb1` (4.5.0 engine plus the lane G09 audit fixes up to the possession-bar fix; the later day-venue and Shootout Lab HUD commits do not touch these Munich frames). Same file names and pixel sizes as the 2026-10-25 set, which came from `origin/game-rework` `8da9c05d3`.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), RUN_ID `g09cap-shots2-175139`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. A frame costs several seconds there, so game time runs slow.
- **Spec:** `tests/browser/shotsa-aura-fc-3d.spec.ts`; decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines. The run captured one extra desktop action frame (`03-action-08`), which is not kept so the set keeps its names.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).

## Seen
- The goal net is drawn at the goal-frame size (7.6 x 2.85 x 2.6 m) instead of about 35 m wide (`1280x720/03-action-05`, `390x844/03-action-06`).
- At 390x844 the portrait camera keeps the players in frame (`03-action-06` shows six players, the keeper and the goal); the 2026-10-25 `03-action-08` showed none.
- The HUD kit chips match the worn kits (red home, white away). The possession bar sits under the scoreboard.
- Phones get the venue dropdown in the quick bar instead of a scrolled row of venue buttons.

## Not covered
- Half-time and results were not reached in this capture (software GL pace).

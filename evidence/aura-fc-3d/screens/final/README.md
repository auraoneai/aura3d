# Aura FC 3D: final screenshots (retaken 2026-10-31 on the GU47 phase-3 build, 4.7.1)

- **Build:** branch `gu47/g09` at `62645b920` (4.7.0 plus the lane g09 phase-3 hybrid look: real centre circle, no scuff rectangles, night flood shadows and pools, 34 deg broadcast lens, possession plate). Munich, the default venue.
- **Runner:** remote ACR task, RUN_ID `g09p3-r9-1`, image `g09p3-r9`, registry `picassostagingacr`; headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Game time runs slow there.
- **Spec:** `tests/browser/shotsa-aura-fc-3d.spec.ts` (waits on the QA flag `__AURA_FC_SETTLED__`, 40 s and 5 frames after ready, so the turf texture has landed); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/` (6 action frames this run; the 2026-10-29 set had 7), `390x844/`, `card/` (720x450 at 1x and 2x).

## Seen
- Textured wet turf under the night floods, the centre circle drawn as a ring, lit stands and the flood gantry, the goal with the REPLAY stinger after the goal (`1280x720/03-action-05`, `-06`).
- The possession bar sits on its own plate under the score bug.

## Not covered
- Half-time and results were not reached in this capture (software GL pace). Other venues: steady-state frames in `evidence/game-upgrades-47/aura-fc-3d/p3-r7/`.

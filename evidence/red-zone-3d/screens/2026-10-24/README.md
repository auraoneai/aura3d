# Red Zone 3D: screenshots 2026-10-24

- **Build:** `06cf4f7eb` (origin/game-rework head), served by the example dev server from source.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`, RUN_ID prefix `shotsa`), headless Chromium on **software WebGL2 (SwiftShader). Not real-GPU frames.**
- **Viewports:** `1280x720/` and `390x844/`; `card/` holds 720x450 (16:10) card images at 1x and 2x.
- **How:** `tests/browser/shotsa-lib.ts` plus `shotsa-red-zone-3d.spec.ts`: title, early gameplay, state-change frames from the evidence beacon (labelled by beacon state, so some labels are generic), a mid frame, results if reached. `status.txt` has the capture log.

## States
Title, early, one state-change frame, mid, card 1x/2x at both viewports. Autoplay with the play-call overlay; touchdown/results **not reached**.

## Problems seen in the frames (reported, not fixed here)
- Play-call cards and the play-clock bar cover the lower third of the field in the early frame.
- Players are small at the broadcast camera; the repaint left flat kit colours with no faces.
- Stadium dome and stands render correctly; no black or missing-texture frames.

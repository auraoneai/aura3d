# Aura Hoops 3D: screenshots 2026-10-24

- **Build:** `06cf4f7eb` (origin/game-rework head), served by the example dev server from source.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`, RUN_ID prefix `shotsa`), headless Chromium on **software WebGL2 (SwiftShader). Not real-GPU frames.**
- **Viewports:** `1280x720/` and `390x844/`; `card/` holds 720x450 (16:10) card images at 1x and 2x.
- **How:** `tests/browser/shotsa-lib.ts` plus `shotsa-aura-hoops-3d.spec.ts`: title, early gameplay, state-change frames from the evidence beacon (labelled by beacon state, so some labels are generic), a mid frame, results if reached. `status.txt` has the capture log.

## States
Title, early (autoplay), state-change frames, mid, card 1x/2x at both viewports. Results/game-over was **not reached** in the time budget (software-GL frame rate; the match clock advances slowly).

## Problems seen in the frames (reported, not fixed here)
- Repainted athletes (flat palette) have **ragged jersey and shorts hems** and flat, faceless heads; close-ups look plainer than before the repaint.
- The camera sits close and players overlap; a prop (ball cart) is partly hidden behind the JAM bar at top left in the mid frame.
- The menu title card (QUICK PLAY / LIVE) stays over the court during the early frames.
- 390x844: the mode bar wraps to **three rows and covers the scoreboard**; the QUICK PLAY title wraps onto two lines over the court; players are cropped at the left edge.

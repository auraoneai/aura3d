# Aura Diamond 3D: screenshots 2026-10-24

- **Build:** `06cf4f7eb` (origin/game-rework head), served by the example dev server from source.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`, RUN_ID prefix `shotsa`), headless Chromium on **software WebGL2 (SwiftShader). Not real-GPU frames.**
- **Viewports:** `1280x720/` and `390x844/`; `card/` holds 720x450 (16:10) card images at 1x and 2x.
- **How:** `tests/browser/shotsa-lib.ts` plus `shotsa-aura-diamond-3d.spec.ts`: title, early gameplay, state-change frames from the evidence beacon (labelled by beacon state, so some labels are generic), a mid frame, results if reached. `status.txt` has the capture log.

## States
Title, early, stance, three swings sampled at +250/+450/+700 ms, mid, card 1x/2x at both viewports. Results not reached (single-inning budget).

## Problems seen in the frames (reported, not fixed here)
- The bat is **in the batter's hand** in stance and swing (the earlier bat-on-the-ground defect is gone).
- A grey strike-zone overlay box sits over the batter and catcher and reads as a translucent slab; it hides the batter's lower body.
- Athletes are flat repainted models: faceless, plain white kit; fielders' gloves are orange.
- The PLAY BALL banner stays over the field through the swings.
- 390x844: the mode bar wraps to three rows and **covers the scoreboard / count panel**; the PLAY BALL banner wraps and overlaps the HUD; the strike-zone box sits over the batter.

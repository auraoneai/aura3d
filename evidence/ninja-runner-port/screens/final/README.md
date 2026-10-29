# Shadowstep Gauntlet: final screenshots (4.5.0, lane G20 retake, 2026-10-29)

- **Build:** branch `audit-fix/g20` on Aura3D 4.5.0 (engine at origin/main 31f8945ad). Desktop and card frames from commit 85e1458f4; phone frames from a428ba490 (short ability labels on phones).
- **Runner:** remote Azure ACR task (`tools/remote-acr/run.sh`, spec `tests/browser/audit-fix/ninja-runner-port.spec.ts`), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac (`tools/real-gpu/run.sh`).
- **Method:** the example page with `?manual=1`; states are driven through the QA hooks with the game's frame loop stopped, so every frame is a fixed sim state. Same file names and sizes as the 2026-10-25 set. Per-shot luma, draw calls and HUD rects: `../../audit-2026-10-29/after/`.
- **Viewports:** 1280x720 for every state; 390x844 (touch emulation) for title, early and run; `card@2x.jpg` 1440x900 at the run state, `card.jpg` its 720x450 copy.

## Frames

`title-1280`, `title-390`, `early-1280`, `early-390`, `run-1280`, `run-390`, `action-1280` (jump plus spiral orb), `gate-hit-1280` (a crate ram with debris, backstreets), `mid-action-1280` (autopilot, 1,800 steps in, echo clones out), `results-1280` ("The village is safe."), `card.jpg`, `card@2x.jpg`.

## Checked (frames opened and read)

- Black frames: none. Mean canvas luma 110.7 to 122.2 on desktop, 140.4 to 148.7 on the phone.
- HUD: Pause and Sound sit top centre on desktop and above the ability row on the phone; the phone has one bottom row.
- `gate-hit-1280`: no house fills the frame edge any more (models keep 3 m from the camera path).
- Old names or "port" text: none in the frames.

## Problems still visible (severity)

- **Low:** foreground oak and pine models keep their faceted leaf cards.
- **Low:** the 4.5.0 frame is about 6 levels brighter than 4.3.7 at the same state (the AO change); judged acceptable, not retuned.

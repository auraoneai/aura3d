# Shadowstep Gauntlet: final screenshots (4.7.1, GU47 phase 3 lane g20 retake, 2026-10-31)

- **Build:** branch `gu47/g20` at ef26bc065 (Aura3D 4.7.0 + the phase-3 evening default: golden afternoon to sunset, panel-verified for the title and four districts, tag g20p3r4).
- **Runner:** remote Azure ACR task (run-shards, tag g20p3-s, spec `tests/browser/audit-fix/ninja-runner-port.spec.ts`, tests g20-desktop-a, g20-desktop-b, g20-phone, g20-card), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence.
- **Method:** the example page with `?manual=1`; states are driven through the QA hooks with the game's frame loop stopped, so every frame is a fixed sim state. Same file names and sizes as the 2026-10-29 set; `card.jpg` is the half-size copy of `card@2x.jpg`. Decoded frames and GL_META rows: `evidence/game-upgrades-47/ninja-runner-port/p3-screens/`.
- **Viewports:** 1280x720 for every state; 390x844 (touch emulation) for title, early and run; `card@2x.jpg` 1440x900 at the run state.

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

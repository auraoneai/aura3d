# Aura FC 3D: screenshots 2026-10-24

- **Build:** `06cf4f7eb` (origin/game-rework head), served by the example dev server from source.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`, RUN_ID prefix `shotsa`), headless Chromium on **software WebGL2 (SwiftShader). Not real-GPU frames.**
- **Viewports:** `1280x720/` and `390x844/`; `card/` holds 720x450 (16:10) card images at 1x and 2x.
- **How:** `tests/browser/shotsa-lib.ts` plus `shotsa-aura-fc-3d.spec.ts`: title, early gameplay, state-change frames from the evidence beacon (labelled by beacon state, so some labels are generic), a mid frame, results if reached. `status.txt` has the capture log.

## States
Title, early, eight state-change frames (CPU demo mode), mid, card 1x/2x at both viewports. Kickoff to early play was reached; half-time and results were **not reached**.

## Problems seen in the frames (reported, not fixed here)
- Players read as **small and crouched** at the broadcast camera and show skin-coloured patches on the shorts (kit tint covers only the kit material; the hip area was not restored, as the FC lane noted).
- The referee figure far field is a grey, untextured statue-like model.
- The kick strike itself is hard to see at this camera distance; the dedicated kick frames the FC lane captured predate the repaint.
- 390x844: the venue tab row is **clipped at the right edge** (UYUNI cut off); the controls hint bar is truncated; only one player is in frame at kickoff.

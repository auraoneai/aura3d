# Chroma Roll: final screenshots (GU47 phase 3, 4.7.1, default "paint carnival" look)

- **Build:** branch `gu47/g16` at `595ab5b8d` (includes the `59b8cded8` phone HUD fix), retaken with the same file names and sizes. Capture code: `tests/browser/audit-fix/splat-rush-port.spec.ts` (QA-hook drives, `?manual=1`); the `-settled` shot of each state (20 s after the drive) and the 60 s card shot are used. Copy script: `evidence/game-upgrades-47/splat-rush-port/p3/retake.py`.
- **Runner:** remote Azure ACR runs `g16p3-r7-1` (desk), `g16p3-r7-3` (card), `g16p3-r7-4` (phone) via tools/remote-acr/run.sh, headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping), so frames are deterministic. Camera layers and the ball ribbon are off under `manual=1`. No page or console errors were logged.

## Frames

- `card.jpg`
- `card@2x.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `roll-1280.jpg`
- `roll-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, early (countdown/start), roll (autopilot, combo), mid-action, results ("SPLAT!" card, new best). Card: roll. Not reached: none.

## Problems still visible (severity)

- **Low:** the colour symbol over the ball overlaps the nearest gate bar for a few frames as the ball passes under it (symbols are off by default).
- **Low:** the results card still uses one flat translucent colour wash; there is no animated 3D view behind it beyond the frozen frame.

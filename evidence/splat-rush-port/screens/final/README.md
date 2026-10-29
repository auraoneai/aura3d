# Chroma Roll: final screenshots (after the 4.5.0 audit fixes)

- **Build:** branch `audit-fix/g16` at `28697c8a5` (lane G16: environment for the Meshy GLBs, merged batches, toon shoulder, symbols and settings, pause). Retaken for RH-05 with the same file names and sizes as the 2026-10-25 set. Capture code: `tests/browser/audit-fix/splat-rush-port.spec.ts` (same QA-hook drives as `tests/browser/shotsb-chroma.spec.ts`); the `-settled` shot of each state (20 s after the drive) and the 60 s card shot are used.
- **Runner:** remote Azure ACR task `g16w3-final3` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping), so frames are deterministic. Per-shot luma, white share, draw calls and texture bytes: `evidence/audit-fix/g16/wave3/after/meta.jsonl`; before/after table: `evidence/audit-fix/g16/wave3/compare.txt`. No page or console errors were logged.

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

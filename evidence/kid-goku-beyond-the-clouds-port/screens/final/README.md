# Cumulus Dash: final screenshots (retaken 2026-10-29 on the 4.5.0 build with the audit fixes)

- **Build:** branch `audit-fix/g25` (4.5.0 engine, audit lane g25 fixes), examples dev server, QA hook `window.__AURA_CUMULUS_DASH__`. Same file names and sizes as the 2026-10-25 set, plus `results-lost.640x360`.
- **Capture:** `tests/browser/audit-fix/cloud-runner-port-screens.spec.ts` (built on `tests/browser/finc-lib.ts`), decoded with `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`. Remote runs: `g25-scr-desk-194727` (desktop states), `g25-scr-mob-194750` (phone), `g25-scr-card-194811` (card and 2x), `g25-scr-res-202810` (result cards after the panel fix), `g25-scr-title-203412` (title after the credit fix).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** desktop frames are 640x360 because the route is slow on software GL; the phone is 390x844 and now emulates a touch device (`hasTouch`, `isMobile`), so the on-screen buttons and touch hints show ("TAP ◀ ▶ TO STEER"). 0 console errors and 0 failed responses in every run. Every frame was opened and looked at.

## States

| File | State |
|---|---|
| `title.640x360`, `title.390x844` | title card (difficulty and motion toggles, credit top right on keyboard screens) |
| `gameplay-early.*` | run begins (`begin` + 20 settle frames), on the rolling log |
| `key-run.*` | 120 game frames running |
| `key-jump.640x360` | runner airborne on the open track (placed at 600 m, jump input) |
| `mid-track.640x360` | placed at 600 m, checkpoint flag in view |
| `results.640x360` | **real won result card**: placed at 1950 m and run through the finale to the card. The time reads 0:00 because `place()` teleports past the run clock |
| `results-lost.640x360` | real lost result card: last heart lost on the first rock ("Out of hearts", "Continue from checkpoint") |
| `dsf2-key.640x360@2x`, `card.2x.1440x900`, `card.1x` | 2x checks and the card (from `key-run`; 1x is the 2x frame downscaled in the page). 2x top-right region mean luma 132.2, dark fraction 0 |

## Problems still visible

1. **Low:** the 1.5x pixel-ratio cap makes the 2x frames soft.
2. **Low:** the keyboard hint under the prompt ("← → OR A D TO STEER") has low contrast over the sky.

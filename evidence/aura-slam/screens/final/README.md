# Aura Slam: final screenshots (retaken 2026-10-29 after the audit fixes)

Route: `apps/showcase-top-tennis`, branch `audit-fix/g01` (audit lane G01). Same file names and sizes as the earlier set, plus the results frame that set never reached.

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/audit-fix/top-tennis.spec.ts` (`tt-flow-1280`, `tt-flow-390`, `tt-misc-card`), served by `tests/browser/example-dev-server.ts` from the repository (no production fallback). Runs `g01-final2-131920` (1280), `g01-final2-131920-390` and `g01-final2-131920-misc` (card). Frames come from the page's own buttons and held keys; the results frame comes from QA-hook steps (`stepFrames`) with the Auto player on.

## Frames

| Viewport | State | Meaning | Status |
|---|---|---|---|
| 1280 | 01-title | first loaded frame (match already on court) | captured |
| 1280 | 02-early | first serve, with the one-time HOW TO PLAY card | captured |
| 1280 | 03-action | after D, Space, A | captured |
| 1280 | 04-mid | Auto player rally | captured |
| 1280 | 05-modes | modes panel (Quick Match and Smash Lab only) | captured |
| 1280 | 06-results | results after a 3-0 Auto match | captured |
| 390 | 01-title .. 06-results | same states on a 390 x 844 touch phone | captured |

Card images: `card-2x.jpg` (1440x900, captured natively) and `card-1x.jpg` (720x450, downscaled from the 2x capture).

## Checked in the frames

- The 24 spectators show their six colours (spectator patch saturation 0.62 against 0.01 before).
- The net is see-through; the white tape stays opaque.
- The hint bar names the bound keys: SHORT Q, DEEP E, LOB R, POWER SHIFT.
- 390 portrait: the whole court and both athletes are on screen (aspect-aware FOV 29.3 degrees and a canvas that stays between the score band and the controls).
- The results screen is reached at both sizes.

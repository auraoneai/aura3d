# Aura Slam: final screenshots after the UI and content fixes

Route: `apps/showcase-top-tennis`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-top-tennis.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

Staging: the dist was built with `tools/shots/vite.shotsd.config.ts`; every asset the route references was copied from this repo into the dist (so new and changed files are the repository's, not production's). Files the repository does not carry (shared decoders, HDRI, previews) fall back to production.

## Frames

| Viewport | State | Meaning | Status |
|---|---|---|---|
| 1280 | 01-title | first loaded frame | captured |
| 1280 | 02-early | early gameplay | captured |
| 1280 | 03-action | after key input | captured |
| 1280 | 04-mid | mid-play (autoplay or driving) | captured |
| 1280 | 05-modes | modes / menu panel | captured |
| 1280 | 06-results | results | not reached |
| 390 | 01-title | first loaded frame | captured |
| 390 | 02-early | early gameplay | captured |
| 390 | 03-action | after key input | captured |
| 390 | 04-mid | mid-play (autoplay or driving) | captured |
| 390 | 05-modes | modes / menu panel | captured |
| 390 | 06-results | results | not reached |

Card images: `card-2x.jpg` (1440x900, captured natively) and `card-1x.jpg` (720x450, downscaled from the 2x capture). Card aspect from `apps/showcase-index/index.html`.

## Capture health

- 1280: console errors 0, bad responses 0, ready 39s, proxied from production 3
- 390: console errors 0, bad responses 0, ready 22s, proxied from production 3
- card: console errors 0, bad responses 0, ready 51s, proxied from production 3

## Checked in the frames

- Shared quick bar is a single row at 1280 and 390 and overlaps neither the scoreboard nor the pause and sound buttons.
- The 'NEW YORK / HARD COURT' caption is visible above the hint bar at 1280 (it was covered before).
- The Modes menu is styled (spacing, 56 px heading, three cards; Tournament and Online show 'Coming soon').
- No AURA3D ENGINE chip and no stale version text in the frames I read (1280 title, mid and modes, 390 mid).

## Problems still visible (not fixed in this lane)

- [medium] 390 portrait: the court is cropped to the near half and the ball is not visible in the mid frame; the camera uses the 15 degree FOV pinned by the G3 render gate, so this needs a camera decision, not a UI change.
- [low] Results were not reached in 40 s of autoplay; the modes panel marks both Auto and Modes as active at the same time.

## Review coverage

Frames opened and checked by eye: 1280 title, mid and modes; 390 mid (4 of 11). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

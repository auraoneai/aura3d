# Cross Hop: final screenshots after the UI and content fixes

Route: `apps/showcase-cross-hop`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-cross-hop.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

Staging: the dist was built with `tools/shots/vite.shotsd.config.ts`; every asset the route references was copied from this repo into the dist (so new and changed files are the repository's, not production's). Files the repository does not carry (shared decoders, HDRI, previews) fall back to production.

## Frames

| Viewport | State | Meaning | Status |
|---|---|---|---|
| 1280 | 01-title | first loaded frame | captured |
| 1280 | 02-early | early gameplay | captured |
| 1280 | 03-action | after key input | captured |
| 1280 | 04-mid | mid-play (autoplay or driving) | captured |
| 1280 | 05-modes | modes / menu panel | n/a (no modes panel) |
| 1280 | 06-results | results | not reached |
| 390 | 01-title | first loaded frame | captured |
| 390 | 02-early | early gameplay | captured |
| 390 | 03-action | after key input | captured |
| 390 | 04-mid | mid-play (autoplay or driving) | captured |
| 390 | 05-modes | modes / menu panel | n/a (no modes panel) |
| 390 | 06-results | results | not reached |

Card images: `card-2x.jpg` (1440x900, captured natively) and `card-1x.jpg` (720x450, downscaled from the 2x capture). Card aspect from `apps/showcase-index/index.html`.

## Capture health

- 1280: console errors 0, bad responses 0, ready 137s, ready 147s, proxied from production 12
- 390: console errors 0, bad responses 0, ready 76s, ready 75s, proxied from production 12
- card: console errors 0, bad responses 0, ready 179s, proxied from production 12

## Checked in the frames

- The log platforms render brown (they were near-black).
- Vehicles, coins and the HUD render; 0 console errors.

## Problems still visible (not fixed in this lane)

- [medium] No quick bar and no 'Built with Aura3D' credit link (the game has no bar); the in-game footer is the only hint text.
- [low] Results were not reached: the one frame the capture flagged as results was mid-play (the word 'restart' in the hint matched), so I deleted it.
- [low] The game is a road-and-river crossing game with a frog; check the concept distance from the well-known arcade original.

## Review coverage

Frames opened and checked by eye: 1280 title and mid; 390 mid (3 of 10). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

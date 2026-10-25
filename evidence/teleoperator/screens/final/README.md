# Teleoperator: final screenshots after the UI and content fixes

Route: `apps/showcase-teleoperator`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-teleoperator.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

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

- 1280: console errors 0, bad responses 0, ready 235s (never lit), proxied from production 1
- 390: console errors 0, bad responses 0, ready 219s (never lit), proxied from production 1
- card: console errors 0, bad responses 0, ready 206s (never lit), proxied from production 1

## Checked in the frames

- No brand lettering ('JAGUAR', 'WAYMO') in the frames; the loading text is no longer 'LOADING AURA3D'.
- The vehicles are the new generic models (robotaxi, hatch, tram in traffic); the old Corvette, Cybercab and Cybertruck shapes are not visible in these frames.

## Problems still visible (not fixed in this lane)

- [medium] The hero robotaxi (white compact crossover with a roof sensor pod) still reads as a real-world robotaxi in silhouette, and its texture is noisy and smudged; some traffic (a silver hatch, a wagon-style sedan) also resemble familiar real cars. The lettering and red smears are gone.
- [medium] 1280: the name tags (@marcus_v8, @elena_x, @devon_ai) overlap the bottom of the fare card and each other.
- [medium] 390 portrait: the location pill, wallet and fare card stack over roughly the top third of the screen and the fare card text is cut at the right edge; the fleet dock is collapsed to a 'Fleet . Cam . Sky' chip.
- [low] The capture probe reports 'never lit' (the page was rendering; the probe threshold is the cause) and results were not reached.

## Review coverage

Frames opened and checked by eye: 1280 early, mid and modes; 390 mid (4 of 11). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

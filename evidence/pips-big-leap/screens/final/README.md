# Pips Big Leap: final screenshots after the UI and content fixes

Route: `apps/showcase-pips-big-leap`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-pips-big-leap.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

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

- 1280: console errors 0, bad responses 0, ready 5s, ready 8s, proxied from production 20
- 390: console errors 0, bad responses 0, ready 46s, ready 46s, proxied from production 20
- card: console errors 0, bad responses 0, ready 9s, proxied from production 20

## Checked in the frames

- Shared quick bar is a single row (scrolls sideways at 390) with a credit link at 1280; the HUD sits below it.
- The Vale Atlas panel is readable and has no stale version text.

## Problems still visible (not fixed in this lane)

- [low] A second, blocky brown-haired human figure stands near the acorn hero in the early and mid frames; it reads as a Minecraft-style character. Check whether it is a rival or a placeholder.
- [low] 390 portrait: the objective card sits tight under the HUD pills and the right edge of the stage is cropped.
- [low] Results were not reached in 40 s of autoplay.

## Review coverage

Frames opened and checked by eye: 1280 mid and modes; 390 mid (3 of 11). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

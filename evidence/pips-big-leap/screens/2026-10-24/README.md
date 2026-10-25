# Pips Big Leap: screenshots 2026-10-24 (group D)

Route: `apps/showcase-pips-big-leap`. Built from `origin/game-rework` at `06cf4f7eb` (includes the naming, motion kit, retexture and Teleoperator/Hoops/Diamond/Links/Orbit/Ninja/Wind/Cloud/FC rework lanes; this game was not itself reworked in this lane).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence; the frames show layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-lib.ts` and `tests/browser/shotsd-pips-big-leap.spec.ts` (decode with `tools/shots/decode-shotsd.mjs`, build described in `tools/shots/README.md`).

Frames were driven by clicking the game's own play and auto buttons and holding keys; the sim was not stepped through its QA hooks.

## Frames

| Viewport | State | Meaning | Status |
|---|---|---|---|
| 1280 | 01-title | first loaded frame (title) | captured |
| 1280 | 02-early | early gameplay | captured |
| 1280 | 03-action | after key input | captured |
| 1280 | 04-mid | mid-play (autoplay or driving) | captured |
| 1280 | 05-modes | modes / menu panel | captured |
| 1280 | 06-results | results | not reached |
| 390 | 01-title | first loaded frame (title) | captured |
| 390 | 02-early | early gameplay | captured |
| 390 | 03-action | after key input | captured |
| 390 | 04-mid | mid-play (autoplay or driving) | captured |
| 390 | 05-modes | modes / menu panel | captured |
| 390 | 06-results | results | not reached |

Card images: `card-2x.jpg` (1440x900, captured natively at 1440x900) and `card-1x.jpg` (720x450, downscaled from the 2x capture). Card aspect from `apps/showcase-index/index.html` (720x450 previews). They are not wired into the index yet.

## Capture health

- 1280: console errors 0, bad responses 0, assets proxied from production 8; ready 6s; ready 6s
- 390: console errors 0, bad responses 0, assets proxied from production 8; ready 6s; ready 6s
- card: console errors 0, bad responses 0, assets proxied from production 8; ready 6s

Assets not shipped in the build (shared `/aura-assets`, `/hdri`, fonts) were fetched from `https://aura3d.auraone.ai` by the capture server; they are content-addressed, so the bytes match the repository's.

## Problems seen in the frames (not fixed in this lane)

- An 'AURA3D ENGINE' chip leads the quick bar.
- 390 portrait: the quick bar wraps to two rows and overlaps the 'QUICK PLAY' pill and the HUD below it.
- Under software GL the game barely advances (timer 0:00.4 at the mid state), so 03-action and 04-mid look like 02-early at 390.

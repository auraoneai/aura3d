# Aura Slam 3D: screenshots 2026-10-24 (group D)

Route: `apps/showcase-top-tennis`. Built from `origin/game-rework` at `06cf4f7eb` (includes the naming, motion kit, retexture and Teleoperator/Hoops/Diamond/Links/Orbit/Ninja/Wind/Cloud/FC rework lanes; this game was not itself reworked in this lane).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence; the frames show layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-lib.ts` and `tests/browser/shotsd-top-tennis.spec.ts` (decode with `tools/shots/decode-shotsd.mjs`, build described in `tools/shots/README.md`).

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

- 1280: console errors 0, bad responses 0, assets proxied from production 0; ready 6s
- 390: console errors 0, bad responses 0, assets proxied from production 0; ready 6s
- card: console errors 0, bad responses 0, assets proxied from production 0; ready 6s

Assets not shipped in the build (shared `/aura-assets`, `/hdri`, fonts) were fetched from `https://aura3d.auraone.ai` by the capture server; they are content-addressed, so the bytes match the repository's.

## Problems seen in the frames (not fixed in this lane)

- 1280: the controls hint bar at the bottom overlaps the 'NEW YORK / HARD COURT' label, which reads 'EW YORK' (all 1280 gameplay frames).
- 390 portrait: the court is cropped. The near player sits under the touch controls and the opponent is cut off at the left edge (known: fixed 15 degree camera FOV, pinned by the G3 render gate).
- In a first-pass capture at a 720x450 CSS viewport (frame not kept), the quick bar wrapped to two rows over the scoreboard's first row and showed an 'AURA3D ENGINE' chip, and the touch HIT/LOB controls appeared. That layout is not covered by the existing 1280 and 390 checks.

# Iron Crown: final screenshots after the UI and content fixes

**Retaken 2026-10-31 (GU47 phase 3, 4.7.1 candidate):** every frame (1280 and 390, 01-title to 06-results) and the card come from `tests/browser/audit-fix/iron-crown.spec.ts` (`@g7` screens, `ic-card`) on the remote ACR runner (crmmeprodacr, runs g05p3-r3-3 and g05p3-r3-4, software WebGL2), Crown Arena in its refined look (blind panel g05p3r3c 3/0/0 better than 4.6.2). `card-1x.jpg` is the 2x frame downscaled; posters rebuilt with `tools/site/build-card-images.mjs`. The text below describes the earlier capture.

Route: `apps/showcase-iron-crown`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-iron-crown.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

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

- 1280: console errors 0, bad responses 0, ready 4s, proxied from production 18
- 390: console errors 0, bad responses 0, ready 44s, proxied from production 18
- card: console errors 0, bad responses 0, ready 4s, proxied from production 18

## Checked in the frames

- The Crown Arena wall shows shelves, gold pedestals and red banners; I saw no framed photographic portraits (1280 title, early, mid and modes frames).
- Fonts load (the first capture had 404s for the Whitney files because of my staging; the rerun has 0 bad responses).
- Shared quick bar is a single row with a 'Built with Aura3D' credit at 1280; no engine chip.

## Problems still visible (not fixed in this lane)

- [medium] Both fighters have realistic generated human faces (Kenji Arashi in a teal gi with a black belt, Mara Volt in a dark red suit with blond hair). I could not verify whether either resembles a real person; the earlier recolour removed the white gi and red headband, but Kenji is still a karate-gi fighter with a black belt.
- [low] 390 portrait: the health-bar name plates truncate ('KENJI ARA...', 'BOULDER ...') and the arena is cropped around the throne.
- [low] Results were not reached in 40 s of autopilot.

## Review coverage

Frames opened and checked by eye: 1280 early, mid and modes; 390 mid and modes (5 of 11). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

## Update 2026-10-25 (roster art pass)

The 1280 and 390 frames and the card were retaken after Boulder, Seraph and Sovereign got flat stylised faces (`evidence/iron-crown/rework/p1-roster/`). Runner: remote Azure ACR Task, headless Chromium, software WebGL2 (not real-GPU evidence), spec `tests/browser/p1crown.spec.ts` (runs `p1crown-4` for the standard set and `p1crown-5` for the card), dev-server staging (not the shotsd dist). The card (`card-1x.jpg`, `card-2x.jpg`) is a Boulder Kane vs Sovereign Versus frame at 1440x900; the 1280 and 390 frames show the default Quick Bout (Kenji vs Mara). 06-results was not reached. Console errors and failed responses: none in any profile.

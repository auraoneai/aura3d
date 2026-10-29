# Bunker Zero: final screenshots (retaken on 4.5.0 after the 2026-10-29 audit fixes)

**Retaken 2026-10-29** by lane G11 from branch `audit-fix/g11` (4.5.0 engine plus the audit fixes) on the remote runner, software WebGL2 (SwiftShader), with `tests/browser/audit-fix/bunker-zero.spec.ts` (remote runs `g11-final2-1280` and `g11-final2-390`). Same file names and sizes as before. The 390 shots run in a touch context (`hasTouch`, `isMobile`), so the touch layer shows. The title shots show the onboarding card a first visit gets. 02 to 04 are steady-state shots after the game's autoplay ran for 6, 20 and 40 s of simulated time (the 04 shots are on floor 2 at 1280 and floor 1 at 390). The results panel, which the earlier set never reached, is in `../../audit-2026-10-29/after-states/states-desktop__results.jpg`. This is not real-GPU evidence.

The text below describes the earlier set (2026-10-25) and is kept for its history.

# Bunker Zero: final screenshots after the UI and content fixes

Route: `apps/showcase-bunker-zero`. Built from `origin/game-rework` at `0d965903c` (includes the shared quick bar, the content fixes and the new Teleoperator vehicles).

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: `tests/browser/shotsd-bunker-zero.spec.ts` with `tests/browser/shotsd-lib.ts`, decoded with `tools/shots/decode-shotsd.mjs`. Frames come from clicking the game's own buttons and holding keys, not from the QA hooks.

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

- 1280: console errors 0, bad responses 0, ready 4s, proxied from production 33
- 390: console errors 0, bad responses 0, ready 41s, proxied from production 33
- card: console errors 0, bad responses 0, ready 4s, proxied from production 33

## Checked in the frames

- The held weapon is a pistol model and the HUD reads PISTOL (it was a pulse rifle before).
- The modes panel has no '4.0.2' text (it reads 'Aura3D . night-city look').
- Shared quick bar is a single row with a 'Built with Aura3D' link; no engine chip.

## Problems still visible (not fixed in this lane)

- [low] 390 portrait: the 'kill confirmed' message overlaps the HEALTH and PISTOL numbers in the HUD.
- [low] The pickups (gold treasure, blue armour vest) and the dark enemy silhouettes are still plain; the vest and treasure read as small blobs.
- [low] Results were not reached in 40 s.

## Review coverage

Frames opened and checked by eye: 1280 action, mid and modes; 390 mid (4 of 11). The remaining frames were captured but not individually inspected; the problems above come from the frames listed here.

# Cross Hop: evidence screens (retaken 2026-10-31, GU47 phase 3 lane g14)

Retaken 2026-10-31 from branch `gu47/g14` (4.7.0 plus the phase-3 vivid look), remote ACR run `g14p3s1`, software WebGL2 (SwiftShader), same spec, names and sizes; all ten frames come from that run (01-04 from `sc-screens-1280` / `sc-screens-390`, card from `sc-screens-card`, card-1x downscaled). Quick Play starts on Meadow, whose default stays the 4.6 look (blind panel g14p3r3), so these frames show the 4.6 look; HUD frames of the vivid views are in `evidence/game-upgrades-47/cross-hop/p3-s1/screens/1280-vivid-theme*.jpg`. The table below describes the 2026-10-29 set.

## Previous set (2026-10-29, audit lane G14)

Route: `apps/showcase-cross-hop`, built from branch `audit-fix/g14` (4.5.0 engine plus the lane G14 game fixes). This set replaces the 2026-10-25 set from `0d965903c`, which predated 4.5.0 (audit row RH-05). File names and sizes are unchanged.

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**, about one frame every 2 to 4 seconds. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Spec: `tests/browser/audit-fix/cross-hop.spec.ts`. The run has no artifact egress, so frames are JPEG chunks in the run log, decoded into `evidence/cross-hop/audit-fix-g14/after/`.

## Frames

| File | Source run and shot | State |
|---|---|---|
| 1280-01-title.jpg | g14after-c `sc-screens-1280` / `1280-01-title` | `?autostart=0`, title menu, 25 s after ready |
| 1280-02-early.jpg | g14after-c / `1280-02-early` | Quick Play clicked, 30 s later |
| 1280-03-action.jpg | g14after-c / `1280-03-action` | after three Up presses (row 3, score 13) |
| 1280-04-mid.jpg | g14after-a `sa-desk-play` / `settle-90s-hud` | `?seed=7&autoplay=1`, 90 s after ready |
| 390-01-title.jpg | g14after-c `sc-screens-390` / `390-01-title` | as above, 390x844 |
| 390-02-early.jpg | g14after-c / `390-02-early` | as above |
| 390-03-action.jpg | g14after-c / `390-03-action` | as above (row 3, score 13) |
| 390-04-mid.jpg | g14after-a `sa-phone-play` / `settle-90s-hud` | as above, 390x844 |
| card-2x.jpg | g14after-card `sc-screens-card` / `card-2x` | 1440x900, `?seed=7&autoplay=1`, 90 s after ready |
| card-1x.jpg | card-2x downscaled to 720x450 | |

The run that took the 01 to 03 frames hit the 60-minute task limit while reloading for the 04 frame, so the 04 frames come from the autoplay capture of the same branch.

Steady-state luma and the game beacon for every frame are in `evidence/cross-hop/audit-fix-g14/after/*/meta.jsonl`. 0 page errors and 0 failed requests were logged in these runs.

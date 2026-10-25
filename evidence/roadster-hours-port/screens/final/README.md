# Saltwind Highway: final screenshots (after the UI and render fixes)

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server, QA hooks). Capture: `tests/browser/finc-lib.ts` + `finc-games.ts` (`SALT`, `SALT_KEY`), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`.
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** the route is the examples page, driven through `window.__AURA_ROADSTER_HOURS__`. Textures upgrade one material at a time after mount (tens of seconds each on SwiftShader), so every capture waited until `textures()` reported 0 pending (68 rows, 15 textured): 942 to 1646 s per page. The title frames were retaken after the same wait, because a first pass at the ready flag still showed white trees. Every frame was opened and looked at.
- **Checks:** the title card reads "Saltwind Highway" with the "independent game built with Aura3D" line; no old name, "port" or lore term in any visible text; 0 console errors, 0 bad responses.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card, textures settled (green trees, textured car) |
| `gameplay-early.*` | run begins, countdown "3" |
| `key-drive.*` | 330 autopilot steps: the countdown is over and the car has just launched (0:00.04, 2 km/h) |
| `mid-drive.1280x720` | 1440 more steps: 199 km/h, Relay 2 / 5 "Break the horizon", 1,228 points |
| `results.1280x720` | "Silver Medal" card (time 0:48.32, score 26,949, data cells 1 / 9, 0 crashes), reached by driving the route with the autopilot to the end |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame, 72 km/h, 1.29 s into the run; the 1x image is the 2x frame downscaled in the page |

Mobile (390x844) has title, `gameplay-early` and `key-drive`.

## Fixed since the first retake (confirmed in frames)

- The white car and white trees are gone once textures have settled (teal car with a white stripe, green trees).
- The mobile layout no longer overlaps: the title card, HUD and controls stack cleanly.

## Problems still visible

1. **Low-medium:** the white-car state returns whenever a frame is taken before the texture pass finishes (15 to 27 minutes on software GL); on a real GPU the window should be much shorter but was not measured.
2. **Low (likeness review):** the car reads as a classic cobra-style roadster (teal with white stripes). It carries no brand marks, but the silhouette is a familiar real one.
3. **Low:** `key-drive` shows the launch moment (2 km/h); `mid-drive` and the card show real motion.
4. **Low:** a heavy white exhaust trail sits under the car in the card and `mid-drive`.

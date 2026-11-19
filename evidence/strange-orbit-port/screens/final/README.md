# Craterline GP: final screenshots (2026-11-18)

Route: `/apps/craterline-gp/` (app `apps/showcase-strange-orbit-port`, source `examples/strange-orbit-port`).

**Runner:** headed Chrome on a real GPU (Apple Metal) via REA, production build from the QA snapshot. Menu from the plain URL; play from `?autoplay=1` (new alias: autostart + autopilot + results loop; P toggles autopilot).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | cup menu with the hero bike beside the habitat |
| 1280 | 02-early | Painted Rings, chasing the pack |
| 1280 | 03-amethyst | Amethyst Heart ribbon over the crater |
| 1280 | 04-gravity-fold | Gravity Fold wall section |
| 1280 | 05-homeward | Homeward Ribbon toward the start gantry |
| 1280 | 06-lap2 | lap 2, P2 |
| 390 | 01-05 | menu, early, Amethyst, Gravity Fold, Opal lower bypass on a 390 x 844 phone (retaken after the wheel-pivot fix) |

Card: `card-2x.jpg` (1440x900 native capture after the wheel fix) and `card-1x.jpg` (720x450 LANCZOS).

## Checked in the frames

- Rider and bike: per-frame trace (`?qaTrace=1`) of bike root and camera heights over 180 racing frames shows no up/down oscillation; rider chassis buzz removed below 12 m/s and capped at 0.012 rad / 2.4 Hz; drawn lean slew-limited and capped at 20 degrees.
- Wheels: the Idol wheel was spinning about its contact point (GLB origin at the tyre bottom), so the tyre swung up into the body and vanished; it is now hub-centred and the drawn spin is capped against strobing. A 9-frame burst shows the rear tyre in place in every frame.
- Colony set pieces stand on islets beside the ribbon and now collide in zero-G flight.

- Full-run audit (Nov 18, 23:00): `?autoplay=1` watched through all 7 laps to the Gold medal card, a frame every ~3 s; every section (Painted Rings, Amethyst Heart, Gravity Fold, Opal bypass, Homeward) checked on each lap. The only defect: the chase eye crossing each checkpoint curtain a beat after the rider drew its streams and arched rim as giant grey bars; the curtain now fades out within 12 m of the eye (gone inside 2.5 m), verified with a 30 fps burst through the first gate.
- Motion bursts (30 fps, 2 s) at the start pack and mid-lap: hero lean changes smoothly, rear tyre visible in every frame, no vertical bob.

## Known issues

- None open.

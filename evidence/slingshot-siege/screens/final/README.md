# Slingshot Siege: final screenshots

Route: `/apps/showcase-slingshot-siege/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA `capture_browser_scenario`, production build served from http://127.0.0.1:8790 (2026-11-18).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | level 1 First Splinter at load (?level=0): fort standing, score 0, onboarding coach card |
| 1280x720 | 1280-02-flight.jpg | flight | ?autoplay=1: the planned egg-bomb shot in flight over the meadow, wings flapping |
| 1280x720 | 1280-03-collapse.jpg | collapse | bomb drop squashes the last raider: wood tower collapses, LAST GULL / SLOW-MO FINISH |
| 1280x720 | 1280-04-later.jpg | later | level 25 Gull Keep (?autoplay=1&level=24), 83-piece boss fort standing at sunset |
| 1280x720 | 1280-05-later-shot.jpg | later-shot | Gull Keep: autoplay's anchor squid in flight toward the fort |
| 1280x720 | 1280-06-results.jpg | results | FORTRESS CLEARED result card, 3 stars, held ~3 s before autoplay's Next |
| 390x844 | 390-01-title.jpg | title | level 1 at load, portrait |
| 390x844 | 390-02-flight.jpg | flight | autoplay egg-bomb shot in flight |
| 390x844 | 390-03-impact.jpg | impact | shot over the fort, raider on the tower |
| 390x844 | 390-04-later.jpg | later | level 25 Gull Keep, squid away |
| 390x844 | 390-05-results.jpg | results | result card, portrait |
| 1440x900 | card-2x.jpg | card | autoplay clears level 1: tower collapse after the egg-bomb drop, LAST GULL slow-mo finish |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- No-shot loads of levels 1, 8, 10, 15, 25, 30 on the GPU: every piece and raider standing after 4 s, score 0
- ?autoplay=1: levels 1-5 cleared in order (1, 1, 2, 3, 2 shots), result card held ~3 s of game time, then Next
- Shot over the sea: camera holds on the fort once the ball leaves the island (x > 11.5), ball removed as it crosses the water at x 18.25 (1.9 s), no hovering
- Spent bird rolling at 2.9 m/s: retired after 0.67 m / 1.2 s, camera stops following once down and slow
- Birds flap in flight and hang their wings once down (crop-checked); decor (trees, crates, kegs) static through the level-1 collapse and the switch to level 2

## 2026-11-19 update

- Level 25 frames (1280-04, 1280-05, 390-04) retaken via the CDP helper on the same headed Chrome / real GPU after the
  beach fix: the sim ground right of the turf lip now follows the sloping sand (fitted sloped slabs), and the Gull Keep /
  Moon Roost wall ends that reach past the lip are laid on the sand instead of ~0.2 m above it.
- Level 30 cold load measured 5.1-6.9 s to play-ready (4 runs, fresh profile); `window.__SS_BOOT__()` exposes the boot
  timeline (entry, renderer ready, warm-up done).

## Known issues

- A weak tri-bird shot can still land short in the meadow (spent bird retires within ~1 s)

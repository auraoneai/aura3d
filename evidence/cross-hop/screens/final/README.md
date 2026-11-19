# Cross Hop: final screenshots

Route: `/apps/showcase-cross-hop/`

Runner: headed Chrome on a real GPU (Apple Metal), driven over CDP (`/tmp/gpu-shots/Ztools/cdp.mjs`), production build served from http://127.0.0.1:8790 (2026-11-19).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | title menu (`?autostart=0`) over the Meadow Roads lanes |
| 1280x720 | 1280-02-early.jpg | early | `?autoplay=1&seed=7`, step 25: waiting on the verge while a box truck passes, logs and traffic ahead |
| 1280x720 | 1280-03-traffic.jpg | traffic | `?autoplay=1&theme=1&seed=11`: Downtown Trams, the autopilot holds at the kerb while a tram crosses its column |
| 1280x720 | 1280-04-river.jpg | river | `?autoplay=1&theme=2&seed=5`: Riverbend, riding a lashed log raft past lily pads |
| 1280x720 | 1280-05-theme.jpg | theme | `?autoplay=1&theme=5&seed=3`: Critter Core, threading between a tram and a box truck |
| 1280x720 | 1280-06-results.jpg | results | results card (Snatched by the hawk) after idling a manual run |
| 390x844 | 390-01-title.jpg | title | title menu, portrait |
| 390x844 | 390-02-early.jpg | early | autoplay on Meadow Roads, a car passing behind the critter |
| 390x844 | 390-03-traffic.jpg | traffic | Downtown Trams: a train and a tram passing just ahead |
| 390x844 | 390-04-river.jpg | river | Riverbend, riding a log between two rafts |
| 390x844 | 390-05-theme.jpg | theme | Critter Core, box truck passing alongside |
| 390x844 | 390-06-results.jpg | results | results card, portrait |
| 1440x900 | card-2x.jpg | card | autoplay mid-crossing on Meadow Roads: taxis, box trucks, logs and trams |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- Autoplay (`?autoplay=1`) now plans with exact look-ahead (`src/game/autopilot.ts`): it waits at the kerb for a real gap, lines up a column, hops straight through two-lane roads when the timing allows, rides logs and hops off before the edge. Real GPU: 3 runs of ~70 s (Downtown Trams, Neon District, default), 0 deaths, 222-248 rows, ~60 fps, no page errors.
- Headless (tests/autopilot-sim.test.ts, 42 runs over seeds and all 6 themes, 120 s cap): median row 426, 1 death (row 426). Before: median row 45, 41 of 42 runs died, the first at row 6.
- Road and tram lanes always leave a spot clear for at least 0.3 s between movers (late-game roads used to leave about 0.16 s, less than one hop through the lane, so nobody could cross them).
- Critter, vehicles and logs grounded; wheels on the pool wheels; critter readable at both viewports.

## Known issues

- Two neighbouring road lanes with nearly equal speed and direction can stay out of step for a long time late in a run (row 350+); the autopilot then waits about 7 s and takes the best gap, which can end in a squash (1 in 42 simulated runs).
- Engine: TypedGLBActor part() lookup returns undefined for model nodes in production (packages/engine; game works around it).

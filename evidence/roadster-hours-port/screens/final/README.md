# Saltwind Highway: final screenshots (2026-11-19)

Route: `/apps/saltwind-highway/` (app `apps/showcase-roadster-hours-port`, source `examples/roadster-hours-port`).

**Runner:** headed Chrome on a real GPU (Apple Metal) via REA, production build from the QA snapshot. Title from the plain URL; play from `?autoplay=1` (autostart + autopilot + results-to-next-route loop; I toggles autopilot), Halo via `&level=2`. The 390 frames were retaken on 2026-11-19 in the same headed Chrome on the real GPU over CDP (`Page.captureScreenshot`, 390x844, dpr 1) after the portrait HUD fix.

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | Sunbreak Coast route card with the controls list |
| 1280 | 02-early | coastal highway after the first lineup |
| 1280 | 03-close-pass | threading past a semi in the city act |
| 1280 | 04-relay | Terrace approach, relay 4 of 5 |
| 1280 | 05-redline | Redline Canyon, lineup cleared under the car |
| 1280 | 06-halo | Halo Skyway maglev-tube rings |
| 390 | 01-title .. 05-halo | the same route on a phone viewport |
| 1440 | card | close pass in the city act |

## Checked in the frames

- Full autoplay run of all three routes (frame every ~3 s, every frame read) plus 50 ms screencast bursts on the Sunbreak ramp lip, the Redline inversion and both vents.
- Chase camera: no dip over the Sunbreak ramp lip (~19 s), never inside the Redline canyon wall on the inversion, clear of relay bars, Halo rings, lineups, traffic and vents (unit-tested along every route's autopilot run).
- Driver seated with legs inside the cockpit (no feet under the car on jumps); treaded tyres visible and rolling; vent columns only drawn while they blow.

## Known issues

- none. 390 px HUD (retaken 2026-11-19): the event toast and the coach share one line above the dash (the toast hides the coach while it shows), the route bar docks above the dash, the countdown digit sits above the car; live rects sampled every 1.5 s through an autoplay run, with and without `?touch=1`, showed no overlaps.

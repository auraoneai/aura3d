# Apex Overdrive: final screenshots (2026-11-19 retake)

Route: `/apps/showcase-roadster-rush/` (app `apps/showcase-roadster-rush`).

**Runner:** headed Chrome on a real GPU (Apple Metal) via REA, production build from the QA snapshot. Title from the plain URL; play from `?seed=42&autoplay=1`; night from `?seed=7&autoplay=1&tod=night`.

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | title card over the sunset freeway |
| 1280 | 02-early | 11 s into an autoplay run, bolt chain ahead |
| 1280 | 03-traffic | weaving traffic: SUV, pickup, van alongside |
| 1280 | 04-shield | shield bubble, box van passing |
| 1280 | 05-boost | boost with wingtip vortices through dense traffic |
| 1280 | 06-night-carrier | night: riding a carrier deck past a city bus |
| 1280 | 07-night-traffic | night traffic, box truck and SUVs |
| 390 | 01-05 | title, early, traffic, shield, night on a 390 x 844 phone |

Card: `card-2x.jpg` (1440x900, autoplay at 13 s under the SKYWAY gantry) and `card-1x.jpg` (720x450 LANCZOS).

## Checked in the frames

- Wheels turn about their hubs: the Idol wheel GLBs have their origin at the tyre bottom, so every wheel instance is now offset by -R*(S*centre) (`src/render/idolWheels.ts`, hero path in `src/main.ts`); drawn spin capped at 18 rad/s (no strobing), see-through spoke-blur disc keeps the tyre ring visible.
- Carrier tractor: the spinning overlay tyres now sit on the skewed, off-centre baked tyres (per-side hub z and axle centre, `src/render/idolFleet.ts`).
- Grounding, readability of the hero and traffic, no page errors.

## Known issues

- None open from the Nov 19 pass. The autoplay pilot now plans ~2 s ahead (`src/native/autopilot.ts`): 0 wrecks in a
  3-minute real-GPU `?autoplay=1` run (9.7 km), and the unit test holds it to at most one wreck per 3 simulated minutes.
  On a forced sign wreck the chase camera rises over the gantry instead of entering it (`src/render/cameraClearance.ts`,
  checked in real-GPU screencast bursts). The frames above were captured before these fixes; they are unchanged by them.
- Results card not in this retake (autoplay shows Wrecked! ~3 s then restarts).

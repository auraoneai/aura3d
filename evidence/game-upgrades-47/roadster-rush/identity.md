# Apex Overdrive (roadster-rush): identity sheet, GU47 WP-12 "Blue-hour skyway"

Lane G02. Look table: `apps/showcase-roadster-rush/src/art/look.ts`; art direction: `apps/showcase-roadster-rush/src/art/direction.ts` (audit record `direction.audit.json` beside it); VFX pack: `apps/showcase-roadster-rush/src/art/vfx.ts`. Frames, budget measurements and judge results are phase 2.

## Fantasy

An elevated five-lane skyway between glass tower tops in the last minutes of sunset, haze 25 m below the deck, a low tangerine sun dead ahead backlighting traffic under a cobalt-to-violet zenith. The only racer set in the air above a city.

## Palette

| Role | Hex | Use |
|---|---|---|
| Primary: charcoal | `#22232a` | deck, barriers, pylons, tower glass in shadow |
| Primary: tangerine | `#ff8a3d` | sun band, corona, hero stripe, impact sparks |
| Primary: cobalt | `#1f3fa8` | zenith, hero paint, tower glass reflections |
| Accent: cyan | `#4df0ff` | player and sky lane only (wake, beacon rings, rocket) |
| Reserved: rival red | `#ff2a3c` | sky-lane interceptors only (halos, trails, sky-dodge burst) |
| Night: sodium | `#ffb04a` | pole lamps, sodium spot pool, landing sparks |
| Night: tail light | `#ff3a2a` | brake bars and tail-light rivers |
| Pickup gold | `#ffc61f` | bolts |

No magenta anywhere (the old `#ff2a6d` trim and `#ff3f86` / `#ff5c88` dusk stops are gone; the look-table unit test rejects magenta).

## Variants (time of day, one look-table row each)

| Variant | Sim time of day | URL | Sky | IBL | Sun (el / az / colour / intensity) | Env | Fog colour (near/far 43/257) |
|---|---|---|---|---|---|---|---|
| sunset (boot) | 0 | `?seed=42&capture=1` (`&tod=sunset`) | custom blue-hour dome | `industrial_sunset_puresky` 1k, rotated 205 deg | 7 / 175 / `#ff9a4f` / 3.1 | 1.0 | `#c98a6a` |
| dusk | 0.5 | `&tod=dusk` | dome (cobalt deepens, tangerine band thins) | same, env 0.55 | 3.5 / 175 / `#ff6a3a` / 1.7 | 0.55 | `#4a4778` |
| night | 1 | `&tod=night` | dome (navy, stars, sodium city glow) | same, env 0.18 | 3.5 / 175 / `#8ea4d8` / 0.35 (moon) | 0.18 | `#151a2c` |

The HDRI is IBL only (`background: "sky"`): the visible sky is the authored dome, so this game has no primary-sky HDRI for the `look-identity` duplicate check. Other games that list `industrial_sunset` (G03 dust-storm sunset, G05, G10, G14, G21, G24) use it as their visible or primary environment; Apex uses it as a secondary reflection source at rotation 205 deg and intensity 1.0/0.55/0.18, which no other game declares.

## Signature effect

"Backlit skyway traffic above a haze floor": the sun sits dead ahead at 7 deg, so every car is rim-lit against a tangerine band, while the ground is a haze-floor shader 28 m below the deck with lit window specks that brighten toward night. It survives every tier: on Low the post stages go (no god rays, no motion blur, no DOF) but the dome, haze floor, palette and backlight stay.

## Distinctness (PRD §6.1 racing group)

- G03 heatsink: soot/molten amber at night in rain, refraction haze. Apex: tangerine/cobalt sunset in the air, no rain.
- G04 teleoperator: marine fog, LiDAR pulse. Apex: no ground fog at deck level; haze is 25 m below.
- G18 drift-and-deliver: wet asphalt street level, beacon pillar. Apex: elevated, no street.
- G21 last-train: rail, lanterns, apricot/rose. Apex: road traffic, cobalt zenith.
- G22 roadster-hours (Saltwind): salt flats, sea teal, crosswind spray. Apex: city towers, haze floor.
- Sibling judge vs Saltwind, Thermal Drift, Grid Dispatch: phase 2 (AO-PF1).

## Budget row

Desktop dense <= 230 draws, phone <= 190, Low <= 184; S4 god rays and S7 motion blur High only; textures <= 2048 px. Before: 114-175 desktop, 108-159 phone (`budget.json`). After: phase 2.

## Before / after frames

Phase 2 (remote capture `RUN_ID=gu47-roadster-rush-<before|after>`).

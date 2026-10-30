# Saltwind Highway (roadster-hours-port) identity sheet, GU47 WP-32

"Wind-scoured maritime road trip": three hours of one day on an Atlantic coast highway. The only racer with sea, coastal haze and wind-borne spray. Source of every number: `examples/roadster-hours-port/art/look.ts` (`SALTWIND_LOOK`); art direction `examples/roadster-hours-port/art/direction.ts`.

## Palette

| Role | Hex | Use |
|---|---|---|
| Salt white | `#e9e4d6` | haze band, limestone, gate flares, Sunbreak gantry frame, HUD panels |
| Sea teal | `#12606e` | Atlantic body, Redline river |
| Ochre | `#c9a25e` | cliffs, dry grass, data-cell pickups |
| Signal red (only accent, reserved objective) | `#c8321f` | relay gantry glow, nitro trail, finish light, Halo beacons |

Halo is blue hour over a mercury-white and sea-glass city carpet (`CITY_FRAGMENT` in `shaders.ts`) with red beacons: no amber, no neon (unit-tested in `tests/unit/roadster-hours-port/look47.test.ts`).

## Variants (target `roadster-hours-port--<id>`, `?level=0..2`; `?look=original` = today's look)

| Route | Time of day | Sun (elev / az / colour / intensity) | Fill | IBL (reflections only) | Visible sky | Post |
|---|---|---|---|---|---|---|
| sunbreak | 4 pm side sun through salt haze | 20 deg / -62 deg (over the sea) / `#ffe2b0` / 3.4 | sea bounce `#8fc6c4` 0.55 | `belfast_sunset_puresky` 0.55, rot 300 deg | custom dome: two wind-driven cloud layers, salt-haze band on the sea side | bloom 0.3 / 1.1, sun flare |
| redline | last light, heat shimmer | 7 deg / -30 deg / `#ff9a5a` / 3.8 | violet rim `#8a72c8` 0.85 | `industrial_sunset_puresky` 0.5, rot 330 deg | custom dome, warm horizon band | bloom 0.45 / 1.0, grain 0.06, heat shimmer beyond 40 m, flare |
| halo | blue hour over the city carpet | 24 deg / 25 deg / `#a9bce8` / 0.6 | city-glow hemisphere + 2 cool gantry points `#cfe6ff` | `rooftop_night` 0.4, rot 40 deg | indigo dome with an all-round city-glow band | bloom 0.8 / 0.9, auto-exposure |

All three: one shadowed key with 3 PCSS cascades over 260 m (1 cascade, PCF on Low), a contact blob under the roadster, no ambient light. The custom dome is the visible sky on every route (`background: "sky"`), so the route HDRIs are secondary IBL-only uses (PRD §6.1: listed here with rotation and intensity).

## Signature effect

Crosswind salt spray: sheets of spray lift off the sea-side cliff base and blow across the highway with the route wind (salt `#eef1ee` at 9 m/s on Sunbreak, sand `#e2b88a` at 7 m/s on Redline, mist `#c9dbe6` at 5 m/s on Halo). One points draw of 1,400 stateless particles (`art/spray.ts`); half density and half drift on reduced motion; half density on Low.

## References

1. Atlantic coast road in late-afternoon side light: bleached limestone and ochre cliffs, teal sea with surf lines, a red-white lighthouse.
2. Desert canyon highway at last light: a 7-degree orange sun, violet rim on the far side, heat shimmer beyond 40 m, blown sand.
3. Elevated city expressway at blue hour: indigo zenith, pale city-glow band, mercury-white and sea-glass city carpet, red beacons.

## Budget row

<= 170 draws on every route at 1280x720 and 390x844 (106-152 before), <= 900k tris, <= 12 MB transfer, <= 24 MB new textures at 1k, <= 12 programs, <= 2,000 particles; replay still ends at 48.325 s. Before/after rows: `budget.json`.

## Phase 2 (not in this file yet)

Before/after card frames per route, the measured budget row, and the sibling judge against the seven other racers (RH47-18: same_game false >= 0.8 in >= 5 of 6 per pair).

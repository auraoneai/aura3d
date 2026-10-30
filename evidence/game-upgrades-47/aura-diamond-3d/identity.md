# Aura Diamond 3D identity sheet (GU47 WP-18, lane G08)

"Six postcards of summer baseball": warm broadcast-TV film stock, real mown turf, terracotta clay, chalk lines, a
visible horizon, and one hour, one sky and one HDRI per ballpark. Source of every number below:
`apps/showcase-aura-diamond-3d/art/look.ts` (look table) and `art/direction.ts` (art direction). All visuals are
software WebGL2 captures in phase 2; nothing here is measured yet.

## Palette

| Role | Hex | Swatch |
|---|---|---|
| Turf green (primary) | `#3d7a35` | mown outfield |
| Terracotta clay (primary) | `#b4623c` | infield dirt, mound |
| Chalk (primary) | `#e8e2cf` | foul lines, boxes |
| Dugout shade (primary) | `#24302a` | shadow side, dugouts |
| Accent | `#f2a93b` | broadcast bug, HR beat |
| Reserved objective | `#f5f1e4` | the ball, and only the ball |

Per-park accents (HUD and wall caps): Harbor `#f08a4b`, Midtown `#4fc3e8`, Canyon `#e3b448`, Ivy `#6fbf6a`, Dome
`#8f83f2`, Lunar `#c3cbd8`.

Distinctness: `tests/unit/aura-diamond/look.test.ts` asserts that no hex of the look table or the palette appears anywhere
in `apps/showcase-aura-hoops-3d/`, and that the three backdrop hexes copied from Hoops are gone from the app folder.

## Variants (target `aura-diamond-3d--<park>`, URL `?park=<park>`)

| Park | Postcard | Time of day | Sun el/az | Key | HDRI (IBL) | Visible sky | Fog | Post preset / operator |
|---|---|---|---|---|---|---|---|---|
| sandlot | Harbor Sandlot at last light over the water | last light | 9 / 250 | `#ff9a52` 2.5 | belfast_sunset_puresky 0.9 | Preetham, turbidity 6.5 | sea haze exp2 0.0032 `#e7b58b` | cinematic-film / agx |
| skyline | Midtown Skyline in rain-wet blue hour | blue hour after rain | 52 / 150 | `#9fc2ff` 0.55 | rooftop_night 0.5 | HDRI | wet blue haze exp2 0.0045 `#1c2c44` | neon-night / aces |
| canyon | Canyon Rim at hard desert noon | high noon | 72 / 20 | `#fff6e6` 3.6 | outdoor-midday 1.1 | bleached gradient | dust + height fog `#d7c4a6` | daylight-outdoor / aces |
| ivy | Ivy Classic at spring sunrise | spring sunrise | 24 / 110 | `#ffd2a1` 2.3 | spruit_sunrise 0.95 | HDRI | light mist exp2 0.003 `#e6d9c8` | daylight-outdoor / agx |
| dome | Typhoon Dome in a storm | storm outside, truss lights | 74 / 30 | `#e9f1ff` 1.6 | hangar_interior 0.7 (background 0.85) | HDRI | exp2 0.004 + god rays (High) | arena-fight / aces |
| lunar | Lunar Park under a black sky, Earth rising | lunar day | 18 / 300 | `#f4f1ea` 3.4 | deep_space_starfield 0.15 | black gradient + 1,800 stars | none | space / aces |

`?look=original` keeps the 4.6.2 look of every park; `?sky=hdri` draws the HDRI instead of the analytic sky (DIA-E2 A/B);
`?tier=low|medium|high` forces the quality tier.

Primary visible environment (look-identity): the boot park's analytic sky (`environment.background: "sky"`, HDRI
`belfast_sunset_puresky` for light only). Secondary IBL-only uses: belfast_sunset_puresky at 0.9 (Harbor), outdoor-midday
at 1.1 (Canyon, the analytic gradient is the visible sky), deep_space_starfield at 0.15 (Lunar). Shared catalogue ids with
the Sports group (PRD 6.1): Hoops lists belfast_sunset, outdoor-midday, rooftop_night and starfield; WP-38 resolves any
primary-sky clash, and Diamond's Harbor, Canyon and Lunar skies are authored sky nodes.

## Signature effect

`bat-crack splinter flash`: at bat contact, ash splinters (`debris-chips` atlas sprite) leave the barrel, a white-hot
contact flare and a few spark streaks fire, and a 0.1 s light kicks the batter (preset `diamond-bat-crack`,
`art/vfx.ts`). Per-park splinter and flash colours; one-sixth gravity on the Moon. Survives every tier; reduced motion
halves the particles, reduced flash drops the light and caps the flare at 0.3.

## Budget row (PRD WP-18)

<= 450 draws at 1280x720 and <= 260 at 390x844 in every park; <= 1.2M triangles; steady heap <= 300 MB; route transfer
+12 MB max, each park loads only its HDRI; effects <= 96. Before/after numbers: `budget.json` (after: phase 2).

## Before/after frames and distinctness results

Phase 2 (remote runner): steady-state 25 s and 60 s shots per park, before (4.6.x) and after; sibling judge vs Hoops,
FC, Links, Top Tennis (`same_game` false in 4 of 4); 15 park pairs read as different venues (>= 14 of 15).

# Cross Hop identity sheet (GU47 WP-24, lane g14)

Fantasy: a handmade tabletop toy diorama through a tilt-shift lens. Felt meadows, painted-wood logs, clay critters and lacquered toy cars on bevelled tiles under one low sun. The six themes are a day clock.

Art direction: `apps/showcase-cross-hop/src/art/direction.ts` (audit record `direction.audit.json` beside it). Look table: `apps/showcase-cross-hop/src/game/look.ts`. VFX pack: `apps/showcase-cross-hop/src/game/vfx.ts`. `?look=original` shows the 4.6 look.

## Palette

| Role | Name | Hex |
|---|---|---|
| primary | chalk mint | `#a8dcc4` |
| primary | butter yellow | `#f4dc8a` |
| primary | terracotta | `#c8693f` |
| primary | slate | `#4f5d6b` |
| accent and objective | coin gold | `#ffc531` |

## Variants (day clock)

| Theme (`?theme=`) | Time of day | HDRI (IBL only) | Sun elev/az, colour, intensity | Gradient sky zenith / horizon | Fog | Post preset | Ambient |
|---|---|---|---|---|---|---|---|
| 0 Meadow Roads | crisp dawn | `spruit_sunrise` | 18/220, `#ffd2a1`, 2.6 | `#7fa6cf` / `#f3d2b4`, light clouds | `#b9cfe0` 0.012 height | daylight-outdoor | pollen |
| 1 Downtown Trams | overcast noon | `autumn_field_puresky` | 55/30, `#f4f1ea`, 2.2 | `#9fb0c2` / `#dfe3e6`, light clouds | `#d8d4c6` 0.013 | daylight-outdoor | none |
| 2 Riverbend | amber golden hour | `venice_sunset` | 10/250, `#ffb064`, 2.8 | `#5d78a6` / `#ffb977` | `#e8b98a` 0.013 | cinematic-film (DOF replaced by the tilt-shift node) | fireflies |
| 3 Emberline | red lava-lit dusk | `industrial_sunset_puresky` | 6/280, `#ff7a4a`, 1.8 | `#2c2240` / `#d2553a` | `#6b3a34` 0.014 | arena-fight, bloom 0.5 / 0.75 | embers, 12 lava lamp points |
| 4 Neon District | blue-black lamplit night | `rooftop_night` | moon 35/340, `#9fb4ff`, 0.35 | `#070b1a` / `#1c2a4a`, 1,400 stars | `#1a2440` 0.016 | neon-night | rain, 12 sodium/cyan lamp points |
| 5 Critter Core | pastel studio toybox | `studio_small_08` | 50/25, `#fff4ea`, 2.4 | `#bfd8f2` / `#fbe3ee` | none | product-studio | confetti |

Fill on every theme: a hemisphere light (no ambient, no rim). The primary visible environment is the gradient sky (`background: "sky"`); the HDRIs light only. Several of these HDRIs are also primary skies in other games (spruit_sunrise: G03, G05, G06, G08, G10, G25; venice_sunset: G01, G05, G07, G18; rooftop_night: several): here they are IBL-only with their own rotation (220, 30, 250, 280, 340, 25 degrees) and intensity, which PRD §6.1 allows for secondary uses.

## Signature effect

"tilt-shift diorama + day clock": a tilt-shift DOF band that follows the player row every frame, and a sun that sweeps with progress inside each theme (azimuth +6..+14 degrees over 25 rows) and blends its key toward the next theme over the last 5 rows. Low tier: the post tier drops DOF; the moving sun, palette and gradient sky remain. Reduced motion: no DOF, camera moves become cuts, squash at 30 %, particles halved.

## Distinctness (phase 2)

Sibling judge vs Pip's Big Leap, Chroma Roll, Serpentine, Cumulus Dash: phase 2. Pip's also uses a miniature DOF; Cross Hop differs by the top-down tilt-shift band over traffic lanes, the six-step day clock and the felt/lacquer toy surfaces.

## References

Generic, reference-only: tilt-shift photography of towns and model railways; felt-and-clay stop-motion tabletop sets lit by one low sun; lacquered wooden toy cars and trains on play tiles.

## Before / after frames and budget

Before: 4.6 build, PRD WP-24 "Today" line (145-165 draws, textureBytes 284.8 MB, theme0 mean 101-108). After: phase 2 (`budget.json`).

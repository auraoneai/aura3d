# Aura Hoops 3D identity sheet (GU47 WP-17 "Blacktop World Tour")

Summer-league streetball shot like a late-night mixtape broadcast: asphalt and acrylic, chain-link fences, sodium floods, spray paint, rain, a low long-lens sideline camera. Source of truth: `apps/showcase-aura-hoops-3d/art/direction.ts` (audited by `tests/unit/aura-hoops/art-direction.test.ts`) and the look table `apps/showcase-aura-hoops-3d/src/courtRigs.ts`.

## Palette

| Role | Hex |
|---|---|
| Charcoal asphalt | `#23262b` |
| Sodium flood | `#ffb347` |
| Chain-link steel | `#8a9199` |
| Squad accent | the home kit colour (default `#ff7a1a`) |

## Variants (`?court=<id>`; `?look=original` keeps the 4.6 look)

| Court | Time of day | HDRI (E-A catalogue) | Sun elev/az | Post preset | Practicals | Weather | Surface |
|---|---|---|---|---|---|---|---|
| rucker | blue hour under sodium floods | `belfast_sunset_puresky` | 7 / 250 | cinematic-film + grain | 4 sodium spots | none | cracked asphalt |
| venice | sun behind the backboard | `venice_sunset` (+ Preetham sky) | 5 / 185 | daylight-outdoor | none | none (ocean water) | bleached teal acrylic |
| athens | hard white noon | `outdoor-midday` (+ Preetham sky) | 64 / 150 | daylight-outdoor | none | none | blue-white acrylic |
| manila | tungsten under a corrugated roof | `indoor-workshop` | 62 / 20 | cinematic-film + grain | 6 tungsten bulb clusters (12 bulbs) | rain curtains outside the canopy | painted concrete |
| shanghai | wet neon night in rain | `rooftop_night` | 48 / 220 | neon-night | 3 sign rect lights | court rain (120 streaks), wet ground, lightning every 40 s | wet asphalt |
| orbit | starlit deck lit by Earth-shine | `deep_space_starfield` | 24 / 191 | space | 4 rib rect lights | none | polished composite |

## Signature effect

`spray-tag decal under the rim after a Jam dunk` (fades over 20 s, at most 8 live tags). The only sports game with rain.

Frames and judge results: phase 2.

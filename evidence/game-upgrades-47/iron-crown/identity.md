# Iron Crown identity sheet (GU47 WP-15 "The Royal Forge")

A theatrical tournament fighter in black iron, molten gold and ember crimson: one hard overhead follow-spot through smoke or dust, fighters rimmed in their own colour on a reflective floor, sparks and embers, letterboxed intro and K.O. cinematics.

Sources: `apps/showcase-iron-crown/src/art/direction.ts` (art direction), `apps/showcase-iron-crown/src/game/look.ts` (`STAGE_LOOKS`, one row per venue), `apps/showcase-iron-crown/src/game/vfx.ts` (ic-* preset pack).

## Palette

| Role | Hex |
|---|---|
| Black iron (primary) | `#0e0b0d` |
| Molten gold (primary) | `#d9a441` |
| Ember crimson (primary) | `#9e1b22` |
| Reserved objective (SUPER meter, crown pips, special burst) | `#ffe08a` |

One accent per venue:

| Venue | Accent |
|---|---|
| Crown Arena | `#ff4d1f` forge ember |
| Neo-Tokyo Rooftop | `#ff3fa4` magenta |
| Lantern Dock Market | `#36c9a4` jade |
| Colosseum Ruins | `#e3b04b` ochre |
| Dustline Airstrip | `#3f8cff` runway blue |
| Cloudstep Monastery | `#8fe3ff` ice |

## Variants

| Venue (target `iron-crown--<id>`) | Time of day | HDRI (E-A catalogue) | Background | Key | Post preset | Floor |
|---|---|---|---|---|---|---|
| `crown-arena` (boot) | forge-smoke night, enclosed | `warm_bar` at 0.25 | black iron (HDRI not drawn) | overhead follow-spot, PCSS | `arena-fight` + grain | obsidian with gold inlay, SSR mirror at High |
| `neo-tokyo-rooftop` | midnight rain | `rooftop_night` | HDRI | sodium flood, 52 deg, PCF; magenta and cyan rect panels | `neon-night` | wet concrete, SSR mirror at High |
| `bangkok-dock` | dusk over water | `venice_sunset` | HDRI | sun 8 deg | `cinematic-film` | oiled teak |
| `colosseum-ruins` | harsh-noon dust | `outdoor-midday` | HDRI | sun 72 deg | `daylight-outdoor` | packed sand |
| `desert-airbase` | sunset heat haze | `industrial_sunset_puresky` | HDRI | sun 10 deg | `cinematic-film` | sun-baked tarmac |
| `himalayan-monastery` | cold dawn snow | `spruit_sunrise` | HDRI | sun 18 deg | `daylight-outdoor` | frosted slate |

Every venue: two back rims in the fighters' own emissive colours, no look rim, fill from the environment only. Far backdrops (IC47-W1) on the five open-air venues.

## Signature effect

"Single follow-spot chiaroscuro: one hard overhead spot through forge smoke holds the pair on black iron, with letterboxed intro and K.O. cinematics." (`signatureEffect` in the art direction; unique among live games.)

## Distinctness (PRD §6.1)

- Fighting genre neighbours: no other live game uses the black iron / molten gold / ember crimson triad or a single overhead follow-spot as its key.
- The six HDRIs are distinct from each other (look.test.ts) and the boot venue's `warm_bar` is enclosed (not the visible sky).
- Results of the `look-identity` check and the sibling judge: phase 2.

## Frames, judge results, budget

Before/after card frames, judge results and measured budget rows are phase 2 (see `budget.json` for the before rows and the expected draw deltas).

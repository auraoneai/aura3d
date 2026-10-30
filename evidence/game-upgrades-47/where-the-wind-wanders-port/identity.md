# The Bellkeeper's Walk (where-the-wind-wanders-port): identity sheet

GU47 WP-33, lane g23. "Storybook gouache valley where the wind is a character." Phase-1 sheet: frames, card images and judge results are added in phase 2.

## Palette

| Role | Hex |
|---|---|
| Sage grass (primary) | `#8fae6a` |
| Slate-teal sea (primary) | `#3f7f86` |
| Apricot light (primary) | `#ffc58a` |
| Brass bell (accent) | `#d9a441` |
| Wax-seal red (reserved objective: letters) | `#b8432f` |

## Variants (one continuous day; `?found=0..3|epilogue`, look table `examples/where-the-wind-wanders-port/daylight.ts`)

| Variant | Story beat | Clock | Sun elevation / azimuth (from south toward west) | Key colour | Sky |
|---|---|---|---|---|---|
| found0 | start | 15:30 warm afternoon | 34 / 62 | `#ffe4bf` | a3d_sky painted dome, blue-cream gradient |
| found1 | one letter | 16:30 | 28 / 64 | `#ffd9a8` | same dome, warmer horizon |
| found2 | two letters | 17:30 apricot light | 22 / 66 | `#ffc58a` | apricot horizon, first lantern glow |
| found3 | three letters | 18:30 golden hour | 16 / 68 | `#ffb26a` | gold horizon, height fog over the sea |
| bell | bell rung | 19:40 lilac dusk | 6 / 70 | `#ff9c74` | lilac sky, first stars, lanterns full |
| epilogue | voyage | 21:30 moonlit | moon 38 / -40 | `#b4c4ff` | night dome, full star field |
| original | `?look=original` | 4.6 midday | 53 / 51 | 4.6 constants | 4.6 sky |

Environment: the primary visible environment is the painted a3d_sky dome (no HDRI background). `kloppenheim_06_puresky` (`/hdri/kloppenheim_06_puresky_1k.hdr`) is an IBL-only fill for the GLBs at 0.55, background off, scaled per key (0.55 to 0.16). Secondary-use note for `look-identity`: G16 splat-rush-port also lists kloppenheim_06 as IBL-only for its GLBs; G12 slingshot-siege lists a kloppenheim_06 2k file; this game never shows it as a background.

## Signature effect

Visible wind: cloud shadows (up to 0.35 off the sun term) and gust bands rolling downwind (from the west-southwest) across the sage grass, mirrored by petals and seeds streaming along the wind; one continuous day moves from afternoon to lilac dusk with each letter. Model: `examples/where-the-wind-wanders-port/wind.ts`.

## Distinctness (PRD §6.1, arcade group G12, G13, G23)

- Dot Dash 3D (G13): dark neon circuit boards under a desk lamp at night. This game: open daylight valley, no neon.
- Duneglide / silt-and-signal-port (G24): textured canals, night chapters. This game: one continuous day arc, untextured painted surfaces.
- Slingshot Siege (G12): six chapters through one day by the sea with miniature DOF. This game: no DOF in play, the wind is the signature, sage-and-apricot palette.
- Cloud Runner (G25): mid-morning after rain. This game: late afternoon to dusk.

## Budget row

High <= 54 draws (17 today), <= 450k tris, GLB <= 10 MB (8.4 MB today), JS +15 KB max; Low <= 28 draws with no shadows, god rays, particles or paper pass. Rows in `budget.json`.

## Before/after frames and distinctness results

Phase 2 (captures on the remote runner; sibling judge vs dot-dash-3d, silt-and-signal-port, cloud-runner-port).

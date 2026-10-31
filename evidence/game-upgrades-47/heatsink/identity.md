# Thermal Drift (heatsink) identity sheet, GU47 WP-13 (G03)

Fantasy: a combat-drone race through a foundry megacity seen through heat. Genre group: racing (G02, G03, G04, G15, G18, G19, G21, G22, G24). Art direction: `apps/showcase-heatsink/art/direction.ts`; look table: `apps/showcase-heatsink/src/look.ts`; VFX pack: `apps/showcase-heatsink/src/vfx.ts`.

## Palette

| Role | Name | Hex |
|---|---|---|
| primary | soot | `#14110f` |
| primary | oxidised iron | `#3a2a22` |
| primary | molten amber | `#ff8a1f` |
| primary | slag red | `#d2361c` |
| accent / reserved objective | coolant cyan (pickups, shields, the cooling HUD only) | `#35d6ff` |

Coolant cyan no longer colours road spines, wall chevrons or horizon bands (today's MEGACITY and VESPER used it as a circuit accent); a unit test (`tests/unit/heatsink/look.test.ts`, `vfx.test.ts`) keeps it off the warm accents and every burst but the coolant pickup.

## Variants (one per circuit; `?circuit=` param, E-I targets `heatsink--default`, `heatsink--dustfall`, `heatsink--vesper`)

| Circuit | Time of day | Sky / environment (E-A catalogue, `/hdri/<id>_1k.hdr`) | Key (colour, elevation/azimuth deg, intensity) | Fog | Weather |
|---|---|---|---|---|---|
| MEGACITY (`grand`, default) | rain-wet sodium night | `kloppenheim_02` 0.8, background on (GU47 phase 3; was `rooftop_night`, the primary sky of top-tennis) (primary visible environment) | `#ffb070` 28/120 1.6 | `#2a1d14` 0.011 | rain + wet road |
| DUSTFALL (`dustfall`) | ochre dust-storm sunset, 9-degree burnt sun | `industrial_sunset_puresky` 0.9, background on | `#ff9a4a` 9/35 2.6 | `#8a5a2e` 0.02 + volumetric god rays | dust field |
| VESPER (`vesper`) | violet pre-dawn, lit from below by vents | `spruit_sunrise` 0.7, background on | `#b9a4ff` 18/300 1.0 + vent up-fill `#ff7a2e` | `#2a2348` 0.008 | rising embers |

All three: one shadowed key (PCSS, 3 cascades), unshadowed coolant counter-rim 0.35 opposite the key, IBL fill (no ambient), warm bloom 0.55 / threshold 0.8, vignette 0.28; film grain on MEGACITY only.

Shared HDRIs (PRD §6.1 last paragraph): `rooftop_night` is also listed by G01, G05, G06, G07, G08, G10, G14 and G21; `industrial_sunset_puresky` by G02 (IBL), G05, G10, G14, G21 and G24; `spruit_sunrise` by G05, G06, G08, G09, G10, G12, G14, G24 and G25. The `look-identity` check hashes only the primary visible environment (`rooftop_night` here, the boot circuit); WP-38 resolves duplicates (G03 is listed before G21 in the racing group). DUSTFALL and VESPER differ from every other use by rotation (35 and 300 degrees) and intensity (0.9, 0.7).

## Signature effect

Refraction heat haze (`apps/showcase-heatsink/src/heatHaze.ts`, HS-11): one before-tonemap shader pass bends the image inside up to 8 projected heat sources (drone exhausts, lava curtains, foundry vents) and runs a thermal edge ramp above 80% core heat. Reduced motion: static warm tint, no distortion. Low tier: half strength, no animated shimmer. Unique among live games: the only warm-key, heat-haze racer (G19 heatsink-port is an ion wake under an alien blue hour; G02 is backlit skyway traffic).

## Before / after frames, budget row, distinctness results

Phase 2 (captures, sibling judge vs heatsink-port, roadster-rush, kart-havoc; look judge). Before frames: `evidence/thermal-drift/audit-fix/final-g03w3/` (MEGACITY 1280 mean 31.5-46.8, darkFrac 0.25-0.39; card 26.9). Budget rows: `budget.json` beside this file.

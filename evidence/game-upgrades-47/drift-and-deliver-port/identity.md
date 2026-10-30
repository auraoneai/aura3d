# Gridlock Courier (drift-and-deliver-port): "Last shift on the harbour"

GU47 WP-28, lane g18. A pastel hillside port town just after summer rain. The 3:00 shift runs the sun down from golden light to sunset to blue hour. The streets are wet charcoal and the puddles mirror the sky; sodium lamps and shop windows come on block by block.

Look table: `examples/drift-and-deliver-port/phases.ts` (`PHASES`). Art direction: `examples/drift-and-deliver-port/art/direction.ts`. VFX pack: `examples/drift-and-deliver-port/fx.ts`.

## Palette

| Role | Hex |
|---|---|
| Wet asphalt | `#2b2f36` |
| Terracotta | `#d9765f` |
| Mint | `#9fd8c4` |
| Cream | `#efe3cf` |
| Courier teal (reserved: car, drop-off beacon, minimap) | `#22c3c9` |
| Sodium (accent) | `#ffb347` |
| Tail red | `#ff3b3b` |

## Variants (time of day on the shift clock; `?at=<s>` pins it, `?look=original` keeps the 4.6.1 look)

| Variant | URL | Time of day | Key | Sky / environment | Fog (harbour mist) |
|---|---|---|---|---|---|
| golden | `?at=10` | golden hour after rain | sun 14 deg, az 36, `#ffc27a`, 4.4 | time-driven sky shader (warm top); venice_sunset 1k IBL, 1.0 | `#c9d6dc`, 0.0019 |
| sunset | `?at=120` | sunset | sun 4 deg (key 12 deg), `#ff9a52`, 3.3 | sky: rose horizon, saturated top; IBL 0.8 | `#b88c86`, 0.0022 |
| bluehour | `?at=170` | blue hour | moon fill 38 deg, `#9fb4ff`, 0.9 | sky: ink blue top, stars; IBL 0.35 | `#2a3550`, 0.0026 |
| original | `?look=original` | 4.6.1 fixed late afternoon | sun 21 deg `#ffbf80` | kloppenheim_06 tinted `#ffc890`, fixed peach dome | `#f0dcc0`, 0.0024 |

The HDRI is used for image-based light and reflections. The visible background is the game's own sky shader, so the art direction records `background: "sky"`. The venice_sunset sun sits at u = 0.600 in the 1k file, which is azimuth 36 deg, so the shift sun uses azimuth 36 deg and the environment needs no rotation. Only this game uses venice_sunset (PRD §6.1). G01, G05, G07 and G14 name it in their tables; WP-38 resolves duplicates.

## Signature effect

`delivery-beacon`: a 70 m courier-teal light pillar over the drop-off with an objective ring on the road. Its emissive strength rises as the sky darkens (1.6 golden, 2.0 sunset, 2.6 blue hour) so it stays above the sky at every phase. A delivery fires a ring burst with a teal flash and a camera punch. Under reduced motion or reduced flash it fires the calm variant: no punch, and the flash capped at 0.3 of peak. On the Low tier the pillar and ring stay; only the bloom halo goes.

## References

1. Mediterranean hillside port towns at golden hour after a summer shower (generic travel photography): terracotta, mint and cream stucco stepping down to a harbour, with wet streets mirroring a warm sky.
2. Blue-hour street photography of sodium-lit old towns: lamp pools and shop windows switching on against an ink-blue sky.
3. Arcade delivery and taxi games with a tall objective pillar readable over the rooftops.

## Budget row (WP-28)

Drive <= 130 draws (83 today), <= 1.3M triangles, <= 22 MB download, fps within 15% of 4.6.0, shadow-pass draws reported separately. See `budget.json`.

## Before / after card frames, distinctness results

Phase 2: remote captures (`@g9`..`@g15` rows `drift-and-deliver-port--golden|sunset|bluehour`), sibling judge against the 8 other racers (GC-PF2).

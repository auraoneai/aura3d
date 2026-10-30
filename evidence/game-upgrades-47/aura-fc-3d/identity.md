# aura-fc-3d identity sheet (GU47 WP-19, lane g09)

"Floodlight football in weather": European broadcast night football. Rain slants through steel floodlight banks into haze, wet turf throws back specular streaks, and a TV match package frames it. Sources: `apps/showcase-aura-fc-3d/art/direction.ts`, look table `apps/showcase-aura-fc-3d/src/game/look.ts`, VFX pack `apps/showcase-aura-fc-3d/src/game/vfx.ts`.

## Palette

| Role | Hex |
|---|---|
| primary: storm navy | `#14223a` |
| primary: wet emerald | `#1e5c40` |
| primary: cold flood white | `#e6eef6` |
| primary: steel slate | `#34465c` |
| accent (game, ball trail, HUD) | `#d8ff3e` lime |
| reserved objective | `#fdfdf6` |

## Signature effect

Rain slanting through steel floodlight shafts onto wet turf that throws back specular streaks, under a storm-navy night sky (Munich: `effects.rain` 3200 particles, `effects.volumetricFog` god rays at the main-stand flood, turf roughness 0.35 with the acg-grass005 normal map). Low tier: god rays go, the four light cones (0.5) and the rain remain as the cue.

## Variants (`?venue=<id>`, targets `aura-fc-3d--<venue>`)

| Venue | Time of day | Look preset | Sky / environment | Key | Weather | Post preset | Extra |
|---|---|---|---|---|---|---|---|
| munich | 21:30 storm night | night-city | sky colour `#0a1422`; night-2k IBL 0.22, rot 35, background off | main-stand flood PCSS 2048, 3.8, `#e4f0ff` | rain | arena-fight | haze shafts 0.35, rim `#8fc8ff`, lightning on goals |
| kyoto | 22:00 drizzle | night-city | sky colour `#120814`; cobblestone_street_night IBL 0.18, rot 210, background off | flood 3.4 `#ffe2d0` | drizzle | neon-night | CA 0.0015, magenta rim `#ff5fa2` |
| favela | 20:45 dry heat | night-city | sky colour `#140d07`; rooftop_night IBL 0.16, rot 120, background off | sodium flood 3.5 `#ffb066` | dust motes | arena-fight | grain 0.05, concrete cage |
| lagos | 18:40 copper sunset | golden-hour | golden-hour drawn sky; sun 8 / 250 | cascaded sun 2.4 `#ff9a52` | none | cinematic-film | soft unshadowed flood 0.9 |
| uyuni | 06:40 pale dawn | outdoor-day | spruit_sunrise drawn (background on), exposure -0.9 | low warm cascaded sun 7 / 100 | none | daylight-outdoor | mirror pitch planned (FC47-M3) |
| glacier | 23:00 polar night | polar-night | sky colour `#050b14` + `sky.dayNight({ hour: 23, starLimit: 120 })` star sky; night-2k IBL 0.2, rot 300 | flood 3.6 `#cfe8ff` | snow | cinematic-film | haze shafts 0.3, clearcoat ice, aurora rim `#7fe8c9` |

## HDRI uses and distinctness (PRD 6.1)

- Primary visible environment (audit record, Munich): the night sky colour plus a lights-only night-2k IBL (`background: "sky"`), so `look-identity` hashes no shared HDRI for this game.
- IBL-only (background off) secondary uses: rooftop_night (Favela, 0.16 at 120 deg) and cobblestone_street_night (Kyoto, 0.18 at 210 deg). Other games use these as drawn or brighter IBL; ours differ in rotation and intensity and never paint the sky.
- spruit_sunrise is drawn as the sky on Uyuni only (the PRD assigns it to this row); Uyuni's mirror pitch and -0.9 exposure separate it from the other spruit_sunrise users.
- Sports neighbours: top-tennis (G01) has no weather or shafts; aura-hoops-3d (G07) is asphalt and sodium with spray-tag decals; aura-diamond-3d (G08) is turf and clay with bat-crack flashes; aura-links-3d (G10) is a broadcast flyover. This is the only sports game combining night, weather, haze shafts and wet reflections.

## Phase 2 (to add here)

Before/after card frames per venue, the budget row (`budget.json`), crop metrics and the sibling-judge distinctness result.

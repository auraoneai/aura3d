# Shadowstep Gauntlet (ninja-runner-port): GU47 identity sheet

WP-30 "One evening, one run" (lane g20). Look table: `examples/ninja-runner-port/districtLook.ts`; light rig: `lighting.ts`; VFX pack: `vfx.ts`; art direction: `examples/ninja-runner-port/art/direction.ts` (audit record beside it). Every number is software WebGL2 until a real-GPU run exists.

## Palette

| Role | Hex |
|---|---|
| Indigo (primary, ink shadows) | `#2b3550` |
| Persimmon (primary, scarf, sparks) | `#d4553a` |
| Mist paper (primary, haze, spray) | `#e8e2d4` |
| Lantern amber (accent) | `#ffb45e` |
| Spirit cyan (reserved: pickups, power, spirit lights) | `#51dfff` |
| Ink line | `#1b2236` |

## Variants (time of day moves with distance)

| Variant (`?at=`) | Distance | Time of day | Key | Env (belfast_sunset_puresky 1k, IBL only) | Fog | Sky dome |
|---|---|---|---|---|---|---|
| village | 100 m | late afternoon, golden | sun 22 deg, `#ffc98a`, 2.7 | 1.0 | `#d8c6a4` 0.0026 | zenith `#5b7fa8`, horizon `#f0cf98` |
| rooftops | 700 m | vermilion sunset | sun 9 deg, `#ff9a5c`, 2.3 | 0.85 | `#e2a27e` 0.0030 | `#5e5a8c` / `#f2774a` |
| river | 1300 m | dusk, lanterns on | sun 4 deg, `#ff7446`, 1.5 | 0.6 | `#8c7c90` 0.0034 | `#343d6c` / `#d4684e` |
| forest | 1900 m | blue hour, mist | moon 25 deg, `#a3b6e2`, 0.7 | 0.35 | `#5c6c8c` 0.0046 | `#1b2346` / `#56668e`, stars 0.55 |
| gate | 2500 m | first stars | moon 25 deg, `#adc0ec`, 0.6 | 0.3 | `#2b3550` 0.0030 | `#0d1328` / `#3a4672`, stars, moon disc |
| original (`?look=original`) | any | pre-GU47 midday | sun `#ffe3b1` 2.8 | neutral room (HDRI never loaded) | `#b5c8c4` 0.0028 | fixed blue gradient |

Values between stops are smoothstep blends (the village row holds through the Backstreets to 300 m).

## Environment

The visible sky is the authored dome (`environment.background: "sky"`), so the `look-identity` HDRI-duplicate rule does not apply: `belfast_sunset_puresky` is IBL only here (secondary use; G02, G04, G21 and G24 also name it). Intensity steps 1.0 / 0.85 / 0.6 / 0.35 / 0.3; rotation 0.

## Signature effect

`scarf-trail`: a vermilion (`#d4553a`) scene-node ribbon on the `hero-scarf` anchor (upper spine), cyan twin for the Sage and Beast forms, under a full-frame indigo ink outline (`#1b2236`, width 1). Low keeps both (the outline is one post pass; grain and ambient particles go).

## Distinctness (PRD §6.1, platformer and runner group)

- Iron Crown (G05): static warm lantern dock; this game ends cool and inked (gate mean 40-60, indigo fog).
- Serpentine Sky Run (G17): indigo/coral evening colour script by stage, but a custom serpent sky and no ink line or ribbon.
- Splat Rush (G16): golden to violet by distance with hand-inked cel paint; this game uses a woodblock grade (agx, grain), a single ink line colour and moon key.
- Cloud Runner (G25): mid-morning after rain; no overlap.

## Frames, budgets and judge results

Phase 2 (remote captures): before/after card frames per district, the sibling judge vs cloud-runner-port (`same_game` false >= 90%), and the measured `budget.json` `after` rows.

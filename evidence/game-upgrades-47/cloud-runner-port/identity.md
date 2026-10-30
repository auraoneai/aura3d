# Cumulus Dash (cloud-runner-port): identity sheet, GU47 WP-35 "Storm-washed sky plateau"

Lane G25. Look table: `examples/kid-goku-beyond-the-clouds-port/art/look.ts`; art direction: `examples/kid-goku-beyond-the-clouds-port/art/direction.ts` (audit record `direction.audit.json` beside it); VFX pack: `examples/kid-goku-beyond-the-clouds-port/art/vfx.ts`. Frames, budget measurements and judge results are phase 2.

## Fantasy

Mid-morning minutes after a mountain squall: a wet terracotta sandstone ridge above a sea of clouds, a low side sun, a rainbow standing in the antisolar sky over silver-lined storm towers and the rain curtains beneath them.

## Palette

| Role | Hex | Use |
|---|---|---|
| Primary: cobalt | `#2f6fb8` | rain-washed zenith |
| Primary: wet sandstone | `#b5643c` | track banks, cliffs, mesas |
| Primary: sage moss | `#6f8f4a` | grass, moss in hollows, junipers |
| Accent: sky-pearl amber | `#ffb347` | sky pearls, pearl sparks, HUD pearl icons only |
| Reserved objective | `#d9341f` | checkpoint pennant bands |
| Storm slate | `#56637a` | storm-tower bases, rain curtains |
| Silver lining | `#eef3f8` | sunward tower edges, cloud puffs, glider trail |
| Horizon | `#c6d6e3` | rain-washed horizon band |
| Haze | `#9fb8cf` | aerial perspective, fog |
| Sun | `#ffe2b8` | the one key light |
| Back rim | `#9fc8ff` | cool unshadowed rim |

## Variants

| Variant | Time of day | URL | Sky | IBL | Sun (el / az / colour / intensity) | Fog |
|---|---|---|---|---|---|---|
| storm-washed (boot) | mid-morning after a squall | `/apps/showcase-cloud-runner-port/` | custom post-storm dome (cobalt zenith, rainbow 40-42 deg, 3 storm towers, rain curtains) | `spruit_sunrise` 1k, intensity 0.8, rotation 140 deg, background off | 28 / 52 / `#ffe2b8` / 3.2, 4 cascades to 160 m, PCSS | `#9fb8cf`, 0.0032, height fog in the gorges |
| original | midday (4.6 look) | `?look=original` | 4.6 dome | outdoor-day default (`autumn_field_puresky`) | 51.9 / 51.6 / `#fff0cf` / 3.2, 3 cascades to 120 m | look fog off, haze `#a8c9e8` 0.0026 |

## Signature effect

A rainbow over silver-lined storm towers: a 40-42 deg primary bow (faint secondary at 50-53 deg) centred on the antisolar point, drawn over the rain curtains under two to three cumulonimbus towers whose sunward edges carry a silver lining. It is in the sky dome shader, so it costs no draws and survives every tier (Low keeps it; only god rays, DOF and motion blur go).

## Distinctness (PRD §6.1, platformer and runner group)

- Serpentine (G17): pink/indigo evening, starry; this game is cobalt mid-morning daylight with no stars.
- Pip's (G06) and Cross Hop (G14): cheerful daylight with toadstool or pastel palettes; this game is a post-storm palette (slate towers, wet sandstone) with a rainbow.
- Splat Rush (G16, "Chroma Roll"): ink-paint carnival at dusk; this game is photographic weather, no cel paint.
- Ninja Runner (G20): ink outline, evening; this game has no outline.
- HDRI: `spruit_sunrise` is used only as IBL (background off) at intensity 0.8 and rotation 140 deg; the primary visible environment is the custom dome, so the `look-identity` HDRI-duplicate rule does not apply. Other games that name `spruit_sunrise` (G03, G05, G06, G08, G09, G10, G12, G14, G24) use it at other intensities or rotations, or as their visible sky.
- It leaves the shared `outdoor-day` default HDRI (`autumn_field_puresky`) and the default sun that Roadster Rush and Slingshot keys use.

## Frames, budget row, judge results

Phase 2 (remote capture, sibling judge vs Serpentine, Pip's, Cross Hop, Chroma Roll, Roadster Rush, Slingshot). Budget row: `budget.json`.

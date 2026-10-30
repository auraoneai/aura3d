# Serpentine Sky Run (serpentine-sky-run-port): identity sheet (GU47 WP-27)

Fantasy: a mythic dusk pilgrimage along the back of a sky serpent. A road of mother-of-pearl and jade scales with a glowing gold spine runs over a molten-gold cloud sea; a low sun ahead backlights the runner into a hot rim silhouette under indigo-to-coral skies.

Genre group: platformer and runner (G06, G14, G16, G17, G20, G25).

## Palette

| Role | Hex |
|---|---|
| Indigo (primary) | `#1c1640` |
| Coral (primary) | `#ff7a6b` |
| Cloud gold (primary) | `#f2b33d` |
| Pearl jade (accent) | `#7fe0c4` |
| White gold (reserved objective, surge) | `#fff2c4` |

## Variants (one evening as a colour script)

Look table: `examples/saiyan-snake-way-port/art/colorScript.ts` (`STAGE_LOOK`, 8 rows, blended over 120 m at each boundary). Sky: custom serpent sky shader and ray-marched cloud sea (no HDRI as the primary visible environment; the neutral preset environment lights the GLBs only). Variant param `?stage=1..8` pins the look; `?look=original` shows the pre-GU47 look.

| Stage | Name | Look id | Time of day | Sun (elev / az rel. forward) | Weather |
|---|---|---|---|---|---|
| 1 | CHECK-IN | rose | rose evening | 9 / -12 | clear, god rays |
| 2 | THE LONG ROAD | amber | amber | 7 / +10 | clear, god rays |
| 3 | TRAFFIC | copper | dusty copper haze | 5 / -6 | clear, god rays |
| 4 | THE SERPENT HALL | lacquer | red lacquer | 3.5 / +8 | clear |
| 5 | THE COILS | storm-violet | storm violet | 2 / -16 | clear |
| 6 | THE BROKEN SPINE | lightning | storm, lightning | 1 / +6 | rain and lightning |
| 7 | THE DROWSE | moonlit-indigo | night, moon | 18 / +14 | mist |
| 8 | THE END OF THE ROAD | sunburst | white-gold sunburst | 12 / 0 | clear, god rays |

## Signature effect

"Stage colour script on a scaled serpent road": eight evening looks blended along pearl-and-jade scales with a pulsing gold spine. It survives Low tier (the colour script is shader uniforms and the scale road is the road material; only god rays, lens flare and motion blur drop).

## Distinctness

- Not Roadster Hours' redline sunset (coastal road, salt spray) and not the noon cloud runner (cloud-runner-port, mid-morning after rain).
- Unit test `tests/unit/saiyan-snake-way-port/art-direction.test.ts`: neighbouring stages' top-third colours differ by dE2000 >= 12 and any pair by >= 8 (authored colours; captured frames are phase 2).
- Secondary IBL: the engine's neutral preset at 0.4-0.6 (no HDRI file, so no `look-identity` hash collision).

## Phase 2

Before/after card frames, sibling judgement vs cloud-runner-port, ninja-runner-port, pips-big-leap and roadster-hours-port (`--mode sibling`), measured budget rows.

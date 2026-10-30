# Duneglide (silt-and-signal-port), GU47 WP-34 identity sheet

Lane g24. "Hand-inked desert canal journey": a hand-inked gouache travel poster. Sun-bleached sandstone, terracotta and
bone white over indigo shadows, one jade "signal" accent for rings, board and HUD, umber ink lines fading with distance,
sand always moving. Source of truth: `examples/silt-and-signal-port/art/look.ts` (`CHAPTER_LOOKS`) and
`examples/silt-and-signal-port/art/direction.ts`.

## Palette

| Role | Hex |
|---|---|
| sandstone (primary) | `#d6a467` |
| terracotta (primary) | `#b4532f` |
| bone white (primary) | `#efe4cf` |
| indigo shadow (primary) | `#2a2e5c` |
| jade signal (accent, reserved objective) | `#2fae86` |
| jade white (rim, halo) | `#c9f2e1` |
| umber ink (day) | `#5a3a22` |
| indigo ink (night) | `#1f2550` |

## Variants: seven hours of one long day

Route `/apps/showcase-silt-and-signal-port/?chapter=N&start=1` (E-I targets `silt-and-signal-port--ch0..ch6`).
`?look=original` is the 4.6 look (no tone mapping, 0.65 exposure, one hand rig).

| Chapter | Hour | Key elev / az, colour, intensity | IBL (not the visible sky) | Sky dome | Signature params |
|---|---|---|---|---|---|
| 0 The Last Light | amber dusk | 9 / 250, `#ffb26a`, 2.6 | `belfast_sunset_puresky` 0.9 | `#6d7ca6` to `#f2a35c`, sun disc, cirrus, dust | wake `#e8b678`, sand motes, PCSS, god rays, flare |
| 1 The Broken Aqueduct | white-hot noon | 64 / 160, `#fff3df`, 3.4 | `outdoor-midday` 1.0 | `#78acd6` to `#f4ead8`, heavy dust | wake `#f1d6a8`, bleached grade (sat 0.84) |
| 2 The Inverted Forest | indigo moonlight | 28 / 40, `#9fb4ff`, 0.75 | neutral 0.35 | `#0b1131` to `#2a3470`, moon, stars | fireflies, 5 amber practicals, moon shafts |
| 3 The Abyssal Lanterns | teal lantern-dusk | 14 / 290, `#ff9a5e`, 1.8 | `industrial_sunset_puresky` 0.8 | `#1f4f62` to `#e48c5c` | lantern motes, PCSS |
| 4 The Storm Orchard | slate storm | 40 / 200, `#dfe3ea`, 1.3 | `kloppenheim_02` 0.85 | `#3b4455` to `#8c9198`, storm deck | pollen, rain (phase 2, DG-S5) |
| 5 The Hushed Crown | violet night | 22 / 330, `#c6b5ff`, 0.65 | neutral 0.35 | `#191233` to `#4c3b70`, moon, stars | embers, 5 amber practicals |
| 6 The Long Return | rose dawn | 6 / 80, `#ffad9a`, 2.3 | `spruit_sunrise` 0.85 | `#8b98c4` to `#f3a8a0`, sun disc | wake `#eab69a`, PCSS, flare |

Every pair of chapters has key directions at least 15 deg apart (`tests/unit/silt-and-signal-port/lighting-rig.test.ts`).

## Signature effect

Sand wake thrown up under the hoverboard at speed and low altitude (`silt-sand-wake`, canal variant `silt-canal-spray`),
inside a hand-inked frame whose umber ink fades to nothing by 600 m (E-E depth plus colour ink, `inkSource: "both"`).
The only cel-inked game in the catalogue and the only one whose key direction and colour change every chapter.
Low tier keeps the palette, sky, ink and a half-rate wake; it drops grain, PCSS, god rays and flare.

## Distinctness (PRD §6.1, racing group G02 G03 G04 G15 G18 G19 G21 G22 G24)

- Primary visible environment is the authored dome (`background: "sky"`); the five HDRIs are IBL-only, rotated to the
  key azimuth, so `look-identity` has no primary HDRI to collide on. G02/G04/G21 also use `belfast_sunset_puresky` or
  `industrial_sunset_puresky` as IBL: different rotation (250 deg, 290 deg) and intensity (0.9, 0.8).
- Jade accent: G15 strange-orbit also lists jade beside amber; Duneglide's jade is its only accent and its ink is the
  separating cue. Judge: phase 2 (sibling mode, E-I).

## Before / after frames, budget row, judge results

Phase 2 (E-I capture `@g9..@g15` rows `silt-and-signal-port--ch0..ch6`). Budget rows: `budget.json` (before from the
4.6 evidence, `after: null`).

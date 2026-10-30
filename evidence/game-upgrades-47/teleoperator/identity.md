# Grid Dispatch (teleoperator): identity sheet, GU47 WP-14 "Marine-layer dispatch feed"

A remote operator's sensor feed over a cool bay-city avenue at dusk. A marine fog bank eats the tower tops above 30-40 m
while the street stays clear; sodium lamps and lit bay windows against slate-teal fog; red and brass cable cars; teal
only for the objective and the sensor overlay. Every visual number is software WebGL2. Aura3D renders this game with its
own engine.

Sources: `apps/showcase-teleoperator/src/look.ts` (look table), `src/art/direction.ts` (art direction, audited by
`tests/unit/teleoperator/art-direction.test.ts`), `src/vfx.ts` (preset pack).

## Palette

| Role | Hex | Use |
|---|---|---|
| primary | `#5f7f8c` | slate-teal marine fog (fog colour, marine deck) |
| primary | `#2b3a55` | dusk zenith |
| primary | `#ffb15a` | sodium lamps, lamp pools, window glow, night horizon band |
| primary | `#b3262b` | cable-car red, tail-lamp trails (brake `#ff2a1f`) |
| accent | `#b59449` | brass cable-car rails and trim |
| reserved objective | `#3fd6c6` | kerb beacon, route ribbon, LiDAR scan ring, HUD objective text only |

## Variants (skies)

| Id (`data-tod`, `?sky=`) | Label | Time of day | Sky node | IBL HDRI (secondary, not visible) | Key | Fog / marine deck |
|---|---|---|---|---|---|---|
| `golden` (boot) | Marine dusk | dusk, sun 9 deg above the bay | gradient `#2b3a55` to `#f2a65e` | `belfast_sunset_puresky` 0.6, rot 160 | `#ffb070` 2.2, el 9 az 160 | height fog ref 28 m; deck 30-48 m, `#4d6672` 0.88 |
| `noon` | Sunny noon | noon, haze burnt off | Preetham turbidity 3, sun el 62 | `outdoor-midday` 0.85, rot 200 | `#fff4e2` 3.0, el 62 | thin haze; deck 70-110 m at 0.3 |
| `fog` | Marine fog | grey morning, low marine layer | grey gradient `#8193a0` to `#b3c0c6` | `autumn_field_puresky` 0.6 (2k asked of E-A), rot 170 | `#dfe8ee` 0.8 | height fog ref 12 m, clear to ~40 m; deck 12-26 m at 0.97 |
| `night` | Sodium night | night, moon behind a thin layer lit from below | dark gradient `#060a14` to `#1b2638`, sodium band, 220 stars | `cobblestone_street_night` 0.45, rot 210 | moon `#9db4e0` 0.25 | thin fog; deck 36-60 m `#3d3833` at 0.55 |

Primary visible environment: the sky node (`environment.background: "sky"`), so the HDRIs are IBL-only secondary uses;
each differs from other games' uses in rotation and intensity (PRD §6.1 last paragraph).

## Signature effect

"Marine-layer fog deck that swallows the bay-city tower tops above a clear street, swept by a teal LiDAR scan pulse from
the robotaxi's sensor feed." (unique among live games; `art/direction.ts`)

- Marine deck: fog by reconstructed world height in the sensor pass (`src/scanPulse.ts`), plus the engine height fog.
- LiDAR pulse: a depth-read teal ring every 2.4 s out to 60 m (2x rate on the roof camera); off when reduced motion is
  on; Low tier: half strength.

## Budget row

Chase noon/dusk/fog <= 480 draws, night <= 560 (<= 650 only with the mirror); textureBytes <= 64 MB; route JS gzip
+25 KB max; lights capped at 6 points + 2 spots. Before (4.6.x): 411 / 410 / 411 / 386 draws (`budget.json`).

## Distinctness

Racing group (PRD §6.1): roadster-rush, heatsink, strange-orbit, drift-and-deliver, heatsink-port, last-train,
roadster-hours, silt-and-signal. Grid Dispatch owns the grey marine fog deck over a street-level bay city and the teal
sensor ring; it uses no rain as a primary look (Lamplight Line owns rain and trams) and, since GU47, no borrowed
Heatsink towers (its skyline is its own glass and art-deco towers).

Phase 2 adds: before/after card frames, luma bands per sky, sibling judge vs the 7 racers, rubric scores.

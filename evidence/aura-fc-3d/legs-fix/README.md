# Aura FC legs and shorts (2026-10-25)

Owner report: in Aura FC the legs look wrong and the white shorts shred into jagged shards while running.

## Cause (measured, `tools/aura-fc`)

- Not the run cycle. `gait-limits.mjs` on the shipped clips: walk hip -28..+34 degrees, run -38..+44, sprint -44..+50, knee max 72 (kicks 101), thigh twist 6 or less, no forward-bending knee. All inside human range.
- The Meshy skinned mesh is. The striker's shorts material had 327 triangles stretched past 1.6x in the played clips (max 3.99x; skin 5.16x), bridging the left and right thigh across the crotch, and 15 to 65 cm thin rest-pose flaps rigidly weighted to the thigh that poke out behind a swinging leg (posed longest edge 0.78 m). They draw as large flat sails and needle shards.
- 19 percent of the thigh and shorts vertices are weighted to both legs (681 of 3,529 shorts leg vertices have more than 0.2 on each side), so cloth between the legs is dragged apart in a stride.

## What shipped

`bridge-cut.mjs --sliver 0.1 --keep-stretch skin` on the striker and goalkeeper GLBs: the shorts mesh loses its stretched crotch bridges and its flaps (456 and 198 triangles); the skin mesh keeps every triangle (cutting its bridges tore the thighs in the game render, `after-bridge-only` runs fclegs-after and fclegs-final2 showed it).

| | striker before | striker after | keeper before | keeper after |
|---|---|---|---|---|
| shorts max stretch | 89x (all clips) / 3.99x (run, sprint, kick) | 1.6x | 93x / 3.3x | 1.6x |
| triangles over 1.6x (walk, run, sprint, kick) | 327 | 175 (all skin) | 15 | 1 |
| longest posed triangle edge in run/sprint | 0.78 m | 0.34 m (skin) / 0.17 m (shorts) | 0.29 m | 0.19 m |

## Frames

`before/` and `after/` are 900x506 software-GL frames from the real game (QA hook `focusFastest`, run id fclegs-before / fclegs-final3, `tests/browser/fclegs-fc.spec.ts`). The big flat sail behind the leg (before `run-02`) is gone and the shorts stay compact. They are not clean: thin needle shards remain in the shorts and the thigh skin is still fragmentary, because the skin mesh under the shorts is itself broken geometry and the flaps used to hide part of it. `raster/` has offline GPU-free silhouettes (`tools/aura-fc/raster.mjs`).

## What would fully fix it (not done)

Regenerate the athlete with a clean mesh, or replace the shorts with a procedural closed tube skinned to the thigh bones and re-weight the skin with a same-side-only crotch (`tools/aura-fc/reskin.mjs` is the weights prototype; it needs a matching crotch cut and a game filmstrip before it ships). Hoops, Diamond, Links and Red Zone athletes have the same defect and were left unchanged: a triangle cut on those single-mesh GLBs punched shoulder holes (docs/audit/game-leftovers.md F11).

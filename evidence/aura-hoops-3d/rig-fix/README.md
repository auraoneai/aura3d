# Athlete rig fix: Hoops, Diamond and Links (4.3.0)

`aura3d assets validate --skin` flagged the Hoops (17.9x, 21.4x), Diamond (30.8x) and Links (73x) athletes as stretched in the clips their games play.

## What changed

- **Hoops Big, Hoops Guard, Diamond:** `tools/aura-athletes/split-bridges.ts`. Every triangle that stretches past 1.6x (or draws as a thin long flap) gets its own vertices, skinned rigidly to the bone that owns most of it, so it keeps its rest size. 810, 496 and 1224 triangles. The rest pose, skeleton, clips and palette texture are unchanged; the silhouettes before and after are identical in side and front views.
- **Links golfer:** not repairable by splitting. The mesh was baked with folded arms and a club welded into it (3.7k stretched triangles, 73x). It is now the Diamond body in the Links palette: `tools/aura-athletes/rebind.ts --exact` on the Links skeleton and clips, then the Links palette strip. Two Meshy generations (A-pose and straight arms, 60 credits) were bound to the rig with nearest-vertex and bone-proximity weights and still left 2.8k to 6k stretched triangles because the arms hang against the torso, so they were not shipped.
- `aura.skin-allow.json` entries removed for all four.

## Numbers (`aura3d assets validate --skin --asset <id>`)

| asset | before | after |
|---|---|---|
| hoopsAthleteBig | 17.92x, 807 triangles over 1.6x | PASS, 0 over |
| hoopsAthleteGuard | 21.44x, 496 | PASS, 0 over |
| diamondAthlete | 30.83x, 1224 | PASS, 0 over |
| linksGolferAthleteMeshy | 72.95x, 3748 | PASS, 5 over 1.6x (max 1.64x) |

## Frames

Software-GL gameplay frames from the real games (`tests/browser/fclegs-reg-*.spec.ts`, run ids p2ath-hoops3, p2ath-diamond3, p2ath-links4). The athletes are intact in run, bend and swing frames; thin hairline cracks remain at the white shorts hem of players who bend forward (the rigid patches), no shards or slabs. Frames are in `evidence/aura-hoops-3d/rig-fix/`, `evidence/aura-diamond-3d/rig-fix/` and `evidence/aura-links-3d/rig-fix/`.

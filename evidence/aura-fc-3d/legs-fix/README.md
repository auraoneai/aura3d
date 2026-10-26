# Aura FC legs and shorts: rebuilt (2026-10-25)

Owner report: in Aura FC the legs look wrong and the white shorts shred into jagged shards while running.

## Cause (measured with `tools/aura-fc`)

- Not the run cycle: `gait-limits.mjs` on the shipped clips gives walk hip -28..+34 degrees, run -38..+44, sprint -44..+50, knee at most 72 (kicks 101), thigh twist 6 or less, no forward-bending knee.
- The mesh does not match the skeleton. The Meshy mesh is modelled mid-stride (knee bent, thigh swung forward, torso leaning) but bound to a straight skeleton with the bones running down the body centre. Every clip rotated the legs about joints 10 to 20 cm away from the limbs they drive (`raster/striker-skeleton-vs-mesh-before.png`: the magenta bones are 15 cm behind the mesh legs). The thigh surface was also a handful of huge triangles (rest edges up to 65 cm), 327 triangles stretched past 1.6x in the played clips (worst 120x over every clip in the file), and 19 percent of thigh and shorts vertices were weighted to both legs.
- Triangle cuts and weight smoothing cannot fix that; four rounds of them (`before` and the earlier runs in this branch's history) only traded shorts shards for torn thighs.

## What shipped

`tools/aura-fc/rebuild-legs.mjs` (then `bridge-cut.mjs --limit 1.6` for stragglers) on the striker and goalkeeper GLBs, which are the only athletes FC instantiates (every team kit and skin tone is a material override on these two). The lower body is rebuilt in the straight pose the skeleton assumes: thigh and shin skin tubes, thigh shorts tubes, a pelvis skirt and ankle socks around the real bone axes with smooth hip, knee and ankle weights; the boots are flattened and placed under the shin; torso, arms, head and eyes are untouched. Material names, vertex attributes and clips are unchanged, so kit colours and every clip still apply. Bounds in the manifests are updated.

| | striker before | striker after | keeper before | keeper after |
|---|---|---|---|---|
| triangles past 1.6x (walk, run, sprint, 3 kicks, jump, slide, ready) | 327 | 0 | 15 | 0 |
| worst triangle stretch | 5.2x (120x over every clip) | 1.5x | 3.3x | 1.5x |
| longest posed triangle edge in run and sprint | 0.78 m | 0.15 m | 0.29 m | 0.23 m |
| file size | 2.46 MB | 1.83 MB | 2.37 MB | 1.70 MB |

Per material (kit, shorts, socks, skin, dark, eyes) the maximum stretch is 1.49, 1.36, 1.51, 1.50, 1.26, 1.00 for the striker. Unit tests: `tests/unit/aura-fc-3d/skin-repair.test.ts` (stretch ceiling, shorts edge length, legs within 15 cm of their bone), `gait-limits.test.ts`.

## Frames

`before/` and `after/` are 900x506 software-GL frames from the real game (QA hook `focusFastest` and `freezeAtKick`, `tests/browser/fclegs-fc.spec.ts`; run ids fclegs-before and fclegs-solid): ten kick frames and a run cycle for the striker and the away kit. After: intact shorts in both kits, believable legs through the run, sprint and the kick, boots on the ground. `raster/` has GPU-free silhouettes (`tools/aura-fc/raster.mjs`) of the same pose before and after, and the skeleton overlay.

Not touched and still visible in the run frames: thin fragments at the elbows where the sleeve and the arm skin overlap (the arms have the same mid-stride bind and no stretched triangles; logged in `docs/audit/game-leftovers.md`).

## Regression check on the other sports games

The Hoops, Diamond and Links athlete GLBs are not changed. Their gameplay filmstrips were re-run on the branch (`regression/`, software GL, run ids fclegs-reg-hoops, fclegs-reg-diamond, fclegs-reg-links3): title, early play, action frames (diamond: stance and nine swing frames; links: address, power, accuracy, swing frames). They show the same athletes as before the change. They have the same mid-stride bind defect and are listed as F11 in `docs/audit/game-leftovers.md`; their single-mesh GLBs have no separate shorts, socks or skin materials, so the rebuild needs their regions split first or a Meshy regeneration.

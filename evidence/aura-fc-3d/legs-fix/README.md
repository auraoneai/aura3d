# Aura FC legs, shorts and arms: rebuilt (2026-10-25)

Owner report: in Aura FC the legs look wrong and the white shorts shred into jagged shards while running. Follow-up: thin fragments at the elbows and shoulders (same cause, arms).

## Cause (measured with `tools/aura-fc`)

- Not the run cycle: `gait-limits.mjs` on the shipped clips gives walk hip -28..+34 degrees, run -38..+44, sprint -44..+50, knee at most 72 (kicks 101), thigh twist 6 or less, no forward-bending knee.
- The mesh does not match the skeleton. The Meshy mesh is modelled mid-stride (knee bent, thigh swung forward, torso leaning) but bound to a straight skeleton with the bones running down the body centre. Every clip rotated the legs about joints 10 to 20 cm away from the limbs they drive (`raster/striker-skeleton-vs-mesh-before.png`: the magenta bones are 15 cm behind the mesh legs). The thigh surface was also a handful of huge triangles (rest edges up to 65 cm), 327 triangles stretched past 1.6x in the played clips (worst 120x over every clip in the file), and 19 percent of thigh and shorts vertices were weighted to both legs.
- Triangle cuts and weight smoothing cannot fix that; four rounds of them (`before` and the earlier runs in this branch's history) only traded shorts shards for torn thighs.

## What shipped

`tools/aura-fc/rebuild-legs.mjs`, then `rebuild-arms.mjs`, then `bridge-cut.mjs --limit 1.6` on the striker and goalkeeper GLBs, which are the only athletes FC instantiates (every team kit and skin tone is a material override on these two). Legs: thigh and shin skin tubes, thigh shorts tubes, a pelvis skirt, ankle socks, boots flattened under the shin. Arms and torso: the spine bent about 30 degrees forward in the bind, so the torso, neck and head are sheared upright; the old sleeves, forearm skin, hands and detached cuffs are removed; shoulder caps, kit sleeves (short for the striker, long for the keeper), upper-arm and forearm skin tubes and mitten hands (skin for the striker, kit-coloured gloves for the keeper) follow the real shoulder, elbow and wrist axes with smooth weights. Material names (6 per athlete), vertex attributes and clips are unchanged, so kit colours, clips, draw calls (one per material) and the QA hooks are as before. Bounds in the manifests are updated.

| | striker before | striker after | keeper before | keeper after |
|---|---|---|---|---|
| triangles past 1.6x, all 26 clips in the file (walk, run, sprint, kicks, jump, slide, release, shoot, contest, ...) | 327 (played clips) | 0 | 15 | 0 |
| worst triangle stretch | 5.2x (120x over every clip) | 1.53x | 3.3x | 1.51x |
| file size | 2.46 MB | 1.75 MB | 2.37 MB | 1.77 MB |

Per material (kit, shorts, socks, skin, dark, eyes) the maximum stretch over all 26 clips is 1.53, 1.36, 1.51, 1.49, 1.26, 1.00 for the striker and 1.45, 1.36, 1.51, 1.49, 1.29, 1.00 for the keeper. Unit tests: `tests/unit/aura-fc-3d/skin-repair.test.ts` (stretch ceiling, shorts edge length, every leg and arm vertex within 15 cm of its bone), `gait-limits.test.ts`.

## Frames

`before/` and `after/` are 900x506 software-GL frames from the real game (QA hook `focusFastest` and `freezeAtKick`, `tests/browser/fclegs-fc.spec.ts`; run ids fclegs-before and fclegs-arms3): ten kick frames and a run cycle for the striker and the away kit. After: intact shorts in both kits, believable legs through the run, sprint and the kick, boots on the ground. `raster/` has GPU-free silhouettes (`tools/aura-fc/raster.mjs`) of the same pose before and after, and the skeleton overlay.

Arms: no fragments at the elbows; the shoulders read as a cap with the sleeve emerging from it. A small ragged tuft remains on the back of the shirt at the far shoulder in side views (old armhole edge). The keeper is checked offline (`raster/keeper-*.png`: long sleeves, gloves, dive pose); FC's framing never closes in on a keeper in the filmstrip.

## Regression check on the other sports games

The Hoops, Diamond and Links athlete GLBs are not changed. Their gameplay filmstrips were re-run on the branch (`regression/`, software GL, run ids fclegs-reg-hoops, fclegs-reg-diamond, fclegs-reg-links3; links is built inside the runner): title, early play, action frames (diamond: stance and nine swing frames; links: address, power, accuracy, swing frames). They show the same athletes as before the change. They have the same mid-stride bind defect and are listed as F11 in `docs/audit/game-leftovers.md`; their single-mesh GLBs have no separate shorts, socks or skin materials, so the rebuild needs their regions split first or a Meshy regeneration.

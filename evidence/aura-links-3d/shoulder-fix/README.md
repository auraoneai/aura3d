# Shoulder balls and dark arm bands: fixed (4.3.2)

Owner frames from 4.3.1 production showed grey spheres on both shoulders, dark floating bands around the upper arm and thin dark patches on the shirt fronts of the rebuilt Hoops athletes.

## Causes (found with `tools/aura-athletes/shade.ts`, a CPU close-up that darkens back faces)

1. **The arm and sleeve tubes were wound inside out** (`rebuild-arms.mjs` `addAxisTube`; the FC athletes shipped with the same defect). The engine drew their inner faces dark: the dark sleeves, "elbow band" and dark arm skin.
2. **Shoulder cap spheres** (`addSphere`) read as balls at game distance.
3. **Open arm roots** stood up as cups above the shoulder.
4. The torso tube's finely spaced shoulder rings produced thin triangles that the arm step's needle filter dropped, leaving holes (dark patches) at the front of the shirt.

## Fix

- Outward winding for every axis tube; no shoulder spheres (`--cap-radius 0`); arm roots taper into the torso (`--taper`); sleeve hems capped (`--cap-sleeves`).
- The torso tube is now `rebuild-arms.mjs --torso-tube`: measured from the old shell, appended after the arm step's drop rules (so no holes), a smooth shoulder slope and a collar closed just under the chin. The Hoops, Diamond, Links and FC athletes all use it.
- Hand positions unchanged: the drawn-hand centroid in forearm bone space is within 1 cm of the previous palm points (Hoops Guard (0.117,-0.245,0.148) vs (0.117,-0.245,0.137); Diamond (0.153,-0.287,0.066) vs (0.158,-0.296,0.060)), `RIG`/`PALM_OFFSET` constants untouched, Diamond drawn-grip and batter-grip tests pass.
- `assets validate --skin` passes for the four palette athletes and both FC athletes with no allow-list entry (max stretch 1.6x, 0 triangles over).

## Frames (software GL, game cameras, DPR 1)

`p4b-hoops` (default camera, handler and defenders standing and running), `p4b-hdrib` (Hoops chase-camera close-up of the handler), `p4b-diamond` and `p4b-dgrip` (Diamond batter), `p4b-links` (golfer address and swing), `p4b-fc` (FC kick and run frames), `cpu-guard-run.png` (CPU close-up). Shoulders slope into short sleeves, sleeves meet the arms with no gap or floating band, no spheres, no dark stripes on the shirts.

## Not done

- Frames are DPR 1, not DPR 2, and the owner's front-left close-up is approximated by the dribble probe's chase camera.
- The Hoops dribble probe still fails its running case on palm height and horizontal palm-to-ball distance (palm 0.574 m high, horizontal 0.214 m vs limits 0.6 and 0.2): run-to-run dribble spread, unchanged by the hand positions.
- `tests/unit/likeness-audit/brand-clean-assets.test.ts` `rooftopDefenderMeshy` already fails on `hotfix-432` before this change (its size check reads the next manifest entry's `sizeBytes`).

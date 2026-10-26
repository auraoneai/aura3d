# Teleoperator art pass (2026-10-25)

Lane `p1-art-teleoperator`. Render-only: no gameplay, collision, UI or timing change. All captures are software WebGL2 (SwiftShader) on the remote ACR runner, not a real GPU.

## Why

`evidence/teleoperator/screens/final/README.md` listed two open art problems: the hero robotaxi still read as a real-world robotaxi (a white crossover with a roof pod) with a smudged texture, and some traffic resembled familiar cars; and the street was lined with plain single-colour boxes (`sf-bldg-*`, 14 x h x 22 m, one PBR colour each).

## What changed

- **Vehicles.** Seven of the eight generic vehicles were regenerated with Meshy text-to-3D through Kiro Prism (prompts in `prompts-v2.json`, written to avoid recognisable real cars: a rounded driverless shuttle pod instead of a crossover, a notchback sedan, an angular wedge coupe, a bubble city hatch). Five were remeshed to about 20k triangles for clean surfaces and UVs (robotaxi, hatch, sedan, pickup, box truck), the coupe at 30k, the van at 20k. The roadster is unchanged. Emblems the generator invented (hatch hood, pickup grille and tailgate, van grille, box truck rear text, coupe nose and tail) were covered with plain discs (`tools/teleoperator-vehicles/cover.mjs`), checked on orthographic renders of every side. The robotaxi pod is converted to flat region materials (body, teal trim, glass, tyre, rim) by `tools/teleoperator-vehicles/flatten.mjs` (colour sampled from the generated texture per triangle, boundary triangles subdivided once, creased smooth normals recomputed), because `tests/unit/likeness-audit/teleop-robotaxi-flat.test.ts` requires the robotaxi to have no baked texture atlas; a first pass with the baked texture looked blown out under the noon sun and noisy.
- **Street.** The 16 box buildings are now four generated building models (a Victorian townhouse with a bay window, a brick mid-rise with a water tank, a glass office tower, an art-deco stepped tower), each about 10k to 13k triangles with a 1024 px texture. Left blocks face the road at +90 degrees yaw, right blocks at -90 degrees. Height still follows the old per-slot heights, capped so the footprint stays within 24 m deep and 30 m along the street.
- **Cameras.** The new pod is 2.9 m tall, so the Roof LiDAR and Bumper cameras (world offsets sized for a 4.6 m crossover) sat inside its body and showed its shell polygons. `PLAYABLE_FLEET.waymo.cams` now carries pod-specific offsets (roof camera 3.15 m high at the roof's front edge, bumper camera 0.35 m ahead of the nose at 0.8 m); the other cars keep the old offsets. Same change in both variants.
- **Hero and peer pod size.** The new pod is taller for its length, so `targetMaxDimension` for it dropped from 4.58 m to 3.9 m (hero and the peer car) in both `showcase-teleoperator` and `-v2`. Collision boxes are unchanged.
- Files: `apps/showcase-teleoperator/src/main.ts` (asset table, `BUILDING_SPECS`, `buildingLayout`), `apps/showcase-teleoperator-v2/src/main.ts` (the same vehicle table, pod size, building models and camera offsets), `aura.assets.json` and `src/aura-assets.ts` (vehicle entries, rewritten by `tools/teleoperator-vehicles/apply.mjs`), `public/aura-assets/teleopVeh*` and `teleopBldg_*`.

## Provenance

`provenance.json` lists, for each of the 11 new models: file, sha256, bytes, the text prompt, the Meshy task ids (preview, refine, remesh) and credits. Rights basis: the Meshy plan terms of the AuraOne account at generation time (not CC0, no exclusivity claimed). Text prompts only: no image input, no brand or model names, no frames of other games or products. Meshy credits are uncapped by owner decision (2026-10-25); the `teleoperator` ledger tag went from 255 to 735 credits in this pass, which includes generations that did not ship (a first coupe and sedan that read as specific real cars, a roadster whose remesh left texture artefacts, two coupe remeshes).

## Measured

`tests/browser/p1tele-probe.spec.ts` (runs `p1tele-pb3` before, `p1tele-pa3` after; 640x360, textures settled, WebGL `drawElements`/`drawArrays` calls counted over 8 frames, three rounds):

| | GL draw calls per frame | software-GL time for 8 frames |
|---|---|---|
| before (origin/main `ddbeb2486`, run `p1tele-pb3`) | 691.9, 690.9, 690.3 | 32 to 35 s |
| after, baked-texture pod (run `p1tele-pa3`) | 597.0, 602.1, 602.5 | 49 to 51 s |
| after, flat-paint pod as shipped (run `p1tele-pa4`) | 627.9, 632.6, 629.9 | 62 to 64 s |

Draw calls fell about 9% (16 single-colour boxes with their own materials became 16 model nodes that share four meshes and materials; the flat-paint pod splits into five materials, which is why it is above the textured pod). Wall-clock time on software GL is much higher after, but these runs were on different workers at different times, so the size of the slowdown is not reliable; the new building and vehicle meshes carry more triangles and 1024 px textures, and the cost on a real GPU was not measured. Console errors: 0 in the three capture profiles of the final shots run, 0 responses served from production.

Shipped models: vehicles 14,008 to 25,353 triangles (robotaxi 23,333 after flat-paint conversion, hatch 17,237, sedan 17,656, coupe 25,353, van 15,491, pickup 15,064, box truck 14,008), buildings about 10k to 13k vertices each; about 33 MB of new GLBs against about 23 MB removed (`public/aura-assets`).

## Frames read

Final captures with `tests/browser/p1tele-shots.spec.ts` (run `p1tele-shots9`): `evidence/teleoperator/screens/final/` 1280-01..05, 390-01..05, `card-2x.jpg`, `card-1x.jpg`; 0 console errors, 0 proxied responses. Opened and read: 1280 mid, 390 mid and the card (street lined with brick, glass and limestone buildings with window grids; hero shuttle pod; new traffic).

Camera review with `tests/browser/p1tele-cams-v1.spec.ts` (run `p1tele-cams4-v1`, `tests/browser/p1tele-cams-lib.ts`): the player pod in all four cameras (Chase, Far Chase, Roof LiDAR, Bumper), a traffic car parked 8 m ahead in Chase, Roof LiDAR and Bumper, and the pod from the side and front three-quarter in Chase. Read: Chase side and front three-quarter, Far Chase, Roof LiDAR and Bumper. Before the camera fix the Roof LiDAR and Bumper cameras sat inside the pod and showed its shell polygons; after it both look out over the road with the pod out of frame. The side view reads as a pod with dark tinted windows (a dark cabin box fills the window openings; the generated seats are gone). Remaining roughness: the window ends and the top edge of the window line are jagged, and the front and rear windows still show the traffic car through them. The Bumper camera frame with a car 8 m ahead put the camera inside that car's body (the traffic car is staged by the QA hook closer than the game's own contact distance), so it is not a pod problem.

## Not verified

- No real-GPU run: frame rate, texture upgrade timing and the sun's look on the new white pod were only seen on software GL.
- The pod's large window openings show the seat interior (inward-facing cabin faces are painted as glass, so the cabin reads as a tinted open-sided pod). In the side and front three-quarter close-ups (`p1tele-veh5`) the window edges and seats are rough and jagged; from the chase camera (rear) it reads cleanly. Roof LiDAR and Bumper camera modes were not checked.
- `showcase-teleoperator-v2` (type-checked, asset hashes verified) could not be rendered in the harness: its route issues 0 GL draw calls on origin/main as well as on this branch (runs `p1tele-v2b` and `p1tele-v2a`, 3 rounds each), and its captures are black, so none of its changes was seen in a frame.
- Name tags (`@marcus_v8`, `@elena_x` and others) still overlap the fare card at 1280 and the stacked HUD at 390, as listed in `evidence/teleoperator/screens/final/README.md`: a UI issue outside this lane.

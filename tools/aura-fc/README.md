# tools/aura-fc

Offline tools for the Aura FC 3D athlete rigs (`fcSoccerStrikerMeshy`, `fcGoalkeeperMeshy`). Plain Node, no dependencies.

- `glb.mjs` — GLB reader/writer, skeleton forward kinematics, animation sampling and an `withAnimations` writer.
- `bake-kick.mjs` — bakes `KickTap`, `KickPass`, `KickShot` into a GLB with analytic two-bone leg IK.
  `node tools/aura-fc/bake-kick.mjs <in.glb> <out.glb> [report.json]`. The contact fraction (0.74), the ball position
  (sim `FOOT_AHEAD` 0.34 m, `FOOT_SIDE` 0.14 m over the 1.174 model scale) and the boot-tip point are constants at the top of
  the file; change them with `KICK_CONTACT_FRAC` / `FOOT_AHEAD` / `FOOT_SIDE` in `apps/showcase-aura-fc-3d/src/game/sim.ts`.
  The output is renamed by content hash into `public/aura-assets/` and registered in `apps/showcase-aura-fc-3d/src/aura-assets-v2.ts`.
  Provenance: the body, rig and original clips are the Meshy generation recorded in `aura-evidence/meshy/`; the three kick
  clips are derived from the rig by this script (no new generation, no credits).
- `clip-metrics.mjs` — planted-foot (stance) speed of the walk, run and sprint cycles. The numbers in
  `apps/showcase-aura-fc-3d/src/game/locomotion.ts` come from here and `tests/unit/aura-fc-3d/locomotion-sync.test.ts` fails if they drift.
- `skin.mjs` — skinned-mesh stretch analysis and repair. `node tools/aura-fc/skin.mjs <in.glb> <out.glb>` smooths the skin
  weights around the bridging triangles the Meshy auto-rig leaves between independently moving parts (thigh to thigh, hand to
  hip), which stretch into pale slabs at the hips (120x in a kick pose). `--drop 4` instead deletes triangles stretched past 4x
  (leaves holes; not used). Run it on the output of `bake-kick.mjs` (the kick clips are part of what it samples).
  `tests/unit/aura-fc-3d/skin-repair.test.ts` fails if a shipped triangle stretches past 5x. Texture repaints are independent:
  both tools only touch animations, joints and weights, so re-run them on any repainted GLB.
- `bridge-cut.mjs` — removes the triangles a skinned athlete stretches past a limit in the played clips (thigh to thigh across the crotch, hand to hip)
  and repacks the binary: `node tools/aura-fc/bridge-cut.mjs <in.glb> <out.glb> [--limit 1.6] [--clips Run,Sprint_Loop,...] [--sliver 0.1] [--keep-stretch skin]`.
  `--sliver 0.1` also removes the thin 15 to 65 cm rest-pose flaps from the `shorts` material (`--sliver-materials`), `--keep-stretch skin` skips the
  stretch cut for the skin mesh. Shipped for the FC striker and goalkeeper as `--sliver 0.1 --keep-stretch skin`: cutting the skin's triangles, or the
  flaps in skin and kit, tore the thighs and sleeves in the game render, and on the single-mesh Hoops/Diamond GLBs it punched shoulder holes, so those
  are unchanged. Vertices, weights, UVs and clips are untouched. `skin.mjs` smoothing (above) is the older, weights-only repair.
- `raster.mjs <glb> <out.png> <clip> <t0..1> [side|front] [px]` — renders the posed silhouette offline, no GPU (`FLAG_EDGE=0.1` paints long triangles magenta).
- `gait-limits.mjs` — hip flexion and abduction, knee flexion (backward only) and thigh twist per clip, in degrees:
  `node tools/aura-fc/gait-limits.mjs <glb> Walk_Loop,Run,Sprint_Loop`. `tests/unit/aura-fc-3d/gait-limits.test.ts` holds the ranges.
- `swap-asset.mjs` — copies a repaired GLB into `public/aura-assets/<stem>.<sha8>.glb`, deletes the old file and rewrites the url, hash and size in
  `src/aura-assets.ts`, `aura.assets.json` and any app manifest passed after the two paths.
- `reskin.mjs` — prototype: moves each below-crotch vertex's other-leg weights onto the same-side bone (the auto-rig mixes 19% of thigh and shorts vertices across both legs). On its own it makes the crotch bridges stretch more; it needs a matching crotch cut. Not shipped.

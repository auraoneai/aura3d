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

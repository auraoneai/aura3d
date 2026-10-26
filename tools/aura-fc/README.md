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
- `rebuild-legs.mjs` — **the shipped FC athlete fix.** `node tools/aura-fc/rebuild-legs.mjs <in.glb> <out.glb>`. The Meshy mesh is modelled mid-stride (knee
  bent, thigh swung forward, thigh skin made of a few huge triangles) but bound to a straight skeleton, so every clip rotated the legs about joints 10 to
  20 cm from the limbs and the shorts and thighs tore into shards. This removes the leg geometry from the skin, shorts and socks meshes, flattens the boots
  (least-height search) and places them under the shin axis, and builds thigh and shin skin tubes, thigh shorts tubes, a pelvis skirt and ankle socks around
  the real bone axes with smooth hip (0.70 to 0.99 m), knee (+-0.14 m) and ankle weights wide enough to keep every triangle under 1.6x. Material names, vertex
  attributes (position, normal, joints, weights) and clips are unchanged, so kit colours and clips still apply. Follow it with `bridge-cut.mjs --limit 1.6` to
  drop any residual stretched triangle (the keeper loses 10).
- `rebuild-arms.mjs` — the arms step, run on the output of `rebuild-legs.mjs`: `node tools/aura-fc/rebuild-arms.mjs <in.glb> <out.glb> [--long-sleeves]`. The same mid-stride
  bind bent the spine about 30 degrees and the arms at the elbow, so shoulders and elbows pivoted far from the limbs. It shears the torso, neck and head upright
  (per-height shift of the torso cluster centres onto the skeleton axis), removes the old sleeves, forearm skin, hands and detached cuffs, and builds shoulder caps,
  kit sleeves (short for the striker, `--long-sleeves` for the keeper), upper-arm and forearm skin tubes and mitten hands (skin for the striker, kit-coloured gloves
  for the keeper) around the real shoulder, elbow and wrist axes with smooth shoulder (-0.05 to 0.16 m) and elbow (+-0.1 m) weights. Pipeline for the FC athletes:
  `rebuild-legs.mjs` -> `rebuild-arms.mjs` -> `bridge-cut.mjs --limit 1.6`.
- `bridge-cut.mjs` — removes the triangles stretched past a limit in the played clips and repacks the binary:
  `node tools/aura-fc/bridge-cut.mjs <in.glb> <out.glb> [--limit 1.6] [--clips Run,Sprint_Loop,...] [--sliver 0.1] [--keep-stretch skin]`. Cutting alone does not
  fix the Meshy athletes (it tore the thighs in the game render); it is the cleanup pass after `rebuild-legs.mjs`.
- `raster.mjs <glb> <out.png> <clip|NONE> <t0..1> [side|front] [px]` — renders the posed silhouette offline, no GPU; `SKELETON=1` overlays the bones (this is what showed
  the skeleton running down the body centre while the mesh legs were 15 cm in front of it), `FLAG_EDGE=0.1` paints long triangles magenta.
- `gait-limits.mjs` — hip flexion and abduction, knee flexion (backward only) and thigh twist per clip, in degrees:
  `node tools/aura-fc/gait-limits.mjs <glb> Walk_Loop,Run,Sprint_Loop`. `tests/unit/aura-fc-3d/gait-limits.test.ts` holds the ranges.
- `swap-asset.mjs` — copies a repaired GLB into `public/aura-assets/<stem>.<sha8>.glb`, deletes the old file and rewrites the url, hash and size in
  `src/aura-assets.ts`, `aura.assets.json` and any app manifest passed after the two paths. Update `bounds` by hand when the footprint changes.

- `rebuild-arms.mjs` flags added in 4.3.2: `--taper` (arm roots taper into the torso), `--cap-sleeves` (closed sleeve hems), `--cap-radius 0` (no shoulder sphere), `--torso-tube` (replaces the ragged shell with a clean torso tube measured from it, closed below the chin). The arm and sleeve tubes were wound inside out before 4.3.2 (dark arms and sleeves in the game): fixed.

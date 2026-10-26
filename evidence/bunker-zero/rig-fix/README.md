# Bunker Zero rig fix (F12)

`aura3d assets validate --skin` flagged the four Bunker Zero characters: the Meshy auto-rig bound each mesh to a template skeleton whose joints sat 10 to 30 cm off the limbs, so every clip tore the armour into sails and shards. They shipped allow-listed in `aura.skin-allow.json`. All four now pass and are off the allow-list.

| Asset | Before (all 23 clips: worst stretch, triangles past 1.6x) | After (played clips Idle_Loop + Walk_Loop) | Repair |
| --- | --- | --- | --- |
| bunkerGuardMeshy | 113.35x, 1,561 | 1.99x, 9 of 10,059 (allowance 10), 0 flaps | `--refit-skeleton` + smoothing |
| bunkerGunnerMeshy | 85.94x | 1.82x, 9 of 9,725 (allowance 9), 0 flaps | same |
| bunkerWardenMeshy | 34.04x | 2.16x, 6 of 9,480, 0 flaps (1 triangle cut) | same |
| bunkerHoundMeshy | 384.71x | 1.16x, 0 triangles, 0 flaps | `tools/skin-fixes/bounding-quadruped.ts` |

Command used for the three humanoids (Meshy keeps the authored pose, the joints move onto the limbs, the clips are re-targeted):

```bash
aura3d assets repair-skin <glb> --keep-clips Idle_Loop,Walk_Loop --refit-skeleton --normalize --prune-distant \
  --smooth-bridges --smooth-threshold 1.25 --smooth-rounds 12 --smooth-rings 6 --cut-stretch 2.3
```

The hound is a quadruped on a humanoid template skeleton, which no joint move can repair. It is re-rigged as a bounding body (rear half on Hips, front half on Chest, head on Head) with authored Idle_Loop and Walk_Loop clips. Its legs do not swing; the body bobs and flexes.

Frames: `<asset>-0.jpg` holds Idle_Loop front, Idle_Loop side and Walk_Loop front (rows), `<asset>-1.jpg` Walk_Loop side; five frames per row, captured from the remote runner (software WebGL2, `tests/browser/p2-rig-frames.spec.ts` on `tests/browser/p2-rig-viewer/`). The characters are intact in every frame; the guard, gunner and warden swing their legs and keep their rifles.

The game plays only `Idle_Loop` and `Walk_Loop` for these characters (`apps/showcase-bunker-zero/src/main.ts`), so the other 21 clips were dropped from each GLB. Software GL only; not a real-GPU run.

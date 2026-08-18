# Neon Corridor Strike — known limits

Route-local prototype. These are not public `@aura3d/engine` claims.

- Aura3D has no genre shooter kit because combat is authored on Rapier through
  `app.physics.queries.raycast`. That is the public engine path, not a missing file.
- `createAuraApp` follow cameras apply `offsetMode: "target-yaw"` only. Pitch is
  applied to hitscan and the look-target node; it is not a full six-dof FPS rig.
- `@aura3d/engine/controls` `PointerLockControls` binds a renderer camera object.
  This route uses `game.input` pointer deltas plus document pointer lock on the
  `createAuraApp` canvas.
- Enemy AI is an authored alarm plus proximity rush: hostiles hold position
  during the spawn guard, then all four charge when the corridor wakes up.
  Swipes telegraph 0.42s before the damage frame. No Recast nav mesh.
- Hostiles are solid against hitscan and walls but not against the player
  capsule; touch damage is proximity-authored in route code.
- Physics walls are an authored corridor hull. They are aligned to the playable
  volume, not a triangle mesh of the imported GLB.
- `medkit` resolved to a medical gurney prop. Treat it as a health pickup stand-in.
- Corridor lighting is authored point/directional fill on the root API. Emissive
  floor rails are set dressing, not bloom. Do not claim bloom, SSAO, WebGPU,
  full PBR, skinned death clips, or DOOM parity.
- Shot feedback is an authored muzzle flash plus a traveling pulse bolt and
  tail that leave the rifle along the hitscan, with a muzzle point light and
  end-of-shot impact flashes. `game.effects` flashes are too
  dim to carry the graphic alone. This is not a projectile physics kit.
- Walk height is locked so the viewmodel does not inherit capsule bounce. Jump
  is not a supported mechanic on this route.
- Playwright pointer lock may request without engaging in automation. Evidence
  records `pointerLockRequested`; look still updates from pointer deltas.
- Multiplayer, WAD/mod pipelines, and gore shaders are explicit non-goals.

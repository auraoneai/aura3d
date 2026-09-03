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
- Hostiles carry a small renderer-owned red/amber threat collar that follows
  their typed visual node. It expands only during the route-local telegraph or
  flinch clocks and collapses during the authored death crumple; it is a
  silhouette/readability cue, not a hitbox, target lock, or reusable shooter UI.
- The shot presentation window is measured in wall-clock time (12 s) with the
  bolt fading to a small ember after its flight; pause compensates the expiry
  clock so the remaining presentation window resumes instead of elapsing in
  the background.
- Walk height is locked so the viewmodel does not inherit capsule bounce. Jump
  is not a supported mechanic on this route.
- Playwright pointer lock may request without engaging in automation. Evidence
  records `pointerLockRequested`; look still updates from pointer deltas.
- Touch is a route-local DOM input surface backed by `game.input.setAction`;
  it does not imply a reusable engine FPS controller or platform-native gamepad.
- Multiplayer, WAD/mod pipelines, and gore shaders are explicit non-goals.
- NC-A1 debris barrels/crates are cosmetic dynamic bodies on a dedicated
  `debris` collision layer (wall+debris only). Scatter impulses fire on any
  confirmed impact; nothing gameplay-facing reads prop poses, and there is no
  damage model.
- NC-A4 practicals hang on real public spring joints, but the production Rapier
  adapter clamps joint force, so the route applies per-frame buoyancy support
  (`applyLampSupport`) and keeps sway kicks just under the clamp's stability
  edge. Net effect: a visible ~5cm deterministic swing that always settles;
  lamps cannot hold a taut ceiling pose under this solver.
- NC-A3 aggro sight lines use the public `physics.queries.sphereCast` against
  the authored wall hull — not triangle-accurate casts against the corridor
  GLB, and not a nav mesh. Blocked hostiles hold position facing the player.
- NC-A5 greebles are exactly two instanced primitive pools (pipes,
  rails/vents) with a two-level distance LOD. They carry no physics bodies, so
  they can never block movement or fire lanes.
- NC-A6 signage uses the public `text3D` glyph set, which supports uppercase
  letters, digits, period, and hyphen only. Lowercase or other scripts would
  render as gaps and are intentionally unused.
- NC-A7 ambient drone runs on its own looped audio element behind the existing
  gesture unlock; low-ammo ticks and low-HP stings briefly duck it. The drone
  is synthesized in-repo (CC0) by `scripts/build-sfx.mjs` and CLI-registered
  like every SFX cue.

# Kid Goku: Beyond the Clouds: Aura3D port notes

Crayon game #11 (`https://app.usecrayon.ai/play/3a9001a5-28fa-4ae0-ba5c-3b068d1912a4`, "Unofficial fan game"). Captured with
`tools/crayon-probe/capture-module.ts`; source fixtures under `tests/fixtures/crayon/kid-goku-beyond-the-clouds/` (untrusted data,
never executed). The original is three.js r184 (WebGL2) with a Vite bundle `assets/index-DhF_BuDt.js` (389,344 bytes gzip, 1,278,835
bytes plain, SHA-256 `ddc83300…57ae`, matching the server's own `x-amz-meta-sha256`).

## What the original is

A cinematic rail runner: distance `s` along a fixed centerline, lateral `lane` (±5.1), jump, Power Pole vaults over gorges, the Flying
Nimbus (charge → call → ride → land), seven Dragon Balls, meat that heals, checkpoints, and an encounter layer (pteranodon dives, T-rex bites
and swipes, boulders, rocks and logs, rock-paper-scissors "Janken" duels) with a finale cutscene. Chapter data is declarative (`Rf[0]`, "Mount
Paozu": length 1960, speed 14.5). The run simulation is a pure `Sp(state, input, dt, chapter)` stepped once per animation frame.

## What is ported (`sim.ts`, `chapter.ts`)

A line-for-line translation of `Sp`, the obstacle/orb pass `VE`, damage `Dp`/`mp`, and the helpers they call (`Bf Vf dp np rp ip ap op cp lp Zf gp Cp wp bp xp Tp Ep`, constants `Qf`), plus
the frame wrapper (`dt` clamp, `score += speed·dt·0.6`) and the seeded obstacle layout `Jf`. Covered: speed response, lane steering, jump and
gravity, the log dismount, Power Pole plant / vault / launch / perfect, gap and river falls, Dragon Ball and meat pickups, combo and score,
checkpoints, the finish, and the whole Nimbus state machine with its safe-run map. No randomness and no wall clock: only `dt` and the input.

## What is NOT ported

- The encounter system (`FT`/`Lw`): creature attack timing and dives, boulders, Janken. The original asks it through `state.liveAttack`;
  the port leaves that seam open (attacks always live) and has no creature or boulder events. Ordinary obstacles (rocks and logs) ARE
  ported (`worldPass`: crash or clean pass, damage, hearts) and their seeded layout equals the original's. The orb magnet while riding the
  Nimbus is not ported.
- Verified horizon: the recorded run (800 steps, s 0 to ~190: the log, the 45/76 rocks, the seeded obstacles, orbs, the 150-160 gap
  jump, Dragon Ball 1, checkpoint 172). Nothing past the first boulder (s=215) has been compared against the original.
- Chapters other than 0 (the bundle defines one), the finale, the journal and menu UI, comic callouts, audio, touch controls, save data.
- Art and characters: the road, cliff, river, balls and meat are procedural stand-ins; the hero is a capsule on an ellipsoid cloud. Cameras
  are a simplified chase rig (the original has ~10 cinematic camera modes).

## Engine surfaces used

`geometry.custom(geometry.dynamic(...))` ribbons (SG-05), `primitives.cylinder/sphere/capsule`, `material.pbr/emissive`, node handles
(`setPosition`, `setVisible`), `app.camera.setPose`. No `@aura3d/rendering` internals; no `TODO(a3d-migrate)`. Nothing here needed a
new engine capability; the original's 30 live ShaderMaterials (painterly gouache look, clouds, water, foliage) are the part that would, and
they are not ported.

## Hooks

`window.__AURA_KID_GOKU__`: `snapshot()` (same fields as the original's `__CLOUD_RUNNER__.snapshot()` where they overlap), `stepFrames(n,
input)`, `replay(segments)`, `reset()`, `pixels()`, `frame()`, `routeHealth()`, `diagnostics()`. `?manual=1` stops the real-time loop.

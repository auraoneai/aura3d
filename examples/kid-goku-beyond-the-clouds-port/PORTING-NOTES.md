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

## Art and features added after the simulation port (the "Cloud Runner" pass)

The simulation (`sim.ts`, `chapter.ts`) is unchanged for the verified first 800 steps; every addition sits beside it:

- `encounters.ts`: the encounter controller (`Lw` in the original): rolling boulders with their warning zones, pteranodon dives with shadow
  targeting, the T-rex bite and tail-swipe gauntlet, staff strikes (`knockout`), `rewind` after a respawn, and the `liveAttack` seam.
- `game.ts`: the main-loop order of the original (`SD`): rock-paper-scissors duel clock (`tickJanken`), hit-stop and slow-motion, sim step,
  encounter events (`PE`/`LE`/`FE`), obstacle and orb pass with the Nimbus orb magnet, falls and respawns (a charged cloud rescues a fall),
  the finale, results and persistence. Additive sim exports: `rescue`, `knockOff`, `startJanken`, `tickJanken`, `jankenAllowed`, `collectOrb`.
- Render: `world.ts` (+ `terrain.ts`, `props.ts`, `creatures.ts`, `mesh.ts`, `shaders.ts`, `materials.ts`, `fx.ts`): lit sandstone canyon and
  rolling meadows lofted from the course data, textured PBR track and grass (CC0 ambientCG, regraded), banded cliff walls, merged foliage,
  mesas and cloud banks, valley forest, a sky dome with lit cumulus and hazy ridges, a rigged CC0 KayKit runner (clip-driven), the sky cloud,
  star orbs, pterosaur and tyrant lizard, boulders, warning decals, pooled glow/dust particles, bloom + grade + vignette.
- `ui.ts`, `audio.ts`: DOM title, HUD, prompts, duel banner, pause, results, touch controls; procedural Web Audio (no samples).
- Persistence: best score and sound setting in `localStorage` (`cloud-runner.v1`).

## What is still NOT ported

- Meshy-generated creatures and hero: not generated (Meshy needs an approved credit maximum). The creatures are original procedural meshes;
  the hero is a catalog model, not a copy of the original's character.
- The original's painterly gouache post stack, comic callout art, ten cinematic camera modes, level select, journal and chapters other than 0
  (the bundle defines one), and the finale cutscene's own staging (a short walk-home sequence stands in).
- The simulation beyond the verified horizon (s ~190) is a faithful translation but has not been compared to the original beyond that
  point; the encounter layer was written from the original's controller and has unit tests, not a recorded reference.

## Engine surfaces used

`geometry.custom(geometry.dynamic(...))` merged meshes and ribbons, `material.pbr` (maps, normal maps), `material.custom` (sky, valley,
water, orb, scenery, decals, pooled points with per-frame `updateAttribute`), `model` + `node.play` skeletal clips, `looks.preset`,
`lights.directional` with cascaded shadows, `effects.fog/bloom/colorGrade/vignette`, `defineAuraAssets` with manifest hashes and same-origin
pathnames (the production bridge refuses `http(s)` model URLs and hash-less models), `app.camera.setPose`. No `@aura3d/rendering` internals.

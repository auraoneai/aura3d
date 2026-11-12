# Cumulus Dash: Aura3D port notes

> **5.5.4 Update (2026-11-12):** All external and Meshy `.glb` models documented in historical passes below were replaced with 100% native `@aura3d/engine` multi-material procedural geometry (`0` `.glb` files).

Crayon game #11 (`https://app.usecrayon.ai/play/3a9001a5-28fa-4ae0-ba5c-3b068d1912a4`, "Unofficial fan game"). Captured with
`tools/crayon-probe/capture-module.ts`; source fixtures under `tests/fixtures/crayon/kid-goku-beyond-the-clouds/` (untrusted data,
never executed). The original is three.js r184 (WebGL2) with a Vite bundle `assets/index-DhF_BuDt.js` (389,344 bytes gzip, 1,278,835
bytes plain, SHA-256 `ddc83300…57ae`, matching the server's own `x-amz-meta-sha256`).

## What the original is

A cinematic rail runner: distance `s` along a fixed centerline, lateral `lane` (±5.1), jump, Power Pole vaults over gorges, the Flying
Glider (charge → call → ride → land), seven Sky Pearls, meat that heals, checkpoints, and an encounter layer (pteranodon dives, T-rex bites
and swipes, boulders, rocks and logs, rock-paper-scissors "Janken" duels) with a finale cutscene. Chapter data is declarative (`Rf[0]`, "Mount
Ridge": length 1960, speed 14.5). The run simulation is a pure `Sp(state, input, dt, chapter)` stepped once per animation frame.

## What is ported (`sim.ts`, `chapter.ts`)

A line-for-line translation of `Sp`, the obstacle/orb pass `VE`, damage `Dp`/`mp`, and the helpers they call (`Bf Vf dp np rp ip ap op cp lp Zf gp Cp wp bp xp Tp Ep`, constants `Qf`), plus
the frame wrapper (`dt` clamp, `score += speed·dt·0.6`) and the seeded obstacle layout `Jf`. Covered: speed response, lane steering, jump and
gravity, the log dismount, Power Pole plant / vault / launch / perfect, gap and river falls, Sky Pearl and meat pickups, combo and score,
checkpoints, the finish, and the whole Glider state machine with its safe-run map. No randomness and no wall clock: only `dt` and the input.

## Art and features added after the simulation port (the "Cloud Runner" pass)

The simulation (`sim.ts`, `chapter.ts`) is unchanged for the verified first 800 steps; every addition sits beside it:

- `encounters.ts`: the encounter controller (`Lw` in the original): rolling boulders with their warning zones, pteranodon dives with shadow
  targeting, the T-rex bite and tail-swipe gauntlet, staff strikes (`knockout`), `rewind` after a respawn, and the `liveAttack` seam.
- `game.ts`: the main-loop order of the original (`SD`): rock-paper-scissors duel clock (`tickJanken`), hit-stop and slow-motion, sim step,
  encounter events (`PE`/`LE`/`FE`), obstacle and orb pass with the Glider orb magnet, falls and respawns (a charged cloud rescues a fall),
  the finale, results and persistence. Additive sim exports: `rescue`, `knockOff`, `startJanken`, `tickJanken`, `jankenAllowed`, `collectOrb`.
- Render: `world.ts` (+ `terrain.ts`, `props.ts`, `creatures.ts`, `mesh.ts`, `shaders.ts`, `materials.ts`, `fx.ts`): lit sandstone canyon and
  rolling meadows lofted from the course data, textured PBR track and grass (CC0 ambientCG, regraded), banded cliff walls, merged foliage,
  mesas and cloud banks, valley forest, a sky dome with lit cumulus and hazy ridges, a rigged Meshy-generated hero kid (clip-driven), the sky cloud,
  star orbs, pterosaur and tyrant lizard, boulders, warning decals, pooled glow/dust particles, bloom + grade + vignette.
- `ui.ts`, `audio.ts`: DOM title, HUD, prompts, duel banner, pause, results, touch controls; procedural Web Audio (no samples).
- Persistence: best score and sound setting in `localStorage` (`cloud-runner.v1`).

## What is still NOT ported

- The original's painterly gouache post stack, comic callout art, ten cinematic camera modes, level select, journal and chapters other than 0
  (the bundle defines one), and the finale cutscene's own staging (a short walk-home sequence stands in).
- The simulation beyond the verified horizon (s ~190) is a faithful translation but has not been compared to the original beyond that
  point; the encounter layer was written from the original's controller and has unit tests, not a recorded reference.

## Engine surfaces used

`geometry.custom(geometry.dynamic(...))` merged meshes and ribbons, `material.pbr` (maps, normal maps), `material.custom` (sky, valley,
water, orb, scenery, decals, pooled points with per-frame `updateAttribute`), `model` + `node.play` skeletal clips, `looks.preset`,
`lights.directional` with cascaded shadows, `effects.fog/bloom/colorGrade/vignette`, `defineAuraAssets` with manifest hashes and same-origin
pathnames (the production bridge refuses `http(s)` model URLs and hash-less models), `app.camera.setPose`. No `@aura3d/rendering` internals.


## Procedural multi-material art pass

All external/generated `.glb` models have been replaced with 100% `@aura3d/engine` + `apps/showcase-port-shared/proceduralKernel` sculpted multi-material assemblies in `art/proceduralModels.ts` (`0` `.glb` files):

- **Sky Kid Cloud-Surfer Hero (`buildSkyKidHeroNode`)**: articulated `group` hierarchy (`ZYX` Euler order, grounded at `minY = 0` on amber boot soles) with sculpted warm-skin head, expressive eyes + specular catchlights, 13 curved swept/lofted obsidian hair tufts, warm saffron martial tunic over indigo undershirt, tied indigo waist sash with trailing wind-tails, indigo wristbands, billowing cloud-boots with cream cuffs, and a crimson lacquer Power Pole with brass end-caps slung diagonally across the back.
- **Props, creatures & set pieces**: golden cumulus steed (`buildGoldenSkyCloudNode`), extendable sky staff, star spheres, honey-roast pickups, sky coins, carved rune boulders, sky pterosaurs, storm tyrant lizard, curved-roof hermit cottage, crimson sanctuary torii gates, and instanced bonsai pines, canopy trees, karst mesas, sky islands, and sunlit cumulus towers.

## Run gait (planted feet)

`gait.ts` and `locomotion.ts` compute deterministic stride phase, cadence, lean, and planted-foot touchdown events from ground speed (up to ~19.6 m/s boosted), driving both footstep audio/dust cues and `computeSkyKidHeroPose` per-frame limb articulation without cumulative rotation drift. Sim values and replays are untouched; verified by `tests/unit/kid-goku-beyond-the-clouds-port/gait.test.ts` and `locomotion.test.ts`.

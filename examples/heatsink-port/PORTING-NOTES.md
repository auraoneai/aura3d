# HEATSINK on Aura3D: porting notes

Aura3D port of the Crayon game "HEATSINK" (PRD §7.2 Phase B, task R-20), Time Trial on the map **Vesper Heights**.
Source: the captured game module in `tests/fixtures/crayon/heatsink/` (see its `PROVENANCE.md`; untrusted third-party
data, read as text only, never executed outside the remote browser capture).

## What is ported exactly (checked against the original)

`map.ts`, `config.ts`, `track.ts`, `vehicle.ts`, `race.ts`, `hud.ts` transcribe the original's Vesper map, `Re` tuning,
`Track` (centripetal Catmull-Rom smoothing and refit, elevation, width blend, the two split-lane sections, seeded scatter),
the player drone's physics, and the Time Trial race flow (3.2 s countdown, 1/120 s substeps, crash slow motion, boost pads,
checkpoints, pickups, barrels, lap and DNF logic). `evidence/crayon-capture/heatsink-reference.json` is a remote capture of
the original driven by the same closed-loop policy: 4 independent browser sessions and 4 replays agree bit-exactly
(maximum delta 0), and the track fingerprint is identical. `tests/unit/heatsink-port/reference-replay.test.ts` replays the
recorded 6000-step input script through the port and holds it to 1e-6 at all 202 snapshots (observed worst case about 1.6e-10;
the capture's own tolerance floor is 1e-3). The replay includes a crash and respawn, boost pads, a pickup and a lap boundary.
Track length matches to 1.4e-11 m; boost pads, pickups and barrels match the original's lists.

## What is hand-ported, not transliterated

The original draws with 49 live three.js TSL node materials (`evidence/crayon-probes/heatsink.json`, 7 of them with
`normalNode`). They are **not** translated node for node. `shaders.ts` replaces them with GLSL 300 es programs
(road, solid, additive veil, sky dome, terrain, speed streak, point sprites) whose inputs come from the map's `lighting`,
`atmosphere` and district data. They approximate the look from captured frames; they do not reproduce the node graphs, PBR
response, shadows, SSAO or the original's exact bloom and grade settings. Hemisphere plus sun lighting and exponential height
fog are evaluated inline because `material.custom` is unlit.

## Art pass (2026-10-23)

Rendering and presentation only; the simulation, reference replay and unit tests are untouched. Procedural, no asset bytes.

- **Sky**: back-culled 3000-unit dome again (the old black sky was the engine's silent draw-skip on unused declared uniforms,
  fixed in 4.0.7, not a size or culling limit). Teal-to-navy gradient, cloud layer, two aurora ribbons, ringed planet, moon, stars.
- **Terrain** (`terrain` program, `buildProps`, `buildShoulders`): smooth rounded hills placed so their foot sits 30 m+ clear of
  the road edge, far massifs for the horizon silhouette, plains falling away to a valley, ridged-noise rock with strata, a bump
  normal from screen-space derivatives (cheap on software GL), frost above a snow line, teal haze.
- **Road and edges**: dark blue-grey asphalt with mottling, thin cyan neon tracery, long pale lane lines near the edges, pale pipe
  rails (`buildRails`) with cyan neon posts every 22 m, bone-pipe gantry arches with a neon strip every 240 m (`buildArches`),
  floating dark crystal shards (`buildShards`).
- **Drone**: a quad-rotor of 23 primitives in the track frame: copper body and cabin, cyan accent strip, X arms with motors,
  spinning dark rotor blades, twin thrusters with white-hot glow and thin additive plumes.
- **Motion**: 110 camera-facing speed streaks (world-fixed lines along the heading, respawned ahead once passed), exhaust points.
- **Grade**: bloom (intensity 0.9, threshold 0.85) plus `effects.colorGrade` and vignette.
- **Camera framing**: `FRAMING` in `world.ts` (7.6 m back, 2.0 m up) is lower and closer than `CFG.camera` to match the original's
  frames; the simulation never reads it.

## Gaps (all visible in `evidence/heatsink-port/frames/`)

- Assets are procedural: the original's GLB drone, bone arch, ringed-planet textures, props and foliage are not reproduced
  (no alien plants, cliff buildings or ruins). A licensed catalog drone exists (`library:quaternius-flying-gun-drone`, CC0) but it is
  a gun robot, not a quad-rotor, so it was not used. Meshy generation was not attempted.
- Time Trial only, Vesper Heights only. Rivals, AI, items, weapons, menus, garage, audio, ghost and the minimap are not ported.
  The original's Grand Circuit map (the only one with rain) is not ported, so the "rain" frames of the Phase B exit do not exist.
  No title/start, pause or results screens, no audio.
- The HUD's smoothed meters match the original's formulas (unit tested), but the original's DOM values are only refreshed when
  its own render runs, so only position, lap, race clock, best lap and takedown text are compared against it.
- The lighting is inline hemisphere plus sun on unlit custom materials: no PBR, IBL, cascaded shadows or SSAO.
- Camera: the chase rig is framed like the original but is not the original's rig (no roll or fov kick tuning beyond `CFG.camera`).

## Running it

`examples/heatsink-port/index.html` (`?autostart=1`, `?manual=1` for stepping only). Hooks on `window.__AURA_HEATSINK__`:
`state`, `stepFrames`, `replay(text)`, `replayStart/replayTo`, `frame`, `pixels`, `routeHealth`. Browser checks run remotely only
(`tests/browser/heatsink-port.spec.ts` via `tools/remote-acr/run.sh`); the blind comparison is `tools/crayon-capture/heatsink-judge.ts`.
No engine changes were needed for the port itself.

## Meshy art pass (2026-10-23)

Nine generated models (see `assets/ATTRIBUTION.md` for prompts, task ids, sizes and the rights basis; ledger tag `heatsink`, 260 credits recorded of the 800 cap) replace the primitive stand-ins:

- **Player drone**: a generated quad-rotor body (`drone2.glb`, ~40k vertices) replaces the 23-primitive craft. Its camera gimbal is the nose and must point along the track's +X; a +90 degree yaw rendered the drone backwards in the first capture, so `HULL_YAW = -pi/2`. The generated rotor blades are static (no spin, no rear exhaust sticks or glow spheres any more; the exhaust point particles remain). A first wedge-shaped hover-craft candidate was discarded after the design judge pointed out the original's vehicle is a quad-rotor.
- **Checkpoint gates**: one instanced pylon model (`gate-pylons`, two per checkpoint) instead of cylinders; the veil quads stay procedural.
- **Pickups**: `pickup-shield.glb` (cyan crystal in a cage) and `pickup-repair.glb` (mint core in a finned ring); **barrels**: `barrel.glb` (12 nodes, still driven per frame by the sim).
- **Scenery** (`sceneryNodes` in `models.ts`, deterministic, beyond the guard rails, sim-independent): mushroom trees, coral plants, monoliths and ruin arches as four `instances.model` classes.
- The models are lit PBR surfaces, so the world now has a cool hemisphere fill and a warm key light; the custom road/sky/neon shaders ignore both. Models load through the production-safe path (same-origin pathname + sha256).

**Terrain-over-the-road at step 4500, found and fixed.** The track crosses over itself near s ~ 980: the upper stretch's wide shoulder skirts (`buildShoulders`) hung ~30 m above the lower road and filled the top of the frame like a ceiling. `buildShoulders` now leaves out any quad that sits more than 6 m above another stretch of road within 55 m (spatial hash over the road samples, own +-150 m excluded). A geometry probe finds no overhead terrain triangles at that spot afterwards, and the step-4500 frame shows the open canyon.

**Capture spec**: `tests/browser/heatsink-port-meshy.spec.ts` is the Phase B spec with 8 frame steps and a 10-frame camera lead; under SwiftShader the 16-step, 30-frame version now exceeds its 25-minute timeout because the lit scene is heavier.

**Public packages only.** `track.ts` imports `CatmullRomCurve3` and `Vector3` from `@aura3d/math`. That is a published, documented package (`docs/api/public-api.md`, `## @aura3d/math`), not an internal or deprecated path, and the `@aura3d/engine` root has no spline class, so the import stays. The port imports nothing from `@aura3d/engine/production-runtime`, `/rendering` or other deprecated subpaths.

## Strike layer (2026-10-24, game rework)

The ported Time Trial had no goal beyond the clock: the original's weapons, rivals and items were out of scope, so the player flew a lap with nothing to hit. `operation.ts` adds an objective loop **on top of** the ported rules, as a pure layer that only reads the player and writes the gun fields (`gunHeat`, `gunCd`, `gunLocked`), `takedowns` and the barrels' `alive`/`respawn`. None of those feed the drone's movement, so `reference-replay.test.ts` is unchanged and still exact; `strike.test.ts` additionally replays the reference movement with the gun held down and requires identical player state at every sampled step.

- **Targets**: 16 per lap, seeded (`STRIKE.seed`) along the lap with lateral offsets inside 55% of the road half-width, every fourth a heavy (6 hp, 250 points; sentries 3 hp, 100). They hover 5 m over the road, revive each lap, and are drawn as a glowing core in a spinning ring (two primitives each).
- **Gun**: the original's tuning (`CFG.weapons`: 330 m/s, 0.75 s life, 0.085 s rate, 0.05 heat per shot, cool 0.45/s, lockout 0.35) on the existing heat meter. Hit tests are swept sphere checks against targets and barrels, with 1.5 m of aim slack in place of the original's cone assist. Overheat locks the gun until it cools below the lockout.
- **Barrels**: a shot barrel pays 150, respawns after 25 s, and blasts targets within 14 m for 3 damage (it never hurts the player, unlike driving into one).
- **Score**: kills x multiplier (1 + one per two kills in the chain, max 5, 3 s window, reset by a crash), barrels the same, plus unmultiplied boost pad 25, checkpoint 100, pickup 50 and a 500 clean-lap bonus.
- **Medals**: only for a finished race: bronze 16, silver 30, gold 42 of 48 kills. Calibration: the reference movement with the trigger held and no aiming lands 6 kills in 1.55 laps (about 12 over three), so a medal needs real aiming.
- **HUD and flow**: score, multiplier, targets block; objective line from the countdown, then the next target distance and the next medal; results show medal, score, kills, barrels, best chain and accuracy.
- **Not verified**: the full game never completes automated checks on software GL, so the live feel of aiming, the camera shake and the audio were not judged by a person; see `evidence/heatsink-port/rework/README.md` for what was and was not run.

## Audit fixes (2026-10-29, lane G19)

These supersede the strike-layer numbers above where they differ. Rows refer to `docs/audits/sections/game-19-heatsink-port.md`.

- **GO banner (HP-01)**: `Race.goT` counts wall-clock seconds in the race state; `hud.countText` shows GO for 0.8 s, then clears, so the objective line is visible for the rest of the race.
- **Barrels (HP-02)**: a barrel is hit as a vertical capsule from the road to 6 m (`STRIKE.barrelHitTop`), so a bolt fired at the 5.3 m hover height connects. The old sphere at the barrel's centre sat about 4 m below every bolt.
- **Chain (HP-11)**: after a kill the window is the travel time to the next live target or barrel at the current speed plus 1.5 s, between 3 and 9 s. Targets sit 350 to 460 m apart, which the fixed 3 s window never covered at speed.
- **Medals (HP-14)**: bronze 16 and silver 30 kills; gold 36 kills inside 5:00. Lane-follow bot (`bot.ts`): 80 m/s finishes in 292 s with 42 kills (gold); 40 m/s gets 42 kills in 574 s (silver); 115 m/s finishes in 209 s with 32 kills (silver).
- **Touch (HP-03)**: on coarse pointers (or `?touch=1`) the page shows steer, brake, fire, boost, drift and overdrive buttons bound through `bindGameTouchControls` (synthetic key events on the same key map), the drone throttles by itself, and pointercancel releases a held button.
- **Pause and errors (HP-05, HP-07)**: Esc or the corner button opens a pause panel; blur and a hidden tab pause a race; a paused race freezes render time. `tick` schedules the next frame first and catches render errors into an error panel with a restart; a restart clears every dynamic buffer.
- **HUD (HP-06, HP-15)**: HULL pips (3 crashes are survived; the 4th is a DNF) replace TAKEDOWNS, TIME carries the best lap, the kills block reads KILLS / RACE, the gun meter reads LOCKED while overheated, and a crash writes its reason and the crashes left for 1.5 s.
- **Quality (HP-12)**: coarse-pointer devices default to the low tier, which loads `assets/models-lite/` (512 px maps, a quarter of the texture memory; drone 15k triangles instead of 55.7k; built by `assets/provenance/make-lite.mjs`). A frame-time governor lowers the pixel-ratio cap when frames average over 25 ms.
- **Motion and keys (HP-13)**: `prefers-reduced-motion` (or the menu toggle, saved in localStorage) removes camera shake, caps the speed FOV kick at 6 degrees and halves the speed streaks. Every action can be rebound from the menu; Esc, Enter and M are reserved.
- **Sound (HP-16)**: race cues (countdown, GO, checkpoint, lap, boost pad, pickup, crash, DNF) and a quiet engine voice (two detuned saws through a low-pass, 70 to 210 Hz with speed, silent when stopped or paused) next to the strike cues; a menu button mutes.
- **Look (HP-08, HP-17, HP-19)**: a soft blob on the road under the drone, wider and fainter with height. Heavies have a cube core and a second ring; every damaged target shows a health ring. Bloom is intensity 0.6, threshold 1.0, no deprecated `radius`.

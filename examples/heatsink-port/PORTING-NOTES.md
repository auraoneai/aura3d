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

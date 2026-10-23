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
`normalNode`). They are **not** translated node for node. `shaders.ts` replaces them with five GLSL 300 es programs
(road, solid, additive veil, sky dome, point sprites) whose inputs come from the map's `lighting`, `atmosphere` and district
data. They approximate the look from captured frames; they do not reproduce the node graphs, normal perturbation, PBR
response, shadows, SSAO or the original's bloom and grade settings. Hemisphere plus sun lighting and exponential height fog
are evaluated inline because `material.custom` is unlit.

## Gaps (all visible in `evidence/heatsink-port/frames/`)

- Assets are procedural: the original's GLB drone, bone arch, ringed-planet textures, props and foliage are not reproduced.
  The drone is six primitives; hills are faceted cones; there are no arches, foliage or ground detail.
- Time Trial only, Vesper Heights only. Rivals, AI, items, weapons, menus, garage, audio, ghost and the minimap are not ported.
  The original's Grand Circuit map (the only one with rain) is not ported, so the "rain" frames of the Phase B exit do not exist.
- The HUD's smoothed meters match the original's formulas (unit tested), but the original's DOM values are only refreshed when
  its own render runs, so only position, lap, race clock, best lap and takedown text are compared against it.
- Sky dome: a `side: "back"` or 3400-unit sphere drew nothing in remote probes; the port uses `side: "double"` at size 900 (engine cause not isolated).
- Camera: the chase camera follows `CFG.camera` values but is not the original's rig; framing differs.

## Running it

`examples/heatsink-port/index.html` (`?autostart=1`, `?manual=1` for stepping only). Hooks on `window.__AURA_HEATSINK__`:
`state`, `stepFrames`, `replay(text)`, `replayStart/replayTo`, `frame`, `pixels`, `routeHealth`. Browser checks run remotely only
(`tests/browser/heatsink-port.spec.ts` via `tools/remote-acr/run.sh`); the blind comparison is `tools/crayon-capture/heatsink-judge.ts`.
No engine changes were needed.

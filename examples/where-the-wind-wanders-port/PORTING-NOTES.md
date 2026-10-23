# Where the Wind Wanders on Aura3D: porting notes

Source of truth: `tests/fixtures/crayon/where-the-wind-wanders/game-module.mjs` (see PROVENANCE.md there).
Reference: `evidence/crayon-capture/where-the-wind-wanders-reference.json` (2 sessions of the original on ACR).

## What is ported exactly (simulation parity)

`sim.ts` reproduces the original's `ashore` mode:

| Original | Port |
| --- | --- |
| walking speed `3.2 * dt`, dt = clamp(frame gap, 0, 0.04) | `WALK_SPEED`, `MAX_DT` |
| walk direction from the camera's matrixWorld right vector, flattened | `cameraAxes(cam)` from the camera's x/z offset |
| camera look target eases to (x + 2, z - 3.5) with `1 - exp(-2.5 dt)`; camera position eases to target + (-1.4, 4.5, 20.5) with `1 - exp(-3 dt)` | `CAMERA_FOLLOW`, `TARGET_RATE`, `CAMERA_RATE`; the lag tilts the walking axes by up to ~0.1 rad, so it is part of the trajectory |
| `Bs` clamp: bounds, cliff line at z = -13 east of x = 12 with jetty gaps, 7 circle colliders | `clampWalkable` |
| `_e2` rails (world edge, cliff line, 3 structure arcs of 21 points) + 8 fence rails, resolved by a sub-stepped 4-pass wall slide, radius 0.38 | `buildStaticRails`, `buildFenceRails`, `slideAlongRails` |
| letter reach 2.65, bell reach 3.1, bell needs 3 letters | `nearbyInteraction`, `interact` |
| facing hysteresis (`dl`) and stride (distance / 2.2) | `nextFacing`, `stride` |
| hop: takeoff 0.1 s, air 11.2/13 s, landing 0.16 s | `advanceHop` |

Replaying the original's recorded key script (2,098 steps, three letters and the bell) through `sim.ts` matches the
original's trajectory with a worst difference of 7e-10 world units, below the original's own session-to-session
spread (1e-9). Virtual frames are 16.7 ms (the original's 60 fps throttle would otherwise skip frames).

## Rendering: procedural stand-ins

The original draws painted sprite art fetched from a remote bucket; the port draws everything procedurally.
The original has ~15 named shader program variants (`customProgramCacheKey`), instantiated many times (the probe counted
67 live `ShaderMaterial`s). The port maps them to five `material.custom` programs:

| Original program(s) | Port program |
| --- | --- |
| `terrain-conforming-cover`, `rooted-hill-groundcover`, `island-rooted-understory`, `mountain-bank-detail`, `batched-hill-plants`, `mossy-building-footing`, `instanced-sea-canopy`, `sea-forest-wind` (wind-swayed painted cards) | `WIND_*`: one merged mesh of 3,820 crossed cards with per-vertex `tint`, `sway`, `phase` attributes |
| `painted-meadow` | `PAINT_*`: vertex-tinted, lambert-lit, painted noise terrain |
| sea / water | `SEA_FRAGMENT` |
| `jetty-painted-grain`, `pier-wood-grain` | `SOLID_*` (grain in the fragment shader) |
| mist ribbons (`$s` haze shader) | `HAZE_*` |

## Not ported (gaps)

- Boat voyage, Stillwater Isle, the island trail, reflections, the bench, journal UI and story text, audio, save slots,
  touch controls and the `playtest` autopilot (it only runs on localhost).
- Painted sprite art and the traveller's walk-cycle frames: the port uses a capsule, head and hat.
- The original's stream and path carving of the terrain: the port keeps the analytic height field and a painted path stripe.
- Foliage placement is the port's own seeded scatter, not the original's.
- Height (y) is visual only; the simulation is x/z, so the port's y differs from the original's carved terrain.

## Hooks

`window.__AURA_WIND__`: `state()`, `applyInput(keys, act)`, `stepFrames(n, keys)`, `runScript(segments)`, `reset()`,
`routeHealth()`, `frame()`, `pixels()`. `?manual=1` stops the real-time loop so tests step the simulation themselves.

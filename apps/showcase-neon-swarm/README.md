# Neon Swarm

Neon Swarm is a finite five-wave top-down horde-survival prototype. A typed
courier crosses a rain-dark street arena, collects risky gold charge pickups,
chooses upgrades between waves, and uses pulse fire, dash invulnerability,
grazes, and a charged radial burst to survive a real 320-drone finale.

**Capability label: `prototype` using the `createAuraApp` root safe API.**
Public promotion remains blocked until independent review approves the exact
hash-bound artifact set. This route does not claim production rendering,
WebGPU, or a reusable game kit.

## Route and run arc

```text
/apps/showcase-neon-swarm/
```

The authored campaign has exactly five stages:

1. `opening` — 36 grunts teach movement, orbit pressure, pulse fire, and the
   first gold charge pickup.
2. `upgrade` — 84 drones introduce elites, followed by a choice of fire-rate,
   dash-cooldown, or shield upgrade.
3. `compression` — 168 drones and a 3.5-unit arena inset increase pressure.
4. `elite` — 248 drones, 40 elites, and a 4.5-unit inset create the score beat.
5. `finale` — 320 live drones, including 48 authored elite spawns, inside a
   5.5-unit inset; survive 46 seconds or clear the field to complete the run.

The completion screen records seed, score, kills, and max combo. The terminal
outcome hash is deterministic over gameplay truth: seed, final state, wave,
score, kills, max combo, HP, upgrades, and all five schedule checksums.

## Renderer and gameplay truth

Enemy truth lives in two bounded typed-array simulations mirrored by native
root-safe instance pools:

- `instances.capsule` grunt pool, capacity 360;
- `instances.box` elite pool, capacity 96;
- no one-scene-node-per-drone architecture;
- route-local deterministic seek, separation, orbit, hit-flee, elite
  telegraph/burst, obstacle slide, and compressed-arena steering;
- no Recast navigation or crowd-simulation claim.

The retained 320-drone telemetry is produced by
`tests/browser/neon-swarm-instancing.spec.ts`. It binds the exact screenshot
hash to observed instance count, native instanced submissions, bounded draw
calls, non-black pixels, and console errors. Route-local simulation timing is
recorded separately in `performance-report.json`; it is not a GPU frame-time
or renderer-parity claim.

## Visual language

- The typed courier is the white/cyan primary character. A thin world-space
  pulse-radius ring and aim vector keep it findable at maximum density.
- Grunts are magenta capsules; elites are red/pink boxes with a distinct
  telegraph and speed-burst cycle. They are explicitly abstract geometry, not
  character models.
- A gold shape-distinct relay is a real once-per-wave spatial collectible. Its
  sensor awards 250 score and 25% burst charge, then hides the scene node.
- Gold intermission doors apply real immutable/clamped upgrade changes.
- Red-orange scene boundaries move inward for waves three through five.
- Bloom, camera impulse, vignette flash, and spark density are reduced or
  removed under reduced-motion/reduced-flash preference without changing
  collisions, timers, enemy count, pickups, or scoring.

## Typed assets and provenance

| Typed reference | Role | Original source / license |
| --- | --- | --- |
| `assets.neonCourierAvatar` | static primary courier character | Daniel Darko, Sketchfab/Objaverse, CC-BY-4.0 |
| `assets.neonBarricadeProp` | street obstacle/landmark | Kyle Burton, Sketchfab/Objaverse, CC-BY-4.0 |
| `assets.neonStreetLampProp` | street landmark | Humphrorange, Sketchfab/Objaverse, CC-BY-4.0 |

Each model is `quality: release`, retains its durable source page and download
URL, and has a hash-bound `createAuraApp` rendered probe synchronized into
`aura.assets.json`. The oversized authored lamp is explicitly normalized by
the route's `targetMaxDimension: 4.2`; the static flat-color courier has a
hash-bound readable-material probe and manifest-override +Z neutral facing.
No rig, clip, skin, or humanoid-controller readiness is claimed.

Thirteen deterministic synthesized cues are registered as typed CC0 assets:
pulse fire, drone hit, drone death, player hurt, dash, pickup, wave start, wave
clear, death, ambient hum, radial burst, graze, and combo break. Playback uses
`createGameAudio` on `sfx` and `ambient` buses and publishes unlock, playback,
suppression, typed-count, and error evidence.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move the courier |
| Mouse | Aim |
| `J` / left-click | Pulse fire |
| `Shift` | Dash with 0.25-second invulnerability |
| `Space` / `K` | Spend a full meter on the radial burst |
| `P` | Pause all simulation timers |
| `R` | Reset with the next deterministic seed |
| Touch | Independent move and aim/fire sticks plus a dedicated burst button |

## Evidence contract

`window.__AURA3D_SHOWCASE_NEON_SWARM__` is the standardized gate global;
`window.__NEON_SWARM_EVIDENCE__` exposes the same live object. It includes
mounted/status state, five-wave campaign truth, player/enemy/pickup state,
instance and draw telemetry, wave checksums, deterministic terminal hash,
upgrades, burst/graze/combo-break counters, full typed-audio proof, systems,
controls, and claim boundary.

Authoritative retained evidence:

- `tests/reports/neon-swarm/playable.json` — movement, spatial pickup, combat,
  graze, burst, combo break, upgrade, death, and reset;
- `tests/reports/neon-swarm/campaign-completion.json` — five stages, exact
  320-live finale, completion, and two matching terminal hashes;
- `tests/reports/neon-swarm/mobile-playable.json` and
  `reduced-motion.json` — touch and accessibility truth;
- `tests/reports/neon-swarm/instancing-telemetry.json` — native instances,
  draws, and pixel evidence;
- `tests/reports/showcase-route-primary-probes/showcase-neon-swarm.json` —
  isolated typed-courier route composition;
- `apps/showcase-neon-swarm/performance-report.json` and `route-health.json` —
  current machine gates and the remaining independent-review blocker.

Every retained gameplay screenshot is source-bound by SHA-256 in its producer
report. Automated checks and agent inspection are not independent human
approval; `publicShowcase` remains `false` until that verdict is recorded.

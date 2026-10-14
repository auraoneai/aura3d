# Courier Rush

Status: machine-complete prototype — all repository-controlled gates pass; independent exact-artifact review remains pending

Claim label: `prototype` · renderer path: `createAuraApp` root safe API

Primary typed assets: `assets.courierVan` (delivery van hero), `assets.courierParcel` (cargo), `assets.courierTrafficSedan` + `assets.courierTrafficHatch` (AI traffic), and `assets.courierZoneBollard` + `assets.courierZoneAwning` (zone props). The six CC-BY models retain their original Objaverse/Sketchfab authors, source pages, hashes, release-quality classification, and root-safe rendered probes through `scripts/register-models.mjs`; they are not in-repo synthesized models. All ten audio cues are deterministic synthesized WAVs (`scripts/build-sfx.mjs`, CC0, author "Aura3D synthesis") reproducibly registered by `scripts/register-sfx.mjs`. No raw route URLs or invented IDs are used.

## What this route is

Night-shift courier on the proven cityBlock night kit. The dispatch radio beeps: drive to a lit pickup sensor, carry the typed parcel in the van bed, and drop it in the marked zone before the dispatch timer dies. A shift is five deliveries (60/50/45/40/40 s timers); delivering with ≥40% of the window left is an early drop that chains +0.2× onto the combo multiplier, while a late drop resets it to 1×. Collisions with traffic or street props add strikes; three strikes or one expired timer ends the shift into a summary, and `R` resets everything.

## Why this is not Turbo Drift Circuit (differentiation)

Courier Rush reuses the same public vehicle helper family as Turbo Drift Circuit — `createGameArcadeVehicle` for the player van and `createVehicleDriverAi` for traffic — but produces a clearly different driving personality and a different game:

- **Van feel versus racer feel.** The delivery tune (`src/van.ts`) is soft-sprung and heavy: max speed **13** (the racer runs pace-multiplied certified speeds well above that), acceleration **7.2**, drag **1.9** (versus Turbo's published 0.28), steerRate **2.35** (versus the racer's certified ≥2.7), plus strong brakes (20). Release the throttle and the van settles quickly; turn-in is heavier; there is no drift-boost assist.
- **No racing kit, no certified topology.** This route inherits nothing from the certified circuit: the world is a new route-local street grid laid over the city kit's roads, documented as such in `src/city.ts`. There are no laps, no drift score, no start/finish, no rival.
- **The clock and the traffic are the opponents.** Sensor pickup/drop zones, per-delivery dispatch timers, strike counting, and combo scoring replace lap timing entirely.

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrows | Drive |
| `Space` | Handbrake |
| `E` | Interact inside a zone (sensors also fire automatically on entry) |
| `P` / `Esc` | Pause |
| `R` | Reset shift |

Touch: on-screen throttle/reverse/steer/brake buttons plus an interact button, bound through `bindGameTouchControls`.

## Systems

- **Dispatch** (`src/dispatch.ts`) — pure, deterministic delivery queue: zones, timers, strikes, combo math. Unit-proven in `tests/unit/apps/courier-rush-dispatch.test.ts`.
- **Traffic** (`src/traffic.ts`) — eight `createVehicleDriverAi` cars on two authored lane loops (both directions of the same outer rectangle, kept off the courier's main roads), each with a deterministic seed, leader-following gaps, and authored courtesy stops that brake, hold, and honk when the van is near. Unit-proven determinism in `tests/unit/apps/courier-rush-traffic.test.ts`.
- **City** (`src/city.ts`) — cityBlock night preset at 6× scale, one documented node edit (the kit's decorative parked cars are removed because typed GLB traffic drives those lanes), street graph, and static lamp-pole colliders.
- **Audio** (`src/courier-audio.ts`) — four buses (engine/city/fx/ui) through `createGameAudio`; ten cues including the dispatch blip at every new job. Playback only after a user gesture unlocks the AudioContext.

## Boundary (read before quoting this route)

- **Arcade kinematic van only.** `createGameArcadeVehicle` integrates authored values; there is no physical suspension, no tyre model, no damage physics beyond strike counting, and no police/pursuit/open-world claims.
- **Traffic is lane-locked.** AI cars hold their authored loops with courtesy stops; they do not navigate freely or yield the whole loop to the van (a mutual-yield deadlock was observed and deliberately removed).
- **City towers are set dressing without colliders**; streets, lamp poles and traffic footprints carry the gameplay strikes via circle proxies.
- DOM HUD elements are UI only. Every world claim above is proven by Aura3D-rendered pixels and runtime telemetry (`window.__COURIER_RUSH_EVIDENCE__`), asserted in `tests/browser/courier-rush-scene.spec.ts` and `tests/browser/courier-rush-playable.spec.ts`.
- Reduced motion gates the drop look-back camera swing and scene FX pulses; pause freezes the van, traffic, timers, and audio cues together.

## Evidence map

| Claim | Proof |
|---|---|
| Queue/timer/strike/combo math, queue-chaining rule | `tests/unit/apps/courier-rush-dispatch.test.ts` |
| Lane loops on real streets, seed determinism, courtesy stops | `tests/unit/apps/courier-rush-traffic.test.ts` |
| Sensors fire on trigger enter, parcel visible in bed, live pixel delta | `tests/browser/courier-rush-scene.spec.ts` |
| Keyboard input changes state, pause freeze, strikes, timer fail, reset, full autopilot shift inside authored timers | `tests/browser/courier-rush-playable.spec.ts` |
| Source-bound full shift: five pickups/drops inside timers, score, combo, typed parcel | `tests/reports/showcase-courier-rush/full-shift-evidence.json` |
| Source-bound collision/timer failure and full reset | `tests/reports/showcase-courier-rush/failure-evidence.json` |
| Real coarse-pointer phone drive and readable mobile frame | `tests/reports/showcase-courier-rush/mobile-evidence.json` |
| Reduced-motion route truth and retained frame | `tests/reports/showcase-courier-rush/reduced-motion-evidence.json` |
| Dispatch, pickup, parcel, intersection, payoff, failure, completion, mobile, reduced artifacts | `tests/reports/showcase-courier-rush/` |
| Route-local timing and renderer budget | `performance-report.json` |
| Typed-van route-primary isolation | `tests/reports/showcase-route-primary-probes/showcase-courier-rush.json` |

Run the narrow suites:

```bash
pnpm exec vitest run tests/unit/apps/courier-rush-dispatch.test.ts tests/unit/apps/courier-rush-traffic.test.ts
pnpm exec playwright test tests/browser/courier-rush-scene.spec.ts tests/browser/courier-rush-playable.spec.ts
pnpm --dir apps/showcase-courier-rush evidence:performance
pnpm --dir apps/showcase-courier-rush evidence:route-health
pnpm --dir apps/showcase-courier-rush build
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-courier-rush/dist --release --source apps/showcase-courier-rush/src --asset courierVan --asset courierParcel --asset courierTrafficSedan --asset courierTrafficHatch --asset courierZoneAwning --asset courierZoneBollard
```

`scripts/write-route-health.mjs` generates `route-health.json` only after validating current producer/source/artifact hashes, all four browser reports, performance, typed asset/audio provenance, the 3/40 primitive budget, and the blocked route registration. The latest retained measurements are dispatch p95 0.0008 ms, eight-car traffic p95 0.0088 ms, and 376/600 draw calls. The exact rebuilt release deploy passes with zero failures and zero warnings.

Human visual review of the final retained artifacts is requested and pending; until it passes, this route remains `prototype` and out of the promoted public showcase.

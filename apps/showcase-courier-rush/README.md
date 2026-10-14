# Courier Rush

Status: single-path rebuild — independent exact-artifact review remains pending

Claim label: `prototype` · renderer path: `createGame` (`@aura3d/engine/game`) shell

## What this route is

Night-shift courier on the engine city-block night kit. Drive the typed
delivery van to the lit pickup dock, carry the parcel to the drop dock,
and beat the per-delivery dispatch timer. A shift is five deliveries
(60/50/45/40/40 s timers); delivering with at least 40% of the window
left is an early drop that chains +0.2× onto the combo multiplier, while
a late drop resets it to 1×. Collisions with lamp poles or traffic add
strikes; three strikes or one expired timer loses the shift, clearing
all five deliveries wins it, and `R` resets everything.

Typed assets (`src/aura-assets.ts`, all admitted in the repo-root
manifest): `assets.courierVanMeshyV2Decimated` (hero van),
`assets.courierParcel` (visible cargo), `assets.deliveryCar` +
`assets.showcaseCityVehicle` (lane-loop traffic, metre-scale bodies),
and `assets.courierZoneBollard` + `assets.courierZoneAwning` (dock
props). Ten synthesized WAV cues (`scripts/build-sfx.mjs`, CC0) cover
engine, dispatch, pickup/drop, strikes, horns, and shift end.

## Layout

- `src/main.ts` — the one boot path for every URL: createGame shell,
  arcade-vehicle van, chassis-grounded presentation, chase camera,
  HUD widgets (score/timer/objective/speedometer/minimap), traffic,
  strikes, and the `window.__aura3dGameSnapshot` evidence publisher.
- `src/zones.ts` — fresh route-local city data: street segments read
  off the kit's own road geometry, six delivery docks, lamp colliders,
  tower footprints, the traffic rectangle, spawn, and the
  `streetSurfaceY` query the chassis samples per wheel.
- `src/dispatch.ts` — pure deterministic delivery queue, timers,
  strikes, and combo scoring over `./zones` (unit-proven in
  `tests/unit/apps/courier-rush-dispatch.test.ts`).

The van's presented height comes from `createVehicleChassis` sampling
`streetSurfaceY` at each wheel plus `groundedFittedModelPosition` —
there is no constant ride-height lift. Planar motion is
`createGameArcadeVehicle` with the delivery tune (max speed 13,
acceleration 7.2, drag 1.9, steerRate 2.35, brakes 20): a soft, heavy
van next to Turbo Drift's racer, with no laps, drift score, or rival —
the clock and the traffic are the opponents.

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrows | Drive |
| `Space` | Handbrake |
| `E` | Interact inside a dock (sensors also fire on entry) |
| `R` | Reset shift |

Touch: steer-pedals preset from the createGame shell.

Scripted openings for tests: `?scenario=carrying` (one short leg from
the first drop), `?scenario=final-delivery` (carrying the last parcel),
`?scenario=low-time` (2.5 s on the clock). Reset always returns to the
standard shift opening.

## Boundary (read before quoting this route)

Prototype claim only. Kinematic arcade driving with a presentation
chassis — no physical tyre, suspension-solver, mass, or damage claim.
Traffic is four cars on an authored avenue/cross-street rectangle (no
navmesh, free-roam AI, or courtesy-stop claim). No public-showcase or
launch-readiness claim until independent exact-artifact review accepts
the rebuilt route.

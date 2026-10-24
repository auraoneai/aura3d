# Teleoperator: player-versus-traffic contact

Lane `rework-teleop` (docs/audit/motion-audit.md, high severity: a manual driver passed through cars). All remote runs are software WebGL2 (SwiftShader) at 640x360, not a real GPU.

## What changed

- `apps/showcase-teleoperator/src/collision.ts` (pure, no DOM): each of the ten traffic cars has its own `createImpactWorld` with the car's box at the origin. The player is stepped in the car's frame (relative position and velocity), so a moving car acts as a wall that moves with it and each new contact raises one impact. `applyCollisionPenalty` is the ride rule. `createTrafficRecovery` makes a struck oncoming car stop dead, hold 1.2 s, then ramp back to cruise.
- `main.ts`: traffic positions now advance before the player is drawn; contact is resolved on the post-integration state; hit-stop scales the frame step, camera shake offsets the world, a 12-sphere spark pool bursts at the contact point, a synthesized `collision` cue plays through `createCueBank`, and the evidence beacon carries `collisions` and `streetMultiplier`. Three QA drive methods (`qaPlaceTrafficCar`, `qaSetPlayer`, `qaCollisions`) are added to the existing `__AURA3D_SHOWCASE_TELEOPERATOR__` object.
- Rule (new: the game never changed `comfortScore` or the street multiplier before): a hit at 1.5 m/s or more, at most once per 0.5 s, costs a comfort ride `2.5 + 1.2 x speed` comfort points, and costs a street ride one multiplier step (floor 1) and `40 x speed` bounty. A popup names the loss.
- The speed change comes from the collision itself. There is no scripted slow-down.

## Measured: unit level (`unit-measurements.json`, `tests/unit/teleoperator/collision.test.ts`, 14 tests)

Nine cases (rear-end into a 4 m/s car, head-on into a 13 m/s oncoming car, side-swipe at four lateral speeds) at player speeds 8, 16 and 30 m/s: exactly one impact event each, penetration 0 m, no pass-through, deterministic (same drive twice gives the same result).

## Measured: live page, remote (`remote-cases.json`, spec `tests/browser/rwtel.spec.ts`)

Cars staged through the QA hooks, driver in manual mode, steer released and brake held at the first contact. All nine cases raise exactly one impact and never pass through the car (minimum centre gap 4.73 to 4.93 m behind and head-on, against the 4.7 m expected contact distance).

| Case | Player speed | Impact approach speed | Events | Passed through |
|---|---|---|---|---|
| rear-end (car 4 m/s) | 8 / 16 / 30 | 5.5 / 11.36 / 25.68 | 1 / 1 / 1 | no / no / no |
| head-on (car 13 m/s) | 8 / 16 / 30 | 22.5 / 27.88 / 42.2 | 1 / 1 / 1 | no / no / no |
| side-swipe (steering into the car) | 8 / 16 / 30 | 4.98 / 7.56 / 12.27 | 1 / 1 / 1 | no / no / no |

Runs: `rwtel-4` (eight cases; the ninth hit the 25 minute test budget), `rwtel-5` (side-swipe 30 m/s, no console errors), `rwtel-6` (the three 16 m/s cases with the app paused three frames after the hit, `RWTEL_ERRORS []`). Frames: `frames/rear-16.jpg`, `head-16.jpg`, `side-16.jpg` (HUD hidden). They show the player's car stopped against the traffic car. The spark burst is too small to see at 640x360.

## Findings along the way

- Manual mode holds a 9.5 m/s cruise floor, so a driver who does nothing re-accelerates into a slower car and hits it again. That is a second contact, not a double event. The spec brakes at the first hit to measure one contact.
- An oncoming car that does not react bulldozes a stopped player backwards at its own speed. Hence the recovery rule for oncoming cars. A same-direction car keeps its speed.
- The kit integrates the body itself, so the module rewinds one step before resolving.

## Not verified

- Autopilot (L3, L4, L5) over a long drive: collisions apply in every mode, but I did not measure how often the autopilot's own lane changes (for example towards the kerb lane) now touch traffic and slow a ride.
- Hit-stop, camera shake, the spark burst and the cue were not seen or heard; only their wiring and the impact count are tested. Camera roll from the shake kit is not applied.
- The game has no replay, so there is no reference to regenerate.
- No real-GPU run.

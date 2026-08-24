# Patrol Wing

Patrol Wing is a root-safe `createGameApp` prototype with route-local authored arcade flight, ordered patrol sensors, seeded drone pursuit, combat, hull pressure, and landing classification. Four original typed CC0 models provide the cream/red player aircraft, two black/orange drone silhouettes, and the frontier pad/beacon; eleven typed original CC0 cues provide engine, wind, weapon, hit, warning, ring, touchdown, failure, and clear feedback.

## Controls

- `W` / `S`: pitch down / up
- `A` / `D`: roll left / right; bank also contributes authored turning
- `Q` / `E`: yaw left / right
- `Shift` / `Ctrl`: throttle up / down
- `Space`: fire
- `C`: chase/cockpit camera
- `P` or `Escape`: pause/resume
- `R`: full reset to the pad
- Named 44 px touch buttons expose pitch, roll, yaw, throttle, fire, camera, pause, and reset.

## Ownership and claim boundary

- Flight position, orientation, throttle response, speed, stall, crash, bounce, and touchdown rules are deterministic route-local TypeScript. They are intentionally arcade-authored and are not aerodynamic, rigid-body flight, or reusable flight-kit claims.
- Rapier owns only route-local ring, pad, player-proxy, and return-fire-orb sensor queries. The authored terrain height function owns terrain/ocean contact truth; no heightfield-collider claim is made.
- Drone pursuit and seeded routes are route-local. Root `game.combatWorld()` owns cannon hit/health resolution. No reusable dogfight AI or combat kit is claimed.
- Rings progress once per sensor entry and in order. Landing uses the visible pad center/radius plus speed, bank, descent, and alignment bounds from `flight.ts`.
- The best-path ghost is a visual input replay only; it has no collision, combat, sensor, score, or landing effect.

## Evidence boundary

Machine evidence includes focused unit tests, source-bound browser receipts and exact screenshots, release-model probes, route-primary evidence, performance sampling, strict deploy checks, and generated route health. These checks do not constitute independent human visual approval. The route remains `prototype-blocked` and `publicShowcase: false` until a separate reviewer approves the exact hash-bound desktop, mobile, and reduced-motion artifact family.


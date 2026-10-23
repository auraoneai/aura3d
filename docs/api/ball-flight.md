# `game.racketSports().ballFlight`: exact event-time ball flight

`ballFlight(config)` returns pure functions for racket-sport ball flight: closed-form integration of gravity and linear
drag between events, with impacts (bounce, net, net tape, boards) resolved at their exact time, so results do not depend
on the frame rate. It was extracted from the Aura Slam 3D tennis simulation, which replays the original game's physics
to 1e-12 on top of it (`tests/unit/aura-slam/physics.test.ts`).

Axis convention (different from the simple `stepBallPhysics`, which uses y as up): **x lateral, y along the court (the
net is at y = 0), z up**. Positions are in court units; `units` gives metres per unit per axis.

```ts
import { game } from "@aura3d/engine";

const flight = game.racketSports().ballFlight({
  units: { x: 5.018, y: 11.885, z: 2.177 },
  gravity: 9.81,
  drag: 0.09,
  ballRadius: 0.0335,
  net: { centerHeight: 0.914, postHeight: 1.07, halfWidth: 1.08 },
  surfaces: { hard: { rebound: 0.65, retention: 0.79 }, clay: { rebound: 0.7, retention: 0.72, rollingResistance: 2.4 } },
  defaultSurface: "hard"
});

const ball = { x: 0, y: 1, z: 0.4, vx: 0, vy: 0, vz: 0, active: true };
Object.assign(ball, flight.solveShot(ball, 0.3, -0.8, 0.9));   // launch velocities that clear the net
flight.advance(ball, 1 / 60, "hard", (type) => { /* "bounce" | "net" | "tape" | "board" */ });
```

| Function | Purpose |
| --- | --- |
| `sample(ball, t)`, `landing(ball)`, `timeToGround`, `timeToY` | Closed-form prediction (positions, velocities, impact time). |
| `solveShot(ball, x, y, time, clearance?)` | Launch velocities for a target; lengthens the arc until the net is cleared; throws if none exists. |
| `serveTrajectory`, `serveTargetNetRisk` | Fastest legal serve arc for a requested speed under a rise cap (`serveMaxRiseMetres`). |
| `advance(ball, dt, surface, onEvent)` | One frame of live flight with exact event times (max 8 events per frame). |
| `advanceLoose`, `releaseBall` | A dead ball keeps bouncing, rolls with per-surface resistance, hits the net and boards, then settles. |
| `rebound`, `deflectNet`, `netHeight`, `speedKph` | Building blocks. |

Options worth knowing: `boards` (angled rear walls in render units), `reboundShaping(ball)` (slice/topspin/touch factors
from your own ball markers), `net.tapeBand` and `net.postMargin` (net-cord and post tolerances in court units).
Line calls, scoring and AI are game rules and stay in the game. The simple per-frame `stepBallPhysics` remains for casual
games.

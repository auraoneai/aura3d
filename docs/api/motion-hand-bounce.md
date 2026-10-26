# createHandBounce: a ball that is really dribbled

`import { createHandBounce, measureHandBall, clampPalmReach, handBounceOverlayAngles } from "@aura3d/engine/game"`

One cycle per bounce. Phase 0 is the palm meeting the ball at the top; palm and ball ride down together, the ball leaves the palm, hits the floor with its centre exactly at `floorY + ballRadius`, rises and is caught by the palm again. The ball is positioned from the palm **as rendered**, so it can never bounce under a hand that could not follow its target (the Aura Hoops defect: the ball bounced about 0.9 m below a hand the arm could not lower).

```ts
const bounce = createHandBounce({ hand: "right", ballRadius: 0.13, floorY: 0, boneNames: skeleton.boneNames });

// fixed sim step, once per frame, while the handler holds the ball
const f = bounce.step(1 / 60, {
  speed: Math.hypot(holder.vx, holder.vz),   // or moving: boolean
  shoulderY,                                 // live world Y of the dribbling shoulder
  palm: renderedPalmWorld,                   // the palm as drawn (forearm bone + palm offset); omit until the rig is live
  holder: { x, z, vx, vz },
  hold: deadBall                             // check or inbound: phase held at the meet, ball in the palm
});
ball.position.set(...f.ball);                // f.phase, f.effort, f.contact, f.floorContact (play the bounce cue here)

const o = bounce.overlay();                  // upper body only: o.mode "overlay" (runner) or "pose" (stationary)
// o.bones: { Spine: { pitch }, Chest: { pitch }, Head: { pitch } } (radians, forward positive); o.arm: the arm bone names for your solver
```

- **Profiles.** Defaults are the Hoops numbers: standing 0.46 s with the palm between 1.02 m and 0.62 m, running 0.30 s with a lower apex (palm 0.92 m to 0.60 m, ball about 0.8 m). Override with `standing`, `running`, `armReach` (0.55 m), `ballGap` (0.09 m), `runSpeed` (0.45 m/s) and `phases`.
- **Body.** `effort` (0..1) is how hard the body works into the push: a stationary handler crouches (sink the hips and fold the knees yourself), a runner bends at the waist. `overlay()` returns only spine, chest and head pitch (and the dribbling arm's bone names): leg, hip and foot bones are never named, so the locomotion clip keeps owning the stride and foot slide does not change. Apply it with `setAnimationPose({ bones, mode: "overlay" })` on the actor (or replace the pose for a standing handler).
- **Arm reach.** The arm can only reach `armReach` below the shoulder. The cycle keeps palm targets inside it; run your arm solver on `palm` targets passed through `clampPalmReach(shoulder, target, reach)`.
- **Hand-offs.** `release()` returns `{ position, velocity }` at the hand (finite difference of the last two steps) for a pass, shot or drop, and stops the cycle: start the flight from that position and velocity and the ball leaves without a pop. `pickup(ballPosition)` resumes the cycle at the catch so the palm receives a loose ball where it is.
- **Determinism.** `step` takes a positive fixed `dt` (it throws otherwise) and reads no clock. `state()` snapshots phase, effort, palm and ball for QA hooks.

## Prove it: `measureHandBall`

```ts
const report = measureHandBall(samples, { floorY: 0, ballRadius: 0.13 });
// samples: { phase, palm: [x,y,z], ball: [x,y,z], dribbling? } per frame of a few seconds of dribble
// report.ok, report.failures, report.meetMax, report.floorContactMax, report.floorContactPalmHeightMax, report.floorError, report.maxDistance
```

Default limits (`DEFAULT_HAND_BOUNCE_LIMITS`): palm to ball at the meet and catch at most 0.12 m, at the floor contact at most 0.55 m, ball centre within 0.02 m of floor + radius, and never more than 0.9 m from the hand while dribbling. Run it over the human handler and two AI handlers, standing and running, with a fixed sim step so software-GL frame rates do not exaggerate a one-frame lag (Hoops uses `?diag=1&qaDt=0.0167`).

Where it fits: any ball held in a hand that bounces (basketball, handball, a ball-carrying runner). Not a fit: a ball at the feet (soccer dribbling is foot contact: see `createImpactWorld`), a racket or bat swing (`attachToBone`), or a thrown/shot ball (use `release()` and your flight code).

Source of truth for the numbers and lessons: Aura Hoops, `docs/agents/lessons-learned.md` M14, `evidence/aura-hoops-3d/dribble-fix/`.

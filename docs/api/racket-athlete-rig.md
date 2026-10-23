# Racket-sport athlete rig (`game.racketSports().athleteRig`)

A procedural athlete for racket sports, extracted from the Aura Slam 3D port. It has two parts that you can use
independently; costume, colours, head/torso placement and the stroke-specific arm poses stay game code.

```ts
import { game } from "@aura3d/engine";
const { athleteRig } = game.racketSports();

// Pure locomotion solver: stride cycle, split step, slide and planted-stroke stance.
const loco = athleteRig.locomotion(
  { side: "player", moveBlend, stride, vx, vy, splitStep, swingAge, strokeConnected, swing, stroke, slideRemaining },
  { unitsX: 5.5, unitsY: 8 } // render units per court unit (defaults are the tennis court)
);
// loco.hipY, loco.legs[0|1].{hip,knee,foot,planted}, loco.move, loco.dx/dz, loco.wind/follow/settle, loco.slide, ...

// Pose leg, arm and racket cylinders from root-local pose points (two-bone IK elbows, racket along a direction).
athleteRig.applyLimbs(handles, { shoulderY, legs: loco.legs, left, right, racketDirection }, { position, yaw, scale });
```

- `locomotion` is deterministic and allocation-light; it never touches gameplay state.
- `solveKnee(hip, foot)` bends the knee toward the athlete's forward axis over a 0.48 thigh and degrades safely when
  the leg is overstretched.
- `applyLimbs` needs runtime node handles named like `AthleteLimbHandles` (upper/lower leg, knee, shoe, upper/lower arm,
  hand, racket handle/throat/hoop/strings). Missing pose limbs fall back to a neutral ready stance.
- Verified against the original Aura Slam code: 60,000 random pose cases are bit-identical and the rig transforms match
  the live adapter exactly (`tests/unit/aura-slam/`).

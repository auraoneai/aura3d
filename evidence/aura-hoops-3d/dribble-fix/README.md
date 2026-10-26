# Aura Hoops dribble fix (2026-10-25)

Owner report: the ball bounces away from the hand and the floor instead of being dribbled.

## Cause

The ball rode the IK **target** palm, but the arm (0.55 m reach from a ~1.5 m shoulder) never got below about 1.0 m while the target went to 0.75 m. At the bounce the ball sat about 0.9 m under a hand that stayed high, and the ball also floated 3 cm above the floor.

## Fix

- The handler sinks into a crouch (hips 0.28 m, knees folded, feet planted) during the push and holds it until the ball has met the floor, so the shoulder comes down and the hand can follow the ball.
- Palm heights fit the arm's reach (waist at the meet, 0.62 m at the push).
- The ball rides, leaves and is caught by the palm **as rendered** (forearm bone + palm offset, extrapolated one frame because the ball is placed from the previous frame's pose); the bounce is centre-at-radius.

## Measured (software GL, fixed 1/60 s sim step, `?diag=1&qaDt=0.0167`, `tests/browser/hoops-dribble-probe.spec.ts`, remote runs `hoopsdrib-before6` / `hoopsdrib-after5`)

| | before | after |
| --- | --- | --- |
| standing: palm height at the floor contact | 0.96 m | 0.62 m |
| standing: palm to ball at the floor contact | 0.80 m | 0.48 m |
| standing: palm to ball at the meet (max) | 0.107 m | 0.088 m |
| standing: ball centre at the bounce | 0.17 m | 0.13 to 0.14 m |
| moving: palm to ball at the floor contact | 0.91 m | 0.85 m |
| moving: palm to ball at the meet (max) | 0.135 m | 0.117 m |
| moving: farthest palm to ball | 0.91 m | 0.85 m |

Only about 25 to 30 frames per group fit in a software-GL run, so these are sampled values; `tests/unit/aura-hoops/dribble.test.ts` checks the same limits densely on the cycle (meet <= 0.12 m, bounce within 0.02 m of the ball radius, never more than 0.9 m from the hand).

## Frames

`before/` and `after/`: one frame per phase bin (file names carry the cycle phase `t` and ball height `y`). Compare `stand-t0.67`-ish frames (floor contact) and `t0.4x` (push): after the fix the handler is crouched with the hand down on the ball and the ball hits the floor in front of the hand.

## Still off

- A moving handler cannot crouch (the run clip owns the legs): the hand is still about 1.0 m up when the ball is on the floor (0.85 m gap, inside the 0.9 m limit). A run-dribble clip or a leg-safe overlay would close it.
- Frames and numbers are software WebGL2, not a real GPU.

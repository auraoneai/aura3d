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

Only about 25 to 30 frames per group fit in a software-GL run, so these are sampled values; `tests/unit/aura-hoops/dribble.test.ts` checks the same limits densely on the cycle (meet <= 0.12 m, bounce within 0.02 m of the ball radius, never more than 0.9 m from the hand).

## Running dribble (second pass)

The run clip owns the legs, so the fix is an **upper-body-only overlay** (Spine, Chest, Head and the arms; hips, legs and feet untouched): a steady waist bend that deepens into each push (shoulder drops about 0.37 m), a shorter period (0.30 s), a lower apex (palm 0.92 m, ball about 0.8 m) and a ball that lands in front of the hand with the stride lead.

Steady-state running only (the probe drops the frames while the handler is still accelerating), remote runs `hoopsdrib-before7` / `hoopsdrib-final2`:

| running | before | after |
| --- | --- | --- |
| palm height at the floor contact | 1.0 m | 0.61 m |
| palm to ball at the floor contact | 0.89 to 0.91 m | 0.54 m |
| palm to ball at the meet (max) | 0.135 to 0.154 m | 0.08 m |
| ball centre at the bounce | 0.17 m | 0.15 m (0.13 at the exact floor phase; unit test) |

Foot slide: the overlay writes no leg bones. The beacon foot-slide meter for the holder (`p0`) reads max 0.74 / p95 0.53 after against 9.7 / 6.3 before in these runs (different gameplay each run, so this shows only that nothing got worse); every other athlete is unchanged.

## Frames

`before/`, `after/` (standing) and `before-run/`, `after-run/` (running): one frame per phase bin, file names carry the cycle phase `t` and ball height `y`. Standing: after the fix the handler is crouched with the hand down on the ball and the ball hits the floor in front of the hand. Running: the handler is bent over the ball and the ball lands ahead of a low hand; before, the ball bounced about 0.9 m under an upright runner's hand.

## Still off

- Frames and numbers are software WebGL2 (sampled about 15 to 30 frames per group), not a real GPU; the unit tests check the same limits densely on the cycle.
- A waist bend of this depth is a stylised low dribble; a dedicated run-dribble clip would look better than the procedural overlay.
- `?diag=1&qaLean=` and `&qaLead=` exist only for measurement.

# Bunker Zero: enemies face the player

Owner report (production 4.3.0): the opponents are not facing the player, they are turned around.

## Cause

The sim's enemy `facing` is a compass yaw where 0 looks down -Z, and the renderer drew every enemy with `setRotation(0, -facing, ...)`, which is correct only for a model whose forward axis is -Z. All four Meshy enemy GLBs (guard, gunner, hound, warden) look down +Z, so every enemy was exactly 180 degrees off: back to the player while chasing and attacking. The alert state also never turned toward the player at all.

## Measured forward axes

| enemy | measured | how |
|---|---|---|
| guard, gunner, warden (boss) | +Z | toes of the rest pose (lowest vertices against the foot bones) and anatomical left at +X; unit test `tests/unit/bunker-zero/enemy-facing.test.ts` |
| hound | +Z | frames: configured axis shows the snarling face toward the camera, legacy shows the tail; `dog-profile-head-right.jpg` (drawn +90 degrees, head to the camera's right, as the math requires for a +Z model) |

## Fix

- `packages/game/src/motion/facing.ts` (exported from `@aura3d/engine/game`): `faceTowards`, `yawToFace`, `facingError`, `visualHeading`, `wrapAngle` (docs: `docs/api/motion-facing.md`).
- `apps/showcase-bunker-zero/src/enemy-facing.ts`: `ENEMY_FORWARD` per kind, a 12.5 rad/s turn rate for the drawn enemy, `nextEnemyYaw`, `enemyFacingError`.
- `main.ts` draws enemies through that helper (the death pose too, which used a different sign), and `sim.ts` makes the alert state face the player.

## Numbers (remote runner `bunkerface-7`, software WebGL2; `tests/browser/bunker-zero-facing.spec.ts`)

Angle between where the enemy is drawn looking and the direction to the player, measured against the model's real forward axis:

| enemy | legacy convention (-Z) | configured (+Z) |
|---|---|---|
| guard | 180 deg | 0 deg |
| hound | 180 deg | 0 deg |
| gunner | 180 deg | 0 deg |
| warden (boss) | 180 deg | 0 deg |

Turned 168 degrees away, every kind converges to 0 degrees in 15 steps of 1/60 s (0.25 s; limit 0.4 s). 0 console errors, 0 failed responses. Not real-GPU evidence.

Frames: `<kind>-legacy-z.jpg` (before: back to the player), `<kind>-configured.jpg` (after: facing the player), `<kind>-profile-head-right.jpg`.

## Other games (code-level sweep, no new frames)

Hoops and Diamond already use `atan2(dx, dz)` with +Z models (consistent with the Meshy convention); Ninja Runner applies `MODEL_YAW_OFFSET`; the Pips Big Leap boss is a rolling ball (no facing); Iron Crown fighters visibly face each other in the owner's production screenshot; Slingshot Siege targets are placed with fixed rotations. None needed a change. Lesson M15 records the rule.

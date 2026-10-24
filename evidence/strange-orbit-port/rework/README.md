# Strange Orbit: solid scenery impacts (rework lane `rework-orbit`)

Docs: `docs/workflows/game-rework-prompt.md` section 3.5. Software WebGL2 and a pure-simulation run; not real-GPU evidence.

## What was wrong

In zero-G flight (the rider leaves the track edge) the simulation moved the drifting rider through every piece of scenery: the five gate pillars and lintels, the 14 rim boulders and spires, the lander and both observatories had meshes but no colliders, and a rider flying up under the track, a bridge-like split route or an island platform passed straight through the strip (`findReentry` ignores motion along a triangle's normal). Nothing happened on contact.

## What changed

- `examples/strange-orbit-port/obstacles.ts` (new, pure): `dressingPlan()` is the single source of the boulder, spire, lander and observatory placement (`world.ts` now places the meshes from it, same random sequence), and `staticColliders()` builds 32 capsules from the same frames and the measured GLB bounds, so colliders and meshes cannot drift apart. `impactColliders()` turns them into sphere chains for the library `createImpactWorld`.
- `race.ts`: the drift step now moves through the library's `createImpactWorld` (swept spheres, restitution 0.4, friction 0.18, one `Impact` per contact above 3 m/s). A hit above 3 m/s counts as an impact, bounces the rider, and applies the moon-rock rule (one `hit` per 1 s cooldown: energy -10, combo 0, notice "Crashed into the <surface> · steer clear"). Grazes under 3 m/s bounce silently.
- `reentry.ts`: `findUndersideBlock` sweeps a sphere up through the strips from below; `race.ts` bounces the rider off the underside with the same tuning (the library kit collides spheres and boxes only, so this is a documented follow-up for a triangle or plane collider).
- `main.ts`/`world.ts`: the library hit-stop (30 to 80 ms), trauma camera shake (applied to the chase camera) and the hit cue run from the impact event; the old double "hit" sound is skipped for impacts.
- `vitest.config.ts`: alias for `@aura3d/engine/game` so the pure sim can import the kit under vitest.

## Measured (pure sim, 1/60 s step; `node_modules/.bin/tsx tools/strange-orbit/impact-evidence.ts`)

Before: no collision code existed. The same 22 tests with the collision calls disabled fail on every flight case (pass-through).

| Surface | Approach m/s | Impacts | Hit events | Penalised hits | Closest approach to surface (m, > 0 = never inside) | Rebound m/s |
| --- | --- | --- | --- | --- | --- | --- |
| gate pillar | 15 | 1 | 1 | 1 | 0.002 | 6.12 |
| gate pillar | 35 | 1 | 1 | 1 | 0.13 | 14.29 |
| gate pillar | 60 | 1 | 1 | 1 | 0.2 | 24.49 |
| gate lintel | 15 | 1 | 1 | 1 | 0.02 | 6 |
| gate lintel | 35 | 1 | 1 | 1 | 0.153 | 14 |
| gate lintel | 60 | 1 | 1 | 1 | 0.2 | 24 |
| rock spire | 15 | 1 | 1 | 1 | 0.02 | 6 |
| rock spire | 35 | 1 | 1 | 1 | 0.153 | 14 |
| rock spire | 60 | 1 | 1 | 1 | 0.2 | 24 |
| boulder | 15 | 1 | 1 | 1 | 0.02 | 6 |
| boulder | 35 | 1 | 1 | 1 | 0.153 | 14 |
| boulder | 60 | 1 | 1 | 1 | 0.2 | 24 |
| lander | 15 | 1 | 1 | 1 | -0.039 | 6.22 |
| lander | 35 | 1 | 1 | 1 | 0.085 | 14.52 |
| lander | 60 | 1 | 1 | 1 | 0.2 | 24.89 |
| observatory | 15 | 1 | 1 | 1 | 0.02 | 6 |
| observatory | 35 | 1 | 1 | 1 | 0.153 | 14 |
| observatory | 60 | 1 | 1 | 1 | 0.2 | 24 |

Every row is exactly one impact event and one penalised hit, the rider never gets inside the surface (the sphere chain stands in for the capsule; its dip is under 0.021 of the radius), and the rebound speed is below the approach speed.

Underside of the track (main strip at s = 300, flying up from 6 m below):

| Speed m/s | Impacts | Highest point reached relative to the strip (m, < 0 = stayed below) | Passed through |
| --- | --- | --- | --- |
| 15 | 1 | -0.789 | False |
| 35 | 1 | -0.789 | False |
| 60 | 1 | -0.789 | False |

## Replay

The reference replay (`evidence/crayon-capture/strange-orbit-reference.json`) and the 7-lap autopilot pin (14,627 fixed steps) are unchanged and green: neither flies, so the new code never runs in them. No reference was regenerated. A determinism test flies the same collision twice and compares the state to 9 decimals.

## Not done here

- The remote browser spec `tests/browser/strange-orbit-rework.spec.ts` result is in the commit message or the PR note when it finishes.
- On-track riders cannot reach these pieces (the lane clamp and edge rules stop them first), so ground collisions are unchanged.
- Rivals do not fly, so they are unaffected.

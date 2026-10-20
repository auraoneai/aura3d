# Vault Breakers — flipper-contact spike report (VB-01, M3 entry gate)

**Question:** can the public `physics.world(...)` surface drive two pinball
flippers at gameplay rate with `motorised-hinge` joints — snap to the up limit
in under 150 ms, hold as a wall under ball load, and launch resting balls
deterministically?

**Verdict: GO — `flipperMode: "joint"` with the same-sign axis-mirror workaround
and tuned parameters below.** The kinematic fallback stays documented but is not
needed. Evidence: `tests/unit/apps/vault-breakers-flipper-spike.test.ts` (green).

## What was tried

| Config | Result |
|---|---|
| Two motorised hinges, opposite-sign speeds (+26 / −26) | FAIL — first joint stalls near rest (−0.137 rad after 150 ms vs +0.5 target) |
| Single motorised hinge, any tuning | PASS |
| Two hinges, second motor pushing into its own limit (no rotation) | PASS |
| Two hinges, both +26, right axis mirrored to `[0, −1, 0]`, limits negated, 0.9 kg bats | PASS but slow — both at limits after ~2 s |
| Same + 0.18 kg bats, velocity target 60 rad/s | **PASS — both flippers at their up limits by 144 ms** |

## Findings

1. **Vendored-Rapier opposite-sign motor defect.** When two motorised hinges
   are simultaneously active with motor speeds of opposite sign, the first
   joint's motor effectively collapses (stalls near rest, deterministically).
   Bisected across slope gravity / sleeping / late `setMotorSpeed` / outlane
   posts / second flipper: the minimal failing pair is *set-later (or creation)
   + a second actively rotating motor of opposite sign*. A single motor, or a
   second motor that does not rotate its body, behaves correctly. This is an
   engine/adapter-level defect, not route logic: **library task filed** (see
   README known limits + route-health `knownLimits`).
2. **Same-sign workaround.** Mirroring the right flipper's joint axis to
   `[0, −1, 0]` and negating its limits lets BOTH flippers raise with the same
   positive motor speed (+60), avoiding the defect entirely. Joint-space angles
   for the right flipper are the negated world yaws.
3. **Sleeping motors are silent.** Sleeping bats ignore joint motors; the route
   wakes both bats on every activation (same discipline as the siege-golf ball
   strike).
4. **`maxMotorTorque` is passed through but the adapter's velocity motor uses a
   fixed factor of 1** (`packages/physics-rapier/src/index.ts`
   `RapierJointHandle.configureMotor` → `configureMotorVelocity(speed, 1)`), so
   snappiness comes from the velocity target and bat inertia, not the torque
   ceiling.

## Adopted parameters

| Parameter | Value |
|---|---|
| Bat | dynamic box, half extents (0.4, 0.055, 0.065) m, mass 0.18 kg, restitution 0.65 |
| Left joint | axis `[0, 1, 0]`, limits `[−0.52, 0.50]` rad, motor +60 to raise |
| Right joint | axis `[0, −1, 0]`, limits `[−3.661, −2.641]` rad, motor +60 to raise |
| Return speed | −10 rad/s (release) |
| Snap bar | both flippers within 0.05 rad of their up limits by 144 ms |
| Wall proof | ball dropped onto raised flippers never passes z > 4.2 m |
| Launch proof | resting ball leaves a moving flipper at > 2.5 m/s up-slope |
| Determinism | identical motor scripts produce hash-identical bat poses |
| Outlane guides | static walls at |x| = 0.93, guide faces at 0.87 — bat corners reach 0.832, so no jam and a 0.04 m gap a 0.28 m ball cannot pass |

Authored elements (labeled authored, non-simulated): playfield slope is a
gravity +Z component (2.35 m/s²), nudge is an impulse, bumper/sling kicks are
impulses along the contact normal.

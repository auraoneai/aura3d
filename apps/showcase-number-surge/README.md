# Number Surge

A neon-arcade number runner built with Aura3D. Steer a glowing number ball down a dusk highway, pick the better arithmetic gate (+n, ×2, −n, ÷2), grow your number, and smash the boss wall every 400 m — your number must beat its HP.

## Controls

- Drag (or ← → / A D) to steer between the two gates.
- Space / Enter starts and restarts; P or Esc pauses; M mutes.
- Power-ups: +25 number, ×2 number, shield (survives one too-small wall), ×2 score for 7 s.

## Mechanics

- Choosing the gate whose result is at least as good as the alternative builds a combo (×1–×5 multiplier); a worse pick resets it.
- Boss wall HP grows with each wall passed; smashing pays HP × 10 × multiplier and subtracts the HP from your number. Too small without a shield ends the run.
- Results: score, distance, walls smashed, biggest smash (persisted locally).

## Development

```bash
pnpm --dir apps/showcase-number-surge dev        # 127.0.0.1:5199
pnpm --dir apps/showcase-number-surge typecheck
pnpm --dir apps/showcase-number-surge build
node apps/showcase-number-surge/scripts/write-route-health.mjs
```

QA: `__AURA_NUMBER_SURGE__` (manual stepping, autopilot, replay, route health). Unit tests: `tests/unit/number-surge/`; browser spec (remote-only): `tests/browser/number-surge.spec.ts`.

## Evidence and claim label

Evidence: `evidence/number-surge/README.md`. Claim label: **prototype / playable** (bounded; no pixel-parity or real-GPU claims from software-GL captures).
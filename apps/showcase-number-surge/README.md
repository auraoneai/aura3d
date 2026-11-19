# Number Surge

A neon-arcade number runner built with Aura3D. Steer a glowing number ball down a dusk highway, pick the better arithmetic gate (+n, ×2, −n, ÷2), grow your number, and smash the boss wall every 300 m — your number must beat its HP.

Route: `/apps/showcase-number-surge/` (live at <https://aura3d.auraone.ai/apps/showcase-number-surge/>).
`?autoplay=1` (aliases `?autostart=1`, `?autopilot=1`) skips the title and lets the autopilot play.
Since the 5.6.0 Idol pass the boss-wall riot guards, palms and sky islands are fal Idol image-to-3D GLBs (`speridlabs/idol/max`; spec `tools/idol/specs/number-surge.json`, files and provenance in `assets/idol/`); the rest stays native `@aura3d/engine` procedural geometry.

## Controls

- Drag (or ← → / A D) to steer between the two gates.
- Space / Enter starts and restarts; P or Esc pauses; M mutes.
- Power-ups: +25 number, ×2 number, shield (survives one too-small wall), ×2 score for 7 s.

## Mechanics

- Choosing the gate whose result is at least as good as the alternative builds a combo (×1–×5 multiplier); a worse pick resets it.
- Boss wall HP has a floor that doubles every wall, and is set between what the worst and the best gate picks on the approach would give you, so only good picks beat it (×2 gates are rare; idling in one lane loses within about a minute, and even perfect picks run out after a couple of minutes); smashing pays HP × 10 × multiplier and subtracts the HP from your number. Too small without a shield ends the run.
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

Evidence: `evidence/number-surge/README.md`; final screenshots from the 5.6.0 real-GPU QA pass in `evidence/number-surge/screens/final`. Catalog verification: `playable` (no pixel-parity claims).
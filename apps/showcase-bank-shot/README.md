# Bank Shot

Bank Shot is a root-safe Aura3D prototype: a three-rack after-hours billiards run built with one public `createGameApp(...)` mount. The live table uses the public Rapier-backed physics surface for sixteen dynamic sphere bodies, cushion contacts, and six pocket sensor regions. Rack rules, aim/charge, the bounded first-contact guide, score/combo, authored spin nudge, clocks, and outcome presentation are route-local TypeScript—not a reusable cue-sports or general billiards kit.

The route remains `prototype-blocked` and is not a public showcase card. Automated tests and generated artifacts do not grant visual approval; promotion requires an independent verdict on the exact hash-bound desktop and mobile artifact set recorded by route health.

## Player loop

The player aims with `A`/`D` or the arrow keys, optionally changes the authored top/draw contact nudge with `W`/`S`, holds and releases Space to strike, waits for the settled-state lock, and clears three shrinking-clock racks. Pocket, scratch, no-rail, wrong-first-contact, three-foul, early-eight, legal-eight, rack progression, pause, and full reset are deterministic route rules. Touch buttons operate the same aim, charge/strike, spin, pause, and reset state.

The aim guide is deliberately bounded to the first ball or cushion contact. It does not promise a multi-contact solution. Ball translation and contact come from the public Rapier path; the small top/draw velocity nudge is explicitly authored and does not claim angular ball simulation.

## Scene surface

The B4 PORT rebuild renders engine primitives at true physics scale: the
salvaged table simulation (`src/gameplay/table.ts`) is primitive-based
(`physics.sphere` bodies), so `src/main.ts` draws a primitive felt/rail
table, sixteen primitive ball spheres coloured by ball number, a primitive
cue, aim/bank guide lines, and one 3000K pendant spot. No typed GLB asset
is admitted for this route yet — `art/direction.ts` keeps the table/ball/
cue/hall roles with S10 admitted = 0 until a human look-dev review admits
a set; no kit accept verdict is claimed. The former route GLBs remain on
disk under `assets/models/` as the re-admission pool, unreferenced by the
scene.

## Evidence boundary

- `tests/unit/apps/bank-shot-determinism.test.ts` proves public-Rapier construction (16 live balls, six pocket sensors), repeatable shot pose hashes, scatter/settle, pocket capture, once-per-entry sensors, reset, and bounded authored spin.
- `tests/unit/apps/bank-shot-rules.test.ts` proves all three clocks, rack progression, legal/foul/combo/eight-ball rules, session completion, cue charge, and bounded first-contact prediction math, fed hand-built `ShotRecord`s.
- `apps/showcase-bank-shot/tests/playable.spec.ts` drives keyboard aim, charge/strike, Rapier motion, rules resolution, scenario fixtures, and full reset against the `__aura3dGameSnapshot` evidence surface (framed, rack, ballsPocketed, currentShot, lastShotRecord hash).
- `tests/qr/prd14/browser/bank-shot-dispatch.spec.ts` carries the single-path S1/S2/S6/S7 rows; S11 stays missing by design for single-path routes.

## Reproduce

From the repository root:

```bash
pnpm --dir apps/showcase-bank-shot register:assets
pnpm --dir apps/showcase-bank-shot typecheck
pnpm --dir apps/showcase-bank-shot build
pnpm exec vitest run tests/unit/apps/bank-shot-determinism.test.ts tests/unit/apps/bank-shot-rules.test.ts
pnpm exec playwright test tests/browser/bank-shot-playable.spec.ts tests/browser/bank-shot-shot-visual.spec.ts --reporter=line
pnpm --dir apps/showcase-bank-shot evidence:performance
pnpm --dir apps/showcase-bank-shot evidence:deploy
pnpm --dir apps/showcase-bank-shot write:route-health
```

The exact artifact hashes and the remaining independent-review blocker live in `route-health.json`.

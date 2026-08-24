# Bank Shot

Bank Shot is a root-safe Aura3D prototype: a three-rack after-hours billiards run built with one public `createGameApp(...)` mount. The live table uses the public Rapier-backed physics surface for sixteen dynamic sphere bodies, cushion contacts, and six pocket sensor regions. Rack rules, aim/charge, the bounded first-contact guide, score/combo, authored spin nudge, clocks, and outcome presentation are route-local TypeScript—not a reusable cue-sports or general billiards kit.

The route remains `prototype-blocked` and is not a public showcase card. Automated tests and generated artifacts do not grant visual approval; promotion requires an independent verdict on the exact hash-bound desktop and mobile artifact set recorded by route health.

## Player loop

The player aims with `A`/`D` or the arrow keys, optionally changes the authored top/draw contact nudge with `W`/`S`, holds and releases Space to strike, waits for the settled-state lock, and clears three shrinking-clock racks. Pocket, scratch, no-rail, wrong-first-contact, three-foul, early-eight, legal-eight, rack progression, pause, and full reset are deterministic route rules. Touch buttons operate the same aim, charge/strike, spin, pause, and reset state.

The aim guide is deliberately bounded to the first ball or cushion contact. It does not promise a multi-contact solution. Ball translation and contact come from the public Rapier path; the small top/draw velocity nudge is explicitly authored and does not claim angular ball simulation.

## Typed asset family

All primary subjects are deterministic original CC0 assets generated in-repository and registered through the Aura3D CLI:

- `assets.bankShotTable`: metre-scale green-felt/walnut table with six renderer-owned mouth marks.
- `assets.bankShotCue`: tapered cue with a declared local strike-tip orientation.
- `assets.bankShotBall00` through `assets.bankShotBall15`: regulation-scale cue/object balls. Solids and stripes differ geometrically by material regions, and balls 1–15 carry renderer-owned high-contrast number marks so identity is not hue-only.
- Ten `assets.bankShot*Sfx` members: deterministic synthesized CC0 contact, pocket, foul, combo, rack, win/fail, and hall cues.

The root manifest retains durable source/download URLs, license, author, hashes, roles, suitability, and hash-bound release render probes for all eighteen models. Audio remains candidate-quality and is validated separately because model-oriented release-bounds checks do not apply to WAV files.

## Evidence boundary

Current machine evidence is generated rather than hand-authored:

- `tests/unit/apps/bank-shot-determinism.test.ts` proves public-Rapier construction, repeatable shot hashes, scatter/settle, pocket capture, once-per-entry sensors, reset, and bounded authored spin.
- `tests/unit/apps/bank-shot-rules.test.ts` proves all three clocks, rack progression, legal/foul/combo/eight-ball rules, session completion, cue charge, and bounded first-contact prediction math.
- `tests/browser/bank-shot-playable.spec.ts` naturally drives keyboard aim, charge/strike, public-Rapier motion, settle lock, a second shot, pause/resume, and full reset.
- `tests/browser/bank-shot-shot-visual.spec.ts` captures attract, aim, cue contact, motion, pocket, foul, rack fail, three-rack/eight finish, separately mounted mobile touch play, and reduced-motion aim. Its deterministic outcome fixtures drive the same live RulesEngine, HUD/audio mapping, typed handles, and scene synchronization; they do not replace the separate physical contact tests.
- `performance-report.json`, `deploy-report.json`, and `route-health.json` bind their producers and current route source before reporting a pass.

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

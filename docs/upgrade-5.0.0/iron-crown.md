# Iron Crown (`iron-crown`): 5.0.1 upgrade guide

Source: plan section 5.5 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-iron-crown`, action). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: `createGame` fighting runtime (`src/main.ts:283`), DOM HUD (`game/hud.ts`), 22 GLB, rain/weather particles (`weather.type`, `weather.streakLimit`), `effects.lightCone` x4, SSR, `effects.runtime` x3; `shaderPass` x1; own `createHud` x3.
- Effort and risk: S wave 1, M for A5/A7 labs. Visual risk: medium (rain particles + fog + 4.7.10 reverted Iron Crown model swap; baseline frames must be the post-revert ones).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A1 (22 models: best candidate for `game.shell.track()` loading bar), A8 per-slot custom shader on fighter GLBs only if a custom surface exists (none now: skip), A14 none, A5 photometric spot for the 4 `lights.spot` arena lights (EXPERIMENTAL; scalar fallback exists, one non-clustered WebGL2 spot only), A16 none (kinematic bodies are the game runtime's own, `game.kinematicBody`, not Rapier), A7 worker flag (largest main-thread sim; experiment only)

Verification

- [ ] GC, UT (fighting sim/replay), CAP
- [ ] combat replay determinism check unchanged
- [ ] `node tools/game-checks/run.mjs iron-crown` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

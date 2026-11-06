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

- [x] A1 shared loading helper: `createLoadingProgress({ shell: fightingGame.shell })` tracks `app.ready()`, `done()` after `fightingGame.ready()` (no visible change in frames)
- [x] A2 backend selection + readiness published on `window.__IRON_CROWN_BACKEND__` via shared `publishBackendReport`
- [x] A14, A16, A8: none / not applicable (no custom surface, kinematic bodies are the game runtime's own)
- [ ] B2 partial AuraApp cast: not applicable here (the only cast is a node `animation` handle in `layerApi`, not an `AuraApp` double); skipped
- [ ] A5 photometric spot, A7 worker flag, lab flags: skipped, `createGame` exposes no renderer/worker option passthrough for the shared lab parser (engine issue recorded), EXPERIMENTAL stays off

Verification

- [x] GC, UT (fighting sim/replay), CAP
- [x] combat replay determinism check unchanged (sim untouched; unit tests pass)
- [x] `node tools/game-checks/run.mjs iron-crown` clean (0 errors, 16 pre-existing borrowed-asset warnings)
- [x] Before/after frames attached (`evidence/game-upgrades-502/iron-crown/{before,after}.png`) (static bands) with the capture command, per game, before the change ships

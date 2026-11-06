# Slingshot Siege (`slingshot-siege`): 5.0.1 upgrade guide

Source: plan section 5.12 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-slingshot-siege`, action). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: only game with engine physics: `physics.world`, `physics.box/sphere` (`src/game/sim.ts:22,196,251...`), Rapier-backed `AuraPhysicsWorldController`; `renderer: { qualityProfile: "production" }` (`src/main.ts:86`, contradicts the never-list but intentional); `looks.preset("outdoor-day")`; `createGameAudio` from root (`src/game/audio.ts:8`, still exported, `docs/api/root-exports.md:67`); `effects.antiAlias`; 0 GLB.
- Effort and risk: S wave 1, M with A11. Visual risk: medium (physics determinism: replay tests must stay identical; 5.0 changed solver internals per WP-27).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A16: keep the 4.x-compatible root (synchronous physics, no `preloadPhysics` needed)
- [ ] verify against S5-WP27-01 and WP-01 batch-member ID changes (fix `addInstance` ids affect instanced debris? check `instances.*` usage x7)
- [ ] A11 `Fracture` add-on for destructible blocks is the standout new capability for this game (M; changes gameplay visuals: opt-in lab first)
- [ ] A13 skip (no KTX2 use)

Verification

- [ ] GC, UT (siege sim + replay), CAP
- [ ] `node tools/game-checks/run.mjs slingshot-siege` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

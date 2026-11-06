# Aura Slam 3D (`top-tennis`): 5.0.1 upgrade guide

Source: plan section 5.1 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-top-tennis`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Package/API: `@aura3d/engine workspace:*`; uses `@aura3d/engine/{game,game/art,audio}` and `@aura3d/debug`; no removed API.
- Legacy: custom 2-bone IK rigs and `rigparity` harness (`view/rigparity/main.ts:73` sets `pixelRatio: 1`); hand-rolled ball trail array (`sim/engine.ts:1001-1002` `ball.trail.push/shift`) next to `effects.trail`; instanced crowd (`view/crowd.ts`) with its own `createCrowd` instead of `instances.*` helpers; 38 `physics.*` hits are its own deterministic `physics.sample/solveShot` ball-flight module, not engine physics; B2: `view/renderer.ts:361` partial `AuraApp` cast.
- Effort and risk: S (M with A11). Visual risk: low-medium (SSR + DoF + AO + contact shadows all on; transparent crowd/glass with renderOrder).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] fix the B2 double (narrow `{ nodes: { require } }` interface) (S)
- [ ] A1 shell loading for the 6 courts' asset sets (S)
- [ ] A6 verify DoF/SSR/AO/contact-shadow stack after temporal rework (verify only)
- [ ] A15 already used (`text3D` boards)
- [ ] A11 `SpatialDOMRenderer` for player name tags is optional (M, skip in wave 1)

Verification

- [ ] GC, UT (likeness-audit + aura-slam sim), CAP 25 s + 60 s
- [ ] `node tools/game-checks/run.mjs top-tennis` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

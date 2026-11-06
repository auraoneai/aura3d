# Aura Diamond 3D (`aura-diamond-3d`): 5.0.1 upgrade guide

Source: plan section 5.8 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-aura-diamond-3d`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 0 custom shaders; `sky.preetham`, rain, light cones, SSR, volumetric fog, trail; reflection probe written out by hand (`src/scene.ts:688-700`, `DOME_PROBE_ENABLED = false`, hand-constructed `{ kind: "probe", probe: "reflection" }` node because the `probes` builder is not in the 5.0 public surface, changed in `ccdc9cfe7`; only mounted when `DOME_PROBE_ENABLED`); `attachToBone` x6; `instances.model` x8.
- Effort and risk: S. Visual risk: low (probe dormant).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] replace the hand-written probe node with the supported lighting entry `@aura3d/engine/lighting` (`NativeLightProbeGrid`) or drop the dormant probe (decide: drop unless `DOME_PROBE_ENABLED` is on in a shipped path; it is off) (S)
- [ ] A3 lab
- [ ] A5 IES lab as Hoops

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs aura-diamond-3d` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

# Shadowstep Gauntlet (`ninja-runner-port`): 5.0.1 upgrade guide

Source: plan section 5.20 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-ninja-runner-port`, action). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 53 custom hits, per-frame particle buffers via `particles.updateAttribute?.("position"|"tone"|"aSize"|"aAlpha")` (`world.ts:1002-1005`, `785`) with custom-attribute shaders; `sky.setUniform` x9 (hand-driven sky shader); district look table (`districtLook.ts`); outline, light cone.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A4 for particle/flame shaders (the author-attribute path is exactly what shader-graph attribute inputs address; L), A8 for ninja GLB
- [ ] A6 verify outline
- [ ] 4.7.10 notes Shadowstep's Meshy swap was reverted: baseline = post-revert

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs ninja-runner-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

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

- [x] Drop the dormant hand-written probe node (`DOME_PROBE_ENABLED = false`, `domeInfieldProbe`) (commit 0c5e12440; `tests/unit/aura-diamond` 131 pass). `NativeLightProbeGrid` not adopted: the Dome already lights from its HDRI and the probe smeared on capture (GU47 phase 2).
- [x] A1 visible boot loading bar (`#boot-loading`, shared `.aura3d-loading` + `createLoadingProgress({ element })`), fades out when `ready()` resolves: `evidence/game-upgrades-503/aura-diamond-3d/after-loading.png`
- [ ] A3 backend. Skipped: `?backend=` lab flag already wired (5.0.2); WebGPU is EXPERIMENTAL, no real-GPU proof, stays default-off.
- [ ] A5 IES photometric / light probe grid / clustered lights / voxel GI. Skipped: EXPERIMENTAL or no engine entry usable without an engine change; no real-GPU proof.
- [ ] A4/A7/A8/A9/A10/A11/A12/A13/A14/A15/A16/A17. Skipped: not in this game's row (0 custom shaders, no physics, no splats); `?gamut=p3` stays a default-off lab flag.

Verification

- [ ] GC, UT, CAP
- [x] `node tools/game-checks/run.mjs aura-diamond-3d` clean (0 errors; 2 warnings as before)
- [x] Before/after frames attached: `evidence/game-upgrades-502/aura-diamond-3d/{before,after}.png` (REA capture_browser_scenario, 960x540, 11 s settle; animated autopilot play, so counts differ)

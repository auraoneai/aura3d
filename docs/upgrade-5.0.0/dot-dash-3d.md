# Glint Courier (`dot-dash-3d`): 5.0.1 upgrade guide

Source: plan section 5.13 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-dot-dash-3d`, arcade). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Package/API: 0 custom shaders; `scatter` x12 + `instances.box` x9 + `instances.polyhedron`; SSR, DoF, volumetric fog, chromatic aberration; `text3D` SDF silk signs (`src/game/world.ts:417-420`; note the visible text "REV 4.7" is a version string that the N2 rule forbids in visible text, re-check against `brand-identifiers`/`counts` when bumping).
- Effort and risk: S-M. Visual risk: low-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A12 candidate (largest scatter use among small games) with a placement diff test
- [ ] A3 lab (no GLSL)
- [ ] A1
- [ ] A2

Verification

- [ ] GC, UT, CAP
- [ ] The 4.7.10 notes: Glint Courier's Meshy swap was reverted by the blind panel, so the baseline is the post-revert frames
- [ ] `node tools/game-checks/run.mjs dot-dash-3d` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships

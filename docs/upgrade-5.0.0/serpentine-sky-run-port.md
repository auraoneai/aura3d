# Serpentine Sky Run (`serpentine-sky-run-port`): 5.0.1 upgrade guide

Source: plan section 5.17 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-serpentine-sky-run-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 59 custom hits (`world.ts` 15, `materials.ts` 10), sky via `sky.stars/moon/band`, `environments.neutral` + `preset`, motion blur, DoF, chromatic aberration, `effects.antiAlias` x2; `lookAt` hits are the colour-script function (`art/colorScript.ts:341`), not node `lookAt`. Source folder name `saiyan-snake-way-port` is a legacy brand name (check `brand-identifiers` stays green; do not surface in text).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [x] `environments.neutral`/`capture` exposure resolved (W-4): default colour-script path uses `environments.preset("sunset")`, not the neutral file (world.ts:345-348); only `?look=original` / `?env=` read neutral, so no pin; default frame checked in evidence/game-upgrades-503/serpentine-sky-run-port/{before,after}.png
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] same pattern as 5.15 (A8, A4 limited, A6 verify, watch neutral environment shift)

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs serpentine-sky-run-port` clean
- [x] Before/after frames attached: evidence/game-upgrades-502/serpentine-sky-run-port/{before,after}.png (REA capture_browser_scenario, 960x540, autostart=1, 11 s settle, real GPU; same scene, no visible change; 5.0.2 base vs branch, not the 4.7.10 frames)

## 5.0.2 lane notes

- [x] A1 shared loading helper wired (`createLoadingProgress`, text percent on the existing loading card)
- [x] B2 `app as unknown as LookAppLike` casts removed (AuraApp satisfies the structural type; tsc clean)
- [x] Lab flags `?backend=` and `?gamut=` wired via the shared parser, default OFF. Skipped: `?worker=1` (no worker entry) and `?depth=` (camera node untouched, pixel risk)
- [x] A2 `?diag=1` already provided by `apps/showcase-port-shared/diag` in the app entry
- Unticked W-3/W-4: need the parent's 4.7.10 baseline comparison; `environments.neutral` not pinned. GC shows 1 pre-existing error (`art/direction.audit.json` stale), untouched here.

## 5.0.3 full adoption notes

- [x] A1 loading card now has a real progress bar driven by the shared `createLoadingProgress` (`element`): evidence/game-upgrades-503/serpentine-sky-run-port/{before,after}.png (in-run frames identical; the bar is visible only during load and was not frame-captured)
- [x] A6 post stack verified on real GPU (motion blur, DoF, chromatic aberration, bloom, FXAA, god rays all draw; no new console errors or degrade codes vs base): same frames
- [ ] A2 budgets: skipped, `?diag=1` already present; no new budget gate added
- [ ] A3 backend: stays lab flag `?backend=` (custom GLSL is WebGL2-only, no WGSL parity)
- [ ] A4 shader graph: skipped, not a designated pilot; road/sky/figures stay GLSL, WebGL2-only
- [ ] A5 lighting (probe grid, IES, projected spot, clustered, voxel GI): skipped, EXPERIMENTAL and the world is unlit custom materials; only the rigged runner is PBR
- [ ] A7 workers: skipped, no worker entry
- [ ] A8 per-slot custom materials: skipped, imported GLBs (runner, Meshy props) are plain PBR; no custom surface on a GLB slot
- [ ] A9 camera depth: tried `?depth=logarithmic` on real GPU: RENDERER_MOUNT_FAILED "Contact shadows require standard depth" (script look uses contact shadows). Not wired. Engine limitation
- [ ] A10 wide gamut: stays lab flag `?gamut=p3`
- [ ] A11 add-ons, A12 scatter/merge (seeded placement would change), A13 KTX2, A14 formats, A15 text3D, A16 physics, A17 splats: not applicable or skipped, no player-visible gain

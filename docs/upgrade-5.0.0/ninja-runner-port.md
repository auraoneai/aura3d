# Shadowstep Gauntlet (`ninja-runner-port`): 5.0.1 upgrade guide

Source: plan section 5.20 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-ninja-runner-port`, action). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 53 custom hits, per-frame particle buffers via `particles.updateAttribute?.("position"|"tone"|"aSize"|"aAlpha")` (`world.ts:1002-1005`, `785`) with custom-attribute shaders; `sky.setUniform` x9 (hand-driven sky shader); district look table (`districtLook.ts`); outline, light cone.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture). Not done here: parent-owned. Real-GPU before/after frames of the same URL are in `evidence/game-upgrades-503/ninja-runner-port/{before,after}.png`.
- [x] `environments.neutral`/`capture` exposure resolved (W-4): the game authors neither (no match in examples/ninja-runner-port) and is not listed in neutral-environment-exposure.md; nothing to pin.
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A4 for particle/flame shaders (L): SKIPPED. Not a designated A4 pilot (decision D2: last-train-port, silt-and-signal-port water, roadster-rush); the seven shaders stay GLSL (WebGL2-only). A8 for ninja GLB: SKIPPED. The actors are `cloneSkinned` root render sources whose per-slot custom material would need a PortableShaderMaterial (A4) and would change the hero look the blind panel judged; no GLSL-to-portable pixel diff exists.
- [x] A6 verify outline: `?ink=1` renders on real-GPU Chrome with no new console errors or degrade codes (`evidence/game-upgrades-503/ninja-runner-port/after-ink-lab.png`). Stays opt-in (existing flag, not default): the ink is heavy and speckled on the cobbles, so the default look is unchanged.
- [x] 4.7.10 notes Shadowstep's Meshy swap was reverted: baseline = post-revert. The before frames are built from origin/main (001455903) with no model changes.

Verification

- [x] GC (0 errors), UT (`vitest run tests/unit/ninja-runner-port`: 147 passed), tsc clean; CAP: REA real-GPU frames below.
- [x] `node tools/game-checks/run.mjs ninja-runner-port`: 0 errors (warnings: stale card poster, open guide boxes).
- [x] Before/after frames: `evidence/game-upgrades-503/ninja-runner-port/{before,after}-loading.png`, `{before,after}.png` (REA `capture_browser_scenario`, real-GPU Chrome, 960x540, `?autostart=1&autopilot=1`, 1.2 s and 12.2 s; gameplay frames are real-time autopilot so the moment differs).

## 5.0.3 additions

- [x] A1 loading/readiness UI: the intro card shows a progress bar (`createLoadingProgress`) over the real boot stages (runner models, village build, renderer mount, first frame). Evidence: `evidence/game-upgrades-503/ninja-runner-port/before-loading.png` vs `after-loading.png`.
- [x] A2 diagnostics: `publishBackendReport` publishes `backendSelection` and first-frame `readiness` on the QA hook (`?diag=1` prints it). Console shows only the favicon 404 and the pre-existing `DEPTH_ALPHA_HASH_DEGRADED` river warning, identical in the base build.
- [x] spiralorb-sparks `a_position`: the 5.0.2 fix (`shaders.ts` reads `position`) is in the base; no `draw skipped` message appears in the console of either build. A dedicated frame of the cast sparks was not captured.
- [ ] A3 backend, A5 lighting (probe grid, IES, projected spot, clustered, voxel GI), A7 workers, A9 depth, A10 gamut, A17: SKIPPED. EXPERIMENTAL; the game keeps the default-off lab flags (`?backend=`, `?gamut=`) from 5.0.2; no real-GPU proof for the experimental paths here.
- [ ] A11 add-ons, A12 scatter/merge (decision D8: changes seeded placement), A13 KTX2 (D9: no size-budget failure), A14 formats, A15 text3D, A16 physics: SKIPPED, not applicable or would change seeded content.

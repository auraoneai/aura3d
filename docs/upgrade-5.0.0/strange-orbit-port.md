# Craterline GP (`strange-orbit-port`): 5.0.1 upgrade guide

Source: plan section 5.15 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-strange-orbit-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 41 custom hits; `shaders.ts` (GLSL, `#include <a3d_lights>`, `a3d_scene`), `materials.ts` (`CustomSpec`), `world.ts` (8 `material.custom`): track ribbon (`geometry.dynamic` + author attributes), solids, minerals, points, atmos, nebula, veil, rider-shadow; `?look=original|gouache` switch; `pixelRatio: 1` + `qualityProfile` comment at `main.ts:627-629`; `environments.neutral` x1.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH for the gouache look (custom lighting math `HEMI_GAIN` calibrated to 4.6.1 exposure; `a3dSunShadowAuto` reads fully shadowed on the software runner, `materials.ts` comment).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A8 per-slot custom shader for the GLB riders: SKIPPED (the riders use stable `materialOverrides` tints/clearcoat/rim, not hand-rolled re-materialing; no custom surface on the GLBs exists, so a per-slot GLSL shader would add pixel risk with no player gain)
- [ ] A4 shader-graph rewrite of `POINTS_*`/`VEIL_*`/`RIDER_SHADOW_*`: SKIPPED (D4 pilot gate: only last-train-port, silt-and-signal-port, roadster-rush are pilots; GLSL kept, WebGL2-only)
- [ ] A6 verify motion blur + DoF: NOT VERIFIED (no real-GPU gameplay frames available in this lane; local headless capture stayed in the shader-warm stage)
- [x] A1 loading UI: determinate bar on the loading screen (scene build, renderer init, model upload, shader warm-up) via `apps/showcase-port-shared/loading-progress.ts`; `evidence/game-upgrades-503/strange-orbit-port/{before,after}-loading-bar.png`
- [ ] A2 diagnostics overlay: SKIPPED (`?diag=1` already provided by the shared `diag.ts` imported in the app entry; an always-on overlay would be a player-visible regression)
- [ ] A5 lighting (projected spot image / IES on the headlight), A9, A10, A13, A16: SKIPPED (EXPERIMENTAL or no docs-backed API in this lane; no real-GPU proof, headlight scalar spot kept)
- [ ] `environments.neutral` regenerated (S5-WP04-05): not pinned. Default gouache look uses `environments.capture`, only `?look=original` uses neutral; 5.0.2 before/after showed no shift. No real-GPU frame of `?look=original` taken here (W-4 open)

Verification

- [ ] GC, UT (the spec bake/compile test `materials.ts` is written to be unit-tested), CAP both looks
- [ ] `node tools/game-checks/run.mjs strange-orbit-port` clean
- [x] Before/after frames attached (static bands) with the capture command, per game, before the change ships (5.0.2 base vs this branch, title screen, default look only: `evidence/game-upgrades-502/strange-orbit-port/{before,after}.png`; visually identical)

## 5.0.2 notes (wave 4, mechanical items only)

- WebGL2 only: this port keeps its GLSL (`shaders.ts`, `#include <a3d_lights>`); no shader rewrite (D2/D4). `?backend=webgpu` is reachable only as a default-off lab flag and falls back to WebGL2.
- Done: partial `AuraApp` cast at the game beacon (`app as never`) replaced by a typed cast; lab flags wired through `apps/showcase-port-shared/lab-flags.ts` (`?backend`, `?gamut`; `?worker` and `?depth` are ignored, the port has no worker and uses the shared camera).
- Skipped: A8 per-slot custom shader, A4 shader-graph rewrite (experimental, pixel risk), A1 loading helper (the port already drives its own `#loading` status text and warms programs before first frame), pinned HDRI (W-4): before/after on 5.0.2 show no look change, so `environments.neutral` stays.
- Pre-existing at base: game check `art-direction` error (`direction.audit.json` stale).

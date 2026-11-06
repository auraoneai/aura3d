# Aura FC 3D (`aura-fc-3d`): 5.0.1 upgrade guide

Source: plan section 5.9 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-aura-fc-3d`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: `sky.dayNight` (the only game using it, x3), `effects.motionBlur`, chromatic aberration, aurora ribbon, snow + rain; hand-rolled ball trail (`game/sim.ts:1267-1268`); 1 `material.custom` in `game/scene.ts` (2 hits); `text3D` SDF scoreboard (`game/scoreboard3d.ts:32`); 22 aura-assets.
- Effort and risk: S. Visual risk: medium (motion blur is in S5-WP06-06; weather + dayNight animate, so frame comparison is noisy per `blind-panel-noise-animated-scenes`).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A6 verify motion blur and `sky.dayNight` transitions  (5.0.3: real-GPU Munich 960x540 11.5 s settle, base vs after identical in composition/lighting, no new console errors: evidence/game-upgrades-503/aura-fc-3d/before.png, after.png; capture run with reduced-motion default so blur/CA are off in the frame, Glacier star sky not re-captured)
- [x] replace manual trail with `effects.trail` (5.0.3: the visible trail already is `effects.trail` in scene.ts; the hand-rolled `ball.trail` buffer in sim.ts/types.ts was written but never read, so it was deleted: zero pixel/sim change, 157 aura-fc-3d unit tests pass)
- [ ] A4 pilot for the single custom material (S-M)  (skipped: not a designated A4 pilot; the light-pool additive quad is GLSL-only, kept; WebGL2-only)
- [x] A1 visible loading bar (5.0.3: staged 0.2 app created, 0.7 mounted, 1.0 first frame via `app.readiness({stage:"first-frame"})`, fades out; evidence/game-upgrades-503/aura-fc-3d/after-loading.png)
- [x] A1 (shared `createLoadingProgress` tracks `app.ready`, no visible UI change; `publishBackendReport` on `window.backendReport`)

Verification

- [ ] GC, UT, CAP (static bands)
- [x] `node tools/game-checks/run.mjs aura-fc-3d` clean (0 errors, 10 pre-existing warnings)
- [x] Before/after frames attached (evidence/game-upgrades-503/aura-fc-3d, REA capture_browser_scenario, 960x540)

5.0.3 skipped items (precise reasons)

- [ ] A2 diagnostics overlay: a debug overlay is not player-visible; backend report already published (5.0.2).
- [ ] A3 backend, A9 depth, A10 gamut, A7 worker: EXPERIMENTAL, remain default-off lab flags (`?backend=`, `?gamut=`); no real-GPU proof for default-on.
- [ ] A5 light probe grid / IES / clustered lights: EXPERIMENTAL, not wired; the venue looks are calibrated to the existing HDRI + flood spots.
- [ ] A8 per-slot custom material, A11 add-ons, A12 scatter/merge, A13 KTX2, A14 formats, A16 physics, A17 splats: no use in this game (or D8/D9: placement/size budgets unaffected).
- [ ] A15 text3D: already SDF scoreboard (`scoreboard3d.ts`), nothing to change.
- [ ] W-3/W-4 neutral environment pin: Munich base vs after frames identical on the shared environment file, so no pin needed for that venue; Kyoto/Favela/Glacier not re-captured.

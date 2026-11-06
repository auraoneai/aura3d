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

- [x] A16: keep the 4.x-compatible root (synchronous physics, no `preloadPhysics` needed)
- [x] verify against S5-WP27-01 and WP-01 batch-member ID changes (`tests/unit/slingshot-siege` 64/64 pass incl. block-instances, 30-level sim boot/settle and shot tests; no id drift observed)
- [ ] SKIPPED (5.0.3: needs pooled fragment nodes plus sim hooks for every block family and an `@aura3d/addons` dependency; no real-GPU proof possible in this pass, so it stays unshipped rather than shipping an unproven lab path) A11 `Fracture` add-on for destructible blocks is the standout new capability for this game (M; changes gameplay visuals: opt-in lab first)
- [x] A13 skip (no KTX2 use)

5.0.3 additions

- [x] A1 visible scene-load veil with progress bar (index.html `#loading-veil`, `createLoadingProgress({ element })`); evidence/game-upgrades-503/slingshot-siege/{before,after}-loading.png (before: black canvas for the first seconds, after: navy veil with gold bar)
- [x] Removed the `PROJECTILE_PARK` workaround (4.7.12): projectiles are created hidden below the stage like every other pooled node; real-GPU mid-flight frames before/after both show the gull in flight: evidence/game-upgrades-503/slingshot-siege/{before,after}-projectile-midflight.png
- [ ] A2/A3/A5/A6/A9/A10: not applied (default-off lab flags already wired by 5.0.2; no change to the outdoor-day look identity; no in-scope player gain without GLSL or lighting changes)

Verification

- [ ] GC, UT (siege sim + replay), CAP
- [x] `node tools/game-checks/run.mjs slingshot-siege` clean (0 errors, 2 pre-existing warnings)
- [x] Before/after frames attached (evidence/game-upgrades-502/slingshot-siege/{before,after}.png) (static bands) with the capture command, per game, before the change ships

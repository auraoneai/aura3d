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

- [x] fix the B2 double (narrow `{ nodes: { require } }` interface) (S)
- [x] A1 shell loading for the 6 courts' asset sets (S): the `#boot` splash now has a real progress bar (`examples/aura-slam/shell/bootProgress.ts`, stages reported from `view/renderer.ts` mount) and lifts only after `app.readiness({ stage: "first-frame" })` (3 s cap); frames `evidence/game-upgrades-503/top-tennis/{before,after}-boot.png` (the engine `game.shell` is not used: this game has its own page shell, so the shared DOM-bar approach applies)
- [x] A6 verify DoF/SSR/AO/contact-shadow stack after temporal rework (verify only) (5.0.2 build: frame drawn, no mount failure, only CONTACT_SHADOW_PARTIAL warnings as before)
- [x] A15 already used (`text3D` boards)
- [ ] A11 `SpatialDOMRenderer` for player name tags is optional (M) (skipped: the scoreboard HUD and 3D boards already name both players; DOM name tags over the athletes would add UI the 4.x game never had and cover the ball-tracking camera view, and there is no real-GPU proof harness for overlay occlusion here)

Verification

- [ ] GC, UT (likeness-audit + aura-slam sim), CAP 25 s + 60 s
- [ ] `node tools/game-checks/run.mjs top-tennis` clean (1 pre-existing error: art/direction.audit.json stale; not touched)
- [x] 5.0.3 frames: `evidence/game-upgrades-503/top-tennis/{before,after}.png` (in-game, 960x540, 12 s, real Chrome GPU: same view, no console errors beyond local-server font 404s) and `{before,after}-boot.png` (splash with bar)
- [x] Before/after frames attached (static bands) with the capture command, per game, before the change ships (`evidence/game-upgrades-502/top-tennis/{before,after}.png`)

5.0.3 additional items (all default-off or invisible unless stated)

- [x] A3 backend lab flag `?backend=auto|webgpu` (EXPERIMENTAL, default off, WebGL2 fallback kept): `examples/aura-slam/main.ts` `labAppOptions`, unit test `tests/unit/aura-slam/boot-progress.test.ts`. No real-GPU WebGPU proof: not default.
- [x] A10 wide-gamut lab flag `?gamut=p3` (EXPERIMENTAL, default off): same hook.
- [ ] A2 diagnostics/budgets overlay (skipped: the game already ships `?diag=1` through `@aura3d/debug` `installSafetyNet`)
- [ ] A4 portable materials/shader graph (skipped: not a designated pilot; WebGL2-only GLSL stays)
- [ ] A5 lighting (light probe grid, IES, clustered, voxel GI) (skipped: outdoor courts lit by venue HDRIs + PCSS key; EXPERIMENTAL and no real-GPU proof run for this game, so no flagged path was added)
- [ ] A7 worker rendering (skipped: scene builder holds closures over the rig, not serializable)
- [ ] A8, A12, A13, A14, A16, A17 (skipped: no custom per-slot materials, no seeded scatter, no KTX2 use, no new formats, own deterministic ball physics, no splats/volumes)
- [ ] A9 `camera.depth` log/reversed (skipped: no far-plane z-fighting observed on the 6 courts)
- [ ] hand-rolled ball trail array and `createCrowd` replacement (skipped: the World Tour look already uses `effects.trail` via `createSlamVfx`; the legacy array only serves `?look=original`; changing the crowd would alter instance ids/seeded placement)

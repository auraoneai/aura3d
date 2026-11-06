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

- [ ] A12 candidate: skipped, not applicable. The plan's `scatter` x12 count is the ghost chase/scatter AI in `sim.ts`; the game calls no scatter/merge API (props are grid-placed `instances.*` from the maze, so there is nothing seeded to replace)
- [ ] A3 lab (no GLSL): skipped, `CreateGameOptions` accepts no renderer/output/camera options, needs an engine change (same blocker for A5 photometric/projected lamp which needs `renderer.photometricProfiles`, A9, A10)
- [x] A1 (shared createLoadingProgress drives g.shell; frames in evidence/game-upgrades-502/dot-dash-3d)
- [x] A2 (publishBackendReport -> window.__AURA3D_DOT_DASH_BACKEND__; overlay stays off)

Verification

- [x] GC, UT, CAP (GC 0 errors, was 1; UT tests/unit/dot-dash-3d 49 pass; CAP evidence/game-upgrades-503/dot-dash-3d/{before,after}.png identical)
- [x] Legacy casts: SSR v2 fields and volumetricFog `as unknown as` removed (now typed by 5.0); `engineCompat.ts` probe and particles cast kept (`probes` not on public root, emitter ranges not typed): see engine issues
- [x] Stale `art/direction.audit.json` regenerated (clears the game-check error)
- [ ] A15 `REV 4.7` silk text: skipped, visible copy must not change
- [ ] The 4.7.10 notes: Glint Courier's Meshy swap was reverted by the blind panel, so the baseline is the post-revert frames
- [x] `node tools/game-checks/run.mjs dot-dash-3d` clean (0 errors, 2 pre-existing warnings)
- [x] Before/after frames attached (static bands) with the capture command, per game, before the change ships

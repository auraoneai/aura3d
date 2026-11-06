# Aura Links 3D (`aura-links-3d`): 5.0.1 upgrade guide

Source: plan section 5.10 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-aura-links-3d`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: water shaders (`game/water.ts` 2 hits, `src/main.ts` 1), `scatterInDisc` x2 + `scatter` x10 hand-rolled course dressing, 7 `looks.*` calls, 14 GLB, `instances.model` x7, `effects.depthOfField`, `game.accessibility`, many `text3D` signs (`src/main.ts:513,988`).
- Effort and risk: M-L. Visual risk: medium (water, fog, depth of field).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture) - skipped: parent-owned; local before/after of this lane are identical (`evidence/game-upgrades-503/aura-links-3d/{before,after}.png`)
- [x] `environments.neutral`/`capture` exposure resolved (W-4): every course row names an explicit HDRI (`src/game/lighting.ts`), no neutral dependency, nothing to pin; base and after frames match
- [ ] Catalog digests refreshed (W-5) - skipped: parent refreshes digests at merge

Adoption (5.0 adoption row)

- [ ] A4 water to shader graph - skipped: ponds are already the engine `world.water` (no hand-rolled water shader to port); the only GLSL is Cinder Rim's lava (`game/water.ts`), which is not a designated pilot (last-train, silt-and-signal water, roadster-rush), so it stays GLSL and the game stays WebGL2-only
- [ ] A12 `splitScatterByDistance` + `mergeStatic` - skipped: dressing is already instanced (90 draw calls on hole 1), placement draws from the shared per-hole `rng` stream interleaved with other draws, and `scatterInArea` uses a different draw order, so switching changes placements (forbidden: seeds); a distance-LOD split would swap GLBs for cones and change the look
- [ ] A9 `camera.depth` - skipped: no far-course flicker, EXPERIMENTAL; tried the lab `?depth=logarithmic` on `holeOpeningCamera`: the mount fails with `CONTACT_SHADOW_DEPTH_CONVENTION_UNSUPPORTED` (contact shadows need standard depth), so the flag is not wired (engine issue: contact shadows vs non-standard depth)
- [ ] A13 KTX2 - skipped: course textures are live `texture.canvas` handles (`game/turfTextures.ts`), no image textures ship, so there is nothing to compress
- [x] A1 loading bar and typed failure: a course loading bar (shared `createLoadingProgress`, stage-driven, completes at first-frame ready, `body[data-aura3d-loading]`) and a readiness `failed` / mount failure now shows the code on the error card; `evidence/game-upgrades-503/aura-links-3d/after-a1-loading.png`, `after-a1-failure-code.png` (captured with the earlier headline text), `after.png` (bar gone, scene identical)
- [x] A2 diagnostics: `__AURA_QA__.backendReport` (5.0.2); draw calls 90 before and 90 after, no new warnings or degrade codes
- [x] A3 backend / A10 wide gamut: `?backend=` and `?gamut=p3` stay default-off lab flags
- [ ] A5-A8, A11, A14-A17 - not in this game's adoption row, not applicable

Verification

- [x] GC (0 errors, same 2 pre-existing warnings), UT (`tests/unit/aura-links-3d`, `showcase-port-shared`: 156 passed), CAP (REA 960x540, 12 s, identical)
- [x] before/after draw-call count via A2: 90 / 90
- [x] `node tools/game-checks/run.mjs aura-links-3d` clean (0 errors; 2 pre-existing warnings: screens-fresh, upgrade-guide)
- [x] Before/after frames attached: `evidence/game-upgrades-502/aura-links-3d/{before,after}.png` (REA capture_browser_scenario, 960x540, 12 s settle, identical)

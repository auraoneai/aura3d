# PRD-10 Phase 6 evidence — biomes, time-of-day, space, look-lint

Branch `qr/prd10-biomes`, stacked on `qr/prd10-kits` (PR #205). All surfaces remain behind `A3D_QR_WORLD` (+ `_BIOME` default-on sub-flag, §13).

## T6.1 BiomeResolver — `production-runtime/world/BiomeResolver.ts`

- `registerBiomeSources()` registers two C-09 environment sources: `prd10.biome` (priority 300) and `prd10.timeOfDay` (priority 250), both gated on declared flag `A3D_QR_WORLD_BIOME`. Frozen order: explicit 400 > biome 300 > time-of-day 250 > look 200 > scene-signal 100 > neutral-room 0.
- `resolutionFor(rig, tier)` always returns `ambient: null` + `ibl.intensity > 0` (§6.3: IBL-only policy, no hemisphere floor light). `probeFor` maps `sky-capture → {capture:{include:"sky-only", resolution:tiered, update:"once"}}`, `hdri → {hdri:url}`, `room → {capture:{include:"all",resolution:128}}`, `space-bake → {spaceBake:"world/space-default"}`.
- `defaultBiomeId(signals)` implements the §6.3 default table (terrain/lake/ocean→outdoor-day, room→interior-neutral, …). `AuraSceneSnapshot` carries no category field, so category-keyed rows are unobservable at resolve time — recorded for Q-12-1/F-10-03.
- `sceneSignals(snapshot)` reads terrain nodes / ocean|lake water / room-* names.

## T6.2 Biome handler — `agent-api/compiler/world.ts`

- `kind:"biome"` handler (owner prd10, flag `A3D_QR_WORLD_BIOME`): resolves `applyBiomeOverrides(describeBiome(biome), node.overrides)`, stores `biomeRecords[id]` for runtime/diagnostics, and emits the sun as a `light` node (`directional`, position from elevation/azimuth, `shadow` from the rig's C-10 block unless `castShadow:false`, tagged `prd10.sun`).
- `kind:"time-of-day"` handler stores `timeOfDayRecords`; `kind:"wind"` stores `windRecords` (WindField consumes it at draw).
- Sky/fog/post land through the env-source resolution (C-09/C-21 slots) rather than node emission — the handler deliberately emits no `sky` node because `prd10.*` sources already return `background`/`sky` intent; S14's "sky node submitted" is satisfied by the captured scene's sky-capture probe + setSky path, verified by the unit suite's `resolutionFor` assertions.

## T6.3 `environments.outdoor/room/space/underwater` — `agent-api/nodes/environments.world.ts`

- Flag-on (`worldBuilderSubflagOn("A3D_QR_WORLD_BIOME")`, §13 default-on under `A3D_QR_WORLD`): each builder emits a `kind:"biome"` node with `scope:"environment"` (outdoor→`outdoor-day` default, room→`interior-neutral`, space→`space`, underwater→`underwater`), preserving options as overrides.
- Flag-off: the pre-existing `studio()` fallback emits unchanged + one option-ignored degradation each, drained via `takeWorldEnvDegradations()` → `diagnostics().world.envDegradations` (the `ctx.degrade` compile seam is unbound in this repo — recorded).
- `world.water`'s `water.surface` upgrade path moved under `worldBuilderSubflagOn("A3D_QR_WORLD_WATER")` (same §13 semantics).

## T6.4 time-of-day — `agent-api/world/timeOfDay.ts` + `production-runtime/world/TimeOfDayRuntime.ts`

- `world.timeOfDay({hour, mode:"solar"|"arc", latitudeDeg, dayOfYear, northOffsetDeg, keyframes:[{hour,biome,overrides}], ibl:{recapture,thresholdDeg,crossfadeSeconds}, stars})` → `kind:"time-of-day"` node. Duplicate keyframe hours and unknown biome ids throw at build (`TOD_KEYFRAME_DUP`, `BIOME_UNKNOWN`).
- `solarPosition` = NOAA simplified (fractional-year EOT + declination); verified ±0.5° against an independent second implementation over a 20-point grid (5 hours × 4 lat/doy), in both the unit suite and `qr-prd10-time-of-day.spec.ts`.
- `arcSunPosition` for stylized arcs (sinusoidal elevation, azimuth sweeps the arc).
- `interpolateRigs(a, b, t)`: continuous fields lerp (sun incl. azimuth shortest-path, fog, shadows, practical scale via log-lerp); discrete fields (post preset, environment source, castShadow) switch at t≥0.5; `sunDetail` merged; C-26 `sun` emitted with guaranteed `colorTemperatureK`.
- `TimeOfDayRuntime` per node id: `setHour`/`animate(hoursPerSecond)`/`pause` are uniform writes only (§6.7 — no remount; `set` pauses animate). `advance(dt)` returns `{hour, sun, rig, practicalScale, captureRequest}`; captures throttle to **one face per frame** (`facesRemaining` 6→0) and re-trigger on sun move ≥ `SUN_RECAPTURE_THRESHOLD_DEG` (1.5°) or keyframe-weight delta ≥ 0.05; `ibl.recapture:false` suppresses entirely.
- `advanceTimeOfDay(records, timeSeconds, tier)` is driven from `WorldFramePasses` collect (gated `worldSubflagOn(A3D_QR_WORLD_BIOME)`); frames publish to the `prd10.timeOfDay` blackboard + `u_a3dPrd10PracticalScale` (practical lights, §6.7).
- Crossfade needs C-09 `blendFrom` — filed CCR-10-1 (#255); hard cut until then.

## T6.5 EnvironmentPresetPack — `packages/rendering/src/EnvironmentPresetPack.ts`

- `presetPackExposureFactor(entry, flags)`: behind `A3D_QR_WORLD_BIOME`, night presets drop the legacy `exposureFactor` 2.114618 normalization (factor→1); flag-off returns the stored value unchanged.
- `presetPackSsimReference(flags)`: behind the flag, per-preset SSIM references (each slot vs its own source's PMREM rows) instead of the daylight-normalized global target.
- The owner-15 test + `tests/fixtures/b3-preset-pack-rows.json` can't be edited in-lane — selectors shipped for adoption, filed Q-15-7 (#267).

## T6.6 Space — `rendering/src/world/space/{SpaceSkyBake,PlanetMaterial}.ts` + `tools/world-content-bake`

- `bakeSpaceSky({faceSize, seed})`: deterministic CPU bake of the `a3d_prd10_space_bake` shader — 6 RGBA32F faces, Milky-Way band + starfield + nebula ramp, alpha 1. `world-content-bake` writes `hdri/space-default-512-{px,nx,py,ny,pz,nz}.f32` (512², seed 0) + a `manifest.cubemaps` group entry; the `space-bake` probe resolves it as the fallback cube.
- `planetShaderSources()`/`planetAtmosphereShaderSources()` compose the §8.8 planet program (surface marker `a3dPlanetSurface`, terminator softening, atmosphere rim at `PLANET_ATMOSPHERE_RADIUS_RATIO`).

## T6.7 BiomeEnvironmentRegistry — `packages/environments/src/BiomeEnvironmentRegistry.ts`

- `BIOME_HDRI_IDS`: biome→HDRI manifest id for every shipped biome. `checkBiomeHdri` validates format, ≥2k on High/Ultra, 2:1 equirect, distinct sha256. `auditBiomeHdris(manifestPath, {tier, fileExists})` checks manifest-vs-disk hashes; missing manifest → `pending-admission` (no HDRI ships in-lane; content admission is the §12.4 follow-up).

## T6.8 Look-lint — `agent-api/world/register.ts`

- `look/world-void` (error): world geometry (terrain/scatter/grass/water) with no biome/sky/time-of-day/environment node — the void path S16/S14 target.
- `look/primitive-trees` (warning): ≥8 cylinder+sphere pairs sharing a name stem — the hand-made-tree tell.
- Registered beside env sources in `registerWorldPhase6()` from `lanes/prd10.ts`. Both rules are content-keyed (they fire on world signals only), so sentinel scenes stay silent — asserted flag-off in `qr-prd10-flag-off-identity.spec.ts`.

## T6.9 CONTRACTS Appendix B — F-10-01..08

Eight `proposed` fact rows appended after F-01-01: F-10-01 biome rig table exists/11 ids; F-10-02 ambient:null+IBL>0 policy; F-10-03 default-biome signals + category gap; F-10-04 §6.7 time-of-day semantics; F-10-05 tier memory budgets (96/192/320/512 MB); F-10-06 do-not-use list (`water.surface`, `sky.dayNight` for outdoor sky, `environments.hdri` for sky, `city.block`/`prefabs.cityBlock`, cylinder+sphere trees); F-10-07 per-game biome targets (17 games); F-10-08 sub-flag default-on §13 + Q-15-6 gap.

## T6.10 §12.3 requests — 21 issues filed

#247–#267: Q-15-1..5, Q-02-1..3, CCR-10-1, Q-07-1, Q-07-2, Q-04-1, Q-04-2, Q-11-1..3, Q-12-1, Q-13-1, Q-14-1, plus two new rows found this phase: **Q-15-6** (`resolveQrFlags` must default-on the `A3D_QR_WORLD_*` sub-flags under an enabled parent — §13 semantics; lane code already reads via `worldSubflagOn`, but the registry-gated env sources need the propagation) and **Q-15-7** (owner-15 SSIM fixture/test adopting the T6.5 selectors). PRD §12.3 table updated in-repo.

## §15 spec coverage added

- `tests/browser/qr-prd10-time-of-day.spec.ts` (S15): NOAA ±0.5° grid, `set()` no-remount (record map identity + size unchanged), ≤1 capture face/frame sequence, practical-scale day↔night flip.
- `tests/browser/qr-prd10-flag-off-identity.spec.ts` (S16): sentinels.json enumeration, `resolveEnvironment` → `legacy` under flags none, all prd10 node handlers flag-gated/inert, world look-lint rules silent on sentinel-class content, `worldSubflagOn` false.

### Found-and-fixed: browser step collected 0 tests

The lane `browser` job's playwright run silently collected **zero** tests (artifact `browser.json` on run 37471289257: `expected: 0`) — `@aura3d/*` specifiers resolve via package `exports` to `dist/`, which the job never built; `continue-on-error` masked it. Fix: `pnpm build:raw` added to the job before `playwright install`. Both new specs verified locally post-build: **9/9 pass**.

## Gates

- `npx tsc -p tsconfig.build.json --noEmit` — clean.
- `npx eslint` on all touched `.ts` — clean.
- `npx vitest run tests/unit/contracts/impl/` — **8 files / 130 tests pass**; `prd10-biomes.test.ts` adds 32 (rig table/frozen/variants/overrides, §6.3 defaults + signals, env-source priorities + probes + ambient-null, sub-flag semantics, NOAA ±0.5° + arc + keyframe bracket + rigAtHour + validation, runtime set/animate/capture-throttle/recapture-off/advance, environments.* flag on/off + default-on under parent, space bake determinism + planet sources, HDRI checks + audit, preset-pack selectors).
- `pnpm build:raw` — clean (dist emit + finalize, 30 packages).
- `npx playwright test qr-prd10-time-of-day + qr-prd10-flag-off-identity` — 9/9 pass locally (no `page` fixture needed).
- Ownership: every new/edited path → 10 except `CONTRACTS.md` (owner 15 — designated shared ledger, F-10 rows appended per T6.9) and the §12.3 doc table (PRD-10 file, owner 10).

## NOT RUN

- `terrain-*`/`scatter`/`water`/`impostor` browser specs and capture jobs — need the macos-14 lane runner (GPU); they now execute there thanks to the build step.
- S14/S15/S16 scene-level acceptance on lane CI — dispatches on this PR's run; results land with the capture artifacts.
- IBL crossfade (CCR-10-1), real absorption fog (#187), `blendFrom` probe swap — pending upstream.
- G-PANEL I1–I7 — Phase 7.

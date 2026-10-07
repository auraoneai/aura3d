# Migration guide — showcase-skyline-runner

Patch set: `migration/patches/showcase-skyline-runner/` (steps 2–4, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-skyline-runner/*.patch
```

## Before numbers (main)

- capture branches: **11 ART / 2 FRAMING / 0 TRANSIENT / 41 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (51 refs): review
  camera tuning override, review-only star/moon/starfield dressing, pine
  thinning, back-wall density, hero scale/shadow swaps.
- capture globals: `__AURA3D_COMPOSITION_PROBE__`,
  `__AURA3D_SKYLINE_DENSITY_CAPTURE__`, `__AURA3D_SKYLINE_GHOST_CAPTURE_STEP__`
  (all deleted). Evidence `__AURA3D_SHOWCASE_SKYLINE_RUNNER__` → lazy sections.
  Test hooks kept: `__AURA3D_SKYLINE_GHOST_SEED__`, `__AURA3D_SKYLINE_PUMP__`.
- route-composition (main): 3,369 evidence / 5,598 presentation / 3,765 gameplay LOC
- route-composition (after): 3,075 evidence / 5,737 presentation / 3,846 gameplay LOC
- residual scanner tokens: 6 UNKNOWN — prose comments only, zero branches.

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-capture-cleanup-evidence-drive` | `createAuraApp` → `createGame({id:"showcase-skyline-runner", target:"#app", diagnostics:{overlay:false,performancePanel:false}, physics:{seed:20260910,adaptive×4}, renderer:{mode:"production",qualityProfile:"safe-basic"}, pixelRatio:0.7, scene(), qualityRebuild:{flags:["game"]}})` + `skylineGame.start()`; all 51 `visualReviewCapture` refs → play arm (gameplay `baseCameraTuning`, full star/moon/starfield + winter backdrops, full pine set, play-scale badges/markers, play hero scale + shadows, bloom .1/AO .2/studio .86, platformer presentation surfaces); `compositionPoseSettled`/`compositionSubjectSuppressed`/`skylineDensityCaptureGameX` folded out; probe + density + ghost-step globals deleted; `paused` → `skylineGame.session.paused` (`skylineFeel.togglePause()` now drives `session.pause("user")`/`resume()`); `mountedEvidence` bound via `src/evidence.ts` `sections.skyline` + `legacyGlobals`; `src/scenario-drive.ts` (`stepSim`/`stepRender`/`pumpFrames`); `src/scenarios/` adds `play` + `opening-jump` (`pumpFrames(90)` = airborne past first ledge) | renderer mode/qualityProfile/fallback, pixelRatio 0.7, gameplay camera rig, full dressing lists, hero scale/shadows, all challenge/event plumbing, `?juiceProbe=1` root-kit adoption flag (separate feature) |
| `06-juice` | `createJuice` over 6 events: `jump` streak, `collect` pickup+punch, `checkpoint` ring+flash, `hazard` flash+vignette+hitStop .055+shake, `defeat` burst+shake+punch, `finish` ring+flash; `skylineTween.tick(step)` beside `updateEventFeedbackVisuals`; `@aura3d/game` dep | `skylineFeel` calls untouched — juice adds overlay/vignette layer on top of root-kit trauma/punch |

## No step 5/7/9/12

- **05-sound**: `skyline-audio.ts` is already a `createGameAudio` manifest
  adapter — no-op.
- **07-hud / 09-touch / 12-shell**: `setupSkylineHud` DOM panel +
  `bindGameTouchControls` stay route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- `skyline-density-lod.spec.ts` reads `__AURA3D_SKYLINE_DENSITY_CAPTURE__` →
  migrate to `?capture=scenario&scenario=opening-jump` or the drive surface.
- `skyline-ceremony-evidence.spec.ts` uses `__AURA3D_SKYLINE_GHOST_CAPTURE_STEP__`
  → step the ghost through `skylineDrive().stepRender` equivalents (pump seam
  stays as `__AURA3D_SKYLINE_PUMP__`).
- All evidence readers (`__AURA3D_SHOWCASE_SKYLINE_RUNNER__`) →
  `__AURA3D_GAME_EVIDENCE__.sections.skyline` (legacyGlobals covers one release).
- `?capture=review` parity was **0/0/0/6** on the shadow tree (6 comment tokens,
  zero branches).

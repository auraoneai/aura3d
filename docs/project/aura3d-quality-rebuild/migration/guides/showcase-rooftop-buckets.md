# Migration guide — showcase-rooftop-buckets

Patch set: `migration/patches/showcase-rooftop-buckets/` (steps 2–5, 8, 10, 11
of §10). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-rooftop-buckets/*.patch
```

## Before numbers (main)

- capture branches: **21 ART / 4 FRAMING / 0 TRANSIENT / 76 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) + `animationDebugCapture`
  (`?debug=animation`) declarations in `main.ts`, plus `reviewCapture` ternaries
  inside `environment.ts`.
- globals: `__ROOFTOP_BUCKETS_EVIDENCE__`, `__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__`,
  `__RB_SCENARIO__`, `__RB_SET_SPOT__`, `__RB_PUMP__`, `__RB_SHOOT__`,
  `__RB_ACTIVE_SHOT__`, `__AURA3D_COMPOSITION_PROBE__`.

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game` | `createGameApp` → `createGame`; `pause` key dropped from `input.actions` (session lifecycle owns it); `@aura3d/game` dep | input map, loop `1/60`, physics seed + adaptive substeps, production renderer profile |
| `03-delete-capture-branches` | deletes both flag declarations, every `visualReviewCapture ? … : …` ternary (lights, materials, scales, camera, `PRESENTATION_ATHLETE_SCALE`, `pixelRatio`), the `?debug=animation` hidden-athletes mount (`main.ts:502-536`) and its clip drive, review-only flight echoes + contest-reach fx, `stageActiveReviewShot`/`__RB_ACTIVE_SHOT__`; in `environment.ts` removes the `reviewCapture` option and the whole review-only sky-club pavilion world (terrace deck, club sign, scorer table, seat tiers, court curbs ~200 LOC) | play arm everywhere: ambient 1.32 / directional 3.6, camera `[1.6,4.35,10.25]` fov 48, pixelRatio `min(dpr,1.75)`, all court spots + aim points, play key dimensions |
| `04-scenarios` | `__RB_SCENARIO__` + `__RB_SET_SPOT__` → nine `GameScenario` modules under `src/scenarios/` bound through `scenario-drive.ts` and the `scenarios:` option | identical staging: recordShotOutcome calls, pressure flight staging (0.72/0.12 × 8 frames), paused hold, modal hide |
| `05-sound` | `buckets-audio.ts` → `src/sound.ts` over `createGameAudio` + game-sfx-core ids (`sports.net-swish`/`sports.rim`/`sports.ball-bounce-*`, `ui.score-tick`, `stinger.level-start`/`checkpoint`/`win`/`lose`, `ambience.wind-high`); deletes `scripts/build-sfx.mjs`, generated WAVs, public copies, `rooftopBuckets*Sfx` typed-asset entries, `build:sfx` script | same cue names, `audioCuesHeard` log kept, ambience starts on unlock |
| `08-session-pause` | `togglePause` → `bucketsGame.session.pause("user")/resume()` mirrored by `app.pause()/resume()`; KeyP/Escape keydown branches removed; evidence `state` reports `session.paused` | `rb-touch-pause` button still toggles; scenario-staged `paused` state preserved |
| `10-evidence-sections` | `publishEvidence` → lazy `collectRouteEvidence` bound via `src/evidence.ts` `sections()`; `evidence:{schema,sections,legacyGlobals}` keeps `__ROOFTOP_BUCKETS_EVIDENCE__`/`__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__` live one release; deletes `scripts/write-performance-report.ts` + `evidence:performance` (use `aura3d perf-report`) | all evidence keys preserved |
| `11-juice` | `createJuice` facade over the real session: swish → `fx.burst("ring")` + `hitStop(0.045)`; rim/board/block → spark/dust + shake; fire/gold/buzzer/victory/heat → overlay flash, punch, shake; `rooftopTween.tick(dt)` in `stepGame` | `triggerContactFx` keeps driving the scene-owned burst/ray geometry |

## Filed to PRD-14 (art/camera tasks, never kept behind a flag)

- **A-RT-1**: review lighting was a warmer/dimmer night-league grade (ambient
  0.72 vs 1.32, dir 2.75 vs 3.6, tracer emissive 3.05 vs 1.4, pavilion interior
  brighter). If the play frame reads flat on G-PANEL review, adjust the play
  values — do not restore a capture arm.
- **A-RT-2**: review camera was the sideline action lens
  `[4.35,3.45,7.2]`/`[-0.86,1.55,1.18]` fov 46 vs play `[1.6,4.35,10.25]`/
  `[-0.22,1.9,1.3]` fov 48. If review captures need the tighter frame, move the
  PLAY camera; the scenario registry (`pressure`) stages the same live beat.
- **A-RT-3**: review world swapped the open rooftop skyline for the sky-club
  pavilion world (terrace deck, club sign, curbs, seat tiers). Deleted — if a
  pavilion backdrop is wanted in the shipped game, file it under PRD-14 as a
  play-lane addition.
- **A-RT-4**: `?debug=animation` mounted the 191-joint skinned athletes
  (`rooftopLayupScorer`/`rooftopDefender`, hidden). If animation debugging is
  still needed, re-add as a lane-14 debug tool, not a route flag.

## Verification (shadow migration, scratch tree only)

- `git am` applies all seven patches cleanly on `main@5f5d6088` (verified
  `main.ts`/`environment.ts` esbuild-parse clean after).
- `game-capture-parity.mjs` on the patched tree: `showcase-rooftop-buckets`
  drops out of the table entirely — **0/0/0/0**.
- `src/scenarios/` files reach the route only through `scenario-drive.ts`
  (no lights/material/effects — lint-clean).
- Compiles only after `qr/prd09-hud`/`qr/prd09-juice` package PRs merge —
  `createGame`, `createJuice`, `createFxParticlePass`, `createOverlayDriver`,
  `createTweenEngine`, `createRumbleDriver` do not exist on `main`.

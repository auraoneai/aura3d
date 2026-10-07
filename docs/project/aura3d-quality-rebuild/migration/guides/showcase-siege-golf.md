# Migration guide — showcase-siege-golf

Patch set: `migration/patches/showcase-siege-golf/` (steps 2–4, 8, 10–11 of
§10, combined in one patch). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-siege-golf/*.patch
```

## Before numbers (main)

- capture branches: **0 ART / 2 FRAMING / 0 TRANSIENT / 15 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) + `evidenceCapture`
  (`?capture=evidence`): opening-vs-aim camera phase, review structural lens
  (perspective 5.4/5.2/11.4 fov 42), targetMaxDimension ×1.65 ball, mascot-mound
  ornaments (`vrc||ec`), aim-node thinning `i%2`, dust lifetime 120,
  `reviewImpactFrozen` app.pause on first Rapier impact, `?capture=evidence`
  480-frame settle window.
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted: subject/settleSubjectPose/
  setSubjectSuppressed + `COMPOSITION_BALL_SCALE`); `__SIEGE_GOLF_EVIDENCE__`
  + `__AURA3D_SHOWCASE_SIEGE_GOLF__` (kept, written inside collect); `__SG_SHOT__` kept.
- route-composition (main): 1,474 evidence / 1,190 presentation / 2,998 gameplay LOC
- route-composition (after): 1,411 evidence / 1,216 presentation / 3,036 gameplay LOC

## Patch `02-06-*` (combined; the two steps landed in one commit)

- `createGameApp` → `createGame({id:"showcase-siege-golf", target:"#app",
  diagnostics, physics, input, loop:{fixedDt:1/60,maxSubSteps:2},
  scene:buildHoleScene(HOLES[0],cameraPhase), qualityRebuild:{flags:["game"]},
  evidence:{sections.siege,legacyGlobals:["__AURA3D_SHOWCASE_SIEGE_GOLF__"]},
  scenarios})`; `app=siegeGame.runtime`, `input=siegeGame.input`, `siegeGame.start()`.
- Both `?capture` modes deleted: `cameraPhase` init `vrc?"aim":"opening"` →
  `"opening"`, review lens → follow camera, ball scale fixed, mascot mounds +
  `reviewImpactFrozen` deleted, aim-node thinning → `!aiming`, dust 120→24/16,
  settle window `evidence?480:` → `reducedMotion?30:45`.
- `let paused` → `siegeGame.session.paused` (+ `session.pause("user")/resume()`).
- `publishEvidence`→`collectSiegeEvidence()` (still writes both globals) +
  `src/evidence.ts` `sections.siege`; `src/scenario-drive.ts` `pumpFrames`;
  `src/scenarios/` `play` + `opening-settled` (120 frames).
- Juice: `createJuice` 7 events (drive-hit shake+punch+rumble, impact-wood/
  -metal debris/spark, target-down burst+rumble, cup-sink ring+flash,
  hole-complete ring+flash+hitStop .05, bogey vignette+flash) on the same
  `pushCue` sites; `siegeTween.tick(dt)` in onFrame; `@aura3d/game` dep.

## Kept play values / no other steps

- `golf-audio` already `createGameAudio`-based → no 05. DOM HUD + touch input
  route-owned → no 07/09/12.
- Kept: `__SG_SHOT__`, `runSixtySecondReplay`, DOM stat card, golf cues.

## Spec-migration handoffs (Q-14-1 → filed)

- `__AURA3D_COMPOSITION_PROBE__` consumers → `?capture=scenario&scenario=opening-settled`.
- Specs on `?capture=review`/`?capture=evidence` composition → scenario names above.
- Parity on shadow tree: **0/0/0/0**.

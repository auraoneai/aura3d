# Migration guide — showcase-patrol-wing

Patch set: `migration/patches/showcase-patrol-wing/` (steps 2–5, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-patrol-wing/*.patch
```

## Before numbers (main)

- capture branches: **4 ART / 4 FRAMING / 0 TRANSIENT / 14 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (15 refs: review chase
  lens offset/fov/smoothing, sky/fog/bloom/background swaps, atmosphere/streak
  thinning) + `sky.ts` `reviewCapture` option (cloud/prop/dressing swaps).
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted);
  `__AURA3D_SHOWCASE_PATROL_WING__`/`__PATROL_WING_EVIDENCE__` (→ lazy sections,
  `__PATROL_WING_EVIDENCE__` still written); test hooks kept:
  `__PW_SHOT__`/`__PW_PUMP__`/`__PW_SCENARIO__`/`__PW_DAMAGE__`.
- route-composition (main): 1,571 evidence / 1,751 presentation / 2,166 gameplay LOC
- route-composition (after): 1,529 evidence / 1,848 presentation / 2,184 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-capture-cleanup-evidence-sound` | `createGameApp` → `createGame({id:"showcase-patrol-wing", target:"#app", diagnostics, physics, input, loop:{fixedDt:FLIGHT_DT}, scene:buildScene(), qualityRebuild:{flags:["game"]}, evidence:{sections.patrol,legacyGlobals}, scenarios})`; `app = patrolGame.runtime`, `input = patrolGame.input` + `patrolGame.start()`; all `visualReviewCapture`/`sky.ts reviewCapture` refs → play arm (play chase lens [0,2.5,7.25] fov 47 smoothing .06, full sky bands/streaks/atmosphere, play fog .0042/bloom .12); `sky.ts` `reviewCapture` param deleted; `paused` → `patrolGame.session.paused`; probe deleted; `publishEvidence`→`collectPatrolEvidence()` (still writes `__PATROL_WING_EVIDENCE__`) bound via `src/evidence.ts`; `src/scenario-drive.ts` (`pumpFrames`/`stage` delegating to `__PW_SCENARIO__`); `src/scenarios/` maps the existing `__PW_SCENARIO__` stages: `play`, `ring-run`, `drone-pass`, `drone-hit`; **sound**: `wing-audio.ts` prop drone is a real `sound.engine` loop (`patrolWingEngineLoopSfx`, rpm 400→2400 live pitch + setLoad) driven by `setEngineIntensity(flight.throttle, airborne)` — replaces the bus-volume ride; `@aura3d/audio` dep | all `__PW_*` test hooks, gamepad/touch/game input config, loop timing |
| `06-juice` | `createJuice` over 9 events: `cannon` muzzle, `drone-hit` spark+punch, `drone-down` burst+shake, `hull-alarm` vignette+flash, `crash` debris+shake+vignette, `shot-down` flash+vignette+hitStop .07, `touchdown` ring+punch, `clear` pickup+flash, `ring` ring; `patrolTween.tick` in onFrame; `@aura3d/game` dep | `pushCue` audio calls untouched |

## No step 7/9/12

DOM HUD (`pw-throttle-fill` etc.) + `input.touch` gamepad bindings stay
route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- `__PW_SCENARIO__` stages now reachable via `?capture=scenario&scenario=<id>`
  (`play|ring-run|drone-pass|drone-hit`); the window hook stays for specs.
- Evidence readers: `__PATROL_WING_EVIDENCE__`/`__AURA3D_SHOWCASE_PATROL_WING__`
  → `__AURA3D_GAME_EVIDENCE__.sections.patrol`.
- `__AURA3D_COMPOSITION_PROBE__` consumers → scenario `drone-pass` (it already
  staged exactly what `settleSubjectPose` staged).
- Engine-loop cue no longer fires as a one-shot `engine-loop` play — it is a
  `sound.engine` rpm loop; assert the loop evidence instead.
- Parity on shadow tree: **0/0/0/0**.

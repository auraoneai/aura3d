# Migration guide — showcase-deep-recovery

Patch set: `migration/patches/showcase-deep-recovery/` (steps 2–5, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-deep-recovery/*.patch
```

## Before numbers (main)

- capture branches: **5 ART / 7 FRAMING / 0 TRANSIENT / 10 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (20 refs: review basin
  camera, wreck-lamp tableau, tiny-review wreck proxy) + `options.review` inside
  `environment.ts` (91 refs: review-only distant-wreck plate, light swaps,
  skip-lists for silt plates/route beacons/persistent sonar echoes).
- globals: `__AURA3D_SHOWCASE_DEEP_RECOVERY__` (→ lazy sections),
  `__DEEP_RECOVERY_EVIDENCE__` (kept — tests read it; still published).
- route-composition (main): 1,684 evidence / 1,186 presentation / 2,162 gameplay LOC
- route-composition (after): 1,481 evidence / 1,099 presentation / 2,397 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-sound-engine-thruster-evidence` | `createAuraApp` → `createGame({id:"showcase-deep-recovery", target:"#canvas-host", physics:{seed:20260918,adaptive×4}, scene:sceneDef, qualityRebuild:{flags:["game"]}, evidence:{sections.deep,legacyGlobals}, scenarios})` + `deepGame.start()`; all `visualReviewCapture` + `options.review` refs → play arm (play basin camera [6.4,9.2,-15.4] fov 62, full WRECK_OBSTACLES/crates/sonar targets, play lamp/material values, distant-wreck at z -8, all silt/beacon/mid-water dressing); `environment.ts` `review` param deleted; `gameState` pause transition also drives `deepGame.session.pause("user")`/`resume()`; `updateEvidence` → `collectDeepEvidence()` bound via `src/evidence.ts` `sections.deep` (`__DEEP_RECOVERY_EVIDENCE__` still written for existing specs); `src/scenario-drive.ts` (`stepSim`/`stepRender`); `src/scenarios/` `play` + `approach-dive` (180 sim-steps) | gameState machine (playing/paused/blackout/won) untouched; `__DEEP_RECOVERY_EVIDENCE__` publication preserved |
| `05-sound-htmlaudioengine-thruster` (folded into 02) | `deep-audio.ts` rewritten: `HTMLAudioElement` map → `createGameSoundEngine` with all 11 cues as `SoundCueSpec`s (`ambient-deep` as `sound.loop` w/ ambience bus); new `thruster` cue + `sound.engine({cue:"thruster",rpmRange:[260,1500],pitchRange:[0.7,1.35]})` — propulsion loop reuses the authored `deepRecoveryHullCreakSfx` layer (approximation: no dedicated motor sample exists); `audio.thruster.start/stop/setThrottle` driven by |throttle| in the input step | same controller API (`init/playCue/startAmbience/stopAmbience/getHistory`) so every main.ts call site is unchanged; `cueHistory` semantics identical; `@aura3d/audio` dep |
| `06-juice` | `createJuice` over 8 events: `ping` ring, `breach` flash+vignette+shake (both call sites), `seal` ring+punch, `latch` spark, `bank` pickup+flash, `blackout` flash+vignette+hitStop .08, `won` ring+flash, `impact` debris (>3.5 m/s impacts); `deepTween.tick` in `runSimulationStep`; `@aura3d/game` dep | `audio.playCue` calls untouched |

## No step 7/9/12

DOM HUD + `bindHeldButton` touch controls stay route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- Evidence readers: `__DEEP_RECOVERY_EVIDENCE__` (kept live) +
  `__AURA3D_SHOWCASE_DEEP_RECOVERY__` → `__AURA3D_GAME_EVIDENCE__.sections.deep`.
- `?capture=review` consumers → `?capture=scenario&scenario=approach-dive`.
- `deep-audio.spec` expectations on `HTMLAudioElement` mocking → the engine's
  `sound` layer (no DOM audio elements exist now).
- Parity on shadow tree: **0/0/0/0**.

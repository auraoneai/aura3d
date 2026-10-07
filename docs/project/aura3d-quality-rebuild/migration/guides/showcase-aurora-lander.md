# Migration guide — showcase-aurora-lander

Patch set: `migration/patches/showcase-aurora-lander/` (steps 2–5, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-aurora-lander/*.patch
```

## Before numbers (main)

- capture branches: **1 ART / 4 FRAMING / 0 TRANSIENT / 25 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (30 refs): review
  extraction-bay tableau (pad ring scale, lander ghost, EXTRACTION BAY card,
  twin lights, review lens fov 46 + smoothing 0), DOM panel auto-expand.
- globals: `__AURA3D_SHOWCASE_AURORA_LANDER__` (→ lazy sections).
- route-composition (main): 1,595 evidence / 885 presentation / 2,581 gameplay LOC
- route-composition (after): 1,627 evidence / 952 presentation / 2,603 gameplay LOC
- residual scanner tokens: 4 UNKNOWN — prose comments + `captureNodeHandles` fn name.

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-capture-cleanup-evidence-drive` | `createAuraApp` → `createGame({id:"showcase-aurora-lander", target:"#app", diagnostics:{overlay:false,performancePanel:false}, physics:{seed:20260915,adaptive×4}, scene:buildWorldScene(), qualityRebuild:{flags:["game"]}, evidence:{sections.aurora,legacyGlobals}, scenarios})` + `auroraGame.start()`; 30 `visualReviewCapture` refs → play arm (pad radius ×2.05, no ghost/extraction tableau, "EXTRACTION READY" card at play size, play light intensities 2.2/1.8, play lens offset [0,5.8,13.2] fov 58 smoothing .05, scaffold/extraction visible); `paused` → `auroraGame.session.paused` (`P` toggles `session.pause("user")`/`resume()`); evidence bound via `src/evidence.ts`; `src/scenario-drive.ts` (`stepSim`/`stepRender`); `src/scenarios/` `play` + `descent` (150 sim-steps) | physics config, play camera/light/dressing values, dataset.capture writes (now static "default"), DOM review panel (toggle still works) |
| `05-sound-thruster-engine` | `lander-audio.ts`: new `createGameSoundEngine` thruster instance — `sound.engine({cue:"thruster", rpmRange:[320,2100], pitchRange:[0.85,1.3]})`; controller exposes `thruster.start/stop/setThrottle/running`; main loop replaces `thrustLoopActive` flag with `thruster.start()` + `setThrottle(controls.thrust)` live each fixed step; stops on touchdown (crash + scored paths); `@aura3d/audio` dep | all 10 manifest cues + `cue()` path unchanged (`thrust-loop` cue remains registered for compat); buses/proof shape identical |
| `06-juice` | `createJuice` over 6 events: `touch-soft` ring+punch, `touch-hard` debris+shake+vignette, `crash` flash+vignette+hitStop .07+debris, `pad-lock` ring+flash, `site-clear` pickup+flash, `launch` streak; `auroraTween.tick(dtFixed)` beside `stepLander`; `@aura3d/game` dep | `playCue` audio calls untouched |

## No step 7/9/12

DOM briefing panel + `bindGameTouchControls`-style touch inputs stay
route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- Evidence readers: `__AURA3D_SHOWCASE_AURORA_LANDER__` →
  `__AURA3D_GAME_EVIDENCE__.sections.aurora` (legacyGlobals live one release).
- `?capture=review` consumers → `?capture=scenario&scenario=descent`.
- Thruster loop is now driven by `sound.engine` — specs asserting
  `audio.cuesPlayed` contains `thrust-loop` should assert the engine loop
  evidence instead (cue no longer fires as a one-shot).
- Parity on shadow tree: **0/0/0/4** (4 comment/name tokens, zero branches).

# Migration guide — showcase-vault-breakers

Patch set: `migration/patches/showcase-vault-breakers/` (steps 2–4, 8, 10–11 in
one commit). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-vault-breakers/*.patch
```

## Before numbers (main)

- capture branches: **0 ART / 2 FRAMING / 0 TRANSIENT / 1 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`): perspective camera position
  [0,5.9,5.15] / target [0,0.08,-0.45] / fov 46.
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted:
  subject/settleSubjectPose/setSubjectSuppressed scaling mechanisms node);
  `__VAULT_BREAKERS_EVIDENCE__` + `__AURA3D_SHOWCASE_VAULT_BREAKERS__` (kept via
  collect + legacyGlobals); test hooks kept: `__VB_SHOT__`, `__VB_PUMP__`,
  `__VB_SCENARIO__` (now delegates to the scenario drive).
- route-composition (main): 1,523 evidence / 1,289 presentation / 2,256 gameplay LOC
- route-composition (after): 1,503 evidence / 1,294 presentation / 2,344 gameplay LOC

## Patch `02-06-*`

- `createGameApp` → `createGame({id:"showcase-vault-breakers", target:"#app",
  diagnostics, renderer:{production+safe-basic fallback}, physics, input
  (flipperLeft/Right/plunger/nudge/pause/reset + gamepad + touch),
  loop:{fixedDt:1/60,maxSubSteps:2}, scene:buildScene(),
  qualityRebuild:{flags:["game"]}, evidence:{sections.vault,
  legacyGlobals:["__AURA3D_SHOWCASE_VAULT_BREAKERS__"]}, scenarios})`;
  `app=vaultGame.runtime`, `input=vaultGame.input`, `vaultGame.start()`.
- `let paused` → `vaultGame.session.paused` + `pause("user")/resume()`.
- `publishEvidence`→`collectVaultEvidence()` (still writes
  `__VAULT_BREAKERS_EVIDENCE__`) + `src/evidence.ts` `sections.vault`.
- `__VB_SCENARIO__` body → `stageScenario(id)`; `src/scenario-drive.ts`
  (`pumpFrames` via `app.step` like `__VB_PUMP__`, `stage`);
  `src/scenarios/` `play` + 5 staged scenarios (`bank-near-complete`,
  `vault-opening`, `multiball`, `tilt`, `game-over`) mapping the hook 1:1.
- Review camera → play values ([0,5.15,7.35] / [0,-0.05,-0.38] / fov 50).
- Juice: `createJuice` 9 events — serve punch, bumper burst+shake, sling spark,
  target-down spark, bank-clear ring+flash, vault-open ring+flash+hitStop .04+
  rumble, multiball burst+flash+rumble, drain vignette+flash, tilt
  shake+vignette+rumble — on the `consumeEvents` pushCue sites;
  `vaultTween.tick(dt)` in onFrame; `@aura3d/game` dep.

## Kept play values / no other steps

- `pinball-audio` already `createGameAudio` → no 05. DOM HUD + touch buttons → no 07/09/12.
- `__VB_*` hooks, `manualHeld` keyboard mirror, `consumeEvents`, `triggerImpact` kept.

## Spec-migration handoffs (Q-14-1 → filed)

- `__VB_SCENARIO__` consumers keep working (delegates to the drive) but specs
  should prefer `?capture=scenario&scenario=<id>` over the window hook.
- `__AURA3D_COMPOSITION_PROBE__` deleted → scenario `vault-opening` for the
  mechanism-assembly frame.
- Parity on shadow tree: **0/0/0/0**.

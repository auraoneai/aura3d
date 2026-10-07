# Migration guide — showcase-neon-swarm

Patch set: `migration/patches/showcase-neon-swarm/` (steps 2–4, 8, 10, 11 of
§10, with the composition probe folded into the scenario contract). Generated
against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-neon-swarm/*.patch
```

## Before numbers (main)

- capture branches: **4 ART / 5 FRAMING / 0 TRANSIENT / 50 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) across `main.ts` (60 refs) plus
  `reviewCapture` params in `environment.ts`/`swarm.ts`.
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted), `__NEON_SWARM_EVIDENCE__`,
  `__AURA3D_SHOWCASE_NEON_SWARM__` (→ lazy sections), `__NEON_SWARM_DEBUG__`
  (test hook — kept).
- route-composition (main): 1,663 evidence / 1,366 presentation / 2,601 gameplay LOC
- route-composition (after): 1,329 evidence / 1,561 presentation / 2,718 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-and-capture-cleanup` | `createAuraApp` → `createGame({id:"showcase-neon-swarm", target:"#app", scene:()=>appScene, diagnostics, physics:{seed:20260913, adaptive-substeps×4}, qualityRebuild:{flags:["game"]}})` + `neonGame.start()`; deletes `visualReviewCapture` decl + `dataset.capture`, resolves ~60 `? :`/if branches to the play arm in `main.ts`; `createSwarmSimulation({reviewCapture})` param + `reviewCapture` option type dropped; `createNeonSwarmDistrictDressing(reviewCapture)` → play arm (ambient 1.05, key 2.0, rim 0.72); `compactDefaultComposition` folds to true | every play arm verbatim: backdrop `#081316` at y −8, street plane 57×39, courier `neonCourierAvatar` materials (`#214f68`/rough .3/emissive `#2bd7e7`/targetHeight 2.95), `cameraDirector` config, all compact-density counts (6/8/12) |
| `04-session-pause-probe-removal-cameradirector` | `let paused` → `neonGame.session.paused` (+`session.pause("user")`/`resume()` on `input.pressed("pause")`, `session.resume()` in `resetRun`/`killPlayer` paths); `__AURA3D_COMPOSITION_PROBE__` deleted; **`cameraDirector.update` output now fed to `app.camera.setPose({position,target,fov})`** per C-22 (was `void cameraState`) | `runState` machine + HUD `paused` field unchanged; probe's suppressed-node list was review-only |
| `05-evidence-sections-scenario-drive` | `publishEvidence` → `collectRouteEvidence()` bound via `src/evidence.ts` (`bindNeonEvidence`, `sections.neon`); `evidence:{schema:1,sections,legacyGlobals}` on createGame; `__NEON_SWARM_DEBUG__` hooks re-exposed through `src/scenario-drive.ts` (`jumpToWave`/`stageFinalePulse`/`finishFinale`/`stepFixed`); `src/scenarios/` adds `play` + `finale` (`jumpToWave(5)` → `stepFixed(1)` → `stageFinalePulse`) | every evidence key preserved (waves, combo, upgrades, alive counts, terminal hash, diagnostics, physics text, claimBoundary); `aura3dShowcaseReady` dataset flag kept |
| `06-juice` + `06b-wave-clear-juice` | `createJuice` over 11 events: `pulse-fire` muzzle, `drone-hit`/`graze` spark, `drone-die` debris, `player-hurt` flash .16+shake .18, `burst` ring+shake .3+punch 4°+hitStop .05, `dash` streak, `pickup` pickup-fx+flash, `wave-start`/`wave-clear` ring+pickup, `death` flash+vignette+hitStop .07; `neonTween.tick(dt)` in update loop; adds `@aura3d/game` dep | `cameraDirector.impact()` calls kept (shake now lands via setPose); `combatFeel.stepSparks` pool unchanged |

## No step 5/7/9/12

- **05-sound**: `swarm-audio.ts` already `createGameAudio` typed manifest —
  no-op.
- **07-hud / 09-touch / 12-shell**: DOM `setupHud` + `game.touchControls`
  layout stay route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- `neon-swarm-instancing.spec.ts` + finale/instancing specs read
  `window.__NEON_SWARM_EVIDENCE__` and drive `__NEON_SWARM_DEBUG__` — the
  debug hook stays; migrate reads to `__AURA3D_GAME_EVIDENCE__.sections.neon`
  (legacyGlobals covers one release).
- `?capture=review` consumers (`neon-swarm` entries in thumbnail/preview
  specs) → `?capture=scenario&scenario=finale` for the charged-pulse frame.
- `__AURA3D_COMPOSITION_PROBE__` consumers → `?capture=scenario` +
  `neon-player` node visibility via `app.nodes`.
- `?capture=review` parity was **0/0/0/0** on the shadow tree.

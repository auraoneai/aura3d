# Migration guide — showcase-blockfall-reactor

Patch set: `migration/patches/showcase-blockfall-reactor/` (steps 2–4, 8, 10,
11 of §10). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-blockfall-reactor/*.patch
```

## Before numbers (main)

- capture branches: **8 ART / 12 FRAMING / 0 TRANSIENT / 21 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` plus `reviewCapture`
  ternaries inside `reactor-scene.ts` / `board-view.ts`.
- globals: `__AURA3D_COMPOSITION_PROBE__`, `__AURA3D_BLOCKFALL_BLOOM_PROBE__`,
  `__AURA3D_BLOCKFALL_ATTRACT_PROBE__`, `__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__`,
  `__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__` — all 5 removed/migrated (PRD-09).
- route-composition (main): 1,727 evidence / 977 presentation / 4,423 gameplay LOC
- route-composition (after): 1,548 evidence / 1,002 presentation / 4,670 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game` | `createGameApp` → `createGame` (`scene: () => reactorScene`, `scenarios`, `evidence` wired); removes `createShowcaseRapierPhysicsProof` import + its `collisionWorld`/`physics` evidence slots (per PRD: rapier-physics-proof deprecated) | input map, loop `1/60` ×2 substeps, physics seed 20260909 + adaptive substeps |
| `03-delete-capture-branches` | deletes the flag + `dataset.reviewCapture`, all ~34 `visualReviewCapture ?` ternaries, the room-node drop (`.addMany([] : createArcadeRoomNodes())` → always mounted), `createScoreboardNodes`/`createBoardShell` `reviewCapture` params, the mascot-hidden/quad-node review branch | play arm everywhere: backdrop `targetHeight 8.25`, background `#24103a`, cabinet 4.2 target size, camera `[0,1.86,8.45]` fov 32, marquee plate/armor scales, mascot positions `-3.48/3.02`, all light intensities (0.58/1.18/1.42/0.42/0.68), scoreboard word/rail Y positions, board light columns |
| `04-scenarios` | deletes `__AURA3D_COMPOSITION_PROBE__`, `__AURA3D_BLOCKFALL_BLOOM_PROBE__`, `__AURA3D_BLOCKFALL_ATTRACT_PROBE__`, `__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__`; acceptance apply/resume/unfreeze/stageRotationTrap + attract enter/exit/isActive → `src/scenario-drive.ts` bound once from `main.ts`; `?capture=scenario&scenario=<id>`: `play`, `single-clear`, `quad`, `level-up`, `danger`, `game-over`, `rotation-trap`, `attract-enter`, `attract-exit` | identical staging (`applyAcceptanceScenario` unchanged), same kit mutations + `app.pause()`/`app.step(0)` freeze |
| `08-session-pause` | `let paused` → `blockfallGame.session.paused`; `{type:"pause"}` action toggles `session.pause("user")`/`resume()` + `app.pause()/resume()`; reset/replay/attract-exit call `session.resume()` | `state.paused` still reported from session; attract idle + acceptance freeze logic unchanged |
| `10-evidence-sections` | `publishEvidence` → `collectRouteEvidence` bound via `src/evidence.ts` `sections()`; `evidence:{schema:1,sections,legacyGlobals}` keeps `__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__` live one release; drops `physics` evidence slot | every evidence key preserved (audio, boardView, clearFx, cameraFeel, scoreboard, attract, hudSnapshot, runtimeEvidence) |
| `11-juice` | `createJuice` over 6 events: `lock` (dust+shake .06), `line-clear` (streak+flash), `quad` (ring 20+shake .22+punch 3.5°+hitStop .05), `level-up` (spark+flash), `game-over` (flash .22+vignette+hitStop .06), `rotate-denied` (flash .1); `blockfallTween.tick(dt)` in the frame loop | `clearFx.burst`/`cameraFeel.punch`/`rotateDeniedFlash` still drive their scene-owned effects alongside |

## No step 5/6/7/12

- **05-sound**: already `createGameAudio` + typed `blockfallAudioManifest`
  (14 cues incl. 4 additive music stems, all CC0-registered via
  `aura.assets.json`); nothing to replace — `game-sfx-core` has no music
  stems, so the authored stem loops stay.
- **07/12 hud-touch**: DOM HUD (`hud-panel`, `data-touch-action` buttons,
  attract card) is the route's authored shell; lane-14 decides whether the
  shared `GameShell`/`mountTouchControls` themes replace it.

## Filed to PRD-14 (A-BF-1..4)

- **A-BF-1** review camera `[0,2.4,8.45]` fov 33 vs play `[0,1.86,8.45]` fov 32 —
  the review stills' framing values are gone with the flag; re-author if the
  stills job needs them.
- **A-BF-2** review backdrop scale `targetHeight 14.2` at `y -0.38` and the
  `#07131d` background — the bigger art-plate framing; play keeps 8.25/`#24103a`.
- **A-BF-3** bloom stills probe (`__AURA3D_BLOCKFALL_BLOOM_PROBE__.setIntensity`)
  — `tests/browser/blockfall-bloom-stills.spec.ts` needs a new driver
  (`bloomEffectNode` is scene-local).
- **A-BF-4** `__AURA3D_COMPOSITION_PROBE__` consumers
  (`tests/browser/showcase-route-primary-probes.spec.ts`,
  `smart-city-composition-301.spec.ts`, `scratch-capture.spec.ts`,
  `showcase-gameplay-proof.spec.ts`, `blockfall-rotation-feedback.spec.ts`,
  `blockfall-reactor-audio-fx.spec.ts`, `skyline-camera-readability.spec.ts`,
  `turbo-acceptance.spec.ts`, `showcase-game-thumbnails.spec.ts`) — migrate to
  the `?capture=scenario` + `__AURA3D_GAME_EVIDENCE__` surfaces.

## Verified

- `git am` on a fresh `origin/main` worktree applies all 6 patches cleanly;
  `esbuild` parses `main.ts`, `reactor-scene.ts`, `board-view.ts`,
  `scenario-drive.ts`, `evidence.ts`, `scenarios/*`.
- `game-capture-parity.mjs --fail-on-art` on the migrated tree: route drops
  out of the parity table entirely (0 ART / 0 FRAMING / 0 TRANSIENT / 0
  UNKNOWN).
- `rg -l rapier-physics-proof apps` on the migrated tree: only
  `showcase-turbo-drift-circuit` remains (wave-3 patch removes it).

## Ordering

- Compiles only after `qr/prd09-runtime-seam` (#139) merges — `createGame`,
  `createJuice`, `createFxParticlePass`, `createOverlayDriver`,
  `createRumbleDriver`, `createTweenEngine`, `blockfallGame.session` and the
  `scenarios:`/`evidence:` options are `@aura3d/game` exports; `@aura3d/game`
  dep was added in the 11-juice patch (hoist to 02 if lane-14 prefers).

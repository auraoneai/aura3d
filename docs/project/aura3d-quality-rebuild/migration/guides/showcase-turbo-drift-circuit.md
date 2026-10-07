# Migration guide — `showcase-turbo-drift-circuit` (PRD-09 wave 3)

Apply `../patches/showcase-turbo-drift-circuit/*.patch` in filename order on top
of `main`. Verified with `git am` on `main@5f5d6088`.

> **Compile note:** the patches reference `@aura3d/game` (`createGame`,
> `createJuice`, tween/fx/overlay/rumble drivers) and `@aura3d/audio`
> (`createGameSoundEngine`). Those exports land in the package PRs (#139/#158/
> #240/#270); the route compiles once they merge. The two added workspace deps
> (`@aura3d/game`, `@aura3d/audio`) are written into the app's `package.json` by
> patch 02-06.

## What the patches do

- **02-06**: mount via `createGame({id:"showcase-turbo-drift-circuit", target:"#app",
  qualityRebuild:{flags:["game"]}, evidence:{schema:1, sections, legacyGlobals},
  scenarios})`; delete `?capture=overview` (`visualCaptureCamera`, 74 sites),
  `?collisionReview=side` (`collisionReviewCamera`, 17 sites), `?venuePlate=1`
  (`reviewVenuePlate`), `VISUAL_CAPTURE_CAMERA`, `visualCaptureCameraDistance()`,
  `TURBO_REVIEW_GRADE`, supplemental venue consts, `turboJuiceTriggersAllowed`,
  review venue/festival nodes, and the `__AURA3D_COMPOSITION_PROBE__`. Remove
  the `rapier-physics-proof` import + `physicsProof` const + its
  `collisionWorld`/`physics` evidence keys (**last route importer** — the file
  can be deleted once every route patch lands). `panel.dataset.capture` is now
  always `"default"`. Evidence binds lazily via `bindTurboEvidence(() =>
  mountedEvidence)` in new `src/evidence.ts` (`sections.turbo`); the
  `__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__` global still receives the same
  object. New `src/scenario-drive.ts` + `src/scenarios/` expose `play`,
  `rival-pass` and `drift` staged scenarios riding the existing
  `advanceTurboAcceptanceTo`/`pumpTurboRealInput` test hooks. The static
  `playCue("engine")` loop becomes a real `sound.engine` loop in
  `turbo-audio.ts` (`createGameSoundEngine` over the `turboEngineSfx` asset,
  rpm 520–6400 mapped from `raceSnapshot.speed/gameplayMaxSpeed`, pitch
  0.85–1.5, `setLoad` from throttle); `turboAudio.engineLoop` is exposed on the
  controller interface and stopped on reset. `createJuice` fires on
  `go`/`checkpoint`/`finish`/`off-track`/`drift-scuff`/`vehicle-hit` (+ a
  `nitro` mapping kept for future nitro triggers), ticking through
  `turboTween.tick(dt)` in `onFrame`.
- **07**: rename leftover `reviewCaptureScenePose` → `acceptanceScenePose`
  (parity-scanner token hygiene; it feeds the acceptance venue pose, not the
  deleted review camera).

## Deliberately kept

`visualCaptureHeld`, `turboAcceptanceOwnsClock`,
`__AURA3D_TURBO_ACCEPTANCE_CAPTURE__`, `collisionReview{Contact,Reaction}Held`,
`mountedEvidence` live writes, `raceSession.paused` (route-owned session via
`togglePause`), `turboFeel`, `playerEvidenceDriver` (`?evidenceDriver=1` is a
separate diagnostic flag), `reviewSlipYaw` (folded to `0`), scripts/ builders
and `showcase-evidence-checklist.json` (route tooling; see `after.json` notes
on residual evidence share).

## Verification

`game-capture-parity.mjs` on the applied tree: **0 ART / 0 FRAMING / 0
TRANSIENT / 0 UNKNOWN** for this route (was 7/5/0/80 on `main`).
`route-composition.mjs` evidence share: see `migration/after.json`.

# Migration guide — showcase-bank-shot

Patch set: `migration/patches/showcase-bank-shot/` (steps 2–5, 8, 10 of §10,
plus step-4 scenario modules). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-bank-shot/*.patch
```

## Before numbers (main)

- capture branches: **13 ART / 2 FRAMING / 0 TRANSIENT / 5 UNKNOWN** (20 hits,
  `visualReviewCapture` decl + uses) — `showcase-bank-shot.parity.json`
- route-composition: 1,879 evidence / 1,591 presentation / 2,303 gameplay LOC
  (32.5% evidence) — `showcase-bank-shot.json`
- globals: `__BANK_SHOT_EVIDENCE__`, `__AURA3D_SHOWCASE_BANK_SHOT__`,
  `__BS_SCENARIO__`, `__BS_SHOT__`, `__BS_PUMP__`, `__AURA3D_COMPOSITION_PROBE__`

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game` | `createGameApp` → `createGame`; `pause` key dropped from `input.actions` (session lifecycle owns it); `@aura3d/game` dep | input map, loop `1/60`, physics seed + substeps, diagnostics-off |
| `03-delete-capture-branches` | deletes `main.ts:49` + all 20 ternaries | play arm of every branch: opacity 0.9, felt guides kept, play camera pose/fov 48, play lighting/effects intensities, aim-line widths 0.006/0.005 |
| `04-scenarios` | `__BS_SCENARIO__` → `src/scenarios/{pocket,foul,eight-finish,rack-fail}.ts` + `scenario-drive.ts` binding + `scenarios:` option | identical fixtures via `drive.resolve(...)` |
| `05-sound` | `billiards-audio.ts` → `src/sound.ts` cue map over `game-sfx-core` ids (`sports/table`, shared `ui`/`stinger`/`ambience`); deletes `scripts/build-sfx.mjs`, generated WAVs, `bankShot*Sfx` typed-asset entries + public copies, `build:sfx` script | same cue names + buses (canonical §6.8 ids), `unlock` on first gesture, `ambient-hall` loop |
| `08-session-pause` | `togglePause`, `let paused`, KeyP/Escape listeners → `game.session`; `#bs-pause-button` toggles session pause; `gameApp.onFrame` → `bankGame.app.onFrame`; `reducedMotion` read moves into `buildScene` | app.pause()/resume() still mirrors session state |
| `10-evidence-sections` | `publishEvidence` + `defineProperty(__AURA3D_SHOWCASE_BANK_SHOT__)` → `evidence.sections` loader (`src/evidence.ts`) + `legacyGlobals` for `__BANK_SHOT_EVIDENCE__`/`__AURA3D_SHOWCASE_BANK_SHOT__`; deletes `scripts/write-performance-report.ts` (use `aura3d perf-report`) | all evidence keys preserved, `mountedAtEpochMs` → `collectedAtEpochMs` |
| `11-juice` | `juice.define({pot, foul, cushion, combo})` over `createJuice` — pot fires `fx.burst("ring")` at `POCKET_CENTERS` + `hitStop(0.045)` on the real `bankGame.session`; foul → red overlay flash + shake; `cushion-touch` → small dust burst at the touching ball (`debugBallBody` position); combo → blue ring + camera punch at the cue ball; `bankTween.tick(dt)` in the frame loop | all cue names + `pushCue` calls kept inline, toasts unchanged, hit-stop is visual-only via session actors |

## Filed to PRD-14 (art/camera tasks, never kept behind a flag)

- **A-BS-1**: review-frame lighting was brighter (pendant 5.0/2.9/1.9 vs play
  4.85/3.6/3.6; ambient 0.1 vs 0.24; AO 0.74 vs 0.26; fog 0.0035/0.07 vs
  0.011/0.16). If the play frame underexposes on G-PANEL review, adjust play
  values — do not restore a capture arm.
- **A-BS-2**: review camera was tighter (`position [-0.34,2.18,2.18]`, `fov 39`
  vs play `[-0.067,2.514,2.641]`, `fov 48`). If review captures need the tighter
  frame, move the PLAY camera; the scenario registry is available for staged
  shots.
- **A-BS-3**: aim-line opacity 0.62→0.9 and widths 0.0035/0.003→0.006/0.005 keep
  play values; review-only line dimming is dropped.

## Verification (shadow migration, scratch tree only)

- `git am` applies all seven patches cleanly on `main@5f5d6088`.
- `game-capture-parity.mjs --root <scratch> --routes showcase-bank-shot
  --fail-on-any` → **0/0/0/0**.
- `src/scenarios/` files import only `@aura3d/game/capture`-adjacent APIs via
  `scenario-drive.ts` (no lights/material/effects — lint-clean).
- `tests/browser/game-shell/*` + default-URL capture run in
  `qr-prd09-routes.yml` when PRD-14 applies the set.

## Ordering dependency (steps 5, 11)

`src/sound.ts` points every asset at `/packs/game-sfx-core/<id>.{format}`.
The `{format}` placeholder resolves to the probed encoding through the
C-25 engine path (`GameSoundEngine` + `probeFormat`) — it requires the
PRD-09 sound slice (`qr/prd09-sound`: pack under `assets/packs/game-sfx-core`
+ `public/packs` serving symlink + probe files). Until that PR merges, apply
step 5 knowing fetches 404 on main's `createGameAudio` (visuals/scenarios are
unaffected).

Step 11 imports `createJuice` / `createFxParticlePass` /
`createOverlayDriver` / `createRumbleDriver` / `createTweenEngine` from
`@aura3d/game`; those exports land with the PRD-09 juice slice
(`qr/prd09-juice`). `app.effects`, `app.camera` and `bankGame.session` are
already real on `main`, so the pot hit-stop works end to end once the
package exports merge.


## Step 12 — HUD/touch (`12-hud-touch.patch`)

Deletes the `#hud`/`#panel` markup (stat grid, power meter, controls list,
evidence strip, brand blurb, action buttons) and mounts the shared kit:
`mountHud` on the `tabletop` theme (clock countdown, score, combo, objective,
prompt, strike meter) plus `mountTouchControls` on `aim-drag`. The touch sink
writes the same `manualHeld` key codes the keyboard path reads, so aim/spin/
charge share one path; `confirm`/`cancel` map to Space/KeyR. Rack clear/lost
uses `hud.banner` + `hud.toast` (the result card is gone; R still re-racks).

Ordering: imports `mountHud`/`mountTouchControls`/`HudDocument` from
`@aura3d/game` — exports land with `qr/prd09-hud`; compiles only after merge.

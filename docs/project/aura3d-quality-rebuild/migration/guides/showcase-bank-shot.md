# Migration guide — showcase-bank-shot

Patch set: `migration/patches/showcase-bank-shot/` (steps 1–3, 8, 10 of §10, plus
step-4 scenario modules). Generated against `main@5f5d6088`.

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
| `08-session-pause` | `togglePause`, `let paused`, KeyP/Escape listeners → `game.session`; `#bs-pause-button` toggles session pause; `gameApp.onFrame` → `bankGame.app.onFrame`; `reducedMotion` read moves into `buildScene` | app.pause()/resume() still mirrors session state |
| `10-evidence-sections` | `publishEvidence` + `defineProperty(__AURA3D_SHOWCASE_BANK_SHOT__)` → `evidence.sections` loader (`src/evidence.ts`) + `legacyGlobals` for `__BANK_SHOT_EVIDENCE__`/`__AURA3D_SHOWCASE_BANK_SHOT__`; deletes `scripts/write-performance-report.ts` (use `aura3d perf-report`) | all evidence keys preserved, `mountedAtEpochMs` → `collectedAtEpochMs` |

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

- `git am` applies all five patches cleanly on `main@5f5d6088`.
- `game-capture-parity.mjs --root <scratch> --routes showcase-bank-shot
  --fail-on-any` → **0/0/0/0**.
- `src/scenarios/` files import only `@aura3d/game/capture`-adjacent APIs via
  `scenario-drive.ts` (no lights/material/effects — lint-clean).
- `tests/browser/game-shell/*` + default-URL capture run in
  `qr-prd09-routes.yml` when PRD-14 applies the set.

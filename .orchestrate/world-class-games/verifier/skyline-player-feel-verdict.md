# Verifier artifact: skyline-player-feel

**Target:** `skyline-player-feel` on `orch/world-class-games/skyline-player-feel`  
**Commit:** `6e455fd6`  
**Verified at:** 2026-08-17T10:10Z

## Commands run

### Vitest (scoped suite)
```
pnpm exec vitest run tests/unit/apps/skyline-sixty-second-level.test.ts \
  tests/unit/apps/skyline-platformer-loop.test.ts \
  tests/unit/apps/skyline-challenge-feedback.test.ts \
  tests/unit/apps/skyline-subject-pose-determinism.test.ts \
  tests/unit/apps/skyline-player-feel.test.ts
```
Result: **5 files | 23 passed | 3 failed (26 total)**

Failures (environment, not task regression):
- `skyline-subject-pose-determinism.test.ts` ×3 — `ENOENT tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json`

Passing files:
- `skyline-sixty-second-level.test.ts` — 7/7 (70–115s window, `provesMountedKitPlayback: false`)
- `skyline-platformer-loop.test.ts` — 5/5
- `skyline-challenge-feedback.test.ts` — 5/5
- `skyline-player-feel.test.ts` — 5/5

### Typecheck
```
cd apps/showcase-skyline-runner && pnpm typecheck
```
Result: **pass** (`tsc -p tsconfig.json --noEmit`)

Note: `pnpm --filter @aura3d/showcase-skyline-runner typecheck` from repo root returns "No projects matched" because `apps/*` is not in `pnpm-workspace.yaml`.

### Live UI (Playwright headless, after `pnpm build --filter @aura3d/engine`)
Dev server: `http://127.0.0.1:5174/`

Public layout (`/`):
- `#x-value` absent
- score/coins/ember/lives/act/pips present
- panel aria-label: "Skyline Runner game HUD"
- `window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__` present
- `window.__AURA3D_COMPOSITION_PROBE__.settleSubjectPose` function present

Debug layout (`/?debug=1`):
- `#x-value` present

Live keyboard pause/reset via Playwright `KeyP`/`KeyR` did not toggle evidence flags (frame-timing/input focus); covered by unit tests on `createSkylineFeel` and source wiring in `main.ts`.

## Source checks

- `src/generated/game-geometry.ts` — not in branch diff vs main
- No `import from 'three'` or `@aura3d/engine/production-runtime` in `apps/showcase-skyline-runner/src/`
- Classification remains `prototype-blocked` in route-health / evidence JSON
- No `world-class` / `flagship` wording in app copy
- Act palettes use `planSkyBackdrop` / `blendSkyBandColor` in `act-palette.ts`; visibility toggled in-scene via `applySkylineActPaletteVisibility`

## Audio cue wishlist (for planner)

From `apps/showcase-skyline-runner/src/audio-cues.ts` — 16 entries: jump, land, dash, coin, ember-pickup, ember-fire, ember-deny, ember-impact, sentry-telegraph, sentry-defeat, stomp, checkpoint, death, finish, pause, reset

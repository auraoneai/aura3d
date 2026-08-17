<!-- orchestrate handoff
task: turbo-player-feel
branch: orch/world-class-games/turbo-player-feel
agentId: bc-62ab10ab-4ed7-480a-9715-b09bb73eea36
runId: run-3ec0292a-d0ae-46a9-b198-4692c6c50829
resultStatus: finished
finishedAt: 2026-08-17T10:05:56.094Z
-->

## Status
success

## Branch
`orch/world-class-games/turbo-player-feel`

## What I did
- Added `src/feel.ts` — start lights (3-2-1-GO + jump penalty), pause/reset session state, finish camera blend, hairpin nitro, gap/position helpers
- Added `src/hud.ts` — game HUD panel (speed, lap/gate, gap, P1/P2, last/best, Lights/Racing/Finished/Paused), start-light DOM, result card; debug telemetry behind `?debug=1`
- Added `src/audio-cues.ts` — audio cue wishlist only (no playback)
- Updated `src/main.ts` — wired countdown-before-motion, P/Esc pause, R reset, `game.effects` ground-dust + smoke primitives, late-afternoon lighting, finish hero camera, evidence flags
- Updated `src/opponent-ai.ts` — late-race defend-inside, yield preserved, seeded apex speed error
- Updated `index.html`, `src/styles.css`, `README.md` — HUD layout, start lights, result card, pause control copy; aria-label no longer says "evidence"
- Added `tests/unit/apps/turbo-player-feel.test.ts`; updated `turbo-telemetry-coherence.test.ts` (Ready → Lights); removed flaky `/var/folders` artifact write from `turbo-passing-lane.test.ts`
- Opened draft PR #13 against `main`

## Measurements
- turbo unit tests (telemetry + sixty-second + passing-lane + player-feel): 17 passing → 20 passing
- turbo showcase typecheck: pass → pass
- HUD status vocabulary: Ready → Lights
- public debug chrome default visibility: Road locked / Edge assist visible → hidden unless `?debug=1`

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- `race-proof.ts`, `generated/game-geometry.ts`, and evidence globals (`__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__`, `provesMountedKitPlayback: false`) left intact; no classification or world-class copy added
- Chase camera runtime tuning uses `Object.assign` on the presentation spec because TS types are readonly; matches prior reset behavior
- Opponent apex drama reads `upcomingCurvature` from driver telemetry; late-race defend triggers on lap ≥ 3 or progress > 0.55
- `game.effects` spawns ground-dust; visible smoke also uses scaled sphere primitives (hidden when `reducedMotion`)
- No live browser session run in this environment; behavioral coverage is unit-test + typecheck only
- Draft PR: https://github.com/auraoneai/aura3d/pull/13

## Suggested follow-ups
- Audio CLI wave: register cues from `TURBO_AUDIO_CUE_WISHLIST` (start-light-red-tick, engine-rev-loop, tyre-scrub-loop, nitro-whoosh, finish-fanfare, etc.)
- Manual screenshot review of finish result card + 3/4 hero camera for human classification gate
- Skyline Runner and Aura Clash Arena player-feel passes per orchestrator plan
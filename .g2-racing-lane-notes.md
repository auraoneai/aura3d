# G2-RACING lane — audit + baseline (2026-09-22)

Routes: Skyline Runner, Turbo Drift Circuit, Courier Rush, Patrol Wing.
Branch: aura3d-game-upgrade/g2-racing.

## Baseline verification (this lane, run on this worktree)

| Check | Result |
|---|---|
| per-app typecheck skyline-runner | PASS (exit 0) |
| per-app typecheck turbo-drift-circuit | PASS (exit 0) |
| per-app typecheck courier-rush | PASS (exit 0) |
| per-app typecheck patrol-wing | PASS (exit 0) |
| root `pnpm typecheck:raw` | NOT RUN — OOM-killed (exit 137) in this VM; per-app checks used instead |
| unit tests (7 files, skyline+turbo physics/apps) | PASS — 53/53 |
| browser specs | NOT RUN — pixel/screenshot assertions are environment-blocked (SwiftShader black canvas); specs write pixel artifacts I will not regenerate |
| route-health regeneration | BLOCKED — write:route-health scripts validate browser evidence JSONs that do not exist in this worktree (tests/reports/showcase-* absent); regenerating without honest pixel evidence would fabricate it |

## Route audit findings (from source inspection)

### Skyline Runner
- Deep existing implementation (~11.7k lines): Rapier kinematic character
  controller owns runner transform; `game.platformer` authors intent (drive,
  gravity-integrated vertical velocity, coyote time, jump buffering, dash).
  Honest hybrid classification recorded in route evidence.
- Five-act level, relays, sky-shards, ember volleys vs sentries, summit-beacon
  finish, ghost replay, act palettes, camera-readability evidence.
- No TODO/FIXME/HACK markers anywhere in src.
- G2 priorities to implement next: verify jump-arc tuning vs spec feel
  (solvedMotion constants), hazard telegraphing consistency, high-risk shard
  reachability proof, finish-section pacing (95s target window 70–115s —
  already unit-proven in skyline-sixty-second-level.test.ts).

### Turbo Drift Circuit
- ~14k lines: `game.racing` owns arcade steering/lap state; Rapier owns solid
  vehicle contact; circuit-derived per-wheel contact sampling; opponent AI
  (opponent-ai.ts), ghost replay (G key), boost rings, drift smoke/ribbons.
- Claim boundary honest: no physical tyre/suspension/drivetrain claim.
- G2 priorities next: speed-sensation feedback curve, opponent distinction
  (already typed distinct assets), drift-feedback coherence, road-surface
  readability, chase-camera polish.

### Courier Rush
- ~5k lines: arcade kinematic van, deterministic dispatch (5 deliveries,
  timers 60/50/45/40/40s, early-drop combo, 3 strikes, timer fail),
  lane-locked traffic AI with courtesy stops, typed van/parcel/traffic GLBs,
  chase camera with drop look-back, HUD, audio.
- G2 priorities next: mission-urgency telegraphing (HUD timer pressure),
  fail/recovery loop review (strike cooldown exists; recovery = R reset).

### Patrol Wing
- ~5.5k lines: authored deterministic flight model (fixed-step, quaternion),
  Rapier sensor proxies for rings/pad/return-fire only, ordered ring course,
  drone waves, cannon with cooldown/accuracy, landing classification, patrol
  grading, ghost replay.
- G2 priorities next: aircraft response curves, speed sensation, horizon/
  terrain depth, flight-camera polish, damage feedback.

## Working agreements
- `.g2-state/` left uncommitted and preserved per lane instructions.
- No branches switched, nothing merged to main, no other lanes' apps touched.
- Claim boundaries kept honest; visual QA items stay NOT RUN (env-blocked).

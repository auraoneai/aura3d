# Turbo Drift Circuit — G2 verification (2026-09-22, lane g2-racing)

## Machine verification (this worktree, branch aura3d-game-upgrade/g2-racing)
- Typecheck (`pnpm --filter showcase-turbo-drift-circuit typecheck`): **PASS** (exit 0)
- Unit tests: **PASS** — turbo-drift-real-circuit-contact,
  turbo-telemetry-coherence, turbo-acceptance-driver, turbo-ghost-replay,
  turbo-hero-admission, turbo-passing-lane, turbo-player-feel, turbo-rival-drama,
  turbo-route-drivability, turbo-sixty-second-race, turbo-track-props
- Root `pnpm typecheck:raw`: NOT RUN (OOM-killed, exit 137 in this VM)
- Browser specs (turbo-opponent-distinction and friends): NOT RUN — pixel-dependent

## Physics / claim boundary (from source audit)
- `game.racing` owns arcade steering/lap/gate logic; Rapier owns selected solid
  vehicle contact; per-wheel contact sampling from circuit geometry; authored
  throttle/brake/steer/drift, typed hero + visually distinct opponent, ghost,
  boost rings, drift smoke/ribbons, off-track recovery, 4 laps / 6 gates.
- Claimed explicitly as NOT a physical tyre/suspension/drivetrain simulation —
  honest. No physical-vehicle-controller migration attempted (no such route
  surface exists that would preserve the arcade claim boundary).

## Visual QA: NOT RUN (environment-blocked)
- SwiftShader black-canvas issue; §40 visual checks, §41/42 visuals NOT RUN.

## Known open items (carried from prior before-probe)
- HUD pill truncation: preventive fix already in source
  (`.metrics-row` grid 104px + 5×80px; `.lap-times` 3×92px). Visual confirmation pending — NOT RUN here.
- TRACK pill vs `renderedFeedback.offTrack` use different definitions
  (road-alignment HUD vs recovery-cue visibility) — coherent, documented, not a bug.

## Changes in this lane
- None to gameplay code. Verification evidence recorded here.

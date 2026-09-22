# Skyline Runner — G2 verification (2026-09-22, lane g2-racing)

## Machine verification (this worktree, branch aura3d-game-upgrade/g2-racing)
- Typecheck (`pnpm --filter showcase-skyline-runner typecheck`): **PASS** (exit 0)
- Unit tests: **PASS** — skyline-platformer-loop, skyline-player-feel,
  skyline-relay-sensors, skyline-sixty-second-level, skyline-real-level-motion,
  skyline-challenge-feedback, skyline-ghost (53/53 in the G2 focus run; full
  route set also passes in the extended run — see courier/patrol/skyline-turbo run: 48/48)
- Root `pnpm typecheck:raw`: NOT RUN (OOM-killed, exit 137 in this VM)

## Physics / claim boundary (from source audit)
- Rapier kinematic character controller owns the runner transform; authored
  `game.platformer` owns intent (drive, gravity-integrated vertical velocity,
  jump buffering, coyote time, stepping/slopes/snap). Claimed as hybrid —
  honest, no rigid-body-character claim.
- Jump tuning: intent-led (`feel: "snappy"`, apex = 2.3× character height),
  solver validates against level geometry; 70–115s completion window unit-proven.

## Visual QA: NOT RUN (environment-blocked)
- SwiftShader in this VM produces a black canvas from an rgba16f framebuffer
  issue; all screenshots, rendered-pixel checks, §40 visual checks and §41/42
  cross-game visuals for this route are NOT RUN. Nothing fabricated.

## Known open items (carried from prior before-probe)
- Horizontal speed flagged "+0.58 units in 15 frames" — design-reviewed as
  intentional precision-platformer pacing; completion window unchanged.
- Route gate: `prototype-blocked`, published, publicTemplateReady=false — preserved.

## Changes in this lane
- None to gameplay code. Verification evidence recorded here.

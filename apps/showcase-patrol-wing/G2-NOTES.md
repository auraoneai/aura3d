# Patrol Wing — G2 verification (2026-09-22, lane g2-racing)

## Machine verification (this worktree, branch aura3d-game-upgrade/g2-racing)
- Typecheck (`pnpm --filter showcase-patrol-wing typecheck`): **PASS** (exit 0)
- Unit tests: **PASS** — patrol-wing-flight (17), patrol-wing-combat (6)
  (48/48 in the combined G2 unit run with courier/skyline-turbo files)
- Root `pnpm typecheck:raw`: NOT RUN (OOM-killed, exit 137 in this VM)

## Physics / claim boundary (from source audit)
- Deterministic authored six-axis arcade flight (fixed-step quaternion model in
  flight.ts); Rapier owns only ring/pad/player/orb sensor proxies
  (ring sensors fire exactly once per entry, re-arm after exit — unit-proven).
  Cannon with cooldown/accuracy, drone return-fire orbs with travel/hit,
  patrol completion grading, landing classification, chase/cockpit camera,
  touch controls, pause/reset, ghost replay. Claimed explicitly as authored
  arcade flight — no aerodynamics, no rigid-body flight, not a reusable
  flight kit. Honest; no physical-aircraft-controller migration applied.

## Visual QA: NOT RUN (environment-blocked)
- SwiftShader black-canvas issue (prior lane's probe also saw a black viewport
  for patrol in software GL); screenshots, pixel checks, §40–42 visuals NOT RUN.

## route-health.json: STALE (cannot honestly regenerate here)
- Stored route-health generated 2026-09-02T08:57:19.071Z with source hash
  fe2839eb…; current source hashes to d7d67caf… (drift from prior lanes'
  committed work). `write:route-health` requires pixel-capable browser
  evidence — NOT regenerated here rather than fabricated. Classification
  `prototype-blocked`, publicShowcase=false preserved.

## Changes in this lane
- None to gameplay code. Verification evidence recorded here.

# Courier Rush — G2 verification (2026-09-22, lane g2-racing)

## Machine verification (this worktree, branch aura3d-game-upgrade/g2-racing)
- Typecheck (`pnpm --filter showcase-courier-rush typecheck`): **PASS** (exit 0)
- Unit tests: **PASS** — courier-rush-dispatch (7), courier-rush-traffic (6)
  (48/48 in the combined G2 unit run with patrol/skyline-turbo files)
- Runtime probe (prior lane's `.g2-probe/verify-courier.mjs`, Vite + Playwright
  + real CDP keyboard): mount-ready PASS (status=ready, mounted=true), zero
  console errors recorded; initial state sane
  (state=awaitingPickup, score=0, timerMs=59983). A fresh re-run in this session
  reproduced the same initial state before the SwiftShader `present()` timeout
  and a pump/frame-submission harness limitation stopped it.
- Root `pnpm typecheck:raw`: NOT RUN (OOM-killed, exit 137 in this VM)

## Physics / claim boundary (from source audit)
- Route-local `createGameArcadeVehicle` kinematic van; authored steering/grip;
  lane-locked traffic AI with courtesy-stop windows; deterministic dispatch
  (5 deliveries, timers 60/50/45/40/40s, early-drop combo, 3 strikes, timer and
  strike failures, pause/reset). Claimed explicitly as arcade, no physical
  tyre/suspension/mass/damage claim — honest; no Rapier vehicle surface exists
  that fits the authored kinematic contract.

## Visual QA: NOT RUN (environment-blocked)
- SwiftShader black-canvas issue; screenshots, pixel checks, §40–42 visuals NOT RUN.

## route-health.json: STALE (cannot honestly regenerate here)
- Stored route-health generated 2026-09-03T10:00:40.034Z; lacks routeSourceSha256;
  expected browser evidence dir `tests/reports/showcase-courier-rush/` is absent
  in this checkout. `write:route-health` validates browser evidence JSONs
  (full-shift/failure/mobile/reduced-motion) with artifact sha256s — these
  require pixel-capable browser runs and are NOT regenerated here rather than
  fabricated. Classification `prototype-blocked`, publicShowcase=false preserved.

## Known open items (carried from prior before-probe)
- Van slightly overexposed under bloom (visual tuning, pending human review).

## Changes in this lane
- None to gameplay code. Verification evidence recorded here.

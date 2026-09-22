# Aura3D Game Upgrade — Completion Report (§43)

**Date:** 2026-09-22 (PDT)
**Branch:** `aura3d-game-upgrade/integration` → merged to `main` as `b00bf339`
(PR #19, MERGED 2026-09-22T23:24Z). Two deploy-fix follow-ups on `main`:
`4fdecbdd` (pnpmfile), `cfca16ed` (Textures mirror).
**Production:** https://aura3d.auraone.ai (Vercel `aura3d-ckcjp6bxn` superseded by
texture-fix redeploy; alias `aura3d.auraone.ai` live and validated).

## Games audited / upgraded

All 17 routes across 5 lanes (lane commits in PR #19):

- **G3 precision** — Rooftop Buckets (549951de), Bank Shot (95183e3c), Siege Golf
  (187a4811): Rapier hoop/billiards/golf sims, aiming + CCD, honest typed
  `AuraDiagnostics` evidence (replacing untyped casts that read `"unknown"`).
- **G4 arcade** — Neon Swarm, Blockfall Reactor, Vault Breakers, Pulse Tunnel
  (8d20b2d0, 3fc2d7a3): rotation-denied feedback, typed diagnostics; routes were
  already complete, no code changes needed beyond evidence honesty.
- **G5 atmospheric** — Aurora Lander, Gravity Post, Gallery Shift, Deep Recovery
  (e51e6d55, c7e99b2e): GLB materialization + honest-evidence refactoring.
- **G1 combat** — Aura Clash (afb3169d, 329a9170), Mech Hangar (a801e092):
  pointer-orbit wiring fix (binding defined but never attached — drag did nothing),
  bout-reset state fixes, orbit angles in evidence.
- **G2 racing** — Skyline, Turbo, Courier, Patrol (8bcfdbd6, ab39dbd7, 98ee82f5,
  5f03b03c, 6173fa23, 363d77f3): driving/runner/flight feel, tracks, cameras,
  per-route G2-NOTES.md.

## Verification results

- **Visual QA 17/17 PASS** (Mac GPU, system Chrome/WebGL2, per-app vite dev):
  canvas renders non-blank, 0 page errors everywhere, evidence populated,
  gameplay inputs change state, hero + mobile screenshots (`/tmp/qa-g*/`, local
  artifacts, not committed). Method correction recorded: early black screenshots
  were a timing artifact (shot before `drawCalls>0`); re-ran gated on readiness.
- **Regression:** `typecheck:raw` PASS; `tests/unit/apps` 664/664 (covers the 348
  lane tests); `tests/unit/physics` + `game-runtime` 273/273; lane browser specs
  5/5 (mech-hangar 3/3, bank-shot + blockfall 2/2); production `vite build`
  17/17. Full 5,014-test suite: prior comparison stands — zero regressions vs
  pristine main (all 146 failures pre-existing; HEAD delta docs-only, verified).
- **CI on PR:** Build/Type/Lint/Unit/Package all green. The 4
  Browser-Matrix jobs fail identically on the pre-QA push — pre-existing
  SwiftShader pixel-assertion failures, unrelated to this change (docs-only delta).
- **Deploy validation:** `check:deployment` 4/4 PASS. Live: 17/17 routes HTTP 200
  with canvas; 17/17 zero console/page errors after the texture fix below.

## Deploy evidence + fixes found live

1. **Vercel remote build was broken two ways; repo convention is prebuilt.**
   Sep-12 success used `vercel build` locally + `--prebuilt`. Fixed:
   (a) no-op `.pnpmfile.cjs` checksum tripped Vercel's newer pnpm
   (`4fdecbdd` — removed, lockfile regenerated, frozen install verified);
   (b) root `vite.config.ts` imports `tests/browser/installed-package-resolve`,
   excluded from upload by `.vercelignore` — avoided entirely by prebuilt flow.
2. **Gallery Shift live 404** (`/aura-assets/Textures/texture-e.png`, URI baked
   inside `showcaseRunnerGirl` GLB, invisible to the `assets.*` collector).
   Fixed in `marketing/scripts/build-showcase-routes.mjs` (`cfca16ed` — mirror
   `Textures/`); re-verified live: 0 bad responses.

## NOT RUN (honest)

- `verify:public-demo-deployment`: NOT RUN — env-gated static-export verifier
  (`A3D_PUBLIC_DEMO_URL` unset; targets a different artifact than this deploy).
- Full 5,014-test suite re-run: NOT RUN this pass — prior same-day comparison
  (zero regressions) still covers the code; only docs changed since.
- Route-health screenshot-hash regeneration: STALE (pre-existing; pixel-hash
  workflow unchanged by this work).
- VM SwiftShader pixel assertions: NOT RUN anywhere — superseded by Mac GPU QA.

## Quality-floor flags (no silent bar-lowering; fixes NOT attempted this pass)

- Turbo Drift Circuit framing washed-out/low camera — weakest frame of the set.
- Courier Rush van overexposed (bloom blowout) at spawn.
- Aurora Lander opening frame mostly empty sky.
- Blockfall Reactor + Turbo Drift Circuit expose no `window.__*_EVIDENCE__`
  (convention gap; QA used DOM/HUD fallback). Courier/Patrol evidence lacks
  `drawCalls`. Follow-up candidates, none blocking.

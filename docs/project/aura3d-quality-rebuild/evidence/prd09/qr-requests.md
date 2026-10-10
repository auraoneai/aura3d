# PRD-09 outbound qr-request ledger (P-64)

Each row: issue, target lane, request, status. Numbers written back as filed.

| Issue | To | Request | Status |
|---|---|---|---|
| #588 | prd12 | C-33: beacon readiness (`__AURA3D_GAME__.state === 'playing'`) in `capture-games.mjs` — co-PR'd in the T0-30 branch, needs lane-12 acceptance in the PR thread | open |
| #596 | prd15 | Red-flag revert: `capture-divergence.spec.ts` vacuous skip → guard test (co-PR'd in the red-flag-revert branch, needs lane-15 acceptance) | open |
| #603 | prd15 | 09-CI: retarget stale source gates to post-migration layout + restore dropped `game-runtime:*:raw` scripts (co-PR'd in the CI-unit branch) | open |
| #606 | prd15 | 09-CI browser: lane playwright config `playwright.prd09.config.ts` (co-PR'd in the CI-browser branch) | open |
| #729 | to:prd15 | 09-OWN/P-61: owner acceptance of #350 lane-15 hunks (root package.json, tools/finalize-dist); lane-13 already accepted on #351 | open |
| #729 | to:prd15 | 2026-10-09 | 09-OWN/P-61: owner acceptance of #350 lane-15 hunks (root package.json, tools/finalize-dist); lane-13 already accepted on #351 |
| #824 | to:prd12 | 2026-10-10 | §20/16.1-5: audio-webm step plugin + 3 pilot timeline steps (C-33 hunk, PR qr/prd09-audio-webm; supersedes #817) |

- #721 (to:prd15, filed 2026-10-09): browser-matrix `pnpm typecheck` step red on clean main — 477 errors in `tools/*` (mostly `tools/_quarantine/*`). Blocks every lane's ubuntu CI heads; needs tools/CI owner.
- #727 (to:prd15, filed 2026-10-09): tests/unit/contracts/harness.ts conformance() passes slot.provided (boolean) as the 'real' impl — ContractSlot.provided is a marker, not the impl; lane-09 workaround resolves via slot.get(flagsOn) in PR #726.
- #619 | to:prd15 | nodes/types.ts + compiler/diagnosticOnly.prd09.ts — camera up/roll fields + diag rows (#228) — co-PR

- **#609** (to:prd15): `tests/browser/layout.spec.ts` + `hud-layout-harness.ts` hud-cap restore — 0.15 desktop / 0.22 mobile caps, added 1920x1080 + 390x844 viewports, `canvasCoverage` + `domText` report fields for the coverage/banned-token/test-hook assertions. Co-PR in the lane-09 layout branch.
- **#609** (to:prd15): `tests/browser/layout.spec.ts` + `hud-layout-harness.ts` hud-cap restore — 0.15 desktop / 0.22 mobile caps, added 1920x1080 + 390x844 viewports, `canvasCoverage` + `domText` report fields for the coverage/banned-token/test-hook assertions. Co-PR in the lane-09 layout branch.
- **#613** (to:prd15): `tests/browser/game-shell/**` (nine §15 specs + harnesses + support) and the `example-dev-server.ts` esbuild `import.meta.env.MODE="test"` define. Co-PR in the lane-09 specs branch.

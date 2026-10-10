- #721 (to:prd15, filed 2026-10-09): browser-matrix `pnpm typecheck` step red on clean main — 477 errors in `tools/*` (mostly `tools/_quarantine/*`). Blocks every lane's ubuntu CI heads; needs tools/CI owner.
- #727 (to:prd15, filed 2026-10-09): tests/unit/contracts/harness.ts conformance() passes slot.provided (boolean) as the 'real' impl — ContractSlot.provided is a marker, not the impl; lane-09 workaround resolves via slot.get(flagsOn) in PR #726.

| #729 | to:prd15 | 2026-10-09 | 09-OWN/P-61: owner acceptance of #350 lane-15 hunks (root package.json, tools/finalize-dist); lane-13 already accepted on #351 |
||||||| parent of b34478fa6 (feat(game): T0-30 beacon playing only after presented draw (#54))
# PRD-09 outbound qr-request ledger (P-64)

Each row: issue, target lane, request, status. Numbers written back as filed.

| Issue | To | Request | Status |
|---|---|---|---|
| #588 | prd12 | C-33: beacon readiness (`__AURA3D_GAME__.state === 'playing'`) in `capture-games.mjs` — co-PR'd in the T0-30 branch, needs lane-12 acceptance in the PR thread | open |
||||||| parent of 0010a869c (test(qr-09): retarget stale source gates to post-migration layout)
||||||| parent of 54b43ae98 (test(qr-09): retarget stale source gates to post-migration layout)


| #603 | prd15 | 09-CI: retarget stale source gates to post-migration layout + restore dropped `game-runtime:*:raw` scripts (co-PR'd in the CI-unit branch) | open |

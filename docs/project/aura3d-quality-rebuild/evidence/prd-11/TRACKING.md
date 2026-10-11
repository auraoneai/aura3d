# Lane 11 tracking: PRD-16 §4.11 ids and PRD-11 checklist ticks

Checked 2026-10-11 against main@322d78b1. A row is `done` only when it cites a merged PR and a
`qr-prd11-perf.yml` (or GitLab) run on a main commit that concluded `success`. Otherwise it cites
the dated blocker. The ledger of outbound and inbound requests is in [`qr-requests.md`](qr-requests.md).

## Main runs of `qr-prd11-perf.yml`

| Main commit | Source | Run | Conclusion |
|---|---|---|---|
| 6b425c4a | PR #909 (batch 1: CI-0, T0-35, T0-13 adapters, #271) | 38102809394 (push) | queued, not started at 2026-10-11T05:30Z |
| 322d78b1 | PR #949 (batch 3: #262, #67) | 38114828200 (push) | queued |
| 00c56b1b … ee375527 | other main pushes | 18 push runs, 38104078426 … 38114391296 | all queued |
| afb475c2 / f74c24c0 / eb71b6aa | nightly schedule | 38028552344, 37890270042, 37734120918, 37578024718 | failure (pre-CI-0 probe step) |

No `qr-prd11-perf.yml` run on main has concluded `success`. The macos-14 push runs are queued
behind runner capacity.

## PRD-11 §14 checklist (P-55)

0 of 82 items ticked, and that is correct. The tick rule requires a `run:<id>` that concluded
`success` on main, and none exists yet (table above). Re-review when 38102809394 or a later
main run completes. Tick only the rows whose test executed green in that run.
`tools/qr-checklist-lint` decides which rows qualify.

## §4.11 ids

| Id | Done when (PRD-16 §4.11) | Status 2026-10-11 | Evidence / blocker |
|---|---|---|---|
| 11-CODE | CLI `aura3d perf gate`, `prd11-batch-optout` codemod, `scripts/migrations/prd11-*`, Patrol Wing Phase-0 profile; WgslAssembler only if G-WGPU is a go | not landed | Wave D CLI/codemod/Batcher owned by agent 11b, no PR yet. `packages/aura3d-cli/src/commands/prd11/index.ts` is still `export {}`. Patrol Wing profile is Wave C (primary). WgslAssembler is blocked on #198 and on the G-WGPU decision at IC-4 (2026-11-05). |
| 11-ISSUES | #53, #67, #194, #214, #215, #233, #260, #262, #271 closed with PR + run, or deferral comment; #261 closed | in progress | #261 closed 2026-10-11. #271 landed in PR #909 and #262/#67 in PR #949 (issues still open: their main runs 38102809394 / 38114828200 are queued). #215 is in open PR #923. #194: redundancy reasoning posted 2026-10-11, G3 to confirm close. #53 waits on the 11-S8 fixture. #214/#233/#260 need "deferred to G-WGPU (IC-4)" comments (primary). |
| 11-BLOCKED | #90, #94, #113, #179, #180, #181 (01); #91 (03); #92, #97, #98 (12); #100, #129, #198 (15); #103 (14); #111 (09); #115 (02) each landed | blocked | Only #111 closed (2026-10-10). The other 16 are open on 2026-10-11. Owners and states are in `qr-requests.md`. #156 (lane 12) blocks every lane's standalone acceptance. |
| 11-PROMO | §12.3 requests filed; `A3D_QR_TIERS`/`_WEBGPU` standalone-accepted; G-WGPU decision gates Phases 7-8 | not met | All 43 §12.3/CCR ids are filed (#89-#131). Sub-flag state request is #1050 (filed 2026-10-11). `flags.state.ts:21-22` is `dev`, unchanged and correct. Promotion waits on the Track 0 exit and two green nightlies. G-WGPU is undecided (IC-4). The request/CCR status table for the IC-1 report is `qr-requests.md`. |

## Other lane-11 rows tracked by agent 11c

| Row | Status 2026-10-11 | Evidence / blocker |
|---|---|---|
| P-23 lane-11 hunk (#542) | draft PR #1034 | Caps restored to 190,000 / 250,000 / 400,000 / 480,000, so all four rows read fail. Draft until G5 confirms timing on #542. No main workflow runs `tools/bundle-size/index.ts`. |
| Red flag 7 (#162 CONTRACTS.md +1 line) | waiting on G5 | Acceptance asked on PR #162 on 2026-10-11. If G5 says revert, lane 11 files a qr-request to:prd15. |
| Flag-state request | filed #1050 | Asks for explicit entries (preferred) or parent-implies via `DEFAULT_ON_SUB_FLAGS`. |
| P-22 review (#405) | waiting on #915 | #915 is open and does not convert `webgpu-hardware-matrix.spec.ts:7` or `webgpu-visual-parity.spec.ts:8`. Review comment posted 2026-10-11. |

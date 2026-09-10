# 3.0.1 Finish Plan

Status date: 2026-09-10. Branch `codex/muse301-release`, head `fb33f0da`.
Supersedes the "Remaining work" section of `muse3jsparity-3.0.1-CLOSEOUT-PLAN.md`.
That document's execution log stays as the historical record; this document is the
only place that says what is left and how it closes.

## Why the previous approach kept not finishing

The work is not large. The method was quadratic. Three measured facts explain the
whole delay, and all three are fixable in the tooling rather than in the product.

**1. Gate-by-gate execution re-runs the same specs 7 times over.** The ledger has
757 requirements grouped into **85 proof gates**, and those gates name only
**145 distinct test files** (63 Playwright specs, 82 Node suites). But running the
producer once per gate executes **465 browser spec invocations** for those 63
distinct specs. With `playwright.config.ts` pinned to `workers: 1`, that is roughly
a 7.4x multiplier on the single most expensive resource in the repo.

**2. Every source commit invalidates every receipt earned so far.**
`validateReceipt` enforces `sameSource`, which compares `commit`, `tree`,
`lockfileSha256` and a content fingerprint. The 50 receipts currently on disk are
spread across **five different source commits** (`0112c28d`, `e3e1bc41`,
`a4dd8cc9`, `fb33f0da`, and one older). Only receipts minted on the final frozen
commit can be reduced together, so any fix committed mid-collection discards the
batch. This happened repeatedly.

**3. Three gates additionally carry a 30-minute freshness ceiling.**
`MAX_COMPARISON_AGE_MS` is 30 minutes and applies to `k1`, `v01`, `v02` at mint
time, plus `superiority` and `root-path-integrity` gates at aggregate time. If
those are minted at the start of a long collection they are stale before the
aggregate reads them, regardless of correctness.

Combined, these three turned a bounded job into a treadmill: collect for hours,
commit one fix, lose the batch, repeat.

## Current measured state

| Fact | Value | Source |
| --- | --- | --- |
| Requirements in the ledger | 757 | `loadMuse301ExecutionRequirements` |
| Proof gates | 85 | same |
| Gates with a valid receipt | **42** | `wo/*/validation.json` `valid: true` |
| Gates with a failed receipt | 2 — `l7`, `p01` | `validation.json` `valid: false` |
| Gates partially run, no receipt | 6 — `a3`, `d2`, `f2`, `j1`, `n1`, `r1` | run dirs without `*.receipt.json` |
| Gates never run | 35 | no run dir |
| Distinct test files across all gates | 145 (63 browser, 82 node) | ledger |
| Browser spec invocations if run gate-by-gate | **465** | ledger |
| Missing test files | 0 | filesystem check |
| Requirements provable by named tests | 664 | ledger |
| Requirements needing a typed acceptance contract | 75 | ledger |
| Requirements with neither (gate `archive` only) | 18 | ledger |
| Aggregate infrastructure gates | 33 pass, 0 non-pass | `readiness.json` |
| PRD checkboxes | 89 checked, 27 open | `muse3jsparity-3.0.1-PRD.md` |

The 33 infrastructure gates already pass. The blocker is purely receipt coverage
for the 85 work-order gates.

## The fix: one frozen collection, shared evidence pool

Instead of 85 sequential producer runs, run each distinct test file **once** on a
frozen commit, retain the hashed reports in a shared pool, then mint all 85
receipts from that pool.

This is legitimate under the existing validator, and that is the point rather than
an assumption: `validateReceipt` requires each proof to name a report that is in
`receipt.artifacts` with a matching SHA-256, and to bind to a uniquely-passing
assertion inside it. It does **not** require the report to be exclusive to one
gate. Nothing is weakened; the same assertions prove the same obligations, and
each receipt still hashes the exact bytes it relies on.

Expected effect on the browser lane: **465 invocations to 63**.

### Ordering, which is forced by the validator and not by preference

1. Land every source fix. Freeze the tree. No commits after this point until the
   aggregate completes.
2. Run the 82 Node suites once; retain one hashed report.
3. Run the 63 browser specs once; retain per-spec hashed reports.
4. Mint the 82 gates provable from that pool.
5. Mint `l01` and `q02` from their dedicated acceptance producers.
6. Re-earn the K1 dependency producers, then mint `k1`, `v01`, `v02` — these
   carry the 30-minute ceiling, so they go last.
7. Re-earn the head-to-head receipt, which binds `HEAD` and is invalidated by any
   later commit.
8. Run the aggregate with `--evidence-manifest` over all 85 receipts.
9. `l02` last: it requires the human approval artifact and publication.

## Hit list by file

### Tooling changes (the actual remaining engineering)

| File | Change | Why |
| --- | --- | --- |
| `tools/release/work-order-producer.ts` | Add a `--pool <dir>` mode: reuse an existing hashed report for a spec instead of re-running it, and a `--mint-only` mode that skips execution entirely | Removes the 7.4x re-run multiplier. Proofs still bind to real passing assertions in hashed reports |
| `tools/release/collect-work-orders.ts` (new) | Driver: compute the distinct file set across all 85 gates, run each once into a pool, then mint all receipts in dependency order | Makes the collection a single atomic operation, so a mid-run commit cannot silently discard it |
| `tools/scratch/*` | Delete after use | Measurement scratch, not source |

### Open product/harness defects that block specific gates

| Gate | File | Failure | Status |
| --- | --- | --- | --- |
| `a3` | `tests/browser/native-outline-pixel.spec.ts` | postprocess pixel kernels mismatch CPU byte kernels | re-running to confirm current |
| `a3` | `tests/browser/root-effects-a3.spec.ts` | root A3 effects pixel deltas / withholding | re-running to confirm current |
| `d2` | `tests/browser/scatter-50k.spec.ts` | 50k scatter budget hold | re-running to confirm current |
| `j1` | `tests/browser/game-performance-governor-hold.spec.ts` | governor 60fps wall-clock hold; previously an orphaned CPU hog, now retested clean | re-running to confirm current |
| `f2`, `n1` | `tests/browser/route-gamefeel-adoption.spec.ts` | Aura Clash combat drives shared camera rigs | re-running to confirm current |
| `l7` | receipt | `producer did not exit successfully` — minted at `a4dd8cc9`, HEAD is `fb33f0da` | stale source only; re-mint |
| `p01` | receipt | `missing hashed acceptance artifact` | needs the `muse301-particles/v1` typed contract from native run `34045615840`, not the generic producer |

### Hardware and human boundaries, stated as boundaries

| Item | Constraint |
| --- | --- |
| `gpu-particle-a4` 60-second test | Requires `AURA3D_REFERENCE_HARDWARE_ATTESTATION` and a Metal adapter. Closed by native run `34045615840`. Excluded by title in the generic producer, its siblings still run |
| `p01`, `p02`, `v01`, `l01`, `l02` | Carry typed `ACCEPTANCE_SCHEMAS` contracts; owned by dedicated producers |
| `l02` | `l02-producer.ts` declares a `humanApproval` input. The review manifest is already built (25 artifacts, 6 scopes, `independent-human-approval-pending`) |
| npm publication | 29 packages to the public registry. Irreversible, needs credentials, outside the autonomous perimeter |
| `archive` gate | Declares no tests and no typed contract. Needs an explicit ledger decision, not a fabricated receipt |

## Task list

- [ ] T1 Confirm current status of the 6 open spec failures on HEAD (running)
- [ ] T2 Fix each confirmed failure at root cause
- [ ] T3 Add `--pool` / `--mint-only` to the work-order producer
- [ ] T4 Add `collect-work-orders.ts` driver with dependency-ordered minting
- [ ] T5 Verify pooled minting on 3 already-valid gates; receipts must still validate
- [ ] T6 Freeze the tree at the final source commit
- [ ] T7 Run the Node suite pool once
- [ ] T8 Run the browser spec pool once (63 specs)
- [ ] T9 Mint the 82 pool-provable gates
- [ ] T10 Mint `l01` and `q02` from their acceptance producers
- [ ] T11 Re-earn K1 dependencies, then mint `k1`, `v01`, `v02` inside 30 minutes
- [ ] T12 Re-earn head-to-head on the frozen commit
- [ ] T13 Run the aggregate with the 85-receipt evidence manifest
- [ ] T14 Resolve `archive` by explicit ledger decision
- [ ] T15 Mark the 27 open PRD checkboxes from the aggregate result
- [ ] T16 Delete `tools/scratch`, reap background processes
- [ ] T17 Owner: independent human visual review of the 25-artifact manifest
- [ ] T18 Owner: publish 29 packages, then run read-only registry/origin verification
- [ ] T19 Mint `l02` from publication and approval evidence
- [ ] T20 Final aggregate; `overall` must read pass

## Checklist for closing an item

Unchanged from the previous plan, and it is the reason this took as long as it
did: an item is checked only with a source-bound receipt naming the run, exact
commit and artifact hashes. Failures are fixed at root cause. Thresholds, budgets
and scope are not lowered to obtain a green result. No automated result
substitutes for the required human review.

## Honest estimate

T1-T5 is a few hours of engineering. T6-T13 is one uninterrupted collection run;
its length is set by the browser pool, which is 63 specs at `workers: 1`. Measured
per-spec durations from the retained reports put the observed 43-spec subset near
14 minutes of test time, but that excludes the known heavy specs
(`showcase-route-primary-probes` and `advanced-examples-gallery` measured at ~86
and ~47 minutes on the hosted rasterizer), plus per-spec dev-server and build
startup. The collection is therefore hours, not days, and it is one run rather
than 85.

T17-T20 are not agent time at all. They are owner decisions: the human visual
review and the irreversible npm publication.

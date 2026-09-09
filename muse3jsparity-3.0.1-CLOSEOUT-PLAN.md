# 3.0.1 Closeout Plan

Status date: 2026-09-09. Branch `codex/muse301-release`, head `c62aabfc`.

## Why this took days

Three structural faults, now fixed, made the work look larger than it was.

1. **One failure masqueraded as 22.** The readiness aggregate runs a baseline first and
   aborts every downstream gate when it fails. `R-unit` failed, so all 22 gates reported
   `not executed: baseline failed` and all parts A–V reported `blocked`. The dashboard
   implied whole-program failure; the actual defect was a handful of unit tests.
2. **The browser lane could not finish.** `playwright.config.ts` sets `workers: 1`, so all
   54 browser tests ran serially in one job. Two specs accounted for 133 of 155 minutes.
   One run reached 241 minutes and was heading for the 6-hour job ceiling.
3. **Passing shards discarded their own evidence.** The browser workflow uploaded only
   `browser.json`, not the route-primary/gallery producer outputs the freshness gate
   audits. A green shard therefore could never clear the stale-artifact chain.

## Verified current state

- **L01 PASSED.** Run `34302077484`, exact source `40dd2f41`: 29 packages packed once,
  29 tarball digests bound to the release plan, `lifecycleAssertions: 149`, 19/19
  scaffolds green on both source and exact-installed legs, all 8 acceptance checks true.
  Receipt `fcd7fe9c9b48d935c9747321d0d2a43499346dc1c8b81199ab669201687455e4`.
- **Unit baseline: 4,966 tests, 6 failures** (was 10). No failure outside the stale-evidence chain.
- **Browser shards:** `gallery` and `route-primary` both PASSED. `routes` failed on 3 of 22 WOW routes.
- CI, Build and Test, and Test & Coverage are green.

## Root causes fixed this session

| Defect | Root cause | Fix |
| --- | --- | --- |
| L01 `version constraint mismatch` | 33 stale internal pins across all root `templates/*/package.json` (`2.0.4`, `0.1.0-alpha.0`, `0.0.0-rebuild`) | Pinned to `3.0.1`; readiness tool reads the root version instead of hardcoding the old alpha |
| L01 `export inventory incomplete` | `verify-exports` walked only `packages/*`, so the published root `@aura3d/engine` never entered the inventory even though its exports are validated | Root manifest now recorded; 30 packages, zero violations |
| 14 browser failures | Hardware-calibrated frame budgets and fixed timeouts asserted against a hosted SwiftShader software rasterizer | New `tests/browser/gl-device-class.ts`; budgets asserted only on hardware GL, software GL must still render/animate/stay bounded |
| Browser lane never finishing | Single serial job, `workers: 1` | Sharded into 3 parallel jobs with verified exact spec coverage |
| 3 WOW routes `Invalid GLB magic` | `fixtures/` is gitignored, so 3 flagship corpus GLBs existed only locally. CI fetched an HTML 404 body and read it as GLB | LFS-tracked `fixtures/asset-corpus/*.glb` and committed the 3 missing fixtures (34 MB) |
| Stale probes could not clear | Shards discarded producer evidence | Workflow now retains route-primary, gallery and WOW report directories |
| `runtime-edge-coverage` (x2), `release-metrics-rollup` | A prior commit added `packages/physics-rapier/src/HeightfieldLayout.ts` without registering it in the edge-coverage audit or the ADR ownership registry | Added the `physics-rapier` suite mapping and the ADR-0004 registry entry |
| `aura-clash-rendering-evidence` | **Self-inflicted.** An earlier commit of mine weakened `gameplayVisible` from `performanceBudgetOk && bloomWithinLimit && fogBehind` by dropping the performance term, retiring a deliberate anti-overclaim guard | Restored the conjunctive predicate and the `budgetOk` visual assertion; device-class scoping belongs in the harness that supplies `budgetOk` |

## Remaining work

### Step 1 — Green the browser lane (in flight, run `34388538420`)
The `routes` shard must pass with the committed fixtures. `gallery` and `route-primary`
already pass. Expected: hours, bounded by the slowest shard, not the sum.

### Step 2 — Clear the stale-evidence chain
5 of the 6 unit failures share one cause: all 22 retained
`tests/reports/showcase-route-primary-probes/*.json` are stale on renderer fingerprint
(zero ordering cycles, zero ownership conflicts). Downstream consumers
(`evidence-freshness`, `replicability-metrics`, `showcase-route-gates`) read the
authoritative explainer live, so they clear together once the probes are regenerated
from the retained shard evidence. The 6th failure is
`head-to-head-current-aggregate`, whose receipt is pinned to commit `16ea94f0`;
re-earned by `pnpm head-to-head:installed` on frozen source.

### Step 3 — Run the 22 gates for the first time (**principal unknown**)
With `R-unit` green, `pnpm muse3jsparity:release` will execute gates that have never
reported. This closes the open G01/G02/G03 lines (`Zero failed required tests`,
`immutable producer receipt`, `full release receipt`, `E/H/I/U executed gates`) and the
Q01/Q02 lines. **Duration is genuinely unknown**: these gates have only ever been
skipped, so their first real verdicts may surface defects. No estimate is given here
rather than an invented one.

### Step 4 — L02 publication and human review
Registry publish, 29/29 artifact verification, clean registry-installed lifecycles,
deployed-origin proof, release notes and tag lineage. This step includes the
**independent human visual review**, which is the owner's decision, not an agent's:
the root AGENTS rule states a route is not approved merely because automated
evidence is green.

## Sequencing constraint

The order is forced by real dependencies, not preference: probes must regenerate before
the freshness-derived reports; those must pass before `R-unit` is green; `R-unit` must be
green before any of the 22 gates run; all gates must pass before publication. Parallelism
was already applied where it exists (3 browser shards); the rest is a genuine chain.

## Rules for closing items

An item is checked only with a source-bound receipt naming the run, exact commit and
artifact hashes. Failures are fixed at root cause. Thresholds, budgets and scope are not
lowered to obtain a green result, and no automated result substitutes for the required
human review.

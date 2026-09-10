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

## Execution log — 2026-09-09 (Step 2 and Step 3 pre-verification)

**Step 2 half complete.** `head-to-head-current-aggregate` now PASSES. The receipt was
re-earned on a new remote workflow (`.github/workflows/muse301-h2h.yml`, run
`34395700465`) and binds commit `1c26634e` with `pass: true`, 29 packages all at
`3.0.1`, 29 tarball digests, 15 workloads, `universalScore: null`,
`comparisonComplete: false` and zero failures. Unit failures: 6 -> 5. Every remaining
failure is the single route-primary probe-freshness chain.

**Step 3 gates pre-verified rather than waited on.** All 13 aggregate browser gates were
run directly instead of discovering their verdicts inside a long serial gate run:
E (10/10), H+I (5/5), U context-loss/deep-recovery, K1 root-path-integrity (6/6),
K1 library-parity-superiority (3/3), K1 game-visual-superiority (5/5), U1 resource soak.
Only P01 `gpu-particle-a4` cannot pass here: it requires
`AURA3D_REFERENCE_HARDWARE_ATTESTATION` from the native macOS workflow, and is already
closed by native run `34045615840`.

Four further defects were found and fixed at root cause:

| Defect | Root cause | Fix |
| --- | --- | --- |
| U1 soak `heap drift 6.2-11 MiB` vs 4 MiB budget | `usedJSHeapSize` was read after a single `collectGarbage`. Measured at one instant with no work between samples: baseline `23295523` then `19682819` repeating; chunk-4 `30147932` x4 then `20074715` repeating. V8 needs a variable number of collections and repeats the same unsettled value first, so the gate was anchored to an unsettled sample and the maximum landed on the FIRST chunk then fell — the opposite shape of a leak | Read the settled floor across passes. Real drift is 0.374 MiB (~8.7 KiB/cycle) with drift rising smoothly 0.29 -> 0.374. **Budgets unchanged at 4 MiB and 2 MiB**; 8/8 consecutive runs pass |
| B1 shadow family: `clearcoat-sheen-anisotropy-textures` reported 0 spot uniforms, expected 13 | The variant defines `A3D_PBR_NO_SPOT_SHADOW` (a deliberate sampler-budget opt-out) but the test's opt-out allow-list was a hardcoded literal naming only two variants. Added during 3.0.1, it made a correct opt-out look like a broken uniform insertion | Derive the opt-out set from the shader library, so the expectation cannot drift from source |
| K1 freshness: 19 retained artifacts ~5.5 days old | The PRD 30-minute rule requires dependent producers inside one window; their producers had not been re-run | Re-ran shadow-family-b1, contact-shimmer-b1b2, clustered-lighting-b5, d4-flipbook-beam, gpu-particle-a4 and batch-consolidator-shootout, then K1 inside the window |
| K1 freshness: `engine-perf-301.json` and `root-governor-301.json` **missing entirely** | Two required 3.0.1 producers had never been generated | Ran both producers (7/7) plus the visual matrix (8/8); K1 then passed 5/5 |
| H2H `asset-hashes-current: 6 locked assets` | The locked `morph-expression` parity fixture lived under the gitignored `fixtures/` tree, so CI had no file. Same class as the WOW `Invalid GLB magic` defect | Committed the fixture and its manifest siblings. Audited all locked benchmark assets: 6 of 6 now present on the remote |

## Execution log — 2026-09-09 (Step 1 routes shard green; Step 4 review manifest built)

**Step 1 partially closed.** The `routes` browser shard now PASSES, which is the shard that
previously failed on the three WOW routes with `Invalid GLB magic`. That confirms the LFS
fixture publication fixed a real CI-only defect. `gallery` and `route-primary` are still
executing on run `34394359966`.

**A further asset defect found and fixed.** `crowd-instancing-adoption-301` aura-clash
failed with `Aura Clash root production mount failed:` and an empty reason. The empty
message was the tell: the guard reports renderer warnings, and there were none. Direct
instrumentation showed a single `HTTP 404` for
`/aura-assets/auraClashSpectatorCard.a5b562b8.glb`. The file exists and is tracked under
`apps/aura-clash-showcase/public/aura-assets/`, but the dev server resolves `/aura-assets/`
from the repository root, where the two sibling Clash rigs are mirrored and the spectator
card was not. Mirroring it (bytes verified: sha256 prefix `a5b562b8` matches the
content-addressed filename) makes the route mount and the case passes.

**Step 4 machine work is now complete up to the human boundary.** The three L02 artifacts
were missing entirely. Working the real generator chain rather than hand-authoring:

1. Ran the two missing gallery producers, `smart-city-composition-301` (8/8) and
   `crowd-instancing-adoption-301`, which emit 6 of the required captures.
2. Generated the four `muse301-gallery` producer receipts via
   `muse301-gallery.mjs receipt` over their artifact directories.
3. Built `release-artifacts/3.0.1-final-visual-review-input.json` (all six required scopes:
   flagship-routes, showcase-games, aura-clash, night-adoption, crowd-adoption,
   selected-threejs-comparison).
4. Built `release-artifacts/3.0.1-final-visual-review-index.json`. This step is the real
   check: it rejects any artifact that is not uniquely bound to a producer receipt with
   `exitCode: 0` on the current source identity. It passed for all six scopes.
5. Built `release-artifacts/3.0.1-final-visual-review-manifest.json` — 25 artifacts, schema
   `aura3d.final-visual-review-manifest/2.0`, bound to source commit `f78eeec8`, with
   `status: independent-human-approval-pending` and the explicit boundary "this producer
   cannot approve them".

**The remaining L02 obligations are owner actions, not agent actions.** Verified by reading
the tooling: `l02-producer.ts` requires a `humanApproval` artifact input, and
`verify-public-release.mjs` is strictly read-only post-publish verification (it fetches
registry metadata and compares tarball bytes to the packed candidates). Publication itself
writes 29 packages to the public npm registry and needs credentials; that is irreversible
and outside the autonomous perimeter.

## Execution log — 2026-09-09 (routes-shard evidence verified; non-browser gates pre-verified)

**Routes shard evidence confirmed retained and green.** Downloaded artifact
`browser-matrix-reports-node-22-routes` from run `34394359966`:
`tests/reports/wow-showcase/route-health.json` reports `routeCount: 22`, `pass` with
`failures: []`, and 44 retained screenshots. This proves two things at once — the LFS
fixture publication fixed the three `Invalid GLB magic` routes, and the workflow retention
change actually delivers producer evidence (an earlier passing shard uploaded only
`browser.json`).

**Probe staleness will clear on arrival, verified rather than assumed.** The current
renderer fingerprint is `sha256-8213d6df8a4ca21e7ca530f0d08e41cbd...`, which is exactly the
value the 22 stale probes expect, and `git diff` confirms none of the 10
`RENDERER_FINGERPRINT_SOURCES` changed since the running shard's commit. So the incoming
route-primary evidence is valid for this tree rather than immediately stale again.

The one `primary-asset: removed` reason was also run to ground: probe
`showcase-gravity-post.json` records `gravityPodSkiffMeshy`, but the route legitimately
renamed its primary to `gravityPostCourierSkiff` (`primaryAssets` in
`apps/showcase-gravity-post/src/main.ts`, and `route-gates.json` maps
`gravityPostCourierSkiff` to `primary-vehicle`). The probe is stale evidence of a retired
id, not a missing asset, and regeneration resolves it.

**Non-browser aggregate gates pre-verified on current source**, so Step 3 has fewer
unknowns left when it runs:

| Gate | Result |
| --- | --- |
| `R-integration` | 11/11 passed |
| `Q-reference-vectors` | 19/19 passed |
| `S-matrix-generation` | `src=750 jsm=425 jsmTsl=61`, 36 rows, 0 GAP without `prdSection`, 0 OUT without `outReason` |
| `docs-claims-audit` | exit 0 |
| `bundle-size` | `pass: true`, 8 targets, 0 over budget |

Combined with the 13 browser gates verified in the previous log entry, every aggregate gate
except `R-unit` (blocked only by the probe chain), `template-lifecycle-*`,
`package-clean-install` and `installed-tree-shaking` now has a current-source result.

## Execution log — 2026-09-09 (Step 2 complete: probe chain cleared, unit failures 6 -> 1)

**The blocking chain is broken.** The `route-primary` shard PASSED and, because of the
retention fix, delivered 45 probe artifacts. Installing them dropped
`explain-staleness.mjs` from **22 stale of 22 audited to 0 stale of 22 audited**, with zero
ordering cycles and zero ownership conflicts. `evidence-freshness` and
`showcase-route-gates` now pass; `replicability-metrics` passes after regenerating its
report, which reports `0 of 22 audited` freshness failures.

**Full unit baseline: 4,966 tests, 1 failure** (from 10 at the start of this work). The one
remaining failure is `head-to-head-current-aggregate`, and it is purely a commit binding:
the receipt was earned at `1c26634e` and HEAD has since advanced. A run pinned to the
current commit `04619322` is executing.

**One more real defect found while clearing the chain.** After installing the fresh probes,
`game-visual-qa` failed 2 tests with all 12 checks reporting `pass`. The report's own
`blockers` field named the cause: `composition-screenshot-stale`. The regenerated probe
correctly binds the new route screenshot `sha256-efc8cfdb...`, but the composition evidence
still referenced the previous `sha256-5ad3ba85...`. This is the documented producer
ordering — `producer-registry.mjs` records that `regenerate-game-composition-evidence`
hashes the route-primary probe, so it must run after it. Running that regenerator rebound
both routes to `efc8cfdb` and `game-visual-qa` passes 21/21.

**Also verified this turn:** the routes-shard artifact proves WOW route health at
`routeCount: 22`, `failures: []`, 44 screenshots; the `primary-asset: removed` reason was a
legitimately renamed route primary (`gravityPodSkiffMeshy` -> `gravityPostCourierSkiff`),
not a missing asset, and regeneration resolved it.

## Execution log — 2026-09-09 (all 22 aggregate gates verified on current source)

**Step 3's "principal unknown" is resolved.** Every gate the readiness aggregate runs now has
a current-source result, obtained by running each gate directly rather than waiting to
discover verdicts inside one long serial run:

| Gate | Result |
| --- | --- |
| `R-typecheck` | exit 0 |
| `R-unit` | 4,966 tests, 1 failure (commit binding only, see below) |
| `R-integration` | 11/11 |
| `Q-reference-vectors` | 19/19 |
| `S-matrix-generation` | `src=750 jsm=425 jsmTsl=61`, 0 unowned GAP, 0 unreasoned OUT |
| `template-lifecycle-source` | pass, 19 templates, 149 checks, 0 failures |
| `template-lifecycle-tarball` | L01 receipt: 19/19 `installedPassed`, `lifecycleAssertions: 149` |
| `docs-claims-audit` | exit 0 |
| `bundle-size` | pass, 8 targets, 0 over budget |
| `package-clean-install` | pass, optional-peer `absent` and `present` both ok |
| `installed-tree-shaking` | pass 9/9 |
| `browser:` E gates (3 specs) | 10/10 |
| `browser:` H + I gates (4 specs) | 5/5 |
| `browser:resource-soak-u1` | pass after the settled-heap-floor repair |
| `browser:` U + K1 integrity (3 specs) | 6/6 |
| `browser:game-visual-superiority` | 5/5 |
| `browser:library-parity-superiority` | 3/3 |

`P01 gpu-particle-a4` is the sole gate that cannot run here: it requires
`AURA3D_REFERENCE_HARDWARE_ATTESTATION` from the native macOS workflow and is already closed
by native run `34045615840`.

**Head-to-head re-earned on the current tree.** Run `34405702612` passed with `pass: true`,
commit `04619322`, 29 packages all at `3.0.1`, 29 tarballs, 15 workloads. The remaining unit
failure is structural, not a defect: this receipt binds to `HEAD`, and every later commit
(including the commit that records this note) invalidates it. It must therefore be the last
producer run before the aggregate, after the final source commit.

## Execution log — 2026-09-09 (Steps 1 and 2 COMPLETE; aggregate executed for the first time)

**Step 1 complete.** Browser Matrix run `34394359966` finished `success` with all three
shards green: `routes`, `route-primary` and `gallery`. The shard split turned a job that had
reached 241 minutes and was heading for the 6-hour ceiling into three parallel jobs that all
completed.

**Step 2 complete. Unit baseline: 4,966 tests, 0 failed, 0 pending, 0 todo.** The last
failure was cleared by re-earning the head-to-head receipt on the exact final commit
(`e950e132`, run `34407863681`: `pass: true`, 29 packages at `3.0.1`, 29 tarballs,
15 workloads). `R-unit` is green, which unblocks the 22 downstream gates.

**Step 3: the aggregate ran end to end for the first time.** `pnpm muse3jsparity:release`
executed every gate rather than skipping them as `baseline failed`. Result: **20 of 22 gates
`exit=0`**, including all of `Q-reference-vectors`, `S-matrix-generation`, `docs-claims-audit`,
`bundle-size`, `package-clean-install`, `installed-tree-shaking`, `template-lifecycle-source`
and 9 of the 10 browser gates. Two gates failed, and neither is a product defect:

1. `template-lifecycle-tarball` — **12 installs killed by `SIGKILL`** with 3,629 free pages
   on the machine. This is local memory exhaustion while packing 29 packages and running 19
   installed scaffold lifecycles, exactly the workload class the standing policy says to run
   remotely. Not a lifecycle failure: the same leg passes in L01 receipt `40dd2f41` with
   19/19 `installedPassed` and `lifecycleAssertions: 149`.
2. `browser:game-visual-superiority` — the K1 30-minute freshness rule, tripped by the
   aggregate's own runtime. Its 19 dependent artifacts aged to ~226 minutes while the earlier
   gates ran. Ordering problem, not a threshold problem.

**Both are fixed by execution order, not by weakening anything.** New
`.github/workflows/muse301-aggregate.yml` runs the aggregate on a dedicated remote runner and
re-earns the K1 dependent producers immediately before it, so the 30-minute window is
satisfied by sequencing. The device-independent `gpu-particle-a4` tests are included by name;
its 60-second Apple Metal acceptance test is P01, already closed by native run `34045615840`
and unable to pass on Linux. Dispatched as run `34414608666` pinned to `b8e002a1`.

## Execution log — 2026-09-09 (K1 freshness fixed at its cause, in the aggregate itself)

Two defects in the remote aggregate were found and fixed.

**1. Missing build step.** The first remote aggregate failed in under three minutes with
`Cannot find module .../node_modules/@aura3d/rendering/dist/index.js imported from
tests/browser/shadow-family-b1.spec.ts`. Browser specs resolve `@aura3d/*` through built
`dist` output, and `browser-matrix.yml` builds before testing while the new aggregate
workflow did not. This was a consequence of my own earlier repair: deriving the B1
spot-shadow opt-out set from the shader library added a package import to that spec. Added
`pnpm build:raw` before the producers.

**2. The K1 freshness window cannot be satisfied by pre-running producers.** My first attempt
re-earned the K1 producers in a workflow step before `pnpm muse3jsparity:release`. That is
insufficient, and the reason is structural: the K1 gates run **last** in the aggregate's stage
list, and `template-lifecycle-tarball` alone packs 29 packages and runs 19 installed scaffold
lifecycles ahead of them. Any evidence earned before the aggregate has aged far past 30
minutes by the time K1 executes — the first full run measured those 19 artifacts at
**226 minutes** old.

The fix is in `tools/muse3jsparity-readiness/index.ts`, not in a workflow: the eight K1
dependent producers (`shadow-family-b1`, `contact-shimmer-b1b2`, `clustered-lighting-b5`,
`d4-flipbook-beam`, `batch-consolidator-shootout`, and the three `muse3jsparity-301-*`
producers) are now explicit stages scheduled immediately before the K1 gates. This satisfies
the 30-minute rule by execution order, which is what the rule asks for, rather than relaxing
the threshold or pre-seeding stale artifacts. The tool's existing capture-order validation
still rejects a baseline that runs after a capture, and the workflow step was removed so
ordering has one owner. Readiness, lineage and requirements regressions pass **95/95** and
`pnpm typecheck:raw` is clean.

Dispatched as run `34417699250` pinned to `08c0e967`.

## Execution log — 2026-09-09 (aggregate must run locally; K1 ordering fix confirmed registered)

**The aggregate cannot run on a fresh CI checkout, and this is by design.** The remote
aggregate reported `R-unit` with **65 failures and only 4,950 of 4,966 tests loaded**, versus
0 failures locally. Cause: `.gitignore` line 43 ignores `tests/reports/`, and only 57 files
under it are tracked. The failing tests all read retained producer evidence — route-primary
probes, screening reports, perceptual signatures, freshness audits — which does not exist on a
clean clone. The aggregate is the consumer of accumulated evidence, so it must run in the
worktree where that evidence lives. The remote workflow remains useful for isolated producers
such as the head-to-head reproduction, which packs its own inputs.

**The earlier local `SIGKILL` failures were contention, not a hard limit.** At the time of the
first local run the machine had 3,629 free pages; measured again now it has roughly 63.5 GB
free plus inactive. The tarball lifecycle is schedulable locally when not competing with other
heavy work.

**The K1 ordering fix is confirmed registered.** The remote run's readiness report lists the
eight new producer gates by name (`browser:shadow-family-b1`, `browser:contact-shimmer-b1b2`,
`browser:clustered-lighting-b5`, `browser:d4-flipbook-beam`,
`browser:batch-consolidator-shootout`, and the three `browser:muse3jsparity-301-*`) ahead of
the three K1 gates, so the freshness window is now satisfied by the aggregate's own execution
order rather than by pre-seeding or threshold changes.

**Remaining sequencing constraint, stated precisely.** `head-to-head-current-aggregate` binds
its receipt to `HEAD`, so every commit invalidates it — including commits that only edit this
plan document. The receipt must therefore be the final producer run before the aggregate, on
frozen source. Re-earned at `53491ade` as run `34418848535`.

## Execution log — 2026-09-10 (installed-scaffold SIGKILL root-caused; aggregate run discipline)

**The `SIGKILL` failures were a misclassified timeout, not memory pressure.** This was my
earlier misdiagnosis, corrected by reading the retained command metadata. Each template's
package install passed, then a *second* "install" was started and killed at exactly 180
seconds (`product-viewer`: started `00:18:24.337Z`, killed `00:21:24.342Z`). That second
command is `playwright install chromium` — a browser **download**.

`tools/agent-templates/command.mjs` classified stages with an install-first test, so any
argv containing the token `install` got the 180 s package budget, including the Chromium
fetch. The browser stage already allows 480 s. Fix: classify the Playwright CLI before the
generic `install` check. **No timeout value was raised**; the download now simply uses the
stage that was always intended for it. Verified: `playwright cli install chromium -> browser`,
`npm install <tarballs> -> install`, `npm run build -> build`.

This also explains why 63.5 GB of free memory did not help, and why the same 12 kills
reproduced on both the hosted runner and this machine.

**Operational rule learned the hard way: never commit while the aggregate is running.** The
run that reached 14 gates reported `source changed during execution` on every gate after the
baseline, even though the underlying suites passed (for example
`browser_certified-hero-rigs` logged `6 passed (1.2m)` and still recorded `exit=1`). The
cause was mine: the aggregate started at `9d79ee1e` and I committed the Playwright fix
(`85019a77`) while it was mid-flight, so `sameSource` correctly rejected every later gate.
The tool is right and the discipline is the fix — freeze the tree, then run.

The r185 matrix file is already excluded from source identity (it is a producer output), so
its regeneration is not the cause; it is committed here to keep the tree clean.

## Execution log — 2026-09-10 (ALL 33 aggregate gates pass; the real remaining shape is now exact)

**Every aggregate gate passes.** `tests/reports/muse3jsparity/readiness.json` reports
`gates: 33`, **`non-pass: 0`**, `errors: []`. That includes the two that had never passed:

- `template-lifecycle-tarball` — 149 checks, 0 failing, mode `fresh-local-3.0.1-tarballs`,
  unblocked by removing the dead Playwright `__dirlock` (the foreign `episodeos` install had
  held it for over two days at 0% CPU with no open handle).
- `browser:game-visual-superiority` — passes now that the eight K1 producers plus the
  `gpu-particle-a4` evidence-refresh stage run immediately before it, satisfying the PRD
  30-minute freshness rule by execution order.

**`overall` is still `blocked`, and the reason is structural rather than a failure.** With
zero failing gates, the blocker is requirement coverage: `tasks` shows **33 pass and 757
blocked**. Reading `contracts.ts`, a requirement passes only when every gate it names has
exactly one result, that result is `pass`, its receipt hash is a valid SHA-256, and the
receipt's `tasks` array lists that requirement id.

The 757 blocked entries are the original PRD obligations, and they do not name the
infrastructure gates the aggregate runs. They name **85 distinct work-order proof gates**:
`a1..a5, b1..b5, c1..c4, d01..d4, e01..e3, f1..f4, g01..g03, h1, h2, i01..i04, j1..j3, k1,
k2, l01, l02, l7, m1..m3, n1..n4, o1..o3, p01, p02, p1..p3, q01, q02, r01..r06, s, t1..t3,
u1, u2, v01, v02, archive, master`. The most-referenced are `q01` (242), `g03` (197),
`g01` (184), `g02` (65), `v01`/`q02`/`l02` (64 each), `l01` (63).

**These are supplied through `--evidence-manifest`, not by running the aggregate.**
`index.ts` accepts `--evidence-manifest`, reads each referenced producer receipt, and
validates it with `validateReceipt`. That validation includes `sameSource(receipt.source,
expected.source)`, so **every work-order receipt must be earned on the same frozen commit as
the aggregate run**, and `k1`/`v01`/`v02` additionally carry `MAX_COMPARISON_AGE_MS`.

This is why the PRD's per-work-order sections exist: L01 already has such a receipt from run
`34302077484`, and L02's producer requires a `humanApproval` artifact as a declared input.
The aggregate is the final reducer over those receipts, not a substitute for them.

**Process defect found and fixed.** Two aggregates ran 11 minutes apart, both reporting
`R-unit` failure with `STACK_TRACE_ERROR` and no assertion detail — the signature of a killed
worker, not a defect (the test passes standalone). Cause: `launchctl submit` implies
KeepAlive, so launchd relaunched the aggregate the moment it exited, and overlapping runs
share `tests/reports`. Added a single-run stamp guard so a relaunch is a no-op. The aggregate
correctly reported blocked rather than passing on damaged evidence.

## Execution log — 2026-09-10 (work-order receipt producer built and proven)

**The 757 blocked obligations now have a working, general path to closure.** New
`tools/release/work-order-producer.ts` earns a work-order gate receipt the way the ledger
requires: it runs exactly the test files each obligation names, retains the hashed JSON
report, and binds every obligation to a real passing assertion inside it.

It is deliberately generic. Proofs are derived from each requirement's own declared `tests`
entries, never from a hardcoded task-to-file table, so it cannot credit an obligation to a
test the ledger does not name for it. Obligations carrying typed acceptance contracts are
excluded rather than fabricated.

**Proven end to end on gate `m3`:** the producer emitted a receipt that
`validateReceipt` accepts with **`valid: true` and zero errors** — 4 tasks, 4 proofs,
`exitCode: 0`, each proof naming a real passing assertion in the retained report.

**Coverage measured across all 85 work-order gates:**

| Category | Gates |
| --- | --- |
| Provable by ledger-named tests (this producer) | **81** |
| Require typed acceptance contracts (dedicated producers) | 3 — `l01`, `l02`, `q02` |
| Neither (declares no tests) | 1 — `archive` |

`l01` already has a passing receipt from run `34302077484`. `l02` requires a `humanApproval`
artifact as a declared producer input, so it cannot be machine-closed. `q02` needs its
source-audit acceptance contract.

**Known sequencing constraint, re-confirmed.** A verification run failed `R-unit` on
`head-to-head-current-aggregate` because the receipt binds `HEAD` and the plan-document
commit advanced it (`eb4b6f39` receipt vs `f445ccab` HEAD). The aggregate aborts at the
baseline, so the manifest is never reached. The head-to-head receipt must therefore be the
last producer run before any aggregate attempt, on the frozen commit.

## Execution log — 2026-09-10 (work-order receipts in production; two real defects surfaced)

**15 of 15 unit-only work-order gates produced valid receipts.** `m3, r0, s, b2, f3, j3, n3,
p1, t2, c3, o3, q0, t1, v1, p3` all validate with `valid: true` and **zero errors**. The
producer scales, and its receipts are accepted by the same `validateReceipt` the aggregate
uses.

**Browser gates required one fix, then worked.** The first four browser gates failed with
`ENOENT ... /wo/b4/browser.json`: `playwright.config.ts` pins the json reporter's
`outputFile`, so every gate would otherwise overwrite the shared
`tests/reports/browser.json` and leave no per-gate report to hash. Setting
`PLAYWRIGHT_JSON_OUTPUT_NAME` per run — the same override the readiness aggregate uses —
fixed it. Gate `b4` then validated with zero errors (8 tasks, 16 proofs).

**Two genuine product defects found, both in specs the aggregate never exercised.** These
are not tooling problems and not flakes; the 33 aggregate gates do not include these files,
so this is the first time these obligations have been executed for 3.0.1:

1. `c1` (`tests/browser/root-textured-c1.spec.ts`) — 2 failed, 11 passed.
   `C1 textured upgrade never landed`, caused by
   `Failed to resolve module specifier '@aura3d/rendering/extension-scalar-atlas'`, so the
   subject falls back to a scalar material and the clearcoat channel-vector assertion fails.
   The export exists in `packages/rendering/package.json` and both
   `packages/rendering/dist/extension-scalar-atlas.js` and the `node_modules` symlink
   resolve on disk, so this is a browser-side module resolution gap rather than a missing
   build artifact.
2. `j2` (`tests/browser/webgpu-post-j2.spec.ts`) — 1 failed, 3 passed.
   `RenderDeviceError: Native WebGPU readback currently supports rgba8 render targets`.

Both are recorded as open work rather than worked around; neither gate can hold a receipt
until its named suite actually passes.

## Execution log — 2026-09-10 (C1 module-resolution defect fixed; oracle defect isolated)

**Fixed a real dev-server defect.** `tests/browser/example-dev-server.ts` aliased only three
of the five published `@aura3d/rendering` subpaths, omitting `extension-scalar-atlas` and
`webgpu`. The omission does not fail at build time: the browser rejects the specifier at
runtime, `createAuraApp`'s dynamic `import("@aura3d/rendering/extension-scalar-atlas")`
fails, the route silently falls back to a scalar material, and only a downstream pixel
assertion notices. Both aliases are now registered ahead of the bare `@aura3d/rendering`
entry, because the first prefix match wins. `root-textured-c1.spec.ts` improved from
**11 passed / 2 failed to 12 passed / 1 failed**, and the
`Failed to resolve module specifier` warning is gone.

**Isolated the remaining C1 failure to a harness-oracle defect, not a renderer defect.**
`root-textured-c1.spec.ts` "color-space uploads" fails on the first slot with
`matchingPixels: 0`. Measured evidence:

- The fixture texel is exactly what the oracle expects: reading
  `tests/browser/fixtures/c1-extension/generated/rgba.3b557885.png` at the sampled UV
  (pixel 16,16) returns `[184, 244, 112, 162]`, matching the oracle's computed
  `[184, 244, 112, 162]`. The texture and its sampling coordinate are correct.
- The dominant surface colour is `[216, 225, 197]`, which is the texel run through ACES
  filmic tone mapping plus sRGB encode (`a3dTexturedPbrEncodeOutput`) to within 5/255
  (`[221, 230, 199]`). So the pipeline's encoded output is reaching the framebuffer, not the
  harness's raw-texel override.
- Cause: the harness patches whichever fragment program declares
  `uniform sampler2D u_clearcoatTexture;`, but that uniform only exists under
  `#ifdef A3D_PBR_CLEARCOAT_TEXTURES` **and** `#ifndef A3D_PBR_EXTENSION_ATLAS`. With the
  extension-atlas variant active the drawing program uses `u_clearcoatAtlasRect` instead, so
  the substitution lands on a program that never draws. Confirmed by wrapping
  `shaderSource`: the substituted colour disappeared entirely and `shaderSubstitutions`
  dropped to 0, proving programs are compiled once and cached across the eight slots.

This is recorded as open work. The oracle must target the atlas-variant program (or force
the non-atlas variant) rather than assuming a `u_clearcoatTexture` sampler exists; the
assertion was authored in `efe051c0` and has never passed.

## Execution log — 2026-09-10 (K1 freshness generalized; receipt-source discipline established)

**Process error found and corrected: receipts must all share one frozen source.** Auditing the
36 receipts produced so far showed them spread across **six different source fingerprints**,
because I committed fixes while the batch was running. `validateReceipt` enforces
`sameSource`, so the aggregate accepts a manifest only when every receipt matches the same
commit. Receipt `b1` had already recorded `exitCode: 1` from the producer's own
source-stability guard, which is the tool behaving correctly. The batch was stopped; all
source changes must land before a single uninterrupted collection run.

**K1 freshness generalized in the producer.** `game-visual-superiority.spec.ts` enforces the
PRD 30-minute rule against retained evidence it does not produce, and **18 work-order gates
name it**: `a4, g01, g02, g03, j1, k1, k2, l01, l02, l7, master, p01, q01, q1, r03, r1, v01,
v02`. Any of them run in isolation failed with `Stale feature evidence must be rerun by its
full producer` (measured at 53 minutes for `p01`). The producer now re-earns the eight K1
dependency producers plus `gpu-particle-a4` immediately before any gate naming that spec.
Verified on `p01`: staleness cleared, K1's own five tests passed, and the suite improved from
13 passed / 2 failed to **14 passed / 1 failed**.

**P01 hardware boundary handled the same way as in the aggregate.** After K1 freshness was
satisfied, the sole remaining `p01`/`a4` failure was
`gpu-particle-a4.spec.ts` "10k live rendered particles hold native Apple Metal thresholds",
which requires `AURA3D_REFERENCE_HARDWARE_ATTESTATION` and is already closed by native run
`34045615840`. The producer now excludes that one test by title via `--grep-invert`; its
sibling tests in the same file still run and still prove their obligations. The browser suite
then passed.

**`p01` and `a4` cannot be closed by this producer, and the reason is structural.**
`ACCEPTANCE_SCHEMAS` requires a typed acceptance artifact for five gates — `p01`
(`muse301-particles/v1`), `p02`, `v01`, `l01`, `l02`. Reading `acceptance.ts`, the `p01`
contract demands an adapter matching `/metal/i`, explicitly rejects
`swiftshader|software|llvmpipe`, and needs ≥60 seconds of contiguous frames at ≥10,000 live
and rendered particles. That is provable only on native Apple hardware, which is precisely
what the native receipt already provides. These five gates belong to their dedicated
producers, not to the generic one.

**Revised coverage:** 76 of 85 gates are closable by the generic producer; 5 need typed
acceptance producers (`p01`, `p02`, `v01`, `l01`, `l02`), 1 declares no tests (`archive`), and
`l02` additionally requires the human approval artifact.

## Execution log — 2026-09-10 (C1 oracle defect fully characterized)

Instrumented the WebGL layer to identify the drawing program by hooking `shaderSource`,
`attachShader` and `drawElements`. Measured facts for `color:clearcoat`:

- Four fragment programs compile. Only program **3** declares
  `uniform sampler2D u_clearcoatTexture;` and only program **3** carries the harness patch
  (`patched: true`). No program declares `u_clearcoatAtlasRect`, so the earlier
  atlas-variant hypothesis was wrong and that speculative edit was reverted.
- Draw order is `[0,1,1, 0,3,1, 0,3,1]` — three passes of three objects. The patched program
  **is** bound and **is** drawn in the final two passes.
- The box region (66,571 px) reads `[216,225,197]`, which is the fixture texel
  `[184,244,112]` run through ACES filmic + sRGB encode (predicted `[221,230,199]`). The
  floor reads `[52,59,70]`, consistent with its `#3a4350` material, so the floor is not
  covering the box.
- The fixture itself is correct: decoding
  `tests/browser/fixtures/c1-extension/generated/rgba.3b557885.png` at the sampled UV returns
  exactly `[184,244,112,162]`.

So the substituted statement compiles into the program that draws the subject, yet the
framebuffer still holds the encoded value. The remaining candidates are the override's guard
(`if(u_baseColor.a >= 0.0)`) not being taken, or the appended statement being placed outside
the emitting scope. This is a harness-oracle defect in evidence authored by `efe051c0` that
has never passed; it is **not** a renderer defect, and the texture upload path is proven
correct by the 12 other passing assertions in the same spec.

Recorded as open work rather than adjusted: the assertion is a real claim about numerical
channel vectors and must not be weakened to obtain a receipt.

## Execution log — 2026-09-10 (C1 oracle root cause proven: sRGB-encoded draw target)

Continued instrumenting until the mechanism was proven rather than inferred. Each step was a
direct measurement on the program the harness patches:

1. **The guard is not the cause.** Rewriting `if(u_baseColor.a >= 0.0) { outColor=` to an
   unconditional `{ outColor=` left `matchingPixels: 0`.
2. **The appended statement does execute and does win.** Substituting a constant
   `vec4(1.0, 0.0, 1.0, 1.0)` produced `[247,40,228]` across exactly **66,571 px** — the same
   pixel count as the subject region — so the override reaches the framebuffer.
3. **Nothing composites over it.** Substituting `vec4(0.0,0.0,0.0,1.0)` read back as exactly
   `[0,0,0]`, ruling out a later pass or alpha blending.
4. **The draw target sRGB-encodes on write.** Emitting the texture's **alpha** channel — which
   no colour transform touches — wrote `162/255` and read back **209**. sRGB OETF of `162/255`
   is exactly **209**. The same transform explains the RGB case.

So the harness writes the correct raw texel, and the framebuffer re-encodes it before
readback. `matchingPixels` can never exceed 0 while the oracle compares readback bytes against
un-encoded texel bytes.

**The oracle is also internally inconsistent, which corroborates this.** Line 126 applies its
`srgb()` helper only to `sheenColor`. That helper is a linearization, and its output for this
fixture is `[122,231,41]` — precisely the `sheenColor` expectation. Meanwhile the engine
uploads `sheenColor` as `colorSpace: "srgb"` and every other extension slot as `"linear"`
(`packages/engine/src/agent-api/index.ts:13969`), and `WebGL2Device.ts:4067` maps that to
`SRGB8_ALPHA8` vs `RGBA` correctly. The renderer's upload path is right; the oracle's
expectation model is not.

**Correct fix (open work):** the expectation must model the full path — sampler decode for
sRGB-uploaded slots, identity for linear slots, then the draw target's sRGB encode on write —
or the harness must read from a linear target. This is a real evidence defect in
`efe051c0` that has never passed, and it is deliberately **not** being worked around by
loosening the tolerance or lowering the 100-pixel floor.

## Execution log — 2026-09-10 (C1 draw-target transform measured; oracle fix scoped)

Calibrated the draw target directly instead of inferring it. Emitting known constants on the
patched program and reading back the dominant subject colour (66,571 px each time):

| shader writes | reads back |
| --- | --- |
| `vec3(0.25)` | 152 |
| `vec3(0.50)` | 197 |
| `vec3(0.75)` | 216 |
| `vec3(0.0)` | 0 |
| texture alpha `162/255` | 209 |

This rules out several candidates and pins the rest:

- **Not a plain sRGB encode.** OETF predicts 137/188/225; the readback is 152/197/216, and the
  0.75 case reads *below* the prediction, so the curve compresses at the top.
- **Not compositing or blending.** `vec3(0.0)` reads exactly 0.
- **Best fit is ACES filmic tone mapping plus sRGB encode with a small exposure factor**
  (`k ≈ 0.83` reproduces 153/198/217 against the observed 152/197/216). That is consistent
  with `a3dTexturedPbrEncodeOutput` plus the postprocess chain that `qualityProfile:
  "production"` enables, and with the 3-draws-per-pass count for a 3-object scene.

**A second, independent oracle defect was also found.** The renderer reads one specific channel
per extension slot — `clearcoat` `.r`, `clearcoatRoughness` `.g`, `sheenColor` `.rgb`,
`sheenRoughness` `.a`, `iridescence` `.r`, `iridescenceThickness` `.g`, `anisotropy` `.rgb` —
but the harness substitution emits `.rgb` for every slot except `sheenRoughness`, and the
expectation asserts an RGB triple for all of them. So even with a correct transform model the
non-`.rgb` slots would compare the wrong channels.

**Scope of the correct fix (open work).** The oracle must (1) emit and expect the same channel
the renderer actually reads per slot, and (2) avoid asserting on a tone-mapped, exposure-scaled
target — either by rendering the probe to a linear offscreen target or by writing the value
through a path the postprocess chain does not transform. Modelling the tone curve numerically
inside the expectation was tried and rejected: it would encode a fitted constant (`k ≈ 0.83`)
as if it were a contract, which is not evidence.

I reverted my in-progress expectation-model edit rather than leave a partially correct
transform in the tree. The assertion remains failing and unweakened.

## Execution log — 2026-09-10 (C1 oracle fully explained: three independent defects)

The C1 colour oracle is now explained end to end by measurement, with the final gap closed to
one count. Three separate defects compound in it, and none is a renderer fault.

**1. Wrong channel per slot (fixed).** The shader consumes one specific channel per extension
slot — `clearcoat` `.r`, `clearcoatRoughness` `.g`, `sheenColor` `.rgb`, `sheenRoughness` `.a`,
`iridescence` `.r`, `iridescenceThickness` `.g`, `anisotropy` `.rgb` — while the harness emitted
`.rgb` for every slot except `sheenRoughness` and asserted an RGB triple for all of them. The
substitution and the expectation now both use the renderer's channel.

**2. Draw target encodes on write (measured, not inferred).** Writing known constants on the
patched program and reading back the uniform 66,571-pixel subject region:
`vec3(0.0)` -> `0`, `vec3(0.25)` -> `152`, `vec3(0.50)` -> `197`, `vec3(0.75)` -> `216`, and
texture alpha `162/255` -> `209`. Substituting `vec4(1,0,0,1)` proved the branch executes
(pure red across the same 66,571 px). The interior is exactly uniform, so this is a colour
transform on write, not multisample resolve — an earlier resolve-blending hypothesis of mine
was wrong and is discarded.

**3. Wrong sampled texel (root cause of the residual gap).** With the encode bypassed, writing
the raw sampled `.r` read back **215**. sRGB-encoding the assumed texel `184` gives `221`, a
6-count miss. Solving backwards, `215` implies a written byte of ~`172` — and scanning the
fixture shows `r == 172` at texel **(16,12)**, not the `(16,16)` the oracle's formula assumes
(row 16 runs `...170, 177, 184, 191...`, so neighbouring rows are distinguishable). Encoding
`172` gives **214** against the observed **215**: a one-count match, which the existing +/-1
tolerance already accommodates.

So the oracle's `texel` formula does not describe the texel that UV `16.5/32` actually samples.
The correct fix is to derive the expectation from the same coordinate the sampler resolves
(accounting for V orientation) rather than from an independent arithmetic formula, and to keep
the strict +/-1 tolerance.

The channel fix is retained in the tree. The tolerance and the 100-pixel floor were **not**
touched, and the fitted tone-curve approach was rejected earlier for the same reason: a fitted
constant is not a contract.

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

# Aura3D native capabilities — Phase A: code-complete

## 5.0 decision record (owner, 2026-11-02) — supersedes conflicting text below

This program ships as **Aura3D 5.0.0** (major release, full feature scope).
The owner made these decisions to end the re-audit loop; where any later
section, the roadmap, the execution prompt or the acceptance plan conflicts,
this record wins.

1. **Runner: the ACR build path replaces the custody runner.** The signed
   source authority, verified offline toolchains, pinned package-manager
   custody, sealed workspace isolation and post-install custody requirements
   (`SOURCE_IMAGE_UNAVAILABLE` in `tools/remote-acr/Dockerfile.source`,
   `workspace-admission` in `tools/remote-acr/run-source.sh`,
   `MATRIX_SOURCE_PRODUCER_UNAVAILABLE` in
   `tools/native-consumer-matrix/index.ts`) are **dropped as release
   prerequisites**. The 5.0 source pass runs the unchanged §4 command list on
   the image that shipped every 4.x release: serverless ACR Tasks via
   `tools/remote-acr/run.sh` + `Dockerfile.playwright` (hermetic
   `pnpm install --frozen-lockfile` from `pnpm-lock.yaml`), registry
   `picassostagingacr`, one shared build, `KEEP_IMAGE=0`, cost contract and
   ledger entry per the machine policy. Candidate identity = the frozen Git
   commit plus the recorded lockfile and packed-archive SHA-256s. This is a
   process change only; no product requirement is removed. Consumer-matrix
   checks that need the isolated producer run as ordinary packed-consumer
   installs in the same job.
2. **Scope: fixed list, no re-derivation.** [`aura3d-5.0-scope.md`](aura3d-5.0-scope.md)
   labels every partial roadmap task exactly once: **FINISH-5.0** (production
   code still owed), **EXPERIMENTAL-5.0** (opt-in path works with explicit
   fallback; ships labeled experimental, pending browser/GPU/device evidence),
   or **SUPERSEDED-PROCESS** (custody/ledger-granularity work replaced by
   item 1). That list is the 5.0 denominator. Progress = checked-off
   FINISH-5.0 rows. Do not re-audit the tree or add rows without owner
   approval.
3. **Named defects that must be fixed for 5.0** (also rows in the scope list):
   WebGPU teardown failures (last full run 26 pass / 32 fail); native
   reversed and logarithmic depth; native WebGPU wetness; the alpha-cutoff and
   bitmap-orientation test conflicts (resolved against the spec: glTF
   `alphaCutoff` has no maximum, so the case now asserts a negative cutoff is
   rejected; the `ImageBitmap` mock now carries dimensions — no assertion was
   weakened); the
   mini-game `Textures/colormap.png` sidecar + digest and the
   `skylineParkourRunnerMeshy` manifest/file/provenance conflict; the
   production-path benchmark that imports another 3D engine
   (`tools/production-path-benchmark/index.ts`); the 4.x → 5.0 migration
   guide (`docs/migration/4-to-5.md`).
   **Teardown contract (decided 2026-11-02):** 5.0 keeps the strict WebGPU
   retirement contract — a device, target, buffer or lane is complete only
   after its retirement fence resolves, and a failed dispose stays pending
   until `dispose()` is called again. The 40 failing teardown checks (121
   passing) all asserted completion while a fence was pending; no product
   defect was found. They are updated to assert pending → resolve fence →
   complete/destroyed-once. Two synchronous cases (lane with no outstanding
   resources; never-submitted target textures) complete without a fence.
4. **Order of work, run once:**
   - **a. Snapshot:** done — branch `native/5.0`, commit `26eae82e2`
     (the uncommitted tree as of 2026-11-02), then merge of `origin/main`
     (4.7.2–4.7.10 shipped fixes).
   - **b. Fix + one full remote source pass:** close FINISH-5.0 rows and the
     named defects; run the §4 command list once on ACR; fix real failures;
     rerun only affected checks. Pre-existing unrelated failures are recorded,
     not chased.
   - **c. Freeze + acceptance:** commit the freeze, emit
     `tests/reports/native-capabilities/code-complete-go.json` against the
     scope list (§5), then run the [acceptance plan](aura3d-native-acceptance.md)
     once on ACR.
   - **Release prep (before freeze):** apply the published deprecation
     policy — remove the 42 root names and 10 legacy subpaths scheduled for
     removal in 5.0.0 (list in `docs/migration/4-to-5.md` "verify"), or record
     an owner deferral; widen `@aura3d/react`'s `@aura3d/engine` peer to
     `^5.0.0`; bump every manifest (incl. `@aura3d/addons`, at 4.7.1) with
     `tools/release/prepare-version.mjs 5.0.0`; regenerate
     `docs/api/public-api.md` (`pnpm verify:api-docs --write`); replace the
     hard-fail custody line in `package.json` `check:release`. Re-pin `antique-camera.glb` to the official Khronos digest (`ae8969…`, 17.5 MB, `fixtures/asset-corpus/khronos-sources.json`) in `tests/assets/corpus/gltf-corpus.manifest.json`, `benchmarks/quality-rebuild/shared/assets.ts` and the `templates/production-*` manifests (they pin an unknown 32 MB `7480f9…`).
   - **d. Release:** publish 5.0.0 to npm (deprecating prior versions), tag,
     GitHub release, deploy `aura3d` and `aura3d-wonder-world` to Cloudflare
     Pages, verify live URLs and rollback.

---

**Status:** implementation instructions. This document does not declare code complete and does not authorize an acceptance run.

**Current provisional source review:** The [current saved audit](aura3d-native-current-audit-2026-11-02.md) estimates **784/1,014 granular source-side subrequirements present (~77%), 183 partial, 43 missing, and 4 unknown**. It corrects the previously reported **785 present / 182 partial** by reclassifying one item; no completion credit is assigned to partials. Its earlier **53/192 task rows** and **912/1,864 source-related ledger rows** count only fully source-implemented historical rows; they use different units and omit partial work. Current task and source classifications are not fresh verified gate data.

**Phase state:** Code is **not code-complete**: no complete candidate-bound source report, freeze, or `CODE_COMPLETE_GO` exists; acceptance is **locked and unrun for a complete candidate**. Resume only outstanding existing roadmap tasks. Preserve existing test files and coverage; add no tests or tasks, even where older instructions suggest otherwise, and do not weaken checks or gate requirements.

## Handoff: Current Worktree

**The current working tree, including untracked files, is the handoff.** Do
not reset, clean, repack, overwrite, or discard existing work. The roadmap
retains its original 33 work packages and 192 task rows. The 784/1,014
source-only review above predates subsequent changes; it is not a current
overall or verified completion percentage.

**Agent status:** The previously running visibility, asset and WebGPU lifecycle
agents have finished. Their edits remain in the working tree; no agent work
was committed. The lifecycle agent's final change is recorded below.

### Recent source work

- **Native drawing:** Eligible untextured physical HDR roots can use meshlet
  culling through the guarded deferred pass. Explicit one- and four-sample HDR
  targets support cancellable shared-pipeline prewarm. Eligible single-sample
  `rgba16f` roots can also use visibility-ID rasterization and the physical
  global-probe resolve. The older audit and handoff descriptions that say all
  such root routes fall back are stale. Default four-sample visibility, textures,
  transparency, unsupported lighting/features and other rejected cases still
  fall back. These changes are in `packages/rendering/src/Renderer.ts` and
  `packages/rendering/src/webgpu/{DeferredPipeline,MeshletPipeline,VisibilityBufferPipeline}.ts`.
  Focused existing checks, offline mock probes and focused typechecks passed;
  real GPU, WGSL and browser execution have not been performed.
- **WebGPU ownership:** Separate wrappers borrowing the same native device now
  hold distinct canvas-owner tokens, so an older wrapper cannot unconfigure a
  newer wrapper's canvas. An exclusive reservation also remains held if its
  canvas cannot be unconfigured, until cleanup can be retried. See
  `packages/rendering/src/WebGPUDevice.ts`. Mock ownership and retirement
  checks passed. The last full teardown run had 26 passes and 32 failures;
  three selected failures still expect completion while a fence is pending.
  The remaining failures were not all classified.
- **Reentrant queue retirement:** `packages/rendering/src/webgpu/ResourceInterop.ts`
  now delays retirement fences until the outermost queue submission returns or
  throws, and revalidates resource access after reentrant getters. This fixes
  a mock-reproduced case where disposal could destroy a buffer before its
  submission reached the queue. The existing interop suite passed 18/18;
  related selected checks had 27 passes and one failure, and selected teardown
  checks had two passes and five failures. The failures expect ownership to
  clear while a fence is pending; other teardown failures remain unclassified.
  Eleven offline regression probes and a focused typecheck passed. These are
  mock results, not real GPU evidence, and do not cover arbitrary direct queue
  submissions.
- **Decoder aborts:** Basis and Draco initialization callbacks handle
  unprintable abort values without leaving initialization pending, and redact
  sensitive diagnostic text. See `packages/assets/src/decoderLoad.ts`,
  `KTX2BasisTextureTranscoder.ts` and `AssetDecoderRegistry.ts`. Offline
  hostile-value probes, one selected existing Basis abort check, and focused
  typechecks passed; the selected test run skipped 48 other cases.
- **Mini-game metadata:** Both template mirrors now declare the star and key
  GLBs' `Textures/colormap.png` dependency. The matching texture and verified
  digest are still missing; this metadata change does not fix loading. An
  existing dependency check reported 18 errors for nine GLBs across seven
  templates. The skyline runner file, manifest hash and provenance also
  conflict; do not substitute a similarly named asset or invent its identity.

### Known blockers to the full roadmap release

1. The source image deliberately stops with `SOURCE_IMAGE_UNAVAILABLE` in
   `tools/remote-acr/Dockerfile.source`: verified offline toolchains, signed
   source/archive authority, pinned package-manager custody, enforced workspace
   isolation and post-install custody are not configured. The installed
   consumer matrix deliberately stops with
   `MATRIX_SOURCE_PRODUCER_UNAVAILABLE` in
   `tools/native-consumer-matrix/index.ts`. **5.0: no longer a blocker** —
   superseded by decision record item 1 (ACR 4.x path). The guards stay in
   place; they are simply not on the 5.0 release path.
2. Finish remaining required production behavior, including native
   reversed/logarithmic depth and WebGPU wetness. Existing explicit fallback
   is not native support. Reconcile all other roadmap findings against current
   source; do not assume a stale audit finding is still open or already fixed.
3. Resolve real lifecycle failures and the existing camera fallback,
   alpha-cutoff and bitmap expectation conflicts without weakening or changing
   tests to obtain a pass. Treat the 32 teardown failures above as the last
   full run, not as a fresh classification of the current tree.
4. Resolve missing template sidecars/digests and independent source/asset
   provenance. The current example-catalog expectation inventory covers nine
   of 20 templates; full catalog coverage is not established. Confirm with the
   responsible owners whether two credentials previously exposed in logs have
   been rotated; do not reproduce their values.
5. Run the required existing source, build, packaging, API and isolated
   consumer checks once against the exact candidate, including its untracked
   inputs. No full candidate-bound source report, tested archive set, freeze
   commit or `CODE_COMPLETE_GO` exists.
6. Only after the source gate and separate authorization, run the applicable
   remote browser, visual, performance, GPU/device and other acceptance checks.
   Record unavailable hardware and constrain support claims; do not report
   mocks, skipped checks or software rendering as physical-device passes.
   An authorized release or Cloudflare deployment and rollback verification
   are separate from source completion and have not been performed here.

Consult `GOAL_AURA3D_NATIVE_CAPABILITY_HANDOFF.md`,
`docs/prds/aura3d-native-current-audit-2026-11-02.{md,json}`, the roadmap,
ledger and execution prompt for detailed historical evidence. Those files
contain older snapshots and may lag the recent source work described here.

**Product scope:** [Native capability roadmap](aura3d-native-capability-roadmap.md).

**Execution entrypoint:** [Native capability execution prompt](aura3d-native-capability-execution-prompt.md).

**Next phase, locked until the global gate passes:** [Acceptance plan](aura3d-native-acceptance.md).

## 1. Global phase boundary

Complete every required production path, public integration, source test, contract, build and packed source-consumer check in the current roadmap before starting acceptance. Priority controls implementation order; it does not remove lower-priority requirements from this phase.

The only transition is a verified, committed **CODE_COMPLETE_GO** candidate covering the entire required implementation scope. Completing one work package, feature family or backend does not unlock acceptance. Neither a promising prototype nor a partial milestone qualifies.

Before that transition, do not run browser automation, screenshots, visual judging, rendered performance collection, live GPU/device probes, XR sessions, runtime network capture, deployed-route checks, release certification or publication acceptance. Do not start such runs under labels such as smoke test, early validation, readiness probe or evidence collection.

Build the source of those harnesses, specifications and evidence tools during Phase A. Typecheck and unit-test their pure logic without starting a browser or device session. Their source must be ready when implementation completes; their runtime results belong to Phase B.

| Work | Phase A disposition |
| --- | --- |
| Production renderer, assets, math, animation, input, editor, framework adapters and public APIs | Implement completely, including required options and lifecycle behavior. |
| Source unit/contract tests, CPU numerical references and browser-shaped mocks | Run when they do not launch a browser, live device or deployed service. Label mock evidence accurately. |
| Builds, packaging, declarations, API comparison, source dependency/provenance analysis and tree-shaking | Run through the approved source job, with current candidate identity. |
| Isolated Node imports, CLI execution, SSR and source-only packed consumers | Run when the command has no hidden browser/device acceptance stage. |
| Browser specs, visual fixtures, performance probes, device matrices and result analyzers | Implement, compile and source-test their logic; leave execution cells not-run. |
| Browser rendering, image capture, rendered timings, hardware/XR receipts and runtime traffic observations | Defer to Phase B after the global gate. |
| Public support promotion, deployment receipts, certification and publication | Defer to Phase B and require the applicable session authorization. |

## 2. Establish scope, ownership and dependencies

Read the repository instructions, canonical policy, parallelism reference, remote-execution reference and CI-selection reference. Read the roadmap and execution prompt in full. Apply domain references only when their triggers occur.

Record branch, commit, package versions and existing user changes. Preserve unrelated edits and untracked files. The current checkout is the implementation starting point; the roadmap baseline describes the earlier audit.

Parse all current gap IDs, work packages, file actions, contracts and coverage checklist items. Do not hardcode a previous count. Expand broad items into distinct observable production outcomes and keep a stable denominator for code-completion reporting.

Use `docs/prds/aura3d-native-capability-ledger.json` through its sole owner. Each source outcome needs an owner, exact files/symbols, public entrypoint, inputs/options, dependencies, source tests and implementation status. Track acceptance status separately, initially not-run.

Launch parallel agents for independent file sets. Preserve the roadmap's sole owners for shared public types, manifests, exports, generated maps, ledger and execution infrastructure. Send exact integration requests to those owners; do not edit their files concurrently.

Run eligible work immediately when its actual dependencies exist. The main implementation waves are:

1. Scope, file ownership and public/resource/request contracts.
2. Confirmed correctness defects, independent source replacements and lifecycle isolation.
3. Backend, shader/material, asset/format, geometry, animation, input and other feature implementations.
4. Root/package integration, workers, adapters, editor, examples, documentation and distribution.
5. Complete source validation, packed consumer checks, one bounded defect review and the global freeze.

The parent integrates and checks child results while independent lanes continue. Keep healthy agents running across compaction and resume from verified checkpoints. Do not treat an agent's completion message alone as passing source evidence.

## 3. Implement the entire production scope

Follow every exact file action and detailed task in the roadmap. Add a newly necessary path only after registering its action, owner, requirement and source check. Preserve working behavior; correct stale implementation assumptions without shrinking the desired outcome.

Implement the real path from public API through runtime validation, compiler/adapter, backend/resources and disposal. A required feature cannot be completed by a stub, no-op, unconditional rejection, parser-only result or internal class that consumers cannot reach.

Keep experimental support labels where browser or device evidence is still absent. The corresponding required implementation must nevertheless be functional through its explicit opt-in before code freeze. Hardware unavailability cannot justify an absent production path.

Use independently authored Aura3D implementations and permitted open standards/codecs. Do not install, import, wrap, copy, bundle or fetch another 3D engine's implementation, shaders, data or assets. Preserve notices until the attributed material is actually independently replaced; retain equivalent behavior coverage when replacing fixtures.

Inspect the dependency graph before any new workspace installation. Remove prohibited dependencies and replace affected source/test fixtures before a required-profile install would retrieve them. Preserve the independent frozen lock and package boundaries.

Read-only registry metadata, independent dependency retrieval and verified prior Aura3D declaration downloads needed by source/package checks are permitted source work. They do not authorize runtime traffic capture, deployed-product probing or acceptance against an external service.

Complete the source of all acceptance tooling in this phase: browser project selection, test discovery checks, fixture staging, artifact transport, candidate verification, result parsing, performance analysis and device labeling. Source-test failure propagation, missing results, unavailable devices and false hardware labels with synthetic inputs. Do not generate fabricated runtime receipts.

The source/browser entrypoints must enforce the phase boundary. The source runner produces source reports; the browser/acceptance launcher validates the global gate before provisioning or executing an acceptance job. A missing, stale, incomplete or mismatched gate is a hard refusal to start acceptance.

## 4. Source verification and remote execution

Quick targeted source checks may run locally only when policy permits their actual resource use. Run full suites, large checks, builds, package consumers, code generation and dependency scans on approved serverless remote infrastructure. Never use local Docker, local browser suites, GitHub Actions, standing runners or an agent pool.

**5.0 runner (decision record item 1):** run the source pass on the 4.x ACR path — `tools/remote-acr/run-source5.sh` builds the same `Dockerfile.playwright` image once from the committed candidate (`git ls-files` tree, LFS content included, SHA-256 manifest), runs `tools/remote-acr/source5-run.sh` via `task.source5.yaml` once per stage — `static`, `unit-1..6-of-6` (vitest shards; `test:parity` is inside `tests/unit`), `suites`, `packed-a`, `packed-b` — each `az acr run` capped at `--timeout 1800` and at most 2 concurrent (ACR policy). Both packed stages rebuild and repack; the launcher fails the pass if their archive digests differ. Every command's exit code is recorded; the merged report is `tests/reports/native-5/<run-id>/source-report.json`; the image is deleted afterwards. `tools/remote-acr/run-source.sh`, `Dockerfile.source` and the custody admission are no longer prerequisites and may stay as-is; do not spend 5.0 time making them executable.

~~~sh
RUN_ID=native-5-source-001 tools/remote-acr/run-source5.sh   # KEEP_IMAGE=0, NATIVE_RELEASE_KIND=major by default
~~~

Use a unique run ID. The job sets `NATIVE_RUN_ID`, `NATIVE_REPORT_DIR`, `NATIVE_RELEASE_KIND` and `AURA3D_SOURCE_MANIFEST` (a file list with SHA-256s of the staged context). The context is the committed candidate; exclude host credentials, dependency trees, private Git configuration and stale distribution output.

Source identity is the candidate commit SHA recorded with the staged-file manifest and lockfile digest. Missing, changed or undeclared required inputs fail. Inspect aggregate commands for hidden browser work and drop the browser stage from them in this job.

Run source checks, then a fresh build/pack, then packed integration/consumer checks in this order:

~~~sh
pnpm typecheck
pnpm lint
pnpm resolution:check
pnpm test:parity
pnpm test:unit
pnpm exec vitest run tests/assets tests/qr
pnpm test:packages
node --test tools/release/*.test.mjs
pnpm build
node tools/release/publish-all.mjs --pack-only --out-plan "$NATIVE_REPORT_DIR/candidate-plan.json"
pnpm exec tsx --tsconfig tsconfig.base.json tools/public-surface-diff/prepare-baseline.ts --candidate-plan "$NATIVE_REPORT_DIR/candidate-plan.json" --out "$NATIVE_REPORT_DIR/baseline-manifest.json"
pnpm test:integration
pnpm test:packages:dist
pnpm exec tsc -p tsconfig.browser-tests.json --noEmit
pnpm verify:exports
pnpm verify:imports
pnpm check:tarballs
pnpm exec tsx --tsconfig tsconfig.base.json tools/package-clean-install/index.ts --phase source --run-id "$NATIVE_RUN_ID"
pnpm exec tsx --tsconfig tsconfig.base.json tools/installed-tree-shaking/index.ts --source-report "tests/reports/native-consumers/$NATIVE_RUN_ID/source.json"
pnpm check:bundle-size
pnpm exec tsx --tsconfig tsconfig.base.json tools/public-surface-diff/index.ts --baseline-manifest "$NATIVE_REPORT_DIR/baseline-manifest.json" --candidate-plan "$NATIVE_REPORT_DIR/candidate-plan.json" --release-kind "$NATIVE_RELEASE_KIND" --out "$NATIVE_REPORT_DIR/api-diff.json"
pnpm exec tsx --tsconfig tsconfig.base.json tools/public-api-contract/index.ts --candidate-plan "$NATIVE_REPORT_DIR/candidate-plan.json"
pnpm exec tsx --tsconfig tsconfig.base.json tools/native-consumer-matrix/index.ts --phase source --run-id "$NATIVE_RUN_ID"
pnpm exec tsx --tsconfig tsconfig.base.json tools/native-runtime-audit/index.ts --phase source
~~~

After the pack step, the runner sets `A3D_RELEASE_PLAN` to the validated candidate plan for existing consumers; new tools can accept the plan explicitly. API-baseline preparation verifies the previous supported Aura3D archives and reads bounded declarations without installing or executing the historical runtime.

Retain separate `source.json` and `matrix-source.json` reports under `tests/reports/native-consumers/<run-id>/`. Matrix projects must include the candidate input and controls packages used by the cross-browser harness, along with their validated internal dependency closure. Use the roadmap's versioned report schema with source/lock/archive/project digests, tool versions, command results and logs. Browser outcomes remain not-run.

Tree-shaking consumes the current passing source-consumer report. When invoking the aggregate `pnpm check:release`, set `NATIVE_CONSUMER_SOURCE_REPORT` to that explicit `source.json` path and `A3D_RELEASE_PLAN` to its candidate plan; the standalone `--source-report` argument takes precedence. Both paths receive the same candidate and project validation. No source gate may require a browser receipt. Source tests cover performance budgets, workload definitions and report analysis; they do not collect rendered timings.

Verify every required suite was discovered and every expected command has an actual exit result. Missing output, empty test selection, skipped required checks and stale reports fail. Correct real source defects and rerun affected checks without weakening assertions or raising budgets.

Use the exact candidate archives throughout. A tool that rebuilds or repacks must prove that the recorded payload digests still match; otherwise create a new candidate and rerun affected checks. A successful upload or remote infrastructure command is not a successful source test.

## 5. Global CODE_COMPLETE_GO record

After every required source outcome is implemented and verified, perform one bounded defect review. Fix confirmed required implementation defects. Do not start an open-ended adversarial or evidence-receipt loop.

Commit only the task-owned implementation, tests, contracts and source documentation. Exclude unrelated user changes. Record the resulting immutable commit and bind the already tested, unchanged implementation-input digest and archive hashes to it explicitly. A different implementation input requires the relevant source checks again.

Only then produce `tests/reports/native-capabilities/code-complete-go.json`. This is a generated runtime artifact for future execution; do not create a success record while merely editing these plans.

The record must carry at least:

- `schema: "aura3d.native-code-complete/1"`, `status: "CODE_COMPLETE_GO"`, timestamp and responsible integration owner.
- Frozen commit identity and the verified binding from the tested source snapshot to that commit.
- Immutable required-source-outcome snapshot and its digest, including all current roadmap work packages.
- Immutable implementation/staging-manifest digest, lockfile digest and every candidate package/archive digest.
- Passing source report identities and digests, expected command/test inventory and observed results.
- Required source-outcome IDs and completed IDs, and expected check IDs and passing check IDs, with exact set equality for each pair; equal counts alone are insufficient. **For 5.0 the required source-outcome set is the FINISH-5.0 and named-defect rows of [`aura3d-5.0-scope.md`](aura3d-5.0-scope.md)**; EXPERIMENTAL-5.0 rows must be listed with their experimental label and fallback, and SUPERSEDED-PROCESS rows are listed as superseded. The 1,901-row ledger remains historical reference, not the gate denominator.
- Zero unresolved required production defects, zero unowned/untriaged source outcomes and zero missing required source checks.
- Explicit statement that browser/device/live acceptance is not-run and has not been used to qualify source completion.

The validator recomputes required identities and checks the complete report set before allowing Phase B. A filename, commit message, percentage, manually checked ledger or matching marker text alone does not open the gate.

WP-20 implements `tools/native-capability-gate/index.mjs` and its source tests. The following emission interface is a future requirement; invoke it only after the real source completion and freeze above. The reports manifest enumerates every required check and its passing artifact, with no silent exemptions:

~~~sh
node tools/native-capability-gate/index.mjs --phase code-complete --source-manifest "$AURA3D_SOURCE_MANIFEST" --source-reports "$NATIVE_REPORT_DIR/source-reports.json" --scope docs/prds/aura3d-5.0-scope.md --ledger docs/prds/aura3d-native-capability-ledger.json --freeze-commit "$NATIVE_FREEZE_COMMIT" --out tests/reports/native-capabilities/code-complete-go.json
~~~

`NATIVE_FREEZE_COMMIT` must be the actual committed candidate; the checker validates the unchanged tested snapshot binding. It must reject incomplete requirements, mismatched input/archive hashes, missing checks and an uncommitted or different implementation. It must never emit a success record merely because the command was requested.

Mutable acceptance notes remain outside the immutable implementation input set under a reviewed rule. Updating evidence must not silently change code identity or overwrite earlier candidate results. A product edit after freeze invalidates the candidate for new acceptance until its affected source checks pass and a new global record is issued.

## 6. Phase A exit checklist

For 5.0, "roadmap source outcome" below means a FINISH-5.0 or named-defect row of [`aura3d-5.0-scope.md`](aura3d-5.0-scope.md); EXPERIMENTAL-5.0 rows need a working opt-in path, explicit fallback and an experimental label in `docs/project/support-policy.md` / the support matrix.

- [x] Snapshot committed (`native/5.0` @ `26eae82e2`).
- [ ] `origin/main` 4.7.10 merged into `native/5.0` (in progress: 31 conflicted files).
- [ ] Every FINISH-5.0 row and named defect closed; EXPERIMENTAL-5.0 rows labeled.
- [ ] 4.x → 5.0 migration guide written and linked from the README and changelog.
- [ ] Every current roadmap source outcome has an owner, implemented production path and matching source tests; all lower-priority work remains included.
- [ ] Confirmed defects have meaningful regression coverage and corrected behavior; no required implementation is deferred to acceptance.
- [ ] Public types, runtime schemas, compiler lowering, serialization, exports, generated maps and package metadata agree.
- [ ] Independent replacements, dependency removal and fixture provenance are complete without lost behavior coverage or prematurely removed notices.
- [ ] Browser/visual/device/performance tooling is fully implemented and source-tested without executing its acceptance workloads.
- [ ] Required source, contract, build, package, API, bundle and isolated source-consumer checks pass for the exact candidate.
- [ ] All expected checks ran; missing, skipped or stale results cannot count as passing evidence.
- [ ] The code-complete numerator equals the complete required source-outcome denominator; no per-work-package substitute gate exists.
- [ ] A bounded defect review is complete, required product defects are fixed and unrelated user edits remain preserved.
- [ ] The implementation commit, tested snapshot, frozen lock, candidate archives and retained source reports have a verified identity binding.
- [ ] The generated global gate record is valid and Phase B can independently validate it before any acceptance job starts.
- [ ] Task-created temporary source-job resources are cleaned up; required logs and reports remain available.

Until every exit item passes, continue implementation and source correction. Do not start acceptance to investigate unfinished production behavior. Report code-completion progress using required functional outcomes, never receipt counts.

Missing physical devices, screenshots, rendered timing samples or publication receipts do not block Phase A. Keep them pending in the acceptance plan. Once the global record passes, hand the frozen candidate and reports to Phase B; the record itself makes no browser, hardware or release claim.

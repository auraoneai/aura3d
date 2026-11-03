# Handoff goal: complete the Aura3D native capability roadmap

Paste the goal below into the next agent's goal workflow. Give that agent the current Aura3D working tree, **including all modified and untracked files**, rather than only the latest commit. This document is a portable goal; it does not start or change a goal in another session.

---

**Goal:** Resume and complete the Aura3D native capability roadmap in `/Users/gurbakshchahal/platforms/aura3d`. Read [the current source audit](docs/prds/aura3d-native-current-audit-2026-11-02.md) first, followed by `PROMPT_EXECUTE_COMPETITIVE_REDESIGN_PRD.md`, `docs/prds/aura3d-native-capability-execution-prompt.md`, the roadmap, both phase documents, the existing ledger, and the older saved audit checkpoint before changing anything. Preserve the extensive uncommitted work and continue from the current state; do not reset, clean, or restart completed work. Follow the repository's `AGENTS.md` and applicable policies. Build Aura3D-owned functionality without installing, copying, wrapping, or importing another 3D engine's implementation or assets.

**Last provisional source review:** The [saved audit](docs/prds/aura3d-native-current-audit-2026-11-02.md) estimated **784/1,014 granular source-side subrequirements present (~77%), 183 partial, 43 missing, and 4 unknown** before subsequent source changes; it has not been recounted. It corrects the previously reported **785 present / 182 partial** by reclassifying one item; no completion credit is assigned to partials. Its earlier **53/192 task rows** and **912/1,864 source-related ledger rows** count only fully source-implemented historical rows; they use different units and omit partial work. These classifications are not fresh verified gate data.

**Phase state:** Code is **not code-complete**: no complete candidate-bound source report, freeze, or `CODE_COMPLETE_GO` exists; acceptance is **locked and unrun for a complete candidate**. Resume only outstanding existing roadmap tasks. Preserve existing test files and coverage; add no tests or tasks, even where older instructions suggest otherwise, and do not weaken checks or gate requirements.

Reconcile the current source audit and older checkpoint against the actual current source and the full roadmap. The audit has provisional reviewer findings for all 33 work packages and 1,901 ledger IDs; those classifications are not proof of completion and are not a full test run. Establish a content-hashed snapshot that includes intended untracked files, verify public paths and bundled requirements, update the existing ledger, and report actual implemented, partial, missing, unknown, and source-tested counts with their denominators. Do not treat a sample as the whole project or a missing global freeze as zero code written.

Complete the remaining production code and integration across every required work package using parallel agents with disjoint ownership. Fix the source-runner admission and offline-store blockers according to the roadmap; do not bypass release checks or fabricate evidence. Run the entire applicable source-test and contract inventory remotely on the identified source snapshot, including app and tooling tests outside the planned native-runner matrix. Record expected and executed files, commands, failures, skips, exit codes, and artifact identities; fix real defects and rerun affected tests. The full current-state source suite has not yet run.

Complete all required production paths, source tests, generated contracts, package checks, and one bounded defect review. Then commit and freeze the actual candidate and produce a valid `CODE_COMPLETE_GO` record bound to its source and artifacts. **Only after that global gate** run remote browser, screenshot, visual, performance, device, and other authorized acceptance work under the separate acceptance plan. Report source completion and acceptance independently, including any unavailable coverage. Follow remote-execution policy, preserve dependency and provenance boundaries, and observe any applicable human gate for paid resources or shared credential rotation.

**Starting checkpoint:** The current source audit linked above is primary; the older saved checkpoint is `docs/prds/aura3d-native-source-audit-checkpoint-2026-11-01.json`, and the existing ledger is `docs/prds/aura3d-native-capability-ledger.json`. Source-runner admission was blocked in the saved audit. `tests/fixtures/native-examples-catalog/expectations.json` exists but contains expectations for only 9 of 20 templates. No complete candidate-bound source-suite report or global `CODE_COMPLETE_GO` exists. The recorded HEAD does not identify the uncommitted source; revalidate everything against the transferred working tree. A prior diagnostic exposed a service API key and a messaging token in tool output; rotation through their normal owners is outstanding. Never reproduce the values.

**Recent continuation:** The audit and ledger record focused source work on
WebGPU loss receipts, Draco and KTX2 cleanup, verified splat dependency
snapshots, glTF material capability reporting, and camera view/projection
handling. These are mutable-tree results, not candidate-wide verification.
The existing WebGPU pending-fence failure, glTF support-matrix expectation
mismatch and camera fallback assertion conflicts remain visible. The source
runner and installed-consumer matrix still fail closed on custody/isolation;
browser, device and live acceptance have not run.

**Latest continuation:** WebGPU now preserves a valid decoded compressed
fallback across metadata-only changes, while rejecting stale content updates.
Aborted Basis initialization now drains late factory owners before the
registry's disposal barrier completes and waits for factory readiness before
publishing. The default glTF raster decoder now uses existing browser-image
byte/dimension limits; KTX2 input limits also apply during reads. Two selected
test runs were suspended without results, while focused typechecks and offline
probes passed. Focused checks and limitations are recorded in the audit and
ledger; no GPU/browser acceptance is implied. The source-runner trust anchor,
isolated toolchains and consumer producer remain unavailable. The last
provisional 784/1,014 source estimate has not been recounted.

**Current continuation:** Bounded custom glTF image decoding now applies the
stricter document/request byte limit before handing the decoder a snapshot;
uncapped custom decoding retains its prior no-prefetch behavior. Two existing
cache/integrity checks, focused source probes and a two-root typecheck passed.
Externally referenced in-memory image bytes are copied before hashing, so
later source mutation cannot change the verified bytes delivered for decoding.
Custom decoder selection is snapshotted across asynchronous acquisition, and
pre-dispatch cancellation suppresses the decoder; late results are closed.
Nested transcoder and worker-asset settings are also snapshotted and included
in the hashed cache identity; caller-owned pool behavior remains unverified.
FileLoader now captures per-request response type/MIME, and detached error
observer failures are contained in FileLoader, ImageBitmapLoader and
DataTextureLoader. Direct probes and focused typechecks passed. One existing
bitmap orientation test fails because its mock has no dimensions; it remains
unchanged, as do the earlier teardown expectation conflicts.
Native GPU-sort now retains scratch and caller-buffer custody after ambiguous
submission failures, exposing a release receipt and deferring reentrant
disposal fencing until submission returns. Mock probes, five focused existing
sorter checks and a typecheck passed. Failed scratch cleanup remains owned
and retryable after a fence or confirmed loss; pre-submit cleanup failure and
physical GPU behavior remain unverified.
The existing G01 ledger row now names its implementation, public entrypoint
and focused check; four boundary checks and the selected live-ledger schema
check passed on the mutable tree. The required candidate-bound check remains
not-run.
Current mock probes also supersede the old claim that a borrowed-device
lifecycle releases while its fence is pending; conflicting older assertions
remain. Meshlet/visibility root support still falls back for environment
lighting and physical materials. The source gate and acceptance remain closed.

**Most recent continuation:** Frame-camera projection/inverse and culling
now use captured camera state rather than later collection mutations. Worker
error reporting contains unprintable and revoked-proxy values, glTF accepts
valid non-negative alpha cutoffs above one, and the public-surface comparator
handles conditional null blockers and exact/overlapping wildcard precedence.
The audit records focused existing checks and offline probes. Two existing
camera fallback assertions and one alpha-cutoff assertion conflict with current
source and remain unchanged. Baseline provenance/freshness, the complete
next-major migration record, source-runner custody/isolation, real-device
checks and candidate-bound verification remain open; no gate was issued.
The mini-game manifests now disclose the star and key texture dependency, but
the matching sidecar and digest are still absent; the conflicting skyline
runner identity remains unresolved and was not guessed.
Basis and Draco abort callbacks now tolerate unprintable values; the existing
Basis abort case and offline hostile-value probes pass. Borrowed WebGPU
wrappers now use distinct canvas-owner tokens; focused mock checks pass, while
the existing teardown file remains at 26 passed / 32 failed. These are not
real-device or candidate-bound results.
Eligible untextured physical HDR roots now route meshlet culling through the
existing guarded deferred pass; unsupported features still fall back.
Explicit HDR targets now prewarm the shared meshlet path with cancellable
ownership; unknown target identities are not prewarmed. Visibility integration
remains incomplete. Focused source/mocks pass, with three pre-existing
retirement assertion failures; GPU/WGSL and browser validation were not run.

**Completion evidence:** A candidate-bound source and package report covering every required outcome and the complete applicable test inventory; a valid code-complete freeze; and the separate acceptance report for that same candidate. Keep progress updates factual and continue until those requirements are met or an applicable policy requires a human action.

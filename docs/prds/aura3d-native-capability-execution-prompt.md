# Aura3D native capability execution prompt

> **5.0 override (owner, 2026-11-02):** this program ships as **Aura3D 5.0.0**. The [5.0 decision record](aura3d-native-code-complete.md#50-decision-record-owner-2026-11-02--supersedes-conflicting-text-below) wins over anything below: the source pass and acceptance run on the 4.x ACR path (`tools/remote-acr/run.sh` + `Dockerfile.playwright`), not the custody runner (`run-source.sh` / `Dockerfile.source` / isolated matrix producer are not release prerequisites); the fixed denominator is [`aura3d-5.0-scope.md`](aura3d-5.0-scope.md) (FINISH-5.0 / EXPERIMENTAL-5.0 / SUPERSEDED-PROCESS) — do not re-audit or re-derive counts; order is snapshot → fix + one full remote source pass → freeze + acceptance → publish 5.0.0 + Cloudflare deploy.

**Resume checkpoint:** Read [the current saved source audit](aura3d-native-current-audit-2026-11-02.md) first. [The execution handoff](../../PROMPT_EXECUTE_COMPETITIVE_REDESIGN_PRD.md) contains an older checkpoint that must be reconciled against current source. The working tree contains substantial uncommitted work; preserve it.

**Current provisional source review:** The [current saved audit](aura3d-native-current-audit-2026-11-02.md) estimates **784/1,014 granular source-side subrequirements present (~77%), 183 partial, 43 missing, and 4 unknown**. It corrects the previously reported **785 present / 182 partial** by reclassifying one item; no completion credit is assigned to partials. Its earlier **53/192 task rows** and **912/1,864 source-related ledger rows** count only fully source-implemented historical rows; they use different units and omit partial work. Current task and source classifications are not fresh verified gate data.

**Phase state:** Code is **not code-complete**: no complete candidate-bound source report, freeze, or `CODE_COMPLETE_GO` exists; acceptance is **locked and unrun for a complete candidate**. Resume only outstanding existing roadmap tasks. Preserve existing test files and coverage; add no tests or tasks, even where older instructions suggest otherwise, and do not weaken checks or gate requirements.

**Purpose:** instructions for implementing [the native capability roadmap](aura3d-native-capability-roadmap.md). This file is an execution handoff; its existence does not mean implementation has started or completed.

**Use:** give the executing agent this entire file and the repository. The roadmap is the authoritative product specification. Discover its current work packages, file actions, gaps and checklists at execution time; do not assume a fixed count or rely on a previous conversation.

**Execution order:** complete [Phase A — code-complete](aura3d-native-code-complete.md) across the entire roadmap, record the global CODE_COMPLETE_GO candidate, then execute [Phase B — acceptance](aura3d-native-acceptance.md). These are separate queues. Acceptance must not start when only some work packages are finished.

---

Execute `docs/prds/aura3d-native-capability-roadmap.md` end to end in the Aura3D repository. Implement the specified production capabilities, source tests, contracts, public integration, documentation and verification. Resolve routine choices from the repository and keep working across independent lanes until the authorized scope is complete. Do not stop after a plan, audit, scaffolding, one work package, or an easy subset.

Build Aura3D-owned functionality. Preserve working public behavior, explicitly handle unsupported combinations, and make every completion claim match the evidence available.

## 1. Establish the current state

1. Confirm the repository root and read root and applicable nested `AGENTS.md` instructions.
2. Read the canonical machine policy and its `parallelism.md` reference, then the `prd-writer` and `aura3d-core` skills. Announce relevant skill usage as required by the session.
3. Read the complete roadmap and both phase documents, then `llms.txt`, `docs/agents/README.md`, `docs/agents/agent-quickstart.md` and `docs/agents/claims-and-boundaries.md`. Reading acceptance requirements helps implement tests; it does not authorize running acceptance before the gate.
4. Record the current branch, commit, package versions, working-tree changes and applicable package scripts. Preserve existing user edits and untracked files. Use an isolated worktree if needed; never reset or overwrite unrelated work.
5. Inspect source, exports, contracts and existing tests for each assigned capability. The roadmap's baseline is historical; current source is the implementation starting point.
6. Read `remote-execution.md` and `ci-selection.md` before preparing or running heavy checks. Read provider, release, UI and other policy references on their actual triggers.
7. Record which earlier validation remains applicable to unchanged files, environments and package artifacts. Reuse valid results without relabeling them as a new execution. A different commit, dependency graph, built artifact or harness requires the relevant checks again; do not let a stale consumer/browser report satisfy a new candidate's gate.

Use scoped `rg` and `rg --files` searches. Exclude dependency trees, Git internals, caches and agent session/worktree directories unless an explicitly scoped audit needs that content. Never search the entire home directory or filesystem root.

Do not start by installing the existing workspace. First inspect the manifests and lock graph for prohibited dependencies. Implement their removal and independent fixture replacements before any new required-profile installation that would otherwise retrieve them.

## 2. Treat scope and evidence as explicit contracts

Parse every current gap, work package, file action, public contract and checklist item in the roadmap. Include requirements in coverage lists and prose, not only the file tables. A lower priority changes delivery order; it does not remove the requirement.

Create and maintain `docs/prds/aura3d-native-capability-ledger.json` through its designated owner. For every distinct user-observable outcome, record:

- Stable requirement ID, description, priority and owning work package.
- Current source status: confirmed defect, partial, not found, unverified or implemented.
- Exact implementation files and symbols, public package/subpath and integration dependencies.
- Supported inputs, format variants, options, backend and resource/lifecycle rules.
- Regression or contract tests, command/run IDs, artifact hashes and measured results.
- Separate source-completion and acceptance states with explicit unavailable or unsupported reasons.
- Source/fixture provenance, license, known limitations and the precise claim permitted by the evidence.

Expand umbrella items into testable outcomes before counting them. Merge duplicate descriptions of the same behavior. Existing functionality counts only after the relevant path and evidence are verified. An unverified feature must not be rewritten as missing merely to justify new code.

Treat CREATE/MODIFY actions as intended final changes relative to the recorded baseline. On resume, an already created file becomes an implementation to inspect and complete. Do not delete and recreate it, restart finished work, or fail solely because the original action label is now stale.

If an implementation requires an additional file, register its exact path, action, owner and acceptance before editing. Add necessary integration work without silently widening the product scope. Preserve the requested roadmap outcomes when correcting stale paths or architecture assumptions, and record the decision.

## 3. Launch parallel implementation lanes immediately

Derive a dependency graph from the current roadmap and launch independent subagents with disjoint file ownership. Use the available parallel capacity for substantial independent work. Large lanes may delegate disjoint children within policy limits. Avoid multiple agents investigating or writing the same slice without a specific reason.

Give each agent a self-contained assignment containing:

- Repository root, current baseline and applicable policy/skill instructions.
- Work-package IDs, exact writable files and read-only integration dependencies.
- Required production behavior, public contracts and failure/lifecycle semantics.
- Tests and fixtures to implement, source checks to run, and remote-only constraints.
- Required output: changed paths/symbols, contract requests, commands/results, provenance and unresolved dependencies.

Preserve the roadmap's exclusive owners. The capability-ledger owner handles ledger edits; the integration owner handles shared manifests, barrels, generated maps and shared public types; the verification-infrastructure owner handles shared browser runner infrastructure. Other lanes send precise integration requests instead of editing those files.

Where a new audit expands a shared file's scope, route it to the existing owner. Serialized handoffs must record the old owner, new owner, commit and contract state. Never allow simultaneous ownership merely because changes touch different lines.

The parent agent integrates contracts, resolves dependencies and verifies child results while children work. Do not idle while independent work remains. Keep healthy children running through compaction and reconcile their state on resume instead of spawning replacements.

Use these dependency waves, mapping them to the roadmap's current IDs:

1. **Inventory and contracts:** establish ledger rows, file ownership, readiness, device/resource, request identity, format registry, shader graph and public type boundaries.
2. **Correctness and independence:** fix confirmed geometry, loading, animation/audio, spatial input, app isolation and resource defects; independently replace prohibited implementations and dependent fixtures.
3. **Feature implementation:** build renderer, graph, material/light, post, format, geometry, text, interaction and other independent capability lanes as their contracts become available.
4. **Product integration:** connect workers, framework adapters, editor, examples, public exports, optional packages, generated metadata and installed consumers; preserve bundle boundaries.
5. **Source validation and freeze:** complete source tests, contracts, package builds, packed-consumer checks and required corrections, then commit the code-complete candidate.
6. **Acceptance:** only after the global gate verifies every required production outcome and source check, run the specified remote headless browser, visual, performance, device and any authorized live acceptance against that candidate.

Begin eligible work as soon as its actual dependencies are ready. Wave labels are not an excuse to serialize unrelated files. Keep experimental feature promotion separate from implementation: a required path must be functional through its explicit opt-in before source freeze, even while its support label or release default awaits post-freeze evidence. An unconditional public-path rejection cannot count as completed code.

## 4. Implement independent production behavior

Do not install, copy, import, wrap, embed, bundle or fetch another 3D engine or its implementation, shaders, lookup data, fixtures or assets. Do not create an adapter that secretly delegates required Aura3D functionality to such an engine. Do not add competitor names, links, release identifiers or namespaces to these handoff documents.

Use published standards, equations and independently authored designs. Existing authorized format codecs, shaping libraries or optional physics dependencies require an explicit license, provenance and package boundary; they do not replace the Aura3D renderer.

For existing attributed material, retain its notices while it remains present. Replace the implementation or data independently, preserve required behavior, and record the replacement's source and verification. Removing a copyright comment, renaming a copied function or failing to find a fingerprint does not establish independent authorship.

Audit all required installation profiles, dependency fields, transitive/peer graphs, generated code, maps, workers, binaries, packed payloads and relevant runtime requests. Convert dependent tests to independent expectations and fixtures without losing behavior coverage. Retain historical evidence as historical; do not relabel it as evidence for the new implementation.

Every feature must traverse its real public path:

`documented public entrypoint → runtime validation → compiler or adapter → active backend/resources → observable behavior → cleanup`

For asset features, include admission, typed manifest, content verification, optional decoder selection, dependency loading and resource disposal. For exports, include supported-content preservation and structured loss reports. For authoring features, include persistence, undo, runtime updates and actual rendered output.

Keep schemas, runtime validation, TypeScript declarations, compiler lowering, serialization, package exports, CLI metadata and examples consistent. Feature lanes must request exact shared changes, including symbol name, type, export condition and consuming test.

Do not count stubs, placeholder returns, mock-only implementations, ignored options, internal classes without public access, or parsing without required runtime behavior as complete. An explicit unsupported error is acceptable only for a combination the roadmap permits to remain unsupported; it cannot replace a required feature.

Preserve supported existing scenes, WebGL2 defaults, typed assets and lifecycle semantics. Incompatible changes require the roadmap's versioned migration/deprecation path. Keep specialized modules opt-in and verify unused code and optional dependencies stay out of ordinary consumers.

Use fixtures with recorded origins, licenses, digests, versions, size limits and expected results. Test real encoded bytes where decoding is claimed. Keep malformed input, cancellation, concurrent callers, context/device loss, retry and disposal behavior as part of each implementation.

## 5. Validate source and packages before code freeze

Implement the functional production paths first and then run their meaningful regression tests and generated contracts. For each confirmed defect, retain a targeted reproduction that fails against the faulty behavior and passes with the fix. Validate requirements rather than mirroring the implementation.

Use the roadmap's exact commands and inspect their current script bodies before execution. Some aggregate scripts may invoke browsers, builds or unavailable downstream scripts. Fix command wiring through the proper owner and classify each invoked workload by its actual behavior. Do not claim a missing command passed or use a misleading command label to bypass execution policy.

Run quick targeted source checks locally only when policy permits their actual resource use. Run monorepo checks, full suites, dependency scans, builds, code generation, packed consumers and other heavy work remotely. Browser/device/live checks belong to the later acceptance phase.

Write browser specs, visual fixtures, rendered-performance probes and acceptance tooling during Phase A, and source-test/typecheck that code. Do not launch a browser, capture frames, run rendered benchmarks, start physical/injected browser XR sessions, capture runtime network traffic or request live acceptance receipts until all required source work is complete. There is no per-lane exception and no acceptance pass used to postpone unfinished production code. Source numerical tests, mock/native-shaped API tests, offline decoding and Node-based packed-consumer checks are allowed and required as specified.

Source validation must establish:

- The required code and public paths exist with source-level behavioral coverage.
- Runtime types, schemas, serialization, generated maps and exports agree.
- Every supported package/subpath can be built and packed from the independent frozen lock.
- Isolated JavaScript, supported TypeScript/module conditions, server imports, framework peers and optional-package consumers behave as promised.
- Untouched templates and applicable documentation examples work; the harness does not silently repair missing dependencies or configuration.
- Existing behavior coverage survives dependency and fixture replacement.
- Bundle boundaries and source-level resource/lifecycle contracts pass their prescribed checks.

Use the roadmap's source-only runner, phase-specific consumer tools and report schema after implementing them. Source validation includes the full asset/contract suites and Node release tests, not only the default unit directories. The staged manifest must include required fixtures, templates, generated maps and untracked task additions. Keep clean-install and broader consumer-matrix reports separate, bind each to current source/lock/tarball/project digests and make tree-shaking consume the current source-phase report. Source checks must not depend on an earlier browser receipt.

Run source unit/contract checks before the fresh build and candidate pack; run packed integration/consumer/API checks only after the selected archives exist. Support verified source identity in a Git-free staged job without inventing a local commit or copying private Git configuration. Bind unchanged tested implementation and archive digests explicitly to the later freeze commit. Administrative evidence updates cannot silently change the frozen implementation, and a consumer checker must not substitute newly rebuilt artifacts without validating their identity.

Inspect new and existing rendering behavior through the roadmap's concrete contracts: frame/view-owned temporal history, exclusive resource leases, full draw-state and shader-data layouts, clipping/depth/camera conventions, color output, exact asset identity, deterministic animation/input and decoder deployment. Preserve already working implementations; complete the documented missing behavior and its real public integration.

Report failures with the exact command, exit status, relevant output and affected requirement IDs. Fix real defects and rerun affected checks. Do not weaken assertions, raise budgets, mark required tests skipped, hide new errors or trim required scope to obtain a pass.

After all required production paths, source tests, generated contracts and package checks are complete, perform one bounded defect review, fix the identified required implementation defects, create the reviewable commit and record its immutable identity as `CODE_COMPLETE_GO`. Stage only task-owned changes; exclude unrelated pre-existing user edits. Include the source completion report and artifact hashes. Do not use that marker as a synonym for hardware certification, public availability or a published release.

Use the implemented tools/native-capability-gate/index.mjs to emit and verify tests/reports/native-capabilities/code-complete-go.json. The gate must prove closure of the entire required source-outcome inventory and expected checks against the freeze commit and staged-source/lock/tarball hashes. A label, a partial checklist or a stale passing report cannot open Phase B. No gate record exists merely because these instructions exist.

Never declare code completion merely because time or context is running low. Save accurate ownership, next steps and results so work resumes from the same state.

## 6. Run remote acceptance against the frozen candidate

This section is locked until the code-complete phase document's global gate passes. Follow the separate acceptance document for all commands and acceptance checklists. If the gate is missing, incomplete or mismatched, return to the unfinished source work; do not provision acceptance jobs or spend time collecting receipts.

Use approved serverless Azure ACR Tasks or Container Apps Jobs through `az-auraone-gurbaksh`, or serverless AWS CodeBuild where appropriate. Follow the repository's current remote tooling and provider instructions. Do not use GitHub Actions, standing runners, `--agent-pool`, local Docker, or local browser suites.

All browser/visual automation is remote and headless. Use `tools/remote-acr/run.sh` for browser workloads and, `tools/remote-acr/run-source5.sh` for the 5.0 source/build job (same `Dockerfile.playwright` image); `tools/remote-acr/run-source.sh` is not on the 5.0 path. Each command must stage the intended files and retain separate phase results; the browser wrapper is not a general shell command runner.

Before acceptance, verify that the runner receives the intended candidate, independent lockfile, project selection, test list and reporter settings. Give every invocation a unique run ID. Verify the result includes the expected test inventory and real test exit status; a successful infrastructure command alone is not a test pass.

Retain logs, structured results, browser console output and required screenshots/traces/videos through the authorized artifact path. Preserve test status independently of artifact-upload status. Redact credentials, private headers and signed URLs; do not place local provider credentials in jobs, source, arguments or artifacts.

Run the roadmap's current browser suites and all additional implemented acceptance specs. Expand each capability into the applicable backend/browser/format combinations rather than running a single happy path.

Record the exact package commit, fixture hash, browser distribution/executable version, OS, backend, adapter identity, feature flags, test results and resource measurements. Keep these evidence levels separate:

- Source-tested and mock/injected-runtime results.
- Automation-browser software rendering.
- Automation-browser physical GPU rendering.
- Retail-browser or actual mobile/desktop device results.
- Physical spatial-device sessions and live deployment/publication results.

No-data, skipped, unsupported and failed are distinct outcomes. A software adapter is not hardware evidence; an injected session is not a physical-device session; an opaque canvas alone is not proof of a rendered feature. Use fixture-specific numerical and subject-region pixel expectations.

Apply the roadmap's fixed workload, sampling, noise and budget rules. Do not invent missing GPU timings, compare unlike environments, raise budgets to pass, or call an inconclusive measurement an improvement. Repeat only where changed code, a failure or the prescribed bounded noise retry justifies it.

Hardware availability and narrow attestation gaps do not invalidate completed source work. They limit the claims that can be made. Keep unavailable acceptance open and continue all other work. Do not provision paid hardware or widen trust without the authorization required by live policy.

If acceptance reproduces a required product defect, repair it, rerun affected source checks, record a new code-complete commit and rerun the affected acceptance. Preserve earlier results under their original commit. A feature-promotion or release-default change also creates a new candidate identity and needs its applicable checks; never mutate the candidate while continuing to claim the old commit's evidence. Do not initiate open-ended adversarial or verifier loops.

Only actual required production defects or these policy categories can block launch: availability, authentication, isolation, custody, migration integrity, signed-source identity and rollback. Record narrower acceptance findings without manufacturing new source work or removing an honest support limitation.

## 7. Operational boundaries and cleanup

Resolve ordinary API, sequencing and implementation choices from code, tests, history and policy without asking the user to choose a workstream or approve routine reversible work. Retain authorization already supplied in the session.

Pause only the dependent action when an actual policy-required human gate is reached: deleting production data/stores, new spending or wider external trust, shared credential changes, externally signing/scheduling as the user, or live human authentication. Complete independent authorized work and prepare the concrete reviewable action first. Never treat elapsed time as approval.

Do not publish packages, deploy production changes or send external messages merely because the roadmap contains release requirements. Carry out those actions only when covered by the live task/session authorization and applicable policy; otherwise finish the implementation and reviewable release artifacts and report the precise remaining action.

Prefer existing serverless infrastructure. A temporary VM/GPU is a last resort only when a container job cannot run the workload and the required authorization exists. Register cleanup traps before provisioning, delete all task-created compute, disks, snapshots, network interfaces, addresses and resource groups, and verify zero task remnants. Stopping or deallocating a resource is not deletion.

Stop only temporary processes you started. Preserve pre-existing services, user work and healthy child agents. Clean up temporary downloads and unauthorized retained artifacts without deleting required test evidence.

## 8. Progress, resume and completion report

Keep the user informed with concise findings, completed work and the next dependency being resolved. Follow the session's update cadence, including a non-blocking percentage update at least every ten minutes during sustained work.

Define code completion as completed required production outcomes with passing source checks divided by all currently enumerated required production outcomes. Freeze the denominator after initial decomposition; when a necessary missed requirement is discovered, record the addition and denominator change. Do not inflate progress by splitting finished tasks, counting filenames, or removing hard requirements.

Report acceptance separately as named results and limitations. Unavailable hardware must not reduce an already valid source-completion percentage, and source completion must not imply acceptance passed.

On compaction or restart, reload the roadmap and ledger, reconcile live agents and working-tree changes, verify the current commit and resume unfinished work. Do not redo verified work or duplicate running lanes.

At each completed lane or context boundary, have the ledger owner preserve a durable checkpoint containing:

- Current repository and roadmap revision, candidate commit and working-tree fingerprint.
- Active agent IDs, their owned files and dependencies they are waiting on.
- Completed requirement IDs and the source evidence that justifies each status.
- Integration requests that remain unmerged, with exact symbols and target owners.
- Running remote jobs, run IDs, artifact locations and responsible cleanup owner.
- Failed commands, reproduced defects and the smallest next action for each.
- Required acceptance that is pending, unavailable or explicitly unsupported.
- Current code-completion numerator/denominator and any recorded scope correction.
- Any actual human-gated action, its policy reason and already completed preparation.

Keep the checkpoint inside the owned ledger/evidence structure, and exclude secrets. A checkpoint records progress; it does not turn an unverified agent report into a completed requirement.

Completion requires the following reviewable record:

- [ ] Every roadmap requirement has an owner, implemented public behavior or an explicitly permitted unsupported boundary, and the required source evidence.
- [ ] File actions, generated contracts, package exports, schemas and documentation agree; no required feature remains a placeholder.
- [ ] Independence replacements and fixture/dependency provenance are recorded without discarding required notices or test coverage.
- [ ] Required source and packed-consumer commands pass, with exact candidate and artifact identities.
- [ ] `CODE_COMPLETE_GO` identifies the completed immutable source candidate and its validation.
- [ ] Applicable remote headless acceptance has been executed and recorded; unavailable cases remain explicit and claims stay bounded by evidence.
- [ ] Performance and bundle outcomes follow the specified budgets and method; noisy or unavailable results remain honest.
- [ ] Any authorized release action has verifiable results and rollback information; unauthorized publication/deployment is not implied.
- [ ] Task-created temporary resources are deleted and cleanup is verified.
- [ ] The final response links the completed work and evidence, states what changed and how it was tested, and names any actual remaining acceptance limitations.

If required production work is incomplete, continue it rather than presenting a partial milestone as completion. If an external gate prevents the remaining action, state the exact dependency, preserve the finished source state and evidence, and never fabricate success.

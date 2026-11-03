# Aura3D native capability acceptance — Phase B

**State: LOCKED until global CODE_COMPLETE_GO.** This file contains acceptance work only. Its existence does not authorize running that work before all required implementation and source validation are complete.

**Current provisional source review:** The [current saved audit](aura3d-native-current-audit-2026-11-02.md) estimates **784/1,014 granular source-side subrequirements present (~77%), 183 partial, 43 missing, and 4 unknown**. It corrects the previously reported **785 present / 182 partial** by reclassifying one item; no completion credit is assigned to partials. Its earlier **53/192 task rows** and **912/1,864 source-related ledger rows** count only fully source-implemented historical rows; they use different units and omit partial work. Current task and source classifications are not fresh verified gate data.

**Phase state:** Code is **not code-complete**: no complete candidate-bound source report, freeze, or `CODE_COMPLETE_GO` exists; acceptance is **locked and unrun for a complete candidate**. Resume only outstanding existing roadmap tasks. Preserve existing test files and coverage; add no tests or tasks, even where older instructions suggest otherwise, and do not weaken checks or gate requirements.

**Prerequisite:** [Phase A — code complete](aura3d-native-code-complete.md). **Product requirements and file ownership:** [native capability roadmap](aura3d-native-capability-roadmap.md). **Overall instructions:** [execution prompt](aura3d-native-capability-execution-prompt.md).

Read this file while planning test coverage if useful, but do not launch its workloads, provision acceptance resources, collect screenshots or chase device receipts during Phase A. Implement and source-typecheck the test harnesses in Phase A; execute them here only after the global gate passes. Completing one feature lane does not open this phase.

## 1. Mandatory entry gate

The gate record is `tests/reports/native-capabilities/code-complete-go.json`. Phase A defines its schema and creates it only after the complete required implementation scope and source checks pass. This document does not create that record, mark any implementation complete or claim that the gate checker already exists.

Before any acceptance provisioning or execution, validate all of the following:

- Every current roadmap outcome requiring code has a completed implementation and passing source evidence; no required code outcome is unresolved, unowned or a placeholder.
- All expected source/contract/build/packed-consumer checks are present, passed and bound to the tested candidate. Require exact required/completed outcome ID and expected/passing check ID sets; equal counts are insufficient. Missing, skipped, no-data or failed required source checks cannot authorize acceptance.
- The freeze commit exists and is explicitly bound to the tested implementation manifest, independent lockfile and candidate archive digests.
- The implementation files, selected tarballs, test harness and fixture inputs match the gate's identity. Administrative acceptance records do not silently change that identity.
- The required browser/visual/performance/device harness code is already implemented and source-checked. Acceptance is not a substitute for unfinished test infrastructure.
- The code-complete gate covers the whole roadmap, not a subset, priority tier, individual work package or individual agent's claim.

The executing agent must use the implemented gate checker before submission:

~~~sh
node tools/native-capability-gate/index.mjs --phase acceptance --gate tests/reports/native-capabilities/code-complete-go.json
~~~

This is a future interface required by the roadmap. Acceptance runners must require `AURA3D_CODE_COMPLETE_GATE`, validate it on the host before image build or job submission, and revalidate it remotely against the staged candidate before any browser or display startup. The image stages the validator, gate record and referenced manifests/reports. Reject headed selectors for roadmap acceptance jobs; preserve unrelated established workflows. A previous shell command or the text `CODE_COMPLETE_GO` alone is insufficient. A missing, invalid or stale gate must fail closed with the unmet source requirements and no acceptance job launched.

If the gate fails, resume the unfinished work in Phase A. Do not repeatedly poll for a device, tune a screenshot, run a partial browser suite, retry a certification step or create a weaker gate to move forward.

## 2. What belongs to this phase

The following work is prohibited before the global gate and belongs here:

| Acceptance activity | Required evidence |
| --- | --- |
| Browser integration and rendered behavior | Actual public entrypoint, selected backend, browser version, fixture identity, runtime assertions and expected pixels. |
| Visual inspection and regression | Fixture-specific subject/output checks, retained screenshots and justified tolerances. |
| Rendered performance and resource soak | Candidate-bound measurements, fixed workload, sample count, device/browser identity and calibrated thresholds. |
| Physical GPU, mobile and XR validation | Actual adapter/device/session facts, capabilities, versions and explicit limitations. |
| Runtime network/offline independence | Recorded requests or denied requests from the frozen packed consumer, with sensitive data redacted. |
| Deployment, certification and publication receipts | Authorized live action, exact source/package identity, observed outcome and rollback information where applicable. |

The source phase may run CPU numerical tests, fake-device/unit tests, parser/conformance tests, Node consumers, typechecks, static bundle analysis and source checks for these tools. Those results remain source evidence; they cannot be relabeled as browser or device acceptance.

Read-only dependency retrieval for an authorized source build and verified prior declaration retrieval remain Phase A work. The runtime network capture in this file means observing an executing application; it does not prohibit source-job dependency transport.

## 3. Candidate and runner preparation

After the gate succeeds, inspect the current remote-execution, CI-selection and applicable provider instructions. Use approved serverless Azure ACR Tasks or Container Apps Jobs through `az-auraone-gurbaksh`, or serverless AWS CodeBuild where appropriate. Browser and visual automation must be remote and headless. Never use GitHub Actions, a standing runner, `--agent-pool`, local Docker or a local browser suite.

Restore the exact candidate source/archives and retained source-phase consumer projects. Validate the staging manifest, lockfile, fixture hashes, package versions, archive hashes and source-report identities before using them. The runner must stage the required fixture, template, decoder, environment and test files explicitly. Missing inputs are failures, not implicit exclusions.

Choose test inventory and browser/backend cells from the capability ledger. Use a unique run ID for every invocation. A successful infrastructure command is not a successful test: retain actual test exits, discovered tests, expected tests, skipped reasons and structured results. Artifact-upload status is separate from test status.

No acceptance command may silently rebuild, repack, repair a consumer or substitute a newer dependency. If an authorized rebuild is necessary, verify its recorded hashes or create a new candidate through Phase A before using the output as evidence.

## 4. Remote browser commands

These commands are the roadmap's acceptance groups after its runner and test changes are implemented. The example run IDs must be replaced with unique values. Each invocation must validate the gate record before provisioning and executing.

~~~sh
export AURA3D_CODE_COMPLETE_GATE=tests/reports/native-capabilities/code-complete-go.json
RUN_ID=native-geometry-001 KEEP_IMAGE=0 SPECS="tests/browser/native-geometry-query.spec.ts tests/browser/native-multiview.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-rendering-001 KEEP_IMAGE=0 SPECS="tests/browser/native-shader-graph.spec.ts tests/browser/native-material-lighting.spec.ts tests/browser/native-advanced-lighting.spec.ts tests/browser/native-post-effects.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-assets-001 KEEP_IMAGE=0 SPECS="tests/browser/native-gltf-materials.spec.ts tests/browser/native-format-import.spec.ts tests/browser/native-exporters.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-runtime-001 KEEP_IMAGE=0 SPECS="tests/browser/native-controls-xr.spec.ts tests/browser/native-animation-audio.spec.ts tests/browser/native-capability-lifecycle.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-gpu-001 KEEP_IMAGE=0 AURA3D_BROWSER_PROJECT=chromium-gpu-headless SPECS="tests/browser/native-gpu-render-compute.spec.ts tests/browser/native-drawing-pipelines.spec.ts tests/browser/native-splats-volume.spec.ts tests/browser/native-worker-render.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-tools-001 KEEP_IMAGE=0 SPECS="tests/browser/native-geometry-tools.spec.ts tests/browser/native-alternative-outputs.spec.ts tests/browser/native-objects-generators.spec.ts tests/browser/native-editor-inspector.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-maturity-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json SPECS="tests/browser/native-multi-app-isolation.spec.ts tests/browser/native-resource-ownership.spec.ts tests/browser/native-react-lifecycle.spec.ts tests/browser/native-asset-integrity.spec.ts tests/browser/native-format-maturity.spec.ts tests/browser/native-world-text.spec.ts tests/browser/native-lines-models.spec.ts tests/browser/native-game-physics.spec.ts tests/browser/native-examples-catalog.spec.ts tests/browser/native-offline-environments.spec.ts tests/browser/native-offline-independence.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-browser-chromium-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json AURA3D_BROWSER_PROJECT=chromium-automation SPECS="tests/browser/native-cross-browser.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-browser-firefox-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json AURA3D_BROWSER_PROJECT=firefox-automation SPECS="tests/browser/native-cross-browser.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-browser-webkit-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json AURA3D_BROWSER_PROJECT=webkit-automation SPECS="tests/browser/native-cross-browser.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-performance-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json AURA3D_BROWSER_PROJECT=chromium-automation SPECS="tests/browser/native-performance-probe.spec.ts tests/browser/resource-soak-u1.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-depth-state-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json SPECS="tests/browser/native-clipping.spec.ts tests/browser/native-camera-depth.spec.ts tests/browser/native-render-state.spec.ts tests/browser/native-transparency.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-temporal-color-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json SPECS="tests/browser/native-temporal-reconstruction.spec.ts tests/browser/native-color-output.spec.ts tests/browser/native-dynamic-textures.spec.ts" tools/remote-acr/run.sh
RUN_ID=native-input-deployment-001 KEEP_IMAGE=0 AURA3D_REPORTER=line,json SPECS="tests/browser/native-input-coordinates.spec.ts tests/browser/native-deployment-contracts.spec.ts" tools/remote-acr/run.sh
~~~

These groups do not limit a feature to one backend. Run each applicable default browser project and native GPU project against the supported combinations in the ledger, including additional implemented specs added during Phase A. Parallelize independent acceptance groups only after the global gate passes, with separate report paths and exclusive ownership of mutable consumer projects.

Record `unsupported`, `no-data`, `skipped`, `failed` and `passed` separately. A default WebGL run is not native GPU evidence. The GPU project must report whether its adapter is software or physical. If the headless infrastructure cannot render on the requested hardware, record no-data; do not switch to a headed run.

## 5. Packed consumers, independence and performance

Inside the authorized remote browser job, restore the source-phase consumer projects and matching reports, and preserve `AURA3D_CODE_COMPLETE_GATE` as the path to the staged validated gate. Set the following paths from validated artifacts, not guessed filenames: `NATIVE_ACCEPTANCE_RUN_ID`, `NATIVE_CONSUMER_SOURCE_REPORT`, `NATIVE_MATRIX_SOURCE_REPORT` and `NATIVE_MEASUREMENT_REPORT`.

The source report and broader matrix source report are distinct documents. Each must match the gate's candidate and installed archives. Execute the implemented phase interfaces:

~~~sh
pnpm exec tsx --tsconfig tsconfig.base.json tools/package-clean-install/index.ts --phase browser --run-id "$NATIVE_ACCEPTANCE_RUN_ID" --source-report "$NATIVE_CONSUMER_SOURCE_REPORT"
pnpm exec tsx --tsconfig tsconfig.base.json tools/native-consumer-matrix/index.ts --phase browser --run-id "$NATIVE_ACCEPTANCE_RUN_ID" --source-report "$NATIVE_MATRIX_SOURCE_REPORT"
pnpm exec tsx --tsconfig tsconfig.base.json tools/native-runtime-audit/index.ts --phase browser
pnpm test:performance --input "$NATIVE_MEASUREMENT_REPORT"
~~~

These tools must also validate the global gate. The runtime audit consumes the matching offline/network observations collected in this phase; it must verify their candidate identity and expected test inventory. Performance analysis consumes the measured report from this phase and fails missing or mismatched inputs. Neither tool may manufacture data or fall back to historical evidence.

Write `browser.json` and `matrix-browser.json` separately from `source.json` and `matrix-source.json` under the run's report directory. Never overwrite source outcomes, hide a failed browser result inside a passing source report or repair an untouched consumer to obtain acceptance.

Apply the roadmap's fixed workload, sampling, same-device baseline, noise and budget rules. Preserve workload/asset hashes, seed, look, quality, viewport, pixel ratio, browser and backend. Label CPU measurements separately from actual GPU timings. Do not raise budgets, compare unlike environments or treat an inconclusive run as an improvement. Use only the specified bounded noise retry; repeated measurements need changed code, a failure or a concrete unresolved concern.

## 6. Behavior and evidence checklist

- [ ] The global gate was valid before any acceptance provisioning/execution, and every run is linked to its immutable candidate identity.
- [ ] Every applicable public capability/backend/format cell has an executed test or a specific unavailable/unsupported reason. Required missing tests are failures.
- [ ] Geometry queries, transforms, dynamic bounds, batches, instances, clipping and camera/depth conventions produce the expected rendered and interactive result.
- [ ] Materials, lighting, shader graphs, compute, render targets, draw state, transparency and color output use the selected active backend and affect expected pixels.
- [ ] Temporal histories remain isolated across apps/views/frames; dynamic resolution, disocclusion, deformation and motion blur meet the stated behavior.
- [ ] Repeated lifecycle operations, target leases, late shader compilation, worker shutdown and context/device recovery leave the promised live-resource state.
- [ ] Actual admitted asset bytes, supported format variants, dependencies, exports, orientation and strict/fallback behavior match the requested content and independent fixture expectations.
- [ ] Decoder/worker assets load from the declared production base under the documented content policy, including nested deployments and offline behavior.
- [ ] Animation, audio, input and XR lifecycle assertions match actual browser behavior; injection and emulation remain labeled separately from physical sessions.
- [ ] Text, lines, models, physics/game paths, editor tools, alternative outputs and optional packages work through their installed public entrypoints.
- [ ] React hydration/lifecycle and all supported untouched templates/examples/consumer combinations pass on the candidate packages without silent harness repairs.
- [ ] Offline/network observations show the independent runtime behavior claimed, with redacted request evidence and no prohibited external engine implementation.
- [ ] Browser results identify the exact executable/distribution, version, OS, backend, adapter, available driver information, flags, fixtures and candidate hashes.
- [ ] Performance and soak results include actual sample sizes, resource measurements, budget outcomes and unavailable timing reasons.
- [ ] Logs, screenshots, traces and structured outcomes are retained through authorized artifact egress; upload failure cannot erase or convert test status.

Source tests and mock devices cannot satisfy these browser/device checks. An opaque canvas, successful parser return, updated counter or state-machine transition alone does not prove a rendered feature. Use independently defined numeric and subject/output-region expectations.

## 7. Defects, unavailable devices and bounded correction

If acceptance reproduces a defect in required production behavior, record the exact requirement, candidate, fixture and reproduction. Invalidate acceptance authorization for the changed candidate, return that repair to Phase A, fix the actual defect and run the affected source/contract checks. Establish a new code-complete candidate and gate before rerunning affected acceptance.

Retain earlier results under their original candidate identity. Reuse unchanged results only through an explicit, reviewable input/dependency equivalence record; never relabel old measurements as a fresh run. A change to a support default, feature gate, test harness or relevant artifact must be accounted for before it can inherit evidence.

Review each identified defect once against required behavior and the frozen launch-blocker policy. Do not launch recursive adversarial reviews or expand receipt machinery into a separate product. Finish independent acceptance work while a genuine external limitation remains unavailable.

Unavailable physical hardware or a narrow attestation receipt does not create missing source implementation. Record the limitation and constrain public claims. Software adapters, automation browsers, retail browsers, mobile devices, injected sessions and physical spatial devices are separate evidence classes. Preserve experimental status where support has not been demonstrated.

Only actual defects in required production behavior or the policy's frozen categories may block launch: availability, authentication, isolation, custody, migration integrity, signed-source identity and rollback. The absence of a narrower receipt is recorded separately; it does not justify repeatedly reopening completed source work.

## 8. Release actions, cleanup and final record

This acceptance plan does not grant new permission to publish, deploy production changes, spend on hardware, widen external trust, change shared credentials or send messages. Perform those actions only within existing session authorization and applicable policy. Prepare the concrete reviewable result first and continue independent authorized work if a genuine human gate is reached.

Use existing serverless infrastructure where suitable. A temporary VM/GPU is a last resort only when a container job cannot execute the workload and the required authorization exists. Register cleanup traps before creation, delete all task-created compute, disks, snapshots, interfaces, addresses and resource groups, and verify zero task remnants. Stopping or deallocating a resource is insufficient. Stop only temporary processes started for this task.

Store source completion and acceptance as separate states. Report acceptance by actual passed, failed, unsupported and unavailable cells. Do not replace code-completion progress with a percentage of device receipts, and do not imply all acceptance passed because source work is complete.

- [ ] All executed acceptance results identify their candidate, test inventory, evidence level and artifacts.
- [ ] Required-product defects are either repaired and re-frozen with affected checks or remain explicitly open; none are disguised as unavailable evidence.
- [ ] Remaining device/receipt limitations are stated precisely and corresponding support claims remain bounded.
- [ ] Any authorized deployment/publication has its own observed outcome and rollback record; no release is implied by a local code-complete marker.
- [ ] Task-created temporary resources and processes are removed, with cleanup verified.
- [ ] The final handoff links the Phase A gate, Phase B results, capability ledger and actual remaining limitations without claiming unsupported breadth or maturity.

Do not declare full acceptance complete while an applicable required outcome is failed or unverified. It is valid to report completed source implementation with limited acceptance evidence, provided the missing evidence and resulting support limits remain explicit.

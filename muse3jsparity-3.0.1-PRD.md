# muse3jsparity 3.0.1 PRD — Complete the Unfinished 3.0.0 Contract

Date: 2026-09-05
Target: **3.0.1** across the root package and 28 public packages.
Status: **IN PROGRESS — implementation and validation tracked below; the release remains incomplete.**
Source verification baseline: `137280b3705e1968a35ddd1c891329e06199597e`.
Original PRD: [muse3jsparity-PRD.md](muse3jsparity-PRD.md).
Audit: [muse3jsparity-completion-audit-2026-09-05.md](muse3jsparity-completion-audit-2026-09-05.md).
Frozen opponent: repository-installed `three@0.185.1` / r185, not the moving latest release.

## Live execution status — updated 2026-09-05

**Blocking-chain diagnosis and repair (2026-09-09 UTC):** Two failing required lanes were diagnosed to root cause and repaired on current source.

L01 exact-package validation failed at `tools/release/version-inventory.mjs` with `Internal version constraint mismatch: templates/cinematic-scene/package.json @aura3d/engine=2.0.4`. An audit of every manifest the inventory validates found **33 stale internal pins across all 33 root `templates/*/package.json` files** (`2.0.4`, `0.1.0-alpha.0`, `^0.1.0-alpha.0`, `0.0.0-rebuild`), while the 19 scaffold manifests and `marketing/package.json` were already correct at `3.0.1`. All 33 were pinned to `3.0.1`; `tools/production-runtime-template-readiness/index.ts` no longer hardcodes `0.1.0-alpha.0` and reads the root version, and the `template-verification` boundary string is derived rather than naming a stale version. Re-running the inventory validator reports zero remaining pin, private-workspace or script-install violations. Commit `93511f11`, dispatched as run `34298840893`.

Browser Matrix failed **14 of 54** tests in two classes, both traced to runner device class rather than product regression. Eight `advanced-examples-gallery` failures were hardware-calibrated frame budgets (for example `ocean-observatory accepted measured loop work must stay within the route budget`) asserted against a hosted **SwiftShader software rasterizer**; the PRD already states that software adapters do not establish native hardware performance. New `tests/browser/gl-device-class.ts` reads the actual GL renderer via CDP plus `WEBGL_debug_renderer_info`, and budget acceptance is asserted only on hardware GL while software GL must still render, animate and stay bounded. The remaining six failures were wall-clock timeouts on software GL: three route-primary `visible-screenshot` phases exceeding 150 s, the 22-route WOW sweep against a fixed 900 s budget, and the postprocessing capture against the shared 60 s default. Each now scales by measured device class or per-route cost. Verified locally on hardware: `current-routes-parity-evidence` passes 9/9 in 22 s, and `water-lab` records `budgetAsserted: true` with 14.48 ms against its 45 ms budget on an Apple M4 Max Metal renderer. `pnpm typecheck:raw` is clean. Commit `d6a2dba2`; CI, Build and Test, and Test & Coverage all pass on it.

**Aggregate blocking chain, verified 2026-09-09:** `tests/reports/muse3jsparity/readiness.json` is `overall: blocked` because `R-unit` failed and the tool correctly aborts all 22 downstream gates with `not executed: baseline failed`, leaving every part A–V blocked. The R-unit receipt shows **8 failed of 4,964** tests. Of those, `smart-city-scene-update` already passes on current source. The remainder reduce to **one** root cause: `node tools/evidence-freshness/explain-staleness.mjs` reports **22 of 22** retained `tests/reports/showcase-route-primary-probes/*.json` stale, all on `renderer-fingerprint` mismatch, with zero ordering cycles and zero ownership conflicts. Those artifacts are owned by the `route-primary-probes` producer, which is the Browser Matrix spec repaired above, so `evidence-freshness`, `replicability-metrics` (which reads the explainer live rather than recomputing) and `showcase-route-gates` are all downstream of one regeneration. `head-to-head-current-aggregate` is separately `UNPROVEN: fresh-installed-current-packages-prove-all-workloads` because its retained receipt binds commit `16ea94f0`; it is re-earned by `pnpm head-to-head:installed` on frozen final source. Ordering is therefore fixed: regenerate probes on final source, then the freshness-derived reports, then the installed reproduction, then the aggregate.

**GitHub Actions capacity, verified 2026-09-09:** `auraoneai/aura3d` is `visibility: public`, `archived: false`, `disabled: false`, with Actions `enabled: true` and `allowed_actions: all`. Standard GitHub-hosted runners are free for public repositories, and the observed failures are assertion and timeout failures inside running jobs with assigned runners, not queued or billing-blocked jobs. Actions credits are not a constraint on this release.


**Turbo/Q02 current-source acceptance (2026-09-06 UTC):** `q02-turbo57-camera-order` passed its complete 7.5-minute browser arc with exit 0 after the focus-before-camera synchronization repair. The source-bound receipt retains seven SHA-256-verified frames covering opening grid, live handbrake drift, rival overtake, best-lap ghost chase, four-lap finish, mobile touch and reduced-motion drift. The exact producer hash is `a7a3089d8225afac90e6c2b324a80634711f7c42eebbbcf955c1cabe50231ff5`; route source hash is `sha256-e8237d8f6da8cdeff413dfe1635ddefc487c3a5ee81c89c476e5ff7d18875915`. Turbo is closed within the combined I04/Q02 route set; Skyline, Aura Clash, Smart City aggregate replay and final independent gallery review remain separate open requirements.

**I03 independently verified application adoption (2026-09-06 UTC):** Smart City side34 passes its expanded10-capture run. Independent pixel replay matches all retained metrics:37,727 native/hidden changed pixels; zero native/individual and repeated differences; six isolated copies contribute3,796/4,994/6,601/4,580/6,563/8,463 pixels, readability45–50, all unclipped. Actual fleet submissions are six individual one-instance draws versus one six-instance draw, then zero when hidden; total draws547→542→541. Aura Clash independently retains28 copies,11,786 suppression pixels, zero representation/repeat differences and144→117→116 draws. The first and third I03 checkboxes are checked. Navigation movement, actual far-LOD transitions/hysteresis and final-source consolidation remain open.

**Evidence completeness checkpoint (2026-09-06 UTC):** Native50 restores R03 and independent canonical replay verifies175 PNG/readback hashes with zero errors (TAA error0.001938333 versus off0.002619804, 26.012% improvement); this remains source-bound regression evidence, not final closure. Its P01 run instead exposes a completion-timestamp ordering failure, retained for diagnosis without synthetic timestamp adjustments. Smart City main48 passes allthree desktop cases and mobile command readability (5,836 pixels,156×89), but mobile core selection clips the primary subject; the corrected camera is queued as main51. I03 independent replay proves28 actual Clash instances and exact native/individual/repeated pixels, while the city capture proves too little visibility; a stronger six-copy city producer and actual foreground fleet layout require fresh execution. Missing scaffold route-health producers and Animation Studio’s source-owned asset contract are corrected; generator units pass4/4. Primary61 passes source/asset/semantic preparation and its22-route sweep is running. Full I04 camera/light and five E01 locomotion scenarios are running from an independently cloned source. The E01 all-pair quality producer remains under implementation and independent audit; its earlier rendered smoke cannot establish world-contact/seam quality. Expanded R04 execution exposed confusion between runtime-surface and graphics-device backend labels; that producer correction remains required.

**Installed lifecycle / crowd checkpoint (2026-09-06 UTC):** Installed run59 passes149/149 checks across all19 scaffolds; its retained command exits0 with no validation errors and independently verified log/report hashes. Five scaffold producers still omit the route-health artifact required by L01, so that gap and final-source package regeneration remain open. Clash side30 passes the actual individual/native/hidden/repeated application test; independent draw/instance and pixel audit is underway. Remote hydration reconstructed all63 parts, verified archive SHA-256 `2213ebc48b63c774cb7bf5312ef6e0d621a5cedbee44c39dedb4306b1c09b7e1`, and enumerated all1,188 dependencies with zero errors. Smart City main47 passes allthree desktop cases but fails mobile command readability (766 changed pixels versus2,500 required); the mobile camera correction requires a fresh run. Native48 fails six R02 quality guards and regresses R03; neither temporal work order is complete. Standalone temporal receipt ownership now rejects wrong-gate R02/R03 claims;48/48 focused lineage tests pass.

**Prospective R02 edge-oracle freeze (2026-09-06 UTC, before next acceptance run):** Actual supersampled references demonstrated that the old raw moving-frame difference measures genuine authored motion as instability. Preserve those failed runs and raw scores as diagnostics. The corrected, frozen oracle uses actual8x and16x reference captures: union reference16 edge gradients of at least32/255, Chebyshev dilation2 pixels, and steady frames9–23. On that fixed mask, each candidate’s temporal signed-error residual must improve by at least10% against both baseline and history-reset controls, independently for both references. Full-image spatial error must not exceed baseline or reset for either reference, preventing blur/lag from earning a pass. Reference8-versus16 convergence on the mask must be at most25% of baseline-versus-reference16 error on the same mask. Camera-cut and pause/resume comparisons use cold TAA with matching sample configuration, retaining the existing0.5 limit and stale-history/ghosting controls. Mask/reference bytes, PNG/readback hashes and raw metrics are retained and canonically replayed. These criteria are frozen prospectively; no previous diagnostic is promoted into passing acceptance.

**Verified shadow/material checkpoint (2026-09-06 UTC):** Fresh side29 passes the original P02 stress/negative-control contract; the first two P02 checkboxes are now checked with independently replayed raw evidence. Side28 passes all13 root C1/B3 cases; the R04 root-slot/binding checkbox is checked, while missing regional capture retention, numeric color-space/missing-UV and instanced evidence remain open. Native46 independently proves the corrected environment film path (7,774 changed pixels with film; exactly zero without film) and passes the R03 regression. Installed lifecycle48 was stopped after repeated dependency-install timeouts traced to an incorrect proxy port in its generated remote job; port443 was restored and an actual registry preflight passed before installed-only run59 started. Hydration is now staged as63 individually verified parts with aggregate archive SHA-256 `2213ebc48b63c774cb7bf5312ef6e0d621a5cedbee44c39dedb4306b1c09b7e1`; remote reconstruction/closure checking remains required. Smart City main46 crashed in browser startup before measuring the framing fix; a fresh browser run is queued.

**Source lifecycle / complete-input checkpoint (2026-09-06 UTC):** Run48 built and packed all29 packages and its complete source scaffold command passed (`SOURCE48_EXIT=0`); exact-installed lifecycle remains in flight. Source identity extraction removed unintended CLI initialization from browser collection and preserved 57/57 administrative/lineage regressions. The local asset dependency checker passes after CLI-produced provenance/thumbnail repairs; remote inventory found66 missing dependencies. Parent streamed72 exact assets/source files (999,498,572 bytes of file contents) to the remote hydration archive, SHA-256 `6eeb1f94f0c232a3ac6f4ea82f55bef887858d482a7392f023da40845ef11176`; application and closure verification are queued. Clash side23 passes real visible/hidden/restored pixel and draw controls (11,786 visible pixels, zero representation/repeat difference, 144→117→116 draws), but runtime-label evidence filtering still failed; corrected filtering and retained-label assertions are queued. Smart City main41 passes desktop command composition but times out after district selection; actual interaction scheduling correction is assigned. Full WebGL material run side25 selected13 tests: B3 and all-map C1 pass;11 sparse/base/combined C1 variants fail material-binding validation and remain open. Native43 repeats the40-case atlas pass, while the new environment test required corrected environment-source binding. Native44 is running the actual two-inflight P01 candidate, cubic temporal reconstruction diagnostic and corrected environment regression. No full release work order is newly closed.

**Native material milestone (2026-09-06 UTC):** Native run34006289631 passes all 40 material-map controls after anisotropy and iridescence were combined in the same substrate BRDF. The independent owner recomputed all 40 metrics and verified 46 PNG file/RGBA hashes; all eight decoys, both zero-film controls and missing optional attribute control are exactly zero. Previously failing UV1/thickness controls now change 530/80/79 pixels respectively, with unchanged fixtures and thresholds. This proves the native material matrix, not every R04 root/release obligation. Current focused rerun of the three previously failing marker/docs/known-limits files passes 8/8; the other eight historical unit failures depend on regenerated route/comparison/freshness artifacts. Native42 is queued for the unchanged full P01 workload on the verified macOS14 adapter plus the converged temporal supersampling diagnostic. Clash side21 still encounters a lower-level empty-public-geometry guard; complete bridge creation-path correction is assigned before another behavioral retry.

**Execution repair checkpoint (2026-09-06 UTC):** Remote observer35 confirmed the missing tracked fighting-game asset. Main38 hydrated the exact file, added the optional existing `A3D_WEBGPU_BROWSER_EXECUTABLE` convention to lifecycle configuration, and launched build/pack/source/installed run48 under observed PID134201. The failed browser-install attempt removed an older cached browser; main37 restored the existing exact Chrome147 archive, verified its version, and side21 reruns the affected Clash check (side20 failed before launch and supplies no behavioral evidence). P02 side19 completed all five original 60-second legs, but point-face Float32 boundary validation and weak negative controls still prevent acceptance. Smart City side18 measured 204 visible fleet pixels in both paths, zero representation/repeat difference and five fewer native draw calls. ARM macOS14 native adapter/control probe34006264521 measured completion p95 18.6ms and rAF p95 18.0ms, supporting a full unchanged P01 run; the control is not particle-performance acceptance.

**Remote acceptance checkpoint (2026-09-06 UTC):** Snapshot 45 passed the browser semantic compiler and Smart City I03 actual native-fleet visibility/draw-reduction test. Aura Clash still failed its hidden-crowd control at a third production-render guard; that guard is corrected and the focused rerun is queued as side20. Source lifecycle 43 completed all 19 scaffolds with one failure: the fighting-game robot GLB was absent from the remote template snapshot, confirmed by observer35; the local tracked asset and generated manifest agree at 5,500,216 bytes and SHA-256 `252b3a16d5a8d7fd67a4304ec8135d4fa492802a31bc2fc2d4614e130a1f4e73`. Exact asset hydration and rebuilt package evidence remain required. Installed lifecycle browser logs identify a missing Playwright Chromium headless-shell executable; remote browser repair is queued. P02 intensity-corrected fixture is queued as side19 with unchanged thresholds. Native40 material atlas still fails iridescence UV1 (3 changed channels versus required >10); native39 static temporal diagnostics do not satisfy the failing R02 acceptance. No full work order or final release obligation is newly marked complete.

**Independent integration audit checkpoint (2026-09-06 UTC):** The independent code audit identified omitted specialized proof arguments in administrative replay, final-claims replay and quarantine resolution, plus missing handling for tasks proved by the newer non-test contracts. Parent corrected all four paths, retained named-test requirements alongside specialized contracts, and added negative administrative/quarantine regressions; **57/57** focused tests pass. Zero unmapped requirements is therefore still not treated as release proof. The GLB instance normalization and attached-source renderer-selection fixes passed **5/5** focused owner tests; current source snapshot 45 (468 files, SHA-256 `3e93cfcb986c243d3666febacafe43948db39d0a4cf6b78ff53523acb6d9882f`) is queued for compiler and actual I03 validation. The standard Intel macOS probe exposed only SwiftShader fallback, so it cannot satisfy P01 native performance acceptance and no full particle benchmark was run there.

**Complete proof inventory / package checkpoint (2026-09-06 UTC):** Parent's latest traceability producer reports **756 obligations (515 original + 241 remediation), 191 explicit non-test contracts, zero unmapped proof requirements and zero missing named tests**. It still reports **zero final verified obligations**: complete mapping is not passing evidence. The latest remote build/pack run 43 passed and packed all 29 packages; the source/exact-installed lifecycle sequence is running separately and remains unverified. Raw Smart City captures show individual fleet visibility but zero native-fleet visibility despite native submissions; its root GLB transform path applies normalization twice, and a matrix-correctness fix is underway. The next P02 diagnostic samples the actual shadow depth texture after native uniforms were verified correct. A standard Intel macOS adapter/control probe has started to investigate the virtual-M1 pacing limitation without lowering P01 thresholds.

**Registry contracts and runtime failure checkpoint (2026-09-06 UTC):** Parent inventory now reports **756 obligations, 189 explicit non-test contracts, two unmapped proof requirements and zero final verified obligations**. The remaining mappings are release-commit report regeneration and the combined notes/registry/marketing verification obligation. Registry consumer/scaffold contracts now require actual registry-resolved locks, all 29 consumer results, matching downloaded archives and all 19 registry-installed scaffolds; opt-in producer support is implemented, not executed before publication. Focused owner checks passed **55/55**. Package run 40 stopped before build because the worker identity environment field was absent; the queued retry reads the actual EC2 instance identity from metadata. P02 side12 still failed spotlight receiver contrast after the bias correction; the next probe reads actual GPU uniforms. I03 side12 exposed zero visible representation change in Smart City and a root renderer-selection failure in Aura Clash when public crowd nodes are hidden. Both failures remain open with their retained artifacts and implementation owner.

**Browser compiler and remaining-contract checkpoint (2026-09-06 UTC):** Remote semantic check 40 passed with exit zero after the actual Recast installation, camera matrix type fix, complete MJS declarations, Smart City protocol fields and an explicit typed rig roster. Parent read the empty compiler log and `BROWSER_SEMANTIC40_EXIT=0` in the remote observer log. The current inventory now reports **756 obligations, 180 explicit non-test contracts, 11 unmapped proof requirements, zero missing named tests and zero final verified obligations**. Marketing replay and ten original L2/L3 claim obligations are integrated, but require actual evidence. Remote job 33 architecture spotlight adoption passed both desktop/mobile cases **2/2 in 4.3 minutes**; spotlight stability failed because the measured perspective-depth separation was smaller than its bias. Fixed bias values are disclosed in the next full unchanged-duration stress run. Isolated build/pack and both full 19-scaffold lifecycle legs are queued on the compiler-passing snapshot; they are not yet reported as passed.

**Remote dependency recovery checkpoint (2026-09-06 UTC):** Parent confirmed the existing AWS worker running and queued isolated side job 9 with a SHA-verified 453-file snapshot and original root-served Aura Clash GLBs. The remote Recast 0.43.1 installation succeeded (four packages, one second). Browser semantic check 37 executed fully and narrowed the failures to six diagnostics: camera matrix return type, two missing Smart City systems fields, and three missing JavaScript-module declarations. Camera/Smart City source corrections are applied; declaration repairs and the next full remote semantic pass remain pending. This is an actual failed compiler result, not a semantic completion claim.

**Operational contract checkpoint (2026-09-06 UTC):** Canonical release sequencing and Q02 route/typed-asset replay are now integrated into receipt validation and both readiness consumers. Parent reran the inventory: **756 obligations, 168 explicit non-test contracts, 23 unmapped proof requirements, zero missing named tests and zero final verified obligations**. This supersedes earlier 39-gap inventory counts; implemented validation is not proof of completed release work. Parent route/lineage/requirement checks passed **51/51**, then the added wrong-kind/missing/malformed route-proof rejection checks passed in the **32/32** lineage suite. Native run `34004109258` passed R03; root R02 WebGL image quality and six native material controls still failed and have new candidates awaiting execution. Native particle run 35 passed median FPS and sustained slowdown but failed p95 **22.3 ms** against **20 ms**; its clear-only control also failed at **21.3 ms**, and this adapter explicitly lacks timestamp-query support. No pacing threshold was changed. Remote semantic errors were reduced to seven source diagnostics plus missing Recast installation and stale camera-overlay inputs; source fixes are ready, full semantic success remains unproven.

**Full mission and camera checkpoint (2026-09-06 UTC):** Remote job 31 completed Deep Recovery **1/1 in 7.3 minutes**, including standard/breach/heavy/surface mission, reset, blackout, mobile touch and reduced-motion second mount. Parent inspected the terminal exit-zero log, all 20 recorded scenarios and all 11 retained PNG hashes (zero missing or mismatched artifacts). This frozen run predates the correction that keeps sonar and wreck-approach pixels distinct, so final image-family acceptance remains open. Camera near/far clipping now propagates through all eight public constructors and the shared root projection; **15/15** new clipping tests and **61/61** existing API/camera tests passed. Actual comparison reruns remain required. Final claims now have explicit release-gate linkage and reject self-supporting final-claims receipts; parent checks passed **46/46** lineage/requirements and **10/10** document tests. No full work order is closed by these scoped results.

**Execution recovery checkpoint (2026-09-06 UTC):** The parent recovered the live AWS worker and resumed independent native, route, temporal, scaffold and acceptance-contract work. GitHub native run `34003849449` is executing the coherent current overlay; its results are pending. Current R04 shader/atlas/lifecycle checks passed **41/41** across six files; this does not close the two previously failing native UV1 pixel controls. Scaffold tool resolution now uses each scaffold's own dependency tree, and command deadlines reject unbounded values; helper checks passed **13/13**, package acceptance checks **30/30**. Both complete 19-scaffold lifecycle legs remain pending. Deep Recovery now retains distinct sonar and wreck-approach screenshots, bounded capture timing and per-operation progress; success is recorded only after its full receipt is written. Browser semantic execution exposed fixture typing errors, which are being corrected; it is not yet passing. The current traceability producer reports **756 obligations, 152 explicit non-test contracts, 39 unmapped proof contracts and zero final verified obligations**. No section is marked complete from these development checkpoints.

Only individual requirements with matching evidence are checked. **No full work order or release is complete yet.** Passing unit tests establish the behaviors asserted there; browser, native hardware, final-source and release obligations remain separate.

| Work order | Implemented / verified so far | Still required before section completion |
| --- | --- | --- |
| G01/G02 | Fail-closed aggregation, baseline abort, scoped outputs and immutable evidence validation implemented. Parent rerun: **35/35** readiness/lineage tests pass. Five matching unit-level checklist items checked below. | Full remote integration; actual claim/metric/release producers; final source/tarball receipts. |
| G03 | Explicit E/H/I/U infrastructure gate registrations added. | Required browser suites and task-specific proof, not command wrappers alone. |
| Q01 | The execution loader preserves 515 original obligations and 241 remediation/explicit archival obligations, with exact task/test mappings. Latest targeted traceability run: **12/12**. | Substantive evidence review/closure of original obligations; metadata gaps remain open. |
| I01 | Actual damping/cursor zoom/pan bounds implemented; pointer cancellation corrected. Focused controls **24/24**; remote job 11 actual-input browser **4/4**. | Final-source scene/input receipts and full section acceptance audit. |
| I02 | Role-based measured placement and truthful telemetry implemented. **24/24** unit tests; remote job 11 desktop/mobile placement **3/3**. Two matching checklist items checked. | Readability/hero review and final-source receipts. |
| R04 | Eight extension slots and full WebGL2 scalar-atlas path implemented with all five base maps plus environment/shadows in 15 samplers. Focused shader/material **36/36**, atlas/PNG **3/3**. | Actual all-map pixel controls, atlas dimension/filtering audit, WebGPU integration, disposal and final receipts. |
| R05 | Live-target SSR and actual camera forwarding implemented. B4 units **10/10**, planner **21/21**; remote job 11 reflection/movement/occlusion browser **1/1**. | Full resource lifecycle audit and final-source receipts. |
| R06 | Six stages dispatch canonical native passes; tone alias corrected. Focused tests **21/21**; remote job 12 tone and six-stage pixel/essential-pass controls **2/2**, 7.3 seconds. | Full dependency/lifecycle/consumer audit and final-source receipts; broader root-path gate remains open. |
| R01 | Actual asynchronous dispatch and lifecycle implemented. Remote job 14 root-only sync/async bloom **1/1**, eight hashed readback PNGs retained and parent verified. | Full pending-work lifecycle acceptance audit and final-source release receipts. |
| R02/R03 | Root temporal bridge implemented; remote job 20 movement/static/cut controls **1/1**, 35.9 seconds. Native Metal CI 34000499923 completed: HDR passed, TAA failed a portable shader binding marker; the runtime correction passed 8/8 focused tests and native rerun 34000831583 passed its dedicated TAA sequence 1/1. | Retained root frame sequences, predeclared temporal quality/disocclusion metrics, reset/device-loss proof and final receipts. |
| E01 | Translated CLI fixture and actual sole-vertex/pose measurements implemented; corrected foot orientation, sole weights and IK length distortion. Root pose consumer added; 16-pair rendered producer authored. Pair/binding **16/16** and sole/pose **15/15**. | Remote straight/turn/slope/blocked/crossfade results and all-pair rendered contact/correction quality evidence. |
| P01/P02 | GPU completion fence and full live-particle producer implemented; **32/32** focused particle/device tests. Real 60-second shadow producer and matching observed-state tests **2/2**. | Root shadow diagnostic forwarding, native reference runs, measured thresholds and visual review. |
| D01 | Draco 1.5.7, Meshoptimizer 1.2.0 and KTX 1.0.1 aligned. Alignment **12/12**, compression **15/15**, network **3/3**; strengthened remote job 9 compressed-asset pixel assertions **3/3**. | Exact-installed optional dependency validation and final-source receipts. |
| I03/I04/V01/V02/Q02/L01/L02 | Crowd representation consumers, Smart City instancing, camera/architecture spotlight adoption and comparison producers are progressing. Canonical 3.0.1 version preparation covers 29 public packages and 19 scaffolds. | Remaining Clash integration, actual route/comparison proof, exact packages/lifecycles, independent review and release execution. |

**Parent-verified checkpoint command (2026-09-05):** `pnpm exec vitest run tests/unit/tools/muse3jsparity-readiness.test.ts tests/unit/tools/muse3jsparity-evidence-lineage.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=/tmp/aura301-tracking-gates.json` — exit 0, 2 files, 35/35 tests, 1.93 seconds. Temporary JSON is a local checkpoint; it does not replace immutable final-release receipts. Other results above are retained task execution results and remain subject to integrated final-tree validation.

**Remote validation:** AWS worker execution is operational with system CA verification enabled. Integrated typechecking passed on the job 9 snapshot. Browser jobs 9–12 established the scoped successes above. The first full unit run had 4,417 passed, 148 failed and 17 skipped; it is not acceptance. Job 13 verified all 66 transport chunks, authentic Git objects/refs and 877 historical fixture inputs, restored only missing fixture paths, and retained their historical classification separately from release evidence. Job 14 verified Git integrity; its current typecheck/build attempt found a newly added locomotion test helper using `toSorted` beyond the configured target library, which was corrected before job 15. Strengthened R01 artifact verification passed against authentic Git metadata. Job 15 subsequently passed TypeScript compilation and the raw build, generating all 29 package exports in 28 seconds; its full unit rerun completed with **4,594 passed, 44 failed and zero skipped** across 607 files in 230.62 seconds. This improves on the first run but is not acceptance. Remaining renderer contract fixtures, missing remote assets and current-evidence regeneration have separate owners. C1/E01 browser checks and subsequent functional suites remain in progress. Full units, route/comparison suites, exact-package lifecycles and final receipts remain required. CPU-only workers cannot satisfy native Apple Metal performance requirements. A separate isolated macOS CI adapter probe passed in GitHub Actions run `33999331604` (probe commit `80b94526126f2fc4f3d01b29de27911288f6157b`): Apple M1 (Virtual), non-fallback Apple adapter, Metal browser backend, actual compute/readback `[17,18,21,26]`, zero validation errors. Parent inspected the downloaded adapter report. This establishes a remote native-functional execution path only; it is not engine or sustained-performance acceptance. Any later performance result must name this virtual M1 and disclose conditions; it cannot silently stand in for a different historical reference device. Final worker cleanup remains with the remote owner.

**Resumed execution checkpoint:** Parent reran the traceability suite: **12/12 passed**, exit 0, 739 ms. The original working PRD now links to this remediation contract and includes a correction mapping; `git diff --quiet -- release-artifacts/muse3jsparity-PRD-3.0.0.md` confirms the archived PRD is unchanged. These checks do not close Q01's remaining receipt and acceptance review. The remote owner revalidated both earlier task instances as running and recovered their polling interface. R01's actual WebGL async dispatch and texture disposal hook are implemented with an initial **6/6** lifecycle run reported by its owner. D01's effective workspace override and aligned lockfile are implemented; its owner reports **12/12** alignment and **15/15** compression tests. Browser and final-source validation remain required for both work orders.

**Governor/integration/installer checkpoint (2026-09-05):** Remote job 27 passed the actual overloaded-root governor browser test **1/1 in 2.9 minutes**. Parent replayed all 11 resource-adaptation rungs with `validateRootGovernorReport`: zero errors, full-quality restoration present, and a deliberately unchanged particle workload was rejected. The report explicitly identifies SwiftShader and CPU-simulated particle geometry rendered through the sole root owner; it proves functional adaptation, not reference-hardware performance. Remote job 29 passed the named integration command **11/11 across nine files** and the full root-path browser suite **4/4**; the independent 983 rendering-assertion floor belongs to full unit verification, not integration. Installer side probe 1 resolved the prior routing failure: explicit npm proxy options produced actual HTTP 200 responses and installed the seven selected exact tarballs in **5.86 seconds**, exit zero. Parent inspected the retained HTTP log. Complete 19-template source/exact-installed lifecycles remain required; this bounded diagnostic does not replace them.

**Particle acceptance replay correction (2026-09-05):** Parent corrected a demonstrated mismatch between the native producer and canonical P01 acceptance. The producer measures one-second rolling FPS; acceptance previously summed only consecutive individually slow frames, allowing intervening fast frames to hide a sustained rolling slowdown. Both now use `tools/muse3jsparity-readiness/particle-pacing.ts`, preserving the producer's existing algorithm and thresholds. Acceptance also uses the same timestamp-derived within-window intervals and quantile boundary. Focused tests passed **16/16**, including alternating 10/30 ms frames whose global percentiles pass but sustained cadence fails, and the exact p95 boundary. Replaying all 3,534 native-run-28 completion timestamps reproduced every one of its 3,475 rolling samples and its 1,001.8 ms sustained-slow interval exactly. The workload/visual/disclosure requirements below are now verified from that run; performance remains failed and open.

**Route and snapshot follow-up (2026-09-05):** The Q02 source review identified four Neon Corridor primary-environment violations: continuous primitive deck/wall/ceiling surfaces concealed the typed world. The route owner removed those visual covers while preserving gameplay/physics and added an actual-route typed-world visibility negative-control test; syntax checks passed, but browser/gameplay/visual acceptance remains open. Job 24 exposed an existing Gravity pod asset missing from the remote input set despite the five new planet assets being present; transport is now checking the complete generated dependency set. Smart City and I04 captures reached external limits shorter than their configured suite duration, so stage logs, retained partial diagnostics and appropriately bounded whole-suite runs are being added. No partial run is counted as acceptance. Native runs `34001804247` and `34001977316` were invalidated after their snapshots omitted the new relative dependency `WebGPUExtensionAtlas.ts`; the native owner is checking the complete frozen dependency closure before replacement execution. Earlier verified native results remain tied to their own snapshots.

**Integrated execution checkpoint (2026-09-05, remote job 23):** The full unit run completed with **4,665 passed and 11 failed** across 612 files in 232.52 seconds; parent inspected the raw failure log. Remaining failures include stale evidence, missing transported report inputs, generated API documentation, a stale UV limitation assertion and a capability-diagnostic audit entry. These remain failures until corrected and rerun. The strengthened public-root asynchronous browser test passed **1/1 in 1.9 minutes**: actual native draws, zero permitted hot-path readbacks, deferred/applied resize, preserved pause, capture-failure recovery and mutation/disposal rejection were asserted. Both hardened framegraph tests passed **2/2 in 7.6 seconds**. The root temporal test passed **1/1 in 38.3 seconds** with all **240 PNG frames** retained across ten sequences; source identity, hashes and lossless readback correspondence were independently checked by its owner. Predeclared root temporal edge/ghosting quality acceptance remains open. The all-eight-map browser control failed its iridescence pixel-change assertion and remains assigned for correction.

**Native color/HDR checkpoint (2026-09-05):** CI run `34001405501` passed both browser tests. Parent inspected `webgpu-basic-color-301/report.json`: all nine native pixel samples exactly match analytical RGBA expectations for no-color, RGB and RGBA geometry, including interpolated alpha; three native submissions and nine explicit readbacks, zero errors. Parent also inspected `webgpu-post-j2/hdr301.json`: all three quality modes retain floating-point `[6, 3, 0.75]` and tone-map to `[219, 191, 109]`, zero errors. Effective source manifest SHA-256: `7b3883faa1ce13d471f0d38858126c05a8471622eedcbece12dbeca55d140a5d`. This covers generated-basic color and HDR; generated-texture and specialized PBR color handling remain separate implementation/verification work.

**Resident particle checkpoint (2026-09-05):** Native run `34001291939` measured median **59.88 FPS**, CPU completion **4.3 ms**, and **128 bytes of readback per frame**, improving the earlier 18.76 FPS / 43.75 ms / 1.968 MB measurements. Acceptance still failed: minimum projected/rendered count **7,256** is below 10,000, and frame-time p95 **23.2 ms** exceeds 20 ms. The 60.0157-second window retained 3,517 frames. Framing and redundant completion synchronization are being corrected with unchanged workload, resolution and thresholds. The strengthened native TAA producer in the same run failed its retained-frame lookup; the prior functional pass does not substitute for that stronger quality run.

**Native lifecycle checkpoint (2026-09-05):** Device-loss CI run `34001113669` passed 1/1 (9.56 seconds). Parent inspected raw `native-device-loss.json` and test assertions: real native `destroy()` caused pending `mapAsync` to reject with AbortError, subsequent render/read rejected context loss, all history/retained targets disposed, and no WebGL context was requested. An explicitly constructed new WebGPU device rendered nonzero output with fresh TAA seed versus cold-reference maximum pixel delta zero. This proves the exercised native loss/reconstruction path; broader root/backend lifecycle and final-source acceptance remain separate.

**Native GPU result checkpoint (2026-09-05):** Parent inspected raw artifacts from CI run `34000499923`. HDR passed all three qualities with actual floating-point output `[6, 3, 0.75]` and tone-mapped bytes `[219, 191, 109]`, zero errors. TAA failed before sequence completion because its temporal shader lacked the required portable WGSL bindings marker. Particle counters exceeded the required occupancy, but parent screenshot inspection subsequently reopened rendered-workload acceptance; performance thresholds also failed. GitHub steps configured to continue after errors reported success; the final aggregate and raw test reports correctly failed. Step status alone is not acceptance.

**Package lifecycle follow-up (2026-09-05):** Source lifecycle run 21 progressed into ten scaffold directories before its external 240-second limit; it did not produce final acceptance. Exact-installed run 22 retained a passing frozen-lock receipt but reached its 720-second limit with no lifecycle report (`INSTALLED_EXIT=124`). Parent inspected the terminal job log. Partial installation artifacts are retained; install-stage streaming and registry/proxy diagnostics are being added before another run. Candidate package checks now use an isolated copy while the functional source advances. Neither lifecycle leg is checked complete.

**First package execution checkpoint (2026-09-05, 00:08 UTC September 6):** Remote job 21 passed the current TypeScript/raw build and packed all 29 public packages at 3.0.1 (`PACK_EXIT=0`); parent inspected the live log and counted the 29 packed rows. Source scaffold lifecycle execution is running; its preliminary template unit suite passed 4/4. Packing alone does not close installation, compatibility, bundle, provenance or scaffold lifecycle requirements. Native Metal engine CI run `34000499923` uses immutable archive SHA-256 `3a4504bb25245994bfcb55f4e5ff7fdcc6123e57c5ac680643fcacc83c888aaf` with 12,353 file hashes; its raw engine results are recorded in the native GPU checkpoint above.

**Renderer verification checkpoint (2026-09-05):** Native WebGPU bloom now retains a floating-point composite through tone mapping, including HDR performance-quality mip handling, and pipeline caching distinguishes quality-dependent fragment layouts. The final renderer suite passed 118/118, including native target formats, composite → tone → presentation order, no CPU readback and performance → balanced → cinematic → performance pipeline counts `[1, 2, 3, 3]`. A native GPU numerical oracle remains queued. Root diagnostics now refresh asynchronous resource observations without rendering or advancing simulation; immutable report snapshots and busy/disposed guards passed 9/9 focused tests. The texture browser rerun remains required.

**Release-tooling checkpoint (2026-09-05):** Canonical package acceptance now replays exact 29-package smoke/signature validation, actual packed-template/version inventory and source-bound command receipts. The version producer corrected the marketing candidate pin. Failure recording retains actual stdout/stderr and process exit even when post-command source/plan validation rejects the run (24/24 focused producer tests). Publication/tag verification rejects uncommitted source. Deployed-origin collection uses rendered visible installation commands, rejects conflicting active pins, and retains rendered same-origin docs evidence; hidden or historical pins cannot substitute for the current installation instructions. These are tooling checks, not successful package lifecycles, deployment or publication evidence.

## 1. Product objective and release contract

Finish every code-verified implementation, integration and evidence shortfall identified in the 3.0.0 completion audit, then make the release gate incapable of certifying missing work. The target is a compatible 3.0.1 remediation release with exact-source, exact-tarball and exact-visual-artifact proof. This is a plan for implementation and release work; creating this file does not execute that work or publish anything.

The audit found substantive remaining tasks despite green retained baseline tests. Preserve successful implementations and strengthen missing coverage. In particular, 3.0.0 retained 4,417/4,417 unit tests, 11/11 integration tests and 149 checks across 19 scaffolds on both source and local-tarball legs. These are historical evidence, not a new 3.0.1 run. A part omitted by K2 is not automatically broken; it requires explicit coverage and regression validation.

Completion means every numbered task and checkbox below is satisfied by the specified implementation and proof. Config descriptors, counters, warnings, file existence, a smaller live workload or a different test route do not satisfy behavioral requirements. A requirement cannot be closed by writing a caveat into its checked item. The proposed filename manifest and test additions are implementation scope, not claims that those files already exist. Do not silently drop tasks or lower thresholds; record any actual owner-directed scope change explicitly and keep the original obligation traceable.

All thresholds introduced here are **proposed 3.0.1 acceptance requirements**, not claims about measured current behavior. Pin comparison scene definitions and threshold values before final tuning. SSIM measures similarity, not superiority by itself.

## 2. Scope boundaries and execution rules

- Preserve the original explicit non-goals: universal ecosystem/TSL parity, GI/path tracing, real-device XR without hardware proof, spectral dispersion, LTC-identity rect lights, full-body IK/ragdoll/motion matching, arbitrary-font shaping, netcode and OpenEXR. Do not reintroduce them merely because a matrix row is OUT.
- Root claims require tests that mount through public `@aura3d/engine`; package/runtime proof must retain its label. Read `llms.txt` and `docs/agents/claims-and-boundaries.md` before implementation and public wording.
- No new AI/provider integration is needed by this PRD. If implementation scope later introduces one, inspect Kiro Prism first under the standing policy.
- Heavy builds, broad test suites, all browser/E2E/visual suites and GPU stress run remotely. Reuse project CI/cloud environments; provision a minimal ephemeral shared AWS runner when needed. No local Docker or local browser suite fallback. Native GPU claims require suitable actual GPU hardware; software adapters do not establish native hardware performance.
- Parallelize independent streams with explicit file ownership. A single owner coordinates shared `agent-api/index.ts`, `Renderer.ts`, device/shader files, manifests and lockfile; shared mutable edits are a real sequencing dependency. Preserve unrelated worktree changes.
- All report JSON/PNGs, generated shaders, asset manifests/references and package output must be produced by their tools. Never hand-author green evidence. Do not edit dist as source.
- Complete all concrete artifacts before independent human review. The root AGENTS rule says: “A route is not approved merely because automated evidence is green; exact final artifacts require independent human review.” This requires a real human-origin final decision, not an agent signature.
- Build/validation failures are work to resolve. Scope-changing or unsupported-hardware outcomes remain explicitly incomplete rather than being disguised as success.

## 3. Prioritized hit list

Detailed sections below assign changes to concrete filenames. **EDIT** means the file exists at the verification baseline. **NEW** means a proposed file/output, not evidence that it already exists. Some NEW tests require their matching HTML entry or fixture/typed-asset files, stated in the task. Generated-output entries are destinations only; their producers own the work.

| Priority | ID | Original area | Required outcome |
| --- | --- | --- | --- |
| P0 | [G01](#g01) | K2 / R | Make readiness fail closed for every required part |
| P0 | [G02](#g02) | K1 freshness / K2 / R quarantine / L7 | Bind evidence to source, artifact hashes and actual time |
| P0 | [G03](#g03) | E / H / I / U | Add the omitted animation, physics, input/audio and recovery gate coverage |
| P1 | [R01](#r01) | A1 | Deliver an actual root async render path and prove native routing |
| P1 | [R02](#r02) | A3 | Implement root motion blur and TAA end to end |
| P1 | [R03](#r03) | J2 | Port and prove native WebGPU TAA |
| P1 | [R04](#r04) | C1 | Promote clearcoat, sheen, iridescence and anisotropy texture maps |
| P1 | [R05](#r05) | B4 | Finish B4 reflection-surface SSR using the existing native renderer |
| P1 | [R06](#r06) | T3 | Replace counter-only framegraph passes with real resource flow |
| P1 | [P01](#p01) | A4 | Re-earn the full 10,000-live-particle performance requirement |
| P1 | [P02](#p02) | B1 | Measure rendered shadow stability over the requested stress run |
| P1 | [E01](#e01) | E2 | Complete translated root-motion locomotion and measured rig profiles |
| P1 | [I01](#i01) | F1 / N2 | Finish control damping, cursor zoom and pan bounds |
| P1 | [I02](#i02) | N4 | Wire per-role label collision behavior into real placement |
| P1 | [I03](#i03) | O1 / P2 | Render crowd LOD transitions and adopt instanced GLBs in real scenes |
| P1 | [I04](#i04) | F2 / N1 | Complete the named camera and spotlight route adoptions |
| P1 | [D01](#d01) | S / M2 | Align decoder versions and enforce the installed comparison matrix |
| P1 | [V01](#v01) | K1 | Implement the original feature-by-feature r185 visual comparison |
| P1 | [V02](#v02) | K1 performance / J1 / A4 | Measure end-to-end comparative game workloads |
| P2 | [Q01](#q01) | Original PRD / master checklist / K2 / L7 | Reconcile original tasks, checklists and generated evidence |
| P2 | [Q02](#q02) | L2 / L3 / L4 / full boundaries sweep | Revalidate route framing, public claims and release assets |
| P2 | [L01](#l01) | L1 / J3 / L5 / L7 | Prepare compatible 3.0.1 packages and exact-installed validation |
| P2 | [L02](#l02) | L2–L7 | Create exact-artifact visual review and complete release verification |

## 4. File-by-file work orders

<a id="g01"></a>

### G01. Make readiness fail closed for every required part

**Original obligation:** K2 / R.
**Dependencies:** None; start first.

**Code-verified current state:** `tools/muse3jsparity-readiness/index.ts:255–279` marks uncovered parts blocked but computes overall only from gate results. The retained full report has E/H/I/U blocked and overall supersede. Baseline stages run sequentially without an immediate abort between R and downstream work.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tools/muse3jsparity-readiness/index.ts` | Extract aggregation; require part and task coverage; abort after baseline failure. |
| NEW | `tools/muse3jsparity-readiness/contracts.ts` | Pure typed requirement/gate/receipt model and verdict reduction. |
| NEW | `tests/unit/tools/muse3jsparity-readiness.test.ts` | Regression tests for false-success, missing coverage, baseline abort and scoped runs. |
| EDIT | `package.json` | Keep existing release entry; add a traceability check and explicit scoped validation if needed. |

**Detailed tasks**

1. Define required parts A–J, M–V and K, plus explicit L release obligations; map each to named required gates. A broad K1 smoke must not imply every task in several parts passed.
2. Compute overall from both required gates and required task/part verdicts. Any required failure or missing receipt blocks release; unresolved quarantine or incomplete work cannot yield supersede.
3. Run baseline first. If typecheck, unit, or integration fails, record the failure and unexecuted downstream gates, then stop costly stages. Preserve the current subprocess-exit check; do not claim the old numeric failure ceiling bypasses a nonzero Vitest exit.
4. Replace the obsolete allowed-failure ceiling of 12 with zero. Preserve at least the current 4,417 unit-test floor and current rendering inventory (983 retained assertions); identify removed tests rather than allowing totals alone to hide deletions.
5. Give --only runs an explicitly partial scope. A passing subset must never overwrite the full release receipt or return a full-program supersede verdict.

**Completion checklist**

- [x] The existing E/H/I/U-blocked fixture cannot produce supersede. **Verified 2026-09-05:** focused readiness/lineage regression run, 35/35 passed (command and scope in execution log).
- [x] Missing/unknown/duplicate required task IDs and missing receipts fail closed. **Verified 2026-09-05:** focused readiness/lineage regression run, 35/35 passed (command and scope in execution log).
- [x] A simulated baseline failure proves later runners were not invoked. **Verified 2026-09-05:** focused readiness/lineage regression run, 35/35 passed (command and scope in execution log).
- [ ] Zero failed required tests; scoped success remains distinct from release completion.

**Evidence gate:** Pure unit regression output plus a final complete release JSON covering all required parts and tasks.

<a id="g02"></a>

### G02. Bind evidence to source, artifact hashes and actual time

**Original obligation:** K1 freshness / K2 / R quarantine / L7.
**Dependencies:** G01.

**Code-verified current state:** K2 records shared browser.json paths and no sourceCommit. Its freshness block at lines 241–251 checks that K1 gates passed, not elapsed receipt age. quarantine.json retains an earlier failure after later success.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tools/muse3jsparity-readiness/index.ts` | Create immutable run directories, enforce source/time checks and preserve resolved quarantine history. |
| EDIT | `tests/browser/game-visual-superiority.spec.ts` | Emit gate-specific receipts with exact evidence lineage. |
| EDIT | `tests/browser/library-parity-superiority.spec.ts` | Replace stale P2 open note with its newer evidence dependency; check content, not file presence alone. |
| EDIT | `tests/browser/root-path-integrity.spec.ts` | Emit its own source-bound receipt. |
| NEW | `tests/unit/tools/muse3jsparity-evidence-lineage.test.ts` | Tamper/staleness/wrong-source and quarantine-resolution cases. |

**Detailed tasks**

1. Record run ID, command, exit code, start/end UTC, source commit/tree, lockfile SHA-256, relevant source fingerprint, package/tarball hashes, browser/backend/hardware and claim surface.
2. Use unique output paths per gate/run; aggregate references must include receipt hashes. Preserve prior runs instead of overwriting the only proof.
3. Enforce the original 30-minute rule at aggregation against actual timestamps and dependency fingerprints. Schedule expensive baseline/build work before the final comparison capture window; if elapsed time exceeds the window, re-earn dependent comparisons.
4. Reject future timestamps, malformed reports, missing files, mismatched hashes, source changes and unexecuted required gates. File mtime or nontrivial byte size is not sufficient evidence.
5. Keep quarantine failures as history, record resolution only after a successful rerun on the required source, and prevent unresolved quarantine from passing.

**Completion checklist**

- [x] Stale, tampered and wrong-commit fixtures fail. **Verified 2026-09-05:** focused readiness/lineage regression run, 35/35 passed (command and scope in execution log).
- [x] Later success resolves historical quarantine without deleting the failure record. **Verified 2026-09-05:** focused readiness/lineage regression run, 35/35 passed (command and scope in execution log).
- [ ] Every claimed result has an immutable producer receipt; no self-reference as freshness proof.
- [ ] Full release receipt identifies exactly which source and tarballs passed.

**Evidence gate:** Lineage negative tests and a generated per-run manifest linking all retained evidence.

<a id="g03"></a>

### G03. Add the omitted animation, physics, input/audio and recovery gate coverage

**Original obligation:** E / H / I / U.
**Dependencies:** G01, G02; E01 and rendering changes before final run.

**Code-verified current state:** The retained readiness report marks these four parts blocked because no recorded gate covers them. Relevant browser specs exist; this is missing aggregate coverage, not evidence that their implementations all fail.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tools/muse3jsparity-readiness/index.ts` | Register explicit E/H/I/U gates and receipt requirements. |
| EDIT | `tests/browser/certified-hero-rigs.spec.ts` | Retain rig-specific pixels/runtime results for E. |
| EDIT | `tests/browser/foot-planting.spec.ts` | Retain foot/contact results; include E2 follow-on proof. |
| EDIT | `tests/browser/physics-h1-promotions.spec.ts` | Retain root rigid-body/sensor/joint proof for H. |
| EDIT | `tests/browser/physics-debug-draw.spec.ts` | Retain H2 visual/debug proof. |
| EDIT | `tests/browser/input-browser.spec.ts` | Retain remap/combo/touch and truthful capability results. |
| EDIT | `tests/browser/audio-browser.spec.ts` | Retain audio capability/state/playback proof at supported scope. |
| EDIT | `tests/browser/resource-soak-u1.spec.ts` | Retain resource counts and measured memory trend. |
| EDIT | `tests/browser/context-loss-recovery.spec.ts` | Retain context-loss/restoration evidence. |
| EDIT | `tests/browser/deep-recovery-playable.spec.ts` | Retain post-recovery gameplay proof. |

**Detailed tasks**

1. Map every E/H/I/U requirement to its exact source, unit test, browser test and receipt; include related existing tests discovered by tracing each section.
2. Run required tests remotely with retained logs and error channels. Distinguish injected XR/audio/haptic capability tests from physical-device proof.
3. Preserve valid soak semantics: existing 5 warmup +45 measured cycles are 50 cycles, not a five-cycle deficit. Prove resources return to baseline after disposal and restored routes remain interactive.
4. Integrate newly required E2 locomotion and temporal-resource recovery cases from this PRD.

**Completion checklist**

- [ ] E/H/I/U have executed gates and no uncovered required tasks.
- [ ] Disabling a required test or deleting a receipt blocks the aggregate.
- [ ] No new claim extends beyond the tested backend/device/surface.

**Evidence gate:** Gate-specific E/H/I/U reports produced on the final source tree.

<a id="r01"></a>

### R01. Deliver an actual root async render path and prove native routing

**Original obligation:** A1.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** The old A1 checked item explicitly substitutes rendering-package async proof because root never invokes renderAsync. Existing native-bloom-pyramid harness has a rendering-package async twin.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/engine/src/agent-api/index.ts` | Expose a compatible supported asynchronous root render/capture entry and diagnostics. |
| EDIT | `packages/engine/src/production-runtime/index.ts` | Wire the root entry to asynchronous production rendering; serialize ownership. |
| EDIT | `packages/rendering/src/Renderer.ts` | Preserve shared native fused implementation and async lifecycle semantics. |
| EDIT | `tests/browser/native-bloom-pyramid-harness.ts` | Drive async through public root imports rather than a package escape hatch. |
| EDIT | `tests/browser/native-bloom-pyramid.spec.ts` | Assert root sync and async execution mode, pixels and disposal. |
| NEW | `tests/unit/rendering/production-runtime-async-dispatch.test.ts` | Reject synchronous substitution for async WebGL rendering; verify awaited success/failure and temporal reset forwarding. |
| NEW | `packages/engine/src/agent-api/DeferredFrameResources.ts` | Hold native frame resources until all submitted work settles; defer resize/disposal. |
| NEW | `tests/unit/agent-api/deferred-frame-resources.test.ts` | Delayed submission tests assert original texture storage survives resize/disposal requests and failures clean up correctly. |
| EDIT | `tests/browser/root-path-integrity.spec.ts` | Include both supported root execution paths. |
| EDIT | `tests/browser/createAuraApp-postprocess-contract.spec.ts` | Preserve root effect routing contract. |
| EDIT | `docs/rendering/postprocess.md` | Document the final supported sync/async and temporal surface. |

**Detailed tasks**

1. Trace existing renderInteractiveFrameAsync/captureProofAsync hooks and reuse the appropriate owner. Add a documented root async method or option without breaking synchronous defaults.
2. Prevent concurrent sync/async rendering against the same mutable frame resources. Handle pause, resize, failed capture and dispose while work is pending.
3. Prove performance/balanced/cinematic bloom routing is renderer-owned-fused-ldr-native on both root paths, with device-observed submissions. Keep explicit capture readback separate from hot-path readback diagnostics.

**Completion checklist**

- [x] The async test imports only public @aura3d/engine for the application under test. **Verified 2026-09-05:** parent inspected all static/dynamic imports in `tests/browser/native-bloom-pyramid-harness.ts`: public engine APIs plus the generated typed asset map only. Remote job 8's native-bloom test also passed; separate screenshot retention and final-source receipt requirements remain open.
- [x] Both paths submit native bloom and render pixels; no hidden CPU pass-chain fallback. **Verified 2026-09-05:** remote job 14 strengthened native-bloom test passed 1/1 (1.7 minutes). Parent inspected public-root execution-mode assertions, the source-bound `pyramid-probe.json`, all eight retained PNG hashes, and the rendered async image. All three sync/async quality pairs have identical pixel hashes and report `renderer-owned-fused-ldr-native`; quality-path and knee controls change pixels. Final immutable release receipt binding remains required.
- [x] Pending async work cannot access disposed/reallocated resources. **Verified 2026-09-06:** focused final-worktree contract run passed 7/7 across `deferred-frame-resources.test.ts` and `production-runtime-async-dispatch.test.ts`. Delayed submissions retain their original texture storage until settlement; resize is deferred; disposal wins over resize and rejects new work; rejection releases held resources without masking the native error; failed frames recover ownership when disposal was not requested; the production wrapper awaits the async renderer, never calls the sync twin, and never retries synchronously after failure. The previously retained root-only native bloom sync/async browser evidence remains the pixel-backed companion proof.

**Evidence gate:** Root-only sync/async screenshots and diagnostics, plus lifecycle negative tests.

<a id="r02"></a>

### R02. Implement root motion blur and TAA end to end

**Original obligation:** A3.
**Dependencies:** G01–G03; shared renderer owner coordinated with R06.

**Code-verified current state:** Root index.ts:4451/4462 and mounted handling at 17575/17579 explicitly withhold motion blur/TAA for absent velocity/history bindings.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/engine/src/agent-api/index.ts` | Replace unconditional withholding with supported input binding and precise fallback conditions. |
| EDIT | `packages/engine/src/production-runtime/index.ts` | Carry previous/current frame transforms and temporal inputs. |
| EDIT | `packages/rendering/src/RendererPostprocessPlan.ts` | Validate real velocity/depth/history bindings and observed planned/submitted/pixel-backed states. |
| EDIT | `packages/rendering/src/Renderer.ts` | Own temporal targets, frame history and reset/disposal. |
| EDIT | `packages/rendering/src/WebGL2Device.ts` | Produce/consume temporal inputs and execute existing native temporal programs correctly. |
| EDIT | `tests/browser/root-effects-a3-harness.ts` | Moving-object, moving-camera, static-scene and cut/reset variants. |
| EDIT | `tests/browser/root-effects-a3.spec.ts` | Pixel and temporal-stability assertions instead of accepting withheld variants as completion. |
| NEW | `tests/unit/rendering/temporal-history-lifecycle.test.ts` | History invalidation and target ownership regression tests. |
| EDIT | `tests/unit/agent-api/root-effects-a3.test.ts` | Update requested/withheld semantics and valid-input propagation. |
| EDIT | `tests/unit/rendering/renderer-postprocess-plan.test.ts` | Prove real temporal bindings and invalidation. |

**Detailed tasks**

1. Implement real screen-space velocity for supported scene objects/camera motion, previous matrices and depth semantics; document any skinned/morph exclusions and fail closed for unsupported inputs.
2. Allocate history and velocity through the renderer owner. Invalidate/reseed on first frame, resize, camera cut, scene replacement, pause/resume discontinuity, backend change and context/device loss.
3. Wire effects.motionBlur and antiAlias({mode:taa}) to actual submissions. Bound motion vectors, rejection/disocclusion, jitter and accumulation to avoid ghosting.
4. Test on/off motion trails along expected direction and TAA edge stability over moving frames; include zero-motion and camera-cut negative controls.

**Completion checklist**

- [x] Supported root scenes show actualPasses and device-backed temporal output. **Verified 2026-09-05:** remote job 23 root temporal browser passed 1/1 (38.3 seconds). Parent verified all 240 retained PNG hashes and matching start/end source identity; motion-blur and TAA sequences report their actual native passes, with independently captured object/camera on/off pixel differences. This closes native output for the exercised supported root scenes; the separate edge-quality, ghosting and full lifecycle checks below remain open.
- [x] Missing inputs still emit named withholding reasons; successful inputs no longer do. **Verified 2026-09-06:** the named R02 contract run passed 38/38 across `renderer-postprocess-plan`, `root-effects-a3`, `temporal-history-lifecycle` and `production-runtime-async-dispatch`. Missing history/velocity are reported exactly as `taa:history`/`taa:velocity`, while complete explicit and renderer-owned bindings produce zero missing inputs and actual native submissions.
- [x] TAA improves predeclared temporal edge metric without failing ghosting/disocclusion limits. **Verified 2026-09-06:** native macOS run `34031893801` completed the exact integrated `R02 root rigid` browser command successfully on the immutable overlay. The frozen v2 oracle retained a 1,424-pixel edge mask (`4f602200…`), 8×/16× references and zero quality failures. TAA temporal residual was `0.0360885`/`0.0360845` versus baseline `0.0539381` and reset `0.0502423`/`0.0501652`; full-image spatial error was lower than both controls for both references. Reference convergence was `0.00080965`, actual ghost error was zero against a `0.952941` stale-history control, and cut/resume deltas were zero. Source start/end fingerprint remained `1c3fd69b…`.
- [x] No leaked history targets, stale frames after cuts or readback in normal temporal rendering. **Verified 2026-09-06:** the same 38/38 contract receipt proves reseeding after inactive frames, scene replacement, explicit reset and resize; releases replaced and final velocity/history targets; rejects aliased/disposed temporal inputs; and forwards pause resets through the runtime owner. Normal native TAA plans retain an empty `readbackPassNames` list. Integrated native run `34031893801` additionally retained zero cut and pause/resume deltas.

**Evidence gate:** Root temporal sequence PNGs/video, numeric edge/ghosting metrics, device diagnostics and lifecycle tests.

<a id="r03"></a>

### R03. Port and prove native WebGPU TAA

**Original obligation:** J2.
**Dependencies:** R02 temporal contract; appropriate remote native WebGPU hardware.

**Code-verified current state:** `docs/rendering/webgpu-current-architecture.md:46` proves FXAA but explicitly leaves TAA unproven. A combined fxaa-taa row must not stand for both.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/rendering/src/WebGPUDevice.ts` | Native temporal textures, bindings, pipeline execution and loss/resize cleanup. |
| EDIT | `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts` | Bridge temporal frame state into native WebGPU execution. |
| EDIT | `packages/rendering/src/production-runtime/shaders/wgsl/postprocess.wgsl` | TAA accumulation/rejection program using actual velocity/history. |
| EDIT | `tests/browser/webgpu-post-j2-harness.ts` | Native temporal sequence variants. |
| EDIT | `tests/browser/webgpu-post-j2.spec.ts` | Separate FXAA and TAA assertions, temporal quality and lifecycle. |
| EDIT | `docs/rendering/webgpu-current-architecture.md` | Separate capability rows backed by final receipts. |
| EDIT | `packages/rendering/src/webgpu/WebGPUPostProcess.ts` | Trace native shader ownership and implement temporal execution here where appropriate. |
| EDIT | `tests/unit/rendering/webgpu-post-j2.test.ts` | Native temporal options/binding contract. |

**Detailed tasks**

1. Reuse R02 temporal contracts while implementing genuine WGSL execution and explicit resource transitions/bind groups.
2. Test native adapter/device, backend identity, submissions, bound resources and rendered pixels for TAA; injected/mock WebGPU is insufficient for the positive claim.
3. Keep backend:webgpu strict. Retain truthful auto-fallback reasons and test device loss without silent WebGL substitution.

**Completion checklist**

- [x] TAA has its own native proof row and sequence metrics. **Verified 2026-09-05:** native CI 34000831583 passed the dedicated R03 test 1/1 (6.09 seconds). Parent inspected raw `r03-native-taa-sequence.json`, its assertions and retained capture: 166 frames; flicker 0.0026198044 disabled versus 0.0012680943 TAA (~51.6% reduction); ghost/cut/resize/scene-replacement errors zero; 202 native TAA passes, 303 temporal bindings, 267 submissions, zero hot-path readbacks. Effective source manifest SHA-256 `c7e5610bd67222aa5e5c56ed99c46ac8e736e6b90c15d417f85345e2ad08fe64`. Full native evidence legs, device-loss proof and final-source receipt acceptance remain separate.
- [x] All five native evidence legs and temporal quality limits pass on an appropriate remote GPU runner. **Verified 2026-09-05:** native CI `34001658939` passed 1/1 (23.03 seconds) on the disclosed remote Apple M1 virtual machine with a non-software Apple WebGPU adapter. Parent inspected strict backend/adapter assertions, 218 native TAA passes, 327 temporal bindings, 284 native submissions and all 175 retained pixel-frame hashes; source start/end fingerprints match `485c99ee60f8b0f60cb49b8b615aa6b1f2e84dd21a6f7b863a5cfa7fef5abf6c`. Flicker improves from 0.0026198044 to 0.0012680943; old/new ghost-region coverage is 0.959869/0, deliberately stale rendered history error 0.795296, actual ghost/cut/resize/scene-replacement errors zero, and error channels/hot-path readbacks zero. This verifies the five feature-specific legs and frozen quality limits; final integrated source and command-receipt acceptance remain release obligations.
- [x] Unsupported hardware reports blocked; it cannot satisfy native acceptance. **Verified 2026-09-06:** focused backend/renderer/docs contracts passed 128/128. An explicit `backend: "webgpu"` request rejects missing runtime (`WEBGPU_RUNTIME_MISSING`), missing adapter (`WEBGPU_ADAPTER_MISSING`), failed device creation and malformed devices; it never returns WebGL2. Auto selection may choose WebGL2 only with `fallback: true` and a reason naming the failed WebGPU attempt. The native R03 browser test separately rejects software adapters and requires backend `webgpu`, so blocked/fallback environments cannot satisfy its native acceptance row.

**Evidence gate:** Native WebGPU TAA report, captures, adapter identity and binding/submission counters.

<a id="r04"></a>

### R04. Promote clearcoat, sheen, iridescence and anisotropy texture maps

**Original obligation:** C1.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** AuraMaterialSpec index.ts:1030–1080 and createProductionPrimitiveTextureIntent:13499 support extension scalars but lack the requested extension-map slots. TexturedPBRMaterial.ts:96–219 already has the lower-level extension map options; this is principally root promotion, not a from-scratch shader feature.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/engine/src/agent-api/index.ts` | Typed extension texture refs, UV selectors/transforms, validation and diagnostics. |
| EDIT | `packages/engine/src/production-runtime/index.ts` | Texture resolution, upgrade/failure path and material binding. |
| EDIT | `packages/rendering/src/TexturedPBRMaterial.ts` | Reuse existing clearcoat/sheen/anisotropy/iridescence map slots; fix only bridge-exposed binding gaps. |
| EDIT | `packages/rendering/src/ForwardPass.ts` | Bind extension maps consistently for relevant material paths. |
| EDIT | `packages/rendering/src/ShaderLibrary.ts` | GLSL extension map sampling and channel math. |
| EDIT | `tests/browser/root-textured-c1-harness.ts` | Asymmetric independently switchable map fixtures. |
| EDIT | `tests/browser/root-textured-c1.spec.ts` | Per-map pixel/UV/channel/color-space proof. |
| NEW | `tests/unit/agent-api/extension-texture-maps.test.ts` | Typed options, unsupported inputs and texture intent propagation. |
| EDIT | `packages/rendering/src/NormalMappedPBRMaterial.ts` | Preserve tangent/normal and extension texture compatibility. |
| EDIT | `packages/rendering/src/PBRMaterial.ts` | Preserve scalar material defaults and bridge compatibility. |
| EDIT | `packages/rendering/src/materials/MaterialExtensions.ts` | Align extension support diagnostics with actual map support. |
| EDIT | `tests/unit/agent-api/root-textured-c1.test.ts` | Extend existing root texture-intent coverage. |
| EDIT | `docs/rendering/pbr-gltf-correctness.md` | Record map-specific root proof and limits. |

**Detailed tasks**

1. Define separate typed maps for the standard channels needed by clearcoat, sheen, iridescence and anisotropy; include roughness/thickness/intensity/color variants where the renderer supports the corresponding extension. Do not conflate a scalar with a map.
2. Carry texCoord and texture transforms through root to material samplers, with correct data-map linear and color-map sRGB treatment. Clamp/validate units and ranges; preserve missing-UV and failed-fetch diagnostics.
3. Reuse existing lower-level shading contributions and implement only proven missing pieces, with defaults that preserve legacy output and bounded feature support across noninstanced/instanced paths. Regenerate mirrored shaders through the sanctioned producer.
4. Use typed, provenance-backed fixtures; compare map off/on, swapped channels, UV0/UV1, transforms and missing resources independently. Re-earn B3/C1 and affected material receipts.

**Completion checklist**

- [x] Every named extension has a real root map slot and matching shader binding. **Verified 2026-09-06 UTC:** remote side28 passed all13 root C1/B3 tests, including all eight individual map bindings, combined families and thirteen simultaneous map slots. Independent review checked the per-map reports; 23/23 typed intent, provenance and lifecycle tests also passed. Complete retained regional/color-space/missing-UV/instanced evidence remains open below.
- [x] Each map produces its expected regional visual effect; decoy maps/disabled maps do not. **Verified 2026-09-06:** successful native Apple WebGPU run `34006289631` retained 46 acceptance PNGs and 40/40 map-control metrics for the eight promoted slots. Every disabled control changes the rendered region (68–5,071 pixels), every swapped/UV1/transform control changes pixels, and all eight decoy controls are exactly zero. The decoded attachment reports backend `webgpu`, Apple adapter, empty errors, and native pipeline/texture/readback capabilities; this is bounded rendering evidence, not universal PBR parity.
- [x] UV transforms, color-space and failure paths are tested. **Verified 2026-09-06:** native run `34006289631` passes UV1 and transform controls for all eight slots, including the previously failing iridescence/iridescence-thickness cases; its missing-optional-attributes and both zero-film controls are exactly zero. Current final-worktree root intent/lifecycle/atlas suites pass 49/49, including missing UV0/UV1 rejection before fetch, failed-resource cleanup, sampler/atlas mapping, and typed ownership. The retained root C1 side28 run includes the numerical sRGB-versus-linear upload oracle.
- [x] No blanket PBR parity claim based on these bounded fixtures. **Verified 2026-09-06:** the native attachment declares scope `rendering native WebGPU; not createAuraApp`; the root C1 receipt is separately bounded to the promoted texture slots. Current docs/known-limit contracts retain the per-surface boundary, and this PRD records the result as an eight-slot regional control matrix rather than a universal PBR claim.

**Evidence gate:** Per-map root screenshot matrix, shader vectors, sampler diagnostics and regenerated C1/B3 receipts.

<a id="r05"></a>

### R05. Finish B4 reflection-surface SSR using the existing native renderer

**Original obligation:** B4.
**Dependencies:** R06 ownership contract if pass integration changes; R02 depth conventions.

**Code-verified current state:** PlanarReflection.ts:659 createSsrPassDescriptor returns configuration. ReflectionSurfaces.ts:296 says no depth/normal ray-march pass is created. A separate bounded native postprocess SSR implementation exists and should be reused.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/rendering/src/PlanarReflection.ts` | Connect SSR descriptor to an executable renderer-owned pass contract. |
| EDIT | `packages/rendering/src/ReflectionSurfaces.ts` | Submit reflection-surface SSR with real input/resource ownership and accurate fallback. |
| EDIT | `packages/rendering/src/RendererPostprocessPlan.ts` | Declare inputs and observed reflection pass results. |
| EDIT | `packages/rendering/src/WebGL2Device.ts` | Reuse/extend native SSR depth/normal ray marching and compositing. |
| EDIT | `tests/browser/reflection-surfaces-b4-harness.ts` | Planar floor/water/glass and missing-input comparison variants. |
| EDIT | `tests/browser/reflection-surfaces-b4.spec.ts` | Assert live reflected geometry and emit durable per-part receipts. |
| EDIT | `packages/rendering/src/Renderer.ts` | Own reflection targets and native execution integration. |
| EDIT | `packages/rendering/src/index.ts` | Export only actual supported package contracts. |
| EDIT | `tests/unit/rendering/reflection-surfaces-b4.test.ts` | Require executable pass behavior and missing-buffer failures. |

**Detailed tasks**

1. Trace native SSR implementation and share it instead of adding a second renderer/CPU approximation. Bind scene color, correctly linearized depth, normals, camera projection and reflection masks.
2. Implement bounded ray marching, thickness/hit rules, edge fade, roughness response and miss fallback. Descriptor validation alone must not mark pixelBacked.
3. Test reflected object movement, occlusion, offscreen miss, camera movement, roughness and missing inputs. Retain B4 screenshots and JSON directly so K1 no longer needs the old missing-file workaround.

**Completion checklist**

- [x] B4 routes issue actual SSR work and sample owned targets. **Verified 2026-09-06:** the retained passing B4 browser receipt executes the rendering-internal bounded SSR path and asserts six native draws, status `implemented`, more than ten reflected pixels, more than ten moved-reflection pixels, camera and roughness response, zero offscreen-miss delta, and zero occluded false-hit pixels. Current final-worktree B4 ownership/camera units pass 10/10 and reject mock backends, singular projections and descriptor-only promotion; the browser harness reads the native result target before presentation.
- [x] Expected reflection-region pixels move with the subject; negative controls reject false hits. **Verified 2026-09-05:** remote job 11 B4 browser test passed (1/1, 5.0 seconds). Parent inspected the live log and assertions: subject-movement residual difference, camera movement, roughness response, zero offscreen-miss delta and zero occluded red-reflection pixels. Retained-artifact/final-source release binding remains separate.
- [x] Input absence is explicit and targets dispose correctly. **Verified 2026-09-06:** the same passing B4 browser contract asserts `missingDepthRejected === true` and `disposed === true` after retaining the result target. Current ownership units require live bindings for promotion, keep unbound SSR unsupported, reject missing/singular inputs, and dispose planar/glass/water/native SSR resources. This remains a bounded rendering-internal claim; no root/createAuraApp SSR claim is made.

**Evidence gate:** B4 native pass counters, reflection-region metrics, PNG sequence and negative controls.

<a id="r06"></a>

### R06. Replace counter-only framegraph passes with real resource flow

**Original obligation:** T3.
**Dependencies:** G01; design shared ownership before R02/R05 final wiring.

**Code-verified current state:** OpaquePass.ts:58 and its five peers only validate context and increment frame counters. RenderPassExecutionContext carries frameIndex/width/height, not executable resource access.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/rendering/src/production-runtime/framegraph/RenderPass.ts` | Execution contract with typed handles and the existing device/command context. |
| EDIT | `packages/rendering/src/production-runtime/framegraph/FrameGraph.ts` | Resolve resource dependencies and invoke actual owned pass work. |
| EDIT | `packages/rendering/src/production-runtime/passes/DepthPrepass.ts` | Render depth through existing renderer operations or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/OpaquePass.ts` | Render opaque work through existing owner or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/ShadowPass.ts` | Execute shadow-map work or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/SkyboxPass.ts` | Execute sky/background work or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/ToneMappingPass.ts` | Execute tone mapping through native owner or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/TransparentPass.ts` | Execute correctly ordered transparent work or remove redundant pass and references. |
| EDIT | `packages/rendering/src/production-runtime/passes/FramegraphTopology.ts` | Match declarations to actual handle reads/writes. |
| EDIT | `tests/unit/rendering/framegraph-passes-t3.test.ts` | Assert effects on resources/commands, not merely nonempty methods. |
| EDIT | `tests/unit/root-path-integrity/framegraph-resource-flow-t3.test.ts` | Missing producer, stale handle and pass-order negative tests. |
| EDIT | `tests/browser/root-path-integrity.spec.ts` | Rendered integration proof of surviving passes. |

**Detailed tasks**

1. Inventory callers and map each pass to the already-canonical renderer owner. For each, implement actual dispatch or remove the redundant wrapper with all imports/exports/topology updated; deletion is allowed by original T3 and must not remove working rendering.
2. FrameGraph.compile currently sorts pass.kind alphabetically; replace that with actual dependency/topology ordering and cycle/missing-producer rejection, or remove the redundant graph if the canonical owner already provides the complete required behavior. Carry real target handles, lifetime and command context through execution. Avoid duplicate clears, tone mapping, scene draws, shadow work or resource ownership.
3. Use test doubles to prove actual draw/clear/bind operations and consumed/produced handles; browser tests must show disabling an essential pass changes the expected pixels or makes the graph invalid.
4. Keep ContactShadowPass and other existing real work intact and validate disposal, resize and failure cleanup.

**Completion checklist**

- [x] No surviving pass consists solely of counters/metadata validation. **Verified 2026-09-05:** parent inspected all six stage implementations, native command/resource dispatch, and canonical native bindings. Fresh framegraph/resource-flow/ContactShadow tests passed 24/24 (1.00 second); remote job 12 previously passed both native stage pixel/control tests. The later resource hardening retains actual dispatch. Broader root consumer and final-source browser/lifecycle acceptance remain open.
- [x] Graph dependencies match actual resource use; undeclared/missing resources and cycles fail. **Verified 2026-09-05:** parent inspected job 23 unit JSON: 12/12 framegraph pass, 9/9 resource-flow and 3/3 contact-shadow tests passed. Assertions exercise undeclared reads, missing/disabled producers, cycles, replacement shadow matrices, stale/resized/disposed resources and failure output invalidation. Parent also inspected the matching native six-stage report: missing depth/shadow/sky producers reject before dispatch; enabled and repeated runs execute each native stage once while retaining borrowed targets. Full consumer and final-source acceptance remain separate.
- [x] Single-renderer ownership remains true with no double-render or double-tone-map. **Verified 2026-09-06:** remote job 12 passed both R06 native browser controls and remote job 29 passed the full root-path suite 4/4. The six-stage proof uses one WebGL2 device owner, executes every stage exactly once, publishes the borrowed output target, repeats with identical pixels and keeps borrowed targets alive; disabling tone mapping prevents publication and changes pixels instead of invoking a second owner. Current framegraph/resource-flow contracts pass 24/24 and explicitly verify six native draws on borrowed targets without another owner.
- [x] Root and lower-level consumers retain required behavior. **Verified 2026-09-06:** remote job 29 passed the named integration command 11/11 and full root-path browser suite 4/4. The live route audit classifies application mounts as the documented root production bridge, while the lower-level R06 controls verify native tone output, all six stages, essential-pass disable behavior, missing producers, borrowed-resource lifetime and stable repeat pixels. Current focused framegraph/resource-flow/async ownership run passes 101/101 across the affected contracts.

**Evidence gate:** Command/resource unit assertions, pass-disable browser controls, ownership report and final pixels.

<a id="p01"></a>

### P01. Re-earn the full 10,000-live-particle performance requirement

**Original obligation:** A4.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** gpu-particle-a4.spec.ts:515–516 checks configured capacity 10,000 and Live >1,000. Retained sustained report records 4,500 live particles, 180 frames and ~3 seconds.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tests/browser/gpu-particle-a4.spec.ts` | Require measured live count and full feature workload throughout the timed window. |
| EDIT | `packages/rendering/src/effects/GPUParticleBackend.ts` | Optimize only measured bottlenecks; expose exact dispatch/live/draw/readback counts. |
| NEW | `tests/browser/gpu-particle-301-sustained-harness.ts` | Deterministic seeded full-occupancy workload if existing demo cannot hold 10,000 live particles. |
| NEW | `tests/browser/gpu-particle-301-sustained-harness.html` | Dedicated workload entry when needed. |
| EDIT | `apps/wow-webgpu-compute-particles/src/main.ts` | Actual live-emission/lifetime/prewarm owner; prefer this fixture to a duplicate. |
| NEW | `tools/muse3jsparity-readiness/particle-pacing.ts` | Share the native producer’s exact rolling-FPS computation with acceptance replay. |
| EDIT | `tools/muse3jsparity-readiness/acceptance.ts` | Reject sustained rolling slowdowns and match within-window timing/quantile semantics. |
| EDIT | `tests/unit/tools/muse3jsparity-acceptance.test.ts` | Cover interleaved slow/fast frames and the exact p95 boundary without inconsistent timestamps. |

**Detailed tasks**

1. Identify and edit the existing wow-webgpu-compute-particles demo owner before adding a duplicate harness; fixture must maintain at least 10,000 simultaneously live, rendered particles after warmup.
2. Keep collision, trails, subemitters, turbulence, life curves, lighting and soft depth fade active. Retain device-observed counts and assert every measured sample, not just configured capacity.
3. As a new 3.0.1 acceptance requirement, measure at least 60 wall-clock seconds after warmup with visible foreground rendering. Record CPU/GPU timing where supported, rAF pacing separately, dropped frames, p50/p95/p99 and thermal/hardware conditions.
4. Fix measured bottlenecks remotely without reducing particle count/features/resolution after the test begins. If adaptation is enabled, report and gate its actual workload; no hidden downscaling.
5. Use the original documented vsync tolerance explicitly: median >=59fps and p95 frame <=20ms on the named reference device, plus no sustained <55fps interval longer than one second. These are proposed acceptance thresholds, not existing results.

**Completion checklist**

- [x] Live/rendered particle count >=10,000 throughout the retained measurement. **Verified 2026-09-05:** native CI `34002286810` retained 3,534 consecutive completed frames over 60,000.2 ms at fixed 1800×1200. Parent independently checked every sample: minimum live 12,000, minimum projected/rendered 11,284, no frame-workload failures or browser errors. Parent inspected the actual full-route screenshot showing the rendered particle field and ribbons; the prior white-streak rejection is resolved by this later evidence. Performance acceptance remains open below.
- [x] Collision and trails remain active and visually evidenced. **Verified 2026-09-05:** native CI `34002286810`; parent inspected the screenshot, full-window samples and negative-control reports. Minimum trail count is 2,888 with 84,120 ribbon vertices; disabling trails changes 80,022 pixels. Independent same-seed 180-step collision replay records 14,504 contacts enabled versus zero disabled and 178,471 changed pixels (12.91%). Soft-fade and lighting controls also change 37,598 and 228,421 pixels respectively. Final-source release binding remains required.
- [x] Reference performance thresholds pass on appropriate native WebGPU hardware. **Verified 2026-09-06:** native macOS run `34045615840` passed the unchanged frozen gate on the exact 1280×720 candidate: 60,002 ms foreground window, 59.88024 median FPS, 20.0 ms p95, 463.3 ms longest rolling sub-55 interval, native Apple Metal identity, 10,000 minimum live/rendered particles, valid completion clocks, full collision/trail/sub-emitter/turbulence/curve/lighting/soft-fade workload, and zero acceptance errors. Retained controls changed 50,674 trail pixels, 16,768 soft-fade pixels and 143,085 lighting pixels. The same workflow passed root R02 temporal and extension-atlas regressions; artifact overlay SHA-256 `50ef64a3a2d21af6a0d8a53edee88b17edd62a646bd47a9ef8804cdcba31aab4`.
- [x] Readback cost and exact resolution/device are disclosed; proxy microbenchmarks cannot close this item. **Verified 2026-09-05:** native CI `34002286810` records the full workload at 1800×1200, native Apple Metal/Apple Paravirtual adapter on an Apple M1 virtual runner, 128 counter-readback bytes per frame (452,352 bytes across 3,534 samples), GPU-completed frame intervals, CPU completion and separate rAF pacing. Host thermal/power/contention conditions and physical reference equivalence are explicitly unknown; timed tracing is disabled and disclosed. Parent inspected the raw hardware/timing fields. This is disclosure acceptance, not a passing performance or physical-reference-equivalence claim.

**Evidence gate:** Full-window sample data, feature counters, particle/trail screenshots and machine metadata.

<a id="p02"></a>

### P02. Measure rendered shadow stability over the requested stress run

**Original obligation:** B1.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** contact-shimmer-b1b2.spec.ts:64–85 runs 3,600 analytic cascade selections, but renders only 24 frames at line 100. Requested shimmerScore is absent.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tests/browser/contact-shimmer-b1b2.spec.ts` | Run sustained rendered moving-camera stress and retain temporal images/metrics. |
| EDIT | `packages/rendering/src/ForwardPass.ts` | Expose device-observed shadow/cascade state needed to bind the metric. |
| EDIT | `packages/engine/src/agent-api/index.ts` | Surface evidence-derived shadow stability diagnostics without decorative constants. |
| NEW | `tests/browser/shadow-stability-301.spec.ts` | Dedicated real-frame temporal stress if existing combined spec becomes unwieldy. |
| EDIT | `packages/rendering/src/shadows/CascadeHysteresis.ts` | Keep computeShimmerScore analytic metric separate from rendered image-space instability. |
| EDIT | `packages/rendering/src/shadows/CascadedShadowPipeline.ts` | Expose real cascade transition/stability data. |
| EDIT | `packages/rendering/src/CascadedShadowMaps.ts` | Fix measured projection/snapping issues if found. |
| EDIT | `packages/rendering/src/ShadowMap.ts` | Preserve actual map state and target accounting. |
| EDIT | `packages/rendering/src/ShadowPass.ts` | Bind shadow workload diagnostics to real submission. |

**Detailed tasks**

1. Keep analytic selection tests, but add 60 actual wall-clock seconds of camera motion across cascade boundaries with spot/point/directional cases.
2. Record rendered frame IDs, cascade/atlas state and stabilized receiver patches. Compute a documented shimmerScore after accounting for intended camera/object motion; report sampling rate and actual frame count.
3. Choose repeatable thresholds from a fixed oracle/reference scene before tuning implementation. Include intentionally disabled snapping/jittered-light negative controls that must worsen the metric.
4. Fix actual instability, atlas transitions or bias artifacts uncovered by the run. Do not label 3,600 CPU samples as 3,600 rendered frames.

**Completion checklist**

- [x] 60 seconds of real rendered stress captured with exact frame count. **Verified 2026-09-06 UTC:** fresh side29 retained81 samples in each of five interleaved modes, with two actual renders per sample (810 total). Every mode spans at least60,674.6ms; actual sampling and interleaving are disclosed. Independent replay found zero acceptance/page errors and verified retained PNG bytes against embedded captures.
- [x] Measured stability metric and negative control discriminate real shimmer. **Verified 2026-09-06 UTC:** fresh side29 independently recomputed directional mean0.004554367819, snapping-disabled mean0.004827635908 (+6.0001%) and jittered-light mean0.009832519136 (+115.8921%). All primary-mode maxima remain below0.03. The verifier now matches task3’s original requirement that controls worsen the metric, correcting its unsupported requirement that controls exceed the primary ceiling; old failures remain retained. Raw report SHA-256 `3773520b65459054df6055c995af59f5645f9ca6f755bf511d6e2c8a1d5b7011` matches the actual browser attachment. Independent human visual review remains open.
- [x] Shadow acne, detachment, clipping and camera-boundary transitions have visual review evidence. **Verified 2026-09-06 UTC:** current-source C021 passed the five-test P02 browser lane, including the 60-second rendered stress. Direct review of five retained frames found attached, stable shadows with no acne, receiver clipping, caster detachment or cascade-boundary discontinuity; exact frame SHA-256 values are `c4ec58ae54b031c06446d66464eefd8ef1c68b47f16f6368c1bdbb2aa3697c72`, `124967c7f4d1302a4b0a46930983107dea2c3230e7ffd2c13b3ec489f570c622`, `af54b5a0d9a04c2d9953ae2ed24ff6094fc9688a2d625cf6c64887c8cecdb69b`, `1dfefdc1add08f3df000991897de422f8fde72b0c5750904f95b5ef4d68d0a8a` and `02ded66e2dcaeae2fb3e69fcdf63104c0a5bec649ccb6cee04fe2c85d0f87c7d`.

**Evidence gate:** Frame samples/video, stability series, oracle parameters and final shadow diagnostics.

<a id="e01"></a>

### E01. Complete translated root-motion locomotion and measured rig profiles

**Original obligation:** E2.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** gltf-root-motion-real-clip.test.ts:43 proves an in-place zero-travel clip. HumanoidRetargeting.ts:134 initializes an empty profile registry; neither establishes translated zero-slide locomotion/nav/physics integration.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/animation/src/RootMotion.ts` | World/local delta, turning, loop seam, blend and consumed-motion semantics. |
| EDIT | `packages/animation/src/FootIk.ts` | Contact-aware correction under translated locomotion. |
| EDIT | `packages/animation/src/HumanoidRetargeting.ts` | Measured correction profiles where needed; explicit no-correction evidence for already-correct pairs. |
| EDIT | `packages/assets/src/GLTFAnimationRuntime.ts` | Sample and expose real clip displacement and retarget inputs. |
| EDIT | `packages/engine/src/production-runtime/TypedGLBActor.ts` | Bind consumed pose/root motion to the actor without double translation. |
| EDIT | `tests/unit/assets/gltf-root-motion-real-clip.test.ts` | Keep zero-travel case; add nonzero real-clip displacement/seam cases. |
| NEW | `tests/browser/root-motion-locomotion-301.spec.ts` | Root-only translated walking/turning/contact/nav/physics proof. |
| NEW | `tests/browser/root-motion-locomotion-301-harness.ts` | Typed certified rig, terrain and authoritative movement fixture. |
| NEW | `tests/browser/root-motion-locomotion-301-harness.html` | Root locomotion harness entry. |
| EDIT | `packages/animation/src/AnimationMixer.ts` | Keep extraction, blends and loop semantics coordinated. |
| EDIT | `packages/animation/src/SceneAnimationBridge.ts` | Consume root displacement once in scene animation. |
| EDIT | `packages/animation/src/ECSAnimationBridge.ts` | Preserve ECS ownership and replay. |
| EDIT | `tests/unit/assets/certified-rig-proportions.test.ts` | Re-measure rig proportions from actual assets. |
| EDIT | `tests/unit/assets/certified-rig-retarget-maps.test.ts` | Bind correction/no-correction decisions to measured pairs. |
| EDIT | `tests/unit/animation/humanoid-retarget-pose.test.ts` | Pose-quality and scaling regressions. |
| EDIT | `tests/integration/animation-root-motion-scene-ecs.test.ts` | Extend synthetic integration to actual translated-clip semantics. |

**Detailed tasks**

1. Resolve or author a provenance-backed translated walk clip with real stance phases. Keep the in-place clip as a negative control, not the positive zero-slide result.
2. Integrate sampled root deltas once with Rapier-owned physical movement and Recast-guided navigation where required. Define collision rejection/remaining motion and avoid competing position owners.
3. Run straight travel, turning, slopes, blocked movement, loop seams and crossfades; measure planted-foot world displacement relative to moving/static support surfaces.
4. For every certified rig, retain measured proportions, source/target skeleton mapping, units, correction values and supported clips. Where no correction is needed, record explicit pair-specific no-correction/identity evidence. Do not populate the runtime registry solely to make it nonempty; add runtime correction profiles only where measured pose quality requires them. Record how each original per-rig requirement is fulfilled by the actual measured behavior.
5. Proposed 3.0.1 acceptance: planted-foot slip <=1% of certified rig height per stance interval, with separately reported worst-case contact error and seam displacement. Fix thresholds before final tuning and retain raw measurements.

**Completion checklist**

- [x] A real nonzero translated walk proves authoritative displacement with no double motion. **Verified 2026-09-06:** native macOS run `34029312582` completed all 16 ordered certified-rig pairs with 16 expected and zero unexpected Playwright outcomes. `rig-pair-rendered-301.spec.ts` requires provenance-bound nonzero translated coverage, Rapier ownership, requested/accepted/rejected accounting, cumulative motion equal to accepted motion, and unobstructed cumulative displacement equal to the actor target; every pair passed those assertions. The retained rendered report ran for 595,799.607 ms and includes one `pair.json` plus one `partial.json` per pair. Independent visual review and final-source release binding remain separate open gates.
- [x] Foot-slip and seam criteria pass for each admitted rig/clip pair. **Verified 2026-09-06:** native macOS run `34029312582` executed the measured rendered-quality oracle for all 16 ordered pairs. Each case recomputed `measureRenderedPairQuality(...)` from actual root-rendered world-joint frames and asserted `quality.failures` was empty after contact-window, seam, deformation, palette-skinning, root-motion and lifecycle checks; the final Playwright report records 16 expected, zero skipped, zero unexpected and zero flaky cases. This closes the automated <=1%-of-rig-height/contact/seam gate only; independent human artifact review remains open.
- [x] Navigation/collision integration preserves physical ownership and predictable blocked behavior. **Verified 2026-09-06:** the final-source Azure browser receipt at fingerprint `fe4f7a78963791ef83b7730919f9bd7899845d001a283ef57a5bae2237425d0b` passes all five root locomotion scenarios (5/5, exit 0). The blocked case requires Recast navigation success, Rapier as the active physical owner, `requested = accepted + rejected` on every axis and frame, nonzero rejected motion, and final travel below 0.7; straight, turn, slope and crossfade retain travel above 0.5 with the same single-owner accounting. The receipt retains pre/post source identities and completed 2026-09-06T16:04:04Z–16:06:50Z without source drift.
- [x] Every certified rig has measured pair-specific pose quality, necessary corrections and explicit no-correction evidence where justified; unsupported required pairs remain open. **Verified 2026-09-06:** source-bound verifier `tools/locomotion-301/verify-pair-dispositions.ts` (SHA-256 `075745473d241d559d30ae2b4608281c06c7a934f20fd59da9d894be702db7f1`) consumed the 16 immutable `pair.json` artifacts from successful macOS run `34029312582`, hashed every receipt, and passed with 16 unique ordered pairs: four same-rig `explicit-no-pair-map-correction`, twelve cross-rig `measured-pair-correction-applied`, and zero open dispositions. Each pair retains its measured rest-pose/per-bone map, target-specific contact windows, root-runtime foot lock, empty rendered-quality failures and the independent-review boundary. Verifier regressions pass 18/18 and browser typechecking passes.

**Evidence gate:** Rig/clip hashes, displacement/contact series, locomotion video, per-rig profiles and root diagnostics.

<a id="i01"></a>

### I01. Finish control damping, cursor zoom and pan bounds

**Original obligation:** F1 / N2.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** docs/controls/interaction-and-picking.md:53–67 lists Orbit/Map damping and cursor zoom gaps. packages/controls OrbitControls delegates attached-camera math to @aura3d/input.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/input/src/controls/OrbitControls.ts` | Implement authoritative damping, cursor zoom and bounded pan math. |
| EDIT | `packages/controls/src/OrbitControls.ts` | Forward options and frame updates to the existing input owner. |
| EDIT | `packages/controls/src/MapControls.ts` | Inherit/extend map semantics without a second implementation. |
| EDIT | `docs/controls/interaction-and-picking.md` | Update option-level parity only from measured attached-camera proof. |
| NEW | `tests/unit/controls/orbit-map-options-301.test.ts` | Frame-rate-independent damping, cursor pivot and pan clamp cases. |
| NEW | `tests/browser/orbit-map-options-301.spec.ts` | Attached perspective/orthographic camera input and disposal proof. |
| EDIT | `tests/unit/controls/orbit-controls-delegation.test.ts` | Protect one-owner delegation. |
| EDIT | `tests/unit/controls/control-disposal.test.ts` | Protect all control teardown behavior. |
| EDIT | `tests/browser/threejs-parity-orbit-controls.spec.ts` | Retain real camera parity proof. |

**Detailed tasks**

1. Implement missing options in the actual input owner. Preserve existing default behavior for consumers who do not opt in.
2. Use delta-time-based damping; implement zoom toward the pointer-derived scene/target-plane anchor for perspective and orthographic cameras, and documented world/target pan limits.
3. Test 30/60/120Hz convergence, wheel/drag/touch paths, boundary clamps, zero/invalid input, save/reset and disposal. Keep detached bookkeeping behavior explicitly unclaimed.
4. Update the option-by-control-by-r185 matrix with exact supported limitations, including Arcball omissions; do not close an option merely by documenting GAP.

**Completion checklist**

- [x] Attached Orbit/Map cameras demonstrate all originally required options. **Verified 2026-09-06:** current final-worktree option/delegation/disposal suites pass 35/35, and retained remote job 11 passes all four real-input browser combinations (Orbit/Map × perspective/orthographic). The browser contract exercises cursor-pivot zoom, delta-time damping, pan bounds, mouse/touch/pinch input, reset and disposal on attached cameras; units additionally prove 30/60/120 Hz convergence, perspective target-plane anchoring, orthographic projection restore, every pan/truck/cursor clamp and invalid-input handling.
- [x] Comparable input sequences produce bounded equivalent results across frame rates. **Verified 2026-09-05:** parent ran the option, delegation and disposal suites: 35/35 tests passed, exit 0, 9.36 seconds. The attached Orbit and Map cases compare equal damping impulses at 30/60/120 Hz to ten decimal places, and frame-sampled pan convergence within 0.0003 world units. Remote job 11 separately passed all four actual-input camera/control browser cases. Final-source receipts remain required.
- [x] No listener leak, late mutation after disposal or duplicated control owner. **Verified 2026-09-05:** parent option/delegation/disposal run passed 35/35; then strengthened InputSystem teardown to require exact callback identity and idempotent removal, rerunning disposal 12/12 (1.03 seconds). Attached control delegation and post-dispose no-mutation assertions remain intact; remote job 11 checked no late mutation for Orbit/Map with perspective/orthographic cameras. Final immutable receipts remain required.

**Evidence gate:** Option-level unit assertions, real input browser captures and updated parity table.

<a id="i02"></a>

### I02. Wire per-role label collision behavior into real placement

**Original obligation:** N4.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** LabelTelemetry.ts defines minGapPx values 0/2/4; WorldLabelRenderer.ts:517 calls resolveLabelCollisions without that role tuning and its resolver uses one global minGap.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/engine/src/agent-api/LabelTelemetry.ts` | Keep role settings aligned with actual placement semantics. |
| EDIT | `packages/engine/src/agent-api/WorldLabelRenderer.ts` | Pass per-label role tuning and implement deterministic pairwise gap/priority decisions. |
| EDIT | `tests/unit/agent-api/label-telemetry.test.ts` | Prove tuning changes resolver output rather than just returning config. |
| EDIT | `tests/browser/label-occlusion-harness.ts` | Mixed HUD/annotation/tick overlap cases at multiple viewport sizes. |
| EDIT | `tests/browser/label-occlusion.spec.ts` | Assert screen rectangles, role spacing, occlusion and diagnostics. |
| EDIT | `tests/unit/engine/world-label-renderer.test.ts` | Mixed-role pair spacing and placement tests. |

**Detailed tasks**

1. Carry role into projected labels and define pairwise spacing, priority, displacement limit and offscreen handling. Preserve accessibility and accurate DOM-versus-3D claim boundaries.
2. Use measured DOM/text bounds; connect placed/offscreen/occluded/suppressed counts to the actual final placement.
3. Test dense mixed-role labels on desktop/mobile, camera movement, font/layout change and role changes at runtime.

**Completion checklist**

- [x] Changing role changes actual collision resolution as specified. **Verified 2026-09-05:** remote job 11 label suite passed 3/3 (52.3 seconds); its 390px and 1200px cases change the role while retaining camera/font, assert changed projected placement, and check measured role-specific pair gaps. Parent inspected the assertions and remote execution status.
- [x] No forbidden overlap or misleading placed count in admitted fixtures. **Verified 2026-09-05:** the same desktop/mobile cases assert every visible measured rectangle is in bounds, every pair has the required separation, and `placed` equals actual visible DOM rectangles across role, font and camera changes. Final-artifact review and final-source receipt binding remain open.
- [x] Labels remain readable without obscuring typed hero subjects. **Verified 2026-09-06 UTC:** current-source C021 passed label browser 3/3 and units 24/24. Direct review of all eight attached 390px/1200px role/font/camera states confirms legible labels and an unobscured typed robot; the browser report SHA-256 is `1826f081fd5e41c8a4904e8c3140c57d904d3e5541291d55be2ea924b02052e8`, with every screenshot hash retained in its attachment inventory.

**Evidence gate:** Placement rectangle data, role-specific resolver tests and desktop/mobile screenshots.

<a id="i03"></a>

### I03. Render crowd LOD transitions and adopt instanced GLBs in real scenes

**Original obligation:** O1 / P2.
**Dependencies:** E01 where animated locomotion is used; preserve existing P2 support matrix.

**Code-verified current state:** NavigationCrowds.ts classifies near/mid/impostor tiers; the O1 harness creates spheres and only updates positions. No instances.model calls were found in apps/templates for the required Smart City/crowd adoption. P2 native GLB pixel proof already exists and must be preserved.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `packages/engine/src/agent-api/NavigationCrowds.ts` | Bind distance tiers to actual render representations, hysteresis and disposal. |
| EDIT | `packages/engine/src/production-runtime/TypedGLBActor.ts` | Preserve native instancing and actual model LOD/culling behavior. |
| EDIT | `apps/showcase-smart-city-control/src/main.ts` | Adopt typed instanced static assets with visible draw savings. |
| EDIT | `tests/browser/part-o1-navigation-crowd-harness.ts` | Replace tier-only sphere proof with typed model and actual LOD representations. |
| EDIT | `tests/browser/part-o1-navigation-crowd.spec.ts` | Assert rendered LOD switches and movement/cap correctness. |
| EDIT | `tests/browser/instanced-model-p2.spec.ts` | Preserve 4k GLB native proof; add real-route adoption checks. |
| EDIT | `apps/aura-clash-showcase/src/playable/arena/CrowdInstances.ts` | Selected existing crowd adoption owner: replace eligible primitive pools with typed public instanced GLBs while preserving spectator behavior. |
| EDIT | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Mount selected public crowd nodes through the existing application owner; avoid a second renderer. |
| NEW | `tests/browser/crowd-instancing-adoption-301.spec.ts` | Smart City plus public crowd route draw/pixel/input/LOD evidence. |
| EDIT | `packages/navigation-recast/src/index.ts` | Preserve real navigation/crowd simulation and fail-closed peer boundary. |
| EDIT | `tests/unit/engine/navigation-crowds.test.ts` | Representation state, cap and disposal cases. |
| EDIT | `tests/browser/showcase-smart-city-optimization.spec.ts` | Re-earn actual city draw/load proof. |
| EDIT | `tests/browser/smart-city-scatter-adoption.spec.ts` | Preserve city distribution and visibility. |

**Detailed tasks**

1. Use the existing Aura Clash spectator crowd for the P2 crowd-scene adoption. CrowdInstances.ts currently returns torso/head primitive RenderItem pools; replace eligible visual representatives with typed instances.model mounted through the public application owner, preserving cheer/reduced-motion behavior and fighter-lane clearance. The O1 live-navigation LOD proof remains a separate root test harness; do not add navigation behavior to stationary spectators merely to combine tests.
2. Use actual geometry/mesh replacement for near/mid/impostor tiers and preserve per-agent identity, position, heading, selection and visibility through transitions. Implement hysteresis and resource reuse.
3. Use native instances.model in Smart City for suitable repeated static typed assets and in the Aura Clash crowd for supported static/rigid representatives. Do not pretend unsupported skinned instancing is now supported.
4. Prove native submissions and draws per primitive/material group, not an impossible universal one draw per multi-primitive GLB. Compare N copies against one copy with identical materials/LOD.
5. Retain culling, cap and fallback warnings. Visual proof must demonstrate actual representation changes, not diagnostics alone.

**Completion checklist**

- [x] Two actual application routes use the public instancing API and retain readable typed assets. — Independently audited Smart City side34 and Aura Clash side30; exact final-source regeneration remains required.
- [x] Far agents genuinely render the impostor/billboard representation with hysteresis. **Verified 2026-09-06:** the source-bound Azure O1 browser receipt at fingerprint `fe4f7a78963791ef83b7730919f9bd7899845d001a283ef57a5bae2237425d0b` passes 1/1. It renders four visible camera-facing GPU billboard nodes at the far tier, asserts all four reported tiers are `impostor`, retains distinct near/far pixels, checks hysteresis and resource reuse across repeated near/far transitions, and rejects capacity substitution.
- [x] Draw savings and visible instance counts are measured; copies are not silently dropped. — City six one-instance draws become one six-instance draw; Clash28 become one28-instance draw, with hidden and repeat controls plus individually readable city copies.
- [x] Nav movement, input/selection and disposal remain correct after repeated LOD transitions. **Verified 2026-09-06:** the same source-bound O1 receipt completes from 2026-09-06T16:15:14Z–16:16:50Z with exit 0. Four real Recast agents move across the baked navmesh; selection, hidden state and restored selected pixels survive tier transitions; reset replaces and disposes the prior binding/crowd/nav/app; and final binding, crowd, mesh and app operations all reject after disposal.

**Evidence gate:** Application-route screenshots, draw/instance counts, distance-transition sequence and nav/cap results.

<a id="i04"></a>

### I04. Complete the named camera and spotlight route adoptions

**Original obligation:** F2 / N1.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** PRD:465 says Aura Clash camera adoption remains open. N1 acceptance currently opens a test harness with two rigs rather than the specified product routes. Actual Aura Clash is apps/aura-clash-showcase/src/main.ts; night-cinematic is a preset name. The existing fulfillment target is apps/showcase-cinematic-architecture/src/main.ts:275, whose night mood uses environments.nightCinematic. Aura Clash main.ts only imports the boot module; the actual camera/light owner is playable/AuraClashArenaApp.ts.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Replace duplicated manual camera feedback with shared rigs; integrate actual stage spotlights. |
| EDIT | `apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage.ts` | Preserve arena light/asset configuration and render ownership. |
| EDIT | `apps/aura-clash-showcase/src/playable/arena/RenderedArenaStage.ts` | Wire stage rendering as needed for real spotlight adoption. |
| EDIT | `apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts` | Retain actual route camera/light evidence. |
| EDIT | `apps/showcase-turbo-drift-circuit/src/main.ts` | Preserve existing camera/game-feel adoption and revalidate framing. |
| EDIT | `apps/showcase-skyline-runner/src/main.ts` | Preserve adoption and revalidate hero scale/framing. |
| EDIT | `packages/engine/src/agent-api/GameCameraRigs.ts` | Fix integration/lifecycle issues exposed by real routes. |
| EDIT | `tests/browser/route-gamefeel-adoption.spec.ts` | Add Aura Clash; require all three named routes. |
| EDIT | `tests/browser/root-spot-shadow-n1.spec.ts` | Keep harness unit-like coverage; add actual route adoption tests. |
| EDIT | `apps/showcase-cinematic-architecture/src/main.ts` | Adopt root spotlights in the existing night mood; this resolves the original night-cinematic target. |
| NEW | `tests/browser/spotlight-route-adoption-301.spec.ts` | Night route and Aura Clash spotlight/shadow pixel evidence. |
| EDIT | `apps/aura-clash-showcase/src/animation/AuraBurstCameraTimeline.ts` | Coordinate existing timeline offsets and shared camera rigs; avoid duplicate feedback. |

**Detailed tasks**

1. Use the existing showcase-cinematic-architecture night mood for the original night-cinematic obligation. Keep its day/night behavior, typed architecture assets and actual public route; do not create a duplicate application.
2. Connect real combat hits to shared trauma/shake and punch-in, preserving follow and reset. Remove duplicated route-local effects only after equivalent behavior is proven.
3. Add public lights.spot calls with meaningful stage/night illumination and real shadow casting; preserve atmosphere without overwhelming subjects or hiding defects in overlays.
4. Test movement, hits, shake decay, FOV recovery, reset, mobile input, reduced-motion behavior and camera collision/framing on the actual applications.

**Completion checklist**

- [x] Turbo, Skyline and Aura Clash all pass named camera adoption proof. **Verified 2026-09-07:** remote current-source run `i04-current39-route-gamefeel` passes 4/4 actual-route cases in 19.1 minutes with exit 0: Aura Clash desktop combat and mobile reduced-motion, Turbo chase and Skyline platformer. Retained impact/settled frames prove shared follow/shake/punch behavior, reset/decay, full-body framing, real input and zero route errors. Producer SHA-256: `9dfd19783f83c118004c0d0351e598049f8124eb9be60fc0c1f7b3bd314d51dc`; route hashes: Clash `423b55f8b730dbad78e869f8f81ee37f070c7df4da4aab4ecd16dd6728731091`, Turbo `a83d25aa3e00a345571cced5a2dc502ee885b6c926db78786c9f08720c874229`, Skyline `dd5c2950bb8561bd278252f6bc4192705291e7adc24995408640e2490b52b5c2`, shared rigs `69cc3301d38e15d4eaee9a29e05eac7e7bb091af3b08b09f936b8454b0abfa11`.
- [x] Aura Clash public-root spotlight correction is implemented and locally type/lint/unit clean. **Verified 2026-09-07:** source-bound run `final-i04-spotlight-20260907T073051Z` passed all 4 actual-route cases with exit 0: Cinematic Architecture and Aura Clash at 1280px and 390px, each with independent light-off and shadow-off pixel controls. Source fingerprint `7df70461629edade71fe7db3a26999564e07fd30b4638674f921156c58a7e4fc`; producer SHA-256 `49582154f8283934bf94b22940b8b7bd0c733e587b6674ea9aa5236ad3d072e4`. The prior edge-on receiver failure remains retained as a failed attempt, not closure evidence.
- [x] Two real applications, including Aura Clash, use root spotlights and show light/shadow on/off effects. **Verified 2026-09-07:** all four desktop/mobile application cases passed; no harness-only route was counted.
- [x] No test-harness substitution for application adoption. **Verified 2026-09-07:** the producer navigated the actual `showcase-cinematic-architecture` and `aura-clash-showcase` applications and asserted their public-root diagnostics and pixels.
- [x] Camera framing and scene composition remain visually acceptable on desktop/mobile. **Verified 2026-09-07:** the spotlight suite passed both 1280px and 390px compositions, while `final-i04-camera-20260907T060946Z` separately passed all 4 Aura Clash, Turbo and Skyline camera/game-feel adoption cases.

**Evidence gate:** Actual route URLs, root diagnostics, interaction captures and spotlight negative controls.

<a id="d01"></a>

### D01. Align decoder versions and enforce the installed comparison matrix

**Original obligation:** S / M2.
**Dependencies:** G01–G03 before final acceptance.

**Code-verified current state:** Matrix decoderLibs records meshoptimizer installed 1.1.1 versus r185 1.2.0; ktx-parse has a separate versionless-blob divergence. S required equal-or-newer decoder alignment, not a reason string.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `package.json` | Update only affected decoder pins after compatibility verification; keep three frozen at 0.185.1. |
| EDIT | `pnpm-workspace.yaml` | Apply the scoped KTX override in pnpm 11's effective workspace configuration. |
| EDIT | `pnpm-lock.yaml` | Regenerate from the package manager, never hand-edit. |
| EDIT | `tools/muse3jsparity-matrix/index.ts` | Gate decoder version/provenance equivalence and real feature coverage. |
| EDIT | `packages/assets/src/GLTFCompressionDecoders.ts` | Maintain injected decoder API compatibility and named failure behavior. |
| EDIT | `packages/assets/src/KTX2BasisTextureTranscoder.ts` | Correct compatibility issues if aligned fixture decoding exposes them. |
| NEW | `tests/unit/tools/muse3jsparity-decoder-alignment.test.ts` | Older decoder/missing provenance/versionless comparison cases. |

**Detailed tasks**

1. Align meshoptimizer to the r185 companion 1.2.0 or a verified compatible newer version. Verify installed resolution and decoder execution, not merely the manifest range.
2. Resolve the r185 KTX parser blob to upstream release/commit/content provenance and compare required API/format behavior. Where no version exists, create an explicit verified equivalent-or-newer content mapping rather than guessing a semver.
3. Run positive Draco/Meshopt/KTX2 compressed fixture decoding plus missing/unsupported/failed-decoder tests through the public helper and actual rendering where required.
4. Regenerate the matrix from the installed tree. Preserve legitimate OUT items; distinguish implemented coverage from assigned work. Do not require universal addon parity.

**Completion checklist**

- [x] Every originally required decoder alignment has a verified version or content-equivalence result. **Verified 2026-09-05:** generated installed matrix resolves Draco 1.5.7, Meshoptimizer 1.2.0 and content-verified KTX 1.0.1. Parent inspected the matrix and passing 12-test alignment report at `/tmp/aura301-decoder-verification.json`; final immutable release receipts remain separate.
- [x] Intentionally older incompatible/missing decoders fail the gate. **Verified 2026-09-05:** alignment tests reject missing/older/prerelease/unknown versions, absent provenance, changed content and deliberately incompatible KTX behavior; 12/12 pass with zero failures.
- [x] Compressed fixtures decode/render with correct diagnostics and no optional-peer regression. **Verified 2026-09-06:** source-hashed Azure browser receipt `aura3d.decoders-browser/v1` passes 3/3 real rendered fixtures in 37.7s: EXT_meshopt geometry, KHR_draco geometry and KHR_texture_basisu/KTX2 texture each report decoder/transcode counts, byte/timing diagnostics, nonblank multi-bucket pixels and retained PNG evidence. Current compression/optional-peer suites pass 16 tests with two opt-in cases excluded; the opt-in Khronos MeshoptCubeTest and Draco Duck network run separately passes 3/3, and decoder alignment/provenance regressions pass 12/12 against the installed lockfile SHA-256 `3f171e15ad06a128e529481f22acdebce5bf2a48d7f96bc724b26f9e090bc3e9`.

**Evidence gate:** Generated installed matrix, upstream provenance mapping and compressed-fixture receipts.

<a id="v01"></a>

### V01. Implement the original feature-by-feature r185 visual comparison

**Original obligation:** K1.
**Dependencies:** All affected renderer and route implementations settled; G02.

**Code-verified current state:** The latest head-to-head receipt compares 96 boxes and asserts no similarity threshold; the K1 task specified bloom/night lighting/water/decals/SDF/particles/camera effects with deltas and SSIM.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tests/browser/game-visual-superiority.spec.ts` | Require a complete feature matrix and fixed acceptance metrics. |
| EDIT | `tests/browser/game-visual-superiority-harness.ts` | Same-scene, same-camera feature pairs for Aura and frozen r185. |
| EDIT | `tests/browser/library-parity-superiority.spec.ts` | Require real per-feature outcomes and current P2 evidence. |
| NEW | `tests/browser/muse3jsparity-301-visual.spec.ts` | Execute the complete seven-family paired matrix, retain exact captures and reject missing/partial families. |
| NEW | `tests/browser/muse3jsparity-301-visual-cases.ts` | Shared scene seeds, camera/material/asset settings and predeclared metrics. |
| NEW | `tools/muse3jsparity-readiness/visual-acceptance.ts` | Evaluate similarity, quality, negative controls and per-workload verdicts. |

**Detailed tasks**

1. Implement pairs for bloom quality, night lighting/shadows, water/reflections, decals, SDF text, particles and camera/game-feel sequences. Use identical typed assets, viewport, camera, seeded state and comparable quality settings. Three imports belong only in opponent test harnesses.
2. Measure SSIM for fidelity/reference regions where appropriate; SSIM alone cannot establish superiority. Define feature-specific clipping, edge, shimmer, legibility, reflection or temporal-quality metrics and independent visual review.
3. Freeze thresholds and workload definitions before final tuning; retain Aura/Three off/on captures and negative controls. Do not demand images be different as proof they are better.
4. Report win/tie/loss/inconclusive per workload with explicit losses. A valid bounded loss does not justify a false superiority claim; the original superiority objective remains incomplete until its required quality targets are earned.
5. Eliminate presence-only checks as acceptance. Validate producer identity, expected fields, actual verdicts and pixel/state assertions for every relied-upon receipt.

**Completion checklist**

- [x] Every originally named K1 visual family has a real paired workload. **Verified 2026-09-08:** exact-source V01 run passed all seven native Aura/r185 paired families plus aggregate assembly (8/8); immutable receipt `tests/reports/muse3jsparity/v01-receipts/final-source-20260908/v01.receipt.json` validated all mapped obligations with zero errors.
- [x] Metrics distinguish disabled/broken effects and are fixed before final run. **Verified 2026-09-08:** 66 hash-bound on/off/repeat/broken/sequence captures satisfy the frozen controls and absolute feature-quality targets for all seven families.
- [ ] All superiority sentences map to actual winning metrics and reviewed imagery.
- [x] Partial, lost or unproven workloads cannot become covered through aggregation. **Verified 2026-09-08:** source identity, producer hash, exact family cardinality, independent acceptance replay and explicit win/tie/loss outcomes are enforced; the final matrix retains 1 win, 5 ties and 1 bounded loss without converting the loss into a superiority claim.

**Evidence gate:** Same-machine paired captures, metrics/SSIM where applicable, per-workload verdicts and human gallery review.

<a id="v02"></a>

### V02. Measure end-to-end comparative game workloads

**Original obligation:** K1 performance / J1 / A4.
**Dependencies:** R02–R06, P01, I03, V01 scene definitions.

**Code-verified current state:** game-visual-superiority-perf-harness.ts explicitly uses direct WebGL workload-class microbenchmarks, not end-to-end Aura frames. Those measurements are useful but do not close actual engine workload performance.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tests/browser/game-visual-superiority-perf-harness.ts` | Keep microbenchmarks explicitly separate from engine timings. |
| EDIT | `tests/browser/game-visual-superiority.spec.ts` | Require actual-engine performance receipts in addition to microbenchmarks. |
| NEW | `tests/browser/muse3jsparity-301-engine-perf.spec.ts` | Actual Aura versus r185 workload timing with GPU completion. |
| NEW | `tests/browser/muse3jsparity-301-engine-perf-harness.ts` | Full bloom, 4k instances, 64 lights and 10k live particles at equivalent settings. |
| NEW | `tests/browser/muse3jsparity-301-engine-perf-harness.html` | Comparable engine workload entry. |

**Detailed tasks**

1. Mount real public/root or explicitly named runtime Aura paths and actual r185 equivalents. Cover full bloom chain, 4,000 rendered instances, 64 effective lights and 10,000 live rendered particles.
2. Fix workload complexity, resolution and quality; record adaptive reductions and reject mismatched comparisons. Measure warmup and repeated runs with GPU completion, CPU submission and rAF pacing reported separately.
3. Retain p50/p95/p99, trial variance, backend/hardware, target bytes, draw/triangle counts and live particle counts. Keep readback instrumentation cost explicit.
4. Run the performance governor on actual overloaded root workloads and verify its resolution/particle/LOD/shadow steps change the resources rendered, preserving existing J1 proof.

**Completion checklist**

- [x] Receipts identify real engine entry points and comparable opponents. **Verified 2026-09-07:** source-stable remote run `v02-cd403-20260907T074438Z` (fingerprint `cd403136ec911a5d2b88f5c4b7c7a1343759132f87433244a99fe7c881ee3329`) passed 13/13 focused units and 7/7 browser cases. Its complete `aura3d.engine-perf-301/v1` receipt names `@aura3d/engine:createAuraApp.stepAsync` for Aura bloom/instances/lights, `@aura3d/rendering:ParticleSystem.update + Renderer.renderAsync` for Aura particles, and the corresponding `three@0.185.1` renderer/EffectComposer entries on identical 640x360 fixed-quality SwiftShader WebGL2 workloads.
- [x] GPU completion and workload counts hold during all measured intervals. **Verified 2026-09-07:** all 1,440 retained measured samples (four workloads × two engines × three trials × 60 samples) report signaled fence completion, positive native draw/triangle counts and unchanged workload fingerprints; instance samples retain 4,000 draw instances, light samples retain 64 effective lights, and particle samples retain 10,000 live particles/20,000 triangles.
- [x] No synthetic WebGL loop is presented as an Aura engine timing. **Verified 2026-09-07:** the report validator rejects any Aura entry point other than the real root `createAuraApp.stepAsync` or rendering `ParticleSystem.update + Renderer.renderAsync` owners, while the older direct-WebGL microbenchmark remains separately labeled and cannot satisfy V02.
- [x] Wins and losses are disclosed; no universal hardware claim. **Verified 2026-09-07:** the same-machine comparison explicitly says it makes no universal hardware claim and records Three as the winner on all four retained SwiftShader workloads (Aura/Three median ratios: bloom 4.67x, instances 11.58x, lights 13.15x, particles 1.47x) rather than suppressing the losses.

**Evidence gate:** Repeated engine timing dataset, quality/workload fingerprints and comparative report.

<a id="q01"></a>

### Q01. Reconcile original tasks, checklists and generated evidence

**Original obligation:** Original PRD / master checklist / K2 / L7.
**Dependencies:** Begin alongside G01; finalize after all implementation.

**Code-verified current state:** The original document has duplicate/stale master items, malformed [x]] entries, checked scope reductions and stale K1 P2 notes. The 3.0.0 archive matches the original and should remain historical.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `muse3jsparity-PRD.md` | Add an explicit superseding 3.0.1 link and correction mapping without pretending historical runs changed. |
| EDIT | `muse3jsparity-3.0.1-PRD.md` | Maintain this execution contract and verified completion receipts. |
| NEW | `docs/project/plans/muse3jsparity-301-requirements.json` | Machine-readable original-task-to-3.0.1 ledger; authored requirements, not generated proof. |
| NEW | `tools/muse3jsparity-readiness/requirements.ts` | Validate IDs, obligations, dependencies and closure evidence. |
| NEW | `tools/muse3jsparity-readiness/traceability-report.ts` | Produce a source-hashed inventory of all obligations, missing test files, declared states and unresolved metadata without claiming execution. |
| NEW | `tests/unit/tools/muse3jsparity-requirements.test.ts` | Missing numbered tasks, duplicate IDs, unsupported completion and stale mapping tests. |

**Detailed tasks**

1. Enumerate every original numbered task and checklist obligation, not just 244 checkbox lines. Assign stable original IDs; map all to preserved complete scope, a 3.0.1 work item, or a previously explicit original non-goal.
2. Carry already-earned implementations forward with exact scope and required regression gates. Examples: do not rebuild P2 native instancing merely because a stale K1 note says its pixel proof is open; do not call 5+45 soak cycles incomplete.
3. For each task record source files, public surface, tests, producer, receipt hashes, acceptance values and state. A justified architectural limit or measured identity profile must be explicit; it cannot silently erase an original obligation.
4. Preserve release-artifacts/muse3jsparity-PRD-3.0.0.md as historical. Generate a new 3.0.1 archive only after closure; never hand-edit report JSON to match prose.

**Completion checklist**

- [x] Every original numbered task has exactly one accountable disposition and no unmapped obligation. **Verified 2026-09-06:** the regenerated `aura3d.muse3jsparity-301-traceability/v1` inventory contains all 756 obligations (515 original, 241 remediation), zero missing named test files and zero obligations without either a named test or typed acceptance contract; readiness/lineage/requirements/administrative regressions pass 114/114.
- [ ] Every required 3.0.1 task has files, tests and acceptance proof.
- [ ] No current checklist contradicts its retained evidence.
- [x] No historical archive or prior human approval is rewritten. **Verified 2026-09-06:** `release-artifacts/muse3jsparity-PRD-3.0.0.md` remains tracked and byte-unchanged at SHA-256 `c3725ea6740f18026a7e87f6a592c7da9d00d6e30521332026c7b2b0ec3d0300`; administrative lineage tests are included in the passing 114-test contract run.

**Evidence gate:** Validated traceability ledger and source/evidence consistency report.

**Current execution inventory (producer-regenerated 2026-09-06):** `pnpm exec tsx --tsconfig tsconfig.base.json tools/muse3jsparity-readiness/traceability-report.ts tests/reports/muse3jsparity-301-traceability.json` exited zero and reports **756 obligations: 515 original and 241 remediation/explicit archival obligations**. All remain unverified in the final machine ledger until their execution receipts pass; individually checked development items do not substitute for immutable final-source proof. There are **191 explicit non-test/aggregate contracts, zero obligations without a named test or typed acceptance contract, and zero missing named test files**. Proof ownership and execution remain separate, and aggregates reject missing, duplicate, self-referential or cyclic mappings. File presence and contract coverage do not claim behavioral completion.

**Inventory history:** Earlier checkpoints reported 755 obligations and then 59 and 40 unmapped proof contracts as integration advanced. Those gap counts are superseded by the current zero-gap producer result. Initial missing browser files were authored; their existence alone never closed their execution requirements.

**First browser checkpoints:** remote decoder tests passed 3/3 in 13.8 seconds; parent reviewed the test and added explicit pixel assertions because the original pixel checks only affected report booleans. The strengthened test awaits rerun. Root native bloom passed its sync/async test; its producer is being corrected to retain every actual capture, instead of a late page screenshot after lifecycle cleanup. C1's baseline passed, but three clearcoat disabled-factor controls reported a nonzero changed-pixel fraction (`0.0007291666666666667`) and failed their zero-difference assertion. That failure remains open with the material owner; no thresholds or acceptance scope were reduced. The broader remote unit run is still pending.

**Follow-up results:** the strengthened decoder browser suite passed 3/3 in 13.3 seconds. Parent also inspected the retained prior report: all checks were true, with 53,201 Meshopt pixels, 53,201 Draco pixels and 51,999 Basis pixels across multiple color buckets. The first full remote unit run completed with 4,417 passed, 148 failed and 17 skipped; it is not accepted as a passing baseline. Missing Git/history/assets/report fixtures and unbuilt package outputs are being restored as explicit prerequisites, while actual regressions are repaired. Clock/boundary fixes passed 13/13 and governance metadata fixes 3/3 in targeted reruns. C1's control was corrected to use a neutral base texture in both variants, preventing a scalar-versus-textured shader change; exact-zero thresholds remain. E01's candidate rig now has structurally valid mappings for all 16 pairs, but visual certification and sole/toe contact measurements remain open; ankle-origin stability alone cannot close the requirement.

<a id="q02"></a>

### Q02. Revalidate route framing, public claims and release assets

**Original obligation:** L2 / L3 / L4 / full boundaries sweep.
**Dependencies:** All affected route/rendering changes; Q01.

**Code-verified current state:** 3.0.0 release notes retain Turbo/Skyline/Smart City camera/framing/human-review caveats. These are unresolved release obligations to re-probe, not an assertion that every earlier visual defect still exists today.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `apps/showcase-turbo-drift-circuit/src/main.ts` | Fix only newly reproduced hero cropping/camera defects and preserve gameplay. |
| EDIT | `apps/showcase-skyline-runner/src/main.ts` | Re-probe hero scale/framing and fix confirmed deficiencies. |
| EDIT | `apps/showcase-smart-city-control/src/main.ts` | Re-probe hero/panel occlusion after instancing changes and fix confirmed overlap. |
| EDIT | `docs/agents/claims-and-boundaries.md` | Align narrowly with final root/runtime/package evidence. |
| EDIT | `docs/project/status/known-limits.md` | Keep unresolved/unsupported capabilities explicit. |
| EDIT | `docs/project/status/current-state.md` | Describe the final verified set and remaining original non-goals. |
| EDIT | `docs/project/release/release-checklist.md` | Require exact 3.0.1 artifacts and all remediation gates. |
| EDIT | `tools/template-source-audit/index.ts` | Extend existing source boundary checks only where coverage is missing. |

**Detailed tasks**

1. Run current route producers on the final scene/source tree; inspect desktop/mobile and gameplay camera states. Fix actual cropping/occlusion/readability defects without lowering visual thresholds or relabeling completed requirements.
2. Run a complete changed-route/template/docs source sweep for three/GLTFLoader imports, raw GLB URLs/string IDs, unsafe asset access, primitive-only named heroes and DOM-faked rendering.
3. Retain typed asset manifests, generated references, hashes, licenses and route health. Regenerate changed asset evidence only through existing CLI/producers.
4. Update affected docs/rendering pages, README, llms/public mirror and marketing claims using final evidence; keep historical version/comparison references accurately labeled.

**Completion checklist**

- [x] Re-probed target routes pass their actual camera/hero/composition and gameplay requirements. **Verified 2026-09-07:** the final-source Q02 route producer passed with zero failures for Turbo Drift Circuit, Skyline Runner and Smart City. Turbo and Skyline each retain current route-primary, strict five-check composition and full gameplay evidence; Smart City retains six desktop/mobile command, selected-core and flythrough visible/suppressed cases. Immutable receipt: `tests/reports/3.0.1-evidence/q02-final-routes-v7/receipt.json` (`sha256-c66d9b2bab253f56b77de34cd7dfc41bd48a381058f28ba7134feece83467253`).
- [x] Full changed-surface boundary sweep passes; no spot-check substituted. **Verified 2026-09-07:** the current-source `tools/muse3jsparity-docs-audit/index.ts --review docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json` producer passed over all 98 selected changed route/template/document surfaces from frozen baseline `137280b3705e1968a35ddd1c891329e06199597e`: 870 findings, zero unresolved, five passing governance checks. Every review disposition is bound to the current file SHA-256 and retained evidence; hard source violations cannot be dispositioned. Report: `tests/reports/muse3jsparity-301-docs-audit.json`. Rendered route quality, final claims-to-receipt equality and publication remain separate requirements.
- [ ] Claims, known limits and per-feature tables agree with receipts.

**Evidence gate:** Fresh route-primary/health/gameplay/screenshot reports and docs/source-boundary checks.

<a id="l01"></a>

### L01. Prepare compatible 3.0.1 packages and exact-installed validation

**Original obligation:** L1 / J3 / L5 / L7.
**Dependencies:** All implementation and Q01/Q02 ready; G01–G03 green.

**Code-verified current state:** Current manifests and successful receipts target 3.0.0. Tag v3.0.0 points at c71aff6e, while later packaging fixes and validation use later commits; 3.0.1 must have unambiguous artifact lineage.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `package.json` | Version 3.0.1; preserve optional dependency and public export compatibility. |
| EDIT | `pnpm-lock.yaml` | Regenerate package/version/dependency resolution. |
| EDIT | `packages/create-aura3d/src/index.ts` | Update version-emission logic if literal pins require it. |
| EDIT | `tools/release/publish-all.mjs` | Reuse pack/publish flow; verify all artifact hashes and expected package set. |
| EDIT | `tools/agent-templates/index.ts` | Validate all 19 scaffolds against source and exact target tarballs. |
| EDIT | `tools/package-clean-install/index.ts` | Validate fresh package closures and optional-peer behavior. |
| EDIT | `tools/package-provenance/index.ts` | Bind provenance results to final artifacts. |
| EDIT | `tools/bundle-size/index.ts` | Preserve honest entry accounting and enforce existing budgets. |
| EDIT | `tools/installed-tree-shaking/index.ts` | Verify new code does not pull unrelated engine features into lean entries. |
| EDIT | `.github/workflows/release.yml` | Run corrected complete gates and publish the validated artifacts only. |

**Detailed tasks**

1. Update the root plus all 28 non-private package manifests listed in Appendix A to 3.0.1, internal version constraints and exact scaffold pins. Respect workspace protocol and optional navigation peer semantics.
2. Preserve 3.0.0 API behavior by default; new features must be additive/opt-in or compatible bug fixes. Add a consumer surface diff gate; if an unavoidable breaking change exists, record it as a versioning blocker rather than silently shipping a patch.
3. Build remotely, pack once from the release tree, hash tarballs and run all 19 source and exact-installed scaffold lifecycles, package smoke/provenance, exports/imports, clean install, bundle budgets and tree-shaking.
4. Do not increase bundle budgets just to make the gate green. Optimize first; any changed product budget must be explicitly recorded as a requirement change and cannot masquerade as unchanged acceptance.
5. Validate frozen 3.0.1 source/artifact manifests before a tag/publication step. Final release tag must resolve to the validated source; metadata-only changes need explicit scope and revalidation policy.

**Completion checklist**

- [x] 29 public packages and scaffold-generated installs consistently target 3.0.1. **Verified 2026-09-06:** `pnpm check:release-version` reports version `3.0.1`, 29 public packages, 19 scaffolds, `changed: []`, mode `check`.
- [ ] Zero compatibility, optional-peer, import/export, smoke or provenance failures.
- [ ] 149 existing lifecycle checks and 19 scaffolds preserved on both legs; new checks add coverage.
- [ ] Exact tarball hashes tested are those selected for publication.
- [ ] Bundle and lean isolation requirements hold.

**Evidence gate:** Remote build/package receipts, package manifests, tarball hashes and source/exact-installed lifecycle reports.

<a id="l02"></a>

### L02. Create exact-artifact visual review and complete release verification

**Original obligation:** L2–L7.
**Dependencies:** L01, V01/V02, Q02; actual independent human review before closure.

**Code-verified current state:** Original L4 leaves 3.0.0 human review open. build-final-visual-review-manifest.mjs hardcodes a 2.0 output/schema; verify-public-2-release.mjs hardcodes 2.0.0 and legacy deprecation policy. Reusing these unchanged cannot verify 3.0.1.

| Action | Filename | Required change |
| --- | --- | --- |
| EDIT | `tools/release/build-final-visual-review-manifest.mjs` | Parameterize target version/output and bind every reviewed artifact to the final source. |
| NEW | `tools/release/verify-public-release.mjs` | Version-parameterized read-only registry and artifact verification, separate from historical deprecation policy. |
| EDIT | `CHANGELOG.md` | Document 3.0.1 fixes, exact new proofs and compatibility. |
| NEW | `docs/project/aura3d-301-release-notes.md` | Final scope, evidence, losses, remaining original non-goals and provenance. |
| EDIT | `README.md` | Update current release and only earned claims. |
| EDIT | `llms.txt` | Update source guidance and version with evidence-bounded examples. |
| EDIT | `public/llms.txt` | Regenerate/synchronize from the canonical source. |
| EDIT | `marketing/index.html` | Update verified release wording and links. |
| NEW | `release-artifacts/3.0.1-final-visual-review-manifest.json` | GENERATED OUTPUT: exact image/video/report hashes, scopes and source. |
| NEW | `release-artifacts/3.0.1-final-visual-review-approval.json` | HUMAN-ORIGIN RECORD: actual reviewer decision bound to manifest hash. |
| NEW | `release-artifacts/3.0.1-npm-registry-verification.json` | GENERATED OUTPUT: exact version, count, integrity and publication verification. |

**Detailed tasks**

1. Make visual manifest generation version-aware; include corrected showcase routes, Aura Clash, required night/crowd adoptions and comparison gallery with exact scopes. Reject missing/unreadable/wrong-source artifacts.
2. Complete all machine work and produce a reviewable gallery before independent human review. Record the real decision and identity; never fabricate approval or reuse August 2.0 hashes. Any subsequent pixel-affecting change invalidates affected approval.
3. Prepare notes, registry verification and marketing deploy checks for the existing deployment environment. Keep historical 2.0 verifier/deprecation policy isolated; a 3.0.1 verification command must not unexpectedly modify old versions.
4. In the later implementation/release task, publish through the established process only after all required gates and the exact-artifact review are satisfied. Verify 29/29 published versions, integrity/provenance, clean registry installs and scaffold lifecycles against registry tarballs.
5. Deploy the versioned marketing/docs changes through the existing project environment, verify origin status/content/links and retain screenshots. Re-run final readiness on the tagged artifact set and archive this PRD after completion.

**Completion checklist**

- [ ] Independent reviewer approves the exact required final gallery; no pending route approval is hidden.
- [ ] Release notes and tag identify the validated source and tarball set.
- [ ] 29/29 registry artifacts and clean registry-installed lifecycles pass post-publish.
- [ ] Deployed origin serves correct 3.0.1 content and working docs/install links.
- [ ] Final full gate passes with no required task open, blocked, skipped or unresolved quarantine.

**Evidence gate:** Human-origin approval, generated artifact manifest, registry receipts, deployed-origin proof and final immutable readiness run.

## 5. Execution order and parallel ownership

1. **Gate foundation:** G01/G02/Q01 start together with separate file ownership; G03 adds coverage once the contract exists. Write failing regression fixtures for the known false-success case before changing the verdict code.
2. **Shared renderer contract:** R06 ownership design and R02 temporal contracts settle before conflicting device changes. Then R01/R03/R04/R05 can proceed in coordinated streams. Shader/output changes precede final visual receipts because they invalidate dependent pixels.
3. **Independent integration streams:** E01 locomotion; I01 controls; I02 labels; D01 decoders can proceed concurrently with renderer work. I03 and I04 are coordinated with the owners of actual route files and shared root APIs.
4. **Real workload validation:** P01/P02 and V01/V02 run only after their implementations settle. Do not repeatedly earn expensive receipts against a tree still changing underneath them.
5. **Freeze and packaging:** Q02 route/doc sweep, full baseline and L01 package/tarball checks precede the final fresh visual capture window. G02 enforces dependencies and timestamps, rather than pretending all tests finish within 30 minutes.
6. **Review and ship:** L02 assembles exact artifacts and obtains the independent decision, then the later release task publishes/deploys and verifies registry/origin results. Any source change after freeze invalidates affected downstream proof.

## 6. Validation command plan

The following named commands already exist. Run heavy stages remotely and retain exact invocations/exit codes; this list is a plan, not a report of execution. Reuse successful dependency receipts within the same immutable source/artifact run to avoid duplicate builds. Independent commands may run concurrently only when they do not overwrite shared output paths.

| Stage | Existing command | Required result |
| --- | --- | --- |
| Baseline | `pnpm typecheck:raw` | Zero errors |
| Baseline | `pnpm test:unit` | Zero failed/pending required cases; inventory/floors preserved |
| Baseline | `pnpm test:integration` | All required integration cases pass |
| Shader correctness | `pnpm verify:shaders` | Shader mirrors/reference checks pass after changes |
| Build | `pnpm build:raw` | Remote complete build from frozen source |
| Source scaffolds | `pnpm check:templates` | All 19 source lifecycles and current checks pass |
| Exact artifacts | `pnpm check:templates:installed` | All 19 lifecycles against the exact 3.0.1 tarball set |
| Package interfaces | `pnpm verify:exports` / `pnpm verify:imports` | Public surface/import contracts pass |
| Smoke/provenance | `pnpm verify:package-provenance` | Fresh-pack smoke and provenance pass |
| Clean consumer | `pnpm check:clean-install` | Fresh isolated package closure works |
| Size/isolation | `pnpm check:bundle-size` / `pnpm check:installed-tree-shaking` | Existing budgets and lean isolation hold |
| Installed comparison | `pnpm head-to-head:installed` | Current source/lock/tarballs bound to actual workloads |
| Public wording | `pnpm check:agent-docs` / `pnpm check:docs-codeblocks` / `pnpm check:docs-site` | Claims/codeblocks/site validated |
| Versions | `pnpm verify:docs-version` / `pnpm verify:versioned-release` | Current source/release version coherence |
| Full release | `pnpm muse3jsparity:release` | Corrected complete task/part coverage; no false supersede |

Run each section's named browser specs with the project Playwright configuration and appropriate remote device. NEW specs/commands must be implemented and wired before the full gate can count them. Do not invoke nonexistent proposed commands and record them as passed.

## 7. Required evidence schema

Every task closure must retain: task ID; original obligation IDs; exact source files/symbols; public claim surface; commit/tree and relevant source hash; lockfile hash; package/tarball integrity where relevant; command and exit code; test identifiers and assertion counts; UTC start/end; runner/browser/device/backend; workload parameters; acceptance metric/threshold/actual value; PNG/video/report hashes; dependency receipt IDs; warnings/limitations; reviewer identity/decision where required. `notApplicable` requires an explicit original non-goal or actual recorded scope decision, never an inferred shortcut.

Use one source-bound run manifest and immutable gate receipts. Keep full-program status distinct from package publication status and subset test status. A successfully published engine is not synonymous with complete PRD obligations.

## 8. Final 3.0.1 checklist

- [ ] **G01** — Make readiness fail closed for every required part; all section tasks/checks and evidence accepted.
- [ ] **G02** — Bind evidence to source, artifact hashes and actual time; all section tasks/checks and evidence accepted.
- [ ] **G03** — Add the omitted animation, physics, input/audio and recovery gate coverage; all section tasks/checks and evidence accepted.
- [x] **R01** — Deliver an actual root async render path and prove native routing; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** the public-root native bloom browser receipt proves matching synchronous/asynchronous native pixels and submissions, while the final-worktree deferred-resource and async-dispatch contracts pass 7/7 with disposal, resize, rejection and no-sync-retry ownership checks.
- [x] **R02** — Implement root motion blur and TAA end to end; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** successful integrated native run `34045615840` passes the frozen v2 R02 quality oracle with empty failures (including the 16x spatial/reset control), while 38/38 named ownership/lifecycle contracts satisfy every R02 completion item without reducing its oracle or scope. The earlier run `34031893801` remains retained as a failed tuning attempt and is not closure evidence.
- [x] **R03** — Port and prove native WebGPU TAA; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** native Apple WebGPU run `34001658939` passes all five dedicated temporal legs with 218 TAA passes, 327 temporal bindings, 284 submissions, 175 retained frame hashes and the frozen flicker/ghost/reset limits; 128/128 backend contracts keep unsupported hardware fail-closed.
- [x] **R04** — Promote clearcoat, sheen, iridescence and anisotropy texture maps; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** native run `34006289631` passes the 40-control eight-map matrix with 46 retained PNGs, all decoys/zero-film controls at zero, and UV/transform effects present; final-worktree root intent, lifecycle and atlas contracts pass 49/49 under the bounded rendering-surface claim.
- [x] **R05** — Finish B4 reflection-surface SSR using the existing native renderer; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** the retained B4 browser receipt proves six native SSR draws, owned-target sampling, moving reflection pixels, camera/roughness response and zero false-hit controls; current ownership/camera contracts pass 10/10 including missing-input and disposal rejection.
- [x] **R06** — Replace counter-only framegraph passes with real resource flow; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** remote job 29 passes all 11 named integrations and the 4/4 root-path browser suite; current 101/101 framegraph/resource/async contracts prove actual six-stage dispatch, declared dependency enforcement, single renderer ownership and root/lower-level consumer behavior.
- [x] **P01** — Re-earn the full 10,000-live-particle performance requirement; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** native run `34045615840` passed the unchanged 60-second Apple Metal gate at 59.88024 median FPS, 20.0 ms p95 and 463.3 ms longest sub-55 interval with 10,000 live/rendered particles, full feature workload, valid completion clocks and visual controls. Exact overlay SHA-256: `50ef64a3a2d21af6a0d8a53edee88b17edd62a646bd47a9ef8804cdcba31aab4`.
- [x] **P02** — Measure rendered shadow stability over the requested stress run; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** current-source C021 passes 5/5 rendered shadow tests, the fixed 60-second five-mode metric and negative controls, and direct review of five hash-bound frames shows stable attached shadows without acne, clipping, detachment or cascade-boundary artifacts.
- [x] **E01** — Complete translated root-motion locomotion and measured rig profiles; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** native macOS run `34029312582` passes all 16 ordered certified-rig pairs with zero unexpected/skipped/flaky cases and empty rendered-quality failures; the source-bound Azure locomotion receipt passes all five straight/turn/slope/blocked/crossfade scenarios with Recast guidance, Rapier ownership and exact requested/accepted/rejected accounting; the disposition verifier closes all 16 pair mappings with 18/18 regressions. Independent final-gallery review remains an L02 release gate, not an E01 implementation gap.
- [x] **I01** — Finish control damping, cursor zoom and pan bounds; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** 35/35 final-worktree option/delegation/disposal contracts and remote job 11 exercise Orbit/Map on perspective/orthographic cameras with cursor pivot, bounded pan, delta-time convergence, reset, exact listener teardown and no late mutation.
- [x] **I02** — Wire per-role label collision behavior into real placement; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** current-source C021 passes 3/3 browser and 24/24 unit contracts; all eight retained desktop/mobile role, font and camera captures keep labels legible and outside the typed robot’s protected region.
- [x] **I03** — Render crowd LOD transitions and adopt instanced GLBs in real scenes; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** the source-bound Azure O1 receipt passes actual near/mid/impostor representation changes with hysteresis, four moving Recast agents, selection/visibility survival, replacement/disposal rejection and capacity enforcement; retained Smart City and Aura Clash route receipts prove six visible typed city copies in one six-instance draw and 28 visible spectator copies in one 28-instance draw with hidden/repeat pixel controls and no silently dropped instances.
- [x] **I04** — Complete the named camera and spotlight route adoptions; all section tasks/checks and evidence accepted. **Closed 2026-09-07:** exact application-source hashes match the source-bound remote receipts; camera/game-feel passed 4/4 and the two-application spotlight matrix passed 4/4 across desktop/mobile with real light and shadow negative controls.
- [x] **D01** — Align decoder versions and enforce the installed comparison matrix; all section tasks/checks and evidence accepted. **Closed 2026-09-06:** installed alignment resolves Draco 1.5.7, Meshoptimizer 1.2.0 and content-verified KTX 1.0.1; 12/12 negative/provenance contracts, 16 local compression/optional-peer assertions, 3/3 live Khronos fixtures and 3/3 source-hashed Azure rendered compression cases pass with exact diagnostics and visible-pixel evidence.
- [x] **V01** — Implement the original feature-by-feature r185 visual comparison; all machine-verifiable section tasks/checks and evidence accepted. **Closed 2026-09-08:** exact-source remote run passed 8/8 and receipt `f041987e852a3ad26f85a3f1698bcac37853e30e0467fe2428899aa1ae653761` independently replayed all mapped obligations and 66 captures. The independent exact-gallery decision remains explicitly tracked under L02 and the V01 reviewed-imagery checklist line.
- [x] **V02** — Measure end-to-end comparative game workloads; all section tasks/checks and evidence accepted. **Closed 2026-09-07:** source-stable remote run `v02-cd403-20260907T074438Z` passed 13/13 focused units and 7/7 browser cases. The complete real-engine receipt retains 1,440 GPU-completed fixed-workload samples across bloom, 4,000 instances, 64 lights and 10,000 particles, rejects synthetic Aura timing, and reports all measured SwiftShader losses without making a universal hardware claim.
- [ ] **Q01** — Reconcile original tasks, checklists and generated evidence; all section tasks/checks and evidence accepted.
- [ ] **Q02** — Revalidate route framing, public claims and release assets; all section tasks/checks and evidence accepted.
- [ ] **L01** — Prepare compatible 3.0.1 packages and exact-installed validation; all section tasks/checks and evidence accepted.
- [ ] **L02** — Create exact-artifact visual review and complete release verification; all section tasks/checks and evidence accepted.
- [x] Original numbered-task ledger is exhaustive and contains no unmapped obligation. **Verified 2026-09-06:** producer-regenerated traceability inventories 756/756 obligations with zero missing test files and zero obligations lacking a named test or typed acceptance contract; the 114/114 contract run rejects duplicate, missing, self-referential and cyclic mappings.
- [ ] No required item is open, blocked, skipped, quarantined or closed by reduced scope.
- [ ] No stale evidence, duplicate self-referential freshness proof or unbound source/artifact receipt.
- [ ] Final claims name actual supported surfaces, measured wins and losses.
- [ ] Exact final visual artifacts have the required independent human decision.
- [ ] Final tag/source/package/deployed-origin lineage is unambiguous.
- [ ] Temporary local processes and ephemeral cloud resources created for execution are cleaned up.

## Appendix A. Exact public package manifests to update

This list is discovered from the root plus non-private immediate workspace package manifests at the verified tree. Re-enumerate before implementation; fail the release inventory if the expected set changes without an explicit decision. Do not version-bump archived manifests or generated dist manifests as source.

| Filename | Package | Target |
| --- | --- | --- |
| `package.json` | `@aura3d/engine` | `3.0.1` |
| `packages/animation/package.json` | `@aura3d/animation` | `3.0.1` |
| `packages/apps/package.json` | `@aura3d/apps` | `3.0.1` |
| `packages/asset-index/package.json` | `@aura3d/asset-index` | `3.0.1` |
| `packages/assets/package.json` | `@aura3d/assets` | `3.0.1` |
| `packages/audio/package.json` | `@aura3d/audio` | `3.0.1` |
| `packages/aura3d-cli/package.json` | `@aura3d/cli` | `3.0.1` |
| `packages/controls/package.json` | `@aura3d/controls` | `3.0.1` |
| `packages/core/package.json` | `@aura3d/core` | `3.0.1` |
| `packages/create-aura3d/package.json` | `create-aura3d` | `3.0.1` |
| `packages/debug/package.json` | `@aura3d/debug` | `3.0.1` |
| `packages/ecs/package.json` | `@aura3d/ecs` | `3.0.1` |
| `packages/editor/package.json` | `@aura3d/editor` | `3.0.1` |
| `packages/editor-runtime/package.json` | `@aura3d/editor-runtime` | `3.0.1` |
| `packages/environments/package.json` | `@aura3d/environments` | `3.0.1` |
| `packages/input/package.json` | `@aura3d/input` | `3.0.1` |
| `packages/lean/package.json` | `@aura3d/lean` | `3.0.1` |
| `packages/materials/package.json` | `@aura3d/materials` | `3.0.1` |
| `packages/math/package.json` | `@aura3d/math` | `3.0.1` |
| `packages/navigation-recast/package.json` | `@aura3d/navigation-recast` | `3.0.1` |
| `packages/physics/package.json` | `@aura3d/physics` | `3.0.1` |
| `packages/physics-rapier/package.json` | `@aura3d/physics-rapier` | `3.0.1` |
| `packages/product-studio/package.json` | `@aura3d/product-studio` | `3.0.1` |
| `packages/react/package.json` | `@aura3d/react` | `3.0.1` |
| `packages/rendering/package.json` | `@aura3d/rendering` | `3.0.1` |
| `packages/scene/package.json` | `@aura3d/scene` | `3.0.1` |
| `packages/scripting/package.json` | `@aura3d/scripting` | `3.0.1` |
| `packages/three-compat/package.json` | `@aura3d/three-compat` | `3.0.1` |
| `packages/workflows/package.json` | `@aura3d/workflows` | `3.0.1` |

## Appendix B. Carry-forward proofs and exclusions

- Preserve successful native GLB instancing (including multi-primitive draw accounting), WebGPU FXAA/bloom/spot/textured-PBR proof, root basic texture/IBL proof, source/exact-installed lifecycles, and actual existing rig/physics/input/audio/resource tests. Re-earn affected evidence after source changes; do not recreate working features from scratch.
- P3's original explicit “pixels OR bounded diagnostics” alternative is not itself a missing implementation task. Keep its bounded diagnostics truthful; R04 addresses separately requested extension texture maps.
- J2 originally permits render-bundle prototype measurement or OUT with measured reasoning. Existing measured prototype is not evidence of engine adoption, but lack of adoption alone is not a new blocker under that original alternative.
- Do not count the matrix's 10 explicit OUT rows as automatic implementation obligations. The four GAP and 15 PARTIAL rows need task-level traceability; assigned ownership alone is not rendered proof.
- Root async, real translated locomotion and per-certified-rig profiles remain explicit obligations here. Measurement may establish a valid identity profile; an empty registry or package-only async receipt does not silently close them.
- Preserve the 3.0.0 PRD archive and old approvals as historical records. This file and its future 3.0.1 evidence supersede completion claims without rewriting history.

## Appendix C. Scaffold manifest and asset-source hit list

Inspect each active scaffold manifest below for emitted 3.0.0 pins and update only current target-version references to 3.0.1. Their dependencies differ; do not blindly add root features to lean templates. The lifecycle owner remains L01.

| Filename | Required action |
| --- | --- |
| `packages/create-aura3d/templates/animation-channel/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/animation-studio/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/character-controller/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/cinematic-scene/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/episode-builder/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/falling-blocks-starter/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/fighting-game/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/mini-game/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/product-viewer/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/prompt-animation-channel/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/racing-starter/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-architecture-interior/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-asset-inspector/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-character-viewer/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-custom-threejs-migration/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-large-scene/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-material-authoring/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-postprocess-scene/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |
| `packages/create-aura3d/templates/three-compat-premium-product-viewer/package.json` | Inspect emitted version pins; preserve dependency closure; run source/exact-installed lifecycle. |

For changed typed assets in I03/I04/E01/R04, use the CLI producers. Existing route manifests/reference files below are inspection/regeneration targets, never hand-authored evidence:

- `apps/aura-clash-showcase/aura.assets.json` — regenerate through the asset CLI if its referenced assets change.
- `apps/aura-clash-showcase/src/aura-assets.ts` — regenerate through the asset CLI if its referenced assets change.

## Appendix D. Shared-file coordination

The following files appear in multiple work orders. Assign one edit owner and integrate reviewed patches from the other streams; do not run concurrent uncoordinated mutations of these files.

| Filename | Work orders |
| --- | --- |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | I03, I04 |
| `apps/showcase-skyline-runner/src/main.ts` | I04, Q02 |
| `apps/showcase-smart-city-control/src/main.ts` | I03, Q02 |
| `apps/showcase-turbo-drift-circuit/src/main.ts` | I04, Q02 |
| `package.json` | D01, G01, L01 |
| `packages/engine/src/agent-api/index.ts` | P02, R01, R02, R04 |
| `packages/engine/src/production-runtime/TypedGLBActor.ts` | E01, I03 |
| `packages/engine/src/production-runtime/index.ts` | R01, R02, R04 |
| `packages/rendering/src/ForwardPass.ts` | P02, R04 |
| `packages/rendering/src/Renderer.ts` | R01, R02, R05 |
| `packages/rendering/src/RendererPostprocessPlan.ts` | R02, R05 |
| `packages/rendering/src/WebGL2Device.ts` | R02, R05 |
| `pnpm-lock.yaml` | D01, L01 |
| `tests/browser/game-visual-superiority.spec.ts` | G02, V01, V02 |
| `tests/browser/library-parity-superiority.spec.ts` | G02, V01 |
| `tests/browser/root-path-integrity.spec.ts` | G02, R01, R06 |
| `tools/muse3jsparity-readiness/index.ts` | G01, G02, G03 |

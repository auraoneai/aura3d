# Aura3D native roadmap: current source audit

Date: 2026-11-02. This is a source-inspection report, not a code-complete
record or a claim of browser, device, visual, or release acceptance.

## Current Source-Inspection Estimate

A subsequent read-only review covered all 192 section 5 tasks using the
historical row audit and targeted checks of current source. It decomposed them
into 1,014 countable source-side subrequirements; five evidence/acceptance-only
items were excluded.

| Source-side subrequirements | Count | Share |
| --- | ---: | ---: |
| Judged present | 784 | 77.3% |
| Partial | 183 | 18.0% |
| Missing | 43 | 4.2% |
| Unknown | 4 | 0.4% |

Shares are approximate. The previously reported 785 present / 182 partial
count was corrected by moving graph value validation to partial after checking
the imported array-index case described below; this was a classification
correction, not a loss of code. That case was subsequently fixed as recorded
below, but this historical aggregate has not been recalculated.
This is a **provisional, equal-weight source-inspection estimate**, not rigorous
verification, an exact measure of engineering effort or elapsed work, or a
reproducible row-level source gate. The 77.3% counts only subrequirements judged
present; it does not assign completion credit to the 183 partial subrequirements
or claim an overall percentage including their unfinished work. The approximately
77% already includes finished pieces inside tasks that the older audit classified
as partial. It must not be added to, or compared as the same unit with, the
historical whole-task and ledger-outcome percentages below. The original audit
JSON and work-package table remain historical; no updated row-level ledger is
implied by this aggregate.

Present test source is not evidence that a test passed. No tests, builds,
browsers, or network operations were run for this update. There is no frozen
candidate or `CODE_COMPLETE_GO` record, and the full candidate-bound source
suite has not been run; post-freeze acceptance remains locked.

## Current Source Corrections And Remaining Limits

These targeted observations supersede conflicting historical row reasons; they
are not claims of complete behavior or passing tests.

- **Current continuation, WP-21/24/30/07:** Frame-camera projection and
  inverse now use the captured projection, and single-view culling snapshots
  the camera frustum before item collection. Two existing camera/depth suites
  passed 32 checks; three selected culling/precompile checks and synchronous
  and asynchronous mock probes passed. Two existing camera preflight checks
  still expect explicit standard fallback to throw. Production reversed and
  logarithmic depth remain unsupported.
  Worker observer and frame error reporting now tolerate unprintable and
  revoked-proxy thrown values without losing input or leaving a frame pending;
  three selected protocol checks and offline mock probes passed. Other
  transport errors and real workers remain unverified. A focused TypeScript
  check reported zero diagnostics in the two camera files and worker runtime;
  it is not a full package typecheck.
  The public-surface comparator analyzes bounded static runtime exports,
  changed condition targets and order, and applies exact/overlapping wildcard
  precedence including null blockers. Twenty existing focused checks passed.
  Baseline metadata authenticity/freshness, a real candidate comparison and
  the next-major migration record remain open.
  glTF now accepts finite non-negative alpha cutoffs above one. Four selected
  checks passed, while an existing assertion expecting 1.5 to be rejected
  fails and is unchanged. No browser, GPU or device result is implied.
- **Stale source findings:** The current root physical factory and compiler
  forward independently authored iridescence thickness endpoints. SVG export
  selects the position stream and decoded attributes where available.
  Generated terrain and `world.terrain` now both include vertical origin; an
  offline probe compared three heights, a collider height and a raycast for a
  nonzero origin. Scene queries share the production primitive-culling rule,
  admit narrowly certified position-only custom shaders, and expose live
  batch-member lifetime IDs. These observations do not resolve the existing
  batch test conflicts or establish candidate/browser verification. Arcball
  now measures the content box and its native camera adapter supplies
  projection and up-aware operations. The example dev server admits the
  runner's private external candidate, but candidate restoration remains
  blocked. The runtime source-audit CLI now includes root public and fixture
  trees; no candidate scan was run.
- **Mini-game asset provenance:** The source and mirrored mini-game manifests
  now identify the star and key GLBs' `Textures/colormap.png` dependency.
  The matching sidecar and its digest remain missing; locally available
  similarly named images have different hashes and unproven identity. The
  skyline runner manifest still conflicts with its file and provenance, so
  neither asset is claimed repaired. A local dependency check reported 18
  errors for nine GLBs across seven templates, including missing sidecars and
  dependency integrity. The mini-game mirror check also found three existing
  HTML/font differences.
- **Decoder abort safety:** Basis and Draco initialization callbacks now
  format hostile abort reasons safely and redact sensitive text. An offline
  Basis probe previously remained pending when the callback threw; afterward
  unprintable objects, revoked proxies and secret-bearing messages rejected
  promptly. One existing Basis abort check passed, with 48 skipped, and the
  three changed decoder modules passed focused typechecking.
- **Borrowed WebGPU canvas ownership:** Separate wrappers around the same
  borrowed device now use distinct canvas ownership tokens. Offline mocks
  reproduced the old wrapper unconfiguring the newer owner's canvas and
  passed afterward, including five fence/loss/retry scenarios. Existing
  presentation checks passed 39/39, interop/retirement checks passed 32/32,
  and teardown remained 26 passed / 32 failed. These are mock-device results,
  not real GPU verification; the teardown failures remain open.
- **Root meshlet integration:** Eligible untextured physical HDR roots with a
  resolved global probe now use meshlet culling through the guarded deferred
  pass. Textures, shadows, fog, local probes, instancing and other unsupported
  features still fall back; visibility routing remains open. Explicit HDR
  target/sample combinations now prewarm meshlet and shared deferred pipelines
  with cancellable ownership; targets whose identity is unknown still do not
  prewarm. Offline 1x/4x, cancellation and safe-plan probes passed, as did two
  existing root-selection checks and focused typechecking.
  Selected existing checks passed 18, and offline physical/probe/ownership and
  fallback mocks passed. Two focused files had 27 passes and three retirement
  failures reproduced against their pre-change source. No real GPU, WGSL or
  browser execution was performed.
- **Pivot and editor serialization:** Scene serialization preserves optional
  pivots, and the editor project captures, normalizes, validates, and restores
  them; editor transform commands also handle pivot edits. Some pivoted physics
  and look-at mutations remain restricted. See
  `packages/scene/src/SceneSerializer.ts:1074`,
  `apps/editor/src/project/ProjectSerializer.ts:698,792`,
  `packages/editor-runtime/src/commands/TransformCommand.ts:70`, and
  `packages/engine/src/agent-api/app/runtimeNodes.ts:919`.
- **Worker timing and recovery:** Automatic frames use bounded render time;
  manual steps use their supplied delta. Recoverable scene-replacement and
  recovery failures can restore a usable prior renderer while reporting the
  failed attempt. See `packages/engine/src/agent-api/app/workerFrameLoop.ts:139,206`,
  `packages/engine/src/agent-api/app/workerRootApp.ts:442,545`, and
  `packages/engine/src/agent-api/app/workerRuntime.ts:975`.
- **Shader graph control flow:** Material graphs have validated `if`, bounded
  `loop`, and `setOutput` statements emitted for GLSL and WGSL. Limits include
  initialized outputs and no implicit texture sampling in fragment control
  flow. During the review, imported scalar index constants represented as
  single-element arrays bypassed the compiler's literal array-index bounds
  check. That case was subsequently fixed; overall graph validation remains
  subject to the other unverified graph requirements. See
  `packages/rendering/src/program/ShaderGraphCompiler.ts:689,751,988,2360`.
- **3D texture updates and EXR:** Full mip updates and bounded 3D regions are
  implemented; regions require a complete CPU-authoritative retained mip.
  WebGL2 and WebGPU have volume upload paths. EXR export selects one float
  render-target color attachment, warns about omitted attachments, and retains
  backend/subresource limits. See `packages/rendering/src/Texture.ts:443,609`,
  `packages/rendering/src/webgl2/TextureUpload.ts:910`,
  `packages/rendering/src/WebGPUDevice.ts:8618`, and
  `packages/assets/src/exporters/RenderTargetEXR.ts:63,85,160,217`.
- **WP-11 paused warp recheck:** Current pose warp uses unpaused action time
  rather than the advancing mixer clock. An offline source probe checked it
  against core playback across pause and resume; the broader cross-path
  verification remains open.
- **Diagnostics:** Root snapshots can include shader failures and sanitized
  diagnostics; the editor profiler distinguishes measured CPU samples from
  unavailable ones. Renderer inspection is still partial, with whole-frame CPU
  and GPU timings null and separately scoped view GPU timings. See
  `packages/engine/src/agent-api/diagnostics.ts:288`,
  `apps/editor/src/panels/ProfilerPanel.ts:11`, and
  `packages/rendering/src/Renderer.ts:1960`.
- **Assets:** The Gaussian splat loader passes the effective document request
  policy into its child scope and applies dependency policy and applicable
  integrity checks; this does not establish universal loader/provenance
  coverage. The glTF support matrix now records limited runtime/render paths
  for `KHR_materials_diffuse_roughness` and `EXT_materials_bump`; required
  use and rendered fidelity remain unverified. The source-derived catalog remains
  incomplete and documents missing sidecars; its counts are not a fresh
  discovery run. See
  `packages/assets/src/loaders/GaussianSplatLoader.ts:882`,
  `packages/assets/src/LoadContext.ts:77`,
  `packages/assets/src/GLTFExtensionSupport.ts:54,74`, and
  `tests/fixtures/native-examples-catalog/README.md:21,98`.
- **WP-07 custom image admission:** A supplied glTF image decoder now receives
  a byte snapshot only after any inherited or per-call `maxBytes` limit is
  enforced; a larger per-call limit cannot widen the document's limit. Uncapped
  custom decoders are not forced to prefetch. Offline probes covered embedded
  and external limits, invalid limits and snapshot isolation; two existing
  cache/integrity checks passed and a focused source typecheck had zero
  diagnostics. A separate mutation probe confirmed externally referenced
  in-memory image bytes are copied before hashing, so the decoder receives
  that verified snapshot; oversize data is rejected before copying. This does
  not establish browser or catalog-wide coverage.
- **WP-07 decode ownership:** glTF resources snapshot the custom decoder and
  nested transcoder/worker-asset settings before asynchronous acquisition;
  changed settings enter the hashed cache identity, while equal settings can
  still share. An already-cancelled decode is not dispatched. Source probes
  covered option mutation, independent transcoder limits, cancellation before
  dispatch, and closure of a decoder result arriving after cancellation. Three
  selected existing cache/integrity and worker-fixture checks and the focused
  two-root typecheck passed. Caller-owned pools and broader ownership cases
  remain subject to verification.
- **WP-07 public loader ownership:** `FileLoader` captures response type and
  MIME per request, and FileLoader, ImageBitmapLoader and DataTextureLoader
  consume failures from their detached error observers without masking the
  original load failure. Offline probes checked concurrent text/JSON/blob
  requests and throwing/rejecting observers; the focused three-root
  typecheck had zero diagnostics. An existing FileLoader transport case and
  bitmap cancellation case passed; one bitmap orientation case failed
  because its ImageBitmap mock has no width or height, conflicting with the
  existing dimension admission. The test was not modified.
- **Native rendering:** An absent/undefined or ordinary empty
  `collectedLights` data value can pass the meshlet/visibility light check,
  subject to other admission rules. Eligible untextured physical HDR roots
  with a resolved global probe now use meshlet culling in the guarded deferred
  pass, including its bounded directional-light support. Visibility and
  unsupported meshlet features still fall back to the full forward route, or
  fail when fallback is disabled.
  Native WebGPU wetness remains unsupported: the generated PBR feature
  allowlist excludes it and deferred live wetness routes to forward only when
  fallback is allowed, otherwise it fails. See
  `packages/rendering/src/Renderer.ts:2544,2634,2644,2756,2896` and
  `packages/rendering/src/webgpu/GeneratedPbrProgram.ts:243`.
- **Production camera depth:** Valid reversed or logarithmic requests can
  explicitly fall back to a rebuilt standard-depth projection when
  `allowFallback: true`; otherwise they are rejected. Native production
  nonstandard depth remains unavailable. See
  `packages/engine/src/agent-api/compiler/cameraDepth.ts:31`.
- **Provenance and runner custody:** Independent source provenance and the
  isolated, authenticated source/consumer execution path remain blocked. The
  source image explicitly refuses execution, and the consumer matrix has no
  isolated producer. See `packages/math/src/three/index.ts:12`,
  `tools/release/workspace-pnpm-admission.mjs:14`,
  `tools/remote-acr/Dockerfile.source:22`, and
  `tools/native-consumer-matrix/index.ts:743,990`.

## Subsequent Focused Source Work

- **WP-05:** `ShaderGraphCompiler.ts` now checks array-wrapped literal indices
  against array bounds and emits array-wrapped boolean constants correctly.
  Direct source probes exercised both representations on GLSL and WGSL. The
  existing `native-shader-graph-struct-noise-functions.test.ts` file passed
  25 tests, and `native-shader-graph.test.ts` passed 13 tests separately. A
  combined run with `native-graph-portable-material.test.ts` did not finish and
  was stopped, so the required two-file check remains unverified. The mutable-tree
  results are not candidate-bound verification. A focused compiler-root
  typecheck using the rendering package's actual path mappings returned no
  diagnostics; a prior ad-hoc `tsc` invocation without those mappings returned
  six dependency-type errors and is not a package typecheck.
- **WP-21:** `ResourceRegistry.ts` now rechecks the registered device after an
  asynchronous refetch, so a resource that migrated to another device is not
  rebuilt by the prior device's restore. A direct source probe reproduced the
  old behavior and checked the new owner can rebuild. The existing
  `native-wp21-device-restore-isolation.test.ts` and
  `native-wp21-batch-restore-isolation.test.ts` files passed 16 tests together.
  The existing particle restore-isolation file passed 26 tests separately.
  A focused registry-root typecheck using the rendering package's path mappings
  returned no diagnostics; this is not a full package typecheck. A later fix
  reports a released source without a refetch callback as failed rather than
  rebuilding and reporting success. A direct before/after source probe covered
  that branch; six selected existing retention/restore checks and a focused
  typecheck passed, without establishing the complete restore outcome.
- **WP-21 WebGL restore visibility:** A failed registry rebuild now reaches
  persistent device diagnostics while restore listeners still run. A newer
  loss also suppresses stale restore notifications and failures from an
  earlier pending hook. Direct source probes reproduced both problems and
  exercised the fixes; three selected existing hook-ordering checks and nine
  restore-isolation checks passed, and the three changed lifecycle files had
  no focused typecheck diagnostics. The probes do not establish a live WebGL
  context or prevent an already-running hook from doing late internal work.
- **Existing camera fix reconciled:** The current controller already excludes
  the shoulder-rig subject from its collision probe. The existing
  `native-camera-character-subject-regression.test.ts` passed with the real GLB
  in an offline reconstruction. This is not browser evidence; the catalog's
  exposure and subject-region requirements remain open.
- **Existing asset fixes reconciled:** The splat loader now forwards the
  effective document policy into its child context, and asset-handle and glTF
  disposal errors redact URLs. Two selected existing splat transport and
  integrity checks passed. An attempted two-case run of `native-asset-integrity.test.ts`
  did not finish and was stopped; each of those two cases subsequently passed
  when run separately, which does not establish why the combined run stalled.
  Ordinary image loading now has default byte and pixel limits, but some formats
  cannot be dimension-preflighted and native decoder scratch memory is not
  bounded by those limits.
- **WP-07:** `AssetLoadError` now redacts cause names and tolerates throwing
  cause getters and string conversion. A direct source probe exercised those
  cases without logging the supplied values; two selected existing request
  and limit checks passed. A focused `AssetLoader.ts` root typecheck using the
  assets package configuration returned no diagnostics.
- **WP-07 glTF diagnostics:** Texture fallback and strict-error diagnostics
  now sanitize the cloned cause, reason and warning label; late cleanup logs
  sanitize error/aggregate details. Two selected existing fallback and late
  cleanup checks passed, as did a focused resource-root typecheck. Direct
  source probes exercised signed-looking values and throwing cause getters.
  An uninspectable exception remains fail-closed rather than silently becoming
  a texture fallback; a direct revoked-proxy probe and the selected fallback
  check passed after that adjustment. Policy/cancellation errors still
  preserve their original propagation, and the complete outcome remains open.
- **WP-07 draft material status:** Optional diffuse-roughness and bump inputs
  reach compatible PBR material bindings and shader source. The matrix now
  reports limited runtime/render support, but still rejects required use.
  A direct mock-decoder source probe, two existing required-rejection checks,
  and a focused typecheck passed. One existing support-matrix test fails
  because it asserts the previous unsupported status; another focused
  material-resource run was stopped without a result. No tests were changed
  and no GPU output was verified.
- **WP-07 splat integrity:** The custom dependency-resolver path now parses
  the same byte snapshot it verifies, and inline validation receives a copy
  rather than the parser's bytes. Before/after offline probes covered mutation,
  integrity and policy failures; two existing selected splat checks and a
  focused loader typecheck passed. Broader asset conformance remains open.
- **WP-07/WP-08 glTF browser images:** The default browser decoder now applies
  the existing 64 MiB input and 32 Mi-pixel dimension limits to embedded and
  fetched raster images. Recognized formats are inspected before decode;
  bitmap and HTML image results are also checked and rejected owners cleaned
  up. Offline mocks covered limits, request policy, resize cleanup, and bitmap
  and HTML rejection. A source probe through `GLTFLoader` and
  `createGLTFRenderResources` exercised a valid texture, oversized input and
  failed dependency integrity with mock fetch/bitmap providers. The focused
  decoder-root typecheck passed. A two-file existing test run and a single-case
  retry were suspended and terminated without results. Unsupported preflight
  formats can still allocate in the browser decoder before the postcheck;
  custom decoders, KTX2 and real browser behavior are not covered by this
  change.
- **WP-07 KTX2 transport:** The direct glTF and decoder-registry paths now
  enforce the transcoder's existing 64 MiB input cap while fetching or reading
  embedded KTX2 bytes, rather than only after the entire input is loaded.
  Offline probes covered oversized transport and embedded data, a stricter
  caller limit, streamed cancellation, separate cache identities for different
  byte limits, and the unchanged raw byte-reader default. The real vendored
  Basis fixture decoded successfully through both paths, and the focused
  registry-root typecheck returned no diagnostics. Browser and worker
  execution remain unverified.
- **WP-07 decoder teardown:** Registry-owned KTX2 image transcodes now pass
  their late-cleanup receipt into the registry's existing disposal barrier.
  Two existing abandoned-initialization checks and a focused registry-root
  typecheck passed. The selected checks do not directly exercise the new
  callback branch; complete decoder teardown verification remains open.
- **WP-07 Basis factory teardown:** Aborted Basis initialization now waits for
  a late factory result and releases the distinct returned owner as well as
  the partial module, without releasing the same object twice. A direct mock
  probe covered late results, asynchronous disposal, independent cleanup when
  one owner hangs, and cleanup errors; a registry-level mock confirmed both
  retry attempts hold the disposal barrier until their late owners are
  released. Four selected existing decoder checks passed (45 skipped); the
  existing real Basis/ETC1S decode check also passed (48 skipped), and the
  focused transcoder-root typecheck returned no diagnostics. A factory or
  initializer that never settles can still hold disposal pending; complete
  worker and decoder teardown remain unverified.
- **WP-07 Basis readiness:** A runtime-initialized callback no longer publishes
  a decoder before its factory promise settles. An offline before/after probe
  covered late factory success, rejection and abort/cleanup; the real Basis
  fixture decoded through both glTF source paths, and a focused transcoder-root
  typecheck returned no diagnostics. No existing test result is claimed for
  this latest readiness change, and browser/worker execution remains unverified.
- **WP-07 Draco initialization:** The registry tracks a factory result
  through readiness after an abort and releases abandoned decoder instances
  before its disposal barrier settles. Offline probes exercised abort timing,
  late cleanup, retry and errors; three selected existing checks and a focused
  typecheck passed. An initializer that never settles can still keep disposal
  pending; full worker and KTX2 teardown remain unverified.
- **WP-19/WP-24 stale findings:** The current asset browser source barrel
  exports `ImportPipeline`. Packed API source now retains bounded runtime
  JavaScript, detects export-condition retargeting, and rejects an older
  baseline when a newer prior stable release appears in its metadata snapshot.
  Two existing subpath/condition checks and focused retarget/baseline source
  probes passed. Metadata freshness, packed candidate behavior, installed
  consumers and candidate-bound verification remain unestablished.
- **WP-25 stale invocation finding:** `check:release` now forwards both the
  source-report and candidate-plan arguments to installed tree-shaking, and
  the legacy recorder supplies the candidate plan through its environment.
  The release command remains deliberately blocked by missing clean-install
  custody; no release or installed-consumer command was run.
- **WP-18 documentation:** The agent quickstart now distinguishes the
  historical 4.1.2 neutral-manifest 404 from the current embedded neutral
  source path, and links to the existing non-neutral/HDRI troubleshooting.
  The link and source branch were inspected; installed packages and browser
  behavior were not verified.
- **WP-07/WP-28 missing template assets:** A root
  `public/aura-assets/Textures/colormap.png` exists, but the manifest associates
  that shared relative name with other models, not the mini-game key and star.
  Its identity as their required texture is unproven, so it was not copied
  into the template or represented as verified provenance.
- **WP-32 stale findings:** Current texture source includes retained 3D
  subregion updates, and WebGPU now checks external-source dimensions,
  including `displayWidth`/`displayHeight`, before sampled texture admission.
  Two selected existing WebGL checks for closed borrowed frames passed. Those
  checks do not establish WebGPU frame behavior or browser/device acceptance.
  A direct CPU probe and a queue-shaped WebGPU source probe exercised a 3D
  mip-region merge, bounds rejection, storage reuse and selective mip upload;
  two existing WebGL 3D mip checks also passed. The mock does not execute a
  GPU driver or establish browser/device coverage.
- **WP-32 output diagnostics recheck:** The current output collector includes
  the observed `colorSpace` negotiation and distinguishes requested,
  supported, active and fallback values. A direct context-shaped source probe
  confirmed the P3-to-sRGB fallback object. The packed browser fixture and
  actual display behavior remain unverified.
- **WP-32 compressed fallback metadata:** WebGPU now retains a valid decoded
  fallback and its native allocation for metadata-only revisions; compressed
  content edits still reject the invalidated fallback. A two-device mock probe
  checked allocation reuse, sRGB reallocation and stale-content rejection.
  Two selected existing stale-fallback checks passed (15 skipped), and a
  focused device-root typecheck returned no diagnostics. The earlier
  reproduction observed the defect but exited with a teardown-method error;
  it is not a passing check. Actual GPU/browser behavior and replacing decoded
  fallback data after a content edit remain unverified.
- **WP-21 stale diagnostic finding:** Current formatting bounds top-level
  bigints, and worker listener errors go through the bounded diagnostic buffer.
  One existing hostile/cyclic formatting check and a top-level large-bigint
  source probe passed. This does not complete the broader app-isolation or
  worker-lifecycle verification.
- **WP-21 shader cache recheck:** Current `ProgramCache` source retains
  uncertain program retirements with the device and reports failures; where a
  program exposes an explicit pending receipt, a later disposal can retry in
  the same generation. A direct mock probe exercised a failed late compilation
  cleanup and successful retry. This supersedes the older blanket claim that
  such failures are always discarded; uncertain cleanup and the wider shader
  lifecycle remain open. No source or test files were changed for this check.
- **WP-21 remount cleanup recheck:** Current app remount source guards
  unsubscribe, compute, controller and physics cleanup separately and
  aggregates failures while the same mount still owns them. This supersedes
  the older claim that an early cleanup exception necessarily skips later
  siblings; failed-resource retry and the complete mount race matrix remain
  unverified. No source or test files were changed for this inspection.
- **WP-30 stale camera finding:** Root orthographic/isometric builders now
  supply their mode when validating zero or signed near planes; the projection
  test passed and direct source probes exercised both builders. With explicit
  fallback, requested reversed and logarithmic depth is rebuilt as standard
  depth. Native nonstandard production depth, infinite-far production support
  and the existing conflicting fallback assertions remain open. A later
  selected camera-check run remained stopped and was terminated without a
  result; a separate direct source probe confirmed signed/zero near,
  orthographic infinite-far rejection and reversed-to-standard fallback.
- **WP-30 camera rig:** `LegacySpecRig` now preserves the authored up-vector
  instead of replacing it with positive Y. Six offline source probes and a
  focused typecheck passed; no browser or GPU output was verified.
- **WP-30 view-projection consistency:** The legacy
  `agent-api/index.ts` helper now uses the same negotiated projection as the
  production renderer. A before/after offline probe demonstrated the previous
  reversed-depth mismatch and checked standard, reversed/logarithmic fallback,
  and unsupported requests. Five existing moving-camera builder checks passed
  but do not directly cover this helper. Single-file transpilation had no
  diagnostics; this is not a typecheck or browser/GPU evidence.
- **WebGPU teardown remains open:** A focused run of two cases in
  `native-webgpu-fence-failure-visibility.test.ts` had one pass and one
  failure; the failing case expects a lifecycle to complete while its fence
  is pending. Four selected cases in `native-webgpu-device-teardown.test.ts`
  had one pass and three failures involving pending-disposal expectations.
  Two different selected cases covering uncertain bundle-cache and budgeted
  texture cleanup subsequently passed; neither resolves those failures.
  A later selected particle-owned teardown retry check remained stopped and was
  terminated without a result. Existing tests were not changed, and these
  runs do not prove the broader suite.
- **WP-21 loss failure receipt:** If loss-time interop invalidation throws
  while a disposal fence is pending, the device now rejects the existing
  disposal receipt instead of leaving it pending or later resolving it on
  retry. A before/after mock-queue source probe exercised this branch;
  subsequent probes covered revoked-proxy and hostile aggregate errors
  without an unhandled rejection. Two existing confirmed-loss retry checks,
  two loss-cleanup checks and a focused device typecheck passed. Those tests
  do not directly cover the new receipt branch; native GPU behavior remains
  unverified.
- **WP-05/WP-21 GPU-sort custody:** An ambiguous queue submission failure
  now retains caller buffers and sort scratch until a successful fence or
  confirmed loss. The thrown error carries `safeToRelease`; reentrant
  disposal waits until submission returns before obtaining its fence. Mock
  probes covered submit failure, reentrant disposal and reuse, fence retry,
  confirmed loss, rejected loss notifications and hostile errors. Five
  selected existing sorter checks and a focused typecheck passed. Failed
  scratch cleanup now retains ownership, attempts the other buffer, reports
  failure and allows retry, including after confirmed loss; mock probes
  covered those branches. No real GPU execution was performed; pre-submit
  cleanup failure and broader lifecycle behavior remain unverified.
- **WP-31 mask routing recheck:** Current forward source already uses the
  live material or instance cutoff to route eligible cutouts into the mask
  bucket before transmission. An offline source probe and two selected
  existing sorting/shader checks passed. Frame-phase barriers still constrain
  cross-phase `renderOrder`, and weighted transparency remains restricted;
  no rendered-pixel acceptance is claimed.
- **WP-00/WP-01 G01 ledger:** The existing G01 row now identifies its source
  files, public entrypoint, symbols and focused check. Four existing
  index-width checks passed on the mutable tree at the 65,535/65,536/65,537
  boundaries and for explicit indices. The selected live-ledger schema check
  passed; it does not establish exhaustive coverage. The required
  candidate-bound check remains not-run, and the installed package and
  device paths are unverified.
- **WP-21 borrowed-device ownership recheck:** The current device keeps a
  lifecycle owner pending while its borrowed-device retirement fence waits.
  An offline mock probe confirmed completion after a passed fence, and
  retention after rejection until confirmed loss. Existing tests expecting
  immediate completion conflict with this source behavior; full teardown and
  hardware coverage remain open.

## Historical Snapshot: Measured Status

The following categorical counts, percentages, and classifications are from
the original 2026-11-02 snapshot, not current percent work done. The per-WP
table below uses the same historical classifications.

| Inventory | Source implemented | Partial | Unknown | Acceptance-only |
| --- | ---: | ---: | ---: | ---: |
| Roadmap section 5 tasks | 53 / 192 (27.6%) | 134 | 0 | 5 |
| Ledger outcomes | 912 / 1,864 source-related (48.9%) | 937 | 15 | 37 of 1,901 total |

The 192 tasks and 1,901 outcomes are different, overlapping units. Neither
percentage measures elapsed time or remaining engineering effort. No partial
item is counted as half complete. An outcome or task classified as
source-implemented has its source work judged present by inspection; that
does not establish that its required tests or acceptance passed. No whole
task or outcome was classified as wholly missing; partial entries can still
contain missing required functionality.

At the audited snapshot, the ledger listed all 1,901 IDs as required source
outcomes. The 1,864 denominator above reflects this audit's classification of
37 rows as acceptance-only; it does not change or waive the ledger's existing
gate inventory. That discrepancy requires reconciliation before the gate can
close.

The 70 section 6 capability checkboxes have 6 source-implemented and 64
partial classifications. The 33 section 7 program-closure checkboxes have 7
source-implemented, 25 partial, and 1 acceptance-only classifications. These
are source classifications of overlapping criteria, not passed closure
checks.

The separate handoff and Phase A documents contain 27 checkboxes: 15 partial,
8 not run, 2 missing, and 2 unknown. The Phase B acceptance document has 21:
15 not run, 3 partial, 1 missing, and 2 unknown. None is recorded as complete.
These phase checklists overlap the roadmap and must not be added to its task
denominator.

For the 1,864 source-related outcomes, verification is recorded as 1,749
with test source found, 54 with prior unbound evidence, 53 not tested, and 8
not applicable. No passing check was established against the complete
then-inspected source identity. Earlier focused tests were run on a changing or
unbound tree; the full source, package, and consumer inventory has not run.
`CODE_COMPLETE_GO` is absent and post-freeze acceptance remains locked.

## Historical Snapshot: Scope And Evidence

- The review enumerated all 33 work packages, 192 section 5 tasks, 1,901
  ledger outcomes, 103 section 6/7 checkboxes, and 48 handoff/phase
  checkboxes. The row-by-row classifications, reasons, and source citations
  are in [the audit JSON](aura3d-native-current-audit-2026-11-02.json).
  Its roadmap line numbers refer to the historical snapshot and may have
  shifted in the updated roadmap.
- The audited tree was branch `main` at HEAD
  `efcc434604f9ba0437f4832fae6082283bc4c373`, plus 2,105 changed paths,
  including 1,267 untracked files and 6 deleted paths. No user work was
  removed. All 1,314 literal roadmap CREATE/MODIFY paths existed: 627 CREATE
  paths were untracked; of 687 MODIFY paths, 626 differed from HEAD, 59 were
  unchanged, and 2 were untracked. Existence and a diff are not proof of
  behavior.
- The diagnostic SHA-256 identity for HEAD plus changed/deleted/untracked
  file identities was
  `fa956718e5e45111249ca33fa23d8cdd4130ced55679482d1d25cea411f54f3b`.
  The JSON includes the per-path manifest. This is not an admitted source
  snapshot, a frozen candidate, or an archive identity. These two audit
  report files were created afterward and are not part of that identity.
- Existing implementation workers changed 10 paths during the review.
  Affected glTF and WebGPU findings were rechecked after the workers finished;
  the post-worker and post-reconciliation fingerprints matched.
- Every entry was triaged, but some large bundled or universal claims were
  reviewed through targeted source paths and counterexamples rather than
  exhaustive execution of every variant. Those limits, and the 15 unknown
  outcome classifications, are recorded individually. Existing test code is
  not treated as a passing receipt.

## Historical Snapshot: Main Blockers

These were the original snapshot's findings, not an independently rerun
current blocker inventory. See the current corrections above where source has
changed or an earlier characterization was too broad.

- The source runner and source image refuse execution without independently
  trusted archive/source admission, isolated package-manager execution, and
  installed-tree custody. The consumer matrix also lacks an executable
  isolated producer. See `tools/remote-acr/run-source.sh:41`,
  `tools/remote-acr/Dockerfile.source:30`,
  `tools/release/workspace-pnpm-admission.mjs:17`, and
  `tools/native-consumer-matrix/index.ts:747,990`.
- Required rendering paths were identified as incomplete. The review flagged
  root-supplied `collectedLights` in meshlet/visibility admission and
  production camera lowering for nonstandard depth; its blanket
  characterization is superseded by the current corrections above. Historical
  pointers: `packages/engine/src/agent-api/compiler/renderInput.ts:836`,
  `packages/rendering/src/Renderer.ts:2283`, and
  `packages/engine/src/agent-api/compiler/cameraDepth.ts:21`.
- The earlier claim that a `ResourceLifecycle` completes before a borrowed
  device's waiting fence rejects is superseded by the current ownership
  recheck above. Historical immediate-completion assertions remain in
  `tests/unit/rendering/native-webgpu-fence-failure-visibility.test.ts:241`.
- Asset and example coverage is incomplete. The source-derived catalog has
  expectations for 9 of 20 templates and does not cover discovered documented
  examples; several GLBs need missing sidecars. The root asset manifest also
  contains conflicting identities for `skylineParkourRunnerMeshy`. See
  `tests/fixtures/native-examples-catalog/README.md:21,98` and
  `aura.assets.json:141045,141210`.
- Independence and provenance are unresolved. An attributed math entry
  remains public, and the production-path benchmark imports another 3D
  engine. See `packages/math/src/three/index.ts:12` and
  `tools/production-path-benchmark/index.ts:305`.
- At the snapshot, focused worker runs reported two WebGPU lifecycle test failures
  and a parsed-asset visibility/cache test failure; these are not a current
  rerun or a candidate-bound full-suite result. The full source inventory, build,
  package consumers, bounded defect review, frozen candidate, global gate,
  and separate acceptance remain outstanding.

## Historical Snapshot: Work Packages

Counts are source classifications in the order implemented / partial /
unknown / acceptance-only. Missing-whole-row counts are zero.

| WP | Detailed tasks | Ledger outcomes |
| --- | --- | --- |
| WP-00 | 0 / 4 / 0 / 0 | 0 / 8 / 0 / 0 |
| WP-01 | 5 / 2 / 0 / 0 | 37 / 17 / 0 / 1 |
| WP-02 | 0 / 3 / 0 / 0 | 17 / 19 / 0 / 1 |
| WP-03 | 2 / 3 / 0 / 0 | 30 / 24 / 0 / 1 |
| WP-04 | 1 / 6 / 0 / 0 | 37 / 46 / 2 / 2 |
| WP-05 | 2 / 5 / 0 / 0 | 40 / 41 / 0 / 0 |
| WP-06 | 0 / 6 / 0 / 0 | 31 / 47 / 0 / 0 |
| WP-07 | 6 / 7 / 0 / 0 | 60 / 65 / 7 / 2 |
| WP-08 | 0 / 4 / 0 / 0 | 27 / 89 / 0 / 0 |
| WP-09 | 1 / 3 / 0 / 0 | 25 / 19 / 0 / 1 |
| WP-10 | 2 / 1 / 0 / 0 | 17 / 14 / 0 / 0 |
| WP-11 | 6 / 3 / 0 / 0 | 83 / 20 / 0 / 0 |
| WP-12 | 5 / 2 / 0 / 1 | 74 / 15 / 0 / 4 |
| WP-13 | 2 / 4 / 0 / 0 | 97 / 17 / 0 / 1 |
| WP-14 | 3 / 1 / 0 / 0 | 23 / 7 / 0 / 0 |
| WP-15 | 0 / 3 / 0 / 0 | 8 / 15 / 0 / 1 |
| WP-16 | 1 / 4 / 0 / 0 | 7 / 20 / 0 / 1 |
| WP-17 | 1 / 2 / 0 / 1 | 17 / 15 / 0 / 1 |
| WP-18 | 0 / 3 / 0 / 0 | 1 / 17 / 1 / 2 |
| WP-19 | 1 / 9 / 0 / 0 | 50 / 55 / 1 / 2 |
| WP-20 | 2 / 8 / 0 / 1 | 27 / 64 / 1 / 5 |
| WP-21 | 1 / 7 / 0 / 0 | 29 / 45 / 0 / 0 |
| WP-22 | 0 / 5 / 0 / 0 | 7 / 18 / 0 / 1 |
| WP-23 | 2 / 2 / 0 / 0 | 10 / 9 / 0 / 0 |
| WP-24 | 1 / 7 / 0 / 0 | 16 / 48 / 1 / 0 |
| WP-25 | 2 / 4 / 0 / 1 | 14 / 18 / 1 / 9 |
| WP-26 | 2 / 4 / 0 / 0 | 30 / 24 / 1 / 0 |
| WP-27 | 1 / 2 / 0 / 1 | 23 / 12 / 0 / 2 |
| WP-28 | 2 / 3 / 0 / 0 | 6 / 9 / 0 / 0 |
| WP-29 | 0 / 5 / 0 / 0 | 5 / 16 / 0 / 0 |
| WP-30 | 1 / 4 / 0 / 0 | 39 / 47 / 0 / 0 |
| WP-31 | 0 / 5 / 0 / 0 | 10 / 33 / 0 / 0 |
| WP-32 | 1 / 3 / 0 / 0 | 15 / 24 / 0 / 0 |

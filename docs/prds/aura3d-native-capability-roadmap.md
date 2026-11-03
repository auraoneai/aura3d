# PRD: Aura3D native 3D capability roadmap

> **5.0 override (owner, 2026-11-02):** this roadmap remains the product specification for **Aura3D 5.0.0**, but the [5.0 decision record](aura3d-native-code-complete.md#50-decision-record-owner-2026-11-02--supersedes-conflicting-text-below) governs execution: the 4.x ACR path replaces the custody runner, and [`aura3d-5.0-scope.md`](aura3d-5.0-scope.md) is the fixed denominator (each partial task labeled FINISH-5.0 / EXPERIMENTAL-5.0 / SUPERSEDED-PROCESS).

**Status:** implementation roadmap, not a statement that the work is complete.

**Current source review, 2026-11-02:** The latest provisional assessment found
784 of 1,014 identified source-side subrequirements present (77.3%), with 183
partial, 43 missing and 4 unknown. Completed pieces of partially implemented
tasks are included in the 784; no arbitrary fraction is assigned to the 183
partial items. This is an inspection-based, equal-count estimate, not a
candidate-bound verification or a measure of engineering effort. See the
[current task status](#current-task-status) and
[source audit](aura3d-native-current-audit-2026-11-02.md).

**Baseline:** Aura3D 4.7.1, repository commit efcc434604f9ba0437f4832fae6082283bc4c373, inspected 2026-10-31.

**Refresh:** rechecked 2026-10-31 (America/Los_Angeles). The published engine version and remote default-branch source still match this baseline. This revision adds concrete rendering, temporal-history, resource, input, deployment and execution requirements found by the second source audit. Released capabilities and development-only fixes were reviewed separately; development changes inform regression cases, not claims of shipped support. No implementation or dependency installation was performed for this refresh.

**Execution handoff:** [Aura3D native capability execution prompt](aura3d-native-capability-execution-prompt.md). That prompt executes this document's current work packages and acceptance rules; it is not evidence that they have been completed.

**Separate execution phases:** [Phase A — code-complete](aura3d-native-code-complete.md) owns implementation, source tests, builds and packed source consumers. [Phase B — acceptance](aura3d-native-acceptance.md) owns actual browser, visual, rendered-performance, device and live verification. Phase B is locked until every required production outcome across this entire roadmap passes Phase A and the global CODE_COMPLETE_GO candidate is recorded. Completing one work package does not open acceptance.

**Goal:** deliver a broad, production-capable 3D library through Aura3D's own renderer, APIs, packages, asset pipeline, and tooling.

## 1. Executive summary and decisions

Build the capabilities below as native Aura3D functionality. First correct observable defects in the existing public paths; then complete native GPU rendering, shader graphs, materials, assets, interaction, animation, spatial audio, XR, authoring tools, and format coverage. Make specialized functionality opt-in so ordinary scenes retain a small, typed root API.

**Implementation independence is a hard requirement.** Do not install, wrap, import, embed, copy, or ship another 3D engine, its implementation, shaders, or assets. Write Aura3D-owned implementations from published standards and independently authored requirements. Existing open-format codecs or optional physics libraries may remain subject to their own licenses and repository policy; they are not substitutes for an Aura3D rendering engine. Tests and fixtures must be independently authored or drawn from appropriately licensed open-standard conformance suites.

This is a comprehensive **program**, not a single release. P0 protects correctness; P1 completes foundational workflows; P2 adds broad production capabilities; P3 covers specialized formats and authoring. All work packages remain in scope. Priority orders delivery, not whether a feature is ultimately required.

Decisions:

1. Preserve the existing declarative scene API, typed and provenance-checked model assets, public package boundaries, lifecycle rules, and WebGL2 behavior. Add advanced functionality behind explicit, tree-shakeable Aura3D entrypoints rather than making every app load it.
2. Make the native GPU backend a supported root-app choice only after rendering, compute, lifecycle, and fallback work is complete; do not treat adapter detection as proof of rendering. Preserve WebGL2 as a supported backend.
3. Replace the old product exclusions for import/export formats, optional effects, modifiers, worker rendering, spatial UI renderers, and runtime compute with explicit, documented opt-in contracts. Keep asset admission and licensing checks intact.
4. Preserve existing features when extending them: Aura3D already provides core scene nodes, basic math, many geometry primitives, lights, physical materials, shadows, textures, post effects, model loading, animation, controls, spatial audio, an editor, and experimental GPU/XR pieces. A matching name or a package-internal class alone is not proof of complete root-app behavior.
5. Implement capabilities, not name-for-name replicas of another product. Format semantics follow the relevant open specifications; public names follow Aura3D conventions. Do not expose nonfunctional shims as completed features.
6. Distinguish **confirmed defect**, **partial**, **not found**, and **unverified**. Unverified means the source audit did not establish equivalence; it must be tested before being declared missing or done. A parsed format extension is not full rendered support.
7. A single integration owner changes shared public barrels, package manifests, generated maps, documentation indexes, and shared test infrastructure. Feature lanes submit concrete export requests; they do not edit each other's files in parallel.
8. Runtime schemas and TypeScript interfaces are required below; this is a client SDK change. No new product database tables, migrations, server routes or product-service writes are required. Authorized remote verification may retain test artifacts.
9. Every required capability needs a usable implementation. A diagnostic is appropriate for a specified unsupported variant, unavailable device feature or invalid input; rejecting the entire required feature does not satisfy this roadmap. Preserve existing working paths and choose independently designed behavior instead of matching another product's names.
10. Freeze functional source implementations and source tests before browser/device acceptance. The native GPU path must be callable through an explicit experimental opt-in at that freeze; a support label may remain experimental until retained rendered evidence justifies promotion. If acceptance exposes a product defect, repair it, rerun affected source checks and freeze a new candidate revision.
11. Treat implementation and acceptance as separate execution queues. Author all required browser specs, fixtures, harnesses and evidence tooling during Phase A and typecheck/source-test them there; execute them only in Phase B. Do not launch browser/visual, rendered benchmark, physical-device, runtime-network-capture or live receipt work early. Ordinary source tests, numerical/mock-device tests, offline asset parsing and source-only installed consumers remain mandatory during implementation.

## 2. Current codebase and gap register

The root app is created by packages/engine/src/agent-api/app/createAuraApp.ts. Compilation passes through packages/engine/src/agent-api/compiler/renderer.ts to the rendering package. WebGL2 is the supported production backend; packages/rendering/src/production-runtime/backends/WebGPURendererBackend.ts is not a complete production path. The current GPU architecture is described by docs/rendering/webgpu-current-architecture.md.

The following register states what the checked-out source establishes. “Partial” also covers cases where a public feature exists but its complete behavior has not been demonstrated.

| ID | Priority | Current state and evidence | Work needed |
| --- | --- | --- | --- |
| G01 | P0 | Confirmed: packages/engine/src/agent-api/RootGeometry.ts synthesizes 16-bit indices on the non-indexed dynamic path even above 65,536 vertices; explicit numeric indices already select their width. | Select index width safely and test the boundary. |
| G02 | P0 | Confirmed: RootGeometry.ts transforms normals with the upper 3×3 rather than the inverse transpose; its geometry merge can drop indices and attributes; deindexing leaves morph attributes unexpanded. | Correct transforms; preserve topology, groups, attributes and morphs or reject incompatible inputs explicitly. |
| G03 | P0 | Confirmed: packages/engine/src/agent-api/app/runtimeNodes.ts documents stale bounds after position-attribute updates. | Recompute/invalidate culling bounds and verify visibly moving geometry. |
| G04 | P0 | Confirmed: packages/assets/src/FileLoader.ts accepts credential/header settings but packages/assets/src/LoaderFetch.ts does not forward them. packages/assets/src/GLTFLoader.ts deduplicates in-flight loads by URL, sharing cancellation. | Propagate request settings to every dependency; partition caches by request context and provide independent subscriber cancellation. |
| G05 | P0 | Confirmed: packages/audio/src/AudioSource.ts computes pause position using wall time without playback rate; packages/audio/src/SceneAudioBridge.ts updates position without world orientation. | Correct playback accounting and scene-derived listener/emitter orientation. |
| G06 | P0 | Confirmed: packages/input/src/WebXRSessionController.ts consumes synthetic hand, viewer-pose, and hit-test shapes that do not match native browser objects. | Sample native joint poses, viewer transforms and hit-result poses; manage hit-test source lifecycle. |
| G07 | P1 | Partial: packages/engine/src/agent-api/SceneQueries.ts uses bounds queries; recursive traversal omits parent transforms and default-origin nodes. packages/controls/src/Picking.ts uses approximate spheres. | Add accurate mesh/instance/deformed-geometry hits with world transforms, UVs, face data, side rules and deterministic ordering. |
| G08 | P1 | Partial: a native GPU device exists but the default production app is WebGL2. Root compute requires a separately bound device. | Supported native GPU scene rendering, compute interop, backend diagnostics, fallback, recovery and disposal. |
| G09 | P1 | Partial: packages/engine/src/agent-api/nodes/material.ts exposes node materials, but the existing graph supports a restricted GLSL-only set and limited material outputs. | Typed, extensible material/compute graph, GLSL and WGSL generation, texture/storage/viewport access, lit output channels and actionable errors. |
| G10 | P1 | Partial: packages/rendering/src/materials/MaterialExtensions.ts marks several physical lobes as bounded. The current physical specification has an iridescence thickness range. | Complete energy-conserving layered materials, a controllable retroreflection lobe, rough diffuse, min/max thickness controls and existing extension fidelity. |
| G11 | P1 | Partial: packages/rendering/src/LightingRig.ts explicitly lacks IES profiles; spot options omit profiles/projected imagery. | Photometric and projected lights, clustered point/spot lighting, probes and cascaded sun shadows with correct fallback. |
| G12 | P1 | Partial: texture.ts already exposes 2D, cube, array, canvas, video, depth and compressed textures; RenderDevice.ts already has cube, depth-only and multiple-attachment target descriptors. | Add 3D/storage and compressed-cube paths where missing; complete independent mip updates, readback, multisample/resolve, format validation and resource ownership. |
| G13 | P1 | Partial: effects.post.ts already exposes bloom, AO, SSR, depth of field, anti-aliasing and other effects. Some temporal effects have object/history limitations. | Complete depth/normal/motion inputs and temporal handling; add missing effect families and composable ordering, resize and disposal. |
| G14 | P1 | Partial: GLTFLoader.ts and GLTFExtensionSupport.ts implement many extensions, some with documented limits. Two material extension names, KHR_materials_diffuse_roughness and EXT_materials_bump, were not found in the inspected source. | Implement those extensions and finish each bounded extension end to end, including animated material properties, variants and visible rendering. |
| G15 | P1 | Partial: packages/animation/src/Keyframe.ts supports step, linear and glTF cubic spline; packages/animation/src/AnimationTrack.ts constrains vector tracks to width 3. | Add distinct smooth and Bézier modes, arbitrary supported vector widths, serialization, action timing and rendered deformation coverage. |
| G16 | P1 | Partial: an XR WebGL runtime and injected-session tests exist. | Complete native browser XR input and AR source lifecycles, multiview rendering, optional GPU composition, hand/controller models, light estimation and depth/plane support. Physical-device behavior requires its own evidence. |
| G17 | P1 | Partial: all common camera-control families exist; packages/controls/src/DragControls.ts is a delta-only shim and Arcball has documented gesture limitations. | Implement actual pointer-driven dragging, touch gestures, drag planes, hit testing and lifecycle. |
| G18 | P2 | Partial: scene graph, primitive shapes, instancing, batching and cameras exist. A general transform pivot was not found; array/stereo views reject postprocessing. | Add pivot semantics and per-view postprocessing/culling; finish batching, dynamic bounds and object lifetimes. |
| G19 | P2 | Partial: packages/assets/src/EXRLoader.ts supports several compression schemes but rejects PXR24, B44/B44A, DWAA/DWAB and deep data; OBJLoader.ts has bounded material/primitive support. | Expand supported image and mesh variants with fixtures, strict limits and clear errors. |
| G20 | P2 | Not found in the inspected source: native Gaussian-splat asset ingestion and rendering. | Add typed splat assets, PLY/SPLAT/KSPLAT/SPZ and glTF ingestion, ordering, spherical harmonics and GPU rendering. |
| G21 | P2 | Partial: the asset pipeline has glTF/GLB and bounded OBJ support; documented exclusions omit many other format families and runtime interchange exporters. | Deliver the format and export catalog in section 4, with independently tested loading, preservation and explicit loss reporting. |
| G22 | P2 | Partial: curves, shapes, convex geometry, merge, tangents and offline optimization exist; broader rational surfaces, loft/parametric geometry and runtime geometry utilities need coverage. | Build the additions in WP-13 and retain correct attributes, groups and topology. |
| G23 | P2 | Partial: common scene helpers, sky, water, terrain, scattering, labels and an editor exist. | Add advanced inspection helpers, spatial DOM/vector output, missing specialized scene objects, procedural generators, editing tools and a live material graph. |
| G24 | P2 | Partial: lower-level rendering accepts OffscreenCanvas; the root app target is DOM-oriented. | Add worker-owned rendering with a typed message protocol, input/resize bridging, safe transfer and teardown. |
| G25 | P2 | Partial: package exports, examples and installed-package checks exist. Root package is ESM oriented; current performance script references undefined component commands. | Add a tested CommonJS consumer path where supported, repair performance command wiring, expand installed-consumer and browser coverage, and publish accurate docs. |
| G26 | P2 | Unverified: supporting modules across math, rendering, interaction, media, resource lifetime, and authoring may contain narrower option/behavior gaps beyond this source sample. | Complete the capability ledger in WP-00; enumerate every public capability and option, map it to an existing implementation or a named work package, and close every row with executable evidence. |
| G27 | P0 | Confirmed: some current runtime geometry, shader, image-decoding and lookup-data files explicitly identify their contents as external-engine ports or copies; a lighting lookup points to an external engine's hosted source. The workspace also declares an external-engine development dependency. | Replace the identified runtime code/data independently, remove that hosted source and dependency from required installs, convert dependent tests to independent fixtures, and inventory all remaining cases before declaring independence. WP-04, WP-06, WP-08, WP-13, WP-19 and WP-20 own the changes below. |
| G28 | P0 | Confirmed: app readiness can resolve after a non-strict renderer-mount failure; error formatting can itself fail for unusual details. | Add typed success/failure/cancellation readiness and bounded, redacted error formatting without breaking existing callers. WP-21. |
| G29 | P0 | Confirmed: app asset events broadcast globally and disposed handlers remain registered; shader/color modes and other runtime flags are process-global. | Give each app/device its own policies, events, diagnostics and resources; unsubscribe and isolate concurrent apps. WP-21. |
| G30 | P0 | Confirmed by source-level probes: asset-manager dependencies resolve against a global base, repeated dependency retains can leak, and cyclic in-flight loads can wait on themselves. | Resolve relative to the parent, validate cycles before awaiting, balance ownership and isolate request context. WP-07. |
| G31 | P1 | Confirmed: the built-in world-text atlas is limited to 39 characters; it does not load fonts or shape Unicode. | Add licensed font assets, shaping, fallback, atlas lifecycle and accessible text. WP-26. |
| G32 | P1 | Confirmed: custom model materials can be validated without being applied; some model LOD/collider options are ignored; wide/dashed lines have explicit limitations. | Implement the required model/line behavior; reject only explicitly unsupported variants and test rendered results. WP-26. |
| G33 | P1 | Partial: the existing React adapter is experimental; its ready callback precedes async readiness and its shared resource cache omits loader/security identity. | Complete real browser/SSR lifecycles, true readiness, safe resource ownership, retry and supported peer coverage. WP-23. |
| G34 | P1 | Partial: browser automation currently uses one browser family and experimental GPU flags; real device coverage is not established. | Build a versioned support matrix with default-flags desktop projects and separately labeled experimental, software and physical-device results. WP-22. |
| G35 | P1 | Unverified: inspected model paths check hash metadata, but byte verification across downloaded documents and dependencies was not established; some corpus checks classify files without rendering them. | Verify content digests, preserve diagnostics, and test actual independently licensed format fixtures through public rendering. WP-07 and WP-28. |
| G36 | P1 | Confirmed: texture-budget accounting can lower reported bytes without reducing the returned texture; decoder failures and worker cancellation have lifecycle limits. | Make resident data and counters agree, scope budgets per device, bound jobs and allow retries after transient failures. WP-07 and WP-25. |
| G37 | P1 | Confirmed: option-coverage generation contains generic scaffold probes; existing compiled-input comparisons do not prove visible behavior. | Add valid per-option A/B probes, runtime or pixel checks, and explicit unsupported diagnostics. WP-19 and WP-20. |
| G38 | P1 | Confirmed: the proposed optional package conflicts with fixed but inconsistent release package counts; some API and consumer checks cover bounded or modified fixtures. | Use a versioned package inventory, packed API/type compatibility and untouched consumer tests. WP-19 and WP-24. |
| G39 | P1 | Partial: the checked-in bundle report records budget failures, while performance and browser evidence are workload- and environment-specific. | Pass existing budgets without raising them, add measured workload ratchets and real device timing where available. WP-25. |
| G40 | P2 | Partial: root advanced physics claims are bounded, and the root game entrypoint is a headless stub while a separate full game entrypoint exists. | Complete or explicitly reject root behaviors, prove collider/joint/vehicle/game lifecycle and retain optional backend boundaries. WP-27. |
| G41 | P0 | Confirmed by a source-level probe: packages/rendering/src/resources/RenderTargetPool.ts accepts duplicate release; its idle count can exceed ownership and two acquisitions can return the same target. | Enforce exclusive leases, idempotent release, device generations and accurate ownership. WP-21. |
| G42 | P0 | Confirmed by a source-level probe: packages/rendering/src/program/ProgramCache.ts can resolve pending compilation after disposal and leave the resulting GPU program undisposed. | Handle successful late completion, cancellation, loss/retry and truthful warmup settlement without resurrecting resources. WP-21. |
| G43 | P0/P1 | Confirmed: packages/rendering/src/forward/Velocity.ts keeps camera/model history and coverage globally and advances model history on each prepare call. Existing TAA resolves at render resolution before spatial upsampling; v2Stages.ts binds a blank reactive mask. | Isolate app/view/frame histories, advance once per frame, retain prior depth and define actual temporal reconstruction/reactive masking. WP-06. |
| G44 | P1 | Partial: ApplicationKits.ts explicitly reports clipping/section views unsupported; the previous coverage list named clipping without an implementation path. | Implement global/local clipping planes, intersection/union semantics, shadow participation and material/graph integration. WP-30. |
| G45 | P1 | Unverified: math/projection helpers exist, but end-to-end reversed/logarithmic depth was not established in root renderer, shadow and post paths. | Implement explicit depth conventions across projections, comparisons, clears, reconstruction, shadows and readback, with capability-aware negotiation. WP-30. |
| G46 | P1 | Confirmed: Material.ts and DrawCommand describe richer state than the native GPU draw path consumes, including depth comparisons, stencil, color-write masks, culling and polygon offset. | Carry every supported state field into pipeline creation and cache identity; reject invalid combinations before submission. WP-31 with WP-03/WP-05 integration. |
| G47 | P2 | Not found in the inspected forward path: order-independent transparency; the current path sorts transparent objects. | Add independently designed weighted transparency with depth/alpha semantics, per-view resources and an explicit sorted fallback. WP-31. |
| G48 | P1 | Confirmed: resources/UniformBlock.ts accepts integer/bool declarations but stages values through Float32Array; arrays and structures are unsupported. | Implement byte-correct scalar/vector/matrix/array/structure layouts for each shader language and binding class. WP-05. |
| G49 | P1 | Partial: color contracts are limited to linear/sRGB and the shared converter clamps even same-space linear values. Existing HDR intermediates, video polling and texture subregion updates are present; wide-gamut output and broader layered/mip update behavior are incomplete or unverified. | Add HDR-preserving conversion and negotiated output color spaces; preserve existing dynamic textures and extend only verified gaps in their declared resource contract. WP-32. |
| G50 | P2 | Not found in the inspected runtime geometry surface: UV-atlas generation. The previous checklist named unwrapping without concrete files or tasks. | Add bounded charting, seams, packing, gutters, texel density and vertex remapping; connect generated UVs to light baking. WP-13. |
| G51 | P0 | Confirmed: public audio/scene/renderable loaders bypass parts of the request contract; ImageBitmapLoader ignores accepted credential/flip settings; loadRenderableAsset can substitute a canonical fixture for an unknown input. | Apply policy and integrity across public loaders, prevent audio-cache resurrection and require the requested content or an explicit failure. WP-07. |
| G52 | P0/P1 | Confirmed: action marker traversal cannot represent every multi-loop crossing, root and core reverse-time policy differ, and AnimationObjectGroup leaves stale binding/object indices on removal. | Complete bounded deterministic playback/event traversal, group cache ownership and root integration while preserving existing warp/crossfade behavior. WP-11. |
| G53 | P0/P1 | Confirmed: pointer state mixes contacts, cancellation can look like release, tap duration uses frame count, and XR startup can finish after disposal or a competing enter call. | Use stable pointer IDs, coordinate/time contracts, cancellation semantics and generation-owned session startup. WP-12. |
| G54 | P1 | Confirmed: the decoder Vite plugin honors a custom development prefix but hardcodes the production directory; the texture decoder worker only uses blob URLs. | Align dev/build/static deployment URLs, emit a same-origin worker and support strict content policies with explicit codec requirements. WP-07/WP-19/WP-22. |
| G55 | P1 | Confirmed: listed source checks omit full asset/contract and release tests; clean-install mixes browser work into a tree-shaking prerequisite; remote images omit required fixtures/templates; API diff uses old fixed baselines. | Add a source-only serverless runner, complete suites, generated-map ownership, phase-specific consumer reports and a verified current API baseline. WP-19/WP-20/WP-24/WP-25. |

The register is an actionable, source-grounded starting point, not a claim that every option in the library has already been exhaustively verified. Treat the specified capability ledger as a required production deliverable, not as a reason to omit the concrete work packages below.

## 3. Public contracts and product behavior

Existing signatures remain valid. Additive interfaces below describe the required semantics; use the repository's established naming conventions when integrating. Runtime validation must reject unsupported combinations with a stable error code and the offending field.

### 3.1 Backend selection and diagnostics

~~~ts
type AuraBackend = "webgl2" | "webgpu" | "auto";
interface AuraBackendOptions {
  backend?: AuraBackend;              // existing default remains webgl2
  allowFallback?: boolean;           // explicit when backend is webgpu
  requiredFeatures?: readonly string[];
}
interface AuraBackendDiagnostics {
  requested: AuraBackend;
  active: "webgl2" | "webgpu";
  fallbackReason?: string;
  missingFeatures: readonly string[];
  deviceLost: boolean;
}
~~~

Initialization must either return an actually usable backend, fall back only when allowed, or fail with a specific reason. A root app must be able to render the same authored scene on each supported backend without changing asset provenance or material inputs. Compute and rendering share a device with explicit resource ownership and synchronization.

### 3.2 Exact scene queries

~~~ts
interface AuraSceneRayOptions {
  mode?: "bounds" | "mesh";
  near?: number;
  far?: number;
  layers?: number;
  recursive?: boolean;
  firstHitOnly?: boolean;
}
interface AuraSurfaceHit {
  nodeName?: string;
  distance: number;
  point: readonly [number, number, number];
  normal: readonly [number, number, number];
  uv?: readonly [number, number];
  faceIndex?: number;
  instanceId?: number;
  batchMemberId?: string | number;
  barycentric?: readonly [number, number, number];
}
~~~

Keep the existing bounds behavior available for callers that depend on it. Mesh mode accounts for world transforms, geometry topology, material side, skinning, morphs and instancing. Near/far, layer masks, stable nearest-first ordering, missing geometry, degenerate triangles and disposed nodes have defined behavior.

### 3.3 Asset requests and exports

~~~ts
interface AuraAssetRequestOptions {
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  headers?: Readonly<Record<string, string>>;
  cache?: RequestCache;
  priority?: "high" | "low" | "auto";
  onProgress?: (loaded: number, total?: number) => void;
}
interface AuraExportResult {
  data: Blob | Uint8Array;
  mimeType: string;
  warnings: readonly { code: string; path?: string; message: string }[];
  dependencies: readonly { name: string; data: Blob | Uint8Array }[];
}
~~~

Apply one request policy to the primary file and its external resources without leaking headers or credentials across origins. Explicitly partition caches by normalized request context, never persist secrets in cache keys or diagnostics, and do not allow one subscriber's abort to cancel other active subscribers. Exports must state unsupported or lossy features in warnings, preserve license/provenance metadata when the format permits, and never silently discard unsupported content.

### 3.4 Node materials, geometry, audio and XR

- Node graphs have typed values, explicit inputs/outputs, compile diagnostics, stable serialization and per-backend feature negotiation. A graph must support material color, normal, roughness, metalness, emissive, alpha and vertex position; additional render, compute and storage operations are owned by WP-05.
- Dynamic geometry accepts 16- or 32-bit indices as needed and declares component type, normalization, stride, offset, update range, topology, groups and morph attributes. Mutating positions invalidates bounds. Normal transforms use an inverse-transpose matrix.
- Audio source adapters distinguish decoded buffers, media elements, streams and external audio nodes. Playback rate, detune, loop region, scheduled start, pause/resume, ownership and disposal are explicit.
- XR input consumes native browser reference spaces, input sources, joints, poses, hit results and session events. Unsupported capabilities are reported separately from permission denial and session termination. Native WebGPU XR is conditional on browser capability and must not break WebGL XR.

### 3.5 Readiness, isolation and support contracts

~~~ts
type AuraReadyOutcome =
  | { state: "ready"; stage: "renderer" | "first-frame"; backend: "webgl2" | "webgpu" }
  | { state: "failed"; code: string; message: string }
  | { state: "cancelled" | "disposed" };

interface AuraReadinessOptions {
  stage?: "renderer" | "first-frame";
  signal?: AbortSignal;
}
~~~

Add an app-owned readiness operation returning this discriminated outcome; a failure or cancellation must never be reported as a rendered success. Preserve the present settled-only behavior for existing callers through a documented migration period, and provide a strict operation that resolves only after the selected stage. Error messages and diagnostics must be bounded and redact credentials, signed URLs and private headers.

Asset requests, progress events, shader/color policy, render flags, diagnostics, resource ownership and disposal are scoped to the app or device. An app must not observe another app's events or alter its render state. Cleanup runs all owned disposers even if one fails; repeat disposal is safe.

### 3.6 Maturity and support declarations

For each public capability, track the exact package/subpath, backend, version, asset format, browser/OS/device class, known limitations and evidence level in the WP-00 ledger. A capability can be **source-tested**, **browser-tested on software**, **browser-tested on hardware**, **device-tested**, **unsupported**, or **unverified**; do not promote one level into another. Desktop browser-family coverage, mobile browsers, native GPU and physical spatial devices are separate cells. A missing physical device receipt is an explicit acceptance limitation, not a fabricated pass or a blocker to freezing completed source work.

Every supported option must produce its documented observable behavior or a stable actionable error. Compile-only success, a counter change, parsing metadata, an opaque canvas, or a mock device alone does not establish a visual or hardware claim.

### 3.7 Frame, depth, clipping and draw-state contracts

~~~ts
type AuraDepthMode = "standard" | "reversed" | "logarithmic";
interface AuraDepthOptions {
  mode?: AuraDepthMode;
  allowFallback?: boolean;
}
interface AuraClipOptions {
  planes: readonly (readonly [number, number, number, number])[];
  space?: "world" | "local";
  combine?: "intersection" | "union";
  clipShadows?: boolean;
}
interface AuraFrameIdentity {
  appId: string;
  deviceGeneration: number;
  viewId: string;
  frameId: number;
}
~~~

These are additive proposed contracts, not existing exported types. A clipping plane retains the nonnegative signed-distance half-space; normalize coefficients safely, define local-to-world transformation and reject zero/invalid normals. Combination mode describes the retained half-spaces. Global and material-local groups have documented composition, including custom shaders, instances and shadows.

Depth mode is a pipeline convention, not a single projection flag. Projection, clear value, depth comparison, bias, linearization, sampling, copying and readback must agree across forward/deferred, shadows, picking and postprocessing. Report the active mode and any explicit fallback. Reversed and logarithmic modes are mutually exclusive; unsupported devices receive a precise failure or an allowed standard-depth fallback.

Temporal state belongs to the full frame identity. Multiple passes with one frame ID share the same previous transforms and depth; commit history once when the frame finishes. Resets, camera cuts, scene swaps, disjoint views, device loss and resource retirement cannot mutate another app's history. Keep separate current/previous depth ownership, dimensions and attachment identity. Motion-blur weights sum to one, sample offsets are centered, and one sample or zero motion preserves the input.

Draw-state support includes depth/stencil comparisons and operations, independent color writes, blend factors/equations, blend constant, culling/winding, polygon offset and multisample/alpha coverage where supported. Cache keys include every pipeline-affecting field and attachment format. An unsupported optional state fails before drawing, rather than silently using default state. Order-independent transparency is an explicit approximation with sorted fallback, not an exact solution for refractive multilayer transmission.

### 3.8 Color, dynamic textures and shader data

Keep the default linear working space and sRGB output stable. Add declared sRGB/linear-sRGB and Display-P3/linear-Display-P3 conversions with independently derived matrices and transfer functions. Preserve finite HDR and negative linear values in internal conversion; clamp only at a declared bounded output or explicit policy. Colorless data maps never receive color transfer functions. Wide-gamut canvas output and extended-range display are distinct capabilities; floating-point intermediate targets alone prove neither.

Dynamic image/video/frame textures define source ownership, dimensions, color metadata, orientation, alpha mode, update cadence, partial ranges/layers/mips and cancellation. Update retained storage when capacity/layout permits; release replaced storage and stop callbacks on final disposal. Reject invalid compressed-block alignment and external-frame lifetime errors before upload. Separate frame availability from successful rendered output.

Shader-buffer layouts use typed byte storage, explicit signed/unsigned/bool representation, array/structure alignment, matrix stride and padding for each target language and uniform/storage address space. A Float32Array view is not an integer encoder. Tests compare exact byte patterns, offsets and uploaded/read-back values, including mixed fields and non-square matrices.

### 3.9 Input, animation, asset and deployment behavior

Pointer snapshots retain stable contact IDs, timestamp-based gestures and explicit client, canvas-CSS and framebuffer coordinates. Cancellation, lost capture and focus loss are separate from activation; releasing one contact cannot release the others. XR enter/exit/dispose uses a generation-owned state machine; every await rechecks ownership and closes superseded sessions/resources without emitting a false start.

Animation event traversal defines signed time, repeat and reflected playheads, boundary inclusion and deterministic marker ordering. One large update matches equivalent smaller updates until a documented bounded event limit; overflow is explicit, not an unbounded loop or silently missing markers. Optimize/serialize operations preserve authored interpolation. Binding subscriptions and object caches remove every stale index.

All public model, scene, image and audio loaders use the same effective request/integrity/cancellation contract. Success identifies the requested bytes and adapter; unknown formats cannot return unrelated built-in content. Canonical fixtures require an explicit fixture request. A cleared/disposed audio or asset cache cannot be repopulated by an older completion.

Decoder asset URLs, worker entrypoints and emitted output paths share a validated deployment-base contract. Test root and nested prefixes in dev, build and static preview. Provide an emitted same-origin worker for a policy permitting only same-origin workers; blob fallback is explicit. Document actual WebAssembly policy requirements per codec, without requiring unrestricted evaluation or silently weakening an application's content policy.

### 3.10 Verification identities and phases

Source/packed-consumer results and browser/device results are separate reports. Use schema `aura3d.native-consumers/1` with phase, run ID, source revision, staged-source SHA-256, lockfile SHA-256, tool versions, package names/versions/tarball digests, retained consumer manifest/lock digests and per-check command/status/exit code/log path. Source reports leave browser cells `not-run`. Browser reports reference and validate the source report and immutable candidate identity; never overwrite the source outcome.

The source runner accepts allowlisted argv steps, stages the exact planned files including untracked implementation files, builds candidate output freshly and fails on missing checks or undiscovered required tests. Installed tree-shaking consumes a passing current source-consumer report, not stale browser evidence. API compatibility compares integrity-verified prior Aura3D declarations with the candidate; do not install or execute a historical runtime merely to inspect its types.

A staged job need not contain Git metadata. Source identity must support a verified staging manifest: recompute listed file hashes, reject missing/changed/undeclared required inputs and retain the originating commit/tree as provenance. Do not invent a local commit. When tested implementation bytes are subsequently committed as CODE_COMPLETE_GO, record an explicit binding from their unchanged input digest and candidate archive hashes to the new commit. Keep administrative ledger/acceptance updates outside the immutable implementation input set under a reviewed rule; a code change always creates a new candidate.

### 3.11 Global phase gate

Implement one bounded file-based gate in WP-20, with no new product service or recursive attestation workflow. The generated record at tests/reports/native-capabilities/code-complete-go.json identifies the freeze commit, implementation/lockfile/candidate archive digests, versioned required-outcome inventory, and passing source reports. It is produced only after all required production outcomes and expected source checks are complete, with zero unresolved required code. Require exact set equality between required and completed outcome IDs, and between expected and passing check IDs; matching counts are insufficient. A missing record, hand-written marker, partial work-package completion, skipped required source check or mismatched candidate cannot authorize acceptance.

All roadmap acceptance entrypoints validate the gate before provisioning a browser/device/live job and again against the staged candidate. Implementing and unit-testing this guard belongs to Phase A; invoking a real acceptance job belongs to Phase B. No gate record is created by writing these planning documents. Missing browser/hardware/publication receipts cannot block the source gate because they are Phase B outputs. Actual required implementation defects always prevent or invalidate the affected candidate's source completion.

## 4. File-by-file breakdown

Every path below is relative to the repository root. CREATE means a new file; MODIFY means extend the existing file. No deletion is required. The owning WP is the only lane that writes the path. When another lane needs an export or shared type, it supplies the exact request to WP-19. Existing test files stay in their owning lane; new test files are named explicitly.

### WP-00 — Capability ledger

| Action | File | Required change |
| --- | --- | --- |
| CREATE | docs/prds/aura3d-native-capability-ledger.json | Record each capability, implementation ownership, status, public API, tests, limitations and evidence. WP-00 owns this file for the entire program; WP-18 supplies documentation updates through WP-00. |

### WP-01 — Geometry correctness and scene queries

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/rendering/native-morph-texture.test.ts | Verify real packed morph data for all position, normal and tangent combinations and multiple vertices and target layers. Exclusive execution owner: repair_morph_layout. Source verification: tests/unit/rendering/native-morph-texture.test.ts. |
| MODIFY | packages/rendering/src/resources/MorphTargetTexture.ts | Correct independent morph texture packing when tangent deltas are present without normal deltas, preserving shader indexing and texture bounds. Exclusive execution owner: repair_morph_layout. Source verification: tests/unit/rendering/native-morph-texture.test.ts. |
| MODIFY | tests/qr/prd01/unit/compiler-scene-graph.test.ts | Use independently derived transform and scene-graph expectations without external engine dependencies. Exclusive execution owner: repair_scene_test_independence. Source verification: tests/qr/prd01/unit/compiler-scene-graph.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/sceneGraph.ts | Preserve authored batch identity while flattening nested transforms so render and query paths share state. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/agent-api/scene-query-mesh.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/batched.ts | Carry material clipping through batched geometry while preserving member identity and queries. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/agent-api/native-batched-clipping.test.ts. |
| CREATE | tests/unit/agent-api/native-batched-loop.test.ts | Verify stable per-member packed loop identity, ranges, transforms, callbacks and fallback. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/agent-api/native-batched-loop.test.ts. |
| CREATE | tests/unit/engine/native-query-render-items.test.ts | Regress runtime query handoff for actual submitted model and primitive render items. Exclusive execution owner: repair_mesh_query_handoff. Source verification: direct source test for this file. |
| MODIFY | tests/unit/agent-api/compiler-item-reuse.test.ts | Regress changed transforms, ranges and other render-item state while retaining safe reuse. Exclusive execution owner: repair_item_reuse. Source verification: direct source test for this file. |
| MODIFY | packages/engine/src/agent-api/compiler/compileScene.ts | Carry live scene clipping into safe batched compilation while preserving scene, residency and geometry/query behavior. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/agent-api/native-batched-clipping.test.ts. |
| MODIFY | packages/engine/src/agent-api/RootGeometry.ts | Fix index width, inverse-transpose normals, deindexing of morphs, group/attribute preservation, and explicit errors for incompatible merges. |
| MODIFY | packages/engine/src/agent-api/nodes/geometry.ts | Expose typed attribute layout, normalized/interleaved data, update ranges and safe geometry operations. |
| MODIFY | packages/engine/src/agent-api/SceneQueries.ts | Compose transforms, include default-origin nodes, preserve bounds mode and implement mesh-mode query/hit semantics. |
| MODIFY | packages/engine/src/agent-api/app/runtimeNodes.ts | Notify app-owned redraw and clipping subscription changes on material replacement while preserving runtime-node behavior. Exclusive execution owner: repair_splat_runtime. Source verification: tests/unit/agent-api/native-material-clipping-invalidation.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/primitives.ts | Consume bounds invalidation and updated attribute layouts on the render path. |
| MODIFY | tests/unit/parity/geometry-dynamic.test.ts | Add index, transform, merge, morph, attribute and bounds regressions. |
| MODIFY | tests/unit/parity/geometry-custom-attributes.test.ts | Test integer normalization, interleaving, offsets and update ranges. |
| CREATE | tests/unit/agent-api/scene-query-mesh.test.ts | Test exact triangles, hierarchy, instances, morphs, skinning and filtering. |
| CREATE | tests/browser/native-geometry-query.spec.ts | Verify GPU-visible mutation, culling and pointer hits in an installed root app. |
| MODIFY | tests/unit/engine/scene-queries.test.ts | Preserve default-origin, disposed batch and typed attribute geometry query correctness. Exclusive execution owner: wp01_geometry. Source verification: tests/unit/engine/scene-queries.test.ts; tests/unit/agent-api/scene-query-mesh.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/batchedState.ts | Preserve default-origin, disposed batch and typed attribute geometry query correctness. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/engine/scene-queries.test.ts; tests/unit/agent-api/scene-query-mesh.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/mergeStatic.ts | Preserve default-origin, disposed batch and typed attribute geometry query correctness. Exclusive execution owner: wp01_geometry. Source verification: tests/unit/engine/scene-queries.test.ts; tests/unit/agent-api/scene-query-mesh.test.ts. |

### WP-02 — Scene transforms and multi-view

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | packages/scene/src/TransformNode.ts | Add pivot-aware local/world transform composition and reparent behavior. |
| MODIFY | packages/scene/src/SceneSerializer.ts | Round-trip pivots and preserve backwards-compatible default transforms. |
| MODIFY | packages/engine/src/contracts/sceneGraph.ts | Define additive pivot and transform update contracts. |
| MODIFY | packages/engine/src/agent-api/nodes/cameras.ts | Define independent viewport/scissor, camera and post settings for array/stereo views. |
| MODIFY | packages/rendering/src/Renderer.ts | Run independent view culling, targets and postprocessing; restore state between views; integrate depth/clipping, transparency, color output and frame-identity contracts from their owners. Preserve real precompile behavior and isolate per-camera query state. |
| MODIFY | tests/unit/parity/viewport-views.test.ts | Assert view isolation, resize, clipping, camera and post behavior using independent fixtures. |
| MODIFY | tests/unit/contracts/impl/prd01-scene-graph.test.ts | Replace external reference imports with independently authored transform and hierarchy expectations. |
| CREATE | tests/unit/scene/pivot-transform.test.ts | Test pivot/TRS, hierarchy, reparenting, animation and serialization. |
| CREATE | tests/browser/native-multiview.spec.ts | Verify distinct view pixels, viewport boundaries and post effects remotely. |
| MODIFY | packages/scene/src/SceneNode.ts | Pivot-aware atomic preserve-world reparent, transforms and hierarchy updates. Exclusive execution owner: wp02_scene. Source verification: tests/unit/scene/pivot-transform.test.ts. |
| MODIFY | packages/rendering/src/renderer/CullingBatching.ts | Apply per-view depth-aware frustum and independent culling. Exclusive execution owner: wp02_scene. Source verification: tests/unit/rendering/native-camera-depth.test.ts. |
| CREATE | tests/unit/rendering/native-batch-loop-renderer.test.ts | Verify packed loop logical member ordering, per-view culling, callbacks and safe fallbacks. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-batch-loop-renderer.test.ts. |
| MODIFY | tests/unit/parity/flagoff-batched.test.ts | Register the batched handler explicitly in isolated flag-off regressions; preserve every existing behavior assertion. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/parity/flagoff-batched.test.ts. |
| MODIFY | tests/unit/parity/batched-textures.test.ts | Initialize the instanced factory explicitly in isolated batch texture regressions; preserve every existing behavior assertion. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/parity/batched-textures.test.ts. |

### WP-03 — Production GPU backend

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/rendering/native-webgpu-scene-depth-copy.test.ts | Verify native depth copy target, backend bindings, failure behavior and cleanup without executing a browser. Exclusive execution owner: repair_scene_depth_copy. Source verification: tests/unit/rendering/native-webgpu-scene-depth-copy.test.ts. |
| MODIFY | packages/rendering/src/renderer/SceneDepthCopyPass.ts | Provide a validated native depth snapshot pass with portable backend shader and correct resource restoration. Exclusive execution owner: repair_scene_depth_copy. Source verification: tests/unit/rendering/native-webgpu-scene-depth-copy.test.ts. |
| CREATE | packages/rendering/src/renderer/NativeDeferredAdmission.ts | Provide side-effect-free deferred feature and material admission with trusted built-in identities and explicit unsupported fallback. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-drawing-root-selection.test.ts. |
| CREATE | packages/rendering/src/shaders/Prd02IblFeature.ts | Expose the side-effect-free built-in environment shader feature identity for replacement-safe deferred selection. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-drawing-root-selection.test.ts. |
| MODIFY | packages/rendering/src/lanes/prd02.ts | Expose a stable built-in environment feature identity for safe deferred admission while preserving feature replacement behavior. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-drawing-root-selection.test.ts. |
| CREATE | tests/unit/rendering/native-deferred-surface.test.ts | Verify frame-scoped native deferred color, resolve and depth leases for supported sample counts, device generations and fenced resource lifetime. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-deferred-surface.test.ts. |
| CREATE | tests/unit/rendering/deferred-probe-contract.test.ts | Check deferred probe coefficients, intensity, rotation, resource lifetimes and independent lighting expectations. Exclusive execution owner: repair_deferred_probe. Source verification: tests/unit/rendering/deferred-probe-contract.test.ts. |
| CREATE | packages/rendering/src/webgpu/DeferredProbe.ts | Provide a borrowed-resource deferred probe contract and matching spherical-harmonic image-based lighting source. Exclusive execution owner: repair_deferred_probe. Source verification: tests/unit/rendering/deferred-probe-contract.test.ts. |
| CREATE | tests/unit/rendering/native-drawing-output-integration.test.ts | Verify native drawing output, resource ownership, sorting and explicit fallback. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-drawing-output-integration.test.ts. |
| CREATE | tests/unit/rendering/native-drawing-root-selection.test.ts | Verify typed root drawing-mode selection under actual default feature flags. Exclusive execution owner: repair_deferred_pipeline. Source verification: tests/unit/rendering/native-drawing-root-selection.test.ts. |
| CREATE | tests/unit/rendering/deferred-pipeline-adapter-contract.test.ts | Verify deferred material and instance metadata, overrides and lifecycle. Exclusive execution owner: repair_deferred_pipeline. Source verification: tests/unit/rendering/deferred-pipeline-adapter-contract.test.ts. |
| CREATE | tests/unit/rendering/native-compute-interop.test.ts | Regress device, queue and texture ownership across root compute and rendering paths. Exclusive execution owner: repair_compute_texture. Source verification: direct source test for this file. |
| MODIFY | packages/rendering/src/production-runtime/backends/WebGPURendererBackend.ts | Implement real scene submission, depth, shadows, materials, resources, resize and disposal. |
| MODIFY | packages/rendering/src/WebGPUDevice.ts | Implement capability negotiation, queue/resource ownership, loss/recovery, full draw-state mapping, multiple vertex streams, integer formats, explicit depth convention, shader-buffer layout and color/texture contracts. Consume the WP-31 state mapper rather than silently reducing state to a blend boolean. |
| CREATE | tests/unit/rendering/native-generated-unlit.test.ts | Verify native unlit program selection, packet layouts, supported variants and explicit unsupported inputs. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-generated-unlit.test.ts. |
| CREATE | packages/rendering/src/webgpu/GeneratedUnlitProgram.ts | Generate native unlit shaders with explicit primitive, clipping, texture and resource contracts. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-generated-unlit.test.ts. |
| CREATE | packages/rendering/src/webgpu/NativePointShader.ts | Provide shared native point quad expansion, clipping and coverage shader primitives for forward and depth programs. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-point-program.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-point-program.test.ts | Verify the native point quad program, coverage, bindings and rejected unsupported device inputs. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-point-program.test.ts. |
| CREATE | tests/unit/rendering/native-point-quads.test.ts | Verify point quad geometry, indexed ranges, source updates, ownership, eviction and disposal. Exclusive execution owner: repair_native_point_geometry. Source verification: tests/unit/rendering/native-point-quads.test.ts. |
| CREATE | packages/rendering/src/webgpu/NativePointQuads.ts | Expand native point primitives to lifecycle-owned quad geometry with preserved order, attributes and revisions. Exclusive execution owner: repair_native_point_geometry. Source verification: tests/unit/rendering/native-point-quads.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/renderer.ts | Preserve residency and advanced-light scheduling while invalidating static scenes on generated-program readiness. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-light-probes.test.ts and tests/unit/rendering/native-replay-vfx.test.ts. |
| MODIFY | packages/engine/src/agent-api/app/rendererOptions.ts | Replace unconditional rejection with a functional explicit experimental opt-in once source contracts pass; promote supported/default-selection policy only after applicable rendered acceptance. |
| MODIFY | packages/engine/src/agent-api/nodes/compute.ts | Bind root-app compute to the selected native device and synchronize shared resources. |
| CREATE | packages/rendering/src/webgpu/ResourceInterop.ts | Define compute/render resource barriers, binding lifetimes and cleanup. |
| CREATE | packages/rendering/src/webgpu/DeferredPipeline.ts | Implement a supported deferred drawing path with capability negotiation and fallback. |
| CREATE | packages/rendering/src/webgpu/MeshletPipeline.ts | Implement meshlet construction, bounded GPU submission and culling. |
| CREATE | packages/rendering/src/webgpu/VisibilityBufferPipeline.ts | Implement visibility-buffer drawing and material resolve with appropriate resource limits. |
| CREATE | tests/unit/rendering/native-drawing-pipelines.test.ts | Test resource contracts, fallbacks, culling, materials and pipeline lifecycle. |
| CREATE | tests/browser/native-drawing-pipelines.spec.ts | Render the same authored scene through supported drawing paths and verify output and backend diagnostics. |
| CREATE | tests/unit/rendering/native-backend-selection.test.ts | Test selection, fallback, feature errors, loss/recovery and resource lifetime. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-backend-selection.test.ts. |
| CREATE | tests/browser/native-gpu-render-compute.spec.ts | Prove adapter, active backend, dispatch, rendered result and pixels; report adapter identity. |
| MODIFY | packages/rendering/src/RenderBackend.ts | Forward native GPU requirements and release devices on initialization failure. Exclusive execution owner: wp03_gpu. Source verification: tests/unit/rendering/native-backend-selection.test.ts. |
| MODIFY | packages/rendering/src/renderer/RendererFactory.ts | Forward native GPU requirements and release devices on initialization failure. Exclusive execution owner: wp03_gpu. Source verification: tests/unit/rendering/native-backend-selection.test.ts. |

### WP-04 — Physical materials and lighting

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts | Verify scoped behavior, isolation and preserved runtime contracts. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| MODIFY | packages/engine/src/agent-api/vfx/bridge.ts | Stage app-owned atmosphere/wetness state through the rendering bridge with explicit lifetime. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| MODIFY | packages/engine/src/production-runtime/effects/ProductionEffectSystem.ts | Stage app-owned atmosphere/wetness state through the rendering bridge with explicit lifetime. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| MODIFY | packages/engine/src/production-runtime/effects/LiveAtmosphere.ts | Stage app-owned atmosphere/wetness state through the rendering bridge with explicit lifetime. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| CREATE | tests/unit/rendering/native-vfx-frame-integration.test.ts | Verify scoped behavior, isolation and preserved runtime contracts. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-integration.test.ts. |
| MODIFY | packages/rendering/src/vfx/prd07FeaturePars.ts | Stage scoped fog/wetness producer and feature consumption without ambient cross-app state. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-integration.test.ts. |
| MODIFY | packages/rendering/src/atmosphere/shaders/wetness.glsl.ts | Stage scoped fog/wetness producer and feature consumption without ambient cross-app state. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-integration.test.ts. |
| MODIFY | packages/rendering/src/atmosphere/fogUniformStore.ts | Stage scoped fog/wetness producer and feature consumption without ambient cross-app state. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-integration.test.ts. |
| MODIFY | packages/rendering/src/vfx/contributors.ts | Stage scoped fog/wetness producer and feature consumption without ambient cross-app state. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-integration.test.ts. |
| CREATE | packages/rendering/src/shadows/contactPassTrust.ts | Establish exact contact-pass identity without eagerly loading optional contributor side effects. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| CREATE | tests/unit/rendering/native-physical-cases.test.ts | Verify case coverage, valid boundaries, independent reference evaluation and a meaningful perturbation control. Exclusive execution owner: repair_native_numeric_cases. Source verification: tests/unit/rendering/native-physical-cases.test.ts. |
| CREATE | tests/qr/prd04/browser/native-physical-numeric.spec.ts | Author deferred browser checks for all mapped categories and a perturbation control; Phase B execution remains locked. Exclusive execution owner: repair_native_numeric_harness. Source verification: tests/unit/rendering/native-physical-numeric-harness.test.ts. |
| CREATE | tests/qr/prd04/browser/native-physical-numeric.html | Provide the native numerical harness page without external assets or another engine. Exclusive execution owner: repair_native_numeric_harness. Source verification: tests/unit/rendering/native-physical-numeric-harness.test.ts. |
| CREATE | tests/qr/prd04/browser/native-physical-numeric.ts | Author source for native physical shader measurement against independent references; do not execute before Phase B. Exclusive execution owner: repair_native_numeric_harness. Source verification: tests/unit/rendering/native-physical-numeric-harness.test.ts. |
| CREATE | tests/unit/rendering/native-physical-numeric-harness.test.ts | Verify independent numerical case mapping, finite comparator behavior, table axes and an effective perturbation control. Exclusive execution owner: repair_native_numeric_harness. Source verification: tests/unit/rendering/native-physical-numeric-harness.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-physical-numeric-harness.ts | Map all independent physical cases to explicit shader models, channels and tolerances or record an honest unmapped reason. Exclusive execution owner: repair_native_numeric_harness. Source verification: tests/unit/rendering/native-physical-numeric-harness.test.ts. |
| MODIFY | packages/engine/src/production-runtime/world/WaterRuntime.ts | Use the provider-neutral color helper without changing world water runtime behavior or loading optional physics. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-physics-entry-graph.test.ts. |
| MODIFY | packages/engine/src/lanes/prd12.ts | Preserve lane registrations while removing eager optional-physics loading from the collected-lights import. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-physics-entry-graph.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-physical-cases.ts | Define independent, nonempty numerical cases for the required native physical-lighting categories. Exclusive execution owner: repair_native_numeric_cases. Source verification: tests/unit/rendering/native-physical-cases.test.ts. |
| CREATE | tests/unit/rendering/native-numeric-environment-clean.test.ts | Verify clean-room environment reference numerical limits, quadrature and explicit approximation contracts. Exclusive execution owner: repair_numeric_environment_clean. Source verification: tests/unit/rendering/native-numeric-environment-clean.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-reference-environment-clean.ts | Independently derive the environment and multiscattering reference from equations without source implementation exposure. Exclusive execution owner: repair_numeric_environment_clean. Source verification: tests/unit/rendering/native-numeric-environment-clean.test.ts. |
| MODIFY | packages/rendering/src/program/chunks/lights_legacy.glsl.ts | Match clustered light lookup to fixed-size CPU light bins, including partial viewport-edge tiles. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-vfx-frame-state.test.ts | Verify snapshot isolation, captured values, untrusted resources, revocation and async frame lifetime. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-state.test.ts. |
| CREATE | packages/rendering/src/vfx/Prd07FrameState.ts | Stage device, owner, view and frame-scoped fog and wetness snapshots with explicit resource and mutation rules. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-state.test.ts. |
| CREATE | tests/unit/rendering/native-vfx-renderer-frame.test.ts | Verify app-bound renderer snapshots across sync/async warmup, views, concurrent apps, mutation, device loss and disposal. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-vfx-renderer-frame.test.ts. |
| CREATE | packages/rendering/src/vfx/Prd07FrameAdapter.ts | Authenticate mounted app atmosphere producers and manage generation-scoped frame snapshots and leases without ambient state. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-vfx-frame-state.test.ts. |
| CREATE | tests/unit/rendering/native-prd07-frame-adapter.test.ts | Verify renderer-bound atmosphere owner identity, device-generation leases, reentrancy, revocation and stale frames. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-prd07-frame-adapter.test.ts. |
| CREATE | tests/unit/rendering/native-program-readiness-root.test.ts | Verify generated-program readiness invalidates static root scenes and preserves residency scheduling and disposal. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-program-readiness-root.test.ts. |
| CREATE | tests/unit/rendering/native-numeric-optics.test.ts | Verify spectral film, index-of-refraction, volume transmission and coating reference behavior against independent analytic invariants and edge cases. Exclusive execution owner: repair_numeric_optics. Source verification: tests/unit/rendering/native-numeric-optics.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-reference-optics.ts | Implement independently derived spectral film, index-of-refraction, volume transmission and coating reference behavior with documented assumptions. Exclusive execution owner: repair_numeric_optics. Source verification: tests/unit/rendering/native-numeric-optics.test.ts. |
| CREATE | tests/unit/rendering/native-numeric-anisotropy.test.ts | Verify anisotropic distribution, visibility and lobe initialization reference behavior against independent analytic invariants and edge cases. Exclusive execution owner: repair_numeric_anisotropy. Source verification: tests/unit/rendering/native-numeric-anisotropy.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-reference-anisotropy.ts | Implement independently derived anisotropic distribution, visibility and lobe initialization reference behavior with documented assumptions. Exclusive execution owner: repair_numeric_anisotropy. Source verification: tests/unit/rendering/native-numeric-anisotropy.test.ts. |
| CREATE | tests/unit/rendering/native-numeric-sheen.test.ts | Verify sheen distribution, visibility, direct and integrated-light reference behavior against independent analytic invariants and edge cases. Exclusive execution owner: repair_numeric_sheen. Source verification: tests/unit/rendering/native-numeric-sheen.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-reference-sheen.ts | Implement independently derived sheen distribution, visibility, direct and integrated-light reference behavior with documented assumptions. Exclusive execution owner: repair_numeric_sheen. Source verification: tests/unit/rendering/native-numeric-sheen.test.ts. |
| MODIFY | tests/qr/prd07/unit/fog-forward-absorption.test.ts | Verify the legacy fog generator branch with explicit core-off and fog-on preconditions under current default flags. Exclusive execution owner: repair_vfx_replay. Source verification: tests/qr/prd07/unit/fog-forward-absorption.test.ts. |
| CREATE | tests/unit/rendering/native-legacy-contact-index.test.ts | Verify every legacy physical receiver applies contact visibility only to the exact selected directional light. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-legacy-contact-index.test.ts. |
| CREATE | tests/unit/rendering/native-independent-sheen.test.ts | Verify independently derived sheen contracts and physical edge invariants. Exclusive execution owner: independent_shader_sheen. Source verification: tests/unit/rendering/native-independent-sheen.test.ts. |
| CREATE | packages/rendering/src/shaders/independent-wgsl/Sheen.ts | Implement an independently authored sheen shader candidate from physical equations and the neutral interface contract. Exclusive execution owner: independent_shader_sheen. Source verification: tests/unit/rendering/native-independent-sheen.test.ts. |
| CREATE | tests/unit/rendering/native-independent-clearcoat.test.ts | Verify independently derived clearcoat contracts and physical edge invariants. Exclusive execution owner: independent_shader_clearcoat. Source verification: tests/unit/rendering/native-independent-clearcoat.test.ts. |
| CREATE | packages/rendering/src/shaders/independent-wgsl/Clearcoat.ts | Implement an independently authored clearcoat shader candidate from physical equations and the neutral interface contract. Exclusive execution owner: independent_shader_clearcoat. Source verification: tests/unit/rendering/native-independent-clearcoat.test.ts. |
| CREATE | tests/unit/rendering/native-independent-lobes.test.ts | Verify independently derived lobe primitives and physical edge invariants. Exclusive execution owner: independent_shader_lobes. Source verification: tests/unit/rendering/native-independent-lobes.test.ts. |
| CREATE | packages/rendering/src/shaders/independent-wgsl/Lobes.ts | Implement independently authored shared lobe shader primitives from documented equations and the neutral interface contract. Exclusive execution owner: independent_shader_lobes. Source verification: tests/unit/rendering/native-independent-lobes.test.ts. |
| CREATE | tests/unit/rendering/native-independent-anisotropy.test.ts | Verify independently derived anisotropic shader contracts and physical edge invariants. Exclusive execution owner: independent_shader_anisotropy_author. Source verification: tests/unit/rendering/native-independent-anisotropy.test.ts. |
| CREATE | packages/rendering/src/shaders/independent-wgsl/Anisotropy.ts | Implement an independently authored anisotropic microfacet shader candidate from physical equations and the neutral interface contract. Exclusive execution owner: independent_shader_anisotropy_author. Source verification: tests/unit/rendering/native-independent-anisotropy.test.ts. |
| CREATE | packages/rendering/src/vfx/replayFeatureIdentity.ts | Expose side-effect-free original built-in feature identity for fail-closed replay preflight without trusting mutable names. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-replay-vfx.test.ts. |
| CREATE | tests/unit/rendering/native-material-lobe-replay.test.ts | Verify replay preflight handles lobe metadata and descriptors without invoking untrusted callbacks. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-material-lobe-replay.test.ts. |
| MODIFY | packages/rendering/src/contracts/materialLobes.ts | Preserve metadata-safe replay preflight while defining the diffuse-transmission lobe contract. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts and tests/unit/rendering/native-material-lobe-replay.test.ts. |
| MODIFY | packages/rendering/src/shaders/chunks/contact_shadow_mask.glsl.ts | Honor every positive contact-shadow strength consistently across shader backends. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-replay-vfx.test.ts | Verify replay safety for trusted identities, stateful flags, mutable providers and cross-app state. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-replay-vfx.test.ts. |
| MODIFY | packages/rendering/src/lanes/prd07.ts | Expose verifiable built-in fog and wetness feature identities without trusting replaceable names. Exclusive execution owner: repair_vfx_replay. Source verification: tests/unit/rendering/native-replay-vfx.test.ts. |
| MODIFY | packages/rendering/src/program/chunks/shadow_forward.glsl.ts | Implement selected point and spot shadow receiver variants with explicit sampler and ownership semantics. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-contact-shadow-webgpu.test.ts | Verify native checked contact-shadow mask submission, frame isolation and teardown using device-shaped source tests. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| MODIFY | tests/unit/rendering/runtime-parity-contact-shadow-pass.test.ts | Preserve existing contact-shadow pass source behavior across backend-aware capture. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| MODIFY | tests/unit/rendering/contact-shadow-mask.test.ts | Preserve existing mask behavior while verifying frame ownership and stale-resource rejection. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| MODIFY | packages/rendering/src/passes/Prd02ContactShadowsContributor.ts | Propagate frame-owned contact-shadow mask production and cleanup through the render graph. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| MODIFY | packages/rendering/src/forward/contactShadowMaskStore.ts | Scope contact-shadow masks to the owning device, view and producing frame. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| MODIFY | packages/rendering/src/passes/ContactShadowPass.ts | Implement checked, backend-compatible contact-shadow mask generation with correct resource lifecycle. Exclusive execution owner: repair_contact_shadow. Source verification: tests/unit/rendering/native-contact-shadow-webgpu.test.ts. |
| CREATE | packages/rendering/src/renderer/TrustedShaderLibrary.ts | Track trusted built-in shader-library identity without caller-forgeable flags or eager library loading. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-transmission-capture.test.ts. |
| CREATE | packages/rendering/src/renderer/TrustedShaderVariants.ts | Record immutable built-in shader variant provenance and reject mutated or unverified cached variants. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-forward-clipping.test.ts. |
| MODIFY | tests/unit/gu47/eint/local-shadow-tiles.test.ts | Distinguish zero local shadows from local-only shadow sampling in generated shader source contracts. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/gu47/eint/local-shadow-tiles.test.ts. |
| MODIFY | packages/rendering/src/shaders/chunks/instance_color_target.glsl.ts | Expose the trusted built-in instance-color feature identity for safe repeat-draw admission. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | packages/rendering/src/probes/ProbeSourceOwner.ts | Preserve weak probe-source ownership across per-view render-source clones without global or spoofable state. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/agent-api/native-advanced-lighting-consumer.test.ts. |
| CREATE | tests/unit/agent-api/advanced-lighting-frame-invalidation.test.ts | Verify coalesced app invalidation, async frame ordering, pause and disposal for attached lighting resources. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/agent-api/advanced-lighting-frame-invalidation.test.ts. |
| CREATE | tests/unit/agent-api/native-advanced-lighting-consumer.test.ts | Verify renderer-consumer attachment identity, resource lifecycle, UV and composition validation across apps and views. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/agent-api/native-advanced-lighting-consumer.test.ts. |
| CREATE | packages/engine/src/agent-api/compiler/advancedLightingBridge.ts | Construct app, device and frame-scoped per-item lighting packets from validated borrowed attachments. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/agent-api/native-advanced-lighting-consumer.test.ts. |
| MODIFY | tests/qr/prd04/unit/material-diagnostics.test.ts | Verify per-app and per-view transmission diagnostics clear after absent, failed or disposed frames. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/material-diagnostics.test.ts. |
| MODIFY | packages/engine/src/production-runtime/actor/materialDiagnostics.ts | Read copied transmission diagnostics from the owning renderer and frame without leaking another app or view. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/material-diagnostics.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-transmission-capture.test.ts | Verify native transmission copy submission, mip generation, resource ownership and lifecycle with a strict device-shaped test. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-transmission-capture.test.ts. |
| CREATE | tests/unit/rendering/native-advanced-light-bindings.test.ts | Verify advanced-light binding identity, texture/UV validation, composition policy and resource lifetime with independent source tests. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-advanced-light-bindings.test.ts. |
| CREATE | packages/rendering/src/lighting/AdvancedLightingBindings.ts | Carry app, device, frame and material-specific native indirect-lighting resources to validated draw consumers. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-advanced-light-bindings.test.ts. |
| CREATE | tests/unit/rendering/webgl-transmission-mips.test.ts | Verify native render-target mip allocation, generation and texture-state restoration with a strict mock device. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/webgl-transmission-mips.test.ts. |
| MODIFY | packages/rendering/src/program/FeatureSelect.ts | Pass the owning draw and frame context into physical material feature selection without changing unrelated program behavior. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-transmission-capture.test.ts | Verify scoped transmission capture, diffuse-only handling, failures, frame identity and cleanup. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-transmission-capture.test.ts. |
| MODIFY | tests/qr/prd04/unit/transmission-contributor.test.ts | Verify capture requires a real source and successful copy before publishing frame-owned data. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/transmission-contributor.test.ts. |
| MODIFY | tests/qr/prd04/unit/transmission-target.test.ts | Verify real transmission mip allocation and lifecycle instead of inferred mip counts. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/transmission-target.test.ts. |
| CREATE | packages/rendering/src/shaders/physical/transmission_copy.wgsl.ts | Implement an independent native scene-color capture shader with matching coordinates and color semantics. Exclusive execution owner: repair_transmission_capture. Source verification: tests/unit/rendering/native-transmission-capture.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical/transmission_copy.glsl.ts | Preserve linear color in the bounded scene-color capture copy path. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/transmission-contributor.test.ts. |
| MODIFY | packages/rendering/src/forward/transmissionTargetStore.ts | Scope captured transmission to renderer/view/frame/device and distinguish refractive capture from diffuse-only materials. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-transmission-capture.test.ts. |
| MODIFY | packages/rendering/src/TransmissionRenderTarget.ts | Allocate and track real transmission target mip levels and device lifecycle. Exclusive execution owner: repair_transmission_capture. Source verification: tests/qr/prd04/unit/transmission-target.test.ts. |
| MODIFY | packages/rendering/src/forward/Transmission.ts | Capture the submitted scene color with frame and view ownership and publish only after verified copy and mip generation. Exclusive execution owner: repair_transmission_capture. Source verification: tests/unit/rendering/native-transmission-capture.test.ts. |
| CREATE | tests/unit/rendering/native-lightmap-provenance.test.ts | Verify baked lightmap composition provenance, immutable source identity and rejection of unsupported double-counting policies. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/rendering/native-lightmap-provenance.test.ts. |
| CREATE | tests/unit/rendering/native-advanced-light-shaders.test.ts | Verify probe, voxel and lightmap shader contracts against independent numerical expectations and offline compilation. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-lightmap.wgsl.ts | Implement an independent WGSL baked-lightmap composition shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-lightmap.glsl.ts | Implement an independent GLSL baked-lightmap composition shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-voxel.wgsl.ts | Implement an independent WGSL bounded voxel indirect-lighting shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-voxel.glsl.ts | Implement an independent GLSL bounded voxel indirect-lighting shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-probe.wgsl.ts | Implement an independent WGSL SH9 probe-grid shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | packages/rendering/src/shaders/advanced-lighting/native-probe.glsl.ts | Implement an independent GLSL SH9 probe-grid shader helper with explicit bindings and bounds. Exclusive execution owner: repair_advanced_light_shaders. Source verification: tests/unit/rendering/native-advanced-light-shaders.test.ts. |
| CREATE | tests/unit/agent-api/native-advanced-lighting-attachments.test.ts | Verify independent app attachment isolation, replacement, change notifications, invalid inputs and caller-owned resource cleanup. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/agent-api/native-advanced-lighting-attachments.test.ts. |
| CREATE | packages/engine/src/agent-api/app/advancedLightingState.ts | Track app-owned attachments to borrowed indirect lighting and baked lightmaps with invalidation, safe detach and disposal semantics. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/agent-api/native-advanced-lighting-attachments.test.ts. |
| CREATE | tests/unit/rendering/native-advanced-light-resource-events.test.ts | Verify committed revision notifications, reentrancy, listener isolation, unsubscribe and disposal for lighting resources. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/rendering/native-advanced-light-resource-events.test.ts. |
| CREATE | packages/rendering/src/lighting/NativeLightingResourceEvents.ts | Provide ordered isolated change and disposal notifications for caller-owned lighting resources. Exclusive execution owner: repair_advanced_light_integration. Source verification: tests/unit/rendering/native-advanced-light-resource-events.test.ts. |
| MODIFY | packages/rendering/src/shaders/deform/skinning.glsl.ts | Generate typed joint inputs and safe conversions for float, unsigned and signed vertex streams while retaining existing palette and weight semantics. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| MODIFY | packages/rendering/src/program/chunks/instancing.glsl.ts | Select collision-free instancing attribute locations for extended skinning while preserving other layouts. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| MODIFY | tests/unit/rendering/parity-deviations-q1.test.ts | Verify native behavior using independently derived numerical and geometry expectations. Exclusive execution owner: repair_math_test_independence. Source verification: tests/unit/rendering/parity-deviations-q1.test.ts. |
| CREATE | tests/qr/prd04/unit/native-physical-shader-contract.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_shader_test_independence. Source verification: tests/qr/prd04/unit/native-physical-shader-contract.test.ts. |
| MODIFY | packages/rendering/src/forward/Lighting.ts | Bind both comparison and raw local shadow atlas views according to shader requirements. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| MODIFY | tests/unit/rendering/pbr-lighting.test.ts | Verify physical material iridescence follows the declared valid value range. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/pbr-lighting.test.ts. |
| MODIFY | packages/rendering/src/materials/features.ts | Keep physical map transform rotation and UV descriptor semantics aligned with live texture bindings. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| MODIFY | packages/rendering/src/materials/lobes.ts | Preserve replay-safe lobe identities and integrate diffuse-transmission texture slots, UV sets and transforms. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts and tests/unit/rendering/native-material-lobe-replay.test.ts. |
| MODIFY | packages/rendering/src/shaders/chunks/lighting_ibl.glsl.ts | Blend local reflection probes with global illumination using authored capture origins and bounds. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-generated-pbr.test.ts | Verify native generated physical shader variants, resource packing and numerical source contracts. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-generated-pbr.test.ts. |
| CREATE | packages/rendering/src/webgpu/GeneratedPbrProgram.ts | Generate native feature-aware physical WGSL with explicit resource, packing and validation contracts. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-generated-pbr.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-packed-loop.test.ts | Verify native packed-loop physical color, alpha and unsupported variant behavior. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-packed-loop.test.ts. |
| CREATE | packages/rendering/src/webgpu/PackedLoopPhysical.wgsl.ts | Provide native per-member packed-loop physical color and alpha shader contributions. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-packed-loop.test.ts. |
| MODIFY | packages/rendering/src/contracts/environment.ts | Represent supported reflection probe face sizes accurately in the shared environment contract. Exclusive execution owner: repair_probe_bridge. Source verification: tests/unit/contracts/impl/prd02-probes-ltc.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/probes.ts | Expose bounded irradiance volume capture scheduling and validate authored probe limits without changing existing builder semantics. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/contracts/impl/prd02-probes-ltc.test.ts. |
| MODIFY | tests/unit/contracts/impl/prd02-probe-box.test.ts | Test off-center reflection capture positions, box projection and shader bindings against source contracts. Exclusive execution owner: repair_probe_bridge. Source verification: tests/unit/contracts/impl/prd02-probe-box.test.ts. |
| MODIFY | packages/rendering/src/probes/ProbeBoxProjection.ts | Respect distinct reflection capture positions and authored box centers in projection and shader bindings. Exclusive execution owner: repair_probe_bridge. Source verification: tests/unit/contracts/impl/prd02-probe-box.test.ts. |
| MODIFY | packages/rendering/src/InstancedPBRMaterial.ts | Preserve physical scalar and detail-map bindings and select live material shader variants. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-bindings.test.ts and native-pbr-detail-shaders.test.ts. |
| MODIFY | packages/rendering/src/SkinnedLitMaterial.ts | Preserve physical scalar and detail-map bindings and select live material shader variants. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-bindings.test.ts and native-pbr-detail-shaders.test.ts. |
| MODIFY | packages/rendering/src/TexturedPBRMaterial.ts | Preserve physical scalar and detail-map bindings and select live material shader variants. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-bindings.test.ts and native-pbr-detail-shaders.test.ts. |
| MODIFY | packages/rendering/src/PBRMaterial.ts | Preserve physical scalar and detail-map bindings and select live material shader variants. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-pbr-detail-bindings.test.ts and native-pbr-detail-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-pbr-detail-shaders.test.ts | Regress actual physical roughness and bump shader feature generation. Exclusive execution owner: repair_pbr_shader. Source verification: direct source test for this file. |
| CREATE | tests/unit/rendering/native-pbr-detail-bindings.test.ts | Regress physical material detail map and linear texture bindings. Exclusive execution owner: repair_pbr_bindings. Source verification: direct source test for this file. |
| MODIFY | packages/rendering/src/ShaderChunks.ts | Apply material roughness and retroreflection to physical diffuse without corrupting specular or area-light behavior. Exclusive execution owner: repair_pbr_shader. Source verification: physical shader source tests. |
| MODIFY | packages/rendering/src/probes/ReflectionProbeSystem.ts | Support async GPU probe capture and awaited cleanup alongside the existing synchronous device path. Exclusive execution owner: repair_probe_bridge. Source verification: probe capture source tests. |
| MODIFY | packages/rendering/src/materials/PhysicalMaterial.ts | Carry physical material detail channels through renderer feature contracts. Exclusive execution owner: repair_pbr_shader. Source verification: physical shader and material source tests. |
| MODIFY | packages/rendering/src/materials/PhysicalFeatures.ts | Project physical scalar and detail-map inputs into real shader feature variants. Exclusive execution owner: repair_pbr_shader. Source verification: physical shader and material source tests. |
| MODIFY | packages/engine/src/lanes/prd02.ts | Route probe rebake requests to the owning runtime; retarget eager barrel edges to neutral leaves while retaining all lane registrations. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-v5-entry.test.ts, tests/unit/physics/native-physics-entry-graph.test.ts and probe runtime source tests. |
| MODIFY | packages/rendering/src/probes/Prd02ProbesContributor.ts | Connect authored probe bounds and update lifecycle to real renderer capture and published resources. Exclusive execution owner: repair_probe_bridge. Source verification: tests/unit/contracts/impl/prd02-probes-ltc.test.ts. |
| MODIFY | tests/qr/prd04/unit/wgsl-twins.test.ts | Verify independently authored physical shader chunks expose required functions and preserve source-level lobe contracts. Exclusive execution owner: repair_wgsl_iridescence. Source verification: direct source test for this file. |
| CREATE | tests/unit/rendering/ltc-lut-cache.test.ts | Regress reentrant LUT loading, shared pending work and retry after synchronous or asynchronous failure. Exclusive execution owner: repair_ltc_compile. Source verification: direct source test for this file. |
| MODIFY | packages/engine/src/material-physical/PhysicalMaterialSpec.ts | Add rough diffuse, retroreflection and explicit iridescence min/max with compatibility for the existing range. |
| MODIFY | packages/rendering/src/materials/MaterialExtensions.ts | Complete supported combinations and report backend-specific limits truthfully. |
| MODIFY | packages/rendering/src/program/chunks/brdf.glsl.ts | Replace the attributed external port with an independently authored, tested energy-conserving diffuse and layered BRDF implementation. |
| MODIFY | packages/rendering/src/program/DFGLutData.ts | Replace copied lookup data with independently generated, reproducible data and documented numerical provenance. |
| MODIFY | packages/rendering/src/probes/LtcLuts.ts | Remove the hosted external source and generate or package independently authored lookup data with numerical validation. |
| MODIFY | packages/rendering/src/probes/IrradianceVolume.ts | Pack all probe-grid layers into a valid array-texture mip and preserve correct sampling for single-cell axes. Exclusive execution owner: repair_ltc_compile. Source verification: tests/unit/contracts/impl/prd02-probes-ltc.test.ts. |
| MODIFY | tests/unit/contracts/impl/prd02-probes-ltc.test.ts | Regress array-layer packing and finite irradiance sampling for single-cell grids. Exclusive execution owner: repair_ltc_compile. Source verification: direct source test for this file. |
| MODIFY | packages/rendering/src/environment/EnvironmentCache.ts | Keep the embedded neutral environment self-contained; load other admitted presets or return an actionable error. |
| MODIFY | tests/unit/environment-embedded/neutral-embedded.test.ts | Test embedded neutral and explicit optional preset loading/failure. |
| MODIFY | packages/rendering/src/environment/RoomEnvironmentScene.ts | Independently replace attributed scene construction and light values with an Aura-owned environment. |
| MODIFY | packages/rendering/src/shaders/chunks/lighting_mirrors.ts | Review source provenance and independently replace attributed implementation where necessary. |
| MODIFY | packages/rendering/src/shaders/chunks/lighting_punctual.glsl.ts | Review source provenance and independently replace attributed implementation where necessary. |
| MODIFY | packages/rendering/src/WebGPUExtensionAtlas.ts | Audit and independently replace any adapted shader implementation while retaining public material behavior. |
| MODIFY | packages/rendering/src/atmosphere/PreethamSky.ts | Replace the attributed external port with an implementation derived from the published sky model. |
| MODIFY | packages/rendering/src/shaders/physical/alpha_a2c.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/anisotropy.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/bsdf_lobes_common.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/clearcoat.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/dispersion.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/emissive_strength.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/iridescence.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/sheen.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/specular_ior.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/tangent_frame.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/transmission.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/unlit.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/uv_transform.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| MODIFY | packages/rendering/src/shaders/physical/volume.glsl.ts | Replace attributed shader code with independently authored, standards-based behavior and preserve supported material inputs. |
| CREATE | packages/rendering/src/webgpu/PhysicalLighting.wgsl.ts | Supply equivalent native-GPU material and light evaluation. |
| MODIFY | packages/engine/src/agent-api/nodes/lights.ts | Add photometric profiles and projected images to typed light options. |
| MODIFY | packages/engine/src/contracts/lighting.ts | Specify profiles, clustered light limits, cascades and probes. |
| MODIFY | packages/rendering/src/LightingRig.ts | Consume photometric/projected lights and bounded fallback behavior. |
| CREATE | packages/assets/src/IESLoader.ts | Parse admitted symmetric and two-dimensional photometric profiles with units, angular interpolation, linear lamp/multiplier factors and strict bounds. |
| CREATE | packages/rendering/src/lighting/NativeLightProbeGrid.ts | Implement probe sampling, interpolation, updates and limits on supported backends. |
| CREATE | packages/rendering/src/lighting/NativeLightBaking.ts | Implement incremental light and probe baking with cancellation and explicit output ownership; consume WP-13 UV atlases, chart gutters and texel-density metadata. |
| CREATE | packages/rendering/src/lighting/VoxelIndirectLighting.ts | Implement voxel collection, volume updates and cone-traced indirect lighting with bounded quality tiers. |
| CREATE | tests/unit/rendering/native-light-probes.test.ts | Test probe interpolation, baking, voxel updates, limits and fallback. |
| CREATE | tests/browser/native-advanced-lighting.spec.ts | Verify probe updates, baking and voxel-indirect lighting visibly affect independently authored scenes. |
| CREATE | tests/unit/rendering/native-physical-lighting.test.ts | Cover lobe energy, min/max, photometry, projected texture orientation and invalid inputs. |
| CREATE | tests/browser/native-material-lighting.spec.ts | Exercise both backend paths with calibrated, independently authored material/light scenes. |
| MODIFY | packages/rendering/src/atmosphere/sky.glsl.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/atmosphere/SkyBackgroundPass.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/environment/neutralEmbedded.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/environment/neutralEmbeddedLoader.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/environment/probeBuild.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | public/aura-environments/neutral.specular.ktx2 | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | public/aura-environments/neutral.sh9.f32 | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | public/aura-environments/neutral.manifest.json | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/program/DFGLut.ts | Independently implement matched sky and neutral environment with reproducible verified reference vectors. Exclusive execution owner: wp04_materials/environment_replacement. Source verification: tests/unit/environment-embedded/neutral-embedded.test.ts; independent numerical source tests. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/alpha_a2c.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/anisotropy.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/bsdf_lobes_common.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/clearcoat.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/dispersion.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/emissive_strength.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/iridescence.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/sheen.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/specular_ior.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/tangent_frame.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/transmission.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/unlit.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/uv_transform.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical-wgsl/volume.wgsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| MODIFY | packages/rendering/src/shaders/physical/lobe_calls.glsl.ts | Replace attributed physical shader implementations independently while preserving lobe behavior. Exclusive execution owner: wp04_materials/physical_shaders. Source verification: tests/unit/rendering/native-physical-shaders.test.ts. |
| CREATE | tests/unit/rendering/native-lighting-luts.test.ts | Validate independent lookup data and material shader provenance and numerical behavior. Exclusive execution owner: wp04_materials. Source verification: Direct Vitest for each file. |
| CREATE | tests/unit/rendering/native-physical-shaders.test.ts | Validate independent lookup data and material shader provenance and numerical behavior. Exclusive execution owner: wp04_materials. Source verification: Direct Vitest for each file. |

### WP-05 — Shader graph, compute and render resources

| Action | File | Required change |
| --- | --- | --- |
| CREATE | docs/rendering/native-graph-contact.md | Document graph-material contact certification, raw hot-reload invalidation and the supported rebuild path. Exclusive execution owner: repair_graph_lighting. Source verification: tests/unit/rendering/native-graph-portable-material.test.ts. |
| CREATE | tests/unit/rendering/native-portable-storage-layout.test.ts | Verify combined portable texture and native storage resource layouts, stage access and ownership. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-portable-storage-layout.test.ts. |
| CREATE | tests/unit/rendering/native-portable-resource-limits.test.ts | Verify active portable shader sampler and texture budgets on both native device contracts. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-portable-resource-limits.test.ts. |
| MODIFY | packages/rendering/src/MaterialBinding.ts | Validate and bind unsigned scalar uniforms consistently with portable shader schemas. Exclusive execution owner: repair_graph_u32. Source verification: tests/unit/rendering/native-shader-graph.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/material.ts | Connect complete graph outputs and validation to existing material nodes. |
| CREATE | packages/engine/src/agent-api/nodes/shaderGraph.ts | Define Aura-owned graph types, construction, serialization, diagnostics, and migration from the existing node graph. |
| CREATE | packages/rendering/src/program/ShaderGraphCompiler.ts | Generate and validate GLSL/WGSL from typed graph IR, including vertex, fragment and compute stages. |
| MODIFY | packages/rendering/src/Texture.ts | Add missing texture dimensions, mip update controls, storage usage and validation. |
| MODIFY | packages/engine/src/agent-api/nodes/texture.ts | Expose typed 3D/compressed-cube/storage options and independent mip updates. |
| MODIFY | packages/rendering/src/RenderDevice.ts | Complete target attachment, sampling, resolve, copy, readback and disposal contracts. |
| MODIFY | packages/rendering/src/resources/UniformBlock.ts | Encode signed/unsigned/bool and float data into correct bytes; extend arrays, structures and matrix layouts with explicit validation and staging ownership. |
| CREATE | packages/rendering/src/webgpu/ShaderDataLayout.ts | Derive uniform/storage layouts, strides, padding and typed writes from the graph's target-language type schema. |
| CREATE | tests/unit/rendering/native-shader-data-layout.test.ts | Assert exact bytes and offsets for mixed scalar/vector/matrix/array/structure data, invalid types and alignment. |
| CREATE | packages/rendering/src/webgpu/NativeGpuSort.ts | Implement bounded GPU sorting and synchronization for splats and general compute use. |
| CREATE | tests/unit/rendering/native-gpu-sort.test.ts | Test sorting, stability policy, limits and resource cleanup. |
| CREATE | tests/unit/rendering/native-shader-graph.test.ts | Test graph types, cycles, compilation, backends, resource bindings and errors. |
| CREATE | tests/unit/rendering/native-render-resources.test.ts | Test format/capability validation, mip updates, attachment and ownership rules. |
| CREATE | tests/browser/native-shader-graph.spec.ts | Verify material outputs, compute/render sharing, texture sampling and error behavior. |
| MODIFY | packages/engine/src/agent-api/compiler/customMaterial.ts | Lower typed graph uniforms, builtins and 3D/depth textures through portable material. Exclusive execution owner: wp05_graph/layout. Source verification: tests/unit/rendering/native-graph-portable-material.test.ts. |
| MODIFY | packages/rendering/src/PortableShaderMaterial.ts | Lower typed graph uniforms, builtins and 3D/depth textures through portable material. Exclusive execution owner: wp05_graph/layout. Source verification: tests/unit/rendering/native-graph-portable-material.test.ts. |
| CREATE | tests/unit/rendering/native-graph-portable-material.test.ts | Cover graph uniform aliasing, typed bytes and supported texture contracts. Exclusive execution owner: wp05_graph/layout. Source verification: Direct Vitest for this file. |
| MODIFY | packages/rendering/src/compute/types.ts | Integrate native compute texture bindings and preserve graph/texture behavior with independent expectations. Exclusive execution owner: wp05_graph. Source verification: Graph, compute and texture source tests. |
| MODIFY | packages/rendering/src/compute/ComputeContext.ts | Integrate native compute texture bindings and preserve graph/texture behavior with independent expectations. Exclusive execution owner: wp05_graph. Source verification: Graph, compute and texture source tests. |
| MODIFY | tests/unit/parity/tsl.test.ts | Integrate native compute texture bindings and preserve graph/texture behavior with independent expectations. Exclusive execution owner: wp05_graph. Source verification: Graph, compute and texture source tests. |
| MODIFY | tests/unit/parity/texture.test.ts | Integrate native compute texture bindings and preserve graph/texture behavior with independent expectations. Exclusive execution owner: wp05_graph. Source verification: Graph, compute and texture source tests. |

### WP-06 — Postprocessing

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/rendering/native-webgpu-auto-exposure-device.test.ts | Verify native auto-exposure bindings, submission, transaction failure and scope cleanup through the device source path. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-auto-exposure-device.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-auto-exposure-route.test.ts | Verify native auto-exposure renderer routing, validation and per-view context. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-webgpu-auto-exposure-route.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-auto-exposure.test.ts | Verify native exposure history, bindings, failure, cleanup and scope isolation with source mocks. Exclusive execution owner: repair_webgpu_exposure. Source verification: tests/unit/rendering/native-webgpu-auto-exposure.test.ts. |
| MODIFY | packages/rendering/src/post/shaders/exposure.wgsl.ts | Provide native exposure compute and adaptation stages with explicit bounded shader contracts. Exclusive execution owner: repair_webgpu_exposure. Source verification: tests/unit/rendering/native-webgpu-auto-exposure.test.ts. |
| CREATE | packages/rendering/src/post/WebGPUAutoExposure.ts | Implement native per-view auto-exposure execution, history and resource lifecycle. Exclusive execution owner: repair_webgpu_exposure. Source verification: tests/unit/rendering/native-webgpu-auto-exposure.test.ts. |
| CREATE | tests/unit/rendering/native-auto-exposure-history.test.ts | Verify per-renderer and per-view auto-exposure history isolation and cleanup. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-auto-exposure-history.test.ts. |
| CREATE | tests/unit/rendering/native-frame-clock.test.ts | Verify shadow, forward and post use one captured frame clock across views. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-frame-clock.test.ts. |
| CREATE | tests/unit/rendering/native-post-diagnostics-scope.test.ts | Verify scoped post state isolation, stale tokens, cleanup and independent legacy diagnostics. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-post-diagnostics-scope.test.ts. |
| CREATE | packages/rendering/src/renderer/PostDiagnosticsScope.ts | Maintain explicit renderer, view and frame scoped postprocessing diagnostics and temporal outcomes. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-post-diagnostics-scope.test.ts. |
| MODIFY | tests/qr/prd07/unit/effects-builders.test.ts | Verify scalar and vector effect sizing, validation and fog-volume semantics. Exclusive execution owner: repair_shared_types. Source verification: tests/qr/prd07/unit/effects-builders.test.ts. |
| MODIFY | packages/engine/src/production-runtime/effects/EffectNodeLowering.ts | Preserve typed fog-volume vector extents while keeping particle size ranges distinct during effect lowering. Exclusive execution owner: repair_shared_types. Source verification: effect lowering and fog-volume source tests. |
| MODIFY | packages/engine/src/agent-api/nodes/effects.ts | Preserve typed scalar and 3D effect sizes without corrupting fog-volume behavior. Exclusive execution owner: repair_shared_types. Source verification: effect builder and fog-volume source tests. |
| MODIFY | packages/rendering/src/renderer/postSkipped.ts | Scope temporal-write and post-skip state per renderer and view. Exclusive execution owner: repair_post_device. Source verification: temporal history source tests. |
| MODIFY | packages/engine/src/agent-api/nodes/effects.post.ts | Add typed history, mask, transition, pixelation, halftone, glitch, dot-screen, lens-dirt and afterimage options. |
| MODIFY | packages/engine/src/contracts/post.ts | Specify pass inputs, ordering, render-target ownership and unsupported-input errors. |
| MODIFY | packages/rendering/src/post/PostGraph.ts | Schedule composable passes and manage history, views, resize and invalidation. |
| MODIFY | packages/rendering/src/post/v2Stages.ts | Implement the new and corrected visible passes. |
| MODIFY | packages/rendering/src/forward/Velocity.ts | Replace module-global history with app/device/view/frame-owned state; advance previous transforms once per authored frame and use stable runtime object identities instead of labels. |
| MODIFY | packages/rendering/src/contracts/velocity.ts | Carry explicit frame/view identity, previous-depth ownership and scoped reset semantics through velocity providers. |
| MODIFY | packages/rendering/src/TemporalHistory.ts | Own current/previous color and depth, reactive masks and resize/device generations; retire detached history resources. Exclusive execution owner: repair_post_temporal. |
| MODIFY | packages/rendering/src/TemporalMath.ts | Define jitter, reprojection, reconstruction and depth-convention math with independently derived expectations. |
| MODIFY | packages/rendering/src/webgpu/WebGPUTemporal.ts | Implement the same frame/history/reset contract on the native GPU path. |
| MODIFY | packages/rendering/src/post/shaders/taa.glsl.ts | Implement documented history resolution, disocclusion/reactive rejection and dynamic-resolution reconstruction. |
| MODIFY | packages/rendering/src/post/shaders/taa.wgsl.ts | Match the declared temporal algorithm and resource layout on the native GPU path. |
| MODIFY | packages/rendering/src/post/shaders/motionBlur.glsl.ts | Preserve constant color with centered normalized taps, stable single-sample behavior and bounded edge sampling. |
| MODIFY | packages/rendering/src/post/shaders/motionBlur.wgsl.ts | Preserve equivalent sample, weight and depth/alpha semantics for native GPU rendering. |
| CREATE | tests/unit/rendering/native-temporal-frames.test.ts | Test duplicate frame/pass calls, multiple apps/views, stable object identity, history attachment swaps, resize, reactive masks and blur energy. Exclusive execution owner: repair_post_temporal. |
| CREATE | tests/browser/native-temporal-reconstruction.spec.ts | Verify moving/disoccluded/skinned/transparent subjects, camera cuts, dynamic resolution and view isolation with numerical and pixel expectations. |
| CREATE | packages/rendering/src/post/NativeEffectShaders.ts | Implement independently authored WebGL2 effect shaders. |
| CREATE | packages/rendering/src/webgpu/NativeEffectShaders.wgsl.ts | Implement GPU shaders for required effects; declare only device-specific unsupported variants explicitly. |
| MODIFY | packages/rendering/src/post/ToneOperators.ts | Independently implement CPU operators and regenerate numerical reference vectors from published equations. |
| MODIFY | packages/rendering/src/post/shaders/fxaa.wgsl.ts | Independently implement the GPU anti-aliasing path and validate it alongside the WebGL path. |
| MODIFY | packages/rendering/src/output/ToneMappingOperators.glsl.ts | Replace attributed operator implementations with independently authored formulas and preserve output contracts. |
| MODIFY | packages/rendering/src/post/shaders/fxaa.glsl.ts | Replace the attributed anti-aliasing shader with an independently authored algorithm. |
| MODIFY | packages/rendering/src/post/shaders/gtao.glsl.ts | Replace the attributed occlusion shader with an independently authored algorithm. |
| MODIFY | packages/rendering/src/post/shaders/gtao.wgsl.ts | Provide an independently authored native-GPU counterpart. |
| MODIFY | packages/rendering/src/post/shaders/smaa.glsl.ts | Replace attributed shader implementations with independently authored algorithms. |
| MODIFY | packages/rendering/src/post/shaders/smaa.wgsl.ts | Provide independently authored native-GPU counterparts. |
| MODIFY | packages/rendering/src/post/smaa/textures.ts | Replace copied lookup images with independently generated or suitably licensed original data. |
| MODIFY | tests/unit/parity/tone-mapping.test.ts | Replace external reference imports with published-equation and independently authored output fixtures. |
| CREATE | tests/unit/rendering/native-post-graph.test.ts | Test ordering, masks, resize, history reset, inputs and disposal. |
| CREATE | tests/browser/native-post-effects.spec.ts | Assert visible per-effect changes, alpha/depth handling and temporal behavior. |
| MODIFY | evidence/prd03/goldens/tone-operators.json | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | evidence/prd03/goldens/generate-tone-goldens.mjs | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | packages/rendering/src/post/chunks/velocity.glsl.ts | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | tests/unit/contracts/impl/prd03-velocity.test.ts | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | tests/unit/contracts/impl/prd03-phase4.test.ts | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | tests/unit/gu47/eg/flag-promotion-noop.test.ts | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | tests/unit/rendering/temporal-history-lifecycle.test.ts | Retain independent tone vectors and app, view and frame-owned temporal histories. Exclusive execution owner: wp06_post. Source verification: tests/unit/contracts/impl/prd03-post-tone-operators.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| CREATE | tests/unit/rendering/native-post-shaders.test.ts | Source-test independently authored effects, alpha and depth behavior. Exclusive execution owner: wp06_post. Source verification: Direct Vitest for this file. |
| MODIFY | packages/rendering/src/post/shaders/displayGrade.glsl.ts | Preserve color alpha and implement depth convention aware postprocessing. Exclusive execution owner: wp06_post/independent_shaders. Source verification: tests/unit/rendering/native-post-shaders.test.ts. |
| MODIFY | packages/rendering/src/post/shaders/finalize.glsl.ts | Preserve color alpha and implement depth convention aware postprocessing. Exclusive execution owner: wp06_post/independent_shaders. Source verification: tests/unit/rendering/native-post-shaders.test.ts. |
| MODIFY | packages/rendering/src/post/shaders/displayGrade.wgsl.ts | Preserve color alpha and implement depth convention aware postprocessing. Exclusive execution owner: wp06_post/independent_shaders. Source verification: tests/unit/rendering/native-post-shaders.test.ts. |
| MODIFY | packages/rendering/src/post/shaders/finalize.wgsl.ts | Preserve color alpha and implement depth convention aware postprocessing. Exclusive execution owner: wp06_post/independent_shaders. Source verification: tests/unit/rendering/native-post-shaders.test.ts. |
| MODIFY | packages/rendering/src/post/shaders/depthDownsample.glsl.ts | Preserve color alpha and implement depth convention aware postprocessing. Exclusive execution owner: wp06_post/independent_shaders. Source verification: tests/unit/rendering/native-post-shaders.test.ts. |
| MODIFY | packages/rendering/src/webgl2/LegacyPost.ts | Propagate output color and alpha policy through legacy post path. Exclusive execution owner: wp06_post; serialized transfer from wp32_color before edits. Source verification: tests/unit/rendering/native-color-management.test.ts. |

### WP-07 — Asset transport and glTF

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/assets/native-variant-disposal.test.ts | Verify asynchronous material variant work cannot mutate or retain resources after actor or resource disposal. Exclusive execution owner: repair_variant_lifecycle. Source verification: tests/unit/assets/native-variant-disposal.test.ts. |
| CREATE | tests/assets/native-fixtures/ktx2-red-mips-4x4.md | Record independent fixture origin, codec license, settings, reproducible generation and digest. Exclusive execution owner: repair_streaming_root_test. Source verification: tests/unit/agent-api/native-texture-residency-root.test.ts. |
| CREATE | tests/assets/native-fixtures/ktx2-red-mips-4x4.ktx2 | Record a bounded independently generated multi-mip texture fixture for real source decoding and residency tests. Exclusive execution owner: repair_streaming_root_test. Source verification: tests/unit/agent-api/native-texture-residency-root.test.ts. |
| CREATE | tests/unit/agent-api/native-texture-residency-root.test.ts | Verify public typed model loading through the real compiler and device residency adapter, including actual native-shaped texture binding and teardown. Exclusive execution owner: repair_streaming_root_test. Source verification: tests/unit/agent-api/native-texture-residency-root.test.ts. |
| CREATE | tests/unit/agent-api/texture-residency-app-lifecycle.test.ts | Verify same-canvas remount and async app disposal wait for the owning device residency teardown. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/agent-api/texture-residency-app-lifecycle.test.ts. |
| MODIFY | packages/assets/src/gltf-runtime.ts | Expose the scoped texture-residency source contract through the existing optional asset runtime subpath. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/assets/gltf-texture-residency-source.test.ts. |
| CREATE | tests/unit/agent-api/texture-residency-runtime.test.ts | Verify opt-in app texture residency, device isolation, actor lifecycle, diagnostics and cleanup. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/agent-api/texture-residency-runtime.test.ts. |
| CREATE | packages/engine/src/agent-api/compiler/textureResidency.ts | Coordinate app and actor texture-residency leases, device ownership, frame demand and cleanup. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/agent-api/texture-residency-runtime.test.ts. |
| CREATE | tests/unit/assets/gltf-texture-residency-source.test.ts | Verify retained mip identity, fallback semantics, shared resources and lifecycle for glTF texture sources. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/assets/gltf-texture-residency-source.test.ts. |
| CREATE | packages/assets/src/gltf/GLTFTextureResidency.ts | Retain validated per-slot texture mip sources and explicit fallback semantics for opt-in device residency. Exclusive execution owner: repair_streaming_root. Source verification: tests/unit/assets/gltf-texture-residency-source.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-texture-residency.test.ts | Verify real native texture mip allocation and binding, budget reservations, fenced retirement and device-loss semantics. Exclusive execution owner: repair_gpu_program. Source verification: tests/unit/rendering/native-webgpu-texture-residency.test.ts. |
| CREATE | tests/unit/rendering/webgl2-texture-residency.test.ts | Verify streamed native texture uploads, binding changes, shared budgets, cancellation, retirement and device generation with a strict mock device. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/webgl2-texture-residency.test.ts. |
| CREATE | packages/rendering/src/webgl2/TextureResidencyAdapter.ts | Implement real device-local streamed texture allocation, atomic binding switches and fence-aware retirement. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/webgl2-texture-residency.test.ts. |
| CREATE | tests/unit/agent-api/native-format-runtime.test.ts | Verify per-app format registry forwarding, isolated typed model loading, errors and cleanup through the real root runtime. Exclusive execution owner: repair_asset_runtime. Source verification: tests/unit/agent-api/native-format-runtime.test.ts. |
| MODIFY | packages/engine/src/agent-api/assets/productionModels.ts | Preserve typed model identity, request policy and explicit supported formats across same-origin URLs and metadata. Exclusive execution owner: repair_asset_runtime. Source verification: tests/unit/engine/native-model-options.test.ts. |
| CREATE | tests/unit/assets/texture-residency-controller.test.ts | Exercise residency transitions, actual adapter allocations, shared leases, cancellation, retries, fences and device generation changes. Exclusive execution owner: repair_texture_streaming. Source verification: tests/unit/assets/texture-residency-controller.test.ts. |
| CREATE | packages/assets/src/TextureResidencyController.ts | Implement serialized per-device streaming residency with real backend allocation, shared leases, cancellation, eviction and fenced release contracts. Exclusive execution owner: repair_texture_streaming. Source verification: tests/unit/assets/texture-residency-controller.test.ts. |
| MODIFY | tests/qr/prd04/unit/texture-budget.test.ts | Verify valid small texture residency, admission and existing-resource stability. Exclusive execution owner: repair_texture_budget. Source verification: tests/qr/prd04/unit/texture-budget.test.ts. |
| MODIFY | packages/assets/src/KTX2TargetSelection.ts | Keep opaque and alpha-bearing BC1 selection and format semantics accurately documented. Exclusive execution owner: repair_bc1_texture. Source verification: tests/unit/rendering/native-bc1-image.test.ts. |
| MODIFY | tests/unit/workstream5-runtime.test.ts | Verify valid material iridescence values and retain malformed-input coverage. Exclusive execution owner: repair_gltf_material. Source verification: tests/unit/workstream5-runtime.test.ts. |
| MODIFY | public/aura-decoders/meshopt/meshopt_decoder.cjs | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | packages/assets/vendor/meshopt/meshopt_decoder.cjs | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | fixtures/asset-corpus/decoders/meshopt_decoder.js | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | public/aura-decoders/meshopt/meshopt_decoder.mjs | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | packages/assets/vendor/meshopt_decoder.mjs | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | packages/assets/vendor/meshopt/meshopt_decoder.mjs | Verify or reacquire this exact codec payload from its pinned original upstream without changing its runtime bytes. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | packages/assets/vendor/meshopt/README.md | Distribute the original codec license and record its pinned upstream source and digest. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| CREATE | fixtures/asset-corpus/decoders/LICENSE-meshopt.txt | Distribute the original codec license and record its pinned upstream source and digest. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| CREATE | public/aura-decoders/meshopt/LICENSE.txt | Distribute the original codec license and record its pinned upstream source and digest. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| CREATE | packages/assets/vendor/meshopt/LICENSE.txt | Distribute the original codec license and record its pinned upstream source and digest. Exclusive execution owner: repair_meshopt_provenance. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| MODIFY | .gitignore | Include required codec fixture license notices while preserving existing fixture ignore rules. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | marketing/public/assets/draco/draco_decoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | marketing/public/assets/draco/draco_decoder_nodejs.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | fixtures/asset-corpus/decoders/draco_decoder_gltf.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | fixtures/asset-corpus/decoders/draco_decoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | fixtures/asset-corpus/decoders/basis_transcoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | fixtures/asset-corpus/decoders/basis_transcoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | public/aura-decoders/draco/draco_decoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | public/aura-decoders/draco/draco_decoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | public/aura-decoders/basis/basis_transcoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | public/aura-decoders/basis/basis_transcoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/draco/draco_decoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/draco/draco_decoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/basis/basis_transcoder.wasm | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/basis/basis_transcoder.js | Reacquire the codec payload from its pinned original upstream and verify its exact digest without changing runtime bytes. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | vite.config.ts | Document and distribute the directly sourced codec notices and license texts. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | marketing/vite.config.ts | Document and distribute the directly sourced codec notices and license texts. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/draco/README.md | Document and distribute the directly sourced codec notices and license texts. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/assets/vendor/basis/README.md | Document and distribute the directly sourced codec notices and license texts. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | tests/unit/assets/codec-provenance.test.ts | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | marketing/public/assets/draco/LICENSE.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | fixtures/asset-corpus/decoders/LICENSE-draco.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | fixtures/asset-corpus/decoders/LICENSE-zstd.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | fixtures/asset-corpus/decoders/LICENSE-basis.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | public/aura-decoders/draco/LICENSE.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | public/aura-decoders/basis/LICENSE-zstd.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | public/aura-decoders/basis/LICENSE.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | packages/assets/vendor/draco/LICENSE.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | packages/assets/vendor/basis/LICENSE-zstd.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | packages/assets/vendor/basis/LICENSE.txt | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| CREATE | packages/assets/vendor/codec-provenance.json | Record and distribute immutable original codec provenance, notices and license evidence. Exclusive execution owner: repair_codec_provenance. Source verification: tests/unit/assets/codec-provenance.test.ts. |
| MODIFY | packages/engine/src/agent-api/AssetDecoders.ts | Preserve explicit codec asset configuration when initializing worker and app decoders. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/assets/native-decoder-deployment.test.ts. |
| CREATE | tests/assets/native-gltf-material-resources.test.ts | Regress actual glTF detail map bindings, UV variants, request isolation and texture diagnostics. Exclusive execution owner: repair_gltf_material. Source verification: direct source test for this file. |
| MODIFY | packages/assets/src/AssetManager.ts | Resolve dependency identity and relative paths correctly; prevent cycles before awaiting; scope cache, requests and subscriber ownership. |
| MODIFY | packages/assets/src/AssetCache.ts | Partition cache and in-flight identities by effective request/security context and content digest; release after final owner. |
| MODIFY | packages/assets/src/AssetDependencyGraph.ts | Balance duplicate/shared dependency ownership and reject cycles before loading. |
| MODIFY | packages/assets/src/AssetHandle.ts | Define retain, cancellation, release and double-disposal semantics. |
| MODIFY | packages/assets/src/AssetDecoderRegistry.ts | Evict failed initialization, support retry and safely dispose partial decoders. |
| MODIFY | packages/assets/src/WorkerAssetJobs.ts | Bound queues and require cancellation acknowledgement and worker cleanup. |
| MODIFY | packages/assets/src/KTX2TranscodeWorker.ts | Bound jobs and memory; audit source provenance and handle cancellation and termination. |
| MODIFY | packages/assets/src/KTX2TranscodeDriver.ts | Coordinate cancellation/retry and audit source provenance without treating standard constants as copied implementation. |
| MODIFY | packages/assets/src/TextureStreaming.ts | Make streaming residency, cancellation, eviction and release observable per device. |
| MODIFY | packages/rendering/src/textures/TextureBudget.ts | Make actual returned/resident mip data satisfy budgets; isolate devices and debit releases. |
| MODIFY | packages/assets/src/GLTFAssetParseCache.ts | Include expected content digest and effective context in safe parse-cache identity. |
| MODIFY | packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts | Verify admitted bytes before parsing/caching/rendering; report subresource failures. |
| MODIFY | packages/aura3d-cli/src/asset-core-types.ts | Define format and subresource digest metadata for typed asset admission. |
| MODIFY | packages/aura3d-cli/src/asset-manifest.ts | Preserve versioned digest and dependency metadata through generated manifests. |
| MODIFY | packages/engine/src/production-runtime/TypedGLBActor.ts | Pass integrity, request and selected-format context into the real runtime pipeline. |
| CREATE | packages/assets/src/FormatRegistry.ts | Register optional native format adapters, type metadata, resource builders and disposal. |
| CREATE | tests/assets/native-asset-graph.test.ts | Test parent-relative paths, duplicate/shared edges, cycles, independent cancellation, retries and release. |
| CREATE | tests/assets/native-asset-integrity.test.ts | Test valid/tampered bytes, redirects, distinct digests, subresources and cache isolation. |
| CREATE | tests/browser/native-asset-integrity.spec.ts | Verify admitted asset bytes and failure behavior through the installed root render path. |
| MODIFY | tests/assets/asset-cache-scale.test.ts | Cover balanced reference counts and final cache/resource cleanup. |
| MODIFY | tests/unit/assets/asset-decoder-failure.test.ts | Cover retry after failure, worker cancellation and partial-result cleanup. |
| MODIFY | packages/assets/src/AssetLoader.ts | Add typed request options and progress/cancellation semantics. |
| MODIFY | packages/assets/src/LoaderFetch.ts | Forward cache, credentials, headers and priority; implement safe origin policy. |
| MODIFY | packages/assets/src/FileLoader.ts | Honor configured options and maintain backward compatibility. |
| MODIFY | packages/assets/src/AudioLoader.ts | Route bytes through the shared request/integrity contract and transfer decoded ownership explicitly. |
| MODIFY | packages/assets/src/SceneLoader.ts | Apply policy to documents and dependencies and reject unsupported scene data clearly. |
| MODIFY | packages/assets/src/ImageBitmapLoader.ts | Apply credentials, abort and declared orientation/alpha policy; define flipY precedence and close unowned decoded images. |
| MODIFY | packages/assets/src/loadRenderableAsset.ts | Route real formats through the registry, pass request options and require explicit canonical-fixture selection; never substitute a kit for unknown input or missing transport. |
| MODIFY | packages/audio/src/AudioFileManager.ts | Partition caches by request/digest identity, independently cancel subscribers and prevent stale fetch/decode completions from resurrecting cleared entries. |
| MODIFY | packages/assets/src/vite/auraDecoders.ts | Use one validated deployment base and decoder output path across development, build and static preview. |
| CREATE | packages/assets/src/workers/ktx2.worker.ts | Emit a packaged same-origin decoder worker with bounded job, transfer, cancellation and teardown messages. |
| CREATE | tests/assets/native-public-loader-contracts.test.ts | Test every exported loader's policy, orientation, identity, explicit format selection, cancellation and content integrity. |
| CREATE | tests/unit/audio/native-file-manager.test.ts | Test independent subscribers, clear/dispose during fetch/decode, replacement generations, decoded budgets and final release. |
| CREATE | tests/unit/assets/native-decoder-deployment.test.ts | Test normalized deployment URLs, emitted filenames, nested prefixes, codec policy and traversal rejection. |
| CREATE | tests/browser/native-deployment-contracts.spec.ts | Run packed decoder assets from static root/nested deployments with same-origin-only workers, expected MIME, offline assets and cancellation. |
| CREATE | docs/assets/decoder-deployment.md | Document actual decoder/worker URLs, hosting and content-policy requirements, optional blob fallback and supported deployment bases. |
| MODIFY | packages/assets/src/LoadContext.ts | Propagate policy to every transitive asset request. |
| MODIFY | packages/assets/src/GLTFLoader.ts | Partition shared fetches by request context; implement independent cancellation and new glTF extension parsing. |
| MODIFY | packages/assets/src/GLTFExtensionSupport.ts | Record exact parse, runtime and render support separately. |
| MODIFY | packages/assets/src/GLTFRenderResources.ts | Build material resources for completed extensions and animation bindings; return structured texture failures with explicit strict/fallback behavior. |
| MODIFY | packages/assets/src/gltf/ImageDecode.ts | Preserve request and cancellation options through image dependency loading. |
| MODIFY | tests/assets/asset-compatibility.test.ts | Replace external reference imports with independently authored and open-standard asset fixtures. |
| MODIFY | tests/unit/parity/gltf-decoders.test.ts | Preserve decoder coverage using independent fixture data. |
| MODIFY | tests/assets/gltf-extension-support.test.ts | Cover optional/required extensions, malformed data and material mapping. |
| CREATE | tests/assets/native-asset-request.test.ts | Cover credentials, headers, cache isolation, concurrency, retries, abort and progress. |
| CREATE | tests/browser/native-gltf-materials.spec.ts | Prove rendered extension pixels and animated/variant changes. |
| CREATE | tests/assets/native-texture-residency.test.ts | Test texture residency and emitted decoder worker protocol. Exclusive execution owner: wp07_assets. Source verification: Direct Vitest for each file. |
| CREATE | tests/unit/assets/native-ktx2-worker.test.ts | Test texture residency and emitted decoder worker protocol. Exclusive execution owner: wp07_assets. Source verification: Direct Vitest for each file. |
| MODIFY | packages/assets/src/ImageLoader.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/MaterialLoader.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/ShaderLoader.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/TextureLoader.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/loaders/TextureLoader.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/ImportPipeline.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/AssetInspection.ts | Apply request, integrity, inspected extension and resource ownership contracts to public loaders. Exclusive execution owner: wp07_assets/graph. Source verification: tests/assets/native-asset-graph.test.ts and loader regression tests. |
| MODIFY | packages/assets/src/KTX2BasisTextureTranscoder.ts | Honor packaged same-origin worker URL and decoding lifecycle. Exclusive execution owner: wp07_assets/workers. Source verification: tests/unit/assets/native-ktx2-worker.test.ts. |
| CREATE | tests/assets/native-fixtures/ktx2-red-4x4.ktx2 | Add independently generated red texture encoded fixture with license, origin, settings and digest. Exclusive execution owner: wp07_assets/workers. Source verification: tests/unit/assets/native-ktx2-worker.test.ts. |
| CREATE | tests/assets/native-fixtures/ktx2-red-4x4.md | Add independently generated red texture encoded fixture with license, origin, settings and digest. Exclusive execution owner: wp07_assets/workers. Source verification: tests/unit/assets/native-ktx2-worker.test.ts. |

### WP-08 — Interchange and scientific import formats

Create the following independently implemented, opt-in loaders. Each accepts bounded input, resolves dependencies through WP-07, produces Aura3D asset structures, returns diagnostics for unsupported content, and has a dedicated fixture and test. Never treat format recognition alone as support.

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/assets/obj-admission-inspection.test.ts | Verify bounded native OBJ and material dependency inspection and path safety with independent fixtures. Exclusive execution owner: repair_asset_cli. Source verification: tests/assets/obj-admission-inspection.test.ts. |
| CREATE | tests/unit/aura3d-cli/legacy-model-admission.test.ts | Verify compatibility-preserving inspection status, strict admission, dependency handling and atomic failures. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/aura3d-cli/legacy-model-admission.test.ts. |
| MODIFY | packages/aura3d-cli/src/cli-help.ts | Document bounded typed model admission and explicit adapter registration without claiming unimplemented support. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/aura3d-cli/native-model-admission.test.ts. |
| MODIFY | tests/unit/assets/asset-import-preflight.test.ts | Preserve bounded import preflight coverage while distinguishing parser availability from explicitly registered runtime adapters. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/assets/asset-import-preflight.test.ts. |
| MODIFY | packages/aura3d-cli/src/cli.ts | Route asynchronous archive inspection through the CLI while preserving the synchronous programmatic admission contract. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/aura3d-cli/native-model-admission.test.ts. |
| CREATE | tests/unit/aura3d-cli/native-model-admission.test.ts | Verify typed model admission, byte inspection, errors, provenance and non-mutating failures for supported formats. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/aura3d-cli/native-model-admission.test.ts. |
| MODIFY | packages/aura3d-cli/src/index.ts | Admit independently supported model formats with bounded inspection and correct typed provenance before writing manifests. Exclusive execution owner: repair_asset_cli. Source verification: tests/unit/aura3d-cli/native-model-admission.test.ts. |
| CREATE | tests/assets/native-mesh-formats.test.ts | Verify native mesh import variants, attributes and bounded malformed-input handling using independent fixtures. Exclusive execution owner: repair_mesh_formats. Source verification: tests/assets/native-mesh-formats.test.ts. |
| CREATE | tests/assets/native-scientific-formats.test.ts | Verify bounded scientific and toolpath import variants against independently authored fixture data. Exclusive execution owner: repair_scientific_formats. Source verification: tests/assets/native-scientific-formats.test.ts. |
| CREATE | tests/fixtures/exr/deep_tiled_padded.exr | Verify independently generated deep edge-tile count padding and bounded sample decoding. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| MODIFY | packages/assets/src/importers.ts | Expose independently implemented legacy scene importers through the opt-in importer subpath. Exclusive execution owner: repair_legacy_formats. Source verification: tests/assets/native-legacy-scene-formats.test.ts. |
| CREATE | tests/fixtures/exr/deep_zip.exr | Verify bounded deep multipart, tiled or compression behavior using independently generated EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/deep_tiled_ripmap.exr | Verify bounded deep multipart, tiled or compression behavior using independently generated EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/deep_tiled_mipmap.exr | Verify bounded deep multipart, tiled or compression behavior using independently generated EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/deep_multipart.exr | Verify bounded deep multipart, tiled or compression behavior using independently generated EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/layered_levels.exr | Verify named layer, part and tiled mip selection together with independent EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/layered_chroma.exr | Verify layered chroma and authored chromaticity conversion using independent EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/layered_channels.exr | Verify named channel layers with independently generated EXR data. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/assets/native-legacy-scene-formats.test.ts | Verify valid and malformed legacy scene formats with bounded resources and independently authored fixtures. Exclusive execution owner: repair_legacy_formats. Source verification: tests/assets/native-legacy-scene-formats.test.ts. |
| CREATE | tests/fixtures/exr/subsampled_dwa_rgb.exr | Exercise subsampled RGB DWA decoding with an independently generated fixture. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/subsampled_chroma.exr | Use an independently generated subsampled-channel fixture to verify sample positions, compression and resource limits. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/subsampled_codecs.exr | Use an independently generated subsampled-channel fixture to verify sample positions, compression and resource limits. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/subsampled_source.exr | Use an independently generated subsampled-channel fixture to verify sample positions, compression and resource limits. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/ripmap_levels.exr | Use independently generated EXR ripmap levels to verify asymmetric level selection, bounds and tiled decoding. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/mipmap_levels.exr | Use independently generated EXR mip levels to verify selection, bounds and tiled decoding. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| CREATE | tests/fixtures/exr/multipart_tiled.exr | Exercise independently generated mixed multipart scanline and tiled image data with malformed-input variants. Exclusive execution owner: repair_exr_decoder. Source verification: tests/unit/parity/exr.test.ts. |
| MODIFY | packages/assets/src/AssetImportPreflight.ts | Recognize the formats below and report available decoder, source limits and explicit unsupported variants. |
| MODIFY | packages/assets/src/OBJLoader.ts | Complete line/point primitives, negative indices, material groups, smoothing and material texture paths. |
| MODIFY | packages/assets/src/EXRLoader.ts | Replace the attributed external port with an independently authored decoder, then add PXR24, B44/B44A and DWAA/DWAB plus bounded deep-data handling; reject unsupported tiled modes explicitly. |
| CREATE | packages/assets/src/loaders/FBXLoader.ts | Scene hierarchy, mesh, materials, skinning and animation. |
| CREATE | packages/assets/src/loaders/USDLoader.ts | USD/USDZ geometry, materials, transforms, cameras, lights and animation where representable. |
| CREATE | packages/assets/src/loaders/ColladaLoader.ts | Scene, geometry, materials, skins and animation with external references. |
| CREATE | packages/assets/src/loaders/Model3MFLoader.ts | 3MF package geometry, units, resources, transforms and materials. |
| CREATE | packages/assets/src/loaders/RhinoLoader.ts | 3DM scene geometry, object metadata and material conversion. |
| CREATE | packages/assets/src/loaders/LegacySceneLoaders.ts | AMF, 3DS, VRML, LDraw and KMZ, with dependency and archive limits. |
| CREATE | packages/assets/src/loaders/MeshFormatLoaders.ts | PLY and STL meshes; ASCII/binary variants, attributes, endianness and malformed input. |
| CREATE | packages/assets/src/loaders/VoxelFormatLoaders.ts | VOX and voxel-volume imports with palette, bounds and transforms. |
| CREATE | packages/assets/src/loaders/ScientificFormatLoaders.ts | PCD, PDB, VTK, XYZ, NRRD and GCode data with units and typed attributes. |
| CREATE | packages/assets/src/loaders/AnimationFormatLoaders.ts | BVH, MD2 and MDD animation/geometry data and time mapping. |
| CREATE | packages/assets/src/loaders/VectorFormatLoaders.ts | SVG paths, shapes, fills, strokes and transforms. |
| CREATE | packages/assets/src/loaders/ImageFormatLoaders.ts | JXL, UltraHDR, DDS, PVR, KTX1, TGA and TIFF, including capability-aware GPU fallbacks. |
| CREATE | packages/assets/src/loaders/ColorLutLoaders.ts | 3DL and image-based color tables, interpolation, ranges and validation. |
| CREATE | packages/assets/src/loaders/MaterialDocumentLoader.ts | MaterialX graphs, displacement, unlit and standard surface translation; explicit unsupported node diagnostics. |
| MODIFY | tests/unit/parity/exr.test.ts | Replace external reference imports with independently authored and open-standard EXR fixtures. |
| CREATE | tests/assets/native-scene-formats.test.ts | Fixture coverage for each scene format and its required materials, animation and dependencies. |
| CREATE | tests/assets/native-mesh-image-formats.test.ts | One or more valid and malformed fixtures per mesh, image, scientific, animation and color format. |
| CREATE | tests/browser/native-format-import.spec.ts | Exercise public, typed imported assets through scene rendering. |

### WP-09 — Interchange export

| Action | File | Required change |
| --- | --- | --- |
| CREATE | packages/assets/src/exporters/index.ts | Expose independent native exporters through their opt-in package entrypoint. Exclusive execution owner: repair_gltf_export. Source verification: tests/assets/native-exporters.test.ts. |
| CREATE | packages/assets/src/exporters/GLTFExporter.ts | Export scene graph, meshes, materials, cameras, lights, skins, morphs, animation and dependencies with explicit loss warnings. |
| CREATE | packages/assets/src/exporters/OBJExporter.ts | Write geometry, groups, materials and texture dependencies. |
| CREATE | packages/assets/src/exporters/PLYExporter.ts | Write ASCII/binary geometry with supported vertex/face attributes and endianness. |
| CREATE | packages/assets/src/exporters/STLExporter.ts | Write ASCII/binary triangles, transformed normals and solid boundaries. |
| CREATE | packages/assets/src/exporters/USDZExporter.ts | Package supported geometry, materials, transforms and animation with dependency rules. |
| CREATE | packages/assets/src/exporters/DRACOExporter.ts | Export supported compressed geometry through an explicitly optional codec. |
| CREATE | packages/assets/src/exporters/EXRExporter.ts | Encode supported HDR channels including RLE/PIZ, choose an explicit source attachment/layer and preserve HDR values with bounded memory. |
| CREATE | packages/assets/src/exporters/KTX2Exporter.ts | Encode supported texture layouts with explicit encoder capability. |
| CREATE | packages/assets/src/exporters/ExportContext.ts | Shared source traversal, loss diagnostics, provenance, dependency naming and cancellation. |
| CREATE | packages/aura3d-cli/src/commands/assets/export.ts | Add a typed CLI export command with loss report and output-path validation. |
| CREATE | tests/assets/native-exporters.test.ts | Test each exporter with independently implemented readers or conformance validators, round-trip data and loss warnings. |
| CREATE | tests/browser/native-exporters.spec.ts | Verify a loaded, edited scene exports and reloads without losing supported semantics. |

### WP-10 — Gaussian splats and volume data

| Action | File | Required change |
| --- | --- | --- |
| CREATE | packages/assets/vendor/zstd/provenance.json | Record immutable upstream binary source, digest, license and build provenance limitations. Exclusive execution owner: repair_zstd_codec. Source verification: tests/assets/zstd-decoder.test.ts. |
| CREATE | packages/assets/vendor/zstd/LICENSE.txt | Retain complete upstream notices for the bounded open-format decoder binary. Exclusive execution owner: repair_zstd_codec. Source verification: tests/assets/zstd-decoder.test.ts. |
| CREATE | tests/assets/zstd-decoder.test.ts | Verify bounded Zstandard decode, malformed inputs, worker cancellation and resource limits. Exclusive execution owner: repair_zstd_codec. Source verification: tests/assets/zstd-decoder.test.ts. |
| CREATE | packages/assets/src/workers/zstd.worker.ts | Run bounded Zstandard decode work with explicit cancellation and ownership. Exclusive execution owner: repair_zstd_codec. Source verification: tests/assets/zstd-decoder.test.ts. |
| CREATE | packages/assets/src/loaders/ZstdDecoder.ts | Provide bounded independently sourced Zstandard decoding with explicit worker lifecycle and limits. Exclusive execution owner: repair_zstd_codec. Source verification: tests/assets/zstd-decoder.test.ts. |
| CREATE | tests/unit/rendering/native-splat-view-order.test.ts | Verify splat view-layer filtering, culling, bounds and render-order semantics. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-splat-view-order.test.ts. |
| CREATE | tests/unit/rendering/native-gaussian-splat-webgpu-surface.test.ts | Verify native encoded-color splat surface ownership, ordering and unsupported-state diagnostics. Exclusive execution owner: repair_splat_device_adapter. Source verification: tests/unit/rendering/native-gaussian-splat-webgpu-surface.test.ts. |
| CREATE | packages/rendering/src/webgpu/GaussianSplatSurface.ts | Manage a bounded native encoded-color splat surface with borrowed depth and explicit capability failures. Exclusive execution owner: repair_splat_device_adapter. Source verification: tests/unit/rendering/native-gaussian-splat-webgpu-surface.test.ts. |
| CREATE | tests/unit/rendering/native-gaussian-splat-webgl-surface.test.ts | Verify encoded-color splat surface allocation, depth ownership, failure and restoration with device mocks. Exclusive execution owner: repair_splat_device_adapter. Source verification: tests/unit/rendering/native-gaussian-splat-webgl-surface.test.ts. |
| CREATE | packages/rendering/src/webgl2/GaussianSplatSurface.ts | Manage a bounded encoded-color splat surface with borrowed depth and full device-state restoration. Exclusive execution owner: repair_splat_device_adapter. Source verification: tests/unit/rendering/native-gaussian-splat-webgl-surface.test.ts. |
| CREATE | tests/unit/rendering/native-gaussian-splat-color-composite.test.ts | Verify color transfer and ordered encoded-space compositing against independent numerical expectations. Exclusive execution owner: repair_splat_color. Source verification: tests/unit/rendering/native-gaussian-splat-color-composite.test.ts. |
| CREATE | packages/rendering/src/GaussianSplatColorComposite.ts | Composite ordered encoded-color splat runs against HDR scene color while preserving alpha, depth and resource lifecycle. Exclusive execution owner: repair_splat_color. Source verification: tests/unit/rendering/native-gaussian-splat-color-composite.test.ts. |
| MODIFY | tests/qr/prd15/compiler/handlers.test.ts | Verify the complete scene node handler catalog includes native splat nodes. Exclusive execution owner: repair_splat_runtime. Source verification: tests/qr/prd15/compiler/handlers.test.ts. |
| MODIFY | packages/rendering/src/volumetrics.ts | Export native splat prepared-frame and transparent-run contracts through the rendering subpath. Exclusive execution owner: repair_splat_render. Source verification: tests/unit/rendering/native-gaussian-splat-renderer.test.ts. |
| MODIFY | packages/rendering/src/index.ts | Expose native Gaussian splat rendering contracts to the engine through the package boundary. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/agent-api/native-gaussian-splat-runtime.test.ts. |
| CREATE | tests/unit/agent-api/native-gaussian-splat-runtime.test.ts | Verify asset-backed splat scene compilation, mounting, transforms, cancellation and lifecycle through the public app source path. Exclusive execution owner: repair_splat_runtime. Source verification: tests/unit/agent-api/native-gaussian-splat-runtime.test.ts. |
| MODIFY | packages/engine/src/agent-api/index.ts | Export native Gaussian splat builders and public types alongside existing engine APIs. Exclusive execution owner: repair_splat_runtime. Source verification: tests/unit/agent-api/native-gaussian-splat-runtime.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/handlers.ts | Register typed Gaussian splat nodes in the compiler handler catalog and preserve existing node behavior. Exclusive execution owner: repair_splat_runtime. Source verification: tests/unit/agent-api/native-gaussian-splat-runtime.test.ts. |
| CREATE | packages/assets/src/loaders/GaussianSplatLoader.ts | Parse PLY, SPLAT, KSPLAT, SPZ and registered glTF splat content; validate sizes, covariance and spherical harmonics. |
| CREATE | packages/rendering/src/GaussianSplatRenderer.ts | Render, sort/cull, blend, project covariance and manage GPU resources. |
| CREATE | packages/engine/src/agent-api/nodes/gaussianSplat.ts | Provide typed asset-backed splat scene nodes and backend diagnostics. |
| CREATE | packages/rendering/src/VolumeRenderer.ts | Render scalar volume textures/slices with transfer functions and clipping. |
| CREATE | tests/assets/native-splat-loader.test.ts | Validate every format, version, malformed buffer, memory limit and metadata case. |
| CREATE | tests/browser/native-splats-volume.spec.ts | Test camera movement, depth, transparency, visible color, clipping, resize and disposal. |
| CREATE | tests/unit/rendering/native-volume-renderer.test.ts | Exercise volume and splat rendering math, lifecycle and limits with source mocks. Exclusive execution owner: wp10_splats. Source verification: Direct Vitest for each file. |
| CREATE | tests/unit/rendering/native-gaussian-splat-renderer.test.ts | Exercise volume and splat rendering math, lifecycle and limits with source mocks. Exclusive execution owner: wp10_splats. Source verification: Direct Vitest for each file. |

### WP-11 — Animation and audio

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/animation/native-pose-mixer-reference.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_animation_test_independence. Source verification: tests/unit/animation/native-pose-mixer-reference.test.ts. |
| MODIFY | packages/animation/src/PropertyBinding.ts | Replace attributed parser/lookup with an independent implementation and test safe property paths, Unicode, escaping and indexed targets. |
| MODIFY | packages/animation/src/Keyframe.ts | Add smooth and Bézier interpolation with separately defined tangent and endpoint rules. |
| MODIFY | packages/animation/src/AnimationTrack.ts | Support explicitly sized vector tracks and validation. |
| MODIFY | packages/animation/src/pose/CompiledClip.ts | Propagate new modes and track widths into compiled playback. |
| MODIFY | packages/animation/src/AnimationMixer.ts | Complete deterministic time scaling, playback direction, repeat/ping-pong, action weights and timed fades. |
| MODIFY | packages/animation/src/AnimationAction.ts | Traverse signed and reflected playheads across multiple boundaries with bounded catch-up, consistent state and deterministic marker delivery. |
| MODIFY | packages/animation/src/AnimationEvents.ts | Emit ordered marker events for all supported crossings; define endpoint inclusion and an explicit bounded overflow result. |
| MODIFY | packages/animation/src/AnimationUtils.ts | Preserve every supported interpolation shape and authored tangent through optimize, trim, serialization and additive conversion. |
| MODIFY | packages/animation/src/AnimationObjectGroup.ts | Correct subscription/path and object-UUID indices after removal; independently replace attributed implementation while preserving notices until replacement. |
| MODIFY | packages/animation/src/pose/PoseMixer.ts | Preserve existing warp/synchronization/crossfade behavior and align signed-time, event and lifecycle semantics. |
| MODIFY | packages/assets/src/GLTFAnimationRuntime.ts | Align root playback, supported reverse time, events and property bindings with the core action/mixer contract. |
| CREATE | tests/unit/animation/native-playback-lifecycle.test.ts | Test multi-wrap events, reverse/ping-pong, bounded catch-up, optimization preservation and binding/object resubscription after removal. |
| MODIFY | packages/audio/src/SceneAudioBridge.ts | Update listener forward/up and emitter orientation from world transforms. |
| MODIFY | packages/audio/src/AudioSource.ts | Correct elapsed-position accounting and support loop regions, detune and explicit ownership. |
| CREATE | packages/audio/src/AudioSourceAdapters.ts | Add media-element, media-stream and external-node adapters with teardown contracts. |
| MODIFY | tests/unit/parity/animation.test.ts | Preserve clip, track and mixer coverage using independent expected results. |
| MODIFY | tests/unit/animation/make-clip-additive.test.ts | Use independently authored additive-animation fixtures. |
| MODIFY | packages/audio/tests/audio.test.ts | Cover world orientation, changing rate, pause/resume, loops and disposal. |
| CREATE | tests/unit/animation/native-interpolation.test.ts | Test endpoints, tangents, vector widths, serialization, reverse and timed blending. |
| CREATE | tests/browser/native-animation-audio.spec.ts | Verify visible deformation and browser audio graph behavior with user-gesture handling. |
| CREATE | tests/unit/animation/native-bindings.test.ts | Test binding, pivot, playback, root pose and reverse lifecycle. Exclusive execution owner: wp11_animation. Source verification: Direct Vitest for each file. |
| CREATE | tests/unit/animation/native-root-pose-playback.test.ts | Test binding, pivot, playback, root pose and reverse lifecycle. Exclusive execution owner: wp11_animation. Source verification: Direct Vitest for each file. |
| MODIFY | packages/animation/src/pose/makeClipAdditive.ts | Preserve additive authored tangents and propagate pivot animation and dirty state. Exclusive execution owner: wp11_animation. Source verification: tests/unit/animation/native-bindings.test.ts; tests/unit/animation/native-root-pose-playback.test.ts. |
| MODIFY | packages/animation/src/SceneAnimationBridge.ts | Preserve additive authored tangents and propagate pivot animation and dirty state. Exclusive execution owner: wp11_animation. Source verification: tests/unit/animation/native-bindings.test.ts; tests/unit/animation/native-root-pose-playback.test.ts. |
| MODIFY | packages/animation/src/pose/Retarget.ts | Preserve nonlinear interpolation, tangents, widths and times through compiled-clip decompilation. Exclusive execution owner: wp11_animation/interpolation. Source verification: tests/unit/animation/native-interpolation.test.ts. |
| MODIFY | packages/animation/src/pose/RetargetCache.ts | Bind retarget cache to clip contents, interpolation, events, options and format version. Exclusive execution owner: wp11_animation/interpolation. Source verification: tests/unit/animation/native-retarget-cache.test.ts. |
| CREATE | tests/unit/animation/native-retarget-cache.test.ts | Regress retarget cache invalidation, markers and option identity. Exclusive execution owner: wp11_animation/interpolation. Source verification: Direct Vitest for this file. |

### WP-12 — Controls, picking and spatial sessions

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/agent-api/native-xr-frame-loop.test.ts | Verify one app update per XR frame, per-eye millisecond rendering, pause, clock and session teardown with injected source mocks. Exclusive execution owner: audit_xr_interaction. Source verification: tests/unit/agent-api/native-xr-frame-loop.test.ts. |
| CREATE | packages/controls/src/PointerCoordinates.ts | Convert pointer and selection coordinates through the actual scaled canvas content box. Exclusive execution owner: repair_controls_input. Source verification: tests/unit/controls/native-drag-select.test.ts. |
| MODIFY | docs/controls/interaction-and-picking.md | Keep interaction verification links aligned with current native tests. Exclusive execution owner: repair_test_rename_references. Source verification: tests/unit/runtime-edge-coverage.test.ts. |
| MODIFY | tests/unit/runtime-edge-coverage.test.ts | Preserve independently authored control references and track app runtime edge checks after core extraction. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/runtime-edge-coverage.test.ts. |
| CREATE | tests/unit/rendering/native-interactive-cubes.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_interactive_test_independence. Source verification: tests/unit/rendering/native-interactive-cubes.test.ts. |
| CREATE | tests/unit/rendering/native-interactive-points.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_interactive_test_independence. Source verification: tests/unit/rendering/native-interactive-points.test.ts. |
| CREATE | tests/unit/input/native-orbit-controls.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_controls_test_independence/orbit. Source verification: tests/unit/input/native-orbit-controls.test.ts. |
| CREATE | tests/unit/controls/native-transform-controls.test.ts | Verify native behavior with independently derived source expectations and no external engine dependency. Exclusive execution owner: repair_controls_test_independence. Source verification: tests/unit/controls/native-transform-controls.test.ts. |
| MODIFY | packages/controls/src/DragControls.ts | Implement pointer events, hit selection, drag plane, pointer capture, cancellation and disposal. |
| MODIFY | packages/controls/src/ArcballControls.ts | Add cursor-centered zoom, multi-touch gestures, camera-plane handling and tests. |
| MODIFY | packages/controls/src/Picking.ts | Consume WP-01 exact scene hits and preserve approximate query mode. |
| CREATE | packages/controls/src/SelectionBox.ts | Implement marquee/frustum selection including instances and animated nodes. |
| CREATE | packages/controls/src/InteractiveGroup.ts | Route pointer events to interactive 3D objects with parent transforms. |
| MODIFY | packages/input/src/WebXRSessionController.ts | Consume native viewer, hand and hit-test APIs; expose input-source/select/squeeze, reference-space reset, visibility and cancellation lifecycles. |
| MODIFY | packages/engine/src/agent-api/xr/xrRuntime.ts | Integrate hit-test source acquisition, per-eye presentation and capability-aware sessions; generation-guard every awaited enter stage and close late/superseded sessions. |
| MODIFY | packages/input/src/PointerDevice.ts | Track each contact independently and produce explicit client/CSS/framebuffer coordinates with retained pointer identity. |
| MODIFY | packages/input/src/InputSystem.ts | Preserve cancellation/lost-capture/blur as distinct signals and bind coordinate transforms to the actual app target. |
| MODIFY | packages/input/src/InputSnapshot.ts | Represent contact IDs, timestamps, cancellation and coordinate spaces without mixing simultaneous pointer deltas. |
| MODIFY | packages/input/src/GestureRecognizer.ts | Use elapsed timestamps and stable contact pairs for tap/pinch/drag decisions. |
| MODIFY | packages/input/src/InteractionSystem.ts | Suppress click/tap/drop activation on cancellation while terminating owned drag/hover state safely. |
| MODIFY | tests/unit/input/pointer-cancel-301.test.ts | Preserve cleanup coverage and assert cancellation never activates a click/tap or releases another contact. |
| CREATE | tests/unit/input/native-pointer-contracts.test.ts | Test contact identity, release/cancel, frame-rate-independent timing, coordinate conversion and focus changes. |
| CREATE | tests/browser/native-input-coordinates.spec.ts | Verify embedded/scrolled/resized canvases, DPR changes, touch identities, capture loss and accurate rendered picking. |
| MODIFY | packages/engine/src/agent-api/xr/types.ts | Define hands, controllers, hit tests, planes, depth and session state. |
| CREATE | packages/engine/src/agent-api/xr/XRSceneHelpers.ts | Add optional hand/controller visuals, estimated light and detected-plane/depth adapters. |
| MODIFY | tests/unit/parity/xr.test.ts | Preserve XR source coverage with independent browser-shaped session fixtures. |
| CREATE | tests/unit/controls/native-drag-select.test.ts | Test parent transforms, concurrent input, cancellation, selection and cleanup. |
| CREATE | tests/unit/input/native-xr-frames.test.ts | Test actual browser-shaped objects, reference-space loss and session transitions. |
| CREATE | tests/browser/native-controls-xr.spec.ts | Verify real pointer interaction and an injected browser-shaped XR session; label hardware evidence separately. |
| MODIFY | tests/unit/input/camera-controls.test.ts | Preserve listener lifecycle expectations for native interaction. Exclusive execution owner: wp12_controls. Source verification: Direct Vitest for this file. |

### WP-13 — Curves, surfaces and mesh tools

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | examples/strange-orbit-port/vec3.ts | Keep local vector example test documentation aligned with independent numerical regressions. Exclusive execution owner: repair_port_tests_independence. Source verification: tests/unit/strange-orbit-port/vec3.test.ts. |
| MODIFY | tests/unit/strange-orbit-port/vec3.test.ts | Verify native behavior using independently derived numerical and geometry expectations. Exclusive execution owner: repair_port_tests_independence. Source verification: tests/unit/strange-orbit-port/vec3.test.ts. |
| MODIFY | packages/math/src/Curves.ts | Integrate rational curve and surface types into the public math surface. |
| MODIFY | packages/rendering/src/geometry/Circle.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Cone.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Convex.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Edges.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Extrude.ts | Independently implement extrusion including bevels on paths, or reject unsupported combinations explicitly; retain supported inputs and topology. Preserve historical origin until replacement is verified. Exclusive execution owner: root. |
| MODIFY | packages/rendering/src/geometry/Lathe.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Polyhedron.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Ring.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/RoundedBox.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Shape.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. Preserve historical origin until replacement is verified. Exclusive execution owner: root. |
| MODIFY | packages/rendering/src/geometry/Support.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. Preserve accurate historical notices until replacement is verified. Exclusive execution owner: root. Source verification: tests/unit/parity/geometry-counts.test.ts. |
| MODIFY | packages/rendering/src/geometry/TorusKnot.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Tube.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| MODIFY | packages/rendering/src/geometry/Wireframe.ts | Replace attributed external geometry implementation with an independently authored equivalent; retain supported inputs, topology and documented output contracts. |
| CREATE | packages/math/src/curves/NURBSCurve.ts | Implement rational curves, derivatives, knots and limits. |
| CREATE | packages/math/src/curves/NURBSSurface.ts | Implement rational surfaces and derivatives. |
| CREATE | packages/math/src/curves/NURBSVolume.ts | Implement rational volumes and boundary validation. |
| CREATE | packages/rendering/src/geometry/ParametricGeometry.ts | Generate parametric meshes, UVs, normals and seam-aware topology. |
| CREATE | packages/rendering/src/geometry/LoftGeometry.ts | Generate lofted surfaces with frames, cap and degeneracy handling. |
| CREATE | packages/rendering/src/geometry/TeapotGeometry.ts | Provide a parametric patch-based reference geometry with controllable tessellation. |
| CREATE | packages/engine/src/agent-api/geometry/GeometryUtilities.ts | Add attribute interleave/deinterleave, weld, remap, group merge, triangle conversion, morph evaluation and creased normals. |
| CREATE | packages/engine/src/agent-api/geometry/MeshModifiers.ts | Add runtime simplify, edge split, tessellation and curve deformation with explicit loss diagnostics. |
| CREATE | packages/engine/src/agent-api/geometry/MeshSurfaceSampler.ts | Implement seeded, area-weighted surface sampling and attribute interpolation. |
| CREATE | packages/engine/src/agent-api/geometry/UVAtlas.ts | Build bounded UV charts, seams and packed atlases with gutters/texel density; return remaps for duplicated vertices and preserved attributes/morphs/groups. |
| CREATE | tests/unit/geometry/native-uv-atlas.test.ts | Verify nonoverlap, gutters, seams, texel density, mirrored/degenerate inputs, capacity limits and geometry remapping. |
| MODIFY | tests/unit/parity/curves.test.ts | Use independent numerical curve fixtures. |
| MODIFY | tests/unit/parity/math.test.ts | Use independent mathematical reference fixtures. |
| MODIFY | tests/unit/parity/geometry-counts.test.ts | Verify topology and counts against independently authored expectations. |
| MODIFY | tests/unit/contracts/impl/prd01-geometry.test.ts | Replace external reference imports while retaining geometry contract coverage. |
| CREATE | tests/unit/math/native-rational-curves.test.ts | Test knots, weights, derivatives, seams, dimensions and degeneracy. |
| CREATE | tests/unit/geometry/native-mesh-tools.test.ts | Test topology, groups, morphs, attributes, reproducibility and resource ownership. |
| CREATE | tests/browser/native-geometry-tools.spec.ts | Render generated/modified geometry and verify interactions. |
| MODIFY | packages/math/src/curves/CurveBase.ts | Fix closed tangent seam, oriented-box plane constant and collision depth/normal. Exclusive execution owner: wp13_geometry_tools/rational. Source verification: tests/unit/parity/curves.test.ts; tests/unit/parity/math.test.ts; tests/unit/math/native-rational-curves.test.ts. |
| MODIFY | packages/math/src/OBB.ts | Fix closed tangent seam, oriented-box plane constant and collision depth/normal. Exclusive execution owner: wp13_geometry_tools/rational. Source verification: tests/unit/parity/curves.test.ts; tests/unit/parity/math.test.ts; tests/unit/math/native-rational-curves.test.ts. |
| CREATE | tests/unit/math/native-oriented-box-public.test.ts | Verify the independent oriented box through the public math entry, including the existing plane convention and declarations. Exclusive execution owner: repair_math_obb. Source verification: tests/unit/math/native-oriented-box-public.test.ts. |
| MODIFY | packages/math/src/Octree.ts | Fix closed tangent seam, oriented-box plane constant and collision depth/normal. Exclusive execution owner: wp13_geometry_tools/rational. Source verification: tests/unit/parity/curves.test.ts; tests/unit/parity/math.test.ts; tests/unit/math/native-rational-curves.test.ts. |

### WP-14 — Helpers, output renderers and effects

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | tests/unit/drift-and-deliver-port/headlights.test.ts | Verify native behavior using independently derived numerical and geometry expectations. Exclusive execution owner: repair_port_tests_independence. Source verification: tests/unit/drift-and-deliver-port/headlights.test.ts. |
| MODIFY | tests/unit/strange-orbit-port/render-helpers.test.ts | Verify native behavior using independently derived numerical and geometry expectations. Exclusive execution owner: repair_port_tests_independence. Source verification: tests/unit/strange-orbit-port/render-helpers.test.ts. |
| MODIFY | packages/debug/src/SceneHelpers.ts | Extend reusable dynamic helper geometry and lifecycle. |
| CREATE | packages/debug/src/AdvancedHelpers.ts | Add animation path, audio orientation, probe/grid, octree, collider, area light, texture, vertex-normal and tangent helpers. |
| MODIFY | packages/engine/src/agent-api/nodes/helpers.ts | Expose typed scene helpers with live runtime updates. |
| MODIFY | packages/engine/src/agent-api/LabelTelemetry.ts | Replace the previous spatial-label exclusion with an opt-in, explicitly bounded capability contract. |
| CREATE | packages/addons/src/renderers/SpatialDOMRenderer.ts | Provide 2D and perspective DOM labels with transforms, stacking, accessibility and documented occlusion. |
| CREATE | packages/addons/src/renderers/VectorRenderer.ts | Produce independent SVG output with clipping, projected geometry and supported styles. |
| CREATE | packages/addons/src/effects/StereoOutputs.ts | Supply stereo, anaglyph and parallax-barrier outputs with correct viewport and eye ordering. |
| CREATE | packages/addons/src/effects/AsciiOutput.ts | Provide bounded text-based output and disposal. |
| CREATE | packages/addons/src/effects/OutlineOutput.ts | Add an opt-in object-space outline path with material/alpha rules. |
| CREATE | tests/unit/debug/native-helpers.test.ts | Test transforms, hot updates, empty geometry and disposal. |
| CREATE | tests/browser/native-alternative-outputs.spec.ts | Verify output structure, resizing, accessible labels, stereo pixels and pointer routing. |

### WP-15 — Specialized objects and procedural tools

| Action | File | Required change |
| --- | --- | --- |
| CREATE | packages/addons/src/objects/MarchingCubes.ts | Generate editable isosurfaces with bounded buffers, normals and material data. |
| CREATE | packages/addons/src/objects/SpecializedObjects.ts | Add grounded sky, shadow projection and volume slice objects using existing renderer facilities. |
| CREATE | packages/addons/src/generators/EnvironmentGenerators.ts | Add deterministic terrain, tree, forest, city and street-asset generators with seeds and resource budgets. |
| CREATE | packages/addons/src/tools/Sculptor.ts | Add bounded interactive deformation with normals and undo-compatible edits. |
| CREATE | packages/addons/src/tools/TubePainter.ts | Add path-based tube drawing with normals, caps and disposal. |
| CREATE | packages/addons/src/tools/Fracture.ts | Add deterministic convex fracture geometry and explicit unsupported cases. |
| CREATE | tests/unit/addons/native-objects-generators.test.ts | Test determinism, bounds, topology, budgets, undo data and teardown. |
| CREATE | tests/browser/native-objects-generators.spec.ts | Verify visible procedural outputs, picking and edit operations. |

### WP-16 — Worker-owned rendering

| Action | File | Required change |
| --- | --- | --- |
| CREATE | packages/engine/src/agent-api/app/workerFactoryPackaged.ts | Provide a packaged worker factory with explicit asset URLs and a prebuilt self-contained worker while preserving source development behavior. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-bundle.test.ts. |
| MODIFY | tests/unit/animation/retarget-worker-timeout.test.ts | Verify nested worker URL resolution, timeout and cleanup behavior. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/animation/retarget-worker-timeout.test.ts. |
| MODIFY | packages/animation/src/pose/RetargetWorker.ts | Resolve nested retarget workers from a manifest while preserving cancellation and lifecycle. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/animation/retarget-worker-timeout.test.ts. |
| MODIFY | tests/unit/gu47/ef/vfx-atlas-sprites.test.ts | Verify VFX atlas resource resolution and explicit overrides in worker-safe paths. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/gu47/ef/vfx-atlas-sprites.test.ts. |
| MODIFY | packages/engine/src/production-runtime/effects/FlipbookAtlas.ts | Resolve worker-safe VFX atlas resources from the explicit asset manifest. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/gu47/ef/vfx-atlas-sprites.test.ts. |
| CREATE | tests/unit/engine/native-worker-assets.test.ts | Exercise worker asset URL propagation, explicit overrides and resource ownership. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/engine/native-worker-assets.test.ts. |
| MODIFY | packages/core/src/index.ts | Export worker-safe asset manifest contracts without changing existing core APIs. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/engine/native-worker-assets.test.ts. |
| CREATE | packages/core/src/workerAssets.ts | Define worker-safe explicit resource URL and child-worker asset manifest contracts. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/engine/native-worker-assets.test.ts. |
| CREATE | packages/engine/src/agent-api/app/workerFactory.ts | Provide the host-only statically discoverable module-worker factory without a recursive worker import graph. Exclusive execution owner: repair_worker_render. Source verification: tests/unit/engine/native-worker-protocol.test.ts and packed consumer checks. |
| CREATE | packages/engine/src/agent-api/app/workerProtocol.ts | Define typed init, scene, input, resize, frame, error and dispose messages with request IDs. |
| CREATE | packages/engine/src/agent-api/app/workerRuntime.ts | Own the transferred canvas and renderer; synchronize resources, cancellation, loss and shutdown. |
| CREATE | packages/addons/src/utils/WorkerPool.ts | Provide bounded tasks, cancellation and worker teardown for opt-in processing. |
| MODIFY | packages/engine/src/agent-api/app/canvas.ts | Add explicit OffscreenCanvas handling without breaking DOM targets. |
| MODIFY | packages/engine/src/agent-api/app/frameLoop.ts | Remove unintended legacy runtime edges while preserving frame, diagnostic and animation behavior. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| CREATE | tests/unit/engine/native-worker-protocol.test.ts | Test message ordering, transfer ownership, errors, cancellation and disposal. |
| CREATE | tests/browser/native-worker-render.spec.ts | Verify rendered pixels, resize, input and clean teardown on supported backends. |
| CREATE | packages/engine/src/agent-api/app/workerFrameLoop.ts | Implement and source-test worker frame scheduling, pooled workers and same-origin fixture worker. Exclusive execution owner: wp16_workers. Source verification: Direct source Vitest for worker scheduler and pool; source typecheck browser fixture. |
| CREATE | tests/unit/engine/native-worker-frame-loop.test.ts | Implement and source-test worker frame scheduling, pooled workers and same-origin fixture worker. Exclusive execution owner: wp16_workers. Source verification: Direct source Vitest for worker scheduler and pool; source typecheck browser fixture. |
| CREATE | tests/unit/addons/native-worker-pool.test.ts | Implement and source-test worker frame scheduling, pooled workers and same-origin fixture worker. Exclusive execution owner: wp16_workers. Source verification: Direct source Vitest for worker scheduler and pool; source typecheck browser fixture. |
| CREATE | tests/browser/native-worker-render-worker.ts | Implement and source-test worker frame scheduling, pooled workers and same-origin fixture worker. Exclusive execution owner: wp16_workers. Source verification: Direct source Vitest for worker scheduler and pool; source typecheck browser fixture. |
| CREATE | tests/unit/engine/native-worker-textures.test.ts | Verify worker OffscreenCanvas compositing and unavailable fallback. Exclusive execution owner: wp16_workers. Source verification: Direct Vitest for this file. |
| CREATE | packages/engine/src/agent-api/app/render.worker.ts | Emit a same-origin worker entry for packaged rendering consumers. Exclusive execution owner: wp16_workers. Source verification: Worker source and installed subpath tests. |

### WP-17 — Editor, inspector and developer experience

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | tests/browser/editor-authoring-external-parity.spec.ts | Align the deferred editor acceptance harness with the actual scene renderer and supported authoring behavior. Exclusive execution owner: repair_editor_graph. Source verification: editor browser-spec typecheck; execution remains deferred. |
| MODIFY | apps/editor/src/main.ts | Inject the built standalone scene runtime into project export without coupling shared source modules to the bundler. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| CREATE | apps/editor/src/export/export-runtime.d.ts | Type the emitted standalone project scene export bundle contract. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| CREATE | tests/unit/editor/static-project-export.test.ts | Export the authored project scene with actual geometry, materials and runtime resource ownership. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| MODIFY | packages/editor-runtime/src/StaticExportRuntime.ts | Export the authored project scene with actual geometry, materials and runtime resource ownership. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| CREATE | apps/editor/src/export/exportRuntimeEntry.ts | Export the authored project scene with actual geometry, materials and runtime resource ownership. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| CREATE | apps/editor/src/export/ProjectSceneRuntime.ts | Export the authored project scene with actual geometry, materials and runtime resource ownership. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| MODIFY | apps/editor/src/export/StaticProjectExporter.ts | Export the authored project scene with actual geometry, materials and runtime resource ownership. Exclusive execution owner: repair_editor_graph. Source verification: tests/unit/editor/static-project-export.test.ts. |
| MODIFY | apps/editor/src/panels/InspectorPanel.ts | Keep inspector transform handling type-safe and preserve valid empty selections. Exclusive execution owner: repair_editor_graph. Source verification: editor source typecheck and focused unit tests. |
| MODIFY | apps/editor/src/panels/AssetBrowserPanel.ts | Preserve typed asset handles and explicit loading and error states in the editor. Exclusive execution owner: repair_editor_graph. Source verification: editor source typecheck and focused unit tests. |
| MODIFY | packages/editor-runtime/src/ShaderGraphModel.ts | Replace bounded fixture behavior with a real typed graph backed by WP-05. |
| MODIFY | packages/editor-runtime/src/ProjectSerializer.ts | Serialize graph, selected resources and editor state with versioned migrations. |
| MODIFY | apps/editor/src/EditorShell.ts | Mount functional graph/texture/frame inspector panels and keyboard-accessible actions. |
| CREATE | apps/editor/src/panels/ShaderGraphPanel.ts | Provide graph editing, typed ports, validation, errors, undo and compile feedback. |
| CREATE | apps/editor/src/panels/TextureInspectorPanel.ts | Inspect real texture metadata, formats, mips and resource state. |
| CREATE | packages/debug/src/FrameInspector.ts | Expose actual frame passes, draw/resource counts, timings and diagnostics. |
| CREATE | packages/debug/src/ShaderGraphInspector.ts | Connect live material graphs to compiler output and diagnostics without exposing secrets. |
| CREATE | tests/unit/editor/native-shader-graph-editor.test.ts | Test graph validation, undo, persistence, resource selection and errors. |
| CREATE | tests/browser/native-editor-inspector.spec.ts | Create/edit/reload a graph and verify the rendered material changes. |
| MODIFY | apps/editor/src/viewport/EditorViewport.ts | Integrate persisted graph state, live renderer inspection and licensed compact typography. Exclusive execution owner: wp17_editor. Source verification: tests/unit/editor/native-shader-graph-editor.test.ts and typography source contract. |
| MODIFY | apps/editor/src/project/ProjectSerializer.ts | Integrate persisted graph state, live renderer inspection and licensed compact typography. Exclusive execution owner: wp17_editor. Source verification: tests/unit/editor/native-shader-graph-editor.test.ts and typography source contract. |
| MODIFY | apps/editor/src/styles.ts | Integrate persisted graph state, live renderer inspection and licensed compact typography. Exclusive execution owner: wp17_editor. Source verification: tests/unit/editor/native-shader-graph-editor.test.ts and typography source contract. |
| CREATE | public/fonts/whitney-regular.woff2 | Include licensed editor font assets with recorded provenance. Exclusive execution owner: wp17_editor. Source verification: Typography source contract and license verification. |
| CREATE | public/fonts/whitney-medium.woff2 | Include licensed editor font assets with recorded provenance. Exclusive execution owner: wp17_editor. Source verification: Typography source contract and license verification. |
| CREATE | public/fonts/whitney-semibold.woff2 | Include licensed editor font assets with recorded provenance. Exclusive execution owner: wp17_editor. Source verification: Typography source contract and license verification. |
| CREATE | packages/rendering/src/renderer/PostStageTrace.ts | Trace per-renderer post stages and resources without cross-app state. Exclusive execution owner: wp17_editor/inspectors. Source verification: Editor inspector source tests. |
| CREATE | tests/unit/rendering/native-post-stage-trace.test.ts | Regress per-app stage trace isolation, timing, failure and disposal. Exclusive execution owner: wp17_editor/debug_inspectors. Source verification: Direct Vitest for this file. |

### WP-18 — Documentation, capability ledger and examples

| Action | File | Required change |
| --- | --- | --- |
| CREATE | docs/api/native-formats.md | Document each import/export format, optional entrypoint, supported variants, loss cases and request/security rules. |
| CREATE | docs/rendering/native-backends.md | Document backend selection, depth/clipping, draw state, transparency, camera views, color output, shader layouts, hardware requirements, fallback, loss and supported feature matrix. |
| CREATE | docs/agents/native-capability-recipes.md | Provide runnable Aura3D-owned examples for each delivered capability family using typed admitted assets. |
| MODIFY | docs/api/public-api.md | Replace obsolete import/export, effects, worker and renderer exclusions with the new optional contracts. |
| MODIFY | docs/agents/claims-and-boundaries.md | Promote only the exact capabilities supported by retained source, browser and device evidence. |
| CREATE | examples/native-capabilities/index.ts | Provide one isolated, runnable scenario per capability family with no unrelated engine runtime. |
| CREATE | tests/unit/docs/native-capability-ledger.test.ts | Enforce valid owners, statuses, paths, tests, and no unsupported completion claims. |
| MODIFY | docs/api/public-api.appendix.md | Synchronize source API appendix with generated public documentation and bounded claims. Exclusive execution owner: wp18_docs/public_api_docs. Source verification: API documentation contract tests. |
| MODIFY | docs/agents/agent-quickstart.md | Keep supported API examples and claim boundaries current. Exclusive execution owner: wp18_recovery. Source verification: Documentation link and snippet checks. |
| MODIFY | docs/agents/art-direction.md | Keep supported API examples and claim boundaries current. Exclusive execution owner: wp18_recovery. Source verification: Documentation link and snippet checks. |
| MODIFY | docs/api/app-api.md | Keep supported API examples and claim boundaries current. Exclusive execution owner: wp18_recovery. Source verification: Documentation link and snippet checks. |
| MODIFY | docs/api/scatter-merge.md | Keep supported API examples and claim boundaries current. Exclusive execution owner: wp18_recovery. Source verification: Documentation link and snippet checks. |
| MODIFY | docs/api/game-runtime.md | Keep supported API examples and claim boundaries current. Exclusive execution owner: wp18_recovery. Source verification: Documentation link and snippet checks. |

### WP-19 — Integration, packaging and performance

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/packaging/native-isolated-entrypoints.test.ts | Verify versioned isolated bridge source aliases, workspace exports and package boundary mappings. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/packaging/native-isolated-entrypoints.test.ts. |
| MODIFY | packages/engine/package.json | Map the versioned internal bridge to its emitted workspace path for isolated game consumers. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/packaging/native-isolated-entrypoints.test.ts. |
| MODIFY | tools/arch-gates/rules/exportBudget.ts | Permit the explicitly declared opt-in lighting subpath while retaining all existing export budget checks. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/packaging/native-entrypoints.test.ts. |
| CREATE | tools/release/release-inventory.d.mts | Type the candidate-bound public package release inventory. Exclusive execution owner: root. Source verification: tools/release/package-acceptance.test.mjs. |
| CREATE | tests/unit/packaging/native-worker-bundle.test.ts | Verify self-contained worker bundling and exact worker asset manifest generation. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-bundle.test.ts. |
| CREATE | tools/finalize-dist/worker-bundle.d.mts | Type the published worker bundle finalization and asset manifest contracts. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-bundle.test.ts. |
| CREATE | tools/finalize-dist/worker-bundle.mjs | Assemble a self-contained published render worker and deterministic worker asset manifest. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-bundle.test.ts. |
| MODIFY | packages/engine/src/contracts/materials.ts | Expose real physical detail-map slots through shared material contracts. Exclusive execution owner: repair_shared_types. Source verification: material public contract source tests. |
| MODIFY | tests/unit/agent-api/root-render-source-public-export.test.ts | Regress root XR helper and provenance type exports. Exclusive execution owner: repair_public_xr. Source verification: direct source test for this file. |
| CREATE | tests/unit/packaging/native-worker-package.test.ts | Regress emitted worker package layout and dependency retention. Exclusive execution owner: repair_worker_packaging. Source verification: direct source test for this file. |
| CREATE | tools/finalize-dist/worker-layout.d.mts | Type the worker package layout validator. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-package.test.ts. |
| CREATE | tools/finalize-dist/worker-layout.mjs | Validate packaged module worker output, dependency graph and factory layout. Exclusive execution owner: repair_worker_packaging. Source verification: tests/unit/packaging/native-worker-package.test.ts. |
| CREATE | tests/unit/assets/import-pipeline-public-contract.typecheck.ts | Verify the public import pipeline run type and cleanup acknowledgement contract. Exclusive execution owner: repair_assets_exports. Source verification: targeted strict typecheck for the public source barrel. |
| MODIFY | package.json | Remove external-engine development dependencies, related typings and comparison-only adapters; register native entrypoints, explicit source/browser consumer phases, complete source suites and post-freeze performance collection; add a tested CommonJS condition where supported. |
| MODIFY | pnpm-lock.yaml | Regenerate the lock after dependency removal; ensure the required workspace install does not resolve an external 3D engine transitively. |
| MODIFY | aura.exports.json | Register supported native package and subpath entrypoints through the existing generator. |
| MODIFY | packages/aura3d-cli/data/aura.exports.json | Synchronize generated CLI export metadata with the published native entrypoints. |
| CREATE | packages/addons/package.json | Publish independent optional Aura3D addon entrypoints with explicit dependencies and side effects. |
| CREATE | packages/addons/src/index.ts | Export completed addon capabilities without importing other engines. |
| MODIFY | packages/assets/package.json | Publish opt-in importer/exporter entrypoints, emitted same-origin decoder workers and codec boundaries. |
| MODIFY | packages/react/package.json | Align supported peer ranges, module conditions and packed declarations with tested client/server behavior. |
| MODIFY | packages/assets/src/index.ts | Export completed server-safe asset APIs. |
| MODIFY | packages/assets/src/browser-index.ts | Export completed browser-safe asset APIs. |
| MODIFY | packages/controls/src/index.ts | Export completed controls and selection APIs. |
| MODIFY | packages/debug/src/index.ts | Export completed helpers and inspection APIs. |
| MODIFY | packages/audio/src/index.ts | Export completed audio adapters. |
| MODIFY | packages/math/src/index.ts | Export supported rational curve, surface, volume and mathematical additions. |
| MODIFY | packages/engine/src/contracts/app.ts | Integrate additive backend selection, diagnostics and fallback options. |
| MODIFY | packages/engine/src/public/index.ts | Export root-safe features requested by the feature lanes. |
| MODIFY | packages/engine/src/agent-api/nodes/types.ts | Carry typed scene and material clipping declarations through existing public node contracts. Exclusive execution owner: repair_clipping_authoring. Source verification: tests/unit/agent-api/native-clipping-authoring.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/types/runtime.ts | Integrate runtime target, worker, backend and diagnostics contracts. |
| MODIFY | tools/arch-gates/rules/option-coverage.ts | Generate valid typed option probes and explicit unsupported dispositions. |
| MODIFY | packages/engine/src/agent-api/compiler/optionCoverage.ts | Replace generic scaffold probes with meaningful per-builder values and observable outcome contracts. |
| MODIFY | packages/engine/src/contracts/compiler.ts | Define stable option diagnostics and ownership for compiler/runtime probes. |
| MODIFY | tests/unit/agent-api/option-coverage.test.ts | Verify valid options, unsupported errors and actual consumers rather than builder acceptance alone. |
| MODIFY | tests/qr/prd15/compiler/optionCoverage.test.ts | Test valid option lowering; label compile-only evidence correctly. |
| MODIFY | tools/release/release-inventory.mjs | Replace fixed new-version counts with a reviewed, version-aware package inventory; preserve historical inventories. |
| MODIFY | tools/release/exact-release-plan.mjs | Validate the versioned release inventory, staged/committed source binding, names, identities and package hashes without confusing a pre-freeze provenance commit with the later freeze commit. |
| MODIFY | tools/release/publish-all.mjs | Consume the shared inventory and verified source identity; add --out-plan for pack-only jobs, preserve candidate digests and fail safely on missing, duplicate or unexpected packages. |
| MODIFY | tools/release/source-identity.mjs | Support verified Git-free staging manifests, recompute every required input and bind unchanged tested snapshots to the freeze commit; separate reviewed administrative records from implementation identity. |
| CREATE | tools/release/staged-source-identity.test.mjs | Test Git-free staging, modified/missing/undeclared files, symlink bounds, unchanged source committed after tests and implementation changes after freeze. |
| MODIFY | tools/release/verify-public-release.mjs | Use the same versioned inventory instead of an unrelated fixed count. |
| MODIFY | tools/package-provenance/index.ts | Validate the current versioned inventory without confusing local integrity with publisher identity. |
| MODIFY | tools/package-tarball-audit/index.ts | Inspect all actually published packages and installed payloads. |
| MODIFY | tools/package-tiers.ts | Register the optional package and its dependency/bundle boundaries. |
| MODIFY | tools/release/release-origin.test.mjs | Test historical and new inventories, missing/duplicate packages and identity/rollback requirements. |
| MODIFY | tools/generate-resolution-maps/index.ts | Generate all new root/package subpath and conditional mappings consistently. |
| MODIFY | tsconfig.base.json | Regenerate owned source paths from the export registry; keep compiler defaults consistent across new packages. |
| MODIFY | tsconfig.paths.generated.json | Regenerate all supported source/package aliases through the generator. |
| MODIFY | vite.aliases.generated.ts | Regenerate development/browser aliases without hand-editing derived mappings. |
| MODIFY | tools/finalize-dist/manifest.generated.json | Regenerate distribution mappings and new entrypoint payloads through the export generator. |
| MODIFY | vitest.config.ts | Derive or validate aliases against the same registry; include all required source suites and fail on undiscovered selected tests. |
| MODIFY | tsconfig.check.json | Typecheck new packages, tests/assets and supported browser-test configuration without hiding newly introduced errors. |
| CREATE | packages/addons/README.md | Document independent optional modules, install requirements, ownership and support boundaries. |
| MODIFY | tools/verify-exports/index.ts | Register and test every new supported subpath. |
| MODIFY | tools/finalize-dist/index.ts | Produce compatible entrypoints, declarations and CommonJS bridge where supported. |
| CREATE | tools/native-runtime-audit/index.ts | Add --phase source\|browser; inspect dependencies/imports/packed source and provenance before freeze; browser mode independently validates the global gate before consuming candidate-bound network results; report fingerprint candidates without claiming authorship from absence. |
| CREATE | tools/performance/native-benchmark.ts | Validate the global gate before analyzing --input candidate-bound remote measurements for fixed Aura3D workloads; reject missing samples/identity and report startup/frame/draw/memory/bundle results. Source tests may exercise pure analysis with synthetic fixtures but must not launch a browser or claim acceptance. |
| CREATE | tests/unit/packaging/native-entrypoints.test.ts | Verify ESM/CommonJS behavior, optional imports and missing optional dependency diagnostics. |
| CREATE | tests/integration/native-capability-consumer.test.ts | Compile and run a packed consumer with root and optional entrypoints. |
| CREATE | tests/integration/native-math-archives.test.ts | Verify both exact packed math archives and the candidate-bound independence manifest in the remote source phase. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/tools/native-math-archive-audit.test.ts. |
| CREATE | tests/unit/tools/native-math-archive-audit.test.ts | Test archive identity, stale output, source maps and wrapper inventory with synthetic inputs. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/tools/native-math-archive-audit.test.ts. |
| CREATE | tools/native-math-archive-audit/index.ts | Inspect exact candidate math archives, maps, wrappers, notices and retired body inventory. Exclusive execution owner: repair_lighting_package. Source verification: tests/unit/tools/native-math-archive-audit.test.ts. |
| MODIFY | packages/engine/src/agent-api/sceneGraph.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/paritySurfaces.ts | Integrate root pivot transforms and independent viewport/scissor/post view lowering. Exclusive execution owner: wp19_integration. Source verification: tests/unit/scene/pivot-transform.test.ts; tests/unit/parity/viewport-views.test.ts. |
| CREATE | tests/unit/tools/native-runtime-audit-cli.test.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| CREATE | tests/unit/tools/native-benchmark.test.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| CREATE | packages/debug/src/helpers.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| CREATE | packages/rendering/src/lighting/index.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| CREATE | packages/engine/src/public/worker.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| CREATE | packages/engine/src/public/shader-graph-runtime.ts | Connect shared public entrypoints, registry helpers and source-phase tooling. Exclusive execution owner: wp19_integration. Source verification: Direct source tests for CLI, benchmark and exported package subpaths. |
| MODIFY | packages/rendering/src/contracts/frameGraph.ts | Carry camera depth, inverse projection and linearization through frame contracts. Exclusive execution owner: wp19_integration. Source verification: tests/unit/rendering/native-camera-depth.test.ts. |
| MODIFY | tests/unit/tools/generate-resolution-maps.test.ts | Validate native subpath, CLI registry and generated resolution maps. Exclusive execution owner: wp19_integration/exports_registry. Source verification: Direct Vitest for this file. |
| MODIFY | packages/engine/src/agent-api/compiler/errors.ts | Expose actionable postprocess input diagnostics through compiler. Exclusive execution owner: wp19_integration/contracts_engine. Source verification: Postprocess malformed and unavailable input source tests. |
| MODIFY | tools/release/l01-producer.ts | Pass the current source-consumer report into candidate-bound tree shaking. Exclusive execution owner: wp19_integration/release_packaging. Source verification: Release producer source tests. |
| MODIFY | tests/assets/vitest.config.ts | Resolve asset aliases from the canonical generated registry. Exclusive execution owner: wp19_integration/exports_registry. Source verification: Assets export suite source tests. |
| MODIFY | packages/rendering/src/contracts/frameUniforms.ts | Carry camera depth convention and inverse projection in shared frame uniforms. Exclusive execution owner: wp19_integration. Source verification: tests/unit/rendering/native-camera-depth.test.ts. |

### WP-20 — Verification and artifact retention

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/rendering/native-benchmark-frame.test.ts | Verify guarded benchmark frame snapshots use the actual collected opaque draws and camera without replaying contributors. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-benchmark-frame.test.ts. |
| CREATE | benchmarks/quality-rebuild/vite.aura-mask.config.ts | Configure an independent native-only benchmark mask entry with local aliases and asset handling. Exclusive execution owner: repair_native_mask. Source verification: tests/unit/benchmarks/native-object-mask.test.ts. |
| CREATE | benchmarks/quality-rebuild/aura-mask.ts | Connect the independent benchmark scene to a guarded native object-mask capture and publish its result. Exclusive execution owner: repair_native_mask. Source verification: tests/unit/benchmarks/native-object-mask.test.ts. |
| CREATE | benchmarks/quality-rebuild/aura-mask.html | Provide a standalone native benchmark mask entry without importing unrelated comparison adapters. Exclusive execution owner: repair_native_mask. Source verification: tests/unit/benchmarks/native-object-mask.test.ts. |
| CREATE | tests/unit/benchmarks/native-object-mask.test.ts | Verify independent object identifier encoding, mask traversal, visibility, ownership and failure semantics without a browser. Exclusive execution owner: repair_native_mask. Source verification: tests/unit/benchmarks/native-object-mask.test.ts. |
| CREATE | tools/native-capability-gate/index.d.mts | Expose accurate TypeScript declarations for the source gate module and its validation interface. Exclusive execution owner: repair_gate_types. Source verification: tests/unit/tools/native-capability-gate.test.ts. |
| CREATE | tests/unit/tools/native-browser-source-inventory.test.ts | Verify required browser specification and harness source roots are typechecked and historical comparison entrypoints cannot enter the independent source graph. Exclusive execution owner: repair_source_inventory. Source verification: tests/unit/tools/native-browser-source-inventory.test.ts. |
| CREATE | tests/qr/prd06/unit/historical-registry-source.test.ts | Reject malformed, duplicate, missing or mismatched historical registry bindings while preserving registration assertions. Exclusive execution owner: repair_source_phase_boundary. Source verification: tests/qr/prd06/unit/historical-registry-source.test.ts. |
| CREATE | tests/qr/prd06/unit/historical-registry-source.ts | Inspect the historical registry source and resolve its shared specification bindings without executing browser adapters. Exclusive execution owner: repair_source_phase_boundary. Source verification: tests/qr/prd06/unit/historical-registry-source.test.ts. |
| MODIFY | tests/qr/prd06/unit/ik-slope-terrain.test.ts | Preserve terrain and historical scene registration assertions through a source-only registry contract without loading browser adapters. Exclusive execution owner: repair_source_phase_boundary. Source verification: tests/qr/prd06/unit/ik-slope-terrain.test.ts. |
| MODIFY | tests/qr/prd06/unit/perf-tier-scenes.test.ts | Preserve historical scene registration and workload assertions through a source-only registry contract without loading browser adapters. Exclusive execution owner: repair_source_phase_boundary. Source verification: tests/qr/prd06/unit/perf-tier-scenes.test.ts. |
| MODIFY | tools/remote-acr/Dockerfile.playwright | Install the independent frozen workspace and remote browser engines; COPY required tests/fixtures, consumer/template payloads, gate validator/record and referenced manifests/source reports; build or import only hash-verified candidate artifacts. |
| MODIFY | tools/remote-acr/run.sh | For roadmap acceptance jobs, require a valid AURA3D_CODE_COMPLETE_GATE before image build or job submission; forward it with browser-project/candidate identity, stage required fixture/template/environment files and preserve failing or missing test status. Preserve unrelated established workflows. |
| MODIFY | tools/remote-acr/task-run.sh | For roadmap acceptance jobs, revalidate the gate against staged candidate hashes before any browser or display startup; reject headed selectors and run the selected headless project. Preserve test JSON, console logs, screenshots and traces. |
| MODIFY | tools/remote-acr/task.playwright.yaml | Forward the browser project, reporter and gate artifact path without passing credentials in command arguments. |
| MODIFY | tools/remote-acr/upload-artifacts.mjs | Implement bounded artifact transfer through the repository's approved service identity. |
| CREATE | tools/remote-acr/run-source.sh | Submit a serverless source/build job with verified provider context, unique run ID, hashed staging inventory, cleanup and failure propagation. |
| CREATE | tools/remote-acr/Dockerfile.source | Install the independent frozen workspace on the declared Node/package-manager versions; include required source, tests, configs, docs, fixtures and templates without host dependencies or stale dist. |
| CREATE | tools/remote-acr/task.source.yaml | Execute the immutable source-job image and authorized artifact egress without a standing agent pool or exposed credentials. |
| CREATE | tools/remote-acr/source-task-run.sh | Invoke allowlisted source checks, retain per-command exits and reports, and return nonzero for failures or missing results. |
| CREATE | tools/remote-acr/source-checks.mjs | Define argv-based source/build/pack/consumer steps in dependency order, phase-specific reports and complete expected test inventory; prohibit browser/acceptance modes in the source allowlist. |
| CREATE | tests/unit/tools/native-source-execution.test.ts | Reject stale/missing stages, hidden browser work in source phase, missing fixture payloads, unsafe argv and lost test failure status. |
| CREATE | tools/native-capability-gate/index.mjs | Validate exact required/completed outcome and expected/passing check ID sets plus candidate/report hashes, emit the global code-complete record after freeze, and reject acceptance requests without that matching record. |
| CREATE | tests/unit/tools/native-capability-gate.test.ts | Test partial/unowned outcomes, equal-count but different ID sets, missing/skipped source checks, tampered files, stale commits/artifacts, early browser invocation and valid code-complete-to-acceptance handoff without launching a browser/provider job. |
| MODIFY | tests/unit/aura3d-cli/asset-inspection-animation.test.ts | Replace external reference imports with independent animation fixtures. |
| MODIFY | tests/unit/aura3d-cli/assets.test.ts | Replace external reference imports while retaining CLI asset coverage. |
| MODIFY | tests/unit/cli/look-lint.test.ts | Replace external reference imports with an independent scene fixture. |
| MODIFY | tests/unit/contracts/impl/prd12-capture.test.ts | Replace external reference imports with independent capture fixtures. |
| MODIFY | tests/unit/root-path-integrity/renderer-mounts-t1.test.ts | Preserve renderer mount coverage using native-only test inputs. |
| MODIFY | tests/unit/tools/production-path-benchmark.test.ts | Preserve benchmark coverage using a native reference workload. |
| MODIFY | tests/browser/resource-soak-u1.spec.ts | Extend existing repeated lifecycle measurements to textures, buffers, pipelines, listeners, workers and app isolation; retain calibrated heap limits by runner. |
| MODIFY | tests/visual/canvas-pixel-checks.ts | Add expected-background and subject-region checks; do not count opaque alpha alone as visible feature evidence. |
| CREATE | tests/unit/visual/canvas-pixel-checks.test.ts | Test black/transparent/white backgrounds, noise and an expected visible subject without rejecting intentionally dark scenes. |
| CREATE | tsconfig.browser-tests.json | Typecheck new browser harnesses and specs without hiding pre-existing test debt. |
| CREATE | tests/browser/native-capability-lifecycle.spec.ts | Repeatedly mount, load, resize, lose/recover where supported, unload and dispose without growing live resource counts. |
| CREATE | tests/fixtures/native-capabilities/README.md | Describe every independently authored or open-standard fixture, origin, license, target behavior and size. |
| CREATE | docs/rendering/native-capability-evidence.md | Record backend, browser, device class, fixture, test revision, result, limitations and artifact locations. |
| MODIFY | tools/production-path-benchmark/index.ts | Remove prohibited comparison adapter and preserve native source-phase benchmark validation. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Source-phase benchmark and independence tests. |
| MODIFY | tests/unit/contracts/impl/prd02-room-environment.test.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/unit/contracts/impl/prd02-neutral-room-legacy.test.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/unit/contracts/impl/prd02-light-mirrors.test.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/qr/prd07/unit/preetham-cpu-reference.test.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/qr/prd01/unit/brdf-reference.test.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/qr/prd01/unit/brdf-cpu.ts | Replace attributed reference code with independently derived numerical fixtures preserving behavior. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Targeted source numerical tests. |
| MODIFY | tests/browser/example-dev-server.ts | Make browser harness source reliable while enforcing acceptance phase boundary. Exclusive execution owner: wp20_source_gate. Source verification: Acceptance launcher and harness source tests. |
| CREATE | benchmarks/quality-rebuild/aura3d/lib/mask.ts | Independently implement object-ID mask pass with linear encoding, disabled antialiasing and native pipeline integration. Exclusive execution owner: wp20_source_gate/independent_fixtures. Source verification: Independent encoded fixtures and source math tests. |

Fixture files created for WP-07 through WP-15 must be enumerated individually in the capability ledger before implementation. Their paths, licenses, sizes and expected outputs must be deterministic; do not use fixtures from another engine.

### WP-21 — App readiness, isolation and lifecycle

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/agent-api/atmosphere-frame-invalidation.test.ts | Verify app-owned atmosphere updates invalidate the correct frame loop and clean up across pause and disposal. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/agent-api/atmosphere-frame-invalidation.test.ts. |
| MODIFY | packages/engine/src/agent-api/vfx/effects-api.ts | Connect app-owned effects lifecycle and bridge cleanup to disposal without affecting other apps. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| CREATE | tests/unit/agent-api/native-query-disposal.test.ts | Verify root app disposal invalidates retained query handles, remains idempotent and does not affect another live app. Exclusive execution owner: repair_asset_runtime. Source verification: tests/unit/agent-api/native-query-disposal.test.ts. |
| CREATE | tests/unit/rendering/native-temporal-isolation.test.ts | Verify temporal jitter and camera-fade state remain isolated by renderer, frame and view while retaining legacy no-context behavior. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-temporal-isolation.test.ts. |
| MODIFY | packages/rendering/src/shaders/camera-fade.glsl.ts | Scope camera-fade temporal jitter to the owning renderer and frame while preserving the legacy no-context interface. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-temporal-isolation.test.ts. |
| MODIFY | tests/unit/contracts/impl/prd03-post-resources.test.ts | Regress post target allocation sample count and resource lifetime. Exclusive execution owner: repair_post_device. Source verification: direct source test for this file. |
| MODIFY | tests/unit/engine/instances-model-mount-p2.test.ts | Keep the instanced-model fixture consistent with the real material parameter interface and verify runtime color-target propagation. Exclusive execution owner: repair_mesh_query_handoff. Source verification: direct source test for this file. |
| MODIFY | packages/engine/src/agent-api/app/createAuraApp.ts | Stage per-entry physics access injection while preserving app readiness, residency, XR and lifecycle behavior. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-entry-app-lifecycle.test.ts. |
| MODIFY | packages/engine/src/agent-api/assetEvents.ts | Route events only to the owning app; unregister subscriptions on disposal. |
| MODIFY | packages/engine/src/agent-api/diagnostics.ts | Scope diagnostic records and integrity/format statuses to the app; redact sensitive fields. |
| MODIFY | packages/engine/src/agent-api/compiler/color.ts | Replace process-wide parsing policy with app-scoped policy. |
| MODIFY | packages/rendering/src/ShaderFailures.ts | Replace shared mutable mode and records with app/device-owned state. |
| MODIFY | packages/engine/src/agent-api/world/flags.ts | Make world-builder flags app-scoped and safe for concurrent apps. |
| MODIFY | packages/engine/src/agent-api/compiler/renderInput.ts | Forward validated live scene/material clipping state into render source and item snapshots. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-clipping-authoring.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/fog.ts | Remove cross-app mutable atmosphere state. Exclusive execution owner: repair_vfx_atmosphere. |
| MODIFY | packages/engine/src/agent-api/app/actorAnimationHandle.ts | Isolate animation flags and runtime handles per app. |
| MODIFY | packages/engine/src/production-runtime/actor/extensions.ts | Scope actor extension flags and callbacks to the owning runtime. |
| MODIFY | packages/engine/src/agent-api/vfx/atmosphere-api.ts | Preserve atmosphere disposal and per-app ownership while revoking staged frame snapshots. Exclusive execution owner: repair_vfx_atmosphere. Source verification: tests/unit/agent-api/native-vfx-atmosphere-isolation.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/observations.ts | Remove unused legacy runtime edges while preserving asset observations and diagnostics. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | packages/rendering/src/ResourceLifecycle.ts | Dispose all owned resources even if one fails; aggregate diagnostics and make repeated disposal safe. |
| MODIFY | packages/rendering/src/resources/RenderTargetPool.ts | Track exclusive live leases separately from idle ownership; make repeated release safe, preserve nonnegative counts and retire resources by device generation. |
| MODIFY | tests/qr/prd11/unit/render-target-pool.test.ts | Test duplicate release, simultaneous acquisition, foreign/disposed targets, outstanding leases during restore and exactly-once cleanup. |
| MODIFY | packages/rendering/src/program/ProgramCache.ts | Prevent acquisition after disposal, dispose late successful compiles, settle cancelled handles and retry only within the correct device generation. |
| MODIFY | packages/rendering/src/WebGL2Device.ts | Preserve async warmup and implement allocation/polling cleanup on shader/link failure, disposal or loss; integrate depth, clipping, state and color contracts requested by their owners. |
| CREATE | tests/unit/rendering/native-shader-lifecycle.test.ts | Test delayed compile success/rejection after disposal, failed partial allocation, loss/recreation, repeated disposal and warmup settlement. Exclusive execution owner: repair_webgl_streaming. |
| MODIFY | tests/unit/agent-api/aura-app-async-lifecycle.test.ts | Cover failed/aborted/superseded mount, background resume, disposal and callback races. |
| MODIFY | docs/rendering/renderer-lifecycle.md | Document the existing guarded remount behavior and the completed readiness and recovery contract. |
| CREATE | tests/unit/agent-api/multi-app-isolation.test.ts | Test simultaneous app flags, diagnostics, errors and asset event ownership. |
| CREATE | tests/unit/agent-api/native-readiness.test.ts | Test renderer failure, first frame, abort, late completion, disposal and redacted error details. |
| CREATE | tests/unit/rendering/native-resource-lifecycle.test.ts | Test throwing disposers, shared ownership, cleanup order and idempotence. |
| CREATE | tests/browser/native-multi-app-isolation.spec.ts | Verify two independently configured apps do not affect each other or leak subscriptions. |
| CREATE | tests/browser/native-resource-ownership.spec.ts | Verify mount/loss/resize/dispose races and visible recovery on supported paths. |
| CREATE | packages/engine/src/agent-api/sanitizeDiagnostics.ts | Provide bounded redaction helpers for app-scoped errors and asset events. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/agent-api/multi-app-isolation.test.ts. |
| MODIFY | packages/rendering/src/contracts/device.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/post/PostResources.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/renderer/PostprocessExecution.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/resources/ResourceRegistry.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/lanes/prd11.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/batching/MultiDrawBatch.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | tests/unit/gu47/eb/set-fog.test.ts | Adopt generation-safe exclusive resource leases and per-device rebuild isolation. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-resource-lifecycle.test.ts; tests/unit/contracts/impl/prd03-post-resources.test.ts. |
| MODIFY | packages/rendering/src/webgl2/ContextLifecycle.ts | Restore negotiated depth clear and comparison state across context lifetime. Exclusive execution owner: wp21_lifecycle. Source verification: tests/unit/rendering/native-camera-depth.test.ts. |

### WP-22 — Browser and device compatibility

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | playwright.config.ts | Add default-flags chromium-automation, firefox-automation and webkit-automation projects, plus a separately labeled chromium-gpu-headless project and explicit software/experimental diagnostics. |
| MODIFY | docs/project/compatibility.md | Publish versioned backend/browser/OS support cells with exact evidence and limitations. |
| CREATE | docs/rendering/native-browser-support.md | Define supported, experimental, unsupported and unverified browser/device tiers. |
| CREATE | tests/browser/native-cross-browser-harness.ts | Exercise rendering, assets, controls, lifecycle and worker entrypoints with backend diagnostics. |
| CREATE | tests/browser/native-cross-browser.spec.ts | Run the same independent public scenarios on each applicable browser project. |
| CREATE | tests/unit/tools/native-browser-matrix.test.ts | Reject missing browser versions, false hardware labels and unqualified skipped cases. |

### WP-23 — Production React integration

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/agent-api/native-ssr-import.test.ts | Verify direct source root and React SSR imports in a fresh Node process without browser globals. Exclusive execution owner: repair_ssr_cycle. Source verification: tests/unit/agent-api/native-ssr-import.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/instances.ts | Preserve instance declaration and public behavior while eliminating import-time initialization cycles. Exclusive execution owner: repair_ssr_cycle. Source verification: tests/unit/agent-api/native-ssr-import.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/primitives.ts | Remove import-time initialization cycles while preserving public primitive and instance behavior. Exclusive execution owner: repair_ssr_cycle. Source verification: tests/unit/agent-api/native-ssr-import.test.ts. |
| MODIFY | tests/unit/react-adapter/react-frame-events.test.ts | Verify frame callbacks change only after a committed React update and clean up safely. Exclusive execution owner: audit_react_integration. Source verification: tests/unit/react-adapter/react-frame-events.test.ts. |
| MODIFY | tests/unit/react-adapter/react-canvas-scene-update.test.ts | Verify fragment traversal and scene sibling updates reach the mounted public app. Exclusive execution owner: audit_react_integration. Source verification: tests/unit/react-adapter/react-canvas-scene-update.test.ts. |
| MODIFY | packages/react/src/index.ts | Make readiness truthful, scope preload/cache by loader and security identity, support retry/cancellation, avoid updates after unmount and clean StrictMode lifecycle. |
| MODIFY | packages/react/README.md | Document supported versions, SSR/hydration, ownership, errors and precise status. |
| CREATE | tests/unit/react-adapter/native-hydration.test.ts | Test server-safe imports, resource identity, retries, cancellation and late completions. |
| CREATE | tests/browser/native-react-lifecycle.spec.ts | Test both supported peer majors, StrictMode, Suspense, errors, rerenders, input and repeated mount/unmount. |

### WP-24 — Stable API, documentation and installed consumers

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/fixtures/native-consumer/worker.mjs | Exercise the installed public render-worker entry in the consumer matrix. Exclusive execution owner: root. Source verification: tests/unit/tools/native-consumer-matrix.test.ts. |
| CREATE | tests/fixtures/native-consumer/conditions.mjs | Verify installed package import and declared condition resolution in the consumer matrix. Exclusive execution owner: root. Source verification: tests/unit/tools/native-consumer-matrix.test.ts. |
| MODIFY | tools/public-surface-diff/index.ts | Add --baseline-manifest, --candidate-plan, --release-kind and --out; compare current packed exports/types with verified prior Aura3D declarations without installing/executing the old runtime or requiring old local Git tags. |
| MODIFY | tools/public-surface-diff/patch-compatibility.ts | Classify breaking values, type signatures, subpaths and conditions by release level. |
| CREATE | tools/public-surface-diff/prepare-baseline.ts | Fetch verified prior Aura3D package metadata/declaration archives without install scripts or runtime execution; emit a baseline manifest with version, origins, digests and bounded extracted declarations. |
| MODIFY | tools/public-api-contract/index.ts | Accept --candidate-plan and check every supported subpath/peer consumer from those verified archives without silently rebuilding or repacking different payloads. |
| MODIFY | tools/api-docs/index.ts | Generate reference from actual packed export conditions and declarations, including directory and conditional entries. |
| MODIFY | tools/docs-codeblocks/index.ts | Typecheck every applicable documented snippet against packed packages and report explicit exemptions. |
| MODIFY | tools/agent-examples/index.ts | Validate the complete supported example catalog rather than a small selected subset. |
| MODIFY | tools/package-clean-install/index.ts | Add --phase source\|browser and --run-id; build untouched packed consumers in source phase, emit the section 3.10 report and retain projects; browser phase independently validates the global gate and --source-report before execution and writes a separate result. |
| MODIFY | tools/packed-consumer-check/index.ts | Fail on missing dependencies or skipped checks; record all harness changes and avoid silently repairing the consumer. |
| MODIFY | tools/package-install-smoke/index.ts | Verify native isolated consumers, package conditions, optional peers and SSR-safe imports. |
| MODIFY | docs/agents/troubleshooting.md | Correct environment, loader and runtime guidance against current installed behavior. |
| MODIFY | packages/create-aura3d/src/template-hdri.ts | Include or explicitly install promised environment assets in generated templates. |
| CREATE | tests/browser/native-offline-environments.spec.ts | Verify neutral/offline and each promised preset, plus explicit missing-preset behavior. |
| MODIFY | docs/project/support-policy.md | Define stable/experimental status, compatibility window, deprecations, issue ownership and supported releases. |
| CREATE | docs/api/stability-policy.md | Define API/version rules, source/binary compatibility, lifecycle contracts and major-version migration requirements. |
| CREATE | tools/native-consumer-matrix/index.ts | Run packed JavaScript, TypeScript, SSR, worker and optional-peer consumers in isolated projects; require --phase source\|browser and independently validate the global gate and --source-report before browser acceptance. |
| CREATE | tests/unit/tools/native-api-stability.test.ts | Test missing subpaths, breaking signatures, deprecation windows and prior-consumer compatibility. |
| CREATE | tests/unit/tools/native-doc-examples.test.ts | Detect an undocumented export, invalid snippet, skipped check and broken example. |
| CREATE | tests/unit/tools/native-unmodified-consumer.test.ts | Detect missing dependencies, missing configuration and unauthorized harness repair. |
| CREATE | tests/unit/tools/native-consumer-matrix.test.ts | Verify peer, package-manager, module-condition and isolation reporting. |
| CREATE | tests/fixtures/native-consumer/javascript-esm.mjs | Import public root and optional subpaths in plain JavaScript. |
| CREATE | tests/fixtures/native-consumer/typescript-nodenext.ts | Compile public declarations with Node-style resolution. |
| CREATE | tests/fixtures/native-consumer/typescript-bundler.ts | Compile public declarations with bundler resolution. |
| CREATE | tests/fixtures/native-consumer/react-ssr.tsx | Render a supported server-side integration without DOM access at import. |
| CREATE | tests/fixtures/native-consumer/react-client.tsx | Mount and dispose the packed client integration. |
| CREATE | tests/fixtures/native-consumer/optional-peer-absent.mjs | Verify documented behavior without optional dependencies. |
| CREATE | tests/fixtures/native-consumer/optional-peer-present.mjs | Verify documented behavior with optional dependencies. |
| CREATE | tests/browser/native-examples-catalog.spec.ts | Execute the supported example and template catalog with independent visual expectations. |
| MODIFY | tests/unit/tools/api-docs.test.ts | Test packed candidate API docs rather than stale source-only baselines. Exclusive execution owner: wp24_consumers. Source verification: Direct Vitest for this file. |
| CREATE | tests/fixtures/native-examples-catalog/expectations.json | Record independent subject expectations per scaffold and capability example. Exclusive execution owner: wp24_consumers/docs_contracts/catalog_browser. Source verification: Fixture schema and provenance tests; browser acceptance remains pending. |

### WP-25 — Performance, memory and profiler maturity

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | tools/bundle-size/index.ts | Measure critical paths and optional package slices against existing budgets without raising them. |
| MODIFY | tools/installed-tree-shaking/index.ts | Accept --source-report; validate current candidate/tarball/project hashes, measure installed slices and reject optional backend bytes embedded in the root package. Exclusive execution owner: repair_tree_shaking. Source verification: tests/unit/tools/native-installed-tree-shaking.test.ts. |
| MODIFY | BUNDLE_SIZES.md | Regenerate the published report from the current candidate with method and budget outcomes. |
| MODIFY | packages/debug/src/GPUProfiler.ts | Use real asynchronous device timers where available; label CPU time and unsupported/disjoint GPU results correctly. |
| MODIFY | tests/unit/debug/debug-runtime.test.ts | Test timer availability, delayed/disjoint data, device loss and no fabricated GPU timings. |
| CREATE | tools/performance/native-budget.ts | Compare repeated candidate measurements to versioned same-device baselines and measured noise. |
| CREATE | tools/performance/native-workloads.ts | Define reproducible scene, asset, seed, quality and viewport inputs for each workload. |
| CREATE | tests/unit/performance/native-budget.test.ts | Test regression thresholds, noisy/no-data results and budget failure behavior. |
| CREATE | tests/browser/native-performance-probe.spec.ts | Collect rendered startup, frame, memory, resource and available device timing metrics. |
| CREATE | docs/rendering/native-performance-baselines.md | Record exact workload, browser, device, baseline, method, budgets and limitations. |
| MODIFY | tools/bundle-size/markdown.mjs | Bind installed bundle reports and acceptance to current candidate identity. Exclusive execution owner: wp25_performance/tree_shaking. Source verification: tests/unit/tools/native-installed-tree-shaking.test.ts. |
| MODIFY | tools/bundle-size/markdown.d.mts | Bind installed bundle reports and acceptance to current candidate identity. Exclusive execution owner: wp25_performance/tree_shaking. Source verification: tests/unit/tools/native-installed-tree-shaking.test.ts. |
| MODIFY | tools/release/package-acceptance.mjs | Bind installed bundle reports and acceptance to current candidate identity. Exclusive execution owner: wp25_performance/tree_shaking. Source verification: tests/unit/tools/native-installed-tree-shaking.test.ts. |
| CREATE | tests/unit/tools/native-installed-tree-shaking.test.ts | Test installed dependency and tree-shaking graph isolation, including optional backend bytes embedded in root package subtrees. Exclusive execution owner: repair_tree_shaking. Source verification: tests/unit/tools/native-installed-tree-shaking.test.ts. |
| MODIFY | packages/debug/src/ChromeTraceExporter.ts | Report unavailable, disjoint and lost GPU scopes separately from CPU timings. Exclusive execution owner: wp25_performance/profiler. Source verification: Profiler source tests. |
| MODIFY | tools/release/package-acceptance.test.mjs | Test candidate-bound tree-shaking and canonical report acceptance. Exclusive execution owner: wp25_performance/bundle_recovery. Source verification: Direct Node test for this file. |
| MODIFY | tools/release/budget-continuity.mjs | Use versioned budgets without raising the current caps or hiding changed entries. Exclusive execution owner: wp25_performance/bundle_recovery. Source verification: Budget continuity source tests. |

### WP-26 — World text, line rendering and model options

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | packages/rendering/src/SdfText.ts | Replace the bounded atlas-only path with licensed, dynamic glyph atlas support while preserving built-in fallback. |
| MODIFY | packages/engine/src/agent-api/nodes/text3d.ts | Expose typed font, shaping, layout, fallback and lifecycle options. |
| MODIFY | packages/engine/src/agent-api/compiler/text.ts | Compile font assets, shaping results and atlas updates to visible text. |
| CREATE | packages/rendering/src/text/FontLoader.ts | Load admitted licensed font data and metadata with bounded decoding. |
| CREATE | packages/rendering/src/text/TextShaper.ts | Shape Unicode, ligatures, kerning, fallback, direction and line layout. |
| CREATE | packages/rendering/src/text/GlyphAtlas.ts | Manage bounded glyph allocation, eviction, updates and GPU disposal. |
| MODIFY | packages/engine/src/agent-api/nodes/lines.ts | Support or explicitly reject world-unit dashes, width and color combinations. |
| MODIFY | packages/engine/src/agent-api/compiler/lines.ts | Carry material clipping through line, point and sprite compilation or fail unsupported paths explicitly. Exclusive execution owner: repair_clip_lines. Source verification: tests/unit/agent-api/native-line-clipping.test.ts. |
| MODIFY | packages/rendering/src/ScreenSpaceLineMaterial.ts | Implement width, dash, gradient, clipping and alpha behavior. |
| MODIFY | packages/rendering/src/LineGeometry.ts | Preserve the public re-export contract for the real line implementation in Geometry.ts. |
| MODIFY | packages/rendering/src/Geometry.ts | Implement capacity-aware retained line/attribute updates, correct distance/color/bounds refresh and disposal of superseded buffers; keep mesh contracts coordinated with WP-01. |
| MODIFY | packages/engine/src/agent-api/compiler/modelMaterials.ts | Apply custom model materials to supported slots and report unsupported cases. |
| MODIFY | packages/engine/src/agent-api/nodes/model.ts | Remove unintended legacy physics imports while preserving model LOD, collider, variants and worker behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | docs/rendering/world-labels-and-text.md | Document font/label capabilities, accessible counterparts and verified limits. |
| CREATE | tests/unit/rendering/native-text-shaping.test.ts | Test Unicode, direction, kerning, fallback, wrapping, allocation and disposal. |
| CREATE | tests/unit/rendering/native-line-material.test.ts | Test color gradients, dash continuity, world units, clipping and resizing. |
| CREATE | tests/unit/engine/native-model-options.test.ts | Test material overrides, variants, LOD, collider behavior and unsupported errors. |
| CREATE | tests/browser/native-world-text.spec.ts | Verify multilingual text, layout, dynamic glyphs and accessible labels. |
| CREATE | tests/browser/native-lines-models.spec.ts | Verify pixels and interactions for line/material/model options. |
| CREATE | tests/unit/engine/native-line-runtime.test.ts | Regress line hierarchy, dynamic geometry and resource lifecycle. Exclusive execution owner: wp26_text. Source verification: Direct Vitest for this file. |
| MODIFY | packages/rendering/src/ShaderLibrary.ts | Integrate line width, gradient and clipping plus dynamic world text and accessibility. Exclusive execution owner: wp26_text. Source verification: tests/unit/rendering/native-line-geometry.test.ts; tests/unit/rendering/native-text-shaping.test.ts. |
| CREATE | tests/unit/rendering/native-screen-space-line-clipping.test.ts | Verify clipped line shader contracts, coordinate spaces, group semantics and unchanged unclipped behavior. Exclusive execution owner: repair_special_line_shader. Source verification: tests/unit/rendering/native-screen-space-line-clipping.test.ts. |
| CREATE | packages/rendering/src/forward/ScreenSpaceLineClipping.ts | Provide distinct forward clipping shader variants for screen-space wide and dashed lines while retaining expansion, gradient, dash and cap semantics. Exclusive execution owner: repair_special_line_shader. Source verification: tests/unit/rendering/native-screen-space-line-clipping.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/textures.ts | Integrate line width, gradient and clipping plus dynamic world text and accessibility. Exclusive execution owner: wp26_text. Source verification: tests/unit/rendering/native-line-geometry.test.ts; tests/unit/rendering/native-text-shaping.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/labels.ts | Remove unused legacy runtime edges while preserving label generation. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | tests/unit/parity/lines.test.ts | Integrate line width, gradient and clipping plus dynamic world text and accessibility. Exclusive execution owner: wp26_text. Source verification: tests/unit/rendering/native-line-geometry.test.ts; tests/unit/rendering/native-text-shaping.test.ts. |
| CREATE | tests/unit/rendering/native-line-geometry.test.ts | Regress line buffers, bounds and disposal. Exclusive execution owner: wp26_text/line_geometry. Source verification: Direct Vitest for this file. |
| MODIFY | tests/unit/agent-api/option-ignored-model-instances.test.ts | Assert model collider and LOD settings now take effect rather than expecting ignored warnings. Exclusive execution owner: wp26_text. Source verification: Direct Vitest for this file. |

### WP-27 — Physics and game-runtime maturity

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | packages/engine/src/agent-api/nodes/prompt/promptPlanV2.ts | Replace accidental legacy barrel imports with equivalent direct authoring leaves in prompt plans. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/world/street.ts | Remove legacy barrel imports while preserving world-scene construction behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/world/room.ts | Remove legacy barrel imports while preserving world-scene construction behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/world/kits.ts | Remove unintended legacy barrel imports while preserving world-kit behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/world/spline.ts | Remove accidental legacy barrel imports while preserving spline and world authoring behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| CREATE | packages/engine/src/agent-api/nodes/sceneKitsCore.ts | Expose scene-kit namespaces bound to entry-specific game access without legacy imports. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| CREATE | packages/engine/src/agent-api/sceneKitDiagnosticsCore.ts | Extract provider-bound scene-kit diagnostics while preserving mini-golf simulation semantics. Exclusive execution owner: repair_physics_evidence_edges. Source verification: tests/unit/physics/native-isolated-evidence-edges.test.ts. |
| CREATE | tests/unit/physics/native-v5-entry.test.ts | Verify isolated public entry identity, preload, legacy coexistence and runtime import boundaries. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-v5-entry.test.ts. |
| CREATE | packages/game/src/v5.ts | Stage the versioned game facade with its own slot and the shared isolated provider. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-v5-entry.test.ts. |
| CREATE | packages/engine/src/agent-api/isolated-index.ts | Provide a solver-independent authoring surface without importing legacy-bound barrels. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-v5-entry.test.ts. |
| CREATE | packages/engine/src/public/v5.ts | Stage a provider-neutral versioned engine facade with explicit access-bound APIs. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-v5-entry.test.ts. |
| CREATE | packages/engine/src/public/v5-context.ts | Bind one isolated physics provider to the versioned engine and game factories. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-v5-entry.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/sceneKits.ts | Remove verified unused legacy runtime imports while preserving scene-kit behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/SceneSequencer.ts | Use provider-neutral character imports while preserving animation, voice and sequencing behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/AnimationDirector.ts | Use provider-neutral character imports while preserving animation, voice and sequencing behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/AuraVoiceBridge.ts | Use provider-neutral character imports while preserving animation, voice and sequencing behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/PromptAnimationEvidence.ts | Use provider-neutral character imports while preserving animation, voice and sequencing behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/gameRules.ts | Use the provider-neutral game runtime helper while preserving fighting rule behavior. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/groups.ts | Remove unused legacy runtime imports while preserving group construction. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/ShotTimeline.ts | Remove unused legacy runtime imports while preserving timeline behavior. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/particles.ts | Remove unused legacy runtime imports while preserving particle builders. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/product.ts | Remove unused legacy runtime imports while preserving product builders. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/game/runtime.ts | Use provider-neutral runtime leaves while preserving game namespace behavior. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/compiler/actors.ts | Remove unused legacy animation namespace imports while preserving actor compilation and readiness. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| CREATE | tests/unit/physics/native-isolated-barrel-edges.test.ts | Verify scoped behavior, isolation and preserved runtime contracts. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/product-viewer-runtime.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/particle-fountain-runtime.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/humanoid-walk-runtime.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/looks/lookLint.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/effects.lighting.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/looks/looks.ts | Remove unintended legacy barrel edges while preserving authoring and runtime behavior. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/physics/native-isolated-barrel-edges.test.ts. |
| CREATE | tests/unit/physics/native-isolated-evidence-edges.test.ts | Verify scoped behavior, isolation and preserved runtime contracts. Exclusive execution owner: repair_physics_evidence_edges. Source verification: tests/unit/physics/native-isolated-evidence-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/sceneKitDiagnostics.ts | Remove unintended legacy runtime edges while preserving evidence and diagnostics semantics. Exclusive execution owner: repair_physics_evidence_edges. Source verification: tests/unit/physics/native-isolated-evidence-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/GameEvidence.ts | Remove unintended legacy runtime edges while preserving evidence and diagnostics semantics. Exclusive execution owner: repair_physics_evidence_edges. Source verification: tests/unit/physics/native-isolated-evidence-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/sceneEvidence.ts | Remove unintended legacy runtime edges while preserving evidence and diagnostics semantics. Exclusive execution owner: repair_physics_evidence_edges. Source verification: tests/unit/physics/native-isolated-evidence-edges.test.ts. |
| CREATE | tests/unit/physics/native-isolated-runtime-edges.test.ts | Verify scoped behavior, isolation and preserved runtime contracts. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/PromptAnimationContract.ts | Remove unintended legacy runtime edges while preserving frame, diagnostic and animation behavior. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/AnimationRenderQueue.ts | Remove unintended legacy runtime edges while preserving frame, diagnostic and animation behavior. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/devtools/diagnosticPreview.ts | Remove unintended legacy runtime edges while preserving frame, diagnostic and animation behavior. Exclusive execution owner: repair_physics_runtime_edges. Source verification: tests/unit/physics/native-isolated-runtime-edges.test.ts. |
| CREATE | packages/game/src/shared.ts | Expose provider-neutral shared game APIs for legacy and versioned game entries. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/GameSceneGeometryMath.ts | Remove unintended legacy runtime imports while preserving game scene geometry calculations. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| CREATE | packages/engine/src/agent-api/GameVectorMath.ts | Provide provider-neutral vector helpers shared by game runtime and effects without a runtime import cycle. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-entry-runtime-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/colorUtils.ts | Remove unintended legacy-root imports while preserving color conversion and source graph isolation. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| CREATE | tests/unit/physics/native-isolated-game-edges.test.ts | Verify provider-neutral source graph edges and preserve existing runtime behavior. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/prefabs/gamePresentation.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/prefabs/index.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/game-kits/fighting.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/GameGenreKits.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_game_edges. Source verification: tests/unit/physics/native-isolated-game-edges.test.ts. |
| CREATE | tests/unit/physics/native-isolated-graph-edges.test.ts | Verify provider-neutral source graph edges and preserve existing runtime behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/camera.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/scene.ts | Expose scene-level clipping while preserving scene builder and provider-neutral imports. Exclusive execution owner: repair_clipping_authoring. Source verification: tests/unit/agent-api/native-clipping-authoring.test.ts. |
| MODIFY | packages/engine/src/agent-api/vfx/gameEffects.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| CREATE | packages/engine/src/public/v5-internal.ts | Provide one versioned provider-neutral bridge shared by isolated engine and game entries. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-physics-entry-graph.test.ts. |
| CREATE | packages/game/src/session/GameSessionCore.ts | Extract provider-neutral game session implementation without a legacy engine-root dependency. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | packages/game/src/juice/fxPoolLayerCore.ts | Extract provider-neutral game effects implementation without a legacy engine-root dependency. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | tests/unit/benchmarks/prd12-t0-12-mount-timing.test.ts | Preserve mount-timing source checks when app implementation moves to its provider-bound core. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/benchmarks/prd12-t0-12-mount-timing.test.ts. |
| CREATE | packages/game/src/createGameCore.ts | Extract per-entry game creation implementation without a legacy engine-root import. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | packages/game/src/gameCore.ts | Extract per-entry game slot composition without a legacy engine-root import. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | packages/engine/src/agent-api/nodes/games-core.ts | Extract provider-bound mini-game namespace into a solver-independent runtime leaf. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | packages/engine/src/agent-api/nodes/game/core.ts | Extract provider-bound game namespace into a solver-independent runtime leaf. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | packages/engine/src/agent-api/app/createGameAppCore.ts | Extract provider-bound game-app implementation into a solver-independent runtime leaf. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-entry-app-lifecycle.test.ts. |
| CREATE | packages/engine/src/agent-api/app/createAuraAppCore.ts | Extract provider-bound app implementation into a solver-independent runtime leaf. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-entry-app-lifecycle.test.ts. |
| CREATE | tests/unit/agent-api/prd07-app-mount-authority.test.ts | Verify private app atmosphere authority binds the actual renderer, canvas and runtime owner across remount and disposal. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/agent-api/prd07-app-mount-authority.test.ts. |
| CREATE | packages/engine/src/agent-api/nodes/physics-core.ts | Extract provider-bound physics scene and world implementation without a static optional-backend dependency. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-entry-runtime-binding.test.ts. |
| CREATE | packages/engine/src/agent-api/GameRuntimeCore.ts | Extract provider-bound collision runtime without a static optional-backend dependency. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-entry-runtime-binding.test.ts. |
| CREATE | tests/unit/physics/native-physics-entry-graph.test.ts | Verify legacy bootstrap module ordering, non-eager isolated provider graph and per-entry ownership boundaries. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-physics-entry-graph.test.ts. |
| CREATE | packages/engine/src/public/legacy-physics-access.ts | Stage a separate synchronous legacy physics access bootstrap without seeding isolated providers. Exclusive execution owner: repair_isolated_physics_entry. Source verification: tests/unit/physics/native-physics-entry-graph.test.ts. |
| CREATE | tests/unit/physics/native-entry-runtime-binding.test.ts | Verify entry-scoped physics/runtime providers, synchronous preloads, reset/clear and independent ownership. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-entry-runtime-binding.test.ts. |
| CREATE | tests/unit/physics/native-entry-game-binding.test.ts | Verify simultaneous legacy and isolated game entry bindings, resets, slot ownership and failure cleanup. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/game/src/juice/fxPoolLayer.ts | Prepare shared game effects helpers for an isolated-safe engine entry. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/game/src/motion/motionGate.ts | Prepare shared game motion helpers for an isolated-safe engine entry. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/game/src/index.ts | Stage independent game entry slots and preserve legacy entry registration. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/games.ts | Stage per-entry mini-game physics bindings while preserving legacy behavior. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/engine/src/agent-api/nodes/game/index.ts | Stage per-entry game bindings without sharing physics-provider state. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| CREATE | tests/unit/physics/native-entry-app-lifecycle.test.ts | Verify isolated and legacy app physics access, declared-body preflight, transactional scene changes and lifecycle. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-entry-app-lifecycle.test.ts. |
| MODIFY | packages/engine/src/agent-api/app/createGameApp.ts | Stage per-entry physics access through game-app creation without changing existing default behavior. Exclusive execution owner: repair_isolated_physics_app. Source verification: tests/unit/physics/native-entry-app-lifecycle.test.ts. |
| CREATE | tests/unit/physics/native-isolated-provider.test.ts | Verify isolated provider loading, concurrent initialization, failure causes, retries and synchronous readiness contracts. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-isolated-provider.test.ts. |
| CREATE | packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts | Implement the independently loadable physics-world provider with explicit async initialization and synchronous ready-state access. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-isolated-provider.test.ts. |
| MODIFY | packages/engine/src/agent-api/camera/Probe.ts | Use the solver-independent collision query entry so camera probes do not eagerly load the simulation backend. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics-rapier/optional-boundary.test.ts. |
| MODIFY | packages/physics/src/solverless.ts | Expose solver-independent sphere-cast queries and their types without importing the simulation backend. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics-rapier/optional-boundary.test.ts. |
| CREATE | tests/unit/physics/native-backend-accelerated-ccd.test.ts | Cover accelerated sphere collision intervals, invalid roots and numerical edge cases with independent expectations. Exclusive execution owner: native_joints. Source verification: tests/unit/physics/native-backend-accelerated-ccd.test.ts. |
| CREATE | packages/physics/src/native/NativeAcceleratedCCD.ts | Independently implement bounded constant-acceleration collision intervals for supported analytic pairs, rejecting ambiguous unsupported cases. Exclusive execution owner: native_joints. Source verification: tests/unit/physics/native-backend-accelerated-ccd.test.ts. |
| CREATE | tests/unit/physics/native-backend-support-path.test.ts | Verify support-interval geometry and bounded character fallback diagnostics. Exclusive execution owner: repair_physics_root/native_controllers. Source verification: tests/unit/physics/native-backend-support-path.test.ts. |
| CREATE | packages/physics/src/native/NativeSupportPath.ts | Certify native character support intervals with explicit unsupported geometry limits. Exclusive execution owner: repair_physics_root/native_controllers. Source verification: tests/unit/physics/native-backend-support-path.test.ts. |
| CREATE | tests/unit/physics/native-backend-continuous-step.test.ts | Verify ordered continuous impacts, sensor intervals and deterministic unsupported cases. Exclusive execution owner: repair_physics_root/native_queries. Source verification: tests/unit/physics/native-backend-continuous-step.test.ts. |
| CREATE | packages/physics/src/native/NativeContinuousStep.ts | Advance isolated native physics through ordered bounded continuous-collision events. Exclusive execution owner: repair_physics_root/native_queries. Source verification: tests/unit/physics/native-backend-continuous-step.test.ts. |
| CREATE | tests/unit/physics/native-backend-sleeping.test.ts | Verify native sleeping, wake propagation and deterministic transitions. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-sleeping.test.ts. |
| CREATE | packages/physics/src/native/NativeSleeping.ts | Implement isolated native sleep and wake lifecycle with deterministic island ownership. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-sleeping.test.ts. |
| CREATE | tests/unit/physics/native-backend-mass-properties.test.ts | Verify shape mass and inertia computations against independent numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-mass-properties.test.ts. |
| CREATE | tests/unit/physics/native-backend-ccd.test.ts | Verify continuous collision behavior and tunneling limits with independent numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-ccd.test.ts. |
| CREATE | packages/physics/src/native/NativeMassProperties.ts | Derive native mass and inertia properties under explicit compatible shape contracts. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-mass-properties.test.ts. |
| CREATE | packages/physics/src/native/NativeCCD.ts | Implement bounded native continuous collision detection for supported moving shapes. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-ccd.test.ts. |
| CREATE | tests/unit/physics/native-world-maturity.test.ts | Verify supported physics ownership, shape, constraint, world or vehicle behavior. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-world-maturity.test.ts. |
| CREATE | tests/unit/physics/native-vehicle-maturity.test.ts | Verify supported physics ownership, shape, constraint, world or vehicle behavior. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-vehicle-maturity.test.ts. |
| CREATE | tests/unit/physics/native-shape-joints.test.ts | Verify supported physics ownership, shape, constraint, world or vehicle behavior. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-shape-joints.test.ts. |
| CREATE | tests/unit/physics/native-rapier-maturity.test.ts | Verify supported physics ownership, shape, constraint, world or vehicle behavior. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-rapier-maturity.test.ts. |
| CREATE | tests/unit/physics/native-backend-controllers.test.ts | Verify native physics capability, lifecycle and compatibility with independently authored numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-controllers.test.ts. |
| CREATE | tests/unit/physics/native-backend-queries.test.ts | Verify native physics capability, lifecycle and compatibility with independently authored numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-queries.test.ts. |
| CREATE | tests/unit/physics/native-backend-constraints.test.ts | Verify native physics capability, lifecycle and compatibility with independently authored numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-constraints.test.ts. |
| CREATE | tests/unit/physics/native-backend-collision.test.ts | Verify native physics capability, lifecycle and compatibility with independently authored numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-collision.test.ts. |
| CREATE | tests/unit/physics/native-backend-integration.test.ts | Verify native physics capability, lifecycle and compatibility with independently authored numerical cases. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeVehicle.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeCharacter.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeQueries.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeJoints.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeContacts.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeMesh.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeConvex.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeCollision.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeBroadphase.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativeBody.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| CREATE | packages/physics/src/native/NativePhysicsWorld.ts | Implement and validate an independent synchronous native physics backend without downgrading current supported behaviors. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-backend-integration.test.ts. |
| MODIFY | packages/physics-rapier/src/rapierInit.lazy.ts | Avoid unintended backend initialization from non-physics root imports while preserving explicit initialization semantics. Exclusive execution owner: repair_physics_root. Source verification: optional-backend source graph and physics tests. |
| MODIFY | packages/physics-rapier/src/rapierInit.ts | Avoid unintended backend initialization from non-physics root imports while preserving explicit initialization semantics. Exclusive execution owner: repair_physics_root. Source verification: optional-backend source graph and physics tests. |
| MODIFY | packages/engine/src/agent-api/GameRuntime.ts | Keep root game APIs functional while isolating optional physics backend loading. Exclusive execution owner: repair_physics_root. Source verification: optional-backend source graph and physics tests. |
| MODIFY | tests/unit/physics-rapier/optional-boundary.test.ts | Verify the current installed optional backend boundary without stale removed entrypoint assumptions. Exclusive execution owner: repair_physics_root. Source verification: direct source test for this file. |
| MODIFY | packages/engine/src/agent-api/nodes/physics.ts | Stage per-entry physics-world factory binding while preserving current public behavior. Exclusive execution owner: repair_physics_root. Source verification: tests/unit/physics/native-entry-runtime-binding.test.ts. |
| MODIFY | packages/physics/src/PhysicsWorld.ts | Complete deterministic stepping, contacts, sensors, continuous collision and lifecycle behavior. |
| MODIFY | packages/physics/src/ScenePhysicsBridge.ts | Synchronize scene transforms, parent transforms and physics ownership safely. |
| MODIFY | packages/physics/src/Shape.ts | Complete supported primitive, convex, static-mesh and heightfield contracts. |
| MODIFY | packages/physics/src/Constraint.ts | Complete fixed, hinge, spring and motor joint behavior and unsupported diagnostics. |
| MODIFY | packages/physics/src/PhysicalVehicleController.ts | Complete wheel, contact, reset and disposal behavior. |
| MODIFY | packages/physics-rapier/src/index.ts | Document and enforce optional backend capabilities and teardown. |
| MODIFY | packages/engine/src/contracts/stubs/game.ts | Replace silent inert production behavior with a versioned actionable error directing callers to the full game entrypoint; preserve migration compatibility as documented. |
| MODIFY | packages/game/src/createGame.ts | Stage per-entry game factories bound to the corresponding physics provider. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | tests/unit/game/stub-create-game-headless.test.ts | Test the versioned diagnostic and supported full-entry migration. |
| MODIFY | tests/unit/game-runtime/game-kit-runtime-ownership.test.ts | Test deterministic game ownership, reset and disposal. |
| CREATE | tests/unit/physics/native-root-physics.test.ts | Cover collider types, joints, contacts, sensors, layers, reset and optional backends. |
| CREATE | tests/browser/native-game-physics.spec.ts | Exercise installed game input, physics, HUD, sound/FX lifecycle and replay. |
| MODIFY | packages/engine/src/agent-api/PhysicsRuntime.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |
| MODIFY | packages/game/src/session/GameSession.ts | Preserve session behavior while binding world lifecycle to the entry-specific provider. Exclusive execution owner: repair_isolated_physics_game. Source verification: tests/unit/physics/native-entry-game-binding.test.ts. |
| MODIFY | packages/game/src/evidence/beacon.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |
| MODIFY | packages/game/src/evidence/channel.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |
| MODIFY | packages/engine/src/agent-api/sceneMath.ts | Remove unintended legacy-root graph edges while preserving entry-specific physics and existing public behavior. Exclusive execution owner: repair_physics_graph_edges. Source verification: tests/unit/physics/native-isolated-graph-edges.test.ts. |
| MODIFY | tests/unit/physics/stress-scenes.test.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |
| MODIFY | tests/unit/physics/ccd-or-fast-body.test.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |
| MODIFY | tests/unit/game/stub-create-game-warning.test.ts | Correct joint transforms, game pause, concurrent evidence ownership, hierarchy and supported migration behavior. Exclusive execution owner: wp27_physics. Source verification: tests/unit/physics/native-root-physics.test.ts and targeted physics/game source tests. |

### WP-28 — Independent asset and format conformance

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/rendering/native-independent-dfg-fixture.test.ts | Verify the independent DFG fixture encoding, asymmetric sampling, channels and analytic quadrature. Exclusive execution owner: repair_native_dfg_fixture. Source verification: tests/unit/rendering/native-independent-dfg-fixture.test.ts. |
| CREATE | tests/qr/prd04/oracles/native-dfg-lut.ts | Provide a reproducible Aura-generated DFG fixture with explicit binary16 layout, provenance, axes, channels and digest. Exclusive execution owner: repair_native_dfg_fixture. Source verification: tests/unit/rendering/native-independent-dfg-fixture.test.ts. |
| CREATE | tests/fixtures/native-capabilities/manifest.json | Record each fixture's origin, license, digest, format version, expected outputs and limits. |
| CREATE | tests/assets/native-format-conformance.test.ts | Parse, decode and validate real supported fixtures and malformed variants, not only metadata. |
| CREATE | tests/browser/native-format-maturity.spec.ts | Render admitted supported formats and verify visible resources, failures and disposal. |
| CREATE | tests/unit/assets/native-texture-budget.test.ts | Verify actual returned/resident mip bytes, device isolation, duplicate labels and release. |
| CREATE | docs/assets/native-format-conformance.md | Publish supported combinations, fixture method, known losses and exact evidence. |

### WP-29 — Independent implementation and dependency provenance

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/math/native-independent-entry.test.ts | Verify internal independent math entry interoperation, supported depth conventions and lifecycle without claiming legacy compatibility. Exclusive execution owner: audit_math_contract_fit. Source verification: tests/unit/math/native-independent-entry.test.ts. |
| CREATE | packages/math/src/independent/mutable/index.ts | Provide a neutral internal entry for independently authored mutable math candidates with explicit supported projection conventions. Exclusive execution owner: audit_math_contract_fit. Source verification: tests/unit/math/native-independent-entry.test.ts. |
| CREATE | tests/unit/rendering/native-independent-brdf-shim.test.ts | Verify independent shader test primitives against analytic invariants and neutral interface requirements. Exclusive execution owner: independent_shader_brdf. Source verification: tests/unit/rendering/native-independent-brdf-shim.test.ts. |
| CREATE | tests/qr/prd04/shims/native-brdf.wgsl.ts | Implement independent WGSL test primitives from published physical equations and the neutral declaration contract. Exclusive execution owner: independent_shader_brdf. Source verification: tests/unit/rendering/native-independent-brdf-shim.test.ts. |
| CREATE | tests/qr/prd04/shims/native-brdf.glsl.ts | Implement independent GLSL test primitives from published physical equations and the neutral declaration contract. Exclusive execution owner: independent_shader_brdf. Source verification: tests/unit/rendering/native-independent-brdf-shim.test.ts. |
| CREATE | tests/unit/rendering/native-independent-shader-api.test.ts | Verify the neutral shader interface inventory excludes bodies, initializers and derived fixtures. Exclusive execution owner: audit_math_independence. Source verification: tests/unit/rendering/native-independent-shader-api.test.ts. |
| CREATE | docs/prds/aura3d-independent-shader-api.json | Record declaration-only shader and test-helper interfaces for independently authored replacements, with behavior and provenance unresolved. Exclusive execution owner: audit_math_independence. Source verification: tests/unit/rendering/native-independent-shader-api.test.ts. |
| CREATE | tests/unit/math/native-independent-algebra.test.ts | Verify independent mutable math implementations against cross-type algebraic and geometric invariants, aliasing and edge cases. Exclusive execution owner: audit_math_algebra. Source verification: tests/unit/math/native-independent-algebra.test.ts. |
| CREATE | tests/unit/math/native-mutable-intersections.test.ts | Verify independently derived mutable intersections semantics, edge cases and public declarations. Exclusive execution owner: repair_math_intersections. Source verification: tests/unit/math/native-mutable-intersections.test.ts. |
| CREATE | packages/math/src/independent/mutable/Triangle.ts | Implement the independently authored mutable Triangle public mathematical contract. Exclusive execution owner: repair_math_intersections. Source verification: tests/unit/math/native-mutable-intersections.test.ts. |
| CREATE | packages/math/src/independent/mutable/Frustum.ts | Implement the independently authored mutable Frustum public mathematical contract. Exclusive execution owner: repair_math_intersections. Source verification: tests/unit/math/native-mutable-intersections.test.ts. |
| CREATE | packages/math/src/independent/mutable/Ray.ts | Implement the independently authored mutable Ray public mathematical contract. Exclusive execution owner: repair_math_intersections. Source verification: tests/unit/math/native-mutable-intersections.test.ts. |
| CREATE | tests/unit/math/native-mutable-bounds.test.ts | Verify independently derived mutable bounds semantics, edge cases and public declarations. Exclusive execution owner: repair_math_bounds. Source verification: tests/unit/math/native-mutable-bounds.test.ts. |
| CREATE | packages/math/src/independent/mutable/Plane.ts | Implement the independently authored mutable Plane public mathematical contract. Exclusive execution owner: repair_math_bounds. Source verification: tests/unit/math/native-mutable-bounds.test.ts. |
| CREATE | packages/math/src/independent/mutable/Sphere.ts | Implement the independently authored mutable Sphere public mathematical contract. Exclusive execution owner: repair_math_bounds. Source verification: tests/unit/math/native-mutable-bounds.test.ts. |
| CREATE | packages/math/src/independent/mutable/Box3.ts | Implement the independently authored mutable Box3 public mathematical contract. Exclusive execution owner: repair_math_bounds. Source verification: tests/unit/math/native-mutable-bounds.test.ts. |
| CREATE | tests/unit/math/native-mutable-color.test.ts | Verify independently derived mutable color semantics, edge cases and public declarations. Exclusive execution owner: repair_math_color. Source verification: tests/unit/math/native-mutable-color.test.ts. |
| CREATE | packages/math/src/independent/mutable/Color.ts | Implement the independently authored mutable Color public mathematical contract. Exclusive execution owner: repair_math_color. Source verification: tests/unit/math/native-mutable-color.test.ts. |
| CREATE | tests/unit/math/native-mutable-rotations.test.ts | Verify independently derived mutable rotations semantics, edge cases and public declarations. Exclusive execution owner: repair_math_rotations. Source verification: tests/unit/math/native-mutable-rotations.test.ts. |
| CREATE | packages/math/src/independent/mutable/Euler.ts | Implement the independently authored mutable Euler public mathematical contract. Exclusive execution owner: repair_math_rotations. Source verification: tests/unit/math/native-mutable-rotations.test.ts. |
| CREATE | packages/math/src/independent/mutable/Quaternion.ts | Implement the independently authored mutable Quaternion public mathematical contract. Exclusive execution owner: repair_math_rotations. Source verification: tests/unit/math/native-mutable-rotations.test.ts. |
| CREATE | tests/unit/math/native-mutable-matrices.test.ts | Verify independently derived mutable matrices semantics, edge cases and public declarations. Exclusive execution owner: repair_math_matrices. Source verification: tests/unit/math/native-mutable-matrices.test.ts. |
| CREATE | packages/math/src/independent/mutable/Matrix4.ts | Implement the independently authored mutable Matrix4 public mathematical contract. Exclusive execution owner: repair_math_matrices. Source verification: tests/unit/math/native-mutable-matrices.test.ts. |
| CREATE | packages/math/src/independent/mutable/Matrix3.ts | Implement the independently authored mutable Matrix3 public mathematical contract. Exclusive execution owner: repair_math_matrices. Source verification: tests/unit/math/native-mutable-matrices.test.ts. |
| CREATE | tests/unit/math/native-mutable-vector4.test.ts | Verify independently derived mutable vector4 semantics, edge cases and public declarations. Exclusive execution owner: repair_math_vector4. Source verification: tests/unit/math/native-mutable-vector4.test.ts. |
| CREATE | packages/math/src/independent/mutable/Vector4.ts | Implement the independently authored mutable Vector4 public mathematical contract. Exclusive execution owner: repair_math_vector4. Source verification: tests/unit/math/native-mutable-vector4.test.ts. |
| CREATE | tests/unit/math/native-mutable-vector3.test.ts | Verify independently derived mutable vector3 semantics, edge cases and public declarations. Exclusive execution owner: repair_math_vector3. Source verification: tests/unit/math/native-mutable-vector3.test.ts. |
| CREATE | packages/math/src/independent/mutable/Vector3.ts | Implement the independently authored mutable Vector3 public mathematical contract. Exclusive execution owner: repair_math_vector3. Source verification: tests/unit/math/native-mutable-vector3.test.ts. |
| CREATE | tests/unit/math/native-mutable-vector2.test.ts | Verify independently derived mutable vector2 semantics, edge cases and public declarations. Exclusive execution owner: repair_math_vector2. Source verification: tests/unit/math/native-mutable-vector2.test.ts. |
| CREATE | packages/math/src/independent/mutable/Vector2.ts | Implement the independently authored mutable Vector2 public mathematical contract. Exclusive execution owner: repair_math_vector2. Source verification: tests/unit/math/native-mutable-vector2.test.ts. |
| CREATE | tests/unit/math/native-oriented-box.test.ts | Verify independent oriented-box intersection, degeneracy, transforms and analytic geometric invariants. Exclusive execution owner: repair_math_obb. Source verification: tests/unit/math/native-oriented-box.test.ts. |
| CREATE | packages/math/src/independent/OrientedBox.ts | Implement independently authored oriented-box queries and transforms from geometric invariants. Exclusive execution owner: repair_math_obb. Source verification: tests/unit/math/native-oriented-box.test.ts. |
| MODIFY | packages/math/src/ConvexHull.ts | Replace derived hull material only after independently authored behavior and public compatibility are verified. Exclusive execution owner: repair_math_hull. Source verification: tests/unit/math/native-convex-hull.test.ts. |
| CREATE | tests/unit/math/native-convex-hull.test.ts | Verify independent hull orientation, containment, degeneracy, topology and numerical bounds. Exclusive execution owner: repair_math_hull. Source verification: tests/unit/math/native-convex-hull.test.ts. |
| CREATE | packages/math/src/independent/ConvexHull.ts | Implement independently authored bounded convex hull construction with explicit degeneracy and lifecycle semantics. Exclusive execution owner: repair_math_hull. Source verification: tests/unit/math/native-convex-hull.test.ts. |
| MODIFY | packages/math/src/ShapeUtils.ts | Replace derived triangulation material only after independently authored behavior and public compatibility are verified. Exclusive execution owner: repair_math_triangulation. Source verification: tests/unit/math/native-polygon-triangulation.test.ts. |
| CREATE | tests/unit/math/native-polygon-triangulation.test.ts | Verify independent triangulation of simple, concave, holed, degenerate and malformed inputs against analytic invariants. Exclusive execution owner: repair_math_triangulation. Source verification: tests/unit/math/native-polygon-triangulation.test.ts. |
| CREATE | packages/math/src/independent/PolygonTriangulation.ts | Implement independently authored bounded polygon and hole triangulation using documented mathematical contracts. Exclusive execution owner: repair_math_triangulation. Source verification: tests/unit/math/native-polygon-triangulation.test.ts. |
| CREATE | tests/unit/math/native-independent-api-contract.test.ts | Verify the neutral math API inventory preserves declarations, overloads, fields and explicit contract boundaries. Exclusive execution owner: audit_math_independence. Source verification: tests/unit/math/native-independent-api-contract.test.ts. |
| CREATE | docs/prds/aura3d-independent-math-api.json | Record a declaration-only public math contract for independently authored replacements without carrying implementation bodies or derived fixtures. Exclusive execution owner: audit_math_independence. Source verification: tests/unit/math/native-independent-api-contract.test.ts. |
| CREATE | tools/native-runtime-audit/dependency-graph.ts | Enumerate all workspace dependency fields, aliases, overrides, lock snapshots, peer edges and package payloads. |
| CREATE | tools/native-runtime-audit/source-evidence.ts | Identify review candidates in source, generated data, maps and binaries; report provenance without asserting that a fingerprint proves authorship. |
| CREATE | tools/native-runtime-audit/runtime-network.ts | Inspect permitted runtime network events for external engine implementation fetches. |
| CREATE | tests/unit/tools/native-runtime-audit.test.ts | Exercise direct/transitive/alias/optional/peer dependencies, embedded data, review candidates and false positives. |
| CREATE | tests/browser/native-offline-independence.spec.ts | Verify a clean packed consumer runs offline without fetching an external engine implementation. |
| MODIFY | tests/qr/prd04/unit/uv-transform-matrix.test.ts | Replace reference-dependent fixtures with independently derived UV expectations. |
| MODIFY | tests/qr/prd04/unit/mikktspace-tangents.test.ts | Use independently licensed tangent fixtures or a standalone authorized codec. |
| CREATE | tests/unit/tools/native-runtime-audit-dependency-graph.test.ts | Test direct, transitive, aliased, peer and optional dependency detection. Exclusive execution owner: wp29_provenance/dependency_graph. Source verification: Direct Vitest for this file. |

### WP-30 — Clipping, camera projection and depth precision

| Action | File | Required change |
| --- | --- | --- |
| CREATE | tests/unit/agent-api/native-material-clipping-invalidation.test.ts | Verify material replacement and live clipping updates invalidate only the owning app and unsubscribe on disposal. Exclusive execution owner: repair_splat_runtime. Source verification: tests/unit/agent-api/native-material-clipping-invalidation.test.ts. |
| CREATE | tests/unit/agent-api/native-batched-clipping.test.ts | Verify clipping, member identity and query behavior for supported batched scenes. Exclusive execution owner: repair_query_batches. Source verification: tests/unit/agent-api/native-batched-clipping.test.ts. |
| CREATE | tests/unit/agent-api/native-line-clipping.test.ts | Verify clipping survives compiled line, point and sprite paths or reports precise unsupported combinations. Exclusive execution owner: repair_clip_lines. Source verification: tests/unit/agent-api/native-line-clipping.test.ts. |
| CREATE | tests/unit/agent-api/native-clipping-authoring.test.ts | Verify scene and material clipping authoring, validation, defaults and serialization. Exclusive execution owner: repair_clipping_authoring. Source verification: tests/unit/agent-api/native-clipping-authoring.test.ts. |
| CREATE | tests/unit/rendering/native-depth-geometry-matrix.test.ts | Verify geometry, instance and model transforms match in clipping, camera depth and shadow depth. Exclusive execution owner: repair_depth_graph. Source verification: tests/unit/rendering/native-depth-geometry-matrix.test.ts. |
| CREATE | tests/unit/rendering/native-renderer-clipping.test.ts | Verify scene clipping, per-item snapshots, forward, shadow and depth consistency through Renderer. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-renderer-clipping.test.ts. |
| MODIFY | packages/rendering/src/contracts/renderSource.ts | Carry validated scene clipping groups through renderer frame-source contracts. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-renderer-clipping.test.ts. |
| CREATE | tests/unit/rendering/native-forward-clipping.test.ts | Verify per-draw global and material clipping through generated forward shaders and backend bindings. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-forward-clipping.test.ts. |
| CREATE | tests/unit/rendering/native-renderer-msaa-depth.test.ts | Verify renderer depth sample negotiation, resolved publication, incompatible consumers, diagnostics and cleanup. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-renderer-msaa-depth.test.ts. |
| CREATE | tests/unit/rendering/native-frame-depth-requirements.test.ts | Verify live versus resolved depth requirements, provider identity, mutation and per-frame isolation. Exclusive execution owner: repair_frame_depth. Source verification: tests/unit/rendering/native-frame-depth-requirements.test.ts. |
| CREATE | packages/rendering/src/renderer/FrameDepthRequirements.ts | Classify frame depth needs using verified provider identities and fail closed on unknown or mutable contributors. Exclusive execution owner: repair_frame_depth. Source verification: tests/unit/rendering/native-frame-depth-requirements.test.ts. |
| MODIFY | tests/unit/rendering/renderer-frame-target-reuse.test.ts | Verify renderer and shadow target ownership and reuse by behavior across caller-provided and fallback targets. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/renderer-frame-target-reuse.test.ts. |
| CREATE | tests/unit/rendering/native-shadow-checked.test.ts | Verify native shadow publication requires successful checked caster draws and preserves cleanup, retry and camera propagation. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/native-shadow-checked.test.ts. |
| MODIFY | packages/rendering/src/shadows/Prd02ShadowsContributor.ts | Propagate the captured frame clock consistently to shadow updates. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/shadow-camera-position.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-color-region-copy.test.ts | Verify bounded native color attachment region copies, submission order and resource lifetime. Exclusive execution owner: repair_splat_device_adapter. Source verification: tests/unit/rendering/native-webgpu-color-region-copy.test.ts. |
| CREATE | tests/unit/rendering/native-depth-integer-joints.test.ts | Verify type-aware native depth joint attribute variants and invalid-layout handling. Exclusive execution owner: repair_depth_wgsl. Source verification: tests/unit/rendering/native-depth-integer-joints.test.ts. |
| MODIFY | packages/rendering/src/shadows/Prd02ShadowBridge.ts | Propagate the scene camera eye into atlas and cascaded shadow updates. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/shadow-camera-position.test.ts. |
| MODIFY | packages/rendering/src/CascadedShadowMaps.ts | Preserve camera eye and invalidate incomplete or stale cascades after failed caster draws. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/native-shadow-checked.test.ts and tests/unit/rendering/shadow-camera-position.test.ts. |
| CREATE | tests/unit/rendering/shadow-camera-position.test.ts | Verify main camera position and shadow clip convention across depth pass callers. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/shadow-camera-position.test.ts. |
| MODIFY | packages/rendering/src/renderer/OutlineTargets.ts | Propagate scene camera position to depth-dependent outline passes. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/shadow-camera-position.test.ts. |
| MODIFY | packages/rendering/src/shadows/ShadowSystem.ts | Preserve camera eye and require checked caster draws before publishing cascade and atlas shadow results. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/native-shadow-checked.test.ts and tests/unit/rendering/shadow-camera-position.test.ts. |
| MODIFY | packages/rendering/src/renderer/ShadowOrchestration.ts | Carry the scene camera eye into directional and point shadow passes. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/shadow-camera-position.test.ts. |
| MODIFY | packages/rendering/src/ShadowPass.ts | Preserve scene-camera propagation and require checked native caster submissions before publishing shadow results. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/native-shadow-checked.test.ts. |
| MODIFY | tests/unit/gu47/ed/custom-cast-shadow-instancing.test.ts | Verify custom shadow passes encode depth while preserving instance and deformation behavior. Exclusive execution owner: repair_depth_graph. Source verification: tests/unit/gu47/ed/custom-cast-shadow-instancing.test.ts. |
| CREATE | tests/unit/rendering/depth-pass-graph-integration.test.ts | Verify effective custom graph shadow uniforms, camera/depth conventions and multi-stream draw binding. Exclusive execution owner: repair_depth_graph. Source verification: tests/unit/rendering/depth-pass-graph-integration.test.ts. |
| CREATE | packages/engine/src/agent-api/nodes/clipping.ts | Provide validated clipping-group change notifications with safe lifecycle behavior. Exclusive execution owner: repair_clipping_authoring. Source verification: tests/unit/agent-api/native-clipping-authoring.test.ts. |
| CREATE | packages/rendering/src/ClippingPlanes.ts | Transform and bound plane sets; produce shared forward/depth/shadow bindings for each supported primitive and backend. |
| MODIFY | packages/engine/src/agent-api/ApplicationKits.ts | Replace the section-view exclusion with the implemented clipping path; retain unrelated measurement limits until exact queries support them. Retarget the rounding helper to the provider-neutral runtime core. Exclusive execution owner: repair_physics_barrel_edges. Source verification: tests/unit/engine/application-kits.test.ts and tests/unit/physics/native-v5-entry.test.ts. |
| MODIFY | packages/rendering/src/DepthPass.ts | Apply the same clipping and depth convention to depth/shadow outputs for skinned, morphed, instanced and displaced geometry. |
| CREATE | tests/unit/rendering/scene-raster-snapshot.test.ts | Verify scene-raster matrix, projection, viewport, frame and lifecycle contracts across depth and shadow views. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/scene-raster-snapshot.test.ts. |
| CREATE | packages/rendering/src/renderer/SceneRasterSnapshot.ts | Define validated immutable scene-raster camera, viewport, jitter and frame identity for specialized depth and shadow geometry. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/scene-raster-snapshot.test.ts. |
| CREATE | tests/unit/rendering/native-scene-raster-participant-lease.test.ts | Verify participant lifecycle, mutation, callback and resource snapshot contracts. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-scene-raster-participant-lease.test.ts. |
| CREATE | packages/rendering/src/renderer/SceneRasterParticipantLease.ts | Stage participant identity and resource snapshot contracts for specialized raster/depth paths. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-scene-raster-participant-lease.test.ts. |
| CREATE | tests/unit/rendering/scene-raster-lease.test.ts | Verify scene-raster plan lifecycle, cancellation, generation, stale state and single consumption. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/scene-raster-lease.test.ts. |
| CREATE | packages/rendering/src/renderer/SceneRasterLease.ts | Bind temporal planning and scene-raster frame lifetime without authorizing unverified rendering participants. Exclusive execution owner: repair_shadow_camera. Source verification: tests/unit/rendering/scene-raster-lease.test.ts. |
| CREATE | tests/unit/rendering/native-specialized-depth-shader.test.ts | Verify specialized depth shader coordinates, coverage, clipping, bounds and unsupported inputs. Exclusive execution owner: repair_special_depth_shader. Source verification: tests/unit/rendering/native-specialized-depth-shader.test.ts. |
| CREATE | packages/rendering/src/shadows/SpecializedDepthShader.ts | Build depth and shadow shader variants for clipped screen lines, points and sprites with explicit camera, coverage and resource contracts. Exclusive execution owner: repair_special_depth_shader. Source verification: tests/unit/rendering/native-specialized-depth-shader.test.ts. |
| MODIFY | packages/math/src/Matrix4.ts | Add convention-aware perspective/orthographic projections, supported infinite far, asymmetric frusta and physical/tiled view construction. |
| MODIFY | packages/math/src/Frustum.ts | Extract and test planes for supported clip/depth ranges and optional unbounded far distance. |
| MODIFY | packages/scene/src/MathTypes.ts | Thread projection metadata and depth conventions through scene tuple math. |
| MODIFY | packages/scene/src/Camera.ts | Keep projection, inverse projection and culling metadata coherent after updates. |
| MODIFY | packages/scene/src/PerspectiveCamera.ts | Add focal-length/film controls, view offsets and depth options while preserving current FOV defaults. |
| MODIFY | packages/scene/src/OrthographicCamera.ts | Add tiled view offsets and projection-appropriate near/far validation including supported near-zero behavior. |
| MODIFY | packages/engine/src/agent-api/RootRuntimeSupport.ts | Validate perspective and orthographic cameras according to their actual projection contracts; pass view and depth metadata. |
| MODIFY | packages/rendering/src/renderer/FrameGraph.ts | Carry explicit projection/depth metadata instead of recovering every mode from conventional finite-matrix coefficients. |
| CREATE | packages/rendering/src/DepthConvention.ts | Centralize clip range, clear/compare, bias, reconstruction and negotiated standard/reversed/logarithmic depth behavior. |
| CREATE | tests/unit/rendering/native-clipping.test.ts | Test half-spaces, transforms, union/intersection, invalid planes, bounds, lifecycle and backend limits. |
| CREATE | tests/unit/rendering/native-camera-depth.test.ts | Test projection/inverse reconstruction, culling, large range, infinite far, tiled seams and physical lens math. |
| CREATE | tests/browser/native-clipping.spec.ts | Verify visible cuts, material groups, matching shadows/depth and supported line/point/sprite behavior through packed root APIs. |
| CREATE | tests/browser/native-camera-depth.spec.ts | Verify near/mid/far geometry, tiled views, depth-aware effects and shadows in each supported depth mode. |
| MODIFY | packages/rendering/src/shadows/Prd02DepthShaderLibrary.ts | Apply explicit clipping and depth conventions to forward, shadow and deformed geometry shaders. Exclusive execution owner: wp30_depth. Source verification: tests/unit/rendering/native-clipping.test.ts; tests/unit/rendering/native-camera-depth.test.ts. |
| CREATE | tests/unit/rendering/native-depth-alpha-coverage.test.ts | Verify material, texture, vertex and member alpha coverage and explicit unsupported depth variants. Exclusive execution owner: repair_depth_wgsl. Source verification: tests/unit/rendering/native-depth-alpha-coverage.test.ts. |
| MODIFY | packages/rendering/src/ShaderLibraryCore.ts | Apply explicit clipping and depth conventions to forward, shadow and deformed geometry shaders. Exclusive execution owner: wp30_depth. Source verification: tests/unit/rendering/native-clipping.test.ts; tests/unit/rendering/native-camera-depth.test.ts. |
| MODIFY | tests/unit/engine/application-kits.test.ts | Regress supported clipping/section view options. Exclusive execution owner: wp30_depth. Source verification: Direct Vitest for this file. |
| MODIFY | tests/unit/agent-api/camera-clipping.test.ts | Regress declared infinite perspective and depth-convention support. Exclusive execution owner: wp30_depth. Source verification: Direct Vitest for this file. |

### WP-31 — Draw-state fidelity and transparency

| Action | File | Required change |
| --- | --- | --- |
| CREATE | packages/rendering/src/renderer/BatchExecutionTrust.ts | Fail closed for batching until backend submission and frame callback provenance are proven. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| MODIFY | packages/rendering/src/batching/shaders/drawId.glsl.ts | Select the per-draw uniform index in fallback mode and reserve extension draw IDs only for verified combined submission. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/batch-multidraw.test.ts. |
| CREATE | tests/unit/rendering/native-packed-loop-color.test.ts | Verify packed-loop per-member color, alpha, shader selection and linked source behavior. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-packed-loop-color.test.ts. |
| CREATE | packages/rendering/src/batching/shaders/packedLoopColor.glsl.ts | Provide independently authored per-member color and alpha shader hooks for synchronous packed-loop draws. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/native-packed-loop-color.test.ts. |
| CREATE | packages/rendering/src/batching/BatchMembers.ts | Retain ordered logical batch members as private fallback provenance without authorizing batching; preserve per-pass ordering and callback behavior. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| CREATE | tests/unit/rendering/native-batch-loop-resources.test.ts | Verify packed-loop source-byte invalidation, translated ranges, retained pool generations and disposal. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batch-loop-resources.test.ts. |
| MODIFY | packages/rendering/src/webgl2/DeviceHost.ts | Preserve host ownership and explicit mutable-context limitations for future safe paired submission. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-webgl-batch-capability.test.ts. |
| MODIFY | packages/rendering/src/webgl2/Counters.ts | Preserve counter wrappers and accounting for future safe paired submission. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-webgl-batch-capability.test.ts. |
| MODIFY | packages/rendering/src/WebGL2StateCache.ts | Preserve exact observable state and cache ownership for future safe paired submission. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-webgl-batch-capability.test.ts. |
| CREATE | tests/unit/rendering/native-webgl-batch-capability.test.ts | Verify unavailable capability, state transitions, no replay and override-preserving fallback. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-webgl-batch-capability.test.ts. |
| CREATE | packages/rendering/src/webgl2/BatchExecutionCapability.ts | Stage a negative-by-default paired submission capability with explicit state and failure ownership. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/native-webgl-batch-capability.test.ts. |
| CREATE | tests/unit/rendering/native-static-batch-unlit-shader.test.ts | Verify static batch shader matrices, fragment and vertex attributes, actual capability inputs and rejection boundaries. Exclusive execution owner: repair_static_batch_shader. Source verification: tests/unit/rendering/native-static-batch-unlit-shader.test.ts. |
| CREATE | packages/rendering/src/webgl2/StaticBatchUnlitShader.ts | Stage an independent fixed-pair unlit batch shader using exact ordered Float32 MVPs and the existing fragment contract. Exclusive execution owner: repair_static_batch_shader. Source verification: tests/unit/rendering/native-static-batch-unlit-shader.test.ts. |
| MODIFY | packages/rendering/src/batching/DrawDataTexture.ts | Document numeric visibility flag decoding and release restore registrations during disposal or failed batch construction. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| MODIFY | tests/qr/prd15/unit/per-renderer-flags.test.ts | Verify earlier URL overrides, default-on sub-flags and per-renderer isolation using the established precedence contract. Exclusive execution owner: repair_qr_flags. Source verification: tests/qr/prd15/unit/per-renderer-flags.test.ts. |
| MODIFY | tests/unit/rendering/batch-multidraw.test.ts | Verify ordinary multi-draw batching and safe observer bypass with immutable engine-created flag snapshots. Exclusive execution owner: repair_pbr_shader. Source verification: tests/unit/rendering/batch-multidraw.test.ts. |
| MODIFY | packages/rendering/src/renderer/coreOutputPostRoute.ts | Preserve trusted immutable flag identity through output-route derivation while retaining custom flag behavior. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-replay-vfx.test.ts. |
| MODIFY | tests/unit/contracts/C-00-flags.test.ts | Verify trusted app flag snapshots preserve resolution and prevent mutable or stateful activation bypasses. Exclusive execution owner: repair_qr_flags. Source verification: tests/unit/contracts/C-00-flags.test.ts. |
| MODIFY | packages/engine/src/contracts/flags.ts | Resolve app flags through immutable trusted snapshots while preserving precedence, defaults and mixer behavior. Exclusive execution owner: repair_qr_flags. Source verification: tests/unit/contracts/C-00-flags.test.ts. |
| MODIFY | packages/rendering/src/contracts/core.ts | Capture immutable registry activation metadata and expose side-effect-free potential-activity checks for safe batching. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| MODIFY | packages/rendering/src/contracts/shadows.ts | Expose metadata-free depth-feature registry presence so batching can fail closed before evaluating provider accessors. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| CREATE | tests/unit/rendering/native-batching-semantics.test.ts | Verify both batching entrypoints preserve logical item identity, features, culling, transforms and lifecycle across compatible and incompatible draws. Exclusive execution owner: repair_vertex_buffers/batch_vertex_bytes. Source verification: tests/unit/rendering/native-batching-semantics.test.ts. |
| MODIFY | tests/unit/rendering/current-routes-webgl2-hot-path.test.ts | Restore mock context uniform-block APIs while retaining all current rendering hot-path regression assertions. Exclusive execution owner: repair_webgl_stencil. Source verification: tests/unit/rendering/current-routes-webgl2-hot-path.test.ts. |
| MODIFY | tests/unit/rendering/render-state-leaks.test.ts | Preserve render-state and attachment lifecycle checks for packed depth-stencil allocation and deterministic stencil clearing. Exclusive execution owner: repair_webgl_streaming. Source verification: tests/unit/rendering/render-state-leaks.test.ts. |
| CREATE | tests/unit/rendering/native-stencil-targets.test.ts | Cover native framebuffer stencil allocation, state, clear and disposal with independent device-shaped source tests. Exclusive execution owner: repair_webgl_stencil. Source verification: tests/unit/rendering/native-stencil-targets.test.ts. |
| MODIFY | packages/rendering/src/IndexBuffer.ts | Own uploaded index buffers per device and correctly invalidate, recreate and dispose them. Exclusive execution owner: repair_native_point_geometry. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |
| MODIFY | packages/rendering/src/renderer/InterleavedTransparentPass.ts | Honor splat and mesh layer, culling and render-order semantics in transparent submissions. Exclusive execution owner: repair_post_temporal. Source verification: tests/unit/rendering/native-gaussian-splat-renderer.test.ts. |
| MODIFY | tests/unit/rendering/renderer.test.ts | Verify static batch eligibility without losing observable per-item overrides and labels. Exclusive execution owner: repair_vertex_buffers. Source verification: tests/unit/rendering/renderer.test.ts. |
| MODIFY | tests/unit/rendering/skinned-joint-bounds.test.ts | Use the current typed asset load context while retaining existing skinned bounds regressions. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/skinned-joint-bounds.test.ts. |
| MODIFY | packages/rendering/src/renderer/SkinnedBounds.ts | Invalidate skinned bounds when geometry, attribute stream identity or revisions change. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/native-vertex-deformation.test.ts. |
| CREATE | tests/unit/rendering/native-mesh-consolidation-streams.test.ts | Verify typed normalized streams, layouts, indices, transformations and resource ownership during consolidation. Exclusive execution owner: repair_mesh_consolidation. Source verification: tests/unit/rendering/native-mesh-consolidation-streams.test.ts. |
| MODIFY | packages/rendering/src/MeshConsolidation.ts | Preserve typed and separate vertex streams during static consolidation and deindexing or fail unsupported cases explicitly. Exclusive execution owner: repair_mesh_consolidation. Source verification: tests/unit/rendering/native-mesh-consolidation-streams.test.ts. |
| CREATE | tests/unit/rendering/native-vertex-deformation.test.ts | Verify normalized multi-stream deformation, skinning and query behavior with source mocks. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/native-vertex-deformation.test.ts. |
| MODIFY | packages/rendering/src/SkinningBounds.ts | Evaluate skinned bounds using decoded attributes from the correct vertex streams. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/native-vertex-deformation.test.ts. |
| MODIFY | packages/rendering/src/MorphTarget.ts | Preserve typed normalized values and separate streams during CPU morph evaluation. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/native-vertex-deformation.test.ts. |
| MODIFY | packages/rendering/src/forward/Deform.ts | Read normalized values and geometry attribute streams correctly during CPU deformation. Exclusive execution owner: repair_vertex_cpu. Source verification: tests/unit/rendering/native-vertex-deformation.test.ts. |
| MODIFY | packages/rendering/src/forward/DrawSubmit.ts | Propagate typed vertex and instance streams to actual draw submissions. Exclusive execution owner: repair_vertex_buffers. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |
| MODIFY | packages/rendering/src/RenderPipeline.ts | Carry separate typed vertex streams and instance step semantics through draw command creation. Exclusive execution owner: repair_vertex_buffers. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |
| MODIFY | packages/rendering/src/program/MaterialFeatures.ts | Select physical detail-map shader features and UV channels from live material bindings. Exclusive execution owner: repair_pbr_shader. Source verification: physical shader and material source tests. |
| MODIFY | packages/rendering/src/Material.ts | Validate complete render-state combinations and backend requirements; version any change to currently rejected blended depth writes. |
| MODIFY | packages/rendering/src/contracts/blend.ts | Define full named/custom blend, depth and alpha semantics consumed by both devices. |
| MODIFY | packages/rendering/src/VertexFormat.ts | Support typed/normalized integer inputs, alignment, separate streams and per-instance step modes. |
| MODIFY | packages/rendering/src/webgl2/MultiDraw.ts | Bind expanded vertex layouts and preserve/reset full render state across draws, views and targets. Exclusive execution owner: repair_webgl_streaming. |
| MODIFY | packages/rendering/src/ForwardPass.ts | Carry complete state, clipping, depth and ordering into actual draw submissions. |
| MODIFY | packages/rendering/src/program/ProgramGenerator.ts | Integrate clipping/depth/color and graph outputs; preserve independently implemented generation and complete variant dependencies. |
| MODIFY | packages/rendering/src/program/ProgramFeatures.ts | Represent shader-affecting material, geometry, clipping and target features consistently. |
| MODIFY | packages/rendering/src/program/ProgramKey.ts | Include all shader-affecting fields, separate device/target generations and avoid recompiling for ordinary uniform changes. |
| MODIFY | packages/rendering/src/performance/RenderItemSorting.ts | Preserve stable ordering and explicit overrides across opaque, masked, transmissive and blended buckets. |
| CREATE | packages/rendering/src/webgpu/NativeRenderState.ts | Map full draw state to native pipeline/dynamic state and a deterministic cache key including attachment/layout requirements. |
| CREATE | packages/rendering/src/transparency/WeightedTransparency.ts | Implement bounded weighted accumulation/revealage with opaque-depth testing, composition, per-view lifetime and explicit sorted fallback. |
| CREATE | tests/unit/rendering/native-render-state.test.ts | Test every supported state, variant key, integer/normalized layout, separate instance stream and invalid combination. |
| CREATE | tests/unit/rendering/native-transparency.test.ts | Test accumulation/composition math, order stability, fallback, formats, alpha, MSAA and ownership. |
| CREATE | tests/browser/native-render-state.spec.ts | Pixel-check culling, custom blend, stencil, color masks, polygon offset, depth comparison and instance data on each backend. |
| CREATE | tests/browser/native-transparency.spec.ts | Render intersecting layers in permuted submission order, compare bounded output, and verify depth/transmission fallback, views and cleanup. |
| MODIFY | packages/rendering/src/contracts/program.ts | Carry graph variant identity and preserve rendering state through static merge planning. Exclusive execution owner: wp31_recovery. Source verification: tests/unit/rendering/native-render-state.test.ts. |
| MODIFY | packages/rendering/src/batching/StaticMergePlanner.ts | Carry graph variant identity and preserve rendering state through static merge planning. Exclusive execution owner: wp31_recovery. Source verification: tests/unit/rendering/native-render-state.test.ts. |
| MODIFY | packages/rendering/src/VertexBuffer.ts | Support typed buffer reads, writes, safe uploads and stream validation. Exclusive execution owner: repair_native_point_geometry. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |
| CREATE | tests/unit/rendering/native-vertex-buffer.test.ts | Regress raw typed byte storage and upload lifecycle. Exclusive execution owner: wp31_recovery/vertex_buffer. Source verification: Direct Vitest for this file. |
| MODIFY | packages/rendering/src/contracts/renderItem.ts | Carry temporal identity and global/material clipping through draw-item contracts. Exclusive execution owner: wp31_recovery. Source verification: tests/unit/rendering/native-clipping.test.ts; tests/unit/rendering/native-temporal-frames.test.ts. |
| MODIFY | packages/rendering/src/batching/BatchedGeometryPool.ts | Preserve typed buffer bytes during batching or explicitly reject unsupported layouts. Exclusive execution owner: wp31_recovery/vertex_buffer. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |
| MODIFY | packages/rendering/src/batching/ContentKeys.ts | Use byte-preserving format-aware hash and equality for batch identities. Exclusive execution owner: wp31_recovery/vertex_buffer. Source verification: tests/unit/rendering/native-vertex-buffer.test.ts. |

### WP-32 — Color pipeline and dynamic texture fidelity

| Action | File | Required change |
| --- | --- | --- |
| MODIFY | tests/qr/prd01/unit/output-pass.test.ts | Verify output shader operators and color conversion through current independently authored contracts. Exclusive execution owner: repair_gpu_output. Source verification: tests/qr/prd01/unit/output-pass.test.ts. |
| CREATE | tests/unit/rendering/native-webgpu-output.test.ts | Verify native output shader variants and portable binding contracts with independent source cases. Exclusive execution owner: repair_gpu_output. Source verification: tests/unit/rendering/native-webgpu-output.test.ts. |
| CREATE | packages/rendering/src/output/ToneMappingOperators.wgsl.ts | Implement native output color, alpha, coverage, overlay and tone operator shader variants. Exclusive execution owner: repair_gpu_output. Source verification: tests/unit/rendering/native-webgpu-output.test.ts. |
| CREATE | tests/unit/rendering/native-bc1-image.test.ts | Verify opaque BC1 image conversion, backend format negotiation and ownership. Exclusive execution owner: repair_bc1_texture. Source verification: tests/unit/rendering/native-bc1-image.test.ts. |
| MODIFY | tests/qr/prd01/unit/output-surface.test.ts | Regress output policy validation and runtime updates. Exclusive execution owner: repair_post_device. Source verification: direct source test for this file. |
| MODIFY | packages/rendering/src/contracts/post.ts | Carry output color and alpha policy through the postprocess pipeline. Exclusive execution owner: repair_post_device. Source verification: output policy source tests. |
| MODIFY | packages/engine/src/agent-api/app/mountRenderer.ts | Forward validated output policy to the actual production renderer mount. Exclusive execution owner: repair_isolated_physics_app. Source verification: output policy source tests. |
| MODIFY | packages/engine/src/production-runtime/index.ts | Forward validated app output color-space and alpha policy to renderer creation. Exclusive execution owner: repair_post_device. Source verification: output policy and renderer source tests. |
| MODIFY | packages/engine/src/lanes/prd01/outputSurface.ts | Validate and propagate app output policy through the public output surface. Exclusive execution owner: repair_post_device. Source verification: output policy and postprocessing source tests. |
| MODIFY | packages/engine/src/agent-api/postBridge.ts | Forward validated output color and alpha policy through postprocessing and runtime updates. Exclusive execution owner: repair_post_device. Source verification: output policy and postprocessing source tests. |
| MODIFY | packages/engine/src/contracts/output.ts | Expose app output color-space and alpha policy consistently with runtime lowering. Exclusive execution owner: repair_shared_types. Source verification: color management source tests. |
| MODIFY | packages/rendering/src/ColorManagement.ts | Separate transfer, primaries and scene/display domains; preserve extended-range linear values and implement independently derived color transforms. |
| MODIFY | packages/rendering/src/production-runtime/color/ColorManagement.ts | Reuse the shared conversion path and remove type-only claims of unsupported color spaces. |
| MODIFY | packages/rendering/src/output/OutputPass.ts | Negotiate output color space and apply one final tone/gamut/transfer transform with explicit alpha handling. |
| MODIFY | packages/rendering/src/RendererVisualPipelineReport.ts | Report actual negotiated color/output capabilities and fallback; keep physical HDR display distinct from float intermediates. |
| MODIFY | packages/rendering/src/webgl2/TextureUpload.ts | Preserve source color/unpack state and existing dynamic updates; implement declared layer/mip/subregion variants with correct storage reuse and context isolation. |
| MODIFY | packages/engine/src/agent-api/app/colorManagement.ts | Expose app-scoped output policy while preserving the default sRGB behavior. |
| CREATE | tests/unit/rendering/native-color-management.test.ts | Test known primaries, HDR identity, transfer round trips, alpha/data-map behavior and invalid inputs. |
| CREATE | tests/unit/rendering/native-dynamic-textures.test.ts | Test retained update/storage identity, source orientation, layer/mip/range validation, media frame lifetime and disposal. |
| CREATE | tests/browser/native-color-output.spec.ts | Verify texture-to-lighting-to-post-to-presentation/readback and truthful wide-gamut fallback through packed APIs. |
| CREATE | tests/browser/native-dynamic-textures.spec.ts | Verify changing video/canvas/data pixels, dimension changes, layer/mip updates, app isolation and resource cleanup. |
| MODIFY | packages/rendering/src/contracts/output.ts | Expose negotiated output and correct 3D texture sampling and format behavior. Exclusive execution owner: wp32_color. Source verification: tests/unit/rendering/native-color-management.test.ts; tests/unit/rendering/native-dynamic-textures.test.ts. |
| MODIFY | packages/rendering/src/webgl2/Samplers.ts | Expose negotiated output and correct 3D texture sampling and format behavior. Exclusive execution owner: wp32_color. Source verification: tests/unit/rendering/native-color-management.test.ts; tests/unit/rendering/native-dynamic-textures.test.ts. |
| MODIFY | packages/rendering/src/webgl2/TextureFormats.ts | Expose negotiated output and correct 3D texture sampling and format behavior. Exclusive execution owner: wp32_color. Source verification: tests/unit/rendering/native-color-management.test.ts; tests/unit/rendering/native-dynamic-textures.test.ts. |

WP-30/31/32 submit shared integration requests to the existing owners of Renderer.ts (WP-02), WebGPUDevice.ts (WP-03), material/texture/RenderDevice contracts (WP-05), temporal/tone shaders (WP-06), WebGL2Device.ts (WP-21) and public types/barrels (WP-19). A request must name the exact field, call site and contract test. It does not grant duplicate file ownership.

## 5. Detailed, parallelizable tasklist

Execution order: (1) WP-00 records current capability status and exact ownership; (2) P0 isolation, asset ownership and independent-source corrections run alongside backend contracts; (3) feature lanes complete native runtime paths; (4) integration, source tests, packed-consumer checks and code freeze complete; (5) remote device, live and publication acceptance are recorded separately. WPs 01–32 run in parallel whenever their file sets and contracts are independent. WP-19 alone edits shared manifests, barrels and shared types; WP-20 owns shared source/browser execution infrastructure. No lane overwrites another lane's files.

**Phase rule for every checklist below:** implementation, fixture/spec authoring and source tests run in Phase A. Instructions to render, capture pixels, open a browser, measure frames or verify an actual device/session run in Phase B only. WPs have independent source-completion and acceptance statuses; a browser result is not a prerequisite for finishing a different lane's source work. The global gate opens only after all required source work across all WPs is complete.

Progress measures functional code paths and source tests, not hardware or publication receipt counts. Physical-device evidence controls the accuracy of device claims; it does not silently become a new source-completion prerequisite. Apply the repository's existing seven-category launch-blocker rule to live acceptance.

#### Current task status

The ordered status codes correspond to the existing checkboxes within each WP,
from first to last. **S** means the reviewed source-relevant portions appear
present; it does not mean verified, shipped, or accepted. **P** means at
least one source requirement is partial, missing or unknown. **B** denotes
work primarily requiring the separate Phase B execution, which has not run for
the complete candidate. The review combined the earlier row audit with
targeted checks of current tracked and untracked source; these are
provisional classifications, not exhaustive tests of every variant.

The requirement counts are **present / partial / missing / unknown** in the
same provisional review. They describe source-side subrequirements, not
whole-task completion or effort, and include existing verification-tool or
test source where specified. Some requirements overlap across tasks. Five
evidence-only or acceptance-only items were excluded from this denominator.
The checkboxes remain open because their required source verification or
acceptance has not been established; no new checklist items are introduced.

| WP | Task status in checkbox order | Requirement counts | Main outstanding area |
| --- | --- | --- | --- |
| WP-00 | P P P P | 10 / 13 / 3 / 0 | Ledger option/backend granularity, triage and evidence |
| WP-01 | S S S P P P S | 26 / 3 / 2 / 0 | Dynamic visibility, exact-query sidedness and batch identity |
| WP-02 | P P P | 13 / 3 / 1 / 0 | Pivot edge paths, view culling and multiview integration |
| WP-03 | P S P S P | 22 / 5 / 0 / 0 | Native path coverage, lifecycle and complete warmup |
| WP-04 | P S P S P P P | 27 / 9 / 1 / 1 | Lobe combinations, photometric limits and provenance |
| WP-05 | P S S P P P P | 34 / 10 / 0 / 0 | Resource transfers, layouts, graph validation and lifecycle |
| WP-06 | P P P P P P | 22 / 13 / 1 / 0 | Motion/normal inputs, temporal reconstruction and isolation |
| WP-07 | S S S S S S S S S S P P P | 60 / 8 / 0 / 0 | Request/cache isolation and glTF extension coverage |
| WP-08 | P P P P | 4 / 16 / 0 / 0 | Per-format contracts, codec coverage and fixtures |
| WP-09 | S P P P | 17 / 4 / 0 / 0 | Complete round trips and independent-reader coverage |
| WP-10 | P S S | 17 / 1 / 0 / 0 | Codec-dependent splat variants |
| WP-11 | S P S P S S S S P | 41 / 2 / 0 / 1 | Binding provenance and playback/visual parity |
| WP-12 | S S S S S S S B | 36 / 0 / 0 / 0 | Physical XR session evidence is deferred |
| WP-13 | P S S P P P | 39 / 8 / 0 / 0 | Geometry provenance and rendered sampler/atlas integration |
| WP-14 | S S S S | 21 / 0 / 0 / 0 | Source checks and rendered output remain unverified |
| WP-15 | P S S | 22 / 2 / 0 / 0 | Specialized surface and shadow limitations |
| WP-16 | S S S P P | 24 / 2 / 0 / 0 | Worker scene publication and disposal acknowledgement |
| WP-17 | S P P B | 12 / 2 / 3 / 1 | Profiler coverage, keyboard/accessibility and font rights |
| WP-18 | P P P | 7 / 3 / 2 / 1 | Documentation, examples and ledger evidence |
| WP-19 | P P P P P P S P P P | 30 / 8 / 7 / 0 | Package integration, signed identity and independence |
| WP-20 | P P P P P P P S P B S | 27 / 5 / 5 / 0 | Runnable source/consumer infrastructure and source checks |
| WP-21 | P P P S P S P P | 36 / 5 / 1 / 0 | Cross-app ownership, readiness and disposal races |
| WP-22 | P B P P S | 20 / 1 / 1 / 0 | Browser/device evidence and support ranges |
| WP-23 | S P P P | 16 / 4 / 1 / 0 | In-flight asset ownership and packed React consumers |
| WP-24 | P S P P P P P P | 22 / 6 / 5 / 0 | Clean-install custody, consumer matrix and examples |
| WP-25 | S B P P P P S | 19 / 3 / 3 / 0 | Consumer-bound measurements, memory and baseline coverage |
| WP-26 | P S P S P P | 29 / 9 / 1 / 0 | Font/atlas edges, line options and model material variants |
| WP-27 | S P P B | 21 / 3 / 0 / 0 | Game integration and physics synchronization |
| WP-28 | S P P P S | 24 / 4 / 0 / 0 | Claimed format variants and independent round trips |
| WP-29 | P P P P P | 14 / 9 / 2 / 0 | Independently reviewed source and dependency provenance |
| WP-30 | P S P P P | 23 / 10 / 0 / 0 | Nonstandard production depth and cross-path consistency |
| WP-31 | P P P P P | 27 / 9 / 2 / 0 | Public draw-state coverage and transparency limitations |
| WP-32 | S P P P | 22 / 3 / 2 / 0 | Wide-gamut and dynamic/compressed texture coverage |
| **Total** | **192 existing tasks** | **784 / 183 / 43 / 4** | **No candidate-wide source or acceptance pass** |

The older [row audit](aura3d-native-current-audit-2026-11-02.json) remains
historical: its 53/192 task and 912/1,864 outcome counts classify only whole
rows as implemented and predate subsequent source changes. They are not
comparable to this subrequirement estimate. No frozen candidate or
`CODE_COMPLETE_GO` record exists, and Phase B remains locked.

### WP-00 — Capability ledger and work ownership (P0)

- [ ] Create the ledger named in WP-00 with one row per concrete user-observable capability, format variant, option and backend. Include G01–G55 and every specific item named in WP-01–WP-32.
- [ ] For each row record: stable ID; category; priority; root/package/internal exposure; current status; Aura3D source path and symbol; desired behavior; owning WP; implementation files; relevant tests; backend/device limits; and evidence link.
- [ ] Recheck every “not found” or “unverified” row against source, public exports, installed package and existing tests. Merge semantically identical rows; do not infer behavior from names.
- [ ] Break any newly discovered option or feature into a named row with exact file actions and acceptance. Do not mark the program complete while a row is unowned, untriaged, implemented only as a placeholder, or has missing required evidence.

### WP-01 — Geometry and queries (P0; parallel with WP-03, WP-07, WP-11)

- [ ] Fix index selection at 65,535/65,536/65,537 boundaries and verify indexed/non-indexed meshes.
- [ ] Apply inverse-transpose normal transforms, including nonuniform scale, shear, negative determinant and singular-matrix errors.
- [ ] Make merge and deindex operations preserve or explicitly reject every attribute, morph, group, draw range and topology; never return silently corrupted geometry.
- [ ] Invalidate position-derived bounds after edits; verify an object moved outside its original bounds stays visible.
- [ ] Compose parent transforms and default positions for queries; integrate triangle/BVH intersection and live geometry, including skinning, morphs, instances, UV/barycentric data, sidedness, near/far and layers.
- [ ] Return a stable batch-member identifier for batched hits and preserve instance/member identity through remapping, disposal and shared geometry.
- [ ] Keep approximate bounds queries available and test deterministic hit ordering and disposal.

### WP-02 — Scene and views (P1; after shared transform contract from WP-00)

- [ ] Add pivot-aware transforms through scene nodes, runtime handles and serialized projects; preserve old defaults.
- [ ] Make per-view camera matrices, culling, viewport/scissor, render targets and post history independent.
- [ ] Test hierarchy/reparenting, resize, stereo separation, mixed views and resource restoration.

### WP-03 — Native GPU backend (P1; parallel with WP-01/WP-07; prerequisite for GPU lanes)

- [ ] Implement actual root-app initialization, render submission, textures, materials, shadows and presentation using the native device. Implement and test deferred, meshlet and visibility-buffer drawing paths with explicit capability fallback; integrate the app/device ownership contract from WP-21.
- [ ] Define capability detection and feature errors; verify WebGL2 fallback only when explicitly allowed.
- [ ] Bind compute and rendering to the same device with explicit synchronization and disposal. Test device loss and recreation.
- [ ] Complete an explicitly opt-in functional backend before code freeze; preserve its experimental support label until actual rendered output, native dispatch and repeated lifecycle acceptance pass. An unconditional public-path rejection cannot count as completed backend code. Record software and hardware results separately.
- [ ] Consume full WP-31 draw-state and vertex-layout descriptors, WP-30 depth conventions and WP-05 typed buffer layouts. Warm render and compute variants without presentation; test cancellation, target/layout-dependent cache identity and device-generation disposal.

### WP-04 — Physical shading and lights (P1; after WP-03 backend contract; parallel WebGL implementation)

- [ ] Finish each existing bounded material lobe with texture transforms, color-space rules and correct normal/tangent handling.
- [ ] Add rough diffuse and configurable retroreflection; preserve the existing iridescence range while accepting separate minimum/maximum controls.
- [ ] Implement photometric profile admission, parsing, light-space orientation, projected images and shadow interaction.
- [ ] Test both symmetric and two-dimensional angular profiles, linear lamp/multiplier scaling and malformed tables. Feed generated lightmap UV charts/gutters from WP-13 into incremental baking without silently replacing authored UV channels.
- [ ] Add point/spot clustered lighting, probe grids, incremental light baking, voxel-based indirect lighting and cascaded sun behavior with explicit backend limits and WebGL2 fallback.
- [ ] Independently replace the attributed shader, environment and lookup implementations named in this lane; retain notices until replacement, and validate generated data against documented equations and fixtures. Ship the neutral environment self-contained and make optional presets explicit.
- [ ] Use independently authored calibration scenes, reference equations and per-backend pixel checks.

### WP-05 — Graph, compute and render resources (P1; requires WP-03 device contract)

- [ ] Specify typed graph IR, node/value validation, control flow, resources and serialization; generate both shader languages.
- [ ] Support color, normal, roughness, metalness, emission, opacity and vertex-position outputs; support compute, storage buffers/textures, multiple UV sets and viewport inputs.
- [ ] Reuse existing node-material entrypoints through an Aura-owned adapter; preserve clear errors for unsupported operations.
- [ ] Complete 3D, array, cube, compressed, storage and depth resources, independent mip updates, attachment validation, resolve/copy/readback, bounded GPU sorting and lifecycle.
- [ ] Implement integer/bool bit representation and target-specific uniform/storage layouts for mixed scalar/vector/matrix/array/structure data. Validate strides, offsets, padding, non-square matrices, invalid lengths and byte-exact transfers; do not serialize integer uniforms as float bits.
- [ ] Give depth/color attachments complete format/layer/mip/sample identities, prohibit conflicting reads/writes within a pass, preserve previous-depth attachments during history swaps and define ownership for async copy/readback cancellation.
- [ ] Test graphs on actual renderer paths, not only CPU interpretation or shader string snapshots.

### WP-06 — Postprocessing (P1; after WP-05 resource contract)

- [ ] Implement every effect named in the WP-06 file table and audit all existing effects for the inputs they require. Independently replace the attributed shader and lookup implementations, preserving notices until their replacement is complete.
- [ ] Add motion/depth/normal handling for animated, instanced and transparent content; explicitly flag unsupported combinations.
- [ ] Verify pass order, masking, history reset on camera cut/resize, alpha, view isolation and disposal with visible pixels.
- [ ] Remove module-global temporal/model caches. Use app/device/view/frame identity, stable runtime object keys, once-per-frame history commits and scoped resets; test multiple cameras/apps/passes, repeated same-frame calls and duplicate object labels.
- [ ] Define and implement separate spatial-upscale and temporal-reconstruction modes. Wire real reactive/disocclusion inputs, preserve previous depth across swaps, handle dynamic resolution and retain existing TAA/sharpening behavior where it already satisfies the contract.
- [ ] Prove motion blur preserves constant color and total weight, uses centered taps and handles one sample, zero/extreme motion, offscreen samples and transparent edges. Test deformation/instance/batch history without assuming rigid transforms are sufficient.

### WP-07 — Asset transport and glTF (P0/P1; parallel with geometry, GPU, animation)

- [ ] Resolve nested dependencies relative to their containing file, detect normalized cycles before awaiting in-flight work, and balance duplicate/shared retains on every success, failure and abort path.
- [ ] Verify admitted document and subresource bytes against their expected digests before cache insertion or render. Migrate existing single-file manifests safely; reject changed bytes, redirect mismatches and unavailable required hashing.
- [ ] Connect native format admission end to end: typed manifest and loader registry, installed optional loader, root model runtime, render resources, error diagnostics and disposal. Distinguish explicit offline conversion from native runtime support.
- [ ] Make reported texture budgets match actual returned and resident bytes per device; handle duplicate names, eviction, streaming, release and reload.
- [ ] Evict failed decoder initialization, bound worker queues and memory, await cancellation/teardown and permit safe retries.
- [ ] Forward the complete request contract to top-level files, external buffers, textures and images.
- [ ] Extend the same policy to exported audio, scene, image-bitmap and generic renderable loaders. Define image-orientation precedence and close decoded resources after cancelled/failed ownership transfer.
- [ ] Eliminate implicit fixture substitution for unknown formats, invalid manifests or unavailable transport. Preserve deliberate canonical content only behind an explicit fixture type; successful loads identify actual requested content and selected adapter.
- [ ] Scope decoded audio caches by content and request identity, bound decoded memory, independently cancel subscribers and generation-guard clear/dispose/replacement against late fetch/decode completion.
- [ ] Fix decoder plugin dev/build/static-base agreement. Emit and package a same-origin worker, preserve configured prefixes, validate MIME/path encoding, reject traversal and test a same-origin-only worker policy with only the codec's actual WebAssembly permissions.
- [ ] Partition in-flight and persistent caches by effective request context; hash or otherwise protect sensitive material, and ensure one caller's abort cannot cancel another.
- [ ] Implement and render the named new material extensions; finish existing bounded extensions individually, including variants and animated values.
- [ ] Test required/optional declarations, malformed buffers, invalid URIs, cross-origin policy, unsupported codecs, retries, cancellation and progress.

### WP-08 — Import formats (P2/P3; after WP-07 transport contract)

- [ ] Independently replace the attributed image decoder, then implement every format and variant listed in the WP-08 table, grouped into independently loadable modules.
- [ ] For each format define units, coordinate conventions, scene/hierarchy, geometry, materials, animation, dependencies, binary/ASCII versions and supported extension set.
- [ ] Admit inputs through typed asset/provenance workflows. Enforce file, archive expansion, pixel and allocation limits; return stable diagnostics for malformed or unsupported inputs.
- [ ] Provide a valid minimal fixture, a realistic multi-feature fixture where applicable, and hostile/truncated inputs for every format. Render supported scene content through the public API.

### WP-09 — Export formats (P2/P3; after WP-07 and WP-08 data contracts)

- [ ] Implement every exporter in the WP-09 table with an independently specified capability matrix and a typed result.
- [ ] Round-trip geometry, transform, hierarchy, material, animation, skin/morph and metadata where each format supports them.
- [ ] Produce structured warnings for loss, missing encoders or unsupported features; never silently omit data. Test independent readers, formats, endianness, units and dependency packaging.
- [ ] Preserve quantized attributes and indexed lines in formats that represent them, or produce explicit losses. Test HDR RLE/PIZ output and explicit attachment/layer export from multiple-output targets without clamping scene values.

### WP-10 — Splats and volumes (P2; requires WP-03/WP-05)

- [ ] Parse all named splat formats and validate sample count, attributes, covariance, color and spherical-harmonic layouts.
- [ ] Implement camera-dependent ordering, blending, culling, depth interaction, bounds and resource budgets; define what happens on unsupported backends.
- [ ] Add scalar-volume slices and rendering with clipping, transfer functions and lifecycle tests.

### WP-11 — Animation and audio (P0/P1; parallel with WP-01/WP-07)

- [ ] Add smooth and Bézier interpolation as distinct modes from glTF cubic spline; preserve authored tangents and serialization.
- [ ] Independently replace attributed property-binding code and test escaped names, Unicode, indexed bones/morphs, duplicate targets, missing targets and prototype-safe lookup.
- [ ] Support requested vector widths and deterministic clock/action semantics: reverse, repeat, ping-pong, time scale, timed fades and end conditions.
- [ ] Align core, compiled-pose and root asset playback for signed time, warp and synchronization. Compare large-step and equivalent small-step updates, multi-wrap marker order, reflected direction, zero duration and paused/stopped states; cap event catch-up and report overflow explicitly.
- [ ] Fix object-group subscription and UUID bookkeeping. Test subscribe/remove/resubscribe, middle/final uncache and re-add, duplicates and final disposal; no stale path may resolve to another live binding.
- [ ] Preserve authored values/tangents through optimize/trim/serialize/additive conversion for every interpolation mode; test values along the curve, not just surviving key counts.
- [ ] Correct audio position under playback-rate changes, scheduled starts, loop regions and pause/resume; add generic source adapters.
- [ ] Compute emitter/listener orientation through nested transforms, including mirrored or nonuniform scale; test disposal and user-gesture rules.
- [ ] Verify both state and visible deformed pixels; an animation state update alone is insufficient.

### WP-12 — Interaction and XR (P0/P1; after WP-01 query contract)

- [ ] Implement pointer-driven dragging and selection with plane intersection, hover, capture, cancellation, multi-touch and parent transforms.
- [ ] Complete arcball gestures and test all existing controls for event/listener cleanup.
- [ ] Retain per-contact positions/buttons and stable IDs. Define client, canvas-CSS and framebuffer coordinates for embedded/scrolled/resized targets; use timestamps for gestures and stable pinch pairs independent of frame rate.
- [ ] Treat pointercancel, lost capture, blur and device disconnect as termination without click/tap activation; release one contact without clearing another and verify real hit locations across DPR changes.
- [ ] Sample native XR viewer poses, hand joints and hit-test results with their reference spaces; acquire/cancel hit-test sources with the session.
- [ ] Add optional hands/controllers, plane/depth data and estimated lighting; integrate GPU composition only when supported.
- [ ] Generation-guard every async session-enter stage; concurrent enters create at most one owned session and exit/dispose closes any late-created session. Route input-source changes, select/squeeze, reference-space reset and visibility events; negotiate optional layer/foveation capabilities with explicit unsupported results.
- [ ] Distinguish injected session results from actual device results and record each separately.

### WP-13 — Curves and mesh tools (P2; parallel with WP-08/WP-11)

- [ ] Independently replace the attributed geometry implementations named in the WP-13 file table; preserve notices until their replacements pass equivalent contract tests.
- [ ] Implement rational curve, surface and volume evaluation with knots, weights, derivatives, clipping and degenerate inputs.
- [ ] Implement loft, parametric and patch geometry with normals, UV seams, caps and tessellation controls.
- [ ] Implement every named mesh utility and modifier; preserve or explicitly report changes to groups, attributes, morphs, indices and bounds. Implement bevels on path extrusion or reject them explicitly instead of silently dropping the setting.
- [ ] Make weighted surface sampling seeded and deterministic. Verify numerical and rendered outcomes.
- [ ] Build UV charts with an explicit destination channel, seams, texel density, gutter and atlas limits. Return vertex/index remaps and preserve groups/attributes/morphs after seam duplication; test nonoverlap, degeneracy, cancellation and bounded failure, then verify a baked-lighting scene uses the atlas.

### WP-14 — Helpers and output formats (P2; after WP-02 view contract)

- [ ] Implement the advanced helper catalog with scene-driven updates, visibility, transforms and disposal.
- [ ] Render accessible DOM labels in 2D and 3D and document occlusion and event limitations.
- [ ] Implement vector, text and stereo outputs with clear size, clipping, style, eye-order and resource semantics.
- [ ] Test assistive labels, pointer routing, screenshot output, resize and cleanup.

### WP-15 — Objects, generators and sculpting (P2/P3; parallel with WP-13)

- [ ] Implement every named specialized object, generator and editing tool as an opt-in module.
- [ ] Reuse the existing terrain, sky, water and scatter facilities where they satisfy the contract; do not replace working paths.
- [ ] Bound memory and polygon generation, support seed reproducibility and undo data, and test invalid inputs and teardown.

### WP-16 — Workers (P2; after WP-03 backend and WP-05 resource contracts)

- [ ] Define hidden-page suspension/resume, bounded catch-up, resize/DPR changes while hidden and temporal-history reset without changing explicit manual-step semantics.
- [ ] Expose whether a render failure is terminal or recoverable; suppress late callbacks after disposal and test recovery.
- [ ] Transfer canvas ownership once; define message ordering, request IDs, resize/input snapshots, errors and cancellation.
- [ ] Support initial scene, dynamic updates, asynchronous assets, frame scheduling and backend loss inside the worker.
- [ ] Test unsupported browser fallback, termination, duplicate disposal and no retained workers/listeners.

### WP-17 — Editor and inspector (P2; after WP-05 graph contract)

- [ ] Connect graph editing to real material state and the renderer compiler; provide typed ports, cycle errors, undo and serialization.
- [ ] Inspect actual textures, passes, timing and resources; avoid fixture-only visualizations.
- [ ] Provide keyboard operation, compact density and accessible error, loading and empty states. Use the repository's licensed typography and density rules; do not introduce remote font services.
- [ ] Prove create/edit/reload changes rendered pixels and that invalid graphs show actionable diagnostics.

### WP-18 — Documentation and examples (P1/P2; starts in parallel, finishes after lanes)

- [ ] Supply ledger findings to WP-00, its sole owner. Replace historical exclusion language only when the corresponding implementation and installed entrypoint exist.
- [ ] Document actual backend, hardware, resource, format and lossy-export limitations. Each public feature has an Aura3D-owned runnable example with typed assets.
- [ ] Keep the ledger current; complete every row and retain proof of public exposure, not merely internal classes.

### WP-19 — Integration, distribution and performance (P1/P2; sole shared-file owner)

- [ ] Integrate lanes in dependency order, adding exports, package metadata, generated maps and side-effect declarations. Keep optional packages out of root consumer bundles unless imported.
- [ ] Generate TypeScript, development, test and distribution mappings from one registry; typecheck new source/asset/browser-test files and verify all generated outputs, including emitted worker entrypoints, without hand-editing derived maps.
- [ ] Add an independently implemented CommonJS bridge where technically supported; test ESM and CommonJS from packed installations on supported Node versions.
- [ ] Replace generic option-coverage scaffolds with valid typed probes; each supported documented option must change the correct runtime/visual behavior or produce an actionable unsupported error.
- [ ] Make release planning, tarball checks, package tiers, provenance and verification derive from one versioned inventory; include the new optional package without rewriting historical inventories.
- [ ] Support source identity in a Git-free staged job by verifying its explicit manifest. Bind unchanged tested source/archive digests to the subsequent freeze commit; reject changed implementation and keep administrative evidence updates separate without weakening signed-source identity.
- [ ] Repair the existing performance script's undefined commands by wiring it to candidate-bound remote-report analysis. Rendered measurement collection occurs after source freeze; source tests cover workload/budget logic without launching a browser.
- [ ] Remove all external 3D-engine development dependencies, related typings and comparison-only adapters from every required install profile and lock graph. Assign every affected source, test, example and generated file discovered by the audit to exactly one lane in WP-00, with an exact path and action. Convert affected tests and examples to independently authored or open-standard fixtures without sacrificing behavior coverage.
- [ ] Audit source origins and lookup data as well as the transitive package graph, imports, packed artifacts and observed network requests. Track each independently verified replacement in the ledger; no scanner alone proves independent authorship.
- [ ] Measure startup, installed bytes, draw calls, frame/CPU/GPU time, allocations and repeated resource lifetimes with fixed versioned workloads; document device and methodology.

### WP-20 — Tests and evidence (parallel infrastructure; final after integration)

- [ ] Change the browser runner install to use the updated independent frozen lock, with equivalent source/browser test coverage.
- [ ] Implement the dedicated serverless source runner and argv allowlist. Stage required current source, untracked planned additions, configs, docs, fixtures, templates and environments with hashes; never validate stale dist or a different candidate.
- [ ] Include complete asset/contract suites and Node release tests in source execution. Assert required tests were discovered, and propagate missing/nonzero command status independently of upload success.
- [ ] Implement and source-test the single global phase gate. Require its matching code-complete record at acceptance entrypoints before job submission and inside the remote task; the source runner must reject any browser/acceptance argv before starting a process.
- [ ] Copy staged tests/fixtures into browser images and include the actual template/environment payloads for consumer jobs. Test staging omissions as failures before submission; avoid uploading unrelated repository assets.
- [ ] Add independent project selection and JSON result reporting for all supported browser families; retain test status separately if artifact transport fails.
- [ ] Strengthen subject-aware pixel checks and extend the existing repeated-resource soak; an opaque or intentionally dark frame must be interpreted using fixture expectations.
- [ ] Add an approved artifact-egress path to the serverless browser runner. Its current ad-hoc mode retains logs but does not provide general screenshot/trace egress.
- [ ] Run source checks, package tests and source-phase installed consumers before freeze; run remote browser behavior and visual tests afterward. Keep actual test names, versions, run IDs, candidate hashes, backend, device and limitations with results.
- [ ] Run repeated mount/load/unload/dispose, backend/context loss and recovery, and security-context isolation tests.
- [ ] Separate hardware XR/native-GPU receipts from software adapters or injected sessions. Claims may name only the level actually verified.

### WP-21 — App readiness, isolation and lifecycle (P0; parallel with WP-07)

- [ ] Introduce app/device-owned runtime context for color and shader policy, world/animation flags, caches, atmosphere, events and diagnostics. A newly created app must not reset or modify another active app.
- [ ] Implement the section 3.5 readiness result for renderer and first-frame stages; distinguish failure, cancellation, disposal and superseded mounts. Keep existing settled-only behavior during its documented transition.
- [ ] Scope asset callbacks and redacted errors to their owner; unregister on dispose and suppress late async completion. Test two apps sharing a page with different strictness, flags, scenes and failing assets.
- [ ] Make error formatting safe for cycles, large values, unusual getters and big integers. Bound repeated error records and avoid leaking credentials or signed URLs.
- [ ] Dispose every owned resource even after one disposer fails; aggregate errors and make repeated disposal idempotent. Cover mount/resize/loss/restore/dispose races and shared-resource ownership.
- [ ] Fix pooled target double release; track live leases/idle membership so simultaneous users never share one lease and counters remain nonnegative. Test foreign targets, trim, restore and outstanding handles.
- [ ] Dispose asynchronously compiled programs that arrive after disposal or generation change; settle held handles accurately and reject new acquisitions on dead caches. Test partial shader allocations, link failures, polling cancellation, supported retry and warmup settlement.
- [ ] Coordinate frame pause/resume behavior with WP-16 and asset request ownership with WP-07/WP-05.

### WP-22 — Browser and device matrix (P1; after WP-21 contracts)

- [ ] Define exact supported browser/OS/backend combinations with version ranges and fallback behavior. Start every untested cell as unverified.
- [ ] Run public WebGL2, DOM, input, asset and worker workloads remotely on default-flags chromium-automation, firefox-automation and webkit-automation projects. Use the separate chromium-gpu-headless project for native GPU probes. Keep software and experimental GPU flags in separately labeled projects.
- [ ] Capture the exact browser distribution and executable version, operating system, backend, adapter, driver where available, feature flags, fixture hash and test result. Record unsupported and skipped reasons explicitly. Automation builds do not by themselves establish retail-browser support.
- [ ] Treat automated browser builds, retail browsers, software rendering, injected sessions and physical mobile/desktop devices as separate evidence. Do not claim a physical device from an emulator or spend on hardware automatically.
- [ ] Route browser-project forwarding and result/artifact transport through WP-20; document unverified cells without blocking the source freeze.

### WP-23 — React integration (P1; after WP-21 and WP-07 contracts)

- [ ] Make the existing adapter's ready callback reflect successful renderer readiness; deliver cancellation/failure through a stable boundary and do not update unmounted components.
- [ ] Scope asset resources by effective loader, request/security context and digest; support independent subscribers, bounded ownership, eviction and retry after failure.
- [ ] Exercise both declared supported peer major versions, StrictMode double mounts, Suspense, error boundaries, prop updates, input and scene disposal using packed packages.
- [ ] Verify server-side import/render avoids DOM access, and hydrate a real client scene without duplicate render loops or leaked listeners/resources.

### WP-24 — API stability, docs and consumer experience (P1; after WP-19 package integration)

- [ ] Compare every packed public subpath, runtime export, declaration, overload, generic constraint, union, optional field and module condition with the immediately preceding supported release.
- [ ] Replace fixed legacy baseline selection with explicit verified baseline manifest, candidate plan, release kind and output arguments. Read bounded previous-package declarations without installing/executing the runtime, and preserve prior published digests.
- [ ] Reject undocumented incompatible changes for patch/minor releases; for the next planned major, provide explicit migration instructions and preserve the published deprecation policy.
- [ ] Generate reference documentation from actual packed declarations and export conditions; make missing subpath documentation or a broken applicable snippet fail the checker.
- [ ] Build every promised template and capability-family example from an isolated, untouched scaffold. The harness may substitute the candidate package only; it must report and fail on missing dependencies or skipped required checks.
- [ ] Split clean-install and consumer-matrix tools into source and browser phases. Retain untouched source-phase projects and candidate/tarball/project digests; source phase never starts a browser, and browser phase validates its source report before use. Never overwrite source results with acceptance outcomes.
- [ ] Verify plain JavaScript, supported TypeScript resolution modes, module conditions, SSR, workers, absent/present optional peers and both supported React peer majors. Declare only combinations actually tested.
- [ ] Update support policy, environment troubleshooting and template assets; verify offline neutral environment and explicit missing-asset errors without fabricating network success.

### WP-25 — Performance and memory maturity (P1; after WP-03/WP-19 integration)

- [ ] Establish independently reproducible workloads for one primitive, product scene, dense instances, animation, a game loop, effects and asset import. Fix scene/asset hashes, seed, active look, quality, viewport, device pixel ratio, browser and backend.
- [ ] Run at least 3 independent sessions and 300 timed frames per session where the calibrated workload permits; retain p50/p95/p99 frame and CPU durations, startup/first drawable frame, requests, raw/gzip/Brotli bytes, allocations and live resource counts. If timing or hardware is unavailable, report no-data.
- [ ] Compare like-for-like runs on the same device against a versioned prior baseline. For each lower-is-better metric, take the median of the baseline session results as B and the median of candidate session results as C. Define relative baseline noise as the median absolute deviation of baseline session results from B, divided by B. Flag a regression when C/B - 1 exceeds the greater of 0.05 and twice that noise. For a zero or unavailable baseline, report no-data and use a separately defined absolute bound if one exists. Rerun once if the environment is noisy; if it remains inconclusive, do not manufacture a pass.
- [ ] Reproduce and meet the repository's existing gzip budgets: 190,000 bytes for the core critical path, 250,000 for the product starter, 400,000 for the cinematic starter and 480,000 for the mini-game starter. The checked-in overages are historical measurements; rerun before claiming current values. Do not raise budgets to pass.
- [ ] Make installed tree-shaking consume an explicitly selected current source-consumer report, validate package/project hashes and fail stale input without requiring an earlier browser receipt.
- [ ] Measure actual memory residency and resource release, not ledger counters alone. Preserve visual quality and rerun the relevant pixel checks when a performance change alters the render path.
- [ ] Use genuine asynchronous device timers where supported; report CPU timings separately and never substitute them for GPU measurements.

### WP-26 — Text, lines and model rendering (P1/P2; after WP-01/WP-05)

- [ ] Support admitted licensed fonts, Unicode shaping, kerning, ligatures, right-to-left scripts, fallback glyphs, multiline wrapping and dynamic atlas updates with bounded allocation.
- [ ] Preserve the built-in small-glyph fallback; expose an accessible DOM counterpart and dispose glyph/texture resources after final use.
- [ ] Complete wide/dashed line widths in world and screen units, per-vertex gradients, segment continuity, pixel-ratio/resize behavior, alpha and clipping; return a stable error for any unsupported combination.
- [ ] Update actual line storage in Geometry.ts, preserving LineGeometry.ts's re-export. Same-capacity edits reuse GPU buffers; growth releases replaced buffers. Test changing positions/colors/distances, bounds and allocation counts over repeated updates and final disposal.
- [ ] Apply custom materials to supported imported model slots while preserving variants, textures, shadows, morphs, skinning and instances. Implement model LOD/collider options; reject only specified unsupported variants and never accept and ignore a setting.
- [ ] Request existing geometry and public type changes from their WP-01/WP-19 owners; verify source, pixel output, interaction and resource teardown.

### WP-27 — Physics and game-runtime maturity (P2; after WP-01/WP-21)

- [ ] Complete and test supported primitive, convex, static-mesh and heightfield collision; fixed/hinge/spring/motor joints; contact/sensor/layer queries; deterministic stepping and continuous collision.
- [ ] Verify scene/physics synchronization with parent transforms, multiple worlds, character/vehicle reset and teardown. Report unsupported backend or shape combinations explicitly.
- [ ] Keep the full game entrypoint working and cycle-free. Replace the ambiguous root headless behavior with an actionable, versioned migration error; do not re-export through a dependency cycle.
- [ ] Validate installed games with manual keyboard and touch, HUD, audio/effects, pause/reset, replay and cleanup. Promote only features backed by the applicable root or subpath evidence.

### WP-28 — Asset conformance (P1/P2; after WP-07/WP-08/WP-09)

- [ ] Build a versioned, independently licensed fixture manifest with content digest, origin, format version, extension combinations, expected numerical/visual output, limits and license.
- [ ] Run actual decode, resource creation, root rendering and disposal for each supported claimed variant. A file classification, parser return or metadata-only test is not enough.
- [ ] Cover nested external dependencies, invalid required/optional extensions, corrupt/truncated files, archive expansion, strict/fallback texture failures, byte integrity and independently verified export round trips.
- [ ] Verify the texture budget against returned CPU bytes and live device residency, including same-name textures on separate devices, eviction and release.
- [ ] Keep unavailable assets, devices and formats visibly unverified rather than silently skipping them.

### WP-29 — Independent implementation provenance (P0/P1; parallel after WP-00)

- [ ] Enumerate every workspace manifest, direct/dev/peer/optional dependency, alias, override, lock snapshot and peer edge; remove all external 3D-engine dependencies from required installs and published runtimes.
- [ ] Inspect source, generated artifacts, source maps, encoded tables, workers, binary payloads, packed packages and actual runtime network requests. Test synthetic direct/transitive/aliased/optional/peer cases and a clean offline consumer.
- [ ] Record per-file hash, source kind, license, owner, replacement status and review evidence in the WP-00 capability ledger. Coordinate already assigned source rewrites with their owning WPs.
- [ ] Treat textual references, standardized equations and fingerprint hits as review candidates, not automatic proof of copied implementation. A scanner alone cannot prove independent authorship.
- [ ] Keep existing license/copyright notices until corresponding material has actually been independently replaced. Convert tests and goldens to independently authored or appropriately licensed open-standard fixtures without reducing behavior coverage.

### WP-30 — Clipping and camera depth (P1/P2; after WP-02/WP-05 contracts)

- [ ] Implement section 3.7 clipping through root scene/material APIs, compiler, graph, forward, depth and shadow paths. Define local/global composition, retained half-spaces, invalid-plane errors and supported mesh/line/point/sprite semantics.
- [ ] Add physical film/focal-length perspective controls and tiled/asymmetric view offsets. Define precedence when FOV and focal length are both supplied; preserve current defaults and distinguish camera projection from depth-of-field effect settings.
- [ ] Implement standard/reversed/logarithmic depth as explicit negotiated conventions. Carry clip range, projection/inverse, compare/clear, bias and reconstruction consistently; validate perspective/orthographic near/far independently and support infinite far only where the declared mode allows it.
- [ ] Coordinate shadows, culling, query reconstruction, multi-view, fog, AO/reflections/depth-of-field, temporal histories and readback with their owners. Never infer every projection from conventional finite matrix coefficients.
- [ ] Test near/far mapping, large depth ranges, tiled seams, clipping transforms, animated/instanced geometry, target changes, depth-aware effects and unsupported-device fallback through source and packed-browser paths.

### WP-31 — Draw state and transparency (P1/P2; after WP-03/WP-05 contracts)

- [ ] Implement every supported depth/stencil/blend/color-mask/cull/winding/offset/sample field in each device; distinguish dynamic state from pipeline state and include all relevant attachment/layout/feature fields in cache identity.
- [ ] Connect normalized/integer/interleaved/multiple-stream/per-instance vertex layouts to actual buffer slots, shader inputs and draws. Test values and pixels, not only descriptors.
- [ ] Preserve stable opaque/masked/transmissive/transparent ordering and explicit render ordering. Implement weighted accumulation/revealage and composition with defined alpha/depth/MSAA rules, capability limits and sorted fallback.
- [ ] Test intersecting transparent layers under different submission orders, opaque occluders, premultiplied alpha, multisampling, views and teardown. Document weighted transparency's approximation and keep refraction/dispersion in their own supported path.
- [ ] Integrate clipping/depth/output into program generation and warmup; a change in shader-affecting state must select the correct variant, while ordinary uniform edits must not cause needless recompilation.

### WP-32 — Color and texture fidelity (P1/P2; after WP-03/WP-05 contracts)

- [ ] Implement shared scene-referred color transforms with extended-range linear identity, independently derived primary conversion and explicit tone/gamut/output stages. Preserve existing normalized helpers through a versioned contract where necessary.
- [ ] Support requested sRGB and Display-P3 output when the context supports them; report active output/fallback and distinguish float rendering, wide gamut and physical HDR display evidence. Keep colorless maps linear and alpha handling consistent.
- [ ] Preserve existing video polling, canvas uploads and data subregion updates. Extend only gaps demonstrated in the declared 3D/layer/mip/media contract; keep correct source lifetime, orientation, dimensions, color metadata and storage reuse.
- [ ] Verify known color vectors, HDR values above one and below zero, output readback, layered/mip update isolation, changing media frames, compressed-block validation and final cleanup on supported backends.

## 6. Capability coverage checklist

The ledger must expand these families into individual rows and assign each row to the identified WP. A checked row means the relevant public package has working behavior, tests and documented limits; it does not mean a matching filename merely exists. Treat each item as an implementation requirement where the baseline is incomplete.

### Core math, scene and geometry — WP-01, WP-02, WP-13, WP-30

- [ ] Scalars, angles, interpolation, seeded randomness, color conversion and color spaces; 2D/3D/4D vectors; quaternions and Euler angles; 3×3/4×4 matrices; rays, planes, spheres, boxes, frustums, triangles, capsules, oriented boxes and spatial trees.
- [ ] Scene hierarchy, world/local transforms, pivots, reparenting, events, visibility, layers, metadata, cloning, serialization, traversal, disposal, bounds, skeleton and animated-object state.
- [ ] Perspective, orthographic, cube, array and stereo cameras; per-view projection, viewport/scissor, culling, postprocessing and camera controls.
- [ ] Points, sprites, thin/wide/dashed lines, line segments, wireframes and mesh primitives; indexed, non-indexed, instanced, batched, skinned and morphed geometry.
- [ ] Box, sphere, plane, circle, ring, cylinder, cone, capsule, torus, torus knot, polyhedra, lathe, extrude, shape, tube, rounded box, convex hull, decal, text, parametric, loft and patch geometry.
- [ ] Paths, splines, cubic and quadratic curves, ellipses, arcs, shapes, contours, holes, triangulation, rational curves/surfaces/volumes, derivatives and consistent arc-length sampling.
- [ ] Attribute formats and normalization; interleaving; shared buffers; update ranges; deindexing; merge, weld, remap, crease normals, tangent generation, morph evaluation, group preservation, mesh memory estimation and safe bounds.
- [ ] Runtime simplification, edge split, tessellation, curve deformation, UV unwrapping, mesh compression helpers, deterministic surface sampling and topology validation.
- [ ] Physical film/focal-length camera projection, tiled/asymmetric views, explicit depth conventions and valid near/far/infinite-far behavior; clipping planes and section views apply consistently to supported primitives, materials and shadows.
- [ ] UV atlas charting, seams, gutters, density and packing with preserved/remapped groups, attributes and morphs; generated UVs reach the real baking path.

### Rendering, materials, effects and GPU — WP-03 to WP-06, WP-10, WP-30 to WP-32

- [ ] WebGL2 and native WebGPU backend selection, capability negotiation, async initialization, explicit fallback, resize, multi-view, device/context loss, recovery, diagnostics and disposal.
- [ ] Forward and clustered lighting plus independently implemented deferred, meshlet and visibility-buffer drawing paths where the hardware supports them; per-object/per-view culling, batching, render bundles, transparency, sorting and deterministic fallback.
- [ ] Basic/unlit, Lambert, Phong, standard/physical, toon, matcap, normal, depth, distance, line, point, sprite, shadow, custom shader and typed node materials; front/back/double side, alpha, blending, clipping and wireframe behavior.
- [ ] Base color, metalness, roughness, normal/bump/displacement, emissive, occlusion and light maps; layered clearcoat, transmission, diffuse transmission, volume, IOR, sheen, anisotropy, specular, iridescence, dispersion, retroreflection and rough diffuse with relevant maps/UV channels.
- [ ] Ambient, hemisphere, directional, point, spot, rectangular-area, photometric and projected lights; physically meaningful units, shadow maps/filters, cascades, environment lighting, reflection probes, light-probe grids, incremental light baking and voxel-based indirect lighting where supported.
- [ ] Color-managed textures, data, canvas, video, cube, 2D array, 3D, compressed, depth and storage textures; format selection, filtering, anisotropy, wrapping, mip generation/update, upload and readback.
- [ ] Render targets with color/depth attachments, multiple outputs, cube/array/3D layers, multisampling, resolving, copy and readback; correct resource sharing, synchronization and ownership.
- [ ] Tone mapping, exposure, color management, environment prefiltering, HDR, sky, fog, volumetrics, water, reflections, refraction and depth-aware transparency; document fallback quality.
- [ ] Bloom, depth of field, AO variants, reflections, indirect lighting, anti-aliasing, film/grain, color lookup and grading, glitch, halftone, dot-screen, pixelation, transition, afterimage, masks, texture/clear/save/output stages, motion blur, lens dirt and outlines.
- [ ] Typed shader graphs, functions, flow control, variables, arrays, structs, math, noise, color, texture sampling, UV transforms, lighting hooks, screen/depth inputs, storage, atomics, barriers and compute dispatch. Generate and validate shaders for each supported backend.
- [ ] GPU sorting, compute/render interop, indirect/instanced work, query/readback, resource lifetime and memory budget behavior. Unsupported features must produce precise diagnostics.
- [ ] Gaussian splats and scalar volumes: format parsing, camera-dependent projection/order, covariance, spherical harmonics, alpha/depth, volume slicing and transfer functions.
- [ ] Full depth/stencil/blend/cull/color-mask/offset/sample state on both devices; normalized/integer/multiple-stream/per-instance vertex formats and complete pipeline/program cache identities.
- [ ] Weighted order-independent transparency with explicit approximation and sorted fallback, opaque depth interaction, alpha composition and independent view resources.
- [ ] App/view/frame-owned current/previous transforms and depth, once-per-frame commits, reactive/disocclusion masks, documented temporal reconstruction and normalized centered motion blur.
- [ ] Byte-correct mixed shader data, uniform/storage arrays and structures, matrix strides, alignment, partial uploads and independent async readback ownership.
- [ ] HDR-preserving color transforms, negotiated wide-gamut output, data-map/alpha handling and truthful output labels; retained dynamic media/layer/mip updates and clean source disposal.

### Assets, formats and interchange — WP-07 to WP-10

- [ ] Typed identity, hashes, licenses, dependency discovery, lifecycle, caching, progress, cancellation, independent subscribers and security-context isolation for documents, buffers and images.
- [ ] glTF/GLB geometry, buffers, textures, compression, materials, animation, skins, morphs, cameras, lights, variants, instancing and every declared material extension, including diffuse roughness and bump.
- [ ] FBX, USD/USDZ, Collada, 3MF, 3DM, AMF, 3DS, VRML, LDraw, KMZ, OBJ/MTL, PLY, STL, VOX, SVG, BVH, MD2, MDD, PCD, PDB, VTK, XYZ, NRRD and GCode, with each format's supported versions and loss boundaries recorded.
- [ ] EXR, HDR, JXL, UltraHDR, DDS, PVR, KTX1/KTX2, TGA, TIFF, ordinary web images, photometric profiles, cube environments, 3DL/image color tables and MaterialX documents, subject to explicit codec capabilities.
- [ ] PLY/SPLAT/KSPLAT/SPZ and registered glTF splat data with versioned validation and resource limits.
- [ ] GLTF/GLB, OBJ, PLY, STL, USDZ, compressed mesh, EXR and KTX2 export; embedded/external dependencies; independent round-trip validation and explicit structured loss reports.
- [ ] Identical request/integrity/cancellation guarantees for public audio, image, scene and generic model loaders; explicit canonical fixtures, accurate orientation and no unrelated fallback success.
- [ ] Production decoder/worker URLs match development URLs under root/nested deployment bases; emitted same-origin workers, documented content policy, MIME validation and offline resource cleanup.

### Animation, audio, interaction and XR — WP-01, WP-11, WP-12

- [ ] Numeric, boolean, string, color, vector, quaternion, matrix, morph and material-property tracks; step, linear, smooth, Bézier and glTF cubic-spline interpolation.
- [ ] Clip/action lifecycle, duration, negative/positive time scale, repeat, ping-pong, crossfades, weights, mixing, masking, event timing, synchronization, serialization, root motion and retargeting.
- [ ] Skeleton hierarchies, bind/inverse matrices, skinned rendering, morph targets, facial controls, procedural poses, two-bone and iterative IK, animation bounds and disposal.
- [ ] Audio listeners, positional emitters, orientation, distance/cone models, buffers, media elements, streams, external audio nodes, effects, analysers, detune, loop regions, playback-rate changes and pause/resume.
- [ ] Orbit, map, arcball, trackball, fly, first-person, pointer-lock, transform and drag controls, including pointer capture, touch, keyboard, cancellation, focus and cleanup.
- [ ] Exact ray and screen picking, instances, deformed meshes, material side, UV/face/normal output, interactive groups and marquee selection.
- [ ] Immersive and inline sessions, per-eye views, cameras, controllers, hands, joints, hit tests, planes, depth, light estimation, session permissions, reference-space changes and disposal; separate real-device verification.
- [ ] Timestamp-based, contact-ID-stable gestures and correct client/CSS/framebuffer coordinates; cancellation never activates input, and asynchronous XR startup cannot outlive its owner.
- [ ] Large-step animation event traversal, reflected/reverse time, bounded catch-up, shape-preserving key optimization and animation-group cache resubscription without stale bindings.

### Authoring, utility, packaging and experience — WP-14 to WP-20

- [ ] Environment helpers, reflection/refraction surfaces, sky/water, lens flares, marching surfaces, grounded backgrounds, procedural tree/forest/terrain/city/street objects, sculpting, tube painting and convex fracture.
- [ ] Axes/grids, camera/light/skeleton/audio/probe/physics/normal/tangent/texture helpers; dynamically updated transforms and resources.
- [ ] Spatial DOM labels, embedded interactive DOM surfaces, vector output, text output, stereo/anaglyph/parallax output and accessible event behavior.
- [ ] Scene/project editor, hierarchy, properties, assets, animation, live shader graph, frame inspector, texture inspector, profiling, serialization, undo/redo and static export.
- [ ] Worker-owned rendering, input/resize bridge, task pool, resource transfer, worker failure and teardown.
- [ ] Typed public entrypoints, optional addon modules, ESM/CommonJS installed consumers, tree shaking, declarations, examples, asset licensing and deterministic package builds.
- [ ] Automated source, integration, browser, performance, visual, device and resource-lifetime verification with scoped, honest product claims.

### Production maturity, trust and usability — WP-07, WP-19 to WP-32

- [ ] Every app exposes truthful readiness, failure and cancellation; parallel apps isolate settings, events, resource ownership and diagnostic records.
- [ ] Scene/context loss, background suspension, resize, async loads, concurrent disposal and repeated remount have deterministic behavior. All owned resources and callbacks are released even when a disposer fails.
- [ ] Every supported loader handles parent-relative dependencies, duplicate/shared references, cycles, cancellation, retries, decoder failures, memory limits and secure request/cache partitioning.
- [ ] Content integrity verifies actual admitted bytes and subresources; manifests, redirects, cache identities and strict/fallback diagnostics describe exactly what rendered.
- [ ] Conformance fixtures have documented provenance, license, digest and independent expected output. Claimed variants are decoded and rendered; classification counts do not stand in for runtime behavior.
- [ ] Supported browser, OS, device, backend and feature combinations have versioned support labels. Software, experimental, emulated and physical-device evidence remain separate.
- [ ] Rendered option behavior is checked end to end; unsupported values return stable diagnostics instead of silent approximations.
- [ ] World text covers licensed fonts, Unicode, shaping, fallback, direction, layout, dynamic atlases and accessible alternatives. Lines preserve width, dashes, gradients, clipping and alpha.
- [ ] The existing React integration handles both documented peer majors, real readiness, StrictMode, Suspense, SSR/hydration, cache isolation, cancellation and disposal.
- [ ] Public exports and types have a versioned stability policy, independently reproducible API comparisons, deprecation windows and migration guidance.
- [ ] Every supported documentation snippet, example, starter and installed consumer is built from packed packages without undeclared harness repairs. Test JavaScript, TypeScript, module conditions, optional peers, SSR and workers.
- [ ] Existing bundle budgets pass without being raised; repeated like-for-like workloads report startup, p50/p95/p99, bytes, resource counts and available hardware timing. Counters and software results are not visual or hardware proof.
- [ ] Physics/game paths expose only implemented behavior; advanced shapes, joints, vehicles, input, reset, replay, audio, HUD and disposal have scoped evidence.
- [ ] Package release planning, tarball validation and generated exports use one versioned inventory; historical package sets remain reproducible.
- [ ] Source, generated assets, dependency graphs, tarballs and network activity are checked for prohibited engine implementation. Authorship requires recorded source provenance and review, not only absence of fingerprint hits.
- [ ] Error messages, support documentation, licensed assets, keyboard operation, reduced-motion/high-contrast behavior and accessibility labels are correct for each supported surface.
- [ ] Performance, browser and physical-device results report failures and unavailable cases explicitly. Live-device and publication evidence follows code freeze and does not masquerade as source completion.
- [ ] Pooled targets have exclusive leases and nonnegative counts; duplicate release and restoration cannot alias active targets. Late shader compilation disposes abandoned programs and settles dead handles accurately.
- [ ] Source-only jobs stage all required current files and run all selected suites; packed-consumer reports are phase-specific and bound to candidate, tarball and project hashes. Generated resolution maps and modern API baselines agree.

## 7. Separate code-complete and acceptance execution

The master roadmap defines the required behavior, file ownership and work packages. Execution commands and phase checklists live in separate files:

| Phase | Document | What runs | Exit condition |
| --- | --- | --- | --- |
| A — code-complete | [aura3d-native-code-complete.md](aura3d-native-code-complete.md) | Implement every required production path and all test/tooling source; run source/contract tests, generated checks, fresh builds and source-only packed consumers. | Every required source outcome and expected source check passes; commit the candidate and emit the verified global CODE_COMPLETE_GO record. |
| B — acceptance | [aura3d-native-acceptance.md](aura3d-native-acceptance.md) | Remote headless browser/visual suites, rendered performance, real or injected browser sessions, device coverage, runtime network capture and authorized live acceptance. | Applicable results are recorded against the frozen candidate; unavailable hardware and unsupported claims stay explicit. |

**No acceptance execution before global code completion.** Write, typecheck and source-test acceptance harnesses in Phase A, but do not launch them. A single completed work package, an experimental label or a partially checked ledger does not open Phase B. Each mixed requirement has a source status and a separate acceptance status; do not require browser evidence to close its source status.

The planned tools/native-capability-gate/index.mjs validates tests/reports/native-capabilities/code-complete-go.json before acceptance job submission and inside the remote task. The record must match all required source outcomes/checks, the freeze commit and implementation/lock/archive hashes. Missing, partial or stale input fails closed and returns execution to source work.

All new scripts, flags and report formats in the phase documents are implementation requirements. They are not claimed to work in the current baseline, and no code-complete record is created by this documentation update. Keep heavyweight source/build work and all browser/visual work on approved remote jobs; all browser automation is headless.

If Phase B exposes a required production defect, make the bounded repair, rerun affected source checks, freeze a new candidate and then rerun affected acceptance. Reuse valid unaffected results with their original identity recorded; do not restart the entire program or run recursive review loops. Hardware unavailability and narrow receipt gaps limit claims and do not create unfinished production code.

The following program-closure checklist is evaluated after the gate. Reuse the already passing Phase A reports for source items; it is not a second implementation queue or permission to run acceptance early.

Post-freeze program closure checklist:

- [ ] Every G01–G55 row and every item in section 6 has a ledger entry with owner, exact implementation files, public entrypoint, tests, limitations and evidence. No row is unowned or untriaged.
- [ ] All confirmed P0 defects are reproduced by regression tests before correction and pass afterward.
- [ ] Every listed CREATE/MODIFY file is implemented; no placeholder, mock-only implementation or silently ignored option is counted as complete.
- [ ] Each importer and exporter has independent valid/invalid fixtures, format-variant coverage, bounded resource usage, explicit losses and independent round-trip or open-standard validation.
- [ ] Geometry tests cover index-width boundaries, inverse-transpose normals, mixed inputs, groups, morphs, dynamic bounds, nested transforms, triangles and instances.
- [ ] App readiness distinguishes successful renderer/first-frame outcomes from failed, cancelled or disposed states. Multiple apps isolate flags, diagnostics, asset events and resources; no subscriptions remain after final disposal.
- [ ] Asset graph tests prove nested relative paths, duplicate/shared reference counts, cycle rejection before await, independent cancellation, digest verification and final release.
- [ ] Required model custom materials, variants, LOD/colliders, line gradients/dashes and Unicode world text render as documented; only specified unsupported variants return an error.
- [ ] React consumers pass server rendering, hydration, StrictMode, Suspense, retry, error boundaries, both declared peer majors and repeated mount/dispose from packed packages.
- [ ] Each supported browser/backend/device cell has exact versioned evidence; software, experimental and physical-device cells are not conflated.
- [ ] Asset tests cover headers, credentials, cache separation, cross-origin dependency policy, same-URL concurrent callers, cancellation, progress and retries.
- [ ] Rendering tests prove the active backend, actual output pixels, materials, lights, shader compilation, compute dispatch, targets, resize, effects and cleanup.
- [ ] Animation/audio tests cover interpolation, timing, fades, playback-rate changes, spatial orientation and actual visible or audio-graph effects.
- [ ] Interaction/XR tests cover native-shaped browser objects, permission/session lifecycle, hit testing, hands, pointers, cancellation and listener/resource cleanup.
- [ ] Editor and alternative output tests cover keyboard access, graph persistence, real renderer state, resize, errors, accessible content and visual changes.
- [ ] A packed consumer successfully imports the root and each opt-in entrypoint; unsupported combinations fail with actionable diagnostics.
- [ ] The required install profile, transitive lock graph, tests, runtime and packaged artifacts contain no external 3D engine dependency or imported, bundled, wrapped or copied engine implementation. Explicitly identified source/data replacements and the absence of external source fetches have independent provenance and retained review evidence.
- [ ] Full source commands and the applicable remote browser commands pass. Failed and unavailable cases remain visibly open; retain logs and outputs.
- [ ] Existing critical-path and starter gzip budgets pass without being increased; optional packages remain absent from consumers that do not import them.
- [ ] Performance results record fixed workload revision, package version, sample size, backend, hardware and browser. Do not claim an improvement without a reproducible baseline.
- [ ] Packed API/type compatibility, every supported documented example, untouched installed consumers and versioned package inventory pass with no skipped required checks.
- [ ] Every claim in the support matrix and documentation matches the exact tests, backend and device evidence available.
- [ ] Required production code paths and source tests are complete before freezing the code-complete state. Live/device acceptance follows separately and must not be mislabeled as source completion.
- [ ] Public documentation and claims are updated only for the exact API, backend, device and evidence level actually verified.
- [ ] Duplicate pooled-resource release cannot produce duplicate live leases; late compiled programs and failed partial allocations are disposed exactly once and dead handles cannot become ready.
- [ ] Temporal history is isolated by app/device/view/frame, preserves previous color/depth, advances once per frame and handles reactive content, deformation, dynamic resolution and centered energy-preserving blur.
- [ ] Clip planes, physical/tiled projection and depth conventions produce matching geometry, culling, shadows, post effects and readback. Every supported GPU render-state and vertex-layout field changes the intended actual behavior.
- [ ] Weighted transparency passes order-permutation tests within its declared approximation; HDR identity and wide-gamut fallback behave as documented without conflating intermediates with display capabilities.
- [ ] UV atlases preserve/remap geometry data and supply correct baking inputs; repeated same-capacity line/media updates retain storage and dispose superseded resources.
- [ ] Every public loader honors request/integrity policy and actual content identity. Unknown inputs fail explicitly; audio cache clear/dispose and image cancellation cannot resurrect or leak resources.
- [ ] Animation multi-loop events, reverse/reflected time and group resubscription pass; pointer cancellation and asynchronous XR startup preserve owner state and never emit spurious activation/start events.
- [ ] Packed decoder/worker assets work at root/nested deployment bases under the documented content policy, with explicit optional codec failures.
- [ ] Source jobs stage required fixtures/templates and run complete asset/contract/release tests. Source/browser consumers have distinct current candidate-bound reports; installed tree-shaking has no browser prerequisite and modern API baselines are verified.

## 8. Edge cases, release boundaries and guardrails

- Existing declarative scenes, typed assets, package consumers and WebGL2 defaults must continue to work. New behaviors that change old output require an explicit option or a documented versioned migration.
- Unsupported optional GPU features, missing codecs, malformed assets, unknown glTF extensions and unavailable XR permissions must return useful errors without hanging or corrupting state.
- Do not place credential values, raw private headers, protected tokens or unlicensed fixture data in files, cache keys, logs or artifacts.
- Avoid unbounded decompression, oversized GPU allocations, unbounded worker pools, stale GPU/DOM/audio listeners and resource leaks after disposal.
- Editor UI follows the licensed local font and dense-interface policy: compact 34px rows and 32px controls, readable 12px minimum metadata, keyboard operation, and distinct loading, empty, error and unsupported states.
- No public feature is “done” merely because it parses, compiles, has a mock, or appears in an internal package. Its public entrypoint, runtime behavior, tests, lifecycle and documented limitations must agree.
- No user-facing speed, quality, compatibility or hardware statement may exceed the retained evidence. Preserve historical results as historical rather than relabeling them.

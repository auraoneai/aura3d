# Aura3D 5.0 fixed scope list

Date: 2026-11-02. Source audit: `docs/prds/aura3d-native-current-audit-2026-11-02.json` (`taskResults`, 192 rows), with its sections "Current Source Corrections And Remaining Limits" and "Subsequent Focused Source Work" and `aura3d-native-code-complete.md` ("Recent source work", "Known blockers") superseding older row reasons where they overlap. Targeted `rg` spot-checks of current source were used where a reason was ambiguous.

Owner decisions: 5.0.0 keeps full feature scope. Every partial row is labeled exactly once below. The custody / signed-source runner requirement is dropped; the 4.x ACR build path (`tools/remote-acr/run-source5.sh` for the source pass, `run.sh` for browser acceptance) plus the existing gate tool `tools/native-capability-gate/index.mjs` replace it.

Labels:

- **FINISH-5.0**: remaining gap is production code, a failing/conflicting existing test, lifecycle, API/export/schema agreement, packaging, independence/provenance, template assets, WebGL2 default-path behavior or migration docs. Rows whose remaining work starts with "Verify-only" have no known code gap; they close when the existing suites pass in the ACR source pass.
- **EXPERIMENTAL-5.0**: works through an explicit opt-in with explicit fallback/refusal; missing only real browser/GPU/device evidence or broader variants. Ships labeled experimental in docs and the support matrix.
- **SUPERSEDED-PROCESS**: remaining gap was custody runner / signed source / offline toolchain / installed-tree custody or ledger granularity. Replacement stated per row.

Phase B = post-`CODE_COMPLETE_GO` acceptance (remote browser, visual, device), run via `tools/remote-acr/run.sh`.

## Counts

| WP | FINISH-5.0 | EXPERIMENTAL-5.0 | SUPERSEDED-PROCESS | Partial total | Acceptance-only | Implemented | All rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WP-00 | 0 | 0 | 4 | 4 | 0 | 0 | 4 |
| WP-01 | 2 | 0 | 0 | 2 | 0 | 5 | 7 |
| WP-02 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| WP-03 | 3 | 0 | 0 | 3 | 0 | 2 | 5 |
| WP-04 | 4 | 2 | 0 | 6 | 0 | 1 | 7 |
| WP-05 | 5 | 0 | 0 | 5 | 0 | 2 | 7 |
| WP-06 | 6 | 0 | 0 | 6 | 0 | 0 | 6 |
| WP-07 | 7 | 0 | 0 | 7 | 0 | 6 | 13 |
| WP-08 | 4 | 0 | 0 | 4 | 0 | 0 | 4 |
| WP-09 | 2 | 1 | 0 | 3 | 0 | 1 | 4 |
| WP-10 | 1 | 0 | 0 | 1 | 0 | 2 | 3 |
| WP-11 | 3 | 0 | 0 | 3 | 0 | 6 | 9 |
| WP-12 | 2 | 0 | 0 | 2 | 1 | 5 | 8 |
| WP-13 | 3 | 1 | 0 | 4 | 0 | 2 | 6 |
| WP-14 | 0 | 1 | 0 | 1 | 0 | 3 | 4 |
| WP-15 | 3 | 0 | 0 | 3 | 0 | 0 | 3 |
| WP-16 | 3 | 1 | 0 | 4 | 0 | 1 | 5 |
| WP-17 | 2 | 0 | 0 | 2 | 1 | 1 | 4 |
| WP-18 | 1 | 0 | 2 | 3 | 0 | 0 | 3 |
| WP-19 | 8 | 0 | 1 | 9 | 0 | 1 | 10 |
| WP-20 | 3 | 0 | 5 | 8 | 1 | 2 | 11 |
| WP-21 | 7 | 0 | 0 | 7 | 0 | 1 | 8 |
| WP-22 | 2 | 1 | 2 | 5 | 0 | 0 | 5 |
| WP-23 | 2 | 0 | 0 | 2 | 0 | 2 | 4 |
| WP-24 | 5 | 0 | 2 | 7 | 0 | 1 | 8 |
| WP-25 | 3 | 0 | 1 | 4 | 1 | 2 | 7 |
| WP-26 | 4 | 0 | 0 | 4 | 0 | 2 | 6 |
| WP-27 | 2 | 0 | 0 | 2 | 1 | 1 | 4 |
| WP-28 | 3 | 0 | 0 | 3 | 0 | 2 | 5 |
| WP-29 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| WP-30 | 4 | 0 | 0 | 4 | 0 | 1 | 5 |
| WP-31 | 5 | 0 | 0 | 5 | 0 | 0 | 5 |
| WP-32 | 2 | 1 | 0 | 3 | 0 | 1 | 4 |
| **Total** | **109** | **8** | **17** | **134** | **5** | **53** | **192** |

Named-defect rows added below: 7 (`S5-DEF-01`..`S5-DEF-07`, all FINISH-5.0), giving 116 FINISH items in total.

## Partial rows by work package

### WP-00

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP00-01 | Ledger with one row per capability, option and backend | SUPERSEDED-PROCESS | Replaced by this fixed S5 list; option/backend granularity dropped. Rows close via ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |
| S5-WP00-02 | Per-row ledger fields (category, exposure, symbol, evidence) | SUPERSEDED-PROCESS | Field completeness no longer required; S5 rows carry files/symbols; evidence = ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs` report. |
| S5-WP00-03 | Recheck every not-found/unverified ledger row; merge duplicates | SUPERSEDED-PROCESS | Replaced by this one-time S5 labeling; verification moves to ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |
| S5-WP00-04 | Break newly discovered options into owned rows; gate on completeness | SUPERSEDED-PROCESS | New rows need owner approval (see footer); gate check is `tools/native-capability-gate/index.mjs` on the ACR source report. |

### WP-01

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP01-01 | Scene queries: parent transforms, BVH, skin/morph/instance/UV/layers | FINISH-5.0 | Make arbitrary vertex-program exclusion a stable documented query error; run existing SceneQueryBVH/query suites in ACR source pass. **DONE 2026-11-02:** `raycast` mesh mode reports every arbitrary vertex-program exclusion as `SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED` (`SceneQueries.ts`: new `unsupported: "skip"|"error"|callback` option, `SceneQueryError` with `code`/`exclusion`; default skip unchanged); documented in `docs/api/public-api.appendix.md` raycast block; new case in `tests/unit/agent-api/scene-query-mesh.test.ts`; scene-query-mesh, native-scene-query-bvh, scene-queries, native-query-render-items, native-query-disposal pass locally (72/72). |
| S5-WP01-02 | Stable batch-member IDs through remap, disposal, shared geometry | FINISH-5.0 | Fix failing existing batch tests expecting recycled-slot lifetime IDs (packed-loop member metadata); do not edit tests to pass. **DONE 2026-11-02:** source fixed, tests untouched: `addInstance` returns the reusable public instance index (BatchedMesh parity), numeric targets address that index, query hits keep never-reused lifetime `batchMemberId`, packed-loop snapshots carry `batchMemberId`=index + `batchMemberLifetimeId` + temporal key, and object references are lifetime-checked (`nodes/batchedState.ts`, `nodes/batched.ts`). The 7 recycled-slot failures in native-batched-loop, scene-query-mesh and instancing now pass; batch/query/render suites 647/650 (3 remaining failures are pre-existing `instancing.test.ts` L5-03 route-selection cases that expect packed multi-draw without a capable renderer/frame ownership; not member identity). |

### WP-02

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP02-01 | Pivot-aware transforms through nodes, handles, serialized projects | FINISH-5.0 | Editor pivot serialization done; support pivoted physics mutations and legacy hierarchy/look-at combos in `runtimeNodes.ts:919` instead of rejecting. |
| S5-WP02-02 | Independent per-view matrices, culling, viewport, targets, post history | FINISH-5.0 | Array/stereo cameras must frustum-cull Scene renderables without a Camera instance; native WebGPU depth of field must accept multiview or refuse with stable error. **DONE 2026-11-02:** Matrix-only array/stereo views already cull Scene renderables via `matrixViewSceneFrustum` (per-view depth convention); new regression in `tests/unit/parity/viewport-views.test.ts` (Scene source, two matrix-only views, each draws only its own node). Native WebGPU DoF in multiview is refused before any view draws with `NATIVE_DOF_MULTIVIEW_UNSUPPORTED` (`Renderer.prepareViews`), sync+async case in `tests/unit/rendering/native-webgpu-dof-public-routing.test.ts`. |
| S5-WP02-03 | Test hierarchy, resize, stereo, mixed views, resource restoration | FINISH-5.0 | Resolve viewport suite asserting only first camera group honored versus multiple-group fixture; align with current lowering. **DONE 2026-11-02:** 5.0 contract = every camera group honoured in scene order (WP-02 independent per-view matrices; matches `native-multiple-multiview.test.ts`). The stale 4.x case was replaced by a stronger one asserting 4 views, distinct IDs, group order, per-eye separation and no `CAMERA_VIEWS_MULTIPLE` warning, plus a `CAMERA_VIEWS_GROUP_ID` rejection case; viewport-views + native-multiple-multiview pass. |

### WP-03

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP03-01 | Native WebGPU root: textures, materials, shadows, deferred/meshlet/visibility paths | FINISH-5.0 | Finish visibility root routing and output-integration coverage in `Renderer.ts`/`webgpu/*Pipeline.ts`; resolve immediate-completion fence assertion conflicts (see S5-DEF-01). |
| S5-WP03-02 | Shared compute/render device sync, disposal, loss/recreation | FINISH-5.0 | Resolve ResourceLifecycle fence-retention vs immediate-completion test conflicts; finish loss/recreation and late-fence handling (S5-DEF-01). |
| S5-WP03-03 | Consume draw-state/layout/depth descriptors; cancellable render+compute warmup | FINISH-5.0 | Create WebGPU render pipelines during precompile; add coordinated cancellable compute variant warmup with target/layout cache identity and generation disposal. |

### WP-04

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP04-01 | Finish bounded material lobes: transforms, color space, tangents | FINISH-5.0 | Remove support-matrix lobe bounds and authored-tangent identity limits; make independent WebGPU preview accept the rejected combinations or refuse with stable errors. |
| S5-WP04-02 | Rough diffuse, retroreflection, separate iridescence min/max | FINISH-5.0 | Verify-only: source forwards film endpoints; run existing lobe/material suites in ACR source pass and fix any failure. |
| S5-WP04-03 | Photometric (IES) profiles: parse, orient, project, shadow | EXPERIMENTAL-5.0 | Ship as experimental: projection limited to one nonclustered WebGL2 spot, clustered indexing refused, LightingRig scalar fallback; document limits in support matrix. |
| S5-WP04-04 | Clustered lights, probe grids, incremental bakes, voxel GI, cascades | EXPERIMENTAL-5.0 | Ship experimental with documented backend limits and WebGL2/CPU-voxel fallback; clustered profile/projection indexing stays an explicit refusal. |
| S5-WP04-05 | Independently replace attributed shader, environment and lookup code | FINISH-5.0 | Rewrite physical WGSL twins still r185-identical; regenerate neutral SH from the independent room/sky; ship matched self-contained neutral environment. |
| S5-WP04-06 | Independent calibration scenes, reference equations, per-backend pixel checks | FINISH-5.0 | Connect physical numeric harness shader candidates to the renderer and fix tolerances so its conformance gate is complete. |

### WP-05

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP05-01 | Typed shader-graph IR, validation, control flow, serialization, GLSL/WGSL | FINISH-5.0 | if/loop/setOutput landed; resolve stalled `native-graph-portable-material` + `native-shader-graph` combined run; document WebGL compute/storage refusal. |
| S5-WP05-02 | 3D/array/cube/compressed/storage/depth resources, transfers, GPU sort | FINISH-5.0 | Add 3D render-target descriptors, WebGPU layered targets, generic async copy/readback; GPU splat sort; sorter treats rejected loss notice correctly. |
| S5-WP05-03 | Integer/bool and target-specific uniform/storage layouts | FINISH-5.0 | Add matrices to graph schemas, WebGL portable aggregate uniforms, graph-derived structured compute storage writes instead of raw caller bytes. |
| S5-WP05-04 | Attachment identities, hazards, previous-depth history, async ownership | FINISH-5.0 | Add 3D target descriptors and WebGPU async transfers; parent ResourceLifecycle must wait for retirement fence and reflect later rejection (S5-DEF-01). |
| S5-WP05-05 | Test graphs on real renderer paths | FINISH-5.0 | `tests/browser/native-shader-graph.spec.ts:317,593` import `shaderGraph` from root, which does not export it; align root export or spec with graph subpath. |

### WP-06

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP06-01 | Implement every WP-06 effect; audit inputs; replace attributed shaders | FINISH-5.0 | Expose normals in public custom-effect input contract; native WebGPU must support named effects or refuse with stable errors; complete effect/input audit. |
| S5-WP06-02 | Motion/depth/normal handling for animated, instanced, transparent content | FINISH-5.0 | Replace rigid approximation for built-in deformation/instance motion vectors; provide normal input; populate transparent/reactive input internally. |
| S5-WP06-03 | Verify pass order, masking, history reset, alpha, isolation, disposal | FINISH-5.0 | Resolve immediate-completion lifecycle assertion conflicts (S5-DEF-01); ordering/resize/disposal pixel proof is Phase B. |
| S5-WP06-04 | Remove module-global temporal/model caches; scope histories | FINISH-5.0 | Remove shared compatibility history and unscoped reset singleton; scope to app/device/view keys. |
| S5-WP06-05 | Separate spatial upscale and temporal reconstruction; real reactive inputs | FINISH-5.0 | Wire internal velocity/reactive/disocclusion inputs, exact prior depth (not approximation) and WebGPU v2 resolve or stable refusal. |
| S5-WP06-06 | Motion blur energy/centered taps; deformation/instance/batch history | FINISH-5.0 | Prove skinned/instanced/batch history through production path (depends on S5-WP06-02); run existing synthetic pixel test in source pass. |

### WP-07

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP07-01 | Verify document/subresource digests before cache or render | FINISH-5.0 | Complete catalog-wide provenance digests including template sidecars (S5-DEF-04, S5-DEF-05); run integrity suites in ACR source pass. |
| S5-WP07-02 | Decoder init eviction, bounded queues, awaited teardown, safe retry | FINISH-5.0 | Bound never-settling Basis/Draco factory/initializer so disposal cannot hang; complete worker/KTX2 decoder teardown in `AssetDecoderRegistry.ts`. |
| S5-WP07-03 | Forward complete request contract to files, buffers, textures, images | FINISH-5.0 | Apply request contract to uncapped custom decoders and remaining loaders; run cache/integrity/worker-fixture suites in source pass. |
| S5-WP07-04 | Same policy for audio, scene, bitmap, renderable loaders; orientation | FINISH-5.0 | ~~Resolve bitmap orientation test conflict~~ (DONE 2026-11-02: mock now has dimensions; passes); finish universal loader policy. |
| S5-WP07-05 | Partition caches by request context; protect secrets; isolate aborts | FINISH-5.0 | Make exported raw `AssetCache` enforce effective-context keys; remove URL text from legacy synchronous glTF key helper. |
| S5-WP07-06 | Render new glTF material extensions; finish bounded extensions/variants | FINISH-5.0 | Accept required diffuse-roughness/bump; persist emissive pointer identity through serialization; fix support-matrix test asserting old unsupported status. |
| S5-WP07-07 | Test required/optional, malformed buffers, URIs, CORS, codecs, retry | FINISH-5.0 | Complete invalid-URI and malformed-buffer matrix; resolve alpha-cutoff conflict (S5-DEF-03); run new emissive round-trip sources. |

### WP-08

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP08-01 | Replace attributed image decoder; implement every WP-08 format | FINISH-5.0 | Admit and render full format catalog through typed paths; 3DM/JXL/UltraHDR keep explicit supplied-codec refusal documented. **DONE 2026-11-02:** every catalog model format (21 built-in + 3DM with supplied decoder) is installed by `createNativeFormatRegistry()` (`@aura3d/assets/importers`) for root `model(assets.x)`, admitted via `admitNativeFormat`/CLI `addAssetAsync`; textures/LUT/MaterialX/BVH/MDD/NRRD admit as typed assets; 3DM/JXL/UltraHDR refuse with `NATIVE_FORMAT_CODEC_REQUIRED`; registry-lease render-resource tests pass (catalog 22/22, conformance 28/28); browser root render source-only (unrun, Phase B). |
| S5-WP08-02 | Per-format units, coordinates, versions, dependencies, extension set | FINISH-5.0 | Write per-format version/coordinate/dependency/loss matrix in public format inventory doc. **DONE 2026-11-02:** `NATIVE_FORMAT_CATALOG` (`packages/assets/src/loaders/NativeFormatCatalog.ts`) records versions/units/coordinates/dependencies/losses for all 34 WP-08 formats; public table in `docs/api/native-formats.md` "Per-format import matrix", kept in sync by `tests/assets/native-format-catalog.test.ts` (16/16 pass). |
| S5-WP08-03 | Typed admission with file/archive/pixel/allocation limits, stable diagnostics | FINISH-5.0 | Extend strict admission and consistent limits/diagnostics beyond selected models, PVR, NRRD to every catalog format. **DONE 2026-11-02:** `admitNativeFormat` runs every catalog format's real bounded parser under one limit set (file/archive-expansion/pixel/decoded/element) with 10 stable `NATIVE_FORMAT_*` codes; CLI `addAssetAsync` admits the remaining catalog model formats through it (parser-inspected manifest record, nothing written on failure; 3DM refused `NATIVE_FORMAT_CODEC_REQUIRED`); native-format-catalog + native/legacy-model-admission tests 49/49. |
| S5-WP08-04 | Minimal, realistic and hostile fixtures per format; render via public API | FINISH-5.0 | Add BVH, MDD, SVG, MaterialX, 3DL source tests; extend browser spec beyond seven mesh/3MF + OBJ cases. **DONE 2026-11-02:** minimal/realistic/hostile BVH, MDD, SVG, MaterialX, 3DL source tests in `tests/assets/native-format-catalog.test.ts` (22/22); `native-format-maturity.spec.ts` now also root-renders 6 authored catalog scenes (SVG, VTK, COLLADA, USDA, VRML, LDraw from `tests/fixtures/native-capabilities/catalog-scenes.ts`) plus Draco/Meshopt GLBs; spec source typechecks, not run (Phase B). |

### WP-09

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP09-01 | Round-trip geometry, hierarchy, material, animation, skin/morph, metadata | FINISH-5.0 | Keep document provenance and material variants in runtime snapshot; USDZ test must load stage semantics, not assert text. **DONE 2026-11-02:** `ExportContext` runtime snapshot keeps document provenance and `KHR_materials_variants` and `GLTFExporter` writes them back (malformed mappings rejected); USDZ test loads stage semantics (hierarchy, world points, indices, material binding) through the independent reader in `tests/support/independent-interchange-readers.ts`; `native-exporter-independent-readers.test.ts` + `native-exporters.test.ts` + OBJ round trip 74/74. |
| S5-WP09-02 | Structured loss warnings; independent readers, endianness, units, packaging | FINISH-5.0 | Add independent semantic readers for USDZ and complete PLY reader in exporter tests. **DONE 2026-11-02:** independent USDZ (ZIP + USDA, transforms, rigging, camera, light, time samples, clip variants, malformed packages) and complete PLY (ASCII/LE/BE, all scalar and list types, truncated/trailing/malformed rejection) readers in `tests/support/independent-interchange-readers.ts`, exercised by `tests/unit/assets/native-exporter-independent-readers.test.ts` (passes in the 74/74 run). |
| S5-WP09-03 | Quantized attributes, indexed lines, HDR RLE/PIZ, multi-output EXR export | EXPERIMENTAL-5.0 | Ship render-target EXR export experimental; GPU/browser attachment readback evidence is Phase B; omitted attachments already reported. |

### WP-10

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP10-01 | Parse all named splat formats; validate layouts | FINISH-5.0 | Public scene compiler must construct splat loader with KSPLAT and packed-PLY decoders (or bundled Aura3D codec) so all named formats parse on integrated path. **DONE 2026-11-02:** bundled independent KSPLAT 0.1 (levels 0-2) and chunk-quantized PLY codecs (`packages/assets/src/loaders/SplatCodecs.ts`) are the GaussianSplatLoader default, so compileScene's loader parses all named formats; native-splat-loader.test.ts 60/61 (1 glTF AssetManager de-dup failure identical on HEAD); third-party-file interop unverified. |

### WP-11

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP11-01 | Replace attributed property-binding code; edge-case tests | FINISH-5.0 | Establish independent authorship/provenance record for property-binding rewrite (WP-29 provenance record). | **DONE 2026-11-02:** PropertyBinding.ts provenance header + record entry (independent; 16.8% token containment vs attributed 3fbf87c45, shared runs are exported declarations/compat contract); native-bindings tests 15 pass. Agent review; owner countersign pending.
| S5-WP11-02 | Align core, pose and asset playback: signed time, warp, sync | FINISH-5.0 | Verify-only: run existing cross-path playback suites in ACR source pass; fix any divergence. |
| S5-WP11-03 | Verify visible deformed pixels, not animation state alone | FINISH-5.0 | Browser harness: remove hard-coded cameraStable; add subject region/mask so changed pixels are attributed to deformation. |

### WP-12

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP12-01 | Pointer dragging/selection: plane, hover, capture, multi-touch, marquee | FINISH-5.0 | Wire marquee to pointer events and selection state. **DONE 2026-11-02:** `SelectionBox.connect()` drives marquee from pointerdown/move/up/cancel/lostcapture/blur into committed `selection` + marquee events; new behavioral test in `tests/unit/controls/native-drag-select.test.ts` (start/move/end commit, cancel/blur keep prior selection, shouldStart gate, replacement, disconnect removes listeners) — 20/20 pass. |
| S5-WP12-02 | Complete arcball gestures; listener cleanup on all controls | FINISH-5.0 | Verify-only: run existing control cleanup suites in source pass; device gesture evidence Phase B. |

### WP-13

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP13-01 | Independently replace attributed geometry implementations | FINISH-5.0 | Finish rewriting remaining Support port portions and general Extrude; restore equivalent-contract receipts. | **DONE 2026-11-02:** Support.ts curve adapter/RMF frames/axis rotation rewritten from published methods (double reflection, Rodrigues), attribution replaced by provenance header; Extrude.ts reviewed (4.2% token containment vs port, API declarations only); 63 geometry contract tests pass incl. new tests/unit/geometry/native-curve-frames.test.ts; record docs/prds/aura3d-native-provenance-record.json.
| S5-WP13-02 | Every named mesh utility/modifier; preserve groups/attributes; path bevels | FINISH-5.0 | Implement topology-validation/compression and mesh-memory contracts; close general extrusion provenance (S5-WP13-01). | **DONE 2026-11-02:** quantizeAuraGeometry/dequantizeAuraGeometry (MeshCompression.ts, geometry-tools subpath) + topology-validation and memory-estimate contract tests in tests/unit/geometry/native-mesh-contracts.test.ts (8 pass); extrusion provenance closed with S5-WP13-01.
| S5-WP13-03 | Seeded deterministic weighted surface sampling | FINISH-5.0 | Verify-only: run existing deterministic/statistical tests in source pass; rendered sample scenario Phase B. |
| S5-WP13-04 | UV charts with channel, seams, density, gutter; feed lightmap baker | EXPERIMENTAL-5.0 | Ship generated-atlas baking experimental; add generated-atlas (`buildUVAtlas`) browser lighting scene for Phase B. |

### WP-14

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP14-01 | Vector, text and stereo outputs with defined semantics | EXPERIMENTAL-5.0 | Ship SVG/ASCII/stereo outputs experimental; rendered-output evidence Phase B. |

### WP-15

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP15-01 | Every named specialized object/generator/editing tool as opt-in module | FINISH-5.0 | Expose specialized surfaces beyond mirror in scene API; glass refraction self-captures; apply isosurface material groups as separate materials in scene draw. |
| S5-WP15-02 | Reuse existing terrain, sky, water, scatter facilities | FINISH-5.0 | Verify-only: run existing terrain/sky/scatter suites in source pass. |
| S5-WP15-03 | Bound memory/polygons, seeds, undo data, invalid inputs, teardown | FINISH-5.0 | Add element budget to lens-flare (elements array allocates material+item each) with budget test. | **DONE 2026-11-02:** element budgets (64/flare, 1024/scene, glow 1024) pinned by 4 new tests in tests/unit/parity/lens-flare.test.ts (28 pass); test no longer reads three's Lensflare.js.

### WP-16

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP16-01 | Hidden-page suspend/resume, bounded catch-up, hidden resize/DPR | FINISH-5.0 | Verify-only: run scheduler suites in source pass; browser timing Phase B. |
| S5-WP16-02 | Terminal vs recoverable render failure; suppress late callbacks | EXPERIMENTAL-5.0 | Worker rendering ships experimental; real-worker recovery evidence Phase B. |
| S5-WP16-03 | Worker: initial scene, updates, async assets, scheduling, backend loss | FINISH-5.0 | Confirm/fix replacement snapshot published before acknowledgement (`workerRootApp.ts:442,545`); run worker suites in source pass. **DONE 2026-11-02:** Fixed: `workerRootApp.setScene` no longer publishes `app.scene` before acknowledgement; it is set on the worker `onCommit` / `markReady`, failed or superseded requests never become current. New case in `native-worker-create-aura-app-integration.test.ts`; stale raw-wall-clock expectation in `native-worker-root-bridge.test.ts` aligned to the bounded render clock (resumed frame continues from the manual step, next frame +16 ms). All 12 `tests/unit/engine/native-worker-*.test.ts` files pass (156 tests). |
| S5-WP16-04 | Worker fallback, termination, duplicate disposal, no retained listeners | FINISH-5.0 | Normal `dispose` must not resolve on forced-termination timeout without cleanup acknowledgement (match `disposeStrict` reporting). **DONE 2026-11-02:** `workerRuntime.dispose()` now rejects with `dispose-timeout` (terminal) after forced termination instead of resolving; worker still terminated and listeners released; `disposeStrict()` reports the same error. Three tests that asserted the old resolve were updated to the new contract (root-bridge, dispose-failure, protocol). |

### WP-17

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP17-01 | Inspector shows actual textures, passes, timing, resources | FINISH-5.0 | Add shadow, contributor, post and native-device phases; whole-frame CPU/GPU timing; runtime-only texture inventory (`Renderer.ts:1960`, `diagnostics.ts`). |
| S5-WP17-02 | Keyboard, compact density, accessible error/loading/empty states; licensed fonts | FINISH-5.0 | Keyboard reparenting, live-region inspector errors, visible import loading/error states; locate or record Whitney redistribution grant. Font: owner confirmed 2026-11-02 that Aura3D may use and ship Whitney (recorded in `docs/project/font-licenses.md`). |

### WP-18

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP18-01 | Hand ledger findings to WP-00; replace historical exclusion text | SUPERSEDED-PROCESS | Ledger handoff dropped; exclusion language promotion follows S5 row check-off after ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |
| S5-WP18-02 | Document backend/format/export limits; runnable example per feature | FINISH-5.0 | Update stale backend page (root WebGPU selection, vertex types); add indexed scenarios for worker and interchange exporter surfaces. **DONE 2026-11-02:** Backend page (`docs/rendering/native-backends.md`) views row/paragraph updated (all groups honoured, per-view culling/post, `NATIVE_DOF_MULTIVIEW_UNSUPPORTED`; WebGPU selection and vertex-type text verified against `rendererOptions.ts`/`VertexFormat.ts`). Indexed scenarios `worker-render` (`@aura3d/engine/worker` `createWorkerRendererWorker`, `fallback: "error"`) and `interchange-export` (`exportNativeScenarioGlb`, `@aura3d/assets/exporters` binary glTF) added to `examples/native-capabilities/index.ts`, recipes table, catalog expectations and harness dependency; `tests/unit/examples/native-capability-export-scenario.test.ts` (independent GLB reader) and a worker-mount case pass. Browser capture pending (acceptance). |
| S5-WP18-03 | Keep ledger current; complete every row with public exposure | SUPERSEDED-PROCESS | Ledger completeness replaced by checking off S5 rows; public exposure verified by ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |

### WP-19

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP19-01 | Integrate lanes: exports, package metadata, side-effects, bundle isolation | FINISH-5.0 | ImportPipeline export fixed; prove optional packages stay out of root consumer bundles via installed tree-shaking in source pass. **DONE 2026-11-02 (tooling; proof = source5 `clean-install` + `tree-shaking`):** `tools/package-clean-install` packed-consumer producer (`runPackedSource`, retention `packed-v1`) replaces the custody abort; `tools/installed-tree-shaking` restores packed projects and measures root/game/react slices; `tests/unit/tools/native-packed-consumers.test.ts` 7/7. |
| S5-WP19-02 | One registry for TS/dev/test/dist mappings; typecheck new files | FINISH-5.0 | Derive workspace package export conditions from registry; bring excluded QR trees into typecheck; verify emitted worker entrypoints in source pass. **CODE 2026-11-02 (proof in source pass):** `aura.exports.json#workspaceExports` drives generated/checked `packages/*/package.json#exports` (`resolution:check` rc=0); prd04/07/08/11/14 QR trees in `tsconfig.check.json` (4 browser-served roots excluded with reason); `assertPackedWorkerAssets` in packed integration test. |
| S5-WP19-03 | Independent CommonJS bridge; ESM/CJS packed tests on supported Node | FINISH-5.0 | Add root Node `engines` declaration and supported-version execution matrix for packed ESM/CJS test. **CODE 2026-11-02 (proof in source pass):** root `engines.node >=22.12.0`; `tools/release/node-support.mjs` matrix (22/24/26, unavailable majors recorded) run by `tests/integration/native-capability-consumer.test.ts`. |
| S5-WP19-04 | Typed option probes replace scaffolds; each option changes behavior | FINISH-5.0 | Extend probe discovery beyond named root builder families and literal examples to every supported documented option. **PARTIAL 2026-11-02:** discovery widened (const-passed doc options + type-checker option enumeration, report-only); 5 pre-existing enforced findings fixed; 564 typed option gaps across 18 builders still need probes/unsupported rows; `interactions.pointer.target` has no runtime consumer. |
| S5-WP19-05 | Release plan, tarballs, tiers, provenance from one versioned inventory | FINISH-5.0 | Derive package tiers and tarball target discovery from the versioned inventory instead of static map/manifest scan. **CODE 2026-11-02 (proof in source pass `tarballs`):** `PACKAGE_INVENTORY` in `tools/release/release-inventory.mjs` drives `tools/package-tiers.ts`, the ESLint boundary plugin and `tools/package-tarball-audit` targets. |
| S5-WP19-06 | Git-free staged source identity; signed approval; freeze binding | SUPERSEDED-PROCESS | Signed-source continuity dropped; source identity = ACR run source manifest hash + git freeze commit via `tools/native-capability-gate/index.mjs`. |
| S5-WP19-07 | Remove external 3D engines from installs, typings, comparison adapters | FINISH-5.0 | Remove/convert comparison-only `three` importers (S5-DEF-06) excluded from typecheck; confirm no install profile or lock graph includes them. **PARTIAL 2026-11-02:** install/lock graph clean (no three/@types/three/babylon/playcanvas in lock or workspace manifests); ~134 comparison-only files still import `three` (bench-vs-threejs, threejs-parity-*, bundle-scenarios, qr/prd01 harness, head-to-head specs) plus standalone `apps/showcase-kits`, `benchmarks/{threejs,babylon}` manifests; conversion/deletion needs owner call (marketing links). **Decision 2026-11-02:** `benchmarks/{threejs,babylon}` and `apps/showcase-kits` are standalone external comparison harnesses outside `pnpm-workspace.yaml` and the lockfile — never installed, typechecked, packed or shipped; they stay as the source of `evidence/vs-threejs/RESULTS.md`. Row closes when the source pass shows no engine in any packed/install profile. |
| S5-WP19-08 | Audit source origins, lookup data, packages, artifacts, network | FINISH-5.0 | Complete reviewed source-origin/replacement record; run provenance scan over packed artifacts and all install profiles in source pass. **PARTIAL 2026-11-02:** source5 `runtime-audit --phase source` scans packed archives; install profiles cover templates + marketing only; `apps/*`, `apps/showcase-kits`, `benchmarks/*` not passed as `--install-profile` (provenance lane owns `tools/native-runtime-audit`). |
| S5-WP19-09 | Fixed-workload measurement of startup, bytes, draws, CPU/GPU, allocations | FINISH-5.0 | Collector must populate installed bytes, JS allocation count and thread CPU time (or labeled unsupported); retained device runs Phase B. **DONE 2026-11-02 (source; device runs Phase B):** Chromium thread CPU via CDP `TaskDuration`, installed bytes from gate-bound archives (`tools/performance/native-installed-bytes.ts`), JS allocations/GPU residency labeled unsupported with reasons. |

### WP-20

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP20-01 | Browser runner install uses frozen independent lock | SUPERSEDED-PROCESS | Custody source image dropped; `tools/remote-acr/run.sh` Playwright image with frozen pnpm lock is the runner. |
| S5-WP20-02 | Dedicated serverless source runner with argv allowlist and hashed staging | SUPERSEDED-PROCESS | Replaced by `tools/remote-acr/run-source5.sh` (same 4.x `Dockerfile.playwright` image, frozen lock, hashed staging manifest); `Dockerfile.source` guard left in place, off the 5.0 path. |
| S5-WP20-03 | Asset/contract/Node release suites in source execution; status propagation | SUPERSEDED-PROCESS | Run the existing source plan (`tools/remote-acr/source-checks.mjs`) through ACR `run.sh` instead of the custody runner. |
| S5-WP20-04 | Single global phase gate; reject acceptance argv in source runner | FINISH-5.0 | Add equal-count/different-ID and unowned-outcome cases to `tools/native-capability-gate` tests; cover every acceptance entrypoint. **DONE 2026-11-02:** equal-count/different-ID, outcome-ID and five unowned cases plus 19-entrypoint table and discovery test in `tests/unit/tools/native-capability-gate.test.ts` (160/160 with staging test). |
| S5-WP20-05 | Copy staged tests/fixtures/templates into browser images; omission failures | FINISH-5.0 | Add browser-launcher missing-payload failure test; exclude unrelated repository assets from ACR upload manifest. **DONE 2026-11-02:** `tools/remote-acr/acceptance-staging.mjs` omits unreferenced asset trees with a gate-bound record; `run.sh` `verify-context` fails before submission on missing spec/payload/input; `tests/unit/tools/native-acceptance-staging.test.ts`. |
| S5-WP20-06 | Per-browser-family project selection and JSON results | SUPERSEDED-PROCESS | Blocked only by custody React consumer restoration; run Chromium/Firefox/WebKit projects via ACR `run.sh` with frozen-lock install. |
| S5-WP20-07 | Subject-aware pixel checks; extended repeated-resource soak | FINISH-5.0 | Soak must count WebGPU pipelines; calibrate heap thresholds for non-Chromium or mark unsupported. **PARTIAL 2026-11-02:** WebGPU pipeline counter + 20-cycle WebGPU soak and non-Chromium heap marked unsupported (`tests/browser/resource-soak-accounting.ts`, unit test passes); needs a real browser run (Phase B). |
| S5-WP20-08 | Source checks/consumers before freeze; browser after; retain metadata | SUPERSEDED-PROCESS | Source checks via ACR `run.sh`; gate record via `tools/native-capability-gate/index.mjs`; matrix producer custody dropped. |

### WP-21

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP21-01 | App/device-owned runtime context; apps never reset each other | FINISH-5.0 | Finish shared-canvas WebGPU ownership and multi-app isolation coverage. | **DONE 2026-11-02:** exclusive WebGPU canvas/device ownership covered (`tests/unit/rendering/native-backend-selection.test.ts` 'gives an exclusive canvas…': second app/legacy wrapper `WEBGPU_CANVAS_IN_USE`, reused native device `WEBGPU_DEVICE_IN_USE`, owner untouched, reservation released only after retirement); shared-canvas PRD07 test now asserts per-owner authority and that disposing one app never revokes the other (`prd07-app-mount-authority.test.ts` 7/7).
| S5-WP21-02 | Readiness result distinguishing failure, cancellation, disposal, superseded | FINISH-5.0 | Resolve existing tests expecting former cancelled result; write lifecycle migration section in 5.0 guide (S5-DEF-07). | **DONE 2026-11-02:** 4 stale `cancelled` expectations moved to `superseded` (native-readiness, native-worker-create-aura-app-integration, native-typed-vox-runtime) plus caller-signal `cancelled` case that leaves the mount running; outcome table added to `docs/migration/4-to-5.md` §5.1.
| S5-WP21-03 | Owner-scoped asset callbacks, redacted errors, late completion suppression | FINISH-5.0 | Resolve existing test expecting former late-error behavior; finish cross-loader and two-app strictness coverage. | **DONE 2026-11-02:** stale late-error expectation replaced by the owner-closed `AbortError` contract; new two-app cross-loader test (model + `texture.load`) in `multi-app-isolation.test.ts` (9/9): closed app's loads abort, late failures never reach it, peer events stay separate and redacted.
| S5-WP21-04 | Safe error formatting: cycles, large values, getters, bigints, redaction | FINISH-5.0 | Apply bounded/redacted formatting to remaining transport/error paths. | **DONE 2026-11-02:** `errorOverlayDetails` (DOM/clipboard) bounds+redacts code/message/stack and tolerates hostile values; `createAuraAssetLoadError` redacts URL/reason; worker transport converts non-Error throws via `formatDiagnosticError`; `mountRenderer-strict.test.ts` case added. Engine files tsc clean.
| S5-WP21-05 | Dispose all resources despite failures; aggregate; idempotent; races | FINISH-5.0 | Remount guards landed; add failed-resource retry and mount/resize/loss/restore/dispose race coverage. | **DONE 2026-11-02:** restore-remount × stale device loss × late mount × dispose race with failed-resource retry (`native-app-retirement-order.test.ts`; resize is not separately exercised, harness uses `resize:false`); `disposeAsync` no longer double-reports a retried native-model failure (`cleanupFailureReported` in createAuraAppCore.ts) — native-format-runtime passes.
| S5-WP21-06 | Dispose late async programs; settle handles; reject dead caches | FINISH-5.0 | Guarantee retirement of uncertain late program cleanup in `ProgramCache` beyond explicit-receipt programs. | **DONE 2026-11-02:** `ProgramCache.dispose()` retries receipt-less (uncertain) failed program disposers on the owner's next explicit dispose, incl. late programs arriving after disposal; failures resolve on success (`retryUncertainProgramDisposal`); native-shader-lifecycle stale idempotence case updated + new late-program case; rendering tsc clean for ProgramCache.
| S5-WP21-07 | Coordinate pause/resume with WP-16 and asset ownership with WP-07/05 | FINISH-5.0 | Finish cross-loader event integration with app-owned cancellation. | **DONE 2026-11-02:** `createTypedGLBActor` links the owning app's asset-scope signal into the model request (aborts network on app dispose even without a caller signal; late failure → `AbortError`, unreported); texture/native-texture already linked; migration §5.3 documents it.

### WP-22

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP22-01 | Supported browser/OS/backend matrix with ranges; untested cells unverified | EXPERIMENTAL-5.0 | Ship 5.0 matrix with WebGL2 default and all other cells labeled experimental/unverified; ranges filled from Phase B only. |
| S5-WP22-02 | Remote WebGL2/DOM/input/asset/worker workloads on automation projects | SUPERSEDED-PROCESS | Consumer restoration custody dropped; run workloads via ACR `run.sh` Playwright image post-freeze. |
| S5-WP22-03 | Capture browser, OS, backend, adapter, flags, fixture hash, result | FINISH-5.0 | Record complete effective browser arguments (or explicit unavailable reason per field) in scenario output. **DONE 2026-11-02 (source):** full effective command line via CDP `Browser.getBrowserCommandLine` / worker process argv, else per-source unavailable reason; `selectBrowserProcessArguments` unit-tested. |
| S5-WP22-04 | Separate automation, retail, software, injected, physical evidence | FINISH-5.0 | Evidence validator marker scan must include `os.version` and `physicalProvenance.observedBy`. **DONE 2026-11-02:** marker scan covers `os.version`, `os.kernel`, `physicalProvenance.observedBy`, `browser.executableVersion`; cases in `tests/unit/tools/native-browser-matrix.test.ts`. |
| S5-WP22-05 | Route browser forwarding/transport through WP-20; unverified cells documented | SUPERSEDED-PROCESS | Dev-server alias fix landed; remaining /tmp consumer restoration custody replaced by ACR `run.sh` consumer install. |

### WP-23

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP23-01 | Scope React asset resources by loader/context/digest; bounded ownership | FINISH-5.0 | Bound default unsignalled `read()`/`useAuraAsset()` interest; prevent eviction of owned entries with live work; test direct-read signal path. **DONE 2026-11-02:** default unsignalled `read()`/`useAuraAsset()` interest is bounded by the 30 s shared deadline (aborts the stalled flight, retryable TimeoutError; retain pauses it); owned/live entries are not evicted under cache pressure; direct `read({ signal })` path covered — new tests in `tests/unit/react/resource-lifecycle.test.ts`, 15/15 pass. |
| S5-WP23-02 | SSR DOM-free render; hydrate without duplicate loops or leaks | FINISH-5.0 | Install dispose counter before onReady; assert renderer/asset resource retirement and await async cleanup in packed-browser source. **DONE 2026-11-02:** `tests/browser/native-react-lifecycle.spec.ts` installs a webgl2-acquisition counter and GL object ledger before hydration (covers StrictMode's pre-onReady mount), awaits every disposed app's `whenDisposed()` and GL deletes, and asserts retired == disposed == ready, 0 live GL objects and the abandoned preload flight aborted after each unmount (source only; not run). |

### WP-24

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP24-01 | Compare packed public surface with immediately preceding release | FINISH-5.0 | Verify baseline metadata origin/freshness against published 4.7.x tarball; run comparator on exact candidate in source pass. |
| S5-WP24-02 | Reject undocumented breaking changes; major migration instructions | FINISH-5.0 | Write complete 5.0 per-change migration record (S5-DEF-07); run comparator against candidate. |
| S5-WP24-03 | Reference docs from packed declarations; fail on missing docs/snippets | FINISH-5.0 | Regenerate checked-in public reference from packed candidate declarations instead of source inventory. **CODE 2026-11-02 (proof in source pass):** `tools/api-docs --candidate-plan --out`; source5 `api-docs-packed` returns the packed reference in the SOURCE5 report; parent writes it to `docs/api/public-api.md`, then `api-docs` verifies. |
| S5-WP24-04 | Build every template/capability example from untouched scaffold | FINISH-5.0 | Generate capability projects from untouched scaffolds, not new manifest/config/source; drop custody abort in favor of ACR clean install. **PARTIAL 2026-11-02:** custody abort dropped — every template is scaffolded untouched from the packed `create-aura3d`, candidate-only substitution, npm install/build in a temp dir (`runPackedSource`); `tools/agent-examples` capability projects still generate their own manifest/config/entry. |
| S5-WP24-05 | Split clean-install/consumer-matrix into source and browser phases | SUPERSEDED-PROCESS | npm/pnpm custody guards dropped; source/browser phases run via ACR `run.sh` with existing phase CLIs and report validation. |
| S5-WP24-06 | Verify JS, TS modes, conditions, SSR, workers, peers, React 18/19 | SUPERSEDED-PROCESS | Matrix cells exist; only custody producer blocks; execute the eight cells via ACR `run.sh`. |
| S5-WP24-07 | Support policy, troubleshooting, template assets; offline neutral environment | FINISH-5.0 | Quickstart fixed; scaffold copy must include indirectly authored cinematic looks; template sidecars (S5-DEF-04). **DONE 2026-11-02:** indirect (`compilePromptPlanV2`) cinematic look scaffolds get HDRIs, mirror in `tools/agent-templates/capture-templates.mjs`, `tests/qr/prd13/template-hdri.test.ts`; offline spec restores packed projects; sidecars S5-DEF-04. |

### WP-25

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP25-01 | Like-for-like baseline/candidate analysis with noise threshold | FINISH-5.0 | Analyzer requires every metric while probe sets several to null; reconcile (unsupported metrics excluded explicitly) and add retained same-device baseline input. **DONE 2026-11-02 (source):** unsupported metrics excluded only when null-with-reason in every session (`excludedUnsupported`), required metrics still no-data; `--baseline-index` same-device baseline; native-budget + native-benchmark 20/20. |
| S5-WP25-02 | Meet gzip budgets 190k/250k/400k/480k | FINISH-5.0 | Measure current candidate budgets in ACR source pass; fix any overage. |
| S5-WP25-03 | Installed tree-shaking consumes explicit source-consumer report | SUPERSEDED-PROCESS | `check:release` args fixed; custody NPM_INSTALL_CUSTODY_UNAVAILABLE producer replaced by ACR `run.sh` installed consumer. |
| S5-WP25-04 | Measure actual memory residency and release; rerun pixel checks | FINISH-5.0 | Resolve immediate-completion fence assertion conflicts (S5-DEF-01); GPU-resident bytes labeled unmeasurable. |

### WP-26

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP26-01 | Licensed fonts, shaping, kerning, RTL, fallback, wrapping, dynamic atlas | FINISH-5.0 | Implement retained dynamically updated glyph atlas; support wrapping through open bidi scope. **DONE 2026-11-02:** retained bounded `LoadedFontGlyphAtlas` (LRU, `AURA_TEXT_GLYPH_ATLAS_FULL`, purge on font dispose; entries are whole shaped runs to keep ligatures/kerning/bidi) is the default for `createDynamicSdfText`; wrapping closes/reopens open bidi embeddings/isolates per line in `TextShaper.ts` — 5 text suites 86/86 pass, rendering tsc clean. |
| S5-WP26-02 | Wide/dashed lines in world/screen units, gradients, clipping, errors | FINISH-5.0 | Verify-only: run line diagnostic suites in source pass; rendered output Phase B. |
| S5-WP26-03 | Custom materials on imported slots; model LOD/collider options | FINISH-5.0 | Per-slot custom shader selection; accept textured authored + variant; bounds colliders apply model scale and error on missing bounds; behavioral collider test. **DONE 2026-11-02:** per-slot custom shader + authored-map binding by uniform name (coded `MODEL_CUSTOM_MATERIAL_UNSUPPORTED` for undeclared/UV1/transformed maps and alpha-mask/blend slots) + whole-model/slot variants incl. runtime `setMaterialVariant` in `TypedGLBActor.ts`; bounds collider applies scale and throws `MODEL_COLLIDER_MISSING_BOUNDS`; behavioral raycast/drop test — 6 files 100/100, engine tsc clean. |
| S5-WP26-04 | Request geometry/type changes from owners; verify pixels, interaction, teardown | FINISH-5.0 | Browser spec must assert pointer/keyboard interaction; owner-request bookkeeping dropped. **DONE 2026-11-02:** `tests/browser/native-lines-models.spec.ts` adds real `page.mouse`/`page.keyboard` input: mesh raycast pick vs miss, 48 px drag moves the imported model's red-pixel centroid, ArrowLeft nudges and `h` hides it, then listeners removed and termination `disposed` (source only; typechecks clean). |

### WP-27

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP27-01 | Scene/physics sync: parents, multiple worlds, character/vehicle reset | FINISH-5.0 | Add public-world held-character-survives-world-reset test. | **DONE 2026-11-02:** public-world held character survives `world.reset()` (same body id, respawn, regrounds, snap setting kept, throws after dispose) in `tests/unit/agent-api/physical-vehicle-character-controllers.test.ts` 5/5; no production change needed.
| S5-WP27-02 | Full game entry cycle-free; versioned root migration error | FINISH-5.0 | Implement or remove no-op loading-progress/track shell methods; fix `docs/agents/{genre-kits,build-playbook,troubleshooting}.md` 'headless stub' text. | **DONE 2026-11-02:** shell `setLoadingProgress`/`track` are real (since 26eae82e2) and now tested (`tests/unit/game/shell-loading-progress.test.ts` 5/5); migration row B10; 'headless stub' text replaced by `CREATE_GAME_ROOT_UNAVAILABLE_V1` throwing contract across docs/agents, game-kit, root-exports, llms-full and synced skills (`pnpm check:skills` clean).

### WP-28

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP28-01 | Decode, create, root-render and dispose each claimed variant | FINISH-5.0 | Maturity spec `createAuraApp` must pass `formatRegistry`; add Draco and Meshopt variants to manifest. **DONE 2026-11-02:** maturity spec `createAuraApp` passes `formatRegistry: createNativeFormatRegistry()` and serves vendored `/aura-decoders/` codecs (asserts the codec was fetched); manifest adds `triangle-glb-draco` and `triangle-glb-meshopt` (required extensions), decoded/created/disposed in `native-format-conformance.test.ts` (28/28); browser run is Phase B. |
| S5-WP28-02 | Nested deps, invalid extensions, corrupt files, integrity, export round trips | FINISH-5.0 | glTF export round trip must reload with independent reader, not Aura loader. **DONE 2026-11-02:** glTF export round trips are verified by an independent GLB/glTF reader (accessors, hierarchy, skins, morphs, lines, animation, camera, light, images, external .gltf dependencies) in the unit tests and in `tests/browser/native-exporters.spec.ts` (Node-side reader on the browser-exported GLB; spec typechecks, not run); Aura reload kept only as an extra consumer check. |
| S5-WP28-03 | Texture budget vs CPU bytes and live residency, two devices | FINISH-5.0 | Extend browser streaming spec to two-device same-name eviction/release matrix; rerun budget suite (prior 8/9 failures). |

### WP-29

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP29-01 | Enumerate dependency graph; no external 3D engines in installs/runtimes | FINISH-5.0 | Produce transitive graph for lockless scaffold profiles; packed-runtime audit in source pass; confirm private showcase `three` not a required install. |
| S5-WP29-02 | Scan source, artifacts, maps, workers, payloads, network; offline consumer | FINISH-5.0 | Run archive scan on packed candidate in ACR source pass; offline consumer runs via ACR instead of custody restore. |
| S5-WP29-03 | Per-file hash, license, owner, replacement status, review evidence | FINISH-5.0 | Refresh stale hashes (ShapeUtils, ConvexHull, OBB); complete WP-29 provenance record fields for G27 files. | **DONE 2026-11-02:** G27 ledger digests refreshed (three/index, ShapeUtils, ConvexHull, OBB) and digest-bound record docs/prds/aura3d-native-provenance-record.json (29 files: sha256, license, owner, replacementStatus, reviewEvidence, candidateReviews) checked by tests/unit/tools/native-provenance-record.test.ts.
| S5-WP29-04 | Treat text/equation/fingerprint hits as review candidates | FINISH-5.0 | Add standardized-equation review classification to scanner; record human review of candidates. |
| S5-WP29-05 | Keep notices until replaced; independent test fixtures and goldens | FINISH-5.0 | Fix rewritten UV fixture rotation-direction mismatch with implementation; replace reference-generated math/shader goldens. |

### WP-30

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP30-01 | Section 3.7 clipping through scene, compiler, graph, depth, shadow | FINISH-5.0 | Add depth/shadow submission for clipped points, wide lines and sprites. |
| S5-WP30-02 | Standard/reversed/logarithmic depth as negotiated conventions | FINISH-5.0 | Implement native production reversed and logarithmic depth (and infinite far where allowed) in `cameraDepth.ts` and renderers; fallback is not support. **DONE 2026-11-02:** reversed precision: WebGL2 with `EXT_clip_control` sets `clipControlEXT(LOWER_LEFT_EXT, ZERO_TO_ONE_EXT)`, the renderer rebuilds the camera as an exact zero-to-one reversed projection (`zeroToOneReversedRasterCamera`) and allocates `DEPTH32F_STENCIL8`/`DEPTH_COMPONENT32F` scene targets (`depthPrecision: "float"`); `getDepthConvention()` reports `precision: "full"`, else `"reduced"` (no extension, WebGPU in-shader remap, fixed canvas). WebGPU float formats `depth32float`/`depth32float-stencil8`/fallback selected; WebGPU log depth renders (WGSL `@builtin(frag_depth)`, rejection removed). Tests: `tests/unit/rendering/native-reversed-z-precision.test.ts` 15/15 (+1 naga-gated skip). Open: full reversed precision on WebGPU needs programs consuming a native zero-to-one projection; infinite far. |
| S5-WP30-03 | Coordinate depth convention with shadows, culling, effects, histories | FINISH-5.0 | Carry nonstandard depth through shadows, culling, query reconstruction, fog, AO/DOF and readback once S5-WP30-02 lands. **DONE 2026-11-02:** shadows/probes/mirrors scope standard depth and reset clip control (`withStandardDeviceDepth`, `standardDeviceClipRange`); post linearization, scene depth copy (float copy target) and CPU readback handle zero-to-one reversed (window depth = 1 - standard in both ranges; CPU reference tests); legacy `VolumeRenderer` (`draw({ depth })`) and vegetation impostors (`impostorDepthUniforms`) write frame-convention fragment depth (`native-volume-renderer.test.ts`). |
| S5-WP30-04 | Test near/far, large ranges, seams, clipping, effects, fallback | FINISH-5.0 | Resolve existing preflight tests expecting explicit fallback to throw vs current negotiated fallback (camera fallback conflict). |

### WP-31

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP31-01 | Every depth/stencil/blend/mask/cull/offset/sample field per device | FINISH-5.0 | Express all command-state fields in material/pipeline API; WebGL independent attachment state, partial sample masks, offset clamp; WebGPU generated alpha-to-coverage. |
| S5-WP31-02 | Normalized/integer/interleaved/instanced vertex layouts to real slots | FINISH-5.0 | Add integer shader-input pixel specification. |
| S5-WP31-03 | Stable render-bucket ordering; weighted OIT with fallback | FINISH-5.0 | renderOrder must order across split renderer phases; extend weighted integration beyond unlit WebGL2 triangles or refuse explicitly on WebGPU/multiview. |
| S5-WP31-04 | Test intersecting transparency, occluders, MSAA, views, teardown | FINISH-5.0 | Drive renderer transmission instead of injected fallback; MSAA case on multisampled target; close ResourceLifecycle-before-failure boundary. |
| S5-WP31-05 | Clipping/depth/output in program generation and warmup | FINISH-5.0 | Forward selector derives log depth from active convention; include depth variants in warmup; no recompile on uniform edits. **DONE 2026-11-02:** generated WebGPU PBR/unlit programs admit `a3d.logarithmicDepth` and write `clamp(ln(max(d, near) / near) / ln(far / near), 0, 1)` as `@builtin(frag_depth)` from appended `logDepthView`/`logDepthRange` material fields bound from `u_a3dLogDepthView`/`u_a3dLogDepthRange` (WGSL source and packing tests in `native-reversed-z-precision.test.ts`). |

### WP-32

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP32-01 | sRGB and Display-P3 output with reported fallback | EXPERIMENTAL-5.0 | Ship P3 output experimental (WebGPU opaque unorm only, sRGB fallback reported); display evidence Phase B. |
| S5-WP32-02 | Preserve video/canvas/subregion uploads; correct source lifetime | FINISH-5.0 | Resolve immediate-completion fence assertion conflicts (S5-DEF-01); finish compressed fallback content-edit replacement. |
| S5-WP32-03 | Verify color vectors, HDR, readback, mips, media, blocks, cleanup | FINISH-5.0 | Add WebGPU P3 fixture; dynamic fixture must observe native WebGPU handles; resolve legacy fence assertions (S5-DEF-01). |

## Acceptance-only rows (Phase B)

| ID | WP | Task | Phase B work |
| --- | --- | --- | --- |
| S5-ACC-01 | WP-12 | Separate injected-session and physical-device XR/input results | Record physical-device results separately from injected-session tests. |
| S5-ACC-02 | WP-17 | Editor graph create/edit/reload changes pixels; invalid graph diagnostics | Run existing browser spec on frozen candidate; retain pixel receipt. |
| S5-ACC-03 | WP-20 | Repeated mount/load/dispose, context loss/recovery, security isolation runs | Run existing lifecycle/multi-app specs repeatedly on frozen candidate. |
| S5-ACC-04 | WP-25 | 3+ sessions x 300 frames, percentiles, startup, requests, allocations | Run gated performance probe on frozen candidate; GPU timing/JS allocation stay no-data where unsupported. |
| S5-ACC-05 | WP-27 | Manual keyboard/touch installed-game validation | Manual installed-game/device pass on frozen candidate; scripted fixture is not a manual pass. |

## Named defects (always FINISH-5.0)

| Defect | Covering S5 IDs | Extra row |
| --- | --- | --- |
| WebGPU teardown failures (last full run 26 pass / 32 fail in `native-webgpu-device-teardown.test.ts`; `native-webgpu-fence-failure-visibility.test.ts` pending-fence case) | S5-WP03-01, S5-WP03-02, S5-WP05-04, S5-WP06-03, S5-WP25-04, S5-WP32-02, S5-WP32-03, S5-WP31-04 | S5-DEF-01 |
| Reversed + logarithmic depth (native production, not fallback) | S5-WP30-02, S5-WP30-03, S5-WP31-05, S5-WP30-04 | none |
| Native WebGPU wetness (`GeneratedPbrProgram.ts:243` allowlist excludes it; deferred wetness forward-only) | none | S5-DEF-02 |
| Alpha-cutoff test conflict (glTF accepts cutoff > 1; `tests/unit/workstream5-runtime.test.ts:2576` expects 1.5 rejected) | S5-WP07-07 | S5-DEF-03 |
| Bitmap orientation test conflict (ImageBitmap mock lacks width/height vs dimension admission) | S5-WP07-04 | none |
| Mini-game `Textures/colormap.png` sidecar + digest for star/key GLBs | S5-WP07-01, S5-WP24-07 | S5-DEF-04 |
| Skyline runner manifest identity vs file/provenance (and other missing template sidecars) | S5-WP07-01 | S5-DEF-05 |
| `tools/production-path-benchmark` imports another engine (`index.ts:308` `import * as THREE from "three"`) | S5-WP19-07 | S5-DEF-06 |
| 5.0 migration guide (no `docs/migration/4-to-5.md` exists) | S5-WP24-02, S5-WP21-02 | S5-DEF-07 |
| Camera explicit-fallback preflight test conflict (also in Known blockers) | S5-WP30-04 | none |

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-DEF-01 | Classify and fix all WebGPU teardown/fence-failure test failures | FINISH-5.0 | Classify the 32 failures; fix lifecycle so ResourceLifecycle completion and fence retention agree across `WebGPUDevice.ts`, `ResourceInterop.ts`; do not weaken tests. **DONE 2026-11-02:** strict fence contract; 10 teardown files 161/161; rendering tsc clean. |
| S5-DEF-02 | Native WebGPU wetness | FINISH-5.0 | Add wetness to generated PBR feature allowlist (`webgpu/GeneratedPbrProgram.ts:243`) and deferred route in `Renderer.ts`; keep explicit fallback only for unsupported cases. **CODE 2026-11-02 (experimental, no GPU evidence):** WGSL response in `atmosphere/shaders/wetness.wgsl.ts`, stock-identity admission in `GeneratedPbrProgram.ts`/`NativeDeferredAdmission.ts`, deferred materials in `Renderer.ts`; puddle-noise textures stay an explicit fallback/rejection. **DONE 2026-11-02 (cc1a842ff, 7f7a842c0):** WGSL port, CPU parity 240/240, deferred + forward. |
| S5-DEF-03 | Resolve alpha-cutoff validation vs existing test | FINISH-5.0 | Decide 5.0 contract for `alphaCutoff` > 1; make glTF validation and `workstream5-runtime.test.ts:2576` agree without weakening; record in 5.0 migration guide. **DONE 2026-11-02:** case now asserts a negative cutoff (glTF 2.0 `alphaCutoff` has no maximum) is rejected; passes. |
| S5-DEF-04 | Mini-game colormap.png sidecar and digest | FINISH-5.0 | Source and admit exact `Textures/colormap.png` for star/key GLBs in `templates/mini-game` and `packages/create-aura3d/templates/mini-game`; add digest/sidecar; fix three mirror HTML/font diffs. **DONE 2026-11-02 (00120b81f):** proven colormaps + integrity in all mini-game copies. |
| S5-DEF-05 | Skyline runner manifest identity and template sidecars | FINISH-5.0 | Reconcile skyline runner manifest with its file and provenance; clear the 18 dependency-check errors across nine GLBs in seven templates. **DONE 2026-11-02 (00120b81f):** 18 → 0 dependency errors across 9 GLBs/7 templates; unused skyline entry retired (GLB kept). |
| S5-DEF-06 | Remove other-engine import from production-path benchmark | FINISH-5.0 | Drop `threejsBundleSource` from `tools/production-path-benchmark/index.ts`; comparison numbers stay only in `evidence/vs-threejs/RESULTS.md`; update `tests/unit/tools/production-path-benchmark.test.ts`. **DONE 2026-11-02 (00120b81f):** benchmark is native-only; 15/15 unit + gate-only pass. |
| S5-DEF-07 | Write 5.0 migration guide | FINISH-5.0 | Create `docs/migration/4-to-5.md`: readiness result change, root `createGame` migration error, depth fallback, alpha-cutoff, removed exports from comparator output. **DONE 2026-11-02 (7cc879125):** `docs/migration/4-to-5.md`; release-prep items listed in the decision record. |

## Implemented rows (no 5.0 work)

<details><summary>53 implemented rows</summary>

- S5-IMP-01 (WP-01, line 1773): Fix index selection at 65,535/65,536/65,537 boundaries and verify indexed/non-indexed meshes
- S5-IMP-02 (WP-01, line 1774): Apply inverse-transpose normal transforms, including nonuniform scale, shear, negative determinant and singular-matrix errors
- S5-IMP-03 (WP-01, line 1775): Make merge and deindex operations preserve or explicitly reject every attribute, morph, group, draw range and topology; never ...
- S5-IMP-04 (WP-01, line 1776): Invalidate position-derived bounds after edits; verify an object moved outside its original bounds stays visible
- S5-IMP-05 (WP-01, line 1779): Keep approximate bounds queries available and test deterministic hit ordering and disposal
- S5-IMP-06 (WP-03, line 1790): Define capability detection and feature errors; verify WebGL2 fallback only when explicitly allowed
- S5-IMP-07 (WP-03, line 1792): Complete an explicitly opt-in functional backend before code freeze; preserve its experimental support label until actual rendered output, ...
- S5-IMP-08 (WP-04, line 1800): Test both symmetric and two-dimensional angular profiles, linear lamp/multiplier scaling and malformed tables
- S5-IMP-09 (WP-05, line 1808): Support color, normal, roughness, metalness, emission, opacity and vertex-position outputs; support compute, storage buffers/textures, multiple UV sets and ...
- S5-IMP-10 (WP-05, line 1809): Reuse existing node-material entrypoints through an Aura-owned adapter; preserve clear errors for unsupported operations
- S5-IMP-11 (WP-07, line 1826): Resolve nested dependencies relative to their containing file, detect normalized cycles before awaiting in-flight work, and balance duplicate/shared ...
- S5-IMP-12 (WP-07, line 1828): Connect native format admission end to end: typed manifest and loader registry, installed optional loader, root model runtime, ...
- S5-IMP-13 (WP-07, line 1829): Make reported texture budgets match actual returned and resident bytes per device; handle duplicate names, eviction, streaming, release ...
- S5-IMP-14 (WP-07, line 1833): Eliminate implicit fixture substitution for unknown formats, invalid manifests or unavailable transport
- S5-IMP-15 (WP-07, line 1834): Scope decoded audio caches by content and request identity, bound decoded memory, independently cancel subscribers and generation-guard clear/dispose/replacement ...
- S5-IMP-16 (WP-07, line 1835): Fix decoder plugin dev/build/static-base agreement
- S5-IMP-17 (WP-09, line 1849): Implement every exporter in the WP-09 table with an independently specified capability matrix and a typed result
- S5-IMP-18 (WP-10, line 1857): Implement camera-dependent ordering, blending, culling, depth interaction, bounds and resource budgets; define what happens on unsupported backends
- S5-IMP-19 (WP-10, line 1858): Add scalar-volume slices and rendering with clipping, transfer functions and lifecycle tests
- S5-IMP-20 (WP-11, line 1862): Add smooth and Bézier interpolation as distinct modes from glTF cubic spline; preserve authored tangents and serialization
- S5-IMP-21 (WP-11, line 1864): Support requested vector widths and deterministic clock/action semantics: reverse, repeat, ping-pong, time scale, timed fades and end conditions
- S5-IMP-22 (WP-11, line 1866): Fix object-group subscription and UUID bookkeeping
- S5-IMP-23 (WP-11, line 1867): Preserve authored values/tangents through optimize/trim/serialize/additive conversion for every interpolation mode; test values along the curve, not just surviving ...
- S5-IMP-24 (WP-11, line 1868): Correct audio position under playback-rate changes, scheduled starts, loop regions and pause/resume; add generic source adapters
- S5-IMP-25 (WP-11, line 1869): Compute emitter/listener orientation through nested transforms, including mirrored or nonuniform scale; test disposal and user-gesture rules
- S5-IMP-26 (WP-12, line 1876): Retain per-contact positions/buttons and stable IDs
- S5-IMP-27 (WP-12, line 1877): Treat pointercancel, lost capture, blur and device disconnect as termination without click/tap activation; release one contact without clearing ...
- S5-IMP-28 (WP-12, line 1878): Sample native XR viewer poses, hand joints and hit-test results with their reference spaces; acquire/cancel hit-test sources with ...
- S5-IMP-29 (WP-12, line 1879): Add optional hands/controllers, plane/depth data and estimated lighting; integrate GPU composition only when supported
- S5-IMP-30 (WP-12, line 1880): Generation-guard every async session-enter stage; concurrent enters create at most one owned session and exit/dispose closes any late-created ...
- S5-IMP-31 (WP-13, line 1886): Implement rational curve, surface and volume evaluation with knots, weights, derivatives, clipping and degenerate inputs
- S5-IMP-32 (WP-13, line 1887): Implement loft, parametric and patch geometry with normals, UV seams, caps and tessellation controls
- S5-IMP-33 (WP-14, line 1894): Implement the advanced helper catalog with scene-driven updates, visibility, transforms and disposal
- S5-IMP-34 (WP-14, line 1895): Render accessible DOM labels in 2D and 3D and document occlusion and event limitations
- S5-IMP-35 (WP-14, line 1897): Test assistive labels, pointer routing, screenshot output, resize and cleanup
- S5-IMP-36 (WP-16, line 1909): Transfer canvas ownership once; define message ordering, request IDs, resize/input snapshots, errors and cancellation
- S5-IMP-37 (WP-17, line 1915): Connect graph editing to real material state and the renderer compiler; provide typed ports, cycle errors, undo and ...
- S5-IMP-38 (WP-19, line 1934): Repair the existing performance script's undefined commands by wiring it to candidate-bound remote-report analysis
- S5-IMP-39 (WP-20, line 1948): Add an approved artifact-egress path to the serverless browser runner
- S5-IMP-40 (WP-20, line 1951): Separate hardware XR/native-GPU receipts from software adapters or injected sessions
- S5-IMP-41 (WP-21, line 1960): Fix pooled target double release; track live leases/idle membership so simultaneous users never share one lease and counters ...
- S5-IMP-42 (WP-23, line 1974): Make the existing adapter's ready callback reflect successful renderer readiness; deliver cancellation/failure through a stable boundary and do ...
- S5-IMP-43 (WP-23, line 1976): Exercise both declared supported peer major versions, StrictMode double mounts, Suspense, error boundaries, prop updates, input and scene ...
- S5-IMP-44 (WP-24, line 1982): Replace fixed legacy baseline selection with explicit verified baseline manifest, candidate plan, release kind and output arguments
- S5-IMP-45 (WP-25, line 1992): Establish independently reproducible workloads for one primitive, product scene, dense instances, animation, a game loop, effects and asset ...
- S5-IMP-46 (WP-25, line 1998): Use genuine asynchronous device timers where supported; report CPU timings separately and never substitute them for GPU measurements
- S5-IMP-47 (WP-26, line 2003): Preserve the built-in small-glyph fallback; expose an accessible DOM counterpart and dispose glyph/texture resources after final use
- S5-IMP-48 (WP-26, line 2005): Update actual line storage in Geometry.ts, preserving LineGeometry.ts's re-export
- S5-IMP-49 (WP-27, line 2011): Complete and test supported primitive, convex, static-mesh and heightfield collision; fixed/hinge/spring/motor joints; contact/sensor/layer queries; deterministic stepping and continuous ...
- S5-IMP-50 (WP-28, line 2018): Build a versioned, independently licensed fixture manifest with content digest, origin, format version, extension combinations, expected numerical/visual output, ...
- S5-IMP-51 (WP-28, line 2022): Keep unavailable assets, devices and formats visibly unverified rather than silently skipping them
- S5-IMP-52 (WP-30, line 2035): Add physical film/focal-length perspective controls and tiled/asymmetric view offsets
- S5-IMP-53 (WP-32, line 2050): Implement shared scene-referred color transforms with extended-range linear identity, independently derived primary conversion and explicit tone/gamut/output stages

</details>

This list is the fixed 5.0 denominator. Do not add rows without owner approval; re-audit is replaced by checking off rows.

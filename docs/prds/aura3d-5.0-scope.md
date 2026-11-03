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
| S5-WP01-01 | Scene queries: parent transforms, BVH, skin/morph/instance/UV/layers | FINISH-5.0 | Make arbitrary vertex-program exclusion a stable documented query error; run existing SceneQueryBVH/query suites in ACR source pass. |
| S5-WP01-02 | Stable batch-member IDs through remap, disposal, shared geometry | FINISH-5.0 | Fix failing existing batch tests expecting recycled-slot lifetime IDs (packed-loop member metadata); do not edit tests to pass. |

### WP-02

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP02-01 | Pivot-aware transforms through nodes, handles, serialized projects | FINISH-5.0 | Editor pivot serialization done; support pivoted physics mutations and legacy hierarchy/look-at combos in `runtimeNodes.ts:919` instead of rejecting. |
| S5-WP02-02 | Independent per-view matrices, culling, viewport, targets, post history | FINISH-5.0 | Array/stereo cameras must frustum-cull Scene renderables without a Camera instance; native WebGPU depth of field must accept multiview or refuse with stable error. |
| S5-WP02-03 | Test hierarchy, resize, stereo, mixed views, resource restoration | FINISH-5.0 | Resolve viewport suite asserting only first camera group honored versus multiple-group fixture; align with current lowering. |

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
| S5-WP08-01 | Replace attributed image decoder; implement every WP-08 format | FINISH-5.0 | Admit and render full format catalog through typed paths; 3DM/JXL/UltraHDR keep explicit supplied-codec refusal documented. |
| S5-WP08-02 | Per-format units, coordinates, versions, dependencies, extension set | FINISH-5.0 | Write per-format version/coordinate/dependency/loss matrix in public format inventory doc. |
| S5-WP08-03 | Typed admission with file/archive/pixel/allocation limits, stable diagnostics | FINISH-5.0 | Extend strict admission and consistent limits/diagnostics beyond selected models, PVR, NRRD to every catalog format. |
| S5-WP08-04 | Minimal, realistic and hostile fixtures per format; render via public API | FINISH-5.0 | Add BVH, MDD, SVG, MaterialX, 3DL source tests; extend browser spec beyond seven mesh/3MF + OBJ cases. |

### WP-09

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP09-01 | Round-trip geometry, hierarchy, material, animation, skin/morph, metadata | FINISH-5.0 | Keep document provenance and material variants in runtime snapshot; USDZ test must load stage semantics, not assert text. |
| S5-WP09-02 | Structured loss warnings; independent readers, endianness, units, packaging | FINISH-5.0 | Add independent semantic readers for USDZ and complete PLY reader in exporter tests. |
| S5-WP09-03 | Quantized attributes, indexed lines, HDR RLE/PIZ, multi-output EXR export | EXPERIMENTAL-5.0 | Ship render-target EXR export experimental; GPU/browser attachment readback evidence is Phase B; omitted attachments already reported. |

### WP-10

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP10-01 | Parse all named splat formats; validate layouts | FINISH-5.0 | Public scene compiler must construct splat loader with KSPLAT and packed-PLY decoders (or bundled Aura3D codec) so all named formats parse on integrated path. |

### WP-11

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP11-01 | Replace attributed property-binding code; edge-case tests | FINISH-5.0 | Establish independent authorship/provenance record for property-binding rewrite (WP-29 provenance record). |
| S5-WP11-02 | Align core, pose and asset playback: signed time, warp, sync | FINISH-5.0 | Verify-only: run existing cross-path playback suites in ACR source pass; fix any divergence. |
| S5-WP11-03 | Verify visible deformed pixels, not animation state alone | FINISH-5.0 | Browser harness: remove hard-coded cameraStable; add subject region/mask so changed pixels are attributed to deformation. |

### WP-12

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP12-01 | Pointer dragging/selection: plane, hover, capture, multi-touch, marquee | FINISH-5.0 | Wire marquee to pointer events and selection state. |
| S5-WP12-02 | Complete arcball gestures; listener cleanup on all controls | FINISH-5.0 | Verify-only: run existing control cleanup suites in source pass; device gesture evidence Phase B. |

### WP-13

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP13-01 | Independently replace attributed geometry implementations | FINISH-5.0 | Finish rewriting remaining Support port portions and general Extrude; restore equivalent-contract receipts. |
| S5-WP13-02 | Every named mesh utility/modifier; preserve groups/attributes; path bevels | FINISH-5.0 | Implement topology-validation/compression and mesh-memory contracts; close general extrusion provenance (S5-WP13-01). |
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
| S5-WP15-03 | Bound memory/polygons, seeds, undo data, invalid inputs, teardown | FINISH-5.0 | Add element budget to lens-flare (elements array allocates material+item each) with budget test. |

### WP-16

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP16-01 | Hidden-page suspend/resume, bounded catch-up, hidden resize/DPR | FINISH-5.0 | Verify-only: run scheduler suites in source pass; browser timing Phase B. |
| S5-WP16-02 | Terminal vs recoverable render failure; suppress late callbacks | EXPERIMENTAL-5.0 | Worker rendering ships experimental; real-worker recovery evidence Phase B. |
| S5-WP16-03 | Worker: initial scene, updates, async assets, scheduling, backend loss | FINISH-5.0 | Confirm/fix replacement snapshot published before acknowledgement (`workerRootApp.ts:442,545`); run worker suites in source pass. |
| S5-WP16-04 | Worker fallback, termination, duplicate disposal, no retained listeners | FINISH-5.0 | Normal `dispose` must not resolve on forced-termination timeout without cleanup acknowledgement (match `disposeStrict` reporting). |

### WP-17

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP17-01 | Inspector shows actual textures, passes, timing, resources | FINISH-5.0 | Add shadow, contributor, post and native-device phases; whole-frame CPU/GPU timing; runtime-only texture inventory (`Renderer.ts:1960`, `diagnostics.ts`). |
| S5-WP17-02 | Keyboard, compact density, accessible error/loading/empty states; licensed fonts | FINISH-5.0 | Keyboard reparenting, live-region inspector errors, visible import loading/error states; locate or record Whitney redistribution grant. |

### WP-18

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP18-01 | Hand ledger findings to WP-00; replace historical exclusion text | SUPERSEDED-PROCESS | Ledger handoff dropped; exclusion language promotion follows S5 row check-off after ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |
| S5-WP18-02 | Document backend/format/export limits; runnable example per feature | FINISH-5.0 | Update stale backend page (root WebGPU selection, vertex types); add indexed scenarios for worker and interchange exporter surfaces. |
| S5-WP18-03 | Keep ledger current; complete every row with public exposure | SUPERSEDED-PROCESS | Ledger completeness replaced by checking off S5 rows; public exposure verified by ACR source pass (`tools/remote-acr/run-source5.sh`) + `tools/native-capability-gate/index.mjs`. |

### WP-19

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP19-01 | Integrate lanes: exports, package metadata, side-effects, bundle isolation | FINISH-5.0 | ImportPipeline export fixed; prove optional packages stay out of root consumer bundles via installed tree-shaking in source pass. |
| S5-WP19-02 | One registry for TS/dev/test/dist mappings; typecheck new files | FINISH-5.0 | Derive workspace package export conditions from registry; bring excluded QR trees into typecheck; verify emitted worker entrypoints in source pass. |
| S5-WP19-03 | Independent CommonJS bridge; ESM/CJS packed tests on supported Node | FINISH-5.0 | Add root Node `engines` declaration and supported-version execution matrix for packed ESM/CJS test. |
| S5-WP19-04 | Typed option probes replace scaffolds; each option changes behavior | FINISH-5.0 | Extend probe discovery beyond named root builder families and literal examples to every supported documented option. |
| S5-WP19-05 | Release plan, tarballs, tiers, provenance from one versioned inventory | FINISH-5.0 | Derive package tiers and tarball target discovery from the versioned inventory instead of static map/manifest scan. |
| S5-WP19-06 | Git-free staged source identity; signed approval; freeze binding | SUPERSEDED-PROCESS | Signed-source continuity dropped; source identity = ACR run source manifest hash + git freeze commit via `tools/native-capability-gate/index.mjs`. |
| S5-WP19-07 | Remove external 3D engines from installs, typings, comparison adapters | FINISH-5.0 | Remove/convert comparison-only `three` importers (S5-DEF-06) excluded from typecheck; confirm no install profile or lock graph includes them. |
| S5-WP19-08 | Audit source origins, lookup data, packages, artifacts, network | FINISH-5.0 | Complete reviewed source-origin/replacement record; run provenance scan over packed artifacts and all install profiles in source pass. |
| S5-WP19-09 | Fixed-workload measurement of startup, bytes, draws, CPU/GPU, allocations | FINISH-5.0 | Collector must populate installed bytes, JS allocation count and thread CPU time (or labeled unsupported); retained device runs Phase B. |

### WP-20

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP20-01 | Browser runner install uses frozen independent lock | SUPERSEDED-PROCESS | Custody source image dropped; `tools/remote-acr/run.sh` Playwright image with frozen pnpm lock is the runner. |
| S5-WP20-02 | Dedicated serverless source runner with argv allowlist and hashed staging | SUPERSEDED-PROCESS | Replaced by `tools/remote-acr/run-source5.sh` (same 4.x `Dockerfile.playwright` image, frozen lock, hashed staging manifest); `Dockerfile.source` guard left in place, off the 5.0 path. |
| S5-WP20-03 | Asset/contract/Node release suites in source execution; status propagation | SUPERSEDED-PROCESS | Run the existing source plan (`tools/remote-acr/source-checks.mjs`) through ACR `run.sh` instead of the custody runner. |
| S5-WP20-04 | Single global phase gate; reject acceptance argv in source runner | FINISH-5.0 | Add equal-count/different-ID and unowned-outcome cases to `tools/native-capability-gate` tests; cover every acceptance entrypoint. |
| S5-WP20-05 | Copy staged tests/fixtures/templates into browser images; omission failures | FINISH-5.0 | Add browser-launcher missing-payload failure test; exclude unrelated repository assets from ACR upload manifest. |
| S5-WP20-06 | Per-browser-family project selection and JSON results | SUPERSEDED-PROCESS | Blocked only by custody React consumer restoration; run Chromium/Firefox/WebKit projects via ACR `run.sh` with frozen-lock install. |
| S5-WP20-07 | Subject-aware pixel checks; extended repeated-resource soak | FINISH-5.0 | Soak must count WebGPU pipelines; calibrate heap thresholds for non-Chromium or mark unsupported. |
| S5-WP20-08 | Source checks/consumers before freeze; browser after; retain metadata | SUPERSEDED-PROCESS | Source checks via ACR `run.sh`; gate record via `tools/native-capability-gate/index.mjs`; matrix producer custody dropped. |

### WP-21

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP21-01 | App/device-owned runtime context; apps never reset each other | FINISH-5.0 | Finish shared-canvas WebGPU ownership and multi-app isolation coverage. |
| S5-WP21-02 | Readiness result distinguishing failure, cancellation, disposal, superseded | FINISH-5.0 | Resolve existing tests expecting former cancelled result; write lifecycle migration section in 5.0 guide (S5-DEF-07). |
| S5-WP21-03 | Owner-scoped asset callbacks, redacted errors, late completion suppression | FINISH-5.0 | Resolve existing test expecting former late-error behavior; finish cross-loader and two-app strictness coverage. |
| S5-WP21-04 | Safe error formatting: cycles, large values, getters, bigints, redaction | FINISH-5.0 | Apply bounded/redacted formatting to remaining transport/error paths. |
| S5-WP21-05 | Dispose all resources despite failures; aggregate; idempotent; races | FINISH-5.0 | Remount guards landed; add failed-resource retry and mount/resize/loss/restore/dispose race coverage. |
| S5-WP21-06 | Dispose late async programs; settle handles; reject dead caches | FINISH-5.0 | Guarantee retirement of uncertain late program cleanup in `ProgramCache` beyond explicit-receipt programs. |
| S5-WP21-07 | Coordinate pause/resume with WP-16 and asset ownership with WP-07/05 | FINISH-5.0 | Finish cross-loader event integration with app-owned cancellation. |

### WP-22

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP22-01 | Supported browser/OS/backend matrix with ranges; untested cells unverified | EXPERIMENTAL-5.0 | Ship 5.0 matrix with WebGL2 default and all other cells labeled experimental/unverified; ranges filled from Phase B only. |
| S5-WP22-02 | Remote WebGL2/DOM/input/asset/worker workloads on automation projects | SUPERSEDED-PROCESS | Consumer restoration custody dropped; run workloads via ACR `run.sh` Playwright image post-freeze. |
| S5-WP22-03 | Capture browser, OS, backend, adapter, flags, fixture hash, result | FINISH-5.0 | Record complete effective browser arguments (or explicit unavailable reason per field) in scenario output. |
| S5-WP22-04 | Separate automation, retail, software, injected, physical evidence | FINISH-5.0 | Evidence validator marker scan must include `os.version` and `physicalProvenance.observedBy`. |
| S5-WP22-05 | Route browser forwarding/transport through WP-20; unverified cells documented | SUPERSEDED-PROCESS | Dev-server alias fix landed; remaining /tmp consumer restoration custody replaced by ACR `run.sh` consumer install. |

### WP-23

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP23-01 | Scope React asset resources by loader/context/digest; bounded ownership | FINISH-5.0 | Bound default unsignalled `read()`/`useAuraAsset()` interest; prevent eviction of owned entries with live work; test direct-read signal path. |
| S5-WP23-02 | SSR DOM-free render; hydrate without duplicate loops or leaks | FINISH-5.0 | Install dispose counter before onReady; assert renderer/asset resource retirement and await async cleanup in packed-browser source. |

### WP-24

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP24-01 | Compare packed public surface with immediately preceding release | FINISH-5.0 | Verify baseline metadata origin/freshness against published 4.7.x tarball; run comparator on exact candidate in source pass. |
| S5-WP24-02 | Reject undocumented breaking changes; major migration instructions | FINISH-5.0 | Write complete 5.0 per-change migration record (S5-DEF-07); run comparator against candidate. |
| S5-WP24-03 | Reference docs from packed declarations; fail on missing docs/snippets | FINISH-5.0 | Regenerate checked-in public reference from packed candidate declarations instead of source inventory. |
| S5-WP24-04 | Build every template/capability example from untouched scaffold | FINISH-5.0 | Generate capability projects from untouched scaffolds, not new manifest/config/source; drop custody abort in favor of ACR clean install. |
| S5-WP24-05 | Split clean-install/consumer-matrix into source and browser phases | SUPERSEDED-PROCESS | npm/pnpm custody guards dropped; source/browser phases run via ACR `run.sh` with existing phase CLIs and report validation. |
| S5-WP24-06 | Verify JS, TS modes, conditions, SSR, workers, peers, React 18/19 | SUPERSEDED-PROCESS | Matrix cells exist; only custody producer blocks; execute the eight cells via ACR `run.sh`. |
| S5-WP24-07 | Support policy, troubleshooting, template assets; offline neutral environment | FINISH-5.0 | Quickstart fixed; scaffold copy must include indirectly authored cinematic looks; template sidecars (S5-DEF-04). |

### WP-25

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP25-01 | Like-for-like baseline/candidate analysis with noise threshold | FINISH-5.0 | Analyzer requires every metric while probe sets several to null; reconcile (unsupported metrics excluded explicitly) and add retained same-device baseline input. |
| S5-WP25-02 | Meet gzip budgets 190k/250k/400k/480k | FINISH-5.0 | Measure current candidate budgets in ACR source pass; fix any overage. |
| S5-WP25-03 | Installed tree-shaking consumes explicit source-consumer report | SUPERSEDED-PROCESS | `check:release` args fixed; custody NPM_INSTALL_CUSTODY_UNAVAILABLE producer replaced by ACR `run.sh` installed consumer. |
| S5-WP25-04 | Measure actual memory residency and release; rerun pixel checks | FINISH-5.0 | Resolve immediate-completion fence assertion conflicts (S5-DEF-01); GPU-resident bytes labeled unmeasurable. |

### WP-26

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP26-01 | Licensed fonts, shaping, kerning, RTL, fallback, wrapping, dynamic atlas | FINISH-5.0 | Implement retained dynamically updated glyph atlas; support wrapping through open bidi scope. |
| S5-WP26-02 | Wide/dashed lines in world/screen units, gradients, clipping, errors | FINISH-5.0 | Verify-only: run line diagnostic suites in source pass; rendered output Phase B. |
| S5-WP26-03 | Custom materials on imported slots; model LOD/collider options | FINISH-5.0 | Per-slot custom shader selection; accept textured authored + variant; bounds colliders apply model scale and error on missing bounds; behavioral collider test. |
| S5-WP26-04 | Request geometry/type changes from owners; verify pixels, interaction, teardown | FINISH-5.0 | Browser spec must assert pointer/keyboard interaction; owner-request bookkeeping dropped. |

### WP-27

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP27-01 | Scene/physics sync: parents, multiple worlds, character/vehicle reset | FINISH-5.0 | Add public-world held-character-survives-world-reset test. |
| S5-WP27-02 | Full game entry cycle-free; versioned root migration error | FINISH-5.0 | Implement or remove no-op loading-progress/track shell methods; fix `docs/agents/{genre-kits,build-playbook,troubleshooting}.md` 'headless stub' text. |

### WP-28

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP28-01 | Decode, create, root-render and dispose each claimed variant | FINISH-5.0 | Maturity spec `createAuraApp` must pass `formatRegistry`; add Draco and Meshopt variants to manifest. |
| S5-WP28-02 | Nested deps, invalid extensions, corrupt files, integrity, export round trips | FINISH-5.0 | glTF export round trip must reload with independent reader, not Aura loader. |
| S5-WP28-03 | Texture budget vs CPU bytes and live residency, two devices | FINISH-5.0 | Extend browser streaming spec to two-device same-name eviction/release matrix; rerun budget suite (prior 8/9 failures). |

### WP-29

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP29-01 | Enumerate dependency graph; no external 3D engines in installs/runtimes | FINISH-5.0 | Produce transitive graph for lockless scaffold profiles; packed-runtime audit in source pass; confirm private showcase `three` not a required install. |
| S5-WP29-02 | Scan source, artifacts, maps, workers, payloads, network; offline consumer | FINISH-5.0 | Run archive scan on packed candidate in ACR source pass; offline consumer runs via ACR instead of custody restore. |
| S5-WP29-03 | Per-file hash, license, owner, replacement status, review evidence | FINISH-5.0 | Refresh stale hashes (ShapeUtils, ConvexHull, OBB); complete WP-29 provenance record fields for G27 files. |
| S5-WP29-04 | Treat text/equation/fingerprint hits as review candidates | FINISH-5.0 | Add standardized-equation review classification to scanner; record human review of candidates. |
| S5-WP29-05 | Keep notices until replaced; independent test fixtures and goldens | FINISH-5.0 | Fix rewritten UV fixture rotation-direction mismatch with implementation; replace reference-generated math/shader goldens. |

### WP-30

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP30-01 | Section 3.7 clipping through scene, compiler, graph, depth, shadow | FINISH-5.0 | Add depth/shadow submission for clipped points, wide lines and sprites. |
| S5-WP30-02 | Standard/reversed/logarithmic depth as negotiated conventions | FINISH-5.0 | Implement native production reversed and logarithmic depth (and infinite far where allowed) in `cameraDepth.ts` and renderers; fallback is not support. |
| S5-WP30-03 | Coordinate depth convention with shadows, culling, effects, histories | FINISH-5.0 | Carry nonstandard depth through shadows, culling, query reconstruction, fog, AO/DOF and readback once S5-WP30-02 lands. |
| S5-WP30-04 | Test near/far, large ranges, seams, clipping, effects, fallback | FINISH-5.0 | Resolve existing preflight tests expecting explicit fallback to throw vs current negotiated fallback (camera fallback conflict). |

### WP-31

| ID | Task (≤15 words) | Label | Remaining work (≤30 words, concrete files/symbols) |
| --- | --- | --- | --- |
| S5-WP31-01 | Every depth/stencil/blend/mask/cull/offset/sample field per device | FINISH-5.0 | Express all command-state fields in material/pipeline API; WebGL independent attachment state, partial sample masks, offset clamp; WebGPU generated alpha-to-coverage. |
| S5-WP31-02 | Normalized/integer/interleaved/instanced vertex layouts to real slots | FINISH-5.0 | Add integer shader-input pixel specification. |
| S5-WP31-03 | Stable render-bucket ordering; weighted OIT with fallback | FINISH-5.0 | renderOrder must order across split renderer phases; extend weighted integration beyond unlit WebGL2 triangles or refuse explicitly on WebGPU/multiview. |
| S5-WP31-04 | Test intersecting transparency, occluders, MSAA, views, teardown | FINISH-5.0 | Drive renderer transmission instead of injected fallback; MSAA case on multisampled target; close ResourceLifecycle-before-failure boundary. |
| S5-WP31-05 | Clipping/depth/output in program generation and warmup | FINISH-5.0 | Forward selector derives log depth from active convention; include depth variants in warmup; no recompile on uniform edits. |

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
| S5-DEF-01 | Classify and fix all WebGPU teardown/fence-failure test failures | FINISH-5.0 | Classify the 32 failures; fix lifecycle so ResourceLifecycle completion and fence retention agree across `WebGPUDevice.ts`, `ResourceInterop.ts`; do not weaken tests. |
| S5-DEF-02 | Native WebGPU wetness | FINISH-5.0 | Add wetness to generated PBR feature allowlist (`webgpu/GeneratedPbrProgram.ts:243`) and deferred route in `Renderer.ts`; keep explicit fallback only for unsupported cases. |
| S5-DEF-03 | Resolve alpha-cutoff validation vs existing test | FINISH-5.0 | Decide 5.0 contract for `alphaCutoff` > 1; make glTF validation and `workstream5-runtime.test.ts:2576` agree without weakening; record in 5.0 migration guide. **DONE 2026-11-02:** case now asserts a negative cutoff (glTF 2.0 `alphaCutoff` has no maximum) is rejected; passes. |
| S5-DEF-04 | Mini-game colormap.png sidecar and digest | FINISH-5.0 | Source and admit exact `Textures/colormap.png` for star/key GLBs in `templates/mini-game` and `packages/create-aura3d/templates/mini-game`; add digest/sidecar; fix three mirror HTML/font diffs. |
| S5-DEF-05 | Skyline runner manifest identity and template sidecars | FINISH-5.0 | Reconcile skyline runner manifest with its file and provenance; clear the 18 dependency-check errors across nine GLBs in seven templates. |
| S5-DEF-06 | Remove other-engine import from production-path benchmark | FINISH-5.0 | Drop `threejsBundleSource` from `tools/production-path-benchmark/index.ts`; comparison numbers stay only in `evidence/vs-threejs/RESULTS.md`; update `tests/unit/tools/production-path-benchmark.test.ts`. |
| S5-DEF-07 | Write 5.0 migration guide | FINISH-5.0 | Create `docs/migration/4-to-5.md`: readiness result change, root `createGame` migration error, depth fallback, alpha-cutoff, removed exports from comparator output. |

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

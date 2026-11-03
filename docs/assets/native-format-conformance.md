# Native asset and format conformance

Status: **prototype**. This page describes the bounded, independent conformance
fixtures and their intended checks. It is not a statement that every variant of
a named format is supported, or that a source test proves a rendered result.
[Claims and boundaries](../agents/claims-and-boundaries.md) defines the labels.

## Fixture method

The versioned [fixture manifest](../../tests/fixtures/native-capabilities/manifest.json)
records the fixture's origin, license, encoded bytes, SHA-256 digest, format and
version, extension combinations, expectations, and limits. The manifest is the
source of truth for the exact bytes and each fixture's license. Expected geometry,
colors and failure cases are defined independently of the loader being tested;
changing a decoder must not automatically regenerate its expected values. Hash
checks operate on decoded fixture bytes, not on the base64 text containing them.
A digest mismatch, an unavailable fixture, or an unsupported decoder is a failed
or unverified case, never a silently skipped success.

A fixture identifies one combination, not a whole format. For example, a single
uncompressed triangle says nothing about compression, animation, material
extensions, external resources, or variants. Combinations and exact expected
values are listed in the manifest. Expand the manifest and tests together when a
new combination is claimed, including a license and independently calculated
expectations. Do not substitute a fixture from another engine.

Manifest schema `aura3d.native-format-conformance/1`, version 1, records the
independently authored fixture bytes and their individual licenses. The mesh
fixtures use the repository's MIT license; the independently generated Basis
texture is CC0-1.0, with encoder details in its
[provenance record](../../tests/assets/native-fixtures/ktx2-red-4x4.md).
The manifest records coordinates as right-handed and Y-up in source units;
glTF coordinates use metres.

Non-glTF model rows load through `createNativeFormatRegistry()` from
`@aura3d/assets/importers`, which the root maturity spec passes to
`createAuraApp(canvas, { formatRegistry })`; the root app serves the vendored
Draco/meshopt decoders from `/aura-decoders/`. The initial conformance target covers these narrow combinations. `Expected`
describes the authored fixture, not a passing result; a target becomes
source-tested only when its corresponding test passes for the current source.

| Format and version | Fixture IDs | Combination and expected output | Rendering evidence |
| --- | --- | --- | --- |
| glTF 2.0 | `triangle-gltf-embedded`, `triangle-gltf-external` | Uncompressed triangle with embedded buffer, or nested external buffer and PNG dependencies | Unverified |
| glTF 2.0 + `KHR_texture_basisu` | `gltf-ktx2-basis`, `ktx2-red-4x4` | Triangle with embedded Basis ETC1S KTX2 texture; lossy RGB tolerance recorded in the manifest | Unverified |
| GLB 2.0 | `triangle-glb-embedded` | Uncompressed embedded triangle | Unverified |
| OBJ | `triangle-obj` | Triangle | Unverified |
| PLY 1.0 | `triangle-ply-ascii`, `triangle-ply-le`, `triangle-ply-be` | ASCII, binary little-endian and binary big-endian triangles | Unverified |
| STL | `triangle-stl-ascii`, `triangle-stl-binary` | ASCII and binary little-endian triangles | Unverified |
| 3MF 1.0 | `triangle-3mf-stored` | Triangle in a stored ZIP package | Unverified |
| GLB 2.0 + `KHR_draco_mesh_compression` (required) | `triangle-glb-draco` | Triangle encoded once with draco3d 1.5.7 sequential encoding; decodes losslessly to the authored positions through the injected/vendored Draco decoder | Unverified |
| GLB 2.0 + `EXT_meshopt_compression` (required, fallback buffer stub) | `triangle-glb-meshopt` | Triangle with meshopt ATTRIBUTES and TRIANGLES bufferViews encoded with meshoptimizer 1.2.0; decodes to the authored positions through the meshopt decoder | Unverified |
| SVG, VTK legacy, COLLADA 1.4.1, USDA 1.0, VRML 2.0, LDraw | `svg-triangle`, `vtk-triangle`, `dae-triangle`, `usda-triangle`, `vrml-triangle`, `ldraw-triangle` in [`catalog-scenes.ts`](../../tests/fixtures/native-capabilities/catalog-scenes.ts) | One authored triangle per format that must project to a +Z-facing, lower-edge-wide triangle after the format's axis/unit conversion | Unverified |

The triangle positions are `(-1, -1, 0)`, `(1, -1, 0)` and `(0, 1, 0)`;
the external PNG is an independently authored 1×1 RGBA image. See the
manifest for individual hashes, byte limits and expectations. Separately, the
negative cases cover unknown required and optional extensions and truncated
GLB, PLY and STL inputs; their expected outcomes must not be conflated. An
unknown optional extension is expected to remain diagnostic, while an unknown
required extension is expected to reject the document. The fixture set also
contains a corrupt embedded PNG for strict/fallback texture behavior and a
compressed 3MF archive that exceeds the stated expansion limit.

## Evidence and boundaries

| Evidence | What it can establish | Current state |
| --- | --- | --- |
| [Source conformance tests](../../tests/assets/native-format-conformance.test.ts) | Digests, decoded data, numerical expectations and explicit failure paths covered by the named fixtures. A passing case is limited to its bytes and options. | No source-conformance run is recorded here for a frozen candidate; use the command below and record its result. |
| [Texture budget source tests](../../tests/unit/assets/native-texture-budget.test.ts) | Returned CPU mip bytes, device isolation and release, and submitted bytes in a mock WebGL resource recorder. | Initial pre-integration run failed 8 of 9 tests; details below. A mock device is not GPU evidence. |
| [Browser maturity spec](../../tests/browser/native-format-maturity.spec.ts) | Admitted assets through the source root path, visible resources, failure and disposal on the tested browser/backend. | Pending public non-glTF registry, readiness/error and lifecycle integration, the global code-complete gate and a remote run. This spec imports source through a dev server and does not establish packed-package behavior. |
| Physical GPU, mobile and other browsers | Behavior on each named device, driver, browser and backend combination. | Unverified until separately run and recorded. |
| Independent export round trip | Supported semantics preserved by an independent reader and an explicit loss report. | Unverified unless the relevant export test and its input/output are recorded. |

A file classifier, manifest entry, parser return, opaque canvas, or a software
adapter alone does not establish a public rendering or physical-device claim.
The browser result must identify the candidate commit, fixture digest, browser
and version, operating system, backend, adapter, flags, result and artifact paths.
Keep unavailable, unsupported, failed and not-run cases distinct. A fixture
that lacks a browser result remains unverified for rendering even if parsing
passes.

## Running checks

With the workspace dependencies already available, these are source-test
commands, not browser acceptance:

```sh
./node_modules/.bin/vitest run --config tests/assets/vitest.config.ts tests/assets/native-format-conformance.test.ts
./node_modules/.bin/vitest run tests/unit/assets/native-texture-budget.test.ts
```

On 2026-10-31, a Node `crypto` check base64-decoded all 21 fixture entries and
matched every declared byte length and SHA-256. The checked manifest SHA-256
was `1172d9b9f2b5bb1268765efb618a05aff027ee69b6c6bcb5cfa300d82b442755`.
That check proves byte identity only; it does not decode or render the assets.

Recorded source run on 2026-10-31 against base commit `efcc43460` with
in-progress, uncommitted changes: `pnpm exec vitest run
tests/unit/assets/native-texture-budget.test.ts --maxWorkers=1 --reporter=dot`
exited 1, with 8 failures in 9 tests. The no-fallback rollback case passed;
retained and generated mip bytes, duplicate labels, impossible budgets and
mock WebGL residency were among the failures. This is a pre-integration
baseline, not a result for a frozen candidate. Rerun it after the budget and
upload owners' changes and record the candidate identity before claiming a pass.

Run the browser spec only after the global `CODE_COMPLETE_GO` gate, on the
repository's remote headless runner; retain the test result and visual artifacts.
Do not treat a successful runner launch as a passing test. See
[acceptance](../prds/aura3d-native-acceptance.md) for the phase gate and current
runner requirements.

## Known boundaries

- Required and optional format extensions have different failure semantics;
  recognition of an extension does not prove decoding or rendering. Compression
  paths depend on the selected decoder and environment.
- Formats, versions, codecs, archive expansion, resource limits, dependency
  resolution and strict versus fallback texture handling require their own
  fixture and a result for the exact combination before claiming support.
- Mesh data may contain properties that the rendering path does not map. Losses
  and unsupported content must be reported rather than silently treated as
  preserved; numerical parsing alone does not prove pixel fidelity.
- The [mesh loader](../../packages/assets/src/loaders/MeshFormatLoaders.ts)
  retains unmapped PLY vertex and face properties in its parsed elements and
  reports that they are not mapped to rendering. For binary STL, attribute
  words are retained, while nonstandard color encodings are not interpreted.
- A texture budget is meaningful only when the bytes returned to the caller and
  the bytes resident on the relevant device agree with accounting. Device
  isolation, same-name resources, eviction and final release are separate cases.
- This page does not assert coverage for formats or device combinations absent
  from the manifest and evidence table. See the
  [native capability roadmap](../prds/aura3d-native-capability-roadmap.md) for
  the broader required matrix and work still awaiting verification.

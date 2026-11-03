# Native asset formats and interchange

**Status: `prototype`.** This page distinguishes the currently exposed
asset-package paths from the additional formats being implemented in the
[native capability roadmap](../prds/aura3d-native-capability-roadmap.md). A
loader class or a recognized file extension is not, by itself, evidence that a
typed asset renders correctly. The source inventory below is a working-tree
description, not an installed-package or device support claim. See
[Claims and Boundaries](../agents/claims-and-boundaries.md) before describing a
format as supported in a product.

## Asset admission and entrypoints

For the root scene API, admit a licensed model with `aura3d assets add` or
`assets resolve`, retain the generated manifest and typed `src/aura-assets.ts`
entry, and use `model(assets.<generated-key>)`. Do not substitute a raw URL or
an invented asset key. The current documented production bridge requires a
same-origin model URL and hash metadata. Presence of that metadata alone does
not establish that the bytes of the document and all external dependencies
were checked against their digests.

The current `@aura3d/assets` package declares these entrypoints in its package
manifest:

| Entrypoint | Role and boundary |
| --- | --- |
| `@aura3d/assets` | General asset APIs; the package's `browser` export condition selects its browser-safe barrel. The source barrel exports `GLTFLoader`, `OBJLoader`, `EXRLoader`, `GaussianSplatLoader` and the glTF extension support matrix. |
| `@aura3d/assets/browser` | Explicit browser barrel, including those loaders and decoder APIs in source. |
| `@aura3d/assets/gltf-runtime` | Narrow browser runtime used by typed GLB actors; this is not a general format-loader barrel. |
| `@aura3d/assets/vite` | The `auraDecodersPlugin` build/dev integration. It is not a model loader. |
| `@aura3d/assets/exporters` | Declared in the in-progress package manifest for opt-in exporters. Its source barrel and shared context exist; emitted declarations, the packed package and consumer checks must still pass before this is an installed-package claim. |
| `@aura3d/assets/importers` | Declared in the in-progress package manifest; its source barrel includes the Gaussian splat loader. Emitted declarations, the packed package and consumer checks remain to be verified. |

The older root `GLTFLoader` export is deprecated in favor of
`@aura3d/assets`. Exact imports and variants for the new optional loaders and
their installed runtime paths are pending integration; do not infer a package
subpath from a source filename. Check the built package's `exports` and
declarations after integration. Explicit offline conversion and native runtime
loading are different capabilities: record the converter, version, output
digest and any conversion loss when conversion is used.

## Existing bounded import paths

The following describes source behavior; it does not promote all variants to
root rendering support. Exact extension-level status and limits for glTF are
maintained in [`GLTFExtensionSupport.ts`](../../packages/assets/src/GLTFExtensionSupport.ts).

| Format | Source path and known boundary |
| --- | --- |
| glTF 2.x JSON and GLB | `GLTFLoader` loads documents, buffers, geometry, textures and scene data. It rejects declared non-2.x versions and required extensions absent from its support matrix. Matrix entries distinguish runtime support, decoder-required paths and parsed-with-limits behavior; those labels are not proof that every material or animation property renders. Skins, morphs, animation, cameras, lights, variants and instancing must be evaluated on the actual file and render path. |
| Draco, Meshopt, KTX2/Basis in glTF | These extensions need the corresponding decoder/transcoder. `createAssetDecoderRegistry` loads `draco`, `meshopt` and `ktx2` on demand; texture target selection depends on device capabilities and can fall back to uncompressed RGBA. A disabled, missing or failed required decoder produces an error. Decoder presence is not a claim that every compressed file or target GPU is supported. |
| OBJ/MTL | `OBJLoader` produces a glTF-shaped asset from faces, lines, points, positions, normals, texture coordinates and material groups. It accepts inline or referenced material definitions and maps a limited set of MTL scalar fields. Source tests cover the bounded primitive and vertex-color paths; smoothing and material texture maps are not established. Scene hierarchy, skinning and animation are not represented as general OBJ import. Inspect diagnostics and verify the result for the specific asset. |
| OpenEXR | `EXRLoader` / `parseEXR` expose `half` or `float` output, `rgba`, `rg` or `r` layout, and a selected flat part, layer and tile level. Source tests cover uncompressed, RLE, ZIPS, ZIP, PIZ, PXR24, B44/B44A and DWAA/DWAB fixtures; scanlines including subsampled channels; and tiled, mipmap, ripmap and mixed multipart data. A separate bounded deep-data path covers scanline, tiled, multipart, mipmap and ripmap fixtures with uncompressed, RLE, ZIPS or ZIP data. Tiled and deep subsampling and HTJ2K remain unsupported. Reference-tool and compositing limits are described below; these tests do not establish packed-package or browser support. |
| Gaussian splats | Source tests cover splat-specific PLY 1.0 in ASCII and both binary byte orders, 32-byte SPLAT records, SPZ v1–4, embedded glTF/GLB splat accessors and glTF accessors with externally resolved buffers. The draft compressed glTF path accepts an SPZ v2 payload. Source tests also cover multiple glTF splat primitives, scene transforms and repeated instances. Chunk-quantized (packed) PLY and KSPLAT 0.1 (compression levels 0–2) are decoded by bundled Aura3D codecs on the default loader and scene-compiler path; an explicitly registered codec overrides them. Interoperability is limited to the documented layouts and has not been checked against third-party files. Codec, coordinate, multiple-cloud and rendering limits are described below. |
| Ordinary web images | `ImageLoader` recognizes PNG, JPEG, WebP, GIF and AVIF URLs or image data URIs; actual decode depends on the browser's image capabilities. `TextureLoader` handles its declared PNG, JPEG, WebP and AVIF path and returns an sRGB descriptor. This does not imply every image encoding, animation or color profile is preserved. |
| Radiance HDR | A bounded RGBE byte decoder exists in the asset source. The `HDRLoader` package export exposes a diagnostics-oriented compatibility loader; do not equate that loader's report with a general admitted HDR environment or root-rendering claim. |

**OBJ vertex colors — `prototype`; source and mock-resource evidence.**
`OBJLoader` accepts the nonstandard `v x y z r g b` extension for referenced
face, line and point vertices. Mixed uncolored vertices default to white; no
color channel is created when no referenced vertex has color. RGB values are
stored as finite float32 without clamping or color-space conversion. XYZ and
XYZW positions retain their existing behavior, with W ignored. Unsupported
extra-component layouts are diagnosed and ignored; vertex alpha is not
imported. Repeated group primitive runs receive distinct mesh names for resource
lookup while retaining their scene node group names.

**Typed EXR HDRI — `prototype`; source and mock-device evidence.** The source
path accepts an admitted texture reference with `format: "exr"` in
`environments.hdri({ texture: assets.<generated-key> })`, including an
extensionless URL. It decodes the default part (index 0), root channel layer
and level `(0, 0)` to linear float32 RGBA, then orders the equirectangular rows
with +Y first before building the lighting resources. Other parts, named layers
and levels are not selectable through this HDRI API, and a selected deep part
is rejected. [Source and mock-device tests](../../tests/unit/agent-api/native-typed-exr-environment.test.ts)
exercise a DWAA-compressed, subsampled RGB fixture through the typed path,
including numerical values, orientation and a mounted mock renderer. DWAA is
lossy; those fixture checks use a stated tolerance. HTJ2K256 and HTJ2K32 are
unsupported and fail explicitly. When supplied, the asset's SHA-256 hash or
integrity metadata is checked against the fetched bytes before decoding;
request policy applies. Fetches are capped at 256 MiB or a lower requested
limit, and the EXR decoder permits at most 16,777,216 pixels. App disposal
cancels pending loads and releases owned probes and textures, including late
completions. These checks do not establish an installed-package, browser-pixel
or GPU result.

**Typed PVR textures — `prototype`; source and mock-device evidence.** The
asynchronous asset admission path recognizes bounded PVR v3 files and records
their inspected SHA-256. A primitive material can reference an admitted asset
directly, for example `material.pbr({ texture: assets.<generated-key> })`.
The compiler verifies the digest and effective request policy before decoding,
loads the texture asynchronously, and owns the resulting handle through
replacement, removal and disposal. Supported RGBA8 base mips can also feed
scalar-map composition. Alternatively, call
`await texture.loadNativeAsset(assets.<generated-key>)` to obtain a caller-owned
handle; the caller must dispose that handle when it is no longer needed.

The typed source route accepts little-endian PVR v3 with one 2D surface and
face, supported unsigned-normalized 8- and 16-bit channel layouts, and
CPU-decoded BC1–BC5 blocks. PVRTC and ETC variants require a capability or
transcoder that this route does not assume. CLI admission limits files to
64 MiB, 16,777,216 pixels and 64 MiB decoded data. Runtime loading limits files
to 128 MiB, 33,554,432 pixels, 256 MiB decoded data and 32 mip levels; callers
may lower those limits, and conversion has an additional working-set bound.
Supported unsigned-normalized 16-bit PVR channels are converted to linear
RGBA32F, including sRGB-to-linear conversion for color channels, with straight
alpha retained. The resulting texture uses nearest filtering; some WebGPU paths
require `float32-filterable`. Premultiplied PVR pixels are accepted when fully
opaque in RGBA8 or UNORM16. Transparent linear RGBA8 pixels can be converted
to straight alpha for each mip, with rounded color recovery; zero-alpha RGB
must be zero. Projected lights admit only opaque premultiplied inputs because
their shader ignores alpha. Transparent sRGB or UNORM16 premultiplied pixels,
compressed GPU payloads, and nonempty orientation or other PVR metadata remain
unsupported. The decoded-byte limit applies to retained mips and any decoded
fallback. A material load failure is reported through its existing diagnostics
and fallback. Source and mock-device tests cover the direct and
explicit routes, policy snapshots, mip bindings, cancellation and cleanup.
Installed-package behavior, browser pixels and physical-device support remain
unverified.

**Typed VOX models — `prototype`; source and mock-device evidence.** The
asynchronous asset admission path inspects bounded version 150 and 200 files,
records the inspected digest and version, and produces a typed model entry.
To load that entry in an app, register `createVOXFormatAdapter()` from
`@aura3d/assets/importers` in the app's `formatRegistry`; the default registry
does not register it automatically. The adapter checks a supplied version
against the bytes loaded by the native loader. Preflight recognition alone does
not inspect a file or register the adapter.

The adapter converts voxel coordinates to Aura's Y-up scene and flattens the
selected frame into a static mesh. Frame zero is the default; this is not live
voxel animation. The generated mesh is limited to 32 MiB, with separate input,
voxel and scene-node limits. Physical material values are retained as metadata
rather than reproduced as full material behavior; unsupported chunks and other
losses are reported through diagnostics. The app owns the loaded resources and
releases them on replacement or disposal. Source and mock-device checks cover
admission, version and digest mismatches, typed app loading, cancellation and
resource disposal. Installed-package behavior and browser/device rendering are
not yet established.

**Typed NRRD scalar volumes — `prototype`; source and mock-device evidence.**
The asynchronous asset admission path recognizes embedded NRRD and
single-dependency NHDR/NRRD inputs as `scalar-volume` assets. It records the
header digest and, for detached data, the referenced payload digest. The
header and payload are staged together under an identity derived from both;
validation checks the actual header reference and the staged payload. Route
type generation retains those integrity fields for the admitted source.

Use `scalarVolume(assets.<generated-key>, options)` in a scene. The current
loader accepts three spatial axes with at least two samples each, signed or
unsigned 8-bit and 16-bit integer samples or finite float32 data, and
supported RAS, LAS or LPS coordinate metadata. Supported integer samples are
copied exactly into float32 renderer storage; 32-bit integer and float64
samples are rejected. Its transform spans the first through last sample
centers; cell boundaries outside those centers are not included. Transfer
colors are linear, and slice positions and clip planes use the volume's unit
cube. Other scalar types, ambiguous coordinate metadata and unsupported units
are rejected.

The bounded root-rendering routes support WebGL2 and WebGPU with an active
camera, standard depth and a full-size single-sample view. The WebGL2 route
uses the core output pass without postprocessing; the WebGPU route also admits
a basic tone-map-only presentation. Unsupported target, global clipping,
transmission and effect combinations fail explicitly. Whole-volume ordering is
approximate for intersecting transparent objects. Source and mock-device tests
cover loading, integrity, frame planning and resource lifetime. The WebGPU
shader has not been compiled by a WGSL validator, and installed-package
behavior, physical GPU execution and browser pixels are not yet established.

For OBJ, the source parser reads `v`, `vt`, `vn`, `f`, `mtllib` and `usemtl`;
its MTL mapping includes `Kd`, `d`, `Tr` and `Ns`. Missing material libraries
can be skipped by that path. These conversions can change or omit source
meaning, so keep the original asset and validate its actual appearance and
metadata before use.

The extension support matrix lists each glTF extension's known restrictions.
For example, some material extensions are parsed with limits; dispersion is
retained as fallback data rather than a spectral-rendering promise, and
animation-pointer bindings have an allowlist. Required unsupported
extensions and unsupported required pointer targets are rejected. Unsupported
optional pointer tracks are reported through the animation binding diagnostics.
For supported imported materials, optional texture-transform animation can
drive offset, scale and rotation on the five core texture slots of the
textured physical material. Textured unlit and supported skinned materials
admit base-color transforms only. Missing, replaced, shared or incompatible
bindings are diagnosed; extension-lobe maps and other material combinations
remain outside this runtime route. These are source and mock-resource results,
not rendered-device evidence.
Optional unsupported extensions may still require a
file-specific review; successful parsing does not prove full visual fidelity.

## Decoder deployment

The in-progress Vite integration resolves a same-origin decoder directory
beneath the Vite base, with `<vite-base>aura-decoders/` as its default. It
injects that directory as a build-scoped runtime default, serves and copies the
selected decoder families, and includes a KTX2 worker. Explicit app settings
take precedence. The plugin aligns packaged-worker manifest URLs with that
directory; without it, packaged workers retain their bundled decoder URLs.
Serve JavaScript and WebAssembly with their appropriate MIME types and
configure the app's content policy for the actual decoder and worker
mechanism. Nested deployment, packaged worker URLs, offline behavior,
cancellation and content-policy restrictions require WP-07 source and
deployment tests before they can be promised. Verify the built output at the
deployed base; do not assume a dev-server success proves a static deployment.
See the developing
[decoder deployment contract](../assets/decoder-deployment.md) for the current
hosting and content-policy boundaries.

## Formats in the roadmap

These are **roadmap requirements**, not claims of public runtime support.
Some variants have source-level implementations described above and below;
versions, coordinate systems, units, resource limits, dependency handling and
loss cases must be recorded from independent fixtures before promotion.

| Family | Formats and required coverage |
| --- | --- |
| Scene and interchange | FBX; USD/USDZ; Collada (DAE); 3MF; 3DM; AMF; 3DS; VRML; LDraw; KMZ. Scene hierarchy, geometry, supported materials, transforms, dependencies and animation must be stated separately per format. Archive-based inputs need bounded expansion and path handling. |
| Mesh and voxel | PLY and STL with their supported ASCII/binary variants, attributes and byte order; VOX and voxel-volume data with palette, bounds and transforms. OBJ/MTL expansion includes line and point primitives, smoothing and texture dependencies. |
| Scientific and animation data | PCD, PDB, VTK, XYZ, NRRD and GCode; BVH, MD2 and MDD. Specify units, attribute layouts and time mapping. A data parser is not automatically a rendered scene importer. |
| Vector, image and material data | SVG; JXL; UltraHDR; DDS; PVR; KTX1; TGA; TIFF; 3DL and image-based color tables; MaterialX; photometric profiles. State codec, channel, color-space, mip and device limitations per variant. |
| Splat and volume | PLY, SPLAT, KSPLAT, SPZ and registered glTF splat content, plus scalar volumes. Source tests cover the bounded splat variants below; independent fixtures and browser checks are still needed for covariance, spherical harmonics, memory limits, sorting, blending and clipping. |

The following limits are visible in the in-progress sources and are **not**
installed-package or rendered-output evidence:

- FBX source accepts ASCII and binary versions in the 7000–7999 range. It
  warns when more than four skin influences or more than one UV set must be
  reduced, when rotation order is approximated, and for unsupported blend
  shapes or texture formats.
- The USD source targets USDA and stored USDZ; binary crate layers and some
  composition, geometry and shading constructs are not general support.
  Canonical translate–single-axis-rotation–scale animation is supported with
  linear sampling by default or an explicit held interpolation option. The
  importer bounds generated rotation keys and reports time rounding or
  unsupported transform stacks; multi-axis rotation animation is not claimed.
  The 3DM adapter requires an explicitly supplied decoder; a signature check
  does not decode an archive. Texture references and non-mesh objects may be
  reported as unsupported.
- PLY source targets version 1.0 ASCII and binary in both byte orders; STL
  source targets ASCII and binary triangle meshes. Scientific and animation
  parsers return data with their own contracts and need a verified resource
  adapter before a rendering claim. Multi-file detached NRRD is unsupported
  by the in-progress source.
- The opt-in MD2 version 8 adapter requires explicit registration. It retains
  source units and axes, regenerates flat normals, and reports those limits on
  the registered asset. Its projected animation uses at most 128 morph targets;
  seeking clamps at the last frame rather than looping. The source rejects
  oversized projected geometry before sampling. `maxDecodedBytes` separately
  bounds the parsed corner and frame typed-array payload, defaulting to
  160 MiB; callers that raise other parser limits may also need to raise it.
  `maxPCXWorkingBytes` bounds the decoder's counted typed-array payloads and
  defaults to four times the projection `maxBytes` limit, capped at the maximum
  safe integer. These limits exclude
  other input, JavaScript objects, strings and runtime overhead, so there is no
  complete aggregate working-memory budget. The
  root typed-model route and installed-package rendering are not established.
- DDS, PVR and KTX1 image sources reject the listed unsupported array, cube or
  volume layouts; PVR targets little-endian v3. TIFF targets classic version
  42, with bounded channel/compression support and no tiled images. JXL and
  UltraHDR require explicitly supplied decoders; the UltraHDR decoder must
  apply the gain map and return linear float data. These restrictions need
  real encoded fixtures and independent checks.
- The EXR source and tests are in
  [`EXRLoader.ts`](../../packages/assets/src/EXRLoader.ts) and
  [`exr.test.ts`](../../tests/unit/parity/exr.test.ts). Flat texture output
  selects a part, channel layer and tile level, retains representable color
  channels and reports omitted channels. Scanline subsampling is reconstructed
  by nearest neighbor with edge clamping; tiled subsampling is rejected.
  Luminance/chroma conversion uses the file's valid chromaticities or defaults
  to standard luminance weights when absent; invalid chromaticities fail.
  The separate `parseDeepEXR` path preserves per-pixel offsets and half, float
  or unsigned integer samples for a selected deep part and level under input,
  pixel and sample limits. Deep subsampling and HTJ2K are unsupported.
- Deep reference-tool coverage has limits: the reference implementation
  version 3.4.6 reads the mixed multipart data and the padded edge-tile fixture,
  but reports that it cannot read multilevel deep tiles and rejects deep ZIP
  headers. Those two cases use independently authored fixtures and source
  tests without reference-tool readback. `compositeDeepEXR` is an opt-in
  point-sample compositor that assumes premultiplied RGB and uses unlayered
  color and depth channels. Multiple samples require depth; volume samples
  with distinct front and back depths are rejected.
- The splat source and its importer tests are in
  [`GaussianSplatLoader.ts`](../../packages/assets/src/loaders/GaussianSplatLoader.ts)
  and [`native-splat-loader.test.ts`](../../tests/assets/native-splat-loader.test.ts).
  Ordinary PLY requires the expected splat vertex attributes. Chunk-quantized
  PLY (`chunk` bounds, `packed_position`/`packed_rotation`/`packed_scale`/
  `packed_color`, optional `sh` element) and KSPLAT 0.1 (compression levels
  0–2, sectioned bucket layout) are decoded by the bundled, independently
  authored codecs in [`SplatCodecs.ts`](../../packages/assets/src/loaders/SplatCodecs.ts),
  whose source comments state the exact wire layout implemented. Both reject
  other versions, encodings and layouts, truncation, trailing bytes, point and
  decoded-byte budgets with stable `COMPRESSED_PLY_*` / `KSPLAT_*` codes, and
  their output passes the same finite/opacity/rotation validation as other
  splats. Because `GaussianSplatLoader` uses them by default, the public scene
  compiler parses every named splat format without extra configuration. A
  supplied `codecs.compressedPly` or `codecs.ksplat` callback overrides the
  bundled codec; the loader checks the declared count, validates the returned
  single uninstanced cloud and copies its arrays. Source tests use fixtures
  written by independent in-test encoders; no third-party KSPLAT or packed PLY
  file has been decoded, so interoperability beyond the documented layout is
  unverified. SPLAT has no higher-order
  spherical harmonics. SPZ v1–3 uses gzip and requires compatible runtime
  decompression unless an SPZ codec is supplied. SPZ v4 can use a supplied
  Zstandard callback, a platform decoder or a bounded WebAssembly module-worker
  fallback. SPZ v1–3 permits spherical-harmonic degrees through three; v4 and
  PLY permit degree four. The glTF paths accept degrees through three, and the
  draft compressed path specifically requires SPZ v2. Standalone SPZ preserves
  coordinate metadata; compressed glTF accepts RUB or LUF and converts to the
  glTF basis as needed.
- The SPZ v4 fallback uses the original WebAssembly binary from zstddec 0.3.4
  by Don McCurdy, with MIT and Zstandard BSD-3-Clause notices. Aura3D's bounded
  worker adapter is separately authored. The pinned provenance and complete
  notices are recorded in [`provenance.json`](../../packages/assets/vendor/zstd/provenance.json)
  and [`LICENSE.txt`](../../packages/assets/vendor/zstd/LICENSE.txt); the
  upstream source-to-binary build has not been independently reproduced.
  [Source tests](../../tests/assets/zstd-decoder.test.ts) exercise the decoder,
  mock worker lifecycle and a real Node worker thread. The fallback requires an
  available module worker and permission to compile WebAssembly; worker startup,
  loading or content-policy failures produce errors. Deployed worker URLs and
  content policy still need packed-consumer and browser verification.
- glTF splat source tests cover active-scene selection, nested node transforms,
  repeated instances and GPU-instancing attributes without duplicating a
  cloud's arrays. Multiple distinct primitives, including mixed uncompressed
  and draft SPZ v2 content, are retained as separate clouds with their own
  material and color metadata, instances and bounds. The result includes a
  conservative union of visible cloud bounds; a caller can also select a
  primitive explicitly. Point and decoded-byte limits apply across clouds and
  instances, and the runtime checks an aggregate GPU budget. Animated splat
  transforms or ancestors, skins and morph targets are rejected.
- The splat renderer source maps 16 declared coordinate conventions to scene
  coordinates and rejects unknown SPZ extensions and nonstandard depth. The
  [renderer unit tests](../../tests/unit/rendering/native-gaussian-splat-renderer.test.ts)
  exercise coordinate mapping, distance ordering across clouds, interleaving
  with transparent items and draw submissions with a mock device. Prepared
  clouds must share a device, camera view and viewport; ordering whole
  transparent meshes by their sort centers cannot resolve intersections at
  individual pixels. A [public app unit test](../../tests/unit/agent-api/native-gaussian-splat-runtime.test.ts)
  submits and releases multiple distinct clouds on a mock device; it does not
  produce pixels. The current integration rejects temporal paths using
  anti-aliasing or motion blur when splats are present. Color-space conversion
  requires a compatible offscreen target and adapter and is subject to
  scratch-memory and per-frame conversion limits. Current WebGL2 and WebGPU
  conversion adapters reject multisampled targets; this is a conversion limit,
  not a claim that every splat draw requires conversion. These source and mock
  checks do not establish browser pixels or device behavior.

Packed-consumer validation, production-build browser acceptance and
physical-device acceptance for the EXR and splat paths remain pending. The
source tests and mock-device results do not establish installed-package or
physical-device support.

## Per-format import matrix

Source of truth: `NATIVE_FORMAT_CATALOG` in
`packages/assets/src/loaders/NativeFormatCatalog.ts` (exported from
`@aura3d/assets/importers`); `tests/assets/native-format-catalog.test.ts`
checks that every catalog id has a row here. `createNativeFormatRegistry()`
installs every `root model()` row into an app `FormatRegistry` (pass it as
`createAuraApp(canvas, { formatRegistry })`); `admitNativeFormat(bytes,
format)` runs the format's real bounded parser under one shared limit set
(`maxFileBytes` 64 MiB, `maxExpandedBytes` 256 MiB, `maxPixels` 16 Mi,
`maxDecodedBytes` 256 MiB, `maxElements` 4 M) and fails with one of the stable
codes `NATIVE_FORMAT_UNKNOWN`, `NATIVE_FORMAT_FILE_LIMIT`,
`NATIVE_FORMAT_ARCHIVE_LIMIT`, `NATIVE_FORMAT_PIXEL_LIMIT`,
`NATIVE_FORMAT_ALLOCATION_LIMIT`, `NATIVE_FORMAT_CODEC_REQUIRED`,
`NATIVE_FORMAT_TRUNCATED`, `NATIVE_FORMAT_UNSUPPORTED_VARIANT`,
`NATIVE_FORMAT_DEPENDENCY_UNRESOLVED` or `NATIVE_FORMAT_MALFORMED` (the
parser's own code is kept as `sourceCode`). Byte admission covers
self-contained documents; external references must be admitted with their
document. `supplied` codecs (3DM, JPEG XL, UltraHDR) are refused with
`NATIVE_FORMAT_CODEC_REQUIRED` because Aura3D ships no decoder for them.
Rows are source-level contracts; rendered and device evidence is tracked in
[native format conformance](../assets/native-format-conformance.md).

| Id | Extensions | Asset type | Codec | Versions / variants | Units | Coordinates | Dependencies | Known losses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `obj` | .obj | model (root `model()`) | built-in | ASCII | unspecified (source units kept) | right-handed, +Y up by convention (not declared) | mtllib MTL files and their map_Kd/map_Ke/bump textures, resolved relative to the document | free-form curves/surfaces and unmapped MTL statements are reported, not converted |
| `fbx` | .fbx | model (root `model()`) | built-in | ASCII and binary 7000-7999 | UnitScaleFactor (centimetres default) converted to metres | GlobalSettings axis system converted to glTF +Y up | embedded or relative texture files | NURBS, constraints, cameras/lights outside the mapped subset and layered textures are diagnosed |
| `usd` | .usd, .usda, .usdz | model (root `model()`) | built-in | USDA 1.0; USDZ stored ZIP | metersPerUnit (default 0.01) converted to metres | upAxis Y or Z converted to glTF +Y up | USDZ archive members or relative asset paths | binary crate (usdc) layers, composition arcs and unsupported schemas are rejected or diagnosed |
| `collada` | .dae | model (root `model()`) | built-in | 1.4.1; 1.5.0 | <unit meter> converted to metres | <up_axis> X/Y/Z converted to glTF +Y up | image library URIs relative to the document | physics, kinematics, effects outside common profile are diagnosed |
| `model3mf` | .3mf | model (root `model()`) | built-in | 1.0 core (ZIP) | unit attribute (millimetre default) converted to metres | right-handed +Z up converted to glTF +Y up | package parts only; no external references | beam lattices, slices and production extensions are diagnosed |
| `rhino` | .3dm | model (root `model()`) | supplied | archive version detected; decoding by supplied codec | model unit system converted to metres | +Z up converted to glTF +Y up | none (embedded) | Aura3D ships no 3DM decoder; without RhinoDecoder admission fails with NATIVE_FORMAT_CODEC_REQUIRED |
| `amf` | .amf | model (root `model()`) | built-in | 1.1 (XML or ZIP) | unit attribute converted to metres | +Z up converted to glTF +Y up | ZIP-packed document only | curved triangles and textures are diagnosed |
| `legacy3ds` | .3ds | model (root `model()`) | built-in | binary chunk 3 | unspecified (source units kept) | +Z up converted to glTF +Y up | texture names are reported, not fetched | keyframer animation and texture maps are diagnosed |
| `vrml` | .wrl, .vrml | model (root `model()`) | built-in | 2.0 utf8 | metres | +Y up (glTF compatible) | Inline/ImageTexture URLs are reported | scripts, routes, sensors and PROTO are diagnosed |
| `ldraw` | .ldr, .mpd, .dat | model (root `model()`) | built-in | 1.0.x line types 0-5 | LDU (0.4 mm) converted to metres | -Y up converted to glTF +Y up | sub-file references resolved relative to the document under dependency count/byte limits | conditional lines and BFC edge cases are diagnosed |
| `kmz` | .kmz | model (root `model()`) | built-in | KML 2.2 ZIP | COLLADA unit converted to metres | COLLADA up axis converted; geographic placement is reported, not applied | archive-local COLLADA and PNG/JPEG textures | non-model KML features are ignored with diagnostics |
| `ply` | .ply | model (root `model()`) | built-in | 1.0 ascii; 1.0 binary_little_endian; 1.0 binary_big_endian | unspecified (source units kept) | source axes kept | none | custom elements/properties are retained on the parsed record, not rendered |
| `stl` | .stl | model (root `model()`) | built-in | ASCII; binary little-endian | unspecified (source units kept) | source axes kept | none | binary attribute byte counts and colour conventions are not interpreted |
| `vox` | .vox | model (root `model()`) | built-in | 150; 200 | one voxel per unit | +Z up converted to glTF +Y up | none | one static frame is selected; materials beyond palette colour are diagnosed |
| `pcd` | .pcd | model (root `model()`) | built-in | 0.7 ascii, binary, binary_compressed (LZF) | metres (PCL convention) | VIEWPOINT reported; points kept in sensor frame | none | fields other than x/y/z/rgb/normal remain on the typed record |
| `pdb` | .pdb | model (root `model()`) | built-in | 3.3 fixed columns | angstrom | orthogonal Cartesian angstrom | none | bonds beyond CONECT and secondary structure are not rendered |
| `vtk` | .vtk | model (root `model()`) | built-in | legacy 1.0-4.x ASCII/BINARY POLYDATA and UNSTRUCTURED_GRID | unspecified | source axes kept | none | volumetric cells require a volume renderer and are rejected |
| `xyz` | .xyz | model (root `model()`) | built-in | whitespace columns | unspecified unless xyzUnits is supplied | source axes kept | none | extra columns remain on the typed record |
| `gcode` | .gcode, .gco, .nc | model (root `model()`) | built-in | RS-274 G0-G3, G20/G21, G90/G91 | G21 millimetres or G20 inches | machine axes kept | none | tool changes and machine-specific codes are diagnosed |
| `nrrd` | .nrrd, .nhdr | scalar-volume | built-in | NRRD0001-NRRD0005 raw/ascii/gzip | space units from the header | space directions/origin applied | detached data file for .nhdr | non-3D or vector volumes are rejected |
| `bvh` | .bvh | animation | built-in | HIERARCHY/MOTION | unspecified; unitScale option | source axes kept | none | channels other than X/Y/Z position/rotation are rejected |
| `md2` | .md2 | model (root `model()`) | built-in | 8 | unspecified (source units kept) | source axes kept | PCX skins (resolveSkins) | frames beyond 128 morph targets are rejected; normal table indices are replaced by generated normals |
| `mdd` | .mdd | animation | built-in | big-endian point cache | unspecified | source axes kept | a mesh with identical vertex order | contains no topology; must be bound to a matching mesh |
| `svg` | .svg | model (root `model()`) | built-in | 1.1 / 2 shapes and paths | user units | SVG y-down converted to glTF +Y up on the Z=0 plane | none (external references rejected) | text, gradients, filters, masks and clip paths are diagnosed |
| `exr` | .exr | texture | built-in | 2.x scanline/tiled/multipart/deep; NONE/RLE/ZIPS/ZIP/PIZ/PXR24/B44/B44A/DWAA/DWAB (HTJ2K rejected) | scene-linear | top-left origin | none | deep data is composited for texture output |
| `dds` | .dds | texture | built-in | DX9 FourCC; DX10 header | pixels | top-left origin | none | BC1-5 have CPU fallbacks; other block formats require declared GPU support |
| `pvr` | .pvr | texture | built-in | PVR3 | pixels | orientation metadata reported | none | compressed payloads need declared GPU support |
| `ktx1` | .ktx | texture | built-in | KTX 11 | pixels | KTXorientation reported | none | compressed payloads need declared GPU support |
| `tga` | .tga | texture | built-in | 2.0 types 1-3, 9-11 | pixels | origin bit applied | none | extension area metadata ignored |
| `tiff` | .tif, .tiff | texture | built-in | 6.0 baseline; none, PackBits, LZW, Deflate | pixels | Orientation tag applied | none | only the first page is decoded |
| `jxl` | .jxl | texture | supplied | signature checked; decode by supplied codec | pixels | top-left origin | none | Aura3D ships no JPEG XL decoder; refused with NATIVE_FORMAT_CODEC_REQUIRED without codecs.jxl |
| `ultrahdr` | .uhdr | texture | supplied | JPEG envelope checked; gain-map decode by supplied codec | scene-linear after gain map | top-left origin | none | Aura3D ships no gain-map decoder; refused with NATIVE_FORMAT_CODEC_REQUIRED without codecs.ultrahdr |
| `3dl` | .3dl | lut | built-in | Autodesk/Lustre lattice, optional Mesh header | integer output range (outputMax or Mesh depth) | blue-fastest by default | none | non-cubic lattices are rejected |
| `materialx` | .mtlx | material | built-in | 1.38; 1.39 | unitless | texture coordinates per node | xi:include documents and image files | unsupported nodes and shading models produce explicit diagnostics |

## Interchange export and loss

The export catalog under development is glTF/GLB, OBJ, PLY, STL, USDZ,
Draco-compressed geometry, EXR and KTX2. The source barrel names
`exportGLTF`, `exportOBJ`, `exportPLY`, `exportSTL`, `exportUSDZ`,
`exportDRACO`, `exportEXR` and `exportKTX2`; these names are not proof that the
declared package subpath currently builds, packs or round-trips. No blanket
preservation guarantee applies across
these formats. A supported exporter must return its data, media type,
dependencies and structured warnings that identify omitted or converted
content. The following source-declared boundaries still require the source,
independent-reader and installed-consumer checks described below:

| Output | Declared variants and loss boundaries |
| --- | --- |
| glTF/GLB | JSON or binary; dependencies can be embedded or returned separately. Coordinates are kept as supplied and a unit or up-axis mismatch is reported. Verify the scene, materials, cameras, lights, skins, morphs, animation and extensions actually used by the input. |
| OBJ | Geometry is placed in world coordinates; an MTL and supported texture dependencies are returned. Scene hierarchy, animation, skins, morphs and cameras cannot be represented as such and need loss reporting. |
| PLY | ASCII, binary little-endian or binary big-endian; flat geometry includes triangles and indexed edges. Transforms are baked and hierarchy and unsupported scene content are reported as losses. |
| STL | ASCII or binary little-endian triangle facets; binary is the declared default. Transforms are baked and normals derived from transformed facets. Material, scene hierarchy, animation, skin, morph and per-vertex attributes are not preserved. STL does not declare units. |
| USDZ | Uncompressed archive with a USDA stage and embedded PNG/JPEG base-color textures; one animation timeline. The source declares approximation or omission warnings for unsupported interpolation, extra clips, cameras, lights, skins, morphs and arbitrary attributes. |
| Draco | Standalone triangles or points, requiring an explicitly injected encoder. Indexed lines, materials, rigs and morphs are not a standalone Draco stream; opt-in quantization is lossy and must be reported. |
| EXR | A selected attachment and layer, half/float channels, and none/RLE/PIZ scanline output. PIZ compression requires an injected encoder; without one, the writer declares uncompressed PIZ blocks and a warning. Other attachments and layers are reported omitted. |
| KTX2 | Raw `r8unorm`, `rg8unorm`, `rgba8unorm`, `rgba8unorm-srgb`, `rgba16float` or `rgba32float` levels; other encodings need an injected encoder. The declared layout disallows 3D arrays and requires square cube faces. Confirm the actual mip/layout and codec before assuming preservation. |

The source glTF snapshot and writer can also export a bounded set of material
and punctual-light animation-pointer tracks, including offset, scale and
rotation tracks for the retained texture bindings. The writer validates
targets and values and preserves supported interpolation and cubic tangents;
the snapshot reports ambiguous, missing or unsupported targets as losses.
Animated texture transforms with a bottom-left UV origin are rejected because
converting them can couple the curves. Imported light identity can associate
one source light with multiple exported instances while the in-memory identity
is retained. Events, other unsupported properties and reconstructed light
identities remain outside this path. These behaviors have source tests; they do
not establish installed-package or browser acceptance.

Do not assume the declared exporter subpath or an `assets export` command is
usable in an installed package until the corresponding source, CLI
registration, package build and packed-consumer tests are complete. The
source also provides `sceneFromGLTFAsset` to form interchange input from an
asset and its edited scene with source-loss warnings; this adapter needs the
same installed-path and round-trip verification. Scene serialization and mesh
optimization are not substitutes for those interchange exporters.

`sceneFromGLTFAsset` retains the source document's `asset` provenance
(`generator`, `copyright`, `version`, `minVersion`, bounded JSON `extras`) as
`scene.document`, and `KHR_materials_variants` as `scene.materialVariants`
(variant names) plus per-primitive `variants` mappings
(`{ material, variants: [variantIndex] }`). `exportGLTF` writes the variants
extension back (declared in `extensionsUsed`, not required), keeps `copyright`
and `minVersion` in `asset`, and records the source generator, version and
extras under `asset.extras["aura3d:sourceDocument"]` while naming itself as the
file's generator; re-importing an Aura3D export recovers the original source
provenance rather than nesting it. OBJ, PLY, STL, USDZ and Draco cannot store
these and report `DOCUMENT_PROVENANCE_LOST` / `MATERIAL_VARIANTS_LOST`.

Exporter round trips are verified with readers authored independently in
`tests/support/independent-interchange-readers.ts` (glTF/GLB accessors,
hierarchy, skins, morphs and animation; complete PLY ASCII/little/big-endian;
USDZ central directory, CRC and 64-byte alignment plus a USDA stage parser that
composes xform ops and time samples). See
`tests/unit/assets/native-exporter-independent-readers.test.ts`. These are
source tests; installed-package and browser receipts remain separate.

## Request, integrity and resource boundaries

Treat imported documents and every external buffer, image, material library,
archive member and decoder as separate resources with their own origin and
provenance. The earlier request path had known header/credential forwarding,
URL-only shared-fetch and dependent-image policy gaps. In-progress source
updates forward configured `FileLoader` options to `fetchBytes`, and key glTF
shared fetches by an opaque request identity with subscriber-specific aborts.
The image and all other public dependency paths still need source and
installed-path verification before this behavior is a blanket guarantee.

The in-progress `AssetRequestOptions` declaration includes credentials, headers,
cache, priority, mode, redirect, referrer policy, allowed and source origins,
expected final URL, maximum bytes and versioned integrity metadata. Its
presence does not establish that every loader and dependency forwards those
fields. `fetchBytes` has source-level origin, size and optional digest checks;
the root actor passes admitted integrity metadata into the pipeline in current
source. The required request contract applies signal, credentials, headers,
cache, priority and progress consistently to the document and dependencies;
prevents secrets from being sent across origins or written to diagnostics;
partitions cached content by effective security context and expected digest;
and lets one subscriber cancel without cancelling another. Verify the admitted
document and subresource digests before caching or rendering, including
redirected requests. The current hash metadata requirement must not be
described as proof of this end-to-end verification. Avoid sending secrets in
URLs and follow the deployment's own authorization and origin rules.

Request-policy-aware asset caches in the current source share requests that
explicitly use `credentials: "omit"`, or that supply a non-secret
`securityContext` identifying the current authentication generation. Without
either, requests that may use ambient browser credentials are acquired
independently. An app or worker can set `assets.securityContext`; that value
overrides asset-level generations and is captured for the owner's lifetime.
Dispose and recreate the app or worker with a new generation when ambient
credentials or authorization change. The value partitions asset cache identity;
it is not a credential or request header. Browser HTTP caching is separate,
and game audio uses its own security-context API. These are source-level
contracts for the request-aware paths, not a guarantee for every loader or an
installed-package claim.

On completion, release loader handles and decoded/GPU resources according to
their owning API. Archive, image and codec paths must enforce their documented
file, expansion, pixel, job and allocation limits, surface unsupported data
clearly, and clean up after abort or failure. Those limits are not universal
until each loader and entrypoint has an explicit tested contract.

## Evidence required before promotion

For each format and variant, retain a fixture manifest with source, license,
version, digest, expected output and size limits; source tests for valid,
malformed, truncated and unsupported inputs; package/export and installed
consumer checks; and format-specific loss and dependency tests. For a claimed
root render, also retain the admitted typed asset, production-build browser
run, requested/active backend, resource and failure diagnostics, and a
claim-specific pixel assertion. Hardware claims need a separately identified
physical-device run. The relevant planned checks include
`tests/assets/native-format-conformance.test.ts`,
`tests/assets/native-public-loader-contracts.test.ts`,
`tests/assets/native-exporters.test.ts`,
`tests/browser/native-format-import.spec.ts`,
`tests/browser/native-format-maturity.spec.ts` and
`tests/browser/native-exporters.spec.ts`. These names describe required
checks, not passing receipts. Browser and device acceptance runs occur only
after the global code-complete gate described in the
[phase boundary](../prds/aura3d-native-code-complete.md).
The [format conformance inventory](../assets/native-format-conformance.md)
records fixture-specific coverage and limitations separately from this page.

# Native rendering backends

**Status: `prototype` for the native-capability roadmap.** This page describes
the source paths inspected during roadmap implementation; it does not certify
the candidate build or establish support on a particular GPU. The working tree
can change while the roadmap lanes are integrated. The public claim rules and
retained evidence are in [Claims and Boundaries](../agents/claims-and-boundaries.md).
The [roadmap](../prds/aura3d-native-capability-roadmap.md) describes the
remaining contracts; its proposed types and checklists are not proof that those
contracts are already public.

## Backend and evidence matrix

| Path or feature | Current boundary | Evidence and remaining scope |
| --- | --- | --- |
| Root app, WebGL2 | The root production renderer defaults to WebGL2 and requires a usable WebGL2 canvas when that backend is selected for a renderable browser scene. | Existing receipts in [Claims and Boundaries](../agents/claims-and-boundaries.md) and [renderer lifecycle](renderer-lifecycle.md) cover only their named workloads, largely on software WebGL2. They do not establish every feature on every device. |
| Root app, WebGPU | Experimental root selection is exposed via `renderer.backend: "webgpu"` or `"auto"`; permitted initialization failures can attempt WebGL2 fallback on the same canvas. | WP-03 still requires candidate-bound verification of selection, selected-device compute, fallback and lifecycle. A browser receipt must show adapter, active backend, dispatch, output and pixels. |
| `@aura3d/rendering` devices | The lower-level `Renderer` and `createRenderDevice` expose WebGL2, WebGPU and mock device paths. The WebGPU device value is also exposed from `@aura3d/rendering/webgpu`. A package device is a lower-level API, not proof of root-app support. | Selected portable-material workloads have their own bounded package evidence in [portable custom materials](portable-custom-materials.md). A mock tests contracts without establishing browser rasterization or physical-device support. |
| Depth and section clipping | Root cameras choose standard, reversed or logarithmic depth (experimental, source and mock-device tested). Projection, culling, clear/compare, camera depth prepasses, postprocess linearization and readback follow the frame convention; shadow maps keep standard light depth. Reversed depth is `full` precision on WebGL2 with `EXT_clip_control` (zero-to-one clip, float depth in renderer-owned targets), otherwise `reduced`; logarithmic depth renders on WebGL2 and WebGPU. | Packed-browser and real-GPU evidence per mode; WebGPU programs that consume a native zero-to-one projection (full reversed precision on WebGPU). |
| Draw state and vertex data | Material and draw descriptors expose multiple state fields. Their presence does not mean every field is implemented identically by each device. | WP-31 must connect and verify the complete supported state and vertex layouts on each backend. Native WebGPU currently reduces several state choices; see below. |
| Transparency | The forward queue sorts blended items; object sorting cannot make intersecting transparent geometry order independent. | Weighted order-independent transparency and its sorted fallback are roadmap work under WP-31; refractive multilayer transmission is a separate limitation. |
| Camera views and postprocessing | Every root `cameras.array` / `cameras.stereo` group is honoured in scene order (distinct group names required). Each view has its own matrices, depth convention, frustum culling (including matrix-only views over Scene sources), sized target, history and inherited, replaced or disabled postprocessing. Native WebGPU depth of field refuses multiview with `NATIVE_DOF_MULTIVIEW_UNSUPPORTED` before any view draws. | Source and mock-device tested; browser `native-multiview.spec.ts` must still show distinct view pixels, viewport boundaries and per-view effects. |
| Output color | Root diagnostics specify sRGB output and the source has linear-lighting and tone-mapping paths. | Wide-gamut canvas negotiation and extended-range display output are separate, unproven capabilities. WP-32 owns conversion, fallback and end-to-end output checks. |
| Loss and recovery | The retained WebGL2 receipt demonstrates a loss and explicit scene remount. Source also attempts a remount on restoration for the current root scene. | Neither proves recovery of arbitrary caller-owned resources. End-to-end WebGPU device recreation, resource rehydration and root recovery remain unverified. |

## Selection, requirements and fallback

For a root scene, the typed `createAuraApp` option `renderer.backend` accepts
`"webgl2"`, `"webgpu"` or `"auto"`. With no explicit backend it requests
WebGL2, except that the deprecated `renderer.qualityProfile` value
`"experimental-webgpu"` requests WebGPU; an explicit backend takes precedence.
`"auto"` tries WebGPU first. Root WebGPU selection checks the requested adapter
features and requires a native render pipeline and canvas surface; this is not
proof of displayed pixels.

`renderer.allowFallback` defaults to `true` for `"auto"` and `false` for a
`"webgpu"` request; either can be overridden. When allowed, a WebGPU
initialization failure attempts WebGL2 on the same canvas, which can itself fail
if that canvas cannot supply WebGL2. This is not a guarantee of recovery from
later draw errors or device loss. `renderer.requiredFeatures` lists WebGPU
adapter features; a nonempty list is invalid for a direct WebGL2 request, and a
WebGL2 fallback does not provide those WebGPU features. The deprecated
`renderer.fallback` field is separate and does not enable cross-backend
fallback. The app's `quality` controls the render path; it is not evidence of a
different graphics backend.

After a successful main-thread renderer mount, reported by `app.readiness()`
(or by a successful `app.readyStrict()`), inspect
`app.diagnostics().renderer?.backendSelection` for the requested and active
backend, fallback reason, missing features and loss state. `app.ready()` may
settle despite a mount failure; check `app.diagnostics().errors` as well. The
top-level backend may initially report WebGL2 before selection or after a
mount failure, so it alone is not proof of an active device. A renderable scene
that cannot mount its requested backend or an allowed fallback is an error;
the Canvas 2D diagnostic preview is not a substitute for a rendered 3D scene.

At the lower-level package boundary, `createRenderDevice` defaults to WebGL2.
It accepts an explicit `webgl2`, `webgpu` or `mock` backend and throws for an
unknown one. WebGL2 requires a canvas whose `getContext("webgl2")` succeeds.
The WebGPU branch loads its device implementation on demand and requires a
runtime capable of returning an adapter and device; canvas presentation also
requires a usable `getContext("webgpu")`. An explicit WebGPU request in this
factory does not silently fall back. The package-level backend selection helper
and the root app must not be conflated: availability detection alone does not
prove the requested scene was submitted or displayed.

Device features, target formats, sample counts and limits vary with the actual
adapter. For example, the current WebGPU target path accepts sample counts 1
or 4 and rejects a sampleable multisampled depth resolve. Synchronous WebGPU
`readPixels` is unsupported; the asynchronous path requires a native target
and supports the formats validated by that operation. Handle errors from the
requested path instead of assuming an undocumented downgrade. Record browser,
OS, adapter identity, active backend, feature flags and target formats when
reporting a result; software rendering is not physical-GPU evidence.

## Depth, clipping and views

The root camera clipping helper currently validates finite `0 < near < far`;
the default root helper values are `0.05` and `100`. Individual lower-level
camera constructors have their own defaults and validation. Choose a near plane
appropriate to the scene and do not assume infinite far planes. The built-in
native WebGPU shader maps conventional clip coordinates to the WebGPU depth
interval.

`camera.depth.mode` selects the frame depth convention (experimental for
`reversed` and `logarithmic`; source and mock-device tested only):

| Mode | Projection | Clear / compare | Stored depth | Precision report |
|---|---|---|---|---|
| `standard` | near -> -1, far -> +1 | 1 / `less-equal` | standard window depth | `standard` |
| `reversed`, WebGL2 with `EXT_clip_control` | near -> 1, far -> 0 (rebuilt zero-to-one projection, `clipControlEXT(LOWER_LEFT_EXT, ZERO_TO_ONE_EXT)`) | 0 / `greater-equal`, negated polygon offset | 1 - standard depth, in `DEPTH32F_STENCIL8` (or `DEPTH_COMPONENT32F` without stencil) | `full` into renderer-owned targets; `reduced` into the canvas or a fixed-point caller target |
| `reversed`, WebGL2 without `EXT_clip_control` | near -> +1, far -> -1 | 0 / `greater-equal`, negated polygon offset | 1 - standard depth, 24-bit | `reduced`: minus-one-to-one clip, ordering only |
| `reversed`, WebGPU | near -> +1, far -> -1, remapped to zero-to-one in the vertex stage | 0 / `greater-equal`, negated polygon offset | 1 - standard depth | `reduced`: the in-shader (z + w) / 2 remap cancels the float gain. Float targets are available (`depthPrecision: "float"`: `depth32float`, `depth32float-stencil8` with that feature, else `depth24plus-stencil8`) |
| `logarithmic` | standard | 1 / `less-equal` | `ln(d / near) / ln(far / near)` written as fragment depth (`gl_FragDepth` / WGSL `@builtin(frag_depth)`, no early-Z) | `extended` |

The renderer makes the camera's convention the device's active convention for
each frame and reports it with `renderer.getDepthConvention()` (and the mounted
app's `diagnostics().renderer.depth`): `clipRange`, `depthStorage`, `precision`
and `precisionReason`. A reversed WebGL2 frame with `EXT_clip_control` rebuilds
the camera projection, view-projection and inverse projection in zero-to-one
form (exact depth row from near/far) and allocates float depth for its
renderer-owned scene targets; window depth is still 1 - standard depth, so
every reconstruction keeps one formula. Materials author compares in standard
terms; ForwardPass, camera depth prepasses and the WebGL2/WebGPU devices flip
them for a reversed frame. Shadow maps, probe faces and mirrors scope standard
depth and reset clip control to minus-one-to-one. Postprocess depth is
linearized with the frame's mode, clip range and actual inverse projection, and
CPU depth readback is converted to standard window depth. Contact shadows,
Gaussian splats, scalar volumes in renderer frames, depth preview materials and
the native deferred, meshlet and visibility paths require standard depth and
fail precisely. Weighted transparency uses sorted transparency for nonstandard
frames. The standalone legacy `VolumeRenderer` (`draw({ depth })`, default the
device's active convention) and vegetation impostors (`impostorDepthUniforms`)
write fragment depth in the frame convention.

The roadmap's section-plane contract retains the nonnegative signed-distance
half-space and calls for validated world/local planes, union/intersection
semantics and matching shadow/depth behavior. These are planned semantics until
the public entrypoint, compiler and active backend are connected and tested.

`cameras.array` accepts a nonempty list of camera entries and normalized
viewports in the unit square, with a bottom-left origin. `cameras.stereo`
describes a perspective eye pair with side-by-side or over-under layout. A
scene can contain several such groups; all are composed in scene order and
multiple groups need distinct non-empty names (`CAMERA_VIEWS_GROUP_ID`).
Each view resolves its own camera and depth convention and culls the scene
with its own frustum, including views given only a view-projection matrix
(the frustum follows that view's clip range, reversed depth and infinite far
plane). Views can inherit the source postprocess, replace it or disable it
with `postprocess: false`. Native WebGPU depth of field renders a single
full view, so a multiview frame that requests it is rejected with
`NATIVE_DOF_MULTIVIEW_UNSUPPORTED` before any view target is drawn; disable
`dof` for those views. Per-view pixels still need browser evidence.

## Draw state, transparency and shader data

The lower-level material state describes depth testing/writes, comparison,
culling, blend mode, color writes, scissor, polygon offset, stencil and
alpha-to-coverage. Blended materials currently reject enabled depth writes.
The WebGPU submission source presently derives a pipeline from a subset of
that descriptor, including a blend boolean and conventional depth choices;
do not assume custom blend factors, stencil, winding, masks or polygon offset
are honored there merely because a descriptor accepts them. Backend-specific
pixel checks are required for each advertised state.

The forward queue separates opaque, transmission, masked and transparent
items. Alpha-like transparent items are ordered back-to-front within the
transparent group, while additive/multiply items follow that group. This is
object-level ordering, not a solution for intersections or arbitrary
refractive layers. The planned weighted method is an approximation and must
declare its compatible formats, alpha/depth behavior, per-view resources and
explicit fallback before it is advertised.

`@aura3d/rendering` exposes `VertexFormat` and `UniformLayout`. Vertex attribute
storage types are `float32` (the default), `int8`, `uint8`, `int16`, `uint16`,
`int32` and `uint32`. `normalized` converts integer storage to float shader
inputs and is ignored for `float32`; `integer: true` selects an integer shader
input and requires unnormalized integer storage. The format also describes
buffer-slot streams. Backend-specific validation and conversion still apply:
for example, WebGPU requires instance-stream divisor 1 and may repack some
integer attributes within bounded CPU conversion limits. These source paths do
not establish rendered support for every combination.

`UniformLayout` packs `float`, `vec2`, `vec3`, `vec4` and `mat4` fields into a
`Float32Array` with its documented alignment rules. It is not a general integer,
boolean, nested structure or storage-buffer encoder. Selected portable custom
materials use paired GLSL ES 3 and WGSL with a bounded binding schema; see
[portable custom materials](portable-custom-materials.md). Mixed integer and
float buffers, non-square matrices, separate streams and shader layouts across
address spaces require their own exact-byte, upload/readback and rendered
coverage before they can be claimed.

## Color and resource lifetime

The current root diagnostic contract reports sRGB output. Internal float
targets can retain more range than an 8-bit target, but their existence does not
prove wide-gamut canvas presentation or an HDR display. The existing generic
`convertColorSpace` helper clamps channels to `[0, 1]`; do not use it as proof
that extended-range or negative linear values are preserved. A `display-p3`
type in a lower-level module alone is not an implementation of an end-to-end
Display-P3 output path. Keep colorless data textures in the appropriate linear
data space and check the actual output and fallback reported for the workload.

Dispose the app, renderer and resources their API assigns to the caller. The
WebGL2 receipt describes pausing on loss and explicitly remounting the retained
scene before resuming. The current app source additionally attempts a remount
after restoration; validate that behavior for the candidate before relying on
it. The WebGPU device observes device loss and rejects later device work, but
the source does not establish transparent recreation of a device and all
caller-owned resources. Subscribe/unsubscribe using the relevant API and stop
issuing work when the device is lost.

## Evidence needed before promotion

Retain candidate-bound source results and then, only after the global
`CODE_COMPLETE_GO` gate, run the roadmap's remote browser/device acceptance.
At minimum, the following coverage must be attached to the exact public path
and backend being claimed:

- WP-03: `tests/unit/rendering/native-backend-selection.test.ts` and
  `native-drawing-pipelines.test.ts`; browser `native-gpu-render-compute.spec.ts`
  and `native-drawing-pipelines.spec.ts`, including unavailable adapter,
  fallback, loss, disposal, dispatch and rendered pixels.
- WP-02 and WP-30: `tests/unit/parity/viewport-views.test.ts`,
  `tests/unit/rendering/native-clipping.test.ts` and
  `native-camera-depth.test.ts`; browser `native-multiview.spec.ts`,
  `native-clipping.spec.ts` and `native-camera-depth.spec.ts` for the supported
  views, planes, shadows, depth-aware effects and projection modes.
- WP-31: `tests/unit/rendering/native-render-state.test.ts` and
  `native-transparency.test.ts`, then the matching browser specs for state,
  layout, layer order, opaque depth, alpha, multisampling and disposal.
- WP-32 and WP-05: `tests/unit/rendering/native-color-management.test.ts`,
  `native-dynamic-textures.test.ts` and `native-shader-data-layout.test.ts`;
  browser `native-color-output.spec.ts` and `native-dynamic-textures.spec.ts`
  for texture-to-presentation output and truthful fallback.

These filenames specify required roadmap coverage; their listing here does not
assert that a test exists, ran or passed. Hardware/browser combinations not
represented in retained results remain unverified. See
[rendering proof required](../agents/rendering-proof-required.md) for the
evidence standard and the roadmap's Phase B acceptance document for execution.

Source references: [root renderer option types](../../packages/engine/src/agent-api/nodes/types.ts),
[root renderer options](../../packages/engine/src/agent-api/app/rendererOptions.ts),
[root mount](../../packages/engine/src/agent-api/app/mountRenderer.ts),
[renderer compiler](../../packages/engine/src/agent-api/compiler/renderer.ts),
[root readiness and diagnostics](../../packages/engine/src/agent-api/app/createAuraAppCore.ts),
[device selection](../../packages/rendering/src/RenderBackend.ts),
[WebGPU device](../../packages/rendering/src/WebGPUDevice.ts),
[vertex format](../../packages/rendering/src/VertexFormat.ts),
[WebGPU vertex conversion](../../packages/rendering/src/webgpu/NativeVertexAttributeConversion.ts),
[render queue sorting](../../packages/rendering/src/performance/RenderItemSorting.ts),
and [color management](../../packages/rendering/src/ColorManagement.ts).

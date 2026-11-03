# Native performance workloads and baseline method

**Status: source instrumentation only.** No session, baseline, device timing,
resource-residency measurement, current bundle result, or comparison has been
collected for this candidate. Browser and rendered work begins only after the
global `CODE_COMPLETE_GO` gate. A software renderer is identified as software;
its timing is not evidence of physical-GPU performance.

The seven definitions live in `tools/performance/native-workloads.ts` and run
through the public `@aura3d/engine` app path. Their inputs are versioned in that
module: seed 251025, `product-studio` look, `production` quality, WebGL2,
640 × 360 viewport, DPR 1, 30 warmup frames and 300 measured frames in each
of three independently launched browser processes. Each process uses a fresh
context and the selected project's browser, channel, launch options and headless
mode. Operating-system and driver caches may still persist across processes.
Every result carries the actual browser project and version, OS, backend,
adapter when exposed, and a stable device identifier supplied by the runner
when available. Browser identity includes a SHA-256 digest of the selected
launch options, so differing launch configurations are not compared as the
same setup. A missing
device identity is reported as unavailable and cannot establish a
same-device comparison. The workload digest binds the definitions, measurement
code, device timer implementation and selected workload descriptor; a change to
the instrumentation makes earlier measurements ineligible for a like-for-like
comparison. It is SHA-256 over four entries in this order:
`native-workloads.ts`, `native-performance-probe.spec.ts`, `GPUProfiler.ts`,
and `definition`. Each entry consists of the UTF-8 prefix
`<tag>:<decimal byte length>\n` followed immediately by its bytes. The first
three entries contain the exact corresponding file bytes; `definition` is the
UTF-8 encoding of `JSON.stringify()` of the selected exported workload.

| Workload | Fixed scene and asset | Baseline |
| --- | --- | --- |
| `primitive` | One PBR cube and studio look | Not collected |
| `product` | ToyCar with studio floor and look | Not collected |
| `instances` | 2,048 PBR boxes at seeded positions | Not collected |
| `animation` | Skinned Kenney character playing `walk` | Not collected |
| `game-loop` | Public platformer kit updates a runtime node at fixed 1/60 s | Not collected |
| `effects` | Emissive box, bloom and studio look | Not collected |
| `asset-import` | ToyCar admitted and rendered through `model()` | Not collected |

The ToyCar is the Khronos/Microsoft CC0 sample admitted by
`packages/create-aura3d/templates/premium-product-viewer/aura.assets.json`,
SHA-256 `01a60862de55cd4b9f3acfab0b0def86451800f9c42467fcd61052c16cb9838c`.
The character is the CC0 Kenney Platformer Kit asset with Aura3D articulated
reweighting, admitted by `tests/fixtures/locomotion-301/aura.assets.json`,
SHA-256 `5f01ae3ba85bc72a1dd33968cbfdf809849543242e6e59b5095163a9821ff613`.
Their respective manifests retain full provenance; the probe verifies the
bytes before opening the server. Workloads without an asset record `null`.

Each measured frame advances the app by exactly 1/60 simulated seconds. Frame
percentiles are `requestAnimationFrame` intervals, including presentation
pacing and scheduling; CPU percentiles are wall time around the synchronous
`app.step`, including any driver blocking, not CPU thread time. Startup is
navigation time origin through the first drawable frame with the required
model mounted. Draw calls come from the app diagnostics. Device percentiles
come only from completed, non-disjoint `EXT_disjoint_timer_query_webgl2`
queries around the actual app context's frame, using the shared `GPUProfiler`.
Every timed frame must have a valid result; missing, disjoint, late or lost
queries make the session's GPU timing no-data, never CPU time as GPU time.

The current source also has an opt-in lower-level WebGPU forward-pass timer.
With `timestamp-query` requested when creating the device, construct a
`GPUProfiler` from `device.nativeGpuDevice` and attach its
`createWebGPUForwardPassProfiler()` observer with
`device.setForwardPassProfiler(observer, { drawLabel })` outside a frame. It
selects the first matching draw in each device frame and exposes asynchronous
pass samples through the profiler snapshot. Detach the observer outside a
frame and dispose the profiler when finished. Unsupported, pending, failed or
lost queries do not produce a GPU duration. This is a selected-pass duration,
not a whole-frame measurement; the workload above remains WebGL2-only. The
integration has source/mock tests, not a browser or physical-device receipt.

The candidate also contains a narrow **rendering-internals** WebGL2 pair path.
It is considered for a lower-level `Renderer` source with `staticBatching: true`
and an array of `renderItems`, or for eligible compiler-owned scene collectors.
After ordinary resources
and the pair shader are warm, two adjacent items in the final sorted queue may
share one physical submission when they use the same supported indexed geometry,
the same unlit material and compatible opaque state, and the resident geometry
and effective transforms give disjoint conservative pixel envelopes. The path
supports the ordinary lean-unlit program and a bounded opaque, untextured
generated-unlit program for direct sRGB output. Logical submitted and visible object counts remain separate; the
draw-call counter reports physical submissions. A declined pair uses the two
ordinary draws in their original order. A failure after native submission has
begun stops the frame without replaying the items.

This route excludes custom shaders, other generated variants, frame contributors
and draw callbacks, clipping, shadows, temporal or other postprocessing,
transmission replay, capture frames, multiple views, and offscreen targets. It
also declines when resources, capabilities, raster state or buffer snapshots
cannot be established. User collectors, additional render items and copied or
wrapped sources without the compiler's frame association use ordinary draws.
Buffer snapshots cover Aura-tracked buffer creation and updates,
including `RenderDevice.updateBuffer` and the generated frame uniform buffer;
direct external WebGL buffer or state mutation and interception are outside the
explicit batching opt-in contract. The accompanying tracked-device tests
simulate WebGL calls; they establish no browser, image, timing, or physical-device result.

The probe records per-kind WebGL object creations and live handles before and
after app disposal, independently of renderer ledger counters. These are
observable object lifetimes, **not** bytes resident on the physical device.
WebGL does not expose actual GPU residency bytes or a complete JavaScript
allocation count, so both are reported unavailable. A JavaScript heap snapshot
is included only when the browser exposes it; GC timing and heap accounting
are browser-dependent. After timing, the harness totals decoded response
bodies and separately compresses each body with gzip and Brotli to characterize
the unbundled source-server payload. These are calculated sizes, not negotiated
wire-transfer sizes or the production bundle budget. A failed request or
unreadable response makes the byte totals no-data. The installation/bundle
tools own production packaged-slice sizes.

The checked-in gzip limits remain **190,000 bytes** for the core critical path,
**250,000** for the product starter, **400,000** for the cinematic starter and
**480,000** for the mini-game starter. No budget has been increased. Historical
values in `BUNDLE_SIZES.md` are not current-candidate measurements.

After the global gate is committed and validated, the serverless browser
runner can select `tests/browser/native-performance-probe.spec.ts` with an
explicit supported `AURA3D_BROWSER_PROJECT`, a unique acceptance run ID, an
approved artifact container, and a stable, non-secret `NATIVE_PERF_DEVICE`.
`NATIVE_PERF_DRIVER` may identify the driver when the runner can verify it.
The runner validates `AURA3D_CODE_COMPLETE_GATE` before submission and again
in the job. The spec validates the gate before starting its server or browser
fixture. Its per-workload reports and aggregate manifest containing their
SHA-256 hashes are written under `tests/reports/native-performance/<run-id>/`; partial runs
are labeled partial and fail the spec. If a browser or WebGL2 backend cannot
start, the manifest records the failure; uncollected metrics are no-data, not
zero-valued measurements.

To establish a prior baseline, retain the seven unmodified reports with a
versioned baseline manifest and their exact candidate, workload, asset,
browser, device and adapter identities. On the same device and identical
inputs, collect a separate candidate run. Each report records the gate's
frozen commit as its `baselineVersion`. The analyzer compares the median of
the baseline's session metrics with the candidate median; a lower-is-better
metric regresses when `C / B - 1` exceeds `max(0.05, 2 × baseline MAD / B)`.
An unavailable or zero baseline makes the relative comparison no-data. An
independently defined absolute bound, when present, is reported separately
against the candidate median and does not turn the relative result into a pass.
The default noise rule requests one paired baseline and candidate rerun when
the relative median absolute deviation of either set of session results
exceeds 5%. If the rerun remains above that threshold, the result remains
inconclusive. The analyzer also records a provisional threshold crossing on a
noisy run. Missing machine identity cannot establish a same-device pass.

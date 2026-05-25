# WebGPU Hardware Matrix

Version: 0.1.0-alpha.0

Galileo3D separates real WebGPU evidence from injected adapter evidence. Browser tests that use injected adapters prove the renderer contract, fallback behavior, and submission shape. They do not prove hardware support.

The real-device probe is `tests/browser/webgpu-real-device.spec.ts`. It uses `navigator.gpu` directly when the browser exposes it and writes `tests/reports/webgpu-hardware-matrix.json` with:

- browser name and Playwright project name;
- operating system platform and release;
- browser user agent;
- whether `navigator.gpu` exists;
- adapter request status;
- device request status;
- adapter info, features, and limits when the browser exposes them;
- unsupported cases such as missing `navigator.gpu`, null adapter, missing `requestDevice`, or thrown adapter/device errors.

The matrix is cumulative for a release run. Re-running the probe on another Playwright project, browser, OS, or GPU adapter replaces only the matching browser/project/OS/user-agent entry and preserves the other collected entries. That is required before any broad hardware claim can be reviewed; a single local headless run is not enough.

If `navigator.gpu` is unavailable, the report is still valid fallback evidence for that browser/runtime. It must be read as unsupported hardware evidence, not as a passing WebGPU hardware result.

`tests/browser/webgpu-parity.spec.ts` also attempts a real `createRenderDevice({ backend: "webgpu" })` render-target/readback pass when the browser exposes a real adapter. If no real adapter exists, that case is recorded as unsupported while injected adapter contract tests continue to run.

The current parity reports distinguish:

- the hardware matrix includes real adapter/device results across the browsers, operating systems, and GPU adapters named in the release notes;
- injected adapter render/compute contracts;
- real `navigator.gpu` adapter/device evidence;
- real WebGPU render-target/readback evidence through the current Galileo3D `RenderDevice` API;
- real WebGPU/WebGL2 feature-matrix conformance for triangle, indexed draw, line, point, vertex-color, instancing, texture, and morph paths;
- native WebGPU render-pass submission evidence;
- native WebGPU texture-to-buffer readback evidence through `WebGPUDevice.readPixelsAsync()`;
- real WebGPU high-level `Renderer`/`ForwardPass`/`PBRMaterial` submission evidence;
- real WebGPU high-level textured PBR material submission evidence with validated texture binding;
- real WebGPU high-level environment-lit PBR submission evidence with generated environment resources and BRDF LUT validation;
- real WebGPU high-level instanced PBR submission evidence;
- real WebGPU high-level skinned render-item submission evidence through `Renderer`/`ForwardPass`/`SkinnedUnlitMaterial`;
- real WebGPU high-level morph render-item submission evidence through `Renderer`/`ForwardPass`/`MorphUnlitMaterial`;
- real WebGPU HDR render-target, float readback, and tone-mapping postprocess evidence;
- real WebGPU compute-particle evidence.

The v8 app surface adds route evidence for:

- `apps/webgpu-rtt`;
- `apps/webgpu-materials`;
- `apps/webgpu-instance-uniform`;
- `apps/webgpu-compute`.

Those routes should be read as implementation and diagnostic evidence, not as complete hardware coverage. Full WebGPU parity remains blocked even when local rows pass because the current matrix is still a focused conformance scene plus selected production-renderer paths, not a broad production-renderer matrix. The synchronous `WebGPUDevice.readPixels()` path remains CPU-shadowed for deterministic tests; native GPU texture-to-buffer readback is exposed through `readPixelsAsync()`.

Public claims must not say "full WebGPU support" until real hardware rows cover the target browsers/OS/GPU adapters, the visual routes are approved for that release, and the broad-parity gate says the claim is complete. Injected adapter reports are allowed only as contract evidence.

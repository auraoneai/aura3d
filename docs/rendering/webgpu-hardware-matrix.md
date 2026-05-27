# WebGPU Hardware Matrix

Version: `1.0.0`

This page records how WebGPU evidence should be interpreted.

First-class WebGPU claims require both route evidence and hardware evidence. A passing local route on one browser/device proves that named environment only.

## Current Evidence Sources

- WebGPU implementation and template surfaces: `packages/rendering/src/WebGPUDevice.ts`, `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`, `packages/rendering/src/effects/GPUParticleBackend.ts`, and `packages/create-aura3d/templates/production-webgpu-starter/`
- Root WebGPU routes: `/apps/wow-webgpu-triangle/`, `/apps/wow-webgpu-render-target/`, `/apps/wow-webgpu-pbr-asset/`, `/apps/wow-webgpu-product-viewer/`, `/apps/wow-webgpu-instancing/`, and `/apps/wow-webgpu-compute-particles/`
- Browser tests: `tests/browser/production-runtime-webgpu-capability.spec.ts`, `tests/browser/rendering-webgpu.spec.ts`, `tests/browser/webgpu-real-device.spec.ts`
- Report target used by release tooling: `tests/reports/webgpu-hardware-matrix.json`

`tests/reports/` is ignored by git, so the matrix may be absent in a clean checkout until the relevant browser test or release tool runs.

## Supported Interpretation

- A report with `navigator.gpu` unavailable proves fallback diagnostics for that browser/environment.
- `tests/browser/webgpu-real-device.spec.ts` uses `navigator.gpu` directly and records browser user agent plus operating system platform and release.
- A report with adapter/device availability proves WebGPU can be requested in that local browser/environment. They do not prove hardware support outside the recorded environment.
- Route screenshots prove the named current registry route behavior only.
- Injected WebGPU runtimes are useful for unit and contract tests, but they are not real hardware evidence.

## Report Shape

Hardware reports should record:

- browser name/version and user agent;
- OS/platform;
- `navigator.gpu` availability;
- `requestAdapter` result and unavailable reason;
- adapter name/info when the browser exposes it;
- `requestDevice` result and failure reason;
- WebGPU canvas context support;
- required limits/features used by the named routes;
- whether the evidence came from real browser hardware or an injected test runtime.

## Minimum Claim Criteria

Before saying WebGPU is first-class for a named browser/device, regenerate the matrix on that browser/device and verify:

- at least one real adapter and device are granted;
- root WebGPU route health passes or reports structured unsupported states;
- `pnpm webgpu` passes in the same workspace;
- docs do not claim broader browser/GPU coverage than the matrix records.

## Not Supported

- Full WebGPU browser/device matrix coverage.
- Mobile GPU support.
- Driver-level performance claims.
- A claim that WebGPU behavior matches WebGL2 or Three.js in every route.
- Public claims must not say "full WebGPU support" without a complete hardware matrix.

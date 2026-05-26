# WebGPU Hardware Matrix

Version: `1.0.0`

This page records how WebGPU evidence should be interpreted.

## Current Evidence Sources

- WebGPU implementation: `packages/rendering/src/WebGPUDevice.ts`
- WebGPU implementation and template surfaces: `packages/rendering/src/WebGPUDevice.ts`, `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`, and `packages/create-aura3d/templates/production-webgpu-starter/`
- Browser tests: `tests/browser/production-runtime-webgpu-capability.spec.ts`, `tests/browser/rendering-webgpu.spec.ts`, `tests/browser/webgpu-real-device.spec.ts`
- Report target used by release tooling: `tests/reports/webgpu-hardware-matrix.json`

`tests/reports/` is ignored by git, so the matrix may be absent in a clean checkout until the relevant browser test or release tool runs.

## Supported Interpretation

- A report with `navigator.gpu` unavailable proves fallback diagnostics for that browser/environment.
- `tests/browser/webgpu-real-device.spec.ts` uses `navigator.gpu` directly and records browser user agent plus operating system platform and release.
- A report with adapter/device availability proves WebGPU can be requested in that local browser/environment. They do not prove hardware support outside the recorded environment.
- Route screenshots prove the named current registry route behavior only. WebGPU package/template evidence is separate from the current root example registry.

## Not Supported

- Full WebGPU browser/device matrix coverage.
- Mobile GPU support.
- Driver-level performance claims.
- A claim that WebGPU behavior matches WebGL2 or Three.js in every route.
- Public claims must not say "full WebGPU support" without a complete hardware matrix.

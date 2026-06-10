# WebGPU Hardware Matrix

Version: 1.0.6

This page records how WebGPU hardware evidence should be interpreted. Route and report coverage is documented separately in [WebGPU route and report evidence](webgpu-route-and-report-evidence.md).

First-class WebGPU claims require both route evidence and hardware evidence. A passing local route on one browser/device proves that named environment only.

## Current Evidence Sources

- WebGPU implementation and template surfaces: `packages/rendering/src/WebGPUDevice.ts`, `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`, `packages/rendering/src/effects/GPUParticleBackend.ts`, and `templates/production-webgpu-starter/`
- Root WebGPU routes: `/apps/wow-webgpu-triangle/`, `/apps/wow-webgpu-render-target/`, `/apps/wow-webgpu-pbr-asset/`, `/apps/wow-webgpu-product-viewer/`, `/apps/wow-webgpu-instancing/`, and `/apps/wow-webgpu-compute-particles/`
- Browser tests: `tests/browser/production-runtime-webgpu-capability.spec.ts`, `tests/browser/rendering-webgpu.spec.ts`, `tests/browser/webgpu-real-device.spec.ts`
- Report targets used by release tooling: `tests/reports/webgpu-hardware-matrix.json` and `tests/reports/webgpu-hardware-matrix-validation.json`

`tests/reports/` is ignored by git, so the matrix may be absent in a clean checkout until the relevant browser test or release tool runs.

## Supported Interpretation

- A report with `navigator.gpu` unavailable proves fallback diagnostics for that browser/environment.
- `tests/browser/webgpu-real-device.spec.ts` uses `navigator.gpu` directly and records browser user agent plus operating system platform and release.
- Route screenshots prove the named current registry route behavior only.
- Injected WebGPU runtimes are useful for unit and contract tests, but they are not real hardware evidence.
- `tools/webgpu-hardware-matrix/index.ts` validates that the matrix exists, has `status: "pass"`, uses `evidenceType: "real-navigator-gpu-probe"`, and contains at least one browser/device row.

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

Useful commands:

```sh
pnpm exec playwright test tests/browser/webgpu-real-device.spec.ts --reporter=line
pnpm webgpu:hardware-matrix
```

## Mobile / iOS & Android

WebGPU is supported in production by Chrome for Android (121+, ARM/Qualcomm/Intel; Android 12+) and Safari iOS/iPadOS (26+), as well as Samsung Internet (24+) and Opera Mobile (80+). Firefox Android currently requires a flag.

Aura3D does **not** currently claim first-class mobile WebGPU support because:

- Playwright mobile emulation uses desktop browser binaries and desktop GPU backends; it cannot produce valid mobile hardware evidence.
- There is no CI integration with physical device labs (BrowserStack, Sauce Labs, etc.).
- Mobile-specific adapter limits, shader compilation behavior, and tile-based GPU behavior have not been validated on real hardware.

Before making first-class mobile claims, run `tests/browser/webgpu-real-device.spec.ts` on real hardware and verify root route health.

## Not Supported

- Full WebGPU browser/device matrix coverage.
- **Real mobile WebGPU hardware evidence** (no physical device or cloud lab integration is present in CI).
- Driver-level performance claims.
- A claim that WebGPU behavior matches WebGL2 or low-level renderer code in every route.
- Public claims must not say "full WebGPU support" without a complete hardware matrix.

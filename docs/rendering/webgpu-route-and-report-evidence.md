# WebGPU Route And Report Evidence

Version: `1.0.0`

This page is the durable documentation for the current first-class WebGPU product surface. It replaces the temporary PRD-level checklist with code-backed routes, runtime contracts, scripts, reports, and release notes.

WebGPU is a conditional backend in Aura3D. The codebase includes explicit WebGPU routes and production-runtime paths, but WebGL2 remains the broadly available default route backend unless a workflow asks for WebGPU or uses an auto-selection mode that publishes its decision.

## Current Code Surfaces

Core renderer and production-runtime surfaces:

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/WebGPURenderToTextureProof.ts`
- `packages/rendering/src/RenderBackend.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`
- `packages/rendering/src/production-runtime/backends/WebGPURendererBackend.ts`
- `packages/rendering/src/webgpu/WebGPUCompute.ts`
- `packages/rendering/src/effects/GPUParticleBackend.ts`

Shared route helpers and templates:

- `apps/wow-common/src/webgpu-showcase.ts`
- `apps/wow-common/src/webgpu-compare.ts`
- `templates/production-webgpu-starter/`

Asset and material inputs used by WebGPU evidence:

- `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts`
- `fixtures/environment-corpus/manifest.json`

## Root Routes

The root `index.html` contains a dedicated WebGPU Examples section. The approved route list is also enforced by `tests/browser/webgpu-route-helpers.ts`.

| Route | Purpose | Runtime expectation |
|---|---|---|
| `/apps/wow-webgpu-triangle/` | Smallest explicit WebGPU draw proof. | Publishes `a3d-webgpu` with draw calls, adapter, frame, and render-size diagnostics, or `unsupported`. |
| `/apps/wow-webgpu-render-target/` | Offscreen render-target and readback proof. | Reports render targets, native submissions, and `readbackMode`. |
| `/apps/wow-webgpu-pbr-asset/` | Imported GLB/PBR route. | Uses the existing asset pipeline and reports native PBR submissions and texture bindings. |
| `/apps/wow-webgpu-product-viewer/` | Production-style imported product route. | Uses production-runtime scene composition with explicit WebGPU mode and optional `?backend=auto`. |
| `/apps/wow-webgpu-instancing/` | Repeated geometry workload. | Reports instance workload fields, draw calls, native submissions, and frame timing. |
| `/apps/wow-webgpu-compute-particles/` | Native WebGPU compute-particle route. | Uses storage-buffer compute dispatch through `WebGPUParticleBackend`, or reports unsupported when compute is unavailable. |

Each route uses `apps/wow-common/src/webgpu-showcase.ts` to publish `window.__a3dWowRuntime`. Browser checks expect the runtime to settle into `ready`, `running`, or `unsupported`; `error` is a failing state.

Required runtime fields include:

- `status`
- `requestedBackend`
- `selectedBackend`
- `backend`
- `adapterName`
- `deviceAvailable`
- `unsupportedReason`
- `capabilities`
- `frameCount`
- `drawCalls`
- `renderWidth`
- `renderHeight`
- `nativeSubmissions`
- `nativeTextureBindings`
- `nativePbrSubmissions`
- `renderTargets`

## Backend Selection

Explicit WebGPU requests use:

```ts
const renderer = await Renderer.create({ backend: "webgpu", canvas });
await renderer.renderAsync(scene);
```

An explicit `backend: "webgpu"` request must not silently return WebGL2. If WebGPU is unavailable, callers should receive a structured error or the route should publish `status: "unsupported"` with a usable `unsupportedReason`.

Auto-selection is allowed only when the selected backend and reason are exposed:

```ts
const renderer = new ProductionRuntimeRenderer({
  backend: "auto",
  width: 1280,
  height: 720
});

const diagnostics = renderer.getDiagnostics();
console.log(diagnostics.backendSelection.selected, diagnostics.backendSelection.reason);
```

## Reports And Scripts

The WebGPU scripts in `package.json` are the supported entrypoints:

```sh
pnpm webgpu:feature-matrix
pnpm webgpu:route-health
pnpm webgpu:visual-parity
pnpm webgpu:product-quality
pnpm webgpu:hardware-matrix
pnpm webgpu:completion-audit
pnpm webgpu
```

The generated reports live under `tests/reports/`, which is ignored by git. A clean checkout may not contain these files until the relevant script or browser test runs.

| Report | Producer | Meaning |
|---|---|---|
| `tests/reports/webgpu-feature-matrix.json` | `tools/webgpu-feature-matrix/index.ts` | Lists feature rows as `supported`, `partial`, `blocked`, or `untested`, with evidence files. |
| `tests/reports/webgpu-route-health.json` | `tools/webgpu-route-health/index.ts` | Filters current route-health output for `/apps/wow-webgpu-*` routes and accepts only ready or unsupported route states. |
| `tests/reports/webgpu-visual-parity.json` | `tools/webgpu-visual-parity/index.ts` | Aggregates WebGPU route screenshots and bounded WebGPU/WebGL2 comparison evidence. |
| `tests/reports/webgpu-product-quality/*.json` | `tests/browser/webgpu-product-quality.spec.ts` | Captures product and PBR asset screenshots and rejects blank, tiny, washed-out, or overdrawn imported assets. |
| `tests/reports/webgpu-hardware-matrix.json` | `tests/browser/webgpu-real-device.spec.ts` | Records real `navigator.gpu` browser/device evidence. |
| `tests/reports/webgpu-hardware-matrix-validation.json` | `tools/webgpu-hardware-matrix/index.ts` | Validates that hardware evidence exists and comes from a real navigator GPU probe. |
| `tests/reports/webgpu-completion-audit.json` | `tools/webgpu-completion-audit/index.ts` | Aggregates the WebGPU reports, root route links, and public claim scan. |

The completion audit intentionally checks for missing reports. Run the earlier WebGPU scripts before running `pnpm webgpu:completion-audit` directly.

## Feature Matrix Interpretation

`tools/webgpu-feature-matrix/index.ts` is the source for the current feature rows. As of version `1.0.0`, supported rows include triangle geometry, indexed geometry, lines, points, PBR, sampled textures, render targets, readback, instancing, lifecycle, and compute. Partial rows include HDR/IBL, postprocess, shadows, skinning, morph targets, transmission, and device-loss diagnostics.

## Verification Coverage

Focused unit coverage:

- `tests/unit/rendering/webgpu-device-capabilities.test.ts`
- `tests/unit/rendering/webgpu-render-target-lifecycle.test.ts`
- `tests/unit/rendering/webgpu-texture-bindings.test.ts`
- `tests/unit/rendering/webgpu-pbr-material-bindings.test.ts`
- `tests/unit/rendering/webgpu-backend-selection.test.ts`
- `tests/unit/rendering/webgpu-feature-matrix.test.ts`
- `tests/unit/rendering/webgpu-render-to-texture-proof.test.ts`
- `tests/unit/rendering/production-runtime-webgpu-renderer.test.ts`
- `tests/unit/tools/webgpu-feature-matrix.test.ts`
- `tests/unit/tools/webgpu-completion-audit.test.ts`
- `tests/unit/tools/webgpu-docs.test.ts`

Focused browser coverage:

- `tests/browser/webgpu-root-routes.spec.ts`
- `tests/browser/webgpu-route-health.spec.ts`
- `tests/browser/webgpu-triangle-route.spec.ts`
- `tests/browser/webgpu-render-target-route.spec.ts`
- `tests/browser/webgpu-pbr-asset-route.spec.ts`
- `tests/browser/webgpu-product-viewer-route.spec.ts`
- `tests/browser/webgpu-visual-parity.spec.ts`
- `tests/browser/webgpu-hardware-matrix.spec.ts`
- `tests/browser/webgpu-product-quality.spec.ts`
- `tests/browser/rendering-webgpu.spec.ts`
- `tests/browser/webgpu-real-device.spec.ts`
- `tests/browser/runtime-parity-webgpu-imported-asset.spec.ts`
- `tests/browser/runtime-parity-webgpu-product-viewer.spec.ts`
- `tests/browser/runtime-parity-webgpu-sdk-production.spec.ts`

## Aura3D advantage

Allowed wording:

- A3D includes WebGPU backend paths with explicit availability diagnostics.
- WebGPU support is conditional on browser/device availability.
- Named WebGPU workflows have generated route and hardware evidence.
- WebGL2 remains the broadly available default backend.
- A3D supports WebGPU for feature-matrix rows marked `supported`.

Avoid unqualified WebGPU wording such as complete WebGPU/WebGL2 parity, support across all browsers and GPUs, or every route supporting WebGPU. Hardware claims must follow [WebGPU hardware matrix](webgpu-hardware-matrix.md), and fallback behavior must follow [WebGPU availability and fallback behavior](webgpu-fallback.md).

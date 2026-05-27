# WebGPU First-Class Product PRD

Version: 1.0.0

## Purpose

Make WebGPU a first-class Aura3D product surface without overstating browser or feature support.

The consolidated root example registry now includes a dedicated WebGPU section with route-health-backed examples. WebGL2 remains the broadly available default backend for most routes, while WebGPU is a first-class conditional product track backed by explicit routes, unsupported-state diagnostics, feature reports, visual-parity reports, and hardware-matrix evidence.

## Current State

Current WebGPU implementation surfaces:

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/WebGPURenderToTextureProof.ts`
- `packages/rendering/src/RenderBackend.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`
- `packages/rendering/src/production-runtime/backends/WebGPURendererBackend.ts`
- `packages/create-aura3d/templates/production-webgpu-starter/`
- `tests/browser/production-runtime-webgpu-capability.spec.ts`
- `tests/browser/rendering-webgpu.spec.ts`
- `tests/browser/webgpu-real-device.spec.ts`
- `tests/browser/runtime-parity-webgpu-imported-asset.spec.ts`
- `tests/browser/runtime-parity-webgpu-product-viewer.spec.ts`
- `tests/unit/rendering/webgpu-render-to-texture-proof.test.ts`
- `tests/unit/rendering/production-runtime-webgpu-renderer.test.ts`
- `apps/wow-webgpu-triangle/`
- `apps/wow-webgpu-render-target/`
- `apps/wow-webgpu-pbr-asset/`
- `apps/wow-webgpu-product-viewer/`
- `apps/wow-webgpu-instancing/`
- `apps/wow-webgpu-compute-particles/`

Current product boundary:

- WebGL2 remains the primary broadly available backend for most routes in the consolidated local route registry.
- WebGPU support is conditional on `navigator.gpu`, adapter/device availability, and implemented backend feature coverage.
- WebGPU claims must be backed by named route screenshots, native-device diagnostics, feature matrix reports, and hardware matrix reports.
- Unsupported WebGPU paths must fail visibly and honestly with structured diagnostics.

## Product Goals

- Add visible WebGPU routes to the consolidated root registry.
- Provide a clear developer path for `backend: "webgpu"` and `backend: "auto"`.
- Show users whether WebGPU is available, selected, blocked, or unsupported.
- Render real Aura3D scenes through WebGPU, not canvas fallbacks or mock devices.
- Compare WebGPU output against WebGL2 for representative workloads.
- Produce generated reports that make WebGPU claims auditable.
- Keep WebGPU claims scoped to real evidence.

## Non-Goals

- Do not claim full WebGPU support across all browsers and GPUs until the hardware matrix proves it.
- Do not claim complete WebGPU/WebGL2 visual parity until same-scene parity reports pass.
- Do not add hidden or unlinked WebGPU routes outside the consolidated root registry.
- Do not silently fall back from WebGPU to WebGL2 when the user explicitly requests WebGPU.
- Do not treat injected/mocked WebGPU contracts as real hardware evidence.

## User Stories

- As a developer, I can open the root registry and find WebGPU examples alongside WebGL2 examples.
- As a developer, I can see whether a route is using `a3d-webgpu` or `a3d-webgl2`.
- As a developer on unsupported hardware, I see a structured unsupported state instead of a blank route.
- As a package consumer, I can request WebGPU explicitly and receive a clear failure when it is unavailable.
- As a maintainer, I can run a WebGPU readiness suite and know which features are supported, partial, blocked, or untested.
- As a product reviewer, I can inspect screenshots, device reports, and WebGPU-vs-WebGL2 deltas before approving claims.

## Required New Routes

All routes below must use the current `apps/wow-*` route family and appear in `index.html` only when implemented, tested, and allowlisted.

### `apps/wow-webgpu-triangle/`

Purpose: smallest native WebGPU draw proof.

Required files:

- `apps/wow-webgpu-triangle/index.html`
- `apps/wow-webgpu-triangle/src/main.ts`

Checklist:

- [x] Create a native WebGPU route using Aura3D renderer APIs.
- [x] Render a visible triangle or compact primitive without imported assets.
- [x] Show structured HUD fields: status, backend, adapter, draw calls, render size, average frame, failure reason.
- [x] Show `status: unsupported` when WebGPU is unavailable.
- [x] Do not fall back to WebGL2 when `backend: "webgpu"` is explicitly requested.
- [x] Add route to root `index.html` in a WebGPU section.
- [x] Add route to current route allowlists and browser route health tests.

### `apps/wow-webgpu-render-target/`

Purpose: prove render target and texture readback behavior.

Required files:

- `apps/wow-webgpu-render-target/index.html`
- `apps/wow-webgpu-render-target/src/main.ts`

Checklist:

- [x] Render into an offscreen WebGPU render target.
- [x] Present or blit the result visibly.
- [x] Exercise native texture-to-buffer readback when supported.
- [x] Report `native-texture-readback` as supported, partial, or blocked.
- [x] Dispose render targets and readback buffers on teardown.
- [x] Add route screenshot and route-health evidence.

### `apps/wow-webgpu-pbr-asset/`

Purpose: imported GLB, PBR material, texture, and HDR/IBL route through WebGPU.

Required files:

- `apps/wow-webgpu-pbr-asset/index.html`
- `apps/wow-webgpu-pbr-asset/src/main.ts`

Checklist:

- [x] Use a real current fixture such as `damaged-helmet`, `boom-box`, or `clear-coat-test`.
- [x] Load glTF/GLB through the existing asset pipeline.
- [x] Render textured PBR material through WebGPU.
- [x] Report texture bindings, native submissions, render targets, draw calls, and backend.
- [x] Include a WebGL2 comparison screenshot or report entry.
- [x] Add route-health and screenshot coverage.

### `apps/wow-webgpu-product-viewer/`

Purpose: production-style product viewer through WebGPU.

Required files:

- `apps/wow-webgpu-product-viewer/index.html`
- `apps/wow-webgpu-product-viewer/src/main.ts`

Checklist:

- [x] Use `ProductionRuntimeRenderer` or `ProductionWebGPURenderer`.
- [x] Use `backend: "webgpu"` for explicit WebGPU mode.
- [x] Render a real imported product asset with camera framing and environment lighting.
- [x] Add an optional `backend=auto` query mode for auto-selection diagnostics.
- [x] Show WebGPU-vs-WebGL2 delta status when a comparison report exists.
- [x] Support unsupported-state HUD for browsers without WebGPU.
- [x] Add route-health, screenshot, and visual review coverage.

### `apps/wow-webgpu-instancing/`

Purpose: show WebGPU value on repeated geometry/instance-style workloads.

Required files:

- `apps/wow-webgpu-instancing/index.html`
- `apps/wow-webgpu-instancing/src/main.ts`

Checklist:

- [x] Render many instances or batched render items.
- [x] Report instance count, draw calls, native submissions, and frame timing.
- [x] Add WebGL2 comparison metrics.
- [x] Keep route deterministic enough for screenshots and route health.

### `apps/wow-webgpu-compute-particles/`

Purpose: compute-particle product evidence, only if native compute is implemented.

Required files:

- `apps/wow-webgpu-compute-particles/index.html`
- `apps/wow-webgpu-compute-particles/src/main.ts`

Checklist:

- [x] Implement only after native WebGPU compute pipeline support exists.
- [x] Use compute for particle/state updates, not CPU-only animation.
- [x] Report compute pipeline availability and dispatch counts.
- [x] Show unsupported state when compute is unavailable.
- [x] Do not add this route until `webgpu-compute` feature matrix row is supported.

## Shared Route Runtime

### `apps/wow-common/src/webgpu-showcase.ts`

Purpose: reusable HUD/runtime for all WebGPU routes.

Checklist:

- [x] Add shared WebGPU route bootstrap helper.
- [x] Expose `status: "loading" | "ready" | "running" | "unsupported" | "error"`.
- [x] Publish `window.__a3dWowRuntime` with backend, adapter, features, frame count, draw calls, render size, and failure reason.
- [x] Render a structured HUD consistent with current WOW routes.
- [x] Include fields for `requestedBackend`, `selectedBackend`, `adapterName`, `deviceAvailable`, `unsupportedReason`, `capabilities`, `nativeSubmissions`, and `nativeTextureBindings`.
- [x] Provide helper for unsupported WebGPU panels.
- [x] Avoid DOM updates every frame; throttle HUD updates.
- [x] Use the same CSS shell as `apps/wow-common/src/showcase.css` unless a WebGPU-specific visual state is required.

### `apps/wow-common/src/webgpu-compare.ts`

Purpose: shared WebGPU/WebGL2 comparison helpers.

Checklist:

- [x] Add helper to render a scene through WebGPU and WebGL2 with the same camera and dimensions.
- [x] Compute pixel delta metrics.
- [x] Emit screenshot paths and JSON report entries.
- [x] Reuse existing pixel analysis helpers where possible.
- [x] Keep this package-route-local helper thin; core comparison primitives should live in `packages/rendering` or tools.

## Rendering Package Work

### `packages/rendering/src/WebGPUDevice.ts`

Checklist:

- [x] Verify native render pipeline creation for triangle, line, and point topologies.
- [x] Verify vertex/index/uniform buffer usage and disposal.
- [x] Verify sampled texture upload for base color, normal, metallic-roughness, occlusion, and emissive inputs.
- [x] Verify sampler creation and binding for PBR material paths.
- [x] Verify render target creation, resizing, and disposal.
- [x] Verify texture-to-buffer readback path.
- [x] Verify depth texture support for depth-tested 3D scenes.
- [x] Verify native canvas depth attachment support so multi-pass product scenes cannot paint stages or backdrops over foreground assets.
- [x] Add explicit diagnostics for unsupported texture formats.
- [x] Add explicit diagnostics for adapter/device loss.
- [x] Add capability flags for all feature matrix rows.

### `packages/rendering/src/Renderer.ts`

Checklist:

- [x] Ensure `Renderer.create({ backend: "webgpu" })` has consistent behavior with WebGL2 where features exist.
- [x] Ensure `renderAsync()` is documented and tested as the WebGPU readback path.
- [x] Ensure `render()` either works synchronously for non-readback frames or clearly delegates/blocks when WebGPU requires async behavior.
- [x] Ensure postprocess setup does not assume WebGL-only resources.
- [x] Ensure shadow/render-target paths work or fail with explicit `RenderDeviceError` codes.

### `packages/rendering/src/RenderBackend.ts`

Checklist:

- [x] Confirm explicit `backend: "webgpu"` never silently returns WebGL2.
- [x] Confirm explicit `backend: "webgl2"` never attempts WebGPU.
- [x] Add tests for backend selection and failure codes.
- [x] Add support for optional `webgpu` runtime injection only as test/proof input, not product hardware evidence.

### `packages/rendering/src/ForwardPass.ts`

Checklist:

- [x] Verify WebGPU PBR shader bindings for material uniforms.
- [x] Verify WebGPU texture binding layout for glTF materials.
- [x] Verify WebGPU environment lighting bindings.
- [x] Verify normal map tangent paths.
- [x] Verify skinning palette bindings.
- [x] Verify morph target bindings.
- [x] Verify instanced uniform submission.
- [x] Add diagnostics for WebGPU partial material support.

### `packages/rendering/src/PostProcessPass.ts`

Checklist:

- [x] Verify tone mapping on WebGPU render targets.
- [x] Verify FXAA or declare unsupported.
- [x] Verify bloom or declare unsupported.
- [x] Verify depth-aware passes or declare unsupported.
- [x] Add WebGPU-specific postprocess tests and report rows.

### `packages/rendering/src/ShadowPass.ts`

Checklist:

- [x] Verify WebGPU depth pass support.
- [x] Verify shadow map texture binding into forward pass.
- [x] Verify PCF/filter fallback behavior.
- [x] Add WebGPU shadow feature matrix row.

### `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`

Checklist:

- [x] Ensure `renderImportedAssetAsync()` is the primary production WebGPU render proof.
- [x] Avoid synchronous readback in WebGPU proof paths unless the device exposes safe support.
- [x] Add explicit feature states for clearcoat, sheen, transmission, skinning, morph targets, postprocess, shadows, and instancing.
- [x] Include adapter/device metadata in proof output.
- [x] Include selected render path and readback mode in proof output.
- [x] Fail product proof if no native texture-to-buffer readback exists.

### `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`

Checklist:

- [x] Document and test `backend: "webgl2"`, `backend: "webgpu"`, and `backend: "auto"`.
- [x] Ensure `backend: "auto"` publishes selected backend and reason.
- [x] Ensure `backend: "webgpu"` fails honestly when WebGPU is missing.
- [x] Add tests for browser `navigator.gpu` selection and supplied runtime selection.

## Assets And Materials

### `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts`

Checklist:

- [x] Verify WebGPU route assets use the same pipeline as WebGL2 assets.
- [x] Ensure material metadata exposes enough detail for WebGPU feature reporting.
- [x] Add metadata flags for clearcoat, sheen, transmission, skinning, morph, and variants.

### `packages/assets/src/threejs-example-parity/index.ts`

Checklist:

- [x] Add or reuse WebGPU-ready assets for route examples.
- [x] Avoid referencing missing pruned fixtures.
- [x] Add `expectedFeatures` entries that map cleanly into WebGPU feature matrix rows.

## Tooling And Reports

### `tools/webgpu-feature-matrix/index.ts`

Purpose: generated report for WebGPU feature readiness.

Output:

- `tests/reports/webgpu-feature-matrix.json`

Checklist:

- [x] Create feature matrix schema.
- [x] Include rows for geometry, indexed geometry, lines, points, PBR, textures, HDR/IBL, render targets, readback, postprocess, shadows, instancing, skinning, morphs, transmission, lifecycle, and device loss.
- [x] Each row must be `supported`, `partial`, `blocked`, or `untested`.
- [x] Each row must include evidence files.
- [x] Fail when a row is claimed supported without tests/reports.

### `tools/webgpu-route-health/index.ts`

Purpose: WebGPU-specific route health with supported and unsupported outcomes.

Output:

- `tests/reports/webgpu-route-health.json`

Checklist:

- [x] Discover WebGPU routes from root registry.
- [x] Accept `ready` for WebGPU-capable browsers.
- [x] Accept `unsupported` only when diagnostics explicitly identify browser/device limitation.
- [x] Fail blank canvas, unhandled errors, silent WebGL2 fallback, or missing backend diagnostics.
- [x] Capture screenshots for both ready and unsupported states.

### `tests/browser/webgpu-product-quality.spec.ts`

Purpose: WebGPU product/PBR screenshot quality gate for imported assets.

Output:

- `tests/reports/webgpu-product-quality/webgpu-product-viewer.png`
- `tests/reports/webgpu-product-quality/webgpu-product-viewer.json`
- `tests/reports/webgpu-product-quality/webgpu-pbr-asset.png`
- `tests/reports/webgpu-product-quality/webgpu-pbr-asset.json`

Checklist:

- [x] Require real `a3d-webgpu` runtime on supported browsers.
- [x] Require native PBR submissions for product and PBR asset routes.
- [x] Fail tiny, hidden, blank, washed-out, or overdrawn imported-asset screenshots.
- [x] Cover the native canvas depth regression where stage/backdrop geometry painted over the product.

### `tools/webgpu-visual-parity/index.ts`

Purpose: WebGPU-vs-WebGL2 same-scene visual report.

Output:

- `tests/reports/webgpu-visual-parity.json`
- `tests/reports/webgpu-visual-parity/screenshots/*.png`

Checklist:

- [x] Compare triangle scene.
- [x] Compare PBR material spheres.
- [x] Compare Damaged Helmet or Boom Box.
- [x] Compare clearcoat/transmission if supported.
- [x] Compare skinned character if supported.
- [x] Include mean delta, changed pixel count, and structural similarity proxy.
- [x] Fail when deltas exceed approved thresholds.

### `tools/webgpu-hardware-matrix/index.ts`

Purpose: real browser/device availability and capability report.

Output:

- `tests/reports/webgpu-hardware-matrix.json`

Checklist:

- [x] Record browser name/version.
- [x] Record OS/platform.
- [x] Record adapter name/info when available.
- [x] Record `requestAdapter` result.
- [x] Record `requestDevice` result.
- [x] Record canvas context support.
- [x] Record required limits/features.
- [x] Record unavailable/blocked reasons.
- [x] Distinguish real hardware from injected test runtime.

### `tools/webgpu-completion-audit/index.ts`

Purpose: aggregate gate for first-class WebGPU claims.

Output:

- `tests/reports/webgpu-completion-audit.json`

Checklist:

- [x] Require `webgpu-feature-matrix.json` pass.
- [x] Require `webgpu-route-health.json` pass.
- [x] Require `webgpu-visual-parity.json` pass.
- [x] Require `webgpu-hardware-matrix.json` pass for at least one real WebGPU browser.
- [x] Require docs claim scan pass.
- [x] Require root registry links for all approved WebGPU routes.
- [x] Fail if public docs say "full WebGPU support" without the complete hardware matrix.

## Tests

### Unit Tests

Required files:

- `tests/unit/rendering/webgpu-device-capabilities.test.ts`
- `tests/unit/rendering/webgpu-render-target-lifecycle.test.ts`
- `tests/unit/rendering/webgpu-texture-bindings.test.ts`
- `tests/unit/rendering/webgpu-pbr-material-bindings.test.ts`
- `tests/unit/rendering/webgpu-backend-selection.test.ts`
- `tests/unit/rendering/webgpu-feature-matrix.test.ts`
- `tests/unit/tools/webgpu-feature-matrix.test.ts`
- `tests/unit/tools/webgpu-completion-audit.test.ts`

Checklist:

- [x] Test explicit WebGPU backend selection.
- [x] Test explicit WebGPU failure when runtime is missing.
- [x] Test `auto` backend selection.
- [x] Test render target creation/disposal.
- [x] Test texture/sampler binding diagnostics.
- [x] Test feature matrix schema and failure behavior.
- [x] Test completion audit failure when reports are missing.

### Browser Tests

Required files:

- `tests/browser/webgpu-root-routes.spec.ts`
- `tests/browser/webgpu-route-health.spec.ts`
- `tests/browser/webgpu-triangle-route.spec.ts`
- `tests/browser/webgpu-render-target-route.spec.ts`
- `tests/browser/webgpu-pbr-asset-route.spec.ts`
- `tests/browser/webgpu-product-viewer-route.spec.ts`
- `tests/browser/webgpu-visual-parity.spec.ts`
- `tests/browser/webgpu-hardware-matrix.spec.ts`

Checklist:

- [x] Open every WebGPU route from root registry.
- [x] Validate visible HUD and nonblank canvas for supported WebGPU.
- [x] Validate structured unsupported panel for unavailable WebGPU.
- [x] Validate no silent WebGL2 fallback in explicit WebGPU routes.
- [x] Validate screenshot artifacts.
- [x] Validate route runtime object contains backend, adapter, status, and capabilities.

## Package Scripts

### `package.json`

Required scripts:

- [x] `webgpu:feature-matrix`
- [x] `webgpu:route-health`
- [x] `webgpu:visual-parity`
- [x] `webgpu:hardware-matrix`
- [x] `webgpu:completion-audit`
- [x] `webgpu`

Proposed script chain:

```json
{
  "webgpu:feature-matrix": "pnpm exec tsx --tsconfig tsconfig.base.json tools/webgpu-feature-matrix/index.ts",
  "webgpu:route-health": "pnpm exec playwright test tests/browser/webgpu-route-health.spec.ts --reporter=line",
  "webgpu:visual-parity": "pnpm exec playwright test tests/browser/webgpu-visual-parity.spec.ts --reporter=line",
  "webgpu:hardware-matrix": "pnpm exec playwright test tests/browser/webgpu-hardware-matrix.spec.ts --reporter=line",
  "webgpu:completion-audit": "pnpm exec tsx --tsconfig tsconfig.base.json tools/webgpu-completion-audit/index.ts",
  "webgpu": "pnpm webgpu:feature-matrix && pnpm webgpu:route-health && pnpm webgpu:visual-parity && pnpm webgpu:hardware-matrix && pnpm webgpu:completion-audit"
}
```

## Root Registry Work

### `index.html`

Checklist:

- [x] Add a dedicated "WebGPU Examples" section.
- [x] Add only implemented and tested WebGPU routes.
- [x] Show status text that distinguishes `open WebGPU route` from WebGL2 routes.
- [x] Keep total route count and summary values accurate.
- [x] Do not add WebGPU links before route-health can handle unsupported browsers.

### `tests/browser/current-routes-route-health.spec.ts`

Checklist:

- [x] Add WebGPU routes to expected route list after implementation.
- [x] Accept supported and unsupported WebGPU statuses only for WebGPU route family.
- [x] Continue failing blank canvases and silent errors.
- [x] Keep WebGL2 WOW route expectations unchanged.

### `tools/current-routes-legacy-prune/index.ts`

Checklist:

- [x] Add approved WebGPU app folders to allowlist.
- [x] Add approved WebGPU route prefixes.
- [x] Keep deleted historical route folders blocked.

### `tools/current-routes-runtime-import-audit/index.ts`

Checklist:

- [x] Include new WebGPU app roots in runtime import audit.
- [x] Confirm route code does not import forbidden Three.js runtime paths.

### `tools/three-compat-legacy-prune-readiness/index.ts`

Checklist:

- [x] Add WebGPU route folders only after they are root-registry-approved.

## Documentation

### `docs/rendering/webgpu-fallback.md`

Checklist:

- [x] Replace "WebGPU app routes" wording with "WebGPU implementation, production-runtime, template, and proof-test surfaces" until root routes exist.
- [x] Document supported/unsupported route states.
- [x] Document explicit WebGPU failure behavior.
- [x] Document `backend: "webgpu"` and `backend: "auto"` usage.

### `docs/rendering/webgpu-hardware-matrix.md`

Checklist:

- [x] Define required devices/browsers for first-class WebGPU claims.
- [x] Document report schema and interpretation.
- [x] Distinguish real hardware from injected runtime evidence.

### `docs/concepts/rendering.md`

Checklist:

- [x] Update rendering backend section with WebGPU status and claim boundary.
- [x] Link to WebGPU feature matrix and hardware matrix docs.

### `docs/api/readme.md`

Checklist:

- [x] Add concise WebGPU backend creation example.
- [x] Explain when to use `renderAsync`.
- [x] Explain selected backend diagnostics.

### `docs/api/app-api.md`

Checklist:

- [x] Add `backend: "auto"` and `backend: "webgpu"` examples.
- [x] Include unsupported diagnostic example.

### `docs/project/claim-guidelines.md`

Checklist:

- [x] Add WebGPU-specific forbidden claim examples.
- [x] Add approved claim language for conditional support.
- [x] Require hardware matrix before "full WebGPU support" language.

### `docs/project/compatibility.md`

Checklist:

- [x] Update compatibility table with WebGPU browser/device caveats.
- [x] Link to generated matrix report.

### `docs/project/getting-started.md`

Checklist:

- [x] Add WebGPU route registry note after WebGPU routes exist.
- [x] Keep WebGL2 as default unless product decision changes.

### `README.md`

Checklist:

- [x] Keep top-level WebGPU claims evidence-scoped.
- [x] Mention WebGPU route examples only after root registry routes exist.
- [x] Avoid "full WebGPU support" unless completion audit passes.

## Claim Language

Approved before full completion:

- "Aura3D includes WebGPU backend paths with explicit availability diagnostics."
- "WebGPU support is conditional on browser/device availability."
- "Named WebGPU workflows have generated route and hardware evidence."
- "WebGL2 remains the broadly available default backend."

Approved after completion audit passes:

- "Aura3D includes first-class WebGPU examples for supported browsers/devices."
- "Aura3D supports WebGPU for the named feature matrix rows marked supported."
- "Aura3D can render the approved product-viewer and PBR asset workflows through WebGPU on verified hardware."

Forbidden until hardware and feature matrices pass:

- "Full WebGPU support."
- "Complete WebGPU/WebGL2 parity."
- "Every Aura3D example supports WebGPU."
- "WebGPU works across all browsers and GPUs."
- "WebGPU is always faster than WebGL2."

## Acceptance Criteria

WebGPU is first-class only when all checks below pass:

- [x] At least four WebGPU routes are visible in root `index.html`.
- [x] WebGPU routes render successfully on at least one real WebGPU browser/device.
- [x] WebGPU routes show structured unsupported diagnostics where WebGPU is unavailable.
- [x] No explicit WebGPU route silently falls back to WebGL2.
- [x] `tests/reports/webgpu-feature-matrix.json` passes.
- [x] `tests/reports/webgpu-route-health.json` passes.
- [x] `tests/reports/webgpu-visual-parity.json` passes.
- [x] `tests/reports/webgpu-hardware-matrix.json` passes with real adapter/device evidence.
- [x] `tests/reports/webgpu-completion-audit.json` passes.
- [x] Current root route health still passes.
- [x] Current route legacy prune still passes.
- [x] Docs claim scan passes.
- [x] README and docs use only approved WebGPU claim language.

## Suggested Implementation Order

1. Documentation boundary cleanup.
2. Shared WebGPU route HUD/runtime.
3. `wow-webgpu-triangle`.
4. WebGPU route-health support for ready/unsupported outcomes.
5. `wow-webgpu-render-target`.
6. WebGPU feature matrix tool.
7. `wow-webgpu-pbr-asset`.
8. WebGPU/WebGL2 visual parity tool.
9. `wow-webgpu-product-viewer`.
10. Hardware matrix browser report.
11. Instancing route.
12. Compute route only if native compute support exists.
13. Completion audit and claim-guideline updates.

## Release Checklist

- [x] `pnpm typecheck`
- [x] `pnpm test:unit`
- [x] `pnpm exec vitest run tests/unit/rendering/webgpu-*.test.ts tests/unit/tools/webgpu-*.test.ts`
- [x] `pnpm exec playwright test tests/browser/webgpu-*.spec.ts --reporter=line`
- [x] `pnpm webgpu`
- [x] `pnpm exec playwright test tests/browser/current-routes-route-health.spec.ts --reporter=line`
- [x] `pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-legacy-prune/index.ts`
- [x] `pnpm verify:docs-version`
- [x] `pnpm verify:docs-consistency`
- [x] `git diff --check`

## Open Decisions

- [x] Should `backend: "auto"` prefer WebGPU by default when `navigator.gpu` is available, or should WebGL2 remain default until WebGPU completion audit passes?
Decision: `backend: "auto"` can select WebGPU when `navigator.gpu` is available, but WebGL2 remains the default for broad starter usage and most existing routes.
- [x] Should root registry WebGPU routes be hidden on unsupported browsers or visible with unsupported diagnostics? Recommended: visible with diagnostics.
Decision: WebGPU routes remain visible and must show structured unsupported diagnostics when WebGPU is unavailable.
- [x] Which assets are canonical WebGPU visual parity assets: Damaged Helmet, Boom Box, Concept Car, or Material Spheres?
Decision: Damaged Helmet is the canonical PBR asset route, Boom Box is the canonical product-viewer route, and material spheres remain a partial/follow-up parity row.
- [x] What exact visual delta thresholds are acceptable for WebGPU-vs-WebGL2 product proof?
Decision: Same-scene parity uses `tools/webgpu-visual-parity`; imported product/PBR route quality also requires `pnpm webgpu:product-quality`, which checks foreground coverage, centered asset coverage, edge/detail density, color bucket count, and washed-out overdraw thresholds.
- [x] What minimum browser/device matrix is required before public "first-class WebGPU" language?
Decision: At least one real `navigator.gpu` adapter/device report plus passing `pnpm webgpu` is required for named first-class WebGPU claims; broader browser/device claims require matching hardware matrix rows.

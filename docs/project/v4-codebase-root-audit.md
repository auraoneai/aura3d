# V4 Codebase Root Audit

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current audit date: 2026-05-13.

This document tracks the root-code requirements that must be proven before returning to example visual work. It intentionally excludes `examples/**` implementation work. Passing this audit does not by itself prove Three.js, Babylon.js, Unity, Unreal, production, or visual-quality parity.

## Objective Boundary

User requirement:

> Do not go back to working on examples until renderer path, material/shader behavior, postprocess/HDR/shadow integration, camera/framing defaults, asset-to-render-resource ergonomics, and related root codebase problems are fixed and proven.

Current status:

- Root-code checks: all 15 checks in `tests/reports/external-parity-codebase-root-readiness.json` pass.
- Overall readiness: `rootReady: false`.
- Example work: `examplesAllowedToResume: false`.
- Reason examples remain blocked: visual-quality and external parity gates still fail or remain incomplete.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Workspace package imports must resolve in Vite without example coupling. | `tests/browser/workspace-vite-imports.spec.ts`; `pnpm exec playwright test tests/browser/workspace-vite-imports.spec.ts --reporter=line` passed 1/1. | Passing |
| Renderer must support explicit render targets without leaking state. | `packages/rendering/src/Renderer.ts`; `packages/rendering/src/WebGL2Device.ts`; `tests/unit/rendering/renderer.test.ts`; `tests/unit/rendering/render-state-leaks.test.ts`. | Passing |
| WebGL2 render-target allocation must preserve framebuffer/renderbuffer bindings. | `WebGL2Device.createRenderTarget()` restores `FRAMEBUFFER_BINDING` and `RENDERBUFFER_BINDING`; regression in `render-state-leaks.test.ts`. | Passing |
| Camera/framing defaults must keep dense, transformed, lit scenes visible. | `tests/browser/rendering-root-quality-gate.spec.ts`; screenshots under `tests/reports/v4-root-rendering-quality/`; root browser gate passed 11/11. | Passing |
| Material/shader PBR behavior must avoid known decode/state regressions. | `packages/rendering/src/shaders/pbr-direct.frag.glsl`; `packages/rendering/src/ShaderLibrary.ts`; `tests/browser/rendering-root-quality-gate.spec.ts`; `tests/unit/rendering/pbr-lighting.test.ts`; `tests/unit/rendering/shader-library.test.ts`. | Passing |
| WebGL sRGB textures must not be double-decoded in PBR shaders. | `does not double-decode WebGL sRGB PBR texture samples` root browser test; shader source no longer contains `return pow(clamp(encodedColor`. | Passing |
| Samplers and texture upload behavior must preserve sRGB and mipmap contracts. | `tests/unit/rendering/render-state-leaks.test.ts`; `uploads sRGB textures with WebGL2 sRGB internal formats`; `preserves mipmap-aware sampler min filters`. | Passing |
| Root postprocess must render real scene pixels without inheriting scene cull/blend/depth state. | `preserves dark clear color through renderer-owned postprocess presentation`; `presents renderer-owned postprocess even after scene cull state changes`; root browser gate passed 11/11. | Passing |
| HDR render-target root path must preserve overbright linear output before tone mapping. | `tests/browser/rendering-root-quality-gate.spec.ts`; `tests/reports/external-parity-hdr-render-target-readiness.json`; `audit:external-parity-hdr-render-target-readiness` passes with parity still blocked. | Passing, parity blocked |
| Shadow-map root forward path must have renderer-owned sampling evidence. | `packages/rendering/src/ForwardPass.ts`; `packages/rendering/src/ShadowPass.ts`; `tests/reports/external-parity-shadow-map-readiness.json`; root browser shadow resize test. | Passing, parity blocked |
| Asset-to-render-resource ergonomics must provide a usable default path. | `packages/assets/src/GLTFRenderResources.ts`; `tests/assets/gltf-inspection.test.ts`; `toRenderSource()` defaults to `studio-preview`; `qualityPreset: "default"` is explicit opt-out. | Passing |
| glTF local loader contract must remain covered. | `tests/reports/external-parity-pbr-gltf-readiness.json`; `gltfParity: true`; focused asset contract test passed 5/5. | Passing locally |
| WebGPU native root path must remain tracked and bounded. | `packages/rendering/src/WebGPUDevice.ts`; `tests/reports/v4-webgpu-parity.json`; root readiness check passes, broad WebGPU parity remains blocked. | Passing locally, parity blocked |
| Current visual quality must block resume until honestly fixed. | `tests/reports/external-parity-visual-quality.json`; root readiness reports `exampleVisualsStillBlocked: true`. | Blocking |
| External Unity/Unreal parity must not be inferred from local tests. | `tests/reports/external-parity-codebase-root-readiness.json`; blockers list missing Unity executable and external evidence sidecars. | Blocking |

## Verification Commands

Root-only commands run in this pass:

- `pnpm typecheck`
- `pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-inspection.test.ts --reporter=dot`
- `pnpm exec vitest run tests/unit/rendering/render-state-leaks.test.ts --reporter=dot`
- `pnpm exec vitest run tests/unit/input/camera-controls.test.ts tests/unit/rendering/renderer.test.ts -t "camera|frustum|auto-frame|explicit offscreen render targets" --reporter=dot`
- `pnpm exec playwright test tests/browser/workspace-vite-imports.spec.ts --reporter=line`
- `pnpm exec playwright test tests/browser/rendering-root-quality-gate.spec.ts --reporter=line`
- `pnpm audit:external-parity-hdr-render-target-readiness`
- `pnpm audit:external-parity-shadow-map-readiness`
- `pnpm audit:external-parity-postprocess-suite`
- `pnpm audit:external-parity-pbr-gltf-readiness`
- `pnpm exec tsx --tsconfig tsconfig.base.json tools/external-parity-codebase-root-readiness/index.ts`
- `pnpm verify:external-parity-codebase-root-report-freshness`

## Remaining Blockers

Do not resume example work until these are resolved or explicitly waived:

- `tests/reports/external-parity-visual-quality.json` fails. Current concrete failures:
  - screenshot files are visually weak or badly framed for `product-configurator`, `game-slice`, and `material-showroom`;
  - primary asset visibility is under-evidenced for `product-configurator`, `architecture-viewer`, and `game-slice`;
  - static/manifest flagship evidence does not clear the `v4-not-debug-or-primitive-dominated` gate;
  - manual visual review explicitly rejected `product-configurator`, `product-visual-parity-aura3d`, `architecture-viewer`, `game-slice`, `racing-showcase`, `asset-viewer`, `material-showroom`, `postprocess-lab`, and `shadow-lab`.
- Broad parity/completion still blocks 11 of 13 criteria:
  - Three.js broad superiority
  - Babylon.js broad superiority
  - Unity parity
  - Unreal parity
  - Unity/Unreal replacement
  - production readiness
  - full PBR parity
  - production HDR/render-target parity
  - production shadow-map parity
  - full postprocess-suite parity
  - rendered product visual parity
- External evidence is incomplete:
  - first missing capability: `unity-editor-executable`
  - first blocked artifact: `unity:editor-cli-smoke`

## Conclusion

Root-code contracts are currently covered by direct package, unit, browser, and readiness evidence. This is not enough to claim the overall objective complete. The examples remain blocked until the visual-quality and external parity blockers are addressed honestly.

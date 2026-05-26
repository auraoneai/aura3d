# Renderer Postprocess

Version: `1.0.0`

Postprocess support exists in the renderer package and current app routes.

## Current Code

- `packages/rendering/src/postprocess/EffectComposer.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/production-runtime/resources/RenderTarget.ts`
- `packages/rendering/src/Renderer.ts`
- `/apps/advanced-examples-gallery/#reactor-post`
- `/apps/advanced-examples-gallery/#fog-cathedral`
- `apps/wow-clearcoat-material-sample/`

## Implemented Areas

- Renderer-owned render-target chains.
- Reusable ping-pong composer targets.
- Bloom, tone mapping, FXAA-facing paths, depth-of-field, SSAO, and outline route coverage.
- Render-target resize/disposal accounting and diagnostics.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/postprocess-composer.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
pnpm exec playwright test tests/browser/threejs-parity-unreal-bloom-parity.spec.ts
```

## Boundaries

The current docs should not claim complete Three.js examples/postprocessing parity or Unity/Unreal-style render-stack parity. Each postprocess claim needs a named pass, route, test, and generated report.

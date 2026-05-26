# Renderer Lifecycle

Version: `1.0.0`

Renderer lifecycle behavior is implemented by renderer/device classes, explicit disposal paths, and resource accounting tests.

## Current Code

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/ResourceLifecycle.ts`
- `packages/rendering/src/production-runtime/resources/RenderTarget.ts`

## Lifecycle Rules

- Create a renderer/device through public factories such as `Renderer.create` or `A3DRenderer.create`.
- Treat buffers, textures, render targets, shaders, programs, VAOs, samplers, and render resources as owned by renderer/device code unless an API states otherwise.
- Call `dispose()` on renderers and long-lived resources when tearing down an app or route.
- Use diagnostics and resource-lifetime tests to verify cleanup.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/resource-lifetime.test.ts tests/unit/rendering/render-state-leaks.test.ts
pnpm superiority:resource-lifecycle
```

## Boundaries

Lifecycle reports prove the resources named by those reports. They do not prove browser garbage collection behavior, every third-party integration, or every WebGPU driver path.

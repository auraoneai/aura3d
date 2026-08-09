# Renderer Lifecycle

Version: 1.6

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
- On root WebGL context loss, pause unsafe application work. After restoration,
  explicitly remount the retained scene with `app.setScene(...)`, await
  `app.ready()`, and resume. This recreates renderer-owned resources for that
  app without claiming transparent recovery for external resources.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/resource-lifetime.test.ts tests/unit/rendering/render-state-leaks.test.ts
pnpm renderer:controls-picking-xr-context
```

## Boundaries

Renderer/device lifecycle tests prove package resource ownership and cleanup.
They do not prove root `createAuraApp` cleanup, browser-wide leak freedom, or
comparative performance unless the claimed route and repeated lifecycle test
exercise that exact public path. A successful disposal counter is not evidence
that Aura3D matches another engine's memory or frame-time behavior.

The bounded root context receipt in
`docs/rendering/controls-picking-xr-context.md` proves a real loss signal,
paused work, an explicit public scene remount, a newly mounted production
runtime, and identical restored pixels. It does not prove automatic recovery
for every lower-level consumer or arbitrary caller-owned GPU resource.

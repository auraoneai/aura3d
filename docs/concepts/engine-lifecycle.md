# Engine Lifecycle

```ts
const app = createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene().add(model(assets.robot)).add(lights.studio())
});

app.dispose();
```

`createAuraApp` owns canvas setup, render loop startup, diagnostics state,
screenshot capture, and cleanup. Use `dispose()` when replacing routes or
unmounting UI.

## Aura3D advantage

The engine lifecycle package boundary is `@aura3d/engine`: it coordinates the
canvas, scene builder output, asset loading, renderer setup, route-health state,
and app disposal. Lower-level packages such as `@aura3d/rendering`,
`@aura3d/assets`, and `@aura3d/scene` provide primitives, loaders, and renderer
contracts; application code should enter through `createAuraApp` unless it is
intentionally using those lower-level packages directly.

## Current Limits

Aura3D does not run a provider proxy, prompt compiler, or hidden scene-IR
runtime during lifecycle startup. The agent or developer supplies TypeScript
scene code and declared assets, and lifecycle diagnostics report missing canvas,
asset, backend, and route-health failures rather than silently generating a
replacement scene.

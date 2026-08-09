# Aura3D App API

Use `@aura3d/engine` for the public authoring surface. Public app examples
should mount one Aura app, use typed assets, and mutate runtime nodes through
the returned app handle.

```ts
import { camera, createAuraApp, lights, material, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .add(model(assets.product, { material: material.pbr() }))
    .add(lights.studio())
    .camera(camera.orbit({ distance: 4 }))
});
```

For typed GLB first-load framing, use `camera.frameAsset(assets.product, {
targetHeight })`. This frames the typed asset from manifest bounds through the
root `createAuraApp` path. It is not a semantic grounding API; if a route needs
tire, foot, road, or contact-point guarantees, keep that claim blocked until the
grounding contract and diagnostics are implemented and screenshot-proven.

## App Handle

`createAuraApp(...)` returns the mounted app handle:

- `app.nodes`: runtime nodes declared with `.runtime(game.runtimeNode("id"))`.
- `app.onFrame(callback)`: per-frame route logic.
- `app.input(options)`: app-owned input controller disposed with the app.
- `app.pause()`, `app.resume()`, `app.step(dt)`: runtime control for tests and replays.
- `app.setScene(scene)`: replace the scene for route-level swaps, not every frame.
- `app.diagnostics()`, `app.evidence()`, `app.screenshot()`: source/runtime reporting.
- `app.dispose()`: release listeners, frame callbacks, inputs, and renderer resources.

## Renderer Boundary

`createAuraApp` accepts public renderer selection metadata. This is deliberately
claim-safe: every renderable scene made from public safe nodes uses the production
runtime by default, diagnostics record the requested mode/profile and mounted
backend, and raw/remote model URLs are rejected from that path with typed-asset
migration guidance. `safe-basic` remains an explicit compatibility mode, not the
default renderer.

```ts
const app = createAuraApp("#app", {
  renderer: {
    mode: "production",
    fallback: "safe-basic",
    qualityProfile: "production"
  },
  scene: scene().add(model(assets.product)).add(lights.studio())
});

console.log(app.diagnostics().renderer?.qualityProfile.id);
console.log(app.diagnostics().renderer?.warnings);
```

Current profiles:

- `safe-basic`: conservative public feature profile on the production renderer;
  an explicit `mode: "safe-basic"` selects the compatibility WebGL2 renderer.
- `production`: supported production-runtime profile for public primitives and
  generated typed GLB assets. Unsafe/raw model URLs are rejected rather than
  silently rendered by a different backend. Selecting this profile does not
  prove full PBR, HDR, shadow, postprocess, WebGPU, or skinned-animation parity
  without route-specific browser evidence.
- `cinematic`: explicit request profile for future high-DPI/postprocess/shadow
  proof; currently fallback-only through the root path.
- `experimental-webgpu`: diagnostics-only request profile unless adapter,
  backend, dispatch, render, and screenshot evidence all pass.

The root app path still decides its runtime internally:

- Browser canvas plus renderable safe scene nodes use `production-runtime` by
  default; inspect `app.diagnostics().renderer.runtime.backend` for mounted
  evidence.
- Explicit `mode: "safe-basic"` uses the compatibility WebGL2 renderer. A real
  production initialization failure may use that reported fallback, but the
  route cannot continue claiming production-renderer evidence.
- Canvas2D is a schematic diagnostic for non-renderable/headless inspection
  only. A renderable scene without WebGL2 errors instead of painting a plausible
  fake 3D frame.
- Advanced production-runtime and postprocess APIs live in lower-level packages
  such as `@aura3d/rendering` or lazy helpers; importing those is not the same
  as proving the root safe API renders the feature.

Docs and examples must name the path they are proving: root `createAuraApp`,
`@aura3d/rendering` production/runtime internals, CLI asset pipeline, template
scaffold, prototype, or roadmap.

`renderer.qualityProfiles()` and `renderer.qualityProfile(id)` expose the same
profile metadata without mounting an app. Public examples may show these
diagnostics, but may not claim specific production-renderer features from the
root path until the route has browser screenshots, diagnostics, and pixel or
runtime assertions for those exact features.

## Asset Boundary

Scene code should import generated typed assets:

```ts
import { assets } from "./aura-assets";

scene().add(model(assets.robot));
```

Do not use string model ids, invented GLB URLs, `GLTFLoader`, `three`, or
renderer internals in public root examples. The scene description is source
code. Generated diagnostics snapshots are for tests and bug reports, not an
alternate authoring language.

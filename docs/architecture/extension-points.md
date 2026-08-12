# Renderer extension API — going below the safe API (WS-3.10)

Aura3D's public surface has two layers, and both are supported:

- **`@aura3d/engine`** — the safe agent API. `createAuraApp`, `scene()`, `primitives`, `material`,
  `labels`, `game`. Most developers never leave it.
- **`@aura3d/rendering`** — the primary low-level package. Devices, renderers, geometry,
  materials, shader modules, and passes are published with declarations.
- **`@aura3d/engine/rendering`** — a compatibility export of the same renderer surface from
  the root package. New low-level integrations should prefer `@aura3d/rendering`.

The second layer is not an accident of packaging. **An engine a developer cannot go beneath is a
framework they will eventually have to abandon.** Every hatch below is a published entry point, and
`tests/browser/renderer-extension-escape-hatch.spec.ts` proves the whole set is usable together with
**zero `@aura3d/*/src/*` deep imports** — because an escape hatch that requires reaching into a
package's `src/` is not a hatch, it is a leak.

## Stable typed entry points

| Need | Entry point | Export |
|---|---|---|
| Construct a GPU device yourself | `@aura3d/rendering` | `createRenderDevice`, `WebGL2Device` |
| Construct a WebGPU device | `@aura3d/rendering/webgpu` | `WebGPUDevice` |
| Drive the renderer and reach its device | `@aura3d/rendering` | `Renderer`, `renderer.device` |
| Build geometry | `@aura3d/rendering` | `Geometry`, `VertexBuffer`, `IndexBuffer`, `VertexFormat` |
| Build materials | `@aura3d/rendering` | `PBRMaterial`, `UnlitMaterial`, `TexturedPBRMaterial`, ... |
| Write a renderer-integrated portable custom material | `@aura3d/rendering` | `PortableShaderMaterial`, `ShaderLibrary`, `Renderer` |
| Write a low-level custom shader/pass | `@aura3d/rendering` | `ShaderModule`, `ShaderLibrary`, `createDefaultShaderLibrary` |
| Write a custom postprocess pass | `@aura3d/rendering` | `ShaderModule` + `renderer.device.draw(...)` or the postprocess helpers |
| Physics without the app | `@aura3d/engine/physics` · `@aura3d/engine/physics/world` | `PhysicsWorld`, `Shape`, `PhysicsStepper` |
| Geometry queries without a solver | `@aura3d/engine/physics/solverless` | `buildMeshBVH`, `createMeshSurfaceQuery` |
| Node-side media encoding | `@aura3d/engine/media-node` | `createFfmpegFrameEncoderAdapter` |

`WebGPUDevice` and the physics subpaths live off the main barrel deliberately (WS-2.2): a value
re-export is a static graph edge, so exporting them from the barrel forced every consumer to download
a WebGPU device or a rigid-body solver they never constructed. **Nothing was removed from the public
surface — one import specifier changed per symbol.**

## Lifecycle ownership

Ownership is explicit and deterministic:

- `Renderer.create(...)` creates and owns its `RenderDevice`. `renderer.device`
  is a supported, readonly reference for extension draws; an integration must
  not dispose it independently. `renderer.dispose()` stops its animation loop,
  disposes renderer-owned targets, and finally disposes the device.
- A caller owns every `Geometry`, `Material`, `ShaderModule`, `Texture`, buffer,
  target, or pass it constructs directly. Dispose those objects before the
  renderer. Disposal is idempotent where the public type documents it, but an
  object must not be rendered or mutated after disposal.
- Renderer/device caches and default passes are renderer-owned. A caller must
  not dispose objects it only receives as renderer diagnostics or internal
  execution state.
- If an integration calls `createRenderDevice(...)` without a `Renderer`, it
  owns that device and must dispose it after all resources created from it.
  Do not create a second device for a canvas already owned by a renderer.

Recommended teardown order:

```ts
material.dispose();       // caller-owned
geometry.dispose();       // caller-owned GPU buffers
customShader.dispose();   // caller-owned compiled program
renderer.dispose();       // renderer-owned targets, device, remaining caches
```

## Compatibility guarantee

The package export map and declarations under `@aura3d/rendering`,
`@aura3d/rendering/lean-runtime`, and `@aura3d/rendering/webgpu` are public API.
Aura3D applies semantic versioning to those exported names and TypeScript
signatures: a 2.0 patch may fix behavior without intentionally breaking the
contract; a minor may add optional capabilities; removing or incompatibly
changing an exported contract requires a major version and migration notes.
The root `@aura3d/engine/rendering` compatibility entry follows the same rule.

The guarantee does not cover `packages/*/src/*`, unexported class fields,
backend-native WebGL/WebGPU objects discovered by casting, generated `dist/`
paths, or observed cache/layout implementation details. Direct access to those
is a renderer fork and may change in any release. Backend-specific behavior is
capability-gated through public device reports; the existence of the escape
hatch is not a promise that every backend supports every native feature.

## Custom shader

Use `PortableShaderMaterial` for a renderer-integrated material that must run on
WebGL2 and WebGPU with typed bindings, native diagnostics, live replacement,
and disposal. See `docs/rendering/portable-custom-materials.md`.

`ShaderModule` remains the lower-level escape hatch. It takes GLSL sources
directly and reflects their attributes and uniforms:

```ts
import { ShaderModule } from "@aura3d/rendering";

const pass = new ShaderModule({
  label: "my-tint",
  marker: "my-app/tint",
  vertex: "#version 300 es\n…",
  fragment: "#version 300 es\n…"
});
pass.source;      // { label, marker, vertex, fragment }
pass.reflection;  // attributes and uniforms, parsed
```

To extend a built-in shader rather than replace it, `ShaderModule.fromLibrary(library, name)` and
`fromLibraryVariant(...)` compile from `createDefaultShaderLibrary()`, so a variant inherits the engine's
own chunks instead of copying them.

## Custom postprocess pass

Compile a `ShaderModule` and submit it through `renderer.device`, the documented
readonly device seam. The clean-room consumer in
`tests/clean-room/renderer-extension/src/main.ts` constructs one `Renderer`,
renders an engine material, submits its own pass with the public draw contract,
visibly changes the framebuffer, and disposes caller-owned resources before the
renderer. It never creates a raw `WebGLProgram` or a second canvas context.

## Custom scene node

Two levels, and the choice depends on whether you need the engine's scheduling:

1. **Stay inside `createAuraApp`.** `app.onFrame(...)` plus `app.nodes.require(name)` moves and hides
   scene-declared nodes at runtime. This keeps the render loop, physics stepping, label projection and
   diagnostics.
2. **Own the loop.** Construct `Renderer` yourself and submit render items directly. You give up the
   app's scheduling and evidence, and you gain complete control. The clean-room extension project takes
   this route.

There is no supported middle path that injects a foreign node type into `createAuraApp`'s scene graph;
the snapshot is a typed, serialisable format, and accepting arbitrary nodes into it would make
`diagnostics()` and the evidence harnesses unable to describe what they rendered.

## What is deliberately not a hatch

- **The Canvas 2D preview** (`renderDiagnosticPreviewToCanvas`) is internal and diagnostic-only. It draws
  a gradient and a rectangle per node — a schematic, not a render. See WS-2.5.
- **`agent-api` internals.** The safe API is a surface, not a set of building blocks; reach the layer
  below instead.

## Independent integration evidence

Two independently authored consumers run against the published package surface:

1. `tests/clean-room/renderer-extension/` uses `Renderer.device`,
   `Geometry`, `UnlitMaterial`, and `ShaderModule` to add a low-level GPU pass.
2. `examples/custom-material-lab/` uses `Renderer`, `Geometry`, `Texture`, and
   three `PortableShaderMaterial` instances through both WebGL2 and WebGPU.

The browser gate scans both sources for deep imports, copied `Renderer`
implementations, raw program creation, and direct Three.js imports, then
requires actual pixels/draw calls and disposal. Run
`pnpm renderer:extension-escape-hatch`.

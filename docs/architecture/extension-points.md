# Extension points — going below the safe API (WS-2.8)

Aura3D's public surface has two layers, and both are supported:

- **`@aura3d/engine`** — the safe agent API. `createAuraApp`, `scene()`, `primitives`, `material`,
  `labels`, `game`. Most developers never leave it.
- **`@aura3d/engine/rendering`** and siblings — the low-level layer. Devices, renderers, geometry,
  materials, shader modules, passes.

The second layer is not an accident of packaging. **An engine a developer cannot go beneath is a
framework they will eventually have to abandon.** Every hatch below is a published entry point, and
`tests/browser/renderer-extension-escape-hatch.spec.ts` proves the whole set is usable together with
**zero `@aura3d/*/src/*` deep imports** — because an escape hatch that requires reaching into a
package's `src/` is not a hatch, it is a leak.

## The hatches

| Need | Entry point | Export |
|---|---|---|
| Construct a GPU device yourself | `@aura3d/engine/rendering` | `createRenderDevice`, `WebGL2Device` |
| Construct a WebGPU device | `@aura3d/engine/rendering/webgpu` | `WebGPUDevice` |
| Drive the renderer directly | `@aura3d/engine/rendering` | `Renderer` |
| Build geometry | `@aura3d/engine/rendering` | `Geometry`, `VertexBuffer`, `IndexBuffer`, `VertexFormat` |
| Build materials | `@aura3d/engine/rendering` | `PBRMaterial`, `UnlitMaterial`, `TexturedPBRMaterial`, ... |
| Write a renderer-integrated portable custom material | `@aura3d/rendering` | `PortableShaderMaterial`, `ShaderLibrary`, `Renderer` |
| Write a low-level custom shader/pass | `@aura3d/engine/rendering` | `ShaderModule`, `ShaderLibrary`, `createDefaultShaderLibrary` |
| Write a custom postprocess pass | `@aura3d/engine/rendering` | `ShaderModule` + the `PostProcessPass` helpers |
| Physics without the app | `@aura3d/engine/physics` · `@aura3d/engine/physics/world` | `PhysicsWorld`, `Shape`, `PhysicsStepper` |
| Geometry queries without a solver | `@aura3d/engine/physics/solverless` | `buildMeshBVH`, `createMeshSurfaceQuery` |
| Node-side media encoding | `@aura3d/engine/media-node` | `createFfmpegFrameEncoderAdapter` |

`WebGPUDevice` and the physics subpaths live off the main barrel deliberately (WS-2.2): a value
re-export is a static graph edge, so exporting them from the barrel forced every consumer to download
a WebGPU device or a rigid-body solver they never constructed. **Nothing was removed from the public
surface — one import specifier changed per symbol.**

## Custom shader

Use `PortableShaderMaterial` for a renderer-integrated material that must run on
WebGL2 and WebGPU with typed bindings, native diagnostics, live replacement,
and disposal. See `docs/rendering/portable-custom-materials.md`.

`ShaderModule` remains the lower-level escape hatch. It takes GLSL sources
directly and reflects their attributes and uniforms:

```ts
import { ShaderModule } from "@aura3d/engine/rendering";

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

Compile a `ShaderModule` and draw a full-screen triangle over the frame. The worked example is
`tests/clean-room/renderer-extension/src/main.ts` — it constructs a device with `createRenderDevice`,
a `Renderer`, geometry with `Geometry`, and its own pass with `ShaderModule`, and the test asserts the
pass **visibly changes the framebuffer**. Compiling would prove the API is reachable; changing pixels
proves the hatch works.

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

# Native capability recipes

**Status: `prototype`.** The scenario recipes describe the current source in
[`examples/native-capabilities/index.ts`](../../examples/native-capabilities/index.ts).
Each scenario mounts one app with a typed model, a `product-studio` look and a
camera. The advanced-lighting recipe below uses the opt-in engine lighting
entry. The examples show how to assemble a scene; they are not results from an
installed package, a browser, or a physical device. Use a package candidate
whose exports match this source and verify the actual route before making a
stronger claim. [Claims and boundaries](claims-and-boundaries.md) defines the
evidence required for each claim.

## Prepare a project and admit its subject

1. Start a separate project from the `mini-game` template corresponding to the
   candidate you are evaluating; see the [agent quickstart](agent-quickstart.md)
   for scaffolding. Its `src/aura-assets.ts` and
   `aura.assets.json` in this checkout contain the typed model
   `assets.kaykitBarbarian`; the manifest records its hash, license and `Idle`
   clip. Check that the generated project actually has that entry and its
   referenced asset before using the example. A scaffold alone is not evidence
   of rendering or animation.
2. Copy the Aura3D-owned scenario source linked above into that project's
   `src/scenario.ts`. The project needs an `#app` element, as the template
   provides. Use the matching engine candidate; a published version may not
   include every API in the working-tree example.
3. Replace the project's `src/main.ts` with the entry below. Change the scenario
   ID to any row in the table. The animation clip is used by the animation
   scenario; inspect the selected model before substituting another clip. When
   the route or component unmounts, call `disposeCapabilityExample()`.

<!-- aura3d-docs-example: exempt This entry imports the project-local scenario source and generated asset module prepared in the preceding steps. -->
```ts
import { assets } from "./aura-assets";
import {
  mountNativeCapabilityScenario,
  queryNativeScenarioBounds,
  type NativeCapabilityScenarioId
} from "./scenario";

async function mount(id: NativeCapabilityScenarioId) {
  const app = await mountNativeCapabilityScenario(id, {
    target: "#app",
    asset: assets.kaykitBarbarian,
    animationClip: "Idle"
  });
  if (id === "bounds-query") console.log(queryNativeScenarioBounds(app));
  return app;
}

// Never `await` this at module top level: a default `vite build` deadlocks on it (black page).
const mounted = mount("typed-model");
mounted.catch((error: unknown) => console.error(error));
export function disposeCapabilityExample() {
  void mounted.then((app) => app.dispose(), () => undefined);
}
```

The mount function checks the asset's `sha256-...` hash metadata and awaits
`app.ready()`; it disposes the app if readiness fails. A hash field is not by
itself proof that the bytes and any external dependencies were verified. The
caller owns the returned app and its route lifecycle.

To use your own subject, admit a licensed local GLB in the separate project.
Check the installed CLI's help first, then substitute your actual file and
license metadata in the asset admission workflow. For example:

```sh
npx @aura3d/cli@latest assets add ./subject.glb --name subject --type model \
  --license "<license>" --license-url "<license URL>" \
  --source-page "<source page URL>" --download-url "<download URL>" \
  --author "<author>" --retrieved-at "<ISO-8601 timestamp>"
npx @aura3d/cli@latest assets inspect ./subject.glb --animation --skeleton --license
npx @aura3d/cli@latest assets typegen
npx @aura3d/cli@latest assets validate --asset subject --source --no-placeholders --require-license
```

Record the actual source page, author, license, license URL and acquisition
details as described in the [asset workflow](asset-workflow.md). Read the
generated `src/aura-assets.ts` and pass its exact model key; do not pass a raw
model URL or guess a key. The animation recipe also needs a usable clip name
from inspection. Run admission and type generation in the separate project,
not at the monorepo root.

## Choose a scenario

The ID is the first argument to `mountNativeCapabilityScenario`. Each run
includes the admitted subject and floor; the extra triangle and spheres are
abstract capability samples rather than replacements for the subject. Inspect
`app.diagnostics()` as well as the visible result. The checks below are things
to perform for your candidate, not results already obtained for this document.

| ID | Source path to try | Check and boundary |
| --- | --- | --- |
| `typed-model` | Mount the typed model with `model`, a perspective camera and a look. | Confirm the intended asset loads, is framed and is disposed on route exit. Manifest metadata alone does not prove byte integrity or a rendered subject. |
| `custom-geometry` | `geometry.define` supplies indexed positions, normals and bounds; `geometry.custom` adds a triangle. | Check the triangle and subject in the rendered scene. This is an abstract indexed-geometry example, not proof for arbitrary geometry or materials. |
| `material-lighting` | Add a PBR sphere and a shadow-casting directional light alongside the look. | Compare a controlled change to the material or light in the same scene. This one sample does not establish support for every material property or lighting combination. |
| `custom-shader` | Apply `material.custom` with a fragment shader to an abstract sphere. | Check shader diagnostics and visible output on the exact backend under test. The snippet does not establish portable shader behavior across backends. |
| `postprocess` | Add `effects.colorGrade` with contrast and saturation. | Compare the same scene with the effect enabled and disabled. Other grade fields and effect combinations need their own evidence. |
| `animation` | Play the inspected clip on the admitted model with looping enabled. | Compare the subject region at distinct times and check clip diagnostics. A named clip or changing background alone does not prove the model deforms correctly. |
| `controls` | Add `interactions.orbit` targeting the named subject. | Apply input and verify the camera view changes; a static frame cannot prove interaction. |
| `bounds-query` | Call `queryNativeScenarioBounds(app)` after readiness, as in the entry above. It uses `raycastFirst` over scene nodes. | Inspect the returned hit or `undefined`; the query can encounter another scene node. Its default bounds mode is approximate and does not establish an exact triangle or deformed-mesh hit. |
| `world-text` | Add `text3D("AURA3D", ...)` with size, depth and material. | Check the rendered letters and depth for this string. This example does not establish arbitrary fonts, shaping or language coverage. |
| `physics` | Bind a dynamic sphere and static box to scene nodes and advance physics in `onFrame`. | Compare the body's state and its visible position over time, including contact. This sample is not evidence for other shapes, joints or complete game behavior. |
| `worker-render` | Mount the `typed-model` scene with `worker: { createWorker, fallback: "error" }`; `createWorker` defaults to `createWorkerRendererWorker` from `@aura3d/engine/worker`. | Check `app.execution.active === "worker"` and the rendered subject. Worker apps reject physics, DOM labels, `onFrame` callbacks and `app.nodes`; this sample does not prove every scene is worker-eligible. |
| `interchange-export` | Add the `custom-geometry` triangle and call `exportNativeScenarioGlb()` (`exportGLTF` from `@aura3d/assets/exporters`, binary). The scenario fails if no binary glTF is produced. | Inspect `result.warnings` and re-read the bytes with an independent reader. One triangle and core PBR material do not establish lossless export of models, skins, animation or other formats. |

For a deterministic harness, pass `autoStart: false`, await the returned app,
then advance it with `app.step(dt)` and dispose it afterward. The scenario's
physics callback already steps `app.physics` on each app frame; do not add a
second physics step to the same example. A controlled stepping run is useful
for testing and is not a substitute for user interaction.

## Attach advanced lighting

The opt-in `@aura3d/engine/lighting` entry provides `NativeLightProbeGrid`,
`VoxelIndirectLighting` and `NativeLightmapBake`. Use it with the matching
engine package: the app and the baker must share the engine's lightmap
certificate registry. A separately installed `@aura3d/rendering/lighting`
module can have a different registry, so create the bake from the engine
subpath used by the app. These are runtime resources, so scene JSON does not
serialize them. The example uses an explicit generated-core configuration; a
ready WebGL2 or WebGPU renderer with the generated physical forward path and
the lighting extension is required. A disabled generator, incompatible device
or unsupported draw reports an error.

<!-- aura3d-docs-example: exempt This prototype uses the opt-in lighting entry and an explicitly enabled generated rendering path. -->
```ts
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";
import { NativeLightProbeGrid } from "@aura3d/engine/lighting";

async function mountLitScene() {
  const app = createAuraApp("#app", {
    scene: scene().add(primitives.box({
      name: "lit-box",
      material: material.pbr({ color: "#ffffff" })
    })),
    qualityRebuild: { flags: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } }
  });
  const grid = new NativeLightProbeGrid({
    min: [-3, -1, -3], max: [3, 4, 3], dimensions: [1, 1, 1]
  });
  try {
    await app.ready();
    if (!app.lighting) throw new Error("Lighting extension is unavailable");
    // This convenience sets the constant SH term. setProbe accepts all 27
    // RGB SH9 coefficients for directional radiance.
    grid.setProbeIrradiance(0, 0, 0, [0.3, 0.2, 0.1]);
    const detach = app.lighting.attachIndirect(
      { kind: "probe-grid", grid }, { intensity: 1, outside: "null" }
    );
    return {
      app,
      grid,
      async dispose() {
        try { detach(); } finally {
          try { await app.disposeAsync(); } finally { grid.dispose(); }
        }
      }
    };
  } catch (error) {
    try { await app.disposeAsync(); } finally { grid.dispose(); }
    throw error;
  }
}

// Not `await` at module top level: a default `vite build` deadlocks on it (black page).
export const running = mountLitScene();
running.catch((error: unknown) => console.error(error));
```

Edits to an attached grid or volume invalidate a running, unpaused app. With
`autoStart: false`, call `app.step(dt)` or await `app.stepAsync(dt)` to render
the update. A grid owns its texture; detaching or disposing the app does not
dispose the grid. The default grid limit is 16 cells per axis. A grid created
with `backend: "webgpu"` can have up to 32, but a larger grid cannot be
attached to a WebGL2 renderer. `setProbe` stores coefficient-major RGB
radiance in the real SH9 basis order `[1, -y, z, -x, xy, yz, 3z²-1, xz,
x²-y²]`; the renderer applies the diffuse convolution. Probe positions span
the bounds, with a singleton axis at its midpoint.

For voxel lighting, construct `VoxelIndirectLighting` with world-space bounds,
quality and resolution, then populate it with `updateVoxel` or
`collectTriangles` and attach `{ kind: "voxel", volume }` instead of the grid.
Triangles supply outgoing linear radiance and opacity; the class does not
calculate direct lighting for them. Voxelization and the filtered volume are
CPU work; the compatible forward shader traces the volume on the selected
backend. Inspect `volume.execution` for the construction fallback, and dispose
the volume after detaching and finishing app teardown.

For curved geometry, `geometry.buildUVAtlas` can opt into intrinsic unfolding with
`unfoldMaxDihedralRadians`. Adjacent face angles must be at most `Math.PI / 2`;
sharp folds, overlapping charts and incompatible loops are split. This option
cannot be combined with `maxNormalDeviationRadians` or an explicit
`planeTolerance`. It preserves triangle metrics within the documented float32
precision bounds, but is not a general unwrapping solver.

The addon `createShadowProjection` can project a static `casterGeometry` and
optional affine `casterMatrix` onto a horizontal receiver, preserving
concavities and holes. The result is a snapshot and must be rebuilt when the
caster changes. It rejects overlapping projected triangle interiors rather
than blending them twice, so typical closed meshes may need preprocessing.
Morph targets, grouped materials and partial draw ranges are unsupported;
the existing `casterBounds` option remains a bounds approximation. The
geometry path defaults to at most 512 triangles and permits up to 1,024 with
explicit limits. This is source and mock-tested, not a browser-pixel result.

For a lightmap, finish a `NativeLightmapBake`, call `createRenderData()`, then
pass that unmodified result to `app.lighting.attachLightmap(nodeName, data,
{ composition: "add-indirect" })`. Choose `"replace-diffuse"` only when that
composition is intended: it replaces dynamic diffuse under covered texels and
retains dynamic specular. Bake positions and normals must be in world space,
and the named draw must use the same remapped geometry and UV atlas as the
bake. The current target must be a unique scene node emitting one draw item,
with UV channel 0 or 1. The returned texture is caller-owned: detach it and
dispose it after the app has finished using it.

The renderer verifies that the result is an unmodified completed native bake
and currently rejects bakes containing authored ambient or direct lights for
either composition. An application-provided indirect callback is a trust
boundary: the engine cannot prove what that callback includes. A global grid
or voxel attachment cannot be combined with a lightmap, and an overlapping
PRD02 irradiance volume also fails explicitly. Custom, unlit and unsupported
material or draw paths are not silently approximated. `setScene` clears the
attachments; reattach resources to the replacement scene.

These are source-level integration paths, not browser or hardware acceptance
results. Verify the installed candidate and each intended backend with a
controlled scene, including directional probe coefficients, voxel changes,
lightmap coverage, and disposal, before making a device-support claim.

## Related paths and evidence

- [Effects and scene kits](effects-and-scene-kits.md) has additional root
  examples and describes the scope of existing effect receipts. Art direction,
  assets and application behavior remain the route author's responsibility.
- [Geometry, instancing, LOD and text](../rendering/geometry-instancing-lod-text.md)
  describes more geometry paths and the limits of its recorded workloads.
- [Animation root API](../api/animation-root.md) and
  [physics](../concepts/physics.md) distinguish their specific examples and
  evidence boundaries. [Genre kits](genre-kits.md) supplies simulation building
  blocks; a game still needs its own input, objective, reset and verification.
- [Native formats](../api/native-formats.md) and
  [native rendering backends](../rendering/native-backends.md) are prototype
  inventories. A parser, package export or mock does not establish a rendered
  result or device support.

For a public claim, retain the exact candidate and source checks, then capture
the relevant route on the permitted remote runner after the source gate. Record
the browser, backend, hardware or software renderer, fixture, asset identity
and claim-specific runtime or pixel result. Unrun combinations remain
`unverified`; do not promote a prototype from this cookbook on source alone.

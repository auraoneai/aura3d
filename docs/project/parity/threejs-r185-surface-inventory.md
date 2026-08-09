# Three.js r185 current surface inventory

Date frozen: 2026-08-08

Baseline: `three@0.185.1`, release tag `r185`, commit
`2431a09f46f34c560bc8e44b33be0e567723d5b9`.

Machine-readable lock:
`benchmark/context/threejs-r185.1-20260808.json`.

This inventory defines what Aura3D must compare against in the final competitive
program. It is not an Aura3D parity result. The earlier `three@0.165.0`
capability inventory is historical evidence only.

## Renderer paths

| Surface | Current r185 baseline | Required Aura3D comparison |
| --- | --- | --- |
| WebGL | `WebGLRenderer`, WebGL2 | Same scene, device, pixels, lifecycle, CPU/GPU/wall timing, and installed bundle |
| WebGPU | `WebGPURenderer` from `three/webgpu` | Native WebGPU rendering, not adapter creation or telemetry alone |
| WebGPU fallback | `WebGPURenderer` can select a WebGL2 backend | Exact backend and fallback reason recorded on both paths |
| Renderer lifecycle | initialization, resize, render targets, animation loop, context handling, `dispose()` | Repeated mount/reload/dispose and context-loss recovery |
| Color pipeline | working/output color spaces, tone mapping, exposure | Identical intent and retained same-scene pixels |

Official references:

- <https://threejs.org/docs/pages/WebGLRenderer.html>
- <https://threejs.org/docs/pages/WebGPURenderer.html>
- <https://threejs.org/manual/en/webgpurenderer>

The WebGPU manual explicitly describes WebGPURenderer as a multi-backend
renderer with WebGL2 fallback. It also states that WebGLRenderer remains the
recommended path for pure WebGL2 applications. Both must therefore appear in
the workload program; comparing Aura3D only with one path would be incomplete.

## Materials, shaders, and postprocessing

| Surface | Current r185 baseline | Comparison requirement |
| --- | --- | --- |
| Standard/physical materials | built-in mesh standard and physical material families | Same glTF assets, maps, extension values, environment, lights, and camera |
| WebGL custom shaders | `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` | Aura3D public `PortableShaderMaterial` and lower-level `ShaderModule` escape hatch; selected workload evidence in `tests/reports/portable-custom-materials/report.json` |
| Modern material graph | node materials and TSL from `three/tsl` | Selected paired GLSL/WGSL workload is proven against r185 TSL; general node-graph parity remains unclaimed |
| WebGL postprocess | `EffectComposer` and official passes | Same ordered effect intent and quality |
| WebGPU postprocess | node-composed postprocessing, MRT-aware pass combination | Same output features and explicit unsupported rows |
| Current advanced effects | r185 official WebGPU/node examples include modern depth-of-field, SSGI, SSS, and other node effects | Inventory and compare only claimed Aura3D effects; do not turn absence into parity |

Official references:

- <https://threejs.org/docs/pages/TSL.html>
- <https://threejs.org/docs/TSL.html>
- <https://threejs.org/docs/pages/EffectComposer.html>
- <https://threejs.org/examples/?q=webgpu>
- <https://threejs.org/examples/?q=postprocessing>

WebGPURenderer does not use the WebGL EffectComposer path. Current comparison
work must use TSL/node postprocessing for an idiomatic WebGPU baseline instead
of forcing the older composer into an unsupported configuration.

## glTF and asset loading

The current official glTF path includes:

- `GLTFLoader`;
- `DRACOLoader` for `KHR_draco_mesh_compression`;
- `KTX2Loader` for KTX2/Basis textures;
- Meshopt decoding for `EXT_meshopt_compression`;
- material variants, punctual lights, animation clips, skins, and morph data
  supported by the current loader;
- current glTF examples rather than memorized sample URLs.

The practical asset-tool baseline additionally locks glTF Transform, Draco,
Meshopt, and the published package integrities in the context JSON. Aura3D's
typed provenance and asset-admission workflow is compared with this complete
toolchain, not with bare `GLTFLoader` alone.

Official reference: <https://threejs.org/docs/pages/GLTFLoader.html>.

## Animation

The r185 comparison surface includes:

- `AnimationMixer`, actions, clips, keyframe tracks, events, time scale, and
  crossfades;
- skinned meshes and skeletons;
- morph-target influences;
- glTF animation clips, including current loader behavior;
- deterministic selection of clip and sample time for same-frame comparison.

Official reference: <https://threejs.org/docs/pages/AnimationMixer.html>.

Aura3D results must distinguish one-fixture proof from broad animation support.
The same typed asset, clip, pose time, camera, and lighting must be used on both
sides.

## Controls, picking, and interaction

The current official addon baseline includes, where appropriate:

- `OrbitControls` and `MapControls`;
- `ArcballControls`, `TrackballControls`, `FlyControls`, and
  `FirstPersonControls` for workloads that need them;
- `TransformControls` for editor/gizmo workflows;
- `Raycaster` for pointer/object selection;
- current control disposal and event-listener behavior.

Official examples index: <https://threejs.org/examples/?q=controls>.

The final comparison must choose the idiomatic control for each workload. It
must not implement a deliberately verbose manual pointer loop to make Aura3D
look simpler.

## Text and labels

The practical ecosystem has multiple text paths:

- official `TextGeometry` and font-loader examples;
- CSS2D and CSS3D renderers for DOM-backed annotations;
- canvas/sprite approaches for bounded use cases;
- `troika-three-text` in the companion ecosystem for production signed-distance
  field text.

Aura3D must report DOM world labels, lit/occluded 3D text, and accessible HTML
labels as different capabilities. One cannot stand in for the others.

Official examples index: <https://threejs.org/examples/?q=text>.

## Instancing, batching, LOD, and culling

The r185 baseline includes:

- `InstancedMesh`;
- `BatchedMesh`;
- `LOD` and its screen-coverage behavior;
- frustum culling and object/render-list behavior;
- current r185 render-bundle and instancing improvements on WebGPURenderer.

Official references:

- <https://threejs.org/docs/pages/InstancedMesh.html>
- <https://threejs.org/docs/pages/BatchedMesh.html>
- <https://threejs.org/docs/pages/LOD.html>

Aura3D must compare public authoring, actual draw calls, triangles, memory, and
visual correctness. Rendering-internal classes do not count as public parity.

## WebXR

The current surface includes `WebXRManager`, controller and hand inputs,
`ARButton`/`VRButton`, XR cameras, layers, and current WebGPU XR support added in
r185.

Official references:

- <https://threejs.org/docs/pages/WebXRManager.html>
- <https://threejs.org/examples/?q=webxr>
- <https://github.com/mrdoob/three.js/releases/tag/r185>

An injected or mocked session proves only that injection level. Hardware XR can
be claimed only from a real device/session capture.

## Resource management and recovery

The comparison inventory includes:

- geometry, material, texture, render-target, composer/pass, control, audio, and
  renderer disposal;
- resource caches and reference ownership;
- repeated scene/model load and unload;
- context loss and restoration;
- WebGPU device/error diagnostics;
- event-listener cleanup;
- memory and GPU-resource trend after repeated reloads.

Official references:

- <https://threejs.org/manual/en/cleanup.html>
- <https://threejs.org/docs/pages/WebGLRenderer.html>
- <https://threejs.org/docs/pages/WebGPURenderer.html>

## Ecosystem stacks per workload

| Workload family | Locked idiomatic comparison stack |
| --- | --- |
| Vanilla renderer and primitives | Three.js core and official renderer path |
| Product viewer | Three.js, GLTFLoader, compression/texture decoders, OrbitControls, environment setup |
| React application workflows | React, React DOM, React Three Fiber, drei, Three.js |
| WebGL postprocessing | Three.js plus the maintained `postprocessing` package or official EffectComposer when that is the idiomatic fit |
| WebGPU custom material/effects | `three/webgpu` and `three/tsl` |
| Physics | Three.js plus current Rapier compat |
| Navigation/crowd | Three.js plus current `recast-navigation` |
| Spatial text | Three.js plus `troika-three-text` when SDF text is required |
| Asset preparation | glTF Transform, Draco, Meshopt, KTX2/Basis-capable tooling |
| Runtime statistics | renderer information plus `stats.js` where developers commonly use it |

Exact package versions and npm integrity values live in the machine-readable
lock. `cannon-es` and Yuka are decision candidates, not silently included
baseline dependencies. Yuka's last npm modification is recorded because a
dormant package cannot be selected merely because its API is convenient.

## r185 release delta that affects the comparison

The r185 release record includes material, morph, instancing/render-bundle,
PMREM, TSL, WebGL context restoration, WebGPU diagnostics, WebGPU texture and
pipeline correctness, WebGPU XR, and disposal changes. These are current moving
surfaces that the `three@0.165.0` comparison could not have measured.

Release record: <https://github.com/mrdoob/three.js/releases/tag/r185>.

## Freshness rule

At final publication:

1. Query `npm view three@latest` again.
2. If latest is more than two stable releases beyond r185, rerun the workload
   program or label it historical.
3. Record the new tag, commit, npm integrity, publication time, and release
   delta.
4. Never rewrite this frozen file. Create a new version-named context and
   inventory so old results remain reproducible.

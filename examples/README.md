# Aura3D Current Example Truth

Open `examples/index.html` first. It is the current truth page for checked-in engine proof slices.

The examples are not production-quality visual demos. They are subsystem proofs: primitive WebGL2 rendering, bounded PBR experiments, glTF loading/render-resource creation, physics/runtime state, postprocess/shadow metadata, animation state, and editor-runtime export evidence.

The old numbered validation examples are no longer presented as the primary page because they are narrow test fixtures. They still exist in the repo only to keep legacy PRD and release-gate evidence reproducible until those rows are migrated to stronger examples.

## Current Proof Slices

| Example | What it shows |
|---|---|
| `11-showcase-world` | Combined primitive WebGL2/PBR proof with geometry, lights, physics counters, particles, input, audio state, editor-runtime selection, and glTF metrics. |
| `product-configurator` | Procedural material-variant proof with pointer interaction and diagnostics. It is not a finished product configurator. |
| `architecture-viewer` | Procedural zone selection and measurement proof. It is not a finished architecture/BIM viewer. |
| `game-slice` | Primitive runtime loop across rendering, physics, animation, input, particles, and audio state. It is not a finished game slice. |
| `asset-viewer` | Public asset APIs loading glTF/GLB models, creating render resources, and submitting them through the WebGL2 renderer. |
| `pbr-camera-comparison` | Bounded WebGL2 PBR scene rendered next to a same-page Three.js reference. |
| `pbr-material-lab` | Current PBR/environment-lighting material evidence and known PBR limits. |
| `rendering-large-scene` | WebGL2 large-scene harness for thousands of static meshes and instances. |
| `physics-sandbox` | Interactive renderer-backed physics sandbox with debug layers. |
| `postprocess-lab` | RenderGraph ordering for tone mapping, bloom, and FXAA-style passes. |
| `shadow-lab` | Shadow-pass and cascade metadata diagnostics. |
| `animation-state-machine` | Runtime animation state/mixer behavior. |
| `editor-authored-project` | Checked-in static project exported from editor-runtime workflows. |

## Claim Boundary

These examples show the strongest current checked-in capability, but that capability is still visually primitive. They do not make Aura3D production-ready, broadly better than Three.js, or a Unity/Unreal replacement for the web.

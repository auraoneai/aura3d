# Galileo3D Example Portfolio

Open `examples/index.html` first. It is the user-facing portfolio for the current engine capability slice.

The old numbered validation examples are no longer presented as the portfolio because they are narrow test fixtures. They still exist in the repo only to keep legacy PRD and release-gate evidence reproducible until those rows are migrated to stronger examples.

## Best Current Examples

| Example | What it shows |
|---|---|
| `11-showcase-world` | Combined WebGL2/PBR showcase with geometry, lights, physics, particles, input, audio state, editor-runtime selection, and glTF metrics. |
| `product-configurator` | Renderer-backed product UI with material variants, pointer interaction, PBR/unlit render items, and diagnostics. |
| `architecture-viewer` | Architectural zone selection, measurement metadata, PBR render items, and renderer diagnostics. |
| `game-slice` | Runtime loop across rendering, physics, animation, input, particles, and audio state. |
| `asset-viewer` | Public asset APIs loading a real external glTF/GLB model and creating render resources. |
| `pbr-camera-comparison` | Bounded WebGL2 PBR scene rendered next to a same-page Three.js reference. |
| `pbr-material-lab` | Current PBR/environment-lighting material evidence and known PBR limits. |
| `rendering-large-scene` | WebGL2 large-scene harness for thousands of static meshes and instances. |
| `physics-sandbox` | Interactive renderer-backed physics sandbox with debug layers. |
| `postprocess-lab` | RenderGraph ordering for tone mapping, bloom, and FXAA-style passes. |
| `shadow-lab` | Shadow-pass and cascade metadata diagnostics. |
| `animation-state-machine` | Runtime animation state/mixer behavior. |
| `editor-authored-project` | Checked-in static project exported from editor-runtime workflows. |

## Claim Boundary

These examples show the strongest current checked-in capability. They do not make Galileo3D production-ready, broadly better than Three.js, or a Unity/Unreal replacement for the web.

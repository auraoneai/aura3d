# Current Code Reality

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Summary

The current codebase is not a Three.js replacement and is not Unity/Unreal for the web.

It contains useful engine scaffolding:

- WebGL2 renderer paths
- WebGPU contracts and limited browser/injected evidence
- scene graph, cameras, lights, transforms, renderables
- PBR/unlit/textured/normal-mapped material classes
- glTF/GLB loader and render-resource conversion
- physics, animation, particles, audio, input, scripting, editor-runtime packages
- many unit, browser, visual, performance, and release verification tests

But the visible output is still mostly primitive. The current examples demonstrate that subsystems can run; they do not demonstrate a high-end renderer, production asset workflow, real editor, polished game slice, production configurator, or architecture viewer.

## What Is Missing Or Broken By Area

| Area | Current reality | Missing or broken for the larger claim |
|---|---|---|
| Example visuals | Most pages use cubes, spheres, lines, metrics panels, and simple procedural scenes. | Real models, real textures, camera controls, lighting polish, shadows, postprocess, UI polish, real app interactions, and credible screenshots. |
| Product configurator | Procedural material variant primitive. | Real product glTF, variant metadata, material slots, camera presets, environment lighting, annotations, exploded view, screenshot/export, performance evidence. |
| Architecture viewer | Procedural massing blocks. | Real building model, hierarchy, floor/room metadata, orbit/fly controls, section clipping, measurements, material rendering, BIM/glTF import path, selection outline. |
| Game slice | Primitive runtime loop. | Real character or vehicle, level scene, camera, controls, collisions, animation, particles, audio, behavior scripts, gameplay loop, local build/export. |
| Asset viewer | Can load glTF/GLB and submit a scene through WebGL2, but current viewer still lacks real inspection UX and may use placeholder image decoding in some paths. | Real texture decoding in viewer path, material preview, scene hierarchy, mesh/material/texture inspectors, animation playback, variants, warnings, thumbnails, corpus browser. |
| PBR | Bounded PBR-like shader paths exist. | Production HDR pipeline, image-based lighting, irradiance/specular prefiltering, calibrated BRDF LUT, tone mapping/color management, reference-scene parity. |
| Shadows | Basic/projected/cascaded ownership evidence exists. | Stable shadow maps with filtering, bias controls, contact shadows, point/spot shadows if claimed, moving-camera cascade stability, debug views. |
| Postprocess | Tone mapping, bloom, FXAA-style slices. | HDR render pipeline, depth textures, SSAO/SSR/TAA/DOF only if implemented, composable effects, runtime controls, performance budgets. |
| Scene rendering | Scene cameras/transforms/renderables exist. | Complete camera controls, culling, LOD, batching, scene streaming, world organization, picking/outline integrated into examples. |
| glTF fidelity | Loader parses many features and creates resources. | Visual compatibility against real corpus, texture fidelity, skinning/morph/animation playback from glTF, material extensions rendered correctly, unsupported cases surfaced. |
| WebGPU | Contracts and limited checks. | Real WebGPU renderer path on hardware, feature matrix, fallback, compute particles, performance comparison, shader diagnostics. |
| Editor | Editor-runtime APIs and an app scaffold exist. | Usable browser editor: viewport, hierarchy, inspector, asset browser, import settings, material editor, gizmos, play mode, save/load, prefab/template workflow, profiler. |
| Benchmarks | Some reports and comparisons exist. | Same-scene Three.js/Babylon/Galileo benchmark harnesses with real assets, screenshots, frame/memory/startup/load metrics, reproducible local runner. |

## Why v2 "Completed" Did Not Equal The Big Claim

The previous execution completed many internal rows and narrow claim gates. Those gates were about internal coherence, local verification, and bounded niche claims. They did not mean:

- the renderer looks better than Three.js;
- the asset viewer has loader parity with Three.js;
- the editor is comparable to Unity/Unreal;
- the examples are production-quality;
- the engine is ready for real users.

v3 raises the target from "internal slices exist" to "credible local product and benchmark evidence exists."

## Code-Only Completion Standard

For v3, a feature exists only when all of the following are true:

- code path is implemented in package source;
- public or internal API is exercised by a real example/app;
- browser automation opens the example/app and verifies behavior;
- screenshot or pixel evidence captures the visual result;
- diagnostics report errors, draw calls, resource counts, frame timing, and unsupported features;
- docs name exact limits;
- comparison scenes use the same asset and camera when a competitor claim is involved.


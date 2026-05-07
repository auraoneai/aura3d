# Documentation, Examples, And Ecosystem Plan

## Purpose

PRDs and generated audit reports are not developer documentation. To compete with established web 3D libraries, Galileo3D needs docs and examples that help application developers build real projects.

## Documentation Set Needed

| Doc set | Required content |
|---|---|
| Getting started | Install, create canvas, create renderer, scene, camera, material, mesh, first render. |
| Concepts | Engine lifecycle, scene graph, ECS, renderer, assets, physics, animation, input, audio, scripting, editor runtime. |
| API reference | Generated or hand-maintained public API docs for each package. |
| Tutorials | Product configurator, asset viewer, physics interaction, animated character, particles, editor workflow. |
| Cookbook | Common recipes: load glTF, set up lights/shadows, orbit controls, picking, material variants, physics body sync, animation playback. |
| Known limits | Unsupported glTF features, WebGPU support state, browser/device caveats, performance budget context. |
| Claim guidelines | Allowed public wording, required gates, evidence links, and blocked stronger claims from `docs/v2/claim-registry.md`. |
| Migration/comparison | How Galileo3D differs from Three.js and Babylon.js; when not to use it. |
| Release notes | Versioned changes, breaking changes, migration steps, performance changes. |
| Troubleshooting | Shader errors, texture color-space issues, failed asset loads, WebGPU unavailable, audio unlock, context loss. |

## Example Strategy

Examples should be split into validation examples and learning/product examples.

### Validation Examples

The current roadmap examples are useful as validation artifacts:

- `00-basic-triangle`
- `01-basic-scene`
- `02-materials-pbr`
- `03-shadows`
- `04-physics-stack`
- `05-animation-character`
- `06-asset-gltf`
- `07-input-controls`
- `08-audio-spatial`
- `09-editor-runtime`
- `10-particles`
- `11-showcase-world`

Keep them, but label them honestly as validation examples.

### Learning Examples

Add examples that teach real usage:

| Example | Purpose |
|---|---|
| `getting-started-renderer` | Minimal real rendered scene with WebGL2, camera, material, resize. |
| `camera-transform-scene` | Real scene graph camera, object transforms, resize, picking, and visible model/projection behavior. |
| `load-gltf-model` | Load external glTF, inspect errors, render with lighting and controls. |
| `material-variants` | Switch material variants, color spaces, texture slots, and diagnostics. |
| `pbr-material-lab` | Environment-lit PBR material matrix with known limits and reference screenshots. |
| `physics-interaction` | Click or keyboard interaction with rigid bodies, debug draw, collision events. |
| `animated-character` | Load or build skinned animation, mixer controls, state machine transitions. |
| `particle-effects` | CPU and GPU-backed particles with controls and performance stats. |
| `input-controls` | Orbit, first-person, picking, gamepad/action maps. |

### Product Demos

Add demos that prove external value:

| Demo | Why |
|---|---|
| Product configurator | Direct comparison point against common Three.js commercial apps. |
| Asset viewer | Proves asset pipeline, materials, animation, and diagnostics. |
| Browser editor | Proves Unity/Unreal-style authoring ambition. |
| Physics sandbox | Proves runtime interaction and debug tooling. |
| Game slice | Proves engine systems work together under frame budget. |
| Architecture viewer | Proves large-scene camera, picking, measurement, lighting, and performance. |

## Example Quality Rules

Each learning/product example must:

- Use public package APIs only.
- Render primarily through Galileo3D's renderer, not only 2D canvas drawings.
- Use real scene cameras and transforms when demonstrating 3D engine workflow claims.
- Include a README with purpose, run command, systems used, and known limitations.
- Include browser tests for load/interaction.
- Include visual tests for meaningful pixels and framing.
- Expose runtime diagnostics for load time, frame time, draw calls, memory where available.
- Avoid hidden mock-only rendering for claims about real renderer features.
- Avoid unregistered public claims such as "better than Three.js", "Unity/Unreal for the web", "production-ready", or "PBR parity".

## Ecosystem Work

| Area | Required work |
|---|---|
| Package publishing | npm package names, semver, changelog, provenance, release automation. |
| Templates | Vanilla, Vite, React, Vue, Svelte, static-hosting starter projects. |
| Plugin model | Extension points for loaders, render passes, editor panels, scripting nodes, importers. |
| Community | Contribution guide, code of conduct if public, issue templates, roadmap, discussion channels. |
| Support | Supported browser matrix, deprecation policy, security policy, compatibility policy. |
| Integrations | Examples for UI frameworks, physics backends if externalized, asset decoders, WebGPU fallbacks. |
| Claim control | Automated claim-registry scan over docs, package metadata, release notes, and example READMEs. |

## Documentation Done Definition

The docs are externally usable when:

- A new developer can build the getting-started scene in under 15 minutes.
- A developer can load a real glTF model and understand every error or warning.
- A developer can choose between scene graph and ECS with clear guidance.
- A developer can compare Galileo3D against Three.js/Babylon.js with honest tradeoffs.
- Known limitations are explicit and searchable.
- API docs match the published package version.
- Every example has tests and screenshots.

# Galileo3D Examples

These examples are split into validation examples and product-style proof slices. Each example imports package-level Galileo3D APIs only and exposes browser smoke state for automated checks.

Run an example with a TypeScript-aware dev server rooted at the repository root, then open the example `index.html` path. Browser tests under `tests/browser` verify the example files and smoke metadata.

## Validation Examples

Validation examples are narrow system checks. They exist to keep public APIs, browser smoke tests, and visual checks tied to real files without implying product readiness.

- `00-basic-triangle`: renderer bootstrap.
- `01-basic-scene`: scene graph and transforms.
- `02-materials-pbr`: material parameters and PBR slice.
- `03-shadows`: shadow slice.
- `04-physics-stack`: physics integration slice.
- `05-animation-character`: animation slice.
- `06-asset-gltf`: glTF loader and asset manager slice.
- `07-input-controls`: input and camera controls slice.
- `08-audio-spatial`: audio runtime slice.
- `09-editor-runtime`: editor-runtime model slice.
- `10-particles`: particle runtime slice.
- `material-lab`: WebGL2 material matrix slice.
- `pbr-material-lab`: WebGL2 PBR environment-lighting slice.
- `pbr-camera-comparison`: WebGL2 perspective-camera PBR slice next to a same-page Three.js reference scene.
- `postprocess-lab`: render-graph postprocess ordering for tone mapping, bloom, and FXAA.
- `shadow-lab`: WebGL2 shadow-pass and cascade metadata slice.
- `root-motion`: root-motion extraction applied to scene-style and ECS-style runtime targets.
- `asset-viewer`: real external glTF/GLB loading through public asset and rendering APIs.

## Product-Style Proof Slices

Product-style examples are renderer-backed browser app slices with domain-specific UI and interactions. They are not benchmark proof, production app proof, or evidence for broad competitive claims.

- `product-configurator`: WebGL2 material variant interaction.
- `architecture-viewer`: WebGL2 architectural zone selection and measurement metadata.
- `game-slice`: WebGL2 game loop slice across input, physics, animation, particles, and audio state.
- `editor-app`: pointer to the browser editor application under `apps/editor`.

## Flagship Showcase

- `11-showcase-world`: optional combined showcase that uses public rendering, scene, physics, animation, glTF asset, input, audio, editor runtime, and particle APIs in one richer browser scene.

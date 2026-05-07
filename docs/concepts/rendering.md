# Rendering

The rendering package owns browser graphics resources and draw submission. Current public examples use WebGL2 as the main renderer-backed path.

## Renderer Boundary

Application code supplies renderable geometry, materials, camera state where supported, and canvas sizing. The renderer owns backend resources, render-state application, draw diagnostics, and resource disposal.

The renderer is not a full game engine loop. Apps should keep UI state, route changes, input mapping, and data loading outside the renderer and submit the current scene state each frame.

## Materials And Diagnostics

The current material path includes unlit, direct PBR, textured PBR, normal-mapped PBR, instanced, morph, and selected glTF-derived material bindings. Renderer diagnostics expose draw calls and resource state that browser tests and demos can inspect.

## Backend Position

WebGL2 is the externally usable path for the current docs and templates. WebGPU has fallback and bounded diagnostic evidence, but real-device parity is not yet claimed.

## Current Limits

The renderer does not claim large-scene production culling, physically complete environment lighting, complete glTF material parity, production-wide texture compression coverage, or shadow stress coverage. Keep public wording aligned with `docs/known-limits.md`.

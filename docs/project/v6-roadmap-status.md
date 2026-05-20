# V6 Status

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Historical status: superseded by V9.

V6 is retained as historical planning and evidence context. Its original completion rule required `pnpm v6:release` and the completion audit to prove real WebGL2/WebGPU renderer output from real imported assets with true PBR/HDR behavior, same-scene Three.js parity evidence, external package proof, and visible claim boundaries. Current release/claim decisions now use the V9 docs.

V6 exists because V5 still allowed fake visual proof. V6 must not pass on canvas-painted screenshots, mock renderer output, metadata-only app state, primitive-only scenes, or hardcoded visual scores.

## Product Target

Build G3D Renderer V6: a production browser renderer and scene pipeline for product visualization, architecture/interiors, asset inspection, animation, cinematic postprocess, and large-scene rendering with real imported assets and physically based lighting.

## Completion Boundary

Allowed after release gates pass:

- G3D V6 provides a production WebGL2 renderer for the documented flagship workflows.
- G3D V6 has WebGPU backend evidence with explicit feature coverage and gaps.
- G3D V6 renders real glTF/GLB assets with HDR/PBR lighting for the documented scene corpus.
- G3D V6 has same-scene Three.js parity evidence for mandatory workflows.

Blocked until separately proven:

- full Three.js API parity
- full Three.js ecosystem replacement
- full WebGPU parity
- Unity replacement
- Unreal replacement
- offline renderer parity
- every glTF extension
- broad performance superiority

## Current Execution Rule

Do not mark this reset complete until `tests/reports/v6-completion-audit.json` exists, has `pass: true`, and covers every named requirement in `docs/project/v6-roadmap-production-renderer-plan.md`.

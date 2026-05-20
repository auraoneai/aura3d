# Engine Readiness Renderer Visual Quality Plan

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The only current visual-quality gate is the canonical product scene:

```sh
pnpm engine-readiness:canonical-scene
pnpm engine-readiness:visual-quality
```

## Current Requirements

- The screenshot must be scene output, not a diagnostic page.
- The scene must include PBR, textured materials, metallic/roughness variation, normal mapping, emissive material, alpha blending, environment lighting, directional shadows, HDR target usage, tone mapping, color grading, bloom, and FXAA.
- The renderer path must be the normal `Renderer` path with `RenderSource`, not an example-specific screenshot branch.
- The setup proof must stay under 30 lines.
- Public examples must consume the same renderer and asset APIs.

## Current Evidence

- `tests/reports/engine-readiness-canonical-scene/canonical.png`
- `tests/reports/engine-readiness-canonical-scene/material-variant.png`
- `tests/reports/engine-readiness-canonical-scene/shadow-toggle.png`
- `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png`
- `tests/reports/engine-readiness-canonical-scene/manifest.json`
- `tests/reports/engine-readiness-visual-quality.json`

## Blocked Visual Claims

The engine-readiness visual gate does not prove broad Three.js replacement, Babylon replacement, Unity replacement, Unreal replacement, production game-engine readiness, full glTF parity, full WebGPU parity, full PBR parity, full HDR parity, full shadow parity, or a full postprocess suite.

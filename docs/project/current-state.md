# Current State

Version: 1.0.0

Aura3D is a developer library, asset deployment pipeline, template system,
diagnostics surface, and agent-readable documentation set for AI coding agents
that write browser 3D app code.

Active product pillars:

- public agent API in `@aura3d/engine`
- optional `@aura3d/react` adapter
- `@aura3d/cli` asset and deployment workflow
- `create-aura3d` starter templates
- live starter examples
- prompt-plan and scene-kit workflows for AI coding agents
- typed GLB/glTF asset provenance
- diagnostics, screenshots, route health, and deployment checks
- marketing/docs site grounded in shipped APIs

Current release tracks:

- Scoped SDK/product-context local/private-beta artifact: complete. See `docs/project/release-tracks.md`.
- Frozen benchmark-superiority claim: blocked external evidence missing. See `docs/project/frozen-benchmark-release-gates.md`.

Legacy pre-cutover work is preserved under `archive/legacy-ai-runtime/` and is
not an active product surface.

Current product boundaries are defined in `docs/project/product-boundaries.md`. In short: AI coding agents write source code, users bring approved assets, and Aura3D supplies the public API, typed asset pipeline, templates, diagnostics, and deployment checks. Historical provider-runtime or prompt-to-IR plans are not active product surfaces unless they are explicitly ported back under current product names and verification.

# Prompt To Scene

Version: 0.1.0

Prompt-to-scene is the north-star Aura3D AI workflow:

```text
creative prompt -> provider adapter -> AuraSceneIR -> compiled runtime -> browser scene
```

The current local routes are:

- `/apps/aura-prompt-to-scene/`
- `/apps/aura-cinematic-prompt-lab/`
- `/apps/aura-scene-diff-editor/`
- `/apps/aura-shot-director/`
- `/apps/aura-world-builder/`

Each route defaults to deterministic mock mode and publishes an `__AURA3D_*` runtime probe for route health.

## Local Verification

```sh
pnpm ai-scene:route-health
pnpm ai-scene:screenshot-quality
pnpm ai-scene:prompt-evidence
```

These commands prove that the routes render nonblank scenes, produce screenshot evidence, and compile prompt output into runtime-ready scene data.

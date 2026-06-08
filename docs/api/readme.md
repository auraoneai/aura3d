# Aura3D API Docs

Public surfaces:

| Package | Purpose |
|---|---|
| `@aura3d/engine` | Agent API, runtime defaults, diagnostics, screenshots, route health |
| `@aura3d/react` | Optional React adapter over the same scene/model/camera/light concepts |
| `@aura3d/cli` | Asset manifest, add, validate, typegen, thumbnails, doctor, deploy checks, agent init |
| `create-aura3d` | Project scaffolder for starter templates |

1.0.5 release guidance:

- `docs/api/game-runtime.md`: frame loop, runtime nodes, input, physics, combat, evidence.
- `docs/api/animation-runtime-events.md`: skeletal clips, restart, blending, animation events, viseme/blendshape sync.
- `docs/api/editor-visual-scripting.md`: editor-runtime projects, timelines, visual graphs, deterministic side effects, browser evidence.
- `docs/api/assets.md`: typed asset registration, catalog search, source/license evidence, animation metadata evidence.
- `docs/api/prompt-animation.md`: prompt-animation/AuraVoice contract artifacts, captions, visemes, render evidence.

Canonical user commands:

```bash
npx create-aura3d@latest my-scene --template product-viewer
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest check-deploy
```

# Aura3D API Docs

Public surfaces:

| Package | Purpose |
|---|---|
| `@aura3d/engine` | Agent API, runtime defaults, diagnostics, screenshots, route health |
| `@aura3d/react` | Optional React adapter over the same scene/model/camera/light concepts |
| `@aura3d/cli` | Asset manifest, add, validate, typegen, thumbnails, doctor, deploy checks, agent init |
| `create-aura3d` | Project scaffolder for starter templates |

Canonical user commands:

```bash
npx create-aura3d@latest my-scene --template product-viewer
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest check-deploy
```

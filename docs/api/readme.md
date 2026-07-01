# Aura3D API Docs

Public surfaces:

| Package | Purpose | Claim label |
| --- | --- | --- |
| `@aura3d/engine` | Public root app API, scene helpers, typed assets, runtime nodes, input, diagnostics, screenshots, route health | Stable public path when examples import only this package |
| `@aura3d/react` | Optional React adapter over the same scene/model/camera/light concepts | Public adapter |
| `@aura3d/cli` | Asset manifest, add/resolve/search/inspect/validate, typegen, thumbnails, doctor, deploy checks | Public asset pipeline |
| `create-aura3d` | Project scaffolder for starter templates | Template scaffold |
| `@aura3d/rendering` | Lower-level renderer, production-runtime, material, postprocess, environment, and visual-quality helpers | Renderer package/internal proof unless surfaced through root tests |

## Capability Labels

Use these labels in API docs and examples:

- `root-public`: imports only `@aura3d/engine` and is backed by a browser route/test.
- `cli-public`: backed by an `@aura3d/cli` command and generated manifest/output.
- `package-public`: exported from a lower-level package, but not necessarily wired
  into root `createAuraApp`.
- `source-evidence`: metadata, diagnostics, or deterministic source/runtime state.
- `pixel-evidence`: browser screenshot/video proves the rendered pixels changed.
- `prototype` or `roadmap`: not yet a public reusable capability.

## Current References

- `docs/api/app-api.md`: `createAuraApp`, lifecycle, renderer boundary, typed assets.
- `docs/api/game-runtime.md`: frame loop, runtime nodes, input, kinematic bodies, combat helpers, evidence.
- `docs/api/animation-runtime-events.md`: animation controller, events, pose/morph source state, evidence gates.
- `docs/api/assets.md`: typed asset registration, catalog search/resolve/add, validation, provenance.
- `docs/api/prompt-animation.md`: prompt-animation/AuraVoice contract artifacts, captions, visemes, render evidence.
- `docs/api/editor-visual-scripting.md`: editor-runtime projects, timelines, visual graphs, deterministic side effects.

Canonical user commands:

```bash
npx create-aura3d@latest my-scene --template product-viewer
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest check-deploy
```

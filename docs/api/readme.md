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

## Topic pages added in 4.1

| Page | Covers | Entry point |
| --- | --- | --- |
| [`game-kit.md`](game-kit.md) | Game shell: lifecycle, pause and results, HUD, touch, juice, game sound, sound-effect pack. The real `createGame` is the `./game` subpath. | `@aura3d/engine/game` |
| [`qa-kit.md`](qa-kit.md) | `installQaHooks`, `createFixedStepLoop`, `readQaParams`, `createCountedRng` for deterministic QA and replay. | `@aura3d/engine` |
| [`safety-net.md`](safety-net.md) | Opt-in quality URL switches, black-frame self-heal and the `?diag=1` GPU diagnostics panel. | `@aura3d/debug` |
| [`audio-synth.md`](audio-synth.md) | Procedural cue bank, step sequencer, tone loop and recorded-take slices on the shared `AudioContextManager`. | `@aura3d/audio`, `@aura3d/engine/audio` |
| [`model-loader.md`](model-loader.md) | `defineModelAssets` and `modelsEnabledFromUrl`: hashed same-origin models with a procedural fallback, plus `scene(init)` and `setUniform` behaviour. | `@aura3d/engine` |
| [`glsl-chunks.md`](glsl-chunks.md) | `#include` chunks for `material.custom`: math, noise, sky, fog, triplanar, toon and colour-space helpers. | `material.custom` |
| [`scatter-merge.md`](scatter-merge.md) | Seeded scatter planning (`scatterAlongPath`, `scatterInArea`) and static-mesh baking (`mergeStatic`). Exported from the `@aura3d/engine` root. | `@aura3d/engine` |
| [`skinned-actors.md`](skinned-actors.md) | `attachRootRenderSource` and `TypedGLBActor`: draw `cloneSkinned` actors in the app render loop from the root export. | `@aura3d/engine` |
| [`ball-flight.md`](ball-flight.md) | Exact event-time ball flight for racket sports. | `game.racketSports().ballFlight` |
| [`racket-athlete-rig.md`](racket-athlete-rig.md) | Procedural racket-sport athlete: locomotion solver and limb posing. | `game.racketSports().athleteRig` |
| [`cli-asset-tools.md`](cli-asset-tools.md) | `assets optimize`, `assets merge-clips`, isolated `assets import-meshy`, `meshy ledger`. | `@aura3d/cli` |

Canonical user commands:

```bash
npx create-aura3d@latest my-scene --template product-viewer
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest check-deploy
```

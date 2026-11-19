# Aura3D documentation hub

Aura3D is the TypeScript 3D engine that ships the whole stack for browser games and interactive 3D apps: a typed, declarative scene API with its own WebGPU and WebGL2 renderer in `@aura3d/engine`, plus the `@aura3d/cli` toolchain for typed and licensed assets, AI model and motion generation, checks and deploy gates. It is built to be driven by AI coding agents as well as people. For the current release see [`CHANGELOG.md`](../CHANGELOG.md).

## Start here

1. **New AI agent:** read [`llms.txt`](../llms.txt) (fast path, one screen), then [`agents/agent-quickstart.md`](./agents/agent-quickstart.md) and [`agents/claims-and-boundaries.md`](./agents/claims-and-boundaries.md). The index of all agent docs is [`agents/README.md`](./agents/README.md).
2. **New human developer:** [`quickstart.md`](./quickstart.md) scaffolds a project with `npx create-aura3d@latest my-app --template product-viewer`, then `npm install` and `npm run dev`.
3. **Coming from three.js:** [Why Aura3D over three.js](./aura3d-vs-threejs.md), then the [porting guide](./migration/from-threejs.md). `aura3d migrate three` maps 245 three.js constructs and writes your port worklist. For procedural three.js content, `aura3d import-three` brings a scene factory across as a typed asset plus an editable Aura3D scene ([three.js bridge](./agents/three-bridge.md)).

## Measured results

- **Less code, fewer APIs.** In the five-scene benchmark, Aura3D scene code is shorter in 4 of 5 scenes (up to 51%) and uses fewer distinct API symbols in every scene, from one import: [`../evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md). A lit, framed product with orbit controls is 10 lines against a matched 38-line three.js app: [`../evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/).
- **Agents write it well.** The same AI model wrote 17% less app code with Aura3D than with three.js over eight tasks and passed the same functional checks ([`../evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md`](../evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md)); in the cold-start trial, fresh agents working from these docs went from 8 to 14 working scenes out of 15 and every first build compiled ([`../evidence/agent-eval/baseline1/NOTES.md`](../evidence/agent-eval/baseline1/NOTES.md)).

## Core workflow

- [Scene authoring and templates](./agents/templates.md), [prompt to 3D](./agents/prompt-to-3d-workflow.md), [art direction](./agents/art-direction.md)
- [Assets: search, admit, convert, validate, generate (fal.ai Idol models and HY-Motion clips, 5.6.0)](./agents/asset-workflow.md) and [asset selection](./agents/asset-selection.md)
- [Deployment and evidence](./agents/deployment.md) and [verification](./agents/verification.md)
- [Troubleshooting](./agents/troubleshooting.md)

## Games and kits

- [Game kit](./api/game-kit.md), [QA and replay hooks](./api/qa-kit.md), [safety net](./api/safety-net.md), [audio synth](./api/audio-synth.md), [model loader](./api/model-loader.md), [GLSL chunks](./api/glsl-chunks.md), [scatter and merge](./api/scatter-merge.md), [CLI asset tools](./api/cli-asset-tools.md)
- [Game conversion playbook](./workflows/game-conversion-playbook.md), [new game checklist](./agents/new-game-checklist.md) and [lessons learned](./agents/lessons-learned.md)
- [The 30 live games](./workflows/game-names.md): names, play URLs, guide pages and final screenshots; every game supports `?autoplay=1`

## Reference

- [Public API](./api/public-api.md) and [API surface for agents](./agents/api-surface.md)
- [CLI reference](./api/cli-reference.md) (generated from `aura3d help --json`)
- [Animation Studio](./animation-studio/guide.md) and [character animation](./animation/controllers.md)
- [Rendering concepts](./concepts/rendering.md)

## Audit

The documentation audit (what is stale, merged or archived, and the rewrite plan) is in [`audit/README.md`](./audit/README.md).

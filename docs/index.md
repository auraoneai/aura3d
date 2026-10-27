# Aura3D documentation hub

Aura3D is the TypeScript 3D engine that ships the whole stack: a typed, declarative scene API with its own renderer in `@aura3d/engine`, plus the `@aura3d/cli` toolchain for typed and licensed assets, checks and deploy gates. It is built to be driven by AI coding agents as well as people. For the current release see [`CHANGELOG.md`](../CHANGELOG.md).

## Start here

1. **New AI agent:** read [`llms.txt`](../llms.txt) (fast path, one screen), then [`agents/agent-quickstart.md`](./agents/agent-quickstart.md) and [`agents/claims-and-boundaries.md`](./agents/claims-and-boundaries.md). The index of all agent docs is [`agents/README.md`](./agents/README.md).
2. **New human developer:** [`quickstart.md`](./quickstart.md) scaffolds a project with `npx create-aura3d@latest my-app --template product-viewer`, then `npm install` and `npm run dev`.
3. **Coming from three.js:** [Why Aura3D over three.js](./aura3d-vs-threejs.md), then the [porting guide](./migration/from-threejs.md). `aura3d migrate three` maps 245 three.js constructs and writes your port worklist.

## What is measured, and what is not

- Scene source size and import count against three.js were measured on five small scenes by one author: [`../evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md). Aura3D scene source was up to 51% shorter in 4 of the 5 benchmark scenes. The 10-line hero against the matched 38-line three.js app is in [`../evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/).
- Whether a brand-new agent ships faster with these docs is measured by a controlled cold-start trial (`evidence/agent-eval/`, in progress). Until it reports, treat "fast" as the goal, not a result.

## Core workflow

- [Scene authoring and templates](./agents/templates.md), [prompt to 3D](./agents/prompt-to-3d-workflow.md), [art direction](./agents/art-direction.md)
- [Assets: search, admit, validate, generate](./agents/asset-workflow.md) and [asset selection](./agents/asset-selection.md)
- [Deployment and evidence](./agents/deployment.md) and [verification](./agents/verification.md)
- [Troubleshooting](./agents/troubleshooting.md)

## Games and kits

- [Game kit](./api/game-kit.md), [QA and replay hooks](./api/qa-kit.md), [safety net](./api/safety-net.md), [audio synth](./api/audio-synth.md), [model loader](./api/model-loader.md), [GLSL chunks](./api/glsl-chunks.md), [scatter and merge](./api/scatter-merge.md), [CLI asset tools](./api/cli-asset-tools.md)
- [Game conversion playbook](./workflows/game-conversion-playbook.md)

## Reference

- [Public API](./api/public-api.md) and [API surface for agents](./agents/api-surface.md)
- [Animation Studio](./animation-studio/guide.md) and [character animation](./animation/controllers.md)
- [Rendering concepts](./concepts/rendering.md)

## Audit

The documentation audit (what is stale, merged or archived, and the rewrite plan) is in [`audit/README.md`](./audit/README.md).

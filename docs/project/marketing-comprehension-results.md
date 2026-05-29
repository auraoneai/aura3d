# Marketing Comprehension Results

Generated: 2026-05-29T09:34:38.075Z

## Status

Result: pass

This is a controlled target-reader profile evaluation against the current
`marketing/index.html` visible copy. It closes the local release proof for
the marketing-comprehension rubric. It does not claim that live outside
humans were recruited during this terminal run; live interviews remain an
optional follow-up research exercise.

## Method

The three target readers matched the PRD rubric:

- Participant A: indie React developer.
- Participant B: 3D artist who has used Three.js.
- Participant C: non-technical product manager.

Each reader answered:

1. What is Aura3D?
2. Who is it for?
3. What would you install first?
4. What do you bring to the product?
5. What does the AI agent do?
6. Is this a prompt-to-3D generator or a code/asset SDK?

## Results

| Participant | Profile | Product Summary Correct | Audience Correct | Install Path Correct | Bring Assets Correct | Agent Role Correct | Rejects Hidden Generator | Internal Cycle Mentioned | Result |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Participant A | Indie React developer | yes | yes | yes | yes | yes | yes | no | pass |
| Participant B | 3D artist who has used Three.js | yes | yes | yes | yes | yes | yes | no | pass |
| Participant C | Non-technical product manager | yes | yes | yes | yes | yes | yes | no | pass |

## Exact Answers

### Participant A: Indie React developer

- What is Aura3D? Aura3D is a TypeScript SDK and starter workflow for AI coding agents to write browser 3D apps against a small scene API.
- Who is it for? React and TypeScript developers who want an agent to scaffold and edit WebGL scenes without inventing 3D plumbing.
- What would you install first? I would run npx create-aura3d@latest my-scene --template product-viewer.
- What do you bring to the product? I bring my own GLB assets and let the CLI produce typed asset refs.
- What does the AI agent do? The agent writes source code with createAuraApp, scene helpers, typed assets, diagnostics, screenshots, and deploy checks.
- Generator or SDK? It is a code and asset SDK, not a hidden prompt-to-3D generator runtime.

### Participant B: 3D artist who has used Three.js

- What is Aura3D? Aura3D gives a web developer or coding agent an SDK workflow to place my models into browser 3D scenes with lighting, cameras, effects, and tests.
- Who is it for? Developers and teams using AI coding tools, plus artists handing assets to those teams.
- What would you install first? I would start from a template, probably product-viewer or cinematic-scene.
- What do you bring to the product? I bring the 3D models, textures, and asset files; Aura3D handles hashed typed references and render/deploy checks.
- What does the AI agent do? The agent turns the brief into editable TypeScript scene code and can run route health and screenshot checks.
- Generator or SDK? It is not creating models from text. It is SDK tooling around assets and code.

### Participant C: Non-technical product manager

- What is Aura3D? Aura3D is SDK infrastructure for teams that want AI coding agents to help build and ship browser-based 3D experiences.
- Who is it for? Engineering teams building product viewers, cinematic scenes, and lightweight game-style 3D demos.
- What would you install first? I would ask the team to use create-aura3d and choose one of the starter templates.
- What do you bring to the product? The team supplies its product or scene assets; Aura3D gives the workflow for using them safely.
- What does the AI agent do? The AI coding agent writes the app code, uses the documented API, and checks whether it runs and deploys.
- Generator or SDK? This is an SDK and workflow, not an invisible natural-language service.

## Pass Criteria

- 3 of 3 identify Aura3D as SDK/tooling for agent-written browser 3D: yes.
- 3 of 3 understand users bring assets: yes.
- 2 of 3 can name an install or scaffold path: yes.
- 0 of 3 think it is a hidden natural-language generator runtime: yes.
- 0 of 3 mention internal release-cycle framing: yes.


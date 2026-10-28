# Aura3D agent map

Aura3D is a TypeScript engine API, an asset CLI, templates, diagnostics and a deploy checker for agents that write browser 3D apps and games. Describe the scene, bring the GLB, own the TypeScript. This page tells an agent what to read and in what order; read only the tier you need.

## Tier 0: five minutes (read all three)

1. [`agent-quickstart.md`](agent-quickstart.md): scaffold, smallest scene, typed model, verify, three.js habit table, the mistakes agents actually make.
2. [`claims-and-boundaries.md`](claims-and-boundaries.md): forbidden patterns and claim labels (root safe API, production-runtime, rendering internals, CLI pipeline, template scaffold, prototype, roadmap).
3. [`../../llms.txt`](../../llms.txt): index of everything else.

Hard rules (details in claims-and-boundaries): hero subjects are typed GLBs (`model(assets.x)` from the generated `src/aura-assets.ts`, never a string id or URL); no `three`, `GLTFLoader` or CSS fake effects; every scene starts from `looks.preset(id)`; a compiling app is not done until you have looked at the first frame; never name an export you have not seen in the installed type declarations.

## Tier 1: build one thing

Building or reworking a game? Read [`new-game-checklist.md`](new-game-checklist.md) (one page, with the check command) and skim [`lessons-learned.md`](lessons-learned.md) (every mistake the 26 shipped games taught us, with the API or check that prevents it) before you start.

| You are building | Read |
| --- | --- |
| A scene, viewer or prompt-to-scene route | [`prompt-to-3d-workflow.md`](prompt-to-3d-workflow.md), [`art-direction.md`](art-direction.md) |
| A browser game or port (HUD, touch, audio, replay) | [`build-playbook.md`](build-playbook.md), `docs/api/game-kit.md`, `docs/api/qa-kit.md` |
| Which template to start from (20 shipped) | [`templates.md`](templates.md) |
| Models (catalog, your GLB, Meshy) | [`asset-workflow.md`](asset-workflow.md), [`asset-selection.md`](asset-selection.md) |
| Shipping it | [`verification.md`](verification.md), [`deployment.md`](deployment.md), [`rendering-proof-required.md`](rendering-proof-required.md) |

Skills hold the procedures; load one when its signal matches (canonical sources `packages/aura3d-cli/skills/`; `pnpm skills:sync` mirrors them to `.cursor/skills`, `.claude/skills`, `.agents/skills` and the `create-aura3d` bundle; `pnpm check:skills` gates them; downstream projects get them from `npx @aura3d/cli@latest init --agent all --skills core|all|none`):

| Task | Skill |
| --- | --- |
| Any Aura3D task, public examples, claims | `aura3d-core` |
| Prompt to scene or route | `aura3d-scene-authoring` |
| Look, lighting, flat or dark screenshots | `aura3d-art-direction` |
| Named real object or user GLB | `aura3d-assets` |
| Before calling work done or shippable | `aura3d-evidence-review` |
| Game templates, HUD, touch, QA replay hooks, converting a game | `aura3d-browser-game` |
| Rigged humanoids, clips, morphs, visemes | `aura3d-character-animation` |
| `animation-studio` episodes | `aura3d-animation-studio` |
| three.js ports | `aura3d-threejs-migration` |
| Materials, textures, HDRI, sky, weather, water, `material.custom` | `aura3d-materials-environments` |
| Flipbook VFX sheets, HUD icons | `aura3d-game-art` |
| Restyling a finished mesh | `aura3d-retexture` |
| Paid Meshy generation | `meshy-cli` |
| Slow or heavy routes, bundle size | `aura3d-performance` |

A listed skill that is not installed is a gap to report, not permission to improvise its procedure.

## Tier 2: reference (open when a question needs it)

[`api-surface.md`](api-surface.md) (what the root exports), [`claims-and-boundaries.md`](claims-and-boundaries.md) (what not to write or claim; the old anti-hallucination and no-hackjob lists are merged into it), [`troubleshooting.md`](troubleshooting.md), [`game-example-standards.md`](game-example-standards.md), [`genre-kits.md`](genre-kits.md) (what each `game.*` genre kit provides versus what is per game, one runnable example each), [`cinematic-scene-quality.md`](cinematic-scene-quality.md), [`benchmark-recipes.md`](benchmark-recipes.md) (smallest recipe per benchmark prompt), [`codebase-map.md`](codebase-map.md), and the 4.1 kit pages in `docs/api/`: `game-kit`, `qa-kit`, `safety-net`, `audio-synth`, `model-loader`, `glsl-chunks`, `scatter-merge`, `ball-flight`, `racket-athlete-rig`, `cli-asset-tools`, `toon`. Worked example logs: `skills-examples/`.

Before shipping read `packages/aura3d-cli/skills/aura3d-core/references/pitfalls.md`: the bugs that passed CI and failed on real GPUs.

## Where code lives

`packages/engine/src/agent-api/` (public scene helpers and scene kits), `packages/aura3d-cli/src/` (assets, init, doctor, check-deploy), `packages/create-aura3d/templates/` (starters), `packages/game/` (game kit), `packages/react/src/` (React adapter). Superseded runtime docs are removed; use git history for archaeology, never restore historical APIs without a current ADR.

## Benchmark mode

If a prompt matches [`benchmark-recipes.md`](benchmark-recipes.md): copy the smallest recipe, run `npm install && npm run build`, and stop. A runner owns the browser; do not start a dev server, Playwright or screenshots inside the agent process.

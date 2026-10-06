---
name: aura3d-core
description: Orients an agent in Aura3D, maps three.js habits to `@aura3d/engine` APIs, routes visual work to art direction first, and sets claim labels. Use when starting any Aura3D task, scaffolding with `create-aura3d`, writing `createAuraApp` code, or before writing public examples, README text, or release claims.
---

# Aura3D core

Aura3D is a TypeScript engine API, an asset CLI, templates, diagnostics, and a
deploy checker. You are not writing three.js; `createAuraApp(...)` owns the
renderer, scene graph, camera, and frame loop. Every scene gets a look — a
preset that owns environment light, key shadow, fog, background and grade.
Shared rules (claim labels, forbidden patterns, catalog-first, typed assets,
paid generation, benchmark mode) live once in
[references/boundaries.md](references/boundaries.md).

## Look target

Before any code, pick the look: read `aura3d-art-direction`'s recipe row for
the genre, note the look id, the post preset and the palette accent. A scene
without a look ships flat shading, void background and floating props.

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` (or `pnpm exec aura3d --help` inside the
   monorepo) and use only the commands and flags it prints.
2. Check the installed engine version in `package.json`. Do not name an export
   you have not seen in the installed package's type declarations.
3. Read `src/aura-assets.ts` and `aura.assets.json` before writing scene code.
   Asset keys come from that generated file, never from memory.
4. Decide the mode. Benchmark mode means `npm install && npm run build`, then
   stop (run the look-dev loop instead when `aura3d look capture` exists).

## Procedure

1. Pick the starting point in this order: a template (`npx create-aura3d@latest
   <dir> --template <name>`), then `sceneKits.*`, then `prefabs.*`, and use
   `primitives.*` last, for set dressing only.
2. Add the look first — it supplies the sky/environment light, the key shadow,
   fog, background and the post grade as one unit:

   ```ts
   import { createAuraApp, looks, model, scene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   createAuraApp("#app", {
     scene: scene().add(looks.preset("product-studio")).add(model(assets.robot)),
     ...looks.appOptions("product-studio")
   });
   ```

3. Translate any three.js instinct with this table:

   | three.js habit | Aura3D |
   | --- | --- |
   | `Mesh` plus a glTF loader | `model(assets.x)` (typed asset) |
   | `new Scene()` | `scene()` |
   | `PerspectiveCamera` | `camera.perspective(...)`, `camera.rigs.*` |
   | `AmbientLight` | `lights.hemisphere(...)` or the look fill |
   | `DirectionalLight`/`PointLight` | the look's key/rim slots, `lights.*` |
   | `scene.environment` + PMREM | `environments.studio`/`hdri`, `world.biome` |
   | `toneMapping`, exposure | `output.preset`, the look's grade |
   | `setPixelRatio` | `quality: "auto"` via `looks.appOptions` |
   | `castShadow` | `shadow: true` |
   | `EffectComposer` passes | `output.preset` + `effects.*` |
   | `AnimationMixer` | `AnimationController` |
   | OrbitControls | `interactions.orbit(...)` |

4. If the prompt names a real object, resolve it through the catalog before
   writing model code (load `aura3d-assets`).
5. Load the next skill from the routing table below. Load more than one when
   the task spans them.

## Routing table

| Task signal | Load |
| --- | --- |
| Any visual task, screenshot looks flat/dark/empty, starting or finishing a scene | `aura3d-art-direction` (first) |
| Prompt to scene or route, scene kits, `definePromptPlan` | `aura3d-scene-authoring` |
| Named real object, user GLB, `assets search/resolve/add` | `aura3d-assets` |
| Done, public, shippable, screenshots, claims, `check-deploy` | `aura3d-evidence-review` |
| `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `character-controller` | `aura3d-browser-game` |
| Rigged humanoids, clips, locomotion, morphs, visemes | `aura3d-character-animation` |
| `animation-studio` template, `aura3d animation scene`, episodes | `aura3d-animation-studio` |
| Porting three.js code, `three-compat-*` templates | `aura3d-threejs-migration` |
| Materials, textures, HDRI, skies, water, weather | `aura3d-materials-environments` |
| Flipbook VFX sheets, HUD icons, UI sprites | `aura3d-game-art` |
| Restyling a finished mesh without touching geometry | `aura3d-retexture` |
| Frame time, bundle size, KTX2, LOD, instancing | `aura3d-performance` |
| No clean catalog candidate, Meshy generation or import | `meshy-cli` |

A listed skill that is not installed in this project is a gap to report, not
permission to improvise its procedure.

## Look-dev loop

Capture the route with `aura3d look capture`, judge each frame against the
quality-bar rubric, fix the single highest-leverage issue (lint codes first),
and repeat until every category reads 7+ or the loop exits flat. The full loop
spec lives in `aura3d-art-direction`.

## Stop and report

- The CLI help does not list a command you need: stop, name the missing
  command, and label the work `blocked`.
- A required asset key is missing from `src/aura-assets.ts`: stop and fix the
  import. Do not substitute a string id, URL, or primitive.
- The claim you are about to write has no matching browser evidence: lower it
  to `prototype` or `roadmap` per boundaries.md — claim labels are a one-line
  link, not a restatement.
- The task needs paid generation and no approval exists: stop at the dry run.
- Benchmark mode: after `npm install && npm run build`, stop and report the
  runner-owned launch and capture command.

## References

- [Shared boundaries](references/boundaries.md)
- [Agent guide llms.txt](https://github.com/auraoneai/aura3d/blob/main/llms.txt)
- [Claims and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/agents/claims-and-boundaries.md)
- [No hackjob rules](https://github.com/auraoneai/aura3d/blob/main/docs/agents/no-hackjob-rules.md)
- [Anti-hallucination rules](https://github.com/auraoneai/aura3d/blob/main/docs/agents/anti-hallucination-rules.md)
- [Agent quickstart](https://aura3d.auraone.ai/docs/agent-quickstart.html)

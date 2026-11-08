---
name: aura3d-core
description: Orients an agent in Aura3D, maps three.js habits to `@aura3d/engine` APIs, routes visual work to art direction first, and sets claim labels. Use when starting any Aura3D task, scaffolding with `create-aura3d`, writing `createAuraApp` code, or before writing public examples, README text, or release claims.
---

# Aura3D core

Aura3D is a TypeScript engine API, an asset CLI, templates, diagnostics, and a
deploy checker. You are not writing three.js; `createAuraApp(...)` owns the
renderer, scene graph, camera, and frame loop. Every scene gets a look — a
preset that owns environment light, key shadow, fog, background and grade.
Shared rules (claim labels, forbidden patterns, resolve-first, typed assets,
paid generation, benchmark mode) live once in
[references/boundaries.md](references/boundaries.md).

## Look target

Before any code, pick the look: read `aura3d-art-direction`'s recipe row for
the genre, note the look id, the post preset and the palette accent. A scene
without a look ships flat shading, void background and floating props.

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` (or `pnpm exec aura3d --help` inside the
   monorepo) and use only the commands and flags it prints.
2. Run `aura3d info` for the installed versions and the engine's namespaces and
   members; `aura3d info --name material.pbr` prints one builder's option keys.
   Do not name an export `aura3d info` does not list.
3. Read `src/aura-assets.ts` and `aura.assets.json` before writing scene code.
   Asset keys come from that generated file, never from memory.
4. Decide the mode. Benchmark mode means `npm install && npm run build`, then
   stop (run the look-dev loop instead when `aura3d look capture` exists).

## Procedure

1. Pick the starting point in this order: a template (`npx create-aura3d@latest
   <dir> --template <name>`), then `sceneKits.*`, then `prefabs.*`, and use
   `primitives.*` last, for set dressing only. `aura3d examples "<task>"` finds
   the closest recipe or template offline and prints its source. After each
   edit run `aura3d validate` (colours, unknown options, framing, lighting),
   then `aura3d render` and open the screenshot it saves.
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

3. Translate any three.js instinct with the table "if you would write X in
   three.js, write Y" (every Aura3D line is type-checked against the engine):
   [threejs-to-aura3d.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/threejs-to-aura3d.md). Signatures for the common
   roots: [api-signatures.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/api-signatures.md); read them instead of
   opening `node_modules` type files. There is no root `output` or `world`
   namespace: tone mapping and grade come from the look (`looks.appOptions`),
   environment from `environments.*`.

4. If the prompt names a real object, run `assets resolve` before writing
   model code (load `aura3d-assets`).
5. Load the next skill from the routing table below. Load more than one when
   the task spans them.
6. A named real object (character, athlete, vehicle, aircraft, landmark) uses a
   real GLB via `model(assets.<name>, { targetMaxDimension, role })` from
   `src/aura-assets.ts` (`targetHeight` only for upright humanoids, so aspect
   ratios stay proportional); drive rigged characters (`skins > 0`) with
   `handle.setAnimation({ clip, loop: true, speed })`. No model admitted and
   none wanted (a world, a creature, a prop set, an abstract piece)? Build it
   procedurally from `primitives.*`, `geometry.define`, `instances.*`,
   `material.*`, `group` joints and `environments.neutral`, starting from a
   recipe in [recipes.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/recipes.md) (recipes 8 to 15: humanoid with joints,
   terrain, props kit, PBR viewer, custom-shader water, sky and day/night,
   fire, night street). Label such a route `procedural`, not a showcase claim,
   and never leave flat unlit placeholders.
   Capabilities in the 5.0 scope list that matter for visuals (try them, judge
   by capture, claim nothing unproven): shader graphs through `material.node`,
   `renderOrder` on nodes, post effects through `effects.*` including
   `effects.shaderPass`, depth and normal inputs for post, motion vectors.
7. For interactive and game routes, gate Frame 1 on `await app.ready()` before
   fading `#boot-gate` so lighting, shadow, and GLB silhouettes are fully
   mounted; default `autopilot` to `false` (manual control on Frame 1) unless
   `?autoplay=1` / `?demo=1` is in the URL or the user clicks the HUD `Auto`
   button (with `button.blur()` for clean framing), keep canonical `sha256-...`
   `hash` provenance in `defineAuraAssets(...)` or `defineModelAssets(...)`, run
   Meshy GLBs through `assets optimize --role` first, never pin post-processing or
   the compiler off with a `qualityRebuild` list (use the safety net), and mutate
   runtime node handles (`app.nodes.require(...)`) instead of calling
   `app.setScene()` on same-stage restarts so lighting and grade never drop.
   Build the HUD, replay hooks and sound from the kits:
   [kits and hooks](../aura3d-browser-game/references/kits-and-hooks.md).

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
| Porting three.js code, migration templates (formerly `three-compat-*`) | `aura3d-threejs-migration` |
| Materials, textures, HDRI, skies, water, weather | `aura3d-materials-environments` |
| Flipbook VFX sheets, HUD icons, UI sprites | `aura3d-game-art` |
| Restyling a finished mesh without touching geometry | `aura3d-retexture` |
| Frame time, bundle size, KTX2, LOD, instancing | `aura3d-performance` |
| No clean open-source candidate, Meshy generation or import | `meshy-cli` |

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
- [Known pitfalls](references/pitfalls.md)
- [Agent guide llms.txt](https://github.com/auraoneai/aura3d/blob/main/llms.txt)
- [Claims and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/agents/claims-and-boundaries.md)
- [Agent quickstart](https://aura3d.auraone.ai/docs/agent-quickstart.html)
- [Agent tools: info, examples, validate, render](https://github.com/auraoneai/aura3d/blob/main/docs/agents/agent-tools.md)

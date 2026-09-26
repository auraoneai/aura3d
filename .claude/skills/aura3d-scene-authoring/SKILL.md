---
name: aura3d-scene-authoring
description: Turns a scene prompt into editable `@aura3d/engine` source by picking a scene kit or prompt plan, compiling it, and repairing weak screenshots from the compiled report. Use when writing a scene or route from a prompt, choosing among `sceneKits.*`, `prefabs.*`, or `primitives.*`, or using `definePromptPlan`, `compilePromptPlan`, `promptPlanToScene`, or `collectAuraSceneEvidence`.
---

# Aura3D scene authoring

You turn prompt intent into maintainable TypeScript that calls public Aura3D
APIs. There is no hidden scene generator. Shared rules (claim labels, forbidden
patterns, typed assets, benchmark mode) are in
[boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and use only the commands it prints.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Every subject model comes
   from a generated key. If the prompt names a real object and no key exists,
   load `aura3d-assets` first.
3. Read the installed `@aura3d/engine` type declarations before naming an
   export. The prompt-plan enums are narrow: `sceneType` is `product-viewer`,
   `cinematic-scene`, `mini-game`, or `material-studio`.
4. Decide the mode. Benchmark mode: copy the smallest matching recipe, run
   `npm install && npm run build`, return the runner-owned run command, and
   stop. No dev server, preview, Playwright, or screenshots from the agent.

## Procedure

1. Restate the prompt as scene intent: subject, scene family, camera, lighting,
   effects, interaction, and what a screenshot must visibly show.
2. Pick the starting point in this order: a template, then a scene kit, then
   `prefabs.*`, and `primitives.*` only for set dressing, guides, or explicitly
   abstract visuals.

   | Prompt family | Start from | Screenshot must show |
   | --- | --- | --- |
   | Physics playground | `sceneKits.physicsPlayground` | falling cubes, settled pile, ramp, contact cues, reset |
   | Particle fountain | `sceneKits.particleFountain` | dense upward flow, nozzle, splash, a real emission-rate control |
   | Solar system | `sceneKits.solarSystem` | sun glow, six attached planet labels, orbit paths, stars |
   | Neon tunnel | `sceneKits.neonTunnel` | inside-tube view, receding rings, rails, controlled bloom |
   | Data visualization | `sceneKits.dataViz` | bars, axes, ticks, title, legend, selected value |
   | Mini golf | `sceneKits.miniGolf` | ball, cup, aim and power, score, obstacle, boundaries |
   | Material lab | `sceneKits.materialLab` | material classes distinct in pixels, not labels |
   | City block | `sceneKits.cityBlock` | buildings, lit windows, streets, a real day/night state |
   | Humanoid walk | `sceneKits.humanoidWalk` | one connected humanoid, planted feet, path |
   | Product viewer | `sceneKits.productViewer` | typed model on plinth, contact shadow, softboxes |

3. Kit path: mount the kit once and keep its diagnostics.

   ```ts
   import { createAuraApp, sceneKits } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const kit = sceneKits.productViewer(assets.product);
   createAuraApp("#app", kit.toAppOptions());
   console.log(kit.diagnostics, kit.evidence);
   ```

4. Plan path, when the prompt is product intent rather than a kit family:

   ```ts
   import { compilePromptPlan, createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const plan = definePromptPlan({
     sceneType: "product-viewer",
     subject: { asset: assets.product },
     camera: { preset: "product-orbit" },
     lighting: { preset: "studio-softbox" },
     interaction: "orbit",
     acceptanceCriteria: ["product is centered and recognizable"]
   } as const);

   const compiled = compilePromptPlan(plan);
   createAuraApp("#app", { scene: promptPlanToScene(plan), diagnostics: { overlay: true } });
   console.log(compiled.report.visualSystems, compiled.report.repairHints);
   ```

5. Read the compiled report before editing: `visualSystems` names what the
   compiler added (it can add a system you did not request, such as bloom),
   `negativeCriteria` lists what must not ship, and `repairHints` lists fixes.
6. Add only prompt-required customization. Controls go through `ui.*` helpers
   and must change rendered pixels; CSS and DOM are UI only and never stand in
   for particles, bloom, trails, labels, or renderer output.
7. Mount one app per route. Never dispose and recreate the app inside a frame
   loop to animate values.
8. Normal mode only: collect `collectAuraSceneEvidence(scene)` or the kit
   evidence, run `npm run build`, and hand screenshots and route health to
   `aura3d-evidence-review`. The template `npm run test` gate runs Playwright;
   run it in CI or on a remote runner, not on the local machine.
9. Weak screenshot: apply the repair hints (tighter framing, foreground and
   background structure, key/fill/rim contrast, visible state) or switch back
   to the matching kit before changing any label or claim.

## Stop and report

- The subject is a named real object with no typed asset key: stop, load
  `aura3d-assets`, and label the scene `blocked` until the key exists.
- The only way to satisfy the prompt is a primitive stand-in for the primary
  subject: stop and label it `prototype`.
- An effect, PBR, skinning, WebGPU, or postprocess claim has no pixel evidence
  from a route importing only `@aura3d/engine`: drop the claim or label it
  `prototype`.
- `npm run build` fails on an export you guessed: remove it and re-read the
  type declarations. Do not add casts to force it through.
- Benchmark mode: stop after the build and report the runner-owned command.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Build playbook](https://github.com/auraoneai/aura3d/blob/main/docs/agents/build-playbook.md)
- [Prompt to 3D workflow](https://github.com/auraoneai/aura3d/blob/main/docs/agents/prompt-to-3d-workflow.md)
- [Benchmark recipes](https://github.com/auraoneai/aura3d/blob/main/docs/agents/benchmark-recipes.md)
- [Agent guide llms.txt](https://github.com/auraoneai/aura3d/blob/main/llms.txt)
- [Prompt recipes](https://aura3d.auraone.ai/docs/prompt-recipes.html)

# Worked example: aura3d-scene-authoring

Date: 2026-09-25. Run inside the Aura3D monorepo against the built engine at
`packages/engine/dist/index.js` (version 3.0.1). Lightweight commands only; no
dev server, Playwright, or screenshots were run locally.

## Goal

Author a product-viewer scene from a prompt ("show the product centered on a
studio stage with orbit controls"), confirm what the prompt-plan compiler adds,
and confirm the kit-path performance/diagnostics shape.

## Commands run

1. CLI contract: `node packages/aura3d-cli/dist/cli.js --help` (the local build
   of `npx @aura3d/cli@latest --help`). Trimmed output:

   ```text
   Aura3D CLI

   Commands:
     aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio|navigation] ...
   ```

2. Prompt plan compiled with a throwaway Node script that imports
   `definePromptPlan`, `compilePromptPlan`, and `sceneKitPerformanceBudget`
   from the engine dist. The subject was an inline model ref for the product
   key (a stand-in for a generated `assets.product`; a real app imports it from
   `./aura-assets`). Trimmed real output:

   ```json
   {
     "keys": ["schema", "sceneType", "subjectAssetId", "recipe", "cameraPreset",
              "lightingPreset", "effects", "acceptanceCriteria", "negativeCriteria",
              "warnings", "visualSystems", "repairHints"],
     "visualSystems": ["product-viewer recipe", "product-orbit camera",
                       "studio-softbox lighting", "bloom effect"],
     "negativeCriteria": [
       "Do not ship a lone GLB on a grid as product-quality prompt proof.",
       "Do not rely on labels or diagnostics to explain missing visual intent."
     ],
     "repairHints": [
       "If the screenshot reads as one asset plus decoration, add foreground, midground, and background structure before promoting it.",
       "If the subject is small or off-center, use a tighter camera preset, move the subject into the focal area, and recapture the screenshot.",
       "If lighting is flat, add a key, fill, and rim light with visibly different color or intensity."
     ]
   }
   ```

   Finding: the plan requested no effects, yet `visualSystems` lists "bloom
   effect". The skill tells agents to read `visualSystems` before claiming or
   removing effects for this reason.

3. Kit shape from the same script, `sceneKits.miniGolf()`: returned keys
   `kind, id, nodes, camera, lights, effects, interactions, ui, diagnostics,
   evidence, acceptanceEvidence, scene, toAppOptions, customize`, and
   `diagnostics.performance` with a draw-call budget of 48 estimated / 90 max
   (`"pass": true`).

## Not run locally (remote evidence)

- `npm run build` of a scaffolded `product-viewer` template (a full Vite build;
  run in CI or on a remote runner).
- Template `npm run test` (Playwright route-health and screenshot specs).
- Screenshot review against the acceptance criteria and repair hints, handed
  to `aura3d-evidence-review`.

Evidence to capture remotely: build log, route-health JSON (backend, draw
calls, runtime errors), desktop and mobile screenshots with hashes, and the
compiled report stored next to them.

# Go-To-Market Strategy

A3D should go to market as a workflow-first browser 3D engine and SDK that matches or exceeds Three.js in the measured categories documented by the V10 superiority audit.

## Primary Wedge

Lead with product and asset visualization:

- product viewers and configurators;
- GLB/glTF asset inspection;
- PBR material and HDR environment review;
- screenshot and render diagnostics;
- animation, skinning, morph, IK, and clip inspection;
- physics and interaction showcases;
- browser-hosted internal tools for design, merchandising, engineering, and migration teams.

This wedge maps directly to current package code: assets, rendering, product studio helpers, materials, environments, animation, controls, input, physics, diagnostics, templates, and route-level visual evidence.

## Buyer And Developer Personas

Primary developer:

- frontend or graphics engineer maintaining a custom Three.js stack;
- wants stronger defaults for product scenes, assets, materials, lighting, animation, diagnostics, and disposal;
- cares about TypeScript, package boundaries, testability, browser-first deployment, and auditable evidence.

Primary buyer or sponsor:

- ecommerce, industrial design, digital twin, or internal tools lead;
- wants predictable browser 3D workflows without building a full engine stack from raw primitives;
- values faster iteration, repeatable screenshots, measurable reliability, and more inspectable render/asset failures.

## Product Packaging

The product ships as:

- `@aura3d/engine` as the main SDK entry;
- public subpackages for renderer, assets, animation, scene, controls, materials, environments, workflows, physics, input, product-studio, debug, and Three.js migration helpers;
- `create-aura3d` templates for product viewer, configurator, asset inspector, material studio, WebGPU starter, and migration flows;
- docs that show app creation, asset loading, workflow rendering, diagnostics, screenshots, and disposal;
- benchmark and comparison pages that state exact route evidence and current report links.

## Launch Sequence

1. Evidence release

Publish the README, current-state doc, superiority status doc, package API map, route registry, benchmark reports, and V10 audit outputs. The message is "A3D matches or exceeds Three.js in measured browser 3D workflow categories."

2. Workflow demos

Polish and showcase product viewer, material studio, asset inspector, animation viewer, physics showcase, and WebGPU/WebGL2 routes. Each route should expose load time, first frame, draw calls, FPS, resources, and screenshot evidence.

3. Migration campaign

Publish targeted migration examples for selected Three.js patterns: mesh/material/camera scene, GLB asset viewer, instanced scene, animation mixer workflow, postprocess chain, decals, controls, and picking.

4. Design partners

Use real product/asset teams. Give them templates, asset ingestion, diagnostics, screenshot workflows, and migration helpers. Measure migration time, bugs found by diagnostics, first-frame time, route health, and visual acceptance.

5. Public ecosystem expansion

Expand official-example coverage, WebGPU feature breadth, WebXR device coverage, material variants, advanced loader paths, and editor-runtime workflows while keeping every claim tied to generated reports.

## Use Cases To Lead With

- "Load a GLB and get a diagnostic product viewer."
- "Review PBR materials under HDR environments."
- "Create a browser material studio with screenshots."
- "Inspect GLB animation, skeletons, morphs, clips, and IK."
- "Run physics, picking, decals, controls, and postprocess routes with diagnostics."
- "Compare selected Three.js scenes against a A3D route."
- "Migrate selected Three.js workflows into A3D package APIs."
- "Build internal browser 3D tools with explicit renderer and asset diagnostics."

## Benchmarks And Proof

Publish benchmark claims only with exact report links. Acceptable benchmark language:

- "This route rendered in this browser with this report."
- "This package build and browser smoke passed."
- "This comparison scene matched these scoped requirements."
- "This benchmark tied or beat the Three.js baseline on these measured dimensions."

Required proof paths:

- `docs/project/v10-superiority-status.md`
- `tests/reports/v10/superiority-audit.json`
- `tests/reports/v10/claim-defense.json`
- `tests/reports/v10/performance.json`
- `tests/reports/v9/performance.json`
- `tests/reports/comparison-threejs.json`
- `tests/reports/v9/threejs-inventory.json`
- `tests/reports/v9/same-scene-render.json`
- `tests/reports/v9/visual-review.json`
- route-health reports for the app registry.

## KPIs

Product KPIs:

- cold start and first interactive frame for flagship routes;
- route FPS and draw-call count under default scenes;
- visual acceptance rate against reference captures;
- number of route regressions caught by screenshot/canvas checks;
- asset ingestion success rate across the curated corpus;
- successful template installs and external Vite builds;
- memory/resource count after repeated route load/unload cycles.

GTM KPIs:

- time to first product viewer;
- time to migrate a selected Three.js product scene;
- number of partner assets successfully loaded;
- diagnostics issues discovered per asset;
- repeat usage of screenshot/material review workflows;
- developer-reported reduction in custom Three.js scaffolding.

## Content Plan

Create content in this order:

- getting-started guide with one GLB product viewer;
- material studio tutorial with HDR environment switching;
- asset-diagnostics guide for broken GLB files;
- animation viewer tutorial with skinning, morphs, and clips;
- physics and interaction route guide;
- Three.js migration notes for selected scene patterns;
- benchmark page that links exact methodology and reports;
- partner case studies after measurable route proof exists.

## Risks

The biggest GTM risk is uncited claims. The strategy is to make claims only when they point to source files, route screenshots, tests, reports, and benchmarks.

The second risk is documentation sprawl. Current onboarding should point users to README, current-state, getting-started, API docs, benchmarks, comparisons, V10 superiority status, and the generated V10 report set first.

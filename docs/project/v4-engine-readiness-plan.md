# G3D Engine Readiness Plan

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This is the final engineering reset plan before deciding whether to kill the project.

The current repo contains real code, but the current direction is failing the product goal. The examples are not visually credible, the parity language is unsupported, and too much work has gone into forcing screenshots and reports to pass instead of making the renderer naturally produce good output.

This plan is intentionally code-only. It excludes external events, manual Unity/Unreal capture work, marketing claims, app-store style validation, and any task that depends on a third party doing something outside this repo.

## Post-Reset Product Definition

After the deletion/quarantine work, G3D is no longer claiming to be a Unity/Unreal replacement or a broad Three.js/Babylon.js killer. That claim has failed too many times and is not supported by current evidence.

G3D can still strive to become a Three.js replacement. The engine readiness separates that ambition from the current state:

- **Current state:** not a Three.js replacement.
- **Near-term product:** a TypeScript/WebGL rendering SDK with sane asset-to-render defaults.
- **First strategic ambition:** become a credible Three.js alternative for controlled product, material, asset-viewer, and clean scene-rendering workflows.
- **Future claim:** only call G3D a Three.js replacement after same-scene visual/API/package evidence supports that claim.

The post-reset product is:

**A TypeScript/WebGL rendering SDK for loading assets and producing clean, browser-based product/material/scene renders with sane defaults.**

The product is useful only if a developer can do this locally, inside this repo, without example-specific renderer hacks:

```ts
import { Renderer } from "@galileo3d/rendering";
import { loadRenderableAsset, createRenderableScene } from "@galileo3d/assets";

const renderer = await Renderer.create({ canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.glb");
const scene = createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

await renderer.renderScene(scene);
```

That is the product: a small, controllable rendering/asset SDK that can produce credible browser visuals without a user spending days hand-wiring lights, cameras, materials, render targets, and postprocess.

### Product Boundaries

In scope:

- WebGL2 renderer correctness.
- PBR-ish material response good enough for product/material demos.
- glTF loading and render-resource creation for a supported feature subset.
- Automatic camera/framing defaults.
- Deterministic local environment lighting.
- Integrated renderer-owned shadow map path.
- Integrated HDR/render-target/postprocess path.
- Clean screenshots for product, material, asset, and rendering showcase demos.
- Local tests and verifiers that prove the above.

Out of scope for the engine readiness:

- Unity parity.
- Unreal parity.
- Unity/Unreal replacement.
- Broad Three.js/Babylon.js superiority.
- Full glTF parity.
- Full WebGPU parity.
- Full postprocess-suite parity.
- External benchmark superiority.
- Any claim that requires a person to run another engine manually.

These can become future research tracks only after the post-reset product is usable.

## Three.js Replacement Framing

This framing is the product direction after the engine readiness. It is not a current claim.

### 1. Three.js Alternative For One Scene

Goal: one canonical scene renders comparably in G3D with less setup code.

Code deliverables:

- [ ] `fixtures/engine-readiness/canonical-product-scene.json`
- [ ] `packages/rendering/src/CanonicalSceneFixtures.ts`
- [ ] `tests/browser/rendering-canonical-scene.spec.ts`
- [ ] `tests/reports/engine-readiness-canonical-scene/canonical.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/manifest.json`

Acceptance:

- [ ] Same scene uses PBR, textures, environment, camera framing, shadow, HDR target, and postprocess through G3D public APIs.
- [ ] Setup code is shorter than the equivalent internal Three.js comparison scaffold.
- [ ] Screenshot is clean scene output, not a diagnostic panel.
- [ ] `pnpm engine-readiness:root` passes.

### 2. Three.js Alternative For Product Viewer

Goal: product viewer workflow is simpler and good-looking.

Code deliverables:

- [ ] `examples/legacy-product-viewer/index.html`
- [ ] `examples/legacy-product-viewer/main.ts`
- [ ] `tests/browser/product-viewer-engine-readiness.spec.ts`
- [ ] `tests/reports/legacy-product-viewer/product-viewer.png`
- [ ] `tools/engine-readiness-product-viewer/index.ts`

Acceptance:

- [ ] Product viewer uses `loadRenderableAsset`, `createRenderableScene`, `fitCameraToBounds`, default studio lighting, renderer-owned shadows, and postprocess.
- [ ] Default screenshot is visually credible without debug overlays.
- [ ] The example code does not contain low-level render-device, shader, or framebuffer setup.
- [ ] `pnpm engine-readiness:product-viewer` passes.

### 3. Three.js Alternative For Asset Viewer

Goal: supported glTF subset loads, frames, lights, and renders with sane defaults.

Code deliverables:

- [ ] `packages/assets/src/loadRenderableAsset.ts`
- [ ] `packages/assets/src/createRenderableScene.ts`
- [ ] `packages/assets/src/AssetRenderDefaults.ts`
- [ ] `examples/legacy-asset-viewer/index.html`
- [ ] `examples/legacy-asset-viewer/main.ts`
- [ ] `tests/browser/asset-viewer-engine-readiness.spec.ts`
- [ ] `tools/engine-readiness-gltf-support/index.ts`

Acceptance:

- [ ] Supported glTF features render through the same public API as the canonical scene.
- [ ] Missing or unsupported glTF features produce warnings and fallbacks, not blank output.
- [ ] The asset viewer screenshot is dominated by the rendered asset, not UI.
- [ ] `pnpm engine-readiness:assets` passes.

### 4. Three.js Alternative For Material Studio

Goal: PBR/material workflows are ergonomic and visually credible.

Code deliverables:

- [ ] `examples/legacy-material-studio/index.html`
- [ ] `examples/legacy-material-studio/main.ts`
- [ ] `tests/browser/material-studio-engine-readiness.spec.ts`
- [ ] `tests/reports/legacy-material-studio/material-studio.png`
- [ ] `packages/rendering/src/MaterialPresets.ts`
- [ ] `packages/rendering/src/LightingDefaults.ts`

Acceptance:

- [ ] Metal, plastic, glass/clearcoat, emissive, alpha, normal-mapped, and textured materials visibly differ.
- [ ] Material setup uses high-level presets or typed material constructors, not raw shader hacks.
- [ ] Screenshot is visually readable without grids or fake metric decoration.
- [ ] `pnpm engine-readiness:examples` includes and passes material studio.

### 5. Three.js Replacement Candidate

Goal: G3D can be called a candidate only after multiple repo-local workflows are comparable.

Code deliverables:

- [ ] `tools/engine-readiness-replacement-candidate/index.ts`
- [ ] `tests/reports/engine-readiness-replacement-candidate.json`
- [ ] `docs/project/v4-threejs-replacement-candidate.md`
- [ ] `tests/reports/engine-readiness-package-smoke.json`
- [ ] Clean screenshots from product viewer, asset viewer, material studio, and rendering showcase.

Acceptance:

- [ ] Product viewer, asset viewer, material studio, and rendering showcase all pass.
- [ ] Fresh package smoke test installs and renders from a clean temporary app.
- [ ] Docs explain exact supported workflows and blocked workflows.
- [ ] No Unity/Unreal/Babylon/broad-superiority claims are made.
- [ ] Candidate report lists gaps that still block a replacement claim.

### 6. Three.js Replacement Claim

Goal: only make the replacement claim after same-scene visual/API/package comparisons support it.

Code deliverables:

- [ ] `tools/engine-readiness-threejs-comparison/index.ts`
- [ ] `benchmarks/engine-readiness/galileo/`
- [ ] `benchmarks/engine-readiness/threejs/`
- [ ] `tests/reports/engine-readiness-threejs-comparison.json`
- [ ] `tests/reports/engine-readiness-threejs-comparison/galileo-canonical.png`
- [ ] `tests/reports/engine-readiness-threejs-comparison/threejs-canonical.png`
- [ ] `tests/reports/engine-readiness-threejs-comparison/diff.png`

Acceptance:

- [ ] G3D and Three.js render the same repo-local canonical scene.
- [ ] G3D setup code is objectively shorter or simpler for the supported workflow.
- [ ] Visual output is comparable under local automated checks and human review.
- [ ] Package smoke test proves the workflow works outside the monorepo.
- [ ] Only then may docs use "Three.js replacement for supported product/material/asset-viewer workflows."

This is the replacement path. If a task does not move one of these six steps forward, it is probably distraction.

## Product Milestones

The project is allowed to continue only by clearing these milestones in order. Do not skip ahead.

### Milestone 0: Truthful Repo State

Goal: remove false confidence.

Deliverables:

- [ ] Failed examples are quarantined under `examples/_quarantine/`.
- [ ] Current public example index no longer presents failed scenes as product demos.
- [ ] Required scripts no longer include broad parity/external readiness gates.
- [ ] V4 docs are reset to blocked status for parity/replacement claims.
- [ ] Stale screenshots and reports are deleted or marked generated-only.

Exit command:

```sh
pnpm engine-readiness:truth
```

Exit evidence:

- [ ] `tests/reports/engine-readiness-truth.json`
- [ ] `docs/project/v4-engine-readiness-status.md`

Loop stopper:

- If a task tries to improve screenshots before Milestone 1 is green, stop and return to renderer root work.

### Milestone 1: Canonical Renderer Viability

Goal: prove the renderer can make one clean scene without example hacks.

Deliverables:

- [ ] `packages/rendering/src/RenderPipeline.ts`
- [ ] `packages/rendering/src/CanonicalSceneFixtures.ts`
- [ ] `fixtures/engine-readiness/canonical-product-scene.json`
- [ ] `tests/browser/rendering-canonical-scene.spec.ts`
- [ ] `tools/engine-readiness-visual-quality/index.ts`
- [ ] `tools/engine-readiness-root-readiness/index.ts`

Exit command:

```sh
pnpm engine-readiness:root
```

Exit evidence:

- [ ] `tests/reports/engine-readiness-canonical-scene/canonical.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/material-variant.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/shadow-toggle.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png`
- [ ] `tests/reports/engine-readiness-root-readiness.json`

Loop stopper:

- If `canonical.png` looks like debug art, grid spam, a proof panel, or a flat primitive scene, do not proceed. Fix root renderer/material/camera/light/asset code.

### Milestone 2: Asset-To-Render SDK

Goal: make basic asset rendering ergonomic.

Deliverables:

- [ ] `packages/assets/src/loadRenderableAsset.ts`
- [ ] `packages/assets/src/createRenderableScene.ts`
- [ ] `packages/assets/src/AssetRenderDefaults.ts`
- [ ] `packages/assets/src/index.ts` exports the new API.
- [ ] `tests/browser/rendering-canonical-scene.spec.ts` includes a less-than-30-lines setup proof.
- [ ] `tools/engine-readiness-gltf-support/index.ts` generates a supported/partial/blocked matrix from tests.

Exit command:

```sh
pnpm engine-readiness:assets
```

Exit evidence:

- [ ] `tests/reports/engine-readiness-asset-ergonomics.json`
- [ ] `tests/reports/engine-readiness-gltf-support.json`

Loop stopper:

- If rendering a supported glTF still requires custom example code, do not build public examples.

### Milestone 3: First Public Product Demo

Goal: ship one clean public demo that uses the SDK.

Deliverables:

- [ ] `examples/legacy-product-viewer/index.html`
- [ ] `examples/legacy-product-viewer/main.ts`
- [ ] `tests/browser/product-viewer-engine-readiness.spec.ts`
- [ ] `tests/reports/legacy-product-viewer/product-viewer.png`

Exit command:

```sh
pnpm engine-readiness:product-viewer
```

Exit evidence:

- [ ] Screenshot has no debug grid.
- [ ] Screenshot has no JSON/status proof block.
- [ ] Screenshot subject is framed and lit.
- [ ] Materials visibly differ.
- [ ] Shadow and postprocess are active through renderer APIs.

Loop stopper:

- If this demo requires renderer changes inside the example file, move that code into the SDK before proceeding.

### Milestone 4: Minimal Public Demo Set

Goal: rebuild only the demos that prove product value.

Deliverables:

- [ ] `examples/legacy-product-viewer/`
- [ ] `examples/legacy-material-studio/`
- [ ] `examples/legacy-asset-viewer/`
- [ ] `examples/legacy-rendering-showcase/`
- [ ] `examples/index.html` lists only these rebuilt examples.
- [ ] Browser screenshot tests for each example.

Exit command:

```sh
pnpm engine-readiness:examples
```

Exit evidence:

- [ ] `tests/reports/legacy-product-viewer/product-viewer.png`
- [ ] `tests/reports/legacy-material-studio/material-studio.png`
- [ ] `tests/reports/legacy-asset-viewer/asset-viewer.png`
- [ ] `tests/reports/legacy-rendering-showcase/rendering-showcase.png`
- [ ] `tests/reports/engine-readiness-examples.json`

Loop stopper:

- If a rebuilt example becomes a diagnostic lab instead of a clean demo, quarantine it and do not count it.

### Milestone 5: Package Viability

Goal: prove the SDK can be consumed from a clean workspace.

Deliverables:

- [ ] `tools/engine-readiness-package-smoke/index.ts`
- [ ] A temporary workspace that installs the package tarball.
- [ ] A minimal app that imports `Renderer`, `loadRenderableAsset`, and `createRenderableScene`.
- [ ] A browser screenshot from the minimal app.

Exit command:

```sh
pnpm engine-readiness:package-smoke
```

Exit evidence:

- [ ] `tests/reports/engine-readiness-package-smoke.json`
- [ ] `tests/reports/engine-readiness-package-smoke/screenshot.png`

Loop stopper:

- If the package cannot render a basic scene from a fresh workspace, do not publish or continue example work.

## What The Product Is Not

The engine readiness must prevent the project from sliding back into impossible claims.

G3D is not allowed to describe itself as any of these until future local evidence exists:

- Unity replacement.
- Unreal replacement.
- Three.js replacement outside explicitly supported workflows.
- Babylon.js replacement.
- Production game engine.
- Full WebGPU engine.
- Full glTF implementation.
- Full postprocess suite.
- Full PBR renderer.

Allowed post-reset positioning:

- TypeScript/WebGL rendering SDK.
- Asset-to-render pipeline.
- Product/material/scene rendering toolkit.
- Browser rendering foundation.
- Experimental editor/runtime foundation.
- Aspiring Three.js alternative for controlled product/material/asset-viewer workflows.

## Anti-Loop Operating Rules

These rules exist to prevent another multi-day loop of chasing bad screenshots.

- Every milestone must produce a named file, test, command, and report.
- Every visual claim must be backed by a screenshot generated by a test.
- No screenshot can count if it contains visible debug overlays, JSON proof blocks, or grid spam.
- No checklist item can be marked done from intent or implementation effort alone.
- Do not use broad parity wording in docs, reports, examples, package metadata, or comments.
- Do not add a feature to examples until the underlying SDK API exists and is tested.
- If a change only helps a metric but makes the image look worse, revert or quarantine it.
- If a task depends on Unity, Unreal, GitHub Actions, a remote host, external assets, or manual screenshots, it is outside this engine readiness.
- If the same subsystem is patched three times without producing an acceptable canonical screenshot, stop and write a failure note in `docs/project/v4-engine-readiness-status.md`.
- If Milestone 1 cannot pass after the allocated implementation attempt, pivot or kill the custom renderer.

## Non-Negotiable Rule

Do not build or polish public examples until the root renderer path passes the canonical renderer viability gate.

Examples may only resume after the following repo-local code gates pass:

- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/rendering --reporter=dot`
- `pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line`
- `pnpm exec tsx --tsconfig tsconfig.base.json tools/engine-readiness-root-readiness/index.ts`

The examples are downstream consumers. If a simple canonical scene cannot render well with sane defaults, the examples are noise.

## Success Criteria

The engine readiness is successful only when all of these are true:

- A new canonical scene renders through the normal Galileo renderer path without debug overlays, screenshot hacks, proof-grid spam, or example-specific renderer branches.
- The canonical scene includes PBR materials, textured materials, metallic/roughness variation, normal mapping, emissive, alpha/blend, environment lighting, directional shadow sampling, HDR/render-target path, and postprocess.
- The canonical scene is framed by reusable camera/framing code, not by hand-tuned per-example camera hacks.
- Asset-to-render-resource conversion is ergonomic enough that the canonical scene setup is short and repeatable.
- The renderer output passes repo-local screenshot metrics that reject flatness, empty UI, debug overlays, grid spam, bad framing, and color-bucket cheating.
- All parity/replacement claims remain blocked unless the repo has local, repeatable same-scene evidence.
- Every surviving example is rebuilt from the same canonical renderer APIs and passes a screenshot gate without debug overlays.

## Immediate Stop List

Until the root viability gate passes, stop doing all of the following:

- Do not edit `examples/product-configurator/main.ts` for visual polish.
- Do not edit `examples/architecture-viewer/main.ts` for visual polish.
- Do not edit `examples/game-slice/main.ts` for visual polish.
- Do not edit `examples/racing-showcase/main.ts` for visual polish.
- Do not edit `examples/material-showroom/main.ts` for visual polish.
- Do not add wire grids, fake panels, debug line overlays, or random detail to pass visual metrics.
- Do not mark docs checklist rows as complete based on screenshots that look bad.
- Do not claim Three.js, Babylon.js, Unity, Unreal, production, full PBR, full HDR, full shadow, full postprocess, full glTF, or full WebGPU parity.

## Phase 1: Delete Or Quarantine Failed Direction

These are code tasks. The intent is to remove false confidence, not to erase useful algorithms.

### 1.1 Quarantine Current V4 Flagship Examples

Move the current failed showcase attempts out of the public example path.

Checklist:

- [ ] Create `examples/_quarantine/README.md` explaining that these examples are retained only as failed visual evidence and regression material.
- [ ] Move `examples/product-configurator/` to `examples/_quarantine/product-configurator/`.
- [ ] Move `examples/architecture-viewer/` to `examples/_quarantine/architecture-viewer/`.
- [ ] Move `examples/game-slice/` to `examples/_quarantine/game-slice/`.
- [ ] Move `examples/racing-showcase/` to `examples/_quarantine/racing-showcase/`.
- [ ] Move `examples/material-showroom/` to `examples/_quarantine/material-showroom/`.
- [ ] Move `examples/postprocess-lab/` to `examples/_quarantine/postprocess-lab/`.
- [ ] Move `examples/shadow-lab/` to `examples/_quarantine/shadow-lab/`.
- [ ] Move `examples/large-world-streaming/` to `examples/_quarantine/large-world-streaming/`.
- [ ] Move `examples/portfolio/` to `examples/_quarantine/portfolio/`.
- [ ] Update `examples/index.html` so quarantined examples are not listed as public examples.
- [ ] Update `package.json` scripts that reference these examples so they no longer gate root readiness.
- [ ] Keep tests that inspect these folders disabled or moved to `tests/browser/quarantine/`, with names that make clear they do not prove product quality.

Do not delete the folders outright until the replacement examples exist. Moving them preserves code for mining while preventing them from masquerading as product demos.

### 1.2 Delete False Parity Tooling From The Critical Path

These tools may contain useful logic, but they currently encode goals the repo cannot support. Remove them from required verification until rebuilt around local, controllable evidence.

Checklist:

- [ ] Remove `tools/external-parity-broad-parity-readiness/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-unity-unreal-parity/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-external-engine-baselines/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-external-evidence-readiness/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-external-host-runner/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-external-host-doctor/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-github-external-readiness/index.ts` from required scripts.
- [ ] Remove `tools/external-parity-completion-audit/index.ts` from required scripts.
- [ ] Replace these scripts with a local-only blocker report under `tools/engine-readiness-root-readiness/index.ts`.
- [ ] Keep old tools under `tools/_quarantine/v4-parity/` only if tests still import them.
- [ ] Update `package.json` to remove or rename scripts that imply broad parity readiness.

Files to edit:

- `package.json`
- `tools/external-parity-broad-parity-readiness/index.ts`
- `tools/external-parity-unity-unreal-parity/index.ts`
- `tools/external-parity-external-engine-baselines/index.ts`
- `tools/external-parity-external-evidence-readiness/index.ts`
- `tools/external-parity-external-host-runner/index.ts`
- `tools/external-parity-external-host-doctor/index.ts`
- `tools/external-parity-github-external-readiness/index.ts`
- `tools/external-parity-completion-audit/index.ts`
- `tools/engine-readiness-root-readiness/index.ts`

### 1.3 Delete Or Regenerate Misleading Reports

Current report artifacts mix real evidence with failed visual output. They should not be used as release evidence.

Checklist:

- [ ] Delete generated V4 screenshot reports under `tests/reports/v4-example-screenshots/`.
- [ ] Delete generated V4 product parity screenshots under `tests/reports/external-parity-product-visual-parity/`.
- [ ] Delete stale `tests/reports/external-parity-visual-quality.json`.
- [ ] Delete stale `tests/reports/external-parity-codebase-root-readiness.json`.
- [ ] Delete stale parity reports that imply broad readiness:
  - `tests/reports/external-parity-broad-parity-readiness.json`
  - `tests/reports/external-parity-unity-unreal-parity.json`
  - `tests/reports/external-parity-production-readiness.json`
  - `tests/reports/external-parity-completion-audit.json`
- [ ] Add `.gitignore` entries if these reports are generated and should not be checked in.
- [ ] Add a regeneration command that only writes engine-readiness reports:
  - `pnpm engine-readiness:reports`

Files to edit:

- `.gitignore`
- `package.json`
- `tools/engine-readiness-root-readiness/index.ts`
- `tests/reports/`

### 1.4 Reset Documentation To Blocked State

Docs must stop implying that failed screenshots and diagnostic pages prove parity.

Checklist:

- [ ] Replace `docs/project/v4-remaining-code-to-write.md` with a engine-readiness checklist.
- [ ] Replace `docs/project/v4-current-gap-audit.md` with blocked status for visual parity, production readiness, PBR parity, HDR parity, shadow parity, postprocess parity, glTF parity, WebGPU parity.
- [ ] Replace `docs/project/v4-master-code-checklist.md` with root-code deliverables only.
- [ ] Move old V4 docs to `docs/project/v4-_quarantine/` if needed.
- [ ] Add `docs/project/v4-engine-readiness-status.md` as the single current status document.
- [ ] Remove examples from docs until canonical scene gate passes.

Files to edit:

- `docs/project/v4-remaining-code-to-write.md`
- `docs/project/v4-current-gap-audit.md`
- `docs/project/v4-master-code-checklist.md`
- `docs/project/v4-renderer-visual-quality-plan.md`
- `docs/project/v4-engine-readiness-status.md`
- `docs/project/v4-_quarantine/`

## Phase 2: Reset Root Renderer Architecture

This phase fixes the underlying code path. The target is one reusable render path that examples can consume later.

### 2.1 Renderer Entry Point Contract

Problem: examples and tests can bypass or over-specialize the render path.

Build:

- [ ] Add `packages/rendering/src/RenderPipeline.ts`.
- [ ] Define a single public render contract:
  - `RenderPipeline.renderScene(scene, camera, options)`
  - `RenderPipeline.renderItems(items, camera, options)`
  - `RenderPipeline.captureFrame(options)`
- [ ] Ensure both scene-rendering and direct-render-item paths use the same internal frame graph.
- [ ] Prevent example-specific branches in `Renderer.ts`.
- [ ] Add `RenderPipelineDiagnostics` with draw calls, material count, texture count, shadow state, render target state, postprocess state, camera state, and warnings.

Files:

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/RenderPipeline.ts`
- `packages/rendering/src/RenderGraph.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/index.ts`
- `tests/unit/rendering/render-pipeline.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] Direct item rendering and scene rendering produce equivalent visible output for the same objects.
- [ ] Renderer diagnostics expose the active camera, lights, materials, shadows, render target, and postprocess.
- [ ] No example file imports low-level device APIs to fake visual evidence.

### 2.2 Frame Graph And Render Target Reset

Problem: HDR/postprocess/shadow paths exist, but they are not trusted as a single integrated path.

Build:

- [ ] Add `packages/rendering/src/FrameGraph.ts` or complete existing `RenderGraph.ts`.
- [ ] Define passes:
  - `depth-prepass`
  - `shadow-map-pass`
  - `forward-pbr-pass`
  - `hdr-resolve-pass`
  - `postprocess-pass`
  - `presentation-pass`
- [ ] Make render target ownership explicit.
- [ ] Make backbuffer and offscreen target color spaces explicit.
- [ ] Add render target format validation:
  - `rgba8`
  - `rgba16f`
  - `rgba32f`
  - depth texture format
- [ ] Add diagnostic output for every pass.

Files:

- `packages/rendering/src/RenderGraph.ts`
- `packages/rendering/src/RenderTarget.ts` if missing
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `tests/unit/rendering/render-graph.test.ts`
- `tests/browser/hdr-render-target-external-parity.spec.ts`
- `tests/browser/rendering-root-quality-gate.spec.ts`

Done when:

- [ ] A browser test proves the canonical scene renders to HDR target, tone maps, postprocesses, and presents.
- [ ] A browser test proves clear color and cull state do not leak into postprocess presentation.
- [ ] A unit test proves frame graph pass ordering.

### 2.3 WebGL2 Device Correctness

Problem: if the low-level device rasterizes incorrectly, every example will be bad.

Build:

- [ ] Audit `packages/rendering/src/WebGL2Device.ts` for state leaks:
  - depth test
  - depth write
  - blend
  - cull mode
  - viewport
  - framebuffer binding
  - active texture units
  - shader program
  - VAO/VBO/IBO binding
- [ ] Add `RenderStateSnapshot` before and after each pass.
- [ ] Fail tests when a pass leaves dirty state.
- [ ] Add pixel-level tests for:
  - overlapping opaque objects
  - transparent object after opaque object
  - PBR object after unlit object
  - postprocess after shadow pass
  - resized render target after previous frame

Files:

- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/RenderDevice.ts`
- `tests/unit/rendering/render-state-leaks.test.ts`
- `tests/browser/rendering-context-lifecycle.spec.ts`
- `tests/browser/rendering-resize-stress.spec.ts`

Done when:

- [ ] State leak tests fail before intentional reset removal and pass with renderer-managed state.
- [ ] Browser tests show stable output across resize and repeated frames.

## Phase 3: Reset Material And Shader Behavior

### 3.1 PBR Shader Baseline

Problem: the output does not look like credible PBR. PBR classes exist, but the visual result is weak.

Build:

- [ ] Audit `packages/rendering/src/shaders/pbr-direct.frag.glsl`.
- [ ] Audit `packages/rendering/src/shaders/pbr-direct.vert.glsl`.
- [ ] Audit `packages/rendering/src/ShaderChunks.ts`.
- [ ] Implement or verify:
  - linear base color input
  - sRGB texture decode
  - metallic workflow
  - roughness workflow
  - normal mapping
  - view-vector specular response
  - GGX or documented bounded equivalent
  - Schlick Fresnel or documented bounded equivalent
  - ambient/environment contribution
  - emissive contribution
  - alpha blend and alpha mask
  - double-sided material behavior
- [ ] Remove any default emissive/self-lit behavior for textured PBR assets unless explicitly requested.
- [ ] Add numeric reference tests against `packages/rendering/src/PbrReference.ts`.
- [ ] Add screenshot tests that prove material variation in the canonical scene without debug overlays.

Files:

- `packages/rendering/src/shaders/pbr-direct.frag.glsl`
- `packages/rendering/src/shaders/pbr-direct.vert.glsl`
- `packages/rendering/src/ShaderChunks.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/NormalMappedPBRMaterial.ts`
- `packages/rendering/src/MaterialPresets.ts`
- `packages/rendering/src/PbrReference.ts`
- `tests/unit/rendering/pbr-reference.test.ts`
- `tests/unit/rendering/pbr-lighting.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] Same scene shows visibly different dielectric, metal, rough, glossy, normal-mapped, emissive, alpha, and double-sided materials.
- [ ] Unit reference tests validate scalar material response.
- [ ] Screenshot gate rejects flat material output.

### 3.2 Texture And Sampler Behavior

Problem: PBR cannot look credible without reliable texture decode, sampler behavior, and material texture slots.

Build:

- [ ] Audit `packages/rendering/src/Texture.ts`.
- [ ] Audit `packages/rendering/src/TextureBinding.ts`.
- [ ] Audit `packages/rendering/src/Sampler.ts`.
- [ ] Implement explicit texture slot validation:
  - base color
  - metallic-roughness
  - normal
  - emissive
  - occlusion
  - alpha/mask
  - environment
  - BRDF LUT
  - shadow map
- [ ] Add texture transform support to the canonical material path.
- [ ] Add a test that fails if texture transforms are ignored.
- [ ] Add a test that fails if sRGB and linear textures are mixed incorrectly.

Files:

- `packages/rendering/src/Texture.ts`
- `packages/rendering/src/TextureBinding.ts`
- `packages/rendering/src/Sampler.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/NormalMappedPBRMaterial.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `tests/unit/rendering/render-resources.test.ts`
- `tests/browser/asset-texture-browser.spec.ts`
- `tests/browser/asset-material-fidelity-external-parity.spec.ts`

Done when:

- [ ] Canonical scene uses real texture slots.
- [ ] Browser test proves material output changes when texture slots change.

## Phase 4: Reset Lighting, Environment, And Shadows

### 4.1 Lighting Defaults

Problem: scenes look flat or noisy because lighting defaults are not production-like.

Build:

- [ ] Add `packages/rendering/src/LightingDefaults.ts`.
- [ ] Define reusable lighting presets:
  - `studioProduct`
  - `outdoorDay`
  - `interiorGallery`
  - `gameNight`
- [ ] Each preset must include:
  - ambient/environment component
  - directional key
  - optional fill/rim light
  - exposure recommendation
  - white point recommendation
  - shadow recommendation
- [ ] Make `Renderer` able to apply preset lighting without example-specific code.

Files:

- `packages/rendering/src/LightingDefaults.ts`
- `packages/rendering/src/LightUniforms.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/scene/src/Light.ts` if present or relevant scene light files
- `tests/unit/rendering/pbr-lighting.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] Canonical scene looks visibly lit with no custom example lights.
- [ ] Material response changes when lighting preset changes.

### 4.2 Environment And IBL Reset

Problem: environment resources exist, but output is not visually convincing.

Build:

- [ ] Audit `packages/rendering/src/EnvironmentMapResources.ts`.
- [ ] Add deterministic local environment fixture generation under `packages/rendering/src/EnvironmentFixtures.ts`.
- [ ] Generate:
  - equirect base map
  - diffuse irradiance
  - specular prefilter mips
  - BRDF LUT
- [ ] Wire environment textures into PBR shaders through the normal renderer path.
- [ ] Add a material test where metal visibly changes with environment rotation/intensity.

Files:

- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/EnvironmentFixtures.ts`
- `packages/rendering/src/V4RenderPreset.ts` or replacement preset file
- `tests/unit/rendering/environment-map-resources.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] Metallic material visibly reflects environment variation.
- [ ] Environment resources are not just metadata.

### 4.3 Shadow Integration Reset

Problem: shadow lab proves diagnostics, but public scenes do not show believable production shadow integration.

Build:

- [ ] Audit `packages/rendering/src/ShadowMap.ts`.
- [ ] Audit `packages/rendering/src/ShadowPass.ts`.
- [ ] Audit `packages/rendering/src/CascadedShadowMaps.ts`.
- [ ] Audit `packages/rendering/src/ForwardPass.ts` shadow uniforms.
- [ ] Implement a single renderer-owned shadow path:
  - collect shadow-casting lights
  - collect shadow casters
  - render shadow map
  - bind shadow map in forward pass
  - sample in PBR shader
  - expose diagnostics
- [ ] Add PCF kernel validation.
- [ ] Add bias/slope-bias controls at material/render options level.
- [ ] Add resize stability test.
- [ ] Add canonical scene shadow test that compares lit and shadowed regions.

Files:

- `packages/rendering/src/ShadowMap.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/CascadedShadowMaps.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/shaders/pbr-direct.frag.glsl`
- `tests/unit/rendering/shadow-pass.test.ts`
- `tests/browser/shadow-browser.spec.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`
- `tools/engine-readiness-root-readiness/index.ts`

Done when:

- [ ] Canonical scene has visible shadow from a real shadow map.
- [ ] Shadow map evidence is not a separate 2D diagnostic drawing.
- [ ] Resizing the canvas preserves shadow relation.

## Phase 5: Reset HDR And Postprocess

### 5.1 HDR Render Target Path

Problem: HDR proof exists but looks like a technical readout, not an integrated renderer feature.

Build:

- [ ] Audit `packages/rendering/src/PostProcessPass.ts`.
- [ ] Audit render target support in `packages/rendering/src/WebGL2Device.ts`.
- [ ] Ensure HDR path uses the frame graph:
  - render scene to `rgba16f` or `rgba32f`
  - tone map
  - postprocess
  - present to sRGB backbuffer
- [ ] Add explicit fallback when float color buffers are unsupported.
- [ ] Add diagnostics for format, extension, tone mapper, exposure, and clamped overbright pixels.

Files:

- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/RenderGraph.ts`
- `tests/browser/hdr-render-target-external-parity.spec.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`
- `tools/external-parity-hdr-render-target-readiness/index.ts` or replacement engine-readiness audit

Done when:

- [ ] Canonical scene uses HDR path by default when available.
- [ ] Overbright emissive material tone maps instead of clipping to white.

### 5.2 Postprocess Suite Reset

Problem: postprocess lab is a proof panel, not an integrated visual path.

Build:

- [ ] Make postprocess operate on the renderer-owned frame graph output, not ad hoc screenshots or readback-only evidence.
- [ ] Implement or verify:
  - tone mapping
  - exposure
  - white point
  - bloom
  - FXAA
  - vignette
  - sharpening
  - saturation
  - temperature/tint
- [ ] Keep unimplemented effects blocked:
  - TAA
  - SSAO
  - SSR
  - DOF
  - motion blur
  - volumetrics
- [ ] Add a single `PostProcessSettings` type and defaults.
- [ ] Add browser pixel tests where each supported setting changes canonical scene pixels.

Files:

- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/PostProcessSettings.ts`
- `packages/rendering/src/RenderGraph.ts`
- `tests/unit/rendering/render-graph.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`
- `tools/external-parity-postprocess-suite/index.ts` or replacement engine-readiness audit

Done when:

- [ ] Canonical scene screenshot changes when each supported postprocess control changes.
- [ ] Unsupported effects remain blocked in reports.

## Phase 6: Reset Camera And Framing Defaults

### 6.1 Canonical Framing API

Problem: examples require too much hand-tuning and can frame objects badly or turn black after movement.

Build:

- [ ] Audit `packages/rendering/src/CameraFraming.ts`.
- [ ] Audit `packages/scene/src/PerspectiveCamera.ts`.
- [ ] Audit `packages/scene/src/OrthographicCamera.ts`.
- [ ] Add `fitCameraToBounds`.
- [ ] Add `computeOrbitDefaults`.
- [ ] Add `computeProductTurntableCamera`.
- [ ] Add `validateCameraFrame`.
- [ ] Add diagnostics:
  - subject bounds
  - camera distance
  - projected screen coverage
  - near/far planes
  - clipping warnings
  - visible object count
- [ ] Make renderer refuse to call a frame valid if subject coverage is below threshold.

Files:

- `packages/rendering/src/CameraFraming.ts`
- `packages/scene/src/PerspectiveCamera.ts`
- `packages/scene/src/OrthographicCamera.ts`
- `packages/input/src/controls/OrbitControls.ts`
- `packages/input/src/controls/SceneCameraAdapter.ts`
- `tests/unit/rendering/camera-framing.test.ts`
- `tests/unit/input/camera-controls.test.ts`
- `tests/browser/rendering-camera-scene.spec.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] Canonical scene starts framed without manual camera constants.
- [ ] Orbiting preserves visible subject coverage.
- [ ] A test fails if camera movement turns the scene black or clips the subject.

## Phase 7: Reset Asset-To-Render-Resource Ergonomics

### 7.1 One-Call Asset Loading To Renderable Scene

Problem: users should not need days to create a basic working example.

Build:

- [ ] Add `packages/assets/src/loadRenderableAsset.ts`.
- [ ] Add `packages/assets/src/createRenderableScene.ts`.
- [ ] Add `packages/assets/src/AssetRenderDefaults.ts`.
- [ ] Expose a simple API:
  - `loadRenderableAsset(urlOrBytes, options)`
  - `createRenderableScene(asset, options)`
  - `renderer.renderScene(renderableScene)`
- [ ] Defaults must include:
  - camera framing
  - lighting preset
  - environment
  - material fallback
  - texture decode
  - shadow receiver floor optional
  - postprocess default
- [ ] Add diagnostics for missing textures, unsupported extensions, fallback materials, and invisible bounds.

Files:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/AssetInspection.ts`
- `packages/assets/src/loadRenderableAsset.ts`
- `packages/assets/src/createRenderableScene.ts`
- `packages/assets/src/AssetRenderDefaults.ts`
- `packages/assets/src/index.ts`
- `packages/rendering/src/Renderer.ts`
- `tests/assets/external-parity-asset-corpus.test.ts`
- `tests/browser/asset-viewer-external-parity.spec.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] A canonical asset can be loaded and rendered with fewer than 30 lines of user code.
- [ ] Missing asset features report warnings, not blank output.
- [ ] Asset viewer output is not mostly empty UI.

### 7.2 glTF Feature Support Audit

Problem: full glTF parity is not real until features are implemented and rendered.

Build:

- [ ] Add `tools/engine-readiness-gltf-support/index.ts`.
- [ ] Create a local matrix for supported, partial, blocked:
  - mesh primitives
  - indices
  - normals
  - tangents
  - UV sets
  - vertex colors
  - textures
  - metallic-roughness
  - normal
  - occlusion
  - emissive
  - alpha mask
  - alpha blend
  - double sided
  - texture transform
  - morph targets
  - skinning
  - animation TRS
  - animation weights
  - KTX2/Basis
  - Draco or blocked
  - lights extension or blocked
  - cameras or blocked
- [ ] Every supported item must have a unit test and a browser visual test.
- [ ] Every blocked item must remain blocked in public claims.

Files:

- `tools/engine-readiness-gltf-support/index.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/AssetCompatibility.ts`
- `tests/assets/gltf-corpus.test.ts`
- `tests/assets/external-parity-asset-corpus.test.ts`
- `tests/browser/khronos-gltf-visual-external-parity.spec.ts`

Done when:

- [ ] The support matrix is generated from tests, not hand-written claims.
- [ ] Unsupported glTF features cannot be described as supported by docs or reports.

## Phase 8: Rebuild Visual Quality Gates

### 8.1 Replace Anti-Slop Metrics

Problem: current gates can reward grids, random panels, and noisy overlays.

Build:

- [ ] Replace `tools/external-parity-visual-quality/index.ts` with `tools/engine-readiness-visual-quality/index.ts`.
- [ ] Reject screenshots that contain:
  - debug overlay text
  - large JSON blocks
  - proof panels
  - grid spam covering the subject
  - mostly UI
  - mostly empty viewport
  - mostly flat color
  - subject too small
  - subject clipped
- [ ] Require semantic scene evidence:
  - subject coverage
  - material variation
  - shadow relation
  - lighting gradient
  - texture detail
  - postprocess changed pixels
  - no known debug-only labels in screenshot path
- [ ] Add `FrameVisualMetrics` fields:
  - subject bounding box ratio
  - UI pixel ratio
  - debug text ratio
  - grid line ratio
  - material-region count
  - shadow-region relation
  - texture-detail ratio
- [ ] Add unit tests for fake screenshots:
  - all-flat image fails
  - grid-only image fails
  - JSON-heavy image fails
  - debug-lab image fails
  - properly framed material scene passes

Files:

- `tools/external-parity-visual-quality/index.ts`
- `tools/engine-readiness-visual-quality/index.ts`
- `packages/rendering/src/FrameVisualMetrics.ts`
- `tests/unit/rendering/frame-visual-metrics.test.ts`
- `tests/unit/tools/engine-readiness-visual-quality.test.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] The current bad screenshots fail for the right reasons.
- [ ] The canonical scene passes without debug decoration.

### 8.2 Screenshot Manifest Reset

Problem: screenshot reports should not be accepted unless they point to current, non-debug, product-quality outputs.

Build:

- [ ] Add `tests/reports/engine-readiness-canonical-scene/manifest.json`.
- [ ] Add freshness validation for the canonical screenshot.
- [ ] Store only:
  - canonical screenshot
  - canonical variant screenshots
  - canonical metrics JSON
- [ ] Do not store current failed flagship screenshots as approval evidence.

Files:

- `tests/browser/rendering-canonical-scene.spec.ts`
- `tools/engine-readiness-root-readiness/index.ts`
- `tools/external-parity-report-freshness/index.ts` or replacement engine-readiness freshness tool
- `tests/reports/engine-readiness-canonical-scene/`

Done when:

- [ ] Engine readiness readiness fails if canonical screenshots are stale or missing.

## Phase 9: Build The Canonical Renderer Viability Scene

This is the only scene allowed before examples resume.

### 9.1 Canonical Scene Fixture

Build:

- [ ] Add `fixtures/engine-readiness/canonical-product-scene.json`.
- [ ] Add `fixtures/engine-readiness/canonical-product-scene.glb` if generated locally by code, or a generated JSON mesh fixture if GLB generation is not ready.
- [ ] Add `packages/rendering/src/CanonicalSceneFixtures.ts`.
- [ ] The scene must include:
  - main product object
  - ground/studio floor
  - backdrop
  - at least 5 materials
  - at least 3 texture slots
  - metal part
  - rough plastic part
  - glass/transparent part
  - emissive indicator
  - normal-mapped panel
  - directional shadow
  - environment reflection
  - HDR/postprocess
- [ ] No debug grids.
- [ ] No random detail used only to pass metrics.
- [ ] No UI panels in the screenshot.

Files:

- `fixtures/engine-readiness/canonical-product-scene.json`
- `packages/rendering/src/CanonicalSceneFixtures.ts`
- `packages/assets/src/createRenderableScene.ts`
- `tests/browser/rendering-canonical-scene.spec.ts`

Done when:

- [ ] The canonical scene renders from fixture through the normal public API.
- [ ] Screenshot is visually inspectable as a product render, not a diagnostic.

### 9.2 Canonical Browser Test

Build:

- [ ] Add `tests/browser/rendering-canonical-scene.spec.ts`.
- [ ] Test cases:
  - default scene renders visible subject
  - orbit camera preserves subject
  - material variants visibly change pixels
  - environment rotation changes metal pixels
  - shadow toggle changes shadow region
  - HDR/postprocess toggle changes bright/emissive region
  - resize preserves framing
  - screenshot has no debug overlay
- [ ] Write outputs:
  - `tests/reports/engine-readiness-canonical-scene/canonical.png`
  - `tests/reports/engine-readiness-canonical-scene/material-variant.png`
  - `tests/reports/engine-readiness-canonical-scene/shadow-toggle.png`
  - `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png`
  - `tests/reports/engine-readiness-canonical-scene/manifest.json`

Files:

- `tests/browser/rendering-canonical-scene.spec.ts`
- `tests/reports/engine-readiness-canonical-scene/`
- `tools/engine-readiness-visual-quality/index.ts`

Done when:

- [ ] The canonical browser test passes locally.
- [ ] Engine readiness visual quality passes on canonical screenshots.

## Phase 10: Rebuild Root Readiness Gate

### 10.1 New Engine Readiness Readiness Tool

Build:

- [ ] Add `tools/engine-readiness-root-readiness/index.ts`.
- [ ] It must check:
  - renderer pipeline tests pass
  - PBR material tests pass
  - texture/sampler tests pass
  - shadow integration tests pass
  - HDR/postprocess tests pass
  - camera/framing tests pass
  - asset ergonomics tests pass
  - canonical scene screenshots exist
  - canonical screenshots are fresh
  - canonical screenshots pass visual quality
  - current parity claims remain blocked
- [ ] It must not depend on Unity/Unreal or external machines.
- [ ] It must fail if examples are reintroduced before canonical gate passes.

Files:

- `tools/engine-readiness-root-readiness/index.ts`
- `package.json`
- `tests/unit/tools/engine-readiness-root-readiness.test.ts`

Done when:

- [ ] `pnpm engine-readiness:root` fails on missing root proof and passes only after canonical proof is green.

### 10.2 Package Scripts

Add scripts:

- [ ] `engine-readiness:typecheck`
- [ ] `engine-readiness:unit-rendering`
- [ ] `engine-readiness:truth`
- [ ] `engine-readiness:canonical-scene`
- [ ] `engine-readiness:visual-quality`
- [ ] `engine-readiness:assets`
- [ ] `engine-readiness:root`
- [ ] `engine-readiness:reports`
- [ ] `engine-readiness:product-viewer`
- [ ] `engine-readiness:examples`
- [ ] `engine-readiness:package-smoke`

Files:

- `package.json`
- `tools/engine-readiness-truth/index.ts`
- `tools/engine-readiness-root-readiness/index.ts`
- `tools/engine-readiness-gltf-support/index.ts`
- `tools/engine-readiness-package-smoke/index.ts`

Target command:

```sh
pnpm engine-readiness:root
```

This becomes the only green light to work on public examples again.

Script definitions:

```json
{
  "engine-readiness:typecheck": "pnpm typecheck",
  "engine-readiness:unit-rendering": "pnpm exec vitest run tests/unit/rendering --reporter=dot",
  "engine-readiness:truth": "tsx --tsconfig tsconfig.base.json tools/engine-readiness-truth/index.ts",
  "engine-readiness:canonical-scene": "pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line",
  "engine-readiness:visual-quality": "tsx --tsconfig tsconfig.base.json tools/engine-readiness-visual-quality/index.ts",
  "engine-readiness:assets": "tsx --tsconfig tsconfig.base.json tools/engine-readiness-gltf-support/index.ts && pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line",
  "engine-readiness:root": "pnpm engine-readiness:typecheck && pnpm engine-readiness:unit-rendering && pnpm engine-readiness:canonical-scene && pnpm engine-readiness:visual-quality && tsx --tsconfig tsconfig.base.json tools/engine-readiness-root-readiness/index.ts",
  "engine-readiness:reports": "pnpm engine-readiness:truth && pnpm engine-readiness:visual-quality && tsx --tsconfig tsconfig.base.json tools/engine-readiness-root-readiness/index.ts",
  "engine-readiness:product-viewer": "pnpm exec playwright test tests/browser/product-viewer-engine-readiness.spec.ts --reporter=line",
  "engine-readiness:examples": "pnpm exec playwright test tests/browser/product-viewer-engine-readiness.spec.ts tests/browser/material-studio-engine-readiness.spec.ts tests/browser/asset-viewer-engine-readiness.spec.ts tests/browser/rendering-showcase-engine-readiness.spec.ts --reporter=line",
  "engine-readiness:package-smoke": "tsx --tsconfig tsconfig.base.json tools/engine-readiness-package-smoke/index.ts"
}
```

## Phase 11: Only After Root Gate Passes, Rebuild Examples

Examples restart from zero and consume the canonical renderer APIs. No example gets custom rendering shortcuts.

### 11.1 Public Example 1: Product Viewer

Build after root gate passes:

- [ ] Create `examples/legacy-product-viewer/index.html`.
- [ ] Create `examples/legacy-product-viewer/main.ts`.
- [ ] Use `loadRenderableAsset` or canonical fixture loader.
- [ ] Use `LightingDefaults.studioProduct`.
- [ ] Use `fitCameraToBounds`.
- [ ] Use renderer-owned shadow and postprocess.
- [ ] No debug overlays in default screenshot.
- [ ] Add controls only after default screenshot is visually good.
- [ ] Add screenshot test `tests/browser/product-viewer-engine-readiness.spec.ts`.

Done when:

- [ ] Screenshot looks like a product viewer, not a proof harness.
- [ ] Test fails on blank, clipped, flat, or debug output.

### 11.2 Public Example 2: Material Studio

Build after product viewer passes:

- [ ] Create `examples/legacy-material-studio/index.html`.
- [ ] Create `examples/legacy-material-studio/main.ts`.
- [ ] Render material spheres or models under identical lighting.
- [ ] Include metal, plastic, glass, emissive, normal map, alpha, texture transform.
- [ ] No grid spam.
- [ ] Add `tests/browser/material-studio-engine-readiness.spec.ts`.

Done when:

- [ ] The screenshot clearly demonstrates material differences.

### 11.3 Public Example 3: Asset Viewer

Build after asset ergonomics gate passes:

- [ ] Replace current `examples/asset-viewer/main.ts` or create `examples/legacy-asset-viewer/main.ts`.
- [ ] Default viewport must be the asset, not UI.
- [ ] UI must not dominate screenshots.
- [ ] Add drag/drop only after render defaults work.
- [ ] Add `tests/browser/asset-viewer-engine-readiness.spec.ts`.

Done when:

- [ ] A loaded asset is framed and lit by default with fewer than 30 user-facing setup lines.

### 11.4 Public Example 4: Shadow And Postprocess Showcase

Build after canonical shadow/postprocess gates pass:

- [ ] Create `examples/legacy-rendering-showcase/index.html`.
- [ ] Create `examples/legacy-rendering-showcase/main.ts`.
- [ ] Use one real scene, not diagnostic boxes.
- [ ] Include toggleable shadow and postprocess controls.
- [ ] Default screenshot must be clean scene output.
- [ ] Diagnostics can be hidden behind a collapsible panel, not visible by default.
- [ ] Add `tests/browser/rendering-showcase-engine-readiness.spec.ts`.

Done when:

- [ ] The scene remains visually coherent with controls toggled.

## Phase 12: Kill Criteria

Kill or pivot the project if any of these remain true after the engine readiness implementation attempt:

- [ ] The canonical scene cannot be made to look acceptable without debug overlays or fake grid/detail spam.
- [ ] The renderer cannot produce visible PBR material variation under sane lighting.
- [ ] Camera/framing cannot keep the subject visible through basic orbit/resize.
- [ ] Asset-to-render-resource setup still requires example-specific custom code for basic rendering.
- [ ] Shadows and postprocess still only work as diagnostic panels, not integrated scene features.
- [ ] The new visual-quality gate can be passed by noisy fake detail but not by clean product rendering.

Pivot option if killed:

- [ ] Keep editor/runtime/assets/scripting code that has independent value.
- [ ] Replace the custom renderer with Three.js or Babylon.js as a backend.
- [ ] Reposition G3D as a higher-level editor/runtime/tooling layer, not a renderer parity project.

## Prompt-To-Artifact Checklist

Use this checklist before claiming the engine readiness is complete.

### Explicit Requirements From This Plan

- [ ] `docs/project/v4-engine-readiness-plan.md` exists and is current.
- [ ] Failed examples are quarantined or removed from public example index.
- [ ] False parity tooling is removed from required scripts.
- [ ] Stale reports are deleted or regenerated under engine-readiness report paths.
- [ ] Root renderer pipeline has a single public render contract.
- [ ] Frame graph owns HDR, shadow, forward, postprocess, and presentation pass order.
- [ ] PBR shader behavior is tested by numeric and browser evidence.
- [ ] Texture/sampler/color-space behavior is tested.
- [ ] Environment lighting visibly affects material output.
- [ ] Real shadow map sampling affects canonical scene pixels.
- [ ] HDR/postprocess path affects canonical scene pixels.
- [ ] Camera/framing preserves subject visibility.
- [ ] Asset loader can build a renderable scene with sane defaults.
- [ ] glTF support matrix is generated from tests.
- [ ] Visual-quality gate rejects debug/noise/grid/flat screenshots.
- [ ] Canonical scene browser test exists and passes.
- [ ] Engine readiness root readiness tool exists and passes.
- [ ] Public examples are rebuilt only after root readiness passes.

### Required Commands

Run before declaring success:

```sh
pnpm typecheck
pnpm exec vitest run tests/unit/rendering --reporter=dot
pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line
pnpm exec tsx --tsconfig tsconfig.base.json tools/engine-readiness-visual-quality/index.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/engine-readiness-root-readiness/index.ts
```

Optional after public examples are rebuilt:

```sh
pnpm exec playwright test tests/browser/product-viewer-engine-readiness.spec.ts tests/browser/material-studio-engine-readiness.spec.ts tests/browser/asset-viewer-engine-readiness.spec.ts tests/browser/rendering-showcase-engine-readiness.spec.ts --reporter=line
```

### Evidence Files

Required evidence:

- [ ] `tests/reports/engine-readiness-canonical-scene/canonical.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/material-variant.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/shadow-toggle.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png`
- [ ] `tests/reports/engine-readiness-canonical-scene/manifest.json`
- [ ] `tests/reports/engine-readiness-visual-quality.json`
- [ ] `tests/reports/engine-readiness-root-readiness.json`

These evidence files must be generated by tests/tools, not hand-edited.

## Final Decision Gate

After this plan is implemented, make one of two decisions:

1. Continue G3D as a custom renderer project only if the canonical scene is visually acceptable and the root readiness gate passes.
2. Kill or pivot the custom renderer if the canonical scene still looks bad or requires fake visual tricks.

No parity language is allowed until this engine readiness succeeds.

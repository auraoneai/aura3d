# Codebase Map

Version: 1.0.0

This map gives agents the fastest path from a user request to the likely source, tests, docs, and verification command.

## Top-Level Layout

| Path | Purpose |
|---|---|
| `packages/` | First-party TypeScript packages and public SDK surfaces. |
| `apps/` | Current local browser showcase routes. Only the root registry, advanced gallery, and `wow-*` routes are allowed. |
| `docs/` | Current source documentation, governance docs, API docs, and this agent orientation pack. |
| `tests/unit/` | Fast package and tool coverage. Prefer this for shared runtime behavior. |
| `tests/integration/` | Cross-package contracts such as engine loop, scene/ECS, physics/animation, and create-aura3d flows. |
| `tests/browser/` | Playwright coverage for canvas, browser APIs, route health, visual acceptance, templates, and browser-only behavior. |
| `tests/reports/` | Ignored generated evidence and local reports. Regenerate before using as proof. |
| `tools/` | Report generators, readiness gates, claim checks, docs/API verifiers, package checks, and migration tooling. |
| `templates/` | Starter project templates shipped or tested from the repo. |
| `packages/create-aura3d/templates/` | CLI template source for `@aura3d/create-aura3d`. |
| `benchmarks/` | Three.js and Babylon.js comparison scaffolds. |

## Package Ownership

| Package | Source | Use it for |
|---|---|---|
| `@aura3d/engine` | `packages/engine/src` | Root facade, app helpers, diagnostics helpers, advanced and production runtime subpaths. |
| `@aura3d/apps` | `packages/apps/src` | `createA3DApp`, quality presets, workflow rendering through app lifecycle. |
| `@aura3d/core` | `packages/core/src` | Engine loop, scheduling, diagnostics, events, resource scopes, disposal. |
| `@aura3d/math` | `packages/math/src` | Vectors, matrices, quaternions, colors, rays, bounds, planes, frustums, interpolation. |
| `@aura3d/scene` | `packages/scene/src` | Object3D-style hierarchy, cameras, lights, renderables, scene serialization, queries. |
| `@aura3d/ecs` | `packages/ecs/src` | Entity/component/system runtime organization. |
| `@aura3d/rendering` | `packages/rendering/src` | Renderer facade, WebGL2/WebGPU devices, geometry, materials, shaders, textures, render targets, shadows, postprocess, diagnostics. |
| `@aura3d/assets` | `packages/assets/src` | glTF/GLB, OBJ/MTL, HDR/EXR/image/texture helpers, render-resource conversion, asset inspection, compression hooks, diagnostics. |
| `@aura3d/animation` | `packages/animation/src` | Clips, tracks, mixers, layers, skeletons, skinning, morphs, IK, root motion, motion quality. |
| `@aura3d/physics` | `packages/physics/src` | Rigid bodies, colliders, constraints, raycasts, broadphase, character helpers, scene sync. |
| `@aura3d/controls` | `packages/controls/src` | Orbit, trackball, map, fly, first-person, drag, transform, picking, annotations. |
| `@aura3d/input` | `packages/input/src` | Keyboard, pointer, gamepad, gestures, action maps, WebXR controller and hit-test helpers. |
| `@aura3d/audio` | `packages/audio/src` | Audio clips, mixers, listener/source, spatial audio, scene audio bridge, effects fixtures. |
| `@aura3d/materials` | `packages/materials/src` | Material presets, material validation, texture sets, preview scenes, node material helpers. |
| `@aura3d/environments` | `packages/environments/src` | HDRI environment registry, PMREM presets, environment preview. |
| `@aura3d/product-studio` | `packages/product-studio/src` | Product assets, materials, cameras, lighting, floors, export, diagnostics, product render scenes. |
| `@aura3d/workflows` | `packages/workflows/src` | Asset viewer, product configurator, material studio, scene showcase, interactive scene, animation lab, comparison, production workflows. |
| `@aura3d/editor-runtime` | `packages/editor-runtime/src` | Commands, history, editor state, hierarchy/inspector models, gizmos, prefab/project/timeline/shader-graph runtime. |
| `@aura3d/editor` | `packages/editor/src` | Public editor package shell. |
| `@aura3d/scripting` | `packages/scripting/src` | Behavior trees, state machines, GOAP, HTN, utility AI, perception, visual graph, behavior host/system. |
| `@aura3d/debug` | `packages/debug/src` | Debug overlays, profilers, inspectors, trace export, render/material/shader/resource diagnostics. |
| `@aura3d/three-compat` | `packages/three-compat/src` | Three.js-like compatibility classes, loaders, controls, materials, postprocess, migration adapter, compatibility matrix. |

## Runtime Entry Points

Use these public APIs before reaching for lower-level internals:

```ts
import { createA3DApp } from "@aura3d/engine";
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";
import { Renderer } from "@aura3d/engine/rendering";
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
```

The app API is the fastest path for workflow presets. The advanced runtime is the clearest path for direct renderer/scene control.

## Current App Routes

| Route group | Source | Tests |
|---|---|---|
| Root route registry | `index.html` | `tests/browser/current-routes-route-health.spec.ts` |
| Advanced gallery | `apps/advanced-examples-gallery/` | `tests/browser/advanced-examples-gallery.spec.ts`, `tests/unit/apps/advanced-gallery-*` |
| Authored showcase routes | `apps/wow-*` plus `apps/wow-common/` | `tests/browser/wow-showcase-screenshots.spec.ts`, focused `wow-*` unit/browser tests |

The route metadata for advanced gallery demos is `apps/advanced-examples-gallery/src/metadata.ts`.

## Tooling Families

| Tool family | Use |
|---|---|
| `tools/current-routes-*` | Root registry allowlist, route health, visual review, current-route import and asset checks. |
| `tools/advanced-gallery-*` | Advanced gallery screenshot capture, visual review, report audit, evidence path handling. |
| `tools/api-docs` | Regenerates and verifies `docs/api/public-api.md`. |
| `tools/doc-contradiction-scan`, `tools/docs-version-alignment` | Docs consistency and path/version checks. |
| `tools/verify-*` | Architecture, package boundaries, exports, imports, shaders, source cleanliness, trace checks. |
| `tools/threejs-parity-*` | Three.js parity, migration, performance, visual review, and route-health evidence. |
| `tools/superiority-*` | Evidence-bound superiority categories and claim defense. |
| `tools/foundation-*`, `tools/external-parity-*`, `tools/production-runtime-*`, `tools/three-compat-*` | Larger readiness lanes. Use only the focused lane matching the change; do not assume every aggregate is cheap. |

## Test Placement

| Change | Preferred test location |
|---|---|
| Pure math/core/runtime behavior | `tests/unit/math`, `tests/unit/core`, or matching package area. |
| Rendering materials, passes, buffers, resource lifecycle | `tests/unit/rendering`, then browser if canvas behavior changes. |
| Assets, glTF, compression, import diagnostics | `tests/assets` or `tests/unit/assets`, plus browser for real fetch/render paths. |
| Animation runtime | `tests/unit/animation`, `tests/unit/apps` for gallery route wiring, browser for imported GLB animation route behavior. |
| Physics | `tests/unit/physics`, integration tests for scene/animation sync. |
| Workflows/templates | `tests/unit/workflows`, `tests/integration/*create-aura3d*`, `tests/browser/*template*`. |
| Docs/tools | `tests/unit/tools`, `pnpm verify:docs-consistency`, `pnpm verify:docs-version`. |
| Local route changes | `tests/browser/current-routes-route-health.spec.ts`, `tests/browser/advanced-examples-gallery.spec.ts`, or `tests/browser/wow-showcase-screenshots.spec.ts`. |


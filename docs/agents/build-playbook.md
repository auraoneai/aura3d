# Build Playbook For Agents

Version: 1.0.0

Use this when a user asks an AI agent to build, fix, document, or verify something in A3D.

## Triage The Request

Classify the request before editing:

| User asks for | Start in |
|---|---|
| New SDK behavior | Owning `packages/*/src`, public API docs, focused unit tests. |
| Rendering feature or visual fix | `packages/rendering/src`, relevant route/app, rendering docs, unit plus browser evidence. |
| Asset/glTF support | `packages/assets/src`, fixtures/corpus tests, asset docs. |
| Animation/skinning/morph behavior | `packages/animation/src`, `packages/assets/src/GLTFAnimationRuntime.ts`, rendering skinning code, route tests. |
| Physics behavior | `packages/physics/src`, scene/physics bridge tests, physics docs. |
| Product/workflow app behavior | `packages/workflows/src`, `packages/product-studio/src`, app route if visible. |
| Docs only | Existing docs page plus `docs/agents` if the guidance changes. |
| Route/gallery work | `index.html`, `apps/advanced-examples-gallery`, `apps/wow-*`, route-health tests/tools. |
| Public claims | Claim docs plus current generated evidence lane. |

## Source Rules

- Keep implementation in the owning package. Avoid reaching across package internals.
- Use public imports from `@aura3d/*` or exported root subpaths where possible.
- Update `src/index.ts` only when the API should be public.
- If a public export changes, regenerate/check API docs with `pnpm verify:api-docs`.
- Keep renderer, asset, app, and workflow ownership separate. A route should compose package behavior, not become the only implementation.
- Every long-lived app, renderer, device, asset resource, listener, or lifecycle owner needs an explicit cleanup path.
- Keep route labels, docs, tests, and metadata synchronized when a route changes.

## Common Recipes

### Add Package Behavior

1. Find the package owner in [codebase-map.md](codebase-map.md).
2. Add implementation under `packages/<area>/src`.
3. Export through `packages/<area>/src/index.ts` if public.
4. Add focused tests under `tests/unit/<area>`.
5. Run a focused test and `pnpm typecheck`.
6. Update docs if behavior or API changed.

### Add Or Change Renderer Behavior

1. Inspect `packages/rendering/src/index.ts` and the specific renderer module.
2. Add unit coverage for deterministic data, state, bounds, render-queue, material, shader, or resource behavior.
3. Use browser tests when the change depends on real canvas, WebGL2, WebGPU, screenshots, or route health.
4. Update rendering docs if the feature changes public expectations.
5. Avoid broad claims unless the matching route/report lane passes.

### Add Or Change Asset Loading

1. Start in `packages/assets/src`.
2. Prefer structured loader/parser changes over ad hoc string handling.
3. Update inspection/diagnostics when a new asset capability can fail or be unsupported.
4. Add fixture or corpus coverage when possible.
5. Update docs in `docs/assets` or `docs/concepts/assets.md`.

### Add Or Change A Browser Route

The current repo intentionally has a narrow local route surface.

1. If the route is advanced-gallery work, add it to `apps/advanced-examples-gallery/src/metadata.ts` and route composition.
2. If the route is authored-showcase work, place it under `apps/wow-*` and reuse `apps/wow-common`.
3. Update root `index.html` so the registry remains the single source of truth.
4. Update `tests/browser/current-routes-route-health.spec.ts` and `tools/current-routes-*` allowlist logic when the route count or path set changes.
5. Run current route-health and the gallery or wow screenshot lane.
6. Do not create a new top-level `examples/` tree.

### Change Advanced Gallery Visuals

1. Read [docs/examples/advanced-gallery.md](../examples/advanced-gallery.md).
2. Change route code, route-specific modules, authored layer policies, or metadata.
3. Run focused tests first.
4. Regenerate gallery evidence only when the visual/source changes are ready:

```sh
pnpm advanced-gallery:pipeline
```

Accepted-gallery wording is valid only when screenshot, metadata hash, review, and audit all describe the same generated report set.

### Update Public Documentation

1. Verify every path, command, route, and package name against the repo.
2. Prefer evidence-scoped language.
3. Add or update links in `docs/project/documentation-index.md` and `docs/project/site-map.md` when adding a new major doc area.
4. Run docs checks.

## Import Guidance

Use these styles for consumer-facing examples:

```ts
import { createA3DApp } from "@aura3d/engine";
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";
import { Renderer } from "@aura3d/engine/rendering";
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
```

Inside packages, follow existing local patterns. Many package source files import sibling modules directly, while cross-package imports should use package aliases from `tsconfig.base.json`.

## Documentation Sync Checklist

Before finishing a code change, check whether these must also change:

- `docs/api/public-api.md` for exported API.
- `docs/project/getting-started.md` for route/server/command changes.
- `docs/project/site-map.md` for new major docs or removed docs.
- `docs/examples/advanced-gallery.md` for gallery metadata, route, or evidence changes.
- `docs/project/claim-guidelines.md` and `docs/project/known-limits.md` for claim boundary changes.
- This `docs/agents` folder when the agent workflow itself changes.


# AI Agent Orientation

Version: 1.0.0

This folder is the fast-read layer for AI coding agents working in Aura3D / A3D. It is intentionally shorter than the full documentation set and points agents to the files, package entrypoints, routes, tests, and evidence rules that matter before changing code.

## Read Order

1. [Agent context pack](agent-context.md): one-page repo summary and operating rules.
2. [Codebase map](codebase-map.md): where packages, apps, templates, tests, reports, and tools live.
3. [Build playbook](build-playbook.md): how to add or change features without fighting the repo structure.
4. [Verification guide](verification.md): which commands prove which kind of change.
5. [Claims and boundaries](claims-and-boundaries.md): how to write docs and product claims without overstating evidence.

## What A3D Is

A3D is a TypeScript-first browser 3D engine and workflow SDK. The codebase owns first-party packages for rendering, assets, animation, physics, controls, input, workflows, diagnostics, editor-runtime utilities, and Three.js migration helpers. A3D is not a runtime wrapper around Three.js. Three.js is used as a reference implementation for tests, benchmark baselines, migration analysis, and compatibility checks.

## Best Primary Sources

Read these when the requested change touches the matching area:

| Need | Start with |
|---|---|
| Current repo state | [docs/project/current-state.md](../project/current-state.md) |
| Install, local server, routes | [docs/project/getting-started.md](../project/getting-started.md) |
| Public package surface | [docs/api/public-api.md](../api/public-api.md) |
| App API | [docs/api/app-api.md](../api/app-api.md) |
| Rendering concepts | [docs/concepts/rendering.md](../concepts/rendering.md), [docs/rendering/renderer-lifecycle.md](../rendering/renderer-lifecycle.md) |
| Assets and glTF | [docs/concepts/assets.md](../concepts/assets.md), [docs/assets/gltf-compression.md](../assets/gltf-compression.md) |
| Animation | [docs/concepts/animation.md](../concepts/animation.md), [docs/animation/runtime-support.md](../animation/runtime-support.md) |
| Physics | [docs/concepts/physics.md](../concepts/physics.md), [docs/physics/runtime.md](../physics/runtime.md) |
| Workflows | [docs/workflows/product-and-authoring-workflows.md](../workflows/product-and-authoring-workflows.md) |
| Local showcase routes | [docs/examples/advanced-gallery.md](../examples/advanced-gallery.md), root `index.html` |
| Claims and public wording | [docs/project/claim-guidelines.md](../project/claim-guidelines.md), [docs/project/known-limits.md](../project/known-limits.md) |
| Three.js comparison language | [docs/project/threejs-parity-status.md](../project/threejs-parity-status.md), [docs/project/threejs-superiority-status.md](../project/threejs-superiority-status.md) |

## Current Local Route Rule

The root `index.html` is the single local example registry. It links only ten advanced gallery deep links under `/apps/advanced-examples-gallery/#...`, four focused Aura3D library examples under `/apps/wow-*`, and twelve authored showcase app routes under `/apps/wow-*`.

The legacy `examples/` tree and older standalone app route folders are intentionally pruned. Do not recreate or document extra local examples unless the user explicitly asks to restore the route surface and the allowlist, route-health tests, docs, and tools are updated together.

## Agent Defaults

- Prefer public package entrypoints from `package.json` and `docs/api/public-api.md`.
- Keep package changes inside the owning `packages/*/src` module and export new public API from that package's `src/index.ts` only when consumers need it.
- Add focused unit tests under `tests/unit/<area>/` for shared behavior.
- Add browser tests only when a change affects rendering, DOM routes, canvas output, asset loading in browser, or route health.
- Update docs when behavior, routes, public API, commands, or claim boundaries change.
- Tie claims to current code, tests, routes, and generated reports. If evidence is stale or absent, use narrower language.

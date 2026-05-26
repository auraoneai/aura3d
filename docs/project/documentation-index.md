# A3D Documentation Index

Version: 1.0.0

This is the current entry point for `/docs`. The previous generated roadmap and milestone document pile has been removed or collapsed into this smaller set of current, code-backed pages.

## Current Repo Shape

A3D is a TypeScript-first browser 3D engine and workflow SDK. The repository contains first-party packages, app routes, templates, benchmarks, tests, and report generators.

Current package areas include:

| Area | Current package or folder |
|---|---|
| Root SDK | `@aura3d/engine` |
| Runtime helpers | `@aura3d/engine-runtime` |
| Rendering | `@aura3d/rendering` |
| Assets and loaders | `@aura3d/assets` |
| Animation and skinning | `@aura3d/animation` |
| Scene graph | `@aura3d/scene` |
| Controls and input | `@aura3d/controls`, `@aura3d/input` |
| Materials and environments | `@aura3d/materials`, `@aura3d/environments` |
| Product/workflow systems | `@aura3d/product-studio`, `@aura3d/workflows`, `@aura3d/apps` |
| Editor/runtime systems | `@aura3d/editor-runtime`, `@aura3d/editor` |
| Supporting systems | `@aura3d/core`, `@aura3d/math`, `@aura3d/physics`, `@aura3d/audio`, `@aura3d/scripting`, `@aura3d/debug`, `@aura3d/three-compat` |

## Current High-Signal Docs

| Purpose | Doc |
|---|---|
| AI agent orientation | `docs/agents/README.md` |
| AI agent context pack | `docs/agents/agent-context.md` |
| Current state | `docs/project/current-state.md` |
| Getting started | `docs/project/getting-started.md` |
| API overview | `docs/api/readme.md` |
| Generated public API | `docs/api/public-api.md` |
| Three.js superiority status | `docs/project/threejs-superiority-status.md` |
| Superiority evidence workflow | `docs/project/superiority-evidence-workflow.md` |
| Three.js parity status | `docs/project/threejs-parity-status.md` |
| Verification summary | `docs/project/verification-evidence.md` |
| Completion audit | `docs/project/completion-audit.md` |
| Claim guidelines | `docs/project/claim-guidelines.md` |
| Known limits | `docs/project/known-limits.md` |
| Migration | `docs/project/migration.md` |
| Compatibility | `docs/project/compatibility.md` |
| Site map | `docs/project/site-map.md` |

## Domain Docs

- `docs/agents/`
- `docs/api/`
- `docs/animation/`
- `docs/assets/`
- `docs/benchmarks/`
- `docs/comparisons/`
- `docs/concepts/`
- `docs/controls/`
- `docs/debug/`
- `docs/editor/`
- `docs/examples/`
- `docs/physics/`
- `docs/rendering/`
- `docs/templates/`
- `docs/workflows/`

## Evidence Layout

Current parity report generators write to `tests/reports/threejs-parity/`. Current Three.js superiority aggregate generators write to `tests/reports/superiority/`. The `tests/reports/` directory is ignored by git, so report files are local generated evidence, not durable source files.

## Maintenance Rules

- Prefer fewer current docs over historical milestone archives.
- Keep public claims tied to package code, tests, routes, and generated reports.
- Do not keep obsolete roadmap docs as history unless they still explain current behavior.
- If a doc references a path, command, route, package, or report, verify it against the current repo before editing.

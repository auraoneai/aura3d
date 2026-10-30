# Site Map

Version: 4.6.2

Current release: Aura3D 4.6.2.

Date: 2026-10-15
Status: Aura3D 4.6.2 site map

## Public Marketing Pages

Public marketing pages must use `docs/project/launch-positioning.md` as their
copy boundary and must not present prototypes as public release examples.

| Path | Public purpose | Claim boundary |
| --- | --- | --- |
| `/` | Product overview | Agent-friendly TypeScript browser 3D SDK with typed assets and diagnostics. |
| `/docs/index.html` | Docs landing page | Link to current root API, asset workflow, limitations, and release evidence. |
| `/docs/agent-quickstart.html` | Agent quickstart | Start with `llms.txt`, typed assets, and public `@aura3d/engine`. |
| `/docs/assets.html` | Typed asset workflow | CLI asset add/resolve, generated `aura-assets.ts`, no string IDs. |
| `/docs/templates.html` | Template docs | Templates are starters; game templates need playability evidence before game claims. |
| `/docs/api.html` | API overview | Public root API only; mark internal/experimental surfaces clearly. |
| `/docs/claims.html` | Claims and release notes | Link claim labels, release tracks, and known limits. |
| `/docs/evidence.html` | Evidence summary | Route-health, screenshots, asset validation, package checks, benchmark gates. |

## Canonical Repo Docs

- [Current state](status/current-state.md)
- [Product boundaries](../agents/claims-and-boundaries.md)
- [Known limits](status/known-limits.md)
- [Claim guidelines](claim-guidelines.md)
- [Competitive positioning](competitive-positioning.md)
- [Release checklist](release/release-checklist.md)
- [Release process](release-process.md)
- [Aura3D 4.0.0 release notes](../archive/docs/project/aura3d-400-release-notes.md)
- [2.0 platform architecture](../archive/docs/architecture/2.0-platform.md)
- [Aura3D Three.js comparison status](threejs-superiority-status.md)
- [Verification evidence](verification-evidence.md)
- [Showcase quality gates](showcase/quality-gates.md)
- [Apps classification](showcase/apps-classification.md)
- [`createAuraApp` production bridge architecture](architecture/create-aura-app-production-bridge.md)
- [Frozen benchmark release gates](frozen-benchmark-release-gates.md)
- [Superiority evidence workflow](superiority-evidence-workflow.md)
- [Marketing site](../../marketing/index.html)

## Local Example Routes

- `/apps/hello-world-typed-asset/`: starter typed asset route.
- `/apps/material-lighting/`: starter material/light route with scoped claims.
- `/apps/camera-path/`: starter camera/timeline route.
- `/apps/advanced-examples-gallery/`: retained evidence/gallery route; not a
  starter template or broad public root proof by default.

## Showcase Routes

Showcase routes must be linked only with their classification from
`docs/project/showcase/apps-classification.md` and their evidence status from
`docs/project/showcase/quality-gates.md`.

Blocked, playable-showcase, and internal-diagnostic routes should not appear as
public release cards.

## Release And API References

- [Public API reference](../api/public-api.md)
- [Getting-started real-scene tutorial](tutorials-getting-started-real-scene.md)
- [Changelog](../../CHANGELOG.md)

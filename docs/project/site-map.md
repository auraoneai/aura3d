# Site Map

Date: 2026-06-18
Status: remediation site map

## Public Marketing Pages

Public marketing pages must use `docs/project/launch-positioning.md` as their
copy boundary and must not present prototypes as public release examples.

| Path | Public purpose | Claim boundary |
| --- | --- | --- |
| `/marketing/index.html` | Product overview | Agent-friendly TypeScript browser 3D SDK with typed assets and diagnostics. |
| `/marketing/docs/index.html` | Docs landing page | Link to current root API, asset workflow, limitations, and release evidence. |
| `/marketing/docs/agent-quickstart.html` | Agent quickstart | Start with `llms.txt`, typed assets, and public `@aura3d/engine`. |
| `/marketing/docs/assets.html` | Typed asset workflow | CLI asset add/resolve, generated `aura-assets.ts`, no string IDs. |
| `/marketing/docs/templates.html` | Template docs | Templates are starters; game templates need playability evidence before game claims. |
| `/marketing/docs/api.html` | API overview | Public root API only; mark internal/experimental surfaces clearly. |
| `/marketing/docs/claims.html` | Claims and release notes | Link claim labels, release tracks, and known limits. |
| `/marketing/docs/evidence.html` | Evidence summary | Route-health, screenshots, asset validation, package checks, benchmark gates. |

## Canonical Repo Docs

- [Current state](current-state.md)
- [Product boundaries](product-boundaries.md)
- [Known limits](known-limits.md)
- [Claim guidelines](claim-guidelines.md)
- [Launch positioning](launch-positioning.md)
- [Release tracks](release-tracks.md)
- [Release checklist](release-checklist.md)
- [Release process](release-process.md)
- [Aura3D 1.4.0 release candidate](aura3d-140-release-candidate.md)
- [Aura3D 1.4.0 release notes draft](aura3d-140-release-notes.md)
- [Aura3D 1.4.1 release notes](aura3d-141-release-notes.md)
- [Verification evidence](verification-evidence.md)
- [Showcase quality gates](showcase-quality-gates.md)
- [Showcase application plan](showcase-application-plan.md)
- [Apps classification](apps-classification.md)
- [Library gap roadmap](library-gap-roadmap.md)
- [`createAuraApp` production bridge architecture](createAuraApp-production-bridge-architecture.md)
- [Docs matrix tracking](docs-matrix-tracking.md)
- [Frozen benchmark release gates](frozen-benchmark-release-gates.md)
- [Superiority evidence workflow](superiority-evidence-workflow.md)
- [Marketing site](marketing-site.md)

## Local Example Routes

- `/apps/hello-world-typed-asset/`: starter typed asset route.
- `/apps/material-lighting/`: starter material/light route with scoped claims.
- `/apps/camera-path/`: starter camera/timeline route.
- `/apps/advanced-examples-gallery/`: retained evidence/gallery route; not a
  starter template or broad public root proof by default.

## Showcase Routes

Showcase routes must be linked only with their classification from
`docs/project/apps-classification.md` and their evidence status from
`docs/project/showcase-quality-gates.md`.

Blocked, prototype-blocked, and internal-diagnostic routes should not appear as
public release cards.

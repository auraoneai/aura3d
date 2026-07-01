# DOCS KNOWLEDGE BASE

**Scope:** `docs/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 14 - canonical claim, release, and API wording.

## OVERVIEW

Docs are a release surface. Capability wording must match the evidence path:
root safe API, production-runtime, rendering internals, CLI asset pipeline,
template-only scaffold, prototype, or roadmap.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Agent rules | `agents/claims-and-boundaries.md`, `agents/asset-workflow.md`, `agents/templates.md` | Canonical public boundaries. |
| API docs | `api/` | Match exported public symbols and tests. |
| Release/process docs | `project/` | Release gates, current state, product boundaries, evidence. |
| Rendering docs | `rendering/`, `concepts/rendering.md` | Internal/runtime wording must stay labeled. |
| Examples docs | `examples/`, `guides/` | Public code snippets and route claims. |

## CONVENTIONS

- Read `docs/agents/claims-and-boundaries.md` before editing public wording.
- Use present-tense production language only when current evidence proves the
  exact path.
- Preserve capability labels; do not replace them with vague marketing copy.
- Code snippets must compile against public exports and typed asset patterns.
- Update release matrices and checklists only from real commands or named
  reports, not intent.

## ANTI-PATTERNS

- Do not cite renderer internals as root API support.
- Do not write "production", "parity", "WebGPU", "PBR", "skinned animation",
  "morph targets", or "game kit" without the matching evidence.
- Do not document raw URLs, string model IDs, direct loaders, or primitive-only
  named subjects as accepted public patterns.
- Do not edit generated report JSON in docs/project as if it were prose.

## VERIFY

Use docs-oriented scripts when relevant: `pnpm check:agent-docs`,
`pnpm check:docs-site`, `pnpm check:docs-codeblocks`,
`pnpm verify:docs-version`, and release-readiness gates.

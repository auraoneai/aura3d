# CREATE-AURA3D KNOWLEDGE BASE

**Scope:** `packages/create-aura3d/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 16 - scaffold generator and template contract.

## OVERVIEW

This package owns the `create-aura3d` scaffold command and packaged templates.
Template changes are public API changes because users copy the generated app as
their starting point.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Template list | `src/index.ts` | `CREATE_AURA3D_TEMPLATES` is authoritative. |
| CLI entry | `src/cli.ts` | Command dispatch to `createA3DProject`. |
| Package templates | `templates/` | Source copied into new projects. |
| Template tests | `templates/*/tests/` | Route-health, screenshot, playable checks. |
| Animation studio tool | `templates/animation-studio/scripts/` | Scene document command workflow. |

## CONVENTIONS

- Keep `CREATE_AURA3D_TEMPLATES`, template directories, package files, docs,
  and smoke tests aligned.
- Generated projects must depend on `@aura3d/engine` and use public imports.
- The copy filter excludes `node_modules`, `dist`, and `test-results`; do not
  rely on those directories for scaffold behavior.
- Overlapping top-level `templates/` should stay behaviorally aligned with the
  package template of the same name.
- Template README text is public claim text; label it as scaffold/prototype
  unless tests prove more.

## ANTI-PATTERNS

- Do not add a template that uses raw model paths, raw URLs, direct loaders, or
  primitives as named primary subjects.
- Do not make a visual or game template pass only by DOM smoke checks.
- Do not weaken route-health/screenshot/playable tests to ship a scaffold.
- Do not copy animation-studio director rules into unrelated templates.

## VERIFY

Run template-specific browser tests plus `pnpm test:templates`,
`pnpm templates:smoke`, or the release command named for the template family.

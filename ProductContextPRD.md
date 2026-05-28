# Aura3D Product Context PRD

Aura3D is the editable scene layer for agent-written browser 3D. AI coding
agents write TypeScript or JavaScript against a compact public API, users bring
their own assets, and Aura3D provides typed asset references, templates,
diagnostics, screenshots, and static deployment checks.

## Current Public Surface

- `@aura3d/engine`: `createAuraApp`, scene helpers, typed asset references,
  camera, lights, materials, effects, timeline, interactions, diagnostics,
  screenshots, and route-health helpers.
- `@aura3d/react`: optional thin React adapter over the same scene concepts.
- `@aura3d/cli`: asset add, scan, validate, list, typegen, thumbnail, serve,
  doctor, deploy check, and agent-file initialization.
- `create-aura3d`: starter scaffolder for `product-viewer`,
  `cinematic-scene`, and `mini-game`.
- `llms.txt`, `AGENTS.md`, `.claude/CLAUDE.md`, Cursor rules, Copilot
  instructions, and `docs/agents/*`: agent-readable context.

## Completed Work

- Legacy AI-runtime code is outside the active workspace.
- The public authoring model is source code plus typed assets.
- The create-aura3d active template directory contains only the three starter
  templates.
- Held-back template experiments are outside the active starter-template
  directory and documented under `archive/held-back-create-aura3d-templates/`.
- All active `apps/*` directories are classified in
  `docs/project/apps-classification.md`.
- The marketing page now speaks in product and workflow language, not internal
  release-cycle language.
- The public site checks reject draft-copy, internal-status, and version-cycle
  wording on the public pages.

## Known Gaps To Keep Honest

- The starter template coverage is real at scaffold/build/route-health level,
  but broad product confidence still depends on the focused release checks, not
  on aggregate monorepo test counts.
- Extra `apps/*` routes remain active as classified engine evidence. They are
  not the starter registry and must not be marketed as the primary getting
  started path.
- Bundle-size proof must continue to measure built bundles with size-limit,
  including starter apps, rather than source-file byte counts.

## Release Gate

Use the version-free release gate:

```bash
pnpm run check:release
```

The gate covers product cutover, agent API, asset CLI, agent docs, templates,
examples, devtools, deployment, docs site, bundle size, and marketing truth.

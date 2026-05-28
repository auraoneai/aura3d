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
- The three starter templates render through WebGL2 using the compact Aura3D
  scene API and the lazy Three.js glTF render path, and have screenshot tests
  with scene-specific pixel profiles, not only non-empty PNG checks.
- `product-viewer` renders a real glTF speaker product on a studio setup, not
  a placeholder polygon.
- `cinematic-scene` renders a real GLB hero asset with rain, colored practicals,
  a wet floor, and WebGL2 diagnostics.
- `mini-game` renders a distinct WebGL2 arena scene with a typed GLB player,
  motion trail, hazards, coins, and a goal portal.
- `docs/project/starter-template-visual-review.md` records the current human
  screenshot review. The mini-game clean-install screenshot now shows the robot
  arena prompt instead of the previous generic grid/primitive output.
- `docs/project/starter-example-visual-review.md` records the current human
  review for the active public example routes. The example gate now writes PNGs
  and rejects identical or route-generic screenshots.
- Held-back template experiments are outside the active starter-template
  directory and documented under `archive/held-back-create-aura3d-templates/`.
- All active `apps/*` directories are classified in
  `docs/project/apps-classification.md`.
- The marketing page now speaks in product and workflow language, not internal
  release-cycle language.
- The public site checks reject draft-copy, internal-status, and version-cycle
  wording on the public pages.
- Codex self-dogfood and a fresh Codex context-only run both compiled, ran,
  rendered WebGL2 screenshots, used typed asset refs, and reported zero API
  hallucinations and zero asset-path errors.
- The first raw Three.js baseline comparison is recorded in
  `docs/project/agent-baseline-comparison.md`.

## Known Gaps To Keep Honest

- The starter template coverage is real at scaffold/build/route-health,
  clean-install, and scene-specific screenshot-profile level, but broad product
  confidence still depends on focused dogfood and user evidence, not aggregate
  monorepo test counts.
- The browser renderer now proves real glTF/GLB geometry, glTF node transforms,
  richer scene composition, and lazy Three.js-backed material loading, but it is
  still a compact Aura3D render path, not a full physically based Three.js
  replacement. GLB material/texture fidelity needs more corpus testing before it
  can be marketed as production-grade asset parity.
- The `product-viewer` starter is prompt-aligned and clean-install proven, but
  it remains a stylized starter render, not a photoreal product-marketing render.
  Do not oversell it externally.
- The active example routes are prompt-aligned and distinct, but
  `hello-world-typed-asset` and `camera-path` are compact examples, not
  photoreal showcase demos.
- Extra `apps/*` routes remain active as classified engine evidence. They are
  not the starter registry and must not be marketed as the primary getting
  started path.
- Bundle-size proof measures built bundles with size-limit, including starter
  apps. The compact core API budget excludes the lazy Three.js renderer chunk;
  the starter-template bundle budgets include that renderer cost.
- Claude Code, Cursor, Copilot, outside developers, real Vercel/Cloudflare/
  Netlify deployments, and wild third-party GLB assets remain external dogfood
  work. The local evidence must not be presented as broad market proof.

## Release Gate

Use the version-free release gate:

```bash
pnpm run check:release
```

The gate covers product cutover, agent API, asset CLI, agent docs, templates,
examples, devtools, deployment, docs site, bundle size, and marketing truth.

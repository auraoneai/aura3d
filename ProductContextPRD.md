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

## Product Reset

The current repo proves useful Aura3D plumbing, but not the full product
promise implied by "AI prompt to visual result."

The diagnosis is **both**, not one or the other:

- It is **not only** that Aura3D needs "fancier animation." Animation matters,
  but the larger missing runtime layer is art direction: scene composition,
  lighting rigs, environment structure, material fidelity, asset-aware camera
  framing, believable effects, and product-ready defaults.
- It is also **not only** that the AI prompt was formed badly. The repo now has
  a first-pass `PromptPlan` contract, but that contract is only plumbing until
  it forces recipe selection, repair steps, and visual acceptance criteria that
  make the screenshot honestly match the prompt.

There are therefore two separate problems to fix:

- The Aura3D runtime and template layer does not yet provide enough
  art-directed visual primitives for agents to reliably create polished scenes.
  It can load GLBs, create canvases, place objects, add lights/effects, and run
  diagnostics. It does not yet give agents a strong enough composition,
  lighting, material, environment, animation, and effect system to make the
  output look desirable by default.
- The prompt-to-visual validation was aimed at the wrong target. It rewarded
  "the app compiled and rendered recognizable cues" instead of "the final image
  looks like the prompt asked for." That let object-plus-symbolic-effect scenes
  pass even when the human visual result was not good enough. The new
  prompt-fidelity report catches that failure mode, but the positive
  product-quality screenshots still do not pass.

So the honest current product state is:

- **Proven:** agent-readable API surface, typed assets, clean starter
  scaffolding, GLB render path, diagnostics, screenshots, route health, package
  audits, and local dogfood.
- **Partially proven:** starter scenes can display real assets with basic
  visual cues; the starter templates now use `definePromptPlan` and
  `promptPlanToScene`.
- **Not proven:** polished prompt-to-visual output, broad asset visual fidelity,
  cinematic composition quality, recipe-driven agent dogfood, or
  user-desirable generated demos.

## Product-Quality Definition

A prompt-to-visual result is not product-quality unless a human reviewer can
look at the screenshot before reading diagnostics and say the requested scene is
visibly present.

For Aura3D, that means:

- The subject asset is recognizable, correctly scaled, and framed as the focal
  point.
- The environment, lighting, effects, camera, and interaction state match the
  prompt instead of merely being labeled as matching it.
- Visual effects are embodied in the scene. Rain should read as rain, a game
  should read as a playable arena, a product viewer should read as a product
  inspection surface, and a material demo should visibly compare materials.
- The scene has depth, contrast, contact, and composition. A lone GLB on a grid
  with decorative lines or colored primitives is not enough.
- The implementation compiles, runs, and deploys, but those technical checks are
  only prerequisites. They are not visual proof.

## Completed Work

- Legacy AI-runtime code is outside the active workspace.
- The public authoring model is source code plus typed assets.
- The create-aura3d active template directory contains only the three starter
  templates.
- The three starter templates render through WebGL2 using the compact Aura3D
  scene API and the lazy Three.js glTF render path, and have screenshot tests
  with scene-specific pixel profiles, not only non-empty PNG checks. These are
  render-plumbing checks, not product-quality prompt-to-visual proof.
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
- Codex self-dogfood now generates through `definePromptPlan`,
  `compilePromptPlan`, and `promptPlanToScene`; it compiles, runs, renders a
  WebGL2 screenshot, uses typed asset refs, records the compiled prompt-plan
  report, and reports zero API hallucinations and zero asset-path errors. A
  separate fresh Codex context-only run also compiled and ran, but remains
  partial visual evidence.
- The first raw Three.js baseline comparison is recorded in
  `docs/project/agent-baseline-comparison.md`.
- `tools/prompt-fidelity-quality/index.ts` now writes
  `tests/reports/prompt-fidelity-quality.json`, a release screenshot contact
  sheet, and `docs/project/prompt-fidelity-quality-results.md`. It classifies
  current screenshots as technical/partial evidence and rejects
  object-plus-symbolic-effect negative fixtures.
- The public agent API now includes `definePromptPlan`, `compilePromptPlan`,
  `promptPlanToScene`, and `promptRecipes` so agents can select an approved
  scene recipe before rendering. The three starter templates use that prompt
  plan flow. This is prompt-plumbing progress, not proof of product-quality
  visuals.
- The reset evidence now distinguishes prompt-plumbing success from
  product-quality visual success. A screenshot can pass WebGL2, route-health,
  and pixel-profile checks while still failing the product promise.

## Known Gaps To Keep Honest

- The starter template coverage is real at scaffold/build/route-health,
  clean-install, and scene-specific screenshot-profile level, but broad product
  confidence still depends on focused dogfood and user evidence, not aggregate
  monorepo test counts.
- Prompt-to-visual product quality is not proven. Current screenshots show real
  GLB loading and basic scene cues, but several still read as one imported
  object plus symbolic effects. Do not present them as proof that a natural
  language prompt produces a polished visual result.
- The browser renderer now proves real glTF/GLB geometry, glTF node transforms,
  richer scene composition, and lazy Three.js-backed material loading, but it is
  still a compact Aura3D render path, not a full physically based Three.js
  replacement. GLB material/texture fidelity needs more corpus testing before it
  can be marketed as production-grade asset parity.
- The `product-viewer` starter is clean-install proven with product-viewer
  visual cues, but it remains a stylized starter render, not a polished
  product-marketing render.
  Do not oversell it externally.
- The active example routes are visually distinct, but `hello-world-typed-asset`
  and `camera-path` are compact examples, not polished showcase demos.
- Extra `apps/*` routes remain active as classified engine evidence. They are
  not the starter registry and must not be marketed as the primary getting
  started path.
- Bundle-size proof measures built bundles with size-limit, including starter
  apps. The compact core API budget excludes the lazy Three.js renderer chunk;
  the starter-template bundle budgets include that renderer cost.
- Claude Code, Cursor, Copilot, outside developers, real Vercel/Cloudflare/
  Netlify deployments, and separately licensed Sketchfab/Poly Haven/Meshy/Draco
  wild-asset runs remain external dogfood work. The local evidence must not be
  presented as broad market proof.

## Build Checklist Still Required

### P0 Reset Work

- [x] Build a prompt-plan schema that captures subject, asset refs, desired
  scene type, visual style, environment, camera, lighting, effects,
  interaction, and screenshot acceptance criteria.
- [x] Add a prompt-plan compiler that maps the schema to approved Aura3D scene
  recipes instead of letting agents improvise unrelated primitives.
- [ ] Build product-quality scene recipes for the three public starter promises:
  product viewer, cinematic scene, and mini-game.
- [ ] Replace or withhold release-facing screenshots that remain
  `technical-render-pass` or `partial`; only `product-quality-pass` screenshots
  should be used as marketing/product proof.
- [ ] Add before/after evidence for each fixed starter showing the source
  prompt, generated code path, screenshot, human verdict, and failure mode that
  was corrected.
- [x] Update agent docs so a context-only agent chooses recipes, assets, camera,
  lighting, effects, and acceptance criteria deliberately.
- [ ] Add a product-quality review gate that blocks promotion when screenshots
  still look like one GLB plus symbolic decorations.
- [x] Re-run the Codex context-only self-test through the prompt-plan flow and
  record whether the generated screenshot improves beyond `partial`.

### Visual Runtime And Scene Quality

- [ ] Add art-directed scene recipes for product hero, cinematic rain scene,
  material studio, and game arena outputs.
- [ ] Add camera rig presets for product orbit, dolly push-in, turntable,
  top-down game board, and hero close-up framing.
- [ ] Add lighting rigs that create real visual structure: key/fill/rim,
  studio softbox, practical neon, product reflection cards, and game arena
  readability.
- [ ] Add environment helpers for plinths, backdrops, alleys, rooms, arenas,
  shelves, rails, portals, and staged foreground/background depth.
- [ ] Improve materials so product assets do not look flat: PBR defaults,
  environment reflections, contact shadows, wet floors, emissive surfaces, and
  texture-preserving GLB material handling.
- [ ] Replace symbolic weather/effects with believable visual systems where
  relevant: rain volume, splash/reflection response, fog/haze, glow, bloom,
  depth of field, and motion trails.
- [ ] Add animation helpers for idle product motion, camera dolly, object
  reveals, game-loop movement, collection feedback, and interaction states.
- [ ] Add asset normalization: auto-scale, auto-center, ground alignment,
  bounds-aware camera framing, missing-texture warnings, and material fallback
  summaries.
- [ ] Add performance budgets for these richer visual presets so starter scenes
  remain usable in a browser.

### Prompt-To-Visual Product Layer

- [x] Define a first-pass prompt contract that separates intent, subject asset,
  style, camera, environment, lighting, interaction, and acceptance criteria.
- [x] Build a first-pass scene-planning layer that turns that contract into
  Aura3D recipe calls.
- [x] Give agents initial visual vocabulary and examples that map prompts to
  concrete scene recipes instead of ad hoc primitive placement.
- [ ] Prove the prompt contract is strong enough by generating at least three
  prompt-plan scenes that pass `product-quality-pass`.
- [ ] Make the recipe compiler reject or warn on vague plans that cannot produce
  visible prompt fidelity, such as "make it cinematic" without subject,
  environment, lighting, camera, and acceptance criteria.
- [ ] Add repair guidance when output is generic, badly framed, too dark,
  missing the subject, or just an object plus decorative cues.
- [ ] Add support for prompt-specific expected artifacts, such as HUD for a
  game prompt, wet reflections for a rain prompt, and inspection controls for a
  product-viewer prompt.
- [ ] Make generated scenes expose their prompt, visual intent, and diagnostic
  evidence in reports.

### Quality Gates And Evidence

- [x] Add a `prompt-fidelity` gate that fails screenshots which look like one
  imported asset plus symbolic effects.
- [x] Store source prompt, expected visual criteria, screenshot, source report,
  and human verdict for every audited demo.
- [x] Require human review labels: `product-quality-pass`,
  `technical-render-pass`, `partial`, or `fail`.
- [ ] Require every public demo to pass both technical rendering checks and
  visual prompt-fidelity checks before it is marketed.
- [x] Build a contact-sheet report for all release-facing screenshots so visual
  regressions are reviewed together.
- [x] Add negative fixtures proving object-plus-symbolic-effect output fails.
- [ ] Add positive fixtures proving new art-directed scenes pass.
- [ ] Compare Aura3D prompt outputs against raw Three.js agent outputs on the
  same prompts and assets.

### Product Proof

- [ ] Run the context-only agent eval with Codex, Claude Code, Cursor, and
  Copilot when available.
- [ ] Run a wild asset corpus with separately licensed Sketchfab CC0, Poly
  Haven, Meshy, and real Draco-compressed assets.
- [ ] Deploy at least one polished prompt-fidelity demo publicly to Vercel,
  Cloudflare Pages, and Netlify without authentication walls.
- [ ] Run marketing comprehension interviews after the marketing site only
  shows visuals that meet the product-quality bar.
- [ ] Run outside beta dogfood with real users and record whether they can turn
  prompts and assets into scenes they would actually use.

## Release Gate

Use the version-free release gate:

```bash
pnpm run check:release
```

The gate covers product cutover, agent API, asset CLI, agent docs, templates,
examples, devtools, deployment, docs site, bundle size, and marketing truth.

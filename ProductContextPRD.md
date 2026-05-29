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
  prompt-fidelity report now catches that failure mode, records passing
  starter-level examples, and keeps broad arbitrary prompt quality as an open
  product gap instead of overclaiming it.

### Root Cause Breakdown

The current failure mode is not a single missing animation helper. It is a full
prompt-to-visual product gap:

| Root Cause | Current Behavior | Required Behavior |
|---|---|---|
| Runtime expressiveness | Agents can place assets, primitives, lights, cameras, and simple effects. | Agents can call high-level visual recipes that create a composed scene with staging, depth, lighting, material response, camera motion, and interaction state. |
| Visual defaults | Starter scenes can look like one imported GLB with decorative cues. | Starter scenes should look like intentional product, cinematic, or game compositions before any manual polish. |
| Asset handling | GLBs load and can be typed, but scale, framing, grounding, and material fidelity are still not broadly proven. | Assets should auto-center, auto-scale, sit on a believable surface, keep useful material/texture data, and produce actionable warnings when fidelity is degraded. |
| Effects | Effects can be present as simple visual markers, such as rain lines or glow primitives. | Effects should read as the requested phenomenon in the screenshot: rain volume, wet response, fog depth, motion feedback, collection feedback, or material comparison. |
| Prompt planning | `PromptPlan` exists and can compile to a starter recipe. | Prompt plans must reject vague requests, select the right recipe, declare expected visual artifacts, and carry repair hints into the generated app/report. |
| Evaluation | Technical checks prove build, route health, diagnostics, and non-generic pixels. | Product checks must fail any release-facing demo until the screenshot itself matches the prompt and receives `product-quality-pass`. |

### Reset Build Contract

The product should now be rebuilt around two parallel tracks:

- **Visual runtime track:** build the missing Aura3D visual systems so a compact
  public API can create product-quality scenes without agents hand-authoring a
  full Three.js production setup every time.
- **Prompt workflow track:** constrain agents to plan, render, inspect, repair,
  and report. The agent path must not be considered successful just because the
  code compiles.

Every release-facing prompt demo must produce this evidence bundle:

- Source prompt.
- Selected `PromptPlan` and compiled recipe report.
- Asset refs and asset validation report.
- Generated code path.
- Route-health result.
- Screenshot file and contact-sheet placement.
- Human review label.
- Failure reason and next action when the label is not `product-quality-pass`.

The three approved starter prompt demos now pass this bundle locally, so they
can be used as narrow starter-recipe proof. Aura3D still should not be described
as proven broad prompt-to-visual generation until arbitrary prompts, arbitrary
assets, external agents, deployments, and outside users pass the same standard.

### Current Technical Gate State

The product is not release-ready as a broad prompt-to-visual product.

The latest clean-install blocker was reproduced and fixed in the test harness
and package contents:

- Generated templates no longer ship stale Playwright `test-results`.
- The clean-install preview command now forwards Playwright flags correctly
  through `npm exec --`.
- Clean-install template checks now use isolated ports instead of depending on
  default template ports.
- `pnpm run check:clean-install` now passes 33/33 checks.

That resolves the technical clean-install blocker. The starter prompt-fidelity
gap is now closed for the three public starter recipes, but broad
prompt-to-visual quality still needs to be judged by whether each screenshot
looks like the requested scene, not only by route health or pixel-profile
counters.

So the honest current product state is:

- **Proven locally:** agent-readable API surface, typed assets, clean starter
  scaffolding path, GLB render path, diagnostics, screenshots, package audits,
  packed clean-install starter checks, and deterministic Codex dogfood for the
  focused checks that passed.
- **Proven for approved starter recipes:** `product-viewer`,
  `cinematic-scene`, and `mini-game` now pass clean-install render checks,
  route health, scene-specific screenshot profiles, and human
  `product-quality-pass` review in `tests/reports/prompt-fidelity-quality.json`.
  The starter templates use `definePromptPlan` and `promptPlanToScene`.
- **Not proven broadly:** arbitrary prompt-to-visual quality, broad asset visual
  fidelity, cross-agent recipe adoption, external deployments, outside users,
  and market-desirable generated demos beyond the approved starter recipes.

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
  with scene-specific pixel profiles, not only non-empty PNG checks.
- `product-viewer` renders a real glTF speaker product as a staged product
  viewer with softboxes, plinth/contact cues, warm/cool reflection strips,
  material highlights, orbit affordance, WebGL2 diagnostics, and a
  `product-quality-pass` prompt-fidelity review label.
- `cinematic-scene` renders a real GLB hero asset as a rainy neon alley shot
  with foreground/background depth, practical lights, layered rain, splash
  points, wet reflections, WebGL2 diagnostics, and a `product-quality-pass`
  prompt-fidelity review label.
- `mini-game` renders a distinct WebGL2 arena scene with a typed GLB player,
  visible health/state pips, path cue, motion trail, hazards, coins, laser
  gate, goal portal, and a `product-quality-pass` prompt-fidelity review label.
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
  report, reports zero API hallucinations and zero asset-path errors, and now
  has a `product-quality-pass` prompt-fidelity review label for the
  deterministic self-test. A separate fresh Codex context-only run also
  compiled and ran, but it remains separate local evidence rather than
  cross-agent proof.
- A separate Codex five-task context eval now completes the product viewer,
  camera/rain, reflective floor, click-swap, and static deploy-bundle tasks
  against a real Khronos shoe GLB written as `sneaker.glb` and `shoe2.glb`.
  It uses typed asset refs, reports zero API hallucinations and zero asset-path
  errors, runs from a production static preview bundle, and has screenshot-level
  product-quality evidence. This is still local Codex evidence, not proof that
  Claude Code, Cursor, Copilot, or outside users will produce the same result.
- The first raw Three.js baseline comparison is recorded in
  `docs/project/agent-baseline-comparison.md`.
- `tools/prompt-fidelity-quality/index.ts` now writes
  `tests/reports/prompt-fidelity-quality.json`, a release screenshot contact
  sheet, and `docs/project/prompt-fidelity-quality-results.md`. It now records
  four release-facing `product-quality-pass` artifacts: the three starter
  recipes plus deterministic Codex context dogfood. It still rejects
  object-plus-symbolic-effect negative fixtures and stores regression guidance.
- The public agent API now includes `definePromptPlan`, `compilePromptPlan`,
  `promptPlanToScene`, and `promptRecipes` so agents can select an approved
  scene recipe before rendering. `compilePromptPlan` reports visual systems,
  negative criteria, and repair hints. The three starter templates use that
  prompt plan flow and now have positive starter-level product-quality
  screenshot evidence.
- The reset evidence now distinguishes prompt-plumbing success from
  product-quality visual success. A screenshot can pass WebGL2, route-health,
  and pixel-profile checks while still failing the product promise.

## Known Gaps To Keep Honest

- The starter template coverage is real at scaffold/build/route-health,
  clean-install, and scene-specific screenshot-profile level, but broad product
  confidence still depends on focused dogfood and user evidence, not aggregate
  monorepo test counts.
- Broad prompt-to-visual product quality is still not fully proven. The approved
  starter recipes now pass prompt-fidelity review, but that does not prove
  arbitrary prompts, arbitrary assets, external agents, or outside users.
- The previous cinematic clean-install blocker has been fixed, but it was a
  harness/package-content issue. The current clean-install plus
  prompt-fidelity pass can be used as starter-recipe proof, not broad proof of
  arbitrary prompt-to-visual generation.
- The browser renderer now proves real glTF/GLB geometry, glTF node transforms,
  richer scene composition, and lazy Three.js-backed material loading, but it is
  still a compact Aura3D render path, not a full physically based Three.js
  replacement. GLB material/texture fidelity needs more corpus testing before it
  can be marketed as production-grade asset parity.
- The `product-viewer` starter is clean-install and product-quality reviewed,
  but it remains a stylized starter recipe, not a guarantee that every product
  asset will become a polished product-marketing render.
- The active example routes are visually distinct, but `hello-world-typed-asset`
  and `camera-path` are compact examples, not polished showcase demos.
- Extra `apps/*` routes remain active as classified engine evidence. They are
  not the starter registry and must not be marketed as the primary getting
  started path.
- Bundle-size proof measures built bundles with size-limit, including starter
  apps. The compact core API budget excludes the lazy Three.js renderer chunk;
  the starter-template bundle budgets include that renderer cost.
- Claude Code, Cursor, Copilot, outside developers, real Vercel/Cloudflare/
  Netlify deployments, authenticated Sketchfab CC0 downloads, and Meshy export
  runs remain external dogfood work. The local Codex five-task pass must not be
  presented as broad market proof.

## Build Checklist Still Required

### P0 Reset Work

- [x] Build a prompt-plan schema that captures subject, asset refs, desired
  scene type, visual style, environment, camera, lighting, effects,
  interaction, and screenshot acceptance criteria.
- [x] Add a prompt-plan compiler that maps the schema to approved Aura3D scene
  recipes instead of letting agents improvise unrelated primitives.
- [x] Restore `cinematic-scene` clean-install readiness: dev route health,
  static preview route health, screenshot bytes, and cinematic visual profile
  must pass from the packed `create-aura3d` and `@aura3d/engine` tarballs.
- [x] Build product-quality scene recipes for the three public starter promises:
  product viewer, cinematic scene, and mini-game.
- [x] Replace or withhold release-facing screenshots that remain
  `technical-render-pass` or `partial`; only `product-quality-pass` screenshots
  should be used as marketing/product proof.
- [ ] Add before/after evidence for each fixed starter showing the source
  prompt, generated code path, screenshot, human verdict, and failure mode that
  was corrected.
- [x] Update agent docs so a context-only agent chooses recipes, assets, camera,
  lighting, effects, and acceptance criteria deliberately.
- [x] Add a product-quality review gate that blocks promotion when screenshots
  still look like one GLB plus symbolic decorations.
- [x] Re-run the Codex context-only self-test through the prompt-plan flow and
  record whether the generated screenshot improves beyond `partial`.

### Visual Runtime And Scene Quality

- [x] Decide the renderer strategy for product-quality visuals: either extend
  the compact Aura3D renderer enough for polished demos, expose a first-class
  Three.js-backed recipe layer, or clearly scope Aura3D as typed scene
  orchestration over external renderers.
- [x] Implement the selected renderer strategy in code, not only in docs, and
  update starter templates to use it.
- [x] Add art-directed scene recipes for product hero, cinematic rain scene,
  material studio, and game arena outputs.
- [x] Make recipe output visually opinionated by default: focal subject,
  foreground/background structure, environment depth, contact, contrast, and
  clear interaction state must be visible before custom edits.
- [ ] Add camera rig presets for product orbit, dolly push-in, turntable,
  top-down game board, and hero close-up framing.
- [ ] Add lighting rigs that create real visual structure: key/fill/rim,
  studio softbox, practical neon, product reflection cards, and game arena
  readability.
- [x] Add environment helpers for plinths, backdrops, alleys, rooms, arenas,
  shelves, rails, portals, and staged foreground/background depth.
- [ ] Improve materials so product assets do not look flat: PBR defaults,
  environment reflections, contact shadows, wet floors, emissive surfaces, and
  texture-preserving GLB material handling.
- [x] Replace symbolic weather/effects with believable visual systems where
  relevant: rain volume, splash/reflection response, fog/haze, glow, bloom,
  depth of field, and motion trails.
- [ ] Add animation helpers for idle product motion, camera dolly, object
  reveals, game-loop movement, collection feedback, and interaction states.
- [ ] Add asset normalization: auto-scale, auto-center, ground alignment,
  bounds-aware camera framing, missing-texture warnings, and material fallback
  summaries.
- [ ] Add screenshot-oriented quality metadata from the renderer: subject bounds,
  apparent subject size, asset readiness, effect systems active, camera preset,
  lighting preset, and recipe ID.
- [ ] Add performance budgets for these richer visual presets so starter scenes
  remain usable in a browser.

### Prompt-To-Visual Product Layer

- [x] Define a first-pass prompt contract that separates intent, subject asset,
  style, camera, environment, lighting, interaction, and acceptance criteria.
- [x] Build a first-pass scene-planning layer that turns that contract into
  Aura3D recipe calls.
- [x] Give agents initial visual vocabulary and examples that map prompts to
  concrete scene recipes instead of ad hoc primitive placement.
- [x] Prove the prompt contract is strong enough by generating at least three
  prompt-plan scenes that pass `product-quality-pass`.
- [ ] Make the recipe compiler reject or warn on vague plans that cannot produce
  visible prompt fidelity, such as "make it cinematic" without subject,
  environment, lighting, camera, and acceptance criteria.
- [x] Add repair guidance when output is generic, badly framed, too dark,
  missing the subject, or just an object plus decorative cues.
- [ ] Feed repair guidance back into the generated scene and rerun the screenshot
  review until the artifact either passes or is explicitly marked blocked.
- [x] Add support for prompt-specific expected artifacts, such as HUD for a
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
- [x] Add positive fixtures proving new art-directed scenes pass.
- [x] Block release-facing promotion when `releaseFacingProductQualityPasses` is
  below three in `tests/reports/prompt-fidelity-quality.json`.
- [ ] Compare Aura3D prompt outputs against raw Three.js agent outputs on the
  same prompts and assets.

### Product Proof

- [ ] Run the context-only agent eval with Codex, Claude Code, Cursor, and
  Copilot when available.
- [ ] Run a wild asset corpus with separately licensed assets. Poly Haven CC0
  and real Draco-compressed assets now pass the executable corpus; authenticated
  Sketchfab CC0 downloads and Meshy exports remain.
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

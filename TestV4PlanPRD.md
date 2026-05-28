# Aura3D Product Context Test Plan PRD

## Purpose

This PRD defines the validation plan for proving that `ProductContextPRD.md`
describes a real working product, not only a repo shape or release-gate
checklist.

The plan tests Aura3D as a product for the target user: a developer using an AI
coding agent to build browser 3D with their own assets, typed references,
starter templates, diagnostics, screenshots, and static deployment checks.

## Primary Question

Can a developer or AI coding agent use the documented Aura3D surface to create,
modify, validate, screenshot, and deploy browser 3D apps without relying on
archived runtime code, internal release-cycle language, or undocumented APIs?

The current answer is partial. The repo proves technical rendering and agent
plumbing. It does not prove that a prompt creates a visually compelling result.

## Non-Negotiable Outcomes

- Every product claim in `ProductContextPRD.md` has evidence.
- The three starter templates work from a clean install.
- The public packages work from packed artifacts, not only from workspace links.
- AI agents can build useful apps from the agent context without hallucinating
  archived or non-existent APIs.
- User-owned assets can be added, typed, validated, rendered, and debugged.
- Prompt output must be judged by visual fidelity, not only by compile success,
  nonblank screenshots, or pixel counters.
- Screenshots that read as one imported object plus symbolic effects must fail
  product-quality review.
- Marketing and docs explain the product accurately to people who do not know
  the codebase.
- Archived runtime code remains inert and cannot leak into active packages,
  apps, docs, or npm artifacts.

## Product Quality Reset

The problem is both implementation and validation.

| Area | What Exists | What Is Missing |
|---|---|---|
| Aura3D runtime and API | Compact authoring surface, typed assets, GLB render path, lights, materials, effects, timeline, interactions, diagnostics, screenshots. | Higher-level art-directed scene recipes, better material/lighting defaults, believable environment/effect systems, stronger animation helpers, and asset-aware camera/framing. |
| Agent workflow | Agents can write valid Aura3D code from context, avoid hallucinated APIs in local Codex tests, and starter templates now use first-pass `PromptPlan` recipes. | Proof that context-only agents consistently use those recipes, plus repair guidance when output looks generic or visually misses the prompt. |
| Evidence and tests | Route health, screenshots, pixel profiles, clean installs, package audits, local dogfood, contact sheets, negative prompt-fidelity fixtures, and human review labels. | Positive prompt-fidelity fixtures where release-facing screenshots pass `product-quality-pass`, not only `technical-render-pass` or `partial`. |

This test plan therefore treats existing screenshot passes as
`technical-render-pass` unless they also meet the prompt-fidelity bar.

The reset decision is:

- Animation polish alone will not fix the product. The runtime needs higher
  level visual systems: recipes, staging, cameras, lighting, materials,
  environments, effects, interaction states, and asset normalization.
- Better prompting alone will not fix the product. Agents need a constrained
  prompt-plan contract, a recipe vocabulary, concrete examples, and a visual
  review loop that rejects generic output. The first-pass contract exists; it
  still needs proof that agents follow it and that the resulting visuals are
  desirable.
- A demo is not done when it compiles, serves, or produces a nonblank canvas.
  It is done only when the screenshot visibly satisfies the prompt and is
  marked `product-quality-pass`.

## Still-To-Build Checklist

### P0 Prompt-To-Visual Reset

- [x] Define `PromptPlan`: subject, asset refs, scene type, visual style,
  environment, camera, lighting, effects, interaction, acceptance criteria, and
  negative visual anti-patterns.
- [x] Implement a `PromptPlan` to Aura3D recipe compiler for the supported
  starter scene types.
- [x] Add approved recipe APIs for product viewer, cinematic scene, mini-game,
  and material studio outputs.
- [x] Update agent context files so agents generate a prompt plan first, then
  compile through recipes, then run screenshot review.
- [ ] Add fixture prompts for at least three release-facing demos and require
  them to reach `product-quality-pass`.
- [x] Add failing fixtures for the current bad pattern: one imported asset on a
  grid with labels, rain lines, colored bars, or unrelated primitives.
- [x] Add report output that ties prompt -> plan -> generated Aura3D code ->
  screenshot -> review label -> pass/fail reason.
- [ ] Remove or quarantine any public demo that remains only
  `technical-render-pass` or `partial`.
- [x] Re-run the Codex context-only self-test after the prompt-plan reset and
  require the generated app to use `definePromptPlan` and `promptPlanToScene`.
- [x] Record whether the Codex prompt-plan screenshot is still
  object-plus-symbolic-effect output or has improved to `product-quality-pass`.

### Runtime And Template Visual Quality

- [ ] Product hero scene recipe with auto-framed asset, plinth, backdrop,
  reflection cards, studio softboxes, contact shadow, and orbit controls.
- [ ] Cinematic scene recipe with environment depth, wet surface, believable
  rain volume, fog/haze, practical lights, bloom, and camera dolly.
- [ ] Mini-game recipe with readable arena, player state, collectibles, hazards,
  goal, HUD, animation feedback, and clear interaction affordances.
- [ ] Material studio recipe with controlled lighting, environment reflections,
  texture preview, swatches, labels, and material comparison layout.
- [ ] Camera presets for product orbit, dolly push-in, turntable, top-down game
  board, hero close-up, and inspection mode.
- [ ] Lighting presets for key/fill/rim, product studio, neon alley, game arena,
  material inspection, and warm/cool contrast.
- [ ] Environment primitives that create real scene structure: walls, floors,
  alleys, shelves, rails, portals, plinths, backgrounds, and depth layers.
- [ ] Material fidelity improvements for GLB/PBR assets, texture preservation,
  fallback reporting, wet floors, emissive materials, and reflections.
- [ ] Effect systems that look like the effect they claim: rain, fog, glow,
  trails, impact pulses, hover/click state, and collection feedback.
- [ ] Asset normalization for scale, origin, bounds, ground alignment, camera
  distance, and missing material/texture diagnostics.

### Prompt-To-Visual Workflow

- [x] Define a prompt contract with subject, asset IDs, style, environment,
  camera, lighting, effects, interaction, and acceptance criteria.
- [x] Add recipe selection so agents choose product hero, cinematic, game arena,
  or material studio structures instead of improvising random primitives.
- [x] Add agent docs with prompt-to-recipe examples and anti-patterns.
- [ ] Add repair guidance for low-quality visuals: tiny subject, bad framing,
  flat lighting, missing environment, symbolic effects, low contrast, or no
  visible interaction state.
- [x] Include source prompt, selected recipe, asset refs, expected visual
  criteria, and screenshot path in every generated report.
- [x] Include the generated plan report from `compilePromptPlan`, including
  selected recipe, visual systems, repair hints, and negative anti-patterns.

### Visual Quality Gates

- [x] Add `prompt-fidelity-quality.json`.
- [x] Add a release screenshot contact sheet.
- [x] Require human review labels: `product-quality-pass`,
  `technical-render-pass`, `partial`, or `fail`.
- [x] Add negative fixtures that intentionally render object-plus-symbolic-effect
  scenes and require the gate to fail them.
- [ ] Require at least three release-facing prompts to pass product-quality
  review before marketing the product as prompt-to-visual.
- [ ] Compare Aura3D prompt output to raw Three.js agent output on the same
  prompts and assets.
- [ ] Fail the gate if a release-facing screenshot lacks prompt, plan, source
  code path, asset refs, route-health report, screenshot path, review label,
  failure reason, and next action.

## Source Claims Under Test

`ProductContextPRD.md` currently makes these testable claims:

- Aura3D is the editable scene layer for agent-written browser 3D.
- AI coding agents write TypeScript or JavaScript against a compact public API.
- Users bring their own assets.
- Aura3D provides typed asset references.
- Aura3D provides starter templates.
- Aura3D provides diagnostics.
- Aura3D provides screenshots.
- Aura3D provides static deployment checks.
- `@aura3d/engine` exposes the public engine surface.
- `@aura3d/react` is an optional thin React adapter.
- `@aura3d/cli` supports asset, doctor, deployment, serve, and agent-file flows.
- `create-aura3d` scaffolds `product-viewer`, `cinematic-scene`, and `mini-game`.
- `llms.txt`, `AGENTS.md`, editor rules, Copilot instructions, and
  `docs/agents/*` are useful agent-readable context.
- Legacy AI-runtime code is outside the active workspace.
- The public authoring model is source code plus typed assets.
- The active starter-template directory contains only the three starter
  templates.
- Held-back template experiments are outside the active starter-template
  directory and documented in archive.
- Active `apps/*` directories are classified.
- Marketing speaks in product and workflow language, not internal release-cycle
  language.
- Public site checks reject draft-copy, internal-status, and version-cycle
  wording.
- Broad product confidence depends on focused release checks and dogfood, not
  aggregate monorepo test counts.
- Extra `apps/*` routes are engine evidence and must not be marketed as the
  primary getting-started path.
- Bundle-size proof must measure built bundles, including starter apps.

## Evidence Standard

Each claim must be classified into one of four states:

- `automated-pass`: CI or local script verifies it.
- `manual-pass`: documented dogfood evidence verifies it.
- `external-pass`: outside-user or external-deployment evidence verifies it.
- `known-gap`: explicitly documented gap with owner, next action, and target
  evidence.

No product claim should remain as an untested assertion.

## Execution Status: 2026-05-28

### Automated Local Status

The local automated release gate now passes:

```bash
pnpm run check:release
```

That command now runs typecheck, product cutover checks, agent API checks, asset
CLI tests, the generated asset corpus, agent docs checks, starter-template
scaffold/build/browser checks, examples route health, devtools checks,
deployment checks, docs-site browser checks, bundle-size measurement, marketing
truth checks, Codex agent dogfood, package build, tarball audit, docs codeblock
audit, marketing link audit, error-message quality audit, and the final product
context evidence matrix.

Current local automated evidence:

- `docs/project/product-context-evidence.md` reports every current product
  claim with evidence and the automated product-context checks passing.
- `docs/project/agent-dogfood-results.md` records the Codex self-test: compiles
  yes, runs yes, API hallucinations 0, asset path errors 0, turns 1. Its
  screenshot check verifies basic visual signals, not only PNG byte size, but
  those signals are not product-quality prompt-to-visual proof.
- `docs/project/fresh-codex-agent-context-results.md` records a separate fresh
  Codex context-only run using copied context files, local package tarballs, and
  copied GLB assets. It compiled, ran, rendered WebGL2, swapped from `product`
  to `hero` on click, reported API hallucination count 0 and asset path error
  count 0, and produced a screenshot profile with the expected basic cues. Human
  review now classifies that visual evidence as partial because it still reads
  like an imported object plus symbolic effects.
- `docs/project/agent-baseline-comparison.md` records the first raw Three.js
  Codex baseline for the same task class. It built, ran, passed route health,
  passed static preview, produced basic screenshot evidence, and reported zero
  API hallucinations and zero asset-path errors.
- `docs/project/asset-corpus-results.md` records generated/adversarial cases
  plus selected pinned Khronos, Blender-export, animation, textured-PBR, and
  KTX2 local fixtures with expected success/failure behavior.
- `BUNDLE_SIZES.md` records built, minified, gzipped bundle measurements.
- `tests/reports/package-tarball-audit.json` verifies the packed packages do
  not include archive, product-plan, image, or CSV leakage and include required
  public files.
- `docs/project/clean-install-results.md` records clean npm installs from packed
  artifacts for `@aura3d/engine`, `@aura3d/react`, `@aura3d/cli`,
  `create-aura3d`, and all three starter templates.
- `docs/project/starter-template-visual-review.md` records the human screenshot
  review for the clean-install starter artifacts. It explicitly notes that the
  mini-game screenshot now shows a robot arena with coins, hazards, laser gate,
  and portal instead of the previous generic grid/primitive output; it also
  keeps the product-quality caveat visible.
- `docs/project/starter-example-visual-review.md` records the human screenshot
  review for the active public examples. `check:examples` now saves PNGs,
  records distinct hashes, and checks route-specific visual profiles instead of
  only asserting that a canvas is nonblank.
- `docs/project/prompt-visual-quality-gap.md` records the current disconnect:
  render-plumbing screenshots are not enough evidence that prompts generate
  polished visual results.
- `docs/project/prompt-fidelity-quality-results.md` and
  `tests/reports/prompt-fidelity-quality.json` now record prompt-fidelity
  classifications, a contact sheet path, human review labels, and negative
  fixtures that reject object-plus-symbolic-effect output. The report still
  says product-quality readiness is false.
- The starter templates and Codex self-test now generate scenes from
  `definePromptPlan` and `promptPlanToScene`. The Codex self-test also records
  the compiled prompt-plan report from the running app. Visual review still
  classifies the output as partial rather than product-quality proof.
- `docs/project/public-api-contract.md` records packed-package public exports,
  valid API compilation, negative type tests, archived import rejection, and docs
  named-import checks.

### Still Not Proven By Local Automation

These remain external or manual evidence items and must not be represented as
completed user proof:

- Claude Code, Cursor, and Copilot context-only agent runs.
- Separately licensed wild-asset corpus from outside sources, especially
  Sketchfab CC0, Poly Haven, Meshy, and real Draco-compressed variants.
- Static deployment to real Vercel, Cloudflare Pages, and Netlify projects.
- Marketing comprehension interviews with people who do not know the codebase.
- Outside beta dogfood and issue intake from real users.
- Product-quality prompt-to-visual fidelity. Current screenshots prove
  rendering and basic cues, not polished scene generation.
- Cross-agent prompt-plan adoption. Codex self-test uses prompt plans now, but
  Claude Code, Cursor, and Copilot still need separate runs when available.

The current gate proves local automated product shape, one deterministic Codex
self-test, and one fresh Codex context-only dogfood run. It does not yet prove
broad market confidence.

## Deliverables

- `docs/project/product-context-evidence.md`
- `docs/project/clean-install-results.md`
- `docs/project/public-api-contract.md`
- `docs/project/dogfood-rubric.md`
- `docs/project/agent-dogfood-results.md`
- `docs/project/fresh-codex-agent-context-results.md`
- `docs/project/asset-corpus-results.md`
- `docs/project/marketing-comprehension-results.md`
- `docs/project/prompt-fidelity-quality-results.md`
- `BUNDLE_SIZES.md`
- `tests/reports/product-context-evidence.json`
- `tests/reports/package-tarball-audit.json`
- `tests/reports/package-clean-install.json`
- `tests/reports/public-api-contract.json`
- `tests/reports/docs-codeblocks.json`
- `tests/reports/asset-corpus.json`
- `tests/reports/marketing-link-audit.json`
- `tests/reports/error-message-quality.json`
- `tests/reports/prompt-fidelity-quality.json`

## Implemented Scripts

Add these scripts after the manual plan is approved:

```json
{
  "check:product-context": "pnpm exec tsx --tsconfig tsconfig.base.json tools/product-context-evidence/index.ts",
  "check:public-api": "pnpm exec tsx --tsconfig tsconfig.base.json tools/public-api-contract/index.ts",
  "check:tarballs": "pnpm exec tsx --tsconfig tsconfig.base.json tools/package-tarball-audit/index.ts",
  "check:clean-install": "pnpm exec tsx --tsconfig tsconfig.base.json tools/package-clean-install/index.ts",
  "check:docs-codeblocks": "pnpm exec tsx --tsconfig tsconfig.base.json tools/docs-codeblocks/index.ts",
  "check:asset-corpus": "pnpm exec tsx --tsconfig tsconfig.base.json tools/asset-corpus/index.ts",
  "check:marketing-links": "pnpm exec tsx --tsconfig tsconfig.base.json tools/marketing-link-audit/index.ts",
  "check:error-quality": "pnpm exec tsx --tsconfig tsconfig.base.json tools/error-message-quality/index.ts",
  "check:prompt-fidelity": "pnpm exec tsx --tsconfig tsconfig.base.json tools/prompt-fidelity-quality/index.ts",
  "dogfood:templates": "pnpm run check:templates",
  "dogfood:agent": "pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-dogfood/index.ts"
}
```

## Round 0: Product Context Evidence Matrix

### Goal

Create a claim-to-evidence matrix so `ProductContextPRD.md` can be audited as a
contract.

### Tasks

- [ ] Create `docs/project/product-context-evidence.md`.
- [ ] List every claim from `ProductContextPRD.md`.
- [ ] Map each claim to an evidence type.
- [ ] Map each claim to an automated command, manual artifact, or known gap.
- [ ] Add owner and next action for every `known-gap`.
- [ ] Add `tests/reports/product-context-evidence.json`.
- [ ] Add `tools/product-context-evidence/index.ts`.

### Pass Criteria

- [ ] Every claim has a status.
- [ ] No `Completed Work` claim lacks evidence.
- [ ] Known gaps are not phrased as completed work.
- [ ] The evidence matrix can be regenerated by a script.

## Round 1: Release Gate Verification

### Goal

Confirm the current focused release gate still passes before deeper dogfood.

### Commands

```bash
pnpm run check:release
pnpm run typecheck
```

### Tasks

- [ ] Run `pnpm run check:release`.
- [ ] Run `pnpm run typecheck`.
- [ ] Record command output summaries in `docs/project/product-context-evidence.md`.
- [ ] Record any failures as issues before continuing.

### Pass Criteria

- [ ] `check:release` exits zero.
- [ ] `typecheck` exits zero.
- [ ] No claim relies on aggregate monorepo test counts.

## Round 2: Product-Cycle Language Guard

### Goal

Ensure product-facing surfaces do not regress into internal release-cycle or
draft language.

### Commands

```bash
git grep -n "$(printf 'V%s\\|V%s\\|V%s\\|Path %s\\|Path %s' 2 3 4 A B)" -- ProductContextPRD.md README.md docs marketing index.html
git grep -n "placeholder\|MVP\|future work\|under review\|needs work\|toy\|stub" -- marketing index.html docs ProductContextPRD.md
```

### Tasks

- [ ] Add product-language checks to `check:product-context`.
- [ ] Ensure public pages reject internal release-cycle wording.
- [ ] Ensure public pages reject draft/status wording.
- [ ] Ensure docs do not quote aggregate test-count vanity claims.
- [ ] Ensure marketing CTAs point to install, templates, docs, and agent context.

### Pass Criteria

- [ ] No public/product-facing matches for banned release-cycle language.
- [ ] No public/product-facing matches for draft/status language.
- [ ] Any allowed technical third-party version strings are documented as
  external dependency pins, not Aura product language.

## Round 3: Archive Isolation

### Goal

Prove archived runtime code is inert and cannot leak into active workspaces,
packages, apps, docs, or published artifacts.

### Commands

```bash
git grep -n "$(printf 'AuraSceneIR\\|MockProvider\\|prompt-to-%s\\|@aura3d/%s-scene' scene ai)" -- packages apps marketing docs ':!archive/**'
git grep -n "archive/legacy-ai-runtime" -- packages apps marketing docs package.json pnpm-workspace.yaml tsconfig*.json
```

### Tasks

- [ ] Scan active `packages/`, `apps/`, `marketing/`, and `docs/` for archived
  runtime concepts.
- [ ] Verify `archive/` is not included in the workspace package graph.
- [ ] Verify `archive/` is not included in `tsconfig` compilation.
- [ ] Verify active packages do not import from `archive/`.
- [ ] Verify npm tarballs do not include `archive/`.
- [ ] Add this to `tools/product-context-evidence/index.ts`.

### Pass Criteria

- [ ] Archived runtime identifiers do not appear in active product code.
- [ ] No active package depends on archived packages.
- [ ] No archived code is included in packed npm artifacts.
- [ ] Archive docs are clearly archival if linked anywhere.

## Round 4: Package Tarball Audit

### Goal

Validate the public package surface from packed artifacts, not workspace links.

### Packages

- `@aura3d/engine`
- `@aura3d/react`
- `@aura3d/cli`
- `create-aura3d`

### Tasks

- [ ] Run package pack commands for every public package.
- [ ] Inspect tarball file lists.
- [ ] Verify package entrypoints resolve from tarballs.
- [ ] Verify no tarball contains `archive/`.
- [ ] Verify no tarball contains stale PRD history.
- [ ] Verify no tarball contains `.png`, `.jpg`, `.jpeg`, or `.csv` unless
  explicitly allowed.
- [ ] Verify no tarball contains archived runtime identifiers.
- [ ] Verify package size and unpacked size are recorded.
- [ ] Write `tests/reports/package-tarball-audit.json`.

### Pass Criteria

- [ ] Every public package can be installed from its tarball.
- [ ] Every package entrypoint resolves.
- [ ] Public package contents match the documented surface.
- [ ] Tarballs do not ship archived runtime code.

## Round 5: Clean Install Smoke

### Goal

Prove users can install and use Aura3D from clean directories.

### Tasks

- [ ] Create a clean temp directory for each package install scenario.
- [ ] Install packed `@aura3d/engine`.
- [ ] Install packed `@aura3d/react`.
- [ ] Install packed `@aura3d/cli`.
- [ ] Install packed `create-aura3d`.
- [ ] Import `@aura3d/engine` from a minimal TypeScript app.
- [ ] Import `@aura3d/react` from a minimal React app.
- [ ] Run `aura3d --help`.
- [ ] Run `create-aura3d --help`.
- [ ] Scaffold each starter template from the packed scaffolder.

### Pass Criteria

- [ ] No workspace-only paths are required.
- [ ] No package import fails.
- [ ] CLI binaries are executable.
- [ ] Scaffolded projects install and build outside the monorepo.

## Round 6: Public API Compactness And Correctness

### Goal

Prove the public API is compact, documented, and compile-safe.

### Tasks

- [ ] Enumerate public exports from `@aura3d/engine`.
- [ ] Enumerate public exports from `@aura3d/react`.
- [ ] Confirm docs mention only exported APIs.
- [ ] Confirm examples compile against documented APIs.
- [ ] Confirm intentionally invalid calls fail at typecheck.
- [ ] Confirm archived runtime APIs are not exported.
- [ ] Add API snapshot report.

### Negative Tests

- [ ] `model("robot")` fails where typed asset refs are required.
- [ ] Non-existent asset refs fail.
- [ ] Archived runtime names fail to import.
- [ ] Undocumented prompt-runtime helpers fail to import.

### Pass Criteria

- [ ] Public API is discoverable from package exports.
- [ ] Docs and examples do not reference non-existent APIs.
- [ ] Invalid calls fail at compile time.

## Round 7: Agent Context Evaluation

### Goal

Prove the agent-readable context lets AI coding agents build working apps
without source-code spelunking.

### Allowed Context

- `ProductContextPRD.md`
- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/*`
- public package README files

### Agents

- Codex self-test
- Claude Code
- Cursor
- GitHub Copilot

### Codex Self-Test First

Before involving Claude Code, Cursor, or GitHub Copilot, run the same evaluation
with Codex as the first controlled agent.

Rules for the Codex self-test:

- [ ] Create a clean temporary workspace outside the repo.
- [ ] Copy only the allowed context bundle into that workspace.
- [ ] Do not inspect active package source while generating the app.
- [ ] Use public package install/scaffold paths only.
- [ ] Generate the TypeScript app from the allowed context.
- [ ] After generation, verify with normal developer commands.
- [ ] Record all corrections as extra turns.
- [ ] Record every invented API, wrong import, or invented asset path.
- [ ] Save results in `docs/project/agent-dogfood-results.md`.
- [ ] Save machine-readable results in
  `tests/reports/agent-context/codex-self-test.json`.

The Codex self-test is not allowed to count as proof for Claude Code, Cursor, or
Copilot. It is the first local sanity check that tells us whether the context is
clear enough before spending time on other agent surfaces.

### Tasks For Each Agent

- [ ] Build a product viewer for `sneaker.glb` with orbiting and studio
  lighting.
- [ ] Add a slow camera dolly and rain effect.
- [ ] Make the floor reflective.
- [ ] Add a click handler that changes the model to `shoe2.glb`.
- [ ] Deploy the app to a static host or produce a valid static deployment
  bundle.

### Scoring Rubric

For each task and agent, record:

- [ ] Did it compile?
- [ ] Did it run?
- [ ] Did it render a canvas with the requested scene-specific visual cues?
- [ ] Did a human reviewer classify the screenshot as product-quality rather
  than only technical-render-pass?
- [ ] Did it hallucinate an API?
- [ ] Did it invent an asset path?
- [ ] Did it use typed asset refs?
- [ ] Did it import archived runtime concepts?
- [ ] How many turns were required?
- [ ] How many manual corrections were required?
- [ ] What error messages enabled recovery?

### Pass Criteria

- [ ] Codex self-test is completed before testing the other agents.
- [ ] Codex self-test uses only the allowed context while generating the app.
- [ ] Codex screenshot verification checks visual cues, not only that a PNG file
      is non-empty.
- [ ] Codex output fails product-quality review if it is just one imported
      object plus symbolic effects.
- [ ] Each agent completes at least four of five tasks.
- [ ] No agent uses archived runtime APIs.
- [ ] API hallucination count is recorded and below the agreed threshold.
- [ ] Asset-path invention count is recorded and below the agreed threshold.
- [ ] Agent-generated apps pass build and route-health checks.

### Current Result

- Deterministic Codex self-test: pass. See
  `docs/project/agent-dogfood-results.md`.
- Fresh Codex context-only run: pass. See
  `docs/project/fresh-codex-agent-context-results.md`.
- Claude Code: not run.
- Cursor: not run.
- GitHub Copilot: not run.

## Round 8: Raw Three.js Baseline

### Goal

Prove Aura3D improves agent-written browser 3D compared with raw Three.js.

### Tasks

Run the same five agent tasks using:

- Aura3D docs and packages.
- Raw Three.js docs and packages.

### Metrics

- [ ] First compile success.
- [ ] First render success.
- [ ] API hallucination count.
- [ ] Asset-path error count.
- [ ] Lines of generated app code.
- [ ] Time to usable render.
- [ ] Correction turns.
- [ ] Static deploy success.

### Pass Criteria

- [ ] Aura3D has fewer hallucinated APIs than raw Three.js.
- [ ] Aura3D has fewer asset-path mistakes than raw Three.js.
- [ ] Aura3D reaches a product-quality visual result in fewer turns.
- [ ] Aura3D deploys with less manual intervention.

## Round 9: Asset Corpus Validation

### Goal

Prove users can bring real assets and get typed refs, useful validation, and
rendered output.

### Asset Corpus

- [ ] Valid small GLB.
- [ ] Large GLB over budget.
- [ ] Draco-compressed GLB.
- [ ] KTX2 texture GLB.
- [ ] GLTF with external `.bin`.
- [ ] GLTF with missing `.bin`.
- [ ] GLB with missing texture.
- [ ] Malformed binary file.
- [ ] File extension that lies.
- [ ] File with spaces in path.
- [ ] File with unicode in path.
- [ ] Duplicate asset name.
- [ ] Nested directory asset.
- [ ] Blender export.
- [ ] Meshy generation.
- [ ] Sketchfab CC0 asset.
- [ ] Poly Haven asset.

### Commands Per Asset

```bash
aura3d assets add ./asset.glb
aura3d assets scan
aura3d assets validate
aura3d assets typegen
npm run build
```

### Tasks

- [ ] Create `fixtures/asset-corpus/README.md` with source and license notes.
- [ ] Run every asset through the CLI.
- [ ] Record success/failure state.
- [ ] Verify valid assets generate typed refs.
- [ ] Verify invalid assets fail with actionable errors.
- [ ] Verify no normal user error produces an unhandled stack trace.
- [ ] Verify rendered templates display valid assets.
- [ ] Write `docs/project/asset-corpus-results.md`.
- [ ] Write `tests/reports/asset-corpus.json`.

### Pass Criteria

- [ ] Valid assets produce typed refs and render.
- [ ] Invalid assets fail predictably and explain how to fix the issue.
- [ ] No generated file contains machine-specific absolute paths.
- [ ] Asset refs work in TypeScript autocomplete and compile checks.

## Round 10: Typed Asset Reference IDE Test

### Goal

Prove typed asset refs work for developers and agents, not only for CLI tests.

### Tasks

- [ ] Generate `src/aura-assets.ts`.
- [ ] Confirm generated names are stable.
- [ ] Confirm TypeScript autocomplete exposes the generated asset IDs.
- [ ] Compile a correct typed asset ref.
- [ ] Confirm wrong asset IDs fail at compile time.
- [ ] Rename an asset and rerun typegen.
- [ ] Delete an asset and run validation.
- [ ] Verify diagnostics identify stale refs.

### Example Checks

```ts
import { assets } from "./aura-assets";

model(assets.productFixture);
model("product-fixture");
model(assets.missingAsset);
```

### Pass Criteria

- [ ] Correct typed refs compile.
- [ ] Raw string refs fail where typed refs are required.
- [ ] Missing refs fail with useful errors.
- [ ] Renames and deletions are reflected by typegen and validation.

## Round 11: Template Lifecycle Dogfood

### Goal

Prove each starter template behaves like a usable product starter.

### Templates

- `product-viewer`
- `cinematic-scene`
- `mini-game`

### Commands Per Template

```bash
npx create-aura3d@latest demo --template <template>
cd demo
npm install
npm run dev
npm run build
npm run preview
npm test
```

### Tasks Per Template

- [ ] Scaffold in a clean temp directory.
- [ ] Install dependencies.
- [ ] Start dev server.
- [ ] Confirm first visible render within 30 seconds.
- [ ] Run build.
- [ ] Run preview.
- [ ] Capture screenshot.
- [ ] Run route-health.
- [ ] Replace starter asset with a real glTF/GLB.
- [ ] Verify new asset appears.
- [ ] Delete an asset file and verify error quality.
- [ ] Invent an asset ID and verify type/validation failure.
- [ ] Remove canvas mount and verify route-health failure.
- [ ] Remove generated asset manifest and verify recovery guidance.

### Pass Criteria

- [ ] Template installs without source-code edits.
- [ ] Template renders a canvas with the requested visual cues.
- [ ] Template is separately reviewed for product-quality prompt fidelity.
- [ ] Template builds for static deployment.
- [ ] Template emits useful errors when intentionally broken.
- [ ] A normal developer can recover without reading package internals.

## Round 12: Diagnostics And Screenshot Quality

### Goal

Prove diagnostics and screenshots are useful product features.

### Tasks

- [ ] Run route-health on all starter templates.
- [ ] Run screenshot capture on all starter templates.
- [ ] Verify screenshots contain scene-specific visual signals.
- [ ] Perform human visual review against the prompt, not only pixel counters.
- [ ] Fail screenshots that read as one imported object plus symbolic effects.
- [ ] Require product-quality prompt fidelity before using screenshots as
  product evidence.
- [ ] Verify canvas dimensions are recorded.
- [ ] Verify diagnostics include asset readiness.
- [ ] Verify diagnostics include route readiness.
- [ ] Verify diagnostics include render backend.
- [ ] Verify diagnostics flag missing assets.
- [ ] Verify diagnostics flag missing canvas.

### Pass Criteria

- [ ] Healthy routes pass.
- [ ] Broken routes fail.
- [ ] Reports are machine-readable.
- [ ] Failure messages identify the broken route and likely cause.
- [ ] Screenshots are classified separately as render-plumbing evidence or
  product-quality prompt evidence.

## Round 13: Static Deployment Checks

### Goal

Prove Aura3D starter apps can be built and served as static sites.

### Mandatory Local Static Smoke

For each starter:

- [ ] Build the app.
- [ ] Serve `dist/` locally.
- [ ] Open root route.
- [ ] Capture screenshot.
- [ ] Verify asset MIME types.
- [ ] Verify deep-link behavior if applicable.
- [ ] Verify no dev-only diagnostics are exposed unintentionally.

### External Deployment Smoke

Deploy at least one starter to each:

- [ ] Cloudflare Pages.
- [ ] Vercel.
- [ ] Netlify.

### Pass Criteria

- [ ] Local static serve works for every starter.
- [ ] At least one starter works on each external static host.
- [ ] Assets load with correct MIME types.
- [ ] Canvas renders on deployed route.
- [ ] Deployment check produces actionable failures for missing `dist/`, missing
  assets, or invalid paths.

## Round 14: Built Bundle Size Proof

### Goal

Replace source-byte confidence with built bundle measurements.

### Artifacts To Track

- `@aura3d/engine` public entry gzip size.
- `@aura3d/react` public entry gzip size.
- `product-viewer` starter built JS gzip size.
- `cinematic-scene` starter built JS gzip size.
- `mini-game` starter built JS gzip size.

### Tasks

- [ ] Build production bundles.
- [ ] Minify where applicable.
- [ ] Gzip built JS artifacts.
- [ ] Record numbers in `BUNDLE_SIZES.md`.
- [ ] Write machine-readable report.
- [ ] Fail CI on budget regression.

### Pass Criteria

- [ ] Bundle checks measure built bundles, not source files.
- [ ] Each starter has an explicit budget.
- [ ] Each package entry has an explicit budget.
- [ ] Budget creep fails CI.

## Round 15: Docs Codeblock Execution

### Goal

Prove README and docs examples match the actual public API.

### Docs Under Test

- `README.md`
- `docs/agents/*`
- `docs/api/*`
- `docs/templates/create-aura3d-templates.md`
- public package README files

### Tasks

- [ ] Extract runnable `ts`, `tsx`, `js`, and `bash` code blocks.
- [ ] Compile TypeScript examples.
- [ ] Verify imports resolve.
- [ ] Verify CLI commands exist.
- [ ] Verify template names are valid.
- [ ] Verify package names match public package names.
- [ ] Mark intentionally illustrative snippets as non-runnable.

### Pass Criteria

- [ ] Runnable code blocks compile or execute.
- [ ] Non-runnable snippets are clearly marked.
- [ ] Docs do not reference missing packages, commands, or APIs.

## Round 16: Error Message Quality

### Goal

Treat developer-facing errors as product behavior.

### Failure Cases

- [ ] Missing asset file.
- [ ] Unsupported asset type.
- [ ] Broken GLTF.
- [ ] Invalid template name.
- [ ] Missing canvas mount.
- [ ] Blank canvas.
- [ ] Missing `dist/`.
- [ ] Malformed asset manifest.
- [ ] Duplicate asset ID.
- [ ] Stale generated type refs.

### Pass Criteria Per Error

- [ ] Nonzero exit code where applicable.
- [ ] Error names the problem.
- [ ] Error names the file, path, route, or asset ID.
- [ ] Error suggests the next command or edit.
- [ ] Expected user errors do not show raw stack traces by default.

## Round 17: Marketing Link And Copy-Button Audit

### Goal

Prove the marketing site routes users to the right product paths and does not
copy stale commands.

### Tasks

- [ ] Visit `marketing/index.html`.
- [ ] Check every nav link.
- [ ] Check every CTA link.
- [ ] Check every template link.
- [ ] Check every docs link.
- [ ] Check every `llms.txt` or agent-context link.
- [ ] Click every copy button.
- [ ] Validate copied commands.
- [ ] Verify primary getting-started paths show only the three starter templates.
- [ ] Verify evidence/gallery routes are labeled as evidence, not starter paths.

### Pass Criteria

- [ ] No broken links.
- [ ] No stale copy commands.
- [ ] No archived runtime path is promoted as a primary product path.
- [ ] Users can find install, templates, docs, assets, and agent context.

## Round 18: Marketing Comprehension Test

### Goal

Prove people outside the codebase understand the product.

### Participants

- [ ] Indie React developer.
- [ ] 3D artist who has used Three.js.
- [ ] Non-technical product manager.

### Questions

- [ ] What is Aura3D?
- [ ] Who is it for?
- [ ] What would you install first?
- [ ] What do you bring to the product?
- [ ] What does the AI agent do?
- [ ] Is this a prompt-to-3D generator or a code/asset SDK?

### Pass Criteria

- [ ] 3 of 3 identify Aura3D as SDK/tooling for agent-written browser 3D.
- [ ] 3 of 3 understand users bring assets.
- [ ] 2 of 3 can name an install or scaffold path.
- [ ] 0 of 3 think it is a hidden natural-language generator runtime.
- [ ] 0 of 3 mention internal release-cycle framing.

## Round 19: Product Rebuild From Context Alone

### Goal

Prove the PRD and agent context are sufficient for a fresh agent to build a
minimal Aura3D app.

### Allowed Input

- `ProductContextPRD.md`
- `llms.txt`
- `AGENTS.md`
- `docs/agents/*`

### Task

```text
Create a minimal Aura3D product viewer app using the documented public surface.
Do not inspect package source.
```

### Pass Criteria

- [ ] Agent chooses a valid install/scaffold path.
- [ ] Agent uses documented public APIs.
- [ ] App compiles.
- [ ] App renders.
- [ ] App uses typed asset refs.
- [ ] Agent does not import archived runtime concepts.

## Round 20: Outside Beta Dogfood

### Goal

Get feedback from users who were not involved in building the repo.

### Tasks

- [ ] Publish beta package artifacts.
- [ ] Post a focused install/test prompt to relevant communities.
- [ ] Provide an issue template for beta feedback.
- [ ] Provide a Discord or GitHub Discussions channel.
- [ ] Track install failures.
- [ ] Track asset pipeline failures.
- [ ] Track agent hallucinations.
- [ ] Track docs confusion.
- [ ] Ship fixes from beta feedback.

### Candidate Channels

- [ ] Three.js community.
- [ ] Cursor community.
- [ ] Hacker News Show HN.
- [ ] Indie web/React developer group.
- [ ] 3D artist/dev Discord.

### Pass Criteria

- [ ] At least five external users attempt install or scaffold.
- [ ] At least three external users render a starter app.
- [ ] Feedback is recorded in issues or dogfood docs.
- [ ] Critical install/render/docs bugs are fixed or documented before stable
  release.

## Execution Schedule

### Phase 1: Same-Day Internal Proof

- [ ] Round 0: Evidence matrix.
- [ ] Round 1: Release gate verification.
- [ ] Round 2: Product-language guard.
- [ ] Round 3: Archive isolation.
- [ ] Round 4: Tarball audit.
- [ ] Round 5: Clean install smoke.
- [ ] Round 11: Template lifecycle dogfood.

### Phase 2: Two-Day Product Proof

- [ ] Round 6: Public API correctness.
- [ ] Round 7: Agent context evaluation.
- [ ] Round 8: Raw Three.js baseline.
- [ ] Round 9: Asset corpus validation.
- [ ] Round 10: Typed asset IDE test.
- [ ] Round 12: Diagnostics and screenshot quality.
- [ ] Round 13: Static deployment checks.
- [ ] Round 14: Built bundle size proof.

### Phase 3: One-Week External Proof

- [ ] Round 15: Docs codeblock execution.
- [ ] Round 16: Error message quality.
- [ ] Round 17: Marketing link and copy-button audit.
- [ ] Round 18: Marketing comprehension test.
- [ ] Round 19: Product rebuild from context alone.
- [ ] Round 20: Outside beta dogfood.

## Stop-Ship Conditions

- [ ] Public package tarballs include archived runtime code.
- [ ] Clean install cannot scaffold and build at least one starter.
- [ ] All three starters fail to render screenshots with the requested visual
  cues.
- [ ] All three starters remain technical-render-pass only after product-quality
  review.
- [ ] Agent docs consistently cause agents to hallucinate archived APIs.
- [ ] Asset CLI cannot produce typed refs for normal valid GLBs.
- [ ] Marketing users think the product is a hidden natural-language generator
  runtime instead of an agent-facing browser 3D SDK.
- [ ] Bundle proof measures source files instead of built bundles.
- [ ] Public docs reference APIs that do not exist.

## Final Release Confidence Criteria

Aura3D can move from PRD compliance to product confidence when:

- [ ] `check:release` passes.
- [ ] `check:product-context` passes.
- [ ] Package tarball audit passes.
- [ ] Clean install smoke passes.
- [ ] All three templates scaffold, build, render, and preview.
- [ ] Asset corpus results are recorded.
- [ ] At least one real static deployment succeeds.
- [ ] Agent dogfood results show fewer mistakes than raw Three.js baseline.
- [ ] Marketing comprehension test passes.
- [ ] Known gaps have explicit owners and next evidence.

## Open Decisions

- [ ] Define exact bundle budgets for engine, React adapter, and all starters.
- [ ] Choose external static host order: Cloudflare Pages, Vercel, Netlify.
- [ ] Choose exact beta package name/version.
- [ ] Choose asset corpus sources and licenses.
- [ ] Choose hallucination threshold for agent dogfood.
- [ ] Choose public API export snapshot format.
- [ ] Choose whether dogfood results belong in repo docs, GitHub issues, or both.

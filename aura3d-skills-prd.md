# Aura3D Agent Skills PRD

- Status: Draft for review (revision 2)
- Date: 2026-09-25
- Owner: Aura3D platform
- Current release context: Aura3D 3.0.1 (`package.json`, `README.md`, `llms.txt`)
- Inspiration catalog: https://github.com/scenario-labs/skills (MIT, Agent Skills spec, ~60 skills, Scenario MCP at `https://mcp.scenario.com/mcp`)

Revision 2 changes: this PRD originally selected skills by asking which `scenario-labs/skills` entries to port. A codebase review showed the highest-value skills are Aura3D-native workflows that Scenario has no equivalent for: scene authoring, the asset pipeline, evidence and claims, browser games, character animation, the Animation Studio director loop, and three.js migration. It also showed that skills do not reach downstream projects today. The catalog is now built from the codebase first. Scenario verdicts are kept in section 7. Several ported skills were merged, retargeted, or cut because the engine already solves the problem (see section 6.3).

## 1. Problem

Aura3D agents already have prose guidance (`llms.txt` at 303 lines, 21 files in `docs/agents/`, `docs/animation-studio/*`, `docs/guides/build-a-browser-game.md`), but only one load-on-demand procedural skill, `.cursor/skills/meshy-cli/SKILL.md`. Three consequences follow:

1. Agents must read about 4,000 lines of docs to reach the right procedure. The rules that matter most, like catalog-first, typed assets, claim labels, the silent-render rule, and evidence before claims, are spread across a dozen files.
2. Multi-step workflows that exist in code have no procedure. Examples are the Scene-Tool CLI director loop (`animation-scene new|cast|set|block|camera|shot|dialogue|retime|validate|render`), fighting-character certification, racing and platformer geometry binding, and three.js migration through `@aura3d/three-compat`.
3. Downstream projects get none of it. `create-aura3d` templates ship with no `llms.txt`, no `docs/agents`, and no skills. `aura3d init --agent all` writes a 20-line `AGENTS.md`, `.claude/CLAUDE.md`, `.cursor/rules/aura3d.mdc`, and `.github/copilot-instructions.md` that point to `./llms.txt` and `./docs/agents/README.md`, and neither file exists in a scaffolded project.

## 2. Goals and Non-goals

Goals:

1. Ship a focused set of Aura3D skills (11 total, see section 6) that cover the workflows agents actually run in this codebase. Each skill is short, procedural, and names real CLI commands, public APIs, and gates.
2. Distribute skills to downstream projects through `aura3d init` and `create-aura3d`, not only to this monorepo.
3. Keep every hard boundary: catalog-first, typed assets, claim labels (`createAuraApp` root safe API / `production-runtime` / `rendering` internals / CLI asset pipeline / template-only scaffold / prototype / roadmap), the silent-render rule (Aura3D never runs TTS), AuraVoice ownership of voice, captions, and mux, no primitive-primary subjects, no CSS or DOM fake rendering, and no `three`/`GLTFLoader`/raw URLs in public examples.
4. Put skills under a CI gate so referenced commands, flags, APIs, and links cannot silently rot.
5. Record a verdict for every `scenario-labs/skills` entry (port, optional install, or skip) with a reason.

Non-goals:

- Becoming a Scenario client. No `https://mcp.scenario.com/mcp` dependency in the engine, CLI, templates, or release gates.
- AI video or audio generation inside Aura3D.
- New runtime packages. Skills orchestrate existing CLI commands, kits, prefabs, validators, and evidence tools. A missing capability becomes a labeled gap or a roadmap item, not a workaround inside a skill.
- Replacing the federated catalog (`@aura3d/asset-index`) or the Meshy pipeline (`docs/meshy-cli.md`).
- Bulk `npx skills add scenario-labs/skills --skill "*"` into this repo.

## 3. Current-state inventory (verified in-repo on 2026-09-25)

### 3.1 Skill and agent-instruction surface

| Path | What it is |
| --- | --- |
| `.cursor/skills/meshy-cli/SKILL.md` | The only skill. Pointer style: require the `@meshy-ai/cli@0.2.0` pin, read `--help`, dry-run, explicit approval, `--max-credits`, `--async` and resume, download to `artifacts/meshy/<asset>/`, admit through the Aura3D import path. Defers to `docs/meshy-cli.md`. |
| `.cursor/rules/` | Empty. |
| `.claude/` | Empty. No `.agents/` or `.codex/` directory. |
| `packages/aura3d-cli/src/index.ts` `initAgentFiles` / `genericAgentText` | `aura3d init --agent claude\|cursor\|copilot\|generic\|all` writes one generic instruction file per client. No skills are written. The file references `./llms.txt` and `./docs/agents/README.md`, which scaffolded projects do not contain. |
| `packages/create-aura3d/package.json` `files` | Ships `dist` plus template directories. Templates contain no agent instructions or skills. |
| `tools/agent-docs/index.ts` (`pnpm check:agent-docs`) | Gates `llms.txt`, `public/llms.txt`, and 11 `docs/agents/*` files. It does not know about skills. |
| `cli-configs/install-meshy-mcp.sh`, `meshy-mcp-keychain-launcher`, `setup-meshy.sh`, `meshy-agent` | Pinned Meshy MCP (`@meshy-ai/meshy-mcp-server@0.5.1`) install and keychain launcher. |

### 3.2 CLI surface skills must target (`packages/aura3d-cli/src/cli-help.ts`)

- `assets search <query> [--profile …] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]`
- `assets resolve <query> --name <n> [--profile …] [--index N] [--candidate-id ID]`
- `assets add <file> --name <n> [--type model|texture|environment|audio|navigation] [--license …] [--source-page …] [--author …] [--quality ungraded|blocked|prototype|candidate|release] [--role character|vehicle|world|environment|track|product|weapon|prop|set-dressing|debug|abstract|unknown] [--rendered-probe-json …] [--orientation-json …]`
- `assets import-meshy <dir> --name <n> --rights-evidence <json> [--profile prop|environment|vehicle|humanoid] [--quality candidate]` (local-only, never certifies release)
- `assets scan`, `assets list`, `assets typegen`, `assets thumbnail`
- `assets inspect <glb> [--animation] [--humanoid] [--skeleton] [--morphs] [--license]`
- `assets validate [--asset id|--no-assets] [--source [src]] [--release] [--no-placeholders] [--require-license] [--provenance evidence.json]`
- `assets validate-game [--profile fighting-character] [--asset …]`
- `assets validate-animation-studio [--episode] [--asset …]`
- `assets validate-animation --clips … --map idle=…,walk=…,run=… [--require …] [--require-rig]`
- `assets assemble-character --name <n> --body <b> --part slot=<asset>`
- `assets certify-game-geometry --asset(s) … --category racing|platformer`
- `assets bind-game-route-evidence --route … --category … --assets … --screenshot … --geometry-report … --composition-report … --visual-review …`
- `animation plan|preview|render|package|review|verify [--dry-run]`
- `animation scene <new|show|cast add|prop add|set|block|camera|gesture|dress|clear-props|scale|shot|dialogue|retime|undo|validate|render>` (delegates to `templates/animation-studio/scripts/animation-scene.ts`)
- `doctor`, `check-deploy --dist dist [--release] [--source]`, `init --agent all`

Note that `--type texture|environment|audio|navigation` and `assets thumbnail` already exist. The original PRD did not account for them.

### 3.3 Engine and package surfaces skills must route to

- Scene authoring: `definePromptPlan`, `compilePromptPlan` (`report.visualSystems`, `negativeCriteria`, `repairHints`), `promptPlanToScene`, `sceneKits.*` (10 kits), `prefabs.*`, `promptRecipes`, `diagnostics: { overlay: true }` (`docs/agents/build-playbook.md`).
- Built-in look systems: `environments.studio|materialLab|productHero|…`, `sky.dayNight`, `weather`, `water`, `lights.*`, `material.*`, `effects.*` including the `flipbook-sprite` effect with `spriteColumns`/`spriteRows`, `labels.*`, SDF text.
- `@aura3d/materials`: modules `TextureSet.ts`, `PBRMaterialLibrary.ts`, `GameReadyMaterialLibrary.ts`, `MaterialPresets.ts` (file names, not exports); validators `validateGameReadyMaterialPreset` / `validateGameReadyMaterialLibrary` are exported from the `/node` subpath.
- `@aura3d/environments`: modules `HDRIEnvironment.ts`, `EnvironmentRegistry.ts`, `PMREMPreset.ts`, `EnvironmentPreview.ts`; `verifyThreeCompatHdriFile` and `inspectProductionHDR` are exported from the `/node` subpath. Renderer side: `docs/rendering/environment-lighting.md`, `texture-compression.md` (KTX2/Basis).
- Games: `game.platformer|racing|fallingBlocks`, `game.evidence(app, …)`, `games.*`, `gameFeel`, `physics.*`, `@aura3d/physics` controllers (arcade/physical character and vehicle, `FightingCharacterController`, `HitboxWorld`), `@aura3d/input`, `@aura3d/controls`.
- Animation: `AnimationController` / `createAnimationController`, `animation.onEvent`, `setAnimationPose`, `setMorphTargets`, `sampleAuraVoiceBridgeAtTime`.
- Visual QA helpers that exist: `material.visualQA`, `neon.visualQA`, `charts.visualQA`, plus `character`, `city`, `product`, and `solar` helper namespaces. Skills must cite only helpers verified at authoring time.
- `@aura3d/workflows` (`visualQARequired: true` on production workflows), `@aura3d/product-studio`, `@aura3d/three-compat` (`ThreeApiInventory`, `ThreeCompatibilityMatrix`, `ApproximationLedger`).

### 3.4 Catalog reality check

`@aura3d/asset-index` adapters: `aura-index`, `jsdelivr-mirror`, `khronos`, `marketplace`, `os3a`, `poly-haven`, `poly-pizza`, `sketchfab`. The Poly Haven adapter indexes glTF models only. There is no HDRI or texture adapter. The original PRD's "catalog-first search for tileable PBR sets" and "equirect skybox from catalog" steps have no backing search today. Section 6 fixes those skills to use built-in presets and `assets add --type texture|environment`, and section 10 lists a texture and HDRI adapter as an optional library follow-up.

### 3.5 Templates and evidence

- 19 templates in `packages/create-aura3d/templates/`: `product-viewer`, `cinematic-scene`, `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `animation-channel`, `prompt-animation-channel`, `animation-studio`, `episode-builder`, `character-controller`, and 8 `three-compat-*` templates.
- Template gate: `npm run build`, then `npm run test` (Playwright `route-health.spec.ts` + `screenshot.spec.ts`), then `assets validate`, then `check-deploy`.
- Repo gates referenced by skills: `check:agent-docs`, `check:templates`, `check:assets-cli`, `check:game-runtime`, `verify:claims` (claim registry), `evidence:plan|command|plan-check`, and the Animation Studio gate suite under `tools/animation-studio-*`.
- Benchmark mode is different (`docs/agents/benchmark-recipes.md`): finite `npm install` and `npm run build`, then stop. No dev server, Playwright, or screenshots inside the agent process. Any skill that says "take screenshots" must branch on benchmark mode.

### 3.6 Gaps

Workflow gaps (existing code, no procedure):

1. Prompt to scene: choose a kit or template, write a prompt plan, compile, read repair hints, render, and review. The procedure is spread across `build-playbook.md`, `prompt-to-3d-workflow.md`, and `benchmark-recipes.md`.
2. Asset pipeline: search, resolve or add, inspect, validate, typegen, and use `model(assets.x)`, including rejection when no clean candidate exists.
3. Evidence and claims: route-health, desktop and mobile screenshots, visual QA, claim labeling, the L0 to L4 cinematic ladder, `check-deploy`, and the benchmark exception.
4. Browser games: genre kits, input, restart and score loops, fighting-character certification, and racing and platformer geometry binding.
5. Character animation: humanoid inspection, clip mapping, velocity-gated locomotion, events, morphs and visemes, character assembly.
6. Animation Studio director loop with Scene-Tool CLI, silent render, and AuraVoice handoff.
7. three.js migration through `three-compat` templates and the approximation ledger, without drop-in claims.
8. Performance and diagnostics: profiling reports, bundle size, KTX2, LOD and instancing.

Asset-authoring gaps (the original PRD's scope):

9. Materials, textures, and environments beyond built-in presets.
10. VFX flipbook sheets and HUD icons for games.
11. Restyling a finished mesh without touching geometry.
12. Deeper Meshy decision guidance (retexture, remesh, rig, animate, polycount budgets).

Distribution gap:

13. Skills never ship to scaffolded projects, and the generated instruction files reference files that are not there.

## 4. Decision framework

A candidate skill is built only if all four hold:

1. A real procedure exists in code: CLI commands, public APIs, or gates an agent can run today.
2. Agents get it wrong without guidance. The evidence is an existing rule doc, gate, or anti-pattern list written because of past failures.
3. It is not already covered by a built-in engine feature. If `camera.*` can render any angle, no skill generates angles.
4. It can be verified: the skill's commands and APIs can be checked by the skills gate (section 8.3).

Scenario entries are then mapped onto that catalog: PORT when the pattern improves an Aura3D skill, INSTALL-AS-IS for optional per-developer content ops outside release gates, SKIP otherwise.

## 5. Skill design rules

- Format: Agent Skills `SKILL.md` with `name` and `description` frontmatter. Every description contains "Use when …" trigger phrasing and names the relevant template, command, or API so the skill loads on demand.
- Length: body under about 150 lines. Establish the contract (read `--help` and the installed version), give the ordered procedure, give stop and reject conditions, then link to the full doc. Full policy stays in `docs/`.
- Shared rules live once in `aura3d-core/references/boundaries.md`: the claim labels, forbidden patterns, catalog-first rule, typed-asset rule, paid-generation controls, and the benchmark exception. Other skills link to it and do not restate it.
- Doc links must resolve in both environments. A downstream project has no `docs/`. Skills link to published docs on `https://aura3d.auraone.ai/` or to files bundled in the skill's own `references/`. They never link to repo-relative `docs/` paths.
- Commands are shown as `npx @aura3d/cli@<pinned> …` in downstream copies and `pnpm …` inside the monorepo, and the skills gate checks both.
- No secrets, provider tokens, Scenario URLs, member names, or cost tables.
- Every skill has a "Stop and report" section: the conditions under which the agent must stop and label work `blocked` or `prototype` instead of working around a missing capability.

## 6. Skill catalog

### 6.1 Core skills (Aura3D-native, highest value)

| ID | Skill | Use when | Procedure it encodes | Grounded in |
| --- | --- | --- | --- | --- |
| C1 | `aura3d-core` | Starting any Aura3D task, or before writing public examples or claims | Orientation plus shared `references/boundaries.md`: three.js to Aura3D mapping, claim labels, forbidden patterns, which skill to load next, and benchmark versus normal mode | `llms.txt`, `claims-and-boundaries.md`, `no-hackjob-rules.md`, `anti-hallucination-rules.md` |
| C2 | `aura3d-scene-authoring` | Turning a prompt into a scene or route | Pick template, then scene kit, then prefab, with primitives last. Write `definePromptPlan`, run `compilePromptPlan`, and fix `repairHints` before rendering with `promptPlanToScene`. Pick the look from built-in `environments`, `sky`, `lights`, `material`, and `effects` before any external asset. Hand off to C4 for review. | `build-playbook.md`, `prompt-to-3d-workflow.md`, `benchmark-recipes.md`, scene-kit selection table in `llms.txt` |
| C3 | `aura3d-assets` | A prompt names a real object, or the user brings a GLB | `assets search`, then `resolve --name` for auto-pullable candidates, or `add`, then `inspect`, `validate --source`, `typegen`, and use `model(assets.x)`. Covers `--type`, `--role`, `--quality`, provenance flags, profiles, and the rule that marketplace and deep-link results are user-handled. When no clean candidate exists, stop and report the rejection reasons, then offer the Meshy fallback (P1). This replaces Scenario's core-loop skill with the correct backend. | `asset-workflow.md`, `asset-selection.md`, CLI help |
| C4 | `aura3d-evidence-review` | Before calling anything done, public, or shippable, or when comparing candidate assets | Route-health, desktop and mobile screenshots with pixel checks, verified `visualQA` helpers, `compilePromptPlan` repair hints, the L0 to L4 cinematic ladder, claim label selection, `assets validate --release`, and `check-deploy`. Critique loop (from Scenario's review group): pre-registered rubric, batched pass/warn/fail verdicts, cheapest targeted fix, round cap of 3. Bake-offs compare catalog and Meshy candidates on one brief. Benchmark mode stops after build. Includes thumbnail and poster capture via `assets thumbnail` and screenshot specs, absorbing the useful part of the old `aura3d-formats`. | `verification.md`, `rendering-proof-required.md`, `cinematic-scene-quality.md`, `deployment.md`, `verify:claims` |

### 6.2 Domain skills

| ID | Skill | Use when | Procedure it encodes | Grounded in |
| --- | --- | --- | --- | --- |
| D1 | `aura3d-browser-game` | Building or editing `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `character-controller`, or Aura Clash | Genre kit first (`game.platformer`, `racing`, `fallingBlocks`). Input bindings, restart, and score or fail loop. `game.evidence(app, …)` after `app.step`. Fighter path: `search`/`resolve --profile fighting-character`, then `validate-game --no-placeholders --require-license`. Racing and platformer: `certify-game-geometry`, then `bind-game-route-evidence`. Hide debug hitboxes outside evidence mode. Stop if no production-ready fighter exists. | `build-a-browser-game.md`, `game-example-standards.md`, `game-showcase-build.md`, `check:game-runtime` |
| D2 | `aura3d-character-animation` | Using rigged humanoids, clips, locomotion, morphs, visemes, or assembled characters | `inspect --animation --humanoid --skeleton --morphs` before naming clips. `validate-animation --map … --require-rig`. Use `AnimationController` crossfades and layers, `onEvent` for hitbox, sfx, vfx, and caption events, and velocity-gated locomotion. Apply morphs and visemes through `setMorphTargets` and `sampleAuraVoiceBridgeAtTime`. Reusable identity through `assemble-character` with body and part provenance, reused across scenes (the useful half of Scenario's consistency skills). | `llms.txt` hello-world section, `docs/rendering/skinning-and-morphs.md`, `docs/rendering/animation.md` |
| D3 | `aura3d-animation-studio` | Working in the `animation-studio` template or producing an episode | The agent is the director. `animation scene new --prompt "…" --full`, then `cast add --query|--file` (A-grade cast, never the moon-garden default), `set` (per `pickSetForPrompt`), `block`, `camera`, `shot`, and `dialogue --line --speaker --text --start`, then `retime`, `undo`, and `validate`, then `render` with `AURA_QUALITY` and `AURA_RENDER_STYLE`. The render is silent and the dialogue track is the AuraVoice contract. Previs front section (from Scenario inspiration and storyboards): A/B/C/D directions, a one-line beat sheet, and locked cast before blocking. Captions stay in the dialogue track and are never baked into pixels. Publish checklist: independent motion, visible mouth motion, exported captions, and a passing gate suite. | `llms.txt` Animation Studio rules, `docs/animation-studio/*`, `docs/workflows/animation-episode-production.md`, `tools/animation-studio-*` gates |
| D4 | `aura3d-threejs-migration` | Porting three.js code, or using a `three-compat-*` template | Choose the matching `three-compat-*` template. Map APIs using the `llms.txt` table and `ThreeCompatibilityMatrix`. Record approximations in the `ApproximationLedger`. Keep `three` out of `@aura3d/engine` routes. Never claim drop-in parity, and name the specific supported API with its test. | `docs/project/migration.md`, `packages/three-compat/src`, `tests/browser/three-compat-*.spec.ts` |

### 6.3 Asset-authoring skills (from the original PRD, revised)

| ID | Skill | Change from revision 1 | Procedure |
| --- | --- | --- | --- |
| P1 | `meshy-cli` (extend) | Kept | Add a decision tree for when to retexture, remesh, rig, or animate, versus rejecting. Add texture precedence, per-`--profile` polycount traps, and the rig handoff to D2 (`validate-animation`). Keep the pin, dry-run, approval, and `--max-credits` controls. Do not copy upstream Meshy skill text. |
| P2 | `aura3d-materials-environments` | Merges `aura3d-textures` and `aura3d-skyboxes`. Order changed to built-ins first. | 1. Built-ins: `material.*`, `MaterialPresets`, `PBRMaterialLibrary`, `GameReadyMaterialLibrary`, `environments.*`, `sky.dayNight`, `weather`, and `water`. 2. A licensed local or Poly Haven HDRI or texture admitted with `assets add --type environment|texture` plus license and provenance flags. 3. A generated plate (optional section 7.2 image skill), treated as a candidate. Checks: `validateGameReadyMaterialPreset`, `verifyThreeCompatHdriFile` and environment diagnostics, a 2:1 equirect with a left and right seam check, a tiling screenshot with no visible seam, KTX2 guidance from `texture-compression.md`, and `material.visualQA`. Reject missing roughness or metalness where the role expects PBR. |
| P3 | `aura3d-game-art` | Replaces `aura3d-game-assets` and targets real consumers | Flipbook VFX sheets for the `flipbook-sprite` effect (columns and rows must match, frame inventory, transparent background, and fail-loud UV validation). HUD icons and UI sprites (DOM and CSS are allowed for UI only). Style-consistent batches. Tilesets are dropped: no 2D tile runtime consumes them, so 3D levels use D1 and C3. Every file lands as a typed asset, or the route is labeled `prototype`. |
| P4 | `aura3d-retexture` | Renamed from `aura3d-retexture-views`. Orbit views cut. | Restyle a finished mesh while keeping geometry untouched. Compare pre and post bounds and position-accessor hashes from `assets inspect`. Map one material family to one map set. Capture a matched before and after screenshot filmstrip. Orbit views are not needed because the engine renders any camera angle from the real mesh through `camera.*`. Generating fake angles from a 2D concept conflicts with the rendering-proof rule. |

### 6.4 Later-phase skill

| ID | Skill | Use when | Procedure |
| --- | --- | --- | --- |
| L1 | `aura3d-performance` | A route is slow, heavy, or over budget, or before performance claims | `doctor`, `diagnostics: { overlay: true }`, profiling reports (`docs/debug/profiling-and-diagnostics.md`), `check:bundle-size` and `BUNDLE_SIZES.md`, KTX2 compression, instancing and LOD (`docs/rendering/geometry-instancing-lod-text.md`), the "over 50MB model" warning from `validate`, and the rule that comparative performance claims need current like-for-like reports. |

### 6.5 Removed from revision 1

| Revision 1 skill | Outcome | Reason |
| --- | --- | --- |
| `aura3d-textures`, `aura3d-skyboxes` | Merged into P2 | Same admission path (`assets add --type`), same built-in first step, and neither has a catalog adapter. |
| `aura3d-asset-review` | Merged into C4 | Review without the evidence gates is incomplete, and evidence without a critique loop is shallow. One skill owns both. |
| `aura3d-previs` | Folded into D3 | Its only real consumer is the `EpisodeDocument` and Scene-Tool loop. As a standalone skill it would duplicate D3's director procedure. |
| `aura3d-cast-consistency` | Split into D2 (`assemble-character`) and D3 (cast binding) | Two different mechanisms. The skill would mostly have repeated them. |
| `aura3d-formats` | Reduced to a section of C4 | Storefront, social, and print placement matrices are marketing production, not SDK procedure. Thumbnail and poster capture is real (`assets thumbnail`, screenshot specs) and belongs with evidence. |
| Orbit views (half of P5) | Cut | The engine renders real angles, and painted angles would be unverifiable art. |

## 7. `scenario-labs/skills` verdicts

Source groups (repo README, fetched 2026-09-26): getting started (`scenario`); direction (`scenario-inspiration`); images (`scenario-image`, `-product-shots`, `-brand-kit`, `-image-editing`, `-text-overlay`, `-storyboards`); game art (`-game-assets`, `-sprite-animation`, `-textures`, `-skyboxes`, `-3d`, `-patina-retexture`, `-orbit-views`); video and audio (`-video`, `-video-editing`, `-seedance-music-video`, `-seedance-storyboard`, `-video-ads`, `-ugc`, `-fan-cam`, `-audio`, `-video-assembly`, `-caption-studio`); consistency (`-consistency`, `-identity-library`, `-model-training`); review (`-asset-analysis`, `-quality-gate`, `-refine-loop`, `-model-comparison`); formats (`-formats`); workflows (`-workflows`, `-workflow-authoring`); troubleshooting (`-moderation`, `-report`); admin (`-team-admin`, `-admin-analytics`); image families (8), video families (10), audio families (4), and 3D families (`meshy`, `rodin`, `sparc3d`, `3d-worlds`). MIT license. Installed with `npx skills add scenario-labs/skills --skill "<name>"`.

### 7.1 Ported (patterns rewritten, not copied)

| Scenario source | Lands in | Pattern taken |
| --- | --- | --- |
| `scenario-3d`, `scenario-meshy` | P1 | Retexture, remesh, UV, rig, and animate toolchain order, texture precedence, polycount traps |
| `scenario-textures`, `scenario-skyboxes` | P2 | Tiling-safe upscale, equirect seam checks, engine sizing |
| `scenario-game-assets`, `scenario-sprite-animation` | P3 | Transparent batches, style consistency, sheet slicing, frame inventory |
| `scenario-patina-retexture` | P4 | Geometry-untouched restyle, one material family per map set |
| `scenario-inspiration`, `scenario-storyboards` | D3 previs section | A/B/C/D directions, script-first panels, locked cast |
| `scenario-consistency`, `scenario-identity-library` | D2, D3 | Baseline-plus-delta, identity reuse across scenes |
| `scenario-asset-analysis`, `-quality-gate`, `-refine-loop`, `-model-comparison` | C4 | Rubric-first critique, verdict tiers, cheapest fix, round caps, pre-registered bake-offs |
| `scenario-formats` (capture half), `scenario-image` (reference-plate pattern) | C4, P2, P3 | Poster and thumbnail capture; generated images as concept, texture, or plate candidates only |
| `scenario` (core loop) | C3, by analogy only | Discover, schema, run, wait, download, mapped onto search, resolve, inspect, validate, typegen. No Scenario content. |

### 7.2 Optional per-developer installs (content ops only, never vendored or gated)

| Scenario skill | Allowed use | Guardrail |
| --- | --- | --- |
| Image families (`gpt-image`, `seedream`, `ideogram`, `gemini-image`, `reve`, `mai-image`, `grok-imagine-image`, `luma-image`) | `reference.png` for image-to-3D, concept art, thumbnails, texture or HDRI plates for P2 and P3 | Output is an untrusted candidate under `artifacts/`. The runtime still requires typed assets through the CLI. |
| `scenario-product-shots` (photo half) | Marketing packshots | The in-app hero object stays `model(assets.x)`. |
| Video and audio families, `scenario-video`, `scenario-audio` | Trailers and source material for AuraVoice | Never claimed as Aura3D render output. The silent-render rule stands. |
| `scenario-3d-worlds`, `scenario-rodin`, `scenario-sparc3d` | One-off evaluation only after catalog and Meshy both fail a brief | No second provider pipeline without a new PRD. |

### 7.3 Skipped

| Scenario skill(s) | Reason |
| --- | --- |
| `scenario-orbit-views` | The engine renders real angles. See section 6.5. |
| `scenario-video-editing`, `-video-assembly`, `-caption-studio`, `-seedance-*`, `-video-ads`, `-ugc`, `-fan-cam` | Aura3D renders silent WebGL, and AuraVoice owns voice, captions, and mux. |
| `scenario-model-training` | There is no training backend. Consistency comes from the catalog, `assemble-character`, and D3 cast binding. |
| `scenario-workflows`, `-workflow-authoring` | Scenario's graph grammar is a different system from `@aura3d/workflows`, `editor-runtime`, and `scripting`, which have their own evidence rules. |
| `scenario-team-admin`, `-admin-analytics` | No equivalent. Aura3D spend control is Meshy credit approval. |
| `scenario-moderation`, `-report` | Provider-specific. The Aura3D equivalents are `docs/agents/troubleshooting.md` and this repo's issue process. |
| `scenario-brand-kit`, `-text-overlay`, `-image-editing` | 2D brand production. In-scene text uses `labels.*` and SDF text, not baked PNG cards. |
| Per-member cost and parameter tables in all family skills | They go stale quickly and do not apply. The catalog is the free path. Meshy uses dry-run plus `--max-credits` approval. |

## 8. Architecture and distribution

### 8.1 Canonical source and layout

```text
packages/aura3d-cli/skills/            # canonical source, shipped in the npm package
  aura3d-core/SKILL.md
  aura3d-core/references/boundaries.md
  aura3d-scene-authoring/SKILL.md
  aura3d-assets/SKILL.md
  aura3d-evidence-review/SKILL.md
  aura3d-browser-game/SKILL.md
  aura3d-character-animation/SKILL.md
  aura3d-animation-studio/SKILL.md
  aura3d-threejs-migration/SKILL.md
  aura3d-materials-environments/SKILL.md
  aura3d-game-art/SKILL.md
  aura3d-retexture/SKILL.md
  meshy-cli/SKILL.md                    # moved from .cursor/skills/meshy-cli
  manifest.json                         # skill -> templates, pinned CLI version, doc URLs
```

- Add `"skills"` to `packages/aura3d-cli/package.json` `files`.
- The monorepo's `.cursor/skills/`, `.claude/skills/`, and `.agents/skills/` are generated copies (`pnpm skills:sync`), checked in so this repo's own agents load them. The sync is verified by the skills gate. `.cursor/skills/meshy-cli` stays at its current path after the move, so there is no break for existing users.

### 8.2 Downstream delivery

- `aura3d init --agent <client> [--skills core|all|none]`, default `core`. It writes the manifest-selected skills to `.claude/skills/`, `.cursor/skills/`, or `.agents/skills/` (for Codex and generic clients). It also writes a bundled `llms.txt` so the existing instruction-file reference resolves. `genericAgentText` is updated to point at the skills and published doc URLs instead of the missing `./docs/agents/README.md`.
- `create-aura3d` runs the same writer after scaffolding, selecting skills from the manifest template mapping. For example, `fighting-game` gets C1 to C4, D1, and D2, and `animation-studio` gets C1 to C4, D2, and D3. It asks before writing agent files, or accepts `--agent`.
- Skills never overwrite a user-edited file. The writer compares a content hash recorded in the manifest and skips files the user has changed, with a notice.

### 8.3 Skills gate (`pnpm check:skills`, added to `check:agent-docs`)

- Frontmatter is valid, `description` contains "Use when", and the body is within the length budget.
- Every `aura3d …` command and flag in a skill exists in `cli-help.ts`. Every `animation scene` verb exists in `animation-scene.ts`.
- Every engine API named in a skill is exported from `@aura3d/engine` or the named package, checked against `tools/agent-api-surface` output.
- Links resolve: published URLs are in `sitemap.xml`, and bundled references exist.
- No forbidden content: `three` imports in examples, raw GLB URLs, `unsafeModelUrl`, Scenario URLs, secrets.
- Generated copies (`.cursor`, `.claude`, `.agents`) match the canonical source.
- `aura3d init --skills all` in a temporary directory writes the expected tree, as a `check:templates` extension.

## 9. Rollout

- Phase 0: review this PRD and approve sections 6 and 7.
- Phase 1 (foundation, 1 PR): canonical skills directory, manifest, `skills:sync`, `check:skills` gate, the `init --skills` writer, a bundled `llms.txt`, and the `genericAgentText` fix. Skills: C1 `aura3d-core`, C3 `aura3d-assets`, C4 `aura3d-evidence-review`, and the `meshy-cli` move and extension (P1). Distribution ships first because every later skill depends on it.
- Phase 2 (authoring and domains, 1 PR): C2 `aura3d-scene-authoring`, D1 `aura3d-browser-game`, D2 `aura3d-character-animation`, and the `create-aura3d` integration. Each skill is proven against one template: `product-viewer`, `fighting-game`, and `character-controller`.
- Phase 3 (studio and migration, 1 PR): D3 `aura3d-animation-studio`, proven with one episode through the gate suite with the render silent and the AuraVoice track intact. D4 `aura3d-threejs-migration`, proven with `three-compat-custom-threejs-migration`.
- Phase 4 (asset authoring, 1 PR): P2, P3, P4, proven with `cinematic-scene` (night environment), `mini-game` (flipbook VFX), and one retexture before and after filmstrip.
- Phase 5: L1 `aura3d-performance`.
- Each phase ships `SKILL.md` files, `docs/agents/README.md` and `prompt-to-3d-workflow.md` routing updates, and one worked example log (commands, validator output, screenshots). No live paid generation in CI. Meshy smoke tests stay manual-dispatch per `docs/meshy-cli.md`.

### 9.1 Task checklist

Phase 0:
- [x] T0.1 Resolve open questions (section 11) with recorded defaults.

Phase 1 (foundation):
- [x] T1.1 Canonical `packages/aura3d-cli/skills/` directory + `manifest.json`; `"skills"` added to CLI package `files`.
- [x] T1.2 `pnpm skills:sync` generating `.cursor/skills`, `.claude/skills`, `.agents/skills` copies.
- [x] T1.3 `pnpm check:skills` gate (frontmatter, CLI commands/flags, animation-scene verbs, engine APIs, links, forbidden content, sync drift, init smoke), wired into `check:agent-docs`.
- [x] T1.4 `aura3d init --skills core|all|none` writer with user-edit protection + bundled `llms.txt`.
- [x] T1.5 `genericAgentText` points at skills and published docs instead of missing `./docs/agents/README.md`.
- [x] T1.6 C1 `aura3d-core` + `references/boundaries.md`.
- [x] T1.7 C3 `aura3d-assets`.
- [x] T1.8 C4 `aura3d-evidence-review`.
- [x] T1.9 P1 `meshy-cli` moved to canonical source and extended.

Phase 2 (authoring and domains):
- [x] T2.1 C2 `aura3d-scene-authoring`.
- [x] T2.2 D1 `aura3d-browser-game`.
- [x] T2.3 D2 `aura3d-character-animation`.
- [x] T2.4 `create-aura3d` writes manifest-selected skills after scaffolding.

Phase 3 (studio and migration):
- [x] T3.1 D3 `aura3d-animation-studio`.
- [x] T3.2 D4 `aura3d-threejs-migration`.

Phase 4 (asset authoring):
- [x] T4.1 P2 `aura3d-materials-environments`.
- [x] T4.2 P3 `aura3d-game-art`.
- [x] T4.3 P4 `aura3d-retexture`.

Phase 5:
- [x] T5.1 L1 `aura3d-performance`.

Every phase:
- [x] T6.1 `docs/agents/README.md` and `prompt-to-3d-workflow.md` skill routing updates.
- [x] T6.2 One worked example log per skill (commands run, validator output, evidence references) under `docs/agents/skills-examples/`.
- [x] T6.3 Unit tests for writer, sync, and gate; `check:skills`, `check:agent-docs`, `check:templates`, CLI typecheck/build pass.

Success measures: an agent dropped into a fresh `create-aura3d` project with only skills installed completes the template's golden path (`build`, `test`, `assets validate`, `check-deploy`) with correct claim labels and no forbidden patterns. This is measured on at least three templates by a neutral reviewer, per the benchmark rules in `verification.md`.

## 10. Risks and follow-ups

- Skill rot: the CLI and APIs change. Mitigation: the `check:skills` command and API verification, pinned versions (`@aura3d/cli`, `@meshy-ai/cli@0.2.0`, `@meshy-ai/meshy-mcp-server@0.5.1`), and "read `--help` first" as step one in every skill.
- Duplication drift between skills and `docs/agents`: skills hold the procedure, docs hold the policy, and skills link to docs instead of restating them. `boundaries.md` is the only shared restatement, and the gate diffs its forbidden-pattern list against `llms.txt`.
- Claim leakage from generated assets: `import-meshy` stays candidate-only, C4 owns the label decision, and P2, P3, and P4 default to `prototype` without evidence.
- Downstream write safety: `init` and `create-aura3d` never overwrite user-modified agent files.
- Library follow-ups found during review (outside this PRD's scope, filed separately): a texture and HDRI adapter for `@aura3d/asset-index` (Poly Haven has both), which would make P2 catalog-first; and `create-aura3d` shipping `llms.txt` even when agent files are declined.

## 11. Open questions (resolved 2026-09-25, T0.1)

1. Default `init` behavior: resolved `--skills core` (core set plus template-specific skills when `--template` is given). `all` and `none` remain available.
2. `create-aura3d` CLI writes agent files by default (`--agent all --skills core`); `--no-agent` opts out. The `createA3DProject` library API stays opt-in (no `agent` option means no agent files), so existing programmatic callers are unaffected.
3. C4 references the template `screenshot.spec.ts` thresholds and does not own its own values.
4. The texture and HDRI catalog adapter is not a prerequisite. P2 ships built-ins-first with `assets add --type texture|environment`; the adapter stays a library follow-up (section 10).
5. Aura Clash guidance stays in `docs/agents/game-showcase-build.md`; D1 links to it.

Findings recorded during implementation (library follow-ups, outside this PRD):
- `assets search` returned HTTP 404 from the hosted asset index on 2026-09-25 and fell back to marketplace links; `aura3d-assets` treats this as `blocked`.
- `check-deploy --dist dist` returned ok when no `dist/` existed; `aura3d-evidence-review` runs it only after a real build and never counts it as visual evidence.
- The `product-viewer` template fixture fails `assets validate --release` (no provenance) and carries stale manifest bounds.

- `assets validate-game` crashes with `asset.warnings is not iterable` in `racing-starter` and `mini-game`; `certify-game-geometry` rejects the racing starter `trackModel` (`racing-road-mesh-not-found`).
- `compilePromptPlan` reports a bloom visual system even when the plan requests no effects.
- `llms.txt` shows `animation.onEvent(...)`, but `onEvent` is a controller method, not a member of the exported `animation` namespace. The benchmark recipes import a `scene-kits/particle-fountain` subpath that the engine package does not export.
- `effects.flipbook` records a validated grid but the renderer withholds it (no texture slot); P3 labels flipbook VFX `prototype`, so the Phase 4 flipbook proof cannot show rendered frames yet.
- `assets inspect` reports no vertex hash; P4 bundles `references/geometry-hash.mjs` for the geometry-untouched check. `model(asset, { material })` applies one flat tint, not map swaps.
- Animation Studio `render` resolves the repo root from its own path, so it only works inside the monorepo; exported video burns captions from the dialogue track with no caption-free master flag.
- `ThreeCompatibilityMatrix` marks `EffectComposer` partial while the import map declares it unsupported.

## 12. Appendix: command map

| Need | Command |
| --- | --- |
| Find a real object | `npx @aura3d/cli@latest assets search "battle-worn knight helmet" [--license cc0] [--max-tris 50000] [--json]` |
| Pull an auto-pullable candidate | `npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet` |
| Fighter | `… assets search "animated humanoid fighting character" --profile fighting-character --json`, then `… resolve … --name fighter --profile fighting-character`, then `… validate-game --profile fighting-character --asset fighter --no-placeholders --require-license` |
| Local model, texture, or HDRI | `… assets add ./assets/robot.glb --name robot [--role product]` / `… assets add ./hdri/night.hdr --name nightSky --type texture --license CC0-1.0 --source-page …` (HDRIs are texture-typed: `environments.hdri({ texture })` accepts only texture refs), then `… assets typegen` |
| Meshy candidate | `meshy make "…" --dry-run`, approval, `meshy make "…" --max-credits N -o artifacts/meshy/<asset>/`, then `… assets import-meshy artifacts/meshy/<asset>/ --name <n> --quality candidate --role … --profile … --rights-evidence …` |
| Inspect | `… assets inspect ./model.glb --animation --humanoid --skeleton --morphs --license` |
| Validate | `… assets validate --source --release` / `… validate-game …` / `… validate-animation --map … --require-rig` / `… validate-animation-studio --episode` |
| Character assembly | `… assets assemble-character --name hero --body heroBody --part hair=heroHair` |
| Racing and platformer geometry | `… assets certify-game-geometry --asset track --category racing`, then `… assets bind-game-route-evidence --route … --category racing --assets … --screenshot … --geometry-report … --composition-report … --visual-review …` |
| Animation Studio | `… animation scene new --prompt "…" --full`, then `cast add`, `set`, `block`, `camera`, `shot`, `dialogue`, `validate`, then `AURA_QUALITY=final … animation scene render` |
| Thumbnail | `… assets thumbnail` |
| Health and ship | `… doctor`, then `npm run build && npm run test`, then `… check-deploy --dist dist` |
| Agent setup | `… init --agent all [--skills core\|all\|none]` (the `--skills` flag is proposed in section 8.2) |

Render pattern for all skills: `import { assets } from "./aura-assets"` plus `model(assets.<key>)` / `sceneKits.productViewer(assets.<key>)` inside `createAuraApp("#app", …)`.

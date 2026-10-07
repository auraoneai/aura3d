# PRD 13: Agent Authoring, Skills, Templates, Quality Defaults

Status: draft for parallel execution. Branch base: `aura3d-quality-rebuild/audit`.
Research inputs: research/12 (agent-authoring autopsy), 06 (engine defaults), 13 (package architecture), 19
(claim verification, corrected statements only), 21 (authoritative game vision judgment), with 20/22/23 and
`_sections/D`, `_sections/E` for the bar. All line numbers were re-checked against the current checkout where
marked "(re-checked)". Everything else cites the research file that verified it.

This PRD owns what an agent reads, copies, and is graded on. It does not own renderer, lighting, post,
material, asset, animation, camera, VFX or world code. Those lanes supply capabilities through CONTRACTS.md
contracts and agent-facing facts through C-40 rows. This PRD makes the simplest authored code reach them, makes
agents look at their output, and measures what agents produce.

**Parallel-execution rule.** This lane starts on day 0 (2026-10-05) from the PR 0a branch and never waits for
another lane. Every capability owned elsewhere is consumed through a contract ID (C-NN) and built against that
contract's PR 0a/0b stub. Text that names another PRD ("PRD 10 biome", "PRD 03 post preset") is attribution of the
contract provider, never a precondition. The authoritative tables are "§13 Contracts consumed / provided" and
"§14 Parallel execution". Acceptance is split into Standalone (§18.1, gates merges) and Integrated (§18.2,
evaluated only at CONTRACTS §7 checkpoints, never blocks).

---

## 1. Problem statement

An agent following Aura3D's own instructions today produces the frame the owner describes as "Atari / early
Nintendo". That frame is not an accident of individual games. It is what the instructions, templates and
defaults converge on (research/12 §0, §9):

1. **The authoring path is a compliance system with no art system.** Skill text spends about 6x more lines on
   evidence and claims than on visual craft: 354 evidence-only lines against 58 craft-only lines across the 13
   skills and `boundaries.md`. The game path (browser-game skill, game guide, game standards) is 84:4. The
   `aura3d-browser-game` skill has 0 craft lines (research/12 §1.2).
2. **The copied code is the 2012 three.js recipe, and it is worse on this engine.** The recipe is
   `lights.studio()` or `lights.ambient` + `lights.directional`, a near-black solid clear colour, primitive boxes,
   no environment, no fog, no explicit shadow, no grade, `safe-basic` at DPR 1. On this engine `lights.ambient`
   with no `environments.*` node zeroes IBL diffuse and specular. That hits **15 of 18 games** (research/19 C1
   corrected; `_sections/B` engine-defect key). The engine's own lint suggests adding `lights.ambient()`.
3. **The flagship platformer starter cannot render light.** `mini-game` and `product-viewer` run on
   `@aura3d/lean`. There, `lights.*` and `environments.*` are inert intents, no lights, environment, shadows or
   post are submitted, and placement has identity rotation (research/19 C7 corrected).
4. **The "smart" layer is hollow.** `compilePromptPlan` ignores `camera`, `lighting`, `effects`, `style` and
   `environment`. It then echoes `camera`, `lighting` and `effects` into `report.visualSystems` as if they had been
   applied (`style` and `environment` are silently ignored, research/19 C17 corrected). `material.visualQA`
   grades node names (research/12 §4.3).
5. **Agents are told not to look.** Benchmark mode forbids screenshots. The normal-mode critique loop is capped at
   3 "cheapest fix" rounds. `no-hackjob-rules.md:45-46` forbids iterative art direction. No quality bar,
   reference frame or look-dev procedure exists anywhere an agent reads (research/12 §5, §6).
6. **Nothing measures agent output.** The existing `benchmark/` packet (10 frozen workloads) feeds name-based
   visual-QA gates. No agent-authored frame has ever been judged against a rubric.

Outcome today: shipped games score 1.5–4/10 overall, median 3, no game at 5 (research/21). Category means for
the knobs this PRD controls through defaults and instructions: shadows 1.6, ibl_reflections 1.5,
atmospheric_effects 1.4, postprocessing 2.9, environment_world 2.7 (`_sections/B` §1). The renderer benchmark
(research/23) has Aura3D at mean 3.6 against three r185 at 5.4 on identical scenes. Even a perfect renderer would
still be fed the old recipe by the authoring path.

**Goal.** A fresh agent with no repo knowledge, using only `create-aura3d`, the installed skills and the
recommended API, produces frames a panel scores at median ≥ 6.5 on 12 standard prompts (bar A1–A4,
`_sections/E`), with no renderer-knowledge escapes needed. Engineering gates in this PRD (lint, `check:skills`,
unit tests) are hygiene. They are never presented as quality.

---

## 2. Evidence from current code (path:line)

### 2.1 What the agent reads

| # | Location | Fact |
|---|---|---|
| E1 | `llms.txt:62-67` (re-checked) | Hello world is `scene().add(model(assets.robot)).add(lights.studio())`. It has no environment, output, shadow or quality setting. |
| E2 | `llms.txt:21` (re-checked) | The three.js mapping row is "`DirectionalLight` / `AmbientLight` / `PointLight` → `lights.*`" with no caveat. In three.js `AmbientLight` and `scene.environment` are additive. Here ambient disables IBL. |
| E3 | `llms.txt:36` (re-checked) | "Do not claim … HDR/IBL, postprocess … unless a browser test …". Agents read "don't claim" as "don't use" (research/12 §5 #10). |
| E4 | `llms.txt:161-167`; `docs/agents/build-playbook.md:148-151`; `aura3d-scene-authoring/SKILL.md:22-24` | Benchmark mode: "Do not run … browser screenshot capture, or manual visual verification inside the agent process". |
| E5 | `llms.txt:211` | "Treat glass, clearcoat, transmission, normal maps, reflections, and contact shadows as partial or unsupported unless retained root pixels prove those exact features." The capability catalog marks normal maps supported (`index.ts:2752`). |
| E6 | `llms.txt:290` | Tells agents to run `material.visualQA(nodes)` before accepting scenes. |
| E7 | `packages/aura3d-cli/skills/manifest.json` (re-checked) | `coreSet` = core, assets, evidence-review, scene-authoring. Every game template gets only `aura3d-browser-game` + `aura3d-game-art` (+ character-animation for fighting/controller). `aura3d-materials-environments`, the only look-capable skill, is installed for no game template. |
| E8 | `packages/aura3d-cli/skills/AUTHORING.md:15` (re-checked) | Required skill body sections: "Establish the contract", "Procedure", "Stop and report", "References". No section is about the look. Line 21 requires a benchmark-mode branch: "`npm install && npm run build` then stop". |
| E9 | `tools/agent-skills/check.ts:12, 100-132` (re-checked) | `check:skills` enforces a 150-line body, frontmatter, command/API existence, forbidden three.js imports, raw GLB URLs and links. It checks no craft content. |
| E10 | `aura3d-browser-game/SKILL.md:35-41, 69-75` | The code sample adds `lights.studio()` only. Genre gates are mechanics only. 103 lines: 28 evidence, 0 craft. |
| E11 | `aura3d-scene-authoring/SKILL.md:76-81` | "`visualSystems` names what the compiler added" (false, see E21). "Add only prompt-required customization." |
| E12 | `aura3d-evidence-review/SKILL.md:44-49, 53-56, 77-78, 89-91` | Run `visualQA` helpers before accepting. "Critique loop, at most 3 rounds … cheapest targeted fix". If browser evidence can't be captured, label it `prototype`. |
| E13 | `docs/agents/no-hackjob-rules.md:45-46` | "Do not swap GLBs or repaint primitives to make a route look different while the root cause remains unproven." |
| E14 | `docs/agents/build-playbook.md:141-147` | Recommends `character.lowPolyHumanoid({ clip: "walk" })` for humanoids. |
| E15 | `docs/agents/cinematic-scene-quality.md:9-19, 73-82` | The only craft doc (26 craft lines of 79). It has no API values, is scoped to cinematic, and is linked from neither the game skill nor the game guide. |
| E16 | `Aura3D-Skills-PRD.md:120-125, 137, 315` | A skill is built only when "the evidence is an existing rule doc, gate, or anti-pattern list" (this excludes art direction). Every skill must have "Stop and report". Success = "golden path … correct claim labels". |
| E17 | `packages/aura3d-cli/src/index.ts:3642-3668` (`genericAgentText`, written by the agent-file writer at `:1140-1142`; PRD 05-owned file) | The agent files (`AGENTS.md` / `.claude/CLAUDE.md`) say: "Read ./llms.txt first … Run npm run build and the template route-health/screenshot tests before claiming the scene is done." Nothing visual. |

### 2.2 What the engine does with the copied recipe

| # | Location | Fact |
|---|---|---|
| E18 | `packages/engine/src/agent-api/index.ts:12693-12707` (zeros at :12705) | Any `lights.ambient` with intensity > 0 and no environment node → preset `authored-ambient`, `environmentMapIntensity: 0`, `environmentMapSpecularIntensity: 0`, no HDRI upgrade. 15 of 18 games hit this (research/19 C1). |
| E19 | `index.ts:18256` (re-checked) | `"Scene has no lights. Suggested fix: add lights.studio() or lights.ambient()."` Following the second suggestion triggers E18. |
| E20 | `index.ts:4256, 4312, 11133, 12280` | Default profile `safe-basic`, `pixelRatio: 1`, which wins over `devicePixelRatio` (research/19 C2 confirmed). |
| E21 | `index.ts:10118-10141` (re-checked) | `compilePromptPlan` calls `promptRecipes[plan.sceneType](subject.asset, plan)` (:10120) and echoes `plan.camera?.preset`, `plan.lighting?.preset` and `plan.effects` into the report (:10128-10130). |
| E22 | `index.ts:10147-10250` | 4 recipes read only `plan.subject.label` and `plan.interaction` (research/19 C17). |
| E23 | `index.ts:10279-10289` (`visualSystemsForPromptPlan`, re-checked) | Emits `"<preset> camera"`, `"<preset> lighting"` and `"<effect> effect"` from the plan, not from the scene. |
| E24 | `index.ts:10291+` (`repairHintsForPromptPlan`, re-checked), `:10326+` (`promptPlanWarnings`) | Static strings per `sceneType`. They warn only when `style`/`environment` are empty. |
| E25 | `index.ts:10007-10011` (re-checked) | Plan type unions: 4 scene types; effects `rain fog bloom particles wet-reflection motion-trail hud`; 4 camera and 4 lighting presets. |
| E26 | `index.ts:10155-10229` | Recipes hard-code the primitive aesthetic. `cinematic-scene` fakes wet reflection with emissive boxes; `mini-game` builds the HUD from emissive 3D spheres and boxes on `#030711` with `ambient(0.16)`. All 4 recipes add ambient (research/12 §4.1). |
| E27 | `index.ts:2721, 2959-3010` (re-checked) | `material.visualQA` → `validateMaterialVisualQA` decides "chrome reflects environment" by substring-matching node names. Siblings: `:8409, 8424, 9018, 9254, 9366, 9452`. |
| E28 | `index.ts:12966-12968` | Root shadow strength 0.32 / 0.24 / 0.38 against three's 1.0 (research/19 C11 confirmed). |
| E29 | `index.ts:3072` (re-checked) | `lights.directional({ shadow?: boolean })` exists. `shadow: true` appears 0 times in authoring text (research/12 §2.3). |
| E30 | `index.ts:4180` (re-checked); `fixtures/environment-corpus/hdri/{studio_small_08_1k,autumn_field_puresky_1k,kloppenheim_06_puresky_1k}.hdr` | `environments.hdri({ texture })` exists, and three CC0 HDRIs are in the repo. 0 templates and 0 games use it (research/12 §1.3). |

### 2.3 What the agent copies (templates)

Published scaffold source is `packages/create-aura3d/templates/*`: 19 templates, listed in
`packages/create-aura3d/package.json:13-31` (re-checked). A second tree, root `templates/*`, has drifted:
`templates/mini-game/src/main.ts` differs from the create-aura3d copy (re-checked with `diff -rq`).

| # | Template / location | Fact |
|---|---|---|
| E31 | `mini-game/src/main.ts:11` (re-checked), `:172` | Imports `@aura3d/lean/game`. `background("#071015")`. 6 flat-colour primitives. The hero GLB has 25 clips, but lean cannot animate or rotate it (`packages/lean/src/base.ts:521-523`). `cameraRig.follow` runs only inside `publishEvidence` (create-aura3d copy `:214`, research/12 §3.1). |
| E32 | `mini-game/tests/screenshot.spec.ts:24-66` | Passes if `brightPixels > 900`, `cyanPixels > 20`, `warmPixels > 10`, `redPixels > 5`. These thresholds encode the primitive palette. |
| E33 | `product-viewer/src/main.ts:10, 27` (re-checked) | `@aura3d/lean/product` + `environments.studio()`, a no-op in lean (`base.ts:252-259`). `:13-17` places PRD-adoption props. |
| E34 | `racing-starter/src/main.ts:215-216, 50-55, 220-255, 109-113, 43-48, 321-335, 217` | `ambient(0.38)` + `directional(1.1)` (IBL off). Primitive asphalt ribbons over the track GLB. A "PART C2 adoption" gantry. Diagnostics overlay on. `routeAlignedToVisibleTrack: true` hard-coded while `certify-game-geometry` returns `ok:false`. Top-down toy-table camera. |
| E35 | `falling-blocks-starter/src/main.ts:230-260, 249`; `character-controller/src/main.ts:44, 51-53, 60-61`; `fighting-game/src/main.ts:132-148` | Falling blocks: ambient + directional. Controller: a 320 px stage div and a `<pre>` HUD. Fighting: the best of the five, still with no env, shadow, fog or grade, and with the overlay on. |
| E36 | `three-compat-*` (8) | Primitive heroes (premium-product-viewer hero is a sphere, `main.ts:13`; `:14` is its only light, `lights.studio()`). No env. Weaker than the three.js examples they stand in for (research/12 §3.4). |
| E37 | `packages/create-aura3d/src` | 8,634 of 8,976 lines are `showcase-spec-*` proof compilers (research/12 §3.5). |

### 2.4 Outcome evidence (pixels)

- research/21 (vision, run 37289688772, macos-14 ANGLE Metal): every game 1.5–4/10. Recurring dominant causes are
  "black void background", "no IBL", "faint shadows", "primitive set dressing", "flat colour", "debug-like HUD".
  These are exactly the template recipe's properties.
- research/23: Aura3D 1–6.5 against three r185 4–7 on identical SceneSpecs. Only 2/18 scenes are within 0.5.
- Agent-authored showcases compensate with 1998-era tricks: blob-shadow spheres at opacity 0.5
  (`showcase-rooftop-buckets/src/main.ts:354, 582-586`, `showcase-skyline-runner/src/main.ts:1917-1918`,
  `showcase-turbo-drift-circuit/src/main.ts:3252-3284`). There are 41 fake-effect node names inside
  `agent-api/index.ts` (research/12 §4.4).

---

## 3. Root cause

| Cause | Bucket | Mechanism | Where it bites |
|---|---|---|---|
| RC1. Honesty-first product definition | G process | The skills PRD defines the problem as "agents violate rules" and success as "correct labels". A skill is built only where a gate exists, and no gate for beauty exists. | E16; 6:1 ratio |
| RC2. The copied code is the old recipe | E authoring | Hello world, skill samples, templates and prompt recipes all teach studio/ambient on a solid void. | E1, E10, E26, E31-E36 |
| RC3. Defaults punish the old recipe | B defaults (fixed by the C-05/C-09/C-11/C-27 providers) | Ambient kills IBL, shadows at 0.32, DPR 1. The agent cannot discover this because the docs never mention it. | E18-E20, E28 |
| RC4. The smart layer reports fiction | E authoring | Plan fields are ignored but reported. Repair hints are static. visualQA reads names. | E21-E27 |
| RC5. No visual feedback loop | G process | Agents are forbidden to look (benchmark), capped at 3 cheap rounds, and forbidden to iterate on looks. | E4, E12, E13 |
| RC6. Gates certify presence | G process | Template screenshot gates count palette pixels. visualQA counts names. Audits count grep hits. | E27, E32 |
| RC7. A starter on an inert runtime | F architecture (lean is PRD 15-owned; this PRD removes lean from its own templates) | The lean runtime drops lights and environments silently. | E31, E33 |
| RC8. No reference targets | G process | No art bible, reference frame, rubric or genre recipe exists anywhere an agent reads (research/12 §6). | — |

RC3's engine defaults belong to other lanes' contracts. RC7 is removed here for templates (no template imports
`@aura3d/lean`), while `packages/lean` itself stays PRD 15's. This PRD removes RC1, RC2, RC4, RC5, RC6 and RC8 from
the authoring path, and makes sure RC3 fixes reach authored code (looks v1 picks them up automatically when the
provider slot is real and its flag is on) instead of being bypassed.

---

## 4. Affected packages

| Package | Change in this PRD |
|---|---|
| `@aura3d/engine` (`packages/engine`) | New `looks` namespace (composition only), new `lookLint` diagnostics, `compilePromptPlan` v2 (honour-or-reject), rewritten `promptRecipes`, `visualQA` → `structuralQA` deprecation, no-lights lint text. All in PRD 13-owned modules (`agent-api/{looks,prompt}/`, `agent-api/nodes/prompt/`, the PR 0b-1 carve-outs) and exported through the lane barrel `src/lanes/prd13.ts`. No renderer code. No edit to `agent-api/index.ts` outside PR 0. |
| `@aura3d/cli` (`packages/aura3d-cli`) | Skills (canonical source), `manifest.json`, `AUTHORING.md`, `llms.txt` mirror; new commands `aura3d look capture` / `judge` / `rubric` / `lint` registered through C-39 from `src/commands/prd13/index.ts` with implementations in `src/look/`. `cli.ts`, `cli-help.ts` and `index.ts` (PRD 05-owned) are not edited; `aura3d init` text and the `look lint` alias are requests (§14). |
| `create-aura3d` (`packages/create-aura3d`) | All 19 templates move to the quality floor. New `arena-shooter` template (consumed by PRD 14 Orbital Defense through P-13-templates). Skills mirror. Template tests. Root `templates/` and `examples/` (also PRD 13-owned) become generated mirrors or are deleted. |
| Repo docs | `llms.txt`, `docs/agents/*`, `docs/guides/*`. |
| Tools | `tools/agent-skills` (craft-ratio gate, section gate), `tools/agent-templates` (look-floor gate), new `tools/agent-eval`, `tools/agent-dogfood` (report schema change). |
| Benchmarks | New `benchmarks/agent-eval/`. Existing `benchmark/` is read-only and its visual-QA output stops being cited as quality. |
| Not touched | `packages/rendering`, `packages/lean`, shaders, `packages/materials`, `packages/environments`, asset CLI internals, `tools/quality-gate`, `tools/quality-rebuild-capture`, `benchmarks/quality-rebuild`. |

---

## 5. Affected files and directories

Owned (written) by this PRD. This list equals CONTRACTS §4.1 row **13** plus the lane-generic row; §14 repeats it.
- `llms.txt` (root, canonical) and its generated mirror `packages/aura3d-cli/skills/llms.txt` (via `pnpm skills:sync`).
- `packages/aura3d-cli/skills/**`: all 13 skill directories, the new `aura3d-art-direction/`, `manifest.json` and
  `AUTHORING.md`. Mirrors `packages/create-aura3d/skills/**`, `.claude/skills`, `.cursor/skills`, `.agents/skills`
  and `.github/skills` are regenerated, never hand-edited.
- `packages/aura3d-cli/src/look/{capture,judge,rubric,lint-static}.ts` (new) and the lane command directory
  `packages/aura3d-cli/src/commands/prd13/` (C-39 registration, PR 0a creates `index.ts` empty).
- `packages/create-aura3d/**` (all: `templates/**` incl. `three-compat-*`, `character-hero`, `arena-shooter`,
  `*/aura.assets.json`; `skills/**`; `src/` incl. `CREATE_AURA3D_TEMPLATES`; `package.json`). Root `templates/` and
  `examples/`.
- Engine modules (CONTRACTS §3.2 carve targets plus new files):
  - `packages/engine/src/agent-api/looks/`: new `{looks.ts,lookPresets.ts,lookLint.ts,lookNodeHandler.ts,fakeEffectNames.ts,index.ts}`;
    carve-in `generatedCodeWarnings.ts` (PR 0b-1 moves `collectGeneratedCodeWarnings`, `index.ts:18253-18293`, R8);
    carve-in `structuralQA.ts` (PR 0b-1 moves `validateMaterialVisualQA` `:2959` and the sibling validators behind
    `visualQA` at `:2721, 8409, 8424, 9018, 9254, 9366, 9452`).
  - `packages/engine/src/agent-api/nodes/prompt/`: carve-in `{promptPlan.ts,promptRecipes.ts}` (PR 0b-1 moves
    `definePromptPlan` `:10103` through `promptPlanWarnings`, ending `:10363`, R7) and new `promptPlanMappings.ts`.
  - `packages/engine/src/agent-api/prompt/`: reserved, PRD 13-owned; used only if a future split needs it.
  - Lane barrel `packages/engine/src/lanes/prd13.ts` (exports `looks`, `lookLint`, `structuralQA`, prompt v2 types,
    and `slot.provide()` calls).
- `docs/agents/**` (incl. new `docs/agents/art-direction.md`) and `docs/guides/**`.
- `tools/agent-*/**`: `tools/agent-skills/{check.ts,shared.ts,craft-ratio.ts}`, `tools/agent-templates/{index.ts,look-floor.ts,capture-templates.mjs,sync-root-templates.mjs}`,
  new `tools/agent-eval/**`, `tools/agent-dogfood/index.ts` (`:145` reads `visualSystems`), `tools/agent-docs/**`.
- New `benchmarks/agent-eval/{prompts.json,README.md,rubric-agent.md,baseline/}`; new
  `.github/workflows/agent-output-eval.yml`; new `.github/workflows/template-lookdev.yml`.
- Lane-generic: this file, `docs/project/aura3d-quality-rebuild/evidence/{prd13,prd-13}/`, `packages/*/src/lanes/prd13.ts`,
  `agent-api/compiler/diagnosticOnly.prd13.ts`, `.github/workflows/qr-prd13-*.yml`, `tests/qr/prd13/`,
  `tests/unit/contracts/impl/prd13-*`.
- Tests created by this lane (CONTRACTS §4.1 creator rule): `tests/unit/agent-api/{looks,look-lint,prompt-plan-v2,structural-qa}.test.ts`;
  `tests/unit/create-aura3d/templates.test.ts` (existing; first import is `create-aura3d`, so owner 13) and new
  `look-floor.test.ts`; `tests/unit/tools/{craft-ratio,agent-skills-check,agent-eval-prompts}.test.ts`;
  `tests/unit/cli/{look-capture,look-judge,look-lint}.test.ts`; `tests/browser/{template-look-floor,looks-expansion,prompt-plan-render}.spec.ts`;
  each template's `tests/*.spec.ts`.

Read-only (consumed, not edited): `packages/engine/src/agent-api/index.ts` (owner 15) and every other lane's
module, `packages/lean/**`, `packages/rendering/**`, `packages/aura3d-cli/src/{cli,cli-help,index,asset-manifest}.ts`
(owner 05), `tools/quality-gate/**` and `tools/quality-rebuild-capture/**` (12), `benchmarks/quality-rebuild/**`
(12), `tools/bundle-size/**` (11), `tools/release/**` and `fixtures/**` (15), root `package.json` (15).

Root `templates/*` (the drifted second tree) is PRD 13-owned (CONTRACTS §3.8, §4.1). T3.14 replaces it with a
generated mirror of `packages/create-aura3d/templates` (`tools/agent-templates/sync-root-templates.mjs --check` in
`check:templates`), or deletes it if `rg -l "templates/" tools scripts .github` finds no consumer.

---

## 6. Architecture proposal

Seven parts. Each part names the contract (C-NN) it composes and the stub behaviour it runs on today. None of them
adds rendering behaviour.

### 6.1 Scene looks: one line that reaches the quality floor

`looks` is an authoring-level composition layer (contract C-34, provided here). A look is plain data that expands
into nodes and options other lanes own. It defines **no lighting values of its own** for any id that C-26 already
defines as an `AuraBiomeRig`.

```
looks.preset("outdoor-day")
  ├─ v1 expansion: emits one AuraLookNode { kind: "look" }, compiled by PRD 13's C-36 NodeHandler
  │    world biome rig "outdoor-day"               C-26 (sky, IBL source, sun+CSM, fog, post spec)
  │    output: { preset: "daylight-outdoor" }      C-05 / C-13 (only if the biome rig has no post spec)
  │    quality: "auto"                             C-27 (DPR from tier, never safe-basic)
  │    framing hint → camera rig defaults          C-22 (subjectHeightFraction)
  └─ v0 expansion (today's engine, standalone): emits one AuraGroupNode "aura-look:<id>" whose children are
       environments.hdri({ texture: autumn_field_puresky_1k })   E30
       lights.directional({ shadow: true, intensity, position })  E29
       effects.colorGrade / ambientOcclusion / bloom (tuned)      research/12 §1.3
       background: env-matched gradient colour + fog colour = horizon
     plus looks.appOptions(id) → { renderer: { qualityProfile: "production" }, pixelRatio: min(dpr, 2) }
       (AuraCreateAppRendererOptions.qualityProfile index.ts:1784; AuraCreateAppOptions.pixelRatio :10798)
```

Why a group in v0: groups are flattened before the legacy compiler reads nodes (`flattenSceneNodes`,
`index.ts:17956-17965`), so environment, light and effect children reach `createProductionRuntimeEnvironment`
(`index.ts:12628`, called at `:13613`) with no seam and no edit to any other lane's file. T1.2 has a unit test
that proves the flattening reaches the environment path. If it does not, the fallback is
`scene().add(...looks.nodes(id))`, which returns the same children as a flat array.

Rules:
- **Look ids.** Biome ids are the C-26 `AuraBiomeId` union, passed through unchanged: `outdoor-day`,
  `golden-hour`, `overcast`, `night-city`, `polar-night`, `alpine-snow`, `interior-warm`, `interior-neutral`,
  `interior-industrial`, `space`, `underwater`. This PRD adds only the C-34 `AuraStudioLookId` looks that no biome
  covers:
  - `product-studio`: C-09 `environments.preset("studio")`, key directional with shadow, ground contact
    shadow/AO, C-13 `postPresets["product-studio"]`, neutral gradient background.
  - `character-showcase`: studio env, key + rim spot, `arena-fight` post at lower contrast.
  - `arena-fight`: `interior-industrial` biome + C-13 `arena-fight` post.
  - `neon-arcade`: `night-city` biome with fog density × 0.5 + `neon-night` post.
- **Expansion selection** is per required contract and is evaluated at mount. A contract counts as available only
  when its slot is `provided` **and** `flags.on(slot.flag)` (CONTRACTS §1.1 `ContractSlot.get`). Checking
  `typeof world.biome === "function"` is wrong because PR 0a pre-declares every member. A look uses v1 only when every
  contract it needs is available. Otherwise it uses v0, and `diagnostics().look.missingContracts` lists the
  missing ones. `A3D_QR_LOOKS_EXPANSION=v0|v1|auto` (alias `A3D_LOOK_EXPANSION`) forces the choice for tests.
- **Default look.** When the scene has no light, no environment, no biome and no look, this PRD does **not** pick
  one in the renderer. The C-26 scene-category default biome and C-09 `neutral(tier)` do that. `looks` only exposes
  `looks.resolveDefault(snapshot)` so lint and reports can name what was applied.
- **Overrides** are typed and bounded (C-34 `AuraLookOverrides`): sun azimuth/elevation, exposure EV, fog density, a
  palette accent. Anything else requires dropping the look and authoring nodes directly. This keeps looks
  inspectable.
- **Tier-awareness** comes from C-27. A look never sets cascades, AO resolution or DPR in v1. It declares intent,
  and the tier decides cost.

### 6.2 Look lint: the engine tells the agent what is wrong with the frame

`lookLint(snapshot, context)` is the C-34 host. It runs inside `app.diagnostics()` through two PRD 13-owned paths
that need no edit to another lane's file: (1) the carved `looks/generatedCodeWarnings.ts`, whose call site at
`index.ts:11324` already pushes into `diagnosticsState.warnings`; (2) the C-31 section
`registerDiagnosticsSection({ key: "look", owner: "prd13", ... })`, which carries the structured findings. It also
runs statically in `aura3d look lint` (AST over `src/**`; C-39 command). Each rule has a stable code, a one-line fix
that names an API, and a severity. The runtime input is C-31 `AppliedLookReport` (`environment.specularIntensity`,
`shadows`, `pixelRatio`, `environment.background`, `renderPath`, `fallbackLightsActive`). Its PR 0a stub is assembled
from existing diagnostics fields (`index.ts:1755-1798`), so every rule runs on day 0.

Under `A3D_QR_LOOKS` off, the only rule whose output reaches `warnings` is `look/no-lights`, with the legacy text
"Scene has no lights. Suggested fix: add lights.studio() or lights.ambient()." byte-identical (C-34 conformance).
With the flag on, all rules run and the new texts below apply.

| Code | Trigger | Fix text (exact) |
|---|---|---|
| `look/no-lights` | replaces `index.ts:18256` | "Scene has no authored lighting. Add `looks.preset(\"outdoor-day\")` (or another look) or `environments.preset(...)` plus `lights.directional({ shadow: true })`." |
| `look/ambient-kills-ibl` | ambient > 0 and no env node, **only while** `capabilities.ambientAdditive` is false (true only when the C-09 slot is real and `A3D_QR_LIGHTING` is on) | "`lights.ambient` disables environment reflections in this engine version. Remove it and add a look or `environments.*`." |
| `look/ambient-flattens` | ambient intensity > 1 with an env present. Registered by PRD 02 through `registerLookLintRule` (R8). Until registered, PRD 13 hosts a default rule with the same code: defaults are installed lazily at the first `lookLint` call, and only for codes no lane has registered, so the C-34 duplicate-code throw never fires | "Ambient above 1 flattens IBL; use `lights.hemisphere` or lower it." |
| `look/no-ibl` | `appliedLook.environment.specularIntensity === 0` | "No image-based lighting reached the frame." |
| `look/weak-shadow` | key light exists and shadow strength < 0.8, or no caster | "Key light has no full-strength shadow; set `shadow: true` or use a look." |
| `look/low-dpr` | `pixelRatio < min(devicePixelRatio, tierCap) - 0.01` | "Rendering below device resolution; remove `pixelRatio`/`qualityProfile` overrides." |
| `look/solid-void` | background is a solid colour with luma < 0.06 and no fog, unless the look is `space`/`interior-*` | "Background is a flat void; use a look with sky/HDRI background or add fog matched to the background." |
| `look/primitive-subject` | > 60% of visible draw items are primitives with untextured flat materials, or the subject node is a primitive | "Scene is mostly flat primitives; resolve real assets with `assets resolve` and keep primitives for set dressing." |
| `look/flat-palette` | ≥ 3 primitives with fully saturated primary hex colours (S > 0.85, V > 0.8) | "Pure primary colours read as placeholder art; pick from the look palette." |
| `look/double-aa` | FXAA requested on top of MSAA | "FXAA on MSAA softens twice; use `output` preset AA." |
| `look/debug-overlay` | `diagnostics.overlay: true` in a production build | "Diagnostics overlay is on in a shipped build." |
| `look/fake-effect-names` | node names matching the 41 fake-effect names (`"contact shadow"` primitives, `"reflection card"`, `"glow halo"`, `"wet reflection"`). PRD 07 may register a refined rule under this code (C-34 consumer list); PRD 13's default is used until then | "This node imitates an engine feature; use the real feature." |
| `look/evidence-only-feel` | camera/feel output never reaches pixels. Rule body registered by PRD 08 via `registerLookLintRule` (runtime) and `registerDoctorRule` (static, C-39). Until registered, the code is reserved and emits nothing | the registering lane's text |
| `look/capture-branch` | `?capture=` / `?review` reads in route source. Static rule registered by PRD 09 via `registerDoctorRule`; PRD 13 ships a default static implementation in `look/lint-static.ts` under the same code until then | "Capture mode may change camera, clock, seed and scenario only." |

Lint is advisory at runtime (warnings). It is **blocking** only in this PRD's template gate and in the agent-eval
A3 check. Lint never produces a quality claim.

### 6.3 Prompt plan v2: honour or reject

`compilePromptPlan` keeps its signature and gains `options`. It lives in the PRD 13-owned carve-out
`agent-api/nodes/prompt/promptPlan.ts` (CONTRACTS §3.2, R7). With `A3D_QR_LOOKS` off it is byte-identical to today
(1.0 report). With the flag on, every plan field is either applied to the scene or rejected, and
`report.visualSystems` is computed from the **compiled scene**, never from the plan. The prompt types at
`index.ts:10007-10102` stay in `index.ts` (owner 15). The v2 additions are declared as extending interfaces in PRD
13's module (§7.3), so no edit to `index.ts` is needed.

- `camera.preset` → a C-22 rig, or a tuned `camera.perspective`/`camera.dolly` when the C-22 slot is a stub (the
  C-22 stub returns a static rig at subject bounds for unimplemented factories): `product-orbit` → orbit rig,
  autoframe 45–70% subject height; `cinematic-dolly` → rail dolly; `game-board` → topDown 55°;
  `material-inspection` → orbit, close.
- `lighting.preset` → a look id: `studio-softbox` → `product-studio`; `neon-practicals` → `neon-arcade`;
  `game-readable` → `outdoor-day`; `material-studio` → `product-studio` with a rotating env.
- `environment` (free string) → a look id through a keyword table (`promptPlanMappings.ts`): "forest|meadow|park" →
  `outdoor-day`; "sunset|dusk|golden" → `golden-hour`; "night|neon|city" → `night-city`; "space|orbit|planet" →
  `space`; "underwater|ocean floor" → `underwater`; "room|interior|cabin|gallery" → `interior-warm`;
  "studio|product|turntable" → `product-studio`; "snow|alpine" → `alpine-snow`; "overcast|rain" → `overcast`.
  No match → `AuraPromptPlanError("unmapped-environment")` in strict mode, or a warning plus the scene-type default
  look in lenient mode. The chosen look id is reported.
- `style` (free string) → post grade and palette accent only: "noir" → desaturate 0.3 + contrast 1.15;
  "pastel" → saturation 0.85, lift +0.02; "vibrant|toy|cartoon" → saturation 1.1; "realistic|photo" → neutral;
  "retro|synthwave" → `neon-night` post. Unmapped → reject or warn, as above.
- `effects[]`: `bloom` → post bloom on; `fog` → the look's fog on (density × 1.5 if already on); `rain` and
  `particles` → C-20 `app.effects` emitters, accepted **only when** C-20 `diagnostics().effects.pixelBacked` lists
  the kind **and** that node's `sim` is not `"primitive-pool"`. The C-20 stub reports primitive-pool bursts as
  pixel-backed, and those are exactly the fake-sphere pattern this PRD removes. Otherwise reject with
  `unsupported-effect:rain` (strict) or omit it and warn (lenient). It is never listed in `visualSystems`.
  `wet-reflection` → C-21 wetness + C-13 SSR when both are real, else rejected. Emissive boxes are never a substitute.
  `motion-trail` → C-20 `trail` under the same non-primitive rule, else rejected. `hud` → rejected with "HUDs are
  DOM; use the `@aura3d/game` Hud (C-24)".
- `visualSystems` lists only systems present in the compiled snapshot: look id, env source, shadow caster count,
  post passes, effect nodes whose emitters exist. A4 (bar) checks this against `AppliedLookReport`.
- `repairHints` are computed from `lookLint` on the compiled snapshot plus unmet acceptance criteria. They are never
  static.
- Recipes are rewritten without ambient, primitive HUDs, emissive "wet reflection" boxes or "rain splash" spheres.
  `mini-game` recipe: the subject model on a look-lit ground with typed set dressing; HUD left to DOM.

### 6.4 Templates at the new floor

Every template satisfies a machine-checked **Template Look Floor** (static + runtime, §7.5). The floor is the
`_sections/E` bar's input side: HDRI/biome environment, a full-strength shadow-casting key light, tone-mapped
output preset, DPR from tier, a non-void background (or a declared exception), typed real assets as subject,
rigged animated characters where a character exists, a camera rig that reaches pixels, a full-bleed canvas, a DOM
HUD, no diagnostics overlay, no constant evidence, no adoption props, no capture branches, and no `@aura3d/lean`.

| Template | Look | Camera (C-22) | Assets (C-17 / C-19) | Notes |
|---|---|---|---|---|
| `mini-game` (platformer) | `outdoor-day` | `follow2d`/chase, subject 18–25% height | Kenney Oobi hero (25 clips: idle/run/jump/fall/land played, faces travel), textured platform kit, coin/flag models | `createGame` (C-24); coins emissive 3–5 with bloom |
| `racing-starter` | `golden-hour` | `chase`, fov 60→72 by speed | Track GLB only (delete ribbons), real car scale | Delete gantry (`:227-255`), constants (`:43-48, 321-335`), overlay (`:109-113`) |
| `falling-blocks-starter` | `neon-arcade` | static, 3/4 view | Instanced bevelled block mesh, PBR glossy | Board frame model; line clear via C-20 `burst` (model-based flash while the C-20 stub is primitive-pool) |
| `fighting-game` | `arena-fight` | `fighting` rig | 2 rigged fighters with clips playing (C-19) | Overlay off (`:146-148`) |
| `character-controller` | `outdoor-day` | `shoulder` | Rigged character with locomotion blend | Full-bleed (delete 320 px stage `:51-53`, `<pre>` HUD `:44`) |
| `arena-shooter` (new) | `space` | `topDown` 60° | Ship + drone models, planet backdrop | P-13-templates; PRD 14 Orbital Defense may regenerate from it |
| `product-viewer` | `product-studio` | orbit autoframe | Typed PBR GLB | Delete adoption props (`:13-17`) |
| `cinematic-scene` | from plan (v2) | from plan | from plan | Uses prompt plan v2 strict |
| `three-compat-premium-product-viewer` | `product-studio` | orbit | Khronos sample GLB (not a sphere, `main.ts:13`) | Mirrors `webgl_materials_physical_clearcoat` |
| `three-compat-architecture-interior` | `interior-warm` | orbit | Textured room kit | Mirrors `webgl_lights_rectarealight` |
| `three-compat-postprocess-scene` | `neon-arcade` | orbit | Emissive models | Mirrors `webgl_postprocessing_unreal_bloom` |
| `three-compat-material-authoring` | `product-studio` | orbit | Material sphere grid (64×32 tessellation via C-07 primitive options) + one GLB | — |
| `three-compat-large-scene` | `outdoor-day` | orbit high | Instanced props | — |
| `three-compat-character-viewer` | `character-showcase` | orbit | Rigged GLB | — |
| `three-compat-asset-inspector` | `product-studio` | orbit | Typed GLB | — |
| `three-compat-custom-threejs-migration` | `outdoor-day` | orbit | Typed GLB | — |
| `animation-channel`, `prompt-animation-channel`, `animation-studio`, `episode-builder` | stage look `character-showcase` / `interior-warm` | existing director | existing | Floor applies to stage setup only; episode tooling out of scope |

The five game templates plus `arena-shooter` are built on C-24 `createGame` from `@aura3d/game` **from day 0**. The
C-24 PR 0a stub wraps `createGameApp` (`index.ts:11818`) on the engine path and supplies DOM shell, Hud and touch
(`game.touchControls`, `index.ts:8250`), so the templates never wait for PRD 09 and never import lean. When PRD 09's
real `createGame` is provided and `A3D_QR_GAME` reaches `standalone-accepted`, the templates add `"game"` to
`qualityRebuild.flags` (CONTRACTS §5.4). That is a one-line change in PRD 13-owned files. Camera: templates call
`app.camera.use(rig)` (C-22). Because the C-22 stub returns a static rig for unimplemented factories, day-0 templates
build their follow rig with `camera.rigs.fromSpec` (real in the stub) plus a per-frame `app.camera.setPose`, and
swap to `camera.rigs.chase|follow2d|fighting|shoulder|topDown` once a verified C-40 row from PRD 08 exists.

### 6.5 Craft-first skills and the look-dev loop

**New skill `aura3d-art-direction`**, installed for every template (added to `coreSet`). The body is ≤ 150 lines
(`check.ts:12`). References:
- `references/look-recipes.md`: one table per genre (platformer, racing, fighting, arena shooter, sports/table,
  product, character, outdoor environment, interior, night city, space, underwater, cinematic). Each row gives
  look id, camera rig + fov + subject frame %, key direction/elevation, palette (3 base + 1 accent, no pure
  primaries), atmosphere, post preset, VFX list, asset list and the 3 reference frames.
- `references/quality-bar.md`: the agent rubric (12 categories drawn from the 27 in research/21, with anchors at
  2/5/7/9 written as observable descriptions), plus the hard checks (lint codes that must be clean).
- `references/reference-frames.md`: named three.js r185 examples (threejs.org/examples URLs) on day 0. The C-30 v2
  reference scenes and licensed premium-indie stills from `benchmarks/quality-rebuild/refs/` (PRD 12 keeps the
  licence records) are added when they exist on main. Each frame has a "what you should see" paragraph so text-only
  agents can use it, so the file is complete without any image.
- `references/failure-gallery.md`: research/21 failure patterns with the fix that removes each (void → sky; flat
  shading → IBL; floating → full shadow; primitive soup → typed assets; debug HUD → DOM HUD).

**Mandatory look-dev loop** (in art-direction, browser-game, scene-authoring, materials-environments,
character-animation and core):

```
1. Pick target: genre recipe row + 1-3 reference frames. Write a 3-line look brief (time of day, palette, mood).
2. Build with a look preset and typed assets. No renderer overrides.
3. Capture: `aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile`
4. Judge: open each PNG; fill `look-judgement.json` against references/quality-bar.md
   (`aura3d look judge --validate look-judgement.json`). Read `aura3d look lint` + diagnostics().look.
5. Change the single highest-leverage thing (lint first, then the lowest category). One change per round.
6. Repeat 3-5 until every category >= 7 or 6 rounds or 2 rounds with no gain. Record remaining gaps
   with their lint code / engine limitation; never paint over them with fake geometry.
```

- Capture runners: `--runner gh-actions` (default when `.github/workflows/aura3d-lookdev.yml` exists; the template
  ships it, macos-14) or `--runner local` (the downstream user's choice; this Mac's policy forbids it, so the
  repo's own runs use gh-actions). The command prints PNG paths and the `AppliedLookReport`.
- Judge: the default judge is the authoring agent itself viewing the PNGs. `aura3d look judge` validates the JSON
  schema and computes aggregates. It does not call a model. `--judge prism` is optional and calls C-32
  `judgeWithPrism` from the `tools/quality-gate` public entry (Kiro Prism). If that export is not on main yet, the
  flag exits 2 with `judge-unavailable` and the self-judgement stands. A self-judgement is never a pass for the bar.
  Only the C-32 G-PANEL round is.
- Benchmark mode keeps "finite commands" for runtime-limited harnesses, but now says: if the harness exposes
  `aura3d look capture`, run the loop. The agent-eval harness (§6.7) exposes it.

**Rewrites.**
- `aura3d-core`: new hello world with `looks.preset`, corrected three.js mapping, routing to art direction first.
- `aura3d-browser-game`: per-genre look rows and the loop; mechanics gates kept; evidence steps moved out to
  evidence-review.
- `aura3d-scene-authoring`: drop "Add only prompt-required customization", add "every scene gets a look"; v2
  report semantics.
- `aura3d-evidence-review`: the only home of claim labels. Visual critique rounds up to 6; "cheapest fix" →
  "highest-leverage fix"; `visualQA` removed from acceptance.
- `aura3d-materials-environments`: added to game templates; leads with looks/biomes.
- Others: one-line boundary link. Facts come only from `verified` C-40 rows (CONTRACTS Appendix B), never from
  another PRD's draft text.

**Ratio inversion.** Measured by `tools/agent-skills/craft-ratio.ts` using the research/12 §1.2 regexes, frozen
in the file. Targets: all skills combined craft-only ≥ evidence-only (today 58:354). Game path (browser-game,
art-direction, game guide, game standards) craft ≥ 2× evidence (today 4:84). `aura3d-art-direction` craft ≥ 3×
evidence. `llms.txt` craft ≥ evidence (today 12:70). Anti-gaming: in `look-recipes.md`, ≥ 80% of rows carry
numeric values (fov, elevation, density, EV) or API names, and the vision eval (§6.7) is the real check.

### 6.6 llms.txt rewrite

Target ≤ 260 lines (303 today), craft ≥ evidence lines. Section order:
1. What Aura3D is (5 lines).
2. Hello world **with a look**, and the one-line rule "every scene gets a look".
3. The quality floor: what the defaults give you, and the never list (`lights.ambient` as the only fill,
   solid void, `pixelRatio`/`qualityProfile` overrides, primitive heroes, emissive cards as fake reflections,
   CSS/DOM fake effects).
4. three.js → Aura3D mapping, corrected: `AmbientLight` → `lights.hemisphere` / look; `scene.environment` +
   PMREM → `environments.preset|hdri` / `world.biome`; `toneMapping`/exposure → `output`; `setPixelRatio` →
   `quality: "auto"`; `castShadow` → `shadow: true`; `EffectComposer` → `output.preset` + `effects.*`;
   `AnimationMixer` → `AnimationController`.
5. Genre recipes (12 rows, compressed from look-recipes.md).
6. The look-dev loop (8 lines).
7. Assets: catalog first (kept from `:24-31`, shortened).
8. Claims (kept, compressed to ≤ 25 lines). The rule becomes "Use every feature freely. Claim only what a judged
   capture shows." This rewrites `:36`, `:201` and `:211`. The `Release integrity rules:` block and its tokens stay
   byte-compatible with `check.ts:51-56`.

### 6.7 Agent output eval

`benchmarks/agent-eval/` implements bar A1–A4 (`_sections/E`).
- `prompts.json`: 12 prompts (§18.3) × 3 seeds = 36 runs per round.
- Sandbox: a fresh directory, packed tarballs of the release candidate (`node tools/release/publish-all.mjs
  --pack-only`, read-only use of a PRD 15 tool), `npm create aura3d@<tgz>`, skills copied from the packed
  `create-aura3d/skills/**` (PRD 13-owned), **no repo checkout**, network limited to the npm registry mirror, the
  asset catalog and the capture runner.
- Agent: Claude Code headless via Kiro Prism (policy §4, default-first LLM layer), model pinned per round.
  Wall-clock 45 min, look-dev loop available through the same `aura3d look capture` the user gets.
- Capture: C-33 harness (`pnpm quality:games --routes <ids> --flags <list>`; stub = today's `capture-games.mjs` with
  the PR 0b `--flags` passthrough) on macos-14 at the default URL only. Desktop 1920×1080 and mobile 390×844, shots
  opening/mid/action, bound to SHA + run ID + asset hashes. Each run is captured twice: `qr_flags=none` and
  `qr_flags=all`.
- Judge: C-32 G-PANEL (2 named humans + 1 vision model, median, calibration set), using the research/21 template
  cut to the categories that apply to the prompt type. Records are C-32 `GameJudgement`/`PanelRoundRecord`.
- Checks: A2 median ≥ 6.5, no prompt median < 5. A3 escape scan (`tools/agent-eval/escape-scan.ts`: AST search
  for `pixelRatio`, `qualityProfile`, shadow `strength`, raw GLSL/WGSL, `safe-basic`, `@aura3d/lean`,
  `?capture`). A4 report honesty (`visualSystems` ⊆ applied systems).
- Round 0 runs the 3.0.1 skills and templates to record the baseline. Expected ≈ 2–3, in line with research/21.

---

## 7. APIs to add, change, remove

### 7.1 `@aura3d/engine`: looks (new, `agent-api/looks/`)

```ts
// packages/engine/src/agent-api/looks/looks.ts   (PRD 13-owned; exported via packages/engine/src/lanes/prd13.ts)
// Types come only from PR 0a contract files, so this compiles on day 0 with every provider still a stub.
import type { AuraStudioLookId, AuraLookId, AuraLookOverrides, AuraLookNode, AuraLookDiagnostics } from "../../contracts/looks";   // C-34 (PRD 13 is provider)
import type { AuraBiomeId } from "../../contracts/world";        // C-26 (PRD 10)
import type { AuraPostPresetId } from "../../contracts/post";    // C-13 (PRD 03)
import type { QrFlags } from "../../contracts/flags";            // CONTRACTS §1.1
// AuraLookOverrides (C-34): sun azimuth/elevation; exposureEv clamped to [-2, +2]; fogDensityScale clamped to [0, 3];
// accent: palette accent used by recipe set-dressing and grade tint; background: "look" | AuraColor (explicit solid;
// lint look/solid-void still applies).

export interface AuraLookPreset {
  readonly id: AuraLookId;
  readonly category: "outdoor" | "interior" | "studio" | "night" | "space" | "underwater";
  readonly biome: AuraBiomeId | null;                 // non-null → v1 delegates entirely to the C-26 biome rig
  readonly post: AuraPostPresetId;                    // used only when the biome rig has no post spec
  readonly framing: { readonly subjectHeightFraction: readonly [number, number] };
  readonly palette: { readonly base: readonly [AuraColor, AuraColor, AuraColor]; readonly accent: AuraColor };
  readonly backgroundException: boolean;              // true for space/interior-*: solid dark bg allowed
  readonly v0: AuraLookV0Expansion;                   // current-engine expansion (see 7.1.1)
}

export interface AuraLookBuildOptions {
  /** Default "auto": v1 iff every required slot is provided and its flag is on in resolveQrFlags({ url, env }). */
  readonly expansion?: "v0" | "v1" | "auto";
  readonly flags?: QrFlags;                           // pass the app's flags when they are set in code
}

export declare const looks: {
  /** v0 → AuraGroupNode "aura-look:<id>" with today's env/light/effect children (no seam needed).
   *  v1 → AuraLookNode compiled by the PRD 13 C-36 NodeHandler (looks/lookNodeHandler.ts). */
  preset(id: AuraLookId, overrides?: AuraLookOverrides, options?: AuraLookBuildOptions): AuraNodeBuilder<AuraGroupNode | AuraLookNode>;
  nodes(id: AuraLookId, overrides?: AuraLookOverrides): readonly AuraNodeBuilder<AuraSceneNode>[];   // flat v0 children
  appOptions(id: AuraLookId): Pick<AuraCreateAppOptions, "pixelRatio" | "renderer">;               // v0 only; {} under v1
  list(): readonly AuraLookId[];
  describe(id: AuraLookId): AuraLookPreset;            // frozen; agents can print it
  resolveDefault(snapshot: AuraSceneSnapshot): { readonly id: AuraLookId | "engine-default"; readonly source: "authored" | "biome-default" | "neutral-env" | "none" };
};

// AuraSceneBuilder.look(id, overrides?) is named in C-34. AuraSceneBuilder lives in index.ts (:4779, owner 15).
// It is sugar for .add(looks.preset(id, overrides)). Request Q-15-1 (§14) asks PRD 15 to wire it. Until it lands,
// skills, templates and llms.txt use the canonical form .add(looks.preset(id)), which needs no other lane.

// Diagnostics: C-34 AuraLookDiagnostics, published as the C-31 section key "look":
//   registerDiagnosticsSection({ id: "prd13.look", key: "look", owner: "prd13", flag: "A3D_QR_LOOKS", collect })
// AuraLookDiagnostics = { id, expansion: "v1-contracts" | "v0-current-engine" | "none", missingContracts, lint }
```

v1/v0 choice at authoring time: `looks.preset` resolves flags from URL and env (CONTRACTS §5.2 sources 2-4) unless
`options.flags` is given. Templates pass the same list they give `createAuraApp({ qualityRebuild: { flags } })`.
If the app's resolved flags at mount disagree with the expansion that was built, lookLint emits the warning
`look/expansion-mismatch`, and `diagnostics().look.expansion` reports what actually compiled.

#### 7.1.1 v0 expansion (today's engine; standalone deliverable)

```ts
export interface AuraLookV0Expansion {
  readonly hdri: "studio_small_08_1k" | "autumn_field_puresky_1k" | "kloppenheim_06_puresky_1k" | null; // fixtures/environment-corpus/hdri
  readonly environmentIntensity: number;
  readonly key: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor; readonly shadow: true };
  readonly rim?: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor };
  readonly fog?: { readonly color: AuraColor; readonly near: number; readonly far: number };
  readonly background: AuraColor;                       // horizon-matched, never < luma 0.06 unless backgroundException
  readonly effects: readonly ("colorGrade" | "ambientOcclusion" | "bloom" | "antiAlias-msaa")[];
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
  readonly renderer: { readonly qualityProfile: "production"; readonly pixelRatio: "min-dpr-2" };
}
```

v0 never emits `lights.ambient`. The HDRI files are copied from `fixtures/environment-corpus/hdri/` (read-only
source) into each template's `public/` and admitted as typed texture assets in that template's `aura.assets.json`
with the existing CLI command `aura3d assets add --type texture` (C-17 1.0 writer; PRD 13 owns template manifests).
v0 renderer settings come from `looks.appOptions(id)`, so they live in the engine, not in authored code. A3 scans
authored code only.

### 7.2 `@aura3d/engine`: look lint (C-34; `agent-api/looks/lookLint.ts`)

```ts
// Types are the C-34 declarations in packages/engine/src/contracts/looks.ts (PR 0a). PRD 13 implements them.
// AuraLookLintCode (C-34 union) plus PRD 13-local codes used under the `look/${string}` escape:
//   "look/multiple-looks" | "look/expansion-mismatch"
export interface AuraLookLintFinding { readonly code: AuraLookLintCode | `look/${string}`; readonly severity: "error" | "warning"; readonly message: string; readonly nodes?: readonly string[]; }
export interface AuraLookLintContext {
  readonly appliedLook?: AppliedLookReport;           // C-31; PR 0a stub assembles it from existing diagnostics fields
  readonly devicePixelRatio: number;
  readonly tierCap: number;                           // C-27 QUALITY_TIERS[tier].pixelRatio cap (real data in PR 0a)
  readonly production: boolean;                       // import.meta.env.PROD in apps
  readonly capabilities: { readonly ambientAdditive: boolean; readonly effectsPixelBacked: readonly string[] };
  // ambientAdditive = C-09 slot provided && flags.on("A3D_QR_LIGHTING")
  // effectsPixelBacked = C-20 diagnostics().effects.pixelBacked minus nodes whose sim === "primitive-pool"
}
export function lookLint(snapshot: AuraSceneSnapshot, context: AuraLookLintContext): readonly AuraLookLintFinding[];
export function registerLookLintRule(rule: { readonly code: AuraLookLintCode | `look/${string}`; readonly owner: PrdId; run(s: AuraSceneSnapshot, c: AuraLookLintContext): readonly AuraLookLintFinding[] }): void;   // duplicate code throws (C-34)
```

With `A3D_QR_LOOKS` on, `app.diagnostics().warnings` includes `lookLint` messages (through the carved
`looks/generatedCodeWarnings.ts`) and `app.diagnostics().look` carries the structured findings (C-31 section). The
legacy `index.ts:18256` text is then replaced by `look/no-lights`. With the flag off, the legacy text is
byte-identical.

### 7.3 `@aura3d/engine`: prompt plan v2 (`agent-api/nodes/prompt/`)

```ts
// The 1.0 types (AuraPromptPlan, AuraPromptPlanReport, AuraCompiledPromptPlan) stay at index.ts:10007-10102
// (owner 15) unchanged. v2 extends them in PRD 13's module, so no CCR and no index.ts edit are needed.
export interface AuraPromptPlanV2 extends AuraPromptPlan {
  readonly look?: AuraLookId;                           // NEW: explicit look wins over environment/lighting mapping
}
/* AuraPromptPlan (unchanged) fields for reference:
  readonly sceneType: AuraPromptSceneType;
  readonly subject: AuraPromptPlanSubject;
  readonly style?: string;
  readonly environment?: string;
  readonly camera?: { readonly preset: AuraPromptCameraPreset; readonly note?: string };
  readonly lighting?: { readonly preset: AuraPromptLightingPreset; readonly note?: string };
  readonly effects?: readonly AuraPromptEffectId[];
  readonly interaction?: AuraPromptInteractionMode;
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria?: readonly string[];
*/

export interface AuraCompilePromptPlanOptions {
  /** "reject" throws AuraPromptPlanError on any field it cannot apply. Default "warn" in 3.x;
   *  A3D_QR_LOOKS_PROMPT_STRICT=1 (alias A3D_PROMPT_PLAN_STRICT) makes "reject" the default in CI. */
  readonly unsupported?: "reject" | "warn";
}

export type AuraPromptPlanErrorCode =
  | "unmapped-environment" | "unmapped-style" | "unsupported-effect" | "unsupported-camera" | "hud-is-dom";

export class AuraPromptPlanError extends Error {
  readonly code: AuraPromptPlanErrorCode;
  readonly field: "environment" | "style" | "effects" | "camera" | "lighting";
  readonly value: string;
}

// 1.0 AuraPromptPlanReport (index.ts:10083-10096) has schema literal "aura3d-prompt-plan-report/1.0", so v2 is a
// sibling type, not a subtype. All 1.0 fields are present with the same names.
export interface AuraPromptPlanReportV2 extends Omit<AuraPromptPlanReport, "schema"> {
  readonly schema: "aura3d-prompt-plan-report/2.0";
  readonly look: { readonly id: AuraLookId; readonly from: "plan.look" | "plan.environment" | "plan.lighting" | "sceneType-default"; readonly expansion: "v1-contracts" | "v0-current-engine" };
  readonly camera: { readonly preset: AuraPromptCameraPreset; readonly rig: string };          // rig actually built
  readonly appliedEffects: readonly AuraPromptEffectId[];       // present in the compiled snapshot
  readonly rejected: readonly { readonly field: string; readonly value: string; readonly code: AuraPromptPlanErrorCode }[];
  readonly styleGrade: { readonly contrast: number; readonly saturation: number; readonly lift: number } | null;
  // inherited, with v2 semantics: visualSystems = compiled-snapshot census; repairHints = lookLint(compiled snapshot);
  // effects === appliedEffects (no longer the request echo); cameraPreset/lightingPreset @deprecated, kept one minor
}
export interface AuraCompiledPromptPlanV2 { readonly scene: AuraSceneBuilder; readonly report: AuraPromptPlanReportV2; }

/** Signature unchanged for 1-arg callers. Flag off: byte-identical 1.0 behaviour. Flag on (A3D_QR_LOOKS): runs the v2
 *  pipeline and returns its report narrowed to the 1.0 shape (honest visualSystems/effects/repairHints, schema 1.0). */
export function compilePromptPlan(plan: AuraPromptPlan | AuraPromptPlanV2, options?: AuraCompilePromptPlanOptions): AuraCompiledPromptPlan;
/** New export. Always v2, independent of the flag (a new API changes no existing behaviour). */
export function compilePromptPlanV2(plan: AuraPromptPlanV2, options?: AuraCompilePromptPlanOptions): AuraCompiledPromptPlanV2;
export function promptPlanToScene(plan: AuraPromptPlan | AuraPromptPlanV2, options?: AuraCompilePromptPlanOptions): AuraSceneBuilder;
export const promptRecipes: Readonly<Record<AuraPromptSceneType, (asset: AuraAssetRef<"model">, plan: AuraPromptPlan, look?: AuraLookId) => AuraSceneBuilder>>;
```

`AuraPromptEffectId` (`index.ts:10008`) keeps `"hud"`. It always rejects or warns. Its removal in 4.0 is request
Q-15-3, because the type lives in PRD 15's file.

### 7.4 `@aura3d/engine`: visualQA deprecation (`agent-api/looks/structuralQA.ts`)

PR 0b-1 moves the validator implementations behind every `visualQA` property into `looks/structuralQA.ts`
(CONTRACTS §3.2 row "2721, 2959, 8409, …", owner 13). The namespace objects keep their property references:
`material` is in `nodes/material.ts` (owner 04), and `neon`, `charts`, `character`, `city`, `product`, `solar` stay in
`index.ts` (owner 15). PRD 13 therefore changes only the implementations, and adds a separate namespace:

```ts
// looks/structuralQA.ts (PRD 13). Exported from lanes/prd13.ts.
export const structuralQA: {
  material(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;   // same checks as material.visualQA, renamed keys
  neon(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
  charts(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
  character(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
  city(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
  product(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
  solar(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult;
};
export interface AuraStructuralQAResult { readonly kind: "structural-name-heuristic"; readonly ok: boolean; readonly checks: Readonly<Record<string, boolean>>; }
// The existing visualQA implementations (owned here after the carve) additionally return, unconditionally and additively:
//   { deprecated: true, kind: "structural-name-heuristic" }   (no existing key changes or disappears)
```

Result keys that claim pixels are renamed in `structuralQA`, for example `chromeReflectsEnvironment` →
`chromeReflectionNodesNamed`. The `visualQA` paths keep the old keys. The `@deprecated` JSDoc on the namespace
properties is in other lanes' files, so it is requested (Q-04-1 for `material`, Q-15-2 for the other six). Skills
and `llms.txt` stop recommending `visualQA` on day 0 anyway.

### 7.5 `create-aura3d` / tools: Template Look Floor (new)

```ts
// tools/agent-templates/look-floor.ts
export interface TemplateLookFloorSpec {
  readonly template: string;
  readonly look: AuraLookId | "plan";                     // §6.4 table
  readonly backgroundException: boolean;
  readonly characterExpected: boolean;                    // requires C-19 animationState() tracksApplied > 0 (report-only while C-19 is a stub)
  readonly maxPrimitiveShare: number;                     // default 0.4 of visible draw items
  readonly allowedLintWarnings: readonly AuraLookLintCode[]; // default [] ; errors never allowed
}
export interface TemplateLookFloorResult {
  readonly template: string;
  readonly static: { readonly leanImports: number; readonly ambientWithoutEnv: number; readonly rendererOverrides: number; readonly constantEvidence: number; readonly captureBranches: number; readonly overlayDefaultOn: boolean; readonly lookNodes: number };
  readonly runtime?: { readonly appliedLook: AppliedLookReport; readonly lint: readonly AuraLookLintFinding[]; readonly tracksApplied?: number; readonly canvasCoverage: number };
  readonly ok: boolean;
  readonly failures: readonly string[];
}
export function checkTemplateLookFloor(templateDir: string, spec: TemplateLookFloorSpec): Promise<TemplateLookFloorResult>;
```

### 7.6 `@aura3d/cli`: look commands (new, C-39)

All four commands are `AuraCliCommand`s registered with `registerCliCommand` from
`packages/aura3d-cli/src/commands/prd13/index.ts`. The implementations are in `packages/aura3d-cli/src/look/`. The PR
0b-3 fallthrough in `cli.ts` (owner 05) dispatches the unknown verb `look` to the registry, and help text is
generated from `summary`/`usage`. No PRD 05 file is edited. Before PR 0b-3 merges, the commands run in CI and tests
through `pnpm --filter @aura3d/cli exec tsx src/commands/prd13/run.ts look <sub>`, which is a PRD 13-owned entry.

```
aura3d look capture [--route /] [--shots opening,mid,action] [--viewports desktop,mobile]
                    [--runner gh-actions|local] [--out dist/lookdev/<n>] [--json]
  → writes PNGs + appliedLook.json + lint.json; exit 0 even when lint has errors (it reports)
aura3d look judge --validate <look-judgement.json> [--judge self|prism] [--json]
  → validates against LookJudgement schema; prints per-category scores, weakest category, next-change hint
aura3d look rubric [--genre platformer|racing|...] → prints the rubric + recipe row
aura3d look lint [--json] → static lookLint over src/** (AST) + every C-39 registerDoctorRule rule
                            (hosts PRD 08 feel/evidence-only, PRD 09 look/capture-branch when registered)
```

`aura3d doctor --look` is the name C-39 uses for the host. `doctor` is an existing PRD 05 verb, so it cannot fall
through to the registry. Request Q-05-2 asks PRD 05 to forward `doctor --look` to `look lint`. Skills document
`aura3d look lint`, which works without the request.

```ts
// packages/aura3d-cli/src/look/rubric.ts
export const AGENT_LOOK_CATEGORIES = [
  "lighting", "shadows", "ibl_reflections", "environment_world", "atmospheric_effects", "material_quality",
  "modeling_assets", "composition", "camera", "postprocessing", "animation_quality", "ui_hud"
] as const;                                                  // subset of C-32 GAME_VISUAL_CATEGORIES (unit test asserts ⊆)
export interface LookJudgement {
  readonly schema: "aura3d.look-judgement/1";
  readonly round: number;
  readonly shots: readonly { readonly path: string; readonly sha256: string }[];
  readonly references: readonly string[];                    // reference-frame ids used
  readonly scores: Readonly<Partial<Record<(typeof AGENT_LOOK_CATEGORIES)[number], number>>>; // 0-10, 0.5 steps; N/A omitted
  readonly observations: readonly { readonly category: string; readonly seen: string }[];    // >= 1 per score < 7
  readonly nextChange: { readonly category: string; readonly change: string; readonly api: string };
  readonly judge: "self" | "prism";
}
```

### 7.7 `@aura3d/cli`: skills manifest

```jsonc
// packages/aura3d-cli/skills/manifest.json
"coreSet": ["aura3d-core", "aura3d-art-direction", "aura3d-assets", "aura3d-evidence-review", "aura3d-scene-authoring"],
"skills": { "aura3d-art-direction": { "tier": "core", "prd": "QR13" }, ... },
"templates": {
  "mini-game": ["aura3d-browser-game", "aura3d-materials-environments", "aura3d-character-animation", "aura3d-game-art"],
  "racing-starter": ["aura3d-browser-game", "aura3d-materials-environments", "aura3d-game-art"],
  "arena-shooter": ["aura3d-browser-game", "aura3d-materials-environments", "aura3d-game-art"],
  ... // every game template gains aura3d-materials-environments
}
```

### 7.8 Removed

- `index.ts:18256` string under `A3D_QR_LOOKS` (replaced by `look/no-lights`; the flag-off text is removed only
  when the flag is removed, CONTRACTS §5.4).
- Echo semantics of `visualSystemsForPromptPlan` (`index.ts:10279-10289`) and static `repairHintsForPromptPlan`
  (`:10291-10325`), both inside the PRD 13 carve-out `nodes/prompt/promptPlan.ts`.
- From templates: `@aura3d/lean*` imports, `diagnostics.overlay: true` defaults, constant evidence fields,
  adoption props, primitive HUDs, palette-count screenshot assertions.
- From skills/docs: "Add only prompt-required customization", "cheapest targeted fix", the blanket
  "do not swap GLBs or repaint" rule (amended, §11), `character.lowPolyHumanoid` as the recommended humanoid,
  `visualQA` as acceptance, `lights.ambient` in any sample without an environment.

---

## 8. Shader changes

None. This PRD adds no GLSL/WGSL and changes no shader. Every pixel change comes from composing other lanes'
contracts (v1) or existing engine features (v0). If a look needs a shader capability that does not exist, the look
is degraded and `missingContracts` names the gap. A shader is never written here.

---

## 9. Rendering changes

None in the renderer. Frame-level effects come from authoring defaults:
- Templates and hello world render with an environment, a full-strength key shadow, tone-mapped post and DPR from
  tier, because they ask for a look, not because a renderer default changed.
- v0 supplies `renderer.qualityProfile: "production"` and `pixelRatio: min(devicePixelRatio, 2)` through
  `looks.appOptions(id)`. Once the C-27 `quality: "auto"` slot is real and `A3D_QR_TIERS` is on, v1 returns `{}`
  there and the tier decides.
- `lookLint` reads diagnostics. It never alters the frame.

---

## 10. Per-recommendation impact

| # | Recommendation | Visual benefit | GPU / CPU / memory cost | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|
| R1 | `looks.preset` + templates at floor | Highest. Removes void, no-IBL, faint shadow and DPR-1 from every new project at once (research/21's top causes in 15/18 games) | GPU = what the look enables, within C-27 tier budgets (§19). v0 adds 1 HDRI (1k RGBE ≈ 1.5 MB transfer, ~8 MB GPU RGBA16F), 1 shadow map 2048², AO + bloom ≈ 1.5–3 ms Medium. CPU < 0.05 ms | looks.ts + presets ≤ 4 KB gz; HDRI is an asset, lazy | Low tier: 1k HDRI → 128 px PMREM (C-27 Low), 1 cascade 1024², AO off. Mobile capture judged | `missingContracts` → v0. If v0 HDRI fails to load → neutral env + warning; never ambient |
| R2 | Look lint (runtime + `look lint`) | Indirect: the agent learns what is wrong without seeing pixels | Runtime lint ≤ 0.2 ms once per snapshot change, 0 per frame. AST lint CLI-only | ≤ 3 KB gz (runtime rules); AST in CLI | none | Rules gated by capability flags; unknown → skipped, never false-positive |
| R3 | Prompt plan v2 | Plans get what they ask for; no fake reports | Same as R1 per plan | ≤ 2 KB gz (mapping tables) | as R1 | flag off → 1.0 behaviour; flag on → `unsupported: "warn"` in 3.x |
| R4 | `aura3d-art-direction` skill + recipes + references | Gives agents a target. Per-genre camera/palette/atmosphere numbers | none at runtime | 0 (skills are docs) | Recipes include mobile framing (portrait fov +8°, HUD safe areas) | — |
| R5 | Mandatory look-dev loop + CLI capture/judge | Agents iterate on pixels. Removes the blind-authoring rule | Remote runner time: ≈ 3–5 min per round on macos-14 (build + 3 shots × 2 viewports) | CLI only | Mobile viewport in every capture | Runner unavailable → the loop is recorded `not-run` and the deliverable is labelled `prototype`; no visual claim |
| R6 | llms.txt rewrite + ratio inversion | Shifts the default answer from "label it" to "light it" | none | 0 | — | — |
| R7 | Lean removed from templates | mini-game/product-viewer get lights, env, rotation and animation | Engine-path templates are heavier than lean; the starter budget (mini-game ≤ 250,000 B) stays PRD 15's | see §19 | as R1 | none; the overage is reported to PRD 15 (request Q-15-4) and is never met by removing lighting |
| R8 | visualQA → structuralQA | Stops agents gaming names with fake cards | none | ~0 | — | Deprecated alias for one minor |
| R9 | Template gates on floor + regression baselines (PRD 13-stored; G-REG via Q-12-2), palette counts removed | Templates stop rewarding the Atari palette | CI time | 0 | Mobile shots | — |
| R10 | Agent output eval (12 × 3) | The only measurement of what users get | ≈ 36 runs × (≤ 45 min agent + 6 capture) per round; sharded 12-wide ≈ 3–4 h wall | 0 | Mobile judged (A1) | Prism unavailable → round is `vision-missing`, humans only (C-32 rule) |

---

## 11. Migration plan

1. **3.x minor (standalone; v0 looks).** Ship the new APIs `looks` (v0), `lookLint`, `structuralQA`,
   `compilePromptPlanV2` (all new and opt-in, so they need no flag). Ship the new skill, the rewritten
   skills/llms/docs, and templates on `@aura3d/engine` with looks. Existing behaviour changes only under
   `A3D_QR_LOOKS`: the diagnostics warning text (`index.ts:18256` → `look/no-lights`) and v2 semantics for the
   existing `compilePromptPlan`. The flag follows CONTRACTS §5.3: it is off by default until `integrated-accepted`.
2. **Docs amendments.**
   - `docs/agents/no-hackjob-rules.md:45-46` becomes: "Do not add geometry, cards or labels that imitate a missing
     engine capability (fake reflections, blob shadows, painted lights). Art-direction changes (assets, looks,
     camera, palette, composition) are expected and iterated."
   - `docs/agents/build-playbook.md:141-151` and `docs/agents/benchmark-recipes.md:4`: "smallest matching recipe" →
     "matching genre recipe with its look". Delete `character.lowPolyHumanoid` as the recommended humanoid
     (keep it documented as a placeholder).
   - `docs/agents/cinematic-scene-quality.md` is folded into the new `docs/agents/art-direction.md` (with API
     values) and leaves a redirect stub.
   - `docs/agents/game-example-standards.md` gains a "Visual bar" section that links `art-direction.md` and the
     rubric.
3. **As provider slots become real (no date; observed at checkpoints).** v1 expansion activates per id when every
   slot it needs is provided and its flag is on (§6.1). Templates add a lane's flag to `qualityRebuild.flags` once
   that flag is in `standalone-accepted` (CONTRACTS §5.4). Template goldens are re-approved only through a C-32
   G-PANEL round, never auto-accepted.
4. **4.0 (requests to PRD 15, non-blocking).** `unsupported: "reject"` default (PRD 13 file). `visualQA`
   properties, the 1.0 report type and `AuraPromptEffectId "hud"` are removed (Q-15-3, PRD 15 files). `@aura3d/lean`
   removal is PRD 15's and does not affect templates, which never import it after Phase 3.
5. **Codemod** `look-from-ambient`, registered by PRD 13 with C-39 `registerCodemod` from
   `src/commands/prd13/index.ts` and run with `aura3d codemod look-from-ambient <glob>`:
   - `lights.ambient(x)` with no env node in the same scene → `looks.preset("<category default>")` plus a TODO.
   - `renderer.qualityProfile: "safe-basic"` → removed.
   - `report.visualSystems` consumers → `report.appliedEffects` (when they move to `compilePromptPlanV2`).

## 12. Backward compatibility

| Surface | Change | Compatibility |
|---|---|---|
| `compilePromptPlan(plan)` | Flag off: unchanged. Flag on: scene follows plan fields; report stays schema 1.0 with honest `visualSystems`/`effects`/`repairHints` | Return type unchanged. `effects` = applied, not requested (an intended semantic fix, flag-gated). Default `warn`, so no new throws. Full 2.0 report only via the new `compilePromptPlanV2` |
| `promptRecipes[...]` | Gains an optional third `look` param; output changes under the flag | Callers passing 2 args get the scene-type default look |
| `visualQA` | Implementations add `deprecated: true`, `kind` | Same result keys; additive only |
| Diagnostics warning text | `index.ts:18256` replaced under `A3D_QR_LOOKS` only | Flag-off text byte-identical (C-34 conformance). Text-matching consumers: `tools/agent-dogfood/index.ts` (PRD 13-owned) updated here; T1.6 runs `rg` for others and files requests for any non-13 hit |
| Templates | Content rewritten | New scaffolds only. Existing user projects untouched. `npm create aura3d@<prev>` reproduces old templates |
| Skills | Rewritten; new core skill | `writeAgentSkills` respects user-modified files (`check.ts:89-92` smoke) |
| `llms.txt` | Rewritten | Release-integrity tokens preserved (`check.ts:51-56`) |
| Template screenshot tests | Assertions change | Template-local; ship with the template |

---

## 13. Contracts consumed / provided

This section replaces the earlier proposed-ID tables (C-01-quality … C-15-surface, P-13-*). Every ID below is a
CONTRACTS.md catalog ID; CONTRACTS Appendix A maps the old IDs. PRD 13 builds against each consumed contract's PR 0a
or PR 0b stub and never waits for a provider's real implementation. What a stub can show decides whether an
acceptance item is standalone (§18.1) or integrated (§18.2).

### 13.1 Contracts provided

| ID | Name | Surface PRD 13 provides | Stub that must keep working (CONTRACTS C-34 "Stub") | Real (PRD 13 files) | Consumers |
|---|---|---|---|---|---|
| C-34 | Looks and the lookLint rule registry | `looks.preset/nodes/appOptions/list/describe/resolveDefault`, `AuraLookPreset`, `lookLint`, `registerLookLintRule`, `AuraLookDiagnostics`, the C-31 `"look"` section, the C-36 `"look"` NodeHandler | Registry and `lookLint` host real in PR 0b-1. `index.ts:18256` replaced by a `lookLint` call registering `look/no-lights` with the **same text**, so with `A3D_QR_LOOKS` off behaviour is unchanged. Duplicate code throws. `C-34-looks.test.ts` stays green for `stub` and `real` | `agent-api/looks/{looks,lookPresets,lookLint,lookNodeHandler,generatedCodeWarnings,structuralQA,fakeEffectNames}.ts`; `provide()` in `src/lanes/prd13.ts` | 02 (`look/ambient-flattens`), 07 (`look/fake-effect-names`), 08 (`look/evidence-only-feel`), 09 (`look/capture-branch`), 10 (biome ids), 12 (`diagnostics().look`), 14 (games use looks) |

Registry entries and artefacts PRD 13 provides into other lanes' contracts. These are the CONTRACTS Appendix A
rows P-13-prompt, P-13-floor, P-13-templates, P-13-skills, P-13-eval and P-13-cli.

| Into | Entry | Meaning for consumers |
|---|---|---|
| C-31 | section key `"look"` (`registerDiagnosticsSection`, owner `prd13`, flag `A3D_QR_LOOKS`) | `diagnostics().look: AuraLookDiagnostics`. With the flag off: `{ id: null, expansion: "none", missingContracts: [], lint: [] }` |
| C-36 | `registerNodeHandler({ kind: "look", owner: "prd13", flag: "A3D_QR_LOOKS" })` | v1 looks compile through the handler. Feature tags `look.<id>` go into `CompiledScene.features` |
| C-39 | commands `look capture`, `look judge`, `look rubric`, `look lint`; codemod `look-from-ambient`; host for `registerDoctorRule` rules | PRDs 08 and 09 register doctor rules and they run in `aura3d look lint` |
| C-32 | records only (no new types): agent-eval rounds written as `PanelRoundRecord` + `GameJudgement` with `rubricPromptVersion` | PRD 12 history ingests them unchanged |
| C-40 | consumer only. PRD 13 adds no fact rows, but marks rows it used in skill text by citing the row id in a comment in each skill file | traceability from skill text to evidence |
| P-13-prompt | `compilePromptPlanV2`, `AuraPromptPlanV2`, `AuraPromptPlanReportV2`, `AuraPromptPlanError` in `nodes/prompt/` | PRD 12/15 may read report 2.0; public API is a superset |
| P-13-floor | `TemplateLookFloorSpec/Result`, `checkTemplateLookFloor` (`tools/agent-templates/look-floor.ts`) | PRD 12/14 may reuse the floor checker on routes (read-only import) |
| P-13-templates | 20 templates incl. new `arena-shooter`; `character-hero` written from PRD 06's acceptance bar (CONTRACTS R20) once a verified F-06 row exists | PRD 14 may scaffold from them; nothing in PRD 14 waits on them |
| P-13-eval | `benchmarks/agent-eval/prompts.json`, results schema `aura3d.agent-eval/1` | release reporting |

Conformance: `tests/unit/contracts/C-34-looks.test.ts` (PRD 15-owned) must pass for `stub` and `real`. PRD 13 adds
`tests/unit/contracts/impl/prd13-looks.test.ts` (v0/v1 selection, defaults installed only for unregistered
codes, flag-off text identity).

### 13.2 Contracts consumed

| ID | Name | Provider | What PRD 13 uses | Day-0 stub behaviour PRD 13 relies on | Effect on acceptance |
|---|---|---|---|---|---|
| §1.1 | Flags and slots (`resolveQrFlags`, `ContractSlot.provided/get`) | 15 (PR 0a) | v0/v1 selection; `A3D_QR_LOOKS` gating | real in PR 0a | standalone |
| C-03 | MaterialFeature lobe registry | 04 | skills/llms material rows list only lobes reported by `materialLobes()` (via C-40 facts); no template authors a lobe the registry does not report | registry real; lobes have no render effect until the C-02 generator is real; diagnostics report `materials.paths.materialModel = "legacy"` (`CONTRACTS.md:490-491`) | standalone (facts-driven text only); lobe visuals integrated |
| C-05 | Output: tone mapping, exposure, `AuraOutputOptions.preset?` | 01 | v1 `output: { preset }`; llms mapping row `toneMapping` → `output` | `setOutput` maps to the existing present shader; unsupported operators → `aces` + `capability-degraded` | v0 standalone; v1 output integrated |
| C-07 | Primitive tessellation, InstanceBuffer | 01 | `three-compat-material-authoring` sphere grid; falling-blocks instancing | today's tessellation and instancing | standalone (regression only) |
| C-09 | EnvironmentSource / EnvironmentProbe: `environments.preset/neutral/hdri` | 02 | studio looks v1; `capabilities.ambientAdditive` | `resolveEnvironment` runs the legacy path; ambient-replaces-IBL is preserved with `A3D_QR_LIGHTING` off. v0 avoids ambient entirely, so this does not hurt standalone | v0 standalone; IBL-correct ambient integrated |
| C-10 | Lighting API: `lights.hemisphere`, directional `shadow` | 02 | v1 fill; llms mapping `AmbientLight` → `lights.hemisphere` | `hemisphere` lowers to two directional fills + `capability-degraded`; skills say "use a look" first | standalone |
| C-11 | Shadow strength and casters | 02 | `look/weak-shadow` threshold reads observed strength | legacy strengths 0.32 / 0.24 / 0.38 (`index.ts:12966-12968`) stay | S2 shadows target set at the v0 ceiling; full strength integrated |
| C-13 | PostPass registry, `postPresets` (7 ids) | 03 | v1 post per look; skills post rows | `postPresets[id]` = `{ output: {}, effects: [] }` + `PRESET_PENDING`, so v0 uses tuned `effects.*` | v0 standalone; preset look integrated |
| C-15 | Material overrides preserving textures | 04 | templates and skills never use `replaceTextures: true` | `materialOverrides` → `setTint` for `color` only; templates use no tint overrides | standalone |
| C-17 | Asset manifest 1.1 | 05 | template `aura.assets.json`; HDRI admission | the reader accepts 1.1 and the writer emits 1.0. `resolveTypedAssetApi` (`asset-manifest.ts:112-125`) emits `@aura3d/engine` imports once a template's `package.json` depends on `@aura3d/engine`, so the typegen needs no change | standalone |
| C-19 | AnimationPlayback API | 06 | hero/fighter/controller clips; floor `characterExpected` reads `tracksApplied` | `crossFadeTo` → existing `node.play` (immediate switch); `animationState()` reads `applyProductionActorAnimation` | clips play standalone; `characterExpected` is report-only until a verified F-06 row; blend quality integrated |
| C-20 | ParticleEmitter, `app.effects`, `diagnostics().effects.pixelBacked` | 07 | prompt v2 effect acceptance; recipes' VFX rows | primitive-pool bursts are reported as pixel-backed with `sim: "primitive-pool"`. PRD 13 treats those as **not** pixel-backed (§6.3) | rain/particles rejected standalone; accepted integrated |
| C-21 | Sky, fog, atmosphere | 07 | v0 fog colour = horizon; v1 sky via biome | `sky.*` lower to `sky.dayNight`; `setFog` writes `environmentFog`; linear fog | standalone |
| C-22 | CameraRig live API | 08 | template follow cameras; prompt v2 camera mapping | `use(rig)` + `setPose` real; `fromSpec`/`static` real; other factories static. Templates use `fromSpec` + per-frame `setPose` | standalone; rig feel integrated |
| C-24 | GameShell, Session, HUD, Touch, capture context | 09 | all 6 game templates on `createGame` from day 0 | `createGame` wraps `createGameApp` (`index.ts:11818`); DOM shell/HUD; `touch` → `game.touchControls`; `captureFromUrl` ignores `?capture=review` | standalone; sound/feel targets integrated |
| C-25 | Game audio | 09 | game templates' SFX/music through the game shell; skills' audio rows | stub wraps `packages/engine/src/game/GameAudio.ts`; `engine()` emulates `setRate` by restarting the voice; `proof().synthCues` counts synthesized cues (`CONTRACTS.md:1584-1586`) | standalone (templates audible on today's audio); mixed/positional quality integrated |
| C-26 | World queries, biome rigs (`AuraBiomeId`) | 10 | 11 biome look ids; v1 delegation | `biome()` returns null, so every biome look runs v0 | v0 standalone; biome rig integrated |
| C-27 | QualityTier settings | 11 | `tierCap` for `look/low-dpr`; per-tier budgets §19 | `QUALITY_TIERS` real data; `"auto"` → high desktop / medium coarse pointer | standalone |
| C-28 | Device counters, FrameStats | 11 | §19 frame-time and draw-call budgets in template tests | partial counters; rAF timing in tests | standalone (report) |
| C-31 | Diagnostics sections, `AppliedLookReport` | 12 (schema) | lint input; `"look"` section host | each key present with null/empty values; `appliedLook` assembled from existing fields | standalone |
| C-32 | VisualReview rubric, `GAME_VISUAL_CATEGORIES`, `PanelRoundRecord`, `judgeWithPrism` | 12 | rubric subset; eval records; `--judge prism` | types and categories real in PR 0a; if `judgeWithPrism` is absent, `--judge prism` exits 2 | screening standalone; acceptance only at G-PANEL |
| C-33 | Capture harness interface | 12 | template look-dev capture; agent-eval capture | today's `capture-games.mjs` / `capture.mjs` + PR 0b `--flags` passthrough; PRD 13's own `capture-templates.mjs` drives template builds | standalone |
| C-35 | Art direction and game acceptance schema | 14 | `GameGenre` incl. `arena-shooter` for recipes; pilot patterns | types only; `auditArtDirection` returns `[]` + `PENDING` | standalone; pilot absorption integrated |
| C-36 | SceneCompiler extension points | 15 | `"look"` node kind handler; `DIAGNOSTIC_ONLY_FIELDS` via `compiler/diagnosticOnly.prd13.ts` | handlers for new kinds run on the stub compiler; existing kinds unchanged | standalone |
| C-38 | App surface extension registry | 15 | `qualityRebuild.flags` option in templates | real in PR 0 | standalone |
| C-39 | CLI command and codemod registry | 15 | all `look *` commands, codemod, doctor-rule host | real in PR 0 (fallthrough in PR 0b-3) | standalone |
| C-40 | Facts handoff tables | every lane | skill and `llms.txt` text | no code. Only `verified` rows are written as fact. `proposed` rows are not used | standalone (text is correct for today's engine) |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R7 (prompt-plan block `index.ts:10103-10363` is PRD
13's via carve-out to `nodes/prompt/`; `sceneKits` `:9841-10005` is PRD 02's; PRD 02 lighting recipe arrives as C-40
facts), R8 (`collectGeneratedCodeWarnings` `:18253-18293` is PRD 13's via carve-out to
`looks/generatedCodeWarnings.ts`; PRD 02 registers `look/ambient-flattens`), R20 (templates and skills: PRD 13 is
the only writer; `character-hero` is written here from PRD 06's bar).

---

## 14. Parallel execution

### 14.1 Day-0 start conditions

PRD 13 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artefacts:
`packages/engine/src/contracts/{flags,looks,diagnostics,compiler,camera,game,world,effects,atmosphere,lighting,environment,post,output,art,app}.ts`
and `stubs/*`, `packages/rendering/src/contracts/{core,quality}.ts`, `packages/aura3d-cli/src/contracts/commands.ts`,
`packages/aura3d-cli/src/commands/{registry.ts,prd13/index.ts}`, the lane barrel `packages/engine/src/lanes/prd13.ts`,
`compiler/diagnosticOnly.prd13.ts`, `tools/quality-gate/src/contracts.ts` (C-32), the `packages/game` skeleton
re-exporting the C-24 stubs, and the conformance harness. Nothing from any other lane's real implementation is
needed, and the lane does not wait for PR 0a to merge.

Day-0 work, all in PRD 13-only files: `looks/{looks,lookPresets,lookLint,lookNodeHandler,fakeEffectNames}.ts`,
`nodes/prompt/promptPlanMappings.ts`, `tools/agent-*`, `benchmarks/agent-eval/`, skills, `llms.txt`, `docs/agents/`,
`docs/guides/`, all templates, both workflows. Carved regions become editable when PR 0b-1 merges (no later than
2026-10-07): `looks/generatedCodeWarnings.ts`, `looks/structuralQA.ts`, `nodes/prompt/{promptPlan,promptRecipes}.ts`,
and the C-31/C-34/C-36 seams. Until then the replacements are written in new PRD 13 files and wired on the 0b-1
merge. The C-39 fallthrough (PR 0b-3) only changes how users type `aura3d look …`. Tests call the PRD 13 entry
directly (§7.6).

If PR 0b-1 drops a PRD 13 carve-out (CONTRACTS §3.9 size rule), that region stays with PRD 15 and the edit becomes
request Q-15-5. PRD 13 keeps shipping the new modules (`compilePromptPlanV2`, `structuralQA`, `lookLint`), which do
not depend on the carve.

### 14.2 Owned files and directories (must match CONTRACTS §4.1 row 13)

`packages/create-aura3d/` (all: `templates/**` incl. `three-compat-*`, `character-hero`, `arena-shooter`,
`*/aura.assets.json`; `skills/**`; `src/`; `package.json`); root `templates/`, `examples/`;
`packages/aura3d-cli/skills/**`, `packages/aura3d-cli/src/look/`; `packages/engine/src/agent-api/{looks,prompt}/`,
`agent-api/nodes/prompt/`; `benchmarks/agent-eval/`; `tools/agent-*/`; `llms.txt`; `docs/agents/`, `docs/guides/`;
`.github/skills`, `.claude/skills`, `.cursor/skills`, `.agents/skills`;
`.github/workflows/{agent-output-eval,template-lookdev}.yml`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd13,prd-13}/`,
`packages/*/src/lanes/prd13.ts`, `agent-api/compiler/diagnosticOnly.prd13.ts`, `packages/aura3d-cli/src/commands/prd13/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd13/`, `.github/workflows/qr-prd13-*.yml`,
`tests/qr/prd13/`, `tests/unit/contracts/impl/prd13-*`. New tests this lane creates (creator rule) are listed in §5.

Tasks of the earlier draft that edited files owned by other lanes were converted as follows:

| Earlier task | File (owner) | Now |
|---|---|---|
| Replace `index.ts:10007-10345` with re-exports | `agent-api/index.ts` (15) | PR 0b-1 carve of `:10103-10363` into PRD 13's `nodes/prompt/`. Types `:10007-10102` stay; v2 types extend them in PRD 13's module (§7.3) |
| Delete the `:18256` string, call `lookLint` | `agent-api/index.ts` (15) | PR 0b-1 carve of `:18253-18293` into `looks/generatedCodeWarnings.ts` (C-34 seam); text changes only under `A3D_QR_LOOKS` |
| Add `looks` / `scene().look` re-exports | `agent-api/index.ts` (15) | exports from `src/lanes/prd13.ts` (CONTRACTS §3.8 barrels); `scene().look` is Q-15-1, and `.add(looks.preset())` works meanwhile |
| `@deprecated` + `structuralQA` members at `:2721` and siblings | `nodes/material.ts` (04), `index.ts` (15) | implementations carved to `looks/structuralQA.ts` (13); separate `structuralQA` namespace; JSDoc via Q-04-1 / Q-15-2 |
| `expandLookNodes` at the snapshot build site | `app/createAuraApp.ts` (15) | v0 group expansion needs no seam (`flattenSceneNodes` `:17960`); v1 via the C-36 `"look"` handler |
| `diagnostics().look` merged into `AuraDiagnostics` | `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection("look")` |
| `aura3d init` agent text (`aura3d-cli/src/index.ts:3642-3668`) | `aura3d-cli/src/index.ts` (05) | Q-05-1. Meanwhile `aura3d-core` (installed for every template) carries the art-direction rule, and every template ships its own `AGENTS.md` with the same text (template files are PRD 13's) |
| `doctor --look` (`cli.ts:229`), `cli-help.ts` entries | `aura3d-cli/src/{cli,cli-help}.ts` (05) | C-39 `look lint` command + generated help; `doctor --look` alias is Q-05-2 |
| Codemod in `aura3d migrate` | `aura3d-cli/src/codemods/` (15) | C-39 `registerCodemod("look-from-ambient")` from `commands/prd13/` |
| Bundle target in `tests/reports/bundle-size.json` / `check:bundle-size` | `tools/bundle-size/` (11) | Q-11-1. Meanwhile `tests/qr/prd13/bundle-delta.test.ts` builds `lanes/prd13.ts` with esbuild (existing root devDependency, `package.json:732`) and asserts ≤ 9 KB gz |
| Root `templates/` "handed off to PRD 15" | root `templates/` (13) | owned here; T3.14 |
| Templates read from PRD 12 golden store / G-REG | `benchmarks/quality-rebuild/` (12) | template baselines stored in PRD 13's `benchmarks/agent-eval/baseline/templates/`; G-REG ingestion is Q-12-2 |

### 14.3 Extension points used in files owned by others

| Seam | Host file (owner) | PRD 13 registration (own file) |
|---|---|---|
| C-34 `generatedCodeWarnings` carve | `index.ts:11324` call site (15) | `looks/generatedCodeWarnings.ts` |
| C-31 `registerDiagnosticsSection` | `app/diagnostics.ts` (15) | `looks/index.ts` registers key `"look"` |
| C-36 `registerNodeHandler` | `compiler/` (15) | `looks/lookNodeHandler.ts`, kind `"look"`, flag `A3D_QR_LOOKS` |
| C-36 `DIAGNOSTIC_ONLY_FIELDS` | `compiler/` index (15) | `compiler/diagnosticOnly.prd13.ts` (`look.overrides.*` until v1 wires them) |
| C-38 `qualityRebuild.flags` option | `app/createAuraApp.ts` (15) | templates pass flags; no registration |
| C-39 `registerCliCommand` / `registerCodemod` / doctor-rule host | `aura3d-cli/src/cli.ts` fallthrough (05), `commands/registry.ts` (15) | `aura3d-cli/src/commands/prd13/index.ts` |
| C-33 capture `--flags` | `capture-games.mjs` (12) | invoked from `tools/agent-eval/capture.mjs` and `template-lookdev.yml` |
| Lane barrel | `src/lanes/index.ts` (15) | `src/lanes/prd13.ts` |

### 14.4 Feature flags (CONTRACTS §5.1)

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_LOOKS` | bool | every behaviour change to existing APIs: lookLint texts in `diagnostics().warnings` (flag off keeps the `:18256` text), v2 semantics of the existing `compilePromptPlan`/`promptPlanToScene`/`promptRecipes`, C-31 `"look"` section values, the C-36 `"look"` handler | — |
| `A3D_QR_LOOKS_EXPANSION` | `v0` \| `v1` \| `auto` (default `auto`) | forces the look expansion in tests and benchmarks | `A3D_LOOK_EXPANSION` |
| `A3D_QR_LOOKS_PROMPT_STRICT` | bool | default `unsupported: "reject"` (CI) | `A3D_PROMPT_PLAN_STRICT` |

New opt-in APIs (`looks.*`, `lookLint`, `structuralQA`, `compilePromptPlanV2`, `aura3d look *`) change no existing
behaviour, so they work with the flag off. Templates are files, not flags. They opt into other lanes' flags only once
those flags are in `standalone-accepted` (CONTRACTS §5.4), and the rollback is the previous `create-aura3d` dist-tag.

### 14.5 Stubs used

C-05 (legacy present shader), C-07, C-09 (legacy environment, ambient replaces IBL with `A3D_QR_LIGHTING` off), C-10
(hemisphere → two directional fills), C-11 (legacy shadow strengths), C-13 (`PRESET_PENDING` presets), C-15
(`setTint` colour only), C-17 (1.0 writer), C-19 (`node.play` immediate switch), C-20 (primitive-pool, treated as
not pixel-backed), C-21 (`sky.dayNight`, linear fog), C-22 (static rigs except `fromSpec`), C-24 (`createGame` over
`createGameApp`), C-26 (`biome()` null), C-27 (real data), C-28 (partial counters), C-31 (null sections, assembled
`appliedLook`), C-32 (types real), C-33 (today's scripts + `--flags`), C-35 (types, `PENDING` audit), C-36 (wrapped
legacy compiler, new-kind handlers run), C-38/C-39 (real). PRD 13's own C-34 stub stays the flag-off path until
CONTRACTS §5.4 removal.

### 14.6 Requests to other lanes (non-blocking)

Each request is filed as a `qr-request` + `to:prdNN` issue (CONTRACTS §6.5). PRD 13 never waits on one. Each row
names what PRD 13 does in the meantime and which acceptance item moves to the next checkpoint after the request
lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-02-1 | 02 | Register `look/ambient-flattens` via `registerLookLintRule`; add verified C-40 rows for ambient-additive (F-02-01), shadow strength 1.0, `environments.preset` ids | C-34, C-40 | PRD 13 default rule under the same code; skills keep "ambient disables IBL" wording until F-02-01 is `verified` |
| Q-03-1 | 03 | Verified C-40 rows for the 7 `postPresets` values, `softKnee`/FXAA guidance | C-13, C-40 | v0 tuned `effects.*`; skills name presets only as "when available" |
| Q-04-1 | 04 | `@deprecated` JSDoc on `material.visualQA` in `nodes/material.ts`; verified row "overrides preserve textures" | C-15, C-40 | runtime `deprecated: true` key; skills already say "use `structuralQA`; not acceptance" |
| Q-05-1 | 05 | `packages/aura3d-cli/src/index.ts:3642-3668` (`genericAgentText`): add "Read the `aura3d-art-direction` skill. Every scene gets a look. Run the look-dev loop (`aura3d look capture` → judge → iterate) before calling a scene done." Better: load the body from `packages/aura3d-cli/skills/agent-files/AGENTS.md` (PRD 13-owned), so later text edits need no request | C-39 | templates ship `AGENTS.md`; `aura3d-core` carries the rule |
| Q-05-2 | 05 | `cli.ts:229` `doctor`: forward `--look` to the registered `look lint` command | C-39 | `aura3d look lint` documented everywhere |
| Q-05-3 | 05 | Admit HDRIs ≥ 2k and curated kits (platform kit, ship/drone, track, fighters) and publish verified C-40 rows with catalog ids | C-17, C-40 | templates use the 3 repo HDRIs at 1k and the best existing typed catalog assets |
| Q-06-1 | 06 | Verified rows for `tracksApplied`, locomotion blend, and the `character-hero` acceptance bar | C-19, C-40 | `characterExpected` report-only; `character-hero` template not created until the row is verified |
| Q-07-1 | 07 | Optional refined `look/fake-effect-names` registration; F-07 rows (fog defaults, pixel-backed kinds per tier) | C-20, C-34, C-40 | PRD 13 default list in `looks/fakeEffectNames.ts` |
| Q-08-1 | 08 | Register `look/evidence-only-feel` (runtime `registerLookLintRule` + static `registerDoctorRule`); verified rig rows | C-22, C-34, C-39 | code reserved; templates use `fromSpec` + `setPose` |
| Q-09-1 | 09 | Register the `look/capture-branch` doctor rule; verified `createGame` / Hud / touch / sound rows | C-24, C-39 | PRD 13 default static rule; templates on the C-24 stub |
| Q-10-1 | 10 | Verified biome rig rows per `AuraBiomeId` (sun elevation, fog, post) | C-26, C-40 | v0 values per id in `lookPresets.ts` |
| Q-11-1 | 11 | Add a `lanes/prd13` entry (≤ 9 KB gz) to `tools/bundle-size` targets; verified tier-cap row | C-27 | `tests/qr/prd13/bundle-delta.test.ts` |
| Q-12-1 | 12 | Include templates and agent-eval runs as items in G-PANEL rounds; confirm the `judgeWithPrism` export from `tools/quality-gate`; optionally add an external-route option (`--routes-file`) to `capture-games.mjs` | C-32, C-33 | screening via self-judgement + vision; `--judge prism` exits 2; PRD 13's own `capture-templates.mjs` captures |
| Q-12-2 | 12 | G-REG ingestion of `benchmarks/agent-eval/baseline/templates/` as non-approved baselines; licensed reference stills in `benchmarks/quality-rebuild/refs/` | C-30, C-33 | baselines stay in PRD 13's tree; reference frames are text + threejs.org links |
| Q-14-1 | 14 | Publish accepted pilot patterns (Turbo, Aura Clash, Orbital, Bank) as C-40 rows / C-35 art-direction records | C-35, C-40 | templates use §6.4 recipes |
| Q-15-1 | 15 | `AuraSceneBuilder.look(id, overrides?)` (`index.ts:4779`) → `this.add(looks.preset(id, overrides))` via the C-34 slot | C-34 | `.add(looks.preset(id))` is the documented form |
| Q-15-2 | 15 | `@deprecated` JSDoc on `neon/charts/character/city/product/solar.visualQA` (`index.ts:8409, 8424, 9018, 9254, 9366, 9452`) | C-34 | runtime `deprecated: true` |
| Q-15-3 | 15 | 4.0 train: remove `"hud"` from `AuraPromptEffectId` (`index.ts:10008`), the 1.0 report type, and `visualQA` properties | — | `"hud"` always rejects/warns |
| Q-15-4 | 15 | Starter bundle budget for engine-path templates (mini-game ≤ 250,000 B) and code-splitting | — | overage reported in `evidence/prd-13/bundle.md`; never met by removing the look |
| Q-15-5 | 15 | Only if PR 0b-1 drops a PRD 13 carve-out: apply the listed change in `index.ts` | C-34, C-36 | new PRD 13 modules ship; old paths unchanged |

### 14.7 Integration checkpoints

Integrated acceptance (§18.2) is evaluated only at CONTRACTS §7 checkpoints, with `A3D_QR_LOOKS` on inside
`qr_flags=all` and also with `none`. It never blocks a PRD 13 merge or phase exit:
- IC-0 (2026-10-08): flags `none` identity baseline. PRD 13 records the template and round-0 baselines from it.
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): weekly screening (vision-only, recorded, cannot accept). Each run
  reports per template `diagnostics().look.expansion` and `missingContracts`, which shows which provider slots
  became real.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds, the only rounds that can satisfy §18.2
  items and move `A3D_QR_LOOKS` to `integrated-accepted`. Leave-one-out (`all,-looks`) attributes regressions.
- A checkpoint failure becomes a `qr-ic-regression` issue against the lane that leave-one-out or diagnostics
  attribution names (CONTRACTS §7). Shortfalls whose dominant cause is a stub (`missingContracts` non-empty) are
  filed against the provider lane, not patched in templates.

---

## 15. Implementation phases

Each phase's exit is met on a GitHub Actions macos-14 run (Chromium, ANGLE Metal) of `qr-prd13-authoring.yml` (unit +
browser), `template-lookdev.yml` or `agent-output-eval.yml`. The run ID is recorded in
`docs/project/aura3d-quality-rebuild/evidence/prd-13/<phase>.md`. Phase 1 starts on day 0. Phases 2, 3 and 4 depend
only on Phase 1 outputs and the PR 0b-1 merge, not on each other and not on any other lane, and they run in
parallel inside the lane. Phases 5-7 are integrated: they run when the checkpoints in §14.7 show that the relevant
provider slots are real. They are never a precondition for Phases 1-4 or for any merge.

**Phase 1: Day-0 work in new files only (2026-10-05 →).**
Work: T0.1-T0.7 (template capture tool, `template-lookdev.yml`, `prompts.json`, `tools/agent-eval/run.ts`,
`agent-output-eval.yml`, round-0 baseline, `craft-ratio.ts`); T1.1-T1.5 and T1.8 (looks v0 presets and builder,
lookLint with all 14 C-34 codes plus `look/multiple-looks` and `look/expansion-mismatch`, `registerLookLintRule`
defaults, prompt mapping tables); `qr-prd13-authoring.yml`.
*Exit:*
- `pnpm typecheck:raw`, `pnpm lint` and the narrow unit files of §17.1 are green. `C-34-looks.test.ts` is green on
  the stub.
- `looks.test.ts` shows `looks.preset("outdoor-day")` producing 1 HDRI environment node, 1 directional with
  `shadow: true`, colorGrade + AO + bloom and no ambient. The browser test `looks-expansion.spec.ts` (macos-14) shows
  that the group children reach `createProductionRuntimeEnvironment` (specular > 0 on the metal mask).
- `tests/reports/craft-ratio-baseline.json` matches research/12 §1.2 within ±3 lines per file.
- Template baselines (19 × 3 shots × 2 viewports, flags `none`) are stored in
  `benchmarks/agent-eval/baseline/templates/` as `baseline-3.0.1`, never as approved goldens.
- `benchmarks/agent-eval/baseline/round-0.json` has 36 runs judged (vision + ≥ 1 named human), as a C-32
  `PanelRoundRecord` marked `screening` unless the round coincides with a G-PANEL.

**Phase 2: Carve-out wiring, flag-gated (after PR 0b-1, ≤ 2026-10-07 →).**
Work: T1.6, T1.7, T1.9-T1.13 (lookLint in `generatedCodeWarnings.ts` under `A3D_QR_LOOKS`, prompt v2 in
`nodes/prompt/`, recipes rewrite, `structuralQA`, C-31 `"look"` section, C-36 `"look"` handler, `provide()` in
`lanes/prd13.ts`, bundle delta).
*Exit:* the 500-plan property test passes with `A3D_QR_LOOKS` on (`visualSystems ⊆ census(compiledSnapshot)`,
every unsupported field in `rejected`). The flag-off run of the existing prompt-plan unit tests is byte-identical.
The `:18256` text is identical with the flag off (C-34 conformance) and replaced with it on. `pnpm check:public-api`
shows a superset. Bundle delta ≤ 9 KB gz.

**Phase 3: Skills, `llms.txt`, docs, CLI look commands (day 0 →, parallel with Phases 1-2).**
Work: T2.1-T2.19.
*Exit:* `pnpm check:skills` is green with the new gates (sections, craft ratio, forbidden-sample rules, threejs.org
links allowed), and the §6.5 ratio targets are met. `aura3d look capture --runner gh-actions` (through the PRD 13
entry before PR 0b-3, through `aura3d look` after) returns PNGs for `product-viewer` on CI.
`aura3d look judge --validate` rejects malformed judgements (fixture tests). Skill text cites only `verified` C-40
rows. Statements about unverified capabilities are worded for today's engine.

**Phase 4: Templates at the floor on today's engine (day 0 →, parallel).**
Work: T3.1-T3.14 on `@aura3d/engine` with v0 looks and game templates on the C-24 `createGame` stub.
*Exit:* `checkTemplateLookFloor` ok for all 20 (runtime part on macos-14).
`rg "@aura3d/lean" packages/create-aura3d/templates` = 0. Root `templates/` is a generated mirror (`--check` green)
or deleted. Standalone acceptance S1-S8 (§18.1) passed and recorded. This is the gate for `A3D_QR_LOOKS` →
`standalone-accepted`.

**Phase 5 (integrated, tracked from IC-1): v1 expansion and provider flag opt-in.**
Work: T4.1-T4.4, applied per contract as soon as its slot is real and its flag is `standalone-accepted`.
*Exit (recorded, not gating):* `diagnostics().look.expansion === "v1-contracts"` for every template whose required
slots are real. Templates list the opted-in flags. I1-I3 are evaluated at the next G-PANEL.

**Phase 6 (integrated, at G-PANEL rounds): agent eval rounds and pilot absorption.**
Work: T5.1, T6.1.
*Exit (recorded, not gating):* round 1 and round 2 recorded with A1-A4 verdicts (I4, I5). Every miss is assigned to a
lane by dominant cause through a `qr-ic-regression` issue.

**Phase 7 (integrated, at flag removal per CONTRACTS §5.4): cleanup.**
Work: T7.1, T7.2. PRD 15-file removals go through request Q-15-3.
*Exit:* `reject` default. The flag-off path of `A3D_QR_LOOKS` is removed after two `default-on` checkpoints.
`rg "visualQA\(|lights\.ambient\(|qualityProfile|pixelRatio" packages/aura3d-cli/skills llms.txt packages/create-aura3d/templates/*/src`
returns only documented negative examples inside `failure-gallery.md`.

---

## 16. Task checklist

Tags: [E] engine, [S] skills/docs, [T] templates, [C] CLI, [V] eval/visual, [G] gates. Every browser/GPU step runs
on GitHub Actions `macos-14`. Before adding or changing any workflow, read
`/Users/gurbakshchahal/.config/agent-policy/reference/ci-selection.md`, and never expose secrets to fork PR code.

### 16.1 Phase 1 (day 0): baseline, harness, eval tooling

- [ ] [V] T0.1 `tools/agent-templates/capture-templates.mjs`: build each `packages/create-aura3d/templates/*` from packed tarballs (`node tools/release/publish-all.mjs --pack-only`, read-only use), serve each `dist/` with `vite preview`, and capture with Playwright using the C-33 conventions: readiness = `window.__AURA3D_GAME__?.state === "playing"` when present, else the existing readiness probe; flags via the `a3d-qr=<list>` URL param; no `?capture=` keys. Shots: opening/mid/action. Viewports: 1920×1080 + 390×844 (DPR 3). Runs only inside `template-lookdev.yml` on macos-14, never locally. Test: a workflow run produces 19 × 6 PNGs + `report.json` (template, shot, viewport, sha256, flags, run id).
- [ ] [V] T0.2 `.github/workflows/template-lookdev.yml` (macos-14, `workflow_dispatch` + `push` to main on `packages/create-aura3d/templates/**`, no secrets on `pull_request`): runs T0.1 and uploads artifacts. Test: one green run linked in `benchmarks/agent-eval/baseline/README.md`.
- [x] [V] T0.3 `benchmarks/agent-eval/prompts.json`: the 12 prompts of §18.3, with `id`, `text`, `category`, `allowedAssets` (P01 only: `benchmark/assets/sneaker.glb`), `rubricCategories`, `referenceFrames`. Test: `tests/unit/tools/agent-eval-prompts.test.ts` validates the schema, checks 3/2/2/4/1 category counts, and checks unique ids.
- [ ] [V] T0.4 `tools/agent-eval/run.ts`: per (prompt, seed) create a temp dir, `npm create aura3d@<tgz> <dir> --template <none|auto>`, run the agent CLI headless with the prompt and a 45-min limit, then `npm run build`. Store `src/**`, the agent transcript, the build log and `dist/`. Agent endpoint is Kiro Prism: before writing this file, read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` and use the documented Claude Code configuration; the key comes from the CI secret store and is never written to disk. Test: dry-run mode (`--dry-run`) with a stub agent producing a fixed project completes and emits `run.json` (`aura3d.agent-eval/1`).
- [ ] [V] T0.5 `.github/workflows/agent-output-eval.yml`: `workflow_dispatch` and weekly `schedule` on main only. Matrix 12 prompts × 3 seeds. Agent job (ubuntu-latest is allowed: no GPU) → capture job (macos-14, the T0.1 capture tool pointed at the agent-built `dist/` dirs, flags `none` and `all`, same C-33 readiness and URL conventions; switches to `pnpm quality:games` only if PRD 12 adds an external-route option, Q-12-1) → panel packet job. Concurrency group per round. Test: a dry-run dispatch with the stub agent goes green.
- [ ] [V] T0.6 Round 0: run T0.5 against 3.0.1 skills/templates. Record `benchmarks/agent-eval/baseline/round-0.json` with panel scores (vision + ≥ 1 named human). Test: the file validates against the C-32 `PanelRoundRecord` type (`tools/quality-gate/src/contracts.ts`, read-only import), with `rubricPromptVersion` set and the round marked `screening` unless it is a G-PANEL round.
- [ ] [G] T0.7 `tools/agent-skills/craft-ratio.ts`: freeze the research/12 §1.2 evidence and visual regexes as exported constants and classify every non-blank line of `packages/aura3d-cli/skills/**/*.md`, `llms.txt`, `docs/agents/*.md` and `docs/guides/*.md` into evidence-only/visual-only/both/neither. Output `tests/reports/craft-ratio.json`. Test: `tests/unit/tools/craft-ratio.test.ts` reproduces the research/12 table on a fixture copy of the 3.0.1 files within ±3 lines per file.

### 16.2 Engine: Phase 1 (T1.1-T1.5, T1.8, day 0) and Phase 2 (T1.6, T1.7, T1.9-T1.13, after PR 0b-1)

- [ ] [E] T1.1 Create `packages/engine/src/agent-api/looks/lookPresets.ts` with 15 `AuraLookPreset` entries (11 C-26 `AuraBiomeId` pass-throughs + 4 C-34 `AuraStudioLookId`). v0 values per id, set by this lane: outdoor ids use `autumn_field_puresky_1k`, key elevation 48° and azimuth 35°, shadow true, fog colour = horizon. `golden-hour` uses `kloppenheim_06_puresky_1k` with key elevation 12°. Studio ids use `studio_small_08_1k`. `night-city`/`space`/`underwater`/`polar-night` have hdri null and the background exception of §7.1. When a verified F-10 row exists, the v0 values for that biome are aligned to it in one commit. Test: `tests/unit/agent-api/looks.test.ts` asserts the 15 ids equal the union of the C-26 and C-34 types (compile-time `satisfies` check), no v0 entry emits an ambient light, every non-exception background has luma ≥ 0.06, and every entry has `key.shadow === true`.
- [ ] [E] T1.2 `looks/looks.ts`: `looks.preset/nodes/appOptions/list/describe/resolveDefault` per §7.1. v0 returns an `AuraGroupNode` named `aura-look:<id>` whose children are today's `environments.hdri`, `lights.directional({ shadow: true })`, optional rim, `effects.colorGrade/ambientOcclusion/bloom`, and background/fog nodes. Expansion choice: for each required contract (C-09, C-10, C-13/C-05, C-26, C-27) call the slot's `provided` and `flags.on(slot.flag)` on `resolveQrFlags({ url, env })` or `options.flags`. Test (unit): `looks.preset("outdoor-day")` yields a group with 1 environment child (hdri), 1 directional with `shadow: true`, colorGrade + AO + bloom, and no ambient. `looks.appOptions("outdoor-day")` = `{ renderer: { qualityProfile: "production" }, pixelRatio: min(dpr, 2) }`. With all slots stubbed, the expansion is `v0-current-engine` with `missingContracts` listing 5 entries. With `A3D_QR_LOOKS_EXPANSION=v1` and test doubles for the slots, it yields exactly one `AuraLookNode`. Test (browser, `tests/browser/looks-expansion.spec.ts`, macos-14): the flattened group reaches `createProductionRuntimeEnvironment` (`index.ts:12628`, via `flattenSceneNodes` `:17960`), shown by `appliedLook.environment.specularIntensity > 0`.
- [ ] [E] T1.3 Overrides and multiple looks in `looks.ts`: overrides are clamped per C-34. A second look group in one snapshot makes the last one win and emits warning `look/multiple-looks`. `AuraSceneBuilder.look` sugar is request Q-15-1, not a task here. Test: `exposureEv: 5` clamps to 2; two looks → one applied + warning.
- [ ] [E] T1.4 `looks/lookLint.ts`: implement the 14 C-34 codes of §6.2 with exact messages, plus `look/multiple-looks` and `look/expansion-mismatch`. Primitive share counts visible draw items from the snapshot census. Fake-effect names: the 41-name list extracted to `looks/fakeEffectNames.ts`, generated once by `rg` over `agent-api/index.ts` and `apps/showcase-*/src` (read-only) and committed. Test: `tests/unit/agent-api/look-lint.test.ts`, one positive and one negative fixture per rule; `look/ambient-kills-ibl` is suppressed when `capabilities.ambientAdditive` is true; inputs come from the C-31 stub `appliedLook`.
- [ ] [E] T1.5 `registerLookLintRule` consumer behaviour on PRD 13's side: defaults are installed lazily for codes no lane registered (`look/ambient-flattens`, `look/fake-effect-names`, `look/capture-branch`), and `look/evidence-only-feel` is reserved. Test: `tests/unit/contracts/impl/prd13-looks.test.ts`. A test-registered rule's findings appear in `diagnostics().look.lint`. A duplicate code throws. A lane-registered `look/ambient-flattens` replaces the default without a throw.
- [ ] [E] T1.6 (after PR 0b-1) In the carved `looks/generatedCodeWarnings.ts`: with `A3D_QR_LOOKS` on, replace the no-lights line with the `lookLint` `look/no-lights` text and append the other lint warnings. With the flag off, keep the legacy text byte-identical. Update the matches in `tools/agent-dogfood/index.ts`. Run `rg -n "lights.ambient\(\)" packages tools apps --glob '!**/node_modules/**'` and file a request for every hit outside PRD 13's paths. Test: flag-on no-lights warnings contain the exact `look/no-lights` message and no "lights.ambient"; flag-off warnings equal the `85aafcd0` text (C-34 conformance).
- [ ] [E] T1.7 (PR 0b-1) The carve of `index.ts:10103-10363` into `agent-api/nodes/prompt/{promptPlan,promptRecipes}.ts` is verbatim, with `index.ts` re-exporting (CONTRACTS §3.2, R7). Whichever agent executes PR 0b-1 does it. If the PRD 13 agent is first, it executes exactly this carve under the §3.9 rules (byte-identical bodies, `import type` only, moved line counts equal). Types `:10007-10102` are not moved. Test: the existing prompt-plan unit tests pass unchanged and `pnpm check:public-api` shows no surface diff.
- [ ] [E] T1.8 `nodes/prompt/promptPlanMappings.ts` (new, day 0): lighting→look, environment keyword→look, style→grade, camera→rig/fallback, effect→builder|reject tables (§6.3), each exported as frozen data. Test: a table-driven test covering every key, plus "unmapped" cases.
- [ ] [E] T1.9 (after PR 0b-1) Rewrite the 4 `promptRecipes` in `nodes/prompt/promptRecipes.ts` to take an optional `look`. They contain no `lights.ambient`, no primitive HUD (the mini-game recipe's health pips/timer/objective bars are deleted), and no emissive "wet reflection"/"puddle streak"/"rain splash" primitives. Ground uses a textured material preset. The legacy recipe bodies remain as the flag-off path. Test: flag-on snapshot census per recipe has ambient count 0, 0 nodes whose names match `fakeEffectNames`, and 0 `lookLint` errors. Flag-off census equals today's.
- [ ] [E] T1.10 `compilePromptPlanV2(plan, options)` and the flag-on path of `compilePromptPlan`. Resolve the look (`plan.look` > environment > lighting > sceneType default). Apply camera, style grade and effects. Collect `rejected`. Throw `AuraPromptPlanError` in reject mode. Compute `visualSystems` from the compiled snapshot census and `repairHints` from `lookLint`. Fill the 1.0-named fields. Test: `tests/unit/agent-api/prompt-plan-v2.test.ts`. (a) `product-viewer` + `effects:["rain","fog"]` in warn mode → fog applied; rain in `rejected` while C-20 reports it only as `sim: "primitive-pool"`; `visualSystems` lacks "rain effect". (b) Reject mode throws `unsupported-effect`. (c) `environment:"misty forest at dusk"` → `golden-hour`. (d) The 500-plan property test (Phase 2 exit). (e) With the flag off, `compilePromptPlan` output deep-equals the `85aafcd0` output for the existing fixtures.
- [ ] [E] T1.11 (after PR 0b-1) `looks/structuralQA.ts`: the carved validators gain the additive `deprecated: true, kind: "structural-name-heuristic"` keys, and the new `structuralQA` namespace has the renamed keys of §7.4. File Q-04-1 and Q-15-2 for the JSDoc. Test: `tests/unit/agent-api/structural-qa.test.ts`. Every `visualQA` returns its old keys plus `deprecated: true`, and `structuralQA.*` returns new keys only.
- [ ] [E] T1.12 Bundle delta: `tests/qr/prd13/bundle-delta.test.ts` bundles `packages/engine/src/lanes/prd13.ts` with esbuild (minify, gzip) and asserts ≤ 9 KB gz (looks 4 + lint 3 + mappings 2). File Q-11-1 to add the entry to `tools/bundle-size`. Test: the delta test is green in `qr-prd13-authoring.yml`.
- [ ] [E] T1.13 (after PR 0b-1) Register the C-31 `"look"` section and the C-36 `"look"` NodeHandler (v1 expansion compiles into C-09/C-13/C-26 contributions when their slots are real; with stubs it records `capability-degraded` and falls back to emitting the v0 children). Call `provide()` for C-34 in `src/lanes/prd13.ts`. Test: `C-34-looks.test.ts` passes for `stub` and `real`; `C-36-compiler.test.ts` flag-off byte-equal RenderSource stays green.


### 16.3 Phase 3 (day 0, parallel): skills, llms, docs, CLI

- [ ] [S] T2.1 `packages/aura3d-cli/skills/AUTHORING.md`: required body sections for core/scene/game/materials/character/art-direction skills become `Look target`, `Establish the contract`, `Procedure`, `Look-dev loop`, `Stop and report`, `References`. Line 21 (benchmark branch) becomes: "Benchmark mode: if `aura3d look capture` is available, run the look-dev loop; otherwise build and stop and label the result `prototype`." Add an allowed-links entry for `https://threejs.org/examples/`.
- [ ] [G] T2.2 `tools/agent-skills/check.ts`: (a) enforce the section order from T2.1 for the listed skills; (b) run `craft-ratio.ts` and fail below the §6.5 targets; (c) fail any fenced code block that contains `lights.ambient(` without `environments.`/`looks.`/`world.biome` in the same block; fail `qualityProfile`, `pixelRatio:`, `safe-basic`, `softKnee`, `antiAlias({ mode: "fxaa"`, `replaceTextures: true` or `@aura3d/lean` in code blocks; (d) fail `visualQA(` outside `failure-gallery.md`; (e) allow threejs.org/examples links in `checkLink`. Test: `tests/unit/tools/agent-skills-check.test.ts` fixtures per rule.
- [ ] [S] T2.3 New `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` (≤ 150 body lines). Frontmatter description: "Sets the visual target and runs the look-dev loop for any Aura3D scene or game: genre look recipe, reference frames, look preset, capture, rubric judgement and iteration. Use when starting or finishing any scene, game, product viewer or template, or when a screenshot looks flat, dark, empty, floaty or placeholder-like." Body: look brief → recipe row → `looks.preset` → assets → camera framing → capture/judge loop → the 12-item hard checklist (IBL on, key shadow full strength, DPR ≥ min(dpr, tier cap), background not void or declared, fog/atmosphere for depth, grade via output preset, subject 15–70% of frame by genre, no pure-primary primitives, characters animated, HUD in DOM, no overlay, lint clean).
- [ ] [S] T2.4 `aura3d-art-direction/references/look-recipes.md`: 13 genre tables per §6.5 with numeric values. Platformer row: `outdoor-day`, follow2d, fov 50, subject 18–25% height, key elevation 48° azimuth 35° (3/4 front), palette saturated greens/sky blue/warm wood + coin gold accent, fog density 0.0025, `daylight-outdoor` post, VFX = coin sparkle + land dust, refs = three `webgl_animation_skinning_blending` (character lighting) plus, once on main, the C-30 v2 outdoor reference scene and a refs-store platformer still. Write the other 12 rows at the same density. Test: `check.ts` row-density rule (≥ 80% of rows contain numbers or API names).
- [ ] [S] T2.5 `references/quality-bar.md`: 12 categories (§7.6) with anchors 2/5/7/9 as observable descriptions (e.g. shadows: 2 = "no visible shadow, objects float"; 5 = "shadow visible but grey/soft, no contact darkening"; 7 = "dark contact shadows grounding every object, soft falloff"; 9 = "cascaded, stable, contact + AO, matches the reference"). Test: `aura3d look rubric` prints it, and `check:skills` verifies all 12 categories are present.
- [ ] [S] T2.6 `references/reference-frames.md` and `references/failure-gallery.md` per §6.5. Reference-frame images link only to licensed files in `benchmarks/quality-rebuild/refs/` (PRD 12-owned, read-only) by absolute GitHub URL, and only once those files are on main. Until then, frames are threejs.org example names plus "what you should see" text, which is a complete deliverable. Test: link check.
- [ ] [S] T2.7 Rewrite `aura3d-core/SKILL.md`. Hello world becomes `scene().add(looks.preset("product-studio")).add(model(assets.robot))` with `...looks.appOptions("product-studio")` spread into `createAuraApp` (switches to `scene().look(...)` only after Q-15-1 lands and a verified row says so). Routing table puts `aura3d-art-direction` first for any visual task. Claim content is one line linking boundaries. Test: craft-ratio for this file meets craft ≥ evidence.
- [ ] [S] T2.8 Rewrite `aura3d-browser-game/SKILL.md`: genre → recipe row → template → look-dev loop. Mechanics gates kept as one table. The evidence steps (current 7–10) are replaced by a one-line link to evidence-review. Delete the `lights.studio()`-only sample (`:35-41`). Test: game-path craft ≥ 2× evidence.
- [ ] [S] T2.9 Rewrite `aura3d-scene-authoring/SKILL.md:22-24, 76-81`: drop "Add only prompt-required customization"; "`visualSystems` lists what the compiled scene contains; `rejected` lists what the engine could not do"; repair from `repairHints` + `look lint`; the loop.
- [ ] [S] T2.10 Rewrite `aura3d-evidence-review/SKILL.md:44-49, 53-56, 77-78, 89-91`: visual rounds ≤ 6, highest-leverage fix, `structuralQA` is not acceptance, claim labels live here only, "could not capture" → `prototype` stays but must say which loop step failed.
- [ ] [S] T2.11 `aura3d-materials-environments`: lead with looks/biomes/env presets, then HDRI admission. Add it to every game template in `manifest.json` (§7.7) and add `aura3d-art-direction` to `coreSet`. Test: the `check.ts` init smoke asserts that `selectSkills(manifest,"core","mini-game")` includes art-direction + materials-environments.
- [ ] [S] T2.12 Apply `verified` C-40 rows (CONTRACTS Appendix B; today F-01-01, F-02-01, F-07-01 and F-11-01 are all `proposed`, so they are not yet written as fact) to `aura3d-game-art`, `meshy-cli` (`:56-66` profile ceilings), `aura3d-performance`, `aura3d-threejs-migration`, `aura3d-character-animation`, `aura3d-retexture`, `aura3d-assets`, `aura3d-animation-studio`. Re-run weekly after each checkpoint. Each skill gets a one-line boundary link, and evidence restatements are removed. Each fact sentence carries an HTML comment `<!-- C-40:F-NN-MM -->`. Test: `check:skills` fails if a skill cites a row id that is not `verified` in Appendix B.
- [ ] [S] T2.13 Rewrite `llms.txt` per §6.6 (≤ 260 lines). Keep the `Release integrity rules:` block tokens. Then `pnpm skills:sync`. Test: `check:skills` (mirror + tokens) + craft-ratio llms craft ≥ evidence.
- [ ] [S] T2.14 Docs: amend `docs/agents/no-hackjob-rules.md:45-46`, `build-playbook.md:141-151`, `benchmark-recipes.md:4`, `game-example-standards.md` (visual bar), `README.md:82`, `agent-context.md:23`; create `docs/agents/art-direction.md` from `cinematic-scene-quality.md` plus API values; redirect stub; link `docs/project/showcase/visual-quality-standard.md`; `docs/guides/build-a-browser-game.md` gets look steps. Test: `pnpm check:agent-docs`.
- [ ] [C] T2.15 Agent instruction text without editing PRD 05's `packages/aura3d-cli/src/index.ts:3642-3668` (`genericAgentText`): (a) write the canonical text in `packages/aura3d-cli/skills/agent-files/AGENTS.md` (T2.2 makes `check.ts` and `skills:sync` skip `agent-files/` as a non-skill directory): "Read ./llms.txt first. Read the `aura3d-art-direction` skill. Every scene gets a look. Run the look-dev loop (`aura3d look capture` → judge → iterate) before calling a scene done."; (b) ship it as `AGENTS.md` and `.claude/CLAUDE.md` in every template; (c) file Q-05-1 asking `genericAgentText` to load (a). Test: `check:templates` asserts every template's agent files equal (a) byte-for-byte; `tests/unit/create-aura3d/templates.test.ts` snapshot.
- [ ] [C] T2.16 `packages/aura3d-cli/src/look/capture.ts`: `--runner gh-actions` dispatches `.github/workflows/aura3d-lookdev.yml` in the user's repo via `gh workflow run` (uses the user's existing `gh` auth; never sets tokens), polls, and downloads artifacts to `dist/lookdev/<round>/`. `--runner local` launches the project's Playwright, only where the user's environment allows it. Prints PNG paths, `appliedLook.json` and `lint.json`. Registered as C-39 command `look capture` in `src/commands/prd13/index.ts`; help is generated by the C-39 registry, so `cli-help.ts` is not edited. Test: `tests/unit/cli/look-capture.test.ts` with mocked `gh` and fs; CI e2e on `product-viewer`.
- [ ] [C] T2.17 `look/judge.ts` + `look/rubric.ts`: schema validation of `LookJudgement`, aggregates, weakest category, and a next-change hint drawn from `look-recipes.md` keyed by category + lint codes. `--judge prism` calls C-32 `judgeWithPrism` (no new provider code) and exits 2 with `judge-unavailable` if the export is absent. Registered as C-39 `look judge` / `look rubric`. Test: fixtures for valid, missing observations for a score < 7, out-of-range score, unknown category, and `AGENT_LOOK_CATEGORIES ⊆ GAME_VISUAL_CATEGORIES`.
- [ ] [C] T2.18 `look/lint-static.ts` as C-39 command `look lint`: TypeScript AST scan for ambient-without-env, renderer overrides, lean imports, capture branches, constant evidence literals (`routeAlignedToVisibleTrack: true`-style `true` literals in evidence objects), and overlay defaults. Plus every rule registered through C-39 `registerDoctorRule` (PRD 08 feel/evidence-only, PRD 09 capture-branch). PRD 13's default capture-branch rule is used if PRD 09 has not registered one. Also register codemod `look-from-ambient` (§11.5) with `registerCodemod`. File Q-05-2 for the `doctor --look` alias. Test: `tests/unit/cli/look-lint.test.ts`. Fixtures from the current `racing-starter` and `mini-game` are flagged, the rewritten templates are clean, a test-registered doctor rule runs, and the codemod is pure on a fixture.
- [ ] [T] T2.19 Ship `.github/workflows/aura3d-lookdev.yml` (macos-14, `workflow_dispatch` only, no secrets) in every template. Test: `check:templates` asserts its presence.

### 16.4 Phase 4 (day 0, parallel): templates, standalone on today's engine

For every template: import only `@aura3d/engine` (and `@aura3d/game` for game templates), add
`looks.preset(<§6.4 id>)` to the scene and spread `looks.appOptions(<id>)` into the app options, typed assets only
as subject, overlay off by default (`?debug=1` enables it), full-bleed canvas, DOM HUD, no constant evidence values,
no adoption props, no `?capture` branches, the screenshot test rewritten per T3.12. `package.json` depends on
`@aura3d/engine`, so `assets typegen` emits engine imports (`asset-manifest.ts:112-125`). Templates set
`qualityRebuild: { flags: [...] }` to the list of other lanes' flags that are in `standalone-accepted` at the time
of the PR (initially empty).

- [ ] [T] T3.1 `mini-game`: rewrite `src/main.ts` on C-24 `createGame` from `@aura3d/game` (stub wraps `createGameApp`; engine path, no lean). Hero `model(assets.showcaseKenneyOobiPlatformerHero)` plays idle/run/jump/fall from the GLB clips through the C-19 handle (`crossFadeTo`; the stub switches immediately) and yaws toward the travel direction. The camera follows every frame through `app.camera.use(camera.rigs.fromSpec(...))` plus `app.camera.setPose` (C-22 stub-real members); the state is applied to the camera, not to evidence. Platforms come from the best typed catalog kit via `assets resolve "low poly platformer platform kit"` (swap to a PRD 05 curated kit when its C-40 row is verified, Q-05-3). Coins are models with emissive 3–5. Look `outdoor-day`. Delete the `cameraRig.follow` evidence-only call (create-aura3d copy `:214`). Test: `playable.spec.ts` (collect, hazard, reset) + floor check + `tracksApplied > 0` (report-only while C-19 is a stub).
- [ ] [T] T3.2 `racing-starter`: delete ribbons (`:50-55, 220-225`), the gantry (`:227-255`), constants (`:43-48, 321-335`) and the overlay (`:109-113`). Look `golden-hour`. Chase camera behind the car at fov 60, car at real scale (remove 0.18 scale unless the asset requires it; document the asset's metres). Evidence reports `certify-game-geometry` output, not constants. Test: playable + floor + `look lint` clean.
- [ ] [T] T3.3 `falling-blocks-starter`: replace the per-cell box with one instanced bevelled-cube mesh from a typed bevelled-cube GLB (catalog or authored once and admitted into the template), glossy PBR per piece colour from the `neon-arcade` palette, board frame model. Line clear uses a model-based flash while C-20 is primitive-pool. Look `neon-arcade`. Test: playable + floor (background exception false: night-city sky gradient).
- [ ] [T] T3.4 `fighting-game`: look `arena-fight`, overlay off, rim spot kept, fighters animated (existing controller path on engine), fix HUD-only director output (`:322, :361`) so the director drives the camera. Test: playable + floor + F-7 clean.
- [ ] [T] T3.5 `character-controller`: full-bleed canvas (delete `:51-53` 320 px stage), DOM HUD replaces `<pre>` (`:44`), drop ambient (`:60-61`), look `outdoor-day`, shoulder camera, locomotion clips. Test: playable + floor.
- [ ] [T] T3.6 New `arena-shooter` template: typed ship + drone + planet models, topDown camera at 60°, waves (spawn cadence 1.8 s, shield segments 5; values chosen here and offered to PRD 14 Orbital Defense, which may diverge), look `space`, built on C-24 `createGame`. C-20 particles only when pixel-backed and not `primitive-pool`, otherwise model-based muzzle flashes, never primitive spheres. Add to `package.json` files, `CREATE_AURA3D_TEMPLATES`, `manifest.json`. Test: route-health + playable + floor.
- [ ] [T] T3.7 `product-viewer`: engine import, look `product-studio`, orbit autoframe (subject 45–70% height), delete adoption props (`:13-17`), ground contact shadow. Test: floor + regression against `benchmarks/agent-eval/baseline/templates/product-viewer/` (G-REG ingestion is Q-12-2).
- [ ] [T] T3.8 `cinematic-scene`: `promptPlanToScene(plan, { unsupported: "reject" })` with a plan whose fields are all supported. The template test asserts `report.rejected.length === 0` and `visualSystems ⊆ census`.
- [ ] [T] T3.9 `three-compat-*` (8): per the §6.4 table. `premium-product-viewer` hero becomes a typed Khronos sample GLB (catalog `assets resolve "khronos damaged helmet"` or similar licensed sample; record provenance). Each template's README names the three.js example it mirrors. Test: floor for all 8.
- [ ] [T] T3.10 Animation templates (4): stage setup uses `character-showcase` / `interior-warm` looks. No other change. Test: floor static checks only (runtime floor for the default stage frame).
- [ ] [T] T3.11 `packages/create-aura3d/src`: no change to the `showcase-spec-*` compilers (out of scope), but `CREATE_AURA3D_TEMPLATES` gains `arena-shooter`. Test: `tests/unit/create-aura3d/templates.test.ts`.
- [ ] [G] T3.12 Rewrite every template `tests/screenshot.spec.ts`. Delete the palette counts (`mini-game/tests/screenshot.spec.ts:24-66`). Assert: canvas non-blank; `diagnostics().look.lint` has no `error`; `appliedLook.environment.specularIntensity > 0` (unless the look has no env); `shadows.strength ≥ 0.8` when a key exists; `pixelRatio ≥ min(dpr, tierCap)`; subject bbox coverage within the look framing range (±10%). Regression against the PRD 13-stored baselines; PRD 12 G-REG takes over when Q-12-2 lands. These are regression and hygiene gates, never quality claims. Test: runs in `template-lookdev.yml`.
- [ ] [G] T3.13 `tools/agent-templates/look-floor.ts` + wire into `check:templates` (static part in PR CI; runtime part on macos-14 in `template-lookdev.yml`). Test: `tests/unit/create-aura3d/look-floor.test.ts` (fixtures: a lean template fails, an ambient-only template fails, a rewritten template passes).
- [ ] [T] T3.14 Root `templates/` (PRD 13-owned, CONTRACTS §3.8): run `rg -n "templates/" tools scripts .github package.json --glob '!packages/create-aura3d/**'`. If no consumer reads root `templates/`, delete it. Otherwise make it a generated mirror via `tools/agent-templates/sync-root-templates.mjs` (copy from `packages/create-aura3d/templates`, `--check` mode wired into `check:templates`). The same applies to `examples/` if it copies template sources. Test: `sync-root-templates.mjs --check` green, or the directory is gone and `pnpm check:templates` passes.

### 16.5 Phases 5–7 (integrated; triggered by checkpoint observations, never preconditions)

- [ ] [E] T4.1 When the C-09, C-13/C-05 and C-27 slots are provided (observed in the checkpoint `missingContracts` report): run `looks.test.ts` with those flags on, confirm that studio looks pick v1, and make `looks.appOptions` return `{}` for them. Test: looks unit test with the real lane barrels imported (conformance harness `real` label).
- [ ] [E] T4.2 When `capabilities.ambientAdditive` is true (C-09 real + `A3D_QR_LIGHTING` on) and F-02-01 is `verified`: `look/ambient-kills-ibl` is inactive, and the skills drop the "ambient disables IBL" warning (keeping "prefer hemisphere"). Test: lint test with the capability on; `check:skills` row-citation check.
- [ ] [T] T4.3 When `A3D_QR_GAME` and `A3D_QR_CAMERA` reach `standalone-accepted`, the 6 game templates add `"game","camera"` to `qualityRebuild.flags` and swap `fromSpec` follow code for `camera.rigs.chase|follow2d|fighting|shoulder|topDown` per verified F-08 rows, using the sound, touch and HUD-theme options of verified F-09 rows. Once an F-06 row for `tracksApplied` is verified, `characterExpected` becomes blocking in the floor. Test: template tests assert 0 capture branches, 0 synth cues, and that the camera pose changes when the player moves.
- [ ] [E] T4.4 When the C-26 slot is provided and `A3D_QR_WORLD` is on: biome looks compile v1 through the `"look"` handler. Delete the v0 entry for each id whose v1 passes the template floor at a checkpoint. Test: `diagnostics().look.expansion === "v1-contracts"` for every template with those looks under `qr_flags=all`.
- [ ] [V] T5.1 At each G-PANEL round (IC-4, IC-8, …): submit templates for golden approval (I3) and run agent-eval round N (I4) through Q-12-1. File every prompt with median < 6.5 as a `qr-ic-regression` against the lane named by dominant cause.
- [ ] [T] T6.1 When PRD 14 publishes accepted pilot patterns (Q-14-1 rows): port them into templates (Turbo → racing, Aura Clash → fighting, Orbital → arena-shooter, Bank → product/interior recipe). Re-run the next round (I5).
- [ ] [E] T7.1 At `A3D_QR_LOOKS` removal (CONTRACTS §5.4): make `unsupported: "reject"` the default and delete the flag-off branches in PRD 13 files. Removal of `visualQA` properties, the 1.0 report type and `"hud"` goes through Q-15-3. Test: `check:public-api` diff matches the 4.0 removal list.
- [ ] [C] T7.2 Run codemod `look-from-ambient` (registered in T2.18) over `packages/create-aura3d/templates/**` and `examples/**` and publish its report. PRD 14 runs it on routes by its own choice. Test: fixtures (ambient-only scene → look + TODO); template run yields 0 rewrites.

---

## 17. Test requirements

All browser, GPU and capture tests run remotely on GitHub Actions **`macos-14`** (ANGLE Metal, the
`quality-rebuild-capture.yml` pattern, reference run 37289688772). Never SwiftShader/ubuntu for any visual
assertion. Never local browsers or local Docker. Unit tests run under `vitest` in CI. Locally, only typecheck and
`pnpm exec vitest run <file>` for the narrow unit files touched.

### 17.1 Unit (vitest)

- `tests/unit/agent-api/looks.test.ts` (T1.1–T1.3): ids (`satisfies` the C-26 + C-34 unions), v0 invariants (no
  ambient, shadow true, background luma), expansion selection under `A3D_QR_LOOKS_EXPANSION` and slot test doubles,
  overrides clamping, multiple-look warning.
- `tests/unit/agent-api/look-lint.test.ts` (T1.4–T1.6): one positive and one negative fixture per rule; capability
  gating; exact messages; flag-off legacy text identity; no "lights.ambient" suggestion text with the flag on.
- `tests/unit/agent-api/prompt-plan-v2.test.ts` (T1.8–T1.10): mapping tables; warn vs reject; report 2.0 via
  `compilePromptPlanV2`; 1.0-shape honesty via `compilePromptPlan` with the flag on; flag-off deep-equality with
  `85aafcd0` fixtures; 500-plan property test (`fast-check` if already a dev dependency, otherwise a seeded
  generator in the test file, no new dependency).
- `tests/unit/agent-api/structural-qa.test.ts` (T1.11).
- `tests/unit/contracts/impl/prd13-looks.test.ts` (T1.5, T1.13). The PRD 15-owned conformance suites
  `C-34-looks.test.ts`, `C-31-diagnostics.test.ts`, `C-36-compiler.test.ts` and `C-39-cli.test.ts` must stay green
  for `stub` and `real`.
- `tests/qr/prd13/bundle-delta.test.ts` (T1.12).
- `tests/unit/tools/craft-ratio.test.ts` (T0.7), `agent-skills-check.test.ts` (T2.2), `agent-eval-prompts.test.ts`
  (T0.3), `tests/unit/cli/look-capture.test.ts`, `look-judge.test.ts`, `look-lint.test.ts` (T2.16–T2.18).
- `tests/unit/create-aura3d/templates.test.ts` (extended: 20 templates, manifest coverage, agent-file identity),
  `look-floor.test.ts` (T3.13).

### 17.2 Browser / GPU (macos-14)

- `tests/browser/template-look-floor.spec.ts`: builds each template from packed tarballs, mounts it, reads
  `diagnostics()`, asserts the runtime floor (§7.5), and captures the 3 shots × 2 viewports for the panel.
- Per-template `tests/screenshot.spec.ts` (T3.12) and `playable.spec.ts` / `route-health.spec.ts` (kept, run in
  `template-lookdev.yml`).
- `tests/browser/looks-expansion.spec.ts`: renders `scene().add(looks.preset(id)).add(model(DamagedHelmet))` for all
  15 looks at Medium, with flags `none` (v0) and, once slots are real, `all` (v1). Asserts non-void background luma, specular present on the metal mask (centre-region luma variance
  above a threshold calibrated so that a broken control with IBL off fails), and a shadow region darker than its
  surroundings. These are regression signals, not quality.
- `tests/browser/prompt-plan-render.spec.ts`: for the 4 recipes × 3 plans, the captured frame plus
  `report.visualSystems` go into the vision honesty check (S3).

### 17.3 Workflows

- `qr-prd13-authoring.yml` (lane workflow, macos-14): unit files of §17.1, the browser specs of §17.2 except the
  full template capture, and `check:skills` / `check:templates`. Runs on PRs labelled `lane:prd13` and on push to
  main. No secrets on `pull_request`.
- `template-lookdev.yml` (T0.2): push to main on template paths + dispatch.
- `agent-output-eval.yml` (T0.5): dispatch + weekly on main. Secrets (Prism key) only in jobs that never run
  untrusted PR code. Before adding or changing any workflow, read
  `/Users/gurbakshchahal/.config/agent-policy/reference/ci-selection.md`.
- `check:skills`, `check:templates` (static floor) and unit tests also run in the existing PR CI (`qr-contracts.yml`,
  `ci.yml`, both owned by PRD 15, unchanged).

---

## 18. Visual acceptance tests

Protocol: the `_sections/E` scoring protocol with the C-32 rubric. Remote capture at the default URL only (G5);
calibration set first; vision model via Kiro Prism + named humans; median; spread > 2 reconciled; admitted loss
fails. Vision alone never passes an item. Engineering gates (§17) never count toward these.

### 18.1 Standalone acceptance (this lane alone, today's engine, every other contract on its stub)

Passable with v0 looks, flags `none` for other lanes, and PRD 13's own flag on. Items marked **merge gate** are
automated and gate every PRD 13 PR. The judged items gate the Phase 4 exit and the move of `A3D_QR_LOOKS` to
`standalone-accepted` (CONTRACTS §5.3). They are lane reviews recorded as screening. They are never a parity claim,
and they never require another lane's real implementation.

| Id | Scenes / items | Reference | Judged criterion | Threshold | Review |
|---|---|---|---|---|---|
| S1 | All 20 templates, desktop + mobile, 3 shots | Each template's own 3.0.1 baseline (Phase 1), blind A/B | `overall_visual_quality` and the 12 agent categories | Game templates + product-viewer: median gain ≥ **+1.5** overall; no category drops > 0.5 vs baseline | vision + ≥ 1 named human |
| S2 | 6 game templates | research/21 games (same rubric) | overall; shadows; ibl_reflections; environment_world; atmospheric_effects | median overall ≥ **4.5**, none < 4.0; ibl_reflections ≥ 4.5; environment_world ≥ 4.5; atmospheric ≥ 4.0; shadows ≥ 3.5 (the v0 ceiling under the C-11 stub's legacy strengths) | vision + ≥ 1 human |
| S3 | 4 recipes × 3 plans (12 frames) | The plan's own `report.visualSystems` and `rejected` | "Does the frame show every listed system, and none of the rejected ones?" | **12/12** agree (any judge disagreement fails the item). The automated half (`visualSystems ⊆ census`) is a **merge gate** | vision + 1 human |
| S4 | Lint discrimination: 18 shipped game sources + 19 baseline templates + 4 broken controls (ambient-only, `pixelRatio: 1`, solid void, primitive hero) injected into a rewritten template | research/21 category scores | lint flags ≥ 1 error on every game with ibl_reflections ≤ 2 or shadows ≤ 2; 0 errors on rewritten templates; each broken control flagged with its specific code | 100% / 0 / 4 of 4 | **merge gate** (automated) + human spot-check of 5 |
| S5 | Skills/llms text | research/12 §1.2 numbers | craft-ratio targets of §6.5; only `verified` C-40 rows cited | all met | **merge gate** (automated) + art-director read-through of the art-direction skill (signed note in PR) |
| S6 | `aura3d look capture` on product-viewer and mini-game via gh-actions | — | PNGs + appliedLook returned | ≤ 8 min per round, 3 consecutive successful runs | automated |
| S7 | Agent-eval pilot: P01, P06, P08, P12 × 1 seed with new skills/templates, today's engine | round-0 frames for the same prompts | panel overall | median ≥ round-0 median **+1.5**; A3 escapes = 0; A4 dishonest = 0 | vision + ≥ 1 human |
| S8 | 8 three-compat templates | The named three.js r185 example captured by PRD 13's `capture-templates.mjs` on macos-14 from the threejs.org example page | Overall vs 3.0.1 baseline; gap to three noted | each ≥ baseline + **1.5**; the gap to three is recorded, not gated, and never claimed as parity | vision + 1 human |
| S9 | Flag-off identity | `85aafcd0` | `compilePromptPlan` outputs, `:18256` warning text, prompt recipe census, C-36 RenderSource of the 18 base snapshots with flags `none` | byte/deep-equal | **merge gate** (automated) |

### 18.2 Integrated acceptance (evaluated only at CONTRACTS §7 checkpoints; never blocks starting or merging)

Each item names the contracts whose real implementations it needs. It is evaluated at the first G-PANEL round
(IC-4 = 2026-11-05, then every 4th checkpoint) at which those slots are provided and their flags are on in
`qr_flags=all`. Until then it is reported as `pending:<contract list>`.

| Id | Needs (real) | Items | Reference | Criterion | Threshold |
|---|---|---|---|---|---|
| I1 | C-05, C-09, C-10, C-11, C-13, C-27 | product-viewer template with 10 Khronos samples (bar list) | three r185 RoomEnvironment + ContactShadows | Product bar (`_sections/E`) | panel ≥ **7.0** and ≥ three − 0.5 on each sample |
| I2 | I1 set + C-19, C-22, C-24, C-26 | 6 game templates (desktop + mobile) | research/21 rubric | overall; min category; mobile_presentation | each ≥ **6.0**; no category < 4.5; mobile_presentation ≥ 5 |
| I3 | I2 set + C-20, C-21; C-30 v2 references | All 20 templates | v2 reference scenes + premium refs | Bar per domain | game templates median ≥ 6.5; product ≥ 7.0; character templates ≥ 6.5; environment-led templates ≥ 6.5; goldens approved |
| I4 | I3 set | Agent eval round (12 × 3) | calibration set; round 0 | A1–A4 | A2 median ≥ **6.5**, no prompt median < 5; A3 = 0; A4 = 0 |
| I5 | I3 set + C-35 pilot records (Q-14-1) | Next agent eval round + game templates | same | A1–A4 + G1 for game templates | I4 holds; game templates ≥ **7.0** overall, no category < 5 (G1/G2) |
| I6 | `A3D_QR_LOOKS` `default-on` | release-candidate round + templates | I5 records | no regression | every item within 0.5 of I5 and I4/I5 thresholds still hold |

### 18.3 The 12 standard prompts (A1)

| Id | Category | Prompt text (verbatim in `prompts.json`) |
|---|---|---|
| P01 | product | "Build a product page hero for this sneaker (./sneaker.glb) that the visitor can orbit." |
| P02 | product | "Show a vintage film camera on a slowly turning stand, lit like a premium product shot." |
| P03 | product | "Make a car paint configurator with three paint colours and visible reflections." |
| P04 | character | "An animated knight idling and waving in a small stone courtyard." |
| P05 | character | "A robot walking in a loop on a stage while the camera slowly orbits it." |
| P06 | environment | "A misty pine-forest clearing at golden hour." |
| P07 | environment | "A cosy cabin interior at night lit by a fireplace and two lamps." |
| P08 | game: platformer | "A 3D platformer level: collect five coins and reach the flag." |
| P09 | game: racing | "A one-lap time-trial racing game on a coastal track." |
| P10 | game: fighting | "A one-versus-one arena fighting game with two characters." |
| P11 | game: arcade | "A top-down arena shooter in space with waves of drones." |
| P12 | cinematic | "A rainy neon street at night with a slow dolly toward a parked motorbike." |

The prompts contain no Aura3D vocabulary on purpose. Seeds vary the agent sampling seed and the catalog result
order. Game prompts are judged on the research/21 categories plus `controls`/`game_feel` from measured
play-through scripts (`tools/agent-eval/playthrough/<genre>.ts`: input sequence → assert state change).

---

## 19. Performance budgets per tier

The tier definitions and hardware are `_sections/E` "Performance tiers"; tier settings come from C-27
`QUALITY_TIERS` (real data in PR 0a). Tier values are targets until PRD 11 measures them on named devices. The
macos-14 runner is the Low-desktop proxy. Frame time and draw calls come from rAF timing and the C-28 counters (stub
partial; missing counters are reported `null`, never a constant).

| Budget | Low | Medium (default) | High | Ultra |
|---|---|---|---|---|
| Template frame rate (measured rAF p50 / p95 frame) | ≥ 55 fps on CI proxy / ≤ 22 ms; 30 fps floor mobile | 60 / ≤ 20 ms at 1080p | 60 / ≤ 20 ms at 1440p | 30–60; capture any |
| Look cost over a no-look scene (GPU) | ≤ 2.0 ms (PMREM 128, 1 cascade 1024², no AO, 3-mip bloom) | ≤ 3.5 ms (PMREM 256, 2–3 cascades 2048², SSAO half-res, 5-mip bloom, grade) | ≤ 5.5 ms | ≤ 9 ms |
| Template draw calls | ≤ 150 | ≤ 400 | ≤ 1,000 | ≤ 2,500 |
| Template first interactive frame / transfer | ≤ 3 s / ≤ 8 MB (1k HDRI, KTX2 ETC1S) | ≤ 3 s / ≤ 20 MB | ≤ 4 s / ≤ 40 MB | — |
| Look-lint CPU | ≤ 0.2 ms per snapshot change; 0 per frame | same | same | same |
| Look expansion CPU (snapshot) | ≤ 0.5 ms | same | same | same |

Bundle (gzip, published package, all tiers): root "." growth from this PRD ≤ 9 KB (T1.12). The template starter
budget `mini-game starter app before user assets` ≤ 250,000 B is kept. If engine-path templates exceed it, the
overage is reported to PRD 15 (Q-15-4) and recorded in `evidence/prd-13/bundle.md`. It is never met by removing
the look.

CLI/CI budgets: `aura3d look capture` round ≤ 8 min (S6); `agent-output-eval.yml` round ≤ 5 h wall, ≤ 36 agent
runs. A round over budget is reported, not truncated.

---

## 20. Browser coverage

| Browser / backend | Runner | What runs | Gate? |
|---|---|---|---|
| Chromium (ANGLE Metal) | macos-14 | floor, screenshots, captures, panel frames, agent eval | yes |
| WebKit (Playwright) | macos-14 | route-health, runtime lint, capture (report-only) | route-health yes; visuals report-only |
| Firefox (Playwright) | macos-14 | route-health, runtime lint | route-health yes |
| WebGPU | macos-14 Chromium flag | capture report-only (C-29 backend; parity is PRD 11's) | no |
| SwiftShader / headless ubuntu | — | never used for visuals | — |

---

## 21. Mobile coverage

- Every capture includes 390×844 at DPR 3 emulation. Recipes specify portrait framing (fov +8°, subject 25–40%
  height for games, HUD safe areas, thumb-zone touch controls).
- Game templates ship touch controls from day 0 through the C-24 `touch` option (the stub delegates to the existing
  `game.touchControls`, `index.ts:8250`), with on-screen buttons as DOM. Named `TouchPreset` layouts
  (`dpad-2btn`, `steer-pedals`, `twin-stick`) are used once a verified F-09 row exists.
- With `quality: "auto"`, the C-27 stub resolves `"medium"` on coarse-pointer devices. Picking Low on mobile-class
  GPUs needs the real C-27 probe (integrated). The v0 looks cap `pixelRatio` at 2. They never set 3.
- No mobile performance claim until PRD 11's real-device lane (AWS Device Farm) runs. The mobile budgets in §19 stay
  labelled "unverified" until then.
- `mobile_presentation ≥ 5` is part of I2 and I5. Standalone S1 and S2 include the mobile viewport.

---

## 22. Screenshots / evidence required

All evidence is bound to commit SHA + workflow run ID + asset hashes and stored as workflow artifacts. Indexes go
in `benchmarks/agent-eval/`, in `docs/project/aura3d-quality-rebuild/evidence/prd-13/`, and (via Q-12-1) in the C-32
history.
- Phase 1: 19 templates × 3 shots × 2 viewports (3.0.1 baseline, flags `none`) and the round-0 agent-eval frames with panel records.
- Each template PR: the 6 frames before and after, `appliedLook.json`, `lint.json`, and the floor result JSON.
- S3: 12 recipe frames with their reports, side by side.
- S4: lint output over the 18 game sources, the 19 baseline templates and the 4 broken controls.
- S7, I4–I6: per-run `src/**`, transcript, build log, the frames, `LookJudgement` files from the agent's own loop
  (shows the agent iterated), the escape-scan output and the A4 diff.
- No evidence from `?capture=review` or any capture mode that changes look parameters. Self-judgements are
  stored, but never as pass evidence.

---

## 23. Completion criteria

1. Standalone S1–S9 passed and recorded in `evidence/prd-13/` (this lane's bar for `standalone-accepted`). Merge
   gates S3 (automated half), S4, S5 and S9 are green on main.
2. `rg "@aura3d/lean" packages/create-aura3d/templates` = 0; `rg "lights\.ambient\(" packages/create-aura3d/templates/*/src` = 0;
   no template enables the overlay by default; no constant evidence literals (`aura3d look lint` clean on all 20).
   Root `templates/` is a checked mirror or deleted.
3. `compilePromptPlan` (flag on) and `compilePromptPlanV2` never report a system absent from the compiled snapshot
   (property test + S3).
4. With `A3D_QR_LOOKS` on, the `index.ts:18256` ambient suggestion is gone. No agent-facing text (skills, `llms.txt`,
   docs, template agent files) recommends `lights.ambient` as a fix.
5. `aura3d-art-direction` is installed for every template. Craft ratio targets are met in CI. Every fact sentence
   cites a `verified` C-40 row.
6. `llms.txt` is rewritten (≤ 260 lines, craft ≥ evidence, "don't claim" separated from "don't use").
7. The agent eval runs on schedule and has a round-0 baseline and at least one post-change round.
8. No file owned by another lane was modified by a PRD 13 PR (`tools/qr-ownership/check.mjs` green on every PRD 13
   PR). Open `qr-request` issues are listed in the checkpoint report, not treated as PRD 13 blockers.
9. Integrated I1–I6 are tracked in the C-32 history (`benchmarks/quality-rebuild/history/index.jsonl`). Program
   completion requires I4 and I5 to pass at a G-PANEL round. Until then, no README, skill or release note says agent
   output or templates reach three.js quality.

---

## 24. Rollback

- Engine behaviour: set `A3D_QR_LOOKS` off (`?a3d-qr=-looks`, `A3D_QR=-looks`, or `qualityRebuild: { flags }`). This
  restores the legacy warning text and 1.0 prompt-plan semantics with no code change. A flag-state change is made
  by PRD 15 at a checkpoint (CONTRACTS §5.3).
- New APIs (`looks`, `lookLint`, `structuralQA`, `compilePromptPlanV2`, `aura3d look *`) are additive, so reverting
  them is code removal with no data migration.
- Templates: republish the previous `create-aura3d` under the `latest` dist-tag. Users can always run
  `npm create aura3d@<prev>`.
- Skills/llms: the previous `@aura3d/cli` version restores them. `writeAgentSkills` never overwrites user-modified
  files.
- Eval workflows: disable via `workflow_dispatch` only. They never gate PRs.
- A PRD 13 PR that turns main red is reverted by anyone (CONTRACTS §6.1) and re-landed by this lane.

---

## 25. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v0 looks hit engine limits (C-11 stub shadow 0.32, 128 px env when no HDRI, no sky background) and S2 misses | medium | standalone bar missed | S2 thresholds are set at what v0 can reach. Shortfall categories are attributed to the C-09/C-11/C-13/C-26 provider by dominant cause and filed there, not patched with fakes |
| Looks duplicate C-26 biome rigs | medium | two lighting truths | Biome ids delegate wholesale in v1. Only 4 studio looks are defined here. v0 entries are deleted per id once v1 passes the floor (T4.4) |
| Two lanes edit `index.ts:18256` / prompt recipe lines | resolved | — | CONTRACTS R7/R8: both regions are carved into PRD 13 modules in PR 0b-1; PRD 02 contributes through `registerLookLintRule` and C-40 rows |
| PR 0b-1 drops a PRD 13 carve-out (size budget) | low | prompt v2 / lint text cannot change in place | new PRD 13 modules ship anyway (`compilePromptPlanV2`, `lookLint`, `structuralQA`); in-place change becomes Q-15-5 |
| Authoring-time v0/v1 choice disagrees with mount-time flags | medium | doubled or missing lighting | `options.flags` passed from templates; `look/expansion-mismatch` warning; the C-36 handler emits v0 children when its stubs are active |
| C-20 stub reports primitive-pool effects as pixel-backed | high | fake rain accepted | PRD 13 excludes `sim: "primitive-pool"` (§6.3) |
| Craft-ratio regex gamed by keyword stuffing | medium | fake compliance | Row-density rule plus the vision eval as the real measure. An art-director read-through is required for S5 |
| Agents self-judge too kindly | high | loop stops early | Hard lint checks must be clean. A self-judgement is never a pass. The panel judges the eval |
| Remote capture loop too slow or unavailable for users | medium | agents skip the loop | `--runner local` for users who allow it; lint + `appliedLook` give pixel-free feedback; failure → `prototype` label naming the failed step |
| Template asset size grows (HDRIs, kits) | medium | load budget | 1k HDRIs, KTX2 once a verified F-05 row exists, Low-tier budget gate in §19 |
| Eval cost (36 agent runs) | medium | infrequent rounds | Weekly schedule; the pilot subset (S7) for quick checks |
| Prism or the agent CLI changes behaviour between rounds | medium | noisy comparisons | Model/version pinned per round in `run.json`; calibration set every round |
| Removing the "don't use" reading makes agents claim unsupported features | low | false claims | Claims stay gated in evidence-review and boundaries; A4 checks report honesty |
| Skill text drifts ahead of real capabilities | medium | agents told about features that are still stubs | only `verified` C-40 rows are written as fact (T2.12 citation check) |
| Requests to other lanes are slow | medium | sugar/aliases/JSDoc missing | every request has a working "meanwhile" path (§14.6) |

---

## 26. Out of scope

- Any renderer, shader, lighting, shadow, post, material, texture, glTF, VFX, animation, camera-rig, world or tier
  implementation (the C-01…C-29 providers).
- Changing engine defaults when nothing is authored (C-09 neutral env, C-26 category biome, C-27 DPR).
- `@aura3d/lean` deletion and the starter bundle budget (PRD 15; Q-15-4).
- `sceneKits` lighting (PRD 02, R7) and kit content beyond lint compliance.
- Rebuilding the 18 games (PRD 14). Removing route `?capture=review` branches (PRD 09).
- The capture harness, golden store, panel tooling and calibration set (PRD 12). This PRD consumes them through
  C-32/C-33.
- The `packages/create-aura3d/src` `showcase-spec-*` proof compilers (8,634 lines). They are PRD 13-owned, but this
  program leaves them untouched. Deletion is a follow-up proposal and not a task here.
- Episode/animation-studio tooling beyond stage lighting.
- Marketing or README quality claims. None may be made from this PRD's gates.


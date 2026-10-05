# PRD 13: Agent Authoring, Skills, Templates, Quality Defaults

Status: draft for parallel execution. Branch base: `aura3d-quality-rebuild/audit`.
Research inputs: research/12 (agent-authoring autopsy), 06 (engine defaults), 13 (package architecture), 19
(claim verification, corrected statements only), 21 (authoritative game vision judgment), with 20/22/23 and
`_sections/D`, `_sections/E` for the bar. All line numbers were re-checked against the current checkout where
marked "(re-checked)". Everything else cites the research file that verified it.

This PRD owns what an agent reads, copies, and is graded on. It does not own renderer, lighting, post,
material, asset, animation, camera, VFX or world code. Those PRDs supply the capabilities and the facts. This PRD
makes the simplest authored code reach them, makes agents look at their output, and measures what agents produce.

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
| E17 | `packages/aura3d-cli/src/index.ts:3642-3668` | `aura3d init` writes `AGENTS.md` / `.claude/CLAUDE.md`: "Read ./llms.txt first … Run npm run build and the template route-health/screenshot tests before claiming the scene is done." Nothing visual. |

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
| E36 | `three-compat-*` (8) | Primitive heroes (premium-product-viewer hero is a sphere, `main.ts:14`). No env. Weaker than the three.js examples they stand in for (research/12 §3.4). |
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
| RC3. Defaults punish the old recipe | B defaults (fix owned by PRD 01/02/03) | Ambient kills IBL, shadows at 0.32, DPR 1. The agent cannot discover this because the docs never mention it. | E18-E20, E28 |
| RC4. The smart layer reports fiction | E authoring | Plan fields are ignored but reported. Repair hints are static. visualQA reads names. | E21-E27 |
| RC5. No visual feedback loop | G process | Agents are forbidden to look (benchmark), capped at 3 cheap rounds, and forbidden to iterate on looks. | E4, E12, E13 |
| RC6. Gates certify presence | G process | Template screenshot gates count palette pixels. visualQA counts names. Audits count grep hits. | E27, E32 |
| RC7. A starter on an inert runtime | F architecture (lean deletion owned by PRD 15) | The lean runtime drops lights and environments silently. | E31, E33 |
| RC8. No reference targets | G process | No art bible, reference frame, rubric or genre recipe exists anywhere an agent reads (research/12 §6). | — |

RC3 and RC7 are fixed in other PRDs. This PRD removes RC1, RC2, RC4, RC5, RC6 and RC8 from the authoring path, and
makes sure RC3/RC7 fixes actually reach authored code instead of being bypassed.

---

## 4. Affected packages

| Package | Change in this PRD |
|---|---|
| `@aura3d/engine` (`packages/engine`) | New `looks` namespace (composition only), new `lookLint` diagnostics, `compilePromptPlan` v2 (honour-or-reject), rewritten `promptRecipes`, `visualQA` → `structuralQA` deprecation, no-lights lint text. No renderer code. |
| `@aura3d/cli` (`packages/aura3d-cli`) | Skills (canonical source), `manifest.json`, `AUTHORING.md`, `llms.txt` mirror, `aura3d init` agent file text, new `aura3d look capture` / `aura3d look judge` / `aura3d doctor --look`. |
| `create-aura3d` (`packages/create-aura3d`) | All 19 templates move to the quality floor. New `arena-shooter` template (needed by PRD 14 Orbital Defense). Skills mirror. Template tests. |
| Repo docs | `llms.txt`, `docs/agents/*`, `docs/guides/build-a-browser-game.md`. |
| Tools | `tools/agent-skills` (craft-ratio gate, section gate), `tools/agent-templates` (look-floor gate), new `tools/agent-eval`, `tools/agent-dogfood` (report schema change). |
| Benchmarks | New `benchmarks/agent-eval/`. Existing `benchmark/` is frozen and its visual-QA output stops being cited as quality. |
| Not touched | `packages/rendering`, `packages/lean` (PRD 15 deletes it), shaders, `packages/materials`, `packages/environments`, asset CLI internals. |

---

## 5. Affected files and directories

Owned (written) by this PRD:
- `llms.txt` (root, canonical) and its generated mirror `packages/aura3d-cli/skills/llms.txt` (via `pnpm skills:sync`).
- `packages/aura3d-cli/skills/**`: all 13 skill directories, the new `aura3d-art-direction/`, `manifest.json` and
  `AUTHORING.md`. Mirrors `packages/create-aura3d/skills/**`, `.claude/skills`, `.cursor/skills`, `.agents/skills`
  and `.github/skills` are regenerated, never hand-edited.
- `packages/aura3d-cli/src/index.ts:3642-3668` (init agent-file text), `packages/aura3d-cli/src/cli.ts:229`
  (`doctor` dispatch, adds `--look`), `packages/aura3d-cli/src/cli-help.ts` (new commands), new
  `packages/aura3d-cli/src/look/{capture,judge,rubric,lint-static}.ts`.
- `packages/create-aura3d/templates/*` (all 19) and new `packages/create-aura3d/templates/arena-shooter/`.
  `packages/create-aura3d/package.json` `files[]`, and `CREATE_AURA3D_TEMPLATES` in `packages/create-aura3d/src/index.ts`.
- New engine modules (located per PRD 15's target layout, so the move is free):
  `packages/engine/src/agent-api/looks/{looks.ts,lookPresets.ts,lookLint.ts,index.ts}`,
  `packages/engine/src/agent-api/prompt/{promptPlan.ts,promptRecipes.ts,promptPlanMappings.ts}`.
  Re-exported from `packages/engine/src/agent-api/index.ts`. The old in-file definitions at `:10007-10345` are
  replaced by re-exports. The `:18256` warning is moved into `lookLint.ts`.
- `packages/engine/src/agent-api/index.ts:2721` and siblings (§2.2 E27): `visualQA` aliases marked deprecated.
- `docs/agents/{build-playbook,benchmark-recipes,no-hackjob-rules,game-example-standards,cinematic-scene-quality,README,agent-context,templates,verification}.md`,
  new `docs/agents/art-direction.md`, `docs/guides/build-a-browser-game.md`.
- `tools/agent-skills/{check.ts,shared.ts}`, new `tools/agent-skills/craft-ratio.ts`; `tools/agent-templates/index.ts`
  plus new `tools/agent-templates/look-floor.ts`; new `tools/agent-eval/**`; `tools/agent-dogfood/index.ts:145`
  (reads `visualSystems`).
- New `benchmarks/agent-eval/{prompts.json,README.md,rubric-agent.md,baseline/}`; new
  `.github/workflows/agent-output-eval.yml`; new `.github/workflows/template-lookdev.yml`.
- Tests: `tests/unit/agent-api/looks.test.ts`, `look-lint.test.ts`, `prompt-plan-v2.test.ts`;
  `tests/unit/create-aura3d/templates.test.ts` (extended), `tests/unit/create-aura3d/look-floor.test.ts`;
  `tests/unit/tools/craft-ratio.test.ts`; `tests/browser/template-look-floor.spec.ts`; each template's
  `tests/screenshot.spec.ts` (rewritten).

Read-only (consumed, not edited): `packages/lean/**`, `packages/rendering/**`, the other PRDs' new modules,
`tools/quality-gate/**` (PRD 12), `tools/quality-rebuild-capture/**`, `benchmarks/quality-rebuild/**`.

Handed off (flagged, not edited here): root `templates/*` (the drifted second tree). PRD 15 deletes it or makes
it a generated copy. Until then, `tools/agent-templates/look-floor.ts` reports drift and does not fail on it.

---

## 6. Architecture proposal

Seven parts. Each part names the other-PRD capability it composes. None of them adds rendering behaviour.

### 6.1 Scene looks: one line that reaches the quality floor

`looks` is an authoring-level composition layer. A look is plain data that expands into nodes and options other
PRDs own. It defines **no lighting values of its own** for any id that PRD 10 already defines as a biome rig.

```
looks.preset("outdoor-day")
  ├─ v1 expansion (contracts available)
  │    world.biome("outdoor-day")                  PRD 10: sky, IBL source, sun+CSM, fog, post spec
  │    output: { preset: "daylight-outdoor" }      PRD 03 (only if the biome rig has no post spec)
  │    quality: "auto"                             PRD 01/11 (DPR from tier, never safe-basic)
  │    framing hint → camera rig defaults          PRD 08 (subjectHeightFraction)
  └─ v0 expansion (today's engine, standalone)
       environments.hdri({ texture: autumn_field_puresky_1k })   E30
       lights.directional({ shadow: true, intensity, position })  E29
       effects.colorGrade / ambientOcclusion / bloom (tuned)      research/12 §1.3
       renderer: { qualityProfile: "production", pixelRatio: min(dpr, 2) }
       background: env-matched gradient colour + fog colour = horizon
```

Rules:
- **Look ids.** Biome ids pass through to PRD 10 unchanged: `outdoor-day`, `golden-hour`, `overcast`,
  `night-city`, `polar-night`, `alpine-snow`, `interior-warm`, `interior-neutral`, `interior-industrial`, `space`,
  `underwater`. This PRD adds only the looks no biome covers:
  - `product-studio`: PRD 02 `environments.preset("studio")`, key directional with shadow, ground contact
    shadow/AO, PRD 03 `product-studio` post, neutral gradient background.
  - `character-showcase`: studio env, key + rim spot, `arena-fight` post at lower contrast.
  - `arena-fight`: `interior-industrial` biome + PRD 03 `arena-fight` post.
  - `neon-arcade`: `night-city` biome with fog density × 0.5 + `neon-night` post.
- **Expansion selection** is automatic. `looks.ts` checks the export set at module init
  (`typeof world?.biome === "function"`, `environments.preset`, an `output.preset` option on `AuraAppOptions`).
  It uses v1 only when every contract it needs exists, and records which one ran in
  `diagnostics().look.expansion`. That is the stub strategy for parallel execution (§13).
- **Default look.** When the scene has no light, no environment, no biome and no look, this PRD does **not** pick
  one in the renderer. PRD 10's scene-category default biome and PRD 02's neutral environment do that. `looks`
  only exposes `looks.resolveDefault(snapshot)` so lint and reports can name what was applied.
- **Overrides** are typed and bounded: sun azimuth/elevation, exposure EV, fog density, a palette accent.
  Anything else requires dropping the look and authoring nodes directly. This keeps looks inspectable.
- **Tier-awareness** comes from PRD 11. A look never sets cascades, AO resolution or DPR. It declares intent;
  the tier decides cost (PRD 03 §6.8 pattern).

### 6.2 Look lint: the engine tells the agent what is wrong with the frame

`lookLint(snapshot, appliedLook?)` runs inside `app.diagnostics()` (warnings array, overlay, `app.evidence`) and
statically in `aura3d doctor --look` (AST over `src/**`). Each rule has a stable code, a one-line fix that names
an API, and a severity. The PRD 12 `AppliedLookReport` (`environment.specularIntensity`, `shadows`, `pixelRatio`,
`background`, `renderPath`, `fallbackLightsActive`) is the runtime input. Before PRD 12 lands, the rules read the
current diagnostics fields (`index.ts:1755-1798`).

| Code | Trigger | Fix text (exact) |
|---|---|---|
| `look/no-lights` | replaces `index.ts:18256` | "Scene has no authored lighting. Add `looks.preset(\"outdoor-day\")` (or another look) or `environments.preset(...)` plus `lights.directional({ shadow: true })`." |
| `look/ambient-kills-ibl` | ambient > 0 and no env node, **only while** the PRD 02 additive fix is absent (capability check) | "`lights.ambient` disables environment reflections in this engine version. Remove it and add a look or `environments.*`." |
| `look/ambient-flattens` | ambient intensity > 1 with an env present (PRD 02 rule, hosted here) | "Ambient above 1 flattens IBL; use `lights.hemisphere` or lower it." |
| `look/no-ibl` | `appliedLook.environment.specularIntensity === 0` | "No image-based lighting reached the frame." |
| `look/weak-shadow` | key light exists and shadow strength < 0.8, or no caster | "Key light has no full-strength shadow; set `shadow: true` or use a look." |
| `look/low-dpr` | `pixelRatio < min(devicePixelRatio, tierCap) - 0.01` | "Rendering below device resolution; remove `pixelRatio`/`qualityProfile` overrides." |
| `look/solid-void` | background is a solid colour with luma < 0.06 and no fog, unless the look is `space`/`interior-*` | "Background is a flat void; use a look with sky/HDRI background or add fog matched to the background." |
| `look/primitive-subject` | > 60% of visible draw items are primitives with untextured flat materials, or the subject node is a primitive | "Scene is mostly flat primitives; resolve real assets with `assets resolve` and keep primitives for set dressing." |
| `look/flat-palette` | ≥ 3 primitives with fully saturated primary hex colours (S > 0.85, V > 0.8) | "Pure primary colours read as placeholder art; pick from the look palette." |
| `look/double-aa` | FXAA requested on top of MSAA | "FXAA on MSAA softens twice; use `output` preset AA." |
| `look/debug-overlay` | `diagnostics.overlay: true` in a production build | "Diagnostics overlay is on in a shipped build." |
| `look/fake-effect-names` | node names matching the 41 fake-effect names (`"contact shadow"` primitives, `"reflection card"`, `"glow halo"`, `"wet reflection"`) | "This node imitates an engine feature; use the real feature." |
| `look/evidence-only-feel` | PRD 08 F-7 rule (camera/feel output never reaches pixels), hosted in `doctor --look` | PRD 08 text |
| `look/capture-branch` | `?capture=` / `?review` reads in route source (PRD 09/12 rule, static) | "Capture mode may change camera, clock, seed and scenario only." |

Lint is advisory at runtime (warnings). It is **blocking** only in this PRD's template gate and in the agent-eval
A3 check. Lint never produces a quality claim.

### 6.3 Prompt plan v2: honour or reject

`compilePromptPlan` keeps its signature and gains `options`. Every plan field is either applied to the scene or
rejected. `report.visualSystems` is computed from the **compiled scene**, never from the plan.

- `camera.preset` → a PRD 08 rig (v1) or a tuned `camera.perspective`/`camera.dolly` (v0): `product-orbit` → orbit
  rig, autoframe 45–70% subject height; `cinematic-dolly` → rail dolly; `game-board` → topDown 55°;
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
  `particles` → PRD 07 emitters **only when PRD 07 reports them pixel-backed** (`diagnostics().effects.pixelBacked`).
  Otherwise reject with `unsupported-effect:rain` (strict) or omit it and warn (lenient). It is never listed in
  `visualSystems`. `wet-reflection` → PRD 07 wetness + PRD 03 SSR when available, else rejected. Emissive boxes are
  never a substitute. `motion-trail` → PRD 07 trail, else rejected. `hud` → rejected with "HUDs are DOM; use
  `@aura3d/game` hud (PRD 09)".
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

| Template | Look | Camera (PRD 08) | Assets (PRD 05/06) | Notes |
|---|---|---|---|---|
| `mini-game` (platformer) | `outdoor-day` | `follow2d`/chase, subject 18–25% height | Kenney Oobi hero (25 clips: idle/run/jump/fall/land played, faces travel), textured platform kit, coin/flag models | `createGame` (PRD 09); coins emissive 3–5 with bloom |
| `racing-starter` | `golden-hour` | `chase`, fov 60→72 by speed | Track GLB only (delete ribbons), real car scale | Delete gantry (`:227-255`), constants (`:43-48, 321-335`), overlay (`:109-113`) |
| `falling-blocks-starter` | `neon-arcade` | static, 3/4 view | Instanced bevelled block mesh, PBR glossy | Board frame model; line clear via PRD 07 burst |
| `fighting-game` | `arena-fight` | `fighting` rig | 2 rigged fighters with clips playing (PRD 06) | Overlay off (`:146-148`) |
| `character-controller` | `outdoor-day` | `shoulder` | Rigged character with locomotion blend | Full-bleed (delete 320 px stage `:51-53`, `<pre>` HUD `:44`) |
| `arena-shooter` (new) | `space` | `topDown` 60° | Ship + drone models, planet backdrop | PRD 14 Orbital Defense regenerates from it |
| `product-viewer` | `product-studio` | orbit autoframe | Typed PBR GLB | Delete adoption props (`:13-17`) |
| `cinematic-scene` | from plan (v2) | from plan | from plan | Uses prompt plan v2 strict |
| `three-compat-premium-product-viewer` | `product-studio` | orbit | Khronos sample GLB (not a sphere, `main.ts:14`) | Mirrors `webgl_materials_physical_clearcoat` |
| `three-compat-architecture-interior` | `interior-warm` | orbit | Textured room kit | Mirrors `webgl_lights_rectarealight` |
| `three-compat-postprocess-scene` | `neon-arcade` | orbit | Emissive models | Mirrors `webgl_postprocessing_unreal_bloom` |
| `three-compat-material-authoring` | `product-studio` | orbit | Material sphere grid (64×32 tessellation, PRD 01) + one GLB | — |
| `three-compat-large-scene` | `outdoor-day` | orbit high | Instanced props | — |
| `three-compat-character-viewer` | `character-showcase` | orbit | Rigged GLB | — |
| `three-compat-asset-inspector` | `product-studio` | orbit | Typed GLB | — |
| `three-compat-custom-threejs-migration` | `outdoor-day` | orbit | Typed GLB | — |
| `animation-channel`, `prompt-animation-channel`, `animation-studio`, `episode-builder` | stage look `character-showcase` / `interior-warm` | existing director | existing | Floor applies to stage setup only; episode tooling out of scope |

The five game templates plus `arena-shooter` are built on PRD 09 `createGame` once IC2 is reached (§13). Before
that they are built on `createAuraApp` from `@aura3d/engine` (never lean), so the floor can be met standalone.

### 6.5 Craft-first skills and the look-dev loop

**New skill `aura3d-art-direction`**, installed for every template (added to `coreSet`). The body is ≤ 150 lines
(`check.ts:12`). References:
- `references/look-recipes.md`: one table per genre (platformer, racing, fighting, arena shooter, sports/table,
  product, character, outdoor environment, interior, night city, space, underwater, cinematic). Each row gives
  look id, camera rig + fov + subject frame %, key direction/elevation, palette (3 base + 1 accent, no pure
  primaries), atmosphere, post preset, VFX list, asset list and the 3 reference frames.
- `references/quality-bar.md`: the agent rubric (12 categories drawn from the 27 in research/21, with anchors at
  2/5/7/9 written as observable descriptions), plus the hard checks (lint codes that must be clean).
- `references/reference-frames.md`: named three.js r185 examples (threejs.org/examples URLs), the PRD 12 v2
  reference scenes, and licensed premium-indie stills from `benchmarks/quality-rebuild/refs/` (PRD 12 owns the
  licence records). Each frame has a "what you should see" paragraph so text-only agents can use it.
- `references/failure-gallery.md`: research/21 failure patterns with the fix that removes each (void → sky; flat
  shading → IBL; floating → full shadow; primitive soup → typed assets; debug HUD → DOM HUD).

**Mandatory look-dev loop** (in art-direction, browser-game, scene-authoring, materials-environments,
character-animation and core):

```
1. Pick target: genre recipe row + 1-3 reference frames. Write a 3-line look brief (time of day, palette, mood).
2. Build with a look preset and typed assets. No renderer overrides.
3. Capture: `aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile`
4. Judge: open each PNG; fill `look-judgement.json` against references/quality-bar.md
   (`aura3d look judge --validate look-judgement.json`). Read `aura3d doctor --look` + diagnostics().look.
5. Change the single highest-leverage thing (lint first, then the lowest category). One change per round.
6. Repeat 3-5 until every category >= 7 or 6 rounds or 2 rounds with no gain. Record remaining gaps
   with their lint code / engine limitation; never paint over them with fake geometry.
```

- Capture runners: `--runner gh-actions` (default when `.github/workflows/aura3d-lookdev.yml` exists; the template
  ships it, macos-14) or `--runner local` (the downstream user's choice; this Mac's policy forbids it, so the
  repo's own runs use gh-actions). The command prints PNG paths and the `AppliedLookReport`.
- Judge: the default judge is the authoring agent itself viewing the PNGs. `aura3d look judge` validates the JSON
  schema and computes aggregates. It does not call a model. `--judge prism` is optional and uses PRD 12
  `tools/quality-gate/src/judge-prism.ts` via Kiro Prism. A self-judgement is never a pass for the bar; the panel
  (PRD 12 G-PANEL) is.
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
- Others: one-line boundary link, facts supplied by PRDs 03/05/07/08/10/11.

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
- `prompts.json`: 12 prompts (§16.3) × 3 seeds = 36 runs per round.
- Sandbox: a fresh directory, packed tarballs of the release candidate (`node tools/release/publish-all.mjs
  --pack-only`), `npm create aura3d@<tgz>`, skills installed by `aura3d init`, **no repo checkout**, network
  limited to the npm registry mirror, the asset catalog and the capture runner.
- Agent: Claude Code headless via Kiro Prism (policy §4, default-first LLM layer), model pinned per round.
  Wall-clock 45 min, look-dev loop available through the same `aura3d look capture` the user gets.
- Capture: PRD 12 harness on macos-14 at the default URL only. desktop 1920×1080 and mobile 390×844, shots
  opening/mid/action, bound to SHA + run ID + asset hashes.
- Judge: PRD 12 G-PANEL (2 named humans + 1 vision model, median, calibration set), using the research/21 template
  cut to the categories that apply to the prompt type.
- Checks: A2 median ≥ 6.5, no prompt median < 5. A3 escape scan (`tools/agent-eval/escape-scan.ts`: AST search
  for `pixelRatio`, `qualityProfile`, shadow `strength`, raw GLSL/WGSL, `safe-basic`, `@aura3d/lean`,
  `?capture`). A4 report honesty (`visualSystems` ⊆ applied systems).
- Round 0 runs the 3.0.1 skills and templates to record the baseline. Expected ≈ 2–3, in line with research/21.

---

## 7. APIs to add, change, remove

### 7.1 `@aura3d/engine`: looks (new, `agent-api/looks/`)

```ts
// packages/engine/src/agent-api/looks/looks.ts
import type { AuraBiomeId } from "../world/biomes";            // PRD 10 (type-only; stubbed until present)
import type { AuraPostPresetId } from "../postPresets";         // PRD 03 (type-only; stubbed until present)

export type AuraStudioLookId = "product-studio" | "character-showcase" | "arena-fight" | "neon-arcade";
export type AuraLookId = AuraBiomeId | AuraStudioLookId;

export interface AuraLookOverrides {
  readonly sun?: { readonly azimuthDeg?: number; readonly elevationDeg?: number };
  readonly exposureEv?: number;            // clamped to [-2, +2]
  readonly fogDensityScale?: number;       // clamped to [0, 3]
  readonly accent?: AuraColor;             // palette accent used by recipe set-dressing and grade tint
  readonly background?: "look" | AuraColor; // AuraColor = explicit solid; lint look/solid-void still applies
}

export interface AuraLookPreset {
  readonly id: AuraLookId;
  readonly category: "outdoor" | "interior" | "studio" | "night" | "space" | "underwater";
  readonly biome: AuraBiomeId | null;                 // non-null → v1 delegates entirely to world.biome
  readonly post: AuraPostPresetId;                    // used only when the biome rig has no post spec
  readonly framing: { readonly subjectHeightFraction: readonly [number, number] };
  readonly palette: { readonly base: readonly [AuraColor, AuraColor, AuraColor]; readonly accent: AuraColor };
  readonly backgroundException: boolean;              // true for space/interior-*: solid dark bg allowed
  readonly v0: AuraLookV0Expansion;                   // current-engine expansion (see 7.1.1)
}

export interface AuraLookNode {                        // scene node kind "look"; expands at snapshot time
  readonly kind: "look";
  readonly look: AuraLookId;
  readonly overrides?: AuraLookOverrides;
}

export declare const looks: {
  preset(id: AuraLookId, overrides?: AuraLookOverrides): AuraNodeBuilder<AuraLookNode>;
  list(): readonly AuraLookId[];
  describe(id: AuraLookId): AuraLookPreset;            // frozen; agents can print it
  resolveDefault(snapshot: AuraSceneSnapshot): { readonly id: AuraLookId | "engine-default"; readonly source: "authored" | "biome-default" | "neutral-env" | "none" };
};

// AuraSceneBuilder (existing, index.ts) gains:
//   look(id: AuraLookId, overrides?: AuraLookOverrides): AuraSceneBuilder   // sugar for .add(looks.preset(...))

// Diagnostics addition (merged into PRD 12's AuraDiagnostics):
export interface AuraLookDiagnostics {
  readonly id: AuraLookId | "engine-default" | null;
  readonly expansion: "v1-contracts" | "v0-current-engine" | "none";
  readonly missingContracts: readonly ("world.biome" | "environments.preset" | "output.preset" | "quality.auto" | "lights.hemisphere")[];
  readonly lint: readonly AuraLookLintFinding[];
}
```

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

v0 never emits `lights.ambient`. The HDRI files are admitted as typed texture assets in each template's
`aura.assets.json` (PRD 05 admission command, `assets add --type texture`). v0 renderer settings are the one place
renderer knowledge is allowed, because they live inside the engine, not in authored code. A3 scans authored code
only.

### 7.2 `@aura3d/engine`: look lint (new, `agent-api/looks/lookLint.ts`)

```ts
export type AuraLookLintCode =
  | "look/no-lights" | "look/ambient-kills-ibl" | "look/ambient-flattens" | "look/no-ibl" | "look/weak-shadow"
  | "look/low-dpr" | "look/solid-void" | "look/primitive-subject" | "look/flat-palette" | "look/double-aa"
  | "look/debug-overlay" | "look/fake-effect-names" | "look/evidence-only-feel" | "look/capture-branch";

export interface AuraLookLintFinding {
  readonly code: AuraLookLintCode;
  readonly severity: "error" | "warning";
  readonly message: string;               // exact fix text from §6.2
  readonly nodes?: readonly string[];     // node names involved
}

export interface AuraLookLintContext {
  readonly appliedLook?: AppliedLookReport;           // PRD 12 §7.4; optional before PRD 12 lands
  readonly devicePixelRatio: number;
  readonly tierCap: number;                           // PRD 11; default 2 when absent
  readonly production: boolean;                       // import.meta.env.PROD in apps
  readonly capabilities: { readonly ambientAdditive: boolean; readonly effectsPixelBacked: readonly string[] };
}

export function lookLint(snapshot: AuraSceneSnapshot, context: AuraLookLintContext): readonly AuraLookLintFinding[];
/** Registration hook so PRD 02/07/08 add rules without editing this file. */
export function registerLookLintRule(rule: { readonly code: AuraLookLintCode | `look/${string}`; readonly run: (s: AuraSceneSnapshot, c: AuraLookLintContext) => readonly AuraLookLintFinding[] }): void;
```

`app.diagnostics().warnings` includes `lookLint` messages, and `app.diagnostics().look` carries the structured
findings. The string at `index.ts:18256` is deleted. Its replacement is `look/no-lights`.

### 7.3 `@aura3d/engine`: prompt plan v2 (`agent-api/prompt/`)

```ts
export interface AuraPromptPlan {                       // unchanged fields, one addition
  readonly sceneType: AuraPromptSceneType;
  readonly subject: AuraPromptPlanSubject;
  readonly style?: string;
  readonly environment?: string;
  readonly look?: AuraLookId;                           // NEW: explicit look wins over environment/lighting mapping
  readonly camera?: { readonly preset: AuraPromptCameraPreset; readonly note?: string };
  readonly lighting?: { readonly preset: AuraPromptLightingPreset; readonly note?: string };
  readonly effects?: readonly AuraPromptEffectId[];
  readonly interaction?: AuraPromptInteractionMode;
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria?: readonly string[];
}

export interface AuraCompilePromptPlanOptions {
  /** "reject" throws AuraPromptPlanError on any field it cannot apply. Default "reject" in 4.0, "warn" in 3.x. */
  readonly unsupported?: "reject" | "warn";
}

export type AuraPromptPlanErrorCode =
  | "unmapped-environment" | "unmapped-style" | "unsupported-effect" | "unsupported-camera" | "hud-is-dom";

export class AuraPromptPlanError extends Error {
  readonly code: AuraPromptPlanErrorCode;
  readonly field: "environment" | "style" | "effects" | "camera" | "lighting";
  readonly value: string;
}

export interface AuraPromptPlanReport {
  readonly schema: "aura3d-prompt-plan-report/2.0";    // was 1.0
  readonly sceneType: AuraPromptSceneType;
  readonly subjectAssetId: string;
  readonly recipe: AuraPromptSceneType;
  readonly look: { readonly id: AuraLookId; readonly from: "plan.look" | "plan.environment" | "plan.lighting" | "sceneType-default" };
  readonly camera: { readonly preset: AuraPromptCameraPreset; readonly rig: string };          // rig actually built
  readonly appliedEffects: readonly AuraPromptEffectId[];       // present in the compiled snapshot
  readonly rejected: readonly { readonly field: string; readonly value: string; readonly code: AuraPromptPlanErrorCode }[];
  readonly styleGrade: { readonly contrast: number; readonly saturation: number; readonly lift: number } | null;
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria: readonly string[];
  readonly warnings: readonly string[];
  readonly visualSystems: readonly string[];          // derived from compiled snapshot node census
  readonly repairHints: readonly string[];            // derived from lookLint(compiled snapshot)
  /** @deprecated 1.0 fields kept for one minor */
  readonly cameraPreset: AuraPromptCameraPreset;
  readonly lightingPreset: AuraPromptLightingPreset;
  readonly effects: readonly AuraPromptEffectId[];    // === appliedEffects (no longer the request echo)
}

export function compilePromptPlan(plan: AuraPromptPlan, options?: AuraCompilePromptPlanOptions): AuraCompiledPromptPlan;
export function promptPlanToScene(plan: AuraPromptPlan, options?: AuraCompilePromptPlanOptions): AuraSceneBuilder;
export const promptRecipes: Readonly<Record<AuraPromptSceneType, (asset: AuraAssetRef<"model">, plan: AuraPromptPlan, look: AuraLookId) => AuraSceneBuilder>>;
```

`AuraPromptEffectId` keeps `"hud"` for one minor, and it always rejects or warns. Removal is in 4.0 (PRD 15 train).

### 7.4 `@aura3d/engine`: visualQA deprecation

```ts
// material.visualQA, neon.visualQA, charts.visualQA, character.visualQA (9018), city.visualQA, product.visualQA, solar.visualQA
/** @deprecated Structural node-name heuristic, not a visual check. Use `structuralQA`. Removed in 4.0. */
visualQA(nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult & { readonly deprecated: true; readonly kind: "structural-name-heuristic" };
structuralQA(nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult & { readonly kind: "structural-name-heuristic" };
```

Result keys that claim pixels are renamed in `structuralQA`. For example `chromeReflectsEnvironment` →
`chromeReflectionNodesNamed`. The deprecated alias keeps the old keys.

### 7.5 `create-aura3d` / tools: Template Look Floor (new)

```ts
// tools/agent-templates/look-floor.ts
export interface TemplateLookFloorSpec {
  readonly template: string;
  readonly look: AuraLookId | "plan";                     // §6.4 table
  readonly backgroundException: boolean;
  readonly characterExpected: boolean;                    // requires tracksApplied > 0 (PRD 06 diagnostics)
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

### 7.6 `@aura3d/cli`: look commands (new)

```
aura3d look capture [--route /] [--shots opening,mid,action] [--viewports desktop,mobile]
                    [--runner gh-actions|local] [--out dist/lookdev/<n>] [--json]
  → writes PNGs + appliedLook.json + lint.json; exit 0 even when lint has errors (it reports)
aura3d look judge --validate <look-judgement.json> [--judge self|prism] [--json]
  → validates against LookJudgement schema; prints per-category scores, weakest category, next-change hint
aura3d look rubric [--genre platformer|racing|...] → prints the rubric + recipe row
aura3d doctor --look [--json] → static lookLint over src/** (AST) + feel/evidence-only + capture-branch
```

```ts
// packages/aura3d-cli/src/look/rubric.ts
export const AGENT_LOOK_CATEGORIES = [
  "lighting", "shadows", "ibl_reflections", "environment_world", "atmospheric_effects", "material_quality",
  "modeling_assets", "composition", "camera", "postprocessing", "animation_quality", "ui_hud"
] as const;                                                  // subset of PRD 12 GAME_VISUAL_CATEGORIES
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

- `index.ts:18256` string (replaced by `look/no-lights`).
- Echo semantics of `visualSystemsForPromptPlan` (`index.ts:10279-10289`) and static `repairHintsForPromptPlan`
  (`:10291+`).
- From templates: `@aura3d/lean*` imports, `diagnostics.overlay: true` defaults, constant evidence fields,
  adoption props, primitive HUDs, palette-count screenshot assertions.
- From skills/docs: "Add only prompt-required customization", "cheapest targeted fix", the blanket
  "do not swap GLBs or repaint" rule (amended, §11), `character.lowPolyHumanoid` as the recommended humanoid,
  `visualQA` as acceptance, `lights.ambient` in any sample without an environment.

---

## 8. Shader changes

None. This PRD adds no GLSL/WGSL and changes no shader. Every pixel change comes from composing other PRDs'
features (v1) or existing engine features (v0). If a look needs a shader capability that does not exist, the look
is degraded and `missingContracts` names the gap. A shader is never written here.

---

## 9. Rendering changes

None in the renderer. Frame-level effects come from authoring defaults:
- Templates and hello world render with an environment, a full-strength key shadow, tone-mapped post and DPR from
  tier, because they ask for a look, not because a renderer default changed.
- v0 sets `renderer.qualityProfile: "production"` and `pixelRatio: min(devicePixelRatio, 2)` inside the look
  expansion. When PRD 01/11 `quality: "auto"` lands, v1 sets nothing and the tier decides.
- `lookLint` reads diagnostics. It never alters the frame.

---

## 10. Per-recommendation impact

| # | Recommendation | Visual benefit | GPU / CPU / memory cost | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|
| R1 | `looks.preset` + templates at floor | Highest. Removes void, no-IBL, faint shadow and DPR-1 from every new project at once (research/21's top causes in 15/18 games) | GPU = what the look enables, within PRD 11 tier budgets (§18). v0 adds 1 HDRI (1k RGBE ≈ 1.5 MB transfer, ~8 MB GPU RGBA16F), 1 shadow map 2048², AO + bloom ≈ 1.5–3 ms Medium. CPU < 0.05 ms | looks.ts + presets ≤ 4 KB gz; HDRI is an asset, lazy | Low tier: 1k HDRI → 128 px PMREM (PRD 11), 1 cascade 1024², AO off. Mobile capture judged | `missingContracts` → v0. If v0 HDRI fails to load → neutral env + warning; never ambient |
| R2 | Look lint (runtime + `doctor --look`) | Indirect: the agent learns what is wrong without seeing pixels | Runtime lint ≤ 0.2 ms once per snapshot change, 0 per frame. AST lint CLI-only | ≤ 3 KB gz (runtime rules); AST in CLI | none | Rules gated by capability flags; unknown → skipped, never false-positive |
| R3 | Prompt plan v2 | Plans get what they ask for; no fake reports | Same as R1 per plan | ≤ 2 KB gz (mapping tables) | as R1 | `unsupported: "warn"` in 3.x |
| R4 | `aura3d-art-direction` skill + recipes + references | Gives agents a target. Per-genre camera/palette/atmosphere numbers | none at runtime | 0 (skills are docs) | Recipes include mobile framing (portrait fov +8°, HUD safe areas) | — |
| R5 | Mandatory look-dev loop + CLI capture/judge | Agents iterate on pixels. Removes the blind-authoring rule | Remote runner time: ≈ 3–5 min per round on macos-14 (build + 3 shots × 2 viewports) | CLI only | Mobile viewport in every capture | Runner unavailable → the loop is recorded `not-run` and the deliverable is labelled `prototype`; no visual claim |
| R6 | llms.txt rewrite + ratio inversion | Shifts the default answer from "label it" to "light it" | none | 0 | — | — |
| R7 | Lean removed from templates | mini-game/product-viewer get lights, env, rotation and animation | Lean bundle +~200 KB gz until PRD 15 code-splitting (PRD 01 budget: mini-game ≤ 250,000 B) | see §18 | as R1 | none; PRD 15 owns the bundle budget, and it may not be met by removing lighting (PRD 01 §18) |
| R8 | visualQA → structuralQA | Stops agents gaming names with fake cards | none | ~0 | — | Deprecated alias for one minor |
| R9 | Template gates on floor + G-REG goldens, palette counts removed | Templates stop rewarding the Atari palette | CI time | 0 | Mobile shots | — |
| R10 | Agent output eval (12 × 3) | The only measurement of what users get | ≈ 36 runs × (≤ 45 min agent + 6 capture) per round; sharded 12-wide ≈ 3–4 h wall | 0 | Mobile judged (A1) | Prism unavailable → round is `vision-missing`, humans only (PRD 12 rule) |

---

## 11. Migration plan

1. **3.x minor (standalone, behind no flag for docs; v0 looks).** Ship `looks` (v0), `lookLint`, prompt plan v2
   with `unsupported: "warn"`, the `structuralQA` alias, the new skill, rewritten skills/llms/docs and templates on
   `@aura3d/engine` with looks. Existing apps change only if they opt into `looks`, except for the diagnostics
   warning text (`index.ts:18256` → `look/no-lights`).
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
3. **IC1–IC2 (contracts land).** v1 expansion becomes active automatically per id. Templates move to
   `createGame` (PRD 09). Template goldens are re-approved through G-PANEL (never auto-accepted).
4. **4.0.** `unsupported: "reject"` default. `visualQA` aliases and the report 1.0 fields are removed.
   `AuraPromptEffectId "hud"` is removed. The `@aura3d/lean` packages are gone (PRD 15).
5. **Codemod** (in `aura3d migrate`, owned by PRD 15's CLI codemod framework; rules supplied here):
   - `lights.ambient(x)` with no env node in the same scene → `looks.preset("<category default>")` plus a TODO.
   - `renderer.qualityProfile: "safe-basic"` → removed.
   - `report.visualSystems` consumers → `report.appliedEffects`.

## 12. Backward compatibility

| Surface | Change | Compatibility |
|---|---|---|
| `compilePromptPlan(plan)` | Report schema 2.0; scene now follows plan fields | 1.0 fields kept (deprecated) one minor. `effects` now = applied, not requested (an intended semantic fix). Default `warn` in 3.x, so no new throws |
| `promptRecipes[...]` | Gains a third `look` param; output changes | Callers passing 2 args get the scene-type default look |
| `visualQA` | Deprecated alias | Same result keys + `deprecated: true` |
| Diagnostics warning text | `index.ts:18256` replaced | Text-matching consumers: `tools/agent-dogfood/index.ts` updated here; no other `rg` hit expected (task T1.6 verifies) |
| Templates | Content rewritten | New scaffolds only. Existing user projects untouched. `npm create aura3d@<prev>` reproduces old templates |
| Skills | Rewritten; new core skill | `aura3d init` respects user-modified files (`check.ts:89-92` smoke) |
| `llms.txt` | Rewritten | Release-integrity tokens preserved (`check.ts:51-56`) |
| Template screenshot tests | Assertions change | Template-local; ship with the template |

---

## 13. Contracts consumed / provided (formalized in CONTRACTS.md)

### 13.1 Consumed

| Id (proposed) | From | Interface needed | Used by | Stub until available |
|---|---|---|---|---|
| C-01-quality | PRD 01 | `AuraAppOptions.quality?: AuraQualityTier \| "auto"` (default `"auto"`); `scene().background(color, { toneMapped })`; primitive tessellation defaults | looks v1, templates, llms.txt mapping | v0 `qualityProfile: "production"` + `pixelRatio: min(dpr,2)` inside looks |
| C-02-env | PRD 02 | `environments.preset("studio"\|"outdoor"\|"sunset"\|"night"\|"indoor")`; `lights.hemisphere(...)`; `lights.directional({ shadow: true })` at strength 1.0; ambient additive (capability flag `diagnostics().capabilities.ambientAdditive`) | studio looks, lint gating, mapping row | v0 `environments.hdri` with repo HDRIs; `look/ambient-kills-ibl` active |
| C-02-lint | PRD 02 | PRD 02 does not edit `index.ts:18256`. It registers `look/ambient-flattens` through `registerLookLintRule` (or this PRD hosts it, §6.2) | lookLint | hosted here |
| C-02-kits | PRD 02 | PRD 02 owns `sceneKits` lighting (`index.ts:9841-9995`). **PRD 13 owns `promptRecipes` (`index.ts:10147-10250`)**. PRD 02 task "update scene kits (`index.ts:10152-10245`)" refers to recipe lines and is superseded by this PRD's rewrite. To be reconciled in CONTRACTS.md | prompt v2 | — |
| C-03-post | PRD 03 | `AuraOutputOptions.preset?: AuraPostPresetId` (7 ids); the postfx facts list for skills (PRD 03 §10 item 5); no `softKnee`/FXAA guidance | looks, skills | v0 tuned `effects.*` |
| C-04-override | PRD 04 | Material override API that preserves textures (no `replaceTextures: true` in templates) | templates, skills | templates avoid tint overrides |
| C-05-assets | PRD 05 | Admission of HDRIs + curated game packs (platform kit, ship/drone, track, fighters) with profile targets; skill rule text | templates, recipes | existing typed assets only; recipe lists "catalog search phrase" |
| C-06-anim | PRD 06 | `AnimationController` that applies clips on the visible actor (`tracksApplied > 0` in diagnostics); locomotion blend | mini-game hero, fighting, controller, character looks | template uses clip playback that works today on the engine path (no lean); `characterExpected` floor check is report-only until IC2 |
| C-07-fx | PRD 07 | `diagnostics().effects.pixelBacked: readonly string[]`; rain/particles/trail/wetness APIs | prompt v2 effect mapping, recipes | effects rejected/warned |
| C-08-camera | PRD 08 | `camera.rigs.{chase,follow2d,fighting,shoulder,orbit,topDown,rail}`, `app.camera.use(rig)`; F-7 rule logic | templates, prompt v2 camera mapping, `doctor --look` | `camera.perspective` + per-frame position update in template code |
| C-09-game | PRD 09 | `createGame(options)` from `@aura3d/game`; HUD, touch preset, sampled sound; 0 capture branches | 6 game templates | `createAuraApp` + DOM HUD in template |
| C-10-biome | PRD 10 | `world.biome(id, overrides)`, `world.biomes.describe(id)`, `AuraBiomeId` (11 ids), scene-category default biome | looks v1 | v0 expansion per id |
| C-11-tier | PRD 11 | Tier probe + `tierCap` readable from diagnostics; tier settings table | lint `look/low-dpr`, budgets | `tierCap = 2` |
| C-12-harness | PRD 12 | `AppliedLookReport`; capture harness (macos-14) callable per route/template; G-REG golden store; G-PANEL rounds + `GameJudgement`; `judge-prism.ts`; v2 reference scenes + licensed refs in `benchmarks/quality-rebuild/refs/` | look capture, template gates, agent eval, reference frames | existing `tools/quality-rebuild-capture/capture-games.mjs` driven with a template list; diagnostics fields used directly |
| C-14-pilots | PRD 14 | Pilot code patterns (K-kits) for templates after pilots are accepted | template v2 | — |
| C-15-surface | PRD 15 | `packages/lean` deprecation/deletion; `agent-api/{looks,prompt}/` module locations; codemod framework; `asset-manifest.ts:112-125` stops emitting lean imports; root `templates/` fate | templates, codemod | templates import `@aura3d/engine` directly (allowed today) |

### 13.2 Provided

| Id (proposed) | To | Interface |
|---|---|---|
| P-13-looks | PRD 09, 10, 14, 15 | `looks.preset/list/describe/resolveDefault`, `AuraLookId`, `AuraLookPreset`, `scene().look()`; `diagnostics().look` |
| P-13-lint | PRD 02, 07, 08, 09, 12, 14 | `lookLint`, `registerLookLintRule`, `AuraLookLintCode`; `aura3d doctor --look` (hosts PRD 08 F-7 and the capture-branch rule) |
| P-13-prompt | PRD 12, 15 | Prompt plan v2 types, report 2.0, `AuraPromptPlanError` |
| P-13-floor | PRD 12, 14, 15 | `TemplateLookFloorSpec/Result`, `checkTemplateLookFloor` |
| P-13-templates | PRD 14 | `arena-shooter` template (Orbital Defense regeneration, PRD 14 :437, :1380); game templates on `createGame` |
| P-13-skills | PRDs 03, 05, 07, 08, 10, 11 | Skill files where their facts land. Each PRD sends a facts list; this PRD writes the text |
| P-13-eval | PRD 12, release | `benchmarks/agent-eval/prompts.json`, results schema `aura3d.agent-eval/1`, A1–A4 verdicts in the PRD 12 panel record |
| P-13-cli | users, PRD 12 | `aura3d look capture/judge/rubric`, `LookJudgement` schema |

---

## 14. Parallel execution

**Owned files** are listed in §5. No other PRD edits them. This PRD does not edit renderer, lighting, post,
material, asset, animation, camera, VFX or world modules, `packages/lean`, or `tools/quality-gate`.

**Shared-file protocol for `packages/engine/src/agent-api/index.ts`.** This PRD's edits there are limited to:
- replacing `:10007-10345` with re-exports from `agent-api/prompt/`;
- deleting the `:18256` line and calling `lookLint` at the same site;
- adding `looks` and `scene().look` re-exports;
- adding `@deprecated` + `structuralQA` at `:2721` and the sibling `visualQA` sites.

Each edit is a separate commit that touches only those ranges, so rebasing against other PRDs is mechanical.

**Stubs used.** `looks.ts` imports other PRDs' types as type-only from paths guarded by a local
`contracts-shim.d.ts` (`agent-api/looks/contracts-shim.d.ts`). At runtime it detects capabilities (§6.1). Any
missing contract → v0. The shim is deleted at IC5.

**Feature flags.**
- Looks: no global flag. Looks are opt-in nodes. The expansion is chosen by capability detection, and
  `A3D_LOOK_EXPANSION=v0|v1|auto` (default `auto`, read via `globalThis.__AURA3D_FLAGS__` / `import.meta.env`)
  forces one for tests.
- Prompt plan: `unsupported` option; `A3D_PROMPT_PLAN_STRICT=1` sets `reject` in CI.
- Templates: none. Rollback is the previous `create-aura3d` dist-tag.

**Integration checkpoints** (evaluated on main, never block starting or merging this PRD's phases):

| IC | Requires | What switches | Evaluated |
|---|---|---|---|
| IC0 | this PRD phases 1–3 | v0 looks, lint, prompt v2 (warn), skills, llms, templates on engine | standalone acceptance S1–S8 |
| IC1 | PRD 01 quality auto, PRD 02 env preset + ambient additive, PRD 03 output preset, PRD 12 AppliedLookReport | studio looks go v1; `look/ambient-kills-ibl` turns off; v0 renderer overrides drop | I1 |
| IC2 | PRD 06 controller, PRD 08 rigs, PRD 09 createGame, PRD 05 packs, PRD 10 biomes | game templates on `createGame` + rigs + biomes; `characterExpected` blocking | I2, I3 |
| IC3 | PRD 12 G-PANEL live | template goldens approved; agent-eval round 1 | I4, I5 |
| IC4 | PRD 14 pilots accepted | templates absorb pilot patterns; agent-eval round 2 | I5 |
| IC5 | PRD 15 4.0 | `reject` default, alias removal, shim deletion | I6 |

---

## 15. Implementation phases

**Phase 0: baseline and harness hookup.**
Record 3.0.1 template captures (all 19, desktop + mobile, macos-14) and agent-eval round 0. Freeze the
craft-ratio numbers.
*Exit:* `benchmarks/agent-eval/baseline/round-0.json` exists with 36 runs judged (vision + ≥ 1 human),
`tests/reports/craft-ratio-baseline.json` matches research/12 §1.2 within ±3 lines per file, and the template
baseline PNGs are stored in the PRD 12 golden store as `baseline-3.0.1` (never as approved goldens).

**Phase 1: engine authoring layer (standalone).**
`looks` v0, `lookLint`, prompt v2 (warn), structuralQA, the `:18256` replacement.
*Exit:* unit tests in §17.1 green on macos-14 CI. `compilePromptPlan` property test: for 500 random plans,
`visualSystems ⊆ census(compiledSnapshot)` and every unsupported field appears in `rejected`.

**Phase 2: skills, llms.txt, docs, CLI look commands.**
*Exit:* `pnpm check:skills` green with the new gates (sections, craft ratio, forbidden-sample rules, threejs.org
links allowed). Ratio targets in §6.5 met. `aura3d look capture --runner gh-actions` returns PNGs for
`product-viewer` on CI. `aura3d look judge --validate` rejects malformed judgements (fixture tests).

**Phase 3: templates at the floor on today's engine.**
All 19 templates rewritten (game templates on `createAuraApp` engine path), `arena-shooter` added, palette-count
tests replaced.
*Exit:* `checkTemplateLookFloor` ok for all 20 (runtime part on macos-14). Standalone visual acceptance S1–S8
passed. `rg "@aura3d/lean" packages/create-aura3d/templates` = 0.

**Phase 4 (IC1/IC2): v1 expansion + createGame templates.**
*Exit:* `diagnostics().look.expansion === "v1-contracts"` for every template whose contracts exist. Game templates
on `createGame`. Floor `characterExpected` blocking. I1–I3 evaluated.

**Phase 5 (IC3): agent eval round 1 + template panel.**
*Exit:* round 1 recorded with A1–A4 verdicts. Template panel scores recorded. Gaps assigned to owning PRDs by
dominant cause.

**Phase 6 (IC4): pilot absorption + round 2.**
*Exit:* round 2 meets A2–A4 (I5) or every miss has a dominant cause owned by another PRD and an open task there.

**Phase 7 (IC5): 4.0 cleanup.**
*Exit:* `reject` default; aliases, the 1.0 report fields and the shim are deleted;
`rg "visualQA\(|lights\.ambient\(|qualityProfile|pixelRatio" packages/aura3d-cli/skills llms.txt packages/create-aura3d/templates/*/src`
returns only documented negative examples inside `failure-gallery.md`.

---

## 16. Task checklist

Tags: [E] engine, [S] skills/docs, [T] templates, [C] CLI, [V] eval/visual, [G] gates. Every browser/GPU step runs
on GitHub Actions `macos-14`. Before adding or changing any workflow, read
`/Users/gurbakshchahal/.config/agent-policy/reference/ci-selection.md`, and never expose secrets to fork PR code.

### 16.1 Phase 0

- [ ] [V] T0.1 `tools/agent-templates/capture-templates.mjs`: build each `packages/create-aura3d/templates/*` from packed tarballs (`node tools/release/publish-all.mjs --pack-only`) and hand the dist dirs to the PRD 12 capture harness (until C-12 lands, reuse `tools/quality-rebuild-capture/capture-games.mjs --local-build` with a generated `templates.json` in the `games.json` format). Shots: opening/mid/action. Viewports: 1920×1080 + 390×844. Test: workflow run produces 19 × 6 PNGs + `report.json`.
- [ ] [V] T0.2 `.github/workflows/template-lookdev.yml` (macos-14, `workflow_dispatch` + `push` to main on `packages/create-aura3d/templates/**`, no secrets on `pull_request`): runs T0.1 and uploads artifacts. Test: one green run linked in `benchmarks/agent-eval/baseline/README.md`.
- [ ] [V] T0.3 `benchmarks/agent-eval/prompts.json`: the 12 prompts of §18.3, with `id`, `text`, `category`, `allowedAssets` (P01 only: `benchmark/assets/sneaker.glb`), `rubricCategories`, `referenceFrames`. Test: `tests/unit/tools/agent-eval-prompts.test.ts` validates the schema, checks 3/2/2/4/1 category counts, and checks unique ids.
- [ ] [V] T0.4 `tools/agent-eval/run.ts`: per (prompt, seed) create a temp dir, `npm create aura3d@<tgz> <dir> --template <none|auto>`, run the agent CLI headless with the prompt and a 45-min limit, then `npm run build`. Store `src/**`, the agent transcript, the build log and `dist/`. Agent endpoint is Kiro Prism: before writing this file, read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` and use the documented Claude Code configuration; the key comes from the CI secret store and is never written to disk. Test: dry-run mode (`--dry-run`) with a stub agent producing a fixed project completes and emits `run.json` (`aura3d.agent-eval/1`).
- [ ] [V] T0.5 `.github/workflows/agent-output-eval.yml`: `workflow_dispatch` and weekly `schedule` on main only. Matrix 12 prompts × 3 seeds. Agent job (ubuntu-latest is allowed: no GPU) → capture job (macos-14, PRD 12 harness) → panel packet job. Concurrency group per round. Test: a dry-run dispatch with the stub agent goes green.
- [ ] [V] T0.6 Round 0: run T0.5 against 3.0.1 skills/templates. Record `benchmarks/agent-eval/baseline/round-0.json` with panel scores (vision + ≥ 1 named human). Test: file validates against the PRD 12 `PanelRoundRecord` schema with `panel` marked accordingly.
- [ ] [G] T0.7 `tools/agent-skills/craft-ratio.ts`: freeze the research/12 §1.2 evidence and visual regexes as exported constants and classify every non-blank line of `packages/aura3d-cli/skills/**/*.md`, `llms.txt`, `docs/agents/*.md` and `docs/guides/*.md` into evidence-only/visual-only/both/neither. Output `tests/reports/craft-ratio.json`. Test: `tests/unit/tools/craft-ratio.test.ts` reproduces the research/12 table on a fixture copy of the 3.0.1 files within ±3 lines per file.

### 16.2 Phase 1 (engine)

- [ ] [E] T1.1 Create `packages/engine/src/agent-api/looks/lookPresets.ts` with 15 `AuraLookPreset` entries (11 biome pass-through + 4 studio). v0 values per id. outdoor ids: `autumn_field_puresky_1k`, key elevation from PRD 10 §6.3 table, shadow true, fog colour = horizon. `golden-hour`: `kloppenheim_06_puresky_1k`. Studio: `studio_small_08_1k`. `night-city`/`space`/`underwater`/`polar-night`: hdri null, background exception per §7.1. Test: `tests/unit/agent-api/looks.test.ts` asserts the 15 ids, no v0 entry emits an ambient light, every non-exception background has luma ≥ 0.06, and every entry has `key.shadow === true`.
- [ ] [E] T1.2 `looks/looks.ts`: `looks.preset/list/describe/resolveDefault`, `AuraLookNode` expansion at snapshot time (one call `expandLookNodes(snapshot)` at the start of the scene-snapshot build, before `createProductionRuntimeEnvironment` (`index.ts:12628`, called at `:13613`) reads environment and light nodes; locate the exact call site with `rg "function .*Snapshot\(" packages/engine/src/agent-api/index.ts`), capability detection, and `diagnostics().look`. Test: a snapshot with `looks.preset("outdoor-day")` yields 1 environment node (hdri), 1 directional with `shadow: true`, colorGrade + AO + bloom effects, `renderer.pixelRatio` = `min(dpr,2)`, `expansion: "v0-current-engine"`, `missingContracts` listing the 5 contracts. With `A3D_LOOK_EXPANSION=v1` and a mocked `world.biome`, it yields exactly one biome node and nothing else.
- [ ] [E] T1.3 `scene().look(id, overrides)` on `AuraSceneBuilder` (sugar for `.add(looks.preset(...))`). Overrides are clamped per §7.1. Test: `exposureEv: 5` clamps to 2. Two looks in one scene → the last wins + warning `look/multiple-looks`.
- [ ] [E] T1.4 `looks/lookLint.ts`: implement the 14 rules of §6.2 with exact messages. Primitive share counts visible draw items from the snapshot census. Fake-effect names: the 41-name list extracted to `looks/fakeEffectNames.ts` (generated once by `rg` over `agent-api/index.ts` and showcase sources; the list is committed). Test: `tests/unit/agent-api/look-lint.test.ts`, one positive + one negative fixture per rule; `look/ambient-kills-ibl` is suppressed when `capabilities.ambientAdditive` is true.
- [ ] [E] T1.5 `registerLookLintRule`. Test: a registered rule's findings appear in `diagnostics().look.lint`, and a duplicate code throws.
- [ ] [E] T1.6 Delete the `index.ts:18256` string and call `lookLint` in the same diagnostics builder. `rg "lights.ambient()" packages/ tools/` must show no remaining suggestion text. Update `tools/agent-dogfood/index.ts` text matches. Test: a no-lights scene's warnings contain the exact `look/no-lights` message and no "lights.ambient".
- [ ] [E] T1.7 Move `index.ts:10007-10345` to `agent-api/prompt/{promptPlan.ts,promptRecipes.ts,promptPlanMappings.ts}` unchanged (one commit, re-exports in `index.ts`). Test: the existing prompt-plan unit tests pass unchanged and `pnpm check:public-api` shows no surface diff.
- [ ] [E] T1.8 `promptPlanMappings.ts`: lighting→look, environment keyword→look, style→grade, camera→rig/fallback, effect→builder|reject tables (§6.3), each exported as frozen data. Test: table-driven test covering every key, plus "unmapped" cases.
- [ ] [E] T1.9 Rewrite the 4 `promptRecipes` to take `look`. They contain no `lights.ambient`, no primitive HUD (the mini-game recipe's health pips/timer/objective bars are deleted), and no emissive "wet reflection"/"puddle streak"/"rain splash" primitives. Ground uses a textured material preset. Test: snapshot census per recipe: ambient count 0, nodes whose names match `fakeEffectNames` = 0, `lookLint` errors = 0.
- [ ] [E] T1.10 `compilePromptPlan(plan, options)`: resolve the look (`plan.look` > environment > lighting > sceneType default), apply camera, style grade and effects, collect `rejected`, throw `AuraPromptPlanError` in reject mode, compute `visualSystems` from the compiled snapshot census and `repairHints` from `lookLint`. Fill the deprecated 1.0 fields. Test: `tests/unit/agent-api/prompt-plan-v2.test.ts`. (a) `product-viewer` + `effects:["rain","fog"]` in warn mode → fog applied, rain in `rejected` (until PRD 07 pixel-backed), `visualSystems` lacks "rain effect". (b) Reject mode throws `unsupported-effect`. (c) `environment:"misty forest at dusk"` → `golden-hour`. (d) The 500-plan property test from Phase 1 exit.
- [ ] [E] T1.11 `structuralQA` + deprecated `visualQA` aliases at `index.ts:2721, 8409, 8424, 9018, 9254, 9366, 9452`, with the renamed keys of §7.4. Test: the alias returns `deprecated: true` and old keys; `structuralQA` returns new keys only.
- [ ] [E] T1.12 Bundle check: `pnpm check:bundle-size` shows the root "." grows ≤ 9 KB gz (looks 4 + lint 3 + mappings 2). Test: the bundle report entry is added to `tests/reports/bundle-size.json` targets.

### 16.3 Phase 2 (skills, llms, docs, CLI)

- [ ] [S] T2.1 `packages/aura3d-cli/skills/AUTHORING.md`: required body sections for core/scene/game/materials/character/art-direction skills become `Look target`, `Establish the contract`, `Procedure`, `Look-dev loop`, `Stop and report`, `References`. Line 21 (benchmark branch) becomes: "Benchmark mode: if `aura3d look capture` is available, run the look-dev loop; otherwise build and stop and label the result `prototype`." Add an allowed-links entry for `https://threejs.org/examples/`.
- [ ] [G] T2.2 `tools/agent-skills/check.ts`: (a) enforce the section order from T2.1 for the listed skills; (b) run `craft-ratio.ts` and fail below the §6.5 targets; (c) fail any fenced code block that contains `lights.ambient(` without `environments.`/`looks.`/`world.biome` in the same block; fail `qualityProfile`, `pixelRatio:`, `safe-basic`, `softKnee`, `antiAlias({ mode: "fxaa"`, `replaceTextures: true` or `@aura3d/lean` in code blocks; (d) fail `visualQA(` outside `failure-gallery.md`; (e) allow threejs.org/examples links in `checkLink`. Test: `tests/unit/tools/agent-skills-check.test.ts` fixtures per rule.
- [ ] [S] T2.3 New `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` (≤ 150 body lines). Frontmatter description: "Sets the visual target and runs the look-dev loop for any Aura3D scene or game: genre look recipe, reference frames, look preset, capture, rubric judgement and iteration. Use when starting or finishing any scene, game, product viewer or template, or when a screenshot looks flat, dark, empty, floaty or placeholder-like." Body: look brief → recipe row → `looks.preset` → assets → camera framing → capture/judge loop → the 12-item hard checklist (IBL on, key shadow full strength, DPR ≥ min(dpr, tier cap), background not void or declared, fog/atmosphere for depth, grade via output preset, subject 15–70% of frame by genre, no pure-primary primitives, characters animated, HUD in DOM, no overlay, lint clean).
- [ ] [S] T2.4 `aura3d-art-direction/references/look-recipes.md`: 13 genre tables per §6.5 with numeric values. Platformer row: `outdoor-day`, follow2d, fov 50, subject 18–25% height, key elevation 48° azimuth 35° (3/4 front), palette saturated greens/sky blue/warm wood + coin gold accent, fog density 0.0025, `daylight-outdoor` post, VFX = coin sparkle + land dust, refs = three `webgl_animation_skinning_blending` (character lighting), PRD 12 v2 outdoor scene, refs-store platformer still. Write the other 12 rows at the same density. Test: `check.ts` row-density rule (≥ 80% of rows contain numbers or API names).
- [ ] [S] T2.5 `references/quality-bar.md`: 12 categories (§7.6) with anchors 2/5/7/9 as observable descriptions (e.g. shadows: 2 = "no visible shadow, objects float"; 5 = "shadow visible but grey/soft, no contact darkening"; 7 = "dark contact shadows grounding every object, soft falloff"; 9 = "cascaded, stable, contact + AO, matches the reference"). Test: `aura3d look rubric` prints it, and `check:skills` verifies all 12 categories are present.
- [ ] [S] T2.6 `references/reference-frames.md` and `references/failure-gallery.md` per §6.5. Reference-frame images link only to licensed files in `benchmarks/quality-rebuild/refs/` (PRD 12) by absolute GitHub URL. Until that exists, frames are threejs.org example names plus "what you should see" text. Test: link check.
- [ ] [S] T2.7 Rewrite `aura3d-core/SKILL.md`. Hello world becomes `scene().look("product-studio").add(model(assets.robot))`. Routing table puts `aura3d-art-direction` first for any visual task. Claim content is one line linking boundaries. Test: craft-ratio for this file meets craft ≥ evidence.
- [ ] [S] T2.8 Rewrite `aura3d-browser-game/SKILL.md`: genre → recipe row → template → look-dev loop. Mechanics gates kept as one table. The evidence steps (current 7–10) are replaced by a one-line link to evidence-review. Delete the `lights.studio()`-only sample (`:35-41`). Test: game-path craft ≥ 2× evidence.
- [ ] [S] T2.9 Rewrite `aura3d-scene-authoring/SKILL.md:22-24, 76-81`: drop "Add only prompt-required customization"; "`visualSystems` lists what the compiled scene contains; `rejected` lists what the engine could not do"; repair from `repairHints` + `doctor --look`; the loop.
- [ ] [S] T2.10 Rewrite `aura3d-evidence-review/SKILL.md:44-49, 53-56, 77-78, 89-91`: visual rounds ≤ 6, highest-leverage fix, `structuralQA` is not acceptance, claim labels live here only, "could not capture" → `prototype` stays but must say which loop step failed.
- [ ] [S] T2.11 `aura3d-materials-environments`: lead with looks/biomes/env presets, then HDRI admission. Add it to every game template in `manifest.json` (§7.7) and add `aura3d-art-direction` to `coreSet`. Test: the `check.ts` init smoke asserts that `selectSkills(manifest,"core","mini-game")` includes art-direction + materials-environments.
- [ ] [S] T2.12 Apply facts lists from PRDs 03/05/07/08/10/11 to `aura3d-game-art`, `meshy-cli` (`:56-66` profile ceilings), `aura3d-performance`, `aura3d-threejs-migration`, `aura3d-character-animation`, `aura3d-retexture`, `aura3d-assets`, `aura3d-animation-studio` as they arrive. Each skill gets a one-line boundary link and the evidence restatements are removed. Test: `check:skills`.
- [ ] [S] T2.13 Rewrite `llms.txt` per §6.6 (≤ 260 lines). Keep the `Release integrity rules:` block tokens. Then `pnpm skills:sync`. Test: `check:skills` (mirror + tokens) + craft-ratio llms craft ≥ evidence.
- [ ] [S] T2.14 Docs: amend `docs/agents/no-hackjob-rules.md:45-46`, `build-playbook.md:141-151`, `benchmark-recipes.md:4`, `game-example-standards.md` (visual bar), `README.md:82`, `agent-context.md:23`; create `docs/agents/art-direction.md` from `cinematic-scene-quality.md` plus API values; redirect stub; link `docs/project/showcase/visual-quality-standard.md`; `docs/guides/build-a-browser-game.md` gets look steps. Test: `pnpm check:agent-docs`.
- [ ] [C] T2.15 `packages/aura3d-cli/src/index.ts:3642-3668`: init agent file text adds "Read the `aura3d-art-direction` skill. Every scene gets a look. Run the look-dev loop (`aura3d look capture` → judge → iterate) before calling a scene done." Test: init smoke snapshot.
- [ ] [C] T2.16 `packages/aura3d-cli/src/look/capture.ts`: `--runner gh-actions` dispatches `.github/workflows/aura3d-lookdev.yml` in the user's repo via `gh workflow run` (uses the user's existing `gh` auth; never sets tokens), polls, downloads artifacts to `dist/lookdev/<round>/`. `--runner local` launches the project's Playwright (only where the user's environment allows). Prints PNG paths, `appliedLook.json` and `lint.json`. Add to `cli-help.ts`. Test: `tests/unit/cli/look-capture.test.ts` with mocked `gh` and fs; CI e2e on `product-viewer`.
- [ ] [C] T2.17 `look/judge.ts` + `look/rubric.ts`: schema validation of `LookJudgement`, aggregates, weakest category, next-change hint drawn from `look-recipes.md` keyed by category + lint codes. `--judge prism` delegates to PRD 12 `judge-prism.ts` (no new provider code). Test: fixtures for valid, missing observations for a score < 7, out-of-range score, and unknown category.
- [ ] [C] T2.18 `look/lint-static.ts` + `doctor --look` (`cli.ts:229`): TypeScript AST scan for ambient-without-env, renderer overrides, lean imports, capture branches, constant evidence literals (`routeAlignedToVisibleTrack: true` style `true` literals in evidence objects), overlay defaults, and PRD 08 F-7. Test: fixtures from the current `racing-starter` and `mini-game` are flagged; the rewritten templates are clean.
- [ ] [T] T2.19 Ship `.github/workflows/aura3d-lookdev.yml` (macos-14, `workflow_dispatch` only, no secrets) in every template. Test: `check:templates` asserts its presence.

### 16.4 Phase 3 (templates, standalone on today's engine)

For every template: import only `@aura3d/engine`, `scene().look(<§6.4 id>)`, typed assets only as subject,
overlay off by default (`?debug=1` enables it), full-bleed canvas, DOM HUD, no constant evidence values, no
adoption props, no `?capture` branches, the screenshot test rewritten per T3.12.

- [ ] [T] T3.1 `mini-game`: rewrite `src/main.ts` on `createAuraApp` (engine). Hero `model(assets.showcaseKenneyOobiPlatformerHero)` with `AnimationController` playing idle/run/jump/fall from the GLB clips, yaw toward travel direction. Camera follows each frame (state applied to the camera, not to evidence). Platforms from a typed textured platform kit (C-05; until then the best typed catalog kit via `assets resolve "low poly platformer platform kit"`), coins as models with emissive 3–5. Look `outdoor-day`. Delete the `cameraRig.follow` evidence-only call. Update `src/aura-assets.ts` to the engine import. Test: `playable.spec.ts` (collect, hazard, reset) + floor check + `tracksApplied > 0` (report-only until IC2).
- [ ] [T] T3.2 `racing-starter`: delete ribbons (`:50-55, 220-225`), the gantry (`:227-255`), constants (`:43-48, 321-335`) and the overlay (`:109-113`). Look `golden-hour`. Chase camera behind the car at fov 60, car at real scale (remove 0.18 scale unless the asset requires it; document the asset's metres). Evidence reports `certify-game-geometry` output, not constants. Test: playable + floor + `doctor --look` clean.
- [ ] [T] T3.3 `falling-blocks-starter`: replace the per-cell box with one instanced bevelled-cube mesh (typed asset or a PRD 01 primitive with bevel when available; until then a typed bevelled-cube GLB), glossy PBR per piece colour from the `neon-arcade` palette, board frame model. Look `neon-arcade`. Test: playable + floor (background exception false: night-city sky gradient).
- [ ] [T] T3.4 `fighting-game`: look `arena-fight`, overlay off, rim spot kept, fighters animated (existing controller path on engine), fix HUD-only director output (`:322, :361`) so the director drives the camera. Test: playable + floor + F-7 clean.
- [ ] [T] T3.5 `character-controller`: full-bleed canvas (delete `:51-53` 320 px stage), DOM HUD replaces `<pre>` (`:44`), drop ambient (`:60-61`), look `outdoor-day`, shoulder camera, locomotion clips. Test: playable + floor.
- [ ] [T] T3.6 New `arena-shooter` template: typed ship + drone + planet models, topDown camera at 60°, waves (spawn cadence 1.8 s, shield segments 5, matching PRD 14 :1380), look `space`, PRD 07 particles when pixel-backed (otherwise model-based muzzle flashes, never primitive spheres). Add to `package.json` files, `CREATE_AURA3D_TEMPLATES`, `manifest.json`. Test: route-health + playable + floor.
- [ ] [T] T3.7 `product-viewer`: engine import, look `product-studio`, orbit autoframe (subject 45–70% height), delete adoption props (`:13-17`), ground contact shadow. Test: floor + G-REG golden.
- [ ] [T] T3.8 `cinematic-scene`: `promptPlanToScene(plan, { unsupported: "reject" })` with a plan whose fields are all supported. The template test asserts `report.rejected.length === 0` and `visualSystems ⊆ census`.
- [ ] [T] T3.9 `three-compat-*` (8): per the §6.4 table. `premium-product-viewer` hero becomes a typed Khronos sample GLB (catalog `assets resolve "khronos damaged helmet"` or similar licensed sample; record provenance). Each template's README names the three.js example it mirrors. Test: floor for all 8.
- [ ] [T] T3.10 Animation templates (4): stage setup uses `character-showcase` / `interior-warm` looks. No other change. Test: floor static checks only (runtime floor for the default stage frame).
- [ ] [T] T3.11 `packages/create-aura3d/src`: no change to the `showcase-spec-*` compilers (out of scope), but `CREATE_AURA3D_TEMPLATES` gains `arena-shooter`. Test: `tests/unit/create-aura3d/templates.test.ts`.
- [ ] [G] T3.12 Rewrite every template `tests/screenshot.spec.ts`. Delete the palette counts (`mini-game/tests/screenshot.spec.ts:24-66`). Assert: canvas non-blank; `diagnostics().look.lint` has no `error`; `appliedLook.environment.specularIntensity > 0` (unless the look has no env); `shadows.strength ≥ 0.8` when a key exists; `pixelRatio ≥ min(dpr, tierCap)`; subject bbox coverage within the look framing range (±10%). Golden regression via PRD 12 G-REG once available. These are regression and hygiene gates, never quality claims. Test: runs in `template-lookdev.yml`.
- [ ] [G] T3.13 `tools/agent-templates/look-floor.ts` + wire into `check:templates` (static part local and in CI; runtime part on macos-14). Report root `templates/*` drift as `drift` warnings. Test: `tests/unit/create-aura3d/look-floor.test.ts` (fixtures: a lean template fails, an ambient-only template fails, a rewritten template passes).

### 16.5 Phases 4–7 (integration)

- [ ] [E] T4.1 IC1: confirm v1 detection picks `environments.preset`/`output.preset`/`quality` for studio looks. Remove the v0 renderer overrides for those looks. Test: looks unit test under the real exports.
- [ ] [E] T4.2 IC1: when `capabilities.ambientAdditive` is true, `look/ambient-kills-ibl` is off, and skills drop the "ambient disables IBL" warning (keep "prefer hemisphere"). Test: lint test with the capability on.
- [ ] [T] T4.3 IC2: rebuild the 6 game templates on `createGame` (PRD 09 :1407 terms: sound cues from `game-sfx-core`, `juice.define`, HUD theme, touch preset) with PRD 08 rigs (`app.camera.use`). `characterExpected` becomes blocking. Test: template tests assert 0 capture branches, 0 synth cues, rig applied (camera pose changes when the player moves).
- [ ] [E] T4.4 IC2: biome looks switch to v1 (`world.biome`). Delete the v0 entries for ids whose v1 passes the template floor. Test: `diagnostics().look.expansion === "v1-contracts"` for all templates with those looks.
- [ ] [V] T5.1 IC3: approve template goldens via G-PANEL (I3). Run agent-eval round 1 (I4). File every prompt with median < 6.5 against the owning PRD by dominant cause.
- [ ] [T] T6.1 IC4: port accepted PRD 14 pilot patterns into templates (Turbo → racing, Aura Clash → fighting, Orbital → arena-shooter, Bank → product/interior recipe). Re-run round 2 (I5).
- [ ] [E] T7.1 IC5: default `unsupported: "reject"`; delete `visualQA` aliases, the report 1.0 fields, `"hud"` in `AuraPromptEffectId` and `contracts-shim.d.ts`. Test: `check:public-api` diff matches the 4.0 removal list.
- [ ] [C] T7.2 Supply codemod rules (§11.5) to PRD 15's `aura3d migrate`. Test: fixtures (ambient-only scene → look + TODO).

---

## 17. Test requirements

All browser, GPU and capture tests run remotely on GitHub Actions **`macos-14`** (ANGLE Metal, the
`quality-rebuild-capture.yml` pattern, reference run 37289688772). Never SwiftShader/ubuntu for any visual
assertion. Never local browsers or local Docker. Unit tests run under `vitest` in CI. Locally, only typecheck and
`pnpm exec vitest run <file>` for the narrow unit files touched.

### 17.1 Unit (vitest)

- `tests/unit/agent-api/looks.test.ts` (T1.1–T1.3): ids, v0 invariants (no ambient, shadow true, background luma),
  expansion selection under `A3D_LOOK_EXPANSION`, overrides clamping, multiple-look warning.
- `tests/unit/agent-api/look-lint.test.ts` (T1.4–T1.6): one positive and one negative fixture per rule; capability
  gating; exact messages; no "lights.ambient" suggestion text anywhere.
- `tests/unit/agent-api/prompt-plan-v2.test.ts` (T1.8–T1.10): mapping tables; warn vs reject; report 2.0;
  deprecated 1.0 fields; 500-plan property test (`fast-check` if already a dev dependency, otherwise a seeded
  generator in the test file, no new dependency).
- `tests/unit/agent-api/structural-qa.test.ts` (T1.11).
- `tests/unit/tools/craft-ratio.test.ts` (T0.7), `agent-skills-check.test.ts` (T2.2), `agent-eval-prompts.test.ts`
  (T0.3), `tests/unit/cli/look-capture.test.ts`, `look-judge.test.ts`, `doctor-look.test.ts` (T2.16–T2.18).
- `tests/unit/create-aura3d/templates.test.ts` (extended: 20 templates, manifest coverage),
  `look-floor.test.ts` (T3.13).

### 17.2 Browser / GPU (macos-14)

- `tests/browser/template-look-floor.spec.ts`: builds each template from packed tarballs, mounts it, reads
  `diagnostics()`, asserts the runtime floor (§7.5), and captures the 3 shots × 2 viewports for the panel.
- Per-template `tests/screenshot.spec.ts` (T3.12) and `playable.spec.ts` / `route-health.spec.ts` (kept, run in
  `template-lookdev.yml`).
- `tests/browser/looks-expansion.spec.ts`: renders `scene().look(id).add(model(DamagedHelmet))` for all 15 looks
  at Medium. Asserts non-void background luma, specular present on the metal mask (centre-region luma variance
  above a threshold calibrated so that a broken control with IBL off fails), and a shadow region darker than its
  surroundings. These are regression signals, not quality.
- `tests/browser/prompt-plan-render.spec.ts`: for the 4 recipes × 3 plans, the captured frame plus
  `report.visualSystems` go into the vision honesty check (S3).

### 17.3 Workflows

- `template-lookdev.yml` (T0.2): push to main on template paths + dispatch.
- `agent-output-eval.yml` (T0.5): dispatch + weekly on main. Secrets (Prism key) only in jobs that never run
  untrusted PR code.
- `check:skills`, `check:templates` (static floor) and unit tests run in the existing PR CI.

---

## 18. Visual acceptance tests

Protocol: PRD 12 / `_sections/E` scoring protocol. Remote capture at the default URL only (G5); calibration set
first; vision model via Kiro Prism + named humans; median; spread > 2 reconciled; admitted loss fails. Vision
alone never passes an item. Engineering gates (§17) never count toward these.

### 18.1 STANDALONE acceptance (passable by this PRD alone, on today's engine with v0 looks)

| Id | Scenes / items | Reference | Judged criterion | Threshold | Review |
|---|---|---|---|---|---|
| S1 | All 20 templates, desktop + mobile, 3 shots | Each template's own 3.0.1 baseline (Phase 0), blind A/B | `overall_visual_quality` and the 12 agent categories | Game templates + product-viewer: median gain ≥ **+1.5** overall; no category drops > 0.5 vs baseline | vision + ≥ 1 named human |
| S2 | 6 game templates | research/21 games (same rubric) | overall; shadows; ibl_reflections; environment_world; atmospheric_effects | median overall ≥ **4.5**, none < 4.0; ibl_reflections ≥ 4.5; environment_world ≥ 4.5; atmospheric ≥ 4.0; shadows ≥ 3.5 (shadow strength is PRD 02's) | vision + ≥ 1 human |
| S3 | 4 recipes × 3 plans (12 frames) | The plan's own `report.visualSystems` and `rejected` | "Does the frame show every listed system, and none of the rejected ones?" | **12/12** agree (any judge disagreement fails the item) | vision + 1 human |
| S4 | Lint discrimination: 18 shipped game sources + 19 baseline templates + 4 broken controls (ambient-only, `pixelRatio: 1`, solid void, primitive hero) injected into a rewritten template | research/21 category scores | lint flags ≥ 1 error on every game with ibl_reflections ≤ 2 or shadows ≤ 2; 0 errors on rewritten templates; each broken control flagged with its specific code | 100% / 0 / 4 of 4 | automated + human spot-check of 5 |
| S5 | Skills/llms text | research/12 §1.2 numbers | craft-ratio targets of §6.5 | all met | automated + art-director read-through of art-direction skill (signed note in PR) |
| S6 | `aura3d look capture` on product-viewer and mini-game via gh-actions | — | PNGs + appliedLook returned | ≤ 8 min per round, 3 consecutive successful runs | automated |
| S7 | Agent-eval pilot: P01, P06, P08, P12 × 1 seed with new skills/templates, today's engine | round-0 frames for the same prompts | panel overall | median ≥ round-0 median **+1.5**; A3 escapes = 0; A4 dishonest = 0 | vision + ≥ 1 human |
| S8 | 8 three-compat templates | The named three.js r185 example (rendered by the PRD 12 harness when available, else a threejs.org capture on macos-14) | Overall vs 3.0.1 baseline; gap to three noted | each ≥ baseline + **1.5**; the gap to three is recorded, not gated | vision + 1 human |

### 18.2 INTEGRATED acceptance (evaluated at checkpoints; never blocks starting or merging)

| Id | IC | Items | Reference | Criterion | Threshold |
|---|---|---|---|---|---|
| I1 | IC1 | product-viewer template with 10 Khronos samples (bar list) | three r185 RoomEnvironment + ContactShadows | Product bar (`_sections/E`) | panel ≥ **7.0** and ≥ three − 0.5 on each sample |
| I2 | IC2 | 6 game templates (desktop + mobile) | research/21 rubric | overall; min category; mobile_presentation | each ≥ **6.0**; no category < 4.5; mobile_presentation ≥ 5 |
| I3 | IC3 | All 20 templates | v2 reference scenes + premium refs | Bar per domain | game templates median ≥ 6.5; product ≥ 7.0; character templates ≥ 6.5; environment-led templates ≥ 6.5; goldens approved |
| I4 | IC3 | Agent eval round 1 (12 × 3) | calibration set; round 0 | A1–A4 | A2 median ≥ **6.5**, no prompt median < 5; A3 = 0; A4 = 0 |
| I5 | IC4 | Agent eval round 2 + game templates | same | A1–A4 + G1 for game templates | I4 holds; game templates ≥ **7.0** overall, no category < 5 (G1/G2) |
| I6 | IC5 | 4.0 RC: round 3 + templates | I5 records | no regression | every item within 0.5 of I5 and I4/I5 thresholds still hold |

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

The tier definitions and hardware are `_sections/E` "Performance tiers" (owned by PRD 11). Tier values are
targets until PRD 11 measures them on named devices. The macos-14 runner is the Low-desktop proxy.

| Budget | Low | Medium (default) | High | Ultra |
|---|---|---|---|---|
| Template frame rate (measured rAF p50 / p95 frame) | ≥ 55 fps on CI proxy / ≤ 22 ms; 30 fps floor mobile | 60 / ≤ 20 ms at 1080p | 60 / ≤ 20 ms at 1440p | 30–60; capture any |
| Look cost over a no-look scene (GPU) | ≤ 2.0 ms (PMREM 128, 1 cascade 1024², no AO, 3-mip bloom) | ≤ 3.5 ms (PMREM 256, 2–3 cascades 2048², SSAO half-res, 5-mip bloom, grade) | ≤ 5.5 ms | ≤ 9 ms |
| Template draw calls | ≤ 150 | ≤ 400 | ≤ 1,000 | ≤ 2,500 |
| Template first interactive frame / transfer | ≤ 3 s / ≤ 8 MB (1k HDRI, KTX2 ETC1S) | ≤ 3 s / ≤ 20 MB | ≤ 4 s / ≤ 40 MB | — |
| Look-lint CPU | ≤ 0.2 ms per snapshot change; 0 per frame | same | same | same |
| Look expansion CPU (snapshot) | ≤ 0.5 ms | same | same | same |

Bundle (gzip, published package, all tiers): root "." growth from this PRD ≤ 9 KB (T1.12). The template starter
budget `mini-game starter app before user assets` ≤ 250,000 B is kept (PRD 01 §18). If engine-path templates
exceed it before PRD 15 code-splitting lands, the overage is reported to PRD 15. It is never met by removing
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
| WebGPU | macos-14 Chromium flag | capture report-only (PRD 11 owns parity) | no |
| SwiftShader / headless ubuntu | — | never used for visuals | — |

---

## 21. Mobile coverage

- Every capture includes 390×844 at DPR 3 emulation. Recipes specify portrait framing (fov +8°, subject 25–40%
  height for games, HUD safe areas, thumb-zone touch controls).
- Game templates ship touch controls: PRD 09 touch preset after IC2; before that, `game.input` pointer/touch
  bindings in template code, with on-screen buttons as DOM.
- `quality: "auto"` must pick Low on mobile-class GPUs (PRD 11). The v0 looks cap `pixelRatio` at 2. They never
  set 3.
- No mobile performance claim until PRD 11's real-device lane (AWS Device Farm) runs. The mobile budgets in §19 stay
  labelled "unverified" until then.
- `mobile_presentation ≥ 5` is part of I2 and I5.

---

## 22. Screenshots / evidence required

All evidence is bound to commit SHA + workflow run ID + asset hashes and stored as workflow artifacts. Indexes go
in `benchmarks/agent-eval/` and in the PRD 12 history.
- Phase 0: 19 templates × 3 shots × 2 viewports (3.0.1 baseline) and the round-0 agent-eval frames with panel records.
- Each template PR: the 6 frames before and after, `appliedLook.json`, `lint.json`, and the floor result JSON.
- S3: 12 recipe frames with their reports, side by side.
- S4: lint output over the 18 game sources, the 19 baseline templates and the 4 broken controls.
- S7, I4–I6: per-run `src/**`, transcript, build log, the frames, `LookJudgement` files from the agent's own loop
  (shows the agent iterated), the escape-scan output and the A4 diff.
- No evidence from `?capture=review` or any capture mode that changes look parameters. Self-judgements are
  stored, but never as pass evidence.

---

## 23. Completion criteria

1. S1–S8 passed and recorded (this PRD's merge-ready bar).
2. `rg "@aura3d/lean" packages/create-aura3d/templates` = 0; `rg "lights\.ambient\(" packages/create-aura3d/templates/*/src` = 0;
   no template enables the overlay by default; no constant evidence literals (`doctor --look` clean on all 20).
3. `compilePromptPlan` never reports a system absent from the compiled snapshot (property test + S3).
4. The `index.ts:18256` ambient suggestion is gone. No agent-facing text recommends `lights.ambient` as a fix.
5. `aura3d-art-direction` is installed for every template. Craft ratio targets are met in CI.
6. `llms.txt` is rewritten (≤ 260 lines, craft ≥ evidence, "don't claim" separated from "don't use").
7. The agent eval runs on schedule and has a round-0 baseline and at least one post-change round.
8. Integrated I1–I6 are tracked in the PRD 12 history. Final program completion requires I4 and I5 to pass. Until
   then, no README, skill or release note says agent output or templates reach three.js quality.

---

## 24. Rollback

- Templates: republish the previous `create-aura3d` under the `latest` dist-tag. Users can always run
  `npm create aura3d@<prev>`.
- Skills/llms: the previous `@aura3d/cli` version restores them. `aura3d init` never overwrites user-modified files.
- Engine: `looks` is opt-in, so reverting is code removal with no data migration. Lint text revert is one commit.
  Prompt plan v2 can drop to `unsupported: "warn"` (the 3.x default) without an API change.
- Eval workflows: disable via `workflow_dispatch` only. They never gate PRs.

---

## 25. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v0 looks hit engine limits (shadow 0.32, 128 px env when no HDRI, no sky background) and S2 misses | medium | standalone bar missed | S2 thresholds are set at what v0 can reach. Shortfall categories are attributed to PRD 02/03/10 by dominant cause, not patched with fakes |
| Looks duplicate PRD 10 biome rigs | medium | two lighting truths | Biome ids delegate wholesale in v1. Only 4 studio looks are defined here. v0 entries are deleted per id at IC2 (T4.4) |
| PRD 02 and PRD 13 both edit `index.ts:18256` / prompt recipe lines | high | merge conflict | §13.1 C-02-lint / C-02-kits ownership, to be confirmed in CONTRACTS.md |
| Craft-ratio regex gamed by keyword stuffing | medium | fake compliance | Row-density rule plus the vision eval as the real measure. An art-director read-through is required for S5 |
| Agents self-judge too kindly | high | loop stops early | Hard lint checks must be clean. A self-judgement is never a pass. The panel judges the eval |
| Remote capture loop too slow or unavailable for users | medium | agents skip the loop | `--runner local` for users who allow it; lint + `appliedLook` give pixel-free feedback; failure → `prototype` label naming the failed step |
| Template asset size grows (HDRIs, kits) | medium | load budget | 1k HDRIs, KTX2 via PRD 05, Low-tier budget gate in §19 |
| Eval cost (36 agent runs) | medium | infrequent rounds | Weekly schedule; the pilot subset (S7) for quick checks |
| Prism or the agent CLI changes behaviour between rounds | medium | noisy comparisons | Model/version pinned per round in `run.json`; calibration set every round |
| Removing the "don't use" reading makes agents claim unsupported features | low | false claims | Claims stay gated in evidence-review and boundaries; A4 checks report honesty |
| Root `templates/` drift keeps an old copy alive | medium | confusion | Drift reported by the floor tool; PRD 15 decides deletion |

---

## 26. Out of scope

- Any renderer, shader, lighting, shadow, post, material, texture, glTF, VFX, animation, camera-rig, world or tier
  implementation (PRDs 01–08, 10, 11).
- Changing engine defaults when nothing is authored (PRD 02 neutral env, PRD 10 category biome, PRD 01/11 DPR).
- `@aura3d/lean` deletion and bundle budget renegotiation (PRD 15). Root `templates/` deletion (PRD 15).
- `sceneKits` lighting (PRD 02) and kit content beyond lint compliance.
- Rebuilding the 18 games (PRD 14). Removing route `?capture=review` branches (PRD 09).
- The capture harness, golden store, panel tooling and calibration set (PRD 12). This PRD consumes them.
- The `packages/create-aura3d/src` `showcase-spec-*` proof compilers (8,634 lines). Flagged for PRD 15 deletion.
- Episode/animation-studio tooling beyond stage lighting.
- Marketing or README quality claims. None may be made from this PRD's gates.


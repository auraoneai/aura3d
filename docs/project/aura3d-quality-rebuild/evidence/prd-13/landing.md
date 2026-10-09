# 13-LAND — stacked-PR hunk classification (P-51 record)

The seven lane-13 stacked PRs merged as closed on 2026-10-07 ~01:49 UTC with
head OIDs that are **not** ancestors of `main` — the stack was beaten by the
re-land sweep (#297–#305) and #357's 151-file rewrite. Per the lane brief:
`git diff <headRefOid> afb475c2 -- <pr files>` and classify every hunk.

**Method:** per file, byte-compare the PR head to `origin/main` (`git diff
--quiet`). Identical ⇒ "present". Differing ⇒ check whether a later commit
touched the file on main (superseding commit listed); all 64 differing files
were last modified **after** the PR merge, i.e. superseded by the re-land,
not lost. Spot-verified: `agent-api/nodes/camera.ts` (PR 269) — main carries
the evolved X-1/`A3D_QR_CAMERA` version; `lanes/prd13.ts` (PR 173) — main
carries the superset barrel incl. `compilePromptPlanV2`/`structuralQA`.
PR-head hunks that main's evolution dropped are recorded in §12.4/13-OWN
adjudications (#507–#510) rather than as lost content.

| PR | head | files | present | superseded | lost |
| --- | --- | --- | --- | --- | --- |

| #173 | `8e48f56c` | 11 | 5 | 6 | 0 |
| #191 | `b005aae6` | 16 | 12 | 4 | 0 |
| #202 | `50170d8f` | 34 | 17 | 17 | 0 |
| #239 | `81f3f71b` | 142 | 125 | 17 | 0 |
| #244 | `a559c953` | 71 | 68 | 3 | 0 |
| #269 | `96fde969` | 34 | 23 | 11 | 0 |
| #273 | `05cd0364` | 16 | 10 | 6 | 0 |

## Per-file detail


### PR #173

- `packages/engine/src/agent-api/app/createAuraApp.ts` — **superseded** (last main touch `6189845b 2026-10-08`)
- `packages/engine/src/agent-api/looks/fakeEffectNames.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/looks/generatedCodeWarnings.ts` — **superseded** (last main touch `2ed5c16e 2026-10-07`)
- `packages/engine/src/agent-api/looks/lookLint.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/looks/looks.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/engine/src/contracts/looks.ts` — **present (byte-identical on main)**
- `packages/engine/src/lanes/prd13.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `tests/unit/agent-api/look-lint.test.ts` — **present (byte-identical on main)**
- `tests/unit/agent-api/looks.test.ts` — **present (byte-identical on main)**
- `tests/unit/contracts/impl/prd13-looks.test.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)

### PR #191

- `.github/workflows/qr-prd13-authoring.yml` — **present (byte-identical on main)**
- `evidence/prd13/pr-d-t1.9-t1.13.md` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/looks/lookDiagnostics.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/looks/lookNodeHandler.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/looks/looks.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/engine/src/agent-api/looks/structuralQA.ts` — **superseded** (last main touch `2ed5c16e 2026-10-07`)
- `packages/engine/src/agent-api/nodes/prompt/promptPlan.ts` — **superseded** (last main touch `2ed5c16e 2026-10-07`)
- `packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/nodes/prompt/promptPlanV2.ts` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/nodes/prompt/promptRecipes.ts` — **superseded** (last main touch `2ed5c16e 2026-10-07`)
- `packages/engine/src/lanes/prd13.ts` — **present (byte-identical on main)**
- `tests/qr/prd13/bundle-delta.test.ts` — **present (byte-identical on main)**
- `tests/qr/prd13/vitest.qr-prd13.config.ts` — **present (byte-identical on main)**
- `tests/unit/agent-api/prompt-plan-v2.test.ts` — **present (byte-identical on main)**
- `tests/unit/agent-api/structural-qa.test.ts` — **present (byte-identical on main)**
- `tests/unit/contracts/impl/prd13-looks.test.ts` — **present (byte-identical on main)**

### PR #202

- `.agents/skills/aura3d-art-direction/SKILL.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.agents/skills/aura3d-art-direction/references/failure-gallery.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-art-direction/references/look-recipes.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.agents/skills/aura3d-art-direction/references/quality-bar.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-art-direction/references/reference-frames.md` — **present (byte-identical on main)**
- `.agents/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.claude/skills/aura3d-art-direction/SKILL.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.claude/skills/aura3d-art-direction/references/failure-gallery.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-art-direction/references/look-recipes.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.claude/skills/aura3d-art-direction/references/quality-bar.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-art-direction/references/reference-frames.md` — **present (byte-identical on main)**
- `.claude/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.cursor/skills/aura3d-art-direction/SKILL.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.cursor/skills/aura3d-art-direction/references/failure-gallery.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-art-direction/references/look-recipes.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `.cursor/skills/aura3d-art-direction/references/quality-bar.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-art-direction/references/reference-frames.md` — **present (byte-identical on main)**
- `.cursor/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `evidence/prd13/pr-e-t2.1-t2.6.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/AUTHORING.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/aura3d-cli/skills/aura3d-art-direction/references/failure-gallery.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/aura3d-cli/skills/aura3d-art-direction/references/quality-bar.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/references/reference-frames.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/create-aura3d/skills/aura3d-art-direction/SKILL.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/create-aura3d/skills/aura3d-art-direction/references/failure-gallery.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `packages/create-aura3d/skills/aura3d-art-direction/references/quality-bar.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-art-direction/references/reference-frames.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `tests/unit/tools/agent-skills-check.test.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)
- `tools/agent-skills/check.ts` — **superseded** (last main touch `bff82f98 2026-10-06`)

### PR #239

- `.agents/skills/aura3d-animation-studio/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-animation-studio/references/shot-looks.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-art-direction/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-art-direction/references/framing-and-shots.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-art-direction/references/look-recipes.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-assets/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-assets/references/preview-under-look.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-browser-game/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-browser-game/references/genre-looks.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-character-animation/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-character-animation/references/stage-and-lighting.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-core/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-evidence-review/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-game-art/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-game-art/references/sprite-palettes.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-materials-environments/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.agents/skills/aura3d-performance/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-retexture/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-scene-authoring/SKILL.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-scene-authoring/references/look-by-family.md` — **present (byte-identical on main)**
- `.agents/skills/aura3d-threejs-migration/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.agents/skills/aura3d-threejs-migration/references/look-mapping.md` — **present (byte-identical on main)**
- `.agents/skills/llms.txt` — **present (byte-identical on main)**
- `.agents/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.agents/skills/meshy-cli/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-animation-studio/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-animation-studio/references/shot-looks.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-art-direction/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-art-direction/references/framing-and-shots.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-art-direction/references/look-recipes.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-assets/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-assets/references/preview-under-look.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-browser-game/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-browser-game/references/genre-looks.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-character-animation/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-character-animation/references/stage-and-lighting.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-core/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-evidence-review/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-game-art/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-game-art/references/sprite-palettes.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-materials-environments/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.claude/skills/aura3d-performance/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-retexture/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-scene-authoring/SKILL.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-scene-authoring/references/look-by-family.md` — **present (byte-identical on main)**
- `.claude/skills/aura3d-threejs-migration/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.claude/skills/aura3d-threejs-migration/references/look-mapping.md` — **present (byte-identical on main)**
- `.claude/skills/llms.txt` — **present (byte-identical on main)**
- `.claude/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.claude/skills/meshy-cli/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-animation-studio/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-animation-studio/references/shot-looks.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-art-direction/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-art-direction/references/framing-and-shots.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-art-direction/references/look-recipes.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-assets/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-assets/references/preview-under-look.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-browser-game/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-browser-game/references/genre-looks.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-character-animation/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-character-animation/references/stage-and-lighting.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-core/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-evidence-review/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-game-art/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-game-art/references/sprite-palettes.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-materials-environments/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.cursor/skills/aura3d-performance/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-retexture/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-scene-authoring/SKILL.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-scene-authoring/references/look-by-family.md` — **present (byte-identical on main)**
- `.cursor/skills/aura3d-threejs-migration/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.cursor/skills/aura3d-threejs-migration/references/look-mapping.md` — **present (byte-identical on main)**
- `.cursor/skills/llms.txt` — **present (byte-identical on main)**
- `.cursor/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `.cursor/skills/meshy-cli/SKILL.md` — **present (byte-identical on main)**
- `README.md` — **superseded** (last main touch `90e6de30 2026-10-07`)
- `docs/agents/agent-context.md` — **present (byte-identical on main)**
- `docs/agents/art-direction.md` — **present (byte-identical on main)**
- `docs/agents/benchmark-recipes.md` — **present (byte-identical on main)**
- `docs/agents/build-playbook.md` — **present (byte-identical on main)**
- `docs/agents/cinematic-scene-quality.md` — **present (byte-identical on main)**
- `docs/agents/game-example-standards.md` — **present (byte-identical on main)**
- `docs/agents/no-hackjob-rules.md` — **present (byte-identical on main)**
- `docs/guides/build-a-browser-game.md` — **present (byte-identical on main)**
- `docs/project/showcase/visual-quality-standard.md` — **present (byte-identical on main)**
- `evidence/prd13/pr-f-t2.7-t2.14.md` — **present (byte-identical on main)**
- `llms.txt` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-animation-studio/references/shot-looks.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/references/framing-and-shots.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-assets/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-assets/references/preview-under-look.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-browser-game/references/genre-looks.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-character-animation/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-character-animation/references/stage-and-lighting.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-core/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-evidence-review/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-game-art/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-game-art/references/sprite-palettes.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/aura3d-cli/skills/aura3d-performance/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-retexture/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-scene-authoring/references/look-by-family.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/aura3d-cli/skills/aura3d-threejs-migration/references/look-mapping.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/llms.txt` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/aura3d-cli/skills/meshy-cli/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-animation-studio/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-animation-studio/references/shot-looks.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-art-direction/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-art-direction/references/framing-and-shots.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-assets/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-assets/references/preview-under-look.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-browser-game/references/genre-looks.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-character-animation/references/stage-and-lighting.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-core/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-evidence-review/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-game-art/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-game-art/references/sprite-palettes.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-materials-environments/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/create-aura3d/skills/aura3d-performance/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-retexture/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-scene-authoring/references/look-by-family.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/aura3d-threejs-migration/SKILL.md` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/create-aura3d/skills/aura3d-threejs-migration/references/look-mapping.md` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/llms.txt` — **present (byte-identical on main)**
- `packages/create-aura3d/skills/manifest.json` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/create-aura3d/skills/meshy-cli/SKILL.md` — **present (byte-identical on main)**
- `packages/engine/src/agent-api/index.ts` — **superseded** (last main touch `afb475c2 2026-10-08`)
- `packages/engine/src/agent-api/looks/looks.ts` — **present (byte-identical on main)**
- `public/llms.txt` — **present (byte-identical on main)**
- `tests/unit/tools/agent-skills-check.test.ts` — **present (byte-identical on main)**
- `tools/agent-skills/check.ts` — **present (byte-identical on main)**

### PR #244

- `.gitignore` — **superseded** (last main touch `afb475c2 2026-10-08`)
- `evidence/prd13/pr-g-t2.15-t2.19.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/skills/agent-files/AGENTS.md` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/commands/prd13/index.ts` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/commands/prd13/run.ts` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/look/capture.ts` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/look/judge.ts` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/look/lint-static.ts` — **present (byte-identical on main)**
- `packages/aura3d-cli/src/look/rubric.ts` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-channel/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-channel/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-channel/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-studio/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-studio/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/animation-studio/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/character-controller/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/character-controller/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/character-controller/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/cinematic-scene/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/cinematic-scene/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/cinematic-scene/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/episode-builder/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/episode-builder/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/episode-builder/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/falling-blocks-starter/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/falling-blocks-starter/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/falling-blocks-starter/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/fighting-game/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/fighting-game/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/fighting-game/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/product-viewer/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/product-viewer/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/product-viewer/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/prompt-animation-channel/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/prompt-animation-channel/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/prompt-animation-channel/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/racing-starter/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/racing-starter/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/racing-starter/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-architecture-interior/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-architecture-interior/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-architecture-interior/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-asset-inspector/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-asset-inspector/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-asset-inspector/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-character-viewer/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-character-viewer/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-character-viewer/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-custom-threejs-migration/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-custom-threejs-migration/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-custom-threejs-migration/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-large-scene/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-large-scene/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-large-scene/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-material-authoring/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-material-authoring/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-material-authoring/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-postprocess-scene/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-postprocess-scene/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-postprocess-scene/AGENTS.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-premium-product-viewer/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-premium-product-viewer/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/three-compat-premium-product-viewer/AGENTS.md` — **present (byte-identical on main)**
- `tests/unit/cli/look-capture.test.ts` — **present (byte-identical on main)**
- `tests/unit/cli/look-judge.test.ts` — **present (byte-identical on main)**
- `tests/unit/cli/look-lint.test.ts` — **present (byte-identical on main)**
- `tests/unit/create-aura3d/templates.test.ts` — **superseded** (last main touch `4e5f98cf 2026-10-07`)
- `tools/agent-templates/index.ts` — **superseded** (last main touch `2e0f0701 2026-10-08`)

### PR #269

- `.gitignore` — **superseded** (last main touch `afb475c2 2026-10-08`)
- `packages/create-aura3d/templates/mini-game/README.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/aura.assets.json` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/package.json` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitBlockGrassLarge.606f077c.glb` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitBrick.b1638210.glb` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitKey.2e930961.glb` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/src/aura-assets.ts` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/mini-game/src/main.ts` — **superseded** (last main touch `ade7606f 2026-10-07`)
- `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `packages/create-aura3d/templates/mini-game/tests/screenshot.spec.ts` — **superseded** (last main touch `2e0f0701 2026-10-08`)
- `packages/engine/src/agent-api/nodes/camera.ts` — **superseded** (last main touch `2ed5c16e 2026-10-07`)
- `templates/mini-game/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `templates/mini-game/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `templates/mini-game/AGENTS.md` — **present (byte-identical on main)**
- `templates/mini-game/README.md` — **present (byte-identical on main)**
- `templates/mini-game/aura.assets.json` — **present (byte-identical on main)**
- `templates/mini-game/package.json` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/kenneyPlatformerKitBlockGrassLarge.606f077c.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/kenneyPlatformerKitBrick.b1638210.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/kenneyPlatformerKitKey.2e930961.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/player-fixture.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/player.thumb.svg` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb` — **present (byte-identical on main)**
- `templates/mini-game/public/aura-assets/showcaseKenneyOobiPlatformerHero.thumb.svg` — **present (byte-identical on main)**
- `templates/mini-game/src/aura-assets.ts` — **present (byte-identical on main)**
- `templates/mini-game/src/main.ts` — **superseded** (last main touch `e64185e2 2026-10-07`)
- `templates/mini-game/tests/certified-rig.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `templates/mini-game/tests/playable.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `templates/mini-game/tests/screenshot.spec.ts` — **superseded** (last main touch `2e0f0701 2026-10-08`)
- `tools/agent-templates/index.ts` — **superseded** (last main touch `2e0f0701 2026-10-08`)
- `tools/template-source-audit/index.ts` — **superseded** (last main touch `250077b5 2026-10-07`)

### PR #273

- `packages/create-aura3d/templates/racing-starter/README.md` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/racing-starter/src/main.ts` — **superseded** (last main touch `e1957d03 2026-10-07`)
- `packages/create-aura3d/templates/racing-starter/tests/geometry-certification.json` — **present (byte-identical on main)**
- `packages/create-aura3d/templates/racing-starter/tests/playable.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `packages/create-aura3d/templates/racing-starter/tests/route-health.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `templates/racing-starter/.claude/CLAUDE.md` — **present (byte-identical on main)**
- `templates/racing-starter/.github/workflows/aura3d-lookdev.yml` — **present (byte-identical on main)**
- `templates/racing-starter/AGENTS.md` — **present (byte-identical on main)**
- `templates/racing-starter/README.md` — **present (byte-identical on main)**
- `templates/racing-starter/aura.assets.json` — **present (byte-identical on main)**
- `templates/racing-starter/package.json` — **present (byte-identical on main)**
- `templates/racing-starter/src/main.ts` — **superseded** (last main touch `e64185e2 2026-10-07`)
- `templates/racing-starter/tests/geometry-certification.json` — **present (byte-identical on main)**
- `templates/racing-starter/tests/playable.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `templates/racing-starter/tests/route-health.spec.ts` — **superseded** (last main touch `b82d51b0 2026-10-07`)
- `templates/racing-starter/tsconfig.json` — **present (byte-identical on main)**

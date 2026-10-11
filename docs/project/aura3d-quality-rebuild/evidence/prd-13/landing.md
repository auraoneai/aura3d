# 13-LAND — stacked-PR hunk classification (P-51 record)

Target: `origin/main` @ `b60a669a` (2026-10-10). Secondary comparison: `afb475c2` (brief).

The seven stacked PRs merged into each other's branches (2026-10-07 01:49-01:55 UTC); their
bottom base `qr/prd13-agent-eval-looks` was already merged to main by #136 (`45ad378e`), so none
of their heads or merge commits is an ancestor of main. Their content reached main only through
later squash PRs (mainly #276 `bff82f98`, plus #303/#305/#350/#357/#336).

## Method (reproducible)

`python3 landing-classify.py <repo> <target> landing-prs.json` (both files sit next to this record) takes each PR's own diff (`git diff <base>...<head>`,
default context) and classifies every hunk:

- present: every significant `+` line (>= 6 chars, not bracket-only) exists in the target's copy of
  the file, and every significant `-` line not re-added in the head file is absent.
- superseded: otherwise, if `git log <target> -S<line> -- <path>` finds a commit that changed the
  line's occurrence count, the newest such commit is cited (it removed or replaced the PR's line).
  Hunks whose lines never existed on main at that path were read side by side and adjudicated by
  hand ("manual:" rows below); hunks whose lines survive only in other files are marked so.
- LOST: neither of the above and no manual adjudication. Count below is 0.

## Summary

| PR | base -> head | hunks | present | superseded | LOST | superseded by P-37 commits | vs afb475c2: present / not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #173 | `cf7e73cb9` -> `8e48f56c7` | 13 | 10 | 3 | 0 | 0 | 10 / 3 |
| #191 | `8e48f56c7` -> `b005aae6c` | 27 | 26 | 1 | 0 | 0 | 26 / 1 |
| #202 | `b005aae6c` -> `50170d8f7` | 36 | 24 | 12 | 0 | 0 | 24 / 12 |
| #239 | `50170d8f7` -> `81f3f71be` | 292 | 286 | 6 | 0 | 0 | 286 / 6 |
| #244 | `81f3f71be` -> `a559c9534` | 71 | 71 | 0 | 0 | 0 | 71 / 0 |
| #269 | `a559c9534` -> `96fde9699` | 59 | 45 | 14 | 0 | 5 | 45 / 14 |
| #273 | `96fde9699` -> `05cd03646` | 37 | 28 | 9 | 0 | 7 | 28 / 9 |
| total | | 535 | 490 | 45 | 0 | 12 | |

Result: 0 hunks lost. Present / not-present counts against `afb475c2` match main for every PR.

Caveat (13-MASKS / P-37): the hunks marked P-37 above are superseded by `b82d51b0` and `e64185e2`,
the look-floor recalibration commits that 13-MASKS restores to pre-#357 expectations via #427.
When #427 lands, re-run this classifier and re-check those hunks; they are superseded today, not
endorsed.

Superseding commits: `bff82f98` (#276), `ade7606f` (#357), `444cbf2c` (#350), `19ae86f2` (#303), `e64185e2` (#357), `b82d51b0` (#357), `4dafae4b` (#305), `e2f46a24` (#357), `250077b5` (#336).

## Per-hunk detail

### PR #173

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `packages/engine/src/agent-api/app/createAuraApp.ts` | `-221,7 +221,11` | present |  | 3+/1- lines match |
| `packages/engine/src/agent-api/looks/fakeEffectNames.ts` | `-0,0 +1,100` | present |  | 90+/0- lines match |
| `packages/engine/src/agent-api/looks/generatedCodeWarnings.ts` | `-1,14 +1,62` | superseded | `bff82f988` #276 | pickaxe: newest main commit changing a missing line |
| `packages/engine/src/agent-api/looks/lookLint.ts` | `-0,0 +1,319` | present |  | 218+/0- lines match |
| `packages/engine/src/agent-api/looks/looks.ts` | `-0,0 +1,377` | superseded | `bff82f988` #276 | manual: main introduced the file in an evolved form: module-level `defineAuraAssets` became a lazy builder (TDZ fix), `preset` gained overloads, `expandLookChildren` added |
| `packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.ts` | `-0,0 +1,139` | present |  | 116+/0- lines match |
| `packages/engine/src/contracts/looks.ts` | `-18,8 +18,20` | present |  | 11+/0- lines match |
| `packages/engine/src/contracts/looks.ts` | `-28,9 +40,33` | present |  | 16+/1- lines match |
| `packages/engine/src/lanes/prd13.ts` | `-1,10 +1,60` | superseded | `bff82f988` #276 | manual: only the T1.8 doc-comment line differs; main's barrel is a superset (T1.10/T1.11/T1.13 exports + `providePrd13Contracts`) |
| `tests/unit/agent-api/look-lint.test.ts` | `-0,0 +1,203` | present |  | 153+/0- lines match |
| `tests/unit/agent-api/looks.test.ts` | `-1,6 +1,25` | present |  | 21+/2- lines match |
| `tests/unit/agent-api/looks.test.ts` | `-87,3 +106,186` | present |  | 130+/0- lines match |
| `tests/unit/contracts/impl/prd13-looks.test.ts` | `-0,0 +1,100` | present |  | 78+/0- lines match |

### PR #191

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `.github/workflows/qr-prd13-authoring.yml` | `-0,0 +1,35` | present |  | 26+/0- lines match |
| `evidence/prd13/pr-d-t1.9-t1.13.md` | `-0,0 +1,129` | present |  | 101+/0- lines match |
| `packages/engine/src/agent-api/looks/lookDiagnostics.ts` | `-0,0 +1,59` | present |  | 46+/0- lines match |
| `packages/engine/src/agent-api/looks/lookNodeHandler.ts` | `-0,0 +1,50` | present |  | 39+/0- lines match |
| `packages/engine/src/agent-api/looks/looks.ts` | `-192,16 +192,26` | present |  | 15+/4- lines match |
| `packages/engine/src/agent-api/looks/looks.ts` | `-300,6 +310,16` | present |  | 8+/0- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-1,11 +1,33` | present |  | 17+/1- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-65,11 +87,13` | present |  | 4+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-95,11 +119,13` | present |  | 4+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-113,10 +139,10` | present |  | 2+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-155,7 +181,9` | present |  | 3+/1- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-224,11 +252,13` | present |  | 4+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-273,11 +303,13` | present |  | 4+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-325,11 +357,13` | present |  | 4+/2- lines match |
| `packages/engine/src/agent-api/looks/structuralQA.ts` | `-376,6 +410,139` | present |  | 105+/1- lines match |
| `packages/engine/src/agent-api/nodes/prompt/promptPlan.ts` | `-3,13 +3,24` | present |  | 11+/1- lines match |
| `packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.ts` | `-31,8 +31,10` | present |  | 3+/0- lines match |
| `packages/engine/src/agent-api/nodes/prompt/promptPlanV2.ts` | `-0,0 +1,399` | present |  | 312+/0- lines match |
| `packages/engine/src/agent-api/nodes/prompt/promptRecipes.ts` | `-1,13 +1,104` | superseded | `bff82f988` #276 | pickaxe: newest main commit changing a missing line |
| `packages/engine/src/agent-api/nodes/prompt/promptRecipes.ts` | `-111,3 +202,24` | present |  | 15+/0- lines match |
| `packages/engine/src/lanes/prd13.ts` | `-8,7 +8,10` | present |  | 4+/1- lines match |
| `packages/engine/src/lanes/prd13.ts` | `-58,3 +61,49` | present |  | 38+/0- lines match |
| `tests/qr/prd13/bundle-delta.test.ts` | `-0,0 +1,85` | present |  | 68+/0- lines match |
| `tests/qr/prd13/vitest.qr-prd13.config.ts` | `-0,0 +1,17` | present |  | 12+/0- lines match |
| `tests/unit/agent-api/prompt-plan-v2.test.ts` | `-0,0 +1,359` | present |  | 274+/0- lines match |
| `tests/unit/agent-api/structural-qa.test.ts` | `-0,0 +1,134` | present |  | 105+/0- lines match |
| `tests/unit/contracts/impl/prd13-looks.test.ts` | `-98,3 +98,78` | present |  | 60+/0- lines match |

### PR #202

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `.agents/skills/aura3d-art-direction/SKILL.md` | `-0,0 +1,63` | present |  | 46+/0- lines match |
| `.agents/skills/aura3d-art-direction/references/failure-gallery.md` | `-0,0 +1,64` | present |  | 45+/0- lines match |
| `.agents/skills/aura3d-art-direction/references/look-recipes.md` | `-0,0 +1,32` | superseded | `bff82f988` #276 | manual: rig vocabulary renamed to the real camera API (`follow2d`/`fighting`/`topDown` -> `follow` (side-on)/`orthographic` (top-down), `orbital` -> `orbit`); all other cells identical |
| `.agents/skills/aura3d-art-direction/references/quality-bar.md` | `-0,0 +1,103` | present |  | 75+/0- lines match |
| `.agents/skills/aura3d-art-direction/references/reference-frames.md` | `-0,0 +1,82` | present |  | 50+/0- lines match |
| `.agents/skills/manifest.json` | `-2,42 +2,147` | superseded | `bff82f988` #276 | manual: `aura3d-art-direction` moved up in `coreSet` and its `prd` tag C5 -> QR13; main adds `aura3d-materials-environments` to game templates (ade7606f3, #357 also touched) |
| `.claude/skills/aura3d-art-direction/SKILL.md` | `-0,0 +1,63` | present |  | 46+/0- lines match |
| `.claude/skills/aura3d-art-direction/references/failure-gallery.md` | `-0,0 +1,64` | present |  | 45+/0- lines match |
| `.claude/skills/aura3d-art-direction/references/look-recipes.md` | `-0,0 +1,32` | superseded | `bff82f988` #276 | manual: rig vocabulary renamed to the real camera API (`follow2d`/`fighting`/`topDown` -> `follow` (side-on)/`orthographic` (top-down), `orbital` -> `orbit`); all other cells identical |
| `.claude/skills/aura3d-art-direction/references/quality-bar.md` | `-0,0 +1,103` | present |  | 75+/0- lines match |
| `.claude/skills/aura3d-art-direction/references/reference-frames.md` | `-0,0 +1,82` | present |  | 50+/0- lines match |
| `.claude/skills/manifest.json` | `-2,42 +2,147` | superseded | `bff82f988` #276 | manual: `aura3d-art-direction` moved up in `coreSet` and its `prd` tag C5 -> QR13; main adds `aura3d-materials-environments` to game templates (ade7606f3, #357 also touched) |
| `.cursor/skills/aura3d-art-direction/SKILL.md` | `-0,0 +1,63` | present |  | 46+/0- lines match |
| `.cursor/skills/aura3d-art-direction/references/failure-gallery.md` | `-0,0 +1,64` | present |  | 45+/0- lines match |
| `.cursor/skills/aura3d-art-direction/references/look-recipes.md` | `-0,0 +1,32` | superseded | `bff82f988` #276 | manual: rig vocabulary renamed to the real camera API (`follow2d`/`fighting`/`topDown` -> `follow` (side-on)/`orthographic` (top-down), `orbital` -> `orbit`); all other cells identical |
| `.cursor/skills/aura3d-art-direction/references/quality-bar.md` | `-0,0 +1,103` | present |  | 75+/0- lines match |
| `.cursor/skills/aura3d-art-direction/references/reference-frames.md` | `-0,0 +1,82` | present |  | 50+/0- lines match |
| `.cursor/skills/manifest.json` | `-2,42 +2,147` | superseded | `bff82f988` #276 | manual: `aura3d-art-direction` moved up in `coreSet` and its `prd` tag C5 -> QR13; main adds `aura3d-materials-environments` to game templates (ade7606f3, #357 also touched) |
| `evidence/prd13/pr-e-t2.1-t2.6.md` | `-0,0 +1,85` | present |  | 65+/0- lines match |
| `packages/aura3d-cli/skills/AUTHORING.md` | `-12,13 +12,13` | present |  | 3+/3- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` | `-0,0 +1,63` | present |  | 46+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/failure-gallery.md` | `-0,0 +1,64` | present |  | 45+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md` | `-0,0 +1,32` | superseded | `bff82f988` #276 | manual: rig vocabulary renamed to the real camera API (`follow2d`/`fighting`/`topDown` -> `follow` (side-on)/`orthographic` (top-down), `orbital` -> `orbit`); all other cells identical |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/quality-bar.md` | `-0,0 +1,103` | present |  | 75+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/reference-frames.md` | `-0,0 +1,82` | present |  | 50+/0- lines match |
| `packages/aura3d-cli/skills/manifest.json` | `-2,42 +2,147` | superseded | `bff82f988` #276 | manual: `aura3d-art-direction` moved up in `coreSet` and its `prd` tag C5 -> QR13; main adds `aura3d-materials-environments` to game templates (ade7606f3, #357 also touched) |
| `packages/create-aura3d/skills/aura3d-art-direction/SKILL.md` | `-0,0 +1,63` | present |  | 46+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/failure-gallery.md` | `-0,0 +1,64` | present |  | 45+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md` | `-0,0 +1,32` | superseded | `bff82f988` #276 | manual: rig vocabulary renamed to the real camera API (`follow2d`/`fighting`/`topDown` -> `follow` (side-on)/`orthographic` (top-down), `orbital` -> `orbit`); all other cells identical |
| `packages/create-aura3d/skills/aura3d-art-direction/references/quality-bar.md` | `-0,0 +1,103` | present |  | 75+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/reference-frames.md` | `-0,0 +1,82` | present |  | 50+/0- lines match |
| `packages/create-aura3d/skills/manifest.json` | `-2,42 +2,147` | superseded | `bff82f988` #276 | manual: `aura3d-art-direction` moved up in `coreSet` and its `prd` tag C5 -> QR13; main adds `aura3d-materials-environments` to game templates (ade7606f3, #357 also touched) |
| `tests/unit/tools/agent-skills-check.test.ts` | `-0,0 +1,115` | superseded | `bff82f988` #276 | manual: the PR's interim 'legacy files pass' case was inverted by the later T2.10/T2.11 rewrites; main adds T2.12 C-40 citation tests |
| `tools/agent-skills/check.ts` | `-1,117 +1,229` | superseded | `bff82f988` #276 | manual: PR's staging values (1-skill section-order set, legacy visualQA set, `ENABLE_CRAFT_TARGETS = false`) advanced by T2.7-T2.12 on the same stack; main enables craft targets and adds C-40 row checks |
| `tools/agent-skills/check.ts` | `-119,72 +231,82` | present |  | 38+/31- lines match |
| `tools/agent-skills/check.ts` | `-243,9 +365,114` | present |  | 81+/1- lines match |

### PR #239

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `.agents/skills/aura3d-animation-studio/SKILL.md` | `-11,14 +11,20` | present |  | 9+/5- lines match |
| `.agents/skills/aura3d-animation-studio/SKILL.md` | `-36,7 +42,6` | present |  | 0+/1- lines match |
| `.agents/skills/aura3d-animation-studio/SKILL.md` | `-123,7 +128,7` | present |  | 1+/1- lines match |
| `.agents/skills/aura3d-animation-studio/SKILL.md` | `-145,3 +150,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-animation-studio/references/shot-looks.md` | `-0,0 +1,26` | present |  | 20+/0- lines match |
| `.agents/skills/aura3d-art-direction/SKILL.md` | `-24,6 +24,26` | present |  | 17+/0- lines match |
| `.agents/skills/aura3d-art-direction/SKILL.md` | `-61,3 +81,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-art-direction/references/framing-and-shots.md` | `-0,0 +1,45` | present |  | 35+/0- lines match |
| `.agents/skills/aura3d-art-direction/references/look-recipes.md` | `-7,11 +7,11` | present |  | 4+/4- lines match |
| `.agents/skills/aura3d-art-direction/references/look-recipes.md` | `-23,7 +23,7` | present |  | 1+/1- lines match |
| `.agents/skills/aura3d-assets/SKILL.md` | `-9,6 +9,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-assets/SKILL.md` | `-75,14 +82,15` | present |  | 4+/3- lines match |
| `.agents/skills/aura3d-assets/SKILL.md` | `-121,3 +129,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-assets/references/preview-under-look.md` | `-0,0 +1,26` | present |  | 21+/0- lines match |
| `.agents/skills/aura3d-browser-game/SKILL.md` | `-1,44 +1,52` | present |  | 23+/19- lines match |
| `.agents/skills/aura3d-browser-game/SKILL.md` | `-59,63 +67,61` | present |  | 37+/39- lines match |
| `.agents/skills/aura3d-browser-game/references/genre-looks.md` | `-0,0 +1,52` | present |  | 39+/0- lines match |
| `.agents/skills/aura3d-character-animation/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-character-animation/SKILL.md` | `-110,7 +117,6` | present |  | 0+/1- lines match |
| `.agents/skills/aura3d-character-animation/SKILL.md` | `-120,3 +126,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-character-animation/references/stage-and-lighting.md` | `-0,0 +1,31` | present |  | 22+/0- lines match |
| `.agents/skills/aura3d-core/SKILL.md` | `-1,15 +1,23` | present |  | 11+/5- lines match |
| `.agents/skills/aura3d-core/SKILL.md` | `-20,47 +28,53` | present |  | 21+/11- lines match |
| `.agents/skills/aura3d-core/SKILL.md` | `-77,6 +91,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-core/SKILL.md` | `-84,7 +105,8` | present |  | 2+/1- lines match |
| `.agents/skills/aura3d-evidence-review/SKILL.md` | `-6,8 +6,9` | present |  | 3+/2- lines match |
| `.agents/skills/aura3d-evidence-review/SKILL.md` | `-43,17 +44,18` | present |  | 9+/8- lines match |
| `.agents/skills/aura3d-evidence-review/SKILL.md` | `-74,6 +76,8` | present |  | 2+/0- lines match |
| `.agents/skills/aura3d-evidence-review/SKILL.md` | `-84,11 +88,12` | present |  | 5+/4- lines match |
| `.agents/skills/aura3d-game-art/SKILL.md` | `-12,6 +12,16` | present |  | 8+/0- lines match |
| `.agents/skills/aura3d-game-art/SKILL.md` | `-105,3 +115,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-game-art/references/sprite-palettes.md` | `-0,0 +1,25` | present |  | 20+/0- lines match |
| `.agents/skills/aura3d-materials-environments/SKILL.md` | `-5,13 +5,20` | present |  | 10+/5- lines match |
| `.agents/skills/aura3d-materials-environments/SKILL.md` | `-26,8 +33,12` | present |  | 5+/1- lines match |
| `.agents/skills/aura3d-materials-environments/SKILL.md` | `-89,8 +100,10` | present |  | 4+/2- lines match |
| `.agents/skills/aura3d-materials-environments/SKILL.md` | `-98,6 +111,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-performance/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-performance/SKILL.md` | `-79,7 +86,6` | present |  | 0+/1- lines match |
| `.agents/skills/aura3d-retexture/SKILL.md` | `-13,6 +13,13` | present |  | 5+/0- lines match |
| `.agents/skills/aura3d-scene-authoring/SKILL.md` | `-6,10 +6,17` | present |  | 7+/2- lines match |
| `.agents/skills/aura3d-scene-authoring/SKILL.md` | `-19,9 +26,10` | present |  | 4+/3- lines match |
| `.agents/skills/aura3d-scene-authoring/SKILL.md` | `-75,12 +83,14` | present |  | 8+/6- lines match |
| `.agents/skills/aura3d-scene-authoring/SKILL.md` | `-91,6 +101,12` | present |  | 4+/0- lines match |
| `.agents/skills/aura3d-scene-authoring/SKILL.md` | `-112,3 +128,5` | present |  | 2+/0- lines match |
| `.agents/skills/aura3d-scene-authoring/references/look-by-family.md` | `-0,0 +1,28` | present |  | 23+/0- lines match |
| `.agents/skills/aura3d-threejs-migration/SKILL.md` | `-11,6 +11,14` | superseded | `ade7606f3` #357 | pickaxe: newest main commit changing a missing line |
| `.agents/skills/aura3d-threejs-migration/SKILL.md` | `-111,3 +119,4` | present |  | 1+/0- lines match |
| `.agents/skills/aura3d-threejs-migration/references/look-mapping.md` | `-0,0 +1,27` | present |  | 22+/0- lines match |
| `.agents/skills/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `.agents/skills/manifest.json` | `-4,10 +4,10` | present |  | 2+/2- lines match |
| `.agents/skills/manifest.json` | `-28,7 +28,7` | present |  | 1+/1- lines match |
| `.agents/skills/manifest.json` | `-79,23 +79,28` | present |  | 5+/0- lines match |
| `.agents/skills/meshy-cli/SKILL.md` | `-9,6 +9,14` | present |  | 6+/0- lines match |
| `.claude/skills/aura3d-animation-studio/SKILL.md` | `-11,14 +11,20` | present |  | 9+/5- lines match |
| `.claude/skills/aura3d-animation-studio/SKILL.md` | `-36,7 +42,6` | present |  | 0+/1- lines match |
| `.claude/skills/aura3d-animation-studio/SKILL.md` | `-123,7 +128,7` | present |  | 1+/1- lines match |
| `.claude/skills/aura3d-animation-studio/SKILL.md` | `-145,3 +150,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-animation-studio/references/shot-looks.md` | `-0,0 +1,26` | present |  | 20+/0- lines match |
| `.claude/skills/aura3d-art-direction/SKILL.md` | `-24,6 +24,26` | present |  | 17+/0- lines match |
| `.claude/skills/aura3d-art-direction/SKILL.md` | `-61,3 +81,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-art-direction/references/framing-and-shots.md` | `-0,0 +1,45` | present |  | 35+/0- lines match |
| `.claude/skills/aura3d-art-direction/references/look-recipes.md` | `-7,11 +7,11` | present |  | 4+/4- lines match |
| `.claude/skills/aura3d-art-direction/references/look-recipes.md` | `-23,7 +23,7` | present |  | 1+/1- lines match |
| `.claude/skills/aura3d-assets/SKILL.md` | `-9,6 +9,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-assets/SKILL.md` | `-75,14 +82,15` | present |  | 4+/3- lines match |
| `.claude/skills/aura3d-assets/SKILL.md` | `-121,3 +129,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-assets/references/preview-under-look.md` | `-0,0 +1,26` | present |  | 21+/0- lines match |
| `.claude/skills/aura3d-browser-game/SKILL.md` | `-1,44 +1,52` | present |  | 23+/19- lines match |
| `.claude/skills/aura3d-browser-game/SKILL.md` | `-59,63 +67,61` | present |  | 37+/39- lines match |
| `.claude/skills/aura3d-browser-game/references/genre-looks.md` | `-0,0 +1,52` | present |  | 39+/0- lines match |
| `.claude/skills/aura3d-character-animation/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-character-animation/SKILL.md` | `-110,7 +117,6` | present |  | 0+/1- lines match |
| `.claude/skills/aura3d-character-animation/SKILL.md` | `-120,3 +126,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-character-animation/references/stage-and-lighting.md` | `-0,0 +1,31` | present |  | 22+/0- lines match |
| `.claude/skills/aura3d-core/SKILL.md` | `-1,15 +1,23` | present |  | 11+/5- lines match |
| `.claude/skills/aura3d-core/SKILL.md` | `-20,47 +28,53` | present |  | 21+/11- lines match |
| `.claude/skills/aura3d-core/SKILL.md` | `-77,6 +91,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-core/SKILL.md` | `-84,7 +105,8` | present |  | 2+/1- lines match |
| `.claude/skills/aura3d-evidence-review/SKILL.md` | `-6,8 +6,9` | present |  | 3+/2- lines match |
| `.claude/skills/aura3d-evidence-review/SKILL.md` | `-43,17 +44,18` | present |  | 9+/8- lines match |
| `.claude/skills/aura3d-evidence-review/SKILL.md` | `-74,6 +76,8` | present |  | 2+/0- lines match |
| `.claude/skills/aura3d-evidence-review/SKILL.md` | `-84,11 +88,12` | present |  | 5+/4- lines match |
| `.claude/skills/aura3d-game-art/SKILL.md` | `-12,6 +12,16` | present |  | 8+/0- lines match |
| `.claude/skills/aura3d-game-art/SKILL.md` | `-105,3 +115,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-game-art/references/sprite-palettes.md` | `-0,0 +1,25` | present |  | 20+/0- lines match |
| `.claude/skills/aura3d-materials-environments/SKILL.md` | `-5,13 +5,20` | present |  | 10+/5- lines match |
| `.claude/skills/aura3d-materials-environments/SKILL.md` | `-26,8 +33,12` | present |  | 5+/1- lines match |
| `.claude/skills/aura3d-materials-environments/SKILL.md` | `-89,8 +100,10` | present |  | 4+/2- lines match |
| `.claude/skills/aura3d-materials-environments/SKILL.md` | `-98,6 +111,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-performance/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-performance/SKILL.md` | `-79,7 +86,6` | present |  | 0+/1- lines match |
| `.claude/skills/aura3d-retexture/SKILL.md` | `-13,6 +13,13` | present |  | 5+/0- lines match |
| `.claude/skills/aura3d-scene-authoring/SKILL.md` | `-6,10 +6,17` | present |  | 7+/2- lines match |
| `.claude/skills/aura3d-scene-authoring/SKILL.md` | `-19,9 +26,10` | present |  | 4+/3- lines match |
| `.claude/skills/aura3d-scene-authoring/SKILL.md` | `-75,12 +83,14` | present |  | 8+/6- lines match |
| `.claude/skills/aura3d-scene-authoring/SKILL.md` | `-91,6 +101,12` | present |  | 4+/0- lines match |
| `.claude/skills/aura3d-scene-authoring/SKILL.md` | `-112,3 +128,5` | present |  | 2+/0- lines match |
| `.claude/skills/aura3d-scene-authoring/references/look-by-family.md` | `-0,0 +1,28` | present |  | 23+/0- lines match |
| `.claude/skills/aura3d-threejs-migration/SKILL.md` | `-11,6 +11,14` | superseded | `ade7606f3` #357 | pickaxe: newest main commit changing a missing line |
| `.claude/skills/aura3d-threejs-migration/SKILL.md` | `-111,3 +119,4` | present |  | 1+/0- lines match |
| `.claude/skills/aura3d-threejs-migration/references/look-mapping.md` | `-0,0 +1,27` | present |  | 22+/0- lines match |
| `.claude/skills/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `.claude/skills/manifest.json` | `-4,10 +4,10` | present |  | 2+/2- lines match |
| `.claude/skills/manifest.json` | `-28,7 +28,7` | present |  | 1+/1- lines match |
| `.claude/skills/manifest.json` | `-79,23 +79,28` | present |  | 5+/0- lines match |
| `.claude/skills/meshy-cli/SKILL.md` | `-9,6 +9,14` | present |  | 6+/0- lines match |
| `.cursor/skills/aura3d-animation-studio/SKILL.md` | `-11,14 +11,20` | present |  | 9+/5- lines match |
| `.cursor/skills/aura3d-animation-studio/SKILL.md` | `-36,7 +42,6` | present |  | 0+/1- lines match |
| `.cursor/skills/aura3d-animation-studio/SKILL.md` | `-123,7 +128,7` | present |  | 1+/1- lines match |
| `.cursor/skills/aura3d-animation-studio/SKILL.md` | `-145,3 +150,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-animation-studio/references/shot-looks.md` | `-0,0 +1,26` | present |  | 20+/0- lines match |
| `.cursor/skills/aura3d-art-direction/SKILL.md` | `-24,6 +24,26` | present |  | 17+/0- lines match |
| `.cursor/skills/aura3d-art-direction/SKILL.md` | `-61,3 +81,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-art-direction/references/framing-and-shots.md` | `-0,0 +1,45` | present |  | 35+/0- lines match |
| `.cursor/skills/aura3d-art-direction/references/look-recipes.md` | `-7,11 +7,11` | present |  | 4+/4- lines match |
| `.cursor/skills/aura3d-art-direction/references/look-recipes.md` | `-23,7 +23,7` | present |  | 1+/1- lines match |
| `.cursor/skills/aura3d-assets/SKILL.md` | `-9,6 +9,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-assets/SKILL.md` | `-75,14 +82,15` | present |  | 4+/3- lines match |
| `.cursor/skills/aura3d-assets/SKILL.md` | `-121,3 +129,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-assets/references/preview-under-look.md` | `-0,0 +1,26` | present |  | 21+/0- lines match |
| `.cursor/skills/aura3d-browser-game/SKILL.md` | `-1,44 +1,52` | present |  | 23+/19- lines match |
| `.cursor/skills/aura3d-browser-game/SKILL.md` | `-59,63 +67,61` | present |  | 37+/39- lines match |
| `.cursor/skills/aura3d-browser-game/references/genre-looks.md` | `-0,0 +1,52` | present |  | 39+/0- lines match |
| `.cursor/skills/aura3d-character-animation/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-character-animation/SKILL.md` | `-110,7 +117,6` | present |  | 0+/1- lines match |
| `.cursor/skills/aura3d-character-animation/SKILL.md` | `-120,3 +126,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-character-animation/references/stage-and-lighting.md` | `-0,0 +1,31` | present |  | 22+/0- lines match |
| `.cursor/skills/aura3d-core/SKILL.md` | `-1,15 +1,23` | present |  | 11+/5- lines match |
| `.cursor/skills/aura3d-core/SKILL.md` | `-20,47 +28,53` | present |  | 21+/11- lines match |
| `.cursor/skills/aura3d-core/SKILL.md` | `-77,6 +91,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-core/SKILL.md` | `-84,7 +105,8` | present |  | 2+/1- lines match |
| `.cursor/skills/aura3d-evidence-review/SKILL.md` | `-6,8 +6,9` | present |  | 3+/2- lines match |
| `.cursor/skills/aura3d-evidence-review/SKILL.md` | `-43,17 +44,18` | present |  | 9+/8- lines match |
| `.cursor/skills/aura3d-evidence-review/SKILL.md` | `-74,6 +76,8` | present |  | 2+/0- lines match |
| `.cursor/skills/aura3d-evidence-review/SKILL.md` | `-84,11 +88,12` | present |  | 5+/4- lines match |
| `.cursor/skills/aura3d-game-art/SKILL.md` | `-12,6 +12,16` | present |  | 8+/0- lines match |
| `.cursor/skills/aura3d-game-art/SKILL.md` | `-105,3 +115,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-game-art/references/sprite-palettes.md` | `-0,0 +1,25` | present |  | 20+/0- lines match |
| `.cursor/skills/aura3d-materials-environments/SKILL.md` | `-5,13 +5,20` | present |  | 10+/5- lines match |
| `.cursor/skills/aura3d-materials-environments/SKILL.md` | `-26,8 +33,12` | present |  | 5+/1- lines match |
| `.cursor/skills/aura3d-materials-environments/SKILL.md` | `-89,8 +100,10` | present |  | 4+/2- lines match |
| `.cursor/skills/aura3d-materials-environments/SKILL.md` | `-98,6 +111,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-performance/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-performance/SKILL.md` | `-79,7 +86,6` | present |  | 0+/1- lines match |
| `.cursor/skills/aura3d-retexture/SKILL.md` | `-13,6 +13,13` | present |  | 5+/0- lines match |
| `.cursor/skills/aura3d-scene-authoring/SKILL.md` | `-6,10 +6,17` | present |  | 7+/2- lines match |
| `.cursor/skills/aura3d-scene-authoring/SKILL.md` | `-19,9 +26,10` | present |  | 4+/3- lines match |
| `.cursor/skills/aura3d-scene-authoring/SKILL.md` | `-75,12 +83,14` | present |  | 8+/6- lines match |
| `.cursor/skills/aura3d-scene-authoring/SKILL.md` | `-91,6 +101,12` | present |  | 4+/0- lines match |
| `.cursor/skills/aura3d-scene-authoring/SKILL.md` | `-112,3 +128,5` | present |  | 2+/0- lines match |
| `.cursor/skills/aura3d-scene-authoring/references/look-by-family.md` | `-0,0 +1,28` | present |  | 23+/0- lines match |
| `.cursor/skills/aura3d-threejs-migration/SKILL.md` | `-11,6 +11,14` | superseded | `ade7606f3` #357 | pickaxe: newest main commit changing a missing line |
| `.cursor/skills/aura3d-threejs-migration/SKILL.md` | `-111,3 +119,4` | present |  | 1+/0- lines match |
| `.cursor/skills/aura3d-threejs-migration/references/look-mapping.md` | `-0,0 +1,27` | present |  | 22+/0- lines match |
| `.cursor/skills/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `.cursor/skills/manifest.json` | `-4,10 +4,10` | present |  | 2+/2- lines match |
| `.cursor/skills/manifest.json` | `-28,7 +28,7` | present |  | 1+/1- lines match |
| `.cursor/skills/manifest.json` | `-79,23 +79,28` | present |  | 5+/0- lines match |
| `.cursor/skills/meshy-cli/SKILL.md` | `-9,6 +9,14` | present |  | 6+/0- lines match |
| `README.md` | `-77,8 +77,9` | present |  | 3+/2- lines match |
| `docs/agents/agent-context.md` | `-22,6 +22,9` | present |  | 3+/0- lines match |
| `docs/agents/art-direction.md` | `-0,0 +1,104` | present |  | 78+/0- lines match |
| `docs/agents/benchmark-recipes.md` | `-1,7 +1,7` | present |  | 1+/1- lines match |
| `docs/agents/build-playbook.md` | `-145,7 +145,9` | present |  | 3+/1- lines match |
| `docs/agents/cinematic-scene-quality.md` | `-1,112 +1,8` | present |  | 5+/78- lines match |
| `docs/agents/game-example-standards.md` | `-22,7 +22,11` | present |  | 5+/1- lines match |
| `docs/agents/no-hackjob-rules.md` | `-42,8 +42,9` | present |  | 3+/2- lines match |
| `docs/guides/build-a-browser-game.md` | `-79,6 +79,28` | present |  | 17+/0- lines match |
| `docs/guides/build-a-browser-game.md` | `-104,14 +126,15` | present |  | 4+/3- lines match |
| `docs/guides/build-a-browser-game.md` | `-188,7 +211,7` | present |  | 1+/1- lines match |
| `docs/guides/build-a-browser-game.md` | `-204,9 +227,10` | present |  | 3+/2- lines match |
| `docs/project/showcase/visual-quality-standard.md` | `-17,6 +17,10` | present |  | 3+/0- lines match |
| `evidence/prd13/pr-f-t2.7-t2.14.md` | `-0,0 +1,39` | present |  | 31+/0- lines match |
| `llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` | `-11,14 +11,20` | present |  | 9+/5- lines match |
| `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` | `-36,7 +42,6` | present |  | 0+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` | `-123,7 +128,7` | present |  | 1+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` | `-145,3 +150,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-animation-studio/references/shot-looks.md` | `-0,0 +1,26` | present |  | 20+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` | `-24,6 +24,26` | present |  | 17+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md` | `-61,3 +81,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/framing-and-shots.md` | `-0,0 +1,45` | present |  | 35+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md` | `-7,11 +7,11` | present |  | 4+/4- lines match |
| `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md` | `-23,7 +23,7` | present |  | 1+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-assets/SKILL.md` | `-9,6 +9,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-assets/SKILL.md` | `-75,14 +82,15` | present |  | 4+/3- lines match |
| `packages/aura3d-cli/skills/aura3d-assets/SKILL.md` | `-121,3 +129,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-assets/references/preview-under-look.md` | `-0,0 +1,26` | present |  | 21+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md` | `-1,44 +1,52` | present |  | 23+/19- lines match |
| `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md` | `-59,63 +67,61` | present |  | 37+/39- lines match |
| `packages/aura3d-cli/skills/aura3d-browser-game/references/genre-looks.md` | `-0,0 +1,52` | present |  | 39+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-character-animation/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-character-animation/SKILL.md` | `-110,7 +117,6` | present |  | 0+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-character-animation/SKILL.md` | `-120,3 +126,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-character-animation/references/stage-and-lighting.md` | `-0,0 +1,31` | present |  | 22+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-core/SKILL.md` | `-1,15 +1,23` | present |  | 11+/5- lines match |
| `packages/aura3d-cli/skills/aura3d-core/SKILL.md` | `-20,47 +28,53` | present |  | 21+/11- lines match |
| `packages/aura3d-cli/skills/aura3d-core/SKILL.md` | `-77,6 +91,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-core/SKILL.md` | `-84,7 +105,8` | present |  | 2+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-evidence-review/SKILL.md` | `-6,8 +6,9` | present |  | 3+/2- lines match |
| `packages/aura3d-cli/skills/aura3d-evidence-review/SKILL.md` | `-43,17 +44,18` | present |  | 9+/8- lines match |
| `packages/aura3d-cli/skills/aura3d-evidence-review/SKILL.md` | `-74,6 +76,8` | present |  | 2+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-evidence-review/SKILL.md` | `-84,11 +88,12` | present |  | 5+/4- lines match |
| `packages/aura3d-cli/skills/aura3d-game-art/SKILL.md` | `-12,6 +12,16` | present |  | 8+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-game-art/SKILL.md` | `-105,3 +115,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-game-art/references/sprite-palettes.md` | `-0,0 +1,25` | present |  | 20+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | `-5,13 +5,20` | present |  | 10+/5- lines match |
| `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | `-26,8 +33,12` | present |  | 5+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | `-89,8 +100,10` | present |  | 4+/2- lines match |
| `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | `-98,6 +111,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-performance/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-performance/SKILL.md` | `-79,7 +86,6` | present |  | 0+/1- lines match |
| `packages/aura3d-cli/skills/aura3d-retexture/SKILL.md` | `-13,6 +13,13` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` | `-6,10 +6,17` | present |  | 7+/2- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` | `-19,9 +26,10` | present |  | 4+/3- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` | `-75,12 +83,14` | present |  | 8+/6- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` | `-91,6 +101,12` | present |  | 4+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/SKILL.md` | `-112,3 +128,5` | present |  | 2+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-scene-authoring/references/look-by-family.md` | `-0,0 +1,28` | present |  | 23+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md` | `-11,6 +11,14` | superseded | `ade7606f3` #357 | pickaxe: newest main commit changing a missing line |
| `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md` | `-111,3 +119,4` | present |  | 1+/0- lines match |
| `packages/aura3d-cli/skills/aura3d-threejs-migration/references/look-mapping.md` | `-0,0 +1,27` | present |  | 22+/0- lines match |
| `packages/aura3d-cli/skills/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `packages/aura3d-cli/skills/manifest.json` | `-4,10 +4,10` | present |  | 2+/2- lines match |
| `packages/aura3d-cli/skills/manifest.json` | `-28,7 +28,7` | present |  | 1+/1- lines match |
| `packages/aura3d-cli/skills/manifest.json` | `-79,23 +79,28` | present |  | 5+/0- lines match |
| `packages/aura3d-cli/skills/meshy-cli/SKILL.md` | `-9,6 +9,14` | present |  | 6+/0- lines match |
| `packages/create-aura3d/skills/aura3d-animation-studio/SKILL.md` | `-11,14 +11,20` | present |  | 9+/5- lines match |
| `packages/create-aura3d/skills/aura3d-animation-studio/SKILL.md` | `-36,7 +42,6` | present |  | 0+/1- lines match |
| `packages/create-aura3d/skills/aura3d-animation-studio/SKILL.md` | `-123,7 +128,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/skills/aura3d-animation-studio/SKILL.md` | `-145,3 +150,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-animation-studio/references/shot-looks.md` | `-0,0 +1,26` | present |  | 20+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/SKILL.md` | `-24,6 +24,26` | present |  | 17+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/SKILL.md` | `-61,3 +81,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/framing-and-shots.md` | `-0,0 +1,45` | present |  | 35+/0- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md` | `-7,11 +7,11` | present |  | 4+/4- lines match |
| `packages/create-aura3d/skills/aura3d-art-direction/references/look-recipes.md` | `-23,7 +23,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/skills/aura3d-assets/SKILL.md` | `-9,6 +9,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-assets/SKILL.md` | `-75,14 +82,15` | present |  | 4+/3- lines match |
| `packages/create-aura3d/skills/aura3d-assets/SKILL.md` | `-121,3 +129,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-assets/references/preview-under-look.md` | `-0,0 +1,26` | present |  | 21+/0- lines match |
| `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md` | `-1,44 +1,52` | present |  | 23+/19- lines match |
| `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md` | `-59,63 +67,61` | present |  | 37+/39- lines match |
| `packages/create-aura3d/skills/aura3d-browser-game/references/genre-looks.md` | `-0,0 +1,52` | present |  | 39+/0- lines match |
| `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md` | `-110,7 +117,6` | present |  | 0+/1- lines match |
| `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md` | `-120,3 +126,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-character-animation/references/stage-and-lighting.md` | `-0,0 +1,31` | present |  | 22+/0- lines match |
| `packages/create-aura3d/skills/aura3d-core/SKILL.md` | `-1,15 +1,23` | present |  | 11+/5- lines match |
| `packages/create-aura3d/skills/aura3d-core/SKILL.md` | `-20,47 +28,53` | present |  | 21+/11- lines match |
| `packages/create-aura3d/skills/aura3d-core/SKILL.md` | `-77,6 +91,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-core/SKILL.md` | `-84,7 +105,8` | present |  | 2+/1- lines match |
| `packages/create-aura3d/skills/aura3d-evidence-review/SKILL.md` | `-6,8 +6,9` | present |  | 3+/2- lines match |
| `packages/create-aura3d/skills/aura3d-evidence-review/SKILL.md` | `-43,17 +44,18` | present |  | 9+/8- lines match |
| `packages/create-aura3d/skills/aura3d-evidence-review/SKILL.md` | `-74,6 +76,8` | present |  | 2+/0- lines match |
| `packages/create-aura3d/skills/aura3d-evidence-review/SKILL.md` | `-84,11 +88,12` | present |  | 5+/4- lines match |
| `packages/create-aura3d/skills/aura3d-game-art/SKILL.md` | `-12,6 +12,16` | present |  | 8+/0- lines match |
| `packages/create-aura3d/skills/aura3d-game-art/SKILL.md` | `-105,3 +115,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-game-art/references/sprite-palettes.md` | `-0,0 +1,25` | present |  | 20+/0- lines match |
| `packages/create-aura3d/skills/aura3d-materials-environments/SKILL.md` | `-5,13 +5,20` | present |  | 10+/5- lines match |
| `packages/create-aura3d/skills/aura3d-materials-environments/SKILL.md` | `-26,8 +33,12` | present |  | 5+/1- lines match |
| `packages/create-aura3d/skills/aura3d-materials-environments/SKILL.md` | `-89,8 +100,10` | present |  | 4+/2- lines match |
| `packages/create-aura3d/skills/aura3d-materials-environments/SKILL.md` | `-98,6 +111,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-performance/SKILL.md` | `-10,6 +10,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-performance/SKILL.md` | `-79,7 +86,6` | present |  | 0+/1- lines match |
| `packages/create-aura3d/skills/aura3d-retexture/SKILL.md` | `-13,6 +13,13` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` | `-6,10 +6,17` | present |  | 7+/2- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` | `-19,9 +26,10` | present |  | 4+/3- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` | `-75,12 +83,14` | present |  | 8+/6- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` | `-91,6 +101,12` | present |  | 4+/0- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/SKILL.md` | `-112,3 +128,5` | present |  | 2+/0- lines match |
| `packages/create-aura3d/skills/aura3d-scene-authoring/references/look-by-family.md` | `-0,0 +1,28` | present |  | 23+/0- lines match |
| `packages/create-aura3d/skills/aura3d-threejs-migration/SKILL.md` | `-11,6 +11,14` | superseded | `ade7606f3` #357 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/skills/aura3d-threejs-migration/SKILL.md` | `-111,3 +119,4` | present |  | 1+/0- lines match |
| `packages/create-aura3d/skills/aura3d-threejs-migration/references/look-mapping.md` | `-0,0 +1,27` | present |  | 22+/0- lines match |
| `packages/create-aura3d/skills/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `packages/create-aura3d/skills/manifest.json` | `-4,10 +4,10` | present |  | 2+/2- lines match |
| `packages/create-aura3d/skills/manifest.json` | `-28,7 +28,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/skills/manifest.json` | `-79,23 +79,28` | present |  | 5+/0- lines match |
| `packages/create-aura3d/skills/meshy-cli/SKILL.md` | `-9,6 +9,14` | present |  | 6+/0- lines match |
| `packages/engine/src/agent-api/index.ts` | `-3086,6 +3086,10` | superseded | `bff82f988` #276 | pickaxe: newest main commit changing a missing line |
| `packages/engine/src/agent-api/looks/looks.ts` | `-320,36 +320,47` | present |  | 31+/2- lines match |
| `public/llms.txt` | `-1,303 +1,117` | present |  | 88+/221- lines match |
| `tests/unit/tools/agent-skills-check.test.ts` | `-7,8 +7,10` | present |  | 2+/0- lines match |
| `tests/unit/tools/agent-skills-check.test.ts` | `-64,8 +66,8` | present |  | 2+/2- lines match |
| `tests/unit/tools/agent-skills-check.test.ts` | `-113,3 +115,27` | present |  | 17+/0- lines match |
| `tools/agent-skills/check.ts` | `-31,7 +31,13` | present |  | 6+/1- lines match |
| `tools/agent-skills/check.ts` | `-53,10 +59,7` | present |  | 1+/3- lines match |
| `tools/agent-skills/check.ts` | `-70,11 +73,8` | present |  | 2+/5- lines match |
| `tools/agent-skills/check.ts` | `-185,6 +185,28` | present |  | 15+/0- lines match |
| `tools/agent-skills/check.ts` | `-418,6 +440,20` | present |  | 10+/0- lines match |
| `tools/agent-skills/check.ts` | `-462,6 +498,9` | present |  | 3+/0- lines match |

### PR #244

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `.gitignore` | `-382,3 +382,7` | present |  | 4+/0- lines match |
| `evidence/prd13/pr-g-t2.15-t2.19.md` | `-0,0 +1,68` | present |  | 62+/0- lines match |
| `packages/aura3d-cli/skills/agent-files/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/aura3d-cli/src/commands/prd13/index.ts` | `-1,5 +1,28` | present |  | 20+/3- lines match |
| `packages/aura3d-cli/src/commands/prd13/run.ts` | `-0,0 +1,30` | present |  | 22+/0- lines match |
| `packages/aura3d-cli/src/look/capture.ts` | `-0,0 +1,245` | present |  | 185+/0- lines match |
| `packages/aura3d-cli/src/look/judge.ts` | `-0,0 +1,166` | present |  | 129+/0- lines match |
| `packages/aura3d-cli/src/look/lint-static.ts` | `-0,0 +1,272` | present |  | 197+/0- lines match |
| `packages/aura3d-cli/src/look/rubric.ts` | `-0,0 +1,186` | present |  | 143+/0- lines match |
| `packages/create-aura3d/templates/animation-channel/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/animation-channel/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/animation-channel/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/animation-studio/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/animation-studio/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/animation-studio/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/character-controller/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/character-controller/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/character-controller/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/cinematic-scene/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/cinematic-scene/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/cinematic-scene/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/episode-builder/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/episode-builder/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/episode-builder/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/falling-blocks-starter/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/falling-blocks-starter/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/falling-blocks-starter/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/fighting-game/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/fighting-game/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/fighting-game/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/mini-game/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/mini-game/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/mini-game/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/product-viewer/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/product-viewer/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/product-viewer/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/prompt-animation-channel/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/prompt-animation-channel/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/prompt-animation-channel/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/racing-starter/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/racing-starter/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/racing-starter/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-architecture-interior/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-architecture-interior/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-architecture-interior/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-asset-inspector/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-asset-inspector/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-asset-inspector/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-character-viewer/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-character-viewer/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-character-viewer/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-custom-threejs-migration/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-custom-threejs-migration/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-custom-threejs-migration/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-large-scene/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-large-scene/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-large-scene/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-material-authoring/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-material-authoring/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-material-authoring/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-postprocess-scene/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-postprocess-scene/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-postprocess-scene/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-premium-product-viewer/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/three-compat-premium-product-viewer/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `packages/create-aura3d/templates/three-compat-premium-product-viewer/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `tests/unit/cli/look-capture.test.ts` | `-0,0 +1,124` | present |  | 96+/0- lines match |
| `tests/unit/cli/look-judge.test.ts` | `-0,0 +1,144` | present |  | 102+/0- lines match |
| `tests/unit/cli/look-lint.test.ts` | `-0,0 +1,149` | present |  | 107+/0- lines match |
| `tests/unit/create-aura3d/templates.test.ts` | `-35,6 +35,24` | present |  | 15+/0- lines match |
| `tools/agent-templates/index.ts` | `-86,10 +86,26` | present |  | 12+/0- lines match |

### PR #269

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `.gitignore` | `-386,3 +386,5` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/mini-game/README.md` | `-4,12 +4,15` | present |  | 9+/6- lines match |
| `packages/create-aura3d/templates/mini-game/aura.assets.json` | `-50,6 +50,90` | present |  | 61+/0- lines match |
| `packages/create-aura3d/templates/mini-game/package.json` | `-11,7 +11,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitBlockGrassLarge.606f077c.glb` | `binary` | present |  | binary identical |
| `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitBrick.b1638210.glb` | `binary` | present |  | binary identical |
| `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitKey.2e930961.glb` | `binary` | present |  | binary identical |
| `packages/create-aura3d/templates/mini-game/public/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb` | `binary` | present |  | binary identical |
| `packages/create-aura3d/templates/mini-game/src/aura-assets.ts` | `-1,4 +1,4` | present |  | 1+/1- lines match |
| `packages/create-aura3d/templates/mini-game/src/aura-assets.ts` | `-39,5 +39,37` | present |  | 28+/0- lines match |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-1,14 +1,16` | superseded | `444cbf2c7` #350 | file rewritten on main; PR lines survive elsewhere (packages/create-aura3d/templates/arena-shooter/src/main.ts, templates/arena-shooter/src/main.ts) |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-25,13 +27,23` | present |  | 12+/5- lines match |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-56,6 +68,11` | present |  | 4+/0- lines match |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-63,39 +80,50` | superseded | `444cbf2c7` #350 | file rewritten on main; PR lines survive elsewhere (docs/project/aura3d-quality-rebuild/evidence/prd15/requests/Q-13-14-template-spec-timing-and-tdz-fixes.md, packages/create-aura3d/templates/arena-shooter/src/main.ts, templates/arena-shooter/src/main.ts) |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-112,36 +140,34` | superseded | `444cbf2c7` #350 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-149,33 +175,85` | present |  | 66+/23- lines match |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-191,16 +269,17` | present |  | 4+/3- lines match |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | `-211,10 +290,17` | superseded | `444cbf2c7` #350 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` | `-9,6 +9,8` | present |  | 2+/0- lines match |
| `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` | `-21,6 +23,9` | present |  | 3+/0- lines match |
| `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` | `-28,11 +33,17` | present |  | 6+/0- lines match |
| `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` | `-41,9 +52,19` | present |  | 9+/0- lines match |
| `packages/create-aura3d/templates/mini-game/tests/screenshot.spec.ts` | `-16,24 +16,24` | superseded | `19ae86f2a` #303 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/mini-game/tests/screenshot.spec.ts` | `-46,23 +46,29` | superseded | `19ae86f2a` #303 | pickaxe: newest main commit changing a missing line |
| `packages/engine/src/agent-api/nodes/camera.ts` | `-5,6 +5,7` | present |  | 1+/0- lines match |
| `packages/engine/src/agent-api/nodes/camera.ts` | `-185,5 +186,13` | present |  | 6+/0- lines match |
| `templates/mini-game/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `templates/mini-game/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `templates/mini-game/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `templates/mini-game/README.md` | `-4,12 +4,15` | present |  | 9+/6- lines match |
| `templates/mini-game/aura.assets.json` | `-0,0 +1,139` | present |  | 107+/0- lines match |
| `templates/mini-game/package.json` | `-8,10 +8,10` | present |  | 2+/2- lines match |
| `templates/mini-game/public/aura-assets/kenneyPlatformerKitBlockGrassLarge.606f077c.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/kenneyPlatformerKitBrick.b1638210.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/kenneyPlatformerKitKey.2e930961.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/player-fixture.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/player.thumb.svg` | `-1,8 +0,0` | present |  | file absent on target |
| `templates/mini-game/public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb` | `binary` | present |  | binary identical |
| `templates/mini-game/public/aura-assets/showcaseKenneyOobiPlatformerHero.thumb.svg` | `-0,0 +1` | present |  | 1+/0- lines match |
| `templates/mini-game/src/aura-assets.ts` | `-1,17 +1,75` | present |  | 61+/8- lines match |
| `templates/mini-game/src/main.ts` | `-1,14 +1,16` | superseded (P-37) | `e64185e23` #357 | file rewritten on main; PR lines survive elsewhere (packages/create-aura3d/templates/arena-shooter/src/main.ts, templates/arena-shooter/src/main.ts) |
| `templates/mini-game/src/main.ts` | `-22,11 +24,26` | present |  | 13+/1- lines match |
| `templates/mini-game/src/main.ts` | `-51,6 +68,11` | present |  | 4+/0- lines match |
| `templates/mini-game/src/main.ts` | `-65,21 +87,43` | superseded (P-37) | `e64185e23` #357 | file rewritten on main; PR lines survive elsewhere (docs/project/aura3d-quality-rebuild/evidence/prd15/requests/Q-13-14-template-spec-timing-and-tdz-fixes.md, packages/create-aura3d/templates/arena-shooter/src/main.ts, templates/arena-shooter/src/main.ts) |
| `templates/mini-game/src/main.ts` | `-101,21 +145,29` | superseded (P-37) | `e64185e23` #357 | file rewritten on main; PR lines survive elsewhere (packages/create-aura3d/templates/arena-shooter/src/main.ts, templates/arena-shooter/src/main.ts) |
| `templates/mini-game/src/main.ts` | `-123,29 +175,85` | present |  | 66+/19- lines match |
| `templates/mini-game/src/main.ts` | `-161,16 +269,17` | present |  | 4+/3- lines match |
| `templates/mini-game/src/main.ts` | `-178,8 +287,20` | superseded (P-37) | `e64185e23` #357 | pickaxe: newest main commit changing a missing line |
| `templates/mini-game/tests/certified-rig.spec.ts` | `-0,0 +1,40` | superseded (P-37) | `b82d51b01` #357 | pickaxe: newest main commit changing a missing line |
| `templates/mini-game/tests/playable.spec.ts` | `-9,6 +9,8` | present |  | 2+/0- lines match |
| `templates/mini-game/tests/playable.spec.ts` | `-21,6 +23,9` | present |  | 3+/0- lines match |
| `templates/mini-game/tests/playable.spec.ts` | `-28,11 +33,17` | present |  | 6+/0- lines match |
| `templates/mini-game/tests/playable.spec.ts` | `-41,9 +52,19` | present |  | 9+/0- lines match |
| `templates/mini-game/tests/screenshot.spec.ts` | `-16,24 +16,24` | superseded | `4dafae4bb` #305 | pickaxe: newest main commit changing a missing line |
| `templates/mini-game/tests/screenshot.spec.ts` | `-45,24 +45,30` | superseded | `4dafae4bb` #305 | pickaxe: newest main commit changing a missing line |
| `tools/agent-templates/index.ts` | `-121,12 +121,12` | present |  | 4+/4- lines match |
| `tools/agent-templates/index.ts` | `-405,7 +405,6` | present |  | 0+/1- lines match |
| `tools/template-source-audit/index.ts` | `-71,9 +71,12` | superseded | `250077b50` #336 | manual: tool deleted on main by the T7.1-T7.8 process prune (#336 lineage); the check id rename has no surviving file |

### PR #273

| file | hunk | class | commit | evidence |
| --- | --- | --- | --- | --- |
| `packages/create-aura3d/templates/racing-starter/README.md` | `-4,15 +4,17` | present |  | 8+/6- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-2,7 +2,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-28,47 +28,63` | superseded | `e2f46a24d` #357 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-89,9 +105,9` | present |  | 3+/3- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-103,12 +119,10` | superseded | `444cbf2c7` #350 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-119,6 +133,11` | present |  | 4+/0- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-153,12 +172,26` | present |  | 13+/3- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-190,68 +223,29` | present |  | 12+/43- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-265,8 +259,8` | present |  | 2+/2- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-279,7 +273,7` | present |  | 1+/1- lines match |
| `packages/create-aura3d/templates/racing-starter/src/main.ts` | `-313,23 +307,21` | present |  | 13+/13- lines match |
| `packages/create-aura3d/templates/racing-starter/tests/geometry-certification.json` | `-0,0 +1,34` | present |  | 22+/0- lines match |
| `packages/create-aura3d/templates/racing-starter/tests/playable.spec.ts` | `-1,50 +1,9` | superseded (P-37) | `b82d51b01` #357 | file rewritten on main; PR lines survive elsewhere (apps/aura-clash-showcase/tests/flagship-readiness.spec.ts, apps/aura-clash-showcase/tests/playable-smoke.spec.ts, docs/project/aura3d-quality-rebuild/migration/patches/aura-clash-showcase/zz-evidence-sweep.patch) |
| `packages/create-aura3d/templates/racing-starter/tests/playable.spec.ts` | `-52,42 +11,66` | superseded (P-37) | `b82d51b01` #357 | pickaxe: newest main commit changing a missing line |
| `packages/create-aura3d/templates/racing-starter/tests/route-health.spec.ts` | `-12,15 +12,16` | present |  | 7+/6- lines match |
| `packages/create-aura3d/templates/racing-starter/tests/route-health.spec.ts` | `-31,10 +32,11` | present |  | 5+/4- lines match |
| `templates/racing-starter/.claude/CLAUDE.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `templates/racing-starter/.github/workflows/aura3d-lookdev.yml` | `-0,0 +1,67` | present |  | 50+/0- lines match |
| `templates/racing-starter/AGENTS.md` | `-0,0 +1,3` | present |  | 2+/0- lines match |
| `templates/racing-starter/README.md` | `-4,15 +4,17` | present |  | 8+/6- lines match |
| `templates/racing-starter/aura.assets.json` | `-0,0 +1,64` | present |  | 51+/0- lines match |
| `templates/racing-starter/package.json` | `-11,9 +11,11` | present |  | 3+/1- lines match |
| `templates/racing-starter/src/main.ts` | `-2,7 +2,7` | present |  | 1+/1- lines match |
| `templates/racing-starter/src/main.ts` | `-28,47 +28,63` | superseded (P-37) | `e64185e23` #357 | pickaxe: newest main commit changing a missing line |
| `templates/racing-starter/src/main.ts` | `-89,9 +105,9` | present |  | 3+/3- lines match |
| `templates/racing-starter/src/main.ts` | `-103,12 +119,10` | superseded (P-37) | `e64185e23` #357 | pickaxe: newest main commit changing a missing line |
| `templates/racing-starter/src/main.ts` | `-119,6 +133,11` | present |  | 4+/0- lines match |
| `templates/racing-starter/src/main.ts` | `-153,12 +172,26` | present |  | 13+/3- lines match |
| `templates/racing-starter/src/main.ts` | `-190,37 +223,29` | present |  | 12+/17- lines match |
| `templates/racing-starter/src/main.ts` | `-234,8 +259,8` | present |  | 2+/2- lines match |
| `templates/racing-starter/src/main.ts` | `-248,7 +273,7` | present |  | 1+/1- lines match |
| `templates/racing-starter/src/main.ts` | `-282,23 +307,21` | present |  | 13+/13- lines match |
| `templates/racing-starter/tests/geometry-certification.json` | `-0,0 +1,34` | present |  | 22+/0- lines match |
| `templates/racing-starter/tests/playable.spec.ts` | `-1,50 +1,9` | superseded (P-37) | `b82d51b01` #357 | file rewritten on main; PR lines survive elsewhere (apps/aura-clash-showcase/tests/flagship-readiness.spec.ts, apps/aura-clash-showcase/tests/playable-smoke.spec.ts, docs/project/aura3d-quality-rebuild/migration/patches/aura-clash-showcase/zz-evidence-sweep.patch) |
| `templates/racing-starter/tests/playable.spec.ts` | `-52,42 +11,66` | superseded (P-37) | `b82d51b01` #357 | pickaxe: newest main commit changing a missing line |
| `templates/racing-starter/tests/route-health.spec.ts` | `-0,0 +1,42` | superseded (P-37) | `b82d51b01` #357 | pickaxe: newest main commit changing a missing line |
| `templates/racing-starter/tsconfig.json` | `-7,7 +7,7` | present |  | 1+/1- lines match |

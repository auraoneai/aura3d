# PR G — T2.15–T2.19 agent files + look commands + lookdev workflow

> **Run-id status (P-57):** no passing remote run id is cited in this file yet; every claim below is recorded NOT RUN until the proving lane-workflow/GitLab run is linked here. File moved from `evidence/prd13/` → `docs/project/aura3d-quality-rebuild/evidence/prd-13/` (13-EVID).


## Scope

- **T2.15** `packages/aura3d-cli/skills/agent-files/AGENTS.md` canonical text
  (llms.txt first → art-direction skill → every scene gets a look → look-dev
  loop before done). Shipped as `AGENTS.md` + `.claude/CLAUDE.md` in all 19
  create-aura3d templates; `check:templates` asserts byte-equality per
  template; `templates.test.ts` asserts scaffolded projects carry all three
  artifacts. `genericAgentText` untouched (PRD 05-owned) → **Q-05-1 filed:
  auraoneai/aura3d#242**.
- **T2.19** every template ships `.github/workflows/aura3d-lookdev.yml`:
  macos-14, `workflow_dispatch` only, no secrets, uploads `tests/reports/**`
  as the `lookdev` artifact — the file `look capture --runner gh-actions`
  dispatches. Presence asserted by `check:templates` (57/57 new checks pass).
- **T2.16** `src/look/capture.ts` → C-39 `look capture`. `--runner gh-actions`
  runs `gh workflow run aura3d-lookdev.yml` under the user's own `gh` auth
  (never sets/reads tokens), polls `gh run list` until completed, downloads
  the `lookdev` artifact into `--out` (default `dist/lookdev/<next round>`).
  `--runner local` requires a project-local Playwright binary and otherwise
  exits 2 `local runner unavailable`. Emits `appliedLook.json` + `lint.json`
  (sourced from the artifact's screenshot report profile) and exits 0 with
  lint errors — lint reports, the judge gates. Pre-fallthrough entry
  `src/commands/prd13/run.ts` per §7.6.
- **T2.17** `src/look/judge.ts` + `src/look/rubric.ts` → C-39 `look judge` +
  `look rubric`. `LookJudgement` schema per §7.6 (round ≥1, shots sha256,
  scores 0–10 in 0.5 steps over the 12 `AGENT_LOOK_CATEGORIES`, ≥1 observation
  per score < 7, nextChange{category,change,api}). `--judge prism` delegates
  to C-32 `judgeWithPrism` via dynamic import; while the export is absent it
  exits 2 `judge-unavailable` — no fabricated scores. `look rubric` prints the
  12 categories + the genre recipe row (13-row table condensed from
  look-recipes.md). Hint table keyed by weakest category, enriched by lint
  codes (`CATEGORY_HINTS` + `LINT_CODE_HINTS`, real engine APIs only).
- **T2.18** `src/look/lint-static.ts` → C-39 `look lint`: TS AST scan over
  `src/**` for ambient-without-env, `@aura3d/lean*` imports, renderer
  overrides (toneMapping/setPixelRatio/outputColorSpace), capture-URL
  branches, constant `true` evidence literals (`routeAlignedToVisibleTrack`
  style), overlay defaults. Then runs every rule from C-39
  `doctorRulesAll()`. PRD-13 default `look/capture-branch` doctor rule is
  registered only when no lane already owns that code (the C-39 duplicate
  guard would throw otherwise). Codemod `look-from-ambient` (§11.5)
  registered via `registerCodemod`: ambient-without-env → `looks.preset` +
  TODO, `qualityProfile: "safe-basic"` removed, `.visualSystems` →
  `.appliedEffects`. **Q-05-2 filed: auraoneai/aura3d#243** for the
  `doctor --look` alias.

## Verification (local)

- `tests/unit/cli/`: 30/30 new tests pass (capture mocked-gh fs paths, judge
  fixtures incl. ⊆ GAME_VISUAL_CATEGORIES, lint fixtures incl. current
  mini-game/racing-starter flagged and a look-first scene clean, codemod
  purity).
- `tests/unit/create-aura3d/templates.test.ts`: 5/5 incl. new scaffold
  assertion.
- `pnpm check:templates`: all 19 template builds pass; all 57 new
  agent-file/workflow assertions pass; 0 non-smoke failures. The 19 browser
  legs fail locally on missing Playwright — pre-existing env limitation,
  remote-only by lane rule (same as agent-sim).
- `tsx run.ts look rubric --genre racing` and `look lint` smoke-tested.
- `tsc -p tsconfig.build.json --noEmit` clean; eslint clean.

## NOT RUN

- `check:templates` browser legs + `look capture --runner gh-actions`/`local`
  real runs (no local Playwright; the e2e on product-viewer is CI-owned per
  spec).
- `look judge --judge prism` provider path (C-32 export absent; the
  `judge-unavailable` exit-2 branch is tested).

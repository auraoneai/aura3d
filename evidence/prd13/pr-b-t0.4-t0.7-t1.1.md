# PR B evidence — T0.4–T0.7 + T1.1 (PRD-13, lane 13)

Branch: `qr/prd13-agent-eval-looks` → main. Everything stays behind the
existing conventions: no `A3D_QR_*` flag is enabled anywhere; lookPresets is
pure data exported via `src/lanes/prd13.ts` (consumers are gated, not the
data); the eval workflow is dispatch/weekly on main only.

## Deliverables

- **T0.4** `tools/agent-eval/{run,agents}.ts`: per (prompt, seed) cell — fresh
  workdir, `npm create aura3d@<packed tgz>` (`--agent claude --skills all`,
  `--template` optional), headless agent with 45-min wall clock, `npm run
  build`. Artifacts per cell: `src/**`, `agent-transcript.txt`, `build.log`,
  `dist/`, `run.json` (`aura3d.agent-eval/1`) + `round.json`
  (`aura3d.agent-eval.round/1`). Agent backend = Claude Code via Kiro Prism —
  `KIRO_PRISM_API_KEY`/`KIRO_PRISM_URL` env only (never written to disk),
  `ANTHROPIC_BASE_URL`→`<prism>/anthropic`, `X-Prism-*` attribution headers,
  model pinned via `A3D_EVAL_AGENT_MODEL` (default `kiro-prism/claude-opus-5.5`).
  The kiro-prism Mac docs were unavailable in this environment; the adapter
  mirrors `auraoneai/Operator` `prism-client.mjs` conventions and isolates the
  env block for a one-spot adjustment when those docs land.
- **T0.5** `.github/workflows/agent-output-eval.yml`: `workflow_dispatch` +
  weekly schedule (main only; no `pull_request` — the Prism key only reaches
  the agent job). Matrix 12 × 3: `pack` → `agent` (ubuntu-latest) → `capture`
  (macos-14, `capture-templates.mjs --source <cell dist dirs>` × flags
  `none`/`all`, same C-33 readiness + `a3d-qr=` URL flags, SHA/run-id bound) →
  `panel-packet` artifact (`aura3d.panel-packet/1` manifest + capture reports +
  per-cell `run.json`). Concurrency group per round (`agent-output-eval-<run>`).
- **T0.7** `tools/agent-skills/craft-ratio.ts`: frozen §1.2 regexes as
  `EVIDENCE_TERMS`/`VISUAL_TERMS` → `EVIDENCE_PATTERN` (substring) /
  `VISUAL_PATTERN` (word-boundary; unanchored matching over-counts:
  rim→primary, grade→upgrade, ao→chaos). Corpus: skills/**/*.md recursive,
  llms.txt, docs/agents/*.md, docs/guides/*.md (non-recursive — skills-examples/
  excluded). Report `tests/reports/craft-ratio.json` (`aura3d.craft-ratio/1`)
  exposes both counts per file: `nonBlankLines` (raw) and `proseLines`
  (fence-excluded) because the research table uses raw for skills rows and
  prose for llms.txt/docs rows. One evidence-stem delta from the doc's prose
  list: `+command` — the only addition that lands
  `docs/guides/build-a-browser-game.md` evidenceOnly inside ±3 (the
  `aura3d assets`/`create-aura3d` command lines) without breaking any other
  row; documented inline.
- **T1.1** `packages/engine/src/agent-api/looks/lookPresets.ts`: 15
  `AuraLookPreset` entries (11 C-26 biomes ∪ 4 C-34 studio ids), lane-chosen
  v0 values per spec (autumn_field/48°/35° outdoors, kloppenheim/12°
  golden-hour, studio_small_08 studio ids, hdri null + backgroundException for
  night-city/space/underwater/polar-night, no ambient lights, `key.shadow:
  true` everywhere, `renderer: {qualityProfile:"production",
  pixelRatio:"min-dpr-2"}`). Deep-frozen; exported through
  `src/lanes/prd13.ts`.

## Tests run (local)

- `vitest run tests/unit/tools/{agent-eval-run,craft-ratio,agent-eval-prompts}.test.ts
  tests/unit/agent-api/looks.test.ts` — 20/20 pass (craft-ratio reproduces the
  research/12 table on the vendored 3.0.1 fixture within ±3 lines per file —
  every row).
- `pnpm typecheck` (`tsc -p tsconfig.build.json --noEmit`) — clean.
- `pnpm exec eslint` on all touched paths — clean.
- `node --check tools/agent-templates/capture-templates.mjs` + `--source` `--list`
  smoke — OK (full capture legs run only inside the workflows, per §17).
- Dry-run CLI: `--only P01,P02 --seeds 0,1` → 4/4 cells complete, run.json +
  round.json emitted.

## NOT RUN

- Real `claude-code` agent cells — needs `KIRO_PRISM_API_KEY` in the org's CI
  secret store (name TBC by user) + the kiro-prism Mac docs for the exact
  Anthropic-path config. `--dry-run` exercises the full pipeline without it.
- `agent-output-eval.yml` dry-run dispatch + template-lookdev first green run —
  both workflow files must land on `main` before `workflow_dispatch` can run
  them.
- T0.6 round-0 (`baseline/round-0.json`, `PanelRoundRecord` + `screening`) —
  needs a real T0.5 run + ≥1 named human judge score; cannot be fabricated.
- Pre-existing suite failures in `tests/unit/tools/**` unrelated to this PR
  (missing CI-generated `tests/reports/` artifacts on a fresh checkout).

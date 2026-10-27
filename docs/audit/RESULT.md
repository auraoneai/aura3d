# Docs rewrite and prune: result (2026-10-24)

Measured with `docs/audit/scripts/{links,snippets,tokens}.mjs` (tokens: o200k_base). "Before" is origin/main right after the seven rewrite lanes landed (`8f2fd8a3c`); "after" is this lane.

| Metric | Before | After |
| --- | --- | --- |
| Dead relative links (non-evidence md) | 8 | 0 |
| Absolute `/Users/...` paths in md | 32 | 0 |
| Skill checker (`tools/agent-skills/check.ts`) | failing (3 skills over 150 lines, craft-ratio, stale mirrors) | ok, 0 failures |
| Nonexistent import paths in docs | 4 | 2 (both in a historical worked example, now bannered) |
| Nonexistent CLI commands flagged | 16 | 2 (`aura3d evidence judge` exists in `packages/aura3d-cli/src/commands/evidence`, so that one is a checker false positive; `aura3d new game` is planned and is labelled as such) |
| Documented pnpm scripts that do not exist | 23 | 21 |
| Root names taught but not exported | 1 | 1 (`animation` in the character-animation skill, untouched here) |
| Markdown files, all tracked | 808 | 814 (lanes added pages; 28 archived files stay tracked) |
| Markdown files outside `docs/archive/` | n/a | 785 |
| Core path tokens: `AGENTS.md` + `llms.txt` + `docs/agents/README.md` + `claims-and-boundaries.md` | 14.9k (audit) | 9,352 |
| Core path plus `agent-quickstart.md` | n/a | 11,474 (target: under 12k) |
| `README.md` tokens | about 12k (48 KB) | 2,344 (8 KB) |

## Changes

- `primitives.mesh` (does not exist) replaced by `geometry.custom` in the llms-full source, the browser-game skill and both troubleshooting pages.
- `docs/quickstart.md` and `docs/agent-quickstart.md` are redirects to `docs/agents/agent-quickstart.md`.
- Links to the retired never-lists point at `claims-and-boundaries.md`; the stub files stay because `tools/agent-docs` requires them.
- Three oversize skills (`aura3d-assets`, `aura3d-browser-game`, `meshy-cli`) moved their tables and long examples into `references/` files; genre recipes and composition rules were added to `aura3d-browser-game/references/genre-looks.md` (this also satisfies the craft-ratio gate).
- Skill mirrors (`.cursor`, `.claude`, `.agents`, `packages/create-aura3d/skills`) synced; llms files regenerated with `marketing/scripts/gen-seo.mjs`.
- 28 history-only documents moved to `docs/archive/` (index in `docs/archive/README.md`); links to them repaired.
- `benchmark-recipes.md` imports now use the `@aura3d/engine` root (`sceneKits.particleFountain`, `sceneKits.humanoidWalk`).

## Not done, and why

- 57 ARCHIVE-verdict files were left in place because a test, tool or generator reads them (for example `docs/archive/docs/architecture/2.0-removals.md`, `docs/archive/docs/migration/2.0.md`, the quality-rebuild evidence pages).
- `benchmark/context/**` (21 files) was kept: benchmark runners and tests read it.
- `packages/create-aura3d/skills/**` and `packages/engine/README.md` (DELETE-GENERATED) were kept: they are generated and checked by `check.ts` and `sync-engine-readme.mjs`.
- MERGE-INTO verdicts for `docs/agents/skills-examples/**` were not applied; one example was marked historical instead.
- 34 docs still carry `Version: 4.0.x`. They were not reviewed against 4.1.x, so I did not restamp them.
- The 21 nonexistent pnpm scripts in older workflow and README pages remain (listed by `snippets.mjs`).

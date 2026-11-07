# @aura3d/mcp phase 1: turns and tokens in the cold-start trial

Lane 511 (E3-03). Harness: `exp/turn-gap-504` `tools/agent-eval` plus `tools/agent-eval-mcp/mcp-condition.patch` (adds conditions M and N and spawns the real stdio `aura3d-mcp` server per run). Model `claude-sonnet-5.5` via Prism, Aura3D 5.0.2 installed in each sandbox, tasks 2 (forest), 5 (shader water), 8 (island), 9 (procedural robot), n=3 per cell, 40-turn cap, seed 20261106, 36 runs in one session (same day, B rerun as control). Tables: `tables.md`; raw runs and transcripts: `m511-*/runs/*`.

Conditions
- B: `aura_lookup` (the 504 prototype), rerun as same-day control.
- M: the MCP knowledge tools (`get_symbol`, `search_docs`, `get_recipe`, `explain_error`) replace `aura_lookup`; no cheat sheet.
- N: first-screen cheat sheet (504 condition A entry docs) plus the same MCP tools as a supplement.
- Reference, from the 504 findings table (not rerun): baseline 18 turns, A (sheet only) 4, C (sheet + aura_lookup) 9, B 12.

Pooled over the four tasks (median of 12 runs)

| condition | turns | input tokens | est. cached cost | first-try tsc | final tsc |
|---|---|---|---|---|---|
| B aura_lookup (rerun) | 9.5 | 201K | 47K | 12/12 | 12/12 |
| M MCP tools only | 11.5 | 187K | 44K | 12/12 | 12/12 |
| N sheet + MCP tools | 8 | 94K | 28K | 11/12 | 12/12 |

Reading
1. MCP tools alone are not better than the `aura_lookup` prototype: 11.5 vs 9.5 median turns (ranges 5-24 vs 6-22), about equal tokens. Task 8 is where they lose (24 vs 19 turns): the agent calls several tools and still reads files. They won on task 9 (5 vs 7).
2. As a supplement to the sheet they were the best cell measured here (8 turns, 94K input), but this run has no sheet-only arm, so it does not show the MCP adds anything over the sheet. The 504 result for sheet only (4 turns, 42K input) is lower on both; N used 2 to 12 turns. Treat the MCP as a fallback for what the sheet does not cover, not as a first-screen replacement. This agrees with the 504 finding.
3. All 36 runs finished and typechecked; no render, judge or frame probe was run (no cloud/ACR in this lane), so nothing here says anything about output quality, and 504 showed typecheck and checklist can pass on frozen water.

Caveats: n=3 per cell, model sampling is not seedable, one session, 504 reference numbers come from an earlier session. The server ran against 504's docs (with `docs/agents/error-codes.md` from this lane added); in M the cheat sheet was removed from the bundle, in N it was present. Only 4 of the 8 tools are exposed in the sandbox (no shell: `scaffold`, `assets_*`, `check_deploy` are covered by unit tests with a fixture project, and `scaffold`/`assets_resolve` were also exercised once against the published 5.0.2 packages).

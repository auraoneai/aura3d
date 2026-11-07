# @aura3d/mcp phase 1: turns and tokens in the cold-start trial (rerun, lane 511 fix pass)

This file supersedes the first 511 run (batches `m511-M` and `m511-N` are kept for history; `m511-B` is still used as the aura_lookup reference). The server changed after review (public-docs allow-list, 1,200-character chunks, stamps on every tool answer), so M and N were rerun, and the missing arms were added: base (no entry docs, no tools) and A (cheat sheet only).

Harness: `exp/turn-gap-504` `tools/agent-eval` plus `tools/agent-eval-mcp/mcp-condition.patch`. Model `claude-sonnet-5.5` via Prism (subject only, no judge). Aura3D 5.0.2 installed in each sandbox, tasks 2 (forest), 5 (shader water), 8 (island), 9 (procedural robot), n=3 per cell, 40-turn cap, seed 20261106. base, A, M and N ran back to back in one session (48 runs, all finished); B is from the earlier 511 session (12 runs). Full per-task tables: `tables-513.md`; raw runs and transcripts: `m513-*/runs/*`.

Pooled over the four tasks (median of 12 runs)

| condition | turns (range) | input tokens | est. cached cost | first-try tsc | final tsc |
|---|---|---|---|---|---|
| base: no entry docs, no tools | 17.5 (7-30) | 623K | 112K | 12/12 | 12/12 |
| A: cheat sheet only | 4.5 (3-8) | 52K | 19K | 12/12 | 12/12 |
| B: aura_lookup (earlier session) | 9.5 (6-22) | 201K | 47K | 12/12 | 12/12 |
| M: MCP tools only | 12 (5-24) | 214K | 47K | 11/12 | 12/12 |
| N: cheat sheet + MCP tools | 6.5 (3-12) | 80K | 25K | 11/12 | 12/12 |

Reading
1. The cheat sheet alone is the best arm on every task: 4.5 turns and 52K input tokens against 17.5 and 623K for base. It beats every arm that has a tool.
2. The MCP alone saves some turns against base (12 vs 17.5 pooled, about 31%; tokens 214K vs 623K) but not against the sheet (12 vs 4.5), and it is no better than the aura_lookup prototype (12 vs 9.5 turns, equal cached cost). Task 8 is the weak case: 23 turns with 12 tool calls and 11 file reads, close to base (28).
3. Adding the MCP to the sheet made the sheet arm worse, not better: N 6.5 turns and 80K tokens against A 4.5 and 52K. N also missed first-try tsc once on task 2. Within n=3 the N-versus-A gap is small on tasks 5 and 9 and large on task 8 (8 vs 5), so it is directional, not proven.
4. So the MCP gives no turn saving over a good first-screen sheet. What it is good for: exact installed-version signatures (`get_symbol`), the error-code lookup, scaffolding and CLI wrappers as structured tools, and clients that cannot read the repository docs. It is not a first-screen replacement.
5. All 48 new runs finished and typechecked. No render, judge or frame probe was run, so nothing here says anything about output quality; 504 showed typecheck can pass on frozen water.

Caveats: n=3 per cell, model sampling is not seedable, B is from a different session, one model. The sandbox has no shell, so only `get_symbol`, `search_docs`, `get_recipe` and `explain_error` were exposed; `scaffold`, `assets_*` and `check_deploy` are covered by unit tests with a fixture project. The M and N bundles were built from the 504 docs through the shipped allow-list (public docs only, plus `docs/agents/error-codes.md` from this lane; the cheat sheet only in N).

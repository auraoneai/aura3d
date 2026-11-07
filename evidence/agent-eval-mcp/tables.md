Task 2

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| B aura_lookup (control, rerun) | 3 | 8 (7-11) | 3/3 | 3/3 | 3/3 | 3 | 5 | 131K | 2K | 35K |
| M MCP tools only | 3 | 13 (10-14) | 3/3 | 3/3 | 3/3 | 8 | 6 | 220K | 2K | 47K |
| N cheat sheet + MCP tools | 3 | 8 (3-12) | 3/3 | 3/3 | 3/3 | 4 | 4 | 102K | 2K | 28K |

Task 5

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| B aura_lookup (control, rerun) | 3 | 10 (9-12) | 3/3 | 3/3 | 3/3 | 3 | 7 | 211K | 4K | 50K |
| M MCP tools only | 3 | 9 (6-19) | 3/3 | 3/3 | 3/3 | 6 | 1 | 153K | 4K | 41K |
| N cheat sheet + MCP tools | 3 | 9 (6-11) | 3/3 | 3/3 | 3/3 | 4 | 3 | 122K | 3K | 31K |

Task 8

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| B aura_lookup (control, rerun) | 3 | 19 (18-22) | 3/3 | 3/3 | 3/3 | 4 | 16 | 583K | 8K | 102K |
| M MCP tools only | 3 | 24 (17-24) | 3/3 | 3/3 | 3/3 | 12 | 19 | 693K | 8K | 117K |
| N cheat sheet + MCP tools | 3 | 8 (6-9) | 3/3 | 2/3 | 3/3 | 4 | 3 | 133K | 6K | 39K |

Task 9

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| B aura_lookup (control, rerun) | 3 | 7 (6-8) | 3/3 | 3/3 | 3/3 | 2 | 3 | 121K | 3K | 36K |
| M MCP tools only | 3 | 5 (5-6) | 3/3 | 3/3 | 3/3 | 1 | 3 | 66K | 3K | 24K |
| N cheat sheet + MCP tools | 3 | 5 (4-8) | 3/3 | 3/3 | 3/3 | 2 | 2 | 48K | 2K | 19K |

All four tasks pooled

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| B aura_lookup (control, rerun) | 12 | 9.5 (6-22) | 12/12 | 12/12 | 12/12 | 3 | 5 | 201K | 3K | 47K |
| M MCP tools only | 12 | 11.5 (5-24) | 12/12 | 12/12 | 12/12 | 7.5 | 5.5 | 187K | 3K | 44K |
| N cheat sheet + MCP tools | 12 | 8 (3-12) | 12/12 | 11/12 | 12/12 | 3.5 | 2.5 | 94K | 3K | 28K |

Task 2

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| base: no entry docs, no tools | 3 | 15 (15-19) | 3/3 | 3/3 | 3/3 | 0 | 19 | 531K | 2K | 101K |
| A: cheat sheet only | 3 | 5 (4-7) | 3/3 | 3/3 | 3/3 | 0 | 4 | 54K | 1K | 17K |
| B: aura_lookup (511 session) | 3 | 8 (7-11) | 3/3 | 3/3 | 3/3 | 3 | 5 | 131K | 2K | 35K |
| M: MCP tools only | 3 | 13 (11-15) | 3/3 | 2/3 | 3/3 | 9 | 7 | 256K | 2K | 53K |
| N: cheat sheet + MCP tools | 3 | 7 (7-12) | 3/3 | 2/3 | 3/3 | 6 | 3 | 100K | 2K | 27K |

Task 5

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| base: no entry docs, no tools | 3 | 20 (16-30) | 3/3 | 3/3 | 3/3 | 0 | 31 | 715K | 6K | 130K |
| A: cheat sheet only | 3 | 6 (3-8) | 3/3 | 3/3 | 3/3 | 0 | 5 | 72K | 3K | 22K |
| B: aura_lookup (511 session) | 3 | 10 (9-12) | 3/3 | 3/3 | 3/3 | 3 | 7 | 211K | 4K | 50K |
| M: MCP tools only | 3 | 11 (9-16) | 3/3 | 3/3 | 3/3 | 7 | 5 | 172K | 4K | 41K |
| N: cheat sheet + MCP tools | 3 | 6 (5-7) | 3/3 | 3/3 | 3/3 | 4 | 1 | 76K | 3K | 24K |

Task 8

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| base: no entry docs, no tools | 3 | 28 (26-29) | 3/3 | 3/3 | 3/3 | 0 | 37 | 1405K | 12K | 222K |
| A: cheat sheet only | 3 | 5 (4-7) | 3/3 | 3/3 | 3/3 | 0 | 3 | 71K | 4K | 23K |
| B: aura_lookup (511 session) | 3 | 19 (18-22) | 3/3 | 3/3 | 3/3 | 4 | 16 | 583K | 8K | 102K |
| M: MCP tools only | 3 | 23 (15-24) | 3/3 | 3/3 | 3/3 | 12 | 11 | 688K | 9K | 121K |
| N: cheat sheet + MCP tools | 3 | 8 (5-9) | 3/3 | 3/3 | 3/3 | 1 | 4 | 145K | 6K | 41K |

Task 9

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| base: no entry docs, no tools | 3 | 9 (7-9) | 3/3 | 3/3 | 3/3 | 0 | 10 | 215K | 3K | 54K |
| A: cheat sheet only | 3 | 3 (3-4) | 3/3 | 3/3 | 3/3 | 0 | 2 | 33K | 2K | 17K |
| B: aura_lookup (511 session) | 3 | 7 (6-8) | 3/3 | 3/3 | 3/3 | 2 | 3 | 121K | 3K | 36K |
| M: MCP tools only | 3 | 5 (5-5) | 3/3 | 3/3 | 3/3 | 2 | 2 | 60K | 3K | 24K |
| N: cheat sheet + MCP tools | 3 | 4 (3-5) | 3/3 | 3/3 | 3/3 | 1 | 1 | 47K | 2K | 18K |

All four tasks pooled

| condition | n | turns median (range) | finished | first-try tsc | final tsc | tool calls (mcp/lookup) | reads+searches+lists | input tokens | output tokens | est. cached-cost |
|---|---|---|---|---|---|---|---|---|---|---|
| base: no entry docs, no tools | 12 | 17.5 (7-30) | 12/12 | 12/12 | 12/12 | 0 | 21 | 623K | 4K | 112K |
| A: cheat sheet only | 12 | 4.5 (3-8) | 12/12 | 12/12 | 12/12 | 0 | 3 | 52K | 2K | 19K |
| B: aura_lookup (511 session) | 12 | 9.5 (6-22) | 12/12 | 12/12 | 12/12 | 3 | 5 | 201K | 3K | 47K |
| M: MCP tools only | 12 | 12 (5-24) | 12/12 | 11/12 | 12/12 | 7 | 6 | 214K | 3K | 47K |
| N: cheat sheet + MCP tools | 12 | 6.5 (3-12) | 12/12 | 11/12 | 12/12 | 2.5 | 1.5 | 80K | 2K | 25K |

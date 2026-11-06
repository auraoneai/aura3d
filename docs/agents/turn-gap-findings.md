# Turn gap: why Aura3D agents need 5 to 24 turns and what closed it

Experiment `exp/turn-gap-504`, tables and raw runs in `evidence/agent-eval-504/` (`RESULTS.md`). Cold-start trial, tasks 2 (forest), 5 (shader water), 8 (island, water, day/night), 9 (procedural robot); n=3 per cell, one model, one judge.

## Cause

The turns are discovery, not debugging. In the docs503 transcripts the Aura arm reads 11 to 15 doc files and does 15 to 18 searches or listings per run on tasks 2, 5 and 8, writes once to three times and typechecks about once (first-try typecheck 12/12). The questions it asks on turn 1 are always the same: how to orbit the camera automatically (`autoRotate`), what `effects.fog` and the shadow options take, how `instances.*` takes `colors`, how a custom shader gets time (`setUniform`), how to move the sun and the sky (`app.atmosphere.setSky`), how to nest joints (`group`). `docs/agents/api-signatures.md` has no `camera`, `group` or runtime-handle section and truncates option lists, so agents fall through to `node_modules/**/*.d.ts` (4 to 10 reads on tasks 2, 5, 8). Tokens are turns times accumulated context: 15x three.js, but only about 1.3x once the repeated prefix is priced at 10%.

## What worked, measured (medians over tasks 2, 5, 8, 9)

| condition | turns | input tokens | est. cached cost | checklist |
|---|---|---|---|---|
| baseline (docs503) | 18 | 544K | 106K | 1.0 |
| A first-screen cheat sheet | 4 | 42K | 17K | 1.0 |
| D batching hint only | 8 | 205K | 56K | 1.0 |
| C cheat sheet + `aura_lookup` | 9 | 172K | 44K | 1.0 |
| B `aura_lookup` only | 12 | 292K | 64K | 1.0 |
| three.js (docs503) | 4 | 29K | 13K | 1.0 |

1. A is the lever: the entry doc (`llms.txt` in the agent sandbox) becomes a skeleton plus copy blocks with the exact calls, `AGENTS.md` shrinks to a pointer. Turns reach three.js parity (3 to 5), doc reads fall to 2, searches to about 1. Source: `docs/agents/first-screen-cheatsheet.md`, every block typechecked by `tools/agent-eval/check-cheatsheet.mjs`.
2. A one-call lookup tool alone halves turns on the hardest tasks but is not enough, and on top of A it adds turns (agents call it and then still verify in `.d.ts`). Treat an MCP lookup as a fallback for what the sheet does not cover, not a replacement for a first screen.
3. Telling the agent to batch reads helps (18 to 8) but costs more input than A; it composes with nothing here (not run with A).

## Do not skip

- The first sheet claimed `uTime` advances by itself. It does not in 5.0.2: water was frozen in 3 of 3 task-5 runs while the checklist judge still passed them. Only the frame-difference probe caught it. Any doc block that agents copy must be rendered, not just typechecked.
- Visual quality is not a turns problem: judged against three.js the Aura arm loses 11 of 12 pairs with the sheet (9 of 12 without), mean 16.2 versus 18.1 of 25, and the three task-2 forests are pixel-identical because every agent copies one block. A sheet makes outputs converge on the sheet.
- Blocks cover the four measured tasks. Tasks 1, 3, 4 (not in the sheet) went from 5, 9, 10 turns to 5, 5, 5 with the same checklist, which is encouraging, not proof of general coverage.

## Next steps (not done here)

Add `camera`, `group` and the runtime handle to the generated `api-signatures.md` and stop truncating option lists; make `uTime` advance or drop it from the prelude docs; ship the cheat sheet as the `llms.txt` first screen of `create-aura3d` output only after the physical frame check above passes for each block.

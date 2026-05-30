# Benchmark Round 5 Result

Round: `5`
Date: 2026-05-30
Commit: `3766288`
Runner: Codex local benchmark runner
Prompt scorers: Claude Code scored Codex outputs; Codex scored Claude Code outputs
Scorer neutrality statement: opposite-vendor model scoring was used for prompt outputs
Scorer signature: recorded in `benchmark/scoring/round-5-scores/`
User signature: `gchahal1982`, standing active-goal authorization to complete the benchmark tasks without additional permission

## Context Bundles

| Run | Agent | Library | Context source | Notes |
|---|---|---|---|---|
| A | Codex | Aura3D | `benchmark/context/aura3d` from Round 5 standard | Full run completed; prompts 06 and 08 failed compile/capture. |
| B | Codex | Three.js | raw Three.js context | Full run completed; prompt 06 failed compile/capture. |
| C | Claude Code | Aura3D | `benchmark/context/aura3d` from Round 5 standard | Full run completed; 10/10 screenshots; zero agent timeouts. |
| D | Claude Code | Three.js | raw Three.js context | Full run completed; prompts 03 and 04 timed out and remained scaffold-level despite later capture. |

## Prompt Scores

| Prompt | Codex Aura3D | Codex Three.js | Codex Result | Claude Aura3D | Claude Three.js | Claude Result | Notes |
|---|---:|---:|---|---:|---:|---|---|
| 01 Physics playground | 3 | 5 | Aura3D loss | 4 | 4 | tie | Aura3D process improved, but Codex/Three.js was visually stronger. |
| 02 Particle fountain | 4 | 1 | Aura3D win | 5 | 5 | tie | Aura3D particle helper produced visible dense particles. |
| 03 Solar system | 3 | 5 | Aura3D loss | 4 | 1 | Aura3D win | Claude/Three.js timed out and stayed scaffold-level. |
| 04 Neon tunnel | 2 | 5 | Aura3D loss | 4 | 1 | Aura3D win | Claude/Three.js timed out; Codex/Three.js was much stronger. |
| 05 Data visualization | 4 | 5 | Aura3D loss | 4 | 4 | tie | Aura3D data bars improved but did not beat Codex/Three.js. |
| 06 Mini-golf | 1 | 1 | tie | 3 | 4 | Aura3D loss | Codex typo broke both sides; Claude/Aura lost visually. |
| 07 Material lab | 2 | 5 | Aura3D loss | 3 | 4 | Aura3D loss | Hard prompt failed for both agents. Materials remain too dark/indistinct. |
| 08 City block | 1 | 5 | Aura3D loss | 4 | 5 | Aura3D loss | Hard prompt failed for both agents; Codex/Aura did not compile. |
| 09 Primitive humanoid | 2 | 4 | Aura3D loss | 3 | 4 | Aura3D loss | Humanoid prefab still underperforms raw Three.js readability. |
| 10 Sneaker viewer | 3 | 5 | Aura3D loss | 4 | 4 | tie | Hard prompt did not produce an Aura3D win; Codex/Three.js framed product better. |

Numeric score cells are visual match scores. Result cells are `Aura3D win`,
`tie`, or `Aura3D loss`.

## Run Health

| Run | Compiles | Browser routes | Screenshots | Agent timeouts |
|---|---:|---:|---:|---:|
| Codex + Aura3D | 8/10 | 8/10 | 8/10 | 0/10 |
| Codex + Three.js | 9/10 | 9/10 | 9/10 | 0/10 |
| Claude Code + Aura3D | 10/10 | 10/10 | 10/10 | 0/10 |
| Claude Code + Three.js | 10/10 | 10/10 | 10/10 | 2/10 |

The Round 5 finite-process amendment worked for Claude/Aura: all ten prompts
finished, built, ran in browser, and captured screenshots without agent
timeouts. This is real process progress. It is not enough to pass the release
bar because the visual win rate remains far below the required threshold.

## Round Summary

- Codex Aura3D wins: 1/10.
- Claude Aura3D wins: 2/10.
- Required Aura3D wins: 7/10 per agent.
- Codex wins among hard prompts 7/8/10: 0/3.
- Claude wins among hard prompts 7/8/10: 0/3.
- Codex Aura3D visual scores of 4 or higher: 2/10.
- Claude Aura3D visual scores of 4 or higher: 7/10.
- Codex Aura3D visual scores below 3: 5/10.
- Claude Aura3D visual scores below 3: 0/10.
- Engine parity result: fail. See `benchmark/results/round-5-engine.md`.
- Pass criteria met before Phase C decision: no.

## Scoring Evidence

- Codex outputs scored by Claude: `benchmark/scoring/round-5-scores/codex-by-claude.json`.
- Claude outputs scored by Codex: `benchmark/scoring/round-5-scores/claude-by-codex.json`.
- Engine parity scored by Claude: `benchmark/scoring/round-5-scores/engine-by-claude.json`.
- Local contact sheets, not committed: `/tmp/aura3d-round5-sheets/`.

## Follow-Up Library Work

- Fix Codex/Aura prompt 06 compile failure and make mini-golf visually complete.
- Fix Codex/Aura prompt 08 compile failure and make city helper reliably stronger.
- Improve material defaults, reflections, and exposure so prompt 07 wins instead
  of producing dark/indistinct spheres.
- Improve primitive humanoid body/limb readability and animation cues.
- Improve product-stage camera/framing so prompt 10 wins instead of tying or losing.
- Improve engine particle parity: Round 5 Aura3D renders a white fountain while
  the raw Three.js control renders a multicolor emitter/cloud.
- Investigate engine FPS and heap regressions on city and sneaker scenes before
  any next full round.

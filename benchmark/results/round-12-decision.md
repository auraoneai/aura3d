# Benchmark Round 12 Decision

Date: 2026-05-31
Commit SHA: d919c0848e8b841999c7c4e4d006ba44d4302de3
User signature: `gchahal1982`, active-goal authorization to execute all tasks in `REMAINING.md` without additional permission.

## Decision

Do not ship Aura3D as a proven Three.js competitor from Round 12.

Round 12 proves meaningful progress because the engine benchmark passed, but the main prompt benchmark still failed. The release bar requires Aura3D to win at least 7/10 prompts for both Codex and Claude Code. Round 12 reached only 2/10 for Codex outputs and 6/10 for Claude Code outputs.

## Gate Status

| Gate | Result | Pass |
|---|---|---|
| Engine benchmark | Passed in `benchmark/results/round-12-engine.md` | yes |
| Codex prompt win bar | 2/10, required 7/10 | no |
| Codex hard-prompt floor | 0/3, required 2/3 | no |
| Claude prompt win bar | 6/10, required 7/10 | no |
| Claude hard-prompt floor | 3/3, required 2/3 | yes |
| Aura visual floor | Codex 6 >=4 and 0 below 3; Claude 8 >=4 and 0 below 3 | yes |

## Specific Gaps

1. Codex/Aura needs major competitiveness work. It lost prompts 04, 05, 08, 09, and 10 and tied 02, 06, and 07.
2. Codex/Aura hard prompts remain the biggest blocker: 0/3 wins on prompts 07, 08, and 10.
3. Claude/Aura is close but still below the bar: 6/10 wins, one short of the required 7/10. Losses were prompts 01, 02, 04, and 05.
4. Raw Three.js baseline failure in Codex prompt 01 was retained as evidence, not repaired. Even with that baseline failure counted against Three.js, Codex/Aura still reached only 2/10 wins.

## Next Required Work

Target prompt-generation repairs before another full prompt matrix. Do not rerun the same benchmark unchanged. The next clean round must preserve the Round 12 engine pass or rerun the engine gate if standards change.

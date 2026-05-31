# Benchmark Round 13 Decision

Date: 2026-05-31
Commit SHA: d1a533fab8c3
User signature: pending `gchahal1982`

## Decision

Do not ship Aura3D as a proven Three.js competitor from Round 13.

Round 13 was a real progression point, not another smoke-shot loop: it ran the full prompt matrix once from the committed `d1a533f` standard, captured runtime evidence, and submitted the outputs to neutral scoring. The result still failed the release gate.

## Gate Status

| Gate | Result | Pass |
|---|---|---|
| Codex prompt win bar | 2/10, required 7/10 | no |
| Codex hard-prompt floor | 0/3, required 2/3 | no |
| Codex Aura visual floor | 8 scores >=4, but 1 score below 3 | no |
| Claude prompt win bar | 7/10, required 7/10 | yes |
| Claude hard-prompt floor | 2/3, required 2/3 | yes |
| Claude Aura visual floor | 8 scores >=4, 0 below 3 | yes |
| Engine benchmark | Latest valid engine proof passed in `benchmark/results/round-12-engine.md` | yes |
| Release / go live | Blocked by Codex prompt benchmark failure | no |

## What Is Stuck

The blocker is specific: Codex-generated Aura3D apps do not yet pass the benchmark. In this round, Codex/Aura failed prompt 01 at compile time by importing non-public physics symbols, lost prompt 06 to raw Three.js, and only tied prompts 07, 08, and 10 instead of winning at least two of those hard prompts.

Claude/Aura reached the numerical pass bar in this round, which is progress. It does not matter for release unless Codex/Aura also passes.

## What Not To Do Next

Do not keep tuning screenshots or rerunning the same prompt matrix. Round 13 already answered the question: the current standard still fails.

Do not update release notes as passing, do not run the release proof guard as a release step, do not mark Task 12, 17, or 18 complete, and do not tag/publish.

## Required Next Work

1. Repair the public/context API guidance that led Codex to import `PhysicsDebugAdapter`, `PhysicsWorld`, and `Shape` from `@aura3d/engine` in prompt 01.
2. Add a focused guard/test so benchmark-generated Aura3D source fails fast if it imports non-public engine symbols.
3. Improve Codex/Aura prompt 06 output quality against the raw Three.js baseline.
4. Improve Codex/Aura hard prompts 07, 08, and 10 from ties to wins without weakening Claude/Aura results.
5. Only after those targeted fixes are committed and signed as a new standard should another clean full prompt benchmark be considered.

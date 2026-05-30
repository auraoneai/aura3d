# Benchmark Round 5 Decision

Round: `5`
Date: 2026-05-30
Commit: `3766288`
Scorer signature: prompt and engine scorer outputs in `benchmark/scoring/round-5-scores/`
User signature: `gchahal1982`, standing active-goal authorization to complete the benchmark tasks without additional permission

## Decision

Decision: `fix specific gaps and re-run`.

Aura3D is still not releasable as a proven Three.js competitor. Round 5 shows
real progress in process reliability and engine visual parity, but the primary
prompt benchmark misses the release bar by a wide margin and engine parity still
fails.

Do not ship Aura3D 1.0.0 from Round 5. Do not start another full round until the
specific failures below are fixed with targeted library/context changes and
smoke-tested.

## Evidence

- Prompt result file: `benchmark/results/round-5.md`.
- Engine result file: `benchmark/results/round-5-engine.md`.
- Codex Aura3D wins: 1/10.
- Claude Aura3D wins: 2/10.
- Required wins: 7/10 per agent.
- Codex hard-prompt wins among 7/8/10: 0/3.
- Claude hard-prompt wins among 7/8/10: 0/3.
- Codex Aura3D visual scores of 4 or higher: 2/10.
- Claude Aura3D visual scores of 4 or higher: 7/10.
- Codex Aura3D visual scores below 3: 5/10.
- Claude Aura3D visual scores below 3: 0/10.
- Engine visual parity count: 4/5.
- Engine parity pass: no.

## What Improved

- Claude/Aura completed all ten prompts with zero timeouts.
- Claude/Aura produced screenshots for all ten prompts.
- Engine visual parity improved to 4/5 scenes.
- FPS calibration now reports sane control values and marks instrumentation
  status as valid.
- The Round 5 finite-process standard prevented the earlier Claude/Aura
  nontermination problem.

## What Still Fails

- Codex/Aura prompt 06 failed to compile and produced no screenshot.
- Codex/Aura prompt 08 failed to compile and produced no screenshot.
- Codex/Aura won only prompt 02 and tied prompt 06.
- Claude/Aura won only prompts 03 and 04, both because Claude/Three.js timed out
  and stayed scaffold-level.
- Prompt 07 material lab failed for both agents.
- Prompt 08 city block failed for both agents.
- Prompt 10 sneaker viewer did not produce an Aura3D win for either agent.
- Engine particles VFX failed visual parity.
- Engine city and sneaker scenes failed relative FPS thresholds.
- Engine city failed the heap-gap threshold.

## Required Follow-Up

1. Fix Codex/Aura compile failures on prompts 06 and 08.
2. Improve mini-golf, material lab, city, humanoid, and sneaker helper defaults.
3. Improve material lighting/exposure so glass, metal, rubber, emissive, and
   clearcoat are visually distinct without manual tuning.
4. Make city output reliable across both agents, not just Claude.
5. Improve product-stage camera fit and centering.
6. Align engine particle visual target with the raw Three.js parity scene.
7. Profile city and sneaker engine performance before the next full benchmark.
8. Run small smoke captures for the repaired failure families before starting
   another complete benchmark round.

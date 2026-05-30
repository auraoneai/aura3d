# Benchmark Round 1 Result

Round: `1`
Date: 2026-05-29
Commit: `1fd9e2348efd910b0673e10a9173a543b1f9685d`
Runner: Codex on the signed Phase A benchmark package
Scorer: Claude Code for Codex outputs; Codex for Claude Code outputs
Scorer neutrality statement: Codex outputs were scored by the opposite-vendor model Claude Code. Claude Code outputs were scored by the opposite-vendor model Codex. Internal scripts only collected raw artifacts and metrics; they did not certify readiness.
Scorer signature: Claude Code and Codex model outputs saved under `benchmark/scoring/round-1-scores/`
User signature: `gchahal1982`, 2026-05-29. I, gchahal1982, confirm that Round 1 failed as recorded in benchmark/results/round-1.md, benchmark/results/round-1-engine.md, and benchmark/results/round-1-decision.md. I approve committing these results and moving to Phase D fixes. Do not ship Aura3D as a proven Three.js competitor from this round.

## Context Bundles

| Run | Agent | Library | Context source | Notes |
|---|---|---|---|---|
| A | Codex | Aura3D | `benchmark/context/aura3d/files` | 10/10 generated and captured |
| B | Codex | Three.js | `benchmark/context/threejs/files` | 10/10 generated and captured |
| C | Claude Code | Aura3D | `benchmark/context/aura3d/files` | 9/10 captured; prompt 07 timed out; prompts 09/10 generated but did not terminate normally |
| D | Claude Code | Three.js | `benchmark/context/threejs/files` | 10/10 generated and captured |

## Prompt Scores

| Prompt | Codex Aura3D | Codex Three.js | Codex Result | Claude Aura3D | Claude Three.js | Claude Result | Notes |
|---|---:|---:|---|---:|---:|---|---|
| 01 Physics playground | 4 | 3 | Aura3D win | 4 | 3 | tie | Claude: tie |
| 02 Particle fountain | 4 | 4 | tie | 2 | 5 | Aura3D loss | Codex: tie; Claude: Aura3D loss |
| 03 Solar system | 4 | 3 | tie | 4 | 4 | tie | Codex: tie; Claude: tie |
| 04 Neon tunnel | 4 | 2 | tie | 3 | 5 | Aura3D loss | Codex: tie; Claude: Aura3D loss |
| 05 Data visualization | 4 | 4 | tie | 4 | 4 | tie | Codex: tie; Claude: tie |
| 06 Mini-golf | 3 | 4 | Aura3D loss | 4 | 4 | tie | Codex: Aura3D loss; Claude: tie |
| 07 Material lab | 4 | 4 | tie | 1 | 4 | Aura3D loss | Codex: tie; Claude: Aura3D loss; Aura3D agent timed out before generating a usable source. |
| 08 City block | 4 | 4 | Aura3D win | 4 | 5 | Aura3D loss | Claude: Aura3D loss |
| 09 Primitive humanoid | 4 | 4 | tie | 4 | 4 | tie | Codex: tie; Claude: tie; Aura3D agent did not terminate; time metric treated as unavailable/noncompliant despite later captured source. |
| 10 Sneaker viewer | 4 | 5 | Aura3D loss | 5 | 4 | tie | Codex: Aura3D loss; Claude: tie; Aura3D agent did not terminate; time metric treated as unavailable/noncompliant despite later captured source. |

Numeric cells are visual match scores. Detailed per-metric scorer JSON is in `benchmark/scoring/round-1-scores/`.

## Round Summary

- Codex Aura3D wins: 2/10; ties: 6; losses: 2.
- Claude Aura3D wins: 0/10; ties: 6; losses: 4.
- Codex wins among prompts 7/8/10: 1/3. Required: at least 2.
- Claude wins among prompts 7/8/10: 0/3. Required: at least 2.
- Aura3D visual scores of 4 or higher: Codex 9/10, Claude 7/10.
- Aura3D visual scores below 3: Codex 0/10, Claude 2/10.
- Engine parity result: fail. See `benchmark/results/round-1-engine.md`.
  The engine visual-parity failure is a real signal. The p50 FPS failure is
  recorded as a failed threshold but appears to be instrumentation noise because
  both Aura3D and raw Three.js measured at 1-8 FPS on an M4 Max capture run.
- Pass criteria met before Phase C decision: no.

## Required Conclusion

Round 1 does not prove Aura3D is a Three.js competitor in measurable benchmark terms. The benchmark must move to Phase C failure handling: identify the specific prompt and engine gaps, ship library/API/context fixes, and rerun the full round from scratch.

## Notable Failures

- Codex did not reach the 7/10 Aura3D win bar: only 2 wins.
- Claude Code did not reach the 7/10 Aura3D win bar: 0 wins.
- Hard prompt floor failed for both agents.
- Claude/Aura prompt 02 visually failed the particle fountain: no visible fountain, HUD showed 0 live particles.
- Claude/Aura prompt 07 timed out with the scaffold unchanged.
- Claude/Aura prompts 09 and 10 generated usable visuals but did not terminate normally, so their time metric is treated as noncompliant.
- Codex/Aura prompt 01 looked good but the scorer noted the physics appeared cosmetic rather than genuinely simulated.
- Codex/Aura prompt 10 lost visually to raw Three.js in Claude scoring.
- Engine FPS measurement is not reliable enough to decide Round 2 engine
  quality until the capture harness is fixed or the FPS threshold is formally
  suspended by a `PRD-AMENDMENT` commit. Round 1 still fails even if the FPS
  threshold is discounted, because engine visual parity reached only 3/5 scenes
  and the prompt benchmark missed the release bar by a wide margin.

## Follow-Up Library Work

- Add real first-class runtime systems for procedural animation, particles, materials, product viewers, and interactions so agents do not fall back to raw Three.js for the live render.
- Fix or document the physics surface so agents can build actual simulations instead of screenshots that only look like simulations.
- Improve Aura3D defaults for camera framing, material fidelity, particle density, city/building detail, and product plinth/framing.
- Make prompt 10 asset handling less ambiguous while keeping asset discovery out of scope.
- Repair the Claude/Aura context path that caused prompt 07 timeout and prompt 09/10 nontermination.

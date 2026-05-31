# Benchmark Round 7 Result

Round: `7`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Base commit: `196d42e559ac5a24e27a433c91c7833ad67acfa9`
Runner: Codex local benchmark runner
Prompt scorers: Claude Code scored Codex outputs; Codex scored Claude Code outputs
Scorer neutrality statement: opposite-vendor model scoring was used for prompt outputs
Scorer signature: recorded in `benchmark/scoring/round-7-scores/`
User signature: `gchahal1982`, standing active-goal authorization to complete all FinalizedPromptPlan.md tasks without additional permission.

## Context Bundles

| Run | Agent | Library | Context source | Notes |
|---|---|---|---|---|
| A | Codex | Aura3D | `benchmark/context/aura3d` from Round 7 standard | Full run completed; 10/10 screenshots; zero timeouts. |
| B | Codex | Three.js | raw Three.js context | Full run completed; prompt 01 failed compile and prompt 03 failed browser route. |
| C | Claude Code | Aura3D | `benchmark/context/aura3d` from Round 7 standard | Full run completed; 10/10 screenshots; zero timeouts. |
| D | Claude Code | Three.js | raw Three.js context | Full run completed; prompt 05 failed browser route. |

## Prompt Scores

| Prompt | Codex Aura3D | Codex Three.js | Codex Result | Claude Aura3D | Claude Three.js | Claude Result | Notes |
|---|---:|---:|---|---:|---:|---|---|
| 01 Physics playground | 4 | 1 | Aura3D win | 4 | 5 | Aura3D loss | Aura compiles and renders 50 colorful cubes on a tilted ramp with contact overlay and reset; Three / Both compile and render physics playgrounds with many cubes, ramp, reset/contact HUD |
| 02 Particle fountain | 4 | 3 | Aura3D win | 5 | 3 | Aura3D win | Both run / Aura renders a dense upward-and-falling particle fountain with a visible emitter and emission-rate UI |
| 03 Procedural solar system | 4 | 1 | Aura3D win | 4 | 5 | Aura3D loss | Aura renders sun with glow, six planets at clearly different orbit radii, color-coded labels and full-system framing in 43 lines / Aura shows the required sun, planets, orbits/labels, and full-system framing |
| 04 Neon tunnel flythrough | 3 | 4 | tie | 4 | 4 | Aura3D win | Aura's square tunnel reads as a flythrough with emissive segments and depth darkening, but bloom/glow is not visibly present though it is a required element / Both render a recognizable neon tunnel/flythrough |
| 05 3D data visualization | 4 | 5 | tie | 4 | 1 | Aura3D win | Both show a 6x6 grid of height-varying, color-by-height bars / Aura compiles and renders a 6x6 height-colored bar grid |
| 06 Mini-golf hole | 4 | 5 | tie | 4 | 4 | Aura3D win | Both render a green, obstacle, ball, score counter and follow framing / Both render a playable-looking mini-golf hole with ball, obstacle/target, HUD, and camera framing |
| 07 Material lab | 3 | 5 | tie | 4 | 5 | Aura3D loss | Hard prompt / Hard prompt |
| 08 Procedural city block | 3 | 5 | Aura3D loss | 4 | 5 | Aura3D loss | Hard prompt / Hard prompt |
| 09 Animated primitive humanoid | 4 | 4 | Aura3D win | 4 | 4 | Aura3D win | Both render a primitive humanoid (sphere head, cylinder torso, box limbs) mid-stride on a ground plane / Both show a primitive humanoid in a walking pose/scene |
| 10 Product viewer sneaker | 4 | 5 | Aura3D loss | 4 | 4 | tie | Hard prompt / Hard prompt |

Numeric score cells are visual match scores. Result cells are `Aura3D win`, `tie`, or `Aura3D loss`.

## Run Health

| Run | Compiles | Browser routes | Screenshots | Agent timeouts |
|---|---:|---:|---:|---:|
| Codex + Aura3D | 10/10 | 10/10 | 10/10 | 0/10 |
| Codex + Three.js | 9/10 | 8/10 | 8/10 | 0/10 |
| Claude Code + Aura3D | 10/10 | 10/10 | 10/10 | 0/10 |
| Claude Code + Three.js | 10/10 | 9/10 | 9/10 | 0/10 |

## Round Summary

- Codex Aura3D wins: 4/10.
- Claude Aura3D wins: 5/10.
- Required Aura3D wins: 7/10 per agent.
- Codex wins among hard prompts 7/8/10: 0/3.
- Claude wins among hard prompts 7/8/10: 0/3.
- Codex Aura3D visual scores of 4 or higher: 7/10.
- Claude Aura3D visual scores of 4 or higher: 10/10.
- Codex Aura3D visual scores below 3: 0/10.
- Claude Aura3D visual scores below 3: 0/10.
- Engine parity result: fail. See `benchmark/results/round-7-engine.md`.
- Pass criteria met before Phase C decision: no.

## Scoring Evidence

- Codex outputs scored by Claude: `benchmark/scoring/round-7-scores/codex-by-claude.json`.
- Claude outputs scored by Codex: `benchmark/scoring/round-7-scores/claude-by-codex.json`.
- Engine parity scored by Claude: `benchmark/scoring/round-7-scores/engine-by-claude.json`.
- Local contact sheets, not committed:
  - `/tmp/aura3d-round7-codex-aura3d-captures-sheet.png`
  - `/tmp/aura3d-round7-codex-threejs-captures-sheet.png`
  - `/tmp/aura3d-round7-claude-aura3d-captures-sheet.png`
  - `/tmp/aura3d-round7-claude-threejs-captures-sheet.png`
  - `/tmp/aura3d-round7-engine-captures-sheet.png`

## Follow-Up Library Work

- Hard prompts remain the decisive gap: material lab, city block, and sneaker viewer did not produce two Aura wins for either agent.
- Improve material/environment lighting so material lab beats raw Three.js instead of tying or losing.
- Improve city helper detail/framing/street-light evidence so city block beats raw Three.js.
- Improve product-stage framing and lighting so sneaker viewer wins rather than tying/losing.
- Investigate absolute FPS floor misses on engine material-grid and city-block; calibration is now valid, so the low absolute FPS is recorded as a real threshold failure even though Three.js is similarly slow.

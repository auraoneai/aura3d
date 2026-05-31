# Benchmark Round 7 Decision

Round: `7`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Base commit: `196d42e559ac5a24e27a433c91c7833ad67acfa9`
User signature: `gchahal1982`, standing active-goal authorization to complete all FinalizedPromptPlan.md tasks without additional permission.

## Decision

Do not ship Aura3D as a proven Three.js competitor from Round 7. Continue Phase D fixes and rerun only after another amendment that targets the remaining failures.

## Why

Round 7 shows real progress but still misses the frozen release bar:

- Codex/Aura reached 4/10 wins; required 7/10.
- Claude/Aura reached 5/10 wins; required 7/10.
- Codex/Aura won 0/3 hard prompts among 07, 08, 10; required at least 2.
- Claude/Aura won 0/3 hard prompts among 07, 08, 10; required at least 2.
- Engine visual parity passed 5/5, but engine overall failed because material-grid and city-block missed the absolute 30 FPS floor under valid calibration.

## What Progress Is Real

- Codex/Aura generated and captured 10/10 prompts with no timeouts.
- Claude/Aura generated and captured 10/10 prompts with no timeouts.
- The prior Round 6 prompt 08 nullable-target TypeScript failure did not recur.
- Aura3D prompt outputs are now visually credible across the whole prompt set; no Aura visual score fell below 3.
- Engine visual parity reached 5/5, a major improvement over earlier rounds.

## Remaining Release Blockers

1. Material lab: Aura3D still does not clearly beat Three.js on distinct material identity, reflections, and lighting.
2. City block: Aura3D city output is usable but raw Three.js still scores better for detail, streets, lighting, and scale variation.
3. Product sneaker: Aura3D ties or loses because product framing/lighting is not consistently stronger than raw Three.js.
4. Engine FPS: material-grid and city-block need to clear the absolute 30 FPS threshold with valid calibration.
5. Prompt scoring: Aura3D needs at least 7 wins per agent and at least 2 hard-prompt wins per agent; Round 7 is still below both thresholds.

## Next Work

No more blind reruns. The next amendment should target only these remaining gaps, then a fresh full round can be run from that amended standard.

# Round 1 Decision

Date: 2026-05-29
Commit: `1fd9e2348efd910b0673e10a9173a543b1f9685d`
User signature: `gchahal1982`, 2026-05-29. I, gchahal1982, confirm that Round 1 failed as recorded in benchmark/results/round-1.md, benchmark/results/round-1-engine.md, and benchmark/results/round-1-decision.md. I approve committing these results and moving to Phase D fixes. Do not ship Aura3D as a proven Three.js competitor from this round.

## Decision

Fix specific gaps and re-run. Do not ship Aura3D as a proven Three.js competitor from this round.

## Why

The frozen benchmark bar was not met. Codex produced only 2/10 Aura3D wins and Claude Code produced only 0/10 Aura3D wins. Both agents missed the hard-prompt floor for prompts 7, 8, and 10. Engine parity also failed: only 3/5 scenes met visual parity >=4.

The engine p50 FPS threshold is also recorded as failed, but it should be treated as instrumentation noise rather than renderer-quality evidence for this round. Both Aura3D and raw Three.js measured between 1 and 8 FPS on an M4 Max capture run, which is not credible for the raw Three.js control scenes. Discounting FPS does not change the decision because the prompt benchmark and engine visual-parity floor still fail.

## Phase C Classification

- Pass criteria for both agents: no.
- Pass criteria for one agent: no.
- Pass criteria not met: yes.
- Engine parity benchmark fails: yes.

## Specific Gaps To Fix Before Re-Run

1. Prompt 02 particles: Aura3D must expose or document a real high-density particle/VFX path that agents can use without writing a broken symbolic emitter.
2. Prompt 07 material lab: Claude/Aura context must not hang; the material API needs clearer examples for metallic, glass/transmission, rubber/roughness, emissive, and clearcoat.
3. Prompt 08 city: Aura3D output needs default city/architecture helpers or examples for windows, streets, scale, and camera framing.
4. Prompt 10 product viewer: Aura3D needs first-class product viewer controls, GLB fit-to-bounds, plinth, orbit, and turntable APIs so agents do not implement the actual render in raw Three.js.
5. Physics: prompt 01 can look acceptable while still being cosmetic. The library needs documented real rigid-body simulation that agents can compose.
6. Runtime animation: prompt 09 exposed weak/nonterminating agent behavior and awkward snapshot re-authoring. Add a proper animation/update hook.
7. Engine parity: improve particles and city fidelity. Before Round 2, fix the low-FPS measurement harness and prove sane control measurements, or use a `PRD-AMENDMENT` commit to suspend or replace the FPS criterion.
8. Context reliability: fix Claude-specific nontermination on prompts 09 and 10. Agents must finish with build/run commands, not leave dev servers running.

## Re-Run Rule

After fixes land, Phase B must be re-run from scratch. Partial reruns do not count under `FinalizedPromptPlan.md`.

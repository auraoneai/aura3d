# Benchmark Round 9 Result

Date: 2026-05-30
Commit SHA: d6c23ea14043fd4fbb99a97b650186ff1c7e7df2
Runner: Round 9 runner in `benchmark/runs/round-9/_tools`
User signature: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission. Round 9 remains failed and
invalid for shipping.

## Decision

Round 9 prompt benchmark failed. Aura3D is not live/releasable as a proven Three.js competitor from this round.

## Summary

| Agent | Aura3D wins | Three.js wins | Ties | Required Aura3D wins | Hard prompt wins 07/08/10 | Release bar |
|---|---:|---:|---:|---:|---|---|
| Codex | 6 | 3 | 1 | 7 | 1/3 | fail |
| Claude Code | 2 | 6 | 2 | 7 | 0/3 | fail |

## Codex Outputs Scored By Claude

Scorer: Claude Code
Neutrality: opposite-vendor model scoring Codex-generated outputs; split into two scorer handoffs because the first full handoff hung with zero output

| Prompt | Visual A/T | Modifiability A/T | Winner | Reason |
|---|---|---|---|---|
| 01-physics-playground | 4/4 | 5/3 | Aura3D win | Aura wins LOC, time-to-render, and modifiability; Three wins only bundle size; visual is a tie. |
| 02-particle-fountain | 3/4 | 5/3 | Three.js win | Three wins visual, files, time, and bundle; Aura wins only LOC and modifiability. |
| 03-procedural-solar-system | 3/5 | 5/3 | Aura3D win | Aura wins LOC, time, and modifiability; Three wins visual and bundle. Majority of non-tied metrics favor Aura despite Three's stronger render. |
| 04-neon-tunnel-flythrough | 4/5 | 5/3 | Aura3D win | Aura wins LOC, time, and modifiability; Three wins visual and bundle. Non-tied majority favors Aura. |
| 05-3d-data-visualization | 3/5 | 5/3 | tie | Even split: Aura wins LOC, time, modifiability; Three wins visual, files, bundle. No majority among non-tied metrics, so tie. |
| 06-mini-golf-hole | 4/4 | 5/3 | Aura3D win | Aura wins LOC, time, modifiability; Three wins only bundle. |
| 07-material-lab | 4/4 | 5/3 | Aura3D win | Aura wins LOC, time, modifiability; Three wins only bundle. |
| 08-procedural-city-block | 4/4 | 5/3 | Three.js win | Three wins files, time, bundle (3); Aura wins LOC, modifiability (2). |
| 09-animated-primitive-humanoid | 4/4 | 5/3 | Aura3D win | Aura wins LOC, time, modifiability; Three wins only bundle. |
| 10-product-viewer-sneaker | 4/4 | 5/3 | Three.js win | Three wins files, time, bundle (3); Aura wins LOC, modifiability (2). |

## Claude Outputs Scored By Codex

Scorer: Codex
Neutrality: opposite-vendor model scoring Claude-generated outputs

| Prompt | Visual A/T | Modifiability A/T | Winner | Reason |
|---|---|---|---|---|
| 01-physics-playground | 4/4 | 4/3 | Aura3D win | Aura3D wins more non-tied metrics through lower LOC, faster render, and better modifiability. |
| 02-particle-fountain | 4/4 | 4/4 | Aura3D win | Aura3D wins the non-tied metrics on LOC and render time despite the larger bundle. |
| 03-procedural-solar-system | 3/5 | 3/4 | Three.js win | Three.js wins visual quality, render time, bundle size, and modifiability. |
| 04-neon-tunnel-flythrough | 3/5 | 3/4 | Three.js win | Three.js wins on visual match, render time, bundle size, and modifiability. |
| 05-3d-data-visualization | 4/5 | 3/4 | Three.js win | Three.js narrowly wins non-tied metrics due to stronger visual match, smaller bundle, and more direct modifiability. |
| 06-mini-golf-hole | 4/5 | 3/4 | Three.js win | Three.js wins most non-tied metrics outside LOC. |
| 07-material-lab | 4/4 | 3/4 | tie | Non-tied metric wins are evenly split, with most metrics tied. |
| 08-procedural-city-block | 5/5 | 4/4 | tie | Aura3D wins LOC and time, Three.js wins file count and bundle size, and the rest tie. |
| 09-animated-primitive-humanoid | 3/5 | 3/4 | Three.js win | Three.js wins the visual, bundle, and modifiability metrics despite Aura3D's LOC and time advantages. |
| 10-product-viewer-sneaker | 5/5 | 4/4 | Three.js win | Three.js wins file count, render time, and bundle size; Aura3D wins LOC and asset-path correctness. |

## Local Screenshot Sheets

These are local visual aids generated from the committed run artifacts; they are not scorer inputs.

- /tmp/aura3d-round9-sheets/codex-aura3d.png
- /tmp/aura3d-round9-sheets/codex-threejs.png
- /tmp/aura3d-round9-sheets/claude-aura3d.png
- /tmp/aura3d-round9-sheets/claude-threejs.png

## Failed Gates

- Codex/Aura3D won 6/10, below the required 7/10.
- Claude/Aura3D won 2/10, below the required 7/10.
- Codex hard-prompt wins were 1/3; required at least 2/3.
- Claude hard-prompt wins were 0/3; required at least 2/3.

## Specific Prompt Gaps For Next Repair

- Codex: improve prompt 02 particle fountain, prompt 08 city, and prompt 10 product viewer so Aura3D wins hard prompts instead of losing/tieing on visual or runtime metrics.
- Claude: improve prompt 03 solar system, prompt 04 neon tunnel, prompt 05 data visualization, prompt 06 mini-golf, prompt 09 humanoid, and prompt 10 product viewer. These lost mainly because raw Three.js was scored visually stronger and/or faster despite Aura3D using less code.

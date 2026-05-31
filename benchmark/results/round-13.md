# Benchmark Round 13 Result

Date: 2026-05-31
Commit SHA: d1a533fab8c3
Runner: `benchmark/runs/round-13/_tools`
Scorers: Claude Code scored Codex outputs; Codex scored Claude Code outputs
User signature: pending `gchahal1982`

## Decision

Round 13 prompt benchmark failed. It was the single clean Round 13 prompt run from the committed `d1a533f` standard, and it does not meet the release bar.

Aura3D cannot be marked live or shipped as a proven Three.js competitor from this round.

## Pass Math

| Agent family | Aura3D wins | Ties | Aura3D losses | Required wins | Aura visuals >=4 | Aura visuals <3 | Hard prompt wins 7/8/10 | Task 12 pass |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Codex outputs scored by Claude | 2/10 | 6 | 2 | 7/10 | 8 | 1 | 0/3 | no |
| Claude Code outputs scored by Codex | 7/10 | 1 | 2 | 7/10 | 8 | 0 | 2/3 | yes |

Release requirement: both agent families must pass. Claude Code outputs reached the 7/10 bar, but Codex outputs reached only 2/10, missed the hard-prompt floor with 0/3 wins on prompts 07/08/10, and had one Aura3D visual score below 3 because prompt 01 did not compile.

## Runtime Capture Summary

| Run | Agent | Library | Generation | Captures passing | Screenshots | Notes |
|---|---|---|---|---:|---:|---|
| codex-aura3d | Codex | Aura3D | 10/10 exited 0 | 9/10 | 9/10 | Prompt 01 failed build/typecheck and has no screenshot. |
| codex-threejs | Codex | Three.js | 10/10 exited 0 | 10/10 | 10/10 | Complete baseline. |
| claude-aura3d | Claude Code | Aura3D | 10/10 exited 0 | 10/10 | 10/10 | Complete run. |
| claude-threejs | Claude Code | Three.js | 9/10 exited 0; prompt 06 timed out | 9/10 | 9/10 | Prompt 06 timed out after 20 minutes and has no screenshot. Prompt 10 has one invented asset-path finding. |

Artifacts produced under `benchmark/runs/round-13`:

- 40 `metrics.json` files
- 40 `route-health.json` files
- 40 `source-listing.md` files
- 38 `screenshot.png` files
- Missing screenshots: `codex-aura3d/prompt-01` and `claude-threejs/prompt-06`

## Primary Failure

`codex-aura3d/prompt-01` imported unavailable physics exports from `@aura3d/engine`:

- `PhysicsDebugAdapter`
- `PhysicsWorld`
- `Shape`

The resulting TypeScript build failed, so the prompt received no Aura3D screenshot and a visual score of 1. This alone fails the no-Aura-score-below-3 floor, and the overall Codex/Aura result still reaches only 2/10 wins.

## Codex Outputs Scored By Claude

| Prompt | Winner | Aura visual | Three visual | Aura mod | Three mod | Reason |
|---|---|---:|---:|---:|---:|---|
| 01-physics-playground | Three.js win | 1 | 5 | 2 | 4 | Aura fails to compile (uses unexported PhysicsWorld/Shape/PhysicsDebugAdapter), so no screenshot and visual quality is scored 1. Three.js compiles, runs, and shows 50 cubes on a tilted ramp with live contact count and reset—satisfying all required evidence. |
| 02-particle-fountain | Aura3D win | 4 | 4 | 5 | 3 | Both render comparable fountains—identifiable emitter, upward-and-falling arc, lifetime color variation, ground plane, and an emission-rate control. Visual quality is roughly equal (4/4), but Aura achieves it in 38 lines vs 302, giving it a decisive modifiability and metric edge. |
| 03-procedural-solar-system | tie | 4 | 5 | 5 | 3 | Both show a glowing sun and 6 labeled planets at clearly different orbit distances with orbit-camera framing. Three.js labels are cleaner; Aura has minor label-backing artifacts (stray colored bars under labels) but is far more concise (30 vs 203 lines). Three's slight visual edge is offset by Aura's strong modifiability advantage. |
| 04-neon-tunnel-flythrough | tie | 4 | 5 | 5 | 3 | Both read clearly as neon tunnel flythroughs with emissive segments, perspective vanishing point, bloom and fog falloff. Three.js has stronger glow/bloom aesthetic; Aura delivers a clean geometric emissive tunnel in 30 vs 189 lines. Three's visual edge balances Aura's modifiability/metric edge. |
| 05-3d-data-visualization | tie | 4 | 5 | 5 | 3 | Both present a 6x6 grid (~36 bars) with varying heights and height-based color. Three.js is the more complete viz with 3D axes, gradient legend, and a real raycaster hover; Aura uses HTML side-panel axis labels and documents hover, satisfying requirements in 65 vs 295 lines. Three's richer realization is offset by Aura's conciseness. |
| 06-mini-golf-hole | Three.js win | 3 | 5 | 5 | 3 | Three.js presents a clean mini-golf green with rails, a clearly labeled obstacle, ball, hole/flag, shot counter, click-drag aim with real ball physics and a ball-following camera. Aura's scene satisfies the checklist but the screenshot is visibly cluttered with stray white bars and extra spheres, dropping its visual fidelity (3 vs 5)—the 2-point visual gap outweighs Aura's modifiability advantage. |
| 07-material-lab | tie | 4 | 5 | 5 | 3 | Both show five spheres with visually distinct metal/glass/rubber/emissive/clearcoat materials under studio lighting with environment reflections and orbit. Three.js (RoomEnvironment + RectAreaLights + plinth labels) is slightly more refined; Aura is a touch overexposed but correct, achieving it in 21 vs 224 lines—an extreme modifiability advantage that balances the visual edge. |
| 08-procedural-city-block | tie | 4 | 5 | 5 | 3 | Both show ~20 buildings of varying heights with windows, streets, street lights, and a working day/night change. Three.js is more polished (window grids, lane markings, lamp posts, a real toggle switch shown in Day mode); Aura captures a night scene with lit windows and a toggle in 68 vs 346 lines. Three's visual polish is balanced by Aura's modifiability/metric edge. |
| 09-animated-primitive-humanoid | Aura3D win | 5 | 4 | 5 | 3 | Both build a primitive humanoid (sphere head, cylinder torso, box limbs) on a ground plane with a walk path. Aura's screenshot captures a clearly dynamic mid-stride pose with swinging limbs, visible joints and a motion trail—exactly the 'pose that implies animation' requirement—while Three.js reads more like a near-static standing figure. Aura's stronger visual (5 vs 4) plus 21 vs 190 lines wins it. |
| 10-product-viewer-sneaker | tie | 4 | 5 | 5 | 3 | Both load the provided sneaker, center and auto-scale it on a plinth with studio lighting, orbit controls and turntable rotation, and neither invents an asset path. Three.js is the cleaner hero product shot (uniform background, soft shadow); Aura has minor floating-backdrop artifacts but is correct and uses the sanctioned generated-asset workflow in 28 vs 170 lines. Three's visual edge balances Aura's modifiability advantage. |

## Claude Code Outputs Scored By Codex

| Prompt | Winner | Aura visual | Three visual | Aura mod | Three mod | Reason |
|---|---|---:|---:|---:|---:|---|
| 01-physics-playground | Aura3D win | 4 | 4 | 5 | 3 | Visual quality is effectively tied, while Aura3D is much simpler and slightly faster to first usable render. Three.js has the smaller bundle but higher source complexity. |
| 02-particle-fountain | Aura3D win | 4 | 3 | 5 | 3 | Aura3D gives a stronger visual match and dramatically lower implementation complexity. Three.js is functional but less readable in the captured screenshot. |
| 03-procedural-solar-system | Aura3D win | 5 | 4 | 5 | 3 | Aura3D has the stronger prompt match in the screenshot and much simpler source. Three.js performs well but loses framing and complexity points. |
| 04-neon-tunnel-flythrough | Three.js win | 3 | 5 | 5 | 4 | Three.js has a substantially better visual match for the tunnel flythrough prompt. Aura3D is more concise, but the captured scene is weaker. |
| 05-3d-data-visualization | Three.js win | 3 | 4 | 4 | 3 | Three.js provides the more convincing data visualization and explicit hover-highlight implementation, despite Aura3D being shorter and faster. |
| 06-mini-golf-hole | Aura3D win | 4 | 1 | 5 | 2 | Aura3D produced a complete visible mini-golf scene with much less code, while Three.js failed browser runtime and had no screenshot. |
| 07-material-lab | tie | 4 | 4 | 5 | 4 | Visual output is comparable: Aura3D is more concise, while Three.js has better runtime and bundle metrics with explicit material setup. |
| 08-procedural-city-block | Aura3D win | 5 | 4 | 5 | 3 | The metric count is balanced, but Aura3D has the stronger prompt match visually and is much simpler to modify. |
| 09-animated-primitive-humanoid | Aura3D win | 5 | 4 | 5 | 4 | Both satisfy the prompt, but Aura3D has a stronger visual pose and better modifiability despite slower render and larger bundle. |
| 10-product-viewer-sneaker | Aura3D win | 5 | 4 | 5 | 3 | Aura3D gives the stronger product viewer, uses the provided asset through the typed manifest, and avoids the Three.js asset-path failure. |

## Local Screenshot Sheets

- /tmp/aura3d-round13-sheets/codex-aura3d.png
- /tmp/aura3d-round13-sheets/codex-threejs.png
- /tmp/aura3d-round13-sheets/claude-aura3d.png
- /tmp/aura3d-round13-sheets/claude-threejs.png

## Required Follow-Up

Do not rerun the same benchmark unchanged. The next work is targeted repair only:

1. Prevent agents from importing unavailable physics internals from `@aura3d/engine`; prompt 01 must use public APIs/prefabs only and compile reliably.
2. Improve Codex/Aura competitiveness. Round 13 Codex/Aura won only prompts 02 and 09.
3. Fix Codex/Aura hard-prompt competitiveness. It won 0/3 of prompts 07, 08, and 10.
4. Preserve the Claude/Aura gains while addressing remaining Claude/Aura losses on prompts 04 and 05.
5. Do not mark Task 12 complete until a fresh signed full round proves both agents meet every prompt benchmark floor.

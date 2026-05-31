# Benchmark Round 12 Result

Date: 2026-05-31
Commit SHA: d919c0848e8b841999c7c4e4d006ba44d4302de3
Runner: `benchmark/runs/round-12/_tools`
Scorers: Claude Code scored Codex outputs; Codex scored Claude Code outputs
User signature: `gchahal1982`, active-goal authorization to execute all tasks in `REMAINING.md` without additional permission.

## Decision

Round 12 prompt benchmark failed. The engine benchmark passed in `benchmark/results/round-12-engine.md`, but the main prompt benchmark did not meet the required 7/10 Aura3D win bar for either agent family. Aura3D is not live/releasable as a proven Three.js competitor from this round.

## Pass Math

| Agent family | Aura3D wins | Ties | Aura3D losses | Required wins | Aura visuals >=4 | Aura visuals <3 | Hard prompt wins 7/8/10 | Task 12 pass |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Codex outputs scored by Claude | 2/10 | 3 | 5 | 7/10 | 6 | 0 | 0/3 | no |
| Claude Code outputs scored by Codex | 6/10 | 0 | 4 | 7/10 | 8 | 0 | 3/3 | no |

## Codex Outputs Scored By Claude

| Prompt | Winner | Aura visual | Three visual | Aura mod | Three mod | Reason |
|---|---|---:|---:|---:|---:|---|
| 01-physics-playground | Aura3D win | 4 | 1 | 4 | 3 | Aura compiles, runs, and shows many cubes on a tilted ramp with reset button and live contact overlay. Three.js fails to compile due to a hallucinated DOM type, so no screenshot exists; visual=1 and all runtime/compile thresholds fail. Note: Aura's contact count is a simulated sine value rather than from real collisions, but the scene still satisfies the required visual evidence. |
| 02-particle-fountain | tie | 4 | 4 | 4 | 4 | Both render real fountains. Aura shows a dense, vibrant upward burst with strong lifetime color variation but a subtle emitter/ground. Three.js shows a clearly identifiable nozzle emitter, visible grid ground plane, an upward-and-falling arc, lifetime color, and a slider control — matching the required evidence list more literally. Aura wins conciseness and render time; Three.js wins bundle size and emitter/ground clarity. Net even. |
| 03-procedural-solar-system | Aura3D win | 4 | 4 | 4 | 4 | Both are strong: one sun, six labeled planets, distinct orbit distances, and sun glow/bloom. Aura renders six distinctly colored planets with clean dashed orbit ellipses and readable boxed labels. Three.js uses a real UnrealBloomPass and CSS2D labels but its bloom blows several planets into white blobs, slightly reducing planet distinctness. Visual is even; Aura's metric edge (conciseness, faster render) plus marginally cleaner planet readability gives it the narrow win. |
| 04-neon-tunnel-flythrough | Three.js win | 3 | 4 | 4 | 4 | Three.js clearly reads as a neon tunnel flythrough: concentric emissive rings receding into fog with bloom glow and depth falloff, despite a minor teal core-glow artifact. Aura's frame reads more as a static neon rectangular box than a tube interior, with weak bloom/fog cues. This is a quality-dominated prompt, so Three.js's much stronger tunnel match outweighs Aura's conciseness and render-time metric edge. |
| 05-3d-data-visualization | Three.js win | 3 | 5 | 4 | 4 | Three.js delivers a polished, large, clearly-labeled 6x6 grid: height-mapped color (blue→yellow→red), readable X/Z/Height axis labels with numbered ticks, title, and documented raycaster hover-highlight. Aura's render is recognizable (≈36 bars, varied heights, color-by-height) but small/dim with axis ticks that are not clearly readable. Three.js matches the required visual evidence far better; its visual edge outweighs Aura's conciseness/render-time metric wins. |
| 06-mini-golf-hole | tie | 4 | 5 | 4 | 4 | Both meet every required evidence item (green, obstacle, ball, aim interaction, score counter, follow camera). Three.js renders a cleaner, more polished hole (visual 5 vs 4 — Aura has scattered plank-like debris on the green), but Aura achieves the same functional result in ~7.6x fewer lines and renders ~2x faster. Visual/bundle edge to Three balances concision/render edge to Aura. |
| 07-material-lab | tie | 4 | 5 | 4 | 5 | Both show 5 spheres, distinct materials, studio lighting, environment reflection, and orbit. Three.js is cleaner and correctly distinguishes the emissive sphere (it glows) and adds plinths, and its explicit per-material physical params are exactly the knobs a 'lab' user would tweak (modifiability 5). Aura's emissive sphere reads ambiguously (no clear glow), but it delivers strong env reflections and all five materials in ~9 lines and renders ~3x faster. Three's visual/modifiability edge balances Aura's concision/render edge. |
| 08-procedural-city-block | Three.js win | 3 | 5 | 4 | 4 | Three.js clearly satisfies the prompt: ~20 varied-height buildings with readable windows, streets with lane markings, sidewalks, street lights, and a fully functional day/night toggle (setMode swaps sky, sun, ambient, lamp lights, and window emissives). Aura shows a night city with ~20 buildings of varying heights, but windows render as abstract colored bars, and its day/night toggle only changes a label/aria-pressed state — the prefab is built fixed to 'night', so the toggle does not visibly change lighting/sky as required. The 2-point visual gap and the broken toggle outweigh Aura's concision and render-time advantages. |
| 09-animated-primitive-humanoid | Three.js win | 3 | 5 | 4 | 5 | Three.js renders a clean, clearly humanoid figure (sphere head, cylinder torso, box limbs, hands, shoes) in a convincing mid-stride walk pose with cast shadow on a path across the ground plane, plus tunable gait equations (modifiability 5). Aura's figure includes the right primitives, joints, and a motion trail but reads as disjointed — splayed limbs and a floating gray block/sphere artifact behind the body — so it only partially satisfies 'reads as humanoid'. Three's strong visual fidelity and explicit, editable animation outweigh Aura's concision and faster render. |
| 10-product-viewer-sneaker | Three.js win | 4 | 5 | 4 | 4 | Both load, center, and auto-scale the sneaker on a plinth with studio lighting, orbit, and turntable rotation. Three.js delivers a cleaner product shot, used the exact mandated asset path (0 invented), rendered ~2.3x faster, and ships a smaller bundle. Aura's stage is attractive (glass case, reflection panels) but slightly cluttered, and it triggered the asset-path failure (inventedAssetPaths=1) the prompt explicitly penalizes, plus the slowest render in the set. Three wins on asset-path correctness, render time, and bundle; Aura wins only on concision. |

## Claude Code Outputs Scored By Codex

| Prompt | Winner | Aura visual | Three visual | Aura mod | Three mod | Reason |
|---|---|---:|---:|---:|---:|---|
| 01-physics-playground | Three.js win | 4 | 5 | 5 | 3 | Three.js better satisfies the physics-playground behavior and visual evidence, despite Aura3D being much more compact. |
| 02-particle-fountain | Three.js win | 3 | 5 | 5 | 3 | Three.js is a stronger prompt match because it implements controllable emission, gravity, lifetime coloring, and ground collision visibly and directly. |
| 03-procedural-solar-system | Aura3D win | 5 | 4 | 5 | 3 | Aura3D delivers a cleaner screenshot match with excellent labels and composition while requiring much less source code. |
| 04-neon-tunnel-flythrough | Three.js win | 4 | 5 | 5 | 4 | Three.js produces the more convincing neon tube flythrough with explicit bloom and fog, while Aura3D wins on compactness. |
| 05-3d-data-visualization | Three.js win | 3 | 5 | 5 | 3 | Three.js is a clearer and more complete data-visualization implementation, especially for axis labels and hover behavior. Aura3D is much simpler but less evidentially complete. |
| 06-mini-golf-hole | Aura3D win | 4 | 5 | 5 | 3 | Three.js has the stronger visual, but Aura3D wins the aggregate on modifiability, code size, and render time while still meeting the visual requirements strongly. |
| 07-material-lab | Aura3D win | 4 | 4 | 5 | 3 | Visual quality is comparable, while Aura3D is substantially simpler and faster to usable render despite a larger bundle. |
| 08-procedural-city-block | Aura3D win | 4 | 5 | 4 | 3 | Three.js is visually stronger, but Aura3D wins the aggregate through much lower complexity and faster usable render while still satisfying the scene requirements. |
| 09-animated-primitive-humanoid | Aura3D win | 5 | 3 | 5 | 3 | Aura3D has the better captured visual and much simpler source; Three.js only wins size and render-time metrics. |
| 10-product-viewer-sneaker | Aura3D win | 5 | 5 | 4 | 4 | Both visuals are excellent and both fail the asset-path metric; Aura3D edges ahead on source size and time to usable render. |

## Runtime Capture Summary

- Agent generation completed 40/40 with exit code 0 and no timeouts.
- Runtime capture produced 39/40 passing app captures.
- `codex-threejs/prompt-01` failed build/typecheck with `HTMLStrongElement`; this failure was kept in the scoring evidence and not repaired mid-run.
- Engine benchmark passed separately in `benchmark/results/round-12-engine.md`.

## Local Screenshot Sheets

- /tmp/aura3d-round12-sheets/codex-aura3d.png
- /tmp/aura3d-round12-sheets/codex-threejs.png
- /tmp/aura3d-round12-sheets/claude-aura3d.png
- /tmp/aura3d-round12-sheets/claude-threejs.png
- /tmp/aura3d-round12-sheets/engine-contact-sheet.png

## Required Follow-Up

- Improve Codex/Aura prompt competitiveness, especially prompts 04, 05, 08, 09, and 10.
- Improve hard-prompt outcomes for Codex/Aura; it won 0/3 of prompts 07, 08, and 10 in Round 12.
- Improve Claude/Aura enough to gain at least one more win while preserving the 3/3 hard-prompt wins it achieved.
- Rerun a clean prompt benchmark only after targeted repair evidence exists.

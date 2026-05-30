# Benchmark Round 2 Result

Date: 2026-05-30
Base standard commit: `83c8b8f558dd27bfdc0fe96f2746ee6f60ce8141`
Status: failed
User signature: not required for failure recording; prior approval authorizes committing Round 2 results and continuing fixes.

## Summary

Round 2 does not prove Aura3D is a Three.js competitor for AI-agent-built 3D scenes.

| Area | Required | Actual | Pass |
| --- | ---: | ---: | --- |
| Codex + Aura3D wins vs Codex + Three.js | 7/10 | 1/10 | no |
| Claude + Aura3D wins vs Claude + Three.js | 7/10 | 0/10 | no |
| Codex hard-prompt Aura3D wins (07/08/10) | 2/3 | 0/3 | no |
| Claude hard-prompt Aura3D wins (07/08/10) | 2/3 | 0/3 | no |
| Engine visual parity scenes >=4 | 4/5 | 2/5 | no |
| Engine parity overall | pass | fail | no |

The run used the Round 2 timeout amendment with `AURA3D_AGENT_TIMEOUT_MS=600000`. This override is recorded in prompt `run-metadata.json` files. Codex returned normally for all 20 prompt attempts. Claude/Aura timed out on 8 of 10 prompt attempts; Claude/Three timed out on 2 of 10.

## Codex Outputs Scored By Claude

Scorer: Claude Code (opposite-vendor model scoring Codex outputs)

| Prompt | Aura Visual | Three Visual | Winner | Reason |
| --- | ---: | ---: | --- | --- |
| 01 | 1 | 5 | Three.js win | The Three.js build renders a complete, legible physics scene: ~50 colorful cubes piled around a clearly tilted ramp on a grid floor, with a live contact count (25), bodies count, and a Reset button — satisfying every required visual evidence item. The Aura3D build shows only the HTML overlay (LIVE CONTACTS 0, BODIES 50, Reset) over an entirely black viewport; no cubes, ramp, or 3D scene rendered at all, and the contact count is 0, so it fails almost all required visual evidence despite compiling and running. |
| 02 | 4 | 2 | Aura3D win | Aura3D renders a live particle fountain: a clearly identifiable emitter (glowing point over a cyan disk), strong upward-and-falling parabolic arcs of particles, a visible ground plane, an emission-rate slider (1,200 particles/sec), and some lifetime color variation (white in flight, amber dots near the ground). Three.js produced a polished emitter nozzle, a grid ground plane, an emission-rate slider, and a color legend, but the screenshot shows NO particles at all in flight — the single most important required evidence (an upward-and-falling arc colored by lifetime) is entirely absent. A nice emitter with zero particles fails the core of the prompt, so Aura3D wins decisively. |
| 03 | 3 | 5 | Three.js win | Both runs render a sun with bloom, 6 labeled planets at varied distances, and readable labels. Three.js delivers a far stronger composition: an angled orbit-camera view with clear elliptical orbit rings, a glowing spherical sun, a ringed gas giant, and a rich starfield that frames the whole system as a recognizable solar system. Aura3D's view is nearly edge-on so the planets read as a flat horizontal row with no visible orbit paths, the sun renders as a malformed rounded-rectangle/capsule rather than a sphere, and its per-planet orbit multipliers are labeled in reverse (inner planets show larger 'x orbit' values). Aura3D satisfies the checklist but is visually weaker. |
| 04 | 2 | 5 | Three.js win | The Three.js render is a textbook neon tunnel flythrough: concentric emissive rings recede into the distance on a dark background, vivid neon colors (cyan, magenta, pink, yellow) show strong bloom/glow halos, and clear depth/fog falloff toward the vanishing point — it reads convincingly as a flythrough. The Aura3D render shows flat white/purple/yellow rectangular streaks radiating from a center on a pale blue-grey background; it reads as a generic starburst/warp rather than a tube interior, with no visible bloom, no dark-to-glow contrast, and no fog falloff, failing most of the required visual evidence. |
| 05 | 1 | 5 | Three.js win | The Three.js scene fully satisfies the prompt: a clear 6x6 grid of ~36 bars with strongly varying heights, a height-correlated color gradient (cyan low to orange/yellow high), readable axis labels (Value/Height, X Category, Z Category, numeric ticks) and a title, all in an orbit-camera 3D view. The Aura3D scene renders essentially nothing — a dark empty frame with only a few faint UI overlays (legend, axis captions, 'Hover a bar' hint) and no visible bars at all, failing every required visual evidence item. |
| 06 | 3 | 4 | Three.js win | Both render a green, a red cylinder obstacle, a white ball, an aim indicator, and a visible strokes counter. Three.js delivers a clean, well-composed framing of the full course with walls, lighting/shadows, an aim ring on the ball, and a bonus hole-and-flag at the far end. Aura3D includes all required elements with nice materials and an aim line, but its camera is awkwardly zoomed and off-center, leaving a large empty dark region and cropping the course; no hole/flag is shown. Three.js is the more complete and better-composed scene. |
| 07 | 3 | 5 | Three.js win | Both render five spheres under studio lighting with a bright key highlight and clear environment reflection. Aura3D shows a distinct emissive red sphere and a metallic gold sphere, but its glass and rubber spheres read as nearly identical dark/gray matte balls with no visible transparency or clearcoat sheen, so the five material types are not all distinct. The Three.js scene is markedly more polished: a clearly chrome metal, a genuinely transparent glass, a matte black rubber, a glowing pink emissive, and a glossy teal clearcoat, each on labeled pedestals in a soft studio environment, fully satisfying all required visual evidence. |
| 08 | 3 | 4 | Three.js win | Both satisfy the core requirements: each shows roughly 20 box buildings of clearly varying heights, visible window grids, streets with lane markings, street lights, and a day/night toggle UI. The Aura3D scene is a competent street-level view but reads flat — the street lights are dull gray posts with no emissive glow, lighting is muted, and the composition is somewhat cramped. The Three.js scene is more polished and legible: a clear intersecting street grid with crosswalks, buildings ringing the block with colored/lit window facades, and street lamps that actually emit a warm yellow glow, giving stronger depth and a more convincing city-block read. Both render cleanly with no hallucinated APIs or invented assets, but Three.js delivers the more complete and visually appealing result. |
| 09 | 3 | 4 | Three.js win | Both produce a clear primitive humanoid on a visible ground plane with a walk-implied pose and clean metrics. Three.js wins on visual polish: a richer environment (sky, green ground, brown path with footprint decals, grid) plus facial features and colored extremities, with no rendering artifacts. Aura3D's figure is solid and its split-leg stride reads as walking more strongly, but the scene is dark and sparse, the figure faces away (no face), and a translucent box artifact near the right arm looks like a glitch. |
| 10 | 3 | 5 | Three.js win | Both load the sneaker centered and auto-scaled on a plinth with studio lighting, orbit/turntable implied. Three.js renders at far higher fidelity: crisp woven-mesh material detail, clean white circular plinth, soft studio lighting and a natural contact shadow resembling real product photography. Aura3D's render is flatter with washed material detail, a dark background, and a distracting ghost double-shadow artifact behind the shoe. |

Codex result: Aura3D 1 wins, Three.js 9 wins, 0 ties. Overall pass: no.

## Claude Outputs Scored By Codex

Scorer: Codex (opposite-vendor model scoring Claude Code outputs)

| Prompt | Aura Visual | Three Visual | Winner | Reason |
| --- | ---: | ---: | --- | --- |
| 01 | 1 | 1 | tie | Both Claude outputs are process-noncompliant due timeout. Aura screenshot is blank white; Three.js also timed out, so no compliant winner is awarded. |
| 02 | 1 | 4 | Three.js win | Aura3D timed out and did not produce a successful browser capture. Three.js returned normally and rendered a dense particle fountain with emitter, lifetime colors, ground, and controls. |
| 03 | 4 | 4 | tie | Both returned normally and rendered a recognizable labeled solar system with orbit paths and planets. Neither has a decisive visual advantage. |
| 04 | 3 | 5 | Three.js win | Aura3D produced a recognizable neon tunnel screenshot but the agent timed out. Three.js returned normally and renders a stronger glowing flythrough. |
| 05 | 1 | 4 | Three.js win | Aura3D timed out and captured as blank/white. Three.js returned normally with a clear 3D bar chart. |
| 06 | 1 | 4 | Three.js win | Aura3D timed out and captured as blank/white. Three.js returned normally with a visible mini-golf green, ball, obstacle, score, and interaction note. |
| 07 | 1 | 1 | tie | Aura3D timed out and captured as blank/white. Three.js also timed out and captured as blank/white, so no compliant winner is awarded. |
| 08 | 3 | 4 | Three.js win | Aura3D rendered a recognizable city but timed out. Three.js returned normally and rendered a comparable city block, so the compliant output wins. |
| 09 | 1 | 3 | Three.js win | Aura3D timed out and captured as blank/white. Three.js returned normally with a primitive humanoid on a ground plane. |
| 10 | 4 | 4 | tie | Both returned normally and loaded the sneaker on a product stage/plinth with lighting. Visual quality is close enough to call a tie. |

Claude result: Aura3D 0 wins, Three.js 6 wins, 4 ties. Overall pass: no.

## Evidence

Local contact sheets for visual inspection:

- `/tmp/aura3d-round2-sheets/codex-aura3d.png`
- `/tmp/aura3d-round2-sheets/codex-threejs.png`
- `/tmp/aura3d-round2-sheets/claude-aura3d.png`
- `/tmp/aura3d-round2-sheets/claude-threejs.png`
- `/tmp/aura3d-round2-sheets/engine.png`

Committed raw artifacts live under `benchmark/runs/round-2/` and scorer outputs under `benchmark/scoring/round-2-scores/`. Screenshot PNGs remain local evidence and are excluded from commit by `benchmark/runs/round-2/.gitignore`.

## Decision

Round 2 fails. Do not ship Aura3D as a proven Three.js competitor from this round.

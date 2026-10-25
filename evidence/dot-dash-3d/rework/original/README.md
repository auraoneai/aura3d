# Dot Dash 3D is now Glint Courier (own identity)

Before: arcade-derived maze layout, blue neon walls on black, yellow pellets, a yellow ball hero, four pastel ghost models, classic fruit, "the original circuit" wording. After: new layouts, graphite and copper board with amber and cyan traces, datachips, surge cells, a faceted drone with a spinning ring, sentries as cone, cube, ring and saucer, gem bonuses, and new wording everywhere.

Frames are software WebGL2 (SwiftShader, remote runner `dotor-2`), not real-GPU evidence. Capture: `tests/browser/shotsd-dot-dash-3d.spec.ts` against a single-route build; decoded with `tools/shots/decode-shotsd.mjs`. 0 console errors, 0 bad responses.

- `before/` (from `screens/final`): 1280 mid, 390 mid, 1280 Circuit Map.
- `after/`: 1280 title, mid and Board Map, 390 mid and Board Map.

Changes: mazes redrawn (Relay Grid, Smelter Rows, Overgrowth; all six pass `scripts/validate-mazes.mjs`), actors and pickups are instanced primitives (11 Meshy models removed, 6.4 MB), palette and HUD wording changed. The simulation and its rules are unchanged. Not done: new sounds (still the shared library effects), the index card name and blurb in `apps/showcase-index`, and `llms.txt`/README mentions of "Dot Dash 3D".

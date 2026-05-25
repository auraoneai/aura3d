# V9 Geometry, Lines, Points, Sprites, And Helpers

This area remains partial overall.

## Real Code

- Primitive geometry and topologies in `packages/rendering/src/Geometry.ts`.
- Debug helper line builders in `packages/debug/src/SceneHelpers.ts`.
- Picking and selection code in `packages/controls/src/Picking.ts` and related controls.
- Routes under `apps/lines-helpers/`, `apps/interactive-picking/`, and `apps/geometry-drawrange/`.

## Supported Today

- Basic line segments and point topology.
- Debug-style axes/grids/bounds/frustum/light/skeleton helper lines.
- Point/cube picking route evidence.
- Geometry draw-range route evidence.

## Remaining Deltas

- `webgl_buffergeometry_drawrange` is partial.
- `webgl_points_sprites` is partial.
- `webgl_lines_fat` is partial.
- `misc_helpers` is partial.
- Full Three.js sprite and fat-line behavior is not claimed.

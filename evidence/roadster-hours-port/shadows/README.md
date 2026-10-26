# Saltwind Highway (Roadster Hours): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-roadster-hours.spec.ts`, run `p1shadow-l-roadster-hours`), 640x360, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 120.54 | 71 |
| sun shadow (1 cascade, 90 m) | 120.29 | 110 |
Road, ramps, terrain, towers, town and solid props are `material.custom` surfaces that receive the key light's shadow (`lightSurface` scales the sun and specular terms by `gSunShadow`). The capture waits for the texture upgrade (an early frame shows white models: the white car in the first capture was timing, present with and without shadows). Gates, cells, hazards, kickers and shortcut decks do not cast; vehicles, poles, towers and town do. A tree's shadow is visible on the right hillside. Draw calls were 215 with two cascades and every prop casting. The vehicles are `batched.mesh` instances drawn through the instanced depth path.

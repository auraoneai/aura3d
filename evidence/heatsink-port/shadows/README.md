# Ion Circuit (HEATSINK): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-heatsink.spec.ts`, run `p1shadow-f-heatsink`), 640x360, 120 frames after start, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 81.53 | 63 |
| sun shadow (2 cascades, 160 m) | 81.75 | 133 |

The road, terrain and solid props are `material.custom` surfaces that now receive the key light's shadow (`receiveShadow: true`, `a3dSunShadowAuto`). Track-length meshes (road, rails, plains, rocks, arches) are skipped as oversize casters; the drone, gates and props cast.

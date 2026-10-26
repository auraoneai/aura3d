# Ion Circuit (HEATSINK): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-heatsink.spec.ts`, run `p1shadow-k-heatsink`), 640x360, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 81.63 | 63 |
| sun shadow (2 cascades, 160 m) | 81.68 | 69 |
Road, terrain and solid props are `material.custom` surfaces that receive the key light's shadow (`receiveShadow: true`, `a3dSunShadowAuto`). Track-length meshes are skipped as oversize casters; strike targets and flat decals do not cast; the drone, gate pylons and props do (133 draw calls before the targets stopped casting).

# Saltwind Highway (Roadster Hours): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-roadster-hours.spec.ts`, run `p1shadow-g-roadster-hours`), 640x360, route 0, 180 steps after start, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 125.26 | 71 |
| sun shadow (2 cascades, 140 m) | 125.18 | 215 |

Road, ramps, terrain, towers, town and solid props are `material.custom` surfaces that receive the key light's shadow (`receiveShadow: true`; `lightSurface` scales the sun and specular terms by `gSunShadow`). The frame shows a tree's shadow on the right hillside. Draw calls rise because every small caster is drawn once per cascade; the shadow pass is software-GL heavy, so `?shadow=0` stays available. The first run hit a GL feedback loop (see the CHANGELOG entry on the alpha depth sampler); it is fixed.

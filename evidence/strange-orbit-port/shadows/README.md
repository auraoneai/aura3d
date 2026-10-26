# Craterline GP (Strange Orbit): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-strange-orbit.spec.ts`, run `p1shadow-g-strange-orbit`), 640x360, trial mode, 120 frames after start, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 90.05 | 23 |
| sun shadow (2 cascades, 160 m) | 90.00 | 95 |

The track, solids and minerals are `material.custom` surfaces that receive the key light's shadow (`shade()` scales the key term by `gKey`, and the key specular highlight too). The sky dome and star layers are skipped as oversize casters.

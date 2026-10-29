# Ion Circuit (HEATSINK): sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-heatsink.spec.ts`, run `p1shadow-k-heatsink`), 640x360, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 81.63 | 63 |
| sun shadow (2 cascades, 160 m) | 81.68 | 69 |
Road, terrain and solid props are `material.custom` surfaces that receive the key light's shadow (`receiveShadow: true`, `a3dSunShadowAuto`). Track-length meshes are skipped as oversize casters, and strike targets and flat decals do not cast.

Correction (audit lane G19, 2026-10-29): this README used to say the drone, gate pylons and props cast. They do not: `examples/heatsink-port/models.ts` authors `castShadow: false` on the drone, barrels, pickups, scenery and pylons, and the live 4.5.0 page reported `appliedLook.shadows.mapRendered: false`. The drone's contact cue is now a blob quad on the road under it, scaled and faded with height (`drone-blob` in `world.ts`, row HP-08).

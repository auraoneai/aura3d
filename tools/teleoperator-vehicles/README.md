# Teleoperator vehicle tooling

Reproduces the generic vehicle set that replaced the real-vehicle models in Teleoperator.

1. `prompts.json`: the text prompts (no brand or model names, text only) passed to `node /tmp/meshy/meshy.mjs make --game teleoperator ...` through Kiro Prism. Oversized meshes were remeshed to a 20k polycount with `meshy.mjs remesh`.
2. Optimise (`/tmp/meshy/optimize.mjs`, JPEG normals, 1024 px textures), then `orient.mjs <in.glb> <out.glb> 1`: rotates so the vehicle faces -Z with its length on Z, centres it on x/z and rests it on y = 0.
3. `ortho.mjs <in.glb> <prefix>`: unlit orthographic front, rear and side renders of the shipped GLB, used to find and review badges and lettering.
4. `cover.mjs <in.glb> <out.glb> '<json covers>'`: adds a thin plain-colour disc over a mark the generator invented (front, rear, left or right face).
5. `apply.mjs <dir>`: copies each `covered.glb` (or `oriented.glb`) to `public/aura-assets/teleopVeh<Name>.<sha8>.glb` and rewrites `aura.assets.json`, `src/aura-assets.ts` and the app-local asset tables.
6. `decode.mjs <acr log> <outDir>`: rebuilds the `TELEART_FRAME` chunks printed by `tests/browser/teleart.spec.ts` into JPEGs.

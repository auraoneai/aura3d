# Teleoperator vehicle tooling

Offline GLB utilities from the pre-5.6.0 Teleoperator vehicle pass.

> Historical (pre-5.6.0): since the 5.6.0 Idol pass Grid Dispatch (`apps/showcase-teleoperator`) draws its playable,
> rival, traffic and parked cars as fal Idol models (`src/art/idolModels.ts`, spec `tools/idol/specs/teleoperator.json`), and
> no app source references the `teleopVeh*` GLBs this pass produced.

1. `orient.mjs <in.glb> <out.glb> 1`: rotates so the vehicle faces -Z with its length on Z, centres it on x/z and rests it on y = 0 (`orient-building.mjs` centres and grounds without rotating).
2. `ortho.mjs <in.glb> <prefix>`: unlit orthographic front, rear and side renders of a GLB, used to find and review badges and lettering (`flat-ortho.mjs` is the untextured variant).
3. `cover.mjs <in.glb> <out.glb> '<json covers>'`: adds a thin plain-colour disc over an unwanted mark (front, rear, left or right face).
4. `flatten.mjs <in.glb> <out.glb>`: splits a textured vehicle into flat PBR region materials.
5. `decode.mjs <acr log> <outDir>`: rebuilds the `TELEART_FRAME` chunks printed by `tests/browser/teleart.spec.ts` into JPEGs.

# Worked example: aura3d-retexture

Skill: `packages/aura3d-cli/skills/aura3d-retexture/SKILL.md` (PRD P4).
Run on 2026-09-25 in the Aura3D monorepo against
`packages/create-aura3d/templates/product-viewer/public/aura-assets/product-fixture.glb`.
The "after" file was a temp copy with only material base colors changed.

## Goal

Prove the geometry-untouched check works: identical geometry must pass even
though the file bytes change, and different geometry must fail.

## Commands run and trimmed output

1. `assets inspect` output fields: `ok, schema, file, format, sizeBytes,
   bounds, boundsMetadata, materials, materialMetadata, animations, textures,
   orientation, nodeNames, dependencies, warnings, messages`. There is no
   vertex or accessor hash, which is why the skill bundles
   `references/geometry-hash.mjs`.

2. A material-only edit (every material's `baseColorFactor` set to red, JSON
   chunk rewritten, BIN untouched):

   ```sh
   node packages/aura3d-cli/skills/aura3d-retexture/references/geometry-hash.mjs product-fixture.glb recolored.glb
   ```

   ```json
   { "geometryUntouched": true,
     "before": "sha256-145dec7f8bae117f822b0e8b29d7a1801bd6b0cd221503f8088088894176b465",
     "after":  "sha256-145dec7f8bae117f822b0e8b29d7a1801bd6b0cd221503f8088088894176b465" }
   ```

   Exit code 0. Whole-file sha256 differs (`5613d5ad...` vs `50bf56f3...`),
   so the manifest `hash` alone would have reported a change.
   `assets inspect` on the recolored file: bounds `[1.85, 3.005, 1.72]`, min
   `[-0.925, -1.58, -0.75]`, max `[0.925, 1.425, 0.97]`, materials unchanged,
   the same as the source.

3. A different mesh (negative control):

   ```sh
   node .../geometry-hash.mjs product-fixture.glb tests/fixtures/gltf-multipart/multi-material-wheels.glb
   ```

   ```text
   geometryUntouched: false, primitiveCount [11, 9], changed: cabinet#0, front-grille#0, ... (11 primitives)
   ```

   Exit code 1.

## Facts verified in source

- `model(asset, { material })` on a typed GLB passes only a flat `tint`
  (base color, emissive, roughness, metallic, clearcoat, and
  `replaceSurfaceTextures: true`) to `createTypedGLBActor`. It cannot swap
  maps or target one part, so real map changes need a new GLB.
- `camera.frameAsset` and `camera.perspective` exist for matched filmstrip
  views.
- The first script version rejected this fixture because its buffer is a
  base64 data URI; the script now reads BIN chunks, data URIs, and relative
  buffer files, and rejects Draco geometry.

## Evidence still owed (remote)

PRD Phase 4 proof: one retexture before and after filmstrip. Capture 3 to 5
matched views of the source and the restyled asset through `npm run test` on
CI or a remote worker, alongside both geometry reports. Not run here.

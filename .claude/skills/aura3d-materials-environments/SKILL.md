---
name: aura3d-materials-environments
description: Chooses and verifies surface looks and lighting environments: built-in `material.*`, `environments.*`, `sky.dayNight`, `weather`, and `water` first, then licensed local textures or HDRIs admitted with `assets add --type texture`, with seam, PBR-channel, and visual-QA checks. Use when a route needs a material, texture set, PBR maps, HDRI or IBL, skybox, night or daytime sky, rain, snow, water, KTX2 textures, or `@aura3d/materials` / `@aura3d/environments` validation.
---

# Aura3D materials and environments

Order is fixed: built-ins, then a licensed local file, then a generated plate
as a candidate. There is no catalog search for textures or HDRIs today (the
asset index has no texture or HDRI adapter), so `assets search` will not find
them. Shared rules (claim labels, typed assets, catalog-first for models,
benchmark mode) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and read the `assets add` line and its
   `--type texture|environment` option.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Map slots take typed
   `assets.<key>` refs only, never a URL string.
3. Check the installed `@aura3d/engine`, `@aura3d/materials`, and
   `@aura3d/environments` versions. The validators below come from the
   `/node` subpaths (`@aura3d/materials/node`, `@aura3d/environments/node`)
   and run in Node scripts, not in browser routes.
4. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

Step 1, built-ins (always try first):

1. Materials: `material.pbr(...)`, `material.physical(...)`, `material.metal`,
   `material.glass`, `material.rubber`, `material.fabric`,
   `material.brushedMetal`, `material.ceramic`, `material.matteClay`,
   `material.clearcoatPaint`, and `material.emissive`, plus
   `material.proceduralTextures` (fabric, rubber, brushedMetal, plastic) for
   maps without files. `material.presets()` lists the named specs.
2. Environments: `environments.studio`, `environments.materialLab`,
   `environments.productHero`, `environments.nightCinematic`,
   `environments.metalStudio`, `environments.glassStudio`, or
   `environments.forMaterial("metal" | "glass" | "product" | "studio")`.
3. Outdoor: `sky.dayNight({ hour })` returns `nodes`, `background`, and
   `dayFactor`; `weather.precipitation({ type: "rain" | "snow" })` and
   `weather.wetGround(...)`; `water.surface({ preset: "calm" | "moderate" |
   "rough" | "storm" })`. Add their `nodes` with `scene().addMany(...)` and use
   the returned `background`.
4. Library references for choosing values: `GAME_READY_MATERIAL_PRESETS` (car
   paint, thin glass, brushed metal, skin approximation, and more),
   `listThreeCompatPbrMaterials()`, and `THREE_COMPAT_TEXTURE_SETS`. Check a
   preset in Node with `validateGameReadyMaterialPreset(preset)` or the whole
   library with `validateGameReadyMaterialLibrary()`.

Step 2, a licensed local file (Poly Haven or another CC0 / CC-BY source you
downloaded yourself):

5. Admit each map and each HDRI as a texture:

   ```sh
   npx @aura3d/cli@latest assets add ./textures/oak_diff_2k.jpg --name oakBase --type texture --license CC0-1.0 --source-page <page> --author "<author>"
   npx @aura3d/cli@latest assets add ./hdri/night_1k.hdr --name nightSky --type texture --license CC0-1.0 --source-page <page> --author "<author>"
   npx @aura3d/cli@latest assets typegen
   ```

   Use `--type texture` for HDRIs too: `environments.hdri({ texture })` only
   accepts a texture-typed ref, and an `--type environment` ref fails to
   type-check there. Use Radiance `.hdr`, not `.exr`, for IBL.
6. Wire maps into one material: `texture` (base color), `normal`,
   `roughnessMap`, `metalnessMap`, `occlusionMap`, `emissiveMap`, with
   `texTransforms` for tiling. Wire the sky with
   `environments.hdri({ texture: assets.nightSky, intensity, rotation })` and an
   optional sharper `reflectionTexture`.
7. Reject a PBR set that is missing roughness or metalness data where the
   role expects PBR (metal, painted, or product surfaces). Do not invent the
   missing map with a flat color and call it PBR.

Step 3, a generated plate (optional, from an image skill outside Aura3D): keep
it under `artifacts/`, admit it with `--quality candidate`, and label the
route `prototype` until the checks below pass.

Checks (all steps):

8. HDRI file: in Node, `inspectProductionHDR(path, [width, height])` must
   report a Radiance header and a 2:1 `declaredResolution`. For a manifest
   preset, `verifyThreeCompatHdriFile(preset)` checks the file hash and
   `createThreeCompatEnvironmentDiagnostics(preset)` reports memory and PMREM
   warnings.
9. Equirect seam: capture the sky at a yaw that puts the left and right edge
   in frame and confirm no visible seam. `environments.hdri` renders a
   procedural studio fallback first and swaps in the HDRI after load, so
   judge only frames where diagnostics report `iblPixelBacked` true.
10. Tiling: capture a surface at a texture scale that repeats the map at least
    3 times and confirm no visible seam or mirrored repeat.
11. Run `material.visualQA(nodes)` on material showcase scenes; it reports
    `passes`, `score`, and per-class checks.
12. KTX2: `.ktx2` files are accepted by `assets add --type texture`, and
    renderer coverage exists only for selected tested cases. Keep a
    PNG/JPG fallback, and make no compression or memory claim without a
    route-level capture.
13. Screenshots (normal mode only) run through `npm run test` on CI or a remote
    worker. Hand the claim label to `aura3d-evidence-review`.

## Stop and report

- No built-in matches and no licensed file is available: stop, label the look
  `prototype`, and say a texture or HDRI source is needed. Do not fetch a URL
  you have not verified, and do not claim a catalog texture exists.
- License or source page is unknown: do not admit the file.
- The HDRI is not 2:1, has a seam, or never reaches `iblPixelBacked`: report
  it and keep the built-in environment.
- A PBR role is missing roughness or metalness: reject the set.
- Any check above was not run: the route is `prototype`, not release.

## References

- [Environment lighting](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/environment-lighting.md)
- [HDR, IBL, tone mapping, and color](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/lighting-environment-color.md)
- [Texture compression (KTX2/Basis)](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/texture-compression.md)
- [Material validation source](https://github.com/auraoneai/aura3d/blob/main/packages/materials/src/MaterialValidation.ts)
- [HDRI environment source](https://github.com/auraoneai/aura3d/blob/main/packages/environments/src/HDRIEnvironment.ts)
- [Sky, weather, and water browser harness](https://github.com/auraoneai/aura3d/blob/main/tests/browser/d3-atmosphere-water-harness.ts)

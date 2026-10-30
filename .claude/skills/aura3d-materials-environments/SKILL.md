---
name: aura3d-materials-environments
description: Chooses and verifies surface looks and lighting environments: built-in `material.*`, `environments.*`, `sky.dayNight`, `weather`, and `water` first, then licensed local textures or HDRIs admitted with `assets add --type texture`, with seam, PBR-channel, and visual-QA checks. Use when a route needs a material, texture set, PBR maps, HDRI or IBL, skybox, night or daytime sky, rain, snow, water, or KTX2 textures.
---

# Aura3D materials and environments

Order is fixed: looks/biomes/env presets first, then built-ins, then a
licensed local file, then a generated plate as a candidate. There is no
catalog search for textures or HDRIs today (the asset index has no texture or
HDRI adapter), so `assets search` will not find them. Shared rules (claim
labels, typed assets, catalog-first for models, benchmark mode) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Look target

Most scenes need no per-file HDRI at all: `looks.preset(<genre>)` already supplies environment light, sky/background, fog and grade — pick it from the
recipe row in `../aura3d-art-direction/references/look-recipes.md` and only descend into manual environments when the look cannot express the mood.
From 4.7.0 a look takes overrides (a catalogued `hdri` id, environment intensity and rotation, key, rim, fog, grade, post) and the app changes light,
environment, fog and post at runtime: [look overrides, HDRI ids and runtime setters](references/look-overrides-4.7.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and read the `assets add` line and its
   `--type texture|environment` option.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Map slots take typed
   `assets.<key>` refs only, never a URL string.
3. Check the installed `@aura3d/engine` version. `@aura3d/materials` and
   `@aura3d/environments` were retired in 4.0.0: everything here ships from
   `@aura3d/engine` (`material`, `environments`, `sky`, `weather`, `water`,
   `looks`). The Node-side material and HDRI validators (names such as
   `validateGameReadyMaterialPreset`, `inspectProductionHDR`) live in
   `packages/engine/src/devtools/` and are not exported from the root or the
   `@aura3d/engine/devtools` subpath, so do not import them from a project;
   use the capture checks below.
4. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

Step 1, presets (always try first):

0. Looks and biomes: `looks.preset("outdoor-day" | "night-city" | "product-studio" ...)`
   and `world.biome(<id>)` supply IBL + background + fog + key as one unit;
   `environments.<named>`/`environments.hdri` cover the remaining cases before
   any file admission.
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
4. Choosing values: start from `material.presets()` and the named builders
   above (car paint is `material.clearcoatPaint`, thin glass is
   `material.glass`, brushed metal is `material.brushedMetal`); the in-repo
   preset library (`GAME_READY_MATERIAL_PRESETS` in
   `packages/engine/src/devtools/materials/MaterialValidation.ts`) is a source
   reference for values, not an import.

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

8. HDRI file: it must be a Radiance `.hdr` with a 2:1 aspect ratio (check with
   `file` or an image viewer before `assets add`); `assets add` records the
   hash, and `assets validate` fails on a missing or changed file. Watch the
   console for memory and PMREM warnings on the first load.
9. Equirect seam: capture the sky at a yaw that puts the left and right edge
   in frame and confirm no visible seam. `environments.hdri` renders a
   procedural studio fallback first and swaps in the HDRI after load, so
   judge only frames where diagnostics report `iblPixelBacked` true.
10. Tiling: capture a surface at a texture scale that repeats the map at least
    3 times and confirm no visible seam or mirrored repeat.
11. On material showcase scenes, `structuralQA.material(nodes)` reports
    `ok` plus per-class structural-name checks (nodes named like
    chrome/glass/rubber actually present). These are diagnostics only —
    acceptance comes from the captured frames.
12. KTX2: `.ktx2` files are accepted by `assets add --type texture`, and
    renderer coverage exists only for selected tested cases. Keep a
    PNG/JPG fallback, and make no compression or memory claim without a
    route-level capture.
13. Screenshots (normal mode only) run through `npm run test` on a remote
    runner, never local Playwright or GitHub Actions (`RUN_ID=mat-1
    SPECS="tests/browser/<route>.spec.ts" tools/remote-acr/run.sh` in the
    Aura3D repository). Hand the claim label to `aura3d-evidence-review`.

14. Custom shaders (`material.custom`): write linear light, use
    `#include <colorspace_decode>` with `toneMapping: "none"` for authored hex
    colours, take hash/noise/sky/fog from the `a3d_*` chunks, and keep every
    `pow`, `normalize`, `sqrt` and divide NaN-safe —
    [custom shader chunks](references/custom-shader-chunks.md).

## Look-dev loop

Capture (remote runner, see `aura3d-art-direction`) → judge against the
quality-bar rubric → `aura3d look lint`. Judge only frames where the HDRI actually loaded (`iblPixelBacked`
true); a seam visible in one capture re-checks at a different yaw. One change
per round.

## Stop and report

- No built-in matches and no licensed file is available: stop, label the look
  `prototype`, and say a texture or HDRI source is needed. Do not fetch a URL
  you have not verified, and do not claim a catalog texture exists.
- License or source page is unknown: do not admit the file.
- The HDRI is not 2:1, has a seam, or never reaches `iblPixelBacked`: report
  it and keep the built-in environment.
- A PBR role is missing roughness or metalness: reject the set.
- A custom-shader colour looks grey or the frame goes black on a real GPU: fix the colour contract or the NaN source; do not pin post off.
- Any check above was not run: the route is `prototype`, not release.

## References

- [Custom shader chunks (4.1)](references/custom-shader-chunks.md)
- [Environment lighting](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/environment-lighting.md)
- [HDR, IBL, tone mapping, and color](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/lighting-environment-color.md)
- [Texture compression (KTX2/Basis)](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/texture-compression.md)
- [Material validation source](https://github.com/auraoneai/aura3d/blob/main/packages/engine/src/devtools/materials/MaterialValidation.ts)
- [HDRI environment source](https://github.com/auraoneai/aura3d/blob/main/packages/engine/src/devtools/environments/HDRIEnvironment.ts)
- [Sky, weather, and water browser harness](https://github.com/auraoneai/aura3d/blob/main/tests/browser/d3-atmosphere-water-harness.ts)

# Worked example: aura3d-materials-environments

Skill: `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` (PRD P2).
Run on 2026-09-25 in the Aura3D monorepo. Lightweight commands and tsx
one-liners only; temporary projects were created under the OS temp directory.

## Goal

Verify the built-in validators, the HDRI checks, and the admission path the
skill prescribes, including which `--type` a sky HDRI needs.

## Commands run and trimmed output

1. Material library validation (`@aura3d/materials/node` source):

   ```ts
   validateGameReadyMaterialLibrary();
   validateGameReadyMaterialPreset(findGameReadyMaterial("carPaint")!);
   ```

   ```text
   presetCount: 6, passingCount: 6, failingIds: []
   { id: "carPaint", kind: "carPaint", ok: true, issues: [] }
   THREE_COMPAT_TEXTURE_SETS: 25, listThreeCompatPbrMaterials(): 50
   ```

2. HDRI checks (`@aura3d/environments/node` source) on the repo fixture:

   ```ts
   inspectProductionHDR("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", [1024, 512]);
   listThreeCompatEnvironmentPresets().slice(0, 3).map(verifyThreeCompatHdriFile);
   ```

   ```text
   { hasRadianceHeader: true, hasFormatHeader: true, declaredResolution: [1024, 512], dataBytes: 1508872 }
   studio-small-08:true autumn-field-puresky:true kloppenheim-puresky:true
   createThreeCompatEnvironmentDiagnostics(studio-small-08): memoryBytes 4194296, pmrem faceSize 256, mipCount 9, warnings []
   ```

3. Admission of the same HDRI with both types in a scratch project:

   ```sh
   aura3d assets add ./hdri/studio_small_08_1k.hdr --name studio_texture --type texture --license CC0-1.0 --source-page <poly haven page> --author "<author>"
   aura3d assets add ./hdri/studio_small_08_1k.hdr --name studio_environment --type environment --license CC0-1.0 --source-page <poly haven page> --author "<author>"
   aura3d assets typegen
   ```

   Generated `src/aura-assets.ts` types the two entries as
   `type: "texture"; format: "hdr"` and `type: "environment"; format: "hdr"`.

4. Type-check of both refs against `environments.hdri` (tsc against engine
   source):

   ```ts
   environments.hdri({ texture: assets.studio_texture });      // compiles
   environments.hdri({ texture: assets.studio_environment });  // error
   ```

   ```text
   probe.ts(4,40): error TS2322: Type '... readonly type: "environment" ...' is not assignable to
   type '... readonly type: "texture" ...'.
   ```

   This is why the skill says to admit HDRIs with `--type texture`, which
   differs from the PRD appendix example (`--type environment`). The repo's
   own IBL harness (`tests/browser/root-ibl-b3-harness.ts`) also declares its
   HDRIs as `type: "texture"`.

## Facts verified in source

- `material.*` members, `environments.*` members including `hdri` and
  `forMaterial`, `sky.dayNight`, `weather.precipitation`, `weather.wetGround`,
  and `water.surface` (presets calm, moderate, rough, storm) exist in
  `packages/engine/src/agent-api/index.ts`.
- `validateGameReadyMaterialPreset`, `verifyThreeCompatHdriFile`, and
  `inspectProductionHDR` are exported only from the `/node` subpaths. The
  package roots re-export browser-safe surfaces. The PRD names
  `TextureSet`, `PBRMaterialLibrary`, `GameReadyMaterialLibrary`,
  `EnvironmentRegistry`, and `HDRIEnvironment` are module files, not exports,
  so the skill cites the real exports instead.
- `@aura3d/asset-index` has no texture or HDRI adapter.
- KTX2 is an accepted texture format for `assets add`; the texture-compression
  doc claims only selected tested cases.

## Evidence still owed (remote)

PRD Phase 4 proof: `cinematic-scene` with a night environment. Capture a sky
frame showing the equirect left and right seam, a tiling surface frame,
`material.visualQA` output, and diagnostics showing `iblPixelBacked: true`,
through `npm run test` on CI or a remote worker. Not run here.

# Worked example: aura3d-threejs-migration

Skill: `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md` (PRD D4).
Run on 2026-09-25 in the Aura3D monorepo against the
`three-compat-custom-threejs-migration` template. Lightweight commands only.

## Goal

Check that the skill's three tools (codemod, compatibility matrix, ledger)
behave as described, and that the proving template is engine-only.

## Commands run and trimmed output

1. The codemod on a starter with a postprocess import (tsx one-liner importing
   `packages/three-compat/src/index.ts`):

   ```ts
   migrateThreeToA3D('import * as T from "three";\n' +
     'import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";\n' +
     'import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";\n');
   ```

   ```text
   rewrittenImports: 2
   code: import * as T from "@aura3d/three-compat";
         import { OrbitControls } from "@aura3d/three-compat/controls";
         import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
   warnings: controls-adapter: OrbitControls import is mapped to A3D controls.
             postprocessing-unsupported: ... left unchanged ... Use @aura3d/engine effects.bloom() ...
   ```

2. Compatibility matrix for a few exports:

   ```ts
   buildInitialCompatibilityMatrix(buildThreeApiInventory("0.185.0",
     ["Mesh", "MeshStandardMaterial", "MeshPhongMaterial", "PerspectiveCamera",
      "OrbitControls", "EffectComposer", "WebGLRenderer", "ShaderMaterial"]));
   ```

   ```text
   WebGLRenderer [renderers] blocked -> none
   EffectComposer [postprocessing] partial -> @aura3d/three-compat:EffectComposer
   MeshPhongMaterial [materials] partial -> @aura3d/three-compat:MeshPhongMaterial
   ```

   The matrix marks `EffectComposer` partial while the import map declares it
   unsupported. That disagreement is why the skill says to trust the
   stricter source and treat the matrix as triage.

3. Ledger lookups: `listApproximationShims().length` is 80, and
   `getApproximationLedgerRow("MeshPhongMaterialCompat")` returns
   `fidelity: "approximation"` with the GGX-instead-of-Blinn-Phong delta
   the skill quotes.

4. The template is engine-only and has no assets:

   ```sh
   cd packages/create-aura3d/templates/three-compat-custom-threejs-migration
   node ../../../aura3d-cli/dist/cli.js assets validate --source
   ```

   ```text
   "ok": true, "files": ["src/main.ts"], "typedAssetUsages": [], "failures": []
   ```

   `src/main.ts` imports only `@aura3d/engine` (`camera`, `createAuraApp`,
   `lights`, `material`, `primitives`, `scene`); none of the eight
   `three-compat-*` templates depend on `three` or `@aura3d/three-compat`.

## Not run locally

`npm run build`, `npm run test`, and `aura3d check-deploy --dist dist --source`
for the template (no `dist/` exists). `pnpm three-compat:migration` includes
a Playwright spec, so it belongs on CI.

## Evidence still owed (remote)

Template build, route-health and screenshot specs, `check-deploy` output,
and the `three-compat:migration` report under `tests/reports/`. PRD Phase 3
names this template as D4's proof.

# PRD-04 Phase 6 evidence — WGSL twins, extension matrix, E34 deletions

Branch: `qr/prd04-materials-p6-wgsl` (stacked on `qr/prd04-materials-p5-pipeline`).

## P6-1 — `shaders/physical-wgsl/*.wgsl.ts` twins

- 15 new twins, one per `a3d_prd04_*` chunk, attached via `ShaderChunk.wgsl`
  (the PRD-11 contract field: absence ⇒ `WGSL_PROGRAM_MISSING` on the WebGPU
  backend). `physical-wgsl/index.ts` exports `PRD04_WGSL_TWINS` + each twin.
- Translation rules applied: `ptr<function>` for `inout`/`out` params; no
  overloading → `pow2v` for the `vec3` arm; `texture_2d`/`sampler` split
  bindings (`@group(1)`); `textureSampleLevel` for LOD-dependent fetches;
  `dpdx`/`dpdy`; `select()` ternaries; `x >= 3.4028235e38` for the GLSL
  infinity test; `var_` for the reserved `var`; explicit `f32()`/`u32()`
  conversions; `inverseSqrt`. `#ifdef`/`#if defined` arms (`A3D_TRANSMISSION`,
  `A3D_TRANSMISSION_BICUBIC`, `A3D_TANGENT_DERIVATIVE`,
  `A3D_PRD04_DEBUG_VIEW_*`, `A3D_STAGE_VERTEX`) are emitted unconditionally —
  the C-29 program-generator is expected to keep only the selected arm; the
  bicubic variant is a separate `a3dTransmissionSampleBicubic` and debug-view
  selection is a `u32` channel switch so zero stage logic is lost.
- `brdf` has no WGSL twin (PRD-11 scope) → `tests/qr/prd04/shims/brdf_r185.wgsl.ts`
  supplies `pow2`/`pow2v`/`F_Schlick`/`Schlick_to_F0`/`V_GGX_SmithCorrelated`/
  `D_GGX`/`a3dDFG`/`PI`/`RECIPROCAL_PI`/`EPSILON`/`max3` for tests.
- Validation (PRD §8.12 fallback — `tools/wgsl-validate` does not exist yet;
  qr-request to:prd11):
  - Local: every twin + its transitive `requires` closure + brdf shim parses
    under `wgsl_reflect@1.6.0` (15/15 OK).
  - Unit structural gate (`wgsl-twins.test.ts`): non-empty `wgsl` attached and
    identical to `PRD04_WGSL_TWINS[name]`; twin `fn` names cover the GLSL
    `a3d*` function set; banned GLSL-isms absent (`vecN(`, `matN(`,
    `textureLod`, `dFdx`/`dFdy`, `inout`, `highp`, `sampler2D`, `#ifdef`,
    `isinf`); required structs present. 4/4 green; lane suite 23 files / 140
    tests green.
  - CI: `tests/qr/prd04/browser/wgsl-twins.spec.ts` concatenates the same
    closure + `@fragment` probe entry (puts `dpdx`/`discard`/`fwidth` in stage
    context) and asserts `getCompilationInfo()` has zero errors on the
    macos-14 Chromium adapter; records `status: "skipped"` + `skipReason` when
    `navigator.gpu` is absent. Report → `tests/reports/prd04-wgsl-twins.json`
    (workflow artifact).
  - "Numeric half of U-BSDF-PARITY on WebGPU recorded as integrated": depends
    on PRD-11's WebGPU backend + U-acceptance runner, both absent → deferred
    to Phase 7 integrated acceptance (honest NOT RUN).

## P6-2 — `tools/generate-extension-matrix.mjs`

- Reads `tests/reports/material-conformance.json` (exit 1 when missing);
  writes `GLTF_EXTENSION_SUPPORT_MATRIX` (packages/assets/src/
  GLTFExtensionSupport.ts, lane-04) and `PHYSICAL_EXTENSION_MATRIX`
  (packages/engine/src/material-physical/PhysicalMaterialSpec.ts, owner-15 —
  the PRD assigns write responsibility to this tool; this PR's run produced 0
  changes there since no probe is G-PANEL-integrated yet).
- Verdict rule per §14 P6-2: conformant only when `passed === true`,
  `qrFlags === "integrated"` and a `gpanelJudgementId` exists; otherwise
  `approximate` → `parsed-with-limits` / `bounded`. `unsupported` /
  `diagnostic-only` and non-`material` families are never rewritten.
- `prd04-chunk-conformance.spec.ts` now emits the `extensions` section
  (extension → probe chunk names, passed, `qrFlags` from `PRD04_FLAGS`,
  `gpanelJudgementId` from `tests/reports/prd04/gpanel/latest.json` — null
  until the integrated-acceptance rounds exist).
- Applied to the committed files this run: `KHR_materials_unlit`,
  `KHR_materials_emissive_strength`, `KHR_materials_ior` flip
  `runtime-supported` → `parsed-with-limits` — the truthful status until an
  integrated G-PANEL judgement exists. `PHYSICAL_EXTENSION_MATRIX` stays all
  `bounded`.
- Workflow: `node tools/generate-extension-matrix.mjs --check` runs after the
  playwright step; `--check` exits 1 on any matrix drift.

## P6-3 — E34 deletions

- `rg` criterion: `adaptGLTFMaterial`, `GLTFMaterialLike`,
  `compilePBRMaterial`, `CompiledMaterialProgram`, `adaptGLTFPBRMaterial`
  → zero imports outside `production-runtime/materials/` itself.
- `GLTFMaterialAdapter.ts`, `MaterialCompiler.ts`, `PBRShaderFeatures.ts`
  (+ `GLTFPBRMaterialAdapter.ts`, a facade over the stub) are now thin
  re-exports of the real `materials/` path because owner-01's
  `production-runtime/index.ts` barrel still re-exports each module and
  owner-15's `tools/production-runtime-literal-completion` manifest lists the
  paths in `requiredPackageFiles`. Barrel/manifest removal → qr-request
  Q-15-4 (to:prd15).
- `PBRShaderFeatures.ts`: `PRODUCTION_PBR_SHADER_FEATURES` preserved; lobe
  bits are now derived from `registerPrd04MaterialLobes()` +
  `materialLobes(MATERIALS_ON_FLAGS)` instead of hard-coded lobe entries, so
  the exported set stays identical under the flag.

## Verification

- `pnpm exec vitest run -c tests/qr/prd04/vitest.config.ts` — 23 files / 140
  tests green.
- `pnpm typecheck:raw` — clean.
- `pnpm exec eslint` on all touched files — clean (workflow + html ignored by
  config, as before).
- `node tools/qr-ownership/check.mjs` — lane-04-owned files resolve 04;
  `shaders/physical*/`→01 and `tests/qr/`/`tools/`→15 are the known check.mjs
  pattern gaps (qr-request to:prd15), not new violations.
- Flag-off identity: twins are dead strings on `ShaderChunk.wgsl` (no consumer
  until PRD-11's WebGPU backend reads the field); matrix statuses are data;
  E34 re-exports expose the same surface the barrel had.

## NOT RUN

- `getCompilationInfo` on a real adapter — macos-14 CI only (no local
  Playwright per lane rule).
- U-BSDF-PARITY numeric half on WebGPU — needs PRD-11 backend (Phase 7).
- G-PANEL integrated judgements — Phase 7; matrix therefore stays at the
  `approximate` tier.

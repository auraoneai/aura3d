# PRD-04 Phase 3 evidence — PhysicalMaterial, programFeatures, lobes, ShaderFeatures

Phase 3 (P3-1..P3-5): `PhysicalMaterial` descriptor + `programFeatures()` on
all five shipped material classes, the C-03 lobe registry made real
(`materials/lobes.ts`), and the three PRD-04 ShaderFeatures
(`materials/features.ts`), plus the P3-5 source guard.

## Verification (all run locally, this session)

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/rendering/tsconfig.json` | clean |
| `pnpm typecheck:raw` (repo-wide `tsconfig.build.json`) | clean |
| `vitest --config tests/qr/prd04/vitest.config.ts` | 17 files / 114 tests, all pass |
| `vitest run tests/unit/contracts/impl/` | 2 files / 14 tests, all pass |
| `eslint` on all touched/new files | clean |
| `node tools/qr-ownership/check.mjs <paths>` | every touched source path resolves to owner `04` |

## PRD §14 coverage

- **P3-1** `materials/PhysicalMaterial.ts` + `materials/PhysicalFeatures.ts`:
  `PhysicalMaterialDescriptor` (§7.3 verbatim fields), `physicalFeatureSet()`
  producing maps/`alphaMode`/`doubleSided`/`vertexColors`/`lighting`/
  `extensions` from `materialLobes(ctx.flags)`; `legacyPhysicalDescriptor()`
  projects the five legacy option bags (incl. `color`→baseColor alias,
  TextureBinding/Texture union, `<slot>TextureTransform` and the
  SkinnedLit `<slot>Texture{Offset,Scale,Rotation}` split form,
  `textureTexCoords`, renderState→alphaMode/doubleSided). All five classes
  gained `programFeatures(ctx)`: `PBRMaterial`, `TexturedPBRMaterial`,
  `InstancedPBRMaterial` (`instancing:{color:false}`),
  `SkinnedLitMaterial` (`skinning:{influences:4|8, palette}`),
  `NormalMappedPBRMaterial` (`instancing`). Test:
  `tests/unit/contracts/impl/prd04-lobes.test.ts` — key stable for equal
  descriptors; distinct for each of the 11 lobe toggles; flags-off yields
  zero extensions; no light/shadow/env fields (§8.10).
- **P3-2** `materials/lobes.ts`: 11 `registerMaterialLobe` entries — ior,
  specular, clearcoat, sheen, iridescence, anisotropy, transmission,
  volume, dispersion, emissive-strength, unlit — each with `glTFExtension`,
  `samplerSlots`, glTF-fragment chunks, and `bind()` writing the same
  `u_*` names GLTFRenderResources uses. Low-tier `iridescence` gets
  `bits.film:false` (Schlick) via `physicalFeatureSet` tier stamp; the lobe
  itself is ctx-free by contract. Registration idempotent and invoked from
  `lanes/prd04.ts` (the C-03 `provide()` seam).
- **P3-3** `materials/features.ts`: `uvTransformMatrix(offset, rotation,
  scale)` = glTF `T·R·S` column-major; `prd04.uvTransform` (fragment:pars,
  bitmask `A3D_PRD04_UV_TRANSFORM_MASK`, binds `u_<slot>UvTransform` mat3);
  `prd04.tangentFrame` (vertex:world + fragment:normal, selects on
  normal/anisotropy/clearcoat-normal texture params or explicit
  `u_prd04TangentFrame`); `prd04.debugView` (fragment:end,
  `A3D_PRD04_DEBUG_VIEW_<NAME>` / `<NAME>EFFECTIVE`, numeric channel id on
  `u_prd04DebugView` — UniformValue has no string type).
  `tests/qr/prd04/unit/uv-transform-matrix.test.ts`: 20 random
  uniform-scale inputs equal three `Matrix3.setUvTransform` within 1e-6;
  non-uniform + rotation equals the KHR formula and diverges from three
  (asserted).
- **P3-4** `tests/qr/prd04/browser/lobe-numeric.{html,ts}` +
  `physical-lobes-numeric.spec.ts`: per golden case, a fragment program
  calling the `a3d_prd04_*` function over the axis grid → RGBA32F
  renderbuffer → readback; per-sample bound abs≤1e-3 ‖ rel≤1e-3 (2e-3 abs
  floor for the four DFG-LUT cases — same hardware half-float filtering
  floor documented in the CPU oracle test). Report:
  `tests/reports/physical-lobes-numeric.json`. **Runs on macos-14 CI only —
  not run locally.**
- **P3-5** `tests/qr/prd04/unit/no-asset-specific-shader-constants.test.ts`
  scans `shaders/physical`, `shaders/physical-wgsl` (absent → skipped),
  `materials/**` for the PRD's forbidden tokens; standalone `0.012` scalar
  matched by lookaround so vector elements (`[0.01, 0.012, 0.014, 1]`)
  don't false-positive.

## Flag-off identity

`programFeatures()` is a new pure method — the legacy render path never
calls it (no caller exists until C-02 is real). `materials/lobes.ts` and
`materials/features.ts` register registry state only; `materialLobes(flags)`
filters on `A3D_QR_MATERIALS` so flag-off returns `[]` and `extensions`
is empty by construction.

## Honest gaps

- Lobe/ShaderFeature registration has **no render effect** until the C-02
  program generator consumes them (PRD-01/15 territory per CONTRACTS).
- `prd04.tangentFrame`/`prd04.debugView`/`prd04.uvTransform` `select()`
  read material params (`u_*TextureEnabled`, `u_prd04DebugView`,
  `u_<slot>UvTransform`) that nothing sets yet — population arrives with
  the generated-program path.
- `debugView` uses a numeric channel table (ids 1–15, +100 = `Effective`)
  because `UniformValue` carries no string/boolean; the PRD's named
  channels map 1:1 via `PRD04_DEBUG_VIEW_CHANNELS`.
- The numeric harness re-implements the golden generator's arg decode in
  GLSL (`AX*` arrays + stride decode) — same math, evaluated in fp32 on
  the real GPU rather than fp64 CPU.

## qr-requests (unchanged, accumulate)

- `check.mjs` lane regex has no `tests/qr/` pattern → lane tests resolve
  owner 15 (to:prd15).
- `setTypedGLBActorQrFlags` has no production caller (to:prd15),
  `model()` drops `materialOverrides`/`variant` (to:prd15),
  `DIAGNOSTIC_ONLY_FIELDS` still lists `model.materialOverrides`/
  `model.variant` (to:prd15 merge removal), tier/device→
  `textureBudget`/`maxTextureSize` plumbing (to:prd15), `.gitignore`
  `fixtures/` rule hides `tests/qr/prd04/fixtures/` (worked around with
  `git add -f`), Q-12-1, `.gitattributes` LFS glob.

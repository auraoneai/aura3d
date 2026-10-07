# PRD-04 phase-1 evidence — flag-`none` baselines (PR A)

Phase-1 exit per PRD-04 §13: lobe chunks registered + compiling in
ChunkHarness, r185 CPU oracle goldens green, ten `prd04-*` lane scenes +
legacy negative controls capturable on both engines at flag `none`,
`pin-emissive-defaults` / `prd04-model-tint-report` codemods registered under
C-39 with `tint-migration.md` census.

## Local verification (this branch, flag `none` — no `A3D_QR_*` set)

| Check | Command | Result |
|---|---|---|
| Repo typecheck | `pnpm typecheck:raw` | clean |
| Bench typecheck | `pnpm exec tsc --noEmit -p benchmarks/quality-rebuild/tsconfig.json` | clean |
| Lane unit | `pnpm exec vitest run -c tests/qr/prd04/vitest.config.ts` | 38/38 (chunk registry, r185 oracle golden eq, scene registration, codemods) |
| Contract suites | `pnpm exec vitest run tests/unit/contracts` | 54/54 — C-03 lobe registry + C-39 codemod conformance on stubs |
| r185 CPU oracle | `tests/qr/prd04/oracles/generate-r185-golden.py` → `fixtures/bsdf/` | golden GGX D/F/V + sheen Charlie D values reproduced from r185 source; `r185-oracle.test.ts` compares chunk GLSL evaluated via llvmpipe `glsl_eval.py` against goldens — 21/21 |
| Lint | `pnpm exec eslint` on all touched paths | clean |
| Ownership | `node tools/qr-ownership/check.mjs` | see Known gaps — JSON resolves `shaders/physical/*`→01 and `tests/qr/prd04/*`→15; CONTRACTS §4.1 assigns both to prd04 (Q-04-x request filed in session report) |

## Flag-off identity

All `a3d_prd04_*` chunks register into the C-02 chunk registry at import via
`lanes/prd04.ts` → registry state only; nothing selects them into a program
until `A3D_QR_MATERIALS` routes draws (C-01 flag lifecycle §5.3 = `dev`).
No consumer-visible output changes flag-off: no new runtime code executes.

## Scene captures

`tests/qr/prd04/browser/prd04-scene-capture.spec.ts` drives
`tests/qr/prd04/harness/prd04-capture.html?engine=<aura3d|three>&scene=<id>&flags=<list>`
through `startExampleDevServer()` — PNGs land at
`tests/reports/prd04/captures/<flags>/<scene>/<engine>.png` plus
`report.json`. The `capture` job in `qr-prd04-materials.yml` runs the ten
lane scenes **and** the seven legacy negative controls
(02-pbr-product, 03-damaged-helmet, 04-clearcoat, 05-transmission,
06-metal-roughness-sweep, 07-sheen-fabric, 08-skinned-character) via each
engine's top-level adapter module.

CI captures are **NOT RUN** locally — local Chromium/Playwright captures are
disallowed (CI-ROUTING); they populate `tests/reports/prd04/` artifacts on the
macos-14 run whose run id is recorded in the session report.

## Fixture corpus (P1-9)

`fixtures/asset-corpus/` gained ten Khronos conformance GLBs (licenses in
`KHRONOS-LICENSES.md` + per-asset `provenance` in
`benchmarks/quality-rebuild/scenes/prd04/assets.ts`), the two KTX2 encodings of
DamagedHelmet (`uastc`/`etc1s`, gltf-transform 4.5.1 + toktx 4.4.0 — commands
recorded in `assets.ts`), and `textures/metal-plates-013-1k/` (Poly Haven CC0,
4 maps). `.glb` files travel via LFS (`.gitattributes:24`); the PNGs are not
LFS-matched by any existing pattern — flagged as a qr-request for owner 12.

## Codemod census (P1-11/P1-12)

`evidence/prd-04/tint-migration.md` — 23 `model(…, { material })` tint sites
over `apps/` (followed-identifier resolution included), and 297
`pin-emissive-defaults` candidates (223 exact `material.emissive/neon` calls,
74 `{emissive: …}` literals) across `apps/`+`packages/`. Report rows only —
no route code rewritten (PRD 14 applies per route at flag-opt-in).

## Chunk inventory (P1-1/P1-2)

15 `a3d_prd04_*` GLSL chunks in `packages/rendering/src/shaders/physical/`:
`bsdf_lobes_common`, `clearcoat`, `sheen`, `iridescence`, `specular_ior`,
`transmission`, `volume`, `dispersion`, `anisotropy`, `tangent_frame`,
`emissive_strength`, `uv_transform`, `alpha_a2c`, `unlit`, `debug_view` —
each `registerShaderChunk`-declared `ShaderChunk{name, owner:"prd04", glsl,
stage, requires}` per C-02, compiled vertex+fragment on WebGL2 by
`chunk-harness.ts` (browser conformance spec asserts all 15 link; the r185
`brdf` chunk resolves to `shims/brdf_r185.glsl.ts` — lane-internal shim while
`a3d_prd01_brdf` is lane 01's pending real chunk).

## Known gaps / NOT RUN

- macos-14 ChunkHarness + captures: CI-only (this branch's `qr-prd04-materials.yml`
  first run id recorded in the session report).
- KTX2 decode is exercised end-to-end in the `prd04-ktx2` capture; the Aura3D
  adapter logs `ktx2:unsupported-until-C-16` (transcoder options are lane 05's).
- `prd04-tiled-ground` `textureAnisotropy: "tier"` resolves to API default 8 —
  flagged `partial` in the capture payload's `capabilityLog` (tier-aware
  anisotropy is C-15/T-04-x real-work, not phase-1).
- Material-variant + tint on Aura3D adapter are `partial`: `variant` and
  `materialOverrides.color` reach `model()` but E29/E30 mean the C-15 stub
  drops them today — logged `variant:`/`tint:` in `capabilityLog`.

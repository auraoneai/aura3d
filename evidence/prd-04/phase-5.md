# PRD-04 Phase 5 — Pipeline fidelity (P5-1..P5-5)

Scope: `imageColorSpaceIntent` + `colorspace-conflict` load issues + C-16 `colorSpace` decode injection (P5-1); `decoders` pre-scan/registry/`decoder-missing` wiring through `ProductionGLTFRenderPipeline` + `TypedGLBActor` (P5-2); variant rebind already landed in P2 — this phase adds the browser spec coverage (P5-3); MikkTSpace-first tangent generation + strict `tangent-derivative-fallback` (P5-4); `prd04.alphaToCoverage` feature + `renderState.alphaToCoverage` request (P5-5). Everything flag-gated: `decoders` is opt-in, `materialsR185` gates colour-space injection + MikkTSpace + the alphaToCoverage request.

## Verification table

| Item | How verified | Result |
|---|---|---|
| P5-1 `imageColorSpaceIntent` | `tests/qr/prd04/unit/gltf-image-colorspace-intent.test.ts` on DamagedHelmet: baseColor/emissive → srgb, normal/MR/occlusion → linear; synthetic dual-use image → `colorspace-conflict` + linear intent + `loadIssues` entry | PASS (3 tests) |
| P5-2 decoder pre-scan + require | `gltf-decoders-variants.test.ts`: `requiredGLTFDecoders` extension→id map; `scanGLTFExtensionsUsed` reads the GLB JSON chunk via fetch; `decoders:{draco:false}` on the draco GLB → `AssetDecoderUnavailable` naming `draco` + `decoder-missing` warning | PASS |
| P5-2 compressed fixtures | `tools/generate-prd04-compressed-fixtures.mjs` produced `damaged-helmet-draco.glb`/`damaged-helmet-meshopt.glb` (spec-compliant fallbacks retained, compressed blobs appended to BIN); loader round-trips them through `createDracoDecoder`/`createMeshoptDecoder` — meshopt is bit-identical, draco ≈ bounds-equal (draco dedups verts: 14413 vs 14556) | PASS |
| P5-2 browser spec | `tests/qr/prd04/browser/gltf-decoders-variants.spec.ts` + harness page render both compressed helmets via `loadProductionGLTFRenderPipeline({decoders})` → masked ΔE2000 mean ≤ 1.0 vs baseline | WRITTEN — macos-14 CI only |
| P5-3 variants | same harness: MaterialsVariantsShoe `materialVariants` → `setMaterialVariant` ×3 → pairwise mean-subject-colour ΔE2000 ≥ 10; `setMaterialVariant("__no-such-variant__")` → `"variant-unknown"` | WRITTEN — macos-14 CI only (rebind machinery itself covered since P2 by `typed-glb-actor-snapshot.test.ts`) |
| P5-4 MikkTSpace default | flag-on + `tangents !== "legacy"` + `mikkTSpaceAvailable()` → `generateMikkTSpaceTangents`; else legacy `generateMeshTangents`. `tangent-derivative-fallback` now fires ONLY when a tangent-needing material's format has no tangent attribute (normal-mapped mesh with textures on TEXCOORD_1 and no set-0 UVs); MikkTSpace→legacy failure falls back silently | PASS (unit test: flag-on+no-set-0-uvs fires; flag-off silent; flag-on+uvs silent) |
| P5-5 `prd04.alphaToCoverage` | `tests/qr/prd04/unit/alpha-to-coverage.test.ts`: selects iff `u_alphaCutoff > 0` && `renderState.alphaToCoverage === true` && `tier.msaaSamples > 0`; reads through `MaterialInstance.baseMaterial.renderState` | PASS (5 tests) |
| Lane unit suite | `pnpm exec vitest run --config tests/qr/prd04/vitest.config.ts` | 22 files / 136 tests, all green |
| Typecheck | `pnpm typecheck:raw` | clean |
| ESLint | eslint on every touched path | clean |
| Ownership | `node tools/qr-ownership/check.mjs <paths>` | lane files → 04; known 15-resolution gap on `tests/qr/**`, `tools/*.mjs` (qr-request outstanding) |
| Flag-off identity | `decodeOptionsForImage` returns `options` unchanged when `materialsR185` off; MikkTSpace gated on `materialsR185 && tangents !== "legacy"`; alphaToCoverage request gated on `materialsR185 && alphaMode === "MASK"`; `decoders`/`compressedTextureCapabilities`/`tangents` fields are opt-in | unchanged when flags off |

## Design deviations worth noting

- **`AssetDecoderUnavailable` + `createAssetDecoderRegistry` deep-imported from `packages/assets/src/contracts/decoders.ts`** — the assets barrel (`index.ts`) is owner-05 and doesn't re-export them; the import stays inside the package (no cross-package tsconfig alias needed since the pipeline file lives in `packages/assets` itself).
- **`set.imageDecoder` from the registry is a `{targetFormat}` hint, not a decoder function** — merged into `ktx2BasisTranscoderOptions.targetFormat` (explicit option wins), not into `imageDecoder`.
- **`scanGLTFExtensionsUsed` fetches the URL a second time** — a header-only read of the GLB JSON chunk so `extensionsUsed` is known before the parse cache runs; the full GLB is fetched again inside `acquireParsedGLTFAsset`.
- **`model()` → `createTypedGLBActor` still does not forward `decoders`/`tangents`/`variant`** — `renderer.ts` is owner-15; the browser spec exercises the pipeline/actor level directly, which is the same code `model()` will call once lane-15 wires the fields (qr-request to:prd15 — same seam family as `setTypedGLBActorQrFlags`).
- **Decoder files vendored at `fixtures/asset-corpus/decoders/`** — `three@0.185`'s own `draco_decoder.js`+`.wasm`, `basis_transcoder.js`+`.wasm`, and meshoptimizer's `meshopt_decoder.mjs` renamed to the registry's `.js` convention; the harness passes `basePath: "/fixtures/asset-corpus/decoders/"`. The registry default `/aura-decoders/` remains the production path.
- **Browser workflow grep widened** — the `browser` job previously ran only `--grep "PRD-04 lobe chunks"`, silently skipping `physical-lobes-numeric.spec.ts` (P3-4) and `transmission-capture.spec.ts` (P4-4); now greps all four PRD-04 browser describes and uploads their report JSONs.
- **Draco vertex count differs from baseline** (14413 vs 14556) — draco decode deduplicates/reorders; the test asserts bounds-parity + index presence instead of cardinality.

## qr-request additions this phase

- to:prd15 — `model()`/`AuraModelNode` never forwards `decoders`, `tangents`, `compressedTextureCapabilities`, or `variant` into `createTypedGLBActor` (`renderer.ts` builder call), and `AuraModelOptions` has no `variant`/`decoders` fields for `model()` to lower. P5-2's "via `model()`" browser flow is therefore exercised at the pipeline level instead.
- to:prd05 — `AssetDecoderUnavailable`/`createAssetDecoderRegistry` are only importable via `packages/assets/src/contracts/decoders.ts` deep import; the owner-05 barrel `index.ts` does not re-export them.
- to:prd01 — material `RenderState` type predates C-04's `alphaToCoverage`; P5-5 widens the local type (`Partial<RenderState> & { alphaToCoverage?: boolean }`) because `validateRenderState` preserves unknown keys at runtime.

## NOT RUN

- `gltf-decoders-variants.spec.ts` browser run (macos-14 ANGLE Metal only — lane rule forbids local Playwright). Unit-level decode round-trip + render-path assertions are covered by the vitest additions.
- KTX2 real transcode in-browser (basis_transcoder vendored for it, but the lane's ktx2 fixtures exercise `selectKTX2TargetFormat` via unit tests from PR A/B; visual ktx2 remains on the existing `prd04-ktx2` scene).

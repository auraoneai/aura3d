# PRD-04 phase-2 evidence — materials seam (PR B)

Phase-2 wiring per PRD-04 §13 (P2-1..P2-14) plus Phase-1 pure files
P1-4..P1-8 (ModelMaterialOverrides, MikkTSpaceTangents, TextureBudget,
ProceduralMaterialTextures, TransmissionRenderTarget). Everything is behind
`A3D_QR_MATERIALS`; flag-off paths are byte-identical to legacy.

## Local verification (this branch, flag `none` — no `A3D_QR_*` set)

| Check | Command | Result |
|---|---|---|
| Repo typecheck | `pnpm typecheck:raw` | clean |
| Bench typecheck | `pnpm exec tsc --noEmit -p benchmarks/quality-rebuild/tsconfig.json` | clean |
| Lane unit | `pnpm exec vitest run -c tests/qr/prd04/vitest.config.ts` | **99/99** in 15 files |
| Lint | `pnpm exec eslint` on all touched paths | clean |

### PRD-named test coverage

| PRD spec | File | What it proves |
|---|---|---|
| P2-1 typed-glb-actor-snapshot | `typed-glb-actor-snapshot.test.ts` | real `damaged-helmet.glb` (data-URI + stub decoder): post-load params equal the authored snapshot; overrides re-apply without accumulating; `setMaterialOverrides([])` restores **exactly** (param key set included — writes are filtered to authored keys). |
| P2-2 flag-off `setTint` byte-equality | same file | flag-off `setTint` keeps legacy in-place mutation (baseColor replace, emissive=baseColor fallback, `replaceSurfaceTextures` gating); flag-on lowers to one explicit override writing only given fields. |
| P2-3 `model-tint-bridge` both flag states | `model-tint-bridge.test.ts` | flag-off emits the verbatim legacy `tint` object; flag-on lowers `spec.color`→`baseColorMultiply`, skips preset-defaulted colour (R15), preserves array overrides; 2-material fixture `target:"Body"` changes only Body. |
| Q-01-2 hardware wrap (P2-8) | `hardware-wrap.test.ts` | stub shader source **with** `mode > 2.5` → wrap code `[3,3]` on non-atlas slots; **without** → option ignored + `hardwareWrapPending` reports `hardware-wrap-pending` via `inspectMaterials().warnings`; real registered shader currently lacks the passthrough → inert today, fail-closed. |
| P2-6 samplers (C-12) | `sampler-prd04.test.ts` | `Sampler.trilinear` wrap aliases (`clamp`/`mirror` + pair), `fromGLTF` enum table, tier defaults L4/M8/H16/U16 with device clamp and explicit-desire priority. |
| P2-13 duck route | `duck-route-materials.test.ts` | `main.ts` contains no product-smoothing/transmission-zeroing `setParameter` writes; `duck.glb` loaded through the production pipeline carries the authored glTF factors verbatim (GLB JSON chunk vs runtime params). |
| P2-5 diagnostics (C-31) | `material-diagnostics.test.ts` | `materials` section paths report `physical-r185`/`auto`/`basis`/`mikktspace` flag-on, legacy off; `textureBudgetBytes` read from `app.quality.settings`; `material-program-pending` issue raised (measured-or-pending — C-02 program-cache stats are lane 01's). |
| P2-14 diagnostic-only + coverage | same file | `DIAGNOSTIC_ONLY_PRD04_FIELDS` keeps only `alphaToCoverage`/`doubleSided`/`unlit`; 5 option-coverage rows registered (`model.material.color`, `model.materialOverrides`, `material.sampling.wrap`, `material.sampling.anisotropy`, `material.alphaMode`). |
| P1-6 MikkTSpace | `mikktspace-tangents.test.ts` | vendored r185 module output equals three's `computeMikkTSpaceTangents` exactly; regenerated TANGENT on NormalTangentMirrorTest lands within 1e-3 of authored. |
| P1-7 texture budget | `texture-budget.test.ts` | largest-first ledger, byte budgets, 4096²→2048² downscale, mipCount `floor(log2(max(w,h)))+1`. |
| P1-8 procedural textures | `procedural-textures.test.ts` | 4 kinds, deterministic SHA-256-stable output, edge wrap ≤1/255. |

## Flag-off identity

`typedGLBActorQrFlags()` returns `EMPTY_QR_FLAGS` until lane 15 calls
`setTypedGLBActorQrFlags` — so on `main` every flag-on branch (materialsR185,
tint lowering, sampler/procedural rewrite, hardwareWrap) is unreachable by
construction until the setter is wired. `applyModelTintBridge` flag-off emits
the legacy `tint` object verbatim (unit-asserted).

## Known gaps / NOT RUN

- **`setTypedGLBActorQrFlags` has no production caller** — qr-request to lane
  15 (createAuraApp/createGameApp flag resolution). Until then all flag-on
  actor behaviour is test-harness only.
- **`model()` drops `materialOverrides`/`variant`** — `AuraModelOptions`
  declares them (index.ts:1330-1332) but the builder doesn't forward onto the
  node; bridge reads them structurally via `ModelNodeMaterialSeams` so wiring
  is correct the moment lane 15 forwards them. qr-request filed.
- **`DIAGNOSTIC_ONLY_FIELDS` contract table** still lists
  `model.materialOverrides`/`model.variant` — `diagnosticOnly.prd04.ts` carries
  the removal; the merged contract map is lane 15's. qr-request filed.
- **Tier/device plumbing for samplers + texture budget**: `app.quality`
  settings → `GLTFRenderResourceOptions.textureBudget`/`maxTextureSize` and
  `ProductionTextureSamplingContext` forwarding happen at lane-15 call sites
  (`renderer.ts` owns the `createTypedGLBActor` call). qr-request filed.
- **`hardwareWrap` is inert until PRD 01 lands the Q-01-2 `mode > 2.5`
  passthrough** — fail-closed + `hardware-wrap-pending` warning. By design.
- **`material-program-pending`**: `programs`/`programCompileMs` report 0 until
  C-02's program-cache stats are reachable from the actor layer (lane 01).
- **macos-14 browser/capture runs are CI-only** — the workflow
  `qr-prd04-materials.yml` was updated (`--grep "PRD-04 lobe chunks"` fix,
  flags forwarded into adapters); first run ids recorded in the session
  report.

# PRD-02 qr-requests / ccr log

Non-blocking requests lane 02 has raised. Per CONTRACTS §6.5 the owner has
2 working days; lane 02 does not wait on them.

## qr-request to:prd01 — `projectCubeToSH9` texel weight (C-09)

- **File**: `packages/rendering/src/contracts/environment.ts` (lane 01)
- **Contract**: C-09 (environment probe projection)
- **Change**: in `projectCubeToSH9`, the texel weight
  `4 / (len * len * faceSize * faceSize)` under-weights off-axis texels by
  ~22% (constant-cube irradiance lands 28% below πL). The correct solid
  angle for `du=dv=2/F` over the unnormalized direction `(n+u·fu+v·fv)/len`
  is `4 / (len * len * len * faceSize * faceSize)` — i.e. `len³`, not `len²`.
- **Workaround in place**: the lane-02 barrel exports a corrected
  `projectCubeToSH9` from `packages/rendering/src/environment/SphericalHarmonics.ts`
  (same signature and interleaved coefficient layout). All lane-02 callers
  go through the barrel. The contract version has no flag-off consumers.
- **Evidence**: `tests/unit/contracts/impl/prd02-sh9-projection.test.ts` —
  constant-cube irradiance within 1% of πL fails against the contract impl,
  passes against the lane impl.
- **Raised**: 2026-10-06, PR-B (`qr/prd02-math-modules`). Until it lands the
  lane impl shadows the contract export via `@aura3d/rendering/lanes`.

## qr-request to:prd15 — `AuraSceneNode` union + `AuraEnvironmentNode` V2 fields (CCR-02-2)

- **File**: `packages/engine/src/agent-api/index.ts` (lane 15)
- **Contract**: C-10 / §7 node surface
- **Change**: (a) add `AuraProbeNode` (`kind: "probe"`, `probe: "reflection" | "irradiance-volume"`, `name`, `options`) to the `AuraSceneNode` union; (b) widen `AuraEnvironmentNode.environment` to include `"preset" | "neutral" | "none" | "capture"` and add `preset?: AuraEnvironmentPresetName`, `diffuseIntensity?`, `specularIntensity?`, `background?: false | AuraEnvironmentBackgroundOptions`, `capture?`; (c) add `"contact-shadows"` to `AuraEffectType`; (d) add `groundColor`/`twoSided`/`target` where missing on `AuraLightNode`/`AuraRectLightNode`.
- **Workaround in place**: builders emit the additive fields via casts (`AuraEnvironmentNodeV2`, `envV2`, `probes.*` builders, `contactShadows` node); runtime nodes carry the fields verbatim for the C-36 handlers.
- **Raised**: 2026-10-06, Phase 2 (`qr/prd02-engine-composition`).

## qr-request to:prd15 — `DIAGNOSTIC_ONLY_FIELDS["light.power"]` removal + `probes` top-level export

- **File**: `packages/engine/src/contracts/compiler.ts`, `packages/engine/src/agent-api/index.ts` (lane 15)
- **Change**: (a) drop the seeded `"light.power"` diagnostic-only row — PRD 02 has wired it (`physicalLightDescriptor` consumes lumens → candela); audit trail in `compiler/diagnosticOnly.prd02.ts`. (b) re-export `probes` from `agent-api/nodes/probes.ts` in the public `effects`/`environments` style (top-level `probes` builder namespace).
- **Workaround in place**: `probes` is exported from `@aura3d/engine/lanes` (`lanes/prd02.ts`) until the public surface lands.
- **Raised**: 2026-10-06, Phase 2 (`qr/prd02-engine-composition`).

## to:prd15 (Phase 3a additions)
- `tests/browser/contracts/C-12-sampler.spec.ts` does not exist — the C-12 conformance spec named in CONTRACTS §933 was never written in PR 0a/0b. Lane 02 covers the mapping with `tests/unit/contracts/impl/prd02-sampler-c12.test.ts` (device mock); please add the browser spec (1-mip downgrade; compare sampler compiles).
- `setRendererQrFlags` (`renderer/FrameGraph.ts`) is never called from `createAuraApp` — engine-side flag plumbing for rendering-layer flag checks is missing. Lane 02's `webgl2/Samplers.ts` C-12 mapping and mip-mapped env bindings read `rendererQrFlags()`; without wiring they only see the flag in tests. Please add `setRendererQrFlags(qrFlags)` at `createAuraApp.ts:26` (lane-15 file) or point us at the intended call site.
- C-12 has no `defineContractSlot` in `contracts/sampling.ts` — the "provide(real)" semantics for `resolveLightingSamplerBudget`/the WebGL2 mapping is implemented flag-gated inside `webgl2/Samplers.ts` + `environment/LightingSamplerBudget.ts`. If consumers (lanes 04/05/10) must call the real impl via a slot, a `ContractSlot` needs adding to the frozen file.
- `@aura3d/rendering` has no `./environment` subpath export — lane 02's Phase-3 modules (`EnvironmentCache`, `EnvironmentProbeFactory`, `probeBuild`, `EnvUniforms`) are consumed by engine code through deep `packages/rendering/src/...` imports (precedent: `threejs-example-parity/FlagshipFoundation.ts`). Please add a public `environment` export entry (lane-15 file) so lanes don't import internals.

## to:prd11 — `TextureUpload.ts` RGB9_E5 cube upload (Q-06-1)

- `Rgb9e5Cube` decodes baked presets to Float32 and uploads RGBA16F (2× memory). Native `RGB9_E5` upload needs `TextureFormat`/`TextureUpload` acceptance in the lane-11 file. Logged as pending in PRD-02 Phase 3 until the request lands.

## Phase 4 qr-requests

- **to:prd01** — `contracts/shadows.ts` `resolveShadowCasterVariant` is a plain
  exported stub, not a `Slot<>`, so lanes cannot `provide(real)`. Lane-02 ships
  `resolvePrd02ShadowCasterVariant` (rendering/src/shadows/Prd02DepthShaderLibrary.ts)
  and injects it via `DepthPassOptions.variantResolver`. Request: expose a
  provider slot or registry hook so `resolveShadowCasterVariant` itself resolves
  real keys under the flag.
- **to:prd01** — `createRegistry` (contracts/core.ts) has no enumeration
  accessor, so `registerDepthVariantFeature` entries cannot be listed. Lane-02
  keeps its own `prd02Features` array; request a `features()`/`entries()`
  reader on Registry so lanes (e.g. prd06 `prd06.deform`) can share the pass.
- **to:prd11** — `RenderDevice` has no `setViewport`; atlas tiles fold the
  tile rect into `drawViewProjection` + a per-draw `scissor` instead. No
  change needed, noted for awareness.
- **to:prd11** (standing, Phase 3) — `u_prd02LocalShadowIndex` / `perLightShadowIndex`
  can't upload through `uploadUniforms` (no ivec branch); kept as CPU-side
  pairs + a vec4-packed `u_prd02LocalShadowIndex` uniform in the chunk.
- **to:prd01** (Phase 5) — `Texture`'s `2d-array` dimension has no upload path
  in `TextureUpload` (2D + cube only). `IrradianceVolume` ships its 3× RGBA16F
  SH textures with per-layer `mipLevels` payloads (mipLevels[z] = layer z).
  Request: a real `texImage3D` upload + mip-levels-are-mips convention for
  `dimension: "2d-array"`.
- **note (intra-lane, C-09 is lane-02-owned)** (Phase 5) — `prd02.probes`
  needs the scene's per-face capture closure
  (`EnvironmentCaptureRequest.renderFace`). Delivered via blackboard
  `prd02.probeRenderFace` or `installPrd02ProbeRenderer`; if a later phase
  wants a first-class frame-context field it lands as a C-09 additive
  member, not a cross-lane request.

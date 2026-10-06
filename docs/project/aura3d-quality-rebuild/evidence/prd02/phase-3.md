# PRD-02 Phase 3 evidence — environment, background and sampler wiring

Branch: `qr/prd02-engine-composition` (stacked on `qr/prd02-math-modules`, PR #141).
Unit gate: `tests/unit/contracts/impl/prd02-phase3.test.ts` (17 tests, all green);
`prd02-sampler-c12.test.ts` + `prd02-env-factory.test.ts` from Phase 3a/`0d022c66`.

## Landed

- **C-12 sampler mapping** (`webgl2/Samplers.ts`, commit `97029682`): `compare` →
  `TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE` + `LEQUAL`/`GEQUAL` with `LINEAR`,
  `mirror` → `MIRRORED_REPEAT`, `addressW`, `*-mipmap-*` → non-mip filter when the
  texture has 1 level. `contracts/sampling.ts` contains **no `ContractSlot`** for
  C-12 (frozen, lane-01 file) — `provide(real)` is implemented as flag-gated
  mapping only; noted in `qr-requests.md` (to:prd01/prd15).
- **Mip-mapped env bindings**: `linear-mipmap-linear` on every flag-path binding —
  `EnvUniforms.ENV_SPECULAR_SAMPLER`, `Background.PRD02_BACKGROUND_SAMPLER`,
  `resolvePrd02EnvironmentLighting` equirect/cube samplers.
- **Neutral-room probe v1** (`environment/EnvironmentProbeFactory.ts`,
  `0d022c66`): `RoomEnvironmentScene` sampled → 6 RGBA16F faces → one readback at
  load → CPU GGX prefilter → mipped cube (`mipLevels` per face); mip-0 max
  radiance ≥ 50 and SH L0 > 0 asserted in `prd02-env-factory.test.ts`.
- **GPUPMREMGenerator v1**: GPU prefilter when `EXT_color_buffer_(half_)float`
  present (6 per-face RGBA16F targets while Q-01-5 is open), CPU-Worker fallback
  otherwise.
- **EnvironmentCache** (`environment/EnvironmentCache.ts`): `acquire/neutral/
  release`, ref-counted, key `(url|preset, tier)`, resident limit
  `environmentCacheLimit(tier, hasRgba16f)` (2 ultra / 2 medium+rgba16f / 3 else);
  `defaultProbeLoader` fetches `aura-environments/<preset>.manifest.json` +
  specular.ktx2 + sh9.f32 (offline tests inject loaders).
- **HDRI upgrade swap** (`agent-api/compiler/environment.ts`,
  `bindPrd02EnvironmentProbe`): neutral floor binds synchronously;
  `cache.acquire` resolves → swaps `source.environmentProbe` through the flag
  path — the 15-owned `upgradeProductionEnvironmentHdri` is not called under the
  flag. Unit-tested (neutral-sync + upgrade) with an injected deterministic
  loader.
- **`PBRHDRPipeline.ts` skips under `A3D_QR_LIGHTING`**: `intensity: 0.08` +
  procedural-map 0.06/0.1 → `0` (C-09 probe supplies ambient); `* 1.1` specular
  parity gains → passthrough (`:287`, `:429`).
- **`renderer/Background.ts` C-09 resolution**: `resolvePrd02EnvironmentBackground`
  (probe equirect when `blurriness === 0`, cubemap + `roughnessToLod` otherwise),
  wired into `collectEnvironmentBackground` under the flag; `false` keeps the
  solid colour.
- **`EnvironmentBackgroundPass` lod support**: `u_environmentBackgroundLod` =
  `roughnessToLod(blurriness, mipCount)`; `environment/
  Prd02BackgroundShaderLibrary.ts` registers the §8.7 `textureLod` variant
  (equirect lod 0, linear HDR out).
- **`forward/Lighting.ts` flag path**: shadow strength `1.0` (not `0.65`) via
  `prd02ShadowStrengthDefault`; `receiveShadow === false` → `u_*ShadowMapEnabled`
  0 / strength 0. Ambient × `1/π` via `ambientToExitRadiance` in
  `LightUniforms.ts`.
- **`AuraLights` std140 packer** (`LightUniforms.ts`): 32 × 6 vec4, kind codes
  0dir/1pt/2spot/3rect, cos-angle + decay packing, rect basis columns; returns
  `{lightsEvaluated, lightsDroppedByCap, droppedNames}`.
- **`EnvUniforms.ts`**: `packA3DEnvironmentUniforms` — §8.1-verbatim names
  (`u_envSpecular`, `u_envMipCount`, `u_envRotation`, `u_envDiffuseIntensity`,
  `u_envSpecularIntensity`, `u_ambientIrradiance`, `u_hemiSky`, `u_hemiGround`,
  `u_hemiDirection`); `packEnvSH` folds cosine constants at upload (band0 ×π,
  band1 ×2π/3, band2 ×π/4), `shBound` reported from the actual upload.
- **`lighting_ibl.glsl.ts`**: rewritten to the §8.1 block verbatim;
  `a3dRotateY`, `a3dRoughnessToLod` (`(u_envMipCount−1)·r·(2−r)`),
  `a3dSH9Irradiance` (7-vec4 unpack), `a3d_iblSpecular` (r⁴ bend + DFG LUT),
  specular/horizon occlusion.
- **Rect/softbox**: `physicalLightDescriptor` already emits `kind: "rect-area"`;
  `descriptorToAuraLightData` (compiler/lights.ts) packs it into the std140
  layout incl. orthonormal rect basis (`rectBasisFromDirection`).
- **Legacy equirect bridge** (`probeToEquirectTexture` in `probeBuild.ts`):
  mip-0 specular cube → Float32 equirect → CPU box-filter mip chain → rgba16f
  `Texture` — linear HDR end to end (no Reinhard, no RGBA8; the E5 fix).
  `resolvePrd02EnvironmentLighting` binds it (WeakMap-cached per probe) plus the
  specular cube under `linear-mipmap-linear`, with `intensity: 0` (no legacy
  fill) and `environmentMapEncoding: "linear"`.
- **Rgb9e5Cube → RGBA16F upload** (Q-06-1 pending for native `RGB9_E5`).

## Pending (browser capture / follow-ups)

- `tests/qr/prd02/browser/ibl-roughness.spec.ts` written — capture pending
  (rough 0.8 vs smooth 0.05 chrome ≥ 4× high-frequency energy; flag-off broken
  control).
- `pmrem.spec.ts`, `background.spec.ts`, `prd02-softbox` aspect-ratio spec,
  ChunkHarness `prd02-13` B/R ≥ 1.05 — not yet written/run.
- `readPixelsCalls` delta = 0 after frame 2 and Long-Task > 50 ms checks gate on
  C-28 counters (Phase 4 first item) and a browser lane run.
- `forward/Lighting.ts` clustering > 32 wiring + `lightsEvaluated`/
  `lightsDroppedByCap` plumbing into the C-31 `prd02.lighting` section; flag-off
  byte-identical uniform test.
- Native `RGB9_E5` cube upload (Q-06-1 → to:prd11, logged in qr-requests.md).
- `setRendererQrFlags` is never called from `createAuraApp` — rendering-layer
  flag checks only see the flag in tests until lane 15 wires it (qr-request).

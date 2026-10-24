# Aura3D 4.0.0 release notes

Version: 4.0.0

Release: https://github.com/auraoneai/aura3d/releases/tag/v4.0.0

Status: **Aura3D 4.0.0 release**. Public claims and release wording are governed
by `docs/project/product-studio-claim-registry.md` and remain bounded to the
named public surfaces, routes, and verification receipts. No unscoped
superiority, universal engine replacement, or unverified hardware claim is made.

## Highlights in Aura3D 4.0.0

### 1. Single `@aura3d/engine@4.0.0` Public Surface and `create-aura3d@4.0.0` Scaffolding

- **Unified public package surface:** `@aura3d/engine@4.0.0` is the single
  canonical root package for application and agent authoring (`createAuraApp`,
  `scene`, `model`, `camera`, `lights`, `material`, `effects`, `timeline`,
  `interactions`, `game`, and typed subpath exports `./math`, `./scene`,
  `./ecs`, `./controls`, `./physics`, `./animation`, `./assets`, `./input`,
  `./audio`, `./scripting`, `./workflows`, `./editor-runtime`, `./renderer`,
  `./devtools`, and `./game`).
- **Scaffolding:** `create-aura3d@4.0.0` and `@aura3d/cli@4.0.0` scaffold
  projects pinned to `@aura3d/engine@4.0.0` with typed `aura.assets.json` and
  generated `src/aura-assets.ts` workflows.
- **Lean surface consolidation:** `@aura3d/lean` and 19 deprecated subpath
  aliases have been consolidated into `@aura3d/engine`. See
  [`docs/migration-4.0.md`](../../../migration-4.0.md) for the complete migration table.

### 2. All 19 Showcase Games Upgraded with Custom Meshy 3D PBR Assets and Gameplay Mechanics

- **Custom Meshy 3D PBR hero assets:** All 19 showcase game routes (`Turbo Drift
  Circuit`, `Skyline Runner`, `Blockfall Reactor`, `Neon Swarm`, `Aurora
  Lander`, `Bank Shot`, `Deep Recovery`, `Gallery Shift`, `Gravity Post`,
  `Patrol Wing`, `Rooftop Buckets`, `Siege Golf`, `Vault Breakers`, `Courier
  Rush`, `Pulse Tunnel`, `Mech Hangar`, `Aura Clash`, `Neon Corridor Strike`,
  and `Meshy Relic Pilot`) are equipped with custom Meshy-generated 3D PBR hero
  vehicles, rigged characters, and environment props registered through
  `aura.assets.json` with SHA-256 provenance.
- **Upgraded gameplay mechanics:** Showcase game routes feature deterministic
  frame-loop progression, multi-checkpoint/lap or wave/act objectives, HUD
  telemetry synchronization, audio cues, reset flows, and bounded route-health
  diagnostics.

### 3. WebGPU Compute Particle System (`ResidentGPUParticleRenderer`) and WebGL2 Parity Rendering

- **WebGPU compute particles:** `ResidentGPUParticleRenderer` executes GPU
  compute particle simulation and instanced billboard rendering on supported
  WebGPU adapters without per-frame CPU readback stalls, with explicit diagnostic
  reporting and deterministic fallback handling when WebGPU is unavailable.
- **WebGL2 and WebGPU parity rendering:** Shared PBR metallic-roughness shading,
  HDR/IBL environment lighting, cascaded directional and spot shadow maps, and
  post-processing passes (bloom, tonemapping, FXAA/TAA, SSAO) maintain bounded
  same-scene rendering behavior across WebGL2 and WebGPU paths.

### 4. Same-Origin Production Asset and Fixture Delivery

- **Self-contained static delivery:** All game and non-game showcase routes,
  typed GLB/glTF models, KTX2/Basis textures, HDR environments, and benchmark
  corpus fixtures are served from same-origin paths without external runtime CDN
  dependencies, verified by `pnpm check:deployment` and route-health asset
  probes.

## Removed at 4.0.0

| Surface | Replacement |
|---|---|
| `@aura3d/lean` package (`./lean`, `./lean-game`, `./lean-product` entries) | `@aura3d/engine` "." |
| 19 deprecated engine subpath aliases (`core`, `environments`, `materials`, `product-studio`, `engine`, `engine-runtime`, `create-aura3d`, `rendering/advanced-runtime`, `animation/browser`, `assets/gltf-runtime`, `assets/asset-corpus`, `assets/production-runtime`, `assets/advanced-gallery`, `workflows/production-runtime`, `editor`, `debug`, `scene-kits/{product-viewer,humanoid-walk,particle-fountain}`) | `.` or the real package of the same name |
| 85 deprecated `.` union re-export names | canonical names (`aura.exports.json`) |
| `AdvancedRenderer` type alias | `Renderer` |
| CCR-15-1 types `AuraRendererMode`, `AuraRendererFallbackMode` | `renderer.quality` literal unions |
| `packages/lean` workspace | — |
| engine `agent-api/lean{,-game,-product}.ts` leaves | — |

## Still deprecated in 4.0.0 (blocked on other lanes)

Per §6.6 step 3, names still consumed in-repo stay deprecated until their owner
lanes land the migration; each lists its open request ID.

### Deprecated subpath aliases (10 — consumers remain)

`./media-node`, `./apps`, `./contracts`, `./rendering`,
`./rendering/production-runtime`, `./rendering/webgpu`,
`./production-runtime`, `./advanced-runtime`, `./assets/browser`,
`./workflows/production`

### Deprecated `.` names (64 — consumers remain)

`A3DEnvironment`, `A3DRenderer`, `AnimationAction`, `AnimationClip`,
`AnimationLayer`, `AnimationMixer`, `AnimationTrack`, `AuraColor`,
`AuraCreateAppOptions`, `AuraCreateGameAppOptions`, `AuraDiagnosticsOverlay`,
`AuraEffectNode`, `AuraLightNode`, `AuraModelOptions`, `AuraNodeBuilder`,
`AuraPerformanceQuality`, `AuraPrimitiveNode`, `GLTFLoader`,
`GamePlatformerEvent`, `Renderer`, `captureAuraAppScreenshot`,
`captureScreenshot`, `character`, `collectAuraSceneEvidence`,
`collectPromptAnimationEvidence`, `compilePromptPlan`,
`compositeMetallicRoughnessPixels`, `createA3DApp`, `createAnimationController`,
`createAssetCompatibilityReport`, `createAssetViewerWorkflow`,
`createCaptionTimingProof`, `createExternalParityEnvironmentPipeline`,
`createGameAppRuntime`, `createInteractiveSceneWorkflow`,
`createProductConfiguratorWorkflow`, `createProductionPrimitiveTextureIntent`,
`crowds`, `decals`, `describeProductionSpotShadow`, `editor`,
`evaluatePromptAnimationPublishReadiness`, `gameAssetValidation`,
`inspectAsset`, `inspectGLTFAsset`, `listExternalParityEnvironmentTargets`,
`loadAsset`, `loadRenderableAsset`, `meshVehicleSurface`,
`mipChainBytesCoarseToFine`, `navigation`, `normalizeSceneSnapshot`,
`normalizeTextureBudgetBytes`, `quaterniusGameReadyFighterValidationContract`,
`resolveProductionRuntimeShadowTuning`, `resolveProductionShadowCasterIndex`,
`sky`, `summarizeExternalParityGLTFCorpus`, `unsafeModelUrl`,
`upgradeProductionPrimitiveTextures`, `validatePlatformerMotion`,
`validateQuaterniusGameReadyFighterAsset`, `water`, `weather`

Blocking owners span lanes 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13,
14 — the per-name consumer detail is in
`docs/project/aura3d-quality-rebuild/evidence/prd15/phase8-removal-sweep.md`.

### Renderer aliases

`A3DRenderer` (engine `.` re-export) and `ProductionRuntimeRenderer`
(`@aura3d/rendering` export) stay live: consumers in lanes
01/02/05/09/11/12/13/14 (apps + tests) still reference them. `AdvancedRenderer`
was removed — it had no remaining consumer.

### `packages/input/src/controls`

Stays deprecated: `examples/game-slice/main.ts` imports
`createSceneCameraControlAdapter`/`ThirdPersonFollowControls` via
`@aura3d/input`. Open request: **Q-13-10** (repoint to `@aura3d/controls`).

### `AuraRendererQualityProfile` deprecated fields

`mode?`, `fallback?`, `rendererMode`, `fallbackMode`,
`maxRecommendedDrawCalls`, `requestedFeatures`, `supportedInRoot`,
`blockedInRoot`, `claimBoundary` stay deprecated: the 11-owned
`agent-api/app/rendererOptions.ts` still populates them. Open request:
**Q-11-6**. The deprecated type aliases `AuraRendererMode` /
`AuraRendererFallbackMode` were removed (only 15-owned consumers); remaining
field references are inlined literal unions.

## Open request IDs filed this phase

- **Q-13-10** — repoint `examples/game-slice` controls imports to `@aura3d/controls`
- **Q-05-10** — drop the dead `@aura3d/lean` branch in `asset-manifest.ts`
- **Q-11-7** — repoint the bundle-size scenario entry to `packages/engine/src/public/index.ts`
- **Q-13-11** — `look/lean-import` rule naming (optional; rule stays correct)

## Verification

`tsc -p tsconfig.check.json --noEmit`: 19 errors, identical to merged `main`
tip `1f579954` — all pre-existing lane redness (02/03/12), zero introduced by
the removal sweep.

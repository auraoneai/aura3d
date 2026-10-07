# PRD-15 Phase 8 — T8.1 removal sweep evidence

Branch `qr/prd15-40-removal` on `main` tip `1f579954`.

T8.1 (PRD line 1742): remove every `aura.exports.json#deprecated` entry with
no remaining in-repo consumer outside 15-owned files (`rg -lw`), the
`A3DRenderer`/`ProductionRuntimeRenderer`/`AdvancedRenderer` aliases,
`packages/lean`, `packages/input/src/controls`, the CCR-15-1 deprecated
types, and the deprecated "." evidence re-exports. §6.6 step 3: still-
consumed names stay deprecated and are listed with open request IDs.

## Removed

- **22 deprecated subpath entries** removed from `aura.exports.json`
  `paths` + `deprecated` and from `package.json#exports`; their
  `packages/engine/src/deprecated/*.ts` stubs deleted:
  `lean`, `lean-game`, `lean-product`, `core`, `environments`, `materials`,
  `product-studio`, `engine`, `engine-runtime`, `create-aura3d`,
  `rendering/advanced-runtime`, `animation/browser`, `assets/gltf-runtime`,
  `assets/asset-corpus`, `assets/production-runtime`, `assets/advanced-gallery`,
  `workflows/production-runtime`, `editor`, `debug`,
  `scene-kits/{product-viewer,humanoid-walk,particle-fountain}`

- **`packages/lean` + `@aura3d/lean{,/product,/game}` specifiers** — package
  dir deleted; root devDep removed; alias tables (tsconfig paths, vitest,
  vite.aliases.generated, example-dev-server, bundle-scenarios,
  browser-entry-purity) regenerated/cleaned.

- **engine `agent-api/lean{,-game,-product}.ts` leaves** deleted (shims).

- **85 deprecated `.` names** removed from `packages/engine/src/public/index.ts`:

  `A3DApp`, `A3DAppDiagnostics`, `A3DAppLifecycle`, `A3DAppLifecycleSnapshot`, `A3DAppOptions`, `A3DAppQualityPreset`, `A3DAppQualitySettings`, `A3DAppWorkflowPreset`, `A3DAssetDiagnostics`, `A3DDiagnosticsPanel`, `A3DDisposable`, `A3DEnvironmentOptions`, `A3DMaterialVariantController`, `A3DRenderDiagnostics`, `A3DRendererOptions`, `A3DScene`, `A3DSceneMeshOptions`, `A3DSceneRenderSourceOptions`, `A3DScreenshotCapture`, `A3DWorkflowApi`, `A3D_APP_WORKFLOW_PRESETS`, `AURA_SPEC_CONSTRUCTIBLE_SHAPES`, `AuraAssetPanelRow`, `AuraAssetPreloadResult`, `AuraAssetPreloader`, `AuraFrameCallback`, `AuraFrameInfo`, `AuraJointKind`, `AuraPerformancePanelSnapshot`, `AuraRendererFallbackMode`, `AuraRendererMode`, `AuraResourceDescriptor`, `AuraResourceKind`, `AuraResourceManager`, `AuraResourceManagerEvidence`, `AuraResourceRecord`, `AuraResourceStatus`, `AuraRouteHealth`, `AuraTimelineSpec`, `CharacterAssemblyValidationReport`, `ECSRenderLibraries`, `ECSRenderSourceOptions`, `HelperPlacementClaim`, `assertAuraRouteReady`, `assertAuraScreenshotNotBlank`, `assignActionToAnimationLayer`, `attachAnimationLayer`, `auraAppRegistry`, `collectDecalBudgetTelemetry`, `createAnimationAction`, `createAnimationClip`, `createAnimationDebugOverlay`, `createAnimationEventMarker`, `createAnimationLabWorkflow`, `createAnimationLayer`, `createAnimationMixer`, `createAnimationTrack`, `createAssetPreloader`, `createAuraAssetPanelRows`, `createAuraDiagnosticsOverlay`, `createAuraPerformancePanelSnapshot`, `createAuraRouteHealth`, `createComparisonWorkflow`, `createCompatibilityReport`, `createECSRenderSource`, `createMaterialStudioWorkflow`, `createMaterialVariantController`, `createPhysicsRuntime`, `createPostProcessComposerLazy`, `createRenderDiagnostics`, `createResourceManager`, `createSceneShowcaseWorkflow`, `createVisemeTimelineTrack`, `crossFadeAnimations`, `describeTextureStreamingResidency`, `loadProductAsset`, `loadProductAssetLazy`, `resolveA3DAppQualityPreset`, `resolveDecalFadeOpacity`, `sampleVisemeTimelineTrack`, `selectAuraRootLodLevel`, `setAnimationTimeScale`, `subscribeAnimationEvents`, `validateJointSpec`, `visualScripting`

- **`AdvancedRenderer` alias** removed from `packages/rendering/src/advanced-runtime`
  + `packages/rendering/src/index.ts` (no remaining in-repo consumer).

- **CCR-15-1 types `AuraRendererMode`/`AuraRendererFallbackMode`** removed from
  `agent-api/nodes/types.ts` + its re-export line; remaining field sites
  inlined as literal unions (fields stay — Q-11-6).

### In-repo consumers repointed (15-owned)

22 files: devtools types → `@aura3d/engine/devtools`; tests/harnesses →
relative `agent-api/<leaf>.js` or `@aura3d/engine-runtime`; benchmark →
`@aura3d/engine-runtime`; showcase apps → devtools; parity test →
`@aura3d/apps` + `public/devtools.ts` additions; react locally declares
`AuraFrameInfo`/`AuraFrameCallback`/`AuraTimelineSpec` (published pkg).

## Still deprecated in 4.0.0 (§6.6 step 3)

**10 subpaths** — consumers remain in other lanes: `./media-node`, `./apps`,
`./contracts`, `./rendering`, `./rendering/production-runtime`,
`./rendering/webgpu`, `./production-runtime`, `./advanced-runtime`,
`./assets/browser`, `./workflows/production`

**`A3DRenderer`** (blocked: 05,11,12,13,14) and **`ProductionRuntimeRenderer`**
(real `@aura3d/rendering` export; consumers: 01 app, tests) stay.

**`packages/input/src/controls`** stays — `examples/game-slice/main.ts`
consumes via `@aura3d/input` (request **Q-13-10**).

**`AuraRendererQualityProfile` deprecated fields** stay — 11-owned
`rendererOptions.ts` populates them (request **Q-11-6**).

**64 blocked `.` names**, per-name consumers:

| Name | Blocking lanes | Sample consumers |
|---|---|---|
| `A3DEnvironment` | 01, 02 | `packages/rendering/src/environment/EnvUniforms.ts`, `packages/rendering/src/shaders/chunks/lighting_ibl.glsl.ts` |
| `A3DRenderer` | 05, 11, 12, 13, 14 | `apps/aura-clash-showcase/README.md`, `apps/aura-clash-showcase/launch-evidence/local-gates.json`, `apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts` (+3) |
| `AnimationAction` | 06, 13 | `examples/asset-viewer/main.ts`, `packages/animation/README.md`, `packages/animation/src/AnimationAction.ts` (+3) |
| `AnimationClip` | 05, 06, 13 | `examples/animated-character/main.ts`, `examples/game-slice/main.ts`, `packages/animation/README.md` (+3) |
| `AnimationLayer` | 06, 13 | `examples/animated-character/main.ts`, `packages/animation/README.md`, `packages/animation/src/AnimationLayer.ts` (+3) |
| `AnimationMixer` | 06, 12, 13 | `.agents/skills/aura3d-core/SKILL.md`, `.agents/skills/llms.txt`, `.claude/skills/aura3d-core/SKILL.md` (+3) |
| `AnimationTrack` | 05, 06, 13 | `examples/animated-character/main.ts`, `examples/game-slice/main.ts`, `packages/animation/README.md` (+3) |
| `AuraColor` | 02, 04, 10, 12, 13 | `benchmarks/quality-rebuild/aura3d/scenes/prd01/common.ts`, `benchmarks/quality-rebuild/aura3d/scenes/prd07/common.ts`, `packages/create-aura3d/templates/falling-blocks-starter/src/main.ts` (+3) |
| `AuraCreateAppOptions` | 03, 06, 13 | `packages/engine/src/agent-api/humanoid-walk-runtime.ts`, `packages/engine/src/agent-api/looks/looks.ts`, `packages/engine/src/agent-api/postBridge.ts` |
| `AuraCreateGameAppOptions` | 09 | `packages/engine/src/agent-api/app/createGameApp.ts`, `packages/game/src/createGame.ts` |
| `AuraDiagnosticsOverlay` | 11 | `tools/bundle-size/index.ts` |
| `AuraEffectNode` | 03, 07, 12, 13 | `benchmarks/quality-rebuild/aura3d/scenes/prd07/common.ts`, `packages/engine/src/agent-api/compiler/postprocess.ts`, `packages/engine/src/agent-api/looks/lookLint.ts` (+3) |
| `AuraLightNode` | 02, 10, 12, 13 | `benchmarks/quality-rebuild/aura3d/scenes/prd01/common.ts`, `packages/engine/src/agent-api/compiler/environment.ts`, `packages/engine/src/agent-api/compiler/lights.ts` (+3) |
| `AuraModelOptions` | 04, 10 | `packages/engine/src/agent-api/compiler/modelMaterials.ts`, `packages/engine/src/agent-api/nodes/instances.ts` |
| `AuraNodeBuilder` | 03, 07, 10, 12, 13 | `benchmarks/quality-rebuild/aura3d/scenes/prd01/common.ts`, `packages/create-aura3d/templates/mini-game/src/main.ts`, `packages/engine/src/agent-api/looks/looks.ts` (+3) |
| `AuraPerformanceQuality` | 01, 11 | `packages/engine/src/agent-api/RootPerformanceQuality.ts`, `packages/rendering/src/Renderer.ts` |
| `AuraPrimitiveNode` | 01, 04, 09, 10, 12, 13, 14 | `apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json`, `apps/aura-clash-showcase/launch-evidence/readiness.json`, `benchmarks/quality-rebuild/aura3d/scenes/prd01/common.ts` (+3) |
| `GLTFLoader` | 04, 05, 06, 11, 12, 13, 14 | `.agents/skills/aura3d-core/references/boundaries.md`, `.agents/skills/llms.txt`, `.claude/skills/aura3d-core/references/boundaries.md` (+3) |
| `GamePlatformerEvent` | 08, 13 | `packages/create-aura3d/templates/mini-game/src/main.ts`, `packages/engine/src/agent-api/GameGenreKits.ts`, `templates/mini-game/src/main.ts` |
| `Renderer` | 01, 02, 03, 06, 07, 09, 10, 11, 12, 13, 14 | `.agents/skills/aura3d-art-direction/references/failure-gallery.md`, `.claude/skills/aura3d-art-direction/references/failure-gallery.md`, `.cursor/skills/aura3d-art-direction/references/failure-gallery.md` (+3) |
| `captureAuraAppScreenshot` | 13 | `docs/agents/api-surface.md` |
| `captureScreenshot` | 09, 13 | `packages/create-aura3d/templates/prompt-animation-channel/tests/storyboard-playback.spec.ts`, `templates/production-product-viewer/src/main.ts`, `tools/showcase-library/game-mobile-touch-audit.mjs` |
| `character` | 01, 04, 05, 06, 08, 09, 12, 13, 14 | `.agents/skills/aura3d-animation-studio/SKILL.md`, `.agents/skills/aura3d-art-direction/SKILL.md`, `.agents/skills/aura3d-art-direction/references/framing-and-shots.md` (+3) |
| `collectAuraSceneEvidence` | 12, 13, 14 | `.agents/skills/aura3d-evidence-review/SKILL.md`, `.agents/skills/aura3d-scene-authoring/SKILL.md`, `.claude/skills/aura3d-evidence-review/SKILL.md` (+3) |
| `collectPromptAnimationEvidence` | 13 | `packages/create-aura3d/templates/animation-channel/README.md`, `packages/create-aura3d/templates/animation-channel/src/render-plan.ts`, `packages/create-aura3d/templates/animation-studio/README.md` (+3) |
| `compilePromptPlan` | 09, 13 | `.agents/skills/aura3d-evidence-review/SKILL.md`, `.agents/skills/aura3d-scene-authoring/SKILL.md`, `.claude/skills/aura3d-evidence-review/SKILL.md` (+3) |
| `compositeMetallicRoughnessPixels` | 04 | `packages/engine/src/agent-api/compiler/textures.ts` |
| `createA3DApp` | 13 | `templates/external-parity-asset-gallery/README.md`, `templates/external-parity-asset-gallery/src/main.ts`, `templates/external-parity-interactive-scene/README.md` (+3) |
| `createAnimationController` | 06, 13, 14 | `.agents/skills/aura3d-character-animation/SKILL.md`, `.agents/skills/llms.txt`, `.claude/skills/aura3d-character-animation/SKILL.md` (+3) |
| `createAssetCompatibilityReport` | 05 | `packages/assets/src/AssetCompatibility.ts`, `packages/assets/src/advanced-gallery/index.ts`, `packages/assets/src/browser-index.ts` (+1) |
| `createAssetViewerWorkflow` | 12 | `benchmarks/foundation/aura3d/render-aura3d-scene.ts` |
| `createCaptionTimingProof` | 13, 14 | `apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json`, `apps/aura-clash-showcase/launch-evidence/readiness.json`, `packages/create-aura3d/templates/animation-channel/src/render-plan.ts` (+2) |
| `createExternalParityEnvironmentPipeline` | 02 | `packages/rendering/src/EnvironmentPipeline.ts` |
| `createGameAppRuntime` | 09 | `packages/engine/src/agent-api/GameAppRuntime.ts`, `packages/engine/src/agent-api/app/createGameApp.ts` |
| `createInteractiveSceneWorkflow` | 12 | `benchmarks/foundation/aura3d/render-aura3d-scene.ts` |
| `createProductConfiguratorWorkflow` | 12, 13 | `benchmarks/external-parity/aura3d/product-configurator.ts`, `examples/external-product-configurator/ExternalProductConfigurator.ts`, `examples/product-configurator/README.md` (+1) |
| `createProductionPrimitiveTextureIntent` | 04, 13 | `packages/engine/src/agent-api/compiler/textures.ts`, `packages/engine/src/agent-api/looks/generatedCodeWarnings.ts` |
| `crowds` | 01, 12, 13 | `packages/create-aura3d/templates/animation-studio/src/director/director-heuristics.ts`, `packages/rendering/src/InstancingDiagnostics.ts`, `tools/showcase-library/game-visual-qa.mjs` |
| `decals` | 01, 07, 09, 12, 13, 14 | `.agents/skills/aura3d-game-art/references/sprite-palettes.md`, `.claude/skills/aura3d-game-art/references/sprite-palettes.md`, `.cursor/skills/aura3d-game-art/references/sprite-palettes.md` (+3) |
| `describeProductionSpotShadow` | 02 | `packages/engine/src/agent-api/compiler/shadows.ts` |
| `editor` | 03, 06, 08, 09, 12, 13 | `benchmarks/aura3d/src/scenes/editor-authored-startup.ts`, `benchmarks/babylon/src/scenes/editor-authored-startup.ts`, `benchmarks/shared/scenes/descriptor.ts` (+3) |
| `evaluatePromptAnimationPublishReadiness` | 13 | `packages/create-aura3d/templates/animation-channel/README.md`, `packages/create-aura3d/templates/animation-channel/src/render-plan.ts`, `packages/create-aura3d/templates/animation-studio/README.md` (+3) |
| `gameAssetValidation` | 14 | `apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json`, `apps/aura-clash-showcase/launch-evidence/readiness.json` |
| `inspectAsset` | 05, 13 | `packages/aura3d-cli/src/cli.ts`, `packages/aura3d-cli/src/index.ts`, `packages/aura3d-cli/src/meshy/import.ts` (+2) |
| `inspectGLTFAsset` | 05, 13 | `examples/asset-viewer/main.ts`, `examples/postprocess-lab/main.ts`, `packages/assets/src/AssetInspection.ts` (+3) |
| `listExternalParityEnvironmentTargets` | 02 | `packages/rendering/src/EnvironmentPipeline.ts` |
| `loadAsset` | 09 | `packages/audio/src/game-sound/GameSoundEngine.ts` |
| `loadRenderableAsset` | 05, 12 | `docs/project/parity/threejs/status.md`, `packages/assets/src/advanced-gallery/index.ts`, `packages/assets/src/browser-index.ts` (+3) |
| `meshVehicleSurface` | 08 | `packages/engine/src/agent-api/GameSceneGeometryBindings.ts`, `packages/engine/src/agent-api/VehicleChassis.ts` |
| `mipChainBytesCoarseToFine` | 04 | `packages/engine/src/agent-api/compiler/textures.ts` |
| `navigation` | 05, 09, 12, 13, 14 | `.agents/skills/aura3d-assets/SKILL.md`, `.claude/skills/aura3d-assets/SKILL.md`, `.cursor/skills/aura3d-assets/SKILL.md` (+3) |
| `normalizeSceneSnapshot` | 09 | `packages/game/src/createGame.ts` |
| `normalizeTextureBudgetBytes` | 11 | `packages/engine/src/agent-api/app/rendererOptions.ts` |
| `quaterniusGameReadyFighterValidationContract` | 14 | `apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json`, `apps/aura-clash-showcase/launch-evidence/readiness.json` |
| `resolveProductionRuntimeShadowTuning` | 02 | `packages/engine/src/agent-api/compiler/shadows.ts` |
| `resolveProductionShadowCasterIndex` | 02, 12 | `benchmarks/quality-rebuild/aura3d/common.ts`, `packages/engine/src/agent-api/compiler/shadows.ts` |
| `sky` | 01, 02, 05, 07, 09, 10, 12, 13, 14 | `.agents/skills/aura3d-art-direction/SKILL.md`, `.agents/skills/aura3d-art-direction/references/look-recipes.md`, `.agents/skills/aura3d-art-direction/references/quality-bar.md` (+3) |
| `summarizeExternalParityGLTFCorpus` | 05 | `packages/assets/src/ExternalParityGLTFCorpus.ts`, `packages/assets/src/advanced-gallery/index.ts`, `packages/assets/src/browser-index.ts` (+1) |
| `unsafeModelUrl` | 05, 12, 13, 14 | `.agents/skills/aura3d-core/references/boundaries.md`, `.agents/skills/aura3d-threejs-migration/SKILL.md`, `.agents/skills/llms.txt` (+3) |
| `upgradeProductionPrimitiveTextures` | 04 | `packages/engine/src/agent-api/compiler/textures.ts` |
| `validatePlatformerMotion` | 08, 12 | `docs/project/parity/threejs/capability-lineage.md`, `packages/engine/src/agent-api/GameGenreKits.ts`, `packages/engine/src/agent-api/PlatformerMotion.ts` (+1) |
| `validateQuaterniusGameReadyFighterAsset` | 14 | `apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json`, `apps/aura-clash-showcase/launch-evidence/readiness.json` |
| `water` | 01, 02, 05, 09, 10, 11, 12, 13, 14 | `.agents/skills/aura3d-art-direction/references/reference-frames.md`, `.agents/skills/aura3d-core/SKILL.md`, `.agents/skills/aura3d-game-art/references/sprite-palettes.md` (+3) |
| `weather` | 01, 02, 12, 13 | `.agents/skills/aura3d-art-direction/references/quality-bar.md`, `.agents/skills/aura3d-core/SKILL.md`, `.agents/skills/aura3d-materials-environments/SKILL.md` (+3) |

## Open requests filed
- Q-13-10 game-slice controls import → `@aura3d/controls`
- Q-05-10 asset-manifest lean dep branch
- Q-11-7 bundle-size lean scenario entry
- Q-13-11 look-lint lean rule naming (optional)

## Verification
- `pnpm exec tsc -p tsconfig.check.json --noEmit`: **19 errors, identical
  to merged main** (pre-existing lanes 02/03/12 redness — prd02-lighting-
  legacy-golden, prd03-post-*, prd12-gate). Zero new errors from the sweep.
- Resolution maps regenerated (`tools/generate-resolution-maps --write`):
  tsconfig.paths.generated.json 107→82 engine rows, vite.aliases.generated.ts,
  finalize-dist manifest, package.json exports/files, devDep drop all clean.
## T8.2 gate results (cb109f16)

### pack:check — PASS (27/27)
`pnpm pack:check` green after three repairs that were also broken on main
(masked by stale gitignored `dist/`):

1. **Cross-package relative imports** — lane-02 files (`lanes/prd02.ts`,
   `agent-api/compiler/environment.ts`, `compiler/lights.ts`) plus 15-owned
   `threejs-example-parity/*` emitted `../../../rendering/src/*.js` specifiers
   that resolve to a sibling package's SOURCE tree — legal in-repo, dead in
   the packed tarball (`dist/<pkg>/...` layout drops the `src/` segment).
   Fixed centrally in `tools/finalize-dist/index.ts`: `rewriteSpecifier` now
   remaps a relative specifier that escapes the emitting package and enters
   `<other-pkg>/src/` onto the sibling's emitted mirror (`dist/<pkg>/...`
   root pass, `packages/<pkg>/dist/...` local pass). 19 template vite builds
   unblocked.
2. **"." surface gaps** — shipped create-aura3d templates imported
   `compilePromptPlanV2`, `createFightingGameKit`, `FightingGameSnapshot`,
   `GamePlatformerSnapshot`, `GameRacingKit` — all live agent-api exports
   never published on ".". Added to `public/index.ts`. (`AuraAsset` in
   `apps/showcase-asset-audition` is a lane-14 app bug — nonexistent type,
   not a packed template; not fixed here.)
3. **`Buffer` in shipped `.d.ts`** — `rendering/environment/HdrEquirect.ts`
   declared `decodeHdrEquirect(buf: Uint8Array | Buffer)`, leaking the
   Node-only `Buffer` type into packed declarations (3 templates red) — and
   `Buffer.from` at module top-level would crash on import in a real browser.
   Converted to `Uint8Array` throughout (identical bytes/behavior; `Buffer`
   is a `Uint8Array` subclass so Node callers still typecheck).
   Courtesy request: **Q-02-3**.

### arch:check — 32 enforced errors, all pre-existing (main baseline: 33)
Branch is **net −1 vs merged main**. Cleared: engine unused deps
`@aura3d/debug`/`create-aura3d` (T8.1 removed the only importers) and root
`@aura3d/game` missing-dependency. Remaining findings are other lanes'
pre-existing surface: glsl-location (shader files, lanes 02/03/10/12),
layering (promptPlanV2 → rendering/contracts; compiler → app/ — lane-11/13
allowlist territory), no-cycles SCC-153, single-renderer `getContext`
calls (prd01 outputSurface, rendering PixelRatio), unique-ownership
`AudioBus` (audio vs game), deps-truth residual WARNs.

### Remaining T8.2 items
- §16.1 36 strict captures (identity vs Phase 7) — dispatched via the
  GitLab capture lane / captures workflow on this PR (packed-consumer-check
  touched → `qr-prd15-captures` triggers).
- 4.0.0 publish — `release.yml` is `workflow_dispatch`-only; coordinator
  action post-merge per runbook, not this lane.

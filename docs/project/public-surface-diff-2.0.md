# Aura3D 4.5.0 Public-Surface Diff

Generated from `v1.5.2` and the current source tree. This audit covers every non-private package manifest, export subpath, recursively re-exported runtime/type symbol, CLI binary/command detected in source, and scaffold template name.

- Baseline packages: **26**; current packages: **24**
- Baseline export subpaths: **68**; current export subpaths: **74**
- Baseline symbols: **13007**; current symbols: **12998**
- Classified removals: **2129**; unclassified removals: **0**
- Incompatible retained-symbol declaration changes: **0**
- Compatible retained-symbol declaration additions: **0**
- Public schema identifiers: **25** baseline; **33** current
- Generated asset shape: **intentional-2.0-generated-asset-shape-change**
- Verdict: **PASS**

## Removed or relocated surface

| Scope | Category | Name | Classification |
|---|---|---|---|
| `@aura3d/animation` | runtime-symbol | `sampleMotionMatchingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | runtime-symbol | `sampleSecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `MotionMatchingCandidateScore` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `MotionMatchingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `MotionMatchingFixtureSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `MotionMatchingPoseCandidate` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `MotionMatchingTrajectorySample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `SecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `SecondaryAnimationFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/animation` | type-symbol | `SpringBoneSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/asset-index` | runtime-symbol | `createAuraIndexAdapter` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | runtime-symbol | `INDEX_STORE_SCHEMA` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | runtime-symbol | `IndexStore` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | runtime-symbol | `refreshIndex` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | type-symbol | `AuraIndexAdapterOptions` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | type-symbol | `IndexStoreFile` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | type-symbol | `RefreshOptions` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | type-symbol | `RefreshResult` | documented-major-removal-or-migration |
| `@aura3d/asset-index` | type-symbol | `WritableAssetIndex` | documented-major-removal-or-migration |
| `@aura3d/assets` | runtime-symbol | `createAssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | runtime-symbol | `createGLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `AssetBundleCacheEvictionPolicy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `AssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `AssetBundleCacheInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `AssetBundleManifestEvidenceEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFComputerVisionBoundingBox` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFObjectDetectionEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFObjectTrackEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFPoseEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFPoseKeypointEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFSceneAnalysisOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets` | type-symbol | `GLTFSemanticSegment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | runtime-symbol | `createAssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | runtime-symbol | `createGLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `AssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `AssetBundleCacheInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `AssetBundleManifestEvidenceEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFObjectDetectionEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFObjectTrackEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFPoseEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFPoseKeypointEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/assets/browser` | type-symbol | `GLTFSceneAnalysisOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | runtime-symbol | `sampleAdaptiveMusicFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | runtime-symbol | `sampleAudioEffectsAnalysisFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | runtime-symbol | `sampleAudioEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AdaptiveMusicCrossfadeCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AdaptiveMusicFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AdaptiveMusicFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AdaptiveMusicFixtureState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AdaptiveMusicLayerMix` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioChorusPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioCompressorPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioDelayPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioDistortionCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioEffectsAnalysisFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioEffectsAnalysisFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioEnvironmentFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioEqBandFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioOcclusionLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/audio` | type-symbol | `AudioSpectrumBandFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor` | package | `@aura3d/editor` | documented-prd15-6-honest-packages-deleted |
| `@aura3d/editor-runtime` | runtime-symbol | `sampleLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorAccessibilityElementSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorAccessibilityRole` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocaleDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocaleDirection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocalizedStringSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorPluralCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `addCameraKeyframe` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `alignDialogueToAudio` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `analyzeAudioVisemes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `analyzeRgbaFrameMotionRegions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | runtime-symbol | `angleDelta` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animation` | documented-major-removal-or-migration |
| `@aura3d/engine` | runtime-symbol | `animationDirector` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationEmotionPoseLibrary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationEpisodePackageSchemaVersion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationGestureLibrary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationMotionQualitySchemaVersion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationPerformanceCuesAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `animationRouteProofSchemaVersion` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `animationStudio` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `applyCameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `applyGameCombatEventsToRuntime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `applyManualVisemeEdits` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `applyShotPlaybackFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `applyVisemeMorphInfluences` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `asAuraAppHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `assetEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `AssetLibraryBrowser` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `audioStemsFromManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `AURA_NORMALIZED_MODEL_MAX_DIMENSION` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `AURA_PRIMITIVE_AXES` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `auraAnimationRetargetDocumentedConstraints` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `auraAnimationRuntimeMitigationContract` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `auraProductionBoundsProbes` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `AuraRuntimeError` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `blendPerformancePoses` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `bodyLanguageLibrary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `boundsFromAsset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `boundsFromSize` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `boundsHeight` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `boundsMaxDimension` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `boundsSize` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `buildFfmpegArgs` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `calculateRuntimeNodeBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `cameraInstructionFromSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `cameraKeyframeFromPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `cameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `cameraPresetLibrary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `captionAnimationRenderOutputKinds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `captionCueFileSafeText` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captionCuesForShot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `captionsToSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captionsToVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captureAuraScreenshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `certifyPublicPlatformerGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `certifyPublicPlatformerPresentation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `certifyPublicRacingGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `certifyPublicRacingPresentation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `characterAssemblyPart` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `collectAnimationRenderPackageOutputs` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `collectAssetEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `collectAuraLazySystemEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `collectCharacterAssemblyAssets` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `collectGameAssetEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `collectGameRuntimeEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `collectGameSceneRuntimeNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `containsPoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationAssetManifestReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createAnimationDirectorPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationEpisodePackageManifest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationMaterialStyle` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | runtime-symbol | `createAnimationMotionQualityReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createAnimationPerformance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationRenderPreset` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | runtime-symbol | `createAnimationRenderQueue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationRenderReviewPackagePaths` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAnimationRouteProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createAnimationVisualQualityReport` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | runtime-symbol | `createAssetEvidenceReport` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `createAudioDrivenVisemeTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createAudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createAudioWaveformData` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAuraAssetLoadError` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAuraGameRules` | documented-prd15-6.1-collapse-name-deleted-with-4.0-stub-removal |
| `@aura3d/engine` | runtime-symbol | `createAuraGameRuntime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAuraVoiceDubRerenderProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createAuraVoiceMasterClock` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createAuraVoiceRerenderPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createBatchEpisodeRenderPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createBrowserFrameCaptureAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createCameraChoreography` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createCameraPathEditorState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createCharacterAssemblyPlan` | relocated-to-@aura3d/cli |
| `@aura3d/engine` | runtime-symbol | `createCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createCloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createCombatWorld` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createDialogueAnimationPerformance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createDialogueTimingReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createDialogueTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createEmbeddedGLBAnimationClipRegistryMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createEpisodeStructure` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createExternalPhonemeAnalyzerAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createFfmpegFrameEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createFrameEncoder` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAccessibilityFocus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAccessibilityLabel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAccessibilityRuntimeSettings` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAssetBoundPlatformerLevel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAssetBoundRacingRoute` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameAssetReadinessManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createGameAssetValidationIssue` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createGameBoxCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameCameraDirector` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameCapsuleCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameColliderDebugGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameCombatDebugGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameDebugOverlayData` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameDebugSceneNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameEffects` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameFallingBlocksKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHighContrastSource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHitboxDebugGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudBindings` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudComboBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudDebugToggleBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudHealthBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudMeterBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudRoundBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameHudTimerBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameInputReplay` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameInputReplayDriver` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameInspector` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameJumpAssist` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameKinematicBody` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameLocomotionKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameLoopPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePauseControlsSource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerCameraRig` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerCheckpointNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerFinishNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerGroundMeshNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerHazardNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerPlatformMeshNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerPresentationCamera` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerPresentationSurfaceNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerSceneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePlatformerSurfaceQuery` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePublicPlatformerPresentationNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGamePublicRacingPresentationNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingCameraRig` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingCheckpointGateNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingPresentationCamera` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingPresentationTrackNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingRoadMeshNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingSceneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingStartFinishNodes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRacingSurfaceQuery` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameRectCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameReducedFlashSource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameReducedMotionSource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameSceneBridge` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameSimulation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameSphereCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createGameTouchControlLayout` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createInMemoryFrameEncoderAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createMediaRecorderFrameEncoderAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPerformanceCaptureSession` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPerformanceTransitionPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPngSequenceEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPrimaryGameAssetValidationPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createProgressSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPromptAnimationAccessibilityProofMetadata` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createPromptAnimationEpisodePlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPromptAnimationEpisodeReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createPromptAnimationIssue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPromptAnimationStoryBible` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPromptEpisodePlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createPublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPublishPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createQuaterniusGameReadyFighterValidationPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `createRenderProgressTracker` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createRuntimeNodeEffectAttachment` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createRuntimeNodeImportedAssetEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `createRuntimeNodeSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createSceneSequencer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createSceneSequencerPlayback` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createShotCompositionGuide` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createShotTimeline` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createShotTimelineDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createShotTransitionDescriptor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createShotTransitionPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createSourceTestGLBAnimationSwitchHarness` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createThumbnailArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createThumbnailGenerationPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createVideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createVideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createVisemeController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createVisemeTimelineTrack` | documented-prd15-6.6-root-deprecated-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createWaveformVisualization` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createWebCodecsFrameEncoderAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createWorldLabelLayer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `createYouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `defaultAnimationEvidenceTargets` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `defaultAnimationMotionQualityThresholds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defaultAnimationRenderOutputs` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defaultAnimationViewport` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defaultContainerForCodec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defaultFrameEncoderMimeType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineAnimationAssetManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `defineAnimationDirectorPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineAnimationPerformance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineAnimationRenderQueue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineAssetEvidenceReport` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `defineAudioStemManifest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineAuraVoiceVisemes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineCaptionTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineCharacterAssemblyPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineDialogueTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineGameAssetReadinessManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `definePromptAnimationEpisode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `definePromptAnimationEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `definePromptAnimationStoryBible` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `definePromptAnimationStoryboard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `definePromptEpisodePlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `defineShotTimeline` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `deriveCaptionTrackFromDialogue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `dialogueLineAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `distanceOutsideBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `distanceToBoundsSurface` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `distributeAroundBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `drawWaveformToCanvas` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `Engine` | relocated-to-@aura3d/core |
| `@aura3d/engine` | runtime-symbol | `episodeTemplate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `episodeTemplates` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `evaluateAssetEvidencePublishReadiness` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `evaluateGameAssetAnimationClips` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `evaluateGameAssetBounds` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `evaluateGameAssetOrientation` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `evaluateShotComposition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackFile` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `fighterRuntimeNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `fighting` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `fightingGameAnimationRoles` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `flattenEpisodeShotRefs` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `flatVehicleSurface` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `formatCaptionTimestamp` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `FrameLoop` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `GAME_FALLING_BLOCK_PIECES` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `gameAssetBoundsFromSize` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `gameAssetValidationContractVersion` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `gameColliderAabb` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `gameColliders` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `gameInputReplayEventsAt` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `GameInspector` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `gameKits` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `gameRules` | documented-prd15-6.1-collapse-name-deleted-with-4.0-stub-removal |
| `@aura3d/engine` | runtime-symbol | `generateThumbnailArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `generateYouTubeMetadata` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `getCameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `getShotAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `getShotTimelineCaptureTimes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `groundedAssetPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `groundedPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `groundedYOffset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `groundProbe` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `isAuraAppHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `isAuraGameModelAssetRef` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `isOrthographicCameraMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `lazySystems` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `lineSafeCaptionText` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `markAuraLazySystemLoaded` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `markAuraLazySystemRequested` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `measureFlatRegionFraction` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `measurePlatformerGeometry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `mergeAudioVisemeFrames` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `moveCameraKeyframe` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `ndcToScreen` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `neon` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizeAudioStemInput` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `normalizedRenderScaleForTargetHeight` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizedRenderScaleForTargetMaxDimension` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizedScaleForTargetHeight` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizedScaleForTargetMaxDimension` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizePromptAnimationTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `normalizeRenderCaptureTimes` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `parsePerformanceScriptCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `performance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `PerformanceCaptureRecordingSession` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `PerformancePoseEditor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `placedBoundsFromWorldBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `primitiveMouthCardForViseme` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `probeCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `probeExternalPhonemeAnalyzer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `probeFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `probeMediaRecorderFrameEncoder` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `probeWebCodecsFrameEncoder` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `probeYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `projectWorldLabels` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `projectWorldPoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationChildSafeDefaults` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationContractCompatibilityAdapters` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `promptAnimationContractVersion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationDriftFrames` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationFrameAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationLegacyContractVersion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptAnimationTimeAtFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `promptSubjectIsResolved` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `raycastPhysicsWorld` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `raycastSceneTargets` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `raycastSceneTargetsAll` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `removeCameraKeyframe` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `requiredAnimationEpisodePackageRoles` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `requiredAnimationRenderPackageOutputKinds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveAnimationEmotionPose` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveAnimationGesture` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveBodyLanguageGesture` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveChaseFramingFromBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveLabelCollisions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolvePromptAnimationContractCompatibility` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `resolvePromptPlanSubject` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveSubjectPlacementFacts` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveSubjectRenderedSize` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `resolveSubjectRenderedSizeFromBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `routeWithFrameTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `runGameSimulation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `runtimeNodeHasTag` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `sampleAnimationCharacterPerformance` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sampleCameraChoreography` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sampleCameraPathEditorPreview` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sampleSceneSequencer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sampleShotTransition` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sampleVisemeTimelineTrack` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `sceneKitPerformanceBudget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `sceneQueryTargets` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `sceneStructureAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `shotDuration` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `shotReverseShotCameraPaths` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `shotTimeline` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `sphereCastPhysicsWorld` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `sphereCastSceneTargets` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `storyboard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `supportsFrameEncoderCodec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationAssetManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `validateAnimationEpisodePackage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationMotionQuality` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationPerformance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationRenderOutputPackageMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationRenderOutputs` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationRenderQueue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAnimationRouteProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `validateAudioStemManifest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceAssetCoverage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceAudioCoverage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceBridgeContractIds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceDubMap` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceTimingDrift` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateAuraVoiceVisemeCoverage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateCaptionTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateCharacterAssemblyPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateDialogueTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateEpisodeStructure` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateGameAssetReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `validatePerformanceCaptureCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validatePrimaryGameAsset` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `validatePromptAnimationArtifactContract` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validatePromptAnimationEpisodeReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | runtime-symbol | `validatePromptAnimationStableIds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validatePublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `validateShotTimeline` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateSpacing` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateVisemeTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | runtime-symbol | `validateYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `visemeSampleToMorphInfluences` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `waveformPeakAtTime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnalyzeAudioVisemesOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnchorOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationAssetManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationAssetManifestEntry` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationAssetManifestKind` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationAssetManifestReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationAssetProfile` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationCharacterPerformanceState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationClipEvent` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationClipEventInvocation` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationClipEventUnsubscribe` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationDirectorAssetSlot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorBeatInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorCharacterInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorDialogueInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorLocationInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorMotionRequirement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorPropInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationDirectorReviewGate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEmotionPose` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEpisodePackageFile` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEpisodePackageFileRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEpisodePackageManifest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEpisodePackageStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationEpisodePackageValidationReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationEvidenceTarget` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AnimationFacialBrow` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationFacialEyeShape` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationFacialMouthShape` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationFrameVisualInput` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationFrameVisualQuality` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationGazeMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationGesture` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationLoopMode` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationMaterialStyle` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationMaterialStyleOptions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationMotionFrameRegionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AnimationMotionFrameSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AnimationMotionQualityReport` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationMotionQualityStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationMotionQualityThresholds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationMotionRegionKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationMotionSegmentInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationMotionSegmentKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationMotionSegmentReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceAction` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceBlockingState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceBodyState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceCoverage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceFacialState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceGazeState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformanceGestureState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPerformancePosture` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationPlaybackDirection` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationPose` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationPoseTransform` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationQuaternion` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationRenderOutput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderOutputKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderOutputPackageMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderOutputTarget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderPackageOutputs` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderPresetEvidence` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationRenderPresetOptions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationRenderQueueArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderQueueItem` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderReviewPackagePaths` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRenderSceneStateSource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationRootMotion` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationRouteProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofAsset` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofCaption` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofGesture` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofPlaybackState` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofRenderState` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofShot` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofStatus` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteProofViseme` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationRouteReadinessCheck` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AnimationShowBibleBatch` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationThumbnailSceneStateCapture` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationTrack` | documented-2.0-animation-track-relocated-to-@aura3d/animation |
| `@aura3d/engine` | type-symbol | `AnimationVector3` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `AnimationViewport` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AnimationVisualQualityOptions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `AnimationVisualQualityReport` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `ApplyShotPlaybackFrameOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ArchitectureFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ArchitectureKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ArchitectureKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ArchitectureSpace` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AssetEvidenceAssetSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AssetEvidenceReport` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AssetEvidenceRouteUsage` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AssetEvidenceScreenshot` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AssetGroundedPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AssetLibraryAssetDetail` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AssetLibraryBrowserFilter` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AssetLibraryBrowserSnapshot` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AssetLibraryEditorReference` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AssetLibraryMarketplaceSnapshot` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AssetLibraryMarketplaceSource` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerCodec` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerContainer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerInputStem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxPlanTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioStem` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AudioStemManifestArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AudioStemRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AudioVisemeAnalysis` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AudioVisemeAnalysisFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AudioWaveformData` | relocated-to-@aura3d/engine/audio |
| `@aura3d/engine` | type-symbol | `AudioWaveformPeak` | relocated-to-@aura3d/engine/audio |
| `@aura3d/engine` | type-symbol | `AuraAnimationAssetMetadataLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationBoneMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationBoneMetadataInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipEventSourceKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipEventSourceMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipLoopEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipPlaybackState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationClipSampleContext` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraAnimationControllerClipEventInvocation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationControllerEventMap` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationControllerOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationControllerSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationCrossFadeEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationCrossFadeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationDiagnostic` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationDiagnosticSeverity` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationDiagnosticsOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationFadeState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationImportedRuntimeApplySnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationImportedRuntimeClipSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraAnimationImportedRuntimeLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationLayerBodyMask` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationLayerMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationLayerRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationPlaybackStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationPlayOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationPoseCaptureOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationPoseSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRetargetBindingMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRetargetConstraint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRetargetConstraintCode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRetargetSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRootMotionMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRuntimeClipSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraAnimationRuntimeNodeBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRuntimeNodeBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationRuntimeNodeBindingSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationScrubEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationScrubOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationSkeletonMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAnimationStopOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppFrameCallback` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppNodeRegistryLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppRuntimeState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAppScreenshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAssetLoadState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAssetMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAssetProvenance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraAssetType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraBackend` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraBoundsSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCameraFrameAssetOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCameraMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterClip` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterClipName` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterConstraintCorrectionSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterFootPlantingSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterJoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterJointName` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterPose` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterRigSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterRootMotionSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterSkeleton` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterStyle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterVisualQAGap` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCharacterVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraChartTheme` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraChartVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityBlockOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityBrowserRuntimeState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityCameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityDayNightToggleOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityInstancingPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityStateChangeEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraCityStateController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCityVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCompiledPromptPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraCreateAppRendererOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraDataBars3DPrefabOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraDiagnosticsOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEditableMaterialParameters` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEffectType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEmbeddedGLBClipMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEmbeddedGLBClipRegistryMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEnvironmentMapPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraEnvironmentNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraExternalHumanoidAnimationLibraryBindingMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraFrameCallback` | relocated-to-@aura3d/react |
| `@aura3d/engine` | type-symbol | `AuraFrameInfo` | relocated-to-@aura3d/react |
| `@aura3d/engine` | type-symbol | `AuraGameInputActionState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameInputAxisBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameInputController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameInputPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameInputReplayEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameInputSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameLoopPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameRules` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameRuntime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGameRuntimeEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraGameRuntimeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraGroupNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraHelperBudgetId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraHelperPerformanceBudget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraHumanoidBoneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraHumanoidBoneMap` | relocated-to-@aura3d/animation/lanes |
| `@aura3d/engine` | type-symbol | `AuraInteractionNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraInteractionSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraLabelNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraLazySystemEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraLightType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialCapabilityDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialCapabilityFeature` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialCapabilityFeatureId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialCapabilityInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialCapabilitySupport` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialInspectorPanel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialInspectorParameter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialTextureInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMaterialVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMiniGolfMetrics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMiniGolfPointerPoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMiniGolfShotInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraMiniGolfStateController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraModelFormat` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraModelNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraModelRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraModelScaleMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraNeonPalettePreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraNeonTunnelOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraNeonVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraNodePhysicsSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraParticleBudgetDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraParticleMaterialMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPhysicsDebugSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPhysicsSceneSummary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPhysicsShapeKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPhysicsStepOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPhysicsWorldController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerCheckpointOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerFinishOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerHazardOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerPresentationCertificationInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerPresentationSurfaceOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerPublicSurfaceMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPlatformerSurfaceMeshOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPoseBakedFallbackMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPoseBakedFallbackRuntimeMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPrimitiveHumanoidPrefabOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPrimitiveOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProceduralHumanMeshDescriptor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProceduralHumanMeshPart` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProceduralHumanMeshPartName` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProceduralTextureKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProceduralTextureSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProductDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProductPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProductStageStyle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProductViewerOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraProductVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptCameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptEffectId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptIntentSubject` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptInteractionMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptLightingPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptPlanReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AuraPromptPlanSubject` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptResolvedSubject` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptSceneType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPromptSubjectResolver` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPublicPlatformerPresentationOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraPublicRacingPresentationOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRacingCheckpointGateOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRacingPresentationCertificationInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRacingPresentationTrackOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRacingRoadMeshOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRacingStartFinishOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRegisteredAnimationClip` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRendererColorManagementPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRendererDiagnosticReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AuraRendererFallbackMode` | documented-major-removal-or-migration |
| `@aura3d/engine` | type-symbol | `AuraRendererMode` | documented-major-removal-or-migration |
| `@aura3d/engine` | type-symbol | `AuraRendererQualityPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRendererQualityProfile` | documented-major-removal-or-migration |
| `@aura3d/engine` | type-symbol | `AuraRendererQualityProfileId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeAnimationBindingMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeAnimationPoseBindingMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeEffectAttachment` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeEffectKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeImportedAssetDiagnostic` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeImportedAssetEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeImportedAssetEvidenceInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeRegistry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeNodeSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraRuntimeState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneCategory` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraSceneExposurePreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitBudgetDefaults` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitBundleBudget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitCustomizeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitDrawCallBudget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitFpsBudget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitInstancingEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraSceneKitInstancingFamilyEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraSceneKitLazyLoadingEntry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitLazyLoadingPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitLazySystemId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSceneKitLodEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraSceneKitPerformanceDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraScreenshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSolarPlanetMaterialPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSolarSystemPrefabOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSolarVisualQAResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSourceTestGLBAnimationClipId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSourceTestGLBAnimationSwitchHarnessOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSourceTestGLBAnimationSwitchHarnessResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraSourceTestGLBAnimationSwitchStep` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraTextureFormat` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraTimelineSpec` | relocated-to-@aura3d/react |
| `@aura3d/engine` | type-symbol | `AuraVoiceBridgeArtifacts` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceBridgeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceBridgePackage` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceDubRerenderProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `AuraVoiceMasterClock` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoicePlaybackSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `AuraVoiceRerenderPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceVisemeCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceVisemeFormat` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceVisemeId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `AuraVoiceVisemeTrack` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BatchEpisodeDefinition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BatchEpisodeRenderJob` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BatchEpisodeRenderPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BoundsAnchor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BrowserFrameCaptureAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BrowserFrameCapturePageLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BrowserFrameCaptureRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `BrowserFrameCaptureResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraChoreographyArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraKeyframe` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraPathEditorState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraPathInterpolation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraPathMarker` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CameraSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `CaptionCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CaptionExportArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CaptionExportFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CaptionTimingProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CaptionTimingProofLine` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CaptionTrackArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyAttachmentRule` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyGameplayIntent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyMaterialOverride` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyPalette` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyPart` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyPartInput` | relocated-to-@aura3d/cli |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyPartRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblySocket` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyTransform` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CharacterAssemblyValidationPolicy` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ChaseFraming` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ChaseFramingIntent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CinematicFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CinematicKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CinematicKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CinematicShot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CityBlockTimeOfDay` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CityDataLayer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CityDistrict` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderCapabilityStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderProvider` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CollectAssetEvidenceInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `CollectPromptAnimationEvidenceInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `CombatAiConfig` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatAiDecision` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatAiObservation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatFrameCheck` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatFrameLimits` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatFrameReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CombatMoveRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CombatMoveRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ConfiguratorCameraPreset` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ConfiguratorFinish` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ConfiguratorPart` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ConfiguratorVariant` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateAnimationEpisodePackageManifestInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateAnimationMotionQualityReportInput` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CreateAnimationRenderOutputPackageMetadataOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateAnimationRenderQueueOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateAnimationRouteProofInput` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CreateAudioMuxerOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateAudioWaveformDataOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateBrowserFrameCaptureAdapterOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateCharacterAssemblyPlanInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateCloudRenderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateEpisodeStructureInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateExternalPhonemeAnalyzerAdapterOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateFfmpegFrameEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateFrameEncoderOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateGameAssetReadinessManifestOptions` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `CreateMediaRecorderFrameEncoderAdapterOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreatePngSequenceEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreatePublishingPackageOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateRenderProgressTrackerOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateVideoExportPipelineOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateWebCodecsFrameEncoderAdapterOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `CreateYouTubeUploadAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `DialogueAlignmentCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DialogueAlignmentReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `DialogueDeliveryDirection` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DialogueEmotion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DialogueLine` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DialogueTimingReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `DialogueTrackArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DialogueWordTiming` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DigitalTwinFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DigitalTwinKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DigitalTwinKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DistributedPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DistributionOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DriverAggression` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DriverConfig` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DriverInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DriverRoutePoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DriverTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `DriverVehicleState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DubMapArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `DubMapEntry` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EncodedVideoArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EncodedVideoChunk` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeActStructure` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeSceneStructure` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeShotRef` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeStructure` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeStructureArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeStructureMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeTemplate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `EpisodeTemplateId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAlignment` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerProvider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeAnalyzerStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ExternalPhonemeTiming` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FfmpegCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegFileSystem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegFrameInputFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegRunResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FightingActorState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FightingControls` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FightingGameKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FightingGameKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FightingStageOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FocusCameraIntent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FocusIndicator` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FocusInvariantReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `FocusOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FocusTarget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FocusTargetBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoder` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderAdapter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderCodec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderContainer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderOutputMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameEncoderStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `FrameMotionRegion` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `FrameMotionRegionMetrics` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAabb` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityFocusOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityLabelOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityPauseControlsOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityPreferenceOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityRuntimeSettings` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilityRuntimeSettingsOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilitySource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAccessibilitySourceKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAppRuntime` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAppRuntimeEvidence` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAppRuntimeLoopOptions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAppRuntimeOptions` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAppRuntimeResize` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAppRuntimeStatus` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `GameAssetAnimationClipReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetAnimationEvent` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetAnimationPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetAnimationRole` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetApprovalStatus` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetAxis` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetBoundPlatformerLevel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBoundPlatformerLevelBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBoundPlatformerLevelOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBoundRacingRoute` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBoundRacingRouteBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBoundRacingRouteOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAssetBounds` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetBoundsPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetBoundsSource` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetClipRequirement` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetIntendedUse` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetMaterialReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetModelFormat` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetOrientation` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetOrientationPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetProvenance` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetReadinessManifest` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetSkeletonReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetTextureReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetThumbnail` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetUsageKind` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationCheck` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationContractVersion` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationIssue` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationPolicy` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationSeverity` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAssetValidationStatus` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameAudioBusDefinition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAudioBusId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAudioCueDefinition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAudioCueEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameAudioEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameBounds3` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameBoxCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameBoxColliderOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCameraDirector` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCameraDirectorOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCameraSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCameraTarget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCapsuleCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCapsuleColliderOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderAxis` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderBase` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderDimension` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderFactoryOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameColliderPlane` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionAddBodyOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionBodyHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionBodyOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionBodySnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionBox` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionContact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionParticipant` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionQueryFilter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionSweepHit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionSweepOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionWorld` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCollisionWorldSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatActiveAttackSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatActorOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatActorSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatEventRuntimeBridgeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatEventRuntimeBridgeResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameCombatEventType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameControlBindingResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameControlBindingSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugGeometryNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugGeometryOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugGeometryPrimitive` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugOverlayData` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugOverlayMetric` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugOverlayOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugOverlaySection` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugSceneNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugSceneNodeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameDebugScenePrimitive` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEffectAttachment` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEffectInstance` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEffectKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEffectOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEffectsSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventLog` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventLogOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventLogSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventRecord` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameEventSeverity` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlockActivePiece` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlockBoard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlockCell` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlockPiece` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlockRotation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlocksKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameFallingBlocksOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudActorBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudBindingKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudComboBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudDebugToggleBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudEventLogBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudObjectiveBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudResolvedValue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudRoundBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudScoreBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudSnapshotItem` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudSnapshotOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudSourceKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudTimerBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudValueBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameHudValueFormat` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputActionState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputAxisBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputAxisSettings` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputReplayDriver` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputReplayDriverSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputReplayOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInputSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInspectorRuntimeInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameInspectorSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameJumpAssistController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameJumpAssistOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameJumpAssistSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameJumpAssistUpdate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameKinematicBody` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameKinematicBodyOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameKinematicBodySnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameKitVec2` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionClipMap` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionEventInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLocomotionState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameLoopPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamepadSnapshot` | relocated-to-@aura3d/engine/input |
| `@aura3d/engine` | type-symbol | `GamePlatformerCheckpoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerCollectible` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerEventType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerGroundContact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerHazard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerLevel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerMovingPlatform` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerPlayerState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GamePlatformerPresentationCameraOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerSceneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerSceneBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerSurfaceQuery` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePlatformerWorldAssetBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePointerSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GamePrimaryAssetRole` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `GameRacingCameraRigOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingCameraSelectionEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameRacingCameraSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingEvent` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingEventType` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingPresentationCameraOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingRoute` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSceneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSceneBindingOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingScenePose` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSceneSpeedModel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSpeedModel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSurfaceContact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRacingSurfaceQuery` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRectCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRectColliderOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRuntimeEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameRuntimeEvidenceApp` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameRuntimeEvidenceOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameRuntimeSourceEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameRuntimeSubsystemId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameRuntimeSubsystemOwnership` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneBridge` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneBridgeApp` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneBridgeBodyLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneBridgeEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `GameSceneBridgeNodeHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameScenePresentationCameraSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneRuntimeNode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSceneTransform` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulationFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulationOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulationResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulationStepContext` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSimulationStepResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSphereCollider` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSphereColliderOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameSubsystemOwner` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlAnchor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlLayout` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlLayoutOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlRegion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameTouchControlRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GameVec3` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GlbVisemeBlendshapeExample` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GroundedPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `GroundedPlacementOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `HelperPlacementClaim` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `HoldControlBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `InstallShotPlaybackOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `KitCapabilityReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `LabelVec3` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LabelViewport` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LayeredSceneComposition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LayeredSceneCompositionSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyCameraChoreography` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyEpisodeAct` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyEpisodeScene` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyEpisodeShotReference` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyEpisodeStructureInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacySceneSequencer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacySceneSequencerSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `LegacyShotTransitionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `MediaRecorderFrameEncoderCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `MuxedVideoArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `OffscreenPolicy` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceBlendResult` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCapturePermissionState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureRecordingSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureRecordingSessionOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureRecordingSessionSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureRecordingSessionStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureSignal` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceCaptureSourceKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformancePoseEditorSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceScriptCue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceTransitionPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PerformanceTransitionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PhysicsQueryWorld` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlacedBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerCompositionPresetOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerGeometryFacts` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerMotionCheck` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerMotionReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PlatformerMotionRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerMotionSolution` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PlatformerPlatformLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PngSequenceFrameArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PrimitiveMouthCard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PrimitiveMouthExample` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PrimitiveMouthVisemeCueInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ProductConfiguratorFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ProductConfiguratorKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ProductConfiguratorKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ProductConfiguratorState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ProjectedLabel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationAccessibilityEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationAccessibilityProofMetadata` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationAccessibilityProofStatus` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationArtifactBase` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationArtifactKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationArtifactMetadataEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationAssetMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationAssetStatusEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationAudioEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationCaptionAccessibilityProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationCharacter` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationCharacterRig` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationCharacterRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationConsumedAuraVoiceArtifactMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationContractCompatibilityResult` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationContractVersion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationCoverageEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationDeterministicCaptureEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationDeterministicCaptureSummary` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationEpisodePlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationEpisodePlanInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationEpisodeReadiness` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationEvidenceArtifact` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationEvidenceStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationFrameRate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationHighContrastAccessibilityProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationIssueSeverity` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationLanguageCode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationLocation` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationMotionMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationMouthFallback` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationProductionMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationProp` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationPropRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationPublishTarget` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationReadinessStatus` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationReducedMotionAccessibilityProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PromptAnimationRenderedArtifactMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationRenderedArtifactRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationRenderOutputMode` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationResolution` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationReviewStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationRouteHealthEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationRuntimeSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationSafetyMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationScreenshotEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationScreenshotFixtureMetadata` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationSeconds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationShotListItem` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStoryBible` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStoryBibleInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStoryboard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStoryboardScene` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStoryboardShot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationStyleGuide` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationTimingDriftEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationTrackEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `PromptAnimationValidationIssue` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PromptAnimationYouTubeDraftMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameAssetCertification` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameBounds2` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameGeometryCategory` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameGeometryCertification` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameGeometrySource` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicGameRetainedProof` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `PublicPlatformerCheckpoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicPlatformerGeometryContract` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicPlatformerHazard` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicPlatformerSurface` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicRacingGeometryCheckpoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicRacingGeometryContract` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublicRacingGeometryPoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `PublishingPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishingReadinessCheck` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishingReadinessReport` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PulseControlBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `QuaterniusGameReadyFighterSourceFamily` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `QuaterniusGameReadyFighterValidationContract` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `RadialPlacementOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RegionFittedSize` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RegionFittedSizeOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RegisteredAnimationClip` | relocated-to-@aura3d/engine/animation |
| `@aura3d/engine` | type-symbol | `RenderGroundedAssetPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RenderGroundedPlacementOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RenderProgressAdvanceInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RenderProgressSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RenderProgressStatus` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RenderProgressTracker` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ResolvedAnchor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ResolvedSemanticRegion` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RunFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `RuntimeNodeAnimationSpecLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RuntimeNodeBoundsInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RuntimeNodeMorphTargetWeights` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `RuntimeNodeVec3` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneAssetBoundsMetadata` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneAssetLike` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneBounds` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneCompositionLayerReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `SceneCompositionPropKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneDepthLayerRole` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneDepthLayerSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ScenePropPlacement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneProtectedZone` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneSequencer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneSequencerPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneSequencerPlaybackController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneSequencerPlaybackSnapshot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SceneSequencerSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `SceneSequencerSceneBinding` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotBlockingAction` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCameraInstruction` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCameraMove` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCharacterBlocking` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCompositionGuide` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCompositionOverlay` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCompositionReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `ShotCompositionRule` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotCompositionRuleOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotHoldTrimInstruction` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackCharacterMouthState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackFramePlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackNodeUpdate` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackPlanInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackRuntimeApp` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPlaybackRuntimeNodeHandle` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotPropBlocking` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotSubjectFrameBox` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTimelineArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTimelineDiagnostics` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTimelineInput` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTimelineShot` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTransition` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTransitionDescriptor` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTransitionKind` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTransitionPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ShotTransitionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `SkyBackdropBand` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SkyBackdropPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SkyBackdropSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SmartCityFrame` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SmartCityKit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SmartCityKitOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SpatialInvariantReport` | relocated-to-@aura3d/engine/devtools |
| `@aura3d/engine` | type-symbol | `SubjectFitRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SubjectPlacementFacts` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SubjectPlacementRequest` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `SubjectRenderedSize` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ThumbnailArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ThumbnailCaptureRuntime` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `ThumbnailGenerationPlan` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `TouchControlElement` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `TouchControlHost` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `TwinAlarm` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `TwinEquipment` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `Vec3` | documented-prd15-6.1-root-collapse-remains-on-deprecated-subpath |
| `@aura3d/engine` | type-symbol | `VehicleChassisSpec` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VehicleChassisTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `VehiclePlanarState` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VehicleSurfaceSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `VehicleWheelId` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VehicleWheelPose` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VideoExportFrameCapture` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportOutputSummary` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportReadinessMode` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportRuntime` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VisemeController` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VisemeSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | type-symbol | `VisemeTimelineManualEdit` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `VisemeTimelineTrackArtifact` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WaveformDrawOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WaveformVisualization` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WaveformVisualizerOptions` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WaveformVisualizerPeak` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WaveformVisualizerPoint` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WebCodecsFrameEncoderCapability` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WipeDirection` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WorldLabel` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WorldLabelLayer` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `WorldLabelLayerHost` | documented-prd15-6.6-root-drop-to-deleted |
| `@aura3d/engine` | type-symbol | `YouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadAdapterStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadReadiness` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `YouTubeUploadStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/animation` | runtime-symbol | `sampleMotionMatchingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | runtime-symbol | `sampleSecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `MotionMatchingCandidateScore` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `MotionMatchingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `MotionMatchingFixtureSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `MotionMatchingPoseCandidate` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `MotionMatchingTrajectorySample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `SecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `SecondaryAnimationFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation` | type-symbol | `SpringBoneSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./animation/browser` | documented-major-removal-or-migration |
| `@aura3d/engine/assets` | runtime-symbol | `createAssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | runtime-symbol | `createGLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `AssetBundleCacheEvictionPolicy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `AssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `AssetBundleCacheInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `AssetBundleManifestEvidenceEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFComputerVisionBoundingBox` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFObjectDetectionEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFObjectTrackEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFPoseEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFPoseKeypointEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFSceneAnalysisOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets` | type-symbol | `GLTFSemanticSegment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./assets/advanced-gallery` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./assets/asset-corpus` | documented-major-removal-or-migration |
| `@aura3d/engine/assets/browser` | runtime-symbol | `createAssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | runtime-symbol | `createGLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `AssetBundleCacheEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `AssetBundleCacheInput` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `AssetBundleManifestEvidenceEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFObjectDetectionEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFObjectTrackEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFPoseEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFPoseKeypointEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFSceneAnalysisEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/assets/browser` | type-symbol | `GLTFSceneAnalysisOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./assets/production-runtime` | documented-major-removal-or-migration |
| `@aura3d/engine/audio` | runtime-symbol | `sampleAdaptiveMusicFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | runtime-symbol | `sampleAudioEffectsAnalysisFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | runtime-symbol | `sampleAudioEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AdaptiveMusicCrossfadeCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AdaptiveMusicFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AdaptiveMusicFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AdaptiveMusicFixtureState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AdaptiveMusicLayerMix` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioChorusPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioCompressorPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioDelayPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioDistortionCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioEffectsAnalysisFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioEffectsAnalysisFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioEnvironmentFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioEqBandFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioOcclusionLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/audio` | type-symbol | `AudioSpectrumBandFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./core` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./create-aura3d` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./debug` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./editor` | documented-major-removal-or-migration |
| `@aura3d/engine/editor-runtime` | runtime-symbol | `sampleLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorAccessibilityElementSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorAccessibilityRole` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocaleDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocaleDirection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocalizedStringSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorPluralCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./engine` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./engine-runtime` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./environments` | documented-major-removal-or-migration |
| `@aura3d/engine/input` | runtime-symbol | `CameraRig` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `createSceneCameraControlAdapter` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `DEFAULT_ORBIT_MAX_POLAR` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `EditorFlyControls` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `FirstPersonControls` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `OrbitControls` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `PointerLockControls` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | runtime-symbol | `sampleGestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `sampleInputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `sampleXRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `ThirdPersonFollowControls` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `CameraRigState` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `CameraTransformLike` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `EditorFlyControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `EulerLike` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `FirstPersonControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsGestureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsPatternName` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `InputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `OrbitControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `SceneCameraControlAdapter` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `ThirdPersonFollowControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/engine/input` | type-symbol | `Vec3Like` | relocated-to-@aura3d/audio |
| `@aura3d/engine/input` | type-symbol | `XRFixtureLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRFixtureSessionMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./materials` | documented-major-removal-or-migration |
| `@aura3d/engine/physics` | runtime-symbol | `arriveSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `blendSteeringForces` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `buildNativeNarrowPhaseContact` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `CharacterController` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `CrowdSimulation` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `evadeSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `fleeSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `flockingSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `NavigationAgent` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `NavigationGrid` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `obstacleAvoidanceSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `pursuitSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleArcadeVehicleDynamics` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleClothSimulationFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleFireSmokeFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleFluidFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleFractureFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `samplePhysicsSandboxFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `samplePlatformerControllerFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `sampleSoftBodyFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `seekSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `SteeringAgent` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `wallAvoidanceSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | runtime-symbol | `wanderSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ArcadeVehicleDynamicsInput` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ArcadeVehicleDynamicsSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CharacterControllerDescriptor` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CharacterControllerMoveInput` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CharacterControllerState` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ClothSampleParticle` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ClothSimulationFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ClothSimulationFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdFormationOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdFormationType` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdSimulationOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `CrowdSimulationSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FireSmokeFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FireSmokeFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FireSmokeHotCellSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FlockingNeighbor` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FlockingSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FluidFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FluidFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FluidParticleSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FractureFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FractureFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `FractureFragmentSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NativeNarrowPhaseContact` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationCell` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationGridOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationPath` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationPathStatus` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `NavigationPoint` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `ObstacleAvoidanceSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxSpawnerPreset` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxSpawnSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxTool` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PhysicsSandboxToolSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerAnimationState` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerCollectibleKind` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerCollectibleSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerControllerFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerPlatformKind` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PlatformerPlatformSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `PredictiveSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SoftBodyFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SoftBodyFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SoftBodySampleVertex` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringBlendMode` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringObstacle` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringPipelineEntry` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringPipelineResult` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringPoint` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringVector` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `SteeringWall` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `WallAvoidanceSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine/physics` | type-symbol | `WanderSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/engine` | export-subpath | `./product-studio` | documented-major-removal-or-migration |
| `@aura3d/engine/rendering` | runtime-symbol | `AdvancedRenderer` | documented-4.0-advanced-renderer-alias-removed-use-renderer |
| `@aura3d/engine/rendering` | runtime-symbol | `BloomPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `BVHThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ColorGradingPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createProductionEffectsRenderSource` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatBaseFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatDemoFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatVfxDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `DepthOfFieldPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `diagnoseThreeCompatShader` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `EffectComposerThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `estimateThreeCompatAcceleratedRaycast` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `evaluateExternalParityTransmission` | documented-prd04-p4-transmission-pass-moved-to-test-oracles |
| `@aura3d/engine/rendering` | runtime-symbol | `FXAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `GPUPointCloudThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `InstancingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `LineThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `LODSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `MotionBlurPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `NodeMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `OutlinePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ParticleSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `RawShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `RenderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `runThreeCompatFrustumCulling` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `runThreeCompatOcclusionCulling` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleColorGradient` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleCullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleSizeCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleSpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleVoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleWeatherFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SHADER_CHUNKS_THREE_COMPAT` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ShaderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SMAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SpriteSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SSAOPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `summarizeProductionEffectsProof` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering` | runtime-symbol | `summarizeThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TextureStreamingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `THREE_COMPAT_REQUIRED_RENDERER_FEATURES` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TrailThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `UniformsThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `VignettePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `WebGPUDevice` | relocated-to-@aura3d/rendering/webgpu |
| `@aura3d/engine/rendering` | runtime-symbol | `WebGPUPipelineCache` | relocated-to-@aura3d/rendering/webgpu |
| `@aura3d/engine/rendering` | type-symbol | `AdvancedRendererOptions` | documented-4.0-advanced-renderer-alias-removed-use-renderer |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalInteriorLight` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingPresetId` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalRgb` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalVector3` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CinematicEvidenceSource` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CinematicRendererEvidenceAccepted` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingBvhTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFeatureEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixtureObject` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFrustumTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingHiZTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ExternalParityTransmissionResult` | documented-prd04-p4-transmission-pass-moved-to-test-oracles |
| `@aura3d/engine/rendering` | type-symbol | `ExternalParityTransmissionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ForceSampler` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ProductionEffectsOptions` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering` | type-symbol | `ProductionEffectsSummary` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering` | type-symbol | `RuntimeParityFrameRenderResult` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering` | type-symbol | `SpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatBaseFrameOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatBvhNode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatCullingResult` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatInstancingSystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatLightDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatLightKind` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatLineSegment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatMaterialMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatParticle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatPostProcessFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatPostProcessPass` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererBackend` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererFeatureStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRendererSupportState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatRenderTargetDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatSceneRenderPlan` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatShaderDiagnostic` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatShaderNode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatShadowSystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatSprite` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatTextureCapability` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatTransparencySystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ThreeCompatUniformValue` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `VoxelFixtureBlockType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `VoxelFixtureLod` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `VoxelFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `VoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `WeatherFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `WeatherFixtureSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `WeatherFixtureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./rendering/advanced-runtime` | documented-major-removal-or-migration |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `adaptGLTFMaterial` | documented-prd04-e34-gltf-material-adapter-stub-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `adaptGLTFPBRMaterial` | documented-prd04-e34-gltf-material-adapter-stub-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `compilePBRMaterial` | documented-prd04-e34-gltf-material-adapter-stub-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `createProductionEffectsRenderSource` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `createProductionRuntimeRenderer` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `summarizeProductionEffectsProof` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGL2Buffer` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGL2Capabilities` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGL2RenderTarget` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGL2Shader` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGL2Texture` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPUBuffer` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPUCapabilities` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPURendererBackend` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPURenderTarget` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPUShader` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | runtime-symbol | `WebGPUTexture` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `CompiledMaterialProgram` | documented-prd04-e34-gltf-material-adapter-stub-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `GLTFMaterialLike` | documented-prd04-e34-gltf-material-adapter-stub-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `ProductionEffectsOptions` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `ProductionEffectsSummary` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `RuntimeParityFrameRenderResult` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGL2BufferDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGL2CapabilitiesDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGL2RenderTargetDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGL2ShaderDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGL2TextureDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPUBufferDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPUCapabilitiesDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPURendererBackendOptions` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPURenderTargetDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPUShaderDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine/rendering/production-runtime` | type-symbol | `WebGPUTextureDescriptor` | documented-prd11-webgpu-freeze-backend-facade-removal |
| `@aura3d/engine` | export-subpath | `./scene-kits/humanoid-walk` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./scene-kits/particle-fountain` | documented-major-removal-or-migration |
| `@aura3d/engine` | export-subpath | `./scene-kits/product-viewer` | documented-major-removal-or-migration |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleAdaptiveDifficultyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleAnalyticsPrivacyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleCloudServiceFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleCulturalBehaviorFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleLearningAgentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleNetworkReplicationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `samplePlayerBehaviorTelemetryFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | runtime-symbol | `sampleProceduralContentAdaptationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveAiStrategy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyAdjustment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyChangeType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyMetricSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyMetricType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyStrategy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AdaptiveDifficultyTriggeredRule` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AnalyticsConsentCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AnalyticsPrivacyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AnalyticsPrivacyFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `AnalyticsProviderMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CloudFixtureServiceStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CloudServiceFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CloudServiceFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalBehaviorFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalBehaviorFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalCommunicationStyle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalEntityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalPersonalSpace` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CulturalRelationship` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `CultureDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `GeneratedContentDifficulty` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `GeneratedContentTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `GeneratedContentType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `LearningAgentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `LearningAgentFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkDeltaSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkEntityState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkInputFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkInterestSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkInterpolationSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkPredictionSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkReplicationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkReplicationFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `NetworkReplicationMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerBehaviorPatternTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerBehaviorTelemetryFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerBehaviorTelemetryOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerEngagementLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerEventCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerEventSeverity` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerPlaystyle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerSkillAssessmentTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `PlayerSkillLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `ProceduralContentAdaptationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `ProceduralContentAdaptationOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/scripting` | type-symbol | `ProxemicZone` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | export-subpath | `./three-compat` | broken-1.5.2-root-alias-replaced-by-@aura3d/three-compat |
| `@aura3d/engine` | export-subpath | `./workflows/production-runtime` | documented-major-removal-or-migration |
| `@aura3d/environments` | package | `@aura3d/environments` | documented-prd15-6-honest-packages-deleted |
| `@aura3d/input` | runtime-symbol | `CameraRig` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `createSceneCameraControlAdapter` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `DEFAULT_ORBIT_MAX_POLAR` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `EditorFlyControls` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `FirstPersonControls` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `OrbitControls` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `PointerLockControls` | relocated-to-@aura3d/controls |
| `@aura3d/input` | runtime-symbol | `sampleGestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `sampleInputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `sampleXRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `ThirdPersonFollowControls` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `CameraRigState` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `CameraTransformLike` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `EditorFlyControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `EulerLike` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `FirstPersonControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `GestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsGestureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsPatternName` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `InputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `OrbitControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `SceneCameraControlAdapter` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `ThirdPersonFollowControlsOptions` | relocated-to-@aura3d/controls |
| `@aura3d/input` | type-symbol | `Vec3Like` | relocated-to-@aura3d/audio |
| `@aura3d/input` | type-symbol | `XRFixtureLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRFixtureSessionMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/materials` | package | `@aura3d/materials` | documented-prd15-6-honest-packages-deleted |
| `@aura3d/physics` | runtime-symbol | `arriveSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `blendSteeringForces` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `buildNativeNarrowPhaseContact` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `CharacterController` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `CrowdSimulation` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `evadeSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `fleeSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `flockingSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `NavigationAgent` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `NavigationGrid` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `obstacleAvoidanceSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `pursuitSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleArcadeVehicleDynamics` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleClothSimulationFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleFireSmokeFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleFluidFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleFractureFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `samplePhysicsSandboxFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `samplePlatformerControllerFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `sampleSoftBodyFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `seekSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `SteeringAgent` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `wallAvoidanceSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | runtime-symbol | `wanderSteering` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ArcadeVehicleDynamicsInput` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ArcadeVehicleDynamicsSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CharacterControllerDescriptor` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CharacterControllerMoveInput` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CharacterControllerState` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ClothSampleParticle` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ClothSimulationFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ClothSimulationFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdFormationOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdFormationType` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdSimulationOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `CrowdSimulationSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FireSmokeFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FireSmokeFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FireSmokeHotCellSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FlockingNeighbor` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FlockingSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FluidFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FluidFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FluidParticleSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FractureFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FractureFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `FractureFragmentSample` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NativeNarrowPhaseContact` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationCell` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationGridOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationPath` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationPathStatus` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `NavigationPoint` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `ObstacleAvoidanceSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxSpawnerPreset` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxSpawnSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxTool` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PhysicsSandboxToolSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerAnimationState` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerCollectibleKind` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerCollectibleSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerControllerFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerPlatformKind` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PlatformerPlatformSummary` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `PredictiveSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SoftBodyFixture` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SoftBodyFixtureOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SoftBodySampleVertex` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringAgentOptions` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringAgentSnapshot` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringBlendMode` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringObstacle` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringPipelineEntry` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringPipelineResult` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringPoint` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringVector` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `SteeringWall` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `WallAvoidanceSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/physics` | type-symbol | `WanderSteeringForce` | documented-2.0-physics-navigation-owner-removal |
| `@aura3d/rendering` | runtime-symbol | `AdvancedRenderer` | documented-4.0-advanced-renderer-alias-removed-use-renderer |
| `@aura3d/rendering` | runtime-symbol | `BloomPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `BVHThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ColorGradingPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createProductionEffectsRenderSource` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatBaseFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatDemoFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatVfxDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `DepthOfFieldPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `diagnoseThreeCompatShader` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `EffectComposerThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `estimateThreeCompatAcceleratedRaycast` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `evaluateExternalParityTransmission` | documented-prd04-p4-transmission-pass-moved-to-test-oracles |
| `@aura3d/rendering` | runtime-symbol | `FXAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `GPUPointCloudThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `InstancingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `LineThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `LODSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `MotionBlurPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `NodeMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `OutlinePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ParticleSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `RawShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `RenderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `runThreeCompatFrustumCulling` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `runThreeCompatOcclusionCulling` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleColorGradient` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleCullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleSizeCurve` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleSpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleVoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleWeatherFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SHADER_CHUNKS_THREE_COMPAT` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ShaderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SMAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SpriteSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SSAOPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `summarizeProductionEffectsProof` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/rendering` | runtime-symbol | `summarizeThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TextureStreamingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `THREE_COMPAT_REQUIRED_RENDERER_FEATURES` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TrailThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `UniformsThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `VignettePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `WebGPUDevice` | relocated-to-@aura3d/rendering/webgpu |
| `@aura3d/rendering` | runtime-symbol | `WebGPUPipelineCache` | relocated-to-@aura3d/rendering/webgpu |
| `@aura3d/rendering` | type-symbol | `AdvancedRendererOptions` | documented-4.0-advanced-renderer-alias-removed-use-renderer |
| `@aura3d/rendering` | type-symbol | `ArchitecturalInteriorLight` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingPresetId` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalRgb` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalVector3` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CinematicEvidenceSource` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CinematicRendererEvidenceAccepted` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingBvhTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFeatureEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixtureObject` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFrustumTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingHiZTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ExternalParityTransmissionResult` | documented-prd04-p4-transmission-pass-moved-to-test-oracles |
| `@aura3d/rendering` | type-symbol | `ExternalParityTransmissionSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ForceSampler` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ProductionEffectsOptions` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/rendering` | type-symbol | `ProductionEffectsSummary` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/rendering` | type-symbol | `RuntimeParityFrameRenderResult` | documented-prd15-t2-t4-production-effects-and-parity-contracts-deleted |
| `@aura3d/rendering` | type-symbol | `SpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatBaseFrameOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatBvhNode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatCullingResult` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatInstancingSystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatLightDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatLightKind` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatLineSegment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatMaterialMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatParticle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatPostProcessFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatPostProcessPass` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererBackend` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererFeatureStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRendererSupportState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatRenderTargetDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatSceneRenderPlan` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatShaderDiagnostic` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatShaderNode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatShadowSystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatSprite` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatTextureCapability` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatTransparencySystemStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ThreeCompatUniformValue` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `VoxelFixtureBlockType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `VoxelFixtureLod` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `VoxelFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `VoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `WeatherFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `WeatherFixtureSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `WeatherFixtureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleAdaptiveDifficultyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleAnalyticsPrivacyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleCloudServiceFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleCulturalBehaviorFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleLearningAgentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleNetworkReplicationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `samplePlayerBehaviorTelemetryFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | runtime-symbol | `sampleProceduralContentAdaptationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveAiStrategy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyAdjustment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyChangeType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyMetricSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyMetricType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyStrategy` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AdaptiveDifficultyTriggeredRule` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AnalyticsConsentCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AnalyticsPrivacyFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AnalyticsPrivacyFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `AnalyticsProviderMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CloudFixtureServiceStatus` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CloudServiceFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CloudServiceFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalBehaviorFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalBehaviorFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalCommunicationStyle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalEntityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalPersonalSpace` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CulturalRelationship` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `CultureDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `GeneratedContentDifficulty` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `GeneratedContentTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `GeneratedContentType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `LearningAgentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `LearningAgentFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkDeltaSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkEntityState` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkInputFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkInterestSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkInterpolationSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkPredictionSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkReplicationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkReplicationFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `NetworkReplicationMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerBehaviorPatternTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerBehaviorTelemetryFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerBehaviorTelemetryOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerEngagementLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerEventCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerEventSeverity` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerPlaystyle` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerSkillAssessmentTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `PlayerSkillLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `ProceduralContentAdaptationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `ProceduralContentAdaptationOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/scripting` | type-symbol | `ProxemicZone` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | package | `@aura3d/three-compat` | documented-major-removal-or-migration |
| `create-aura3d` | scaffold-template | `three-compat-architecture-interior` | documented-q13-4-template-rename-to-architecture-interior |
| `create-aura3d` | scaffold-template | `three-compat-asset-inspector` | documented-q13-4-template-rename-to-asset-inspector |
| `create-aura3d` | scaffold-template | `three-compat-character-viewer` | documented-q13-4-template-rename-to-character-viewer |
| `create-aura3d` | scaffold-template | `three-compat-custom-threejs-migration` | documented-q13-4-template-rename-to-custom-scene |
| `create-aura3d` | scaffold-template | `three-compat-large-scene` | documented-q13-4-template-rename-to-large-scene |
| `create-aura3d` | scaffold-template | `three-compat-material-authoring` | documented-q13-4-template-rename-to-material-authoring |
| `create-aura3d` | scaffold-template | `three-compat-postprocess-scene` | documented-q13-4-template-rename-to-postprocess-scene |
| `create-aura3d` | scaffold-template | `three-compat-premium-product-viewer` | documented-q13-4-template-rename-to-premium-product-viewer |

## Retained declaration-contract changes

The JSON receipt contains the normalized before/after declaration contract for every retained symbol whose public signature changed. These are classified as reviewed 2.0 major-version contract changes; they are not hidden as compatible aliases.

- `@aura3d/animation:runtime:AnimationAction` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:runtime:AnimationLayer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:runtime:AnimationMixer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:runtime:eventsBetween` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:runtime:SceneAnimationBridge` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:AnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:AnimationPose` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:AnimationTarget` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:FootLegInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:HumanoidBoneRetargetBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:HumanoidRetargetingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:LocomotionKitOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:SceneAnimationNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:SpringChain` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:SpringChainOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:SpringRootTransform` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:TrackValueType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/asset-index:type:AuraAssetFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/asset-index:type:AuraCanonicalAsset` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:GLTFSceneAnimationRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:HDRLoader` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:HDRLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:LoadContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:renderStateForGLTFMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:resolveGLTFClipName` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:TextureLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:transcodeKTX2BasisTexture` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFMeshoptDecoderModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFRenderResourceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFRenderResources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFSceneAnimationApplyResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFSceneAnimationClipBindingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFSceneAnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:GLTFSceneAnimationRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:KTX2BasisTargetFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:KTX2BasisTextureTranscoderOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:type:ProductionGLTFRenderPipelineOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:runtime:GLTFSceneAnimationRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:runtime:LoadContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:runtime:resolveGLTFClipName` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFMeshoptDecoderModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFRenderResourceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFRenderResources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFSceneAnimationApplyResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFSceneAnimationClipBindingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFSceneAnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:GLTFSceneAnimationRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:type:ProductionGLTFRenderPipelineOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioBus` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioFileManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioListener` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:SpatialAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:type:AudioContextLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:type:SpatialAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:runtime:initAgentFiles` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AddAssetOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AnimationAssetValidationOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AnimationAssetValidationReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AssetInspectionReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAnimationClipInspection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetEntry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetManifest` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetProvenance` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetRole` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliResolveCandidateProvenance` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:DragControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:FlyControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:InteractionControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:MapControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:OrbitControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:SelectionManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:TrackballControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:runtime:TransformControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:type:ControlPickMetadata` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/controls:type:OrbitCameraLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:AuraNodeBuilder` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:AuraSceneBuilder` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:compilePromptPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:createAuraRouteHealthSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:validatePlatformerMotion` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraApp` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraAssetDefinition` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraCameraSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraCreateAppOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraEffectNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraLightNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraMaterialSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraModelOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraPrimitiveNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraRuntimeNodeHandle` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraSceneNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraSceneSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraTransformSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:FrameLoopOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:FrameLoopSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameInputController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingKit` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:SceneQueryTarget` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:A3DRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:DirectionalLight` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Group` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:InstancedMesh` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:InstancedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Material` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Mesh` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Object3D` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:OrthographicCamera` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:PBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:PerspectiveCamera` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:PointLight` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Renderable` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:Scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:SceneNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:SkinnedLitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:SkinnedMesh` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:SpotLight` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:TextureBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:TexturedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:TexturedUnlitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:runtime:UnlitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:A3DRendererOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:CameraLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:MeshOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:Object3DOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RenderableDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RendererOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RenderMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/advanced-runtime:type:RenderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:runtime:AnimationAction` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:runtime:AnimationLayer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:runtime:AnimationMixer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:runtime:eventsBetween` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:runtime:SceneAnimationBridge` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:AnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:AnimationPose` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:AnimationTarget` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:FootLegInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:HumanoidBoneRetargetBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:HumanoidRetargetingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:LocomotionKitOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:SceneAnimationNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:SpringChain` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:SpringChainOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:SpringRootTransform` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:TrackValueType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:GLTFSceneAnimationRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:HDRLoader` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:HDRLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:LoadContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:renderStateForGLTFMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:resolveGLTFClipName` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:TextureLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:transcodeKTX2BasisTexture` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFMeshoptDecoderModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFRenderResourceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFRenderResources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFSceneAnimationApplyResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFSceneAnimationClipBindingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFSceneAnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:GLTFSceneAnimationRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:KTX2BasisTargetFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:KTX2BasisTextureTranscoderOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:type:ProductionGLTFRenderPipelineOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:runtime:GLTFSceneAnimationRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:runtime:LoadContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:runtime:resolveGLTFClipName` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFMeshoptDecoderModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFRenderResourceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFRenderResources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFSceneAnimationApplyResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFSceneAnimationClipBindingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFSceneAnimationMixerOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:GLTFSceneAnimationRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:type:ProductionGLTFRenderPipelineOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioBus` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioFileManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioListener` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:SpatialAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:type:AudioContextLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:type:SpatialAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:DragControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:FlyControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:InteractionControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:MapControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:OrbitControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:SelectionManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:TrackballControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:runtime:TransformControls` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:type:ControlPickMetadata` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/controls:type:OrbitCameraLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:runtime:ActionMap` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:runtime:WebXRSessionController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRFrameLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRInputSourceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRSessionLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:PointerEventLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:WebXRFrameSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Box3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:CatmullRomCurve3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Color` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:CubicBezierCurve3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Euler` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Frustum` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Matrix3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Matrix4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Plane` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Ray` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:SeededRandom` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Sphere` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Vector2` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:runtime:Vector3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:type:CurveSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/math:type:EulerOrder` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:Constraint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:FightingCharacterController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:lengthVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:PhysicsDebugDraw` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:PhysicsWorld` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:RigidBody` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:scaleVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:ConstraintDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:ConstraintType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:DebugLine` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsBackendSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsContinuousCollisionSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsWorldDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:RaycastOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:runtime:A3DRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:A3DFrameRenderResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntimeEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:SideViewGameRenderPresetOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorTintOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorTransformOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:CollisionModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ColorModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:createClusteredForwardLighting` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:createExternalParityEnvironmentLighting` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:createExternalParityShadowDebugViews` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:IndexBuffer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:InstancedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Material` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:MaterialBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:MockRenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:NormalMappedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:PBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:planMorphTargets` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ProductionWebGPURenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:RenderPipeline` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Sampler` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ShaderLibrary` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:SizeModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:SkinnedLitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Texture` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:TextureBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:TexturedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:TrailModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:UnlitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:VertexFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:WebGL2Device` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:WebGL2StateCache` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:WebGPUParticleBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:BloomOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CameraLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CapsuleGeometryOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ClusteredForwardLightingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CollectedLight` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CompiledShaderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CylinderGeometryOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:DepthCompare` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:DepthPassOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:EnvironmentBackgroundOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:EnvironmentLightingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:EnvironmentStageOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ForwardEnvironmentFogOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ForwardPassOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ForwardShadowMapOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:FXAAOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:GPUParticleBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:GPUParticleUpdateInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:GPUParticleUpdateResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:InstancedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:LayeredParticleBudgetPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:LightingRigPreset` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:MaterialDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:MaterialUniformDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:MorphPlanDecision` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:MotionBlurOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ParticleModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ParticleRenderOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ParticleSprite` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ParticleSystemStats` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:PBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ProductionRendererInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ProductionRenderProof` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ReflectionSurface` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ReflectionSurfaceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderBackendOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostProcessOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostprocessPassDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostProcessPassPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostprocessPlanContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostprocessPlanDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererPostprocessPlanOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RendererShadowOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderQueueSortItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderState` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderTarget` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderTargetDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:SamplerDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ShaderChunk` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ShaderSourcePair` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ShaderSources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:SkinningPaletteBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:SkinningPaletteDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:SSROptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:StaticBatchInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:TextureCompressedFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:TextureDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:TextureDimension` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:TexturedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ToneMappingOperator` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:UnlitMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VertexAttributeSemantic` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VolumetricLightOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VoxelBlockDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VoxelVisibleBlock` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGL2DeviceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGL2StateCacheSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGPUDeviceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGPUParticleBackendOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGPUQueueLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:DepthPrepass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:FrameGraph` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:OpaquePass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ProductionWebGPURenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ShadowPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:SkyboxPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ToneMappingPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:TransparentPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:WebGL2StateCache` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:ProductionRendererInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:ProductionRenderProof` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:RenderPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:RenderPassExecutionContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:WebGL2StateCacheSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:addVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:cloneMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:composeMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:decomposeMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:extractFrustumPlanes` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:invertMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:Layers` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:lengthVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:multiplyMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:normalizeQuat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:normalizeVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:scaleVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:Scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:SceneNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:subVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:toMathMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:toMathQuat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:toMathVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:transformPoint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scripting:type:VisualGraphExecutionContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scripting:type:VisualNodeCategory` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:runtime:ActionMap` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:runtime:WebXRSessionController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRFrameLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRInputSourceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRSessionLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:PointerEventLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:WebXRFrameSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Box3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:CatmullRomCurve3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Color` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:CubicBezierCurve3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Euler` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Frustum` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Matrix3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Matrix4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Plane` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Ray` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:SeededRandom` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Sphere` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Vector2` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:runtime:Vector3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:type:CurveSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/math:type:EulerOrder` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:Constraint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:FightingCharacterController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:lengthVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:PhysicsDebugDraw` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:PhysicsWorld` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:RigidBody` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:scaleVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:ConstraintDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:ConstraintType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:DebugLine` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:PhysicsBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:PhysicsBackendSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:PhysicsContinuousCollisionSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:PhysicsWorldDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:type:RaycastOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/react:runtime:Model` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/react:type:AuraCanvasProps` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/react:type:ModelProps` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:CollisionModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ColorModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:createClusteredForwardLighting` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:createExternalParityEnvironmentLighting` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:createExternalParityShadowDebugViews` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:IndexBuffer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:InstancedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:Material` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:MaterialBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:MockRenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:NormalMappedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:PBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:planMorphTargets` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ProductionWebGPURenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:RenderPipeline` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:Sampler` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ShaderLibrary` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:SizeModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:SkinnedLitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:Texture` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:TextureBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:TexturedPBRMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:TrailModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:UnlitMaterial` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:VertexFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:WebGL2Device` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:WebGL2StateCache` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:WebGPUParticleBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:BloomOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CameraLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CapsuleGeometryOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ClusteredForwardLightingDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CollectedLight` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CompiledShaderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CylinderGeometryOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:DepthCompare` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:DepthPassOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:EnvironmentBackgroundOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:EnvironmentLightingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:EnvironmentStageOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ForwardEnvironmentFogOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ForwardPassOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ForwardShadowMapOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:FXAAOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:GPUParticleBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:GPUParticleUpdateInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:GPUParticleUpdateResult` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:InstancedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:LayeredParticleBudgetPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:LightingRigPreset` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:MaterialDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:MaterialUniformDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:MorphPlanDecision` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:MotionBlurOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ParticleModule` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ParticleRenderOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ParticleSprite` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ParticleSystemStats` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:PBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ProductionRendererInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ProductionRenderProof` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ReflectionSurface` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ReflectionSurfaceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderBackendOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostProcessOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostprocessPassDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostProcessPassPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostprocessPlanContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostprocessPlanDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererPostprocessPlanOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RendererShadowOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderQueueSortItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderState` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderTarget` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderTargetDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:SamplerDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ShaderChunk` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ShaderSourcePair` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ShaderSources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:SkinningPaletteBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:SkinningPaletteDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:SSROptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:StaticBatchInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:TextureCompressedFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:TextureDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:TextureDimension` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:TexturedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ToneMappingOperator` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:UnlitMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VertexAttributeSemantic` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VolumetricLightOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VoxelBlockDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VoxelVisibleBlock` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGL2DeviceOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGL2StateCacheSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGPUDeviceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGPUParticleBackendOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGPUQueueLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:addVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:cloneMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:composeMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:decomposeMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:extractFrustumPlanes` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:invertMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:Layers` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:lengthVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:multiplyMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:normalizeQuat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:normalizeVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:scaleVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:Scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:SceneNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:subVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:toMathMat4` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:toMathQuat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:toMathVec3` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:transformPoint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scripting:type:VisualGraphExecutionContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scripting:type:VisualNodeCategory` — reviewed-2.0-public-declaration-contract-change
- `create-aura3d:type:CreateA3DProjectOptions` — reviewed-2.0-public-declaration-contract-change
- `create-aura3d:type:CreateA3DProjectResult` — reviewed-2.0-public-declaration-contract-change
- `create-aura3d:type:ShowcaseRacingTrackTopology` — reviewed-2.0-public-declaration-contract-change

## Schemas, CLI, scaffolds, and generated assets

Schema identifiers: 25 baseline, 33 current, 0 retired, 8 added. CLI command tokens and all scaffold names are retained in the JSON receipt. The generated asset manifest schema and emitted field sets are compared directly; intentional-2.0-generated-asset-shape-change.

The machine-readable, per-package and per-symbol inventory is retained in tests/reports/public-surface-diff.json.

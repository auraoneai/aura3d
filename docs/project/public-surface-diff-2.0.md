# Aura3D 2.0 Public-Surface Diff

Generated from `v1.5.2` and the current source tree. This audit covers every non-private package manifest, export subpath, recursively re-exported runtime/type symbol, CLI binary/command detected in source, and scaffold template name.

- Baseline packages: **26**; current packages: **29**
- Baseline export subpaths: **68**; current export subpaths: **88**
- Baseline symbols: **13007**; current symbols: **13686**
- Classified removals: **945**; unclassified removals: **0**
- Retained-symbol declaration contract changes: **293**
- Public schema identifiers: **25** baseline; **28** current
- Generated asset shape: **field-and-schema-compatible; 2.0 adds workload-aware @aura3d/lean import ownership**
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
| `@aura3d/editor-runtime` | runtime-symbol | `sampleLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorAccessibilityElementSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorAccessibilityRole` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocaleDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocaleDirection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorLocalizedStringSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/editor-runtime` | type-symbol | `EditorPluralCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine` | runtime-symbol | `audioStemsFromManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `buildFfmpegArgs` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captionCueFileSafeText` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captionsToSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `captionsToVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createAudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createAudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createCloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createFfmpegFrameEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPngSequenceEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createPublishPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createVideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createVideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createYouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `createYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackFile` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `exportCaptionTrackVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `formatCaptionTimestamp` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `generateYouTubeMetadata` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `normalizeAudioStemInput` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `probeCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `probeFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `probeYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `validatePublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | runtime-symbol | `validateYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerCodec` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerContainer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxerInputStem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `AudioMuxPlanTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CaptionExportArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CaptionExportFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderCapabilityStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderJobStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CloudRenderProvider` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateAudioMuxerOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateCloudRenderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateFfmpegFrameEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreatePngSequenceEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreatePublishingPackageOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateVideoExportPipelineOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `CreateYouTubeUploadAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegFileSystem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegFrameInputFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `FfmpegRunResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `MuxedVideoArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PngSequenceFrameArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishingPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishingReadinessCheck` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishingReadinessReport` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `PublishPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `RunFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportFrameCapture` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportOutputSummary` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportReadinessMode` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine` | type-symbol | `VideoExportRuntime` | relocated-to-@aura3d/engine/media-node |
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
| `@aura3d/engine/animation/browser` | runtime-symbol | `sampleMotionMatchingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | runtime-symbol | `sampleSecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `MotionMatchingCandidateScore` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `MotionMatchingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `MotionMatchingFixtureSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `MotionMatchingPoseCandidate` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `MotionMatchingTrajectorySample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `SecondaryAnimationFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `SecondaryAnimationFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/animation/browser` | type-symbol | `SpringBoneSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/engine/editor-runtime` | runtime-symbol | `sampleLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorAccessibilityElementSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorAccessibilityRole` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocaleDescriptor` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocaleDirection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocalizationAccessibilityFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorLocalizedStringSample` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/editor-runtime` | type-symbol | `EditorPluralCategory` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/engine` | runtime-symbol | `audioStemsFromManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `buildFfmpegArgs` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `captionCueFileSafeText` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `captionsToSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `captionsToVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createAudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createAudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createCloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createFfmpegFrameEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createPngSequenceEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createPngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createPublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createPublishPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createVideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createVideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createYouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `createYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `exportCaptionTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `exportCaptionTrackFile` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `exportCaptionTrackSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `exportCaptionTrackVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `formatCaptionTimestamp` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `generateYouTubeMetadata` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `normalizeAudioStemInput` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `probeCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `probeFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `probeYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `validatePublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | runtime-symbol | `validateYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxerAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxerCodec` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxerContainer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxerInputStem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `AudioMuxPlanTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CaptionExportArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CaptionExportFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderCapabilityStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderJobResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderJobStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CloudRenderProvider` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreateAudioMuxerOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreateCloudRenderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreateFfmpegFrameEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreatePngSequenceEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreatePublishingPackageOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreateVideoExportPipelineOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `CreateYouTubeUploadAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `FfmpegCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `FfmpegFileSystem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `FfmpegFrameInputFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `FfmpegRunResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `MuxedVideoArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PngSequenceFrameArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PublishingPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PublishingReadinessCheck` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PublishingReadinessReport` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `PublishPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `RunFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportFrameCapture` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportOutputSummary` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportReadinessMode` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `VideoExportRuntime` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadAdapterStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadReadiness` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine` | type-symbol | `YouTubeUploadStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `audioStemsFromManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `buildFfmpegArgs` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `captionCueFileSafeText` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `captionsToSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `captionsToVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createAudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createAudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createCloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createFfmpegFrameEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createPngSequenceEncoderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createPngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createPublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createPublishPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createVideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createVideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createYouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `createYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `exportCaptionTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `exportCaptionTrackFile` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `exportCaptionTrackSrt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `exportCaptionTrackVtt` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `formatCaptionTimestamp` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `generateYouTubeMetadata` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `normalizeAudioStemInput` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `probeCloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `probeFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `probeYouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `validatePublishingPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | runtime-symbol | `validateYouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxerAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxerCodec` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxerContainer` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxerInputStem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `AudioMuxPlanTrack` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CaptionExportArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CaptionExportFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderCapabilityStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderJobRequest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderJobResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderJobStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CloudRenderProvider` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreateAudioMuxerOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreateCloudRenderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreateFfmpegFrameEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreatePngSequenceEncoderAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreatePublishingPackageOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreateVideoExportPipelineOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `CreateYouTubeUploadAdapterOptions` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `FfmpegCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `FfmpegFileSystem` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `FfmpegFrameInputFormat` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `FfmpegRunResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `MuxedVideoArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PngSequenceFrameArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PngSequenceManifest` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PublishingPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PublishingReadinessCheck` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PublishingReadinessReport` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `PublishPackageArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `RunFfmpeg` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportFrameCapture` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportOutputSummary` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportPipeline` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportPlan` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportReadinessMode` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `VideoExportRuntime` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeMetadataArtifact` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadAdapter` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadAdapterStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadCapability` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadPackage` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadReadiness` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadResult` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/engine-runtime` | type-symbol | `YouTubeUploadStatus` | relocated-to-@aura3d/engine/media-node |
| `@aura3d/engine/environments` | runtime-symbol | `createProductionEnvironmentCorpusSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `createThreeCompatEnvironmentDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `createThreeCompatEnvironmentGalleryModel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `findThreeCompatEnvironmentPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `inspectProductionHDR` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `listThreeCompatEnvironmentPresets` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `loadProductionEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `loadThreeCompatEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `summarizeThreeCompatEnvironmentLibrary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | runtime-symbol | `verifyThreeCompatHdriFile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionEnvironmentCorpusSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionEnvironmentProbeType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionEnvironmentReadinessEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionEnvironmentRequirements` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionHDREnvironment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionHDRInspection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ProductionPMREMPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ThreeCompatEnvironmentLibrarySummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/environments` | type-symbol | `ThreeCompatEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `sampleGestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `sampleInputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | runtime-symbol | `sampleXRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsGestureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `GestureHapticsPatternName` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `InputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRFixtureLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRFixtureSessionMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/input` | type-symbol | `XRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/materials` | runtime-symbol | `summarizeThreeCompatMaterialLibrary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/materials` | type-symbol | `ThreeCompatMaterialLibrarySummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/engine/rendering` | runtime-symbol | `BloomPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `BVHThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ColorGradingPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatBaseFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatDemoFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `createThreeCompatVfxDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `DepthOfFieldPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `diagnoseThreeCompatShader` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `EffectComposerThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `estimateThreeCompatAcceleratedRaycast` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/engine/rendering` | runtime-symbol | `sampleCullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleSpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleVoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `sampleWeatherFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SHADER_CHUNKS_THREE_COMPAT` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ShaderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SMAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SpriteSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `SSAOPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `summarizeThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TextureStreamingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `THREE_COMPAT_REQUIRED_RENDERER_FEATURES` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `ThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `TrailThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `UniformsThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `VignettePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | runtime-symbol | `WebGPUDevice` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalInteriorLight` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightingPresetId` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalLightType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalRgb` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `ArchitecturalVector3` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingBvhTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFeatureEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixtureObject` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingFrustumTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/engine/rendering` | type-symbol | `CullingHiZTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/environments` | runtime-symbol | `createProductionEnvironmentCorpusSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `createThreeCompatEnvironmentDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `createThreeCompatEnvironmentGalleryModel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `findThreeCompatEnvironmentPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `inspectProductionHDR` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `listThreeCompatEnvironmentPresets` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `loadProductionEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `loadThreeCompatEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `summarizeThreeCompatEnvironmentLibrary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | runtime-symbol | `verifyThreeCompatHdriFile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionEnvironmentCorpusSummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionEnvironmentProbeType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionEnvironmentReadinessEntry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionEnvironmentRequirements` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionHDREnvironment` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionHDRInspection` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ProductionPMREMPreset` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ThreeCompatEnvironmentLibrarySummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/environments` | type-symbol | `ThreeCompatEnvironmentManifest` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `sampleGestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `sampleInputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | runtime-symbol | `sampleXRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsGestureType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `GestureHapticsPatternName` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `InputActionBindingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRFixtureLodLevel` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRFixtureSessionMode` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/input` | type-symbol | `XRRuntimeFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/materials` | runtime-symbol | `summarizeThreeCompatMaterialLibrary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/materials` | type-symbol | `ThreeCompatMaterialLibrarySummary` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/rendering` | runtime-symbol | `BloomPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `BVHThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ColorGradingPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatBaseFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatDemoFrame` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatRendererProfile` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `createThreeCompatVfxDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `DepthOfFieldPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `diagnoseThreeCompatShader` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `EffectComposerThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `estimateThreeCompatAcceleratedRaycast` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/rendering` | runtime-symbol | `sampleCullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleSpaceEnvironmentFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleVoxelWorldFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `sampleWeatherFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SHADER_CHUNKS_THREE_COMPAT` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ShaderMaterialThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ShaderPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SMAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SpriteSystemThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `SSAOPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `summarizeThreeCompatRendererDiagnostics` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TAAPassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TextureStreamingThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `THREE_COMPAT_REQUIRED_RENDERER_FEATURES` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `ThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `TrailThreeCompatRenderer` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `UniformsThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `VignettePassThreeCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | runtime-symbol | `WebGPUDevice` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalInteriorLight` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightingPresetId` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalLightType` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalMeasurementFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalRgb` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `ArchitecturalVector3` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingBvhTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFeatureEvidence` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixture` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixtureObject` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFixtureOptions` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingFrustumTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/rendering` | type-symbol | `CullingHiZTelemetry` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
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
| `@aura3d/three-compat` | runtime-symbol | `ColorGradingPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `CustomShaderMaterialCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `DepthOfFieldPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `diagnoseThreeCompatShader` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `EffectComposerCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `FXAAPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `NodeMaterialCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `OutlinePassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `RawShaderMaterialCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `RenderPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `SHADER_CHUNKS_THREE_COMPAT` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `ShaderPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `SMAAPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `SSAOPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `TAAPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `UniformsCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `UnrealBloomPassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | runtime-symbol | `VignettePassCompat` | documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge |
| `@aura3d/three-compat` | export-subpath | `./postprocessing` | non-rendering-compat-fabrication-removed-with-actionable-warning |

## Retained declaration-contract changes

The JSON receipt contains the normalized before/after declaration contract for every retained symbol whose public signature changed. These are classified as reviewed 2.0 major-version contract changes; they are not hidden as compatible aliases.

- `@aura3d/animation:type:HumanoidRetargetingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/animation:type:LocomotionKitOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:HDRLoader` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets:runtime:HDRLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/assets/browser:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioBus` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioFileManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/audio:runtime:AudioSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AddAssetOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetProvenance` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/cli:type:AuraCliAssetType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:projectWorldLabels` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:runtime:validatePlatformerMotion` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraApp` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraAssetMetadata` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraAssetType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraCityInstancingPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraCreateAppOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraEffectNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraEffectType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraEnvironmentNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraLightNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraLightType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraMaterialCapabilityFeatureId` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraMaterialSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraModelNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraModelOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraPrimitiveNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraPrimitiveOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:AuraRendererDiagnosticReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:DriverVehicleState` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAppRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAppRuntimeEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAppRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudioCueDefinition` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudioEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameCollisionBodyHandle` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerEventType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerHazard` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerLevel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GamePlatformerSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingKit` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingPresentationCameraOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingSceneBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingSurfaceContact` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:GameRacingSurfaceQuery` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:PlatformerMotionReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:PlatformerMotionRequest` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:PlatformerMotionSolution` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:ProjectedLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:VehicleChassisSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:VehicleSurfaceSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:WorldLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine:type:WorldLabelLayer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:HumanoidRetargetingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation:type:LocomotionKitOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation/browser:type:HumanoidRetargetingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/animation/browser:type:LocomotionKitOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:HDRLoader` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets:runtime:HDRLoaderThreeCompat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/assets/browser:runtime:GLTFSceneAnimationMixerBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioBus` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioFileManager` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/audio:runtime:AudioSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/create-aura3d:type:ShowcaseRacingTrackTopology` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:runtime:projectWorldLabels` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:runtime:validatePlatformerMotion` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraApp` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraAssetMetadata` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraAssetType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraCityInstancingPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraCreateAppOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraEffectNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraEffectType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraEnvironmentNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraLightNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraLightType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraMaterialCapabilityFeatureId` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraMaterialSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraModelNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraModelOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraPrimitiveNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraPrimitiveOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:AuraRendererDiagnosticReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:DriverVehicleState` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAppRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAppRuntimeEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAppRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAudioCueDefinition` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAudioEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameCollisionBodyHandle` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GamePlatformerEventType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GamePlatformerHazard` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GamePlatformerInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GamePlatformerLevel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GamePlatformerSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingKit` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingPresentationCameraOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingSceneBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingSurfaceContact` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:GameRacingSurfaceQuery` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:PlatformerMotionReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:PlatformerMotionRequest` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:PlatformerMotionSolution` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:ProjectedLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:VehicleChassisSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:VehicleSurfaceSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:WorldLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine:type:WorldLabelLayer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:runtime:projectWorldLabels` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:runtime:validatePlatformerMotion` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraApp` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraAssetMetadata` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraAssetType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraCityInstancingPlan` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraCreateAppOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraEffectNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraEffectType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraEnvironmentNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraLightNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraLightType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraMaterialCapabilityFeatureId` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraMaterialSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraModelNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraModelOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraPrimitiveNode` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraPrimitiveOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:AuraRendererDiagnosticReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:DriverVehicleState` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAppRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAppRuntimeEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAppRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAudio` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAudioCueDefinition` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAudioEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameAudioOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameCollisionBodyHandle` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GamePlatformerEventType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GamePlatformerHazard` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GamePlatformerInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GamePlatformerLevel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GamePlatformerSnapshot` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingKit` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingPresentationCameraOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingSceneBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingSurfaceContact` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:GameRacingSurfaceQuery` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:PlatformerMotionReport` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:PlatformerMotionRequest` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:PlatformerMotionSolution` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:ProjectedLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:VehicleChassisSpec` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:VehicleSurfaceSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:WorldLabel` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/engine-runtime:type:WorldLabelLayer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:runtime:ActionMap` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRFrameLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRInputSourceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:A3DXRSessionLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/input:type:WebXRFrameSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:Constraint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:FightingCharacterController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:PhysicsDebugDraw` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:PhysicsWorld` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:runtime:RigidBody` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:ConstraintDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:ConstraintType` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:DebugLine` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsBackend` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsBackendSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsContinuousCollisionSelection` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:PhysicsWorldDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/physics:type:RaycastOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntime` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntimeEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:GameAppRuntimeOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorEvidence` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/production-runtime:type:TypedGLBActorTintOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:planMorphTargets` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:ShaderLibrary` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:TextureBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:VertexFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:runtime:WebGL2Device` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:BloomOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:CompiledShaderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ForwardEnvironmentFogOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ForwardShadowMapOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:InstancedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:MorphPlanDecision` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:PBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ShaderSourcePair` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:ShaderSources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:StaticBatchInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:TexturedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VolumetricLightOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VoxelBlockDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:VoxelVisibleBlock` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering:type:WebGPUDeviceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:ForwardEnvironmentFogOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:ForwardShadowMapOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:LdrPostprocessPresentationOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:PBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:RenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/advanced-runtime:type:ShaderSources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:DepthPrepass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:OpaquePass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ShadowPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:SkyboxPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:ToneMappingPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:runtime:TransparentPass` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/rendering/production-runtime:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scene:runtime:Scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scripting:type:VisualGraphExecutionContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/engine/scripting:type:VisualNodeCategory` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:runtime:ActionMap` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRFrameLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRInputSourceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:A3DXRSessionLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/input:type:WebXRFrameSample` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:Constraint` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:FightingCharacterController` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:PhysicsDebugDraw` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:PhysicsWorld` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/physics:runtime:RigidBody` — reviewed-2.0-public-declaration-contract-change
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
- `@aura3d/rendering:runtime:Geometry` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:planMorphTargets` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ProductionRuntimeRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ProductionWebGL2Renderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:ShaderLibrary` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:TextureBinding` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:VertexFormat` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:runtime:WebGL2Device` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:BloomOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:CompiledShaderSource` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ForwardEnvironmentFogOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ForwardShadowMapOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:InstancedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:MorphPlanDecision` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:PBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ProductionProductionRenderer` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderDevice` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderDeviceDiagnostics` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:RenderItem` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ShaderSourcePair` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:ShaderSources` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:StaticBatchInput` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:TexturedPBRMaterialOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VolumetricLightOptions` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VoxelBlockDescriptor` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:VoxelVisibleBlock` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/rendering:type:WebGPUDeviceLike` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scene:runtime:Scene` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scripting:type:VisualGraphExecutionContext` — reviewed-2.0-public-declaration-contract-change
- `@aura3d/scripting:type:VisualNodeCategory` — reviewed-2.0-public-declaration-contract-change
- `create-aura3d:type:ShowcaseRacingTrackTopology` — reviewed-2.0-public-declaration-contract-change

## Schemas, CLI, scaffolds, and generated assets

Schema identifiers: 25 baseline, 28 current, 0 retired, 3 added. CLI command tokens and all scaffold names are retained in the JSON receipt. The generated asset manifest schema and emitted field sets are compared directly; field-and-schema-compatible; 2.0 adds workload-aware @aura3d/lean import ownership.

The machine-readable, per-package and per-symbol inventory is retained in `tests/reports/public-surface-diff.json`.

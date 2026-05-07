# Galileo3D Public API Reference

This file is generated from every non-private package entrypoint under `packages/*/src/index.ts`.
It documents the public export surface that package consumers can import today.

Regenerate and verify it with:

```sh
pnpm verify:api-docs
```

## Packages

| Package | Version | Entrypoint | Export declarations |
|---|---:|---|---:|
| `@galileo3d/animation` | `0.0.0-rebuild` | `packages/animation/src/index.ts` | 15 |
| `@galileo3d/assets` | `0.0.0-rebuild` | `packages/assets/src/index.ts` | 46 |
| `@galileo3d/audio` | `0.0.0-rebuild` | `packages/audio/src/index.ts` | 18 |
| `@galileo3d/core` | `0.0.0-rebuild` | `packages/core/src/index.ts` | 13 |
| `@galileo3d/debug` | `0.0.0-rebuild` | `packages/debug/src/index.ts` | 26 |
| `@galileo3d/ecs` | `0.0.0-rebuild` | `packages/ecs/src/index.ts` | 18 |
| `@galileo3d/editor` | `0.0.0-rebuild` | `packages/editor/src/index.ts` | 1 |
| `@galileo3d/editor-runtime` | `0.0.0-rebuild` | `packages/editor-runtime/src/index.ts` | 34 |
| `@galileo3d/input` | `0.0.0-rebuild` | `packages/input/src/index.ts` | 31 |
| `@galileo3d/math` | `0.0.0-rebuild` | `packages/math/src/index.ts` | 16 |
| `@galileo3d/physics` | `0.0.0-rebuild` | `packages/physics/src/index.ts` | 11 |
| `@galileo3d/rendering` | `0.0.0-rebuild` | `packages/rendering/src/index.ts` | 102 |
| `@galileo3d/scene` | `0.0.0-rebuild` | `packages/scene/src/index.ts` | 16 |
| `@galileo3d/scripting` | `0.0.0-rebuild` | `packages/scripting/src/index.ts` | 15 |

## @galileo3d/animation

- Version: `0.0.0-rebuild`
- Package manifest: `packages/animation/package.json`
- Public entrypoint: `packages/animation/src/index.ts`

### Export Declarations

```ts
export * from "./Keyframe.js";
export * from "./AnimationTrack.js";
export * from "./AnimationClip.js";
export * from "./AnimationEvents.js";
export * from "./AnimationAction.js";
export * from "./AnimationMixer.js";
export * from "./AnimationLayer.js";
export * from "./Bone.js";
export * from "./Skeleton.js";
export * from "./Skinning.js";
export * from "./BlendTree.js";
export * from "./AnimationStateMachine.js";
export * from "./RootMotion.js";
export * from "./SceneAnimationBridge.js";
export * from "./ECSAnimationBridge.js";
```

## @galileo3d/assets

- Version: `0.0.0-rebuild`
- Package manifest: `packages/assets/package.json`
- Public entrypoint: `packages/assets/src/index.ts`

### Export Declarations

```ts
export { AssetCache } from "./AssetCache";
export type { AssetCacheSnapshot } from "./AssetCache";
export { AssetDependencyGraph } from "./AssetDependencyGraph";
export { AssetHandle } from "./AssetHandle";
export type { AssetHandleOptions, AssetHandleStatus } from "./AssetHandle";
export { AssetLoadError } from "./AssetLoader";
export type { AssetLoader, AssetLoadProgress, AssetLoadRequest } from "./AssetLoader";
export { AssetManager } from "./AssetManager";
export type { AssetLoadOptions, AssetManagerOptions } from "./AssetManager";
export { AssetRegistry } from "./AssetRegistry";
export { createAssetCompatibilityReport } from "./AssetCompatibility";
export type { AssetCompatibilityLoaderName, AssetCompatibilityReport, AssetCompatibilityReportAsset, AssetCompatibilityReportOptions, AssetCompatibilityStatus, AssetLoaderCompatibilityResult, ExternalAssetLoaderCompatibilityResult } from "./AssetCompatibility";
export { DEFAULT_ASSET_IMPORT_SETTINGS, assertValidGLTFCorpusManifest, createGLTFCorpusReport, normalizeAssetImportSettings, validateGLTFCorpusManifest } from "./AssetCorpus";
export type { AssetDiagnostic, AssetDiagnosticSeverity, AssetImportSettings, GLTFCorpusAsset, GLTFCorpusAssetFormat, GLTFCorpusAssetReport, GLTFCorpusExpectedStatus, GLTFCorpusManifest, GLTFCorpusReport, GLTFCorpusSchemaVersion, GLTFCorpusSource, GLTFCorpusValidationResult } from "./AssetCorpus";
export { AudioLoader } from "./AudioLoader";
export type { AudioAsset, AudioDecodeContext } from "./AudioLoader";
export { assertValidBlenderExportFixtureManifest, createBlenderExportValidationReport } from "./BlenderExportValidation";
export type { BlenderExportFixture, BlenderExportFixtureInput, BlenderExportFixtureManifest, BlenderExportValidationDiagnostic, BlenderExportValidationFixtureResult, BlenderExportValidationReport, BlenderExportValidationStatus } from "./BlenderExportValidation";
export { createDracoDecoder, createMeshoptDecoder } from "./GLTFCompressionDecoders";
export type { GLTFDracoAttribute, GLTFDracoDecoderBuffer, GLTFDracoDecoderInstance, GLTFDracoDecoderModule, GLTFDracoMesh, GLTFDracoNumericArray, GLTFDracoStatus, GLTFMeshoptDecoderModule } from "./GLTFCompressionDecoders";
export { ImageLoader } from "./ImageLoader";
export type { ImageAsset } from "./ImageLoader";
export { GLTFLoader } from "./GLTFLoader";
export type { GLTFAsset, GLTFCameraAsset, GLTFClearcoatMaterialExtension, GLTFDracoDecodeDescriptor, GLTFDracoDecodedPrimitive, GLTFDracoDecoder, GLTFGeometryAsset, GLTFImageAsset, GLTFLightAsset, GLTFLoaderOptions, GLTFMaterialAsset, GLTFMaterialVariantAsset, GLTFMaterialVariantMappingAsset, GLTFMeshAsset, GLTFMeshoptDecodeDescriptor, GLTFMeshoptDecoder, GLTFPBRSpecularGlossinessMaterialExtension, GLTFResolvedTextureInfo, GLTFSamplerAsset, GLTFSceneAsset, GLTFSceneCreateOptions, GLTFSheenMaterialExtension, GLTFSkinAsset, GLTFSpecularMaterialExtension, GLTFTextureAsset, GLTFTransmissionMaterialExtension, GLTFVolumeMaterialExtension, SerializedGLTFAsset } from "./GLTFLoader";
export { createGLTFRenderResources } from "./GLTFRenderResources";
export type { DecodedGLTFImage, GLTFImageDecoder, GLTFRenderResourceOptions, GLTFRenderResources } from "./GLTFRenderResources";
export { transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder";
export type { KTX2BasisTargetFormat, KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";
export { ImportPipeline, ImportPipelineError } from "./ImportPipeline";
export type { ImportPipelineContext, ImportPipelineProgressEvent, ImportPipelineProgressStatus, ImportStage } from "./ImportPipeline";
export { LoadContext } from "./LoadContext";
export type { LoadContextOptions } from "./LoadContext";
export { MaterialLoader, createMaterialFromDescriptor } from "./MaterialLoader";
export type { MaterialDescriptorAsset } from "./MaterialLoader";
export { createMeshOptimizationStage, optimizeIndexedMesh } from "./MeshOptimization";
export type { MeshAttributeValue, MeshOptimizationInput, MeshOptimizationResult, MeshOptimizationStageOptions } from "./MeshOptimization";
export { SceneLoader } from "./SceneLoader";
export type { NativeSceneAsset, NativeSceneNodeDescriptor } from "./SceneLoader";
export { ShaderLoader } from "./ShaderLoader";
export type { ShaderSourceAsset } from "./ShaderLoader";
export { createTextureMipGenerationStage, generateTextureMipChain } from "./TexturePipeline";
export type { TextureMipGenerationInput, TextureMipGenerationResult, TextureMipGenerationStageOptions, TextureMipLevel } from "./TexturePipeline";
export { TextureLoader } from "./TextureLoader";
export type { TextureDescriptorAsset } from "./TextureLoader";
export { WorkerAssetJobs } from "./WorkerAssetJobs";
export type { WorkerAssetJob, WorkerAssetJobRunner } from "./WorkerAssetJobs";
```

## @galileo3d/audio

- Version: `0.0.0-rebuild`
- Package manifest: `packages/audio/package.json`
- Public entrypoint: `packages/audio/src/index.ts`

### Export Declarations

```ts
export { AudioBus } from "./AudioBus";
export { AudioClip } from "./AudioClip";
export type { AudioClipOptions } from "./AudioClip";
export { AudioContextManager } from "./AudioContextManager";
export type { AudioContextLike, AudioContextManagerOptions, AudioContextState } from "./AudioContextManager";
export type { AudioEffect } from "./AudioEffect";
export { AudioListener } from "./AudioListener";
export type { Vec3Like } from "./AudioListener";
export { AudioMixer } from "./AudioMixer";
export { AudioSource } from "./AudioSource";
export type { AudioSourceOptions, AudioSourceState } from "./AudioSource";
export { AudioSystem } from "./AudioSystem";
export { SceneAudioBridge } from "./SceneAudioBridge";
export type { SceneAudioSourceBinding } from "./SceneAudioBridge";
export { SpatialAudio } from "./SpatialAudio";
export type { SpatialAudioOptions } from "./SpatialAudio";
export { FilterEffect } from "./effects/Filter";
export { ReverbEffect } from "./effects/Reverb";
```

## @galileo3d/core

- Version: `0.0.0-rebuild`
- Package manifest: `packages/core/package.json`
- Public entrypoint: `packages/core/src/index.ts`

### Export Declarations

```ts
export * from "./Engine.js";
export * from "./EngineConfig.js";
export * from "./EngineLoop.js";
export * from "./Time.js";
export * from "./FixedStepAccumulator.js";
export * from "./EventBus.js";
export * from "./Scheduler.js";
export * from "./TaskQueue.js";
export * from "./Logger.js";
export * from "./Diagnostics.js";
export * from "./Errors.js";
export * from "./Disposable.js";
export * from "./ResourceScope.js";
```

## @galileo3d/debug

- Version: `0.0.0-rebuild`
- Package manifest: `packages/debug/package.json`
- Public entrypoint: `packages/debug/src/index.ts`

### Export Declarations

```ts
export { DrawCallTracker } from "./DrawCallTracker.js";
export type { DrawCallRecord, DrawCallSnapshot } from "./DrawCallTracker.js";
export { RenderStateInspector, RenderStateLeakError } from "./RenderStateInspector.js";
export type { RenderStateDiff, RenderStateSnapshot, RenderStateValue } from "./RenderStateInspector.js";
export { ShaderDiagnosticError, ShaderDiagnostics } from "./ShaderDiagnostics.js";
export type { ShaderDiagnosticReport } from "./ShaderDiagnostics.js";
export { MaterialDiagnosticError, MaterialDiagnostics } from "./MaterialDiagnostics.js";
export type { MaterialDiagnosticReport } from "./MaterialDiagnostics.js";
export { PhysicsDebugAdapter } from "./PhysicsDebugAdapter.js";
export type { PhysicsDebugSnapshot, PhysicsStackEvidence } from "./PhysicsDebugAdapter.js";
export { AnimationInspector } from "./AnimationInspector.js";
export type { AnimationDebugSnapshot, AnimationVisualEvidence, SkeletonDebugSnapshot } from "./AnimationInspector.js";
export { Profiler } from "./Profiler.js";
export type { ProfilerMarker, ProfilerSnapshot } from "./Profiler.js";
export { GPUProfiler } from "./GPUProfiler.js";
export type { GPUProfilerSnapshot, GPUSample, GPUProfilerTimer } from "./GPUProfiler.js";
export { ResourceLeakError, ResourceTracker } from "./ResourceTracker.js";
export type { ResourceLeakReport, TrackedResource } from "./ResourceTracker.js";
export { ECSInspector } from "./ECSInspector.js";
export type { ECSInspectorSnapshot, ECSWorldLike } from "./ECSInspector.js";
export { DebugOverlay } from "./DebugOverlay.js";
export type { DebugOverlayRow, DebugOverlaySection, DebugOverlaySnapshot } from "./DebugOverlay.js";
export { DebugLineCanvasRenderer } from "./DebugLineCanvasRenderer.js";
export type { DebugLineCanvasRendererOptions, DebugLineCanvasRenderResult, DebugRenderLine } from "./DebugLineCanvasRenderer.js";
export { ReportExporter } from "./ReportExporter.js";
export type { DebugReport } from "./ReportExporter.js";
```

## @galileo3d/ecs

- Version: `0.0.0-rebuild`
- Package manifest: `packages/ecs/package.json`
- Public entrypoint: `packages/ecs/src/index.ts`

### Export Declarations

```ts
export * from "./Entity.js";
export * from "./EntityManager.js";
export * from "./Component.js";
export * from "./ComponentRegistry.js";
export * from "./SparseSet.js";
export * from "./Bitset.js";
export * from "./ComponentStore.js";
export * from "./Archetype.js";
export * from "./Query.js";
export * from "./CommandBuffer.js";
export * from "./System.js";
export * from "./SystemScheduler.js";
export * from "./World.js";
export * from "./ECSSerializer.js";
export * from "./ECSProfiler.js";
export * from "./components/TransformComponent.js";
export * from "./components/NameComponent.js";
export * from "./components/TagComponent.js";
```

## @galileo3d/editor

- Version: `0.0.0-rebuild`
- Package manifest: `packages/editor/package.json`
- Public entrypoint: `packages/editor/src/index.ts`

### Export Declarations

```ts
export * from "@galileo3d/editor-runtime";
```

## @galileo3d/editor-runtime

- Version: `0.0.0-rebuild`
- Package manifest: `packages/editor-runtime/package.json`
- Public entrypoint: `packages/editor-runtime/src/index.ts`

### Export Declarations

```ts
export type { Command, CommandContext } from "./Command";
export { CommandHistory, CommandTransactionError } from "./CommandHistory";
export { DiagnosticsOverlayModel } from "./DiagnosticsOverlayModel";
export type { EditorDiagnosticsInput, EditorDiagnosticsResource, EditorDiagnosticsSnapshot } from "./DiagnosticsOverlayModel";
export { EditorRuntime } from "./EditorRuntime";
export type { EditorMode, EditorRuntimeSnapshot } from "./EditorRuntime";
export { EditorPluginHost } from "./EditorPluginHost";
export type { EditorImporterContribution, EditorPanelContribution, EditorPlugin, EditorPluginSnapshot, EditorScriptingNodeContribution, EditorToolContribution } from "./EditorPluginHost";
export { Gizmo } from "./Gizmo";
export type { GizmoAxis, GizmoDrag, GizmoHit } from "./Gizmo";
export { HierarchyModel } from "./HierarchyModel";
export type { HierarchyLikeNode, HierarchyNodeDescriptor } from "./HierarchyModel";
export { InspectorModel } from "./InspectorModel";
export type { InspectorEditableValue, InspectorProperty } from "./InspectorModel";
export { MaterialVariantWorkflow } from "./MaterialVariantWorkflow";
export type { MaterialVariantRenderOptions, MaterialVariantState } from "./MaterialVariantWorkflow";
export { PickingService } from "./PickingService";
export type { EditorPickHit, EditorPickTarget } from "./PickingService";
export { PlayModeBridge } from "./PlayModeBridge";
export type { SnapshotAdapter } from "./PlayModeBridge";
export { RotateGizmo } from "./RotateGizmo";
export { ScaleGizmo } from "./ScaleGizmo";
export { Selection } from "./Selection";
export type { SelectionChange, SelectionId, SelectionListener } from "./Selection";
export { createStaticExportHtml, createStaticExportRuntime } from "./StaticExportRuntime";
export type { StaticExportHtmlOptions, StaticExportRuntimeOptions } from "./StaticExportRuntime";
export { TranslateGizmo } from "./TranslateGizmo";
export { CreateNodeCommand } from "./commands/CreateNodeCommand";
export type { NodeContainer } from "./commands/CreateNodeCommand";
export { DeleteNodeCommand } from "./commands/DeleteNodeCommand";
export { ReparentNodeCommand } from "./commands/ReparentNodeCommand";
export { SetPropertyCommand } from "./commands/SetPropertyCommand";
export { TransformCommand } from "./commands/TransformCommand";
export type { SceneTransformTargetLike, TransformLike, TransformTarget } from "./commands/TransformCommand";
```

## @galileo3d/input

- Version: `0.0.0-rebuild`
- Package manifest: `packages/input/package.json`
- Public entrypoint: `packages/input/src/index.ts`

### Export Declarations

```ts
export { ActionMap } from "./ActionMap";
export type { ActionBinding, AxisBinding } from "./ActionMap";
export { GamepadDevice } from "./GamepadDevice";
export type { GamepadButtonLike, GamepadLike } from "./GamepadDevice";
export { GestureRecognizer } from "./GestureRecognizer";
export type { Gesture } from "./GestureRecognizer";
export { InputSnapshot } from "./InputSnapshot";
export type { ButtonState, GamepadSnapshot, InputSnapshotOptions, PointerSnapshot, PointerTouch } from "./InputSnapshot";
export { InputSystem } from "./InputSystem";
export type { InputEventTargetLike } from "./InputSystem";
export { InteractionSystem } from "./InteractionSystem";
export type { InteractionBounds, InteractionEvent, InteractionEventType, InteractionHit, InteractionListener, InteractionRayProvider, InteractionTarget, InteractionTargetProvider } from "./InteractionSystem";
export { KeyboardDevice } from "./KeyboardDevice";
export type { KeyboardEventLike } from "./KeyboardDevice";
export { pickingRayFromCamera } from "./PickingRay";
export type { PickingRayViewport } from "./PickingRay";
export { PointerDevice } from "./PointerDevice";
export type { PointerEventLike, WheelEventLike } from "./PointerDevice";
export { CameraRig } from "./controls/CameraRig";
export type { CameraRigState } from "./controls/CameraRig";
export type { CameraTransformLike, EulerLike, Vec3Like } from "./controls/ControlTypes";
export { createSceneCameraControlAdapter } from "./controls/SceneCameraAdapter";
export type { SceneCameraControlAdapter } from "./controls/SceneCameraAdapter";
export { EditorFlyControls } from "./controls/EditorFlyControls";
export type { EditorFlyControlsOptions } from "./controls/EditorFlyControls";
export { FirstPersonControls } from "./controls/FirstPersonControls";
export type { FirstPersonControlsOptions } from "./controls/FirstPersonControls";
export { OrbitControls } from "./controls/OrbitControls";
export type { OrbitControlsOptions } from "./controls/OrbitControls";
export { ThirdPersonFollowControls } from "./controls/ThirdPersonFollowControls";
export type { ThirdPersonFollowControlsOptions } from "./controls/ThirdPersonFollowControls";
```

## @galileo3d/math

- Version: `0.0.0-rebuild`
- Package manifest: `packages/math/package.json`
- Public entrypoint: `packages/math/src/index.ts`

### Export Declarations

```ts
export * from "./Vector2.js";
export * from "./Vector3.js";
export * from "./Vector4.js";
export * from "./Matrix3.js";
export * from "./Matrix4.js";
export * from "./Quaternion.js";
export * from "./Color.js";
export * from "./Ray.js";
export * from "./Plane.js";
export * from "./Box3.js";
export * from "./Sphere.js";
export * from "./Frustum.js";
export * from "./Transform.js";
export * from "./Interpolation.js";
export * from "./Easing.js";
export * from "./Random.js";
```

## @galileo3d/physics

- Version: `0.0.0-rebuild`
- Package manifest: `packages/physics/package.json`
- Public entrypoint: `packages/physics/src/index.ts`

### Export Declarations

```ts
export * from "./Shape.js";
export * from "./RigidBody.js";
export * from "./Collider.js";
export * from "./CollisionEvents.js";
export * from "./Constraint.js";
export * from "./Raycast.js";
export * from "./PhysicsWorld.js";
export * from "./PhysicsStepper.js";
export * from "./ScenePhysicsBridge.js";
export * from "./ECSPhysicsBridge.js";
export * from "./PhysicsDebugDraw.js";
```

## @galileo3d/rendering

- Version: `0.0.0-rebuild`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/index.ts`

### Export Declarations

```ts
export type { BufferUsage, DrawCommand, IndexType, PrimitiveTopology, RenderBackendKind, RenderBuffer, RenderDeviceCapability, RenderDevice, RenderDeviceDiagnostics, RenderDeviceInfo, RenderTarget, RenderTargetDescriptor, RenderShaderProgram, ShaderAttributeReflection, ShaderReflection, ShaderUniformReflection, ShaderSources, UniformValue } from "./RenderDevice";
export { MockRenderBuffer, MockRenderDevice, MockShaderProgram, RenderDeviceError } from "./RenderDevice";
export { createRenderDevice } from "./RenderBackend";
export type { RenderBackendOptions } from "./RenderBackend";
export { WebGL2Device } from "./WebGL2Device";
export type { WebGL2DeviceOptions } from "./WebGL2Device";
export { WebGPUDevice } from "./WebGPUDevice";
export type { WebGPUAdapterLike, WebGPUBufferDescriptorLike, WebGPUBufferLike, WebGPUDeviceLike, WebGPUDeviceOptions, WebGPULike, WebGPUQueueLike } from "./WebGPUDevice";
export { VertexAttribute, VertexFormat } from "./VertexFormat";
export type { VertexAttributeDescriptor, VertexAttributeSemantic, VertexAttributeType } from "./VertexFormat";
export { VertexBuffer } from "./VertexBuffer";
export { IndexBuffer } from "./IndexBuffer";
export { Geometry, computeBounds } from "./Geometry";
export type { Bounds3 } from "./Geometry";
export { applyMorphTargets } from "./MorphTarget";
export type { MorphTargetDelta } from "./MorphTarget";
export { Texture, bytesPerPixel, compressedBlockByteLength, compressedTextureByteLength, isCompressedTextureFormat } from "./Texture";
export type { TextureColorSpace, TextureCompressedFormat, TextureDescriptor, TextureFormat, TextureMipLevel, TextureMipLevelDescriptor } from "./Texture";
export { generateApproximateBrdfLutPixels, generateRgba8EnvironmentMipLevels } from "./EnvironmentMapResources";
export type { BrdfLutDescriptor, EnvironmentMipGenerationOptions, Rgba8EnvironmentMapSource } from "./EnvironmentMapResources";
export { Sampler } from "./Sampler";
export type { SamplerDescriptor, TextureAddressMode, TextureFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
export { ShaderModule } from "./ShaderModule";
export { RenderPipeline } from "./RenderPipeline";
export type { PipelineDrawDescriptor, RenderPipelineDescriptor } from "./RenderPipeline";
export { ShaderPreprocessor } from "./ShaderPreprocessor";
export type { ShaderPreprocessOptions, ShaderPreprocessResult, ShaderSourceMapEntry } from "./ShaderPreprocessor";
export { DEFAULT_DEPTH_SHADER_MARKER, DEFAULT_DEPTH_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_MARKER, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_MARKER, DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_MORPH_UNLIT_SHADER_MARKER, DEFAULT_MORPH_UNLIT_SHADER_NAME, DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER, DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_MARKER, DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_SKINNED_UNLIT_SHADER_MARKER, DEFAULT_SKINNED_UNLIT_SHADER_NAME, DEFAULT_TEXTURED_UNLIT_SHADER_MARKER, DEFAULT_TEXTURED_UNLIT_SHADER_NAME, DEFAULT_UNLIT_SHADER_MARKER, DEFAULT_UNLIT_SHADER_NAME, ShaderLibrary, createDefaultShaderLibrary } from "./ShaderLibrary";
export type { CompiledShaderSource, ShaderSourcePair } from "./ShaderLibrary";
export type { ShaderVariantDescriptor } from "./ShaderLibrary";
export { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
export type { ShaderChunk } from "./ShaderChunks";
export { DEFAULT_RENDER_STATE, Material, validateRenderState } from "./Material";
export type { CullMode, DepthCompare, MaterialDescriptor, MaterialUniformDescriptor, MaterialUniformKind, RenderState } from "./Material";
export { MaterialInstance } from "./MaterialInstance";
export { MaterialBinding, MaterialBindingError } from "./MaterialBinding";
export type { MaterialBindingResult } from "./MaterialBinding";
export { UnlitMaterial } from "./UnlitMaterial";
export type { UnlitMaterialOptions } from "./UnlitMaterial";
export { InstancedUnlitMaterial, MAX_INSTANCED_UNLIT_INSTANCES } from "./InstancedUnlitMaterial";
export type { InstancedUnlitMaterialOptions } from "./InstancedUnlitMaterial";
export { InstancedPBRMaterial, MAX_INSTANCED_PBR_INSTANCES } from "./InstancedPBRMaterial";
export type { InstancedPBRMaterialOptions } from "./InstancedPBRMaterial";
export { TexturedUnlitMaterial } from "./TexturedUnlitMaterial";
export type { TexturedUnlitMaterialOptions } from "./TexturedUnlitMaterial";
export { SkinnedUnlitMaterial } from "./SkinnedUnlitMaterial";
export type { SkinnedUnlitMaterialOptions } from "./SkinnedUnlitMaterial";
export { MorphUnlitMaterial } from "./MorphUnlitMaterial";
export type { MorphUnlitMaterialOptions } from "./MorphUnlitMaterial";
export { DEFAULT_PBR_SHADER_MARKER, DEFAULT_PBR_SHADER_NAME, PBRMaterial } from "./PBRMaterial";
export type { PBRMaterialOptions } from "./PBRMaterial";
export { NormalMappedPBRMaterial } from "./NormalMappedPBRMaterial";
export type { NormalMappedPBRMaterialOptions } from "./NormalMappedPBRMaterial";
export { TexturedPBRMaterial } from "./TexturedPBRMaterial";
export type { TexturedPBRMaterialOptions } from "./TexturedPBRMaterial";
export { MaterialPresetRegistry, defaultMaterialPresets } from "./MaterialPresets";
export type { MaterialFactory, MaterialPresetDescriptor, MaterialPresetKind, MaterialPresetOptions } from "./MaterialPresets";
export { BaseRenderPass } from "./RenderPass";
export type { RenderPass, RenderPassContext } from "./RenderPass";
export { RenderGraph } from "./RenderGraph";
export type { RenderGraphPlan, RenderGraphResourceLifetime } from "./RenderGraph";
export { ForwardPass } from "./ForwardPass";
export { MAX_GPU_INSTANCES, MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES } from "./ForwardPass";
export type { EnvironmentLightingOptions, ForwardPassOptions, RenderItem, SkinningPaletteBinding } from "./ForwardPass";
export { LightCollector } from "./LightCollector";
export type { CollectedLight, CollectedLightKind, LightCollectorOptions } from "./LightCollector";
export { LightUniforms, MAX_DIRECT_LIGHTS } from "./LightUniforms";
export type { PackedLightUniforms } from "./LightUniforms";
export { DepthMaterial, DepthPass } from "./DepthPass";
export type { DepthPassOptions } from "./DepthPass";
export { ShadowMap } from "./ShadowMap";
export type { ShadowMapOptions } from "./ShadowMap";
export { ShadowPass } from "./ShadowPass";
export type { ShadowPassOptions, ShadowPassReason, ShadowPassResult } from "./ShadowPass";
export { ShadowProjectionBuilder } from "./ShadowProjection";
export type { ShadowProjection, ShadowProjectionOptions, Vec3Tuple } from "./ShadowProjection";
export { BloomPass, FXAAPass, ToneMappingPass, bloomPixels, fxaaPixels, toneMapPixels } from "./PostProcessPass";
export type { BloomOptions, BloomPassOptions, BloomResult, FXAAOptions, FXAAPassOptions, FXAAResult, ToneMappingOperator, ToneMappingOptions, ToneMappingPassOptions, ToneMappingResult } from "./PostProcessPass";
export { LightingDebug } from "./LightingDebug";
export type { DebugLine } from "./LightingDebug";
export { CascadedShadowMaps, CascadedShadowPass, supportsCascadedShadowLight } from "./CascadedShadowMaps";
export type { CascadedShadowMapsOptions, CascadedShadowPassOptions, CascadedShadowPassResult, CascadeShadowPassResult, CascadeSplit, CascadeSplitOptions, ShadowCascade } from "./CascadedShadowMaps";
export { Renderer } from "./Renderer";
export { pickSceneRenderables } from "./Renderer";
export type { CameraLike, RendererAnimationLoop, RendererOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit } from "./Renderer";
export * from "./effects/Particle.js";
export * from "./effects/ParticleEmitter.js";
export * from "./effects/ParticleModule.js";
export * from "./effects/VelocityModule.js";
export * from "./effects/ColorModule.js";
export * from "./effects/SizeModule.js";
export * from "./effects/ForceModule.js";
export * from "./effects/CollisionModule.js";
export * from "./effects/TrailModule.js";
export * from "./effects/ParticleRenderer.js";
export * from "./effects/ParticleRenderPass.js";
export * from "./effects/GPUParticleBackend.js";
export * from "./effects/ParticleSystem.js";
```

## @galileo3d/scene

- Version: `0.0.0-rebuild`
- Package manifest: `packages/scene/package.json`
- Public entrypoint: `packages/scene/src/index.ts`

### Export Declarations

```ts
export * from "./MathTypes.js";
export * from "./TransformNode.js";
export * from "./Bounds.js";
export * from "./SceneNode.js";
export * from "./Hierarchy.js";
export * from "./Camera.js";
export * from "./PerspectiveCamera.js";
export * from "./OrthographicCamera.js";
export * from "./Light.js";
export * from "./DirectionalLight.js";
export * from "./PointLight.js";
export * from "./SpotLight.js";
export * from "./Renderable.js";
export * from "./SceneQuery.js";
export * from "./Scene.js";
export * from "./SceneSerializer.js";
```

## @galileo3d/scripting

- Version: `0.0.0-rebuild`
- Package manifest: `packages/scripting/package.json`
- Public entrypoint: `packages/scripting/src/index.ts`

### Export Declarations

```ts
export type { Behavior, BehaviorPhase } from "./Behavior";
export { BehaviorHost } from "./BehaviorHost";
export type { BehaviorHostOptions } from "./BehaviorHost";
export { BehaviorRegistry } from "./BehaviorRegistry";
export type { BehaviorFactory } from "./BehaviorRegistry";
export { BehaviorSystem } from "./BehaviorSystem";
export type { BehaviorError, BehaviorSystemUpdateOptions } from "./BehaviorSystem";
export { ScriptContext } from "./ScriptContext";
export type { ScriptContextOptions } from "./ScriptContext";
export { deserializeGraph, serializeGraph, validateGraph } from "./VisualGraph";
export type { SerializedVisualGraph, VisualEdge, VisualGraph } from "./VisualGraph";
export { VisualGraphExecutor } from "./VisualGraphExecutor";
export type { VisualExecutionResult } from "./VisualGraphExecutor";
export { validateNode } from "./VisualNode";
export type { VisualNode, VisualPort, VisualPortDirection, VisualPortType } from "./VisualNode";
```

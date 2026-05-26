import {
  createDracoDecoder,
  createGLTFRenderResourceDiagnostics,
  createGLTFRenderResources,
  createGLTFSceneAnimationMixer,
  createProductionGLTFRenderMetadata,
  GLTFLoader,
  LoadContext,
  type GLTFAsset,
  type GLTFDracoDecodeDescriptor,
  type GLTFDracoDecoder,
  type GLTFDracoDecoderModule,
  type GLTFRenderResources,
  type ProductionGLTFRenderMetadata
} from "@aura3d/assets";
import { Material, TextureBinding, type RenderItem } from "@aura3d/rendering";
import { composeMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  getAuthoredAssetCandidate,
  type AuthoredAssetCandidateId,
  type AuthoredAssetCandidateRecord,
  type AuthoredAssetSourceKind
} from "./authoredAssets";
import type { ControlValues } from "./sceneBuilderPrimitives";
import type { DemoId } from "./metadata";
import {
  applyAuthoredAssetMaterialCorrections,
  applyAuthoredAssetRuntimeMaterialControls,
  authoredAssetExplodeOffset,
  authoredAssetFocusOffset,
  authoredAssetMaterialOverrideTargetCount,
  authoredAssetMaterialRenderStateOverrides,
  authoredImportedMaterialControlPlan,
  authoredMaterialForImportedRenderable,
  authoredRouteAssetConfigs,
  type AuthoredInstanceConfig
} from "./authoredLayerPolicies";

interface Pipeline {
  readonly asset: GLTFAsset;
  readonly resources: GLTFRenderResources;
  readonly metadata: ProductionGLTFRenderMetadata;
  readonly materialInstanceCache: Map<string, Material>;
  readonly mixer?: Mixer;
  dispose(): void;
}
type Mixer = ReturnType<typeof createGLTFSceneAnimationMixer>;
type DracoDecoderModuleFactory = (config?: {
  readonly locateFile?: (file: string, prefix: string) => string;
}) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule;

export interface AuthoredAssetRuntimeState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly assetIds: readonly AuthoredAssetCandidateId[];
  readonly assets: readonly string[];
  readonly drawItems: number;
  readonly animations: number;
  readonly animatedAssets: number;
  readonly clips: readonly string[];
  readonly animationDiagnostics: readonly AuthoredAnimationDiagnostic[];
  readonly transformDiagnostics: readonly AuthoredTransformDiagnostic[];
  readonly materialVariants: readonly AuthoredMaterialVariantDiagnostic[];
  readonly materialDiagnostics: readonly AuthoredMaterialDiagnostic[];
  readonly assetProvenance: readonly AuthoredAssetProvenanceDiagnostic[];
  readonly loadMs: number;
  readonly errors: readonly string[];
}

export interface AuthoredAnimationDiagnostic {
  readonly assetId: AuthoredAssetCandidateId;
  readonly assetTitle: string;
  readonly clip: string;
  readonly clipDuration: number;
  readonly time: number;
  readonly normalizedTime: number;
  readonly paused: boolean;
  readonly tracksApplied: number;
  readonly morphWeightTracksApplied: number;
  readonly skinningPalettesUpdated: number;
}

export interface AuthoredTransformDiagnostic {
  readonly assetId: AuthoredAssetCandidateId;
  readonly assetTitle: string;
  readonly label: string;
  readonly source: "authored-turntable";
  readonly enabled: boolean;
  readonly yawRadians: number;
  readonly angularVelocityRadiansPerSecond: number;
  readonly timeSeconds: number;
}

export interface AuthoredMaterialVariantDiagnostic {
  readonly assetId: AuthoredAssetCandidateId;
  readonly assetTitle: string;
  readonly selected: string;
  readonly available: readonly string[];
  readonly ready: boolean;
  readonly usingFallback: boolean;
}

export interface AuthoredMaterialDiagnostic {
  readonly assetId: AuthoredAssetCandidateId;
  readonly assetTitle: string;
  readonly label: string;
  readonly drawItems: number;
  readonly skinnedDrawItems: number;
  readonly texturedDrawItems: number;
  readonly baseColorTextureDrawItems: number;
  readonly colorBearingTextureDrawItems: number;
  readonly surfaceDetailTextureDrawItems: number;
  readonly effectiveTextureBackedDrawItems: number;
  readonly texturedSkinnedDrawItems: number;
  readonly untexturedSkinnedDrawItems: number;
  readonly fallbackWhiteDrawItems: number;
  readonly missingGeometryDrawItems: number;
  readonly missingMaterialDrawItems: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly renderableBindingCount: number;
  readonly materialOverrideTargetCount: number;
  readonly materialOverrideSource: "GLTFRenderResources.collectMaterialOverrideTargets" | "not-applicable";
  readonly materialControlTargetCount: number;
  readonly materialControlUniqueMaterialCount: number;
  readonly materialControlSource: "GLTFRenderResources.materialVariants" | "not-applicable";
  readonly materialControlSelectedVariant?: string;
  readonly materialControlControlKey?: string;
  readonly materialControlTargetMaterialKeys: readonly string[];
  readonly materialControlTargetSourceMaterials: readonly string[];
  readonly materialControlLimitation?: string;
  readonly shaderActiveTextureSlotDiagnostics: readonly {
    readonly slot: string;
    readonly drawItems: number;
    readonly materialNames: readonly string[];
    readonly labels: readonly string[];
  }[];
  readonly shaderInactiveTextureSlotDiagnostics: readonly {
    readonly slot: string;
    readonly drawItems: number;
    readonly materialNames: readonly string[];
    readonly labels: readonly string[];
  }[];
  readonly textureContributionDiagnostics: readonly {
    readonly contribution: string;
    readonly slot: string;
    readonly drawItems: number;
    readonly materialNames: readonly string[];
    readonly labels: readonly string[];
  }[];
  readonly suppressedTextureSlotDiagnostics: readonly {
    readonly contribution: string;
    readonly slot: string;
    readonly drawItems: number;
    readonly materialNames: readonly string[];
    readonly labels: readonly string[];
  }[];
  readonly excludedNodeCount: number;
  readonly excludedNodeSample: readonly string[];
  readonly excludedNodeSemanticRoles: readonly string[];
  readonly fallbackWhiteLabels: readonly string[];
  readonly textureBackedMaterialNames: readonly string[];
  readonly untexturedSkinnedLabels: readonly string[];
  readonly missingGeometryLabels: readonly string[];
  readonly missingMaterialLabels: readonly string[];
}

export interface AuthoredAssetProvenanceDiagnostic {
  readonly assetId: AuthoredAssetCandidateId;
  readonly assetTitle: string;
  readonly routeUse: AuthoredAssetCandidateRecord["routeUse"];
  readonly visualRole: AuthoredAssetCandidateRecord["visualRole"];
  readonly sourceKind: AuthoredAssetSourceKind;
  readonly localUrl: string;
  readonly manifestPath?: string;
  readonly sourceScript?: string;
  readonly sourceAssetPath?: string;
  readonly generated: boolean;
  readonly derivative: boolean;
  readonly supportOnly: boolean;
  readonly acceptableAsFocalHero: boolean;
  readonly textureBacked?: boolean;
  readonly generatedNoTexture?: boolean;
  readonly semanticRoles?: readonly string[];
  readonly supportScaffoldRoles?: readonly string[];
  readonly defaultExcludedRoles?: readonly string[];
  readonly textureBackedFocalMaterials?: readonly string[];
  readonly knownLimitations: readonly string[];
}

export interface AuthoredLayerFrame {
  readonly items: readonly RenderItem[];
  readonly labels: readonly string[];
  readonly runtime: AuthoredAssetRuntimeState;
}

interface LoadedAssetRecord {
  readonly candidate: AuthoredAssetCandidateRecord;
  readonly startedAt: number;
  readonly promise: Promise<LoadedAuthoredAsset>;
  loaded?: LoadedAuthoredAsset;
  error?: string;
}


interface LoadedAuthoredAsset {
  readonly candidate: AuthoredAssetCandidateRecord;
  readonly pipelines: Map<string, Pipeline>;
  readonly pendingPipelines: Map<string, Promise<Pipeline>>;
  readonly variantErrors: Map<string, string>;
  readonly defaultPipeline: Pipeline;
  readonly loadedAt: number;
  readonly loadMs: number;
}

interface ImportedItemCollection {
  readonly items: readonly RenderItem[];
  readonly diagnostics: AuthoredMaterialDiagnostic;
}

const ZERO_OFFSET: readonly [number, number, number] = [0, 0, 0];


export function expectedAuthoredAssetCountForDemo(demoId: DemoId): number {
  return new Set(authoredRouteAssetConfigs(demoId).map((config) => config.assetId)).size;
}

export function configuredAuthoredAssetIdsForDemo(demoId: DemoId): readonly AuthoredAssetCandidateId[] {
  return [...new Set(authoredRouteAssetConfigs(demoId).map((config) => config.assetId))];
}

export function createAuthoredGalleryLayer(): {
  readonly prepare: (demoId: DemoId, size: { readonly width: number; readonly height: number }) => void;
  readonly frame: (demoId: DemoId, timeSeconds: number, controls: ControlValues) => AuthoredLayerFrame;
  readonly dispose: () => void;
} {
  const records = new Map<AuthoredAssetCandidateId, LoadedAssetRecord>();

  const prepare = (demoId: DemoId, size: { readonly width: number; readonly height: number }): void => {
    for (const config of authoredRouteAssetConfigs(demoId)) {
      if (records.has(config.assetId)) continue;
      const candidate = getAuthoredAssetCandidate(config.assetId);
      const startedAt = performance.now();
      const record: LoadedAssetRecord = {
        candidate,
        startedAt,
        promise: loadAuthoredAsset(candidate, size, startedAt, config)
      };
      records.set(config.assetId, record);
      void record.promise.then((loaded) => {
        record.loaded = loaded;
      }, (error: unknown) => {
        record.error = formatError(error);
      });
    }
  };

  const frame = (demoId: DemoId, timeSeconds: number, controls: ControlValues): AuthoredLayerFrame => {
    const configs = authoredRouteAssetConfigs(demoId);
    if (configs.length === 0) return {
      items: [],
      labels: [],
      runtime: emptyRuntime("idle")
    };

    const items: RenderItem[] = [];
    const labels: string[] = [];
    const clips: string[] = [];
    const errors: string[] = [];
    const assetTitles: string[] = [];
    const assetIds: AuthoredAssetCandidateId[] = [];
    const animationDiagnostics: AuthoredAnimationDiagnostic[] = [];
    const transformDiagnostics: AuthoredTransformDiagnostic[] = [];
    const materialVariants: AuthoredMaterialVariantDiagnostic[] = [];
    const materialDiagnostics: AuthoredMaterialDiagnostic[] = [];
    const assetProvenance: AuthoredAssetProvenanceDiagnostic[] = [];
    let animations = 0;
    let animatedAssets = 0;
    let loadMs = 0;
    let loading = false;

    for (const config of configs) {
      const record = records.get(config.assetId);
      if (!record) {
        assetProvenance.push(authoredAssetProvenanceDiagnostic(getAuthoredAssetCandidate(config.assetId)));
        loading = true;
        continue;
      }
      assetProvenance.push(authoredAssetProvenanceDiagnostic(record.candidate));
      assetTitles.push(record.candidate.title);
      assetIds.push(record.candidate.id);
      if (record.error) {
        errors.push(`${record.candidate.title}: ${record.error}`);
        continue;
      }
      if (!record.loaded) {
        loading = true;
        loadMs = Math.max(loadMs, Math.round(performance.now() - record.startedAt));
        continue;
      }

      const loaded = record.loaded;
      const selection = pipelineForControls(loaded, config, controls);
      const pipeline = selection.pipeline;
      loadMs = Math.max(loadMs, loaded.loadMs);
      animations += pipeline.metadata.animationCount;
      if (selection.selectedVariant) {
        materialVariants.push({
          assetId: record.candidate.id,
          assetTitle: record.candidate.title,
          selected: selection.selectedVariant,
          available: loaded.defaultPipeline.asset.materialVariants.map((variant) => variant.name),
          ready: selection.ready,
          usingFallback: selection.usingFallback
        });
      }
      const variantError = selection.selectedVariant ? loaded.variantErrors.get(variantKey(selection.selectedVariant)) : undefined;
      if (variantError) errors.push(`${record.candidate.title} ${selection.selectedVariant}: ${variantError}`);
      if (config.animate && pipeline.mixer && pipeline.asset.animations.length > 0) {
        const clip = selectClip(pipeline, config, controls);
        if (clip) {
          const clipTime = clipTimeForControls(clip.duration, timeSeconds, controls);
          const paused = controls.playing === false;
          pipeline.mixer.playExclusive(clip.name, { loopMode: "repeat", weight: 1, timeScale: 1 });
          pipeline.mixer.seek(clip.name, clipTime);
          if (paused) {
            pipeline.mixer.pause(clip.name);
          } else {
            pipeline.mixer.resume(clip.name);
          }
          const update = pipeline.mixer.update(0);
          clips.push(`${record.candidate.title}: ${clip.name}`);
          animationDiagnostics.push({
            assetId: record.candidate.id,
            assetTitle: record.candidate.title,
            clip: clip.name,
            clipDuration: clip.duration,
            time: clipTime,
            normalizedTime: clip.duration > 0 ? clipTime / clip.duration : 0,
            paused,
            tracksApplied: update.applyResult.tracksApplied,
            morphWeightTracksApplied: update.applyResult.morphWeightTracksApplied,
            skinningPalettesUpdated: update.applyResult.skinningPalettesUpdated
          });
          animatedAssets += 1;
        }
      }

      const placement = placementFor(config, pipeline, timeSeconds, controls);
      if (config.turntable) {
        transformDiagnostics.push({
          assetId: record.candidate.id,
          assetTitle: record.candidate.title,
          label: config.label,
          source: "authored-turntable",
          enabled: placement.turntable.enabled,
          yawRadians: placement.turntable.yawRadians,
          angularVelocityRadiansPerSecond: placement.turntable.angularVelocityRadiansPerSecond,
          timeSeconds
        });
      }
      const imported = collectImportedItems(pipeline, placement.matrix, config, controls, selection.selectedVariant);
      items.push(...imported.items);
      materialDiagnostics.push(imported.diagnostics);
      labels.push(`${config.label}: ${imported.items.length} GLB draw items`);
    }

    return {
      items,
      labels,
      runtime: {
        status: errors.length > 0 ? "error" : loading ? "loading" : "ready",
        assetIds,
        assets: assetTitles,
        drawItems: items.length,
        animations,
        animatedAssets,
        clips,
        animationDiagnostics,
        transformDiagnostics,
        materialVariants,
        materialDiagnostics,
        assetProvenance,
        loadMs,
        errors
      }
    };
  };

  const dispose = (): void => {
    for (const record of records.values()) {
      if (record.loaded) {
        for (const pipeline of record.loaded.pipelines.values()) {
          pipeline.dispose();
        }
      }
    }
    records.clear();
  };

  return { prepare, frame, dispose };
}

function emptyRuntime(status: AuthoredAssetRuntimeState["status"]): AuthoredAssetRuntimeState {
  return {
    status,
    assetIds: [],
    assets: [],
    drawItems: 0,
    animations: 0,
    animatedAssets: 0,
    clips: [],
    animationDiagnostics: [],
    transformDiagnostics: [],
    materialVariants: [],
    materialDiagnostics: [],
    assetProvenance: [],
    loadMs: 0,
    errors: []
  };
}

function authoredAssetProvenanceDiagnostic(candidate: AuthoredAssetCandidateRecord): AuthoredAssetProvenanceDiagnostic {
  const provenance = candidate.provenance;
  return {
    assetId: candidate.id,
    assetTitle: candidate.title,
    routeUse: candidate.routeUse,
    visualRole: candidate.visualRole,
    sourceKind: provenance?.sourceKind ?? "local-authored-fixture",
    localUrl: candidate.localUrl,
    ...(provenance?.manifestPath ? { manifestPath: provenance.manifestPath } : {}),
    ...(provenance?.sourceScript ? { sourceScript: provenance.sourceScript } : {}),
    ...(provenance?.sourceAssetPath ? { sourceAssetPath: provenance.sourceAssetPath } : {}),
    generated: provenance?.generated ?? false,
    derivative: provenance?.derivative ?? false,
    supportOnly: provenance?.supportOnly ?? false,
    acceptableAsFocalHero: provenance?.acceptableAsFocalHero ?? candidate.visualRole === "hero product",
    ...(typeof provenance?.textureBacked === "boolean" ? { textureBacked: provenance.textureBacked } : {}),
    ...(typeof provenance?.generatedNoTexture === "boolean" ? { generatedNoTexture: provenance.generatedNoTexture } : {}),
    ...(provenance?.semanticRoles ? { semanticRoles: provenance.semanticRoles } : {}),
    ...(provenance?.supportScaffoldRoles ? { supportScaffoldRoles: provenance.supportScaffoldRoles } : {}),
    ...(provenance?.defaultExcludedRoles ? { defaultExcludedRoles: provenance.defaultExcludedRoles } : {}),
    ...(provenance?.textureBackedFocalMaterials ? { textureBackedFocalMaterials: provenance.textureBackedFocalMaterials } : {}),
    knownLimitations: candidate.knownLimitations
  };
}

async function loadAuthoredAsset(
  candidate: AuthoredAssetCandidateRecord,
  size: { readonly width: number; readonly height: number },
  startedAt: number,
  config: AuthoredInstanceConfig
): Promise<LoadedAuthoredAsset> {
  void size;
  const dracoDecoder = needsBrowserDracoDecoder(candidate) ? await createBrowserDracoDecoder() : undefined;
  const assetUrl = new URL(candidate.localUrl, window.location.origin).href;
  const asset = await new GLTFLoader({
    ...(dracoDecoder ? { dracoDecoder } : {})
  }).load({ url: assetUrl }, new LoadContext());
  const pipelines = new Map<string, Pipeline>();
  const startupVariant = startupMaterialVariantForConfig(asset, config);
  const defaultPipeline = await createPipeline(candidate, asset, startupVariant, true);
  pipelines.set(variantKey(undefined), defaultPipeline);
  if (startupVariant) pipelines.set(variantKey(startupVariant), defaultPipeline);
  return {
    candidate,
    pipelines,
    pendingPipelines: new Map<string, Promise<Pipeline>>(),
    variantErrors: new Map<string, string>(),
    defaultPipeline,
    loadedAt: performance.now(),
    loadMs: Math.round(performance.now() - startedAt)
  };
}

async function createPipeline(
  candidate: AuthoredAssetCandidateRecord,
  asset: GLTFAsset,
  materialVariant: string | undefined,
  disposeAsset: boolean
): Promise<Pipeline> {
  const materialRenderStateOverrides = authoredAssetMaterialRenderStateOverrides(candidate.id);
  const resources = await createGLTFRenderResources(asset, {
    ...(materialVariant ? { materialVariant } : {}),
    ...(materialRenderStateOverrides ? { materialRenderStateOverrides } : {})
  });
  applyAuthoredAssetMaterialCorrections(candidate.id, materialVariant, resources.materialLibrary);
  const materialInstanceCache = new Map<string, Material>();
  return {
    asset,
    resources,
    metadata: createProductionGLTFRenderMetadata(asset, `advanced-gallery-${candidate.id}`, candidate.title),
    materialInstanceCache,
    ...(asset.animations.length > 0
      ? {
        mixer: createGLTFSceneAnimationMixer({
          scene: resources.scene,
          clips: asset.animations,
          asset,
          autoPlay: false
        })
      }
      : {}),
    dispose: () => {
      for (const material of materialInstanceCache.values()) {
        material.dispose();
      }
      materialInstanceCache.clear();
      resources.dispose();
      if (disposeAsset && "dispose" in asset && typeof asset.dispose === "function") {
        asset.dispose();
      }
    }
  };
}

function startupMaterialVariantForConfig(asset: GLTFAsset, config: AuthoredInstanceConfig): string | undefined {
  if (!config.materialVariantControl) return undefined;
  const available = asset.materialVariants.map((variant) => variant.name);
  if (config.defaultMaterialVariant && available.includes(config.defaultMaterialVariant)) return config.defaultMaterialVariant;
  return available[0];
}

interface PipelineSelection {
  readonly pipeline: Pipeline;
  readonly selectedVariant?: string;
  readonly ready: boolean;
  readonly usingFallback: boolean;
}

function pipelineForControls(
  loaded: LoadedAuthoredAsset,
  config: AuthoredInstanceConfig,
  controls: ControlValues
): PipelineSelection {
  const selectedVariant = materialVariantForControls(loaded, config, controls);
  if (!selectedVariant) return {
    pipeline: loaded.defaultPipeline,
    ready: true,
    usingFallback: false
  };
  const key = variantKey(selectedVariant);
  const readyPipeline = loaded.pipelines.get(key);
  if (readyPipeline) return {
    pipeline: readyPipeline,
    selectedVariant,
    ready: true,
    usingFallback: false
  };
  if (!loaded.pendingPipelines.has(key) && !loaded.variantErrors.has(key)) {
    const pending = createPipeline(loaded.candidate, loaded.defaultPipeline.asset, selectedVariant, false);
    loaded.pendingPipelines.set(key, pending);
    void pending.then((pipeline) => {
      loaded.pipelines.set(key, pipeline);
      loaded.pendingPipelines.delete(key);
    }, (error: unknown) => {
      loaded.pendingPipelines.delete(key);
      loaded.variantErrors.set(key, formatError(error));
    });
  }
  return {
    pipeline: loaded.defaultPipeline,
    selectedVariant,
    ready: false,
    usingFallback: true
  };
}

function materialVariantForControls(
  loaded: LoadedAuthoredAsset,
  config: AuthoredInstanceConfig,
  controls: ControlValues
): string | undefined {
  if (!config.materialVariantControl) return undefined;
  const available = loaded.defaultPipeline.asset.materialVariants.map((variant) => variant.name);
  if (available.length === 0) return undefined;
  const selected = String(controls[config.materialVariantControl] ?? config.defaultMaterialVariant ?? available[0]);
  if (available.includes(selected)) return selected;
  if (config.defaultMaterialVariant && available.includes(config.defaultMaterialVariant)) return config.defaultMaterialVariant;
  return available[0];
}

function variantKey(materialVariant: string | undefined): string {
  return materialVariant ?? "__default__";
}

const DRACO_COMPRESSED_ASSET_IDS = new Set<AuthoredAssetCandidateId>([
  "littlest-tokyo"
]);

function needsBrowserDracoDecoder(candidate: AuthoredAssetCandidateRecord): boolean {
  return DRACO_COMPRESSED_ASSET_IDS.has(candidate.id)
    || candidate.localUrl.includes("draco");
}

function selectClip(
  pipeline: Pipeline,
  config: AuthoredInstanceConfig,
  controls: ControlValues
): Pipeline["asset"]["animations"][number] | undefined {
  const state = String(controls.state ?? "");
  const explicit = state && config.clipByControl?.[state]
    ? pipeline.asset.animations.find((clip) => config.clipByControl?.[state]?.test(clip.name))
    : undefined;
  return explicit
    ?? (config.defaultClip ? pipeline.asset.animations.find((clip) => config.defaultClip?.test(clip.name)) : undefined)
    ?? pipeline.asset.animations.find((clip) => /idle|walk|run|dance|animation|take|default/i.test(clip.name))
    ?? pipeline.asset.animations[0];
}

function clipTimeForControls(duration: number, timeSeconds: number, controls: ControlValues): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (controls.playing === false) {
    const scrub = typeof controls.timeline === "number" ? controls.timeline : Number(controls.timeline ?? 0);
    return clamp01(Number.isFinite(scrub) ? scrub : 0) * duration;
  }
  return timeSeconds % duration;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface PlacementFrame {
  readonly matrix: Mat4;
  readonly turntable: {
    readonly enabled: boolean;
    readonly yawRadians: number;
    readonly angularVelocityRadiansPerSecond: number;
  };
}

function placementFor(config: AuthoredInstanceConfig, pipeline: Pipeline, timeSeconds: number, controls: ControlValues): PlacementFrame {
  const turntable = Boolean(config.turntable && controls.turntable === true);
  const turntableSpeed = turntable ? config.turntableSpeedRadiansPerSecond ?? 0.48 : 0;
  const yaw = (config.yawRadians ?? 0) + turntableSpeed * timeSeconds;
  const explodeOffset = controls.explode === true ? config.explodeOffset ?? [0, 0, 0] as const : [0, 0, 0] as const;
  const assetBounds = pipeline.resources.bounds;
  const height = Math.max(0.001, assetBounds.max[1] - assetBounds.min[1]);
  const fitScale = config.targetHeight ? config.targetHeight / height : 1;
  const scale: [number, number, number] = [
    config.scale[0] * fitScale,
    config.scale[1] * fitScale,
    config.scale[2] * fitScale
  ];
  const centerX = (assetBounds.min[0] + assetBounds.max[0]) * 0.5;
  const centerZ = (assetBounds.min[2] + assetBounds.max[2]) * 0.5;
  return {
    matrix: multiplyMat4(
      composeMat4([
        config.position[0] + explodeOffset[0],
        config.position[1] + explodeOffset[1],
        config.position[2] + explodeOffset[2]
      ], quatY(yaw), scale),
      composeMat4([-centerX, -assetBounds.min[1], -centerZ], [0, 0, 0, 1], [1, 1, 1])
    ),
    turntable: {
      enabled: turntable,
      yawRadians: yaw,
      angularVelocityRadiansPerSecond: turntableSpeed
    }
  };
}

function quatY(yawRadians: number): [number, number, number, number] {
  const half = yawRadians * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

function collectImportedItems(
  pipeline: Pipeline,
  placement: Mat4,
  config: AuthoredInstanceConfig,
  controls: ControlValues,
  selectedVariant?: string
): ImportedItemCollection {
  const items: RenderItem[] = [];
  const fallbackWhiteLabels: string[] = [];
  const textureBackedMaterialNames = new Set<string>();
  const untexturedSkinnedLabels: string[] = [];
  const missingGeometryLabels: string[] = [];
  const missingMaterialLabels: string[] = [];
  const excludedNodeSample: string[] = [];
  const excludedNodeSemanticRoles = new Set<string>();
  const excludedSemanticRoleSet = new Set(config.excludeNodeSemanticRoles ?? []);
  let skinnedDrawItems = 0;
  let texturedDrawItems = 0;
  let texturedSkinnedDrawItems = 0;
  let fallbackWhiteDrawItems = 0;
  let missingGeometryDrawItems = 0;
  let missingMaterialDrawItems = 0;
  let excludedNodeCount = 0;
  applyAuthoredAssetRuntimeMaterialControls(config.assetId, pipeline.resources, controls);
  const materialOverrideTargetCount = authoredAssetMaterialOverrideTargetCount(config.assetId, pipeline.resources);
  const materialControlPlan = authoredImportedMaterialControlPlan(config.assetId, pipeline.resources, {
    ...(config.materialVariantControl ? { controlKey: config.materialVariantControl } : {}),
    ...(selectedVariant ? { selectedVariant } : {})
  });
  const renderResourceDiagnostics = createGLTFRenderResourceDiagnostics(pipeline.resources, {
    label: config.label
  });
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const includedByPolicy = config.includeNodePattern ? config.includeNodePattern.test(node.name) : true;
    const semanticRole = gltfNodeSemanticRole(node);
    const excludedByPolicy = config.excludeNodePattern?.test(node.name) === true
      || (semanticRole !== undefined && excludedSemanticRoleSet.has(semanticRole));
    if (!includedByPolicy || excludedByPolicy) {
      excludedNodeCount += 1;
      if (excludedNodeSample.length < 16) excludedNodeSample.push(node.name);
      if (semanticRole !== undefined) excludedNodeSemanticRoles.add(semanticRole);
      continue;
    }
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    const sourceMaterialName = sourceMaterialNameForRenderable(pipeline, node.name, renderable.geometry, renderable.material) ?? material?.name ?? renderable.material;
    const label = `${config.label}:${node.name}`;
    if (!geometry) {
      missingGeometryDrawItems += 1;
      missingGeometryLabels.push(label);
    }
    if (!material) {
      missingMaterialDrawItems += 1;
      missingMaterialLabels.push(label);
    }
    if (!geometry || !material) continue;
    const renderMaterial = authoredMaterialForImportedRenderable(pipeline.materialInstanceCache, config.assetId, material, {
      nodeName: node.name,
      geometryKey: renderable.geometry,
      materialKey: renderable.material,
      sourceMaterialName
    });
    const isSkinned = Boolean(renderable.skinning);
    const hasBaseColorTexture = materialHasTexture(renderMaterial, "u_baseColorTexture", "u_baseColorTextureEnabled");
    const hasAnyTexture = hasBaseColorTexture
      || materialHasTexture(renderMaterial, "u_normalTexture", "u_normalTextureEnabled")
      || materialHasTexture(renderMaterial, "u_metallicRoughnessTexture", "u_metallicRoughnessTextureEnabled")
      || materialHasTexture(renderMaterial, "u_occlusionTexture", "u_occlusionTextureEnabled")
      || materialHasTexture(renderMaterial, "u_emissiveTexture", "u_emissiveTextureEnabled")
      || materialHasTexture(renderMaterial, "u_clearcoatTexture", "u_clearcoatTextureEnabled")
      || materialHasTexture(renderMaterial, "u_clearcoatRoughnessTexture", "u_clearcoatRoughnessTextureEnabled")
      || materialHasTexture(renderMaterial, "u_clearcoatNormalTexture", "u_clearcoatNormalTextureEnabled")
      || materialHasTexture(renderMaterial, "u_transmissionTexture", "u_transmissionTextureEnabled")
      || materialHasTexture(renderMaterial, "u_diffuseTransmissionTexture", "u_diffuseTransmissionTextureEnabled")
      || materialHasTexture(renderMaterial, "u_diffuseTransmissionColorTexture", "u_diffuseTransmissionColorTextureEnabled")
      || materialHasTexture(renderMaterial, "u_volumeThicknessTexture", "u_volumeThicknessTextureEnabled")
      || materialHasTexture(renderMaterial, "u_specularTexture", "u_specularTextureEnabled")
      || materialHasTexture(renderMaterial, "u_specularColorTexture", "u_specularColorTextureEnabled")
      || materialHasTexture(renderMaterial, "u_sheenColorTexture", "u_sheenColorTextureEnabled")
      || materialHasTexture(renderMaterial, "u_sheenRoughnessTexture", "u_sheenRoughnessTextureEnabled")
      || materialHasTexture(renderMaterial, "u_anisotropyTexture", "u_anisotropyTextureEnabled")
      || materialHasTexture(renderMaterial, "u_iridescenceTexture", "u_iridescenceTextureEnabled")
      || materialHasTexture(renderMaterial, "u_iridescenceThicknessTexture", "u_iridescenceThicknessTextureEnabled");
    if (isSkinned) skinnedDrawItems += 1;
    if (hasAnyTexture) {
      texturedDrawItems += 1;
      textureBackedMaterialNames.add(renderMaterial.name);
    }
    if (isSkinned && hasBaseColorTexture) texturedSkinnedDrawItems += 1;
    if (isSkinned && !hasBaseColorTexture) untexturedSkinnedLabels.push(label);
    if (isFallbackWhiteMaterial(renderMaterial)) {
      fallbackWhiteDrawItems += 1;
      fallbackWhiteLabels.push(label);
    }
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    const explodeOffset = config.explodeParts === true && controls.explode === true
      ? authoredAssetExplodeOffset(config.assetId, nodeNamePath(node))
      : ZERO_OFFSET;
    const focusOffset = authoredAssetFocusOffset(config.assetId, node.name, controls);
    const nodeOffset = addOffset(explodeOffset, focusOffset);
    const nodePlacement = hasOffset(nodeOffset)
      ? multiplyMat4(placement, composeMat4(nodeOffset, [0, 0, 0, 1], [1, 1, 1]))
      : placement;
    items.push({
      label: `${config.label}:${node.name}`,
      geometry,
      material: renderMaterial,
      modelMatrix: multiplyMat4(nodePlacement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return {
    items,
    diagnostics: {
      assetId: config.assetId,
      assetTitle: pipeline.metadata.assetName,
      label: config.label,
      drawItems: items.length,
      skinnedDrawItems,
      texturedDrawItems,
      baseColorTextureDrawItems: renderResourceDiagnostics.baseColorTextureDrawItems,
      colorBearingTextureDrawItems: renderResourceDiagnostics.colorBearingTextureDrawItems,
      surfaceDetailTextureDrawItems: renderResourceDiagnostics.surfaceDetailTextureDrawItems,
      effectiveTextureBackedDrawItems: renderResourceDiagnostics.effectiveTextureBackedDrawItems,
      texturedSkinnedDrawItems,
      untexturedSkinnedDrawItems: untexturedSkinnedLabels.length,
      fallbackWhiteDrawItems,
      missingGeometryDrawItems,
      missingMaterialDrawItems,
      materialCount: pipeline.resources.materialLibrary.size,
      textureCount: pipeline.resources.textureLibrary.size,
      renderableBindingCount: pipeline.resources.renderableBindings.length,
      materialOverrideTargetCount,
      materialOverrideSource: materialOverrideTargetCount > 0 ? "GLTFRenderResources.collectMaterialOverrideTargets" : "not-applicable",
      materialControlTargetCount: materialControlPlan.targetCount,
      materialControlUniqueMaterialCount: materialControlPlan.uniqueMaterialCount,
      materialControlSource: materialControlPlan.source,
      ...(materialControlPlan.selectedVariant ? { materialControlSelectedVariant: materialControlPlan.selectedVariant } : {}),
      ...(materialControlPlan.controlKey ? { materialControlControlKey: materialControlPlan.controlKey } : {}),
      materialControlTargetMaterialKeys: materialControlPlan.targetMaterialKeys,
      materialControlTargetSourceMaterials: materialControlPlan.targetSourceMaterials,
      ...(materialControlPlan.limitation ? { materialControlLimitation: materialControlPlan.limitation } : {}),
      textureContributionDiagnostics: renderResourceDiagnostics.textureContributionDiagnostics,
      suppressedTextureSlotDiagnostics: renderResourceDiagnostics.suppressedTextureSlotDiagnostics,
      shaderActiveTextureSlotDiagnostics: renderResourceDiagnostics.shaderActiveTextureSlotDiagnostics,
      shaderInactiveTextureSlotDiagnostics: renderResourceDiagnostics.shaderInactiveTextureSlotDiagnostics,
      excludedNodeCount,
      excludedNodeSample,
      excludedNodeSemanticRoles: [...excludedNodeSemanticRoles].sort(),
      fallbackWhiteLabels,
      textureBackedMaterialNames: [...textureBackedMaterialNames].sort(),
      untexturedSkinnedLabels,
      missingGeometryLabels,
      missingMaterialLabels
    }
  };
}

function sourceMaterialNameForRenderable(
  pipeline: Pipeline,
  nodeName: string,
  geometryKey: string,
  materialKey: string
): string | undefined {
  return pipeline.resources.renderableBindings.find((binding) => binding.nodeName === nodeName
    && binding.geometryKey === geometryKey
    && binding.materialKey === materialKey)?.sourceMaterialName;
}

function gltfNodeSemanticRole(node: { readonly userData?: Record<string, unknown> }): string | undefined {
  const direct = node.userData?.a3d_semantic_role;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const extras = node.userData?.gltfExtras;
  if (extras && typeof extras === "object" && !Array.isArray(extras)) {
    const role = (extras as Record<string, unknown>).a3d_semantic_role;
    if (typeof role === "string" && role.length > 0) return role;
  }
  return undefined;
}

interface NodeNameParent {
  readonly name: string;
  readonly parent?: unknown;
}

function nodeNamePath(node: NodeNameParent): readonly string[] {
  const path: string[] = [];
  let current: NodeNameParent | null = node;
  while (current && typeof current.name === "string") {
    path.push(current.name);
    const parent: unknown = current.parent;
    current = parent && typeof parent === "object" && "name" in parent
      ? parent as NodeNameParent
      : null;
  }
  return path;
}

function addOffset(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): [number, number, number] {
  if (!hasOffset(left)) return [right[0], right[1], right[2]];
  if (!hasOffset(right)) return [left[0], left[1], left[2]];
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function hasOffset(offset: readonly [number, number, number]): boolean {
  return Math.abs(offset[0]) > 0.0001 || Math.abs(offset[1]) > 0.0001 || Math.abs(offset[2]) > 0.0001;
}

function materialHasTexture(material: Material, textureParameter: string, enabledParameter: string): boolean {
  const binding = material.getParameter(textureParameter);
  if (!(binding instanceof TextureBinding) || !binding.texture || !binding.validate().ok) return false;
  const enabled = material.getParameter(enabledParameter);
  return enabled === undefined || Number(enabled) > 0.5;
}

function isFallbackWhiteMaterial(material: Material): boolean {
  if (materialHasTexture(material, "u_baseColorTexture", "u_baseColorTextureEnabled")) return false;
  const baseColor = material.getParameter("u_baseColor");
  if (!Array.isArray(baseColor) && !ArrayBuffer.isView(baseColor)) return false;
  const channels = Array.from(baseColor as ArrayLike<number>);
  if (channels.length < 4) return false;
  const whiteBase = channels[0] >= 0.985 && channels[1] >= 0.985 && channels[2] >= 0.985 && channels[3] >= 0.985;
  const metallic = Number(material.getParameter("u_metallic") ?? 0);
  const roughness = Number(material.getParameter("u_roughness") ?? 1);
  return whiteBase && metallic <= 0.001 && roughness >= 0.98;
}

let browserDracoDecoderPromise: Promise<GLTFDracoDecoder> | undefined;

async function createBrowserDracoDecoder(): Promise<GLTFDracoDecoder> {
  browserDracoDecoderPromise ??= createBrowserDracoDecoderUncached();
  return browserDracoDecoderPromise;
}

async function createBrowserDracoDecoderUncached(): Promise<GLTFDracoDecoder> {
  const decoderScriptUrl = new URL("/node_modules/draco3d/draco_decoder_nodejs.js", window.location.origin).href;
  const decoderWasmUrl = new URL("/node_modules/draco3d/draco_decoder.wasm", window.location.origin).href;
  const response = await fetch(decoderScriptUrl);
  if (!response.ok) {
    throw new Error(`Failed to load Draco decoder: HTTP ${response.status}`);
  }
  const source = await response.text();
  const sourceMapIndex = source.indexOf("//# sourceMappingURL=");
  const moduleSource = sourceMapIndex >= 0 ? source.slice(0, sourceMapIndex) : source;
  const factory = new Function(`${moduleSource}\nreturn typeof DracoDecoderModule === "function" ? DracoDecoderModule : undefined;`)() as unknown;
  if (typeof factory !== "function") {
    throw new Error("Draco decoder script did not expose DracoDecoderModule.");
  }
  const module = await (factory as DracoDecoderModuleFactory)({
    locateFile: (file) => file === "draco_decoder.wasm" ? decoderWasmUrl : new URL(file, decoderScriptUrl).href
  });
  const base = createDracoDecoder(module);
  return (source: Uint8Array, descriptor: GLTFDracoDecodeDescriptor) => base(source, descriptor);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

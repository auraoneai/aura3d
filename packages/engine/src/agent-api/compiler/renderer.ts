// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraBackend, AuraCreateAppRendererOptions, AuraLightNode, AuraMaterialSpec, AuraModelNode, AuraRendererDiagnosticReport, AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry, WebGLSceneRenderer } from "../nodes/types.js";
import { colorToAcesInputClearColor, colorToClearColor, colorToLinearRgb, colorToLinearRgba } from "../colorUtils.js";
import { configureBloomFusionDevice, decodedModelDirectPathBlockers, isDirectRenderPath, isFusedBloomPasses, recordDecodedDirectPathBlockers, type BloomFusionDevice } from "../app/renderPath.js";
import { createAssetProvenance, formatSkippedInlineModelWarning } from "../diagnostics.js";
import { sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";
import { groups } from "../nodes/groups.js";
import { AuraClipGroup } from "../nodes/clipping.js";
import { getMaterialClipping, getSceneClipping } from "../nodes/scene.js";
import { primitive } from "../nodes/primitives.js";
import { ignoredOptionMessages } from "../nodes/optionDiagnostics.js";
import { createRendererDiagnosticReport, rendererFrameTimingFromInspection } from "../rendererDiagnostics.js";
import { clamp01, createViewProjection } from "../sceneMath.js";
import { resolveCameraFrame } from "./camera.js";
import { createProductionRuntimeCollectedLights, createProductionRuntimePostprocessObservation, createProductionRuntimeShadowObservation, createProductionTexturesObservation, countContributorContentNodes, formatLightModulationWarning, isRenderableModelNode, unsupportedLightModulationDegradations } from "./observations.js";
import { createProductionTextObservation } from "./text.js";
import { getRootPerformanceQuality, getRootRenderSource } from "../RootRuntimeSupport.js";
import { createProductionRuntimePostprocess } from "./postprocess.js";
import { Renderer, RenderDeviceError, webGL2MaxTextureSize, bindShaderFailureStore, shaderFailureStoreFor, subscribeProgramReadiness, type RendererOptions, type ProductionRendererFeature, type ProductionRendererInput, type RenderDeviceDiagnostics } from "@aura3d/rendering";
import { rendererFeatureReport, rendererInteractiveFeatureReport, validateProductionRendererInput } from "../rendererReports.js";
import { normalizeTextureBudgetBytes, normalizeTextureBudgetPolicy, resolveBackendOptions, resolveDrawingPathOptions, resolvePhotometricProfilesOption, resolveProjectedSpotImagesOption, type ResolvedBackendOptions } from "../app/rendererOptions.js";
import { createProductionRuntimeEnvironment, environmentKnobKey } from "./environment.js";
import { contactShadowKeyWarning } from "./contactShadowKey.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries, observePrimitiveMaterial, primitiveMaterialAppliedRevision, upgradeProductionEnvironmentHdri } from "./primitives.js";
import { qrPrimitiveGeometryOptions } from "./geometry.js";
import { assertFramePivotSupported, createProductionRuntimeRendererInput, frameUsesLegacyModelMatrix, inheritBuiltinGlyphFrame, releaseBuiltinGlyphFrameOwner, retainBuiltinGlyphFrame, rootRenderSourceForFrame, setPrd01ModelMatrixCache } from "./renderInput.js";
import { isHtmlCanvas } from "./labels.js";
import { createBuiltinGlyphAtlasScope, isBuiltinGlyphResource, retireBuiltinGlyphResource, type BuiltinGlyphAtlasScope } from "./BuiltinGlyphAtlas.js";
import { rootSdfFontAtlas } from "../nodes/text3d.js";
import { flattenNodesWithLineWorldMatrices, modelMatrixFor } from "./sceneGraph.js";
import { createModelMatrixCache } from "../sceneGraph.js";
import { updateRuntimePhotometricLights } from "./lights.js";
import { runtimeMaterialRevision, type RuntimeMaterialChange } from "../app/runtimeNodes.js";
import { createAppTextureResidency, type AppTextureResidency } from "./textureResidency.js";
import { createAdvancedLightingBridge, type AdvancedLightingBridge } from "./advancedLightingBridge.js";
import { qrCoreGeneratorOn } from "@aura3d/rendering";
import { programCacheSlot } from "@aura3d/rendering/contracts";
import { materialRoutesToGeneratedProgram } from "@aura3d/rendering";
import { createProductionRuntimeShadowOptions, describeProductionSpotShadow } from "./shadows.js";
import { clearProductionPrimitiveTextureQueued, isPreparedProductionPrimitiveTextureWorkCurrent, noteProductionPrimitiveTextureQueued, texturePendingMs, prepareProductionPrimitiveTextureWork, upgradeProductionPrimitiveTextures, type PreparedProductionPrimitiveTextureWork } from "./textures.js";
import { prepareCustomMaterialTextureWork, upgradeCustomMaterialTextures, type PreparedCustomMaterialTextureWork } from "./customTextures.js";
import { createProductionRuntimeBackgroundImage } from "./backgroundImage.js";
import { createProductionParitySurfaces } from "./paritySurfaces.js";
import { createProductionLensFlares } from "./lensFlare.js";
import { camera } from "../nodes/camera.js";
import { geometry } from "../nodes/geometry.js";
import { material } from "../nodes/material.js";
import { asRuntimeCompiled, compileScene, compilerSlot, updateCompiledScene } from "../../contracts/compiler.js";
import { inheritCompiledBatchFrame, retainCompiledBatchFrame, type MountSceneCompileContext } from "./compileScene.js";
import { createDegradationSink } from "./degradation.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { markTiming } from "../platform.js";
import { QUALITY_TIERS, resolveTierSettings, type AuraQualityTier } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import { applyXRViewOverride } from "../xr/xrViewOverride.js";
import { withPrd01ColorParsing } from "./color.js";
import { resolveAppOutputColorPolicy } from "../app/colorManagement.js";
import { readActiveOutputColorSpace } from "../app/outputColorDiagnostics.js";
import { bindPostDiagnosticReader } from "../postBridge.js";
import type { Prd07MountAuthority } from "../vfx/bridge.js";
import type { TypedGLBActorOptions } from "../../production-runtime/TypedGLBActor.js";
import type { ProjectedSpotResource as RendererProjectedSpotResource } from "@aura3d/rendering";
import { disposePrd02Probes, prd02BeforeFrame, prd02BeforeFrameAsync, withPrd02ProbeFrameLock, type Prd02ProbeCaptureRenderer } from "@aura3d/rendering";
import { rendererQrFlags, setRendererQrFlags } from "@aura3d/rendering";
import { assertPrd07RendererLeaseAvailable, assertPrd07RendererOperation, beginPrd07RendererOperation, bindPrd07RendererAuthority,
  endPrd07RendererOperation, withBorrowedPrd07RendererOperation, withPrd07RendererCanvasLock,
  type Prd07RendererOperation } from "@aura3d/rendering";
import type { AtmosphereRenderSnapshot } from "../../production-runtime/effects/LiveAtmosphere.js";
import { reportLookHdriMissing } from "./environmentFallback.js";

/** Models that need a loaded actor at mount (hidden-at-mount models with a runtime handle can be shown later); module-private,
 * identical to the predicate in observations.ts. */
function isMountableModelNode(node: AuraSceneNode): node is AuraModelNode {
  return node.kind === "model" && Boolean(node.asset.url) && (node.visible !== false || node.runtime?.id !== undefined);
}


const syncProductionFrames = new WeakSet<object>();
const prd07ProbeSnapshots = new WeakMap<object, { readonly renderer: Renderer; readonly device: Renderer["device"]; readonly snapshot: Prd07RendererOperation["snapshot"] }>();
const probeLockCheckFlags: QrFlags = { values: {}, on: () => false };
const emptyProbeLockSource: ProductionRendererInput["source"] = {};

function alignPrd07ProbeSnapshot(renderer: Renderer, owner: object, operation: Prd07RendererOperation | undefined): void {
  if (!operation) return;
  const previous = prd07ProbeSnapshots.get(owner);
  // Periodic probes deliberately keep partial cube faces between frames. A
  // changed atmosphere must restart that capture, not complete a mixed cube.
  if (previous && previous.device === renderer.device &&
      (previous.renderer !== renderer || previous.snapshot !== operation.snapshot)) {
    disposePrd02Probes(renderer.device, owner);
  }
  prd07ProbeSnapshots.set(owner, { renderer, device: renderer.device, snapshot: operation.snapshot });
}

function resetPrd07ProbeSnapshot(renderer: Renderer, owner: object): void {
  const previous = prd07ProbeSnapshots.get(owner);
  if (previous?.device === renderer.device && previous.renderer !== renderer) return;
  if (previous?.device === renderer.device) prd07ProbeSnapshots.delete(owner);
  disposePrd02Probes(renderer.device, owner);
}

function probeCaptureRenderer(renderer: Renderer, operation: Prd07RendererOperation | undefined): Prd02ProbeCaptureRenderer {
  if (!operation) return renderer;
  return { device: renderer.device, renderProbeFace: (source, face, target, viewProjection) =>
    withBorrowedPrd07RendererOperation(renderer, operation, () => renderer.renderProbeFace(source, face, target, viewProjection)) };
}

function withSyncProductionFrame<T>(renderer: Renderer, action: () => T): T {
  assertPrd07RendererLeaseAvailable(renderer);
  if (syncProductionFrames.has(renderer.device)) throw new Error("PRODUCTION_FRAME_IN_PROGRESS");
  syncProductionFrames.add(renderer.device);
  try {
    // The probe host owns the async device lock. With lighting disabled this
    // checks that lock without registering probes or capturing anything.
    prd02BeforeFrame(renderer, emptyProbeLockSource, probeLockCheckFlags);
    return action();
  } finally {
    syncProductionFrames.delete(renderer.device);
  }
}

function renderProductionSourceWithProbesInFrame(renderer: Renderer, source: ProductionRendererInput["source"], camera: ProductionRendererInput["camera"], flags: QrFlags, owner: object): RenderDeviceDiagnostics {
  const previous = rendererQrFlags(renderer.device);
  setRendererQrFlags(flags, renderer.device);
  let operation: Prd07RendererOperation | undefined;
  try {
    operation = beginPrd07RendererOperation(renderer);
    alignPrd07ProbeSnapshot(renderer, owner, operation);
    prd02BeforeFrame(probeCaptureRenderer(renderer, operation), source, flags, owner);
    if (operation) assertPrd07RendererOperation(operation);
    return withBorrowedPrd07RendererOperation(renderer, operation, () => renderer.render(source, camera));
  } catch (error) {
    if (operation) { try { resetPrd07ProbeSnapshot(renderer, owner); } catch { /* Preserve the frame failure. */ } }
    throw error;
  } finally {
    endPrd07RendererOperation(operation);
    setRendererQrFlags(previous, renderer.device);
  }
}

/** Capture from the complete source before a synchronous production frame. */
export function renderProductionSourceWithProbes(renderer: Renderer, source: ProductionRendererInput["source"], camera: ProductionRendererInput["camera"], flags: QrFlags, owner: object): RenderDeviceDiagnostics {
  return withSyncProductionFrame(renderer, () => renderProductionSourceWithProbesInFrame(renderer, source, camera, flags, owner));
}

async function renderProductionSourceWithProbesInAsyncFrame(renderer: Renderer, source: ProductionRendererInput["source"], camera: ProductionRendererInput["camera"], flags: QrFlags, owner: object, isDisposed: () => boolean): Promise<RenderDeviceDiagnostics> {
  if (isDisposed()) throw new Error("Renderer was disposed before probe capture");
  const previous = rendererQrFlags(renderer.device);
  setRendererQrFlags(flags, renderer.device);
  let operation: Prd07RendererOperation | undefined;
  try {
    operation = beginPrd07RendererOperation(renderer);
    alignPrd07ProbeSnapshot(renderer, owner, operation);
    await prd02BeforeFrameAsync(probeCaptureRenderer(renderer, operation), source, flags, owner);
    if (isDisposed()) throw new Error("Renderer was disposed during probe capture");
    if (operation) assertPrd07RendererOperation(operation);
    return await withBorrowedPrd07RendererOperation(renderer, operation, () => renderer.renderAsync(source, camera));
  } catch (error) {
    if (operation) { try { resetPrd07ProbeSnapshot(renderer, owner); } catch { /* Preserve the frame failure. */ } }
    throw error;
  } finally {
    endPrd07RendererOperation(operation);
    setRendererQrFlags(previous, renderer.device);
  }
}

/** Await native asynchronous readback before the associated production frame. */
export async function renderProductionSourceWithProbesAsync(renderer: Renderer, source: ProductionRendererInput["source"], camera: ProductionRendererInput["camera"], flags: QrFlags, owner: object, isDisposed: () => boolean): Promise<RenderDeviceDiagnostics> {
  return withPrd07RendererCanvasLock(renderer, () =>
    withPrd02ProbeFrameLock(renderer.device, () => renderProductionSourceWithProbesInAsyncFrame(renderer, source, camera, flags, owner, isDisposed)));
}

export interface ProductionBackendSelection {
  readonly requested: "webgl2" | "webgpu" | "auto";
  readonly active: "webgl2" | "webgpu";
  readonly fallbackReason?: string;
  readonly missingFeatures: readonly string[];
  readonly deviceLost: boolean;
}

/** Per-mount ownership and asset transport, retained across asynchronous loads. */
export interface ProductionRuntimeMountContext {
  readonly runtimeOwner?: object;
  /** The worker has no app-level registration; bind and release it with this renderer. */
  readonly ownRenderInputCache?: boolean;
  readonly request?: TypedGLBActorOptions["request"];
  readonly formatRegistry?: TypedGLBActorOptions["formatRegistry"];
  readonly assetOptions?: import("../../contracts/assets.js").AuraAssetsOption;
  /** Internal app-owned handoff; staged until the managed frame route is complete. */
  readonly getPrd07MountAuthority?: () => Prd07MountAuthority | null | undefined;
}

/** Discover only live authored controllers; JSON snapshots need no listener.
 * Runtime handle materials replace the corresponding authored node material. */
function liveClippingGroups(snapshot: AuraSceneSnapshot, runtimeNodes?: AuraRuntimeNodeRegistry): Set<AuraClipGroup> {
  const scene = (runtimeNodes as (AuraRuntimeNodeRegistry & { sceneWithRuntimeAdditions?: () => AuraSceneSnapshot | undefined }) | undefined)?.sceneWithRuntimeAdditions?.() ?? snapshot;
  const handles = new Map((runtimeNodes?.all() ?? []).map(handle => [handle.id, handle]));
  const visited = new Set<string>();
  const out = new Set<AuraClipGroup>();
  const add = (value: unknown): void => { if (value instanceof AuraClipGroup) out.add(value); };
  const addMaterial = (value: AuraMaterialSpec | undefined): void => add(getMaterialClipping(value));
  add(getSceneClipping(scene));
  const visit = (nodes: readonly AuraSceneNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "group") { visit(node.children); continue; }
      const id = "runtime" in node ? node.runtime?.id : undefined;
      const handle = id ? handles.get(id) : undefined;
      if (id && handle) visited.add(id);
      const current = handle?.snapshot() as { readonly material?: AuraMaterialSpec } | undefined;
      addMaterial(current?.material ?? ("material" in node ? node.material : undefined));
      if (node.kind === "primitive") for (const level of node.lod?.levels ?? []) addMaterial(level.material);
    }
  };
  visit(scene.nodes);
  for (const [id, handle] of handles) {
    if (!visited.has(id)) addMaterial((handle.snapshot() as { readonly material?: AuraMaterialSpec }).material);
  }
  return out;
}

const webgpuLacksDepth = (createProductionRuntimePostprocess as unknown as Record<symbol, ((snapshot: AuraSceneSnapshot, canvas: HTMLCanvasElement | OffscreenCanvas) => boolean) | undefined>)[
  Symbol.for("@aura3d/root-postprocess/webgpu-depth-gap/v1")];

/**
 * Initialized-renderer selection. `webgpuGap` is the capability the scene needs that
 * WebGPU cannot provide, checked before any WebGPU device or canvas context exists (a canvas that handed out a `webgpu`
 * context can never hand out `webgl2`). With `allowFallback` the mount goes straight to WebGL2; strict throws.
 * Kept module-private so the public declaration of `createSelectedProductionRenderer` is unchanged.
 */
async function selectProductionRenderer(
  options: RendererOptions,
  selection: ResolvedBackendOptions,
  create: (options: RendererOptions) => Promise<Renderer> = Renderer.create,
  webgpuGap?: () => { readonly code: string; readonly missing: readonly string[] } | undefined
): Promise<{ readonly renderer: Renderer; readonly selection: ProductionBackendSelection }> {
  const rejectRenderer = async (renderer: Renderer, error: unknown, backend: "webgl2" | "webgpu"): Promise<never> => {
    const failures: unknown[] = [];
    try { renderer.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
    if (!failures.length) {
      try { await renderer.whenOwnedDeviceDisposed?.(); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (failures.length) {
      if (backend === "webgpu") throw webGPUOwnershipCleanupFailure(error, failures);
      throw new AggregateError([error, ...failures], "Renderer initialization and cleanup failed", { cause: error });
    }
    throw error;
  };
  const make = async (backend: "webgl2" | "webgpu"): Promise<Renderer> => {
    const renderer = await create({
      ...options,
      backend,
      ...(backend === "webgpu" ? {
        webgpuRequiredFeatures: selection.requiredFeatures,
        requireNativeRendering: true,
        webgpuCanvasOwnership: "exclusive" as const
      } : {})
    } as RendererOptions);
    try {
      if (renderer.device.kind !== backend) {
        throw new Error(`BACKEND_SELECTION_MISMATCH: requested ${backend}`);
      }
      if (backend === "webgpu") {
        const capabilities = new Set<string>(renderer.device.info.capabilities ?? []);
        const missing = ["native-render-pipeline", "canvas-surface"].filter((feature) => !capabilities.has(feature));
        if (missing.length) {
          const error = new Error(`WEBGPU_RENDERING_UNAVAILABLE: ${missing.join(", ")}`) as Error & { code: string; details: { missing: string[] } };
          error.code = "WEBGPU_RENDERING_UNAVAILABLE";
          error.details = { missing };
          throw error;
        }
      }
      return renderer;
    } catch (error) {
      return rejectRenderer(renderer, error, backend);
    }
  };
  if (selection.requested === "webgl2") {
    const renderer = await make("webgl2");
    return { renderer, selection: { requested: "webgl2", active: "webgl2", missingFeatures: [], deviceLost: false } };
  }
  const gap = webgpuGap?.();
  if (gap) {
    if (!selection.allowFallback) {
      throw new RenderDeviceError(`${gap.code}: the scene needs ${gap.missing.join(", ")}, which the WebGPU backend does not provide`, gap.code, { backend: "webgpu" });
    }
    const renderer = await make("webgl2");
    return { renderer, selection: { requested: selection.requested, active: "webgl2", fallbackReason: gap.code, missingFeatures: [...gap.missing], deviceLost: false } };
  }
  try {
    const renderer = await make("webgpu");
    return { renderer, selection: { requested: selection.requested, active: "webgpu", missingFeatures: [], deviceLost: false } };
  } catch (error) {
    // A canvas/device ownership conflict is not a capability failure. Falling
    // back would try to acquire a different context on a surface a peer owns.
    const ownershipCode = (error as { code?: unknown } | null)?.code;
    if (ownershipCode === "WEBGPU_CANVAS_IN_USE" || ownershipCode === "WEBGPU_DEVICE_IN_USE" ||
        ownershipCode === "WEBGPU_OWNERSHIP_CLEANUP_FAILED") throw error;
    if (!selection.allowFallback) throw error;
    const candidate = error as { code?: unknown; details?: { missing?: unknown; missingFeatures?: unknown } } | null;
    // Codes and feature identifiers are bounded identifiers, never driver messages or URLs.
    const code = typeof candidate?.code === "string" && /^[A-Z0-9_]{1,96}$/.test(candidate.code)
      ? candidate.code : "WEBGPU_INITIALIZATION_FAILED";
    const missingDetails = candidate?.details?.missingFeatures ?? candidate?.details?.missing;
    const missing = Array.isArray(missingDetails)
      ? missingDetails.filter((value): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,96}$/.test(value))
      : [];
    let renderer: Renderer;
    try {
      renderer = await make("webgl2");
    } catch (fallbackError) {
      const failure = new Error(`WEBGPU_FALLBACK_UNAVAILABLE: WebGPU initialization failed (${code}) and WebGL2 could not initialize on this canvas`, { cause: fallbackError }) as Error & { code: string };
      failure.code = "WEBGPU_FALLBACK_UNAVAILABLE";
      throw failure;
    }
    return { renderer, selection: { requested: selection.requested, active: "webgl2", fallbackReason: code, missingFeatures: missing, deviceLost: false } };
  }
}

/** Select an initialized renderer, not merely an advertised adapter. */
export async function createSelectedProductionRenderer(
  options: RendererOptions,
  selection: ResolvedBackendOptions,
  create: (options: RendererOptions) => Promise<Renderer> = Renderer.create
): Promise<{ readonly renderer: Renderer; readonly selection: ProductionBackendSelection }> {
  return selectProductionRenderer(options, selection, create);
}
/** Registered hook carrying the WebGPU capability-gap parameter without widening the public signature. */
const SELECT_WITH_WEBGPU_GAP = Symbol.for("@aura3d/root-renderer/select-with-webgpu-gap/v1");
Object.defineProperty(createSelectedProductionRenderer, SELECT_WITH_WEBGPU_GAP, { value: selectProductionRenderer, configurable: true });

function webGPUOwnershipCleanupFailure(error: unknown, cleanupFailures: readonly unknown[]): RenderDeviceError {
  const failure = new RenderDeviceError(
    "WEBGPU_OWNERSHIP_CLEANUP_FAILED: Renderer initialization failed and WebGPU cleanup could not be confirmed",
    "WEBGPU_OWNERSHIP_CLEANUP_FAILED"
  );
  failure.cause = new AggregateError([error, ...cleanupFailures], "Renderer initialization and cleanup failed", { cause: error });
  return failure;
}

/** Preserve the canvas-specific overload so WebGL2 is not widened to all rendering contexts. */
function webGL2Context(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext | null {
  if (isHtmlCanvas(canvas)) return canvas.getContext("webgl2", { stencil: true });
  return canvas.getContext("webgl2", { stencil: true });
}

export async function createProductionRuntimeSceneRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  qrFlags?: QrFlags,
  degradation?: import("../app/mountRenderer.js").AuraSceneDegradationOptions,
  canvasContext?: import("../app/mountRenderer.js").AuraCanvasContextOptions,
  mountContext?: ProductionRuntimeMountContext
): Promise<WebGLSceneRenderer & { readonly loadedAssetIds: readonly string[] }> {
  // The root app's extension hooks are HTML-canvas-only; worker rendering owns
  // its separate state without installing those DOM lifecycle hooks.
  const htmlCanvas = isHtmlCanvas(canvas) ? canvas : undefined;
  const requestPhotometricProfiles = resolvePhotometricProfilesOption(rendererOptions);
  const requestProjectedSpotImages = resolveProjectedSpotImagesOption(rendererOptions);
  const runtimeOwner = mountContext?.runtimeOwner ?? canvas;
  const mountAbort = new AbortController();
  const parentSignal = mountContext?.request?.signal;
  const abortFromParent = (): void => mountAbort.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const stopMount = (): void => {
    parentSignal?.removeEventListener("abort", abortFromParent);
    if (!mountAbort.signal.aborted) mountAbort.abort();
  };
  const ensureMountActive = (): void => {
    if (mountAbort.signal.aborted) {
      const error = new Error("Renderer mount was cancelled") as Error & { code: string };
      error.name = "AbortError";
      error.code = "RENDERER_MOUNT_CANCELLED";
      throw error;
    }
  };
  const request = { ...mountContext?.request, signal: mountAbort.signal };
  // A facade lets dynamic additions use the same mount scope without creating
  // a font snapshot or texture for mounts that never opt in to the atlas.
  let glyphScope: BuiltinGlyphAtlasScope | undefined;
  let glyphScopeClosed = false;
  const getGlyphScope = (): BuiltinGlyphAtlasScope => {
    if (glyphScopeClosed || mountAbort.signal.aborted) throw new Error("Aura3D built-in glyph atlas is closed.");
    return glyphScope ??= createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
  };
  const builtinGlyphAtlas: BuiltinGlyphAtlasScope = {
    get texture() { return getGlyphScope().texture; },
    get sampler() { return getGlyphScope().sampler; },
    acquire: (glyph) => getGlyphScope().acquire(glyph),
    tryAcquireLabel: (image) => getGlyphScope().tryAcquireLabel!(image),
    hold: () => getGlyphScope().hold!(),
    flush: () => getGlyphScope().flush(),
    isOpen: () => !glyphScopeClosed && !mountAbort.signal.aborted && (glyphScope?.isOpen() ?? true),
    dispose: () => {
      if (glyphScopeClosed) return;
      glyphScopeClosed = true;
      glyphScope?.dispose();
    },
    whenDisposed: () => glyphScope?.whenDisposed() ?? Promise.resolve()
  };
  const residencyBudget = rendererOptions?.textureResidency?.budgetBytes;
  if (rendererOptions?.textureResidency !== undefined && (!Number.isSafeInteger(residencyBudget) || residencyBudget! < 1)) {
    stopMount();
    throw new Error("textureResidency.budgetBytes must be a positive safe integer");
  }
  const createdActors: ProductionRuntimeActorEntry["actor"][] = [];
  let mountPrimitives: readonly ProductionRuntimePrimitiveEntry[] = [];
  let mountCompiled: ReturnType<typeof asRuntimeCompiled> = null;
  let projectedSpotImageAdmissionEnabled = false;
  let residencyCleanupFailed = false;
  let releaseRenderInputCache: (() => void) | undefined;
  const disposePrimitives = (entries: readonly ProductionRuntimePrimitiveEntry[]): void => {
    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
    for (const { resources } of entries) {
      for (const resource of resources) {
        if (isBuiltinGlyphResource(resource)) {
          cleanup(() => { retireBuiltinGlyphResource(resource); });
          continue;
        }
        const { geometry, shadowGeometry, material, texturedMaterial, textureDisposer } = resource;
        cleanup(() => textureDisposer?.());
        cleanup(() => geometry.dispose());
        cleanup(() => shadowGeometry?.dispose());
        cleanup(() => material.dispose());
        cleanup(() => texturedMaterial?.dispose());
      }
    }
    if (failures.length) throw new AggregateError(failures, "Primitive resource cleanup failed");
  };
  try {
  ensureMountActive();
  const flags = qrFlags ?? resolveQrFlags({});
  if (mountContext?.ownRenderInputCache) {
    releaseRenderInputCache = setPrd01ModelMatrixCache(
      flags.on("A3D_QR_CORE") ? createModelMatrixCache(modelMatrixFor(flags)) : null, runtimeOwner
    );
  }
  const flattened = groups.flatten(snapshot.nodes);
  const profileLightNodes = flattenNodesWithLineWorldMatrices(snapshot.nodes);
  const renderableModelNodes = flattened.filter(isRenderableModelNode);
  for (const node of renderableModelNodes) {
    assertFramePivotSupported(node, runtimeNodes, frameUsesLegacyModelMatrix(runtimeOwner));
  }
  const modelNodes = flattened.filter(isMountableModelNode).filter((node) =>
    createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"
  );
  const skippedInlineModelWarnings = renderableModelNodes
    .filter((node) => createAssetProvenance(node.asset).source === "inline-definition")
    .map((node) => formatSkippedInlineModelWarning(node));
  const runtimeWarnings = new Set<string>(skippedInlineModelWarnings);
  const photometricViewWarnings = new Map<string, { readonly frame: number; readonly warning: string }>();
  const photometricSinkKeys = new Set<string>();
  const projectedSpotViewWarnings = new Map<string, { readonly frame: number; readonly warning: string }>();
  const projectedSpotSinkKeys = new Set<string>();
  const strict = degradation?.strict ?? flags.on("A3D_QR_STRICT");
  const appDegrade = createDegradationSink({
    strict,
    ...(degradation?.onDegradation ? { onDegradation: degradation.onDegradation } : {}),
    warn: (message) => { runtimeWarnings.add(message); }
  });
  const photometricAdmission = requestPhotometricProfiles ? {
    onUnsupported(issue: { readonly reason: string; readonly message: string; readonly viewId: string | number; readonly frameIndex: number }): void {
      if (mountAbort.signal.aborted) throw new Error("PHOTOMETRIC_PROFILE_ADMISSION_DISPOSED");
      if (!issue || typeof issue.reason !== "string" || !issue.reason || typeof issue.message !== "string" ||
          (typeof issue.viewId !== "string" && !(typeof issue.viewId === "number" && Number.isFinite(issue.viewId))) ||
          !Number.isSafeInteger(issue.frameIndex) || issue.frameIndex < 0) {
        throw new TypeError("Invalid photometric profile admission report");
      }
      const view = sanitizeDiagnosticText(String(issue.viewId)).slice(0, 256);
      const reason = sanitizeDiagnosticText(issue.reason).slice(0, 128);
      const detail = sanitizeDiagnosticText(issue.message);
      const key = JSON.stringify([typeof issue.viewId, view, reason]);
      const message = `PHOTOMETRIC_PROFILE_UNSUPPORTED: view ${view}, frame ${issue.frameIndex}, ${reason}: ${detail}`;
      if (!photometricViewWarnings.has(key) && photometricViewWarnings.size >= 128) {
        const oldest = photometricViewWarnings.keys().next().value;
        if (oldest !== undefined) photometricViewWarnings.delete(oldest);
      }
      // These warnings describe a reported frame, so a later supported view
      // cannot make an earlier fallback appear to be the current outcome.
      const previous = photometricViewWarnings.get(key);
      if (!previous || issue.frameIndex >= previous.frame) {
        photometricViewWarnings.set(key, { frame: issue.frameIndex, warning: `[capability-degraded] ${message}; scalar fallback may be used.` });
      }
      if (!photometricSinkKeys.has(key) && photometricSinkKeys.size < 128) photometricSinkKeys.add(key);
      const sinkKey = photometricSinkKeys.has(key) ? key : "additional-views";
      appDegrade({ code: "capability-degraded", nodeId: `photometric-view:${sinkKey}`, message, frame: issue.frameIndex });
    }
  } : undefined;
  const projectedSpotAdmission = requestProjectedSpotImages ? {
    resolveResource(asset: unknown): RendererProjectedSpotResource<unknown> | undefined {
      if (!projectedSpotImageAdmissionEnabled || mountAbort.signal.aborted) return undefined;
      const compiled = mountCompiled as (NonNullable<ReturnType<typeof asRuntimeCompiled>> & {
        projectedSpotResourceFor?: (candidate: unknown) => RendererProjectedSpotResource<unknown> | undefined;
      }) | null;
      try { return compiled?.projectedSpotResourceFor?.(asset); } catch { return undefined; }
    },
    onUnsupported(issue: { readonly reason: string; readonly message: string; readonly viewId: string | number; readonly frameIndex: number }): void {
      if (mountAbort.signal.aborted) throw new Error("PROJECTED_SPOT_ADMISSION_DISPOSED");
      if (!issue || typeof issue.reason !== "string" || !issue.reason || typeof issue.message !== "string" ||
          (typeof issue.viewId !== "string" && !(typeof issue.viewId === "number" && Number.isFinite(issue.viewId))) ||
          !Number.isSafeInteger(issue.frameIndex) || issue.frameIndex < 0) {
        throw new TypeError("Invalid projected spot admission report");
      }
      const view = sanitizeDiagnosticText(String(issue.viewId)).slice(0, 256);
      const reason = sanitizeDiagnosticText(issue.reason).slice(0, 128);
      const detail = sanitizeDiagnosticText(issue.message);
      const key = JSON.stringify([typeof issue.viewId, view, reason]);
      const message = `PROJECTED_SPOT_UNSUPPORTED: view ${view}, frame ${issue.frameIndex}, ${reason}: ${detail}`;
      if (!projectedSpotViewWarnings.has(key) && projectedSpotViewWarnings.size >= 128) {
        const oldest = projectedSpotViewWarnings.keys().next().value;
        if (oldest !== undefined) projectedSpotViewWarnings.delete(oldest);
      }
      const previous = projectedSpotViewWarnings.get(key);
      if (!previous || issue.frameIndex >= previous.frame) {
        projectedSpotViewWarnings.set(key, { frame: issue.frameIndex, warning: `[capability-degraded] ${message}; scalar fallback may be used.` });
      }
      if (!projectedSpotSinkKeys.has(key) && projectedSpotSinkKeys.size < 128) projectedSpotSinkKeys.add(key);
      const sinkKey = projectedSpotSinkKeys.has(key) ? key : "additional-views";
      appDegrade({ code: "capability-degraded", nodeId: `projected-spot-view:${sinkKey}`, message, frame: issue.frameIndex });
    }
  } : undefined;
  /*
   * Loaded here rather than imported at module scope (WS-2.2). This function is only reached when the
   * scene contains a typed GLB, so the glTF loader is downloaded exactly when it is needed.
   */
  const flagsOn = flags.on("A3D_QR_COMPILER") && compilerSlot.provided;
  if (!flagsOn && flattened.some(node => node.kind === "gaussian-splat")) {
    throw new Error("GAUSSIAN_SPLAT_COMPILER_REQUIRED: enable the scene compiler for Gaussian splat nodes");
  }
  if (!flagsOn && flattened.some(node => node.kind === "scalar-volume")) {
    throw new Error("SCALAR_VOLUME_COMPILER_REQUIRED: enable the scene compiler for scalar volume nodes");
  }
  let actorEntries: ProductionRuntimeActorEntry[] = flagsOn
    ? [] // flag-on: the C-36 compile owns entry assembly (see below)
    : modelNodes.length > 0
    ? await (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
        // Q-15-1 (#461, C-16 §7.3): with A3D_QR_ASSETS on, compressed GLBs
        // (meshopt/draco/KTX2) require their decoders from /aura-decoders/
        // and fail closed with AssetDecoderUnavailable; flag off spreads {}.
        const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js");
        const decoderOptions = typedGLBActorDecoderOptions(flags, mountContext?.assetOptions);
        return await Promise.all(modelNodes.map(async (node, index) => {
          const actor = await createTypedGLBActor({
            asset: node.asset,
            id: node.runtime?.id ?? node.asset.id ?? `model-${index + 1}`,
            name: node.name ?? node.asset.id ?? `model-${index + 1}`,
            runtimeOwner,
            request,
            ...(residencyBudget !== undefined ? { retainTextureResidencySources: true } : {}),
            ...(mountContext?.formatRegistry ? { formatRegistry: mountContext.formatRegistry } : {}),
            width: canvas.width,
            height: canvas.height,
            ...(node.hiddenNodeNames ? { hiddenNodeNames: node.hiddenNodeNames } : {}),
            ...(node.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
            ...decoderOptions,
            ...applyModelTintBridge(node)
          });
          if (mountAbort.signal.aborted) {
            actor.dispose();
            ensureMountActive();
          }
          createdActors.push(actor);
          // Skin presence is known only after acquisition. Register the actor
          // for mount cleanup before validating, but never publish it to the
          // renderer or texture residency if the combination is unsupported.
          assertFramePivotSupported(node, runtimeNodes, frameUsesLegacyModelMatrix(runtimeOwner), actor);
          return { node, actor };
        }));
      })()
    : [];
  // Initial opt-in text needs the selected device's limits before admission.
  // Other legacy scenes preserve their existing pre-device construction order.
  const deferLegacyGlyphPrimitives = !flagsOn && flattened.some((node) => node.kind === "primitive" && node.text3D?.sdfGlyphAtlas === "shared");
  let primitiveEntries: readonly ProductionRuntimePrimitiveEntry[] = flagsOn || deferLegacyGlyphPrimitives ? [] : withPrd01ColorParsing(runtimeOwner, () => createProductionRuntimePrimitiveEntries(flattened, qrPrimitiveGeometryOptions(flags, resolveMountQuality(rendererOptions), canvas)));
  mountPrimitives = primitiveEntries;
  // T2.4 — C-29 `Renderer.create` replaces `ProductionRuntimeRenderer.create`.
  // `preserveDrawingBuffer` is gone: frame capture flows through the C-05
  // `captureFrame`/`toBlob` path after a synchronous render, not the raw
  // WebGL drawing buffer.
  markTiming("a3d:mount:renderer-create:start");
  const requestedOutput = canvasContext?.output ?? rendererOptions?.output;
  const outputPolicy = resolveAppOutputColorPolicy(requestedOutput);
  const configuredTextureBudgetPolicy = normalizeTextureBudgetPolicy(rendererOptions?.textureBudgetPolicy);
  const effectiveResidencyBudget = residencyBudget === undefined ? undefined
    : Math.min(residencyBudget, configuredTextureBudgetPolicy?.maxBytes ?? residencyBudget);
  const textureBudgetPolicy = effectiveResidencyBudget === undefined ? configuredTextureBudgetPolicy
    : { ...configuredTextureBudgetPolicy, maxBytes: effectiveResidencyBudget };
  const { renderer: productionRenderer, selection: backendSelection } = await selectProductionRenderer({
    canvas,
    width: canvas.width,
    height: canvas.height,
    drawingPath: resolveDrawingPathOptions(rendererOptions),
    ...(textureBudgetPolicy !== undefined ? { textureBudgetPolicy } : {}),
    ...(photometricAdmission ? { photometricProfiles: photometricAdmission } : {}),
    ...(projectedSpotAdmission ? { projectedSpotImages: projectedSpotAdmission } : {}),
    antialias: true,
    ...(requestedOutput ? {
      presentationAlphaMode: outputPolicy.alphaMode,
      output: {
        ...outputPolicy,
        ...(requestedOutput.inputAlphaMode !== undefined ? { inputAlphaMode: requestedOutput.inputAlphaMode } : {}),
        ...(requestedOutput.toneMapping !== undefined ? { toneMapping: requestedOutput.toneMapping } : {}),
        ...(requestedOutput.exposure !== undefined ? { exposure: requestedOutput.exposure } : {}),
        ...(requestedOutput.dither !== undefined ? { dithering: requestedOutput.dither } : {}),
        ...(requestedOutput.backgroundPassthrough !== undefined ? { backgroundCoverage: requestedOutput.backgroundPassthrough } : {})
      }
    } : {}),
    // Only set when asked: the device default (false) is what a plain app needs.
    ...(canvasContext?.preserveDrawingBuffer === true ? { preserveDrawingBuffer: true } : {}),
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"],
    // Evidence/QA runs (a render source), strict apps and `?diag=1` read the GL error every frame; everything else samples it.
    ...((htmlCanvas && getRootRenderSource(htmlCanvas, runtimeOwner)) || degradation?.strict === true || (typeof location !== "undefined" && /[?&]diag=1(&|$)/.test(location.search))
      ? { errorCheckMode: "frame" as const }
      : {}),
    // Background colors are display intent. Pre-invert the renderer's coupled
    // matrix-fitted ACES transform so presentation preserves that authored color.
    // Direct path: nothing tone-maps the clear (the canvas is written as-is), so the authored display colour is the clear.
    clearColor: withPrd01ColorParsing(runtimeOwner, () => isDirectRenderPath(canvas) ? colorToClearColor(snapshot.background ?? "#070b12") : colorToAcesInputClearColor(snapshot.background ?? "#070b12")),
    // C-05 (A3D_QR_CORE_OUTPUT): the HDR target clears to the linear
    // background; alpha carries `background(c, { toneMapped })` coverage.
    outputClearColor: withPrd01ColorParsing(runtimeOwner, () => outputClearColor(snapshot)),
    // T0-28: the app's resolved flags bind to this renderer's device, so two
    // apps on one page never read each other's flags through FrameGraph.
    qrFlags: flags
  }, resolveBackendOptions(rendererOptions), undefined,
  // WebGPU never advertises sampleable depth textures; the legacy depth-aware passes need them (Renderer throws DEPTH_POSTPROCESS_UNSUPPORTED on the first frame).
  () => !isDirectRenderPath(canvas) && webgpuLacksDepth?.(snapshot, canvas)
    ? { code: "DEPTH_POSTPROCESS_UNSUPPORTED", missing: ["depth-textures"] } : undefined);
  let photometricProfileAdmissionEnabled = false;
  // T4.2: a throwing mount (compile handler, HDRI upgrade, C-36 strict)
  // must not leak the created renderer or the HDRI environment.
  let disposeHdriEnvironment: (() => void) | null = null;
  let textureResidency: AppTextureResidency | undefined;
  let advancedLightingBridge: AdvancedLightingBridge | undefined;
  let releasePrd07Renderer: (() => void) | undefined;
  try {
    ensureMountActive();
    bindShaderFailureStore(productionRenderer.device, shaderFailureStoreFor(runtimeOwner));
    markTiming("a3d:mount:renderer-create:resolved");
    // quality auto / cinematic: allow look-neutral bloom pass fusion (`production` never does).
    configureBloomFusionDevice(productionRenderer.device as unknown as BloomFusionDevice, canvas, rendererOptions);
    // Same gate, WP-7: sun cascades no receiver can select are not redrawn (pixel-identical; `production` keeps drawing every cascade).
    if (isFusedBloomPasses(canvas)) (productionRenderer.device as unknown as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades = true;
    const profileAdmissionMethod = (productionRenderer as Renderer & { photometricProfileAdmissionEnabled?: () => boolean }).photometricProfileAdmissionEnabled;
    photometricProfileAdmissionEnabled = Boolean(photometricAdmission && typeof profileAdmissionMethod === "function" && profileAdmissionMethod.call(productionRenderer) === true);
    if (projectedSpotAdmission && flagsOn) {
      try {
        const device = productionRenderer.device;
        const method = (productionRenderer as Renderer & { projectedSpotImageAdmissionEnabled?: () => boolean }).projectedSpotImageAdmissionEnabled;
        const completion = (device as typeof device & { supportsSubmittedWorkCompletion?: () => boolean }).supportsSubmittedWorkCompletion;
        const generation = device.generation;
        projectedSpotImageAdmissionEnabled = device.kind === "webgl2" && !device.disposed && !device.contextLost &&
          Number.isSafeInteger(generation) && (generation as number) >= 0 && typeof device.onDeviceLost === "function" &&
          typeof device.waitForSubmittedWork === "function" && typeof completion === "function" &&
          typeof method === "function" && method.call(productionRenderer) === true && completion.call(device) === true &&
          !device.disposed && !device.contextLost && device.generation === generation;
      } catch { projectedSpotImageAdmissionEnabled = false; }
    }
    // The supplier belongs to the app mount closure, not to RenderSource.
    // Legacy direct callers do not supply it and retain their existing route.
    if (mountContext?.getPrd07MountAuthority &&
        (flags.on("A3D_QR_VFX") || flags.on("A3D_QR_VFX_FOG"))) {
      const authority = mountContext.getPrd07MountAuthority();
      if (authority === null || (authority !== undefined &&
          (authority.owner !== runtimeOwner || authority.canvas !== canvas || !authority.isLive()))) {
        throw new Error("PRD07_APP_AUTHORITY_UNAVAILABLE");
      }
      if (authority) {
        releasePrd07Renderer = bindPrd07RendererAuthority(productionRenderer, productionRenderer.device, runtimeOwner, canvas, {
          owner: authority.owner, canvas: authority.canvas, overlay: authority.overlay,
          isLive: () => authority.isLive(), capture: () => authority.capture(),
          isCurrent: (snapshot) => authority.isCurrent(snapshot as AtmosphereRenderSnapshot),
          onRevoke: (listener) => authority.onRevoke(listener)
        });
      }
      ensureMountActive();
    }
    if (effectiveResidencyBudget !== undefined) {
      textureResidency = await createAppTextureResidency(productionRenderer.device, effectiveResidencyBudget);
      ensureMountActive();
      // The legacy bridge loads actors before creating the device. Register
      // their retained sources now, before any frame can bind a texture.
      for (const { actor } of actorEntries) textureResidency.trackActor(actor);
    }
    if (runtimeNodes) advancedLightingBridge = createAdvancedLightingBridge({
      owner: runtimeNodes,
      device: productionRenderer.device,
      targetCount: (name) => groups.flatten(((runtimeNodes as { sceneWithRuntimeAdditions?: () => AuraSceneSnapshot | undefined }).sceneWithRuntimeAdditions?.() ?? snapshot).nodes)
        .filter((node) => (node as { readonly name?: string }).name === name && (node.kind === "primitive" || isRenderableModelNode(node))).length,
      assertSupported: (_kind, item) => {
        const device = productionRenderer.device;
        const capabilities = new Set<string>(device.info.capabilities ?? []);
        const backendReady = device.kind === "webgl2" || (device.kind === "webgpu"
          && ["native-render-pipeline", "native-sampled-textures", "canvas-surface"].every((feature) => capabilities.has(feature)));
        if (!backendReady || !qrCoreGeneratorOn(flags) || !programCacheSlot.provided) {
          throw new Error("ADVANCED_LIGHTING_UNSUPPORTED: a live generated physical renderer with sampled textures is required");
        }
        if (item) {
          const material = item.material && "baseMaterial" in item.material ? item.material.baseMaterial : item.material;
          if (!material || !materialRoutesToGeneratedProgram(material, { core: true, lobes: false }, { flags, tier: resolveTierSettings(explicitMountQualityTier(rendererOptions) ?? "high") })) {
            throw new Error("ADVANCED_LIGHTING_UNSUPPORTED: this material does not use the generated program");
          }
        }
      }
    });
    let latestDeviceDiagnostics: RenderDeviceDiagnostics = productionRenderer.getDiagnostics();
    let latestFeatures: readonly ProductionRendererFeature[] = rendererFeatureReport(productionRenderer);
    // M2 streaming distances measure against the live camera eye; refreshed
    // every render so residency follows the camera instead of mount intent.
    let latestCameraEye: AuraVec3 = resolveCameraFrame(snapshot, snapshot.camera, 0, runtimeNodes).eye;
    let disposed = false;
    const committedResourceListeners = new Set<() => void>();
    const notifyCommittedResource = (): void => {
      if (disposed || mountAbort.signal.aborted) return;
      for (const listener of [...committedResourceListeners]) {
        try { listener(); } catch { /* A subscriber cannot undo a committed resource. */ }
      }
    };
    // C1 textured upgrade: fire-and-forget after mount. Scalar first frames stay
    // fast; outcomes land in textureUpgradeWarnings, which render() never clears
    // (per-frame runtimeWarnings are rebuilt every frame).
    const textureUpgradeWarnings = new Set<string>();
    const nativeTextureSize = productionRenderer.device.kind === "webgpu"
      ? (productionRenderer.device as { readonly nativeGpuDevice?: { readonly limits?: Readonly<Record<string, number>> } }).nativeGpuDevice?.limits?.maxTextureDimension2D
      : undefined;
    const textureSizeLimit = productionRenderer.device.kind === "webgl2"
      ? htmlCanvas ? webGL2MaxTextureSize(htmlCanvas) : (() => {
          // OffscreenCanvas supports the same WebGL2 query, but does not have
          // the HTML element type expected by the existing DOM helper.
          const gl = webGL2Context(canvas);
          return Number(gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096);
        })()
      : typeof nativeTextureSize === "number" && Number.isSafeInteger(nativeTextureSize) && nativeTextureSize > 0 ? nativeTextureSize : 4096;
    const configuredTextureSize = mountContext?.assetOptions?.maxTextureSize;
    const nativeTextureSizeLimit = configuredTextureSize === undefined ? textureSizeLimit : Math.min(textureSizeLimit, configuredTextureSize);
    // The shared atlas cannot be downscaled: its UVs and retained glyph regions
    // are defined in a 512-square texture. Require an actual device limit here;
    // the generic texture loader's 4096 fallback is not capability evidence.
    let glyphDeviceLimit: number | undefined;
    if (productionRenderer.device.kind === "webgpu") glyphDeviceLimit = nativeTextureSize;
    else if (productionRenderer.device.kind === "webgl2") {
      try {
        const gl = webGL2Context(canvas);
        const reported = gl?.getParameter(gl.MAX_TEXTURE_SIZE);
        if (typeof reported === "number") glyphDeviceLimit = reported;
      } catch { /* No verified limit: keep the ordinary text path. */ }
    }
    const glyphAtlasAdmitted = Number.isSafeInteger(glyphDeviceLimit) && glyphDeviceLimit! >= 512 &&
      (configuredTextureSize === undefined || configuredTextureSize >= 512) &&
      (textureBudgetPolicy?.maxDimension === undefined || textureBudgetPolicy.maxDimension >= 512) &&
      (textureBudgetPolicy?.maxBytes === undefined || textureBudgetPolicy.maxBytes >= 512 * 512 * 4);
    const admittedBuiltinGlyphAtlas = glyphAtlasAdmitted ? builtinGlyphAtlas : undefined;
    if (deferLegacyGlyphPrimitives) {
      primitiveEntries = withPrd01ColorParsing(runtimeOwner, () => createProductionRuntimePrimitiveEntries(flattened, qrPrimitiveGeometryOptions(flags, resolveMountQuality(rendererOptions), canvas), admittedBuiltinGlyphAtlas));
      mountPrimitives = primitiveEntries;
    }
    if (!Number.isSafeInteger(nativeTextureSizeLimit) || nativeTextureSizeLimit < 1) projectedSpotImageAdmissionEnabled = false;
    const projectedSpotMaxDimension = projectedSpotImageAdmissionEnabled ? Math.min(2048, nativeTextureSizeLimit) : undefined;
    type PrimitiveResource = ProductionRuntimePrimitiveEntry["resources"][number];
    type TextureJob = {
      readonly entry: ProductionRuntimePrimitiveEntry;
      readonly resource: PrimitiveResource;
      readonly material: PrimitiveResource["material"];
      readonly spec: PrimitiveResource["materialSpec"];
      readonly prepared: PreparedProductionPrimitiveTextureWork | undefined;
      readonly preparedCustom: PreparedCustomMaterialTextureWork | undefined;
      readonly controller: AbortController;
      started: boolean;
      finished: boolean;
      cancelled: boolean;
    };
    type CapturedTextureGeneration = {
      readonly material: PrimitiveResource["material"];
      readonly spec: PrimitiveResource["materialSpec"];
      readonly revision: number;
      readonly prepared: PreparedProductionPrimitiveTextureWork | undefined;
      readonly preparedCustom: PreparedCustomMaterialTextureWork | undefined;
    };
    const captureTextureGeneration = (resource: PrimitiveResource): CapturedTextureGeneration => ({
      material: resource.material,
      spec: resource.materialSpec,
      revision: primitiveMaterialAppliedRevision(resource),
      prepared: prepareProductionPrimitiveTextureWork(resource.materialSpec, request, nativeTextureSizeLimit),
      preparedCustom: prepareCustomMaterialTextureWork(resource.materialSpec, request, nativeTextureSizeLimit)
    });
    const trackedPrimitives = new Map<ProductionRuntimePrimitiveEntry, {
      readonly resources: Set<PrimitiveResource>;
      readonly release: () => void;
    }>();
    const textureJobs = new Map<PrimitiveResource, TextureJob>();
    // One pending job per resource; cancellation removes it immediately even
    // when every active slot is held by an abort-ignoring operation.
    const queuedTextureJobs = new Map<PrimitiveResource, TextureJob>();
    let activeTextureJobs = 0;
    let cancelledTextureJobs = 0;
    let queueSuspended = 0;
    let drainingTextureJobs = false;
    const textureQueueBlockedWarning = "TEXTURE_UPGRADE_QUEUE_BLOCKED: waiting for cancelled texture work to settle before starting another resource";
    let activeCompiled: ReturnType<typeof asRuntimeCompiled> = null;
    const hasCurrentMaterialRevision = (entry: ProductionRuntimePrimitiveEntry, resource: PrimitiveResource): boolean => {
      const id = entry.node.runtime?.id;
      if (!runtimeNodes || !id) return true;
      const handle = runtimeNodes.get(id);
      return handle !== undefined && primitiveMaterialAppliedRevision(resource) === runtimeMaterialRevision(handle);
    };
    const isCurrentTextureJob = (job: TextureJob): boolean => !disposed && !mountAbort.signal.aborted &&
      !job.controller.signal.aborted && textureJobs.get(job.resource) === job &&
      job.resource.material === job.material && job.resource.materialSpec === job.spec &&
      isPreparedProductionPrimitiveTextureWorkCurrent(job.prepared, job.resource.materialSpec) &&
      hasCurrentMaterialRevision(job.entry, job.resource);
    let drainTextureJobs = (): void => {};
    const finishTextureJob = (job: TextureJob): void => {
      if (job.finished) return;
      job.finished = true;
      // GU47 g09: a job cancelled or dropped before it started no longer reads as queued.
      if (!job.started) clearProductionPrimitiveTextureQueued(job.resource);
      if (job.started) activeTextureJobs -= 1;
      if (job.cancelled) cancelledTextureJobs -= 1;
      if (textureJobs.get(job.resource) === job) textureJobs.delete(job.resource);
      if (queuedTextureJobs.get(job.resource) === job) queuedTextureJobs.delete(job.resource);
      drainTextureJobs();
    };
    const cancelTextureJob = (resource: PrimitiveResource): void => {
      const job = textureJobs.get(resource);
      if (!job) return;
      textureJobs.delete(resource);
      if (queuedTextureJobs.get(resource) === job) queuedTextureJobs.delete(resource);
      if (job.started && !job.finished && !job.cancelled) { job.cancelled = true; cancelledTextureJobs += 1; }
      job.controller.abort();
      if (!job.started) finishTextureJob(job);
    };
    const cancelTextureJobs = (resources: Iterable<PrimitiveResource>): void => {
      queueSuspended += 1;
      try { for (const resource of resources) cancelTextureJob(resource); }
      finally { queueSuspended -= 1; drainTextureJobs(); }
    };
    drainTextureJobs = (): void => {
      if (disposed || mountAbort.signal.aborted || queueSuspended > 0 || drainingTextureJobs) return;
      drainingTextureJobs = true;
      try {
        // Bound actual per-resource work. Even an uncooperative cancelled
        // transport retains its slot until its promises settle.
        while (activeTextureJobs < 4 && queuedTextureJobs.size > 0) {
          const [resource, job] = queuedTextureJobs.entries().next().value!;
          queuedTextureJobs.delete(resource);
          if (job.finished || !isCurrentTextureJob(job)) { finishTextureJob(job); continue; }
          job.started = true;
          activeTextureJobs += 1;
          const oneEntry = { ...job.entry, resources: [job.resource] };
          const warn = (message: string): void => { if (isCurrentTextureJob(job)) textureUpgradeWarnings.add(message); };
          const committed = (): void => { if (isCurrentTextureJob(job)) notifyCommittedResource(); };
          const current = (): boolean => isCurrentTextureJob(job);
          const pbr = upgradeProductionPrimitiveTextures([oneEntry], warn, textureSizeLimit, undefined, job.controller.signal, committed, current, job.prepared, nativeTextureSizeLimit, flags)
            .catch((error) => { if (isCurrentTextureJob(job)) warn(`textured upgrade pass failed (${error instanceof Error ? error.message : String(error)}); scalar materials retained`); });
          const custom = upgradeCustomMaterialTextures([oneEntry], warn, undefined, job.controller.signal, committed, current, job.preparedCustom)
            .catch((error) => { if (isCurrentTextureJob(job)) warn(`custom material texture pass failed (${error instanceof Error ? error.message : String(error)}); white fallback retained`); });
          void Promise.allSettled([pbr, custom]).then(() => finishTextureJob(job));
        }
        const blockedByCancelledWork = activeTextureJobs >= 4 && cancelledTextureJobs > 0 &&
          [...textureJobs.values()].some((job) => !job.started && isCurrentTextureJob(job));
        if (blockedByCancelledWork) {
          textureUpgradeWarnings.add(textureQueueBlockedWarning);
        } else {
          textureUpgradeWarnings.delete(textureQueueBlockedWarning);
        }
      } finally { drainingTextureJobs = false; }
    };
    const enqueueTextureJob = (entry: ProductionRuntimePrimitiveEntry, resource: PrimitiveResource, captured?: CapturedTextureGeneration): void => {
      if (disposed || mountAbort.signal.aborted || !trackedPrimitives.has(entry) || !hasCurrentMaterialRevision(entry, resource)) return;
      cancelTextureJob(resource);
      const material = resource.material;
      const spec = resource.materialSpec;
      const revision = primitiveMaterialAppliedRevision(resource);
      const prepared = captured && captured.material === material && captured.spec === spec && captured.revision === revision
        ? captured.prepared : prepareProductionPrimitiveTextureWork(spec, request, nativeTextureSizeLimit);
      const preparedCustom = captured && captured.material === material && captured.spec === spec && captured.revision === revision
        ? captured.preparedCustom : prepareCustomMaterialTextureWork(spec, request, nativeTextureSizeLimit);
      if (disposed || mountAbort.signal.aborted || !trackedPrimitives.has(entry) || textureJobs.has(resource) ||
          resource.material !== material || resource.materialSpec !== spec || !hasCurrentMaterialRevision(entry, resource)) return;
      const job: TextureJob = { entry, resource, material, spec, prepared, preparedCustom,
        controller: new AbortController(), started: false, finished: false, cancelled: false };
      textureJobs.set(resource, job);
      queuedTextureJobs.set(resource, job);
      // GU47 e6 (g09 texPending): the whole job queue reads pending, not only the active slots.
      noteProductionPrimitiveTextureQueued(resource, prepared, flags);
      drainTextureJobs();
    };
    const trackPrimitiveEntry = (entry: ProductionRuntimePrimitiveEntry, captured?: ReadonlyMap<PrimitiveResource, CapturedTextureGeneration>): void => {
      if (disposed || mountAbort.signal.aborted || trackedPrimitives.has(entry)) return;
      const resources = new Set(entry.resources);
      const release = observePrimitiveMaterial(entry, {
        beforeReplace(_entry, resource) {
          cancelTextureJob(resource);
          resources.delete(resource);
        },
        afterApply(currentEntry, resource) {
          if (!trackedPrimitives.has(currentEntry)) return;
          resources.add(resource);
          enqueueTextureJob(currentEntry, resource);
        }
      });
      trackedPrimitives.set(entry, { resources, release });
      for (const resource of resources) enqueueTextureJob(entry, resource, captured?.get(resource));
    };
    const untrackPrimitiveEntries = (entries: readonly ProductionRuntimePrimitiveEntry[]): void => {
      queueSuspended += 1;
      try {
        for (const entry of entries) {
          const tracked = trackedPrimitives.get(entry);
          if (!tracked) continue;
          trackedPrimitives.delete(entry);
          tracked.release();
          for (const resource of tracked.resources) cancelTextureJob(resource);
        }
      } finally { queueSuspended -= 1; drainTextureJobs(); }
    };
    const scheduleAddedPrimitiveEntries = (entries: readonly ProductionRuntimePrimitiveEntry[]): void => {
      // The registry installs runtime handles just after this callback returns.
      // Capture request policy now, then register jobs after handles exist.
      const pending = entries.map((entry) => ({
        entry,
        captured: new Map(entry.resources.map((resource) => [resource, captureTextureGeneration(resource)] as const))
      }));
      queueMicrotask(() => {
        if (disposed || mountAbort.signal.aborted || !activeCompiled) return;
        const live = new Set(activeCompiled.primitiveEntries);
        for (const { entry, captured } of pending) {
          if (!live.has(entry)) continue;
          try { trackPrimitiveEntry(entry, captured); }
          catch (error) {
            if (!disposed && !mountAbort.signal.aborted) {
              textureUpgradeWarnings.add(`dynamic texture work failed (${error instanceof Error ? error.message : String(error)}); scalar materials retained`);
            }
          }
        }
      });
    };
    const materialEvents = runtimeNodes as (AuraRuntimeNodeRegistry & {
      onMaterialChange?: (listener: (change: RuntimeMaterialChange) => void) => () => void;
    }) | undefined;
    const releaseMaterialEvents = materialEvents?.onMaterialChange?.(({ handle, revision }) => {
      if (disposed || mountAbort.signal.aborted || runtimeMaterialRevision(handle) !== revision) return;
      const resources = [...trackedPrimitives.entries()]
        .filter(([entry]) => entry.node.runtime?.id === handle.id)
        .flatMap(([, tracked]) => [...tracked.resources]);
      cancelTextureJobs(resources);
    });
    const stopTextureWork = (): void => {
      releaseMaterialEvents?.();
      untrackPrimitiveEntries([...trackedPrimitives.keys()]);
      queuedTextureJobs.clear();
    };
    mountAbort.signal.addEventListener("abort", stopTextureWork, { once: true });
    for (const entry of primitiveEntries) trackPrimitiveEntry(entry);
    const productionEnvironment = withPrd01ColorParsing(runtimeOwner, () => createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false }));
    // B3 HDRI upgrade: fire-and-forget after mount. First frames render the
    // studio procedural fallback; the HDR chain swaps the lighting object the
    // render closure reads every frame. Outcomes land in hdriWarnings, which
    // render() never clears (per-frame runtimeWarnings are rebuilt every frame).
    let currentEnvironmentLighting = productionEnvironment.lighting;
    const mountKnobKey = environmentKnobKey(snapshot);
    let liveKnob: { nodes: unknown; lighting: typeof currentEnvironmentLighting | null } = { nodes: null, lighting: null };
    const hdriWarnings = new Set<string>();
    // LIGHT-09: mount-time lighting warning, kept with the other persistent environment warnings.
    const contactKeyWarning = withPrd01ColorParsing(runtimeOwner, () => contactShadowKeyWarning(snapshot));
    if (contactKeyWarning) hdriWarnings.add(contactKeyWarning);
    const hdriState: {
      status: "none" | "pending" | "ready" | "fallback";
      maxLinearValue?: number;
      specularMipCount?: number;
      dualProbe?: boolean;
    } = { status: productionEnvironment.hdriUrl ? "pending" : "none" };
    if (flattened.some((node) => node.kind === "environment" && node.environment === "hdri" && (node.texture as { kind?: string } | undefined)?.kind !== "aura-asset-ref")) {
      hdriWarnings.add("hdri environment has no texture asset ref; studio procedural fallback retained");
    }
    if (productionEnvironment.hdriUrl) {
      const hdriUrl = productionEnvironment.hdriUrl;
      const hdriReflectionUrl = productionEnvironment.hdriReflectionUrl;
      const hdriIntensity = productionEnvironment.intensity;
      const hdriRotation = productionEnvironment.hdriRotation;
      void upgradeProductionEnvironmentHdri(
        productionEnvironment.hdriAsset ?? hdriUrl,
        hdriIntensity,
        productionEnvironment.hdriReflectionAsset ?? hdriReflectionUrl,
        hdriRotation,
        { request, signal: mountAbort.signal }
      )
        .then((result) => {
          if (mountAbort.signal.aborted) { result.dispose(); return; }
          disposeHdriEnvironment?.();
          disposeHdriEnvironment = result.dispose;
          currentEnvironmentLighting = result.lighting;
          hdriState.status = "ready";
          hdriState.maxLinearValue = result.maxLinearValue;
          hdriState.specularMipCount = result.specularMipCount;
          hdriState.dualProbe = result.dualProbe;
          notifyCommittedResource();
        })
        .catch((error) => {
          if (mountAbort.signal.aborted || disposed) return;
          hdriState.status = "fallback";
          hdriWarnings.add(`HDRI upgrade failed for ${hdriUrl} (${error instanceof Error ? error.message : String(error)}); studio procedural fallback retained`);
          hdriWarnings.add(reportLookHdriMissing(hdriUrl, error instanceof Error ? error.message : String(error)).message);
        });
    }
    // GU47 E-B handoff: an explicit app quality tier caps the local shadow
    // casters (low 0 / medium 1 / high 2 / ultra 4); auto/unset keeps the
    // shadow config's own resolution (medium on a coarse pointer, else high).
    const mountShadowTier = explicitMountQualityTier(rendererOptions);
    const productionRuntimeLights = withPrd01ColorParsing(runtimeOwner, () => createProductionRuntimeCollectedLights(snapshot, flags, { hemisphereAsEnvironment: true, ...(mountShadowTier ? { shadowTier: mountShadowTier } : {}) }));
    updateRuntimePhotometricLights(profileLightNodes, runtimeNodes, productionRuntimeLights, 0);
    // threejs-parity L7/SG-10: `scene().background({ texture | cube })` —
    // async decode like the C1/B3 upgrades; feeds `source.environmentBackground`
    // without ever touching `environmentLighting` (no implicit IBL).
    const backgroundImage = createProductionRuntimeBackgroundImage(snapshot, (message) => {
      runtimeWarnings.add(message);
    }, { request, signal: mountAbort.signal, maxDimension: nativeTextureSizeLimit });
    // threejs-parity L7/SC-01+AD-15: `cameras.cube`/`surfaces.mirror` captures.
    const paritySurfaces = createProductionParitySurfaces(productionRenderer, (message) => {
      runtimeWarnings.add(message);
    });
    // threejs-parity AD-15 (P2): `lights.lensFlare` additive flare sprites, chained after the surfaces.
    const lensFlares = createProductionLensFlares((message) => {
      runtimeWarnings.add(message);
    });
    const prepareParitySurfaces = (source: ProductionRendererInput["source"], time: number): ProductionRendererInput["source"] =>
      lensFlares.prepare(
        paritySurfaces.prepare(source, snapshot, runtimeNodes, time, canvas.width / Math.max(1, canvas.height), { width: canvas.width, height: canvas.height }),
        snapshot,
        runtimeNodes,
        time,
        canvas.width / Math.max(1, canvas.height),
        canvas.height
      );

    // T3.11 (C-36): compile once at mount. With A3D_QR_COMPILER off the contract
    // stub returns `source: null` and every call below keeps the legacy path
    // byte-identical; with the flag on, the real compile owns entry assembly and
    // `updateCompiledScene` builds each frame's RenderSource.
    const sceneCompileCtx: MountSceneCompileContext & {
      readonly runtimeOwner: object;
      readonly request: TypedGLBActorOptions["request"];
      readonly formatRegistry: TypedGLBActorOptions["formatRegistry"];
      readonly assetOptions?: import("../../contracts/assets.js").AuraAssetsOption;
    } = {
      renderer: productionRenderer,
      assets: undefined,
      runtimeOwner,
      request,
      formatRegistry: mountContext?.formatRegistry,
      assetOptions: mountContext?.assetOptions,
      ...(admittedBuiltinGlyphAtlas ? { builtinGlyphAtlas: admittedBuiltinGlyphAtlas } : {}),
      onPrimitiveEntriesAdded: scheduleAddedPrimitiveEntries,
      onPrimitiveEntriesRemoved: untrackPrimitiveEntries,
      ...(textureResidency ? { textureResidency } : {}),
      // TIER: the caller's quality governor value reaches the compile ctx —
      // rendererOptions.quality.tier (C-27, prd11) wins; absent/"auto" keeps
      // the desktop default "high" (the same stub resolution the lighting
      // handlers use for their own auto tier).
      quality: resolveMountQuality(rendererOptions),
      strict,
      flags,
      // T4.1: the C-36 degrade handler. Strict → AuraRuntimeError with code and
      // cause; non-strict → C-38 onDegradation + warn-once per (code,nodeId).
      degrade: appDegrade,
      photometricProfileAdmissionEnabled,
      get projectedSpotImageAdmissionEnabled() { return projectedSpotImageAdmissionEnabled; },
      ...(projectedSpotMaxDimension === undefined ? {} : { projectedSpotMaxDimension }),
      onProjectedSpotResourceReady: notifyCommittedResource,
      canvas,
      environmentLighting: (liveSnapshot) => {
        // LIGHT-07: the knob was computed from the mount snapshot. When runtime adds or removes change the
        // environment or light nodes (liveNodes is replaced on every add/remove), recompute it from the live set.
        if (!liveSnapshot) return currentEnvironmentLighting;
        if (liveKnob.nodes !== liveSnapshot.nodes) {
          const key = environmentKnobKey(liveSnapshot);
          liveKnob = {
            nodes: liveSnapshot.nodes,
            lighting: key === mountKnobKey ? null : withPrd01ColorParsing(runtimeOwner, () => createProductionRuntimeEnvironment(liveSnapshot, flags, { implicitFill: false }).lighting)
          };
        }
        return liveKnob.lighting ?? currentEnvironmentLighting;
      },
      collectedLights: productionRuntimeLights,
      runtimeWarnings,
      ...(runtimeNodes ? { runtimeNodes } : {})
    };
    // The compiled path records these during compilation; the legacy path still
    // uses the same per-app strict/degradation channel before its scalar fallback.
    if (!flagsOn) {
      for (const diagnostic of unsupportedLightModulationDegradations(flattened, { deferPhotometricProfiles: photometricProfileAdmissionEnabled, deferProjectedSpotImages: projectedSpotImageAdmissionEnabled })) sceneCompileCtx.degrade(diagnostic);
    }
    markTiming("a3d:mount:compile-scene:start");
    const compiledScene = await compileScene(snapshot, sceneCompileCtx);
    markTiming("a3d:mount:compile-scene:resolved");
    const compiled = asRuntimeCompiled(compiledScene);
    activeCompiled = compiled;
    mountCompiled = compiled;
    if (projectedSpotImageAdmissionEnabled) {
      const projectedCompiled = compiled as (NonNullable<ReturnType<typeof asRuntimeCompiled>> & {
        projectedSpotResourceFor?: (candidate: unknown) => RendererProjectedSpotResource<unknown> | undefined;
        whenProjectedSpotDisposalsSettled?: () => Promise<void>;
      }) | null;
      if (typeof projectedCompiled?.projectedSpotResourceFor !== "function" ||
          typeof projectedCompiled?.whenProjectedSpotDisposalsSettled !== "function") {
        projectedSpotImageAdmissionEnabled = false;
        for (const diagnostic of unsupportedLightModulationDegradations(flattened, { deferPhotometricProfiles: photometricProfileAdmissionEnabled })) {
          sceneCompileCtx.degrade(diagnostic);
        }
      }
    }
    if (mountAbort.signal.aborted) {
      ensureMountActive();
    }
    const probeStatus = (): "pending" | "ready" | "fallback" | undefined =>
      (compiledScene as { environmentProbeStatus?: "pending" | "ready" | "fallback" }).environmentProbeStatus;
    if (compiled) {
      actorEntries = compiled.actorEntries as ProductionRuntimeActorEntry[];
      primitiveEntries = compiled.primitiveEntries as ProductionRuntimePrimitiveEntry[];
      // The compiled path creates its own resources after the initial legacy
      // list. Each gets an independently cancellable mount-owned job (#1142:
      // compiled primitives get their maps under A3D_QR_COMPILER). Primitives
      // added later through `app.nodes.add` (GU47 g11 phase 10) are tracked via
      // the compile context's `onPrimitiveEntriesAdded` (scheduleAddedPrimitiveEntries).
      for (const entry of primitiveEntries) trackPrimitiveEntry(entry);
      // C-37: bind the mounted compiled scene so registry add/remove can take the
      // subtree-compile path (no remount) under A3D_QR_COMPILER.
      (runtimeNodes as { attachCompiled?: (scene: unknown) => void } | undefined)?.attachCompiled?.(compiledScene);
    }
    const currentPrimitives = (): readonly ProductionRuntimePrimitiveEntry[] =>
      compiled ? compiled.primitiveEntries as readonly ProductionRuntimePrimitiveEntry[] : primitiveEntries;
    const currentActors = (): readonly ProductionRuntimeActorEntry[] =>
      compiled ? compiled.actorEntries as readonly ProductionRuntimeActorEntry[] : actorEntries;
    // RP-01 (lane E1): the GLBs are decoded now; tell the frame loop about BLEND/transmission materials the direct path cannot draw.
    if (isDirectRenderPath(canvas)) recordDecodedDirectPathBlockers(canvas, decodedModelDirectPathBlockers(actorEntries));
    const authoredLightNodes = flattened.filter((node): node is AuraLightNode => node.kind === "light");
    const authoredDirectLightNodes = authoredLightNodes.filter((node) => node.light !== "ambient");
    const authoredAmbientLightCount = authoredLightNodes.length - authoredDirectLightNodes.length;
    const authoredAreaProxyCount = authoredDirectLightNodes.filter((node) => node.light === "rect" || node.light === "softbox").length;

    // N1 + G1 + M2 observations refresh on every diagnostics read from the
    // live entries/device state — never cached intent.
    const buildDiagnostics = (): AuraRendererDiagnosticReport => {
      const observedPrimitives = currentPrimitives();
      const observedActors = currentActors();
      const deviceLost = productionRenderer.isDeviceLost();
      const shadowObservation = createProductionRuntimeShadowObservation(
        { ...createProductionRuntimeShadowOptions(snapshot, productionRuntimeLights), ...(htmlCanvas && getRootPerformanceQuality(htmlCanvas) ? { size: getRootPerformanceQuality(htmlCanvas)!.shadowSize } : {}) },
        latestDeviceDiagnostics,
        productionRenderer.getShadowEvidence()
      );
      const spotCaster = productionRuntimeLights.find((light) => light.castsShadow);
      const spotAngle = spotCaster?.kind === "spot" ? spotCaster.spotAngle : undefined;
      const residencyObservation = textureResidency?.snapshot();
      const texturesObservation = residencyObservation ?? createProductionTexturesObservation(
        observedPrimitives,
        latestCameraEye,
        rendererOptions?.textureBudgetBytes ?? normalizeTextureBudgetBytes(undefined)
      );
      const streamingWarnings = texturesObservation.overBudget
        ? [`texture streaming over budget by ${texturesObservation.overBudgetBytes} bytes `
          + `(${texturesObservation.residentEntries} resident, `
          + `${texturesObservation.evictedEntries.length} evicted: ${texturesObservation.evictedEntries.join(", ") || "none"}); `
          + (residencyObservation ? `raise renderer.textureResidency.budgetBytes to fund more mip data` : `raise renderer.textureBudgetBytes above ${texturesObservation.requestedBytes} bytes or move textures closer`)]
        : [];
      return { ...createRendererDiagnosticReport(
        snapshot,
        {
          mounted: true,
          backend: "production-runtime",
          outputColorSpace: deviceLost ? "unknown" : readActiveOutputColorSpace(productionRenderer.device, () => webGL2Context(canvas)),
          ...(!deviceLost && productionRenderer.getDepthConvention?.() ? { depth: productionRenderer.getDepthConvention()! } : {}),
          ...frameTimingObservation(productionRenderer),
          postprocess: createProductionRuntimePostprocessObservation(latestDeviceDiagnostics),
          shadow: {
            ...shadowObservation,
            spot: describeProductionSpotShadow({
              requested: flattened.some((node) => node.kind === "light" && node.light === "spot" && node.shadow === true),
              casterIsSpot: spotCaster?.kind === "spot",
              ...(spotCaster === undefined ? {} : { casterName: spotCaster.source.name }),
              ...(spotAngle === undefined ? {} : { angle: spotAngle }),
              ...(spotCaster?.kind === "spot" ? { penumbra: spotCaster.penumbra, range: spotCaster.range } : {}),
              mapRendered: shadowObservation.mapRendered,
              mapSampled: shadowObservation.mapSampled
            })
          },
          text: createProductionTextObservation(observedPrimitives),
          textures: texturesObservation,
        environment: {
          enabled: true,
          preset: productionEnvironment.preset,
          intensity: productionEnvironment.intensity,
          evidence: hdriState.status === "ready" && probeStatus() !== "fallback"
            ? `${productionEnvironment.evidence} — HDRI chain ready${hdriState.dualProbe ? " (dual-probe: illumination diffuse + reflection specular)" : " (single probe)"} (maxLinear ${hdriState.maxLinearValue}, ${hdriState.specularMipCount} specular mips)`
            : productionEnvironment.evidence,
          // B3 iblPixelBacked: true only after the HDR chain swaps the live
          // lighting object. Procedural first frames and fallbacks never claim it.
          // #1142: when the compiled C-09 probe owns IBL (compiler + lighting),
          // a still-pending probe acquire keeps the scene "pending" too, so
          // captures wait for real specular instead of the analytic floor.
          iblPixelBacked: hdriState.status === "ready" && probeStatus() !== "pending" && probeStatus() !== "fallback",
          hdriStatus: probeStatus() === "fallback" && hdriState.status !== "none" ? "fallback"
            : probeStatus() === "pending" && hdriState.status !== "none" ? "pending" : hdriState.status,
          ...(hdriState.dualProbe === undefined ? {} : { dualProbe: hdriState.dualProbe }),
          ...(productionEnvironment.hdriRotation === undefined ? {} : { hdriRotation: productionEnvironment.hdriRotation })
        },
        warnings: [
          `Production runtime bridge active with ${observedActors.length} typed GLB actor${observedActors.length === 1 ? "" : "s"} and ${observedPrimitives.length} Aura primitive${observedPrimitives.length === 1 ? "" : "s"} on ${productionRenderer.device.kind as AuraBackend}.`,
          ...(authoredDirectLightNodes.length === 0
            ? ["Production runtime direct-light fallback active: the scene has no authored directional, point, studio, rect, or softbox light."]
            : [`Production runtime derived ${productionRuntimeLights.length} collected direct light${productionRuntimeLights.length === 1 ? "" : "s"} from ${authoredDirectLightNodes.length} authored scene light${authoredDirectLightNodes.length === 1 ? "" : "s"}.`]),
          ...(authoredAmbientLightCount > 0
            ? [`${authoredAmbientLightCount} authored ambient light${authoredAmbientLightCount === 1 ? "" : "s"} remain environment-lighting intent and are not mislabeled as direct CollectedLight entries.`]
            : []),
          ...(authoredAreaProxyCount > 0
            ? [`${authoredAreaProxyCount} authored rect/softbox light${authoredAreaProxyCount === 1 ? "" : "s"} use bounded spot-light proxies whose cone and range derive from authored width and height; this does not claim physical area-light shading.`]
            : []),
          ...(flattened.some((node) => node.kind === "effect")
            ? ["Effect nodes are requested in the scene graph; production bridge diagnostics report them, but unsupported postprocess/effect passes remain non-pixel-backed until the runtime feature reports support."]
            : []),

          ...latestFeatures
            .filter((feature) => feature.state !== "supported")
            .map((feature) => `Production runtime feature ${feature.id} is ${feature.state}: ${feature.detail}`),
          ...new Set([
            ...skippedInlineModelWarnings,
            ...(flagsOn ? [] : ignoredOptionMessages(flattened).map((entry) => entry.message)),
            ...unsupportedLightModulationDegradations(compiled?.liveNodes ?? flattened, { deferPhotometricProfiles: photometricProfileAdmissionEnabled, deferProjectedSpotImages: projectedSpotImageAdmissionEnabled }).map(formatLightModulationWarning),
            ...[...photometricViewWarnings.values()].map((entry) => entry.warning),
            ...[...projectedSpotViewWarnings.values()].map((entry) => entry.warning),
            ...[...runtimeWarnings].filter((warning) => !warning.includes("LIGHT_MODULATION_UNSUPPORTED:") && !warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED:") && !warning.includes("PROJECTED_SPOT_UNSUPPORTED:"))
          ]),
          ...textureUpgradeWarnings,
          ...streamingWarnings,
          ...(residencyObservation?.unmanagedEntries.map((entry) => `TEXTURE_RESIDENCY_UNMANAGED: ${entry}`) ?? []),
          ...(residencyObservation?.errors.map((entry) => `TEXTURE_RESIDENCY_ERROR: ${entry}`) ?? []),
          ...hdriWarnings
        ],
        deviceDiagnostics: latestDeviceDiagnostics,
        lodSelections: observedPrimitives
          .filter((entry) => Boolean(entry.node.lod?.levels.length))
          .map((entry) => ({
            nodeName: entry.node.name ?? "unnamed distance LOD",
            levelIndex: entry.currentLodIndex,
            levelName: entry.resources[entry.currentLodIndex]?.name ?? `level-${entry.currentLodIndex}`
          })),
        texturedMaterials: observedPrimitives.flatMap((entry) =>
          entry.resources.map((resource) => ({
            nodeName: entry.node.name ?? `aura-primitive-${entry.node.primitive}`,
            levelName: resource.name,
            status: resource.textureStatus,
            slots: resource.textureSlots,
            pixelBacked: resource.textureStatus === "textured" && resource.texturedMaterial !== null,
            warnings: resource.textureWarnings,
            ...(resource.textureStage !== undefined ? { stage: resource.textureStage } : {}),
            ...(texturePendingMs(resource) !== undefined ? { pendingMs: texturePendingMs(resource)! } : {})
          }))
        )
        },
        rendererOptions
      ), backendSelection: { ...backendSelection, deviceLost },
      ...(productionRenderer.drawingPathDiagnostics ? { drawingPath: productionRenderer.drawingPathDiagnostics } : {}) };
    };

    let preparedFrame: { readonly time: number; readonly input: ProductionRendererInput; readonly release: () => void } | undefined;
    const buildFrame = (time: number): ProductionRendererInput => {
      latestCameraEye = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
      const wrapWithBackgroundImage = (input: ProductionRendererInput): ProductionRendererInput => {
        const background = backgroundImage?.current();
        // A resolved authored image background replaces the compiled/legacy
        // source's environmentBackground; unset → the frame flows unchanged.
        if (!background) return input;
        const source = { ...input.source, environmentBackground: background };
        inheritCompiledBatchFrame(input.source, source);
        inheritBuiltinGlyphFrame(input.source, source);
        return { ...input, source };
      };
      if (compiled) {
        // C-36 real path: per-frame update on the mounted compiled scene.
        updateCompiledScene(compiledScene, snapshot, runtimeNodes as AuraRuntimeNodeRegistry, time, flags);
        return wrapWithBackgroundImage(compiled.lastInput! as ProductionRendererInput);
      }
      runtimeWarnings.clear();
      updateRuntimePhotometricLights(profileLightNodes, runtimeNodes, productionRuntimeLights, time / 1000);
      const input = createProductionRuntimeRendererInput(
        snapshot,
        canvas,
        actorEntries,
        primitiveEntries,
        time,
        runtimeNodes,
        runtimeWarnings,
        currentEnvironmentLighting,
        productionRuntimeLights,
        undefined,
        textureResidency,
        undefined,
        runtimeOwner
      );
      try { return wrapWithBackgroundImage(input); }
      catch (error) {
        try { releaseBuiltinGlyphFrameOwner(input.source); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Frame wrapping and built-in glyph cleanup failed"); }
        throw error;
      }
    };
  /*
   * #1175: PRD-10 world terrain/water/grass nodes are real renderable content
   * (the prd10 frame contributor draws them with their own geometry and
   * programs), so they count toward the production content rule alongside
   * mesh primitives. Without this, a world-only scene failed "requires at least
   * one real mesh primitive" and never ran a frame.
   */
  const contributorContent = { contributorDrawnNodes: countContributorContentNodes(flattened) };
  const validateFrameInput = (input: ProductionRendererInput): void => {
    const splats = (input.source as ProductionRendererInput["source"] & { readonly gaussianSplats?: readonly unknown[] }).gaussianSplats;
    const volumes = (input.source as ProductionRendererInput["source"] & { readonly scalarVolumes?: readonly unknown[] }).scalarVolumes;
    validateProductionRendererInput(input, { contributorDrawnNodes: contributorContent.contributorDrawnNodes + (splats?.length ?? 0) + (volumes?.length ?? 0) });
  };
  const retainFrame = (input: ProductionRendererInput): (() => void) => {
      const releaseBatch = retainCompiledBatchFrame(input.source);
      const releaseGlyphs = retainBuiltinGlyphFrame(input.source);
      try {
        // The compiled scene owns its current source until update/dispose; the
        // legacy source transfers its initial owner to this consumer instead.
        if (!compiled) releaseBuiltinGlyphFrameOwner(input.source);
      } catch (error) {
        releaseBatch();
        releaseGlyphs();
        throw error;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const failures: unknown[] = [];
        try { releaseBatch(); } catch (error) { failures.push(error); }
        try { releaseGlyphs(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, "Frame cleanup failed");
      };
    };
  const takePreparedFrame = (time: number): { readonly input: ProductionRendererInput; readonly release: () => void } => {
      const prepared = preparedFrame?.time === time ? preparedFrame : undefined;
      if (!prepared) preparedFrame?.release();
      preparedFrame = undefined;
      if (prepared) return prepared;
      const input = buildFrame(time);
      return { input, release: retainFrame(input) };
    };

    let benchmarkBusy = 0;
    let benchmarkFrameReady = false;
    let benchmarkInvalidation = 0;
    let benchmarkWidth = 0;
    let benchmarkHeight = 0;
    const benchmarkFrameKey = Symbol.for("a3d.benchmark.lastFrame");
    const benchmarkArmKey = Symbol.for("a3d.benchmark.armFrameSnapshot");
    const invalidateBenchmarkFrame = (): void => {
      benchmarkInvalidation += 1;
      benchmarkFrameReady = false;
      productionRenderer.invalidateBenchmarkMaskFrame();
    };
    const assertBenchmarkIdle = (): void => {
      if (disposed) throw new Error("BENCHMARK_FRAME_DISPOSED");
      if (benchmarkBusy > 0) throw new Error("BENCHMARK_FRAME_BUSY");
      if (productionRenderer.isDeviceLost() || productionRenderer.device.disposed) throw new Error("BENCHMARK_FRAME_UNAVAILABLE");
    };
    const armBenchmarkFrame = (): (() => void) => {
      assertBenchmarkIdle();
      const release = productionRenderer.armBenchmarkMaskFrame();
      invalidateBenchmarkFrame();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        invalidateBenchmarkFrame();
        release();
      };
    };
    const lastBenchmarkFrame = () => {
      assertBenchmarkIdle();
      if (canvas.width !== benchmarkWidth || canvas.height !== benchmarkHeight) invalidateBenchmarkFrame();
      if (!benchmarkFrameReady) throw new Error("BENCHMARK_FRAME_UNAVAILABLE");
      const frame = productionRenderer.benchmarkMaskFrame();
      if (!frame) throw new Error("BENCHMARK_FRAME_UNAVAILABLE");
      if ("unsupported" in frame) throw new Error(`BENCHMARK_FRAME_UNSUPPORTED: ${frame.unsupported}`);
      return Object.freeze({ device: productionRenderer.device, source: Object.freeze({ renderItems: frame.items }),
        camera: Object.freeze({ viewProjectionMatrix: frame.viewProjectionMatrix, ...(frame.layerMask !== undefined ? { layerMask: frame.layerMask } : {}) }),
        canvas, width: benchmarkWidth, height: benchmarkHeight });
    };
    Object.defineProperty(productionRenderer, benchmarkArmKey, { configurable: true, value: armBenchmarkFrame });
    Object.defineProperty(productionRenderer, benchmarkFrameKey, { configurable: true, value: lastBenchmarkFrame });
    const unbindPostDiagnostics = bindPostDiagnosticReader(canvas, () => productionRenderer.postDiagnosticViews(), productionRenderer.postScopeId());
    let disposal: Promise<void> = Promise.resolve();
    let disposalDeviceRetirement: { owned: boolean; completion?: Promise<void>; residencyFailed?: boolean } = { owned: false };
    let ownsDeviceRetirement = false;
    let disposalPending = false;
    let disposing = false;
    let rendererRetryPending = false;
    let residencyRetryPending = false;
    let lensFlareRetryPending = false;
    let firstRendererFailure: { readonly error: unknown } | undefined;
    // These one-shot owners do not all expose their unfinished work. Retrying
    // the native Renderer must not silently erase, or repeat, their failures.
    const otherCleanupFailures: unknown[] = [];
    const resourceSubscriptions = new Set<() => void>();
    let activeOperations = 0;
    let operationsDrained: (() => void) | undefined;
    const assertRendererOpen = (): void => {
      if (disposed) throw new Error("Renderer was disposed");
    };
    // Acquire before building a source: resource selection and staging can call
    // user-visible hooks that synchronously dispose this mount.
    const beginOperation = (): (() => void) => {
      assertRendererOpen();
      activeOperations += 1;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        activeOperations -= 1;
        if (activeOperations === 0) {
          const resolve = operationsDrained;
          operationsDrained = undefined;
          resolve?.();
        }
      };
    };
    return {
      // Entries only reach this point after their actor factories have resolved.
      get loadedAssetIds() {
        return [...new Set([...currentActors().map(({ node }) => node.asset.id), ...(compiled?.loadedSplatAssetIds ?? []), ...(compiled?.loadedScalarVolumeAssetIds ?? [])]
          .filter((id): id is string => typeof id === "string" && id.length > 0))];
      },
      get backend() {
        return productionRenderer.device.kind as AuraBackend;
      },
      get diagnostics() {
        return buildDiagnostics();
      },
      update(time) {
        const endOperation = beginOperation();
        try {
        invalidateBenchmarkFrame();
        // Building the frame applies controller-bound actor clips, root-motion
        // consumption, foot IK, morphs and imported-asset evidence. Discarding the
        // returned input deliberately avoids a GPU/device submission.
        preparedFrame?.release();
        preparedFrame = undefined;
        const input = buildFrame(time);
        const release = retainFrame(input);
        if (disposed) { release(); assertRendererOpen(); }
        preparedFrame = { time, input, release };
        } finally { endOperation(); }
      },
      render(time) {
        const endOperation = beginOperation();
        benchmarkBusy += 1;
        try {
          return withSyncProductionFrame(productionRenderer, () => {
            let frame: ReturnType<typeof takePreparedFrame> | undefined;
            try {
              invalidateBenchmarkFrame();
              const benchmarkVersion = benchmarkInvalidation;
              frame = takePreparedFrame(time);
              assertRendererOpen();
              const input = frame.input;
              validateFrameInput(input);
              // threejs-parity SC-04: while an XR eye is installed on this canvas, render with its matrices and eye position.
              const xrFrame = applyXRViewOverride(canvas, input);
              const baseSource = prepareParitySurfaces(xrFrame.source, time);
              const source = advancedLightingBridge?.wrapSource(baseSource) ?? baseSource;
              assertRendererOpen();
              latestDeviceDiagnostics = renderProductionSourceWithProbesInFrame(productionRenderer, source, xrFrame.camera as typeof input.camera, flags, runtimeNodes ?? productionRenderer.device);
              const frameBridge = rootRenderSourceForFrame(input);
              if (htmlCanvas && frameBridge && getRootRenderSource(htmlCanvas, runtimeOwner) === frameBridge) {
                frameBridge.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
              }
              latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
              benchmarkWidth = canvas.width;
              benchmarkHeight = canvas.height;
              benchmarkFrameReady = !disposed && benchmarkBusy === 1 && benchmarkVersion === benchmarkInvalidation;
              return latestDeviceDiagnostics.drawCalls;
            } finally { frame?.release(); }
          });
        } finally { benchmarkBusy -= 1; endOperation(); }
      },
      async renderAsync(time) {
        assertRendererOpen();
        benchmarkBusy += 1;
        try {
          return await withPrd07RendererCanvasLock(productionRenderer, () => withPrd02ProbeFrameLock(productionRenderer.device, async () => {
            // A queued frame owns no resources yet. Acquire its mount lifetime
            // only after the lock, so disposal need not wait on a queued frame.
            const endOperation = beginOperation();
            let frame: ReturnType<typeof takePreparedFrame> | undefined;
            try {
              invalidateBenchmarkFrame();
              const benchmarkVersion = benchmarkInvalidation;
              frame = takePreparedFrame(time);
              assertRendererOpen();
              const input = frame.input;
              validateFrameInput(input);
              const xrFrame = applyXRViewOverride(canvas, input);
              const baseSource = prepareParitySurfaces(xrFrame.source, time);
              const source = advancedLightingBridge?.wrapSource(baseSource) ?? baseSource;
              assertRendererOpen();
              // The lock is already held around source preparation and submission.
              latestDeviceDiagnostics = await renderProductionSourceWithProbesInAsyncFrame(productionRenderer, source, xrFrame.camera as typeof input.camera, flags, runtimeNodes ?? productionRenderer.device, () => disposed);
              if (!disposed) {
                const frameBridge = rootRenderSourceForFrame(input);
                if (htmlCanvas && frameBridge && getRootRenderSource(htmlCanvas, runtimeOwner) === frameBridge) {
                  frameBridge.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
                }
                latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
                benchmarkWidth = canvas.width;
                benchmarkHeight = canvas.height;
                benchmarkFrameReady = benchmarkBusy === 1 && benchmarkVersion === benchmarkInvalidation;
              }
              return latestDeviceDiagnostics.drawCalls;
            } finally { try { frame?.release(); } finally { endOperation(); } }
          }));
        } finally { benchmarkBusy -= 1; }
      },
      viewProjection(time) {
        return createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
      },
      // threejs-parity L7/SR-07: `app.precompile` — compiles the generated
      // programs this frame's draw records need, without presenting pixels.
      async precompile(time = 0) {
        assertRendererOpen();
        invalidateBenchmarkFrame();
        return withPrd07RendererCanvasLock(productionRenderer, () => withPrd02ProbeFrameLock(productionRenderer.device, async () => {
          if (disposed) throw new Error("Renderer was disposed before precompile");
          const endOperation = beginOperation();
          try {
          const previous = rendererQrFlags(productionRenderer.device);
          setRendererQrFlags(flags, productionRenderer.device);
          try {
            const input = buildFrame(time);
            const release = retainFrame(input);
            try {
              assertRendererOpen();
              // Lower the same authored views used by render, without running
              // cube or mirror captures during program warmup.
              const views = paritySurfaces.prepareViews(snapshot, runtimeNodes, time, { width: canvas.width, height: canvas.height });
              const source = advancedLightingBridge?.wrapSource(input.source) ?? input.source;
              assertRendererOpen();
              return await productionRenderer.precompile(views ? { source, views } : source, input.camera);
            }
            finally { release(); }
          } finally { setRendererQrFlags(previous, productionRenderer.device); }
          } finally { endOperation(); }
        }));
      },
      // PRD-01 C-05 seam (Q-15-1): the lane's `Renderer` when the backend is WebGL2.
      get auraRenderer() {
        return productionRenderer;
      },
      resetTemporalHistory(reason) {
        productionRenderer.resetTemporalHistory(reason);
      },
      resize(width, height) {
        invalidateBenchmarkFrame();
        productionRenderer.resize(width, height);
      },
      onDeviceLost(listener) {
        return productionRenderer.onDeviceLost(listener);
      },
      onDeviceRestored(listener) {
        return productionRenderer.onDeviceRestored(listener);
      },
      deviceLost() {
        return productionRenderer.isDeviceLost();
      },
      onResourceChange(listener) {
        if (disposed) return () => {};
        const notify = (): void => { if (!disposed) { invalidateBenchmarkFrame(); listener(); } };
        const releaseProgram = subscribeProgramReadiness(productionRenderer.device, notify);
        committedResourceListeners.add(notify);
        let releaseResidency: (() => void) | undefined;
        let releaseNodeChanges: (() => void) | undefined;
        const clippingSubscriptions = new Map<AuraClipGroup, () => void>();
        const refreshClipping = (): void => {
          const current = liveClippingGroups(snapshot, runtimeNodes);
          for (const [group, release] of clippingSubscriptions) {
            if (!current.has(group)) { clippingSubscriptions.delete(group); release(); }
          }
          for (const group of current) if (!clippingSubscriptions.has(group)) clippingSubscriptions.set(group, group.onChange(notify));
        };
        try {
          releaseResidency = textureResidency?.onChange(notify);
          refreshClipping();
          releaseNodeChanges = (runtimeNodes as (AuraRuntimeNodeRegistry & { onChange?: (listener: () => void) => () => void }) | undefined)
            ?.onChange?.(() => {
              if (disposed) return;
              // Even an invalid replacement must schedule a frame so the
              // renderer can report the authored error. Discovery builds its
              // new set first, leaving the prior subscriptions intact if it
              // fails.
              try { refreshClipping(); } finally { notify(); }
            });
        } catch (error) {
          committedResourceListeners.delete(notify);
          releaseProgram(); releaseResidency?.(); releaseNodeChanges?.();
          for (const release of clippingSubscriptions.values()) release();
          throw error;
        }
        let active = true;
        const release = (): void => {
          if (!active) return;
          active = false;
          resourceSubscriptions.delete(release);
          committedResourceListeners.delete(notify);
          try { releaseProgram(); } finally {
            try { releaseResidency?.(); } finally {
              try { releaseNodeChanges?.(); } finally {
                for (const unsubscribe of clippingSubscriptions.values()) unsubscribe();
                clippingSubscriptions.clear();
              }
            }
          }
        };
        resourceSubscriptions.add(release);
        return release;
      },
      async whenDisposed() {
        const failures: unknown[] = [];
        // Capture this attempt before yielding; a later dispose() may retry it.
        const attempt = disposal;
        const deviceRetirement = disposalDeviceRetirement;
        let disposalFailed = false;
        try { await attempt; } catch (error) { disposalFailed = true; failures.push(error); }
        // Residency still owns the scene and device. Report its failure now,
        // rather than waiting for unrelated scene or device retirements that
        // cannot be closed until a later successful retry.
        if (deviceRetirement.residencyFailed) {
          if (failures.length === 1) throw failures[0];
          throw new AggregateError(failures, "Renderer cleanup failed", { cause: failures[0] });
        }
        if (!disposalFailed && deviceRetirement.completion) {
          try {
            await deviceRetirement.completion;
          } catch (error) {
            // A failed native fence/destructor must not be masked by a
            // different owner which is still waiting on that same retirement.
            failures.push(error);
            if (failures.length === 1) throw failures[0];
            throw new AggregateError(failures, "Renderer cleanup failed", { cause: failures[0] });
          }
        }
        // A failed residency drain intentionally leaves the scene and scope
        // owned. Do not wait forever for a scope that could not be closed.
        if (!disposed || glyphScopeClosed) {
          try { await builtinGlyphAtlas.whenDisposed(); } catch (error) { failures.push(error); }
        }
        try { await compiled?.whenVolumeDisposalsSettled?.(); } catch (error) { failures.push(error); }
        try {
          await (compiled as (NonNullable<ReturnType<typeof asRuntimeCompiled>> & { whenProjectedSpotDisposalsSettled?: () => Promise<void> }) | null)?.whenProjectedSpotDisposalsSettled?.();
        } catch (error) { failures.push(error); }
        // This drain belongs to a closed WebGL device, not to an individual
        // scene. A peer may still own the device, and a failed attempt may
        // leave it unable to drain; neither may mask or hold up this result.
        if (compiled?.hasOwnedScalarVolumes && !disposalFailed && deviceRetirement.owned &&
            productionRenderer.device.kind === "webgl2") {
          try {
            const { VolumeRenderer } = await import("@aura3d/rendering/volumetrics");
            await VolumeRenderer.whenDeviceRetirementsDrained(productionRenderer.device);
          } catch (error) { failures.push(error); }
        }
        // Preserve the attempt's identity when it is the sole failure. The
        // controller observes both dispose() and whenDisposed() and otherwise
        // reports the very same failed cleanup twice.
        if (failures.length === 1) throw failures[0];
        if (failures.length) throw new AggregateError(failures, "Renderer cleanup failed", { cause: failures[0] });
      },
      dispose() {
        if (disposing || (disposed && (disposalPending || (!rendererRetryPending && !residencyRetryPending && !lensFlareRetryPending)))) return;
        const initial = !disposed;
        disposed = true;
        disposing = true;
        disposalPending = true;
        let resolveDisposal!: () => void;
        let rejectDisposal!: (error: unknown) => void;
        // Publish the promise before any callback can reenter whenDisposed().
        // A flare-only retry must retain the previous device retirement and its
        // settlement observer, rather than re-running completed device teardown.
        const deviceRetirement: { owned: boolean; completion?: Promise<void>; residencyFailed?: boolean } =
          !initial && !rendererRetryPending && !residencyRetryPending ? disposalDeviceRetirement : { owned: false };
        disposalDeviceRetirement = deviceRetirement;
        disposal = new Promise<void>((resolve, reject) => { resolveDisposal = resolve; rejectDisposal = reject; });
        void disposal.catch(() => undefined);
        const failures: unknown[] = [...otherCleanupFailures];
        const rememberOtherFailure = (error: unknown): void => {
          otherCleanupFailures.push(error);
          failures.push(error);
        };
        const cleanup = (work: () => void): void => { try { work(); } catch (error) { rememberOtherFailure(error); } };
        let synchronous = true;
        let synchronousError: unknown;
        let completed = false;
        const settle = (): void => {
          if (completed) return;
          completed = true;
          disposalPending = false;
          if (failures.length) {
            const error = new AggregateError(failures, "Renderer cleanup failed", { cause: failures[0] });
            rejectDisposal(error);
            if (synchronous) synchronousError = error;
          } else resolveDisposal();
        };
        const finishRenderer = (): void => {
          const deviceWasDisposed = productionRenderer.device.disposed;
          try {
            productionRenderer.dispose();
            rendererRetryPending = false;
            // Capture this exact attempt before yielding. A later explicit
            // retry must not change an earlier whenDisposed() waiter's result.
            const completion = productionRenderer.whenOwnedDeviceDisposed();
            deviceRetirement.completion = completion;
            void completion.then(() => {
              if (disposalDeviceRetirement !== deviceRetirement) return;
              rendererRetryPending = false;
              firstRendererFailure = undefined;
            }, (error: unknown) => {
              if (disposalDeviceRetirement !== deviceRetirement) return;
              rendererRetryPending = true;
              firstRendererFailure ??= { error };
            });
          } catch (error) {
            rendererRetryPending = true;
            if (firstRendererFailure && !Object.is(firstRendererFailure.error, error)) failures.push(firstRendererFailure.error);
            firstRendererFailure ??= { error };
            failures.push(error);
          } finally {
            // Snapshot which attempt closed the device. A peer can become the
            // last owner while this scene's asynchronous cleanup is pending.
            if (!deviceWasDisposed && productionRenderer.device.disposed) ownsDeviceRetirement = true;
            deviceRetirement.owned = ownsDeviceRetirement;
          }
          settle();
        };
        const disposeSceneAndScope = (): void => {
          if (compiled) cleanup(() => compiled.dispose());
          else {
            for (const { actor } of actorEntries) cleanup(() => actor.dispose());
            cleanup(() => disposePrimitives(primitiveEntries));
          }
          cleanup(() => builtinGlyphAtlas.dispose());
          // Ordinary and already-drained scopes close synchronously. If a
          // retained glyph still exists, keep the renderer's device owner until
          // the scope settles. This wait is not a GPU completion fence.
          if (glyphScope && !glyphScope.texture.disposed) {
            void builtinGlyphAtlas.whenDisposed().then(finishRenderer, (error: unknown) => {
              rememberOtherFailure(error);
              finishRenderer();
            });
          } else finishRenderer();
        };
        const teardownResidency = (): void => {
          if (!textureResidency) { disposeSceneAndScope(); return; }
          const failed = (error: unknown): void => {
            residencyRetryPending = true;
            deviceRetirement.residencyFailed = true;
            // Unlike one-shot siblings, residency retains unfinished work and
            // its failure must be discharged by a later successful retry.
            failures.push(error);
            settle();
          };
          try {
            textureResidency.dispose();
            void textureResidency.whenSettled().then(() => {
              residencyRetryPending = false;
              try { disposeSceneAndScope(); } catch (error) { rememberOtherFailure(error); settle(); }
            }, failed);
          } catch (error) { failed(error); }
        };
        const disposeLensFlares = (): void => {
          try {
            lensFlares.dispose();
            lensFlareRetryPending = false;
          } catch (error) {
            lensFlareRetryPending = true;
            failures.push(error);
          }
        };
        const teardown = (): void => {
          cleanup(() => releaseRenderInputCache?.());
          cleanup(() => releasePrd07Renderer?.());
          cleanup(() => advancedLightingBridge?.dispose());
          cleanup(() => disposeHdriEnvironment?.());
          cleanup(() => backgroundImage?.dispose());
          cleanup(() => paritySurfaces.dispose());
          disposeLensFlares();
          cleanup(() => resetPrd07ProbeSnapshot(productionRenderer, runtimeNodes ?? productionRenderer.device));
          // The device and actor sources remain owned until unpublication and
          // all residency retirement fences complete; failure is fail-closed.
          teardownResidency();
        };
        const runTeardown = (): void => {
          try { teardown(); } catch (error) { rememberOtherFailure(error); settle(); }
        };
        try {
          if (!initial) {
            if (lensFlareRetryPending) disposeLensFlares();
            if (residencyRetryPending) teardownResidency();
            else if (rendererRetryPending) {
              // Its own dispose() retains unfinished device, batch and post work.
              finishRenderer();
            } else settle();
          } else {
            cleanup(invalidateBenchmarkFrame);
            cleanup(() => { delete (productionRenderer as unknown as Record<symbol, unknown>)[benchmarkArmKey]; });
            cleanup(() => { delete (productionRenderer as unknown as Record<symbol, unknown>)[benchmarkFrameKey]; });
            cleanup(() => preparedFrame?.release());
            preparedFrame = undefined;
            cleanup(stopMount);
            for (const release of [...resourceSubscriptions]) cleanup(release);
            cleanup(unbindPostDiagnostics);
            if (compiled) {
              cleanup(() => (runtimeNodes as { detachCompiled?: (scene: unknown) => void } | undefined)?.detachCompiled?.(compiledScene));
            }
            if (activeOperations) {
              // The operation retains the frame and its supporting renderer state;
              // its finally releases both before resolving this drain.
              void new Promise<void>((resolve) => { operationsDrained = resolve; }).then(runTeardown);
            } else runTeardown();
          }
        } catch (error) {
          rememberOtherFailure(error);
          settle();
        } finally {
          synchronous = false;
          disposing = false;
        }
        if (synchronousError !== undefined) throw synchronousError;
      }
    };
  } catch (mountError) {
    // Flow analysis narrows the declared-`null` disposer to `never` here
    // (its try-body assignment never ran on this path); the cast restores the
    // declared type for the optional call.
    const disposeEnv = disposeHdriEnvironment as (() => void) | null;
    const cleanupFailures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { cleanupFailures.push(error); } };
    cleanup(stopMount);
    cleanup(() => releasePrd07Renderer?.());
    cleanup(() => advancedLightingBridge?.dispose());
    if (textureResidency) {
      try {
        textureResidency.dispose();
        await textureResidency.whenSettled();
      }
      catch (cleanupError) {
        residencyCleanupFailed = true;
        cleanupFailures.push(cleanupError);
        if (productionRenderer.device.kind === "webgpu") throw webGPUOwnershipCleanupFailure(mountError, cleanupFailures);
        throw new AggregateError([mountError, ...cleanupFailures], "Renderer mount and residency cleanup failed", { cause: mountError });
      }
      const compiledForCleanup = mountCompiled as ReturnType<typeof asRuntimeCompiled>;
      if (compiledForCleanup) {
        cleanup(() => compiledForCleanup.dispose());
        mountCompiled = null;
      } else {
        for (const actor of createdActors) cleanup(() => actor.dispose());
        createdActors.length = 0;
        cleanup(() => disposePrimitives(mountPrimitives));
        mountPrimitives = [];
      }
    }
    cleanup(() => disposeEnv?.());
    cleanup(() => resetPrd07ProbeSnapshot(productionRenderer, runtimeNodes ?? productionRenderer.device));
    cleanup(() => productionRenderer.dispose());
    if (!cleanupFailures.length) {
      try { await productionRenderer.whenOwnedDeviceDisposed?.(); } catch (error) { cleanupFailures.push(error); }
    }
    if (cleanupFailures.length) {
      if (productionRenderer.device.kind === "webgpu") throw webGPUOwnershipCleanupFailure(mountError, cleanupFailures);
      throw new AggregateError([mountError, ...cleanupFailures], "Renderer mount and cleanup failed", { cause: mountError });
    }
    throw mountError;
  }
  } catch (mountError) {
    const cleanupFailures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { cleanupFailures.push(error); } };
    cleanup(stopMount);
    cleanup(() => releaseRenderInputCache?.());
    if (residencyCleanupFailed) {
      cleanup(() => builtinGlyphAtlas.dispose());
      try { await builtinGlyphAtlas.whenDisposed(); } catch (error) { cleanupFailures.push(error); }
      if (cleanupFailures.length) {
        if ((mountError as { code?: unknown } | null)?.code === "WEBGPU_OWNERSHIP_CLEANUP_FAILED") {
          throw webGPUOwnershipCleanupFailure(mountError, cleanupFailures);
        }
        throw new AggregateError([mountError, ...cleanupFailures], "Renderer mount and cleanup failed", { cause: mountError });
      }
      throw mountError;
    }
    const compiledForCleanup = mountCompiled as ReturnType<typeof asRuntimeCompiled>;
    cleanup(() => {
      if (compiledForCleanup) compiledForCleanup.dispose();
      else disposePrimitives(mountPrimitives);
    });
    for (const actor of createdActors) cleanup(() => actor.dispose());
    cleanup(() => builtinGlyphAtlas.dispose());
    try { await builtinGlyphAtlas.whenDisposed(); } catch (error) { cleanupFailures.push(error); }
    if (compiledForCleanup) {
      try { await compiledForCleanup.whenVolumeDisposalsSettled?.(); } catch (error) { cleanupFailures.push(error); }
      try {
        await (compiledForCleanup as typeof compiledForCleanup & { whenProjectedSpotDisposalsSettled?: () => Promise<void> })
          .whenProjectedSpotDisposalsSettled?.();
      } catch (error) { cleanupFailures.push(error); }
    }
    if (cleanupFailures.length) {
      if (resolveBackendOptions(rendererOptions).requested !== "webgl2") throw webGPUOwnershipCleanupFailure(mountError, cleanupFailures);
      throw new AggregateError([mountError, ...cleanupFailures], "Renderer mount and cleanup failed", { cause: mountError });
    }
    throw mountError;
  }
}

/**
 * TIER: resolve the mount compile ctx quality surface from the caller's
 * renderer options. `renderer.quality` is a tier name or `{ tier }` (C-27,
 * prd11; `parseQualityRendererOptions` accepts both); absent or "auto" keeps
 * the desktop default "high", the same stub resolution the lighting handlers
 * apply to their own auto tier. The string form used to be ignored here
 * (top-tennis C11), so `renderer: { quality: "low" }` mounted at "high".
 */
export function resolveMountQuality(
  rendererOptions?: AuraCreateAppRendererOptions
): MountSceneCompileContext["quality"] {
  const tier: AuraQualityTier = explicitMountQualityTier(rendererOptions) ?? "high";
  return { ...resolveTierSettings(tier), tier };
}

/**
 * The tier the app named in `renderer.quality` (the string form or `{ tier }`), or `undefined` for `"auto"`, unset or
 * an unknown name — callers with their own auto resolution (the shadow caster cap) keep it then.
 */
export function explicitMountQualityTier(rendererOptions?: AuraCreateAppRendererOptions): AuraQualityTier | undefined {
  const option = rendererOptions?.quality as unknown;
  const governed = typeof option === "string" ? option : (option as { tier?: unknown } | undefined)?.tier;
  return typeof governed === "string" && governed !== "auto" && governed in QUALITY_TIERS ? (governed as AuraQualityTier) : undefined;
}

/**
 * C-05 HDR-target clear: the linear background. Alpha is OutputPass coverage:
 * 1 = tone-mapped with the scene (PRD-01 default), 0 = `toneMapped: false`,
 * passed through untouched (three r185's raw clear).
 */
export function outputClearColor(snapshot: Pick<AuraSceneSnapshot, "background" | "backgroundToneMapped">): readonly [number, number, number, number] {
  // Absent background (hand-built snapshot) is not an invalid colour: scene()'s default #070b12, as the clear colour uses.
  const [red, green, blue] = colorToLinearRgba(snapshot.background ?? "#070b12");
  return [red, green, blue, snapshot.backgroundToneMapped === false ? 0 : 1];
}

/** Whole-frame CPU/GPU timing from the renderer inspector; diagnostics never throw for it. */
function frameTimingObservation(renderer: Renderer): { readonly frameTiming?: NonNullable<ReturnType<typeof rendererFrameTimingFromInspection>> } {
  try {
    const frameTiming = rendererFrameTimingFromInspection(renderer.getFrameInspectionHistory?.());
    return frameTiming ? { frameTiming } : {};
  } catch {
    return {};
  }
}

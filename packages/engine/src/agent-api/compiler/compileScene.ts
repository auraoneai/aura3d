// C-36 real implementation (PRD-15 T3.11) — `compileScene`/`updateCompiledScene`
// wrapping the moved legacy bridge functions, active under `A3D_QR_COMPILER`.
//
// The real path owns the mount-time assembly the bridge used to do inline in
// `createProductionRuntimeSceneRenderer` (typed-GLB actor entries + primitive
// entries) and runs the C-36 handler table per node kind. Existing kinds keep
// the legacy path; a lane handler registered via `registerNodeHandler` takes
// over its kind when its flag is on; a kind unknown to the C-36 catalog is a
// strict throw (`AuraRuntimeError("unknown-node-kind")`) or a recorded
// `option-ignored` degradation.
//
// `CompiledSceneImpl` carries the mount state `updateCompiledScene` needs each
// frame so the flag-off path through `renderer.ts` stays byte-identical.

import type {
  AuraAssetRef,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraModelNode,
  AuraLightNode,
  AuraRuntimeNodeRegistry,
  ProductionRuntimeActorEntry,
  ProductionRuntimePrimitiveEntry,
  ProductionRuntimePrimitiveResource
} from "../nodes/types.js";
import type { AuraGaussianSplatNode } from "../nodes/gaussianSplat.js";
import { validateGaussianSplatTransformOptions } from "../nodes/gaussianSplat.js";
import type { AuraScalarVolumeNode } from "../nodes/scalarVolume.js";
import { validateScalarVolumeNode } from "../nodes/scalarVolume.js";
// Browser entry: the render worker bundles this module, and the "@aura3d/assets" root re-exports Node-only corpus tooling.
import { LoadContext, mergeAssetRequestOptions, type AssetIntegrity, type AssetLoadRequest, type GaussianSplatData } from "@aura3d/assets/browser";
import type { ScalarVolumeAsset } from "@aura3d/assets/importers";
import type { VolumeFrameLease, VolumeRenderer, WebGPUScalarVolumeRenderer } from "@aura3d/rendering/volumetrics";
import { createProjectedSpotResource, type ProjectedSpotFrameIdentity, type ProjectedSpotFrameLease, type ProjectedSpotResource } from "./projectedSpotResources.js";
import type {
  AnyNodeHandler,
  AuraDegradation,
  CompiledActor,
  CompiledScene,
  RenderSourceContributions,
  SceneCompileContext,
  AuraCompiledFeature,
  CompilerImpl
} from "../../contracts/compiler.js";
import type { RuntimeGaussianSplatDraw, RuntimeScalarVolumeDraw } from "./runtimeDraws.js";
import { flattenAuraSceneNodes, flattenNodesWithLineWorldMatrices, sourceSceneNodeOf, worldTransformOf } from "./sceneGraph.js";
import { applySplatLookAt, runtimeNodeEffectiveVisibility, runtimeNodeHandleForSceneNode, runtimeNodeQueryState } from "../app/runtimeNodes.js";
import { localMatrixOf, multiplyMat4Into } from "../sceneGraph.js";
import { flattenTaggingMountedRoots, mountedGroupSpansOf, mountedRootOf, type MountedGroupSpan } from "./mountedRoots.js";
import { ignoredOptionMessages } from "../nodes/optionDiagnostics.js";
import { createRuntimeAddedCollectedLights, isRenderableModelNode, productionRenderErrorMessage, unsupportedLightModulationDegradations } from "./observations.js";
import { createAssetProvenance } from "../diagnostics.js";
import { sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries } from "./primitives.js";
import { withCompileEvidence } from "./compileEvidence.js";
import { qrPrimitiveGeometryOptions } from "./geometry.js";
import { assertFramePivotSupported, createProductionRuntimeRendererInput, frameUsesLegacyModelMatrix, inheritBuiltinGlyphFrame, releaseBuiltinGlyphFrameOwner } from "./renderInput.js";
import { isBuiltinGlyphResource, retireBuiltinGlyphResource, type BuiltinGlyphAtlasScope } from "./BuiltinGlyphAtlas.js";
import { getSceneClipping } from "../nodes/scene.js";
import type { AppTextureResidency } from "./textureResidency.js";
import type { CollectedLight, EnvironmentLightingOptions, ProductionRendererInput, RenderDevice, RenderItem, RenderSource } from "@aura3d/rendering";
import { Renderer, packedLoopMemberFor } from "@aura3d/rendering";
import type { EnvironmentProbe } from "@aura3d/rendering/contracts";
import type { TypedGLBActor, TypedGLBActorOptions } from "../../production-runtime/TypedGLBActor.js";
import { environmentProbeFactorySlot, isEnvironmentProbeFactoryPending } from "@aura3d/rendering/contracts";
import { EnvironmentCache, defaultProbeLoader } from "@aura3d/rendering";
import { bindPrd02EnvironmentProbe, prd02EnvironmentProbeRequestKey, prd02ProbeBindIntensities, runtimeEnvironmentIntensity, scaleEnvironmentLighting } from "./environment.js";
import { resolveEnvironment, type AuraEnvironmentSourceResolution } from "../../contracts/environment.js";
import { prd02LightingOn, updateRuntimePhotometricLights, usePhotometricWorldPose } from "./lights.js";
import { colorToLinearRgb } from "../colorUtils.js";
import { isKnownNodeKind, nodeHandlers, resolveNodeHandler } from "./handlers.js";
import { AuraRuntimeError } from "./errors.js";
import { bindRuntimeCompiled, compilerSlot } from "../../contracts/compiler.js";
import type { RuntimeCompiledSceneInternals } from "../../contracts/compiler.js";

/** Models that need a loaded actor at mount (hidden-at-mount models with a runtime handle can be shown later); module-private,
 * identical to the predicate in observations.ts. */
function isMountableModelNode(node: AuraSceneNode): node is AuraModelNode {
  return node.kind === "model" && Boolean(node.asset.url) && (node.visible !== false || node.runtime?.id !== undefined);
}

export { asRuntimeCompiled } from "../../contracts/compiler.js";

/** Internal context fields the mount supplies beyond the frozen C-36 shape. */
export interface MountSceneCompileContext extends SceneCompileContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /**
   * Live accessor — the HDRI upgrade swaps the lighting object per frame. LIGHT-07: the live snapshot (mount nodes
   * plus runtime adds) lets the mount recompute the environment knob when its environment or light nodes change.
   */
  environmentLighting(liveSnapshot?: AuraSceneSnapshot): EnvironmentLightingOptions;
  /**
   * The frame's collected lights (renderer input, shadow options, the light handler's per-frame update). GU47 eint
   * EB-4: `CompiledSceneImpl` replaces the list (a new array) when runtime-added light nodes join or leave.
   */
  collectedLights: readonly CollectedLight[];
  readonly runtimeWarnings: Set<string>;
  /** Per-view renderer admission is installed; it owns profile failures. */
  readonly photometricProfileAdmissionEnabled?: boolean;
  /** Renderer-owned projected-spot admission and device dimension limit. */
  readonly projectedSpotImageAdmissionEnabled?: boolean;
  readonly projectedSpotMaxDimension?: number;
  /** Schedule a frame after a dynamically added image becomes ready. */
  readonly onProjectedSpotResourceReady?: () => void;
  /**
   * Schedule a frame after an asynchronously acquired environment probe (preset, HDRI, or the structured room that
   * replaces a missing one) is bound. A static scene draws on demand, so without this the upgrade waited for the next
   * unrelated redraw and the floor probe stayed on screen.
   */
  readonly onEnvironmentProbeReady?: () => void;
  /** The registry the mount was created with (t=0 source build only). */
  readonly runtimeNodes?: AuraRuntimeNodeRegistry;
  /** Per-mount actor ownership and transport policy for initial and dynamically added models. */
  readonly runtimeOwner?: object;
  readonly request?: TypedGLBActorOptions["request"];
  readonly formatRegistry?: TypedGLBActorOptions["formatRegistry"];
  readonly assetOptions?: import("../../contracts/assets.js").AuraAssetsOption;
  readonly textureResidency?: AppTextureResidency;
  readonly builtinGlyphAtlas?: BuiltinGlyphAtlasScope;
  /** Mount-owned lifecycle hooks for resources compiled after initial mount. */
  readonly onPrimitiveEntriesAdded?: (entries: readonly ProductionRuntimePrimitiveEntry[]) => void;
  readonly onPrimitiveEntriesRemoved?: (entries: readonly ProductionRuntimePrimitiveEntry[]) => void;
}

function cleanupCompiledPrimitiveResource(resource: ProductionRuntimePrimitiveResource, cleanup: (work: () => void) => void): void {
  if (isBuiltinGlyphResource(resource)) {
    cleanup(() => { retireBuiltinGlyphResource(resource); });
    return;
  }
  const { geometry, shadowGeometry, material, texturedMaterial, textureDisposer } = resource;
  cleanup(() => textureDisposer?.());
  cleanup(() => geometry.dispose());
  cleanup(() => shadowGeometry?.dispose());
  cleanup(() => material.dispose());
  cleanup(() => texturedMaterial?.dispose());
}

/** Per-scene signal for batch route selection, without mutating the shared mount context. */
function batchContext(ctx: SceneCompileContext, sceneClipping: boolean): SceneCompileContext {
  return Object.assign(Object.create(ctx) as SceneCompileContext, { auraBatchSceneClipping: sceneClipping, auraBatchFrameOwnership: true });
}

function retireCompiledActor(ctx: MountSceneCompileContext, actor: TypedGLBActor): void {
  if (ctx.textureResidency) ctx.textureResidency.retireActor(actor);
  else actor.dispose();
}

interface SplatLease {
  readonly node: AuraGaussianSplatNode;
  readonly ready: Promise<void>;
  readonly acquired: boolean;
  readonly clouds: readonly { readonly data: GaussianSplatData; readonly renderer: RuntimeGaussianSplatDraw["renderer"] }[];
  dispose(): void;
}

function canonicalSplatDigest(value: string): string {
  const digest = value.replace(/^sha256-/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("Invalid asset SHA-256 digest");
  return `sha256-${digest}`;
}

function sameSplatIntegrity(a: AssetIntegrity, b: AssetIntegrity): boolean {
  if (a.version !== 1 || b.version !== 1 || canonicalSplatDigest(a.digest) !== canonicalSplatDigest(b.digest)) return false;
  const left = Object.entries(a.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return left.length === right.length && left.every(([key, value], index) =>
    key === right[index]?.[0] && canonicalSplatDigest(value) === canonicalSplatDigest(right[index]![1]));
}

/** Merge the app policy with admitted asset metadata without silently weakening integrity. */
function splatRequest(node: AuraGaussianSplatNode, ctx: MountSceneCompileContext, signal: AbortSignal) {
  const asset = node.asset;
  if (createAssetProvenance(asset).source !== "typed-aura-assets-manifest") {
    throw new Error("Gaussian splats require a typed asset with an admitted SHA-256 hash and provenance");
  }
  const digests = [asset.hash, asset.sha256].filter((value): value is string => value !== undefined).map(canonicalSplatDigest);
  if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting asset SHA-256 digests");
  const integrities = [asset.integrity, asset.request?.integrity, ctx.request?.integrity].filter((value): value is AssetIntegrity => value !== undefined);
  if (integrities.some((integrity) => canonicalSplatDigest(integrity.digest) !== digests[0])) throw new Error("Asset hash does not match its integrity metadata");
  if (integrities.some((integrity) => !sameSplatIntegrity(integrities[0]!, integrity))) throw new Error("Request integrity conflicts with the admitted asset");
  const assetOrigins = asset.request?.allowedOrigins;
  const appOrigins = ctx.request?.allowedOrigins;
  const allowedOrigins = assetOrigins && appOrigins ? assetOrigins.filter((origin) => appOrigins.includes(origin)) : assetOrigins ?? appOrigins;
  const assetBytes = asset.request?.maxBytes;
  const appBytes = ctx.request?.maxBytes;
  const maxBytes = assetBytes !== undefined && appBytes !== undefined ? Math.min(assetBytes, appBytes) : assetBytes ?? appBytes;
  if (asset.request?.expectedUrl && ctx.request?.expectedUrl && asset.request.expectedUrl !== ctx.request.expectedUrl) throw new Error("Conflicting asset expected URLs");
  const integrity = integrities[0] ?? { version: 1 as const, digest: digests[0]! };
  return {
    ...asset.request,
    ...ctx.request,
    signal,
    ...(allowedOrigins ? { allowedOrigins } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    expectedUrl: ctx.request?.expectedUrl ?? asset.request?.expectedUrl ?? asset.url,
    integrity: { ...integrity, requireDependencies: true }
  };
}

/**
 * Opt-in (`gpuSort: true`) native sorter shared by a node's clouds. Rejects on
 * non-WebGPU devices or when the sorter cannot compile; each cloud renderer
 * then keeps its CPU sort and reports the reason in `gpuSortStatus`.
 */
async function createSplatGpuSort(device: RenderDevice, maxItems: number): Promise<import("@aura3d/rendering/webgpu").GaussianSplatGpuSort> {
  if (device.kind !== "webgpu") throw new Error(`GPU splat sort requires WebGPU; using the CPU sort on ${device.kind}`);
  const native = (device as RenderDevice & { readonly nativeGpuDevice?: unknown }).nativeGpuDevice;
  if (!native) throw new Error("GPU splat sort requires the native WebGPU device; using the CPU sort");
  const { createNativeGpuSort } = await import("@aura3d/rendering/webgpu");
  const sorter = await createNativeGpuSort(native, { maxItems });
  return { device: native as import("@aura3d/rendering/webgpu").GaussianSplatGpuOrderDevice, sorter };
}

/** Each distinct cloud owns one GPU renderer, shared by all its glTF instances. */
function createSplatLease(node: AuraGaussianSplatNode, ctx: MountSceneCompileContext): SplatLease {
  const controller = new AbortController();
  const parent = ctx.request?.signal;
  const abort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  let clouds: SplatLease["clouds"] = [];
  let acquired = false;
  let disposed = false;
  let gpuSort: ReturnType<typeof createSplatGpuSort> | undefined;
  const ready = (async () => {
    validateGaussianSplatTransformOptions(node);
    const request = splatRequest(node, ctx, controller.signal);
    const device = (ctx.renderer as { readonly device?: RenderDevice } | undefined)?.device;
    if (!device || !["webgl2", "webgpu", "mock"].includes(device.kind)) throw new Error("Gaussian splats require a supported render device");
    const [{ GaussianSplatLoader }, { GaussianSplatRenderer, gaussianSplatGpuInstanceBytes, GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES, GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS }] = await Promise.all([import("../lazy/assetsBrowserLazy.js"), import("../lazy/renderingLazy.js")]);
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Splat load cancelled");
    const loaded = await new GaussianSplatLoader().load(node.asset.url, {
      ...request,
      format: node.asset.format.toLowerCase() as import("@aura3d/assets/browser").GaussianSplatFormat,
      ...(node.defaultColorSpace !== undefined ? { defaultColorSpace: node.defaultColorSpace } : {}),
      maxPoints: node.maxSplats ?? GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS
    });
    if (controller.signal.aborted || disposed) throw controller.signal.reason ?? new Error("Splat load cancelled");
    const selected = [loaded, ...(loaded.additionalClouds ?? [])].filter((cloud) => cloud.instances === undefined || cloud.instances.length > 0);
    const budget = node.maxGpuBytes ?? GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES;
    if (!Number.isSafeInteger(budget) || budget <= 0) throw new RangeError("maxGpuBytes must be a positive safe integer");
    let gpuBytes = 0;
    for (const cloud of selected) {
      const bytes = gaussianSplatGpuInstanceBytes(cloud.count);
      if (bytes > budget - gpuBytes) throw new RangeError("Gaussian splat cloud buffers exceed maxGpuBytes");
      gpuBytes += bytes;
    }
    const created: Array<{ data: GaussianSplatData; renderer: RuntimeGaussianSplatDraw["renderer"] }> = [];
    try {
      for (const data of selected) {
        const renderer = new GaussianSplatRenderer(device, data, {
          maxSplats: node.maxSplats,
          maxGpuBytes: budget,
          maxRadiusPx: node.maxRadiusPx,
          sigmaCutoff: node.sigmaCutoff,
          opacityCutoff: node.opacityCutoff
        });
        created.push({ data, renderer });
        if (controller.signal.aborted || disposed) throw controller.signal.reason ?? new Error("Splat load cancelled");
      }
      if (node.gpuSort === true) {
        gpuSort = createSplatGpuSort(device, Math.max(2, ...created.map(({ data }) => data.count)));
        for (const { renderer } of created) renderer.enableGpuSort(gpuSort);
      }
    } catch (error) {
      for (const cloud of created) { try { cloud.renderer.dispose(); } catch { /* Preserve the acquisition failure. */ } }
      gpuSort?.then((gpu) => gpu.sorter.dispose(), () => undefined).catch(() => undefined);
      gpuSort = undefined;
      throw error;
    }
    clouds = created;
    acquired = true;
  })().finally(() => parent?.removeEventListener("abort", abort));
  return {
    node, ready,
    get clouds() { return clouds; },
    get acquired() { return acquired; },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      parent?.removeEventListener("abort", abort);
      const owned = clouds;
      clouds = [];
      acquired = false;
      let failure: unknown;
      for (const cloud of owned) {
        try { cloud.renderer.dispose(); } catch (error) { failure ??= error; }
      }
      // The sorter outlives the renderers only until its in-flight sorts settle.
      gpuSort?.then((gpu) => gpu.sorter.dispose(), () => undefined).catch(() => undefined);
      gpuSort = undefined;
      if (failure !== undefined) throw failure;
    }
  };
}

/** Columns of the asset's local axes in the renderer's RUB scene basis. */
function splatBasis(system = "RUB"): Float32Array {
  const axes: Readonly<Record<string, readonly [number, number, number]>> = {
    R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], B: [0, 0, 1], F: [0, 0, -1]
  };
  const x = axes[system[0]!], y = axes[system[1]!], z = axes[system[2]!];
  if (!x || !y || !z) throw new Error(`Unsupported splat coordinate system: ${system}`);
  return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]);
}

/** Convert an asset-space instance into the RUB basis already used by the renderer's model matrix. */
function splatInstanceInSceneBasis(matrix: readonly number[], system = "RUB"): Float32Array {
  const basis = splatBasis(system);
  const inverse = new Float32Array([basis[0]!, basis[4]!, basis[8]!, 0, basis[1]!, basis[5]!, basis[9]!, 0, basis[2]!, basis[6]!, basis[10]!, 0, 0, 0, 0, 1]);
  const first = new Float32Array(16);
  const result = new Float32Array(16);
  multiplyMat4Into(first, basis, Float32Array.from(matrix));
  multiplyMat4Into(result, first, inverse);
  return result;
}

function splatWorldBounds(data: GaussianSplatData, modelMatrix: Float32Array, sigma: number | undefined): RuntimeGaussianSplatDraw["worldBounds"] {
  const world = new Float32Array(16);
  multiplyMat4Into(world, modelMatrix, splatBasis(data.metadata.coordinateSystem));
  const scale = Math.max(1, (sigma ?? 3) / 3); // Loader bounds use three standard deviations.
  const lo = data.bounds.min.map((value, axis) => (value + data.bounds.max[axis]!) / 2 - (data.bounds.max[axis]! - value) * scale / 2);
  const hi = data.bounds.max.map((value, axis) => (value + data.bounds.min[axis]!) / 2 + (value - data.bounds.min[axis]!) * scale / 2);
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner++) {
    const x = (corner & 1) ? hi[0]! : lo[0]!, y = (corner & 2) ? hi[1]! : lo[1]!, z = (corner & 4) ? hi[2]! : lo[2]!;
    for (let axis = 0; axis < 3; axis++) {
      const value = world[axis]! * x + world[4 + axis]! * y + world[8 + axis]! * z + world[12 + axis]!;
      if (!Number.isFinite(value)) throw new RangeError("Gaussian splat world bounds must be finite");
      min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
    }
  }
  // The submitted matrix is float32. Round outwards so a boundary touch is never culled by a rounding difference.
  for (let axis = 0; axis < 3; axis++) {
    const epsilon = Math.max(1, Math.abs(min[axis]!), Math.abs(max[axis]!)) * 1e-6;
    min[axis] -= epsilon; max[axis] += epsilon;
  }
  return { min, max };
}

function splatDraws(leases: Iterable<SplatLease>, runtime: AuraRuntimeNodeRegistry | undefined): RuntimeGaussianSplatDraw[] {
  const draws: RuntimeGaussianSplatDraw[] = [];
  for (const lease of leases) {
    const { node } = lease;
    if (!lease.acquired) continue;
    const source = sourceSceneNodeOf(node) ?? node;
    const handle = node.runtime?.id ? runtime?.get(node.runtime.id) : runtimeNodeHandleForSceneNode(runtime, source);
    if (handle ? !runtimeNodeEffectiveVisibility(handle) : node.visible === false) continue;
    const world = handle ? runtimeNodeQueryState(handle)?.worldMatrix : worldTransformOf(node)?.matrix;
    let root = world ? Float32Array.from(world) : localMatrixOf(node, new Float32Array(16));
    if (!handle && node.lookAt) root = applySplatLookAt(root, node.lookAt, node.pivot);
    const layerValue = handle?.layers.mask ?? node.layers ?? 1;
    const frustumCulled = handle?.frustumCulled ?? node.frustumCulled ?? true;
    const renderOrder = handle?.renderOrder ?? node.renderOrder ?? 0;
    if (!Number.isInteger(layerValue) || layerValue < -0x80000000 || layerValue > 0xffffffff || !Number.isFinite(renderOrder) || typeof frustumCulled !== "boolean") throw new RangeError("Invalid Gaussian splat layer, culling, or render order");
    const layerMask = layerValue >>> 0;
    for (const { renderer, data } of lease.clouds) {
      const entry = (modelMatrix: Float32Array): RuntimeGaussianSplatDraw => ({
        renderer, modelMatrix, colorSpace: data.metadata.colorSpace, layerMask, frustumCulled, renderOrder,
        worldBounds: splatWorldBounds(data, modelMatrix, node.sigmaCutoff)
      });
      const instances = data.instances;
      if (instances === undefined) draws.push(entry(root));
      else for (const instance of instances) {
        const modelMatrix = new Float32Array(16);
        multiplyMat4Into(modelMatrix, root, splatInstanceInSceneBasis(instance.worldMatrix, data.metadata.coordinateSystem));
        draws.push(entry(modelMatrix));
      }
    }
  }
  return draws;
}

interface VolumeCleanupTracker {
  readonly pending: Set<Promise<void>>;
  readonly failures: unknown[];
}

function createVolumeCleanupTracker(): VolumeCleanupTracker {
  return { pending: new Set(), failures: [] };
}

function releaseVolumeAsset(tracker: VolumeCleanupTracker, release: () => void | Promise<void>): void {
  const pending = release();
  if (!pending) return;
  const observed = Promise.resolve(pending).catch((error: unknown) => { tracker.failures.push(error); });
  tracker.pending.add(observed);
  void observed.then(() => { tracker.pending.delete(observed); });
}

async function awaitVolumeCleanup(tracker: VolumeCleanupTracker): Promise<void> {
  while (tracker.pending.size) await Promise.all([...tracker.pending]);
  if (tracker.failures.length) throw new AggregateError(tracker.failures, "Scalar volume asset cleanup failed");
}

type DeviceVolumeRenderer = VolumeRenderer | WebGPUScalarVolumeRenderer;

interface VolumeLease {
  readonly node: AuraScalarVolumeNode;
  readonly ready: Promise<void>;
  readonly acquired: boolean;
  readonly renderer: DeviceVolumeRenderer | undefined;
  readonly dataToLocal: Float32Array | undefined;
  dispose(): void;
}

/** Apply the app and manifest transport policies without weakening either. */
function scalarVolumeRequest(node: AuraScalarVolumeNode, ctx: MountSceneCompileContext, signal: AbortSignal): AssetLoadRequest {
  const asset = node.asset;
  if (createAssetProvenance(asset).source !== "typed-aura-assets-manifest") {
    throw new Error("Scalar volumes require a typed asset with an admitted SHA-256 hash and provenance");
  }
  const digests = [asset.hash, asset.sha256].filter((value): value is string => value !== undefined).map(canonicalSplatDigest);
  if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting asset SHA-256 digests");
  const integrities = [asset.integrity, asset.request?.integrity, ctx.request?.integrity].filter((value): value is AssetIntegrity => value !== undefined);
  if (integrities.some((integrity) => canonicalSplatDigest(integrity.digest) !== digests[0])) throw new Error("Asset hash does not match its integrity metadata");
  if (integrities.some((integrity) => !sameSplatIntegrity(integrities[0]!, integrity))) throw new Error("Request integrity conflicts with the admitted asset");
  const assetOrigins = asset.request?.allowedOrigins;
  const appOrigins = ctx.request?.allowedOrigins;
  const allowedOrigins = assetOrigins && appOrigins ? assetOrigins.filter((origin) => appOrigins.includes(origin)) : assetOrigins ?? appOrigins;
  const assetBytes = asset.request?.maxBytes;
  const appBytes = ctx.request?.maxBytes;
  const maxBytes = assetBytes !== undefined && appBytes !== undefined ? Math.min(assetBytes, appBytes) : assetBytes ?? appBytes;
  if (asset.request?.expectedUrl && ctx.request?.expectedUrl && asset.request.expectedUrl !== ctx.request.expectedUrl) throw new Error("Conflicting asset expected URLs");
  const integrity = integrities[0] ?? { version: 1 as const, digest: digests[0]! };
  const options = mergeAssetRequestOptions(asset.request, ctx.request);
  return {
    ...options, url: asset.url, format: asset.format.toLowerCase(), signal,
    ...(allowedOrigins ? { allowedOrigins: [...allowedOrigins] } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    expectedUrl: ctx.request?.expectedUrl ?? asset.request?.expectedUrl ?? asset.url,
    integrity: { ...integrity, ...(integrity.dependencies ? { dependencies: { ...integrity.dependencies } } : {}), requireDependencies: true }
  };
}

/** Reject malformed custom adapter results before allocating native resources. */
function scalarVolumeAssetData(asset: ScalarVolumeAsset, maxVoxels: number | undefined): { readonly data: ScalarVolumeAsset["data"]; readonly dimensions: [number, number, number]; readonly dataToLocal: Float32Array } {
  if (!asset || asset.kind !== "scalar-volume" || !Array.isArray(asset.dimensions) || asset.dimensions.length !== 3) {
    throw new TypeError("Scalar volume adapter returned an invalid asset");
  }
  const dimensions = [...asset.dimensions] as [number, number, number];
  let count = 1;
  for (const dimension of dimensions) {
    if (!Number.isSafeInteger(dimension) || dimension < 2 || count > Math.floor((maxVoxels ?? 16_777_216) / dimension)) {
      throw new RangeError("Scalar volume dimensions exceed the voxel budget or are invalid");
    }
    count *= dimension;
  }
  const data = asset.data;
  if (!(data instanceof Int8Array || data instanceof Uint8Array || data instanceof Int16Array || data instanceof Uint16Array || data instanceof Float32Array) || data.length !== count) {
    throw new TypeError("Scalar volume samples must match the dimensions and use a supported type");
  }
  for (const value of data) if (!Number.isFinite(value)) throw new RangeError("Scalar volume samples must be finite");
  if (!(asset.dataToLocal instanceof Float32Array) || asset.dataToLocal.length !== 16 || !asset.dataToLocal.every(Number.isFinite)) {
    throw new RangeError("Scalar volume transform must contain 16 finite float32 values");
  }
  const matrix = Float32Array.from(asset.dataToLocal);
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw new RangeError("Scalar volume transform must be affine");
  const rows = Array.from({ length: 3 }, (_, row) => Array.from({ length: 6 }, (_, column) =>
    column < 3 ? matrix[column * 4 + row]! : Number(column - 3 === row)));
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    const scale = rows[pivot]![column]!;
    if (!Number.isFinite(scale) || Math.abs(scale) < 1e-15) throw new RangeError("Scalar volume transform must be invertible");
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    for (let entry = 0; entry < 6; entry++) rows[column]![entry] = rows[column]![entry]! / scale;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let entry = 0; entry < 6; entry++) rows[row]![entry] = rows[row]![entry]! - factor * rows[column]![entry]!;
    }
  }
  for (const row of rows) for (const value of row.slice(3)) if (!Number.isFinite(Math.fround(value))) throw new RangeError("Scalar volume inverse transform exceeds float32 range");
  return { data, dimensions, dataToLocal: matrix };
}

/** One node owns its parsed data and native renderer until removal or teardown. */
function createVolumeLease(node: AuraScalarVolumeNode, ctx: MountSceneCompileContext, cleanup: VolumeCleanupTracker): VolumeLease {
  const controller = new AbortController();
  const parent = ctx.request?.signal;
  const abort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  let renderer: DeviceVolumeRenderer | undefined;
  let dataToLocal: Float32Array | undefined;
  let releaseAsset: (() => void | Promise<void>) | undefined;
  let acquired = false;
  let disposed = false;
  const ready = (async () => {
    validateScalarVolumeNode(node);
    const request = scalarVolumeRequest(node, ctx, controller.signal);
    const metadata = node.asset.formatMetadata
      ? { ...node.asset.formatMetadata, ...(node.asset.formatMetadata.source ? { source: { ...node.asset.formatMetadata.source } } : {}) }
      : undefined;
    const device = (ctx.renderer as { readonly device?: RenderDevice } | undefined)?.device;
    if (!device || (device.kind !== "webgl2" && device.kind !== "webgpu")) throw new Error("SCALAR_VOLUME_BACKEND_UNSUPPORTED: WebGL2 or WebGPU is required");
    const [{ ScalarVolumeLoader }, { VolumeRenderer, WebGPUScalarVolumeRenderer }] = await Promise.all([
      import("../lazy/assetsImportersLazy.js"), import("@aura3d/rendering/volumetrics")
    ]);
    if (controller.signal.aborted || disposed) throw controller.signal.reason ?? new Error("Scalar volume load cancelled");
    const context = new LoadContext({ signal: controller.signal, ...mergeAssetRequestOptions({}, request) });
    let asset: ScalarVolumeAsset;
    let release: (() => void | Promise<void>) | undefined;
    let created: DeviceVolumeRenderer | undefined;
    try {
      if (metadata?.adapter) {
        if (!ctx.formatRegistry) throw new Error(`SCALAR_VOLUME_ADAPTER_REQUIRED: ${metadata.adapter}`);
        const selection = { format: request.format, formatMetadata: metadata, abortCleanup: "settled" as const };
        const selected = ctx.formatRegistry.select(request, selection);
        if (metadata.version !== undefined && !selected.validateLoadedAsset) throw new Error("SCALAR_VOLUME_VERSION_UNVERIFIED");
        const lease = await ctx.formatRegistry.load<ScalarVolumeAsset>(request, context, selection);
        asset = lease.asset;
        release = () => lease.dispose();
      } else {
        if (metadata?.version !== undefined) throw new Error("SCALAR_VOLUME_VERSION_UNVERIFIED");
        if (metadata?.mediaType !== undefined) throw new Error("SCALAR_VOLUME_MEDIA_TYPE_UNSUPPORTED");
        if (metadata?.source && metadata.source.conversion !== "offline") throw new Error("SCALAR_VOLUME_PROVENANCE_UNSUPPORTED");
        const loader = new ScalarVolumeLoader({ maxVoxels: node.maxVoxels });
        asset = await loader.load(request, context);
        release = () => loader.dispose(asset);
      }
      if (controller.signal.aborted || disposed) throw controller.signal.reason ?? new Error("Scalar volume load cancelled");
      const checked = scalarVolumeAssetData(asset, node.maxVoxels);
      const options = {
        dimensions: checked.dimensions, data: checked.data, domain: node.domain, transfer: node.transfer,
        clipPlanes: node.clipPlanes, density: node.density, sampleCount: node.sampleCount, maxVoxels: node.maxVoxels
      };
      created = device.kind === "webgpu" ? new WebGPUScalarVolumeRenderer(device, options) : VolumeRenderer.fromDevice(device, options);
      if (controller.signal.aborted || disposed) throw controller.signal.reason ?? new Error("Scalar volume load cancelled");
      renderer = created;
      dataToLocal = checked.dataToLocal;
      releaseAsset = release;
      acquired = true;
    } catch (error) {
      const failures: unknown[] = [error];
      try { created?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
      if (release) try { releaseVolumeAsset(cleanup, release); } catch (cleanupError) { failures.push(cleanupError); }
      if (failures.length > 1) throw new AggregateError(failures, "Scalar volume acquisition and cleanup failed");
      throw error;
    }
  })().finally(() => parent?.removeEventListener("abort", abort));
  // A disposed scene must wait for a cancelled acquisition and its cleanup.
  const observedReady = ready.then(() => undefined, (error: unknown) => {
    const code = (error as { readonly code?: unknown } | null)?.code;
    if (disposed && (code === "FORMAT_ABORT_CLEANUP_FAILED" || code === "FORMAT_ABORT_LOAD_FAILED")) cleanup.failures.push(error);
  });
  cleanup.pending.add(observedReady);
  void observedReady.then(() => { cleanup.pending.delete(observedReady); });
  return {
    node, ready,
    get acquired() { return acquired; },
    get renderer() { return renderer; },
    get dataToLocal() { return dataToLocal; },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      parent?.removeEventListener("abort", abort);
      const ownedRenderer = renderer;
      const ownedAsset = releaseAsset;
      renderer = undefined; releaseAsset = undefined; dataToLocal = undefined; acquired = false;
      const failures: unknown[] = [];
      try { ownedRenderer?.dispose(); } catch (error) { failures.push(error); }
      if (ownedAsset) try { releaseVolumeAsset(cleanup, ownedAsset); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, "Scalar volume cleanup failed");
    }
  };
}

function scalarVolumeWorldBounds(modelMatrix: Float32Array): RuntimeScalarVolumeDraw["worldBounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner++) {
    const x = (corner & 1) ? 1 : 0, y = (corner & 2) ? 1 : 0, z = (corner & 4) ? 1 : 0;
    for (let axis = 0; axis < 3; axis++) {
      const value = modelMatrix[axis]! * x + modelMatrix[4 + axis]! * y + modelMatrix[8 + axis]! * z + modelMatrix[12 + axis]!;
      if (!Number.isFinite(value)) throw new RangeError("Scalar volume world bounds must be finite");
      min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const epsilon = Math.max(1, Math.abs(min[axis]!), Math.abs(max[axis]!)) * 1e-6;
    min[axis] -= epsilon; max[axis] += epsilon;
  }
  return { min, max };
}

function scalarVolumeDraws(leases: Iterable<VolumeLease>, runtime: AuraRuntimeNodeRegistry | undefined, device: RenderDevice,
  frameLeases: Set<VolumeFrameLease>): RuntimeScalarVolumeDraw[] {
  const draws: RuntimeScalarVolumeDraw[] = [];
  const acquired = new Map<DeviceVolumeRenderer, VolumeFrameLease>();
  for (const lease of leases) {
    const { node, renderer, dataToLocal } = lease;
    if (!lease.acquired || !renderer || !dataToLocal) continue;
    const source = sourceSceneNodeOf(node) ?? node;
    const handle = node.runtime?.id ? runtime?.get(node.runtime.id) : runtimeNodeHandleForSceneNode(runtime, source);
    if (handle ? !runtimeNodeEffectiveVisibility(handle) : node.visible === false) continue;
    const world = handle ? runtimeNodeQueryState(handle)?.worldMatrix : worldTransformOf(node)?.matrix;
    const root = world ? Float32Array.from(world) : localMatrixOf(node, new Float32Array(16));
    const modelMatrix = new Float32Array(16);
    multiplyMat4Into(modelMatrix, root, dataToLocal);
    if (!modelMatrix.every(Number.isFinite)) throw new RangeError("Scalar volume model matrix must be finite");
    const layerValue = handle?.layers.mask ?? node.layers ?? 1;
    const frustumCulled = handle?.frustumCulled ?? node.frustumCulled ?? true;
    const renderOrder = handle?.renderOrder ?? node.renderOrder ?? 0;
    if (!Number.isInteger(layerValue) || layerValue < -0x80000000 || layerValue > 0xffffffff || !Number.isFinite(renderOrder) || typeof frustumCulled !== "boolean") {
      throw new RangeError("Invalid scalar volume layer, culling, or render order");
    }
    let frameLease = acquired.get(renderer);
    if (!frameLease) {
      frameLease = renderer.acquireFrameLease(device);
      acquired.set(renderer, frameLease);
      frameLeases.add(frameLease);
    }
    draws.push({ renderer, frameLease, modelMatrix, worldBounds: scalarVolumeWorldBounds(modelMatrix), layerMask: layerValue >>> 0,
      frustumCulled, renderOrder, mode: node.mode ? { ...node.mode } : { type: "raymarch" } });
  }
  return draws;
}

interface ProjectedSpotResourceView {
  matchesAsset(asset: unknown): boolean;
  acquireFrame(identity: ProjectedSpotFrameIdentity): ProjectedSpotFrameLease | undefined;
}

interface ProjectedSpotEntry {
  readonly asset: AuraAssetRef<"texture">;
  readonly resource: ProjectedSpotResource;
  readonly view: ProjectedSpotResourceView;
  readonly owners: Set<AuraLightNode>;
}

/** Own one verified projection per source asset until its final scene node retires. */
class ProjectedSpotSceneResources {
  private readonly entries = new Map<AuraAssetRef<"texture">, ProjectedSpotEntry>();
  private readonly byNode = new Map<AuraLightNode, ProjectedSpotEntry>();
  private readonly failures = new Map<AuraLightNode, string>();
  private readonly pending = new Set<Promise<void>>();
  private readonly cleanupFailures: unknown[] = [];
  private closed = false;

  constructor(private readonly ctx: MountSceneCompileContext) {}

  add(node: AuraLightNode, notifyOnReady: boolean): Promise<void> | undefined {
    if (!this.ctx.projectedSpotImageAdmissionEnabled || node.light !== "spot" || node.projectedImage === undefined) return undefined;
    if (this.closed) throw new Error("Projected spot scene is disposed");
    const asset = node.projectedImage.texture;
    let entry = this.entries.get(asset);
    try {
      if (entry && !entry.resource.matchesAsset(asset)) throw new Error("Projected spot asset changed after admission");
      if (!entry) {
        const renderer = this.ctx.renderer as { readonly device?: RenderDevice; postScopeId?: () => object } | undefined;
        if (!renderer?.device || typeof renderer.postScopeId !== "function") throw new Error("Projected spot renderer ownership is unavailable");
        const resource = createProjectedSpotResource(asset, {
          device: renderer.device, owner: renderer.postScopeId(), request: this.ctx.request,
          signal: this.ctx.request?.signal, maxDimension: this.ctx.projectedSpotMaxDimension
        });
        const view: ProjectedSpotResourceView = Object.freeze({
          matchesAsset: (candidate: unknown) => candidate === asset && resource.matchesAsset(asset),
          acquireFrame: (identity: ProjectedSpotFrameIdentity) => resource.acquireFrame(identity)
        });
        entry = { asset, resource, view, owners: new Set() };
        this.entries.set(asset, entry);
        const observed = resource.settled.catch((error: unknown) => { this.cleanupFailures.push(error); });
        this.pending.add(observed);
        void observed.then(() => { this.pending.delete(observed); });
      }
    } catch (error) {
      if (this.ctx.strict) throw error;
      this.report(node, error);
      return undefined;
    }
    const owned = entry;
    owned.owners.add(node);
    this.byNode.set(node, owned);
    void owned.resource.ready.then(() => {
      if (!notifyOnReady || this.closed || this.byNode.get(node) !== owned) return;
      try { this.ctx.onProjectedSpotResourceReady?.(); }
      catch (error) { this.report(node, error); }
    }, (error: unknown) => {
      if (!this.closed && this.byNode.get(node) === owned && !this.ctx.request?.signal?.aborted) this.report(node, error);
    });
    return owned.resource.ready;
  }

  private report(node: AuraLightNode, error: unknown): void {
    const message = sanitizeDiagnosticText(`PROJECTED_SPOT_LOAD_FAILED: ${node.name ?? node.projectedImage?.texture.id ?? "spot"}: ${productionRenderErrorMessage(error)}`);
    this.failures.set(node, message);
    this.ctx.runtimeWarnings.add(message);
  }

  publishFailures(): void {
    for (const message of this.failures.values()) this.ctx.runtimeWarnings.add(message);
  }

  resourceFor(candidate: unknown): ProjectedSpotResourceView | undefined {
    if (this.closed || !candidate || typeof candidate !== "object") return undefined;
    const entry = this.entries.get(candidate as AuraAssetRef<"texture">);
    if (!entry || entry.resource.state !== "ready" || !entry.resource.matchesAsset(entry.asset)) return undefined;
    return entry.view;
  }

  remove(node: AuraSceneNode): void {
    if (node.kind !== "light") return;
    this.failures.delete(node);
    const entry = this.byNode.get(node);
    if (!entry) return;
    this.byNode.delete(node);
    entry.owners.delete(node);
    if (entry.owners.size === 0) {
      this.entries.delete(entry.asset);
      entry.resource.dispose();
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const failures: unknown[] = [];
    for (const entry of this.entries.values()) try { entry.resource.dispose(); } catch (error) { failures.push(error); }
    this.entries.clear(); this.byNode.clear(); this.failures.clear();
    if (failures.length) throw new AggregateError(failures, "Projected spot cleanup failed");
  }

  async whenSettled(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
    if (this.cleanupFailures.length) throw new AggregateError(this.cleanupFailures, "Projected spot transport cleanup failed");
  }
}

interface ContributionState {
  readonly items: RenderItem[];
  readonly lights: CollectedLight[];
  readonly overrides: Map<string, unknown>;
  readonly features: Set<AuraCompiledFeature>;
}

function createContributions(): ContributionState {
  return { items: [], lights: [], overrides: new Map(), features: new Set() };
}

// A prepared frame may be discarded, precompiled, or kept across an async
// render. Each source owns one reference; an in-flight consumer holds another.
// All members from one producer share a lease, so release it only once.
interface CompiledFrameLease { release(): void }
interface CompiledBatchFrame {
  refs: number;
  ownerReleased: boolean;
  readonly leases: Set<CompiledFrameLease>;
  readonly owner: Set<CompiledBatchFrame>;
}
const compiledBatchFrames = new WeakMap<object, CompiledBatchFrame>();

function releaseBatchLeases(leases: Set<CompiledFrameLease>): void {
  const failures: unknown[] = [];
  for (const lease of leases) {
    try { lease.release(); } catch (error) { failures.push(error); }
  }
  leases.clear();
  if (failures.length) throw new AggregateError(failures, "Compiled batch lease cleanup failed");
}

function releaseBatchFrameRef(frame: CompiledBatchFrame): void {
  if (--frame.refs !== 0) return;
  frame.owner.delete(frame);
  releaseBatchLeases(frame.leases);
}

function releaseUnpublishedBatchItems(items: readonly RenderItem[], volumes: ReadonlySet<VolumeFrameLease> = new Set()): void {
  const leases = new Set<CompiledFrameLease>(items.map(packedLoopMemberFor).filter((packet) => packet !== undefined).map((packet) => packet.lease));
  for (const lease of volumes) leases.add(lease);
  releaseBatchLeases(leases);
}

function publishCompiledBatchFrame(source: RenderSource, items: readonly RenderItem[], owner: Set<CompiledBatchFrame>, volumes: ReadonlySet<VolumeFrameLease>): void {
  const leases = new Set<CompiledFrameLease>(items.map(packedLoopMemberFor).filter((packet) => packet !== undefined).map((packet) => packet.lease));
  for (const lease of volumes) leases.add(lease);
  if (!leases.size) return;
  const frame: CompiledBatchFrame = { refs: 1, ownerReleased: false, leases, owner };
  owner.add(frame);
  compiledBatchFrames.set(source, frame);
}

/** Carry frame ownership when the production bridge copies a source. */
export function inheritCompiledBatchFrame(source: object, copy: object): void {
  const frame = compiledBatchFrames.get(source);
  if (frame) compiledBatchFrames.set(copy, frame);
}

/** Retain a prepared source while its consumer is active. */
export function retainCompiledBatchFrame(source: object): () => void {
  const frame = compiledBatchFrames.get(source);
  if (!frame || frame.refs === 0) return () => {};
  frame.refs += 1;
  let released = false;
  return () => { if (!released) { released = true; releaseBatchFrameRef(frame); } };
}

function releaseCompiledBatchFrameOwner(source: object | undefined): void {
  const frame = source && compiledBatchFrames.get(source);
  if (!frame || frame.ownerReleased) return;
  frame.ownerReleased = true;
  releaseBatchFrameRef(frame);
}

function releaseCompiledFrameOwners(source: object | undefined): void {
  const failures: unknown[] = [];
  try { releaseCompiledBatchFrameOwner(source); } catch (error) { failures.push(error); }
  try { releaseBuiltinGlyphFrameOwner(source); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, "Compiled frame cleanup failed");
}

class SourceContributions implements RenderSourceContributions {
  constructor(protected state: ContributionState) {}
  addItems(items: readonly unknown[]): void {
    this.state.items.push(...(items as readonly RenderItem[]));
  }
  addLights(lights: readonly unknown[]): void {
    this.state.lights.push(...(lights as readonly CollectedLight[]));
  }
  set<K extends string>(field: K, value: unknown): void {
    this.state.overrides.set(field, value);
  }
  feature(f: AuraCompiledFeature): void {
    this.state.features.add(f);
  }
}

/** What one handled node's compile() put into the persistent contributions, so a subtree removal can take it back out. */
interface NodeCompileRecord {
  readonly items: RenderItem[];
  readonly lights: CollectedLight[];
  readonly overrides: Map<string, unknown>;
  /** Stop late asynchronous handler writes once the owning node is removed. */
  stop(): void;
}

/** Writes through to `state` like `SourceContributions` and records what was written for `removeSubtree`. */
class RecordingContributions extends SourceContributions {
  private stopped = false;
  readonly record: NodeCompileRecord = { items: [], lights: [], overrides: new Map(), stop: () => { this.stopped = true; } };
  constructor(state: ContributionState, private readonly retainItems = true) { super(state); }
  /** Move staged writes to the live destination only after publication. */
  publish(state: ContributionState): void { this.state = state; }
  addItems(items: readonly unknown[]): void {
    // Batched items are regenerated by update() on every frame. Retaining the
    // compile-time copies would draw stale duplicates after hide or disposal.
    if (this.stopped || !this.retainItems) return;
    super.addItems(items);
    this.record.items.push(...(items as readonly RenderItem[]));
  }
  addLights(lights: readonly unknown[]): void {
    if (this.stopped) return;
    super.addLights(lights);
    this.record.lights.push(...(lights as readonly CollectedLight[]));
  }
  set<K extends string>(field: K, value: unknown): void {
    if (this.stopped) return;
    super.set(field, value);
    this.record.overrides.set(field, value);
  }
  feature(feature: AuraCompiledFeature): void {
    if (!this.stopped) super.feature(feature);
  }
}

/** Private transaction used by the runtime registry while it publishes handles. */
export interface CompiledSubtreeMutation {
  commit(): void;
  rollback(): void;
}

interface CompiledSubtreeGeneration {
  readonly id: string;
  readonly node: AuraSceneNode;
  readonly flat: AuraSceneNode[];
  readonly previousNode: AuraSceneNode | undefined;
  readonly previousFlat: AuraSceneNode[] | undefined;
  readonly previousOwner: object | undefined;
  readonly previousParent: { readonly id: string; readonly owner: object } | undefined;
  readonly previousAncestors: MountedGroupSpan["ancestors"] | undefined;
  readonly nested: CompiledSubtreeGeneration[];
  state: "pending" | "committed" | "rolled-back" | "superseded";
}

interface CompiledParentBinding {
  readonly node: AuraSceneNode;
  readonly rootId: string;
  readonly owner: object;
}

/**
 * Flattens each top-level node on its own, retaining full matrices for lines while preserving other legacy node semantics.
 * Each top-level runtime id keeps its own flattened descendants, so
 * `app.nodes.remove(id)` on a mounted group or look can find them: groups themselves vanish in the flatten.
 */
function flattenPerRoot(nodes: readonly AuraSceneNode[]): { flat: AuraSceneNode[]; byRoot: Map<string, AuraSceneNode[]>; groups: readonly MountedGroupSpan[] } {
  const flat: AuraSceneNode[] = [];
  const byRoot = new Map<string, AuraSceneNode[]>();
  const groups: MountedGroupSpan[] = [];
  const inherited = mountedGroupSpansOf(nodes);
  const offsets = [0];
  for (const node of nodes) {
    const part = inherited ? flattenNodesWithLineWorldMatrices([node]) : flattenTaggingMountedRoots([node], flattenNodesWithLineWorldMatrices);
    const start = flat.length;
    flat.push(...part);
    offsets.push(flat.length);
    if (!inherited) for (const group of mountedGroupSpansOf(part) ?? []) {
      groups.push({ ...group, start: start + group.start, end: start + group.end });
    }
    // A node the app already flattened out of a mounted group or look carries that root's id (see mountedRoots.ts).
    const id = mountedRootOf(node) ?? ("runtime" in node ? node.runtime?.id : undefined);
    if (id) byRoot.set(id, (byRoot.get(id) ?? []).concat(part));
  }
  if (inherited) for (const group of inherited) {
    groups.push({ ...group, start: offsets[group.start]!, end: offsets[group.end]! });
  }
  for (const group of groups) byRoot.set(group.id, flat.slice(group.start, group.end));
  return { flat, byRoot, groups };
}

function mergeContributions(source: RenderSource, contributions: ContributionState): RenderSource {
  if (!contributions.items.length && !contributions.lights.length && !contributions.overrides.size) {
    return source;
  }
  const baseCollect = source.collectRenderItems?.bind(source);
  const baseItems = source.renderItems;
  const baseLights = source.collectedLights;
  const merged: RenderSource = {
    ...source,
    collectRenderItems(): Iterable<RenderItem> {
      const base = baseCollect ? [...baseCollect()] : baseItems ? [...baseItems] : [];
      return [...base, ...contributions.items];
    },
    collectedLights: [...(baseLights ? [...baseLights] : []), ...contributions.lights]
  };
  for (const [field, value] of contributions.overrides) {
    (merged as Record<string, unknown>)[field] = value;
  }
  return merged;
}

/** Public surface of the real impl — the bridge consumable per frame. */
export class CompiledSceneImpl implements CompiledScene {
  source: RenderSource | null;
  private readonly batchFrames = new Set<CompiledBatchFrame>();

  publishBatchFrame(source: RenderSource, items: readonly RenderItem[], volumes: ReadonlySet<VolumeFrameLease> = new Set()): void {
    publishCompiledBatchFrame(source, items, this.batchFrames, volumes);
  }
  /** Latest frame input (source + camera) for `renderer.ts`'s render calls. */
  lastInput: ProductionRendererInput | null = null;
  /** Mutable entry lists — C-37 add/remove grow and shrink them without remount. */
  actorEntries: ProductionRuntimeActorEntry[];
  primitiveEntries: ProductionRuntimePrimitiveEntry[];
  handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[];
  actors: CompiledActor[];
  /** Flattened node set the per-frame update draws from (base + dynamically added). */
  liveNodes: AuraSceneNode[];
  /** Raw (pre-flatten) nodes added via the C-37 subtree path, keyed by their root runtime id. */
  dynamicRoots = new Map<string, AuraSceneNode>();
  /**
   * Flattened nodes belonging to each runtime root (for subtree dispose): dynamic roots added through `addSubtree`, and the
   * top-level mounted nodes that carry a runtime id (from `mountedFlat`).
   */
  dynamicFlat = new Map<string, AuraSceneNode[]>();
  /** What each handled node's compile() contributed to `persistentContributions` (taken back out by `removeSubtree`). */
  compileRecords = new Map<AuraSceneNode, NodeCompileRecord>();
  /** RenderItem reuse cache for A3D_QR_COMPILER frames (T3.12): `${runtimeId}:${itemIndex}` → {version, item}. */
  itemCache = new Map<string, { version: number; item: RenderItem }>();
  /** Source contributions made by dynamically added subtree handlers. */
  persistentContributions = createContributions();
  /** Refreshed from the current snapshot before each frame and reused for subtree compilation. */
  batchSceneClipping = false;
  /** Per-node leases prevent a removed or superseded load from mounting late. */
  readonly splatLeases = new Map<AuraGaussianSplatNode, SplatLease>();
  get loadedSplatAssetIds(): readonly string[] {
    return [...new Set([...this.splatLeases.values()].filter((lease) => lease.acquired).map((lease) => lease.node.asset.id))];
  }
  /** Per acquired cloud: whether its sort runs on the GPU (`gpuSort: true`) or why it fell back to the CPU. */
  get splatSortStatus(): readonly { readonly assetId: string; readonly status: import("@aura3d/rendering").GaussianSplatGpuSortStatus }[] {
    return [...this.splatLeases.values()].filter((lease) => lease.acquired)
      .flatMap((lease) => lease.clouds.map(({ renderer }) => ({ assetId: lease.node.asset.id, status: renderer.gpuSortStatus })));
  }
  private readonly splatFailures = new Map<AuraGaussianSplatNode, string>();
  /** Volume assets and native renderers are owned per compiled node. */
  readonly volumeLeases = new Map<AuraScalarVolumeNode, VolumeLease>();
  hasOwnedScalarVolumes = false;
  get loadedScalarVolumeAssetIds(): readonly string[] {
    return [...new Set([...this.volumeLeases.values()].filter((lease) => lease.acquired).map((lease) => lease.node.asset.id))];
  }
  private readonly volumeFailures = new Map<AuraScalarVolumeNode, string>();
  /** T0-24: one shared C-09 environment cache per mounted app. */
  environmentCache: EnvironmentCache | null = null;
  /** Currently bound probe — the neutral floor until an async request lands. */
  environmentProbe: EnvironmentProbe | null = null;
  /** Fingerprint of the `resolution.probe` request the live binding was made for. */
  environmentProbeRequest: string | undefined;
  /**
   * #1142: state of the async C-09 probe acquire. Flag-on (compiler +
   * lighting) the probe owns IBL, so readiness must wait for it like the
   * legacy HDR chain; `undefined` = no probe binding (legacy path owns IBL).
   */
  environmentProbeStatus: "pending" | "ready" | "fallback" | undefined;
  private disposed = false;
  private readonly rawSceneNodes: readonly AuraSceneNode[];
  /** GU47 eint EB-4: the mount's collected lights, before any runtime-added light joined `mountCtx.collectedLights`. */
  private readonly mountLights: readonly CollectedLight[];
  /** GU47 eint EB-4: collected lights of light nodes added through `addSubtree`, per flattened node. */
  private readonly runtimeLights = new Map<AuraSceneNode, readonly CollectedLight[]>();
  /** Root identity is separate from its mutable flattened descendant list. */
  private readonly rootOwners = new Map<string, object>();
  /** Dynamic child ownership follows a particular parent generation. */
  private readonly dynamicParents = new Map<string, { readonly id: string; readonly owner: object }>();
  /** Full authored paths also retain unnamed transform-bearing groups. */
  private readonly authoredAncestors = new Map<string, MountedGroupSpan["ancestors"]>();
  private readonly removedAuthoredGroups = new WeakSet<object>();
  private readonly pendingGenerations = new WeakMap<object, CompiledSubtreeGeneration>();
  private readonly actorWrappers = new WeakMap<TypedGLBActor, CompiledActor>();
  // GU47 g11 phase 10 (4.7.x `onPrimitiveEntriesAdded` field): subsumed by the mount
  // context's `onPrimitiveEntriesAdded`, invoked once the added subtree is published.

  constructor(
    readonly snapshotVersion: number,
    source: RenderSource | null,
    actors: CompiledActor[],
    readonly features: ReadonlySet<AuraCompiledFeature>,
    readonly degradations: readonly AuraDegradation[],
    actorEntries: ProductionRuntimeActorEntry[],
    primitiveEntries: ProductionRuntimePrimitiveEntry[],
    handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[],
    readonly mountCtx: MountSceneCompileContext,
    sceneNodes: readonly AuraSceneNode[],
    flatNodes: AuraSceneNode[],
    mountedFlat?: ReadonlyMap<string, AuraSceneNode[]>,
    mountedGroups?: readonly MountedGroupSpan[],
    private readonly volumeCleanup = createVolumeCleanupTracker(),
    private readonly projectedSpots = new ProjectedSpotSceneResources(mountCtx)
  ) {
    this.source = source;
    this.actors = actors;
    this.actorEntries = actorEntries;
    this.primitiveEntries = primitiveEntries;
    this.handledNodes = handledNodes;
    this.rawSceneNodes = sceneNodes;
    this.liveNodes = flatNodes;
    this.mountLights = mountCtx.collectedLights;
    for (let index = 0; index < actorEntries.length; index += 1) {
      const entry = actorEntries[index], wrapper = actors[index];
      if (entry && wrapper) this.actorWrappers.set(entry.actor, wrapper);
    }
    if (mountedFlat) for (const [id, nodes] of mountedFlat) {
      this.dynamicFlat.set(id, nodes.slice());
      this.rootOwners.set(id, {});
    }
    for (const group of mountedGroups ?? []) {
      this.dynamicRoots.set(group.id, group.node);
      this.authoredAncestors.set(group.id, group.ancestors);
    }
    for (const group of mountedGroups ?? []) {
      const parentOwner = group.parentId && this.rootOwners.get(group.parentId);
      if (group.parentId && parentOwner) this.dynamicParents.set(group.id, { id: group.parentId, owner: parentOwner });
    }
    bindRuntimeCompiled(this as unknown as import("../../contracts/compiler.js").CompiledScene, this as unknown as RuntimeCompiledSceneInternals);
  }

  /** Resolve nested authored groups to the live generation containing them. */
  private parentBinding(runtimeId: string): CompiledParentBinding | undefined {
    const directOwner = this.rootOwners.get(runtimeId);
    const isRemoved = (node: AuraSceneNode): boolean => this.removedAuthoredGroups.has(node);
    const directNode = this.dynamicRoots.get(runtimeId) ?? findNodeByRuntimeId(this.rawSceneNodes, runtimeId, isRemoved);
    if (directOwner && directNode) return { node: directNode, rootId: runtimeId, owner: directOwner };
    for (const [rootId, root] of this.dynamicRoots) {
      const owner = this.rootOwners.get(rootId);
      const found = owner && findNodeByRuntimeId([root], runtimeId, isRemoved);
      if (owner && found) return { node: found, rootId, owner };
    }
    for (const root of this.rawSceneNodes) {
      const rootId = mountedRootOf(root) ?? ("runtime" in root ? root.runtime?.id : undefined);
      if (!rootId || this.dynamicRoots.has(rootId)) continue;
      const owner = this.rootOwners.get(rootId);
      const found = owner && findNodeByRuntimeId([root], runtimeId, isRemoved);
      if (owner && found) return { node: found, rootId, owner };
    }
    return undefined;
  }

  /** Whether an active root is owned by a particular authored generation. */
  private ownerBelongsTo(owner: object, ancestor: object | undefined): boolean {
    if (!ancestor) return false;
    const visited = new Set<object>();
    let current: object | undefined = owner;
    while (current && !visited.has(current)) {
      if (current === ancestor) return true;
      visited.add(current);
      let currentId: string | undefined;
      for (const [id, candidate] of this.rootOwners) if (candidate === current) { currentId = id; break; }
      current = currentId ? this.dynamicParents.get(currentId)?.owner : undefined;
    }
    return false;
  }

  /** Wrap a new node in the live ancestor groups, preserving their transforms. */
  private wrapWithParentChain(binding: CompiledParentBinding, node: AuraSceneNode): AuraSceneNode {
    const initialGroup = binding.node;
    if (initialGroup.kind !== "group") return node;
    let current = binding;
    let wrapped: AuraSceneNode = { ...initialGroup, children: [node] };
    const visited = new Set<object>([current.owner]);
    while (true) {
      const link = this.dynamicParents.get(current.rootId);
      if (!link) break;
      const parent = this.parentBinding(link.id);
      if (!parent || parent.owner !== link.owner || parent.node.kind !== "group" || visited.has(parent.owner)) {
        throw new Error("Compiled subtree parent chain is no longer live");
      }
      const path = groupPathTo(parent.node, current.node, (candidate) => this.removedAuthoredGroups.has(candidate)) ?? [parent.node];
      for (let index = path.length - 1; index >= 0; index -= 1) wrapped = { ...path[index]!, children: [wrapped] };
      current = parent;
      visited.add(current.owner);
    }
    const prefix = this.authoredAncestors.get(current.rootId) ?? [];
    for (let index = prefix.length - 1; index >= 0; index -= 1) {
      const ancestor = prefix[index]!;
      if (this.removedAuthoredGroups.has(ancestor)) throw new Error("Compiled subtree parent chain is no longer live");
      wrapped = { ...ancestor, children: [wrapped] };
    }
    return wrapped;
  }

  /**
   * C-37 subtree compile (no remount): flatten the incoming node, run the same
   * per-node pipeline mount used (entries, actors, handlers), and merge into the
   * live entry lists. Model actors resolve asynchronously and join when loaded.
   */
  addSubtree(
    node: AuraSceneNode,
    parentId?: string,
    options?: { readonly deferCommit?: boolean }
  ): CompiledSubtreeMutation {
    if (this.disposed) throw new Error("Compiled scene is disposed");
    const id = runtimeIdOf(node);
    const effectiveParentId = parentId ?? this.dynamicParents.get(id)?.id;
    const expectedParent = effectiveParentId ? this.parentBinding(effectiveParentId) : undefined;
    if (effectiveParentId && !expectedParent) throw new Error(`Compiled subtree parent is not live: ${effectiveParentId}`);
    const parent = expectedParent?.node;
    let inserted = node;
    const previousNode = this.dynamicRoots.get(id);
    if (parentId === undefined && previousNode) {
      // A same-ID replacement stays at its authored location, including any
      // unnamed groups after its nearest named parent (or every unnamed
      // ancestor when it has no named parent at all).
      const ancestors = this.authoredAncestors.get(id);
      let first = 0;
      if (effectiveParentId && ancestors) {
        for (let index = ancestors.length - 1; index >= 0; index -= 1) {
          if (ancestors[index]!.runtime?.id === effectiveParentId) { first = index + 1; break; }
        }
      }
      if (ancestors && (!effectiveParentId || first > 0)) {
        for (let index = ancestors.length - 1; index >= first; index -= 1) inserted = { ...ancestors[index]!, children: [inserted] };
      } else if (expectedParent && parent?.kind === "group") {
        const path = groupPathTo(parent, previousNode, (candidate) => this.removedAuthoredGroups.has(candidate));
        if (path) for (let index = path.length - 1; index >= 1; index -= 1) inserted = { ...path[index]!, children: [inserted] };
      }
    }
    const effective = expectedParent && parent?.kind === "group" ? this.wrapWithParentChain(expectedParent, inserted) : inserted;
    const flattenAdded = this.mountCtx.flags.on("A3D_QR_CORE")
      ? (nodes: readonly AuraSceneNode[], options?: Parameters<typeof flattenAuraSceneNodes>[2]) => flattenAuraSceneNodes(nodes, this.mountCtx.flags, options)
      : flattenNodesWithLineWorldMatrices;
    const flatNodes = flattenTaggingMountedRoots([effective], flattenAdded);
    const authoredGroups = new WeakSet<object>();
    const collectAuthoredGroups = (candidate: AuraSceneNode): void => {
      if (candidate.kind !== "group") return;
      authoredGroups.add(candidate);
      for (const child of candidate.children) collectAuthoredGroups(child);
    };
    collectAuthoredGroups(node);
    const groupSpans = mountedGroupSpansOf(flatNodes) ?? [];
    const rootSpan = groupSpans.find((span) => span.node === node);
    const nestedSpans = groupSpans.filter((span) => authoredGroups.has(span.node) && span.node !== node);
    const flatSet = new Set(flatNodes);
    // Node identity is also the ownership key for handlers, actors and leases.
    // Sharing the same object between live generations makes exact retirement
    // ambiguous, so reject it before creating or publishing resources.
    const assertDistinct = (): void => {
      if (flatSet.size !== flatNodes.length || this.liveNodes.some((candidate) => flatSet.has(candidate))) {
        throw new Error("Compiled subtree contains a node already owned by this scene");
      }
    };
    assertDistinct();
    const ctx = this.mountCtx;
    // The replacement's handles do not exist until this transaction returns.
    // In particular, looking them up now could read a previous generation
    // with the same ID. Validate the prospective flattened descriptors first,
    // then recheck against the new live handles once each actor is acquired.
    const prospectiveParent = effectiveParentId ? ctx.runtimeNodes?.get(effectiveParentId) : undefined;
    for (const candidate of flatNodes) if (isRenderableModelNode(candidate)) {
      assertFramePivotSupported(candidate, undefined, frameUsesLegacyModelMatrix(ctx.runtimeOwner ?? ctx.canvas), undefined,
        { awaitingRuntimeParent: ctx.runtimeNodes !== undefined, prospectiveParent });
    }
    for (const degradation of unsupportedLightModulationDegradations(flatNodes, {
      deferPhotometricProfiles: ctx.photometricProfileAdmissionEnabled === true,
      deferProjectedSpotImages: ctx.projectedSpotImageAdmissionEnabled === true
    })) ctx.degrade(degradation);
    const profileNodes = flatNodes.filter((candidate) => candidate.kind === "light" &&
      ((candidate.photometricProfile !== undefined && (candidate.light === "point" || candidate.light === "spot")) ||
       (candidate.light === "spot" && candidate.projectedImage !== undefined)));
    const preparedProfiles = createRuntimeAddedCollectedLights(profileNodes, ctx.flags, { hemisphereAsEnvironment: true });
    if (effectiveParentId) for (const entry of preparedProfiles) for (const light of entry.lights) usePhotometricWorldPose(light);

    // Everything that can synchronously fail is built off to the side. Handler
    // contributions join the live state only once the entire subtree is ready.
    const contributions = createContributions();
    const handled: { node: AuraSceneNode; handler: AnyNodeHandler; out: RecordingContributions }[] = [];
    const splats = new Map<AuraGaussianSplatNode, SplatLease>();
    const volumes = new Map<AuraScalarVolumeNode, VolumeLease>();
    const projectedNodes: AuraLightNode[] = [];
    let extraPrimitive: ProductionRuntimePrimitiveEntry[] = [];
    let generation: CompiledSubtreeGeneration | undefined;
    let published = false;
    let notified = false;
    try {
      extraPrimitive = withCompileEvidence(ctx.runtimeOwner ?? ctx.canvas, () => createProductionRuntimePrimitiveEntries(flatNodes, qrPrimitiveGeometryOptions(ctx.flags, ctx.quality, ctx), ctx.builtinGlyphAtlas));
      for (const flatNode of flatNodes) {
        const kind = String((flatNode as { kind?: string }).kind ?? "");
        if (!isKnownNodeKind(kind)) {
          if (ctx.strict) throw new AuraRuntimeError("unknown-node-kind", `Aura3D scene node kind "${kind}" is not in the C-36 catalog and has no registered handler.`);
          ctx.degrade({ code: "option-ignored", nodeId: runtimeIdOf(flatNode), message: `scene node kind "${kind}" is unknown to the compiler; node ignored` });
          continue;
        }
        const handler = resolveNodeHandler(kind, ctx.flags);
        if (handler && (handler.owner !== "prd15" || handler.flag !== undefined)) {
          const out = new RecordingContributions(contributions, flatNode.kind !== "batched");
          handled.push({ node: flatNode, handler, out });
          const pending = handler.compile(flatNode, flatNode.kind === "batched" ? batchContext(ctx, this.batchSceneClipping) : ctx, out);
          if (pending && typeof pending.then === "function") {
            void Promise.resolve(pending).catch((error: unknown) => {
              if (this.disposed || this.compileRecords.get(flatNode) !== out.record) return;
              ctx.runtimeWarnings.add(`NODE_COMPILE_FAILED: ${runtimeIdOf(flatNode)}: ${productionRenderErrorMessage(error)}`);
            });
          }
        }
      }
      const profileNodeSet = new Set<AuraSceneNode>(profileNodes);
      const ordinaryLights = createRuntimeAddedCollectedLights(flatNodes.filter((candidate) => !profileNodeSet.has(candidate)), ctx.flags, { hemisphereAsEnvironment: true });
      const additionsByNode = new Map([...preparedProfiles, ...ordinaryLights].map((entry) => [entry.node, entry]));
      const addedLights = flatNodes.flatMap((candidate) => {
        const entry = candidate.kind === "light" ? additionsByNode.get(candidate) : undefined;
        return entry ? [entry] : [];
      });
      for (const splatNode of flatNodes.filter((candidate): candidate is AuraGaussianSplatNode => candidate.kind === "gaussian-splat" && resolveNodeHandler(candidate.kind, ctx.flags) === nodeHandlers["gaussian-splat"])) {
        const lease = createSplatLease(splatNode, ctx);
        splats.set(splatNode, lease);
        void lease.ready.catch((error: unknown) => {
          if (this.disposed || this.splatLeases.get(splatNode) !== lease || ctx.request?.signal?.aborted) return;
          this.splatLeases.delete(splatNode);
          try { lease.dispose(); } catch { /* Keep the original load failure. */ }
          const message = `SPLAT_LOAD_FAILED: ${splatNode.name ?? splatNode.asset.id}: ${productionRenderErrorMessage(error)}`;
          this.splatFailures.set(splatNode, message);
          ctx.runtimeWarnings.add(message);
        });
      }
      for (const volumeNode of flatNodes.filter((candidate): candidate is AuraScalarVolumeNode => candidate.kind === "scalar-volume" && resolveNodeHandler(candidate.kind, ctx.flags) === nodeHandlers["scalar-volume"])) {
        const lease = createVolumeLease(volumeNode, ctx, this.volumeCleanup);
        volumes.set(volumeNode, lease);
        void lease.ready.catch((error: unknown) => {
          if (this.disposed || this.volumeLeases.get(volumeNode) !== lease || ctx.request?.signal?.aborted) return;
          this.volumeLeases.delete(volumeNode);
          try { lease.dispose(); } catch { /* Keep the original load failure. */ }
          const message = `SCALAR_VOLUME_LOAD_FAILED: ${volumeNode.name ?? volumeNode.asset.id}: ${productionRenderErrorMessage(error)}`;
          this.volumeFailures.set(volumeNode, message);
          ctx.runtimeWarnings.add(message);
        });
      }
      for (const node of flatNodes) {
        if (node.kind !== "light" || node.light !== "spot" || node.projectedImage === undefined) continue;
        this.projectedSpots.add(node, true);
        projectedNodes.push(node);
      }
      if (this.disposed) throw new Error("Compiled scene is disposed");
      // A handler or diagnostic callback can reenter the compiler while the
      // staging work runs. Recheck ownership before publishing this generation.
      assertDistinct();
      const currentParent = effectiveParentId ? this.parentBinding(effectiveParentId) : undefined;
      if (effectiveParentId && (currentParent?.owner !== expectedParent?.owner || currentParent?.rootId !== expectedParent?.rootId)) {
        throw new Error("Compiled subtree parent changed during staging");
      }
      const previousRootOwner = this.rootOwners.get(id);
      for (const span of nestedSpans) {
        const existing = this.rootOwners.get(span.id);
        if (existing && !this.ownerBelongsTo(existing, previousRootOwner)) {
          throw new Error(`DUPLICATE_GROUP_RUNTIME_ID: ${span.id}`);
        }
      }
      generation = {
        id, node, flat: flatNodes,
        previousNode: this.dynamicRoots.get(id),
        previousFlat: this.dynamicFlat.get(id),
        previousOwner: this.rootOwners.get(id),
        previousParent: this.dynamicParents.get(id),
        previousAncestors: this.authoredAncestors.get(id),
        nested: [],
        state: "pending"
      };
      this.pendingGenerations.set(generation, generation);
      const parentRootId = expectedParent?.rootId;
      const parentFlat = parentRootId && parent ? this.dynamicFlat.get(parentRootId) : undefined;
      const parentOwner = effectiveParentId && parent && parentRootId !== id ? expectedParent?.owner : undefined;
      this.dynamicRoots.set(id, node);
      this.dynamicFlat.set(id, flatNodes);
      this.rootOwners.set(id, generation);
      if (node.kind === "group") this.removedAuthoredGroups.delete(node);
      if (rootSpan) this.authoredAncestors.set(id, rootSpan.ancestors);
      else this.authoredAncestors.delete(id);
      if (effectiveParentId && parentOwner) this.dynamicParents.set(id, { id: effectiveParentId, owner: parentOwner });
      else this.dynamicParents.delete(id);
      const pendingParent = parentOwner && this.pendingGenerations.get(parentOwner);
      if (pendingParent?.state === "pending" && !pendingParent.nested.includes(generation)) pendingParent.nested.push(generation);
      if (parentFlat && parentRootId && parentRootId !== id) this.dynamicFlat.set(parentRootId, [...parentFlat, ...flatNodes]);
      for (const span of nestedSpans) {
        const nested: CompiledSubtreeGeneration = {
          id: span.id, node: span.node, flat: flatNodes.slice(span.start, span.end),
          previousNode: this.dynamicRoots.get(span.id),
          previousFlat: this.dynamicFlat.get(span.id),
          previousOwner: this.rootOwners.get(span.id),
          previousParent: this.dynamicParents.get(span.id),
          previousAncestors: this.authoredAncestors.get(span.id),
          nested: [], state: "pending"
        };
        this.pendingGenerations.set(nested, nested);
        generation.nested.push(nested);
        const owner = span.parentId ? this.rootOwners.get(span.parentId) : generation;
        this.dynamicRoots.set(span.id, span.node);
        this.dynamicFlat.set(span.id, nested.flat);
        this.rootOwners.set(span.id, nested);
        this.removedAuthoredGroups.delete(span.node);
        this.authoredAncestors.set(span.id, span.ancestors);
        if (owner) this.dynamicParents.set(span.id, { id: span.parentId ?? id, owner });
        else this.dynamicParents.delete(span.id);
      }
      this.liveNodes = this.liveNodes.concat(flatNodes);
      this.primitiveEntries.push(...extraPrimitive);
      for (const { node: handledNode, handler, out } of handled) {
        this.handledNodes.push({ node: handledNode, handler });
        this.compileRecords.set(handledNode, out.record);
      }
      const persistent = this.persistentContributions;
      persistent.items.push(...contributions.items);
      persistent.lights.push(...contributions.lights);
      for (const [field, value] of contributions.overrides) persistent.overrides.set(field, value);
      for (const feature of contributions.features) persistent.features.add(feature);
      for (const { out } of handled) out.publish(persistent);
      for (const [splatNode, lease] of splats) this.splatLeases.set(splatNode, lease);
      for (const [volumeNode, lease] of volumes) this.volumeLeases.set(volumeNode, lease);
      if (volumes.size) this.hasOwnedScalarVolumes = true;
      for (const { node: lightNode, lights } of addedLights) this.runtimeLights.set(lightNode, lights);
      // A mount context can expose a throwing setter. From this point every
      // staged resource is live and must be detached by transaction rollback.
      published = true;
      if (addedLights.length) this.syncRuntimeLights();
      this.itemCache.clear();

      // The mount may queue resource work and may synchronously reenter. If it
      // throws, the corresponding removal callback cancels any partial work.
      if (extraPrimitive.length && ctx.onPrimitiveEntriesAdded) {
        notified = true;
        ctx.onPrimitiveEntriesAdded(extraPrimitive);
      }
      if (this.disposed || this.rootOwners.get(id) !== generation) {
        throw new Error("Compiled subtree was removed or superseded during publication");
      }

      const newModelNodes = flatNodes.filter((candidate): candidate is AuraModelNode =>
        isMountableModelNode(candidate) && createAssetProvenance(candidate.asset).source === "typed-aura-assets-manifest"
      );
      for (const [index, modelNode] of newModelNodes.entries()) {
        void (async () => {
          const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
          const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js");
          const actor = await createTypedGLBActor({
            asset: modelNode.asset,
            id: modelNode.runtime?.id ?? modelNode.asset.id ?? `added-model-${index + 1}`,
            name: modelNode.name ?? modelNode.asset.id ?? `added-model-${index + 1}`,
            runtimeOwner: ctx.runtimeOwner, request: ctx.request, formatRegistry: ctx.formatRegistry,
            ...(ctx.textureResidency ? { retainTextureResidencySources: true } : {}),
            width: ctx.canvas.width, height: ctx.canvas.height,
            ...(modelNode.hiddenNodeNames ? { hiddenNodeNames: modelNode.hiddenNodeNames } : {}),
            ...(modelNode.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
            ...typedGLBActorDecoderOptions(ctx.flags, ctx.assetOptions), ...applyModelTintBridge(modelNode)
          });
          // Identity, not an authored ID, determines whether this exact
          // generation is still entitled to publish a late actor.
          if (this.disposed || !this.liveNodes.includes(modelNode)) { retireCompiledActor(ctx, actor); return; }
          try {
            assertFramePivotSupported(modelNode, ctx.runtimeNodes, frameUsesLegacyModelMatrix(ctx.runtimeOwner ?? ctx.canvas), actor);
            ctx.textureResidency?.trackActor(actor);
          }
          catch (error) { retireCompiledActor(ctx, actor); throw error; }
          const wrapper = { nodeId: actor.id, dispose: () => retireCompiledActor(ctx, actor) };
          this.actorWrappers.set(actor, wrapper);
          this.actorEntries.push({ node: modelNode, actor });
          this.actors.push(wrapper);
        })().catch((error: unknown) => {
          if (this.disposed || ctx.request?.signal?.aborted || !this.liveNodes.includes(modelNode)) return;
          ctx.runtimeWarnings.add(`MODEL_LOAD_FAILED: ${modelNode.name ?? modelNode.asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }

      const current = generation;
      const mutation: CompiledSubtreeMutation = {
        commit: () => this.commitSubtreeGeneration(current),
        rollback: () => this.rollbackSubtreeGeneration(current)
      };
      if (!options?.deferCommit) mutation.commit();
      return mutation;
    } catch (error) {
      const failures: unknown[] = [];
      if (published && generation) {
        try { this.rollbackSubtreeGeneration(generation, notified); } catch (cleanupError) { failures.push(cleanupError); }
      } else {
        for (const { out, node: handledNode, handler } of handled) {
          out.record.stop();
          try { handler.dispose?.(handledNode); } catch (cleanupError) { failures.push(cleanupError); }
        }
        for (const lease of splats.values()) { try { lease.dispose(); } catch (cleanupError) { failures.push(cleanupError); } }
        for (const lease of volumes.values()) { try { lease.dispose(); } catch (cleanupError) { failures.push(cleanupError); } }
        for (const projectedNode of projectedNodes) { try { this.projectedSpots.remove(projectedNode); } catch (cleanupError) { failures.push(cleanupError); } }
        for (const { resources } of extraPrimitive) for (const resource of resources) {
          cleanupCompiledPrimitiveResource(resource, (work) => { try { work(); } catch (cleanupError) { failures.push(cleanupError); } });
        }
      }
      if (failures.length) throw new AggregateError([error, ...failures], "Compiled subtree creation and rollback failed");
      throw error;
    }
  }

  private commitSubtreeGeneration(generation: CompiledSubtreeGeneration): void {
    if (generation.state !== "pending") return;
    // A child published reentrantly under a deferred parent cannot retire its
    // predecessor until the parent is committed. The parent owns its final
    // commit/rollback and preserves the full predecessor chain meanwhile.
    const parentOwner = this.dynamicParents.get(generation.id)?.owner;
    const pendingParent = parentOwner && this.pendingGenerations.get(parentOwner);
    if (pendingParent && pendingParent !== generation && pendingParent.state === "pending") {
      if (!pendingParent.nested.includes(generation)) pendingParent.nested.push(generation);
      return;
    }
    generation.state = "committed";
    if (this.disposed) return;
    if (this.rootOwners.get(generation.id) !== generation) {
      this.retireCompiledNodes(generation.flat);
      return;
    }
    const obsolete: AuraSceneNode[] = [];
    const obsoleteOwners: object[] = [];
    const includePredecessor = (current: CompiledSubtreeGeneration): void => {
      if (current.previousNode?.kind === "group" && current.previousNode !== current.node) this.removedAuthoredGroups.add(current.previousNode);
      let flat = current.previousFlat;
      let owner = current.previousOwner;
      while (flat) {
        obsolete.push(...flat);
        if (owner) obsoleteOwners.push(owner);
        const previous = owner && this.pendingGenerations.get(owner);
        if (!previous || previous.state !== "pending") break;
        previous.state = "superseded";
        flat = previous.previousFlat;
        owner = previous.previousOwner;
      }
    };
    includePredecessor(generation);
    const commitNested = (nested: CompiledSubtreeGeneration): void => {
      if (nested.state !== "pending" || this.rootOwners.get(nested.id) !== nested) return;
      nested.state = "committed";
      includePredecessor(nested);
      for (const child of nested.nested) commitNested(child);
    };
    for (const nested of generation.nested) commitNested(nested);
    obsolete.push(...this.detachDescendantRoots(obsoleteOwners));
    if (obsolete.length) this.retireCompiledNodes(obsolete);
  }

  private rollbackSubtreeGeneration(generation: CompiledSubtreeGeneration, notified = true): void {
    if (generation.state !== "pending") return;
    generation.state = "rolled-back";
    if (this.disposed) return;
    for (const nested of [...generation.nested].reverse()) this.rollbackSubtreeGeneration(nested, notified);
    const descendants = this.detachDescendantRoots([generation]);
    if (this.rootOwners.get(generation.id) === generation) {
      if (generation.node.kind === "group") this.removedAuthoredGroups.add(generation.node);
      this.dynamicRoots.delete(generation.id);
      this.dynamicFlat.delete(generation.id);
      this.rootOwners.delete(generation.id);
      this.dynamicParents.delete(generation.id);
      this.authoredAncestors.delete(generation.id);
      if (generation.previousFlat && generation.previousOwner &&
          (generation.previousFlat.length === 0 || generation.previousFlat.some((candidate) => this.liveNodes.includes(candidate)))) {
        if (generation.previousNode) {
          this.dynamicRoots.set(generation.id, generation.previousNode);
          if (generation.previousNode.kind === "group") this.removedAuthoredGroups.delete(generation.previousNode);
        }
        this.dynamicFlat.set(generation.id, generation.previousFlat);
        this.rootOwners.set(generation.id, generation.previousOwner);
        if (generation.previousParent) this.dynamicParents.set(generation.id, generation.previousParent);
        if (generation.previousAncestors) this.authoredAncestors.set(generation.id, generation.previousAncestors);
      }
    }
    this.retireCompiledNodes([...generation.flat, ...descendants], notified);
  }

  /** Detach only descendants belonging to the specified parent generations. */
  private detachDescendantRoots(parentOwners: readonly object[]): AuraSceneNode[] {
    const owners = new Set(parentOwners);
    const descendants = new Set<string>();
    const predecessors: AuraSceneNode[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, parent] of this.dynamicParents) {
        if (descendants.has(id) || !owners.has(parent.owner)) continue;
        descendants.add(id);
        let owner = this.rootOwners.get(id);
        while (owner) {
          owners.add(owner);
          const generation = this.pendingGenerations.get(owner);
          if (!generation || generation.state !== "pending") break;
          generation.state = "superseded";
          if (generation.previousFlat) predecessors.push(...generation.previousFlat);
          owner = generation.previousOwner;
        }
        changed = true;
      }
    }
    const nodes: AuraSceneNode[] = predecessors;
    for (const id of descendants) {
      nodes.push(...(this.dynamicFlat.get(id) ?? []));
      const root = this.dynamicRoots.get(id);
      if (root?.kind === "group") this.removedAuthoredGroups.add(root);
      this.dynamicRoots.delete(id);
      this.dynamicFlat.delete(id);
      this.rootOwners.delete(id);
      this.dynamicParents.delete(id);
      this.authoredAncestors.delete(id);
    }
    return nodes;
  }

  /** Republishes `mountCtx.collectedLights` as the mount lights plus every live runtime-added light (a new array, so per-list light indexes rebuild). */
  private syncRuntimeLights(): void {
    const lights = [...this.mountLights];
    for (const list of this.runtimeLights.values()) lights.push(...list);
    this.mountCtx.collectedLights = lights;
  }

  /** C-37 subtree dispose (no remount). */
  removeSubtree(runtimeId: string): boolean {
    if (this.disposed) return false;
    const flatForRoot = this.dynamicFlat.get(runtimeId);
    const targets = (flatForRoot ?? this.liveNodes.filter((candidate) => runtimeIdOf(candidate) === runtimeId)).slice();
    if (targets.length === 0 && flatForRoot === undefined) return false;
    // An explicit removal during a deferred replacement removes the complete
    // generation chain, rather than stranding the hidden predecessor.
    let owner = this.rootOwners.get(runtimeId);
    const removedOwners: object[] = [];
    while (owner) {
      removedOwners.push(owner);
      const generation = this.pendingGenerations.get(owner);
      if (!generation || generation.state !== "pending") break;
      generation.state = "superseded";
      if (generation.previousFlat) targets.push(...generation.previousFlat);
      owner = generation.previousOwner;
    }
    targets.push(...this.detachDescendantRoots(removedOwners));
    const root = this.dynamicRoots.get(runtimeId);
    if (root?.kind === "group") this.removedAuthoredGroups.add(root);
    this.dynamicRoots.delete(runtimeId);
    this.dynamicFlat.delete(runtimeId);
    this.rootOwners.delete(runtimeId);
    this.dynamicParents.delete(runtimeId);
    this.authoredAncestors.delete(runtimeId);
    this.retireCompiledNodes(targets);
    return true;
  }

  /** Detach exact node identities before invoking any user or resource cleanup. */
  private retireCompiledNodes(targets: readonly AuraSceneNode[], notify = true): void {
    if (!targets.length) return;
    const targetSet = new Set(targets);
    const removedPrimitive = this.primitiveEntries.filter((entry) => targetSet.has(entry.node));
    const removedActors = this.actorEntries.filter((entry) => targetSet.has(entry.node));
    const removedHandlers = this.handledNodes.filter(({ node }) => targetSet.has(node));
    const removedLeases: SplatLease[] = [];
    for (const [node, lease] of this.splatLeases) {
      if (targetSet.has(node)) { this.splatLeases.delete(node); removedLeases.push(lease); }
    }
    for (const node of targets) if (node.kind === "gaussian-splat") this.splatFailures.delete(node);
    const removedVolumes: VolumeLease[] = [];
    for (const [node, lease] of this.volumeLeases) {
      if (targetSet.has(node)) { this.volumeLeases.delete(node); removedVolumes.push(lease); }
    }
    for (const node of targets) if (node.kind === "scalar-volume") this.volumeFailures.delete(node);

    this.liveNodes = this.liveNodes.filter((candidate) => !targetSet.has(candidate));
    // In place (4.7.x): the mount aliases this array for its textured-upgrade
    // bookkeeping and diagnostics, so a reassignment would strand removed entries.
    const keepPrimitive = this.primitiveEntries.filter((entry) => !targetSet.has(entry.node));
    this.primitiveEntries.length = 0;
    for (const entry of keepPrimitive) this.primitiveEntries.push(entry);
    this.actorEntries = this.actorEntries.filter((entry) => !targetSet.has(entry.node));
    const removedWrappers = new Set(removedActors.map(({ actor }) => this.actorWrappers.get(actor)).filter((wrapper): wrapper is CompiledActor => wrapper !== undefined));
    this.actors = this.actors.filter((actor) => !removedWrappers.has(actor));
    this.handledNodes = this.handledNodes.filter(({ node }) => !targetSet.has(node));
    for (const [id, flat] of this.dynamicFlat) {
      const kept = flat.filter((candidate) => !targetSet.has(candidate));
      if (kept.length === flat.length) continue;
      // An ancestor group can legitimately remain live after its final child
      // leaves. Only the explicitly removed root is deleted by removeSubtree;
      // other roots retain an empty descendant list for later additions.
      this.dynamicFlat.set(id, kept);
    }
    this.dropCompileContributions(targets);
    let lightsRemoved = false;
    for (const node of targets) lightsRemoved = this.runtimeLights.delete(node) || lightsRemoved;
    const failures: unknown[] = [];
    if (lightsRemoved) {
      try { this.syncRuntimeLights(); } catch (error) { failures.push(error); }
    }
    this.itemCache.clear();

    const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
    for (const node of targets) cleanup(() => this.projectedSpots.remove(node));
    for (const lease of removedVolumes) cleanup(() => lease.dispose());
    if (notify && removedPrimitive.length) cleanup(() => this.mountCtx.onPrimitiveEntriesRemoved?.(removedPrimitive));
    for (const entry of removedPrimitive) for (const resource of entry.resources) cleanupCompiledPrimitiveResource(resource, cleanup);
    for (const entry of removedActors) cleanup(() => retireCompiledActor(this.mountCtx, entry.actor));
    for (const lease of removedLeases) cleanup(() => lease.dispose());
    for (const { node, handler } of removedHandlers) cleanup(() => handler.dispose?.(node));
    if (failures.length) throw new AggregateError(failures, "Compiled subtree cleanup failed");
  }

  /** Remove a generation's contributions and reveal any surviving override. */
  private dropCompileContributions(targets: readonly AuraSceneNode[]): void {
    const items = new Set<RenderItem>();
    const lights = new Set<CollectedLight>();
    const fields = new Set<string>();
    const persistent = this.persistentContributions;
    for (const node of targets) {
      const record = this.compileRecords.get(node);
      if (!record) continue;
      this.compileRecords.delete(node);
      record.stop();
      for (const item of record.items) items.add(item);
      for (const light of record.lights) lights.add(light);
      for (const field of record.overrides.keys()) fields.add(field);
    }
    if (items.size > 0) {
      const keep = persistent.items.filter((item) => !items.has(item));
      persistent.items.length = 0;
      persistent.items.push(...keep);
    }
    if (lights.size > 0) {
      const keep = persistent.lights.filter((light) => !lights.has(light));
      persistent.lights.length = 0;
      persistent.lights.push(...keep);
    }
    for (const field of fields) {
      let found = false;
      let value: unknown;
      for (const record of this.compileRecords.values()) {
        if (record.overrides.has(field)) { found = true; value = record.overrides.get(field); }
      }
      if (found) persistent.overrides.set(field, value);
      else persistent.overrides.delete(field);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
    for (const record of this.compileRecords.values()) record.stop();
    if (this.primitiveEntries.length) cleanup(() => this.mountCtx.onPrimitiveEntriesRemoved?.(this.primitiveEntries.slice()));
    for (const frame of [...this.batchFrames]) {
      if (!frame.ownerReleased) { frame.ownerReleased = true; cleanup(() => releaseBatchFrameRef(frame)); }
    }
    cleanup(() => releaseBuiltinGlyphFrameOwner(this.lastInput?.source));
    cleanup(() => this.environmentCache?.dispose());
    this.environmentCache = null;
    this.environmentProbe = null;
    for (const lease of this.splatLeases.values()) cleanup(() => lease.dispose());
    this.splatLeases.clear();
    this.splatFailures.clear();
    for (const lease of this.volumeLeases.values()) cleanup(() => lease.dispose());
    this.volumeLeases.clear();
    this.volumeFailures.clear();
    cleanup(() => this.projectedSpots.dispose());
    for (const actor of this.actors) cleanup(() => actor.dispose());
    for (const { resources } of this.primitiveEntries) {
      for (const resource of resources) cleanupCompiledPrimitiveResource(resource, cleanup);
    }
    for (const { handler, node } of this.handledNodes) cleanup(() => handler.dispose?.(node));
    if (failures.length) throw new AggregateError(failures, "Compiled scene cleanup failed");
  }

  /** Republish asynchronous failures after the frame warning set is reset. */
  publishSplatFailures(): void {
    for (const message of this.splatFailures.values()) this.mountCtx.runtimeWarnings.add(message);
    for (const message of this.volumeFailures.values()) this.mountCtx.runtimeWarnings.add(message);
    this.projectedSpots.publishFailures();
  }

  /** Wait for registry-backed scalar-volume releases, including failed ones. */
  whenVolumeDisposalsSettled(): Promise<void> { return awaitVolumeCleanup(this.volumeCleanup); }

  projectedSpotResourceFor(asset: unknown): ProjectedSpotResourceView | undefined { return this.projectedSpots.resourceFor(asset); }
  whenProjectedSpotDisposalsSettled(): Promise<void> { return this.projectedSpots.whenSettled(); }
}

const runtimeIdOf = (node: AuraSceneNode): string =>
  ("runtime" in node ? node.runtime?.id : undefined) ?? (node as { name?: string }).name ?? "";

/** Group path from an ancestor down to, but excluding, the target group. */
function groupPathTo(
  ancestor: AuraSceneNode,
  target: AuraSceneNode,
  isRemoved: (node: AuraSceneNode) => boolean
): Array<Extract<AuraSceneNode, { readonly kind: "group" }>> | undefined {
  if (ancestor === target) return [];
  if (ancestor.kind !== "group" || isRemoved(ancestor)) return undefined;
  for (const child of ancestor.children) {
    if (child.kind !== "group") continue;
    const path = groupPathTo(child, target, isRemoved);
    if (path) return [ancestor, ...path];
  }
  return undefined;
}

const findNodeByRuntimeId = (nodes: readonly AuraSceneNode[], runtimeId: string, isRemoved?: (node: AuraSceneNode) => boolean): AuraSceneNode | undefined => {
  for (const node of nodes) {
    if (node.kind === "group" && isRemoved?.(node)) continue;
    if (("runtime" in node ? node.runtime?.id : undefined) === runtimeId) return node;
    if (node.kind === "group") {
      const inner = findNodeByRuntimeId(node.children, runtimeId, isRemoved);
      if (inner) return inner;
    }
  }
  return undefined;
};

async function compileSceneReal(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene> {
  const mount = ctx as MountSceneCompileContext;
  const canvas = mount.canvas;
  const { flat: flattened, byRoot: mountedFlat, groups: mountedGroups } = flattenPerRoot(snapshot.nodes);
  // Validate before loading actors, reporting degradations, or staging any
  // render resources. The asset's skin information is checked after loading.
  for (const node of flattened) if (isRenderableModelNode(node)) {
    assertFramePivotSupported(node, mount.runtimeNodes, frameUsesLegacyModelMatrix(mount.runtimeOwner ?? canvas));
  }
  const compileRecords = new Map<AuraSceneNode, NodeCompileRecord>();
  const degradations: AuraDegradation[] = [];
  const recordDegrade = (d: Omit<AuraDegradation, "frame">): void => {
    const entry: AuraDegradation = { ...d, frame: 0 };
    degradations.push(entry);
    ctx.degrade(entry);
  };
  const features = new Set<AuraCompiledFeature>();

  for (const degradation of unsupportedLightModulationDegradations(flattened, {
    deferPhotometricProfiles: mount.photometricProfileAdmissionEnabled === true,
    deferProjectedSpotImages: mount.projectedSpotImageAdmissionEnabled === true
  })) recordDegrade(degradation);

  const modelNodes = flattened.filter((node): node is AuraModelNode =>
    isMountableModelNode(node) && createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"
  );
  /*
   * Loaded here rather than imported at module scope (WS-2.2). This function is only reached when the
   * scene contains a typed GLB, so the glTF loader is downloaded exactly when it is needed.
   */
  const actorEntries: ProductionRuntimeActorEntry[] = modelNodes.length > 0
    ? await (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
        const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js"); // Q-15-1 (#461)
        const decoderOptions = typedGLBActorDecoderOptions(ctx.flags, mount.assetOptions);
        // Wait for all concurrent loads before propagating a failure so every
        // successfully created actor can release its own resources.
        const settled = await Promise.allSettled(modelNodes.map(async (node, index) => ({
          node,
          actor: await createTypedGLBActor({
            asset: node.asset,
            id: node.runtime?.id ?? node.asset.id ?? `model-${index + 1}`,
            name: node.name ?? node.asset.id ?? `model-${index + 1}`,
            runtimeOwner: mount.runtimeOwner,
            request: mount.request,
            formatRegistry: mount.formatRegistry,
            ...(mount.textureResidency ? { retainTextureResidencySources: true } : {}),
            width: canvas.width,
            height: canvas.height,
            ...(node.hiddenNodeNames ? { hiddenNodeNames: node.hiddenNodeNames } : {}),
            ...(node.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
            ...decoderOptions,
            ...applyModelTintBridge(node)
          })
        })));
        const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
        const loaded = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (failure || mount.request?.signal?.aborted) {
          for (const { actor } of loaded) retireCompiledActor(mount, actor);
          throw failure?.reason ?? mount.request?.signal?.reason ?? new Error("Renderer mount was cancelled");
        }
        try {
          // Check the whole batch before tracking any of its actors. A skin is
          // authoritative only after acquisition, and failure retires peers.
          for (const { node, actor } of loaded) {
            assertFramePivotSupported(node, mount.runtimeNodes, frameUsesLegacyModelMatrix(mount.runtimeOwner ?? canvas), actor);
          }
          for (const { actor } of loaded) mount.textureResidency?.trackActor(actor);
        }
        catch (error) {
          for (const { actor } of loaded) retireCompiledActor(mount, actor);
          throw error;
        }
        return loaded;
      })()
    : [];
  let primitiveEntries: ProductionRuntimePrimitiveEntry[] = [];
  const handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[] = [];
  const splatLeases = new Map<AuraGaussianSplatNode, SplatLease>();
  const volumeLeases = new Map<AuraScalarVolumeNode, VolumeLease>();
  const volumeCleanup = createVolumeCleanupTracker();
  const projectedSpots = new ProjectedSpotSceneResources(mount);
  try {
    primitiveEntries = withCompileEvidence(mount.runtimeOwner ?? canvas, () => createProductionRuntimePrimitiveEntries(flattened, qrPrimitiveGeometryOptions(ctx.flags, ctx.quality, ctx), mount.builtinGlyphAtlas));
    for (const node of flattened) {
      if (node.kind === "gaussian-splat" && resolveNodeHandler(node.kind, ctx.flags) === nodeHandlers["gaussian-splat"]) splatLeases.set(node, createSplatLease(node, mount));
      if (node.kind === "scalar-volume" && resolveNodeHandler(node.kind, ctx.flags) === nodeHandlers["scalar-volume"]) volumeLeases.set(node, createVolumeLease(node, mount, volumeCleanup));
    }
    // Settle every concurrent acquisition before releasing successful peers on failure.
    const leases = [...splatLeases.values(), ...volumeLeases.values()];
    const splatResults = await Promise.allSettled(leases.map((lease) => lease.ready.catch((error: unknown) => {
      for (const peer of leases) { try { peer.dispose(); } catch { /* Preserve the acquisition failure. */ } }
      throw error;
    })));
    const splatFailure = splatResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (splatFailure || mount.request?.signal?.aborted) throw splatFailure?.reason ?? mount.request?.signal?.reason ?? new Error("Renderer mount was cancelled");
    const projectedReady: Promise<void>[] = [];
    for (const node of flattened) {
      if (node.kind !== "light" || node.light !== "spot" || node.projectedImage === undefined) continue;
      const ready = projectedSpots.add(node, false);
      if (ready) projectedReady.push(ready);
    }
    const projectedResults = await Promise.allSettled(projectedReady);
    const projectedFailure = projectedResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (mount.request?.signal?.aborted || (ctx.strict && projectedFailure)) {
      throw projectedFailure?.reason ?? mount.request?.signal?.reason ?? new Error("Renderer mount was cancelled");
    }
    const contributions = createContributions();
    // Beat-three.js WP-S.1: options a builder was given but does not read. Non-throwing (strict mode throws via degrade).
    for (const { node, message } of ignoredOptionMessages(flattened)) {
      recordDegrade({ code: "option-ignored", nodeId: runtimeIdOf(node), message });
    }
    for (const node of flattened) {
      const kind = String((node as { kind?: string }).kind ?? "");
      if (!isKnownNodeKind(kind)) {
        if (ctx.strict) {
          throw new AuraRuntimeError(
            "unknown-node-kind",
            `Aura3D scene node kind "${kind}" is not in the C-36 catalog and has no registered handler.`
          );
        }
        recordDegrade({
          code: "option-ignored",
          nodeId: runtimeIdOf(node),
          message: `scene node kind "${kind}" is unknown to the compiler; node ignored`
        });
        continue;
      }
      const handler = resolveNodeHandler(kind, ctx.flags);
      // Defaults are bridge markers (kind stays on the legacy path); only a
      // lane handler distinct from the default runs its compile/update hooks.
      // A flagged default is the parityPending sentinel — it is not a bridge,
      // and its compile must run so flag-off fails closed (parity-not-implemented).
      if (handler && (handler.owner !== "prd15" || handler.flag !== undefined)) {
        handledNodes.push({ node, handler });
        const out = new RecordingContributions(contributions, node.kind !== "batched");
        compileRecords.set(node, out.record);
        await handler.compile(node, node.kind === "batched" ? batchContext(ctx, getSceneClipping(snapshot) !== undefined) : ctx, out);
      }
    }

    const actors: CompiledActor[] = actorEntries.map((entry) => ({
      nodeId: entry.actor.id,
      dispose: () => retireCompiledActor(mount, entry.actor)
    }));
    if (primitiveEntries.some((entry) => entry.node.instances)) features.add("instancing");
    if (actorEntries.length > 0) features.add("skinning");
    for (const f of contributions.features) features.add(f);

    const compiled = new CompiledSceneImpl(
      0,
      null,
      actors,
      features,
      degradations,
      actorEntries,
      primitiveEntries,
      handledNodes,
      mount,
      snapshot.nodes,
      flattened.slice(),
      mountedFlat,
      mountedGroups,
      volumeCleanup,
      projectedSpots
    );
    for (const [node, record] of compileRecords) compiled.compileRecords.set(node, record);
    for (const [node, lease] of splatLeases) compiled.splatLeases.set(node, lease);
    for (const [node, lease] of volumeLeases) compiled.volumeLeases.set(node, lease);
    if (volumeLeases.size) compiled.hasOwnedScalarVolumes = true;
    // C36-DROP: contributions made by handlers' compile() (addItems/addLights/
    // set — e.g. prd02 lights/environment/probe, prd10 world) were dropped before
    // the t=0 frame. They are persistent for the scene's life: merge them into
    // the same bucket the dynamic-subtree path extends.
    compiled.persistentContributions.items.push(...contributions.items);
    compiled.persistentContributions.lights.push(...contributions.lights);
    for (const [field, value] of contributions.overrides) compiled.persistentContributions.overrides.set(field, value);
    for (const feature of contributions.features) compiled.persistentContributions.features.add(feature);
    // Build the t=0 frame so `compiled.source` is a real RenderSource at mount.
    updateCompiledSceneReal(compiled, snapshot, mount.runtimeNodes as AuraRuntimeNodeRegistry, 0);
    return compiled;
  } catch (error) {
    // The caller has no compiled scene to dispose if mount fails at any stage.
    for (const lease of splatLeases.values()) { try { lease.dispose(); } catch { /* Preserve the mount failure. */ } }
    for (const lease of volumeLeases.values()) { try { lease.dispose(); } catch { /* Preserve the mount failure. */ } }
    try { projectedSpots.dispose(); } catch { /* Preserve the mount failure. */ }
    for (const { node, handler } of handledNodes) { try { handler.dispose?.(node); } catch { /* Preserve the mount failure. */ } }
    for (const { actor } of actorEntries) { try { retireCompiledActor(mount, actor); } catch { /* Preserve the mount failure. */ } }
    for (const { resources } of primitiveEntries) for (const resource of resources) {
      cleanupCompiledPrimitiveResource(resource, (work) => { try { work(); } catch { /* Preserve the mount failure. */ } });
    }
    const cleanupResults = await Promise.allSettled([awaitVolumeCleanup(volumeCleanup), projectedSpots.whenSettled()]);
    const cleanupErrors = cleanupResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Scene mount and asset cleanup failed");
    throw error;
  }
}

/** Typed impl cast for this module and tests (external callers use `asRuntimeCompiled`). */
export const asRuntimeImpl = (compiled: CompiledScene): CompiledSceneImpl | null =>
  compiled instanceof CompiledSceneImpl ? compiled : null;

function updateCompiledSceneReal(
  compiled: CompiledScene,
  snapshot: AuraSceneSnapshot,
  runtime: AuraRuntimeNodeRegistry,
  timeSeconds: number
): unknown {
  const impl = asRuntimeImpl(compiled);
  if (!impl) return compiled.source; // flag-off compiled / foreign impl: no-op

  const ctx = impl.mountCtx;
  ctx.runtimeWarnings.clear();
  impl.publishSplatFailures();
  impl.batchSceneClipping = getSceneClipping(snapshot) !== undefined;
  const currentBatchContext = batchContext(ctx, impl.batchSceneClipping);

  const contributions = createContributions();
  const out = new SourceContributions(contributions);
  const volumeFrameLeases = new Set<VolumeFrameLease>();
  let publishedFrame: RenderSource | undefined;
  let glyphFrameSource: RenderSource | undefined;
  try {
  for (const { node, handler } of impl.handledNodes) {
    const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
    const graphNode = node.kind === "line" || node.kind === "points" || node.kind === "sprite" || node.kind === "batched" || node.kind === "scalar-volume";
    const handle = runtimeId ? runtime?.get(runtimeId) : graphNode ? runtimeNodeHandleForSceneNode(runtime, sourceSceneNodeOf(node) ?? node) : undefined;
    handler.update?.(node, handle, node.kind === "batched" ? currentBatchContext : ctx, out, timeSeconds);
  }
  // Profile metadata needs the linked runtime handle even in the legacy
  // lighting lane, and must observe ancestor visibility on every frame.
  updateRuntimePhotometricLights(impl.liveNodes, runtime, ctx.collectedLights, timeSeconds / 1000);

  const liveSnapshot = impl.liveNodes === undefined ? snapshot : { ...snapshot, nodes: impl.liveNodes };
  // app.lighting.setEnvironmentIntensity: a live scale on the environment term (legacy map path here, probe bind below).
  const environmentScale = runtimeEnvironmentIntensity(runtime);
  const knobLightingBase = ctx.environmentLighting(liveSnapshot);
  const knobLightingScaled = scaleEnvironmentLighting(knobLightingBase, environmentScale);
  const input = createProductionRuntimeRendererInput(
    liveSnapshot,
    ctx.canvas,
    impl.actorEntries,
    impl.primitiveEntries,
    timeSeconds,
    runtime,
    ctx.runtimeWarnings,
    knobLightingScaled,
    ctx.collectedLights,
    // T4.1: the mounted ctx's C-36 degrade handler owns pose/foot/morph
    // failures on the flag-on path (strict throws; non-strict warns once).
    (d) => ctx.degrade(d),
    ctx.textureResidency,
    // `liveSnapshot` is a fresh wrapper on every update. History belongs to
    // this mounted compiler and its original input scene, not that wrapper.
    { owner: impl, snapshot },
    ctx.runtimeOwner
  );
  glyphFrameSource = input.source;
  const reusedSource = reuseRenderItems(impl, input.source, runtime);
  const mergedSource = mergeContributions(mergeContributions(reusedSource, impl.persistentContributions), contributions) as RenderSource & { gaussianSplats?: readonly RuntimeGaussianSplatDraw[]; scalarVolumes?: readonly RuntimeScalarVolumeDraw[] };
  inheritBuiltinGlyphFrame(input.source, mergedSource);
  if (impl.splatLeases.size > 0) mergedSource.gaussianSplats = splatDraws(impl.splatLeases.values(), runtime);
  if (impl.volumeLeases.size > 0) {
    const device = (ctx.renderer as { readonly device?: RenderDevice } | undefined)?.device;
    if (!device) throw new Error("SCALAR_VOLUME_BACKEND_UNSUPPORTED: WebGL2 or WebGPU is required");
    Object.assign(mergedSource, { scalarVolumes: scalarVolumeDraws(impl.volumeLeases.values(), runtime, device, volumeFrameLeases) });
  }
  // T0-24: bind the C-09 environment probe (one shared cache per app). The
  // resolution runs every update so an authored environments.* node flips the
  // binding live; an hdri/preset request keeps the neutral floor until the
  // async acquire lands and `onUpgrade` swaps it.
  if (prd02LightingOn(ctx.flags)) {
    const device = (ctx.renderer as { readonly device?: RenderDevice } | undefined)?.device;
    if (device) {
      const tier = ctx.quality.tier;
      const resolution = resolveEnvironment(liveSnapshot, tier, ctx.flags);
      if (resolution.kind !== "legacy") {
        // The loader resolves the C-09 factory per load (getter), so a
        // provider registered after this cache exists is still used.
        impl.environmentCache ??= new EnvironmentCache(
          device,
          environmentProbeFactorySlot.get(ctx.flags)(device),
          defaultProbeLoader(() => environmentProbeFactorySlot.get(ctx.flags)(device))
        );
        const requestKey = prd02EnvironmentProbeRequestKey(resolution.probe);
        // `pending:<key>` = the last bind hit the C-09 stub; rebind once the
        // provider is real (no per-frame retry while it stays pending).
        const awaitingProvider = impl.environmentProbeRequest === `pending:${requestKey}`
          && isEnvironmentProbeFactoryPending(environmentProbeFactorySlot.get(ctx.flags)(device));
        if (impl.environmentProbeRequest !== requestKey && !awaitingProvider) {
          impl.environmentProbeRequest = requestKey;
          const binding = bindPrd02EnvironmentProbe(resolution, {
            device,
            tier,
            flags: ctx.flags,
            cache: impl.environmentCache,
            request: ctx.request,
            signal: ctx.request?.signal,
            onUpgrade: (probe) => {
              if (impl.environmentProbeRequest !== requestKey || ctx.request?.signal?.aborted || !impl.environmentCache) {
                impl.environmentCache?.release(probe);
                return;
              }
              if (impl.environmentProbe) impl.environmentCache.release(impl.environmentProbe);
              impl.environmentProbe = probe;
              try { ctx.onEnvironmentProbeReady?.(); } catch { /* a scheduling hook cannot undo the bound probe */ }
            },
            // Probe still pending: keep the floor and bind again next update.
            onUpgradeFailed: (_error, retryable) => {
              if (retryable && impl.environmentProbeRequest === requestKey) impl.environmentProbeRequest = `pending:${requestKey}`;
            }
          });
          if (impl.environmentProbe) impl.environmentCache.release(impl.environmentProbe);
          impl.environmentProbe = binding.probe;
          if (binding.pending) {
            impl.environmentProbeStatus = "pending";
            const key = requestKey;
            binding.pending.then(
              () => { if (impl.environmentProbeRequest === key) impl.environmentProbeStatus = "ready"; },
              () => { if (impl.environmentProbeRequest === key) impl.environmentProbeStatus = "fallback"; }
            );
          } else {
            impl.environmentProbeStatus = "ready";
          }
        }
        const probed = mergedSource as RenderSource & {
          environmentLighting?: EnvironmentLightingOptions | false;
          environmentProbe?: EnvironmentProbe | null;
          environmentProbeDiffuseIntensity?: number;
          environmentProbeSpecularIntensity?: number;
          environmentProbeAmbient?: { readonly color: readonly [number, number, number]; readonly intensity: number } | null;
          environmentProbeHemisphere?: AuraEnvironmentSourceResolution["hemisphere"];
          environmentProbeBackground?: boolean;
        };
        // E3 stage-2b (step 3): capture the stage-2a knob object BEFORE it
        // is discarded below — under the conjunction it, not the resolution,
        // is the single IBL intensity source the probe bind carries (see
        // prd02ProbeBindIntensities). This block already runs only under
        // prd02LightingOn, so COMPILER completes the conjunction.
        // The knob is read unscaled; the runtime environment scale multiplies the bound intensities once, below.
        const knobLighting = probed.environmentLighting === knobLightingScaled ? knobLightingBase : probed.environmentLighting;
        // Flag-on the C-09 probe owns environment lighting — the legacy studio
        // procedural object would early-return `collectEnvironmentLighting`.
        probed.environmentLighting = undefined;
        probed.environmentProbe = impl.environmentProbe;
        // The resolution decides whether the probe is also the background: the
        // neutral-room floor (`background: false`) lights the scene but must not
        // paint a grey room over the authored `scene().background(colour)`.
        probed.environmentProbeBackground = resolution.background !== false && resolution.background.visible;
        const probeIntensities = prd02ProbeBindIntensities(knobLighting, resolution, ctx.flags.on("A3D_QR_COMPILER"));
        probed.environmentProbeDiffuseIntensity = probeIntensities.diffuseIntensity * environmentScale;
        probed.environmentProbeSpecularIntensity = probeIntensities.specularIntensity * environmentScale;
        probed.environmentProbeAmbient = resolution.ambient
          ? { color: colorToLinearRgb(resolution.ambient.color), intensity: resolution.ambient.intensity }
          : null;
        // LIGHT-05/08: authored hemisphere lights reach the PRD-02 IBL chunk as its directional sky/ground pair.
        probed.environmentProbeHemisphere = resolution.hemisphere ?? null;
      }
    }
  }
  impl.publishBatchFrame(mergedSource, contributions.items, volumeFrameLeases);
  publishedFrame = mergedSource;
  releaseCompiledFrameOwners(impl.lastInput?.source);
  impl.lastInput = { ...input, source: mergedSource };
  impl.source = mergedSource;
  return mergedSource;
  } catch (error) {
    const failures: unknown[] = [];
    try {
      if (publishedFrame) releaseCompiledBatchFrameOwner(publishedFrame);
      else releaseUnpublishedBatchItems(contributions.items, volumeFrameLeases);
    } catch (cleanupError) { failures.push(cleanupError); }
    try { releaseBuiltinGlyphFrameOwner(glyphFrameSource); } catch (cleanupError) { failures.push(cleanupError); }
    if (failures.length) throw new AggregateError([error, ...failures], "Frame build and resource cleanup failed");
    throw error;
  }
}

/**
 * T3.12 RenderItem reuse: retain identity only when the complete submitted item
 * still describes the same draw. A node version does not capture ancestor
 * transforms, asynchronous resource upgrades, or per-frame renderer state.
 */
function reuseRenderItems(
  impl: Pick<CompiledSceneImpl, "primitiveEntries" | "actorEntries" | "itemCache">,
  source: RenderSource,
  runtime: AuraRuntimeNodeRegistry
): RenderSource {
  const collect = source.collectRenderItems ?? (() => source.renderItems ?? []);
  const items = [...collect()];
  const nextCache = new Map<string, { version: number; item: RenderItem }>();
  const nodeForItem = (item: RenderItem): AuraSceneNode | undefined => {
    const label = item.label ?? "";
    const primitive = /^primitive-(\d+):/.exec(label);
    if (primitive) return impl.primitiveEntries[Number(primitive[1])]?.node;
    const actor = /^actor-(\d+):/.exec(label);
    if (actor) return impl.actorEntries[Number(actor[1])]?.node;
    return undefined;
  };
  // T0-19: a node can emit several items — key on `${runtimeId}:${itemIndex}`
  // (the per-node emission order) so multi-item nodes don't collide on
  // `runtimeId` alone. Volatile nodes (animation/skin/morph/clips) are never
  // reused: their item content changes without a version bump.
  const perNodeIndex = new Map<string, number>();
  const isVolatile = (node: AuraSceneNode): boolean => {
    const n = node as { animation?: unknown; skin?: unknown; morph?: unknown; clips?: unknown; skeleton?: unknown };
    return n.animation !== undefined || n.skin !== undefined || n.morph !== undefined || n.clips !== undefined || n.skeleton !== undefined;
  };
  const reused = items.map((item) => {
    const node = nodeForItem(item);
    const runtimeId = node ? runtimeIdOf(node) : "";
    const handle = runtimeId ? runtime?.get(runtimeId) : undefined;
    // #1142: volatility is also an item property. A skinned/morphed GLB with
    // no authored animation (08-skinned-character, bind pose) still carries a
    // per-frame skin palette / morph state, so its item is never reused.
    if (!handle || (node && isVolatile(node)) || isVolatileItem(item)) return item;
    const index = perNodeIndex.get(runtimeId) ?? 0;
    perNodeIndex.set(runtimeId, index + 1);
    const key = `${runtimeId}:${index}`;
    const version = handle.version ?? 0;
    const cached = impl.itemCache.get(key);
    // Query items have already been published from this fresh item. The
    // cached item may replace it only when all renderer-visible state agrees,
    // even if the child node's version and its resources have not changed.
    if (cached && cached.version === version && sameRenderItemState(cached.item, item)) {
      nextCache.set(key, cached);
      return cached.item;
    }
    nextCache.set(key, { version, item });
    return item;
  });
  impl.itemCache = nextCache;
  const result = { ...source, collectRenderItems: () => reused };
  // Only a compiler-owned source can carry pair eligibility through reuse.
  // Contribution and user-collector wrappers deliberately lose this marker.
  Renderer.inheritCompilerFrameItems(source, result, reused);
  return result;
}

/** Items whose content changes every frame without a node version bump. */
function isVolatileItem(item: RenderItem): boolean {
  return item.skinning !== undefined || (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0;
}

// These small, value-only fields are routinely allocated afresh each frame.
// Other object-valued fields (resources, instance data, callbacks and unknown
// extensions) must retain their references to prove safe reuse.
const renderItemValueArrays = new Set<string>([
  "modelMatrix", "geometryMatrix", "normalMatrix", "modelViewProjectionMatrix", "boundingBoxCenter"
]);

function sameNumberArray(a: unknown, b: unknown): boolean {
  if (!(Array.isArray(a) || a instanceof Float32Array) || !(Array.isArray(b) || b instanceof Float32Array)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** Compare own fields, including extensions, so newly added RenderItem state cannot be silently ignored. */
function sameRenderItemState(cached: RenderItem, fresh: RenderItem): boolean {
  if (Object.getPrototypeOf(cached) !== Object.getPrototypeOf(fresh)) return false;
  const cachedKeys = Reflect.ownKeys(cached);
  const freshKeys = Reflect.ownKeys(fresh);
  if (cachedKeys.length !== freshKeys.length) return false;
  const previous = cached as unknown as Record<PropertyKey, unknown>;
  const current = fresh as unknown as Record<PropertyKey, unknown>;
  for (const key of cachedKeys) {
    if (!Object.prototype.hasOwnProperty.call(fresh, key)) return false;
    const a = previous[key], b = current[key];
    if (Object.is(a, b)) continue;
    if (typeof key === "string" && renderItemValueArrays.has(key) && sameNumberArray(a, b)) continue;
    if (key === "drawRange" && sameDrawRange(a, b)) continue;
    return false;
  }
  return true;
}

function sameDrawRange(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = Reflect.ownKeys(a);
  if (keys.length !== Reflect.ownKeys(b).length) return false;
  const previous = a as Record<PropertyKey, unknown>, current = b as Record<PropertyKey, unknown>;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(previous[key], current[key]));
}

/** @internal test seam for the T3.12 reuse rules (#1142). */
export const reuseRenderItemsForTest = reuseRenderItems;

/** The real C-36 impl, provided once from `lanes/prd15.ts` (and self-registered here for agent-api builds). */
export const realCompilerImpl: CompilerImpl = {
  compile: compileSceneReal,
  update: updateCompiledSceneReal
};
if (!compilerSlot.provided) {
  compilerSlot.provide(realCompilerImpl);
}

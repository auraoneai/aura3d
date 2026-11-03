import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import type { VolumeFrameLease, VolumeRenderMode, VolumeRenderer } from "../VolumeRenderer";
import type { WebGPUScalarVolumeRenderer } from "../webgpu/ScalarVolumePass";
import type { FrameCamera, FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";

/** Conservative world-space bounds of one scalar volume. */
export interface ScalarVolumeBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * A frame-local volume draw. The compiled scene owns the renderer; a frame
 * retains its owner separately until its synchronous or asynchronous render
 * completes. The model matrix maps the volume's unit cube into world space.
 */
export interface ScalarVolumeDrawRecord {
  readonly renderer: VolumeRenderer | WebGPUScalarVolumeRenderer;
  /** Acquired once per renderer for this frame; the source lifecycle releases it. */
  readonly frameLease: VolumeFrameLease;
  readonly modelMatrix: Float32Array;
  readonly worldBounds: ScalarVolumeBounds;
  readonly layerMask: number;
  readonly frustumCulled: boolean;
  readonly renderOrder: number;
  readonly mode: VolumeRenderMode;
}

/** Inputs known before the renderer chooses a forward target. */
export interface ScalarVolumeRoute {
  readonly device: RenderDevice;
  readonly deviceGeneration: number | undefined;
  readonly camera: FrameCamera | null;
  readonly coreOutput: boolean;
  readonly postprocess: boolean;
  readonly backgroundCoverage: boolean;
  readonly explicitTarget: boolean;
  readonly multiView: boolean;
  readonly fullViewport: boolean;
  readonly renderScale: number;
  readonly globalClipping: boolean;
  readonly transmission: boolean;
  readonly deferred: boolean;
}

/** Validate every retained volume again after a frame may have yielded. */
export function assertScalarVolumeFrameCurrent(
  draws: readonly ScalarVolumeDrawRecord[], device: RenderDevice, generation: number | undefined
): void {
  if (!draws.length) return;
  if (device.disposed || device.contextLost || generation === undefined || device.generation !== generation) {
    throw new RenderDeviceError("Scalar volume frame device is unavailable or stale", "SCALAR_VOLUME_FRAME_STALE");
  }
  for (const draw of draws) {
    draw.frameLease.assertCurrent();
    draw.renderer.assertUsableForDevice(device);
  }
}

/**
 * Root routes need one verified conversion from the linear target. The
 * renderer also admits its bounded WebGPU tone-map-only route after checking
 * its effect list, output encoding, sample count and copied-depth contract.
 */
export function assertScalarVolumeRoute(draws: readonly ScalarVolumeDrawRecord[], route: ScalarVolumeRoute): void {
  if (!draws.length) return;
  const device = route.device;
  if (device.kind !== "webgl2" && device.kind !== "webgpu") throw new RenderDeviceError("Scalar volumes require WebGL2 or WebGPU", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
  if (device.disposed || device.contextLost || device.generation === undefined || device.generation !== route.deviceGeneration) {
    throw new RenderDeviceError("Scalar volume frame device is unavailable or stale", "SCALAR_VOLUME_FRAME_STALE");
  }
  if (!route.camera || !route.camera.position.every(Number.isFinite)) {
    throw new RenderDeviceError("Scalar volumes require an active camera", "SCALAR_VOLUME_CAMERA_REQUIRED");
  }
  const depth = route.camera.depth;
  // Aura's camera projection is minus-one-to-one on both devices. The WebGPU
  // host converts that projection to its zero-to-one raster depth explicitly.
  if (!depth || depth.mode !== "standard" || depth.clipRange !== "minus-one-to-one" || depth.clearValue !== 1 || depth.compare !== "less-equal") {
    throw new RenderDeviceError("Scalar volumes require standard backend depth", "SCALAR_VOLUME_DEPTH_UNSUPPORTED");
  }
  if (!route.coreOutput || route.postprocess || route.backgroundCoverage) {
    throw new RenderDeviceError("Scalar volumes require the core linear output route without postprocessing or coverage", "SCALAR_VOLUME_OUTPUT_UNSUPPORTED");
  }
  if (route.explicitTarget || route.multiView || !route.fullViewport || route.renderScale !== 1) {
    throw new RenderDeviceError("Scalar volumes require the full canvas viewport and unit render scale", "SCALAR_VOLUME_VIEWPORT_UNSUPPORTED");
  }
  if (route.globalClipping || route.transmission || route.deferred) {
    throw new RenderDeviceError("Scalar volumes do not support this clipping, transmission or drawing route", "SCALAR_VOLUME_COMBINATION_UNSUPPORTED");
  }
  assertScalarVolumeFrameCurrent(draws, device, route.deviceGeneration);
}

function invalidRecord(message: string): never {
  throw new RenderDeviceError(message, "SCALAR_VOLUME_RECORD_INVALID");
}

function snapshotBounds(bounds: ScalarVolumeBounds): ScalarVolumeBounds {
  if (!bounds || !bounds.min || !bounds.max || bounds.min.length !== 3 || bounds.max.length !== 3) {
    return invalidRecord("Scalar volume bounds must contain three minimum and maximum coordinates");
  }
  const min = [...bounds.min] as [number, number, number];
  const max = [...bounds.max] as [number, number, number];
  if (min.some((value, index) => !Number.isFinite(value) || !Number.isFinite(max[index]) || value > max[index]!)) {
    return invalidRecord("Scalar volume bounds must be finite and ordered");
  }
  return { min, max };
}

function snapshotMode(mode: VolumeRenderMode): VolumeRenderMode {
  if (mode?.type === "raymarch") return { type: "raymarch" };
  if (mode?.type === "slice" && (mode.axis === "x" || mode.axis === "y" || mode.axis === "z") &&
      Number.isFinite(mode.position) && mode.position >= 0 && mode.position <= 1) {
    return { type: "slice", axis: mode.axis, position: mode.position };
  }
  return invalidRecord("Scalar volume mode must be raymarch or a valid unit-cube slice");
}

/** Snapshot mutable frame inputs once before an async frame can yield. */
export function snapshotScalarVolumeDraws(source: unknown): readonly ScalarVolumeDrawRecord[] {
  if (!source || typeof source !== "object" || Symbol.iterator in source) return [];
  const values = (source as { readonly scalarVolumes?: readonly ScalarVolumeDrawRecord[] }).scalarVolumes;
  if (values === undefined) return [];
  if (!Array.isArray(values)) return invalidRecord("Scalar volume draws must be an array");
  return values.map((draw) => {
    if (!draw || typeof draw !== "object" || !draw.renderer || typeof draw.renderer !== "object" ||
        !draw.frameLease || typeof draw.frameLease.assertCurrent !== "function" || typeof draw.frameLease.release !== "function") {
      return invalidRecord("Scalar volume draws require a renderer and frame lease");
    }
    if (!draw.modelMatrix || draw.modelMatrix.length !== 16) return invalidRecord("Scalar volume model matrices must contain 16 values");
    const modelMatrix = Float32Array.from(draw.modelMatrix);
    if (!modelMatrix.every(Number.isFinite)) return invalidRecord("Scalar volume model matrices must be finite float32 values");
    if (!Number.isSafeInteger(draw.layerMask) || !Number.isFinite(draw.renderOrder) || typeof draw.frustumCulled !== "boolean") {
      return invalidRecord("Scalar volume layer, order or culling settings are invalid");
    }
    return { renderer: draw.renderer, frameLease: draw.frameLease, modelMatrix, worldBounds: snapshotBounds(draw.worldBounds),
      layerMask: draw.layerMask, frustumCulled: draw.frustumCulled, renderOrder: draw.renderOrder,
      mode: snapshotMode(draw.mode) };
  });
}

/**
 * Create whole-volume transparent entries. Like the forward mesh sorter, depth
 * is the distance from the camera to the world-bounds center. Intersecting
 * volumes and transparent objects cannot be ordered exactly by one distance.
 */
export function scalarVolumeTransparentItems(
  draws: readonly ScalarVolumeDrawRecord[],
  cameraPosition: readonly [number, number, number],
  cameraLayerMask: number | undefined,
  intersectsBounds: ((bounds: ScalarVolumeBounds) => boolean) | undefined,
  draw: (record: ScalarVolumeDrawRecord, context: FrameContributorContext) => void
): readonly TransparentQueueItem[] {
  if (!cameraPosition || cameraPosition.length !== 3 || !cameraPosition.every(Number.isFinite)) {
    throw new RenderDeviceError("Scalar volumes require a finite active camera position", "SCALAR_VOLUME_CAMERA_REQUIRED");
  }
  const queue: TransparentQueueItem[] = [];
  draws.forEach((record, order) => {
    if (cameraLayerMask !== undefined && (record.layerMask & cameraLayerMask) === 0) return;
    if (intersectsBounds && record.frustumCulled && !intersectsBounds(record.worldBounds)) return;
    const { min, max } = record.worldBounds;
    const center = [0, 1, 2].map((axis) => (min[axis]! + max[axis]!) / 2);
    const sortDepth = Math.hypot(center[0]! - cameraPosition[0], center[1]! - cameraPosition[1], center[2]! - cameraPosition[2]);
    queue.push({ renderOrder: record.renderOrder, sortDepth, order, draw: (context) => draw(record, context) });
  });
  return queue;
}

/** Frame ownership checks the WebGPU volume pass receives from the renderer. */
export type ScalarVolumeWebGPUFrame = { readonly deviceGeneration: number; assertCurrent(): void };
type ScalarVolumeWebGPUDraw = (context: FrameContributorContext, record: ScalarVolumeDrawRecord, frame: ScalarVolumeWebGPUFrame) => void;
let webgpuScalarVolumeDraw: ScalarVolumeWebGPUDraw | undefined;

/**
 * `webgpu/ScalarVolumePass` registers its draw here when it is loaded. The renderer dispatches
 * through this slot instead of importing the pass (and `VolumeRenderer` behind it) statically, which
 * kept the whole WebGPU volume stack on the critical path of every WebGL2 scene. A WebGPU volume
 * record can only exist once a `WebGPUScalarVolumeRenderer` was constructed from that module.
 */
export function installScalarVolumeWebGPUDraw(draw: ScalarVolumeWebGPUDraw): void {
  webgpuScalarVolumeDraw = draw;
}

export function drawScalarVolumeOnWebGPU(context: FrameContributorContext, record: ScalarVolumeDrawRecord, frame: ScalarVolumeWebGPUFrame): void {
  if (!webgpuScalarVolumeDraw) {
    throw new RenderDeviceError("Scalar volume WebGPU pass is not loaded", "SCALAR_VOLUME_BACKEND_UNSUPPORTED");
  }
  webgpuScalarVolumeDraw(context, record, frame);
}

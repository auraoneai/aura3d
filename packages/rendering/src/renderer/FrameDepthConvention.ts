import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { classifyDepthPrecision, negotiateDepthConvention, toStandardWindowDepth, zeroToOneReversedProjection, type DepthClipRange, type DepthConvention, type DepthDistanceRange, type DepthMode, type DepthStorage } from "../DepthConvention";
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";

/** Same clear/compare/bias contract, clip range, logarithmic range and precision report. */
function sameDepthConvention(a: DepthConvention | undefined, b: DepthConvention): boolean {
  return !!a && a.mode === b.mode && a.clipRange === b.clipRange && a.clearValue === b.clearValue && a.compare === b.compare
    && a.biasSign === b.biasSign && a.logRange?.near === b.logRange?.near && a.logRange?.far === b.logRange?.far && a.logRange?.kind === b.logRange?.kind
    // A standard frame has nothing to refine; devices without a settable
    // convention keep accepting it.
    && (b.mode === "standard" || (a.precision === b.precision && a.depthStorage === b.depthStorage && a.projectionClipRange === b.projectionClipRange));
}

/** Clip range of a standard frame on this device (shadow, probe and mirror passes use it too). */
export function standardDeviceClipRange(device: RenderDevice, active = device.getDepthConvention?.()): DepthClipRange {
  const support = device.getDepthPrecisionSupport?.();
  // Only a zero-to-one reversed raster frame (clip control) differs from the
  // device's standard range; otherwise the active range is the native one.
  if (active && !(active.mode === "reversed" && active.clipRange === "zero-to-one" && support?.zeroToOneReversed)) return active.clipRange;
  return support?.standardClipRange ?? active?.clipRange ?? "minus-one-to-one";
}

/**
 * True when a reversed frame on this device rasterizes a native zero-to-one
 * projection (WebGL2 with EXT_clip_control). The renderer must then rebuild
 * the camera projection with `zeroToOneReversedProjection`.
 */
export function reversedFrameUsesZeroToOne(device: RenderDevice): boolean {
  return device.getDepthPrecisionSupport?.().zeroToOneReversed === true;
}

/**
 * Depth storage a reversed frame should request for its renderer-owned
 * targets: float only when it buys precision (a zero-to-one projection).
 */
export function preferredFrameDepthStorage(device: RenderDevice): DepthStorage {
  const active = device.getDepthConvention?.();
  const support = device.getDepthPrecisionSupport?.();
  return active?.mode === "reversed" && support?.zeroToOneReversed === true && active.clipRange === "zero-to-one"
    && support.floatDepth && support.floatDepthStencil ? "float" : "fixed";
}

/**
 * Make `mode` the device's active frame convention in the device's native
 * clip range and verify the device accepted it. A device that cannot change
 * its convention may only remain standard.
 */
export function applyFrameDepthConvention(
  device: RenderDevice,
  mode: DepthMode,
  logRange?: DepthDistanceRange & { readonly kind?: "perspective" | "orthographic" },
  depthStorage?: DepthStorage
): DepthConvention | undefined {
  const active = device.getDepthConvention?.();
  if (!active) {
    if (mode !== "standard") throw new RenderDeviceError("This render device does not expose a depth convention.", "DEPTH_MODE_UNSUPPORTED", { mode, backend: device.kind });
    return undefined;
  }
  if (mode === "logarithmic" && (!logRange || !(logRange.near > 0) || !Number.isFinite(logRange.far) || !(logRange.far > logRange.near))) {
    throw new RenderDeviceError("Logarithmic depth requires finite 0 < near < far.", "DEPTH_MODE_UNSUPPORTED", { mode, backend: device.kind });
  }
  // Reversed frames use a zero-to-one clip range where the device rasterizes
  // one natively; every other frame uses the device's standard clip range.
  const zeroToOne = mode === "reversed" && reversedFrameUsesZeroToOne(device);
  const clipRange: DepthClipRange = zeroToOne ? "zero-to-one" : standardDeviceClipRange(device, active);
  const support = device.getDepthPrecisionSupport?.();
  // Until the renderer records the frame's raster target, report the storage
  // it will request; `recordFrameDepthStorage` refines it.
  const storage: DepthStorage = depthStorage ?? (zeroToOne && support?.floatDepth && support.floatDepthStencil ? "float" : "fixed");
  const next: DepthConvention = Object.freeze({
    ...negotiateDepthConvention({ mode }, { clipRange, reversed: true, logarithmic: true }),
    ...(mode === "logarithmic" ? { logRange: { near: logRange!.near, far: logRange!.far, ...(logRange!.kind ? { kind: logRange!.kind } : {}) } } : {}),
    ...classifyDepthPrecision(mode, { zeroToOneProjection: zeroToOne, depthStorage: storage,
      ...(mode === "reversed" && !zeroToOne ? { reason: device.kind === "webgpu"
        ? "WebGPU programs remap the minus-one-to-one projection in the vertex stage"
        : device.kind === "webgl2" ? "EXT_clip_control is unavailable"
          : "the device does not rasterize a zero-to-one reversed projection" } : {}) }),
    ...(mode !== "standard" ? { depthStorage: storage } : {}),
    ...(zeroToOne ? { projectionClipRange: "zero-to-one" as const } : {})
  });
  if (!sameDepthConvention(active, next)) {
    if (!device.setDepthConvention) {
      throw new RenderDeviceError("The active device depth convention is not supported by the renderer.", "DEPTH_MODE_UNSUPPORTED", { mode: active.mode, backend: device.kind });
    }
    device.setDepthConvention(next);
  }
  const applied = device.getDepthConvention?.();
  if (!sameDepthConvention(applied, next)) {
    throw new RenderDeviceError("The active device depth convention is not supported by the renderer.", "DEPTH_MODE_UNSUPPORTED", { mode: applied?.mode, requested: mode, backend: device.kind });
  }
  return next;
}

/**
 * Run `body` with the standard convention active (shadow maps, probe faces
 * and other passes that own a standard projection), then restore the frame
 * convention even when `body` throws.
 */
export function withStandardDeviceDepth<T>(device: RenderDevice, body: () => T): T {
  const previous = device.getDepthConvention?.();
  if (!previous || previous.mode === "standard" || !device.setDepthConvention) return body();
  // Standard light/probe projections are minus-one-to-one on WebGL2 even when
  // the frame uses zero-to-one clip control, so the clip range resets too.
  device.setDepthConvention(negotiateDepthConvention({}, { clipRange: standardDeviceClipRange(device, previous), reversed: false, logarithmic: false }));
  try {
    return body();
  } finally {
    device.setDepthConvention(previous);
  }
}

/**
 * Refine the active frame convention's precision report with the depth
 * storage of the target the frame actually rasterizes into (the canvas and
 * caller targets without float depth are "fixed").
 */
export function recordFrameDepthStorage(device: RenderDevice, storage: DepthStorage): DepthConvention | undefined {
  const active = device.getDepthConvention?.();
  if (!active || active.mode === "standard" || active.depthStorage === storage || !device.setDepthConvention) return active;
  const logRange = active.logRange;
  return applyFrameDepthConvention(device, active.mode, logRange?.kind ? { near: logRange.near, far: logRange.far, kind: logRange.kind } : logRange, storage);
}

/**
 * Convert a depth readback in the device's active convention to standard
 * window depth so CPU reference consumers keep one reconstruction. Reversed
 * window depth is 1 - standard depth in both clip ranges: a zero-to-one
 * reversed projection stores n(f - d) / (d(f - n)), exactly 1 - f(d - n) / (d(f - n)).
 */
export function standardizeDepthReadback(data: Float32Array, convention: DepthConvention | undefined): Float32Array {
  if (!convention || convention.mode === "standard") return data;
  if (convention.mode === "logarithmic" && (!convention.logRange?.kind)) {
    throw new RenderDeviceError("Logarithmic depth readback requires the frame projection kind and range.", "DEPTH_READBACK_CONVENTION_UNSUPPORTED");
  }
  const projection = convention.mode === "logarithmic"
    ? { kind: convention.logRange!.kind!, near: convention.logRange!.near, far: convention.logRange!.far }
    : { kind: "perspective" as const, near: 1, far: 2 };
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.min(1, Math.max(0, toStandardWindowDepth(data[i]!, convention, projection)));
  return out;
}

/** The resolved frame camera matrices a raster convention change must keep coherent. */
export interface RasterCameraMatrices {
  readonly viewProjectionMatrix: Mat4;
  readonly viewMatrix?: Mat4;
  readonly projectionMatrix?: Mat4;
  readonly projectionMatrixInverse?: Mat4;
  readonly shaderViewMatrix?: Mat4;
  readonly shaderProjectionMatrix?: Mat4;
  readonly projectionMetadata?: { readonly kind: "perspective" | "orthographic" | "custom"; readonly near?: number; readonly far?: number; readonly mode: DepthMode; readonly clipRange: DepthClipRange };
  readonly depthConvention?: DepthConvention;
}

function sameAtFloatPrecision(left: readonly number[], right: readonly number[]): boolean {
  return left.length === 16 && right.length === 16 && left.every((value, index) => {
    const a = Math.fround(value), b = Math.fround(right[index]!);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  });
}

/**
 * Rebuild a reversed minus-one-to-one frame camera for zero-to-one raster
 * clip control. When P * V reproduces the view-projection, the depth row is
 * rebuilt from near/far and multiplied in double precision (the reversed-Z
 * precision path); otherwise the view-projection row is remapped directly.
 * Every matrix, the inverse projection and both convention records change
 * together, so culling, shaders and depth reconstruction keep agreeing.
 */
export function zeroToOneReversedRasterCamera<T extends RasterCameraMatrices>(camera: T): T {
  const metadata = camera.projectionMetadata;
  const mode = metadata?.mode ?? camera.depthConvention?.mode;
  const clipRange = metadata?.clipRange ?? camera.depthConvention?.clipRange ?? "minus-one-to-one";
  if (mode !== "reversed" || clipRange !== "minus-one-to-one") return camera;
  const range = metadata && metadata.kind !== "custom" ? { kind: metadata.kind, near: metadata.near, far: metadata.far } : undefined;
  const view = camera.viewMatrix ?? camera.shaderViewMatrix;
  const projection = camera.projectionMatrix ?? camera.shaderProjectionMatrix;
  const toMat4 = (values: ArrayLike<number>): Mat4 => Array.from(values) as Mat4;
  let rasterProjection: Mat4 | undefined;
  let viewProjection: Mat4;
  if (projection && view && sameAtFloatPrecision(multiplyMat4(projection, view), camera.viewProjectionMatrix)) {
    rasterProjection = toMat4(zeroToOneReversedProjection(projection, range));
    viewProjection = multiplyMat4(rasterProjection, view);
  } else {
    viewProjection = toMat4(zeroToOneReversedProjection(camera.viewProjectionMatrix));
    if (projection) rasterProjection = toMat4(zeroToOneReversedProjection(projection, range));
  }
  let inverse: Mat4 | undefined;
  try {
    const decoded = rasterProjection ?? (view ? multiplyMat4(viewProjection, invertMat4(view)) : undefined);
    inverse = decoded ? invertMat4(decoded) : undefined;
  } catch { inverse = undefined; }
  // Never keep a minus-one-to-one inverse next to zero-to-one metadata.
  const { projectionMatrixInverse: _stale, ...rest } = camera;
  return {
    ...(rest as T),
    viewProjectionMatrix: viewProjection,
    ...(camera.projectionMatrix && rasterProjection ? { projectionMatrix: rasterProjection } : {}),
    ...(camera.shaderProjectionMatrix && rasterProjection ? { shaderProjectionMatrix: rasterProjection } : {}),
    ...(inverse ? { projectionMatrixInverse: inverse } : {}),
    ...(metadata ? { projectionMetadata: { ...metadata, clipRange: "zero-to-one" as const } } : {}),
    ...(camera.depthConvention ? { depthConvention: Object.freeze({ ...camera.depthConvention, clipRange: "zero-to-one" as const }) } : {})
  };
}

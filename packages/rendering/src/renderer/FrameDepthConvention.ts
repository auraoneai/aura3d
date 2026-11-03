import { negotiateDepthConvention, toStandardWindowDepth, type DepthConvention, type DepthDistanceRange, type DepthMode } from "../DepthConvention";
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";

/** Same clear/compare/bias contract and logarithmic range. */
function sameDepthConvention(a: DepthConvention | undefined, b: DepthConvention): boolean {
  return !!a && a.mode === b.mode && a.clipRange === b.clipRange && a.clearValue === b.clearValue && a.compare === b.compare
    && a.biasSign === b.biasSign && a.logRange?.near === b.logRange?.near && a.logRange?.far === b.logRange?.far && a.logRange?.kind === b.logRange?.kind;
}

/**
 * Make `mode` the device's active frame convention in the device's native
 * clip range and verify the device accepted it. A device that cannot change
 * its convention may only remain standard.
 */
export function applyFrameDepthConvention(device: RenderDevice, mode: DepthMode, logRange?: DepthDistanceRange & { readonly kind?: "perspective" | "orthographic" }): DepthConvention | undefined {
  const active = device.getDepthConvention?.();
  if (!active) {
    if (mode !== "standard") throw new RenderDeviceError("This render device does not expose a depth convention.", "DEPTH_MODE_UNSUPPORTED", { mode, backend: device.kind });
    return undefined;
  }
  if (mode === "logarithmic" && (!logRange || !(logRange.near > 0) || !Number.isFinite(logRange.far) || !(logRange.far > logRange.near))) {
    throw new RenderDeviceError("Logarithmic depth requires finite 0 < near < far.", "DEPTH_MODE_UNSUPPORTED", { mode, backend: device.kind });
  }
  const next: DepthConvention = Object.freeze({
    ...negotiateDepthConvention({ mode }, { clipRange: active.clipRange, reversed: true, logarithmic: true }),
    ...(mode === "logarithmic" ? { logRange: { near: logRange!.near, far: logRange!.far, ...(logRange!.kind ? { kind: logRange!.kind } : {}) } } : {})
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
  device.setDepthConvention(negotiateDepthConvention({}, { clipRange: previous.clipRange, reversed: false, logarithmic: false }));
  try {
    return body();
  } finally {
    device.setDepthConvention(previous);
  }
}

/**
 * Convert a depth readback in the device's active convention to standard
 * window depth so CPU reference consumers keep one reconstruction.
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

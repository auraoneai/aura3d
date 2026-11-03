import type { RenderDevice, RenderOutputColorSpaceNegotiation } from "@aura3d/rendering";
import type { AuraRendererDiagnosticReport } from "../nodes/types.js";

/**
 * Inspect only the device's existing negotiation; diagnostics must never
 * negotiate or mutate a canvas. A negotiation describes the canvas, not
 * physical display support, successful presentation, or pixel accuracy.
 */
export function readOutputColorSpaceObservation(
  device: RenderDevice,
  webGL2Context: () => WebGL2RenderingContext | null
): {
  readonly active: AuraRendererDiagnosticReport["outputColorSpace"];
  readonly lastNegotiation?: RenderOutputColorSpaceNegotiation;
} {
  const unknown = { active: "unknown" } as const;
  try {
    if (device.disposed || device.contextLost) return unknown;
    if (device.kind !== "webgl2" && device.kind !== "webgpu") return unknown;
    // WebGPU can return its default negotiation even without a canvas.
    if (device.kind === "webgpu" && !device.info.capabilities?.includes("canvas-surface")) return unknown;
    const result = device.getOutputColorSpaceNegotiation?.();
    if (!result || !Array.isArray(result.supported)) return unknown;
    const { requested, active, fallbackReason } = result;
    const supported = [...result.supported];
    if ((requested !== "srgb" && requested !== "display-p3")
      || (active !== "srgb" && active !== "display-p3")
      || !supported.every((space) => space === "srgb" || space === "display-p3")
      || !supported.includes(active)
      || (fallbackReason !== undefined
        && (typeof fallbackReason !== "string" || !fallbackReason.trim()))
      || (requested !== active
        && (requested !== "display-p3" || active !== "srgb" || !fallbackReason))) {
      return unknown;
    }
    const lastNegotiation = { requested, active, supported, ...(fallbackReason === undefined ? {} : { fallbackReason }) };
    if (device.kind === "webgl2") {
      // The WebGL getter can hold a prior negotiation. Check the current
      // drawing buffer without assigning it. Retain the backend's last
      // negotiation as history, but never treat it as a current observation
      // when the drawing buffer is unreadable or has changed.
      try {
        const gl = webGL2Context() as (WebGL2RenderingContext & { readonly drawingBufferColorSpace?: string }) | null;
        if (!gl || gl.drawingBufferColorSpace !== active) return { ...unknown, lastNegotiation };
      } catch {
        return { ...unknown, lastNegotiation };
      }
    }
    return { active, lastNegotiation };
  } catch {
    // A lost, superseded, or uninspectable surface is not evidence of sRGB.
    return unknown;
  }
}

export function readActiveOutputColorSpace(
  device: RenderDevice,
  webGL2Context: () => WebGL2RenderingContext | null
): AuraRendererDiagnosticReport["outputColorSpace"] {
  return readOutputColorSpaceObservation(device, webGL2Context).active;
}

import type { QrFlagName, QrFlags } from "../contracts/core";
import type { RenderDevice } from "../RenderDevice";
import { programCacheSlot, type ProgramCacheLike } from "../contracts/program";
import { frameUniformsSlot, type FrameUniformsLike } from "../contracts/frameUniforms";

/**
 * PRD-01 §15 sub-flag resolution: `A3D_QR_CORE_GENERATOR` and
 * `A3D_QR_CORE_OUTPUT` default ON under `A3D_QR_CORE=v2` and can be excluded
 * per-capture (`?a3d-qr=core,-core_generator`) for attribution. Explicit
 * values always win.
 */
function subFlagOn(flags: QrFlags, sub: QrFlagName, lane: QrFlagName): boolean {
  const explicit = flags.values[sub];
  return explicit !== undefined ? flags.on(sub) : flags.on(lane);
}

/** Generated-program path (C-02) vs. frozen legacy shaderKey path. */
export function qrCoreGeneratorOn(flags: QrFlags): boolean {
  return subFlagOn(flags, "A3D_QR_CORE_GENERATOR", "A3D_QR_CORE");
}

/** HDR offscreen target + OutputPass present+encode path (C-23). */
export function qrCoreOutputOn(flags: QrFlags): boolean {
  return subFlagOn(flags, "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE");
}

// ── Device-scoped singletons (C-02/C-08) ─────────────────────────────────
// The generated-program cache and the AuraFrame UBO belong to the device, not a
// pass instance: the Renderer warms it and ForwardPass acquires from it.

const caches = new WeakMap<RenderDevice, ProgramCacheLike>();
const auraFrames = new WeakMap<RenderDevice, FrameUniformsLike>();

export function rendererProgramCache(device: RenderDevice, flags: QrFlags): ProgramCacheLike {
  let cache = caches.get(device);
  if (!cache) {
    cache = programCacheSlot.get(flags)(device);
    caches.set(device, cache);
  }
  return cache;
}

export function rendererAuraFrame(device: RenderDevice, flags: QrFlags): FrameUniformsLike {
  let fu = auraFrames.get(device);
  if (!fu) {
    fu = frameUniformsSlot.get(flags)(device);
    auraFrames.set(device, fu);
  }
  return fu;
}

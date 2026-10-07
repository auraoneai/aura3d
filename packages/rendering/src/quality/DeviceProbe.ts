/**
 * PRD 11 Phase 0 — `DeviceProbe` (C-28) for WebGL2 contexts.
 *
 * `probeWebGL2Device(gl, env?)` is the testable seam: `env` injects the
 * navigator/screen/matchMedia surface so unit tests run without a DOM. The
 * production caller is `createWebGL2DeviceProbe` in `webgl2/Probe.ts`, which
 * passes no `env` and therefore reads the real globals.
 *
 * `gpuTimingBackendForDevice(device)` lazily creates one scoped GPU timing
 * backend per device by looking up the `WebGL2DeviceHost` registered by
 * `webgl2/Probe.ts` at construction time (PRD 11 §Phase 0; Q-01-2 asks lane 01
 * to expose this on the interface eventually).
 */

import type { DeviceProbe } from "../contracts/device";
import type { RenderDevice } from "../RenderDevice";
import { createWebGL2GpuTimingBackend, type RendererGpuTimingBackend } from "../RendererTiming";
import { webgl2DeviceHost } from "../webgl2/Counters";

export interface ProbeEnvironment {
  readonly navigator?: {
    readonly userAgent?: string;
    readonly hardwareConcurrency?: number;
    readonly deviceMemory?: number;
    readonly userAgentData?: { readonly mobile?: boolean };
  } | null;
  readonly screen?: { readonly width: number; readonly height: number } | null;
  readonly devicePixelRatio?: number;
  /** Pre-resolved `matchMedia("(pointer: coarse)")` result; a real browser supplies it. */
  readonly coarsePointer?: boolean;
}

interface DebugRendererInfo {
  readonly UNMASKED_RENDERER_WEBGL: number;
  readonly UNMASKED_VENDOR_WEBGL: number;
}

function detectMobile(env: ProbeEnvironment | undefined): boolean | null {
  const nav = env === undefined
    ? (typeof navigator !== "undefined" ? navigator : null)
    : env.navigator ?? null;
  const uaData = (nav as { userAgentData?: { mobile?: boolean } } | null)?.userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") {
    return uaData.mobile;
  }
  const coarse = env === undefined
    ? (typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : null)
    : env.coarsePointer ?? null;
  if (coarse !== null && coarse !== undefined) {
    return coarse;
  }
  const ua = nav?.userAgent ?? "";
  if (!ua) return null;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function probeWebGL2Device(gl: WebGL2RenderingContext, env?: ProbeEnvironment): DeviceProbe {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as DebugRendererInfo | null;
  const nav = env === undefined
    ? (typeof navigator !== "undefined" ? navigator : null)
    : env.navigator ?? null;
  const scr = env === undefined
    ? (typeof screen !== "undefined" ? screen : null)
    : env.screen ?? null;
  const dpr = env?.devicePixelRatio
    ?? (typeof globalThis !== "undefined" && "devicePixelRatio" in globalThis ? (globalThis.devicePixelRatio as number) : 1);
  return {
    backend: "webgl2",
    rendererString: (gl.getParameter(gl.RENDERER) as string) ?? "",
    unmaskedRenderer: debugInfo ? ((gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string) ?? null) : null,
    unmaskedVendor: debugInfo ? ((gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string) ?? null) : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
    floatColorBuffer: gl.getExtension("EXT_color_buffer_float") != null,
    halfFloatColorBuffer: gl.getExtension("EXT_color_buffer_half_float") != null,
    timerQuery: gl.getExtension("EXT_disjoint_timer_query_webgl2") != null,
    parallelShaderCompile: gl.getExtension("KHR_parallel_shader_compile") != null,
    multiDraw: gl.getExtension("WEBGL_multi_draw") != null,
    devicePixelRatio: dpr,
    screen: scr ? [scr.width, scr.height] : [0, 0],
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemoryGB: nav && "deviceMemory" in nav ? ((nav as { deviceMemory?: number }).deviceMemory ?? null) : null,
    mobile: detectMobile(env)
  };
}

const gpuBackends = new WeakMap<RenderDevice, RendererGpuTimingBackend | null>();

/**
 * One scoped timing backend per device (query queues live on the backend, so
 * it must be shared across frames). `null` for non-WebGL2 devices, devices
 * whose probe reports `timerQuery === false`, or when the host seam is absent
 * (the backend degrades to cpu-only rather than throwing).
 */
export function gpuTimingBackendForDevice(device: RenderDevice): RendererGpuTimingBackend | null {
  if (gpuBackends.has(device)) {
    return gpuBackends.get(device) ?? null;
  }
  let backend: RendererGpuTimingBackend | null = null;
  const host = webgl2DeviceHost(device);
  if (host && device.probe?.timerQuery) {
    backend = createWebGL2GpuTimingBackend(host.gl);
  }
  gpuBackends.set(device, backend);
  return backend;
}

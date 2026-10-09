// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.



export class WebGL2Counters {
  bufferUpdateCount = 0;
  drawCalls = 0;
  inactiveUniformBindCount = 0;
  nativeEnvironmentBindings = 0;
  nativeInstancedSubmissions = 0;
  nativeShadowMapBindings = 0;
  nativeTemporalBindings = 0;
  nativeTemporalPasses = 0;
  programCompiles = 0;
  readbacks = 0;
  releasedTextureHandles = 0;
  samplerAnisotropyUploadCount = 0;
  samplerParameterUploadCount = 0;
  shaderProgramCreateCount = 0;
  shadowRenderTargetsAllocated = 0;
  textureBindCount = 0;
  uniformLocationLookupCount = 0;
  vertexArrayCreateCount = 0;
}

/* ------------------------------------------------------------------ */
/* PRD 11 Phase 0 — full C-28 `DeviceCounters` on device instances.      */
/*                                                                     */
/* `WebGL2Device.counters()` natively reports drawCalls, readbacks and   */
/* programCompiles (counted at the call sites in this package) plus      */
/* diagnostic-derived live gauges; the remaining C-28 fields             */
/* (bufferCreates, textureUploads, renderTargetsCreated, liveBuffers,    */
/* textureBytes, renderTargetBytes) are not counted by lane-01 code.     */
/* `installPrd11DeviceCounters` wraps the public device methods of a     */
/* live device and rewrites its `counters()`/`resetFrameCounters()` to   */
/* fill those fields. It is invoked only from the `A3D_QR_TIERS`-gated   */
/* frame contributor (and unit tests), so flag-off rendering is          */
/* byte-identical.                                                     */
/*                                                                     */
/* Per-frame fields are cleared by each wrapped `resetFrameCounters()`   */
/* call (the contributor calls it at `collect`). Live gauges stay        */
/* cumulative. `liveVertexArrays` stays `null` until Q-01-1 gives the    */
/* lane access to the draw binder's VAO cache.                           */
/* ------------------------------------------------------------------ */

import type { DeviceCounters } from "../contracts/device";
import type { RenderDevice } from "../RenderDevice";
import type { WebGL2DeviceHost } from "./DeviceHost";

/**
 * PRD 11 Phase 0 — device → host seam. `WebGL2Device` constructs
 * `WebGL2ReadbackProbe` with `host.device` already assigned, so the lane can
 * recover the GL context (and counters bag) from any `RenderDevice` instance
 * without a lane-01 edit. Inert bookkeeping only: populated even with
 * `A3D_QR_TIERS` off, never read by the render path.
 */
const deviceHosts = new WeakMap<RenderDevice, WebGL2DeviceHost>();

export function registerWebGL2DeviceHost(host: WebGL2DeviceHost): void {
  deviceHosts.set(host.device, host);
}

export function webgl2DeviceHost(device: RenderDevice): WebGL2DeviceHost | null {
  return deviceHosts.get(device) ?? null;
}

interface Prd11CounterState {
  drawCalls: number;
  bufferCreates: number;
  textureUploads: number;
  readbacks: number;
  renderTargetsCreated: number;
  programCompiles: number;
}

const counterStates = new WeakMap<RenderDevice, Prd11CounterState>();
const installedDevices = new WeakSet<RenderDevice>();

function increment(device: RenderDevice, field: keyof Prd11CounterState, amount = 1): void {
  const state = counterStates.get(device);
  if (state) {
    state[field] += amount;
  }
}

function wrap0(device: RenderDevice, name: string, field: keyof Prd11CounterState): void {
  const owner = device as unknown as Record<string, unknown>;
  const original = owner[name] as ((this: RenderDevice, ...args: unknown[]) => unknown) | undefined;
  if (typeof original !== "function") return;
  owner[name] = function wrapped(this: RenderDevice, ...args: unknown[]): unknown {
    increment(device, field);
    return original.apply(this, args);
  };
}

/**
 * Wraps a device's public methods so every C-28 counter field is measured.
 * Idempotent; the second call on the same device is a no-op. Also binds a
 * `WeakMap`-keyed counter state so per-frame reset clears measured fields
 * without touching `host.counters` (lane-01 counters keep their semantics).
 */
export function installPrd11DeviceCounters(device: RenderDevice): void {
  if (installedDevices.has(device)) {
    return;
  }
  installedDevices.add(device);
  const state: Prd11CounterState = {
    drawCalls: 0, bufferCreates: 0, textureUploads: 0,
    readbacks: 0, renderTargetsCreated: 0, programCompiles: 0
  };
  counterStates.set(device, state);

  wrap0(device, "createBuffer", "bufferCreates");
  wrap0(device, "createRenderTarget", "renderTargetsCreated");
  wrap0(device, "writeRenderTargetPixels", "textureUploads");
  wrap0(device, "createShaderProgram", "programCompiles");
  wrap0(device, "compileAsync", "programCompiles");
  wrap0(device, "draw", "drawCalls");
  wrap0(device, "drawInstanced", "drawCalls");
  wrap0(device, "multiDrawElementsInstanced", "drawCalls");
  wrap0(device, "readPixels", "readbacks");
  wrap0(device, "readFloatPixels", "readbacks");
  wrap0(device, "readDepthPixels", "readbacks");
  wrap0(device, "readPixelsAsync", "readbacks");
  wrap0(device, "readFloatPixelsAsync", "readbacks");

  const originalCounters = typeof device.counters === "function" ? device.counters.bind(device) : null;
  const originalReset = typeof device.resetFrameCounters === "function" ? device.resetFrameCounters.bind(device) : null;
  const originalDiagnostics = typeof device.getDiagnostics === "function" ? device.getDiagnostics.bind(device) : null;

  device.counters = (): DeviceCounters => {
    const base = originalCounters ? originalCounters() : null;
    const diag = originalDiagnostics
      ? (originalDiagnostics() as { buffers?: number; textureBytes?: number; gpuTargetBytes?: number })
      : null;
    // Overlapping fields are counted both at lane-01 call sites (base) and by
    // these wrappers (state); `Math.max` merges them without double-counting.
    const merged = (field: "drawCalls" | "readbacks" | "programCompiles"): number =>
      Math.max(state[field], base?.[field] ?? 0);
    return {
      drawCalls: merged("drawCalls"),
      bufferCreates: state.bufferCreates,
      textureUploads: state.textureUploads,
      readbacks: merged("readbacks"),
      renderTargetsCreated: state.renderTargetsCreated,
      programCompiles: merged("programCompiles"),
      liveBuffers: diag?.buffers ?? 0,
      // Measured by lane-01 code today (draw-binder VAO cache); 0 when a device
      // has no counters/diagnostics of its own. C-28 types this `number`, so a
      // null "unmeasured" sentinel is not available here.
      liveVertexArrays: base?.liveVertexArrays ?? 0,
      textureBytes: diag?.textureBytes ?? 0,
      renderTargetBytes: diag?.gpuTargetBytes ?? 0
    };
  };

  device.resetFrameCounters = (): void => {
    originalReset?.();
    state.drawCalls = 0;
    state.bufferCreates = 0;
    state.textureUploads = 0;
    state.readbacks = 0;
    state.renderTargetsCreated = 0;
    state.programCompiles = 0;
  };
}

/** Test/audit read of the installed per-frame state; `null` when not installed. */
export function prd11CounterState(device: RenderDevice): Prd11CounterState | null {
  return counterStates.get(device) ?? null;
}

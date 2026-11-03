/**
 * Resource accounting shared by the U1 soak harness (in the page) and its
 * source tests. No DOM side effects at import.
 *
 * WebGPU pipelines have no destroy(); their lifetime is bounded by the device
 * that created them. A pipeline is therefore live while its creating device is
 * live, and a soak passes only when every device the engine requested has been
 * destroyed again (taking its pipelines with it).
 */

export interface WebGPUPipelineSnapshot {
  readonly devicesCreated: number;
  readonly devicesLive: number;
  readonly pipelinesCreated: { readonly render: number; readonly compute: number };
  readonly pipelinesLive: number;
}

export interface WebGPUPipelineLedger {
  snapshot(): WebGPUPipelineSnapshot;
}

type Method = (this: object, ...args: unknown[]) => unknown;
interface PrototypeHost { readonly GPUAdapter?: { prototype: object }; readonly GPUDevice?: { prototype: object } }

const LEDGER = Symbol.for("aura3d.soak.webgpu-pipeline-ledger");

/**
 * Patch GPUAdapter.requestDevice and the GPUDevice pipeline factories and
 * destroy. Returns null when the host has no WebGPU prototypes. Idempotent.
 */
export function installWebGPUPipelineLedger(host: PrototypeHost): WebGPUPipelineLedger | null {
  const adapter = host.GPUAdapter?.prototype as Record<string | symbol, unknown> | undefined;
  const device = host.GPUDevice?.prototype as Record<string | symbol, unknown> | undefined;
  if (!adapter || !device || typeof adapter.requestDevice !== "function") return null;
  const existing = device[LEDGER] as WebGPUPipelineLedger | undefined;
  if (existing) return existing;

  const live = new Map<object, number>();
  let devicesCreated = 0;
  const created = { render: 0, compute: 0 };
  const track = (owner: object): void => {
    if (!live.has(owner)) { live.set(owner, 0); devicesCreated += 1; }
  };
  const count = (owner: object, kind: "render" | "compute"): void => {
    track(owner);
    created[kind] += 1;
    live.set(owner, (live.get(owner) ?? 0) + 1);
  };

  const requestDevice = adapter.requestDevice as Method;
  adapter.requestDevice = async function (this: object, ...args: unknown[]) {
    const result = await requestDevice.apply(this, args);
    if (result && typeof result === "object") track(result);
    return result;
  };
  for (const [name, kind, async] of [
    ["createRenderPipeline", "render", false],
    ["createRenderPipelineAsync", "render", true],
    ["createComputePipeline", "compute", false],
    ["createComputePipelineAsync", "compute", true]
  ] as const) {
    const original = device[name];
    if (typeof original !== "function") continue;
    device[name] = async
      ? async function (this: object, ...args: unknown[]) {
        const pipeline = await (original as Method).apply(this, args);
        count(this, kind);
        return pipeline;
      }
      : function (this: object, ...args: unknown[]) {
        const pipeline = (original as Method).apply(this, args);
        count(this, kind);
        return pipeline;
      };
  }
  const destroy = device.destroy;
  if (typeof destroy === "function") {
    device.destroy = function (this: object, ...args: unknown[]) {
      live.delete(this);
      return (destroy as Method).apply(this, args);
    };
  }
  const ledger: WebGPUPipelineLedger = {
    snapshot: () => ({
      devicesCreated,
      devicesLive: live.size,
      pipelinesCreated: { ...created },
      pipelinesLive: [...live.values()].reduce((total, n) => total + n, 0)
    })
  };
  Object.defineProperty(device, LEDGER, { value: ledger });
  return ledger;
}

export type HeapGatePolicy =
  | { readonly status: "calibrated"; readonly method: string; readonly maxDriftBytes: number; readonly maxReclaimBytes: number; readonly provenance: string }
  | { readonly status: "unsupported"; readonly reason: string };

/**
 * The heap bounds were calibrated only for Chromium with CDP forced GC and
 * `performance.memory`. Every other browser family reports the heap metric as
 * explicitly unsupported instead of reusing thresholds that were never measured
 * there; its native-handle, listener, registry and WebGPU checks still apply.
 */
export function heapGatePolicy(browserName: string): HeapGatePolicy {
  if (browserName === "chromium") {
    return {
      status: "calibrated",
      method: "Chromium CDP forced GC, settled minimum",
      maxDriftBytes: 4 * 1024 * 1024,
      maxReclaimBytes: 2 * 1024 * 1024,
      provenance: "U1 calibration 2026-09-04; comparability with other runners is unverified"
    };
  }
  return {
    status: "unsupported",
    reason: `${browserName} exposes neither a forced-GC protocol nor performance.memory; the Chromium-calibrated heap bounds do not apply and no ${browserName} calibration exists.`
  };
}

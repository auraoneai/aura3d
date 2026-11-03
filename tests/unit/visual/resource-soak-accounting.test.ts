import { describe, expect, it } from "vitest";
import { heapGatePolicy, installWebGPUPipelineLedger } from "../../browser/resource-soak-accounting";

function fakeWebGPU() {
  class GPUDevice {
    destroyed = 0;
    createRenderPipeline(): object { return {}; }
    async createRenderPipelineAsync(): Promise<object> { return {}; }
    createComputePipeline(): object { return {}; }
    destroy(): void { this.destroyed += 1; }
  }
  class GPUAdapter {
    async requestDevice(): Promise<GPUDevice> { return new GPUDevice(); }
  }
  return { GPUAdapter, GPUDevice };
}

describe("U1 soak WebGPU pipeline ledger", () => {
  it("counts render and compute pipelines per requested device until that device is destroyed", async () => {
    const host = fakeWebGPU();
    const ledger = installWebGPUPipelineLedger(host)!;
    expect(installWebGPUPipelineLedger(host)).toBe(ledger);
    const adapter = new host.GPUAdapter();
    const a = await adapter.requestDevice(), b = await adapter.requestDevice();
    a.createRenderPipeline(); await a.createRenderPipelineAsync(); a.createComputePipeline(); b.createRenderPipeline();
    expect(ledger.snapshot()).toEqual({ devicesCreated: 2, devicesLive: 2, pipelinesCreated: { render: 3, compute: 1 }, pipelinesLive: 4 });
    a.destroy();
    expect(a.destroyed).toBe(1);
    expect(ledger.snapshot()).toMatchObject({ devicesLive: 1, pipelinesLive: 1 });
    b.destroy();
    expect(ledger.snapshot()).toEqual({ devicesCreated: 2, devicesLive: 0, pipelinesCreated: { render: 3, compute: 1 }, pipelinesLive: 0 });
  });

  it("keeps a never-destroyed device and its pipelines live", async () => {
    const host = fakeWebGPU();
    const ledger = installWebGPUPipelineLedger(host)!;
    const leaked = await new host.GPUAdapter().requestDevice();
    leaked.createRenderPipeline();
    expect(ledger.snapshot()).toMatchObject({ devicesLive: 1, pipelinesLive: 1 });
  });

  it("reports no ledger without WebGPU prototypes", () => {
    expect(installWebGPUPipelineLedger({})).toBeNull();
  });
});

describe("U1 soak heap gate policy", () => {
  it("applies the calibrated bounds only to Chromium", () => {
    expect(heapGatePolicy("chromium")).toMatchObject({ status: "calibrated", maxDriftBytes: 4 * 1024 * 1024, maxReclaimBytes: 2 * 1024 * 1024 });
  });

  it.each(["firefox", "webkit"])("marks the heap metric unsupported on %s with a reason", (name) => {
    const policy = heapGatePolicy(name);
    expect(policy.status).toBe("unsupported");
    expect(policy.status === "unsupported" && policy.reason).toMatch(new RegExp(name));
  });
});

import { describe, expect, it } from "vitest";

import { createRenderDevice, Renderer } from "../../../../packages/rendering/src";
import type { WebGPUAdapterLike, WebGPUDeviceLike } from "../../../../packages/rendering/src/WebGPUDevice";

/**
 * Issue #271 (Q-11-2, blocks lane 09): a WebGPU `GPUDevice.lost` resolution
 * must reach every `onDeviceLost` listener — on the device and through the
 * `Renderer` C-29 delegate that `createAuraApp` subscribes to — exactly once,
 * and `onDeviceRestored` must never be synthesized (native WebGPU needs a new
 * device after loss).
 */

interface LostInfo {
  readonly reason: string;
  readonly message: string;
}

function fakeNativeDevice(lost: Promise<LostInfo>): WebGPUDeviceLike {
  return {
    queue: { writeBuffer() {}, submit() {} },
    createBuffer(descriptor: { readonly size: number }) {
      return { data: new Uint8Array(descriptor.size), destroy() {} };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    destroy() {},
    lost
  } as unknown as WebGPUDeviceLike;
}

async function lostDevice() {
  let resolveLost!: (info: LostInfo) => void;
  const lost = new Promise<LostInfo>((resolve) => { resolveLost = resolve; });
  const webgpu = {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "lost-webgpu-adapter",
        async requestDevice(): Promise<WebGPUDeviceLike> {
          return fakeNativeDevice(lost);
        }
      } as WebGPUAdapterLike;
    }
  };
  return { webgpu, resolveLost };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

describe("#271 WebGPU device.lost -> onDeviceLost", () => {
  it("device.onDeviceLost listeners fire once when GPUDevice.lost resolves", async () => {
    const { webgpu, resolveLost } = await lostDevice();
    const device = await createRenderDevice({ backend: "webgpu", webgpu });
    const lifecycle = device as typeof device & { onDeviceLost(listener: () => void): () => void };
    let lostCount = 0;
    lifecycle.onDeviceLost(() => { lostCount += 1; });
    expect(lostCount).toBe(0);
    resolveLost({ reason: "unknown", message: "gpu reset" });
    await flush();
    expect(lostCount).toBe(1);
    expect(device.getDiagnostics()).toMatchObject({ contextLost: true });
  });

  it("Renderer.onDeviceLost (the app-facing delegate) forwards the WebGPU loss; restore is not synthesized", async () => {
    const { webgpu, resolveLost } = await lostDevice();
    const renderer = await Renderer.create({ backend: "webgpu", webgpu, width: 4, height: 4 });
    let lostCount = 0;
    let restoredCount = 0;
    const unsubscribe = renderer.onDeviceLost(() => { lostCount += 1; });
    renderer.onDeviceRestored(() => { restoredCount += 1; });
    resolveLost({ reason: "destroyed", message: "unit" });
    await flush();
    expect(lostCount).toBe(1);
    expect(restoredCount).toBe(0);
    expect(renderer.isDeviceLost()).toBe(true);
    unsubscribe();
  });

  it("an unsubscribed listener does not fire", async () => {
    const { webgpu, resolveLost } = await lostDevice();
    const device = await createRenderDevice({ backend: "webgpu", webgpu });
    const lifecycle = device as typeof device & { onDeviceLost(listener: () => void): () => void };
    let lostCount = 0;
    const unsubscribe = lifecycle.onDeviceLost(() => { lostCount += 1; });
    unsubscribe();
    resolveLost({ reason: "destroyed", message: "unit" });
    await flush();
    expect(lostCount).toBe(0);
  });
});

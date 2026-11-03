import { describe, expect, it, vi } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { Texture } from "../../../packages/rendering/src/Texture";

async function fixture() {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  const handles: { readonly descriptor: { readonly label?: string; readonly usage: number; readonly sampleCount?: number }; readonly destroy: ReturnType<typeof vi.fn>; createView(descriptor?: object): unknown }[] = [];
  const samplers: object[] = [];
  let failSubmit = false;
  const native = {
    queue: { writeBuffer() {}, writeTexture() {}, submit: vi.fn(() => { if (failSubmit) { failSubmit = false; throw new Error("injected queue failure"); } }), onSubmittedWorkDone: () => fence },
    createBuffer: ({ size, usage }: { readonly size: number; readonly usage: number }) => ({ size, usage, destroy() {} }),
    createTexture(descriptor: { readonly label?: string; readonly usage: number; readonly sampleCount?: number }) {
      const handle = { descriptor, destroy: vi.fn(), createView: (view?: object) => ({ handle, view }) };
      handles.push(handle); return handle;
    },
    createSampler(descriptor: object) { samplers.push(descriptor); return { descriptor }; },
    destroy: vi.fn()
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, native, handles, samplers, finish, failNextSubmit: () => { failSubmit = true; } };
}

describe("borrowed native deferred surfaces", () => {
  it.each([1, 4])("leases %sx color, depth and optional resolve until the queue fence", async sampleCount => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ label: "deferred-hdr", width: 4, height: 3, format: "rgba16f", depth: true, sampleCount });
    const depth = f.handles.find(handle => handle.descriptor.label === "deferred-hdr-depth")!;
    expect(depth.descriptor.usage & 0x14).toBe(0x14);
    expect(depth.descriptor.sampleCount).toBe(sampleCount);
    expect(target.depthTexture).toBeUndefined();
    expect(Boolean(target.multisampledDepthTexture)).toBe(sampleCount === 4);
    const multisampledDepth = target.multisampledDepthTexture;
    if (multisampledDepth) expect(f.device.getNativeTexture(multisampledDepth)).toBe(depth);
    f.device.beginFrame(4, 3); f.device.setRenderTarget(target);
    const lease = f.device.getNativeDeferredSurface(target);
    expect(lease).toMatchObject({ width: 4, height: 3, sampleCount, colorFormat: "rgba16float", depthFormat: "depth24plus-stencil8", loadOp: "clear", clearColor: [0, 0, 0, 1], depthClearValue: 1, stencilClearValue: 0 });
    expect(lease.depthSampleView).toMatchObject({ handle: depth, view: { aspect: "depth-only" } });
    expect(Boolean(lease.resolveView)).toBe(sampleCount === 4);
    lease.submit([{ label: "deferred-command" }]);
    expect(f.native.queue.submit).toHaveBeenCalledWith([{ label: "deferred-command" }]);
    expect(() => lease.submit([{ label: "again" }])).toThrow(/stale/i);
    expect(f.device.getNativeDeferredSurface(target).loadOp).toBe("load");
    f.device.endFrame(); target.dispose();
    if (multisampledDepth) expect(multisampledDepth.disposed).toBe(true);
    expect(f.handles.every(handle => handle.destroy.mock.calls.length === 0)).toBe(true);
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(f.handles.every(handle => handle.destroy.mock.calls.length === 1)).toBe(true);
    f.device.dispose();
  });

  it("rejects foreign, missing-depth, changed-target and stale-frame leases before submission", async () => {
    const f = await fixture(); const other = await fixture();
    const first = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
    const second = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
    const noDepth = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    f.device.beginFrame(2, 2); f.device.setRenderTarget(first);
    expect(() => f.device.getNativeDeferredSurface(noDepth)).toThrow(/active target/i);
    const lease = f.device.getNativeDeferredSurface(first);
    f.device.setRenderTarget(second);
    expect(() => lease.submit([{}])).toThrow(/stale/i);
    f.device.setRenderTarget(noDepth);
    expect(() => f.device.getNativeDeferredSurface(noDepth)).toThrow(/color and depth/i);
    other.device.beginFrame(2, 2);
    expect(() => other.device.getNativeDeferredSurface(first)).toThrow(/not created/i);
    other.device.endFrame();
    f.device.setRenderTarget(second);
    const oldFrame = f.device.getNativeDeferredSurface(second);
    f.device.endFrame(); f.device.beginFrame(2, 2); f.device.setRenderTarget(second);
    expect(() => oldFrame.submit([{}])).toThrow(/stale/i);
    f.device.endFrame(); f.device.dispose(); other.device.dispose(); f.finish(); other.finish();
  });

  it("does not consume the lease or clear bookkeeping when queue submission throws", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
    f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
    const lease = f.device.getNativeDeferredSurface(target);
    f.failNextSubmit();
    expect(() => lease.submit([{}])).toThrow("injected queue failure");
    expect(f.device.getNativeDeferredSurface(target).loadOp).toBe("clear");
    lease.submit([{}]);
    expect(f.device.getNativeDeferredSurface(target).loadOp).toBe("load");
    f.device.endFrame(); f.device.dispose(); f.finish();
  });

  it("validates and fence-retains borrowed probe reads without allowing attachment aliasing", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: true });
    const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
    const probe = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", dimension: "cube",
      cubeFaces: faces.map(face => ({ face, mipLevels: [{ width: 1, height: 1, data: new Uint16Array(4) }] })) });
    const borrowedProbe = f.device.getNativeDeferredProbe(probe);
    const probeHandle = borrowedProbe.resource as unknown as { readonly destroy: ReturnType<typeof vi.fn> };
    expect(borrowedProbe.device).toBe(f.native);
    expect(borrowedProbe.view).toMatchObject({ handle: probeHandle, view: { dimension: "cube" } });
    expect(f.samplers).toContainEqual({ minFilter: "linear", magFilter: "linear", mipmapFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", addressModeW: "clamp-to-edge" });
    expect(() => borrowedProbe.assertUsable()).not.toThrow();
    f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
    const lease = f.device.getNativeDeferredSurface(target);
    expect(() => lease.submit([{}], [{}])).toThrow(/FOREIGN_RESOURCE/);
    expect(() => lease.submit([{}], [f.device.getNativeTexture(target.colorTexture)])).toThrow(/alias/i);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    lease.submit([{}], [probeHandle]);
    probe.dispose();
    expect(() => borrowedProbe.assertUsable()).toThrow(/disposed/i);
    expect(probeHandle.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(probeHandle.destroy).toHaveBeenCalledOnce();
    f.device.endFrame(); f.device.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

type Texture = { readonly label: string; readonly descriptor: Record<string, unknown>; createView(): { texture: Texture }; destroy(): void };

async function makeDevice(copyAvailable = true) {
  const events: Array<{ name: string; args: any[] }> = [];
  const native = {
    features: new Set<string>(),
    queue: { submit(commands: readonly unknown[]) { events.push({ name: "submit", args: [...commands] }); }, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
    createTexture: (descriptor: Record<string, unknown>) => {
      const texture: Texture = { label: String(descriptor.label), descriptor, createView() { return { texture }; }, destroy() {} };
      return texture;
    },
    createShaderModule: () => ({}), createRenderPipeline: () => ({}), createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginRenderPass(descriptor: Record<string, any>) {
        events.push({ name: "clear", args: [descriptor.colorAttachments[0].view.texture.label] });
        return { setPipeline() {}, setVertexBuffer() {}, draw() {}, end() {} };
      },
      ...(copyAvailable ? { copyTextureToTexture: (...args: unknown[]) => events.push({ name: "copy", args }) } : {}),
      finish: () => ({})
    })
  };
  const adapter = { requestDevice: async () => native as unknown as WebGPUDeviceLike };
  const device = await WebGPUDevice.create({ adapter, device: native as unknown as WebGPUDeviceLike });
  return { device, events };
}

describe("WebGPU color-region copies", () => {
  it("flushes both pending clears, converts bottom-left coordinates, and submits six ordered copies", async () => {
    const { device, events } = await makeDevice();
    const source = device.createRenderTarget({ label: "face", width: 16, height: 12, format: "rgba16f" });
    const destination = device.createRenderTarget({ label: "atlas", width: 48, height: 24, format: "rgba16f" });
    device.beginFrame(48, 24); device.setRenderTarget(destination);
    for (let face = 0; face < 6; face++) {
      device.copyRenderTargetColorRegion(source, destination, { sourceX: 2, sourceY: 3, destinationX: (face % 3) * 16, destinationY: Math.floor(face / 3) * 12, width: 8, height: 4 });
    }
    expect(device.getRenderTarget()).toBe(destination);
    expect(events.filter((event) => event.name === "clear").map((event) => event.args[0])).toEqual(["face", "atlas"]);
    const copies = events.filter((event) => event.name === "copy");
    expect(copies).toHaveLength(6);
    expect(copies[0]!.args[0]).toMatchObject({ texture: { label: "face" }, origin: { x: 2, y: 5 } });
    expect(copies[0]!.args[1]).toMatchObject({ texture: { label: "atlas" }, origin: { x: 0, y: 20 } });
    expect(copies[5]!.args[1]).toMatchObject({ origin: { x: 32, y: 8 } });
    expect(copies[0]!.args[2]).toEqual({ width: 8, height: 4, depthOrArrayLayers: 1 });
    const kinds = events.map((event) => event.name);
    expect(kinds).toEqual(["clear", "submit", "clear", "submit", "copy", "submit", "copy", "submit", "copy", "submit", "copy", "submit", "copy", "submit", "copy", "submit"]);
    device.endFrame(); device.dispose();
  });

  it("rejects unsupported, foreign, stale, mismatched and out-of-bounds copies before submission", async () => {
    const { device, events } = await makeDevice();
    const other = await makeDevice();
    const source = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f" });
    const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f" });
    const mismatch = device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    const msaa = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", sampleCount: 4 });
    const foreign = other.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f" });
    const region = { sourceX: 0, sourceY: 0, destinationX: 0, destinationY: 0, width: 4, height: 4 };
    expect(() => device.copyRenderTargetColorRegion(source, source, region)).toThrow(/distinct/);
    expect(() => device.copyRenderTargetColorRegion(source, mismatch, region)).toThrow(/matching formats/);
    expect(() => device.copyRenderTargetColorRegion(source, msaa, region)).toThrow(/single-sample/);
    expect(() => device.copyRenderTargetColorRegion(source, foreign, region)).toThrow(/not created/);
    for (const bad of [{ ...region, width: 0 }, { ...region, sourceY: -1 }, { ...region, destinationX: 1 }, { ...region, height: 1.5 }, { ...region, sourceX: Infinity }]) {
      expect(() => device.copyRenderTargetColorRegion(source, target, bad)).toThrow(/bounds/);
    }
    source.dispose();
    expect(() => device.copyRenderTargetColorRegion(source, target, region)).toThrow(/disposed/);
    expect(events).toHaveLength(0);
    device.dispose(); other.device.dispose();

    const unavailable = await makeDevice(false);
    const a = unavailable.device.createRenderTarget({ width: 1, height: 1 }), b = unavailable.device.createRenderTarget({ width: 1, height: 1 });
    expect(() => unavailable.device.copyRenderTargetColorRegion(a, b, { ...region, width: 1, height: 1 })).toThrow(/unavailable/);
    expect(unavailable.events).toHaveLength(0);
    unavailable.device.dispose();
  });
});

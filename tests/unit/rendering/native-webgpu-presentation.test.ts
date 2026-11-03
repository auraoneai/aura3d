import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUCanvasConfigurationLike, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";

// Records actual native device descriptors and queue ordering; it does not
// execute WGSL or establish canvas pixels or physical-device behavior.
async function fixture(options: { readonly canvas?: boolean; readonly alpha?: "opaque" | "premultiplied"; readonly format?: string } = {}) {
  const passes: WebGPURenderPassDescriptorLike[] = [];
  const pipelines: WebGPURenderPipelineDescriptorLike[] = [];
  const groups: Array<{ readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }> = [];
  const writes = new Map<object, Uint8Array>();
  const events: string[] = [];
  const fences: Array<() => void> = [];
  const textures: Array<{ readonly label: string; destroyed: number; createView(): object; destroy(): void }> = [];
  let inSubmit = false;
  let failSubmit = false;
  let onSubmit: (() => void) | undefined;
  let onDraw: (() => void) | undefined;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        writes.set(buffer, new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer, data instanceof ArrayBuffer ? 0 : data.byteOffset,
          data instanceof ArrayBuffer ? data.byteLength : data.byteLength).slice());
      },
      submit(commands: readonly unknown[]) {
        if (!commands.length) return;
        inSubmit = true; events.push("submit-start");
        try { onSubmit?.(); events.push("queued"); if (failSubmit) throw new Error("injected queue failure"); }
        finally { inSubmit = false; events.push("submit-end"); }
      },
      onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: { readonly label?: string }) {
      const texture = { label: descriptor.label ?? "", destroyed: 0, createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) { groups.push(descriptor); return descriptor; },
    createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        passes.push(descriptor);
        return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw(count: number) { events.push(`draw:${count}`); onDraw?.(); }, end() {} };
      }, finish: () => ({}) };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  let configuration: WebGPUCanvasConfigurationLike | null = null;
  let canvasTexture = makeCanvasTexture(options.format ?? "bgra8unorm");
  const context = {
    configure(value: WebGPUCanvasConfigurationLike) { configuration = value; },
    getConfiguration: () => configuration,
    getCurrentTexture: () => canvasTexture,
    unconfigure() { configuration = null; }
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native,
    ...(options.canvas === false ? {} : { canvas: { getContext: () => context } as unknown as HTMLCanvasElement,
      presentationAlphaMode: options.alpha ?? "opaque", presentationFormat: options.format ?? "bgra8unorm" }) });
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, native, context, textures, passes, pipelines, groups, writes, events, finishFences, lose,
    currentCanvas: () => canvasTexture,
    replaceCanvas() { canvasTexture = makeCanvasTexture(options.format ?? "bgra8unorm"); },
    setCanvasTexture(texture: unknown) { canvasTexture = texture as typeof canvasTexture; },
    setConfiguration(value: WebGPUCanvasConfigurationLike | null) { configuration = value; },
    onSubmit(callback?: () => void) { onSubmit = callback; }, onDraw(callback?: () => void) { onDraw = callback; },
    failSubmission(value: boolean) { failSubmit = value; },
    async close() { onSubmit = undefined; onDraw = undefined; failSubmit = false; await finishFences(); if (!device.disposed) device.dispose(); await finishFences(); } };
}

function makeCanvasTexture(format: string) {
  const view = { canvas: true };
  return { format, usage: 0x10, sampleCount: 1, view, createView() { return view; }, destroy() {} };
}

function source(device: WebGPUDevice): RenderTarget {
  return device.createRenderTarget({ label: "present-source", width: 4, height: 2, format: "rgba8", depth: false });
}

describe("WebGPU render-target presentation", () => {
  it("submits a source-bound fullscreen pass to the actual canvas view", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      f.device.beginFrame(4, 2); f.device.setRenderTarget(target); f.device.clear([0.1, 0.2, 0.3, 1]); f.device.endFrame();
      const sourceNative = f.device.getNativeTexture(target.colorTexture);
      f.device.presentRenderTarget(target);
      expect(f.passes).toHaveLength(2);
      expect(f.passes[0]!.colorAttachments[0]!.loadOp).toBe("clear");
      expect(f.passes[1]!.colorAttachments[0]!.view).toBe(f.currentCanvas().view);
      expect(f.pipelines.at(-1)!.fragment!.targets[0]!.format).toBe("bgra8unorm");
      const group = f.groups.at(-1)!;
      expect((group.entries.find((entry) => entry.binding === 2)!.resource as { texture: object }).texture).toBe(sourceNative);
      const uniform = group.entries.find((entry) => entry.binding === 0)!.resource as { buffer: object };
      expect(Array.from(new Float32Array(f.writes.get(uniform.buffer)!.buffer))).toEqual([0.25, 0.5, 0, 1]);
      expect(f.events.filter((event) => event === "draw:3")).toHaveLength(1);
      expect(f.events.filter((event) => event === "queued")).toHaveLength(2);
      expect(f.device.getRenderTarget()).toBeNull();
      expect(f.device.captureState().get("canvasSubmissions")).toBe(1);
      await expect(f.device.readPixelsAsync(0, 0, 1, 1)).rejects.toThrow(/active native render target/i);
      target.dispose(); await f.finishFences();
    } finally { await f.close(); }
  });

  it("selects unmodified RGB and opaque output for a source with partial alpha", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      const sample = [0.2, 0.4, 0.6, 0.25] as const;
      f.device.beginFrame(4, 2); f.device.setRenderTarget(target); f.device.clear(sample); f.device.endFrame();
      f.device.presentRenderTarget(target);

      // The mock records the source clear and the real pass configuration; it
      // does not execute WGSL or claim a canvas pixel result.
      expect(f.passes[0]!.colorAttachments[0]!.clearValue).toEqual(sample);
      expect(f.passes[1]!.colorAttachments[0]!.view).toBe(f.currentCanvas().view);
      const fragment = f.pipelines.at(-1)!.fragment!;
      const code = (fragment.module as { readonly code: string }).code;
      expect(code).toContain("select(c.rgb, c.rgb * c.a, params.z > 0.5)");
      expect(code).toContain("select(c.a, 1.0, params.w > 0.5)");
      expect(fragment.targets[0]!.blend).toBeUndefined();
      const uniform = f.groups.at(-1)!.entries.find((entry) => entry.binding === 0)!.resource as { buffer: object };
      expect(Array.from(new Float32Array(f.writes.get(uniform.buffer)!.buffer)).slice(2)).toEqual([0, 1]);
      expect(f.events.filter((event) => event === "draw:3")).toHaveLength(1);
      target.dispose(); await f.finishFences();
    } finally { await f.close(); }
  });

  it("fails closed without a compatible opaque canvas or compatible source", async () => {
    const noCanvas = await fixture({ canvas: false });
    try {
      const target = source(noCanvas.device);
      expect(() => noCanvas.device.presentRenderTarget(target)).toThrow(/canvas surface is unavailable/i);
      expect(noCanvas.events.filter((event) => event === "queued")).toHaveLength(0);
      target.dispose();
    } finally { await noCanvas.close(); }
    const transparent = await fixture({ alpha: "premultiplied" });
    try {
      const target = source(transparent.device);
      expect(() => transparent.device.presentRenderTarget(target)).toThrow(/opaque canvas/i);
      expect(transparent.events.filter((event) => event === "queued")).toHaveLength(0);
      target.dispose();
    } finally { await transparent.close(); }
    const unsupportedFormat = await fixture({ format: "rgba16float" });
    try {
      const target = source(unsupportedFormat.device);
      expect(() => unsupportedFormat.device.presentRenderTarget(target)).toThrow(/canvas/i);
      target.dispose();
    } finally { await unsupportedFormat.close(); }
    const badSource = await fixture();
    try {
      const target = badSource.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
      expect(() => badSource.device.presentRenderTarget(target)).toThrow(/requires rgba8/i);
      target.dispose();
    } finally { await badSource.close(); }
  });

  it("rejects an unconfigured canvas and a changed canvas texture before queue submission", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      f.setConfiguration(null);
      expect(() => f.device.presentRenderTarget(target)).toThrow(/not configured/i);
      expect(f.events.filter((event) => event === "queued")).toHaveLength(0);
      f.setConfiguration({ device: f.native, format: "bgra8unorm", alphaMode: "opaque", colorSpace: "srgb" });
      f.onDraw(() => f.replaceCanvas());
      expect(() => f.device.presentRenderTarget(target)).toThrow(/changed before submission/i);
      expect(f.events.filter((event) => event === "queued")).toHaveLength(1); // Initial source clear only.
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
      target.dispose();
    } finally { await f.close(); }
  });

  it("rejects a canvas texture that aliases any device-owned resource", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      const other = source(f.device);
      f.setCanvasTexture(f.device.getNativeTexture(other.colorTexture));
      expect(() => f.device.presentRenderTarget(target)).toThrow(/aliases a device-owned resource/i);
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
      expect(f.events.filter((event) => event === "draw:3")).toHaveLength(0);
      target.dispose(); other.dispose();
    } finally { await f.close(); }
  });

  it("rejects foreign or disposed sources, lost devices and unsupported canvas viewport overrides", async () => {
    const first = await fixture();
    const second = await fixture();
    try {
      const foreign = source(first.device);
      expect(() => second.device.presentRenderTarget(foreign)).toThrow(/not created by this WebGPU device/i);
      expect(second.events.filter((event) => event === "queued")).toHaveLength(0);
      foreign.dispose();
      expect(() => first.device.presentRenderTarget(foreign)).toThrow(/disposed/i);
      const target = source(first.device);
      first.device.beginFrame(4, 2);
      first.device.setViewport(0, 0, 2, 2);
      expect(() => first.device.presentRenderTarget(target)).toThrow(/viewport or scissor/i);
      first.device.endFrame();
      first.lose(); await Promise.resolve(); await Promise.resolve();
      expect(() => first.device.presentRenderTarget(target)).toThrow(/lost/i);
      target.dispose();
    } finally { await first.close(); await second.close(); }
  });

  it("keeps its source alive through a reentrant submission and retires it after the fence", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      f.device.beginFrame(4, 2); f.device.setRenderTarget(target); f.device.clear([0, 0, 0, 1]);
      // Initialize before installing the callback so it runs on presentation.
      f.device.clearRenderTarget([0, 0, 0, 1], 0);
      f.onSubmit(() => {
        f.onSubmit(undefined);
        expect(() => f.device.clear([1, 0, 0, 1])).toThrow(/cannot be reentered/i);
        target.dispose();
        expect(f.textures.find((texture) => texture.label === "present-source")!.destroyed).toBe(0);
      });
      f.device.presentRenderTarget(target);
      expect(f.events).not.toContain("fence-during-submit");
      expect(f.events.lastIndexOf("submit-end")).toBeLessThan(f.events.lastIndexOf("fence-after-submit"));
      await f.finishFences();
      expect(f.textures.find((texture) => texture.label === "present-source")!.destroyed).toBe(1);
      f.device.endFrame();
    } finally { await f.close(); }
  });

  it("does not report successful presentation or replay after a queue failure", async () => {
    const f = await fixture();
    try {
      const target = source(f.device);
      f.device.beginFrame(4, 2); f.device.setRenderTarget(target);
      f.device.clearRenderTarget([0, 0, 0, 1], 0);
      const before = f.events.filter((event) => event === "queued").length;
      f.failSubmission(true);
      expect(() => f.device.presentRenderTarget(target)).toThrow("injected queue failure");
      expect(f.events.filter((event) => event === "queued")).toHaveLength(before + 1);
      expect(f.device.getRenderTarget()).toBe(target);
      expect(f.device.captureState().get("canvasSubmissions")).toBe(0);
      f.failSubmission(false); f.device.endFrame(); target.dispose();
    } finally { await f.close(); }
  });
});

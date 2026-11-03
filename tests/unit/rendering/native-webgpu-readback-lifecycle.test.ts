import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

// This mock records queue ordering and mapped-buffer lifetime; it is not a GPU.
async function fixture() {
  const events: string[] = [];
  const fences: Array<() => void> = [];
  const buffers: Array<{ label: string; destroyed: number; mapAsync(): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void; destroy(): void }> = [];
  const textures: Array<{ label: string; destroyed: number; createView(): object; destroy(): void }> = [];
  let inSubmit = false, failSubmit = false;
  let onSubmit: (() => void) | undefined, onCopy: (() => void) | undefined;
  let resolveMap!: () => void, rejectMap!: (reason: Error) => void;
  const mapping = new Promise<void>((resolve, reject) => { resolveMap = resolve; rejectMap = reject; });
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    queue: {
      writeBuffer() {},
      submit(commands: readonly unknown[]) {
        if (!commands.length) return;
        inSubmit = true; events.push("submit-start");
        try { onSubmit?.(); if (failSubmit) throw new Error("injected submit failure"); }
        finally { inSubmit = false; events.push("submit-end"); }
      },
      onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer(descriptor: { label?: string; size: number }) {
      const data = new Uint8Array(descriptor.size); data.set([64, 128, 192, 255].slice(0, descriptor.size));
      const buffer = { label: descriptor.label ?? "", destroyed: 0, mapAsync: () => mapping,
        getMappedRange: () => data.buffer, unmap() { events.push("unmap"); }, destroy() { buffer.destroyed += 1; } };
      buffers.push(buffer); return buffer;
    },
    createTexture(descriptor: { label?: string }) {
      const texture = { label: descriptor.label ?? "", destroyed: 0, createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createCommandEncoder() {
      return { beginRenderPass: () => ({ end() {} }), copyTextureToBuffer() { events.push("copy"); onCopy?.(); }, finish: () => ({}) };
    }
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  const target = device.createRenderTarget({ label: "readback-source", width: 1, height: 1, format: "rgba8", depth: false });
  device.beginFrame(1, 1); device.setRenderTarget(target); device.clearRenderTarget([0, 0, 0, 1], 0);
  events.length = 0;
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, target, buffers, textures, events, finishFences, resolveMap, rejectMap, lose,
    onSubmit(callback?: () => void) { onSubmit = callback; }, onCopy(callback?: () => void) { onCopy = callback; },
    failSubmission(value: boolean) { failSubmit = value; },
    async close() { onSubmit = undefined; onCopy = undefined; failSubmit = false; if (!device.disposed) device.dispose(); await finishFences(); } };
}

describe("WebGPU readback resource lifetime", () => {
  for (const mode of ["bytes", "floats"] as const) {
    it(`retains ${mode} readback resources through a reentrant source disposal`, async () => {
      const f = await fixture();
      try {
        f.onSubmit(() => {
          f.onSubmit(undefined);
          f.target.dispose();
          expect(f.textures[0]!.destroyed).toBe(0);
          expect(() => f.device.dispose()).toThrow(/cannot interrupt/i);
        });
        const pending = mode === "bytes" ? f.device.readPixelsAsync(0, 0, 1, 1) : f.device.readFloatPixelsAsync(0, 0, 1, 1);
        const staging = f.buffers.find((buffer) => buffer.label.includes("native-") && buffer.label.includes("readback") && !buffer.label.includes("probe"))!;
        expect(f.events).not.toContain("fence-during-submit");
        expect(f.events.lastIndexOf("submit-end")).toBeLessThan(f.events.lastIndexOf("fence-after-submit"));
        expect(staging.destroyed).toBe(0);
        await f.finishFences();
        expect(f.textures[0]!.destroyed).toBe(1);
        expect(staging.destroyed).toBe(0);
        f.resolveMap();
        const pixels = await pending;
        if (mode === "bytes") expect(Array.from(pixels)).toEqual([64, 128, 192, 255]);
        else expect(Array.from(pixels)).toEqual([64 / 255, 128 / 255, 192 / 255, 1].map(Math.fround));
        expect(staging.destroyed).toBe(0);
        await f.finishFences();
        expect(staging.destroyed).toBe(1);
      } finally { await f.close(); }
    });
  }

  it("rejects a source disposed during encoding without submitting the copy", async () => {
    const f = await fixture();
    try {
      f.onCopy(() => f.target.dispose());
      await expect(f.device.readPixelsAsync(0, 0, 1, 1)).rejects.toThrow(/disposed/i);
      expect(f.events).not.toContain("submit-start");
      const staging = f.buffers.find((buffer) => buffer.label === "readback-source-native-readback")!;
      expect(staging.destroyed).toBe(0);
      await f.finishFences();
      expect(staging.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("retires the staging buffer after a failed submission and preserves the failure", async () => {
    const f = await fixture();
    try {
      f.failSubmission(true);
      await expect(f.device.readPixelsAsync(0, 0, 1, 1)).rejects.toThrow("injected submit failure");
      const staging = f.buffers.find((buffer) => buffer.label === "readback-source-native-readback")!;
      expect(staging.destroyed).toBe(0);
      await f.finishFences();
      expect(staging.destroyed).toBe(1);
      f.failSubmission(false); f.target.dispose();
    } finally { await f.close(); }
  });

  it("preserves mapping failure on device loss and releases its staging buffer", async () => {
    const f = await fixture();
    try {
      const pending = f.device.readPixelsAsync(0, 0, 1, 1);
      const rejection = expect(pending).rejects.toThrow("injected map failure");
      const staging = f.buffers.find((buffer) => buffer.label === "readback-source-native-readback")!;
      f.lose(); await Promise.resolve(); await Promise.resolve();
      f.rejectMap(new Error("injected map failure"));
      await rejection;
      expect(staging.destroyed).toBe(1);
    } finally { await f.close(); }
  });
});

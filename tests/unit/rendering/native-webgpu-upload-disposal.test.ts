import { describe, expect, it } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPUResidencyMip } from "../../../packages/rendering/src/WebGPUDevice";
import type { TextureResidencySource } from "../../../packages/assets/src/TextureResidencyController";

// Queue callbacks model synchronous reentrancy; no GPU or WGSL is executed.
async function fixture() {
  const events: string[] = [];
  const fences: Array<() => void> = [];
  const textures: Array<{ label: string; destroyed: number; createView(): object; destroy(): void }> = [];
  let inWrite = false;
  let onWrite: (() => void) | undefined;
  const native = {
    features: new Set<string>(),
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture() {
        inWrite = true; events.push("write-start");
        try { onWrite?.(); } finally { inWrite = false; events.push("write-end"); }
      },
      onSubmittedWorkDone() {
        events.push(inWrite ? "fence-during-write" : "fence-after-write");
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: { label?: string }) {
      const result = { label: descriptor.label ?? "", destroyed: 0, createView() { return { texture: result }; }, destroy() { result.destroyed += 1; } };
      textures.push(result); return result;
    }
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  const adapter = device.createTextureResidencyAdapter();
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, adapter, events, textures, finishFences,
    onWrite(callback?: () => void) { onWrite = callback; },
    async close() { onWrite = undefined; if (!device.disposed) device.dispose(); await finishFences(); } };
}

function mipTexture(): Texture {
  return new Texture({ label: "mipped", width: 4, height: 4, generateMipmaps: false, mipLevels: [
    { width: 4, height: 4, data: new Uint8Array(64) },
    { width: 2, height: 2, data: new Uint8Array(16) }
  ] });
}

function source(texture: Texture): TextureResidencySource<WebGPUResidencyMip> {
  return { texture, identity: {}, fallback: [1, 2, 3, 255], levels: [
    { width: 4, height: 4, bytes: 64 }, { width: 2, height: 2, bytes: 16 }
  ], async loadMip(level) { const size = level ? 2 : 4; return { value: { data: new Uint8Array(size * size * 4) }, release() {} }; } };
}

function tracked(device: WebGPUDevice) {
  return device as unknown as { nativeSampledTextures: Map<Texture, unknown>; nativeSampledTextureDisposers: Map<Texture, unknown>;
    nativeSampledTextureRevisions: Map<Texture, unknown>; nativeSubresourceRevisions: Map<Texture, unknown>; nativeStreamingLeases: Map<Texture, unknown> };
}

describe("WebGPU disposal during texture upload", () => {
  it("stops a multi-mip initial upload and retains its native allocation until the fence", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture();
      f.onWrite(() => texture.dispose());
      expect(() => f.device.getNativeTexture(texture)).toThrow(/disposed/i);
      expect(f.events.filter((event) => event === "write-start")).toHaveLength(1);
      expect(f.events).not.toContain("fence-during-write");
      expect(f.textures[0]!.destroyed).toBe(0);
      expect(f.adapter.usageBytes()).toBe(80);
      expect(tracked(f.device).nativeSampledTextures.has(texture)).toBe(false);
      expect(tracked(f.device).nativeSampledTextureDisposers.has(texture)).toBe(false);
      expect(tracked(f.device).nativeSubresourceRevisions.has(texture)).toBe(false);
      await f.finishFences();
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(f.adapter.usageBytes()).toBe(0);
    } finally { await f.close(); }
  });

  it("stops before uploading additional cube faces after disposal", async () => {
    const f = await fixture();
    try {
      const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
      const texture = new Texture({ width: 2, height: 2, dimension: "cube", generateMipmaps: false,
        cubeFaces: faces.map((face) => ({ face, mipLevels: [{ width: 2, height: 2, data: new Uint8Array(16) }] })) });
      f.onWrite(() => texture.dispose());
      expect(() => f.device.getNativeTexture(texture)).toThrow(/disposed/i);
      expect(f.events.filter((event) => event === "write-start")).toHaveLength(1);
      expect(tracked(f.device).nativeSubresourceRevisions.has(texture)).toBe(false);
      expect(f.adapter.usageBytes()).toBe(96);
      await f.finishFences();
      expect(f.adapter.usageBytes()).toBe(0);
    } finally { await f.close(); }
  });

  it("does not retain an immediately fired disposal subscription", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture();
      const subscribe = texture.onDispose.bind(texture);
      texture.onDispose = (listener) => { texture.dispose(); return subscribe(listener); };
      expect(() => f.device.getNativeTexture(texture)).toThrow(/disposed/i);
      expect(tracked(f.device).nativeSampledTextureDisposers.has(texture)).toBe(false);
      expect(tracked(f.device).nativeSampledTextures.has(texture)).toBe(false);
      expect(f.adapter.usageBytes()).toBe(80);
      await f.finishFences();
      expect(f.adapter.usageBytes()).toBe(0);
      expect(f.textures[0]!.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("defers disposal until an in-place upload returns and leaves no revision entries", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture();
      f.device.getNativeTexture(texture);
      texture.updateMip(0, new Uint8Array(64).fill(1));
      f.onWrite(() => { texture.dispose(); expect(f.textures[0]!.destroyed).toBe(0); });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/disposed/i);
      expect(f.events).not.toContain("fence-during-write");
      expect(f.events.at(-1)).toBe("fence-after-write");
      expect(tracked(f.device).nativeSampledTextureDisposers.has(texture)).toBe(false);
      expect(tracked(f.device).nativeSampledTextureRevisions.has(texture)).toBe(false);
      expect(tracked(f.device).nativeSubresourceRevisions.has(texture)).toBe(false);
      expect(f.adapter.usageBytes()).toBe(80);
      await f.finishFences();
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(f.adapter.usageBytes()).toBe(0);
    } finally { await f.close(); }
  });

  it("does not publish a streaming fallback disposed during preparation", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture(), input = source(texture);
      f.onWrite(() => texture.dispose());
      expect(() => f.adapter.prepare(input, { generation: f.adapter.generation(), maxBytes: 100 })).toThrow(/disposed/i);
      expect(tracked(f.device).nativeStreamingLeases.has(texture)).toBe(false);
      expect(f.events).not.toContain("fence-during-write");
      expect(f.adapter.usageBytes()).toBe(4);
      await f.finishFences();
      expect(f.adapter.usageBytes()).toBe(0);
      expect(f.textures[0]!.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("does not publish a streaming fallback when subscription fires immediately", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture(), input = source(texture);
      const subscribe = texture.onDispose.bind(texture);
      texture.onDispose = (listener) => { texture.dispose(); return subscribe(listener); };
      expect(() => f.adapter.prepare(input, { generation: f.adapter.generation(), maxBytes: 100 })).toThrow(/disposed/i);
      expect(tracked(f.device).nativeStreamingLeases.has(texture)).toBe(false);
      expect(f.adapter.usageBytes()).toBe(4);
      await f.finishFences();
      expect(f.adapter.usageBytes()).toBe(0);
      expect(f.textures[0]!.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("stops a streaming mip tail when its source is disposed during upload", async () => {
    const f = await fixture();
    try {
      const texture = mipTexture(), input = source(texture);
      f.adapter.prepare(input, { generation: f.adapter.generation(), maxBytes: 100 });
      f.onWrite(() => texture.dispose());
      const pending = f.adapter.allocate(input, [
        { level: 0, value: { data: new Uint8Array(64) } }, { level: 1, value: { data: new Uint8Array(16) } }
      ], { maxBytes: 100, signal: new AbortController().signal });
      const rejection = expect(pending).rejects.toThrow(/disposed/i);
      expect(f.events.filter((event) => event === "write-start")).toHaveLength(2);
      expect(tracked(f.device).nativeStreamingLeases.has(texture)).toBe(false);
      expect(f.textures[1]!.destroyed).toBe(0);
      expect(f.adapter.usageBytes()).toBe(84);
      await f.finishFences();
      await rejection;
      expect(f.adapter.usageBytes()).toBe(0);
      expect(f.textures.every((texture) => texture.destroyed === 1)).toBe(true);
    } finally { await f.close(); }
  });
});

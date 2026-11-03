import { describe, expect, it, vi } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

type Native = { label?: string; mipLevelCount?: number; format: string; destroyed: number; createView(): object; destroy(): void };
type Write = { texture: Native; mipLevel: number; bytes: number[]; width: number; height: number; bytesPerRow: number };

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}

// queue callbacks model synchronous reentrancy; no GPU or shader executes.
async function fixture(options: { maxBytes?: number; maxDimension?: number } = {}) {
  const writes: Write[] = [], textures: Native[] = [], fences: Array<ReturnType<typeof deferred>> = [];
  const loss = deferred();
  let onWrite: ((write: Write) => void) | undefined;
  const native = {
    features: new Set<string>(),
    limits: options.maxDimension === undefined ? {} : { maxTextureDimension2D: options.maxDimension },
    lost: loss.promise.then(() => ({ reason: "destroyed" })),
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture(destination: { texture: Native; mipLevel?: number }, data: ArrayBufferView,
        layout: { bytesPerRow: number }, size: { width: number; height: number }) {
        const write = { texture: destination.texture, mipLevel: destination.mipLevel ?? 0,
          bytes: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
          width: size.width, height: size.height, bytesPerRow: layout.bytesPerRow };
        writes.push(write);
        onWrite?.(write);
      },
      onSubmittedWorkDone() { const fence = deferred(); fences.push(fence); return fence.promise; }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: { label?: string; mipLevelCount?: number; format: string }) {
      const texture: Native = { ...descriptor, destroyed: 0, createView: () => ({ texture }), destroy() { this.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native,
    ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const finishFences = async () => { for (const fence of fences.splice(0)) fence.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, writes, textures, loss, finishFences,
    onWrite(callback?: (write: Write) => void) { onWrite = callback; },
    async close() { onWrite = undefined; if (!device.disposed) device.dispose(); await finishFences(); } };
}

function rgba(width: number, height: number, pixel: readonly [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(pixel, offset);
  return data;
}

describe("native WebGPU sampled raw-data mipmaps", () => {
  it("allocates and writes a full RGBA8 chain with linear, unassociated alpha", async () => {
    const f = await fixture();
    try {
      const data = new Uint8Array([255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128, 0, 0, 0, 255]);
      const texture = new Texture({ width: 2, height: 2, data, colorSpace: "linear" });
      const native = f.device.getNativeTexture(texture);
      expect(f.textures[0]).toMatchObject({ mipLevelCount: 2, format: "rgba8unorm" });
      expect(f.writes.map(({ mipLevel, width, height, bytesPerRow }) => [mipLevel, width, height, bytesPerRow]))
        .toEqual([[0, 2, 2, 8], [1, 1, 1, 4]]);
      expect(f.writes[1]!.bytes).toEqual([64, 64, 64, 160]);
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes).toHaveLength(2);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("filters sRGB color in linear light and alpha separately", async () => {
    const f = await fixture();
    try {
      const data = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
      const texture = new Texture({ width: 2, height: 2, data, colorSpace: "srgb" });
      f.device.getNativeTexture(texture);
      expect(f.textures[0]!.format).toBe("rgba8unorm-srgb");
      expect(f.writes[1]!.bytes).toEqual([188, 188, 188, 128]);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("uses fractional area coverage for odd sizes and handles a one-pixel axis", async () => {
    const f = await fixture();
    try {
      const data = new Uint8Array(5 * 3 * 4);
      for (let y = 0; y < 3; y += 1) for (let x = 0; x < 5; x += 1) data.set([[0, 0, 100, 200, 200][x]!, 0, 0, 255], (y * 5 + x) * 4);
      const texture = new Texture({ width: 5, height: 3, data });
      f.device.getNativeTexture(texture);
      expect(f.writes.map(({ width, height }) => [width, height])).toEqual([[5, 3], [2, 1], [1, 1]]);
      expect(f.writes[1]!.bytes).toEqual([20, 0, 0, 255, 180, 0, 0, 255]);
      expect(f.writes[2]!.bytes).toEqual([100, 0, 0, 255]);
      const strip = new Texture({ width: 1, height: 3, data: new Uint8Array([0, 0, 0, 0, 60, 0, 0, 60, 120, 0, 0, 120]) });
      f.device.getNativeTexture(strip);
      expect(f.writes.at(-1)!.bytes).toEqual([60, 0, 0, 60]);
      texture.dispose(); strip.dispose();
    } finally { await f.close(); }
  });

  it("preserves supplied and sparse override levels and derives missing descendants from them", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 8, height: 4, mipLevelCount: 4, mipLevels: [
        { width: 8, height: 4, data: rgba(8, 4, [220, 0, 0, 255]) },
        { width: 4, height: 2, data: rgba(4, 2, [15, 20, 25, 64]) }
      ] });
      const native = f.device.getNativeTexture(texture);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1, 2, 3]);
      expect(f.writes[2]!.bytes).toEqual(Array.from(rgba(2, 1, [15, 20, 25, 64])));
      texture.updateMip(2, rgba(2, 1, [70, 80, 90, 100]));
      expect(texture.generateMipmaps).toBe(false);
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map(write => write.mipLevel)).not.toContain(3);
      texture.generateMipmaps = true;
      texture.markNeedsUpdate();
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.find(write => write.mipLevel === 2)!.bytes).toEqual(Array.from(rgba(2, 1, [70, 80, 90, 100])));
      expect(f.writes.find(write => write.mipLevel === 3)!.bytes).toEqual([70, 80, 90, 100]);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("regenerates from merged sparse edits independently for each device", async () => {
    const a = await fixture(), b = await fixture();
    try {
      const texture = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [0, 0, 0, 255]) });
      const handleA = a.device.getNativeTexture(texture), handleB = b.device.getNativeTexture(texture);
      texture.update(new Uint8Array([255, 0, 0, 255]), { x: 1, y: 1, width: 1, height: 1 });
      a.writes.length = 0; b.writes.length = 0;
      expect(a.device.getNativeTexture(texture)).toBe(handleA);
      expect(b.device.getNativeTexture(texture)).toBe(handleB);
      for (const f of [a, b]) {
        expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1, 2]);
        expect(f.writes[1]!.bytes.slice(0, 4)).toEqual([64, 0, 0, 255]);
        expect(f.writes[2]!.bytes).toEqual([16, 0, 0, 255]);
      }
      texture.dispose();
    } finally { await a.close(); await b.close(); }
  });

  it.each(["mip-first", "mark-first"] as const)(
    "uploads in-place and explicit mip edits to both devices (%s)",
    async (order) => {
      const a = await fixture(), b = await fixture();
      try {
        const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, mipLevels: [
          { width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) },
          { width: 1, height: 1, data: rgba(1, 1, [0, 0, 0, 255]) }
        ] });
        const handleA = a.device.getNativeTexture(texture), handleB = b.device.getNativeTexture(texture);
        const editMip = () => texture.updateMip(1, rgba(1, 1, [17, 18, 19, 255]));
        const mark = () => { texture.getMipLevel(0)!.data[0] = 37; texture.markNeedsUpdate(); };
        if (order === "mip-first") { editMip(); mark(); } else { mark(); editMip(); }
        a.writes.length = 0; b.writes.length = 0;
        expect(a.device.getNativeTexture(texture)).toBe(handleA);
        expect(texture.needsUpdate).toBe(false);
        expect(b.device.getNativeTexture(texture)).toBe(handleB);
        for (const f of [a, b]) {
          expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
          expect(f.writes[0]!.bytes[0]).toBe(37);
          expect(f.writes[1]!.bytes).toEqual([17, 18, 19, 255]);
        }
        texture.dispose();
      } finally { await a.close(); await b.close(); }
    }
  );

  it("detects a full-content mark made while a pending mip is uploading", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, mipLevels: [
        { width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) },
        { width: 1, height: 1, data: rgba(1, 1, [0, 0, 0, 255]) }
      ] });
      const native = f.device.getNativeTexture(texture);
      texture.updateMip(1, rgba(1, 1, [17, 18, 19, 255]));
      f.writes.length = 0;
      f.onWrite(() => {
        f.onWrite();
        texture.getMipLevel(0)!.data[0] = 37;
        texture.markNeedsUpdate();
      });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/changed during native upload/i);
      expect(texture.needsUpdate).toBe(true);
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
      expect(f.writes[0]!.bytes[0]).toBe(37);
      expect(f.writes[1]!.bytes).toEqual([17, 18, 19, 255]);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("retries an already-written mip if a later mip edit is followed by another full mark", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, mipLevels: [
        { width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) },
        { width: 1, height: 1, data: rgba(1, 1, [0, 0, 0, 255]) }
      ] });
      const native = f.device.getNativeTexture(texture);
      texture.getMipLevel(0)!.data[0] = 12;
      texture.markNeedsUpdate();
      f.writes.length = 0;
      f.onWrite((write) => {
        if (write.mipLevel !== 1) return;
        f.onWrite();
        texture.updateMip(1, rgba(1, 1, [17, 18, 19, 255]));
        texture.getMipLevel(0)!.data[0] = 37;
        texture.markNeedsUpdate();
      });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/changed during native upload/i);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
      expect(f.writes[0]!.bytes[0]).toBe(37);
      expect(f.writes[1]!.bytes).toEqual([17, 18, 19, 255]);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("does not acknowledge a second full-content mark made during a full-content upload", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, mipLevels: [
        { width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) },
        { width: 1, height: 1, data: rgba(1, 1, [0, 0, 0, 255]) }
      ] });
      const native = f.device.getNativeTexture(texture);
      texture.getMipLevel(0)!.data[0] = 12;
      texture.markNeedsUpdate();
      f.writes.length = 0;
      f.onWrite((write) => {
        if (write.mipLevel !== 1) return;
        f.onWrite();
        texture.getMipLevel(0)!.data[0] = 37;
        texture.markNeedsUpdate();
      });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/changed during native upload/i);
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
      expect(f.writes[0]!.bytes[0]).toBe(37);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("detects a second full-content mark during initial native allocation", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, mipLevels: [
        { width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) },
        { width: 1, height: 1, data: rgba(1, 1, [0, 0, 0, 255]) }
      ] });
      texture.markNeedsUpdate();
      f.onWrite(() => {
        f.onWrite();
        texture.getMipLevel(0)!.data[0] = 37;
        texture.markNeedsUpdate();
      });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/changed during native upload/i);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0]);
      f.writes.length = 0;
      f.device.getNativeTexture(texture);
      expect(f.writes.map((write) => write.mipLevel)).toEqual([0, 1]);
      expect(f.writes[0]!.bytes[0]).toBe(37);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("restores the dirty flag when an initial native upload fails without a newer edit", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, data: rgba(2, 2, [1, 2, 3, 255]) });
      texture.markNeedsUpdate();
      const revision = texture.revision;
      f.onWrite(() => { throw new Error("initial upload failure"); });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/initial upload failure/);
      expect(texture.needsUpdate).toBe(true);
      expect(texture.revision).toBe(revision);
      f.onWrite();
      f.device.getNativeTexture(texture);
      expect(texture.needsUpdate).toBe(false);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("admits the full resident chain before allocation and keeps it charged through retirement", async () => {
    const denied = await fixture({ maxBytes: 80 }), f = await fixture({ maxBytes: 84 });
    try {
      const rejected = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [0, 0, 0, 255]) });
      expect(() => denied.device.getNativeTexture(rejected)).toThrow(/budget/i);
      expect(denied.textures).toHaveLength(0);
      expect(denied.device.createTextureResidencyAdapter().usageBytes()).toBe(0);
      const texture = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [0, 0, 0, 255]) });
      f.device.getNativeTexture(texture);
      const budget = f.device.createTextureResidencyAdapter();
      expect(budget.usageBytes()).toBe(84);
      texture.dispose();
      expect(budget.usageBytes()).toBe(84);
      expect(f.textures[0]!.destroyed).toBe(0);
      await f.finishFences();
      expect(budget.usageBytes()).toBe(0);
      expect(f.textures[0]!.destroyed).toBe(1);
      rejected.dispose();
    } finally { await denied.close(); await f.close(); }
  });

  it("reallocates when generation changes the immutable mip count and charges both handles until retirement", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [8, 0, 0, 255]) });
      const budget = f.device.createTextureResidencyAdapter();
      const mipped = f.device.getNativeTexture(texture);
      texture.generateMipmaps = false;
      texture.markNeedsUpdate();
      const flat = f.device.getNativeTexture(texture);
      expect(flat).not.toBe(mipped);
      expect(f.textures.map(item => item.mipLevelCount)).toEqual([3, 1]);
      expect(budget.usageBytes()).toBe(148);
      await f.finishFences();
      expect(budget.usageBytes()).toBe(64);
      expect(f.textures[0]!.destroyed).toBe(1);
      texture.generateMipmaps = true;
      texture.markNeedsUpdate();
      expect(f.device.getNativeTexture(texture)).not.toBe(flat);
      expect(f.textures[2]!.mipLevelCount).toBe(3);
      expect(budget.usageBytes()).toBe(148);
      await f.finishFences();
      expect(budget.usageBytes()).toBe(84);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("retries an interrupted in-place chain from level zero and prevents reentrant upload", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [0, 0, 0, 255]) });
      const native = f.device.getNativeTexture(texture);
      texture.update(rgba(4, 4, [120, 0, 0, 255]));
      f.writes.length = 0;
      f.onWrite(write => {
        if (write.mipLevel === 0) expect(() => f.device.getNativeTexture(texture)).toThrow(/reentered/i);
        if (write.mipLevel === 1) throw new Error("injected mip write failure");
      });
      expect(() => f.device.getNativeTexture(texture)).toThrow(/injected mip/);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1]);
      expect(texture.needsUpdate).toBe(true);
      f.onWrite(); f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1, 2]);
      expect(f.writes[2]!.bytes).toEqual([120, 0, 0, 255]);
      expect(texture.needsUpdate).toBe(false);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("fills allocated gaps when generation is enabled without changing the existing storage", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 4, height: 4, mipLevelCount: 3, generateMipmaps: false, data: rgba(4, 4, [41, 42, 43, 44]) });
      const native = f.device.getNativeTexture(texture);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0]);
      texture.generateMipmaps = true;
      f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1, 2]);
      expect(f.writes[2]!.bytes).toEqual([41, 42, 43, 44]);
      texture.dispose();
    } finally { await f.close(); }
  });

  it("cancels after disposal or revision changes inside a write and retries without publishing partial state", async () => {
    const f = await fixture();
    try {
      const budget = f.device.createTextureResidencyAdapter();
      const texture = new Texture({ width: 4, height: 4, data: rgba(4, 4, [0, 0, 0, 255]) });
      f.onWrite(() => texture.dispose());
      expect(() => f.device.getNativeTexture(texture)).toThrow(/disposed/i);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0]);
      expect(budget.usageBytes()).toBe(84);
      await f.finishFences();
      expect(budget.usageBytes()).toBe(0);
      const changed = new Texture({ width: 4, height: 4, dynamic: true, data: rgba(4, 4, [0, 0, 0, 255]) });
      f.writes.length = 0;
      f.onWrite(() => { f.onWrite(); changed.update(rgba(4, 4, [100, 0, 0, 255])); });
      expect(() => f.device.getNativeTexture(changed)).toThrow(/changed/i);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0]);
      f.writes.length = 0;
      f.device.getNativeTexture(changed);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1, 2]);
      expect(f.writes[2]!.bytes).toEqual([100, 0, 0, 255]);
      changed.dispose();
    } finally { await f.close(); }
  });

  it("rejects unsupported allocated gaps, excessive dimensions, and native limits before allocation", async () => {
    const f = await fixture({ maxDimension: 4 });
    try {
      const float = new Texture({ width: 4, height: 4, format: "rgba32f", data: new Float32Array(64), mipLevelCount: 3 });
      expect(() => f.device.getNativeTexture(float)).toThrow(/only supports/i);
      const writable = new Texture({ width: 4, height: 4, data: rgba(4, 4, [0, 0, 0, 255]), mipLevelCount: 3,
        usage: ["sampled", "storage", "copy-dst"] });
      expect(() => f.device.getNativeTexture(writable)).toThrow(/only supports/i);
      const tooWide = new Texture({ width: 5, height: 1, data: rgba(5, 1, [0, 0, 0, 255]) });
      expect(() => f.device.getNativeTexture(tooWide)).toThrow(/dimension limit/i);
      const excessive = new Texture({ width: 2, height: 2, data: rgba(2, 2, [0, 0, 0, 255]) });
      Object.defineProperty(excessive, "width", { value: 4097 });
      Object.defineProperty(excessive, "height", { value: 4096 });
      expect(() => f.device.getNativeTexture(excessive)).toThrow(/CPU work/i);
      expect(f.textures).toHaveLength(0);
      for (const texture of [float, writable, tooWide, excessive]) texture.dispose();
    } finally { await f.close(); }
  });

  it("preserves the legacy single-level float and GPU-writable data paths", async () => {
    const f = await fixture();
    try {
      const float = new Texture({ width: 2, height: 2, format: "rgba32f", data: new Float32Array(16) });
      const writable = new Texture({ width: 2, height: 2, data: rgba(2, 2, [1, 2, 3, 4]),
        usage: ["sampled", "storage", "copy-dst"] });
      f.device.getNativeTexture(float); f.device.getNativeTexture(writable);
      expect(f.textures.map(item => item.mipLevelCount)).toEqual([1, 1]);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 0]);
      float.dispose(); writable.dispose();
    } finally { await f.close(); }
  });

  it("keeps source-backed mip generation and revision uploads on the existing canvas path", async () => {
    class ReadbackCanvas {
      constructor(readonly width: number, readonly height: number) {}
      getContext() {
        return { clearRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(23) }) };
      }
    }
    vi.stubGlobal("OffscreenCanvas", ReadbackCanvas);
    const f = await fixture();
    try {
      const source = { width: 2, height: 2 } as unknown as TexImageSource;
      const texture = new Texture({ width: 2, height: 2, source, dynamic: true, generateMipmaps: true });
      const native = f.device.getNativeTexture(texture);
      expect(f.textures[0]!.mipLevelCount).toBe(2);
      expect(f.writes.map(write => [write.mipLevel, write.bytesPerRow])).toEqual([[0, 256], [1, 256]]);
      texture.markNeedsUpdate(); f.writes.length = 0;
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes.map(write => write.mipLevel)).toEqual([0, 1]);
      texture.dispose();
    } finally { await f.close(); vi.unstubAllGlobals(); }
  });

  it("invalidates generated resources and releases their charge on device loss", async () => {
    const f = await fixture();
    try {
      const texture = new Texture({ width: 4, height: 4, data: rgba(4, 4, [0, 0, 0, 255]) });
      f.device.getNativeTexture(texture);
      const budget = f.device.createTextureResidencyAdapter();
      expect(budget.usageBytes()).toBe(84);
      f.loss.resolve();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(() => f.device.getNativeTexture(texture)).toThrow(/lost/i);
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(budget.usageBytes()).toBe(0);
      texture.dispose();
    } finally { await f.close(); }
  });
});

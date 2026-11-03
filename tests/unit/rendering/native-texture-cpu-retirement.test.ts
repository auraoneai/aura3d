import { describe, expect, it, vi } from "vitest";
import { Texture, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

describe("texture CPU content disposal", () => {
  it("releases a flat snapshot after every listener without mutating retained aliases", () => {
    const input = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const texture = new Texture({ width: 2, height: 2, data: input });
    const snapshot = texture.data!;
    const events: string[] = [];
    expect(snapshot).not.toBe(input);
    expect(texture.cpuByteLength).toBe(16);

    texture.onDispose(() => {
      events.push("first");
      expect(texture.disposed).toBe(true);
      expect(texture.data).toBe(snapshot);
      expect(texture.cpuByteLength).toBe(16);
      texture.dispose();
      throw new Error("listener failure");
    });
    texture.onDispose(() => {
      events.push("second");
      expect(texture.data).toBe(snapshot);
    });

    texture.dispose();
    texture.dispose();
    expect(events).toEqual(["first", "second"]);
    expect(texture.data).toBeNull();
    expect(texture.textureLevels).toEqual([]);
    expect(texture.getMipLevel(0)).toBeNull();
    expect(texture.cpuByteLength).toBe(0);
    expect(texture.byteLength).toBe(16);
    expect(texture).toMatchObject({ width: 2, height: 2, format: "rgba8", mipLevelCount: 1 });
    expect(Array.from(snapshot)).toEqual(Array.from(input));
    expect(input[0]).toBe(1);
    expect(new TextureBinding({ name: "disposed", texture }).validate().ok).toBe(false);
  });

  it("releases all mips and overrides without affecting another texture", () => {
    const base = new Uint8Array(64).fill(2);
    const small = new Uint8Array(16).fill(3);
    const descriptor = { width: 4, height: 4, mipLevels: [
      { width: 4, height: 4, data: base }, { width: 2, height: 2, data: small }
    ] };
    const first = new Texture(descriptor);
    const peer = new Texture(descriptor);
    const override = new Uint8Array(16).fill(7);
    first.updateMip(1, override);
    const retainedOverride = first.getMipLevel(1)!.data;
    expect(first.cpuByteLength).toBe(96);
    expect(first.getMipRevision(1)).toBe(1);
    first.dispose();

    expect(first.mipLevels).toEqual([]);
    expect(first.getMipLevel(0)).toBeNull();
    expect(first.getMipLevel(1)).toBeNull();
    expect(first.getMipRevision(1)).toBe(0);
    expect(first.cpuByteLength).toBe(0);
    expect(first.byteLength).toBe(80);
    expect(retainedOverride[0]).toBe(7);
    expect(override[0]).toBe(7);
    expect(peer.getMipLevel(0)?.data[0]).toBe(2);
    expect(peer.getMipLevel(1)?.data[0]).toBe(3);
    peer.dispose();
  });

  it("releases every cube face and its per-face override", () => {
    const faces: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
    const source = faces.map((face, index) => ({ face, mipLevels: [
      { width: 2, height: 2, data: new Uint8Array(16).fill(index + 1) },
      { width: 1, height: 1, data: new Uint8Array(4).fill(index + 7) }
    ] }));
    const cube = new Texture({ width: 2, height: 2, dimension: "cube", cubeFaces: source });
    cube.updateMip(1, new Uint8Array(4).fill(99), { face: "px" });
    const snapshot = cube.getMipLevel(1, "px")!.data;
    expect(cube.cpuByteLength).toBe(124);
    cube.dispose();

    expect(cube.cubeFaces).toEqual([]);
    for (const face of faces) expect(cube.getMipLevel(0, face)).toBeNull();
    expect(cube.getMipLevel(1, "px")).toBeNull();
    expect(cube.cpuByteLength).toBe(0);
    expect(cube.byteLength).toBe(120);
    expect(snapshot[0]).toBe(99);
    expect(source[0]!.mipLevels[0]!.data[0]).toBe(1);
  });

  it("releases compressed mips, invalidated fallbacks and overrides", () => {
    const compressed = new Texture({
      width: 4, height: 4, format: "bc1-rgba-unorm",
      mipLevels: [{ width: 4, height: 4, data: new Uint8Array(8).fill(1) }, { width: 2, height: 2, data: new Uint8Array(8).fill(2) }],
      fallbackMipLevels: [{ width: 4, height: 4, data: new Uint8Array(64).fill(3) }, { width: 2, height: 2, data: new Uint8Array(16).fill(4) }]
    });
    expect(compressed.cpuByteLength).toBe(96);
    expect(compressed.fallbackByteLength).toBe(80);
    const retainedFallback = compressed.fallbackMipLevels[0]!.data;
    compressed.updateMip(1, new Uint8Array(8).fill(5));
    expect(compressed.fallbackByteLength).toBe(0);
    expect(compressed.cpuByteLength).toBe(104);
    compressed.dispose();

    expect(compressed.data).toBeNull();
    expect(compressed.mipLevels).toEqual([]);
    expect(compressed.fallbackData).toBeNull();
    expect(compressed.fallbackMipLevels).toEqual([]);
    expect(compressed.fallbackTextureLevels).toEqual([]);
    expect(compressed.cpuByteLength).toBe(0);
    expect(compressed.byteLength).toBe(16);
    expect(retainedFallback[0]).toBe(3);

    const bytes = new Uint8Array(8).fill(6);
    const fallback = new Uint8Array(64).fill(7);
    const flat = new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: bytes, fallbackData: fallback });
    const retainedData = flat.data!;
    const retainedFlatFallback = flat.fallbackData!;
    expect(flat.cpuByteLength).toBe(72);
    flat.dispose();
    expect(flat.data).toBeNull();
    expect(flat.fallbackData).toBeNull();
    expect(flat.cpuByteLength).toBe(0);
    expect(retainedData[0]).toBe(6);
    expect(retainedFlatFallback[0]).toBe(7);
    expect(bytes[0]).toBe(6);
    expect(fallback[0]).toBe(7);
  });

  it("drops full and partial update references without changing borrowed arrays", () => {
    const texture = new Texture({ width: 2, height: 2, dynamic: true, data: new Uint8Array(16) });
    const full = new Uint8Array(16).fill(5);
    texture.update(full);
    expect(texture.data).toBe(full);
    const partial = Uint8Array.of(9, 10, 11, 12);
    texture.update(partial, { x: 1, y: 1, width: 1, height: 1 });
    const merged = texture.getMipLevel(0)!.data;
    expect(texture.data).toBe(partial);
    expect(texture.cpuByteLength).toBe(20);
    expect(texture.pendingUpdateRegion).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    texture.dispose();

    expect(texture.data).toBeNull();
    expect(texture.getMipLevel(0)).toBeNull();
    expect(texture.pendingUpdateRegion).toBeNull();
    expect(texture.cpuByteLength).toBe(0);
    expect(Array.from(full)).toEqual(new Array(16).fill(5));
    expect(Array.from(partial)).toEqual([9, 10, 11, 12]);
    expect(Array.from(merged.slice(12))).toEqual([9, 10, 11, 12]);
    expect(() => texture.update(full)).toThrow(/disposed/);
  });

  it("releases a borrowed media reference without controlling its owner", () => {
    const source = { width: 1, height: 1, pause: vi.fn(), close: vi.fn() };
    const texture = new Texture({ width: 1, height: 1, source: source as unknown as TexImageSource });
    const poll = vi.fn();
    texture.pollContentRevision = poll;
    texture.onDispose(() => expect(texture.source).toBe(source));
    texture.dispose();

    expect(texture.source).toBeNull();
    expect(texture.pollContentRevision).toBeUndefined();
    expect(source.pause).not.toHaveBeenCalled();
    expect(source.close).not.toHaveBeenCalled();
    expect(poll).not.toHaveBeenCalled();
    expect(texture.cpuByteLength).toBe(0);
  });
});

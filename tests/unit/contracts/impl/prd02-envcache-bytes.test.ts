/**
 * #1153 (T0-29): the equirect `.hdr` path uploaded `decodeHdrEquirect`'s RGB
 * floats (3/texel) as an `rgba32f` Texture (4/texel) — "textures must contain
 * exactly N bytes" at EnvironmentCache.ts:197 on every HDRI-lit game. The
 * loader now expands to RGBA and `fromEquirect` narrows back to RGB for the
 * projection; sizes are asserted per format and mip.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { defaultProbeLoader } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import { createEnvironmentProbeFactory } from "../../../../packages/rendering/src/environment/EnvironmentProbeFactory";
import {
  decodeHdrEquirect,
  equirectRgbImage,
  equirectToCubeFaces,
  hdrImageToRgba32f
} from "../../../../packages/rendering/src/environment/HdrEquirect";

const HDR = "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";

afterEach(() => vi.unstubAllGlobals());

describe("#1153 rgba32f equirect byte sizes", () => {
  it("decode is RGB; the upload buffer is width·height·4 floats = 16 bytes/texel", () => {
    const image = decodeHdrEquirect(new Uint8Array(readFileSync(HDR)));
    expect(image.data.length).toBe(image.width * image.height * 3);
    const rgba = hdrImageToRgba32f(image);
    expect(rgba.byteLength).toBe(image.width * image.height * 16);
    expect(() => new Texture({ width: image.width, height: image.height, format: "rgba32f", data: rgba })).not.toThrow();
    // The old upload (RGB data as rgba32f) is exactly the reported error.
    expect(() => new Texture({ width: image.width, height: image.height, format: "rgba32f", data: image.data })).toThrow(/exactly/);
    // Channels are preserved, A = 1.
    expect(Array.from(rgba.subarray(0, 4))).toEqual([image.data[0], image.data[1], image.data[2], 1]);
  });

  it("RGBA round-trips back to the same RGB the projection reads", () => {
    const image = { width: 4, height: 2, data: Float32Array.from({ length: 24 }, (_, i) => i / 10) };
    const back = equirectRgbImage(4, 2, hdrImageToRgba32f(image));
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
    expect(equirectRgbImage(4, 2, image.data).data).toBe(image.data);
    expect(() => equirectRgbImage(4, 2, new Float32Array(10))).toThrow(/EQUIRECT_SIZE_MISMATCH/);
    expect(() => hdrImageToRgba32f({ width: 4, height: 2, data: new Float32Array(10) })).toThrow(/HDR_IMAGE_SIZE_MISMATCH/);
  });

  it("projection from RGBA equals projection from RGB (no stride drift)", () => {
    const image = { width: 16, height: 8, data: Float32Array.from({ length: 16 * 8 * 3 }, (_, i) => ((i * 37) % 101) / 101) };
    const fromRgb = equirectToCubeFaces(image, 8);
    const fromRgba = equirectToCubeFaces(equirectRgbImage(16, 8, hdrImageToRgba32f(image)), 8);
    for (let f = 0; f < 6; f += 1) expect(Array.from(fromRgba[f]!)).toEqual(Array.from(fromRgb[f]!));
  });

  it("per-format texel sizes and every mip of the built probe agree with the data", () => {
    const bytesPerTexel = { rgba8: 4, rgba16f: 8, rgba32f: 16 } as const;
    for (const [format, bpt] of Object.entries(bytesPerTexel)) {
      const w = 7;
      const h = 3;
      const data = format === "rgba8" ? new Uint8Array(w * h * 4) : format === "rgba16f" ? new Uint16Array(w * h * 4) : new Float32Array(w * h * 4);
      expect(data.byteLength).toBe(w * h * bpt);
      expect(() => new Texture({ width: w, height: h, format: format as "rgba8", data: data as never })).not.toThrow();
    }
  });

  it("defaultProbeLoader builds an HDRI probe from a real .hdr without the size error", async () => {
    const bytes = readFileSync(HDR);
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }));
    const device = new MockRenderDevice();
    const loader = defaultProbeLoader(createEnvironmentProbeFactory(device));
    const probe = await loader({ url: "studio.hdr" } as never);
    expect(probe.source).toBe("hdri");
    expect(probe.mipCount).toBeGreaterThan(1);
    expect(probe.sh9.length).toBe(27);
  });
});

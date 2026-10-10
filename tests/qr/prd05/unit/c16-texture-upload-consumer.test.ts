/**
 * 05-C16 — `WebGL2TextureRegistry.uploadTexture` consumes the C-16 slot
 * (`resolveCompressedTextureFormatSlot().get(rendererQrFlags())`).
 *
 * - A3D_QR_ASSETS on: an sRGB ASTC 4x4 texture uploads with
 *   COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR (the internal format ANGLE Metal
 *   reports in the macos-14 lane browser run).
 * - flag off: the legacy resolver runs unchanged (linear RGBA ASTC constant).
 * - flag on, sRGB S3TC without the s3tc_srgb extension: no compressed upload;
 *   the RGBA8 fallback path is used instead of uploading linear DXT data.
 *
 * Unit evidence only; the row's "Done when" is the ANGLE Metal assertion in
 * the lane browser run on main.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd05";
import { Texture, type TextureCompressedFormat } from "../../../../packages/rendering/src/Texture";
import { WebGL2TextureRegistry } from "../../../../packages/rendering/src/webgl2/TextureUpload";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";

const ASTC = { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0, COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: 0x93d0 };
const S3TC = { COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 };
const FLAGS_OFF: QrFlags = { values: {}, on: () => false };
const ASSETS_ON: QrFlags = { values: { A3D_QR_ASSETS: true }, on: (name) => name === "A3D_QR_ASSETS" };

function harness(extensions: Record<string, unknown>) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    RGBA: 0x1908, RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, UNSIGNED_BYTE: 0x1401,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243, BROWSER_DEFAULT_WEBGL: 0x9244, NONE: 0,
    createTexture: () => ({}),
    deleteTexture: record("deleteTexture"), bindTexture: record("bindTexture"), pixelStorei: record("pixelStorei"),
    texParameteri: record("texParameteri"), texImage2D: record("texImage2D"), texStorage2D: record("texStorage2D"),
    generateMipmap: record("generateMipmap"), compressedTexImage2D: record("compressedTexImage2D"),
    getExtension: (name: string) => extensions[name] ?? null,
    getParameter: () => 4096
  } as unknown as WebGL2RenderingContext;
  const host = {
    gl,
    stateCache: { invalidate: () => undefined },
    counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined,
    lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return { registry: new WebGL2TextureRegistry(host), calls };
}

function compressed(format: TextureCompressedFormat, colorSpace: "srgb" | "linear", withFallback = false): Texture {
  const bytes = format === "bc1-rgba-unorm" ? 8 : 16; // one 4x4 block
  return new Texture({
    width: 4, height: 4, format, colorSpace, label: `${format}-${colorSpace}`,
    mipLevels: [{ width: 4, height: 4, data: new Uint8Array(bytes) }],
    ...(withFallback ? { fallbackMipLevels: [{ width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) }] } : {})
  });
}

function compressedInternalFormats(calls: { name: string; args: unknown[] }[]): unknown[] {
  return calls.filter((call) => call.name === "compressedTexImage2D").map((call) => call.args[2]);
}

afterEach(() => setRendererQrFlags(FLAGS_OFF));

describe("05-C16 TextureUpload consumes the C-16 slot", () => {
  it("A3D_QR_ASSETS on: sRGB ASTC uploads COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR", () => {
    setRendererQrFlags(ASSETS_ON);
    const { registry, calls } = harness({ WEBGL_compressed_texture_astc: ASTC });
    registry.getTextureHandle(compressed("astc-4x4-rgba-unorm", "srgb"));
    expect(compressedInternalFormats(calls)).toEqual([ASTC.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR]);
  });

  it("flag off: the legacy resolver's linear ASTC constant is unchanged", () => {
    setRendererQrFlags(FLAGS_OFF);
    const { registry, calls } = harness({ WEBGL_compressed_texture_astc: ASTC });
    registry.getTextureHandle(compressed("astc-4x4-rgba-unorm", "srgb"));
    expect(compressedInternalFormats(calls)).toEqual([ASTC.COMPRESSED_RGBA_ASTC_4x4_KHR]);
  });

  it("flag off: bc7 still throws UNSUPPORTED_COMPRESSED_FORMAT exactly as before", () => {
    setRendererQrFlags(FLAGS_OFF);
    const { registry } = harness({});
    expect(() => registry.getTextureHandle(compressed("bc7-rgba-unorm", "srgb"))).toThrow("UNSUPPORTED_COMPRESSED_FORMAT:bc7-rgba-unorm");
  });

  it("A3D_QR_ASSETS on: sRGB DXT1 without s3tc_srgb falls back to RGBA8 instead of a linear upload", () => {
    setRendererQrFlags(ASSETS_ON);
    const { registry, calls } = harness({ WEBGL_compressed_texture_s3tc: S3TC });
    registry.getTextureHandle(compressed("bc1-rgba-unorm", "srgb", true));
    expect(compressedInternalFormats(calls)).toEqual([]);
    expect(calls.some((call) => call.name === "texImage2D")).toBe(true);
  });
});

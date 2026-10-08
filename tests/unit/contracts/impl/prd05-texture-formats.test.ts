/**
 * prd05-texture-formats.test.ts — PRD-05 Phase-1 real-impl conformance for the
 * C-16 rendering slot: `resolveCompressedTextureFormatReal` maps every
 * `TextureCompressedFormat` × colour space onto WebGL2 internal formats behind
 * the right extensions, and `probeCompressedTextureCapabilities` reports the
 * capability set used by `selectKTX2TargetFormat`.
 */
import { describe, expect, it } from "vitest";
import {
  probeCompressedTextureCapabilities,
  resolveCompressedTextureFormatReal,
  resolveCompressedTextureFormatSlot
} from "@aura3d/rendering/lanes";
import type { QrFlags } from "@aura3d/rendering/contracts";

const S3TC = { COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f3, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 };
const S3TC_SRGB = { COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT: 0x8c4f, COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c50 };
const BPTC = { COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d };
const ASTC = { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0, COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: 0x93d0 };
const EXTENSIONS: Record<string, object> = {
  WEBGL_compressed_texture_s3tc: S3TC,
  WEBGL_compressed_texture_s3tc_srgb: S3TC_SRGB,
  EXT_texture_compression_bptc: BPTC,
  WEBGL_compressed_texture_astc: ASTC
};

function mockGl(enabled: readonly string[]): WebGL2RenderingContext {
  return {
    getExtension: (name: string) => (enabled.includes(name) ? EXTENSIONS[name] : null)
  } as unknown as WebGL2RenderingContext;
}

const ALL = Object.keys(EXTENSIONS);
const NONE: string[] = [];

describe("C-16 resolveCompressedTextureFormatReal", () => {
  it("etc2 targets are WebGL2-core (no extension) and honour sRGB", () => {
    const gl = mockGl(NONE);
    expect(resolveCompressedTextureFormatReal("etc2-rgba8unorm", "linear", gl)).toBe(0x9278);
    expect(resolveCompressedTextureFormatReal("etc2-rgba8unorm", "srgb", gl)).toBe(0x9279);
    expect(resolveCompressedTextureFormatReal("etc2-rgb8unorm", "linear", gl)).toBe(0x9274);
    expect(resolveCompressedTextureFormatReal("etc2-rgb8unorm", "srgb", gl)).toBe(0x9275);
  });
  it("bc1/bc3 need s3tc; sRGB needs the s3tc_srgb extension too", () => {
    expect(resolveCompressedTextureFormatReal("bc1-rgba-unorm", "linear", mockGl(NONE))).toBeNull();
    expect(resolveCompressedTextureFormatReal("bc3-rgba-unorm", "linear", mockGl(NONE))).toBeNull();
    const s3tcOnly = mockGl(["WEBGL_compressed_texture_s3tc"]);
    expect(resolveCompressedTextureFormatReal("bc1-rgba-unorm", "linear", s3tcOnly)).toBe(0x83f3);
    expect(resolveCompressedTextureFormatReal("bc3-rgba-unorm", "linear", s3tcOnly)).toBe(0x83f3);
    // sRGB without the srgb extension falls back to null rather than misuploading.
    expect(resolveCompressedTextureFormatReal("bc1-rgba-unorm", "srgb", s3tcOnly)).toBeNull();
    expect(resolveCompressedTextureFormatReal("bc3-rgba-unorm", "srgb", s3tcOnly)).toBeNull();
    const withSrgb = mockGl(["WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb"]);
    expect(resolveCompressedTextureFormatReal("bc1-rgba-unorm", "srgb", withSrgb)).toBe(0x8c4f);
    expect(resolveCompressedTextureFormatReal("bc3-rgba-unorm", "srgb", withSrgb)).toBe(0x8c50);
  });
  it("bc7 needs EXT_texture_compression_bptc", () => {
    expect(resolveCompressedTextureFormatReal("bc7-rgba-unorm", "linear", mockGl(NONE))).toBeNull();
    const gl = mockGl(["EXT_texture_compression_bptc"]);
    expect(resolveCompressedTextureFormatReal("bc7-rgba-unorm", "linear", gl)).toBe(0x8e8c);
    expect(resolveCompressedTextureFormatReal("bc7-rgba-unorm", "srgb", gl)).toBe(0x8e8d);
  });
  it("astc needs WEBGL_compressed_texture_astc", () => {
    expect(resolveCompressedTextureFormatReal("astc-4x4-rgba-unorm", "linear", mockGl(NONE))).toBeNull();
    const gl = mockGl(["WEBGL_compressed_texture_astc"]);
    expect(resolveCompressedTextureFormatReal("astc-4x4-rgba-unorm", "linear", gl)).toBe(0x93b0);
    expect(resolveCompressedTextureFormatReal("astc-4x4-rgba-unorm", "srgb", gl)).toBe(0x93d0);
  });
});

describe("C-16 probeCompressedTextureCapabilities", () => {
  it("reports extension presence 1:1, etc2 always true on WebGL2", () => {
    expect(probeCompressedTextureCapabilities(mockGl(NONE))).toEqual({ astc: false, bptc: false, etc2: true, s3tc: false, s3tcSrgb: false });
    expect(probeCompressedTextureCapabilities(mockGl(ALL))).toEqual({ astc: true, bptc: true, etc2: true, s3tc: true, s3tcSrgb: true });
    expect(probeCompressedTextureCapabilities(mockGl(["WEBGL_compressed_texture_astc"])).astc).toBe(true);
  });
});

describe("C-16 slot flag gating", () => {
  const FLAGS_ON: QrFlags = { values: { A3D_QR_ASSETS: true }, on: (name) => name === "A3D_QR_ASSETS" };
  const FLAGS_OFF: QrFlags = { values: {}, on: () => false };
  it("slot.get(flags) serves the stub off-flag and the real impl on-flag", () => {
    const slot = resolveCompressedTextureFormatSlot();
    const gl = mockGl(["EXT_texture_compression_bptc"]);
    const stub = slot.get(FLAGS_OFF);
    const real = slot.get(FLAGS_ON);
    expect(stub("bc7-rgba-unorm", "linear", gl)).toBeNull();
    expect(real("bc7-rgba-unorm", "linear", gl)).toBe(0x8e8c);
  });
});

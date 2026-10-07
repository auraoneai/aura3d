import { describe, expect, it } from "vitest";
import { selectKTX2TargetFormat, createAssetDecoderRegistry } from "@aura3d/assets/contracts";

describe("C-16 ktx2 target selection", () => {
  it("ASTC preferred, then BC7, ETC2, BC3, RGBA8", () => {
    expect(selectKTX2TargetFormat({ astc: true, bptc: true, etc2: true, s3tc: true, s3tcSrgb: true }, "uastc", true, "srgb")).toBe("astc-4x4-rgba-unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: true, etc2: true, s3tc: true, s3tcSrgb: false }, "uastc", true, "srgb")).toBe("bc7-rgba-unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: true, s3tc: true, s3tcSrgb: false }, "etc1s", false, "linear")).toBe("etc2-rgb8unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: true, s3tc: true, s3tcSrgb: false }, "etc1s", true, "linear")).toBe("etc2-rgba8unorm");
    // UASTC chain is astc > bc7 > etc2 > rgba8 — s3tc is never a UASTC target.
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: false }, "uastc", true, "srgb")).toBe("rgba8");
    // sRGB on s3tc-without-s3tcSrgb: linear BC would decode wrong — escape to bptc, else rgba8.
    expect(selectKTX2TargetFormat({ astc: false, bptc: true, etc2: false, s3tc: true, s3tcSrgb: false }, "etc1s", true, "srgb")).toBe("bc7-rgba-unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: false }, "etc1s", true, "srgb")).toBe("rgba8");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: true }, "etc1s", true, "srgb")).toBe("bc3-rgba-unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: true }, "etc1s", false, "srgb")).toBe("bc1-rgb-unorm");
    expect(selectKTX2TargetFormat({ astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }, "uastc", true, "srgb")).toBe("rgba8");
  });
  it("require([]) resolves immediately", async () => {
    const reg = createAssetDecoderRegistry({ basePath: "/aura-decoders/", capabilities: { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }, maxTextureSize: 4096, workerCount: 0 });
    const set = await reg.require([]);
    expect(set).toBeDefined();
  });
});

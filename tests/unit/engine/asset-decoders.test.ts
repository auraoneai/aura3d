import { describe, expect, it } from "vitest";
import { assets } from "../../../packages/engine/src/agent-api/AssetDecoders";

describe("assets.ensureDecoders (M2)", () => {
  it("leaves draco/meshopt unconfirmed without probes (ktx2 follows its module probe)", async () => {
    const diagnostics = await assets.ensureDecoders();
    expect(diagnostics.draco.available).toBe(false);
    expect(diagnostics.meshopt.available).toBe(false);
    expect(typeof diagnostics.ktx2.available).toBe("boolean");
  });

  it("honors injected probes and reports the GPU-aware KTX2 target", async () => {
    const diagnostics = await assets.ensureDecoders(
      { draco: true, ktx2: true, targetFormat: "astc-4x4-rgba-unorm" },
      {
        dracoAvailable: async () => true,
        meshoptAvailable: async () => false,
        ktx2Available: async () => true,
        gpuCompressedFormats: ["astc-4x4-rgba-unorm"]
      }
    );
    expect(diagnostics.draco.available).toBe(true);
    expect(diagnostics.ktx2.available).toBe(true);
    expect(diagnostics.chosenKtx2Target).toBe("astc-4x4-rgba-unorm");
  });

  it("picks a GPU-listed format over an unsupported request", async () => {
    const diagnostics = await assets.ensureDecoders(
      { ktx2: true, targetFormat: "astc-4x4-rgba-unorm" },
      { ktx2Available: async () => true, gpuCompressedFormats: ["etc2-rgba8unorm"] }
    );
    expect(diagnostics.chosenKtx2Target).toBe("etc2-rgba8unorm");
  });
});

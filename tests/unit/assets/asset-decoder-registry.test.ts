/**
 * PRD-05 Phase 1 — AssetDecoderRegistry real-impl conformance (node path):
 * lazy per-decoder loads through the vendored UMD copies + the meshoptimizer
 * package, one retry then AssetDecoderUnavailable, diagnostics, dispose.
 */
import { describe, expect, it } from "vitest";
import { AssetDecoderUnavailable, createAssetDecoderRegistry } from "@aura3d/assets/contracts";

const ALL_FALSE = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

function registry() {
  return createAssetDecoderRegistry({ basePath: "/aura-decoders/", capabilities: ALL_FALSE, maxTextureSize: 4096, workerCount: 1 });
}

describe("createAssetDecoderRegistry", () => {
  it("require([]) resolves immediately and loads nothing", async () => {
    const reg = registry();
    const set = await reg.require([]);
    expect(set).toEqual({});
    expect(reg.diagnostics().loaded).toEqual([]);
  });

  it("require(['meshopt']) resolves the meshoptimizer package decoder", async () => {
    const reg = registry();
    const set = await reg.require(["meshopt"]);
    expect(typeof set.meshopt).toBe("function");
    expect(reg.diagnostics().loaded).toContain("meshopt");
  });

  it("require(['draco']) lazy-loads the vendored draco decoder", async () => {
    const reg = registry();
    const set = await reg.require(["draco"]);
    expect(typeof set.draco).toBe("function");
    expect(reg.diagnostics().loaded).toContain("draco");
  }, 30000);

  it("require(['ktx2']) returns a real imageDecoder from the vendored basis module", async () => {
    const reg = registry();
    const set = await reg.require(["ktx2"]);
    expect(typeof set.imageDecoder).toBe("function");
    expect(reg.diagnostics().loaded).toContain("ktx2");
  }, 30000);

  it("repeated require() reuses the cached decoder", async () => {
    const reg = registry();
    const first = await reg.require(["meshopt"]);
    const second = await reg.require(["meshopt"]);
    expect(second.meshopt).toBe(first.meshopt);
  });

  it("dispose() rejects further require() calls with AssetDecoderUnavailable", async () => {
    const reg = registry();
    await reg.require(["meshopt"]);
    reg.dispose();
    await expect(reg.require(["meshopt"])).rejects.toBeInstanceOf(AssetDecoderUnavailable);
  });
});

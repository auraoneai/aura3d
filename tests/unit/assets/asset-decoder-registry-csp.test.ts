import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/assets/src/KTX2BasisTextureTranscoder.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadBasisTranscoderModule: vi.fn(() => Promise.reject(new EvalError("Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive")))
}));

import { AssetDecoderUnavailable, createAssetDecoderRegistry } from "@aura3d/assets/contracts";

const ALL_FALSE = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

afterEach(() => vi.clearAllMocks());

describe("registry KTX2 CSP classification", () => {
  it("surfaces KTX2_CSP_BLOCKED when the transcoder load throws a CSP EvalError", async () => {
    const reg = createAssetDecoderRegistry({ basePath: "/aura-decoders/", capabilities: ALL_FALSE, maxTextureSize: 4096, workerCount: 1 });
    const error = await reg.require(["ktx2"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssetDecoderUnavailable);
    expect((error as AssetDecoderUnavailable).code).toBe("KTX2_CSP_BLOCKED");
    await reg.dispose();
  });
});

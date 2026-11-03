import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytes } from "../../../packages/assets/src/LoaderFetch";

afterEach(() => vi.unstubAllGlobals());

describe("verified asset response metadata", () => {
  it("exposes the response content type with the verified bytes", async () => {
    const bytes = new Uint8Array([1, 3, 5, 7]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
      headers: { "content-type": "image/svg+xml; charset=utf-8" }
    })));
    const metadata = vi.fn();
    const result = await fetchBytes("https://assets.test/image", undefined, undefined, {
      credentials: "omit",
      integrity: { version: 1, digest }
    }, undefined, metadata);

    expect([...new Uint8Array(result)]).toEqual([...bytes]);
    expect(metadata).toHaveBeenCalledTimes(1);
    expect(metadata).toHaveBeenCalledWith({ contentType: "image/svg+xml; charset=utf-8" });
  });

  it("does not expose metadata when integrity or the final URL is rejected", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/png" }
    })));
    const metadata = vi.fn();
    await expect(fetchBytes("https://assets.test/image", undefined, undefined, {
      credentials: "omit", integrity: { version: 1, digest: "0".repeat(64) }
    }, undefined, metadata)).rejects.toMatchObject({ name: "AssetIntegrityError" });
    await expect(fetchBytes("https://assets.test/image", undefined, undefined, {
      credentials: "omit", expectedUrl: "https://assets.test/other"
    }, undefined, metadata)).rejects.toMatchObject({ name: "AssetPolicyError" });
    expect(metadata).not.toHaveBeenCalled();
  });

  it("reports an absent content type as an empty string", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([4]))));
    const metadata = vi.fn();
    await fetchBytes("https://assets.test/no-type", undefined, undefined, {}, undefined, metadata);
    expect(metadata).toHaveBeenCalledWith({ contentType: "" });
  });
});

import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetIntegrityError, AssetPolicyError, fetchBytes } from "../../../packages/assets/src/LoaderFetch";

afterEach(() => vi.unstubAllGlobals());

function pendingResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("fetchBytes request policy ownership", () => {
  it("checks downloaded bytes against the digest selected when the request started", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const response = pendingResponse();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const integrity = { version: 1 as const, digest: sha256("expected") };
    const pending = fetchBytes("https://assets.test/model.bin", undefined, undefined, { integrity });
    integrity.digest = sha256("different");
    response.resolve(new Response("different"));

    await expect(pending).rejects.toBeInstanceOf(AssetIntegrityError);
  });

  it("checks a final URL against the origin policy selected before the request", async () => {
    const response = pendingResponse();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const allowedOrigins = ["https://assets.test"];
    const pending = fetchBytes("https://assets.test/model.bin", undefined, undefined, { allowedOrigins });
    allowedOrigins.push("https://other.test");
    const redirected = new Response("data");
    Object.defineProperty(redirected, "redirected", { value: true });
    Object.defineProperty(redirected, "url", { value: "https://other.test/model.bin" });
    response.resolve(redirected);

    await expect(pending).rejects.toBeInstanceOf(AssetPolicyError);
  });
});

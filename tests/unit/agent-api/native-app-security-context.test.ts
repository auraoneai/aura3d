import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadContext, requestIdentityDetails } from "../../../packages/assets/src";
import { productionEnvironmentRequest } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import { snapshotAuraAssetsOption } from "../../../packages/engine/src/agent-api/app/assetsOptionSnapshot";

afterEach(() => vi.unstubAllGlobals());

describe("app authentication generation and asset policy", () => {
  it("overrides an environment asset generation while preserving its integrity and dependency policy", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const digest = "a".repeat(64);
    const asset: AuraAssetRef<"texture"> = defineAuraAssets({
      sky: {
        type: "texture", format: "hdr",
        url: "https://assets.example/sky.hdr", hash: digest,
        request: { securityContext: "asset-session", credentials: "include", allowedOrigins: ["https://assets.example"], maxBytes: 4096 }
      }
    }).sky;
    const app = snapshotAuraAssetsOption({ securityContext: "account-a-session-1" });
    const request = productionEnvironmentRequest(asset, { securityContext: app?.securityContext });
    expect(request).toMatchObject({
      securityContext: "account-a-session-1", credentials: "include", maxBytes: 4096,
      allowedOrigins: ["https://assets.example"], integrity: { version: 1, digest }, expectedUrl: asset.url
    });
    expect(asset.request?.securityContext).toBe("asset-session");
    const child = new LoadContext({ ...request, documentUrl: asset.url }).requestOptionsFor("https://assets.example/child.bin");
    expect(child.securityContext).toBe("account-a-session-1");

    const same = await requestIdentityDetails(request, asset.url);
    const rotated = await requestIdentityDetails({ ...request, securityContext: "account-b-session-2" }, asset.url);
    expect(same.reusable).toBe(true);
    expect(rotated.reusable).toBe(true);
    expect(rotated.key).not.toBe(same.key);
    expect(same.key).not.toContain("account-a-session-1");
  });

  it("retains an asset-specific generation when the app supplies none", () => {
    const asset = {
      kind: "aura-asset-ref", type: "texture", id: "sky", format: "hdr", url: "/sky.hdr",
      request: { securityContext: "asset-session" }
    } as AuraAssetRef<"texture">;
    expect(productionEnvironmentRequest(asset).securityContext).toBe("asset-session");
  });

  it("does not share default credential-capable environment requests without a generation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const request = productionEnvironmentRequest("/sky.hdr");
    const first = await requestIdentityDetails(request, "/sky.hdr");
    const second = await requestIdentityDetails(request, "/sky.hdr");
    expect([first.reusable, second.reusable]).toEqual([false, false]);
    expect(first.key).not.toBe(second.key);
  });
});

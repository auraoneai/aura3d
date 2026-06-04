import { describe, expect, it } from "vitest";
import { isAutoPullable } from "@aura3d/asset-index";
import type { AdapterContext } from "@aura3d/asset-index";
import { createMarketplaceDeepLinkAdapter } from "../../../packages/asset-index/src/adapters/marketplace.js";

/**
 * The marketplace adapter is discovery-only: it must perform NO network I/O and
 * must never produce an auto-pullable candidate. It just builds per-site free
 * GLB/glTF search-results deep links for a human to evaluate and license.
 */

// A context whose fetchJson throws — proves the adapter never touches the network.
const NO_NETWORK_CTX: AdapterContext = {
  fetchJson: async () => {
    throw new Error("marketplace adapter must not perform network I/O");
  },
};

describe("marketplace deep-link adapter", () => {
  it("identifies itself as the marketplace source", () => {
    const adapter = createMarketplaceDeepLinkAdapter();
    expect(adapter.id).toBe("marketplace");
  });

  it("returns one deep-link-only, non-auto-pullable candidate per site", async () => {
    const adapter = createMarketplaceDeepLinkAdapter();
    const results = await adapter.search({ text: "robot" }, NO_NETWORK_CTX);

    expect(results).toHaveLength(3);
    for (const asset of results) {
      expect(asset.source).toBe("marketplace");
      expect(asset.access).toBe("deep-link-only");
      // UNVERIFIED license -> not redistributable, not verified.
      expect(asset.license.spdx).toBe("UNVERIFIED");
      expect(asset.license.verified).toBe(false);
      expect(asset.license.redistributable).toBe(false);
      // The core guarantee: never auto-pullable.
      expect(isAutoPullable(asset)).toBe(false);
      // sourcePage mirrors the deep-link url.
      expect(asset.sourcePage).toBe(asset.url);
      expect(asset.format).toBe("glb");
    }
  });

  it("builds the correct verified per-site free GLB/glTF search URLs", async () => {
    const adapter = createMarketplaceDeepLinkAdapter();
    const results = await adapter.search({ text: "robot" }, NO_NETWORK_CTX);
    const byId = new Map(results.map((a) => [a.id, a]));

    const cgtrader = byId.get("marketplace:cgtrader");
    const turbosquid = byId.get("marketplace:turbosquid");
    const free3d = byId.get("marketplace:free3d");

    expect(cgtrader?.url).toBe(
      "https://www.cgtrader.com/3d-models/ext/glb?keywords=robot&price_max=0",
    );
    expect(turbosquid?.url).toBe(
      "https://www.turbosquid.com/Search/3D-Models/free/gltf/robot",
    );
    expect(free3d?.url).toBe("https://free3d.com/3d-models/robot");

    expect(cgtrader?.title).toBe("Search CGTrader for 'robot' (free GLB filter)");
    expect(turbosquid?.title).toBe("Search TurboSquid for 'robot' (free GLB filter)");
    expect(free3d?.title).toBe("Search Free3D for 'robot' (free GLB filter)");
  });

  it("joins multi-term queries per site convention (csv vs slug)", async () => {
    const adapter = createMarketplaceDeepLinkAdapter();
    const results = await adapter.search(
      { text: "battle-worn knight helmet" },
      NO_NETWORK_CTX,
    );
    const byId = new Map(results.map((a) => [a.id, a]));

    // CGTrader keyword param is comma-separated (URL-encoded comma).
    expect(byId.get("marketplace:cgtrader")?.url).toBe(
      "https://www.cgtrader.com/3d-models/ext/glb?keywords=battle%2Cworn%2Cknight%2Chelmet&price_max=0",
    );
    // TurboSquid / Free3D use a hyphen slug path segment.
    expect(byId.get("marketplace:turbosquid")?.url).toBe(
      "https://www.turbosquid.com/Search/3D-Models/free/gltf/battle-worn-knight-helmet",
    );
    expect(byId.get("marketplace:free3d")?.url).toBe(
      "https://free3d.com/3d-models/battle-worn-knight-helmet",
    );

    // tags are the tokenized query terms.
    expect(byId.get("marketplace:free3d")?.tags).toEqual([
      "battle",
      "worn",
      "knight",
      "helmet",
    ]);
  });

  it("returns nothing for an empty or whitespace query", async () => {
    const adapter = createMarketplaceDeepLinkAdapter();
    expect(await adapter.search({ text: "" }, NO_NETWORK_CTX)).toEqual([]);
    expect(await adapter.search({ text: "   " }, NO_NETWORK_CTX)).toEqual([]);
  });
});
